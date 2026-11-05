/**
 * app/core/domain/epistemicSchema.js — the stored contract for Schema v105
 * (ADR-0103, the Epistemic Ledger).
 *
 * `epistemic.js` is the analysis; this module decides what a half-written,
 * hand-edited or older record is allowed to become on load. The rules follow
 * every other ledger in this app:
 *
 *  - **A declared belief is preserved exactly, and dropped if it lies.** A pair
 *    claiming an outcome was known before the outcome's own date is not a
 *    prediction; it is a memory with a timestamp on it, and the hindsight lock
 *    (ADR-0102) exists precisely to refuse that move. Such a pair is dropped
 *    with a warning naming the count only.
 *  - **A harvested unknown keeps the record it came from.** `className`,
 *    `sourceType`, `sourceId` and the day it was harvested are what makes the
 *    ledger navigable and its age measurable. A row without them is dropped;
 *    it is never repaired into a claim a reader might act on.
 *  - **Expiry is never silently converted into resolution.** A stored state is
 *    one of the five declared states or it is dropped. `answered` requires an
 *    answer and a day; `dismissed` requires a reason — the same discipline the
 *    rest of the workspace applies to a refused disclosure.
 *  - **Conventions are declared, clamped and printed** — the window, the
 *    escalation age, the expiry, the four floors, the two blind bands and the
 *    review horizon are conventions with defaults, never fitted values.
 */

import { dayKey } from '../time.js';
import {
  BELIEF_CELL_KEYS,
  EPISTEMIC_BOUNDS,
  EPISTEMIC_DEFAULTS,
  EPISTEMIC_LIMITS,
  UNKNOWN_KIND_KEYS,
  UNKNOWN_STATE_KEYS,
} from './epistemicRegistry.js';

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

function clampPct(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}

/* ---------------------------------------------------------- conventions */

export function normalizeEpistemicSettings(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const d = EPISTEMIC_DEFAULTS;
  const B = EPISTEMIC_BOUNDS;
  return {
    epistemicWindowDays: clampInt(s.epistemicWindowDays, B.epistemicWindowDays[0], B.epistemicWindowDays[1], d.epistemicWindowDays),
    epistemicEscalateDays: clampInt(s.epistemicEscalateDays, B.epistemicEscalateDays[0], B.epistemicEscalateDays[1], d.epistemicEscalateDays),
    epistemicExpiryDays: clampInt(s.epistemicExpiryDays, B.epistemicExpiryDays[0], B.epistemicExpiryDays[1], d.epistemicExpiryDays),
    epistemicAnswerFloor: clampInt(s.epistemicAnswerFloor, B.epistemicAnswerFloor[0], B.epistemicAnswerFloor[1], d.epistemicAnswerFloor),
    epistemicPairFloor: clampInt(s.epistemicPairFloor, B.epistemicPairFloor[0], B.epistemicPairFloor[1], d.epistemicPairFloor),
    epistemicCellFloor: clampInt(s.epistemicCellFloor, B.epistemicCellFloor[0], B.epistemicCellFloor[1], d.epistemicCellFloor),
    epistemicBlindFloor: clampPct(s.epistemicBlindFloor, B.epistemicBlindFloor[0], B.epistemicBlindFloor[1], d.epistemicBlindFloor),
    epistemicBlindDarkPct: clampPct(s.epistemicBlindDarkPct, B.epistemicBlindDarkPct[0], B.epistemicBlindDarkPct[1], d.epistemicBlindDarkPct),
    epistemicReviewDays: clampInt(s.epistemicReviewDays, B.epistemicReviewDays[0], B.epistemicReviewDays[1], d.epistemicReviewDays),
    epistemicAutoPropagate: s.epistemicAutoPropagate !== false,
  };
}

export function epistemicConventions(rawSettings = {}) {
  return normalizeEpistemicSettings(rawSettings);
}

/* -------------------------------------------------------------- unknowns */

function normalizeRefs(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const ref of raw) {
    if (!isPlainObject(ref)) continue;
    const type = clean(ref.type, 40);
    const id = clean(ref.id, 120);
    if (!type || !id) continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, id });
    if (out.length >= EPISTEMIC_LIMITS.refsPerUnknown) break;
  }
  return out;
}

function normalizeTimeline(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => isPlainObject(entry))
    .slice(-40)
    .map((entry) => ({
      at: isoOrNull(entry.at),
      on: day(entry.on),
      kind: clean(entry.kind, 40) || 'note',
      text: clean(entry.text, 600),
      by: clean(entry.by, 80) || null,
    }));
}

export function normalizeEpistemicUnknowns(raw, warnings = [], { now = new Date() } = {}) {
  if (!Array.isArray(raw)) return [];
  const today = dayKey(now);
  const seen = new Set();
  const out = [];
  let future = 0;
  let unreadable = 0;
  let badState = 0;
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 100);
    const title = clean(row.title, EPISTEMIC_LIMITS.titleChars);
    const harvestedOn = day(row.harvestedOn);
    const className = UNKNOWN_KIND_KEYS.includes(row.className) ? row.className : null;
    if (!id || !title || !className || !harvestedOn) {
      unreadable += 1;
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`Epistemic unknowns: duplicate id “${id.slice(0, 12)}…” dropped`);
      continue;
    }
    if (harvestedOn > today) {
      future += 1;
      continue;
    }
    // The provenance is what makes the row navigable and its age measurable. A
    // DECLARED unknown is the one kind a human authored, so it needs no source.
    const sourceType = clean(row.sourceType, 40) || null;
    const sourceId = clean(row.sourceId, 120) || null;
    if (row.origin !== 'declared' && (!sourceType || !sourceId)) {
      unreadable += 1;
      continue;
    }
    const state = UNKNOWN_STATE_KEYS.includes(row.state) ? row.state : 'unopened';
    const answeredOn = day(row.answeredOn);
    const answer = clean(row.answer, EPISTEMIC_LIMITS.noteChars);
    const dismissReason = clean(row.dismissReason, 600);
    if (state === 'answered' && (!answeredOn || !answer)) {
      // An answer without a day or without a sentence is not an answer. Drop the
      // claim of resolution rather than inventing either half of it.
      badState += 1;
      continue;
    }
    if (state === 'dismissed' && !dismissReason) {
      badState += 1;
      continue;
    }
    seen.add(id);
    out.push({
      id,
      title,
      className,
      origin: row.origin === 'declared' ? 'declared' : 'harvested',
      signalKey: clean(row.signalKey, 60) || null,
      discipline: clean(row.discipline, 40) || null,
      sourceType,
      sourceId,
      sourceRoute: clean(row.sourceRoute, 200) || null,
      evidenceClass: clean(row.evidenceClass, 40) || null,
      severity: clampInt(row.severity, 1, 3, 2),
      ownerSeatId: clean(row.ownerSeatId, 80) || null,
      altitudeKey: clean(row.altitudeKey, 40) || null,
      rank: clampInt(row.rank, 1, 5, 5),
      harvestedOn,
      evidencesOn: day(row.evidencesOn),
      expiresOn: day(row.expiresOn),
      state,
      openedOn: day(row.openedOn),
      answeredOn: state === 'answered' ? answeredOn : null,
      answer: state === 'answered' ? answer : '',
      dismissReason: state === 'dismissed' ? dismissReason : '',
      belief: row.belief === true ? true : row.belief === false ? false : null,
      refs: normalizeRefs(row.refs),
      timeline: normalizeTimeline(row.timeline),
      engineVersion: clean(row.engineVersion, 80),
      createdAt: isoOrNull(row.createdAt),
      updatedAt: isoOrNull(row.updatedAt),
    });
  }
  if (future) warnings.push(`Epistemic unknowns: dropped ${future} harvested ahead of today — a signal cannot be harvested from a day that has not happened`);
  if (unreadable) warnings.push(`Epistemic unknowns: dropped ${unreadable} unreadable row(s) (no id, title, kind, harvest day or provenance)`);
  if (badState) warnings.push(`Epistemic unknowns: dropped ${badState} row(s) claiming a resolution without the day, the answer or the dismissal reason that would make it one`);
  return out.slice(-EPISTEMIC_LIMITS.unknowns);
}

/* --------------------------------------------------------- observations */

function normalizePairs(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const pair of raw) {
    if (!isPlainObject(pair)) continue;
    const subjectType = clean(pair.subjectType, 40);
    const subjectId = clean(pair.subjectId, 120);
    const declaredOn = day(pair.declaredOn);
    if (!subjectType || !subjectId || !declaredOn) continue;
    if (pair.belief !== true && pair.belief !== false) continue;
    const key = `${subjectType}:${subjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      subjectType,
      subjectId,
      belief: pair.belief === true,
      declaredOn,
      note: clean(pair.note, 400),
    });
    if (out.length >= EPISTEMIC_LIMITS.pairsPerObservation) break;
  }
  return out;
}

/**
 * A frozen belief observation. It is written once, when the leader DECLARES
 * what they believe about work whose outcome is not yet on the record. The
 * declared day and the frozen pairs are the claim; a later edit to the record
 * is measured AGAINST it.
 */
export function normalizeEpistemicObservations(raw, warnings = [], { now = new Date() } = {}) {
  if (!Array.isArray(raw)) return [];
  const today = dayKey(now);
  const seen = new Set();
  const out = [];
  let future = 0;
  let unreadable = 0;
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 100);
    const declaredOn = day(row.declaredOn);
    if (!id || !declaredOn) {
      unreadable += 1;
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`Epistemic observations: duplicate id “${id.slice(0, 12)}…” dropped`);
      continue;
    }
    if (declaredOn > today) {
      future += 1;
      continue;
    }
    const pairs = normalizePairs(row.pairs);
    seen.add(id);
    out.push({
      id,
      declaredOn,
      declaredAt: isoOrNull(row.declaredAt),
      ownerSeatId: clean(row.ownerSeatId, 80) || null,
      altitudeKey: clean(row.altitudeKey, 40) || null,
      rank: clampInt(row.rank, 1, 5, 5),
      question: clean(row.question, 300),
      confidencePct: clampInt(row.confidencePct, 1, 99, 70),
      pairs,
      pairN: pairs.length,
      gradedOn: day(row.gradedOn),
      cells: isPlainObject(row.cells)
        ? {
          agreedOk: clampInt(row.cells.agreedOk, 0, 500, 0),
          optimism: clampInt(row.cells.optimism, 0, 500, 0),
          pessimism: clampInt(row.cells.pessimism, 0, 500, 0),
          agreedBad: clampInt(row.cells.agreedBad, 0, 500, 0),
        }
        : null,
      unpairedN: clampInt(row.unpairedN, 0, 500, 0),
      engineVersion: clean(row.engineVersion, 80),
      createdAt: isoOrNull(row.createdAt),
    });
  }
  if (future) warnings.push(`Epistemic observations: dropped ${future} observation(s) dated in the future — a belief cannot be declared about a day that has not happened`);
  if (unreadable) warnings.push(`Epistemic observations: dropped ${unreadable} unreadable observation(s) (no id or declaration day)`);
  return out.slice(-EPISTEMIC_LIMITS.observations);
}

export function normalizeEpistemicGrades(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 100);
    const observationId = clean(row.observationId, 100);
    const gradedOn = day(row.gradedOn);
    if (!id || !observationId || !gradedOn || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      observationId,
      gradedOn,
      cells: isPlainObject(row.cells)
        ? Object.fromEntries(BELIEF_CELL_KEYS.map((key) => [key, clampInt(row.cells[key], 0, 500, 0)]))
        : Object.fromEntries(BELIEF_CELL_KEYS.map((key) => [key, 0])),
      unpairedN: clampInt(row.unpairedN, 0, 500, 0),
      kappa: Number.isFinite(Number(row.kappa)) ? Math.round(Number(row.kappa) * 1000) / 1000 : null,
      pabak: Number.isFinite(Number(row.pabak)) ? Math.round(Number(row.pabak) * 1000) / 1000 : null,
      prevalenceIndex: Number.isFinite(Number(row.prevalenceIndex)) ? Math.round(Number(row.prevalenceIndex) * 1000) / 1000 : null,
      biasIndex: Number.isFinite(Number(row.prevalenceIndex)) ? Math.round(Number(Number(row.prevalenceIndex) === 0 ? 0 : (Number(row.biasIndex) || 0)) * 1000) / 1000 : null,
      verdict: clean(row.verdict, 40) || null,
      ownerSeatId: clean(row.ownerSeatId, 80) || null,
      altitudeKey: clean(row.altitudeKey, 40) || null,
      rank: clampInt(row.rank, 1, 5, 5),
      engineVersion: clean(row.engineVersion, 80),
      createdAt: isoOrNull(row.createdAt),
    });
  }
  return out.slice(-EPISTEMIC_LIMITS.grades);
}

/* --------------------------------------------------------------- markers */

export function normalizeEpistemicMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 120);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      kind: clean(row.kind, 40) || 'unknown',
      key: clean(row.key, 240),
      unknownId: clean(row.unknownId, 100) || null,
      decisionId: clean(row.decisionId, 100) || null,
      observationId: clean(row.observationId, 100) || null,
      weekKey: clean(row.weekKey, 20) || null,
      recordedOn: day(row.recordedOn),
      note: clean(row.note, 300),
    });
  }
  return out.slice(-EPISTEMIC_LIMITS.markers);
}
