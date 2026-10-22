// GET /api/process-mining/overview?processName=benchmark_flow
// Runs the full mining pipeline over the current event log for a process and
// returns the discovered model, bottlenecks, queueing stats, bus-factor,
// automation scores, operational metrics, and control chart. Conformance
// deviation lists are summarized here; full per-case detail lives behind
// /api/process-mining/conformance.
import { getEventsForProcess, getDeclaredDefinition } from "@/lib/processMining/repo";
import { runProcessMiningPipeline } from "@/lib/processMining/pipeline";
import { BENCHMARK_PROCESS_NAME, BENCHMARK_STEPS } from "@/lib/processMining/simulate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const processName = searchParams.get("processName");
  if (!processName) {
    return Response.json({ ok: false, error: "processName query param is required" }, { status: 400 });
  }

  try {
    const events = await getEventsForProcess(processName);
    if (events.length === 0) {
      return Response.json({ ok: false, error: `No events found for process "${processName}". POST /api/process-mining/seed first.` }, { status: 404 });
    }

    const declaredDefinition = await getDeclaredDefinition(processName);
    const startActivities =
      processName === BENCHMARK_PROCESS_NAME ? new Set([BENCHMARK_STEPS[0]]) : new Set([events[0].activity]);
    const endActivities =
      processName === BENCHMARK_PROCESS_NAME
        ? new Set([BENCHMARK_STEPS[BENCHMARK_STEPS.length - 1]])
        : undefined;

    const result = runProcessMiningPipeline(events, {
      declaredDefinition: declaredDefinition ?? undefined,
      startActivities,
      endActivities,
    });

    const deviationCasesMined = result.conformanceMined.results.filter((r) => r.deviations.length > 0).slice(0, 50);
    const deviationCasesDeclared = result.conformanceDeclared
      ? result.conformanceDeclared.results.filter((r) => !r.conformant || r.deviations.length > 0).slice(0, 50)
      : [];

    return Response.json({
      ok: true,
      processName,
      provenance: `Discovered from ${result.model.caseCount} cases between ${result.model.periodStart.toISOString()} and ${result.model.periodEnd.toISOString()} — this is what the event log shows happened, not the designed process.`,
      reconstructionReport: result.reconstructionReport,
      model: result.model,
      conformanceMined: { ...result.conformanceMined, results: deviationCasesMined },
      conformanceDeclared: result.conformanceDeclared
        ? { ...result.conformanceDeclared, results: deviationCasesDeclared }
        : null,
      bottlenecks: result.bottlenecks,
      queueing: result.queueing,
      busFactor: result.busFactor,
      automation: result.automation,
      metrics: result.metrics,
      cycleTimeControlChart: result.cycleTimeControlChart,
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
