import { notFound } from "next/navigation";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";
import { loadModelInfo } from "@/features/model/load";
import { loadClient, loadProject } from "@/features/project/load";
import { getProposal } from "@/features/proposal/store";
import { teaserPath } from "@/features/viewer/camera-paths";
import { ModelViewer } from "@/features/viewer/ModelViewer";

export default async function ProposalPage({ params }: PageProps<"/proposals/[client]">) {
  const { client: clientId } = await params;
  const client = await loadClient(clientId);
  if (!client) notFound();

  const [project, model, proposal] = await Promise.all([loadProject(), loadModelInfo(), getProposal(clientId)]);

  return (
    <main className="flex flex-1 flex-col">
      {/* The opening sits on Asphalt: the one dark moment on the page. Text is pinned to the bottom left edge. */}
      <section className="tm-ground-asphalt relative h-[80vh] min-h-96">
        <ModelViewer model={model} path={teaserPath(model.boundingBox)} className="absolute inset-0" />
        <div className="tm-wrap pointer-events-none absolute inset-x-0 bottom-0 pb-8">
          <p className="tm-label">
            {client.company} / {project.name}
          </p>
          {proposal ? (
            <Heading as="p" size="m" className="mt-4 max-w-[18ch]">
              {proposal.pitch.teaserLine}
            </Heading>
          ) : null}
        </div>
      </section>

      <section className="tm-wrap pt-24 pb-32">
        <div className="tm-grid gap-y-8">
          <div className="col-span-full tab:col-span-2 desk:col-span-3">
            <Eyebrow>{proposal ? `For ${client.company}` : "Not generated"}</Eyebrow>
          </div>
          <div className="col-span-full tab:col-span-6 desk:col-span-7">
            {proposal ? (
              <>
                <Heading as="h1" size="m">
                  {proposal.pitch.headline}
                </Heading>
                <p className="tm-body mt-8 max-w-[66ch]">{proposal.pitch.problem}</p>
                <p className="tm-body mt-6 max-w-[66ch]">{proposal.pitch.solution}</p>
              </>
            ) : (
              <p className="tm-body max-w-[66ch]">
                No proposal has been generated for {client.company} yet. POST /api/proposals/{client.id}/generate to create
                one.
              </p>
            )}
            {model.url ? null : (
              <p className="tm-text--s tm-muted mt-8 max-w-[66ch]">
                Showing a gray-box stand-in. The model builder has not produced a model yet.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
