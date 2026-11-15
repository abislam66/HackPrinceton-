"use client";

import { useEffect, useId, useLayoutEffect, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";

export type AgentComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  pending: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Primary unless a fresh result's Open holds the view's one Cone. */
  sendVariant: ButtonVariant;
};

/**
 * The Agent page's prompt box: a textarea that grows to about 10 lines, then Send, or Stop while a reply is pending.
 * Enter sends, Shift+Enter breaks the line, and Enter while an IME is composing picks a candidate instead. The
 * keyboard hint shows only while the box has focus. (The project agent keeps components/chat/ChatComposer.)
 */
export function AgentComposer({ value, onChange, onSend, onStop, pending, inputRef, sendVariant }: AgentComposerProps) {
  const id = useId();
  const hintId = useId();
  const empty = value.trim().length === 0;

  // Focus on arrival, but never on touch screens, where it would throw the keyboard open.
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [inputRef]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // Empty, `rows` sizes it: the placeholder counts toward scrollHeight and would wrap it tall on a narrow load.
    if (!value) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, inputRef]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!pending && !empty) onSend();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (!pending && !empty) onSend();
  }

  return (
    <form onSubmit={onSubmit} className="agent-composer">
      <label htmlFor={id} className="sr-only">
        Prompt for the agent
      </label>
      <textarea
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        spellCheck
        autoComplete="off"
        enterKeyHint="send"
        aria-describedby={hintId}
        placeholder="Describe a task: scout, research a dossier, build a 3D viewer, draft outreach"
        className="agent-input"
      />
      <div className="flex items-center justify-between gap-4 py-2 pr-2 pl-4">
        <p id={hintId} className="agent-hint">
          <kbd className="app-num">Enter</kbd> to send · <kbd className="app-num">Shift+Enter</kbd> for a new line
        </p>
        {pending ? (
          <Button variant="secondary" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button variant={sendVariant} type="submit" disabled={empty}>
            Send
          </Button>
        )}
      </div>
    </form>
  );
}
