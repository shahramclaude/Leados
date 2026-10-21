import { NextRequest } from "next/server";
import { createGrowthPlan, listGrowthPlans, updateMilestone } from "@/lib/growthPlans";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const plans = await listGrowthPlans(actor, id);
    return Response.json({ personId: id, plans });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = await resolveActor(req);
    const body = await req.json();
    const planId = await createGrowthPlan(actor, id, body.title, body.targetSkillId ?? null, body.milestones ?? []);
    return Response.json({ id: planId }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    const body = await req.json();
    await updateMilestone(actor, body.planId, body.milestoneId, body.status, body.evidenceEventIds ?? []);
    return Response.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
