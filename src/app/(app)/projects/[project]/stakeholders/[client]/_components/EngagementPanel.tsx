"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StatStrip } from "@/components/ui/StatStrip";
import type { StoredEvent } from "@/features/tracking/record";
import type { ClientSummary } from "@/features/tracking/summary";
import { formatRelative, formatWatch } from "@/features/workspace/format";
import { cx } from "@/lib/cx";

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

function ActivityRow({ text, at, now, muted }: { text: string; at: string | null; now: number; muted?: boolean }) {
  return (
    <li className="flex items-baseline gap-3 px-5 py-3">
      <span className={cx("min-w-0 flex-1 truncate text-sm leading-5", muted && "text-muted")}>{text}</span>
      {at ? (
        <time dateTime={at} suppressHydrationWarning className="app-num shrink-0 text-xs leading-4 text-muted">
          {formatRelative(at, now)}
        </time>
      ) : null}
    </li>
  );
}

/** The side panel's Engagement view, under the tabs: three figures, then every event, newest first. */
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
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Cells size to their values and share the spare width, so "12m 48s" stays on one line in 360 px. */}
      <StatStrip
        label="Engagement"
        items={[
          { label: "Opens", value: engagement.opens },
          { label: "Watch time", value: formatWatch(engagement.watchSeconds) },
          { label: "Clicks", value: engagement.clicks },
        ]}
      />

      <section className="border-t border-divider">
        <h3 className="app-h-section px-5 pt-4 pb-1">Activity</h3>
        {events.length === 0 ? (
          <p className="px-5 pt-1 text-[13px] leading-[18px] text-pretty text-muted">
            Not opened yet. Opens show up here within a few seconds.
          </p>
        ) : null}
        <ol className="divide-y divide-divider pb-1">
          {events.map((event) => (
            <ActivityRow key={event.id} text={describe(event)} at={event.createdAt} now={now} />
          ))}
          <ActivityRow text="Sent" at={sentAt} now={now} muted />
        </ol>
      </section>
    </div>
  );
}
