import { notFound } from "next/navigation";
import { loadModelInfo } from "@/features/model/load";
import { loadClient } from "@/features/project/load";
import { getProposal } from "@/features/proposal/store";
import { ShotPreview } from "@/features/shots/ShotPreview";

export default async function ShotPreviewPage({ params }: PageProps<"/proposals/[client]/shots">) {
  const { client: clientId } = await params;
  const client = await loadClient(clientId);
  if (!client) notFound();

  const [model, proposal] = await Promise.all([loadModelInfo(), getProposal(clientId)]);
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
