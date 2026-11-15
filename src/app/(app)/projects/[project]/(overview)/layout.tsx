import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ProjectTabs } from "@/components/app/ProjectTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatStrip } from "@/components/ui/StatStrip";
import { KEY_FACTS, shortAddress } from "@/features/demo/building";
import { loadClients, loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
import { scoutFacts, scoutPlace } from "@/features/scout/facts";
import { getScoutedProject } from "@/features/scout/projects";

/**
 * The project header: title and address, a panel with the four measurements, then the tabs on the page. Names and
 * descriptions live in the dossier (src/features/demo/building.ts places each fact once). The stakeholder
 * workspace sits outside this group on purpose. A project added from scouting shows what scouting knows instead.
 */
export default async function ProjectOverviewLayout({ children, params }: LayoutProps<"/projects/[project]">) {
  const { project: slug } = await params;
  if (slug !== PROJECT_SLUG) {
    const scouted = await getScoutedProject(slug);
    if (!scouted) notFound();
    const c = scouted.candidate;
    return (
      <ProjectFrame
        name={c.name}
        description={`${scoutPlace(c)} · ${c.buildingType}`}
        facts={scoutFacts(c, { fit: false })}
        tabs={<ProjectTabs base={`/projects/${slug}`} kind="scouted" />}
      >
        {children}
      </ProjectFrame>
    );
  }

  const [project, clients] = await Promise.all([loadProject(), loadClients()]);
  const base = `/projects/${PROJECT_SLUG}`;

  return (
    <ProjectFrame
      name={project.name}
      description={shortAddress(project.address)}
      facts={KEY_FACTS}
      tabs={<ProjectTabs base={base} counts={{ stakeholders: clients.length }} />}
    >
      {children}
    </ProjectFrame>
  );
}

function ProjectFrame({
  name,
  description,
  facts,
  tabs,
  children,
}: {
  name: string;
  description: string;
  facts: { label: string; value: string }[];
  tabs: ReactNode;
  children: ReactNode;
}) {
  return (
    // A container, so the tabs' two-column views fold by the width they get, with the sidebar open or collapsed.
    <div className="@container flex flex-col p-8">
      <PageHeader
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: name }]}
        title={name}
        description={description}
      />

      <div className="flex flex-col gap-6">
        <Panel flush>
          <StatStrip label="Key facts" items={facts} />
        </Panel>

        {/* The tabs switch the views below, so they sit on the page, not inside the facts panel. */}
        {tabs}

        {children}
      </div>
    </div>
  );
}
