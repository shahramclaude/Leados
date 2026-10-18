// ════════════════════════════════════════════════════════════════════
// Deterministic synthetic organization data used to drive the Signal
// Board end-to-end in this sandbox (no external DB). Generates metric
// time series and event logs keyed exactly off what each Rule declares
// in `dataRefs`, so every rule in the catalog has real data to evaluate
// against, crossing its threshold some of the time (never always-on,
// never always-off) — which is what makes auto-calibration meaningful.
// ════════════════════════════════════════════════════════════════════
import { MS_DAY, Rule, RuleContext, MetricPoint, RuleEvent, Domain } from "./ruleRegistry";

export const NOW = Date.now();
const HISTORY_DAYS = 150;

/** Narrative stress bias per domain (1 = neutral). Higher = more findings
 * fire in that domain, giving the Domain Health Overview believable
 * variety instead of every domain looking identical. */
const DOMAIN_STRESS: Record<Domain, number> = {
  people: 1.1,
  finance: 1.3,
  sales: 1.0,
  ops: 0.95,
  strategy: 1.0,
};

// Small deterministic PRNG (mulberry32) seeded from a string hash so the
// build is stable across runs/environments.
function hashStr(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function collectDataRefs(rules: Rule[]) {
  const metrics = new Map<string, { thresholdKey: string; ruleId: string; direction: "gt" | "lt" }>();
  const events = new Map<string, { kind: "daysSince" | "countInWindow"; thresholdKey: string; windowDays?: number; ruleId: string }>();
  for (const r of rules) {
    for (const m of r.dataRefs.metrics) {
      if (!metrics.has(m.key)) metrics.set(m.key, { thresholdKey: m.thresholdKey, ruleId: r.id, direction: m.direction });
    }
    for (const e of r.dataRefs.events) {
      if (!events.has(e.type)) events.set(e.type, { kind: e.kind, thresholdKey: e.thresholdKey, windowDays: e.windowDays, ruleId: r.id });
    }
  }
  return { metrics, events };
}

/**
 * Generates a daily random-walk series that sits a *safety margin* away from
 * the rule's own threshold on the "healthy" side, biased by domain stress.
 * Neutral stress (1.0) keeps the series comfortably clear of the threshold
 * most of the time (rules fire occasionally, on spikes); higher stress
 * shrinks the margin so the domain's rules fire more often — giving the
 * Domain Health Overview real variety instead of every domain pinned at 0
 * or 100.
 */
function generateMetricSeries(key: string, threshold: number, direction: "gt" | "lt", stress: number): MetricPoint[] {
  const rnd = mulberry32(hashStr(key));
  const t = Number.isFinite(threshold) && threshold !== 0 ? threshold : 50;
  const amplitude = Math.max(Math.abs(t) * 0.28, 1);
  // Margin shrinks as stress rises past 1.0, grows as stress falls below 1.0.
  const margin = amplitude * (1.2 / stress);
  const center = direction === "gt" ? t - margin : t + margin;
  const trendDir = rnd() > 0.5 ? 1 : -1;
  const trendMagnitude = amplitude * 0.01 * trendDir * stress;
  const points: MetricPoint[] = [];
  let value = center + (rnd() - 0.5) * amplitude;
  for (let d = HISTORY_DAYS; d >= 0; d--) {
    const ts = NOW - d * MS_DAY;
    const noise = (rnd() - 0.5) * amplitude * 0.65;
    const weeklyCycle = Math.sin((d / 7) * Math.PI * 2) * amplitude * 0.1;
    value = value * 0.88 + (center + trendMagnitude * (HISTORY_DAYS - d) + noise + weeklyCycle) * 0.12;
    points.push({ ts, value: Math.round(value * 100) / 100 });
  }
  return points;
}

/** Generates event occurrences as a renewal process whose mean inter-arrival
 * (or Poisson rate for count-based rules) is tuned to the rule's own
 * threshold and domain stress, so daysSince()/countInWindow() both fire and
 * clear plausibly over time rather than firing on a coin flip. */
function generateEventSeries(
  type: string,
  spec: { kind: "daysSince" | "countInWindow"; windowDays?: number },
  thresholdHint: number,
  stress: number
): RuleEvent[] {
  const rnd = mulberry32(hashStr(type));
  const events: RuleEvent[] = [];
  if (spec.kind === "daysSince") {
    // Higher stress -> events happen less often relative to threshold -> more overdue.
    const meanGap = Math.max(thresholdHint, 3) * (0.55 * stress);
    let t = NOW - HISTORY_DAYS * MS_DAY;
    while (t < NOW) {
      const gap = (0.5 + rnd() * 1.4) * meanGap; // 0.5x - 1.9x mean gap
      t += gap * MS_DAY;
      if (t < NOW) events.push({ type, ts: t });
    }
  } else {
    const windowDays = spec.windowDays ?? 30;
    // Higher stress -> higher event rate -> more likely to cross count threshold.
    const ratePerDay = (Math.max(thresholdHint, 1) / windowDays) * (0.45 * stress);
    for (let d = HISTORY_DAYS; d >= 0; d--) {
      const ts = NOW - d * MS_DAY;
      if (rnd() < ratePerDay * 0.8) events.push({ type, ts: ts + rnd() * MS_DAY * 0.5 });
      if (rnd() < ratePerDay * 0.25) events.push({ type, ts: ts + rnd() * MS_DAY * 0.9 });
    }
  }
  return events.sort((a, b) => a.ts - b.ts);
}

interface OrgDataset {
  metricHistory: Record<string, MetricPoint[]>;
  events: RuleEvent[];
}

let cachedDataset: OrgDataset | null = null;

export function buildOrgDataset(rules: Rule[]): OrgDataset {
  if (cachedDataset) return cachedDataset;
  const { metrics, events } = collectDataRefs(rules);
  const metricHistory: Record<string, MetricPoint[]> = {};
  for (const [key, info] of metrics) {
    const rule = rules.find((r) => r.id === info.ruleId);
    const hint = rule?.autoThresholds[info.thresholdKey] ?? 50;
    const stress = DOMAIN_STRESS[rule?.domain ?? "ops"] ?? 1;
    metricHistory[key] = generateMetricSeries(key, hint, info.direction, stress);
  }
  let allEvents: RuleEvent[] = [];
  for (const [type, info] of events) {
    const rule = rules.find((r) => r.id === info.ruleId);
    const thresholdKey = info.thresholdKey;
    const hint = rule?.autoThresholds[thresholdKey] ?? (info.kind === "daysSince" ? 30 : 3);
    const stress = DOMAIN_STRESS[rule?.domain ?? "ops"] ?? 1;
    allEvents = allEvents.concat(generateEventSeries(type, { kind: info.kind, windowDays: info.windowDays }, hint, stress));
  }
  cachedDataset = { metricHistory, events: allEvents };
  return cachedDataset;
}

export function contextAt(daysAgo: number, dataset: OrgDataset): RuleContext {
  return {
    now: NOW - daysAgo * MS_DAY,
    metricHistory: dataset.metricHistory,
    events: dataset.events,
  };
}

export function currentContext(rules: Rule[]): RuleContext {
  return contextAt(0, buildOrgDataset(rules));
}

export function historicalContexts(rules: Rule[], daysBack = 30): RuleContext[] {
  const dataset = buildOrgDataset(rules);
  const out: RuleContext[] = [];
  for (let d = daysBack - 1; d >= 0; d--) out.push(contextAt(d, dataset));
  return out;
}

export interface SyntheticOutcome {
  ruleId: string;
  firedAt: Date;
  confirmedProblem: boolean;
}

/** Synthesizes a plausible outcomes log: higher-severity rules are more often
 * confirmed true positives; everything still has some noise so calibration
 * has something real to do. */
export function generateHistoricalOutcomes(rules: Rule[]): SyntheticOutcome[] {
  const outcomes: SyntheticOutcome[] = [];
  for (const rule of rules) {
    const rnd = mulberry32(hashStr(`outcomes:${rule.id}`));
    const n = 4 + Math.floor(rnd() * 14); // 4-17 historical firings
    const basePrecision = Math.min(0.95, 0.35 + rule.severity * 0.11);
    for (let i = 0; i < n; i++) {
      const daysAgo = Math.floor(rnd() * 150);
      outcomes.push({
        ruleId: rule.id,
        firedAt: new Date(NOW - daysAgo * MS_DAY),
        confirmedProblem: rnd() < basePrecision,
      });
    }
  }
  return outcomes;
}

export function metricFullSeries(rules: Rule[], key: string): number[] {
  const dataset = buildOrgDataset(rules);
  return (dataset.metricHistory[key] ?? []).map((p) => p.value);
}

export function resetDatasetCache() {
  cachedDataset = null;
}
