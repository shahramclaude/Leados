import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { caseMitigationReadiness } from '../../app/core/domain/cases.js';
import { onDelegationCompleted } from '../../app/core/domain/automation.js';
import { renderCaseDetailView } from '../../app/views/cases.js';

const now = new Date('2026-10-29T12:00:00Z');
const edge = (id, caseId, delegationId, reverse = false) => reverse
  ? { id, sourceType: 'delegation', sourceId: delegationId, targetType: 'case', targetId: caseId, relation: 'mitigates' }
  : { id, sourceType: 'case', sourceId: caseId, targetType: 'delegation', targetId: delegationId, relation: 'mitigates' };

test('AND gate accounts for both directions, duplicates, missing, returned and unrelated completions', () => {
  const state = createEmptyState();
  state.cases.push({ id: 'c', title: 'Delay', status: 'open' });
  state.delegations.push({ id: 'a', status: 'done' }, { id: 'b', status: 'returned' }, { id: 'other', status: 'done' });
  state.links.push(edge('1', 'c', 'a'), edge('2', 'c', 'a', true), edge('3', 'c', 'b', true), edge('4', 'c', 'missing'));
  const gate = caseMitigationReadiness(state, 'c');
  assert.equal(gate.total, 3); assert.equal(gate.done, 1); assert.equal(gate.missing, 1); assert.equal(gate.ready, false);
  onDelegationCompleted(state, 'other', { now });
  onDelegationCompleted(state, 'a', { now });
  assert.equal(state.cases[0].status, 'open');
  state.links = state.links.filter((l) => l.id !== '4');
  state.delegations[1].status = 'done';
  const result = onDelegationCompleted(state, 'b', { now });
  assert.equal(state.cases[0].status, 'monitoring');
  assert.equal(result.filter((x) => x.ruleId === 'RULE-SYNC-DEL-01').length, 1);
  assert.equal(onDelegationCompleted(state, 'b', { now }).length, 0);
});

test('retains only well-formed dangling case mitigation edges on reload, not privacy violations', () => {
  const raw = createEmptyState();
  raw.cases.push({ id: 'c', title: 'Delay', openedOn: '2026-10-28', status: 'open' });
  raw.links.push(edge('m1', 'c', 'gone'), edge('m2', 'c', 'gone2', true),
    { id: 'bad', sourceType: 'case', sourceId: 'c', targetType: 'conflict', targetId: 'secret', relation: 'mitigates' },
    { id: 'other', sourceType: 'case', sourceId: 'c', targetType: 'decision', targetId: 'gone', relation: 'decides' });
  const { state, warnings } = normalizeState(raw, { now });
  assert.deepEqual(state.links.map((l) => l.id), ['m1', 'm2']);
  assert.equal(caseMitigationReadiness(state, 'c').missing, 2);
  assert.ok(warnings.some((w) => w.includes('retained 2 missing mitigation')));
});

test('real case cascade, reload, completion and reviewed repair re-evaluate the gate atomically', () => {
  const data = new Map(); let n = 0;
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const ids = (p) => `${p}-${++n}`;
  const store = createStore({ storage, now: () => now, idFactory: ids }); store.load();
  const api = createApi(store, { now: () => now, idFactory: ids });
  const person = api.addPerson({ name: 'Alex', role: 'Engineer', startDate: '2025-01-01' });
  const goal = api.addGoal({ title: 'Protect delivery', ownerId: person.id, confidence: 'on-track', dueDate: '2026-12-01' });
  const c = api.addCase({ title: 'Production delay', kind: 'incident', openedOn: '2026-10-28', ownerId: person.id, linkedGoalId: goal.id,
    fmea: { severity: 9, probability: 6, detectability: 5 }, financial: { optimistic: 100, mostLikely: 200, pessimistic: 300, capacityDaysOptimistic: 1, capacityDaysMostLikely: 2, capacityDaysPessimistic: 3 }, stakeholders: [{ name: 'Sponsor', power: 5, interest: 5, stance: 'skeptical' }] });
  assert.equal(c.ok, true); assert.equal(store.state.decisions.length, 1); assert.equal(store.state.delegations.length, 1);
  assert.equal(store.state.goals[0].confidence, 'at-risk');
  assert.ok(store.state.people[0].talkingPoints.some((t) => t.includes('Case support')));
  assert.ok(store.state.links.some((l) => l.relation === 'communicates'));
  assert.ok(store.state.portfolio.some((p) => p.sourceId === c.id));
  const del = store.state.delegations[0].id;
  store.update((draft) => { draft.links.push(edge('missing-link', c.id, 'missing', true)); }, { type: 'test.fixture', entity: 'case', entityId: c.id });
  const reload = createStore({ storage, now: () => now, idFactory: ids }); reload.load();
  const api2 = createApi(reload, { now: () => now, idFactory: ids });
  assert.equal(caseMitigationReadiness(reload.state, c.id).missing, 1);
  assert.equal(api2.completeDelegation(del, { completedOn: '2026-10-29', completionNote: 'Verified in staging' }).ok, true);
  assert.equal(reload.state.cases.find((r) => r.id === c.id).status, 'mitigating');
  const validLink = reload.state.links.find((l) => l.relation === 'mitigates' && l.id !== 'missing-link');
  assert.equal(api2.removeMissingCaseMitigation(c.id, validLink.id).ok, false);
  assert.equal(api2.removeMissingCaseMitigation(c.id, 'missing-link').ok, true);
  assert.equal(reload.state.cases.find((r) => r.id === c.id).status, 'monitoring');
  assert.ok(reload.state.events.some((e) => e.type === 'case.mitigation-link.removed' && e.entityId === c.id));
  assert.ok(reload.state.events.some((e) => e.type === 'automation.propagated' && e.summary.includes('RULE-SYNC-DEL-01')));
  assert.equal(api2.removeMissingCaseMitigation(c.id, 'missing-link').ok, false);
});

test('case detail exposes missing mitigation and a labelled repair action', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const oldDocument = globalThis.document, oldNode = globalThis.Node;
  globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  try {
    const raw = createEmptyState(); raw.cases.push({ id: 'c', title: 'Delay', openedOn: '2026-10-28', status: 'open' });
    raw.links.push(edge('missing-link', 'c', 'gone', true));
    const { state } = normalizeState(raw, { now });
    const node = renderCaseDetailView({ state, now, navigate() {}, api: {} }, 'c');
    document.body.append(node);
    assert.match(document.querySelector('[data-testid="mitigation-readiness"]').textContent, /1 missing/);
    assert.ok([...document.querySelectorAll('button')].some((b) => b.textContent === 'Review & remove'));
  } finally { globalThis.document = oldDocument; globalThis.Node = oldNode; dom.window.close(); }
});

test('repair reports a rule failure rather than claiming the gate ran', () => {
  const data = new Map(); let n = 0;
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  function caseCreatedRule(_draft, ctx) { if (ctx.event?.type === 'case.mitigation-link.removed') throw new Error('test failure'); return []; }
  const store = createStore({ storage, now: () => now, idFactory: (p) => `${p}-${++n}`, postCommitRules: [caseCreatedRule] }); store.load();
  store.update((draft) => { draft.cases.push({ id: 'c', title: 'Delay', status: 'open' }); draft.links.push(edge('broken', 'c', 'gone')); }, null);
  const result = createApi(store, { now: () => now }).removeMissingCaseMitigation('c', 'broken');
  assert.equal(result.ok, true);
  assert.match(result.warning, /gate failed/);
  assert.ok(store.state.propagationReceipts.some((r) => r.rule === 'caseCreatedRule'));
});
