"""Parametric massing: a believable building from as few facts as possible.

Every input in project.json is optional (they are not in the shared schema yet, so all checks live here):

- ``footprint``: ring of ``[lng, lat]`` points, the site or building outline (e.g. from OpenStreetMap,
  saved into project.json ahead of time; nothing is looked up at build time)
- ``grossAreaSqFt`` or ``grossAreaM2``: total floor area over all floors
- ``floors`` and/or ``heightM``: with only one, the other comes from ``floorHeightM`` (default 3.05 m).
  ``heightM`` is treated as a cap ("up to 60 ft").
- ``typology``: ``"block"`` (default), ``"bar"``, ``"courtyard"`` (wings around a central quad) or ``"tower"``
  (a slim oblong tower standing on a podium that fills the outline)
- ``podiumFloors``: tower only, floors in the base (default 3). Podium floors are 1.4x as tall as tower floors.
- ``towerPlateM2``: tower only, floor plate of the tower (default 55% of the outline)
- ``facades``: ``{"north": {"material": "brick", "glass": 0.4}, ...}`` (``glass`` is 0 to 1)
- ``core``: tower only, ``{"material": "charcoal"}`` colors a service core at one end of the tower

The shape is inferred: plate area = gross area / floors, then the outline is shrunk (block, bar) or hollowed
into wings around a quad (courtyard) until it holds that area. ``provenance`` records which values were given
and which were inferred, so a client can see what the model assumes.

Coordinates follow the contract: meters, +Y up, +X east, -Z north, origin at the footprint center on the ground.
"""

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import MultiPolygon, Polygon, box
from shapely.geometry.base import BaseGeometry
from shapely.validation import make_valid

from .contract import BoundingBox, Side

METERS_PER_DEG_LAT = 110_574.0
METERS_PER_DEG_LNG_AT_EQUATOR = 111_320.0
SQFT_TO_M2 = 0.09290304
DEFAULT_FLOOR_HEIGHT_M = 3.05
WING_DEPTH_RANGE_M = (10.0, 20.0)  # typical depth of a residential wing
DEFAULT_WING_DEPTH_M = 15.0
TOP_FLOOR_INSET_M = 1.5  # stands in for "canted upper levels"
TYPOLOGIES = ("block", "bar", "courtyard", "tower")
DEFAULT_PODIUM_FLOORS = 3
PODIUM_FLOOR_RATIO = 1.4  # dining and common floors are taller than bedroom floors
DEFAULT_TOWER_PLATE_SHARE = 0.55  # tower plate as a share of the outline when no plate area is given
TOWER_ASPECT_RANGE = (2.0, 3.5)  # an oblong slab, not a square
PENTHOUSE_HEIGHT_M = 5.0  # rooftop mechanical level, within the height cap
PENTHOUSE_INSET_M = 4.0
CORE_SHARE = 0.18  # the service core takes one end of the tower

_MATERIAL_COLORS: dict[str, tuple[int, int, int]] = {
    "brick": (160, 82, 60),
    "terracotta": (190, 105, 70),
    "stone": (186, 178, 165),
    "metal": (150, 156, 162),
    "timber": (176, 134, 90),
    "charcoal": (58, 58, 62),
    "tile": (228, 228, 224),
    "concrete": (176, 174, 170),
}
_DEFAULT_COLOR = (170, 170, 170)
_GLASS_COLOR = (110, 150, 190)
_ROOF_COLOR = (90, 94, 100)
_MASSING_KEYS = ("footprint", "floors", "floorHeightM", "heightM", "grossAreaSqFt", "grossAreaM2", "typology")


@dataclass(frozen=True)
class MassingSpec:
    footprint: list[tuple[float, float]] | None  # [lng, lat] ring
    floors: int
    floor_height_m: float
    height_m: float
    gross_area_m2: float | None
    typology: str
    facades: dict[str, dict[str, Any]]
    provenance: dict[str, str] = field(default_factory=dict)
    podium_floors: int = 0
    tower_plate_m2: float | None = None
    core: dict[str, Any] | None = None


def _number(project: dict[str, Any], key: str, *, whole: bool = False) -> float | None:
    value = project.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        raise ValueError(f"{key} must be a number above 0")
    if whole and (not isinstance(value, int) or value < 1):
        raise ValueError(f"{key} must be a whole number of at least 1")
    return float(value)


def parse_spec(project: dict[str, Any]) -> MassingSpec | None:
    """Return the massing inputs, or None when project.json has none of them (the gray box is used)."""
    if all(project.get(k) is None for k in _MASSING_KEYS):
        return None
    provenance: dict[str, str] = {}

    floors = _number(project, "floors", whole=True)
    height_cap = _number(project, "heightM")
    floor_height = _number(project, "floorHeightM")
    if floors is None and height_cap is None:
        raise ValueError("project.json needs floors or heightM")
    if floor_height is None:
        floor_height = DEFAULT_FLOOR_HEIGHT_M
        provenance["floorHeightM"] = "inferred (default)"
    else:
        provenance["floorHeightM"] = "given"
    if floors is None:
        floors = max(1, math.floor(height_cap / floor_height))  # type: ignore[operator]
        provenance["floors"] = "inferred from heightM"
    else:
        provenance["floors"] = "given"
    height = floors * floor_height
    if height_cap is not None and height > height_cap:
        floor_height, height = height_cap / floors, height_cap
        provenance["floorHeightM"] = "inferred (heightM / floors)"
    provenance["heightM"] = "given (cap)" if height_cap is not None else "inferred (floors x floorHeightM)"

    gross = _number(project, "grossAreaM2")
    if gross is None and (sqft := _number(project, "grossAreaSqFt")) is not None:
        gross = sqft * SQFT_TO_M2
    if gross is not None:
        provenance["grossArea"] = "given"

    ring = None
    if project.get("footprint") is not None:
        try:
            ring = [(float(lng), float(lat)) for lng, lat in project["footprint"]]
        except (TypeError, ValueError) as exc:
            raise ValueError("footprint must be a list of [lng, lat] points") from exc
        if len(ring) < 3:
            raise ValueError("footprint needs at least 3 points")
        provenance["footprint"] = "given (outline)"
    if ring is None and gross is None:
        raise ValueError("project.json needs a footprint or a gross area to size the building")

    typology = project.get("typology", "block")
    if typology not in TYPOLOGIES:
        raise ValueError(f"typology must be one of {', '.join(TYPOLOGIES)}")
    provenance["typology"] = "given" if "typology" in project else "inferred (default block)"

    facades = project.get("facades")
    if facades is None:
        facades = {}
    if not isinstance(facades, dict):
        raise ValueError("facades must be an object keyed by side")

    podium_floors, tower_plate, core = 0, None, None
    if typology == "tower":
        podium = _number(project, "podiumFloors", whole=True)
        if podium is None:
            podium_floors = min(DEFAULT_PODIUM_FLOORS, int(floors) - 1)
            provenance["podiumFloors"] = f"inferred (default {DEFAULT_PODIUM_FLOORS})"
        else:
            if podium >= floors:
                raise ValueError("podiumFloors must be fewer than floors")
            podium_floors = int(podium)
            provenance["podiumFloors"] = "given"
        tower_plate = _number(project, "towerPlateM2")
        provenance["towerPlateM2"] = "given" if tower_plate else f"inferred ({DEFAULT_TOWER_PLATE_SHARE:.0%} of outline)"
        core = project.get("core")
        if core is not None and not isinstance(core, dict):
            raise ValueError("core must be an object such as {\"material\": \"charcoal\"}")
        # The height cap covers the rooftop plant too; podium floors are taller than bedroom floors.
        tower_floors = int(floors) - podium_floors
        if height_cap is not None:
            usable = height_cap - PENTHOUSE_HEIGHT_M
            floor_height = usable / (podium_floors * PODIUM_FLOOR_RATIO + tower_floors)
            provenance["floorHeightM"] = f"inferred ({floor_height:.2f} tower, {floor_height * PODIUM_FLOOR_RATIO:.2f} podium, from heightM less a {PENTHOUSE_HEIGHT_M:.0f} m rooftop plant)"
            height = height_cap
        else:
            height = floor_height * (podium_floors * PODIUM_FLOOR_RATIO + tower_floors) + PENTHOUSE_HEIGHT_M
            provenance["heightM"] = "inferred (floors x floorHeightM + rooftop plant)"
    return MassingSpec(ring, int(floors), float(floor_height), float(height), gross, typology, facades, provenance,
                       podium_floors, tower_plate, core)


def _largest_polygon(geom: BaseGeometry) -> Polygon:
    if isinstance(geom, Polygon):
        return geom
    polygons = [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]
    return max(polygons, key=lambda g: g.area, default=Polygon())


def _local_outline(ring: list[tuple[float, float]]) -> Polygon:
    """Project the ring to meters (x east, y north) and center it on its centroid."""
    lng0 = sum(p[0] for p in ring) / len(ring)
    lat0 = sum(p[1] for p in ring) / len(ring)
    per_lng = METERS_PER_DEG_LNG_AT_EQUATOR * math.cos(math.radians(lat0))
    polygon = Polygon([((lng - lng0) * per_lng, (lat - lat0) * METERS_PER_DEG_LAT) for lng, lat in ring])
    if not polygon.is_valid:
        polygon = _largest_polygon(make_valid(polygon))
    if polygon.is_empty or polygon.area < 1.0:
        raise ValueError("footprint has no usable area")
    c = polygon.centroid
    return affinity.translate(polygon, -c.x, -c.y)


def _ring_of(outline: Polygon, depth: float) -> BaseGeometry:
    return outline.difference(outline.buffer(-depth, join_style="mitre"))


def _solve_wing_depth(outline: Polygon, target: float) -> float:
    """Wing depth whose ring (outline minus inset) holds ``target`` m², by bisection."""
    lo, hi = 0.0, math.sqrt(outline.area)
    for _ in range(60):
        mid = (lo + hi) / 2
        if _ring_of(outline, mid).area < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def infer_plate(spec: MassingSpec) -> tuple[BaseGeometry, dict[str, str]]:
    """The floor plate in local meters (x east, y north), centered near the origin."""
    notes: dict[str, str] = {}
    target = spec.gross_area_m2 / spec.floors if spec.gross_area_m2 else None
    if target:
        notes["plateAreaM2"] = f"{target:.0f} (inferred: gross area / floors)"

    if spec.footprint is not None:
        outline = _local_outline(spec.footprint)
        if spec.typology == "courtyard":
            if target is None:
                depth = DEFAULT_WING_DEPTH_M
                notes["wingDepthM"] = f"{depth:.1f} (inferred default)"
            elif outline.area <= target:
                notes["wingDepthM"] = "none (outline too small for a quad; solid)"
                return outline, notes
            else:
                solved = _solve_wing_depth(outline, target)
                depth = min(max(solved, WING_DEPTH_RANGE_M[0]), WING_DEPTH_RANGE_M[1])
                notes["wingDepthM"] = f"{depth:.1f} (inferred from plate area; solved {solved:.1f})"
            ring = _ring_of(outline, depth)
            if target and abs(ring.area - target) > 0.05 * target:
                avg = spec.gross_area_m2 / ring.area  # type: ignore[operator]
                notes["plateAreaM2"] += f"; built {ring.area:.0f}, implies {avg:.1f} average floors"
            return ring, notes
        if target and outline.area > target:
            factor = math.sqrt(target / outline.area)
            notes["outlineScale"] = f"{factor:.2f} (outline shrunk to plate area)"
            return affinity.scale(outline, factor, factor, origin=(0, 0)), notes
        return outline, notes

    assert target is not None  # parse_spec guarantees an area when there is no footprint
    notes["footprint"] = f"inferred ({spec.typology} of plate area)"
    if spec.typology == "bar":
        w = math.sqrt(target / 3)
        return box(-1.5 * w, -w / 2, 1.5 * w, w / 2), notes
    if spec.typology == "courtyard":
        d = DEFAULT_WING_DEPTH_M
        if target > 4 * d * d:
            s = target / (4 * d) + d  # outer side of a square ring of depth d
            notes["wingDepthM"] = f"{d:.1f} (inferred default)"
            return box(-s / 2, -s / 2, s / 2, s / 2).difference(box(-s / 2 + d, -s / 2 + d, s / 2 - d, s / 2 - d)), notes
    s = math.sqrt(target)
    return box(-s / 2, -s / 2, s / 2, s / 2), notes


def _long_axis_angle(outline: Polygon) -> float:
    """Direction (degrees) of the longest edge of the outline's minimum rotated rectangle."""
    pts = list(outline.minimum_rotated_rectangle.exterior.coords)
    edges = [(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    (x0, y0), (x1, y1) = max(edges, key=lambda e: math.dist(*e))
    return math.degrees(math.atan2(y1 - y0, x1 - x0))


def _deepest_point(outline: Polygon) -> tuple[float, float]:
    """A point well inside the outline (where an inset shrinks it to almost nothing), so the tower stands clear of edges."""
    lo, hi = 0.0, math.sqrt(outline.area)
    for _ in range(40):
        mid = (lo + hi) / 2
        if outline.buffer(-mid).is_empty:
            hi = mid
        else:
            lo = mid
    p = outline.buffer(-lo * 0.95).representative_point()
    return p.x, p.y


def infer_tower(outline: Polygon, spec: MassingSpec) -> tuple[Polygon, Polygon | None, dict[str, str]]:
    """The tower plate (an oblong slab inside the outline) and its service core, if any."""
    notes: dict[str, str] = {}
    target = spec.tower_plate_m2 or outline.area * DEFAULT_TOWER_PLATE_SHARE
    target = min(target, outline.area * 0.9)
    # Oblong: as long as the plot allows, within the slab range.
    mrr = outline.minimum_rotated_rectangle
    pts = list(mrr.exterior.coords)
    long_side = max(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
    aspect = min(max(0.8 * long_side / math.sqrt(target), TOWER_ASPECT_RANGE[0]), TOWER_ASPECT_RANGE[1])
    w = math.sqrt(target / aspect)
    length = w * aspect
    angle = _long_axis_angle(outline)
    cx, cy = _deepest_point(outline)
    slab = affinity.rotate(box(-length / 2, -w / 2, length / 2, w / 2), angle, origin=(0, 0))
    slab = affinity.translate(slab, cx, cy)
    clipped = slab.intersection(outline)
    plate = _largest_polygon(clipped) if clipped.area >= 0.85 * target else slab
    notes["towerPlate"] = f"{plate.area:.0f} m², {length:.0f} x {w:.0f} m slab along the plot's long axis ({angle:.0f}°)"

    core = None
    if spec.core is not None:
        # The core sits at the end of the slab that faces into the plot (away from the street edge).
        half = length / 2
        ends = []
        for sign in (-1, 1):
            strip = box(sign * half - (CORE_SHARE * length if sign > 0 else 0), -w / 2,
                        sign * half + (CORE_SHARE * length if sign < 0 else 0), w / 2)
            strip = affinity.translate(affinity.rotate(strip, angle, origin=(0, 0)), cx, cy)
            ends.append(strip)
        oc = outline.centroid
        core = min(ends, key=lambda s: s.centroid.distance(oc)).intersection(plate)
        core = _largest_polygon(core)
        notes["core"] = f"{core.area:.0f} m² at the inner end of the slab (inferred position)"
    return plate, core, notes


def _polygons(geom: BaseGeometry) -> list[Polygon]:
    if isinstance(geom, Polygon):
        return [geom] if not geom.is_empty else []
    if isinstance(geom, MultiPolygon):
        return [g for g in geom.geoms if not g.is_empty]
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon) and not g.is_empty]


def _extrude(geom: BaseGeometry, height: float, base: float = 0.0) -> list[trimesh.Trimesh]:
    meshes = []
    for poly in _polygons(geom):
        if poly.area < 1.0:
            continue
        mesh = trimesh.creation.extrude_polygon(poly, height)
        mesh.apply_translation((0, 0, base))
        meshes.append(mesh)
    return meshes


def _side_of_normal(nx: float, nz: float) -> Side:
    """Which side a wall faces. In glTF space north is -Z and east is +X."""
    if abs(nx) > abs(nz):
        return "east" if nx > 0 else "west"
    return "south" if nz > 0 else "north"


def _facade_color(info: dict[str, Any] | None) -> tuple[int, int, int]:
    info = info or {}
    base = _MATERIAL_COLORS.get(str(info.get("material", "")).lower(), _DEFAULT_COLOR)
    glass = min(max(float(info.get("glass", 0.0)), 0.0), 1.0)
    return tuple(round(b * (1 - glass) + g * glass) for b, g in zip(base, _GLASS_COLOR))  # type: ignore[return-value]


_TO_GLTF = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], dtype=float)


def _paint(mesh: trimesh.Trimesh, facades: dict[str, dict[str, Any]], wall: dict[str, Any] | None = None) -> trimesh.Trimesh:
    """Color each face by what it is: roof, underside, or a wall of a given side (or one material for every wall)."""
    # extrude_polygon builds (x east, y north, z up); glTF wants (x east, y up, z = -north). A proper rotation.
    mesh.apply_transform(_TO_GLTF)
    mesh.unmerge_vertices()  # one color per face needs faces that share no vertices
    colors = np.empty((len(mesh.faces), 4), dtype=np.uint8)
    for i, normal in enumerate(mesh.face_normals):
        if normal[1] > 0.5:
            rgb = _ROOF_COLOR
        elif normal[1] < -0.5:
            rgb = _DEFAULT_COLOR
        elif wall is not None:
            rgb = _facade_color(wall)
        else:
            rgb = _facade_color(facades.get(_side_of_normal(normal[0], normal[2])))
        colors[i] = (*rgb, 255)
    # After unmerge_vertices face i owns vertices 3i..3i+2, so repeating each face color 3 times gives vertex
    # colors (setting them directly avoids trimesh's face-to-vertex conversion, which needs scipy).
    mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=np.repeat(colors, 3, axis=0))
    return mesh


def build_massing(spec: MassingSpec) -> tuple[bytes, BoundingBox, dict[str, str]]:
    """Build the massing. Returns (GLB bytes, bounding box, provenance)."""
    plate, notes = infer_plate(spec)
    provenance = {**spec.provenance, **notes}

    parts: list[trimesh.Trimesh] = []  # already painted
    if spec.typology == "tower":
        outline = _largest_polygon(plate)
        podium_h = spec.podium_floors * spec.floor_height_m * PODIUM_FLOOR_RATIO
        roof_h = spec.height_m - PENTHOUSE_HEIGHT_M  # main roof; the plant goes to the cap
        tower, core, tnotes = infer_tower(outline, spec)
        provenance.update(tnotes)
        podium_wall = spec.facades.get("podium")
        for m in _extrude(outline, podium_h):
            parts.append(_paint(m, spec.facades, podium_wall))
        body = tower.difference(core) if core is not None else tower
        for m in _extrude(body, roof_h - podium_h, base=podium_h):
            parts.append(_paint(m, spec.facades))
        plant = body.buffer(-PENTHOUSE_INSET_M, join_style="mitre")
        for m in _extrude(plant, PENTHOUSE_HEIGHT_M, base=roof_h):
            parts.append(_paint(m, spec.facades, {"material": "metal"}))
        if core is not None:
            for m in _extrude(core, spec.height_m - podium_h, base=podium_h):  # the core runs up past the roof
                parts.append(_paint(m, spec.facades, spec.core))
        provenance["podium"] = f"{spec.podium_floors} floors, {podium_h:.1f} m, fills the outline"
        provenance["rooftopPlant"] = f"{PENTHOUSE_HEIGHT_M:.0f} m, inset {PENTHOUSE_INSET_M:.0f} m (inferred)"
    elif spec.typology == "courtyard" and spec.floors >= 4:
        lower = spec.floor_height_m * (spec.floors - 1)
        meshes = _extrude(plate, lower)
        top = plate.buffer(-TOP_FLOOR_INSET_M, join_style="mitre")
        meshes += _extrude(top, spec.height_m - lower, base=lower) or _extrude(plate, spec.height_m - lower, base=lower)
        provenance["topFloor"] = f"inset {TOP_FLOOR_INSET_M} m (stands in for canted upper levels)"
        parts += [_paint(m, spec.facades) for m in meshes]
    else:
        parts += [_paint(m, spec.facades) for m in _extrude(plate, spec.height_m)]
    if not parts:
        raise ValueError("footprint has no usable area")
    mesh = trimesh.util.concatenate(parts)

    glb = trimesh.Scene(mesh).export(file_type="glb")
    lo, hi = mesh.bounds
    bbox = BoundingBox(min=tuple(round(float(v), 3) for v in lo), max=tuple(round(float(v), 3) for v in hi))  # type: ignore[arg-type]
    return glb, bbox, provenance
