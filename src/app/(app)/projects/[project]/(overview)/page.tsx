import { ScoutedProjectModel } from "@/components/app/model/ScoutedProjectModel";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaList, MediaRow } from "@/components/ui/MediaRow";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { DOSSIER_PEEK, SOURCES } from "@/features/demo/building";
import { loadProjectFacts } from "@/features/project-agent/store";
import { loadStakeholders, type StakeholderStatus } from "@/features/workspace/status";
import { NEED_LABEL, ROLE_LABEL } from "@/lib/labels";

/** The stage as a status: not built is neutral, ready is ready, opened is pass, sent but not opened is neutral. */
function StageTag({ status }: { status: StakeholderStatus }) {
  if (status.stage === "not-built") return <Tag>Not built</Tag>;
  if (status.stage === "ready") return <Tag tone="ready">Ready to send</Tag>;
  const { opens } = status.engagement;
  return opens > 0 ? <Tag tone="pass">{`Opened · ${opens}`}</Tag> : <Tag>Sent · not opened</Tag>;
}

export default async function ProjectStakeholdersPage({ params }: PageProps<"/projects/[project]">) {
  const { project: slug } = await params;
  const [project, stakeholders] = await Promise.all([loadProjectFacts(slug), loadStakeholders(slug)]);
  // Not a demo or agent-opened project: one added from scouting, with no stakeholders yet, so its first tab is its
  // model. (The model 404s for an unknown project.)
  if (!project) return <ScoutedProjectModel slug={slug} />;
  const sent = stakeholders.filter((s) => s.stage === "sent").length;
  const base = `/projects/${slug}`;

  return (
    <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel title="Proposals" count={`${sent} of ${stakeholders.length} sent`} flush>
        {stakeholders.length === 0 ? (
          <EmptyState
            title="No stakeholders"
            description="Ask the project agent to add one: who they are and what they need from footage."
          />
        ) : (
          // One slot width for every status, so the tags line up down the list.
          <MediaList trailingWidth={128}>
            {stakeholders.map((s) => (
              <MediaRow
                key={s.client.id}
                href={`${base}/stakeholders/${s.client.id}`}
                media={<Avatar name={s.client.company} />}
                title={s.client.company}
                meta={`${ROLE_LABEL[s.client.role]} · Needs: ${NEED_LABEL[s.client.need]}`}
              >
                <StageTag status={s} />
              </MediaRow>
            ))}
          </MediaList>
        )}
      </Panel>

      {/* Its own container: one column in the 320 px rail, two or three when the page folds it under the list. */}
      <Panel title="Dossier" action={<Button href={`${base}/dossier`}>Open dossier</Button>} className="@container">
        <dl className="grid gap-x-6 gap-y-4 @md:grid-cols-2 @2xl:grid-cols-3">
          {DOSSIER_PEEK.map((fact) => (
            <div key={fact.label} className="flex flex-col gap-1">
              <dt className="text-xs text-muted">{fact.label}</dt>
              <dd className="text-sm text-pretty">{fact.value}</dd>
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted">Sources</dt>
            <dd className="text-sm">
              <span className="app-num">{SOURCES.length}</span> public sources
            </dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}
