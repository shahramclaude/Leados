/**
 * app/core/domain/standardRevisionSchema.js — fail-closed storage contract for
 * the Standard-Work Revision Register (ADR-0237, Schema v192).
 *
 * The loader never repairs a revision. A row that cannot be read exactly is
 * dropped and counted in the load warnings, and a row that does not continue
 * an unbroken chain — wrong sequence number, a prior text that is not the text
 * before it, a day that does not move forward, an approver who is the owner,
 * an owner missing from the people owed the text — drops EVERY later revision
 * of the same routine too. A chain with a gap in it cannot say what the
 * standard was on a given day, so the honest reading of a broken chain is that
 * the register cannot vouch for anything after the break.
 */

import { standardWorkDay } from './standardWorkSchema.js';
import { STANDARD_REVISION_LIMITS as L } from './standardRevisionRegistry.js';

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;

/** A string that is trimmed and kept only if it lies within [min, max]. Never truncated. */
function exactText(value, min, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}
function idOf(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length <= L.idMax && ID_RE.test(trimmed) ? trimmed : null;
}
function stampOf(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value.trim());
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
function integerIn(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/** One row read exactly, or null. Chain checks happen after, against the routine. */
function parseRevision(row, routineById) {
  if (!isPlainObject(row)) return null;
  const id = idOf(row.id);
  const routineId = idOf(row.routineId);
  const routine = routineId ? routineById.get(routineId) : null;
  const revisionNo = integerIn(row.revisionNo, 1, L.revisions);
  const priorRevisionNo = integerIn(row.priorRevisionNo, 0, L.revisions);
  const priorStandard = exactText(row.priorStandard, L.standardMin, L.standardMax);
  const standard = exactText(row.standard, L.standardMin, L.standardMax);
  const changedStep = exactText(row.changedStep, L.changedStepMin, L.changedStepMax);
  const basis = exactText(row.basis, L.basisMin, L.basisMax);
  const approverId = idOf(row.approverId);
  const approvedOn = standardWorkDay(row.approvedOn);
  const approvedAt = stampOf(row.approvedAt);
  const effectiveOn = standardWorkDay(row.effectiveOn);
  const briefeeRaw = Array.isArray(row.briefeeIds) ? row.briefeeIds.map(idOf) : null;
  const briefeeIds = briefeeRaw && briefeeRaw.every(Boolean) && new Set(briefeeRaw).size === briefeeRaw.length
    && briefeeRaw.length >= 1 && briefeeRaw.length <= L.briefeesMax ? briefeeRaw : null;
  if (!id || !routine || revisionNo === null || priorRevisionNo === null || !priorStandard || !standard
    || !changedStep || !basis || !approverId || !approvedOn || !approvedAt || !effectiveOn || !briefeeIds) return null;
  return {
    id, routineId, revisionNo, priorRevisionNo, priorStandard, standard, changedStep, basis,
    approverId, approvedOn, approvedAt, effectiveOn, briefeeIds,
  };
}

/**
 * The revision ledger. `routines` is the already-normalised routine list, so a
 * revision naming a routine the loader itself dropped is refused rather than
 * kept against a phantom.
 */
export function normalizeStandardRevisions(raw, routines = [], warnings = []) {
  const list = Array.isArray(raw) ? raw : [];
  const routineById = new Map((Array.isArray(routines) ? routines : []).filter(isPlainObject).map((row) => [row.id, row]));
  const seenIds = new Set();
  const groups = new Map();
  let unreadable = 0;
  for (const row of list) {
    const parsed = parseRevision(row, routineById);
    if (!parsed || seenIds.has(parsed.id)) { unreadable += 1; continue; }
    seenIds.add(parsed.id);
    if (!groups.has(parsed.routineId)) groups.set(parsed.routineId, []);
    groups.get(parsed.routineId).push(parsed);
  }

  const out = [];
  let chainDropped = 0;
  for (const [routineId, group] of groups) {
    const routine = routineById.get(routineId);
    group.sort((a, b) => a.revisionNo - b.revisionNo);
    let prior = routine.standard;
    let priorDay = null;
    let expected = 1;
    let broken = false;
    for (const rev of group) {
      const continues = !broken
        && rev.revisionNo === expected
        && rev.priorRevisionNo === expected - 1
        && rev.priorStandard === prior
        && rev.standard !== rev.priorStandard
        && (priorDay === null || rev.effectiveOn > priorDay)
        && rev.approvedOn <= rev.effectiveOn
        && rev.effectiveOn >= routine.fromDay
        && rev.approverId !== routine.ownerId
        && rev.briefeeIds.includes(routine.ownerId);
      if (!continues) { broken = true; chainDropped += 1; continue; }
      out.push(rev);
      prior = rev.standard;
      priorDay = rev.effectiveOn;
      expected += 1;
    }
  }

  if (unreadable) warnings.push(`${unreadable} standard-revision row(s) could not be read exactly and were dropped rather than repaired.`);
  if (chainDropped) warnings.push(`${chainDropped} standard-revision row(s) did not continue an unbroken, correctly sequenced chain and were dropped; later revisions of the same routine were dropped with them.`);
  return out;
}

/**
 * The briefing ledger. A briefing is kept only if it names a surviving
 * revision, a person that revision says owes the text, a day on or after its
 * approval, and is the only briefing of that person for that revision.
 */
export function normalizeStandardRevisionBriefs(raw, revisions = [], warnings = []) {
  const list = Array.isArray(raw) ? raw : [];
  const revisionById = new Map((Array.isArray(revisions) ? revisions : []).map((row) => [row.id, row]));
  const seenIds = new Set();
  const seenPairs = new Set();
  const out = [];
  let dropped = 0;
  for (const row of list) {
    const id = isPlainObject(row) ? idOf(row.id) : null;
    const revisionId = isPlainObject(row) ? idOf(row.revisionId) : null;
    const personId = isPlainObject(row) ? idOf(row.personId) : null;
    const rev = revisionId ? revisionById.get(revisionId) : null;
    const briefedOn = isPlainObject(row) ? standardWorkDay(row.briefedOn) : null;
    const briefedAt = isPlainObject(row) ? stampOf(row.briefedAt) : null;
    const briefedById = isPlainObject(row) ? idOf(row.briefedById) : null;
    const pair = `${revisionId}|${personId}`;
    if (!id || !rev || !personId || !rev.briefeeIds.includes(personId) || !briefedOn || briefedOn < rev.approvedOn
      || !briefedAt || !briefedById || seenIds.has(id) || seenPairs.has(pair)) {
      dropped += 1;
      continue;
    }
    seenIds.add(id);
    seenPairs.add(pair);
    out.push({ id, revisionId, personId, briefedOn, briefedAt, briefedById });
  }
  if (dropped) warnings.push(`${dropped} standard-briefing row(s) could not be read exactly, named an unknown revision or person, or were dated before approval, and were dropped rather than repaired.`);
  return out;
}
