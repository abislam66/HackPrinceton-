import { NextResponse } from "next/server";
import { listProjects } from "@/features/project-agent/store";

/** Every project: the demo project, then the ones opened from drafts. `{projects}`. */
export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}
