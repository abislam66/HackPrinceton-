# Design system

This app wears the Tradesmark brand: warm Plaster pages, Asphalt ink, one Cone accent, Rigid Square headings, square corners, no shadows. It is ported from Tradesmark's brand kit. Composition is judged before anything else, so layout rules matter as much as colors.

Read this file before writing any UI. See it running at `/styleguide`.

| File | What it holds |
|---|---|
| `docs/design/components.md` | Button, Tag, Eyebrow, Heading, Cell, Field, logo: when to use which, with examples |
| `docs/design/layout.md` | The grid, spacing scale, grounds and composition rules |
| `docs/design/brand-kit/` | Unchanged copies from the brand kit: `Rules.md` (these win over everything), `Color.md`, `Type.md`, `The 24 Rules.md` |
| `src/styles/tradesmark/tokens.css` | Every brand color. A straight copy of the kit file. Never edit it by hand. |
| `src/styles/tradesmark/type.css`, `components.css` | The type roles and component classes |
| `.claude/skills/` | `composition-standard` (run before showing layout work) and `tradesmark-spec-copy` (run before writing UI copy) |

## Hard rules

1. **Only brand colors.** Use the Tailwind names built from the tokens (`bg-plaster`, `text-asphalt`, `border-rule`) or `var(--tm-*)`. Never a default Tailwind color (`zinc`, `gray`, `white`, `black`) and never a raw hex. The brand has no pure white and no pure black.
2. **Pages sit on Plaster.** Asphalt and Cone grounds are for one break or big moment per page, not for whole screens. There is no dark theme.
3. **Cone is the accent, on the one thing to see first.** Cone text is 28 px and up only: Cone on Plaster is 3.25:1, which fails for small text.
4. **No shadows, no gradients as decoration, no texture, no glass blur.** Depth is a change of ground. Shadow utilities are switched off in the theme.
5. **Corners are square.** Inputs take 2 px. Nothing is rounder than 3 px; every `rounded-*` utility is capped there.
6. **Headings are Rigid Square 600** for six words or fewer at 28 px and up. Longer titles and anything smaller are Geist 600. `<Heading>` picks for you. Never weight 800 or heavier.
7. **Body is Geist 500. Labels are Geist Mono 500 in caps.** No other faces.
8. **Every space is on the scale:** 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160, 224 px, plus the 20 px gutter. In Tailwind: `1 2 3 4 6 8 12 16 24 32 40 56`, and `(--tm-gutter)`.
9. **Text keeps one gutter (20 px) from any rule, border or ground edge.**
10. **Pin content to the top and left of its area. Center only a lone item.** Body copy is never centered.
11. **Status colors mean pass and fail only.** `go` and `halt` are never decoration.
12. **Copy is short and plain.** No em dashes, no slogans, American spelling, titles use "&" and body uses "and". Never invent a number, client or claim.

## Which color do I use?

Components and pages use the role names first. Reach for a named mineral only when no role fits.

```
What am I coloring?
 ├── Page background ................ bg-ground (Plaster)
 ├── A card, drawer or sheet on it ... bg-sheet
 ├── The one dark break on a page .... class tm-ground-asphalt (sets text and rules too)
 ├── Text
 │    ├── On Plaster or Sheet ........ text-ink; secondary text: text-muted or class tm-muted
 │    ├── On Asphalt ................. text-stucco; secondary: text-concrete
 │    └── On Cone .................... text-asphalt
 ├── A hairline or border ............ border-rule (Concrete). On Asphalt: Cone at 60%, set by tm-ground-asphalt
 ├── The thing to see first .......... bg-accent or text-accent (28 px and up)
 └── Pass or fail .................... Tag variant go or halt
```

`text-muted` is Mortar, 4.3:1 on Plaster. Use it for labels, captions and helper text, not for paragraphs.

## Which text class do I use?

```
Is it a heading?
 ├── Yes → <Heading size="xl|l|m|s|xs">   (120, 76, 48, 36, 28 px at a 1440 px screen)
 └── No
      ├── A label, kicker, spec or readout → tm-label   (mono caps, 13 px)
      ├── The one intro line under a title → tm-lead    (22 px)
      ├── A paragraph to read ............. → tm-body    (19 px, 45 to 75 characters per line)
      ├── Interface text, table cells ..... → tm-text--m (17 px)
      └── Captions, helper text ........... → tm-text--s (15 px)
```

Sizes scale with the screen width and are clamped. Use at most 7 sizes in one view. Add `tm-num` to any number that changes, so it does not shift its neighbors.

```tsx
// Correct
<p className="tm-body max-w-[66ch]">{proposal.pitch.problem}</p>

// Incorrect: off-palette color, off-system size
<p className="text-lg text-zinc-300">{proposal.pitch.problem}</p>
```

## Fonts

Rigid Square loads from Tradesmark's Adobe Fonts kit (`xor3tpl`), linked in `src/app/layout.tsx`. It cannot be copied into the repo as a file. If the kit does not load, headings fall back to Geist 600.

## Not ported

The kit's video and logo motion rules, the photo and texture rules, and the company facts file. If a page needs a fact about Tradesmark, ask Rafiat; do not write one from memory.
