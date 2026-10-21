// src/lib/playbooksEngine.ts
//
// Executes playbooks as invocable checklists. Invocable by the automation
// kernel (`invokedVia: "automation"`, via the `playbook.invoke` capability
// registered at the bottom of this file) or by a human from the UI
// (`invokedVia: "human"`) — both paths go through the same `invokePlaybook`
// so effectiveness measurement never has to special-case the caller.
import { desc, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { playbookRuns, playbooks } from "@/db/schema";
import type { PlaybookStep, TriggerCondition } from "@/lib/playbooks";
import { registerCapability } from "@/lib/kernel/capabilities";

export interface StepResult {
  order: number;
  title: string;
  status: "pending" | "done" | "skipped";
  completedAt?: string;
  note?: string;
}

export interface InvokePlaybookInput {
  playbookId: number;
  invokedBy: string;
  invokedVia?: "human" | "automation";
  context?: Record<string, unknown>;
}

export async function invokePlaybook(input: InvokePlaybookInput) {
  const [playbook] = await db.select().from(playbooks).where(eq(playbooks.id, input.playbookId)).limit(1);
  if (!playbook) throw new Error(`Playbook ${input.playbookId} not found`);
  if (playbook.status === "deprecated") throw new Error(`Playbook ${input.playbookId} is deprecated and cannot be invoked`);

  const steps = (playbook.steps as PlaybookStep[]) ?? [];
  const initialResults: StepResult[] = steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ order: s.order, title: s.title, status: "pending" as const }));

  const [run] = await db
    .insert(playbookRuns)
    .values({
      playbookId: input.playbookId,
      playbookVersion: playbook.version,
      invokedBy: input.invokedBy,
      invokedVia: input.invokedVia ?? "human",
      context: input.context ?? {},
      status: "running",
      stepResults: initialResults,
    })
    .returning();
  return { run, playbook };
}

export async function completeStep(runId: number, stepOrder: number, note?: string) {
  const [run] = await db.select().from(playbookRuns).where(eq(playbookRuns.id, runId)).limit(1);
  if (!run) throw new Error(`Playbook run ${runId} not found`);
  const results = (run.stepResults as StepResult[]).map((s) =>
    s.order === stepOrder ? { ...s, status: "done" as const, completedAt: new Date().toISOString(), note } : s
  );
  const [updated] = await db.update(playbookRuns).set({ stepResults: results }).where(eq(playbookRuns.id, runId)).returning();
  return updated;
}

export interface CompleteRunInput {
  runId: number;
  outcomeDelta?: number; // positive = measured improvement vs. baseline, negative = regression
}

export async function completeRun(input: CompleteRunInput) {
  const [run] = await db
    .update(playbookRuns)
    .set({ status: "completed", outcomeDelta: input.outcomeDelta !== undefined ? input.outcomeDelta.toFixed(4) : null, completedAt: new Date() })
    .where(eq(playbookRuns.id, input.runId))
    .returning();
  return run;
}

export async function failRun(runId: number) {
  const [run] = await db.update(playbookRuns).set({ status: "failed", completedAt: new Date() }).where(eq(playbookRuns.id, runId)).returning();
  return run;
}

export async function listRuns(playbookId?: number) {
  return playbookId
    ? db.select().from(playbookRuns).where(eq(playbookRuns.playbookId, playbookId)).orderBy(desc(playbookRuns.startedAt))
    : db.select().from(playbookRuns).orderBy(desc(playbookRuns.startedAt));
}

export interface PlaybookEffectiveness {
  playbookId: number;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  completionRate: number;
  avgOutcomeDelta: number | null; // mean of recorded outcomeDelta across completed runs with a value
  sampleSize: number;
  automationShare: number; // fraction of runs invoked by the automation kernel vs. humans
  /** Causal-language guard (Part 05 rule): this is an association, not a causal estimate, unless a future identification strategy is attached. */
  effectivenessLanguage: string;
}

/**
 * Outcomes of runs vs comparable non-runs: completion rate + average
 * measured outcome delta across all runs of a playbook. Per Part 05's
 * causal-language rule, this is reported as "associated with" — nothing
 * here establishes identification (no control group, no instrument), so no
 * causal claim is made.
 */
export async function computeEffectiveness(playbookId: number): Promise<PlaybookEffectiveness> {
  const runs = await db.select().from(playbookRuns).where(eq(playbookRuns.playbookId, playbookId));
  const completed = runs.filter((r) => r.status === "completed");
  const failed = runs.filter((r) => r.status === "failed");
  const withDelta = completed.filter((r) => r.outcomeDelta !== null && r.outcomeDelta !== undefined);
  const avgOutcomeDelta = withDelta.length === 0 ? null : withDelta.reduce((sum, r) => sum + Number(r.outcomeDelta), 0) / withDelta.length;
  const automationRuns = runs.filter((r) => r.invokedVia === "automation").length;
  return {
    playbookId,
    totalRuns: runs.length,
    completedRuns: completed.length,
    failedRuns: failed.length,
    completionRate: runs.length === 0 ? 0 : completed.length / runs.length,
    avgOutcomeDelta,
    sampleSize: withDelta.length,
    automationShare: runs.length === 0 ? 0 : automationRuns / runs.length,
    effectivenessLanguage:
      avgOutcomeDelta === null
        ? "insufficient data"
        : `completing this playbook is associated with a mean outcome delta of ${avgOutcomeDelta.toFixed(2)} across ${withDelta.length} run(s) — not a causal estimate.`,
  };
}

/**
 * A/B-style comparison between two versions of the same playbook — only
 * meaningful once both sides have enough completed runs (mission §D: "where
 * volume allows"). Returns null rather than a misleadingly precise number
 * when sample sizes are too small.
 */
export interface VersionComparison {
  versionA: number;
  versionB: number;
  meanDeltaA: number | null;
  meanDeltaB: number | null;
  sampleA: number;
  sampleB: number;
  sufficientVolume: boolean;
  note: string;
}

const MIN_SAMPLE_FOR_COMPARISON = 5;

export async function compareVersions(playbookId: number, versionA: number, versionB: number): Promise<VersionComparison> {
  const runs = await db
    .select()
    .from(playbookRuns)
    .where(eq(playbookRuns.playbookId, playbookId));
  const completedWithDelta = runs.filter((r) => r.status === "completed" && r.outcomeDelta !== null);
  const aRuns = completedWithDelta.filter((r) => r.playbookVersion === versionA);
  const bRuns = completedWithDelta.filter((r) => r.playbookVersion === versionB);
  const mean = (rows: typeof aRuns) => (rows.length === 0 ? null : rows.reduce((s, r) => s + Number(r.outcomeDelta), 0) / rows.length);
  const sufficientVolume = aRuns.length >= MIN_SAMPLE_FOR_COMPARISON && bRuns.length >= MIN_SAMPLE_FOR_COMPARISON;
  return {
    versionA,
    versionB,
    meanDeltaA: mean(aRuns),
    meanDeltaB: mean(bRuns),
    sampleA: aRuns.length,
    sampleB: bRuns.length,
    sufficientVolume,
    note: sufficientVolume
      ? "Sample sizes meet the minimum for a directional comparison — still an association, not a causal claim."
      : `Insufficient volume for a reliable comparison (need >= ${MIN_SAMPLE_FOR_COMPARISON} completed runs per version).`,
  };
}

/** Evaluate a playbook's structured trigger conditions against a flat context object (used by the automation kernel). */
export function evaluateTriggers(conditions: TriggerCondition[], context: Record<string, unknown>): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((c) => {
    const actual = context[c.field];
    switch (c.operator) {
      case "gt":
        return typeof actual === "number" && actual > Number(c.value);
      case "lt":
        return typeof actual === "number" && actual < Number(c.value);
      case "eq":
        return actual === c.value;
      case "contains":
        return typeof actual === "string" && actual.includes(String(c.value));
      default:
        return false;
    }
  });
}

/** Non-runs comparable set, used by computeEffectiveness callers that want a baseline: completed runs excluding this playbook's own runs. Documented as a weak baseline (different playbooks, different contexts) — see docs. */
export async function listNonRunBaselineCount(excludingPlaybookId: number) {
  const rows = await db
    .select()
    .from(playbookRuns)
    .where(ne(playbookRuns.playbookId, excludingPlaybookId));
  return rows.filter((r) => r.status === "completed" && r.outcomeDelta !== null).length;
}

// Register the kernel capability so Part 07's scheduler (or a human from the
// UI, through the same code path) can invoke any active playbook by id.
registerCapability<{ playbookId: number; invokedBy: string; invokedVia?: "human" | "automation"; context?: Record<string, unknown> }, { runId: number }>({
  name: "playbook.invoke",
  description: "Starts a run of an active playbook and returns its run id.",
  run: async (input) => {
    const { run } = await invokePlaybook(input);
    return { runId: run.id };
  },
});

export async function listRunsNeedingVerification() {
  return db.select().from(playbookRuns).where(isNotNull(playbookRuns.outcomeDelta));
}
