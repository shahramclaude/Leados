import { db } from "@/db";
import * as schema from "@/db/schema";
import { ensureBaselineData } from "@/lib/seed";
import { withErrorHandling, jsonOk } from "@/lib/api";
import { runAgentCycle } from "@/lib/agentCycle";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling("agent-cycle", async (_req, requestId) => {
  await ensureBaselineData(db);
  const result = await runAgentCycle(db);
  return jsonOk(result, requestId);
});

export const GET = withErrorHandling("agent-cycle", async (_req, requestId) => {
  await ensureBaselineData(db);
  const lastRuns = await db.select().from(schema.agentCycleRuns).orderBy(desc(schema.agentCycleRuns.completedAt)).limit(5);
  return jsonOk({ lastRuns }, requestId);
});
