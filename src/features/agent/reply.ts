import { appRoute } from "./destinations";
import type { Run } from "./runs";

/*
 * The agent's reply as the Agent tab renders it. The system prompt (chat.ts) asks for plain text with "- " lines for
 * lists, so a reply splits into paragraphs and lists, and the project names it mentions link to the pages the
 * chat's own runs returned. App paths it writes out (the tools tell it to, e.g. /projects/demo-project) link when they
 * are real pages. Nothing is linked from a guess.
 */

export type Block = { type: "paragraph"; text: string } | { type: "list"; items: string[] };

/** Consecutive "- " (or "• ") lines become one list; every other non-blank line is its own paragraph. */
export function parseReply(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const item = /^\s*[-•]\s+(.*)$/.exec(line);
    const last = blocks.at(-1);
    if (item) {
      if (last?.type === "list") last.items.push(item[1]);
      else blocks.push({ type: "list", items: [item[1]] });
    } else blocks.push({ type: "paragraph", text: line });
  }
  return blocks;
}

export type ProjectLink = { name: string; href: string };

/** The demo project is always there; its page needs no run to find it. */
const DEMO_LINK: ProjectLink = { name: "Morgan Hall North", href: "/projects/demo-project" };
/** Shorter names match too much ordinary text. */
const MIN_NAME = 4;

/**
 * Project names the chat can link, from what its runs returned: the projects list, scout candidates and dossiers.
 * A project page wins over a Discover page for the same name. Longest first, so full names win over aliases.
 */
export function projectLinks(runs: Run[]): ProjectLink[] {
  const byName = new Map<string, string>([[DEMO_LINK.name, DEMO_LINK.href]]);
  const add = (name: string, href: string) => {
    const current = byName.get(name);
    if (!current || (current.startsWith("/discover/") && href.startsWith("/projects/"))) byName.set(name, href);
  };
  for (const run of runs) {
    for (const d of run.destinations ?? []) {
      const projectPage = /^\/projects\/[a-z0-9-]+$/.test(d.href);
      if (d.kind === "candidate" || (d.kind === "project" && projectPage)) add(d.subject, d.href);
    }
  }
  const links: ProjectLink[] = [];
  for (const [name, href] of byName) {
    if (name.length < MIN_NAME) continue;
    links.push({ name, href });
    // "Lavine Cancer Hospital (Dana-Farber / BIDMC)" is often said without its parenthetical.
    const short = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (short !== name && short.length >= 6 && !byName.has(short)) links.push({ name: short, href });
  }
  return links.sort((a, b) => b.name.length - a.name.length);
}

export type Segment = { text: string; href?: string };

const wordChar = /[\p{L}\p{N}]/u;

/** An app path written in the text at `i`, e.g. "/projects/demo-project", without trailing punctuation. */
function pathAt(text: string, i: number): string | null {
  const m = /^\/[a-z0-9/?=-]*[a-z0-9]/.exec(text.slice(i));
  return m && appRoute(m[0]) === m[0] ? m[0] : null;
}

/** Splits text into plain and linked segments, linking each name it finds as a whole word, and real app paths. */
export function linkProjects(text: string, links: ProjectLink[]): Segment[] {
  const out: Segment[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const before = i > 0 ? text[i - 1] : "";
    const hit =
      before && wordChar.test(before)
        ? undefined
        : links.find((l) => text.startsWith(l.name, i) && !wordChar.test(text[i + l.name.length] ?? ""));
    const path = !hit && (!before || /\s|\(/.test(before)) ? pathAt(text, i) : null;
    const segment = hit ? { text: hit.name, href: hit.href } : path ? { text: path, href: path } : null;
    if (segment) {
      if (plain) out.push({ text: plain });
      plain = "";
      out.push(segment);
      i += segment.text.length;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  if (plain) out.push({ text: plain });
  return out;
}
