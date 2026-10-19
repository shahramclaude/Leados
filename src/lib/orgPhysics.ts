/**
 * src/lib/orgPhysics.ts — the "5 laws of organizational physics" adapted
 * to operate on BrainProjection instead of the old ad-hoc `P` shape.
 *
 * PROVENANCE: adapted in intent from the root-level `orgPhysics.ts` found
 * in the real repo (which itself discloses "confidence: low" on every
 * function and states this namespace is original, not ported from any
 * verified upstream source). All four laws implemented here keep that
 * same disclosure. Every numeric weight below is a labeled heuristic, not
 * a validated model — see each `label` string.
 */

import type {
  BrainProjection,
  ChangePhysics,
  OrgEntropy,
  EntropyIndicator,
  LeadershipEnergy,
  ResonanceState,
  ResonanceDirection,
} from "./types";

function daysBetween(fromIso: string | Date, toIso: string | Date): number {
  const a = fromIso instanceof Date ? fromIso.getTime() : Date.parse(fromIso);
  const b = toIso instanceof Date ? toIso.getTime() : Date.parse(toIso);
  return (b - a) / 86400000;
}

function dayUTC(iso: string): number {
  return Math.floor(Date.parse(iso) / 86400000);
}

// ---------------------------------------------------------------------------
// Law 1 — Organizational Inertia
// ---------------------------------------------------------------------------

export function computeChangePhysics(P: BrainProjection, now: Date): ChangePhysics {
  const nowIso = now.toISOString();
  const affectedPersonIds = P.people.map((p) => p.id);

  const tenures = affectedPersonIds.map((id) => {
    const person = P.peopleById[id];
    if (!person || !person.createdAt) return 0;
    return daysBetween(person.createdAt, nowIso);
  });
  const meanTenure = tenures.length ? tenures.reduce((a, b) => a + b, 0) / tenures.length : 0;

  const affectedProcesses = P.openGoals.length; // proxy: open goals ~ active processes being changed
  const mass =
    (affectedPersonIds.length * meanTenure) / 30 +
    affectedProcesses * 4 +
    affectedPersonIds.length * 2;

  const recentEventCount = P.events.filter((e) => {
    const age = daysBetween(e.ts, nowIso);
    return age >= 0 && age <= 30;
  }).length;
  const eventsPerWeek = recentEventCount / 4.3;

  const weeksToEmbed = eventsPerWeek > 0 ? Math.ceil(mass / (eventsPerWeek * 0.3)) : Infinity;

  return {
    mass: Math.round(mass * 10) / 10,
    weeksToEmbed,
    confidence: "low",
    meanTenureMonths: Math.round((meanTenure / 30) * 10) / 10,
    eventsPerWeek: Math.round(eventsPerWeek * 10) / 10,
    label:
      "Organizational inertia estimate from tenure and open-goal (process) data. " +
      "This is a planning heuristic, not a prediction. Actual change speed depends " +
      "on factors not present in the event log.",
  };
}

// ---------------------------------------------------------------------------
// Law 2 — Organizational Entropy
// ---------------------------------------------------------------------------

export function measureOrgEntropy(P: BrainProjection, now: Date): OrgEntropy {
  const nowIso = now.toISOString();
  const indicators: EntropyIndicator[] = [];

  if (P.people.length > 0) {
    const brokenPct = P.lines.broken.length / P.people.length;
    indicators.push({
      name: "Structural entropy",
      value: brokenPct,
      description: `${P.lines.broken.length} broken reporting lines / ${P.people.length} people = ${(brokenPct * 100).toFixed(1)}%`,
      source: "reportsTo field analysis (person.added events)",
    });
  }

  const openGoals = P.openGoals.length;
  const ownerlessGoals = P.openGoals.filter((g) => g.ownerId == null).length;
  const silentGoals = P.openGoals.filter((g) => daysBetween(g.lastProgressTs || g.ts, nowIso) > 30).length;
  if (openGoals > 0) {
    indicators.push({
      name: "Goal entropy",
      value: (ownerlessGoals + silentGoals) / openGoals,
      description: `${ownerlessGoals} ownerless + ${silentGoals} silent (30d+) of ${openGoals} open goals`,
      source: "goal.set + goal.progress events",
    });
  }

  const openDecisions = P.openDecisions.length;
  const totalDecisions = Object.keys(P.decisionById).length;
  if (totalDecisions > 0) {
    indicators.push({
      name: "Decision entropy",
      value: openDecisions / totalDecisions,
      description: `${openDecisions} unresolved of ${totalDecisions} total decisions`,
      source: "decision.logged + decision.outcome events",
    });
  }

  const pipelineChecks = P.events.filter((e) => e.type === "info.pipeline.check");
  const blockedChecks = pipelineChecks.filter((e) => e.data.blocked);
  if (pipelineChecks.length > 0) {
    indicators.push({
      name: "Information entropy",
      value: blockedChecks.length / pipelineChecks.length,
      description: `${blockedChecks.length} blocked pipelines of ${pipelineChecks.length} checked`,
      source: "info.pipeline.check events",
    });
  }

  // Rule-firing entropy: share of wired rules currently active, across all 8 domains.
  const ruleStates = Object.values(P.ruleStates);
  if (ruleStates.length > 0) {
    const activeShare = ruleStates.filter((r) => r.active).length / ruleStates.length;
    indicators.push({
      name: "Signal entropy",
      value: activeShare,
      description: `${ruleStates.filter((r) => r.active).length} of ${ruleStates.length} rules currently firing`,
      source: "ruleEngine evaluation",
    });
  }

  const compositeEntropy = indicators.length ? indicators.reduce((a, b) => a + b.value, 0) / indicators.length : 0;

  return {
    compositeEntropy: Math.round(compositeEntropy * 100),
    indicators,
    interpretation:
      compositeEntropy < 0.2
        ? "LOW — well-organized"
        : compositeEntropy < 0.4
        ? "MEDIUM — some disorder accumulating"
        : compositeEntropy < 0.6
        ? "HIGH — significant organizational debt"
        : "CRITICAL — systemic disorder",
    label:
      "Composite entropy from structural, goal, decision, information, and signal " +
      "indicators. Labeled heuristic — weights are equal and unvalidated.",
  };
}

// ---------------------------------------------------------------------------
// Law 3 — Energy Conservation
// ---------------------------------------------------------------------------

export function computeLeadershipEnergyBudget(
  P: BrainProjection,
  now: Date,
  highSevRuleCount: number,
  windowDays = 30
): LeadershipEnergy {
  const nowIso = now.toISOString();
  const inWindow = (ts: string) => {
    const age = daysBetween(ts, nowIso);
    return age >= 0 && age <= windowDays;
  };

  const wins = P.events.filter(
    (e) => inWindow(e.ts) && ["goal.closed", "decision.outcome", "commitment.resolved", "culture.signal"].includes(e.type) &&
      !(e.type === "culture.signal" && e.data?.polarity !== "positive")
  );

  const overdueCommits = P.openCommitments.filter((c) => daysBetween(c.by_date, nowIso) > 0);

  const sourceEnergy =
    wins.length * 3 +
    P.events.filter((e) => e.type === "culture.signal" && e.data?.polarity === "positive" && inWindow(e.ts)).length * 1;

  const drainEnergy =
    highSevRuleCount * 2 +
    overdueCommits.length * 1.5 +
    P.events.filter((e) => e.type === "info.pipeline.check" && e.data?.blocked && inWindow(e.ts)).length * 1;

  const balance = sourceEnergy - drainEnergy;

  return {
    sourceEnergy: Math.round(sourceEnergy * 10) / 10,
    drainEnergy: Math.round(drainEnergy * 10) / 10,
    balance: Math.round(balance * 10) / 10,
    wins: wins.length,
    activeDrains: highSevRuleCount + overdueCommits.length,
    assessment:
      balance > 10
        ? "HIGH ENERGY — building momentum"
        : balance > 0
        ? "BALANCED — sustainable current state"
        : balance > -10
        ? "DEPLETED — more drains than sources"
        : "CRITICALLY LOW — unsustainable without relief",
    label:
      "Leadership energy model. Units are arbitrary, all inputs from the event log. " +
      "This is a planning metaphor, not a physiological measurement.",
  };
}

// ---------------------------------------------------------------------------
// Law 4 — Resonance
// ---------------------------------------------------------------------------

export const RESONANCE_WATCHLIST = [
  "goal.progress",
  "commitment.made",
  "decision.logged",
  "people.oneonone.logged",
  "info.pipeline.check",
  "ops.incident.logged",
];

export function measureResonance(eventType: string, P: BrainProjection): ResonanceState | null {
  const events = P.events
    .filter((e) => e.type === eventType)
    .map((e) => ({ ts: e.ts, day: dayUTC(e.ts) }))
    .sort((a, b) => a.day - b.day);

  if (events.length < 6) return null;

  const mid = Math.floor(events.length / 2);
  const firstHalf = events.slice(0, mid);
  const secondHalf = events.slice(mid);

  const firstSpan = Math.max(1, firstHalf[firstHalf.length - 1].day - firstHalf[0].day);
  const secondSpan = Math.max(1, secondHalf[secondHalf.length - 1].day - secondHalf[0].day);

  const firstFreq = (firstHalf.length / firstSpan) * 7;
  const secondFreq = (secondHalf.length / secondSpan) * 7;

  const changeRatio = firstFreq > 0 ? secondFreq / firstFreq : null;
  const direction: ResonanceDirection =
    changeRatio != null && changeRatio > 1.2 ? "AMPLIFYING" : changeRatio != null && changeRatio < 0.8 ? "FADING" : "STABLE";

  return {
    eventType,
    totalCount: events.length,
    firstHalfFreqPerWeek: Math.round(firstFreq * 10) / 10,
    secondHalfFreqPerWeek: Math.round(secondFreq * 10) / 10,
    changeRatio: changeRatio != null ? Math.round(changeRatio * 100) / 100 : null,
    direction,
    label: `Frequency trend for ${eventType}: ${events.length} events, first vs second half comparison.`,
  };
}

/** Picks the strongest-signal watchlist resonance (most events) so the brain always has one to show. */
export function measureBestResonance(P: BrainProjection): ResonanceState | null {
  let best: ResonanceState | null = null;
  for (const t of RESONANCE_WATCHLIST) {
    const r = measureResonance(t, P);
    if (r && (!best || r.totalCount > best.totalCount)) best = r;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Composite health score — this module's own weighted combination
// ---------------------------------------------------------------------------

export function computeCompositeHealthScore(entropy: OrgEntropy, energy: LeadershipEnergy, weightedActiveRuleCount: number): number {
  // DESIGN PARAMETER: weights below are not calibrated from data.
  const entropyScore = Math.max(0, 100 - entropy.compositeEntropy); // lower entropy -> higher score
  const energyScore = Math.max(0, Math.min(100, 50 + energy.balance * 2));
  // weightedActiveRuleCount = sum of (severity/2 * confidence) across all
  // currently-active rules (comparable in scale to a handful of findings,
  // not all 48 at once), so a handful of serious findings meaningfully
  // moves this without an active-rich seed dataset flattening it to zero.
  const findingsScore = Math.max(0, 100 - weightedActiveRuleCount * 3);
  const composite = entropyScore * 0.4 + energyScore * 0.3 + findingsScore * 0.3;
  return Math.round(Math.max(0, Math.min(100, composite)));
}
