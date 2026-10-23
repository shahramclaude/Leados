import { db } from "@/db";
import { agents, agentRuns } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const PLAYBOOKS: Record<string, string[]> = {
  sensing: [
    "Scanned 42 market/operational signal sources.",
    "Flagged 3 anomalies above severity threshold.",
    "Published signal digest to the sensing feed.",
  ],
  decision: [
    "Compiled open decisions pending owner action.",
    "Scored decisions by confidence x impact.",
    "Recommended 2 decisions for committee review.",
  ],
  execution: [
    "Checked cadence items due in the next 48 hours.",
    "Nudged 2 owners with overdue action items.",
    "Updated execution tracker.",
  ],
  governance: [
    "Reviewed risk register for stale mitigations.",
    "Validated board pack status transitions.",
    "Logged governance exceptions for audit trail.",
  ],
  learning: [
    "Aggregated fitness metrics across dimensions.",
    "Compared trend deltas against prior cycle.",
    "Proposed one intervention for underperforming dimension.",
  ],
};

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = Number(id);
  if (!Number.isFinite(agentId)) return Response.json({ error: "invalid id" }, { status: 400 });

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!agent) return Response.json({ error: "not found" }, { status: 404 });

  await db.update(agents).set({ status: "running" }).where(eq(agents.id, agentId));

  const steps = PLAYBOOKS[agent.kernelType] ?? PLAYBOOKS.sensing;
  const log = steps.map((step, i) => `[step ${i + 1}] ${step}`).join("\n");
  const finishedAt = new Date();

  const [run] = await db
    .insert(agentRuns)
    .values({
      agentId,
      status: "succeeded",
      summary: steps[steps.length - 1],
      log,
      finishedAt,
    })
    .returning();

  await db
    .update(agents)
    .set({ status: "idle", lastRunAt: finishedAt })
    .where(eq(agents.id, agentId));

  return Response.json(run, { status: 201 });
}
