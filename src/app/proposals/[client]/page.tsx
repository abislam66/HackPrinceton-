import { notFound } from "next/navigation";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";
import { Wordmark } from "@/components/Logo";
import { loadModelInfo } from "@/features/model/load";
import { loadClient, loadProject } from "@/features/project/load";
import { ProposalTracker } from "@/features/tracking/ProposalTracker";
import { teaserPath } from "@/features/viewer/camera-paths";
import { ModelViewer } from "@/features/viewer/ModelViewer";
import { bookingUrl } from "@/lib/booking";
import { loadProposal } from "@/lib/proposals";
import { BookCall } from "./_components/BookCall";
import { ShotShowcase } from "./_components/ShotShowcase";

export default async function ProposalPage({ params, searchParams }: PageProps<"/proposals/[client]">) {
  const [{ client: clientId }, query] = await Promise.all([params, searchParams]);
  const client = await loadClient(clientId);
  if (!client) notFound();

  // ?preview=1 is the internal team's view: no tracker and no click events, so previews never count.
  const preview = query.preview;
  const track = !(preview === "1" || (Array.isArray(preview) && preview.includes("1")));

  const [project, model] = await Promise.all([loadProject(), loadModelInfo()]);
  const loaded = await loadProposal(client, model);
  const proposal = loaded?.proposal ?? null;

  const opening = (
    // The opening sits on Asphalt: the one dark moment on the page. Text is pinned to the bottom left edge.
    <section className="tm-ground-asphalt relative h-[80vh] min-h-96">
      <ModelViewer model={model} path={teaserPath(model.boundingBox)} className="absolute inset-0" />
      <div className="tm-wrap pointer-events-none absolute inset-x-0 top-0 pt-5">
        <Wordmark className="h-4 text-cone" />
      </div>
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
  );

  if (!proposal) {
    return (
      <main className="flex flex-1 flex-col">
        {opening}
        <section className="tm-wrap pt-24 pb-32">
          <p className="tm-body max-w-[66ch]">This proposal is not ready yet.</p>
        </section>
      </main>
    );
  }

  const { pitch, shots } = proposal;

  return (
    <main className="flex flex-1 flex-col">
      {track ? <ProposalTracker clientId={client.id} /> : null}

      {opening}

      {/* Problem, then solution. Eyebrow in columns 1 to 3, content from column 4: the page's main edge. */}
      <section className="tm-wrap pt-24 pb-32">
        <div className="tm-grid gap-y-8">
          <div className="col-span-full tab:col-span-2 desk:col-span-3">
            <Eyebrow>For {client.company}</Eyebrow>
          </div>
          <div className="col-span-full tab:col-span-6 desk:col-span-7">
            <Heading as="h1" size="m">
              {pitch.headline}
            </Heading>
            <p className="tm-lead mt-6 max-w-[44ch]">{pitch.problem}</p>
            <p className="tm-body mt-6 max-w-[66ch]">{pitch.solution}</p>
          </div>
        </div>
      </section>

      {shots.length > 0 ? (
        <section className="tm-wrap pb-24">
          <div className="border-t border-rule pt-5">
            <Heading as="h2" size="s" className="mb-12">
              {"How we'd film it"}
            </Heading>
            <ShotShowcase model={model} shots={shots} clientId={client.id} track={track} />
          </div>
        </section>
      ) : null}

      <section className="tm-wrap pb-40">
        <div className="tm-grid gap-y-4 border-t border-rule py-5">
          <div className="col-span-full tab:col-span-2 desk:col-span-3">
            <Eyebrow>Across the project</Eyebrow>
          </div>
          <p className="tm-text--m col-span-full max-w-[66ch] tab:col-span-6 desk:col-span-9">
            We are preparing a plan like this for each team on {project.name}.
          </p>
        </div>
      </section>

      {/* The closing band: the page's one Cone moment. No border where it meets Plaster. */}
      <section className="tm-ground-cone tm-wrap pt-32 pb-5">
        <div className="tm-grid gap-y-8">
          <div className="col-span-full tab:col-span-2 desk:col-span-3">
            <Eyebrow>Next step</Eyebrow>
          </div>
          <div className="col-span-full tab:col-span-6 desk:col-span-6">
            <Heading as="h2" size="l">
              Walk the shot list with us.
            </Heading>
            <p className="tm-lead mt-6 max-w-[44ch]">One call to go through the shots and what you need from them.</p>
            <div className="mt-12">
              <BookCall href={bookingUrl()} clientId={client.id} track={track} />
            </div>
          </div>
        </div>
        <Wordmark className="mt-40 block h-auto w-full text-asphalt" />
      </section>
    </main>
  );
}
