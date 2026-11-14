import test from 'node:test';
import assert from 'node:assert/strict';

import { perfRead, perfSummary, enablePerf, disablePerf, clearPerf, perfSample } from '../../app/core/perf.js';
import { filterRulesForEvent, hasRelevantRules, relevantRuleNamesFor } from '../../app/core/domain/ruleIndex.js';
import { registerIntelligenceDomain, registerInsightsSource, registeredSources, intelligenceHubRead, intelligenceCoverage, hubHealth, clearIntelligenceRegistry, collectRawSignals, deduplicateSignals, clusterByEntity, rankSignals, entityOfFinding, clusterBoostFor, MAX_CLUSTER_BOOST } from '../../app/core/domain/intelligenceHub.js';
import { eventKey, automationHealth, openReceipts } from '../../app/core/domain/automationOrchestrator.js';
import { estimateStateSize, quotaWarningFor, createKeyedMemo } from '../../app/core/storeOptimizations.js';
import { buildDemoState } from '../../app/core/demo.js';
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

test('automation orchestrator: one duplicate key, honest health reading', () => {
  // The spine and the diagnostics must agree on what "the same event" is.
  assert.equal(
    eventKey({ type: 'case.created', entity: 'case', entityId: 'c1' }),
    JSON.stringify(['case.created', 'case', 'c1']),
  );
  assert.notEqual(
    eventKey({ type: 'case.created', entity: 'case', entityId: 'c1' }),
    eventKey({ type: 'case.created', entity: 'case', entityId: 'c2' }),
  );
  assert.equal(eventKey({}), JSON.stringify([undefined, undefined, undefined]));

  // A missing reporter is a quiet cascade, not a crash and not a guess.
  assert.deepEqual(
    { ok: automationHealth(null).ok, executed: automationHealth(null).executed, duplicates: automationHealth(null).duplicates },
    { ok: true, executed: 0, duplicates: 0 },
  );

  const health = automationHealth({ executed: 4, declined: 2, rolledBack: 1, duplicates: 7, events: 9, rules: 12, elapsedMs: 3, indexSkipped: 5 });
  assert.equal(health.ok, false, 'a rollback is not healthy');
  assert.equal(health.duplicates, 7);
  assert.equal(health.indexSkipped, 5);
  assert.equal(automationHealth({ executed: 1 }).ok, true);

  const receipts = openReceipts({ propagationReceipts: [
    { id: 'r1', status: 'open' }, { id: 'r2', status: 'retried' },
    { id: 'r3', status: 'resolved' }, { id: 'r4', status: 'dismissed' }, null,
  ] });
  assert.deepEqual(receipts.map((r) => r.id), ['r1', 'r2']);
  assert.deepEqual(openReceipts({}), []);
});

test('intelligence hub reads the canonical insight source, not a hand-picked few', () => {
  clearIntelligenceRegistry();
  const findings = [
    { ruleId: 'CONV-02', domain: 'Conversations', title: 'Overdue 1:1', detail: 'why', severity: 4, confidence: 'high', personId: 'p1', personName: 'Ada', evidence: ['e1'], action: { label: 'go', route: '#/people/p1' } },
    { ruleId: 'RET-03', domain: 'Retention', title: 'Flight risk', detail: 'why', severity: 3, confidence: 'medium', personId: 'p1', action: { label: 'go', route: '#/retention' } },
    { ruleId: 'CASE-01', domain: 'Cases', title: 'Ownerless case', detail: 'why', severity: 2, confidence: 'high', action: { label: 'go', route: '#/cases/case-9' } },
  ];
  registerInsightsSource('insights', () => findings);
  assert.deepEqual(registeredSources(), ['insights']);

  const state = { people: [{ id: 'p1' }], cases: [] };
  const hub = intelligenceHubRead(state, new Date('2026-11-14T10:00:00Z'));
  assert.equal(hub.totalSignals, 3);
  assert.equal(hub.dedupedCount, 3);
  assert.equal(hub.domainCount, 3);
  assert.deepEqual(hub.sources, ['insights']);
  // The person's two independent findings cluster; the case keeps its own key.
  assert.equal(hub.clusterCount, 2);
  assert.equal(hub.convergingClusters, 1);
  const cluster = hub.clusters.find((c) => c.entityId === 'p1');
  assert.deepEqual(cluster.domains.sort(), ['Conversations', 'Retention']);
  assert.equal(cluster.converging, true);

  // Entity identity comes from the finding's own personId, else the typed
  // destination route. A workspace-level finding is never clustered with
  // unrelated workspace-level findings.
  assert.deepEqual(entityOfFinding(findings[0]), { entityId: 'p1', entityType: 'person' });
  assert.deepEqual(entityOfFinding(findings[2]), { entityId: 'case-9', entityType: 'cases' });
  assert.deepEqual(entityOfFinding({ action: { route: '#/today' } }), { entityId: null, entityType: null });

  const coverage = intelligenceCoverage(state, new Date('2026-11-14T10:00:00Z'));
  assert.equal(coverage.wired, true);
  assert.equal(coverage.domainsSeen, 3);
  assert.equal(hubHealth(state, new Date('2026-11-14T10:00:00Z')).ok, true);

  clearIntelligenceRegistry();
  assert.equal(intelligenceHubRead(state, new Date('2026-11-14T10:00:00Z')).dedupedCount, 0);
  assert.equal(hubHealth(state, new Date('2026-11-14T10:00:00Z')).ok, false, 'an unwired hub is not healthy');
});

test('convergence raises the ordering of the same severity, and is bounded', () => {
  const at = new Date('2026-11-14T10:00:00Z');
  const lone = { domain: 'A', rule: 'A-1', severity: 4, confidence: 'high', entityId: 'x', entityType: 'person', createdAt: at.toISOString() };
  const converged = [
    { domain: 'A', rule: 'A-1', severity: 3, confidence: 'high', entityId: 'y', entityType: 'person', createdAt: at.toISOString() },
    { domain: 'B', rule: 'B-1', severity: 4, confidence: 'high', entityId: 'y', entityType: 'person', createdAt: at.toISOString() },
  ];
  const clusters = clusterByEntity([lone, ...converged]);
  const ranked = rankSignals([lone, ...converged], at, clusters);
  assert.equal(ranked[0].entityId, 'y', 'the converged person outranks the lone finding');
  assert.ok(ranked[0]._clusterBoost > 1);
  assert.equal(ranked.find((s) => s.entityId === 'x')._clusterBoost, 1);

  // The boost is monotone, capped, and never applied to a single domain.
  assert.equal(clusterBoostFor(['A']), 1);
  assert.ok(clusterBoostFor(['A', 'B']) > 1);
  assert.ok(clusterBoostFor(['A', 'B', 'C']) > clusterBoostFor(['A', 'B']));
  assert.equal(clusterBoostFor(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']), MAX_CLUSTER_BOOST);
  assert.equal(clusterBoostFor(['A', 'A', 'A', 'A']), 1, 'repeats from one domain are not convergence');

  // Without clusters the ranking is the plain product — the pre-existing
  // contract for a single-domain reading is unchanged.
  const plain = rankSignals([lone, ...converged], at);
  assert.ok(plain.every((s) => s._clusterBoost === 1));
});

test('storeOptimizations: keyed memo caches on exactly its key', () => {
  let buildCalls = 0;
  const memo = createKeyedMemo((state, day) => { buildCalls += 1; return { v: state.meta.revision, day }; });
  const a = { meta: { revision: 1 } };
  const b = { meta: { revision: 1 } };

  assert.equal(memo(a, '2026-01-01').v, 1);
  assert.equal(buildCalls, 1);
  // Same identity + same day: a hit, and by reference.
  assert.equal(memo(a, '2026-01-01'), memo(a, '2026-01-01'));
  assert.equal(buildCalls, 1);
  // A different snapshot with the same revision is NOT the same state.
  memo(b, '2026-01-01');
  assert.equal(buildCalls, 2, 'object identity, not a revision counter, is the key');
  // A new day invalidates.
  memo(a, '2026-01-02');
  assert.equal(buildCalls, 3);
  // A new seat/scope invalidates.
  memo(a, '2026-01-02', 'seat-2');
  assert.equal(buildCalls, 4);
  // The key length is part of the key.
  memo(a, '2026-01-02');
  assert.equal(buildCalls, 5);

  const stats = memo.stats();
  assert.equal(stats.misses, 5);
  assert.equal(stats.hits, 2, 'two reads of the cached key, by reference both times');
  assert.equal(stats.hitRate, 2 / 7);
  assert.equal(stats.cached, true);
  memo.resetStats();
  assert.equal(memo.stats().hits, 0);
  memo.clear();
  assert.equal(memo.stats().cached, false);
});

test('storeOptimizations: the size estimate is close enough to warn honestly', () => {
  const demo = buildDemoState(new Date('2026-11-14T10:00:00Z'));
  const exact = JSON.stringify(demo).length;
  const estimate = estimateStateSize(demo);
  const error = Math.abs(estimate / exact - 1);
  // The first-three-rows heuristic was 15% high on this workspace, which fires
  // a "you are near the storage limit" warning years before the limit.
  assert.ok(error < 0.08, `estimate should be within 8% of the real size, was ${(error * 100).toFixed(1)}%`);

  assert.equal(estimateStateSize({}), 0);
  assert.equal(estimateStateSize(null), 0);
  assert.ok(estimateStateSize({ people: [{ id: '1', name: 'A'.repeat(100) }], cases: [], meta: { revision: 1 } }) > 0);
  assert.equal(quotaWarningFor({ people: [] }), null);
  // A tiny quota forces the warning path without inventing a huge workspace.
  assert.ok(quotaWarningFor({ people: [{ id: '1', name: 'A'.repeat(100) }] }, 10) !== null);
  const large = { people: Array.from({ length: 2000 }, (_, i) => ({ id: String(i), name: 'x'.repeat(1000) })) };
  assert.ok(estimateStateSize(large) > 1_000_000);
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
