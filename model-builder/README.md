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

Tile fin spacing is `finSpacingM` (metres, 0.8 to 6, default 2.2). The look rules and viewer styles are in [STYLE.md](STYLE.md).

## Example: Morgan Hall North (tower typology)

`examples/morgan-hall-north.json` is a full input for a 27-floor tower on a dining-hall base, built from published facts, two photos and OpenStreetMap. To try it, copy it to a project folder as `project.json` and build:

    mkdir -p /tmp/morgan/images && cp examples/morgan-hall-north.json /tmp/morgan/project.json
    uv run python -c "from pathlib import Path; from model_builder.build import build_model; print(build_model(Path('/tmp/morgan'), Path('/tmp/morgan/out')))"

Tower-only inputs: `podiumFloors`, `towerPlateM2` or `towerFootprint` (a ring inside `footprint`), `core` (`material`, `side`, `share`, `loungeM`, `sign`), `crown`. Any typology can add `context` (neighbors: `footprint` plus `heightM` or `levels`) and `streets` (`line`, `widthM`). They're drawn plain and dim, and they're left out of `boundingBox`. The GLB has one node per part and material, such as `tower-glass` or `core-charcoal`.
