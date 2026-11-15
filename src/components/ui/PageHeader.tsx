import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Heading } from "./Heading";

export type Breadcrumb = { label: string; href?: string };

export type PageHeaderProps = {
  breadcrumbs?: Breadcrumb[];
  /** A string so `Heading` can pick Rigid Square (six words or fewer) or Geist 600. */
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/** Breadcrumbs, the page title, a description, and actions bottom-right. 32 px below. */
export function PageHeader({ breadcrumbs, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cx("flex items-end justify-between gap-6 pb-8", className)}>
      <div className="flex min-w-0 flex-col gap-3">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="tm-label tm-muted">
            {breadcrumbs.map((crumb, i) => (
              <Fragment key={`${crumb.label}-${i}`}>
                {i > 0 ? <span aria-hidden="true"> / </span> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="transition-colors duration-200 hover:text-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={i === breadcrumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
        ) : null}
        <Heading size="s" as="h1">
          {title}
        </Heading>
        {description ? <div className="tm-text--m tm-muted max-w-[66ch]">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
