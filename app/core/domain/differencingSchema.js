/**
 * app/core/domain/differencingSchema.js — persistence contract for the
 * Differencing Defender (Schema v96, ADR-0092).
 *
 * A stored release is IDENTITY-REDUCED BY CONSTRUCTION: a module route, a day, an
 * altitude key, a rank, and the CELL GEOMETRY. It never keeps a span name, a
 * person's name, a record title, a note, an amount or a currency, because no such
 * field exists on the row. Screen labels are resolved live from the tree the
 * reader may already see; they are never copied into the register, so exporting
 * the register cannot become a second, unredacted copy of the workspace.
 *
 * A malformed row is DROPPED, never repaired. A release the auditor cannot reason
 * about exactly is worse than a missing release: it would make the register claim
 * a safety it never checked.
 */
import {
  DIFFERENCING_DEFAULTS,
  DIFFERENCING_LIMITS,
  DIFFERENCING_MEASURES,
  DIFFERENCING_VERDICTS,
} from './differencingRegistry.js';
import { ALTITUDE_KEYS } from './chainRegistry.js';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEASURE_SET = new Set(DIFFERENCING_MEASURES);
const VERDICT_SET = new Set(Object.values(DIFFERENCING_VERDICTS));
const STATE_SET = new Set(['printed', 'withheld', 'complementary', 'absent']);
const MARKER_KINDS = Object.freeze(['registered', 'recovered', 'protected', 'drift', 'conventions']);

function text(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function idOrNull(value) {
  const result = text(value, 80);
  return result || null;
}

function validDay(value) {
  const day = text(value, 10);
  if (!ISO_DAY_RE.test(day)) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? null : day;
}

function isoOrNull(value) {
  const raw = text(value, 40);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function boundedInt(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function intOrNull(value, min = 0, max = 10000000) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function pctOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.min(100, Math.max(0, number)) * 10) / 10;
}

/** A route token is a slug, never a URL and never free text. */
function routeOrNull(value) {
  const route = text(value, 60);
  return /^[a-z][a-z0-9-]{0,59}$/.test(route) ? route : null;
}

export function normalizeDifferencesSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const windowReleases = boundedInt(
    source.differencesWindowReleases,
    DIFFERENCING_LIMITS.windowReleasesMin,
    DIFFERENCING_LIMITS.windowReleasesMax,
    DIFFERENCING_DEFAULTS.differencesWindowReleases,
  );
  const cellFloor = boundedInt(
    source.differencesCellFloor,
    DIFFERENCING_LIMITS.cellFloorMin,
    DIFFERENCING_LIMITS.cellFloorMax,
    DIFFERENCING_DEFAULTS.differencesCellFloor,
  );
  return {
    differencesCellFloor: cellFloor,
    differencesWindowReleases: windowReleases,
    // A minimum-points floor below the window makes the drift test claim a trend
    // from fewer points than the window itself reports; the higher wins.
    differencesMinPoints: Math.max(
      boundedInt(
        source.differencesMinPoints,
        DIFFERENCING_LIMITS.minPointsMin,
        DIFFERENCING_LIMITS.minPointsMax,
        DIFFERENCING_DEFAULTS.differencesMinPoints,
      ),
      DIFFERENCING_LIMITS.minPointsMin,
    ),
    differencesAutoProtect: source.differencesAutoProtect !== false,
    differencesAutoPropagate: source.differencesAutoPropagate !== false,
  };
}

export function differencesConventions(rawSettings = {}) {
  return normalizeDifferencesSettings({ ...DIFFERENCING_DEFAULTS, ...(rawSettings || {}) });
}

/* ------------------------------------------------------------------- cells */

/** One cell row: a span id and the three additive measures, nothing else. */
export function normalizeReleaseCell(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cellKey = idOrNull(raw.cellKey);
  const state = text(raw.state, 20);
  if (!cellKey || !STATE_SET.has(state)) return null;
  const count = intOrNull(raw.count);
  return {
    cellKey,
    state,
    // A printed cell carries its value; a withheld cell's value is never stored
    // here at all, which is why the register cannot leak what it withheld.
    count: state === 'printed' ? count : null,
    open: state === 'printed' ? intOrNull(raw.open) : null,
    overdue: state === 'printed' ? intOrNull(raw.overdue) : null,
  };
}

export function normalizeReleaseTotal(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const measure = text(raw.measure, 20);
  if (!MEASURE_SET.has(measure)) return null;
  const printed = raw.printed === true;
  const value = printed ? intOrNull(raw.value) : null;
  if (printed && value === null) return null;
  return { measure, printed, value };
}

/** A protected release records WHICH figure it withheld, never its value. */
export function normalizeProtection(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const withheldTotals = (Array.isArray(raw.withheldTotals) ? raw.withheldTotals : [])
    .map((measure) => text(measure, 20))
    .filter((measure) => MEASURE_SET.has(measure));
  const withheldCells = boundedInt(raw.withheldCells, 0, DIFFERENCING_LIMITS.cellsPerRelease, 0);
  return {
    withheldTotals: [...new Set(withheldTotals)].sort(),
    withheldCells,
    protectedN: boundedInt(raw.protectedN, 0, DIFFERENCING_LIMITS.cellsPerRelease, 0),
    reason: text(raw.reason, 240),
  };
}

export function normalizeRelease(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = idOrNull(raw.id);
  const route = routeOrNull(raw.route);
  const releasedOn = validDay(raw.releasedOn);
  if (!id || !route || !releasedOn) return null;
  const cells = [];
  const seen = new Set();
  for (const item of Array.isArray(raw.cells) ? raw.cells.slice(0, DIFFERENCING_LIMITS.cellsPerRelease) : []) {
    const cell = normalizeReleaseCell(item);
    if (!cell || seen.has(cell.cellKey)) continue;
    seen.add(cell.cellKey);
    cells.push(cell);
  }
  if (!cells.length) return null;
  const totals = [];
  for (const item of Array.isArray(raw.totals) ? raw.totals : []) {
    const total = normalizeReleaseTotal(item);
    if (total) totals.push(total);
  }
  const verdict = VERDICT_SET.has(raw.verdict) ? raw.verdict : DIFFERENCING_VERDICTS.SAFE;
  return {
    id,
    route,
    scopeSeatId: idOrNull(raw.scopeSeatId),
    altitudeKey: ALTITUDE_KEYS.includes(raw.altitudeKey) ? raw.altitudeKey : null,
    rank: boundedInt(raw.rank, 1, 5, 1),
    releasedOn,
    cellFloor: boundedInt(raw.cellFloor, DIFFERENCING_LIMITS.cellFloorMin, DIFFERENCING_LIMITS.cellFloorMax, DIFFERENCING_DEFAULTS.differencesCellFloor),
    attemptN: boundedInt(raw.attemptN, 1, 1000, 1),
    verdict,
    protection: normalizeProtection(raw.protection),
    // Determinacy at publication time, kept so a later convention change cannot
    // silently rewrite what was true when the figure went out.
    recoveredN: boundedInt(raw.recoveredN, 0, DIFFERENCING_LIMITS.cellsPerRelease, 0),
    equationN: boundedInt(raw.equationN, 0, 100000, 0),
    withheldN: boundedInt(raw.withheldN, 0, 100000, 0),
    cells,
    totals,
    engineVersion: text(raw.engineVersion, 60) || '',
    createdAt: isoOrNull(raw.createdAt) || `${releasedOn}T00:00:00.000Z`,
  };
}

export function normalizeReleases(raw, warnings = [], { cap = DIFFERENCING_LIMITS.releases } = {}) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('differenceReleases was not a list; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeRelease(item);
    if (!row) {
      warnings.push('differenceReleases: dropped a malformed release rather than reasoning about a register that cannot be checked exactly.');
      continue;
    }
    if (seen.has(row.id)) {
      warnings.push('differenceReleases: dropped a duplicate release id.');
      continue;
    }
    seen.add(row.id);
    out.push(row);
    if (out.length >= cap) break;
  }
  out.sort((a, b) => String(b.releasedOn).localeCompare(String(a.releasedOn)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  return out;
}

export function normalizeMarker(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = idOrNull(raw.id);
  const kind = text(raw.kind, 30);
  if (!id || !MARKER_KINDS.includes(kind)) return null;
  return {
    id,
    kind,
    route: routeOrNull(raw.route),
    releaseId: idOrNull(raw.releaseId),
    decisionId: idOrNull(raw.decisionId),
    taskId: idOrNull(raw.taskId),
    cellKey: idOrNull(raw.cellKey),
    measure: MEASURE_SET.has(raw.measure) ? raw.measure : null,
    weekKey: text(raw.weekKey, 12) || null,
    points: intOrNull(raw.points, 0, 100000),
    pValue: raw.pValue === null || raw.pValue === undefined ? null : Math.round(Math.min(1, Math.max(0, Number(raw.pValue))) * 10000) / 10000,
    recordedOn: validDay(raw.recordedOn),
    note: text(raw.note, 240),
  };
}

export function normalizeMarkers(raw, { cap = DIFFERENCING_LIMITS.markers } = {}) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeMarker(item);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
    if (out.length >= cap) break;
  }
  return out;
}

/** Settings a release stamps for the coverage reading (never per-person). */
export function normalizeDifferencesCoverage(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    releasesN: boundedInt(source.releasesN, 0, DIFFERENCING_LIMITS.releases, 0),
    safeN: boundedInt(source.safeN, 0, DIFFERENCING_LIMITS.releases, 0),
    protectedN: boundedInt(source.protectedN, 0, DIFFERENCING_LIMITS.releases, 0),
    recoveredN: boundedInt(source.recoveredN, 0, DIFFERENCING_LIMITS.releases, 0),
    pct: pctOrNull(source.pct),
    lowPct: pctOrNull(source.lowPct),
    highPct: pctOrNull(source.highPct),
    refused: source.refused !== false,
    reason: text(source.reason, 240),
  };
}
