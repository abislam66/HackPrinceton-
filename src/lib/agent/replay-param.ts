/**
 * Reads a screen's `?replay=1&speed=N` so its live runs replay the last recorded run instead of researching. For
 * rehearsing the demo and for showing a run without a key. Speed defaults to 2 (a recorded run plays twice as fast).
 */
export function replayFrom(query: Record<string, string | string[] | undefined>): { speed: number } | null {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  if (first(query.replay) !== "1") return null;
  const speed = Number(first(query.speed) ?? "2");
  return { speed: Number.isFinite(speed) && speed > 0 ? speed : 2 };
}
