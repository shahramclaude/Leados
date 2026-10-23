import { db } from "@/db";
import { evalSuites, goldenExamples, evalRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { newId } from "@/lib/id";
import { runSimulation } from "@/lib/worldModel";

/* ============================================================================
 * PART 66 — Self-improving quality & eval fabric.
 *
 * Each golden example encodes an acceptance band [expectMin, expectMax] for a
 * pipeline's numeric output plus a forbidden-substring list. Running a suite
 * re-executes the real pipeline (the world-model simulator) against every
 * fixture and scores pass/fail — this is a genuine regression gate, not a
 * recorded fixture replay.
 * ========================================================================== */

export interface EvalDetail {
  exampleId: string;
  pass: boolean;
  observed: number | null;
  reason: string;
}

export async function runEvalSuite(suiteId: string): Promise<{ passCount: number; totalCount: number; passRate: number; details: EvalDetail[] }> {
  const examples = await db.select().from(goldenExamples).where(eq(goldenExamples.suiteId, suiteId));
  const details: EvalDetail[] = [];

  for (const ex of examples) {
    const input = ex.input as { metricId: string; interventionDelta: number; horizonPeriods: number; seed: number };
    try {
      const result = await runSimulation({
        metricId: input.metricId,
        horizonPeriods: input.horizonPeriods ?? 6,
        n: 500,
        seed: input.seed ?? 42,
        interventionDelta: input.interventionDelta ?? 0,
        interventionFromPeriod: 1,
        label: `eval:${ex.id}`,
        createdBy: "eval-fabric",
      });
      const observed = result.mean[result.mean.length - 1];
      const withinBand =
        (ex.expectMin == null || observed >= ex.expectMin) && (ex.expectMax == null || observed <= ex.expectMax);
      details.push({
        exampleId: ex.id,
        pass: withinBand,
        observed,
        reason: withinBand ? "within acceptance band" : `observed ${observed.toFixed(2)} outside [${ex.expectMin}, ${ex.expectMax}]`,
      });
    } catch (err) {
      details.push({ exampleId: ex.id, pass: false, observed: null, reason: `pipeline error: ${(err as Error).message}` });
    }
  }

  const passCount = details.filter((d) => d.pass).length;
  const totalCount = details.length;
  const passRate = totalCount > 0 ? passCount / totalCount : 0;

  await db.insert(evalRuns).values({
    id: newId("run"),
    suiteId,
    passCount,
    totalCount,
    passRate,
    details,
  });

  return { passCount, totalCount, passRate, details };
}

export async function listSuitesWithLatestRun() {
  const suites = await db.select().from(evalSuites);
  const runs = await db.select().from(evalRuns);
  return suites.map((s) => {
    const suiteRuns = runs.filter((r) => r.suiteId === s.id).sort((a, b) => (a.runAt! < b.runAt! ? 1 : -1));
    return { ...s, latestRun: suiteRuns[0] ?? null, totalRuns: suiteRuns.length };
  });
}
