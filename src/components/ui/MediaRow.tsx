"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";

/** Whether the rows' trailing slot has a fixed width, so a row with nothing trailing still keeps the slot. */
const FixedTrailing = createContext(false);

export type MediaListProps = {
  children: ReactNode;
  /** `ol` when the order means something (a shot list, build steps). */
  as?: "ul" | "ol";
  /** Names the list for screen readers when nothing visible does. */
  label?: string;
  /**
   * Fixes every row's trailing slot to this many px, its content starting at the slot's left edge, so tags of
   * different lengths line up down the list. Set it to the widest status the list can show.
   */
  trailingWidth?: number;
  className?: string;
};

/**
 * A list of `MediaRow`s with dividers between them. ↑ and ↓ (and Home, End) move focus between rows that are
 * targets. Put it in a flush `Panel`.
 */
export function MediaList({ children, as: List = "ul", label, trailingWidth, className }: MediaListProps) {
  const style = trailingWidth === undefined ? undefined : ({ "--app-row-end-width": `${trailingWidth}px` } as CSSProperties);
  return (
    <List
      aria-label={label}
      className={cx("app-rows", className)}
      data-trailing={trailingWidth === undefined ? undefined : "fixed"}
      style={style}
      onKeyDown={moveFocus}
    >
      <FixedTrailing.Provider value={trailingWidth !== undefined}>{children}</FixedTrailing.Provider>
    </List>
  );
}

export type MediaRowProps = {
  /** The leading visual, drawn from real data: a `CameraPathPlan`, an `ElevationGlyph` or an `Avatar`. */
  media?: ReactNode;
  /** The first line, 14 px/600. Also the row's tooltip, so a clamped title can still be read in full. */
  title: ReactNode;
  /** How many lines the title takes before it truncates: 1 (default), or 2 for long names in a 72 px shot row. */
  titleLines?: 1 | 2;
  /** The second line, 12 px muted. Truncates. */
  meta?: ReactNode;
  /** Trailing content: a figure, a `Tag`, a count. Never a control: the whole row is the target. */
  children?: ReactNode;
  /** 64 px (default) for projects and stakeholders; 72 px for shots, whose plan is 48 px tall. */
  size?: 64 | 72;
  /** The row opens this page. Link rows end in a chevron. */
  href?: string;
  /** The row selects something in place (a shot): it renders as a `button` with `aria-pressed`. */
  onClick?: () => void;
  /** Selected: a Stucco fill and a 2 px Cone bar. On a button row this is `aria-pressed`; on a link, `aria-current`. */
  selected?: boolean;
  className?: string;
};

/**
 * One two-line row, led by a visual. The whole row is the target: a `Link` with `href`, a `button aria-pressed` with
 * `onClick` or `selected`. With none of them it is static (a sample that doesn't open, a deliverable): no hover and
 * no chevron. Beside rows that open, a static row is muted and keeps the chevron's column, so trailing content
 * lines up; in a list where nothing opens, it keeps its ink and the column goes. Must sit in a `MediaList`.
 */
export function MediaRow({
  media,
  title,
  titleLines = 1,
  meta,
  children,
  size = 64,
  href,
  onClick,
  selected,
  className,
}: MediaRowProps) {
  const fixedTrailing = useContext(FixedTrailing);
  const tooltip = typeof title === "string" ? (typeof meta === "string" ? `${title}\n${meta}` : title) : undefined;
  const body = (
    <>
      {media}
      <span className="app-row-text">
        <span className="app-row-title" data-lines={titleLines === 2 ? 2 : undefined}>
          {title}
        </span>
        {meta ? <span className="app-row-meta">{meta}</span> : null}
      </span>
      {children || fixedTrailing ? <span className="app-row-end">{children}</span> : null}
    </>
  );
  const shared = { className: cx("app-row", className), "data-size": size, title: tooltip };
  const chevron = (
    <span className="app-row-chev" aria-hidden="true">
      <ChevronRight size={16} strokeWidth={1.5} />
    </span>
  );

  let row: ReactNode;
  if (href !== undefined) {
    row = (
      <Link href={href} data-row="" aria-current={selected ? "true" : undefined} {...shared}>
        {body}
        {chevron}
      </Link>
    );
  } else if (onClick !== undefined || selected !== undefined) {
    row = (
      <button type="button" data-row="" aria-pressed={selected ?? false} onClick={onClick} {...shared}>
        {body}
      </button>
    );
  } else {
    // The empty chevron column shows only beside link rows (controls.css), so trailing content lines up with theirs.
    row = (
      <div data-static="" {...shared}>
        {body}
        <span className="app-row-chev" aria-hidden="true" />
      </div>
    );
  }
  return <li>{row}</li>;
}

/** ↑ and ↓ (and Home, End) move focus between a list's row targets. */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (step === undefined && event.key !== "Home" && event.key !== "End") return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-row]"));
  const at = items.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : at + (step ?? 0);
  items[Math.min(items.length - 1, Math.max(0, next))]?.focus();
}
