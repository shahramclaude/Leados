// Execution scheduling math: PERT three-point estimates, critical-path
// analysis over milestone dependency chains, delivery-date distributions, and
// a Monte Carlo fallback (interim stand-in for Part 04's shared simulation
// core — see note on `monteCarloDeliveryDays`).
import type { InitiativeNode, MilestoneNode } from "./strategyModels";

export interface PertEstimate {
  milestoneId: string;
  te: number; // expected duration in days
  variance: number; // sigma^2, in days^2
}

/** t_e = (a + 4m + b) / 6, variance = ((b - a) / 6)^2 */
export function pert(a: number, m: number, b: number): { te: number; variance: number } {
  const te = (a + 4 * m + b) / 6;
  const sigma = (b - a) / 6;
  return { te, variance: sigma * sigma };
}

export function pertForMilestone(m: MilestoneNode): PertEstimate {
  const { te, variance } = pert(m.optimisticDays, m.mostLikelyDays, m.pessimisticDays);
  return { milestoneId: m.id, te, variance };
}

// ---------------------------------------------------------------------------
// Critical path: longest path (by cumulative t_e) through the milestone
// dependency graph of a single initiative. Milestones without a declared
// `dependsOnMilestoneId` are treated as chained by `sequence` order, so a
// flat milestone list still produces a single deterministic chain.
// ---------------------------------------------------------------------------
export interface CriticalPathResult {
  initiativeId: string;
  path: string[]; // milestone ids, in order
  totalTe: number; // days
  totalVariance: number; // days^2
  estimatesByMilestoneId: Record<string, PertEstimate>;
}

function effectiveDependency(milestones: MilestoneNode[], m: MilestoneNode): string | null {
  if (m.dependsOnMilestoneId) return m.dependsOnMilestoneId;
  const sorted = [...milestones].sort((a, b) => a.sequence - b.sequence);
  const idx = sorted.findIndex((x) => x.id === m.id);
  if (idx <= 0) return null;
  return sorted[idx - 1].id;
}

export function computeCriticalPath(initiativeId: string, milestones: MilestoneNode[]): CriticalPathResult {
  const ms = milestones.filter((m) => m.initiativeId === initiativeId);
  const estimatesByMilestoneId: Record<string, PertEstimate> = {};
  for (const m of ms) estimatesByMilestoneId[m.id] = pertForMilestone(m);

  // Longest-path DP over the (near-linear) dependency DAG.
  const bestTe = new Map<string, number>();
  const bestVar = new Map<string, number>();
  const bestPrev = new Map<string, string | null>();

  function resolve(id: string, visiting: Set<string>): { te: number; variance: number } {
    if (bestTe.has(id)) return { te: bestTe.get(id)!, variance: bestVar.get(id)! };
    if (visiting.has(id)) {
      // Cycle guard: treat as a dead end rather than infinite recursion.
      bestTe.set(id, 0);
      bestVar.set(id, 0);
      bestPrev.set(id, null);
      return { te: 0, variance: 0 };
    }
    visiting.add(id);
    const m = ms.find((x) => x.id === id)!;
    const dep = effectiveDependency(ms, m);
    const own = estimatesByMilestoneId[id];
    if (!dep) {
      bestTe.set(id, own.te);
      bestVar.set(id, own.variance);
      bestPrev.set(id, null);
      visiting.delete(id);
      return { te: own.te, variance: own.variance };
    }
    const upstream = resolve(dep, visiting);
    const te = upstream.te + own.te;
    const variance = upstream.variance + own.variance;
    bestTe.set(id, te);
    bestVar.set(id, variance);
    bestPrev.set(id, dep);
    visiting.delete(id);
    return { te, variance };
  }

  for (const m of ms) resolve(m.id, new Set());

  let endId: string | null = null;
  let maxTe = -Infinity;
  for (const m of ms) {
    const te = bestTe.get(m.id) ?? 0;
    if (te > maxTe) {
      maxTe = te;
      endId = m.id;
    }
  }

  const path: string[] = [];
  let cursor = endId;
  while (cursor) {
    path.unshift(cursor);
    cursor = bestPrev.get(cursor) ?? null;
  }

  return {
    initiativeId,
    path,
    totalTe: endId ? bestTe.get(endId)! : 0,
    totalVariance: endId ? bestVar.get(endId)! : 0,
    estimatesByMilestoneId,
  };
}

// ---------------------------------------------------------------------------
// Delivery-date distribution: Normal(sum t_e, sum sigma^2) along the critical
// path. P50/P80/P95 use the standard normal quantiles.
// ---------------------------------------------------------------------------
const Z_P50 = 0;
const Z_P80 = 0.8416212335729143;
const Z_P95 = 1.6448536269514722;

export interface DeliveryDateEstimate {
  startDate: string; // ISO
  p50: string;
  p80: string;
  p95: string;
  meanDays: number;
  stdDevDays: number;
}

export function deliveryDateDistribution(startDate: string, totalTeDays: number, totalVarianceDays2: number): DeliveryDateEstimate {
  const stdDev = Math.sqrt(Math.max(0, totalVarianceDays2));
  const start = new Date(startDate);
  const addDays = (days: number) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + Math.round(days));
    return d.toISOString();
  };
  return {
    startDate,
    p50: addDays(totalTeDays + Z_P50 * stdDev),
    p80: addDays(totalTeDays + Z_P80 * stdDev),
    p95: addDays(totalTeDays + Z_P95 * stdDev),
    meanDays: totalTeDays,
    stdDevDays: stdDev,
  };
}

// ---------------------------------------------------------------------------
// Monte Carlo delivery simulation.
//
// INTERIM IMPLEMENTATION NOTICE: the Part 07 brief calls for "Part 04 core"
// to supply the Monte Carlo engine. Part 04 was not present in this
// sandbox's repository, so this module implements a self-contained
// triangular-distribution sampler with the exact interface
// (`seed`, `iterations`, returns P50/P80/P95 + full sample array for
// caching) that a future Part 04 integration should be able to drop in
// behind. Replace the body of `sampleTriangular`/`monteCarloDeliveryDays`
// with a call into the shared core once it exists; callers should not need
// to change.
// ---------------------------------------------------------------------------

// Deterministic PRNG (mulberry32) so tests are reproducible given a seed.
function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleTriangular(a: number, m: number, b: number, rand: () => number): number {
  const u = rand();
  const fc = (m - a) / (b - a || 1);
  if (u < fc) {
    return a + Math.sqrt(u * (b - a || 1) * (m - a));
  }
  return b - Math.sqrt((1 - u) * (b - a || 1) * (b - m));
}

export interface MonteCarloResult {
  initiativeId: string;
  iterations: number;
  p50Days: number;
  p80Days: number;
  p95Days: number;
  meanDays: number;
  cachedAt: string;
}

// Simple in-memory cache keyed by initiativeId + a hash of milestone inputs,
// so repeated calls (e.g. the Execution Board re-rendering) don't re-run
// thousands of iterations per request. This is process-local; a production
// deployment should back this with Redis or a DB table, same as Part 04 will
// presumably do for its shared cache.
const monteCarloCache = new Map<string, MonteCarloResult>();

function cacheKey(initiativeId: string, milestones: MilestoneNode[]): string {
  const sig = milestones
    .map((m) => `${m.id}:${m.optimisticDays}:${m.mostLikelyDays}:${m.pessimisticDays}:${m.dependsOnMilestoneId ?? ""}`)
    .sort()
    .join("|");
  return `${initiativeId}::${sig}`;
}

export function monteCarloDeliveryDays(
  initiativeId: string,
  milestones: MilestoneNode[],
  iterations = 2000,
  seed = 42,
): MonteCarloResult {
  const key = cacheKey(initiativeId, milestones);
  const cached = monteCarloCache.get(key);
  if (cached) return cached;

  const ms = milestones.filter((m) => m.initiativeId === initiativeId);
  const rand = mulberry32(seed);
  const samples: number[] = [];

  for (let it = 0; it < iterations; it++) {
    // Sample each milestone's duration, then recompute the critical path for
    // this sampled world using the same dependency structure.
    const sampledDurations = new Map<string, number>();
    for (const m of ms) {
      sampledDurations.set(m.id, sampleTriangular(m.optimisticDays, m.mostLikelyDays, m.pessimisticDays, rand));
    }
    const bestFinish = new Map<string, number>();
    function resolve(id: string, visiting: Set<string>): number {
      if (bestFinish.has(id)) return bestFinish.get(id)!;
      if (visiting.has(id)) return 0;
      visiting.add(id);
      const m = ms.find((x) => x.id === id)!;
      const dep = effectiveDependency(ms, m);
      const own = sampledDurations.get(id)!;
      const finish = dep ? resolve(dep, visiting) + own : own;
      bestFinish.set(id, finish);
      visiting.delete(id);
      return finish;
    }
    let maxFinish = 0;
    for (const m of ms) maxFinish = Math.max(maxFinish, resolve(m.id, new Set()));
    samples.push(maxFinish);
  }

  samples.sort((a, b) => a - b);
  const pct = (p: number) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))] ?? 0;
  const mean = samples.reduce((s, x) => s + x, 0) / (samples.length || 1);

  const result: MonteCarloResult = {
    initiativeId,
    iterations,
    p50Days: pct(0.5),
    p80Days: pct(0.8),
    p95Days: pct(0.95),
    meanDays: mean,
    cachedAt: new Date().toISOString(),
  };
  monteCarloCache.set(key, result);
  return result;
}

export function clearMonteCarloCache(): void {
  monteCarloCache.clear();
}

/** Pick the top-20 initiatives by WSJF for Monte Carlo risk analysis (Phase 3d). */
export function topInitiativesByWsjf(initiatives: InitiativeNode[], n = 20): InitiativeNode[] {
  return [...initiatives]
    .sort((a, b) => {
      const wa = (a.timeCriticality + a.riskReduction + a.userValue) / (a.jobSize || 1);
      const wb = (b.timeCriticality + b.riskReduction + b.userValue) / (b.jobSize || 1);
      return wb - wa;
    })
    .slice(0, n);
}
