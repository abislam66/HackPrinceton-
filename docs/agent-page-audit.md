# Agent page audit

`/agent`, 15 November 2026. Files: `src/app/(app)/agent/_components/AgentChat.tsx`, `src/components/chat/{ChatThread,ChatComposer,PastChats,useAgentChat}.tsx`. The project agent panel shares the thread and composer, so whatever wins here should work in a 400 px panel too.

## What it is

The Agent is the operator's console for the live pipeline. It can **scout** five Northeast regions, **research a dossier** on one project, **list stakeholders**, **draft and send outreach**, read **replies**, and show (sample) **progress**. Scouts and dossiers run for minutes and stream progress lines. Replies are plain text, with "- " lines for lists. History is stored in this browser: 20 chats, 40 turns each.

So it is a tool that runs jobs, not a chat companion. The page should look like the product around it (sidebar, panels, Media rows, Segmented tabs, Tint tags), not like a marketing hero.

## Before / after

| Before | After | Why |
|---|---|---|
| Centered "What do you need done?" in Rigid Square display type, above a lone box, ⅖ down an empty page | A product page: a page header (or none) and the composer where it lives in every state | The marketing hero is the Laminar look the redesign removed everywhere else; empty-state copy is a question, not a capability |
| Blank prompt, no hint of what the agent can do | Its jobs visible on arrival: Scout, Research, Outreach, Replies, each one click into a prefilled prompt | NN/g's chatbot guidelines: state capabilities, offer relevant prompts. Tool names are the capabilities |
| Waiting is one muted line ("Running scout projects…") that is replaced on every progress event | Each tool call a step with its name, live progress, elapsed time, and a done/failed state, collapsed when finished | Scouts take minutes; a single line that keeps changing reads as flicker, and the history of what it did is lost |
| No way to stop a run | A Stop control while pending | Cancellation is the most overlooked agent-UI state; the hook already holds an `AbortController` |
| Replies are pre-wrapped text at 15 px with "Agent" over them | "- " lines rendered as lists, numbers in `app-num`, project names linking to their pages | The reply is the deliverable; a 15-line list as raw text is a wall |
| "You" / "Agent" labels on every turn, your prompts in framed Sheet boxes | One distinction (alignment, ground, or rule), not a label plus a frame | Two signals for one fact |
| Past chats hidden in a `<details>` disclosure, top left | History where it can be scanned: a list, a menu with search, or a rail | 20 chats behind a disclosure are effectively gone |
| `Enter to send · Shift+Enter for a new line` permanently under the box, in mono | Shown on focus or dropped; the send button carries the shortcut | Permanent instruction text for a known convention is noise |
| Asphalt 55% frame around the composer | The app's field treatment (`rule` border, Cone focus ring) | Matches every other input since #57 |
| Errors as muted text, the same weight as captions | Error with icon, text and a Retry action | Errors need more than colour and size, plus a way out |

## What others do

- Agent UIs that run long jobs move job state out of the thread: tool calls shown as steps with name, running state and result, collapsed when done; a separate task or activity view when runs are long (Hatchworks, Glama, tianpan.co).
- Response-time limits (0.1 s, 1 s, 10 s) put any wait past 10 s outside attention. Minutes-long runs need progress you can leave and come back to, not a spinner (UX Collective, "the waiting problem").
- Evidence here is practitioner writing, not controlled research; treat it as convention.

## Direction

1. The page uses app chrome: no display headline, composer docked at the bottom of the work area in every state.
2. Capabilities are the empty state.
3. Tool runs are first-class objects with steps, time and a stop.
4. Replies render their lists and link the things they name.
5. History is browsable.
6. Same components as the rest of the app; Cone only on Send (and the running state).

## Open questions

- Should finished runs live in the thread, or in a separate Runs list across chats?
- Does the Agent page need history at all, or should each run land in the record it changed (a dossier, a project, an outbox)?
- The reply is plain text by system prompt. Structured results (project cards, a dossier summary) would need the tool results in the stream.

## Decision

**Handoff**, picked from the five directions at `/proto/agent` on 2026-11-15, and shipped on `/agent`.

What it does:
- The conversation on the left, a sticky **Runs** rail on the right (a "Runs (n)" toggle above the thread under 1100 px). Each tool call is a run card: label, Running / Done / Failed / Stopped tag, live elapsed time, its progress lines behind "Show steps", a dashed "opens here when ready" placeholder while running, and Stop.
- A finished run with somewhere to go shows a small preview (dossier: three key facts, firm and source counts; 3D model: status and when it was generated; scout: top three with city and fit, and the total; draft: who it is to and the subject), **one Open link**, and its other destinations as quiet links.
- The reply renders paragraphs and real lists, links the project names the chat's runs returned (and app paths it writes out, when they are real pages), and ends with result rows, each one link.
- A result that finishes while the rail is out of view raises a notice above the composer: role=status, gone after 6 s, paused on hover or focus, Escape to dismiss, stacks several results of one prompt.
- Cone rule: the newest unread result's Open is primary and Send drops to secondary, until the user types or follows one of its links; otherwise Send is primary. One Cone in view.
- Empty state: four quick actions that prefill real prompts (Scout projects, Research a dossier, Build a 3D viewer, Draft outreach). History: a Past chats popover with a filter, grouped by day. Runs are saved with each chat.
- It needed the structured results the open question above asked about: `/api/agent` now streams a `result` event per tool call with its destinations, built only from what the tool returned (`src/features/agent/destinations.ts`).

Rejected:
- **Threads** (a history list beside the chat): makes history easy to browse but does nothing for long runs or their results, which are the page's real job.
- **Ledger** (a dense log of every step): honest and complete, but reads as a debug console; the results it produced are lines among hundreds.
- **Launch** (task launchers per job): good starts, but every job needed its own structured result from the API, more work than the hackathon allows, and free-form asks fall out of it.
- **Bench as-is** (runs as first-class cards beside the chat): the right base, but a finished run had no way to reach its result; Handoff is Bench with that added.
- **Peek** (results open in a side peek): keeps you on the page, but each result type needs its own view to build and keep in step with the real screens, which already exist one click away.

## Sources

- NN/g, "10 Guidelines for Designing Your Site's AI Chatbots" (April 2026), via https://frontpage-reader-eta.vercel.app/article/cmojyhvtd0007blqcilnnc9rt
- https://hatchworks.com/blog/ai-agents/agent-ux-patterns/
- https://glama.ai/blog/2025-08-27-designing-tool-enabled-chat-interfaces
- https://tianpan.co/blog/2026-03-15-designing-the-human-agent-interaction-layer
- https://uxdesign.cc/the-waiting-problem-in-ai-products-e7c11fd5a825
