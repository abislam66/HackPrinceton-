"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { IconButton } from "./IconButton";

export type DialogProps = {
  open: boolean;
  /** Called on Esc, the close button, a click on the scrim, or `open` turning false. */
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Pinned under the body: an optional note, then the actions (Cancel, then the one primary), which sit right. */
  footer?: ReactNode;
  /** While true, Esc, the scrim and the close button do nothing (e.g. during a pending send). */
  locked?: boolean;
  className?: string;
};

/**
 * A modal dialog on native `<dialog>` and `showModal()`: focus trap, Esc and the top layer for free, and focus
 * returns to the opener on close. A Sheet with an 18 % edge over an 80 % Plaster scrim, the header row of a Panel.
 * Enters in 200 ms (opacity and a 0.98 scale); closes at once; no motion under reduced motion.
 */
export function Dialog({ open, onClose, title, children, footer, locked = false, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault(); // keep `open` the single source of truth
        if (!locked) onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        // A click on the <dialog> itself (not its content) landed on the scrim.
        if (event.target === event.currentTarget && !locked) onClose();
      }}
      className={cx("app-dialog", className)}
    >
      <div className="app-panel-head app-dialog-head">
        <h2 id={titleId} className="app-h-section app-panel-title">
          {title}
        </h2>
        <IconButton icon={<X />} label="Close" onClick={onClose} disabled={locked} />
      </div>
      <div className="app-dialog-body">{children}</div>
      {footer ? <div className="app-dialog-foot">{footer}</div> : null}
    </dialog>
  );
}
