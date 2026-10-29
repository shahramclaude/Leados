/**
 * app/core/domain/impactExecution.js — point-in-time propagation evidence for Impact.
 *
 * This is deliberately narrower than intervention fidelity. It joins an Impact
 * study to the exact typed workspace record selected by the leader, then counts
 * only retained successful propagation transactions whose root event or applied
 * rule-step event names that same record after the declared start date and before
 * scoring. It does not infer delivery, exposure, quality, adoption or causality.
 *
 * Snapshots are frozen at score time, content-free, and bounded. Trace IDs are
 * local navigation references only; the underlying lineage ledger is bounded
 * separately and may age them out.
 */

import { INTERVENTION_BY_ID } from './impact.js';
import { LINK_ENTITY_COLLECTIONS, LINK_ENTITY_TYPES } from './cases.js';
import { PROPAGATION_LINEAGE_CAP } from './automationLineage.js';

export const IMPACT_EXECUTION_SNAPSHOT_VERSION = 1;
export const IMPACT_EXECUTION_TRACE_REF_CAP = 12;
const MAX_SAFE_TRACE_ID = /^[^\u0000-\u001f\u007f]{1,80}$/;
const SNAPSHOT_STATUSES = new Set([
  'no-record-selected',
  'no-matching-retained-trace',
  'source-record-missing',
  'observed',
  'source-cleared',
]);

function safeText(value, limit = 180) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
    : '';
}

function safeId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return id && id.length <= 80 && MAX_SAFE_TRACE_ID.test(id) ? id : null;
}

function boundedCount(value, max) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
}

function sourceSpec(interventionType) {
  const type = INTERVENTION_BY_ID[interventionType];
  const entityType = type?.entityType || null;
  const collection = entityType ? LINK_ENTITY_COLLECTIONS[entityType] : null;
  if (!entityType || !collection || !LINK_ENTITY_TYPES.includes(entityType)) return null;
  return { entityType, collection, type };
}

function personName(state, id) {
  return (state?.people || []).find((person) => person?.id === id)?.name || '';
}

/** A safe, short UI label; never used as a key or a matching signal. */
export function interventionRecordLabel(record, entityType, state = {}) {
  if (!record || typeof record !== 'object') return '';
  let label = record.title || record.name || record.question || record.summary || record.subject || record.goal || '';
  if (!label && entityType === 'oneonone') {
    label = `1:1 with ${personName(state, record.personId) || 'team member'}${record.date ? ` · ${record.date}` : ''}`;
  } else if (!label && entityType === 'feedback') {
    label = `Feedback for ${personName(state, record.personId) || 'team member'}${record.date ? ` · ${record.date}` : ''}`;
  } else if (!label && entityType === 'delegation') {
    label = record.expectedOutcome || '';
  }
  return safeText(label) || `${entityType || 'record'} · ${safeText(record.id, 40) || 'unnamed'}`;
}

/** Records eligible for a typed Impact picker; unsupported kinds return none. */
export function interventionRecords(state, interventionType) {
  const spec = sourceSpec(interventionType);
  if (!spec) return [];
  return (Array.isArray(state?.[spec.collection]) ? state[spec.collection] : [])
    .filter((record) => record && typeof record.id === 'string' && safeId(record.id))
    .map((record) => ({
      id: record.id,
      entityType: spec.entityType,
      label: interventionRecordLabel(record, spec.entityType, state),
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

/** Resolve one selected ID against the shared typed-link collection registry. */
export function interventionRecordFor(state, interventionType, id) {
  const spec = sourceSpec(interventionType);
  const safe = safeId(id);
  if (!spec || !safe) return null;
  const record = (Array.isArray(state?.[spec.collection]) ? state[spec.collection] : [])
    .find((item) => item && item.id === safe);
  return record ? {
    record,
    entityType: spec.entityType,
    collection: spec.collection,
    label: interventionRecordLabel(record, spec.entityType, state),
  } : null;
}

function eventMatches(event, entityType, entityId) {
  return event?.entity === entityType && event?.entityId === entityId;
}

function dateBounds(study, capturedAt) {
  const start = typeof study?.windowStart === 'string'
    ? Date.parse(`${study.windowStart}T00:00:00.000Z`)
    : NaN;
  const end = Date.parse(capturedAt);
  return { start, end };
}

function baseSnapshot({ capturedAt, sourceType = null, status, sourceAvailable = null, ledgerRows = [] }) {
  return {
    version: IMPACT_EXECUTION_SNAPSHOT_VERSION,
    capturedAt,
    status,
    sourceType,
    sourceAvailable,
    sourceCleared: status === 'source-cleared',
    ledgerTransactionCount: boundedCount(ledgerRows.length, PROPAGATION_LINEAGE_CAP),
    ledgerAtCapacity: ledgerRows.length >= PROPAGATION_LINEAGE_CAP,
    matchingTransactionCount: 0,
    matchingRootTransactions: 0,
    matchingStepEvents: 0,
    appliedRuleSteps: 0,
    changedTargetReferences: 0,
    newTypedLinkReferences: 0,
    emittedEventReferences: 0,
    truncatedTransactions: 0,
    traceIds: [],
    omittedTraceReferences: 0,
  };
}

/**
 * Freeze the retained lineage evidence that exactly references the selected
 * intervention record. This never mutates state and never copies record text.
 */
export function buildImpactExecutionSnapshot(study, state = {}, { capturedAt = new Date() } = {}) {
  const captured = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
  const at = Number.isFinite(captured.getTime()) ? captured.toISOString() : new Date().toISOString();
  const lineage = Array.isArray(state?.propagationLineage) ? state.propagationLineage : [];
  const ledgerRows = lineage.filter((row) => row && typeof row === 'object');
  const spec = sourceSpec(study?.interventionType);
  const sourceId = spec ? safeId(study?.interventionId) : null;
  if (!spec || !sourceId) {
    return baseSnapshot({ capturedAt: at, status: 'no-record-selected', ledgerRows });
  }

  const sourceAvailable = Boolean(interventionRecordFor(state, study.interventionType, sourceId));
  const { start, end } = dateBounds(study, at);
  const inWindow = Number.isFinite(start) && Number.isFinite(end)
    ? ledgerRows.filter((row) => {
      const transactionAt = Date.parse(row.at);
      return Number.isFinite(transactionAt) && transactionAt >= start && transactionAt <= end;
    })
    : [];
  const matching = inWindow.map((row) => {
    const rootMatches = eventMatches(row.rootEvent, spec.entityType, sourceId);
    const matchingSteps = (Array.isArray(row.steps) ? row.steps : [])
      .filter((step) => eventMatches(step?.event, spec.entityType, sourceId)).length;
    return { row, rootMatches, matchingSteps };
  }).filter((entry) => entry.rootMatches || entry.matchingSteps > 0);

  const status = matching.length
    ? 'observed'
    : sourceAvailable ? 'no-matching-retained-trace' : 'source-record-missing';
  const snapshot = baseSnapshot({
    capturedAt: at,
    sourceType: spec.entityType,
    status,
    sourceAvailable,
    ledgerRows,
  });
  snapshot.matchingTransactionCount = matching.length;
  snapshot.matchingRootTransactions = matching.filter((entry) => entry.rootMatches).length;
  snapshot.matchingStepEvents = matching.reduce((sum, entry) => sum + entry.matchingSteps, 0);
  snapshot.appliedRuleSteps = matching.reduce((sum, entry) => sum + (entry.row.steps?.length || 0), 0);
  snapshot.changedTargetReferences = matching.reduce((sum, entry) => sum
    + (entry.row.steps || []).reduce((stepSum, step) => stepSum + (step.targets?.length || 0), 0), 0);
  snapshot.newTypedLinkReferences = matching.reduce((sum, entry) => sum
    + (entry.row.steps || []).reduce((stepSum, step) => stepSum + (step.links?.length || 0), 0), 0);
  snapshot.emittedEventReferences = matching.reduce((sum, entry) => sum
    + (entry.row.steps || []).reduce((stepSum, step) => stepSum + (step.emitted?.length || 0), 0), 0);
  snapshot.truncatedTransactions = matching.filter(({ row }) => row.truncatedSteps > 0
    || row.omittedTargets > 0 || row.omittedLinks > 0 || row.omittedEvents > 0).length;
  const recent = matching.slice(-IMPACT_EXECUTION_TRACE_REF_CAP);
  snapshot.traceIds = recent.map(({ row }) => safeId(row.id)).filter(Boolean);
  snapshot.omittedTraceReferences = Math.max(0, matching.length - snapshot.traceIds.length);
  return snapshot;
}

/** Normalize an imported frozen snapshot; invalid history is discarded, not guessed. */
export function normalizeImpactExecutionSnapshot(raw, { interventionType } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || raw.version !== IMPACT_EXECUTION_SNAPSHOT_VERSION
    || !Number.isFinite(Date.parse(raw.capturedAt))) return null;
  const spec = sourceSpec(interventionType);
  const expectedType = spec?.entityType || null;
  const sourceType = raw.sourceType === expectedType && expectedType ? expectedType : null;
  const traceIds = [...new Set((Array.isArray(raw.traceIds) ? raw.traceIds : [])
    .map(safeId).filter(Boolean))].slice(-IMPACT_EXECUTION_TRACE_REF_CAP);
  let status = SNAPSHOT_STATUSES.has(raw.status) ? raw.status : 'no-matching-retained-trace';
  const matchingTransactionCount = boundedCount(raw.matchingTransactionCount, PROPAGATION_LINEAGE_CAP);
  if (status === 'observed' && matchingTransactionCount === 0) status = 'no-matching-retained-trace';
  if (raw.sourceCleared === true || raw.status === 'source-cleared') status = 'source-cleared';
  if (status !== 'source-cleared' && !sourceType) status = 'no-record-selected';
  const matchingRootTransactions = boundedCount(raw.matchingRootTransactions, PROPAGATION_LINEAGE_CAP);
  const matchingStepEvents = boundedCount(raw.matchingStepEvents, PROPAGATION_LINEAGE_CAP * 32);
  const appliedRuleSteps = boundedCount(raw.appliedRuleSteps, PROPAGATION_LINEAGE_CAP * 32);
  const changedTargetReferences = boundedCount(raw.changedTargetReferences, PROPAGATION_LINEAGE_CAP * 48);
  const newTypedLinkReferences = boundedCount(raw.newTypedLinkReferences, PROPAGATION_LINEAGE_CAP * 48);
  const emittedEventReferences = boundedCount(raw.emittedEventReferences, PROPAGATION_LINEAGE_CAP * 48);
  const ledgerTransactionCount = boundedCount(raw.ledgerTransactionCount, PROPAGATION_LINEAGE_CAP);
  const ledgerAtCapacity = raw.ledgerAtCapacity === true || ledgerTransactionCount >= PROPAGATION_LINEAGE_CAP;
  return {
    version: IMPACT_EXECUTION_SNAPSHOT_VERSION,
    capturedAt: new Date(raw.capturedAt).toISOString(),
    status,
    sourceType,
    sourceAvailable: typeof raw.sourceAvailable === 'boolean' ? raw.sourceAvailable : null,
    sourceCleared: status === 'source-cleared',
    ledgerTransactionCount,
    ledgerAtCapacity,
    matchingTransactionCount,
    matchingRootTransactions,
    matchingStepEvents,
    appliedRuleSteps,
    changedTargetReferences,
    newTypedLinkReferences,
    emittedEventReferences,
    truncatedTransactions: boundedCount(raw.truncatedTransactions, PROPAGATION_LINEAGE_CAP),
    traceIds,
    omittedTraceReferences: boundedCount(raw.omittedTraceReferences, PROPAGATION_LINEAGE_CAP),
  };
}
