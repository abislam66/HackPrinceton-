"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { KeyboardEvent, ReactNode } from "react";
import { cx } from "@/lib/cx";

export type MediaListProps = {
  children: ReactNode;
  /** `ol` when the order means something (a shot list, build steps). */
  as?: "ul" | "ol";
  /** Names the list for screen readers when nothing visible does. */
  label?: string;
  className?: string;
};

/**
 * A list of `MediaRow`s with dividers between them. ↑ and ↓ (and Home, End) move focus between rows that are
 * targets. Put it in a flush `Panel`.
 */
export function MediaList({ children, as: List = "ul", label, className }: MediaListProps) {
  return (
    <List aria-label={label} className={cx("app-rows", className)} onKeyDown={moveFocus}>
      {children}
    </List>
  );
}

export type MediaRowProps = {
  /** The leading visual, drawn from real data: a `CameraPathPlan`, an `ElevationGlyph` or an `Avatar`. */
  media?: ReactNode;
  /** The first line, 14 px/600. Truncates. */
  title: ReactNode;
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
 * `onClick` or `selected`, or plain (sample rows that don't open). Must sit in a `MediaList`.
 */
export function MediaRow({ media, title, meta, children, size = 64, href, onClick, selected, className }: MediaRowProps) {
  const tooltip = typeof title === "string" ? (typeof meta === "string" ? `${title}\n${meta}` : title) : undefined;
  const body = (
    <>
      {media}
      <span className="app-row-text">
        <span className="app-row-title">{title}</span>
        {meta ? <span className="app-row-meta">{meta}</span> : null}
      </span>
      {children ? <span className="app-row-end">{children}</span> : null}
    </>
  );
  const shared = { className: cx("app-row", className), "data-size": size, title: tooltip };
  const chevron = (show: boolean) => (
    <span className="app-row-chev" aria-hidden="true">
      {show ? <ChevronRight size={16} strokeWidth={1.5} /> : null}
    </span>
  );

  let row: ReactNode;
  if (href !== undefined) {
    row = (
      <Link href={href} data-row="" aria-current={selected ? "true" : undefined} {...shared}>
        {body}
        {chevron(true)}
      </Link>
    );
  } else if (onClick !== undefined || selected !== undefined) {
    row = (
      <button type="button" data-row="" aria-pressed={selected ?? false} onClick={onClick} {...shared}>
        {body}
      </button>
    );
  } else {
    // Keeps the chevron's column, so it lines up under link rows in the same list.
    row = (
      <div {...shared}>
        {body}
        {chevron(false)}
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
