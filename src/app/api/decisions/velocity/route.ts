import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { db } from "@/db";
import { decisions, decisionStateTransitions, decisionRightsConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  computeTimeInState,
  computeVelocityByState,
  computeQueueDepthByRole,
} from "@/lib/decision/decisionVelocity";

export const dynamic = "force-dynamic";

// GET /api/decisions/velocity?orgId=... -> time-in-state p50/p95 + queue depth by role
export async function GET(req: NextRequest) {
  await ensureDecisionInvariants();
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return Response.json({ error: "orgId is required" }, { status: 400 });

  const orgDecisions = await db.select().from(decisions).where(eq(decisions.orgId, orgId));
  const decisionIds = new Set(orgDecisions.map((d) => d.id));

  const allTransitions = await db.select().from(decisionStateTransitions);
  const transitions = allTransitions
    .filter((t) => decisionIds.has(t.decisionId))
    .map((t) => ({ decisionId: t.decisionId, fromState: t.fromState, toState: t.toState, createdAt: t.createdAt }));

  const samples = computeTimeInState(transitions);
  const velocityByState = computeVelocityByState(samples);

  const rights = await db
    .select()
    .from(decisionRightsConfigs)
    .where(eq(decisionRightsConfigs.orgId, orgId));
  const deciderByClass = new Map(rights.map((r) => [r.decisionClass, r.deciderRole]));

  const queueDepthByRole = computeQueueDepthByRole(
    orgDecisions.map((d) => ({
      decisionId: d.id,
      status: d.status as any,
      deciderRole: deciderByClass.get(d.decisionClass) ?? null,
    })),
  );

  return Response.json({ velocityByState, queueDepthByRole });
}
