/**
 * scenarios.ts — Part 06 section D: scenario persistence, versioning,
 * diffing, and attachment to decisions (Part 10 seam).
 */
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { decisions, scenarioRuns, scenarios, scenarioVersions } from "@/db/schema";
import type { Intervention, ScenarioSpec } from "@/lib/scenario";
import type { ScenarioRunResult } from "@/lib/scenarioEngine";

export async function createScenario(name: string, description: string | undefined, spec: ScenarioSpec) {
  const scenarioId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await db.insert(scenarios).values({ id: scenarioId, name, description: description ?? null, currentVersion: 1 });
  await db.insert(scenarioVersions).values({ id: versionId, scenarioId, version: 1, spec, note: "initial version" });
  return { scenarioId, versionId, version: 1 };
}

export async function addScenarioVersion(scenarioId: string, spec: ScenarioSpec, note?: string) {
  const existing = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).limit(1);
  if (existing.length === 0) throw new Error(`Scenario ${scenarioId} not found`);
  const nextVersion = existing[0].currentVersion + 1;
  const versionId = crypto.randomUUID();
  await db.insert(scenarioVersions).values({ id: versionId, scenarioId, version: nextVersion, spec, note: note ?? null });
  await db.update(scenarios).set({ currentVersion: nextVersion, updatedAt: new Date() }).where(eq(scenarios.id, scenarioId));
  return { versionId, version: nextVersion };
}

export async function listScenarios() {
  return db.select().from(scenarios).orderBy(desc(scenarios.updatedAt));
}

export async function getScenario(scenarioId: string) {
  const rows = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).limit(1);
  return rows[0] ?? null;
}

export async function getVersion(versionId: string) {
  const rows = await db.select().from(scenarioVersions).where(eq(scenarioVersions.id, versionId)).limit(1);
  return rows[0] ?? null;
}

export async function listVersions(scenarioId: string) {
  return db.select().from(scenarioVersions).where(eq(scenarioVersions.scenarioId, scenarioId)).orderBy(desc(scenarioVersions.version));
}

export async function getLatestVersion(scenarioId: string) {
  const rows = await db
    .select()
    .from(scenarioVersions)
    .where(eq(scenarioVersions.scenarioId, scenarioId))
    .orderBy(desc(scenarioVersions.version))
    .limit(1);
  return rows[0] ?? null;
}

export async function recordRun(input: {
  scenarioId: string;
  versionId: string;
  seedRoot: string;
  replications: number;
  durationMs: number;
  result: ScenarioRunResult;
  calibrationScore?: number;
}) {
  const id = crypto.randomUUID();
  await db.insert(scenarioRuns).values({
    id,
    scenarioId: input.scenarioId,
    versionId: input.versionId,
    seedRoot: input.seedRoot,
    replications: input.replications,
    durationMs: input.durationMs,
    result: input.result,
    calibrationScore: input.calibrationScore ?? null,
  });
  return id;
}

export async function listRuns(scenarioId: string) {
  return db.select().from(scenarioRuns).where(eq(scenarioRuns.scenarioId, scenarioId)).orderBy(desc(scenarioRuns.createdAt));
}

export async function getLatestRun(scenarioId: string) {
  const rows = await db.select().from(scenarioRuns).where(eq(scenarioRuns.scenarioId, scenarioId)).orderBy(desc(scenarioRuns.createdAt)).limit(1);
  return rows[0] ?? null;
}

export async function getRun(runId: string) {
  const rows = await db.select().from(scenarioRuns).where(eq(scenarioRuns.id, runId)).limit(1);
  return rows[0] ?? null;
}

export interface InterventionDiff {
  onlyInA: Intervention[];
  onlyInB: Intervention[];
  changed: Array<{ kind: string; startDay: number; a: Intervention; b: Intervention }>;
  unchanged: Intervention[];
}

function interventionKey(i: Intervention): string {
  return `${i.kind}@${i.startDay}`;
}

export function diffInterventions(a: Intervention[], b: Intervention[]): InterventionDiff {
  const aByKey = new Map(a.map((i) => [interventionKey(i), i]));
  const bByKey = new Map(b.map((i) => [interventionKey(i), i]));
  const onlyInA: Intervention[] = [];
  const onlyInB: Intervention[] = [];
  const changed: InterventionDiff["changed"] = [];
  const unchanged: Intervention[] = [];

  for (const [key, ai] of aByKey) {
    const bi = bByKey.get(key);
    if (!bi) {
      onlyInA.push(ai);
    } else if (JSON.stringify(ai.params) !== JSON.stringify(bi.params)) {
      changed.push({ kind: ai.kind, startDay: ai.startDay, a: ai, b: bi });
    } else {
      unchanged.push(ai);
    }
  }
  for (const [key, bi] of bByKey) {
    if (!aByKey.has(key)) onlyInB.push(bi);
  }
  return { onlyInA, onlyInB, changed, unchanged };
}

export interface KpiDiffRow {
  kpi: string;
  aMean: number;
  bMean: number;
  deltaMean: number;
  deltaPct: number;
}

export function diffKpiDistributions(
  aResult: ScenarioRunResult,
  bResult: ScenarioRunResult,
): KpiDiffRow[] {
  const kpis = new Set([...Object.keys(aResult.intervention), ...Object.keys(bResult.intervention)]);
  const rows: KpiDiffRow[] = [];
  for (const kpi of kpis) {
    const a = aResult.intervention[kpi];
    const b = bResult.intervention[kpi];
    if (!a || !b) continue;
    const deltaMean = b.mean - a.mean;
    rows.push({ kpi, aMean: a.mean, bMean: b.mean, deltaMean, deltaPct: a.mean !== 0 ? (deltaMean / Math.abs(a.mean)) * 100 : NaN });
  }
  return rows.sort((x, y) => Math.abs(y.deltaPct) - Math.abs(x.deltaPct));
}

export interface ScenarioDiffResult {
  specDiff: { horizonDaysA: number; horizonDaysB: number; interventions: InterventionDiff };
  kpiDiff: KpiDiffRow[];
  tornadoA: ScenarioRunResult["tornado"];
  tornadoB: ScenarioRunResult["tornado"];
}

export async function diffScenarioRuns(runIdA: string, runIdB: string): Promise<ScenarioDiffResult> {
  const [runA, runB] = await Promise.all([getRun(runIdA), getRun(runIdB)]);
  if (!runA || !runB) throw new Error("One or both scenario runs not found");
  const resultA = runA.result as unknown as ScenarioRunResult;
  const resultB = runB.result as unknown as ScenarioRunResult;
  const [versionA, versionB] = await Promise.all([getVersion(runA.versionId), getVersion(runB.versionId)]);
  const specA = versionA?.spec as unknown as ScenarioSpec;
  const specB = versionB?.spec as unknown as ScenarioSpec;

  return {
    specDiff: {
      horizonDaysA: specA?.horizonDays ?? 0,
      horizonDaysB: specB?.horizonDays ?? 0,
      interventions: diffInterventions(specA?.interventions ?? [], specB?.interventions ?? []),
    },
    kpiDiff: diffKpiDistributions(resultA, resultB),
    tornadoA: resultA.tornado,
    tornadoB: resultB.tornado,
  };
}

export async function attachScenarioToDecision(input: {
  decisionId?: string;
  title: string;
  rationale?: string;
  scenarioId: string;
  scenarioRunId: string;
}) {
  if (input.decisionId) {
    await db
      .update(decisions)
      .set({ scenarioId: input.scenarioId, scenarioRunId: input.scenarioRunId, rationale: input.rationale ?? null })
      .where(eq(decisions.id, input.decisionId));
    return input.decisionId;
  }
  const id = crypto.randomUUID();
  await db.insert(decisions).values({
    id,
    title: input.title,
    rationale: input.rationale ?? null,
    scenarioId: input.scenarioId,
    scenarioRunId: input.scenarioRunId,
  });
  return id;
}
