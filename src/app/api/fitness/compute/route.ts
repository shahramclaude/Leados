import { db } from "@/db";
import { fitnessMetricSamples, fitnessSnapshots, fitnessWeightPolicies } from "@/db/schema";
import { computeFitness, sumContributions } from "@/lib/fitness/compute";
import { METRICS } from "@/lib/fitness/dimensions";
import type { WeightMap } from "@/lib/fitness/types";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/fitness/compute?period=YYYY-MM-DD (optional, defaults to latest)
 *
 * Computes fitness for the given (or latest available) period using the
 * active weight policy and persists a snapshot (full decomposition +
 * sensitivity — never just the number). Returns the full FitnessResult.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedPeriod = searchParams.get("period");

    const [activePolicy] = await db
      .select()
      .from(fitnessWeightPolicies)
      .where(eq(fitnessWeightPolicies.status, "active"))
      .orderBy(desc(fitnessWeightPolicies.activatedAt))
      .limit(1);

    if (!activePolicy) {
      return Response.json(
        { ok: false, error: "No active weight policy. Seed demo data or activate a policy first." },
        { status: 400 },
      );
    }

    let periodEnd = requestedPeriod ?? undefined;
    if (!periodEnd) {
      const [latest] = await db
        .select({ periodEnd: fitnessMetricSamples.periodEnd })
        .from(fitnessMetricSamples)
        .orderBy(desc(fitnessMetricSamples.periodEnd))
        .limit(1);
      if (!latest) {
        return Response.json({ ok: false, error: "No metric samples found. Seed demo data first." }, { status: 400 });
      }
      periodEnd = latest.periodEnd;
    }

    const samples = await db
      .select()
      .from(fitnessMetricSamples)
      .where(eq(fitnessMetricSamples.periodEnd, periodEnd));

    if (samples.length === 0) {
      return Response.json({ ok: false, error: `No metric samples for period ${periodEnd}` }, { status: 404 });
    }

    const metricValues: Record<string, number> = {};
    for (const s of samples) metricValues[s.metricId] = Number(s.value);

    const missing = METRICS.filter((m) => metricValues[m.id] === undefined);
    if (missing.length > 0) {
      return Response.json(
        {
          ok: false,
          error: `Evidence missing for ${missing.length} metric(s): ${missing.map((m) => m.id).join(", ")}`,
        },
        { status: 422 },
      );
    }

    const result = computeFitness({
      weights: activePolicy.weights as WeightMap,
      metricValues,
      policyId: activePolicy.id,
      policyVersion: activePolicy.version,
    });

    // Decomposability sanity check before persisting (Phase 4 gate #1).
    const decomposedSum = sumContributions(result);
    if (Math.abs(decomposedSum - result.fitness) > 1e-9) {
      return Response.json(
        { ok: false, error: "Internal invariant violated: decomposition does not sum to fitness." },
        { status: 500 },
      );
    }

    const periodStart = samples[0].periodStart;
    await db
      .insert(fitnessSnapshots)
      .values({
        periodStart,
        periodEnd,
        policyId: activePolicy.id,
        fitness: result.fitness.toFixed(4),
        decomposition: result.dimensions,
        sensitivity: {
          weights: Object.fromEntries(result.dimensions.map((d) => [d.id, d.weightSensitivity])),
          metrics: Object.fromEntries(result.dimensions.flatMap((d) => d.metrics.map((m) => [m.id, m.sensitivity]))),
        },
      })
      .onConflictDoUpdate({
        target: fitnessSnapshots.periodEnd,
        set: {
          policyId: activePolicy.id,
          fitness: result.fitness.toFixed(4),
          decomposition: result.dimensions,
        },
      });

    return Response.json({ ok: true, result, policy: activePolicy });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "compute failed" }, { status: 500 });
  }
}
