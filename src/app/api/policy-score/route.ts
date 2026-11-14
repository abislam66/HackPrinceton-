import { NextResponse } from "next/server";
import { policyScoreRequestSchema } from "@/features/policy-score/schema";
import { scorePolicy } from "@/features/policy-score/agent";

export async function POST(request: Request) {
  const parsed = policyScoreRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await scorePolicy(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 501 });
  }
}
