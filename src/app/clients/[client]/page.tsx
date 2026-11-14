import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/Button";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";
import { SiteHeader } from "@/components/SiteHeader";
import { Tag } from "@/components/Tag";
import { loadModelInfo } from "@/features/model/load";
import { loadClient } from "@/features/project/load";
import { loadProposal } from "@/lib/proposals";
import { approveProposal, returnToDraft } from "./actions";
import { GenerateActions } from "./_components/GenerateActions";
import { ModelCheck } from "./_components/ModelCheck";
import { BackLink, Row, SpecList } from "./_components/Row";
import { plain, statusLabel } from "./_components/status";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ client: string }> }): Promise<Metadata> {
  const { client: id } = await params;
  const client = await loadClient(id);
  return { title: client ? `Review: ${client.company}` : "Review" };
}

export default async function ReviewPage({ params }: { params: Promise<{ client: string }> }) {
  const { client: id } = await params;
  const client = await loadClient(id);
  if (!client) notFound();

  const model = await loadModelInfo();
  const loaded = await loadProposal(client, model);
  const proposal = loaded?.proposal ?? null;
  const status = proposal?.status ?? null;
  const previewHref = `/proposals/${client.id}?preview=1`;

  const preview = (
    <Button href={previewHref} target="_blank" rel="noopener" compact>
      Preview page
    </Button>
  );

  return (
    <>
      <SiteHeader />
      <main className="flex-1 pb-32">
        <section className="tm-wrap pt-16 pb-16">
          <div className="tm-grid gap-y-8">
            <div className="col-span-full tab:col-span-2 desk:col-span-3">
              <BackLink href="/">All clients</BackLink>
            </div>
            <div className="col-span-full tab:col-span-6 tab:pl-(--tm-gutter) desk:col-span-9">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Eyebrow>{statusLabel(status)}</Eyebrow>
                {loaded?.source === "prepared" ? <Tag variant="quiet">Prepared draft</Tag> : null}
              </div>
              <Heading as="h1" size="l" className="mt-8">
                {client.company}
              </Heading>
              <p className="tm-lead mt-6 max-w-[44ch]">
                {client.contact.name}, {client.contact.title}
              </p>
            </div>
          </div>
        </section>

        <Row label="Angle">
          <SpecList
            items={[
              { label: "Role", value: plain(client.role) },
              { label: "Need", value: plain(client.need) },
              { label: "Focus", value: client.focusElements.length ? client.focusElements.join(", ") : "None listed" },
              { label: "Notes", value: client.needsNotes },
            ]}
          />
        </Row>

        <Row label="Model">
          <ModelCheck
            model={model}
            shots={(proposal?.shots ?? []).map((s) => ({ id: s.id, name: s.name, camera: s.camera }))}
          />
          <div className="mt-8">
            <SpecList
              items={[
                {
                  label: "Source",
                  value: model.url ? "Built model." : "Gray-box stand-in. The model builder has not produced a model yet.",
                },
                {
                  label: "Known sides",
                  value: model.knownSides.length ? model.knownSides.map(plain).join(", ") : "None",
                },
              ]}
            />
          </div>
        </Row>

        {proposal ? (
          <>
            <Row label="Copy">
              <div className="flex flex-col gap-12">
                <div>
                  <p className="tm-label tm-muted">Teaser line</p>
                  <Heading as="p" size="m" className="mt-4 max-w-[18ch]">
                    {proposal.pitch.teaserLine}
                  </Heading>
                </div>
                <div>
                  <p className="tm-label tm-muted">Headline</p>
                  <Heading as="p" size="m" className="mt-4">
                    {proposal.pitch.headline}
                  </Heading>
                </div>
                <div>
                  <p className="tm-label tm-muted">Problem</p>
                  <p className="tm-body mt-4 max-w-[66ch]">{proposal.pitch.problem}</p>
                </div>
                <div>
                  <p className="tm-label tm-muted">Solution</p>
                  <p className="tm-body mt-4 max-w-[66ch]">{proposal.pitch.solution}</p>
                </div>
              </div>
            </Row>

            <Row label="Shots">
              {proposal.shots.length ? (
                <ol className="divide-y divide-rule">
                  {proposal.shots.map((shot, i) => (
                    <li key={shot.id} className="py-8 first:pt-0 last:pb-0">
                      <p className="tm-label tm-muted tm-num">{String(i + 1).padStart(2, "0")}</p>
                      <Heading as="h3" size="xs" className="mt-4">
                        {shot.name}
                      </Heading>
                      <p className="tm-body mt-4 max-w-[66ch]">{shot.description}</p>
                      <dl className="mt-6 grid grid-cols-2 gap-x-(--tm-gutter) gap-y-4 tab:grid-cols-3 desk:grid-cols-5">
                        {[
                          { label: "Platform", value: plain(shot.platform) },
                          { label: "Lens", value: shot.lens },
                          { label: "Time of day", value: shot.timeOfDay },
                          { label: "Phase", value: shot.constructionPhase },
                          { label: "Side", value: plain(shot.side) },
                        ].map((spec) => (
                          <div key={spec.label} className="min-w-0">
                            <dt className="tm-label tm-muted">{spec.label}</dt>
                            <dd className="tm-text--m mt-1 break-words">{spec.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="tm-text--m">No shots in this proposal.</p>
              )}
            </Row>
          </>
        ) : null}

        <Row label="Decision">
          {!proposal ? (
            <>
              <p className="tm-text--m mb-6">No proposal for this client yet.</p>
              <GenerateActions clientId={client.id} />
            </>
          ) : proposal.status === "draft" ? (
            <GenerateActions clientId={client.id}>
              <form action={approveProposal} className="contents">
                <input type="hidden" name="client" value={client.id} />
                <Button type="submit" variant="black" arrow={false} compact>
                  Approve
                </Button>
              </form>
              {preview}
            </GenerateActions>
          ) : proposal.status === "approved" ? (
            <div className="flex flex-wrap gap-2">
              <Button href={`/clients/${client.id}/send`} variant="black" compact>
                Send
              </Button>
              <form action={returnToDraft} className="contents">
                <input type="hidden" name="client" value={client.id} />
                <Button type="submit" arrow={false} compact>
                  Back to draft
                </Button>
              </form>
              {preview}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Tag variant="go">Sent</Tag>
              <Button href={`/clients/${client.id}/send`} compact>
                Send screen
              </Button>
              <Button href="/activity" compact>
                Activity
              </Button>
              {preview}
            </div>
          )}
        </Row>
      </main>
    </>
  );
}
