import { db } from "@/db";
import { domains, fitnessScores, metrics } from "@/db/schema";
import { computeFitnessScore } from "@/lib/fitness";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Seam 1 proving endpoint: recompute fitness for every domain from its
// current metrics, persist a snapshot, and return the fleet view.
export async function GET() {
  const allDomains = await db.select().from(domains);
  const results = [];

  for (const domain of allDomains) {
    const domainMetrics = await db.select().from(metrics).where(eq(metrics.domainId, domain.id));
    const fitness = computeFitnessScore(
      domainMetrics.map((m) => ({ name: m.name, value: Number(m.value), target: Number(m.target) })),
    );
    const [saved] = await db
      .insert(fitnessScores)
      .values({
        domainId: domain.id,
        score: String(fitness.score),
        metricCount: fitness.metricCount,
        inputs: fitness.inputs,
      })
      .returning();
    results.push({ domain, fitness: saved });
  }

  return Response.json({ results });
}
