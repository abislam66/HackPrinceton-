"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import type { Destination } from "@/features/agent/destinations";
import { OPEN_LABEL, shortLabel } from "./run-view";

export type NoticeItem = { runId: string; dest: Destination };
/** Results of one prompt that finished out of sight. `key` changes when one is added, restarting the timer. */
export type Notice = { turnId: number; items: NoticeItem[]; key: number };

export type ResultNoticeProps = {
  notice: Notice | null;
  shown: boolean;
  /** Pointer or focus is on it: the auto-dismiss waits. */
  onHold: (held: boolean) => void;
  onFollow: (runId: string) => void;
  onDismiss: () => void;
};

/**
 * "8 Carlisle dossier is ready · Open", above the composer, when a result finishes while the Runs rail is out of
 * view. Always mounted as a status region, so screen readers hear it when it fills.
 */
export function ResultNotice({ notice, shown, onHold, onFollow, onDismiss }: ResultNoticeProps) {
  const items = notice?.items ?? [];
  const visible = shown && items.length > 0;
  // Hidden but mounted for the fade: keep its controls out of the tab order.
  const tabIndex = visible ? undefined : -1;
  return (
    <div
      role="status"
      className="agent-notice"
      data-shown={visible ? "" : undefined}
      onPointerEnter={() => onHold(true)}
      onPointerLeave={() => onHold(false)}
      onFocus={() => onHold(true)}
      onBlur={() => onHold(false)}
    >
      {items.length === 1 ? (
        <p className="agent-notice-text">
          <Check size={14} strokeWidth={1.75} aria-hidden className="flex-none text-muted" />
          <span className="min-w-0 truncate">{items[0].dest.label} is ready</span>
          <span aria-hidden className="text-muted">
            ·
          </span>
          <Link
            href={items[0].dest.href}
            className="agent-notice-link"
            tabIndex={tabIndex}
            onClick={() => onFollow(items[0].runId)}
            aria-label={`${OPEN_LABEL[items[0].dest.kind]}: ${items[0].dest.label}`}
          >
            Open
          </Link>
        </p>
      ) : items.length > 1 ? (
        <p className="agent-notice-text">
          <Check size={14} strokeWidth={1.75} aria-hidden className="flex-none text-muted" />
          <span className="flex-none">
            <span className="app-num">{items.length}</span> results ready
          </span>
          {items.map((item, i) => (
            <Fragment key={item.runId}>
              <span aria-hidden className="text-muted">
                ·
              </span>
              <Link
                href={item.dest.href}
                className="agent-notice-link min-w-0 truncate"
                tabIndex={tabIndex}
                onClick={() => onFollow(item.runId)}
              >
                {shortLabel(item.dest, items[i - 1]?.dest)}
              </Link>
            </Fragment>
          ))}
        </p>
      ) : null}
      {items.length > 0 ? (
        <button type="button" className="agent-notice-close" aria-label="Dismiss" tabIndex={tabIndex} onClick={onDismiss}>
          <X size={14} strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
