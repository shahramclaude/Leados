import { resolveViewer } from "@/lib/platform/auth";
import { createGrowthPlan, listGrowthPlans } from "@/lib/app/people/growthPlans";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return Response.json({ error: "Invalid person id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const result = await listGrowthPlans(viewer, personId);
  if (!result.ok) return Response.json({ error: result.error }, { status: 403 });

  return Response.json(result);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return Response.json({ error: "Invalid person id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const body = await request.json().catch(() => null);
  if (!body?.title) return Response.json({ error: "title is required." }, { status: 400 });

  const result = await createGrowthPlan(viewer, personId, body.title);
  if (!result.ok) return Response.json({ error: result.error }, { status: 403 });

  return Response.json({ plan: result.plan }, { status: 201 });
}
