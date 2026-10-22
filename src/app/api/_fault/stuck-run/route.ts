import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agentRuns } from "@/db/schema";
import { requireAdmin } from "@/lib/adminAuth";
import { withRoute } from "@/lib/withRoute";
import { getCorrelationId } from "@/lib/context";

export const dynamic = "force-dynamic";

// SRE drill endpoint: inserts a REAL agent_runs row stuck in "running" since
// well past the stuck-run threshold, so the composite health check and the
// run-reaper runbook can be exercised against genuine data (not a toggled
// simulation flag). See docs/RUNBOOKS.md#stuck-run.
export const POST = withRoute(async (req: NextRequest) => {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const minutesAgo = 20;
  const startedAt = new Date(Date.now() - minutesAgo * 60_000);
  const [run] = await db
    .insert(agentRuns)
    .values({
      kind: "drill-stuck-run",
      status: "running",
      startedAt,
      correlationId: getCorrelationId(),
    })
    .returning();

  return NextResponse.json({ injected: true, run });
});
