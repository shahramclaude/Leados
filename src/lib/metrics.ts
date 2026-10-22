// LEADOS — Part 38: shared metric-observation helpers.
//
// All domain shims (calibration, fairness, retrieval, AI quality/cost, data
// quality) read and write through this module so the assurance runner has a
// single, consistent time-series shape to evaluate regardless of which
// upstream part eventually produces the real numbers.

import { db } from "@/db";
import { metricBaselines, metricObservations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function recordObservation(input: {
  metricKey: string;
  domain: string;
  value: number;
  windowLabel?: string;
  meta?: Record<string, unknown>;
  observedAt?: Date;
}) {
  const [row] = await db
    .insert(metricObservations)
    .values({
      metricKey: input.metricKey,
      domain: input.domain,
      value: input.value,
      windowLabel: input.windowLabel,
      meta: input.meta ?? null,
      observedAt: input.observedAt ?? new Date(),
    })
    .returning();
  return row;
}

export async function getRecentSeries(metricKey: string, limit = 30) {
  const rows = await db
    .select()
    .from(metricObservations)
    .where(eq(metricObservations.metricKey, metricKey))
    .orderBy(desc(metricObservations.observedAt))
    .limit(limit);
  return rows.reverse(); // chronological
}

export async function ensureBaseline(metricKey: string, domain: string, baselineValue: number) {
  const existing = await db
    .select()
    .from(metricBaselines)
    .where(eq(metricBaselines.metricKey, metricKey))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(metricBaselines).values({ metricKey, domain, baselineValue });
  }
}

export async function getBaseline(metricKey: string): Promise<number | null> {
  const [row] = await db
    .select()
    .from(metricBaselines)
    .where(eq(metricBaselines.metricKey, metricKey))
    .limit(1);
  return row ? row.baselineValue : null;
}

/** Deterministic pseudo-random generator (seeded) so demo series are reproducible. */
export function seededNoise(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}
