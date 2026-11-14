# How Modeling Fits the Road Work Ahead Content Flow

## Where modeling sits

Road Work Ahead is a construction press outlet: projects, procedures and techniques, written for laypeople and respected by professionals. Press and junket imagery covers most posts. Modeling covers what photography cannot: a building that is unbuilt, hidden inside, too large to photograph in one frame, or better explained as a cutaway. Each model becomes a reusable asset that feeds many posts.

The model pipeline (Toon Model Builder) produces one verified 1:1 model per subject. The content pipeline (research, draft, daily approval, ship) consumes it.

## Daily loop

1. **Pitch.** Concept candidates are proposed each night with basic blocking: the subject, why it is newsworthy, and the shot it would anchor.
2. **Select.** Michael approves or kills pitches.
3. **Build.** Approved subjects go through the model pipeline: identify, five research scouts in parallel, read, build, verify against photos, then style. Cap is 15 minutes per landmark, which is why the scouts and camera solvers run in parallel.
4. **Render.** Toon Street renders are produced headless, with Blender used only for the final render pass.
5. **Review.** Michael reviews the day's finished renders alongside the audit sheet (held-back photo beside its overlay, plus a list of estimates).
6. **Compose.** Approved renders are dropped into post templates and published.

## What one model produces

- Hero render (the cover frame)
- Top, elevation and plan views for explainer slides
- Cutaway or section views for "how it works" carousels
- Orbit or push-in clips for reels
- Environment scenes that combine several models (street, site, skyline)
- Standalone assets for the Toon Street Kit catalogue

## Content formats fed by models

| Format | Model contribution |
|---|---|
| Carousel | Hero render as cover, plan, elevation and section as slides |
| Explainer | Sectional views and labeled structure |
| Reel | Camera moves through the toon scene |
| Newsletter and article | Hero plus diagram set, linked from each post |
| Unbuilt or in-progress projects | Rendered from official renders and scale-model photos |

## Style rules specific to Road Work Ahead

The Toon Street look (cel shading, palette, line weight that adapts to scale) applies only to Road Work Ahead. Other brands use the same modeling stages with their own finish. The generic Model Builder skill carries stages 0 to 4 and leaves the finish to the project.

## Quality gates that protect the feed

- No geometry before research and reading gates pass.
- Every signature feature is backed by two sources.
- At least one photo is held back for audit only.
- A model that fails two consecutive audits, or does not improve across three versions, is reported instead of published.
- Only the current version is ever shown.

## Where it scales

Five scouts and per-photo camera agents run in parallel, so several landmarks can finish per day. The generic catalogue (warehouses and other common building types, in pristine condition) lets simple posts skip landmark research entirely. Line weight and texture settings still need refinement to hold across scales.

## Handoffs

Each model ships as a plain-file folder (specs, renders, `CURRENT.md`, review sheet) that can be dropped into the general Toon chat for merging into scenes, with instructions included.
