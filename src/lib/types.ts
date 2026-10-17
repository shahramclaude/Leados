// Shared types for the LEADOS-style sandbox.
// Original to this delivery — see AI-SESSION-LOG.md for what was verified
// against github.com/wbweve/Leados before any of this was written.

export const CATEGORIES = [
  "People",
  "Finance",
  "Delivery",
  "Strategy",
  "Legal",
  "Product",
  "Culture",
  "Security",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Severity = 1 | 2 | 3 | 4; // 1 low ... 4 critical

export interface Rule {
  id: string; // e.g. "R7"
  category: Category;
  label: string;
  description: string;
  defaultSeverity: Severity;
}

export interface Person {
  id: string;
  name: string;
  role: string;
}

export interface Finding {
  ruleId: string;
  category: Category;
  label: string;
  severity: Severity;
  personId?: string;
  recurrence: number; // how many times "simulated recurrence" was triggered
  ts: number;
}

export interface EventLogEntry {
  id: string;
  ts: number;
  personId: string;
  type: string; // synthetic event type, e.g. "commit", "message", "meeting", "review"
}

export interface AppState {
  activeRuleIds: string[]; // which of the 50 rules are toggled on
  severityOverrides: Record<string, Severity>;
  personLinks: Record<string, string>; // ruleId -> personId
  recurrence: Record<string, number>; // ruleId -> simulated recurrence count
  runwayMonths: number;
  events: EventLogEntry[];
  roster: Person[];
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Critical",
};

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 8,
};
