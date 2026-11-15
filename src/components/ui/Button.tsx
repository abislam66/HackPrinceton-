import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "ghost" | "ghost-light";

type Shared = {
  /** Plain text. It is drawn twice for the rolling hover, so no icons or markup. */
  children: string;
  /** `primary` (Cone) is the one main action in a view. `ghost` (default) is everything else. `ghost-light` is `ghost` on Asphalt. */
  variant?: ButtonVariant;
  /** The arrow cell (default on). On for actions that go somewhere, off for in-place actions such as Save. */
  arrow?: boolean;
  /** Drop the 240 px minimum width. Always on in the app, except the lone CTA of an empty state. */
  compact?: boolean;
  /** Fill the width of the parent. */
  full?: boolean;
  className?: string;
};

type AsLink = Shared & { href: string } & Omit<ComponentProps<"a">, keyof Shared | "href">;
type AsButton = Shared & { href?: undefined } & Omit<ComponentProps<"button">, keyof Shared>;

export type ButtonProps = AsLink | AsButton;

const Arrow = () => (
  <svg className="tm-arrow" viewBox="0 0 12 12">
    <path d="M6.9 1.1 11.5 6l-4.6 4.9H5.1l3.9-4.1H.5V5.2h8.5L5.1 1.1z" />
  </svg>
);

function Face({ children, variant = "ghost", arrow = true, compact, full }: Shared): ReactNode {
  return (
    <span
      className={cx(
        "tm-btn",
        `tm-btn--${variant}`,
        !arrow && "tm-btn--noicon",
        compact && "tm-btn--compact",
        full && "tm-btn--full",
      )}
    >
      <span className="tm-btn__label">
        <span className="tm-roll">{children}</span>
        <span className="tm-roll" aria-hidden="true">
          {children}
        </span>
      </span>
      {arrow ? (
        <span className="tm-btn__icon" aria-hidden="true">
          <span className="tm-btn__cell">
            <Arrow />
          </span>
          <span className="tm-btn__cell tm-btn__cell--in">
            <Arrow />
          </span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * The Tradesmark button: a 1 px frame, a rolling label and an arrow cell, 40 px tall.
 * With `href` it renders a link (Next `Link` for internal paths); otherwise a `<button type="button">`.
 * Disable a button with `disabled`, a link with `aria-disabled` (it also leaves the tab order).
 */
export function Button(props: ButtonProps) {
  const { children, variant, arrow, compact, full, className, ...rest } = props;
  const wrap = cx("tm-btnlink", full && "tm-btnlink--full", className);
  const face = (
    <Face variant={variant} arrow={arrow} compact={compact} full={full}>
      {children}
    </Face>
  );

  if (typeof rest.href === "string") {
    const { href, ...anchor } = rest as Omit<AsLink, keyof Shared>;
    const disabled = anchor["aria-disabled"] === true || anchor["aria-disabled"] === "true";
    const linkProps = { ...anchor, className: wrap, tabIndex: disabled ? -1 : anchor.tabIndex };
    const internal = href.startsWith("/") || href.startsWith("#");
    return internal ? (
      <Link href={href} {...linkProps}>
        {face}
      </Link>
    ) : (
      <a href={href} {...linkProps}>
        {face}
      </a>
    );
  }

  const { type = "button", ...button } = rest as Omit<AsButton, keyof Shared>;
  return (
    <button type={type} className={wrap} {...button}>
      {face}
    </button>
  );
}
