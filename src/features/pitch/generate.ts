import "server-only";
import type { Client, Project } from "@/features/project/schema";
import type { Shot } from "@/features/shots/schema";
import type { Pitch } from "./schema";

/**
 * Writes the problem and solution copy for one client.
 * The agent's output must be parsed with pitchSchema before it is returned.
 */
export async function generatePitch(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  input: { project: Project; client: Client; shots: Shot[] },
): Promise<Pitch> {
  throw new Error("generatePitch is not implemented yet");
}
