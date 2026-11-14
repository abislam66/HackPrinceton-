# Layout

The full composition standard is `docs/design/brand-kit/The 24 Rules.md`. This file is how to meet it in this app.

## The grid

| Screen | Columns | Margin and gutter | Tailwind prefix |
|---|---|---|---|
| 981 px and up | 12 | 20 px | `desk:` |
| 681 to 980 px | 8 | 16 px | `tab:` |
| 680 px and below | 4 | 16 px | none |

`tm-wrap` adds the page margin. `tm-grid` lays out the columns. Place children with `col-span-*` and `col-start-*`. Use `tab:` and `desk:` for anything tied to the grid, not `sm:`, `md:` or `lg:`, because those do not match the column changes.

```tsx
// Correct: label in three columns, content in nine, stacked on a phone
<section className="tm-wrap">
  <div className="tm-grid border-t border-rule">
    <div className="col-span-full py-5 tab:col-span-2 desk:col-span-3">
      <Eyebrow>Clients</Eyebrow>
    </div>
    <div className="col-span-full tab:col-span-6 tab:border-l tab:pl-(--tm-gutter) desk:col-span-9">…</div>
  </div>
</section>

// Incorrect: a centered fixed-width column that sits on no column line
<main className="mx-auto max-w-3xl px-4">…</main>
```

## Rules of placement

- Every text block starts on a column line, or one gutter in from a rule that sits on a column line.
- A page has at most 2 left edges for the start of its sections. `src/app/page.tsx` indents the title one gutter so it shares an edge with the ruled rows under it.
- Two-part sections are unequal: 3 + 9, 4 + 8, 5 + 7. A 6 + 6 split appears at most once per page.
- Vertical rules line up from one section to the next. Do not let a rule jump columns between sections.
- A text group (label, heading, lead, button) shares one left edge.
- Paragraphs run 45 to 75 characters: `max-w-[66ch]`. Leads run 35 to 60: `max-w-[44ch]`.
- Tap targets are at least 44 px tall on phones.

## Spacing

Use only these steps. A value off the list is a bug.

| px | 4 | 8 | 12 | 16 | 24 | 32 | 48 | 64 | 96 | 128 | 160 | 224 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tailwind | `1` | `2` | `3` | `4` | `6` | `8` | `12` | `16` | `24` | `32` | `40` | `56` |

The gutter (`--tm-gutter`, 20 px, then 16 px) is the one extra value. It is the gap between columns and the distance text keeps from a rule: `pl-(--tm-gutter)`, `gap-(--tm-gutter)`, or `py-5`.

- Inside a group, the largest gap is at most half the gap to the next group. Label to heading 32, heading to lead 24, group to group 64 or more.
- Section padding uses 96 and up, top and bottom may differ, and two sections in a row never use the same pair.

## Grounds

Plaster is the page. Put `tm-ground-asphalt`, `tm-ground-cone` or `tm-ground-sheet` on a section to change it; the class also sets the text, muted and rule colors inside. Where two grounds meet, that edge is the divider: do not add a border there too.

The 3D viewer's background is set inside `src/features/viewer/ModelViewer.tsx`, not by a ground class.

## Checking a page

Run the composition audit before showing layout work (needs Playwright):

```bash
node .claude/skills/composition-standard/scripts/measure.mjs http://localhost:3011/ --width 1440
```

Then look at it at 1440, 820 and 390 px wide.
