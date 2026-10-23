import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, approvals, planNodes, policyDecisions, stepRecords } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, id));
  if (!run) return Response.json({ ok: false, error: "not found" }, { status: 404 });

  const nodes = await db.select().from(planNodes).where(eq(planNodes.runId, id)).orderBy(asc(planNodes.id));
  const steps = await db.select().from(stepRecords).where(eq(stepRecords.runId, id)).orderBy(asc(stepRecords.id));
  const decisions = await db.select().from(policyDecisions).where(eq(policyDecisions.runId, id)).orderBy(asc(policyDecisions.id));
  const runApprovals = await db.select().from(approvals).where(eq(approvals.runId, id)).orderBy(asc(approvals.id));

  return Response.json({ ok: true, run, nodes, steps, decisions, approvals: runApprovals });
}
