import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/*
 * A project's reference photos: the files in data/<project>/images/. Read-only; data/ is never written.
 * Names are checked against a strict pattern before they touch the file system, so a request can't leave the folder.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const SLUG = /^[a-z0-9-]{1,64}$/;
const IMAGE = /^[a-z0-9][a-z0-9_-]{0,94}\.(jpe?g|png)$/i;

export type ProjectImageType = "image/jpeg" | "image/png";

export function isProjectSlug(value: string): boolean {
  return SLUG.test(value);
}

export function isImageName(value: string): boolean {
  return IMAGE.test(value);
}

function imageDir(slug: string): string {
  return path.join(DATA_DIR, slug, "images");
}

/** The project's JPEG and PNG reference photos, sorted by name. Empty when the project has none. */
export async function listProjectImages(slug: string): Promise<string[]> {
  if (!isProjectSlug(slug)) return [];
  try {
    return (await readdir(imageDir(slug))).filter(isImageName).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** One reference photo's bytes and type, or null when the names are invalid or the file doesn't exist. */
export async function readProjectImage(
  slug: string,
  file: string,
): Promise<{ bytes: Buffer; type: ProjectImageType } | null> {
  if (!isProjectSlug(slug) || !isImageName(file)) return null;
  const dir = imageDir(slug);
  const full = path.join(dir, file);
  if (path.dirname(full) !== dir) return null;
  try {
    const bytes = await readFile(full);
    return { bytes, type: /\.png$/i.test(file) ? "image/png" : "image/jpeg" };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR") return null;
    throw error;
  }
}
