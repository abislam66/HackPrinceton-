import { loadScoutResult } from "@/features/scout/load";

/** The latest `ScoutResult` with where it came from: `{ source: "store" | "snapshot", data }`. */
export async function GET() {
  const result = await loadScoutResult();
  if (!result) return Response.json({ error: "No scout result yet. Run a scout first." }, { status: 404 });
  return Response.json(result);
}
