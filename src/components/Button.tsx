import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "black" | "ghost" | "ghost-light";

type Shared = {
  /** Plain text. It is drawn twice for the rolling hover, so no icons or markup. */
  children: string;
  /** `black` is the one main action in a view. `ghost` is everything else. `ghost-light` is `ghost` on Asphalt or over media. */
  variant?: Variant;
  /** The arrow cell. On for actions that go somewhere, off for in-place actions such as Save. */
  arrow?: boolean;
  /** Drop the 240 px minimum width. For headers, table rows and other tight spots. */
  compact?: boolean;
  /** Fill the width of the parent. */
  full?: boolean;
  className?: string;
};

type AsLink = Shared & { href: string } & Omit<ComponentProps<"a">, keyof Shared | "href">;
type AsButton = Shared & { href?: undefined } & Omit<ComponentProps<"button">, keyof Shared>;

const Arrow = () => (
  <svg className="tm-arrow" viewBox="0 0 12 12">
    <path d="M6.9 1.1 11.5 6l-4.6 4.9H5.1l3.9-4.1H.5V5.2h8.5L5.1 1.1z" />
  </svg>
);

function Face({ children, variant = "ghost", arrow = true, compact, full }: Shared): ReactNode {
  const cls = ["tm-btn", `tm-btn--${variant}`, arrow ? "" : "tm-btn--noicon", compact ? "tm-btn--compact" : "", full ? "tm-btn--full" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls}>
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

/** The Tradesmark button: a 1 px frame, a rolling label and an arrow cell. Renders a link when given `href`. */
export function Button(props: AsLink | AsButton) {
  const { children, variant, arrow, compact, full, className, ...rest } = props;
  const wrap = ["tm-btnlink", full ? "tm-btnlink--full" : "", className ?? ""].filter(Boolean).join(" ");
  const face = (
    <Face variant={variant} arrow={arrow} compact={compact} full={full}>
      {children}
    </Face>
  );

  if (typeof rest.href === "string") {
    const { href, ...anchor } = rest as Omit<AsLink, keyof Shared>;
    const internal = href.startsWith("/") || href.startsWith("#");
    return internal ? (
      <Link href={href} className={wrap} {...anchor}>
        {face}
      </Link>
    ) : (
      <a href={href} className={wrap} {...anchor}>
        {face}
      </a>
    );
  }

  const button = rest as Omit<AsButton, keyof Shared>;
  return (
    <button type="button" className={wrap} {...button}>
      {face}
    </button>
  );
}
