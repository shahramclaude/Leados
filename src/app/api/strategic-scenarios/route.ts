import { NextRequest } from "next/server";
import { listInitiatives, listMilestones, listTeams } from "@/lib/strategy/initiatives";
import { runScenario, type ScenarioInput } from "@/lib/strategy/scenarioEngine";
import {
  budgetCutScenario,
  budgetIncreaseScenario,
  milestoneSlipScenario,
  teamCapacityLossScenario,
} from "@/lib/strategy/strategicScenarios";

export const dynamic = "force-dynamic";

const DEFAULT_BASELINE_BUDGET = 500000;

// GET returns a set of pre-built, editable scenario presets plus the data
// needed to render them (teams, a sample milestone), so the client doesn't
// have to hardcode ids.
export async function GET() {
  const [initiatives, teams, milestones] = await Promise.all([listInitiatives(), listTeams(), listMilestones()]);
  const totalBudget = initiatives.reduce((s, i) => s + i.budgetAllocated, 0) || DEFAULT_BASELINE_BUDGET;
  const sampleTeam = teams[0];
  const sampleMilestone = milestones[0];

  const presets: ScenarioInput[] = [
    budgetCutScenario(totalBudget, 0.2),
    budgetIncreaseScenario(totalBudget, 0.2),
    ...(sampleTeam ? [teamCapacityLossScenario(totalBudget, sampleTeam.id, sampleTeam.capacityHoursPerWeek, 0.3)] : []),
    ...(sampleMilestone ? [milestoneSlipScenario(totalBudget, sampleMilestone.id, 10)] : []),
  ];

  const results = presets.map((scenario) => runScenario(scenario, initiatives, teams, milestones));

  return Response.json({ baselineBudget: totalBudget, presets, results });
}

// POST accepts a fully custom ScenarioInput and runs it against current data.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const scenario = body.scenario as ScenarioInput | undefined;
  if (!scenario || !scenario.id || !Array.isArray(scenario.adjustments)) {
    return Response.json({ error: "scenario (with id and adjustments[]) is required" }, { status: 400 });
  }

  const [initiatives, teams, milestones] = await Promise.all([listInitiatives(), listTeams(), listMilestones()]);
  const result = runScenario(scenario, initiatives, teams, milestones);
  return Response.json({ result });
}
