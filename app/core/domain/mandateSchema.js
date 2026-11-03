import { SIGNAL_SOURCE_KEYS } from './chainRegistry.js';
import { MANDATE_ACTIONS, MANDATE_LIMITS, MANDATE_STATUSES } from './mandateRegistry.js';

const text = (v, max = MANDATE_LIMITS.maxText) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const id = (v) => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(v) ? v : null;
const day = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : null;
const stamp = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const number = (v) => v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;

/** Unknown and zero are different: missing capacity remains null. */
export function normalizeCapacity(raw) {
  if (!raw || typeof raw !== 'object') return { state: 'unknown', headroomDays: null, measuredItems: 0, openCommitments: 0, reason: 'No measured capacity snapshot was recorded.' };
  const headroomDays = number(raw.headroomDays);
  const measuredItems = Math.max(0, Math.round(number(raw.measuredItems) || 0));
  const state = ['available', 'insufficient', 'unknown'].includes(raw.state) ? raw.state : 'unknown';
  return { state: measuredItems && headroomDays !== null ? state : 'unknown', headroomDays: measuredItems ? headroomDays : null,
    measuredItems, openCommitments: Math.max(0, Math.round(number(raw.openCommitments) || 0)), reason: text(raw.reason, 500) };
}

export function normalizeMandates(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const required = [row.id, row.sourceId, row.fromSeatId, row.toSeatId].map(id);
    const createdAt = stamp(row.createdAt);
    const expiresOn = day(row.expiresOn);
    const effortDays = number(row.effortDays);
    const actions = [...new Set((Array.isArray(row.actions) ? row.actions : []).filter((a) => Object.hasOwn(MANDATE_ACTIONS, a)))];
    const history = (Array.isArray(row.history) ? row.history : []).slice(-MANDATE_LIMITS.maxTransitions).map((e) => e && typeof e === 'object' ? {
      at: stamp(e.at), status: MANDATE_STATUSES.includes(e.status) ? e.status : null, actorSeatId: id(e.actorSeatId), note: text(e.note),
    } : null).filter((e) => e?.at && e.status && e.actorSeatId);
    const valid = required.every(Boolean) && createdAt && expiresOn && MANDATE_STATUSES.includes(row.status)
      && text(row.outcome) && actions.length && effortDays !== null && effortDays > 0 && effortDays <= 365
      && history.length && history.at(-1).status === row.status
      && SIGNAL_SOURCE_KEYS.includes(row.sourceType);
    if (!valid || seen.has(row.id)) {
      warnings.push('Decision rights: an incomplete or duplicate mandate was refused; no authority was inferred.');
      continue;
    }
    if (out.length >= MANDATE_LIMITS.maxRecords) { warnings.push('Decision rights: record cap reached; additional records were not loaded.'); continue; }
    seen.add(row.id);
    const ceiling = number(row.spendCeiling);
    const currency = text(row.currency, 3).toUpperCase();
    const moneyValid = actions.includes('spend') ? ceiling !== null && ceiling >= 0 && /^[A-Z]{3}$/.test(currency) : true;
    if (!moneyValid) { warnings.push('Decision rights: a spending mandate without a valid ceiling and currency was refused.'); continue; }
    out.push({
      id: row.id, title: text(row.title, 200), sourceType: row.sourceType, sourceId: row.sourceId,
      sourceFingerprint: text(row.sourceFingerprint, 100), fromSeatId: row.fromSeatId, toSeatId: row.toSeatId,
      peopleIds: [...new Set((Array.isArray(row.peopleIds) ? row.peopleIds : []).map(id).filter(Boolean))],
      direction: ['down', 'up', 'lateral'].includes(row.direction) ? row.direction : 'up',
      outcome: text(row.outcome), actions, spendCeiling: actions.includes('spend') ? ceiling : null,
      currency: actions.includes('spend') ? currency : '', stopCondition: text(row.stopCondition),
      effortDays, capacity: normalizeCapacity(row.capacity), capacityNote: text(row.capacityNote),
      status: row.status, createdAt, createdOn: day(row.createdOn) || createdAt.slice(0, 10), expiresOn,
      acceptedAt: stamp(row.acceptedAt), closedAt: stamp(row.closedAt), evidence: text(row.evidence),
      closeNote: text(row.closeNote), deliveredAt: stamp(row.deliveredAt), evidenceRefs: (Array.isArray(row.evidenceRefs) ? row.evidenceRefs : []).slice(0, 20).map((e) => e && typeof e === 'object' ? { type: text(e.type, 40), id: id(e.id) } : null).filter((e) => e?.id), recoveryDecisionId: id(row.recoveryDecisionId), budgetId: id(row.budgetId), budgetLineId: id(row.budgetLineId), actualSpend: number(row.actualSpend), taskId: id(row.taskId), decisionId: id(row.decisionId), recoveryTaskId: id(row.recoveryTaskId),
      history,
    });
  }
  return out;
}

export function normalizeMandateSettings(raw = {}) {
  return { mandateAutoPropagate: raw.mandateAutoPropagate !== false };
}
