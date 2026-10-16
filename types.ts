/* LeadOS pt-E demo — shared types.
   FABRICATED for this delivery. The real wbweve/Leados repo (verified this
   session, see AI-SESSION-LOG.md) has no `LEADOS` global, no command palette,
   no search, no snooze/dismiss/mute, and no meta.audit array — so none of
   these shapes are "ported", they are fresh TypeScript written to satisfy the
   pt-E brief's own vocabulary. The one shape reused verbatim from the real
   repo is the finding key format `rule + ':' + scope` (verified in
   js/engine.js's `fin()` helper). */

export type Severity = 1 | 2 | 3 | 4 | 5;
export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface Person {
  id: string;
  name: string;
  role: string;
  team: string;
}

export interface LeadEvent {
  id: string;
  seq: number;
  type: string;
  ts: string; // ISO
  domain: string;
  personId?: string;
  data: Record<string, unknown>;
  imported?: boolean;
}

export interface RuleDef {
  id: string; // "R103"
  tag: string; // short title
  domain: string;
  firesWhen: string;
  severityRule: string;
  confidence: Confidence;
  playbook: string | null;
  resolvesWhen: string;
  dismissible: boolean;
  settingsKeys: string[];
  wired: boolean; // has live detection logic in this demo
}

export interface Finding {
  key: string; // rule:scope
  rule: string;
  scope: string;
  title: string;
  basis: string[];
  domain: string;
  sev: Severity;
  conf: Confidence;
  play: string | null;
  refs: string[]; // personIds or entity ids referenced
  eventIds: string[];
  smartRank?: number;
}

export interface PlaybookDef {
  id: string;
  title: string;
  domain: string;
  forRules: string[];
  forWhat: string;
}

export interface AuditEntry {
  seq: number;
  ts: string;
  action: string;
  detail: Record<string, unknown>;
}

export interface FindingHistoryEvent {
  ts: string;
  action: "appeared" | "snoozed" | "dismissed" | "played" | "resolved" | "re-appeared";
  note?: string;
}

export interface Settings {
  grossMarginFloorPct: number;
  cadenceDays: number;
  oneOnOneCadenceDays: number;
  complianceAuditCadenceDays: number;
  okrCheckInCadenceDays: number;
  decisionMaxOpenDays: number;
  [k: string]: number;
}

export interface Meta {
  createdAt: string;
  mutedRules: { rule: string; reason: string; ts: string }[];
  snoozed: Record<string, { until: string }>;
  dismissed: Record<string, { ts: string }>;
  settings: Settings;
  audit: AuditEntry[];
  auditSeq: number;
  lastEventSeq: number;
  theme: "light" | "dark";
}

export interface Store {
  schemaVersion: number;
  lineage: string;
  meta: Meta;
  people: Person[];
  events: LeadEvent[];
}

export interface SearchItemBase {
  score: number;
  _text: string;
}

export interface FindingItem extends SearchItemBase {
  type: "finding";
  key: string;
  rule: string;
  title: string;
  basis: string[];
  domain: string;
  sev: Severity;
  people: string[];
}

export interface PersonItem extends SearchItemBase {
  type: "person";
  id: string;
  name: string;
  role: string;
}

export interface EventItem extends SearchItemBase {
  type: "event";
  id: string;
  eventType: string;
  ts: string;
}

export interface PlaybookItem extends SearchItemBase {
  type: "playbook";
  id: string;
  title: string;
  forWhat: string;
}

export interface RuleItem extends SearchItemBase {
  type: "rule";
  id: string;
  tag: string;
  params: string;
}

export interface DomainItem extends SearchItemBase {
  type: "domain";
  name: string;
  findingCount: number;
  topSev: number;
}

export type SearchItem =
  | FindingItem
  | PersonItem
  | EventItem
  | PlaybookItem
  | RuleItem
  | DomainItem;
