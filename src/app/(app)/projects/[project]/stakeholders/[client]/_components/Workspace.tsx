"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { DraftView } from "@/components/project-agent/draft-view";
import { ProjectAgent } from "@/components/project-agent/ProjectAgent";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import type { ModelInfo, ModelObstacle } from "@/features/model/schema";
import { cutAt, planReel, type Reel } from "@/features/shots/reel";
import type { Client } from "@/features/project/schema";
import type { Proposal } from "@/features/proposal/schema";
import type { StoredEvent } from "@/features/tracking/record";
import type { ClientSummary } from "@/features/tracking/summary";
import { teaserPath } from "@/features/viewer/camera-paths";
import { ModelViewer } from "@/features/viewer/ModelViewer";
import { useProposalBuild, type BuildState } from "@/features/workspace/build";
import { cx } from "@/lib/cx";
import type { Stage } from "@/features/workspace/status";
import { BriefPanel } from "./BriefPanel";
import { BuildPanel } from "./BuildPanel";
import { EngagementPanel } from "./EngagementPanel";
import { PITCH_VIDEO_ID, ShotList } from "./ShotList";

/** `shots` is the Brief before anything is built. `agent` is the project agent, scoped to this stakeholder. */
export type WorkspaceTab = "shots" | "engagement" | "agent";

type Props = {
  projectSlug: string;
  basePath: string;
  stage: Stage;
  tab: WorkspaceTab;
  model: ModelInfo;
  /** The neighbours the proposal page's film avoids, so the Pitch video here flies the same route. */
  reelObstacles: ModelObstacle[];
  client: Client;
  proposal: Proposal | null;
  engagement: ClientSummary;
  events: StoredEvent[];
  sentAt: string | null;
  /** This stakeholder's pending drafts from the project agent. */
  drafts: DraftView[];
};

function buildStep(state: BuildState): string {
  if (state.phase === "error") return "Build stopped";
  if (state.phase === "done") return "Finishing";
  if (state.steps.some((s) => s.id === "model" && s.status === "running")) return "Building model";
  return "Generating shots and pitch";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The side panel: a column that fills the row. Its header stays put; the body below decides what scrolls. */
const SIDE_PANEL = "flex min-h-0 flex-col overflow-hidden";

/**
 * The workspace body: the viewer (the page's one Asphalt surface) on the left, a 360 px panel on the right (400 px on
 * the Agent tab, so a draft's three actions sit on one row). The panel's tabs: Shots (Brief before a build),
 * Engagement once sent, and Agent, where prompts draft new shots for this stakeholder.
 * Captions under the canvas use `text-muted` and `Tag`, which switch to their dark values on Asphalt by themselves.
 */
export function Workspace({
  projectSlug,
  basePath,
  stage,
  tab,
  model,
  reelObstacles,
  client,
  proposal,
  engagement,
  events,
  sentAt,
  drafts,
}: Props) {
  const router = useRouter();
  const build = useProposalBuild({ projectSlug, clientId: client.id, company: client.company, basePath });
  const { state } = build;
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  // A finished full build keeps the build view until the refreshed stage arrives from the server.
  const building =
    state.phase === "running" || state.phase === "error" || (state.phase === "done" && stage === "not-built");
  const built = stage !== "not-built" && proposal !== null;
  const shots = useMemo(() => proposal?.shots ?? [], [proposal]);
  // The proposal page's film, planned the same way (ProposalBrief's FilmSection), so it plays the same flight.
  const reel = useMemo(() => planReel(shots, model.boundingBox, { obstacles: reelObstacles }), [shots, model.boundingBox, reelObstacles]);
  const playingReel = selectedId === PITCH_VIDEO_ID && reel.path !== null;
  const reelIndex = useReelCut(reel, playingReel);
  const selected = playingReel ? reel.cuts[reelIndex]?.shot : (shots.find((s) => s.id === selectedId) ?? shots[0]);
  const selectedIndex = selected ? shots.indexOf(selected) : -1;
  const caption = selected ? proposal?.pitch.shotCaptions.find((c) => c.shotId === selected.id)?.caption : undefined;
  const modelRunning = state.steps.some((s) => s.id === "model" && s.status === "running");

  let viewer;
  if (building) {
    viewer = (
      <>
        <span aria-hidden className="tm-tape shrink-0" />
        <div className="relative min-h-0 flex-1">
          <ModelViewer
            model={model}
            path={teaserPath(model.boundingBox)}
            loop
            interactive={!modelRunning}
            className="absolute inset-0"
          />
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 border-t border-divider p-5">
          <Tag tone={state.phase === "error" ? "fail" : "running"}>{buildStep(state)}</Tag>
          <p className="text-[13px] leading-[18px] text-muted">
            {state.kind === "regenerate"
              ? `New shots and pitch for ${client.company}.`
              : `${client.company}'s own 3D model, drone shots and pitch.`}
          </p>
        </div>
      </>
    );
  } else if (built && selected) {
    viewer = (
      <>
        <div className="relative min-h-0 flex-1">
          <ModelViewer model={model} path={playingReel && reel.path ? reel.path : selected.camera} loop className="absolute inset-0" />
        </div>
        {/* Sits under the canvas, not over it, so it never covers ModelViewer's own overlays. A fixed 80 px of
            content (label, name, two caption lines), so switching shots never resizes the canvas. */}
        <div className="box-content flex h-20 shrink-0 flex-col gap-1 border-t border-divider p-5">
          <p className="text-xs leading-4 text-muted">
            {playingReel ? "Pitch video · shot " : "Shot "}
            <span className="app-num">
              {playingReel ? `${pad(reelIndex + 1)} / ${pad(reel.cuts.length)}` : `${pad(selectedIndex + 1)} / ${pad(shots.length)}`}
            </span>
          </p>
          <p className="truncate text-sm leading-5 font-semibold" title={selected.name}>
            {selected.name}
          </p>
          {caption ? <p className="line-clamp-2 text-[13px] leading-[18px] text-muted">{caption}</p> : null}
        </div>
      </>
    );
  } else {
    viewer = (
      <EmptyState
        title="No proposal yet"
        description={`The agents build ${client.company}'s own 3D model, drone shots and pitch.`}
        action={
          <Button variant="primary" onClick={build.start}>
            Build proposal
          </Button>
        }
      />
    );
  }

  // Replacing this stakeholder's draft from the Agent tab: show the new shots, from the first.
  function onResolved(draft: DraftView) {
    if (draft.status !== "replaced" || draft.clientId !== client.id) return;
    setSelectedId(undefined);
    router.push(`${basePath}?tab=shots`);
  }

  let panel;
  if (building) {
    panel = (
      <Panel title={state.phase === "error" ? "Build stopped" : "Building"} flush className={SIDE_PANEL}>
        <BuildPanel build={build} />
      </Panel>
    );
  } else {
    const tabs = [
      built
        ? { label: "Shots", href: `${basePath}?tab=shots`, active: tab === "shots", count: shots.length }
        : { label: "Brief", href: `${basePath}?tab=shots`, active: tab === "shots" },
      ...(stage === "sent"
        ? [{ label: "Engagement", href: `${basePath}?tab=engagement`, active: tab === "engagement" }]
        : []),
      { label: "Agent", href: `${basePath}?tab=agent`, active: tab === "agent", count: drafts.length || undefined },
    ];
    let view = null;
    if (tab === "engagement") view = <EngagementPanel engagement={engagement} events={events} sentAt={sentAt} />;
    else if (tab === "shots" && built && proposal)
      view = (
        <ShotList
          shots={shots}
          reel={reel.path ? { path: reel.path, duration: reel.duration, cuts: reel.cuts.map((c) => c.duration) } : null}
          selectedId={playingReel ? PITCH_VIDEO_ID : selected?.id}
          onSelect={setSelectedId}
          onRegenerate={stage === "ready" ? build.regenerate : undefined}
        />
      );
    else if (tab === "shots") view = <BriefPanel client={client} />;
    // One panel whatever the stage, so the agent below keeps its place in the tree, and with it a streaming reply.
    panel = (
      <Panel flush className={SIDE_PANEL} tabsLabel="Stakeholder views" tabs={tabs}>
        {view}
        <ProjectAgent
          frame="bare"
          projectSlug={projectSlug}
          stakeholder={{ id: client.id, company: client.company }}
          drafts={drafts}
          hidden={tab !== "agent"}
          onResolved={onResolved}
        />
      </Panel>
    );
  }

  return (
    <div
      className={cx(
        "grid min-h-[560px] flex-1 grid-rows-[minmax(0,1fr)] gap-6",
        tab === "agent" && !building ? "grid-cols-[minmax(0,1fr)_400px]" : "grid-cols-[minmax(0,1fr)_360px]",
      )}
    >
      <div className="tm-ground-asphalt flex min-h-0 flex-col overflow-hidden rounded-xs">{viewer}</div>
      {panel}
    </div>
  );
}

/**
 * Which cut of the reel is on screen, following the reel's clock while it plays (as ShotReel does). The viewer plays
 * the path on its own clock; both start when the reel is picked and share its duration, and the reel loops.
 */
function useReelCut(reel: Reel, playing: boolean): number {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!playing || reel.duration <= 0) return;
    const started = performance.now();
    const tick = window.setInterval(() => {
      const t = ((performance.now() - started) / 1000) % reel.duration;
      const cut = cutAt(reel, t);
      setIndex(cut ? reel.cuts.indexOf(cut) : 0);
    }, 100);
    return () => {
      window.clearInterval(tick);
      setIndex(0);
    };
  }, [reel, playing]);
  return index;
}
