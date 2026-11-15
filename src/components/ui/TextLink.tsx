import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";

export type TextLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: string;
  children: ReactNode;
};

/**
 * A link inside text: it takes the surrounding size and colour, with a hairline underline 3 px below that darkens to
 * the text colour on hover, and a 2 px Cone focus ring. `target="_blank"` adds a 14 px arrow and "(opens in a new
 * tab)" for screen readers, and `rel="noopener noreferrer"` unless one is given. Internal paths render a Next `Link`.
 * For an action that looks like a button, use `Button` with `href`.
 */
export function TextLink({ href, target, rel, className, children, ...rest }: TextLinkProps) {
  const newTab = target === "_blank";
  const props = {
    ...rest,
    target,
    rel: newTab ? (rel ?? "noopener noreferrer") : rel,
    className: cx("app-link", className),
  };
  const content = (
    <>
      {children}
      {newTab ? (
        <>
          <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden className="app-link-arrow" />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      ) : null}
    </>
  );

  const internal = href.startsWith("/") || href.startsWith("#") || href.startsWith("?");
  return internal ? (
    <Link href={href} {...props}>
      {content}
    </Link>
  ) : (
    <a href={href} {...props}>
      {content}
    </a>
  );
}
