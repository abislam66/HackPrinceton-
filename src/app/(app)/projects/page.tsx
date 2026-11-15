import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TD, TH, THead, TR, Table } from "@/components/ui/Table";
import { Tag } from "@/components/ui/Tag";
import { shortAddress } from "@/features/demo/building";
import { SAMPLE_PROJECTS, SAMPLE_TOOLTIP } from "@/features/demo/projects";
import { loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
import { loadStakeholders } from "@/features/workspace/status";

export default async function ProjectsPage() {
  const [project, stakeholders] = await Promise.all([loadProject(), loadStakeholders()]);
  const sent = stakeholders.filter((s) => s.stage === "sent").length;
  const href = `/projects/${PROJECT_SLUG}`;

  return (
    <div className="flex flex-col p-8">
      <PageHeader title="Projects" description="Every project with stakeholders to pitch" />

      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Project</TH>
              <TH>Location</TH>
              <TH num>Stakeholders</TH>
              <TH>Proposals</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            <TR className="transition-colors duration-200 ease-link hover:bg-stucco">
              <TD>
                <Link href={href} className="font-semibold underline-offset-4 hover:underline">
                  {project.name}
                </Link>
              </TD>
              <TD className="tm-muted">{shortAddress(project.address)}</TD>
              <TD num>{stakeholders.length}</TD>
              <TD className="tm-num">
                {sent} of {stakeholders.length} sent
              </TD>
              <TD>{sent > 0 ? <Tag variant="ink">In outreach</Tag> : <Tag variant="line">Building proposals</Tag>}</TD>
            </TR>
            {SAMPLE_PROJECTS.map((p) => (
              <TR key={p.id} className="tm-muted" title={SAMPLE_TOOLTIP}>
                <TD>
                  <span className="flex items-center gap-3">
                    {p.name}
                    <Tag variant="quiet">Sample</Tag>
                  </span>
                </TD>
                <TD>{p.location}</TD>
                <TD num>{p.stakeholders}</TD>
                <TD className="tm-num">0 of {p.stakeholders} sent</TD>
                <TD>
                  <Tag variant="quiet">New</Tag>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
