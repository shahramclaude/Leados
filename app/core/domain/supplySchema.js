/**
 * app/core/domain/supplySchema.js — Schema v79 fail-closed normalizers for the
 * Evidence Supply Chain.
 *
 * A frozen plan is a QUOTED ARTEFACT: the leader was shown which lines they were
 * going to feed, what each line needed, what it cost in hours and what the
 * probability of at least one line clearing was. If any part of that cannot be
 * read back exactly as written, the honest response is to drop the whole plan
 * with a warning rather than to repair the parts that parse and grade a claim
 * nobody made.
 *
 * Nothing here invents history. An upgraded workspace opens with no plan and no
 * marker, and the report says exactly that.
 */

import {
  SUPPLY_LIMITS,
  SUPPLY_LINE_KEYS,
  supplyLine,
} from './supplyRegistry.js';

const VERDICTS = new Set(['met', 'filling', 'starved', 'retire', 'unobserved']);

/** Only entity types the shared link registry accepts may ride a frozen plan. */
const DEMAND_LINK_TYPES = new Set(['premise', 'decision', 'delegation', 'person', 'case']);

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
 * Read the leader's supply conventions. `supplyMinutesPerUnit` is a per-line map
 * — the one input the engine cannot derive — and an unknown line key is dropped
 * rather than carried, so a renamed line cannot inherit a stale cost.
 */
export function normalizeSupplySettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const L = SUPPLY_LIMITS;
  const minutes = {};
  const rawMinutes = source.supplyMinutesPerUnit && typeof source.supplyMinutesPerUnit === 'object'
    ? source.supplyMinutesPerUnit
    : {};
  for (const line of SUPPLY_LINE_KEYS) {
    const declared = toNum(rawMinutes[line]);
    minutes[line] = declared === null
      ? (supplyLine(line)?.defaultMinutes ?? 15)
      : toInt(declared, supplyLine(line)?.defaultMinutes ?? 15, L.minutesMin, L.minutesMax);
  }
  const required = {};
  const rawRequired = source.supplyRequired && typeof source.supplyRequired === 'object'
    ? source.supplyRequired
    : {};
  for (const line of SUPPLY_LINE_KEYS) {
    const declared = toNum(rawRequired[line]);
    required[line] = declared === null
      ? (supplyLine(line)?.defaultRequired ?? 8)
      : toInt(declared, supplyLine(line)?.defaultRequired ?? 8, 2, 200);
  }
  return {
    supplyWindowDays: toInt(source.supplyWindowDays, L.windowDaysDefault, ...L.windowDays),
    supplyHorizonDays: toInt(source.supplyHorizonDays, L.horizonDaysDefault, ...L.horizonDays),
    supplyStarvePct: toInt(source.supplyStarvePct, L.starvePctDefault, ...L.starvePct),
    supplyBottleneckPct: toInt(source.supplyBottleneckPct, L.bottleneckPctDefault, ...L.bottleneckPct),
    supplyWeeklyHours: clamp(source.supplyWeeklyHours, ...L.weeklyHours) ?? L.weeklyHoursDefault,
    supplyAbandonDays: toInt(source.supplyAbandonDays, L.abandonDaysDefault, ...L.abandonDays),
    supplyCaptureRatio: clamp(source.supplyCaptureRatio, ...L.captureRatio) ?? L.captureRatioDefault,
    supplyPlanCap: toInt(source.supplyPlanCap, L.planCapDefault, ...L.planCap),
    supplyReviewHorizonDays: toInt(source.supplyReviewHorizonDays, L.reviewHorizonDaysDefault, ...L.reviewHorizonDays),
    supplyMaxTasks: toInt(source.supplyMaxTasks, L.maxTasksDefault, ...L.maxTasks),
    supplyMinutesPerUnit: minutes,
    supplyRequired: required,
    supplyAutoPropagate: source.supplyAutoPropagate !== false,
  };
}

function normalizeMember(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const line = typeof raw.line === 'string' && SUPPLY_LINE_KEYS.includes(raw.line) ? raw.line : null;
  const verdict = VERDICTS.has(raw.verdict) ? raw.verdict : null;
  // A member without a readable line and verdict is not repairable: the pair is
  // what the leader was shown, and guessing either would invent a reading.
  if (!line || !verdict) return null;
  const requiredN = toInt(raw.required, 0, 0, 200);
  const observedN = toInt(raw.observedN, 0, 0, 200);
  return {
    line,
    label: typeof raw.label === 'string' ? raw.label.slice(0, 120) : '',
    verdict,
    required: requiredN,
    observedN,
    shortfall: toInt(raw.shortfall, Math.max(0, requiredN - observedN), 0, 200),
    captureHours: clamp(raw.captureHours, 0, 480),
    medianEtaWeeks: clamp(raw.medianEtaWeeks, 0, 1040),
    pClearBeforeHorizonPct: clamp(raw.pClearBeforeHorizonPct, 0, 100),
    demandCount: toInt(raw.demandCount, 0, 0, 100000),
    demandIds: Array.isArray(raw.demandIds)
      ? raw.demandIds
        .filter((item) => item && typeof item.type === 'string' && typeof item.id === 'string'
          && DEMAND_LINK_TYPES.has(item.type) && item.id)
        .slice(0, 4)
        .map((item) => ({ type: item.type, id: item.id.slice(0, 80) }))
      : [],
  };
}

function normalizeGrade(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gradedAt = typeof raw.gradedAt === 'string' ? raw.gradedAt : '';
  if (!gradedAt) return null;
  return {
    gradedAt,
    anyClear: raw.anyClear === true,
    clearedLines: Array.isArray(raw.clearedLines)
      ? [...new Set(raw.clearedLines.filter((k) => SUPPLY_LINE_KEYS.includes(k)))].slice(0, 12)
      : [],
    brier: clamp(raw.brier, 0, 1),
  };
}

function normalizePlan(raw, warnings) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  const frozenAt = typeof raw.frozenAt === 'string' ? raw.frozenAt : '';
  const reviewOn = day(raw.reviewOn);
  if (!id || !frozenAt || !reviewOn) return null;
  const predicted = toNum(raw.predictedAnyClearPct);
  if (predicted === null) {
    warnings.push(`A frozen supply plan (${id}) is probability-free and was dropped rather than back-filled.`);
    return null;
  }
  const rawMembers = Array.isArray(raw.members) ? raw.members : [];
  const members = [];
  for (const entry of rawMembers.slice(0, SUPPLY_LIMITS.maxMembers)) {
    const member = normalizeMember(entry);
    if (!member) {
      warnings.push(`A frozen supply plan (${id}) contains a member with no readable line or verdict; the whole plan was dropped because it is one quoted artefact.`);
      return null;
    }
    members.push(member);
  }
  return {
    id,
    frozenAt,
    reviewOn,
    windowDays: toInt(raw.windowDays, SUPPLY_LIMITS.windowDaysDefault, ...SUPPLY_LIMITS.windowDays),
    horizonDays: toInt(raw.horizonDays, SUPPLY_LIMITS.horizonDaysDefault, ...SUPPLY_LIMITS.horizonDays),
    budgetHours: clamp(raw.budgetHours, 0, 80),
    hoursCommitted: clamp(raw.hoursCommitted, 0, 160),
    bottleneckLine: typeof raw.bottleneckLine === 'string' && SUPPLY_LINE_KEYS.includes(raw.bottleneckLine)
      ? raw.bottleneckLine
      : null,
    members,
    predictedAnyClearPct: Math.min(100, Math.max(0, predicted)),
    predictedAnyClearIndependencePct: clamp(raw.predictedAnyClearIndependencePct, 0, 100),
    reservePct: clamp(raw.reservePct, 0, 100),
    graded: normalizeGrade(raw.graded),
    challengeNotes: Array.isArray(raw.challengeNotes)
      ? raw.challengeNotes.filter((n) => typeof n === 'string').slice(-20).map((n) => n.slice(0, 400))
      : [],
  };
}

export function normalizeSupplyPlans(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const plan = normalizePlan(entry, warnings);
    if (!plan || seen.has(plan.id)) continue;
    seen.add(plan.id);
    out.push(plan);
  }
  out.sort((a, b) => (a.reviewOn < b.reviewOn ? -1 : a.reviewOn > b.reviewOn ? 1 : 0));
  const cap = SUPPLY_LIMITS.planCapDefault;
  if (out.length > cap) {
    warnings.push(`${out.length - cap} older supply plan(s) were dropped beyond the ${cap}-plan cap.`);
  }
  return out.slice(-cap);
}

export function normalizeSupplyMarkers(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || !entry) continue;
    out.push(entry.slice(0, 200));
  }
  if (out.length > 400) {
    warnings.push(`${out.length - 400} older supply marker(s) were dropped beyond the 400-marker cap.`);
  }
  return out.slice(-400);
}
