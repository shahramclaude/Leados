/**
 * app/core/domain/signalPathSchema.js — the persisted contract for the Signal
 * Path terminal (Schema v59).
 *
 * Three collections, each with one job:
 *
 *   `signalClasses`  a declared event class: where it originates, what it would
 *                    cost, how likely it is, and the channel conventions that
 *                    apply to it. Committing one freezes a prediction.
 *   `signalProbes`   the falsifier. One probe = one fact that already existed
 *                    down in the organisation, plus whether the channel would
 *                    have delivered it and how long that took. A probe's frozen
 *                    prediction is written when it is opened and is never
 *                    rewritten when it settles.
 *   `signalLevers`   an adopted intervention, with the hours it costs and the
 *                    reading it was expected to buy. Adopting one opens real
 *                    work; retiring one keeps the record.
 *
 * The normalisation rules are the ones this workspace applies to every
 * prediction-shaped record: frozen numbers are read back as stored, dangling
 * person pointers are cleared rather than followed, unreadable records are
 * dropped with a warning rather than repaired into something plausible, and
 * every append-only array is bounded.
 */

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function calendarDayOrNull(value) {
  const raw = str(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function isoOrNull(value) {
  const raw = str(value).trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function clampText(value, max) {
  return str(value).trim().slice(0, max);
}

function clampInt(value, min, max, fallback) {
  const n = num(value);
  if (n === null) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function nonNegativeOrNull(value) {
  const n = num(value);
  if (n === null) return null;
  return n < 0 ? 0 : Math.round(n * 100) / 100;
}

/**
 * Frozen readings keep four decimal places. Two would silently change the
 * number a probe is graded against — a 0.6084 declaration rounded to 0.61 moves
 * the Brier term for every settlement that follows it.
 */
function preciseOrNull(value) {
  const n = num(value);
  if (n === null) return null;
  return Math.round(n * 10000) / 10000;
}

function rateOrNull(value) {
  const n = num(value);
  if (n === null) return null;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
}

export const SIGNAL_SCHEMA_VERSION = 1;
const MAX_CLASSES = 120;
const MAX_PROBES = 600;
const MAX_LEVERS = 240;
const MAX_NOTES = 24;
const MAX_HISTORY = 40;
const MAX_MARKERS = 240;
const MAX_OVERRIDES = 32;

const CLASS_STATUSES = ['declared', 'committed', 'retired'];
const PROBE_STATUSES = ['open', 'settled', 'abandoned'];
const TRUTHS = ['event', 'none'];
const LEARNED_VIA = ['escalation', 'skip-level', 'monitoring', 'accident', 'never'];

function normalizeHistory(raw, now) {
  return (Array.isArray(raw) ? raw : [])
    .filter((row) => isPlainObject(row))
    .map((row) => ({
      at: isoOrNull(row.at) || now,
      type: clampText(row.type, 40) || 'updated',
      summary: clampText(row.summary, 400),
    }))
    .slice(-MAX_HISTORY);
}

function normalizeNotes(raw, now) {
  return (Array.isArray(raw) ? raw : [])
    .filter((row) => isPlainObject(row) && str(row.text).trim())
    .map((row) => ({
      at: isoOrNull(row.at) || now,
      source: clampText(row.source, 80),
      text: clampText(row.text, 900),
    }))
    .slice(-MAX_NOTES);
}

function normalizeMarkers(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((marker) => typeof marker === 'string' && marker.length > 0)
    .map((marker) => marker.slice(0, 200))
    .slice(0, MAX_MARKERS);
}

function normalizeDirect(raw) {
  if (!isPlainObject(raw) || raw.enabled !== true) return { enabled: false };
  return {
    enabled: true,
    label: clampText(raw.label, 160),
    detectPct: rateOrNull(raw.detectPct),
    falsePct: rateOrNull(raw.falsePct),
    lagDays: nonNegativeOrNull(raw.lagDays),
  };
}

function normalizeOverrides(raw, personIds) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  let count = 0;
  for (const [personId, value] of Object.entries(raw)) {
    if (count >= MAX_OVERRIDES) break;
    if (!personIds.has(personId)) continue;
    const pct = rateOrNull(value);
    if (pct === null || pct <= 0) continue;
    out[personId] = pct;
    count += 1;
  }
  return out;
}

/**
 * The frozen prediction written when a class is committed. It stores the
 * reading as it stood, plus the chain it was computed over, so a settled probe
 * can be graded against what was actually declared rather than what the roster
 * looks like today.
 */
export function freezeSignalPrediction(classRecord, reading, chain = []) {
  if (!classRecord || !reading) return null;
  return {
    frozenOn: classRecord.committedOn || null,
    reach: reading.reach,
    falseAlarm: reading.falseAlarm,
    latencyDays: reading.latencyDays,
    carriedBits: reading.carriedBits,
    sourceBits: reading.sourceBits,
    expectedLoss: reading.expectedLoss,
    exposure: reading.exposure,
    hopCount: reading.hopCount,
    chain: (Array.isArray(chain) ? chain : []).slice(0, 12).map((node) => ({
      personId: node.personId || null,
      name: clampText(node.name, 120),
      depthFromOrigin: clampInt(node.depthFromOrigin, 1, 64, 1),
    })),
    conventions: isPlainObject(reading.conventions) ? reading.conventions : null,
  };
}

export function normalizeSignalClasses(raw, state = {}, now = new Date().toISOString(), warnings = null) {
  const push = (message) => { if (Array.isArray(warnings)) warnings.push(message); };
  const personIds = new Set((state.people || []).map((p) => p && p.id).filter(Boolean));
  const rows = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  let clearedOrigins = 0;
  for (const entry of rows) {
    if (!isPlainObject(entry)) continue;
    const id = clampText(entry.id, 120);
    const label = clampText(entry.label, 200);
    if (!id || !label) { push('Signal path: dropped a class with no id or no label'); continue; }
    if (seen.has(id)) { push('Signal path: dropped a duplicate class id'); continue; }
    seen.add(id);
    let pathPersonId = clampText(entry.pathPersonId, 120) || null;
    if (pathPersonId && !personIds.has(pathPersonId)) {
      pathPersonId = null;
      clearedOrigins += 1;
    }
    const status = CLASS_STATUSES.includes(entry.status) ? entry.status : 'declared';
    const probabilityPct = clampInt(entry.probabilityPct, 0, 100, 40);
    const exposure = nonNegativeOrNull(entry.exposure);
    const frozen = isPlainObject(entry.frozen)
      ? {
        frozenOn: calendarDayOrNull(entry.frozen.frozenOn),
        reach: preciseOrNull(entry.frozen.reach),
        falseAlarm: preciseOrNull(entry.frozen.falseAlarm),
        latencyDays: nonNegativeOrNull(entry.frozen.latencyDays),
        carriedBits: preciseOrNull(entry.frozen.carriedBits),
        sourceBits: preciseOrNull(entry.frozen.sourceBits),
        expectedLoss: nonNegativeOrNull(entry.frozen.expectedLoss),
        exposure: nonNegativeOrNull(entry.frozen.exposure),
        hopCount: clampInt(entry.frozen.hopCount, 0, 64, 0),
        chain: (Array.isArray(entry.frozen.chain) ? entry.frozen.chain : []).slice(0, 12).map((node) => ({
          personId: isPlainObject(node) && node.personId && personIds.has(node.personId) ? node.personId : null,
          name: isPlainObject(node) ? clampText(node.name, 120) : '',
          depthFromOrigin: clampInt(isPlainObject(node) ? node.depthFromOrigin : 1, 1, 64, 1),
        })),
        conventions: isPlainObject(entry.frozen.conventions) ? entry.frozen.conventions : null,
      }
      : null;
    // A committed class without a frozen reading is a claim with no record. Keep
    // the status honest rather than the label.
    const finalStatus = status === 'committed' && !frozen ? 'declared' : status;
    out.push({
      id,
      label,
      status: finalStatus,
      currency: (clampText(entry.currency, 6) || 'USD').toUpperCase(),
      exposure,
      probabilityPct,
      horizonDays: clampInt(entry.horizonDays, 1, 730, 90),
      pathPersonId,
      ownerId: personIds.has(clampText(entry.ownerId, 120)) ? clampText(entry.ownerId, 120) : null,
      overrides: normalizeOverrides(entry.overrides, personIds),
      direct: normalizeDirect(entry.direct),
      note: clampText(entry.note, 600),
      reviewOn: calendarDayOrNull(entry.reviewOn),
      committedOn: finalStatus === 'committed' ? calendarDayOrNull(entry.committedOn) || now.slice(0, 10) : null,
      frozen,
      markers: normalizeMarkers(entry.markers),
      notes: normalizeNotes(entry.notes, now),
      history: normalizeHistory(entry.history, now),
      createdAt: isoOrNull(entry.createdAt) || now,
      updatedAt: isoOrNull(entry.updatedAt) || now,
    });
    if (out.length >= MAX_CLASSES) break;
  }
  if (clearedOrigins) {
    push(`Signal path: cleared ${clearedOrigins} origin pointer(s) to people no longer on the roster`);
  }
  return out;
}

export function normalizeSignalProbes(raw, state = {}, now = new Date().toISOString(), warnings = null) {
  const push = (message) => { if (Array.isArray(warnings)) warnings.push(message); };
  const classIds = new Set((state.signalClasses || []).map((c) => c && c.id).filter(Boolean));
  const rows = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  let orphaned = 0;
  for (const entry of rows) {
    if (!isPlainObject(entry)) continue;
    const id = clampText(entry.id, 120);
    const classId = clampText(entry.classId, 120);
    if (!id) continue;
    if (seen.has(id)) { push('Signal path: dropped a duplicate probe id'); continue; }
    if (!classIds.has(classId)) { orphaned += 1; continue; }
    seen.add(id);
    const status = PROBE_STATUSES.includes(entry.status) ? entry.status : 'open';
    const truth = TRUTHS.includes(entry.truth) ? entry.truth : 'event';
    const delivered = entry.delivered === true ? true : entry.delivered === false ? false : null;
    const learnedVia = LEARNED_VIA.includes(entry.learnedVia) ? entry.learnedVia : null;
    const prediction = isPlainObject(entry.prediction)
      ? {
        reach: preciseOrNull(entry.prediction.reach),
        latencyDays: nonNegativeOrNull(entry.prediction.latencyDays),
        frozenOn: calendarDayOrNull(entry.prediction.frozenOn),
      }
      : null;
    out.push({
      id,
      classId,
      label: clampText(entry.label, 240),
      truth,
      existsSinceOn: calendarDayOrNull(entry.existsSinceOn),
      learnedOn: calendarDayOrNull(entry.learnedOn),
      learnedVia,
      delivered,
      latencyDays: nonNegativeOrNull(entry.latencyDays),
      status: status === 'settled' && delivered === null ? 'open' : status,
      prediction,
      settledOn: calendarDayOrNull(entry.settledOn),
      note: clampText(entry.note, 600),
      markers: normalizeMarkers(entry.markers),
      history: normalizeHistory(entry.history, now),
      createdAt: isoOrNull(entry.createdAt) || now,
      updatedAt: isoOrNull(entry.updatedAt) || now,
    });
    if (out.length >= MAX_PROBES) break;
  }
  if (orphaned) push(`Signal path: dropped ${orphaned} probe(s) whose event class no longer exists`);
  return out;
}

export function normalizeSignalLevers(raw, state = {}, now = new Date().toISOString(), warnings = null) {
  const push = (message) => { if (Array.isArray(warnings)) warnings.push(message); };
  const classIds = new Set((state.signalClasses || []).map((c) => c && c.id).filter(Boolean));
  const personIds = new Set((state.people || []).map((p) => p && p.id).filter(Boolean));
  const rows = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const entry of rows) {
    if (!isPlainObject(entry)) continue;
    const id = clampText(entry.id, 120);
    const classId = clampText(entry.classId, 120);
    const leverId = clampText(entry.leverId, 40);
    if (!id || !leverId) continue;
    if (seen.has(id)) { push('Signal path: dropped a duplicate lever id'); continue; }
    if (!classIds.has(classId)) { push('Signal path: dropped a lever whose event class no longer exists'); continue; }
    seen.add(id);
    out.push({
      id,
      classId,
      leverId,
      label: clampText(entry.label, 200),
      hours: nonNegativeOrNull(entry.hours),
      status: entry.status === 'retired' ? 'retired' : 'active',
      reachBefore: nonNegativeOrNull(entry.reachBefore),
      reachAfter: nonNegativeOrNull(entry.reachAfter),
      latencyBefore: nonNegativeOrNull(entry.latencyBefore),
      latencyAfter: nonNegativeOrNull(entry.latencyAfter),
      value: nonNegativeOrNull(entry.value),
      cost: nonNegativeOrNull(entry.cost),
      ownerId: personIds.has(clampText(entry.ownerId, 120)) ? clampText(entry.ownerId, 120) : null,
      adoptedOn: calendarDayOrNull(entry.adoptedOn),
      reviewOn: calendarDayOrNull(entry.reviewOn),
      outcome: isPlainObject(entry.outcome) ? entry.outcome : null,
      markers: normalizeMarkers(entry.markers),
      history: normalizeHistory(entry.history, now),
      createdAt: isoOrNull(entry.createdAt) || now,
      updatedAt: isoOrNull(entry.updatedAt) || now,
    });
    if (out.length >= MAX_LEVERS) break;
  }
  return out;
}
