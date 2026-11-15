"use client";

import { useState, type CSSProperties } from "react";
import { RunFeed } from "@/components/app/run/RunFeed";
import { useRun, type RunState } from "@/components/app/run/useRun";
import { Button } from "@/components/ui/Button";
import { ElevationGlyph } from "@/components/ui/ElevationGlyph";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip, FilterChips } from "@/components/ui/FilterChip";
import { MediaList, MediaRow } from "@/components/ui/MediaRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { relativeTime } from "@/features/demo/format";
import { regions } from "@/features/scout/regions";
import { regionIds, scoutResultSchema, type RegionId, type ScoutResult } from "@/features/scout/schema";

/** The pre-loaded demo project's row. It sits first and opens the project; scouted rows open their dossier. */
export type DemoRow = {
  href: string;
  name: string;
  location: string;
  why: string;
  floors: number | null;
  stakeholders: number;
  region: RegionId;
};

type RegionStatus = "queued" | "running" | "done" | "failed";

const REGION_TAG: Record<RegionStatus, { tone: TagTone; label: string }> = {
  queued: { tone: "neutral", label: "Queued" },
  running: { tone: "running", label: "Searching" },
  done: { tone: "pass", label: "Done" },
  failed: { tone: "fail", label: "Failed" },
};

/** A region's short name for the log, e.g. "Boston". */
function shortRegion(scope: string): string | null {
  const region = regions[scope as RegionId];
  if (!region) return null;
  return region.label.replace(/^Greater /, "").replace(/ and the Main Line$/, "").replace(/ City$/, "");
}

/*
 * Each region's state, read from the log: a region is searching once it logs anything, done when it reports what it
 * found ("Found 4 projects in New Jersey", src/features/scout/scout.ts) and failed when it reports it could not scout.
 */
function regionStatuses(state: RunState<ScoutResult>): Record<RegionId, { status: RegionStatus; searches: number }> {
  const out = Object.fromEntries(regionIds.map((id) => [id, { status: "queued" as RegionStatus, searches: 0 }])) as Record<
    RegionId,
    { status: RegionStatus; searches: number }
  >;
  for (const line of state.lines) {
    const entry = out[line.scope as RegionId];
    if (!entry) continue;
    if (line.kind === "search") entry.searches += 1;
    if (line.kind === "note" && line.message.startsWith("Could not scout")) entry.status = "failed";
    else if (line.kind === "found" && /^Found \d+ projects? in /.test(line.message)) entry.status = "done";
    else if (entry.status === "queued") entry.status = "running";
  }
  if (state.phase === "done") {
    for (const entry of Object.values(out)) if (entry.status === "running") entry.status = "done";
  }
  return out;
}

function RegionStrip({ state }: { state: RunState<ScoutResult> }) {
  const statuses = regionStatuses(state);
  // Once the run ends, only the regions it covered (a replay or a partial run may cover fewer than five).
  const shown = state.phase === "done" && state.result ? state.result.data.regions : regionIds;
  return (
    <ul
      className="grid border-t border-divider @2xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
      style={{ "--cols": shown.length } as CSSProperties}
      aria-label="Regions"
    >
      {shown.map((id) => {
        const { status, searches } = statuses[id];
        const tag = REGION_TAG[status];
        return (
          <li
            key={id}
            className="flex min-w-0 items-center justify-between gap-3 border-divider px-5 py-3 not-first:border-t @2xl:flex-col @2xl:items-start @2xl:not-first:border-t-0 @2xl:not-first:border-l"
          >
            <span className="flex max-w-full min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm leading-[18px] font-semibold" title={regions[id].label}>
                {shortRegion(id)}
              </span>
              <span className="text-xs leading-4 text-muted">
                <span className="app-num">{searches}</span> {searches === 1 ? "search" : "searches"}
              </span>
            </span>
            <Tag tone={tag.tone}>{tag.label}</Tag>
          </li>
        );
      })}
    </ul>
  );
}

function fitLabel(score: number) {
  return (
    <span className="text-xs whitespace-nowrap text-muted">
      Fit <span className="app-num text-ink">{score}</span>
    </span>
  );
}

export type ScoutBoardProps = {
  demo: DemoRow;
  initial: ScoutResult | null;
  replay?: { speed: number } | null;
};

/**
 * Discover: real projects the scout found in the five Northeast regions, ranked by how well they fit Tradesmark, with
 * the pre-loaded demo project first. "Run scout" researches all five regions live (one to two minutes) and shows the
 * agent's searches as they happen; the ranked list replaces the old one when it ends.
 */
export function ScoutBoard({ demo, initial, replay = null }: ScoutBoardProps) {
  const run = useRun<ScoutResult>({ url: "/api/scout/runs", data: scoutResultSchema, replay });
  const [feedOpen, setFeedOpen] = useState(true);
  const [region, setRegion] = useState<RegionId | null>(null);
  const { state } = run;
  const running = state.phase === "running";
  const result = state.result?.data ?? initial;

  const start = () => {
    setFeedOpen(true);
    run.start({});
  };

  const candidates = (result?.candidates ?? []).filter((c) => region === null || c.region === region);
  const showDemo = region === null || region === demo.region;
  const counts = new Map<RegionId, number>();
  for (const c of result?.candidates ?? []) counts.set(c.region, (counts.get(c.region) ?? 0) + 1);
  counts.set(demo.region, (counts.get(demo.region) ?? 0) + 1);

  const covered =
    result && result.regions.length < regionIds.length
      ? result.regions.map((id) => regions[id].label).join(", ")
      : "Five Northeast regions";

  const description = running ? (
    "Scouting five Northeast regions for buildings Tradesmark could film…"
  ) : result ? (
    <span suppressHydrationWarning>
      {covered} · scouted {state.phase === "done" ? "just now" : relativeTime(result.runAt)} ·{" "}
      <span className="app-num">{result.sources.length}</span> sources
    </span>
  ) : (
    "Five Northeast regions. No scout run yet."
  );

  return (
    <>
      <PageHeader
        title="Discover"
        description={description}
        actions={
          <Button variant="primary" onClick={start} pending={running} pendingLabel="Scouting…">
            Run scout
          </Button>
        }
      />

      <div className="flex flex-col gap-6">
        {state.phase !== "idle" && (feedOpen || running) ? (
          <Panel
            title="Scout run"
            flush
            className="@container"
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
              title="Scouting New York, Philadelphia, Connecticut, Boston and New Jersey"
              scopeLabel={shortRegion}
              summary={
                state.result ? (
                  <>
                    Ranked <span className="app-num">{state.result.data.candidates.length}</span> projects from{" "}
                    <span className="app-num">{state.result.data.sources.length}</span> sources
                  </>
                ) : null
              }
            >
              <RegionStrip state={state} />
            </RunFeed>
          </Panel>
        ) : null}

        <FilterChips label="Region">
          <FilterChip pressed={region === null} onPressedChange={() => setRegion(null)}>
            All regions
          </FilterChip>
          {regionIds.map((id) => (
            <FilterChip
              key={id}
              pressed={region === id}
              onPressedChange={(pressed) => setRegion(pressed ? id : null)}
            >
              {`${regions[id].label} · ${counts.get(id) ?? 0}`}
            </FilterChip>
          ))}
        </FilterChips>

        <Panel title="Projects" count={candidates.length + (showDemo ? 1 : 0)} flush>
          {candidates.length === 0 && !showDemo ? (
            <EmptyState
              title="Nothing found here"
              description="The last scout found no projects in this region. Run the scout again or pick another region."
            />
          ) : (
            <MediaList trailingWidth={104}>
              {showDemo ? (
                <MediaRow
                  href={demo.href}
                  media={<ElevationGlyph floors={demo.floors} />}
                  title={demo.name}
                  meta={`${demo.location} · ${demo.why}`}
                >
                  <span className="text-xs whitespace-nowrap text-muted">
                    <span className="app-num text-ink">{demo.stakeholders}</span>{" "}
                    {demo.stakeholders === 1 ? "stakeholder" : "stakeholders"}
                  </span>
                </MediaRow>
              ) : null}
              {candidates.map((c) => (
                <MediaRow
                  key={c.id}
                  href={`/discover/${c.id}`}
                  media={<ElevationGlyph floors={c.floors} />}
                  title={c.name}
                  meta={`${c.city}, ${c.state} · ${c.whyItFits}`}
                >
                  {fitLabel(c.score)}
                </MediaRow>
              ))}
            </MediaList>
          )}
          {!result && !running && region === null ? (
            <EmptyState
              className="border-t border-divider"
              title="No scouted projects yet"
              description="Run the scout to find buildings under construction or recently finished in the five regions. It takes one to two minutes."
            />
          ) : null}
        </Panel>
      </div>
    </>
  );
}
