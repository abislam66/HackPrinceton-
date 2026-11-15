import { MEASUREMENTS, WHY_IT_FITS, shortAddress } from "@/features/demo/building";
import { loadClients, loadProject } from "@/features/project/load";
import { PROJECT_SLUG } from "@/features/project/schema";
import { loadScoutResult } from "@/features/scout/load";
import { replayFrom } from "@/lib/agent/replay-param";
import { ScoutBoard } from "./_components/ScoutBoard";

/**
 * Discover: the latest scout run (stored, else the committed snapshot) with the pre-loaded demo project first.
 * `?replay=1` makes "Run scout" replay the last recorded run instead of searching live.
 */
export default async function DiscoverPage({ searchParams }: PageProps<"/discover">) {
  const [project, clients, scout, query] = await Promise.all([
    loadProject(),
    loadClients(),
    loadScoutResult(),
    searchParams,
  ]);

  return (
    <div className="@container flex flex-col p-8">
      <ScoutBoard
        demo={{
          href: `/projects/${PROJECT_SLUG}`,
          name: project.name,
          location: shortAddress(project.address),
          why: WHY_IT_FITS,
          floors: MEASUREMENTS.floors,
          stakeholders: clients.length,
          region: "philadelphia-main-line",
        }}
        initial={scout?.data ?? null}
        replay={replayFrom(query)}
      />
    </div>
  );
}
