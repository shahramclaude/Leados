// src/lib/talentEngine.ts
//
// NEW MODULE — this is the Part 3 "talentEngine.ts — EXTEND" deliverable.
// No prior talentEngine.ts existed in this checkout (see provenance note
// in src/lib/types.ts), so there were no pre-existing exports to
// preserve; this file is authored directly in its Part-3-complete form:
// a person-profile assembler (the foundational piece the brief assumes
// already existed) plus the three explicitly requested Part 3 additions:
// computeSuccessionRisk, computeTeamChemistry, buildNineBox.
// computeFlightRisk and computeBurnoutRisk are re-exported here (not
// redefined) from src/lib/flightRisk.ts and src/lib/fatigue.ts so callers
// that only know about talentEngine.ts can still reach them.

import type {
  LeadosEvent,
  NineBoxPlacement,
  NineBoxResult,
  OneOnOneRecord,
  OrgNetworkEdge,
  PersonId,
  PersonProfile,
  PersonRecord,
  SuccessionRisk,
  TeamChemistryReport,
  TeamRedFlag,
} from "./types";
import type { ConversationSignals } from "./conversationIntelligence";
import { analyzeOneOnOneNotes, countLearningKeywordHits } from "./conversationIntelligence";
import { computeFlightRisk } from "./flightRisk";
import { computeBurnoutRisk } from "./fatigue";
import { resolveGrowthVelocity, resolvePerformanceScore } from "./performance";
import { computeGenome } from "./genome";
import { computeLifeStage, tenureInMonths } from "./lifeStage";
import { skillOverlap } from "./familiarity";
import { fastOrgDynamics } from "./orgODE";
import { mean, olsSlope } from "./stats";

export { computeFlightRisk } from "./flightRisk";
export { computeBurnoutRisk } from "./fatigue";

// =======================================================================
// Person profile assembly (foundational — feeds every Part 3 feature)
// =======================================================================

export interface BuildPersonProfileInput {
  person: PersonRecord;
  events: LeadosEvent[]; // full event log; filtered internally by personId
  oneOnOnes: OneOnOneRecord[]; // full 1:1 log; filtered internally by personId
  centrality: number; // looked up by the caller from an OrgNetworkReport
}

/**
 * Caller: src/app/api/people/intelligence/route.ts (1 call site, once
 * per person).
 */
export function buildPersonProfile(input: BuildPersonProfileInput): PersonProfile {
  const { person, events, oneOnOnes, centrality } = input;

  const tenureMonths = tenureInMonths(person.startDate);
  const genome = computeGenome(person);
  const lifeStage = computeLifeStage(person, tenureMonths, genome);

  const personOneOnOnes = oneOnOnes
    .filter((o) => o.personId === person.id)
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const last3 = personOneOnOnes.slice(0, 3);
  const conversationSignals: ConversationSignals[] = last3.map((o, idx) =>
    analyzeOneOnOneNotes(
      o.notes,
      last3.slice(idx + 1).map((p) => p.notes)
    )
  );

  const flightRiskResult = computeFlightRisk(person, conversationSignals);
  const burnoutRisk = computeBurnoutRisk(person, events, conversationSignals);
  const performanceScoreResolved = resolvePerformanceScore(person, events);
  const growthVelocityResolved = resolveGrowthVelocity(person, events);
  const promotionReadinessResolved = person.promotionReadiness ?? 50;

  // Potential score: growthVelocity 40% + learningBehaviorFromNotes 30% +
  // promotionReadiness 30%, per the brief's exact weighting.
  const learningHits = last3.reduce((sum, o) => sum + countLearningKeywordHits(o.notes), 0);
  const learningComponent = Math.max(0, Math.min(1, learningHits / 5)) * 100;
  const potentialScore = Math.max(
    0,
    Math.min(
      100,
      growthVelocityResolved * 100 * 0.4 + learningComponent * 0.3 + promotionReadinessResolved * 0.3
    )
  );

  return {
    ...person,
    tenureMonths,
    flightRisk: flightRiskResult.score,
    flightRiskFactors: flightRiskResult.factors,
    burnoutRisk,
    performanceScoreResolved,
    potentialScore,
    growthVelocityResolved,
    promotionReadinessResolved,
    centrality,
    lifeStage,
    conversationSignals,
    lastOneOnOneDate: personOneOnOnes[0]?.date ?? null,
  };
}

// =======================================================================
// Succession risk (Part 3 addition)
// =======================================================================

/**
 * isKeyPerson = centrality > 0.7 OR (skills.length >= 5 AND no other
 * person on the same team has skill overlap >= 0.5). hasSuccessor =
 * someone on the team with skill overlap >= 0.8. Skill overlap = Jaccard
 * similarity — CITATION: src/lib/familiarity.ts, skillOverlap() (which
 * itself cites src/lib/stats.ts, jaccardSimilarity()).
 * Caller: src/app/api/people/intelligence/route.ts (1 call site per
 * person).
 */
export function computeSuccessionRisk(
  person: PersonRecord,
  allPeople: PersonRecord[],
  centralityByPersonId: Map<PersonId, number>
): SuccessionRisk {
  const centrality = centralityByPersonId.get(person.id) ?? 0;

  const teammates = allPeople.filter(
    (p) => p.id !== person.id && p.team === person.team && p.status === "active"
  );

  const overlaps = teammates
    .map((t) => ({ id: t.id, overlap: skillOverlap(person.skills, t.skills), skills: t.skills }))
    .sort((a, b) => b.overlap - a.overlap);

  const noStrongOverlap = !overlaps.some((o) => o.overlap >= 0.5);
  const isKeyPerson = centrality > 0.7 || (person.skills.length >= 5 && noStrongOverlap);

  const successorCandidate = overlaps.find((o) => o.overlap >= 0.8);
  const hasSuccessor = Boolean(successorCandidate);

  const partialCandidates = overlaps.filter((o) => o.overlap >= 0.5);
  const candidateIds = (hasSuccessor ? overlaps.filter((o) => o.overlap >= 0.8) : partialCandidates)
    .slice(0, 3)
    .map((o) => o.id);

  let timeToReadiness: number;
  if (hasSuccessor) timeToReadiness = 0;
  else if (partialCandidates.length > 0) timeToReadiness = 12;
  else timeToReadiness = 24;

  const bestCandidate = overlaps[0];
  const gapSkills = bestCandidate
    ? person.skills.filter((s) => !bestCandidate.skills.includes(s))
    : person.skills.slice();

  let riskScore = 0;
  if (isKeyPerson) riskScore += 60;
  if (!hasSuccessor) riskScore += 40;
  if (isKeyPerson && !hasSuccessor && partialCandidates.length === 0) riskScore = 100;
  riskScore = Math.max(0, Math.min(100, riskScore));

  return {
    personId: person.id,
    isKeyPerson,
    hasSuccessor,
    timeToReadiness,
    riskScore,
    candidateIds,
    gapSkills,
  };
}

// =======================================================================
// Team chemistry (Part 3 addition)
// =======================================================================

/**
 * Signature note: the brief specifies
 * `computeTeamChemistry(teamMembers, recentEvents, conversationSignals)`
 * but also requires cohesionScore to come from orgODE's fastOrgDynamics
 * "for this team's subgraph (filter orgNetwork by team)" — that needs the
 * collaboration edge list, which isn't derivable from the three specified
 * params alone. A 4th parameter (`edges`) is added here, defaulting to
 * an empty array, to satisfy the functional requirement without breaking
 * the 3-arg call shape (edges omitted simply yields a neutral cohesion
 * estimate from fastOrgDynamics' n<=1 path semantics generalized to "no
 * data").
 * Caller: src/app/api/people/intelligence/route.ts (1 call site per team).
 */
export function computeTeamChemistry(
  teamMembers: PersonProfile[],
  recentEvents: LeadosEvent[],
  conversationSignals: Map<PersonId, ConversationSignals[]>,
  edges: OrgNetworkEdge[] = []
): TeamChemistryReport {
  const team = teamMembers[0]?.team ?? "unknown";
  const nodeIds = teamMembers.map((m) => m.id);

  const dynamics = fastOrgDynamics(nodeIds, edges);
  const cohesionScore = dynamics.cohesionScore;

  const pulseEvents = recentEvents.filter(
    (e) => nodeIds.includes(e.personId) && e.type === "pulse" && typeof e.psychologicalSafetyIndex === "number"
  );
  const psychologicalSafetyScore =
    pulseEvents.length > 0
      ? Math.round(mean(pulseEvents.map((e) => e.psychologicalSafetyIndex ?? 0.5)) * 100)
      : 50;

  // --- conflict indicators from conversation 'conflict' flags -----------
  const conflictIndicators: string[] = [];
  for (const member of teamMembers) {
    const signals = conversationSignals.get(member.id) ?? [];
    for (const s of signals) {
      for (const f of s.topicFlags) {
        if (f.type === "conflict" || f.type === "manager_friction") {
          conflictIndicators.push(`${member.name}: ${f.evidence}`);
        }
      }
    }
  }

  // --- dominant topics across the whole team ------------------------------
  const topicCounts = new Map<string, number>();
  for (const member of teamMembers) {
    const signals = conversationSignals.get(member.id) ?? [];
    for (const s of signals) {
      for (const topic of s.uniqueTopics) {
        topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }
    }
  }
  const dominantTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  // --- red flags -----------------------------------------------------------
  const redFlags: TeamRedFlag[] = [];

  const exitClusterMembers = teamMembers.filter((m) => m.flightRisk > 0.5);
  if (exitClusterMembers.length >= 3) {
    redFlags.push({
      type: "exit_cluster",
      description: `${exitClusterMembers.length} people on ${team} show elevated flight risk at the same time.`,
      affectedPersonIds: exitClusterMembers.map((m) => m.id),
    });
  }

  const burnoutClusterMembers = teamMembers.filter((m) => m.burnoutRisk > 0.5);
  if (burnoutClusterMembers.length >= 3) {
    redFlags.push({
      type: "burnout_cluster",
      description: `${burnoutClusterMembers.length} people on ${team} show elevated burnout risk at the same time.`,
      affectedPersonIds: burnoutClusterMembers.map((m) => m.id),
    });
  }

  const compClusterMembers = teamMembers.filter((m) =>
    (conversationSignals.get(m.id) ?? []).some((s) => s.hasCompensationSignal)
  );
  if (compClusterMembers.length >= 3) {
    redFlags.push({
      type: "comp_cluster",
      description: `${compClusterMembers.length} people on ${team} raised compensation frustration recently.`,
      affectedPersonIds: compClusterMembers.map((m) => m.id),
    });
  }

  // dominant_voice / silent_members — UNVERIFIED heuristic (this session):
  // proxy "voice share" using total 1:1 notes word count as a stand-in for
  // meeting airtime, since no literal meeting-transcript data exists.
  const wordShare = teamMembers.map((m) => ({
    id: m.id,
    name: m.name,
    words: (conversationSignals.get(m.id) ?? []).reduce((sum, s) => sum + s.wordsCount, 0),
    hasAnySignal: (conversationSignals.get(m.id) ?? []).length > 0,
  }));
  const totalWords = wordShare.reduce((sum, w) => sum + w.words, 0);
  if (teamMembers.length >= 3 && totalWords > 0) {
    const top = wordShare.slice().sort((a, b) => b.words - a.words)[0];
    if (top.words / totalWords > 0.5) {
      redFlags.push({
        type: "dominant_voice",
        description: `${top.name}'s 1:1 notes account for over half of ${team}'s recorded conversation volume.`,
        affectedPersonIds: [top.id],
      });
    }
  }
  const silent = wordShare.filter((w) => !w.hasAnySignal);
  if (silent.length >= 2) {
    redFlags.push({
      type: "silent_members",
      description: `${silent.length} people on ${team} have no recent 1:1 notes logged.`,
      affectedPersonIds: silent.map((w) => w.id),
    });
  }

  // --- collaboration health from cohesion score -----------------------------
  const collaborationHealth: TeamChemistryReport["collaborationHealth"] =
    cohesionScore >= 75 ? "strong" : cohesionScore >= 50 ? "adequate" : cohesionScore >= 25 ? "fragile" : "broken";

  // --- mood trend via OLS slope of sentiment per member, averaged -----------
  // CITATION: src/lib/stats.ts, olsSlope() (OLS formula cited there).
  const slopes: number[] = [];
  for (const member of teamMembers) {
    const signals = conversationSignals.get(member.id) ?? [];
    if (signals.length < 2) continue;
    const points = signals
      .slice()
      .reverse()
      .map((s, i) => ({ x: i, y: s.sentimentScore }));
    slopes.push(olsSlope(points));
  }
  const avgSlope = slopes.length > 0 ? mean(slopes) : 0;
  const teamMoodTrend: TeamChemistryReport["teamMoodTrend"] =
    avgSlope > 0.03 ? "improving" : avgSlope < -0.03 ? "declining" : "stable";

  return {
    team,
    cohesionScore: Math.round(cohesionScore),
    psychologicalSafetyScore,
    conflictIndicators,
    collaborationHealth,
    teamMoodTrend,
    dominantTopics,
    redFlags,
  };
}

// =======================================================================
// Nine box (Part 3 addition)
// =======================================================================

type Band = "low" | "mid" | "high";

function band(value: number): Band {
  if (value < 40) return "low";
  if (value <= 70) return "mid";
  return "high";
}

const QUADRANT_LABELS: Record<string, string> = {
  "low-low": "Underperformer",
  "mid-low": "Inconsistent Player",
  "high-low": "Trusted Professional",
  "low-mid": "Inconsistent",
  "mid-mid": "Core Performer",
  "high-mid": "High Performer",
  "low-high": "Diamond in the Rough",
  "mid-high": "Rising Star",
  "high-high": "Star",
};

// Keyed as `${performanceBand}-${potentialBand}`. All 9 boxes filled with
// differentiated action text; the four boxes the brief gives verbatim
// text for (Star, High performer/low potential, Core performer, At risk)
// are quoted exactly.
const SUGGESTED_ACTIONS: Record<string, string> = {
  "high-high": "Retention priority. Accelerate promotion track. Assign stretch project.",
  "high-mid": "Value maximizer. Deepen expertise, resist over-promoting.",
  "high-low": "Protect from burnout; recognize consistent delivery without forcing a people-track move.",
  "mid-high": "High-potential — pair with a senior mentor and give a visible cross-team project.",
  "mid-mid": "Develop specific growth path. Monthly coaching on 1-2 skills.",
  "mid-low": "Clarify expectations; identify whether the blocker is skill, scope, or motivation.",
  "low-high": "Investigate root cause — likely a scope or management mismatch masking real potential.",
  "low-mid": "Set a focused 60-day improvement plan with explicit success criteria.",
  "low-low": "30-day performance plan with weekly check-ins.",
};

/**
 * Caller: src/app/api/people/intelligence/route.ts (1 call site).
 */
export function buildNineBox(profiles: PersonProfile[]): NineBoxResult {
  const placements: NineBoxPlacement[] = profiles.map((p) => {
    const perfBand = band(p.performanceScoreResolved);
    const potBand = band(p.potentialScore);
    const box = `${perfBand}-${potBand}`;
    return {
      personId: p.id,
      name: p.name,
      box,
      performanceScore: Math.round(p.performanceScoreResolved),
      potentialScore: Math.round(p.potentialScore),
      quadrantLabel: QUADRANT_LABELS[box] ?? "Core Performer",
      suggestedAction: SUGGESTED_ACTIONS[box] ?? SUGGESTED_ACTIONS["mid-mid"],
    };
  });

  const topRight = placements.filter((p) => p.box === "high-high");
  const bottomLeft = placements.filter((p) => p.box === "low-low");

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const flightRiskInTopRight = topRight.filter((p) => (profileById.get(p.personId)?.flightRisk ?? 0) > 0.5).length;

  const boxCounts = new Map<string, number>();
  for (const p of placements) boxCounts.set(p.box, (boxCounts.get(p.box) ?? 0) + 1);
  let averageBox = "mid-mid";
  let maxCount = -1;
  for (const [box, count] of boxCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      averageBox = box;
    }
  }

  return {
    placements,
    topRightCount: topRight.length,
    bottomLeftCount: bottomLeft.length,
    flightRiskInTopRight,
    averageBox,
  };
}
