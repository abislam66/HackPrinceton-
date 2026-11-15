import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
import { loadStakeholderModel } from "@/features/workspace/model";
import { loadStakeholder } from "@/features/workspace/status";
import { NEED_LABEL } from "@/lib/labels";
import { StakeholderActions } from "./_components/StakeholderActions";
import { Workspace, type WorkspaceTab } from "./_components/Workspace";

const TABS: WorkspaceTab[] = ["shots", "pitch", "engagement"];

/** 4 Stakeholder workspace: build, review and send one stakeholder's proposal. */
export default async function StakeholderPage({
  params,
  searchParams,
}: PageProps<"/projects/[project]/stakeholders/[client]">) {
  const { project: projectSlug, client: clientId } = await params;
  if (projectSlug !== PROJECT_SLUG) notFound();

  const [status, project, model, query] = await Promise.all([
    loadStakeholder(clientId),
    loadProject(),
    loadStakeholderModel(clientId),
    searchParams,
  ]);
  if (!status) notFound();

  const { client, stage, proposal, engagement, events, sentAt } = status;
  const basePath = `/projects/${PROJECT_SLUG}/stakeholders/${client.id}`;

  const requested = typeof query.tab === "string" ? (query.tab as WorkspaceTab) : null;
  const fallbackTab: WorkspaceTab = stage === "sent" ? "engagement" : "shots";
  const tab =
    requested && TABS.includes(requested) && (requested !== "engagement" || stage === "sent") ? requested : fallbackTab;

  return (
    <div className="flex h-dvh flex-col p-8">
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${PROJECT_SLUG}` },
          { label: client.company },
        ]}
        title={client.company}
        description={`${client.contact.name}, ${client.contact.title} · Needs: ${NEED_LABEL[client.need]}`}
        actions={
          stage === "not-built" ? undefined : (
            <StakeholderActions
              stage={stage}
              client={{ id: client.id, company: client.company, contact: client.contact }}
              projectName={project.name}
              basePath={basePath}
              opens={engagement.opens}
              sentAt={sentAt}
            />
          )
        }
      />
      <Workspace
        basePath={basePath}
        stage={stage}
        tab={tab}
        model={model}
        client={client}
        proposal={proposal}
        engagement={engagement}
        events={events}
        sentAt={sentAt}
      />
    </div>
  );
}
