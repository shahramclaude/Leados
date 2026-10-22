import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { raiseDecision, listDecisions } from "@/lib/decision/decisionEngine";
import { rankDecisionDesk } from "@/lib/decision/decisionIntelligence";
import { db } from "@/db";
import { decisionRightsConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET /api/decisions?orgId=...  -> Decision Desk ranked list
export async function GET(req: NextRequest) {
  await ensureDecisionInvariants();
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return Response.json({ error: "orgId is required" }, { status: 400 });

  const records = await listDecisions(orgId);
  const ranked = rankDecisionDesk(records);

  const rights = await db
    .select()
    .from(decisionRightsConfigs)
    .where(eq(decisionRightsConfigs.orgId, orgId));
  const deciderByClass = new Map(rights.map((r) => [r.decisionClass, r.deciderRole]));

  return Response.json({
    desk: ranked.map((r) => ({
      ...r,
      deciderRole: deciderByClass.get(r.decision.decisionClass) ?? null,
    })),
  });
}

// POST /api/decisions -> raise a new decision (funnel stage: raised)
export async function POST(req: NextRequest) {
  await ensureDecisionInvariants();
  const body = await req.json();

  if (!body.orgId || !body.question || !body.decisionType || !body.decisionClass) {
    return Response.json(
      { error: "orgId, decisionClass, question, decisionType are required" },
      { status: 400 },
    );
  }

  const decision = await raiseDecision({
    orgId: body.orgId,
    decisionClass: body.decisionClass,
    question: body.question,
    decisionType: body.decisionType,
    raisedBy: body.raisedBy ?? null,
    impact: body.impact ?? 3,
  });

  return Response.json({ decision }, { status: 201 });
}
