import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendOutreach = vi.fn();
const runScout = vi.fn();
vi.mock("@/features/outreach/actions", () => ({
  draftOutreach: vi.fn(),
  getOutreachOverview: vi.fn(),
  sendOutreach: (...args: unknown[]) => sendOutreach(...args),
}));
vi.mock("@/features/scout/scout", () => ({ runScout: (...args: unknown[]) => runScout(...args) }));
vi.mock("@/lib/store/json-store", () => ({ writeRecord: vi.fn(async () => "memory") }));

async function tools() {
  const { createPipelineTools } = await import("./tools");
  const list = createPipelineTools();
  return (name: string) => {
    const tool = list.find((t) => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    return tool;
  };
}

describe("pipeline tools", () => {
  beforeEach(() => {
    sendOutreach.mockReset();
    runScout.mockReset();
  });

  it("exposes every pipeline tool once", async () => {
    const { createPipelineTools } = await import("./tools");
    expect(createPipelineTools().map((t) => t.name)).toEqual([
      "scout_projects",
      "get_scout_results",
      "research_dossier",
      "get_dossier",
      "list_stakeholders",
      "draft_outreach",
      "send_outreach",
      "list_outreach",
      "get_progress",
    ]);
  });

  it("refuses to send without explicit confirmation", async () => {
    const get = await tools();
    const result = await get("send_outreach").run({ clientId: "client-a", confirmed: false });
    expect(result).toMatch(/^Error: not sent/);
    expect(sendOutreach).not.toHaveBeenCalled();
  });

  it("refuses a second scout while one is running, and releases the guard after", async () => {
    const get = await tools();
    let finish: (value: unknown) => void = () => {};
    runScout.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const first = get("scout_projects").run({});
    await expect(get("scout_projects").run({})).resolves.toMatch(/already in progress/);
    finish({ runAt: new Date().toISOString(), regions: ["boston"], candidates: [], sources: [] });
    await expect(first).resolves.toContain('"source":"live"');

    runScout.mockResolvedValueOnce({ runAt: new Date().toISOString(), regions: ["boston"], candidates: [], sources: [] });
    await expect(get("scout_projects").run({ regions: ["boston"] })).resolves.toContain('"count":0');
  });

  it("labels progress tracking as sample data", async () => {
    const get = await tools();
    const result = JSON.parse(String(await get("get_progress").run({})));
    expect(result.sample).toBe(true);
    expect(result.milestones.length).toBeGreaterThan(0);
  });
});
