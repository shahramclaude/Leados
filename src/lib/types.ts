// Shared types for the Leados sandbox build (original to this workspace).

export type Category =
  | "Workload & Burnout"
  | "Velocity & Delivery"
  | "Financial & Austerity"
  | "Trust & Psychological Safety"
  | "Communication & Information Flow"
  | "Culture & Alignment"
  | "Succession & Continuity"
  | "Compliance & Governance";

export type Severity = "low" | "medium" | "high";

export interface Rule {
  id: string; // "R1".."R144"
  category: Category;
  title: string;
  description: string;
  baseSeverity: Severity;
  anchor?: string; // human label for hand-designated anchor rules
}

export interface Person {
  id: string;
  name: string;
  role: string;
  directReports: number;
  tenureMonths: number;
}

export interface SignalState {
  active: boolean;
  severity: Severity;
  personId?: string;
  recurrence: number; // times this rule has re-triggered (for attractor/pattern detection)
}

export type SignalBoard = Record<string, SignalState>; // ruleId -> state

export interface Finding {
  id: string;
  ruleIds: string[];
  category: Category;
  severity: Severity;
  title: string;
  narrative: string;
  amplified: boolean;
}

export type FeedbackOutcome = "confirmed" | "false_positive";

export interface FeedbackRecord {
  ruleId: string;
  outcome: FeedbackOutcome;
  at: number;
}

export interface IncidentRecord {
  id: string;
  at: number;
  findingId: string;
  category: Category;
  severity: Severity;
  ruleIds: string[];
  note: string;
}

export interface AutonomousLogEntry {
  tick: number;
  at: number;
  newFindings: number;
  escalations: number;
  summary: string;
}

export interface OnboardingState {
  completed: boolean;
  step: number;
  baseline: {
    teamSize: number;
    managerSpan: number;
    teamAgeMonths: number;
    runwayMonths: number;
  };
}

export interface AppState {
  signalBoard: SignalBoard;
  runwayMonths: number;
  feedback: FeedbackRecord[];
  incidents: IncidentRecord[];
  autonomousLog: AutonomousLogEntry[];
  autonomousTick: number;
  onboarding: OnboardingState;
}
