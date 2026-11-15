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
import random
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Polygon, box
from shapely.geometry.polygon import orient
from trimesh.visual.material import PBRMaterial
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
LOUNGE_STRIP_M = 1.7  # a stack of glass lounges past the core, at the very end of the slab
CROWN_OVERHANG_M = 1.2  # a thin roof canopy over a glassy top floor
CROWN_CANOPY_M = 0.8

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
    tower_footprint: list[tuple[float, float]] | None = None  # [lng, lat] ring of the tower, inside the footprint
    crown: bool = False
    context: list[dict[str, Any]] = field(default_factory=list)  # neighbors: {"footprint": ring, "heightM": n}
    streets: list[dict[str, Any]] = field(default_factory=list)  # {"line": [[lng, lat], ...], "widthM": n}


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

    podium_floors, tower_plate, core, tower_ring, crown = 0, None, None, None, False
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
        if core is not None and core.get("side") not in (None, "north", "south", "east", "west"):
            raise ValueError("core.side must be north, south, east or west")
        if project.get("towerFootprint") is not None:
            if ring is None:
                raise ValueError("towerFootprint needs a footprint")
            try:
                tower_ring = [(float(lng), float(lat)) for lng, lat in project["towerFootprint"]]
            except (TypeError, ValueError) as exc:
                raise ValueError("towerFootprint must be a list of [lng, lat] points") from exc
            if len(tower_ring) < 3:
                raise ValueError("towerFootprint needs at least 3 points")
            provenance["towerPlateM2"] = "given (towerFootprint)"
        else:
            tower_ring = None
        crown = bool(project.get("crown", False))
        # The height cap covers the rooftop plant too; podium floors are taller than bedroom floors.
        tower_floors = int(floors) - podium_floors
        if height_cap is not None and height_cap < PENTHOUSE_HEIGHT_M + 2.5 * floors:
            raise ValueError(f"heightM {height_cap} is too low for {int(floors)} floors plus a rooftop level")
        if height_cap is not None:
            usable = height_cap - PENTHOUSE_HEIGHT_M
            floor_height = usable / (podium_floors * PODIUM_FLOOR_RATIO + tower_floors)
            provenance["floorHeightM"] = f"inferred ({floor_height:.2f} tower, {floor_height * PODIUM_FLOOR_RATIO:.2f} podium, from heightM less a {PENTHOUSE_HEIGHT_M:.0f} m rooftop plant)"
            height = height_cap
        else:
            height = floor_height * (podium_floors * PODIUM_FLOOR_RATIO + tower_floors) + PENTHOUSE_HEIGHT_M
            provenance["heightM"] = "inferred (floors x floorHeightM + rooftop plant)"
    context = project.get("context") or []
    streets = project.get("streets") or []
    if not isinstance(context, list) or not all(isinstance(c, dict) and c.get("footprint") for c in context):
        raise ValueError("context must be a list of {footprint, heightM}")
    if not isinstance(streets, list) or not all(isinstance(s, dict) and s.get("line") for s in streets):
        raise ValueError("streets must be a list of {line, widthM}")
    if (context or streets) and ring is None:
        raise ValueError("context and streets need a footprint to place them")
    return MassingSpec(ring, int(floors), float(floor_height), float(height), gross, typology, facades, provenance,
                       podium_floors, tower_plate, core, tower_ring, crown, context, streets)


def _largest_polygon(geom: BaseGeometry) -> Polygon:
    if isinstance(geom, Polygon):
        return geom
    polygons = [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]
    return max(polygons, key=lambda g: g.area, default=Polygon())


def _local_outline(ring: list[tuple[float, float]], frame: list[tuple[float, float]] | None = None) -> Polygon:
    """Project the ring to meters (x east, y north), centered on the centroid of ``frame`` (default: the ring itself).

    Passing the site footprint as ``frame`` puts a second ring (e.g. the tower) in the same coordinates as the site.
    """
    to_local = _local_frame(frame or ring)
    polygon = Polygon(to_local(ring))
    if not polygon.is_valid:
        polygon = _largest_polygon(make_valid(polygon))
    if polygon.is_empty or polygon.area < 1.0:
        raise ValueError("footprint has no usable area")
    return polygon


def _local_frame(frame: list[tuple[float, float]]):
    """A function mapping [lng, lat] points to local meters (x east, y north) centered on ``frame``'s centroid."""
    lng0 = sum(p[0] for p in frame) / len(frame)
    lat0 = sum(p[1] for p in frame) / len(frame)
    per_lng = METERS_PER_DEG_LNG_AT_EQUATOR * math.cos(math.radians(lat0))

    def raw(points):
        return [((float(lng) - lng0) * per_lng, (float(lat) - lat0) * METERS_PER_DEG_LAT) for lng, lat in points]

    base = Polygon(raw(frame))
    if not base.is_valid:
        base = _largest_polygon(make_valid(base))
    c = base.centroid if not base.is_empty else Polygon(raw(frame)).envelope.centroid
    return lambda points: [(x - c.x, y - c.y) for x, y in raw(points)]


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
        if target and outline.area > target and spec.typology != "tower":  # a tower's lot holds its base too
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
    if spec.tower_footprint is not None:
        plate = _local_outline(spec.tower_footprint, frame=spec.footprint)
        outside = plate.difference(outline).area
        if outside > 0.1 * plate.area:
            raise ValueError(f"towerFootprint is {outside / plate.area:.0%} outside the footprint; it must sit on the lot")
        angle = _long_axis_angle(plate)
        notes["towerPlate"] = f"{plate.area:.0f} m², from towerFootprint (long axis {angle:.0f}°)"
    else:
        target = spec.tower_plate_m2 or outline.area * DEFAULT_TOWER_PLATE_SHARE
        target = min(target, outline.area * 0.9)
        # Oblong: as long as the plot allows, within the slab range.
        pts = list(outline.minimum_rotated_rectangle.exterior.coords)
        long_side = max(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
        aspect = min(max(0.8 * long_side / math.sqrt(target), TOWER_ASPECT_RANGE[0]), TOWER_ASPECT_RANGE[1])
        w = math.sqrt(target / aspect)
        length = w * aspect
        angle = _long_axis_angle(outline)
        cx, cy = _deepest_point(outline)
        slab = affinity.translate(affinity.rotate(box(-length / 2, -w / 2, length / 2, w / 2), angle, origin=(0, 0)), cx, cy)
        plate = _largest_polygon(slab.intersection(outline))  # never spill off the lot, even if the plate shrinks
        if plate.area < 1.0:
            raise ValueError("the lot is too small or thin for a tower")
        notes["towerPlate"] = f"{plate.area:.0f} m², {length:.0f} x {w:.0f} m slab along the plot's long axis ({angle:.0f}°)"
        if plate.area < 0.85 * target:
            notes["towerPlate"] += f"; clipped to the lot from {target:.0f} m²"

    core = None
    if spec.core is not None:
        # Work in the slab's own frame: long axis along x.
        c = plate.centroid
        flat = affinity.rotate(plate, -angle, origin=c)
        minx, miny, maxx, maxy = flat.bounds
        length = maxx - minx
        core_len = float(spec.core.get("share", CORE_SHARE)) * length
        lounge = float(spec.core.get("loungeM", LOUNGE_STRIP_M))
        ends = {
            -1: box(minx + lounge, miny, minx + lounge + core_len, maxy),
            1: box(maxx - lounge - core_len, miny, maxx - lounge, maxy),
        }
        placed = {k: affinity.rotate(v, angle, origin=c) for k, v in ends.items()}
        side = spec.core.get("side")
        if side:
            axis, sign = {"east": (0, 1), "west": (0, -1), "north": (1, 1), "south": (1, -1)}[side]
            key = max(placed, key=lambda k: sign * placed[k].centroid.coords[0][axis])
            notes["core"] = f"{side} end of the slab (given), {core_len:.1f} m long, {lounge} m glass lounge strip beyond it"
        else:
            oc = outline.centroid
            key = min(placed, key=lambda k: placed[k].centroid.distance(oc))
            notes["core"] = "inner end of the slab (inferred position)"
        core = _largest_polygon(placed[key].intersection(plate))
    return plate, core, notes


def _polygons(geom: BaseGeometry) -> list[Polygon]:
    if isinstance(geom, Polygon):
        return [geom] if not geom.is_empty else []
    if isinstance(geom, MultiPolygon):
        return [g for g in geom.geoms if not g.is_empty]
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon) and not g.is_empty]


def _extrude(geom: BaseGeometry, height: float, base: float = 0.0, min_area: float = 1.0) -> list[trimesh.Trimesh]:
    meshes = []
    for poly in _polygons(geom):
        if poly.area < min_area or height <= 0:
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

    if spec.typology == "tower":
        return _build_tower(spec, _largest_polygon(plate), provenance)

    parts: list[trimesh.Trimesh] = []  # already painted
    if spec.typology == "courtyard" and spec.floors >= 4:
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


# --- Tower typology: named parts with real materials, facade detail and surrounding context ---

# glTF base colors are linear RGB (0-255 here); a linear 200 shows as near-white, 16 as charcoal.
_PBR: dict[str, dict[str, Any]] = {
    "glass": {"color": (18, 28, 40), "metallic": 0.6, "roughness": 0.12},
    "tile": {"color": (205, 205, 198), "metallic": 0.0, "roughness": 0.6},
    "charcoal": {"color": (16, 16, 18), "metallic": 0.0, "roughness": 0.9},
    "brick": {"color": (95, 35, 22), "metallic": 0.0, "roughness": 0.9},
    "terracotta": {"color": (130, 50, 28), "metallic": 0.0, "roughness": 0.85},
    "stone": {"color": (130, 122, 108), "metallic": 0.0, "roughness": 0.85},
    "concrete": {"color": (110, 108, 104), "metallic": 0.0, "roughness": 0.85},
    "metal": {"color": (60, 64, 70), "metallic": 0.7, "roughness": 0.35},
    "timber": {"color": (110, 70, 38), "metallic": 0.0, "roughness": 0.8},
    "roof": {"color": (40, 42, 45), "metallic": 0.0, "roughness": 0.95},
    "sign": {"color": (255, 255, 255), "metallic": 0.0, "roughness": 0.5, "emissive": (255, 255, 255)},
    "context": {"color": (30, 32, 36), "metallic": 0.0, "roughness": 0.95},  # dim, so the subject stands out
    "street": {"color": (14, 15, 16), "metallic": 0.0, "roughness": 1.0},
}
FIN_SPACING_M = 2.2  # white tile fins on a curtain wall, from the photos' rhythm
FIN_WIDTH_M = 0.55
FIN_DEPTH_M = 0.3
BAND_DEPTH_M = 0.18  # floor-line band proud of the glass
BAND_HEIGHT_M = 0.25
PODIUM_BAND_M = 2.0  # metal band along the top of the base
SIGN_OFFSET_M = 0.12
CONTEXT_RADIUS_M = 220.0  # neighbors and streets within this distance of the lot
SUBJECT_PARTS = {"podium", "tower", "crown", "roof", "core", "sign"}


def _pbr(name: str) -> PBRMaterial:
    m = _PBR.get(name, _PBR["concrete"])
    return PBRMaterial(
        name=name,
        baseColorFactor=[*m["color"], 255],
        metallicFactor=m["metallic"],
        roughnessFactor=m["roughness"],
        emissiveFactor=[c / 255 for c in m.get("emissive", (0, 0, 0))],
    )


def _wall_material(info: dict[str, Any] | None) -> str:
    """The material a wall renders with. Mostly glass reads as glass; a tile curtain wall is glass behind fins."""
    info = info or {}
    material = str(info.get("material", "concrete")).lower()
    if float(info.get("glass", 0.0)) >= 0.7 or material == "tile":
        return "glass"
    return material if material in _PBR else "concrete"


def _side_of_plan_normal(nx: float, ny: float) -> Side:
    if abs(nx) > abs(ny):
        return "east" if nx > 0 else "west"
    return "north" if ny > 0 else "south"


class _Parts:
    """Meshes in plan coordinates (x east, y north, z up), grouped by (part, material)."""

    def __init__(self) -> None:
        self.groups: dict[tuple[str, str], list[trimesh.Trimesh]] = {}

    def add(self, part: str, material: str, meshes: list[trimesh.Trimesh]) -> None:
        if meshes:
            self.groups.setdefault((part, material), []).extend(meshes)

    def add_walls(self, part: str, meshes: list[trimesh.Trimesh], walls: dict[str, str], default: str,
                  roof: str = "roof") -> None:
        """Split an extrusion's faces: top and bottom take ``roof``; each wall takes its side's material."""
        for mesh in meshes:
            keys = np.array([
                roof if abs(n[2]) > 0.5 else walls.get(_side_of_plan_normal(n[0], n[1]), default)
                for n in mesh.face_normals
            ])
            for key in set(keys.tolist()):
                self.add(part, key, [mesh.submesh([np.nonzero(keys == key)[0]], append=True)])

    def scene(self) -> tuple[bytes, BoundingBox]:
        scene = trimesh.Scene()
        lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
        for (part, material), meshes in sorted(self.groups.items()):
            mesh = trimesh.util.concatenate(meshes)
            mesh.apply_transform(_TO_GLTF)
            mesh.visual = trimesh.visual.TextureVisuals(material=_pbr(material))
            name = f"{part}-{material}"
            scene.add_geometry(mesh, node_name=name, geom_name=name)
            if part in SUBJECT_PARTS:  # the bounding box is the building only, not its neighbors or streets
                lo, hi = np.minimum(lo, mesh.bounds[0]), np.maximum(hi, mesh.bounds[1])
        if not np.isfinite(lo).all():
            raise ValueError("footprint has no usable area")
        bbox = BoundingBox(min=tuple(round(float(v), 3) for v in lo), max=tuple(round(float(v), 3) for v in hi))  # type: ignore[arg-type]
        return scene.export(file_type="glb"), bbox


def _floor_levels(spec: MassingSpec) -> list[float]:
    """Height of each floor line from the ground up: podium floors are taller than tower floors."""
    levels, z = [0.0], 0.0
    for i in range(spec.floors):
        z += spec.floor_height_m * (PODIUM_FLOOR_RATIO if i < spec.podium_floors else 1.0)
        levels.append(z)
    return levels


def _wall_strip(a, u, n, s0: float, s1: float, depth: float) -> Polygon:
    """A thin rectangle on the outside of a wall, from s0 to s1 along the edge and ``depth`` out from it."""
    return Polygon([
        (a[0] + u[0] * s + n[0] * d, a[1] + u[1] * s + n[1] * d)
        for s, d in ((s0, 0.0), (s1, 0.0), (s1, depth), (s0, depth))
    ])


def _facade_fins(body: BaseGeometry, curtain_sides: set[str], levels: list[float], first: int, last: int,
                 notes: dict[str, str]) -> list[trimesh.Trimesh]:
    """Staggered vertical tile fins, two to five floors long, on every long curtain-wall edge."""
    fins: list[trimesh.Trimesh] = []
    # Counter-clockwise rings, so edge a->b faces out along (dy, -dx). The body can be several pieces
    # (e.g. the main slab and the lounge strip on the far side of the core).
    edges = []
    for piece in _polygons(body):
        ring = list(orient(piece, sign=1.0).exterior.coords)
        edges += list(zip(ring[:-1], ring[1:]))
    columns = 0
    for i, (a, b) in enumerate(edges):
        length = math.dist(a, b)
        if length < 8.0:
            continue
        u = ((b[0] - a[0]) / length, (b[1] - a[1]) / length)
        n = (u[1], -u[0])
        if _side_of_plan_normal(*n) not in curtain_sides:
            continue
        count = int((length - 1.6) // FIN_SPACING_M)
        start = (length - count * FIN_SPACING_M) / 2
        for c in range(count + 1):
            s = start + c * FIN_SPACING_M
            rng = random.Random(i * 1000 + c)  # deterministic: the same inputs give the same facade
            f = first + rng.randint(0, 2)
            while f < last:
                top = min(f + rng.randint(2, 5), last)
                strip = _wall_strip(a, u, n, s - FIN_WIDTH_M / 2, s + FIN_WIDTH_M / 2, FIN_DEPTH_M)
                fins += _extrude(strip, levels[top] - levels[f], base=levels[f], min_area=0.05)
                f = top + rng.randint(1, 2)
            columns += 1
    if columns:
        notes["facade"] = f"{columns} columns of staggered tile fins every {FIN_SPACING_M} m (pattern from the photos)"
    return fins


def _sign_glyph(core: Polygon, angle: float, glyph: str, top: float) -> list[trimesh.Trimesh]:
    """A lit sign near the top of the core, on both long faces: a block letter T, or a square panel otherwise."""
    c = core.centroid
    x0, y0, x1, y1 = affinity.rotate(core, -angle, origin=c).bounds
    mx, width = (x0 + x1) / 2, x1 - x0
    meshes: list[trimesh.Trimesh] = []
    for y, out in ((y1, 1), (y0, -1)):
        ya, yb = sorted((y + out * 0.02, y + out * SIGN_OFFSET_M))

        def plate(xa: float, xb: float, ya: float = ya, yb: float = yb) -> Polygon:
            return affinity.rotate(box(xa, ya, xb, yb), angle, origin=c)

        if glyph.upper() == "T":
            bar_w, bar_h, stem_w, stem_h = 0.6 * width, 1.6, 1.6, 5.0
            meshes += _extrude(plate(mx - bar_w / 2, mx + bar_w / 2), bar_h, base=top - bar_h, min_area=0.05)
            meshes += _extrude(plate(mx - stem_w / 2, mx + stem_w / 2), stem_h, base=top - bar_h - stem_h, min_area=0.05)
        else:
            side = 0.4 * width
            meshes += _extrude(plate(mx - side / 2, mx + side / 2), side, base=top - side, min_area=0.05)
    return meshes


def _context(spec: MassingSpec, outline: Polygon, parts: _Parts, notes: dict[str, str]) -> None:
    """Neighbors as plain gray blocks and streets as dark strips, placed in the site's coordinates."""
    assert spec.footprint is not None
    to_local = _local_frame(spec.footprint)
    area = outline.buffer(CONTEXT_RADIUS_M)  # keep the surroundings to a walkable block or two
    count = 0
    for item in spec.context:
        try:
            poly = _local_outline([tuple(p) for p in item["footprint"]], frame=spec.footprint)
        except (ValueError, TypeError):
            continue
        if poly.intersection(outline).area > 0.2 * poly.area or not area.contains(poly.centroid):
            continue  # the subject building itself, or too far away
        height = float(item.get("heightM") or (item.get("levels") or 0) * 3.2 or 10.0)
        parts.add_walls("context", _extrude(poly, height), {}, "context", roof="context")
        count += 1
    streets = 0
    for street in spec.streets:
        line = LineString(to_local([tuple(p) for p in street["line"]])).intersection(area)
        if line.is_empty:
            continue
        strip = line.buffer(float(street.get("widthM", 10.0)) / 2, cap_style="flat").difference(outline)
        parts.add("streets", "street", _extrude(strip, 0.04))
        streets += 1
    if count or streets:
        notes["context"] = f"{count} neighboring buildings and {streets} streets from OpenStreetMap (plain gray)"


def _build_tower(spec: MassingSpec, outline: Polygon, provenance: dict[str, str]) -> tuple[bytes, BoundingBox, dict[str, str]]:
    tower, core, tnotes = infer_tower(outline, spec)
    provenance.update(tnotes)
    levels = _floor_levels(spec)
    podium_h = levels[spec.podium_floors]
    roof_h = spec.height_m - PENTHOUSE_HEIGHT_M
    crown_h = spec.floor_height_m if spec.crown else 0.0
    parts = _Parts()

    # Base: the rest of the lot around the tower, with a metal band on top. Slivers under 2 m wide are dropped.
    podium = outline.difference(tower.buffer(0.01)).buffer(-1.0, join_style="mitre").buffer(1.0, join_style="mitre")
    podium_wall = _wall_material(spec.facades.get("podium") or {"material": "concrete", "glass": 0.4})
    if podium_h > PODIUM_BAND_M + 1:
        parts.add_walls("podium", _extrude(podium, podium_h - PODIUM_BAND_M), {}, podium_wall)
        parts.add_walls("podium", _extrude(podium, PODIUM_BAND_M, base=podium_h - PODIUM_BAND_M), {}, "metal")
    else:
        parts.add_walls("podium", _extrude(podium, podium_h), {}, podium_wall)

    # Tower body: a glass lobby, then the upper floors with each side's wall material.
    body = tower.difference(core) if core is not None else tower
    walls = {side: _wall_material(spec.facades.get(side)) for side in ("north", "south", "east", "west")}
    parts.add_walls("tower", _extrude(body, podium_h), {}, "glass")
    parts.add_walls("tower", _extrude(body, roof_h - crown_h - podium_h, base=podium_h), walls, "concrete")

    # Facade detail on tile curtain walls: floor bands and staggered fins.
    curtain = {s for s in walls if str((spec.facades.get(s) or {}).get("material", "")).lower() == "tile"}
    top_floor = max(i for i, z in enumerate(levels) if z <= roof_h - crown_h + 1e-6)
    if curtain:
        bands = body.buffer(BAND_DEPTH_M, join_style="mitre").difference(body)
        if core is not None:
            bands = bands.difference(core.buffer(0.01))
        for f in range(spec.podium_floors, top_floor + 1):
            parts.add("tower", "tile", _extrude(bands, BAND_HEIGHT_M, base=levels[f] - BAND_HEIGHT_M / 2, min_area=0.05))
        parts.add("tower", "tile", _facade_fins(body, curtain, levels, spec.podium_floors, top_floor, provenance))

    if spec.crown:
        parts.add_walls("crown", _extrude(body.buffer(-0.4, join_style="mitre"), crown_h, base=roof_h - crown_h), {}, "glass")
        canopy = body.buffer(CROWN_OVERHANG_M, join_style="mitre")
        if core is not None:
            canopy = canopy.difference(core)
        parts.add_walls("crown", _extrude(canopy, CROWN_CANOPY_M, base=roof_h), {}, "tile", roof="tile")
        provenance["crown"] = f"glass top floor under a {CROWN_OVERHANG_M} m canopy; core rises {PENTHOUSE_HEIGHT_M:.0f} m above"
    else:
        plant = body.buffer(-PENTHOUSE_INSET_M, join_style="mitre")
        parts.add_walls("roof", _extrude(plant, PENTHOUSE_HEIGHT_M, base=roof_h), {}, "metal")
        provenance["rooftopPlant"] = f"{PENTHOUSE_HEIGHT_M:.0f} m, inset {PENTHOUSE_INSET_M:.0f} m (inferred)"

    if core is not None:
        core_mat = str((spec.core or {}).get("material", "concrete")).lower()
        parts.add_walls("core", _extrude(core, spec.height_m), {}, core_mat if core_mat in _PBR else "concrete")
        if spec.core and spec.core.get("sign"):
            glyph = str(spec.core["sign"])
            parts.add("sign", "sign", _sign_glyph(core, _long_axis_angle(tower), glyph, spec.height_m - 1.5))
            provenance["sign"] = f"lit '{glyph}' near the top of the core (from the photos)"
    provenance["podium"] = f"{spec.podium_floors} floors, {podium_h:.1f} m, fills the lot around the tower"

    if spec.context or spec.streets:
        _context(spec, outline, parts, provenance)
    glb, bbox = parts.scene()
    return glb, bbox, provenance
