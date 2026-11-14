# Policy score (feature 2)

How favorable or unfavorable a county is for building a data center. Agentic: an LLM agent researches the county's policies and returns a score with its reasoning.

| File | Purpose |
|---|---|
| `schema.ts` | Zod schema for the request and the score result. Shared by the API route and the UI. |
| `agent/` | The agent: prompts, tools, and `scorePolicy()`. Server only. Keep LLM keys out of the client. |
| `components/` | Score badge, reasoning panel. |

API: `POST /api/policy-score` (`src/app/api/policy-score/route.ts`).

Agent runs can take longer than a normal request. If they outgrow a route handler's time limit, move `agent/` behind a background job; nothing else needs to change.
