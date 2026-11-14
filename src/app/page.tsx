import Link from "next/link";
import { loadClients, loadProject } from "@/features/project/load";

// Read the client list on every request, so a new client file shows up without a rebuild.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [project, clients] = await Promise.all([loadProject(), loadClients()]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Project Proposal System</h1>
        <p className="text-zinc-400">
          {project.name} · {project.address}
        </p>
      </header>
      <ul className="flex flex-col gap-3">
        {clients.map((client) => (
          <li key={client.id} className="rounded-lg border border-zinc-800 p-4">
            <p className="font-medium">{client.company}</p>
            <p className="text-sm text-zinc-400">
              {client.role} · {client.need}
            </p>
            <p className="mt-3 flex gap-4 text-sm">
              <Link className="underline" href={`/proposals/${client.id}`}>
                Proposal
              </Link>
              <Link className="underline" href={`/proposals/${client.id}/shots`}>
                Shot preview
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
