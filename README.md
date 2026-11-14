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

- The exact format of the shot preview.
- How the Matterport resource fits in (details to come).
- Where the model builder runs and how it hands the model to the web app.

## Stack

Next.js 16 (App Router, Node runtime) · TypeScript · Tailwind CSS · Supabase Postgres · Zod

## Layout

```
src/
  app/                    pages and API routes
  features/               one folder per feature
  lib/supabase/           server.ts and client.ts Supabase clients
  types/database.ts       generated Supabase types
supabase/                 migrations and seed data
scripts/                  one-off jobs
resources/                links and reference material
tools/board               agent message board (see AGENTS.md)
```

`src/features/site-search/`, `src/features/policy-score/` and their API routes are left over from an earlier idea and will be replaced by folders for the areas in `AGENTS.md`.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys
npm run dev                  # http://localhost:3000
```

Checks before pushing: `npm run lint && npm run typecheck`.

## Team rules

Every agent follows `AGENTS.md`: read the scope there first, post on the pinned board issue, stay in your own folders, and ask for a handoff before editing someone else's.
