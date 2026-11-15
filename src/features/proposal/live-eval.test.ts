import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/*
 * Live eval: generates both demo clients against the real model and checks the output.
 * Opt-in because it calls the API and costs money:
 *
 *   LIVE_EVAL=1 npm test -- live-eval
 *
 * Reads ANTHROPIC_API_KEY from the environment, or from .env.local when LIVE_EVAL is set.
 */

// The generation modules are server-only; under vitest there is no React server to check for.
vi.mock("server-only", () => ({}));

const enabled = process.env.LIVE_EVAL === "1";
if (enabled && !process.env.ANTHROPIC_API_KEY && existsSync(".env.local")) process.loadEnvFile(".env.local");
const run = enabled && Boolean(process.env.ANTHROPIC_API_KEY);

const CLIENTS = ["client-a", "client-b"] as const;

describe.skipIf(!run)("live eval: generation against claude-opus-5-5", () => {
  it(
    "generates distinct, rule-abiding proposals for both clients",
    async () => {
      const { loadClient, loadProject } = await import("@/features/project/load");
      const { loadModelInfo } = await import("@/features/model/load");
      const { generateShots } = await import("@/features/shots/generate");
      const { generatePitch } = await import("@/features/pitch/generate");
      const { checkPitch } = await import("@/features/pitch/rules");

      const [project, model] = await Promise.all([loadProject(), loadModelInfo()]);
      const results = [];
      for (const id of CLIENTS) {
        const client = await loadClient(id);
        expect(client, `${id} exists in data/`).not.toBeNull();
        const started = Date.now();
        const shots = await generateShots({ project, client: client!, model });
        const pitch = await generatePitch({ project, client: client!, shots });
        const seconds = (Date.now() - started) / 1000;
        console.log(`${id}: ${shots.length} shots, ${seconds.toFixed(1)} s. "${pitch.headline}"`);

        expect(shots.length).toBeGreaterThanOrEqual(3);
        expect(shots.length).toBeLessThanOrEqual(5);
        for (const shot of shots) expect(model.knownSides).toContain(shot.side);
        expect(checkPitch(pitch, { project, client: client!, shots })).toEqual([]);
        expect(seconds, "inside the 25 s pipeline budget").toBeLessThan(25);
        results.push({ shots, pitch });
      }

      const [a, b] = results;
      const framing = (shots: typeof a.shots) =>
        shots.map((s) => `${s.side}:${s.camera.keyframes.length}:${s.camera.fov}:${s.name}`).sort().join("|");
      expect(framing(a.shots), "the two clients get different shot lists").not.toBe(framing(b.shots));
      expect(a.pitch.headline, "the two clients get different headlines").not.toBe(b.pitch.headline);
      expect(a.pitch.problem).not.toBe(b.pitch.problem);
    },
    120_000,
  );
});
