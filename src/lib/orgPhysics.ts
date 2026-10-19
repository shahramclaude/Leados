import type { Projection } from "./types";
import { engine, run } from "./engine";

/**
 * src/lib/orgPhysics.ts — four heuristic "laws" turning the event log into
 * planning signal. Every exported function labels its own output with a
 * `confidence` field and/or an honest `label`/`interpretation` string. The
 * UI must show these verbatim, not paraphrase them — that's the contract
 * this module makes with anything that renders it.
 *
 * Exports (verified against this file):
 *   computeChangePhysics()            → ChangePhysics            confidence: "low"
 *   measureOrgEntropy()               → OrgEntropy                (no numeric confidence field; honest caveat lives in `label`)
 *   computeLeadershipEnergyBudget()   → EnergyBudget               (no numeric confidence field; honest caveat lives in `label`)
 *   measureResonance()                → Resonance | null           (no numeric confidence field; honest caveat lives in `label`)
 *   RESONANCE_WATCHLIST               → string[] constant
 *   computeResonancePairs()           → ResonancePair[]           FALLBACK — not one of the 4 laws above; added because the
 *                                                                  brief asks for co-occurring *pairs* and measureResonance()
 *                                                                  only tracks a single event type's own frequency trend.
 *                                                                  Explicitly labeled confidence: "low" and disclosed as such
 *                                                                  everywhere it is rendered.
 */

// ---------------------------------------------------------------------------
// Law 1 — Organizational Inertia
// ---------------------------------------------------------------------------

export interface ChangePhysics {
  mass: number;
  weeksToEmbed: number;
  confidence: "low";
  label: string;
  meanTenureMonths: number;
  eventsPerWeek: number;
}

export function computeChangePhysics(
  _changeDescription: string,
  affectedPersonIds: string[],
  affectedProcesses: string[],
  P: Projection,
  today: string | Date
): ChangePhysics {
  const todayIso = engine.iso(today);

  const tenures = affectedPersonIds.map((pid) => {
    const person = P.peopleById[pid];
    if (!person || !person.createdAt) return 0;
    return engine._days(person.createdAt, todayIso);
  });

  const meanTenure = tenures.length ? tenures.reduce((a, b) => a + b, 0) / tenures.length : 0;

  const mass =
    (affectedPersonIds.length * meanTenure) / 30 + // person-months
    affectedProcesses.length * 4 + // processes assumed 4 months old
    affectedPersonIds.length * 2; // habit disruption proxy

  const recentEventCount = P.state.events.filter((e) => engine._days(e.ts, todayIso) <= 30 && engine._days(e.ts, todayIso) >= 0).length;
  const eventsPerWeek = recentEventCount / 4.3;

  const weeksToEmbed = eventsPerWeek > 0 ? Math.ceil(mass / (eventsPerWeek * 0.3)) : Infinity;

  return {
    mass: Math.round(mass * 10) / 10,
    weeksToEmbed,
    confidence: "low",
    meanTenureMonths: Math.round((meanTenure / 30) * 10) / 10,
    eventsPerWeek: Math.round(eventsPerWeek * 10) / 10,
    label:
      "Organizational inertia estimate from tenure and process data. " +
      "This is a planning heuristic, not a prediction. " +
      "Actual change speed depends on factors not in the event log.",
  };
}

// ---------------------------------------------------------------------------
// Law 2 — Organizational Entropy
// ---------------------------------------------------------------------------

export interface EntropyIndicator {
  name: string;
  value: number;
  description: string;
  source: string;
}

export interface OrgEntropy {
  compositeEntropy: number; // 0..100
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
  const silentGoals = P.openGoals.filter((g) => {
    const ref = g.lastProgressTs || g.ts;
    return engine._days(ref, todayIso) > 30;
  }).length;
  if (openGoals > 0) {
    indicators.push({
      name: "Goal entropy",
      value: (ownerlessGoals + silentGoals) / openGoals,
      description: `${ownerlessGoals} ownerless + ${silentGoals} silent (30d+ no progress) of ${openGoals} open goals`,
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
      compositeEntropy < 0.2
        ? "LOW — well-organized"
        : compositeEntropy < 0.4
        ? "MEDIUM — some disorder accumulating"
        : compositeEntropy < 0.6
        ? "HIGH — significant organizational debt"
        : "CRITICAL — systemic disorder",
    label:
      "Composite entropy from structural, goal, decision, and information indicators. " +
      "Labeled heuristic — the weights are equal and unvalidated.",
  };
}

// ---------------------------------------------------------------------------
// Law 3 — Energy Conservation
// ---------------------------------------------------------------------------

export interface EnergyBudget {
  sourceEnergy: number;
  drainEnergy: number;
  balance: number;
  score: number; // 0-100, normalized for the fuel-gauge UI
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

  const wins = P.state.events.filter(
    (e) => inWindow(e.ts) && ["plan.closed", "goal.closed", "ops.milestone.updated", "conflict.resolved"].includes(e.type)
  );

  const currentResult = run(P, todayIso);
  const highSevFindings = currentResult.findings.filter((f) => f.sev >= 4);

  const overdueCommits = P.state.events.filter((e) => {
    if (e.type !== "commitment.made") return false;
    const byDate = e.data.by_date;
    if (!byDate) return false;
    return engine._days(byDate, todayIso) > 0;
  });

  const sourceEnergy =
    wins.length * 3 +
    P.state.events.filter((e) => e.type === "culture.signal" && e.data.polarity === "positive" && inWindow(e.ts)).length * 1;

  const drainEnergy =
    highSevFindings.length * 2 +
    overdueCommits.length * 1.5 +
    P.state.events.filter((e) => e.type === "info.pipeline.check" && e.data.blocked && inWindow(e.ts)).length * 1;

  const balance = sourceEnergy - drainEnergy;
  // Normalize balance (-20..+20 is a reasonable observed range for this model) to a 0-100 gauge score.
  const score = Math.max(0, Math.min(100, Math.round(((balance + 20) / 40) * 100)));

  return {
    sourceEnergy: Math.round(sourceEnergy * 10) / 10,
    drainEnergy: Math.round(drainEnergy * 10) / 10,
    balance: Math.round(balance * 10) / 10,
    score,
    wins: wins.length,
    activeDrains: highSevFindings.length + overdueCommits.length,
    assessment:
      balance > 10
        ? "HIGH ENERGY — you are building momentum"
        : balance > 0
        ? "BALANCED — sustainable current state"
        : balance > -10
        ? "DEPLETED — more drains than sources"
        : "CRITICALLY LOW — unsustainable without relief",
    label:
      "Leadership energy model. Units are arbitrary. All inputs from your event log. " +
      "This is a planning metaphor, not a physiological measurement.",
  };
}

// ---------------------------------------------------------------------------
// Law 4 — Resonance
// ---------------------------------------------------------------------------

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
  const events = P.state.events
    .filter((e) => e.type === eventType)
    .map((e) => ({ ts: e.ts, day: engine._dayUTC(e.ts) }))
    .sort((a, b) => a.day - b.day);

  if (events.length < 6) return null; // insufficient data

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
    label: `Frequency trend for ${eventType}. ${events.length} events, first vs second half comparison.`,
  };
}

/** Curated list of event types worth watching on the Resonance Dashboard. Disclosed hand-pick, not an exhaustive scan of every type in the registry. */
export const RESONANCE_WATCHLIST = [
  "goal.progress",
  "commitment.made",
  "culture.signal",
  "decision.logged",
  "conflict.resolved",
  "info.pipeline.check",
];

// ---------------------------------------------------------------------------
// FALLBACK — pairwise resonance (co-occurring signals)
// Not part of the 4 laws above. measureResonance() only tracks a single
// event type's own frequency trend over time; it has no notion of "pairs".
// This helper is a disclosed addition to satisfy the co-occurrence view —
// it counts how often two event types both fire within the same 7-day
// window, across the whole log.
// ---------------------------------------------------------------------------

export interface ResonancePair {
  eventTypeA: string;
  eventTypeB: string;
  coactivations: number;
  bothActiveNow: boolean; // both fired within the last 7 days as of `today`
  strength: number; // 0..1, coactivations normalized against the smaller series' count
  confidence: "low";
  label: string;
}

export function computeResonancePairs(P: Projection, today: string | Date, watchlist: string[] = RESONANCE_WATCHLIST): ResonancePair[] {
  const todayIso = engine.iso(today);
  const byType: Record<string, number[]> = {};
  watchlist.forEach((t) => {
    byType[t] = P.state.events.filter((e) => e.type === t).map((e) => engine._dayUTC(e.ts));
  });

  const pairs: ResonancePair[] = [];
  for (let i = 0; i < watchlist.length; i++) {
    for (let j = i + 1; j < watchlist.length; j++) {
      const a = watchlist[i];
      const b = watchlist[j];
      const daysA = byType[a];
      const daysB = byType[b];
      if (!daysA.length || !daysB.length) continue;

      let coactivations = 0;
      daysA.forEach((da) => {
        if (daysB.some((db) => Math.abs(da - db) <= 3)) coactivations += 1;
      });

      const denom = Math.min(daysA.length, daysB.length);
      const strength = denom > 0 ? Math.min(1, coactivations / denom) : 0;

      const nowDay = Math.floor(Date.parse(todayIso) / 86400000);
      const activeNow = (days: number[]) => days.some((d) => nowDay - d <= 7 && nowDay - d >= 0);

      if (coactivations >= 2) {
        pairs.push({
          eventTypeA: a,
          eventTypeB: b,
          coactivations,
          bothActiveNow: activeNow(daysA) && activeNow(daysB),
          strength: Math.round(strength * 100) / 100,
          confidence: "low",
          label: "FALLBACK metric — co-occurrence within a ±3-day window, not a validated causal pairing. Treat as a coordination prompt, not proof.",
        });
      }
    }
  }
  return pairs.sort((x, y) => y.strength - x.strength);
}
