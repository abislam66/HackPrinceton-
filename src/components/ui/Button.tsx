"use client";

import { ArrowUpRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useId, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "tertiary";

type Shared = {
  children: ReactNode;
  /**
   * `primary` (Cone): the one main action in a view, never two. `secondary` (default): a Sheet fill with a hairline.
   * `tertiary`: text only, for low-stakes actions beside others (Cancel, Back, Copy link).
   */
  variant?: ButtonVariant;
  /** Can't be used. A button leaves the tab order unless `disabledReason` is set. */
  disabled?: boolean;
  /** Why it's disabled, shown as text under the button (or beside it). The button stays focusable and reads it. */
  disabledReason?: string;
  /** Where `disabledReason` sits. Under the button by default; in a PageHeader it aligns to the right edge. */
  reasonPosition?: "below" | "beside";
  /** Busy: a 12 px spinner and `pendingLabel`, at the idle width. Clicks do nothing while it's true. */
  pending?: boolean;
  /** The label while pending, e.g. "Sending…". Defaults to `children`. */
  pendingLabel?: ReactNode;
  className?: string;
};

type AsLink = Shared & { href: string } & Omit<ComponentProps<"a">, keyof Shared | "href">;
type AsButton = Shared & { href?: undefined } & Omit<ComponentProps<"button">, keyof Shared>;

export type ButtonProps = AsLink | AsButton;

const STROKE = 1.75;

/**
 * The app's button, 32 px tall, square, 13 px Geist 500 in sentence case.
 * With `href` it renders a Next `Link` (an `<a>` for external URLs); `target="_blank"` adds a 14 px arrow and
 * "(opens in a new tab)" for screen readers. Otherwise a `<button type="button">`.
 */
export function Button(props: ButtonProps) {
  const {
    children,
    variant = "secondary",
    disabled = false,
    disabledReason,
    reasonPosition = "below",
    pending,
    pendingLabel,
    className,
    ...rest
  } = props;
  const reasonId = useId();
  const newTab = "target" in rest && rest.target === "_blank";
  const busy = pending === true;
  // An unavailable button that explains itself stays focusable, so its reason is read with it.
  const explained = disabled && Boolean(disabledReason);

  const classes = cx(
    "app-btn",
    `app-btn--${variant}`,
    newTab && "app-btn--trail",
    // A lone button carries the caller's layout classes; one with a reason gives them to the wrapper.
    !explained && className,
  );

  const idle = (
    <>
      {children}
      {newTab ? (
        <>
          <ArrowUpRight size={14} strokeWidth={STROKE} aria-hidden />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      ) : null}
    </>
  );

  // A button that can go pending keeps both faces in one grid cell, so its width never changes.
  const content =
    pending === undefined ? (
      <span className="app-btn-label">{idle}</span>
    ) : (
      <PendingStack idle={idle} pendingLabel={pendingLabel ?? children} pending={busy} />
    );

  let control: ReactNode;
  if (typeof rest.href === "string" && !disabled && !busy) {
    const { href, ...anchor } = rest as Omit<AsLink, keyof Shared>;
    const rel = newTab ? (anchor.rel ?? "noopener noreferrer") : anchor.rel;
    const external = !(href.startsWith("/") || href.startsWith("#") || href.startsWith("?"));
    control = external ? (
      <a href={href} {...anchor} rel={rel} className={classes}>
        {content}
      </a>
    ) : (
      <Link href={href} {...anchor} rel={rel} className={classes}>
        {content}
      </Link>
    );
  } else {
    // A disabled or pending link has nowhere to go, so it renders as an unavailable button.
    const button = (typeof rest.href === "string" ? {} : rest) as Omit<AsButton, keyof Shared>;
    const { type = "button", onClick, ...native } = button;
    // Pending and explained stay focusable (aria-disabled) and swallow clicks; plain disabled leaves the tab order.
    const inert = busy || explained;
    control = (
      <button
        type={type}
        {...native}
        className={classes}
        disabled={disabled && !inert ? true : undefined}
        aria-disabled={inert ? true : native["aria-disabled"]}
        aria-describedby={cx(native["aria-describedby"], explained && reasonId) || undefined}
        data-pending={busy ? "" : undefined}
        onClick={
          inert
            ? (event: MouseEvent<HTMLButtonElement>) => event.preventDefault() // also stops a form submit
            : onClick
        }
      >
        {content}
      </button>
    );
  }

  if (!explained) return control;
  return (
    <span className={cx("app-btn-field", className)} data-reason={reasonPosition}>
      {control}
      <span id={reasonId} className="app-btn-reason">
        {disabledReason}
      </span>
    </span>
  );
}

function PendingStack({ idle, pendingLabel, pending }: { idle: ReactNode; pendingLabel: ReactNode; pending: boolean }) {
  const busyFace = (
    <>
      <LoaderCircle size={12} strokeWidth={STROKE} className="app-spin" aria-hidden />
      {pendingLabel}
    </>
  );
  return (
    <span className="app-btn-stack">
      <span className="app-btn-sizer" aria-hidden="true">
        {idle}
      </span>
      <span className="app-btn-sizer" aria-hidden="true">
        {busyFace}
      </span>
      <span aria-live="polite">{pending ? busyFace : idle}</span>
    </span>
  );
}
