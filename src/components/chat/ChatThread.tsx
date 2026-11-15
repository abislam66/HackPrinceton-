import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import type { Turn } from "./useAgentChat";

export type ChatThreadProps = {
  turns: Turn[];
  /** Who answers, as the label over its turns: "Agent", "Project agent". */
  agentName?: string;
  /** The live line while a reply is pending: what the agent is doing. Null when nothing is pending. */
  working: ReactNode;
  /**
   * `page`: the Agent tab, a centered column with your prompts framed on Sheet. `panel`: inside a Panel, turns run
   * edge to edge, yours on Stucco, so nothing draws a box inside the panel.
   */
  variant?: "page" | "panel";
  /** Extra items after the turns, inside the list (a project agent's drafts). */
  children?: ReactNode;
  className?: string;
};

/** The thread: your prompts and the agent's answers in order, errors as muted alerts, then what it's doing now. */
export function ChatThread({ turns, agentName = "Agent", working, variant = "page", children, className }: ChatThreadProps) {
  const panel = variant === "panel";
  return (
    <ol aria-label="Messages" className={cx("flex flex-col", panel ? "" : "gap-6", className)}>
      {turns.map((turn) =>
        turn.role === "error" ? (
          <li key={turn.id} role="alert" className={cx("px-5 text-[13px] leading-[18px] text-muted", panel && "py-3")}>
            {turn.text}
          </li>
        ) : (
          <li key={turn.id}>
            <article
              className={cx(
                "p-5",
                turn.role === "user" && (panel ? "bg-stucco" : "rounded-[2px] border border-line bg-sheet"),
                turn.role === "assistant" && !panel && "px-5",
              )}
            >
              <p className="text-xs leading-4 text-muted">{turn.role === "user" ? "You" : agentName}</p>
              <p className={cx("mt-2 break-words whitespace-pre-wrap", panel ? "text-sm leading-[22px]" : "text-[15px] leading-6")}>
                {turn.text}
              </p>
            </article>
          </li>
        ),
      )}
      {working !== null ? (
        <li aria-live="polite" className={cx("px-5 text-[13px] leading-[18px] text-muted", panel && "py-4")}>
          {working}
        </li>
      ) : null}
      {children}
    </ol>
  );
}
