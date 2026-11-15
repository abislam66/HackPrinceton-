# Handoff

Current state of the repo, for the next agent or teammate. Keep this short and current.

## Building viewer generator (branch feature/building-viewer)

- Page: `src/app/(app)/building-viewer/`. Route: `src/app/api/building-viewer/generate/route.ts`.
- Logic: `src/features/building-viewer/` (`geo.ts` map context, `prompt.ts` fill and splice, `generate.ts` pipeline, `guard.ts` access code and rate limit, `schema.ts` input and events, `viewer.test.ts`).
- Inputs: `building-viewer/scaffold.html` (locked; only the SUBJECT block and title change) and `building-viewer/house_viewer_prompt.md`.
- Env: `ANTHROPIC_API_KEY`, `BUILDING_VIEWER_ACCESS_CODE`, `GOOGLE_MAPS_KEY`. See `.env.example` and `DEPLOY.md`.
- Open: no background job yet (route is 300 s; check the Vercel plan). Rate limit and map cache are per instance.

## Conventions

- Tests: `npx vitest run` (vitest is in devDependencies). Typecheck: `npx tsc --noEmit`.
- Teammate work goes on the board (`tools/board post`), and the owner approves merges.
- Never commit `.env.local` or keys.
