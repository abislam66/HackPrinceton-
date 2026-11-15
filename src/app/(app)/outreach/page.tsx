import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaList, MediaRow } from "@/components/ui/MediaRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { TD, TH, THead, TR, Table } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { Tag } from "@/components/ui/Tag";
import { formatShortDate, formatWatch, relativeTime } from "@/features/demo/format";
import { SAMPLE_REPLIES, SAMPLE_SENT } from "@/features/demo/outreach";
import { listProjects } from "@/features/project-agent/store";
import { loadStakeholders, type StakeholderStatus } from "@/features/workspace/status";
import { NEED_LABEL, ROLE_LABEL } from "@/lib/labels";

type Tab = "sent" | "replies" | "drafts";

const GMAIL_REASON = "Gmail integration isn't available yet.";

function workspaceHref(s: StakeholderStatus, tab?: string) {
  return `/projects/${s.projectSlug}/stakeholders/${s.client.id}${tab ? `?tab=${tab}` : ""}`;
}

function lastActivity(s: StakeholderStatus): string {
  if (s.engagement.lastAt) return relativeTime(s.engagement.lastAt);
  return "Sent · not opened yet";
}

function isOpened(s: StakeholderStatus): boolean {
  return s.engagement.opens > 0 || s.engagement.highIntent;
}

function StatusTag({ opened }: { opened: boolean }) {
  return opened ? <Tag tone="pass">Opened</Tag> : <Tag tone="neutral">Waiting</Tag>;
}

function SentTab({ sent, projectNames }: { sent: StakeholderStatus[]; projectNames: Map<string, string> }) {
  return (
    // Compact, so the seven columns sit on one line from 1024 px wide with the sidebar collapsed.
    <Panel flush className="overflow-x-auto">
      <Table density="compact">
        <THead>
          <tr>
            <TH>Stakeholder</TH>
            <TH>Project</TH>
            <TH>Sent</TH>
            <TH num>Opens</TH>
            <TH num>Watch time</TH>
            <TH>Last activity</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <tbody>
          {sent.map((s) => (
            <TR key={`${s.projectSlug}/${s.client.id}`}>
              <TD>
                <Link
                  href={workspaceHref(s, "engagement")}
                  className="font-semibold underline-offset-4 hover:underline"
                >
                  {s.client.company}
                </Link>
              </TD>
              <TD className="text-muted">{projectNames.get(s.projectSlug) ?? s.projectSlug}</TD>
              <TD mono>{s.sentAt ? formatShortDate(s.sentAt) : "–"}</TD>
              <TD num>{s.engagement.opens}</TD>
              <TD num>{formatWatch(s.engagement.watchSeconds)}</TD>
              <TD className="text-muted">{lastActivity(s)}</TD>
              <TD>
                <StatusTag opened={isOpened(s)} />
              </TD>
            </TR>
          ))}
          {SAMPLE_SENT.map((row) => (
            <TR key={row.id}>
              <TD className="font-semibold">{row.stakeholder}</TD>
              <TD className="text-muted">{row.project}</TD>
              <TD mono>{row.sent}</TD>
              <TD num>{row.opens}</TD>
              <TD num>{formatWatch(row.watchSeconds)}</TD>
              <TD className="text-muted">{row.lastActivity}</TD>
              <TD>
                <StatusTag opened={row.opened} />
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

/* Replies are read in full here (nothing opens a reply), so the excerpt wraps instead of truncating like a MediaRow. */
function RepliesTab() {
  return (
    <Panel flush>
      <ul className="app-rows">
        {SAMPLE_REPLIES.map((r) => (
          <li key={r.id} className="flex items-start gap-4 px-5 py-4">
            <Avatar name={r.stakeholder} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-sm leading-[18px] font-semibold">{r.stakeholder}</span>
                <span className="text-xs leading-4 text-muted">{r.project}</span>
              </p>
              <p className="max-w-[66ch] text-sm leading-[22px] text-pretty">{r.excerpt}</p>
            </div>
            <span className="app-num shrink-0 text-xs leading-[18px] text-muted">{r.received}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function DraftsTab({ drafts }: { drafts: StakeholderStatus[] }) {
  if (drafts.length === 0) {
    return (
      <Panel flush>
        <EmptyState
          title="No drafts"
          description="Proposals that are built but not sent yet show up here."
          action={
            <Button href="/projects" variant="primary">
              Open projects
            </Button>
          }
        />
      </Panel>
    );
  }
  return (
    <Panel flush>
      <MediaList>
        {drafts.map((s) => (
          <MediaRow
            key={`${s.projectSlug}/${s.client.id}`}
            href={workspaceHref(s)}
            media={<Avatar name={s.client.company} />}
            title={s.client.company}
            meta={`${ROLE_LABEL[s.client.role]} · Needs: ${NEED_LABEL[s.client.need]}`}
          >
            <Tag tone="ready">Ready to send</Tag>
          </MediaRow>
        ))}
      </MediaList>
    </Panel>
  );
}

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "replies" || rawTab === "drafts" ? rawTab : "sent";
  // Every project's stakeholders: the demo project and the ones the project agent opened.
  const projects = await listProjects();
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const stakeholders = (await Promise.all(projects.map((p) => loadStakeholders(p.id)))).flat();

  const sent = stakeholders.filter((s) => s.stage === "sent");
  const drafts = stakeholders.filter((s) => s.stage === "ready");
  const sentCount = sent.length + SAMPLE_SENT.length;
  const openedCount = sent.filter(isOpened).length + SAMPLE_SENT.filter((row) => row.opened).length;

  return (
    <div className="flex flex-col p-8">
      <PageHeader
        title="Outreach"
        description={
          <>
            <span className="app-num">{openedCount}</span> of <span className="app-num">{sentCount}</span> sent
            proposals opened
          </>
        }
        actions={
          <Button disabled disabledReason={GMAIL_REASON}>
            Connect Gmail
          </Button>
        }
      />

      <div className="flex flex-col gap-6">
        <Tabs
          label="Outreach"
          items={[
            { label: "Sent", href: "/outreach", active: tab === "sent", count: sentCount },
            { label: "Replies", href: "/outreach?tab=replies", active: tab === "replies", count: SAMPLE_REPLIES.length },
            { label: "Drafts", href: "/outreach?tab=drafts", active: tab === "drafts", count: drafts.length },
          ]}
        />

        {tab === "sent" ? (
          <SentTab sent={sent} projectNames={projectNames} />
        ) : tab === "replies" ? (
          <RepliesTab />
        ) : (
          <DraftsTab drafts={drafts} />
        )}
      </div>
    </div>
  );
}
