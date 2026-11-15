import { cx } from "@/lib/cx";

const ELEV_W = 40;
const ELEV_H = 48;
const ELEV_GROUND = ELEV_H - 1;

const r2 = (n: number) => Math.round(n * 100) / 100;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};

/** Reads a floor count out of prose: "27-story tower…" → 27, "Six-story printing plant…" → 6, "42 townhomes" → null. */
export function floorsFromText(text: string): number | null {
  const match = text.match(/\b(\d+|[a-z]+)[-\s]stor(?:y|ey|ies)\b/i);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const n = /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word];
  return n && n > 0 ? n : null;
}

export type ElevationGlyphProps = {
  /** Above-ground floors. Null when unknown: an empty frame. */
  floors: number | null;
  className?: string;
};

/**
 * A 40×48 elevation: one hairline bar per floor at a fixed pitch, so heights compare down a list. Leads Discover and
 * project rows. Read as "27 floors".
 */
export function ElevationGlyph({ floors, className }: ElevationGlyphProps) {
  const pitch = floors ? Math.min(1.6, (ELEV_GROUND - 3) / floors) : 0;
  return (
    <svg
      className={cx("app-elev", className)}
      width={ELEV_W}
      height={ELEV_H}
      viewBox={`0 0 ${ELEV_W} ${ELEV_H}`}
      role="img"
      aria-label={floors ? `${floors} floors` : "Floor count unknown"}
    >
      {floors
        ? Array.from({ length: floors }, (_, i) => (
            <rect key={i} x={10} y={r2(ELEV_GROUND - (i + 1) * pitch)} width={20} height={r2(pitch / 2)} />
          ))
        : null}
    </svg>
  );
}
