// src/lib/decisionTypes.ts
// Core decision model shared across the Leados strategic layer.
// (Part 1-3 prerequisite — authored here because it did not yet exist
// in this environment's checkout of the repo.)

export type DecisionDomain =
  | 'revenue'
  | 'product'
  | 'people'
  | 'capital'
  | 'gtm'
  | 'operations';

export type DecisionStatus = 'proposed' | 'approved' | 'rejected' | 'deferred' | 'executed';

export interface Decision {
  id: string;
  title: string;
  domain: DecisionDomain;
  status: DecisionStatus;
  /** 1 (low) - 5 (critical) strategic impact if acted on */
  impact: number;
  /** 0-1 model confidence that the recommended option is correct */
  confidence: number;
  /** ISO date string — when a call must be made */
  deadline: string;
  options: string[];
  recommendation?: string;
  description?: string;
  stakes?: string;
  /** rough dollar value at stake, used by realOptions.ts */
  estimatedValue?: number;
}

export interface CascadeRisk {
  /** probability (0-1) that a negative outcome cascades into adjacent domains */
  p: number;
  description: string;
}
