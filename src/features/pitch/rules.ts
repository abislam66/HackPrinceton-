import type { Client, Project } from "@/features/project/schema";
import type { Shot } from "@/features/shots/schema";
import type { Pitch } from "./schema";

/*
 * Rule check on generated copy. Pure, so it runs in tests and on every LLM reply.
 * An empty result means the pitch may be stored and shown.
 */

const BANNED: [RegExp, string][] = [
  [/\$/, "mentions money ($)"],
  [/\b(price|prices|pricing|cost|costs|quote|quotes|fee|fees|budget)\b/i, "mentions pricing"],
  [/\bscope of work\b/i, "mentions scope of work"],
  [/!/, "uses an exclamation mark"],
  [
    /\b(elevate|cutting[- ]edge|state[- ]of[- ]the[- ]art|world[- ]class|game[- ]chang\w*|synerg\w*|seamless\w*|unparalleled|leverag\w*|revolutioni\w*|best[- ]in[- ]class)\b/i,
    "uses a buzzword",
  ],
];

const MAX_WORDS = 80;

/** Words too common to show a focus element was named. */
const STOPWORDS = new Set(["the", "and", "along", "facing", "with", "from", "into", "around", "their", "context"]);

export function checkPitch(pitch: Pitch, ctx: { project: Project; client: Client; shots: Shot[] }): string[] {
  const problems: string[] = [];
  const fields: [string, string][] = [
    ["teaserLine", pitch.teaserLine],
    ["headline", pitch.headline],
    ["problem", pitch.problem],
    ["solution", pitch.solution],
    ["acrossProject", pitch.acrossProject],
    ...pitch.shotCaptions.map((c): [string, string] => [`caption ${c.shotId}`, c.caption]),
  ];

  for (const [name, text] of fields) {
    if (text.trim() === "") problems.push(`${name} is empty`);
    for (const [pattern, reason] of BANNED) if (pattern.test(text)) problems.push(`${name} ${reason}`);
    if (wordCount(text) > MAX_WORDS) problems.push(`${name} is over ${MAX_WORDS} words`);
  }

  const all = fields.map(([, text]) => text).join("\n").toLowerCase();
  const projectWord = ctx.project.name.split(/\s+/)[0]?.toLowerCase();
  if (projectWord && !all.includes(projectWord)) problems.push(`never names the project (${ctx.project.name})`);
  if (!mentionsFocus(all, ctx.client.focusElements)) {
    problems.push(`names none of the client's focus elements (${ctx.client.focusElements.join(", ")})`);
  }

  const shotIds = ctx.shots.map((s) => s.id).sort();
  const captionIds = pitch.shotCaptions.map((c) => c.shotId).sort();
  if (shotIds.join() !== captionIds.join()) {
    problems.push(`needs exactly one caption per shot id (${shotIds.join(", ")}), got (${captionIds.join(", ")})`);
  }
  return problems;
}

function mentionsFocus(text: string, focusElements: string[]): boolean {
  return focusElements.some((element) =>
    element
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word))
      .some((word) => text.includes(word)),
  );
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
