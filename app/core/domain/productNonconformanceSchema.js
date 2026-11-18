/**
 * app/core/domain/productNonconformanceSchema.js — fail-closed storage contract
 * for ADR-0253 (Schema v206).
 *
 * Only observations and human acts are stored. No current state, hold flag,
 * approval verdict, verification verdict or release status is accepted from a
 * workspace file. A structurally readable but procedurally ineffective act is
 * retained for the reader to flag; deleting a bad release record would hide the
 * very control failure this register is meant to surface.
 */

import { dayKey } from '../time.js';
import {
  QNC_ACT_KIND_BY_KEY,
  QNC_CONTAINMENT_METHOD_BY_KEY,
  QNC_DISPOSITION_BY_KEY,
  QNC_IDENTIFIER_KIND_BY_KEY,
  QNC_LIMITS as L,
  QNC_MARKER_KIND,
  QNC_RULE_ID,
  QNC_SOURCE_BY_KEY,
} from './productNonconformanceRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROUTE_RE = /^[A-Za-z0-9:_-]{1,120}(\|[A-Za-z0-9:_-]{1,120}){0,11}$/;
const plain = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const id = (value) => (typeof value === 'string' && ID_RE.test(value) ? value : null);
const uniqueIds = (value, { min = 1, max = L.ownersMax } = {}) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) return null;
  const out = [];
  for (const raw of value) {
    const key = id(raw);
    if (!key || out.includes(key)) return null;
    out.push(key);
  }
  return out;
};
const short = (value, min = L.shortMin, max = L.shortMax) => {
  const text = clean(value, max + 1);
  return text.length >= min && text.length <= max ? text : null;
};
const reference = (value) => short(value, L.refMin, L.refMax);
const prose = (value) => short(value, L.textMin, L.textMax);

/** A default-on pause; a typo or missing setting must never silence the rule. */
export function normalizeQncSettings(raw = {}) {
  const settings = plain(raw) ? raw : {};
  return { qncAutoPropagate: settings.qncAutoPropagate !== false };
}

/** Canonical date-only UTC day or null. */
export function qncDay(value) {
  const day = clean(value, 40);
  if (!DAY_RE.test(day)) return null;
  return dayKey(`${day}T00:00:00.000Z`) === day ? day : null;
}

/** Exact UTC instant or null. A local time is never converted by guessing a zone. */
export function qncInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? value : null;
}

const nowIso = (now) => {
  const at = now instanceof Date ? now : new Date(now);
  return Number.isFinite(at.getTime()) ? at.toISOString() : null;
};
const instantOk = (value, asOf) => Boolean(value && asOf && value <= asOf);
const duplicateValues = (rows, key) => {
  const counts = new Map();
  for (const row of rows) {
    const value = key(row);
    if (value === null || value === undefined || value === '') continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
};
const warnCollection = (warnings, message) => warnings.push(`Product nonconformance: ${message}`);
const countDrop = (warnings, kind, n) => {
  if (n) warnCollection(warnings, `${n} ${kind} row(s) could not be read as a whole declared record; they were refused. No status or evidence was inferred.`);
};

function cappedArray(raw, cap, label, warnings) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnCollection(warnings, `the ${label} ledger was not an array; the unreadable collection was refused.`);
    return [];
  }
  if (raw.length > cap) {
    warnCollection(warnings, `${raw.length} ${label} rows exceed the ${cap}-row limit. The whole ledger was refused; no readable prefix was kept.`);
    return null;
  }
  return raw;
}

export function normalizeQncCases(raw, now, warnings = []) {
  const rows = cappedArray(raw, L.cases, 'case', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const repeatedIds = duplicateValues(rows, (row) => id(row?.id));
  const repeatedRefs = duplicateValues(rows, (row) => {
    const value = short(row?.caseRef, L.shortMin, L.shortMax);
    return value ? value.toLocaleLowerCase('en-US') : null;
  });
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseRef = short(row.caseRef, L.shortMin, L.shortMax);
    const productRef = short(row.productRef);
    const siteRef = short(row.siteRef);
    const identifierKind = QNC_IDENTIFIER_KIND_BY_KEY[row.identifierKind] ? row.identifierKind : null;
    const identifierRef = short(row.identifierRef);
    const sourceKind = QNC_SOURCE_BY_KEY[row.sourceKind] ? row.sourceKind : null;
    const specRef = reference(row.specRef);
    const requirement = prose(row.requirement);
    const finding = prose(row.finding);
    const evidenceRef = reference(row.evidenceRef);
    const identifiedOn = qncDay(row.identifiedOn);
    const ownerIds = uniqueIds(row.ownerIds);
    const declaredById = id(row.declaredById);
    const createdAt = qncInstant(row.createdAt);
    const refKey = caseRef ? caseRef.toLocaleLowerCase('en-US') : null;

    if (!rowId || repeatedIds.has(rowId) || !caseRef || repeatedRefs.has(refKey)
      || !productRef || !siteRef || !identifierKind || !identifierRef || !sourceKind || !specRef
      || !requirement || !finding || !evidenceRef || !identifiedOn || !ownerIds || !declaredById
      || !instantOk(createdAt, asOf) || identifiedOn > (createdAt || '').slice(0, 10)) {
      dropped += 1;
      continue;
    }
    out.push({ id: rowId, caseRef, productRef, siteRef, identifierKind, identifierRef, sourceKind,
      specRef, requirement, finding, evidenceRef, identifiedOn, ownerIds, declaredById, createdAt });
  }
  countDrop(warnings, 'case', dropped);
  return out;
}

export function normalizeQncContainments(raw, cases, now, warnings = []) {
  const rows = cappedArray(raw, L.containments, 'containment', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const parents = new Map(list(cases).map((row) => [row.id, row]));
  const repeated = duplicateValues(rows, (row) => id(row?.id));
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseId = id(row.caseId);
    const parent = caseId ? parents.get(caseId) : null;
    const scope = row.scope === 'entire' || row.scope === 'partial' ? row.scope : null;
    const method = QNC_CONTAINMENT_METHOD_BY_KEY[row.method] ? row.method : null;
    const scopeRef = reference(row.scopeRef);
    const evidenceRef = reference(row.evidenceRef);
    const note = prose(row.note);
    const byId = id(row.byId);
    const recordedAt = qncInstant(row.recordedAt);
    if (!rowId || repeated.has(rowId) || !parent || !scope || !method || !scopeRef || !evidenceRef
      || !note || !byId || !instantOk(recordedAt, asOf) || recordedAt < parent.createdAt) {
      dropped += 1;
      continue;
    }
    out.push({ id: rowId, caseId, scope, method, scopeRef, evidenceRef, note, byId, recordedAt });
  }
  countDrop(warnings, 'containment', dropped);
  return out;
}

export function normalizeQncDecisions(raw, cases, containments, now, warnings = []) {
  const rows = cappedArray(raw, L.decisions, 'disposition-decision', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const parents = new Map(list(cases).map((row) => [row.id, row]));
  const containmentByCase = new Map();
  for (const hold of list(containments)) {
    const found = containmentByCase.get(hold.caseId) || [];
    found.push(hold);
    containmentByCase.set(hold.caseId, found);
  }
  const repeatedIds = duplicateValues(rows, (row) => id(row?.id));
  const candidates = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseId = id(row.caseId);
    const parent = caseId ? parents.get(caseId) : null;
    const decisionRound = Number.isInteger(row.decisionRound) && row.decisionRound >= 1 && row.decisionRound <= L.decisionRoundsMax
      ? row.decisionRound : null;
    const routeIds = uniqueIds(row.routeIds, { max: L.approversMax });
    const routeKey = routeIds ? routeIds.join('|') : null;
    const disposition = QNC_DISPOSITION_BY_KEY[row.disposition] ? row.disposition : null;
    const reason = prose(row.reason);
    const concessionRef = row.concessionRef === null || row.concessionRef === undefined || row.concessionRef === ''
      ? null : reference(row.concessionRef);
    const decidedById = id(row.decidedById);
    const decidedAt = qncInstant(row.decidedAt);
    const holds = containmentByCase.get(caseId) || [];
    const fullHoldByTime = holds.some((hold) => hold.scope === 'entire' && decidedAt && hold.recordedAt <= decidedAt);
    const valid = rowId && !repeatedIds.has(rowId) && parent && decisionRound && routeIds
      && routeIds.every((key, index) => index === 0 || routeIds[index - 1].localeCompare(key) < 0)
      && row.routeKey === routeKey && disposition && reason
      && (disposition === 'use-as-is' ? Boolean(concessionRef) : concessionRef === null)
      && decidedById && routeIds.includes(decidedById) && instantOk(decidedAt, asOf)
      && decidedAt >= parent.createdAt && fullHoldByTime;
    if (!valid) { dropped += 1; continue; }
    candidates.push({ id: rowId, caseId, decisionRound, routeIds, routeKey, disposition,
      reason, concessionRef, decidedById, decidedAt });
  }

  // A round is a distributed signature set. If its route snapshot differs or an
  // apex signs twice, no subset of the set may read as a complete approval.
  const groups = new Map();
  for (const row of candidates) {
    const key = JSON.stringify([row.caseId, row.routeKey, row.decisionRound]);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  const badGroups = new Set();
  for (const [key, group] of groups) {
    const firstRoute = JSON.stringify(group[0].routeIds);
    const actors = group.map((item) => item.decidedById);
    if (group.some((item) => JSON.stringify(item.routeIds) !== firstRoute) || new Set(actors).size !== actors.length) badGroups.add(key);
  }
  const out = [];
  for (const row of candidates) {
    const key = JSON.stringify([row.caseId, row.routeKey, row.decisionRound]);
    if (badGroups.has(key)) { dropped += 1; continue; }
    out.push(row);
  }
  countDrop(warnings, 'disposition-decision', dropped);
  if (badGroups.size) warnCollection(warnings, `${badGroups.size} disposition round(s) contained duplicate or inconsistent apex signatures; every row in each round was refused.`);
  return out;
}

export function normalizeQncDispositionActs(raw, cases, decisions, now, warnings = []) {
  const rows = cappedArray(raw, L.dispositionActs, 'disposition-act', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const parents = new Map(list(cases).map((row) => [row.id, row]));
  const repeatedIds = duplicateValues(rows, (row) => id(row?.id));
  const repeatedSequences = duplicateValues(rows, (row) => {
    const caseId = id(row?.caseId);
    return caseId && Number.isInteger(row?.sequence) ? `${caseId}|${row.sequence}` : null;
  });
  const repeatedKinds = duplicateValues(rows, (row) => {
    const caseId = id(row?.caseId);
    const routeKey = typeof row?.routeKey === 'string' && ROUTE_RE.test(row.routeKey) ? row.routeKey : null;
    const round = Number.isInteger(row?.decisionRound) ? row.decisionRound : null;
    const kind = QNC_ACT_KIND_BY_KEY[row?.kind] ? row.kind : null;
    return caseId && routeKey && round && kind ? `${caseId}|${routeKey}|${round}|${kind}` : null;
  });
  // Acts cite a decision round; even a premature or incompatible act is retained
  // for the reader to report as ineffective, but an entirely unlinked act is not.
  const decisionGroups = new Set(list(decisions).map((row) => JSON.stringify([row.caseId, row.routeKey, row.decisionRound])));
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseId = id(row.caseId);
    const parent = caseId ? parents.get(caseId) : null;
    const routeKey = typeof row.routeKey === 'string' && ROUTE_RE.test(row.routeKey) ? row.routeKey : null;
    const decisionRound = Number.isInteger(row.decisionRound) && row.decisionRound >= 1 && row.decisionRound <= L.decisionRoundsMax
      ? row.decisionRound : null;
    const sequence = Number.isInteger(row.sequence) && row.sequence >= 1 ? row.sequence : null;
    const kind = QNC_ACT_KIND_BY_KEY[row.kind] ? row.kind : null;
    const evidenceRef = reference(row.evidenceRef);
    const note = prose(row.note);
    const performedById = id(row.performedById);
    const performedAt = qncInstant(row.performedAt);
    const groupKey = JSON.stringify([caseId, routeKey, decisionRound]);
    if (!rowId || repeatedIds.has(rowId) || repeatedSequences.has(`${caseId}|${sequence}`)
      || repeatedKinds.has(`${caseId}|${routeKey}|${decisionRound}|${kind}`)
      || !parent || !routeKey || !decisionRound || !sequence || !kind || !evidenceRef || !note
      || !performedById || !instantOk(performedAt, asOf) || !decisionGroups.has(groupKey)
      || performedAt < parent.createdAt) {
      dropped += 1;
      continue;
    }
    out.push({ id: rowId, caseId, routeKey, decisionRound, sequence, kind, evidenceRef, note,
      performedById, performedAt });
  }
  countDrop(warnings, 'disposition-act', dropped);
  return out;
}

export function normalizeQncVerifications(raw, cases, dispositionActs, now, warnings = []) {
  const rows = cappedArray(raw, L.verifications, 're-verification', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const parents = new Map(list(cases).map((row) => [row.id, row]));
  const acts = new Map(list(dispositionActs).map((row) => [row.id, row]));
  const repeatedIds = duplicateValues(rows, (row) => id(row?.id));
  const repeatedCompletions = duplicateValues(rows, (row) => id(row?.completionId));
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseId = id(row.caseId);
    const parent = caseId ? parents.get(caseId) : null;
    const completionId = id(row.completionId);
    const completion = completionId ? acts.get(completionId) : null;
    const routeKey = typeof row.routeKey === 'string' && ROUTE_RE.test(row.routeKey) ? row.routeKey : null;
    const decisionRound = Number.isInteger(row.decisionRound) && row.decisionRound >= 1 && row.decisionRound <= L.decisionRoundsMax
      ? row.decisionRound : null;
    const outcome = row.outcome === 'pass' || row.outcome === 'fail' ? row.outcome : null;
    const evidenceRef = reference(row.evidenceRef);
    const note = prose(row.note);
    const verifiedById = id(row.verifiedById);
    const verifiedAt = qncInstant(row.verifiedAt);
    if (!rowId || repeatedIds.has(rowId) || repeatedCompletions.has(completionId) || !parent
      || !completion || completion.caseId !== caseId || completion.kind !== 'rework-completed'
      || completion.routeKey !== routeKey || completion.decisionRound !== decisionRound
      || !outcome || !evidenceRef || !note || !verifiedById || verifiedById === completion.performedById
      || !instantOk(verifiedAt, asOf) || verifiedAt < completion.performedAt) {
      dropped += 1;
      continue;
    }
    out.push({ id: rowId, caseId, routeKey, decisionRound, completionId, outcome,
      evidenceRef, note, verifiedById, verifiedAt });
  }
  countDrop(warnings, 're-verification', dropped);
  return out;
}

export function normalizeQncMarkers(raw, now, warnings = []) {
  const rows = cappedArray(raw, L.markers, 'observation-marker', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const repeated = duplicateValues(rows, (row) => short(row?.key, L.refMin, L.refMax));
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const key = short(row.key, L.refMin, L.refMax);
    const at = qncInstant(row.at);
    const ruleId = row.ruleId === QNC_RULE_ID ? row.ruleId : null;
    const kind = row.kind === QNC_MARKER_KIND ? row.kind : null;
    const detail = prose(row.detail);
    if (!key || repeated.has(key) || !instantOk(at, asOf) || !ruleId || !kind || !detail) { dropped += 1; continue; }
    out.push({ key, at, ruleId, kind, detail });
  }
  countDrop(warnings, 'observation-marker', dropped);
  return out;
}
