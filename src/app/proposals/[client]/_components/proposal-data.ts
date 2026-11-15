/*
 * Everything the proposal page needs, computed once on the server and passed to ProposalBrief as its only prop.
 * Pure and serialisable, so the client component can import the types and helpers.
 */

import type { ModelInfo } from "@/features/model/schema";
import type { Pitch } from "@/features/pitch/schema";
import type { Client, Project } from "@/features/project/schema";
import type { Proposal } from "@/features/proposal/schema";
import type { Obstacle } from "@/features/shots/compile";
import type { CameraPath, Shot } from "@/features/shots/schema";
import { teaserPath } from "@/features/viewer/camera-paths";

/** Tradesmark's published contact address, from their company profile. The only address the page may use. */
export const TRADESMARK_CONTACT_EMAIL = "contact@builtbytradesmark.com";

export type ProposalClient = Client & {
  /** `company` with any " (placeholder)" suffix removed, for display. */
  companyDisplay: string;
};

export type ProposalProject = Project & {
  /** Building height in meters, from the model's bounding box (the project schema has no height or floor count). */
  heightM: number;
};

/** One shot as a page would list it: the crew fields plus its caption, without the camera path. */
export type ShotRow = {
  id: string;
  name: string;
  /** The pitch's caption for this shot, or null when the pitch has none for it. */
  caption: string | null;
  platform: Shot["platform"];
  lens: string;
  timeOfDay: string;
  constructionPhase: string;
  side: Shot["side"];
  description: string;
};

export type BookCall = { label: "Book a call"; href: string };

export type ProposalData = {
  client: ProposalClient;
  project: ProposalProject;
  model: ModelInfo;
  /** The stored proposal, or null when none has been generated for this client. */
  proposal: Proposal | null;
  /** Shortcut for `proposal?.pitch ?? null`. */
  pitch: Pitch | null;
  /** The full shots, camera paths included (for ShotReel / ModelViewer), in proposal order. Empty without a proposal. */
  shots: Shot[];
  /** Neighboring buildings for ShotReel's `obstacles`, from loadShotObstacles. */
  obstacles: Obstacle[];
  /** Caption by shot id, from `pitch.shotCaptions`. */
  captions: Record<string, string>;
  /** Per shot, in proposal order. */
  shotRows: ShotRow[];
  bookCall: BookCall;
  /** The opening fly-up, `teaserPath(model.boundingBox)`. Plain data, so it is computed here once. */
  teaser: CameraPath;
};

/** "Mock Glazing Co. (placeholder)" -> "Mock Glazing Co." */
export function stripPlaceholder(company: string): string {
  return company.replace(/\s*\(placeholder\)\s*$/i, "").trim();
}

export function captionsFor(pitch: Pitch | null): Record<string, string> {
  const captions: Record<string, string> = {};
  for (const { shotId, caption } of pitch?.shotCaptions ?? []) captions[shotId] = caption;
  return captions;
}

export function shotRowsFor(shots: Shot[], captions: Record<string, string>): ShotRow[] {
  return shots.map((s) => ({
    id: s.id,
    name: s.name,
    caption: captions[s.id] ?? null,
    platform: s.platform,
    lens: s.lens,
    timeOfDay: s.timeOfDay,
    constructionPhase: s.constructionPhase,
    side: s.side,
    description: s.description,
  }));
}

export function bookCallFor(projectName: string, companyDisplay: string): BookCall {
  const subject = encodeURIComponent(`${projectName}: ${companyDisplay}`);
  return { label: "Book a call", href: `mailto:${TRADESMARK_CONTACT_EMAIL}?subject=${subject}` };
}

export function buildProposalData(input: {
  client: Client;
  project: Project;
  model: ModelInfo;
  proposal: Proposal | null;
  obstacles: Obstacle[];
}): ProposalData {
  const { client, project, model, proposal, obstacles } = input;
  const companyDisplay = stripPlaceholder(client.company);
  const pitch = proposal?.pitch ?? null;
  const shots = proposal?.shots ?? [];
  const captions = captionsFor(pitch);
  const box = model.boundingBox;
  return {
    client: { ...client, companyDisplay },
    project: { ...project, heightM: Math.round(box.max[1] - box.min[1]) },
    model,
    proposal,
    pitch,
    shots,
    obstacles,
    captions,
    shotRows: shotRowsFor(shots, captions),
    bookCall: bookCallFor(project.name, companyDisplay),
    teaser: teaserPath(box),
  };
}
