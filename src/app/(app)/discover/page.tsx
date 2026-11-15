import { MEASUREMENTS, WHY_IT_FITS, shortAddress } from "@/features/demo/building";
import { loadProject } from "@/features/project/load";
import { loadProjectClients } from "@/features/project-agent/store";
import { loadScoutResult } from "@/features/scout/load";
import { replayFrom } from "@/lib/agent/replay-param";
import { ScoutBoard } from "./_components/ScoutBoard";

/**
 * Discover: the latest scout run (stored, else the committed snapshot) with the pre-loaded demo project first.
 * `?replay=1` makes "Run scout" replay the last recorded run instead of searching live.
 */
export default async function DiscoverPage({ searchParams }: PageProps<"/discover">) {
  // The pre-loaded project's stakeholders include any the project agent added; projects opened from its drafts are
  // copies, listed under Projects.
  const [project, scout, query] = await Promise.all([loadProject(), loadScoutResult(), searchParams]);
  const clients = (await loadProjectClients(project.slug)) ?? [];

  return (
    <div className="@container flex flex-col p-8">
      <ScoutBoard
        demo={{
          href: `/projects/${project.slug}`,
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
