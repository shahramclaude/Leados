// Strategic scenario ("what-if") modeling: apply a hypothetical change
// (budget, team capacity, or a milestone delay) to the current portfolio and
// recompute WSJF ranking, portfolio selection, and critical-path delivery
// dates, returning a diff against the baseline so stakeholders can see the
// consequence of a decision before making it.
import { computeCriticalPath, deliveryDateDistribution } from "./portfolioMath";
import { selectPortfolio } from "./initiativesEngine";
import type { InitiativeNode, MilestoneNode, TeamNode } from "./strategyModels";

export type ScenarioAdjustment =
  | { kind: "budget_change"; newBudget: number }
  | { kind: "team_capacity_change"; teamId: string; newCapacityHoursPerWeek: number }
  | { kind: "milestone_delay"; milestoneId: string; extraDays: number };

export interface ScenarioInput {
  id: string;
  label: string;
  baselineBudget: number;
  adjustments: ScenarioAdjustment[];
}

export interface ScenarioComparison {
  scenarioId: string;
  label: string;
  baseline: {
    selectedInitiativeIds: string[];
    utilization: number;
  };
  underScenario: {
    selectedInitiativeIds: string[];
    utilization: number;
  };
  newlyIncluded: string[];
  newlyExcluded: string[];
  teams: TeamNode[]; // after capacity adjustments, for transparency
  criticalPathShifts: { initiativeId: string; baselineDays: number; scenarioDays: number; deltaDays: number }[];
}

function applyAdjustments(
  initiatives: InitiativeNode[],
  teams: TeamNode[],
  milestones: MilestoneNode[],
  adjustments: ScenarioAdjustment[],
): { budgetDelta: number; teams: TeamNode[]; milestones: MilestoneNode[] } {
  let budgetDelta = 0;
  let nextTeams = teams.map((t) => ({ ...t }));
  let nextMilestones = milestones.map((m) => ({ ...m }));

  for (const adj of adjustments) {
    if (adj.kind === "budget_change") {
      budgetDelta += adj.newBudget;
    } else if (adj.kind === "team_capacity_change") {
      nextTeams = nextTeams.map((t) =>
        t.id === adj.teamId ? { ...t, capacityHoursPerWeek: adj.newCapacityHoursPerWeek } : t,
      );
    } else if (adj.kind === "milestone_delay") {
      nextMilestones = nextMilestones.map((m) =>
        m.id === adj.milestoneId
          ? {
              ...m,
              optimisticDays: m.optimisticDays + adj.extraDays,
              mostLikelyDays: m.mostLikelyDays + adj.extraDays,
              pessimisticDays: m.pessimisticDays + adj.extraDays,
            }
          : m,
      );
    }
  }

  return { budgetDelta, teams: nextTeams, milestones: nextMilestones };
}

export function runScenario(
  scenario: ScenarioInput,
  initiatives: InitiativeNode[],
  teams: TeamNode[],
  milestones: MilestoneNode[],
): ScenarioComparison {
  const baselineSelection = selectPortfolio(initiatives, scenario.baselineBudget);

  const { budgetDelta, teams: scenarioTeams, milestones: scenarioMilestones } = applyAdjustments(
    initiatives,
    teams,
    milestones,
    scenario.adjustments,
  );
  const scenarioBudget =
    scenario.adjustments.find((a) => a.kind === "budget_change")
      ? budgetDelta
      : scenario.baselineBudget;

  const scenarioSelection = selectPortfolio(initiatives, scenarioBudget);

  const baselineIds = new Set(baselineSelection.selected.map((i) => i.id));
  const scenarioIds = new Set(scenarioSelection.selected.map((i) => i.id));
  const newlyIncluded = [...scenarioIds].filter((id) => !baselineIds.has(id));
  const newlyExcluded = [...baselineIds].filter((id) => !scenarioIds.has(id));

  const affectedInitiativeIds = new Set(
    scenario.adjustments
      .filter((a): a is Extract<ScenarioAdjustment, { kind: "milestone_delay" }> => a.kind === "milestone_delay")
      .map((a) => milestones.find((m) => m.id === a.milestoneId)?.initiativeId)
      .filter((id): id is string => Boolean(id)),
  );

  const criticalPathShifts = [...affectedInitiativeIds].map((initiativeId) => {
    const baselinePath = computeCriticalPath(initiativeId, milestones);
    const scenarioPath = computeCriticalPath(initiativeId, scenarioMilestones);
    return {
      initiativeId,
      baselineDays: baselinePath.totalTe,
      scenarioDays: scenarioPath.totalTe,
      deltaDays: scenarioPath.totalTe - baselinePath.totalTe,
    };
  });

  return {
    scenarioId: scenario.id,
    label: scenario.label,
    baseline: {
      selectedInitiativeIds: baselineSelection.selected.map((i) => i.id),
      utilization: baselineSelection.utilization,
    },
    underScenario: {
      selectedInitiativeIds: scenarioSelection.selected.map((i) => i.id),
      utilization: scenarioSelection.utilization,
    },
    newlyIncluded,
    newlyExcluded,
    teams: scenarioTeams,
    criticalPathShifts,
  };
}

export function deliveryShiftForInitiative(
  initiativeId: string,
  startDate: string,
  milestonesBefore: MilestoneNode[],
  milestonesAfter: MilestoneNode[],
) {
  const before = computeCriticalPath(initiativeId, milestonesBefore);
  const after = computeCriticalPath(initiativeId, milestonesAfter);
  const distBefore = deliveryDateDistribution(startDate, before.totalTe, before.totalVariance);
  const distAfter = deliveryDateDistribution(startDate, after.totalTe, after.totalVariance);
  const p50ShiftDays =
    (new Date(distAfter.p50).getTime() - new Date(distBefore.p50).getTime()) / (1000 * 60 * 60 * 24);
  return { before: distBefore, after: distAfter, p50ShiftDays };
}
