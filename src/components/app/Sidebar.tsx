"use client";

import { Bot, Compass, FolderKanban, PanelLeftClose, PanelLeftOpen, RotateCcw, Send, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Logomark, Wordmark } from "@/components/ui/Logo";
import { resetDemo } from "@/features/workspace/actions";
import { cx } from "@/lib/cx";
import { SIDEBAR_COOKIE } from "./sidebar-cookie";

const NAV: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Agent", href: "/agent", icon: Bot },
  { label: "Discover", href: "/discover", icon: Compass },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Outreach", href: "/outreach", icon: Send },
];


const focusRing = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-asphalt";
const hoverable = "transition-colors duration-200 ease-out motion-reduce:transition-none";

/** True when the key press belongs to a text field, so the shortcut leaves typing alone. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The app's sidebar. Collapses to a 56 px icon rail with the button at the top or Cmd/Ctrl+B.
 * The width changes instantly: it is a frequent, keyboard-driven toggle, and animating width would reflow the page.
 */
export function Sidebar({ defaultCollapsed = false }: { defaultCollapsed?: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((was) => {
      const next = !was;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "b" || isTyping(event.target)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cx(
        "sticky top-0 flex h-dvh shrink-0 flex-col border-r border-rule/40 bg-stucco",
        collapsed ? "w-14" : "w-60",
      )}
    >
      {collapsed ? (
        // Collapsed: only the mark shows. Hovering or focusing it swaps in the expand button in the same spot.
        <div className="flex justify-center py-3">
          <div className="group relative grid size-8 place-items-center">
            <Logomark
              className="h-3.5 w-auto text-cone transition-opacity duration-150 ease-out group-focus-within:opacity-0 group-hover:opacity-0 motion-reduce:transition-none"
              title=""
            />
            <button
              type="button"
              onClick={toggle}
              aria-label={toggleLabel}
              aria-expanded={false}
              aria-controls="app-nav"
              title={`${toggleLabel} (⌘B)`}
              className={cx(
                "absolute inset-0 grid place-items-center text-ink opacity-0 group-hover:bg-ground/60 group-hover:opacity-100 focus-visible:opacity-100",
                "transition-opacity duration-150 ease-out motion-reduce:transition-none",
                focusRing,
              )}
            >
              <ToggleIcon size={16} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between py-3 pr-3 pl-5">
          <Link href="/discover" className={cx("block", focusRing)} aria-label="Tradesmark, home">
            <Wordmark className="h-3.5 w-auto text-cone" title="" />
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={toggleLabel}
            aria-expanded
            aria-controls="app-nav"
            title={`${toggleLabel} (⌘B)`}
            className={cx("grid size-8 place-items-center text-muted hover:bg-ground/60 hover:text-ink", hoverable, focusRing)}
          >
            <ToggleIcon size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      )}

      <nav id="app-nav" aria-label="Main" className="flex flex-col">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={cx(
                "tm-text--m relative flex min-h-11 items-center",
                collapsed ? "justify-center" : "gap-3 px-5",
                hoverable,
                focusRing,
                active ? "bg-ground text-ink" : "text-muted hover:bg-ground/60",
              )}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden />
              {collapsed ? null : <span className="flex-1">{label}</span>}
              {active ? (
                <span
                  aria-hidden
                  className={cx("size-2 shrink-0 bg-asphalt", collapsed && "absolute top-1/2 right-1.5 -translate-y-1/2")}
                />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <form
        className={cx("mt-auto", collapsed ? "flex justify-center py-5" : "p-5")}
        action={async () => {
          await resetDemo();
        }}
      >
        {collapsed ? (
          <button
            type="submit"
            aria-label="Reset demo"
            title="Reset demo"
            className={cx("grid size-8 place-items-center text-muted hover:bg-ground/60 hover:text-ink", hoverable, focusRing)}
          >
            <RotateCcw size={16} strokeWidth={1.5} aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            className={cx("tm-label tm-muted -mx-2 px-2 py-2 hover:bg-ground/60 hover:text-ink", hoverable, focusRing)}
          >
            Reset demo
          </button>
        )}
      </form>
    </aside>
  );
}
