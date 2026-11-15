import type { StoredEvent } from "./record";

export type ClientSummary = {
  opens: number;
  watchSeconds: number;
  clicks: number;
  lastAt: string | null;
  highIntent: boolean;
};

export const EMPTY_SUMMARY: ClientSummary = {
  opens: 0,
  watchSeconds: 0,
  clicks: 0,
  lastAt: null,
  highIntent: false,
};

/** Totals per client: opens, watch time, clicks, last activity, and whether it looks like high intent. */
export function summarizeEvents(events: StoredEvent[]): Record<string, ClientSummary> {
  const byClient: Record<string, ClientSummary> = {};
  for (const event of events) {
    const s = (byClient[event.clientId] ??= { ...EMPTY_SUMMARY });
    if (event.type === "open") s.opens += 1;
    else if (event.type === "click") s.clicks += 1;
    else if (event.type === "watch") {
      const seconds = event.payload.seconds;
      if (typeof seconds === "number" && Number.isFinite(seconds)) s.watchSeconds += seconds;
    }
    if (!s.lastAt || Date.parse(event.createdAt) > Date.parse(s.lastAt)) s.lastAt = event.createdAt;
  }
  for (const s of Object.values(byClient)) {
    s.highIntent = s.clicks >= 1 || s.opens >= 2 || s.watchSeconds >= 45;
  }
  return byClient;
}
