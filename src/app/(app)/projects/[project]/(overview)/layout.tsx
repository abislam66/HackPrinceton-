import { notFound } from "next/navigation";
import { ProjectTabs } from "@/components/app/ProjectTabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { KEY_FACTS, shortAddress } from "@/features/demo/building";
import { loadClients, loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
import { cx } from "@/lib/cx";

/** Project header, facts band and tabs. The stakeholder workspace sits outside this group on purpose. */
export default async function ProjectOverviewLayout({ children, params }: LayoutProps<"/projects/[project]">) {
  const { project: slug } = await params;
  if (slug !== PROJECT_SLUG) notFound();

  const [project, clients] = await Promise.all([loadProject(), loadClients()]);
  const owner = clients.find((c) => c.role === "owner-developer")?.company ?? "Temple University";
  const base = `/projects/${PROJECT_SLUG}`;

  return (
    <div className="flex flex-col p-8">
      <PageHeader
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project.name }]}
        title={project.name}
        description={`${shortAddress(project.address)} · ${owner}`}
      />

      <div className="flex flex-col gap-6">
        {/* The page's one Asphalt moment. */}
        <section aria-label="Key facts" className="tm-ground-asphalt py-5">
          <dl className="grid grid-cols-3 gap-y-6">
            {KEY_FACTS.map((fact, i) => (
              <div
                key={fact.label}
                className={cx(
                  "flex min-w-0 flex-col gap-2 border-[color:var(--tm-rule)] px-5",
                  i % 3 !== 0 && "border-l",
                )}
              >
                <dt className="tm-label tm-muted">{fact.label}</dt>
                <dd className="tm-h tm-h--xs tm-num text-stucco">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <ProjectTabs base={base} />

        {children}
      </div>
    </div>
  );
}
