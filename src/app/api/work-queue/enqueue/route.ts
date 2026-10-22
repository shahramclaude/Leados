import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workQueueJobs } from "@/db/schema";
import { withRoute } from "@/lib/withRoute";
import { getCorrelationId } from "@/lib/context";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = logger.child({ component: "work-queue" });

export const POST = withRoute(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const kind = typeof body.kind === "string" ? body.kind : "demo-job";

  const [job] = await db
    .insert(workQueueJobs)
    .values({
      kind,
      payload: body.payload ?? {},
      status: "pending",
      correlationId: getCorrelationId(),
    })
    .returning();

  log.info("work_queue.enqueued", { jobId: job.id, kind });
  return NextResponse.json({ job }, { status: 201 });
});
