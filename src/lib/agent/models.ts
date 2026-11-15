import "server-only";

/*
 * Which Claude model does which job in the live pipeline. Picked for cost (2026-11-15): research
 * reads tens of thousands of tokens of search results per call, so it runs on Sonnet; extraction
 * only reformats text it is handed, so it runs on Haiku. Shot and pitch generation is not here:
 * it keeps its own model in src/features/proposal/llm.ts.
 *
 * Override any of them in .env.local, e.g. RESEARCH_MODEL=claude-opus-5-5.
 */

export type AgentJob = "research" | "extract" | "draft";

const DEFAULTS: Record<AgentJob, string> = {
  /** Web research for scouting and dossiers: chooses searches and judges results. */
  research: "claude-sonnet-5-5",
  /** Research notes into the stage's schema, citing source ids. Checked again afterwards. */
  extract: "claude-haiku-5-5",
  /** Outreach emails: short, in Tradesmark's voice. */
  draft: "claude-sonnet-5-5",
};

const ENV: Record<AgentJob, string> = {
  research: "RESEARCH_MODEL",
  extract: "EXTRACT_MODEL",
  draft: "DRAFT_MODEL",
};

export function modelFor(job: AgentJob): string {
  return process.env[ENV[job]]?.trim() || DEFAULTS[job];
}

/**
 * Models that accept the server-side refusal fallback (`fallbacks: "default"`). Haiku has none:
 * a declined request there just fails, and the stage falls back to its template or snapshot.
 */
export function supportsServerFallback(model: string): boolean {
  return /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-[12]|mythos-5-[12])$/.test(model);
}
