// Persistence + mutation layer for the pt-E demo.
// Reuses, as a doctrine (not literal code), the real repo's verified pattern
// of "exactly one localStorage key, append-only events, nothing derived is
// persisted" (js/store.js header, verified this session) — but uses a
// DISTINCT key so this demo can never collide with a real LeadOS install
// served from the same origin.

import type { AuditEntry, LeadEvent, Meta, Store } from "../types";
import { buildSeedEvents, PEOPLE } from "../data/seed";
import { DEFAULT_SETTINGS } from "../data/catalog";
import { iso, uid } from "./utils";

export const STORAGE_KEY = "leados-pte-demo:data";
export const SCHEMA_VERSION = 1; // this demo's own schema line — not the real repo's (verified real schemaVersion is 5)

type Listener = () => void;
const listeners = new Set<Listener>();
let current: Store = loadOrSeed();
let lastUndo: { event: LeadEvent; expiresAt: number } | null = null;

function freshMeta(): Meta {
  return {
    createdAt: iso(new Date()),
    mutedRules: [],
    snoozed: {},
    dismissed: {},
    settings: { ...DEFAULT_SETTINGS },
    audit: [],
    auditSeq: 0,
    lastEventSeq: 0,
    theme: "light",
  };
}

function seedStore(): Store {
  const today = new Date();
  const events = buildSeedEvents(today);
  const meta = freshMeta();
  meta.lastEventSeq = events.length;
  // Pre-mute R50 so the global-mute capability has a concrete example (per
  // brief's own worked example: "R50 ... becomes noise once mapped").
  meta.mutedRules.push({ rule: "R50", reason: "muted on seed load from demo bootstrap", ts: iso(today) });
  const store: Store = {
    schemaVersion: SCHEMA_VERSION,
    lineage: "pt-E-demo",
    meta,
    people: PEOPLE,
    events,
  };
  // seed a plausible audit trail for the past 30 days so Audit Intelligence has data
  store.meta.audit = synthesizeAuditLog(events);
  store.meta.auditSeq = store.meta.audit.length;
  return store;
}

function synthesizeAuditLog(events: LeadEvent[]): AuditEntry[] {
  let seq = 0;
  const out: AuditEntry[] = events.map((e) => ({
    seq: ++seq,
    ts: e.ts,
    action: "event:" + e.type,
    detail: { eventId: e.id, domain: e.domain },
  }));
  return out;
}

function loadOrSeed(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (parsed && parsed.events && parsed.meta) return parsed;
    }
  } catch {
    /* corrupt/unavailable storage -> fall through to reseed */
  }
  const s = seedStore();
  persist(s);
  return s;
}

function persist(s: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota or unavailable — demo stays in-memory only for this tab */
  }
}

function notify() {
  listeners.forEach((l) => l());
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getStore(): Store {
  return current;
}

function commit(next: Store) {
  current = next;
  persist(current);
  notify();
}

function pushAudit(s: Store, action: string, detail: Record<string, unknown>): Store {
  const entry: AuditEntry = { seq: s.meta.auditSeq + 1, ts: iso(new Date()), action, detail };
  const audit = [...s.meta.audit, entry].slice(-2000);
  return { ...s, meta: { ...s.meta, audit, auditSeq: entry.seq } };
}

export function appendEvent(input: {
  type: string;
  domain: string;
  data: Record<string, unknown>;
  personId?: string;
  imported?: boolean;
}): LeadEvent {
  const s = current;
  const event: LeadEvent = {
    id: uid("e"),
    seq: s.meta.lastEventSeq + 1,
    type: input.type,
    domain: input.domain,
    ts: iso(new Date()),
    personId: input.personId,
    data: input.data,
    imported: input.imported,
  };
  let next: Store = {
    ...s,
    events: [...s.events, event],
    meta: { ...s.meta, lastEventSeq: event.seq },
  };
  next = pushAudit(next, "event:" + input.type, { eventId: event.id, domain: input.domain });
  commit(next);
  lastUndo = { event, expiresAt: Date.now() + 60_000 };
  return event;
}

export function canUndo(): boolean {
  return !!lastUndo && lastUndo.expiresAt > Date.now();
}

export function undoLast(): boolean {
  if (!canUndo() || !lastUndo) return false;
  const id = lastUndo.event.id;
  let next: Store = { ...current, events: current.events.filter((e) => e.id !== id) };
  next = pushAudit(next, "event.undone", { eventId: id });
  commit(next);
  lastUndo = null;
  return true;
}

export function muteRule(rule: string, reason: string) {
  const s = current;
  if (s.meta.mutedRules.some((m) => m.rule === rule)) return;
  let next: Store = {
    ...s,
    meta: { ...s.meta, mutedRules: [...s.meta.mutedRules, { rule, reason, ts: iso(new Date()) }] },
  };
  next = pushAudit(next, "rule.muted", { rule, reason });
  commit(next);
}

export function unmuteRule(rule: string) {
  const s = current;
  let next: Store = { ...s, meta: { ...s.meta, mutedRules: s.meta.mutedRules.filter((m) => m.rule !== rule) } };
  next = pushAudit(next, "rule.unmuted", { rule });
  commit(next);
}

export function snoozeFinding(key: string, days: number) {
  const s = current;
  const until = iso(new Date(Date.now() + days * 86400000));
  let next: Store = { ...s, meta: { ...s.meta, snoozed: { ...s.meta.snoozed, [key]: { until } } } };
  next = pushAudit(next, "finding.snoozed", { key, until });
  commit(next);
}

export function dismissFinding(key: string) {
  const s = current;
  let next: Store = { ...s, meta: { ...s.meta, dismissed: { ...s.meta.dismissed, [key]: { ts: iso(new Date()) } } } };
  next = pushAudit(next, "finding.dismissed", { key });
  commit(next);
}

export function logPlaybookCompleted(playbookId: string, key?: string) {
  const s = current;
  let next: Store = pushAudit(s, "playbook.completed", { playbookId, key });
  commit(next);
}

export function updateSetting(key: string, value: number) {
  const s = current;
  let next: Store = { ...s, meta: { ...s.meta, settings: { ...s.meta.settings, [key]: value } } };
  next = pushAudit(next, "settings.changed", { key, value });
  commit(next);
}

export function setTheme(theme: "light" | "dark") {
  const s = current;
  let next: Store = { ...s, meta: { ...s.meta, theme } };
  next = pushAudit(next, "theme.changed", { theme });
  commit(next);
}

export function resetAndReseed() {
  let next = seedStore();
  next = pushAudit(next, "store.purged", {});
  commit(next);
}

export function exportStore(P: { findings: { key: string; sev: number }[] }): string {
  const s = current;
  const top = [...P.findings].sort((a, b) => b.sev - a.sev)[0];
  const payload = {
    ...s,
    _export: {
      exportedAt: iso(new Date()),
      schemaVersion: SCHEMA_VERSION,
      lineage: s.lineage,
      eventCount: s.events.length,
      peopleCount: s.people.length,
      activeFindingsAtExport: P.findings.length,
      topFindingAtExport: top ? top.key : null,
      exportedBy: "LeadOS pt-E demo · src/lib/store.ts",
      note:
        "Full store export. Import with importInto() to merge into another instance of this demo. The _export block is metadata only and is stripped by importInto().",
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function exportFiltered(filter: string): string {
  const s = current;
  const isDomain = (filter as any) && DOMAIN_SET.has(filter);
  const events = s.events.filter((e) => (isDomain ? e.domain === filter : e.type === filter));
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    lineage: s.lineage,
    meta: freshMeta(),
    people: s.people,
    events,
    _export: {
      exportedAt: iso(new Date()),
      schemaVersion: SCHEMA_VERSION,
      eventCount: events.length,
      _filtered: true,
      filter,
      exportedBy: "LeadOS pt-E demo · src/lib/store.ts",
    },
  };
  let next = pushAudit(current, "store.exported.filtered", { filter, count: events.length });
  commit(next);
  return JSON.stringify(payload, null, 2);
}

const DOMAIN_SET = new Set(["finance", "people", "ops", "strategy", "rd", "compliance", "manufacturing"]);

export function importInto(text: string): { addedEvents: number; before: number; after: number } {
  const s = current;
  const before = s.events.length;
  let incoming: Store;
  try {
    incoming = JSON.parse(text);
  } catch {
    throw new Error("Import failed: not valid JSON.");
  }
  if (!incoming || !Array.isArray(incoming.events)) throw new Error("Import failed: no events[] array found.");
  const existingIds = new Set(s.events.map((e) => e.id));
  const incomingEvents = (incoming.events as LeadEvent[]).map((e) => ({ ...e, imported: true }));
  const toAdd = incomingEvents.filter((e) => !existingIds.has(e.id));
  let maxSeq = s.meta.lastEventSeq;
  const normalized = toAdd.map((e) => ({ ...e, seq: ++maxSeq }));
  let next: Store = {
    ...s,
    events: [...s.events, ...normalized],
    meta: { ...s.meta, lastEventSeq: maxSeq },
  };
  const after = next.events.length;
  next = pushAudit(next, "store.imported", { addedEvents: normalized.length, before, after });
  commit(next);
  return { addedEvents: normalized.length, before, after };
}

export function markItemAccessed(sessionAccessed: Set<string>, id: string) {
  sessionAccessed.add(id);
}
