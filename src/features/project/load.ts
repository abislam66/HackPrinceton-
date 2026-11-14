import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PROJECT_SLUG, clientSchema, projectSchema, type Client, type Project } from "./schema";

const projectDir = path.join(process.cwd(), "data", PROJECT_SLUG);

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function loadProject(): Promise<Project> {
  return projectSchema.parse(await readJson(path.join(projectDir, "project.json")));
}

export async function loadClients(): Promise<Client[]> {
  const dir = path.join(projectDir, "clients");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(files.map(async (f) => clientSchema.parse(await readJson(path.join(dir, f)))));
}

export async function loadClient(id: string): Promise<Client | null> {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  try {
    return clientSchema.parse(await readJson(path.join(projectDir, "clients", `${id}.json`)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
