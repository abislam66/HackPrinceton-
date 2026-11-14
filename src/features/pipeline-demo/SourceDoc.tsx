import type { Source } from "./schema";

export type MarkState = "idle" | "active" | "used";
export type Mark = { quote: string; state: MarkState };

const markClass: Record<MarkState, string> = {
  idle: "bg-transparent text-ink",
  active: "bg-cone text-asphalt",
  used: "bg-asphalt/7 text-ink",
};

/** Split the text around each quote so every quote can carry its own highlight. Quotes do not overlap. */
function segments(text: string, marks: Mark[]) {
  const found = marks
    .map((mark) => ({ mark, at: text.indexOf(mark.quote) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at);

  const out: { text: string; mark?: Mark }[] = [];
  let cursor = 0;
  for (const { mark, at } of found) {
    if (at < cursor) continue;
    if (at > cursor) out.push({ text: text.slice(cursor, at) });
    out.push({ text: mark.quote, mark });
    cursor = at + mark.quote.length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

/** One public record as the replay reads it: where it came from, then the passage, with the quotes it is reading marked. */
export function SourceDoc({ source, marks }: { source: Source; marks: Mark[] }) {
  return (
    <article className="py-5">
      <p className="tm-label tm-muted flex flex-wrap gap-x-4">
        <span>{source.kind}</span>
        <span>{source.publisher}</span>
        <span>{source.date}</span>
      </p>
      <p className="tm-body mt-3 max-w-[66ch]">
        {segments(source.text, marks).map((part, i) =>
          part.mark ? (
            <mark
              key={i}
              className={`-mx-1 box-decoration-clone px-1 transition-colors duration-300 ease-link motion-reduce:transition-none ${markClass[part.mark.state]}`}
            >
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
    </article>
  );
}
