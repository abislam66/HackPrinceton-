"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";

type Props = {
  /** The text to copy. */
  text: string;
  /** The button label, e.g. "Copy link". */
  label: string;
  /** The element showing the text. Selected instead when the clipboard is not available. */
  targetId: string;
};

/** Copies text to the clipboard. Reads "Copied" for a moment; falls back to selecting the text. */
export function CopyButton({ text, label, targetId }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "selected">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function flash(next: "copied" | "selected") {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  function selectText() {
    const el = document.getElementById(targetId);
    const selection = window.getSelection();
    if (!el || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
    flash("selected");
  }

  async function copy() {
    if (!navigator.clipboard?.writeText) {
      selectText();
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      flash("copied");
    } catch {
      selectText();
    }
  }

  const shown = state === "copied" ? "Copied" : state === "selected" ? "Selected" : label;
  return (
    <>
      <Button arrow={false} compact onClick={copy}>
        {shown}
      </Button>
      <span className="sr-only" role="status">
        {state === "copied" ? "Copied to clipboard" : state === "selected" ? "Text selected, copy it with your keyboard" : ""}
      </span>
    </>
  );
}
