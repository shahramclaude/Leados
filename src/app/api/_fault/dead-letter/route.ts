import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workQueueJobs } from "@/db/schema";
import { requireAdmin } from "@/lib/adminAuth";
import { withRoute } from "@/lib/withRoute";
import { getCorrelationId } from "@/lib/context";

export const dynamic = "force-dynamic";

// SRE drill endpoint: inserts a REAL dead-lettered job so the dead-letter
// count health signal and the dead-letter-triage runbook can be exercised.
export const POST = withRoute(async (req: NextRequest) => {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const [job] = await db
    .insert(workQueueJobs)
    .values({
      kind: "drill-dead-letter",
      payload: { failAlways: true, injected: true },
      status: "dead_letter",
      attempts: 5,
      maxAttempts: 5,
      lastError: "simulated permanent failure (injected by SRE drill)",
      finishedAt: new Date(),
      correlationId: getCorrelationId(),
    })
    .returning();

  return NextResponse.json({ injected: true, job });
});
