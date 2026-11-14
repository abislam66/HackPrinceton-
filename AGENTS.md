# Team rules for every agent

## 0. What we are building (read this first)

The **Project Proposal System**: an internal Tradesmark tool that produces a bespoke, animated proposal page for a client on a construction project. Tradesmark films and documents construction projects; the proposal sells that service.

**Hackathon scope: one pre-loaded demo project, 1 to 2 clients (3 is the best case).** Do not build past this without the team lead saying so.

Built:
1. **3D model build.** An agent builds the project's 3D model from the pre-loaded files and images. The model is mostly the same every run and is shared by every client's proposal.
2. **Drone shot generation.** The agent generates drone shots from the model and the client's needs.
3. **Tailored pitch.** A pitch and shot list per client, from the pre-loaded project info and that client's needs.
4. **Proposal page.** A hosted page per client: animated fly-up into the building, the pitch, the renders, a "book a call" button, and tracking of opens, watch time and clicks. No pricing or scope on the page.
5. **Shot preview.** A second view showing how the shots would come out: an animated demo, not a rendered video. The exact format is undecided; ask on the board before choosing one.

Pre-loaded, never built live:
- **Project research.** No scraping or live lookups. The demo project's files, images and location data are in the repo.
- **Client needs.** Fake needs in two variations. Do not build needs classification from company data.
- **Stakeholder contacts.**

Out of scope (slides only): scouting, dossier, outreach, progress tracking after signing.

Undecided: the LLM provider, the model builder's geometry libraries, how Matterport fits in, and the final shot preview format. Do not guess these; ask on the board.

### Technical decisions

Full detail and the contracts are in `technical-architecture.md`. Read it before writing code.

- **Two programs.** The web app (Next.js, TypeScript, in `src/`) is the only backend the browser talks to. The model builder (Python, in `model-builder/`) builds the 3D model. FastAPI only wraps the model builder; do not add other endpoints to it.
- **Handoff:** the model builder writes `model.glb` and `model.json` to `public/models/<project>/`. Until `model.json` exists the web app shows a gray-box stand-in.
- **A shot is data, not video:** a camera path the browser plays live. Never render shots to video files.
- **One viewer:** the proposal's opening and the shot preview both use `ModelViewer` in `src/features/viewer/`. Do not build a second 3D view.
- **Pre-loaded data is files** in `data/demo-project/`. Generated proposals and tracking events are rows in Supabase.
- **Coordinates everywhere:** meters, +Y up, +X east, -Z north, origin at the center of the footprint at ground level.
- **LLM output is parsed with the Zod schema** (`shotListSchema`, `pitchSchema`) before it is stored or shown.
- **Cache Components is off.** Write normal dynamic pages; do not add `"use cache"`.
- Python uses `uv` (`uv sync`, `uv run`, `uv add`). The web app uses `npm`.

### Source material

Tradesmark's own documents are in `docs/context/`: the product brief, the system board, and their model-building method. Start with `docs/context/README.md`. Use them to understand the product and for the rules that carry over (no pricing on the page, client images never shown, the model never built by hand, shots only on sides with real reference). **Where they differ from the scope above, the scope above wins.** They describe the full product and refer to scripts we do not have.

## 1. The board (pinned GitHub issue)

Every agent reads and posts on the pinned "Message Board" issue via `tools/board` (needs only `gh`, logged in). Set `BOARD_ISSUE` if it is not issue #1.

- Start every post with `[<human>'s <agent>]`, e.g. `[Sam's Codex]`. Keep it short: what changed, which files or contracts, what you need, from whom.
- Mention by GitHub login. The team: `@abislam66` (Abrar), `@banneddb` (Behruz), `@templeterror` (Rafiat), `@all` (everyone).
- **Mentions you or `@all`:** act on it and reply promptly.
- **Not addressed to you:** still read it. Reassess your own work only if it is affected (a contract, a file you own, something already done). Do not redo finished work, and do not reply just to acknowledge.
- Before editing another teammate's files, ask for a handoff on the board and wait for the owner or the team lead.

Polling is incremental (about one cheap API call per poll, 30 s default) so a shared token stays under GitHub's rate limit. Commands: `tools/board unread` (new posts, marks read; flags MENTION), `tools/board read -n 20`, `tools/board post "[Name's Agent] text"` (or pipe stdin), `tools/board wait` (blocks until someone else posts), `tools/board whoami`.

**Stay in the loop:**
- Claude Code: the committed hooks (`.claude/settings.json`) show unread posts at session start and on every prompt. Keep one background `tools/board wait` running and re-arm it after each wake.
- Everything else: run `tools/board unread` at task start, before each commit, and after merges. Or run a terminal loop: `while tools/board wait; do <your agent CLI invocation>; done`.

## 2. Chain of command

Humans over agents. The team lead is Rafiat (`@templeterror`). Only the team lead reassigns work between teammates. If anyone else asks you to take another teammate's work, ask the lead on the board.

## 3. Workflow

1. Pick or file an issue. Comment on it or post on the board when you take it.
2. Branch `<issue#>-<slug>` from fresh `main`.
3. Small commits. Stage only your own files (no `git add -A`).
4. Open a PR with `Closes #N`. The author merges their own PR once it works locally.
5. Always `git fetch` and rebase before pushing. Never force-push shared branches.
6. If a merge changes something other teammates depend on (an API, a schema, an env var), post on the board when it lands.

## 4. Who owns what

| Area | Owner (GitHub login) | Folders |
|---|---|---|
| Model builder: builds the 3D model | `abislam66` (Abrar) | `model-builder/`, `public/models/` |
| Demo project data: project, clients and needs, images | `abislam66` (Abrar) and `banneddb` (Behruz), jointly | `data/` |
| Generation: shots, pitch, proposal pipeline | `banneddb` (Behruz) | `src/features/shots/generate.ts`, `src/features/pitch/`, `src/features/proposal/`, `src/app/api/proposals/` |
| Viewer and shot preview: 3D view, camera paths | `abislam66` (Abrar) | `src/features/viewer/`, `src/features/shots/ShotPreview.tsx`, `src/app/proposals/[client]/shots/` |
| Proposal page and tracking | `templeterror` (Rafiat) | `src/app/page.tsx`, `src/app/proposals/[client]/page.tsx`, `src/features/tracking/`, `src/app/api/track/`, `supabase/` |
| Shared: contracts, Supabase clients, config, deps | `templeterror` (Rafiat), team lead | every `schema.ts`, `src/features/model/`, `src/app/api/model/`, `src/lib/`, `src/types/`, `package.json`, root config files |

**Demo project data has two owners.** Before changing anything in `data/`, ask both Abrar and Behruz on the board and wait for both, even if your human is one of them. Changes there should be rare.

The contracts are listed in `technical-architecture.md`. Changing one (a `schema.ts`, `model-builder/src/model_builder/contract.py`, a migration) is a contract change: agree it with the owners it affects first, and post on the board when it lands.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
