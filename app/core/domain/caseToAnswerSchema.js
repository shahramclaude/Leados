/**
 * app/core/domain/caseToAnswerSchema.js — fail-closed storage contract for
 * ADR-0254 (Schema v207).
 *
 * Only declarations and dated human acts are stored. No review state, finding
 * verdict, sanction, appeal outcome, independence verdict or seniority verdict is
 * ever accepted from a workspace file. A structurally readable but procedurally
 * ineffective act is KEPT for the reader to flag: deleting a second decision or a
 * finding recorded by an interested hand would erase exactly the control failure
 * this register exists to surface.
 *
 * Three refusals are deliberate and loud:
 *   1. an allegation with no written standard, no written statement or no evidence
 *      reference is DROPPED, because none of the three can be invented later;
 *   2. a case with no readable allegation is DROPPED whole — a case nobody can
 *      state is not a case;
 *   3. a row that names a party not on the roster is KEPT but its party resolution
 *      is printed as unresolved, because deleting it would hide an allegation
 *      against a person the workspace can no longer see.
 */

import { dayKey } from '../time.js';
import {
  DGI_ALLEGATION_CLASS_BY_KEY,
  DGI_DIRECTION_KIND_BY_KEY,
  DGI_CASE_KIND_BY_KEY,
  DGI_DEFAULT_STANDARD,
  DGI_FINDING_BY_KEY,
  DGI_LIMITS as L,
  DGI_MARKER_KIND,
  DGI_RULE_ID,
  DGI_SANCTION_BY_KEY,
  DGI_SETTING_KEYS,
  DGI_STANDARD_BY_KEY,
  DGI_WITHDRAWAL_REASON_BY_KEY,
  DGI_BOUNDS,
} from './caseToAnswerRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const plain = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const id = (value) => (typeof value === 'string' && ID_RE.test(value) ? value : null);

const short = (value, min = L.shortMin, max = L.shortMax) => {
  const text = clean(value, max + 1);
  return text.length >= min && text.length <= max ? text : null;
};
const reference = (value) => short(value, L.refMin, L.refMax);
const prose = (value) => short(value, L.textMin, L.textMax);

/** A default-on pause: a missing setting must never be read as a deliberate switch-off. */
export function normalizeDgiSettings(raw = {}) {
  const settings = plain(raw) ? raw : {};
  const clamp = (value, bounds, fallback) => {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(bounds.max, Math.max(bounds.min, n));
  };
  return {
    dgiAutoPropagate: settings.dgiAutoPropagate !== false,
    dgiPrivacyFloor: clamp(settings.dgiPrivacyFloor, DGI_BOUNDS.dgiPrivacyFloor, DGI_BOUNDS.dgiPrivacyFloor.fallback),
    dgiAppealWindowDays: clamp(settings.dgiAppealWindowDays, DGI_BOUNDS.dgiAppealWindowDays, DGI_BOUNDS.dgiAppealWindowDays.fallback),
    dgiDecisionWindowDays: clamp(settings.dgiDecisionWindowDays, DGI_BOUNDS.dgiDecisionWindowDays, DGI_BOUNDS.dgiDecisionWindowDays.fallback),
    dgiFindingWindowDays: clamp(settings.dgiFindingWindowDays, DGI_BOUNDS.dgiFindingWindowDays, DGI_BOUNDS.dgiFindingWindowDays.fallback),
  };
}

/** Canonical date-only UTC day or null. A local date is never converted by guessing a zone. */
export function dgiDay(value) {
  const day = clean(value, 40);
  if (!DAY_RE.test(day)) return null;
  return dayKey(`${day}T00:00:00.000Z`) === day ? day : null;
}

/** Exact UTC instant or null. */
export function dgiInstant(value) {
  if (typeof value !== 'string' || !INSTANT_RE.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? value : null;
}

const nowIso = (value) => {
  const at = value instanceof Date ? value : new Date(value);
  return Number.isFinite(at.getTime()) ? at.toISOString() : null;
};

const duplicateValues = (rows, key) => {
  const counts = new Map();
  for (const row of rows) {
    const value = key(row);
    if (value === null || value === undefined || value === '') continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
};

const warn = (warnings, message) => warnings.push(`Fair process: ${message}`);
const countDrop = (warnings, n, kind) => {
  if (n) warn(warnings, `${n} ${kind} row(s) could not be read as a whole declared record and were refused. No finding, sanction or verdict was inferred from them.`);
};

function cappedArray(raw, cap, label, warnings) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warn(warnings, `the ${label} ledger was not an array; the unreadable collection was refused.`);
    return [];
  }
  if (raw.length > cap) {
    warn(warnings, `${raw.length} ${label} rows exceed the ${cap}-row limit. The whole ledger was refused; no readable prefix was kept.`);
    return null;
  }
  return raw;
}

/** An allegation is the smallest thing a case can be about, so it is validated hardest. */
export function normalizeDgiAllegations(raw, now, warnings = []) {
  const rows = cappedArray(raw, L.allegations, 'allegation', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const repeated = duplicateValues(rows, (row) => id(row?.id));
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseId = id(row.caseId);
    const cls = DGI_ALLEGATION_CLASS_BY_KEY[row.classKey] ? row.classKey : null;
    const statement = prose(row.statement);
    const standardRef = reference(row.standardRef);
    const standardText = prose(row.standardText);
    const evidenceRef = reference(row.evidenceRef);
    const raisedOn = dgiDay(row.raisedOn);
    const createdAt = dgiInstant(row.createdAt);
    if (!rowId || repeated.has(rowId) || !caseId || !cls || !statement || !standardRef || !standardText
      || !evidenceRef || !raisedOn || !createdAt || !asOf || createdAt > asOf) {
      dropped += 1;
      continue;
    }
    out.push(Object.freeze({
      id: rowId,
      caseId,
      classKey: cls,
      statement,
      standardRef,
      standardText,
      evidenceRef,
      raisedOn,
      sequence: Number.isInteger(row.sequence) && row.sequence >= 1 && row.sequence <= L.allegationsPerCaseMax ? row.sequence : null,
      createdAt,
    }));
  }
  countDrop(warnings, dropped, 'allegation');
  return out;
}

export function normalizeDgiCases(raw, allegations, people, now, warnings = []) {
  const rows = cappedArray(raw, L.cases, 'case', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const roster = new Map(list(people).filter((row) => row && typeof row.id === 'string').map((row) => [row.id, row]));
  const repeatedIds = duplicateValues(rows, (row) => id(row?.id));
  const repeatedRefs = duplicateValues(rows, (row) => {
    const value = short(row?.caseRef, L.shortMin, L.shortMax);
    return value ? value.toLocaleLowerCase('en-US') : null;
  });
  const byCase = new Map();
  for (const allegation of list(allegations)) {
    const bucket = byCase.get(allegation.caseId) || [];
    bucket.push(allegation);
    byCase.set(allegation.caseId, bucket);
  }
  const out = [];
  let dropped = 0;
  let orphanDropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseRef = short(row.caseRef, L.shortMin, L.shortMax);
    const caseKind = DGI_CASE_KIND_BY_KEY[row.caseKind] ? row.caseKind : null;
    const standard = DGI_STANDARD_BY_KEY[row.standardOfProof] ? row.standardOfProof : null;
    const subjectId = id(row.subjectId);
    const raisedById = row.raisedById === null || row.raisedById === undefined || row.raisedById === '' ? null : id(row.raisedById);
    const basisRef = reference(row.basisRef);
    const openedOn = dgiDay(row.openedOn);
    const declaredById = id(row.declaredById);
    const createdAt = dgiInstant(row.createdAt);
    const mine = byCase.get(rowId) || [];
    const supervisorRef = row.supervisorRef === null || row.supervisorRef === undefined || row.supervisorRef === '' ? null : reference(row.supervisorRef);

    // A case with nothing to answer is not a case. This is the one refusal that
    // drops the whole row rather than printing it: every downstream act would be
    // an act on an empty page.
    if (!rowId || repeatedIds.has(rowId) || !caseRef || repeatedRefs.has(caseRef.toLocaleLowerCase('en-US'))
      || !caseKind || !standard || !subjectId || !basisRef || !openedOn || !declaredById || !createdAt
      || !asOf || createdAt > asOf || !mine.length) {
      dropped += 1;
      continue;
    }
    if (raisedById && raisedById === subjectId) {
      // One person cannot be both the subject of a complaint and the person who
      // raised it. This is not a merge of two people; it is an unreadable record.
      dropped += 1;
      continue;
    }
    out.push(Object.freeze({
      id: rowId,
      caseRef,
      caseKind,
      // The superior who set the directions and the standard at opening. Declared,
      // never taken from the org chart, because a case is opened by a hand that has
      // the authority to open it.
      supervisorRef,
      standardOfProof: standard,
      subjectId,
      subjectResolved: roster.has(subjectId),
      raisedById,
      raisedByResolved: raisedById ? roster.has(raisedById) : false,
      basisRef,
      basisText: row.basisText === undefined ? '' : clean(row.basisText, L.textMax),
      openedOn,
      declaredById,
      createdAt,
    }));
  }
  // An allegation pointing at a case that does not exist is not an allegation, and
  // an allegation pointing at a DROPPED case would keep that case alive through the
  // back door, so the orphan count is printed in its own warning.
  const liveCaseIds = new Set(out.map((row) => row.id));
  orphanDropped = list(allegations).filter((row) => !liveCaseIds.has(row.caseId)).length;
  countDrop(warnings, dropped, 'case');
  if (orphanDropped) warn(warnings, `${orphanDropped} allegation(s) name a case that is not on the record and were refused with it.`);
  return out;
}

export function normalizeDgiInvestigators(raw, cases, now, warnings = []) {
  const rows = cappedArray(raw, L.investigators, 'investigator assignment', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const caseIds = new Set(list(cases).map((row) => row.id));
  const repeated = duplicateValues(rows, (row) => id(row?.id));
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseId = id(row.caseId);
    const investigatorId = id(row.investigatorId);
    const termsRef = reference(row.termsRef);
    const termsText = prose(row.termsText);
    const assignedOn = dgiDay(row.assignedOn);
    const assignedById = id(row.assignedById);
    const createdAt = dgiInstant(row.createdAt);
    if (!rowId || repeated.has(rowId) || !caseId || !caseIds.has(caseId) || !investigatorId || !termsRef
      || !termsText || !assignedOn || !assignedById || !createdAt || !asOf || createdAt > asOf) {
      dropped += 1;
      continue;
    }
    out.push(Object.freeze({
      id: rowId,
      caseId,
      investigatorId,
      termsRef,
      termsText,
      assignedOn,
      assignedById,
      createdAt,
    }));
  }
  countDrop(warnings, dropped, 'investigator assignment');
  return out;
}

export function normalizeDgiDirections(raw, cases, now, warnings = []) {
  const rows = cappedArray(raw, L.directions, 'direction', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const caseIds = new Set(list(cases).map((row) => row.id));
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseId = id(row.caseId);
    const kind = DGI_DIRECTION_KIND_BY_KEY[row.kind] ? row.kind : null;
    const note = prose(row.note);
    const recordedOn = dgiDay(row.recordedOn);
    const recordedById = id(row.recordedById);
    const createdAt = dgiInstant(row.createdAt);
    if (!rowId || !caseId || !caseIds.has(caseId) || !kind || !note || !recordedOn || !recordedById
      || !createdAt || !asOf || createdAt > asOf) {
      dropped += 1;
      continue;
    }
    out.push(Object.freeze({
      id: rowId,
      caseId,
      kind,
      note,
      recordedOn,
      recordedById,
      createdAt,
    }));
  }
  countDrop(warnings, dropped, 'direction');
  return out;
}

export function normalizeDgiFindings(raw, cases, allegations, now, warnings = []) {
  const rows = cappedArray(raw, L.findings, 'finding', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const caseIds = new Set(list(cases).map((row) => row.id));
  const allegationIds = new Set(list(allegations).map((row) => row.id));
  const repeated = duplicateValues(rows, (row) => id(row?.id));
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseId = id(row.caseId);
    const allegationId = id(row.allegationId);
    const outcome = DGI_FINDING_BY_KEY[row.outcome] ? row.outcome : null;
    const standard = DGI_STANDARD_BY_KEY[row.standardOfProof] ? row.standardOfProof : null;
    const reason = prose(row.reason);
    const evidenceRef = reference(row.evidenceRef);
    const foundOn = dgiDay(row.foundOn);
    const foundById = id(row.foundById);
    const createdAt = dgiInstant(row.createdAt);
    if (!rowId || repeated.has(rowId) || !caseId || !caseIds.has(caseId) || !allegationId
      || !allegationIds.has(allegationId) || !outcome || !standard || !reason || !evidenceRef
      || !foundOn || !foundById || !createdAt || !asOf || createdAt > asOf) {
      dropped += 1;
      continue;
    }
    out.push(Object.freeze({
      id: rowId,
      caseId,
      allegationId,
      outcome,
      standardOfProof: standard,
      reason,
      evidenceRef,
      foundOn,
      foundById,
      createdAt,
    }));
  }
  countDrop(warnings, dropped, 'finding');
  return out;
}

export function normalizeDgiDecisions(raw, cases, now, warnings = []) {
  const rows = cappedArray(raw, L.decisions, 'decision', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const caseIds = new Set(list(cases).map((row) => row.id));
  const repeated = duplicateValues(rows, (row) => id(row?.id));
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseId = id(row.caseId);
    const sanction = DGI_SANCTION_BY_KEY[row.sanction] ? row.sanction : null;
    const reason = prose(row.reason);
    const decidedOn = dgiDay(row.decidedOn);
    const decidedById = id(row.decidedById);
    const createdAt = dgiInstant(row.createdAt);
    // A sanction with an expiry has a day; the ladder's own warning rungs carry
    // one. Nothing here defaults an expiry: a warning with no end is printed as
    // "no expiry declared", never as permanent by accident.
    const expiresOn = row.expiresOn === null || row.expiresOn === undefined || row.expiresOn === '' ? null : dgiDay(row.expiresOn);
    const effectiveOn = row.effectiveOn === null || row.effectiveOn === undefined || row.effectiveOn === '' ? null : dgiDay(row.effectiveOn);
    if (!rowId || repeated.has(rowId) || !caseId || !caseIds.has(caseId) || !sanction || !reason
      || !decidedOn || !decidedById || !createdAt || !asOf || createdAt > asOf) {
      dropped += 1;
      continue;
    }
    if (expiresOn && expiresOn < decidedOn) { dropped += 1; continue; }
    out.push(Object.freeze({
      id: rowId,
      caseId,
      sanction,
      reason,
      decidedOn,
      decidedById,
      expiresOn,
      effectiveOn,
      createdAt,
    }));
  }
  countDrop(warnings, dropped, 'decision');
  return out;
}

export function normalizeDgiAppeals(raw, cases, decisions, now, warnings = []) {
  const rows = cappedArray(raw, L.appeals, 'appeal', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const caseIds = new Set(list(cases).map((row) => row.id));
  const decisionByCase = new Map(list(decisions).map((row) => [row.caseId, row]));
  const repeated = duplicateValues(rows, (row) => id(row?.id));
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseId = id(row.caseId);
    const grounds = prose(row.grounds);
    const lodgedOn = dgiDay(row.lodgedOn);
    const lodgedById = id(row.lodgedById);
    const createdAt = dgiInstant(row.createdAt);
    const decision = decisionByCase.get(caseId) || null;
    if (!rowId || repeated.has(rowId) || !caseId || !caseIds.has(caseId) || !decision || !grounds
      || !lodgedOn || !lodgedById || !createdAt || !asOf || createdAt > asOf) {
      dropped += 1;
      continue;
    }
    out.push(Object.freeze({
      id: rowId,
      caseId,
      decisionId: decision.id,
      grounds,
      lodgedOn,
      lodgedById,
      createdAt,
    }));
  }
  countDrop(warnings, dropped, 'appeal');
  return out;
}

/**
 * APPEAL OUTCOMES ARE A SEPARATE LEDGER, NOT A FIELD ON THE DECISION.
 *
 * An appeal may reduce, confirm or increase, and the appeal may substitute its own
 * sanction. Keeping it in its own ledger is what makes "the appeal outcome stands"
 * a derived fact rather than a mutation of the original decision: the decision row
 * is never rewritten, so a later reader can see both.
 */
export function normalizeDgiAppealOutcomes(raw, appeals, now, warnings = []) {
  const rows = cappedArray(raw, L.appealOutcomes, 'appeal outcome', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const appealIds = new Set(list(appeals).map((row) => row.id));
  const repeated = duplicateValues(rows, (row) => id(row?.id));
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const appealId = id(row.appealId);
    const outcome = row.outcome === 'allowed' || row.outcome === 'refused' || row.outcome === 'varied' ? row.outcome : null;
    const reason = prose(row.reason);
    const sanction = row.sanction === null || row.sanction === undefined || row.sanction === '' ? null
      : (DGI_SANCTION_BY_KEY[row.sanction] ? row.sanction : undefined);
    const decidedOn = dgiDay(row.decidedOn);
    const decidedById = id(row.decidedById);
    const createdAt = dgiInstant(row.createdAt);
    if (!rowId || repeated.has(rowId) || !appealId || !appealIds.has(appealId) || !outcome || !reason
      || sanction === undefined || !decidedOn || !decidedById || !createdAt || !asOf || createdAt > asOf) {
      dropped += 1;
      continue;
    }
    // A varied outcome carries the substituted sanction; an allowed or refused
    // outcome carries none. A refused appeal that also states a new sanction is a
    // contradictory record, so it is refused rather than interpreted.
    if (outcome === 'varied' && !sanction) { dropped += 1; continue; }
    if (outcome !== 'varied' && sanction) { dropped += 1; continue; }
    out.push(Object.freeze({
      id: rowId,
      appealId,
      outcome,
      sanction,
      reason,
      decidedOn,
      decidedById,
      createdAt,
    }));
  }
  countDrop(warnings, dropped, 'appeal outcome');
  return out;
}

export function normalizeDgiWithdrawals(raw, cases, now, warnings = []) {
  const rows = cappedArray(raw, L.withdrawals, 'withdrawal', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const caseIds = new Set(list(cases).map((row) => row.id));
  const repeated = duplicateValues(rows, (row) => id(row?.id));
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const caseId = id(row.caseId);
    const reasonKey = DGI_WITHDRAWAL_REASON_BY_KEY[row.reasonKey] ? row.reasonKey : null;
    const basis = prose(row.basis);
    const withdrawnOn = dgiDay(row.withdrawnOn);
    const withdrawnById = id(row.withdrawnById);
    const successorRef = row.successorRef === null || row.successorRef === undefined || row.successorRef === '' ? null : reference(row.successorRef);
    const createdAt = dgiInstant(row.createdAt);
    if (!rowId || repeated.has(rowId) || !caseId || !caseIds.has(caseId) || !reasonKey || !basis
      || !withdrawnOn || !withdrawnById || !createdAt || !asOf || createdAt > asOf) {
      dropped += 1;
      continue;
    }
    if (reasonKey === 'superseded' && !successorRef) { dropped += 1; continue; }
    if (reasonKey !== 'superseded' && successorRef) { dropped += 1; continue; }
    out.push(Object.freeze({
      id: rowId,
      caseId,
      reasonKey,
      basis,
      successorRef,
      withdrawnOn,
      withdrawnById,
      createdAt,
    }));
  }
  countDrop(warnings, dropped, 'withdrawal');
  return out;
}

export function normalizeDgiMarkers(raw, now, warnings = []) {
  const rows = cappedArray(raw, L.markers, 'observation marker', warnings);
  if (!rows) return [];
  const asOf = nowIso(now);
  const out = [];
  let dropped = 0;
  for (const row of rows) {
    if (!plain(row)) { dropped += 1; continue; }
    const key = typeof row.key === 'string' && /^dgi1:[a-z-]+:[A-Za-z0-9:_-]{1,120}$/.test(row.key) ? row.key : null;
    const at = dgiInstant(row.at);
    const detail = clean(row.detail, 400);
    if (!key || !at || !detail || !asOf || at > asOf) { dropped += 1; continue; }
    out.push(Object.freeze({
      key,
      at,
      ruleId: row.ruleId === DGI_RULE_ID ? DGI_RULE_ID : null,
      kind: row.kind === DGI_MARKER_KIND ? DGI_MARKER_KIND : null,
      detail,
    }));
  }
  countDrop(warnings, dropped, 'observation marker');
  return out;
}

export { DGI_DEFAULT_STANDARD, DGI_SETTING_KEYS };
