import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export type EmptyStateProps = {
  /** What is missing: "No drafts". */
  title: string;
  /** One line on why it's empty or what fills it. */
  description: string;
  /** One action that fills it, usually a `Button`. */
  action?: ReactNode;
  className?: string;
};

/** An empty view, pinned top-left (never centred): a 16 px/600 title, one muted line, one action. Sits in a Panel. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx("app-empty", className)}>
      <p className="app-empty-title">{title}</p>
      <p className="app-empty-body">{description}</p>
      {action ? <div className="app-empty-action">{action}</div> : null}
    </div>
  );
}
