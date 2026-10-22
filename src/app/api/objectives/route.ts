import { NextRequest } from "next/server";
import { createObjective, createObjectiveLink, listObjectiveLinks, listObjectives } from "@/lib/strategy/objectives";
import { listKeyResultsAndEvidenceForObjectives } from "@/lib/strategy/objectives";
import { computeObjectiveScore } from "@/lib/strategy/okrsEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const [objs, links] = await Promise.all([listObjectives(), listObjectiveLinks()]);
  const { keyResults, evidence } = await listKeyResultsAndEvidenceForObjectives(objs.map((o) => o.id));

  const withScores = objs.map((o) => ({
    ...o,
    score: computeObjectiveScore(o.id, o.stretch, keyResults, evidence),
  }));

  return Response.json({ objectives: withScores, links });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.title || !body.level || !body.timeframe || !body.ownerName) {
    return Response.json(
      { error: "title, level, timeframe, and ownerName are required" },
      { status: 400 },
    );
  }

  const objective = await createObjective({
    title: body.title,
    description: body.description,
    level: body.level,
    timeframe: body.timeframe,
    ownerName: body.ownerName,
    status: body.status,
    stretch: body.stretch,
    isNorthStarAligned: body.isNorthStarAligned,
    parentId: body.parentId ?? null,
    priorityRank: body.priorityRank,
  });

  if (body.contributesToObjectiveId) {
    await createObjectiveLink(objective.id, body.contributesToObjectiveId, "contributes_to");
  }

  return Response.json({ objective }, { status: 201 });
}
