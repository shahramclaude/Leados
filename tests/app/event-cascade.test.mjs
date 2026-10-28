import test from 'node:test';
import assert from 'node:assert/strict';
import { runPostCommitRules, MAX_AUTOMATION_EVENTS } from '../../app/core/domain/postCommit.js';
import { earlyWarningRule } from '../../app/core/domain/earlyWarning.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';
import { isFmeaRated } from '../../app/core/domain/cases.js';

const NOW = new Date('2026-10-28T10:00:00.000Z');
const memory = () => {
  const values = new Map();
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) };
};
function harness(storage = memory(), postCommitRules) {
  let n = 0;
  const idFactory = (prefix) => `${prefix}-cascade-${++n}`;
  const store = createStore({ storage, now: () => NOW, idFactory, ...(postCommitRules ? { postCommitRules } : {}) });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage };
}

test('breadth-first delivery crosses multiple modules, infers record events and suppresses duplicates and cycles', () => {
  const draft = { cases: [], decisions: [], delegations: [], portfolio: [], visits: [] };
  const audit = [];
  function producer(d, ctx) {
    const type = ctx.event.type;
    d.visits.push(`producer:${type}`);
    if (type === 'seed.started') {
      d.cases.push({ id: 'c1' });
      assert.equal(ctx.emitEvent({ type: 'case.created', entity: 'case', entityId: 'c1', automationOptions: { propagateDecision: true } }), true);
      assert.equal(ctx.emitEvent({ type: 'case.created', entity: 'case', entityId: 'c1' }), false);
    } else if (type === 'case.created') {
      assert.equal(ctx.event.automationOptions.propagateDecision, true);
      d.decisions.push({ id: 'd1' }); // automatically emits decision.created
    } else if (type === 'decision.created') {
      d.delegations.push({ id: 'g1' }); // automatically emits delegation.created
    } else if (type === 'delegation.created') {
      assert.equal(ctx.emitEvent({ type: 'seed.started', entity: 'workspace', entityId: 'w' }), false);
    }
    return [{ targetId: type }];
  }
  function observer(d, ctx) { d.visits.push(`observer:${ctx.event.type}`); }
  const effects = runPostCommitRules(draft, {
    event: { type: 'seed.started', entity: 'workspace', entityId: 'w' },
    rules: [producer, observer], logEvent: (event) => audit.push(event),
  });
  assert.deepEqual(draft.visits, [
    'producer:seed.started', 'observer:seed.started',
    'producer:case.created', 'observer:case.created',
    'producer:decision.created', 'observer:decision.created',
    'producer:delegation.created', 'observer:delegation.created',
  ]);
  assert.equal(effects.length, 4);
  assert.deepEqual(audit.map((e) => e.type), ['case.created', 'decision.created', 'delegation.created']);
  assert.equal(audit.some((e) => Object.hasOwn(e, 'automationOptions')), false);
});

test('failed producer discards writes, audit, warnings and emitted events while the next subscriber runs', () => {
  const draft = { cases: [], seen: [] }; const audit = []; const warnings = [];
  function broken(d, ctx) {
    d.cases.push({ id: 'partial' });
    ctx.logEvent({ type: 'success', summary: 'must be discarded' });
    ctx.warnings.push('must be discarded');
    ctx.emitEvent({ type: 'case.created', entity: 'case', entityId: 'partial' });
    throw new Error('injected failure');
  }
  function observer(d, ctx) { d.seen.push(ctx.event.type); }
  runPostCommitRules(draft, { event: { type: 'seed.started', entity: 'workspace', entityId: 'w' }, rules: [broken, observer], logEvent: (e) => audit.push(e), warnings });
  assert.deepEqual(draft.cases, []);
  assert.deepEqual(draft.seen, ['seed.started']);
  assert.deepEqual(audit.map((e) => e.type), ['automation.rule_error']);
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0], /must be discarded/);
});

test('event limit rolls back the overflowing producer; asynchronous rules are rejected', () => {
  const draft = { visits: [] }; const warnings = []; const audit = [];
  function chain(d, ctx) {
    const n = Number(ctx.event.entityId);
    d.visits.push(n);
    ctx.emitEvent({ type: 'hop.ping', entity: 'test', entityId: String(n + 1) });
  }
  runPostCommitRules(draft, { event: { type: 'hop.ping', entity: 'test', entityId: '0' }, rules: [chain], warnings, logEvent: (e) => audit.push(e) });
  assert.equal(draft.visits.length, MAX_AUTOMATION_EVENTS - 1);
  assert.equal(draft.visits.at(-1), MAX_AUTOMATION_EVENTS - 2);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /event limit/i);
  assert.equal(audit.filter((e) => e.type === 'automation.rule_error').length, 1);
  const asyncDraft = { values: [] }; const asyncWarnings = [];
  runPostCommitRules(asyncDraft, { event: { type: 'x.y' }, rules: [(d) => { d.values.push('partial'); return Promise.resolve([]); }], warnings: asyncWarnings });
  assert.deepEqual(asyncDraft.values, []);
  assert.match(asyncWarnings[0], /synchronous/);
});

test('confirmed Watch signal with recorded context fans into case, forecast, decision, delegation, goal, capacity, tempo and unsent comms', () => {
  const { store, api, storage } = harness();
  store.seedDemo(); // A real detector-produced alert; other inputs below are explicit test fixtures.
  const alert = store.state.watchAlerts.find((row) => row.status === 'open');
  assert.ok(alert);
  const owner = api.addPerson({ name: 'Cascade owner', role: 'Engineer', startDate: '2025-01-01' });
  const goal = api.addGoal({ title: 'Protect reliable delivery', ownerId: owner.id, confidence: 'on-track' });
  const stakeholder = api.addStakeholder({ name: 'Delivery sponsor', role: 'Sponsor', power: 5, interest: 5, stance: 'skeptical' });
  assert.ok(owner.ok && goal.ok && stakeholder.ok);
  store.update((d) => { d.settings.watchAutoPropagate = false; });
  const alertsBefore = store.state.watchAlerts.length;
  const conflictsBefore = JSON.stringify(store.state.conflicts);
  const pulsesBefore = JSON.stringify(store.state.pulses);
  const result = api.triageWatchAlert(alert.id, {
    verdict: 'confirmed', note: 'PRIVATE-VERDICT-NOTE',
    response: {
      ownerId: owner.id, goalId: goal.id, stakeholderId: stakeholder.id,
      responseAction: 'Inspect the queue and propose a safeguard', createDecision: true,
      fmea: { severity: 8, probability: 7, detectability: 6 },
      financial: { optimistic: 100, mostLikely: 200, pessimistic: 400, currency: 'DKK' },
      capacity: { optimistic: 1, mostLikely: 2, pessimistic: 4 },
    },
  });
  assert.equal(result.ok, true, result.error);
  assert.ok(result.linkedCaseId);
  assert.equal(store.state.watchAlerts.length, alertsBefore, 'paused triage does not restart sensing');
  const c = store.state.cases.find((row) => row.id === result.linkedCaseId);
  assert.equal(c.ownerId, owner.id);
  assert.equal(c.linkedGoalId, goal.id);
  assert.equal(c.fmea.severity, 8);
  assert.ok(c.forecastSnapshot && c.forecastSnapshot.currency === 'DKK');
  assert.equal(c.financial.capacityDaysMostLikely, 2);
  assert.ok(c.stakeholders.some((s) => s.name === 'Delivery sponsor'));
  const links = store.state.links.filter((l) => l.sourceType === 'case' && l.sourceId === c.id);
  for (const type of ['alert', 'decision', 'delegation', 'goal', 'portfolio', 'comms']) {
    assert.ok(links.some((l) => l.targetType === type), `case → ${type} relationship`);
  }
  const decision = links.find((l) => l.targetType === 'decision');
  assert.ok(store.state.tempoSchedules.some((s) => s.decisionId === decision.targetId && s.status === 'proposed'));
  assert.ok(store.state.commsDrafts.some((d) => d.caseId === c.id && d.status === 'draft'));
  for (const rule of ['RULE-EW-01', 'RULE-FCT-03', 'RULE-DEC-01', 'RULE-DEL-01', 'RULE-GOAL-01', 'RULE-CAP-01']) {
    assert.ok(result.propagations.some((p) => p.ruleId === rule), `returned propagation ${rule}`);
  }
  for (const type of ['case.created', 'decision.created', 'delegation.created', 'portfolio.created']) {
    assert.ok(store.state.events.some((e) => e.type === type && /Derived/.test(e.summary)), `derived lifecycle event ${type}`);
  }
  assert.equal(JSON.stringify(store.state.conflicts), conflictsBefore);
  assert.equal(JSON.stringify(store.state.pulses), pulsesBefore);
  assert.ok(!store.state.links.some((l) => ['conflict', 'pulse'].includes(l.sourceType) || ['conflict', 'pulse'].includes(l.targetType)));
  assert.ok(!store.state.events.some((e) => String(e.summary).includes('PRIVATE-VERDICT-NOTE')));
  const csv = exportWorkspaceCsv(store.state, 'watch', { now: NOW }).csv;
  assert.ok(!csv.includes('PRIVATE-VERDICT-NOTE') && !csv.includes('Delivery sponsor'));
  assert.equal(api.retryWatchPromotion(alert.id).linkedCaseId, c.id);
  const reloaded = harness(storage).store;
  const restored = reloaded.state.watchAlerts.find((a) => a.id === alert.id);
  assert.equal(restored.responseContext.ownerId, owner.id);
  assert.equal(restored.responseContext.capacity.mostLikely, 2);
  assert.equal(restored.linkedCaseId, c.id);
  assert.ok(reloaded.state.links.some((l) => l.sourceId === c.id && l.targetType === 'comms'));
});

test('invalid response is rejected before the verdict; unprovided ratings remain unrated', () => {
  const { store, api } = harness(); store.seedDemo();
  const alert = store.state.watchAlerts.find((row) => row.status === 'open');
  const invalid = api.triageWatchAlert(alert.id, { verdict: 'confirmed', response: { capacity: { optimistic: 1, mostLikely: 2, pessimistic: 3 } } });
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /FMEA/);
  assert.equal(store.state.watchAlerts.find((a) => a.id === alert.id).status, 'open');
  const valid = api.triageWatchAlert(alert.id, { verdict: 'confirmed', response: { createDecision: true } });
  assert.equal(valid.ok, true);
  const c = store.state.cases.find((row) => row.id === valid.linkedCaseId);
  assert.equal(isFmeaRated(c.fmea), false);
  assert.equal(c.fmea.severity, null);
  assert.equal(c.forecastSnapshot || null, null);
  const decision = store.state.decisions.find((d) => store.state.links.some((l) => l.sourceId === c.id && l.targetId === d.id && l.targetType === 'decision'));
  assert.match(decision.question, /not been rated/);
});

test('failed promotion preserves the human response on disk and can be retried without changing the verdict', () => {
  function failingPromotion(draft, ctx) {
    if (ctx.event?.type !== 'watch.triaged') return [];
    earlyWarningRule(draft, ctx);
    throw new Error('injected promotion failure');
  }
  const storage = memory();
  const first = harness(storage, [failingPromotion]); first.store.seedDemo();
  const alert = first.store.state.watchAlerts.find((a) => a.status === 'open');
  const owner = first.store.state.people.find((p) => p.status === 'active');
  const before = first.store.state.cases.length;
  const saved = first.api.triageWatchAlert(alert.id, { verdict: 'confirmed', response: { ownerId: owner.id, responseAction: 'Retry this real response', createDecision: true } });
  assert.equal(saved.ok, true);
  assert.equal(saved.linkedCaseId, null);
  assert.equal(first.store.state.cases.length, before);
  assert.equal(first.store.state.watchAlerts.find((a) => a.id === alert.id).responseContext.responseAction, 'Retry this real response');
  assert.ok(first.store.state.events.some((e) => e.type === 'automation.rule_error'));
  const second = harness(storage);
  assert.equal(second.store.state.watchAlerts.find((a) => a.id === alert.id).responseContext.ownerId, owner.id);
  const retried = second.api.retryWatchPromotion(alert.id);
  assert.equal(retried.ok, true);
  assert.ok(retried.linkedCaseId);
  assert.equal(second.store.state.cases.find((c) => c.id === retried.linkedCaseId).rca.preventiveAction, 'Retry this real response');
  assert.equal(second.store.state.watchAlerts.find((a) => a.id === alert.id).status, 'confirmed');
  assert.equal(second.api.retryWatchPromotion(alert.id).linkedCaseId, retried.linkedCaseId);
});

test('resilience case lifecycle emits without inventing a steward owner, FMEA or case estimates', () => {
  const { store, api } = harness();
  const person = api.addPerson({ name: 'Continuity steward' });
  const dep = api.addDependency({ name: 'Critical service', kind: 'service', criticality: 'critical', ttsDays: 1, ttrDays: 3,
    stewards: [{ personId: person.id, role: 'primary', verifiedOn: '2026-10-01' }] });
  assert.ok(dep.ok, dep.error);
  const drill = api.recordContinuityDrill(dep.id, { date: '2026-10-27', kind: 'failover-drill', estimatedTtrDays: 2,
    realizedTtrDays: 4, outcome: 'breached-tolerance', scenario: 'Failover rehearsal' });
  assert.ok(drill.ok, drill.error);
  const edge = store.state.links.find((l) => l.sourceType === 'case' && l.targetType === 'dependency' && l.targetId === dep.id && l.relation === 'continuity-tests');
  assert.ok(edge);
  const c = store.state.cases.find((row) => row.id === edge.sourceId);
  assert.equal(c.ownerId, null);
  assert.equal(isFmeaRated(c.fmea), false);
  assert.equal(c.financial.mostLikely, 0);
  assert.equal(c.financial.capacityDaysMostLikely, 0);
  assert.equal(c.forecastSnapshot || null, null);
  assert.ok(store.state.events.some((e) => e.type === 'case.created' && e.entityId === c.id && /Derived/.test(e.summary)));
});

test('direct case options remain effective while opening forecasts still freeze', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Recorded owner' });
  const added = api.addCase({ title: 'Explicitly limited fan-out', kind: 'risk', ownerId: owner.id,
    openedOn: '2026-10-28', fmea: { severity: 9, probability: 8, detectability: 7 },
    financial: { currency: 'USD', optimistic: 100, mostLikely: 200, pessimistic: 300 },
    rca: { preventiveAction: 'Review system safeguards' }, propagateDecision: false, propagateDelegation: false });
  assert.ok(added.ok, added.error);
  const c = store.state.cases.find((row) => row.id === added.id);
  assert.ok(c.forecastSnapshot);
  const links = store.state.links.filter((l) => l.sourceId === c.id && l.sourceType === 'case');
  assert.ok(!links.some((l) => ['decision', 'delegation'].includes(l.targetType)));
  assert.ok(added.propagations.some((p) => p.ruleId === 'RULE-FCT-03'));
});

test('source-action secondary records emit lifecycle events without exposing prior state to rules', () => {
  const delivered = [];
  const { store } = harness(memory(), [(draft, ctx) => {
    assert.equal(Object.hasOwn(ctx, 'previousState'), false);
    delivered.push(ctx.event?.type);
  }]);
  store.update((d) => { d.decisions.push({ id: 'source-decision', title: 'Source-created record' }); },
    { type: 'case.updated', entity: 'case', entityId: 'c' });
  assert.deepEqual(delivered, ['case.updated', 'decision.created']);
  assert.ok(store.state.events.some((e) => e.type === 'decision.created' && e.entityId === 'source-decision'));
});

test('a failed case subscriber can be refreshed without reopening the alert or losing context', () => {
  function brokenCase(draft, ctx) {
    if (ctx.event?.type !== 'case.created') return [];
    draft.delegations.push({ id: 'partial' });
    throw new Error('injected case subscriber failure');
  }
  const storage = memory(); const first = harness(storage, [earlyWarningRule, brokenCase]);
  first.store.seedDemo();
  const alert = first.store.state.watchAlerts.find((a) => a.status === 'open');
  const owner = first.store.state.people.find((p) => p.status === 'active');
  const created = first.api.triageWatchAlert(alert.id, { verdict: 'confirmed', response: {
    ownerId: owner.id, responseAction: 'Investigate the recorded issue', createDecision: true,
  } });
  assert.ok(created.linkedCaseId);
  assert.ok(created.automationWarnings > 0);
  assert.ok(!first.store.state.delegations.some((d) => d.id === 'partial'));
  const second = harness(storage);
  const refreshed = second.api.retryWatchPromotion(alert.id);
  assert.equal(refreshed.linkedCaseId, created.linkedCaseId);
  assert.equal(refreshed.automationWarnings, 0);
  assert.ok(second.store.state.links.some((l) => l.sourceId === created.linkedCaseId && l.targetType === 'decision'));
  assert.ok(second.store.state.links.some((l) => l.sourceId === created.linkedCaseId && l.targetType === 'delegation'));
  assert.equal(second.store.state.watchAlerts.find((a) => a.id === alert.id).status, 'confirmed');
});

test('Watch policy validation describes q as nominal, not a guaranteed false-alert share', () => {
  const { api } = harness();
  const result = api.setWatchPolicy({ q: 0 });
  assert.equal(result.ok, false);
  assert.match(result.error, /nominal/i);
  assert.match(result.error, /not a guaranteed/i);
});

test('derived decision delivery prices only related decisions, without sweeping unrelated tempo debt', () => {
  const { store, api } = harness();
  store.seedDemo();
  const beforeDecisions = new Set(store.state.decisions.map((decision) => decision.id));
  const beforeDelegations = new Set(store.state.delegations.map((delegation) => delegation.id));
  const result = api.rescanNetwork();
  assert.equal(result.ok, true);
  const newDecisions = store.state.decisions.filter((decision) => !beforeDecisions.has(decision.id));
  assert.equal(newDecisions.filter((decision) => /\[RULE-ORG-03:/.test(decision.question || '')).length, 1);
  assert.equal(newDecisions.some((decision) => /\[RULE-DLY-05:/.test(decision.question || '')), false,
    'a new network decision must not trigger a class-wide tempo policy scan');
  const newDelegations = store.state.delegations.filter((delegation) => !beforeDelegations.has(delegation.id));
  assert.equal(newDelegations.some((delegation) => /\[RULE-DLY-02:/.test(delegation.support || '')), false,
    'unrelated overdue timeboxes must not be swept by a derived creation');
  assert.ok(store.state.events.some((event) => event.type === 'decision.created' && /Derived/.test(event.summary)));
});
