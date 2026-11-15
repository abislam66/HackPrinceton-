# Live pipeline: scouting, dossier, outreach

Status: building, 2026-11-15. Infra only (libraries, API routes, storage). The screens are built separately against the contracts here.

## Scope change

Rafiat (team lead) changed the demo scope on 2026-11-15:

| Stage | Before | Now |
|---|---|---|
| Scouting | slides only | **live** (web research) |
| Dossier | slides only | **live** (web research) |
| Outreach | slides only | **live** (Gmail) |
| Progress tracking after signing | slides only | **faked in-app** (canned data in `src/features/demo/progress.ts`, unchanged) |

Scouting covers the Northeast only, in five regions: **New York (NYC metro)**, **Philadelphia and the Main Line**, **Connecticut**, **Greater Boston**, **New Jersey**.

The 3D model, shots, pitch and proposal page still exist only for the pre-loaded demo project (Morgan Hall North). Scouting finds real projects. The dossier researches Morgan Hall North or any scouted project. Outreach emails the Morgan Hall stakeholders their proposal links.

## How it fits together

```
POST /api/scout/runs ──► ranked candidates in the 5 regions, each citing sources
        │
        ▼ pick one (or the demo project)
POST /api/dossiers/[project]/runs ──► building facts, firms by role, timeline, sources
        │
        ▼ stakeholders of the demo project (pre-loaded clients stay the proposal input)
POST /api/outreach/[client]/draft ──► review ──► POST .../send ──► Gmail ──► team inbox
                                                                   │
                     replies synced on GET /api/outreach ◄─────────┘
                     proposal link opens ──► existing tracking (/api/track)
```

## Design

### Two phases per research run (`src/lib/agent/`)

1. **Research** (`research.ts`): one streamed call to `claude-sonnet-5-5` with Anthropic's server-side `web_search_20260209` (and optionally `web_fetch_20260209`). Searches are capped per call with `max_uses`. Every page a tool returns goes into the **source ledger** (`ledger.ts`) and is numbered S1, S2, and so on. The ledger is built only from tool-result blocks and citations, never from model text. The model's notes come back with `[S3]` markers wherever a citation backs a passage. `pause_turn` is resent at most twice. Refusals use the server-side fallback.
2. **Extraction** (`structured.ts`): one structured-output call on `claude-haiku-5-5`, validated against the stage's Zod schema. It is given the notes and the ledger, and cites ledger IDs. Afterwards, `keepCited` drops anything citing an ID the ledger doesn't have, and the stage drops any firm whose name never appears in the notes or source titles.

### Models per job (`src/lib/agent/models.ts`)

Chosen for cost on 2026-11-15. Research reads tens of thousands of tokens of search results per call, so the model that searches sets most of the bill.

| Job | Model | Override |
|---|---|---|
| Research (scout regions, dossier) | `claude-sonnet-5-5`, low effort | `RESEARCH_MODEL` |
| Extraction (notes to schema, citing source ids) | `claude-haiku-5-5`, medium effort | `EXTRACT_MODEL` |
| Outreach drafts | `claude-sonnet-5-5`, low effort | `DRAFT_MODEL` |
| Agent tab chat (Behruz's route) | `claude-sonnet-5-5` recommended | in that route |
| Shots and pitch | unchanged, `src/features/proposal/llm.ts` | |

No fast mode: Sonnet 5.5 and Haiku 5.5 don't offer it. The server-side refusal fallback is sent only to models that accept it; Haiku has none, so a declined extraction fails and the run falls back to its snapshot.

### Runs stream from the POST (`src/lib/agent/run.ts`)

`streamRun` runs a stage inside the POST request and streams `RunEvent` lines as NDJSON. The events are defined in `src/lib/agent/schema.ts`:

- `progress`: what the agent is doing, for the "agent at work" feed. It has a `kind` (`search`, `fetch`, `found` or `note`), a `message`, and an optional `scope` such as a region.
- `heartbeat`: sent every 10 s. Ignore it.
- `result`: the last line on success, carrying the whole result and `source: "live"`.
- `error`: the last line on failure, with `fallback` holding the snapshot (or null).

Each run has a hard deadline and falls back to the stage's snapshot when it passes. Only one run per key can go at a time; a second request gets a 409. A run whose client disconnects keeps going and stores its result.

Every successful run is **recorded** with its timings to `.data/recordings/<name>.ndjson`. `?replay=1&speed=2` on the same POST re-streams the latest recording, or a committed one under `src/features/<stage>/recordings/`. Use replay to build the screens before a key is available, and as the stage fallback.

### Storage (`src/lib/store/json-store.ts`)

There are no Supabase keys yet. Records are held in process memory and written through to `.data/<collection>/<key>.json` (gitignored), so a laptop demo survives a restart. On Vercel the filesystem is read-only, so records last only as long as the instance. The GET routes fall back to a **committed snapshot** (the last good live run, `src/features/<stage>/snapshot/*.json`), so the deployed demo always has data. **Run the demo from the laptop. Vercel is the snapshot-only backup.**

### Scouting (`src/features/scout/`)

- `regions.ts` defines the five regions: states, main cities, the local trade press to steer searches toward, and a search location.
- A run is five parallel region calls, each with about 4 searches and no fetches. They look for projects that are under construction, topped out, or completed in the last ~2 years, with the firms named. Each region's progress streams as it goes.
- One extraction call then normalizes, dedupes and scores the candidates for Tradesmark fit: scale, facade and visual interest, how many firms are involved, and recency.
- Output: `ScoutResult` in `schema.ts`.

### Dossier (`src/features/dossier/`)

- A dossier researches one project's building facts, the firms by role (owner, developer, architect, GC or CM, facade, engineers, landscape), the timeline, and each firm's public website and contact page. It never collects personal emails or phone numbers.
- Output: `Dossier` in `schema.ts`. It mirrors the dossier screen's sections, and `missingRoles` lists the key roles no source confirmed.
- The Morgan Hall North dossier is run once and committed as its snapshot. A live dossier on stage is for a scouted project.

### Outreach (`src/features/outreach/`)

- `draft.ts` writes the email for one stakeholder. It uses the client file, the project, the stakeholder's pitch and the proposal link, in Tradesmark's voice, with no pricing.
- `gmail.ts` calls the Gmail API over `fetch`, with one pre-minted refresh token in env (no OAuth routes). Send builds an RFC 2822 message. Reply sync reads only the thread IDs we sent and folds into `GET /api/outreach`.
- **Safety:** the shared account (`GMAIL_REFRESH_TOKEN`) only sends the demo copy: every email it sends is delivered to `OUTREACH_DELIVER_TO`, whatever the stakeholder's address, and `gmail.ts` itself refuses any recipient not on `OUTREACH_ALLOWLIST`. A model-written string never becomes a recipient. Use a dedicated demo Gmail account for it, because the read scope sees the whole mailbox.
- **Sending to a typed address (`OUTREACH_SENDERS`):** the Send proposal dialog has an "Email address" field. A typed address is sent to as written, to anyone, with no allowlist, but only **from the signed-in person's own Gmail** and only if that account is in `OUTREACH_SENDERS` (a JSON map of Gmail address to refresh token, one token per account from `tools/gmail-token`). Who is sending comes from the verified Google sign-in session on the server, never from the request, so it needs `AUTH_REQUIRED=true`; with sign-in off, or for anyone not in the map, the server refuses (401 or 403) and nothing is sent. `gmail.ts` also checks each token really belongs to the address it is filed under. Replies to these emails land in the sender's own inbox, so they are saved with no Gmail thread id and the reply sync (shared account only) skips them. Testing-mode tokens expire after 7 days: re-mint with `tools/gmail-token` and update the env var.
- **Open in Gmail:** the same dialog can open Gmail's compose window with the address, subject and message filled in (`compose.ts`), so the operator sends it from whichever Gmail they are signed in to in the browser. Nothing goes through our credentials, and it works for anyone. "Mark as sent" then records it in the app.
- The proposal link carries `?ref=email` so opens can be tied to the email.

### Tools for the general agent (`src/features/agent-tools/tools.ts`)

The Agent tab's chat agent orchestrates the pipeline by calling it as tools. The research loop stays inside the tools; the chat agent never runs web search itself. `createPipelineTools({ onProgress })` returns SDK runnable tools, so the route passes them straight to `client.beta.messages.toolRunner({ tools, ... })`. Append `PIPELINE_TOOLS_PROMPT` to the agent's system prompt.

| Tool | Does |
|---|---|
| `scout_projects` | Live scout (1-2 min), stored for Discover |
| `get_scout_results` | Latest scout result, no search |
| `research_dossier` | Live dossier for `demo-project` or a scout id (1-3 min), stored for the Dossier screen |
| `get_dossier` | Latest dossier, no research |
| `list_stakeholders` | The demo project's stakeholders (client ids) |
| `draft_outreach` | Drafts a stakeholder's email; sends nothing |
| `send_outreach` | Sends the draft to the allowlisted inbox; needs `confirmed: true` after the user asks |
| `list_outreach` | Status and replies |
| `get_progress` | The faked progress tracking, labelled as sample |

The tools share run guards and storage with the routes: a scout started from chat appears on Discover, and a second scout while one is running gets a polite error. `onProgress` gets the same progress lines as the NDJSON stream, tagged with the tool name, so the chat can show the agent working.

## API

| Route | Does |
|---|---|
| `POST /api/scout/runs` | Body `{ regions?: RegionId[] }`. Streams a scout run. `?replay=1` replays the last one. |
| `GET /api/scout/candidates` | Latest `ScoutResult` with its `source` (store or snapshot). |
| `POST /api/dossiers/[project]/runs` | Streams a dossier run. `[project]` is `demo-project` or a scout candidate id. `?replay=1` replays. |
| `GET /api/dossiers/[project]` | Latest `Dossier` with its `source`. |
| `POST /api/outreach/[client]/draft` | Drafts (or re-drafts) the email for a stakeholder. Returns the `OutreachMessage`. |
| `POST /api/outreach/[client]/send` | Sends the stored draft through Gmail to the allowlisted inbox. |
| `GET /api/outreach` | `OutreachOverview`: Gmail status, messages, replies (synced at most every 30 s). |

Long routes set `maxDuration = 300`. The NDJSON routes return `content-type: application/x-ndjson`.

## Env

```
ANTHROPIC_API_KEY=        # research and drafting (already used by generation)
GOOGLE_CLIENT_ID=         # Gmail OAuth client
GOOGLE_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=      # minted once with tools/gmail-token
OUTREACH_DELIVER_TO=      # every demo email lands here
OUTREACH_ALLOWLIST=       # comma-separated; anything else is refused
PUBLIC_BASE_URL=          # base for proposal links in emails
```

## Gmail setup (one time, about 10 minutes)

1. In Google Cloud, create a project, enable the Gmail API, and set the OAuth consent screen to External in Testing mode. Add the demo Gmail account as a test user.
2. Create an OAuth client of type Desktop app. Put its ID and secret in `.env.local`.
3. Run `tools/gmail-token`, sign in as the demo account, and paste the printed refresh token into `.env.local` as `GMAIL_REFRESH_TOKEN`. Testing-mode tokens last 7 days.

## Not done here

- Screens. The internal-app session builds them against these contracts.
- Supabase tables. Add them when the project has keys. `json-store.ts` is the only place that changes.
- Permit-data feeds. NYC DOB, Analyze Boston and Philadelphia L&I all answer without a key, but they give owner LLCs, not named projects with firms. Web research covers all five regions instead.
