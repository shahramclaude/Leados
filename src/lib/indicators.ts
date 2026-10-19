// indicators — the strategic early-warning system: a monitored indicator
// library (market, delivery, people, financial) with thresholds and
// trend-break detection, synthesized into a weekly "what changed and what
// it means" narrative.

export type IndicatorDomain = "market" | "delivery" | "people" | "financial";
export type IndicatorState = "normal" | "warning" | "critical";

export interface IndicatorDef {
  key: string;
  label: string;
  domain: IndicatorDomain;
  unit: string;
  direction: "above_bad" | "below_bad";
  warningThreshold: number;
  criticalThreshold: number;
  linksToScenario?: string | null;
}

export interface IndicatorReading {
  indicatorKey: string;
  value: number;
  recordedAt: string | Date;
}

/** DESIGN PARAMETER: the default monitored indicator library. Seeded as rows
 * in `indicators` but also exported here as the canonical defaults so the
 * early-warning system always has sane coverage even on an empty database. */
export const DEFAULT_INDICATORS: IndicatorDef[] = [
  { key: "runway_months_p50", label: "Median simulated runway", domain: "financial", unit: "months", direction: "below_bad", warningThreshold: 9, criticalThreshold: 5 },
  { key: "burn_trend_pct", label: "Burn trend (vs prior quarter)", domain: "financial", unit: "%", direction: "above_bad", warningThreshold: 0.08, criticalThreshold: 0.2 },
  { key: "covenant_headroom_pct", label: "Covenant headroom", domain: "financial", unit: "%", direction: "below_bad", warningThreshold: 0.25, criticalThreshold: 0.05 },
  { key: "delivery_confidence_avg", label: "Average delivery confidence", domain: "delivery", unit: "0-1", direction: "below_bad", warningThreshold: 0.55, criticalThreshold: 0.35 },
  { key: "open_critical_blockers", label: "Open critical-severity blockers", domain: "delivery", unit: "count", direction: "above_bad", warningThreshold: 1, criticalThreshold: 3 },
  { key: "okr_off_track_share", label: "Share of key results off-track", domain: "delivery", unit: "%", direction: "above_bad", warningThreshold: 0.25, criticalThreshold: 0.45 },
  { key: "competitor_win_rate_against_us", label: "Simulated competitor win probability", domain: "market", unit: "0-1", direction: "above_bad", warningThreshold: 0.45, criticalThreshold: 0.6 },
  { key: "decision_backlog_overdue", label: "Overdue decisions awaiting a call", domain: "people", unit: "count", direction: "above_bad", warningThreshold: 2, criticalThreshold: 5 },
];

export function computeIndicatorState(def: Pick<IndicatorDef, "direction" | "warningThreshold" | "criticalThreshold">, value: number): IndicatorState {
  if (def.direction === "above_bad") {
    if (value >= def.criticalThreshold) return "critical";
    if (value >= def.warningThreshold) return "warning";
    return "normal";
  }
  if (value <= def.criticalThreshold) return "critical";
  if (value <= def.warningThreshold) return "warning";
  return "normal";
}

export interface TrendBreak {
  broke: boolean;
  recentAvg: number;
  priorAvg: number;
  deltaPct: number;
}

/** Compares the mean of the most recent `window` readings against the prior `window` readings. */
export function detectTrendBreak(readings: IndicatorReading[], window = 3): TrendBreak {
  const sorted = [...readings].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  const recent = sorted.slice(-window);
  const prior = sorted.slice(-window * 2, -window);
  const avg = (rows: IndicatorReading[]) => (rows.length ? rows.reduce((s, r) => s + r.value, 0) / rows.length : 0);
  const recentAvg = avg(recent);
  const priorAvg = avg(prior.length ? prior : recent);
  const deltaPct = priorAvg !== 0 ? (recentAvg - priorAvg) / Math.abs(priorAvg) : 0;
  return { broke: Math.abs(deltaPct) > 0.15 && prior.length > 0, recentAvg, priorAvg, deltaPct };
}

const DOMAIN_OBJECTIVE_IMPACT: Record<IndicatorDomain, string> = {
  financial: "runway and fundraising-readiness objectives",
  delivery: "execution and OKR delivery objectives",
  market: "competitive-position and growth objectives",
  people: "decision-velocity and organizational-health objectives",
};

export interface IndicatorEvaluation {
  def: IndicatorDef;
  latestValue: number | null;
  state: IndicatorState;
  trend: TrendBreak | null;
}

export interface StateOfBusinessSynthesis {
  headline: string;
  changedSinceLastWeek: string[];
  implications: string[];
  evaluations: IndicatorEvaluation[];
}

/**
 * Synthesizes the "state of the business" narrative: which indicators
 * changed since the prior reading window, what state they're in, and what
 * that implies for the objectives their domain feeds.
 */
export function synthesizeStateOfBusiness(defs: IndicatorDef[], readingsByKey: Map<string, IndicatorReading[]>): StateOfBusinessSynthesis {
  const evaluations: IndicatorEvaluation[] = defs.map((def) => {
    const readings = readingsByKey.get(def.key) ?? [];
    const sorted = [...readings].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
    const latestValue = sorted.length ? sorted[sorted.length - 1].value : null;
    const state = latestValue === null ? "normal" : computeIndicatorState(def, latestValue);
    const trend = readings.length >= 2 ? detectTrendBreak(readings) : null;
    return { def, latestValue, state, trend };
  });

  const changedSinceLastWeek: string[] = [];
  const implications: string[] = [];
  for (const ev of evaluations) {
    if (ev.trend?.broke) {
      const direction = ev.trend.deltaPct > 0 ? "up" : "down";
      changedSinceLastWeek.push(
        `${ev.def.label} moved ${direction} ${Math.abs(Math.round(ev.trend.deltaPct * 100))}% (now ${ev.latestValue?.toFixed(2)} ${ev.def.unit}, state: ${ev.state}).`,
      );
      implications.push(`This affects ${DOMAIN_OBJECTIVE_IMPACT[ev.def.domain]}${ev.state !== "normal" ? " — recommend review this week." : "."}`);
    } else if (ev.state !== "normal") {
      changedSinceLastWeek.push(`${ev.def.label} is at ${ev.state} (${ev.latestValue?.toFixed(2)} ${ev.def.unit}), unchanged trend.`);
      implications.push(`Continues to pressure ${DOMAIN_OBJECTIVE_IMPACT[ev.def.domain]}.`);
    }
  }

  const criticalCount = evaluations.filter((e) => e.state === "critical").length;
  const warningCount = evaluations.filter((e) => e.state === "warning").length;
  const headline =
    criticalCount > 0
      ? `${criticalCount} indicator(s) in critical state — immediate attention required this week.`
      : warningCount > 0
        ? `${warningCount} indicator(s) in warning state — worth a look this week.`
        : "All monitored indicators are within normal range this week.";

  return { headline, changedSinceLastWeek, implications, evaluations };
}
