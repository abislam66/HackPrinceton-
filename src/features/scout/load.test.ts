import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoutResult } from "./schema";

vi.mock("server-only", () => ({}));

const readRecord = vi.fn();
const readSnapshot = vi.fn();
vi.mock("@/lib/store/json-store", () => ({
  readRecord: (...args: unknown[]) => readRecord(...args),
  readSnapshot: (...args: unknown[]) => readSnapshot(...args),
}));

const { loadScoutResult } = await import("./load");

const result = (runAt: string): ScoutResult => ({ runAt, regions: ["new-jersey"], candidates: [], sources: [] });

describe("loadScoutResult", () => {
  beforeEach(() => {
    readRecord.mockReset();
    readSnapshot.mockReset();
  });

  it("prefers the stored run", async () => {
    readRecord.mockResolvedValue(result("2026-11-14T10:00:00.000Z"));
    readSnapshot.mockResolvedValue(result("2026-11-01T10:00:00.000Z"));
    expect(await loadScoutResult()).toEqual({ source: "store", data: result("2026-11-14T10:00:00.000Z") });
    expect(readRecord.mock.calls[0].slice(0, 2)).toEqual(["scout", "latest"]);
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it("falls back to the committed snapshot, then to null", async () => {
    readRecord.mockResolvedValue(null);
    readSnapshot.mockResolvedValueOnce(result("2026-11-01T10:00:00.000Z"));
    expect(await loadScoutResult()).toEqual({ source: "snapshot", data: result("2026-11-01T10:00:00.000Z") });
    expect(readSnapshot.mock.calls[0][0]).toBe("src/features/scout/snapshot/latest.json");

    readSnapshot.mockResolvedValueOnce(null);
    expect(await loadScoutResult()).toBeNull();
  });
});
