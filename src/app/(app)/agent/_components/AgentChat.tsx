"use client";

import { ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAgentChat, type AgentChat as Chat } from "@/components/chat/useAgentChat";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { projectLinks } from "@/features/agent/reply";
import { isResult, primaryOf, type Run, type RunStatus } from "@/features/agent/runs";
import { cx } from "@/lib/cx";
import { AgentComposer } from "./AgentComposer";
import { AgentTurn } from "./AgentTurn";
import { PastChatsMenu } from "./PastChatsMenu";
import { ResultNotice, type Notice } from "./ResultNotice";
import { RunCard } from "./RunCard";
import { reduceMotion } from "./run-view";
import "./agent.css";

/**
 * The Agent tab, "Handoff" (docs/agent-page-audit.md): the conversation on the left, a sticky Runs rail on the right
 * with one card per tool call, and results that take you where they live. A finished run with destinations shows a
 * preview and one Open link in the rail, the reply ends with result rows (each one link), and a result that lands
 * while the rail is out of view raises a quiet notice above the composer.
 *
 * Cone rule: the newest result's Open takes the Cone while it is unread and its rail is on screen, and Send drops to
 * secondary. Typing a prompt, or following any of that result's links, reads it and the Cone goes back to Send. So
 * there is exactly one Cone in view.
 */

/** The rail is a column from this width of the page's own box; below it, a "Runs (n)" toggle above the thread. */
const WIDE_PX = 1100;
const NOTICE_MS = 6000;

/** The jobs the agent can do, each a real prompt that lands in the composer for the user to edit or send. */
const QUICK: { label: string; prompt: string }[] = [
  { label: "Scout projects", prompt: "Scout all five regions for new projects we could film" },
  { label: "Research a dossier", prompt: "Research a dossier on Morgan Hall North" },
  { label: "Build a 3D viewer", prompt: "Build a 3D viewer for 8 Carlisle" },
  { label: "Draft outreach", prompt: "Draft the outreach email for Temple University" },
];

function titleOf(chat: Chat): string {
  const saved = chat.chats.find((c) => c.id === chat.chatId)?.title;
  if (saved) return saved;
  const first = chat.turns.find((t) => t.role === "user")?.text.trim().replace(/\s+/g, " ");
  if (!first) return "New chat";
  return first.length > 60 ? `${first.slice(0, 59).trimEnd()}…` : first;
}

/** True when the element is on screen and inside the rail's scroll box, by at least 40 px. */
function inView(el: Element | null): boolean {
  if (!el || el.getClientRects().length === 0) return false;
  const r = el.getBoundingClientRect();
  let top = 0;
  let bottom = window.innerHeight;
  const scroller = el.closest(".agent-rail-scroll");
  if (scroller) {
    const s = scroller.getBoundingClientRect();
    top = Math.max(top, s.top);
    bottom = Math.min(bottom, s.bottom);
  }
  return r.top < bottom - 40 && r.bottom > top + 40;
}

/** The clock for elapsed times: ticks every second while a run is running, otherwise holds still. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);
  // Between ticks a run that just started can be newer than `now`; elapsedOf clamps that to 0:00.
  return now;
}

export function AgentChat() {
  const chat = useAgentChat({ endpoint: "/api/agent" });
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hasThread = chat.turns.length > 0;
  const running = chat.runs.some((r) => r.status === "running");
  const now = useNow(running);
  const runsNewestFirst = useMemo(() => [...chat.runs].reverse(), [chat.runs]);
  const links = useMemo(() => projectLinks(chat.runs), [chat.runs]);

  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [railOpen, setRailOpen] = useState(false);
  const [hover, setHover] = useState<{ runId?: string; turnId?: number } | null>(null);
  const [flash, setFlash] = useState<{ runId?: string; turnId?: number; key: number } | null>(null);

  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A result is read once the user follows one of its links or starts typing the next prompt. Results already there
  // when a chat opens (a reload, a past chat) count as read: the Cone is for news.
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const [seenChat, setSeenChat] = useState<string | null>(null);
  if (chat.chatId !== seenChat) {
    setSeenChat(chat.chatId);
    setSeen(new Set(chat.runs.map((r) => r.id)));
  }
  const markSeen = useCallback((runId: string) => {
    setSeen((s) => (s.has(runId) ? s : new Set(s).add(runId)));
  }, []);
  const newestResult = chat.runs.findLast(isResult);
  const unread = newestResult && !seen.has(newestResult.id) ? newestResult : undefined;
  const coneRunId = unread && (wide || railOpen) ? unread.id : undefined;

  // ---- The notice: results that finished out of sight.
  const [notice, setNotice] = useState<Notice | null>(null);
  const [noticeShown, setNoticeShown] = useState(false);
  const [noticeHeld, setNoticeHeld] = useState(false);
  const prevStatus = useRef<Map<string, RunStatus>>(new Map());

  useEffect(() => {
    const prev = prevStatus.current;
    const fresh = chat.runs.filter((r) => prev.get(r.id) === "running" && isResult(r));
    prevStatus.current = new Map(chat.runs.map((r) => [r.id, r.status]));
    if (fresh.length === 0) return;
    // After this commit's layout; not cancelled on the next runs change, so a progress tick can't drop the notice.
    window.setTimeout(() => {
      const root = rootRef.current;
      if (!root) return;
      const hidden = fresh.filter((r) => !inView(root.querySelector(`[data-run-id="${CSS.escape(r.id)}"] .agent-open`)));
      if (hidden.length === 0) return;
      const turnId = hidden[0].turnId;
      setNotice((n) => {
        const kept = n && n.turnId === turnId ? n.items.filter((i) => !hidden.some((h) => h.id === i.runId)) : [];
        const added = hidden.flatMap((r) => {
          const dest = primaryOf(r);
          return dest ? [{ runId: r.id, dest }] : [];
        });
        return { turnId, items: [...kept, ...added], key: Date.now() };
      });
      setNoticeShown(true);
    }, 0);
  }, [chat.runs]);

  const dismissNotice = useCallback((clear: boolean) => {
    setNoticeShown(false);
    setNoticeHeld(false);
    if (clear) setNotice(null);
  }, []);

  // Auto-dismiss, paused while the pointer or focus is on it. Dismissed items stay so a second result of the same
  // prompt stacks with them; Escape, Open or the next prompt clears them.
  useEffect(() => {
    if (!noticeShown || noticeHeld) return;
    const id = window.setTimeout(() => setNoticeShown(false), NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [noticeShown, noticeHeld, notice?.key]);

  useEffect(() => {
    if (!noticeShown) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismissNotice(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [noticeShown, dismissNotice]);

  // Keep the newest turn in view: the composer docks at the bottom of the page, which scrolls. Instant on load.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!hasThread) return;
    const smooth = mountedRef.current && !reduceMotion();
    mountedRef.current = true;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, [chat.turns.length, hasThread]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1400);
    return () => window.clearTimeout(id);
  }, [flash]);

  /** A run's card is open by hand, or by default while running or in the newest prompt with results. */
  const latestResultTurn = newestResult?.turnId;
  const isOpen = (run: Run) =>
    toggled[run.id] ?? (run.status === "running" || (isResult(run) && run.turnId === latestResultTurn));

  function changeDraft(next: string) {
    setValue(next);
    if (unread && next.trim()) markSeen(unread.id);
  }

  function send(text = value) {
    if (chat.send(text)) {
      setValue("");
      dismissNotice(true);
    }
    inputRef.current?.focus();
  }

  function resetView() {
    setToggled({});
    dismissNotice(true);
  }

  function startNewChat() {
    chat.startNewChat();
    setValue("");
    resetView();
    inputRef.current?.focus();
  }

  const showRun = useCallback((runId: string) => {
    setToggled((t) => ({ ...t, [runId]: true }));
    setRailOpen(true);
    setFlash({ runId, key: Date.now() });
    requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-run-id="${CSS.escape(runId)}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
      el.querySelector<HTMLButtonElement>(".agent-run-head")?.focus({ preventScroll: true });
    });
  }, []);

  const showTurn = useCallback((turnId: number) => {
    setFlash({ turnId, key: Date.now() });
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`);
    el?.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
  }, []);

  const lastUser = chat.turns.findLast((t) => t.role === "user");

  return (
    <div ref={rootRef} className="agent-page">
      <div className="flex min-h-dvh flex-col px-8 pt-8">
        <div className="agent-head">
          <PageHeader
            title="Agent"
            description={<span className="agent-desc">{titleOf(chat)}</span>}
            actions={
              <>
                <PastChatsMenu
                  chats={chat.chats}
                  currentId={chat.chatId}
                  disabled={chat.pending}
                  onOpen={(saved) => {
                    chat.openChat(saved);
                    resetView();
                    inputRef.current?.focus();
                  }}
                />
                <Button variant="secondary" onClick={startNewChat} disabled={chat.pending || !hasThread}>
                  New chat
                </Button>
              </>
            }
          />
        </div>

        <div className="agent-cols">
          <button
            type="button"
            className="agent-rail-toggle"
            aria-expanded={railOpen}
            aria-controls="agent-rail"
            onClick={() => setRailOpen((o) => !o)}
          >
            {railOpen ? (
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
            ) : (
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
            )}
            <span>
              Runs <span className="app-num">({chat.runs.length})</span>
            </span>
            {running ? <Tag tone="running">Running</Tag> : unread ? <Tag tone="ready">Result ready</Tag> : null}
          </button>

          <section aria-label="Conversation" className="agent-convo">
            <div className="agent-thread">
              {hasThread ? (
                <ol className="flex flex-col gap-8 pb-8">
                  {chat.turns.map((turn, index) => {
                    const promptTurn = chat.turns.slice(0, index).findLast((t) => t.role === "user");
                    return (
                      <AgentTurn
                        key={turn.id}
                        turn={turn}
                        now={now}
                        pending={chat.pending}
                        runs={turn.role === "user" ? chat.runs.filter((r) => r.turnId === turn.id) : []}
                        resultRuns={
                          turn.role === "assistant" && promptTurn
                            ? chat.runs.filter((r) => r.turnId === promptTurn.id && isResult(r))
                            : []
                        }
                        links={links}
                        lit={hover?.turnId === turn.id || flash?.turnId === turn.id}
                        flashKey={flash?.turnId === turn.id ? flash.key : undefined}
                        litRun={hover?.runId}
                        onShowRun={showRun}
                        onHoverRun={(runId) => setHover(runId ? { runId } : null)}
                        onFollow={markSeen}
                        onRetry={() => {
                          const prompt = chat.turns.findLast((t) => t.role === "user" && t.id < turn.id);
                          if (prompt) send(prompt.text);
                        }}
                      />
                    );
                  })}
                  {chat.pending && lastUser && !chat.runs.some((r) => r.turnId === lastUser.id && r.status === "running") ? (
                    <li className="agent-measure flex items-center gap-2 text-sm text-muted" aria-live="polite">
                      <LoaderCircle size={14} strokeWidth={1.75} className="app-spin" aria-hidden />
                      Thinking…
                    </li>
                  ) : null}
                </ol>
              ) : null}
            </div>

            <div className={cx("agent-dock", hasThread && "agent-dock--docked")}>
              <div className="agent-dock-inner">
                <ResultNotice
                  notice={notice}
                  shown={noticeShown}
                  onHold={setNoticeHeld}
                  onFollow={(runId) => {
                    markSeen(runId);
                    dismissNotice(true);
                  }}
                  onDismiss={() => dismissNotice(true)}
                />
                <AgentComposer
                  value={value}
                  onChange={changeDraft}
                  onSend={() => send()}
                  onStop={chat.stop}
                  pending={chat.pending}
                  inputRef={inputRef}
                  sendVariant={coneRunId ? "secondary" : "primary"}
                />
              </div>
              {/* Not before history loads: a saved chat may be about to fill the page. */}
              {hasThread || !chat.loaded ? null : (
                <div className="agent-quick" role="group" aria-label="What the agent can do">
                  {QUICK.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      className="agent-quick-item"
                      onClick={() => {
                        setValue(q.prompt);
                        requestAnimationFrame(() => {
                          const el = inputRef.current;
                          if (!el) return;
                          el.focus();
                          el.setSelectionRange(el.value.length, el.value.length);
                        });
                      }}
                    >
                      <span className="agent-quick-label">{q.label}</span>
                      <span className="agent-quick-prompt">{q.prompt}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside id="agent-rail" aria-label="Runs" className="agent-rail" data-open={railOpen ? "" : undefined}>
            <Panel title="Runs" count={chat.runs.length} flush className="flex min-h-0 flex-1 flex-col">
              <div className="agent-rail-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {runsNewestFirst.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">
                    Scouts, dossiers, 3D models and drafts the agent makes in this chat show here, each with a link to where
                    it lives.
                  </p>
                ) : (
                  <ol>
                    {runsNewestFirst.map((run) => (
                      <RunCard
                        key={run.id}
                        run={run}
                        now={now}
                        open={isOpen(run)}
                        cone={coneRunId === run.id}
                        lit={hover?.runId === run.id || flash?.runId === run.id}
                        flashKey={flash?.runId === run.id ? flash.key : undefined}
                        onToggle={() => setToggled((t) => ({ ...t, [run.id]: !isOpen(run) }))}
                        onStop={chat.stop}
                        onShowTurn={() => showTurn(run.turnId)}
                        onHover={(on) => setHover(on ? { turnId: run.turnId } : null)}
                        onFollow={() => markSeen(run.id)}
                      />
                    ))}
                  </ol>
                )}
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}
