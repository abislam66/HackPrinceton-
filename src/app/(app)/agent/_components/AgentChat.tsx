"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Heading } from "@/components/ui/Heading";
import { cx } from "@/lib/cx";

type Prompt = { id: number; text: string };

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt";

/**
 * A prompt box with a local thread. Nothing is sent anywhere: each prompt is shown back with a
 * line saying the agent is not connected, never a made-up reply.
 */
export function AgentChat() {
  const [value, setValue] = useState("");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(0);
  const inputId = useId();
  const hintId = useId();

  const empty = value.trim().length === 0;
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

  function send() {
    const text = value.trim();
    if (!text) return;
    nextId.current += 1;
    setPrompts((list) => [...list, { id: nextId.current, text }]);
    setValue("");
    inputRef.current?.focus();
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
          {prompts.map((prompt) => (
            <li key={prompt.id} className="flex flex-col gap-3">
              <article className="border border-rule/40 bg-sheet p-5">
                <p className="tm-label tm-muted">You</p>
                <p className="tm-text--m mt-2 break-words whitespace-pre-wrap">{prompt.text}</p>
              </article>
              <p className="tm-text--s tm-muted px-5">The agent isn&apos;t connected yet.</p>
            </li>
          ))}
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
              disabled={empty}
              className={cx(
                "grid size-10 shrink-0 place-items-center",
                "transition-[background-color,color,transform] duration-150 ease-out motion-reduce:transition-none",
                focusRing,
                empty
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
