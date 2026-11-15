/*
 * Prompt filling, output parsing and the viewer page assembly. Pure functions, so they are tested without any
 * network call.
 *
 * The model returns data (a JSON scene), never code. The server builds the GLB from it and embeds that GLB in the
 * locked scaffold, so the page and the Projects viewer show the same model.
 */

export const TITLE_PLACEHOLDER = "__MODEL_TITLE__";
export const GLB_PLACEHOLDER = "__MODEL_GLB_BASE64__";

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

/**
 * The model's reply: the scene inside <scene_json> and the note inside <reply>. `scene` is the parsed JSON, or null
 * when the tag is missing or the JSON does not parse (`sceneError` says which). Throws only when <reply> is missing.
 */
export function parseReply(text: string): { scene: unknown; sceneText: string; sceneError: string | null; reply: string } {
  const reply = /<reply>([\s\S]*?)<\/reply>/.exec(text)?.[1];
  if (!reply) throw new Error("The reply is missing <reply>.");
  const parsed = parseSceneBlock(text);
  return { ...parsed, reply: reply.trim() };
}

/** The JSON inside <scene_json>. Models sometimes wrap it in a code fence inside the tags; one fence pair is stripped. */
export function parseSceneBlock(text: string): { scene: unknown; sceneText: string; sceneError: string | null } {
  const body = /<scene_json>([\s\S]*?)<\/scene_json>/.exec(text)?.[1];
  if (!body) return { scene: null, sceneText: "", sceneError: "<scene_json> is missing" };
  const sceneText = body.trim().replace(/^```(?:json)?\s*\n/, "").replace(/\n```\s*$/, "");
  try {
    return { scene: JSON.parse(sceneText), sceneText, sceneError: null };
  } catch (error) {
    return { scene: null, sceneText, sceneError: `the JSON does not parse: ${(error as Error).message}` };
  }
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** The locked scaffold with the title and the GLB filled in. The GLB is base64, so it can't break out of its string. */
export function assembleViewer(scaffold: string, title: string, glb: Uint8Array): string {
  if (!scaffold.includes(TITLE_PLACEHOLDER) || !scaffold.includes(GLB_PLACEHOLDER)) {
    throw new Error("The scaffold has no model placeholders.");
  }
  // Inside a JS string in a <script>: JSON escapes quotes and backslashes; < is escaped so "</script>" can't appear.
  const jsTitle = JSON.stringify(title).slice(1, -1).replace(/</g, "\\u003c");
  const htmlTitle = title.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
  return scaffold
    .replace(/<title>[^<]*<\/title>/, () => `<title>${htmlTitle}</title>`)
    .replace(`"${TITLE_PLACEHOLDER}"`, () => `"${jsTitle}"`)
    .replace(`"${GLB_PLACEHOLDER}"`, () => `"${Buffer.from(glb).toString("base64")}"`);
}

export type PromptValues = {
  project_name: string;
  address: string;
  lat: string;
  lng: string;
  geocode_status: string;
  observed_facts: string;
  user_notes: string;
  photo_status: string;
};
