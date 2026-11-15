"use client";

import { useState } from "react";
import { RunFeed } from "@/components/app/run/RunFeed";
import { useRun } from "@/components/app/run/useRun";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { StatStrip } from "@/components/ui/StatStrip";
import { relativeTime } from "@/features/demo/format";
import { dossierSchema, type Dossier } from "@/features/dossier/schema";
import { DossierView } from "./DossierView";

export type DossierBoardProps = {
  /** "demo-project" or a scout candidate id: what POST /api/dossiers/[project]/runs researches. */
  projectId: string;
  projectName: string;
  /** The stored dossier or committed snapshot, when there is one. */
  initial: Dossier | null;
  /** Show the dossier's key facts as a stat strip. Off where the page header already shows the measurements. */
  keyFacts?: boolean;
  /** From the page's `?replay=1`: replay the last recorded run instead of researching live. */
  replay?: { speed: number } | null;
  /** The empty state's button. Secondary where the page already has its one primary action. */
  emptyAction?: "primary" | "secondary";
};

/**
 * A project's dossier with the research behind it: the latest dossier, a button to research it again live, and the
 * agent's log while it works. The new dossier replaces the old one when the run ends.
 */
export function DossierBoard({
  projectId,
  projectName,
  initial,
  keyFacts = false,
  replay = null,
  emptyAction = "primary",
}: DossierBoardProps) {
  const run = useRun<Dossier>({
    url: `/api/dossiers/${encodeURIComponent(projectId)}/runs`,
    data: dossierSchema,
    replay,
  });
  const [feedOpen, setFeedOpen] = useState(true);
  const { state } = run;
  const running = state.phase === "running";
  const dossier = state.result?.data ?? initial;

  const start = () => {
    setFeedOpen(true);
    run.start();
  };

  const showFeed = state.phase !== "idle" && (feedOpen || running);

  return (
    <div className="flex flex-col gap-6">
      {dossier ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] leading-5 text-muted" suppressHydrationWarning>
            {state.phase === "done" ? "Researched just now" : `Researched ${relativeTime(dossier.runAt)}`}
            {" · "}
            <span className="app-num">{dossier.sources.length}</span> public sources
          </p>
          <Button onClick={start} pending={running} pendingLabel="Researching…">
            Research again
          </Button>
        </div>
      ) : null}

      {showFeed ? (
        <Panel
          title="Research run"
          flush
          action={
            running ? null : (
              <Button variant="tertiary" onClick={() => setFeedOpen(false)}>
                Hide log
              </Button>
            )
          }
        >
          <RunFeed
            state={state}
            title={`Researching ${projectName}`}
            summary={
              state.result ? (
                <>
                  <span className="app-num">{state.result.data.firms.length}</span> firms,{" "}
                  <span className="app-num">{state.result.data.timeline.length}</span> timeline events from{" "}
                  <span className="app-num">{state.result.data.sources.length}</span> sources
                </>
              ) : null
            }
          />
        </Panel>
      ) : null}

      {dossier ? (
        <>
          {keyFacts && dossier.keyFacts.length > 0 ? (
            <Panel flush>
              <StatStrip label="Key facts" items={dossier.keyFacts.map(({ label, value }) => ({ label, value }))} />
            </Panel>
          ) : null}
          <DossierView dossier={dossier} />
        </>
      ) : running ? null : (
        <Panel flush>
          <EmptyState
            title="No dossier yet"
            description="The agent researches the building, the firms on it and its timeline from public sources, citing each fact. It takes one to three minutes."
            action={
              <Button variant={emptyAction} onClick={start}>
                Research project
              </Button>
            }
          />
        </Panel>
      )}
    </div>
  );
}
