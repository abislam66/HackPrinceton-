"""Massing tests. The Hobson numbers are test input only (six levels, about 60 ft; see issue #9);
the footprint is a made-up rectangle near the OpenStreetMap construction area, not the real outline."""

import json

import pytest
import trimesh

from model_builder.build import STAND_IN_BOX, build_model
from model_builder.massing import parse_spec

LNG, LAT = -74.65643, 40.34526
HOBSON = {
    "slug": "demo-project",
    "footprint": [
        [LNG - 0.0010, LAT - 0.0004],
        [LNG + 0.0010, LAT - 0.0004],
        [LNG + 0.0010, LAT + 0.0004],
        [LNG - 0.0010, LAT + 0.0004],
    ],
    "floors": 6,
    "floorHeightM": 3.05,
    "facades": {"north": {"material": "brick", "glass": 0.2}, "south": {"material": "stone", "glass": 0.8}},
}


def make_project(tmp_path, data):
    project = tmp_path / "demo-project"
    (project / "images").mkdir(parents=True)
    (project / "project.json").write_text(json.dumps(data), encoding="utf-8")
    return project


def test_massing_bounds_follow_footprint_and_height(tmp_path):
    out = tmp_path / "out"
    metadata = build_model(make_project(tmp_path, HOBSON), out)

    box = metadata.boundingBox
    assert box.min[1] == 0.0
    assert box.max[1] == pytest.approx(6 * 3.05, abs=0.01)
    # ~2 mm of longitude is ~170 m east-west, ~0.0008 deg of latitude is ~88 m north-south; origin is the center.
    assert box.max[0] == pytest.approx(-box.min[0], abs=0.01)
    assert box.max[2] == pytest.approx(-box.min[2], abs=0.01)
    assert 165 < box.max[0] - box.min[0] < 175
    assert 85 < box.max[2] - box.min[2] < 92

    scene = trimesh.load(out / "model.glb", file_type="glb")
    lo, hi = scene.bounds
    assert hi[1] == pytest.approx(box.max[1], abs=0.01)
    assert lo[1] == pytest.approx(0.0, abs=0.01)


def test_massing_colors_walls_by_side(tmp_path):
    out = tmp_path / "out"
    build_model(make_project(tmp_path, HOBSON), out)
    mesh = trimesh.load(out / "model.glb", file_type="glb", force="mesh")
    colors = {tuple(c[:3]) for c in mesh.visual.vertex_colors}
    assert len(colors) >= 3  # roof, north wall, south wall at least


def test_north_wall_faces_minus_z(tmp_path):
    out = tmp_path / "out"
    build_model(make_project(tmp_path, HOBSON), out)
    mesh = trimesh.load(out / "model.glb", file_type="glb", force="mesh")
    # Faces pointing -Z are the north wall; they must sit at the most-negative Z.
    north = mesh.face_normals[:, 2] < -0.9
    assert north.any()
    assert mesh.triangles_center[north][:, 2].max() == pytest.approx(mesh.bounds[0][2], abs=0.01)


def test_project_without_massing_fields_keeps_gray_box(tmp_path):
    metadata = build_model(make_project(tmp_path, {"slug": "demo-project"}), tmp_path / "out")
    assert metadata.boundingBox == STAND_IN_BOX


@pytest.mark.parametrize(
    "patch",
    [
        {"floors": None},
        {"floors": 0},
        {"floors": 2.5},
        {"floorHeightM": -3},
        {"footprint": [[LNG, LAT], [LNG, LAT]]},
        {"footprint": "nope"},
        {"facades": []},
    ],
)
def test_bad_massing_inputs_are_rejected(patch):
    with pytest.raises(ValueError):
        parse_spec({**HOBSON, **patch})


def test_tiny_footprint_is_rejected(tmp_path):
    tiny = {**HOBSON, "footprint": [[LNG, LAT], [LNG + 1e-7, LAT], [LNG, LAT + 1e-7]]}
    with pytest.raises(ValueError):
        build_model(make_project(tmp_path, tiny), tmp_path / "out")


# --- Inference from few facts (Hobson: 270,000 sq ft, six levels up to 60 ft, wings around a quad) ---

from shapely.geometry import Polygon as _Polygon  # noqa: E402

from model_builder.massing import infer_plate  # noqa: E402

SITE = [  # ~168 m x 175 m site, about the size of the OSM construction area
    [LNG - 0.0010, LAT - 0.0008],
    [LNG + 0.0010, LAT - 0.0008],
    [LNG + 0.0010, LAT + 0.0008],
    [LNG - 0.0010, LAT + 0.0008],
]
HOBSON_FACTS = {"slug": "demo-project", "footprint": SITE, "grossAreaSqFt": 270000, "floors": 6,
                "heightM": 18.288, "typology": "courtyard", "facades": {"south": {"material": "brick"}}}
PLATE_M2 = 270000 * 0.09290304 / 6  # ~4,181 m² per floor


def test_courtyard_plate_holds_the_gross_area_with_a_quad():
    spec = parse_spec(HOBSON_FACTS)
    plate, notes = infer_plate(spec)
    polys = [plate] if isinstance(plate, _Polygon) else list(plate.geoms)
    assert any(p.interiors for p in polys), "courtyard needs a quad (a hole)"
    depth = float(notes["wingDepthM"].split()[0])
    assert 10.0 <= depth <= 20.0
    # The site would need ~6 m wings to hold exactly PLATE_M2; depth is clamped to 10 m, so the plate is bigger
    # and the provenance reports the implied average floor count ("varied massing, reaching six levels").
    assert plate.area >= PLATE_M2
    assert "average floors" in notes["plateAreaM2"]


def test_courtyard_build_respects_height_cap_and_has_open_quad(tmp_path):
    out = tmp_path / "out"
    metadata = build_model(make_project(tmp_path, HOBSON_FACTS), out)
    assert metadata.boundingBox.max[1] <= 18.288 + 1e-6
    assert metadata.boundingBox.max[0] - metadata.boundingBox.min[0] > 150  # wings still span the site
    mesh = trimesh.load(out / "model.glb", file_type="glb", force="mesh")
    roof = mesh.face_normals[:, 1] > 0.5
    roof_area = mesh.area_faces[roof].sum()
    assert roof_area < 0.5 * 168 * 175  # mostly open quad, not a solid block


def test_height_only_infers_floors():
    spec = parse_spec({"slug": "x", "grossAreaM2": 3000, "heightM": 12.5})
    assert spec.floors == 4 and spec.height_m == pytest.approx(12.2)
    assert spec.provenance["floors"].startswith("inferred")


@pytest.mark.parametrize("typology, aspect", [("block", 1.0), ("bar", 3.0)])
def test_no_footprint_shapes_have_plate_area(typology, aspect):
    spec = parse_spec({"slug": "x", "grossAreaM2": 6000, "floors": 3, "typology": typology})
    plate, _ = infer_plate(spec)
    assert plate.area == pytest.approx(2000, rel=0.01)
    minx, miny, maxx, maxy = plate.bounds
    assert (maxx - minx) / (maxy - miny) == pytest.approx(aspect, rel=0.01)


def test_no_footprint_courtyard_is_a_ring_of_plate_area():
    spec = parse_spec({"slug": "x", "grossAreaM2": 24000, "floors": 4, "typology": "courtyard"})
    plate, _ = infer_plate(spec)
    assert plate.interiors and plate.area == pytest.approx(6000, rel=0.01)


def test_block_outline_shrinks_to_plate_area():
    spec = parse_spec({"slug": "x", "footprint": SITE, "grossAreaM2": 20000, "floors": 4})
    plate, notes = infer_plate(spec)
    assert plate.area == pytest.approx(5000, rel=0.01) and "outlineScale" in notes


@pytest.mark.parametrize("bad", [{"typology": "pyramid"}, {"grossAreaSqFt": -1}, {"heightM": 0}])
def test_bad_inference_inputs_are_rejected(bad):
    with pytest.raises(ValueError):
        parse_spec({**HOBSON_FACTS, **bad})


# --- Podium and tower (Morgan Hall North: 27 floors, 92 m, 3-floor base, oblong slab, charcoal core) ---

MORGAN = {"slug": "demo-project", "footprint": SITE, "floors": 27, "heightM": 92.0, "typology": "tower",
          "podiumFloors": 3, "towerPlateM2": 1450, "core": {"material": "charcoal"},
          "facades": {"north": {"material": "tile", "glass": 0.6}}}


def test_tower_stands_on_a_podium_within_the_height_cap(tmp_path):
    out = tmp_path / "out"
    metadata = build_model(make_project(tmp_path, MORGAN), out)
    assert metadata.boundingBox.max[1] == pytest.approx(92.0, abs=0.01)  # the plant reaches the cap, not above it
    mesh = trimesh.load(out / "model.glb", file_type="glb", force="mesh")
    roofs = mesh.face_normals[:, 1] > 0.5
    heights = sorted({round(float(h), 1) for h in mesh.triangles_center[roofs][:, 1]})
    assert heights[0] == pytest.approx(3 * 1.4 * (92 - 5) / (3 * 1.4 + 24), abs=0.1)  # podium roof
    assert 87.0 in heights and 92.0 in heights  # main roof and the plant / core top
    # The tower is slimmer than the podium: roof area at the podium level is the full site.
    podium_roof = mesh.area_faces[roofs & (mesh.triangles_center[:, 1] < heights[0] + 0.5)].sum()
    assert podium_roof > 0.5 * 168 * 175
    colors = {tuple(c[:3]) for c in mesh.visual.vertex_colors}
    assert (58, 58, 62) in colors  # charcoal core


def test_tower_plate_is_an_oblong_of_the_given_area():
    from model_builder.massing import _local_outline, infer_tower

    spec = parse_spec(MORGAN)
    plate, core, notes = infer_tower(_local_outline(spec.footprint), spec)
    assert plate.area == pytest.approx(1450, rel=0.02)
    minx, miny, maxx, maxy = plate.bounds
    long, short = sorted([maxx - minx, maxy - miny], reverse=True)
    assert long / short >= 2.0  # an oblong slab along the site's long axis
    assert core is not None and core.area == pytest.approx(1450 * 0.18, rel=0.05)
    assert plate.contains(core.representative_point())


def test_podium_must_be_shorter_than_the_building():
    with pytest.raises(ValueError):
        parse_spec({**MORGAN, "podiumFloors": 27})


def test_needs_footprint_or_area():
    with pytest.raises(ValueError):
        parse_spec({"slug": "x", "floors": 3})
