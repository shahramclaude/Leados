/**
 * RULE-EXE-01 — evidence-based execution reconciliation on the shared spine.
 * Subscribes through EXECUTION_EVENTS (compiled from the evidence registry),
 * re-derives each adopted bundle, writes typed proof + ancestor edges, and
 * closes ONLY the engine-authored review checkpoint when the human-resolved
 * source case and every action's terminal evidence agree. It never chooses a
 * decision, spends money, sends a message, rates a person or invents an outcome.
 */
import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { bundleExecution, executionOwnerNodeId } from './execution.js';
import { EXECUTION_EVENTS, EXECUTION_RULE_ID, EXECUTION_SCAN_EVENT } from './executionRegistry.js';
import { BUNDLE_EVENTS } from './actionBundleRegistry.js';
import { buildSeats } from './seat.js';
import { LEADER_ID } from './chain.js';

const effect = (action, targetType, targetId, summary) => ({ ruleId: EXECUTION_RULE_ID, action, targetType, targetId, summary });

export function executionRule(draft, ctx = {}) {
  const type = ctx.event?.type;
  if (!EXECUTION_EVENTS.includes(type)) return [];
  const explicit = type === EXECUTION_SCAN_EVENT || type === BUNDLE_EVENTS.SCAN;
  if (!explicit && draft.settings?.executionAutoReconcile === false) return [];
  const effects = [];
  const opts = { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() };
  const link = (bundleId, targetType, targetId, relation, summary) => {
    const r = ensureEntityLink(draft, { sourceType: 'bundle', sourceId: bundleId, targetType, targetId, relation, ruleId: EXECUTION_RULE_ID, summary }, opts);
    if (r.created) effects.push(effect('linked', targetType, targetId, `${relation}: ${summary}`));
  };
  const built = buildSeats(draft, { now: ctx.now, settings: draft.settings });
  for (const bundle of draft.actionBundles || []) {
    if (bundle.status !== 'committed') continue;
    let execution = bundleExecution(draft, bundle, ctx.now);
    if (!execution) continue;
    // Vertical provenance is a dimension of the same graph, not a second
    // hierarchy engine: the source case's responsible span fans to every ancestor.
    const source = (draft.cases || []).find((c) => c.id === bundle.sourceId);
    const owner = executionOwnerNodeId(source, built);
    let cursor = owner; const seen = new Set();
    while (cursor && !seen.has(cursor) && seen.size < 16) {
      seen.add(cursor);
      if (cursor === LEADER_ID || built.byId.has(cursor)) link(bundle.id, 'person', cursor, 'rolls-up-to', 'Leadership span carrying this execution loop; aggregate readers receive counts, not private notes.');
      if (cursor === LEADER_ID) break;
      cursor = built.chain.nodes.get(cursor)?.parentId || LEADER_ID;
    }
    link(bundle.id, 'case', bundle.sourceId, 'rests-on', 'The source case whose human resolution is required for PDCA closure.');
    for (const row of execution.outputs) {
      if (!row.evidence?.id) continue;
      const targetId = row.evidence.type === 'budget' ? (bundle.outputs.find((o) => o.kind === 'budget')?.budgetId || row.evidence.id) : row.evidence.id;
      link(bundle.id, row.evidence.type, targetId, 'rests-on', `${row.label}: ${row.state} evidence pointer ${row.evidence.id}${row.evidence.on ? ` dated ${row.evidence.on}` : ''}.`);
    }
    if (execution.state === 'closed' && execution.reviewTaskId) {
      const task = (draft.delegations || []).find((d) => d.id === execution.reviewTaskId);
      if (task && task.status === 'active') {
        task.status = 'done'; task.completedOn = execution.closedOn || dayKey(ctx.now); task.updatedAt = ctx.now.toISOString();
        task.completionNote = `System-reconciled from dated evidence: ${execution.fulfilled} fulfilled action(s), ${execution.stopped} explicitly stopped, source case ${execution.caseState} on ${execution.caseResolvedOn}. No human outcome was invented.`;
        effects.push(effect('closed', 'delegation', task.id, 'The engine-authored review checkpoint closed from terminal evidence; human work records were not rewritten.'));
        // The checkpoint is part of the reconciliation fingerprint. Re-derive
        // AFTER closing it so the next scan is a true no-op.
        execution = bundleExecution(draft, bundle, ctx.now);
      }
    }
    if (bundle.execution?.fingerprint !== execution.fingerprint) {
      const previous = bundle.execution?.state || null;
      bundle.execution = { version: execution.version, state: execution.state, fingerprint: execution.fingerprint,
        changedAt: ctx.now.toISOString(), closedOn: execution.closedOn, caseResolvedOn: execution.caseResolvedOn,
        reviewTaskId: execution.reviewTaskId, evidence: execution.outputs.map((o) => ({ kind: o.kind, state: o.state, ...(o.evidence ? { type: o.evidence.type, id: o.evidence.id, on: o.evidence.on } : {}) })) };
      bundle.updatedAt = ctx.now.toISOString();
      bundle.history = [...(bundle.history || []), { at: ctx.now.toISOString(), type: `execution.${execution.state}`, summary: `${previous ? `${previous} → ` : ''}${execution.state}: ${execution.settled}/${execution.total} action(s) have terminal evidence; source case ${execution.caseState}.` }].slice(-60);
      effects.push(effect('reconciled', 'bundle', bundle.id, `Execution state ${execution.state}; ${execution.fulfilled} fulfilled, ${execution.stopped} stopped, ${execution.counts.pending} pending, ${execution.counts.blocked + execution.counts.missing} blocked/missing.`));
      if (typeof ctx.logEvent === 'function') ctx.logEvent({ type: 'bundle.execution.changed', entity: 'bundle', entityId: bundle.id, summary: `Execution reconciled to ${execution.state} from dated source evidence.` });
    }
  }
  return effects;
}
