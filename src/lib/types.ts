// src/lib/types.ts
// Shared types for the pt-M "Inference Chain Engine" sandbox.
// Original to this delivery — see AI-SESSION-LOG.md for what was verified
// against github.com/wbweve/Leados vs. what is fresh code written only to
// make the pasted pt-M "Part 1" brief runnable.

export type Category = "People" | "Revenue" | "Engineering" | "Crisis" | "Strategy";

export interface Rule {
  id: string; // e.g. "R1" — IDs reused from the pasted brief so its named
              // scenarios (R1, R3, R10, R19, R73, R104...) are explorable.
  name: string;
  category: Category;
  severity: number; // 1..5, fabricated-but-disclosed scale
  description: string;
  /** If true, this rule accumulates occurrences (e.g. "missed 1:1s count")
   *  instead of being a plain on/off toggle. */
  counter?: boolean;
  counterLabel?: string;
}

export interface SignalEntry {
  active: boolean;
  occurrences?: number;
}

export type SignalState = Record<string, SignalEntry>;

export interface Finding {
  rule: string;
  severity: number;
}

export interface AppState {
  signals: SignalState;
  crisisCount: number;
  /** ISO date strings (YYYY-MM-DD), one per historical attrition event,
   *  used only by the temporal inference pattern (INF-005). */
  attritionLog: string[];
}

export interface ForwardConclusion {
  id: string;
  severity: number;
  title: string;
  body: string;
  confidence: number;
  confLabel: string;
  intervention: string;
}

export interface ForwardPattern {
  id: string;
  name: string;
  pattern: "FORWARD";
  premiseLabels: string[];
  premises: Array<
    | { type: "FINDING"; rule: string; op: "active" | "inactive"; threshold?: number }
    | { type: "METRIC"; metric: "crisisCount"; op: "gte" | "lte"; value: number }
  >;
  conclusion: ForwardConclusion;
}

export interface Hypothesis {
  name: string;
  evidenceFor: Array<{ rule: string; op: "active" }>;
  evidenceAgainst: Array<{ rule: string; op: "inactive" }>;
  explanation: string;
  intervention: string;
}

export interface ScoredHypothesis extends Hypothesis {
  forScore: number;
  againstScore: number;
  netScore: number;
}

export interface BackwardPattern {
  id: string;
  name: string;
  pattern: "BACKWARD";
  observation: { rule: string };
  hypotheses: Hypothesis[];
  label: string;
}
