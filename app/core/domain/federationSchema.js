/**
 * app/core/domain/federationSchema.js — persistence contract for the Programme
 * Federation Reading (Schema v95, ADR-0090).
 *
 * A frozen assessment is identity-reduced by construction: span ids, state
 * names, counts and dates. No pact title, no decision question, no free text, no
 * person's name and no currency amount can survive this normalizer, because no
 * such field exists on the row. A malformed row is dropped, never repaired.
 */
import { ALTITUDE_KEYS } from './chainRegistry.js';
import {
  FEDERATION_CHANNELS,
  FEDERATION_DEFAULTS,
  FEDERATION_LIMITS,
  FEDERATION_STATES,
} from './federationRegistry.js';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHANNEL_KEYS = new Set(FEDERATION_CHANNELS.map((channel) => channel.key));
const STATE_SET = new Set(FEDERATION_STATES);
const MARKER_KINDS = Object.freeze(['measured', 'silent-edge', 'reconnect', 'conventions']);

function text(value, max = 120) {
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

function pctOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.min(100, Math.max(0, number)) * 10) / 10;
}

function boolOrNull(value) {
  return typeof value === 'boolean' ? value : null;
}

export function normalizeFederationSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const windowDays = boundedInt(
    source.federationWindowDays,
    FEDERATION_LIMITS.windowDaysMin,
    FEDERATION_LIMITS.windowDaysMax,
    FEDERATION_DEFAULTS.federationWindowDays,
  );
  const minSpans = boundedInt(
    source.federationMinSpans,
    FEDERATION_LIMITS.minSpansFloor,
    FEDERATION_LIMITS.minSpansCeil,
    FEDERATION_DEFAULTS.federationMinSpans,
  );
  const cellFloor = boundedInt(
    source.federationCellFloor,
    FEDERATION_LIMITS.cellFloorMin,
    FEDERATION_LIMITS.cellFloorMax,
    FEDERATION_DEFAULTS.federationCellFloor,
  );
  return {
    federationWindowDays: windowDays,
    // A floor below the suppression floor would let a rate be published on a
    // sample its own cells would have blanked; the higher of the two wins.
    federationMinSpans: Math.max(minSpans, cellFloor),
    federationCellFloor: cellFloor,
    federationAutoPropagate: source.federationAutoPropagate !== false,
  };
}

export function federationConventions(rawSettings = {}) {
  return normalizeFederationSettings({ ...FEDERATION_DEFAULTS, ...(rawSettings || {}) });
}

function normalizeChannels(raw = []) {
  const out = [];
  for (const row of Array.isArray(raw) ? raw.slice(0, FEDERATION_LIMITS.channels) : []) {
    if (!row || typeof row !== 'object') continue;
    const key = text(row.key, 40);
    if (!CHANNEL_KEYS.has(key)) continue;
    out.push({
      key,
      n: boundedInt(row.n, 0, 100000),
      lastOn: validDay(row.lastOn),
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** One span row inside a frozen assessment. */
export function normalizeAssessmentRow(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const seatId = idOrNull(raw.seatId);
  const state = text(raw.state, 20);
  if (!seatId || !STATE_SET.has(state)) return null;
  const altitudeKey = ALTITUDE_KEYS.includes(raw.altitudeKey) ? raw.altitudeKey : null;
  return {
    seatId,
    parentId: idOrNull(raw.parentId),
    altitudeKey,
    rank: boundedInt(raw.rank, 1, 5, 1),
    state,
    suppressed: raw.suppressed === true,
    evidenceN: boundedInt(raw.evidenceN, 0, 100000),
    directN: boundedInt(raw.directN, 0, 100000),
    bypassN: boundedInt(raw.bypassN, 0, 100000),
    lastCarriageOn: validDay(raw.lastCarriageOn),
    daysSince: Number.isFinite(Number(raw.daysSince)) ? boundedInt(raw.daysSince, 0, 36500) : null,
    channels: normalizeChannels(raw.channels),
  };
}

function normalizeCoverage(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    n: boundedInt(source.n, 0, FEDERATION_LIMITS.rows),
    k: boundedInt(source.k, 0, FEDERATION_LIMITS.rows),
    pct: pctOrNull(source.pct),
    lowPct: pctOrNull(source.lowPct),
    highPct: pctOrNull(source.highPct),
    refused: source.refused !== false,
    reason: text(source.reason, 240),
    minSpans: boundedInt(source.minSpans, FEDERATION_LIMITS.minSpansFloor, FEDERATION_LIMITS.minSpansCeil, 5),
  };
}

function normalizeSummary(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const counts = {};
  for (const state of FEDERATION_STATES) counts[state] = boundedInt(source[state], 0, FEDERATION_LIMITS.rows);
  return {
    spansDeclared: boundedInt(source.spansDeclared, 0, FEDERATION_LIMITS.rows),
    measuredN: boundedInt(source.measuredN, 0, FEDERATION_LIMITS.rows),
    withParentN: boundedInt(source.withParentN, 0, FEDERATION_LIMITS.rows),
    ...counts,
    coverage: normalizeCoverage(source.coverage),
    suppressedN: boundedInt(source.suppressedN, 0, FEDERATION_LIMITS.rows),
  };
}

/** A frozen, immutable assessment of one seat's scope. */
export function normalizeFederationAssessment(raw, warnings = []) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = idOrNull(raw.id);
  const scopeSeatId = idOrNull(raw.scopeSeatId);
  const frozenOn = validDay(raw.frozenOn);
  if (!id || !scopeSeatId || !frozenOn) return null;
  const rows = [];
  for (const row of Array.isArray(raw.rows) ? raw.rows.slice(0, FEDERATION_LIMITS.rows) : []) {
    const normal = normalizeAssessmentRow(row);
    if (normal) rows.push(normal);
    else warnings.push('Federation: dropped an assessment row that did not match the frozen span vocabulary.');
  }
  return {
    id,
    scopeSeatId,
    altitudeKey: ALTITUDE_KEYS.includes(raw.altitudeKey) ? raw.altitudeKey : null,
    rank: boundedInt(raw.rank, 1, 5, 1),
    frozenOn,
    windowDays: boundedInt(raw.windowDays, FEDERATION_LIMITS.windowDaysMin, FEDERATION_LIMITS.windowDaysMax, FEDERATION_DEFAULTS.federationWindowDays),
    windowStart: validDay(raw.windowStart),
    engineVersion: text(raw.engineVersion, 40) || '',
    summary: normalizeSummary(raw.summary),
    rows,
    createdAt: isoOrNull(raw.createdAt) || `${frozenOn}T00:00:00.000Z`,
  };
}

export function normalizeFederationAssessments(raw, warnings = [], { cap = FEDERATION_LIMITS.assessments } = {}) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('federationAssessments was not a list; reset to [].');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeFederationAssessment(item, warnings);
    if (!row) {
      warnings.push('federationAssessments: dropped a malformed assessment.');
      continue;
    }
    if (seen.has(row.id)) {
      warnings.push('federationAssessments: dropped a duplicate assessment id.');
      continue;
    }
    seen.add(row.id);
    out.push(row);
    if (out.length >= cap) break;
  }
  out.sort((a, b) => String(b.frozenOn).localeCompare(String(a.frozenOn)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  return out;
}

export function normalizeFederationMarker(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = idOrNull(raw.id);
  const kind = text(raw.kind, 30);
  if (!id || !MARKER_KINDS.includes(kind)) return null;
  return {
    id,
    kind,
    childSeatId: idOrNull(raw.childSeatId),
    parentSeatId: idOrNull(raw.parentSeatId),
    assessmentId: idOrNull(raw.assessmentId),
    decisionId: idOrNull(raw.decisionId),
    state: STATE_SET.has(raw.state) ? raw.state : null,
    weekKey: text(raw.weekKey, 12) || null,
    recordedOn: validDay(raw.recordedOn),
    note: text(raw.note, 240),
    reconnected: boolOrNull(raw.reconnected),
  };
}

export function normalizeFederationMarkers(raw, { cap = FEDERATION_LIMITS.markers } = {}) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeFederationMarker(item);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
    if (out.length >= cap) break;
  }
  return out;
}
