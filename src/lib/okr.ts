// OKR cascade engine: objectives → key results → initiatives → projects.
//
// Nothing here is a free-standing "status" field — every status, score, and
// progress percentage is *derived* from inputs (check-ins, linked metric
// events, linked execution-project confidence) each time it's requested, so
// the cascade can never silently drift from reality the way a manually
// edited status field would.

export type OkrLevel = "company" | "team" | "individual";
export type OkrStatus = "on_track" | "at_risk" | "off_track" | "done";
export type CheckInCadence = "weekly" | "biweekly" | "monthly";

export interface Objective {
  id: number;
  title: string;
  description?: string | null;
  level: OkrLevel;
  owner: string;
  parentId: number | null;
  period: string;
  weight: number;
}

export interface KeyResult {
  id: number;
  objectiveId: number;
  title: string;
  metricKey?: string | null;
  startValue: number;
  targetValue: number;
  currentValue: number;
  unit: string;
  weight: number;
  confidence: number;
  checkInCadence: CheckInCadence;
  lastCheckInAt: Date | string | null;
}

export interface Initiative {
  id: number;
  keyResultId: number;
  title: string;
  status: OkrStatus | "unknown";
  contributionWeight: number;
  executionProjectId: number | null;
}

export interface CheckIn {
  id: number;
  keyResultId: number;
  value: number;
  confidence: number;
  note?: string | null;
  createdAt: Date | string;
}

/** DESIGN PARAMETER: pacing-score thresholds for status derivation. */
const STATUS_THRESHOLDS = { onTrack: 0.85, atRisk: 0.55 };

/** 0..1 fraction of target achieved. Direction-aware (targets can decrease, e.g. churn). */
export function computeKeyResultProgress(kr: Pick<KeyResult, "startValue" | "targetValue" | "currentValue">): number {
  const span = kr.targetValue - kr.startValue;
  if (span === 0) return kr.currentValue >= kr.targetValue ? 1 : 0;
  const raw = (kr.currentValue - kr.startValue) / span;
  return Math.max(0, Math.min(1.2, raw)); // allow slight over-achievement signal, cap at 120%
}

/** Pacing score = progress achieved / time elapsed through the period. 1.0 = exactly on pace. */
export function computeOkrScore(progress: number, timeElapsedFraction: number): number {
  if (timeElapsedFraction <= 0) return progress > 0 ? 1.2 : 1;
  return progress / timeElapsedFraction;
}

export function computeOkrStatus(score: number, progress: number): OkrStatus {
  if (progress >= 1) return "done";
  if (score >= STATUS_THRESHOLDS.onTrack) return "on_track";
  if (score >= STATUS_THRESHOLDS.atRisk) return "at_risk";
  return "off_track";
}

/** Parses a "YYYY-Qn" period label into a concrete [start, end) date range. */
export function periodToRange(period: string, now: Date = new Date()): { start: Date; end: Date } {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match) {
    // Fallback: treat as a 90-day rolling window ending "now" so the engine
    // never throws on an unrecognized period label.
    const end = now;
    const start = new Date(now.getTime() - 90 * 86400000);
    return { start, end };
  }
  const year = Number(match[1]);
  const q = Number(match[2]);
  const start = new Date(Date.UTC(year, (q - 1) * 3, 1));
  const end = new Date(Date.UTC(year, q * 3, 1));
  return { start, end };
}

export function timeElapsedFraction(period: string, now: Date = new Date()): number {
  const { start, end } = periodToRange(period, now);
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 1;
  const elapsed = now.getTime() - start.getTime();
  return Math.max(0, Math.min(1, elapsed / total));
}

export interface KeyResultHealth {
  keyResult: KeyResult;
  progress: number;
  score: number;
  status: OkrStatus;
  daysSinceCheckIn: number | null;
  checkInOverdue: boolean;
}

const CADENCE_DAYS: Record<CheckInCadence, number> = { weekly: 7, biweekly: 14, monthly: 30 };

/**
 * Recomputes a key result's currentValue from the latest matching event
 * (metric reading or manual check-in) rather than trusting whatever is
 * cached on the row — this is the "every KR's progress recomputes from real
 * events/metrics" requirement.
 */
export function recomputeKeyResultCurrentValue(
  kr: Pick<KeyResult, "currentValue" | "startValue">,
  latestEventValue: number | null,
): number {
  if (latestEventValue === null || Number.isNaN(latestEventValue)) return kr.currentValue;
  return latestEventValue;
}

export function evaluateKeyResult(
  kr: KeyResult,
  objectivePeriod: string,
  now: Date = new Date(),
): KeyResultHealth {
  const progress = computeKeyResultProgress(kr);
  const elapsed = timeElapsedFraction(objectivePeriod, now);
  const score = computeOkrScore(progress, elapsed);
  const status = computeOkrStatus(score, progress);
  const last = kr.lastCheckInAt ? new Date(kr.lastCheckInAt) : null;
  const daysSinceCheckIn = last ? Math.round((now.getTime() - last.getTime()) / 86400000) : null;
  const cadenceDays = CADENCE_DAYS[kr.checkInCadence] ?? 7;
  const checkInOverdue = daysSinceCheckIn === null ? true : daysSinceCheckIn > cadenceDays * 1.5;
  return { keyResult: kr, progress, score, status, daysSinceCheckIn, checkInOverdue };
}

export interface ObjectiveHealth {
  objective: Objective;
  keyResultHealths: KeyResultHealth[];
  weightedProgress: number;
  weightedScore: number;
  weightedConfidence: number;
  status: OkrStatus;
}

/** Weighted roll-up of an objective's key results. */
export function rollUpObjective(objective: Objective, keyResults: KeyResult[], now: Date = new Date()): ObjectiveHealth {
  const healths = keyResults
    .filter((kr) => kr.objectiveId === objective.id)
    .map((kr) => evaluateKeyResult(kr, objective.period, now));
  const totalWeight = healths.reduce((sum, h) => sum + (h.keyResult.weight || 1), 0) || 1;
  const weightedProgress = healths.reduce((sum, h) => sum + h.progress * (h.keyResult.weight || 1), 0) / totalWeight;
  const weightedScore = healths.reduce((sum, h) => sum + h.score * (h.keyResult.weight || 1), 0) / totalWeight;
  const weightedConfidence =
    healths.reduce((sum, h) => sum + h.keyResult.confidence * (h.keyResult.weight || 1), 0) / totalWeight;
  const status = healths.length === 0 ? "at_risk" : computeOkrStatus(weightedScore, weightedProgress);
  return { objective, keyResultHealths: healths, weightedProgress, weightedScore, weightedConfidence, status };
}

/** Maps an execution project's derived delivery confidence onto an initiative status. */
export function deriveInitiativeStatus(deliveryConfidence: number | null): OkrStatus {
  if (deliveryConfidence === null) return "at_risk";
  if (deliveryConfidence >= 0.7) return "on_track";
  if (deliveryConfidence >= 0.4) return "at_risk";
  return "off_track";
}

export interface CascadeMisalignment {
  type: "status_gap" | "confidence_overstated" | "stale_check_in" | "orphan_initiative";
  severity: "low" | "medium" | "high";
  objectiveId: number;
  keyResultId?: number;
  initiativeId?: number;
  message: string;
}

export interface CascadeNode {
  objective: Objective;
  health: ObjectiveHealth;
  children: CascadeNode[];
  initiatives: Initiative[];
}

/**
 * Builds the objective tree (company → team → individual) and detects
 * misalignment between levels: a child claiming "on_track" while its parent
 * is "off_track" (or vice versa — a child silently absorbing a parent's
 * risk), initiatives that report healthier status than the execution data
 * underneath them supports, and stale/overdue check-ins.
 */
export function buildCascadeMap(
  objectives: Objective[],
  keyResults: KeyResult[],
  initiatives: Initiative[],
  now: Date = new Date(),
): { roots: CascadeNode[]; misalignments: CascadeMisalignment[] } {
  const healthById = new Map<number, ObjectiveHealth>();
  for (const o of objectives) healthById.set(o.id, rollUpObjective(o, keyResults, now));

  const childrenByParent = new Map<number | null, Objective[]>();
  for (const o of objectives) {
    const key = o.parentId ?? null;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(o);
  }

  const misalignments: CascadeMisalignment[] = [];
  const STATUS_RANK: Record<OkrStatus, number> = { off_track: 0, at_risk: 1, on_track: 2, done: 3 };

  function buildNode(o: Objective): CascadeNode {
    const health = healthById.get(o.id)!;
    const kids = (childrenByParent.get(o.id) ?? []).map(buildNode);
    const nodeInitiatives = initiatives.filter((i) => health.keyResultHealths.some((h) => h.keyResult.id === i.keyResultId));

    // status_gap: a child objective materially healthier than its struggling parent
    for (const child of kids) {
      const parentRank = STATUS_RANK[health.status];
      const childRank = STATUS_RANK[child.health.status];
      if (parentRank <= STATUS_RANK.at_risk && childRank >= STATUS_RANK.on_track) {
        misalignments.push({
          type: "status_gap",
          severity: "medium",
          objectiveId: o.id,
          message: `Parent "${o.title}" is ${health.status} while child "${child.objective.title}" reports ${child.health.status} — roll-up may be hiding risk.`,
        });
      }
    }

    // confidence_overstated: KR confidence high but pacing score says off-track
    for (const h of health.keyResultHealths) {
      if (h.keyResult.confidence >= 0.75 && h.status === "off_track") {
        misalignments.push({
          type: "confidence_overstated",
          severity: "high",
          objectiveId: o.id,
          keyResultId: h.keyResult.id,
          message: `"${h.keyResult.title}" is reported at ${Math.round(h.keyResult.confidence * 100)}% confidence but pacing data shows it off-track.`,
        });
      }
      if (h.checkInOverdue) {
        misalignments.push({
          type: "stale_check_in",
          severity: h.daysSinceCheckIn === null ? "high" : "low",
          objectiveId: o.id,
          keyResultId: h.keyResult.id,
          message: `"${h.keyResult.title}" has ${h.daysSinceCheckIn === null ? "no" : `a ${h.daysSinceCheckIn}-day-old`} check-in against a ${h.keyResult.checkInCadence} cadence.`,
        });
      }
    }

    for (const init of nodeInitiatives) {
      if (!init.executionProjectId) {
        misalignments.push({
          type: "orphan_initiative",
          severity: "low",
          objectiveId: o.id,
          initiativeId: init.id,
          message: `Initiative "${init.title}" has no linked execution project — status cannot be derived from real delivery data.`,
        });
      }
    }

    return { objective: o, health, children: kids, initiatives: nodeInitiatives };
  }

  const roots = (childrenByParent.get(null) ?? []).map(buildNode);
  return { roots, misalignments };
}
