"use client";

import { ArrowUpRight, Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useId, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "quiet";

type Shared = {
  children: ReactNode;
  /**
   * `primary` (Cone): the one main action in a view, never two. `secondary` (default): a Sheet fill with a hairline.
   * `tertiary`: text only, for low-stakes actions beside others (Cancel, Back, Copy link).
   * `quiet`: a tertiary in muted text until hovered, for app chrome that sits apart from the work (Reset demo).
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
  /**
   * Just finished: a 14 px check and `doneLabel`, at the idle width, announced politely to screen readers. The
   * caller turns it back off (Copy link → Copied for 1.5 s). The button stays clickable. Pending wins over done.
   */
  done?: boolean;
  /** The label while done, e.g. "Copied". Defaults to "Done". */
  doneLabel?: ReactNode;
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
    done,
    doneLabel = "Done",
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
    // Quiet is a tertiary with muted ink: it takes every tertiary rule, plus its own colour.
    variant === "quiet" ? "app-btn--tertiary app-btn--quiet" : `app-btn--${variant}`,
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

  // A button that can go pending or done keeps every face in one grid cell, so its width never changes.
  const content =
    pending === undefined && done === undefined ? (
      <span className="app-btn-label">{idle}</span>
    ) : (
      <FaceStack
        idle={idle}
        busy={
          pending === undefined ? undefined : (
            <>
              <LoaderCircle size={12} strokeWidth={STROKE} className="app-spin" aria-hidden />
              {pendingLabel ?? children}
            </>
          )
        }
        done={
          done === undefined ? undefined : (
            <>
              <Check size={14} strokeWidth={STROKE} aria-hidden />
              {doneLabel}
            </>
          )
        }
        face={busy ? "busy" : done ? "done" : "idle"}
      />
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

type Faces = { idle: ReactNode; busy?: ReactNode; done?: ReactNode };

/**
 * Every face the button can show (idle, and busy or done when the caller uses them) in one grid cell: hidden sizers
 * set the width to the widest, and the live face is announced politely when it swaps.
 */
function FaceStack({ face, ...faces }: Faces & { face: keyof Faces }) {
  const sizers = (Object.keys(faces) as (keyof Faces)[]).filter((key) => faces[key] !== undefined);
  return (
    <span className="app-btn-stack">
      {sizers.map((key) => (
        <span key={key} className="app-btn-sizer" aria-hidden="true">
          {faces[key]}
        </span>
      ))}
      <span aria-live="polite">{faces[face]}</span>
    </span>
  );
}
