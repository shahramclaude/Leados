import { K_ANONYMITY_THRESHOLD, aggregationGate, type GateResult } from "@/lib/privacy/aggregation";
import { explain, type Explain } from "@/lib/explain";
import {
  aggregateFunnelCounts,
  countFunnelStages,
  periodActivityRate,
  DEFAULT_FUNNEL_THRESHOLDS,
  type ChangeEventRecord,
} from "./adoptionProxies";
import type { GroupPeriodObservation } from "./interventionEffect";
import { readinessScore, readinessActions } from "./readiness";
import { momentumFromSeries } from "./momentum";
import { changeLoadIndex, saturationFindings, DEFAULT_SATURATION_THRESHOLD } from "./changeLoad";
import { assessAdkarStage } from "./adkar";
import type { ChangeProgram, FunnelCounts } from "./types";
import {
  listGroups,
  listPrograms,
  getProgram,
  getGroupRosterIds,
  getGroupTrainingCompletionRate,
  getEventsForProgram,
  getEventsForGroups,
  type GroupRow,
} from "./repository";

/**
 * Composition layer: wires DB-backed rosters/events into the pure
 * readiness/momentum/load/ADKAR functions, applying the k-anonymity gate
 * before anything leaves this module. This is what the API routes call —
 * no API route touches `people` or `change_events` rows directly.
 */

export interface ProgramFunnelView {
  programId: string;
  overall: GateResult<Explain<FunnelCounts>>;
  byGroup: Array<{ groupId: string; result: GateResult<Explain<FunnelCounts>> }>;
}

export async function getProgramFunnel(programId: string, now: Date): Promise<ProgramFunnelView | null> {
  const program = await getProgram(programId);
  if (!program) return null;

  const events = await getEventsForProgram(programId);
  const perGroupRosters = await Promise.all(program.affectedGroups.map((g) => getGroupRosterIds(g)));

  const byGroup: Array<{ groupId: string; result: GateResult<Explain<FunnelCounts>> }> = program.affectedGroups.map(
    (groupId, idx) => ({ groupId, result: aggregateFunnelCounts(events, groupId, perGroupRosters[idx], now) })
  );

  const combinedCounts = program.affectedGroups.reduce(
    (acc, groupId, idx) => {
      const counts = countFunnelStages(events, groupId, perGroupRosters[idx], now);
      return { awareness: acc.awareness + counts.awareness, trial: acc.trial + counts.trial, habit: acc.habit + counts.habit };
    },
    { awareness: 0, trial: 0, habit: 0 }
  );
  const combinedRosterSize = perGroupRosters.reduce((s, r) => s + r.length, 0);
  const overall = aggregationGate(combinedRosterSize, () =>
    explain<FunnelCounts>(combinedCounts, "aggregate_funnel_counts_v1", { programId, groupSize: combinedRosterSize }, {
      confidence: combinedRosterSize >= K_ANONYMITY_THRESHOLD * 2 ? "high" : "medium",
      caveats: ["Sum of per-group gated funnel counts across all affected groups for this program."],
    })
  );

  return { programId, overall, byGroup };
}

export interface ProgramMomentumView {
  programId: string;
  weeklyHabitRate: GateResult<Explain<number[]>>;
  momentum: GateResult<Explain<number>>;
}

export async function getProgramMomentum(programId: string, now: Date, weeks = 8): Promise<ProgramMomentumView | null> {
  const program = await getProgram(programId);
  if (!program) return null;

  const events = await getEventsForProgram(programId);
  const rosters = await Promise.all(program.affectedGroups.map((g) => getGroupRosterIds(g)));
  const combinedRosterSize = rosters.reduce((s, r) => s + r.length, 0);

  const series: number[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const asOf = new Date(now.getTime() - w * 7 * 86400000);
    let habit = 0;
    program.affectedGroups.forEach((groupId, idx) => {
      habit += countFunnelStages(events, groupId, rosters[idx], asOf).habit;
    });
    series.push(combinedRosterSize > 0 ? habit / combinedRosterSize : 0);
  }

  const weeklyHabitRate = aggregationGate(combinedRosterSize, () =>
    explain(series, "weekly_habit_rate_series_v1", { programId, weeks, groupSize: combinedRosterSize })
  );
  const momentum = aggregationGate(combinedRosterSize, () => momentumFromSeries(series));

  return { programId, weeklyHabitRate, momentum };
}

export interface GroupReadinessView {
  groupId: string;
  groupName: string;
  department: string;
  readiness: GateResult<Explain<number>>;
  actions: GateResult<ReturnType<typeof readinessActions>>;
  changeLoad: Explain<number>;
}

export async function getGroupReadiness(groupRow: GroupRow, programs: ChangeProgram[], now: Date): Promise<GroupReadinessView> {
  const roster = await getGroupRosterIds(groupRow.id);
  const training = await getGroupTrainingCompletionRate(groupRow.id);
  const changeLoad = changeLoadIndex(groupRow.id, programs, now);

  const inputs = {
    trainingCompletionRate: training.rate,
    capacityHeadroom: groupRow.capacityHeadroom,
    priorChangeLoad: changeLoad.value,
  };

  const readiness = aggregationGate(roster.length, () => readinessScore(inputs));
  const actions = aggregationGate(roster.length, () => readinessActions(inputs));

  return { groupId: groupRow.id, groupName: groupRow.name, department: groupRow.department, readiness, actions, changeLoad };
}

export async function getAllGroupReadiness(now: Date): Promise<GroupReadinessView[]> {
  const groups = await listGroups();
  const programs = await listPrograms();
  return Promise.all(groups.map((g) => getGroupReadiness(g, programs, now)));
}

export async function getSaturationAlerts(now: Date, threshold = DEFAULT_SATURATION_THRESHOLD) {
  const groups = await listGroups();
  const programs = await listPrograms();
  return saturationFindings(
    groups.map((g) => g.id),
    programs,
    now,
    threshold
  );
}

/**
 * Builds the group-period outcome series used by the Intervention Lab's
 * effect estimator. Groups below the k-anonymity threshold are excluded
 * entirely from the observation set (their activity rate is never computed
 * or disclosed, even as an estimator input to an aggregate statistic).
 */
export async function getProgramPeriodObservations(
  programId: string,
  periods: number
): Promise<{ observations: GroupPeriodObservation[]; excludedGroups: string[] }> {
  const program = await getProgram(programId);
  if (!program) return { observations: [], excludedGroups: [] };

  const events = await getEventsForProgram(programId);
  const observations: GroupPeriodObservation[] = [];
  const excludedGroups: string[] = [];

  for (const groupId of program.affectedGroups) {
    const roster = await getGroupRosterIds(groupId);
    if (roster.length < K_ANONYMITY_THRESHOLD) {
      excludedGroups.push(groupId);
      continue;
    }
    for (let period = 0; period < periods; period++) {
      observations.push({ groupId, period, adoptionRate: periodActivityRate(events, groupId, period, roster) });
    }
  }

  return { observations, excludedGroups };
}

export async function getAdkarForProgramGroup(programId: string, groupId: string, now: Date) {
  const program = await getProgram(programId);
  if (!program || !program.affectedGroups.includes(groupId)) return null;
  const roster = await getGroupRosterIds(groupId);
  const events = await getEventsForGroups([groupId]);
  const training = await getGroupTrainingCompletionRate(groupId);

  return aggregationGate(roster.length, () => {
    const funnel = countFunnelStages(
      events.filter((e) => e.proxyEventType === program.targetBehaviors[0]?.proxyEventType),
      groupId,
      roster,
      now,
      DEFAULT_FUNNEL_THRESHOLDS
    );
    return assessAdkarStage(funnel, roster.length, training.rate);
  });
}
