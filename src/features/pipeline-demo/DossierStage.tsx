import { Heading } from "@/components/Heading";
import { Tag } from "@/components/Tag";
import type { Client } from "@/features/project/schema";
import { plain, reveal } from "./reveal";
import type { Replay } from "./schema";
import { SourceDoc, type Mark } from "./SourceDoc";

/** Delay before each step: each firm is found in a record, then its contact attaches, then the last highlight settles. */
export const dossierDelays = (firms: number) => [600, ...Array.from({ length: firms * 2 - 1 }, (_, i) => (i % 2 === 0 ? 800 : 1000)), 1000];

export function dossierProgress(replay: Replay, step: number) {
  const firms = replay.dossier.length;
  const found = Math.min(Math.ceil(step / 2), firms);
  const contacts = Math.min(Math.floor(step / 2), firms);
  return { found, contacts, active: step >= 1 && step <= firms * 2 ? Math.ceil(step / 2) - 1 : -1 };
}

/** Dossier: firms named in the same records, each turned into a client with a contact. */
export function DossierStage({ replay, clients, step }: { replay: Replay; clients: Client[]; step: number }) {
  const { found, contacts, active } = dossierProgress(replay, step);
  const byId = new Map(clients.map((c) => [c.id, c]));

  const marksFor = (sourceId: string): Mark[] =>
    replay.dossier
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.sourceId === sourceId)
      .map(({ item, i }) => ({ quote: item.quote, state: i === active ? "active" : i < found ? "used" : "idle" }));

  return (
    <>
      <div className="col-span-full divide-y divide-rule border-rule max-tab:border-t tab:col-span-6 tab:col-start-3 tab:border-l tab:pl-(--tm-gutter) desk:col-span-5 desk:col-start-4">
        {replay.sources.map((source) => (
          <SourceDoc key={source.id} source={source} marks={marksFor(source.id)} />
        ))}
      </div>

      <ul className="col-span-full divide-y divide-rule border-t border-rule tab:col-span-6 tab:col-start-3 tab:border-l tab:pl-(--tm-gutter) desk:col-span-4 desk:border-t-0">
        {replay.dossier.map((item, i) => {
          const client = byId.get(item.clientId);
          if (!client) return null;
          return (
            <li key={item.clientId} className={`py-5 ${reveal(i < found)}`}>
              <Heading as="h3" size="xs">
                {client.company}
              </Heading>
              <div className="mt-3 flex flex-wrap gap-2">
                <Tag>{plain(client.role)}</Tag>
              </div>
              <p className={`tm-text--s mt-3 ${reveal(i < contacts)}`}>
                {client.contact.name}, {client.contact.title}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
