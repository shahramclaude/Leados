/**
 * app/core/domain/settlementSchema.js — fail-closed schema normalizers for
 * `state.settlements` and settlement settings (Schema v75, ADR-0067).
 *
 * Invariants enforced on load/import:
 *  1. Ids are exact strings <= 80 chars; duplicate or overlong ids are dropped
 *     with a warning rather than truncated into dangling references.
 *  2. A record claiming `status === 'settled'` without a valid `verdict`
 *     cannot stand: if it carries a valid frozen forecast it returns to
 *     `frozen` with a warning; otherwise it is dropped.
 *  3. Economic variance components, when present on a settled verdict, must be
 *     finite numbers with a 3-letter ISO currency code and exact additive
 *     consistency (`|scheduleEffect + rateEffect + interactionEffect - varianceTotal| <= 0.05`);
 *     inconsistent variance figures are nulled with a warning rather than
 *     trusted.
 *  4. Notes are scrubbed if they contain personal blame words so no imported
 *     file can smuggle scapegoating prose into an attribution receipt.
 */

import {
  SETTLEMENT_FEVER_ZONES,
  SETTLEMENT_LIMITS,
  SETTLEMENT_LOOP_KINDS,
  SETTLEMENT_REGIMES,
  SETTLEMENT_STATUSES,
  SETTLEMENT_THESIS_STATES,
  hasBlameLanguage,
} from './settlementRegistry.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

function isObj(v) {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

function validId(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 && s.length <= 80 ? s : null;
}

function validDay(v) {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return null;
  const ms = Date.parse(`${v}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10) === v ? v : null;
}

function validIso(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function finiteOrNull(v, { min = -1e12, max = 1e12, decimals = 4 } = {}) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function pctOrNull(v, min = 0, max = 100) {
  return finiteOrNull(v, { min, max, decimals: 2 });
}

function normalizeSnapshot(raw) {
  if (!isObj(raw)) return null;
  const feverZone = SETTLEMENT_FEVER_ZONES.includes(raw.feverZone) ? raw.feverZone : 'unscheduled';
  const clearancePct = pctOrNull(raw.clearancePct) ?? 0;
  const leaderClearancePct = pctOrNull(raw.leaderClearancePct);
  const delegateClearancePct = pctOrNull(raw.delegateClearancePct);
  const spiT = finiteOrNull(raw.spiT, { min: 0, max: 20, decimals: 3 });
  const channelCount = Math.max(0, Math.min(20, Math.round(Number(raw.channelCount) || 0)));
  return {
    clearancePct,
    leaderClearancePct,
    delegateClearancePct,
    spiT,
    feverZone,
    channelCount,
  };
}

function normalizeVerdict(raw, warnings) {
  if (!isObj(raw)) return null;
  if (!SETTLEMENT_REGIMES.includes(raw.regime)) return null;
  if (!SETTLEMENT_THESIS_STATES.includes(raw.thesisState)) return null;
  const feverZone = SETTLEMENT_FEVER_ZONES.includes(raw.feverZone) ? raw.feverZone : 'unscheduled';
  const clearancePct = pctOrNull(raw.clearancePct);
  if (clearancePct === null) return null;

  let currency = typeof raw.currency === 'string' && CURRENCY_RE.test(raw.currency.trim().toUpperCase())
    ? raw.currency.trim().toUpperCase()
    : null;
  let plannedCost = finiteOrNull(raw.plannedCost, { min: 0, max: 1e12, decimals: 2 });
  let realizedCost = finiteOrNull(raw.realizedCost, { min: 0, max: 1e12, decimals: 2 });
  let varianceTotal = finiteOrNull(raw.varianceTotal, { min: -1e12, max: 1e12, decimals: 2 });
  let scheduleEffect = finiteOrNull(raw.scheduleEffect, { min: -1e12, max: 1e12, decimals: 2 });
  let rateEffect = finiteOrNull(raw.rateEffect, { min: -1e12, max: 1e12, decimals: 2 });
  let interactionEffect = finiteOrNull(raw.interactionEffect, { min: -1e12, max: 1e12, decimals: 2 });
  let realizedRegret = finiteOrNull(raw.realizedRegret, { min: 0, max: 1e12, decimals: 2 });

  const hasVariance = plannedCost !== null || realizedCost !== null || varianceTotal !== null
    || scheduleEffect !== null || rateEffect !== null || interactionEffect !== null;
  if (hasVariance) {
    const complete = currency !== null && plannedCost !== null && realizedCost !== null
      && varianceTotal !== null && scheduleEffect !== null && rateEffect !== null && interactionEffect !== null;
    const partitionSum = complete ? scheduleEffect + rateEffect + interactionEffect : NaN;
    const expectedDelta = complete ? realizedCost - plannedCost : NaN;
    if (!complete || Math.abs(partitionSum - varianceTotal) > 0.05 || Math.abs(expectedDelta - varianceTotal) > 0.05) {
      warnings?.push('Settlement verdict carried an incomplete or non-additive variance partition; economic fields cleared.');
      currency = null;
      plannedCost = null;
      realizedCost = null;
      varianceTotal = null;
      scheduleEffect = null;
      rateEffect = null;
      interactionEffect = null;
      realizedRegret = null;
    }
  } else {
    currency = currency && realizedRegret !== null ? currency : null;
    if (!currency) realizedRegret = null;
  }

  return {
    regime: raw.regime,
    thesisState: raw.thesisState,
    clearancePct,
    leaderClearancePct: pctOrNull(raw.leaderClearancePct),
    delegateClearancePct: pctOrNull(raw.delegateClearancePct),
    spiT: finiteOrNull(raw.spiT, { min: 0, max: 20, decimals: 3 }),
    svDays: finiteOrNull(raw.svDays, { min: -3650, max: 3650, decimals: 2 }),
    feverZone,
    cleanClosure: raw.cleanClosure === true,
    brier: finiteOrNull(raw.brier, { min: 0, max: 1, decimals: 4 }),
    currency,
    plannedCost,
    realizedCost,
    varianceTotal,
    scheduleEffect,
    rateEffect,
    interactionEffect,
    realizedRegret,
  };
}

export function normalizeSettlementSettings(s = {}) {
  const floorRaw = Math.round(Number(s.settlementFidelityFloorPct));
  const staleRaw = Math.round(Number(s.settlementStaleDays));
  return {
    settlementAutoPropagate: s.settlementAutoPropagate !== false,
    settlementFidelityFloorPct: Number.isFinite(floorRaw)
      ? Math.min(SETTLEMENT_LIMITS.maxFidelityFloorPct, Math.max(SETTLEMENT_LIMITS.minFidelityFloorPct, floorRaw))
      : SETTLEMENT_LIMITS.defaultFidelityFloorPct,
    settlementStaleDays: Number.isFinite(staleRaw)
      ? Math.min(SETTLEMENT_LIMITS.maxStaleDays, Math.max(SETTLEMENT_LIMITS.minStaleDays, staleRaw))
      : SETTLEMENT_LIMITS.defaultStaleDays,
  };
}

export function normalizeSettlements(raw, state, nowIso = new Date().toISOString(), warnings = []) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warnings.push('Settlements ledger was not a list and was reset.');
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!isObj(row)) {
      warnings.push('Dropped a non-object settlement record.');
      continue;
    }
    const id = validId(row.id);
    const sourceId = validId(row.sourceId);
    const loopKind = SETTLEMENT_LOOP_KINDS.includes(row.loopKind) ? row.loopKind : null;
    if (!id || !sourceId || !loopKind || seen.has(id)) {
      warnings.push('Dropped a settlement record with a missing, invalid or duplicate id.');
      continue;
    }
    const prefix = loopKind === 'case-loop' ? 'case' : loopKind;
    const expectedKey = `${prefix}:${sourceId}`;
    const loopKey = typeof row.loopKey === 'string' && row.loopKey === expectedKey ? row.loopKey : expectedKey;
    const openedOn = validDay(row.openedOn);
    const reviewOn = validDay(row.reviewOn);
    if (!openedOn) {
      warnings.push(`Dropped settlement "${id}": missing valid openedOn date.`);
      continue;
    }
    let status = SETTLEMENT_STATUSES.includes(row.status) ? row.status : 'frozen';
    const predictedCleanClosurePct = pctOrNull(
      row.predictedCleanClosurePct,
      SETTLEMENT_LIMITS.minForecastPct,
      SETTLEMENT_LIMITS.maxForecastPct,
    );
    const frozenAt = validIso(row.frozenAt);
    const frozenSnapshot = normalizeSnapshot(row.frozenSnapshot);
    let settledAt = validIso(row.settledAt);
    let settledOn = validDay(row.settledOn);
    let verdict = status === 'settled' || status === 'archived'
      ? normalizeVerdict(row.verdict, warnings)
      : null;

    if (status === 'settled' && (!verdict || !settledOn)) {
      if (predictedCleanClosurePct !== null && reviewOn) {
        warnings.push(`Settlement "${id}" claimed settled status without a valid verdict; reverted to frozen.`);
        status = 'frozen';
        verdict = null;
        settledAt = null;
        settledOn = null;
      } else {
        warnings.push(`Dropped malformed settled receipt "${id}".`);
        continue;
      }
    }
    if (status === 'frozen' && (predictedCleanClosurePct === null || !reviewOn)) {
      warnings.push(`Dropped frozen settlement "${id}" without a forecast percentage or review date.`);
      continue;
    }
    // Out-of-sample integrity: a forecast frozen AFTER settlement cannot claim a Brier score.
    if (verdict && verdict.brier !== null) {
      if (predictedCleanClosurePct === null || !frozenAt || (settledAt && frozenAt > settledAt)) {
        warnings.push(`Cleared retroactive Brier score on settlement "${id}".`);
        verdict = { ...verdict, brier: null };
      }
    }

    let notes = cleanText(row.notes, SETTLEMENT_LIMITS.maxNotes);
    if (hasBlameLanguage(notes)) {
      warnings.push(`Scrubbed personal-blame language from settlement "${id}" notes.`);
      notes = '';
    }

    const caseIdRaw = validId(row.caseId);
    const caseExists = caseIdRaw && Array.isArray(state?.cases)
      ? state.cases.some((c) => c && c.id === caseIdRaw)
      : Boolean(caseIdRaw);
    const caseId = caseExists ? caseIdRaw : null;

    const history = (Array.isArray(row.history) ? row.history : [])
      .filter((h) => isObj(h) && validIso(h.at) && cleanText(h.type, 40))
      .map((h) => ({
        at: validIso(h.at),
        type: cleanText(h.type, 40),
        summary: cleanText(h.summary, 280),
      }))
      .slice(-SETTLEMENT_LIMITS.maxHistory);

    const createdAt = validIso(row.createdAt) || frozenAt || settledAt || nowIso;
    const updatedAt = validIso(row.updatedAt) || settledAt || createdAt;
    seen.add(id);
    out.push({
      id,
      loopKey,
      loopKind,
      sourceId,
      caseId,
      label: cleanText(row.label, SETTLEMENT_LIMITS.maxLabel) || `Loop settlement · ${loopKey}`,
      status,
      openedOn,
      reviewOn: reviewOn || null,
      predictedCleanClosurePct,
      frozenAt: predictedCleanClosurePct !== null ? (frozenAt || createdAt) : null,
      frozenSnapshot,
      settledAt: status === 'settled' || (status === 'archived' && verdict) ? (settledAt || updatedAt) : null,
      settledOn: status === 'settled' || (status === 'archived' && verdict) ? settledOn : null,
      verdict,
      notes,
      history,
      createdAt,
      updatedAt,
    });
  }
  if (out.length > SETTLEMENT_LIMITS.maxRecords) {
    return out.slice(-SETTLEMENT_LIMITS.maxRecords);
  }
  return out;
}
