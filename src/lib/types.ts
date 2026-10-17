// types.ts — shared data model for this build.
// ORIGINAL to this session. Not copied from wbweve/Leados: that repo's own
// src/lib/types.ts was not fetched byte-for-byte this session (out of scope,
// disclosed in AI-SESSION-LOG.md). Shape below is designed from scratch to
// support the four pt-N modules (docs, institutionalMemory, selfImprove,
// onboarding) against a small original rule engine — it does not claim to
// match any verified prior schema.

export type EventType =
  | 'oneonone.logged'
  | 'skip.logged'
  | 'decision.made'
  | 'decision.outcome'
  | 'crisis.logged'
  | 'crisis.postmortem'
  | 'reflection.logged'
  | 'goal.set'
  | 'feedback.logged'
  | 'playbook.completed';

export const KNOWN_EVENT_TYPES: EventType[] = [
  'oneonone.logged',
  'skip.logged',
  'decision.made',
  'decision.outcome',
  'crisis.logged',
  'crisis.postmortem',
  'reflection.logged',
  'goal.set',
  'feedback.logged',
  'playbook.completed',
];

export interface Person {
  id: string;
  name: string;
  role: string;
  reportsTo?: string | null;
}

export interface AppEvent {
  id: string;
  ts: string; // ISO timestamp
  type: EventType;
  personId?: string;
  data: Record<string, any>;
}

export interface AuditEntry {
  ts: string;
  action: string;
  ref?: string;
}

export interface Settings {
  cadenceDays: number; // target days between 1:1s
  skipDays: number; // target days between skip-levels
  decisionMaxOpenDays: number; // days before an open decision is "stale"
  crisisPostmortemDays: number; // days before an unreviewed crisis is flagged
}

export interface DismissEntry {
  key: string;
  ts: string;
  mode: 'snooze' | 'dismiss';
}

export interface AppState {
  people: Person[];
  events: AppEvent[];
  audit: AuditEntry[];
  settings: Settings;
  dismissed: DismissEntry[];
  sessionStartedAt: string;
}

export type Confidence = 'low' | 'med' | 'high';

export const CONF_FACTOR: Record<Confidence, number> = { low: 0.5, med: 0.75, high: 1 };

export interface RuleDef {
  id: string;
  title: string;
  domain: 'cadence' | 'decisions' | 'crisis' | 'goals';
  params: string; // human-readable description of firing condition
  playbook?: string; // playbook id, absent = disclosed no-playbook rule
  baseSev: number;
}

export interface Finding {
  key: string;
  rule: string;
  title: string;
  sev: number;
  conf: Confidence;
  score: number;
  sources: string[]; // event ids
  basis: string[]; // human-readable evidence strings
  play?: string;
  personId?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  cadenceDays: 14,
  skipDays: 60,
  decisionMaxOpenDays: 21,
  crisisPostmortemDays: 14,
};

export const STORAGE_KEY = 'leados-ptn:v1';
