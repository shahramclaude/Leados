/**
 * app/core/domain/solvencySchema.js — Schema v80 fail-closed normalizers for the
 * Promise Solvency Terminal.
 *
 * A frozen reading is a QUOTED ARTEFACT. The leader was shown the exposures they
 * were carrying, what each one's breach probability was, the joint probability
 * the book would break at least once, the coverage ratio and the horizon. If any
 * member cannot be read back exactly as written, the honest response is to drop
 * the whole reading with a warning rather than to repair the parts that parse
 * and grade a claim nobody made.
 *
 * Nothing here invents history: an upgraded workspace opens with no reading, no
 * marker and no renegotiation ledger, and the terminal says exactly that.
 */

import { SOLVENCY_LIMITS, PROMISE_SOURCE_KEYS } from './solvencyRegistry.js';

const MAX_EXPOSURES = SOLVENCY_LIMITS.maxExposures;
const MAX_RENEGOTIATIONS = 200;

function toInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toNum(value) {
  // `Number(null)` is 0, which would turn a missing probability into a certain
  // forecast. A missing value must stay missing.
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  const n = toNum(value);
  return n === null ? null : Math.min(max, Math.max(min, n));
}

function day(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Read the leader's solvency conventions. The single-factor correlation, the
 * alarm, the on-time bar, the history floor, the breach multiplier and the move
 * cap are all declared — none of them is derived, and each is clamped to a range
 * that cannot switch its own test off.
 */
export function normalizeSolvencySettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const L = SOLVENCY_LIMITS;
  return {
    solvencyWindowDays: toInt(source.solvencyWindowDays, L.windowDaysDefault, ...L.windowDays),
    solvencyHorizonDays: toInt(source.solvencyHorizonDays, L.horizonDaysDefault, ...L.horizonDays),
    solvencyRhoPct: toInt(source.solvencyRhoPct, L.rhoPctDefault, ...L.rhoPct),
    solvencyAlarmPct: toInt(source.solvencyAlarmPct, L.alarmPctDefault, ...L.alarmPct),
    solvencyOnTimeBarPct: toInt(source.solvencyOnTimeBarPct, L.onTimeBarPctDefault, ...L.onTimeBarPct),
    solvencyMinHistory: toInt(source.solvencyMinHistory, L.minHistoryDefault, ...L.minHistory),
    solvencyBreachMultiplier: clamp(source.solvencyBreachMultiplier, ...L.breachMultiplier)
      ?? L.breachMultiplierDefault,
    solvencyReviewHorizonDays: toInt(source.solvencyReviewHorizonDays, L.reviewHorizonDaysDefault, ...L.reviewHorizonDays),
    solvencyReadingCap: toInt(source.solvencyReadingCap, L.readingCapDefault, ...L.readingCap),
    solvencyMaxTasks: toInt(source.solvencyMaxTasks, L.maxTasksDefault, ...L.maxTasks),
    solvencyMaxMoves: toInt(source.solvencyMaxMoves, L.maxMovesDefault, ...L.maxMoves),
    solvencyAllowPooling: source.solvencyAllowPooling !== false,
    solvencyAutoPropagate: source.solvencyAutoPropagate !== false,
  };
}

function normalizeExposure(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sourceKey = typeof raw.sourceKey === 'string' && PROMISE_SOURCE_KEYS.includes(raw.sourceKey)
    ? raw.sourceKey
    : null;
  const promiseId = typeof raw.promiseId === 'string' && raw.promiseId ? raw.promiseId : null;
  const obligationOn = day(raw.obligationOn);
  const pdPct = clamp(raw.pdPct, 0, 100);
  // The quadruple IS the quoted claim: which promise, when it was owed, and what
  // the book said its chance of breaking was. Guessing any part of it would
  // invent a reading.
  if (!sourceKey || !promiseId || !obligationOn || pdPct === null) return null;
  return {
    sourceKey,
    promiseId,
    label: typeof raw.label === 'string' ? raw.label.slice(0, 140) : '',
    obligationOn,
    pdPct: Math.round(pdPct * 100) / 100,
    weight: clamp(raw.weight, 0.5, 5),
    pricedBy: raw.pricedBy === 'pool' ? 'pool' : 'own',
    contributionPct: clamp(raw.contributionPct, 0, 100),
  };
}

function normalizeGrade(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gradedAt = typeof raw.gradedAt === 'string' ? raw.gradedAt : '';
  if (!gradedAt) return null;
  return {
    gradedAt,
    anyBreach: raw.anyBreach === true,
    breachedCount: toInt(raw.breachedCount, 0, 0, MAX_EXPOSURES),
    considered: toInt(raw.considered, 0, 0, MAX_EXPOSURES),
    scored: toInt(raw.scored, 0, 0, MAX_EXPOSURES),
    baseRatePct: clamp(raw.baseRatePct, 0, 100),
    brier: clamp(raw.brier, 0, 1),
    brierRef: clamp(raw.brierRef, 0, 1),
    /* Skill is unbounded below: a model can be arbitrarily worse than its own
       climatology, and the sign is the message. Floor at -99 rather than clip. */
    skill: Number.isFinite(Number(raw.skill)) ? Math.max(-99, Math.min(1, Number(raw.skill))) : null,
    brierJoint: clamp(raw.brierJoint, 0, 1),
    /* Count scores: RPS lives on [0, n − 1]; the log score is unbounded above and
       is capped at 50 nats, which is already a probability of 2e-22. */
    countRps: clamp(raw.countRps, 0, MAX_EXPOSURES),
    countRpsIndependence: clamp(raw.countRpsIndependence, 0, MAX_EXPOSURES),
    countLog: clamp(raw.countLog, 0, 50),
    countLogIndependence: clamp(raw.countLogIndependence, 0, 50),
    lapsed: raw.lapsed === true,
  };
}

function normalizeReading(raw, warnings) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  const frozenAt = typeof raw.frozenAt === 'string' ? raw.frozenAt : '';
  const reviewOn = day(raw.reviewOn);
  if (!id || !frozenAt || !reviewOn) return null;
  const predicted = toNum(raw.predictedAnyBreachPct);
  if (predicted === null) {
    warnings.push(`A frozen solvency reading (${id}) is probability-free and was dropped rather than back-filled.`);
    return null;
  }
  const rawExposures = Array.isArray(raw.exposures) ? raw.exposures : [];
  const exposures = [];
  for (const entry of rawExposures.slice(0, MAX_EXPOSURES)) {
    const exposure = normalizeExposure(entry);
    if (!exposure) {
      warnings.push(`A frozen solvency reading (${id}) contains an exposure with no readable promise, date or probability; the whole reading was dropped because it is one quoted artefact.`);
      return null;
    }
    exposures.push(exposure);
  }
  return {
    id,
    frozenAt,
    reviewOn,
    horizonDays: toInt(raw.horizonDays, SOLVENCY_LIMITS.horizonDaysDefault, ...SOLVENCY_LIMITS.horizonDays),
    windowDays: toInt(raw.windowDays, SOLVENCY_LIMITS.windowDaysDefault, ...SOLVENCY_LIMITS.windowDays),
    rhoPct: toInt(raw.rhoPct, SOLVENCY_LIMITS.rhoPctDefault, ...SOLVENCY_LIMITS.rhoPct),
    alarmPct: toInt(raw.alarmPct, SOLVENCY_LIMITS.alarmPctDefault, ...SOLVENCY_LIMITS.alarmPct),
    exposures,
    predictedAnyBreachPct: Math.min(100, Math.max(0, predicted)),
    predictedCeilingPct: clamp(raw.predictedCeilingPct, 0, 100),
    expectedBreaches: clamp(raw.expectedBreaches, 0, 1000),
    breachSharePct: clamp(raw.breachSharePct, 0, 100),
    predictedIndependencePct: clamp(raw.predictedIndependencePct, 0, 100),
    predictedComonotonicPct: clamp(raw.predictedComonotonicPct, 0, 100),
    coverageRatio: clamp(raw.coverageRatio, 0, 99),
    dueCount: toInt(raw.dueCount, exposures.length, 0, 100000),
    overdueCount: toInt(raw.overdueCount, 0, 0, 100000),
    unpricedCount: toInt(raw.unpricedCount, 0, 0, 100000),
    pricedByPoolCount: toInt(raw.pricedByPoolCount, 0, 0, MAX_EXPOSURES),
    expectedLossUnits: clamp(raw.expectedLossUnits, 0, 100000),
    repairCount: toInt(raw.repairCount, 0, 0, MAX_EXPOSURES),
    graded: normalizeGrade(raw.graded),
    challengeNotes: Array.isArray(raw.challengeNotes)
      ? raw.challengeNotes.filter((n) => typeof n === 'string').slice(-20).map((n) => n.slice(0, 400))
      : [],
  };
}

export function normalizeSolvencyReadings(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const reading = normalizeReading(entry, warnings);
    if (!reading || seen.has(reading.id)) continue;
    seen.add(reading.id);
    out.push(reading);
  }
  out.sort((a, b) => (a.reviewOn < b.reviewOn ? -1 : a.reviewOn > b.reviewOn ? 1 : 0));
  const cap = SOLVENCY_LIMITS.readingCapDefault;
  if (out.length > cap) {
    warnings.push(`${out.length - cap} older solvency reading(s) were dropped beyond the ${cap}-reading cap.`);
  }
  return out.slice(-cap);
}

export function normalizeSolvencyMarkers(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  /* A marker is a claim that a rule has already fired. A duplicate asserts
     nothing new and only spends the cap, so the store is a set. */
  for (const entry of raw) {
    if (typeof entry !== 'string' || !entry) continue;
    const tag = entry.slice(0, 200);
    if (!out.includes(tag)) out.push(tag);
  }
  if (out.length > 400) {
    warnings.push(`${out.length - 400} older solvency marker(s) were dropped beyond the 400-marker cap.`);
  }
  return out.slice(-400);
}

/**
 * The renegotiation ledger is append-only history: what the date was, what it
 * became, why, and when. It is never rewritten, because the whole point of the
 * move cap is that the record remembers how many times a date has moved.
 */
function normalizeRenegotiation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sourceKey = typeof raw.sourceKey === 'string' && PROMISE_SOURCE_KEYS.includes(raw.sourceKey)
    ? raw.sourceKey
    : null;
  const promiseId = typeof raw.promiseId === 'string' && raw.promiseId ? raw.promiseId : null;
  const fromOn = day(raw.fromOn);
  const toOn = day(raw.toOn);
  const at = typeof raw.at === 'string' ? raw.at : '';
  if (!sourceKey || !promiseId || !fromOn || !toOn || !at || toOn <= fromOn) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `sreneg-${sourceKey}-${promiseId}-${fromOn}`,
    sourceKey,
    promiseId,
    fromOn,
    toOn,
    reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 600) : '',
    at,
  };
}

export function normalizeSolvencyRenegotiations(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const row = normalizeRenegotiation(entry);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  if (out.length > MAX_RENEGOTIATIONS) {
    warnings.push(`${out.length - MAX_RENEGOTIATIONS} older renegotiation record(s) were dropped beyond the ${MAX_RENEGOTIATIONS}-record cap.`);
  }
  return out.slice(-MAX_RENEGOTIATIONS);
}
