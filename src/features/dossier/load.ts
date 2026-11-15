import "server-only";
import type { ResultSource } from "@/lib/agent/schema";
import { readRecord, readSnapshot } from "@/lib/store/json-store";
import { dossierSchema, type Dossier } from "./schema";

/*
 * The latest dossier for a project: the stored live run first, then the committed snapshot (the
 * last good run, so the deployed demo has data with no key and no store). Null when neither exists.
 */

/** The store's key rule (json-store refuses anything else). */
const STORE_KEY = /^[a-z0-9][a-z0-9-]*$/;

export function snapshotPath(projectId: string): string {
  return `src/features/dossier/snapshot/${projectId}.json`;
}

export async function loadDossier(projectId: string): Promise<{ source: ResultSource; data: Dossier } | null> {
  if (!STORE_KEY.test(projectId)) return null;
  const stored = await readRecord("dossiers", projectId, dossierSchema);
  if (stored) return { source: "store", data: stored };
  const snapshot = await readSnapshot(snapshotPath(projectId), dossierSchema);
  return snapshot ? { source: "snapshot", data: snapshot } : null;
}
