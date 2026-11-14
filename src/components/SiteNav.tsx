"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Clients", match: (path: string) => path === "/" || path.startsWith("/clients") },
  { href: "/activity", label: "Activity", match: (path: string) => path.startsWith("/activity") },
];

/** The internal app's two sections. The current one is underlined, not only colored. */
export function SiteNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Main">
      <ul className="-my-3 -mr-3 flex">
        {links.map((link) => {
          const current = link.match(pathname);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`tm-label inline-flex min-h-11 items-center px-3 underline-offset-8 ${
                  current ? "underline decoration-2" : "no-underline hover:underline"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
