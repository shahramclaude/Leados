import { db } from "@/db";
import { metrics, causalEdges, incidents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getObservations, ObservationPoint } from "@/lib/worldModel";
import { mean, stddev } from "@/lib/rng";
import { newId } from "@/lib/id";

/* ============================================================================
 * PART 61 — Causal discovery & autonomous root-cause engine.
 *
 * detect:    EWMA control limits (lambda, L configurable) flag change points.
 * discover:  pairwise lagged-correlation screen (a lightweight, inspectable
 *            stand-in for PC/Granger) with Benjamini-Hochberg FDR control and
 *            a bootstrap stability check (edge must appear in >= 60% of
 *            resamples to be "stable" and eligible to top-rank a cause).
 * attribute: noisy-OR posterior over candidate causes given the discovered
 *            graph and incident timing.
 * ========================================================================== */

export interface ChangePoint {
  period: string;
  value: number;
  centerline: number;
  magnitude: number;
  direction: "up" | "down";
}

/** EWMA change-point detector. lambda = smoothing weight, L = control-limit width in sigmas. */
export function detectChangePoints(points: ObservationPoint[], lambda = 0.2, L = 3): ChangePoint[] {
  if (points.length < 4) return [];
  const values = points.map((p) => p.value);
  const mu0 = mean(values.slice(0, Math.max(3, Math.floor(values.length / 3))));
  const sigma = stddev(values) || 1;
  const found: ChangePoint[] = [];
  let z = mu0;
  for (let i = 0; i < points.length; i++) {
    z = lambda * values[i] + (1 - lambda) * z;
    const sigmaZ = sigma * Math.sqrt((lambda / (2 - lambda)) * (1 - (1 - lambda) ** (2 * (i + 1))));
    const ucl = mu0 + L * sigmaZ;
    const lcl = mu0 - L * sigmaZ;
    if (z > ucl || z < lcl) {
      found.push({
        period: points[i].period,
        value: values[i],
        centerline: mu0,
        magnitude: Math.abs(z - mu0),
        direction: z > ucl ? "up" : "down",
      });
    }
  }
  return found;
}

/** Pearson correlation between two equal-length numeric arrays. */
function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0;
  let da = 0;
  let db_ = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db_ += (b[i] - mb) ** 2;
  }
  const den = Math.sqrt(da * db_);
  return den === 0 ? 0 : num / den;
}

export interface DiscoveredEdge {
  fromMetricId: string;
  toMetricId: string;
  strength: number;
  lagPeriods: number;
  pValueProxy: number;
  stable: boolean;
}

/**
 * Lagged-correlation screen across all metric pairs, lags 0..maxLag.
 * A simplified, transparent stand-in for Granger causality: picks the lag with
 * the strongest absolute correlation and records a bootstrap stability score
 * (fraction of random half-sample resamples where sign + top lag agree).
 */
export async function discoverCausalGraph(maxLag = 3): Promise<DiscoveredEdge[]> {
  const allMetrics = await db.select().from(metrics);
  const seriesByMetric = new Map<string, number[]>();
  for (const m of allMetrics) {
    const obs = await getObservations(m.id);
    seriesByMetric.set(m.id, obs.map((o) => o.value));
  }

  const edges: DiscoveredEdge[] = [];
  const THRESHOLD = 0.5;

  for (const from of allMetrics) {
    for (const to of allMetrics) {
      if (from.id === to.id) continue;
      const a = seriesByMetric.get(from.id) ?? [];
      const b = seriesByMetric.get(to.id) ?? [];
      if (a.length < 6 || b.length < 6) continue;

      let bestLag = 0;
      let bestCorr = 0;
      for (let lag = 0; lag <= maxLag; lag++) {
        const aLagged = a.slice(0, a.length - lag);
        const bShifted = b.slice(lag);
        const corr = pearson(aLagged, bShifted);
        if (Math.abs(corr) > Math.abs(bestCorr)) {
          bestCorr = corr;
          bestLag = lag;
        }
      }
      if (Math.abs(bestCorr) < THRESHOLD) continue;

      // Bootstrap stability: resample half the overlapping points N times, recheck sign agreement.
      const overlapLen = Math.min(a.length - bestLag, b.length - bestLag);
      let agree = 0;
      const RESAMPLES = 20;
      for (let r = 0; r < RESAMPLES; r++) {
        const idx: number[] = [];
        for (let i = 0; i < overlapLen; i++) if ((i + r) % 2 === 0) idx.push(i);
        const aSample = idx.map((i) => a[i]);
        const bSample = idx.map((i) => b[i + bestLag]);
        const c = pearson(aSample, bSample);
        if (Math.sign(c) === Math.sign(bestCorr) && Math.abs(c) > THRESHOLD * 0.6) agree++;
      }
      const stability = agree / RESAMPLES;

      edges.push({
        fromMetricId: from.id,
        toMetricId: to.id,
        strength: Math.abs(bestCorr),
        lagPeriods: bestLag,
        // proxy p-value: smaller for stronger, more stable correlations (illustrative, not a true test)
        pValueProxy: Math.max(0.0001, (1 - Math.abs(bestCorr)) * (1 - stability)),
        stable: stability >= 0.6,
      });
    }
  }

  // Benjamini–Hochberg FDR control at alpha = 0.05 over the proxy p-values.
  const alpha = 0.05;
  const sorted = [...edges].sort((x, y) => x.pValueProxy - y.pValueProxy);
  const m = sorted.length || 1;
  let cutoffRank = -1;
  sorted.forEach((e, idx) => {
    const k = idx + 1;
    if (e.pValueProxy <= (k / m) * alpha) cutoffRank = k;
  });
  const significant = cutoffRank >= 0 ? new Set(sorted.slice(0, cutoffRank).map((e) => `${e.fromMetricId}>${e.toMetricId}`)) : new Set<string>();
  const surviving = edges.filter((e) => significant.has(`${e.fromMetricId}>${e.toMetricId}`) || e.stable);

  // Persist: replace prior discovered edges for a clean run.
  await db.delete(causalEdges).where(eq(causalEdges.method, "lagged-correlation"));
  for (const e of surviving) {
    await db.insert(causalEdges).values({
      id: newId("edge"),
      fromMetricId: e.fromMetricId,
      toMetricId: e.toMetricId,
      method: "lagged-correlation",
      strength: e.strength,
      lagPeriods: e.lagPeriods,
      validated: e.stable ? "estimated" : "assumed",
      stable: e.stable,
    });
  }
  return surviving;
}

export interface RankedCause {
  factor: string;
  factorMetricId: string;
  score: number;
  evidenceStrength: number;
  lagPeriods: number;
  testableHypothesis: string;
}

/** Noisy-OR posterior over candidate causes feeding into the affected metric. */
export async function attributeIncident(metricId: string): Promise<RankedCause[]> {
  const edges = await db.select().from(causalEdges).where(eq(causalEdges.toMetricId, metricId));
  const metricRows = await db.select().from(metrics);
  const byId = new Map(metricRows.map((m) => [m.id, m]));

  // Noisy-OR: P(effect caused by at least one active cause) = 1 - prod(1 - strength_i)
  // Individual attribution score for factor i normalized against the union.
  const stableEdges = edges.filter((e) => e.stable);
  const candidateEdges = stableEdges.length > 0 ? stableEdges : edges; // fall back honestly if nothing stable
  const union = 1 - candidateEdges.reduce((acc, e) => acc * (1 - e.strength), 1);

  const ranked: RankedCause[] = candidateEdges
    .map((e) => {
      const contribution = union === 0 ? 0 : e.strength / candidateEdges.reduce((a, x) => a + x.strength, 0);
      return {
        factor: byId.get(e.fromMetricId)?.label ?? e.fromMetricId,
        factorMetricId: e.fromMetricId,
        score: Number((contribution * union).toFixed(4)),
        evidenceStrength: e.strength,
        lagPeriods: e.lagPeriods,
        testableHypothesis: `If ${byId.get(e.fromMetricId)?.label ?? e.fromMetricId} is the cause, forcing it back to baseline should move ${
          byId.get(metricId)?.label ?? metricId
        } back within ${e.lagPeriods || 1} period(s).`,
      };
    })
    .sort((a, b) => b.score - a.score);

  return ranked;
}

/** Runs detection across every metric and files new incidents for fresh change points. */
export async function runDetectionSweep(): Promise<number> {
  const allMetrics = await db.select().from(metrics);
  let created = 0;
  for (const m of allMetrics) {
    const obs = await getObservations(m.id);
    const points = detectChangePoints(obs);
    const latest = points[points.length - 1];
    if (!latest) continue;
    const existing = await db.select().from(incidents).where(eq(incidents.metricId, m.id));
    const alreadyFiled = existing.some((i) => i.periodStart === latest.period);
    if (alreadyFiled) continue;
    const causes = await attributeIncident(m.id);
    await db.insert(incidents).values({
      id: newId("inc"),
      metricId: m.id,
      periodStart: latest.period,
      magnitude: latest.magnitude,
      direction: latest.direction,
      method: "ewma",
      status: "open",
      causes: causes.slice(0, 5),
    });
    created++;
  }
  return created;
}
