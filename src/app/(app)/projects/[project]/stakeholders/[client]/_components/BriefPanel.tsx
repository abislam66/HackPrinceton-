import type { ReactNode } from "react";
import type { Client } from "@/features/project/schema";
import { NEED_LABEL, ROLE_LABEL } from "@/lib/labels";

const AGENT_OUTPUTS = [
  "Its own 3D model of the building",
  "4 to 6 drone shots framed on what they care about",
  "A pitch, problem then solution",
];

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs leading-4 text-muted">{label}</dt>
      <dd className="text-sm leading-5">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-divider px-5 py-4">
      <h3 className="app-h-section">{title}</h3>
      {children}
    </section>
  );
}

/** The not-built side panel's body: who this is and what the agents will make for them. Sits under a "Brief" header. */
export function BriefPanel({ client }: { client: Client }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <dl className="flex flex-col gap-4 px-5 py-4">
        <Fact label="Who">
          {ROLE_LABEL[client.role]} · {client.company}
        </Fact>
        <Fact label="Contact">
          {client.contact.name}
          <span className="block text-[13px] leading-[18px] text-muted">{client.contact.title}</span>
        </Fact>
        <Fact label="Needs">
          {NEED_LABEL[client.need]}
          <span className="mt-1 block text-[13px] leading-5 text-pretty text-muted">{client.needsNotes}</span>
        </Fact>
      </dl>

      <Section title="Cares about">
        <ul className="flex flex-col gap-2 text-sm leading-5">
          {client.focusElements.map((element) => (
            <li key={element} className="flex items-start gap-3">
              <span aria-hidden className="mt-2 size-1 shrink-0 bg-muted" />
              <span className="min-w-0">{element}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="The agents will make">
        <ol className="flex flex-col gap-2 text-sm leading-5">
          {AGENT_OUTPUTS.map((item, i) => (
            <li key={item} className="flex items-baseline gap-3">
              <span className="app-num shrink-0 text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
