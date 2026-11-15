import { z } from "zod";
import { replayOptions, replayRun, streamRun } from "@/lib/agent/run";
import { writeRecord } from "@/lib/store/json-store";
import { loadScoutResult } from "@/features/scout/load";
import { regionIds, scoutRequestSchema, type ScoutResult } from "@/features/scout/schema";
import { runScout } from "@/features/scout/scout";

/** Five parallel research calls plus extraction; the run itself stops at 150 s and falls back. */
export const maxDuration = 300;

/**
 * Streams a scout run as NDJSON (`RunEvent<ScoutResult>` per line).
 * Body `{ regions?: RegionId[] }`; an empty body scouts all five regions.
 * `?replay=1&speed=2` re-streams the last recorded run instead.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: "The body must be JSON" }, { status: 400 });
    }
  }
  const parsed = scoutRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });

  const { replay, speed } = replayOptions(request);
  if (replay) return replayRun("scout.ndjson", ["src/features/scout/recordings/scout.ndjson"], speed);

  const regions = parsed.data.regions ?? [...regionIds];
  return streamRun<ScoutResult>({
    key: "scout",
    deadlineMs: 150_000,
    run: ({ signal, progress }) => runScout({ regions, signal, progress }),
    save: (data) => writeRecord("scout", "latest", data),
    fallback: loadScoutResult,
    recordAs: "scout.ndjson",
  });
}
