// LEADOS pt-D — shared types for the automation demo.
//
// UNVERIFIED-BY-CONSTRUCTION NOTE (read this before trusting any shape below):
// This file is a fresh implementation of the pt-D brief's data shapes, not a
// port of real LeadOS internals. The *only* pieces of this module that are
// backed by a verified read of github.com/wbweve/Leados (main, inspected this
// session) are:
//   - `prefill(ctx, P) -> {ok, kind, title, facts[], suggest{}, missing[]}` —
//     verified verbatim in the real playbooks.js header comment.
//   - append-only event shape `{ id, at, type, payload }` with a running
//     sequence — verified in the real store.js (`appendRaw`, `padId`).
//   - finding `key = rule + ':' + scope` — verified in the real engine.js.
//   - `insight.acknowledged` as the real suppression event (the brief's
//     "snoozed/dismissed" vocabulary does not appear in the real source —
//     see AI-SESSION-LOG.md §2 for the full diff).
// Everything else here (Person fields, the specific event-type vocabulary
// used by the bundles, Settings keys) is demo scaffolding, built to exercise
// every capability the pt-D brief describes. See README.md "What this is /
// isn't" and AI-SESSION-LOG.md for the full disclosure.

export type ISODate = string;

export interface LeadEvent {
  id: string; // e-00001 style, verified format from the real store.js padId()
  seq: number;
  at: number; // epoch ms
  type: string;
  payload: Record<string, unknown>;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  reportsTo?: string | null; // verified concept name (engine.js rosterById), demo values
  archived?: boolean;
  cadenceDays?: number; // demo-only per-person 1:1 cadence setting
}

export interface AuditEntry {
  id: string;
  at: number;
  action: string; // e.g. 'auto-maintenance', 'event.undone', 'export', 'suppression.cleared'
  message: string;
  system?: boolean; // true = "⚙ SYSTEM REMINDER — not a leadership finding" class
}

export interface SuppressedFinding {
  key: string; // AUTO:R1:cadence-drift:[personId] style, or R-rule keys
  reason: "snoozed" | "dismissed";
  at: number;
  /** demo bookkeeping: does the entity this key references still exist? */
  entityAlive: boolean;
}

export interface Finding {
  key: string;
  rule: string;
  sev: number; // 1 (nudge) .. 4
  conf: "low" | "medium" | "high";
  title: string;
  basis: string;
  personId?: string | null;
  play?: string | null; // playbook id, or null for direct-link system findings
  system?: boolean;
}

export interface Settings {
  [key: string]: number;
}

export interface Store {
  schemaVersion: number;
  lineage: string;
  createdAt: number;
  idSeq: number;
  people: Person[];
  events: LeadEvent[];
  settings: Settings;
  audit: AuditEntry[];
  suppressed: SuppressedFinding[];
  /** session guard so runMaintenance() only runs once per session, per the brief */
  maintenanceRanAt: number | null;
}

export interface SmartPrefillResult {
  ok: boolean;
  kind: string;
  title: string;
  facts: string[];
  suggest: Record<string, { value: unknown; recommended: true; source: string }>;
  missing: string[];
  warnings: string[];
}
