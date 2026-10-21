import "@/lib/kernel/bootstrap";
import { db } from "@/db";
import { kernelRuns, kernelSteps } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  if (!runId) return Response.json({ error: "runId query param is required" }, { status: 400 });

  const [run] = await db.select().from(kernelRuns).where(eq(kernelRuns.id, runId)).limit(1);
  if (!run) return Response.json({ error: `Run ${runId} not found` }, { status: 404 });

  const steps = await db.select().from(kernelSteps).where(eq(kernelSteps.runId, runId)).orderBy(asc(kernelSteps.idx));

  return Response.json({ run, steps });
}
