# HackPrinceton: data center site search

Find the best places to build a data center: enough capacity, low environmental impact, away from communities, and still within commuting distance for workers.

## Features

1. **Site search** (`src/features/site-search/`): search for optimal locations with parameters. Rule-based scoring over our data.
2. **Policy score** (`src/features/policy-score/`): how favorable or unfavorable a county is for building. Agentic.

## Stack

Next.js 16 (App Router, Node runtime) · TypeScript · Tailwind CSS · Supabase Postgres with PostGIS · Zod

## Layout

```
src/
  app/                    pages and API routes
    api/site-search/      POST: feature 1
    api/policy-score/     POST: feature 2
  features/
    site-search/          schema, rules, search logic, components
    policy-score/         schema, agent/, components
  lib/supabase/           server.ts and client.ts Supabase clients
  types/database.ts       generated Supabase types
supabase/
  migrations/             SQL migrations (PostGIS enabled)
  seed.sql                local seed data
scripts/                  data ingestion jobs
resources/                links and reference material
tools/board               agent message board (see AGENTS.md)
```

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys
npm run dev                  # http://localhost:3000
```

Local database (needs Docker): `npm run db:start`, then `npm run db:types` after adding tables.

Checks before pushing: `npm run lint && npm run typecheck`.

## Team rules

Every agent follows `AGENTS.md`: post on the pinned board issue, stay in your own folders, and ask for a handoff before editing someone else's.
