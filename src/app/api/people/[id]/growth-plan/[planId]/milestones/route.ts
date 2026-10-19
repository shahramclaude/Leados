import { resolveViewer } from "@/lib/platform/auth";
import { addMilestone } from "@/lib/app/people/growthPlans";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  const personId = Number(id);
  const planIdNum = Number(planId);
  if (!Number.isFinite(personId) || !Number.isFinite(planIdNum)) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }

  const viewer = resolveViewer(request);
  const body = await request.json().catch(() => null);
  if (!body?.title || !body?.skill) {
    return Response.json({ error: "title and skill are required." }, { status: 400 });
  }

  const result = await addMilestone(viewer, personId, {
    planId: planIdNum,
    title: body.title,
    skill: body.skill,
    targetDate: body.targetDate ?? null,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 403 });

  return Response.json({ milestone: result.milestone }, { status: 201 });
}
