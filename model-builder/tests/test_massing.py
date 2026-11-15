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
