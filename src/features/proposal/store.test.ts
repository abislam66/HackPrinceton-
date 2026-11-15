import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => Promise.reject(new Error("no Supabase in tests")) }));

const committed = path.join(process.cwd(), "src", "features", "proposal", "fallback", "client-a.json");
let drafts: string;

beforeAll(async () => {
  drafts = await mkdtemp(path.join(os.tmpdir(), "proposal-store-test-"));
  process.env.PROPOSAL_DRAFTS_DIR = drafts;
});

afterAll(async () => {
  delete process.env.PROPOSAL_DRAFTS_DIR;
  await rm(drafts, { recursive: true, force: true });
});

describe("proposal store without Supabase", () => {
  it("saves drafts outside the repo and never touches the committed fallback", async () => {
    const { getFallbackProposal, getProposal, saveProposal } = await import("./store");
    const before = await readFile(committed, "utf8");
    const reviewed = (await getFallbackProposal("client-a"))!;
    expect(reviewed).not.toBeNull();

    // Before any draft exists, reads fall back to the reviewed copy.
    expect((await getProposal("client-a"))?.pitch.teaserLine).toBe(reviewed.pitch.teaserLine);

    const draft = { ...reviewed, pitch: { ...reviewed.pitch, teaserLine: "A fresh, unreviewed draft." } };
    expect(await saveProposal(draft)).toBe("file");

    expect(await readFile(committed, "utf8")).toBe(before);
    expect((await getProposal("client-a"))?.pitch.teaserLine).toBe("A fresh, unreviewed draft.");
    expect((await getFallbackProposal("client-a"))?.pitch.teaserLine).toBe(reviewed.pitch.teaserLine);
    expect(JSON.parse(await readFile(path.join(drafts, "client-a.json"), "utf8")).pitch.teaserLine).toBe(
      "A fresh, unreviewed draft.",
    );
  });

  it("rejects unsafe client ids", async () => {
    const { getProposal } = await import("./store");
    expect(await getProposal("../../etc/passwd")).toBeNull();
  });
});
