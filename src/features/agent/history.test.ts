import { describe, expect, it } from "vitest";
import { deleteChat, loadChats, MAX_CHATS, MAX_TURNS, newChat, projectChatKey, restoreRuns, saveChat, saveRuns, STORAGE_KEY, threadFor, titleFor, type Chat, type ChatTurn, type SavedRun } from "./history";
import type { Run } from "./runs";

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

describe("per-project chat history", () => {
  it("keeps each project's chats apart from the Agent tab and from other projects", () => {
    const s = memory();
    saveChat(chat("tab", 1), s);
    saveChat(chat("p1", 2), s, projectChatKey("demo-project"));
    saveChat(chat("p2", 3), s, projectChatKey("demo-project-2"));
    expect(loadChats(s).map((c) => c.id)).toEqual(["tab"]);
    expect(loadChats(s, projectChatKey("demo-project")).map((c) => c.id)).toEqual(["p1"]);
    expect(loadChats(s, projectChatKey("demo-project-2")).map((c) => c.id)).toEqual(["p2"]);
  });
});

describe("saved runs", () => {
  const run = (id: string, turnId: number, status: Run["status"] = "done"): Run => ({
    id,
    turnId,
    tool: "get_dossier",
    label: "Reading a dossier",
    status,
    startedAt: 1,
    endedAt: status === "running" ? undefined : 2,
    steps: [],
    destinations: [{ kind: "dossier", label: "D", href: "/projects/demo-project/dossier", subject: "Morgan Hall North" }],
  });

  it("round-trips runs through storage, tied to their prompt by index", () => {
    const s = memory();
    const turns: ChatTurn[] = [
      { role: "user", text: "a" },
      { role: "assistant", text: "b" },
      { role: "user", text: "c" },
    ];
    const runs = saveRuns([run("r1", 10), run("r2", 30), run("gone", 99)], [10, 20, 30]);
    expect(runs.map((r) => [r.id, r.turn])).toEqual([
      ["r1", 0],
      ["r2", 2],
    ]);
    saveChat({ ...chat("x", 1, turns), runs }, s);
    const restored = restoreRuns(loadChats(s)[0].runs, [7, 8, 9]);
    expect(restored.map((r) => [r.id, r.turnId])).toEqual([
      ["r1", 7],
      ["r2", 9],
    ]);
    expect(restored[0].destinations?.[0].href).toBe("/projects/demo-project/dossier");
  });

  it("shows a run cut off by a reload as stopped", () => {
    const [saved] = saveRuns([run("r", 1, "running")], [1]);
    expect(restoreRuns([saved], [5], 42)[0]).toMatchObject({ status: "stopped", endedAt: 42, turnId: 5 });
  });

  it("shifts runs with trimmed turns and drops the runs of turns that were cut", () => {
    const s = memory();
    const turns = Array.from({ length: MAX_TURNS + 2 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), text: `${i}` }));
    const runs: SavedRun[] = [0, 2, 4].map((turn) => ({ ...saveRuns([run(`r${turn}`, 1)], [1])[0], turn }));
    saveChat({ ...chat("x", 1, turns), runs }, s);
    expect(loadChats(s)[0].runs?.map((r) => [r.id, r.turn])).toEqual([
      ["r2", 0],
      ["r4", 2],
    ]);
  });

  it("still loads chats saved before runs, and drops malformed runs and links", () => {
    const s = memory();
    const bad = { ...saveRuns([run("ok", 1)], [1])[0] };
    bad.destinations = [...(bad.destinations ?? []), { kind: "dossier", label: "x", href: "https://evil.example", subject: "x" }];
    s.setItem(
      STORAGE_KEY,
      JSON.stringify([
        chat("old", 1),
        { ...chat("new", 2), runs: [bad, { id: "broken" }] },
      ]),
    );
    const [newer, older] = loadChats(s);
    expect(older.runs).toBeUndefined();
    expect(newer.runs?.map((r) => r.id)).toEqual(["ok"]);
    expect(newer.runs?.[0].destinations).toHaveLength(1);
  });
});
