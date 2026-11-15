/*
 * Sample progress after a stakeholder signs. Nothing here has happened: it shows what the Progress tab
 * would track. Dates are after the demo (Nov 20, 2026).
 */

export type MilestoneStatus = "done" | "scheduled" | "planned";

export type Milestone = { title: string; date: string; status: MilestoneStatus };

export const MILESTONES: Milestone[] = [
  { title: "Contract signed · glazing contractor", date: "Nov 23, 2026", status: "done" },
  { title: "Shoot 1 · curtain wall drone pass", date: "Dec 4, 2026", status: "scheduled" },
  { title: "Edit and deliver bid reel", date: "Dec 11, 2026", status: "planned" },
  { title: "Shoot 2 · night exterior", date: "Jan 8, 2027", status: "planned" },
  { title: "Deliver hero film and photo set", date: "Jan 22, 2027", status: "planned" },
];

export type Deliverable = { kind: "film" | "photos"; title: string; detail: string; due: string };

export const DELIVERABLES: Deliverable[] = [
  { kind: "film", title: "Bid reel", detail: "30 s", due: "Due Dec 11" },
  { kind: "film", title: "Hero film", detail: "60 s", due: "Due Jan 22" },
  { kind: "photos", title: "Photo set", detail: "40 images", due: "Due Jan 22" },
];
