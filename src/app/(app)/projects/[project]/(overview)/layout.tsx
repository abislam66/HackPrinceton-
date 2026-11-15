import { notFound } from "next/navigation";
import { ProjectTabs } from "@/components/app/ProjectTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatStrip } from "@/components/ui/StatStrip";
import { shortAddress } from "@/features/demo/building";
import { loadClients, loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
import { HEADER_STATS } from "./facts";

/**
 * The project header: title and address, a panel with the four measurements, then the tabs on the page. Names and
 * descriptions live in the dossier (./facts.ts). The stakeholder workspace sits outside this group on purpose.
 */
export default async function ProjectOverviewLayout({ children, params }: LayoutProps<"/projects/[project]">) {
  const { project: slug } = await params;
  if (slug !== PROJECT_SLUG) notFound();

  const [project, clients] = await Promise.all([loadProject(), loadClients()]);
  const base = `/projects/${PROJECT_SLUG}`;

  return (
    // A container, so the tabs' two-column views fold by the width they get, with the sidebar open or collapsed.
    <div className="@container flex flex-col p-8">
      <PageHeader
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project.name }]}
        title={project.name}
        description={shortAddress(project.address)}
      />

      <div className="flex flex-col gap-6">
        <Panel flush>
          <StatStrip label="Key facts" items={HEADER_STATS} />
        </Panel>

        {/* The tabs switch the views below, so they sit on the page, not inside the facts panel. */}
        <ProjectTabs base={base} counts={{ stakeholders: clients.length }} />

        {children}
      </div>
    </div>
  );
}
