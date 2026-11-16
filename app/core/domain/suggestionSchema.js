/**
 * app/core/domain/suggestionSchema.js — fail-closed normalizers for ADR-0227.
 *
 * A malformed suggestion is dropped with a counted warning and nothing is
 * repaired: no route, owner, target day, reason or instant is invented. An act
 * resolves only through a suggestion that survived normalization. The synthetic
 * workspace leader is never a route member, owner, actor or submitter.
 */

import { dayKey } from '../time.js';
import {
  KZT_ACT_KINDS,
  KZT_DECISIONS,
  KZT_LIMITS as L,
  KZT_MARKER_KIND,
  KZT_RULE_ID,
} from './suggestionRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const RESERVED_ID = 'leader';
const DAY_MS = 86400000;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const kztText = (value, max = L.textMax) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};

const kztId = (value) => {
  const candidate = kztText(value, 120);
  return ID_RE.test(candidate) && candidate !== RESERVED_ID ? candidate : null;
};

export function kztInstant(value) {
  const raw = kztText(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function kztDay(value) {
  if (typeof value !== 'string') return null;
  const key = dayKey(value.trim());
  return key && key >= L.dayMin && key <= L.dayMax && key === value.trim() ? key : null;
}

function normalizeRoute(value, submitterId) {
  if (!Array.isArray(value) || value.length < L.routeMin || value.length > L.routeMax) return null;
  const ids = [];
  const seen = new Set();
  for (const raw of value) {
    const id = kztId(raw);
    if (!id || id === submitterId || seen.has(id)) return null;
    seen.add(id);
    ids.push(id);
  }
  return ids.sort();
}

/** Declared suggestions. Malformed or duplicate rows are dropped and counted. */
export function normalizeSuggestions(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.suggestions || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = kztId(raw.id);
    const areaRef = kztText(raw.areaRef, L.areaMax + 20);
    const problemText = kztText(raw.problemText, L.textMax);
    const proposalText = kztText(raw.proposalText, L.textMax);
    const submitterId = kztId(raw.submitterId);
    const routeIds = normalizeRoute(raw.routeIds, submitterId);
    const submittedAt = kztInstant(raw.submittedAt);
    const responseByAt = kztInstant(raw.responseByAt);
    if (!id || seenIds.has(id) || areaRef.length < L.areaMin || problemText.length < L.textMin
      || proposalText.length < L.textMin || !submitterId || !routeIds || !submittedAt || !responseByAt) {
      dropped += 1;
      continue;
    }
    const windowDays = (Date.parse(responseByAt) - Date.parse(submittedAt)) / DAY_MS;
    if (!(windowDays >= L.responseMinDays && windowDays <= L.responseMaxDays)) { dropped += 1; continue; }
    seenIds.add(id);
    kept.push({
      id,
      areaRef: areaRef.slice(0, L.areaMax),
      problemText,
      proposalText,
      submitterId,
      routeIds,
      submittedAt,
      responseByAt,
    });
  }
  if (dropped) warnings.push(`Improvement suggestions: refused ${dropped} unreadable, duplicate, or over-cap row(s); no route, owner, deadline or wording was repaired.`);
  return kept;
}

function normalizeAct(raw) {
  const id = kztId(raw.id);
  const suggestionId = kztId(raw.suggestionId);
  const actorId = kztId(raw.actorId);
  const kind = KZT_ACT_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!id || !suggestionId || !actorId || !kind) return null;
  if (kind === 'triage') {
    const decision = KZT_DECISIONS.includes(raw.decision) ? raw.decision : null;
    const reason = kztText(raw.reason, L.textMax);
    const decidedAt = kztInstant(raw.decidedAt);
    if (!decision || reason.length < L.textMin || !decidedAt) return null;
    if (decision === 'accept') {
      const ownerId = kztId(raw.ownerId);
      const targetDay = kztDay(raw.targetDay);
      if (!ownerId || !targetDay) return null;
      const spanDays = (Date.parse(targetDay) - Date.parse(decidedAt.slice(0, 10))) / DAY_MS;
      if (!(spanDays >= 0 && spanDays <= L.targetMaxDays)) return null;
      return { id, suggestionId, actorId, kind, decision, reason, ownerId, targetDay, at: decidedAt };
    }
    if (raw.ownerId !== undefined && raw.ownerId !== null) return null;
    if (raw.targetDay !== undefined && raw.targetDay !== null) return null;
    return { id, suggestionId, actorId, kind, decision, reason, ownerId: null, targetDay: null, at: decidedAt };
  }
  if (kind === 'claim') {
    const effectText = kztText(raw.effectText, L.textMax);
    const claimedAt = kztInstant(raw.claimedAt);
    if (effectText.length < L.textMin || !claimedAt) return null;
    return { id, suggestionId, actorId, kind, effectText, at: claimedAt };
  }
  const note = kztText(raw.note, L.textMax);
  const confirmedAt = kztInstant(raw.confirmedAt);
  if (note.length < L.textMin || !confirmedAt) return null;
  return { id, suggestionId, actorId, kind, note, at: confirmedAt };
}

/**
 * Acts. An act is dropped (counted) when it is malformed, duplicated, or points
 * at a suggestion that did not survive normalization. Ordering and authority
 * are decided later by the reader, in chronological order.
 */
export function normalizeSuggestionActs(value, suggestions, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const knownIds = new Set(suggestions.map((row) => row.id));
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.acts || !isPlainObject(raw)) { dropped += 1; continue; }
    const act = normalizeAct(raw);
    if (!act || seenIds.has(act.id) || !knownIds.has(act.suggestionId)) { dropped += 1; continue; }
    seenIds.add(act.id);
    kept.push(act);
  }
  if (dropped) warnings.push(`Improvement-suggestion acts: refused ${dropped} unreadable, duplicate, orphaned, or over-cap row(s); no decision, claim or confirmation was repaired.`);
  return kept;
}

/**
 * Rule markers — the identity-free observations `RULE-KZT-01` writes when the
 * record owes an ask and nobody on the reporting graph can be asked. A marker
 * is append-only, keyed (so a scan never files the same observation twice) and
 * carries no person id by construction. A malformed marker is dropped and
 * counted; nothing is repaired.
 */
export function normalizeSuggestionMarkers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenKeys = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.markers || !isPlainObject(raw)) { dropped += 1; continue; }
    const key = kztText(raw.key, 200);
    const at = kztInstant(raw.at);
    const detail = kztText(raw.detail, 300);
    if (!key || seenKeys.has(key) || !at || detail.length < L.textMin) { dropped += 1; continue; }
    seenKeys.add(key);
    kept.push({ key, at, ruleId: kztText(raw.ruleId, 40) || KZT_RULE_ID, kind: kztText(raw.kind, 40) || KZT_MARKER_KIND, detail });
  }
  if (dropped) warnings.push(`Improvement-suggestion markers: refused ${dropped} unreadable, duplicate, or over-cap row(s); no observation was repaired.`);
  return kept;
}
