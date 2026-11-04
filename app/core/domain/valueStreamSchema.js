/** Fail-closed normalizers for Schema v91 Value Stream Exchange records. */
import {
  VALUE_STREAM_BOUNDS,
  VALUE_STREAM_CONTRACT_STATUSES,
  VALUE_STREAM_DEFAULTS,
  VALUE_STREAM_DIRECTIONS,
  VALUE_STREAM_LIMITS,
  VALUE_STREAM_ROUND_KINDS,
  VALUE_STREAM_SETTLEMENTS,
} from './valueStreamRegistry.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const DIGEST_RE = /^[a-f0-9]{16}$/;
const str = (v, max = 240) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const idOrNull = (v) => str(v, 80) || null;
function dayOrNull(v) {
  const s = str(v, 10);
  if (!DAY_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}
function isoOrFallback(v, fallback = '1970-01-01T00:00:00.000Z') {
  if (typeof v !== 'string' || !v.trim()) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}
function numberOrNull(v, { min = 0, max = 1e9 } = {}) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
}
function clampSetting(v, key) {
  const n = Number(v);
  const [lo, hi] = VALUE_STREAM_BOUNDS[key];
  const fallback = VALUE_STREAM_DEFAULTS[key];
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
}

export function normalizeValueStreamSettings(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    valueStreamCellFloor: clampSetting(s.valueStreamCellFloor, 'valueStreamCellFloor'),
    valueStreamMaxDecisions: clampSetting(s.valueStreamMaxDecisions, 'valueStreamMaxDecisions'),
    valueStreamAutoPropagate: s.valueStreamAutoPropagate !== false,
  };
}

export function normalizeValueStreamContract(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const title = str(raw.title, 180);
  const supplierSeatId = idOrNull(raw.supplierSeatId);
  const consumerSeatId = idOrNull(raw.consumerSeatId);
  const mediatorSeatId = idOrNull(raw.mediatorSeatId);
  const metric = str(raw.metric, 140);
  const unit = str(raw.unit, 40);
  const direction = VALUE_STREAM_DIRECTIONS.includes(raw.direction) ? raw.direction : null;
  const target = numberOrNull(raw.target, { min: 0.000001 });
  if (!id || !title || !supplierSeatId || !consumerSeatId || supplierSeatId === consumerSeatId
    || !mediatorSeatId || !metric || !unit || !direction || target === null
    || !VALUE_STREAM_CONTRACT_STATUSES.includes(raw.status)) return null;
  const settlementOutcome = raw.status === 'settled'
    ? (VALUE_STREAM_SETTLEMENTS.includes(raw.settlementOutcome) ? raw.settlementOutcome : null)
    : null;
  if (raw.status === 'settled' && !settlementOutcome) return null;
  const currencyRaw = str(raw.currency, 3).toUpperCase();
  const createdAt = isoOrFallback(raw.createdAt);
  const agreedOn = dayOrNull(raw.agreedOn);
  return {
    id, title, summary: str(raw.summary, 500),
    supplierSeatId, consumerSeatId, mediatorSeatId,
    // Declared person keys let the generic projection fail closed. The
    // reviewed Value Stream read adapter adds the explicit party exception.
    ownerId: mediatorSeatId,
    partyIds: [supplierSeatId, consumerSeatId],
    strategyBetId: idOrNull(raw.strategyBetId),
    supplierPactId: idOrNull(raw.supplierPactId),
    consumerPactId: idOrNull(raw.consumerPactId),
    metric, unit, direction, target,
    actual: numberOrNull(raw.actual),
    effortDays: numberOrNull(raw.effortDays, { max: 365 }) ?? 0,
    leadTimeDays: numberOrNull(raw.leadTimeDays, { min: 0.01, max: 365 }),
    startsOn: dayOrNull(raw.startsOn), dueOn: dayOrNull(raw.dueOn),
    currency: CURRENCY_RE.test(currencyRaw) ? currencyRaw : null,
    resourceAskAmount: numberOrNull(raw.resourceAskAmount),
    status: raw.status,
    proposerSeatId: idOrNull(raw.proposerSeatId) || supplierSeatId,
    awaitingConsentSeatId: idOrNull(raw.awaitingConsentSeatId),
    lastActorSeatId: idOrNull(raw.lastActorSeatId),
    roundCount: Math.max(1, Math.min(500, Math.round(Number(raw.roundCount) || 1))),
    agreedOn,
    settledOn: settlementOutcome ? (dayOrNull(raw.settledOn) || createdAt.slice(0, 10)) : null,
    settlementOutcome,
    settlementNote: settlementOutcome ? str(raw.settlementNote, 400) : '',
    withdrawnOn: raw.status === 'withdrawn' ? dayOrNull(raw.withdrawnOn) : null,
    createdAt,
    updatedAt: isoOrFallback(raw.updatedAt, createdAt),
  };
}

function normalizeRows(raw, collection, normalize, cap, warnings) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push(`${collection} was not an array; reset to [].`);
    return [];
  }
  const seen = new Set(); const out = [];
  for (const item of raw) {
    const row = normalize(item);
    if (!row) { warnings.push(`${collection}: dropped a malformed record.`); continue; }
    if (seen.has(row.id)) { warnings.push(`${collection}: dropped duplicate id "${row.id}".`); continue; }
    seen.add(row.id); out.push(row);
  }
  return out.slice(-cap);
}
export function normalizeValueStreamContracts(raw, warnings = []) {
  return normalizeRows(raw, 'valueStreamContracts', normalizeValueStreamContract, VALUE_STREAM_LIMITS.contracts, warnings);
}

export function normalizeValueStreamRound(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id); const contractId = idOrNull(raw.contractId);
  const actorSeatId = idOrNull(raw.actorSeatId);
  if (!id || !contractId || !actorSeatId || !VALUE_STREAM_ROUND_KINDS.includes(raw.kind)) return null;
  const createdAt = isoOrFallback(raw.createdAt);
  const direction = VALUE_STREAM_DIRECTIONS.includes(raw.direction) ? raw.direction : null;
  return {
    id, contractId, actorSeatId, kind: raw.kind,
    roundNumber: Math.max(1, Math.min(500, Math.round(Number(raw.roundNumber) || 1))),
    metric: str(raw.metric, 140), unit: str(raw.unit, 40), direction,
    target: numberOrNull(raw.target, { min: 0.000001 }), actual: numberOrNull(raw.actual),
    effortDays: numberOrNull(raw.effortDays, { max: 365 }),
    leadTimeDays: numberOrNull(raw.leadTimeDays, { min: 0.01, max: 365 }),
    dueOn: dayOrNull(raw.dueOn), recordedOn: dayOrNull(raw.recordedOn) || createdAt.slice(0, 10),
    note: str(raw.note, 400), createdAt,
  };
}
export function normalizeValueStreamRounds(raw, warnings = []) {
  return normalizeRows(raw, 'valueStreamRounds', normalizeValueStreamRound, VALUE_STREAM_LIMITS.rounds, warnings);
}

function normalizeSourceLine(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sourcePactId = idOrNull(raw.sourcePactId); const sourceBudgetId = idOrNull(raw.sourceBudgetId);
  const sourceLineId = idOrNull(raw.sourceLineId); const strategyBetId = idOrNull(raw.strategyBetId);
  if (!sourcePactId || !sourceBudgetId || !sourceLineId || !strategyBetId) return null;
  const cur = str(raw.currency, 3).toUpperCase();
  return {
    sourcePactId, sourceBudgetId, sourceLineId, strategyBetId,
    plannedEffortDays: numberOrNull(raw.plannedEffortDays, { max: 365 }) ?? 0,
    actualEffortDays: numberOrNull(raw.actualEffortDays, { max: 365 }),
    releasedEffortDays: numberOrNull(raw.releasedEffortDays, { max: 365 }) ?? 0,
    releasedBudgetAmount: numberOrNull(raw.releasedBudgetAmount) ?? 0,
    currency: CURRENCY_RE.test(cur) ? cur : null,
  };
}
export function normalizeValueStreamReallocation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id); const targetPactId = idOrNull(raw.targetPactId);
  const targetSeatId = idOrNull(raw.targetSeatId); const targetStrategyBetId = idOrNull(raw.targetStrategyBetId);
  const createdBySeatId = idOrNull(raw.createdBySeatId); const mediatorSeatId = idOrNull(raw.mediatorSeatId);
  const previewDigest = str(raw.previewDigest, 16).toLowerCase();
  const sourceLines = Array.isArray(raw.sourceLines) ? raw.sourceLines.map(normalizeSourceLine).filter(Boolean) : [];
  if (!id || !targetPactId || !targetSeatId || !targetStrategyBetId || !createdBySeatId || !mediatorSeatId
    || raw.status !== 'committed' || !DIGEST_RE.test(previewDigest) || !sourceLines.length) return null;
  const cur = str(raw.currency, 3).toUpperCase();
  const createdAt = isoOrFallback(raw.createdAt);
  return {
    id, title: str(raw.title, 180), status: 'committed', previewDigest,
    sourceLines, targetPactId, targetSeatId, targetStrategyBetId,
    targetBudgetId: idOrNull(raw.targetBudgetId), targetBudgetLineId: idOrNull(raw.targetBudgetLineId),
    createdBySeatId, mediatorSeatId,
    releasedEffortDays: numberOrNull(raw.releasedEffortDays, { max: 3650 }) ?? 0,
    allocatedEffortDays: numberOrNull(raw.allocatedEffortDays, { max: 365 }) ?? 0,
    unallocatedEffortDays: numberOrNull(raw.unallocatedEffortDays, { max: 3650 }) ?? 0,
    releasedBudgetAmount: numberOrNull(raw.releasedBudgetAmount) ?? 0,
    allocatedBudgetAmount: numberOrNull(raw.allocatedBudgetAmount) ?? 0,
    unallocatedBudgetAmount: numberOrNull(raw.unallocatedBudgetAmount) ?? 0,
    currency: CURRENCY_RE.test(cur) ? cur : null,
    effortActualsComplete: raw.effortActualsComplete === true,
    rationale: str(raw.rationale, 500), createdOn: dayOrNull(raw.createdOn) || createdAt.slice(0, 10), createdAt,
  };
}
export function normalizeValueStreamReallocations(raw, warnings = []) {
  return normalizeRows(raw, 'valueStreamReallocations', normalizeValueStreamReallocation, VALUE_STREAM_LIMITS.reallocations, warnings);
}
export function normalizeValueStreamMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(); const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const key = str(item.key || item.id, 180);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: idOrNull(item.id) || `vsm-${out.length + 1}`, key, kind: str(item.kind, 60),
      recordedOn: dayOrNull(item.recordedOn), summary: str(item.summary, 260) });
  }
  return out.slice(-VALUE_STREAM_LIMITS.markers);
}
