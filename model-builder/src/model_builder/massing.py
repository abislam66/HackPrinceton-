"""Parametric massing: footprint, floors and floor height in, a colored GLB out.

Reads these optional fields from project.json (not in the shared schema yet, so everything is checked here):

- ``footprint``: ring of ``[lng, lat]`` points (the building outline, e.g. from OpenStreetMap)
- ``floors``: whole number, at least 1
- ``floorHeightM``: meters per floor, above 0
- ``facades``: optional ``{"north": {"glass": 0.4, "material": "brick"}, ...}`` (``glass`` is 0 to 1)

Coordinates follow the contract: meters, +Y up, +X east, -Z north, origin at the footprint
center at ground level.
"""

import math
from dataclasses import dataclass
from typing import Any

import numpy as np
import trimesh
from shapely.geometry import Polygon
from shapely.validation import make_valid

from .contract import BoundingBox, Side

METERS_PER_DEG_LAT = 110_574.0
METERS_PER_DEG_LNG_AT_EQUATOR = 111_320.0

_MATERIAL_COLORS: dict[str, tuple[int, int, int]] = {
    "brick": (160, 82, 60),
    "terracotta": (190, 105, 70),
    "stone": (186, 178, 165),
    "metal": (150, 156, 162),
    "timber": (176, 134, 90),
}
_DEFAULT_COLOR = (170, 170, 170)
_GLASS_COLOR = (110, 150, 190)
_ROOF_COLOR = (90, 94, 100)


@dataclass(frozen=True)
class MassingSpec:
    footprint: list[tuple[float, float]]  # [lng, lat] ring
    floors: int
    floor_height_m: float
    facades: dict[str, dict[str, Any]]


def parse_spec(project: dict[str, Any]) -> MassingSpec | None:
    """Return the massing inputs, or None when the project has no footprint, floors and floor height."""
    footprint, floors, floor_height = project.get("footprint"), project.get("floors"), project.get("floorHeightM")
    if footprint is None and floors is None and floor_height is None:
        return None
    if footprint is None or floors is None or floor_height is None:
        raise ValueError("project.json needs footprint, floors and floorHeightM together (or none of them)")
    if isinstance(floors, bool) or not isinstance(floors, int) or floors < 1:
        raise ValueError("floors must be a whole number of at least 1")
    if isinstance(floor_height, bool) or not isinstance(floor_height, (int, float)) or floor_height <= 0:
        raise ValueError("floorHeightM must be a number above 0")
    try:
        ring = [(float(lng), float(lat)) for lng, lat in footprint]
    except (TypeError, ValueError) as exc:
        raise ValueError("footprint must be a list of [lng, lat] points") from exc
    if len(ring) < 3:
        raise ValueError("footprint needs at least 3 points")
    facades = project.get("facades")
    if facades is None:
        facades = {}
    if not isinstance(facades, dict):
        raise ValueError("facades must be an object keyed by side")
    return MassingSpec(ring, floors, float(floor_height), facades)


def _local_polygon(ring: list[tuple[float, float]]) -> Polygon:
    """Project the ring to meters (x east, y north) and center it on its centroid."""
    lng0 = sum(p[0] for p in ring) / len(ring)
    lat0 = sum(p[1] for p in ring) / len(ring)
    per_lng = METERS_PER_DEG_LNG_AT_EQUATOR * math.cos(math.radians(lat0))
    points = [((lng - lng0) * per_lng, (lat - lat0) * METERS_PER_DEG_LAT) for lng, lat in ring]
    polygon = Polygon(points)
    if not polygon.is_valid:
        polygon = make_valid(polygon)
        if polygon.geom_type != "Polygon":
            polygon = max((g for g in getattr(polygon, "geoms", []) if g.geom_type == "Polygon"),
                          key=lambda g: g.area, default=Polygon())
    if polygon.is_empty or polygon.area < 1.0:
        raise ValueError("footprint has no usable area")
    centroid = polygon.centroid
    return Polygon(
        [(x - centroid.x, y - centroid.y) for x, y in polygon.exterior.coords],
        [[(x - centroid.x, y - centroid.y) for x, y in hole.coords] for hole in polygon.interiors],
    )


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


def build_massing(spec: MassingSpec) -> tuple[bytes, BoundingBox]:
    """Extrude the footprint to ``floors * floor_height_m`` and return (GLB bytes, bounding box)."""
    height = spec.floors * spec.floor_height_m
    mesh = trimesh.creation.extrude_polygon(_local_polygon(spec.footprint), height)
    # extrude_polygon builds (x east, y north, z up); glTF wants (x east, y up, z = -north). A proper rotation.
    mesh.apply_transform(np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], dtype=float))
    mesh.unmerge_vertices()  # one color per face needs faces that share no vertices

    colors = np.empty((len(mesh.faces), 4), dtype=np.uint8)
    for i, normal in enumerate(mesh.face_normals):
        if normal[1] > 0.5:
            rgb = _ROOF_COLOR
        elif normal[1] < -0.5:
            rgb = _DEFAULT_COLOR
        else:
            rgb = _facade_color(spec.facades.get(_side_of_normal(normal[0], normal[2])))
        colors[i] = (*rgb, 255)
    # After unmerge_vertices face i owns vertices 3i..3i+2, so repeating each face color 3 times gives vertex colors
    # (setting them directly avoids trimesh's face-to-vertex conversion, which needs scipy).
    mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=np.repeat(colors, 3, axis=0))

    glb = trimesh.Scene(mesh).export(file_type="glb")
    lo, hi = mesh.bounds
    box = BoundingBox(min=tuple(round(float(v), 3) for v in lo), max=tuple(round(float(v), 3) for v in hi))  # type: ignore[arg-type]
    return glb, box
