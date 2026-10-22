// LEADOS — Part 39: deterministic demo data generator used by the /api/fitness/seed
// route to populate 6 monthly periods of metric samples, including one
// deliberately-seeded "gaming" period (period index 4) where delivery_velocity
// and decision_adoption_rate move up while their paired counter-metrics
// (rework_rate, decision_outcome_realization_rate) move the wrong way — this
// is what the Goodhart Watch is supposed to catch.

import { METRICS } from "./dimensions";

export interface DemoPeriod {
  periodStart: string;
  periodEnd: string;
  values: Record<string, number>;
}

const BASELINE: Record<string, number> = {
  delivery_velocity: 80,
  rework_rate: 14,
  on_time_rate: 72,
  scope_cut_rate: 18,
  runway_months: 14,
  burn_volatility: 22,
  revenue_growth: 6,
  customer_concentration_risk: 38,
  employee_engagement_score: 68,
  overtime_hours_rate: 24,
  regrettable_attrition_rate: 11,
  internal_mobility_rate: 14,
  decision_adoption_rate: 61,
  decision_outcome_realization_rate: 54,
  decision_reversal_rate: 13,
  open_critical_risk_count: 6,
  risk_detection_rate: 7,
  incident_count: 5,
  near_miss_reporting_rate: 10,
  experiments_run_rate: 4,
  experiment_success_rate: 38,
  knowledge_reuse_rate: 40,
  duplicate_rework_rate: 22,
  customer_satisfaction_score: 70,
  churn_rate: 9,
  stakeholder_escalation_rate: 4,
};

// Gentle per-period drift, direction-aware (positive = genuine improvement).
const TREND: Record<string, number> = {
  delivery_velocity: 2,
  rework_rate: -0.4,
  on_time_rate: 1.2,
  scope_cut_rate: -0.6,
  runway_months: 0.3,
  burn_volatility: -0.8,
  revenue_growth: 0.5,
  customer_concentration_risk: -1,
  employee_engagement_score: 0.8,
  overtime_hours_rate: -0.5,
  regrettable_attrition_rate: -0.3,
  internal_mobility_rate: 0.6,
  decision_adoption_rate: 1,
  decision_outcome_realization_rate: 1.3,
  decision_reversal_rate: -0.3,
  open_critical_risk_count: -0.3,
  risk_detection_rate: 0.3,
  incident_count: -0.2,
  near_miss_reporting_rate: 0.4,
  experiments_run_rate: 0.3,
  experiment_success_rate: 1.1,
  knowledge_reuse_rate: 1.4,
  duplicate_rework_rate: -0.8,
  customer_satisfaction_score: 0.7,
  churn_rate: -0.3,
  stakeholder_escalation_rate: -0.15,
};

// Seeded "gaming" shock applied ONLY at period index GAMING_PERIOD_INDEX:
// velocity and adoption jump up, their counter-metrics jump the wrong way.
// Deliberately placed at the LAST period so the default "compare latest two
// periods" Goodhart Watch view surfaces it without extra configuration.
const GAMING_PERIOD_INDEX = 5;
const GAMING_SHOCK: Record<string, number> = {
  delivery_velocity: 22, // looks like a big win
  rework_rate: 9, // ...but rework spikes too (gamed)
  decision_adoption_rate: 18, // looks like a big win
  decision_outcome_realization_rate: -10, // ...but real outcomes get worse (gamed)
};

function monthLabel(offsetFromStart: number, startYear: number, startMonth: number): { start: string; end: string } {
  const d = new Date(Date.UTC(startYear, startMonth - 1 + offsetFromStart, 1));
  const start = d.toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

export function generateDemoPeriods(periodCount = 6): DemoPeriod[] {
  const periods: DemoPeriod[] = [];
  for (let i = 0; i < periodCount; i++) {
    const { start, end } = monthLabel(i, 2025, 1);
    const values: Record<string, number> = {};
    for (const metric of METRICS) {
      const base = BASELINE[metric.id] ?? (metric.min + metric.max) / 2;
      const trend = TREND[metric.id] ?? 0;
      let value = base + trend * i;
      if (i === GAMING_PERIOD_INDEX && GAMING_SHOCK[metric.id] !== undefined) {
        value += GAMING_SHOCK[metric.id];
      }
      value = Math.min(metric.max, Math.max(metric.min, Number(value.toFixed(2))));
      values[metric.id] = value;
    }
    periods.push({ periodStart: start, periodEnd: end, values });
  }
  return periods;
}

export const DEMO_GAMING_PERIOD_INDEX = GAMING_PERIOD_INDEX;
