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

## Sign-in (Google, through Supabase)

Off by default. Nothing changes until `AUTH_REQUIRED=true` is set on the host, so it can be merged first and switched on when the settings below are ready. Code: `src/lib/auth/policy.ts` (the rules), `src/proxy.ts` (the gate), `src/app/auth/*` and `src/app/login/`.

| Name | What it does |
|---|---|
| `AUTH_REQUIRED` | Exactly `true` turns sign-in on. Also needs the Supabase URL and publishable key; without them it stays off, so a missing key can't lock the app. |
| `ALLOWED_EMAILS` | Optional, comma-separated Google emails. Unset means any Google account can sign in. |

What is behind sign-in: every internal page and every API route. What stays open: the client's proposal page (`/proposals/<client>`), its tracking beacon (`/api/track`), the generated model's GLB read (`GET /api/models/<project>/glb`), `/models/*`, and the sign-in pages. The internal shot preview (`/proposals/<client>/shots`) is behind sign-in.

Signed in means a **Google** sign-in. Supabase email sign-up is a separate provider that anyone can use against the project, so a session from it is turned away with "That account can't use this tool". To also stop strangers creating those accounts, turn off email sign-up in Supabase (Authentication, Sign In / Providers).

Setup, once:

1. Supabase, Authentication, Providers: Google enabled with the Web OAuth client's ID and secret. In Google Cloud, that client's authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase, Authentication, URL Configuration, Redirect URLs: add each origin that serves the app, with `/auth/callback`: `http://localhost:3000/auth/callback` (and any other dev port), `https://<production-domain>/auth/callback`, and the Vercel preview pattern `https://*-<team>.vercel.app/auth/callback`. A URL that is not listed makes Supabase send the person to the Site URL instead.
3. Set `AUTH_REQUIRED=true` (and optionally `ALLOWED_EMAILS`) on the host, then redeploy.

To lock a deployment down later, set `ALLOWED_EMAILS`. To switch sign-in off in an emergency, unset `AUTH_REQUIRED` and redeploy.

Not yet changed: the building viewer still asks for its shared access code. With sign-in on, that code can be dropped, but it stays until the viewer's own PR lands.

## Model parameters used

- Model: `claude-opus-5-5`.
- Effort: `output_config: { effort: "low" }` (SDK 1.8.0 field).
- Web search: `{ type: "web_search_20260209", name: "web_search", max_uses: 3 }`, for building facts only.
- Max output tokens: 16000. Model call timeout: 270 s.
