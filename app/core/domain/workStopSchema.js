/**
 * app/core/domain/workStopSchema.js — fail-closed persistence for ADR-0224.
 *
 * Stops and acts are append-only declarations. No derived clearance, restart,
 * safety score or authority is stored. A malformed parent is dropped with a
 * counted warning; acts resolve only through a parent and mitigation that
 * survived normalization. A second/ambiguous row is refused rather than
 * selected by insertion order.
 */

import { dayKey } from '../time.js';
import { SWP_ACT_KINDS, SWP_AUTHORITY_REASONS, SWP_DEFAULTS, SWP_HAZARD_KEYS, SWP_LIMITS as L, SWP_SETTING_KEYS } from './workStopRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const swpText = (value, max = L.textMax) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};
const swpId = (value) => {
  const candidate = swpText(value, 120);
  return ID_RE.test(candidate) ? candidate : null;
};

export function swpInstant(value) {
  const raw = swpText(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function swpDay(value) {
  const key = dayKey(value);
  return key && key >= L.dayMin && key <= L.dayMax ? key : null;
}

export function swpLabel(value) {
  const candidate = swpText(value, L.areaMax + 20);
  return candidate.length >= L.areaMin ? candidate.slice(0, L.areaMax) : null;
}

function normalizePeopleIds(value) {
  if (!Array.isArray(value) || value.length < L.participantsMin || value.length > L.participantsMax) return null;
  const ids = [];
  const seen = new Set();
  for (const raw of value) {
    const personId = swpId(raw);
    if (!personId || seen.has(personId)) return null;
    seen.add(personId);
    ids.push(personId);
  }
  return ids;
}

function normalizeAuthorityIds(value) {
  if (!Array.isArray(value) || value.length > L.participantsMax) return null;
  if (value.length === 0) return [];
  const ids = normalizePeopleIds(value);
  return ids ? ids.sort() : null;
}

export function normalizeWorkStops(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.stops || !isPlainObject(raw)) { dropped += 1; continue; }
    const stopId = swpId(raw.id);
    const areaRef = swpLabel(raw.areaRef);
    const workSummary = swpText(raw.workSummary, L.textMax);
    const hazardKind = SWP_HAZARD_KEYS.includes(raw.hazardKind) ? raw.hazardKind : null;
    const hazardText = swpText(raw.hazardText, L.textMax);
    const immediateControls = swpText(raw.immediateControls, L.textMax);
    const reporterId = swpId(raw.reporterId);
    const workLeadId = swpId(raw.workLeadId);
    const affectedPersonIds = normalizePeopleIds(raw.affectedPersonIds);
    const authorityIds = normalizeAuthorityIds(raw.authorityIds);
    const authorityReason = SWP_AUTHORITY_REASONS.includes(raw.authorityReason) ? raw.authorityReason : null;
    const declaredAt = swpInstant(raw.declaredAt);
    const reviewByAt = swpInstant(raw.reviewByAt);
    if (!stopId || seenIds.has(stopId) || !areaRef || workSummary.length < L.textMin
      || !hazardKind || hazardText.length < L.textMin || immediateControls.length < L.textMin
      || !reporterId || reporterId === 'leader' || !workLeadId || workLeadId === 'leader' || !affectedPersonIds
      || affectedPersonIds.includes('leader') || !authorityIds || authorityIds.includes('leader') || !authorityReason
      || (authorityReason === 'resolved') !== (authorityIds.length > 0)
      || !declaredAt || !reviewByAt) { dropped += 1; continue; }
    const delta = Date.parse(reviewByAt) - Date.parse(declaredAt);
    if (delta <= 0 || delta > L.reviewMaxHours * 3600 * 1000) { dropped += 1; continue; }
    seenIds.add(stopId);
    kept.push({
      id: stopId,
      areaRef,
      workSummary,
      hazardKind,
      hazardText,
      immediateControls,
      reporterId,
      workLeadId,
      affectedPersonIds,
      authorityIds,
      authorityReason,
      declaredAt,
      reviewByAt,
    });
  }
  if (dropped) warnings.push(`Stop-work records: refused ${dropped} unreadable, duplicate, or over-cap row(s); no hazard, person, deadline or control was repaired.`);
  return kept;
}

function normalizeActShape(raw, knownStops) {
  if (!isPlainObject(raw)) return null;
  const actId = swpId(raw.id);
  const stopId = swpId(raw.stopId);
  const actorId = swpId(raw.actorId);
  const kind = SWP_ACT_KINDS.includes(raw.kind) ? raw.kind : null;
  const round = raw.round;
  const mitigationId = swpId(raw.mitigationId);
  const at = swpInstant(raw.at);
  if (!actId || !stopId || !knownStops.has(stopId) || !actorId || actorId === 'leader' || !kind
    || !Number.isInteger(round) || round < 1 || round > L.stops || !mitigationId || !at) return null;

  const actionText = swpText(raw.actionText, L.textMax);
  const assessment = raw.assessment === 'safe' || raw.assessment === 'hold' ? raw.assessment : null;
  const decision = raw.decision === 'restart' || raw.decision === 'hold' ? raw.decision : null;
  const assessmentText = swpText(raw.assessmentText, L.textMax);
  const operatorText = swpText(raw.operatorText, L.textMax);
  const evidenceText = swpText(raw.evidenceText, L.textMax);
  const reason = swpText(raw.reason, L.textMax);
  if (evidenceText.length < L.evidenceMin) return null;

  if (kind === 'mitigation') {
    if (mitigationId !== actId || actionText.length < L.textMin || assessment || decision
      || assessmentText || operatorText || reason) return null;
    return { id: actId, stopId, actorId, kind, round, mitigationId, actionText, evidenceText, at };
  }
  if (kind === 'assessment') {
    if (!assessment || assessmentText.length < L.textMin || actionText || decision || operatorText || reason) return null;
    return { id: actId, stopId, actorId, kind, round, mitigationId, assessment, assessmentText, evidenceText, at };
  }
  if (!decision || operatorText.length < L.textMin || actionText || assessment || assessmentText
    || (decision === 'hold' && reason.length < L.textMin)
    || (decision === 'restart' && reason)) return null;
  return { id: actId, stopId, actorId, kind, round, mitigationId, decision, operatorText, evidenceText, reason: decision === 'hold' ? reason : '', at };
}

/**
 * Normalize the immutable act stream in recorded order. A later round must
 * start with exactly one new mitigation and cannot skip a round. Acts cannot
 * be appended to a closed restart. These checks stop a hand-edited row from
 * reviving a hold or pairing an approval with an older control.
 */
export function normalizeWorkStopActs(value, stops, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const stopRows = Array.isArray(stops) ? stops : [];
  const knownStops = new Map(stopRows.map((row) => [row.id, row]));
  const streams = new Map();
  const seenIds = new Set();
  const kept = [];
  let dropped = 0;

  for (const raw of list) {
    if (kept.length >= L.acts) { dropped += 1; continue; }
    const act = normalizeActShape(raw, knownStops);
    if (!act || seenIds.has(act.id)) { dropped += 1; continue; }
    const stop = knownStops.get(act.stopId);
    const declaredMs = Date.parse(stop.declaredAt);
    const atMs = Date.parse(act.at);
    if (atMs < declaredMs) { dropped += 1; continue; }
    let stream = streams.get(act.stopId);
    if (!stream) {
      stream = { round: 0, mitigationId: null, mitigationAt: 0, closed: false, actors: new Set(), hasHold: false };
      streams.set(act.stopId, stream);
    }
    if (stream.closed) { dropped += 1; continue; }

    if (act.kind === 'mitigation') {
      if (act.round !== stream.round + 1 || atMs < stream.mitigationAt) { dropped += 1; continue; }
      stream.round = act.round;
      stream.mitigationId = act.id;
      stream.mitigationAt = atMs;
      stream.actors = new Set();
      stream.hasHold = false;
    } else {
      if (act.round !== stream.round || !stream.mitigationId || act.mitigationId !== stream.mitigationId
        || atMs < stream.mitigationAt || stream.actors.has(`${act.kind}:${act.actorId}`)) { dropped += 1; continue; }
      if (act.kind === 'operator-decision' && act.decision === 'restart' && stream.hasHold) { dropped += 1; continue; }
      stream.actors.add(`${act.kind}:${act.actorId}`);
      if (act.kind === 'assessment' && act.assessment === 'hold') stream.hasHold = true;
      if (act.kind === 'operator-decision' && act.decision === 'hold') stream.hasHold = true;
      if (act.kind === 'operator-decision' && act.decision === 'restart') stream.closed = true;
    }
    seenIds.add(act.id);
    kept.push(act);
  }
  if (dropped) warnings.push(`Stop-work acts: refused ${dropped} unreadable, duplicate, orphaned, out-of-order, over-cap, or post-restart act(s); no clearance or operator decision was repaired.`);
  return kept;
}

export function normalizeWorkStopMarkers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const kept = [];
  let dropped = 0;
  for (const raw of list) {
    if (!isPlainObject(raw)) { dropped += 1; continue; }
    const key = swpText(raw.key, 240);
    const at = swpInstant(raw.at);
    const ruleId = swpText(raw.ruleId, 80);
    const kind = swpText(raw.kind, 80);
    const detail = swpText(raw.detail, 400);
    if (!key || !at || !detail || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    kept.push({ key, at, ruleId: ruleId || null, kind: kind || 'work-stop', detail });
  }
  if (dropped) warnings.push(`Stop-work markers: refused ${dropped} unreadable or duplicate identity-free marker row(s).`);
  return kept.slice(-L.markers);
}

export function normalizeWorkStopSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const key = SWP_SETTING_KEYS.autoPropagate;
  return { [key]: typeof source[key] === 'boolean' ? source[key] : SWP_DEFAULTS.autoPropagate };
}
