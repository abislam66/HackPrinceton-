import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export type Breadcrumb = { label: string; href?: string };

export type PageHeaderProps = {
  breadcrumbs?: Breadcrumb[];
  /** The page title, in Rigid Square: the one place it is used. Long titles wrap; nothing truncates them. */
  title: ReactNode;
  /** One line that adds information, e.g. "4 projects · 2 in outreach". Leave it out rather than restate the title. */
  description?: ReactNode;
  /** The page's actions: at most one primary. They never shrink; on a narrow screen they wrap under the title. */
  actions?: ReactNode;
  className?: string;
};

/** Breadcrumbs in 13 px muted Geist, the title, an optional description, and the actions bottom-right. */
export function PageHeader({ breadcrumbs, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cx("app-page-head", className)}>
      <div className="app-page-main">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="app-crumbs">
            {breadcrumbs.map((crumb, i) => (
              <Fragment key={`${crumb.label}-${i}`}>
                {i > 0 ? <span aria-hidden="true"> / </span> : null}
                {crumb.href ? (
                  <Link href={crumb.href}>{crumb.label}</Link>
                ) : (
                  <span aria-current={i === breadcrumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
        ) : null}
        <h1 className="app-page-title">{title}</h1>
        {description ? <div className="app-page-desc">{description}</div> : null}
      </div>
      {actions ? <div className="app-page-actions">{actions}</div> : null}
    </header>
  );
}
