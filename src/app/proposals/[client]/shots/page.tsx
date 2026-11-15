import { notFound } from "next/navigation";
import { getProposal } from "@/features/proposal/store";
import { ShotPreview } from "@/features/shots/ShotPreview";
import { findStakeholder } from "@/features/workspace/status";
import { loadStakeholderModel } from "@/features/workspace/model";

export default async function ShotPreviewPage({ params }: PageProps<"/proposals/[client]/shots">) {
  const { client: clientId } = await params;
  // The URL carries only the client; its project is the one that holds this stakeholder id.
  const found = await findStakeholder(clientId);
  if (!found) notFound();
  const { client, projectSlug } = found;

  const [model, proposal] = await Promise.all([loadStakeholderModel(clientId, projectSlug), getProposal(clientId, projectSlug)]);
  const shots = proposal?.shots ?? [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold">Shot preview · {client.company}</h1>
      {shots.length > 0 ? (
        <ShotPreview model={model} shots={shots} />
      ) : (
        <p className="text-zinc-400">No shots have been generated for {client.company} yet.</p>
      )}
    </main>
  );
}
