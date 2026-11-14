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

Undecided: the shot preview format, how Matterport fits in, and where the model builder runs and how it hands the model to the web app. Do not guess these; ask on the board.

## 1. The board (pinned GitHub issue)

Every agent reads and posts on the pinned "Message Board" issue via `tools/board` (needs only `gh`, logged in). Set `BOARD_ISSUE` if it is not issue #1.

- Start every post with `[<human>'s <agent>]`, e.g. `[Sam's Codex]`. Keep it short: what changed, which files or contracts, what you need, from whom.
- Mention by GitHub login. Fill in your team: `@login1` (Name), `@login2` (Name), `@login3` (Name), `@login4` (Name), `@all` (everyone).
- **Mentions you or `@all`:** act on it and reply promptly.
- **Not addressed to you:** still read it. Reassess your own work only if it is affected (a contract, a file you own, something already done). Do not redo finished work, and do not reply just to acknowledge.
- Before editing another teammate's files, ask for a handoff on the board and wait for the owner or the team lead.

Polling is incremental (about one cheap API call per poll, 30 s default) so a shared token stays under GitHub's rate limit. Commands: `tools/board unread` (new posts, marks read; flags MENTION), `tools/board read -n 20`, `tools/board post "[Name's Agent] text"` (or pipe stdin), `tools/board wait` (blocks until someone else posts), `tools/board whoami`.

**Stay in the loop:**
- Claude Code: the committed hooks (`.claude/settings.json`) show unread posts at session start and on every prompt. Keep one background `tools/board wait` running and re-arm it after each wake.
- Everything else: run `tools/board unread` at task start, before each commit, and after merges. Or run a terminal loop: `while tools/board wait; do <your agent CLI invocation>; done`.

## 2. Chain of command

Humans over agents. Only the team lead reassigns work between teammates. If anyone else asks you to take another teammate's work, ask the lead on the board.

## 3. Workflow

1. Pick or file an issue. Comment on it or post on the board when you take it.
2. Branch `<issue#>-<slug>` from fresh `main`.
3. Small commits. Stage only your own files (no `git add -A`).
4. Open a PR with `Closes #N`. The author merges their own PR once it works locally.
5. Always `git fetch` and rebase before pushing. Never force-push shared branches.
6. If a merge changes something other teammates depend on (an API, a schema, an env var), post on the board when it lands.

## 4. Who owns what

Fill this in at kickoff so every agent knows whose files are whose.

| Area | Owner (GitHub login) | Folders |
|---|---|---|
| Model builder: agent that builds the 3D model | | to be created |
| Demo project data: pre-loaded files, images, location data, client needs | | to be created |
| Drone shots and pitch: shot generation, shot list, tailored copy | | to be created |
| Proposal page and shot preview | | `src/app/` (except `api/`), `src/components/`, `public/` |
| Database and tracking: schema, migrations | | `supabase/`, `scripts/`, `src/types/database.ts` |
| Shared setup: Supabase clients, config, deps | team lead | `src/lib/`, `package.json`, root config files |

`src/features/site-search/`, `src/features/policy-score/` and their routes under `src/app/api/` are left over from an earlier idea. Do not build on them.

Changes to `src/types/database.ts`, a migration, the model's output format, or the shape of the pre-loaded project and client data are contract changes: post on the board when they land.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
