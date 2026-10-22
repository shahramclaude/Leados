import { db } from "@/db";
import { fitnessSnapshots } from "@/db/schema";
import { simulatePolicy, type HistoricalDimensionScores } from "@/lib/fitness/policySim";
import type { DimensionDecomposition, WeightMap } from "@/lib/fitness/types";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * POST /api/fitness/policies/simulate
 * Body: { weights: WeightMap }
 *
 * Recomputes the full historical fitness series under the PROPOSED weights
 * (using each snapshot's already-recorded per-dimension scores) and reports
 * whether the trend direction would have flipped — this is the "this weight
 * change would have flipped last quarter's trend — proceed?" check required
 * before any Weight Policy activation.
 */
export async function POST(req: Request) {
  try {
    const { weights } = (await req.json()) as { weights?: WeightMap };
    if (!weights) {
      return Response.json({ ok: false, error: "weights map is required." }, { status: 400 });
    }

    const rows = await db.select().from(fitnessSnapshots).orderBy(asc(fitnessSnapshots.periodEnd));
    if (rows.length === 0) {
      return Response.json({ ok: false, error: "No historical snapshots to simulate against. Seed demo data first." }, { status: 400 });
    }

    const history: HistoricalDimensionScores[] = rows.map((r) => {
      const decomposition = r.decomposition as DimensionDecomposition[];
      const dimensionScores = Object.fromEntries(decomposition.map((d) => [d.id, d.score]));
      return {
        periodEnd: r.periodEnd,
        dimensionScores,
        actualFitness: Number(r.fitness),
      };
    });

    const result = simulatePolicy(history, weights);
    return Response.json({ ok: true, simulation: result });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "simulation failed" }, { status: 500 });
  }
}
