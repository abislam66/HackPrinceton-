import { notFound } from "next/navigation";
import { loadModelInfo } from "@/features/model/load";
import { loadClient, loadProject } from "@/features/project/load";
import { getProposal } from "@/features/proposal/store";
import { ProposalTracker } from "@/features/tracking/ProposalTracker";
import { teaserPath } from "@/features/viewer/camera-paths";
import { ModelViewer } from "@/features/viewer/ModelViewer";

export default async function ProposalPage({ params, searchParams }: PageProps<"/proposals/[client]">) {
  const { client: clientId } = await params;
  // Internal previews (?preview=1) must not count as client activity.
  const isPreview = (await searchParams).preview === "1";
  const client = await loadClient(clientId);
  if (!client) notFound();

  const [project, model, proposal] = await Promise.all([loadProject(), loadModelInfo(), getProposal(clientId)]);

  return (
    <main className="flex flex-1 flex-col">
      {isPreview ? null : <ProposalTracker clientId={client.id} />}
      <section className="relative h-[80vh] min-h-96">
        <ModelViewer model={model} path={teaserPath(model.boundingBox)} loop={false} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6 sm:p-10">
          <p className="text-sm text-zinc-300">
            {client.company} · {project.name}
          </p>
          {proposal ? <p className="mt-2 max-w-2xl text-3xl font-semibold">{proposal.pitch.teaserLine}</p> : null}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16">
        {proposal ? (
          <>
            <h1 className="text-3xl font-semibold">{proposal.pitch.headline}</h1>
            <p className="text-lg text-zinc-300">{proposal.pitch.problem}</p>
            <p className="text-lg text-zinc-300">{proposal.pitch.solution}</p>
          </>
        ) : (
          <p className="text-zinc-400">
            No proposal has been generated for {client.company} yet. POST /api/proposals/{client.id}/generate to create
            one.
          </p>
        )}
        {model.url ? null : (
          <p className="text-sm text-zinc-500">Showing a gray-box stand-in. The model builder has not produced a model yet.</p>
        )}
      </section>
    </main>
  );
}
