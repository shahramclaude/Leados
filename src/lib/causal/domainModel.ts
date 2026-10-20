/**
 * The concrete LEADOS people-analytics SCM used by the demo API/UI. This is
 * deliberately built so that the "flagship" claim people want to make --
 * "1:1 frequency drives retention" -- is DECONFOUNDED on paper by manager
 * quality, an unmeasured (latent) variable. The backdoor criterion
 * correctly refuses to identify that query; see `identification.ts` and the
 * eval harness `scripts/eval-causal.ts` for the proof.
 *
 * A second query (engagement score -> retention) IS identifiable given its
 * observed direct drivers, and is included to contrast "here is what a
 * real causal claim looks like" against the confounded one.
 */

import type { EvidenceRef } from "@/lib/explain";
import type { StructuralCausalModel } from "./types";
import { loadSCM, simulate } from "./scm";
import { mulberry32 } from "./rng";
import type { Row } from "./estimation";

export const LEADOS_PEOPLE_SCM: StructuralCausalModel = {
  id: "leados-people-v1",
  version: "1.0.0",
  label: "LEADOS people & execution SCM (manager cadence -> engagement -> retention)",
  description:
    "Models how team execution facts (1:1 cadence, team size), people facts (tenure, compensation), and an unmeasured manager-quality factor jointly influence engagement and retention. Stored as data so Part 06's digital twin and Part 10's strategy views can load and compose it.",
  createdAt: "2025-01-06T00:00:00.000Z",
  notes:
    "managerQuality is intentionally modelled as latent (observable: false) to make the confounded 1:1-frequency-to-retention path honestly non-identifiable rather than silently biased.",
  variables: [
    {
      id: "managerQuality",
      label: "Manager quality (latent)",
      kind: "latent",
      domain: "continuous",
      description:
        "Unmeasured composite of coaching skill, trust-building, and prioritization ability. Not collected by any current LEADOS data source.",
      observable: false,
    },
    {
      id: "teamSize",
      label: "Team size",
      kind: "execution-fact",
      domain: "continuous",
      description: "Number of direct reports.",
      unit: "reports",
      observable: true,
    },
    {
      id: "managerTenureMonths",
      label: "Manager tenure in role",
      kind: "people-fact",
      domain: "continuous",
      unit: "months",
      description: "Months the manager has held this role.",
      observable: true,
    },
    {
      id: "compensationCompetitiveness",
      label: "Compensation competitiveness",
      kind: "people-fact",
      domain: "continuous",
      description: "Z-scored compensation vs. market benchmark.",
      observable: true,
    },
    {
      id: "oneOnOneFrequency",
      label: "1:1 frequency",
      kind: "execution-fact",
      domain: "count",
      unit: "sessions/month",
      description: "Average number of 1:1 sessions per month between manager and report.",
      observable: true,
    },
    {
      id: "roleClarity",
      label: "Role clarity score",
      kind: "metric",
      domain: "continuous",
      description: "Survey-derived score of how clear the employee's role and expectations are.",
      observable: true,
    },
    {
      id: "engagementScore",
      label: "Engagement score",
      kind: "metric",
      domain: "continuous",
      description: "Composite engagement pulse-survey score.",
      observable: true,
    },
    {
      id: "retentionStays",
      label: "Stayed 12 months",
      kind: "outcome",
      domain: "binary",
      description: "1 if the employee was still employed 12 months later, else 0.",
      observable: true,
    },
    {
      id: "commuteDistanceKm",
      label: "Commute distance",
      kind: "people-fact",
      domain: "continuous",
      unit: "km",
      description:
        "Negative-control variable: has no structural parents or children in this model, so a non-zero estimated 'effect' on it signals a broken estimator, not a real relationship.",
      observable: true,
    },
  ],
  assignments: [
    { variable: "managerQuality", parents: [], fn: { type: "linear", coefficients: {}, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "teamSize", parents: [], fn: { type: "linear", coefficients: {}, intercept: 8 }, noise: { type: "normal", mean: 0, sd: 2 } },
    { variable: "managerTenureMonths", parents: [], fn: { type: "linear", coefficients: {}, intercept: 24 }, noise: { type: "normal", mean: 0, sd: 10 } },
    { variable: "compensationCompetitiveness", parents: [], fn: { type: "linear", coefficients: {}, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "commuteDistanceKm", parents: [], fn: { type: "linear", coefficients: {}, intercept: 15 }, noise: { type: "normal", mean: 0, sd: 8 } },
    {
      variable: "oneOnOneFrequency",
      parents: ["managerQuality", "teamSize", "managerTenureMonths"],
      fn: { type: "linear", coefficients: { managerQuality: 0.6, teamSize: -0.15, managerTenureMonths: 0.02 }, intercept: 2.0 },
      noise: { type: "normal", mean: 0, sd: 0.5 },
    },
    {
      variable: "roleClarity",
      parents: ["managerQuality", "teamSize"],
      fn: { type: "linear", coefficients: { managerQuality: 0.4, teamSize: -0.05 }, intercept: 5 },
      noise: { type: "normal", mean: 0, sd: 1 },
    },
    {
      variable: "engagementScore",
      parents: ["oneOnOneFrequency", "roleClarity", "compensationCompetitiveness"],
      fn: { type: "linear", coefficients: { oneOnOneFrequency: 0.25, roleClarity: 0.5, compensationCompetitiveness: 0.3 }, intercept: 3 },
      noise: { type: "normal", mean: 0, sd: 1 },
    },
    {
      variable: "retentionStays",
      parents: ["engagementScore", "compensationCompetitiveness", "managerQuality"],
      fn: {
        type: "logistic",
        coefficients: { engagementScore: 0.35, compensationCompetitiveness: 0.4, managerQuality: 0.5 },
        intercept: -2,
      },
      noise: { type: "bernoulli", p: 0.5 },
    },
  ],
};

export const DEMO_EVIDENCE: EvidenceRef[] = [
  {
    id: "ev-1on1-cadence-q3",
    kind: "system-log",
    summary: "Calendar-derived 1:1 cadence export, Q3 cohort (n reflects active managers with >=1 direct report).",
    occurredAt: "2025-09-30T00:00:00.000Z",
  },
  {
    id: "ev-engagement-pulse-q3",
    kind: "survey",
    summary: "Quarterly engagement pulse survey, role clarity and engagement composite items.",
    occurredAt: "2025-09-15T00:00:00.000Z",
  },
  {
    id: "ev-hris-retention-12mo",
    kind: "metric-snapshot",
    summary: "HRIS 12-month retention snapshot joined back to the Q3 cohort.",
    occurredAt: "2025-12-31T00:00:00.000Z",
  },
  {
    id: "ev-comp-benchmark",
    kind: "document",
    summary: "Market compensation benchmark used to compute compensation competitiveness z-scores.",
    occurredAt: "2025-08-01T00:00:00.000Z",
  },
];

export function generateDemoDataset(n = 600, seed = 1234): Row[] {
  const model = loadSCM(LEADOS_PEOPLE_SCM);
  const rng = mulberry32(seed);
  return simulate(model, n, rng);
}
