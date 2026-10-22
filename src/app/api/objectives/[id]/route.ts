import { NextRequest } from "next/server";
import {
  deleteObjective,
  getObjective,
  listEvidenceRefs,
  listKeyResults,
  listObjectiveLinks,
  listObjectives,
  updateObjectiveStatus,
} from "@/lib/strategy/objectives";
import { listInitiatives, listMilestones, listTeams } from "@/lib/strategy/initiatives";
import { strategyPath } from "@/lib/strategy/alignmentEngine";
import { computeObjectiveScore } from "@/lib/strategy/okrsEngine";
import type { ObjectiveStatus } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const objective = await getObjective(id);
  if (!objective) return Response.json({ error: "not found" }, { status: 404 });

  const [objectives, links, keyResults, initiatives, teams, milestones] = await Promise.all([
    listObjectives(),
    listObjectiveLinks(),
    listKeyResults(),
    listInitiatives(),
    listTeams(),
    listMilestones(),
  ]);
  const evidence = await listEvidenceRefs(keyResults.filter((k) => k.objectiveId === id).map((k) => k.id));

  const path = strategyPath(id, objectives, links, keyResults, initiatives, teams, milestones, evidence);
  const score = computeObjectiveScore(id, objective.stretch, keyResults, evidence);

  return Response.json({ objective, path, score });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const status = body.status as ObjectiveStatus | undefined;
  if (!status) return Response.json({ error: "status is required" }, { status: 400 });
  await updateObjectiveStatus(id, status);
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteObjective(id);
  return Response.json({ ok: true });
}
