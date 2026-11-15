import { useId, type ComponentProps, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export type PanelProps = Omit<ComponentProps<"section">, "title"> & {
  /** Opens the panel with a header row: a 14 px/600 title, then a divider. */
  title?: ReactNode;
  /** The title's tag, for the document outline. h2 by default. */
  titleAs?: "h2" | "h3";
  /** A count on the right of the header row, in mono: 3, or "2 of 3 sent". */
  count?: ReactNode;
  /** One action on the right of the header row, usually a secondary or tertiary `Button`. */
  action?: ReactNode;
  /** No body padding, for row lists and tables that run edge to edge. */
  flush?: boolean;
};

/**
 * A content panel: Sheet behind a 1 px 10 % border, on the Plaster page. Inside it, only dividers; never a panel
 * inside a panel. `count` and `action` need a `title`.
 */
export function Panel({ title, titleAs: Title = "h2", count, action, flush = false, className, children, ...rest }: PanelProps) {
  const titleId = useId();
  const titled = title !== undefined && title !== null;
  return (
    <section aria-labelledby={titled ? titleId : undefined} className={cx("app-panel", className)} {...rest}>
      {titled ? (
        <div className="app-panel-head">
          <Title id={titleId} className="app-h-section app-panel-title">
            {title}
          </Title>
          {count !== undefined || action ? (
            <div className="app-panel-end">
              {count !== undefined ? <span className="app-panel-count">{count}</span> : null}
              {action}
            </div>
          ) : null}
        </div>
      ) : null}
      {flush ? children : <div className="app-panel-body">{children}</div>}
    </section>
  );
}
