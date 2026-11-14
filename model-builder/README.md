# Model builder

Python. Builds the 3D model of the pre-loaded demo project and hands it to the web app as a GLB file.

## Contract with the web app

- **Input:** `data/<project_slug>/` (project.json, images/).
- **Output:** `public/models/<project_slug>/model.glb` and `model.json`.
- `model.json` is defined in `src/model_builder/contract.py` and mirrored in `src/features/model/schema.ts`. Change both together.
- Coordinates: meters, +Y up, +X east, -Z north, origin at the center of the footprint at ground level.
- Until `model.json` exists, the web app shows a gray-box stand-in.

## Run

Needs [uv](https://docs.astral.sh/uv/).

```bash
cd model-builder
uv sync
uv run model-builder build demo-project   # command line: build once
uv run model-builder serve                # HTTP service on http://127.0.0.1:8000
uv run pytest
```

The service exists so the web app can start a build and poll it (`POST /builds`, `GET /builds/{id}`). The web app reaches it through `MODEL_BUILDER_URL`.

## What to implement

`src/model_builder/build.py`, `build_model()`. The command line and the service both call it. Geometry libraries are not chosen yet: add them to `pyproject.toml` with `uv add`.
