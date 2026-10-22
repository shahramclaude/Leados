// GET /api/process-mining/cases?processName=...            -> case list (summary)
// GET /api/process-mining/cases?processName=...&caseId=...  -> single case detail (click-through)
import { getEventsForProcess } from "@/lib/processMining/repo";
import { reconstructCases } from "@/lib/processMining/caseReconstruction";
import { BENCHMARK_PROCESS_NAME, BENCHMARK_STEPS } from "@/lib/processMining/simulate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const processName = searchParams.get("processName");
  const caseId = searchParams.get("caseId");
  if (!processName) {
    return Response.json({ ok: false, error: "processName query param is required" }, { status: 400 });
  }

  try {
    const events = await getEventsForProcess(processName);
    const startActivities =
      processName === BENCHMARK_PROCESS_NAME ? new Set([BENCHMARK_STEPS[0]]) : new Set([events[0]?.activity ?? ""]);
    const endActivities =
      processName === BENCHMARK_PROCESS_NAME ? new Set([BENCHMARK_STEPS[BENCHMARK_STEPS.length - 1]]) : undefined;

    const { cases } = reconstructCases(events, { startActivities, endActivities });

    if (caseId) {
      const found = cases.find((c) => c.caseId === caseId);
      if (!found) return Response.json({ ok: false, error: "case not found" }, { status: 404 });
      return Response.json({ ok: true, case: found });
    }

    const summary = cases.map((c) => ({
      caseId: c.caseId,
      startedAt: c.startedAt,
      endedAt: c.endedAt,
      cycleTimeMs: c.cycleTimeMs,
      open: c.open,
      ambiguous: c.ambiguous,
      issues: c.issues,
      activityPath: c.events.map((e) => e.activity),
    }));

    return Response.json({ ok: true, processName, caseCount: cases.length, cases: summary });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
