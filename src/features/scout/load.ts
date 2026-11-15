import "server-only";
import type { ResultSource } from "@/lib/agent/schema";
import { readRecord, readSnapshot } from "@/lib/store/json-store";
import { scoutResultSchema, type ScoutResult } from "./schema";

/** The committed last good live run, for the deployed demo. Written from a real run, never by hand. */
export const SCOUT_SNAPSHOT = "src/features/scout/snapshot/latest.json";

/** The latest scout result: the stored run first, then the committed snapshot. Null when neither exists. */
export async function loadScoutResult(): Promise<{ source: ResultSource; data: ScoutResult } | null> {
  const stored = await readRecord("scout", "latest", scoutResultSchema);
  if (stored) return { source: "store", data: stored };
  const snapshot = await readSnapshot(SCOUT_SNAPSHOT, scoutResultSchema);
  if (snapshot) return { source: "snapshot", data: snapshot };
  return null;
}
