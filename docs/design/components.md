# Components

Everything lives in `src/components/`. The lists below are complete. A variant or prop that is not listed does not exist; add it to the component and to this file before using it.

## Button

Use for an action or a link that should read as an action. A link inside a sentence is a plain underlined `<a>`. A choice among options is a Cell.

Variants: `black`, `ghost`, `ghost-light`. Nothing else exists.

- `ghost` is the default. Everything that is not the main action.
- `black` is the single most important action in a view. One per view: two means the screen has no first thing to do.
- `ghost-light` is `ghost` on Asphalt or over media.

```
Where does the button sit?
 ├── On Asphalt or over the 3D view → variant="ghost-light"
 └── On Plaster or Sheet
      ├── Is it the one main action in this view? → variant="black"
      └── Default → variant="ghost"
```

Props: `href` (renders a link), `arrow` (default on; turn off for in-place actions such as Save), `compact` (drops the 240 px minimum width, for headers and rows), `full` (fills the parent). The label is plain text, because it is drawn twice for the rolling hover.

```tsx
// Correct
<Button href={`/proposals/${client.id}`} compact>Proposal</Button>
<Button variant="black" href={bookingUrl}>Book a call</Button>

// Incorrect: no such variant, and an icon inside the label
<Button variant="primary"><Icon /> Proposal</Button>
```

## Heading

Use for every heading. It sets Rigid Square for six words or fewer and Geist 600 for longer text, which matters because generated pitch copy can be any length.

Sizes: `xl`, `l`, `m`, `s`, `xs`. `as` picks the tag (`h1` to `h4`, or `p`) for the outline and never changes the look. One `xl` or `l` per page.

```tsx
// Correct
<Heading as="h1" size="m">{proposal.pitch.headline}</Heading>

// Incorrect: hand-rolled heading, wrong face and weight
<h1 className="text-3xl font-semibold">{proposal.pitch.headline}</h1>
```

## Eyebrow

The mono caps label above or beside a heading, with a square marker. Use it to say something the heading does not. If it would repeat the heading, leave it out. For a label inside a table or a spec list, use the `tm-label` class without the component.

```tsx
// Correct
<Eyebrow>Clients</Eyebrow>

// Incorrect: repeats the heading under it
<Eyebrow>Shot preview</Eyebrow>
<Heading size="l">Shot preview</Heading>
```

## Tag

A small, static mono tag: a state, a category, a count. It is not clickable. A clickable option is a Cell.

Variants: `line`, `ink`, `cone`, `quiet`, `go`, `halt`. Nothing else exists.

```
What does the tag say?
 ├── Pass, live, sent, done ......... variant="go"
 ├── Fail, error, stopped ........... variant="halt"
 ├── The one item to notice ......... variant="cone"   (at most one in a view)
 ├── The current or selected item ... variant="ink"
 ├── Inactive or secondary .......... variant="quiet"
 └── Default ........................ variant="line"
```

```tsx
// Correct
<Tag>{plain(client.role)}</Tag>
<Tag variant="go">Sent</Tag>

// Incorrect: status color used as decoration
<Tag variant="go">General contractor</Tag>
```

## Cell and Cells

Boxed options: toggles, filters, tabs, a shot picker. `pressed` is required and says which one is chosen. Wrap a group in `<Cells>`. For something that performs an action, use Button.

```tsx
// Correct
<Cells>
  {shots.map((shot) => (
    <Cell key={shot.id} pressed={shot.id === selected.id} onClick={() => setSelectedId(shot.id)}>
      {shot.name}
    </Cell>
  ))}
</Cells>

// Incorrect: a rounded, off-palette button doing a Cell's job
<button className="rounded-lg border border-zinc-800 aria-pressed:border-zinc-200">{shot.name}</button>
```

## Field

A labeled text input. `label` is required and always visible; a placeholder is not a label. `error` shows a message under the field and marks it invalid. `multiline` renders a textarea. Every other input prop passes through.

```tsx
// Correct
<Field label="Email" name="email" type="email" autoComplete="email" error={errors.email} />

// Incorrect: no label
<input className="tm-input" placeholder="Email" />
```

## Wordmark and Logomark

`Wordmark` is the default. `Logomark` (the tm) is for spaces too small for the wordmark. Never show both stacked. Colors: Cone, Asphalt, Stucco or Sheet only. Size with a height class. Do not stretch, outline, rotate or redraw either mark.

```tsx
// Correct
<Wordmark className="h-3 text-cone" />

// Incorrect: recolored outside the brand set
<Wordmark className="h-3 text-print" />
```

## SiteHeader

The top bar of the internal app. The client-facing proposal page does not use it.

## Tape

`<span className="tm-tape" />` is Cone hazard tape, 8 px tall. Use it as an edge, a divider or a marker, at most once per page. Never as a fill and never behind type.
