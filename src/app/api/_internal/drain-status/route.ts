import { NextResponse } from "next/server";
import { db } from "@/db";
import { agentRuns, workQueueJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { activeStreamCount } from "@/lib/eventBus";

export const dynamic = "force-dynamic";

// Polled by `server.js` during graceful shutdown (SIGTERM) to decide when it
// is safe to exit: no in-flight agent runs, no jobs mid-processing, no open
// stream connections. Deliberately not wrapped in withRoute so it keeps
// working even while the app is marked draining.
export async function GET() {
  const [runningRuns, processingJobs] = await Promise.all([
    db.select().from(agentRuns).where(eq(agentRuns.status, "running")),
    db.select().from(workQueueJobs).where(eq(workQueueJobs.status, "processing")),
  ]);

  return NextResponse.json({
    runningRuns: runningRuns.length,
    processingJobs: processingJobs.length,
    activeStreams: activeStreamCount(),
    drained: runningRuns.length === 0 && processingJobs.length === 0 && activeStreamCount() === 0,
  });
}
