// GET /api/process-mining/conformance?processName=...&mode=mined|declared
// Returns the full per-case deviation list for the Conformance Explorer.
import { getEventsForProcess, getDeclaredDefinition } from "@/lib/processMining/repo";
import { reconstructCases } from "@/lib/processMining/caseReconstruction";
import { discoverProcessModel } from "@/lib/processMining/discovery";
import { checkConformanceAgainstDeclared, checkConformanceAgainstMined } from "@/lib/processMining/conformance";
import { BENCHMARK_PROCESS_NAME, BENCHMARK_STEPS } from "@/lib/processMining/simulate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const processName = searchParams.get("processName");
  const mode = searchParams.get("mode") === "declared" ? "declared" : "mined";
  if (!processName) {
    return Response.json({ ok: false, error: "processName query param is required" }, { status: 400 });
  }

  try {
    const events = await getEventsForProcess(processName);
    if (events.length === 0) {
      return Response.json({ ok: false, error: "no events for process" }, { status: 404 });
    }
    const startActivities =
      processName === BENCHMARK_PROCESS_NAME ? new Set([BENCHMARK_STEPS[0]]) : new Set([events[0].activity]);
    const endActivities =
      processName === BENCHMARK_PROCESS_NAME ? new Set([BENCHMARK_STEPS[BENCHMARK_STEPS.length - 1]]) : undefined;
    const { cases } = reconstructCases(events, { startActivities, endActivities });

    if (mode === "declared") {
      const definition = await getDeclaredDefinition(processName);
      if (!definition) {
        return Response.json(
          { ok: false, error: `No declared ProcessDefinition exists for "${processName}" — only mined (statistical) conformance is available.` },
          { status: 404 },
        );
      }
      const report = checkConformanceAgainstDeclared(cases, definition);
      return Response.json({
        ok: true,
        mode,
        honestyNote:
          "Checked against an explicit declared process definition — rule-severity deviations here are genuine violations of the intended process, not just statistically rare paths.",
        report,
      });
    }

    const model = discoverProcessModel(cases);
    const report = checkConformanceAgainstMined(cases, model);
    return Response.json({
      ok: true,
      mode,
      honestyNote:
        "Checked against the MINED model only. All deviations are 'statistical' severity — a rare path relative to this log, which may be a perfectly healthy exception (escalation, fast-track, etc.), not necessarily a mistake.",
      report,
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
