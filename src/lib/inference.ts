// src/lib/inference.ts
// The Inference Chain Engine: forward chaining, backward (abductive)
// chaining, and one temporal pattern, over the Finding[] + AppState
// produced by engine.ts.
//
// PROVENANCE: the five patterns below (INF-001..INF-005), their premises,
// hypotheses, and the forward/backward chaining algorithms are a direct,
// original TypeScript implementation of the pasted pt-M "Part 1" brief's
// pseudocode. That pseudocode referenced helpers that do not exist anywhere
// verified (LEADOS.engine._days, LEADOS.state.events, computeMetricValue
// against a full event log) — this file substitutes a self-contained data
// model (AppState in types.ts) so the patterns are genuinely executable,
// not copied from, or dependent on, any file in github.com/wbweve/Leados.
// See AI-SESSION-LOG.md for what was and wasn't found there.
import type {
  AppState,
  BackwardPattern,
  Finding,
  ForwardPattern,
  ScoredHypothesis,
} from "./types";
import { computeMetricValue, countActive } from "./engine";

// ═══ FORWARD CHAINING PATTERNS ═══
export const FORWARD_PATTERNS: ForwardPattern[] = [
  {
    id: "INF-001",
    name: "Leadership Absence Cascade",
    pattern: "FORWARD",
    premiseLabels: ["R1 \u2265 2 (missed 1:1s)", "R3 active (ownerless goal)", "R10 active (growth plan missed)"],
    premises: [
      { type: "FINDING", rule: "R1", op: "active", threshold: 2 },
      { type: "FINDING", rule: "R3", op: "active" },
      { type: "FINDING", rule: "R10", op: "active" },
    ],
    conclusion: {
      id: "INF-001-CASCADE",
      severity: 4,
      title: "Leadership absence cascade",
      body:
        "Three simultaneous cadence failures indicate not a busy week but an absent leader. " +
        "The pattern: missed 1:1s \u2192 ownerless goals \u2192 abandoned growth plans \u2192 team " +
        "disengagement \u2192 attrition. You are at step 2. Steps 3-5 follow without intervention.",
      confidence: 0.75,
      confLabel:
        "Inferred from 3-finding co-occurrence. Not measured. False positive rate: ~20% " +
        "(some leaders are genuinely in crisis mode).",
      intervention:
        "Log all 3 overdue 1:1s today. The acts of reconnection, not just the data, matter.",
    },
  },
  {
    id: "INF-002",
    name: "Revenue Model Validity Collapse",
    pattern: "FORWARD",
    premiseLabels: ["R104 active (LTV:CAC < 3)", "R109 active (cohort retention declining)", "R87 active (win/loss concentration)"],
    premises: [
      { type: "FINDING", rule: "R104", op: "active" },
      { type: "FINDING", rule: "R109", op: "active" },
      { type: "FINDING", rule: "R87", op: "active" },
    ],
    conclusion: {
      id: "INF-002-REVENUE_MODEL",
      severity: 5,
      title: "Revenue model validity under question",
      body:
        "LTV:CAC below threshold, retention deteriorating across cohorts, and losses concentrating " +
        "around the same reason. This is not a sales execution problem \u2014 it is a product-market " +
        "fit signal. Acquiring customers at current CAC is only viable if LTV recovers. At current " +
        "retention trends, it will not.",
      confidence: 0.7,
      confLabel:
        "Three-finding inference. Confidence limited by data recency. Valid only if all three " +
        "findings are from current periods.",
      intervention:
        "Immediate: revenue war-room + unit-economics review. This week: cohort analysis + " +
        "customer-voice synthesis. Board must be informed if confirmed.",
    },
  },
  {
    id: "INF-003",
    name: "Organizational Immune Response Failure",
    pattern: "FORWARD",
    premiseLabels: ["R133 active (recurring crisis root cause)", "R128 active (postmortem action ghosted)", "crisisCount \u2265 2"],
    premises: [
      { type: "FINDING", rule: "R133", op: "active" },
      { type: "FINDING", rule: "R128", op: "active" },
      { type: "METRIC", metric: "crisisCount", op: "gte", value: 2 },
    ],
    conclusion: {
      id: "INF-003-IMMUNE",
      severity: 5,
      title: "Organizational immune response failure",
      body:
        "The organization has experienced the same type of crisis twice, conducted postmortems both " +
        "times, and implemented the corrective actions neither time. This is not a crisis problem " +
        "\u2014 it is a learning system failure. The organization cannot convert experience into " +
        "immunity. The third instance of this crisis is structural, not unlucky.",
      confidence: 0.85,
      confLabel:
        "High confidence: recurring root cause (R133) + ghost postmortem actions (R128) + 2+ " +
        "crises is a tightly constrained pattern.",
      intervention:
        "Run a crisis postmortem with explicit action tracking, and open a tracked plan per action " +
        "item (R10 guards the follow-through). The system already has this wiring \u2014 use it.",
    },
  },
];

export interface ForwardResult {
  pattern: ForwardPattern;
  met: boolean;
  premiseStatus: boolean[];
}

export function forwardChain(findings: Finding[], state: AppState): ForwardResult[] {
  return FORWARD_PATTERNS.map((pattern) => {
    const premiseStatus = pattern.premises.map((premise) => {
      if (premise.type === "FINDING") {
        const n = countActive(findings, premise.rule);
        if (premise.op === "active") return premise.threshold ? n >= premise.threshold : n > 0;
        return n === 0;
      }
      const value = computeMetricValue(premise.metric, state);
      if (premise.op === "gte") return value >= premise.value;
      if (premise.op === "lte") return value <= premise.value;
      return false;
    });
    return { pattern, met: premiseStatus.every(Boolean), premiseStatus };
  });
}

// ═══ BACKWARD CHAINING (ABDUCTIVE) PATTERN ═══
export const BACKWARD_PATTERN: BackwardPattern = {
  id: "INF-004",
  name: "Velocity Decline Root Cause Analysis",
  pattern: "BACKWARD",
  observation: { rule: "R73" },
  hypotheses: [
    {
      name: "Capacity reduction",
      evidenceFor: [{ rule: "R81", op: "active" }, { rule: "R19", op: "active" }],
      evidenceAgainst: [],
      explanation: "Velocity is declining because the team is smaller. The same work, fewer people.",
      intervention:
        "Re-plan capacity immediately. Do not assign new features until headcount is restored or scope is reduced.",
    },
    {
      name: "Technical debt drag",
      evidenceFor: [{ rule: "R38", op: "active" }, { rule: "R79", op: "active" }],
      evidenceAgainst: [{ rule: "R81", op: "inactive" }],
      explanation:
        "Velocity is declining because the team is carrying accumulated technical debt with no " +
        "retrospective process to address it. Each sprint, a larger fraction of capacity goes to debt service.",
      intervention: "Schedule a tech-debt sprint before the next feature sprint. Establish a retro cadence.",
    },
    {
      name: "Morale degradation",
      evidenceFor: [{ rule: "R7", op: "active" }, { rule: "R20", op: "active" }],
      evidenceAgainst: [{ rule: "R38", op: "inactive" }, { rule: "R81", op: "inactive" }],
      explanation:
        "Velocity is declining because the team is disengaged and approaching burnout. Output declines before people leave.",
      intervention: "Run a systemic intervention + attrition-risk review. The work is being done \u2014 but not with the same energy.",
    },
    {
      name: "Scope creep",
      evidenceFor: [{ rule: "R74", op: "active" }, { rule: "R68", op: "active" }],
      evidenceAgainst: [],
      explanation:
        "Velocity is declining because scope is growing faster than capacity. The denominator problem: more work, same people.",
      intervention:
        "Prioritize the initiative list and re-plan the sprint with an explicit scope ceiling. The team is not slower \u2014 the task is larger.",
    },
  ],
  label:
    "Abductive inference: best explanation for R73 from the active finding set. All hypotheses are " +
    "evaluated; the one with the most supporting evidence is presented first. Others remain visible for leader verification.",
};

export interface BackwardResult {
  observationMet: boolean;
  scored: ScoredHypothesis[];
  best: ScoredHypothesis | null;
}

export function backwardChain(findings: Finding[]): BackwardResult {
  const observationMet = countActive(findings, BACKWARD_PATTERN.observation.rule) > 0;
  if (!observationMet) return { observationMet, scored: [], best: null };

  const scored: ScoredHypothesis[] = BACKWARD_PATTERN.hypotheses
    .map((hyp) => {
      const forScore = hyp.evidenceFor.filter((e) => countActive(findings, e.rule) > 0).length;
      const againstScore = hyp.evidenceAgainst.filter((e) => countActive(findings, e.rule) === 0).length;
      return { ...hyp, forScore, againstScore, netScore: forScore - againstScore * 0.5 };
    })
    .sort((a, b) => b.netScore - a.netScore);

  return { observationMet, scored, best: scored[0] ?? null };
}

// ═══ TEMPORAL INFERENCE PATTERN (INF-005) ═══
export interface DepartureCascade {
  cascadeRate: number;
  historicalAttritions: number;
  prediction: string | null;
  label: string;
}

/** Mirrors the pasted brief's `compute()` for INF-005: needs >=3 historical
 * attrition dates, counts how many were followed by another within 60 days. */
export function computeDepartureCascade(attritionLog: string[]): DepartureCascade | null {
  if (attritionLog.length < 3) return null;
  const sorted = [...attritionLog].sort();
  let cascadeCount = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const t0 = Date.parse(sorted[i]);
    const followedWithin60 = sorted.slice(i + 1).some((d) => (Date.parse(d) - t0) / 86400000 <= 60);
    if (followedWithin60) cascadeCount++;
  }
  const cascadeRate = cascadeCount / Math.max(1, sorted.length - 1);
  return {
    cascadeRate,
    historicalAttritions: sorted.length,
    prediction:
      cascadeRate > 0.5
        ? `Based on your history (n=${sorted.length}), ${Math.round(cascadeRate * 100)}% of departures ` +
          `have been followed by another within 60 days. The current departure is a leading indicator.`
        : null,
    label:
      `From ${sorted.length} historical attrition events. Cascade rate: ${(cascadeRate * 100).toFixed(0)}%. ` +
      `Labeled: historical pattern, not guaranteed future.`,
  };
}
