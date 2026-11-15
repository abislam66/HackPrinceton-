import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TD, TH, THead, TR, Table } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { Tag } from "@/components/ui/Tag";
import { formatShortDate, formatWatch, relativeTime } from "@/features/demo/format";
import { SAMPLE_REPLIES, SAMPLE_SENT } from "@/features/demo/outreach";
import { loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
import { loadStakeholders, type StakeholderStatus } from "@/features/workspace/status";
import { NEED_LABEL, ROLE_LABEL } from "@/lib/labels";

type Tab = "sent" | "replies" | "drafts";

const GMAIL_TOOLTIP = "Gmail integration is coming";

function workspaceHref(clientId: string, tab?: string) {
  return `/projects/${PROJECT_SLUG}/stakeholders/${clientId}${tab ? `?tab=${tab}` : ""}`;
}

function lastActivity(s: StakeholderStatus): string {
  if (s.engagement.lastAt) return relativeTime(s.engagement.lastAt);
  return "Sent · not opened yet";
}

function StatusTag({ opened }: { opened: boolean }) {
  return opened ? <Tag variant="go">Opened</Tag> : <Tag variant="quiet">Waiting</Tag>;
}

function SentTab({ sent, projectName }: { sent: StakeholderStatus[]; projectName: string }) {
  return (
    <div className="flex flex-col gap-4">
      {sent.length === 0 ? (
        <p className="tm-text--s tm-muted">
          Nothing sent yet from this project. Build and send a proposal from a stakeholder&apos;s workspace.
        </p>
      ) : null}
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Stakeholder</TH>
              <TH>Project</TH>
              <TH>Sent</TH>
              <TH num>Opens</TH>
              <TH num className="whitespace-nowrap">Watch time</TH>
              <TH>Last activity</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {sent.map((s) => (
              <TR key={s.client.id} className="transition-colors duration-200 ease-link hover:bg-stucco">
                <TD>
                  <Link
                    href={workspaceHref(s.client.id, "engagement")}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {s.client.company}
                  </Link>
                </TD>
                <TD className="tm-muted">{projectName}</TD>
                <TD className="tm-num whitespace-nowrap">{s.sentAt ? formatShortDate(s.sentAt) : "–"}</TD>
                <TD num>{s.engagement.opens}</TD>
                <TD num className="whitespace-nowrap">{formatWatch(s.engagement.watchSeconds)}</TD>
                <TD className="tm-muted tm-num">{lastActivity(s)}</TD>
                <TD>
                  <StatusTag opened={s.engagement.opens > 0 || s.engagement.highIntent} />
                </TD>
              </TR>
            ))}
            {SAMPLE_SENT.map((row) => (
              <TR key={row.id}>
                <TD>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold">{row.stakeholder}</span>
                    <Tag variant="quiet">Sample</Tag>
                  </span>
                </TD>
                <TD className="tm-muted">{row.project}</TD>
                <TD className="tm-num whitespace-nowrap">{row.sent}</TD>
                <TD num>{row.opens}</TD>
                <TD num className="whitespace-nowrap">{formatWatch(row.watchSeconds)}</TD>
                <TD className="tm-muted">{row.lastActivity}</TD>
                <TD>
                  <StatusTag opened={row.opened} />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function RepliesTab() {
  return (
    <Card>
      <ul>
        {SAMPLE_REPLIES.map((r) => (
          <li key={r.id} className="flex items-start gap-5 border-b border-rule/40 p-5 last:border-b-0">
            <Avatar name={r.stakeholder} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-3">
                <span className="tm-text--m font-semibold">{r.stakeholder}</span>
                <span className="tm-text--s tm-muted">{r.project}</span>
                <Tag variant="quiet">Sample</Tag>
              </div>
              <p className="tm-text--s max-w-[66ch]">{r.excerpt}</p>
            </div>
            <span className="tm-text--s tm-muted tm-num shrink-0">{r.received}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DraftsTab({ drafts }: { drafts: StakeholderStatus[] }) {
  if (drafts.length === 0) {
    return (
      <Card>
        <EmptyState
          eyebrow="Drafts"
          title="No drafts"
          description="Proposals that are built but not sent yet show up here."
          action={
            <Button href={`/projects/${PROJECT_SLUG}`} variant="primary">
              Open stakeholders
            </Button>
          }
        />
      </Card>
    );
  }
  return (
    <Card>
      <ul>
        {drafts.map((s, i) => (
          <li key={s.client.id} className="flex items-center gap-5 border-b border-rule/40 p-5 last:border-b-0">
            <Avatar name={s.client.company} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="tm-text--m truncate font-semibold">{s.client.company}</p>
              <p className="tm-text--s tm-muted truncate">{ROLE_LABEL[s.client.role]}</p>
              <p className="tm-text--s">Needs: {NEED_LABEL[s.client.need]}</p>
            </div>
            <Tag variant="ink">Ready to send</Tag>
            <Button href={workspaceHref(s.client.id)} variant={i === 0 ? "primary" : "ghost"} compact>
              Open workspace
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "replies" || rawTab === "drafts" ? rawTab : "sent";
  const [project, stakeholders] = await Promise.all([loadProject(), loadStakeholders()]);

  return (
    <div className="flex flex-col p-8">
      <PageHeader
        title="Outreach"
        description="Every proposal sent, and how each stakeholder engaged"
        actions={
          <span title={GMAIL_TOOLTIP}>
            <Button variant="ghost" compact arrow={false} disabled title={GMAIL_TOOLTIP}>
              Connect Gmail
            </Button>
          </span>
        }
      />

      <div className="flex flex-col gap-6">
        <Tabs
          items={[
            { label: "Sent", href: "/outreach", active: tab === "sent" },
            { label: "Replies", href: "/outreach?tab=replies", active: tab === "replies" },
            { label: "Drafts", href: "/outreach?tab=drafts", active: tab === "drafts" },
          ]}
        />

        {tab === "sent" ? (
          <SentTab sent={stakeholders.filter((s) => s.stage === "sent")} projectName={project.name} />
        ) : tab === "replies" ? (
          <RepliesTab />
        ) : (
          <DraftsTab drafts={stakeholders.filter((s) => s.stage === "ready")} />
        )}
      </div>
    </div>
  );
}
