import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ProjectTabs } from "@/components/app/ProjectTabs";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatStrip } from "@/components/ui/StatStrip";
import { KEY_FACTS, shortAddress } from "@/features/demo/building";
import { listDrafts, loadProjectClients, loadProjectFacts } from "@/features/project-agent/store";
import { scoutFacts, scoutPlace } from "@/features/scout/facts";
import { getScoutedProject } from "@/features/scout/projects";
import { ProjectAgent } from "@/components/project-agent/ProjectAgent";
import { draftView } from "@/components/project-agent/draft-view";

/**
 * The project header: title and address, a panel with the four measurements, then the tabs on the page. Names and
 * descriptions live in the dossier (src/features/demo/building.ts places each fact once). The stakeholder
 * workspace sits outside this group on purpose.
 *
 * The project agent docks on the right of every tab once the main column (container `project`) is 1100 px wide,
 * and stays in view while the page scrolls. Narrower, it follows the tab's content and the header links down to it.
 * As part of the layout it survives tab switches, so a reply keeps streaming while the user looks around the project.
 *
 * A project added from scouting has no stakeholders for the agent to work on yet, so it shows what scouting knows
 * and no agent.
 */
export default async function ProjectOverviewLayout({ children, params }: LayoutProps<"/projects/[project]">) {
  const { project: slug } = await params;
  const [project, clients, drafts] = await Promise.all([
    loadProjectFacts(slug),
    loadProjectClients(slug),
    listDrafts(slug),
  ]);

  if (!project || !clients) {
    const scouted = await getScoutedProject(slug);
    if (!scouted) notFound();
    const c = scouted.candidate;
    return (
      <div className="@container flex flex-col p-8">
        <ProjectHeader
          name={c.name}
          description={`${scoutPlace(c)} · ${c.buildingType}`}
          facts={scoutFacts(c, { fit: false })}
          tabs={<ProjectTabs base={`/projects/${slug}`} kind="scouted" />}
        >
          {children}
        </ProjectHeader>
      </div>
    );
  }

  const base = `/projects/${slug}`;
  const pending = drafts.filter((d) => d.status === "pending").map(draftView);

  return (
    // The outer box is the container the dock measures. A container can't restyle itself, so the row is one level in.
    <div className="@container/project">
      <div className="flex flex-col @min-[1100px]/project:flex-row @min-[1100px]/project:items-start">
        {/* A container, so the tabs' two-column views fold by the width they get, with the sidebar open or collapsed. */}
        <div className="@container flex min-w-0 flex-1 flex-col p-8 @min-[1100px]/project:pr-6">
          <ProjectHeader
            name={project.name}
            description={shortAddress(project.address)}
            facts={KEY_FACTS}
            tabs={<ProjectTabs base={base} counts={{ stakeholders: clients.length }} />}
            actions={
              <Button href="#project-agent" className="@min-[1100px]/project:hidden">
                Project agent
              </Button>
            }
          >
            {children}
          </ProjectHeader>
        </div>

        <aside
          id="project-agent"
          aria-label="Project agent"
          // Tailwind reads class names whole from the source, so the dock's variants are spelled out in full.
          className={[
            "flex h-[min(720px,90dvh)] scroll-mt-4 flex-col px-8 pb-8",
            "@min-[1100px]/project:sticky @min-[1100px]/project:top-0 @min-[1100px]/project:h-dvh @min-[1100px]/project:w-[432px] @min-[1100px]/project:shrink-0",
            "@min-[1100px]/project:py-8 @min-[1100px]/project:pr-8 @min-[1100px]/project:pl-0",
          ].join(" ")}
        >
          {/* Keyed by project: opening a new project starts its own chat and drafts. */}
          <ProjectAgent key={slug} projectSlug={slug} drafts={pending} className="min-h-0 flex-1" />
        </aside>
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
