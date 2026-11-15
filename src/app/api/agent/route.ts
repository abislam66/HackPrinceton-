import { NextResponse } from "next/server";
import { AgentError, agentReply, agentRequestSchema } from "@/features/agent/chat";

/**
 * The Agent tab. Body: `{messages: [{role: "user" | "assistant", content}]}`, ending with the
 * user's new message. 200 `{reply}`; 400 bad body; 503 no API key; 502 the model call failed.
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
  try {
    return NextResponse.json({ reply: await agentReply(parsed.data.messages) });
  } catch (error) {
    const message = error instanceof AgentError ? error.message : "The agent hit an unexpected error.";
    console.error("POST /api/agent failed", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
