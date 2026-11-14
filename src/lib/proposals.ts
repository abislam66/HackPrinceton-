import "server-only";
import { z } from "zod";
import { buildingSides, type ModelInfo } from "@/features/model/schema";
import { pitchSchema } from "@/features/pitch/schema";
import { PROJECT_SLUG, needCategories, type Client } from "@/features/project/schema";
import { proposalSchema, type Proposal } from "@/features/proposal/schema";
import { getProposal, saveProposal } from "@/features/proposal/store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import preparedJson from "../../supabase/seed/prepared-proposals.json";

/** "stored": saved by generation or by a status change. "prepared": the stand-in picked by the client's need. */
export type ProposalSource = "stored" | "prepared";
export type LoadedProposal = { proposal: Proposal; source: ProposalSource };

// ---------- Prepared proposals (supabase/seed/prepared-proposals.json) ----------

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

/** Camera positions are normalized: [nx, ny, nz] resolves to [nx * S, ny * H, nz * S]. */
const preparedShotSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  platform: z.enum(["drone", "ground"]),
  lens: z.string(),
  timeOfDay: z.string(),
  constructionPhase: z.string(),
  side: z.enum(buildingSides),
  camera: z.object({
    fov: z.number().min(5).max(120),
    keyframes: z.array(z.object({ t: z.number().min(0), position: vec3, target: vec3 })).min(1),
  }),
});

const preparedProposalSchema = z.object({ pitch: pitchSchema, shots: z.array(preparedShotSchema) });
type PreparedProposal = z.infer<typeof preparedProposalSchema>;

const preparedFileSchema = z.partialRecord(z.enum(needCategories), preparedProposalSchema);

const prepared = preparedFileSchema.parse(preparedJson);

function fillFocus(text: string, focus: string): string {
  return text.replaceAll("{focus}", focus);
}

function buildPrepared(client: Client, model: ModelInfo, entry: PreparedProposal): Proposal {
  const focus = client.focusElements[0]?.trim() || "work";
  const { min, max } = model.boundingBox;
  const S = Math.max(max[0] - min[0], max[2] - min[2]);
  const H = max[1] - min[1];
  const resolve = ([nx, ny, nz]: [number, number, number]): [number, number, number] => [nx * S, ny * H, nz * S];

  const shots = entry.shots
    .filter((shot) => model.knownSides.includes(shot.side))
    .map((shot) => ({
      ...shot,
      name: fillFocus(shot.name, focus),
      description: fillFocus(shot.description, focus),
      lens: fillFocus(shot.lens, focus),
      timeOfDay: fillFocus(shot.timeOfDay, focus),
      constructionPhase: fillFocus(shot.constructionPhase, focus),
      camera: {
        fov: shot.camera.fov,
        keyframes: shot.camera.keyframes.map((k) => ({
          t: k.t,
          position: resolve(k.position),
          target: resolve(k.target),
        })),
      },
    }));

  return proposalSchema.parse({
    clientId: client.id,
    projectSlug: PROJECT_SLUG,
    status: "draft",
    pitch: {
      teaserLine: fillFocus(entry.pitch.teaserLine, focus),
      headline: fillFocus(entry.pitch.headline, focus),
      problem: fillFocus(entry.pitch.problem, focus),
      solution: fillFocus(entry.pitch.solution, focus),
    },
    shots,
  });
}

function preparedProposal(client: Client, model: ModelInfo): Proposal | null {
  const entry = prepared[client.need];
  return entry ? buildPrepared(client, model, entry) : null;
}

// ---------- In-memory store (used when Supabase is not configured or fails) ----------

const globalStore = globalThis as typeof globalThis & { __tmProposals?: Map<string, Proposal> };
const memory: Map<string, Proposal> = (globalStore.__tmProposals ??= new Map());

async function storedProposal(clientId: string): Promise<Proposal | null> {
  // Always ask the proposal store first. Today it only answers with Supabase configured; once it
  // also keeps fallback files (the pipeline fallback work), those are picked up here with no change.
  try {
    const fromStore = await getProposal(clientId);
    if (fromStore) return fromStore;
  } catch (error) {
    console.error("[proposals] getProposal failed, falling back to memory:", error);
  }
  return memory.get(clientId) ?? null;
}

// ---------- Public API ----------

/** The proposal to show for a client: the stored one if there is one, else the prepared one for the client's need, else null. */
export async function loadProposal(client: Client, model: ModelInfo): Promise<LoadedProposal | null> {
  const stored = await storedProposal(client.id);
  const fallback = preparedProposal(client, model);
  if (stored) {
    // Approving a prepared proposal stores it. It is still the stand-in, so keep calling it that
    // until generation replaces its content.
    const sameContent =
      fallback !== null &&
      JSON.stringify([stored.pitch, stored.shots]) === JSON.stringify([fallback.pitch, fallback.shots]);
    return { proposal: stored, source: sameContent ? "prepared" : "stored" };
  }
  return fallback ? { proposal: fallback, source: "prepared" } : null;
}

/** Sets the status ("draft" | "approved" | "sent") and stores the proposal. Returns the stored proposal, or null if the client has no proposal at all. */
export async function setProposalStatus(
  client: Client,
  model: ModelInfo,
  status: Proposal["status"],
): Promise<Proposal | null> {
  const loaded = await loadProposal(client, model);
  if (!loaded) return null;
  const next = proposalSchema.parse({ ...loaded.proposal, status });
  try {
    await saveProposal(next);
    // The store has it, so drop any older memory copy rather than keep two versions.
    memory.delete(client.id);
  } catch (error) {
    // The store cannot save (no Supabase and no file store yet, or a failed write): keep it in memory.
    memory.set(client.id, next);
    if (isSupabaseConfigured()) console.error("[proposals] saveProposal failed, kept in memory:", error);
  }
  return next;
}
