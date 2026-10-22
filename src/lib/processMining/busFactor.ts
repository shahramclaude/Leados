// Part 28 — "bus factor of process knowledge".
//
// Identifies steps where a single resource carries most of the volume. This
// is aggregate-safe by construction: if the observed pool of resources for a
// step is smaller than K_ANONYMITY_THRESHOLD, we still report the risk LEVEL
// but redact the specific resourceId so a 1- or 2-person team isn't singled
// out by name from an analytics screen.
import type { BusFactorEntry, CaseInstance } from "./types";

const K_ANONYMITY_THRESHOLD = 3;
const HIGH_RISK_SHARE = 0.7;
const MEDIUM_RISK_SHARE = 0.45;

export function computeBusFactor(cases: CaseInstance[]): BusFactorEntry[] {
  const processName = cases[0]?.processName ?? "unknown";
  const byActivity = new Map<string, Map<string, number>>();

  for (const c of cases) {
    for (const event of c.events) {
      if (!event.resourceId) continue;
      const resourceCounts = byActivity.get(event.activity) ?? new Map<string, number>();
      resourceCounts.set(event.resourceId, (resourceCounts.get(event.resourceId) ?? 0) + 1);
      byActivity.set(event.activity, resourceCounts);
    }
  }

  const entries: BusFactorEntry[] = [];
  for (const [activity, resourceCounts] of byActivity) {
    const total = [...resourceCounts.values()].reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const [topResourceId, topCount] = [...resourceCounts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
    const topResourceShare = topCount / total;
    const distinctResources = resourceCounts.size;

    const risk: BusFactorEntry["risk"] =
      topResourceShare >= HIGH_RISK_SHARE ? "high" : topResourceShare >= MEDIUM_RISK_SHARE ? "medium" : "low";

    const redacted = distinctResources < K_ANONYMITY_THRESHOLD;

    entries.push({
      processName,
      activity,
      distinctResources,
      topResourceShare,
      redacted,
      topResourceId: redacted ? null : topResourceId,
      risk,
    });
  }

  return entries.sort((a, b) => b.topResourceShare - a.topResourceShare);
}
