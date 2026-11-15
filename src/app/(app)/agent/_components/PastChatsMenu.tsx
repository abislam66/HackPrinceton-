"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Chat } from "@/features/agent/history";

function dayGroup(at: number, now: number): "Today" | "Yesterday" | "Earlier" {
  const day = (t: number) => new Date(t).toDateString();
  if (day(at) === day(now)) return "Today";
  if (day(at) === day(now - 86_400_000)) return "Yesterday";
  return "Earlier";
}

function whenLabel(at: number, group: string): string {
  const d = new Date(at);
  return group === "Earlier"
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export type PastChatsMenuProps = {
  chats: Chat[];
  currentId: string | null;
  /** No switching while a reply is pending. */
  disabled: boolean;
  onOpen: (chat: Chat) => void;
};

/** "Past chats 3": a popover with a filter and the saved chats grouped by day, newest first. */
export function PastChatsMenu({ chats, currentId, disabled, onOpen }: PastChatsMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Grouping reads the clock; take it when the menu opens, not during render.
  const [now, setNow] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const filterId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (returnFocus) wrapRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    filterRef.current?.focus({ preventScroll: true });
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  const q = query.trim().toLowerCase();
  const list = chats.filter((c) => !q || c.title.toLowerCase().includes(q));
  const groups = (["Today", "Yesterday", "Earlier"] as const)
    .map((g) => ({ g, items: list.filter((c) => dayGroup(c.updatedAt, now) === g) }))
    .filter((x) => x.items.length > 0);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled || chats.length === 0}
        onClick={() => {
          if (open) close(false);
          else {
            setNow(Date.now());
            setOpen(true);
          }
        }}
      >
        <span className="inline-flex items-center gap-1.5">
          Past chats
          <span className="app-num text-muted">{chats.length}</span>
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
        </span>
      </Button>
      {open ? (
        <div id={menuId} className="agent-menu" role="dialog" aria-label="Past chats">
          <div className="border-b border-divider p-3">
            <label htmlFor={filterId} className="sr-only">
              Filter past chats
            </label>
            <input
              id={filterId}
              ref={filterRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter chats"
              autoComplete="off"
              className="app-input"
            />
          </div>
          <div className="max-h-[min(480px,60dvh)] overflow-y-auto overscroll-contain py-1">
            {groups.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">No chats match “{query.trim()}”.</p>
            ) : (
              groups.map(({ g, items }) => (
                <section key={g} aria-label={g}>
                  <h3 className="px-4 pt-3 pb-1 text-xs font-medium text-muted">{g}</h3>
                  <ul>
                    {items.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="agent-menu-item"
                          aria-current={c.id === currentId ? "true" : undefined}
                          onClick={() => {
                            onOpen(c);
                            setOpen(false);
                            setQuery("");
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">{c.title}</span>
                          <span className="app-num flex-none text-xs text-muted">{whenLabel(c.updatedAt, g)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
