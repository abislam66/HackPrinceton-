import { NextResponse } from "next/server";
import { siteSearchParamsSchema } from "@/features/site-search/schema";
import { runSiteSearch } from "@/features/site-search/search";

export async function POST(request: Request) {
  const parsed = siteSearchParamsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const results = await runSiteSearch(parsed.data);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 501 });
  }
}
