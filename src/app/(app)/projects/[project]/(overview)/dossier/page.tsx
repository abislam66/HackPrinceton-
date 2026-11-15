import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Tag } from "@/components/ui/Tag";
import {
  BUILDING_FACTS,
  NOT_CONFIRMED,
  PEOPLE_AND_FIRMS,
  SOURCES,
  TIMELINE,
  type Fact,
} from "@/features/demo/building";
import { loadProject } from "@/features/project/load";
import { cx } from "@/lib/cx";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-6 p-5">
      <Eyebrow>{title}</Eyebrow>
      {children}
    </Card>
  );
}

function FactList({ facts }: { facts: Fact[] }) {
  return (
    <dl className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-6 gap-y-3">
      {facts.map((fact) => (
        <div key={fact.label} className="contents">
          <dt className="tm-label tm-muted pt-0.5">{fact.label}</dt>
          <dd className={cx("tm-text--m tm-num", fact.value === NOT_CONFIRMED && "tm-muted")}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function DossierPage() {
  const project = await loadProject();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <p className="tm-text--s tm-muted">Research the agent gathered from public sources</p>
        <span title="Layout is a sample; facts are from public sources" className="inline-flex">
          <Tag variant="quiet">Sample</Tag>
        </span>
      </div>

      <Section title="Building">
        <p className="tm-body max-w-[66ch]">{project.summary}</p>
        <FactList facts={BUILDING_FACTS} />
      </Section>

      <Section title="People and firms">
        <FactList facts={PEOPLE_AND_FIRMS} />
      </Section>

      <Section title="Timeline">
        <ol className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-6 gap-y-3">
          {TIMELINE.map((item) => (
            <li key={item.when} className="contents">
              <span className="tm-label tm-muted tm-num pt-0.5">{item.when}</span>
              <span className="tm-text--m">{item.what}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Sources">
        <ol className="flex flex-col gap-3">
          {SOURCES.map((source, i) => (
            <li key={source.url} className="flex items-baseline gap-4">
              <span className="tm-label tm-muted tm-num w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
              <span className="tm-text--m min-w-0">
                <span className="tm-muted">{source.publisher}, </span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-4 hover:underline"
                >
                  {source.title}
                </a>
                {source.year ? <span className="tm-muted tm-num"> ({source.year})</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
