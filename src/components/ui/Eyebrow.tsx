import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** The square marker at the far end. Off when the label sits inline with other text. */
  square?: boolean;
  className?: string;
};

/**
 * The label above a heading: Geist Mono caps with a square marker.
 * It adds what the heading does not say. A label that repeats the heading under it is cut.
 */
export function Eyebrow({ children, square = true, className }: Props) {
  return (
    <div className={["tm-eyebrow", className ?? ""].filter(Boolean).join(" ")}>
      <span className="tm-label">{children}</span>
      {square ? <span className="tm-eyebrow__square" aria-hidden="true" /> : null}
    </div>
  );
}
