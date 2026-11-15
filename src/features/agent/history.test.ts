import { describe, expect, it } from "vitest";
import { deleteChat, loadChats, MAX_CHATS, MAX_TURNS, newChat, saveChat, STORAGE_KEY, threadFor, titleFor, type Chat, type ChatTurn } from "./history";

/** A minimal in-memory Storage. */
function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const chat = (id: string, updatedAt: number, turns: ChatTurn[] = [{ role: "user", text: `hello ${id}` }]): Chat => ({
  id,
  title: titleFor(turns),
  updatedAt,
  turns,
});

describe("agent chat history", () => {
  it("saves, reloads newest first, and replaces a chat by id", () => {
    const s = memory();
    saveChat(chat("a", 1), s);
    saveChat(chat("b", 2), s);
    saveChat({ ...chat("a", 3), title: "edited" }, s);
    const chats = loadChats(s);
    expect(chats.map((c) => c.id)).toEqual(["a", "b"]);
    expect(chats[0].title).toBe("edited");
  });

  it("keeps only the newest chats and the last turns of each", () => {
    const s = memory();
    for (let i = 0; i < MAX_CHATS + 5; i++) saveChat(chat(`c${i}`, i), s);
    const long = Array.from({ length: MAX_TURNS + 10 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), text: `${i}` }));
    saveChat(chat("long", 1000, long), s);
    const chats = loadChats(s);
    expect(chats).toHaveLength(MAX_CHATS);
    expect(chats[0].id).toBe("long");
    expect(chats[0].turns).toHaveLength(MAX_TURNS);
    expect(chats.some((c) => c.id === "c0")).toBe(false);
  });

  it("does not save empty chats, and deletes", () => {
    const s = memory();
    saveChat({ ...newChat(1), turns: [] }, s);
    expect(loadChats(s)).toEqual([]);
    saveChat(chat("x", 1), s);
    expect(deleteChat("x", s)).toEqual([]);
  });

  it("survives missing, broken or full storage", () => {
    expect(loadChats(null)).toEqual([]);
    const broken = memory();
    broken.setItem(STORAGE_KEY, "{not json");
    expect(loadChats(broken)).toEqual([]);
    const full = { ...memory(), setItem: () => { throw new Error("QuotaExceededError"); } } as Storage;
    expect(() => saveChat(chat("a", 1), full)).not.toThrow();
  });

  it("titles a chat by its first prompt", () => {
    expect(titleFor([])).toBe("New chat");
    expect(titleFor([{ role: "user", text: "  Who are   the stakeholders? " }])).toBe("Who are the stakeholders?");
    expect(titleFor([{ role: "user", text: "x".repeat(200) }]).length).toBeLessThanOrEqual(60);
  });

  it("builds the thread to send: no errors, starts with the user, within the cap", () => {
    expect(
      threadFor([
        { role: "user", text: "a" },
        { role: "error", text: "oops" },
        { role: "assistant", text: "b" },
        { role: "user", text: "c" },
      ]),
    ).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]);
    const long = Array.from({ length: 100 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), text: `${i}` }));
    const thread = threadFor([...long, { role: "user", text: "last" }]);
    expect(thread.length).toBeLessThan(MAX_TURNS);
    expect(thread[0].role).toBe("user");
  });
});
