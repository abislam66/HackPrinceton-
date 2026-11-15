import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export type TagVariant = "line" | "ink" | "cone" | "quiet" | "go" | "halt";

export type TagProps = {
  children: ReactNode;
  /**
   * Every tag is framed in Concrete; the variant sets a leading 8 px square and the text weight.
   * `line` (default): no square, Asphalt text, for categories, counts and filters.
   * `ink`: an Asphalt square, for a state that is set (Ready to send, In outreach).
   * `quiet`: no square, Mortar text, for not-started or inactive items (Not built, Sample, Waiting).
   * `cone`: a Cone square, only while the agents run. `go` and `halt`: pass and fail only.
   */
  variant?: TagVariant;
  /** Blink the square (for `cone`, while running). Still under reduced motion. */
  pulse?: boolean;
  className?: string;
};

const SQUARE: Record<TagVariant, string | null> = {
  line: null,
  ink: "bg-asphalt",
  cone: "bg-cone",
  quiet: null,
  go: "bg-go",
  halt: "bg-halt",
};

/** A small mono caps tag: a state, a category, a count. Not clickable; a clickable option is a Cell. Styles in src/styles/app/controls.css. */
export function Tag({ children, variant = "line", pulse = false, className }: TagProps) {
  const square = SQUARE[variant];
  return (
    <span className={cx("app-tag", variant !== "quiet" && "app-tag--strong", className)}>
      {square ? (
        <span aria-hidden="true" className={cx("app-tag__sq", square, pulse && "motion-safe:animate-pulse")} />
      ) : null}
      {children}
    </span>
  );
}
