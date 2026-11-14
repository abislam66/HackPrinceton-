// Display helpers for the activity board. Pure, safe in the browser.

/** Watch time split into number and unit parts, so the numbers can be set large and the units small. "48 s", "1 m 12 s", "1 h 4 m". */
export function watchParts(totalSeconds: number): { value: number; unit: string }[] {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return [{ value: s, unit: "s" }];
  if (s < 3600) {
    const parts = [{ value: Math.floor(s / 60), unit: "m" }];
    if (s % 60) parts.push({ value: s % 60, unit: "s" });
    return parts;
  }
  const parts = [{ value: Math.floor(s / 3600), unit: "h" }];
  const m = Math.floor((s % 3600) / 60);
  if (m) parts.push({ value: m, unit: "m" });
  return parts;
}

/** Watch time as plain text, for the feed and for screen readers. */
export function watchText(totalSeconds: number): string {
  return watchParts(totalSeconds)
    .map((p) => `${p.value} ${p.unit}`)
    .join(" ");
}

/** "12 s ago", "3 min ago", "2 h ago", "4 d ago". */
export function relativeTime(iso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** The viewer's local clock time. Only call after mount: it depends on the viewer's locale and time zone. */
export function clockTime(iso: string): string {
  return clock.format(new Date(iso));
}

/** The detail column of a feed row. */
export function eventDetail(type: string, payload: Record<string, string | number | boolean>): string {
  if (type === "watch") {
    const seconds = payload.seconds;
    return typeof seconds === "number" && Number.isFinite(seconds) ? watchText(seconds) : "";
  }
  if (type === "click") {
    const target = payload.target;
    if (typeof target !== "string") return "";
    if (target === "book-a-call") return "Book a call";
    if (target.startsWith("shot:")) return `Shot: ${target.slice(5)}`;
    return target;
  }
  return "";
}
