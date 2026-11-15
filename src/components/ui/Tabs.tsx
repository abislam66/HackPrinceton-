import Link from "next/link";
import { cx } from "@/lib/cx";

export type TabItem = { label: string; href: string; active: boolean };

export type TabsProps = {
  items: TabItem[];
  className?: string;
};

/**
 * Link tabs drawn as framed cells, 44 px tall. The active tab is `aria-current="page"`: Sheet with a 2 px Cone bar
 * along its bottom edge. No motion on switching. Styles in src/styles/app/controls.css.
 */
export function Tabs({ items, className }: TabsProps) {
  return (
    <nav aria-label="Sections" className={cx("tm-cells", className)}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} className="app-tab">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
