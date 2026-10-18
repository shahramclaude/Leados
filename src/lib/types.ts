// Shared types for the LEADOS pt-U sandbox (Talent / Financial OS / Regulatory /
// Narrative / Org-Physics). Original to this delivery — see AI-SESSION-LOG.md.

export type Person = {
  id: string;
  name: string;
  role: string;
  title: string;
  isDirect: boolean;
  archived?: boolean;
};

export type EventType =
  | "talent.succession.candidate"
  | "talent.capability.assessment"
  | "talent.headcount.plan"
  | "talent.calibration.session"
  | "fin.metric"
  | "sales.deal.closed"
  | "cs.churn.logged"
  | "reg.jurisdiction"
  | "reg.interpretation"
  | "legal.compliance.check"
  | "narrative.outcome"
  | "pulse.recorded"
  | "conflict.logged"
  | "conflict.resolved";

export type Evt = {
  id: string;
  ts: string; // ISO date
  type: EventType;
  data: Record<string, any>;
};

export type AppState = {
  people: Person[];
  events: Evt[];
};

export type Finding = {
  rule: string;
  sev: 1 | 2 | 3 | 4 | 5;
  title: string;
  detail: string;
};
