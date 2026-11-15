import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRecord, readSnapshot } from "@/lib/store/json-store";
import { loadDossier } from "./load";
import type { Dossier } from "./schema";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store/json-store", () => ({ readRecord: vi.fn(), readSnapshot: vi.fn() }));

const dossier = { projectId: "demo-project", projectName: "Morgan Hall North" } as Dossier;

beforeEach(() => {
  vi.mocked(readRecord).mockReset().mockResolvedValue(null);
  vi.mocked(readSnapshot).mockReset().mockResolvedValue(null);
});

describe("loadDossier", () => {
  it("prefers the stored live run", async () => {
    vi.mocked(readRecord).mockResolvedValue(dossier);
    expect(await loadDossier("demo-project")).toEqual({ source: "store", data: dossier });
    expect(readRecord).toHaveBeenCalledWith("dossiers", "demo-project", expect.anything());
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("falls back to the committed snapshot", async () => {
    vi.mocked(readSnapshot).mockResolvedValue(dossier);
    expect(await loadDossier("demo-project")).toEqual({ source: "snapshot", data: dossier });
    expect(readSnapshot).toHaveBeenCalledWith("src/features/dossier/snapshot/demo-project.json", expect.anything());
  });

  it("returns null when neither exists, or for an id the store cannot hold", async () => {
    expect(await loadDossier("the-grove")).toBeNull();
    expect(await loadDossier("-leading-dash")).toBeNull();
    expect(await loadDossier("../x")).toBeNull();
    expect(readRecord).toHaveBeenCalledTimes(1);
  });
});
