// src/lib/intelligence/fairness/metrics.ts
//
// Group fairness metrics computed ONLY on attributes the subject has
// consented to share for fairness auditing (`consentScoped: true` on the
// input rows — callers are responsible for only ever passing consented
// data in). Every metric function reports its sample sizes alongside the
// number: a metric with no sample size next to it is not trustworthy, so we
// never emit one without the other.

export interface GroupOutcome {
  group: string;
  outcome: boolean; // e.g. "selected", "promoted", "flagged"
}

export interface GroupOutcomeLabel extends GroupOutcome {
  label: boolean; // ground truth, when available (e.g. "actually succeeded in role")
}

export interface GroupPrediction {
  group: string;
  predictedProb: number; // 0..1
  label: boolean;
}

export interface GroupMetricResult {
  metric: string;
  value: number | null;
  groups: { group: string; n: number; rate?: number }[];
  minGroupN: number;
  evaluable: boolean;
  note: string;
}

const MIN_GROUP_SAMPLE = 30;

function groupBy<T extends { group: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    if (!m.has(r.group)) m.set(r.group, []);
    m.get(r.group)!.push(r);
  }
  return m;
}

/** max_g rate(g) − min_g rate(g), where rate(g) = P(outcome=true | group=g). */
export function demographicParityDifference(rows: GroupOutcome[], minGroupSample = MIN_GROUP_SAMPLE): GroupMetricResult {
  const groups = groupBy(rows);
  const groupStats = [...groups.entries()].map(([group, items]) => ({
    group,
    n: items.length,
    rate: items.filter((i) => i.outcome).length / items.length,
  }));
  const minGroupN = groupStats.length ? Math.min(...groupStats.map((g) => g.n)) : 0;
  const evaluable = groupStats.length >= 2 && minGroupN >= minGroupSample;
  const value = evaluable ? Math.max(...groupStats.map((g) => g.rate)) - Math.min(...groupStats.map((g) => g.rate)) : null;
  return {
    metric: "demographic_parity_difference",
    value: value === null ? null : Math.round(value * 1000) / 1000,
    groups: groupStats,
    minGroupN,
    evaluable,
    note: evaluable
      ? "computed across all groups with n >= " + minGroupSample
      : `not evaluated: smallest group has n=${minGroupN}, below minimum sample ${minGroupSample}`,
  };
}

function rate(rows: GroupOutcomeLabel[], labelValue: boolean, outcomeValue: boolean): { n: number; rate: number } {
  const denom = rows.filter((r) => r.label === labelValue);
  if (denom.length === 0) return { n: 0, rate: 0 };
  return { n: denom.length, rate: denom.filter((r) => r.outcome === outcomeValue).length / denom.length };
}

/** max difference in TPR across groups, and max difference in FPR across groups — reported together. */
export function equalizedOddsDifference(rows: GroupOutcomeLabel[], minGroupSample = MIN_GROUP_SAMPLE): GroupMetricResult & { tprDiff: number | null; fprDiff: number | null } {
  const groups = groupBy(rows);
  const groupStats = [...groups.entries()].map(([group, items]) => {
    const tpr = rate(items, true, true);
    const fpr = rate(items, false, true);
    return { group, n: items.length, tpr: tpr.rate, tprN: tpr.n, fpr: fpr.rate, fprN: fpr.n };
  });
  const minGroupN = groupStats.length ? Math.min(...groupStats.map((g) => g.n)) : 0;
  const minLabelN = groupStats.length ? Math.min(...groupStats.map((g) => Math.min(g.tprN, g.fprN))) : 0;
  const evaluable = groupStats.length >= 2 && minGroupN >= minGroupSample && minLabelN >= Math.min(10, minGroupSample);
  const tprDiff = evaluable ? Math.max(...groupStats.map((g) => g.tpr)) - Math.min(...groupStats.map((g) => g.tpr)) : null;
  const fprDiff = evaluable ? Math.max(...groupStats.map((g) => g.fpr)) - Math.min(...groupStats.map((g) => g.fpr)) : null;
  const value = evaluable ? Math.max(tprDiff ?? 0, fprDiff ?? 0) : null;
  return {
    metric: "equalized_odds_difference",
    value: value === null ? null : Math.round(value * 1000) / 1000,
    tprDiff: tprDiff === null ? null : Math.round(tprDiff * 1000) / 1000,
    fprDiff: fprDiff === null ? null : Math.round(fprDiff * 1000) / 1000,
    groups: groupStats.map((g) => ({ group: g.group, n: g.n })),
    minGroupN,
    evaluable,
    note: evaluable
      ? `computed across groups with n >= ${minGroupSample} and >= ${Math.min(10, minGroupSample)} per label`
      : `not evaluated: insufficient per-label sample (smallest group n=${minGroupN})`,
  };
}

export interface CalibrationBin {
  group: string;
  bin: string;
  n: number;
  meanPredicted: number;
  observedRate: number;
}

export interface CalibrationReport {
  metric: "calibration_by_group";
  bins: CalibrationBin[];
  expectedCalibrationErrorByGroup: { group: string; n: number; ece: number | null }[];
  evaluable: boolean;
  note: string;
}

/** 5-bucket calibration per group: within each predicted-probability bucket, does the observed rate match? */
export function calibrationByGroup(rows: GroupPrediction[], minGroupSample = MIN_GROUP_SAMPLE): CalibrationReport {
  const groups = groupBy(rows);
  const minGroupN = groups.size ? Math.min(...[...groups.values()].map((v) => v.length)) : 0;
  const evaluable = groups.size >= 2 && minGroupN >= minGroupSample;

  const bins: CalibrationBin[] = [];
  const eceByGroup: { group: string; n: number; ece: number | null }[] = [];

  for (const [group, items] of groups.entries()) {
    const buckets = new Map<string, GroupPrediction[]>();
    for (const item of items) {
      const bIdx = Math.min(4, Math.floor(item.predictedProb * 5));
      const label = `${bIdx * 20}-${bIdx * 20 + 20}%`;
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label)!.push(item);
    }
    let ece = 0;
    for (const [bin, binItems] of buckets.entries()) {
      const meanPredicted = binItems.reduce((s, i) => s + i.predictedProb, 0) / binItems.length;
      const observedRate = binItems.filter((i) => i.label).length / binItems.length;
      bins.push({ group, bin, n: binItems.length, meanPredicted: Math.round(meanPredicted * 1000) / 1000, observedRate: Math.round(observedRate * 1000) / 1000 });
      ece += (binItems.length / items.length) * Math.abs(meanPredicted - observedRate);
    }
    eceByGroup.push({ group, n: items.length, ece: items.length >= minGroupSample ? Math.round(ece * 1000) / 1000 : null });
  }

  return {
    metric: "calibration_by_group",
    bins,
    expectedCalibrationErrorByGroup: eceByGroup,
    evaluable,
    note: evaluable ? `computed across groups with n >= ${minGroupSample}` : `not evaluated: smallest group n=${minGroupN}, below minimum ${minGroupSample}`,
  };
}

export interface KAnonymityResult {
  suppressed: boolean;
  n: number;
  k: number;
  reason: string | null;
}

/** Any displayed aggregate with fewer than `k` underlying people must be suppressed, not rounded or fuzzed. */
export function kAnonymitySuppress(n: number, k = 5): KAnonymityResult {
  const suppressed = n < k;
  return { suppressed, n, k, reason: suppressed ? `group size ${n} is below the k-anonymity threshold (${k}); aggregate withheld` : null };
}
