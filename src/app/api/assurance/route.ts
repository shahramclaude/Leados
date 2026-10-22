import { db } from "@/db";
import { assuranceChecks, engines } from "@/db/schema";
import { getAssuranceSnapshot } from "@/lib/assuranceData";
import { VALID_RESULTS, VALID_SEVERITIES } from "@/lib/assurance";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Seam 2 proving endpoint: assurance monitors every engine. Pulls the most
// recent check per engine and reports coverage + worst severity across the
// whole fleet, flagging engines that have never been checked or whose last
// check is stale.
export async function GET() {
  const { summary, engines: allEngines } = await getAssuranceSnapshot();
  return Response.json({ summary, engines: allEngines });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.engineId || !body?.checkType || !body?.result) {
    return Response.json({ error: "engineId, checkType, result are required" }, { status: 400 });
  }
  if (!VALID_RESULTS.includes(body.result)) {
    return Response.json({ error: `result must be one of ${VALID_RESULTS.join(", ")}` }, { status: 400 });
  }
  const severity = body.severity ?? "info";
  if (!VALID_SEVERITIES.includes(severity)) {
    return Response.json({ error: `severity must be one of ${VALID_SEVERITIES.join(", ")}` }, { status: 400 });
  }

  const [check] = await db
    .insert(assuranceChecks)
    .values({
      engineId: Number(body.engineId),
      checkType: body.checkType,
      result: body.result,
      severity,
      notes: body.notes ?? null,
    })
    .returning();

  await db
    .update(engines)
    .set({ status: body.result, lastCheckedAt: new Date() })
    .where(eq(engines.id, Number(body.engineId)));

  return Response.json({ check }, { status: 201 });
}
