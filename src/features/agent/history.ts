import { destinationSchema } from "./destinations";
import type { Run, RunStatus } from "./runs";

/*
 * Agent chat history, kept in this browser's localStorage. Small on purpose: the newest
 * MAX_CHATS conversations, each capped at MAX_TURNS turns (the API's own limit). Storage can be
 * missing or full (private windows, blocked site data), so every read and write is guarded and the
 * chat still works without it, just without history.
 */

export const STORAGE_KEY = "tradesmark.agent.chats.v1";

/** Storage key for one project's agent chats, kept apart from the Agent tab and other projects. */
export function projectChatKey(projectSlug: string): string {
  return `tradesmark.project-agent.${projectSlug}.v1`;
}
export const MAX_CHATS = 20;
export const MAX_TURNS = 40;
/** Runs kept per chat, and progress lines per run: a scout logs dozens, and storage is a few MB per site. */
export const MAX_RUNS = 60;
export const MAX_STEPS = 120;
const TITLE_CHARS = 60;

/** A turn as the chat shows it. "error" turns are shown but never sent back to the model. */
export type ChatTurn = { role: "user" | "assistant" | "error"; text: string };

/** A run as saved: tied to its prompt by the prompt's index in `turns`, since turn ids are only for the screen. */
export type SavedRun = Omit<Run, "turnId"> & { turn: number };

export type Chat = {
  id: string;
  title: string;
  /** Epoch ms of the last change, for ordering the list. */
  updatedAt: number;
  turns: ChatTurn[];
  /** The chat's tool runs, oldest first. Missing in chats saved before runs were kept. */
  runs?: SavedRun[];
};

/** All saved chats, newest first. Returns [] when storage is unavailable or the data is unreadable. */
export function loadChats(storage: Storage | null = safeStorage(), key: string = STORAGE_KEY): Chat[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isChat)
      .map((c) => (c.runs === undefined ? c : { ...c, runs: Array.isArray(c.runs) ? c.runs.filter(isRun).map(cleanRun) : [] }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/**
 * Inserts or replaces `chat` and saves, keeping the newest MAX_CHATS and the last MAX_TURNS
 * turns of each. Chats with no turns are not saved. Returns the saved list, newest first.
 */
export function saveChat(chat: Chat, storage: Storage | null = safeStorage(), key: string = STORAGE_KEY): Chat[] {
  const cut = Math.max(0, chat.turns.length - MAX_TURNS);
  const trimmed: Chat = { ...chat, turns: chat.turns.slice(cut) };
  if (chat.runs) {
    // Runs follow their prompt: shift with the trimmed turns, and go with the turns that were cut.
    trimmed.runs = chat.runs
      .map((r) => ({ ...r, turn: r.turn - cut, steps: r.steps.slice(-MAX_STEPS) }))
      .filter((r) => r.turn >= 0)
      .slice(-MAX_RUNS);
  }
  const others = loadChats(storage, key).filter((c) => c.id !== chat.id);
  const chats = (trimmed.turns.length > 0 ? [trimmed, ...others] : others)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CHATS);
  write(chats, storage, key);
  return chats;
}

export function deleteChat(id: string, storage: Storage | null = safeStorage(), key: string = STORAGE_KEY): Chat[] {
  const chats = loadChats(storage, key).filter((c) => c.id !== id);
  write(chats, storage, key);
  return chats;
}

export function newChat(now = Date.now()): Chat {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `chat-${now}-${Math.random()}`;
  return { id, title: "New chat", updatedAt: now, turns: [] };
}

/** The chat's title: its first prompt, shortened. */
export function titleFor(turns: ChatTurn[]): string {
  const first = turns.find((t) => t.role === "user")?.text.trim().replace(/\s+/g, " ") ?? "";
  if (!first) return "New chat";
  return first.length > TITLE_CHARS ? `${first.slice(0, TITLE_CHARS - 1).trimEnd()}…` : first;
}

/** The turns to send to the model: errors dropped, and the thread trimmed to start with a user turn. */
export function threadFor(turns: ChatTurn[]): { role: "user" | "assistant"; content: string }[] {
  const thread = turns.flatMap((t) => (t.role === "error" ? [] : [{ role: t.role, content: t.text }]));
  const recent = thread.slice(-(MAX_TURNS - 1));
  const start = recent.findIndex((t) => t.role === "user");
  return start === -1 ? [] : recent.slice(start);
}

/** Saved runs for the turns on screen: each run's `turnId` becomes its prompt's index. */
export function saveRuns(runs: Run[], turnIds: number[]): SavedRun[] {
  return runs.flatMap(({ turnId, ...run }) => {
    const turn = turnIds.indexOf(turnId);
    return turn === -1 ? [] : [{ ...run, turn }];
  });
}

/**
 * Runs for a reopened chat, tied to the new turn ids. A run still "running" was cut off when the page closed: the
 * browser can't follow it any more, so it shows as stopped.
 */
export function restoreRuns(saved: SavedRun[] | undefined, turnIds: number[], now = Date.now()): Run[] {
  return (saved ?? []).flatMap(({ turn, ...run }) => {
    const turnId = turnIds[turn];
    if (turnId === undefined) return [];
    if (run.status !== "running") return [{ ...run, turnId }];
    return [{ ...run, turnId, status: "stopped" as const, endedAt: run.endedAt ?? now }];
  });
}

function write(chats: Chat[], storage: Storage | null, key: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(chats));
  } catch {
    // Full or blocked storage: keep chatting without history rather than failing.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isChat(value: unknown): value is Chat {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<Chat>;
  return (
    typeof c.id === "string" &&
    typeof c.title === "string" &&
    typeof c.updatedAt === "number" &&
    Array.isArray(c.turns) &&
    c.turns.every(
      (t) =>
        t && typeof t === "object" && ["user", "assistant", "error"].includes((t as ChatTurn).role) && typeof (t as ChatTurn).text === "string",
    )
  );
}

const RUN_STATUSES: RunStatus[] = ["running", "done", "failed", "stopped"];

/** Drops destinations that don't parse, so a stale or edited entry can't put a bad link on screen. */
function cleanRun(run: SavedRun): SavedRun {
  if (!run.destinations) return run;
  return { ...run, destinations: run.destinations.filter((d) => destinationSchema.safeParse(d).success) };
}

function isRun(value: unknown): value is SavedRun {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<SavedRun>;
  return (
    typeof r.id === "string" &&
    typeof r.turn === "number" &&
    typeof r.tool === "string" &&
    typeof r.label === "string" &&
    RUN_STATUSES.includes(r.status as RunStatus) &&
    typeof r.startedAt === "number" &&
    Array.isArray(r.steps) &&
    (r.destinations === undefined || Array.isArray(r.destinations))
  );
}
