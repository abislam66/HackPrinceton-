"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";

export type ProjectTabCounts = {
  stakeholders?: number;
  dossier?: number;
  progress?: number;
};

/**
 * The project's sections, Segmented, with the active tab read from the route. A count shows only where one is given.
 * The demo project has Stakeholders / Dossier / Progress. A project added from scouting has no stakeholders or
 * progress yet, so it has Model / Dossier.
 */
export function ProjectTabs({
  base,
  counts = {},
  kind = "demo",
}: {
  base: string;
  counts?: ProjectTabCounts;
  kind?: "demo" | "scouted";
}) {
  const pathname = usePathname();
  const dossier = {
    label: "Dossier",
    href: `${base}/dossier`,
    active: pathname.startsWith(`${base}/dossier`),
    count: counts.dossier,
  };
  const items =
    kind === "scouted"
      ? [{ label: "Model", href: base, active: pathname === base }, dossier]
      : [
          { label: "Stakeholders", href: base, active: pathname === base, count: counts.stakeholders },
          dossier,
          { label: "Progress", href: `${base}/progress`, active: pathname.startsWith(`${base}/progress`), count: counts.progress },
        ];
  return <Tabs items={items} label="Project sections" />;
}
