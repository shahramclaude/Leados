// LEADOS — Part 45: Time-allocation truth / strategy-time classifier.
//
// Classifies a meeting's topic text against Part 07's strategy map
// (topic keyword -> pillar + category) to answer: "the calendar says
// you're X% strategic — here's the evidence." Every classification
// carries an explicit confidence score (0..1); callers and UI surfaces
// MUST render it (enforced by the lint check in verify.ts).
//
// METHOD: weighted keyword matching against `te_topic_strategy_map`
// entries, normalized by total matched weight vs. a fallback prior. This
// is intentionally simple and auditable (every classification lists which
// keywords matched) rather than an opaque ML classifier — appropriate
// given the stakes (this feeds a "how strategic are you really" message
// that should not assert false confidence).

import type { StrategyCategory, ClassificationResult } from "./types";

export interface TopicMapEntry {
  topicKeyword: string;
  pillarId: string | null;
  category: StrategyCategory;
  weight: number;
}

const FALLBACK_CATEGORY: StrategyCategory = "operational";
const FALLBACK_CONFIDENCE = 0.3; // low confidence — explicit fallback, not a guess dressed as certainty

export function classifyMeetingTopic(
  eventId: string,
  title: string,
  topic: string,
  isRecurring: boolean,
  topicMap: TopicMapEntry[],
): ClassificationResult {
  const haystack = `${title} ${topic}`.toLowerCase();
  const matches = topicMap.filter((entry) => haystack.includes(entry.topicKeyword.toLowerCase()));

  if (matches.length === 0) {
    // Heuristic fallback: ad-hoc, unrecognized topics skew "reactive";
    // recurring, unrecognized topics skew "operational". Low confidence
    // either way because no keyword evidence exists.
    const category: StrategyCategory = isRecurring ? "operational" : "reactive";
    return {
      eventId,
      category,
      confidence: FALLBACK_CONFIDENCE,
      pillarId: null,
      matchedKeywords: [],
      method: "fallback_heuristic (no keyword match — recurrence-based guess, low confidence)",
    };
  }

  const totalWeight = matches.reduce((acc, m) => acc + m.weight, 0);
  const weightByCategory: Record<StrategyCategory, number> = { strategic: 0, operational: 0, reactive: 0 };
  for (const m of matches) {
    weightByCategory[m.category] += m.weight;
  }

  let winningCategory: StrategyCategory = "operational";
  let winningWeight = -1;
  (Object.keys(weightByCategory) as StrategyCategory[]).forEach((cat) => {
    if (weightByCategory[cat] > winningWeight) {
      winningWeight = weightByCategory[cat];
      winningCategory = cat;
    }
  });

  // Confidence = how dominant the winning category is among matched
  // weight, scaled down slightly when only one keyword matched (thin
  // evidence should not read as high confidence).
  const dominance = totalWeight > 0 ? winningWeight / totalWeight : 0;
  const evidenceStrength = Math.min(1, matches.length / 3);
  const confidence = Math.max(FALLBACK_CONFIDENCE, round2(dominance * (0.6 + 0.4 * evidenceStrength)));

  const pillarMatch = matches.find((m) => m.category === winningCategory && m.pillarId);

  return {
    eventId,
    category: winningCategory,
    confidence,
    pillarId: pillarMatch?.pillarId ?? null,
    matchedKeywords: matches.map((m) => m.topicKeyword),
    method: "keyword_weighted (Part 07 strategy map topic keywords)",
  };
}

export interface StrategyMirrorEvidence {
  eventId: string;
  title: string;
  category: StrategyCategory;
  confidence: number;
  hours: number;
}

export interface StrategyMirrorResult {
  totalHours: number;
  pctByCategory: Record<StrategyCategory, number>;
  avgConfidence: number;
  lowConfidenceShare: number; // fraction of hours classified at < 0.5 confidence
  evidence: StrategyMirrorEvidence[];
  targetStrategicPct: number | null;
  gapVsTargetPct: number | null;
}

export function buildStrategyMirror(
  evidence: StrategyMirrorEvidence[],
  targetStrategicPct: number | null,
): StrategyMirrorResult {
  const totalHours = evidence.reduce((acc, e) => acc + e.hours, 0);
  const hoursByCategory: Record<StrategyCategory, number> = { strategic: 0, operational: 0, reactive: 0 };
  let confidenceWeightedSum = 0;
  let lowConfidenceHours = 0;

  for (const e of evidence) {
    hoursByCategory[e.category] += e.hours;
    confidenceWeightedSum += e.confidence * e.hours;
    if (e.confidence < 0.5) lowConfidenceHours += e.hours;
  }

  const pctByCategory: Record<StrategyCategory, number> = {
    strategic: totalHours > 0 ? round2((hoursByCategory.strategic / totalHours) * 100) : 0,
    operational: totalHours > 0 ? round2((hoursByCategory.operational / totalHours) * 100) : 0,
    reactive: totalHours > 0 ? round2((hoursByCategory.reactive / totalHours) * 100) : 0,
  };

  const avgConfidence = totalHours > 0 ? round2(confidenceWeightedSum / totalHours) : 0;
  const lowConfidenceShare = totalHours > 0 ? round2(lowConfidenceHours / totalHours) : 0;

  return {
    totalHours: round2(totalHours),
    pctByCategory,
    avgConfidence,
    lowConfidenceShare,
    evidence,
    targetStrategicPct,
    gapVsTargetPct:
      targetStrategicPct === null ? null : round2(pctByCategory.strategic - targetStrategicPct),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
