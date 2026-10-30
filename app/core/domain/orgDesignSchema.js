/**
 * app/core/domain/orgDesignSchema.js — the stored contract for Schema v53.
 *
 * `orgDesign.js` is the analysis; this module decides what a half-written,
 * hand-edited or older design is allowed to become on load. The rules follow
 * every other ledger in this app, with two that are specific to changing a
 * reporting line:
 *
 *  - **A move is a claim about one person's manager, and it is preserved even
 *    when that person has since left the roster.** The history of a structural
 *    decision must stay readable after the structure changed again; a row whose
 *    person or manager is gone is kept and flagged, never silently dropped, and
 *    `commitOrgDesign` refuses to apply one.
 *  - **`previousManagers` is evidence, not a cache.** It records what the
 *    reporting line was at the moment the design was applied, so `revert` can
 *    restore exactly that line rather than "whatever it was before you edited",
 *    and so the frozen snapshot and the roster can be reconciled later. It is
 *    never recomputed on load: recomputing it would rewrite history.
 *  - **A frozen snapshot is preserved exactly.** Re-deriving a committed design
 *    from today's roster would rewrite the prediction the design is graded
 *    against, which is the only thing the snapshot is for.
 */

import { dayKey } from '../time.js';
import { ORG_CONVENTIONS, ORG_DESIGN_STATUSES } from './orgDesign.js';

export const ORG_DESIGN_SNAPSHOT_VERSION = 1;
export const ORG_DESIGN_MAX_MOVES = 120;
export const ORG_DESIGN_MAX_LABEL = 140;
export const ORG_DESIGN_MAX_PURPOSE = 1200;
export const ORG_DESIGN_MAX_NOTE = 400;
export const ORG_DESIGN_HISTORY_CAP = 40;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function clean(text, max) {
  return str(text).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function day(value) {
  const raw = str(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function isoOrNull(value) {
  const raw = str(value).trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeOrgConventions(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const spanMin = clampInt(source.spanMin, 1, 30, ORG_CONVENTIONS.spanMin);
  const spanMax = clampInt(source.spanMax, spanMin + 1, 40, Math.max(spanMin + 1, ORG_CONVENTIONS.spanMax));
  return {
    spanMin,
    spanMax,
    coordinationHoursPerWeek: clampNumber(source.coordinationHoursPerWeek, 0, 12, ORG_CONVENTIONS.coordinationHoursPerWeek),
    loadedHoursPerWeek: clampInt(source.loadedHoursPerWeek, 20, 80, ORG_CONVENTIONS.loadedHoursPerWeek),
    reviewHorizonDays: clampInt(source.reviewHorizonDays, 30, 730, ORG_CONVENTIONS.reviewHorizonDays),
    queueWindowWeeks: clampInt(source.queueWindowWeeks, 4, 52, ORG_CONVENTIONS.queueWindowWeeks),
    minQueueSample: clampInt(source.minQueueSample, 2, 20, ORG_CONVENTIONS.minQueueSample),
    assumedCa: clampNumber(source.assumedCa, 0.1, 3, ORG_CONVENTIONS.assumedCa),
    minScoredOutcomes: clampInt(source.minScoredOutcomes, 2, 20, ORG_CONVENTIONS.minScoredOutcomes),
  };
}

function normalizeMoves(raw, state, designId, warnings) {
  const rows = Array.isArray(raw) ? raw : [];
  const personIds = new Set((state?.people || []).map((person) => person.id));
  const seen = new Set();
  const out = [];
  let danglingPerson = 0;
  let danglingManager = 0;
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const personId = str(row.personId).trim();
    if (!personId) {
      warnings.push(`Org design: dropped a move on “${designId}” with no person reference`);
      continue;
    }
    if (seen.has(personId)) {
      warnings.push(`Org design: dropped a duplicate move for the same person on “${designId}” — a person can have one manager`);
      continue;
    }
    seen.add(personId);
    if (!personIds.has(personId)) danglingPerson += 1;
    const toManagerId = row.toManagerId === null || row.toManagerId === undefined || row.toManagerId === ''
      ? null
      : str(row.toManagerId).trim();
    if (toManagerId && !personIds.has(toManagerId)) danglingManager += 1;
    out.push({
      personId,
      toManagerId: toManagerId || null,
      note: clean(row.note, ORG_DESIGN_MAX_NOTE),
    });
    if (out.length >= ORG_DESIGN_MAX_MOVES) break;
  }
  if (danglingPerson) warnings.push(`Org design: ${danglingPerson} move(s) on “${designId}” name a person who is no longer in the roster; they are kept as history and will block a commit`);
  if (danglingManager) warnings.push(`Org design: ${danglingManager} move(s) on “${designId}” name a manager who is no longer in the roster; they are kept as history and will block a commit`);
  return out;
}

/**
 * `previousManagers` is a frozen list of `{ personId, managerId }` pairs taken
 * at commit. A pair with a missing person is retained: the record of what the
 * line was is the only thing `revert` can restore from.
 */
function normalizePrevious(raw, designId, warnings) {
  const rows = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const personId = str(row.personId).trim();
    if (!personId || seen.has(personId)) continue;
    seen.add(personId);
    out.push({
      personId,
      managerId: row.managerId === null || row.managerId === undefined || row.managerId === '' ? null : str(row.managerId).trim(),
    });
    if (out.length >= ORG_DESIGN_MAX_MOVES) break;
  }
  if (out.length !== rows.length) warnings.push(`Org design: ${rows.length - out.length} blank or duplicate previous-manager row(s) on “${designId}” were dropped`);
  return out;
}

function normalizeSnapshot(raw) {
  if (!isPlainObject(raw)) return null;
  const predicted = isPlainObject(raw.predicted) ? raw.predicted : {};
  const perManager = isPlainObject(predicted.perManager) ? predicted.perManager : {};
  const boundedPerManager = Object.fromEntries(
    Object.entries(perManager).slice(0, 40).map(([key, value]) => [key, {
      modelledWaitP80Weeks: Number.isFinite(Number(value?.modelledWaitP80Weeks)) ? Number(value.modelledWaitP80Weeks) : null,
      spanBefore: Number.isFinite(Number(value?.spanBefore)) ? Number(value.spanBefore) : null,
      spanAfter: Number.isFinite(Number(value?.spanAfter)) ? Number(value.spanAfter) : null,
    }]),
  );
  return {
    version: ORG_DESIGN_SNAPSHOT_VERSION,
    capturedAt: isoOrNull(raw.capturedAt),
    byId: raw.byId ? str(raw.byId) : null,
    appliedMoves: Array.isArray(raw.appliedMoves) ? raw.appliedMoves.slice(0, ORG_DESIGN_MAX_MOVES).map((row) => ({
      personId: str(row?.personId),
      fromManagerId: row?.fromManagerId ? str(row.fromManagerId) : null,
      toManagerId: row?.toManagerId ? str(row.toManagerId) : null,
    })) : [],
    previousManagers: normalizePrevious(raw.previousManagers, 'snapshot', []),
    after: isPlainObject(raw.after) ? {
      headcount: Number.isFinite(Number(raw.after.headcount)) ? Number(raw.after.headcount) : null,
      layers: Number.isFinite(Number(raw.after.layers)) ? Number(raw.after.layers) : null,
      maxSpan: Number.isFinite(Number(raw.after.maxSpan)) ? Number(raw.after.maxSpan) : null,
      overBandCount: Number.isFinite(Number(raw.after.overBandCount)) ? Number(raw.after.overBandCount) : null,
      coordinationHoursPerWeek: Number.isFinite(Number(raw.after.coordinationHoursPerWeek)) ? Number(raw.after.coordinationHoursPerWeek) : null,
      annualCost: Number.isFinite(Number(raw.after.annualCost)) ? Number(raw.after.annualCost) : null,
      pricedShare: Number.isFinite(Number(raw.after.pricedShare)) ? Number(raw.after.pricedShare) : null,
      medianServiceDays: Number.isFinite(Number(raw.after.medianServiceDays)) ? Number(raw.after.medianServiceDays) : null,
      measuredManagers: Number.isFinite(Number(raw.after.measuredManagers)) ? Number(raw.after.measuredManagers) : null,
    } : null,
    predicted: {
      modelledWaitP80Weeks: Number.isFinite(Number(predicted.modelledWaitP80Weeks)) ? Number(predicted.modelledWaitP80Weeks) : null,
      measuredWaitP80Weeks: Number.isFinite(Number(predicted.measuredWaitP80Weeks)) ? Number(predicted.measuredWaitP80Weeks) : null,
      overBandCount: Number.isFinite(Number(predicted.overBandCount)) ? Number(predicted.overBandCount) : null,
      coordinationHoursPerWeek: Number.isFinite(Number(predicted.coordinationHoursPerWeek)) ? Number(predicted.coordinationHoursPerWeek) : null,
      perManager: boundedPerManager,
    },
    declared: isPlainObject(raw.declared) ? { ...normalizeOrgConventions(raw.declared) } : normalizeOrgConventions({}),
    moved: Number.isFinite(Number(raw.moved)) ? Number(raw.moved) : null,
    note: str(raw.note).slice(0, 500),
  };
}

export function normalizeOrgDesigns(raw, state, now = new Date(), warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const personIds = new Set((state?.people || []).map((person) => person.id));
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const id = str(row.id).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const status = ORG_DESIGN_STATUSES.includes(row.status) ? row.status : 'draft';
    const ownerId = str(row.ownerId).trim();
    if (ownerId && !personIds.has(ownerId)) {
      warnings.push(`Org design: “${id}” named an owner who is no longer in the roster; the owner is now unset`);
    }
    out.push({
      id,
      label: clean(row.label, ORG_DESIGN_MAX_LABEL) || 'Untitled structural design',
      purpose: clean(row.purpose, ORG_DESIGN_MAX_PURPOSE),
      ownerId: ownerId && personIds.has(ownerId) ? ownerId : null,
      status,
      declaredOn: day(row.declaredOn) || dayKey(now),
      committedOn: day(row.committedOn),
      reviewOn: day(row.reviewOn),
      settledOn: day(row.settledOn),
      conventions: normalizeOrgConventions(row.conventions),
      moves: normalizeMoves(row.moves, state, id, warnings),
      previousManagers: normalizePrevious(row.previousManagers, id, warnings),
      snapshot: normalizeSnapshot(row.snapshot),
      outcomes: Array.isArray(row.outcomes) ? row.outcomes.slice(0, 40).map((entry) => ({
        on: day(entry?.on),
        medianApePct: Number.isFinite(Number(entry?.medianApePct)) ? Number(entry.medianApePct) : null,
        scoredCount: Number.isFinite(Number(entry?.scoredCount)) ? Number(entry.scoredCount) : null,
        predicted: Number.isFinite(Number(entry?.predicted)) ? Number(entry.predicted) : null,
        observed: Number.isFinite(Number(entry?.observed)) ? Number(entry.observed) : null,
      })) : [],
      history: Array.isArray(row.history) ? row.history.slice(-ORG_DESIGN_HISTORY_CAP).map((entry) => ({
        at: isoOrNull(entry?.at) || null,
        type: str(entry?.type).slice(0, 40) || 'updated',
        summary: str(entry?.summary).slice(0, 300),
      })) : [],
      createdAt: isoOrNull(row.createdAt),
      updatedAt: isoOrNull(row.updatedAt),
    });
  }
  return out;
}
