import { Panel } from "@/components/ui/Panel";
import { TextLink } from "@/components/ui/TextLink";
import type { Dossier, DossierFact } from "@/features/dossier/schema";
import type { Source } from "@/lib/agent/schema";
import { FIRM_ROLE_LABEL } from "@/lib/labels";

/*
 * A researched dossier, laid out like the Dossier tab always was (building, firms, timeline, sources), now with
 * every fact citing the pages it came from. Citations are short source ids ("S3") that jump to that source in
 * the Sources panel. Pure: the board around it owns loading and re-running.
 */

type SourceMap = Map<string, Source>;

function sourceAnchor(id: string): string {
  return `source-${id}`;
}

/** The ids a fact cites, as small links to its sources. Unknown ids are dropped (the run's `keepCited` does too). */
function Cites({ ids, sources }: { ids: string[]; sources: SourceMap }) {
  const known = ids.filter((id) => sources.has(id));
  if (known.length === 0) return null;
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-baseline font-mono text-[11px] leading-4">
      {known.map((id) => (
        <a
          key={id}
          href={`#${sourceAnchor(id)}`}
          title={sources.get(id)?.title}
          aria-label={`Source ${id}: ${sources.get(id)?.title ?? ""}`}
          className="text-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-cone"
        >
          {id}
        </a>
      ))}
    </span>
  );
}

function FactList({ facts, sources }: { facts: DossierFact[]; sources: SourceMap }) {
  return (
    <dl>
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="grid gap-1 border-t border-divider px-5 py-3 @lg:grid-cols-[180px_minmax(0,1fr)] @lg:gap-6"
        >
          <dt className="text-sm text-muted">{fact.label}</dt>
          <dd className="text-sm text-pretty">
            {fact.value}
            <Cites ids={fact.sourceIds} sources={sources} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FirmsPanel({ dossier, sources }: { dossier: Dossier; sources: SourceMap }) {
  return (
    <Panel title="People and firms" count={dossier.firms.length} flush className="@container">
      <ul>
        {dossier.firms.map((firm) => (
          <li
            key={`${firm.role}-${firm.name}`}
            className="grid gap-1 border-t border-divider px-5 py-3 first:border-t-0 @lg:grid-cols-[180px_minmax(0,1fr)] @lg:gap-6"
          >
            <span className="text-sm text-muted">{FIRM_ROLE_LABEL[firm.role]}</span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm text-pretty">
                {firm.website ? (
                  <TextLink href={firm.website} target="_blank" className="font-semibold">
                    {firm.name}
                  </TextLink>
                ) : (
                  <span className="font-semibold">{firm.name}</span>
                )}
                <Cites ids={firm.sourceIds} sources={sources} />
              </span>
              {firm.scope ? <span className="text-sm text-pretty text-muted">{firm.scope}</span> : null}
              {firm.headquarters || firm.contactUrl ? (
                <span className="flex flex-wrap gap-x-3 text-xs leading-4 text-muted">
                  {firm.headquarters ? <span>{firm.headquarters}</span> : null}
                  {firm.contactUrl ? (
                    <TextLink href={firm.contactUrl} target="_blank">
                      Contact page
                    </TextLink>
                  ) : null}
                </span>
              ) : null}
            </span>
          </li>
        ))}
        {dossier.missingRoles.map((role) => (
          <li
            key={`missing-${role}`}
            className="grid gap-1 border-t border-divider px-5 py-3 first:border-t-0 @lg:grid-cols-[180px_minmax(0,1fr)] @lg:gap-6"
          >
            <span className="text-sm text-muted">{FIRM_ROLE_LABEL[role]}</span>
            <span className="text-sm text-muted">Not confirmed by any source</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function DossierView({ dossier }: { dossier: Dossier }) {
  const sources: SourceMap = new Map(dossier.sources.map((s) => [s.id, s]));

  return (
    <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        {/* Its own container, so the list sets label beside value by the panel's width, not the page's. */}
        <Panel title="Building" flush className="@container">
          <p className="max-w-[66ch] p-5 text-sm leading-[22px] text-pretty">
            {dossier.summary.text}
            <Cites ids={dossier.summary.sourceIds} sources={sources} />
          </p>
          <FactList facts={dossier.building} sources={sources} />
        </Panel>

        <FirmsPanel dossier={dossier} sources={sources} />
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Panel title="Timeline" flush>
          <ol className="app-rows">
            {dossier.timeline.map((item) => (
              <li key={`${item.when}-${item.what}`} className="flex gap-4 px-5 py-3 text-sm">
                <span className="app-num w-28 shrink-0 text-muted">{item.when}</span>
                <span className="min-w-0 text-pretty">
                  {item.what}
                  <Cites ids={item.sourceIds} sources={sources} />
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Sources" count={dossier.sources.length} flush>
          <ol className="app-rows">
            {dossier.sources.map((source) => (
              <li
                key={source.id}
                id={sourceAnchor(source.id)}
                className="flex scroll-mt-6 gap-3 px-5 py-3 target:bg-stucco"
              >
                <span className="w-7 shrink-0 font-mono text-xs leading-5 text-muted">{source.id}</span>
                <span className="flex min-w-0 flex-col gap-1">
                  <TextLink href={source.url} target="_blank" className="text-sm break-words text-pretty">
                    {source.title || source.publisher}
                  </TextLink>
                  <span className="text-xs text-muted">
                    {source.publisher}
                    {source.pageAge ? ` · ${source.pageAge}` : null}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
