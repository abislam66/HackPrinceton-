"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useId, useLayoutEffect, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { cx } from "@/lib/cx";

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter or the send button with the text as typed. */
  onSend: () => void;
  /** The send button waits: a reply is pending. Typing stays open. */
  busy?: boolean;
  /** The textarea's accessible name. */
  label: string;
  placeholder: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Visible lines before it grows. */
  rows?: number;
  /** Focus on load (never on touch screens, where it would throw the keyboard open). */
  autoFocus?: boolean;
  className?: string;
};

/**
 * A chat's prompt box: a textarea that grows to about 10 lines, the keyboard hint and a Cone send button.
 * Enter sends, Shift+Enter breaks the line, and Enter while an IME is composing picks a candidate instead.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  busy = false,
  label,
  placeholder,
  inputRef,
  rows = 3,
  autoFocus = false,
  className,
}: ChatComposerProps) {
  const inputId = useId();
  const hintId = useId();
  const blocked = busy || value.trim().length === 0;

  useEffect(() => {
    if (!autoFocus || window.matchMedia("(pointer: coarse)").matches) return;
    inputRef.current?.focus();
  }, [autoFocus, inputRef]);

  // Grow with the text; the CSS max-height caps it at about 10 lines, then it scrolls inside.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value, inputRef]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!blocked) onSend();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (!blocked) onSend();
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cx(
        "rounded-[2px] border border-asphalt/55 bg-sheet",
        "focus-within:border-asphalt focus-within:outline-1 focus-within:outline-asphalt",
        "transition-[border-color] duration-200 ease-out motion-reduce:transition-none",
        className,
      )}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <textarea
        id={inputId}
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        rows={rows}
        spellCheck
        autoComplete="off"
        enterKeyHint="send"
        aria-describedby={hintId}
        placeholder={placeholder}
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
  );
}
