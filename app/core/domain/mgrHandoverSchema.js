/**
 * app/core/domain/mgrHandoverSchema.js — fail-closed persistence for ADR-0225.
 *
 * A handover is a declared transition plus an append-only act stream. No
 * derived state, acceptance, release or dispute resolution is stored. A
 * malformed act is dropped with a counted warning; the brief must be the first
 * act of a handover, an acceptance or a release never appears out of order,
 * and a release filed after a dispute must carry its own reason. The reader
 * re-derives every state from the stream on every read.
 */

import { dayKey } from '../time.js';
import {
  MHH_ACT_KINDS,
  MHH_DEFAULTS,
  MHH_LIMITS as L,
  MHH_PORTFOLIO_KEYS,
  MHH_REASON_KEYS,
  MHH_SETTING_KEYS,
} from './mgrHandoverRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const mhhText = (value, max = L.textMax) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};
const mhhId = (value) => {
  const candidate = mhhText(value, 120);
  return ID_RE.test(candidate) ? candidate : null;
};

export function mhhInstant(value) {
  const raw = mhhText(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function mhhDay(value) {
  const key = dayKey(value);
  return key && key >= L.dayMin && key <= L.dayMax ? key : null;
}

function normalizeScopeKeys(value) {
  if (!Array.isArray(value)) return null;
  const keys = [...new Set(value.map((raw) => mhhText(raw, 40)).filter((key) => MHH_PORTFOLIO_KEYS.includes(key)))];
  if (keys.length < L.scopeMin || keys.length > L.scopeMax) return null;
  return keys.sort();
}

export function normalizeMgrHandovers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.handovers || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = mhhId(raw.id);
    const roleRef = mhhText(raw.roleRef, L.roleRefMax);
    const departingManagerId = mhhId(raw.departingManagerId);
    const successorId = mhhId(raw.successorId);
    const declaredById = mhhId(raw.declaredById);
    const declaredOn = mhhDay(raw.declaredOn);
    const plannedEffectiveOn = mhhDay(raw.plannedEffectiveOn);
    const scopeKeys = normalizeScopeKeys(raw.scopeKeys);
    const reasonKind = MHH_REASON_KEYS.includes(raw.reasonKind) ? raw.reasonKind : null;
    const note = mhhText(raw.note, L.noteMax);
    if (!id || seenIds.has(id) || roleRef.length < L.roleRefMin
      || !departingManagerId || departingManagerId === 'leader'
      || !successorId || successorId === 'leader' || successorId === departingManagerId
      || !declaredById || declaredById === 'leader'
      || declaredById === departingManagerId || declaredById === successorId
      || !declaredOn || !plannedEffectiveOn || plannedEffectiveOn < declaredOn
      || !scopeKeys || !reasonKind) { dropped += 1; continue; }
    seenIds.add(id);
    kept.push({
      id,
      roleRef,
      departingManagerId,
      successorId,
      declaredById,
      declaredOn,
      plannedEffectiveOn,
      scopeKeys,
      reasonKind,
      note,
    });
  }
  if (dropped) warnings.push(`Managerial handovers: refused ${dropped} unreadable, duplicate, self-referential or over-cap row(s); no transition, person or date was repaired.`);
  return kept;
}

function normalizeActShape(raw, knownHandovers) {
  if (!isPlainObject(raw)) return null;
  const actId = mhhId(raw.id);
  const handoverId = mhhId(raw.handoverId);
  const actorId = mhhId(raw.actorId);
  const kind = MHH_ACT_KINDS.includes(raw.kind) ? raw.kind : null;
  const at = mhhInstant(raw.at);
  if (!actId || !handoverId || !knownHandovers.has(handoverId) || !actorId || actorId === 'leader'
    || !kind || !at) return null;

  const base = { id: actId, handoverId, actorId, kind, at };
  if (kind === 'portfolio-brief') {
    const portfolioCount = raw.portfolioCount;
    const briefText = mhhText(raw.briefText, L.textMax);
    const openItemsText = mhhText(raw.openItemsText, L.textMax);
    const evidenceText = mhhText(raw.evidenceText, L.textMax);
    if (!Number.isInteger(portfolioCount) || portfolioCount < 0 || portfolioCount > L.handovers
      || briefText.length < L.briefMin || evidenceText.length < L.evidenceMin) return null;
    return { ...base, portfolioCount, briefText, openItemsText, evidenceText, note: '', acceptedCount: null, reasonText: '' };
  }
  if (kind === 'acceptance') {
    const acceptedCount = raw.acceptedCount;
    const note = mhhText(raw.note, L.noteMax);
    if (!Number.isInteger(acceptedCount) || acceptedCount < 0 || acceptedCount > L.handovers) return null;
    return { ...base, portfolioCount: null, briefText: '', openItemsText: '', evidenceText: '', note, acceptedCount, reasonText: '' };
  }
  if (kind === 'release') {
    const note = mhhText(raw.note, L.noteMax);
    return { ...base, portfolioCount: null, briefText: '', openItemsText: '', evidenceText: '', note, acceptedCount: null, reasonText: '' };
  }
  // dispute: the successor's reason is mandatory — a dispute without a stated
  // ground is not a dispute, it is an unexplained refusal.
  const reasonText = mhhText(raw.reasonText, L.textMax);
  if (reasonText.length < L.textMin) return null;
  return { ...base, portfolioCount: null, briefText: '', openItemsText: '', evidenceText: '', note: '', acceptedCount: null, reasonText };
}

/**
 * Normalize the immutable act stream in recorded order. The portfolio brief
 * must be the first act of a handover. An acceptance may be filed once; a
 * release must follow an acceptance or a dispute; a release filed after a
 * dispute must carry a reason on the act itself. A second brief, a repeated
 * acceptance, a release before either key, or a dispute with no ground is
 * dropped rather than repaired.
 */
export function normalizeMgrHandoverActs(value, handovers, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const handoverRows = Array.isArray(handovers) ? handovers : [];
  const known = new Map(handoverRows.map((row) => [row.id, row]));
  const streams = new Map();
  const seenIds = new Set();
  const kept = [];
  let dropped = 0;

  for (const raw of list) {
    if (kept.length >= L.acts) { dropped += 1; continue; }
    const act = normalizeActShape(raw, known);
    if (!act || seenIds.has(act.id)) { dropped += 1; continue; }
    const handover = known.get(act.handoverId);
    const declaredMs = Date.parse(`${handover.declaredOn}T00:00:00.000Z`);
    const atMs = Date.parse(act.at);
    if (atMs < declaredMs) { dropped += 1; continue; }

    let stream = streams.get(act.handoverId);
    if (!stream) {
      stream = { brief: null, acceptance: null, release: null, disputes: 0, lastAtMs: declaredMs, order: 0 };
      streams.set(act.handoverId, stream);
    }
    if (atMs < stream.lastAtMs) { dropped += 1; continue; }

    if (act.kind === 'portfolio-brief') {
      if (stream.brief) { dropped += 1; continue; }
      if (stream.order !== 0) { dropped += 1; continue; }
      stream.brief = act;
    } else if (act.kind === 'acceptance') {
      if (stream.acceptance || !stream.brief) { dropped += 1; continue; }
      stream.acceptance = act;
    } else if (act.kind === 'release') {
      if (stream.release || !stream.brief) { dropped += 1; continue; }
      if (!stream.acceptance && stream.disputes === 0) { dropped += 1; continue; }
      if (!stream.acceptance && !mhhText(act.note, L.noteMax).length) { dropped += 1; continue; }
      stream.release = act;
    } else if (act.kind === 'dispute') {
      if (!stream.brief) { dropped += 1; continue; }
      stream.disputes += 1;
    }
    stream.lastAtMs = atMs;
    stream.order += 1;
    seenIds.add(act.id);
    kept.push(act);
  }
  if (dropped) warnings.push(`Managerial handover acts: refused ${dropped} unreadable, duplicate, out-of-order, premature or repeated act(s); no acceptance, release or dispute was repaired.`);
  return kept;
}

export function normalizeMgrHandoverMarkers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const kept = [];
  let dropped = 0;
  for (const raw of list) {
    if (!isPlainObject(raw)) { dropped += 1; continue; }
    const key = mhhText(raw.key, 240);
    const at = mhhInstant(raw.at);
    const ruleId = mhhText(raw.ruleId, 80);
    const kind = mhhText(raw.kind, 80);
    const detail = mhhText(raw.detail, 400);
    if (!key || !at || !detail || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    kept.push({ key, at, ruleId: ruleId || null, kind: kind || 'mgr-handover', detail });
  }
  if (dropped) warnings.push(`Managerial handover markers: refused ${dropped} unreadable or duplicate identity-free marker row(s).`);
  return kept.slice(-L.markers);
}

export function normalizeMgrHandoverSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const key = MHH_SETTING_KEYS.autoPropagate;
  return { [key]: typeof source[key] === 'boolean' ? source[key] : MHH_DEFAULTS.autoPropagate };
}
