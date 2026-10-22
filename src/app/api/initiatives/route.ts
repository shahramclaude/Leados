import { NextRequest } from "next/server";
import { createInitiative, listInitiatives, listMilestones, listTeams } from "@/lib/strategy/initiatives";
import { rankInitiatives } from "@/lib/strategy/initiativesEngine";
import { computeCriticalPath, deliveryDateDistribution } from "@/lib/strategy/portfolioMath";

export const dynamic = "force-dynamic";

export async function GET() {
  const [initiatives, milestones, teams] = await Promise.all([listInitiatives(), listMilestones(), listTeams()]);
  const ranked = rankInitiatives(initiatives);

  const enriched = ranked.map((r, idx) => {
    const path = computeCriticalPath(r.initiative.id, milestones);
    const dist =
      path.path.length > 0 && r.initiative.startDate
        ? deliveryDateDistribution(r.initiative.startDate, path.totalTe, path.totalVariance)
        : null;
    return {
      initiative: r.initiative,
      wsjf: r.wsjf,
      rank: idx + 1,
      team: teams.find((t) => t.id === r.initiative.teamId) ?? null,
      criticalPath: path,
      delivery: dist,
    };
  });

  return Response.json({ initiatives: enriched });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const required = ["objectiveId", "title", "timeCriticality", "riskReduction", "userValue", "jobSize"];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null) {
      return Response.json({ error: `${field} is required` }, { status: 400 });
    }
  }

  const initiative = await createInitiative({
    objectiveId: body.objectiveId,
    teamId: body.teamId ?? null,
    title: body.title,
    description: body.description,
    status: body.status,
    budgetAllocated: body.budgetAllocated,
    timeCriticality: body.timeCriticality,
    riskReduction: body.riskReduction,
    userValue: body.userValue,
    jobSize: body.jobSize,
    requiredSkill: body.requiredSkill,
    requiredHoursPerWeek: body.requiredHoursPerWeek,
    startDate: body.startDate,
    targetEndDate: body.targetEndDate,
  });

  return Response.json({ initiative }, { status: 201 });
}
