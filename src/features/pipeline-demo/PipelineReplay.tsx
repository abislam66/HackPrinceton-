"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Cell, Cells } from "@/components/Cell";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";
import { Tag } from "@/components/Tag";
import type { Client, Project } from "@/features/project/schema";
import { AnalysisStage, analysisDelays, analysisProgress } from "./AnalysisStage";
import { DossierStage, dossierDelays, dossierProgress } from "./DossierStage";
import type { Replay } from "./schema";
import { ScoutStage, scoutDelays, scoutProgress, type NamedScoutRow } from "./ScoutStage";

type Props = { project: Project; clients: Client[]; replay: Replay };

const stages = [
  { label: "Scouting", about: "Permits, bid awards and press, ranked by value and stage.", next: "Analyze project" },
  { label: "Analysis", about: "Building, scope and timeline read from the project's records.", next: "Find stakeholders" },
  { label: "Dossier", about: "Firms and contacts named in the same records.", next: "Open clients" },
] as const;

/** Where the replay hands off: the internal app's client list. */
const HANDOFF = "/";

/**
 * The scripted run of the three stages before intake. Each stage is a list of timed steps that plays on its own;
 * the presenter moves on with the main button or the right arrow key, which first finishes the stage in play.
 */
export function PipelineReplay({ project, clients, replay }: Props) {
  const [stage, setStage] = useState(0);
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);

  const rows: NamedScoutRow[] = replay.scouting.map((row) => ({ ...row, name: row.isDemoProject ? project.name : (row.name ?? "") }));
  const counts = [rows.length, replay.analysis.length, replay.dossier.length] as const;
  const delays = useMemo(
    () => [scoutDelays, analysisDelays, dossierDelays][stage](counts[stage]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the counts are fixed for the life of the page
    [stage],
  );
  const total = delays.length;
  const done = step >= total;

  // Advance one step at a time. `run` restarts the clock when the same stage is played again.
  useEffect(() => {
    if (done) return;
    const timer = window.setTimeout(() => setStep((s) => s + 1), delays[step]);
    return () => window.clearTimeout(timer);
  }, [step, done, delays, run]);

  const play = useCallback((index: number) => {
    setStage(index);
    setStep(0);
    setRun((r) => r + 1);
  }, []);

  const next = useCallback(() => {
    if (!done) setStep(total);
    else if (stage < stages.length - 1) play(stage + 1);
  }, [done, total, stage, play]);

  // Presenter keys: right arrow finishes the stage or moves on, left arrow goes back a stage.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        play(Math.max(0, stage - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, play, stage]);

  const readouts = (() => {
    if (stage === 0) {
      const p = scoutProgress(rows, step);
      return [
        { label: "Records", value: String(p.shown) },
        { label: "Top pick", value: p.picked ? project.name : "Ranking" },
      ];
    }
    if (stage === 1) {
      const p = analysisProgress(replay, step);
      return [
        { label: "Records", value: String(p.sourcesShown ? replay.sources.length : 0) },
        { label: "Fields", value: `${p.filled} of ${replay.analysis.length}` },
      ];
    }
    const p = dossierProgress(replay, step);
    return [
      { label: "Firms", value: String(p.found) },
      { label: "Contacts", value: String(p.contacts) },
    ];
  })();

  const current = stages[stage];

  return (
    <main className="flex-1 pb-32">
      <section className="tm-wrap pt-24 pb-16">
        <div className="tm-grid gap-y-8">
          <div className="col-span-full tab:col-span-2 desk:col-span-3">
            <Eyebrow>Simulated run</Eyebrow>
            {replay.sample ? <Tag variant="quiet" className="mt-6">Sample data</Tag> : null}
          </div>
          {/* Indented one gutter so the title shares its left edge with the ruled stage below. */}
          <div className="col-span-full tab:col-span-6 tab:pl-(--tm-gutter) desk:col-span-9">
            <Heading as="h1" size="l">
              Project pipeline
            </Heading>
            <p className="tm-lead mt-6 max-w-[44ch]">Scouting, analysis and dossier, replayed from prepared records.</p>
            <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Cells aria-label="Stages">
                {stages.map((s, i) => (
                  <Cell key={s.label} pressed={i === stage} onClick={() => play(i)}>
                    {s.label}
                  </Cell>
                ))}
              </Cells>
              <Button arrow={false} compact onClick={() => play(stage)}>
                Replay
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="tm-wrap" aria-label={current.label}>
        <div className="tm-grid border-t border-rule">
          <div className="col-span-full pt-5 pb-8 tab:col-span-2 desk:col-span-3">
            <Eyebrow>{current.label}</Eyebrow>
            <p className="tm-text--s tm-muted mt-6 max-w-[32ch] pr-(--tm-gutter)">{current.about}</p>
            <dl className="mt-8 flex flex-col gap-6">
              {readouts.map((r) => (
                <div key={r.label}>
                  <dt className="tm-label tm-muted">{r.label}</dt>
                  <dd className="tm-text--m tm-num mt-2">{r.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8" aria-live="polite">
              {done ? <Tag variant="go">Done</Tag> : <Tag variant="ink">Running</Tag>}
            </div>
          </div>

          {stage === 0 ? (
            <div className="@container col-span-full border-rule max-tab:border-t tab:col-span-6 tab:border-l tab:pl-(--tm-gutter) desk:col-span-9">
              <ScoutStage key={run} rows={rows} step={step} />
            </div>
          ) : stage === 1 ? (
            <AnalysisStage key={run} replay={replay} project={project} step={step} />
          ) : (
            <DossierStage key={run} replay={replay} clients={clients} step={step} />
          )}

          <div className="col-span-full border-rule pt-12 tab:col-span-6 tab:col-start-3 tab:border-l tab:pl-(--tm-gutter) desk:col-span-9 desk:col-start-4">
            {!done ? (
              <Button arrow={false} onClick={next}>
                Skip
              </Button>
            ) : stage < stages.length - 1 ? (
              <Button variant="black" onClick={next}>
                {current.next}
              </Button>
            ) : (
              <Button variant="black" href={HANDOFF}>
                {current.next}
              </Button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
