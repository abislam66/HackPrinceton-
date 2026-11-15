"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  STORAGE_KEY,
  loadChats,
  newChat,
  restoreRuns,
  saveChat,
  saveRuns,
  threadFor,
  titleFor,
  type Chat,
} from "@/features/agent/history";
import { STOPPED_TEXT, reduceRuns, settleRuns, type Run } from "@/features/agent/runs";

/** A turn on screen. "error" turns are shown but never sent back to the model. */
export type Turn = { id: number; role: "user" | "assistant" | "error"; text: string };

/** One line of an agent's NDJSON stream, as parsed. Every agent sends tool, progress, reply and error; some add more. */
export type StreamEvent = { type: string } & Record<string, unknown>;

export type UseAgentChatOptions = {
  /** The route that streams the agent's NDJSON events. Body: `{messages}`. */
  endpoint: string;
  /** Where this chat's history lives in localStorage. Defaults to the Agent tab's key. */
  storageKey?: string;
  /** Turns a tool name into the working line. Defaults to "Running research dossier…". */
  toolLabel?: (tool: string) => string;
  /** Every event, before the hook handles the common ones. `prompt` is the text that started the run. */
  onEvent?: (event: StreamEvent, prompt: string) => void;
  /**
   * Adds context to each of the user's prompts as the model gets them, e.g. which stakeholder page the chat is on.
   * The thread on screen and in history keeps the prompt as typed.
   */
  framePrompt?: (text: string) => string;
};

export type AgentChat = {
  turns: Turn[];
  /** Saved chats in this browser, newest first. */
  chats: Chat[];
  chatId: string | null;
  /** History has been read from this browser. Before that, show no empty state: it may be about to fill. */
  loaded: boolean;
  /** A prompt is out; the next one waits for its answer. */
  pending: boolean;
  /** What the agent is doing right now (which tool, the latest progress line), while pending. */
  working: string | null;
  /** When the pending run started (epoch ms), for an elapsed-time readout. */
  startedAt: number | null;
  /** The chat's tool calls, oldest first, each with its steps and, once done, where its results live. */
  runs: Run[];
  /**
   * Stops reading the pending reply: open runs show as stopped and the thread says the server may still finish the
   * job. No-op when nothing is pending.
   */
  stop: () => void;
  /** Sends a prompt. False when it is empty or a reply is still pending, so the caller keeps the text. */
  send: (text: string) => boolean;
  openChat: (chat: Chat) => void;
  startNewChat: () => void;
};

function defaultToolLabel(tool: string): string {
  return `Running ${tool.replaceAll("_", " ")}…`;
}

/**
 * A chat with one of the app's agents: the thread, history saved in this browser, and the NDJSON stream from
 * `endpoint` (tool starts and progress while it works, then one reply or error). If a call fails, the error is shown
 * as a turn, never a made-up reply. Shared by the Agent tab and the project agent.
 */
export function useAgentChat({
  endpoint,
  storageKey = STORAGE_KEY,
  toolLabel,
  onEvent,
  framePrompt,
}: UseAgentChatOptions): AgentChat {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  /** Set when the thread changes by sending, so opening a saved chat doesn't re-save it. */
  const dirty = useRef(false);
  const nextId = useRef(0);
  // Mirrors for the async run, which outlives the render that started it.
  const turnsRef = useRef<Turn[]>([]);
  const runsRef = useRef<Run[]>([]);
  const pendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  /** Set by stop(), so the aborted read says it was stopped (leaving the page aborts it quietly). */
  const stoppedRef = useRef(false);
  const handlers = useRef({ toolLabel, onEvent, framePrompt });
  useEffect(() => {
    handlers.current = { toolLabel, onEvent, framePrompt };
  });

  const showTurns = useCallback((next: Turn[]) => {
    turnsRef.current = next;
    setTurns(next);
  }, []);

  const showRuns = useCallback((next: Run[]) => {
    runsRef.current = next;
    setRuns(next);
  }, []);

  const openTurns = useCallback(
    (chat: Chat) => {
      setChatId(chat.id);
      const opened = chat.turns.map((turn) => ({ ...turn, id: (nextId.current += 1) }));
      showTurns(opened);
      showRuns(restoreRuns(chat.runs, opened.map((t) => t.id)));
    },
    [showTurns, showRuns],
  );

  // Coming back reopens the latest chat. localStorage only exists in the browser, so this runs after hydration;
  // reading it during render would make server and client disagree.
  useEffect(() => {
    const saved = loadChats(undefined, storageKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser storage after mount
    setChats(saved);
    if (saved[0]) openTurns(saved[0]);
    else setChatId(newChat().id);
    setLoaded(true);
  }, [storageKey, openTurns]);

  // Save the chat on screen after every change made by sending, its runs with it.
  useEffect(() => {
    if (!dirty.current || !chatId) return;
    dirty.current = false;
    const plain = turns.map(({ role, text }) => ({ role, text }));
    const saved = saveRuns(runs, turns.map((t) => t.id));
    setChats(
      saveChat({ id: chatId, title: titleFor(plain), updatedAt: Date.now(), turns: plain, runs: saved }, undefined, storageKey),
    );
  }, [turns, runs, chatId, storageKey]);

  // Leaving the page stops reading the stream. The server finishes its work either way.
  useEffect(() => () => abortRef.current?.abort(), []);

  const append = useCallback(
    (role: Turn["role"], text: string) => {
      nextId.current += 1;
      dirty.current = true;
      showTurns([...turnsRef.current, { id: nextId.current, role, text }]);
      return nextId.current;
    },
    [showTurns],
  );

  const updateRuns = useCallback(
    (next: Run[]) => {
      if (next === runsRef.current) return;
      dirty.current = true;
      showRuns(next);
    },
    [showRuns],
  );

  const run = useCallback(
    async (text: string) => {
      const frame = handlers.current.framePrompt;
      const thread = threadFor([...turnsRef.current, { role: "user", text }]).map((turn) =>
        frame && turn.role === "user" ? { ...turn, content: frame(turn.content) } : turn,
      );
      const turnId = append("user", text);
      stoppedRef.current = false;
      pendingRef.current = true;
      setPending(true);
      setWorking(null);
      setStartedAt(Date.now());
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: thread }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          append("error", data.error ?? `The agent didn't answer (HTTP ${response.status}).`);
          return;
        }
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
            let event: StreamEvent;
            try {
              event = JSON.parse(line) as StreamEvent;
            } catch {
              continue; // a torn or foreign line: skip it rather than drop the whole answer
            }
            handlers.current.onEvent?.(event, text);
            updateRuns(reduceRuns(runsRef.current, event, turnId, Date.now()));
            const label = handlers.current.toolLabel ?? defaultToolLabel;
            if (event.type === "tool" && typeof event.tool === "string") setWorking(label(event.tool));
            else if (event.type === "progress" && typeof event.message === "string") setWorking(event.message);
            else if (event.type === "reply" && typeof event.text === "string") {
              append("assistant", event.text);
              answered = true;
            } else if (event.type === "error") {
              append("error", typeof event.error === "string" ? event.error : "The agent hit an error.");
              answered = true;
            }
          }
        }
        if (!answered) {
          const error = "The agent stopped before answering. Try again.";
          updateRuns(settleRuns(runsRef.current, turnId, "failed", Date.now(), error));
          append("error", error);
        }
      } catch {
        if (controller.signal.aborted) {
          if (!stoppedRef.current) return;
          updateRuns(settleRuns(runsRef.current, turnId, "stopped", Date.now()));
          append("error", STOPPED_TEXT);
          return;
        }
        const error = "Couldn't reach the agent. Check your connection and try again.";
        updateRuns(settleRuns(runsRef.current, turnId, "failed", Date.now(), error));
        append("error", error);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        pendingRef.current = false;
        setPending(false);
        setWorking(null);
        setStartedAt(null);
      }
    },
    [append, endpoint, updateRuns],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || pendingRef.current) return false;
      void run(text);
      return true;
    },
    [run],
  );

  const openChat = useCallback(
    (chat: Chat) => {
      if (pendingRef.current) return;
      dirty.current = false;
      openTurns(chat);
    },
    [openTurns],
  );

  const startNewChat = useCallback(() => {
    if (pendingRef.current) return;
    dirty.current = false;
    setChatId(newChat().id);
    showTurns([]);
    showRuns([]);
  }, [showTurns, showRuns]);

  const stop = useCallback(() => {
    if (!pendingRef.current || !abortRef.current) return;
    stoppedRef.current = true;
    abortRef.current.abort();
  }, []);

  return { turns, chats, chatId, loaded, pending, working, startedAt, runs, stop, send, openChat, startNewChat };
}
