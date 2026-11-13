/**
 * app/core/domain/changeImpactSchema.js — fail-closed storage contract for
 * Matrix Change-Impact Line Review (ADR-0185, Schema v147).
 *
 * Requests freeze the material change context and the complete active Matrix
 * line set for one impacted person. Responses are separate, append-only,
 * first-person acts against exactly one request. Currentness, expiry, coverage
 * and every state are derived in changeImpact.js; none is stored here.
 */

import { CHANGE_IMPACT_KINDS, STAR_PILLARS } from './changes.js';
import { daysBetween } from '../time.js';
import { CHANGE_IMPACT_LIMITS } from './changeImpactRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function id(value) {
  const candidate = text(value, 120);
  return ID_RE.test(candidate) ? candidate : null;
}

export function changeImpactDay(value) {
  const candidate = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

function stamp(value) {
  const raw = text(value, 40);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function stringList(value, maxItems = 40, maxText = 80) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, maxText)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, maxItems);
}

function normalizePerson(raw) {
  if (!isPlainObject(raw)) return null;
  const personId = id(raw.id);
  const name = text(raw.name, 120);
  if (!personId || !name) return null;
  return {
    id: personId,
    name,
    role: text(raw.role, 120),
    level: text(raw.level, 32),
    team: text(raw.team, 80),
    managerId: id(raw.managerId),
  };
}

function normalizeLine(raw) {
  if (!isPlainObject(raw)) return null;
  const lineKey = id(raw.lineKey);
  const role = raw.role === 'primary' ? 'primary' : raw.role === 'secondary' ? 'secondary' : null;
  const managerId = id(raw.managerId);
  const managerName = text(raw.managerName, 120);
  if (!lineKey || !role || !managerId || !managerName) return null;
  const shareH = raw.shareH === null || raw.shareH === undefined
    ? null
    : (Number.isInteger(raw.shareH) && raw.shareH >= 0 && raw.shareH <= 10000 ? raw.shareH : null);
  return {
    lineKey,
    role,
    managerId,
    managerName,
    managerRole: text(raw.managerRole, 120),
    managerAltitude: text(raw.managerAltitude, 32) || null,
    kind: text(raw.kind, 48),
    shareH,
    rights: stringList(raw.rights),
    presumedRights: stringList(raw.presumedRights),
    fromISO: changeImpactDay(raw.fromISO),
    toISO: changeImpactDay(raw.toISO),
    note: text(raw.note, 500),
  };
}

function normalizeSnapshot(raw, { changeId, personId, lineKey, managerId }) {
  if (!isPlainObject(raw) || raw.version !== 1 || !isPlainObject(raw.change) || !isPlainObject(raw.impact)) return null;
  const snapshotChangeId = id(raw.change.id);
  const snapshotPerson = normalizePerson(raw.person);
  const impactId = id(raw.impact.id);
  const impactPersonId = id(raw.impact.personId);
  const impactKind = text(raw.impact.impactKind, 40);
  if (
    snapshotChangeId !== changeId
    || !snapshotPerson
    || snapshotPerson.id !== personId
    || !impactId
    || impactPersonId !== personId
    || !CHANGE_IMPACT_KINDS.includes(impactKind)
  ) return null;

  const linesRaw = Array.isArray(raw.lines) ? raw.lines : [];
  if (linesRaw.length < 2 || linesRaw.length > CHANGE_IMPACT_LIMITS.snapshotLines) return null;
  if (!isPlainObject(raw.change.star)) return null;
  const lines = [];
  const seenLineKeys = new Set();
  for (const source of linesRaw) {
    const line = normalizeLine(source);
    if (!line || seenLineKeys.has(line.lineKey)) return null;
    seenLineKeys.add(line.lineKey);
    lines.push(line);
  }
  lines.sort((a, b) => a.lineKey.localeCompare(b.lineKey));
  const target = lines.find((line) => line.lineKey === lineKey);
  if (!target || target.managerId !== managerId) return null;

  const change = {
    id: snapshotChangeId,
    title: text(raw.change.title, 200),
    kind: text(raw.change.kind, 40),
    summary: text(raw.change.summary, 2000),
    vision: text(raw.change.vision, 2000),
    nonGoals: text(raw.change.nonGoals, 1200),
    targetOn: changeImpactDay(raw.change.targetOn),
    targetStructure: {
      teamName: text(raw.change.targetStructure?.teamName, 120),
      currentType: text(raw.change.targetStructure?.currentType, 48),
      targetType: text(raw.change.targetStructure?.targetType, 48),
      interactionMode: text(raw.change.targetStructure?.interactionMode, 48),
      collaboratingTeamsCount: Number.isInteger(raw.change.targetStructure?.collaboratingTeamsCount)
        ? Math.max(0, Math.min(20, raw.change.targetStructure.collaboratingTeamsCount))
        : 0,
    },
    star: Object.fromEntries(STAR_PILLARS.map((pillar) => [pillar, text(raw.change.star[pillar], 600)])),
  };
  if (!change.title || !change.kind) return null;

  return {
    version: 1,
    change,
    impact: {
      id: impactId,
      personId,
      impactKind,
      newRoleLabel: text(raw.impact.newRoleLabel, 160),
      createTransitionPlan: raw.impact.createTransitionPlan === true,
    },
    person: snapshotPerson,
    lines,
  };
}

export function normalizeChangeImpactRequests(raw, warnings = [], today = null) {
  const source = Array.isArray(raw) ? raw : [];
  const out = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const item of source) {
    if (!isPlainObject(item)) { dropped += 1; continue; }
    const rowId = id(item.id);
    const changeId = id(item.changeId);
    const personId = id(item.personId);
    const lineKey = id(item.lineKey);
    const managerId = id(item.managerId);
    const requestedOn = changeImpactDay(item.requestedOn);
    const requestedAt = stamp(item.requestedAt);
    const dueOn = changeImpactDay(item.dueOn);
    const requestedBySeatId = id(item.requestedBySeatId);
    const dueDays = requestedOn && dueOn ? daysBetween(requestedOn, dueOn) : null;
    const [minDue, maxDue] = CHANGE_IMPACT_LIMITS.requestDueDays;
    const snapshot = normalizeSnapshot(item.snapshot, { changeId, personId, lineKey, managerId });
    if (
      !rowId || seenIds.has(rowId)
      || !changeId || !personId || !lineKey || !managerId || !requestedBySeatId
      || !requestedOn || !requestedAt || requestedAt.slice(0, 10) !== requestedOn
      || (today && requestedOn > today)
      || !dueOn || dueDays === null || dueDays < minDue || dueDays > maxDue
      || !snapshot
    ) { dropped += 1; continue; }
    seenIds.add(rowId);
    out.push({
      id: rowId,
      changeId,
      personId,
      lineKey,
      managerId,
      requestedOn,
      requestedAt,
      requestedBySeatId,
      dueOn,
      prompt: text(item.prompt, CHANGE_IMPACT_LIMITS.promptMax),
      snapshot,
    });
    if (out.length >= CHANGE_IMPACT_LIMITS.requests) break;
  }
  if (dropped) warnings.push(`Matrix change-impact reviews: dropped ${dropped} malformed request(s); no scope, due date or snapshot was inferred.`);
  if (source.length > CHANGE_IMPACT_LIMITS.requests) warnings.push(`Matrix change-impact reviews: request ledger was capped at ${CHANGE_IMPACT_LIMITS.requests}; later rows were not loaded.`);
  return out;
}

export function normalizeChangeImpactResponses(raw, requests, warnings = [], today = null) {
  const source = Array.isArray(raw) ? raw : [];
  const requestById = new Map((Array.isArray(requests) ? requests : []).map((request) => [request.id, request]));
  const out = [];
  const seenIds = new Set();
  const seenRequests = new Set();
  let dropped = 0;
  for (const item of source) {
    if (!isPlainObject(item)) { dropped += 1; continue; }
    const rowId = id(item.id);
    const requestId = id(item.requestId);
    const request = requestById.get(requestId);
    const outcome = item.outcome === 'reviewed' || item.outcome === 'declined' ? item.outcome : null;
    const respondedOn = changeImpactDay(item.respondedOn);
    const respondedAt = stamp(item.respondedAt);
    const via = item.via === 'seat' ? 'seat' : null;
    const responderSeatId = id(item.responderSeatId);
    const validThrough = outcome === 'reviewed' ? changeImpactDay(item.validThrough) : null;
    const responseAgeDays = request && respondedOn ? daysBetween(request.requestedOn, respondedOn) : null;
    const termDays = respondedOn && validThrough ? daysBetween(respondedOn, validThrough) : null;
    const [minTerm, maxTerm] = CHANGE_IMPACT_LIMITS.responseTermDays;
    const basis = text(item.basis, CHANGE_IMPACT_LIMITS.reasonMax);
    const reason = text(item.reason, CHANGE_IMPACT_LIMITS.reasonMax);
    if (
      !rowId || seenIds.has(rowId)
      || !request || !outcome || !respondedOn || !respondedAt || respondedAt.slice(0, 10) !== respondedOn || !via
      || (today && respondedOn > today)
      || respondedAt < request.requestedAt
      || responseAgeDays === null || responseAgeDays < 0
      || request.managerId !== id(item.managerId)
      || request.changeId !== id(item.changeId)
      || request.personId !== id(item.personId)
      || request.lineKey !== id(item.lineKey)
      || !responderSeatId
      || seenRequests.has(requestId)
      || responderSeatId !== request.managerId
      || (outcome === 'reviewed' && (!validThrough || termDays === null || termDays < minTerm || termDays > maxTerm || basis.length < CHANGE_IMPACT_LIMITS.reasonMin))
      || (outcome === 'declined' && reason.length < CHANGE_IMPACT_LIMITS.reasonMin)
    ) { dropped += 1; continue; }
    seenIds.add(rowId);
    seenRequests.add(requestId);
    out.push({
      id: rowId,
      requestId,
      changeId: request.changeId,
      personId: request.personId,
      lineKey: request.lineKey,
      managerId: request.managerId,
      outcome,
      respondedOn,
      respondedAt,
      responderSeatId,
      via,
      validThrough,
      basis: outcome === 'reviewed' ? basis : '',
      reason: outcome === 'declined' ? reason : '',
    });
    if (out.length >= CHANGE_IMPACT_LIMITS.responses) break;
  }
  if (dropped) warnings.push(`Matrix change-impact reviews: dropped ${dropped} malformed response(s); no first-person line act or validity window was inferred.`);
  if (source.length > CHANGE_IMPACT_LIMITS.responses) warnings.push(`Matrix change-impact reviews: response ledger was capped at ${CHANGE_IMPACT_LIMITS.responses}; later rows were not loaded.`);
  return out;
}
