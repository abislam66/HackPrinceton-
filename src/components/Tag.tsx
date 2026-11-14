import type { ReactNode } from "react";

type Variant = "line" | "ink" | "cone" | "quiet" | "go" | "halt";

type Props = {
  children: ReactNode;
  /**
   * `line` is the default. `ink` marks the current item. `cone` marks the one thing to see first.
   * `quiet` is for inactive items. `go` and `halt` mean pass and fail only.
   */
  variant?: Variant;
  className?: string;
};

/** A small mono caps tag: a state, a category, a count. Not clickable; a clickable option is a Cell. */
export function Tag({ children, variant = "line", className }: Props) {
  return <span className={["tm-tag", `tm-tag--${variant}`, className ?? ""].filter(Boolean).join(" ")}>{children}</span>;
}
