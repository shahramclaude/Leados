// =============================================================================
// Part 32 — the executive question ontology (Phase 1, MODEL).
// =============================================================================
// ~20 canonical leadership questions. Each maps to exactly one compiler in
// `answerCompilers.ts`. `isTopFive` marks the 5 questions Phase 0's discovery
// walk identified as what a CEO asks in their first 10 minutes — those are
// the cockpit's first-class, one-click entry points (Phase 2).
import type { Domain } from "./types";

export interface QuestionDef {
  id: string;
  domain: Domain;
  text: string;
  /** Short label for compact UI (cockpit cards, command palette). */
  shortLabel: string;
  isTopFive: boolean;
  /** Plain-language framing used in DailyBrief / speech-ready mode. */
  speechPrompt: string;
}

export const QUESTION_ONTOLOGY: QuestionDef[] = [
  // --- The 5 first-10-minutes questions (Phase 0) -----------------------
  { id: "ops.needsMeToday", domain: "operations", text: "What needs me today?", shortLabel: "Needs me today", isTopFive: true, speechPrompt: "Here is what needs your decision today." },
  { id: "ops.whatChanged", domain: "operations", text: "What changed since I last looked?", shortLabel: "What changed", isTopFive: true, speechPrompt: "Here is what changed since your last visit." },
  { id: "finance.onPlan", domain: "finance", text: "Are we on plan?", shortLabel: "On plan?", isTopFive: true, speechPrompt: "Here is whether we are on plan." },
  { id: "risk.topRisk", domain: "risk", text: "Where is the risk?", shortLabel: "Where's the risk", isTopFive: true, speechPrompt: "Here is where the risk is concentrated." },
  { id: "strategy.recentDecisions", domain: "strategy", text: "What did we decide?", shortLabel: "What we decided", isTopFive: true, speechPrompt: "Here is what we decided recently." },

  // --- Strategy -----------------------------------------------------------
  { id: "strategy.objectivesOffTrack", domain: "strategy", text: "Which objectives are off track?", shortLabel: "Objectives off track", isTopFive: false, speechPrompt: "Here are the objectives that are off track." },
  { id: "strategy.competitivePosition", domain: "strategy", text: "Is our competitive position improving?", shortLabel: "Competitive position", isTopFive: false, speechPrompt: "Here is how our competitive position is moving." },
  { id: "strategy.decisionDebt", domain: "strategy", text: "Which decisions are overdue?", shortLabel: "Overdue decisions", isTopFive: false, speechPrompt: "Here are the decisions that are overdue." },

  // --- Finance --------------------------------------------------------------
  { id: "finance.runway", domain: "finance", text: "What is our runway?", shortLabel: "Runway", isTopFive: false, speechPrompt: "Here is our current runway." },
  { id: "finance.marginTrend", domain: "finance", text: "Where is margin compressing?", shortLabel: "Margin trend", isTopFive: false, speechPrompt: "Here is where margin is compressing." },
  { id: "finance.forecastRange", domain: "finance", text: "What is next month's forecast range?", shortLabel: "Forecast range", isTopFive: false, speechPrompt: "Here is next month's forecast range." },

  // --- People -----------------------------------------------------------
  { id: "people.attritionRisk", domain: "people", text: "Where is attrition risk concentrated?", shortLabel: "Attrition risk", isTopFive: false, speechPrompt: "Here is where attrition risk is concentrated." },
  { id: "people.staffingVsPlan", domain: "people", text: "Are we staffed against plan?", shortLabel: "Staffing vs plan", isTopFive: false, speechPrompt: "Here is staffing against plan." },
  { id: "people.engagementTrend", domain: "people", text: "How is engagement trending?", shortLabel: "Engagement trend", isTopFive: false, speechPrompt: "Here is how engagement is trending." },

  // --- Risk -----------------------------------------------------------------
  { id: "risk.controlFailures", domain: "risk", text: "Which controls failed testing?", shortLabel: "Control failures", isTopFive: false, speechPrompt: "Here are the controls that failed testing." },
  { id: "risk.nearingThreshold", domain: "risk", text: "What risk is nearing its threshold?", shortLabel: "Nearing threshold", isTopFive: false, speechPrompt: "Here is what is nearing its risk threshold." },

  // --- Operations -------------------------------------------------------
  { id: "ops.milestonesOnTrack", domain: "operations", text: "Are we hitting delivery milestones?", shortLabel: "Milestones", isTopFive: false, speechPrompt: "Here is delivery milestone status." },
  { id: "ops.cycleTime", domain: "operations", text: "Is cycle time improving?", shortLabel: "Cycle time", isTopFive: false, speechPrompt: "Here is how cycle time is trending." },

  // --- Market -----------------------------------------------------------
  { id: "market.shareOfVoice", domain: "market", text: "Is our market share of voice moving?", shortLabel: "Share of voice", isTopFive: false, speechPrompt: "Here is how our share of voice is moving." },
  { id: "market.sentiment", domain: "market", text: "What is customer sentiment doing?", shortLabel: "Sentiment", isTopFive: false, speechPrompt: "Here is how customer sentiment is trending." },
  { id: "market.competitorMoves", domain: "market", text: "What are competitors doing?", shortLabel: "Competitor moves", isTopFive: false, speechPrompt: "Here is what competitors are doing." },
];

export const TOP_FIVE = QUESTION_ONTOLOGY.filter((q) => q.isTopFive);

export function questionById(id: string): QuestionDef | undefined {
  return QUESTION_ONTOLOGY.find((q) => q.id === id);
}
