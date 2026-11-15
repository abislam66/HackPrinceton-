"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";

export type ProjectTabCounts = {
  stakeholders?: number;
  dossier?: number;
};

/**
 * The project's sections, Segmented, with the active tab read from the route. A count shows only where one is given.
 * Every project has Stakeholders / Model / Dossier: the demo project's model is the model builder's, a scouted one's
 * is generated.
 */
export function ProjectTabs({ base, counts = {} }: { base: string; counts?: ProjectTabCounts }) {
  const pathname = usePathname();
  const dossier = {
    label: "Dossier",
    href: `${base}/dossier`,
    active: pathname.startsWith(`${base}/dossier`),
    count: counts.dossier,
  };
  const stakeholders = { label: "Stakeholders", href: base, active: pathname === base, count: counts.stakeholders };
  const model = { label: "Model", href: `${base}/model`, active: pathname.startsWith(`${base}/model`) };
  const items = [stakeholders, model, dossier];
  return <Tabs items={items} label="Project sections" />;
}
