// src/lib/signalFusion.ts
//
// BOOTSTRAP NOTE: no prior signalFusion.ts existed in the repository (see
// Part-1 read step). `scoreEvent`/`fuseSignals` below are an original-
// derivation half-life-weighted domain fusion baseline. The task-mandated
// `computeObservableLikelihoods` is implemented per the exact mapping rules
// given in the task description; each rule below is annotated with the
// literal instruction it implements. Any ambiguity in the literal spec is
// called out as INTERPRETATION with the choice made.

import type {
  LeadosEvent,
  LeadosMetrics,
  LeadosPerson,
  ObservableNodeId,
} from "./types";
import { clamp, clamp01, daysBetween, mean, recencyWeight } from "./temporal";
import { countOfTypeInWindow, eventsOfType, eventsOfTypeInWindow } from "./eventUtils";

// ─────────────────────────────────────────────────────────────────────────
// Original baseline: half-life weighted domain fusion
// ─────────────────────────────────────────────────────────────────────────

export type SignalDomain = "people" | "execution" | "finance" | "strategy";

const DOMAIN_BY_PREFIX: Record<string, SignalDomain> = {
  people: "people",
  decision: "execution",
  ops: "execution",
  project: "execution",
  finance: "finance",
  strategy: "strategy",
  risk: "strategy",
  customer: "strategy",
};

const DEFAULT_HALF_LIFE_DAYS = 14;

function domainOf(event: LeadosEvent): SignalDomain {
  const prefix = event.type.split(".")[0];
  return DOMAIN_BY_PREFIX[prefix] ?? "execution";
}

function severityOf(event: LeadosEvent): number {
  const raw = event.data?.severity;
  if (typeof raw === "number") return clamp01(raw);
  return 0.5; // DESIGN PARAMETER: neutral default severity when unspecified
}

export interface ScoredEvent {
  domain: SignalDomain;
  weight: number;
}

/** scoreEvent: recency-decayed severity contribution of a single event,
 * half-life decay per temporal.ts `recencyWeight` (original derivation).
 */
export function scoreEvent(
  event: LeadosEvent,
  now: Date,
  halfLifeDays = DEFAULT_HALF_LIFE_DAYS,
): ScoredEvent {
  const w = recencyWeight(event.occurredAt, now, halfLifeDays) * severityOf(event);
  return { domain: domainOf(event), weight: w };
}

/** fuseSignals: sum of recency-weighted event scores per domain, normalized
 * by event count so the result is a comparable 0-1-ish intensity score.
 */
export function fuseSignals(
  events: LeadosEvent[],
  now: Date,
  halfLifeDays = DEFAULT_HALF_LIFE_DAYS,
): Record<SignalDomain, number> {
  const totals: Record<SignalDomain, { sum: number; count: number }> = {
    people: { sum: 0, count: 0 },
    execution: { sum: 0, count: 0 },
    finance: { sum: 0, count: 0 },
    strategy: { sum: 0, count: 0 },
  };
  for (const event of events) {
    const scored = scoreEvent(event, now, halfLifeDays);
    totals[scored.domain].sum += scored.weight;
    totals[scored.domain].count += 1;
  }
  const out = {} as Record<SignalDomain, number>;
  (Object.keys(totals) as SignalDomain[]).forEach((domain) => {
    const { sum, count } = totals[domain];
    out[domain] = count > 0 ? clamp01(sum / count) : 0;
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// computeObservableLikelihoods — exact mapping rules from the task spec
// ─────────────────────────────────────────────────────────────────────────

const NEUTRAL_DEFAULT = 0.2; // matches the "all new observables prior: 0.2" spec

function invertedAvg(values: number[], scaleMax: number): number {
  if (values.length === 0) return NEUTRAL_DEFAULT;
  return clamp01((scaleMax - mean(values)) / scaleMax);
}

export function computeObservableLikelihoods(
  events: LeadosEvent[],
  people: LeadosPerson[],
  metrics: LeadosMetrics,
  now: Date,
): Record<ObservableNodeId, number> {
  const headcount = Math.max(people.length, 1);

  // ---- legacy 6 observables (bootstrapped baseline, original derivation;
  // the original 6-node mapping logic did not exist in the repo, so a
  // simple, internally-consistent heuristic is defined here) ----

  const cadenceScheduled = countOfTypeInWindow(events, "people.checkin.scheduled", now, 30);
  const cadenceMissed = countOfTypeInWindow(events, "people.checkin.missed", now, 30);
  const cadenceSlip = cadenceScheduled > 0 ? clamp01(cadenceMissed / cadenceScheduled) : NEUTRAL_DEFAULT;

  const moraleEvents = eventsOfTypeInWindow(events, "people.pulse.logged", now, 30)
    .map((e) => e.data?.morale)
    .filter((v): v is number => typeof v === "number");
  const moralePulse = invertedAvg(moraleEvents, 10);

  const runwayEvents = eventsOfTypeInWindow(events, "finance.runway.snapshot", now, 90)
    .map((e) => e.data?.months)
    .filter((v): v is number => typeof v === "number");
  const latestRunway = runwayEvents.length > 0 ? runwayEvents[runwayEvents.length - 1] : null;
  const runwayMonths = latestRunway === null ? NEUTRAL_DEFAULT : clamp01((6 - latestRunway) / 6);

  const compGapCount = countOfTypeInWindow(events, "people.comp_gap.flagged", now, 90);
  const compGapSignal = clamp01((compGapCount / headcount) * 5);

  const attritionCount = countOfTypeInWindow(events, "people.attrition.logged", now, 90);
  const peerAttritionSignal = clamp01((attritionCount / headcount) * 5);

  const sentimentEvents = eventsOfTypeInWindow(events, "people.sentiment.logged", now, 30)
    .map((e) => e.data?.sentiment)
    .filter((v): v is number => typeof v === "number");
  const sentimentDrop = invertedAvg(sentimentEvents, 1);

  // ---- new 16 observables, per exact task mapping rules ----

  // actionItemSlipRate: overdue / created in last 30d, * 1.5, clamp 0-1.
  const overdueCount = countOfTypeInWindow(events, "decision.action_item.overdue", now, 30);
  const createdCount = countOfTypeInWindow(events, "decision.action_item.created", now, 30);
  const slipRate = createdCount > 0 ? overdueCount / createdCount : 0;
  const actionItemSlipRate = clamp(slipRate * 1.5, 0, 1);

  // decisionCycleBloom: avgCycleTimeDays / 30, clamp 0-1.
  const decisionCycleBloom = clamp(metrics.decisionHealthIndex.avgCycleTimeDays / 30, 0, 1);

  // budgetDeviationPct: |actual - planned| / planned from finance events,
  // averaged over last 90d snapshots, clamp 0-1.
  const budgetEvents = eventsOfTypeInWindow(events, "finance.budget.snapshot", now, 90)
    .map((e) => {
      const actual = e.data?.actual;
      const planned = e.data?.planned;
      if (typeof actual === "number" && typeof planned === "number" && planned !== 0) {
        return Math.abs(actual - planned) / planned;
      }
      return null;
    })
    .filter((v): v is number => v !== null);
  const budgetDeviationPct = budgetEvents.length > 0 ? clamp01(mean(budgetEvents)) : NEUTRAL_DEFAULT;

  // techDebtVelocity: events in last 60d, each worth 0.15, summed, clamp 0-1.
  const techDebtCount = countOfTypeInWindow(events, "ops.tech_debt.flagged", now, 60);
  const techDebtVelocity = clamp01(techDebtCount * 0.15);

  // onboardingCohortDrop: proportion of new hires (start_date in last 90d)
  // with zero "people.oneonone.logged" events.
  const newHires = people.filter((p) => p.startDate && daysBetween(p.startDate, now) <= 90 && daysBetween(p.startDate, now) >= 0);
  const oneOnOneEvents = eventsOfType(events, "people.oneonone.logged");
  const onboardingCohortDrop =
    newHires.length > 0
      ? clamp01(
          newHires.filter((hire) => !oneOnOneEvents.some((e) => e.personId === hire.id)).length /
            newHires.length,
        )
      : 0;

  // conflictFrequency: conflict events / headcount in last 30d, * 10, clamp 0-1.
  const conflictCount = countOfTypeInWindow(events, "people.conflict.logged", now, 30);
  const conflictFrequency = clamp01((conflictCount / headcount) * 10);

  // meetingLoadIndex: from person snapshot data; elevated if avg calendar
  // load > 70% (if field exists) or 0.3 default.
  // INTERPRETATION: when the field exists, the likelihood IS the average
  // load fraction (so it naturally crosses 0.7 as "elevated"); 0.3 default
  // otherwise, per the literal "or 0.3 default" clause.
  const loadValues = people.map((p) => p.calendarLoadPct).filter((v): v is number => typeof v === "number");
  const meetingLoadIndex = loadValues.length > 0 ? clamp01(mean(loadValues) / 100) : 0.3;

  // knowledgeSiloIndex: isolatedCount / total nodes, * 3, clamp 0-1.
  const { isolatedCount, totalNodes } = metrics.orgNetwork;
  const knowledgeSiloIndex = totalNodes > 0 ? clamp01((isolatedCount / totalNodes) * 3) : NEUTRAL_DEFAULT;

  // retrospectiveHealth: inverse of proportion of teams with zero
  // "ops.retro.logged" events in last 30d. (Implemented literally as
  // specified: value = 1 - proportionOfTeamsWithZeroRetros.)
  const teamIds = Array.from(new Set(people.map((p) => p.teamId).filter((t): t is string => !!t)));
  const retroEvents = eventsOfTypeInWindow(events, "ops.retro.logged", now, 30);
  const retrospectiveHealth =
    teamIds.length > 0
      ? clamp01(
          1 -
            teamIds.filter((teamId) => !retroEvents.some((e) => e.teamId === teamId)).length /
              teamIds.length,
        )
      : NEUTRAL_DEFAULT;

  // deliveryConfidenceDrop: avg confidence drop across active projects
  // between last two snapshots, clamp 0-1.
  const byProject = new Map<string, typeof metrics.projectConfidenceSnapshots>();
  for (const snap of metrics.projectConfidenceSnapshots) {
    const list = byProject.get(snap.projectId) ?? [];
    list.push(snap);
    byProject.set(snap.projectId, list);
  }
  const drops: number[] = [];
  for (const snaps of byProject.values()) {
    const sorted = [...snaps].sort(
      (a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime(),
    );
    if (sorted.length >= 2) {
      const prev = sorted[sorted.length - 2].confidence;
      const last = sorted[sorted.length - 1].confidence;
      drops.push(Math.max(0, prev - last));
    }
  }
  const deliveryConfidenceDrop = drops.length > 0 ? clamp01(mean(drops)) : NEUTRAL_DEFAULT;

  // boardSentiment: mean(data.sentiment) from "strategy.board.signal",
  // inverted (elevated = low sentiment): 1 - mean.
  const boardSentimentEvents = eventsOfType(events, "strategy.board.signal")
    .map((e) => e.data?.sentiment)
    .filter((v): v is number => typeof v === "number");
  const boardSentiment = boardSentimentEvents.length > 0 ? clamp01(1 - mean(boardSentimentEvents)) : NEUTRAL_DEFAULT;

  // successionGapCount / talentBenchDepth: senior (L5+) roles with no
  // identified successor. Both nodes share the same underlying raw-gap
  // normalization per the task's literal (duplicated) formula text.
  const seniorLevels = new Set(["L5", "L6", "L7"]);
  const successionGapRaw = people.filter((p) => p.level && seniorLevels.has(p.level) && !p.hasSuccessor).length;
  const successionGapNormalized = clamp01((successionGapRaw / headcount) * 5);
  const successionGapCount = successionGapNormalized;
  const talentBenchDepth = successionGapNormalized;

  // psychologicalSafetyIndex: pulse data.psychSafety (0-10), elevated =
  // (10 - avg) / 10.
  const psychSafetyEvents = eventsOfTypeInWindow(events, "people.pulse.logged", now, 30)
    .map((e) => e.data?.psychSafety)
    .filter((v): v is number => typeof v === "number");
  const psychologicalSafetyIndex = invertedAvg(psychSafetyEvents, 10);

  // regulatoryFlagRate: "risk.compliance.flag" events in last 90d * 0.2,
  // clamp 0-1.
  const complianceFlags = countOfTypeInWindow(events, "risk.compliance.flag", now, 90);
  const regulatoryFlagRate = clamp01(complianceFlags * 0.2);

  // customerNPSDrift: if latest NPS dropped > 5 pts vs 90d avg, elevated =
  // drop / 30 clamp 0-1, else 0.
  const npsInWindow = metrics.npsSnapshots.filter((s) => daysBetween(s.takenAt, now) <= 90 && daysBetween(s.takenAt, now) >= 0);
  const npsSorted = [...npsInWindow].sort(
    (a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime(),
  );
  let customerNPSDrift = 0;
  if (npsSorted.length >= 2) {
    const latest = npsSorted[npsSorted.length - 1].score;
    const windowAvg = mean(npsSorted.slice(0, -1).map((s) => s.score));
    const drop = windowAvg - latest;
    customerNPSDrift = drop > 5 ? clamp01(drop / 30) : 0;
  }

  return {
    cadenceSlip,
    moralePulse,
    runwayMonths,
    compGapSignal,
    peerAttritionSignal,
    sentimentDrop,
    actionItemSlipRate,
    decisionCycleBloom,
    budgetDeviationPct,
    techDebtVelocity,
    onboardingCohortDrop,
    conflictFrequency,
    meetingLoadIndex,
    knowledgeSiloIndex,
    retrospectiveHealth,
    deliveryConfidenceDrop,
    boardSentiment,
    talentBenchDepth,
    successionGapCount,
    psychologicalSafetyIndex,
    regulatoryFlagRate,
    customerNPSDrift,
  };
}
