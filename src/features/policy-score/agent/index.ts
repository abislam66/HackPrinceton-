import "server-only";
import type { PolicyScoreRequest, PolicyScoreResult } from "../schema";

export async function scorePolicy(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  request: PolicyScoreRequest,
): Promise<PolicyScoreResult> {
  throw new Error("scorePolicy is not implemented yet");
}
