import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export type MetricProps = {
  label: string;
  value: ReactNode;
  className?: string;
};

/** A mono caps label over a big tabular readout, on a Stucco inset. */
export function Metric({ label, value, className }: MetricProps) {
  return (
    <div className={cx("flex flex-col gap-2 bg-stucco p-4", className)}>
      <span className="tm-label tm-muted">{label}</span>
      <span className="tm-h tm-h--xs tm-num">{value}</span>
    </div>
  );
}
