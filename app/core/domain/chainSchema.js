/**
 * app/core/domain/chainSchema.js — Schema v82 fail-closed normalizers and
 * conventions for the Command Chain.
 *
 * A frozen reading is a QUOTED ARTEFACT: the leader was shown which span was
 * read, how much work it carries, the rates it could defend, and one probability
 * that its own work would breach the next altitude's horizon. If any part of
 * that cannot be read back exactly as written, the honest response is to drop
 * the reading with a warning rather than to repair the parts that parse and then
 * grade a claim nobody made.
 *
 * Nothing here invents history. An upgraded workspace opens with no reading and
 * no marker, and the report says exactly that.
 */

import {
  ALTITUDE_KEYS,
  CHAIN_LIMITS,
  RATE_METRIC_KEYS,
  SIGNAL_SOURCE_KEYS,
} from './chainRegistry.js';

function toNum(value) {
  // `Number(null)` is 0, which would turn a missing probability into a certain
  // forecast. A missing value must stay missing.
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clamp(value, min, max) {
  const n = toNum(value);
  return n === null ? null : Math.min(max, Math.max(min, n));
}

function day(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function text(value, max = 400) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, max) : '';
}

/**
 * The leader's own altitude plus every declared convention. The leader's altitude
 * is the only structural input the engine cannot derive: the workspace leader
 * holds no roster record, so there is nothing to infer a title from — and
 * inferring one from the levels of their reports would be inventing a job.
 */
export function chainConventions(settings = {}) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const leaderAltitude = ALTITUDE_KEYS.includes(source.chainLeaderAltitude)
    ? source.chainLeaderAltitude
    : 'frontline';
  const spanMin = toInt(source.chainSpanMin, CHAIN_LIMITS.spanMinDefault, ...CHAIN_LIMITS.spanMin);
  const spanMax = toInt(source.chainSpanMax, Math.max(spanMin + 1, CHAIN_LIMITS.spanMaxDefault), spanMin + 1, CHAIN_LIMITS.spanMax[1]);
  return {
    leaderName: text(source.leaderName, 120),
    chainLeaderAltitude: leaderAltitude,
    chainFloorN: toInt(source.chainFloorN, CHAIN_LIMITS.floorNDefault, ...CHAIN_LIMITS.floorN),
    chainDriftPct: toInt(source.chainDriftPct, CHAIN_LIMITS.driftPctDefault, ...CHAIN_LIMITS.driftPct),
    chainSpanMin: spanMin,
    chainSpanMax: spanMax,
    chainMaterialityPp: clamp(source.chainMaterialityPp, ...CHAIN_LIMITS.materialityPp) ?? CHAIN_LIMITS.materialityPpDefault,
    chainWindowDays: toInt(source.chainWindowDays, CHAIN_LIMITS.windowDaysDefault, ...CHAIN_LIMITS.windowDays),
    chainReviewHorizonDays: toInt(source.chainReviewHorizonDays, CHAIN_LIMITS.reviewHorizonDaysDefault, ...CHAIN_LIMITS.reviewHorizonDays),
    chainMaxTasks: toInt(source.chainMaxTasks, CHAIN_LIMITS.maxTasksDefault, ...CHAIN_LIMITS.maxTasks),
    chainReadingCap: toInt(source.chainReadingCap, CHAIN_LIMITS.readingCapDefault, ...CHAIN_LIMITS.readingCap),
    chainMaxDepth: toInt(source.chainMaxDepth, CHAIN_LIMITS.maxDepthDefault, ...CHAIN_LIMITS.maxDepth),
    chainAutoPropagate: source.chainAutoPropagate !== false,
  };
}

export function normalizeChainSettings(settings) {
  return chainConventions(settings);
}

function normalizeCounts(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of ['peopleN', 'openN', 'ownOpenN', 'overdueN', 'debtN', 'severityLoad']) {
    out[key] = toInt(source[key], 0, 0, 100000);
  }
  out.oldestAgeDays = source.oldestAgeDays === null || source.oldestAgeDays === undefined
    ? null
    : toInt(source.oldestAgeDays, 0, 0, 36500);
  return out;
}

function normalizeRates(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && RATE_METRIC_KEYS.includes(entry.key))
    .map((entry) => {
      const den = toInt(entry.den, 0, 0, 100000);
      const num = toInt(entry.num, 0, 0, den);
      // A stored rate that disagrees with its own counts is not repairable: one
      // of the two numbers is the quoted artefact, and we cannot tell which.
      const derived = den > 0 ? Math.round((num / den) * 1000) / 10 : null;
      const stored = toNum(entry.rate);
      return {
        key: entry.key,
        num,
        den,
        rate: derived !== null && stored !== null && Math.abs(derived - stored) < 0.15 ? stored : null,
        refused: derived !== null && (stored === null || Math.abs(derived - stored) >= 0.15)
          ? 'the stored rate disagreed with its own counts and was withheld rather than guessed'
          : (typeof entry.refused === 'string' ? text(entry.refused, 300) : (derived === null ? 'no observation' : null)),
      };
    });
}

function normalizeComposite(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    pooled: clamp(raw.pooled, 0, 100),
    meanOfRates: clamp(raw.meanOfRates, 0, 100),
    gapPp: clamp(raw.gapPp, -100, 100),
    compositionSensitive: raw.compositionSensitive === true,
  };
}

function normalizeMembers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && SIGNAL_SOURCE_KEYS.includes(entry.type) && typeof entry.id === 'string' && entry.id)
    .slice(0, CHAIN_LIMITS.maxMembers)
    .map((entry) => ({
      type: entry.type,
      id: entry.id.slice(0, 120),
      pBreachPct: clamp(entry.pBreachPct, 0, 100),
      thresholdDays: toInt(entry.thresholdDays, 0, 0, 3650),
      thresholdOn: day(entry.thresholdOn),
    }));
}

function normalizeGrade(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gradedAt = typeof raw.gradedAt === 'string' ? raw.gradedAt : '';
  if (!gradedAt) return null;
  return {
    gradedAt,
    observedBreachN: raw.observedBreachN === null || raw.observedBreachN === undefined
      ? null
      : toInt(raw.observedBreachN, 0, 0, 10000),
    anyBreach: raw.anyBreach === true ? true : raw.anyBreach === false ? false : null,
    brier: clamp(raw.brier, 0, 1),
    countError: raw.countError === null || raw.countError === undefined ? null : toInt(raw.countError, 0, 0, 10000),
    unmeasurableN: toInt(raw.unmeasurableN, 0, 0, 10000),
    measuredN: raw.measuredN === undefined ? null : toInt(raw.measuredN, 0, 0, 10000),
    lapsed: raw.lapsed === true,
    note: text(raw.note, 400),
  };
}

function normalizeReading(raw, warnings) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  const frozenAt = typeof raw.frozenAt === 'string' ? raw.frozenAt : '';
  const reviewOn = day(raw.reviewOn);
  const nodeId = typeof raw.nodeId === 'string' && raw.nodeId ? raw.nodeId : null;
  if (!id || !frozenAt || !reviewOn || !nodeId) return null;
  const predicted = toNum(raw.predictedAnyBreachPct);
  const quoteRefused = typeof raw.quoteRefused === 'string' && raw.quoteRefused ? text(raw.quoteRefused, 400) : null;
  // A reading is a claim. A reading with neither a probability nor a recorded
  // refusal is neither a claim nor an honest gap, so it is dropped.
  if (predicted === null && !quoteRefused) {
    warnings.push(`A frozen chain reading (${id}) carries neither a probability nor a recorded refusal and was dropped rather than back-filled.`);
    return null;
  }
  return {
    id,
    nodeId,
    altitude: ALTITUDE_KEYS.includes(raw.altitude) ? raw.altitude : null,
    frozenAt,
    reviewOn,
    reviewDays: toInt(raw.reviewDays, CHAIN_LIMITS.reviewHorizonDaysDefault, ...CHAIN_LIMITS.reviewHorizonDays),
    windowDays: toInt(raw.windowDays, CHAIN_LIMITS.windowDaysDefault, ...CHAIN_LIMITS.windowDays),
    counts: normalizeCounts(raw.counts),
    rates: normalizeRates(raw.rates),
    composite: normalizeComposite(raw.composite),
    nextThresholdDays: raw.nextThresholdDays === null || raw.nextThresholdDays === undefined
      ? null
      : toInt(raw.nextThresholdDays, 0, 0, 3650),
    predictedAnyBreachPct: predicted === null ? null : Math.min(100, Math.max(0, predicted)),
    predictedAnyBreachIndependencePct: clamp(raw.predictedAnyBreachIndependencePct, 0, 100),
    predictedBreachN: raw.predictedBreachN === null || raw.predictedBreachN === undefined
      ? null
      : toInt(raw.predictedBreachN, 0, 0, 10000),
    quoteRefused,
    members: normalizeMembers(raw.members),
    graded: normalizeGrade(raw.graded),
    lapsedOn: day(raw.lapsedOn),
    challengeNotes: Array.isArray(raw.challengeNotes)
      ? raw.challengeNotes.filter((note) => typeof note === 'string').slice(-20).map((note) => text(note, 400))
      : [],
  };
}

export function normalizeChainReadings(raw, warnings = [], { cap = CHAIN_LIMITS.readingCapDefault } = {}) {
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
  if (out.length > cap) {
    warnings.push(`${out.length - cap} older chain reading(s) were dropped beyond the ${cap}-reading cap.`);
  }
  return out.slice(-cap);
}

export function normalizeChainMarkers(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || !entry) continue;
    out.push(entry.slice(0, 220));
  }
  if (out.length > 400) {
    warnings.push(`${out.length - 400} older chain marker(s) were dropped beyond the 400-marker cap.`);
  }
  return out.slice(-400);
}
