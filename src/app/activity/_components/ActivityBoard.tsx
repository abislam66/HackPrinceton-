"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/Button";
import { Eyebrow } from "@/components/Eyebrow";
import { Heading } from "@/components/Heading";
import { Tag } from "@/components/Tag";
import type { StoredEvent } from "@/features/tracking/record";
import { EMPTY_SUMMARY, summarizeEvents, type ClientSummary } from "@/features/tracking/summary";
import { clockTime, eventDetail, relativeTime, watchParts, watchText } from "./format";

export type BoardClient = { id: string; company: string };

type Props = {
  clients: BoardClient[];
  initialEvents: StoredEvent[];
};

const POLL_MS = 2000;
const FEED_SIZE = 30;
const TYPE_LABEL: Record<StoredEvent["type"], string> = { open: "Open", watch: "Watch", click: "Click" };

/* A one-second clock. The server snapshot is null, so nothing that depends on the viewer's clock is rendered on the server. */
function subscribeClock(onTick: () => void) {
  const id = window.setInterval(onTick, 1000);
  return () => window.clearInterval(id);
}
const readClock = () => Math.floor(Date.now() / 1000) * 1000;
const readServerClock = () => null;

const isEventList = (value: unknown): value is StoredEvent[] => Array.isArray(value);

/** Polls /api/track every 2 s while the tab is visible. Keeps the last good list when a poll fails. */
function useEvents(initialEvents: StoredEvent[]) {
  const [events, setEvents] = useState(initialEvents);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let timer: number | undefined;
    let inFlight: AbortController | null = null;
    let stopped = false;

    const schedule = () => {
      window.clearTimeout(timer);
      timer = undefined;
      if (!stopped && !document.hidden) timer = window.setTimeout(poll, POLL_MS);
    };

    async function poll() {
      timer = undefined;
      if (stopped || inFlight || document.hidden) return;
      const controller = new AbortController();
      inFlight = controller;
      try {
        const res = await fetch("/api/track", { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        const next = (data as { events?: unknown } | null)?.events;
        if (!isEventList(next)) throw new Error("Bad response");
        setEvents((prev) => (prev.length === next.length && prev[0]?.id === next[0]?.id ? prev : next));
        setOnline(true);
      } catch {
        if (controller.signal.aborted) return;
        setOnline(false);
      } finally {
        if (inFlight === controller) inFlight = null;
      }
      schedule();
    }

    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        timer = undefined;
      } else if (!inFlight) {
        window.clearTimeout(timer);
        void poll();
      }
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      inFlight?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { events, online };
}

type Row = { client: BoardClient; summary: ClientSummary };

const lastMs = (s: ClientSummary) => (s.lastAt ? Date.parse(s.lastAt) : -Infinity);

/** Flagged first, then most recent activity, then company name. */
function sortRows(rows: Row[]): string[] {
  return [...rows]
    .sort(
      (a, b) =>
        Number(b.summary.highIntent) - Number(a.summary.highIntent) ||
        lastMs(b.summary) - lastMs(a.summary) ||
        a.client.company.localeCompare(b.client.company),
    )
    .map((r) => r.client.id);
}

function mostRecent(rows: Row[]): string | null {
  let best: Row | null = null;
  for (const row of rows) {
    if (row.summary.lastAt && (!best || lastMs(row.summary) > lastMs(best.summary))) best = row;
  }
  return best ? best.client.id : null;
}

export function ActivityBoard({ clients, initialEvents }: Props) {
  const { events, online } = useEvents(initialEvents);
  const now = useSyncExternalStore(subscribeClock, readClock, readServerClock);

  const summaries = summarizeEvents(events);
  const rows: Row[] = clients.map((client) => ({ client, summary: summaries[client.id] ?? EMPTY_SUMMARY }));
  const byId = new Map(rows.map((r) => [r.client.id, r]));
  const companyOf = new Map(clients.map((c) => [c.id, c.company]));

  // Reorder only when the flag set changes or a different client becomes the most recent,
  // so rows stay put while someone reads them.
  const flagged = rows.filter((r) => r.summary.highIntent);
  const signature = `${flagged.map((r) => r.client.id).sort().join(",")}|${mostRecent(rows) ?? ""}|${clients.map((c) => c.id).join(",")}`;
  const [order, setOrder] = useState(() => ({ signature, ids: sortRows(rows) }));
  if (order.signature !== signature) setOrder({ signature, ids: sortRows(rows) });
  const ordered = order.ids.map((id) => byId.get(id)).filter((r): r is Row => r !== undefined);

  // At most one Cone tag in a view: the flagged client with the most recent activity.
  const coneId = mostRecent(flagged);
  const feed = events.slice(0, FEED_SIZE);

  return (
    <>
      <section className="tm-wrap" aria-label="Clients">
        <div className="tm-grid border-t border-rule">
          <div className="col-span-full flex items-start justify-between gap-(--tm-gutter) py-5 tab:col-span-2 tab:flex-col tab:justify-start desk:col-span-3">
            <Eyebrow>Clients</Eyebrow>
            {online ? <Tag variant="go">Live</Tag> : <Tag variant="halt">Offline</Tag>}
          </div>
          <ul className="col-span-full divide-y divide-rule border-rule tab:col-span-6 tab:border-l desk:col-span-9">
            {ordered.map(({ client, summary }) => (
              <ClientRow
                key={client.id}
                client={client}
                summary={summary}
                flag={summary.highIntent ? (client.id === coneId ? "cone" : "ink") : null}
                now={now}
              />
            ))}
          </ul>
        </div>
      </section>

      <section className="tm-wrap" aria-label="Latest events">
        <div className="tm-grid border-t border-rule">
          <div className="col-span-full py-5 tab:col-span-2 desk:col-span-3">
            <Eyebrow>Latest</Eyebrow>
          </div>
          <div className="col-span-full border-rule tab:col-span-6 tab:border-l desk:col-span-9">
            {feed.length === 0 ? (
              <p className="tm-text--m py-6 tab:pl-(--tm-gutter)">No activity yet. Open a proposal link to see it here.</p>
            ) : (
              <ol aria-live="polite" className="divide-y divide-rule">
                {feed.map((event) => (
                  <FeedRow key={event.id} event={event} company={companyOf.get(event.clientId) ?? event.clientId} mounted={now !== null} />
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function ClientRow({ client, summary, flag, now }: { client: BoardClient; summary: ClientSummary; flag: "cone" | "ink" | null; now: number | null }) {
  return (
    <li className="grid gap-y-6 py-6 tab:pl-(--tm-gutter) desk:grid-cols-[minmax(0,1fr)_auto] desk:gap-x-(--tm-gutter)">
      <div className="min-w-0">
        {flag ? (
          <Tag variant={flag} className="mb-3">
            Follow up today
          </Tag>
        ) : null}
        <Heading as="h2" size="xs" className="break-words">
          {client.company}
        </Heading>
        <p className="tm-text--s tm-muted mt-2">
          {summary.lastAt ? (
            <>
              Last seen <span className="tm-num">{now === null ? "" : relativeTime(summary.lastAt, now)}</span>
            </>
          ) : (
            "Not opened"
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-(--tm-gutter) gap-y-6 desk:justify-end">
        <dl className="grid w-full grid-cols-3 gap-x-(--tm-gutter) tab:w-auto tab:grid-cols-[repeat(3,8rem)] desk:grid-cols-[repeat(3,10rem)]">
          <Readout label="Opens">{summary.opens}</Readout>
          <Readout label="Watch time" text={watchText(summary.watchSeconds)}>
            {watchParts(summary.watchSeconds).map((part, i) => (
              <span key={part.unit}>
                {i > 0 ? " " : null}
                {part.value}
                <span className="tm-text--s"> {part.unit}</span>
              </span>
            ))}
          </Readout>
          <Readout label="Clicks">{summary.clicks}</Readout>
        </dl>
        {/* The button is 40 px tall; the pseudo element widens its hit area to 48 px for touch. */}
        <Button href={`/clients/${client.id}`} compact className="relative before:absolute before:inset-x-0 before:-inset-y-1">
          Review
        </Button>
      </div>
    </li>
  );
}

function Readout({ label, text, children }: { label: string; text?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="tm-label tm-muted mt-2">{label}</dt>
      <dd className="tm-h tm-h--s tm-num whitespace-nowrap">
        {text ? (
          <>
            <span aria-hidden="true">{children}</span>
            <span className="sr-only">{text}</span>
          </>
        ) : (
          children
        )}
      </dd>
    </div>
  );
}

function FeedRow({ event, company, mounted }: { event: StoredEvent; company: string; mounted: boolean }) {
  const detail = eventDetail(event.type, event.payload);
  return (
    <li className="tm-text--m grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-x-(--tm-gutter) gap-y-2 py-4 transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none tab:grid-cols-[8rem_minmax(0,1fr)_6rem_8rem] tab:pl-(--tm-gutter)">
      <time dateTime={event.createdAt} className="tm-num tm-muted">
        {mounted ? clockTime(event.createdAt) : ""}
      </time>
      <span className="min-w-0 truncate">{company}</span>
      <span className="col-start-2 flex flex-wrap items-center gap-x-(--tm-gutter) gap-y-2 tab:contents">
        <span>
          <Tag>{TYPE_LABEL[event.type]}</Tag>
        </span>
        <span className="tm-num">{detail}</span>
      </span>
    </li>
  );
}
