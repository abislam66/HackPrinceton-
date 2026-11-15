"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Metric } from "@/components/ui/Metric";
import type { StoredEvent } from "@/features/tracking/record";
import type { ClientSummary } from "@/features/tracking/summary";
import { formatRelative, formatWatch } from "@/features/workspace/format";

const REFRESH_MS = 5000;

function describe(event: StoredEvent): string {
  if (event.type === "open") return "Opened the proposal";
  if (event.type === "watch") {
    const seconds = Number(event.payload.seconds);
    return Number.isFinite(seconds) ? `Watched for ${Math.round(seconds)} s` : "Watched the proposal";
  }
  const target = event.payload.target;
  return typeof target === "string" && target ? `Clicked ${target}` : "Clicked a link";
}

function ActivityRow({ marker, text, at, now }: { marker: string; text: string; at: string | null; now: number }) {
  return (
    <li className="flex items-center gap-3 border-b border-rule/40 py-3 last:border-b-0">
      <span aria-hidden className={`size-2 shrink-0 ${marker}`} />
      <span className="tm-text--m min-w-0 flex-1 truncate">{text}</span>
      {at ? (
        <time dateTime={at} suppressHydrationWarning className="tm-label tm-muted tm-num shrink-0">
          {formatRelative(at, now)}
        </time>
      ) : null}
    </li>
  );
}

export function EngagementPanel({
  engagement,
  events,
  sentAt,
}: {
  engagement: ClientSummary;
  events: StoredEvent[];
  sentAt: string | null;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  // While this tab is on screen, refresh every 5 s so a live open shows up without a reload.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-2 whitespace-nowrap">
        <Metric label="Opens" value={engagement.opens} />
        <Metric label="Watch time" value={formatWatch(engagement.watchSeconds)} />
        <Metric label="Clicks" value={engagement.clicks} />
      </div>

      <section className="flex flex-col gap-2">
        <Eyebrow>Activity</Eyebrow>
        {events.length === 0 ? (
          <p className="tm-text--s tm-muted py-2">Not opened yet. Opens show up here within a few seconds.</p>
        ) : null}
        <ol className="flex flex-col">
          {events.map((event) => (
            <ActivityRow key={event.id} marker="bg-asphalt" text={describe(event)} at={event.createdAt} now={now} />
          ))}
          <ActivityRow marker="border border-rule" text="Sent" at={sentAt} now={now} />
        </ol>
      </section>
    </div>
  );
}
