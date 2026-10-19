// ruleEngine.ts
//
// NOTE: recreated for this sandbox — see the comment at the top of
// src/db/schema.ts. This module defines the static rule registry consumed
// by eventBrain.ts and src/lib/agentLoop.ts.
//
// Each rule evaluates a Projection and returns zero or more Findings.
// Confidence returned on a Finding = rule.baseConfidence * calibration
// weight supplied by the caller (weights come from rule calibration,
// see agentLoop.ts STEP 5).

import type { Domain, Finding, Projection, RuleDefinition } from "./types";

export const RULES: RuleDefinition[] = [
  {
    id: "F01",
    name: "Runway Critical",
    domain: "financial",
    baseConfidence: 0.75,
    suggestedPlaybook: {
      id: "pb_runway_extension",
      name: "Runway Extension Playbook",
      description:
        "Freeze non-critical spend, open a bridge-financing conversation, and model a 3/6/9 month runway scenario.",
    },
    description:
      "Fires when the financial domain shows sustained, severe negative signal (burn, missed revenue, funding delays).",
  },
  {
    id: "P02",
    name: "Flight Risk",
    domain: "attrition",
    baseConfidence: 0.6,
    suggestedPlaybook: {
      id: "pb_retention_conversation",
      name: "Retention Conversation Playbook",
      description:
        "Schedule a stay interview within 72h, review comp/role fit, and identify an internal sponsor.",
    },
    description:
      "Fires per-person when 3 or more distinct flight-risk indicators are observed in the lookback window.",
  },
  {
    id: "P03",
    name: "Morale Decline",
    domain: "morale",
    baseConfidence: 0.55,
    suggestedPlaybook: {
      id: "pb_morale_reset",
      name: "Morale Reset Playbook",
      description:
        "Restore 1:1 cadence, run a pulse survey, and host a team retro to surface blockers.",
    },
    description:
      "Fires when the morale domain health score is depressed and trending worse.",
  },
  {
    id: "E01",
    name: "Execution Slippage",
    domain: "execution",
    baseConfidence: 0.5,
    suggestedPlaybook: {
      id: "pb_execution_reset",
      name: "Execution Reset Playbook",
      description:
        "Re-baseline milestones, cut scope, and add a daily unblock stand-up for the at-risk workstream.",
    },
    description: "Fires when delivery/execution signals degrade materially.",
  },
  {
    id: "C01",
    name: "Culture Erosion",
    domain: "culture",
    baseConfidence: 0.45,
    suggestedPlaybook: {
      id: "pb_culture_repair",
      name: "Culture Repair Playbook",
      description:
        "Leadership listening tour, values re-alignment session, and anonymous feedback channel review.",
    },
    description:
      "Fires when culture-domain signals (conflict, trust, inclusion) degrade.",
  },
  {
    id: "G01",
    name: "Growth Stall",
    domain: "growth",
    baseConfidence: 0.5,
    suggestedPlaybook: {
      id: "pb_growth_recovery",
      name: "Growth Recovery Playbook",
      description:
        "Audit top-of-funnel channels, re-prioritize the roadmap around the highest-leverage growth lever.",
    },
    description: "Fires when growth-domain signals stall or reverse.",
  },
];

export const RULES_BY_ID: Record<string, RuleDefinition> = Object.fromEntries(
  RULES.map((r) => [r.id, r]),
);

/** Event types that most improve confidence for a given domain, used by
 * STEP 8 (uncertainty mapping) to tell users what to log more of. */
export const DOMAIN_SIGNAL_EVENT_TYPES: Record<Domain, string[]> = {
  financial: ["burn_rate_update", "revenue_update", "funding_milestone"],
  morale: ["pulse_survey", "one_on_one_held", "sentiment_signal"],
  attrition: [
    "skipped_1on1",
    "recruiter_contact_detected",
    "performance_review",
  ],
  execution: ["milestone_update", "sprint_report", "blocker_logged"],
  culture: ["culture_survey", "conflict_reported", "values_feedback"],
  growth: ["funnel_report", "customer_signup", "churn_event"],
};

/** Flight-risk indicator event types — distinct types observed for a person
 * count toward the P02 threshold (>= 3 distinct types). */
const FLIGHT_RISK_INDICATOR_TYPES = new Set([
  "skipped_1on1",
  "negative_sentiment",
  "recruiter_contact_detected",
  "pto_spike",
  "performance_review_drop",
  "reduced_commit_activity",
  "resignation_rumor",
]);

export function isFlightRiskIndicator(eventType: string): boolean {
  return FLIGHT_RISK_INDICATOR_TYPES.has(eventType);
}

export function severityFromScore(score: number): number {
  // score is 0 (critical) .. 10 (healthy) risk space is inverted
  const risk = 10 - score;
  if (risk >= 8) return 5;
  if (risk >= 6) return 4;
  if (risk >= 4) return 3;
  if (risk >= 2) return 2;
  return 1;
}

let idCounter = 0;
function findingId(): string {
  idCounter += 1;
  return `fnd_${Date.now()}_${idCounter}`;
}

function makeFinding(
  rule: RuleDefinition,
  now: Date,
  overrides: Partial<Finding> & { title: string; basis: string },
  weight: number,
): Finding {
  return {
    id: findingId(),
    ruleId: rule.id,
    domain: rule.domain,
    severity: 3,
    confidence: Math.min(1, rule.baseConfidence * weight),
    entityId: null,
    entityType: null,
    createdAt: now,
    ...overrides,
  };
}

/**
 * Evaluate all rules against a projection.
 * @param weights per-rule calibration multiplier (default 1), produced by
 *   agentLoop STEP 5 rule calibration.
 */
export function evaluateAll(
  P: Projection,
  now: Date,
  weights: Record<string, number> = {},
): Finding[] {
  const findings: Finding[] = [];

  for (const rule of RULES) {
    const weight = weights[rule.id] ?? 1;
    const dp = P.domains[rule.domain];
    if (!dp) continue;

    if (rule.id === "P02") {
      // per-person flight risk
      for (const person of Object.values(P.people)) {
        if (person.flightRiskCount >= 3) {
          findings.push(
            makeFinding(
              rule,
              now,
              {
                title: `${person.name} shows elevated flight risk`,
                basis: `${person.flightRiskCount} distinct flight-risk indicators observed (${person.flightRiskIndicatorTypes.join(", ")})`,
                severity: Math.min(5, 2 + Math.floor(person.flightRiskCount / 2)),
                entityId: person.personId,
                entityType: "person",
              },
              weight,
            ),
          );
        }
      }
      continue;
    }

    // domain-level rules (F01, P03, E01, C01, G01)
    const severity = severityFromScore(dp.score);
    const isCritical = rule.id === "F01" ? severity >= 4 : severity >= 3;
    if (!isCritical) continue;

    findings.push(
      makeFinding(
        rule,
        now,
        {
          title: `${rule.name} detected in ${rule.domain}`,
          basis: `${rule.domain} health score ${dp.score.toFixed(1)}/10, risk velocity ${dp.velocity.toFixed(3)}/day over ${dp.eventCount} events`,
          severity,
          entityId: null,
          entityType: "domain",
        },
        weight,
      ),
    );
  }

  return findings.sort((a, b) => b.severity - a.severity || b.confidence - a.confidence);
}
