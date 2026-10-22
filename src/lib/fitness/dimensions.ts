// LEADOS — Part 39: the declared, transparent decomposition of organizational
// fitness. Every raw metric here carries:
//   - an evidence class (measured / derived / self_reported / proxy) — honesty
//     rule: we never pretend a proxy is a measurement.
//   - a Goodhart risk: how a manager could move this number without real
//     improvement.
//   - a counter-metric id that should move in step with genuine improvement,
//     used by the Goodhart Watch anomaly detector (src/lib/fitness/goodhart.ts).
//
// This file is the audited "policy surface" of the fitness function's shape.
// Weights (how much each dimension counts) are NOT here — those are stored,
// versioned, and rationale-carrying in fitness_weight_policies (Weight Policy
// flow), because weighting is an org policy decision, not an engineering one.

import type { FitnessDimension, FitnessMetric } from "./types";

export const DIMENSIONS: FitnessDimension[] = [
  {
    id: "execution_health",
    name: "Execution Health",
    description: "Can the org reliably turn commitments into delivered outcomes?",
    defaultWeight: 0.2,
  },
  {
    id: "financial_resilience",
    name: "Financial Resilience",
    description: "Can the org absorb shocks and fund its own future?",
    defaultWeight: 0.2,
  },
  {
    id: "people_sustainability",
    name: "People Sustainability",
    description: "Is current performance being bought with unsustainable human cost?",
    defaultWeight: 0.15,
  },
  {
    id: "decision_quality",
    name: "Decision Quality",
    description: "Are decisions well-formed, adopted, and actually realizing their intended outcome?",
    defaultWeight: 0.15,
  },
  {
    id: "risk_posture",
    name: "Risk Posture",
    description: "Is risk genuinely controlled, or merely under-reported?",
    defaultWeight: 0.1,
  },
  {
    id: "learning_velocity",
    name: "Learning Velocity",
    description: "Is the org running real experiments and converting them into reusable knowledge?",
    defaultWeight: 0.1,
  },
  {
    id: "stakeholder_health",
    name: "Stakeholder Health",
    description: "Are customers and partners genuinely satisfied and staying, not just responding to surveys?",
    defaultWeight: 0.1,
  },
];

export const METRICS: FitnessMetric[] = [
  // --- Execution Health -----------------------------------------------
  {
    id: "delivery_velocity",
    dimensionId: "execution_health",
    name: "Delivery Velocity",
    description: "Throughput of committed work completed per period.",
    unit: "points/period",
    direction: "higher_better",
    evidenceClass: "measured",
    min: 0,
    max: 200,
    goodhartRisk:
      "Teams inflate estimates, split trivial tickets, or declare work 'done' before it is verified to farm velocity points.",
    counterMetricId: "rework_rate",
    counterRationale:
      "Gamed velocity shows up later as rework: work marked done gets reopened or redone. Velocity up + rework up = suspicious.",
  },
  {
    id: "rework_rate",
    dimensionId: "execution_health",
    name: "Rework Rate",
    description: "Share of completed work reopened, reverted, or redone within 30 days.",
    unit: "%",
    direction: "lower_better",
    evidenceClass: "derived",
    min: 0,
    max: 60,
    goodhartRisk:
      "Teams can hide rework by filing it as 'new work' instead of reopening tickets, silently lowering the measured rate.",
    counterMetricId: "delivery_velocity",
    counterRationale: "If rework is being relabeled as new work, velocity will show an unexplained parallel rise.",
  },
  {
    id: "on_time_rate",
    dimensionId: "execution_health",
    name: "On-Time Delivery Rate",
    description: "Share of commitments delivered by their committed date.",
    unit: "%",
    direction: "higher_better",
    evidenceClass: "measured",
    min: 0,
    max: 100,
    goodhartRisk: "Teams quietly renegotiate or push out due dates close to the deadline to avoid a miss.",
    counterMetricId: "scope_cut_rate",
    counterRationale: "Hitting dates by cutting scope or re-dating shows up as a rising scope-cut rate.",
  },
  {
    id: "scope_cut_rate",
    dimensionId: "execution_health",
    name: "Scope-Cut / Re-date Rate",
    description: "Share of commitments that had scope reduced or date moved within the final 2 weeks.",
    unit: "%",
    direction: "lower_better",
    evidenceClass: "derived",
    min: 0,
    max: 80,
    goodhartRisk: "Re-dates can be logged as 'original plan' revisions to avoid counting against this metric.",
    counterMetricId: "on_time_rate",
    counterRationale: "If re-dates are being hidden, on-time rate will look implausibly perfect.",
  },

  // --- Financial Resilience ---------------------------------------------
  {
    id: "runway_months",
    dimensionId: "financial_resilience",
    name: "Cash Runway",
    description: "Months of operation remaining at current net burn.",
    unit: "months",
    direction: "higher_better",
    evidenceClass: "measured",
    min: 0,
    max: 36,
    goodhartRisk: "Runway can be extended on paper by deferring payables or delaying necessary hiring/investment.",
    counterMetricId: "burn_volatility",
    counterRationale: "Artificial runway extension via deferred obligations shows up as burn volatility later.",
  },
  {
    id: "burn_volatility",
    dimensionId: "financial_resilience",
    name: "Burn Volatility",
    description: "Standard deviation of monthly net burn over the trailing 6 months, as % of mean burn.",
    unit: "%",
    direction: "lower_better",
    evidenceClass: "derived",
    min: 0,
    max: 100,
    goodhartRisk: "Volatility can be smoothed by reclassifying one-time costs as capex or deferring recognition.",
    counterMetricId: "runway_months",
    counterRationale: "Reclassification games will eventually produce an unexplained runway correction.",
  },
  {
    id: "revenue_growth",
    dimensionId: "financial_resilience",
    name: "Revenue Growth Rate",
    description: "Quarter-over-quarter revenue growth.",
    unit: "%",
    direction: "higher_better",
    evidenceClass: "measured",
    min: -20,
    max: 60,
    goodhartRisk: "Pulling forward revenue recognition or heavy discounting inflates near-term growth.",
    counterMetricId: "customer_concentration_risk",
    counterRationale: "Discount-driven growth often concentrates revenue in fewer, price-sensitive accounts.",
  },
  {
    id: "customer_concentration_risk",
    dimensionId: "financial_resilience",
    name: "Customer Concentration Risk",
    description: "Share of revenue from the top 3 customers.",
    unit: "%",
    direction: "lower_better",
    evidenceClass: "measured",
    min: 0,
    max: 100,
    goodhartRisk: "Revenue can be split across shell/sub-entities of the same customer to appear diversified.",
    counterMetricId: "revenue_growth",
    counterRationale: "Artificially diversified reporting tends to show unstable growth once consolidated.",
  },

  // --- People Sustainability --------------------------------------------
  {
    id: "employee_engagement_score",
    dimensionId: "people_sustainability",
    name: "Employee Engagement Score",
    description: "Pulse survey composite score.",
    unit: "0-100",
    direction: "higher_better",
    evidenceClass: "self_reported",
    min: 0,
    max: 100,
    goodhartRisk: "Survey participation can be made mandatory with manager-visible results, suppressing honesty.",
    counterMetricId: "overtime_hours_rate",
    counterRationale: "Suppressed honesty in surveys does not change real overtime load — the counter is behavioral, not opinion-based.",
  },
  {
    id: "overtime_hours_rate",
    dimensionId: "people_sustainability",
    name: "Overtime Hours Rate",
    description: "Share of staff logging >10 hours/week overtime, trailing 4 weeks.",
    unit: "%",
    direction: "lower_better",
    evidenceClass: "measured",
    min: 0,
    max: 100,
    goodhartRisk: "Overtime can be worked off-the-clock or logged under personal/unpaid categories.",
    counterMetricId: "employee_engagement_score",
    counterRationale: "Hidden overtime tends to eventually depress engagement and raise attrition risk.",
  },
  {
    id: "regrettable_attrition_rate",
    dimensionId: "people_sustainability",
    name: "Regrettable Attrition Rate",
    description: "Annualized rate of high-performer voluntary departures.",
    unit: "%",
    direction: "lower_better",
    evidenceClass: "derived",
    min: 0,
    max: 50,
    goodhartRisk: "Performance ratings can be revised downward right before someone leaves so it is not 'regrettable'.",
    counterMetricId: "internal_mobility_rate",
    counterRationale: "If attrition is being reclassified, internal mobility (an independent retention signal) won't match the story.",
  },
  {
    id: "internal_mobility_rate",
    dimensionId: "people_sustainability",
    name: "Internal Mobility Rate",
    description: "Share of open roles filled by internal transfer/promotion.",
    unit: "%",
    direction: "higher_better",
    evidenceClass: "measured",
    min: 0,
    max: 100,
    goodhartRisk: "Lateral 'musical chairs' moves can be logged as mobility without real growth or retention value.",
    counterMetricId: "regrettable_attrition_rate",
    counterRationale: "Cosmetic mobility does not reduce real regrettable attrition — the pairing exposes the gap.",
  },

  // --- Decision Quality ---------------------------------------------------
  {
    id: "decision_adoption_rate",
    dimensionId: "decision_quality",
    name: "Decision Adoption Rate",
    description: "Share of approved decisions actually implemented as specified within 90 days.",
    unit: "%",
    direction: "higher_better",
    evidenceClass: "derived",
    min: 0,
    max: 100,
    goodhartRisk: "Adoption can be declared by mandate/compliance theater without the outcome actually changing.",
    counterMetricId: "decision_outcome_realization_rate",
    counterRationale: "Classic Goodhart pairing: adoption (did we do it) must be checked against outcome (did it work).",
  },
  {
    id: "decision_outcome_realization_rate",
    dimensionId: "decision_quality",
    name: "Decision Outcome Realization Rate",
    description: "Share of decisions whose pre-committed success metric was actually met.",
    unit: "%",
    direction: "higher_better",
    evidenceClass: "derived",
    min: 0,
    max: 100,
    goodhartRisk: "Success metrics can be redefined after the fact ('moving the goalposts') to count as realized.",
    counterMetricId: "decision_adoption_rate",
    counterRationale: "If goalposts move, realization will rise without a matching rise in genuine adoption fidelity.",
  },
  {
    id: "decision_reversal_rate",
    dimensionId: "decision_quality",
    name: "Decision Reversal Rate",
    description: "Share of T2/T3 decisions reversed or materially amended within 60 days.",
    unit: "%",
    direction: "lower_better",
    evidenceClass: "measured",
    min: 0,
    max: 50,
    goodhartRisk: "Reversals can be relabeled as 'phase 2 iterations' to avoid counting.",
    counterMetricId: "decision_outcome_realization_rate",
    counterRationale: "Relabeled reversals will still show up as missed original outcomes.",
  },

  // --- Risk Posture --------------------------------------------------------
  {
    id: "open_critical_risk_count",
    dimensionId: "risk_posture",
    name: "Open Critical Risks",
    description: "Count of currently open critical-severity risk register entries.",
    unit: "count",
    direction: "lower_better",
    evidenceClass: "measured",
    min: 0,
    max: 30,
    goodhartRisk: "Critical risks can be re-tagged as 'high' or 'medium' to shrink the critical count.",
    counterMetricId: "risk_detection_rate",
    counterRationale: "Suppressing severity does not reduce real detection activity — a falling detection rate alongside falling criticals is suspicious.",
  },
  {
    id: "risk_detection_rate",
    dimensionId: "risk_posture",
    name: "Risk Detection Rate",
    description: "New risks logged per period, as a proxy for active scanning (not avoidance).",
    unit: "count/period",
    direction: "higher_better",
    evidenceClass: "proxy",
    min: 0,
    max: 20,
    goodhartRisk: "Trivial or duplicate risks can be logged to inflate detection activity.",
    counterMetricId: "open_critical_risk_count",
    counterRationale: "Trivial-risk inflation does not move the critical count — a mismatch exposes padding.",
  },
  {
    id: "incident_count",
    dimensionId: "risk_posture",
    name: "Production/Operational Incident Count",
    description: "Count of severity-1/2 incidents per period.",
    unit: "count/period",
    direction: "lower_better",
    evidenceClass: "measured",
    min: 0,
    max: 20,
    goodhartRisk: "Incidents can be downgraded in severity to avoid the count, or quietly resolved without logging.",
    counterMetricId: "near_miss_reporting_rate",
    counterRationale: "A culture that suppresses incident logging also suppresses near-miss reporting — both falling together is the tell.",
  },
  {
    id: "near_miss_reporting_rate",
    dimensionId: "risk_posture",
    name: "Near-Miss Reporting Rate",
    description: "Near-miss reports filed per period.",
    unit: "count/period",
    direction: "higher_better",
    evidenceClass: "proxy",
    min: 0,
    max: 30,
    goodhartRisk: "Teams can over-report trivial near-misses to appear vigilant.",
    counterMetricId: "incident_count",
    counterRationale: "Over-reporting noise does not change the real incident trend, which is independently verified.",
  },

  // --- Learning Velocity ---------------------------------------------------
  {
    id: "experiments_run_rate",
    dimensionId: "learning_velocity",
    name: "Experiments Run Rate",
    description: "Number of Part 30 experiments launched per period.",
    unit: "count/period",
    direction: "higher_better",
    evidenceClass: "measured",
    min: 0,
    max: 20,
    goodhartRisk: "Trivial or duplicate experiments can be launched purely to inflate the count.",
    counterMetricId: "experiment_success_rate",
    counterRationale: "Padding with trivial experiments drives measured success rate toward an implausible 100% or a sudden crash — both are flagged.",
  },
  {
    id: "experiment_success_rate",
    dimensionId: "learning_velocity",
    name: "Experiment Success Rate",
    description: "Share of experiments reaching statistical/practical significance on their declared metric.",
    unit: "%",
    direction: "higher_better",
    evidenceClass: "derived",
    min: 0,
    max: 100,
    goodhartRisk: "Success can be manufactured via p-hacking, cherry-picked metrics, or stopping early on a favorable read.",
    counterMetricId: "experiments_run_rate",
    counterRationale: "Genuine learning velocity grows run-rate and success together; p-hacked success with flat/padded run-rate is suspicious.",
  },
  {
    id: "knowledge_reuse_rate",
    dimensionId: "learning_velocity",
    name: "Knowledge Reuse Rate",
    description: "Share of new initiatives that cite and build on a prior experiment/playbook.",
    unit: "%",
    direction: "higher_better",
    evidenceClass: "derived",
    min: 0,
    max: 100,
    goodhartRisk: "Citations can be added pro-forma without actually reusing the prior learning.",
    counterMetricId: "duplicate_rework_rate",
    counterRationale: "Pro-forma citation without real reuse leaves duplicate rework unchanged or rising.",
  },
  {
    id: "duplicate_rework_rate",
    dimensionId: "learning_velocity",
    name: "Duplicate Rework Rate",
    description: "Share of initiatives solving a problem already solved and documented elsewhere.",
    unit: "%",
    direction: "lower_better",
    evidenceClass: "derived",
    min: 0,
    max: 60,
    goodhartRisk: "Duplicate work can be relabeled as 'a new approach' to avoid classification.",
    counterMetricId: "knowledge_reuse_rate",
    counterRationale: "Relabeled duplication won't show a matching genuine rise in cited reuse.",
  },

  // --- Stakeholder Health --------------------------------------------------
  {
    id: "customer_satisfaction_score",
    dimensionId: "stakeholder_health",
    name: "Customer Satisfaction (CSAT/NPS composite)",
    description: "Normalized composite of CSAT and NPS surveys.",
    unit: "0-100",
    direction: "higher_better",
    evidenceClass: "self_reported",
    min: 0,
    max: 100,
    goodhartRisk: "Surveys can be sent selectively to happy customers, or timed right after a positive touchpoint.",
    counterMetricId: "churn_rate",
    counterRationale: "Selectively-sampled satisfaction does not change real churn behavior.",
  },
  {
    id: "churn_rate",
    dimensionId: "stakeholder_health",
    name: "Customer Churn Rate",
    description: "Trailing-quarter logo/revenue churn.",
    unit: "%",
    direction: "lower_better",
    evidenceClass: "measured",
    min: 0,
    max: 40,
    goodhartRisk: "Churn can be deferred by granting steep discounts or extended contracts right before renewal.",
    counterMetricId: "customer_satisfaction_score",
    counterRationale: "Discount-deferred churn usually coincides with falling, not rising, real satisfaction.",
  },
  {
    id: "stakeholder_escalation_rate",
    dimensionId: "stakeholder_health",
    name: "Stakeholder Escalation Rate",
    description: "Executive-level escalations per 100 active accounts/partners.",
    unit: "rate",
    direction: "lower_better",
    evidenceClass: "measured",
    min: 0,
    max: 20,
    goodhartRisk: "Escalations can be intercepted and resolved informally below the tracked channel.",
    counterMetricId: "customer_satisfaction_score",
    counterRationale: "Informally suppressed escalations still erode the independently collected satisfaction score.",
  },
];

export function getDimension(id: string): FitnessDimension {
  const d = DIMENSIONS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown dimension: ${id}`);
  return d;
}

export function getMetric(id: string): FitnessMetric {
  const m = METRICS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown metric: ${id}`);
  return m;
}

export function metricsForDimension(dimensionId: string): FitnessMetric[] {
  return METRICS.filter((m) => m.dimensionId === dimensionId);
}

/** Default policy weights, seeded from each dimension's defaultWeight, with rationale. */
export function defaultWeightMap(): Record<string, { weight: number; rationale: string }> {
  const out: Record<string, { weight: number; rationale: string }> = {};
  for (const d of DIMENSIONS) {
    out[d.id] = {
      weight: d.defaultWeight,
      rationale: `Seed weight from product default policy v1 — review with leadership before first activation.`,
    };
  }
  return out;
}
