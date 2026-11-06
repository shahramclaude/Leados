/**
 * ADR-0106 — derived execution state for one adopted bundle.
 * Pure: no storage, DOM or clock side effects. The rule persists a small
 * reconciliation marker; every reader re-derives the truth from source records.
 */
import { dayKey } from '../time.js';
import { EXECUTION_ADAPTERS, EXECUTION_VERSION } from './executionRegistry.js';
import { BUNDLE_LABELS } from './actionBundleRegistry.js';
import { responsibleNodeId, LEADER_ID } from './chain.js';
import { recordPeople } from './seat.js';

const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
export function executionFingerprint(value) {
  const s = JSON.stringify(canonical(value));
  let a = 0x811c9dc5; let b = 0x9e3779b9;
  for (let i = 0; i < s.length; i += 1) { a = Math.imul(a ^ s.charCodeAt(i), 0x01000193); b = Math.imul(b ^ s.charCodeAt(i), 0x85ebca6b); }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
const ROUTES = { decision: '#/decisions', delegation: '#/delegations', premise: '#/premises', budget: '#/finance', comms: '#/comms', coaching: '#/oneonones' };
const TERMINAL_CASES = new Set(['resolved', 'closed']);

/** Returns null for a proposal; an adopted bundle always has an honest state. */
export function bundleExecution(state, bundle, now = new Date()) {
  if (!bundle || bundle.status !== 'committed') return null;
  const outputs = (bundle.outputs || []).map((o) => {
    const adapter = EXECUTION_ADAPTERS[o.kind];
    const row = adapter ? adapter.inspect(state, o, bundle) : { state: 'missing', evidence: null, reason: 'No evidence adapter is registered for this command kind.' };
    return { kind: o.kind, label: BUNDLE_LABELS[o.kind] || o.kind, targetId: o.id, route: ROUTES[o.kind] || '#/bundles', ...row };
  });
  const source = (state.cases || []).find((c) => c.id === bundle.sourceId);
  const caseState = !source ? 'missing' : TERMINAL_CASES.has(source.status) && source.resolvedOn ? 'settled' : 'open';
  const reviewTask = (state.delegations || []).find((d) => typeof d.support === 'string' && d.support.includes(`[BND-02:${bundle.id}]`)) || null;
  const counts = Object.fromEntries(['pending', 'fulfilled', 'stopped', 'blocked', 'missing'].map((k) => [k, outputs.filter((o) => o.state === k).length]));
  const terminal = outputs.length > 0 && outputs.every((o) => ['fulfilled', 'stopped'].includes(o.state));
  let status = 'waiting';
  if (!source || counts.blocked || counts.missing) status = 'blocked';
  else if (!terminal) status = counts.fulfilled || counts.stopped ? 'moving' : 'waiting';
  else if (caseState !== 'settled') status = bundle.execution?.state === 'closed' ? 'reopened' : 'ready';
  else status = 'closed';
  const proofDays = outputs.map((o) => o.evidence?.on).filter(Boolean).sort();
  const closedOn = status === 'closed' ? [source.resolvedOn, ...proofDays].sort().at(-1) : null;
  const next = outputs.find((o) => ['blocked', 'missing', 'pending'].includes(o.state)) || null;
  const fingerprint = executionFingerprint({ version: EXECUTION_VERSION, status, caseState, resolvedOn: source?.resolvedOn || null,
    outputs: outputs.map((o) => [o.kind, o.state, o.evidence?.type || null, o.evidence?.id || null, o.evidence?.on || null, o.outcome || null]), review: reviewTask?.status || null });
  return { version: EXECUTION_VERSION, state: status, counts, outputs, total: outputs.length,
    settled: counts.fulfilled + counts.stopped, fulfilled: counts.fulfilled, stopped: counts.stopped,
    caseId: source?.id || bundle.sourceId, caseState, caseTitle: source?.title || 'Source case unavailable', caseResolvedOn: source?.resolvedOn || null,
    closedOn, reviewTaskId: reviewTask?.id || null, reviewTaskStatus: reviewTask?.status || null,
    nextAction: status === 'closed' ? null : next ? { label: next.label, route: next.route, reason: next.reason } : { label: 'Resolve the source case', route: `#/cases?case=${encodeURIComponent(bundle.sourceId)}`, reason: 'Every action has terminal evidence; record the case outcome to close the PDCA loop.' },
    fingerprint, evaluatedOn: dayKey(now) };
}

/** Aggregate only what the caller is allowed to enumerate. No person score. */
export function executionSummary(rows) {
  const states = ['waiting', 'moving', 'blocked', 'ready', 'closed', 'reopened'];
  return { total: rows.length, byState: Object.fromEntries(states.map((s) => [s, rows.filter((r) => r.state === s).length])),
    open: rows.filter((r) => r.state !== 'closed').length, closed: rows.filter((r) => r.state === 'closed').length,
    fulfilled: rows.reduce((n, r) => n + r.fulfilled, 0), stopped: rows.reduce((n, r) => n + r.stopped, 0),
    actions: rows.reduce((n, r) => n + r.total, 0) };
}

export function executionReceiptText(bundle, execution) {
  if (!execution) return 'This bundle has not been adopted.';
  return [`# LeadOS · execution evidence receipt`, `Bundle: ${bundle.id}`, `State: ${execution.state}`,
    `Source case: ${execution.caseId} (${execution.caseState})`, `Closed on: ${execution.closedOn || 'not closed'}`,
    ...execution.outputs.map((o) => `- ${o.label}: ${o.state}; ${o.reason}${o.evidence ? ` Evidence: ${o.evidence.type}/${o.evidence.id} on ${o.evidence.on || 'undated'}.` : ''}`),
    'Completion is derived from dated records. Cancellation, deletion and missing proof are never counted as delivery.',
    'This is software reconciliation, not a causal claim about business benefit.'].join('\n');
}

/** Accountable leader owns the loop; a leader named as owner is not escalated
 * one rung just because the generic people-LCA treats them as a subject. */
export function executionOwnerNodeId(source, built) {
  if (!source) return LEADER_ID;
  if (source.ownerId && built.byId.has(source.ownerId)) return source.ownerId;
  return responsibleNodeId(built.chain, recordPeople(source));
}
