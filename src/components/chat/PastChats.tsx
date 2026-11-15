"use client";

import { useRef } from "react";
import type { Chat } from "@/features/agent/history";
import { cx } from "@/lib/cx";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cone";

/** "14:05" for today, else "Nov 14". */
function formatWhen(ms: number): string {
  const date = new Date(ms);
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export type PastChatsProps = {
  chats: Chat[];
  /** The chat on screen, marked in the list. */
  currentId: string | null;
  onOpen: (chat: Chat) => void;
  /** No switching while a reply is pending. */
  disabled?: boolean;
  /**
   * `left`: the list opens under the summary, from its left edge (a page's top bar). `right`: it opens against the
   * nearest positioned ancestor's right edge, at most that wide, so it stays inside a narrow panel. Give the
   * panel's header `relative`.
   */
  align?: "left" | "right";
};

/** "Past chats (3)": a disclosure listing saved chats, newest first, each with its last-changed time. */
export function PastChats({ chats, currentId, onOpen, disabled = false, align = "left" }: PastChatsProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  if (chats.length === 0) return null;
  return (
    <details ref={ref} className={align === "left" ? "relative" : undefined}>
      <summary className={cx("cursor-pointer text-[13px] leading-5 font-medium text-muted select-none hover:text-ink", focusRing)}>
        Past chats (<span className="app-num">{chats.length}</span>)
      </summary>
      <ul
        className={cx(
          "absolute z-10 mt-2 flex max-h-[60vh] flex-col overflow-y-auto rounded-[2px] border border-line bg-sheet p-1",
          align === "left" ? "left-0 w-[min(480px,85vw)]" : "right-5 w-[min(360px,calc(100%-40px))]",
        )}
      >
        {chats.map((chat) => (
          <li key={chat.id}>
            <button
              type="button"
              onClick={() => {
                onOpen(chat);
                if (ref.current) ref.current.open = false;
              }}
              disabled={disabled}
              aria-current={chat.id === currentId ? "true" : undefined}
              className={cx(
                "flex w-full items-baseline justify-between gap-4 px-3 py-2 text-left hover:bg-stucco disabled:cursor-not-allowed",
                chat.id === currentId && "bg-stucco",
                focusRing,
              )}
            >
              <span className="truncate text-[13px] leading-5">{chat.title}</span>
              <span className="app-num shrink-0 text-xs text-muted">{formatWhen(chat.updatedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
