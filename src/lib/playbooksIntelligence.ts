// =============================================================================
// playbooksIntelligence.ts — Playbook effectiveness tracking
// =============================================================================
// Applies Part 05's language policy: we only ever say a playbook's use was
// "associated with" an outcome rate, never that it "caused" or "improved"
// anything, unless a controlled/identified causal design exists (it does
// not here — this is observational run data). Every effectiveness figure
// carries its sample size (n) and is suppressed/flagged when n is small.
// =============================================================================

import { db } from "@/db";
import { playbookRuns, playbooks } from "@/db/schema";
import { eq, ne, sql } from "drizzle-orm";

export const MIN_SAMPLE_FOR_CONFIDENT_CLAIM = 5;

export interface EffectivenessSummary {
  playbookId: string;
  playbookName: string;
  totalRuns: number;
  completedRuns: number;
  successRuns: number;
  partialRuns: number;
  failureRuns: number;
  successRate: number | null;
  /** Baseline success rate across all OTHER playbooks' completed runs,
   * shown purely as context — never framed as a counterfactual for this
   * playbook's decisions. */
  baselineSuccessRate: number | null;
  baselineN: number;
  sampleSizeWarning: boolean;
  /** Pre-written, Part-05-compliant language for display. */
  statement: string;
}

export async function computePlaybookEffectiveness(playbookId: string): Promise<EffectivenessSummary> {
  const [playbook] = await db.select().from(playbooks).where(eq(playbooks.id, playbookId));
  if (!playbook) throw new Error("Playbook not found");

  const runs = await db.select().from(playbookRuns).where(eq(playbookRuns.playbookId, playbookId));
  const completed = runs.filter((r) => r.outcome !== "in_progress");
  const successRuns = completed.filter((r) => r.outcome === "success").length;
  const partialRuns = completed.filter((r) => r.outcome === "partial").length;
  const failureRuns = completed.filter((r) => r.outcome === "failure").length;
  const successRate = completed.length ? successRuns / completed.length : null;

  const baselineRows = await db
    .select({ outcome: playbookRuns.outcome, n: sql<number>`count(*)` })
    .from(playbookRuns)
    .where(ne(playbookRuns.playbookId, playbookId))
    .groupBy(playbookRuns.outcome);

  const baselineTotal = baselineRows
    .filter((r) => r.outcome !== "in_progress")
    .reduce((acc, r) => acc + Number(r.n), 0);
  const baselineSuccess = baselineRows.find((r) => r.outcome === "success")?.n ?? 0;
  const baselineSuccessRate = baselineTotal ? Number(baselineSuccess) / baselineTotal : null;

  const sampleSizeWarning = completed.length < MIN_SAMPLE_FOR_CONFIDENT_CLAIM;

  let statement: string;
  if (completed.length === 0) {
    statement = `"${playbook.name}" has no completed runs yet — effectiveness cannot be assessed.`;
  } else if (sampleSizeWarning) {
    statement = `Runs of "${playbook.name}" were associated with a ${(successRate! * 100).toFixed(0)}% success rate, but the sample is small (n=${completed.length}); treat this as directional, not conclusive.`;
  } else {
    const vsBaseline =
      baselineSuccessRate !== null
        ? ` This is associated with a ${successRate! >= baselineSuccessRate ? "higher" : "lower"} rate than the ${(baselineSuccessRate * 100).toFixed(0)}% baseline across other playbooks (n=${baselineTotal}); no causal claim is made, as runs are not randomly assigned.`
        : "";
    statement = `Runs of "${playbook.name}" were associated with a ${(successRate! * 100).toFixed(0)}% success rate across ${completed.length} completed runs.${vsBaseline}`;
  }

  return {
    playbookId,
    playbookName: playbook.name,
    totalRuns: runs.length,
    completedRuns: completed.length,
    successRuns,
    partialRuns,
    failureRuns,
    successRate,
    baselineSuccessRate,
    baselineN: baselineTotal,
    sampleSizeWarning,
    statement,
  };
}

export async function computeAllPlaybookEffectiveness() {
  const all = await db.select().from(playbooks);
  return Promise.all(all.map((p) => computePlaybookEffectiveness(p.id)));
}

/** Effectiveness badge tier for UI display — purely descriptive bucketing of
 * the observational success rate + sample size, not a quality judgement. */
export function effectivenessBadge(summary: EffectivenessSummary): {
  label: string;
  tone: "neutral" | "positive" | "caution";
} {
  if (summary.completedRuns === 0) return { label: "No data yet", tone: "neutral" };
  if (summary.sampleSizeWarning) return { label: `Early signal (n=${summary.completedRuns})`, tone: "caution" };
  if (summary.successRate !== null && summary.successRate >= 0.8) {
    return { label: `Associated with ${(summary.successRate * 100).toFixed(0)}% success (n=${summary.completedRuns})`, tone: "positive" };
  }
  return { label: `${((summary.successRate ?? 0) * 100).toFixed(0)}% success (n=${summary.completedRuns})`, tone: "neutral" };
}
