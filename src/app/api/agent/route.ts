import { NextResponse } from "next/server";
import { AgentError, agentReply, agentRequestSchema, type AgentEvent } from "@/features/agent/chat";

/** Scouts and dossiers run inside the tools and can take a few minutes. */
export const maxDuration = 300;

/**
 * The Agent tab. Body: `{messages: [{role: "user" | "assistant", content}]}`, ending with the
 * user's new message. Streams newline-delimited JSON events (`AgentEvent`): `tool` when a tool call
 * starts, `progress` lines from long tools, `result` when each call returns (the pages its results
 * live on, or its error), then one `reply` or `error`. Events about one call share its `toolUseId`.
 * 400 bad body and 503 no API key come back as plain JSON before any streaming.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON: {messages}" }, { status: 400 });
  }
  const parsed = agentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid messages" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "The agent isn't connected: ANTHROPIC_API_KEY is not set." }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: AgentEvent) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        emit({ type: "reply", text: await agentReply(parsed.data.messages, emit) });
      } catch (error) {
        console.error("POST /api/agent failed", error);
        emit({ type: "error", error: error instanceof AgentError ? error.message : "The agent hit an unexpected error." });
      } finally {
        open = false;
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
