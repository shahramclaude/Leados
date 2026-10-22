// Part 28 — waiting-time decomposition & bottleneck ranking.
//
// For every activity we split each occurrence's sojourn time into:
//   - active time  (durationMs on the event itself — work actually happening)
//   - queue time   (gap between the previous step finishing and this one
//                    starting — time the case just sat waiting)
// and rank activities by their p85 queue wait, which is far more actionable
// than an average (a long tail of slow cases is what customers feel).
import type { BottleneckEntry, CaseInstance } from "./types";
import { gapStatsFromSamples, mean } from "./stats";

export interface BottleneckOptions {
  /** flag an activity if its p85 queue wait exceeds this many ms */
  flagThresholdMs?: number;
  topN?: number;
}

const DEFAULTS: Required<BottleneckOptions> = {
  flagThresholdMs: 4 * 60 * 60 * 1000, // 4 hours
  topN: 10,
};

interface ActivityAccumulator {
  activeMs: number[];
  queueMs: number[];
  resourceCounts: Map<string, number>;
  handoffFromDifferentResource: number;
  handoffTotal: number;
}

export function analyzeBottlenecks(cases: CaseInstance[], options: BottleneckOptions = {}): BottleneckEntry[] {
  const opts = { ...DEFAULTS, ...options };
  const processName = cases[0]?.processName ?? "unknown";
  const byActivity = new Map<string, ActivityAccumulator>();

  for (const c of cases) {
    for (let i = 0; i < c.events.length; i++) {
      const event = c.events[i];
      const acc: ActivityAccumulator = byActivity.get(event.activity) ?? {
        activeMs: [],
        queueMs: [],
        resourceCounts: new Map<string, number>(),
        handoffFromDifferentResource: 0,
        handoffTotal: 0,
      };
      acc.activeMs.push(event.durationMs);
      acc.queueMs.push(event.queueMs);
      if (event.resourceId) {
        acc.resourceCounts.set(event.resourceId, (acc.resourceCounts.get(event.resourceId) ?? 0) + 1);
      }
      if (i > 0) {
        acc.handoffTotal += 1;
        const prevResource = c.events[i - 1].resourceId;
        if (prevResource && event.resourceId && prevResource !== event.resourceId) {
          acc.handoffFromDifferentResource += 1;
        }
      }
      byActivity.set(event.activity, acc);
    }
  }

  const entries: BottleneckEntry[] = [];
  for (const [activity, acc] of byActivity) {
    const queueStats = gapStatsFromSamples(acc.queueMs);
    const distinctResources = acc.resourceCounts.size;
    const topResourceShare = distinctResources
      ? Math.max(...acc.resourceCounts.values()) / acc.activeMs.length
      : 0;
    const handoffRate = acc.handoffTotal ? acc.handoffFromDifferentResource / acc.handoffTotal : 0;

    let rootCauseHypothesis: string;
    if (distinctResources === 1 && acc.activeMs.length >= 5) {
      rootCauseHypothesis = "single-resource constrained — one person/queue handles all volume (also see bus-factor)";
    } else if (distinctResources > 1 && topResourceShare >= 0.7) {
      rootCauseHypothesis = "resource-concentrated — one resource handles the large majority of this step's volume";
    } else if (/approv|review|sign.?off|authoris|authoriz/i.test(activity)) {
      rootCauseHypothesis = "approval/decision queue — wait looks tied to a human judgement gate";
    } else if (handoffRate >= 0.6) {
      rootCauseHypothesis = "handoff delay — this step usually follows a different resource (context-switch cost)";
    } else {
      rootCauseHypothesis = "general queueing — demand appears to exceed capacity at peak, no single dominant cause found";
    }

    entries.push({
      processName,
      activity,
      occurrences: acc.activeMs.length,
      distinctResources,
      avgActiveMs: mean(acc.activeMs),
      avgQueueMs: queueStats.avgMs,
      p85QueueMs: queueStats.p85Ms,
      totalQueueMs: acc.queueMs.reduce((a, b) => a + b, 0),
      rootCauseHypothesis,
      flagged: queueStats.p85Ms > opts.flagThresholdMs,
    });
  }

  // Ensure the top offenders by p85 wait are always flagged even if below the
  // absolute threshold, up to topN, so small logs still surface a ranking.
  const ranked = [...entries].sort((a, b) => b.p85QueueMs - a.p85QueueMs);
  for (const entry of ranked.slice(0, opts.topN)) {
    entry.flagged = entry.flagged || entry.p85QueueMs > 0;
  }

  return ranked;
}
