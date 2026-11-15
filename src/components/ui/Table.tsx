import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

/** A full-width table. Put it in a `Card` for the Sheet ground and frame. */
export function Table({ className, ...rest }: ComponentProps<"table">) {
  return <table className={cx("w-full border-collapse text-left", className)} {...rest} />;
}

/** Header row group on Stucco. */
export function THead({ className, ...rest }: ComponentProps<"thead">) {
  return <thead className={cx("bg-stucco", className)} {...rest} />;
}

/** A header cell: mono caps, muted. */
export function TH({ className, num, ...rest }: ComponentProps<"th"> & { num?: boolean }) {
  return (
    <th
      scope="col"
      className={cx("tm-label tm-muted px-5 py-3 font-medium", num ? "text-right" : "text-left", className)}
      {...rest}
    />
  );
}

/** A body row with a `rule/40` line above it. */
export function TR({ className, ...rest }: ComponentProps<"tr">) {
  return <tr className={cx("border-t border-rule/40", className)} {...rest} />;
}

/** A body cell. `num` right-aligns it with tabular figures. */
export function TD({ className, num, ...rest }: ComponentProps<"td"> & { num?: boolean }) {
  return (
    <td className={cx("tm-text--m px-5 py-4 align-middle", num && "tm-num text-right", className)} {...rest} />
  );
}
