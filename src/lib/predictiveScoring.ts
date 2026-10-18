// ─────────────────────────────────────────────────────────────────────────
// Predictive scoring
//
// Person-level flight risk, org-level burnout risk, and decision-health
// indices. Every score is a documented weighted combination of normalized
// [0,1] features — no opaque magic numbers without an explanation.
// ─────────────────────────────────────────────────────────────────────────

import { clamp, daysBetween, round } from "./temporal";
import type { BurnoutRiskIndex, DecisionHealthIndex, FlightRiskScore, LeadosEvent, Person, PersonId } from "./types";

function numberField(data: Record<string, unknown>, key: string, fallback: number): number {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function eventsFor(events: LeadosEvent[], personId: PersonId, type: string): LeadosEvent[] {
  return events.filter((e) => e.personId === personId && e.type === type);
}

/** Simple ordinary-least-squares slope of y against x (mood points per day). */
function linearSlope(points: Array<{ x: number; y: number }>): number {
  const n = points.length;
  if (n < 2) return 0;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) * (p.x - meanX);
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Tenure risk curve: known "two-year itch" attrition pattern — elevated
 * risk in the first ~3 months (onboarding mismatch) and again around the
 * ~24 month mark (LinkedIn Talent Blog "Why & When Employees Leave", 2018;
 * widely corroborated by SHRM attrition-curve reporting). Modeled as the
 * maximum of two Gaussian bumps centered at those tenure points.
 */
function tenureRisk(tenureMonths: number): number {
  const gaussian = (x: number, mean: number, sd: number) => Math.exp(-((x - mean) ** 2) / (2 * sd * sd));
  return clamp(Math.max(gaussian(tenureMonths, 3, 3), gaussian(tenureMonths, 24, 9)), 0, 1);
}

const FLIGHT_RISK_WEIGHTS = {
  cadence: 0.25,
  moodTrend: 0.3,
  compGap: 0.15,
  tenure: 0.15,
  feedbackFreq: 0.15,
};

/**
 * Per-person flight risk, combining:
 *  - recency of 1:1s (cadence neglect)
 *  - mood trend (level + slope of recent pulses)
 *  - compensation gap signal
 *  - tenure (two-year-itch curve)
 *  - feedback frequency
 * Score = Σ weight_i * feature_i, weights sum to 1, so score ∈ [0,1].
 */
export function computeFlightRiskScore(person: Person, events: LeadosEvent[], now: Date = new Date()): FlightRiskScore {
  const oneOnOnes = eventsFor(events, person.id, "people.oneonone.logged").sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
  const pulses = eventsFor(events, person.id, "people.pulse.logged").sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
  const compReviews = eventsFor(events, person.id, "people.comp.reviewed").sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
  const feedback = eventsFor(events, person.id, "people.feedback.logged").filter(
    (e) => daysBetween(e.occurredAt, now) <= 90,
  );

  const daysSinceOneOnOne = oneOnOnes.length > 0 ? daysBetween(oneOnOnes[0].occurredAt, now) : daysBetween(person.tenureStartAt, now);
  const cadenceFeature = clamp((daysSinceOneOnOne - 14) / 21, 0, 1);

  const recentPulses = pulses.slice(0, 5);
  let moodTrendFeature = 0;
  if (recentPulses.length > 0) {
    const avgMood = recentPulses.reduce((s, e) => s + numberField(e.data, "mood", 3), 0) / recentPulses.length;
    const levelRisk = clamp((5 - avgMood) / 4, 0, 1);
    const points = recentPulses.map((e) => ({ x: -daysBetween(e.occurredAt, now), y: numberField(e.data, "mood", 3) }));
    const slope = linearSlope(points); // mood points per day; negative = declining
    const slopeRisk = clamp(-slope * 20, 0, 1);
    moodTrendFeature = clamp(0.5 * levelRisk + 0.5 * slopeRisk, 0, 1);
  }

  const compGapPct = compReviews.length > 0 ? numberField(compReviews[0].data, "gapPct", 0) : 0;
  const compGapFeature = clamp(compGapPct / 30, 0, 1);

  const tenureMonths = daysBetween(person.tenureStartAt, now) / 30;
  const tenureFeature = tenureRisk(tenureMonths);

  const feedbackFreqFeature = clamp((6 - feedback.length) / 6, 0, 1);

  const weighted: Array<{ label: string; weight: number; value: number; detail: string }> = [
    { label: "1:1 cadence overdue", weight: FLIGHT_RISK_WEIGHTS.cadence, value: cadenceFeature, detail: `${Math.round(daysSinceOneOnOne)}d since last 1:1` },
    { label: "mood declining", weight: FLIGHT_RISK_WEIGHTS.moodTrend, value: moodTrendFeature, detail: "recent pulse trend" },
    { label: "compensation gap", weight: FLIGHT_RISK_WEIGHTS.compGap, value: compGapFeature, detail: `${round(compGapPct, 1)}% below market` },
    { label: "tenure risk window", weight: FLIGHT_RISK_WEIGHTS.tenure, value: tenureFeature, detail: `${round(tenureMonths, 1)} months tenure` },
    { label: "low feedback frequency", weight: FLIGHT_RISK_WEIGHTS.feedbackFreq, value: feedbackFreqFeature, detail: `${feedback.length} feedback events in 90d` },
  ];

  const score = clamp(
    weighted.reduce((sum, f) => sum + f.weight * f.value, 0),
    0,
    1,
  );

  const drivers = weighted
    .filter((f) => f.value >= 0.5)
    .sort((a, b) => b.weight * b.value - a.weight * a.value)
    .map((f) => `${f.label} (${f.detail})`);

  const horizon: FlightRiskScore["horizon"] = cadenceFeature > 0.6 || moodTrendFeature > 0.6 ? "30d" : "90d";

  return { personId: person.id, score: round(score, 3), drivers, horizon };
}

export function computeFlightRiskScores(people: Person[], events: LeadosEvent[], now: Date = new Date()): FlightRiskScore[] {
  return people.map((p) => computeFlightRiskScore(p, events, now));
}

/**
 * Org-wide burnout risk: per-person burnout score = 0.5 * mood risk +
 * 0.3 * ops-incident load + 0.2 * cadence neglect, averaged across the
 * roster for the headline `value`; hotspots are people above 0.6.
 */
export function computeBurnoutRiskIndex(people: Person[], events: LeadosEvent[], now: Date = new Date()): BurnoutRiskIndex {
  const perPerson = people.map((person) => {
    const pulses = eventsFor(events, person.id, "people.pulse.logged").sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
    );
    const recentPulses = pulses.slice(0, 3);
    const avgMood = recentPulses.length
      ? recentPulses.reduce((s, e) => s + numberField(e.data, "mood", 3), 0) / recentPulses.length
      : 3;
    const moodRisk = clamp((5 - avgMood) / 4, 0, 1);

    const incidents30d = events.filter(
      (e) => e.type === "ops.incident" && e.personId === person.id && daysBetween(e.occurredAt, now) <= 30,
    ).length;
    const opsLoadRisk = clamp(incidents30d / 5, 0, 1);

    const oneOnOnes = eventsFor(events, person.id, "people.oneonone.logged").sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
    );
    const daysSinceOneOnOne = oneOnOnes.length ? daysBetween(oneOnOnes[0].occurredAt, now) : daysBetween(person.tenureStartAt, now);
    const cadenceRisk = clamp((daysSinceOneOnOne - 14) / 21, 0, 1);

    const burnoutScore = clamp(0.5 * moodRisk + 0.3 * opsLoadRisk + 0.2 * cadenceRisk, 0, 1);
    return { person, burnoutScore, moodRisk, opsLoadRisk, cadenceRisk, incidents30d };
  });

  const value = perPerson.length
    ? round(perPerson.reduce((s, p) => s + p.burnoutScore, 0) / perPerson.length, 3)
    : 0;

  const hotspots = perPerson
    .filter((p) => p.burnoutScore > 0.6)
    .sort((a, b) => b.burnoutScore - a.burnoutScore)
    .slice(0, 5)
    .map((p) => p.person.id);

  const evidence: string[] = [];
  const decliningMoodCount = perPerson.filter((p) => p.moodRisk > 0.5).length;
  const overdueCount = perPerson.filter((p) => p.cadenceRisk > 0.5).length;
  const totalIncidents = perPerson.reduce((s, p) => s + p.incidents30d, 0);
  if (decliningMoodCount > 0) evidence.push(`${decliningMoodCount} people show low or declining mood pulses`);
  if (overdueCount > 0) evidence.push(`${overdueCount} people have 1:1 cadence overdue by 3+ weeks`);
  if (totalIncidents > 0) evidence.push(`${totalIncidents} ops incidents logged in the last 30 days`);
  if (evidence.length === 0) evidence.push("No elevated burnout signals detected in the current window");

  return { value, hotspots, evidence };
}

interface Decision {
  id: string;
  openedAt: Date;
  resolvedAt: Date | null;
  escalated: boolean;
}

function buildDecisions(events: LeadosEvent[]): Decision[] {
  const logged = events.filter((e) => e.type === "decision.logged");
  const resolvedByKey = new Map<string, Date>();
  for (const e of events.filter((e) => e.type === "decision.resolved")) {
    const key = String(e.data.decisionId ?? e.id);
    resolvedByKey.set(key, e.occurredAt);
  }
  const escalatedKeys = new Set(
    events.filter((e) => e.type === "decision.escalate").map((e) => String(e.data.decisionId ?? e.id)),
  );

  return logged.map((e) => {
    const key = String(e.data.decisionId ?? e.id);
    return {
      id: key,
      openedAt: e.occurredAt,
      resolvedAt: resolvedByKey.get(key) ?? null,
      escalated: escalatedKeys.has(key),
    };
  });
}

/**
 * Decision health: stale = open decisions older than 14 days; blockedCount =
 * decisions that were escalated and remain unresolved; velocityTrend
 * compares decisions resolved in the last 30 days vs the prior 30 days.
 */
export function computeDecisionHealthIndex(events: LeadosEvent[], now: Date = new Date()): DecisionHealthIndex {
  const decisions = buildDecisions(events);

  const stale = decisions.filter((d) => d.resolvedAt === null && daysBetween(d.openedAt, now) > 14).length;
  const blockedCount = decisions.filter((d) => d.escalated && d.resolvedAt === null).length;

  const resolvedEvents = events.filter((e) => e.type === "decision.resolved");
  const recentResolved = resolvedEvents.filter((e) => daysBetween(e.occurredAt, now) <= 30).length;
  const priorResolved = resolvedEvents.filter((e) => {
    const age = daysBetween(e.occurredAt, now);
    return age > 30 && age <= 60;
  }).length;

  // Ties go to "accelerating" only if there was any resolution activity at
  // all; a 0-vs-0 tie is treated as decelerating (no momentum).
  let velocityTrend: DecisionHealthIndex["velocityTrend"];
  if (recentResolved > priorResolved) velocityTrend = "accelerating";
  else if (recentResolved < priorResolved) velocityTrend = "decelerating";
  else velocityTrend = recentResolved > 0 ? "accelerating" : "decelerating";

  return { stale, velocityTrend, blockedCount };
}
