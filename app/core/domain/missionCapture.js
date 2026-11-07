/**
 * ADR-0105 — Command Flow. Natural language is an intake adapter, not a second
 * workflow engine. The existing classifier proposes; a human reviews; the
 * existing case APIs and Action Bundle adapters execute in ONE store write.
 * The worker and live adoption call the SAME transaction below.
 */
import { dayKey } from '../time.js';
import { analyzeIntakeText } from './intake.js';
import { activeSeat, buildSeats } from './seat.js';
import { LEADER_ID } from './chain.js';
import { BUNDLE_ADAPTERS, BUNDLE_LABELS, proposeBundle, validateBundleCommands } from './actionBundleRegistry.js';
import { bundleInputFingerprint, bundlePreview, bundleSourceFingerprint, clone, createStagedStore, fingerprint, stageBundle } from './actionBundles.js';
import { CAPTURE_SOURCE, MISSION_EVENTS, MISSION_LIMITS, missionProfile } from './missionRegistry.js';
import { normalizeCaptureCaseInput } from './missionCaptureSchema.js';
import { captureMergeAdvisoriesForSeat, evaluateMergeCluster } from './missionCaptureMerge.js';

export const captureInputFingerprint = (c) => fingerprint({
  version: 1, caseInput: c.caseInput, kinds: c.kinds, reviewOn: c.reviewOn, budgetId: c.budgetId,
  amount: c.amount, priorPct: c.priorPct, ownerSeatId: c.ownerSeatId, commandEdits: c.commandEdits || null,
  ...(c.mergeFromIds?.length ? { mergeFromIds: [...c.mergeFromIds].sort(), dedupeFingerprint: c.dedupeFingerprint || '' } : {}),
});
export function captureSourceFingerprint(state, c) {
  const ids = new Set([c.caseInput.ownerId, ...c.caseInput.involvedPersonIds]);
  const payload = {
    people: (state.people || []).map((p) => ({ id: p.id, managerId: p.managerId, status: p.status, level: p.level, ...(ids.has(p.id) ? { talkingPoints: p.talkingPoints || [] } : {}) })),
    budgets: (state.budgets || []).filter((b) => b.id === c.budgetId),
    goals: (state.goals || []).filter((g) => g.id === c.caseInput.linkedGoalId),
    activeSeatId: state.settings?.activeSeatId || null, chainLeaderAltitude: state.settings?.chainLeaderAltitude,
  };
  if (c.mergeFromIds?.length) {
    payload.mergeMembers = [...c.mergeFromIds].sort().map((id) => {
      const m = (state.missionCaptures || []).find((r) => r.id === id);
      return m ? { id: m.id, status: m.status, ownerSeatId: m.ownerSeatId, inputFingerprint: m.inputFingerprint, reviewOn: m.reviewOn } : { id, missing: true };
    });
  }
  return fingerprint(payload);
}

/** Return a privacy-safe explanation, never an out-of-span person match. */
export function analyzeCapture(text, state, { now = new Date() } = {}) {
  if (typeof text !== 'string' || text.trim().length < 12 || text.length > MISSION_LIMITS.noteChars) {
    return { ok: false, error: `Describe the situation in 12–${MISSION_LIMITS.noteChars.toLocaleString('en-US')} characters.` };
  }
  const built = buildSeats(state, { now, settings: state.settings });
  const seat = activeSeat(built);
  if (seat.readOnly) return { ok: false, error: 'Declare a valid operating seat before preparing a response.' };
  const analysis = analyzeIntakeText(text, state, { now });
  if (analysis.insufficient) return { ok: false, error: analysis.insufficientReasons.join('. '), analysis: { insufficientReasons: analysis.insufficientReasons } };
  if (analysis.privacyBlocked || analysis.conflictPrivacyWall) return { ok: false, code: 'privacy-wall', error: 'Confidential conflict language stays out of operational cases. Use the confidential conflict workspace; nothing was saved.' };
  const primary = analysis.categories[0];
  return {
    ok: true, analysis,
    classification: {
      engineVersion: analysis.engineVersion, primaryCategoryId: primary.id, primaryLabel: primary.label,
      confidenceBand: analysis.confidenceBand, confidencePct: Math.round(primary.probability * 1000) / 10,
      marginPct: Math.round(analysis.margin * 1000) / 10, ambiguous: analysis.ambiguous, stakesReviewRequired: analysis.stakesReviewRequired,
      evidence: primary.evidence.filter((e) => !e.negated).slice(0, 8).map((e) => ({ term: e.term, weight: e.weight, sentence: String(e.sentence || '').slice(0, 240), negated: false })),
    },
    suggestedTitle: analysis.suggestedTitle,
    matchedOwnerIds: analysis.entities.people.map((p) => p.personId).filter((id) => seat.scope.has(id)),
    stakesReviewRequired: analysis.stakesReviewRequired,
  };
}

export function captureRollup(state, seatId, { now = new Date() } = {}) {
  const built = buildSeats(state, { now, settings: state.settings });
  const path = []; let cursor = seatId; const seen = new Set();
  while (cursor && !seen.has(cursor) && path.length < 16) {
    seen.add(cursor);
    const node = built.chain.nodes.get(cursor);
    if (!node) break;
    const seat = cursor === LEADER_ID ? built.operatorSeat : built.byId.get(cursor);
    path.push({ seatId: cursor, label: cursor === LEADER_ID ? 'Enterprise' : node.name, altitudeKey: seat?.altitudeKey || node.altitude, rank: seat?.rank || 5, horizonDays: seat?.horizonDays || null });
    if (cursor === LEADER_ID) break;
    cursor = node.parentId || LEADER_ID;
  }
  return { path, truncated: Boolean(cursor && !seen.has(cursor)) };
}

/** Re-derive the exact reviewed commands. `@case` is resolved only inside the transaction. */
export function prepareCapturePlan(state, capture, now = new Date()) {
  const caseInput = normalizeCaptureCaseInput(capture.caseInput);
  if (!caseInput || !capture.kinds?.length) return { ok: false, error: 'The capture needs a reviewed case and at least one action.' };
  if (capture.mergeFromIds?.length) {
    const cluster = evaluateMergeCluster(state, capture.mergeFromIds, { now });
    if (!cluster.ok) return cluster;
    if (cluster.lcaSeatId !== capture.ownerSeatId) {
      return { ok: false, error: `Consolidate at the lowest common ancestor (${cluster.lcaLabel}), not at another altitude.` };
    }
    if (capture.dedupeFingerprint && cluster.dedupeFingerprint !== capture.dedupeFingerprint) {
      return { ok: false, error: 'A constituent span capture changed since this merge was proposed. Prepare and rehearse the current cluster.' };
    }
  }
  const profile = missionProfile(capture.rank);
  if (capture.kinds.some((k) => !profile.commands.includes(k))) return { ok: false, error: 'An action is outside this altitude’s operating duties.' };
  if (capture.kinds.includes('comms')) return { ok: false, error: 'Register stakeholders on the case before preparing briefs. Command Flow never invents a recipient.' };
  const sourceId = CAPTURE_SOURCE;
  const projected = { ...state, cases: [...(state.cases || []), { ...caseInput, id: sourceId, status: 'open', stakeholders: [] }] };
  const proposal = proposeBundle(projected, sourceId, now);
  if (!proposal.ok) return proposal;
  const edits = capture.commandEdits || {};
  const applyEdit = (c) => {
    const e = edits[c.kind];
    if (!e) return c;
    // ADR-0114: the reviewer's words win verbatim. The kind, owner, source, date
    // and (for a premise/decision) the reviewed prior are merged, then the whole
    // list still passes through validateBundleCommands below — an edit never
    // bypasses validation, it merely replaces what the proposal would have said.
    const merged = { ...c };
    if (e.title) merged.title = e.title;
    if (c.kind === 'decision') { if (e.question) merged.question = e.question; if (e.options) merged.options = e.options; }
    if (c.kind === 'delegation' && e.outcome) merged.outcome = e.outcome;
    if (c.kind === 'premise') { if (e.statement) merged.statement = e.statement; if (e.signpost) merged.signpost = e.signpost; }
    if (c.kind === 'coaching' && e.prompt) merged.prompt = e.prompt;
    return merged;
  };
  const commands = proposal.commands.filter((c) => capture.kinds.includes(c.kind) && c.kind !== 'budget').map((c) => applyEdit({
    ...c, ownerId: capture.ownerId || c.ownerId, dueOn: capture.reviewOn,
    // ADR-0107: one reviewed declaration freezes BOTH the testable premise and
    // the adopted decision's pre-registered outcome probability. A loop adopted
    // without a decision may still be scored from its premise prior.
    ...(['premise', 'decision'].includes(c.kind) ? { priorPct: capture.priorPct ?? 70 } : {}),
  }));
  if (capture.kinds.includes('budget')) {
    const envelope = (state.budgets || []).find((b) => b.id === capture.budgetId && b.status === 'active');
    if (!envelope || !Number.isFinite(capture.amount) || capture.amount <= 0) return { ok: false, error: 'Choose an eligible envelope and an explicit positive commitment amount.' };
    commands.push({ kind: 'budget', title: 'Reviewed mitigation commitment', ownerId: capture.ownerId, sourceId, dueOn: capture.reviewOn, budgetId: envelope.id, amount: capture.amount });
  }
  if (commands.length !== capture.kinds.length) return { ok: false, error: 'A selected action has no eligible proposal. Choose an owner, or remove that action and prepare again.' };
  const valid = validateBundleCommands(commands, projected, now);
  if (!valid.ok) return valid;
  const value = { ...capture, caseInput, commands: valid.value };
  return { ok: true, commands: valid.value, caseInput, fingerprint: fingerprint(valid.value), inputFingerprint: captureInputFingerprint(value), sourceFingerprint: captureSourceFingerprint(state, value) };
}

/** Only the preparing seat receives the note. Work, not raw intake, travels up. */
export function capturesForSeat(state, seatId, { now = new Date() } = {}) {
  const advisories = captureMergeAdvisoriesForSeat(state, seatId, { now });
  return (state.missionCaptures || []).filter((c) => c.ownerSeatId === seatId).map((c) => ({
    ...clone(c),
    stale: ['draft', 'rehearsed'].includes(c.status) && (c.baseRevision !== state.meta?.revision || c.evaluatedAt?.slice(0, 10) !== dayKey(now)
      || (c.mergeFromIds?.length > 0 && Boolean(c.sourceFingerprint) && c.sourceFingerprint !== captureSourceFingerprint(state, c))),
    rollup: captureRollup(state, c.ownerSeatId, { now }).path,
    mergeAdvisory: ['draft', 'rehearsed'].includes(c.status) ? advisories.get(c.id) || null : null,
  }));
}

export function captureReceiptText(state, capture) {
  if (!capture || !['adopted', 'merged'].includes(capture.status)) return 'This capture has not been adopted.';
  const bundle = (state.actionBundles || []).find((b) => b.id === capture.bundleId);
  if (capture.status === 'merged') {
    return [
      '# LeadOS · Command Flow cross-span consolidation receipt', `Constituent capture: ${capture.id}`,
      `Consolidated into LCA capture: ${capture.mergedIntoCaptureId}`, `Dedupe fingerprint: ${capture.dedupeFingerprint || 'n/a'}`,
      `Case: ${capture.caseId}`, `Bundle: ${capture.bundleId}`, `Consolidated: ${capture.adoptedAt}`,
      `Actions: ${(bundle?.commands || []).map((c) => BUNDLE_LABELS[c.kind]).join('; ')}`,
      'Your raw note stayed at this preparing seat and was never copied upward; the common ancestor adopted one consolidated case.',
    ].join('\n');
  }
  return [
    '# LeadOS · Command Flow receipt', `Capture: ${capture.id}`, `Case: ${capture.caseId}`, `Bundle: ${capture.bundleId}`,
    ...(capture.mergeFromIds?.length ? [`Consolidated constituent captures: ${capture.mergeFromIds.length}`, `Dedupe fingerprint: ${capture.dedupeFingerprint}`] : []),
    `Adopted: ${capture.adoptedAt}`, `Review: ${capture.reviewOn}`, `Input fingerprint: ${capture.inputFingerprint}`,
    `Actions: ${(bundle?.commands || []).map((c) => BUNDLE_LABELS[c.kind]).join('; ')}`,
    'One transaction: case registration, reviewed actions, shared rule propagation and vertical provenance.',
    'Withdraw the bundle only while every action remains untouched. The source case and audit history are retained.',
    'Classifier probabilities are heuristic evidence weights, not calibrated forecasts. Software effects are not causal business predictions.',
  ].join('\n');
}

/**
 * Atomic case + coordinated actions + capture receipt. No nested persistence;
 * every production API event is delivered to the existing post-commit registry.
 * Any command, rule, fingerprint or receipt failure rolls back the entire write.
 */
export function transactMissionCapture(store, captureId, { expectedRevision, reviewed = false, simulation = false }, { now, idFactory, createApi }) {
  const fail = (error) => ({ ok: false, error });
  const capture = (store.state.missionCaptures || []).find((c) => c.id === captureId);
  if (!capture || !(capture.status === 'rehearsed' || (simulation && capture.status === 'draft')) || (!simulation && (!capture.preview || capture.preview.failureCount))) return fail('Prepare and rehearse this response before adoption.');
  if (reviewed !== true) return fail('Review the case, every action and the hierarchy effects before adopting.');
  if (expectedRevision !== store.state.meta.revision || (!simulation && capture.baseRevision !== expectedRevision) || (!simulation && capture.evaluatedAt?.slice(0, 10) !== dayKey(now))) return fail('The workspace or calendar changed. Rehearse again; nothing was applied.');
  if (capture.inputFingerprint !== captureInputFingerprint(capture) || capture.sourceFingerprint !== captureSourceFingerprint(store.state, capture)) return fail('The reviewed inputs changed. Prepare and rehearse again.');
  const plan = prepareCapturePlan(store.state, capture, now);
  if (!plan.ok) return plan;
  if (plan.inputFingerprint !== capture.inputFingerprint || plan.sourceFingerprint !== capture.sourceFingerprint || (!simulation && (plan.fingerprint !== capture.planFingerprint || fingerprint(plan.commands) !== fingerprint(capture.commands)))) return fail('The proposed commands no longer match the reviewed rehearsal.');
  if (JSON.stringify(store.state).length > 8_000_000) return fail('This workspace exceeds the 8 MB transaction safety bound. Export a smaller operational copy.');
  const before = clone(store.state);
  const oldEvents = new Set((before.events || []).map((e) => e.id));
  const oldReceipts = new Set((before.propagationReceipts || []).map((e) => e.id));
  const caseId = idFactory('case'); const bundleId = idFactory('bnd');
  const sourceEvents = []; let result = null; const warningCount = store.warnings.length;
  try {
    store.update((draft, helpers) => {
      const { staged, sourceEvents: caseEvents } = createStagedStore(draft, helpers, { now, store });
      let firstCase = true;
      const scopedIds = (prefix) => { if (prefix === 'case' && firstCase) { firstCase = false; return caseId; } return idFactory(prefix); };
      const caseApi = createApi(staged, { now: () => now, idFactory: scopedIds });
      const registered = caseApi.addCase({ ...plan.caseInput, autoPropagate: true });
      if (!registered.ok || registered.id !== caseId) throw new Error(registered.error || 'The case receipt did not match the reviewed transaction.');
      sourceEvents.push(...caseEvents);
      const commands = plan.commands.map((c) => ({ ...c, sourceId: c.sourceId === CAPTURE_SOURCE ? caseId : c.sourceId }));
      const bundle = {
        id: bundleId, name: `Command Flow · ${capture.title}`.slice(0, 180), sourceType: 'case', sourceId: caseId,
        reviewOn: capture.reviewOn, commands, status: 'committed', createdAt: now.toISOString(), updatedAt: now.toISOString(), committedAt: now.toISOString(),
        withdrawnAt: null, archivedAt: null, evaluatedAt: capture.evaluatedAt, baseRevision: expectedRevision,
        inputFingerprint: '', sourceFingerprint: '', preview: clone(capture.preview), actual: null, outputs: [],
        history: [{ at: now.toISOString(), type: 'committed', summary: 'Case and reviewed actions adopted together from Command Flow.' }],
      };
      bundle.inputFingerprint = bundleInputFingerprint(bundle); bundle.sourceFingerprint = bundleSourceFingerprint(draft, bundle);
      draft.actionBundles.unshift(bundle);
      const committedEvent = { type: 'bundle.committed', entity: 'bundle', entityId: bundleId, summary: 'Reviewed Command Flow actions adopted with their source case' };
      helpers.logEvent(committedEvent); sourceEvents.push(committedEvent);
      const actions = stageBundle(draft, helpers, commands, { now, idFactory, createApi, store });
      sourceEvents.push(...actions.sourceEvents);
      bundle.outputs = actions.outputs;
      const target = draft.missionCaptures.find((c) => c.id === captureId);
      Object.assign(target, { status: 'adopted', caseId, bundleId, adoptedAt: now.toISOString(), updatedAt: now.toISOString() });
      target.history.push({ at: now.toISOString(), type: 'adopted', summary: target.mergeFromIds?.length ? `Consolidated ${target.mergeFromIds.length} cross-span captures into one LCA-owned case and action receipt.` : 'One atomic case, action and propagation receipt.' });
      if (target.mergeFromIds?.length) {
        for (const memberId of target.mergeFromIds) {
          const member = draft.missionCaptures.find((c) => c.id === memberId);
          if (!member || !['draft', 'rehearsed'].includes(member.status)) {
            throw new Error('A constituent span capture is no longer open for consolidation. Everything was rolled back.');
          }
          Object.assign(member, {
            status: 'merged', mergedIntoCaptureId: captureId, dedupeFingerprint: target.dedupeFingerprint || '',
            caseId, bundleId, adoptedAt: now.toISOString(), updatedAt: now.toISOString(),
          });
          member.history = [...(member.history || []), { at: now.toISOString(), type: 'merged', summary: `Consolidated into LCA case ${caseId}; raw note stayed at this preparing seat.` }].slice(-60);
        }
      }
      result = { bundle, actions };
    }, { type: MISSION_EVENTS.CAPTURE_ADOPTED, entity: 'missioncapture', entityId: captureId, summary: 'Reviewed situation adopted: case, coordinated actions and hierarchy provenance in one transaction' }, {
      sourceEvents,
      afterRules: (draft) => {
        const failures = (draft.events || []).filter((e) => !oldEvents.has(e.id) && e.type === 'automation.rule_error').length
          + (draft.propagationReceipts || []).filter((e) => !oldReceipts.has(e.id)).length;
        if (failures) throw new Error(`${failures} propagation rule(s) failed. The case, actions and receipt were all rolled back.`);
        // Rules may copy-on-write collections. Re-resolve the live receipt rather
        // than stamping fingerprints onto a pre-rule object reference.
        const liveBundle = draft.actionBundles.find((b) => b.id === bundleId);
        if (!liveBundle) throw new Error('The action receipt disappeared during propagation. Everything was rolled back.');
        result.bundle = liveBundle;
        for (const pending of result.actions.deferredTargets) liveBundle.outputs.push(...pending.adapter.targets(draft, pending.command, pending.result).map((o) => ({ ...o, kind: pending.command.kind })));
        for (const output of liveBundle.outputs) {
          const record = BUNDLE_ADAPTERS[output.kind].target(draft, output.id, output);
          if (!record) throw new Error('An action target disappeared during propagation. Everything was rolled back.');
          output.fingerprint = fingerprint(record);
        }
        liveBundle.actual = bundlePreview(before, draft, (store.lastPropagations || []).map((p) => p.ruleId).filter(Boolean));
        const shape = (p) => fingerprint({ changes: p.changes, relationships: p.relationships, ruleIds: [...p.ruleIds].sort() });
        if (!simulation && shape(liveBundle.actual) !== shape(capture.preview)) throw new Error('The live footprint differs from the rehearsal. Everything was rolled back; rehearse current facts.');
        const target = draft.missionCaptures.find((c) => c.id === captureId);
        target.preview = clone(liveBundle.actual); target.baseRevision = draft.meta.revision;
        target.history = target.history.slice(-60); liveBundle.history = liveBundle.history.slice(-60);
      },
    });
    if (store.state.meta.revision === before.meta.revision) throw new Error('Writes are blocked. No live record changed.');
    return { ok: true, id: captureId, caseId, bundleId, preview: result.bundle.actual, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [] };
  } catch (error) {
    store.warnings.splice(warningCount);
    return fail(error?.message || 'The transaction failed. No live record changed.');
  }
}
