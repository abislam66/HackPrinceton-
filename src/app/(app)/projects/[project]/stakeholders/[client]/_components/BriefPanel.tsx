import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import type { Client } from "@/features/project/schema";
import { NEED_LABEL, ROLE_LABEL } from "@/lib/labels";

const AGENT_OUTPUTS = [
  "Its own 3D model of the building",
  "4 to 6 drone shots framed on what they care about",
  "A pitch, problem then solution",
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="tm-label tm-muted">{label}</h3>
      <div className="tm-text--m">{children}</div>
    </section>
  );
}

/** The not-built side panel: who this is and what the agents will make for them. */
export function BriefPanel({ client }: { client: Client }) {
  return (
    <div className="flex flex-col gap-6">
      <Eyebrow>Brief</Eyebrow>
      <Row label="Who">
        {ROLE_LABEL[client.role]} · {client.company}
      </Row>
      <Row label="Contact">
        {client.contact.name}
        <span className="tm-text--s tm-muted block">{client.contact.title}</span>
      </Row>
      <Row label="Needs">
        {NEED_LABEL[client.need]}
        <p className="tm-text--s mt-2">{client.needsNotes}</p>
      </Row>
      <Row label="Cares about">
        <ul className="flex flex-col gap-2">
          {client.focusElements.map((element) => (
            <li key={element} className="flex items-start gap-3">
              <span aria-hidden className="mt-2 size-2 shrink-0 bg-asphalt" />
              <span className="min-w-0">{element}</span>
            </li>
          ))}
        </ul>
      </Row>
      <Row label="The agents will make">
        <ol className="flex flex-col gap-2">
          {AGENT_OUTPUTS.map((item, i) => (
            <li key={item} className="flex items-baseline gap-3">
              <span className="tm-label tm-num shrink-0">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ol>
      </Row>
    </div>
  );
}
