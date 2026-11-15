import { Fragment, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export type TagTone = "neutral" | "ready" | "running" | "pass" | "fail";

export type TagProps = {
  /** The status in words; the fill only reinforces it. Digits are set in mono tabular figures. */
  children: ReactNode;
  /**
   * `neutral` (default): not started or waiting (Not built, Queued, Sent · not opened).
   * `ready`: a state that is set (Ready to send, In outreach). `running`: only while agents work; it breathes.
   * `pass` and `fail`: outcomes only (Done, Opened, Failed).
   */
  tone?: TagTone;
  className?: string;
};

/** "Opened · 12" → the words in Geist, the 12 in Geist Mono tabular. */
function withMonoDigits(text: string): ReactNode {
  return text.split(/(\d+)/).map((part, i) =>
    /^\d+$/.test(part) ? (
      <span key={i} className="app-num">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/**
 * A status: a 22 px block filled with its tone, 12 px text. Not clickable (a filter is a `FilterChip`), and only for
 * states, never for categories. Adapts on the Asphalt viewer.
 */
export function Tag({ children, tone = "neutral", className }: TagProps) {
  const text = typeof children === "string" || typeof children === "number" ? withMonoDigits(String(children)) : children;
  return (
    <span className={cx("app-tag", className)} data-tone={tone}>
      {/* One inline run: as bare flex items, "Opened · " would lose its trailing space before the number. */}
      <span>{text}</span>
    </span>
  );
}
