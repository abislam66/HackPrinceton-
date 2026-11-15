/** Display helpers for the stakeholder workspace. Pure, safe on server and client. */

/** 9 → "0:09", 75 → "1:15". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 102 → "1m 42s", 42 → "42s". */
export function formatWatch(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** "Nov 15". */
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}

/** "Just now", "4 min ago", "3 h ago", "Yesterday", else "Nov 15". */
export function formatRelative(iso: string, now: number): string {
  const diff = Math.max(0, now - Date.parse(iso)) / 1000;
  if (diff < 45) return "Just now";
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))} min ago`;
  if (diff < 86_400) return `${Math.round(diff / 3600)} h ago`;
  if (diff < 172_800) return "Yesterday";
  return formatDay(iso);
}

/** "14:02:07", for log lines. */
export function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString("en-GB", { hour12: false });
}

const SIDE_LABEL = { north: "North face", east: "East face", south: "South face", west: "West face" } as const;

export function sideLabel(side: keyof typeof SIDE_LABEL): string {
  return SIDE_LABEL[side];
}
