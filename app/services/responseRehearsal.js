/** Action-level response rehearsal. All writes go to injected disposable stores.
 * No browser storage, network, confidential conflict reads or causal outcome model.
 */
import { createStore, STORAGE_KEY } from '../core/store.js';
import { createApi } from '../actions.js';
import { COLLECTIONS } from '../core/schema.js';
import { compareAutomationGraphs } from '../core/domain/assurance.js';
import {
  RESPONSE_STRATEGIES, RESPONSE_LABELS, responseCaseInput, responseEconomics,
  responseSourceFingerprint, responsePlanInputFingerprint,
  validateResponseAssumptions,
} from '../core/domain/response.js';
import { addDays, dayKey } from '../core/time.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const excluded = new Set(['events', 'conflicts', 'pulses', 'candidates', 'intakeDrafts', 'responsePlans']);
const collectionNames = COLLECTIONS.filter((key) => !excluded.has(key));

function operationalChanges(before, after) {
  return collectionNames.flatMap((collection) => {
    const old = new Map((before[collection] || []).map((row) => [row.id, row]));
    const next = new Map((after[collection] || []).map((row) => [row.id, row]));
    const created = [...next.keys()].filter((id) => !old.has(id)).length;
    const removed = [...old.keys()].filter((id) => !next.has(id)).length;
    const updated = [...next].filter(([id, row]) => old.has(id) && JSON.stringify(old.get(id)) !== JSON.stringify(row)).length;
    return created || updated || removed ? [{ collection, created, updated, removed }] : [];
  });
}

function disposableStore(state, now) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  const occupied = new Set(COLLECTIONS.flatMap((key) => (state[key] || []).map((row) => row.id)));
  let seq = 0;
  const idFactory = (prefix) => {
    let id;
    do { id = `${prefix}-response-sim-${++seq}`; } while (occupied.has(id));
    occupied.add(id);
    return id;
  };
  const store = createStore({ storage, now: () => now, idFactory });
  store.load();
  if (store.persistError || store.warnings.length) throw new Error('Workspace needs repair or migration review before rehearsal.');
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}

function replayBranch(state, draftId, baseInput, strategy, assumptions, now) {
  const { store, api } = disposableStore(state, now);
  const before = clone(store.state);
  const input = responseCaseInput(baseInput, strategy, assumptions, now);
  const result = api.addCase(input);
  if (!result.ok) return { ok: false, error: result.error, field: result.field };
  const routed = api.markIntakeDraftRouted(draftId, { caseId: result.id, caseInput: input });
  if (!routed.ok) return { ok: false, error: routed.error };
  const after = store.state;
  const newEvents = (after.events || []).filter((event) => !(before.events || []).some((old) => old.id === event.id));
  const receiptIds = new Set((before.propagationReceipts || []).map((r) => r.id));
  const failures = newEvents.filter((event) => event.type === 'automation.rule_error').length
    + (after.propagationReceipts || []).filter((r) => !receiptIds.has(r.id)).length;
  return {
    ok: true,
    value: {
      id: strategy, label: RESPONSE_LABELS[strategy], at: now.toISOString(),
      changes: operationalChanges(before, after),
      relationships: compareAutomationGraphs(before, after).relationships,
      failureCount: failures,
      warningCount: store.warnings.length,
      automationEnabled: input.autoPropagate !== false,
      ruleIds: [...new Set((result.propagations || []).map((p) => p.ruleId).filter(Boolean))].sort(),
    },
  };
}

/** Validate once at the boundary, then replay the same facts under three policies. */
export function rehearseResponse(state, draftId, input = {}, { now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return { ok: false, error: 'A valid rehearsal clock is required.' };
  const draft = (state.intakeDrafts || []).find((d) => d.id === draftId);
  if (!draft || draft.status !== 'analyzed') return { ok: false, error: 'Choose a pending intake draft. An already routed draft cannot create a second case.' };
  if (!draft.analysis || draft.analysis.insufficient || draft.analysis.privacyBlocked || draft.analysis.conflictPrivacyWall) {
    return { ok: false, error: 'This note cannot enter the operational response graph. Use the confidential conflict workspace or add evidence in intake.' };
  }
  if (input.fieldsConfirmed !== true) return { ok: false, error: 'Review and explicitly confirm the extracted case facts before rehearsing.', field: 'fieldsConfirmed' };
  if (draft.analysis.stakesReviewRequired && input.safetyReviewed !== true) return { ok: false, error: 'Safety/legal stakes require explicit human review. Delayed adoption will remain unavailable.', field: 'safetyReviewed' };
  if (!RESPONSE_STRATEGIES.includes(input.strategy)) return { ok: false, error: 'Choose a response policy.', field: 'strategy' };
  if (input.strategy === 'wait' && draft.analysis.stakesReviewRequired) return { ok: false, error: 'A safety/legal signal cannot be scheduled for delayed response.', field: 'strategy' };
  const valid = validateResponseAssumptions(input.assumptions);
  if (!valid.ok) return valid;
  const baseInput = input.caseInput;
  if (!baseInput || typeof baseInput !== 'object' || Array.isArray(baseInput) || typeof baseInput.title !== 'string' || !baseInput.title.trim()) {
    return { ok: false, error: 'A reviewed case title and facts are required.', field: 'title' };
  }
  if (responseSourceFingerprint(draft) !== input.sourceFingerprint) return { ok: false, error: 'The intake note changed. Analyze it again before rehearsing.', code: 'stale-source' };
  if (JSON.stringify(state).length > 8_000_000) return { ok: false, error: 'This workspace exceeds the 8 MB rehearsal safety bound. Export a backup and use a smaller operational copy.' };
  try {
    const branches = [];
    for (const strategy of RESPONSE_STRATEGIES) {
      const at = strategy === 'wait' ? new Date(`${addDays(dayKey(now), valid.value.delayDays)}T${now.toISOString().slice(11)}`) : now;
      const branch = replayBranch(state, draftId, baseInput, strategy, valid.value, at);
      if (!branch.ok) return branch;
      branches.push(branch.value);
    }
    return {
      ok: true, version: 1, strategy: input.strategy, intakeDraftId: draftId,
      caseInput: clone(baseInput), assumptions: valid.value,
      evaluatedAt: now.toISOString(), baseRevision: state.meta?.revision || 0,
      sourceFingerprint: responseSourceFingerprint(draft),
      inputFingerprint: responsePlanInputFingerprint(draftId, baseInput, valid.value, input.strategy),
      preview: { branches, scope: 'Production actions replayed in disposable stores. Operational diffs, not causal outcomes.' },
      economics: responseEconomics(valid.value),
      safety: { stakes: Boolean(draft.analysis.stakesReviewRequired), delayAllowed: !draft.analysis.stakesReviewRequired },
      scope: 'Same frozen workspace and production rule chain. The delayed branch runs at its future date. No live writes, no messages sent, no causal prediction of human behaviour.',
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Rehearsal failed. No live records were changed.' };
  }
}
