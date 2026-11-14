import "server-only";
import type { ModelInfo } from "@/features/model/schema";
import type { Client, Project } from "@/features/project/schema";
import type { Shot } from "./schema";

/**
 * Generates the drone shots for one client from the model and the client's needs.
 * The agent's output must be parsed with shotListSchema before it is returned.
 */
export async function generateShots(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  input: { project: Project; client: Client; model: ModelInfo },
): Promise<Shot[]> {
  throw new Error("generateShots is not implemented yet");
}
