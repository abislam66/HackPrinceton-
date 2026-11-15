"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { IconButton } from "@/components/ui/IconButton";
// Type only: erased at build time, so the server-only module never reaches the browser.
import type { AgentEvent } from "@/features/agent/chat";
import { loadChats, newChat, saveChat, threadFor, titleFor, type Chat } from "@/features/agent/history";
import { cx } from "@/lib/cx";

/** A turn in the thread. "error" turns are shown but never sent back to the model. */
type Turn = { id: number; role: "user" | "assistant" | "error"; text: string };

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cone";

/** "14:05" for today, else "Nov 14". */
function formatWhen(ms: number): string {
  const date = new Date(ms);
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** "research_dossier" → "research dossier", for the working line. */
function toolLabel(tool: string): string {
  return tool.replaceAll("_", " ");
}

/**
 * A prompt box with a thread. Each prompt goes to POST /api/agent with the conversation so far;
 * the model's reply is shown under it. If the call fails, the error is shown, never a made-up reply.
 */
export function AgentChat() {
  const [value, setValue] = useState("");
  const [prompts, setPrompts] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  /** What the agent is doing right now (which tool, latest progress line), while a reply is pending. */
  const [working, setWorking] = useState<string | null>(null);
  /** Saved chats, newest first, and the one on screen. History lives in this browser only. */
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  /** Set when the thread changes by sending, so opening a saved chat doesn't re-save it. */
  const dirty = useRef(false);
  const historyRef = useRef<HTMLDetailsElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(0);
  const inputId = useId();
  const hintId = useId();

  const empty = value.trim().length === 0;
  // One prompt at a time: the send button waits for the reply.
  const blocked = empty || pending;
  const hasThread = prompts.length > 0;

  // Coming back to the tab reopens the latest chat. localStorage only exists in the browser, so this
  // has to run after hydration; reading it during render would make server and client disagree.
  useEffect(() => {
    const saved = loadChats();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser storage after mount
    setChats(saved);
    if (saved[0]) openTurns(saved[0]);
    else setChatId(newChat().id);
  }, []);

  // Save the chat on screen after every change made by sending.
  useEffect(() => {
    if (!dirty.current || !chatId) return;
    dirty.current = false;
    const turns = prompts.map(({ role, text }) => ({ role, text }));
    setChats(saveChat({ id: chatId, title: titleFor(turns), updatedAt: Date.now(), turns }));
  }, [prompts, chatId]);

  function openTurns(chat: Chat) {
    setChatId(chat.id);
    setPrompts(chat.turns.map((turn) => ({ ...turn, id: (nextId.current += 1) })));
  }

  function openChat(chat: Chat) {
    if (pending) return;
    dirty.current = false;
    openTurns(chat);
    inputRef.current?.focus();
  }

  function startNewChat() {
    if (pending) return;
    dirty.current = false;
    setChatId(newChat().id);
    setPrompts([]);
    setValue("");
    inputRef.current?.focus();
  }

  // Autofocus on load, but not on touch screens, where it would throw the keyboard open.
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    inputRef.current?.focus();
  }, []);

  // Grow with the text; the CSS max-height caps it at about 10 lines, then it scrolls inside.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  // Keep the newest prompt in view.
  useEffect(() => {
    if (!hasThread) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The composer docks over the bottom of the page, so scroll the page to its end, not the message to the viewport edge.
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [prompts.length, hasThread]);

  function append(role: Turn["role"], text: string) {
    nextId.current += 1;
    const id = nextId.current;
    dirty.current = true;
    setPrompts((list) => [...list, { id, role, text }]);
  }

  async function send() {
    const text = value.trim();
    if (!text || pending) return;
    const thread = threadFor([...prompts, { role: "user", text }]);
    append("user", text);
    setValue("");
    setPending(true);
    inputRef.current?.focus();
    setWorking(null);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: thread }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        append("error", data.error ?? `The agent didn't answer (HTTP ${response.status}).`);
        return;
      }
      // One JSON event per line: tool starts and progress while it works, then a reply or an error.
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let answered = false;
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AgentEvent;
          if (event.type === "tool") setWorking(`Running ${toolLabel(event.tool)}…`);
          else if (event.type === "progress") setWorking(`${toolLabel(event.tool)}: ${event.message}`);
          else if (event.type === "reply") {
            append("assistant", event.text);
            answered = true;
          } else {
            append("error", event.error);
            answered = true;
          }
        }
      }
      if (!answered) append("error", "The agent stopped before answering. Try again.");
    } catch {
      append("error", "Couldn't reach the agent. Check your connection and try again.");
    } finally {
      setPending(false);
      setWorking(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    // Enter during IME composition picks a candidate; it must not send.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    send();
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col px-5">
      <nav aria-label="Chats" className="flex flex-none items-center justify-between gap-3 pt-6">
        {chats.length > 0 ? (
          <details ref={historyRef} className="relative">
            <summary
              className={cx("cursor-pointer text-[13px] leading-5 font-medium text-muted select-none hover:text-ink", focusRing)}
            >
              Past chats (<span className="app-num">{chats.length}</span>)
            </summary>
            <ul className="absolute left-0 z-10 mt-2 flex max-h-[60vh] w-[min(480px,85vw)] flex-col overflow-y-auto rounded-[2px] border border-line bg-sheet p-1">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => {
                      openChat(chat);
                      if (historyRef.current) historyRef.current.open = false;
                    }}
                    disabled={pending}
                    aria-current={chat.id === chatId ? "true" : undefined}
                    className={cx(
                      "flex w-full items-baseline justify-between gap-4 px-3 py-2 text-left hover:bg-stucco disabled:cursor-not-allowed",
                      chat.id === chatId && "bg-stucco",
                      focusRing,
                    )}
                  >
                    <span className="truncate text-[13px] leading-5">{chat.title}</span>
                    <span className="app-num shrink-0 text-xs text-muted">{formatWhen(chat.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <span aria-hidden />
        )}
        <Button variant="secondary" onClick={startNewChat} disabled={pending || !hasThread}>
          New chat
        </Button>
      </nav>
      {hasThread ? (
        <ol aria-label="Prompts" className="flex flex-1 flex-col gap-6 pt-12 pb-6">
          {prompts.map((turn) =>
            turn.role === "error" ? (
              <li key={turn.id} role="alert" className="px-5 text-[13px] leading-[18px] text-muted">
                {turn.text}
              </li>
            ) : (
              <li key={turn.id}>
                <article className={cx("p-5", turn.role === "user" ? "rounded-[2px] border border-line bg-sheet" : "px-5")}>
                  <p className="text-xs leading-4 text-muted">{turn.role === "user" ? "You" : "Agent"}</p>
                  <p className="mt-2 text-[15px] leading-6 break-words whitespace-pre-wrap">{turn.text}</p>
                </article>
              </li>
            ),
          )}
          {pending ? (
            <li aria-live="polite" className="px-5 text-[13px] leading-[18px] text-muted">
              {working ?? "Thinking…"}
            </li>
          ) : null}
        </ol>
      ) : (
        // Empty state: 2:3 spacers sit the lone composer group a little above center.
        <div aria-hidden className="flex-[2]" />
      )}

      <div className={cx(hasThread ? "sticky bottom-0 bg-ground pt-2 pb-6" : "flex-none")}>
        {hasThread ? null : (
          <Heading size="s" as="h1" className="mb-8">
            What do you need done?
          </Heading>
        )}
        <form
          onSubmit={onSubmit}
          className={cx(
            "rounded-[2px] border border-asphalt/55 bg-sheet",
            "focus-within:border-asphalt focus-within:outline-1 focus-within:outline-asphalt",
            "transition-[border-color] duration-200 ease-out motion-reduce:transition-none",
          )}
        >
          <label htmlFor={inputId} className="sr-only">
            Prompt for the agent
          </label>
          <textarea
            id={inputId}
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            spellCheck
            autoComplete="off"
            enterKeyHint="send"
            aria-describedby={hintId}
            placeholder="Describe a task for the agent"
            className={cx(
              // A fixed 16 px at every width, so iOS never zooms on focus (the fluid brand body size grew to 19 px).
              "block max-h-[calc(10lh+24px)] w-full resize-none overflow-y-auto bg-transparent px-5 py-3 text-base leading-6 text-ink",
              "placeholder:text-asphalt/45 focus:outline-none",
            )}
          />
          <div className="flex items-center justify-between gap-4 border-t border-rule/40 py-2 pr-2 pl-5">
            <p id={hintId} className="text-xs leading-4 text-muted">
              <kbd className="app-num">Enter</kbd> to send · <kbd className="app-num">Shift+Enter</kbd> for a new line
            </p>
            <IconButton
              type="submit"
              variant="primary"
              icon={<ArrowUp />}
              label="Send"
              shortcut="↵"
              tooltipSide="top"
              disabled={blocked}
            />
          </div>
        </form>
      </div>
      {hasThread ? null : <div aria-hidden className="flex-[3]" />}
    </div>
  );
}
