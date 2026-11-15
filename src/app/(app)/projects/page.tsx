import type { ReactNode } from "react";
import { ElevationGlyph, floorsFromText } from "@/components/ui/ElevationGlyph";
import { MediaList, MediaRow } from "@/components/ui/MediaRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { WHY_IT_FITS, shortAddress } from "@/features/demo/building";
import { SAMPLE_PROJECTS } from "@/features/demo/projects";
import { loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
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
  /** Only the loaded project opens. */
  href?: string;
};

export default async function ProjectsPage() {
  const [project, stakeholders] = await Promise.all([loadProject(), loadStakeholders()]);
  const sent = stakeholders.filter((s) => s.stage === "sent").length;

  const rows: ProjectRow[] = [
    {
      id: PROJECT_SLUG,
      name: project.name,
      location: shortAddress(project.address),
      floors: floorsFromText(WHY_IT_FITS),
      stakeholders: stakeholders.length,
      sent,
      status: sent > 0 ? <Tag tone="ready">In outreach</Tag> : <Tag>Building</Tag>,
      href: `/projects/${PROJECT_SLUG}`,
    },
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
        <MediaList label="Projects">
          {rows.map((r) => (
            <MediaRow
              key={r.id}
              href={r.href}
              media={<ElevationGlyph floors={r.floors} />}
              title={r.name}
              meta={r.location}
              // A row that doesn't open is quieter: a muted title, and no hover or chevron (as on Discover).
              className={cx(!r.href && "text-muted")}
            >
              <span className="w-28 text-right text-xs whitespace-nowrap text-muted">
                <span className={cx("app-num", r.href && "text-ink")}>{r.sent}</span> of{" "}
                <span className={cx("app-num", r.href && "text-ink")}>{r.stakeholders}</span> sent
              </span>
              {/* One width for every status, so the tags line up down the list. */}
              <span className="flex w-24">{r.status}</span>
            </MediaRow>
          ))}
        </MediaList>
      </Panel>
    </div>
  );
}
