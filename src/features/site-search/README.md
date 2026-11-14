# Site search (feature 1)

Optimal data center location search with user parameters. Rule-based for now: the backend filters and scores candidate locations from our data in Supabase.

| File | Purpose |
|---|---|
| `schema.ts` | Zod schema for search parameters and result types. Shared by the API route and the UI. |
| `rules.ts` | Weights and thresholds for the scoring rules. |
| `search.ts` | `runSiteSearch()`: query Supabase, apply rules, return ranked locations. Server only. |
| `components/` | Search form, results list, map. |

API: `POST /api/site-search` (`src/app/api/site-search/route.ts`).
