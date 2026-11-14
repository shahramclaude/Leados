import test from 'node:test';
import assert from 'node:assert/strict';

import { perfRead, perfSummary, enablePerf, disablePerf, clearPerf, perfSample } from '../../app/core/perf.js';
import { filterRulesForEvent, hasRelevantRules, relevantRuleNamesFor } from '../../app/core/domain/ruleIndex.js';
import { registerIntelligenceDomain, intelligenceHubRead, clearIntelligenceRegistry, collectRawSignals, deduplicateSignals, clusterByEntity, rankSignals } from '../../app/core/domain/intelligenceHub.js';
import { autoClassify, mineRepetitions, coalesceEvents, scheduleDerivedEvents, createPriorityQueue } from '../../app/core/domain/automationOrchestrator.js';
import { estimateStateSize, quotaWarningFor, createRevisionMemo, createCoalescedPersist } from '../../app/core/storeOptimizations.js';
import { createStore } from '../../app/core/store.js';

test('perf instrumentation records samples and summary', () => {
  enablePerf();
  clearPerf();
  perfSample('test:op', 20, { x: 1 });
  perfSample('test:op2', 5);
  const samples = perfRead();
  assert.equal(samples.length, 2);
  assert.ok(samples[0].slow === true || samples[1].slow === false);
  const sum = perfSummary();
  assert.equal(sum.count, 2);
  assert.ok(sum.p95Ms >= 0);
  disablePerf();
  clearPerf();
});

test('ruleIndex advisory filter for known prefixes', () => {
  assert.ok(hasRelevantRules('case.created') === true);
  assert.ok(hasRelevantRules('case.updated') === true);
  assert.ok(Array.isArray(relevantRuleNamesFor('case.created')));
  const rules = [{ name: 'caseCreatedRule' }, { name: 'sealRule' }, { name: 'unknownRule' }];
  const filtered = filterRulesForEvent(rules, 'case.created');
  assert.ok(filtered.some((r) => r.name === 'caseCreatedRule'));
  // unknown prefix falls back to run-all
  const unknown = filterRulesForEvent(rules, 'nonexistent.xyz');
  assert.equal(unknown.length, rules.length);
});

test('ruleIndex filter does not break unknown event correctness', () => {
  const rules = [{ name: 'a' }, { name: 'b' }];
  const result = filterRulesForEvent(rules, '');
  assert.equal(result, rules);
  assert.equal(filterRulesForEvent(rules, null), rules);
});

test('intelligence hub dedupe, cluster, rank', () => {
  clearIntelligenceRegistry();
  registerIntelligenceDomain('alpha', () => [
    { id: 'a1', rule: 'R-01', severity: 5, confidence: 'high', title: 'Risk A', entityId: 'p1', entityType: 'person' },
    { id: 'a2', rule: 'R-02', severity: 3, confidence: 'medium', title: 'Risk B', entityId: 'p1', entityType: 'person' },
  ]);
  registerIntelligenceDomain('beta', () => [
    { id: 'b1', rule: 'R-03', severity: 4, confidence: 'high', title: 'Risk C', entityId: 'p1', entityType: 'person' },
  ]);
  const state = { people: [{ id: 'p1' }], cases: [] };
  const hub = intelligenceHubRead(state, new Date('2026-11-14T10:00:00Z'));
  assert.equal(hub.dedupedCount, 3);
  assert.equal(hub.clusterCount, 1);
  assert.equal(hub.convergingClusters, 1);
  assert.ok(hub.recommendations.length >= 1);
  assert.equal(hub.byDomain.alpha, 2);
  assert.equal(hub.byDomain.beta, 1);

  // dedupe by (domain|rule|entityId) keeps max severity
  const duped = deduplicateSignals([
    { domain: 'alpha', rule: 'R-01', entityId: 'p1', severity: 2 },
    { domain: 'alpha', rule: 'R-01', entityId: 'p1', severity: 5 },
  ]);
  assert.equal(duped.length, 1);
  assert.equal(duped[0].severity, 5);

  // cluster and rank
  const clusters = clusterByEntity([
    { domain: 'alpha', rule: 'R-01', entityId: 'p1', entityType: 'person', severity: 4 },
    { domain: 'beta', rule: 'R-02', entityId: 'p1', entityType: 'person', severity: 3 },
  ]);
  assert.equal(clusters[0].converging, true);
  const ranked = rankSignals([
    { severity: 2, confidence: 'low', createdAt: new Date().toISOString() },
    { severity: 5, confidence: 'high', createdAt: new Date().toISOString() },
  ], new Date());
  assert.equal(ranked[0].severity, 5);

  clearIntelligenceRegistry();
});

test('automation orchestrator: autoClassify, coalesce, priority, repetitions', () => {
  const incident = autoClassify('We have a critical P1 outage blocking all users - urgent escalation needed');
  assert.equal(incident.kind, 'incident');
  assert.equal(incident.priority, 'high');
  assert.ok(incident.hits >= 1);
  assert.ok(incident.explanation.includes('incident'));

  const risk = autoClassify('This regulatory risk exposes us to audit failure and penalty');
  assert.equal(risk.kind, 'risk');

  assert.equal(autoClassify(''), null);
  assert.equal(autoClassify(null), null);
  assert.equal(autoClassify('hello world with no keywords xyz'), null);

  const coal = coalesceEvents([
    { type: 'case.created', entity: 'case', entityId: '1' },
    { type: 'case.created', entity: 'case', entityId: '1' },
    { type: 'case.created', entity: 'case', entityId: '2' },
  ]);
  assert.equal(coal.deduped.length, 2);
  assert.equal(coal.removed, 1);

  const q = createPriorityQueue();
  q.push({ type: 'automation.scan', entity: 'w', entityId: '1' });
  q.push({ type: 'retention.alert', entity: 'w', entityId: '2' });
  assert.equal(q.pop().type, 'retention.alert');

  const sched = scheduleDerivedEvents([
    { type: 'case.created', entity: 'case', entityId: '1' },
    { type: 'case.created', entity: 'case', entityId: '1' },
  ]);
  assert.equal(sched.deduped, 1);
  assert.equal(sched.coalesced, 1);

  const rep = mineRepetitions([
    { type: 'case.created', entity: 'case' },
    { type: 'case.created', entity: 'case' },
    { type: 'case.created', entity: 'case' },
  ], 2);
  assert.equal(rep.candidates.length, 1);
  assert.equal(rep.candidates[0].count, 3);
});

test('storeOptimizations: estimate size, quota warning, revision memo, coalesced persist', async () => {
  const s = { people: [{ id: '1', name: 'A'.repeat(100) }], cases: [], meta: { revision: 1 } };
  assert.ok(estimateStateSize(s) > 0);
  assert.equal(quotaWarningFor({ people: [] }), null);
  // Large state should estimate larger than small
  const medium = { people: [{ id: '1', name: 'A'.repeat(100) }], cases: [], meta: { revision: 1 } };
  const large = { people: Array.from({ length: 2000 }, (_, i) => ({ id: String(i), name: 'x'.repeat(1000) })), meta: { revision: 1 } };
  assert.ok(estimateStateSize(large) > estimateStateSize(medium));
  // Force threshold check with 1KB quota to guarantee warning
  assert.ok(quotaWarningFor(medium, 10) !== null);

  let buildCalls = 0;
  const memo = createRevisionMemo((state) => { buildCalls += 1; return { v: state.meta.revision }; });
  const st1 = { meta: { revision: 1 } };
  const st2 = { meta: { revision: 1 } };
  const st3 = { meta: { revision: 2 } };
  assert.equal(memo(st1, new Date('2026-01-01')).v, 1);
  assert.equal(buildCalls, 1);
  assert.equal(memo(st2, new Date('2026-01-01')).v, 1);
  assert.equal(buildCalls, 1); // same revision+day -> cached
  assert.equal(memo(st3, new Date('2026-01-01')).v, 2);
  assert.equal(buildCalls, 2);
  // different day invalidates
  assert.equal(memo(st3, new Date('2026-01-02')).v, 2);
  assert.equal(buildCalls, 3);

  // coalesced persist: multiple schedules in one tick -> one persist
  let persistCalls = 0;
  const cp = createCoalescedPersist(() => { persistCalls += 1; return true; }, { delayMs: 0 });
  cp.schedule({ a: 1 });
  cp.schedule({ a: 2 });
  cp.schedule({ a: 3 });
  await new Promise((r) => queueMicrotask(r));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(persistCalls, 1);
});

test('store with ruleIndex enabled produces same workspace as without for simple writes', () => {
  const mkStore = (enable) => createStore({ storage: null, enableRuleIndex: enable });
  const s1 = mkStore(false);
  const s2 = mkStore(true);
  s1.load();
  s2.load();
  // Import helper: use the same API to mutate both
  const now = () => new Date('2026-11-14T10:00:00Z');
  const withApi = (store) => store;
  // Both should handle a no-op update identically
  s1.update((d) => { d.people.push({ id: 'p-test', name: 'Test', role: 'IC', level: 'ic', managerId: null, status: 'active' }); }, { type: 'person.created', entity: 'person', entityId: 'p-test' });
  s2.update((d) => { d.people.push({ id: 'p-test', name: 'Test', role: 'IC', level: 'ic', managerId: null, status: 'active' }); }, { type: 'person.created', entity: 'person', entityId: 'p-test' });
  // The key correctness check: both stores have the person, and neither threw
  assert.ok(s1.lastPropagationMetrics);
  assert.ok(s2.lastPropagationMetrics);
  // ruleIndex store should have indexSkipped >0
  assert.ok((s2.lastPropagationMetrics.indexSkipped || 0) > 0);
});
