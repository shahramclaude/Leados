import { db } from "@/db";
import { runAgentCycle } from "@/lib/autonomousAgent";

export const dynamic = "force-dynamic";

// POST /api/autonomous/run
// Triggers one full agent cycle on demand: orchestration -> rule
// calibration -> hypothesis generation -> hypothesis resolution. Returns
// the structured agent audit log entry plus a summary of the run.
//
// Note: this on-demand endpoint complements (not replaces) the true
// interval-based schedule started via `scheduleLoop()` in
// src/lib/autonomousAgent.ts.
export async function POST() {
  try {
    const cycle = await runAgentCycle(db);

    return Response.json({
      ok: true,
      audit: cycle.audit,
      orchestration: {
        runId: cycle.orchestration.runId,
        startedAt: cycle.orchestration.startedAt,
        durationMs: cycle.orchestration.durationMs,
        stagesCompleted: cycle.orchestration.stagesCompleted,
        findingsCount: cycle.orchestration.findingsCount,
        findings: cycle.orchestration.findings,
      },
      calibration: cycle.calibration,
      hypothesesGenerated: cycle.hypothesesGenerated,
      hypothesesResolved: cycle.hypothesesResolved,
    });
  } catch (error) {
    console.error("[api/autonomous/run] failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return POST();
}
