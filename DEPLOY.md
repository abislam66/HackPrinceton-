# Deploying the building viewer generator

The generator lives at `/building-viewer` (page) and `POST /api/building-viewer/generate` (route). Code: `src/features/building-viewer/`. Locked inputs: `building-viewer/scaffold.html` and `building-viewer/house_viewer_prompt.md`.

## Environment variables

Set these in the host (Vercel: Project Settings, Environment Variables). Server only; never prefix them with `NEXT_PUBLIC_`.

| Name | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Calls `claude-opus-5-5` with effort `low` and the web search tool. Without it, the run fails at the model step. |
| `BUILDING_VIEWER_ACCESS_CODE` | yes | The page asks for this code. With it unset, the generator refuses every request (fails closed). |
| `GOOGLE_MAPS_KEY` | no | Google Geocoding. Without it the run continues with `geocode_status: not retrieved` and no context. |

Enable the Google Geocoding API on the key, and restrict the key to that API.

## Host settings

- The route sets `maxDuration = 300`, the same as the repo's agent route. The Vercel plan must allow that; confirm it in the project's function settings before relying on it. If the plan caps lower, a generation with web search can be cut off, and the fix is a background job (start a run, poll a status route). That is not built yet.
- The response streams NDJSON, one line per step, so the page shows progress.
- Node runtime (the default). Do not move the route to Edge: it reads the scaffold from disk.
- `next.config.ts` traces `./building-viewer/*` into the function bundle. Check that `scaffold.html` is in the deployed function.

## Limits to know

- The rate limit (5 per client per hour) and the map cache (24 h per coordinate) live in the app's store (`src/lib/store/json-store.ts`). With `SUPABASE_SECRET_KEY` set, every instance shares them; without it they are per instance.
- Generated models (the viewer's GLB and model.json) are kept in Supabase when `SUPABASE_SECRET_KEY` is set: model.json in `records` (collection `generated-models`), the GLB in the private `models` bucket (migration `20261115120000_models_bucket.sql`, 4 MB per file). Without the key they live in `.data/` or process memory and vanish on a redeploy. The bucket must exist before the first save, or saving a model returns 502.
- The access code is one shared value, not a user login. Rotate it if it leaks.

## Smoke test after deploy

1. Load `/building-viewer`. The form renders in the app shell.
2. Submit with no access code. Expect an error at step `access` (401), with the message shown.
3. Submit a valid address with the access code. Expect progress lines for geocode, context, model and assemble, then a viewer in the frame and a reply.
4. Click Download HTML. The file opens offline in a browser, and the page has no localStorage calls.
5. Submit a JPEG and a PNG; submit a 6 MB file (expect a size refusal) and a `.gif` renamed to `.png` (expect "must be a JPEG or PNG").
6. Send six requests from one client. The sixth should return 429 with a Retry-After header.
7. Check the function logs: lines should show step names, statuses and timings only. No keys, photos, prompts or addresses.

## Model parameters used

- Model: `claude-opus-5-5`.
- Effort: `output_config: { effort: "low" }` (SDK 1.8.0 field).
- Web search: `{ type: "web_search_20260209", name: "web_search", max_uses: 3 }`, for building facts only.
- Max output tokens: 16000. Model call timeout: 270 s.
