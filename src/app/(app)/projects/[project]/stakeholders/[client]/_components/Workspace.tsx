"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import type { ModelInfo } from "@/features/model/schema";
import type { Client } from "@/features/project/schema";
import type { Proposal } from "@/features/proposal/schema";
import type { StoredEvent } from "@/features/tracking/record";
import type { ClientSummary } from "@/features/tracking/summary";
import { teaserPath } from "@/features/viewer/camera-paths";
import { ModelViewer } from "@/features/viewer/ModelViewer";
import { useProposalBuild, type BuildState } from "@/features/workspace/build";
import type { Stage } from "@/features/workspace/status";
import { BriefPanel } from "./BriefPanel";
import { BuildPanel } from "./BuildPanel";
import { EngagementPanel } from "./EngagementPanel";
import { ShotList } from "./ShotList";

export type WorkspaceTab = "shots" | "engagement";

type Props = {
  basePath: string;
  stage: Stage;
  tab: WorkspaceTab;
  model: ModelInfo;
  client: Client;
  proposal: Proposal | null;
  engagement: ClientSummary;
  events: StoredEvent[];
  sentAt: string | null;
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
 * The workspace body: the viewer (the page's one Asphalt surface) on the left, a 360 px panel on the right.
 * Captions under the canvas use `text-muted` and `Tag`, which switch to their dark values on Asphalt by themselves.
 */
export function Workspace({ basePath, stage, tab, model, client, proposal, engagement, events, sentAt }: Props) {
  const build = useProposalBuild({ clientId: client.id, company: client.company, basePath });
  const { state } = build;
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  // A finished full build keeps the build view until the refreshed stage arrives from the server.
  const building =
    state.phase === "running" || state.phase === "error" || (state.phase === "done" && stage === "not-built");
  const built = stage !== "not-built" && proposal !== null;
  const shots = proposal?.shots ?? [];
  const selected = shots.find((s) => s.id === selectedId) ?? shots[0];
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
          <ModelViewer model={model} path={selected.camera} loop className="absolute inset-0" />
        </div>
        {/* Sits under the canvas, not over it, so it never covers ModelViewer's own overlays. A fixed 80 px of
            content (label, name, two caption lines), so switching shots never resizes the canvas. */}
        <div className="box-content flex h-20 shrink-0 flex-col gap-1 border-t border-divider p-5">
          <p className="text-xs leading-4 text-muted">
            Shot{" "}
            <span className="app-num">
              {pad(selectedIndex + 1)} / {pad(shots.length)}
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

  let panel;
  if (building) {
    panel = (
      <Panel title={state.phase === "error" ? "Build stopped" : "Building"} flush className={SIDE_PANEL}>
        <BuildPanel build={build} />
      </Panel>
    );
  } else if (built && proposal) {
    const shotList = (
      <ShotList
        shots={shots}
        selectedId={selected?.id}
        onSelect={setSelectedId}
        onRegenerate={stage === "ready" ? build.regenerate : undefined}
      />
    );
    // Tabs only appear once there is a second view (Engagement, after sending). They take the header row's place.
    panel =
      stage === "sent" ? (
        <Panel
          flush
          className={SIDE_PANEL}
          tabsLabel="Proposal views"
          tabs={[
            { label: "Shots", href: `${basePath}?tab=shots`, active: tab === "shots", count: shots.length },
            { label: "Engagement", href: `${basePath}?tab=engagement`, active: tab === "engagement" },
          ]}
        >
          {tab === "engagement" ? (
            <EngagementPanel engagement={engagement} events={events} sentAt={sentAt} />
          ) : (
            shotList
          )}
        </Panel>
      ) : (
        <Panel title="Shots" count={shots.length} flush className={SIDE_PANEL}>
          {shotList}
        </Panel>
      );
  } else {
    panel = (
      <Panel title="Brief" flush className={SIDE_PANEL}>
        <BriefPanel client={client} />
      </Panel>
    );
  }

  return (
    <div className="grid min-h-[560px] flex-1 grid-cols-[minmax(0,1fr)_360px] grid-rows-[minmax(0,1fr)] gap-6">
      <div className="tm-ground-asphalt flex min-h-0 flex-col overflow-hidden rounded-xs">{viewer}</div>
      {panel}
    </div>
  );
}
