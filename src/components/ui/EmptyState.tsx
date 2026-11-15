import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Eyebrow } from "./Eyebrow";
import { Heading } from "./Heading";

export type EmptyStateProps = {
  eyebrow?: string;
  title: string;
  /** One line saying why it's empty. */
  description: string;
  /** One action, usually a `<Button>` (the one place a non-compact button is fine). */
  action?: ReactNode;
  className?: string;
};

/** Pinned top-left, never centered. */
export function EmptyState({ eyebrow, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-start gap-3 p-5", className)}>
      {eyebrow ? <Eyebrow square={false}>{eyebrow}</Eyebrow> : null}
      <Heading size="xs" as="p">
        {title}
      </Heading>
      <p className="tm-text--m tm-muted max-w-[66ch]">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
