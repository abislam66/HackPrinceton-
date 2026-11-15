import { cx } from "@/lib/cx";

export type ProgressStatus = "queued" | "running" | "done" | "error";

export type ProgressBarProps = {
  /** queued: empty. running: an indeterminate Cone sweep (no estimate exists). done: full Asphalt. error: full Halt. */
  status: ProgressStatus;
  className?: string;
};

/** A 2 px bar under a build step's label. Decorative: the step's `Tag` states the status in words. */
export function ProgressBar({ status, className }: ProgressBarProps) {
  return (
    <span className={cx("app-bar", className)} data-status={status} aria-hidden="true">
      <span className="app-bar-fill" />
    </span>
  );
}
