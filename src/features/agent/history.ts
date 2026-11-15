/*
 * Agent chat history, kept in this browser's localStorage. Small on purpose: the newest
 * MAX_CHATS conversations, each capped at MAX_TURNS turns (the API's own limit). Storage can be
 * missing or full (private windows, blocked site data), so every read and write is guarded and the
 * chat still works without it, just without history.
 */

export const STORAGE_KEY = "tradesmark.agent.chats.v1";
export const MAX_CHATS = 20;
export const MAX_TURNS = 40;
const TITLE_CHARS = 60;

/** A turn as the chat shows it. "error" turns are shown but never sent back to the model. */
export type ChatTurn = { role: "user" | "assistant" | "error"; text: string };

export type Chat = {
  id: string;
  title: string;
  /** Epoch ms of the last change, for ordering the list. */
  updatedAt: number;
  turns: ChatTurn[];
};

/** All saved chats, newest first. Returns [] when storage is unavailable or the data is unreadable. */
export function loadChats(storage: Storage | null = safeStorage()): Chat[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChat).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/**
 * Inserts or replaces `chat` and saves, keeping the newest MAX_CHATS and the last MAX_TURNS
 * turns of each. Chats with no turns are not saved. Returns the saved list, newest first.
 */
export function saveChat(chat: Chat, storage: Storage | null = safeStorage()): Chat[] {
  const trimmed: Chat = { ...chat, turns: chat.turns.slice(-MAX_TURNS) };
  const others = loadChats(storage).filter((c) => c.id !== chat.id);
  const chats = (trimmed.turns.length > 0 ? [trimmed, ...others] : others)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CHATS);
  write(chats, storage);
  return chats;
}

export function deleteChat(id: string, storage: Storage | null = safeStorage()): Chat[] {
  const chats = loadChats(storage).filter((c) => c.id !== id);
  write(chats, storage);
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

function write(chats: Chat[], storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(chats));
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
