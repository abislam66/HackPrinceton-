import { ArrowUp, Copy, PanelLeftClose, RotateCcw, X } from "lucide-react";
import type { Metadata } from "next";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { planFootprint } from "@/components/ui/CameraPathPlan";
import { ElevationGlyph, floorsFromText } from "@/components/ui/ElevationGlyph";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FilterChip, FilterChips } from "@/components/ui/FilterChip";
import { IconButton } from "@/components/ui/IconButton";
import { MediaList, MediaRow } from "@/components/ui/MediaRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ProgressBar, type ProgressStatus } from "@/components/ui/ProgressBar";
import { StatStrip } from "@/components/ui/StatStrip";
import { TD, TH, THead, TR, Table } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { KEY_FACTS, WHY_IT_FITS, shortAddress } from "@/features/demo/building";
import { SAMPLE_PROJECTS } from "@/features/demo/projects";
import { loadClients, loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
import clientA from "@/features/proposal/fallback/client-a.json";
import { shotListSchema } from "@/features/shots/schema";
import { pathDuration } from "@/features/viewer/camera-paths";
import { formatClock, sideLabel } from "@/features/workspace/format";
import { NEED_LABEL, ROLE_LABEL } from "@/lib/labels";
import { DialogDemo, PendingDemo, ShotListDemo, type DemoShot } from "./_components/demos";
import { Ground, Row, Section, Specimen } from "./_components/Specimen";

export const metadata: Metadata = { title: "Components" };

/*
 * /kit: the reference for the internal app's components (src/components/ui), on the grounds they are used on:
 * the Plaster page, a Sheet panel and the Asphalt viewer. Hover, press and tab through them live.
 * Data is the demo project's own, so the visuals are drawn from real numbers.
 */

const SECTIONS = [
  { id: "tokens", title: "Tokens" },
  { id: "buttons", title: "Buttons" },
  { id: "tags", title: "Tags and filters" },
  { id: "tabs", title: "Tabs" },
  { id: "surfaces", title: "Panels and dialog" },
  { id: "rows", title: "Rows" },
  { id: "table", title: "Table" },
  { id: "header", title: "Page header" },
  { id: "forms", title: "Fields" },
  { id: "empty", title: "Empty state" },
];

/** Hash links that stay on this page. */
const STAY = "#stay";

const TONES: { tone: TagTone; label: string; use: string; swatch: string }[] = [
  { tone: "neutral", label: "Not built", use: "Not started or waiting", swatch: "bg-status-neutral-fill text-status-neutral-ink" },
  { tone: "ready", label: "Ready to send", use: "A state that is set", swatch: "bg-status-ready-fill text-status-ready-ink" },
  { tone: "running", label: "Building model", use: "Only while agents work", swatch: "bg-status-running-fill text-status-running-ink" },
  { tone: "pass", label: "Opened · 12", use: "A good outcome", swatch: "bg-status-pass-fill text-status-pass-ink" },
  { tone: "fail", label: "Failed", use: "A bad outcome", swatch: "bg-status-fail-fill text-status-fail-ink" },
];

const STEPS: { number: string; label: string; status: ProgressStatus; seconds: number | null; tone: TagTone; tag: string }[] = [
  { number: "01", label: "Read the project files", status: "done", seconds: 4, tone: "pass", tag: "Done" },
  { number: "02", label: "Build the 3D model", status: "running", seconds: 38, tone: "running", tag: "Running" },
  { number: "03", label: "Plan the drone shots", status: "queued", seconds: null, tone: "neutral", tag: "Queued" },
  { number: "04", label: "Write the pitch", status: "error", seconds: 12, tone: "fail", tag: "Failed" },
];

const MUTED = [
  { ground: "bg-stucco", name: "Stucco", ratio: "5.1:1" },
  { ground: "bg-plaster", name: "Plaster", ratio: "5.4:1" },
  { ground: "bg-sheet", name: "Sheet", ratio: "5.8:1" },
  { ground: "tm-ground-asphalt", name: "Asphalt", ratio: "5.3:1" },
];

const LINES = [
  { name: "Panel border", alpha: ".10", cls: "border-line" },
  { name: "Divider", alpha: ".06", cls: "border-divider" },
  { name: "Secondary button", alpha: ".16", cls: "border-hairline" },
  { name: "Dialog", alpha: ".18", cls: "border-line-strong" },
];

export default async function KitPage({ searchParams }: PageProps<"/kit">) {
  const { view, panel } = await searchParams;
  const active = view === "dossier" || view === "progress" ? view : "stakeholders";
  const [project, clients] = await Promise.all([loadProject(), loadClients()]);
  const client = clients[0];

  const parsed = shotListSchema.parse(clientA.shots);
  const footprint = planFootprint(parsed);
  const shots: DemoShot[] = parsed.map((s, i) => ({
    id: s.id,
    name: s.name,
    number: String(i + 1).padStart(2, "0"),
    side: sideLabel(s.side),
    duration: formatClock(pathDuration(s.camera)),
    keyframes: s.camera.keyframes,
  }));

  const projectRows = [
    { id: PROJECT_SLUG, name: project.name, location: shortAddress(project.address), why: WHY_IT_FITS, stakeholders: clients.length, href: STAY },
    ...SAMPLE_PROJECTS.map((p) => ({ id: p.id, name: p.name, location: p.location, why: p.whyItFits, stakeholders: p.stakeholders, href: undefined })),
  ];
  const stats = KEY_FACTS.filter((f) => /^\d/.test(f.value));
  const pageTabs = [
    { label: "Stakeholders", href: "/kit?view=stakeholders#tabs", active: active === "stakeholders", count: clients.length },
    { label: "Dossier", href: "/kit?view=dossier#tabs", active: active === "dossier" },
    { label: "Progress", href: "/kit?view=progress#tabs", active: active === "progress" },
  ];
  const panelTabs = [
    { label: "Shots", href: "/kit?panel=shots#tabs", active: panel !== "engagement" },
    { label: "Engagement", href: "/kit?panel=engagement#tabs", active: panel === "engagement" },
  ];

  return (
    <main className="min-w-0 flex-1 bg-ground pb-24 text-ink [color-scheme:light]">
      <div className="px-8 pt-8">
        <PageHeader
          breadcrumbs={[{ label: "Internal app" }, { label: "Components" }]}
          title="Components"
          description="Every shared component in src/components/ui, with its variants and states, on the ground it sits on. Hover, press and tab through them."
        />
      </div>

      <nav aria-label="Kit sections" className="sticky top-0 z-10 flex flex-wrap gap-x-5 gap-y-1 border-y border-line bg-ground px-8 py-3">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="text-[13px] leading-[18px] text-muted transition-colors duration-150 ease-out hover:text-ink">
            {s.title}
          </a>
        ))}
      </nav>

      {/* ---------------------------------------------------------------- tokens */}
      <Section
        id="tokens"
        title="Tokens"
        intro="src/styles/app/tokens.css. Each name resolves to light-on-dark values inside .tm-ground-asphalt, so text-muted and the lines adapt on the viewer."
      >
        <Specimen name="Muted text" code="text-muted · var(--app-muted)" note="oklch(0.49 0.022 60); Concrete on Asphalt. Muted text passes 4.5:1 on every ground.">
          <Row>
            {MUTED.map((m) => (
              <div key={m.name} className={`flex w-44 flex-col gap-1 p-4 ${m.ground}`}>
                <span className="text-sm text-muted">Secondary text</span>
                <span className="text-xs text-muted">
                  {m.name} <span className="app-num">{m.ratio}</span>
                </span>
              </div>
            ))}
          </Row>
        </Specimen>
        <Specimen name="Lines" code="border-line · border-divider · border-hairline · border-line-strong">
          <Row>
            {LINES.map((l) => (
              <div key={l.name} className={`flex w-44 flex-col gap-1 border bg-sheet p-4 ${l.cls}`}>
                <span className="text-sm">{l.name}</span>
                <span className="text-xs text-muted">
                  Asphalt <span className="app-num">{l.alpha}</span>
                </span>
              </div>
            ))}
          </Row>
        </Specimen>
        <Specimen
          name="Status palette"
          code="bg-status-{tone}-fill · text-status-{tone}-ink"
          note="Fixed OKLCH, one lightness and chroma per ground. Ink on fill passes 5.3:1; on Asphalt, 8.6:1."
        >
          <Row className="items-stretch">
            {TONES.map((t) => (
              <div key={t.tone} className={`flex w-40 flex-col gap-1 p-3 ${t.swatch}`}>
                <span className="text-sm font-semibold">{t.tone}</span>
                <span className="text-xs">{t.use}</span>
              </div>
            ))}
          </Row>
        </Specimen>
      </Section>

      {/* ---------------------------------------------------------------- buttons */}
      <Section
        id="buttons"
        title="Buttons"
        intro="32 px, square, 13 px sentence case. One primary per view. Hover tints only on a fine pointer; press scales to 0.97; focus is a 2 px Cone ring; every button reaches 44 px to touch."
      >
        <Specimen name="Variants" code={`<Button variant="primary" | "secondary" | "tertiary">`} note="Secondary is the default.">
          <Ground on="plaster" label="On Plaster, the page">
            <Row>
              <Button variant="primary">Send proposal</Button>
              <Button>Preview proposal</Button>
              <Button variant="tertiary">Cancel</Button>
            </Row>
          </Ground>
          <Ground on="sheet" label="On a Sheet panel">
            <Row>
              <Button variant="primary">Open workspace</Button>
              <Button>Open dossier</Button>
              <Button variant="tertiary">Back to shots</Button>
            </Row>
          </Ground>
          <Ground on="asphalt" label="On the Asphalt viewer">
            <Row>
              <Button variant="primary">Build proposal</Button>
              <Button>Try again</Button>
              <Button variant="tertiary">Back to shots</Button>
            </Row>
          </Ground>
        </Specimen>
        <Specimen
          name="Links"
          code={`href · target="_blank"`}
          note="href renders a Next Link. A new tab adds a 14 px arrow and “(opens in a new tab)” for screen readers."
        >
          <Row>
            <Button variant="primary" href={STAY}>
              Open project
            </Button>
            <Button href={`/proposals/${client.id}?preview=1`} target="_blank">
              Preview proposal
            </Button>
          </Row>
        </Specimen>
        <Specimen name="With an icon" code="children: <Icon size={14} /> Label">
          <Row>
            <Button variant="tertiary">
              <Copy size={14} strokeWidth={1.75} aria-hidden />
              Copy link
            </Button>
            <Button>
              <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
              Regenerate
            </Button>
          </Row>
        </Specimen>
        <Specimen
          name="Disabled"
          code="disabled · disabledReason · reasonPosition"
          note="Muted tokens, never opacity. With a reason the button stays focusable and reads the reason out."
        >
          <Ground on="plaster" label="Disabled">
            <Row>
              <Button variant="primary" disabled>
                Send proposal
              </Button>
              <Button disabled>Preview proposal</Button>
              <Button variant="tertiary" disabled>
                Cancel
              </Button>
            </Row>
          </Ground>
          <Ground on="sheet" label="With a reason, below and beside">
            <Row className="items-start gap-8">
              <Button disabled disabledReason="Gmail isn't connected in the demo.">
                Connect Gmail
              </Button>
              <Button variant="primary" disabled disabledReason="Only Morgan Hall North is loaded." reasonPosition="beside">
                Open project
              </Button>
            </Row>
          </Ground>
          <Ground on="asphalt" label="Disabled on Asphalt">
            <Row>
              <Button variant="primary" disabled>
                Build proposal
              </Button>
              <Button disabled>Try again</Button>
            </Row>
          </Ground>
        </Specimen>
        <Specimen
          name="Pending"
          code={`pending · pendingLabel="Sending…"`}
          note="A 12 px spinner at the idle width; clicks do nothing. Click one to see it for 2 s."
        >
          <PendingDemo />
        </Specimen>
        <Specimen
          name="Icon buttons"
          code={`<IconButton icon label shortcut? variant? tooltipSide?>`}
          note="32×32. The label is the accessible name and a tooltip after 400 ms, at once on keyboard focus. Once one tooltip has shown, the next opens at once."
        >
          <Ground on="plaster" label="Tooltip below; with a shortcut; disabled">
            <Row className="gap-4 pb-8">
              <IconButton icon={<PanelLeftClose />} label="Collapse sidebar" shortcut="⌘B" />
              <IconButton icon={<RotateCcw />} label="Reset demo" />
              <IconButton icon={<X />} label="Close" />
              <IconButton icon={<X />} label="Close" disabled />
            </Row>
          </Ground>
          <Ground on="sheet" label="A composer's send: primary, tooltip above">
            <div className="flex max-w-[420px] items-center justify-between gap-4 pt-8">
              <p className="text-sm text-muted">Ask the agent about a project</p>
              <IconButton icon={<ArrowUp />} label="Send" shortcut="↵" variant="primary" tooltipSide="top" />
            </div>
          </Ground>
          <Ground on="asphalt" label="On Asphalt, tooltip to the right">
            <Row className="gap-4">
              <IconButton icon={<RotateCcw />} label="Replay" tooltipSide="right" />
              <IconButton icon={<RotateCcw />} label="Replay" disabled />
            </Row>
          </Ground>
        </Specimen>
      </Section>

      {/* ---------------------------------------------------------------- tags */}
      <Section
        id="tags"
        title="Tags and filters"
        intro="A tag is a status in words, a 22 px block in its tone; digits inside are mono. A filter is a chip you press, never a tag."
      >
        <Specimen name="Tones" code={`<Tag tone="neutral" | "ready" | "running" | "pass" | "fail">`} note="Running breathes its fill, and holds still under reduced motion.">
          {(["plaster", "sheet", "asphalt"] as const).map((on) => (
            <Ground key={on} on={on} label={on === "plaster" ? "On Plaster" : on === "sheet" ? "On a Sheet panel" : "On the Asphalt viewer"}>
              <Row className="gap-2">
                {TONES.map((t) => (
                  <Tag key={t.tone} tone={t.tone}>
                    {t.label}
                  </Tag>
                ))}
              </Row>
            </Ground>
          ))}
        </Specimen>
        <Specimen
          name="Filter chips"
          code="<FilterChips label> <FilterChip defaultPressed | pressed onPressedChange>"
          note="A toggle button with aria-pressed. On adds a check at the same width."
        >
          <FilterChips label="Filters">
            <FilterChip defaultPressed>Philadelphia</FilterChip>
            <FilterChip>Finished buildings</FilterChip>
            <FilterChip>Residential</FilterChip>
            <FilterChip>Last 7 days</FilterChip>
          </FilterChips>
        </Specimen>
      </Section>

      {/* ---------------------------------------------------------------- tabs */}
      <Section
        id="tabs"
        title="Tabs"
        intro="Segmented. Tabs are routes or query params, so each is a Link and the active one is aria-current. Click one: this page reads ?view= and ?panel=."
      >
        <Specimen name="Page tabs" code="<Tabs items={[{ label, href, active, count? }]} label>" note="Each segment fits its label. Counts are mono and muted.">
          <Tabs items={pageTabs} label="Project sections" />
        </Specimen>
        <Specimen name="In the 360 px panel" code="full">
          <Panel flush className="w-[360px] max-w-full">
            <div className="p-5">
              <Tabs items={panelTabs} label="Proposal" full />
            </div>
          </Panel>
        </Specimen>
      </Section>

      {/* ---------------------------------------------------------------- surfaces */}
      <Section
        id="surfaces"
        title="Panels and dialog"
        intro="Sheets. The page is Plaster; each panel is Sheet behind a 10 % border with only dividers inside. Never a panel inside a panel."
      >
        <Specimen
          name="Panel"
          code="<Panel title count? action? flush? titleAs?>"
          note="A title opens a 48 px header row: 14 px/600, a count or an action on the right, a divider under it."
        >
          <div className="grid max-w-[880px] grid-cols-[minmax(0,1fr)_320px] items-start gap-6 max-[960px]:grid-cols-1">
            <Panel title="Proposals" count={`1 of ${clients.length} sent`} flush>
              <MediaList>
                {clients.map((c, i) => (
                  <MediaRow
                    key={c.id}
                    href={STAY}
                    media={<Avatar name={c.company} />}
                    title={c.company}
                    meta={`${ROLE_LABEL[c.role]} · Needs: ${NEED_LABEL[c.need]}`}
                  >
                    <span className="w-28">{i === 0 ? <Tag tone="pass">Opened · 3</Tag> : <Tag tone="ready">Ready to send</Tag>}</span>
                  </MediaRow>
                ))}
              </MediaList>
            </Panel>
            <Panel title="Dossier" action={<Button href={STAY}>Open dossier</Button>}>
              <p className="text-sm leading-[22px] text-pretty">{project.name}: the research the agent gathered, each fact shown once.</p>
            </Panel>
          </div>
        </Specimen>
        <Specimen
          name="Stat strip"
          code="<StatStrip items={[{ label, value }]} label>"
          note="Cells are sized to their value, so “92 m (302 ft)” never collides. An empty value shows a dash, read as “Not confirmed”."
        >
          <Panel flush className="max-w-[880px]">
            <p className="p-5 text-sm text-muted">{project.address}</p>
            <StatStrip label="Key facts" items={stats} className="border-t border-divider" />
          </Panel>
          <Panel flush className="w-[360px] max-w-full">
            <StatStrip
              label="Engagement"
              items={[
                { label: "Opens", value: 12 },
                { label: "Watch time", value: "4m 18s" },
                { label: "Clicks", value: "" },
              ]}
            />
          </Panel>
        </Specimen>
        <Specimen
          name="Dialog"
          code="<Dialog open onClose title footer locked>"
          note="A Sheet with an 18 % edge over an 80 % Plaster scrim. Esc, the scrim and the close button close it, unless it is locked while sending."
        >
          <DialogDemo contact={{ name: client.contact.name, title: client.contact.title, company: client.company }} />
        </Specimen>
      </Section>

      {/* ---------------------------------------------------------------- rows */}
      <Section id="rows" title="Rows" intro="Media. Two-line rows led by a visual drawn from real data. The whole row is the target; ↑ and ↓ move between rows.">
        <Specimen
          name="Shot rows"
          code="<MediaRow size={72} media={<CameraPathPlan keyframes footprint />} selected onClick>"
          note="A 72×48 plan of the camera path, north up, on the footprint the list shares (planFootprint). Selected is Stucco with a 2 px Cone bar, and its path turns Cone."
        >
          <ShotListDemo shots={shots} footprint={footprint} />
        </Specimen>
        <Specimen
          name="Project rows"
          code="<MediaRow href media={<ElevationGlyph floors />}>"
          note="One hairline bar per floor at a fixed pitch, so heights compare; an empty frame when the count is unknown. A row without href doesn't open."
        >
          <Panel flush className="max-w-[880px]">
            <MediaList>
              {projectRows.map((p) => (
                <MediaRow
                  key={p.id}
                  href={p.href}
                  media={<ElevationGlyph floors={floorsFromText(p.why)} />}
                  title={p.name}
                  meta={`${p.location} · ${p.why}`}
                >
                  <span className="text-xs text-muted">
                    <span className="app-num text-ink">{p.stakeholders}</span> stakeholders
                  </span>
                </MediaRow>
              ))}
            </MediaList>
          </Panel>
        </Specimen>
        <Specimen
          name="Build steps"
          code="<ProgressBar status>"
          note="2 px. Done fills, queued stays empty, running sweeps (full at half strength under reduced motion), a failure fills in Halt."
        >
          <Panel title="Building" flush className="w-[360px] max-w-full">
            <ol className="app-rows">
              {STEPS.map((s) => (
                <li key={s.number} className="flex items-start gap-3 px-5 py-4">
                  <span className="app-num text-xs leading-[18px] text-muted">{s.number}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="truncate text-sm leading-[18px] font-semibold">{s.label}</span>
                    <ProgressBar status={s.status} />
                  </span>
                  <span className="app-num w-10 text-right text-xs leading-[18px]">{s.seconds === null ? "" : formatClock(s.seconds)}</span>
                  <span className="w-[72px]">
                    <Tag tone={s.tone}>{s.tag}</Tag>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </Specimen>
        <Specimen name="Avatar" code="<Avatar name size={24 | 40}>">
          <Row className="gap-4">
            <Avatar name={client.company} />
            <Avatar name={client.contact.name} size={24} />
          </Row>
        </Specimen>
      </Section>

      {/* ---------------------------------------------------------------- table */}
      <Section id="table" title="Table" intro="Sentence-case 12 px muted headers, 40 px rows, numbers right-aligned in mono.">
        <Specimen name="Table" code="<Table> <THead> <TH num?> <TR> <TD num?>">
          <Panel flush className="max-w-[880px] overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Project</TH>
                  <TH>Location</TH>
                  <TH num>Stakeholders</TH>
                  <TH num>Sent</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <tbody>
                {projectRows.map((p, i) => (
                  <TR key={p.id}>
                    <TD className="font-semibold">{p.name}</TD>
                    <TD className="text-muted">{p.location}</TD>
                    <TD num>{p.stakeholders}</TD>
                    <TD num>{i === 0 ? 1 : 0}</TD>
                    <TD>{i === 0 ? <Tag tone="ready">In outreach</Tag> : <Tag>Not started</Tag>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Panel>
        </Specimen>
      </Section>

      {/* ---------------------------------------------------------------- page header */}
      <Section
        id="header"
        title="Page header"
        intro="Breadcrumbs in 13 px muted Geist; the title in Rigid Square, the one place it is used; actions bottom-right that never shrink."
      >
        <Specimen name="Page header" code="<PageHeader breadcrumbs title description? actions?>">
          <PageHeader
            breadcrumbs={[{ label: "Projects", href: STAY }, { label: project.name, href: STAY }, { label: client.company }]}
            title={client.company}
            description={`${ROLE_LABEL[client.role]} · Needs: ${NEED_LABEL[client.need]}`}
            actions={
              <>
                <Button href={`/proposals/${client.id}?preview=1`} target="_blank">
                  Preview proposal
                </Button>
                <Button variant="primary">Send proposal</Button>
              </>
            }
          />
        </Specimen>
        <Specimen name="A long title" note="Wraps and balances in a narrow column; the actions keep their width, and a reason aligns right.">
          <div className="max-w-[640px]">
            <PageHeader
              title="Kestrel Yard Lofts and the Marrowby House graduate residence, phase two"
              actions={
                <Button disabled disabledReason="Gmail isn't connected in the demo.">
                  Connect Gmail
                </Button>
              }
            />
          </div>
        </Specimen>
      </Section>

      {/* ---------------------------------------------------------------- forms */}
      <Section id="forms" title="Fields" intro="Sentence-case 13 px labels; 16 px text, so iOS never zooms.">
        <Specimen name="Field" code="<Field label error? multiline? />" note="Default, multiline, an error that says what to fix, and disabled.">
          <Panel className="max-w-[560px]">
            <Field label="Subject" defaultValue="A proposal for your next bid" />
            <Field label="Message" multiline rows={4} placeholder="Write a short note" />
            <Field label="Contact email" type="email" defaultValue="dana@" error="Enter a full email address, like dana@firm.com." />
            <Field label="Proposal link" defaultValue={`/proposals/${client.id}`} disabled />
          </Panel>
        </Specimen>
      </Section>

      {/* ---------------------------------------------------------------- empty state */}
      <Section id="empty" title="Empty state" intro="Pinned top-left: what is missing, why, and the one action that fills it.">
        <Specimen name="Empty state" code="<EmptyState title description action? />">
          <Panel title="Drafts" count={0} flush className="max-w-[640px]">
            <EmptyState
              title="No drafts"
              description="Proposals that are built but not sent yet show up here."
              action={
                <Button variant="primary" href={STAY}>
                  Open stakeholders
                </Button>
              }
            />
          </Panel>
        </Specimen>
      </Section>
    </main>
  );
}
