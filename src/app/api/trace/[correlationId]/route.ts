import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agentRuns, auditEvents, notifications, traceSpans, workQueueJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withRoute } from "@/lib/withRoute";

export const dynamic = "force-dynamic";

// "Explain this correlationId" — search a trace end-to-end by pulling every
// row across subsystems tagged with the same correlationId, plus any sampled
// spans, and returning a unified, time-ordered timeline.
export const GET = withRoute(async (_req: NextRequest, { params }) => {
  const { correlationId } = await params;

  const [spans, runs, jobs, notes, audits] = await Promise.all([
    db.select().from(traceSpans).where(eq(traceSpans.correlationId, correlationId)),
    db.select().from(agentRuns).where(eq(agentRuns.correlationId, correlationId)),
    db.select().from(workQueueJobs).where(eq(workQueueJobs.correlationId, correlationId)),
    db.select().from(notifications).where(eq(notifications.correlationId, correlationId)),
    db.select().from(auditEvents).where(eq(auditEvents.correlationId, correlationId)),
  ]);

  const timeline = [
    ...spans.map((s) => ({
      kind: "span" as const,
      at: s.startTime.toISOString(),
      summary: `${s.service}: ${s.name} (${s.durationMs ?? "?"}ms, ${s.status})`,
      detail: s,
    })),
    ...runs.map((r) => ({
      kind: "agent_run" as const,
      at: r.startedAt.toISOString(),
      summary: `agent run "${r.kind}" -> ${r.status}`,
      detail: r,
    })),
    ...jobs.map((j) => ({
      kind: "work_queue_job" as const,
      at: j.createdAt.toISOString(),
      summary: `queue job "${j.kind}" -> ${j.status} (attempts=${j.attempts})`,
      detail: j,
    })),
    ...notes.map((n) => ({
      kind: "notification" as const,
      at: n.queuedAt.toISOString(),
      summary: `notification via ${n.channel} -> ${n.status}`,
      detail: n,
    })),
    ...audits.map((a) => ({
      kind: "audit_event" as const,
      at: a.createdAt.toISOString(),
      summary: `audit: ${a.actor} ${a.action}`,
      detail: a,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const found = timeline.length > 0;
  return NextResponse.json({
    correlationId,
    found,
    eventCount: timeline.length,
    timeline,
  });
});
