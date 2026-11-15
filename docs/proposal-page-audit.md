# Proposal page audit

`/proposals/[client]`, 15 November 2026. File: `src/app/proposals/[client]/page.tsx`. This is the page a prospect opens from the outreach email, the only client-facing surface, so it carries the full Tradesmark brand kit (the internal app only borrows accents).

Sources: Michael's product brief (`docs/context/`, overview v3 §5 "The proposal"), his standing rules (brand kit `09 Rules from Michael/Rules.md`), and the brand kit's Color, Type, Composition Standard and Copy Standard. Reviewed with Fable 5.2.

## What it must be

A hosted Tradesmark page that opens already playing: one drone-style flight up into the client's building, with a short line over it. Then the problem and the solution for this client's role, how we would film their part of the project (the shots and the shot list), one line saying we work across the whole project, and a single action: book a call. No pricing, no scope. Opens, watch time and clicks are tracked.

## Before / after

| Before | After | Why |
|---|---|---|
| Problem and solution in `text-zinc-300` on Plaster, about 1.4:1 | Asphalt body text, 19 px Geist 500 | Color.md: body text 4.5:1. The scaffold's colors were written for a dark page |
| Teaser line in Asphalt over the dark scene, invisible | Stucco on Asphalt, Rigid Square | Type.md: on Asphalt the heading and body go to Stucco |
| "Mock Glazing Co. (placeholder)" shown to the client | The company name only | Data marker, not copy |
| Viewer chrome in the hero: compass, view buttons, orbit hint | Teaser only, `interactive={false}` | The brief asks for a teaser, not a viewer |
| No shots: `ShotReel` and `pitch.shotCaptions` exist but are not rendered | The client's shots with one caption each, and the shot list (platform, lens, light, phase) | The brief's "how we'd treat their project"; the demo's visual impact |
| No call to action | One Cone "Book a call" button, tracked as a click | The brief's CTA; without it click tracking has nothing to count |
| `pitch.acrossProject` generated, never shown | One line | The brief: each proposal references the others |
| H1 in Geist 30 px, ~20 words | Rigid Square 600 heading, six words or fewer (the building name); the rest moves to the lead | Type.md: Rigid Square for headings of six words or fewer, default on web with no switch |
| Centered `max-w-3xl` column | Pinned to the 12-column grid's left edge, asymmetric spans | Rules.md: pin content to the top and edge; center only a lone item |
| "Company · Project" line over a headline naming both | Mono label with the client only | No redundant eyebrows |
| No logo, no footer | Logo in the hero, footer with logo and contact | A Tradesmark page |

## Copy conflicts with the generator

The pitch generator (`src/features/pitch/`, Behruz's) writes a ~20-word headline, 60 to 80 word paragraphs, and does not ban em dashes or "not X but Y". Rules.md wants one or two lines per idea. The prototypes work with the generated copy as it is; a change to the generator is a separate ask on the board.

## Direction

1. Plaster page, Asphalt only for the opening and the close, Cone only on Book a call.
2. Label, heading, body pairing: Geist Mono 13 caps, Rigid Square 600, Geist 500 19.
3. Opening plays on its own with no controls.
4. Shots are live camera paths in `ModelViewer` (never video), captioned from the pitch.
5. One action.

## Open questions

- Wireframe overlay on the teaser: the brief asks for it, but Michael rejected every wireframe study (2026-10-26) and pointed at a new line reference (2026-11-12). The prototypes ship without it.
- One canvas or two: the opening and the reel can be one viewer or two. The two variants split on this.
- Book a call target: the prototypes use the company contact email from the Company Profile until there is a calendar link.

## Decision (15 November 2026)

Picked **Brief** from `/proto-proposal` (Current, Reel, Brief), and promoted it into `/proposals/[client]`.

- Direction: a page you read, with the film in its place. Asphalt opening (about 72svh): the teaser flight plays once with no controls and holds its last frame; company as a label, teaser line in Rigid Square, Stucco.
- Plaster project section: facts rail on columns 1 to 4 (address, building, scope, timeline, height), main column on 5 to 12 with the project name as the Rigid Square heading, the generated headline as a lead, problem and solution at 62ch.
- "Shot plan": the reel in a 16:9 frame on columns 1 to 8, mounted when scrolled into view, with the current shot's counter and caption under it; the shot list on 9 to 12 with a Mono spec line per shot; the shot on screen marked with a 2 px Cone hairline; clicking a row jumps the reel.
- `acrossProject` as one 28 px line under a rule, then an Asphalt close ("Plan the shoot", the Cone Book a call button, footer with the logo and contact email).
- The two canvases take turns holding the model (one cached GLB scene can only have one parent).
- Rejected, **Reel**: one sticky canvas where the teaser hard-cuts into the reel, Book a call pinned in a top bar, no shot list. Strongest first 20 seconds, but the 30 s reel planner kept only 3 of 5 shots, the shot list (crew detail the brief asks for) disappeared, and the looping film had no pause.
- Rejected, **Current**: the scaffold (unreadable text, no shots, no action).
- Still open: the wireframe overlay, a calendar link for Book a call, and the generator's copy length (a board ask to Behruz).
