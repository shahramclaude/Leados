import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agentRuns, notifications, workQueueJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withRoute } from "@/lib/withRoute";
import { withSpan } from "@/lib/tracing";
import { getCorrelationId } from "@/lib/context";
import { logger } from "@/lib/logger";
import { registry } from "@/lib/metrics";
import { appendAuditEvent } from "@/lib/auditChain";

export const dynamic = "force-dynamic";

const log = logger.child({ component: "demo-pipeline" });

// Illustrates the full telemetry chain this part wires correlation ids
// through: API route -> "orchestrator" -> "agent run" -> query layer. Every
// hop logs structured JSON with the bound correlationId/traceId and opens a
// tracing span; the whole chain is then replayable via GET /api/trace/:id.
async function orchestrate(kind: string) {
  return withSpan("orchestrate", "orchestrator", async () => {
    log.info("orchestrator.start", { kind });

    const [run] = await db
      .insert(agentRuns)
      .values({ kind, status: "running", correlationId: getCorrelationId() })
      .returning();

    try {
      const outcome = await runAgent(run.id, kind);
      await db
        .update(agentRuns)
        .set({
          status: "succeeded",
          finishedAt: new Date(),
          forecastDrift: outcome.forecastDriftBps,
        })
        .where(eq(agentRuns.id, run.id));
      registry.agentRunOutcomesTotal.inc({ kind, outcome: "succeeded" });
      registry.forecastDriftRatio.set({ kind }, outcome.forecastDriftBps / 10_000);

      await db.insert(notifications).values({
        channel: "email",
        status: "sent",
        correlationId: getCorrelationId(),
        deliveredAt: new Date(),
      });

      await appendAuditEvent("system", "agent_run.succeeded", { runId: run.id, kind });
      log.info("orchestrator.done", { kind, runId: run.id });
      return { runId: run.id, status: "succeeded" as const };
    } catch (err) {
      await db
        .update(agentRuns)
        .set({ status: "failed", finishedAt: new Date(), error: String(err) })
        .where(eq(agentRuns.id, run.id));
      registry.agentRunOutcomesTotal.inc({ kind, outcome: "failed" });
      await appendAuditEvent("system", "agent_run.failed", { runId: run.id, kind, error: String(err) });
      log.error("orchestrator.failed", { kind, runId: run.id, error: String(err) });
      throw err;
    }
  });
}

async function runAgent(runId: string, kind: string) {
  return withSpan("run-agent", "agent-run", async () => {
    log.info("agent_run.start", { runId, kind });
    await queryWorkQueueDepth();
    const forecastDriftBps = Math.floor(Math.random() * 300); // 0-3% simulated drift
    log.info("agent_run.complete", { runId, kind, forecastDriftBps });
    return { forecastDriftBps };
  });
}

async function queryWorkQueueDepth() {
  return withSpan("select-work-queue-depth", "repo", async () => {
    const rows = await db.select().from(workQueueJobs).limit(1);
    return rows.length;
  });
}

export const POST = withRoute(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const kind = typeof body.kind === "string" ? body.kind : "demo-forecast";
  const result = await orchestrate(kind);
  return NextResponse.json({ ...result, correlationId: getCorrelationId() }, { status: 201 });
});
