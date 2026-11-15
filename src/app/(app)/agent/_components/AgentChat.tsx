"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Heading } from "@/components/ui/Heading";
import { cx } from "@/lib/cx";

/** A turn in the thread. "error" turns are shown but never sent back to the model. */
type Turn = { id: number; role: "user" | "assistant" | "error"; text: string };

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt";

/**
 * A prompt box with a thread. Each prompt goes to POST /api/agent with the conversation so far;
 * the model's reply is shown under it. If the call fails, the error is shown, never a made-up reply.
 */
export function AgentChat() {
  const [value, setValue] = useState("");
  const [prompts, setPrompts] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(0);
  const inputId = useId();
  const hintId = useId();

  const empty = value.trim().length === 0;
  // One prompt at a time: the send button waits for the reply.
  const blocked = empty || pending;
  const hasThread = prompts.length > 0;

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
    setPrompts((list) => [...list, { id, role, text }]);
  }

  async function send() {
    const text = value.trim();
    if (!text || pending) return;
    const thread = [
      ...prompts.flatMap((t) => (t.role === "error" ? [] : [{ role: t.role, content: t.text }])),
      { role: "user" as const, content: text },
    ];
    append("user", text);
    setValue("");
    setPending(true);
    inputRef.current?.focus();
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: thread }),
      });
      const data = (await response.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (response.ok && data.reply) append("assistant", data.reply);
      else append("error", data.error ?? `The agent didn't answer (HTTP ${response.status}).`);
    } catch {
      append("error", "Couldn't reach the agent. Check your connection and try again.");
    } finally {
      setPending(false);
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
      {hasThread ? (
        <ol aria-label="Prompts" className="flex flex-1 flex-col gap-6 pt-12 pb-6">
          {prompts.map((turn) =>
            turn.role === "error" ? (
              <li key={turn.id} role="alert" className="tm-text--s tm-muted px-5">
                {turn.text}
              </li>
            ) : (
              <li key={turn.id}>
                <article className={cx("p-5", turn.role === "user" ? "border border-rule/40 bg-sheet" : "px-5")}>
                  <p className="tm-label tm-muted">{turn.role === "user" ? "You" : "Agent"}</p>
                  <p className="tm-text--m mt-2 break-words whitespace-pre-wrap">{turn.text}</p>
                </article>
              </li>
            ),
          )}
          {pending ? (
            <li aria-live="polite" className="tm-text--s tm-muted px-5">
              Thinking…
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
              "tm-body block max-h-[calc(10lh+24px)] w-full resize-none overflow-y-auto bg-transparent px-5 py-3 text-ink",
              "placeholder:text-asphalt/45 focus:outline-none",
            )}
          />
          <div className="flex items-center justify-between gap-4 border-t border-rule/40 py-2 pr-2 pl-5">
            <p id={hintId} className="tm-label tm-muted">
              Enter to send · Shift+Enter for a new line
            </p>
            <button
              type="submit"
              aria-label="Send"
              title="Send (Enter)"
              disabled={blocked}
              className={cx(
                "grid size-10 shrink-0 place-items-center",
                "transition-[background-color,color,transform] duration-150 ease-out motion-reduce:transition-none",
                focusRing,
                blocked
                  ? "cursor-not-allowed bg-stucco text-concrete"
                  : "bg-cone text-asphalt hover:bg-[color-mix(in_oklab,var(--tm-cone),var(--tm-asphalt)_14%)] active:scale-[0.97] motion-reduce:active:scale-100",
              )}
            >
              <ArrowUp size={16} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        </form>
      </div>
      {hasThread ? null : <div aria-hidden className="flex-[3]" />}
    </div>
  );
}
