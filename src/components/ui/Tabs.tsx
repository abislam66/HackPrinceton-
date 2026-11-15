import Link from "next/link";
import { cx } from "@/lib/cx";

export type TabItem = {
  label: string;
  /** A route or query string: tabs here are views of one page, kept in the URL. */
  href: string;
  active: boolean;
  /** How many things the view holds, in mono after the label. */
  count?: number;
};

export type TabsProps = {
  items: TabItem[];
  /** Names the navigation for screen readers: "Project sections", "Outreach". */
  label?: string;
  /** Full width with equal segments, for the 360 px side panel. Otherwise each segment fits its label. */
  full?: boolean;
  className?: string;
};

/**
 * Segmented tabs: a 32 px track at 6 % Asphalt; the active segment is Sheet with a hairline. Each tab is a `Link`,
 * the active one `aria-current="page"`, because the views are routes and query params, not local state.
 * No slide: the page changes under it, so the active segment simply moves.
 */
export function Tabs({ items, label = "Sections", full = false, className }: TabsProps) {
  return (
    <nav aria-label={label} className={cx("app-tabs", full && "app-tabs--full", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className="app-tab"
        >
          <span className="app-tab-label">{item.label}</span>
          {item.count === undefined ? null : (
            <>
              <span className="sr-only">, </span>
              <span className="app-tab-count">{item.count}</span>
            </>
          )}
        </Link>
      ))}
    </nav>
  );
}
