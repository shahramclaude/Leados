// GET /api/autonomous/history — event-sourced kernel run history.
// GET /api/autonomous/history?runId=123 — full detail (steps + tool calls) for one run.
import { getRunDetail, getRunHistory } from "@/lib/kernel/orchestrator";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");

  if (runId) {
    const detail = await getRunDetail(Number(runId));
    if (!detail) return Response.json({ ok: false, error: "run not found" }, { status: 404 });
    return Response.json({ ok: true, ...detail });
  }

  const limit = Number(searchParams.get("limit") ?? 25);
  const runs = await getRunHistory(limit);
  return Response.json({ ok: true, runs });
}
