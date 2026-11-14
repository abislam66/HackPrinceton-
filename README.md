# HackPrinceton: Project Proposal System

An internal sales tool for Tradesmark, a company that films and documents construction projects. It turns a construction project into a bespoke, animated proposal page for a client on that project: a 3D model of their building, drone shots planned around what they care about, and a pitch written for their needs.

By hand, one proposal takes 25 to 500 hours. The long-term goal is one for every stakeholder on every major project. The hackathon build proves it on one project.

## Hackathon scope

**One pre-loaded demo project, 1 to 2 clients.** Three clients is the best case. If this version is done early, we build more.

### What we build

1. **3D model build.** An agent builds the 3D model of the project from the pre-loaded files and images. The model is mostly the same on every run, and every client's proposal uses the same one.
2. **Drone shot generation.** From the model and the client's needs, the agent generates a set of drone shots.
3. **Tailored pitch.** A pitch and shot list for each client, driven by the pre-loaded project info and that client's needs.
4. **Proposal page.** A hosted web page per client: it opens on an animated fly-up into their building, then shows the pitch, the renders and a "book a call" button, and it tracks opens, watch time and clicks.
5. **Shot preview.** A second view showing how the shots would come out: an animated demo of the shots, not a rendered video. The exact format is still open.

A person reviews each proposal and sends it.

### What is pre-loaded, not built

- **Project research.** There is no live research. The demo project ships with its files, images and location data already in the repo.
- **Client needs.** Fake client needs, in two variations, are pre-loaded. Nothing is classified live from company data.
- **Stakeholder contacts.** Pre-loaded with the project.

### Pitched as visuals only

Scouting, the dossier stage, outreach, and progress tracking after a client signs.

### Still open

- The LLM provider for shot and pitch generation.
- The geometry libraries inside the model builder.
- How the Matterport resource fits in (details to come).
- The final format of the shot preview.

## Stack

- **Web app:** Next.js 16 (App Router), TypeScript, Tailwind CSS, Zod
- **3D in the browser:** three.js through React Three Fiber and drei
- **Model builder:** Python, managed with uv, with a FastAPI service around it
- **Database:** Supabase Postgres

The decisions behind this and the contracts between the parts are in [technical-architecture.md](technical-architecture.md).

## Layout

```
data/demo-project/        pre-loaded project, clients and needs, images
model-builder/            Python: builds the 3D model (command line + FastAPI service)
public/models/            model builder output
src/
  app/                    pages and API routes
    proposals/[client]/           proposal page
    proposals/[client]/shots/     shot preview
  features/
    project/  model/  viewer/  shots/  pitch/  proposal/  tracking/
  lib/supabase/           Supabase clients
supabase/migrations/      proposals and tracking tables
resources/                links and reference material
tools/board               agent message board (see AGENTS.md)
```

## Getting started

Web app:

```bash
npm install
cp .env.example .env.local   # Supabase keys are optional to start
npm run dev                  # http://localhost:3000
```

Model builder (needs [uv](https://docs.astral.sh/uv/)):

```bash
cd model-builder
uv sync
uv run model-builder build demo-project   # build once from the command line
uv run model-builder serve                # or run the service the web app calls
```

Checks before pushing: `npm run lint && npm run typecheck`, and `uv run pytest` in `model-builder/`.

## Team rules

Every agent follows `AGENTS.md`: read the scope there first, post on the pinned board issue, stay in your own folders, and ask for a handoff before editing someone else's.
