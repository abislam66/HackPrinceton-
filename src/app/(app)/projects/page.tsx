import type { ReactNode } from "react";
import { ElevationGlyph, floorsFromText } from "@/components/ui/ElevationGlyph";
import { MediaList, MediaRow } from "@/components/ui/MediaRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { WHY_IT_FITS, shortAddress } from "@/features/demo/building";
import { SAMPLE_PROJECTS } from "@/features/demo/projects";
import { listProjects, loadProjectFacts } from "@/features/project-agent/store";
import { loadStakeholders } from "@/features/workspace/status";
import { cx } from "@/lib/cx";

type ProjectRow = {
  id: string;
  name: string;
  location: string;
  floors: number | null;
  stakeholders: number;
  sent: number;
  status: ReactNode;
  /** Loaded projects open; the samples don't. */
  href?: string;
};

/** A loaded project as a row: the demo project, or one the project agent opened from a draft. */
async function projectRow(
  project: Awaited<ReturnType<typeof listProjects>>[number],
  names: Map<string, string>,
): Promise<ProjectRow | null> {
  const [facts, stakeholders] = await Promise.all([loadProjectFacts(project.id), loadStakeholders(project.id)]);
  if (!facts) return null;
  const sent = stakeholders.filter((s) => s.stage === "sent").length;
  const basedOn = project.basedOn ? `Based on ${names.get(project.basedOn) ?? project.basedOn}` : null;
  return {
    id: project.id,
    name: project.name,
    location: [shortAddress(facts.address), basedOn].filter(Boolean).join(" · "),
    // Projects opened from a draft share the base project's building.
    floors: floorsFromText(WHY_IT_FITS),
    stakeholders: stakeholders.length,
    sent,
    status: sent > 0 ? <Tag tone="ready">In outreach</Tag> : <Tag>Building</Tag>,
    href: `/projects/${project.id}`,
  };
}

export default async function ProjectsPage() {
  const projects = await listProjects();
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const loaded = (await Promise.all(projects.map((p) => projectRow(p, names)))).filter((r): r is ProjectRow => r !== null);

  const rows: ProjectRow[] = [
    ...loaded,
    ...SAMPLE_PROJECTS.map((p) => ({
      id: p.id,
      name: p.name,
      location: p.location,
      floors: floorsFromText(p.whyItFits),
      stakeholders: p.stakeholders,
      sent: 0,
      status: <Tag>New</Tag>,
    })),
  ];
  const inOutreach = rows.filter((r) => r.sent > 0).length;

  return (
    <div className="flex flex-col p-8">
      <PageHeader
        title="Projects"
        description={
          <>
            <span className="app-num">{rows.length}</span> projects ·{" "}
            {inOutreach > 0 ? (
              <>
                <span className="app-num">{inOutreach}</span> in outreach
              </>
            ) : (
              "none in outreach"
            )}
          </>
        }
      />

      <Panel flush>
        {/* One slot width for every row: the sent count right-aligned in its 112 px column, then the status, so both
            line up down the list. Rows without an href don't open, and MediaRow mutes them. */}
        <MediaList label="Projects" trailingWidth={224}>
          {rows.map((r) => (
            <MediaRow key={r.id} href={r.href} media={<ElevationGlyph floors={r.floors} />} title={r.name} meta={r.location}>
              <span className="w-28 text-right text-xs whitespace-nowrap text-muted">
                <span className={cx("app-num", r.href && "text-ink")}>{r.sent}</span> of{" "}
                <span className={cx("app-num", r.href && "text-ink")}>{r.stakeholders}</span> sent
              </span>
              {r.status}
            </MediaRow>
          ))}
        </MediaList>
      </Panel>
    </div>
  );
}
