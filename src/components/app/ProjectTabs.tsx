"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";

/** Stakeholders / Dossier / Progress, with the active tab read from the route. */
export function ProjectTabs({ base }: { base: string }) {
  const pathname = usePathname();
  const items = [
    { label: "Stakeholders", href: base, active: pathname === base },
    { label: "Dossier", href: `${base}/dossier`, active: pathname.startsWith(`${base}/dossier`) },
    { label: "Progress", href: `${base}/progress`, active: pathname.startsWith(`${base}/progress`) },
  ];
  return <Tabs items={items} />;
}
