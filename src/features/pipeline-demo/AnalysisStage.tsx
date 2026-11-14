import type { Project } from "@/features/project/schema";
import { reveal } from "./reveal";
import type { Replay } from "./schema";
import { SourceDoc, type Mark } from "./SourceDoc";

const fieldLabels: Record<Replay["analysis"][number]["field"], string> = {
  buildingType: "Building",
  scopeType: "Scope",
  timeline: "Timeline",
  summary: "Summary",
};

/** Delay before each step: the records open, each field fills from its passage, then the last highlight settles. */
export const analysisDelays = (fields: number) => [400, ...Array<number>(fields).fill(1200), 1200];

export function analysisProgress(replay: Replay, step: number) {
  const total = replay.analysis.length;
  const filled = Math.max(0, Math.min(step - 1, total));
  return {
    sourcesShown: step >= 1,
    filled,
    active: step >= 2 && step <= total + 1 ? step - 2 : -1,
  };
}

/** Project analysis: the records on the left, the project's fields filling in on the right as each passage is read. */
export function AnalysisStage({ replay, project, step }: { replay: Replay; project: Project; step: number }) {
  const { sourcesShown, filled, active } = analysisProgress(replay, step);
  const kindOf = new Map(replay.sources.map((s) => [s.id, s.kind]));

  const marksFor = (sourceId: string): Mark[] =>
    replay.analysis
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.sourceId === sourceId)
      .map(({ item, i }) => ({ quote: item.quote, state: i === active ? "active" : i < filled ? "used" : "idle" }));

  return (
    <>
      <div className="col-span-full border-rule max-tab:border-t tab:col-span-6 tab:col-start-3 tab:border-l tab:pl-(--tm-gutter) desk:col-span-5 desk:col-start-4">
        <div className={`divide-y divide-rule ${reveal(sourcesShown)}`}>
          {replay.sources.map((source) => (
            <SourceDoc key={source.id} source={source} marks={marksFor(source.id)} />
          ))}
        </div>
      </div>

      <dl className="col-span-full divide-y divide-rule border-t border-rule tab:col-span-6 tab:col-start-3 tab:border-l tab:pl-(--tm-gutter) desk:col-span-4 desk:border-t-0">
        {replay.analysis.map((item, i) => (
          <div key={item.field} className="py-5">
            <dt className="tm-label tm-muted">{fieldLabels[item.field]}</dt>
            <dd className="mt-3">
              {i < filled ? (
                <div className={reveal(true)}>
                  <p className="tm-text--m max-w-[66ch]">{project[item.field]}</p>
                  <p className="tm-text--s tm-muted mt-1">{kindOf.get(item.sourceId)}</p>
                </div>
              ) : (
                <span className="block h-3 w-32 bg-asphalt/7" aria-label="Not read yet" />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
