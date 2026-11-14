---
name: model-builder
description: Build an accurate, 1:1-scale 3D model of a real building and render it, autonomously and in parallel, in Claude Code. Use for any request to model, rebuild or render a landmark, tower or specific building.
---

# Model Builder V1

One building in, one verified model out. Target: 15 minutes wall clock per landmark. Nobody is asked anything mid-run; the only human step is the review sheet.

Everything runs in code. Geometry is a JSON spec built by `scripts/engine.py` (Python, no Blender). Blender runs only headless, only to render (`scripts/render.py`). One engine, one spec format, one renderer for every building.

## Setup (once per machine)

```
pip3 install trimesh shapely manifold3d mapbox_earcut numpy scipy opencv-python-headless pillow
```
Agents in `agents/` are copied to `~/.claude/agents/`. Builds live in `~/TSK Builds/<slug>/` (override with `TSK_BUILDS`). Blender path: `TSK_BLENDER` (default `/Applications/Blender.app/Contents/MacOS/Blender`). `T` below means `python3 <this skill>/scripts/tmb.py`.

## Hard rules

1. **No geometry before the research and reading gates pass.** Every past failure that took 10+ versions started with geometry built from memory, one hero photo or a sentence.
2. **Never guess a signature feature.** Each signature feature cites two photos or a drawing plus a photo.
3. **Verification sources are not build sources.** At least one photo is held back from the build and used only by the auditor. Cameras are pinned by published dimensions, never by the model's own numbers.
4. **One engine.** Never write building-specific detail functions. If the grammar lacks a shape, add a generic primitive to `engine.py`, bump `ENGINE_VERSION`, and note it in `references/lessons.md`.
5. **Show only the current version.** Every render is made from the latest spec; `T current` names it. Never show an older render as the model.
6. **Never delete files.** Every iteration is a new `_V<n>.json`. Never use the word "Round".
7. **No placeholders** in specs, renders, titles or filenames. Gaps and estimates go in the report.
8. **Blender is single-use.** Only the orchestrator calls `T render`; agents never open Blender.

## Run order

Run `T clock <dir> <stage>` at the start of every stage. Stages in the same row run at the same time.

| Stage | Who | Output | Gate |
|---|---|---|---|
| 0 Identify | Orchestrator | `T new <slug>`, `dossier/identify.json` | the exact building, confirmed by one photo; look-alikes listed in `not_to_confuse_with` |
| 1 Research | 5 scouts in parallel | `dossier/facts.json`, `manifest_<lane>.json`, `coverage_<lane>.json`, files in `photos/` and `drawings/` | `T gate <dir> research` |
| 2 Read | reader, then critic | `dossier/reading.md`, `inventory.json`, `critic.md` | `T gate <dir> reading` |
| 3 Build | Orchestrator, while camera agents solve photos | `specs/<slug>_V1.json`, `cameras/*.json` | `T gate <dir> build` |
| 4 Verify | Orchestrator renders, auditor checks | renders through every solved camera, overlays, `audit_V<n>.md` | auditor PASS twice in a row, including the held-back photo |
| 5 Finish and deliver | Orchestrator | renders, `CURRENT.md`, review sheet | files exist and match the current spec |

### Stage 0: Identify
Resolve the name to one building: address, coordinates, architect, year, built or unbuilt. Disambiguate near-names (Comcast Center vs Comcast Technology Center; old vs new 270 Park). For an unbuilt design, the latest official renders and any scale-model photo are the references.

### Stage 1: Research, five scouts in parallel
Launch all five in one message with the Agent tool, each given the build folder and the identify block:
`scout-facts`, `scout-drawings`, `scout-footprint`, `scout-faces`, `scout-top-base`.
Each writes only its own files, `dossier/coverage_<lane>.json` and `dossier/manifest_<lane>.json` (ids prefixed with its lane letter: F, D, P, A, T), so parallel scouts never overwrite each other. Each stops when its cells are filled or its sources are exhausted, and reports exhausted cells by name. Run the research gate. A failing cell gets one targeted re-dispatch of that lane, then the gate is run again. Two failures on the same cell: the reader records it as unobservable and the reading rules below decide it.

### Stage 2: Read the building before any geometry
Launch `reader`. When it finishes, launch `critic` (it sees only photos and the reading). The reader resolves every critic item or marks it with a photo that settles it. Run the reading gate.

### Stage 3: Build
- Write `specs/<slug>_V1.json` from `inventory.json` (format: `references/spec.md`). Every element id in the inventory appears in the spec. Every number in `source` cites a manifest id.
- At the same time, launch one `camera` agent per selected photo (3 to 6 photos, every face covered, plus the held-back photo). Each writes `cameras/<photo>.json` through `T solve`.
- `T build <dir> <spec>` then `T gate <dir> build <spec>`.

### Stage 4: Verify
- `T render <dir> <spec> cameras/<photo>.json` for each solved camera, then `T overlay <dir> photos/<photo> renders/<render>`.
- Launch `auditor` with only the overlays, the side-by-sides and `inventory.json`. It returns numbered differences with pixel measurements and PASS/FAIL.
- Fix the largest differences first, one change class per version (massing → transitions → signature features → facade grid → colour), write `_V<n+1>.json`, rebuild, re-render the same cameras. Stop when two consecutive audits pass, the held-back photo included. If three versions in a row do not reduce the error, stop and report the differences rather than iterate further.

### Stage 5: Finish and deliver
- Colours by structural system, sampled from the photos and mapped to the project's palette in `references/finish.md`.
- `T render <dir> <spec>` (auto cameras: Hero Southwest, Top Southwest, Elevation South, Plan Top).
- `T current <dir> <spec>`.
- Review sheet: each held-back and audit photo beside its overlay and the hero render, plus a short list of estimates (grade C/D items) and anything unresolved.
- `T clock <dir> --report` goes at the bottom of the report.

## Reading rules for anything no photo shows
- Symmetric buildings: an unseen face mirrors its opposite only when the plan and at least two photos confirm the symmetry.
- Facades align to the building: panels, bands and bars stop at real edges and never run past a face; vertical bands divide a face into a grid of equal bars.
- Repeated features: count them in every photo against the bands or facet seams before modelling.
- Light through glass, reflections and scaffolding are not geometry; a thin element seen in only one lighting condition needs a second photo.
- Real features (balconies, fins, loggias, cutouts) are geometry with depth, never flat stand-in panels.
- Every height snaps to the floor grid once the floor-to-floor height is known.

## Speed rules
- Scouts run in parallel; camera agents run in parallel; the critic and auditor start the moment their inputs exist.
- Massing, roof and signature features come first; the facade grid follows; base and fine detail are added only when a shot needs them.
- Never re-research a cell that passed. Never re-render cameras that did not change.
- Wikimedia: request standard thumbnail widths (960, 1280, 1920); full-resolution originals rate-limit.

## Files
- `scripts/engine.py`: spec → GLB. `scripts/render.py`: GLB → PNGs. `scripts/tmb.py`: everything else.
- `references/spec.md`: spec format and every primitive. `references/lessons.md`: every failure seen so far and the check that prevents it. `references/finish.md`: the project's materials, palette and line rules. `references/coverage.md`: what each coverage cell needs.
