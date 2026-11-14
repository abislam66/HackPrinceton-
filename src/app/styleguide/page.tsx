import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { Cell, Cells } from "@/components/Cell";
import { Eyebrow } from "@/components/Eyebrow";
import { Field } from "@/components/Field";
import { Heading } from "@/components/Heading";
import { Logomark, Wordmark } from "@/components/Logo";
import { SiteHeader } from "@/components/SiteHeader";
import { Tag } from "@/components/Tag";

export const metadata: Metadata = { title: "Styleguide" };

type Swatch = { name: string; hex: string; note?: string; light?: boolean };

const grounds: Swatch[] = [
  { name: "Plaster", hex: "#F4EDE2", note: "Page ground", light: true },
  { name: "Sheet", hex: "#FBF4EC", note: "Cards, drawers", light: true },
  { name: "Asphalt", hex: "#0B0908", note: "Ink, breaks" },
  { name: "Cone", hex: "#FF2800", note: "Accent" },
];

const minerals: Swatch[] = [
  { name: "Tar", hex: "#1B1714" },
  { name: "Basalt", hex: "#28241F" },
  { name: "Slate", hex: "#3D3731" },
  { name: "Mortar", hex: "#7A6D63", note: "Muted text" },
  { name: "Concrete", hex: "#8F8279", note: "Rules" },
  { name: "Limestone", hex: "#D9CFC4", light: true },
  { name: "Stucco", hex: "#EDE6D8", note: "Text on Asphalt", light: true },
];

const status: Swatch[] = [
  { name: "Go", hex: "#128A3E", note: "Pass, live, done" },
  { name: "Halt", hex: "#D6181E", note: "Fail, error, stopped" },
];

function Swatches({ items }: { items: Swatch[] }) {
  return (
    <ul className="grid grid-cols-2 gap-(--tm-gutter) tab:grid-cols-4">
      {items.map((s) => (
        <li key={s.name}>
          <div className={`h-24 ${s.light ? "border border-rule" : ""}`} style={{ background: `var(--tm-${s.name.toLowerCase()})` }} />
          <p className="tm-text--s mt-3 font-semibold">{s.name}</p>
          <p className="tm-label tm-muted mt-1">{s.hex}</p>
          {s.note ? <p className="tm-text--s tm-muted mt-1">{s.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** One row of the sheet: a label in the first three columns, the specimen in the other nine, one rule through all of them. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="tm-wrap">
      <div className="tm-grid border-t border-rule">
        <div className="col-span-full py-5 tab:col-span-2 desk:col-span-3">
          <Eyebrow>{label}</Eyebrow>
        </div>
        <div className="col-span-full border-rule pt-5 pb-24 tab:col-span-6 tab:border-l tab:pl-(--tm-gutter) desk:col-span-9">{children}</div>
      </div>
    </section>
  );
}

export default function Styleguide() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="tm-wrap pt-24 pb-16">
          <div className="tm-grid">
            <div className="col-span-full tab:col-span-6 tab:col-start-3 tab:pl-(--tm-gutter) desk:col-span-9 desk:col-start-4">
              <Heading as="h1" size="l">
                Styleguide
              </Heading>
              <p className="tm-lead mt-6 max-w-[44ch]">
                The Tradesmark brand system as it runs in this app. Rules are in DESIGN.md.
              </p>
            </div>
          </div>
        </section>

        <Row label="Logo">
          <div className="grid gap-(--tm-gutter) tab:grid-cols-3">
            <div className="flex h-40 items-end border border-rule p-5">
              <Wordmark className="h-4 text-cone" />
            </div>
            <div className="tm-ground-asphalt flex h-40 items-end p-5">
              <Wordmark className="h-4 text-cone" />
            </div>
            <div className="tm-ground-cone flex h-40 items-end p-5">
              <Logomark className="h-8 text-asphalt" />
            </div>
          </div>
        </Row>

        <Row label="Color">
          <Swatches items={grounds} />
          <p className="tm-label tm-muted mt-12 mb-5">Minerals</p>
          <Swatches items={minerals} />
          <p className="tm-label tm-muted mt-12 mb-5">Status</p>
          <Swatches items={status} />
        </Row>

        <Row label="Type">
          <div className="flex flex-col gap-8">
            <div>
              <p className="tm-label tm-muted mb-3">tm-h tm-h--xl / Rigid Square 600</p>
              <p className="tm-h tm-h--xl">Seen from the air.</p>
            </div>
            <div>
              <p className="tm-label tm-muted mb-3">tm-h tm-h--l</p>
              <p className="tm-h tm-h--l">From site walk to launch.</p>
            </div>
            <div>
              <p className="tm-label tm-muted mb-3">tm-h tm-h--m</p>
              <p className="tm-h tm-h--m">Hard Work Should Look That Way.</p>
            </div>
            <div>
              <p className="tm-label tm-muted mb-3">tm-h tm-h--s</p>
              <p className="tm-h tm-h--s">Project details</p>
            </div>
            <div>
              <p className="tm-label tm-muted mb-3">tm-h tm-h--xs</p>
              <p className="tm-h tm-h--xs">Shot preview</p>
            </div>
            <div>
              <p className="tm-label tm-muted mb-3">tm-h-long tm-h--xs / Geist 600, titles over six words</p>
              <p className="tm-h-long tm-h--xs max-w-[28ch]">A title that runs past six words is set in Geist.</p>
            </div>
            <div>
              <p className="tm-label tm-muted mb-3">tm-lead</p>
              <p className="tm-lead max-w-[44ch]">Construction photography, video and drone work for the companies that build.</p>
            </div>
            <div>
              <p className="tm-label tm-muted mb-3">tm-body</p>
              <p className="tm-body max-w-[66ch]">
                Reading text is Geist 500. Lines run 45 to 75 characters. Text is ragged right, never justified, and never
                centered unless it is a lone line.
              </p>
            </div>
            <div>
              <p className="tm-label tm-muted mb-3">tm-text--m / tm-text--s</p>
              <p className="tm-text--m">Interface text, table cells and form values.</p>
              <p className="tm-text--s mt-2">Captions and helper text.</p>
            </div>
            <div>
              <p className="tm-label tm-muted mb-3">tm-label</p>
              <p className="tm-label">Geist Mono 500, always caps</p>
            </div>
          </div>
        </Row>

        <Row label="Button">
          <div className="flex flex-wrap items-start gap-(--tm-gutter)">
            <Button href="/styleguide" variant="black">
              Book a call
            </Button>
            <Button href="/styleguide">Shot preview</Button>
            <Button arrow={false}>Save draft</Button>
            <Button compact>Compact</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="tm-ground-asphalt mt-(--tm-gutter) p-5">
            <Button href="/styleguide" variant="ghost-light">
              On Asphalt
            </Button>
          </div>
        </Row>

        <Row label="Tag">
          <div className="flex flex-wrap gap-2">
            <Tag>Line</Tag>
            <Tag variant="ink">Ink</Tag>
            <Tag variant="cone">Cone</Tag>
            <Tag variant="quiet">Quiet</Tag>
            <Tag variant="go">Sent</Tag>
            <Tag variant="halt">Failed</Tag>
          </div>
        </Row>

        <Row label="Cell">
          <Cells>
            <Cell pressed>Aerial</Cell>
            <Cell pressed={false}>Ground</Cell>
            <Cell pressed={false}>Interior</Cell>
          </Cells>
          <div className="tm-ground-asphalt mt-(--tm-gutter) p-5">
            <Cells>
              <Cell pressed>Aerial</Cell>
              <Cell pressed={false}>Ground</Cell>
            </Cells>
          </div>
        </Row>

        <Row label="Field">
          <div className="max-w-md">
            <Field label="Name" name="name" autoComplete="name" />
            <Field label="Email" name="email" type="email" defaultValue="name@" error="Enter a full email address" />
            <Field label="Notes" name="notes" multiline />
          </div>
        </Row>

        <Row label="Tape">
          <span className="tm-tape" />
          <p className="tm-text--s tm-muted mt-5 max-w-[66ch]">An edge, a divider or a marker. Never a fill, never behind type.</p>
        </Row>
      </main>
    </>
  );
}
