/** ADR-0255: append evidence only. Never salvage a malformed or ambiguous paper. */
import { SERVICE_BUDGET_LIMITS as L, readServiceBudgetEvidence, serviceBudgetFailure } from './serviceBudget.js';

export const SERVICE_BUDGET_WARNING = 'Service error budget: ';
const ID = /^[A-Za-z0-9:_-]{1,120}$/;
const identity = (v) => typeof v === 'string' && ID.test(v);
const instant = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export const serviceBudgetVersionKey = (r) => JSON.stringify([r.serviceRef, r.policyRef, r.startOn, r.endOn, r.sourceRef]);

export function readServiceBudgetPaper(raw, nowIso) {
  if (!identity(raw?.id) || !identity(raw.recordedById) || !instant(raw.recordedAt) || raw.recordedAt > nowIso) {
    return serviceBudgetFailure(null, 'The workpaper needs a valid ID, recorder and capture instant at or before now.');
  }
  const read = readServiceBudgetEvidence(raw, raw.recordedAt.slice(0, 10));
  if (!read.ok) return read;
  return { ok: true, paper: { id: raw.id, recordedById: raw.recordedById, recordedAt: raw.recordedAt, ...read.evidence } };
}

export function normalizeServiceBudgets(raw, nowIso, warnings) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > L.papers) {
    warnings.push(`${SERVICE_BUDGET_WARNING}Expected an evidence ledger with at most ${L.papers} workpapers. No partial ledger was loaded.`);
    return [];
  }
  const ids = new Map(), versions = new Map(), readable = [];
  const count = (map, value) => map.set(value, (map.get(value) || 0) + 1);
  for (const row of raw) {
    if (identity(row?.id)) count(ids, row.id);
    // A malformed copy with the same version still makes the version ambiguous.
    if (row && [row.serviceRef, row.policyRef, row.startOn, row.endOn, row.sourceRef].every((v) => typeof v === 'string')) {
      count(versions, serviceBudgetVersionKey(row));
    }
    const result = readServiceBudgetPaper(row, nowIso);
    if (result.ok) readable.push(result.paper);
  }
  const kept = readable.filter((paper) => ids.get(paper.id) === 1 && versions.get(serviceBudgetVersionKey(paper)) === 1);
  if (kept.length < raw.length) {
    warnings.push(`${SERVICE_BUDGET_WARNING}${raw.length - kept.length} entire workpaper(s) refused: unreadable evidence or ambiguous ID/source version. No partial evidence was counted.`);
  }
  return kept;
}
