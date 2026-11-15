import {
  Box,
  Building2,
  Compass,
  FileText,
  FolderOpen,
  Mail,
  Presentation,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { TagTone } from "@/components/ui/Tag";
import type { Destination, DestinationKind } from "@/features/agent/destinations";
import { linkProjects, type ProjectLink } from "@/features/agent/reply";
import type { Run, RunStatus } from "@/features/agent/runs";

/** How the Agent page names and draws runs and their destinations. */

export const STATUS: Record<RunStatus, { label: string; tone: TagTone }> = {
  running: { label: "Running", tone: "running" },
  done: { label: "Done", tone: "pass" },
  failed: { label: "Failed", tone: "fail" },
  stopped: { label: "Stopped", tone: "neutral" },
};

/** Short names for the inline run references under a prompt. */
const RUN_NAMES: Record<string, string> = {
  scout_projects: "Scout",
  get_scout_results: "Scout results",
  research_dossier: "Dossier",
  get_dossier: "Dossier read",
  list_stakeholders: "Stakeholders",
  draft_outreach: "Outreach draft",
  edit_outreach_draft: "Draft edit",
  send_outreach: "Outreach send",
  list_outreach: "Outbox",
  regenerate_proposal: "Re-pitch",
  list_projects: "Projects",
  add_project_from_scout: "Add to Projects",
  generate_project_model: "3D model",
  get_project_model: "3D model check",
  get_stakeholder_status: "Stakeholder status",
  generate_proposal: "Proposal",
  review_proposal: "Proposal review",
};
export const runName = (run: Run) => RUN_NAMES[run.tool] ?? run.label;

/** Where a running tool's result will land, before it has one. Only tools that always produce somewhere to go. */
export const LANDS_IN: Record<string, string> = {
  scout_projects: "Discover",
  research_dossier: "Dossier",
  draft_outreach: "Outreach draft",
  add_project_from_scout: "Projects",
  generate_proposal: "Proposal",
  regenerate_proposal: "Proposal",
};

export const OPEN_LABEL: Record<DestinationKind, string> = {
  dossier: "Open dossier",
  model: "Open 3D model",
  discover: "Open in Discover",
  candidate: "Open project",
  project: "Open project",
  stakeholder: "Open stakeholder",
  outreach: "Open draft",
  proposal: "Open proposal",
};

export const KIND_ICON: Record<DestinationKind, LucideIcon> = {
  dossier: FileText,
  model: Box,
  discover: Compass,
  candidate: Building2,
  project: FolderOpen,
  stakeholder: UserRound,
  outreach: Mail,
  proposal: Presentation,
};

export const elapsedOf = (run: Run, now: number) => Math.max(0, (run.endedAt ?? now) - run.startedAt);

/** "8 Carlisle dossier" → "dossier" when the item before it is about the same subject. */
export function shortLabel(dest: Destination, prev?: Destination) {
  if (prev && prev.subject === dest.subject && dest.label.startsWith(`${dest.subject} `)) {
    return dest.label.slice(dest.subject.length + 1);
  }
  return dest.label;
}

export const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Digits in Geist Mono tabular, everything else as is. */
export function withNums(text: string): ReactNode {
  return text.split(/(\d[\d,.:]*\d|\d)/).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="app-num">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/** Reply text with the project names the chat knows linked to their pages. */
export function RichText({ text, links }: { text: string; links: ProjectLink[] }) {
  return (
    <>
      {linkProjects(text, links).map((seg, i) =>
        seg.href ? (
          <Link key={i} href={seg.href} className="app-link">
            {withNums(seg.text)}
          </Link>
        ) : (
          <Fragment key={i}>{withNums(seg.text)}</Fragment>
        ),
      )}
    </>
  );
}
