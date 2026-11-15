import { ElevationGlyph, floorsFromText } from "@/components/ui/ElevationGlyph";
import { MediaList, MediaRow } from "@/components/ui/MediaRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { WHY_IT_FITS, shortAddress } from "@/features/demo/building";
import { SAMPLE_PROJECTS } from "@/features/demo/projects";
import { loadClients, loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
import { cx } from "@/lib/cx";

type Found = {
  id: string;
  name: string;
  location: string;
  why: string;
  stakeholders: number;
  /** Only the loaded project opens; the others are plain rows. */
  href?: string;
};

/*
 * What the scout searched for. Shown as plain text, not as filter chips: every project here matches all four, and
 * nothing records when the scout found each one, so a toggle would change nothing.
 */
function ScoutCriteria() {
  return (
    <>
      Scout criteria: Philadelphia · Finished buildings · Residential · Last <span className="app-num">7</span> days
    </>
  );
}

export default async function DiscoverPage() {
  const [project, clients] = await Promise.all([loadProject(), loadClients()]);

  const found: Found[] = [
    {
      id: PROJECT_SLUG,
      name: project.name,
      location: shortAddress(project.address),
      why: WHY_IT_FITS,
      stakeholders: clients.length,
      href: `/projects/${PROJECT_SLUG}`,
    },
    ...SAMPLE_PROJECTS.map((p) => ({
      id: p.id,
      name: p.name,
      location: p.location,
      why: p.whyItFits,
      stakeholders: p.stakeholders,
    })),
  ];

  return (
    <div className="flex flex-col p-8">
      <PageHeader title="Discover" description={<ScoutCriteria />} />

      <Panel title="Projects" count={found.length} flush>
        <MediaList>
          {found.map((p) => (
            <MediaRow
              key={p.id}
              href={p.href}
              media={<ElevationGlyph floors={floorsFromText(p.why)} />}
              title={p.name}
              meta={`${p.location} · ${p.why}`}
              // A row that doesn't open is quieter: a muted title, and no hover or chevron (MediaRow drops both).
              className={cx(!p.href && "text-muted")}
            >
              <span className="text-xs whitespace-nowrap text-muted">
                <span className={cx("app-num", p.href && "text-ink")}>{p.stakeholders}</span>{" "}
                {p.stakeholders === 1 ? "stakeholder" : "stakeholders"}
              </span>
            </MediaRow>
          ))}
        </MediaList>
      </Panel>
    </div>
  );
}
