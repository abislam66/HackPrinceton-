import "server-only";
import type { SiteSearchParams, SiteSearchResult } from "./schema";

export async function runSiteSearch(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  params: SiteSearchParams,
): Promise<SiteSearchResult[]> {
  throw new Error("runSiteSearch is not implemented yet");
}
