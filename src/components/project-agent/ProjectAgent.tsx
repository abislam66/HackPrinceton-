"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThread } from "@/components/chat/ChatThread";
import { PastChats } from "@/components/chat/PastChats";
import { useAgentChat } from "@/components/chat/useAgentChat";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { projectChatKey } from "@/features/agent/history";
// Type only: erased at build time, so the server-only module never reaches the browser.
import type { DraftCard } from "@/features/project-agent/agent";
import { cx } from "@/lib/cx";
import { DraftItem, type DraftAction } from "./DraftItem";
import { draftViewFromCard, type DraftView } from "./draft-view";

/** The project agent's tools, as the working line names them. */
const TOOL_LABELS: Record<string, string> = {
  list_stakeholders: "Reading the stakeholders",
  get_proposal: "Reading a proposal",
  draft_change: "Drafting the change",
  list_drafts: "Reading the drafts",
  resolve_draft: "Applying your choice",
};

const ACTION_VERB: Record<DraftAction, string> = { replace: "replace", "new-project": "open", discard: "discard" };

type Props = {
  projectSlug: string;
  /** Pending drafts as the page loaded them: the project's, or on a stakeholder page that stakeholder's. */
  drafts: DraftView[];
  /**
   * Scopes the chat to one stakeholder (the workspace): its own history, every prompt sent as being about them
   * unless it names someone else, and copy about their shots.
   */
  stakeholder?: { id: string; company: string };
  /**
   * `panel`: its own titled Panel (the project page). `bare`: fills the panel it sits in (the workspace's side
   * panel, which has its own tabs), with the chat controls in a toolbar row.
   */
  frame?: "panel" | "bare";
  /** Kept mounted but not shown, so a reply keeps streaming while another tab is open. */
  hidden?: boolean;
  /** After the user resolves a draft here, before the page refreshes. */
  onResolved?: (draft: DraftView) => void;
  className?: string;
};

/**
 * The project agent: a chat inside one project, the way to change it. A described change comes back as a draft
 * (new brief, shots and pitch) and nothing changes until the user picks Replace, New project or Discard on it.
 * Pending drafts come from the page, so they show on load in every chat; history stays in this browser, per project
 * (and per stakeholder on a stakeholder page).
 */
export function ProjectAgent({
  projectSlug,
  drafts,
  stakeholder,
  frame = "panel",
  hidden = false,
  onResolved,
  className,
}: Props) {
  const router = useRouter();
  const titleId = useId();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Drafts this panel saw stream in or resolved, by id. Newer than the page's list until the page refreshes. */
  const [seen, setSeen] = useState<Record<string, DraftView>>({});
  const [busy, setBusy] = useState<{ id: string; action: DraftAction } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // A fresh list from the page is the truth for pending drafts. Keep what this panel resolved, and on a stakeholder
  // page the drafts it made for someone else, which that page's list never holds.
  const [listed, setListed] = useState(drafts);
  if (drafts !== listed) {
    setListed(drafts);
    setSeen((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([, d]) => d.status !== "pending" || (stakeholder && d.clientId !== stakeholder.id)),
      ),
    );
  }

  const chat = useAgentChat({
    endpoint: `/api/projects/${encodeURIComponent(projectSlug)}/agent`,
    storageKey: stakeholder ? `${projectChatKey(projectSlug)}.${stakeholder.id}` : projectChatKey(projectSlug),
    toolLabel: (tool) => `${TOOL_LABELS[tool] ?? tool.replaceAll("_", " ")}…`,
    framePrompt: stakeholder
      ? (text) =>
          `[On ${stakeholder.company}'s page (stakeholder id ${stakeholder.id}). Unless I name another stakeholder, this is about them.]\n\n${text}`
      : undefined,
    onEvent: (event) => {
      if (event.type !== "draft" || !event.draft || typeof event.draft !== "object") return;
      const card = event.draft as DraftCard;
      setSeen((prev) => ({ ...prev, [card.id]: draftViewFromCard(card, prev[card.id] ?? drafts.find((d) => d.id === card.id)) }));
      // Brings the stored draft with its request and, if the agent itself resolved one, the changed project.
      router.refresh();
    },
  });

  /** Pending drafts from the page, plus what this panel saw or resolved, oldest first so the newest sits by the composer. */
  const shown = useMemo(() => {
    const byId = new Map(drafts.map((d) => [d.id, d]));
    for (const d of Object.values(seen)) {
      const listedDraft = byId.get(d.id);
      if (d.status !== "pending") byId.set(d.id, { ...d, request: d.request ?? listedDraft?.request ?? null });
      else if (!listedDraft) byId.set(d.id, d);
    }
    return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [drafts, seen]);
  const newestPending = shown.findLast((d) => d.status === "pending")?.id;

  const empty = chat.turns.length === 0 && shown.length === 0 && !chat.pending;

  // Keep the newest turn or draft in view, inside the panel. Also on being shown again, when it had no size.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !chat.loaded || hidden) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [chat.loaded, chat.turns.length, chat.pending, shown.length, hidden]);

  function send() {
    if (chat.send(value)) setValue("");
    inputRef.current?.focus();
  }

  function startNewChat() {
    chat.startNewChat();
    setSeen({});
    setErrors({});
    setValue("");
    inputRef.current?.focus();
  }

  async function resolve(draft: DraftView, action: DraftAction) {
    if (busy) return;
    setBusy({ id: draft.id, action });
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== draft.id)));
    let leaving = false;
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectSlug)}/drafts/${encodeURIComponent(draft.id)}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) },
      );
      const data = (await response.json().catch(() => ({}))) as { draft?: DraftCard; error?: string };
      if (!response.ok || !data.draft) {
        const error = data.error ?? `Couldn't ${ACTION_VERB[action]} the draft (HTTP ${response.status}).`;
        setErrors((prev) => ({ ...prev, [draft.id]: error }));
        // Already resolved or gone: the page's list is stale.
        if (response.status === 404 || response.status === 409) router.refresh();
        return;
      }
      const done = draftViewFromCard(data.draft, draft);
      setSeen((prev) => ({ ...prev, [done.id]: done }));
      onResolved?.(done);
      if (done.status === "new-project" && done.newProjectId) {
        leaving = true;
        router.push(`/projects/${done.newProjectId}`);
        return;
      }
      router.refresh();
    } catch {
      setErrors((prev) => ({ ...prev, [draft.id]: "Couldn't reach the server. Check your connection and try again." }));
    } finally {
      if (!leaving) setBusy(null);
    }
  }

  const controls = (
    <>
      <PastChats
        chats={chat.chats}
        currentId={chat.chatId}
        disabled={chat.pending}
        align="right"
        onOpen={(saved) => {
          chat.openChat(saved);
          inputRef.current?.focus();
        }}
      />
      <Button variant="tertiary" onClick={startNewChat} disabled={chat.pending || chat.turns.length === 0}>
        New chat
      </Button>
    </>
  );

  const body = (
    <>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!chat.loaded ? null : empty ? (
          stakeholder ? (
            <EmptyState
              title="Ask for different shots"
              description={`Describe the shots or the change you want for ${stakeholder.company}. The agent drafts new shots and a pitch. Nothing changes until you choose.`}
            />
          ) : (
            <EmptyState
              title="Describe a change"
              description="Tell the agent what changed for a stakeholder, or about a new one. It drafts a new brief, shots and pitch. Nothing changes until you choose."
            />
          )
        ) : (
          <ChatThread
            variant="panel"
            agentName="Project agent"
            turns={chat.turns}
            working={
              chat.pending ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Tag tone="running">Working</Tag>
                  <span>{chat.working ?? "Thinking…"}</span>
                  {chat.startedAt ? <Elapsed since={chat.startedAt} /> : null}
                </span>
              ) : null
            }
          >
            {shown.length > 0 ? (
              <li className="not-first:border-t not-first:border-divider">
                <ol aria-label="Drafts">
                  {shown.map((draft) => (
                    <DraftItem
                      key={draft.id}
                      draft={draft}
                      projectSlug={projectSlug}
                      primary={draft.id === newestPending}
                      busy={busy?.id === draft.id ? busy.action : null}
                      locked={busy !== null && busy.id !== draft.id}
                      error={errors[draft.id] ?? null}
                      onResolve={(action) => resolve(draft, action)}
                      onStakeholderPage={stakeholder?.id === draft.clientId}
                    />
                  ))}
                </ol>
              </li>
            ) : null}
          </ChatThread>
        )}
      </div>
      <div className="flex-none border-t border-divider p-4">
        <ChatComposer
          value={value}
          onChange={setValue}
          onSend={send}
          busy={chat.pending}
          label="Message for the project agent"
          placeholder={stakeholder ? "Describe the shots you want" : "Describe a change to this project"}
          inputRef={inputRef}
          rows={2}
        />
      </div>
    </>
  );

  if (frame === "bare") {
    return (
      <div aria-label="Project agent" role="region" className={cx(hidden ? "hidden" : "flex", "min-h-0 flex-1 flex-col", className)}>
        <Toolbar>{controls}</Toolbar>
        {body}
      </div>
    );
  }

  return (
    <Panel aria-labelledby={titleId} className={cx(hidden ? "hidden" : "flex", "min-h-0 flex-col", className)} flush>
      {/* Panel's own header row, but allowed to wrap: on a phone the chat controls drop under the title. Relative, so
          the past-chats list opens inside the panel's width. */}
      <div className="app-panel-head relative flex-wrap gap-y-1">
        <h2 id={titleId} className="app-h-section app-panel-title">
          Project agent
        </h2>
        {/* ml-auto keeps the controls on the right when they wrap. */}
        <div className="app-panel-end ml-auto">{controls}</div>
      </div>
      {body}
    </Panel>
  );
}

/** The chat controls when the panel's header row holds tabs: a slim row of their own, on the right. */
function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-10 flex-none items-center justify-end gap-3 border-b border-divider px-5 py-1">
      {children}
    </div>
  );
}

/** Seconds since the run started, ticking. Hidden from screen readers so the live line isn't re-read every second. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span aria-hidden className="app-num text-xs">
      {Math.max(0, Math.floor((now - since) / 1000))} s
    </span>
  );
}
