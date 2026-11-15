import { Building2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tag } from "@/components/ui/Tag";
import { WHY_IT_FITS, shortAddress } from "@/features/demo/building";
import { SAMPLE_PROJECTS, SAMPLE_TOOLTIP } from "@/features/demo/projects";
import { loadClients, loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";

const FILTERS = [
  "Philadelphia",
  "Finished buildings",
  "Residential",
  "Last 7 days",
];

function ProjectRow(props: {
  name: string;
  location: string;
  why: string;
  stakeholders: number;
  action: ReactNode;
}) {
  return (
    <li className="flex items-center gap-5 border-b border-rule/40 p-5 last:border-b-0">
      <span
        aria-hidden
        className="flex h-16 w-22 shrink-0 items-center justify-center bg-stucco text-muted"
      >
        <Building2 size={20} strokeWidth={1.5} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="tm-text--m truncate font-semibold">{props.name}</p>
        <p className="tm-text--s tm-muted truncate">{props.location}</p>
        <p className="tm-text--s truncate">
          <span className="tm-muted">Why it fits: </span>
          {props.why}
        </p>
      </div>
      <Tag variant="line">
        <span className="tm-num">
          {props.stakeholders}{" "}
          {props.stakeholders === 1 ? "stakeholder" : "stakeholders"}
        </span>
      </Tag>
      <div className="flex w-56 shrink-0 items-center justify-end gap-3">
        {props.action}
      </div>
    </li>
  );
}

export default async function DiscoverPage() {
  const [project, clients] = await Promise.all([loadProject(), loadClients()]);

  return (
    <div className="flex flex-col p-8">
      <PageHeader
        title="Discover"
        description={
          <span className="inline-flex items-center gap-3">
            Projects the scout agent found this week
            <Tag variant="quiet">Sample</Tag>
          </span>
        }
      />

      <div className="flex flex-col gap-6">
        <ul aria-label="Filters" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <li key={f}>
              <Tag variant="line">{f}</Tag>
            </li>
          ))}
        </ul>

        <Card>
          <ul>
            <ProjectRow
              name={project.name}
              location={shortAddress(project.address)}
              why={WHY_IT_FITS}
              stakeholders={clients.length}
              action={
                <Button
                  href={`/projects/${PROJECT_SLUG}`}
                  variant="primary"
                  compact
                >
                  Open project
                </Button>
              }
            />
            {SAMPLE_PROJECTS.map((p) => (
              <ProjectRow
                key={p.id}
                name={p.name}
                location={p.location}
                why={p.whyItFits}
                stakeholders={p.stakeholders}
                action={
                  <>
                    <Tag variant="quiet">Sample</Tag>
                    <span title={SAMPLE_TOOLTIP}>
                      <Button
                        variant="ghost"
                        compact
                        disabled
                        title={SAMPLE_TOOLTIP}
                      >
                        Open project
                      </Button>
                    </span>
                  </>
                }
              />
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
