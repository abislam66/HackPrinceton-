import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export type Stat = {
  label: string;
  /** A measurement, set in 20 px mono. Empty or null shows a dash, read as "Not confirmed". */
  value: ReactNode;
};

export type StatStripProps = {
  items: Stat[];
  /** Names the list for screen readers: "Key facts", "Engagement". */
  label?: string;
  className?: string;
};

/**
 * Measurements in a row, divided by hairlines: a 12 px muted label over a 20 px mono value. Each cell is sized to its
 * content and shares the spare width, so "92 m (302 ft)" never runs into the next divider. No outer border: it sits
 * inside a `Panel`; add `border-t border-divider` where it follows other content.
 */
export function StatStrip({ items, label, className }: StatStripProps) {
  return (
    <dl aria-label={label} className={cx("app-stats", className)}>
      {items.map((item) => (
        <StatCell key={item.label} {...item} />
      ))}
    </dl>
  );
}

/** One cell of a StatStrip. */
function StatCell({ label, value, className }: Stat & { className?: string }) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className={cx("app-stat", className)}>
      <dt className="app-stat-label">{label}</dt>
      <dd className={cx("app-stat-value", missing && "app-missing")}>
        {missing ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not confirmed</span>
          </>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
