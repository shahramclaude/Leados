// Belief Fabric — a small noisy-OR Bayesian-style network over nine
// latent organisational risk nodes. Each latent node is driven by a
// set of weighted observable "evidences" in [0,1]. Combination uses
// the noisy-OR rule: P(node) = 1 - Π(1 - evidence_i * weight_i),
// which guarantees the result stays within [0,1] for any evidence
// inputs within [0,1] and weights within [0,1].

export const LATENT_NODES = [
  "flightRisk",
  "burnoutRisk",
  "performanceRisk",
  "cultureRisk",
  "executionRisk",
  "financialRisk",
  "marketRisk",
  "operationalRisk",
  "complianceRisk",
] as const;

export type LatentNode = (typeof LATENT_NODES)[number];

export type Evidence = { value: number; weight: number };

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function noisyOr(evidences: Evidence[]): number {
  if (evidences.length === 0) return 0;
  let productOfMisses = 1;
  for (const e of evidences) {
    const v = clamp01(e.value);
    const w = clamp01(e.weight);
    productOfMisses *= 1 - v * w;
  }
  return clamp01(1 - productOfMisses);
}

export type ObservableInput = Record<LatentNode, Evidence[]>;

/** Default "prior" observables: each node has one evidence at 0.5 weight 0.5. */
export function defaultObservables(): ObservableInput {
  const out = {} as ObservableInput;
  for (const node of LATENT_NODES) {
    out[node] = [{ value: 0.5, weight: 0.5 }];
  }
  return out;
}

export function computePosteriors(observables: ObservableInput): Record<LatentNode, number> {
  const out = {} as Record<LatentNode, number>;
  for (const node of LATENT_NODES) {
    out[node] = noisyOr(observables[node] ?? []);
  }
  return out;
}

/**
 * Second-order cascade risk: combine the nine latent posteriors with
 * noisy-OR again. This is intentionally "pessimistic" — many
 * moderate risks compound into a much higher cascade risk, which is
 * the entire point of a cascade metric.
 */
export function computeCascadeRisk(posteriors: Record<LatentNode, number>): number {
  const evidences: Evidence[] = LATENT_NODES.map((n) => ({
    value: posteriors[n] ?? 0,
    weight: 1,
  }));
  return noisyOr(evidences);
}

export type DriftPoint = { day: number; value: number };

export type DriftResult = {
  drifting: boolean;
  ratePerDay: number;
  intercept: number;
  rSquared: number;
};

/** Ordinary least squares slope over a daily posterior series. */
export function detectBeliefDrift(series: DriftPoint[], threshold = 0.001): DriftResult {
  const n = series.length;
  if (n < 2) {
    return { drifting: false, ratePerDay: 0, intercept: 0, rSquared: 0 };
  }
  const xs = series.map((p) => p.day);
  const ys = series.map((p) => p.value);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - yMean) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return {
    drifting: slope > threshold,
    ratePerDay: slope,
    intercept,
    rSquared,
  };
}

// ── DB-backed dedup (used by BF_04) ────────────────────────────────
// Imported lazily-typed so this module stays importable from both
// server and pure-computation contexts.
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type InsertBeliefSnapshotInput = {
  entityType: string;
  entityId: number;
  node: string;
  value: number;
  snapshotAt: Date;
};

/**
 * Inserts a belief snapshot, but if one already exists for the same
 * (entityType, entityId, node) within a 60-second window, updates
 * that row in place instead of inserting a duplicate.
 */
export async function insertBeliefSnapshotDeduped(
  db: Db,
  snapshot: InsertBeliefSnapshotInput,
): Promise<{ inserted: boolean; id: number }> {
  const candidates = await db
    .select()
    .from(schema.beliefSnapshots)
    .where(
      and(
        eq(schema.beliefSnapshots.entityType, snapshot.entityType),
        eq(schema.beliefSnapshots.entityId, snapshot.entityId),
        eq(schema.beliefSnapshots.node, snapshot.node),
      ),
    );

  const windowMs = 60_000;
  const match = candidates.find(
    (c) => Math.abs(c.snapshotAt.getTime() - snapshot.snapshotAt.getTime()) <= windowMs,
  );

  if (match) {
    await db
      .update(schema.beliefSnapshots)
      .set({ value: snapshot.value, snapshotAt: snapshot.snapshotAt })
      .where(eq(schema.beliefSnapshots.id, match.id));
    return { inserted: false, id: match.id };
  }

  const [row] = await db.insert(schema.beliefSnapshots).values(snapshot).returning();
  return { inserted: true, id: row.id };
}

export type BeliefSnapshotLike = {
  entityType: string;
  entityId: number;
  node: string;
  value: number;
  snapshotAt: Date;
};

/**
 * Deduplicate belief snapshots that land within the same 60-second
 * window for the same (entityType, entityId, node) tuple. Returns
 * the list with duplicates collapsed, keeping the latest value.
 */
export function dedupeBeliefSnapshots<T extends BeliefSnapshotLike>(snapshots: T[]): T[] {
  const buckets = new Map<string, T>();
  for (const s of snapshots) {
    const windowMs = 60_000;
    const bucketTs = Math.floor(s.snapshotAt.getTime() / windowMs);
    const key = `${s.entityType}:${s.entityId}:${s.node}:${bucketTs}`;
    const existing = buckets.get(key);
    if (!existing || s.snapshotAt.getTime() >= existing.snapshotAt.getTime()) {
      buckets.set(key, s);
    }
  }
  return Array.from(buckets.values());
}
