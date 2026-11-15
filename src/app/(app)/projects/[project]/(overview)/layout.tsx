import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ProjectTabs } from "@/components/app/ProjectTabs";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatStrip } from "@/components/ui/StatStrip";
import { KEY_FACTS, shortAddress } from "@/features/demo/building";
import { listDrafts, loadProjectClients, loadProjectFacts, projectBuilding } from "@/features/project-agent/store";
import { scoutFacts, scoutPlace } from "@/features/scout/facts";
import { getScoutedProject } from "@/features/scout/projects";
import { ProjectAgent } from "@/components/project-agent/ProjectAgent";
import { draftView } from "@/components/project-agent/draft-view";

/**
 * The project header: title and address, a panel with the four measurements, then the tabs on the page. Names and
 * descriptions live in the dossier (src/features/demo/building.ts places each fact once). The stakeholder
 * workspace sits outside this group on purpose.
 *
 * The project agent docks on the right of every tab once the page (container `project`) is 1100 px wide: it starts on
 * the same line as the tab's view, under the facts and tabs, and stays in view while the page scrolls. Narrower, it
 * follows the tab's content and the header links down to it.
 * As part of the layout it survives tab switches, so a reply keeps streaming while the user looks around the project.
 *
 * A project added from scouting (or opened from one) shows what scouting knows about its building in the facts panel,
 * its stakeholders are the firms research found, and it has a Model tab for its generated viewer instead of the demo's
 * Progress.
 */
export default async function ProjectOverviewLayout({ children, params }: LayoutProps<"/projects/[project]">) {
  const { project: slug } = await params;
  const [project, clients, drafts, building] = await Promise.all([
    loadProjectFacts(slug),
    loadProjectClients(slug),
    listDrafts(slug),
    projectBuilding(slug),
  ]);
  if (!project || !clients || !building) notFound();
  const scouted = building.kind === "scouted" ? (await getScoutedProject(building.id))?.candidate : undefined;

  const base = `/projects/${slug}`;
  const pending = drafts.filter((d) => d.status === "pending").map(draftView);

  return (
    // The outer box is the container the dock measures. A container can't restyle itself, so the page is one level in.
    <div className="@container/project">
      <div className="flex flex-col p-8">
        <ProjectHeader
          name={project.name}
          description={scouted ? `${scoutPlace(scouted)} · ${scouted.buildingType}` : shortAddress(project.address)}
          facts={scouted ? scoutFacts(scouted, { fit: false }) : KEY_FACTS}
          tabs={
            <ProjectTabs base={base} counts={{ stakeholders: clients.length }} />
          }
          actions={
            <>
              {/* The standalone building viewer is hidden; a scouted building generates its model in its Model tab. */}
              {/* {scouted ? null : <Button href={`/building-viewer?project=${slug}`}>Generate 3D viewer</Button>} */}
              <Button href="#project-agent" className="@min-[1100px]/project:hidden">
                Project agent
              </Button>
            </>
          }
        >
          {/* The tab's view and the agent start on the same line, under the tabs. */}
          <div className="flex flex-col gap-6 @min-[1100px]/project:flex-row @min-[1100px]/project:items-start">
            {/* A container, so the tabs' two-column views fold by the width they get, with the sidebar open or collapsed. */}
            <div className="@container min-w-0 flex-1">{children}</div>

            <aside
              id="project-agent"
              aria-label="Project agent"
              // Tailwind reads class names whole from the source, so the dock's variants are spelled out in full.
              className={[
                "flex h-[min(720px,90dvh)] scroll-mt-8 flex-col",
                "@min-[1100px]/project:sticky @min-[1100px]/project:top-8 @min-[1100px]/project:h-[calc(100dvh-4rem)] @min-[1100px]/project:w-[400px] @min-[1100px]/project:shrink-0",
              ].join(" ")}
            >
              {/* Keyed by project: opening a new project starts its own chat and drafts. */}
              <ProjectAgent key={slug} projectSlug={slug} drafts={pending} className="min-h-0 flex-1" />
            </aside>
          </div>
        </ProjectHeader>
      </div>
    </div>
  );
}

/** The page header, the key facts panel, the tabs, then the tab's view. */
function ProjectHeader({
  name,
  description,
  facts,
  tabs,
  actions,
  children,
}: {
  name: string;
  description: string;
  facts: { label: string; value: string }[];
  tabs: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: name }]}
        title={name}
        description={description}
        actions={actions}
      />

      <div className="flex flex-col gap-6">
        <Panel flush>
          <StatStrip label="Key facts" items={facts} />
        </Panel>

        {/* The tabs switch the views below, so they sit on the page, not inside the facts panel. */}
        {tabs}

        {children}
      </div>
    </>
  );
}
