import { desc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { automationRuns } from "@/db/schema";
import { withObservability } from "@/lib/observability/apiHandler";
import { logger } from "@/lib/observability/logger";
import { getCorrelationId } from "@/lib/observability/requestContext";

export const dynamic = "force-dynamic";

// GET: list recent automation runs (what the Health page's drill-down renders).
export const GET = withObservability("GET /api/automation/runs", async (req: NextRequest) => {
  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;

  const rows = await db
    .select()
    .from(automationRuns)
    .orderBy(desc(automationRuns.queuedAt))
    .limit(limit);

  return NextResponse.json({ total: rows.length, runs: rows });
});

// POST: record one automation run end-to-end, synchronously.
//
// Honest limitation: this is a demonstration/test endpoint, not a real
// background task queue. There is no worker process in this deployment
// consuming a queue; this route exists so the composite health system
// (automation_queue / automation_freshness checks) and the metrics
// endpoint have real rows to evaluate instead of being permanently empty
// on a fresh install. A future orchestrator/agent runtime (out of scope
// for this part — see FEATURES.md) would replace this with a real queue
// and leave the schema and health checks unchanged.
export const POST = withObservability("POST /api/automation/runs", async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" && body.name.trim().length > 0 ? body.name.trim() : "manual-run";
  const forceFailure = body?.forceFailure === true;
  const correlationId = getCorrelationId();

  const [queued] = await db
    .insert(automationRuns)
    .values({ name, status: "queued", correlationId })
    .returning();

  const startedAt = new Date();
  await db
    .update(automationRuns)
    .set({ status: "running", startedAt })
    .where(sql`${automationRuns.id} = ${queued.id}`);

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const status = forceFailure ? "failed" : "succeeded";

  const [finalRow] = await db
    .update(automationRuns)
    .set({
      status,
      finishedAt,
      durationMs,
      errorMessage: forceFailure ? "forced failure for testing" : null,
    })
    .where(sql`${automationRuns.id} = ${queued.id}`)
    .returning();

  logger.info("automation_run_completed", { name, status, durationMs });

  return NextResponse.json({ run: finalRow }, { status: 201 });
});
