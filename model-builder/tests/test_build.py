import json
import struct
from pathlib import Path

import pytest

from model_builder.build import STAND_IN_BOX, build_model
from model_builder.cli import main
from model_builder.contract import ModelMetadata
from model_builder.reference import known_sides

REAL_PROJECT = Path(__file__).resolve().parents[2] / "data" / "demo-project"


@pytest.fixture
def project(tmp_path):
    """A copy of the pre-loaded project, so tests can add images without touching data/."""
    target = tmp_path / "demo-project"
    (target / "images").mkdir(parents=True)
    (target / "project.json").write_text((REAL_PROJECT / "project.json").read_text(encoding="utf-8"), encoding="utf-8")
    return target


def read_glb(path: Path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and version == 2 and length == len(data)
    json_len, json_type = struct.unpack_from("<II", data, 12)
    assert json_type == 0x4E4F534A
    gltf = json.loads(data[20 : 20 + json_len])
    bin_offset = 20 + json_len
    bin_len, bin_type = struct.unpack_from("<II", data, bin_offset)
    assert bin_type == 0x004E4942 and bin_offset + 8 + bin_len == len(data)
    return gltf


def test_known_sides_from_file_names(tmp_path):
    images = tmp_path / "images"
    images.mkdir()
    for name in ["North-elevation.jpg", "east_facade.PNG", "site-plan-south.webp", "aerial.jpg", "west.txt", "two-north-west.png"]:
        (images / name).write_bytes(b"x")
    # aerial.jpg names no side; two-north-west.png names two; west.txt is not an image.
    assert known_sides(images) == ["north", "east", "south"]


def test_known_sides_missing_folder_is_empty(tmp_path):
    assert known_sides(tmp_path / "nope") == []


def gray_box_project(project):
    """A project with no massing fields, so build_model() takes the gray-box path."""
    (project / "project.json").write_text(json.dumps({"slug": "demo-project"}), encoding="utf-8")
    return project


def test_build_writes_glb_and_metadata(project, tmp_path):
    out = tmp_path / "out"
    metadata = build_model(gray_box_project(project), out)

    assert metadata.projectSlug == "demo-project"
    assert metadata.version == 1
    assert metadata.knownSides == []
    assert metadata.boundingBox == STAND_IN_BOX

    gltf = read_glb(out / "model.glb")
    assert gltf["asset"]["version"] == "2.0"
    assert gltf["accessors"][0]["count"] == 8
    assert gltf["accessors"][0]["min"] == [-20.0, 0.0, -15.0]
    assert gltf["accessors"][0]["max"] == [20.0, 40.0, 15.0]

    on_disk = ModelMetadata.model_validate_json((out / "model.json").read_text(encoding="utf-8"))
    assert on_disk == metadata


def test_build_reads_known_sides_and_bumps_version(project, tmp_path):
    (project / "images" / "north.jpg").write_bytes(b"x")
    (project / "images" / "west-side.png").write_bytes(b"x")
    out = tmp_path / "out"

    first = build_model(project, out)
    second = build_model(project, out)

    assert first.knownSides == ["north", "west"]
    assert second.version == first.version + 1


def test_model_json_is_not_written_when_glb_fails(project, tmp_path, monkeypatch):
    import model_builder.build as build

    def boom(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(build, "box_glb", boom)
    with pytest.raises(OSError):
        build_model(gray_box_project(project), tmp_path / "out")
    assert not (tmp_path / "out" / "model.json").exists()


def test_project_without_slug_is_rejected(project, tmp_path):
    (project / "project.json").write_text(json.dumps({"name": "x"}), encoding="utf-8")
    with pytest.raises(ValueError):
        build_model(project, tmp_path / "out")


def test_cli_build_writes_to_out_folder(project, tmp_path, monkeypatch, capsys):
    import model_builder.cli as cli

    monkeypatch.setattr(cli, "project_dir", lambda slug: project)
    assert main(["build", "demo-project", "--out", str(tmp_path / "cli-out")]) == 0
    assert (tmp_path / "cli-out" / "model.json").is_file()
    assert "Built" in capsys.readouterr().out
