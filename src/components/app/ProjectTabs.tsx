"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";

export type ProjectTabCounts = {
  stakeholders?: number;
  dossier?: number;
  progress?: number;
};

/** Stakeholders / Dossier / Progress, Segmented, with the active tab read from the route. A count shows only where one is given. */
export function ProjectTabs({ base, counts = {} }: { base: string; counts?: ProjectTabCounts }) {
  const pathname = usePathname();
  const items = [
    { label: "Stakeholders", href: base, active: pathname === base, count: counts.stakeholders },
    { label: "Dossier", href: `${base}/dossier`, active: pathname.startsWith(`${base}/dossier`), count: counts.dossier },
    { label: "Progress", href: `${base}/progress`, active: pathname.startsWith(`${base}/progress`), count: counts.progress },
  ];
  return <Tabs items={items} label="Project sections" />;
}
