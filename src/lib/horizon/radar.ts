import type { HorizonSignal } from "../signals/horizonSignal";

export interface RadarPoint {
  signal: HorizonSignal;
  /** impact * likelihood, for quadrant placement convenience. */
  exposureScore: number;
  clusterId: string;
}

export interface SignalCluster {
  clusterId: string;
  category: HorizonSignal["category"];
  signals: HorizonSignal[];
}

/**
 * Lightweight novelty clustering: groups signals by category plus coarse
 * proximity on the impact/uncertainty plane, so near-duplicate incoming
 * signals collapse into one radar point instead of cluttering the view.
 * (A simple, auditable stand-in for a learned embedding-similarity
 * clusterer — swap in Part 13's clustering model when available.)
 */
export function clusterSignals(signals: HorizonSignal[]): SignalCluster[] {
  const clusters: SignalCluster[] = [];
  for (const signal of signals) {
    const match = clusters.find(
      (c) => c.category === signal.category && c.signals.some((s) => Math.abs(s.impact - signal.impact) <= 1 && Math.abs(s.uncertainty - signal.uncertainty) <= 1)
    );
    if (match) {
      match.signals.push(signal);
    } else {
      clusters.push({ clusterId: `cluster-${signal.category}-${clusters.length}`, category: signal.category, signals: [signal] });
    }
  }
  return clusters;
}

export function toRadarPoints(signals: HorizonSignal[]): RadarPoint[] {
  const clusters = clusterSignals(signals);
  const clusterIdBySignal = new Map<string, string>();
  for (const cluster of clusters) {
    for (const s of cluster.signals) clusterIdBySignal.set(s.id, cluster.clusterId);
  }
  return signals.map((signal) => ({
    signal,
    exposureScore: signal.impact * signal.likelihood,
    clusterId: clusterIdBySignal.get(signal.id) ?? "unclustered",
  }));
}

export type RadarQuadrant = "watch" | "prepare" | "act-now" | "monitor-lightly";

/** Simple quadrant classification on impact/likelihood for the radar view. */
export function classifyQuadrant(signal: HorizonSignal): RadarQuadrant {
  const highImpact = signal.impact >= 4;
  const highLikelihood = signal.likelihood >= 4;
  if (highImpact && highLikelihood) return "act-now";
  if (highImpact && !highLikelihood) return "prepare";
  if (!highImpact && highLikelihood) return "watch";
  return "monitor-lightly";
}
