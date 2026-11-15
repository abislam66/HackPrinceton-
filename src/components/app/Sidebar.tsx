"use client";

import { Bot, Box, Compass, FolderKanban, LogOut, PanelLeftClose, PanelLeftOpen, RotateCcw, Send, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Logomark, Wordmark } from "@/components/ui/Logo";
import { resetDemo } from "@/features/workspace/actions";
import { cx } from "@/lib/cx";
import { SIDEBAR_COOKIE } from "./sidebar-cookie";

const NAV: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Agent", href: "/agent", icon: Bot },
  { label: "Discover", href: "/discover", icon: Compass },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Building viewer", href: "/building-viewer", icon: Box },
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
export function Sidebar({ defaultCollapsed = false, userEmail = null }: { defaultCollapsed?: boolean; userEmail?: string | null }) {
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

  return (
    <aside
      className={cx(
        "sticky top-0 flex h-dvh shrink-0 flex-col border-r border-rule/40 bg-stucco",
        collapsed ? "w-14" : "w-60",
      )}
    >
      {collapsed ? (
        // Collapsed: only the mark shows. Hovering it, or focusing the button, swaps in the expand button in the same spot.
        <div className="flex justify-center py-3">
          <div className="group relative grid size-8 place-items-center">
            <Logomark
              className="h-3.5 w-auto text-cone transition-opacity duration-150 ease-out group-focus-within:opacity-0 group-hover:opacity-0 motion-reduce:transition-none"
              title=""
            />
            {/* The fade sits on a wrapper so the button keeps its own hover and press transitions. */}
            <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-150 ease-out group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
              <IconButton
                icon={<PanelLeftOpen />}
                label="Expand sidebar"
                shortcut="⌘B"
                tooltipSide="right"
                onClick={toggle}
                aria-expanded={false}
                aria-controls="app-nav"
              />
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between py-3 pr-3 pl-5">
          <Link href="/discover" className={cx("block", focusRing)} aria-label="Tradesmark, home">
            <Wordmark className="h-3.5 w-auto text-cone" title="" />
          </Link>
          <IconButton
            icon={<PanelLeftClose />}
            label="Collapse sidebar"
            shortcut="⌘B"
            onClick={toggle}
            aria-expanded
            aria-controls="app-nav"
          />
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
                // Active: a 2 px Cone bar flush on the left edge, Asphalt icon and label, no fill.
                active
                  ? "text-ink before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-cone"
                  : "text-muted hover:bg-ground/60",
              )}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden />
              {collapsed ? null : <span className="flex-1">{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col">
        {userEmail ? (
          // Sign-in is on: who is signed in, and a POST form so a link can't sign anyone out.
          <form action="/auth/signout" method="post" className={cx("flex flex-col pt-3", collapsed ? "items-center" : "px-2")}>
            {collapsed ? (
              <IconButton type="submit" icon={<LogOut />} label={`Sign out (${userEmail})`} tooltipSide="right" />
            ) : (
              <>
                <p className="tm-text--s truncate px-3 pb-1 text-muted" title={userEmail}>
                  {userEmail}
                </p>
                <Button type="submit" variant="quiet">
                  Sign out
                </Button>
              </>
            )}
          </form>
        ) : null}
        {/* Expanded, the 8 px inset plus the button's 12 px padding puts "Reset demo" on the 20 px line of the logo and icons. */}
        <form
          className={cx("flex py-5", collapsed ? "justify-center" : "px-2")}
          action={async () => {
            await resetDemo();
          }}
        >
          {collapsed ? (
            <IconButton type="submit" icon={<RotateCcw />} label="Reset demo" tooltipSide="right" />
          ) : (
            // Quiet: muted at rest like the inactive nav rows, Asphalt on hover.
            <Button type="submit" variant="quiet">
              Reset demo
            </Button>
          )}
        </form>
      </div>
    </aside>
  );
}
