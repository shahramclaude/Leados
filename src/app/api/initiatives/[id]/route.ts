import { NextRequest } from "next/server";
import { deleteInitiative, getInitiative, listMilestones, updateInitiativeStatus } from "@/lib/strategy/initiatives";
import { computeCriticalPath, deliveryDateDistribution, monteCarloDeliveryDays } from "@/lib/strategy/portfolioMath";
import type { InitiativeStatus } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initiative = await getInitiative(id);
  if (!initiative) return Response.json({ error: "not found" }, { status: 404 });

  const milestones = await listMilestones([id]);
  const path = computeCriticalPath(id, milestones);
  const dist =
    path.path.length > 0 && initiative.startDate
      ? deliveryDateDistribution(initiative.startDate, path.totalTe, path.totalVariance)
      : null;
  const monteCarlo = path.path.length > 0 ? monteCarloDeliveryDays(id, milestones) : null;

  return Response.json({ initiative, milestones, criticalPath: path, delivery: dist, monteCarlo });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const status = body.status as InitiativeStatus | undefined;
  if (!status) return Response.json({ error: "status is required" }, { status: 400 });
  await updateInitiativeStatus(id, status, body.blockerNote ?? null);
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteInitiative(id);
  return Response.json({ ok: true });
}
