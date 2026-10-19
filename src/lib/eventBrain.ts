/**
 * src/lib/eventBrain.ts — THE SINGLE TRUTH LAYER.
 *
 * This module is imported by both the React/Next.js UI and every Next.js
 * API route. It is the ONLY place events are projected into state.
 * Nothing else in this codebase is allowed to fold `LeadosEvent[]` into
 * read state — rule evaluation (ruleEngine.ts) and causal detection
 * (causalInference.ts) both operate on the `BrainProjection` this module
 * produces, never on raw events directly.
 */

import type {
  LeadosEvent,
  Person,
  Goal,
  Decision,
  Commitment,
  Projection,
  BrainProjection,
  BrainFindings,
  BrainDelta,
  Finding,
  DomainKey,
  RuleState,
  RuleId,
  HypothesisState,
  KnowledgeLink,
  ReplayObserver,
  RiskProfile,
  DomainMetricState,
} from "./types";
import { DOMAIN_KEYS } from "./types";
import { ALL_RULES, evaluateAllRules } from "./ruleEngine";
import {
  computeChangePhysics,
  measureOrgEntropy,
  computeLeadershipEnergyBudget,
  measureBestResonance,
  computeCompositeHealthScore,
} from "./orgPhysics";
import { detectCascades } from "./causalInference";

export const DECAY = 0.85; // heatmap/rule-severity decay factor, applied per day since last firing
export const CORRELATION_WINDOW_DAYS = 90;
export const DECISION_MAX_OPEN_DAYS = 21;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function daysBetween(fromIso: string | Date, toIso: string | Date): number {
  const a = fromIso instanceof Date ? fromIso.getTime() : Date.parse(fromIso);
  const b = toIso instanceof Date ? toIso.getTime() : Date.parse(toIso);
  return (b - a) / 86400000;
}

const RULE_DOMAIN: Record<string, DomainKey> = Object.fromEntries(ALL_RULES.map((r) => [r.id, r.domain]));
const RULE_NAME: Record<string, string> = Object.fromEntries(ALL_RULES.map((r) => [r.id, r.name]));

// ---------------------------------------------------------------------------
// Base projection — fold the append-only log into entity read state
// ---------------------------------------------------------------------------

function foldBase(events: LeadosEvent[]): Projection {
  const peopleById: Record<string, Person> = {};
  const goalById: Record<string, Goal> = {};
  const decisionById: Record<string, Decision> = {};
  const commitmentById: Record<string, Commitment> = {};

  for (const e of events) {
    switch (e.type) {
      case "person.added": {
        peopleById[e.data.id] = {
          id: e.data.id,
          name: e.data.name,
          title: e.data.title,
          reportsTo: e.data.reportsTo ?? null,
          createdAt: e.data.createdAt ?? e.ts,
        };
        break;
      }
      case "goal.set": {
        goalById[e.data.id] = {
          id: e.data.id,
          title: e.data.title,
          domain: (e.data.domain as DomainKey) ?? "operations",
          ownerId: e.data.ownerId ?? null,
          ts: e.ts,
          lastProgressTs: null,
          closed: false,
          deadline: e.data.deadline ?? null,
        };
        break;
      }
      case "goal.progress": {
        const g = goalById[e.data.goalId];
        if (g) g.lastProgressTs = e.ts;
        break;
      }
      case "goal.closed": {
        const g = goalById[e.data.goalId];
        if (g) {
          g.closed = true;
          g.result = e.data.result;
        }
        break;
      }
      case "decision.logged": {
        decisionById[e.data.id] = {
          id: e.data.id,
          title: e.data.title,
          domain: (e.data.domain as DomainKey) ?? "operations",
          ts: e.ts,
        };
        break;
      }
      case "decision.outcome": {
        const d = decisionById[e.data.decisionId];
        if (d) {
          d.outcome = e.data.outcome;
          d.outcomeTs = e.ts;
        }
        break;
      }
      case "decision.escalate": {
        const d = decisionById[e.data.decisionId];
        if (d) d.escalated = true;
        break;
      }
      case "commitment.made": {
        commitmentById[e.data.id] = {
          id: e.data.id,
          ownerId: e.data.ownerId ?? null,
          desc: e.data.desc,
          by_date: e.data.by_date,
          ts: e.ts,
          resolved: false,
        };
        break;
      }
      case "commitment.resolved": {
        const c = commitmentById[e.data.commitmentId];
        if (c) {
          c.resolved = true;
          c.resolvedTs = e.ts;
        }
        break;
      }
      default:
        break;
    }
  }

  const people = Object.values(peopleById);
  const broken = people
    .filter((p) => p.reportsTo && !peopleById[p.reportsTo])
    .map((p) => ({ personId: p.id, reportsTo: p.reportsTo as string }));

  const goals = Object.values(goalById);
  const openGoals = goals.filter((g) => !g.closed);

  const decisions = Object.values(decisionById);
  const openDecisions = decisions.filter((d) => !d.outcome);

  const commitments = Object.values(commitmentById);
  const openCommitments = commitments.filter((c) => !c.resolved);

  return {
    events,
    people,
    peopleById,
    lines: { broken },
    goals,
    goalById,
    openGoals,
    decisions,
    decisionById,
    openDecisions,
    commitments,
    commitmentById,
    openCommitments,
  };
}

function emptyExtensions(): Pick<BrainProjection, "domainMetrics" | "orgPhysicsState" | "ruleStates" | "hypotheses" | "knowledgeLinks"> {
  return {
    domainMetrics: {} as BrainProjection["domainMetrics"],
    orgPhysicsState: {
      entropy: { compositeEntropy: 0, indicators: [], interpretation: "", label: "" },
      energyBudget: { sourceEnergy: 0, drainEnergy: 0, balance: 0, wins: 0, activeDrains: 0, assessment: "", label: "" },
      resonance: null,
      changePhysics: { mass: 0, weeksToEmbed: 0, confidence: "low", label: "", meanTenureMonths: 0, eventsPerWeek: 0 },
      compositeHealthScore: 50,
    },
    ruleStates: {},
    hypotheses: [],
    knowledgeLinks: [],
  };
}

/** Build a BrainProjection-shaped object usable by rules, without the
 * expensive extended analytics — used internally for historical sampling
 * so we never recursively call the public `project()` (would blow up
 * cost quadratically). */
function draftBrainProjection(base: Projection): BrainProjection {
  return { ...base, ...emptyExtensions() };
}

function buildRuleStates(draft: BrainProjection, referenceDate: Date, allEvents: LeadosEvent[]): Record<RuleId, RuleState> {
  const evaluations = evaluateAllRules(draft, referenceDate);
  const states: Record<RuleId, RuleState> = {};

  for (const rule of ALL_RULES) {
    const evalResult = evaluations[rule.id];
    const lastFiredAt = evalResult.firing ? referenceDate.toISOString() : findLastFiredBefore(rule.id, allEvents, referenceDate);
    const consecutiveFirings = evalResult.firing ? countConsecutiveFirings(rule.id, allEvents, referenceDate) : 0;

    states[rule.id] = {
      ruleId: rule.id,
      active: evalResult.firing,
      severity: evalResult.severity,
      confidence: evalResult.confidence,
      lastFiredAt,
      consecutiveFirings,
      scoreMath: evalResult.scoreMath,
      basis: evalResult.basis,
    };
  }
  return states;
}

/** Best-effort "when did this rule last fire" lookback, bounded to 30 days, used only
 * when the rule isn't firing right now (so Today/Intelligence views can still show recency). */
function findLastFiredBefore(ruleId: RuleId, events: LeadosEvent[], referenceDate: Date): string | null {
  const rule = ALL_RULES.find((r) => r.id === ruleId);
  if (!rule) return null;
  for (let d = 1; d <= 30; d++) {
    const pastDate = new Date(referenceDate.getTime() - d * 86400000);
    const sliced = events.filter((e) => Date.parse(e.ts) <= pastDate.getTime());
    const draft = draftBrainProjection(foldBase(sliced));
    try {
      if (rule.evaluate(draft, pastDate).firing) return pastDate.toISOString();
    } catch {
      // ignore — a throwing rule just means "unknown", not "fired"
    }
  }
  return null;
}

/** Counts how many consecutive days (bounded to 14) up to and including
 * `referenceDate` this rule has been firing. Only invoked for rules
 * currently firing, to keep cost bounded. */
function countConsecutiveFirings(ruleId: RuleId, events: LeadosEvent[], referenceDate: Date): number {
  const rule = ALL_RULES.find((r) => r.id === ruleId);
  if (!rule) return 1;
  let count = 1;
  for (let d = 1; d <= 14; d++) {
    const pastDate = new Date(referenceDate.getTime() - d * 86400000);
    const sliced = events.filter((e) => Date.parse(e.ts) <= pastDate.getTime());
    const draft = draftBrainProjection(foldBase(sliced));
    try {
      if (rule.evaluate(draft, pastDate).firing) {
        count++;
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Domain metrics
// ---------------------------------------------------------------------------

const DOMAIN_EVENT_PREFIXES: Record<DomainKey, string[]> = {
  finance: ["finance."],
  people: ["person.", "people."],
  strategy: ["decision.", "goal.", "strategy."],
  operations: ["ops.", "info.pipeline"],
  rd: ["rd."],
  compliance: ["compliance."],
  manufacturing: ["manufacturing."],
  customerSuccess: ["cs."],
};

function domainScore(domain: DomainKey, ruleStates: Record<RuleId, RuleState>, referenceDate: Date): number {
  const rulesInDomain = ALL_RULES.filter((r) => r.domain === domain).map((r) => r.id);
  // DESIGN PARAMETER: each firing rule deducts (severity / 2) * confidence
  // points, decayed per day since it last fired. Halving severity keeps a
  // single sev-5 rule from alone flattening a domain to 0, while several
  // concurrent firings still meaningfully degrade the score.
  let penalty = 0;
  for (const id of rulesInDomain) {
    const s = ruleStates[id];
    if (!s || !s.active) continue;
    const daysSince = s.lastFiredAt ? Math.max(0, daysBetween(s.lastFiredAt, referenceDate)) : 0;
    penalty += (s.severity / 2) * s.confidence * Math.pow(DECAY, daysSince);
  }
  return Math.max(0, Math.min(10, Math.round((10 - penalty) * 10) / 10));
}

function computeDomainMetrics(events: LeadosEvent[], now: Date): Record<DomainKey, DomainMetricState> {
  const sampleOffsets = [90, 60, 30, 14, 0];
  const samples: { offset: number; date: Date; ruleStates: Record<RuleId, RuleState> }[] = sampleOffsets.map((offset) => {
    const date = new Date(now.getTime() - offset * 86400000);
    const sliced = events.filter((e) => Date.parse(e.ts) <= date.getTime());
    const draft = draftBrainProjection(foldBase(sliced));
    const evaluations = evaluateAllRules(draft, date);
    const ruleStates: Record<RuleId, RuleState> = {};
    for (const rule of ALL_RULES) {
      const ev = evaluations[rule.id];
      ruleStates[rule.id] = {
        ruleId: rule.id,
        active: ev.firing,
        severity: ev.severity,
        confidence: ev.confidence,
        lastFiredAt: ev.firing ? date.toISOString() : null,
        consecutiveFirings: ev.firing ? 1 : 0,
        scoreMath: ev.scoreMath,
        basis: ev.basis,
      };
    }
    return { offset, date, ruleStates };
  });

  const out = {} as Record<DomainKey, DomainMetricState>;
  for (const domain of DOMAIN_KEYS) {
    out[domain] = buildOneDomainMetric(domain, samples, events, now);
  }
  return out;
}

function buildOneDomainMetric(
  domain: DomainKey,
  samples: { offset: number; date: Date; ruleStates: Record<RuleId, RuleState> }[],
  events: LeadosEvent[],
  now: Date
): DomainMetricState {
  const historicalScores = samples
    .slice()
    .reverse()
    .map((s) => ({ date: s.date.toISOString().slice(0, 10), score: domainScore(domain, s.ruleStates, s.date) }));

  const currentSample = samples.find((s) => s.offset === 0)!;
  const past14Sample = samples.find((s) => s.offset === 14)!;
  const currentScore = domainScore(domain, currentSample.ruleStates, currentSample.date);
  const past14Score = domainScore(domain, past14Sample.ruleStates, past14Sample.date);
  const velocity = Math.round(((currentScore - past14Score) / 14) * 1000) / 1000;

  const direction: "improving" | "degrading" | "stable" = velocity > 0.02 ? "improving" : velocity < -0.02 ? "degrading" : "stable";

  const prefixes = DOMAIN_EVENT_PREFIXES[domain];
  const eventCount = events.filter((e) => daysBetween(e.ts, now) <= 90 && daysBetween(e.ts, now) >= 0 && prefixes.some((p) => e.type.startsWith(p))).length;
  const confidenceLevel: "high" | "medium" | "low" = eventCount >= 20 ? "high" : eventCount >= 5 ? "medium" : "low";

  return {
    key: domain,
    currentScore,
    velocity,
    direction,
    projectedIn14d: Math.max(0, Math.min(10, Math.round((currentScore + velocity * 14) * 10) / 10)),
    projectedIn30d: Math.max(0, Math.min(10, Math.round((currentScore + velocity * 30) * 10) / 10)),
    historicalScores,
    confidenceLevel,
    eventCount,
  };
}

// ---------------------------------------------------------------------------
// Hypotheses & knowledge links
// ---------------------------------------------------------------------------

function generateHypotheses(ruleStates: Record<RuleId, RuleState>, now: Date): HypothesisState[] {
  const out: HypothesisState[] = [];
  for (const rule of ALL_RULES) {
    const s = ruleStates[rule.id];
    if (!s.active || s.confidence < 0.5) continue;
    const resolveBy = new Date(now.getTime() + 14 * 86400000);
    out.push({
      id: `hyp:${rule.id}:${now.toISOString().slice(0, 10)}`,
      ruleId: rule.id,
      domain: rule.domain,
      claim: `If unaddressed, "${rule.name}" will still be active in 14 days: ${s.basis}`,
      predictedAt: now.toISOString(),
      resolveBy: resolveBy.toISOString(),
      status: "open",
      evidence: [],
    });
  }
  return out;
}

function buildKnowledgeLinks(ruleStates: Record<RuleId, RuleState>, now: Date): KnowledgeLink[] {
  const cascades = detectCascades(ruleStates, now);
  return cascades.map((c) => ({
    fromType: "finding" as const,
    fromId: `finding:${c.fromFiring.ruleId}`,
    toType: "finding" as const,
    toId: `finding:${c.toFiring.ruleId}`,
    relation: "caused" as const,
    confidence: c.confidence,
    createdAt: now.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Public API: project()
// ---------------------------------------------------------------------------

/**
 * project() folds the full event log into read state. Accepts an
 * optional `now` (defaults to wall-clock) purely so time-dependent rule
 * evaluation and domain-velocity sampling have a reference point;
 * callers that only pass `events` get the same behavior as a strict
 * `project(events: LeadosEvent[]): BrainProjection` signature.
 */
export function project(events: LeadosEvent[], now: Date = new Date()): BrainProjection {
  const base = foldBase(events);
  const draft = draftBrainProjection(base);
  const ruleStates = buildRuleStates(draft, now, events);
  const domainMetrics = computeDomainMetrics(events, now);

  const highSevRuleCount = Object.values(ruleStates).filter((r) => r.active && r.severity >= 4).length;
  const topActiveWeight = Object.values(ruleStates)
    .filter((r) => r.active)
    .map((r) => (r.severity / 2) * r.confidence)
    .sort((a, b) => b - a)
    .slice(0, 8) // cap influence to the 8 worst active rules, not all 48
    .reduce((a, b) => a + b, 0);

  const entropy = measureOrgEntropy({ ...base, ...emptyExtensions(), ruleStates }, now);
  const energyBudget = computeLeadershipEnergyBudget({ ...base, ...emptyExtensions(), ruleStates }, now, highSevRuleCount);
  const resonance = measureBestResonance({ ...base, ...emptyExtensions(), ruleStates });
  const changePhysics = computeChangePhysics({ ...base, ...emptyExtensions(), ruleStates }, now);
  const compositeHealthScore = computeCompositeHealthScore(entropy, energyBudget, topActiveWeight);

  const hypotheses = generateHypotheses(ruleStates, now);
  const knowledgeLinks = buildKnowledgeLinks(ruleStates, now);

  return {
    ...base,
    domainMetrics,
    orgPhysicsState: { entropy, energyBudget, resonance, changePhysics, compositeHealthScore },
    ruleStates,
    hypotheses,
    knowledgeLinks,
  };
}

// ---------------------------------------------------------------------------
// Public API: run()
// ---------------------------------------------------------------------------

function findingFromRule(ruleId: RuleId, P: BrainProjection, now: Date): Finding | null {
  const rule = ALL_RULES.find((r) => r.id === ruleId);
  if (!rule) return null;
  const evalResult = rule.evaluate(P, now);
  if (!evalResult.firing) return null;
  return {
    key: `finding:${ruleId}`,
    domain: rule.domain,
    sev: evalResult.severity,
    ts: P.ruleStates[ruleId]?.lastFiredAt ?? now.toISOString(),
    title: `${RULE_NAME[ruleId] ?? ruleId}: ${evalResult.basis}`,
    rule: ruleId,
    confidence: evalResult.confidence,
    basis: evalResult.basis,
    scoreMath: evalResult.scoreMath,
    evidenceEvents: evalResult.evidenceEvents,
    suggestedPlaybook: evalResult.suggestedPlaybook,
  };
}

/**
 * run() derives findings from a projection at a point in time. It
 * re-evaluates the 48 rules against P (cheap relative to project()'s
 * historical sampling) so every Finding carries full evidence/playbook
 * detail that the trimmed RuleState summary in P.ruleStates does not.
 * Cross-domain cascades (causalInference.ts) amplify a finding's
 * effective severity via `amplificationFactor`.
 */
export function run(P: BrainProjection, now: Date): BrainFindings {
  const findings: Finding[] = [];
  for (const rule of ALL_RULES) {
    const f = findingFromRule(rule.id, P, now);
    if (f) findings.push(f);
  }

  const cascades = detectCascades(P.ruleStates, now);
  const amplificationByRule = new Map(cascades.map((c) => [c.toFiring.ruleId, c.amplificationFactor]));
  for (const f of findings) {
    const amp = amplificationByRule.get(f.rule);
    if (amp) f.amplificationFactor = amp;
  }

  findings.sort((a, b) => {
    const aEff = a.sev * (a.amplificationFactor ?? 1);
    const bEff = b.sev * (b.amplificationFactor ?? 1);
    return bEff - aEff || Date.parse(b.ts) - Date.parse(a.ts);
  });

  const orgHealthScore = P.orgPhysicsState.compositeHealthScore;

  const domainSevTotals = new Map<DomainKey, number>();
  for (const f of findings) {
    domainSevTotals.set(f.domain, (domainSevTotals.get(f.domain) ?? 0) + f.sev * (f.amplificationFactor ?? 1));
  }
  let dominantDomain: DomainKey = "operations";
  let maxSev = -1;
  for (const d of DOMAIN_KEYS) {
    const v = domainSevTotals.get(d) ?? 0;
    if (v > maxSev) {
      maxSev = v;
      dominantDomain = d;
    }
  }

  const riskProfile: RiskProfile =
    orgHealthScore >= 80 ? "green" : orgHealthScore >= 60 ? "yellow" : orgHealthScore >= 40 ? "amber" : orgHealthScore >= 20 ? "red" : "critical";

  const physicsSummary = `${P.orgPhysicsState.entropy.interpretation}; leadership energy ${P.orgPhysicsState.energyBudget.assessment.toLowerCase()}.`;

  const uncertaintyCount = findings.filter((f) => f.confidence < 0.5).length;

  const novelFindings = findings.filter((f) => daysBetween(f.ts, now) <= 2);

  return { findings, orgHealthScore, dominantDomain, riskProfile, physicsSummary, uncertaintyCount, novelFindings };
}

// ---------------------------------------------------------------------------
// Public API: projectAt()
// ---------------------------------------------------------------------------

export function projectAt(events: LeadosEvent[], atDate: Date): BrainProjection {
  const sliced = events.filter((e) => Date.parse(e.ts) <= atDate.getTime());
  return project(sliced, atDate);
}

// ---------------------------------------------------------------------------
// Public API: delta()
// ---------------------------------------------------------------------------

export function delta(before: BrainProjection, after: BrainProjection, now: Date = new Date()): BrainDelta {
  const beforeFindings = run(before, now).findings;
  const afterFindings = run(after, now).findings;

  const beforeKeys = new Set(beforeFindings.map((f) => f.key));
  const afterKeys = new Set(afterFindings.map((f) => f.key));

  const newFindings = afterFindings.filter((f) => !beforeKeys.has(f.key));
  const resolvedFindings = beforeFindings.filter((f) => !afterKeys.has(f.key));

  const scoreChanges = DOMAIN_KEYS.map((domain) => ({
    domain,
    before: before.domainMetrics[domain]?.currentScore ?? 0,
    after: after.domainMetrics[domain]?.currentScore ?? 0,
  })).filter((c) => c.before !== c.after);

  const orgHealthDelta = after.orgPhysicsState.compositeHealthScore - before.orgPhysicsState.compositeHealthScore;

  return { newFindings, resolvedFindings, scoreChanges, orgHealthDelta };
}

// ---------------------------------------------------------------------------
// Public API: replay()
// ---------------------------------------------------------------------------

export function replay(events: LeadosEvent[], observer: ReplayObserver): void {
  const sorted = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  for (let i = 0; i < sorted.length; i++) {
    const slice = sorted.slice(0, i + 1);
    const atDate = new Date(Date.parse(sorted[i].ts));
    const P = project(slice, atDate);
    observer.onEvent?.(sorted[i], i, P);
  }
  const finalDate = sorted.length ? new Date(Date.parse(sorted[sorted.length - 1].ts)) : new Date();
  observer.onComplete?.(project(sorted, finalDate));
}

// ---------------------------------------------------------------------------
// EventBrain object — matches the task's `interface EventBrain` shape
// ---------------------------------------------------------------------------

export const eventBrain = { project, run, projectAt, delta, replay };
export type { BrainProjection, BrainFindings, BrainDelta, ReplayObserver } from "./types";
