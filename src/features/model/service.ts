import "server-only";
import { z } from "zod";

/** Mirrors BuildStatus in model-builder/src/model_builder/api.py. */
export const buildStatusSchema = z.object({
  id: z.string(),
  projectSlug: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  error: z.string().nullable(),
});
export type BuildStatus = z.infer<typeof buildStatusSchema>;

function serviceUrl(): string {
  const url = process.env.MODEL_BUILDER_URL;
  if (!url) throw new Error("MODEL_BUILDER_URL is not set. Start the model builder service and set it in .env.local.");
  return url.replace(/\/$/, "");
}

/** Starts a build on the Python model builder service. */
export async function startModelBuild(projectSlug: string): Promise<BuildStatus> {
  const res = await fetch(`${serviceUrl()}/builds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectSlug }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Model builder returned ${res.status}`);
  return buildStatusSchema.parse(await res.json());
}

export async function getModelBuild(id: string): Promise<BuildStatus | null> {
  const res = await fetch(`${serviceUrl()}/builds/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Model builder returned ${res.status}`);
  return buildStatusSchema.parse(await res.json());
}
