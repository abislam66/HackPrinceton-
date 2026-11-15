import { notFound } from "next/navigation";
import { draftView } from "@/components/project-agent/draft-view";
import { PageHeader } from "@/components/ui/PageHeader";
import { senderFor } from "@/features/outreach/gmail";
import { listDrafts, loadProjectFacts } from "@/features/project-agent/store";
import { loadStakeholderModel } from "@/features/workspace/model";
import { loadStakeholder } from "@/features/workspace/status";
import { getSessionEmail } from "@/lib/auth/session";
import { NEED_LABEL } from "@/lib/labels";
import { StakeholderActions } from "./_components/StakeholderActions";
import { Workspace, type WorkspaceTab } from "./_components/Workspace";

const TABS: WorkspaceTab[] = ["shots", "engagement", "agent"];

/** 4 Stakeholder workspace: build, review and send one stakeholder's proposal. */
export default async function StakeholderPage({
  params,
  searchParams,
}: PageProps<"/projects/[project]/stakeholders/[client]">) {
  const { project: projectSlug, client: clientId } = await params;

  const [project, status, model, query, drafts, email] = await Promise.all([
    loadProjectFacts(projectSlug),
    loadStakeholder(projectSlug, clientId),
    loadStakeholderModel(clientId, projectSlug),
    searchParams,
    listDrafts(projectSlug),
    getSessionEmail(),
  ]);
  // The Gmail the app can send this person's proposals from: theirs, if it's one of OUTREACH_SENDERS. Null otherwise.
  const sendFrom = senderFor(email)?.email ?? null;
  if (!project || !status) notFound();

  const { client, stage, proposal, engagement, events, sentAt } = status;
  const projectPath = `/projects/${projectSlug}`;
  const pending = drafts.filter((d) => d.status === "pending" && d.clientId === client.id).map(draftView);
  const basePath = `${projectPath}/stakeholders/${client.id}`;

  const requested = typeof query.tab === "string" ? (query.tab as WorkspaceTab) : null;
  const fallbackTab: WorkspaceTab = stage === "sent" ? "engagement" : "shots";
  const tab =
    requested && TABS.includes(requested) && (requested !== "engagement" || stage === "sent") ? requested : fallbackTab;

  return (
    <div className="flex h-dvh flex-col p-8">
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: projectPath },
          { label: client.company },
        ]}
        title={client.company}
        description={`${client.contact.name}, ${client.contact.title} · Needs: ${NEED_LABEL[client.need]}`}
        actions={
          stage === "not-built" ? undefined : (
            <StakeholderActions
              stage={stage}
              projectSlug={projectSlug}
              client={{ id: client.id, company: client.company, contact: client.contact }}
              projectName={project.name}
              basePath={basePath}
              opens={engagement.opens}
              sentAt={sentAt}
              sendFrom={sendFrom}
            />
          )
        }
      />
      <Workspace
        projectSlug={projectSlug}
        basePath={basePath}
        stage={stage}
        tab={tab}
        model={model}
        client={client}
        proposal={proposal}
        engagement={engagement}
        events={events}
        sentAt={sentAt}
        drafts={pending}
      />
    </div>
  );
}
