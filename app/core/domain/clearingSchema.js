/**
 * app/core/domain/clearingSchema.js — fail-closed persistence contract and
 * input validators for the Hierarchical Clearinghouse (`#/clearing`,
 * Schema v100, ADR-0098).
 *
 * Every malformed round, inconsistent frozen solution, or orphan settlement is
 * DROPPED with an explicit normalization warning — never silently repaired into
 * a resource commitment a leader might act on.
 */
import { ALTITUDE_KEYS } from './chainRegistry.js';
import {
  CLEARING_DEFAULTS,
  CLEARING_ENGINE_VERSION,
  CLEARING_LIMITS,
  CLEARING_LINKABLE_TYPES,
  CLEARING_MARKER_KINDS,
  CLEARING_REGIMES,
  CLEARING_STATUSES,
} from './clearingRegistry.js';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALTITUDES = new Set(ALTITUDE_KEYS);
const STATUS_SET = new Set(CLEARING_STATUSES);
const REGIME_SET = new Set(CLEARING_REGIMES);
const LINKABLE_SET = new Set(CLEARING_LINKABLE_TYPES);
const MARKER_KIND_SET = new Set(CLEARING_MARKER_KINDS);
const CERT_ENGINES = new Set(['enumeration', 'branch-and-bound']);
const MIX_POSTURES = new Set(['balanced', 'budget-bottleneck', 'capacity-bottleneck', 'mix-imbalance', 'slack']);
const EVIDENCE_STATUSES = new Set(['corroborated', 'uncorroborated', 'contradicted', 'unlinked']);

function text(value, max = 140) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function idOrNull(value, max = 80) {
  const out = text(value, max);
  return out || null;
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
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function finiteNonNegative(value, max = 1_000_000_000) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 10000) / 10000;
}

export function normalizeClearingSettings(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const L = CLEARING_LIMITS;
  const highPct = boundedInt(
    s.clearingMixImbalanceHighPct,
    L.imbalanceHighPctMin,
    L.imbalanceHighPctMax,
    CLEARING_DEFAULTS.clearingMixImbalanceHighPct,
  );
  const lowRaw = boundedInt(
    s.clearingMixImbalanceLowPct,
    L.imbalanceLowPctMin,
    L.imbalanceLowPctMax,
    CLEARING_DEFAULTS.clearingMixImbalanceLowPct,
  );
  return {
    clearingCellFloor: boundedInt(s.clearingCellFloor, L.cellFloorMin, L.cellFloorMax, CLEARING_DEFAULTS.clearingCellFloor),
    clearingReviewDays: boundedInt(s.clearingReviewDays, L.reviewDaysMin, L.reviewDaysMax, CLEARING_DEFAULTS.clearingReviewDays),
    clearingAutoPropagate: s.clearingAutoPropagate !== false,
    clearingMaxCombinations: boundedInt(s.clearingMaxCombinations, L.combinationsMin, L.combinationsMax, CLEARING_DEFAULTS.clearingMaxCombinations),
    clearingNodeBudget: boundedInt(s.clearingNodeBudget, L.nodeBudgetMin, L.nodeBudgetMax, CLEARING_DEFAULTS.clearingNodeBudget),
    clearingMixImbalanceHighPct: highPct,
    clearingMixImbalanceLowPct: Math.min(lowRaw, highPct - 10),
  };
}

export function clearingConventions(rawSettings = {}) {
  return normalizeClearingSettings({ ...CLEARING_DEFAULTS, ...(rawSettings || {}) });
}

function normalizeTier(raw, idx) {
  if (!raw || typeof raw !== 'object') return null;
  const L = CLEARING_LIMITS;
  const key = text(raw.key, 40) || `t${idx + 1}`;
  const label = text(raw.label, L.labelMax);
  if (!label) return null;
  const cost = Number(raw.cost);
  const capacityDays = Number(raw.capacityDays);
  const valueLo = Number(raw.valueLo);
  const valueHi = Number(raw.valueHi);
  if (
    !Number.isInteger(cost) || cost < 0 || cost > L.budgetMax ||
    !Number.isInteger(capacityDays) || capacityDays < 0 || capacityDays > L.capacityDaysMax ||
    !Number.isInteger(valueLo) || valueLo < 0 || valueLo > L.valueMax ||
    !Number.isInteger(valueHi) || valueHi < valueLo || valueHi > L.valueMax
  ) {
    return null;
  }
  return {
    key,
    label,
    cost,
    capacityDays,
    valueLo,
    valueHi,
    isMinimumViable: raw.isMinimumViable === true,
  };
}

function normalizeBid(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const L = CLEARING_LIMITS;
  const bidderSeatId = text(raw.bidderSeatId, 80);
  const submittedOn = validDay(raw.submittedOn);
  if (!bidderSeatId || !submittedOn) return null;
  const rawTiers = Array.isArray(raw.tiers) ? raw.tiers : [];
  if (rawTiers.length < 1 || rawTiers.length > L.tiersPerBidMax) return null;
  const tiers = [];
  const tierKeys = new Set();
  for (let i = 0; i < rawTiers.length; i += 1) {
    const tier = normalizeTier(rawTiers[i], i);
    if (!tier || tierKeys.has(tier.key)) return null;
    tierKeys.add(tier.key);
    tiers.push(tier);
  }
  const linkedEntityTypeRaw = text(raw.linkedEntityType, 32);
  const linkedEntityIdRaw = idOrNull(raw.linkedEntityId);
  if (linkedEntityTypeRaw && !LINKABLE_SET.has(linkedEntityTypeRaw)) return null;
  const linkedEntityType = linkedEntityTypeRaw && linkedEntityIdRaw ? linkedEntityTypeRaw : null;
  const linkedEntityId = linkedEntityType ? linkedEntityIdRaw : null;
  return {
    bidderSeatId,
    submittedOn,
    submittedAt: isoOrNull(raw.submittedAt) || `${submittedOn}T00:00:00.000Z`,
    linkedEntityType,
    linkedEntityId,
    note: text(raw.note, L.noteMax),
    tiers,
  };
}

/** Validate opening a clearing round before writing to state. */
export function validateClearingRoundDeclaration(input = {}) {
  const s = input && typeof input === 'object' ? input : {};
  const L = CLEARING_LIMITS;
  const title = text(s.title, L.titleMax);
  if (!title) {
    return { ok: false, error: 'Name the clearing round in one clear line so bidders and auditors know what envelope is being cleared.', field: 'title' };
  }
  const outcomeLabel = text(s.outcomeLabel, L.labelMax);
  if (!outcomeLabel) {
    return { ok: false, error: 'Declare the common outcome unit all bids are valued in (e.g. "customer blockers closed" or "net kEUR contribution").', field: 'outcomeLabel' };
  }
  const currency = text(s.currency, 8).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, error: 'Declare one 3-letter ISO currency code (e.g. EUR, USD, DKK). Money is never pooled across currencies.', field: 'currency' };
  }
  const budgetCap = Number(s.budgetCap);
  if (!Number.isInteger(budgetCap) || budgetCap < 0 || budgetCap > L.budgetMax) {
    return { ok: false, error: `Declare a whole-number budget cap between 0 and ${L.budgetMax}.`, field: 'budgetCap' };
  }
  const capacityCap = Number(s.capacityCap);
  if (!Number.isInteger(capacityCap) || capacityCap < 0 || capacityCap > L.capacityDaysMax) {
    return { ok: false, error: `Declare a whole-number shared capacity cap (person-days) between 0 and ${L.capacityDaysMax}.`, field: 'capacityCap' };
  }
  if (budgetCap === 0 && capacityCap === 0) {
    return { ok: false, error: 'At least one scarce resource cap (budget or shared capacity days) must be positive.', field: 'budgetCap' };
  }
  const reserveBudget = s.reserveBudget === undefined || s.reserveBudget === null || s.reserveBudget === ''
    ? 0 : Number(s.reserveBudget);
  if (!Number.isInteger(reserveBudget) || reserveBudget < 0 || reserveBudget > budgetCap) {
    return { ok: false, error: 'Reserve budget must be a whole number between 0 and the round budget cap.', field: 'reserveBudget' };
  }
  const reserveCapacity = s.reserveCapacity === undefined || s.reserveCapacity === null || s.reserveCapacity === ''
    ? 0 : Number(s.reserveCapacity);
  if (!Number.isInteger(reserveCapacity) || reserveCapacity < 0 || reserveCapacity > capacityCap) {
    return { ok: false, error: 'Reserve capacity must be a whole number between 0 and the round capacity cap.', field: 'reserveCapacity' };
  }
  const horizonDays = Number(s.horizonDays);
  if (!Number.isInteger(horizonDays) || horizonDays < L.horizonDaysMin || horizonDays > L.horizonDaysMax) {
    return { ok: false, error: `Horizon must be a whole number of days between ${L.horizonDaysMin} and ${L.horizonDaysMax}.`, field: 'horizonDays' };
  }
  const gamma = s.gamma === undefined || s.gamma === null || s.gamma === '' ? 1 : Number(s.gamma);
  if (!Number.isInteger(gamma) || gamma < 0 || gamma > L.bidsPerRoundMax) {
    return { ok: false, error: `Declare an uncertainty budget Γ as a whole number between 0 and ${L.bidsPerRoundMax}.`, field: 'gamma' };
  }
  let expectedHurdleHoldPct = null;
  if (s.expectedHurdleHoldPct !== undefined && s.expectedHurdleHoldPct !== null && s.expectedHurdleHoldPct !== '') {
    const pct = Number(s.expectedHurdleHoldPct);
    if (!Number.isInteger(pct) || pct < L.expectedHoldPctMin || pct > L.expectedHoldPctMax) {
      return {
        ok: false,
        error: `Pre-registered hurdle-hold expectation must be between ${L.expectedHoldPctMin}% and ${L.expectedHoldPctMax}% (or left blank).`,
        field: 'expectedHurdleHoldPct',
      };
    }
    expectedHurdleHoldPct = pct;
  }
  return {
    ok: true,
    declaration: {
      title,
      outcomeLabel,
      currency,
      budgetCap,
      capacityCap,
      reserveBudget,
      reserveCapacity,
      horizonDays,
      gamma,
      respectFloors: s.respectFloors !== false,
      expectedHurdleHoldPct,
      linkedBudgetId: idOrNull(s.linkedBudgetId),
      strategyBetId: idOrNull(s.strategyBetId),
    },
  };
}

/** Validate a sealed multi-tranche bid schedule from a subordinate span. */
export function validateClearingBidInput(input = {}) {
  const s = input && typeof input === 'object' ? input : {};
  const L = CLEARING_LIMITS;
  const bidderSeatId = text(s.bidderSeatId, 80);
  if (!bidderSeatId) {
    return { ok: false, error: 'Identify which subordinate leadership span is submitting this bid.', field: 'bidderSeatId' };
  }
  const rawTiers = Array.isArray(s.tiers) ? s.tiers : [];
  if (rawTiers.length < 1 || rawTiers.length > L.tiersPerBidMax) {
    return { ok: false, error: `Submit between 1 and ${L.tiersPerBidMax} discrete package tiers.`, field: 'tiers' };
  }
  const tiers = [];
  const keys = new Set();
  for (let i = 0; i < rawTiers.length; i += 1) {
    const t = normalizeTier(rawTiers[i], i);
    if (!t) {
      return {
        ok: false,
        error: `Tier ${i + 1} requires a label, non-negative whole-number cost and capacity days, and an outcome range with valueHi ≥ valueLo ≥ 0.`,
        field: 'tiers',
      };
    }
    if (keys.has(t.key)) {
      return { ok: false, error: `Duplicate tier key "${t.key}".`, field: 'tiers' };
    }
    keys.add(t.key);
    tiers.push(t);
  }
  const linkedEntityTypeRaw = text(s.linkedEntityType, 32);
  const linkedEntityIdRaw = idOrNull(s.linkedEntityId);
  if (linkedEntityTypeRaw && !LINKABLE_SET.has(linkedEntityTypeRaw)) {
    return { ok: false, error: `Linked entity type must be one of: ${CLEARING_LINKABLE_TYPES.join(', ')}.`, field: 'linkedEntityType' };
  }
  if ((linkedEntityTypeRaw && !linkedEntityIdRaw) || (!linkedEntityTypeRaw && linkedEntityIdRaw)) {
    return { ok: false, error: 'Provide both linkedEntityType and linkedEntityId when linking a workspace delivery record, or leave both blank.', field: 'linkedEntityId' };
  }
  return {
    ok: true,
    bid: {
      bidderSeatId,
      linkedEntityType: linkedEntityTypeRaw || null,
      linkedEntityId: linkedEntityIdRaw || null,
      note: text(s.note, L.noteMax),
      tiers,
    },
  };
}

/** Validate settlement outcomes against a cleared round's funded spans. */
export function validateClearingSettlementInput(input = {}, round = null) {
  const s = input && typeof input === 'object' ? input : {};
  const L = CLEARING_LIMITS;
  if (!round || !round.frozen || !Array.isArray(round.frozen.allocations)) {
    return { ok: false, error: 'Only a cleared round with a frozen allocation can be settled.' };
  }
  const funded = round.frozen.allocations.filter((a) => a.chosenTierIndex > 0);
  if (!funded.length) {
    return { ok: true, settlementInput: { outcomesBySpan: new Map(), note: text(s.note, L.noteMax) } };
  }
  const rawOutcomes = Array.isArray(s.outcomes) ? s.outcomes : [];
  const outcomesBySpan = new Map();
  for (const entry of rawOutcomes) {
    if (!entry || typeof entry !== 'object') continue;
    const spanId = text(entry.bidderSeatId, 80);
    const val = Number(entry.realizedValue);
    if (!spanId || !Number.isInteger(val) || val < 0 || val > L.valueMax) {
      return {
        ok: false,
        error: 'Each funded span requires a non-negative whole-number realized outcome value.',
        field: 'outcomes',
      };
    }
    outcomesBySpan.set(spanId, val);
  }
  for (const alloc of funded) {
    if (!outcomesBySpan.has(alloc.bidderSeatId)) {
      return {
        ok: false,
        error: `Provide a realized outcome value for every funded span (missing "${alloc.bidderSeatId}").`,
        field: 'outcomes',
      };
    }
  }
  return {
    ok: true,
    settlementInput: {
      outcomesBySpan,
      note: text(s.note, L.noteMax),
    },
  };
}

function normalizeCertificate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { engine: 'enumeration', combinations: null, nodes: null, pruned: null, budget: null, certified: true };
  }
  const engine = CERT_ENGINES.has(text(raw.engine, 40)) ? text(raw.engine, 40) : 'enumeration';
  const intOrNull = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  return {
    engine,
    combinations: intOrNull(raw.combinations),
    nodes: intOrNull(raw.nodes),
    pruned: intOrNull(raw.pruned),
    budget: intOrNull(raw.budget),
    certified: raw.certified !== false,
  };
}

function normalizeFrozen(raw, bidSpanSet) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const regime = REGIME_SET.has(text(raw.regime, 24)) ? text(raw.regime, 24) : null;
  if (!regime || !Array.isArray(raw.allocations)) return null;
  const L = CLEARING_LIMITS;
  const intField = (v, max = L.valueMax * 20) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
  };
  const signedInt = (v, max = L.valueMax * 20) => {
    const n = Number(v);
    return Number.isInteger(n) && Math.abs(n) <= max ? n : null;
  };
  const netBudgetCap = intField(raw.netBudgetCap, L.budgetMax);
  const netCapacityCap = intField(raw.netCapacityCap, L.capacityDaysMax);
  const committedBudget = intField(raw.committedBudget, L.budgetMax);
  const committedCapacityDays = intField(raw.committedCapacityDays, L.capacityDaysMax);
  const activeObjective = intField(raw.activeObjective);
  const nominalObjective = intField(raw.nominalObjective);
  const robustWorstCase = intField(raw.robustWorstCase);
  const minimaxRegret = intField(raw.minimaxRegret);
  const proportionalHaircutValue = intField(raw.proportionalHaircutValue);
  const equalSplitValue = intField(raw.equalSplitValue);
  const reallocationAlpha = signedInt(raw.reallocationAlpha);
  const priceOfFloors = intField(raw.priceOfFloors);
  const dualBudgetPrice = finiteNonNegative(raw.dualBudgetPrice);
  const dualCapacityPrice = finiteNonNegative(raw.dualCapacityPrice);
  const lagrangianBound = finiteNonNegative(raw.lagrangianBound);
  const decentralizationGap = finiteNonNegative(raw.decentralizationGap);
  const nextBudgetStepGain = intField(raw.nextBudgetStepGain);
  const nextCapacityDayGain = intField(raw.nextCapacityDayGain);
  const budgetStep = intField(raw.budgetStep, L.budgetMax) ?? 1;
  const mixPosture = MIX_POSTURES.has(text(raw.mixPosture, 40)) ? text(raw.mixPosture, 40) : 'balanced';
  const rationedPositiveSpans = intField(raw.rationedPositiveSpans, L.bidsPerRoundMax) ?? 0;
  const hhi = intField(raw.hhi, 10000) ?? 0;

  if (
    netBudgetCap === null || netCapacityCap === null ||
    committedBudget === null || committedCapacityDays === null ||
    committedBudget > netBudgetCap || committedCapacityDays > netCapacityCap ||
    activeObjective === null || nominalObjective === null ||
    robustWorstCase === null || minimaxRegret === null ||
    proportionalHaircutValue === null || equalSplitValue === null ||
    reallocationAlpha === null || priceOfFloors === null ||
    dualBudgetPrice === null || dualCapacityPrice === null ||
    lagrangianBound === null || decentralizationGap === null ||
    nextBudgetStepGain === null || nextCapacityDayGain === null
  ) {
    return null;
  }

  const allocations = [];
  const seenSpans = new Set();
  for (const item of raw.allocations) {
    if (!item || typeof item !== 'object') return null;
    const bidderSeatId = text(item.bidderSeatId, 80);
    if (!bidderSeatId || !bidSpanSet.has(bidderSeatId) || seenSpans.has(bidderSeatId)) return null;
    seenSpans.add(bidderSeatId);
    const chosenTierIndex = intField(item.chosenTierIndex, L.tiersPerBidMax);
    const allocatedCost = intField(item.allocatedCost, L.budgetMax);
    const allocatedCapacityDays = intField(item.allocatedCapacityDays, L.capacityDaysMax);
    const valueLo = intField(item.valueLo, L.valueMax);
    const valueHi = intField(item.valueHi, L.valueMax);
    const effectiveValue = intField(item.effectiveValue, L.valueMax);
    const welfareWithoutSpan = intField(item.welfareWithoutSpan);
    const othersWelfareWithSpan = intField(item.othersWelfareWithSpan);
    const clarkeExternality = intField(item.clarkeExternality);
    const marginalContribution = intField(item.marginalContribution);
    if (
      chosenTierIndex === null || allocatedCost === null || allocatedCapacityDays === null ||
      valueLo === null || valueHi === null || valueHi < valueLo || effectiveValue === null ||
      welfareWithoutSpan === null || othersWelfareWithSpan === null ||
      clarkeExternality === null || marginalContribution === null
    ) {
      return null;
    }
    allocations.push({
      bidderSeatId,
      chosenTierIndex,
      tierKey: chosenTierIndex > 0 ? text(item.tierKey, 40) : null,
      tierLabel: chosenTierIndex > 0 ? text(item.tierLabel, L.labelMax) : '',
      allocatedCost,
      allocatedCapacityDays,
      valueLo,
      valueHi,
      effectiveValue,
      welfareWithoutSpan,
      othersWelfareWithSpan,
      clarkeExternality,
      marginalContribution,
      pivotal: clarkeExternality > 0,
    });
  }
  if (allocations.length !== bidSpanSet.size) return null;

  return {
    regime,
    netBudgetCap,
    netCapacityCap,
    committedBudget,
    committedCapacityDays,
    activeObjective,
    nominalObjective,
    robustWorstCase,
    minimaxRegret,
    proportionalHaircutValue,
    equalSplitValue,
    reallocationAlpha,
    priceOfFloors,
    dualBudgetPrice,
    dualCapacityPrice,
    lagrangianBound,
    decentralizationGap,
    nextBudgetStepGain,
    nextCapacityDayGain,
    budgetStep,
    mixPosture,
    rationedPositiveSpans,
    hhi,
    allocations,
    certificate: normalizeCertificate(raw.certificate),
  };
}

function normalizeSettlement(raw, frozen) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !frozen) return null;
  const settledOn = validDay(raw.settledOn);
  if (!settledOn || !Array.isArray(raw.outcomes)) return null;
  const L = CLEARING_LIMITS;
  const fundedMap = new Map(
    frozen.allocations.filter((a) => a.chosenTierIndex > 0).map((a) => [a.bidderSeatId, a]),
  );
  const outcomes = [];
  const seen = new Set();
  for (const row of raw.outcomes) {
    if (!row || typeof row !== 'object') return null;
    const bidderSeatId = text(row.bidderSeatId, 80);
    if (!bidderSeatId || !fundedMap.has(bidderSeatId) || seen.has(bidderSeatId)) return null;
    seen.add(bidderSeatId);
    const alloc = fundedMap.get(bidderSeatId);
    const realizedValue = Number(row.realizedValue);
    if (!Number.isInteger(realizedValue) || realizedValue < 0 || realizedValue > L.valueMax) return null;
    const clarkeExternality = alloc.clarkeExternality;
    const pivotal = alloc.pivotal;
    const hurdleCleared = !pivotal || realizedValue >= clarkeExternality;
    const hurdleDeficit = pivotal ? Math.max(0, clarkeExternality - realizedValue) : 0;
    const evidenceStatus = EVIDENCE_STATUSES.has(text(row.evidenceStatus, 32))
      ? text(row.evidenceStatus, 32) : 'unlinked';
    outcomes.push({
      bidderSeatId,
      realizedValue,
      clarkeExternality,
      pivotal,
      hurdleCleared,
      hurdleDeficit,
      evidenceStatus,
    });
  }
  if (outcomes.length !== fundedMap.size) return null;

  const totalDeclaredValue = frozen.allocations
    .filter((a) => a.chosenTierIndex > 0)
    .reduce((acc, a) => acc + a.effectiveValue, 0);
  const totalRealizedValue = outcomes.reduce((acc, o) => acc + o.realizedValue, 0);
  const realizationPct = totalDeclaredValue > 0
    ? Math.round((totalRealizedValue / totalDeclaredValue) * 100)
    : null;
  const pivotalRows = outcomes.filter((o) => o.pivotal);
  const pivotalCount = pivotalRows.length;
  const pivotalClearedCount = pivotalRows.filter((o) => o.hurdleCleared).length;
  const allPivotalCleared = pivotalCount > 0 ? pivotalClearedCount === pivotalCount : null;
  let brier = null;
  if (raw.brier !== null && raw.brier !== undefined) {
    const b = Number(raw.brier);
    if (Number.isFinite(b) && b >= 0 && b <= 1) brier = Math.round(b * 10000) / 10000;
  }

  return {
    settledOn,
    settledAt: isoOrNull(raw.settledAt) || `${settledOn}T00:00:00.000Z`,
    outcomes,
    totalDeclaredValue,
    totalRealizedValue,
    realizationPct,
    pivotalCount,
    pivotalClearedCount,
    allPivotalCleared,
    brier,
    note: text(raw.note, L.noteMax),
  };
}

export function normalizeClearingRounds(raw, warnings = []) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('clearingRounds was not an array; reset to [].');
    return [];
  }
  const L = CLEARING_LIMITS;
  const out = [];
  const seenIds = new Set();

  for (const row of raw) {
    if (out.length >= L.rounds) break;
    if (!row || typeof row !== 'object') {
      warnings.push('Dropped a non-object clearing round.');
      continue;
    }
    const id = text(row.id, 80);
    const title = text(row.title, L.titleMax);
    const outcomeLabel = text(row.outcomeLabel, L.labelMax);
    const currency = text(row.currency, 8).toUpperCase();
    const openedOn = validDay(row.openedOn);
    const horizonOn = validDay(row.horizonOn);
    const scopeSeatId = text(row.scopeSeatId, 80);
    const altitudeKey = text(row.altitudeKey, 24);
    const rank = boundedInt(row.rank, 1, 5, 0);
    const status = STATUS_SET.has(text(row.status, 24)) ? text(row.status, 24) : null;

    if (
      !id || seenIds.has(id) || !title || !outcomeLabel || !/^[A-Z]{3}$/.test(currency) ||
      !openedOn || !horizonOn || horizonOn < openedOn || !scopeSeatId ||
      !ALTITUDES.has(altitudeKey) || rank < 1 || !status
    ) {
      warnings.push(`Dropped malformed clearing round "${id || 'unknown'}".`);
      continue;
    }

    const budgetCap = Number(row.budgetCap);
    const capacityCap = Number(row.capacityCap);
    const reserveBudget = row.reserveBudget === undefined ? 0 : Number(row.reserveBudget);
    const reserveCapacity = row.reserveCapacity === undefined ? 0 : Number(row.reserveCapacity);
    const gamma = Number(row.gamma);
    if (
      !Number.isInteger(budgetCap) || budgetCap < 0 || budgetCap > L.budgetMax ||
      !Number.isInteger(capacityCap) || capacityCap < 0 || capacityCap > L.capacityDaysMax ||
      (budgetCap === 0 && capacityCap === 0) ||
      !Number.isInteger(reserveBudget) || reserveBudget < 0 || reserveBudget > budgetCap ||
      !Number.isInteger(reserveCapacity) || reserveCapacity < 0 || reserveCapacity > capacityCap ||
      !Number.isInteger(gamma) || gamma < 0 || gamma > L.bidsPerRoundMax
    ) {
      warnings.push(`Dropped clearing round "${id}" with invalid resource caps or Γ.`);
      continue;
    }

    let expectedHurdleHoldPct = null;
    if (row.expectedHurdleHoldPct !== null && row.expectedHurdleHoldPct !== undefined) {
      const pct = Number(row.expectedHurdleHoldPct);
      if (!Number.isInteger(pct) || pct < L.expectedHoldPctMin || pct > L.expectedHoldPctMax) {
        warnings.push(`Dropped clearing round "${id}" with out-of-range expectedHurdleHoldPct.`);
        continue;
      }
      expectedHurdleHoldPct = pct;
    }

    const rawBids = Array.isArray(row.bids) ? row.bids : [];
    if (rawBids.length > L.bidsPerRoundMax) {
      warnings.push(`Dropped clearing round "${id}" exceeding bid limit.`);
      continue;
    }
    const bids = [];
    const bidSpans = new Set();
    let badBid = false;
    for (const rawBid of rawBids) {
      const bid = normalizeBid(rawBid);
      if (!bid || bidSpans.has(bid.bidderSeatId)) {
        badBid = true;
        break;
      }
      bidSpans.add(bid.bidderSeatId);
      bids.push(bid);
    }
    if (badBid) {
      warnings.push(`Dropped clearing round "${id}" containing a malformed or duplicate span bid.`);
      continue;
    }

    let clearedOn = null;
    let adoptedRegime = null;
    let frozen = null;
    let settlement = null;
    let withdrawnOn = null;

    if (status === 'cleared' || status === 'settled') {
      clearedOn = validDay(row.clearedOn);
      adoptedRegime = REGIME_SET.has(text(row.adoptedRegime, 24)) ? text(row.adoptedRegime, 24) : null;
      frozen = normalizeFrozen(row.frozen, bidSpans);
      if (!clearedOn || !adoptedRegime || !frozen || bids.length < 1) {
        warnings.push(`Dropped ${status} clearing round "${id}" without a valid frozen solution.`);
        continue;
      }
    }
    if (status === 'settled') {
      settlement = normalizeSettlement(row.settlement, frozen);
      if (!settlement) {
        warnings.push(`Dropped settled clearing round "${id}" without a consistent settlement record.`);
        continue;
      }
    }
    if (status === 'withdrawn') {
      withdrawnOn = validDay(row.withdrawnOn) || openedOn;
    }

    seenIds.add(id);
    out.push({
      id,
      title,
      outcomeLabel,
      currency,
      openedOn,
      horizonOn,
      scopeSeatId,
      ownerId: scopeSeatId === 'leader' ? null : scopeSeatId,
      altitudeKey,
      rank,
      budgetCap,
      capacityCap,
      reserveBudget,
      reserveCapacity,
      gamma,
      respectFloors: row.respectFloors !== false,
      expectedHurdleHoldPct,
      linkedBudgetId: idOrNull(row.linkedBudgetId),
      strategyBetId: idOrNull(row.strategyBetId),
      bids,
      status,
      clearedOn,
      adoptedRegime,
      overrideNote: text(row.overrideNote, L.noteMax),
      frozen,
      settlement,
      withdrawnOn,
      engineVersion: text(row.engineVersion, 60) || CLEARING_ENGINE_VERSION,
      createdAt: isoOrNull(row.createdAt) || `${openedOn}T00:00:00.000Z`,
    });
  }
  return out;
}

export function normalizeClearingMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    if (out.length >= CLEARING_LIMITS.markers) break;
    if (!row || typeof row !== 'object') continue;
    const id = text(row.id, 140);
    const ruleId = text(row.ruleId, 32);
    const kind = text(row.kind, 24);
    const subjectKey = text(row.subjectKey, 140);
    const recordedOn = validDay(row.recordedOn);
    if (!id || seen.has(id) || !ruleId || !MARKER_KIND_SET.has(kind) || !subjectKey || !recordedOn) continue;
    seen.add(id);
    out.push({
      id,
      ruleId,
      kind,
      subjectKey,
      roundId: idOrNull(row.roundId),
      decisionId: idOrNull(row.decisionId),
      delegationId: idOrNull(row.delegationId),
      recordedOn,
    });
  }
  return out;
}
