import "server-only";
import { z } from "zod";
import { PROJECT_SLUG } from "@/features/project/schema";
import { listRecords, readRecord, writeRecord } from "@/lib/store/json-store";
import { getAccount, getThreadReplies } from "./gmail";
import { repairProposalLink } from "./link";
import { outreachMessageSchema, type OutreachMessage } from "./schema";

/*
 * Outreach messages, one per stakeholder per project, in the shared JSON store:
 * "outreach/<projectSlug>--<clientId>". Reply sync metadata in "outreach-meta/sync".
 */

const COLLECTION = "outreach";
const META_COLLECTION = "outreach-meta";
const SYNC_KEY = "sync";
const SYNC_INTERVAL_MS = 30_000;
const CLIENT_ID = /^[a-z0-9-]+$/;

const syncMetaSchema = z.object({ syncedAt: z.iso.datetime() });

type SyncMemory = { lastAttemptAt: number; running: Promise<void> | null };
const globalStore = globalThis as typeof globalThis & { __tmOutreachSync?: SyncMemory };
const syncMemory: SyncMemory = (globalStore.__tmOutreachSync ??= { lastAttemptAt: 0, running: null });

export function messageId(clientId: string): string {
  return `${PROJECT_SLUG}--${clientId}`;
}

export async function getMessage(clientId: string): Promise<OutreachMessage | null> {
  if (!CLIENT_ID.test(clientId)) return null;
  const message = await readRecord(COLLECTION, messageId(clientId), outreachMessageSchema);
  // Drafts written before the link knew its host point at localhost; read them onto the live one.
  return message ? repairProposalLink(message) : null;
}

/** Validates and stores a message under its id. Returns the stored value. */
export async function saveMessage(message: OutreachMessage): Promise<OutreachMessage> {
  const parsed = outreachMessageSchema.parse(message);
  await writeRecord(COLLECTION, parsed.id, parsed);
  return parsed;
}

/** Every stored message, oldest first. */
export async function listMessages(): Promise<OutreachMessage[]> {
  const messages = (await listRecords(COLLECTION, outreachMessageSchema)).map(repairProposalLink);
  return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** When replies were last pulled from Gmail, or null. */
export async function getSyncedAt(): Promise<string | null> {
  return (await readRecord(META_COLLECTION, SYNC_KEY, syncMetaSchema))?.syncedAt ?? null;
}

/**
 * Pulls replies for every sent message that has a Gmail thread. At most once every 30 s (failed
 * attempts count too, so a broken Gmail is not hammered); concurrent callers share one run.
 * Gmail errors are logged, never thrown. `force` skips the throttle.
 */
export async function syncReplies({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (syncMemory.running) return syncMemory.running;
  const last = Math.max(syncMemory.lastAttemptAt, Date.parse((await getSyncedAt()) ?? "") || 0);
  if (!force && Date.now() - last < SYNC_INTERVAL_MS) return;
  syncMemory.lastAttemptAt = Date.now();
  syncMemory.running = runSync().finally(() => {
    syncMemory.running = null;
  });
  return syncMemory.running;
}

async function runSync(): Promise<void> {
  let ourAddress: string;
  try {
    ourAddress = await getAccount();
  } catch (error) {
    console.error("Outreach reply sync: could not read the Gmail account.", (error as Error).message);
    return;
  }
  const sent = (await listMessages()).filter((m) => m.status === "sent" && m.gmailThreadId);
  let failures = 0;
  for (const message of sent) {
    const threadId = message.gmailThreadId as string;
    try {
      const replies = await getThreadReplies(threadId, ourAddress);
      // Re-read just before writing so a send that landed meanwhile is not overwritten.
      const current = await getMessage(message.clientId);
      if (!current || current.gmailThreadId !== threadId) continue;
      if (JSON.stringify(current.replies) === JSON.stringify(replies)) continue;
      await saveMessage({ ...current, replies });
    } catch (error) {
      failures++;
      console.error(`Outreach reply sync: thread for ${message.clientId} failed.`, (error as Error).message);
    }
  }
  if (failures === 0) await writeRecord(META_COLLECTION, SYNC_KEY, { syncedAt: new Date().toISOString() });
}
