// src/lib/conversationIntelligence.ts
//
// NEW MODULE — Part 3 deliverable #1. No LLM; pure keyword/heuristic
// scoring over free-text 1:1 notes, per the brief's exact keyword lists
// and thresholds. All thresholds below are UNVERIFIED (original heuristic
// authored this session) except where the brief itself dictated the exact
// number (those are quoted inline).

export type TopicFlagType =
  | "flight_risk"
  | "burnout"
  | "conflict"
  | "career_block"
  | "comp_frustration"
  | "recognition_gap"
  | "scope_mismatch"
  | "manager_friction"
  | "growth_opportunity";

export interface TopicFlag {
  type: TopicFlagType;
  evidence: string;
  severity: 1 | 2 | 3;
}

export type EnergyLevel = "high" | "medium" | "low" | "unknown";

export interface ConversationSignals {
  topicFlags: TopicFlag[];
  energyLevel: EnergyLevel;
  sentimentScore: number; // -1 to 1
  hasClearActionItems: boolean;
  hasCareerConversation: boolean;
  hasCompensationSignal: boolean;
  hasExitSignal: boolean;
  notesQualityScore: number; // 0-100
  wordsCount: number;
  uniqueTopics: string[];
}

// --- Keyword tables, taken verbatim from the brief --------------------

const POSITIVE_KEYWORDS = [
  "excited",
  "energized",
  "thrilled",
  "proud",
  "motivated",
  "progress",
  "accomplished",
  "growing",
  "opportunity",
  "love this",
  "enjoying",
  "great team",
  "learning fast",
  "crushing it",
  "momentum",
  "clarity",
  "support",
  "aligned",
];

const NEGATIVE_KEYWORDS = [
  "frustrated",
  "exhausted",
  "overwhelmed",
  "unclear",
  "blocked",
  "ignored",
  "undervalued",
  "overlooked",
  "stressed",
  "burnt",
  "leaving",
  "offer",
  "interview",
  "underpaid",
  "not recognized",
  "stuck",
  "no growth",
  "toxic",
  "micromanaged",
  "politics",
  "checking out",
];

const EXIT_SIGNAL_KEYWORDS = [
  "looking at",
  "considering",
  "recruiter",
  "reached out",
  "other opportunity",
  "thinking about leaving",
  "offer from",
  "competitive offer",
  "my last",
  "moving on",
  "resign",
  "notice",
  "job search",
];

const COMP_FRUSTRATION_KEYWORDS = [
  "underpaid",
  "market rate",
  "competitors pay",
  "deserve more",
  "comp review",
  "equity",
  "below market",
  "not fairly",
];

const BURNOUT_KEYWORDS = [
  "exhausted",
  "burned out",
  "can't keep up",
  "no time",
  "overloaded",
  "never off",
  "weekends",
  "can't sleep",
  "too much",
  "overwhelmed",
  "stretched thin",
  "not sustainable",
];

// Supplementary keyword tables for topic flags not fully enumerated by the
// brief's three explicit lists above. These are UNVERIFIED (original
// heuristic authored this session) best-effort keyword sets so the other
// six TopicFlag types in the brief's union are reachable.
const CONFLICT_KEYWORDS = ["conflict", "disagreement", "argument", "tension", "clash"];
const CAREER_BLOCK_KEYWORDS = ["no path", "no growth", "stuck", "stalled", "can't get promoted", "plateau"];
const RECOGNITION_GAP_KEYWORDS = ["not recognized", "overlooked", "undervalued", "no credit", "unnoticed"];
const SCOPE_MISMATCH_KEYWORDS = ["not my job", "out of scope", "wrong fit", "misaligned role", "bored"];
const MANAGER_FRICTION_KEYWORDS = ["micromanaged", "no support from manager", "manager doesn't", "disagree with manager"];
const GROWTH_OPPORTUNITY_KEYWORDS = ["learning fast", "new skill", "stretch project", "mentor", "promotion track"];
const CAREER_CONVERSATION_KEYWORDS = ["career", "promotion", "growth path", "next level", "development plan"];
const ACTION_ITEM_KEYWORDS = ["action item", "will follow up", "next step", "by friday", "todo", "to-do", "i will", "they will"];
const LEARNING_KEYWORDS = ["learning", "course", "studying", "read", "training"];

const HIGH_ENERGY_KEYWORDS = ["excited", "energized", "thrilled", "crushing it", "momentum", "motivated"];
const LOW_ENERGY_KEYWORDS = ["exhausted", "tired", "drained", "burnt", "flat", "checking out", "disengaged"];

function countMatches(text: string, keywords: string[]): { count: number; hits: string[] } {
  let count = 0;
  const hits: string[] = [];
  for (const kw of keywords) {
    if (text.includes(kw)) {
      count += 1;
      hits.push(kw);
    }
  }
  return { count, hits };
}

function excerptAround(original: string, keyword: string): string {
  const idx = original.toLowerCase().indexOf(keyword);
  if (idx === -1) return keyword;
  const start = Math.max(0, idx - 30);
  const end = Math.min(original.length, idx + keyword.length + 30);
  return `...${original.slice(start, end).trim()}...`;
}

export function analyzeOneOnOneNotes(
  notes: string,
  previousNotes: string[] = []
): ConversationSignals {
  const text = (notes || "").toLowerCase();
  const wordsCount = (notes || "").trim().length === 0 ? 0 : notes.trim().split(/\s+/).length;

  // --- Sentiment: +0.1 per positive keyword (max +0.5), -0.1 per negative
  // keyword (max -0.5). Brief's exact model. ---------------------------
  const posMatches = countMatches(text, POSITIVE_KEYWORDS);
  const negMatches = countMatches(text, NEGATIVE_KEYWORDS);
  const positiveContribution = Math.min(0.5, posMatches.count * 0.1);
  const negativeContribution = Math.min(0.5, negMatches.count * 0.1);
  const sentimentScore = Math.max(-1, Math.min(1, positiveContribution - negativeContribution));

  const topicFlags: TopicFlag[] = [];

  // --- Exit signal ------------------------------------------------------
  const exitMatches = countMatches(text, EXIT_SIGNAL_KEYWORDS);
  const hasExitSignal = exitMatches.count > 0;
  if (hasExitSignal) {
    topicFlags.push({
      type: "flight_risk",
      evidence: excerptAround(notes, exitMatches.hits[0]),
      severity: 3,
    });
  }

  // --- Compensation frustration ------------------------------------------
  const compMatches = countMatches(text, COMP_FRUSTRATION_KEYWORDS);
  const hasCompensationSignal = compMatches.count > 0;
  if (hasCompensationSignal) {
    topicFlags.push({
      type: "comp_frustration",
      evidence: excerptAround(notes, compMatches.hits[0]),
      severity: 2,
    });
  }

  // --- Burnout: severity scales with match count -------------------------
  const burnoutMatches = countMatches(text, BURNOUT_KEYWORDS);
  if (burnoutMatches.count > 0) {
    const severity: 1 | 2 | 3 = burnoutMatches.count >= 3 ? 3 : burnoutMatches.count === 2 ? 2 : 1;
    topicFlags.push({
      type: "burnout",
      evidence: excerptAround(notes, burnoutMatches.hits[0]),
      severity,
    });
  }

  // --- Supplementary topic flags (UNVERIFIED heuristic, this session) ----
  const conflictMatches = countMatches(text, CONFLICT_KEYWORDS);
  if (conflictMatches.count > 0) {
    topicFlags.push({ type: "conflict", evidence: excerptAround(notes, conflictMatches.hits[0]), severity: conflictMatches.count >= 2 ? 2 : 1 });
  }
  const careerBlockMatches = countMatches(text, CAREER_BLOCK_KEYWORDS);
  if (careerBlockMatches.count > 0) {
    topicFlags.push({ type: "career_block", evidence: excerptAround(notes, careerBlockMatches.hits[0]), severity: careerBlockMatches.count >= 2 ? 2 : 1 });
  }
  const recognitionMatches = countMatches(text, RECOGNITION_GAP_KEYWORDS);
  if (recognitionMatches.count > 0) {
    topicFlags.push({ type: "recognition_gap", evidence: excerptAround(notes, recognitionMatches.hits[0]), severity: recognitionMatches.count >= 2 ? 2 : 1 });
  }
  const scopeMatches = countMatches(text, SCOPE_MISMATCH_KEYWORDS);
  if (scopeMatches.count > 0) {
    topicFlags.push({ type: "scope_mismatch", evidence: excerptAround(notes, scopeMatches.hits[0]), severity: 1 });
  }
  const managerFrictionMatches = countMatches(text, MANAGER_FRICTION_KEYWORDS);
  if (managerFrictionMatches.count > 0) {
    topicFlags.push({ type: "manager_friction", evidence: excerptAround(notes, managerFrictionMatches.hits[0]), severity: 2 });
  }
  const growthMatches = countMatches(text, GROWTH_OPPORTUNITY_KEYWORDS);
  if (growthMatches.count > 0) {
    topicFlags.push({ type: "growth_opportunity", evidence: excerptAround(notes, growthMatches.hits[0]), severity: 1 });
  }

  // --- Career conversation / action items ---------------------------------
  const hasCareerConversation = countMatches(text, CAREER_CONVERSATION_KEYWORDS).count > 0;
  const hasClearActionItems = countMatches(text, ACTION_ITEM_KEYWORDS).count > 0;

  // --- Energy level (UNVERIFIED heuristic, this session) -------------------
  const highEnergy = countMatches(text, HIGH_ENERGY_KEYWORDS).count;
  const lowEnergy = countMatches(text, LOW_ENERGY_KEYWORDS).count;
  let energyLevel: EnergyLevel = "unknown";
  if (wordsCount > 0) {
    if (highEnergy > lowEnergy && highEnergy > 0) energyLevel = "high";
    else if (lowEnergy > highEnergy && lowEnergy > 0) energyLevel = "low";
    else energyLevel = "medium";
  }

  // --- Unique topics: dedupe the flag types + career/learning mentions ----
  const uniqueTopics = Array.from(
    new Set([
      ...topicFlags.map((f) => f.type as string),
      ...(hasCareerConversation ? ["career_conversation"] : []),
      ...(countMatches(text, LEARNING_KEYWORDS).count > 0 ? ["learning"] : []),
    ])
  );

  // --- Notes quality score, per brief's exact bands ------------------------
  let notesQualityScore: number;
  if (wordsCount < 50) notesQualityScore = 10;
  else if (wordsCount <= 150) notesQualityScore = 40;
  else if (wordsCount <= 400) notesQualityScore = 70;
  else notesQualityScore = 90;

  if (hasCareerConversation) notesQualityScore += 5;
  if (hasClearActionItems) notesQualityScore += 5;
  notesQualityScore += Math.min(15, topicFlags.length * 3);
  notesQualityScore = Math.max(0, Math.min(100, notesQualityScore));

  // previousNotes is accepted per the brief's signature for future trend
  // widening (e.g. recurring-topic detection); current heuristic doesn't
  // need it beyond keeping the API shape stable, so it's intentionally
  // unused beyond this acknowledgement comment.
  void previousNotes;

  return {
    topicFlags,
    energyLevel,
    sentimentScore,
    hasClearActionItems,
    hasCareerConversation,
    hasCompensationSignal,
    hasExitSignal,
    notesQualityScore,
    wordsCount,
    uniqueTopics,
  };
}

/** Count of "learning behavior" keyword hits in a note, used by
 * talentEngine.ts's potential-score model (learningBehaviorFromNotes,
 * weighted 30%). Exported separately so talentEngine doesn't need to
 * re-implement the keyword list. */
export function countLearningKeywordHits(notes: string): number {
  return countMatches((notes || "").toLowerCase(), LEARNING_KEYWORDS).count;
}
