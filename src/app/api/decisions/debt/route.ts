import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { db } from "@/db";
import { decisions, sensorSignalReadings } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { computeDecisionDebt } from "@/lib/decision/decisionVelocity";
import type { TriggerCondition } from "@/lib/decision/types";

export const dynamic = "force-dynamic";

// GET /api/decisions/debt?orgId=... -> unmade decisions past their own
// trigger-condition thresholds (decision debt, tech-debt framing).
export async function GET(req: NextRequest) {
  await ensureDecisionInvariants();
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return Response.json({ error: "orgId is required" }, { status: 400 });

  const orgDecisions = await db.select().from(decisions).where(eq(decisions.orgId, orgId));
  const readings = await db
    .select()
    .from(sensorSignalReadings)
    .where(eq(sensorSignalReadings.orgId, orgId))
    .orderBy(desc(sensorSignalReadings.observedAt));

  // latest reading per signal
  const latestMap = new Map<string, number>();
  for (const r of readings) {
    if (!latestMap.has(r.signal)) latestMap.set(r.signal, Number(r.value));
  }

  const debt = computeDecisionDebt(
    orgDecisions.map((d) => ({
      decisionId: d.id,
      question: d.question,
      status: d.status as any,
      triggerConditions: (d.triggerConditions as TriggerCondition[]) ?? [],
    })),
    [...latestMap.entries()].map(([signal, value]) => ({ signal, value })),
  );

  return Response.json({ debt, debtCount: debt.length });
}
