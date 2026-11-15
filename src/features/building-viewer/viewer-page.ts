import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { rebaseViewer } from "./prompt";

/**
 * A stored viewer page on today's scaffold (building-viewer/scaffold.html), so models generated before a change to
 * the stage pick it up. `current` is false for a page that can't be moved: one from the older, code-writing
 * generator, which has no GLB to lift out. That page is shown as it was, and the caller says it is out of date.
 * If the scaffold can't be read, the stored page is shown as it is.
 */
export async function currentViewerPage(stored: string): Promise<{ html: string; current: boolean }> {
  try {
    const scaffold = await readFile(path.join(process.cwd(), "building-viewer", "scaffold.html"), "utf8");
    // Only a page that carries its GLB can be moved; one without was written by the code-writing generator.
    return { html: rebaseViewer(stored, scaffold), current: /const MODEL_GLB = "[A-Za-z0-9+/=]+";/.test(stored) };
  } catch (error) {
    console.warn("[building-viewer] scaffold unreadable; showing the stored page", (error as Error).message);
    return { html: stored, current: true };
  }
}

