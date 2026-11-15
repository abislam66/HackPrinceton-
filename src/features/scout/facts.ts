import { STAGE_LABEL } from "@/lib/labels";
import type { ScoutCandidate } from "./schema";

/*
 * What scouting knows about a building, for the stat strip on a scouted project's pages. Pure, safe on server and
 * client. Unknowns say so rather than disappear, so the strip keeps its shape.
 */

export type ScoutFact = { label: string; value: string };

/** $1.7B, $240M. */
export function formatUsd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (value >= 1e6) return `$${Math.round(value / 1e6)}M`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function scoutFacts(c: ScoutCandidate, { fit = true }: { fit?: boolean } = {}): ScoutFact[] {
  const facts: ScoutFact[] = [
    { label: "Stage", value: STAGE_LABEL[c.stage] },
    { label: "Completion", value: c.completion ?? "Unknown" },
    { label: "Floors", value: c.floors === null ? "Unknown" : String(c.floors) },
    { label: "Reported cost", value: c.valueUsd === null ? "Unknown" : formatUsd(c.valueUsd) },
  ];
  if (fit) facts.push({ label: "Fit", value: `${c.score} / 100` });
  return facts;
}

/** "1 Joslin Place, Boston, MA", or "Boston, MA" without a street address. */
export function scoutPlace(c: ScoutCandidate): string {
  return [c.address, `${c.city}, ${c.state}`].filter(Boolean).join(", ");
}
