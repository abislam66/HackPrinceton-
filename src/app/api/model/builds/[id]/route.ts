import { NextResponse } from "next/server";
import { getModelBuild } from "@/features/model/service";

export async function GET(_request: Request, ctx: RouteContext<"/api/model/builds/[id]">) {
  const { id } = await ctx.params;
  try {
    const build = await getModelBuild(id);
    if (!build) return NextResponse.json({ error: `Unknown build: ${id}` }, { status: 404 });
    return NextResponse.json(build);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
