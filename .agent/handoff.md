# Handoff

Current state of the repo, for the next agent or teammate. Keep this short and current.

## Building viewer generator (branch feature/building-viewer)

- Page: `src/app/(app)/building-viewer/`. Route: `src/app/api/building-viewer/generate/route.ts`.
- Logic: `src/features/building-viewer/` (`geo.ts` map context, `prompt.ts` fill and splice, `generate.ts` pipeline, `guard.ts` access code and rate limit, `schema.ts` input and events, `viewer.test.ts`).
- Inputs: `building-viewer/scaffold.html` (locked; only the SUBJECT block and title change) and `building-viewer/house_viewer_prompt.md`.
- Env: `ANTHROPIC_API_KEY`, `BUILDING_VIEWER_ACCESS_CODE`, `GOOGLE_MAPS_KEY`. See `.env.example` and `DEPLOY.md`.
- Open: no background job yet (route is 300 s; check the Vercel plan). Rate limit and map cache are per instance.
- Launch from a project: the project header's **Generate 3D viewer** opens `/building-viewer?project=<slug>`, which prefills address, name, a facts line and the first photo in `data/<project>/images/` (served read-only by `src/app/api/project-images/[project]/[file]/route.ts`). The access code is always typed by the user. A stream that ends with no result shows "This took too long. Try again."

## Generated model storage (branch feature/model-json-generator, uncommitted as of 2026-11-15)

- `src/features/model/generated.ts` picks a backend per call, like `json-store`. Supabase keys set: GLB to the private `models` bucket at `<slug>/model.glb` (uploaded first), then model.json to `records` (`generated-models/<slug>`). A failed write throws; `POST /api/building-viewer/model` answers 502 `{ step: "save" }`. No keys: the old temporary store (`.data/generated-models/`, or memory).
- The `models` bucket migration is applied in our Supabase project (by Abrar, SQL editor). Checked with the secret key: private, 4 MB cap, MIME filter, publishable key blocked, and a real save/load through `generated.ts` round-tripped. Setup comment posted on #68.
- Not done: no PR yet; Discover/ModelBoard still needs the shared GLB export helper (asked of Rafiat's agent on #68).
- Run vitest from PowerShell. In the Git Bash tool every test file fails with "Vitest failed to find the runner" (pre-existing tests included); the same command passes in PowerShell.

## Conventions

- Tests: `npx vitest run` (vitest is in devDependencies). Typecheck: `npx tsc --noEmit`.
- Teammate work goes on the board (`tools/board post`), and the owner approves merges.
- Never commit `.env.local` or keys.
