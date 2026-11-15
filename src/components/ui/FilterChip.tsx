"use client";

import { Check } from "lucide-react";
import { useState, type ComponentProps, type MouseEvent } from "react";
import { cx } from "@/lib/cx";

export type FilterChipProps = Omit<ComponentProps<"button">, "aria-pressed" | "children"> & {
  children: string;
  /** Controlled: whether the filter is on. Pair with `onPressedChange`. */
  pressed?: boolean;
  /** Uncontrolled: whether it starts on. */
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
};

/**
 * A filter you can toggle: a `<button aria-pressed>`. Off is Stucco with muted text; on is Limestone with a check,
 * at the same width. Lay several out in `FilterChips`.
 */
export function FilterChip({
  children,
  pressed: controlled,
  defaultPressed = false,
  onPressedChange,
  onClick,
  type = "button",
  className,
  ...rest
}: FilterChipProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultPressed);
  const pressed = controlled ?? uncontrolled;

  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cx("app-chip", className)}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (controlled === undefined) setUncontrolled(!pressed);
        onPressedChange?.(!pressed);
      }}
      {...rest}
    >
      {pressed ? <Check size={12} strokeWidth={2} aria-hidden /> : null}
      {children}
    </button>
  );
}

/** A labelled, wrapping group of filter chips, spaced so their 44 px hit areas never overlap. */
export function FilterChips({ label, className, ...rest }: ComponentProps<"div"> & { label: string }) {
  return <div role="group" aria-label={label} className={cx("app-chips", className)} {...rest} />;
}
