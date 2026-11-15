/*
 * Prompt filling, output parsing and the locked-scaffold splice. Pure functions, so they are tested
 * without any network call.
 */

export const SUBJECT_BEGIN = "/* ===================== SUBJECT (REPLACE THIS BLOCK PER PROJECT)";
export const SUBJECT_END = "/* ===================== END SUBJECT BLOCK ===================== */";

/** Text the model must not introduce into the subject code: script breakouts, network, storage. */
const FORBIDDEN_IN_SUBJECT = [/<\/script/i, /<!--/, /\bfetch\s*\(/, /XMLHttpRequest/, /\bimport\s*\(/, /localStorage/, /sessionStorage/, /document\.cookie/, /window\.open/];

/** Replace each {{name}} with its value. Throws if any placeholder is left over. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  const filled = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => {
    if (!(key in values)) return match;
    return values[key];
  });
  if (filled.includes("{{")) {
    const left = filled.match(/\{\{[^}]*\}\}/g)?.join(", ") ?? "{{";
    throw new Error(`Prompt has unfilled placeholders: ${left}`);
  }
  return filled;
}

/** The model's full reply: the page inside <html_output> and the note inside <reply>. */
export function parseReply(text: string): { html: string; reply: string } {
  const html = /<html_output>([\s\S]*?)<\/html_output>/.exec(text)?.[1];
  const reply = /<reply>([\s\S]*?)<\/reply>/.exec(text)?.[1];
  if (!html || !reply) throw new Error("The reply is missing <html_output> or <reply>.");
  // Models sometimes wrap the page in a code fence inside the tags. Strip one fence pair.
  const page = html.trim().replace(/^```(?:html)?\s*\n/, "").replace(/\n```\s*$/, "");
  return { html: page, reply: reply.trim() };
}

/** The SUBJECT block exactly as the scaffold marks it, from its begin line through its end line. */
export function extractSubjectBlock(html: string): string {
  const begin = html.indexOf(SUBJECT_BEGIN);
  const end = html.indexOf(SUBJECT_END);
  if (begin < 0 || end < 0 || html.indexOf(SUBJECT_BEGIN, begin + 1) >= 0 || html.indexOf(SUBJECT_END, end + 1) >= 0 || end < begin) {
    throw new Error("The SUBJECT block markers are missing or repeated.");
  }
  return html.slice(begin, end + SUBJECT_END.length);
}

export function extractTitle(html: string): string {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  if (!title) throw new Error("The page has no <title>.");
  return title;
}

/** Refuse subject code that breaks out of the page or reaches the network or browser storage. */
export function checkSubjectSafety(subject: string): void {
  const hit = FORBIDDEN_IN_SUBJECT.find((pattern) => pattern.test(subject));
  if (hit) throw new Error(`The subject code uses something the viewer does not allow (${hit.source}).`);
}

/** The scaffold with only the SUBJECT block and the title replaced. */
export function assemble(scaffold: string, subject: string, title: string): string {
  const withSubject = scaffold.replace(extractSubjectBlock(scaffold), () => subject);
  return withSubject.replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`);
}

/** True when the model's page differs from the scaffold outside the SUBJECT block and the title. */
export function hasScaffoldDrift(modelHtml: string, scaffold: string): boolean {
  const strip = (html: string) => {
    let out;
    try {
      out = html.replace(extractSubjectBlock(html), "[SUBJECT]");
    } catch {
      return null;
    }
    return out.replace(/<title>[^<]*<\/title>/, "<title>[TITLE]</title>");
  };
  const modelStripped = strip(modelHtml);
  const scaffoldStripped = strip(scaffold);
  return modelStripped !== scaffoldStripped;
}

export type PromptValues = {
  project_name: string;
  address: string;
  lat: string;
  lng: string;
  geocode_status: string;
  context_json: string;
  context_status: string;
  observed_facts: string;
  user_notes: string;
  photo_status: string;
};
