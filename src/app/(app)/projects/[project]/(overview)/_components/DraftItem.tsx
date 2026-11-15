"use client";

import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { TextLink } from "@/components/ui/TextLink";
import type { DraftView } from "./draft-view";

export type DraftAction = "replace" | "new-project" | "discard";

const STATUS: Record<DraftView["status"], { label: string; tone: TagTone }> = {
  pending: { label: "Draft", tone: "neutral" },
  replaced: { label: "Replaced", tone: "pass" },
  "new-project": { label: "New project", tone: "pass" },
  discarded: { label: "Discarded", tone: "neutral" },
};

const pad = (n: number) => String(n).padStart(2, "0");

type Props = {
  draft: DraftView;
  projectSlug: string;
  /** The newest pending draft takes the view's one primary button; older ones get secondary. */
  primary: boolean;
  /** The action in flight on this draft, if any. */
  busy: DraftAction | null;
  /** Another draft is resolving: wait for it. */
  locked: boolean;
  error: string | null;
  onResolve: (action: DraftAction) => void;
};

/**
 * One drafted change in the project agent panel. Pending: the request, what changes, the regenerated headline and
 * shots, then Replace / New project / Discard. Resolved here: one line saying what happened, with a link to it.
 * Sits in the thread's list, so it runs edge to edge between dividers rather than as a box inside the panel.
 */
export function DraftItem({ draft, projectSlug, primary, busy, locked, error, onResolve }: Props) {
  const titleId = useId();
  const status = STATUS[draft.status];
  const pending = draft.status === "pending";
  const title = draft.kind === "new-stakeholder" ? `New stakeholder: ${draft.company}` : `Updates ${draft.company}`;
  const disabled = locked || busy !== null;

  return (
    <li aria-labelledby={titleId} className="flex flex-col gap-4 p-5 not-first:border-t not-first:border-divider">
      <div className="flex items-start justify-between gap-3">
        <h3 id={titleId} className="app-h-section min-w-0 text-pretty">
          {title}
        </h3>
        <Tag tone={status.tone} className="shrink-0">
          {status.label}
        </Tag>
      </div>

      {pending ? (
        <>
          <dl className="flex flex-col gap-4">
            {draft.request ? (
              <Fact label="Request">
                <q className="text-pretty">{draft.request}</q>
              </Fact>
            ) : null}
            <Fact label="What changes">{draft.summary}</Fact>
            <Fact label="New proposal">
              <span className="font-semibold">{draft.headline}</span>
            </Fact>
            {draft.shots.length > 0 ? (
              <Fact label={`Shots · ${draft.shots.length}`}>
                <ol className="flex flex-col gap-1">
                  {draft.shots.map((shot, i) => (
                    <li key={`${i}-${shot}`} className="flex gap-3">
                      <span className="app-num shrink-0 text-muted">{pad(i + 1)}</span>
                      <span className="min-w-0 text-pretty">{shot}</span>
                    </li>
                  ))}
                </ol>
              </Fact>
            ) : null}
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={primary ? "primary" : "secondary"}
              onClick={() => onResolve("replace")}
              disabled={disabled && busy !== "replace"}
              pending={busy === "replace"}
              pendingLabel="Replacing…"
            >
              Replace
            </Button>
            <Button
              variant="secondary"
              onClick={() => onResolve("new-project")}
              disabled={disabled && busy !== "new-project"}
              pending={busy === "new-project"}
              pendingLabel="Opening…"
            >
              New project
            </Button>
            <Button
              variant="tertiary"
              onClick={() => onResolve("discard")}
              disabled={disabled && busy !== "discard"}
              pending={busy === "discard"}
              pendingLabel="Discarding…"
            >
              Discard
            </Button>
          </div>
          <p className="text-[13px] leading-[18px] text-muted">
            Replace changes this project. New project keeps it as it is and opens a copy with the change.
          </p>
        </>
      ) : (
        <Outcome draft={draft} projectSlug={projectSlug} />
      )}

      {error ? (
        <p role="alert" className="text-[13px] leading-[18px] text-status-fail-ink">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs leading-4 text-muted">{label}</dt>
      <dd className="text-sm leading-[22px] text-pretty">{children}</dd>
    </div>
  );
}

/** What a resolved draft did, in one line, with a link to see it. */
function Outcome({ draft, projectSlug }: { draft: DraftView; projectSlug: string }) {
  if (draft.status === "replaced") {
    return (
      <p className="text-sm leading-[22px] text-pretty">
        {draft.company}&apos;s brief and proposal are updated on this project.{" "}
        <TextLink href={`/projects/${projectSlug}/stakeholders/${draft.clientId}`}>Open {draft.company}</TextLink>
      </p>
    );
  }
  if (draft.status === "new-project" && draft.newProjectId) {
    return (
      <p className="text-sm leading-[22px] text-pretty">
        This project is unchanged. The change opened as a new project.{" "}
        <TextLink href={`/projects/${draft.newProjectId}`}>Open the new project</TextLink>
      </p>
    );
  }
  return <p className="text-sm leading-[22px] text-muted">Nothing changed.</p>;
}
