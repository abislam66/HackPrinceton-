import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

/** A full-width table: 12 px muted sentence-case headers, 40 px rows, dividers between rows. Put it in a flush `Panel`. */
export function Table({ className, ...rest }: ComponentProps<"table">) {
  return <table className={cx("app-table", className)} {...rest} />;
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

/** A body cell. `num` sets it in right-aligned mono tabular figures. */
export function TD({ num, ...rest }: ComponentProps<"td"> & { num?: boolean }) {
  return <td data-num={num ? "" : undefined} {...rest} />;
}
