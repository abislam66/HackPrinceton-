# Internal app UI (hi-fi)

The internal app wears Tradesmark's design system (`DESIGN.md`, `docs/design/`) inside a SaaS structure: a sidebar, then pages of cards, tables and a workspace. `DESIGN.md`'s hard rules apply everywhere:
- brand colors only;
- Plaster pages;
- square corners (nothing rounder than 3 px);
- no shadows;
- Rigid Square headings;
- Geist Mono caps labels;
- Cone on one thing.

This file adds what an app needs on top of that. The structure comes from the approved wireframes (Figma section `94:610`).

## Grounds: depth is a change of ground

| Surface | Ground | Class |
|---|---|---|
| Page | Plaster | `bg-ground` (set by the app layout) |
| Sidebar | Stucco, with a 1 px `border-rule/40` on its right edge | `bg-stucco` |
| Card, panel, table, dialog | Sheet, with a 1 px `border-rule/40` | `bg-sheet` |
| Hover, selected row, inset readouts | Stucco | `bg-stucco` |
| The one big moment per page | Asphalt | `tm-ground-asphalt` |

**The big moment per page.** On the stakeholder workspace it is the 3D viewer frame and its caption strip. On the project overview it is the facts band. No other page gets one.

**Dividers:**
- Between rows: `border-rule/40`.
- Card frame: `border-rule/40`.
- Strong section rule: `border-rule`.

Text keeps 20 px (`p-5`) from every rule, border and ground edge.

## Type in the app

Use at most 7 sizes per view. All of these are classes from `src/styles/tradesmark/type.css`.

| Role | Use |
|---|---|
| Page title | `<Heading size="s" as="h1">` (Rigid Square up to six words, else Geist 600) |
| Kicker / card title / table header / field label / metric label | `tm-label` (mono caps), `tm-muted` where secondary |
| Row title, primary interface text | `tm-text--m` with `font-semibold` for the title |
| Secondary line, captions, helper | `tm-text--s tm-muted` |
| Paragraph to read (pitch, needs notes, summary) | `tm-body` with `max-w-[66ch]`, or `tm-text--m` inside a 340 px panel |
| Metric value, big readouts | `tm-h tm-h--xs tm-num` |

`tm-num` goes on every number that changes or sits in a column.

## Cone: one thing per view

Cone appears only in these places:
- the wordmark;
- the primary button (`Button variant="primary"`), one per view;
- the 2 px bar under the active tab;
- the arrow cell in a secondary button's hover (built into `Button`);
- the running state while the agents build (`Tag variant="cone" pulse` plus a `tm-tape` edge on the viewer);
- the selected shot's number cell;
- `Eyebrow` squares on Asphalt (set by `tm-ground-asphalt`).

Never on body text under 28 px. Never as a fill behind content.

## Shared components (`src/components/ui/`)

Each set below is closed. Screens import only these: no one-off buttons, tags or cards.

| Component | API | Rules |
|---|---|---|
| `Button` | `{ children: string; variant?: "primary" \| "ghost" \| "ghost-light"; arrow?: boolean; compact?: boolean; full?: boolean; href?; ...native }` | The Tradesmark button: 1 px frame, rolling label, arrow cell, 40 px tall. `primary` is Cone with an Asphalt label, the one main action per view (also on Asphalt). `ghost` (the default) is an Asphalt frame whose hover is a 6% tint, never a black fill. `ghost-light` is a secondary action on Asphalt. `arrow` (default true) for actions that go somewhere, false for in-place actions (Save, Copy link, Cancel). In the app always pass `compact` unless it is the lone CTA of an empty state. Disabled: `disabled` (or `aria-disabled` on links). |
| `Tag` | `{ children; variant?: "line" \| "ink" \| "cone" \| "quiet" \| "go" \| "halt"; pulse?: boolean }` | A mono caps chip framed in Concrete. Never filled; the variant sets a leading 8 px square:<br>• `line` (default): no square, for categories, counts and filters.<br>• `ink`: an Asphalt square, for a state that is set.<br>• `quiet`: no square, Mortar text, for not-started or inactive items.<br>• `cone`: only while the agents run (`pulse` blinks the square; still under reduced motion).<br>• `go` / `halt`: pass and fail only. |
| `Heading` | `{ children; size: "xl" \| "l" \| "m" \| "s" \| "xs"; as? }` | Picks Rigid Square (six words or fewer) or Geist 600. |
| `Eyebrow` | `{ children; square?: boolean }` | Mono caps kicker with a square marker. The title of every card and section. |
| `Cells`, `Cell` | `Cell { pressed: boolean } & button props` | Boxed options for toggles and filters. |
| `Tabs` | `{ items: { label; href; active }[] }` | Link tabs drawn as framed cells, 44 px tall. The active one is `aria-current="page"`: Sheet with a 2 px Cone bar along its bottom edge. The others are framed in Concrete with Mortar text and a tint on hover. |
| `Field` | `{ label; error?; multiline? } & input/textarea props` | `tm-field` / `tm-input`: 2 px corners, 16 px text. The label is always visible. |
| `Card` | `section` props | `bg-sheet border border-rule/40`. Pass padding in (`p-5` by default when used as a panel). |
| `PageHeader` | `{ breadcrumbs?: { label; href? }[]; title: string; description?: ReactNode; actions?: ReactNode }` | Breadcrumbs as `tm-label tm-muted` links separated by "/". Then `Heading size="s"`, the description as `tm-text--m tm-muted`, and the actions bottom-right. 32 px (`pb-8`) below. |
| `Metric` | `{ label: string; value: ReactNode }` | A `tm-label tm-muted` label over a `tm-h tm-h--xs tm-num` value, on `bg-stucco p-4`. |
| `EmptyState` | `{ eyebrow?: string; title: string; description: string; action?: ReactNode }` | Pinned top-left, never centered (unless it is the lone item in a viewer). |
| `Dialog` | existing API | `bg-sheet border border-asphalt`, square, no shadow. The `::backdrop` is Asphalt at 55%. |
| `Table`, `THead`, `TH`, `TR`, `TD` | `TD { num?: boolean }` | Header `tm-label tm-muted bg-stucco`, rows `tm-text--m`, `border-rule/40` between rows, `num` right-aligned with `tm-num`, 20 px cell padding on the left and right. |
| `Avatar` | `{ name: string }` | A square 40 px `bg-stucco` tile with mono initials. Square, never round. |
| `Wordmark`, `Logomark` | from the brand kit | Cone by default. Never redrawn. |
| `Sidebar` | – | `bg-stucco`, the wordmark at top, nav rows in `tm-text--m` with 16 px lucide icons. The active row is on `bg-ground` with an Asphalt 8 px square at the right end. "Reset demo" sits at the bottom as a `tm-label` ghost button. |

Icons: `lucide-react`, 16 px, `strokeWidth={1.5}`, in the text color.

## Status mapping (stakeholder stage)

| Stage | Tag |
|---|---|
| not built | `quiet` "Not built" |
| building | `cone pulse` "Building" |
| ready | `ink` "Ready to send" |
| sent, opened | `go` "Opened · N" |
| sent, not opened | `quiet` "Sent · not opened" |

Sample data gets a `quiet` "Sample" tag.

## Decision: control skin (from `/proto/controls`, 2026-11-14)

Rafiat picked **Cone-led** over the black baseline. Its styles live in `src/styles/app/controls.css`, loaded after the brand `components.css`; the brand files are untouched.
- **Primary:** Cone fill with an Asphalt label. On hover it darkens 10% toward Asphalt, and the arrow cell slides in Asphalt with a Cone arrow.
- **Secondary:** an Asphalt frame with a 6% hover tint.
- **Disabled:** Stucco or Limestone tokens, not opacity.
- **Pressed:** 0.97 over 120 ms.
- **Tabs:** framed cells; the active one gets a 2 px Cone bar.
- **Tags:** framed, with leading status squares.

Rejected:
- **Baseline (Asphalt fills).** Rafiat: "not a fan of buttons and labels being black".
- **Line-only and Mineral tonal.** Not picked; Rafiat gave no reason. The builder noted that Mineral's Stucco-on-Sheet boundary is very faint.

Rafiat said more work is coming on this direction. `/proto/controls` stays up for the next round.

## Motion

Use the brand easings `ease-handle` / `ease-link`. Buttons roll their label on hover (built in). Hover color changes take 150 to 250 ms. Dialogs fade in over 200 ms. No motion on navigation or tabs, and everything respects reduced motion.
