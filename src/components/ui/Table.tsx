import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

export type TableProps = ComponentProps<"table"> & {
  /**
   * `compact`: 16 px between columns instead of 40, for a wide table in a narrow column (Outreach's Sent). The outer
   * cells keep the 20 px inset and rows stay 40 px.
   */
  density?: "default" | "compact";
};

/** A full-width table: 12 px muted sentence-case headers, 40 px rows, dividers between rows. Put it in a flush `Panel`. */
export function Table({ density = "default", className, ...rest }: TableProps) {
  return (
    <table
      className={cx("app-table", className)}
      data-density={density === "compact" ? "compact" : undefined}
      {...rest}
    />
  );
}

/** The header row group. No fill: the muted headers and the first divider set it apart. */
export function THead(props: ComponentProps<"thead">) {
  return <thead {...props} />;
}

/** A header cell. `num` right-aligns it over a column of numbers. */
export function TH({ num, ...rest }: ComponentProps<"th"> & { num?: boolean }) {
  return <th scope="col" data-num={num ? "" : undefined} {...rest} />;
}

/** A body row, with a divider above it. */
export function TR(props: ComponentProps<"tr">) {
  return <tr {...props} />;
}

export type TDProps = ComponentProps<"td"> & {
  /** A number: right-aligned 13 px mono tabular figures (opens, watch time). */
  num?: boolean;
  /** Data that isn't counted: left-aligned 13 px mono, never wrapping (a date, an id). `num` wins if both are set. */
  mono?: boolean;
};

/** A body cell. */
export function TD({ num, mono, ...rest }: TDProps) {
  return <td data-num={num ? "" : undefined} data-mono={mono && !num ? "" : undefined} {...rest} />;
}
