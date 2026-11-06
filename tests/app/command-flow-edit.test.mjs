/**
 * ADR-0114: reviewed command editing inside Command Flow, and the authority
 * alignment that makes it real at manager altitude.
 *
 * Session 154 blocked on a contradiction: the rank-2 Mission profile offers
 * `premise` (ADR-0105, README — "manager adds premise") while the shared
 * `test-assumption` right read rank 3–5, so a manager's rehearsal died at the
 * adoption transaction. The right now reads 2–5; these tests pin the whole
 * contract: alignment, verbatim reviewed words, fail-closed edits, and the
 * fingerprint that keeps a stale rehearsal from being adopted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildSeats, activeSeat, canAct } from '../../app/core/domain/seat.js';
import { normalizeMissionCaptures, normalizeCommandEdits } from '../../app/core/domain/missionCaptureSchema.js';
import { rehearseMissionCapture } from '../../app/services/missionCaptureRehearsal.js';

const NOW = new Date('2026-11-06T12:00:00.000Z');
const clone = (v) => JSON.parse(JSON.stringify(v));
const NOTE = 'The supplier delivery is late again and the team is overloaded. Ari Klein says the billing backlog is blocking handoffs. The warehouse handoff slips every Friday.';
function fixture(seat = 'mgr1') {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Root', chainLeaderAltitude: 'chief', activeSeatId: seat, missionCellFloor: 5 };
  state.people = [
    ['vp1', null, 'vp', 'Rina VP'], ['dir1', 'vp1', 'director', 'Sam Director'], ['mgr1', 'dir1', 'manager', 'Mei Manager'],
    ['lead1', 'mgr1', 'lead', 'Priya Lead'], ['lead2', 'mgr1', 'lead', 'Jordan Lead'], ['ic1', 'lead1', 'ic', 'Ari Klein'], ['ic3', 'lead2', 'ic', 'Cy Orlov'],
  ].map(([id, managerId, level, name]) => ({ id, name, role: level, level, managerId, status: 'active' }));
  state.budgets = [{ id: 'b-vp', name: 'VP envelope', label: 'VP envelope', ownerId: 'vp1', currency: 'USD', limit: 50000, status: 'active', lines: [] }];
  return normalizeState(state, { now: NOW }).state;
}
function setup({ state = fixture(), failWrites = false } = {}) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { if (failWrites) throw new Error('Quota exceeded'); data.set(k, String(v)); }, removeItem: (k) => data.delete(k) };
  let seq = 0; const idFactory = (p) => `${p}-edit-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory }); store.load();
  return { store, storage, api: createApi(store, { now: () => NOW, idFactory }) };
}
const MANAGER_EDITS = {
  decision: {
    title: 'Choose the recovery path for the billing backlog',
    question: 'Which recovery path do we adopt for the billing backlog?',
    options: [
      { label: 'Move the Friday handoff to Wednesday', pros: 'Creates slack before the weekend', cons: 'Two teams change cadence' },
      { label: 'Add a temporary contractor for two cycles', pros: 'Fastest relief', cons: 'Cost and onboarding drag' },
      { label: 'Hold scope and renegotiate the client date', pros: 'Protects the team', cons: 'Commercial risk' },
    ],
  },
  delegation: { title: 'Verify the backlog recovery checkpoint', outcome: 'Backlog under 40 tickets with no ageing over 7 days, verified from the tracker on 2026-11-13.' },
  premise: {
    title: 'The Friday handoff is the binding constraint',
    statement: 'The Friday handoff, not staffing, is what keeps the billing backlog above 40 tickets.',
    signpost: 'If the backlog is still above 40 after two Wednesday handoffs, this assumption is broken; record it by 2026-11-20.',
  },
};
function prepare(env, extra = {}) {
  const result = env.api.missionCapturePrepare({ text: NOTE, title: 'Billing backlog recovery', ownerId: env.store.state.settings.activeSeatId, kinds: ['decision', 'delegation', 'premise'], reviewOn: '2026-11-13', severity: 7, ...extra });
  assert.equal(result.ok, true, result.error); return result.id;
}
function rehearsed(env, id) {
  const result = rehearseMissionCapture(env.store.state, id, { now: NOW }); assert.equal(result.ok, true, result.error);
  const saved = env.api.saveMissionCapturePreview(id, result); assert.equal(saved.ok, true, saved.error); return result;
}

test('the Session 154 blocker is closed: a rank-2 manager rehearses and adopts a premise-bearing response', () => {
  const env = setup(); const seat = activeSeat(buildSeats(env.store.state, { now: NOW }));
  assert.equal(seat.rank, 2);
  assert.equal(canAct('test-assumption', seat).allow, true, 'manager may register a testable operating assumption');
  const id = prepare(env); rehearsed(env, id);
  const result = env.api.missionCaptureCommit(id, env.store.state.meta.revision, true);
  assert.equal(result.ok, true, result.error);
  assert.equal(env.store.state.premises.length, 1);
});

test('frontline (rank 1) still may not register an assumption anywhere — profile or right', () => {
  const env = setup({ state: fixture('lead1') }); const seat = activeSeat(buildSeats(env.store.state, { now: NOW }));
  assert.equal(seat.rank, 1);
  assert.equal(canAct('test-assumption', seat).allow, false);
  assert.equal(env.api.missionCapturePrepare({ text: NOTE, ownerId: 'lead1', kinds: ['premise'] }).ok, false, 'rank 1 profile does not offer premise');
  const direct = env.api.addPremise({ title: 'Rank one assumption', statement: 'Frontline may not hold this right.', signpost: 's', ownerId: 'lead1', priorPct: 50, watchPct: 35, breachPct: 20, criticality: 'major', reviewBy: '2026-12-01' });
  assert.equal(direct.ok, false, 'the shared right still refuses rank 1');
});

test('an altitude-ineligible premise edit is refused at the door', () => {
  const env = setup({ state: fixture('lead1') });
  const result = env.api.missionCapturePrepare({ text: NOTE, ownerId: 'lead1', kinds: ['decision'], commandEdits: { premise: { statement: 'Frontline words job' } } });
  assert.equal(result.ok, false); assert.match(result.error, /outside this altitude/);
});

test('the reviewed words reach the adopted records verbatim; the decision is still not chosen', () => {
  const env = setup(); const id = prepare(env, { priorPct: 65, commandEdits: MANAGER_EDITS }); rehearsed(env, id);
  const result = env.api.missionCaptureCommit(id, env.store.state.meta.revision, true);
  assert.equal(result.ok, true, result.error);
  const s = env.store.state;
  const bundle = s.actionBundles[0];
  const byKind = (kind) => bundle.outputs.find((o) => o.kind === kind)?.id;
  const decision = s.decisions.find((r) => r.id === byKind('decision'));
  assert.ok(decision, 'the bundle output resolves to the decision');
  assert.equal(decision.title, MANAGER_EDITS.decision.title);
  assert.equal(decision.question, MANAGER_EDITS.decision.question);
  assert.deepEqual(decision.options.map((o) => [o.label, o.pros, o.cons]), MANAGER_EDITS.decision.options.map((o) => [o.label, o.pros, o.cons]));
  assert.equal(decision.chosen, '', 'adoption never chooses an option');
  const delegation = s.delegations.find((r) => r.id === byKind('delegation'));
  assert.equal(delegation.title, MANAGER_EDITS.delegation.title);
  assert.equal(delegation.expectedOutcome, MANAGER_EDITS.delegation.outcome);
  const premise = s.premises.find((r) => r.id === byKind('premise'));
  assert.equal(premise.title, MANAGER_EDITS.premise.title);
  assert.equal(premise.statement, MANAGER_EDITS.premise.statement);
  assert.equal(premise.signpost, MANAGER_EDITS.premise.signpost);
  assert.equal(premise.priorPct, 65, 'the reviewed prior freezes with the premise');
});

test('a frontline edit set covers decision, delegation and coaching prompt', () => {
  const env = setup({ state: fixture('lead1') });
  const id = env.api.missionCapturePrepare({ text: NOTE, title: 'Handoff recovery', ownerId: 'lead1', kinds: ['decision', 'delegation', 'coaching'], reviewOn: '2026-11-13', severity: 6,
    commandEdits: {
      decision: { question: 'Move the handoff or renegotiate the date?', options: [
        { label: 'Move the handoff', pros: 'Slack', cons: 'Cadence change' },
        { label: 'Renegotiate the date', pros: 'Team capacity', cons: 'Client impact' },
      ] },
      coaching: { title: 'Load check', prompt: 'What would make the next billing cycle survivable without heroics?' },
    } });
  assert.equal(id.ok, true, id.error);
  rehearsed(env, id.id);
  const committed = env.api.missionCaptureCommit(id.id, env.store.state.meta.revision, true);
  assert.equal(committed.ok, true, committed.error);
  const person = env.store.state.people.find((p) => p.id === 'lead1');
  assert.ok(person.talkingPoints.includes('What would make the next billing cycle survivable without heroics?'));
});

test('an unnamed decision option is refused, never silently replaced by a default', () => {
  const env = setup();
  const before = clone(env.store.state);
  const result = env.api.missionCapturePrepare({ text: NOTE, title: 'Billing backlog recovery', ownerId: 'mgr1', kinds: ['decision'], reviewOn: '2026-11-13',
    commandEdits: { decision: { options: [
      { label: 'Move the handoff', pros: 'Slack', cons: 'Cadence' },
      { label: '   ', pros: 'Unnamed', cons: 'Unnamed' },
    ] } } });
  assert.equal(result.ok, false); assert.equal(result.field, 'options');
  assert.deepEqual(env.store.state, before, 'a refused edit writes nothing');
});

test('option bounds are enforced: fewer than two or more than five is refused', () => {
  const env = setup();
  for (const options of [
    [{ label: 'Only one', pros: '', cons: '' }],
    [1, 2, 3, 4, 5, 6].map((n) => ({ label: `Option ${n}`, pros: '', cons: '' })),
  ]) {
    const result = env.api.missionCapturePrepare({ text: NOTE, ownerId: 'mgr1', kinds: ['decision'], reviewOn: '2026-11-13', commandEdits: { decision: { options } } });
    assert.equal(result.ok, false); assert.equal(result.field, 'options');
  }
});

test('editing the words after a rehearsal changes the input fingerprint — the stale rehearsal cannot be adopted', () => {
  const env = setup(); const first = env.api.missionCapturePrepare({ text: NOTE, title: 'Billing backlog recovery', ownerId: 'mgr1', kinds: ['decision', 'delegation', 'premise'], reviewOn: '2026-11-13', commandEdits: MANAGER_EDITS });
  assert.equal(first.ok, true);
  const captured = env.store.state.missionCaptures[0];
  rehearsed(env, first.id);
  const second = env.api.missionCapturePrepare({ text: NOTE, title: 'Billing backlog recovery', ownerId: 'mgr1', kinds: ['decision', 'delegation', 'premise'], reviewOn: '2026-11-13', captureId: first.id,
    commandEdits: { ...MANAGER_EDITS, delegation: { ...MANAGER_EDITS.delegation, outcome: 'A different, later outcome was typed after the rehearsal.' } } });
  assert.equal(second.ok, true, second.error);
  const reEdited = env.store.state.missionCaptures[0];
  assert.notEqual(reEdited.inputFingerprint, captured.inputFingerprint, 'the fingerprint covers the reviewed words');
  assert.equal(reEdited.status, 'draft', 'saving an edit returns the capture to draft');
  const committed = env.api.missionCaptureCommit(first.id, env.store.state.meta.revision, true);
  assert.equal(committed.ok, false, 'a stale rehearsal is never adopted');
  assert.equal(env.store.state.cases.length, 0);
});

test('normalization round-trips the reviewed words and refuses malformed edits fail-closed', () => {
  const env = setup(); const id = prepare(env, { commandEdits: MANAGER_EDITS });
  const raw = clone(env.store.state);
  const warnings = [];
  const normalized = normalizeMissionCaptures(raw.missionCaptures, raw, warnings, { now: NOW });
  assert.equal(warnings.length, 0);
  assert.deepEqual(normalized[0].commandEdits.decision.options.map((o) => o.label), MANAGER_EDITS.decision.options.map((o) => o.label));
  assert.equal(normalized[0].commandEdits.premise.signpost, MANAGER_EDITS.premise.signpost);
  // Malformed decision options (one unnamed) drop the option list but keep the named edits.
  const mixed = normalizeCommandEdits({ decision: { title: 'Kept title', options: [{ label: '', pros: '', cons: '' }, { label: 'Named', pros: '', cons: '' }] }, budget: { title: 'Not an editable kind' }, alien: { title: 'Nope' } });
  assert.equal(mixed.decision.title, 'Kept title');
  assert.equal(mixed.decision.options, undefined, 'an option list with an unnamed option is dropped whole');
  assert.equal(mixed.budget, undefined); assert.equal(mixed.alien, undefined);
  assert.equal(normalizeCommandEdits(null), null);
});

test('a stored rehearsal survives normalization with its option list intact (fingerprint parity)', () => {
  const env = setup(); const id = prepare(env, { commandEdits: MANAGER_EDITS }); rehearsed(env, id);
  const raw = clone(env.store.state); const stored = normalizeMissionCaptures(raw.missionCaptures, raw, [], { now: NOW })[0];
  assert.equal(stored.status, 'rehearsed', 'options and fingerprints round-trip, so approval is not silently revoked');
  assert.equal(stored.commands.find((c) => c.kind === 'decision').options.length, 3);
  assert.equal(stored.commands.find((c) => c.kind === 'premise').signpost, MANAGER_EDITS.premise.signpost);
});
