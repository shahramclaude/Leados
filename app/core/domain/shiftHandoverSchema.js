/**
 * app/core/domain/shiftHandoverSchema.js — the fail-closed loaders of the
 * Shift Handover & Two-Key Readback Ledger (ADR-0223, Schema v178).
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here repairs a severity, re-dates a due instant, invents an action's
 * owner or rescues a readback whose synthesis text is missing. A row that
 * cannot be read exactly is DROPPED with a counted warning, and the screen
 * prints the count.
 *
 * THE TWO-KEY SHAPE, ENFORCED AT THE DOOR AND THE LOADER.
 *   - A brief names two DIFFERENT people: the outgoing operator (actorId on
 *     declare) and the declared incoming operator. One human cannot hand a
 *     station to themselves.
 *   - A readback names the brief it answers and the state it records. A
 *     `synthesized` readback must carry a synthesis of at least the declared
 *     minimum; a `disputed` readback must carry its named reason. Half a
 *     readback is unreadable.
 *   - Cancellation is all three fields or none. Half a cancellation is
 *     unreadable.
 *   - A `dueAt` before its `declaredAt` is unreadable. A due instant beyond
 *     the declared bound is unreadable. An instant that is not a real ISO
 *     timestamp is unreadable.
 *
 * AMBIGUITY IS NOT LATEST-WINS. Two briefs sharing an id are refused as
 * duplicates; ids are unique across reloads or the row is dropped.
 */

import { dayKey } from '../time.js';
import {
  SHO_LIMITS as L,
  SHO_READBACK_KEYS,
  SHO_SEVERITY_KEYS,
  SHO_SETTING_KEYS,
  SHO_DEFAULTS,
} from './shiftHandoverRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export const shoText = (value, max = L.textMax) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};
const id = (value) => { const c = shoText(value, 120); return ID_RE.test(c) ? c : null; };

/** A real calendar day inside the register's range, or null. */
export function shoDay(value) {
  const key = dayKey(value);
  if (!key || key < L.dayMin || key > L.dayMax) return null;
  return key;
}

/** A real instant as canonical ISO, or null. Never repaired, never guessed. */
export function shoInstant(value) {
  const raw = shoText(value, 40);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function shoReason(value) {
  const candidate = shoText(value, L.textMax);
  return candidate.length >= L.reasonMin ? candidate : null;
}

export function shoLabel(value) {
  const candidate = shoText(value, L.stationRefMax + 20);
  return candidate.length >= L.stationRefMin ? candidate.slice(0, L.stationRefMax) : null;
}

const personId = (value) => id(value);

/* ------------------------------------------------------------ action rows */

/**
 * One open action on a brief. `ownerId` may be null — an unowned action is a
 * FACT the register prints, never one it repairs. `dueDay` is optional but, if
 * present, must be a real calendar day.
 */
export function normalizeShoAction(raw) {
  if (!isPlainObject(raw)) return null;
  const text = shoText(raw.text, L.actionTextMax);
  if (text.length < L.actionTextMin) return null;
  let owner = null;
  if (raw.ownerId !== undefined && raw.ownerId !== null && raw.ownerId !== '') {
    owner = personId(raw.ownerId);
    if (!owner) return null;
  }
  let due = null;
  if (raw.dueDay !== undefined && raw.dueDay !== null && raw.dueDay !== '') {
    due = shoDay(raw.dueDay);
    if (!due) return null;
  }
  return { text, ownerId: owner, dueDay: due };
}

function normalizeActions(value) {
  if (value === undefined || value === null) return { actions: [], dropped: 0 };
  if (!Array.isArray(value)) return { actions: null, dropped: 1 };
  const out = [];
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.actionsMax) { dropped += 1; continue; }
    const row = normalizeShoAction(raw);
    if (!row) { dropped += 1; continue; }
    out.push(row);
  }
  return { actions: out, dropped };
}

/* ------------------------------------------------------------ brief rows */

export function normalizeShiftHandovers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  list.forEach((raw, index) => {
    if (index >= L.briefs) { dropped += 1; return; }
    if (!isPlainObject(raw)) { dropped += 1; return; }
    const briefId = id(raw.id);
    if (!briefId || seenIds.has(briefId)) { dropped += 1; return; }
    const stationRef = shoLabel(raw.stationRef);
    if (!stationRef) { dropped += 1; return; }
    const outgoingId = personId(raw.outgoingId);
    const incomingId = personId(raw.incomingId);
    if (!outgoingId || !incomingId || outgoingId === incomingId) { dropped += 1; return; }
    const severity = SHO_SEVERITY_KEYS.includes(raw.severity) ? raw.severity : null;
    if (!severity) { dropped += 1; return; }
    const summary = shoText(raw.summary, L.textMax);
    if (summary.length < L.textMin) { dropped += 1; return; }
    const contingency = shoText(raw.contingency, L.textMax);
    if (contingency.length < L.textMin) { dropped += 1; return; }
    const abnormalities = shoText(raw.abnormalities, L.abnormalitiesMax);
    const declaredAt = shoInstant(raw.declaredAt);
    const dueAt = shoInstant(raw.dueAt);
    if (!declaredAt || !dueAt) { dropped += 1; return; }
    if (Date.parse(dueAt) < Date.parse(declaredAt)) { dropped += 1; return; }
    if (Date.parse(dueAt) - Date.parse(declaredAt) > L.dueMaxHours * 3600 * 1000) { dropped += 1; return; }
    const parsed = normalizeActions(raw.openActions);
    if (parsed.actions === null) { dropped += 1; return; }
    // Cancellation is all three fields or none. Half a cancellation is unreadable.
    const cancelledOnRaw = raw.cancelledOn === undefined || raw.cancelledOn === null || raw.cancelledOn === '' ? null : raw.cancelledOn;
    const cancelledByIdRaw = raw.cancelledById === undefined || raw.cancelledById === null ? '' : personId(raw.cancelledById) || '';
    const cancelReasonRaw = raw.cancelReason === undefined || raw.cancelReason === null ? '' : shoText(raw.cancelReason, L.textMax);
    let cancelledOn = null;
    let cancelledById = '';
    let cancelReason = '';
    if (cancelledOnRaw !== null || cancelledByIdRaw || cancelReasonRaw) {
      cancelledOn = shoDay(cancelledOnRaw);
      if (!cancelledOn) { dropped += 1; return; }
      if (!cancelledByIdRaw || cancelReasonRaw.length < L.reasonMin) { dropped += 1; return; }
      if (cancelledByIdRaw !== outgoingId) { dropped += 1; return; } // only the outgoing operator cancels their own brief
      cancelledById = cancelledByIdRaw;
      cancelReason = cancelReasonRaw;
    }
    seenIds.add(briefId);
    kept.push({
      id: briefId,
      stationRef,
      outgoingId,
      incomingId,
      severity,
      summary,
      contingency,
      abnormalities,
      openActions: parsed.actions,
      declaredAt,
      dueAt,
      cancelledOn,
      cancelledById,
      cancelReason,
      declaredById: outgoingId,
      day: dayKey(declaredAt) || L.dayMin,
    });
  });
  if (dropped) {
    warnings.push(`Shift handover briefs: refused ${dropped} unreadable or duplicate row(s); no severity, owner, time or cancellation was repaired.`);
  }
  return kept;
}

/* ------------------------------------------- readback (two-key) act rows */

export function normalizeShiftHandoverReadbacks(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  list.forEach((raw, index) => {
    if (index >= L.readbacks) { dropped += 1; return; }
    if (!isPlainObject(raw)) { dropped += 1; return; }
    const actId = id(raw.id);
    if (!actId || seenIds.has(actId)) { dropped += 1; return; }
    const handoverId = id(raw.handoverId);
    if (!handoverId) { dropped += 1; return; }
    const actorId = personId(raw.actorId);
    if (!actorId) { dropped += 1; return; }
    const kind = SHO_READBACK_KEYS.includes(raw.kind) ? raw.kind : null;
    if (!kind) { dropped += 1; return; }
    const at = shoInstant(raw.at);
    if (!at) { dropped += 1; return; }
    const synthesis = shoText(raw.synthesis, L.textMax);
    const disputeReason = shoText(raw.disputeReason, L.textMax);
    if (kind === 'synthesized') {
      if (synthesis.length < L.textMin) { dropped += 1; return; }
      if (raw.disputeReason !== undefined && raw.disputeReason !== null && String(raw.disputeReason).trim() !== '') { dropped += 1; return; }
    } else {
      if (disputeReason.length < L.reasonMin) { dropped += 1; return; }
      if (raw.synthesis !== undefined && raw.synthesis !== null && String(raw.synthesis).trim() !== '') { dropped += 1; return; }
    }
    seenIds.add(actId);
    kept.push({ id: actId, handoverId, actorId, kind, synthesis: kind === 'synthesized' ? synthesis : '', disputeReason: kind === 'disputed' ? disputeReason : '', at });
  });
  if (dropped) warnings.push(`Shift handover readbacks: refused ${dropped} unreadable or duplicate act(s); no synthesis, reason or actor was repaired.`);
  return kept;
}

/* ------------------------------------------------------------- markers */

/** Identity-free observations written by the rule. Duplicate keys collapse. */
export function normalizeShoMarkers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const kept = [];
  let dropped = 0;
  for (const raw of list) {
    if (!isPlainObject(raw)) { dropped += 1; continue; }
    const key = shoText(raw.key, 240);
    const at = typeof raw.at === 'string' ? raw.at : '';
    const detail = shoText(raw.detail, 400);
    if (!key || !at || !detail || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    kept.push({ key, at, ruleId: shoText(raw.ruleId, 80) || null, kind: shoText(raw.kind, 80) || 'shift-handover', detail });
  }
  if (dropped) warnings.push(`Shift handover markers: refused ${dropped} unreadable or duplicate marker row(s).`);
  return kept.slice(-L.markers);
}

/** The module's declared conventions. Only the pause switch exists today. */
export function normalizeShiftHandoverSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const key = SHO_SETTING_KEYS.autoPropagate;
  return {
    [key]: source[key] === undefined ? SHO_DEFAULTS.autoPropagate : Boolean(source[key]),
  };
}

export function readShoSettings({ settings = null } = {}) {
  const raw = normalizeShiftHandoverSettings(settings || {});
  return { autoPropagate: raw[SHO_SETTING_KEYS.autoPropagate] };
}

/* --------------------------------------------------------------- ask links */

export const SHO_ASK_PREFIX = 'Shift handover:';

export function shoAskSummary(signature) {
  return `${SHO_ASK_PREFIX} ${String(signature || '').trim()}`;
}

export function parseShoAskSummary(text) {
  const raw = String(text || '').trim();
  if (!raw.startsWith(SHO_ASK_PREFIX)) return null;
  const signature = raw.slice(SHO_ASK_PREFIX.length).trim();
  return signature ? { signature } : null;
}

/** The severity label, or null — never a plausible default. */
export const shoSeverityLabel = (key) => SHO_SEVERITY_KEYS.includes(key) ? String(key) : null;
