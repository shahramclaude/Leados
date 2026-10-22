// Part 28 — process discovery: directly-follows graph (DFG) + a
// "Heuristics-Miner-lite" filter to produce a discovered process model.
//
// This is deliberately a lite version of the Heuristics Miner algorithm
// (Weijters/van der Aalst): we compute the dependency measure
//   dep(a,b) = (count(a->b) - count(b->a)) / (count(a->b) + count(b->a) + 1)
// and keep an edge in the model when it clears both a minimum frequency and
// a minimum dependency score. We do NOT attempt full Petri-net / inductive
// mining (place discovery, silent transitions, long-distance dependencies) —
// see Phase 5 "what we deliberately did not do".
import type { CaseInstance, DFGEdge, DiscoveredModel } from "./types";
import { gapStatsFromSamples } from "./stats";

export interface DiscoveryOptions {
  minFrequency?: number;
  dependencyThreshold?: number;
  gapReservoirCap?: number;
}

const DEFAULTS: Required<DiscoveryOptions> = {
  minFrequency: 2,
  dependencyThreshold: 0.3,
  gapReservoirCap: 2000,
};

export function discoverProcessModel(cases: CaseInstance[], options: DiscoveryOptions = {}): DiscoveredModel {
  const opts = { ...DEFAULTS, ...options };
  const processName = cases[0]?.processName ?? "unknown";

  const pairCounts = new Map<string, number>(); // "a->b" -> count
  const pairGaps = new Map<string, number[]>(); // "a->b" -> gap samples (ms)
  const activities = new Set<string>();
  const startCounts = new Map<string, number>();
  const endCounts = new Map<string, number>();

  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;

  for (const c of cases) {
    if (c.events.length === 0) continue;
    if (!periodStart || c.startedAt < periodStart) periodStart = c.startedAt;
    if (!periodEnd || c.endedAt > periodEnd) periodEnd = c.endedAt;

    startCounts.set(c.events[0].activity, (startCounts.get(c.events[0].activity) ?? 0) + 1);
    endCounts.set(
      c.events[c.events.length - 1].activity,
      (endCounts.get(c.events[c.events.length - 1].activity) ?? 0) + 1,
    );

    for (const e of c.events) activities.add(e.activity);

    for (let i = 0; i < c.events.length - 1; i++) {
      const from = c.events[i].activity;
      const to = c.events[i + 1].activity;
      const key = `${from}->${to}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      const gaps = pairGaps.get(key) ?? [];
      gaps.push(c.events[i + 1].queueMs);
      pairGaps.set(key, gaps);
    }
  }

  const edges: DFGEdge[] = [];
  for (const [key, count] of pairCounts) {
    const [from, to] = key.split("->");
    const reverseKey = `${to}->${from}`;
    const reverseCount = pairCounts.get(reverseKey) ?? 0;
    const dependency = (count - reverseCount) / (count + reverseCount + 1);
    const samples = pairGaps.get(key) ?? [];
    const cappedSamples = samples.slice(0, opts.gapReservoirCap);
    const kept = count >= opts.minFrequency && dependency >= opts.dependencyThreshold;
    edges.push({
      from,
      to,
      count,
      gap: gapStatsFromSamples(samples),
      dependency,
      kept,
      gapSamplesMs: cappedSamples,
    });
  }

  // Fallback-for-connectivity: if an activity has zero kept outgoing edges but
  // has at least one observed transition, keep its single most frequent
  // outgoing edge so the model stays traversable (documented heuristic, not
  // part of the strict frequency/dependency filter).
  for (const activity of activities) {
    const outgoing = edges.filter((e) => e.from === activity);
    if (outgoing.length > 0 && !outgoing.some((e) => e.kept)) {
      const best = outgoing.reduce((a, b) => (b.count > a.count ? b : a));
      best.kept = true;
    }
  }

  edges.sort((a, b) => b.count - a.count);

  const toRanked = (map: Map<string, number>) =>
    [...map.entries()].map(([activity, count]) => ({ activity, count })).sort((a, b) => b.count - a.count);

  return {
    processName,
    source: "mined",
    periodStart: periodStart ?? new Date(),
    periodEnd: periodEnd ?? new Date(),
    caseCount: cases.length,
    activities: [...activities],
    edges,
    startActivities: toRanked(startCounts),
    endActivities: toRanked(endCounts),
    threshold: opts.dependencyThreshold,
    minFrequency: opts.minFrequency,
  };
}

/**
 * Incremental merge for streaming updates: folds a newly-discovered model
 * (computed only from the latest batch of cases) into a previously persisted
 * model without re-scanning full history. Gap reservoirs are merged by
 * concatenation + re-capping, which is an approximation of the true
 * percentile once the reservoir cap is exceeded — documented limitation, not
 * a precise re-sample.
 */
export function mergeDiscoveredModels(
  previous: DiscoveredModel,
  incoming: DiscoveredModel,
  options: DiscoveryOptions = {},
): DiscoveredModel {
  const opts = { ...DEFAULTS, ...options };
  const edgeMap = new Map<string, DFGEdge>();
  for (const e of previous.edges) edgeMap.set(`${e.from}->${e.to}`, { ...e, gapSamplesMs: [...e.gapSamplesMs] });

  for (const incomingEdge of incoming.edges) {
    const key = `${incomingEdge.from}->${incomingEdge.to}`;
    const existing = edgeMap.get(key);
    if (!existing) {
      edgeMap.set(key, { ...incomingEdge });
      continue;
    }
    const mergedSamples = [...existing.gapSamplesMs, ...incomingEdge.gapSamplesMs].slice(-opts.gapReservoirCap);
    existing.count += incomingEdge.count;
    existing.gapSamplesMs = mergedSamples;
    existing.gap = gapStatsFromSamples(mergedSamples);
    edgeMap.set(key, existing);
  }

  // Recompute dependency + kept flags from merged counts.
  const edges = [...edgeMap.values()];
  for (const edge of edges) {
    const reverse = edgeMap.get(`${edge.to}->${edge.from}`);
    const reverseCount = reverse?.count ?? 0;
    edge.dependency = (edge.count - reverseCount) / (edge.count + reverseCount + 1);
    edge.kept = edge.count >= opts.minFrequency && edge.dependency >= opts.dependencyThreshold;
  }

  const activities = new Set([...previous.activities, ...incoming.activities]);
  for (const activity of activities) {
    const outgoing = edges.filter((e) => e.from === activity);
    if (outgoing.length > 0 && !outgoing.some((e) => e.kept)) {
      const best = outgoing.reduce((a, b) => (b.count > a.count ? b : a));
      best.kept = true;
    }
  }

  const mergeRanked = (
    a: { activity: string; count: number }[],
    b: { activity: string; count: number }[],
  ) => {
    const m = new Map<string, number>();
    for (const r of a) m.set(r.activity, (m.get(r.activity) ?? 0) + r.count);
    for (const r of b) m.set(r.activity, (m.get(r.activity) ?? 0) + r.count);
    return [...m.entries()].map(([activity, count]) => ({ activity, count })).sort((x, y) => y.count - x.count);
  };

  return {
    processName: previous.processName,
    source: "mined",
    periodStart: previous.periodStart < incoming.periodStart ? previous.periodStart : incoming.periodStart,
    periodEnd: previous.periodEnd > incoming.periodEnd ? previous.periodEnd : incoming.periodEnd,
    caseCount: previous.caseCount + incoming.caseCount,
    activities: [...activities],
    edges: edges.sort((a, b) => b.count - a.count),
    startActivities: mergeRanked(previous.startActivities, incoming.startActivities),
    endActivities: mergeRanked(previous.endActivities, incoming.endActivities),
    threshold: opts.dependencyThreshold,
    minFrequency: opts.minFrequency,
  };
}
