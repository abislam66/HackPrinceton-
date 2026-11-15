"use client";

import { useEffect, useRef, useState } from "react";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatThread } from "@/components/chat/ChatThread";
import { PastChats } from "@/components/chat/PastChats";
import { useAgentChat } from "@/components/chat/useAgentChat";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { cx } from "@/lib/cx";

/**
 * The Agent tab: a prompt box with a thread. Each prompt goes to POST /api/agent with the conversation so far, and
 * the reply streams in under it. History stays in this browser.
 */
export function AgentChat() {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chat = useAgentChat({ endpoint: "/api/agent" });
  const hasThread = chat.turns.length > 0;

  // Keep the newest turn in view. The composer docks over the bottom of the page, so scroll the page to its end.
  useEffect(() => {
    if (!hasThread) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [chat.turns.length, hasThread]);

  function send() {
    if (chat.send(value)) setValue("");
    inputRef.current?.focus();
  }

  function startNewChat() {
    chat.startNewChat();
    setValue("");
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col px-5">
      <nav aria-label="Chats" className="flex flex-none items-center justify-between gap-3 pt-6">
        {chat.chats.length > 0 ? (
          <PastChats
            chats={chat.chats}
            currentId={chat.chatId}
            disabled={chat.pending}
            onOpen={(saved) => {
              chat.openChat(saved);
              inputRef.current?.focus();
            }}
          />
        ) : (
          <span aria-hidden />
        )}
        <Button variant="secondary" onClick={startNewChat} disabled={chat.pending || !hasThread}>
          New chat
        </Button>
      </nav>
      {hasThread ? (
        <ChatThread
          turns={chat.turns}
          working={chat.pending ? (chat.working ?? "Thinking…") : null}
          className="flex-1 pt-12 pb-6"
        />
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
        <ChatComposer
          value={value}
          onChange={setValue}
          onSend={send}
          busy={chat.pending}
          label="Prompt for the agent"
          placeholder="Describe a task for the agent"
          inputRef={inputRef}
          autoFocus
        />
      </div>
      {hasThread ? null : <div aria-hidden className="flex-[3]" />}
    </div>
  );
}
