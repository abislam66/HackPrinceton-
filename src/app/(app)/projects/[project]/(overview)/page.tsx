import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaList, MediaRow } from "@/components/ui/MediaRow";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { projectBuilding } from "@/features/project-agent/store";
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
  const [building, stakeholders] = await Promise.all([projectBuilding(slug), loadStakeholders(slug)]);
  // The layout has already 404ed an unknown project.
  if (!building) return null;
  const sent = stakeholders.filter((s) => s.stage === "sent").length;
  const base = `/projects/${slug}`;

  // The dossier has its own tab, so the stakeholders get the whole view.
  return (
    <Panel title="Proposals" count={`${sent} of ${stakeholders.length} sent`} flush>
      {stakeholders.length === 0 ? (
        <EmptyState
          title="No stakeholders"
          description={
            building.kind === "scouted"
              ? "Research the dossier: the firms it finds on this project become its stakeholders. Or ask the project agent to add one."
              : "Ask the project agent to add one: who they are and what they need from footage."
          }
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
  );
}
