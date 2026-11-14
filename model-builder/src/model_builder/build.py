"""The build: pre-loaded project files in, model.glb and model.json out."""

import json
import os
from pathlib import Path

from .contract import METADATA_FILE, MODEL_FILE, BoundingBox, ModelMetadata
from .glb import box_glb
from .reference import known_sides

# Gray-box size until project.json carries real footprint and height facts.
# Matches PLACEHOLDER_BOUNDING_BOX in src/features/model/schema.ts.
STAND_IN_BOX = BoundingBox(min=(-20.0, 0.0, -15.0), max=(20.0, 40.0, 15.0))


def _replace_atomic(path: Path, data: bytes) -> None:
    """Write to a temp file next to ``path``, then rename it into place."""
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def _next_version(metadata_path: Path) -> int:
    """One more than the version of the model already on disk, or 1 for a first build."""
    if not metadata_path.is_file():
        return 1
    try:
        previous = json.loads(metadata_path.read_text(encoding="utf-8"))
        return int(previous["version"]) + 1
    except (ValueError, KeyError, TypeError):
        return 1


def build_model(project_dir: Path, out_dir: Path) -> ModelMetadata:
    """Build the project's 3D model.

    Reads the pre-loaded project from ``project_dir`` (project.json, images/).
    Writes ``out_dir/model.glb`` and ``out_dir/model.json`` (a ModelMetadata),
    then returns that metadata. model.json is written last, so the web app never
    sees metadata for a half-written GLB.
    """
    project_file = project_dir / "project.json"
    project = json.loads(project_file.read_text(encoding="utf-8"))
    slug = project.get("slug")
    if not isinstance(slug, str) or not slug:
        raise ValueError(f"{project_file} has no slug")

    out_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = out_dir / METADATA_FILE
    version = _next_version(metadata_path)

    _replace_atomic(out_dir / MODEL_FILE, box_glb(STAND_IN_BOX, name=slug))

    metadata = ModelMetadata(
        projectSlug=slug,
        file=MODEL_FILE,
        version=version,
        boundingBox=STAND_IN_BOX,
        knownSides=known_sides(project_dir / "images"),
    )
    _replace_atomic(metadata_path, metadata.model_dump_json(indent=2).encode("utf-8"))
    return metadata
