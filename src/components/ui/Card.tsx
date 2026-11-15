import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

export type CardProps = ComponentProps<"section">;

/** A Sheet panel with a 1 px `rule/40` frame. Square, no shadow, no padding: pass it in (`p-5` as a panel). */
export function Card({ className, ...rest }: CardProps) {
  return <section className={cx("border border-rule/40 bg-sheet", className)} {...rest} />;
}
