import "server-only";
import type { Client } from "@/features/project/schema";
import raw from "./replay.json";
import { replaySchema, type Replay } from "./schema";

/**
 * The replay fixture, checked against the clients on disk. A quote that is not in its source
 * or a client with no file fails loudly here instead of silently missing a highlight on stage.
 */
export function loadReplay(clients: Client[]): Replay {
  const replay = replaySchema.parse(raw);
  const sources = new Map(replay.sources.map((s) => [s.id, s]));
  const clientIds = new Set(clients.map((c) => c.id));

  for (const item of [...replay.analysis, ...replay.dossier]) {
    const source = sources.get(item.sourceId);
    if (!source) throw new Error(`replay.json: no source "${item.sourceId}"`);
    if (!source.text.includes(item.quote)) throw new Error(`replay.json: "${item.quote}" is not in source "${item.sourceId}"`);
  }
  for (const item of replay.dossier) {
    if (!clientIds.has(item.clientId)) throw new Error(`replay.json: no client file for "${item.clientId}"`);
  }
  if (replay.scouting.filter((row) => row.isDemoProject).length !== 1) {
    throw new Error("replay.json: the scouting list needs exactly one row with isDemoProject");
  }
  return replay;
}
