import { resolveViewer } from "@/lib/platform/auth";
import { completeMilestone } from "@/lib/app/people/growthPlans";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; planId: string; milestoneId: string }> },
) {
  const { id, planId, milestoneId } = await params;
  const personId = Number(id);
  const planIdNum = Number(planId);
  const milestoneIdNum = Number(milestoneId);
  if (!Number.isFinite(personId) || !Number.isFinite(planIdNum) || !Number.isFinite(milestoneIdNum)) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }

  const viewer = resolveViewer(request);
  const body = await request.json().catch(() => ({}));
  const evidence = body?.evidence ?? "Marked complete without attached evidence.";

  const result = await completeMilestone(viewer, personId, planIdNum, milestoneIdNum, evidence);
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : 404;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ milestone: result.milestone });
}
