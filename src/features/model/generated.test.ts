import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelMetadata } from "./schema";
import {
  isGeneratedSlug,
  loadGeneratedGlb,
  loadGeneratedMeta,
  nextGeneratedVersion,
  saveGeneratedModel,
} from "./generated";

vi.mock("server-only", () => ({}));

// Fakes for what the module touches: the "models" bucket, the records store, and the disk.
const { objects, uploads, order, storage, backend, records, files, disk } = vi.hoisted(() => ({
  objects: new Map<string, Uint8Array>(),
  uploads: [] as { path: string; contentType?: string; upsert?: boolean }[],
  order: [] as string[],
  storage: { uploadError: null as string | null, downloadError: null as string | null },
  backend: { value: "supabase" as "supabase" | "files" },
  records: new Map<string, unknown>(),
  files: new Map<string, Uint8Array | string>(),
  disk: { readOnly: false },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe("models");
        return {
          upload: async (p: string, body: Uint8Array, opts: { contentType?: string; upsert?: boolean }) => {
            if (storage.uploadError) return { data: null, error: { message: storage.uploadError } };
            order.push("upload");
            uploads.push({ path: p, ...opts });
            objects.set(p, body);
            return { data: { path: p }, error: null };
          },
          download: async (p: string) => {
            if (storage.downloadError) return { data: null, error: { message: storage.downloadError } };
            const bytes = objects.get(p);
            if (!bytes) return { data: null, error: { message: "Object not found" } };
            return { data: new Blob([bytes as BlobPart]), error: null };
          },
        };
      },
    },
  }),
}));

vi.mock("@/lib/store/json-store", () => ({
  storeBackend: () => backend.value,
  readRecord: async (collection: string, key: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }) => {
    const value = records.get(`${collection}/${key}`);
    const parsed = value === undefined ? null : schema.safeParse(value);
    return parsed?.success ? parsed.data : null;
  },
  writeRecord: async (collection: string, key: string, value: unknown) => {
    order.push("record");
    records.set(`${collection}/${key}`, structuredClone(value));
    return "supabase";
  },
}));

vi.mock("node:fs/promises", () => ({
  mkdir: async () => {
    if (disk.readOnly) throw new Error("EROFS: read-only file system");
  },
  writeFile: async (p: string, data: string | Uint8Array) => {
    if (disk.readOnly) throw new Error("EROFS: read-only file system");
    files.set(p, data);
  },
  readFile: async (p: string, encoding?: string) => {
    const data = files.get(p);
    if (data === undefined) throw new Error("ENOENT");
    const bytes = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
    return encoding ? bytes.toString("utf8") : bytes;
  },
}));

const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 1, 2, 3, 4]);
const model = (slug: string, version = 1): ModelMetadata => ({
  projectSlug: slug,
  file: "model.glb",
  version,
  units: "meters",
  boundingBox: { min: [-10, 0, -8], max: [10, 30, 8] },
  knownSides: ["north", "east", "south", "west"],
});
const onDisk = (slug: string, file: string) => path.join(process.cwd(), ".data", "generated-models", slug, file);

beforeEach(() => {
  vi.restoreAllMocks();
  objects.clear();
  uploads.length = 0;
  order.length = 0;
  storage.uploadError = null;
  storage.downloadError = null;
  records.clear();
  files.clear();
  disk.readOnly = false;
  // The temporary store's per-instance memory is kept on globalThis; start each test with none.
  (globalThis as { __tmGeneratedModels?: Map<string, unknown> }).__tmGeneratedModels?.clear();
});

describe("generated models with Supabase configured", () => {
  beforeEach(() => {
    backend.value = "supabase";
  });

  it("uploads the GLB to the models bucket, then writes model.json to records", async () => {
    expect(await saveGeneratedModel("8-carlisle", glb, model("8-carlisle"))).toBe("supabase");
    expect(uploads).toEqual([{ path: "8-carlisle/model.glb", contentType: "model/gltf-binary", upsert: true }]);
    expect(records.get("generated-models/8-carlisle")).toEqual(model("8-carlisle"));
    // The GLB goes first, so a model.json never points at a missing file.
    expect(order).toEqual(["upload", "record"]);
    expect(files.size).toBe(0);
  });

  it("reads back the same model.json and GLB bytes", async () => {
    await saveGeneratedModel("8-carlisle", glb, model("8-carlisle", 3));
    expect(await loadGeneratedMeta("8-carlisle")).toEqual(model("8-carlisle", 3));
    expect(Array.from((await loadGeneratedGlb("8-carlisle"))!)).toEqual(Array.from(glb));
  });

  it("counts versions up from the saved model", async () => {
    expect(await nextGeneratedVersion("8-carlisle")).toBe(1);
    await saveGeneratedModel("8-carlisle", glb, model("8-carlisle", 1));
    expect(await nextGeneratedVersion("8-carlisle")).toBe(2);
  });

  it("keeps projects apart", async () => {
    await saveGeneratedModel("8-carlisle", glb, model("8-carlisle"));
    expect(await loadGeneratedMeta("morgan-hall")).toBeNull();
    expect(await loadGeneratedGlb("morgan-hall")).toBeNull();
  });

  it("throws when the upload fails, and writes no model.json", async () => {
    storage.uploadError = "The object exceeded the maximum allowed size";
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(saveGeneratedModel("8-carlisle", glb, model("8-carlisle"))).rejects.toThrow(/Could not save the GLB/);
    expect(order).toEqual([]);
    expect(await loadGeneratedMeta("8-carlisle")).toBeNull();
  });

  it("returns null for a missing GLB without logging an error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadGeneratedGlb("8-carlisle")).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it("returns null and logs when the bucket read itself fails", async () => {
    storage.downloadError = "connection reset";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadGeneratedGlb("8-carlisle")).toBeNull();
    expect(error).toHaveBeenCalledOnce();
  });

  it("rejects a bad project id before touching storage", async () => {
    for (const slug of ["../escape", "Upper", "a/b", ""]) {
      expect(isGeneratedSlug(slug)).toBe(false);
      await expect(saveGeneratedModel(slug, glb, model("x"))).rejects.toThrow(/Bad project id/);
      expect(await loadGeneratedMeta(slug)).toBeNull();
      expect(await loadGeneratedGlb(slug)).toBeNull();
    }
    expect(uploads).toEqual([]);
  });

  it("refuses a GLB that isn't named model.glb", async () => {
    await expect(saveGeneratedModel("8-carlisle", glb, { ...model("8-carlisle"), file: "other.glb" })).rejects.toThrow(/model\.glb/);
    expect(uploads).toEqual([]);
  });
});

describe("generated models without Supabase keys (the temporary store)", () => {
  beforeEach(() => {
    backend.value = "files";
  });

  it("writes model.glb and model.json under .data/generated-models/<slug>/, never to Supabase", async () => {
    expect(await saveGeneratedModel("temp-one", glb, model("temp-one", 2))).toBe("file");
    expect(Array.from(files.get(onDisk("temp-one", "model.glb")) as Uint8Array)).toEqual(Array.from(glb));
    expect(JSON.parse(files.get(onDisk("temp-one", "model.json")) as string)).toEqual(model("temp-one", 2));
    expect(uploads).toEqual([]);
    expect(order).toEqual([]);
    expect(records.size).toBe(0);
  });

  it("reads back from this instance's memory, and counts versions up", async () => {
    await saveGeneratedModel("temp-one", glb, model("temp-one", 2));
    expect(await loadGeneratedMeta("temp-one")).toEqual(model("temp-one", 2));
    expect(Array.from((await loadGeneratedGlb("temp-one"))!)).toEqual(Array.from(glb));
    expect(await nextGeneratedVersion("temp-one")).toBe(3);
  });

  it("reads back from disk after a restart (memory empty)", async () => {
    await saveGeneratedModel("temp-one", glb, model("temp-one", 2));
    (globalThis as { __tmGeneratedModels?: Map<string, unknown> }).__tmGeneratedModels?.clear();
    expect(await loadGeneratedMeta("temp-one")).toEqual(model("temp-one", 2));
    expect(Array.from((await loadGeneratedGlb("temp-one"))!)).toEqual(Array.from(glb));
  });

  it("keeps the model in memory when the disk can't be written", async () => {
    disk.readOnly = true;
    expect(await saveGeneratedModel("temp-readonly", glb, model("temp-readonly"))).toBe("memory");
    expect(await loadGeneratedMeta("temp-readonly")).toEqual(model("temp-readonly"));
    expect(Array.from((await loadGeneratedGlb("temp-readonly"))!)).toEqual(Array.from(glb));
  });

  it("returns null for a project with no model", async () => {
    expect(await loadGeneratedMeta("temp-none")).toBeNull();
    expect(await loadGeneratedGlb("temp-none")).toBeNull();
  });
});
