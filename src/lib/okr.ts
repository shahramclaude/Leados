// B. OKR cascade with reality checks.
//
// Roll-up math (documented):
//   KR attainment   = clamp01((current - start) / (target - start)), inverted for
//                      "decrease" direction metrics.
//   confidence factor = 1.0 if checked in within the last 14 days, else 0.6
//                      ("confidence discounting" — stale self-reports count less).
//   Objective attainment = Σ(KR attainment × KR weight × confidence factor)
//                           ÷ Σ(KR weight × confidence factor)
// Status derivation is PURELY a function of execution data (milestones/blockers
// via executionEngine) — it never reads `selfReportedStatus`. The two are then
// reconciled and disagreement is surfaced, never hidden.
import { db } from "@/db";
import { okrObjectives, okrKeyResults, okrInitiatives } from "@/db/schema";
import { eq } from "drizzle-orm";
import { num } from "@/lib/format";
import { explain, type Explain } from "@/lib/explain";
import { allProjectStatuses, projectProgress, type DerivedProjectStatus } from "@/lib/executionEngine";

export type StatusLevel = "green" | "yellow" | "red";
const LEVEL_RANK: Record<StatusLevel, number> = { red: 0, yellow: 1, green: 2 };

export function statusFromAttainment(attainment: number): StatusLevel {
  if (attainment >= 0.9) return "green";
  if (attainment >= 0.6) return "yellow";
  return "red";
}

function confidenceFactor(lastCheckIn: Date | null): number {
  if (!lastCheckIn) return 0.5;
  const ageDays = (Date.now() - lastCheckIn.getTime()) / 86400000;
  return ageDays <= 14 ? 1.0 : 0.6;
}

export function krAttainment(kr: { startValue: number; targetValue: number; currentValue: number; direction: string }): number {
  const { startValue, targetValue, currentValue, direction } = kr;
  const span = targetValue - startValue;
  if (span === 0) return currentValue >= targetValue ? 1 : 0;
  let raw = (currentValue - startValue) / span;
  if (direction === "decrease") raw = 1 - raw;
  return Math.max(0, Math.min(1, raw));
}

export type KrDerived = {
  keyResultId: number;
  title: string;
  attainment: number;
  confidence: number;
  derivedStatus: StatusLevel;
  selfReportedStatus: StatusLevel;
  disagreement: boolean;
  disagreementSeverity: number;
  initiativeIds: number[];
  orphan: boolean; // no initiatives at all
};

export type ObjectiveDerived = {
  objectiveId: number;
  title: string;
  owner: string;
  period: string;
  attainment: number;
  derivedStatus: StatusLevel;
  keyResults: KrDerived[];
  uncovered: boolean; // objective has zero key results
};

export type CascadeHealth = {
  objectives: ObjectiveDerived[];
  orphanKeyResults: { keyResultId: number; title: string }[];
  uncoveredObjectives: { objectiveId: number; title: string }[];
  orphanInitiatives: { initiativeId: number; title: string }[];
  statusDisagreements: { keyResultId: number; title: string; selfReported: StatusLevel; derived: StatusLevel; severity: number }[];
  healthScore: number; // 0..100
};

/**
 * Pure function: given raw rows + a map of initiative derived status, computes
 * the whole cascade deterministically. No DB calls, no hidden state — this is
 * what the "recomputes purely from events" test exercises directly.
 */
export function buildCascade(
  objectives: { id: number; title: string; owner: string; period: string; weight: number }[],
  keyResults: {
    id: number;
    objectiveId: number;
    title: string;
    startValue: number;
    targetValue: number;
    currentValue: number;
    direction: string;
    weight: number;
    selfReportedStatus: StatusLevel;
    lastCheckIn: Date | null;
  }[],
  initiatives: { id: number; keyResultId: number; title: string; weight: number; projectId: number | null }[],
  initiativeDerivedStatus: Map<number, DerivedProjectStatus>,
): CascadeHealth {
  const initiativesByKr = new Map<number, typeof initiatives>();
  for (const init of initiatives) {
    const arr = initiativesByKr.get(init.keyResultId) ?? [];
    arr.push(init);
    initiativesByKr.set(init.keyResultId, arr);
  }

  const orphanInitiatives = initiatives
    .filter((i) => i.projectId == null)
    .map((i) => ({ initiativeId: i.id, title: i.title }));

  const krDerivedList: KrDerived[] = keyResults.map((kr) => {
    const attainment = krAttainment(kr);
    const conf = confidenceFactor(kr.lastCheckIn);
    const linkedInitiatives = initiativesByKr.get(kr.id) ?? [];

    // Derived status blends metric attainment with execution reality (if any
    // linked initiative's project is blocked/at_risk, that caps the derived status).
    let execFloor: StatusLevel = "green";
    for (const init of linkedInitiatives) {
      const s = init.projectId != null ? initiativeDerivedStatus.get(init.projectId) : undefined;
      if (s === "blocked") execFloor = "red";
      else if (s === "at_risk" && execFloor !== "red") execFloor = "yellow";
    }
    const metricStatus = statusFromAttainment(attainment);
    const derivedStatus: StatusLevel =
      LEVEL_RANK[execFloor] < LEVEL_RANK[metricStatus] ? execFloor : metricStatus;

    const selfLevel = LEVEL_RANK[kr.selfReportedStatus];
    const derivedLevel = LEVEL_RANK[derivedStatus];
    const disagreement = selfLevel !== derivedLevel;

    return {
      keyResultId: kr.id,
      title: kr.title,
      attainment,
      confidence: conf,
      derivedStatus,
      selfReportedStatus: kr.selfReportedStatus,
      disagreement,
      disagreementSeverity: Math.abs(selfLevel - derivedLevel),
      initiativeIds: linkedInitiatives.map((i) => i.id),
      orphan: linkedInitiatives.length === 0,
    };
  });

  const krById = new Map(krDerivedList.map((k) => [k.keyResultId, k]));
  const krRowById = new Map(keyResults.map((k) => [k.id, k]));

  const objectivesDerived: ObjectiveDerived[] = objectives.map((o) => {
    const krs = keyResults.filter((k) => k.objectiveId === o.id).map((k) => krById.get(k.id)!);
    let weightedSum = 0;
    let weightTotal = 0;
    for (const k of krs) {
      const row = krRowById.get(k.keyResultId)!;
      const w = row.weight * k.confidence;
      weightedSum += k.attainment * w;
      weightTotal += w;
    }
    const attainment = weightTotal > 0 ? weightedSum / weightTotal : 0;
    return {
      objectiveId: o.id,
      title: o.title,
      owner: o.owner,
      period: o.period,
      attainment,
      derivedStatus: statusFromAttainment(attainment),
      keyResults: krs,
      uncovered: krs.length === 0,
    };
  });

  const orphanKeyResults = krDerivedList.filter((k) => k.orphan).map((k) => ({ keyResultId: k.keyResultId, title: k.title }));
  const uncoveredObjectives = objectivesDerived.filter((o) => o.uncovered).map((o) => ({ objectiveId: o.objectiveId, title: o.title }));
  const statusDisagreements = krDerivedList
    .filter((k) => k.disagreement)
    .map((k) => ({ keyResultId: k.keyResultId, title: k.title, selfReported: k.selfReportedStatus, derived: k.derivedStatus, severity: k.disagreementSeverity }));

  const totalKrs = krDerivedList.length || 1;
  const coveragePenalty = (orphanKeyResults.length + uncoveredObjectives.length + orphanInitiatives.length) * 5;
  const disagreementPenalty = statusDisagreements.reduce((a, d) => a + d.severity * 5, 0);
  const avgAttainment = objectivesDerived.reduce((a, o) => a + o.attainment, 0) / (objectivesDerived.length || 1);
  const healthScore = Math.max(0, Math.min(100, Math.round(avgAttainment * 100 - coveragePenalty - disagreementPenalty)));

  return { objectives: objectivesDerived, orphanKeyResults, uncoveredObjectives, orphanInitiatives, statusDisagreements, healthScore };
}

export async function getCascade(): Promise<Explain<CascadeHealth>> {
  const objectives = await db.select().from(okrObjectives);
  const keyResults = await db.select().from(okrKeyResults);
  const initiatives = await db.select().from(okrInitiatives);
  const projectStatuses = await allProjectStatuses();
  const derivedByProjectId = new Map(projectStatuses.map((p) => [p.project.id, p.derivedStatus]));

  const cascade = buildCascade(
    objectives.map((o) => ({ id: o.id, title: o.title, owner: o.owner, period: o.period, weight: num(o.weight) })),
    keyResults.map((k) => ({
      id: k.id,
      objectiveId: k.objectiveId,
      title: k.title,
      startValue: num(k.startValue),
      targetValue: num(k.targetValue),
      currentValue: num(k.currentValue),
      direction: k.direction,
      weight: num(k.weight),
      selfReportedStatus: k.selfReportedStatus as StatusLevel,
      lastCheckIn: k.lastCheckIn ? new Date(k.lastCheckIn) : null,
    })),
    initiatives.map((i) => ({ id: i.id, keyResultId: i.keyResultId, title: i.title, weight: num(i.weight), projectId: i.projectId })),
    derivedByProjectId,
  );

  return explain(cascade, {
    confidence: 0.9,
    method: "weighted attainment roll-up with confidence discounting; derived status computed from execution data only, then reconciled against self-reported status",
    assumptionsUsed: [],
    evidence: [
      { table: "okr_objectives", id: "all" },
      { table: "okr_key_results", id: "all" },
      { table: "okr_initiatives", id: "all" },
      { table: "exec_projects", id: "all" },
    ],
    caveats: cascade.statusDisagreements.length > 0 ? [`${cascade.statusDisagreements.length} key result(s) show self-reported vs. derived status disagreement — see statusDisagreements.`] : [],
  });
}

export async function recordCheckIn(keyResultId: number, currentValue: number, selfReportedStatus: StatusLevel, selfReportedConfidence: number) {
  const [row] = await db
    .update(okrKeyResults)
    .set({ currentValue: String(currentValue), selfReportedStatus, selfReportedConfidence: String(selfReportedConfidence), lastCheckIn: new Date() })
    .where(eq(okrKeyResults.id, keyResultId))
    .returning();
  return row;
}
