"""The build itself. This is the part to implement."""

from pathlib import Path

from .contract import ModelMetadata


def build_model(project_dir: Path, out_dir: Path) -> ModelMetadata:
    """Build the project's 3D model.

    Reads the pre-loaded project from ``project_dir`` (project.json, images/).
    Must write ``out_dir/model.glb`` and ``out_dir/model.json`` (a ModelMetadata),
    then return that metadata. Write model.json last, so the web app never sees
    metadata for a half-written GLB.
    """
    raise NotImplementedError("build_model is not implemented yet")
