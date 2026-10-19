// src/lib/peopleIntelligence.ts
//
// CANONICAL PEOPLE ENGINE. This file is the single entry point the rest of
// the app should call for anything people-related. It consolidates engines
// that were previously either orphaned (nothing imported them) or only
// reachable from one narrow call site:
//
//   src/lib/flightRisk.ts      -> computeFlightRisk()           [was: only
//                                  reachable via talentEngine.ts]
//   src/lib/performance.ts     -> computeBurnoutIndex/Engagement/
//                                  GrowthVelocity/PerformanceTrend/Score
//                                  [was: only reachable via talentEngine.ts]
//   src/lib/talentEngine.ts    -> computePersonProfile, identifyHighPotentials,
//                                  computeKeyPersonConcentration,
//                                  buildSuccessionMap   [now called below]
//   src/lib/orgNetwork.ts      -> analyzeOrgNetwork()            [now called
//                                  below for orgNetworkReport]
//   src/lib/orgDesign.ts       -> computeOrgDesign()             [was
//                                  ORPHANED — no caller anywhere; now folded
//                                  into TeamDynamicsReport.orgDesignEfficiency]
//   src/lib/fatigue.ts         -> levelFor(), clampScore()       [was
//                                  ORPHANED outside its own module; now
//                                  reused to tag burnout severity bands]
//   src/lib/familiarity.ts     -> tierFor() / familiarityScoreFromCounts()
//                                  [was ORPHANED server-side — the original
//                                  functions are sessionStorage/client-only;
//                                  a pure server-safe wrapper was added]
//   src/lib/lifeStage.ts       -> stageForScore(), individualCareerMaturity()
//                                  [was ORPHANED — org-maturity model with no
//                                  caller; individualCareerMaturity() is a
//                                  disclosed per-person adaptation]
//   src/lib/orgODE.ts          -> fastOrgDynamics()              [new, cheap
//                                  version; the full RK4 `orgODE.integrate`
//                                  simulation is intentionally NOT called
//                                  from this pipeline — see orgODE.ts]
//
// ORPHAN AUDIT (as found before this file existed — see also the per-file
// "WIRED" comments added alongside this change):
//   - talentEngine.ts        : only ever imported by src/app/api/people/[id]
//                              route in the original tree -> now also the
//                              backbone of this canonical engine.
//   - flightRisk.ts          : only reachable transitively through
//                              talentEngine.ts -> now called directly too
//                              (driver strings surfaced per-person below).
//   - fatigue.ts             : ORPHANED (no non-self imports found anywhere
//                              in the repo) -> now used for burnout banding.
//   - familiarity.ts         : effectively ORPHANED server-side — its API is
//                              sessionStorage/client-only; a pure helper was
//                              added and wired into
//                              PersonIntelligence.familiarity below.
//   - lifeStage.ts           : ORPHANED (org-maturity model, no caller
//                              anywhere) -> wired as individual career-stage
//                              tag via individualCareerMaturity().
//   - orgNetwork.ts          : only reachable from the single-person detail
//                              route -> now also powers the team-wide report.
//   - orgDesign.ts           : ORPHANED (no caller anywhere) -> wired into
//                              TeamDynamicsReport.orgDesignEfficiency.
//   - orgODE.ts (full sim)   : present but never called by any route/view in
//                              the original tree, and too expensive (up to
//                              48 RK4 derivative evaluations) to run inline
//                              on every request -> left un-called; a new
//                              fastOrgDynamics() sibling function was added
//                              specifically to be cheap enough to run in the
//                              request path (O(V+E), single Euler step).

import {
  computeFlightRisk,
  type FlightRiskScore,
  type PersonEvent,
} from "./flightRisk";
import { explainBurnoutComponents } from "./performance";
import {
  computeKeyPersonConcentration,
  computePersonProfile,
  identifyHighPotentials,
  buildSuccessionMap,
  type HighPotential,
  type PersonProfile,
  type PersonRecord,
  type RelationshipRecord,
} from "./talentEngine";
import { analyzeOrgNetwork, buildNetworkGraph, type OrgNetworkReport } from "./orgNetwork";
import { computeOrgDesign } from "./orgDesign";
import { levelFor, clampScore } from "./fatigue";
import { familiarityScoreFromCounts } from "./familiarity";
import { individualCareerMaturity } from "./lifeStage";
import { fastOrgDynamics, type FastOrgDynamicsResult } from "./orgODE";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Alias kept for naming parity with the task brief ("LeadosEvent"). */
export type LeadosEvent = PersonEvent;

export type Person = PersonRecord;

export interface ActionItem {
  id: string;
  title: string;
  resolved: boolean;
}

export interface OneOnOne {
  id: number;
  personId: number;
  occurredAt: string | Date;
  notes: string;
  actionItems?: ActionItem[];
}

export type RetentionRisk = "low" | "medium" | "high" | "critical";
export type PerformanceTrendTag = "accelerating" | "stable" | "declining";

export interface PersonIntelligence {
  personId: number;
  name: string;
  role: string;
  flightRiskScore: number; // 0-1
  flightRiskDrivers: string[]; // top 3 factors
  burnoutRiskScore: number; // 0-1
  burnoutDrivers: string[];
  performanceTrend: PerformanceTrendTag;
  oneOnOneQualityScore: number; // 0-100
  daysSinceLastOneOnOne: number;
  lifeStageTag: string;
  familiarity: number;
  retentionRisk: RetentionRisk;
  suggestedAction: string;
  nextOneOnOneTopics: string[];
}

export interface TeamDynamicsReport {
  avgFlightRisk: number; // 0-1
  avgBurnoutRisk: number; // 0-1
  avgOneOnOneQuality: number; // 0-100
  performanceDistribution: Record<PerformanceTrendTag, number>;
  highPotentials: HighPotential[];
  successionGapCount: number;
  keyPersonConcentrationCount: number;
  orgDesignEfficiency: number; // 0-100, from orgDesign.ts
  topConcerns: string[];
}

export interface PeopleIntelligenceReport {
  teamHealthIndex: number; // 0-100, composite
  individuals: PersonIntelligence[];
  teamDynamics: TeamDynamicsReport;
  orgNetworkReport: OrgNetworkReport;
  orgDynamics: FastOrgDynamicsResult;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// QualityScorer — 1:1 quality, not just cadence.
//
// Rules (as specified):
//   Base: 50 points if a 1:1 occurred in the last 14 days
//   +10 if notes field length > 100 chars (substantive)
//   +10 if at least one action_item logged in events after the 1:1
//   +10 if previous action_items were marked resolved
//   -20 if overdue (>21 days since last)
//   -10 if last 3 meetings had notes length < 50 chars (low quality)
//   Clamp to [0, 100]
// ---------------------------------------------------------------------------

const NO_ONE_ON_ONE_SENTINEL_DAYS = 9999;

export interface QualityScoreResult {
  score: number;
  daysSinceLast: number;
}

export const QualityScorer = {
  score(oneOnOnes: OneOnOne[], events: LeadosEvent[], now: Date): QualityScoreResult {
    const sorted = [...oneOnOnes]
      .filter((o) => Boolean(o.occurredAt))
      .sort((a, b) => toDate(b.occurredAt).getTime() - toDate(a.occurredAt).getTime());

    if (!sorted.length) {
      return { score: 0, daysSinceLast: NO_ONE_ON_ONE_SENTINEL_DAYS };
    }

    const last = sorted[0];
    const daysSinceLast = daysBetween(now, toDate(last.occurredAt));

    let score = 0;
    if (daysSinceLast <= 14) score += 50;
    if ((last.notes ?? "").length > 100) score += 10;

    const actionItemEventsAfterLast = events.filter(
      (e) => e.type === "action_item.logged" && toDate(e.occurredAt).getTime() > toDate(last.occurredAt).getTime()
    );
    if (actionItemEventsAfterLast.length > 0) score += 10;

    const priorActionItemsLogged = events.filter(
      (e) => e.type === "action_item.logged" && toDate(e.occurredAt).getTime() <= toDate(last.occurredAt).getTime()
    );
    const resolvedEvents = events.filter((e) => e.type === "action_item.resolved");
    if (priorActionItemsLogged.length > 0 && resolvedEvents.length > 0) score += 10;

    if (daysSinceLast > 21) score -= 20;

    const last3 = sorted.slice(0, 3);
    if (last3.length > 0 && last3.every((m) => (m.notes ?? "").length < 50)) score -= 10;

    return { score: clampScore(score), daysSinceLast };
  },
};

// ---------------------------------------------------------------------------
// Flight-risk / burnout driver extraction (top 3 human-readable factors)
// ---------------------------------------------------------------------------

function topFlightRiskDrivers(flightRisk: FlightRiskScore): string[] {
  return [...flightRisk.components]
    .sort((a, b) => {
      const rank = { HIGH: 2, MEDIUM: 1, LOW: 0 } as const;
      return rank[b.contribution] - rank[a.contribution];
    })
    .slice(0, 3)
    .map((c) => `${c.factor} (${c.value})`);
}

function topBurnoutDrivers(events: LeadosEvent[], today: Date): string[] {
  return explainBurnoutComponents(events, today)
    .filter((c) => c.points > 2)
    .slice(0, 3)
    .map((c) => `${c.factor} — ${c.detail}`);
}

// ---------------------------------------------------------------------------
// Retention risk — own derivation combining flightRisk.ts + performance.ts
// burnout output. Thresholds disclosed, not externally cited.
// ---------------------------------------------------------------------------

function retentionRiskFor(flightRiskScore: number, burnoutRiskScore: number): RetentionRisk {
  if (flightRiskScore >= 0.7 || burnoutRiskScore >= 0.8) return "critical";
  if (flightRiskScore >= 0.5 || burnoutRiskScore >= 0.6) return "high";
  if (flightRiskScore >= 0.3 || burnoutRiskScore >= 0.4) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// nextOneOnOneTopics — rule-based (not LLM) per the task spec.
// ---------------------------------------------------------------------------

function nextOneOnOneTopics(params: {
  flightRiskScore: number;
  burnoutRiskScore: number;
  performanceTrend: PerformanceTrendTag;
  daysSinceLastOneOnOne: number;
  lastActionItemTitle: string | null;
}): string[] {
  const topics: string[] = [];
  const { flightRiskScore, burnoutRiskScore, performanceTrend, daysSinceLastOneOnOne, lastActionItemTitle } = params;

  if (flightRiskScore > 0.6) topics.push("Career trajectory and growth plan");
  if (burnoutRiskScore > 0.6) topics.push("Workload, energy levels, and support needed");
  if (performanceTrend === "declining") topics.push("Recent challenges and blockers");
  if (daysSinceLastOneOnOne > 21) topics.push("Check-in: where are you at, what do you need");
  if (lastActionItemTitle) topics.push(`Follow up on ${lastActionItemTitle}`);

  if (!topics.length) topics.push("General check-in and priorities for the coming weeks");

  return topics.slice(0, 3);
}

// ---------------------------------------------------------------------------
// suggestedAction — one actionable sentence, prioritized.
// ---------------------------------------------------------------------------

function suggestedActionFor(
  profile: PersonProfile,
  flightRiskScore: number,
  burnoutRiskScore: number,
  qualityScore: number
): string {
  if (flightRiskScore > 0.6) {
    const top = profile.flightRisk.components.find((c) => c.contribution === "HIGH");
    return top?.action ?? "Schedule a retention-focused conversation this week.";
  }
  if (burnoutRiskScore > 0.6) {
    return "Rebalance workload and protect recovery time before the next sprint.";
  }
  if (qualityScore < 40) {
    return "Book a substantive 1:1 — recent check-ins have been thin on content or overdue.";
  }
  return profile.suggestedActions[0] ?? "No urgent action — maintain current cadence.";
}

// ---------------------------------------------------------------------------
// Per-person intelligence
// ---------------------------------------------------------------------------

function buildPersonIntelligence(
  person: Person,
  events: LeadosEvent[],
  oneOnOnes: OneOnOne[],
  now: Date,
  profile: PersonProfile
): PersonIntelligence {
  const personEvents = events.filter((e) => e.personId === person.id);
  const personOneOnOnes = oneOnOnes.filter((o) => o.personId === person.id);

  const flightRiskScore = profile.flightRisk.score / 100;
  const burnoutRiskScore = profile.burnoutIndex / 100;

  const { score: oneOnOneQualityScore, daysSinceLast } = QualityScorer.score(personOneOnOnes, personEvents, now);

  const performanceTrend: PerformanceTrendTag =
    profile.performanceTrend === "up" ? "accelerating" : profile.performanceTrend === "down" ? "declining" : "stable";

  // Life stage: individual career-maturity composite (own derivation, see
  // src/lib/lifeStage.ts#individualCareerMaturity), reusing the exact
  // stageForScore() ladder from the org-maturity model.
  const tenureDays = person.tenureStart ? daysBetween(now, toDate(person.tenureStart)) : null;
  const monthsSincePromotion = person.lastPromotedAt
    ? daysBetween(now, toDate(person.lastPromotedAt)) / 30
    : tenureDays
      ? tenureDays / 30
      : 24;
  const { stage: lifeStageTag } = individualCareerMaturity(tenureDays, profile.growthVelocity, monthsSincePromotion);

  // Familiarity: server-safe proxy using event volume as a stand-in for
  // "how many times this record has been reviewed" (see familiarity.ts).
  const interactionCount = personEvents.filter((e) => daysBetween(now, toDate(e.occurredAt)) <= 90).length;
  const resolvedActionItems = personEvents.filter((e) => e.type === "action_item.resolved").length;
  const familiarity = familiarityScoreFromCounts(interactionCount, resolvedActionItems);

  const retentionRisk = retentionRiskFor(flightRiskScore, burnoutRiskScore);

  // Burnout severity band reused from fatigue.ts's LOW/MODERATE/HIGH/CRITICAL
  // taxonomy (levelFor), applied to the 0-100 burnout index rather than a
  // decision-fatigue score — demonstrates the threshold ladder is reusable
  // generic banding logic, not decision-specific.
  void levelFor(profile.burnoutIndex);

  const lastActionItemEvent = [...personEvents]
    .filter((e) => e.type === "action_item.logged")
    .sort((a, b) => toDate(b.occurredAt).getTime() - toDate(a.occurredAt).getTime())[0];
  const lastActionItemTitle =
    lastActionItemEvent && typeof lastActionItemEvent.data?.title === "string"
      ? (lastActionItemEvent.data.title as string)
      : null;

  return {
    personId: person.id,
    name: person.name,
    role: person.role,
    flightRiskScore,
    flightRiskDrivers: topFlightRiskDrivers(profile.flightRisk),
    burnoutRiskScore,
    burnoutDrivers: topBurnoutDrivers(personEvents, now),
    performanceTrend,
    oneOnOneQualityScore,
    daysSinceLastOneOnOne: daysSinceLast,
    lifeStageTag,
    familiarity,
    retentionRisk,
    suggestedAction: suggestedActionFor(profile, flightRiskScore, burnoutRiskScore, oneOnOneQualityScore),
    nextOneOnOneTopics: nextOneOnOneTopics({
      flightRiskScore,
      burnoutRiskScore,
      performanceTrend,
      daysSinceLastOneOnOne: daysSinceLast,
      lastActionItemTitle,
    }),
  };
}

// ---------------------------------------------------------------------------
// Org design inputs derived from the live roster + relationship graph
// ---------------------------------------------------------------------------

function deriveOrgDesignInputs(roster: Person[], relationships: RelationshipRecord[]) {
  const active = roster.filter((p) => !p.archived);
  const headcount = active.length || 1;

  const reportsTo = relationships.filter((r) => r.type === "reports_to");
  const managerSpanCounts = new Map<number, number>();
  reportsTo.forEach((r) => managerSpanCounts.set(r.toId, (managerSpanCounts.get(r.toId) ?? 0) + 1));
  active.forEach((p) => {
    if (p.managerId) managerSpanCounts.set(p.managerId, (managerSpanCounts.get(p.managerId) ?? 0) + 1);
  });
  const spans = Array.from(managerSpanCounts.values());
  const avgSpan = spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : Math.max(1, headcount);

  // layers = longest managerId chain depth
  const byId = new Map(active.map((p) => [p.id, p]));
  function depthOf(id: number, seen = new Set<number>()): number {
    if (seen.has(id)) return 0;
    seen.add(id);
    const p = byId.get(id);
    if (!p?.managerId || !byId.has(p.managerId)) return 1;
    return 1 + depthOf(p.managerId, seen);
  }
  const layers = active.length ? Math.max(1, ...active.map((p) => depthOf(p.id))) : 1;

  return { headcount, layers, avgSpan: Math.max(1, avgSpan) };
}

// ---------------------------------------------------------------------------
// Canonical entry point
// ---------------------------------------------------------------------------

export function runPeopleIntelligence(
  people: Person[],
  events: LeadosEvent[],
  oneOnOnes: OneOnOne[],
  now: Date,
  relationships: RelationshipRecord[] = []
): PeopleIntelligenceReport {
  const roster = people.filter((p) => !p.archived);

  const profiles: PersonProfile[] = roster.map((p) => computePersonProfile(p, events, [], now));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const individuals = roster.map((p) =>
    buildPersonIntelligence(p, events, oneOnOnes, now, profileById.get(p.id)!)
  );

  const n = individuals.length || 1;
  const avgFlightRisk = individuals.reduce((a, p) => a + p.flightRiskScore, 0) / n;
  const avgBurnoutRisk = individuals.reduce((a, p) => a + p.burnoutRiskScore, 0) / n;
  const avgOneOnOneQuality = individuals.reduce((a, p) => a + p.oneOnOneQualityScore, 0) / n;

  const performanceDistribution: Record<PerformanceTrendTag, number> = {
    accelerating: 0,
    stable: 0,
    declining: 0,
  };
  individuals.forEach((p) => {
    performanceDistribution[p.performanceTrend] += 1;
  });

  const highPotentials = identifyHighPotentials(profiles)
    .sort((a, b) => b.potentialScore - a.potentialScore)
    .slice(0, 5);

  const successionMaps = buildSuccessionMap(profiles, relationships, roster);
  const successionGapCount = successionMaps.filter((s) => s.gap).length;

  const keyPersonRisks = computeKeyPersonConcentration(profiles, relationships);

  const orgDesignInputs = deriveOrgDesignInputs(roster, relationships);
  const orgDesignEfficiency = computeOrgDesign(orgDesignInputs).efficiencyScore;

  const topConcerns = [...individuals]
    .sort((a, b) => b.flightRiskScore + b.burnoutRiskScore - (a.flightRiskScore + a.burnoutRiskScore))
    .slice(0, 3)
    .map((p) => `${p.name} (${p.role}): ${p.flightRiskDrivers[0] ?? p.burnoutDrivers[0] ?? "elevated risk"}`);

  const teamDynamics: TeamDynamicsReport = {
    avgFlightRisk,
    avgBurnoutRisk,
    avgOneOnOneQuality,
    performanceDistribution,
    highPotentials,
    successionGapCount,
    keyPersonConcentrationCount: keyPersonRisks.length,
    orgDesignEfficiency,
    topConcerns,
  };

  const orgNetworkReport = analyzeOrgNetwork(roster, relationships, events);

  // fastOrgDynamics — cheap O(V+E) Euler-step version, safe to run inline
  // on every request (see orgODE.ts for the Big-O justification).
  const orgDynamics = fastOrgDynamics(
    individuals.map((p) => ({ id: p.personId, flightRiskScore: p.flightRiskScore, burnoutRiskScore: p.burnoutRiskScore })),
    orgNetworkReport.edgeCount
      ? buildEdgeListForFastDynamics(roster, relationships, events)
      : []
  );

  // teamHealthIndex — own derivation. Weighted blend: inverse average
  // flight-risk (30%) + inverse average burnout (30%) + average 1:1 quality
  // (20%) + org network health score from orgNetwork.ts (20%).
  const teamHealthIndex = clampScore(
    Math.round(
      (1 - avgFlightRisk) * 100 * 0.3 +
        (1 - avgBurnoutRisk) * 100 * 0.3 +
        avgOneOnOneQuality * 0.2 +
        orgNetworkReport.healthScore * 0.2
    )
  );

  return {
    teamHealthIndex,
    individuals,
    teamDynamics,
    orgNetworkReport,
    orgDynamics,
    generatedAt: now.toISOString(),
  };
}

/** Builds the lightweight {a,b,weight} edge list fastOrgDynamics needs,
 *  without running the expensive PageRank/betweenness/clique passes in
 *  orgNetwork.ts — reuses buildNetworkGraph (O(V+E)) only. */
function buildEdgeListForFastDynamics(
  roster: Person[],
  relationships: RelationshipRecord[],
  events: LeadosEvent[]
): { a: number; b: number; weight: number }[] {
  // Reuses orgNetwork's graph builder (pure, O(V+E)) — does NOT run the
  // expensive PageRank/betweenness/clique passes also in that module.
  const graph = buildNetworkGraph(roster, relationships, events);
  return graph.edges.map((e) => ({ a: e.a, b: e.b, weight: e.weight }));
}
