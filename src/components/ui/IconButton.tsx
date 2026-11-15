"use client";

import type { ComponentProps, PointerEvent, ReactElement } from "react";
import { cx } from "@/lib/cx";

export type IconButtonProps = Omit<ComponentProps<"button">, "children" | "aria-label"> & {
  /** A lucide icon element, `<X />`. It is drawn at 16 px with a 1.5 stroke, whatever its own props say. */
  icon: ReactElement;
  /** What it does, in a few words: the accessible name and the tooltip text. Required. */
  label: string;
  /** A keyboard shortcut shown in the tooltip, as the user types it on a Mac: "⌘B", "⌘↵". */
  shortcut?: string;
  /** `tertiary` (default): a muted icon. `primary`: a Cone square, for a composer's send. */
  variant?: "tertiary" | "primary";
  /** Where the tooltip opens. Bottom by default; right on the collapsed sidebar, top at the foot of the page. */
  tooltipSide?: "bottom" | "top" | "right" | "left";
};

/*
 * Warm tooltips: the first waits 400 ms (set in CSS); once one has shown, the next opens at once until the pointer
 * has been off every icon button for 300 ms. Shared by all icon buttons, so a toolbar reads as one.
 */
const WARM_MS = 300;
const DELAY_MS = 400;
let lastShownAt = 0;

function onEnter(event: PointerEvent<HTMLButtonElement>) {
  if (event.pointerType !== "mouse") return;
  const el = event.currentTarget;
  el.dataset.enteredAt = String(Date.now());
  if (Date.now() - lastShownAt < WARM_MS) el.dataset.warm = "";
}

function onLeave(event: PointerEvent<HTMLButtonElement>) {
  const el = event.currentTarget;
  const shown = "warm" in el.dataset || Date.now() - Number(el.dataset.enteredAt ?? Date.now()) >= DELAY_MS;
  if (shown) lastShownAt = Date.now();
  delete el.dataset.warm;
  delete el.dataset.enteredAt;
}

/**
 * A 32×32 icon-only button with a 44 px hit area. Its `label` is the accessible name and shows in a tooltip after
 * 400 ms of hover, at once on keyboard focus, never on touch. Use it for the sidebar toggle, a composer's send and a
 * dialog's close; anything with room for words is a `Button`.
 */
export function IconButton({
  icon,
  label,
  shortcut,
  variant = "tertiary",
  tooltipSide = "bottom",
  type = "button",
  className,
  onPointerEnter,
  onPointerLeave,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx("app-btn app-btn--icon", `app-btn--${variant}`, className)}
      onPointerEnter={(event) => {
        onEnter(event);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        onLeave(event);
        onPointerLeave?.(event);
      }}
      {...rest}
    >
      <span className="app-btn-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="app-tip" data-side={tooltipSide} aria-hidden="true">
        {label}
        {shortcut ? <kbd className="app-tip-key">{shortcut}</kbd> : null}
      </span>
    </button>
  );
}
