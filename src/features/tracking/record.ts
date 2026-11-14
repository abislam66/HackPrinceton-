import "server-only";
import { PROJECT_SLUG } from "@/features/project/schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { TrackingEvent } from "./schema";

export type StoredEvent = {
  id: number;
  clientId: string;
  type: "open" | "watch" | "click";
  payload: Record<string, string | number | boolean>;
  createdAt: string; // ISO
};

const MEMORY_CAP = 1000;
const eventTypes = new Set<StoredEvent["type"]>(["open", "watch", "click"]);

type MemoryEvents = { events: StoredEvent[]; nextId: number };
const globalStore = globalThis as typeof globalThis & { __tmEvents?: MemoryEvents };
const memory: MemoryEvents = (globalStore.__tmEvents ??= { events: [], nextId: 1 });

function rememberEvent(event: TrackingEvent): void {
  memory.events.push({
    id: memory.nextId++,
    clientId: event.clientId,
    type: event.type,
    payload: { ...event.payload },
    createdAt: new Date().toISOString(),
  });
  if (memory.events.length > MEMORY_CAP) memory.events.splice(0, memory.events.length - MEMORY_CAP);
}

function listMemory(limit: number): StoredEvent[] {
  return memory.events.slice(-limit).reverse();
}

function toPayload(value: unknown): StoredEvent["payload"] {
  const payload: StoredEvent["payload"] = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return payload;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") payload[key] = v;
  }
  return payload;
}

/** Maps a proposal_events row by hand (database types are `any`). Drops rows that do not fit. */
function toStoredEvent(row: unknown): StoredEvent | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = Number(r.id);
  const type = r.type as StoredEvent["type"];
  if (!Number.isFinite(id) || typeof r.client_id !== "string" || !eventTypes.has(type)) return null;
  const created = new Date(String(r.created_at));
  return {
    id,
    clientId: r.client_id,
    type,
    payload: toPayload(r.payload),
    createdAt: Number.isNaN(created.getTime()) ? new Date(0).toISOString() : created.toISOString(),
  };
}

/** Stores an event in Supabase when configured, else (or on failure) in process memory. */
export async function recordEvent(event: TrackingEvent): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("proposal_events").insert({
        project_slug: PROJECT_SLUG,
        client_id: event.clientId,
        type: event.type,
        payload: event.payload,
      });
      if (error) throw new Error(error.message);
      return;
    } catch (error) {
      console.error("[tracking] Could not record event in Supabase, kept in memory:", error);
    }
  }
  rememberEvent(event);
}

/** Events newest first, from Supabase when configured, else (or on failure) from process memory. */
export async function listEvents(limit = 200): Promise<StoredEvent[]> {
  const n = Math.max(0, Math.floor(limit));
  if (n === 0) return [];
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("proposal_events")
        .select("id, client_id, type, payload, created_at")
        .eq("project_slug", PROJECT_SLUG)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(n);
      if (error) throw new Error(error.message);
      const rows: unknown[] = Array.isArray(data) ? data : [];
      return rows.map(toStoredEvent).filter((e): e is StoredEvent => e !== null);
    } catch (error) {
      console.error("[tracking] Could not list events from Supabase, using memory:", error);
    }
  }
  return listMemory(n);
}
