"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Heading } from "@/components/ui/Heading";
import { Tabs } from "@/components/ui/Tabs";
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
import { PitchForm } from "./PitchForm";
import { ShotList } from "./ShotList";

export type WorkspaceTab = "shots" | "pitch" | "engagement";

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

/** The workspace body: the viewer (the page's one Asphalt moment) on the left, a 360 px side panel on the right. */
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
        <div className="flex shrink-0 flex-col items-start gap-2 p-5">
          {state.phase === "error" ? (
            <Tag variant="halt">{buildStep(state)}</Tag>
          ) : (
            <Tag variant="cone" pulse>
              {buildStep(state)}
            </Tag>
          )}
          <p className="tm-text--s text-concrete">
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
        {/* Sits under the canvas, not over it, so it never covers ModelViewer's own overlays. */}
        <div className="flex min-h-[112px] shrink-0 flex-col gap-1 p-5">
          <span className="tm-label tm-num text-cone">
            Shot {pad(selectedIndex + 1)} / {pad(shots.length)}
          </span>
          <p className="tm-text--m truncate text-stucco">{selected.name}</p>
          {caption ? <p className="tm-text--s line-clamp-2 text-concrete">{caption}</p> : null}
        </div>
      </>
    );
  } else {
    viewer = (
      <div className="grid flex-1 place-items-center p-8">
        <div className="flex w-full max-w-[440px] flex-col gap-4">
          <Eyebrow>No model yet</Eyebrow>
          <Heading size="s">Build the proposal</Heading>
          <p className="tm-text--m text-concrete">
            The agents build {client.company}&apos;s own 3D model, drone shots and pitch.
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={build.start}>
              Build proposal
            </Button>
          </div>
        </div>
      </div>
    );
  }

  let panel;
  if (building) {
    panel = <BuildPanel build={build} />;
  } else if (built && proposal) {
    const tabs = [
      { label: "Shots", href: `${basePath}?tab=shots`, active: tab === "shots" },
      { label: "Pitch", href: `${basePath}?tab=pitch`, active: tab === "pitch" },
      ...(stage === "sent"
        ? [{ label: "Engagement", href: `${basePath}?tab=engagement`, active: tab === "engagement" }]
        : []),
    ];
    panel = (
      <>
        <div className="mb-6">
          <Tabs items={tabs} />
        </div>
        {tab === "pitch" ? (
          <PitchForm
            key={JSON.stringify(proposal.pitch)}
            clientId={client.id}
            pitch={proposal.pitch}
            readOnly={stage === "sent"}
          />
        ) : tab === "engagement" ? (
          <EngagementPanel engagement={engagement} events={events} sentAt={sentAt} />
        ) : (
          <ShotList
            shots={shots}
            selectedId={selected?.id}
            onSelect={setSelectedId}
            onRegenerate={stage === "ready" ? build.regenerate : undefined}
          />
        )}
      </>
    );
  } else {
    panel = <BriefPanel client={client} />;
  }

  return (
    <div className="grid min-h-[560px] flex-1 grid-cols-[minmax(0,1fr)_360px] grid-rows-[minmax(0,1fr)] gap-6">
      <div className="tm-ground-asphalt flex min-h-0 flex-col overflow-hidden">{viewer}</div>
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{panel}</div>
      </Card>
    </div>
  );
}
