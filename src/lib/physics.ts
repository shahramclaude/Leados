import type { Domain, Projection } from "./types";
import { DOMAINS } from "./types";
import { DECAY, engine, run } from "./core";

/**
 * LEADOS.correlate (velocity/heatmap half) — Part 1 lineage.
 * LEADOS.orgPhysics (entropy/energy/resonance half) — Part 2 lineage.
 *
 * DISCLOSURE: `measureOrgEntropy`, `computeLeadershipEnergyBudget`, and
 * `measureResonance` below are ported with only mechanical adaptation
 * (import paths, the `Finding.conf/score` fields) from `orgPhysics.ts`,
 * which was raw-fetched in full from github.com/wbweve/Leados this
 * session and is itself labeled there as "implemented from the pasted
 * brief" — i.e. a prior session's disclosed, non-real-repo construction,
 * not the actual product's code. `domainMath` / `heatmap` / `measureVelocity`
 * are likewise adapted from that repo's `velocity.ts` (same disclosure).
 * None of this exists under these names in the real, verified repo.
 */

export interface DomainMathRow {
  key: string;
  sev: number;
  ageDays: number;
  weight: number;
  ts: string;
  title: string;
}

export interface DomainScore {
  domain: Domain;
  asOf: string;
  score: number;
  rawScore: number;
  rows: DomainMathRow[];
}

export function domainMath(domain: Domain, P: Projection, asOf: string | Date, excludeEventId?: string): DomainScore {
  const asOfIso = engine.iso(asOf);
  const rows: DomainMathRow[] = P.state.events
    .filter((e) => e.type === "signal.raised" && e.data.domain === domain)
    .filter((e) => Date.parse(e.ts) <= Date.parse(asOfIso))
    .filter((e) => e.id !== excludeEventId)
    .map((e) => {
      const ageDays = Math.max(0, engine._days(e.ts, asOfIso));
      const weight = e.data.severity * Math.pow(DECAY, ageDays);
      return { key: "signal:" + e.id, sev: e.data.severity, ageDays: Math.round(ageDays * 10) / 10, weight, ts: e.ts, title: e.data.title };
    });
  const rawScore = rows.reduce((a, r) => a + r.weight, 0);
  return { domain, asOf: asOfIso, score: Math.min(10, Math.round(rawScore * 10) / 10), rawScore, rows };
}

export function heatmap(P: Projection, asOf: string | Date): Record<Domain, DomainScore> {
  const out = {} as Record<Domain, DomainScore>;
  DOMAINS.forEach((d) => (out[d] = domainMath(d, P, asOf)));
  return out;
}

export interface Velocity {
  domain: Domain;
  perDay: number;
  projection30d: number;
}

export function measureVelocity(domain: Domain, P: Projection, today: string | Date, lookbackDays = 30): Velocity {
  const now = domainMath(domain, P, today);
  const past = domainMath(domain, P, engine.iso(new Date(Date.parse(engine.iso(today)) - lookbackDays * 86400000)));
  const perDay = (now.score - past.score) / lookbackDays;
  return { domain, perDay: Math.round(perDay * 1000) / 1000, projection30d: Math.round((now.score + perDay * 30) * 10) / 10 };
}

// ---------------------------------------------------------------------------

export interface EntropyIndicator {
  name: string;
  value: number;
  description: string;
  source: string;
}
export interface OrgEntropy {
  compositeEntropy: number;
  indicators: EntropyIndicator[];
  interpretation: string;
  label: string;
}

export function measureOrgEntropy(P: Projection, today: string | Date): OrgEntropy {
  const todayIso = engine.iso(today);
  const indicators: EntropyIndicator[] = [];

  if (P.people.length > 0) {
    const brokenPct = P.lines.broken.length / P.people.length;
    indicators.push({
      name: "Structural entropy",
      value: brokenPct,
      description: `${P.lines.broken.length} broken lines / ${P.people.length} people = ${(brokenPct * 100).toFixed(1)}%`,
      source: "reportsTo field analysis",
    });
  }

  const openGoals = P.openGoals.length;
  const ownerlessGoals = P.openGoals.filter((g) => g.ownerId == null).length;
  const silentGoals = P.openGoals.filter((g) => engine._days(g.lastProgressTs || g.ts, todayIso) > 30).length;
  if (openGoals > 0) {
    indicators.push({
      name: "Goal entropy",
      value: (ownerlessGoals + silentGoals) / openGoals,
      description: `${ownerlessGoals} ownerless + ${silentGoals} silent (30d+) of ${openGoals} open goals`,
      source: "goal.set + goal.progress events",
    });
  }

  const totalDecisions = Object.keys(P.decisionById).length;
  if (totalDecisions > 0) {
    indicators.push({
      name: "Decision entropy",
      value: P.openDecisions.length / totalDecisions,
      description: `${P.openDecisions.length} unresolved of ${totalDecisions} total decisions`,
      source: "decision.logged + decision.outcome events",
    });
  }

  const pipelineChecks = P.state.events.filter((e) => e.type === "info.pipeline.check");
  const blockedChecks = pipelineChecks.filter((e) => e.data.blocked);
  if (pipelineChecks.length > 0) {
    indicators.push({
      name: "Information entropy",
      value: blockedChecks.length / pipelineChecks.length,
      description: `${blockedChecks.length} blocked pipelines of ${pipelineChecks.length} checked`,
      source: "info.pipeline.check events",
    });
  }

  const compositeEntropy = indicators.length ? indicators.reduce((a, b) => a + b.value, 0) / indicators.length : 0;

  return {
    compositeEntropy: Math.round(compositeEntropy * 100),
    indicators,
    interpretation:
      compositeEntropy < 0.2 ? "LOW — well-organized" : compositeEntropy < 0.4 ? "MEDIUM — some disorder accumulating" : compositeEntropy < 0.6 ? "HIGH — significant organizational debt" : "CRITICAL — systemic disorder",
    label: "Composite entropy from structural, goal, decision, and information indicators. Labeled heuristic — the weights are equal and unvalidated.",
  };
}

export interface EnergyBudget {
  sourceEnergy: number;
  drainEnergy: number;
  balance: number;
  wins: number;
  activeDrains: number;
  assessment: string;
  label: string;
}

export function computeLeadershipEnergyBudget(P: Projection, today: string | Date, windowDays = 30): EnergyBudget {
  const todayIso = engine.iso(today);
  const inWindow = (ts: string) => {
    const age = engine._days(ts, todayIso);
    return age >= 0 && age <= windowDays;
  };

  const wins = P.state.events.filter((e) => inWindow(e.ts) && ["plan.closed", "goal.closed", "ops.milestone.updated", "conflict.resolved"].includes(e.type));
  const currentResult = run(P, todayIso);
  const highSevFindings = currentResult.findings.filter((f) => f.sev >= 4);
  const overdueCommits = P.state.events.filter((e) => e.type === "commitment.made" && e.data.by_date && engine._days(e.data.by_date, todayIso) > 0);

  const sourceEnergy = wins.length * 3 + P.state.events.filter((e) => e.type === "culture.signal" && e.data.polarity === "positive" && inWindow(e.ts)).length * 1;
  const drainEnergy =
    highSevFindings.length * 2 + overdueCommits.length * 1.5 + P.state.events.filter((e) => e.type === "info.pipeline.check" && e.data.blocked && inWindow(e.ts)).length * 1;

  const balance = sourceEnergy - drainEnergy;

  return {
    sourceEnergy: Math.round(sourceEnergy * 10) / 10,
    drainEnergy: Math.round(drainEnergy * 10) / 10,
    balance: Math.round(balance * 10) / 10,
    wins: wins.length,
    activeDrains: highSevFindings.length + overdueCommits.length,
    assessment: balance > 10 ? "HIGH ENERGY — you are building momentum" : balance > 0 ? "BALANCED — sustainable current state" : balance > -10 ? "DEPLETED — more drains than sources" : "CRITICALLY LOW — unsustainable without relief",
    label: "Leadership energy model. Units are arbitrary. All inputs from your event log. This is a planning metaphor, not a physiological measurement.",
  };
}

export type ResonanceDirection = "AMPLIFYING" | "FADING" | "STABLE";
export interface Resonance {
  eventType: string;
  totalCount: number;
  firstHalfFreqPerWeek: number;
  secondHalfFreqPerWeek: number;
  changeRatio: number | null;
  direction: ResonanceDirection;
  label: string;
}

export function measureResonance(eventType: string, P: Projection): Resonance | null {
  const events = P.state.events.filter((e) => e.type === eventType).map((e) => ({ ts: e.ts, day: engine._dayUTC(e.ts) })).sort((a, b) => a.day - b.day);
  if (events.length < 4) return null;
  const mid = Math.floor(events.length / 2);
  const firstHalf = events.slice(0, mid);
  const secondHalf = events.slice(mid);
  const firstSpan = Math.max(1, firstHalf[firstHalf.length - 1].day - firstHalf[0].day);
  const secondSpan = Math.max(1, secondHalf[secondHalf.length - 1].day - secondHalf[0].day);
  const firstFreq = (firstHalf.length / firstSpan) * 7;
  const secondFreq = (secondHalf.length / secondSpan) * 7;
  const changeRatio = firstFreq > 0 ? secondFreq / firstFreq : null;
  const direction: ResonanceDirection = changeRatio != null && changeRatio > 1.2 ? "AMPLIFYING" : changeRatio != null && changeRatio < 0.8 ? "FADING" : "STABLE";
  return {
    eventType,
    totalCount: events.length,
    firstHalfFreqPerWeek: Math.round(firstFreq * 10) / 10,
    secondHalfFreqPerWeek: Math.round(secondFreq * 10) / 10,
    changeRatio: changeRatio != null ? Math.round(changeRatio * 100) / 100 : null,
    direction,
    label: `Frequency trend for ${eventType}. ${events.length} events, first vs second half comparison.`,
  };
}

export const RESONANCE_WATCHLIST = ["goal.progress", "commitment.made", "culture.signal", "decision.logged", "conflict.resolved", "info.pipeline.check"];
