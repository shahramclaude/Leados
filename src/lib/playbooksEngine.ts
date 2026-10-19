// Part 8 — Knowledge Architecture
// ---------------------------------------------------------------------------
// Adaptive playbooks: turn a finding (+ past pattern matches + current
// belief posteriors + org health) into a concrete, assignable action plan.
//
// There is no prior playbooksEngine.ts in this project yet, so this module
// is written to stand on its own: a small library of domain templates plus
// the `buildAdaptivePlaybook` orchestrator described in the Part 8 spec.

import type {
  AdaptivePlaybook,
  AdaptiveStep,
  BeliefFabricResult,
  Domain,
  Finding,
  PatternMatch,
  PlaybookUrgency,
  ResponsibleParty,
} from "@/lib/types";

interface DomainTemplate {
  name: string;
  description: string;
  steps: Omit<AdaptiveStep, "order">[];
  expectedOutcome: string;
  successMetric: string;
  failureSignal: string;
}

function step(
  title: string,
  responsible: ResponsibleParty,
  timeboxDays: number,
  automaticallyDone = false,
  automationAction: string | null = null,
): Omit<AdaptiveStep, "order"> {
  return { title, responsible, timeboxDays, automaticallyDone, automationAction };
}

// ---------------------------------------------------------------------------
// Domain templates — one per domain, 4+ concrete steps each.
// ---------------------------------------------------------------------------
const DOMAIN_TEMPLATES: Record<Domain, DomainTemplate> = {
  people: {
    name: "Retention Intervention Playbook",
    description: "Stabilize an at-risk individual before the flight risk converts into a departure.",
    steps: [
      step("Schedule 1:1 with at-risk individual within 24h", "leader", 1, false),
      step("Log conversation signals to Leados", "manager", 2, false),
      step("Review compensation vs market rate", "hr", 7, false),
      step("Document retention plan", "leader", 5, false),
    ],
    expectedOutcome: "The individual feels heard, blockers are surfaced, and a concrete retention plan is in place.",
    successMetric: "Flight risk score below 0.4 within 21 days",
    failureSignal: "Person departs within 30 days",
  },
  risk: {
    name: "Risk Containment Playbook",
    description: "Convert an emerging risk signal into an owned, tracked mitigation.",
    steps: [
      step("Convene risk review meeting", "leader", 1, false),
      step("Document risk mitigation options as decisions", "manager", 2, false),
      step("Update risk register with current probability", "system", 0, true, "update_rule_evaluation"),
      step("Assign risk owner and schedule weekly check", "leader", 3, false),
    ],
    expectedOutcome: "Risk probability trends down and an owner is accountable for the mitigation.",
    successMetric: "Risk probability below 0.3 within 30 days",
    failureSignal: "Risk materializes into an incident within 30 days",
  },
  finance: {
    name: "Runway Protection Playbook",
    description: "Protect cash runway when a finance finding signals burn rate or revenue pressure.",
    steps: [
      step("Freeze non-essential spend pending review", "finance", 1, false),
      step("Recalculate runway with updated burn rate", "finance", 2, true, "recalculate_runway"),
      step("Present funding/cost options to leadership", "leader", 5, false),
      step("Set weekly cash position review cadence", "manager", 7, false),
    ],
    expectedOutcome: "Runway projection stabilizes above the board-approved minimum.",
    successMetric: "Runway p50 above 18 months within 60 days",
    failureSignal: "Runway drops below 12 months within 60 days",
  },
  strategy: {
    name: "Strategic Realignment Playbook",
    description: "Reconcile a strategy-level finding against current OKRs and roadmap commitments.",
    steps: [
      step("Convene strategy alignment session", "leader", 3, false),
      step("Map finding against OKRs/roadmap", "manager", 5, false),
      step("Document strategic decision with rationale", "leader", 7, false),
      step("Communicate pivot/adjustment to stakeholders", "manager", 10, false),
    ],
    expectedOutcome: "Strategy and execution are realigned with a documented rationale trail.",
    successMetric: "OKR confidence score above 0.7 within 45 days",
    failureSignal: "OKR confidence score falls below 0.4 within 45 days",
  },
  operations: {
    name: "Operational Stability Playbook",
    description: "Root-cause an operational incident and prevent recurrence.",
    steps: [
      step("Triage operational incident", "manager", 1, false),
      step("Run root-cause review with team", "manager", 3, false),
      step("Update runbook/SOP with new learnings", "system", 5, true, "update_living_doc"),
      step("Monitor KPI recovery for two cycles", "manager", 14, false),
    ],
    expectedOutcome: "The operational KPI recovers and the fix is captured in the living documentation.",
    successMetric: "Incident recurrence at zero for 2 consecutive cycles",
    failureSignal: "Same incident recurs within 2 cycles",
  },
  culture: {
    name: "Culture Reset Playbook",
    description: "Address a culture/engagement finding before sentiment erodes further.",
    steps: [
      step("Pulse-survey affected team", "hr", 3, false),
      step("Leader listening session", "leader", 5, false),
      step("Share findings + action plan transparently", "leader", 7, false),
      step("Re-measure sentiment in 30 days", "hr", 30, false),
    ],
    expectedOutcome: "The team feels heard and sentiment metrics begin to recover.",
    successMetric: "Engagement/sentiment score improves by 10pts within 30 days",
    failureSignal: "Engagement/sentiment score drops further within 30 days",
  },
  customer: {
    name: "Customer Health Recovery Playbook",
    description: "Prevent churn by closing the loop with an affected customer quickly.",
    steps: [
      step("Contact affected customer(s) directly", "manager", 1, false),
      step("Log root cause in CS knowledge base", "manager", 3, false),
      step("Offer remediation / retention action", "leader", 5, false),
      step("Review account health score trend", "system", 7, true, "refresh_health_score"),
    ],
    expectedOutcome: "The customer relationship is repaired and the account health score stabilizes.",
    successMetric: "Account health score above 70 within 30 days",
    failureSignal: "Customer churns within 30 days",
  },
  compliance: {
    name: "Compliance Exposure Playbook",
    description: "Close a compliance exposure before it becomes a violation.",
    steps: [
      step("Escalate to compliance/legal owner", "leader", 1, false),
      step("Document exposure and required remediation", "hr", 3, false),
      step("Implement control fix", "manager", 10, false),
      step("Schedule compliance audit follow-up", "system", 30, true, "schedule_audit_check"),
    ],
    expectedOutcome: "The exposure is remediated and verified by a follow-up audit.",
    successMetric: "Zero open compliance exceptions within 30 days",
    failureSignal: "New compliance violation found within 30 days",
  },
};

function resolveDomainTemplate(domain: Domain | string): DomainTemplate {
  return DOMAIN_TEMPLATES[domain as Domain] ?? DOMAIN_TEMPLATES.operations;
}

function computeUrgency(finding: Finding, beliefResult: BeliefFabricResult): PlaybookUrgency {
  const cascadeP = beliefResult.cascadeRisk?.p ?? 0;
  if (finding.severity >= 5 || cascadeP > 0.6) return "immediate";
  if (finding.severity >= 4) return "this_week";
  return "this_month";
}

function withOrder(steps: Omit<AdaptiveStep, "order">[]): AdaptiveStep[] {
  return steps.map((s, idx) => ({ ...s, order: idx + 1 }));
}

/**
 * Builds an adaptive playbook for a given finding.
 *
 * - If a highly similar past pattern exists (similarity > 0.7) and it was
 *   resolved before, we anchor the playbook on that resolution and bump
 *   confidence to 0.8.
 * - Otherwise we fall back to the domain template with confidence 0.4
 *   (a genuinely novel situation we haven't adapted to yet).
 *
 * Current belief posteriors are used to lightly compress timeboxes when the
 * organization's belief in the underlying risk is already elevated — i.e.
 * the agent moves faster when it is more confident something is wrong.
 */
export function buildAdaptivePlaybook(
  finding: Finding,
  pastPatterns: PatternMatch[],
  currentBeliefResult: BeliefFabricResult,
  orgHealthScore: number,
): AdaptivePlaybook {
  const template = resolveDomainTemplate(finding.domain);
  const urgency = computeUrgency(finding, currentBeliefResult);

  const bestPattern = pastPatterns[0];
  const usePastPattern = Boolean(bestPattern && bestPattern.similarity > 0.7 && bestPattern.resolvedHow);

  // Belief posterior for this domain (if present) nudges timeboxes:
  // higher posterior belief in the problem being real -> compress schedule.
  const posteriorKey = Object.keys(currentBeliefResult.posteriors ?? {}).find((k) =>
    k.toLowerCase().includes(String(finding.domain).toLowerCase()),
  );
  const posterior = posteriorKey ? currentBeliefResult.posteriors[posteriorKey] : undefined;
  const compressionFactor = posterior && posterior > 0.7 ? 0.6 : posterior && posterior > 0.5 ? 0.85 : 1;
  // Low org health means less slack across the board — compress further.
  const healthFactor = orgHealthScore < 50 ? 0.85 : 1;

  let steps = withOrder(template.steps).map((s) => ({
    ...s,
    timeboxDays: Math.max(0, Math.round(s.timeboxDays * compressionFactor * healthFactor)),
  }));

  let description = template.description;
  if (usePastPattern && bestPattern) {
    description = `${template.description} A similar issue ("${bestPattern.node.label}") was previously resolved via "${bestPattern.resolvedHow}"` +
      (bestPattern.resolutionDays != null ? ` in ~${Math.round(bestPattern.resolutionDays)} day(s).` : ".") +
      " This playbook adapts that proven path to the current situation.";
    // Anchor the first step on the known resolution strategy.
    const anchorStep: AdaptiveStep = {
      order: 0,
      title: `Re-apply known resolution: "${bestPattern.resolvedHow}"`,
      responsible: "leader",
      timeboxDays: Math.max(1, Math.round((bestPattern.resolutionDays ?? 3) * 0.5)),
      automaticallyDone: false,
      automationAction: null,
    };
    steps = [anchorStep, ...steps].map((s, idx) => ({ ...s, order: idx + 1 }));
  }

  const confidenceScore = usePastPattern ? 0.8 : 0.4;

  return {
    name: template.name,
    description,
    urgency,
    steps,
    expectedOutcome: template.expectedOutcome,
    successMetric: template.successMetric,
    failureSignal: template.failureSignal,
    basedOnPastPattern: usePastPattern ? bestPattern ?? null : null,
    confidenceScore,
  };
}

export function listDomainTemplates(): Record<Domain, DomainTemplate> {
  return DOMAIN_TEMPLATES;
}
