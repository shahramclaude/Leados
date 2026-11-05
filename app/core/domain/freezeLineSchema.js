/**
 * app/core/domain/freezeLineSchema.js — the stored contract for Schema v101
 * (ADR-0099, the Freeze-Line Continuity Audit).
 *
 * `freezeLine.js` is the analysis; this module decides what a half-written,
 * hand-edited or older reading is allowed to become on load. The rules follow
 * every other ledger in this app:
 *
 *  - **A frozen reading is preserved exactly.** Re-deriving a verdict from
 *    today's roster would rewrite the claim the reading was frozen to answer.
 *    A malformed row is dropped with a warning, never repaired into a verdict
 *    a leader might act on.
 *  - **A suppressed cell carries no date.** The timing guard is part of the
 *    data contract, not only of the view: a reading row that claims
 *    suppression while still holding carriage dates is flagged on load (the
 *    flag drives RULE-FRZ-03's redaction work), and new freezes never write
 *    one.
 *  - **Conventions are declared, clamped and printed** — the window, the edge
 *    floor, the cell floor and the drop threshold are conventions with
 *    defaults, never fitted values.
 */

import { dayKey } from '../time.js';
import {
  CONTINUITY_CLASSES,
  FREEZE_LIMITS,
  FREEZE_VERDICTS,
  FREEZE_DEFAULTS,
} from './freezeLineRegistry.js';

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

function pctOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

/* ---------------------------------------------------------- conventions */

export function normalizeFreezeLineSettings(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const d = FREEZE_DEFAULTS;
  return {
    freezeLineWindowDays: clampInt(s.freezeLineWindowDays, FREEZE_LIMITS.windowDaysMin, FREEZE_LIMITS.windowDaysMax, d.freezeLineWindowDays),
    freezeLineMinEdges: clampInt(s.freezeLineMinEdges, FREEZE_LIMITS.minEdgesMin, FREEZE_LIMITS.minEdgesCeil, d.freezeLineMinEdges),
    freezeLineCellFloor: clampInt(s.freezeLineCellFloor, FREEZE_LIMITS.cellFloorMin, FREEZE_LIMITS.cellFloorMax, d.freezeLineCellFloor),
    freezeLineDropPct: clampInt(s.freezeLineDropPct, FREEZE_LIMITS.dropPctMin, FREEZE_LIMITS.dropPctMax, d.freezeLineDropPct),
    freezeLineAutoPropagate: s.freezeLineAutoPropagate !== false,
  };
}

export function freezeLineConventions(rawSettings = {}) {
  return normalizeFreezeLineSettings(rawSettings);
}

/* -------------------------------------------------------------- readings */

function normalizeSide(raw) {
  if (!isPlainObject(raw)) return null;
  const edgesN = Number.isFinite(Number(raw.edgesN)) ? Math.max(0, Math.round(Number(raw.edgesN))) : null;
  const connectedN = Number.isFinite(Number(raw.connectedN)) ? Math.max(0, Math.round(Number(raw.connectedN))) : null;
  if (edgesN === null || connectedN === null) return null;
  return {
    windowStart: day(raw.windowStart),
    windowEnd: day(raw.windowEnd),
    edgesN,
    connectedN,
    coveragePct: pctOrNull(raw.coveragePct),
    wilsonLowPct: pctOrNull(raw.wilsonLowPct),
    wilsonHighPct: pctOrNull(raw.wilsonHighPct),
    refused: raw.refused === true,
    reason: clean(raw.reason, 300),
  };
}

function normalizeCell(raw) {
  if (!isPlainObject(raw)) return null;
  const altitudeKey = clean(raw.altitudeKey, 40);
  const cls = CONTINUITY_CLASSES.includes(raw.cls) ? raw.cls : null;
  const n = Number.isFinite(Number(raw.n)) ? Math.max(0, Math.round(Number(raw.n))) : null;
  if (!altitudeKey || !cls || n === null) return null;
  return { altitudeKey, cls, n, suppressed: raw.suppressed === true };
}

/**
 * Fail-closed reading normalizer. A reading without an id, a design id, a
 * freeze date or a valid verdict is dropped with a warning. The timing-guard
 * flag is computed, never trusted: a row that marks cells suppressed while
 * still carrying carriage dates is flagged `timingLeak` so RULE-FRZ-03 can
 * open redaction work for it.
 */
export function normalizeFreezeReadings(raw, warnings = [], { now = new Date() } = {}) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 60);
    const designId = clean(row.designId, 60);
    if (!id || seen.has(id) || !designId) {
      if (id && seen.has(id)) warnings.push(`Freeze-line reading: duplicate id “${id.slice(0, 40)}” dropped`);
      continue;
    }
    seen.add(id);
    const verdict = FREEZE_VERDICTS.includes(row.verdict) ? row.verdict : null;
    const lineOn = day(row.lineOn) || day(row.frozenOn);
    const frozenOn = day(row.frozenOn) || dayKey(now);
    if (!verdict || !lineOn || !frozenOn) {
      warnings.push(`Freeze-line reading: “${id.slice(0, 40)}” has no valid verdict or freeze date; dropped`);
      continue;
    }
    const kind = row.kind === 'reverted' ? 'reverted' : 'committed';
    const before = normalizeSide(row.before);
    const after = normalizeSide(row.after);
    if (!before || !after) {
      warnings.push(`Freeze-line reading: “${id.slice(0, 40)}” has an unreadable before/after window; dropped`);
      continue;
    }
    const cells = (Array.isArray(row.cells) ? row.cells : [])
      .map(normalizeCell)
      .filter(Boolean)
      .slice(0, FREEZE_LIMITS.cellsPerReading);
    const comparability = isPlainObject(row.comparability) ? {
      preAssessmentsN: Number.isFinite(Number(row.comparability.preAssessmentsN))
        ? Math.max(0, Math.round(Number(row.comparability.preAssessmentsN))) : 0,
      inWindowN: Number.isFinite(Number(row.comparability.inWindowN))
        ? Math.max(0, Math.round(Number(row.comparability.inWindowN))) : 0,
      suppressed: row.comparability.suppressed === true,
      note: clean(row.comparability.note, 300),
    } : { preAssessmentsN: 0, inWindowN: 0, suppressed: false, note: '' };
    // The timing guard is recomputed from the stored cells, never trusted:
    // a suppressed cell must never sit beside a carriage date.
    const timingLeak = cells.some((cell) => cell.suppressed && cell.carriageOn);
    out.push({
      id,
      designId,
      kind,
      lineOn,
      frozenOn,
      windowDays: clampInt(row.windowDays, FREEZE_LIMITS.windowDaysMin, FREEZE_LIMITS.windowDaysMax, FREEZE_DEFAULTS.freezeLineWindowDays),
      verdict,
      deltaPctPoints: Number.isFinite(Number(row.deltaPctPoints)) ? Math.round(Number(row.deltaPctPoints) * 10) / 10 : null,
      before,
      after,
      cells,
      comparability,
      timingLeak,
      engineVersion: clean(row.engineVersion, 80),
      createdAt: isoOrNull(row.createdAt),
    });
  }
  return out.slice(0, FREEZE_LIMITS.readings);
}

/* -------------------------------------------------------------- markers */

export function normalizeFreezeMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 80);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      kind: clean(row.kind, 40) || 'unknown',
      key: clean(row.key, 200),
      designId: clean(row.designId, 60) || null,
      decisionId: clean(row.decisionId, 60) || null,
      weekKey: clean(row.weekKey, 20) || null,
      recordedOn: day(row.recordedOn),
      note: clean(row.note, 300),
    });
  }
  return out.slice(-FREEZE_LIMITS.markers);
}
