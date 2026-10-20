// src/lib/playbooksEngine.ts
//
// Executes playbooks as invocable checklists. Invocable by the automation
// kernel (`invokedVia: "automation"`) or by a human from the UI
// (`invokedVia: "human"`) — both paths go through the same `invokePlaybook`
// so effectiveness measurement never has to special-case the caller.
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { playbookRuns, playbooks } from "@/db/schema";
import type { PlaybookStep, TriggerCondition } from "@/lib/playbooks";

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
  const [updated] = await db
    .update(playbookRuns)
    .set({ stepResults: results })
    .where(eq(playbookRuns.id, runId))
    .returning();
  return updated;
}

export interface CompleteRunInput {
  runId: number;
  outcomeDelta?: number; // positive = measured improvement vs. baseline, negative = regression
}

export async function completeRun(input: CompleteRunInput) {
  const [run] = await db
    .update(playbookRuns)
    .set({ status: "completed", outcomeDelta: input.outcomeDelta ?? null, completedAt: new Date() })
    .where(eq(playbookRuns.id, input.runId))
    .returning();
  return run;
}

export async function failRun(runId: number) {
  const [run] = await db
    .update(playbookRuns)
    .set({ status: "failed", completedAt: new Date() })
    .where(eq(playbookRuns.id, runId))
    .returning();
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
}

/**
 * A/B-ish effectiveness measurement: completion rate + average measured
 * outcome delta across all runs of a playbook. This is the "did following
 * it improve outcomes" signal referenced from playbooksIntelligence.ts and
 * surfaced on the Playbooks page.
 */
export async function computeEffectiveness(playbookId: number): Promise<PlaybookEffectiveness> {
  const runs = await db.select().from(playbookRuns).where(eq(playbookRuns.playbookId, playbookId));
  const completed = runs.filter((r) => r.status === "completed");
  const failed = runs.filter((r) => r.status === "failed");
  const withDelta = completed.filter((r) => r.outcomeDelta !== null && r.outcomeDelta !== undefined);
  const avgOutcomeDelta =
    withDelta.length === 0 ? null : withDelta.reduce((sum, r) => sum + (r.outcomeDelta as number), 0) / withDelta.length;
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
