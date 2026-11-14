import { NextResponse } from "next/server";
import { startModelBuild } from "@/features/model/service";
import { PROJECT_SLUG } from "@/features/project/schema";

/** Starts a model build on the Python model builder service. */
export async function POST() {
  try {
    return NextResponse.json(await startModelBuild(PROJECT_SLUG), { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
