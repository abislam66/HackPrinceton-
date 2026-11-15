import { NextResponse } from "next/server";
import { agentRequestSchema } from "@/features/agent/chat";
import { ProjectAgentError, projectAgentReply, type ProjectAgentEvent } from "@/features/project-agent/agent";
import { loadProjectFacts } from "@/features/project-agent/store";

/** Drafting a change regenerates shots and pitch inside the call. */
export const maxDuration = 120;

/**
 * The project agent for one project. Body: `{messages}` like `/api/agent`. Streams NDJSON
 * `ProjectAgentEvent`s: `tool`, `progress`, `draft` (a drafted or resolved change, for the draft
 * card), then one `reply` or `error`. 400 / 404 / 503 come back as plain JSON before streaming.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[project]/agent">) {
  const { project } = await ctx.params;
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
  if (!(await loadProjectFacts(project))) return NextResponse.json({ error: `Unknown project: ${project}` }, { status: 404 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "The agent isn't connected: ANTHROPIC_API_KEY is not set." }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: ProjectAgentEvent) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const text = await projectAgentReply(project, parsed.data.messages, emit);
        emit(text === null ? { type: "error", error: `Unknown project: ${project}` } : { type: "reply", text });
      } catch (error) {
        console.error(`POST /api/projects/${project}/agent failed`, error);
        emit({ type: "error", error: error instanceof ProjectAgentError ? error.message : "The agent hit an unexpected error." });
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
