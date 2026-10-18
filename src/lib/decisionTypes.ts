// Shared type definitions for the Decision Intelligence module.
// Kept in their own file (rather than inside schema.ts or decisionEngine.ts)
// so that both the Drizzle schema (for jsonb typing) and the engine/UI code
// can import them without creating circular module dependencies.

/** A single candidate option attached to a decision. */
export interface DecisionOption {
  id: string;
  label: string;
  description: string;
  /** Relative cost of pursuing this option, 0 (free) - 10 (very costly). */
  cost: number;
  /** Expected positive impact if this option succeeds, 0 - 10. */
  impact: number;
  /** How easy it would be to reverse this option later, 0 (irreversible) - 10 (trivial). */
  reversibility: number;
  /** How quickly this option can be executed, 0 (very slow) - 10 (immediate). */
  speed: number;
  /** Inherent risk / uncertainty of this option, 0 (safe) - 10 (very risky). */
  risk: number;
  createdAt: string;
}

/** Free-form extra data attached to a decision. */
export interface DecisionOutcomeMetric {
  metric: string;
  expected: number;
  actual: number;
}

export interface DecisionData {
  ownerName?: string;
  stakeholderNames?: string[];
  tags?: string[];
  notes?: string;
  outcomeMetrics?: DecisionOutcomeMetric[];
}

export type DecisionStatus = "open" | "decided" | "reversed" | "archived";
