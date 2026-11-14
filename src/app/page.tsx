import { Button } from "@/components/Button";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";
import { SiteHeader } from "@/components/SiteHeader";
import { Tag } from "@/components/Tag";
import { loadModelInfo } from "@/features/model/load";
import { loadClients, loadProject } from "@/features/project/load";
import { loadProposal } from "@/lib/proposals";
import { StatusTag } from "./clients/[client]/_components/status";

// Read the client list on every request, so a new client file shows up without a rebuild.
export const dynamic = "force-dynamic";

/** "sales-and-bids" reads as "sales and bids". Tags set it in caps. */
const plain = (value: string) => value.replaceAll("-", " ");

export default async function Home() {
  const [project, clientList, model] = await Promise.all([loadProject(), loadClients(), loadModelInfo()]);
  const clients = await Promise.all(
    clientList.map(async (client) => ({
      ...client,
      status: (await loadProposal(client, model))?.proposal.status ?? null,
    })),
  );

  const specs = [
    { label: "Building", value: project.buildingType },
    { label: "Scope", value: project.scopeType },
    { label: "Timeline", value: project.timeline },
  ];

  return (
    <>
      <SiteHeader />
      <main className="flex-1 pb-32">
        <section className="tm-wrap pt-24 pb-16">
          <div className="tm-grid gap-y-8">
            <div className="col-span-full tab:col-span-2 desk:col-span-3">
              <Eyebrow>Project</Eyebrow>
            </div>
            {/* Indented one gutter so the title shares its left edge with the ruled rows below. */}
            <div className="col-span-full tab:col-span-6 tab:pl-(--tm-gutter) desk:col-span-9">
              <Heading as="h1" size="l">
                {project.name}
              </Heading>
              <p className="tm-lead mt-6 max-w-[44ch]">{project.address}</p>
            </div>
          </div>
        </section>

        <section className="tm-wrap" aria-label="Project details">
          <dl className="tm-grid border-t border-rule">
            {specs.map((spec, i) => (
              <div
                key={spec.label}
                className={`col-span-full border-rule py-5 max-tab:not-last:border-b tab:col-span-2 tab:border-l tab:pl-(--tm-gutter) desk:col-span-3 ${
                  i === 0 ? "tab:col-start-3 desk:col-start-4" : ""
                }`}
              >
                <dt className="tm-label tm-muted">{spec.label}</dt>
                <dd className="tm-text--m mt-2">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="tm-wrap">
          <div className="tm-grid border-t border-rule">
            <div className="col-span-full py-5 tab:col-span-2 desk:col-span-3">
              <Eyebrow>Clients</Eyebrow>
            </div>
            <ul className="col-span-full divide-y divide-rule border-rule tab:col-span-6 tab:border-l desk:col-span-9">
              {clients.map((client) => (
                <li key={client.id} className="flex flex-wrap items-start justify-between gap-x-(--tm-gutter) gap-y-6 py-6 tab:pl-(--tm-gutter)">
                  <div>
                    <Heading as="h2" size="xs">
                      {client.company}
                    </Heading>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Tag>{plain(client.role)}</Tag>
                      <Tag variant="quiet">{plain(client.need)}</Tag>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <StatusTag status={client.status} />
                    <Button href={`/clients/${client.id}`} compact>
                      Review
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </>
  );
}
