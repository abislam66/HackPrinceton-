import { ArrowUpRight } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { NOT_CONFIRMED, SOURCES, TIMELINE } from "@/features/demo/building";
import { loadProject } from "@/features/project/load";
import { cx } from "@/lib/cx";
import { DOSSIER_FACTS } from "../facts";

export default async function DossierPage() {
  const project = await loadProject();

  return (
    <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* Its own container, so the list sets label beside value by the panel's width, not the page's. */}
      <Panel title="Building" flush className="@container">
        <p className="max-w-[66ch] p-5 text-sm leading-[22px] text-pretty">{project.summary}</p>
        <dl>
          {DOSSIER_FACTS.map((fact) => (
            <div
              key={fact.label}
              className="grid gap-1 border-t border-divider px-5 py-3 @lg:grid-cols-[180px_minmax(0,1fr)] @lg:gap-6"
            >
              <dt className="text-sm text-muted">{fact.label}</dt>
              <dd className={cx("text-sm text-pretty", fact.value === NOT_CONFIRMED && "text-muted")}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="flex min-w-0 flex-col gap-6">
        <Panel title="Timeline" flush>
          <ol className="app-rows">
            {TIMELINE.map((item) => (
              <li key={item.when} className="flex gap-4 px-5 py-3 text-sm">
                <span className="app-num w-28 shrink-0 text-muted">{item.when}</span>
                <span className="min-w-0">{item.what}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Sources" count={SOURCES.length} flush>
          <ol className="app-rows">
            {SOURCES.map((source) => (
              <li key={source.url} className="flex flex-col gap-1 px-5 py-3">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-pretty underline decoration-hairline underline-offset-[3px] transition-[text-decoration-color] duration-150 ease-out hover:decoration-current"
                >
                  {source.title}
                  <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden className="ml-0.5 inline align-[-2px]" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                <span className="text-xs text-muted">
                  {source.publisher}
                  {source.year ? (
                    <>
                      {" · "}
                      <span className="app-num">{source.year}</span>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
