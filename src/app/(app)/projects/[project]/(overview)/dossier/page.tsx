import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { TextLink } from "@/components/ui/TextLink";
import { DOSSIER_FACTS, NOT_CONFIRMED, SOURCES, TIMELINE } from "@/features/demo/building";
import { loadProjectFacts } from "@/features/project-agent/store";
import { cx } from "@/lib/cx";

export default async function DossierPage({ params }: PageProps<"/projects/[project]/dossier">) {
  const { project: slug } = await params;
  // A project opened from a draft shares the base project's building, so the dossier is the same.
  const project = await loadProjectFacts(slug);
  if (!project) notFound();

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
                <TextLink href={source.url} target="_blank" className="text-sm text-pretty">
                  {source.title}
                </TextLink>
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
