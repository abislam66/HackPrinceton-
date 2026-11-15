# Internal app redesign: unslop audit (2026-11-14)

The internal app uses the Tradesmark design system, which was built for marketing pages. This audit judges the app as a product UI: a tool the team uses many times a day. It feeds the prototype pages at `/proto/buttons`, `/proto/tags`, `/proto/tabs`, `/proto/rows` and `/proto/surfaces`. The control-by-control inventory is at `/kit`.

## The finding

The app shows none of the usual generated tells: no indigo, no gradients, no glass, no emoji. Its tell is different: **a marketing system applied wholesale to a work tool.** Every control is built to sell:

- a 1 px frame on every element: buttons, tags, tabs and cards;
- mono caps for every label;
- an arrow cell on every button;
- rolling labels on hover.

When everything is framed, nothing stands out, and the screen reads as a brochure for a tool.

## Subtract first

| Before | After | Why |
|---|---|---|
| "Sample" tags on every faked row (7 places) | One "Sample data" note per page | Repeated per row it is noise; once per page it is still honest |
| A subtitle under every page title ("Every project with stakeholders to pitch") | Cut, or replaced with a count that carries information ("4 projects · 2 in outreach") | Most restate the title |
| The 8 px square on every eyebrow (8 places) | Gone | A brand mark with no job inside a tool |
| An arrow cell on 12 buttons | Only on buttons that leave the page, or none | A marketing CTA device; it doubles button width and truncates the stakeholder names beside it |
| The Asphalt key-facts band on the project overview | Merged with the Dossier card, which repeats Owner, Use and Facade | The same facts appear twice on one screen |
| Outreach's "Nothing sent yet…" line above a full table | Cut | It contradicts the table under it |
| Grey building placeholders on Discover | A real model thumbnail or a map, or nothing | They fill space and say nothing |

## Redo what survives

| Before | After | Why |
|---|---|---|
| Mono caps on tags, tabs, table headers, hints, 22 labels | Sentence case for the interface; mono only for data (floors, heights, durations, dates) | Mono caps is a spec-sheet voice: on chrome it shouts and slows scanning, on data it is a signature |
| Framed tags with a status square | A status mark plus text; categories (Sample, filters) styled apart from statuses | "Ready to send" (a state) and "Sample" (a fact) look the same today |
| Framed tabs, each its own cell | Underline tabs or a segmented control | Framed cells are a marketing grid; tabs are views of one thing |
| Buttons with a rolling label on hover, 240 px minimum width, 44 px height | 28–36 px compact buttons, a tint on hover, a 0.97 scale on press | A tool clicks the same button 50 times a day; the roll only pays off on a landing page |
| Plaster, Sheet and Stucco grounds with borders on all of them | One surface step plus hairlines, or fills without borders | Three near-identical warm tints with borders do not separate |
| Cone and halt tags on the Asphalt viewer use Asphalt text | Text that reads on Asphalt | The build status is invisible during a build (a live bug) |

## Keep: the point of view

These are fixed for every prototype:

1. **Cone `#FF2800`** is the one action colour. It is Tradesmark's own.
2. **Rigid Square** is for page titles only: the one distinctive type decision.
3. **Square corners** everywhere (≤ 3 px). An odd choice used consistently is a signature.
4. **Mono for measurements and data**, where the construction-document voice is earned.
5. **Asphalt only for the 3D viewer.** The actual product gets the stage.

Dropped: arrow cells, rolling labels, framed mono-caps tags and tabs, eyebrow squares, the 240 px button minimum.

## Decisions

Picked by Rafiat from the prototype pages. All five were built into the app on 2026-11-15: the shared components in `src/components/ui/`, tokens in `src/styles/app/tokens.css`, styles in `src/styles/app/controls.css`, and `/kit` as the reference page. The `/proto` pages were retired after promotion. The client proposal page keeps the full brand kit and is untouched.

Built without a decision of their own (Rafiat can overrule): muted text is `--app-muted`, `oklch(0.49 0.022 60)`, because Mortar failed contrast on Plaster and Stucco. Owner left the project header, because Temple University is also a stakeholder row. Discover's filters became plain "Scout criteria" text, because no data lets them filter. The hazard-tape stripe during a build is kept.

- **Surfaces: Sheets** (`/proto/surfaces`, 2026-11-14). Plaster page; content panels are Sheet with a 1px `rgba(asphalt, .10)` border and only `rgba(asphalt, .06)` row dividers inside; never a panel inside a panel. Every panel opens with a header row: a 14 px/600 title, an optional action or count on the right, a divider under it. Key facts leave the Asphalt band: the four measurements sit in a stat strip in their own panel (20 px mono values, 12 px Mortar labels), with the Stakeholders / Dossier / Progress tabs on the page below it, not inside it (Rafiat, 2026-11-15: the tabs "shouldn't be part of that component"), and every name and description goes to the Dossier panel, so each fact shows once. The dialog is a Sheet with an 18% border over an 80% Plaster scrim. Rejected: Ruled and Wells; Rafiat gave no reason.
- **Buttons: Solid** (`/proto/buttons`, 2026-11-14). Cone primary with an Asphalt label; secondary is a Sheet fill with a 1px `rgba(asphalt, .16)` hairline; tertiary is text only. All 32 px tall, 13 px labels, 12 px padding. Rejected: Tonal and Dense; Rafiat gave no reason.
- **Tabs: Segmented** (`/proto/tabs`, 2026-11-14). A 32 px track at `rgba(asphalt, .06)` with a 2 px inset; the active segment is a Sheet fill with a 1px `rgba(asphalt, .12)` hairline and slides between segments (200 ms, `cubic-bezier(.23, 1, .32, 1)`). No Cone in the control. Page tabs fit their labels; in the 360 px panel the control is full width with equal segments. Sidebar nav: a 2 px Cone bar on the active row's left edge, Asphalt text, no fill (confirmed and built, see **Sidebar active row: Edge bar** below). Rejected: Underline and Sidenav; Rafiat gave no reason.
- **Rows: Media** (`/proto/rows`, 2026-11-14). Two-line rows led by a visual drawn from real data: shot rows are 72 px with a 72×48 top-down plan of the camera path (from the shot's keyframes; the footprint is the bounds of every shot's target, the path a 1.5 px Mortar line with a start dot and end arrow, Cone when selected); Discover and project rows are 64 px with a 40×48 elevation, one hairline bar per floor at a fixed pitch so heights compare; stakeholder rows lead with a 40 px initials tile; build steps get a 2 px progress bar. The whole row is the target; selected is a Stucco fill and a 2 px Cone left bar. Rejected: List and Grid; Rafiat gave no reason. Known limit: shots that are mostly vertical rises draw little more than an arrow.
- **Tags: Tint** (`/proto/tags`, 2026-11-14), with a status palette set in OKLCH, recorded in `proto/tags/variants/tint.css`. Neutral statuses are brand orange (Rafiat: "i don't like the grey ones"); Failed moved to crimson and Running to gold to stay apart from it. Rejected: Dot and Icon; no reason given. Open: whether the neutral moves from Cone's hue to Pour orange, because Cone-hue tints render salmon.
- **Sidebar active row: Edge bar** (`/proto/sidebar`, 2026-11-14). Replaces the 8 px Asphalt square and the Plaster fill (Rafiat: the active page "shouldn't have that black square", and asked for orange). The active row is a 2 px Cone bar flush on the rail's left edge, full row height, with the icon and label in Asphalt, no fill and no weight change: the same treatment the Segmented tabs decision set for the sidebar. Inactive rows are unchanged: Mortar, with a Plaster hover. Built into `Sidebar.tsx`, collapsed and expanded. Rejected: Tint, a Cone-hue wash on the whole row (`oklch(0.9 0.05 31)` with `oklch(0.47 0.13 31)` ink); it was briefly built and reverted, because Rafiat had meant to pick Edge bar. Also rejected: Glyph, which turned the active icon Cone at 3.0:1. Rafiat gave no reason for either. The known cost of Edge bar: it is the thinnest of the three signals, and on the collapsed rail the bar sits 20 px from the icon. The nav labels keep the brand's fluid `tm-text--m` size (17 px at 1440) rather than the app's 13–14 px; Rafiat, 2026-11-15: "keep sidebar as is".

## Prototype directions

Variant 1 on every page is the current design, unchanged.

| Page | 2 | 3 | 4 |
|---|---|---|---|
| Buttons | Solid: secondary is a light fill plus hairline, 32 px | Tonal: no borders, weight from tint, 36 px | Dense: 28 px, shortcut shown in mono |
| Tags | Dot: a colour dot plus text, no box | Tint: soft square fills per status | Icon: a status glyph plus text |
| Tabs | Underline: text tabs on a hairline, Cone underline | Segmented: a contained control on a track | Sidenav: project sections as a vertical sub-nav |
| Rows | List: dense single-line rows, the whole row clickable | Media: rows lead with a visual (the camera path as a mini plan) | Grid: aligned columns, right-aligned mono data |
| Surfaces | Ruled: no cards, hairlines and spacing | Sheets: one raised panel step | Wells: secondary info in recessed tints |
