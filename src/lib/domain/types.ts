// Canonical domain types shared by the app and platform layers.
// Pure types only — no imports from drizzle, next, or any I/O library.

export interface EventRecord {
  id: number;
  type: string;
  version: number;
  payload: unknown;
  createdAt: string;
}

export interface Finding {
  id: number;
  title: string;
  summary: string;
  impact: number;
  confidence: number;
  effort: number;
  score: number;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: number;
  title: string;
  context: string;
  priorAlpha: number;
  priorBeta: number;
  posteriorAlpha: number;
  posteriorBeta: number;
  beliefMean: number;
  status: "open" | "decided" | "abandoned";
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: number;
  kind: string;
  seed: number;
  trials: number;
  input: unknown;
  result: unknown;
  status: "completed" | "failed";
  createdAt: string;
}

export interface BoardPack {
  id: number;
  periodLabel: string;
  summary: BoardPackSummary;
  createdAt: string;
}

export interface BoardPackSummary {
  generatedAt: string;
  totals: {
    events: number;
    findings: number;
    openFindings: number;
    decisions: number;
    decidedDecisions: number;
    automationRuns: number;
  };
  topFindings: Pick<Finding, "id" | "title" | "score">[];
  recentDecisions: Pick<Decision, "id" | "title" | "beliefMean" | "status">[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}
