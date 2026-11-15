import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

// A fake of the one table the store uses, behind the same query-builder calls.
const { rows, failWith } = vi.hoisted(() => ({
  rows: new Map<string, { collection: string; key: string; data: unknown }>(),
  failWith: { message: null as string | null },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      expect(table).toBe("records");
      const filters: Record<string, string> = {};
      const result = () => {
        if (failWith.message) return { data: null, error: { message: failWith.message } };
        const matched = [...rows.values()].filter((r) =>
          Object.entries(filters).every(([col, v]) => (r as Record<string, unknown>)[col] === v),
        );
        return { data: matched, error: null };
      };
      const query = {
        select: () => query,
        eq: (col: string, v: string) => {
          filters[col] = v;
          return query;
        },
        maybeSingle: async () => {
          const r = result();
          return r.error ? r : { data: r.data?.[0] ?? null, error: null };
        },
        then: (resolve: (v: unknown) => void) => resolve(result()),
        upsert: async (row: { collection: string; key: string; data: unknown }) => {
          if (failWith.message) return { error: { message: failWith.message } };
          rows.set(`${row.collection}/${row.key}`, structuredClone(row));
          return { error: null };
        },
      };
      return query;
    },
  }),
}));

// The files backend writes under <cwd>/.data, fixed when the module loads: point it at a temp dir.
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "json-store-"));
const cwd = vi.spyOn(process, "cwd").mockReturnValue(tempRoot);
const store = await import("./json-store");
cwd.mockRestore();
const dataDir = path.join(tempRoot, ".data");
const schema = z.object({ name: z.string() });

describe("json-store with Supabase configured", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    rows.clear();
    failWith.message = null;
    store.clearMemoryStore();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("writes, reads and lists rows in the records table", async () => {
    expect(store.storeBackend()).toBe("supabase");
    expect(await store.writeRecord("scouted-projects", "8-carlisle", { name: "8 Carlisle" })).toBe("supabase");
    await store.writeRecord("scouted-projects", "morgan-hall", { name: "Morgan Hall" });
    await store.writeRecord("dossiers", "8-carlisle", { name: "other collection" });

    expect(await store.readRecord("scouted-projects", "8-carlisle", schema)).toEqual({ name: "8 Carlisle" });
    expect(await store.readRecord("scouted-projects", "missing", schema)).toBeNull();
    const listed = await store.listRecords("scouted-projects", schema);
    expect(listed.map((r) => r.name).sort()).toEqual(["8 Carlisle", "Morgan Hall"]);
  });

  it("reads what another instance wrote: nothing is served from this instance's memory", async () => {
    await store.writeRecord("scouted-projects", "8-carlisle", { name: "old" });
    rows.set("scouted-projects/8-carlisle", { collection: "scouted-projects", key: "8-carlisle", data: { name: "new" } });
    expect(await store.readRecord("scouted-projects", "8-carlisle", schema)).toEqual({ name: "new" });
  });

  it("throws and logs when a write fails, and logs a failed read as missing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    failWith.message = "relation \"records\" does not exist";
    await expect(store.writeRecord("dossiers", "x", { name: "x" })).rejects.toThrow(/Could not save dossiers\/x/);
    expect(await store.readRecord("dossiers", "x", schema)).toBeNull();
    expect(await store.listRecords("dossiers", schema)).toEqual([]);
    expect(log).toHaveBeenCalledTimes(3);
    log.mockRestore();
  });

  it("skips a stored value that no longer matches its schema", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rows.set("dossiers/bad", { collection: "dossiers", key: "bad", data: { name: 42 } });
    expect(await store.readRecord("dossiers", "bad", schema)).toBeNull();
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe("json-store without Supabase", () => {
  beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    rows.clear();
    store.clearMemoryStore();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("writes to .data files and never touches Supabase", async () => {
    expect(store.storeBackend()).toBe("files");
    expect(await store.writeRecord("dossiers", "y", { name: "y" })).toBe("file");
    expect(JSON.parse(await readFile(path.join(dataDir, "dossiers", "y.json"), "utf8"))).toEqual({ name: "y" });
    expect(rows.size).toBe(0);
    store.clearMemoryStore();
    expect(await store.readRecord("dossiers", "y", schema)).toEqual({ name: "y" });
  });

  it("logs when a write reaches only memory (a read-only filesystem)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // A file where the collection's folder should be makes the write fail, like a read-only disk.
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "outreach"), "not a folder");
    expect(await store.writeRecord("outreach", "z", { name: "z" })).toBe("memory");
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0][0])).toMatch(/only this instance's memory/);
    log.mockRestore();
  });
});
