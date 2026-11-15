"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export type DialogProps = {
  open: boolean;
  /** Called on Esc, the close button, a backdrop click, or `open` turning false. */
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Pinned under the body, e.g. Cancel + the primary action. */
  footer?: ReactNode;
  /** While true, Esc and backdrop clicks do nothing (e.g. during a pending send). */
  locked?: boolean;
  className?: string;
};

/**
 * Modal dialog on native `<dialog>` + `showModal()`: focus trap, Esc and top layer for free.
 * Square Sheet panel framed in Asphalt, no shadow; the backdrop is Asphalt at 55%.
 * Enters in 200 ms ease-out (opacity + scale 0.98 → 1); no motion under reduced motion.
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
        // A click on the <dialog> itself (not its content) landed on the backdrop.
        if (event.target === event.currentTarget && !locked) onClose();
      }}
      className={cx(
        "m-auto w-[560px] max-w-[calc(100vw-32px)] border border-asphalt bg-sheet p-0 text-ink [color-scheme:light]",
        "backdrop:bg-asphalt/55",
        "scale-100 opacity-100 transition-[opacity,scale] duration-200 ease-out",
        "starting:open:scale-[0.98] starting:open:opacity-0 motion-reduce:transition-none",
        className,
      )}
    >
      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <h2 id={titleId} className="tm-h tm-h--xs">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={locked}
            className="-mr-2 grid size-10 shrink-0 place-items-center text-muted transition-colors duration-200 ease-out hover:bg-stucco hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt disabled:opacity-40 motion-reduce:transition-none"
          >
            <X size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer ? <div className="border-t border-rule/40 px-5 py-4">{footer}</div> : null}
      </div>
    </dialog>
  );
}
