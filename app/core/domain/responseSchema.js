/** Schema v73: bounded, text-minimal receipts for rehearsed leadership responses. */
import { COLLECTIONS } from '../schema.js';

export const RESPONSE_PLAN_CAP = 60;
export const RESPONSE_STRATEGIES = Object.freeze(['contain', 'verify', 'wait']);
export const RESPONSE_STATUSES = Object.freeze(['rehearsed', 'scheduled', 'committed', 'archived']);
export const RESPONSE_LABELS = Object.freeze({
  contain: 'Contain now', verify: 'Evidence first', wait: 'Delay the response',
});
const day = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v ? v : null;
const iso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const text = (v, max = 200) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const number = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
const whole = (v, min, max) => Number.isInteger(v) && v >= min && v <= max ? v : null;

/** Strict at the command boundary; never silently clamps a financial assumption. */
export function validateResponseAssumptions(input = {}) {
  const currency = text(input.currency || 'USD', 6).toUpperCase();
  if (!/^[A-Z]{3,6}$/.test(currency)) return { ok: false, error: 'Use a 3–6 letter currency code.', field: 'currency' };
  const keys = ['mitigationBudget', 'weeklyDelayLow', 'weeklyDelayMode', 'weeklyDelayHigh'];
  const values = {};
  for (const key of keys) {
    const raw = input[key];
    if (raw === '' || raw == null) return { ok: false, error: 'Enter every cost assumption explicitly; blank is not zero.', field: key };
    const n = number(Number(raw), 0, 1e12);
    if (n === null) return { ok: false, error: 'Costs must be finite numbers between zero and one trillion.', field: key };
    values[key] = Math.round(n * 100) / 100;
  }
  if (values.weeklyDelayLow > values.weeklyDelayMode || values.weeklyDelayMode > values.weeklyDelayHigh) {
    return { ok: false, error: 'Keep weekly delay costs ordered: low ≤ mode ≤ high.', field: 'weeklyDelayMode' };
  }
  const delayDays = whole(Number(input.delayDays), 1, 90);
  const evidenceDays = whole(Number(input.evidenceDays), 1, 30);
  if (delayDays === null || !Number.isInteger(Number(input.delayDays))) return { ok: false, error: 'Choose a whole delay from 1 to 90 days.', field: 'delayDays' };
  if (evidenceDays === null || !Number.isInteger(Number(input.evidenceDays))) return { ok: false, error: 'Choose a whole evidence window from 1 to 30 days.', field: 'evidenceDays' };
  return { ok: true, value: { currency, ...values, delayDays, evidenceDays } };
}

function cleanPreview(raw) {
  if (!object(raw) || !Array.isArray(raw.branches)) return null;
  const allowed = new Set(COLLECTIONS);
  const branches = raw.branches.slice(0, 3).map((branch) => {
    if (!object(branch) || !RESPONSE_STRATEGIES.includes(branch.id)) return null;
    const changes = (Array.isArray(branch.changes) ? branch.changes : []).slice(0, 100).flatMap((row) => {
      if (!object(row) || !allowed.has(row.collection)) return [];
      const created = whole(row.created, 0, 100000);
      const updated = whole(row.updated, 0, 100000);
      const removed = whole(row.removed, 0, 100000);
      return created === null || updated === null || removed === null ? [] : [{ collection: row.collection, created, updated, removed }];
    });
    const relationships = (Array.isArray(branch.relationships) ? branch.relationships : []).slice(0, 100).flatMap((row) => {
      if (!object(row)) return [];
      const added = whole(row.added, 0, 100000);
      const removedCount = whole(row.removed, 0, 100000);
      const sourceType = text(row.sourceType, 40);
      const targetType = text(row.targetType, 40);
      const relation = text(row.relation, 60);
      return added === null || removedCount === null || !sourceType || !targetType || !relation ? []
        : [{ sourceType, targetType, relation, added, removed: removedCount }];
    });
    return {
      id: branch.id, at: iso(branch.at), changes, relationships,
      failureCount: whole(branch.failureCount, 0, 10000) ?? 0,
      warningCount: whole(branch.warningCount, 0, 10000) ?? 0,
      automationEnabled: branch.automationEnabled !== false,
      ruleIds: [...new Set((Array.isArray(branch.ruleIds) ? branch.ruleIds : []).map((v) => text(v, 60)).filter(Boolean))].slice(0, 100),
    };
  });
  if (branches.some((b) => !b || !b.at) || new Set(branches.map((b) => b.id)).size !== branches.length || !branches.length) return null;
  return { branches, scope: 'Production actions replayed in disposable stores. Operational diffs, not causal outcomes.' };
}

export function normalizeResponsePlans(raw, state, now, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const intakeIds = new Set((state.intakeDrafts || []).map((d) => d.id));
  const caseIds = new Set((state.cases || []).map((c) => c.id));
  const seen = new Set();
  const out = [];
  for (const item of raw.slice(0, RESPONSE_PLAN_CAP * 2)) {
    if (!object(item)) continue;
    const id = text(item.id, 80);
    const intakeDraftId = text(item.intakeDraftId, 80);
    const createdAt = iso(item.createdAt);
    const assumptions = validateResponseAssumptions(item.assumptions || {});
    const preview = cleanPreview(item.preview);
    if (!id || seen.has(id) || !intakeIds.has(intakeDraftId) || !createdAt || !assumptions.ok
      || !RESPONSE_STRATEGIES.includes(item.strategy) || !object(item.caseInput) || !text(item.caseInput.title)
      || !preview || !Number.isInteger(item.baseRevision) || item.baseRevision < 0) {
      warnings.push('Response plans: dropped a malformed plan or a plan whose intake draft no longer exists.');
      continue;
    }
    seen.add(id);
    let status = RESPONSE_STATUSES.includes(item.status) ? item.status : 'rehearsed';
    let reviewOn = day(item.reviewOn);
    if (status === 'scheduled' && (!reviewOn || reviewOn < createdAt.slice(0, 10))) {
      status = 'rehearsed'; reviewOn = null;
      warnings.push(`Response plans: ${id} had no valid review date; returned to rehearsed.`);
    }
    let caseId = text(item.caseId, 80) || null;
    if (caseId && !caseIds.has(caseId)) {
      caseId = null;
      warnings.push(`Response plans: ${id} lost its case pointer; the adoption receipt was retained.`);
    }
    if (status === 'committed' && !iso(item.committedAt)) {
      status = 'rehearsed';
      warnings.push(`Response plans: ${id} claimed adoption without a timestamp; returned to rehearsed.`);
    }
    out.push({
      id, intakeDraftId, caseId, createdAt, updatedAt: iso(item.updatedAt) || createdAt,
      status, strategy: item.strategy, reviewOn, committedAt: status === 'committed' ? iso(item.committedAt) : null,
      baseRevision: item.baseRevision,
      inputFingerprint: /^[a-f0-9]{16}$/.test(item.inputFingerprint || '') ? item.inputFingerprint : '',
      sourceFingerprint: /^[a-f0-9]{16}$/.test(item.sourceFingerprint || '') ? item.sourceFingerprint : '',
      caseInput: item.caseInput, assumptions: assumptions.value, preview,
      archivedAt: status === 'archived' ? iso(item.archivedAt) || createdAt : null,
    });
    if (out.length >= RESPONSE_PLAN_CAP) break;
  }
  return out;
}
