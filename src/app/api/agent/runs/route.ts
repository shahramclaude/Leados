import { z } from "zod";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns } from "@/db/schema";
import { createAndEnqueueRun } from "@/lib/agent/orchestrator";

export const dynamic = "force-dynamic";

const CreateRunSchema = z.object({
  objective: z.string().min(5).max(2000),
  budgetUsd: z.number().min(0.01).max(1.5).default(1.5),
  budgetMin: z.number().min(1).max(12).default(12),
  requestedBy: z.string().min(1).max(200).default("executive-sponsor"),
});

export async function GET() {
  const rows = await db.select().from(agentRuns).orderBy(desc(agentRuns.createdAt)).limit(100);
  return Response.json({ runs: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = CreateRunSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const result = await createAndEnqueueRun(parsed.data);
  if (!result.ok) {
    return Response.json({ ok: false, errors: result.errors }, { status: 422 });
  }
  return Response.json({ ok: true, runId: result.runId, planId: result.planId }, { status: 201 });
}
