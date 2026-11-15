// Types only from the server modules: erased at build time, so nothing server-only reaches the browser.
import type { DraftCard } from "@/features/project-agent/agent";
import type { ProjectDraft } from "@/features/project-agent/store";

/** A drafted change as the project agent panel shows it. */
export type DraftView = {
  id: string;
  kind: ProjectDraft["kind"];
  clientId: string;
  company: string;
  /** The change in the team's words. Null only for a moment, before the page refresh brings the stored draft. */
  request: string | null;
  /** What the change does to the stakeholder, in plain words. */
  summary: string;
  headline: string;
  shots: string[];
  status: ProjectDraft["status"];
  newProjectId?: string;
  /** ISO time it was drafted, for ordering. */
  createdAt: string;
};

/** From the stored draft (the page loads these). */
export function draftView(draft: ProjectDraft): DraftView {
  return {
    id: draft.id,
    kind: draft.kind,
    clientId: draft.clientId,
    company: draft.client.company,
    request: draft.request,
    summary: draft.scenario.summary,
    headline: draft.proposal.pitch.headline,
    shots: draft.proposal.shots.map((shot) => shot.name),
    status: draft.status,
    newProjectId: draft.newProjectId,
    createdAt: draft.createdAt,
  };
}

/** From a card the agent streams or the resolve route returns, which carries no request or time. */
export function draftViewFromCard(card: DraftCard, earlier?: DraftView): DraftView {
  return {
    id: card.id,
    kind: card.kind,
    clientId: card.clientId,
    company: card.company,
    request: earlier?.request ?? null,
    summary: card.summary,
    headline: card.headline,
    shots: card.shots,
    status: card.status,
    newProjectId: card.newProjectId,
    createdAt: earlier?.createdAt ?? new Date().toISOString(),
  };
}
