import type { Metadata } from "next";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";
import { SiteHeader } from "@/components/SiteHeader";
import { loadClients, loadProject } from "@/features/project/load";
import { listEvents } from "@/features/tracking/record";
import { ActivityBoard } from "./_components/ActivityBoard";

// Fresh events on every request, so the first paint already has today's numbers.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const [project, clients, events] = await Promise.all([loadProject(), loadClients(), listEvents(200)]);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 pb-32">
        <section className="tm-wrap pt-24 pb-16">
          <div className="tm-grid gap-y-8">
            <div className="col-span-full tab:col-span-2 desk:col-span-3">
              <Eyebrow>{project.name}</Eyebrow>
            </div>
            {/* Indented one gutter so the title shares its left edge with the ruled rows below. */}
            <div className="col-span-full tab:col-span-6 tab:pl-(--tm-gutter) desk:col-span-9">
              <Heading as="h1" size="l">
                Activity
              </Heading>
              <p className="tm-lead mt-6 max-w-[44ch]">Opens, watch time and clicks on each proposal page.</p>
            </div>
          </div>
        </section>

        <ActivityBoard clients={clients.map(({ id, company }) => ({ id, company }))} initialEvents={events} />
      </main>
    </>
  );
}
