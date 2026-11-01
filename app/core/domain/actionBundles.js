/** Atomic command-bundle executor, shared by live adoption and disposable rehearsal. */
import { dayKey } from '../time.js';
import { COLLECTIONS } from '../schema.js';
import { compareAutomationGraphs } from './assurance.js';
import { BUNDLE_ADAPTERS, BUNDLE_EVENTS, BUNDLE_LIMITS, BUNDLE_LABELS, validateBundleCommands } from './actionBundleRegistry.js';

export const clone = (v) => JSON.parse(JSON.stringify(v));
export function fingerprint(value) {
  const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
  const s = JSON.stringify(canonical(value));
  let a = 0x811c9dc5; let b = 0x9e3779b9;
  for (let i = 0; i < s.length; i += 1) { a = Math.imul(a ^ s.charCodeAt(i), 0x01000193); b = Math.imul(b ^ s.charCodeAt(i), 0x85ebca6b); }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
export const bundleInputFingerprint = (b) => fingerprint({ name: b.name, sourceType: b.sourceType, sourceId: b.sourceId, reviewOn: b.reviewOn, commands: b.commands, version: 1 });
export function bundleSourceFingerprint(state, b) {
  const c = (state.cases || []).find((r) => r.id === b.sourceId);
  return fingerprint({ case: c || null, people: (state.people || []).filter((p) => b.commands.some((a) => a.ownerId === p.id)), budgets: (state.budgets || []).filter((r) => b.commands.some((a) => a.budgetId === r.id)) });
}
const EXCLUDED = new Set(['events', 'conflicts', 'pulses', 'candidates', 'intakeDrafts', 'responsePlans', 'actionBundles']);
export function operationalDiff(before, after) {
  return COLLECTIONS.filter((k) => !EXCLUDED.has(k)).flatMap((collection) => {
    const old = new Map((before[collection] || []).map((r) => [r.id, r]));
    const next = new Map((after[collection] || []).map((r) => [r.id, r]));
    const created = [...next.keys()].filter((id) => !old.has(id)).length;
    const removed = [...old.keys()].filter((id) => !next.has(id)).length;
    const updated = [...next].filter(([id, r]) => old.has(id) && fingerprint(old.get(id)) !== fingerprint(r)).length;
    return created || updated || removed ? [{ collection, created, updated, removed }] : [];
  });
}
export function bundlePreview(before, after, ruleIds = []) {
  return { changes: operationalDiff(before, after), relationships: compareAutomationGraphs(before, after).relationships,
    failureCount: 0, ruleIds: [...new Set(ruleIds)].sort(), scope: 'Actual software commands and rule effects in a disposable workspace. Not a causal forecast; no message is sent.' };
}

/** Run validated production APIs against a staged store. No nested persistence or nested rule passes. */
export function stageBundle(draft, helpers, commands, { now, idFactory, createApi, store, compensate = false, reason = '' }) {
  const sourceEvents = [];
  const staged = {
    get state() { return draft; }, warnings: store.warnings, persistError: null, writeBlockReason: null,
    lastPropagations: [], lastPropagationMetrics: null, isEncrypted: store.isEncrypted, isLocked: false,
    update(mutator, event) {
      mutator(draft, helpers);
      // Production APIs may guard success with a revision change. Model that
      // observable inside the transaction without persisting or running rules.
      draft.meta.revision += 1; draft.meta.updatedAt = now.toISOString();
      if (event) { helpers.logEvent(event); sourceEvents.push(clone(event)); }
      return draft;
    },
  };
  const api = createApi(staged, { now: () => now, idFactory });
  const outputs = [];
  const deferredTargets = [];
  for (const command of commands) {
    const adapter = BUNDLE_ADAPTERS[command.kind];
    const result = compensate ? adapter.compensate(api, command.record, now, reason, command)
      : adapter.execute(command, api, draft, now);
    if (!result.ok) throw new Error(`${BUNDLE_LABELS[command.kind]}: ${result.error}`);
    if (!compensate) {
      if (adapter.targets) deferredTargets.push({ adapter, command, result });
      else outputs.push({ kind: command.kind, id: result.id, type: adapter.type, collection: adapter.collection,
        ...(result.budgetId ? { budgetId: result.budgetId } : {}), ...(result.prompt ? { prompt: result.prompt } : {}) });
    }
  }
  if (outputs.length > BUNDLE_LIMITS.targets) throw new Error('The bundle exceeds its target budget.');
  return { sourceEvents, outputs, deferredTargets, api };
}

/** One transaction. Any command OR rule failure rolls back the entire bundle. */
export function transactBundle(store, bundle, { now, idFactory, createApi, withdraw = false, reason = '' }) {
  const before = clone(store.state);
  const oldEvents = new Set((before.events || []).map((e) => e.id));
  const oldReceipts = new Set((before.propagationReceipts || []).map((e) => e.id));
  let sourceEvents = [];
  let result = null;
  const warningCount = store.warnings.length;
  try {
    store.update((draft, helpers) => {
      const commands = withdraw ? [...bundle.outputs].reverse().map((o) => ({ ...o, kind: o.kind, record: BUNDLE_ADAPTERS[o.kind].target(draft, o.id, o) })) : bundle.commands;
      const staged = stageBundle(draft, helpers, commands, { now, idFactory, createApi, store, compensate: withdraw, reason });
      sourceEvents.push(...staged.sourceEvents);
      const target = (draft.actionBundles || []).find((b) => b.id === bundle.id);
      if (!target) throw new Error('The bundle no longer exists.');
      if (withdraw) {
        target.status = 'withdrawn'; target.withdrawnAt = now.toISOString();
      } else {
        target.status = 'committed'; target.committedAt = now.toISOString(); target.outputs = staged.outputs;
      }
      target.updatedAt = now.toISOString();
      target.history.push({ at: now.toISOString(), type: withdraw ? 'withdrawn' : 'committed', summary: withdraw ? reason : `${staged.outputs.length} reviewed action target(s), one transaction.` });
      result = staged;
    }, { type: withdraw ? BUNDLE_EVENTS.WITHDRAWN : BUNDLE_EVENTS.COMMITTED, entity: 'bundle', entityId: bundle.id,
      summary: withdraw ? 'Untouched bundle actions withdrawn by compensating commands; history retained' : 'Reviewed cross-module action bundle adopted atomically' }, {
      sourceEvents,
      afterRules: (draft) => {
        const failures = (draft.events || []).filter((e) => !oldEvents.has(e.id) && e.type === 'automation.rule_error').length
          + (draft.propagationReceipts || []).filter((e) => !oldReceipts.has(e.id)).length;
        if (failures) throw new Error(`${failures} automation rule(s) failed. The entire bundle was rolled back; inspect the Automation control room and rehearse again.`);
        const target = draft.actionBundles.find((b) => b.id === bundle.id);
        if (!withdraw) {
          // Rule-created targets (notably stakeholder briefs) do not exist until
          // the source events have visited the rule registry. Resolve them now,
          // still inside the same transaction, then freeze every fingerprint.
          for (const pending of result.deferredTargets) target.outputs.push(...pending.adapter.targets(draft, pending.command, pending.result).map((o) => ({ ...o, kind: pending.command.kind })));
          if (target.outputs.length > BUNDLE_LIMITS.targets) throw new Error('The bundle exceeds its target budget.');
          for (const output of target.outputs) {
            const record = BUNDLE_ADAPTERS[output.kind].target(draft, output.id, output);
            if (!record) throw new Error('An action target disappeared during propagation; the bundle was rolled back.');
            output.fingerprint = fingerprint(record);
          }
          target.actual = bundlePreview(before, draft, (store.lastPropagations || []).map((p) => p.ruleId).filter(Boolean));
          const same = (v) => fingerprint({ changes: v.changes, relationships: v.relationships, ruleIds: [...v.ruleIds].sort() });
          if (target.preview && same(target.actual) !== same(target.preview)) throw new Error('The live rule footprint differs from the reviewed rehearsal. Nothing was applied; rehearse again.');
          target.baseRevision = draft.meta.revision;
        }
        target.history = target.history.slice(-60);
      },
    });
    if (store.state.meta.revision === before.meta.revision) throw new Error('Writes are blocked; no bundle action was applied.');
    const saved = store.state.actionBundles.find((b) => b.id === bundle.id);
    return { ok: true, id: bundle.id, bundle: saved, outputs: result.outputs, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [] };
  } catch (error) {
    store.warnings.splice(warningCount);
    return { ok: false, error: error?.message || 'The bundle failed; no live records were changed.' };
  }
}

export function withdrawalCheck(state, bundle) {
  if (!bundle || bundle.status !== 'committed') return { ok: false, error: 'Only an adopted bundle can be withdrawn.' };
  if (!bundle.outputs.length) return { ok: false, error: 'This bundle has no action targets to withdraw.' };
  for (const output of bundle.outputs) {
    const adapter = BUNDLE_ADAPTERS[output.kind];
    const record = adapter?.target(state, output.id, output);
    if (!record || fingerprint(record) !== output.fingerprint || !adapter.untouched(record, output)) return { ok: false, error: 'At least one action has changed or been used. The whole bundle is protected; review its records individually rather than overwriting later work.' };
  }
  return { ok: true };
}

export function bundleReport(state, now = new Date()) {
  const today = dayKey(now);
  const bundles = (state.actionBundles || []).map((b) => ({ ...b,
    stale: ['draft', 'rehearsed'].includes(b.status) && (b.baseRevision !== state.meta?.revision || b.evaluatedAt?.slice(0, 10) !== today),
    due: b.status === 'committed' && b.reviewOn <= today,
    withdrawable: b.status === 'committed' && withdrawalCheck(state, b).ok,
  }));
  return { bundles, open: bundles.filter((b) => ['draft', 'rehearsed'].includes(b.status)), due: bundles.filter((b) => b.due),
    committed: bundles.filter((b) => b.status === 'committed'), withdrawn: bundles.filter((b) => b.status === 'withdrawn') };
}
export function bundleAttentionCount(state, now = new Date()) { const r = bundleReport(state, now); return r.open.length + r.due.length; }
export function bundleSignals(state, now = new Date()) {
  const r = bundleReport(state, now); const out = [];
  if (r.open.length) out.push({ ruleId: 'BND-01', domain: 'Action bundles', severity: 2, confidence: 'high', title: `${r.open.length} coordinated plan(s) await review`, detail: 'A proposal is not an instruction. Rehearse the current workspace, inspect every action and adopt only the reviewed bundle.', evidence: [`${r.open.filter((b) => b.stale).length} stale or unverified preview(s)`], action: { label: 'Review action bundles', route: `#/bundles?bundle=${encodeURIComponent(r.open[0].id)}` } });
  if (r.due.length) out.push({ ruleId: 'BND-02', domain: 'Action bundles', severity: 3, confidence: 'high', title: `${r.due.length} action-bundle review(s) are due`, detail: 'Close the PDCA loop: inspect the assumption, delivered work, budget and stakeholder communication together.', evidence: r.due.slice(0, 4).map((b) => `${b.name} · review ${b.reviewOn}`), action: { label: 'Review the loop', route: `#/bundles?bundle=${encodeURIComponent(r.due[0].id)}` } });
  return out;
}
export function bundleBrief(bundle) {
  if (!bundle) return 'No action bundle selected.';
  return ['LeadOS — reviewed action-bundle receipt', `Status: ${bundle.status}`, `Actions: ${bundle.commands.map((a) => BUNDLE_LABELS[a.kind]).join('; ')}`,
    `Review: ${bundle.reviewOn}`, `Adopted: ${bundle.committedAt || 'not adopted'}`,
    ...(bundle.actual?.changes || []).map((c) => `${c.collection}: +${c.created} / ~${c.updated} / -${c.removed}`),
    'Compensation withdraws only untouched actions. Later edits, spend, sent messages and completed work are never overwritten.',
    'Software provenance, not a causal claim. No employee score, automatic decision or outbound message.'].join('\n');
}