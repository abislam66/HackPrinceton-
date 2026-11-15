import { notFound } from "next/navigation";
import { ProjectTabs } from "@/components/app/ProjectTabs";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatStrip } from "@/components/ui/StatStrip";
import { KEY_FACTS, shortAddress } from "@/features/demo/building";
import { listDrafts, loadProjectClients, loadProjectFacts } from "@/features/project-agent/store";
import { ProjectAgent } from "./_components/ProjectAgent";
import { draftView } from "./_components/draft-view";

/**
 * The project header: title and address, a panel with the four measurements, then the tabs on the page. Names and
 * descriptions live in the dossier (src/features/demo/building.ts places each fact once). The stakeholder
 * workspace sits outside this group on purpose.
 *
 * The project agent docks on the right of every tab once the main column (container `project`) is 1100 px wide,
 * and stays in view while the page scrolls. Narrower, it follows the tab's content and the header links down to it.
 * As part of the layout it survives tab switches, so a reply keeps streaming while the user looks around the project.
 */
export default async function ProjectOverviewLayout({ children, params }: LayoutProps<"/projects/[project]">) {
  const { project: slug } = await params;
  const [project, clients, drafts] = await Promise.all([
    loadProjectFacts(slug),
    loadProjectClients(slug),
    listDrafts(slug),
  ]);
  if (!project || !clients) notFound();

  const base = `/projects/${slug}`;
  const pending = drafts.filter((d) => d.status === "pending").map(draftView);

  return (
    // The outer box is the container the dock measures. A container can't restyle itself, so the row is one level in.
    <div className="@container/project">
      <div className="flex flex-col @min-[1100px]/project:flex-row @min-[1100px]/project:items-start">
        {/* A container, so the tabs' two-column views fold by the width they get, with the sidebar open or collapsed. */}
        <div className="@container flex min-w-0 flex-1 flex-col p-8 @min-[1100px]/project:pr-6">
          <PageHeader
            breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project.name }]}
            title={project.name}
            description={shortAddress(project.address)}
            actions={
              <Button href="#project-agent" className="@min-[1100px]/project:hidden">
                Project agent
              </Button>
            }
          />

          <div className="flex flex-col gap-6">
            <Panel flush>
              <StatStrip label="Key facts" items={KEY_FACTS} />
            </Panel>

            {/* The tabs switch the views below, so they sit on the page, not inside the facts panel. */}
            <ProjectTabs base={base} counts={{ stakeholders: clients.length }} />

            {children}
          </div>
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
