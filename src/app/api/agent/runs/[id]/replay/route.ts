import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns } from "@/db/schema";
import { createReplayRun } from "@/lib/agent/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [original] = await db.select().from(agentRuns).where(eq(agentRuns.id, id));
  if (!original) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  const { replayRunId } = await createReplayRun(id);
  return Response.json({ ok: true, replayRunId, originalReplayHash: original.replayHash });
}
