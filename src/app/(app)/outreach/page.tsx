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
import { getOutreachOverview } from "@/features/outreach/actions";
import type { OutreachMessage, OutreachOverview, OutreachReply } from "@/features/outreach/schema";
import { loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
import { loadStakeholders, type StakeholderStatus } from "@/features/workspace/status";
import { NEED_LABEL, ROLE_LABEL } from "@/lib/labels";
import { CheckRepliesButton } from "./_components/CheckRepliesButton";

type Tab = "sent" | "replies" | "drafts";

const GMAIL_SETUP = "Set the Gmail keys in .env.local to send real email. See docs/live-pipeline.md, Gmail setup.";

function workspaceHref(clientId: string, tab?: string) {
  return `/projects/${PROJECT_SLUG}/stakeholders/${clientId}${tab ? `?tab=${tab}` : ""}`;
}

/** A sent stakeholder with the email that went to them, when one did. */
type SentRow = { status: StakeholderStatus; message: OutreachMessage | null };

/** A reply with who it answered. */
type ReplyRow = OutreachReply & { company: string; subject: string; clientId: string };

function isOpened(s: StakeholderStatus): boolean {
  return s.engagement.opens > 0 || s.engagement.highIntent;
}

function lastActivity(s: StakeholderStatus): string {
  if (s.engagement.lastAt) return relativeTime(s.engagement.lastAt);
  return "Not opened yet";
}

function StatusTag({ row }: { row: SentRow }) {
  if (row.message && row.message.replies.length > 0) return <Tag tone="pass">Replied</Tag>;
  return isOpened(row.status) ? <Tag tone="pass">Opened</Tag> : <Tag tone="neutral">Waiting</Tag>;
}

/** "Sam Lee <sam@example.com>" → "Sam Lee". */
function senderName(from: string): string {
  const name = from.replace(/<[^>]*>/, "").replace(/"/g, "").trim();
  return name || from.replace(/[<>]/g, "");
}

function SentTab({ rows, projectName }: { rows: SentRow[]; projectName: string }) {
  if (rows.length === 0) {
    return (
      <Panel flush>
        <EmptyState
          title="Nothing sent yet"
          description="Send a built proposal from its stakeholder's page. It shows up here with its opens and replies."
          action={
            <Button href={`/projects/${PROJECT_SLUG}`} variant="primary">
              Open stakeholders
            </Button>
          }
        />
      </Panel>
    );
  }
  return (
    // Compact, so the columns sit on one line from 1024 px wide with the sidebar collapsed.
    <Panel flush className="overflow-x-auto">
      <Table density="compact">
        <THead>
          <tr>
            <TH>Stakeholder</TH>
            <TH>Project</TH>
            <TH>Sent</TH>
            <TH>Email</TH>
            <TH num>Opens</TH>
            <TH num>Watch time</TH>
            <TH>Last activity</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map(({ status: s, message }) => {
            const sentAt = message?.sentAt ?? s.sentAt;
            return (
              <TR key={s.client.id}>
                <TD>
                  <Link
                    href={workspaceHref(s.client.id, "engagement")}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {s.client.company}
                  </Link>
                </TD>
                <TD className="text-muted">{projectName}</TD>
                <TD mono>{sentAt ? formatShortDate(sentAt) : "–"}</TD>
                <TD className="text-muted">
                  {message?.status === "sent" ? `Gmail · ${message.deliveredTo ?? "team inbox"}` : "Not emailed"}
                </TD>
                <TD num>{s.engagement.opens}</TD>
                <TD num>{formatWatch(s.engagement.watchSeconds)}</TD>
                <TD className="text-muted">{lastActivity(s)}</TD>
                <TD>
                  <StatusTag row={{ status: s, message }} />
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Panel>
  );
}

/* Replies are read in full here (nothing opens a reply), so the excerpt wraps instead of truncating like a MediaRow. */
function RepliesTab({ replies, gmailConfigured }: { replies: ReplyRow[]; gmailConfigured: boolean }) {
  if (replies.length === 0) {
    return (
      <Panel flush>
        <EmptyState
          title="No replies yet"
          description={
            gmailConfigured
              ? "Replies to the emails we sent show up here. Gmail is checked when this page loads, at most every 30 seconds."
              : "Connect Gmail to send proposals by email and see the replies here."
          }
        />
      </Panel>
    );
  }
  return (
    <Panel flush>
      <ul className="app-rows">
        {replies.map((r) => (
          <li key={r.gmailMessageId} className="flex items-start gap-4 px-5 py-4">
            <Avatar name={senderName(r.from)} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-sm leading-[18px] font-semibold">{senderName(r.from)}</span>
                <Link
                  href={workspaceHref(r.clientId, "engagement")}
                  className="text-xs leading-4 text-muted underline-offset-4 hover:underline"
                >
                  Re: {r.company}
                </Link>
              </p>
              <p className="max-w-[66ch] text-sm leading-[22px] text-pretty">{r.snippet}</p>
            </div>
            <span className="app-num shrink-0 text-xs leading-[18px] text-muted">{relativeTime(r.receivedAt)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function DraftTag({ message }: { message: OutreachMessage | undefined }) {
  if (message?.status === "failed") return <Tag tone="fail">Send failed</Tag>;
  if (message?.status === "draft") return <Tag tone="ready">Email drafted</Tag>;
  return <Tag tone="ready">Ready to send</Tag>;
}

function DraftsTab({ drafts, messages }: { drafts: StakeholderStatus[]; messages: Map<string, OutreachMessage> }) {
  if (drafts.length === 0) {
    return (
      <Panel flush>
        <EmptyState
          title="No drafts"
          description="Proposals that are built but not sent yet show up here."
          action={
            <Button href={`/projects/${PROJECT_SLUG}`} variant="primary">
              Open stakeholders
            </Button>
          }
        />
      </Panel>
    );
  }
  return (
    <Panel flush>
      <MediaList trailingWidth={112}>
        {drafts.map((s) => (
          <MediaRow
            key={s.client.id}
            href={workspaceHref(s.client.id)}
            media={<Avatar name={s.client.company} />}
            title={s.client.company}
            meta={`${ROLE_LABEL[s.client.role]} · Needs: ${NEED_LABEL[s.client.need]}`}
          >
            <DraftTag message={messages.get(s.client.id)} />
          </MediaRow>
        ))}
      </MediaList>
    </Panel>
  );
}

async function overviewOrNull(): Promise<OutreachOverview | null> {
  try {
    return await getOutreachOverview();
  } catch (error) {
    console.error("Outreach page: could not load the outreach overview.", error);
    return null;
  }
}

function GmailLine({ overview }: { overview: OutreachOverview | null }) {
  if (!overview?.gmail.configured) return <>Gmail isn&apos;t connected, so sending only marks a proposal sent.</>;
  const from = overview.gmail.account ?? "the demo Gmail account";
  const to = overview.gmail.deliverTo ?? "the team inbox";
  return (
    <>
      Sending from {from}. During the hackathon every email goes to {to}, never to the stakeholder.
    </>
  );
}

export default async function OutreachPage({ searchParams }: PageProps<"/outreach">) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "replies" || rawTab === "drafts" ? rawTab : "sent";
  const [project, stakeholders, overview] = await Promise.all([loadProject(), loadStakeholders(), overviewOrNull()]);

  const messages = new Map((overview?.messages ?? []).map((m) => [m.clientId, m]));
  // Sent: the proposal was sent, or its email went out (the Agent tab can send without the workspace).
  const sent: SentRow[] = stakeholders
    .filter((s) => s.stage === "sent" || messages.get(s.client.id)?.status === "sent")
    .map((s) => ({ status: s, message: messages.get(s.client.id) ?? null }));
  const sentIds = new Set(sent.map((r) => r.status.client.id));
  const drafts = stakeholders.filter((s) => s.stage === "ready" && !sentIds.has(s.client.id));
  const replies: ReplyRow[] = (overview?.messages ?? [])
    .flatMap((m) =>
      m.replies.map((r) => ({ ...r, company: m.intendedFor.company, subject: m.subject, clientId: m.clientId })),
    )
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const openedCount = sent.filter((r) => isOpened(r.status)).length;

  return (
    <div className="flex flex-col p-8">
      <PageHeader
        title="Outreach"
        description={
          <span className="flex flex-col gap-1">
            <span>
              <span className="app-num">{openedCount}</span> of <span className="app-num">{sent.length}</span> sent
              proposals opened
            </span>
            <span className="text-[13px] leading-5">
              <GmailLine overview={overview} />
            </span>
          </span>
        }
        actions={
          overview?.gmail.configured ? (
            <CheckRepliesButton />
          ) : (
            <Button disabled disabledReason={GMAIL_SETUP}>
              Connect Gmail
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-6">
        <Tabs
          label="Outreach"
          items={[
            { label: "Sent", href: "/outreach", active: tab === "sent", count: sent.length },
            { label: "Replies", href: "/outreach?tab=replies", active: tab === "replies", count: replies.length },
            { label: "Drafts", href: "/outreach?tab=drafts", active: tab === "drafts", count: drafts.length },
          ]}
        />

        {tab === "sent" ? (
          <SentTab rows={sent} projectName={project.name} />
        ) : tab === "replies" ? (
          <RepliesTab replies={replies} gmailConfigured={Boolean(overview?.gmail.configured)} />
        ) : (
          <DraftsTab drafts={drafts} messages={messages} />
        )}
      </div>
    </div>
  );
}
