import "server-only";
import { callStructured } from "@/features/proposal/llm";
import type { Client, Project } from "@/features/project/schema";
import type { Shot } from "@/features/shots/schema";
import { checkPitch } from "./rules";
import { pitchSchema, type Pitch } from "./schema";

const SYSTEM = `You write the copy for a Tradesmark proposal page. Tradesmark films and documents construction projects. One page goes to one client on one building, and opens on a drone shot flying up the building.

Fields:
First read the project's timeline. If it is still being built, write about documenting the build. If it is complete, write about capturing the finished building as it stands and is used today, and never describe it as under construction.

- teaserLine: shown over the opening fly-up. Short, second person, present tense. For a building under construction, in the spirit of "You're building this. We're here to document it." For a completed one, in the spirit of "You built this. We're here to show it." Adapt it to this client's need.
- headline: one line naming the building and what Tradesmark captures for this client.
- problem: the pressure this client actually faces, given their role and need. A trade contractor's is winning the next bid. A building owner's is keeping its community with the project through years of construction or, for a finished building, showing people what the building means to them.
- solution: how Tradesmark capturing this building solves that problem. Name the client's focus elements.
- shotCaptions: one line per shot, using the shot ids given, saying what that shot shows this client, e.g. "Here we hold on the glass drum at dusk."
- acrossProject: one sentence saying Tradesmark is working across the whole project, with the other teams on site, not only for this client.

Rules:
- Use only facts in the project and client given. Never invent features, numbers or dates about the building.
- No pricing, costs, quotes, fees, scope of work, deliverable counts or timelines.
- Tradesmark is the only brand. Do not describe or mention client photos.
- Under 60 words per field. Plain and specific. No exclamation marks, no marketing words (elevate, cutting-edge, seamless, world-class and the like).`;

/**
 * Writes the problem and solution copy for one client, with a caption per shot.
 * Parsed with pitchSchema, then checked against the copy rules; one retry with the problems.
 */
export async function generatePitch(input: { project: Project; client: Client; shots: Shot[] }): Promise<Pitch> {
  const { project, client, shots } = input;
  const brief = {
    project,
    client: {
      company: client.company,
      role: client.role,
      need: client.need,
      needsNotes: client.needsNotes,
      focusElements: client.focusElements,
    },
    shots: shots.map(({ id, name, description, side, timeOfDay }) => ({ id, name, description, side, timeOfDay })),
  };
  const user = `Write the proposal copy for this brief:\n${JSON.stringify(brief, null, 2)}`;

  let pitch = await callStructured(pitchSchema, SYSTEM, user, { effort: "low", maxTokens: 6000 });
  let problems = checkPitch(pitch, input);
  if (problems.length > 0) {
    pitch = await callStructured(
      pitchSchema,
      SYSTEM,
      `${user}\n\nYour previous copy broke these rules:\n- ${problems.join("\n- ")}\nRewrite it so none apply.`,
      { effort: "low", maxTokens: 6000 },
    );
    problems = checkPitch(pitch, input);
  }
  if (problems.length > 0) throw new Error(`Pitch failed the copy rules: ${problems.join("; ")}`);
  return pitch;
}
