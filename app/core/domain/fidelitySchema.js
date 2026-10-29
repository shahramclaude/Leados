/**
 * app/core/domain/fidelitySchema.js — the stored contract for Schema v50.
 *
 * `fidelity.js` is the analytics; this module is the part that decides what a
 * half-written or hand-edited plan is allowed to become on load. The rules are
 * the same ones every other ledger in this app follows:
 *
 *  - a dangling reference is cleared with a warning, never re-pointed;
 *  - a frozen settlement is preserved exactly and never recomputed from today's
 *    records, because re-deriving a settled reading would silently rewrite the
 *    history it is supposed to record;
 *  - a plan that claims to be settled without a settlement is reopened rather
 *    than trusted;
 *  - missing stage targets are backfilled from the declared window as a stated
 *    convention, but no attestation, observation or history is ever invented.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import {
  FIDELITY_STAGES,
  FIDELITY_STAGE_KEYS,
  FIDELITY_STATUSES,
  FIDELITY_VERDICTS,
  defaultStageTargets,
} from './fidelity.js';
import { INTERVENTION_BY_ID, INTERVENTION_IDS } from './interventionTypes.js';

export const FIDELITY_SNAPSHOT_VERSION = 1;
export const FIDELITY_MAX_WINDOW_DAYS = 364;
export const FIDELITY_MAX_NOTE = 600;

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v, fallback = '') {
  return typeof v === 'string' ? v : fallback;
}

function numOrNull(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function day(value) {
  const raw = str(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function isoOrNull(value) {
  const raw = str(value).trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function pctOrNull(v) {
  const n = numOrNull(v);
  if (n === null) return null;
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}

/** A frozen settlement. Values are validated for range and preserved, never re-derived. */
export function normalizeSettlement(raw) {
  if (!isPlainObject(raw)) return null;
  const gradeId = str(raw.gradeId).trim();
  const indexPct = pctOrNull(raw.indexPct);
  const coveragePct = pctOrNull(raw.coveragePct);
  if (!gradeId || coveragePct === null) return null;
  const stages = (Array.isArray(raw.stages) ? raw.stages : [])
    .filter(isPlainObject)
    .filter((row) => FIDELITY_STAGE_KEYS.includes(str(row.key)))
    .slice(0, FIDELITY_STAGES.length)
    .map((row) => ({
      key: str(row.key),
      scorePct: pctOrNull(row.scorePct),
      source: ['records', 'attestation', 'none'].includes(str(row.source)) ? str(row.source) : 'none',
      agreement: str(row.agreement, 'unverifiable').slice(0, 24),
    }));
  return {
    version: FIDELITY_SNAPSHOT_VERSION,
    on: day(raw.on) || null,
    at: isoOrNull(raw.at) || null,
    byId: str(raw.byId).trim() || null,
    gradeId,
    indexPct,
    coveragePct,
    exposurePct: pctOrNull(raw.exposurePct),
    unitCount: clampInt(raw.unitCount, 0, 100000, 0),
    populationCount: clampInt(raw.populationCount, 0, 100000, 0),
    plannedUnits: clampInt(raw.plannedUnits, 0, 100000, 0),
    instrumented: raw.instrumented === true,
    stages,
  };
}

function normalizeAttestation(raw, peopleIds) {
  if (!isPlainObject(raw)) return null;
  const verdict = str(raw.verdict).trim();
  if (!FIDELITY_VERDICTS.includes(verdict)) return null;
  const on = day(raw.on);
  if (!on) return null;
  const byId = str(raw.byId).trim();
  return {
    verdict,
    on,
    byId: byId && peopleIds.has(byId) ? byId : null,
    note: str(raw.note).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, FIDELITY_MAX_NOTE),
    at: isoOrNull(raw.at) || null,
  };
}

function normalizeStages(raw, plan, warnings) {
  const rows = Array.isArray(raw) ? raw : [];
  const byKey = new Map();
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const key = str(row.key).trim();
    if (!FIDELITY_STAGE_KEYS.includes(key) || byKey.has(key)) continue;
    byKey.set(key, row);
  }
  const defaults = new Map(defaultStageTargets(plan.windowStart, plan.windowEnd).map((row) => [row.key, row.targetOn]));
  return FIDELITY_STAGES.map((stage) => {
    const row = byKey.get(stage.key) || {};
    const targetOn = day(row.targetOn) || defaults.get(stage.key) || plan.windowEnd;
    return {
      key: stage.key,
      targetOn,
      attested: normalizeAttestation(row.attested, plan.peopleIds || new Set()),
    };
  });
}

/**
 * Normalize the whole collection.
 *
 * `state` is the partially-normalized workspace, which is why this runs after
 * people and impact studies: a plan that points at a deleted owner or a deleted
 * study must lose the pointer instead of carrying a ghost.
 */
export function normalizeFidelityPlans(raw, state, now, warnings) {
  const rows = Array.isArray(raw) ? raw : [];
  const peopleIds = new Set((state?.people || []).map((p) => p && p.id).filter(Boolean));
  const studyIds = new Set((state?.impactStudies || []).map((s) => s && s.id).filter(Boolean));
  const out = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const item = rows[i];
    if (!isPlainObject(item)) continue;
    const id = str(item.id).trim() || `fidelity-${i + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const createdAt = isoOrNull(item.createdAt) || now;
    const createdDay = createdAt.slice(0, 10);
    const interventionType = INTERVENTION_IDS.includes(str(item.interventionType))
      ? str(item.interventionType)
      : 'other';
    const spec = INTERVENTION_BY_ID[interventionType];
    const windowStart = day(item.windowStart) || createdDay;
    let windowEnd = day(item.windowEnd) || addDays(windowStart, 27);
    if (windowEnd < windowStart) {
      warnings.push(`Fidelity plans: “${str(item.title).slice(0, 60) || id}” ended before it started; the window was set to its start day.`);
      windowEnd = windowStart;
    }
    const span = daysBetween(windowStart, windowEnd) ?? 0;
    if (span > FIDELITY_MAX_WINDOW_DAYS) {
      warnings.push(`Fidelity plans: “${str(item.title).slice(0, 60) || id}” declared a window longer than ${FIDELITY_MAX_WINDOW_DAYS} days; it was truncated.`);
      windowEnd = addDays(windowStart, FIDELITY_MAX_WINDOW_DAYS);
    }

    const interventionId = str(item.interventionId).trim() || null;
    if (interventionId && !spec?.entityType) {
      warnings.push(`Fidelity plans: “${str(item.title).slice(0, 60) || id}” names an intervention record for a type with no individual record; the pointer was cleared.`);
    }

    const ownerRaw = str(item.ownerId).trim();
    const ownerId = ownerRaw && peopleIds.has(ownerRaw) ? ownerRaw : null;
    if (ownerRaw && !ownerId) {
      warnings.push(`Fidelity plans: “${str(item.title).slice(0, 60) || id}” pointed at a missing owner; the owner was cleared.`);
    }
    const studyRaw = str(item.studyId).trim();
    const studyId = studyRaw && studyIds.has(studyRaw) ? studyRaw : null;
    if (studyRaw && !studyId) {
      warnings.push(`Fidelity plans: “${str(item.title).slice(0, 60) || id}” pointed at a missing impact study; the link was cleared.`);
    }

    let status = FIDELITY_STATUSES.includes(str(item.status)) ? str(item.status) : 'active';
    const settlement = status === 'settled' ? normalizeSettlement(item.settlement) : null;
    if (status === 'settled' && !settlement) {
      status = 'active';
      warnings.push(`Fidelity plans: “${str(item.title).slice(0, 60) || id}” was marked settled without a frozen settlement; it was reopened rather than trusted.`);
    }
    if (status !== 'settled' && isPlainObject(item.settlement)) {
      warnings.push(`Fidelity plans: “${str(item.title).slice(0, 60) || id}” carried a settlement while not settled; the frozen reading was discarded.`);
    }

    const plan = {
      id,
      title: str(item.title).trim().slice(0, 160) || 'Untitled implementation plan',
      interventionType,
      interventionId: spec?.entityType ? interventionId : null,
      interventionLabel: str(item.interventionLabel).trim().slice(0, 160),
      studyId,
      ownerId,
      population: item.population === null || item.population === undefined || item.population === ''
        ? null
        : clampInt(item.population, 1, 500, null),
      plannedUnits: item.plannedUnits === null || item.plannedUnits === undefined || item.plannedUnits === ''
        ? null
        : clampInt(item.plannedUnits, 1, 5000, null),
      windowStart,
      windowEnd,
      status,
      settlement,
      notes: str(item.notes).replace(/\s+/g, ' ').trim().slice(0, 1000),
      createdAt,
      updatedAt: isoOrNull(item.updatedAt) || createdAt,
    };
    plan.peopleIds = peopleIds;
    plan.stages = normalizeStages(item.stages, plan, warnings);
    delete plan.peopleIds;
    plan.history = (Array.isArray(item.history) ? item.history : [])
      .filter(isPlainObject)
      .slice(-60)
      .map((row) => ({
        at: isoOrNull(row.at) || createdAt,
        type: str(row.type).slice(0, 40) || 'updated',
        summary: str(row.summary).slice(0, 300),
      }));
    out.push(plan);
  }
  return out;
}

/**
 * The implementation reading frozen onto an impact study at scoring time
 * (RULE-FID-05). Counts and dimensionless ratios only: no plan title, no
 * attestation note and no free text can leak into the study's frozen record.
 */
export function normalizeImplementationSnapshot(raw) {
  if (!isPlainObject(raw)) return null;
  const status = ['observed', 'no-linked-plan', 'plan-missing', 'not-instrumented'].includes(str(raw.status))
    ? str(raw.status)
    : null;
  if (!status) return null;
  if (status !== 'observed') return { version: FIDELITY_SNAPSHOT_VERSION, capturedAt: isoOrNull(raw.capturedAt), status };
  const coveragePct = pctOrNull(raw.coveragePct);
  if (coveragePct === null) return null;
  return {
    version: FIDELITY_SNAPSHOT_VERSION,
    capturedAt: isoOrNull(raw.capturedAt) || null,
    status,
    planLinked: true,
    gradeId: str(raw.gradeId).slice(0, 24) || 'insufficient',
    indexPct: pctOrNull(raw.indexPct),
    coveragePct,
    exposurePct: pctOrNull(raw.exposurePct),
    reachPct: pctOrNull(raw.reachPct),
    dosePct: pctOrNull(raw.dosePct),
    deliveryQualityPct: pctOrNull(raw.deliveryQualityPct),
    sustainPct: pctOrNull(raw.sustainPct),
    unitCount: clampInt(raw.unitCount, 0, 100000, 0),
    populationCount: clampInt(raw.populationCount, 0, 100000, 0),
    ittEffect: numOrNull(raw.ittEffect),
    perComplierEffect: numOrNull(raw.perComplierEffect),
    mde: numOrNull(raw.mde),
    perComplierMde: numOrNull(raw.perComplierMde),
    dilutionFactor: numOrNull(raw.dilutionFactor),
    underExposed: raw.underExposed === true,
    amended: false,
  };
}

/** Build the snapshot the rule freezes; kept here so action, rule and test agree. */
export function buildImplementationSnapshot(reading, evaluation, { capturedAt } = {}) {
  if (!reading) return { version: FIDELITY_SNAPSHOT_VERSION, capturedAt: capturedAt || null, status: 'no-linked-plan' };
  const effect = reading.effect || null;
  return normalizeImplementationSnapshot({
    version: FIDELITY_SNAPSHOT_VERSION,
    capturedAt: capturedAt || new Date().toISOString(),
    status: 'observed',
    gradeId: reading.grade?.id || 'insufficient',
    indexPct: reading.index === null ? null : Math.round(reading.index * 1000) / 10,
    coveragePct: Math.round(reading.coverage * 1000) / 10,
    exposurePct: reading.exposurePct,
    reachPct: reading.components?.reachPct,
    dosePct: reading.components?.dosePct,
    deliveryQualityPct: reading.components?.fidelityPct,
    sustainPct: reading.components?.sustainPct,
    unitCount: reading.unitCount,
    populationCount: reading.population?.value ?? 0,
    ittEffect: effect?.itt ?? null,
    perComplierEffect: effect?.perComplier ?? null,
    mde: effect?.mde ?? null,
    perComplierMde: effect?.perComplierMde ?? null,
    dilutionFactor: effect?.dilutionFactor ?? null,
    underExposed: effect?.underExposed === true,
    evaluationEstimate: evaluation?.estimate ?? null,
  });
}

export { dayKey, FIDELITY_STAGE_KEYS };
