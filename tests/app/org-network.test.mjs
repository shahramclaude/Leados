/**
 * tests/app/org-network.test.mjs — Influence Network Intelligence suite
 * (Session 48, additive on Schema v30, RULE-ORG-01..05, ORG-01..05,
 * CSV scope #31).
 *
 *   1. Pure graph mathematics verified against textbook graphs: Brandes
 *      betweenness, Freeman centralization, PageRank, Wasserman–Faust
 *      closeness, Burt constraint, clustering, Tarjan articulation/bridges,
 *      Latora–Marchiori efficiency and node-removal criticality.
 *   2. Co-affiliation projection + relative strong-tie backbone: no invented
 *      ties, deterministic, privacy (conflicts/pulses excluded).
 *   3. Report, signals and deterministic board brief.
 *   4. Actions & ATOMIC cross-module propagation: one rescanNetwork fans out
 *      into typed links, a cross-training delegation, a DACI org-design
 *      decision, blameless 1:1 talking points and signals — idempotently,
 *      with pause semantics and self-cleaning prompts.
 *   5. Settings validation + additive schema/normalization parity.
 *   6. CSV scope #31 data minimisation (no names, no free text).
 *   7. JSDOM + axe-core across all five tabs and the empty state.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, normalizeSettings, DEFAULT_SETTINGS, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  ORG_ENGINE_VERSION,
  ORG_MIN_TEAM,
  ORG_RULES,
  buildNetworkReport,
  buildNetworkBrief,
  networkSignals,
  networkRule,
  collectAffiliations,
  sharedPairCounts,
  resolveTieFloor,
  projectPersonGraph,
  degreeCentrality,
  betweennessCentrality,
  closenessCentrality,
  pageRankCentrality,
  clusteringCoefficient,
  burtConstraint,
  graphDensity,
  connectedComponents,
  articulationPointsAndBridges,
  networkEfficiency,
  removalImpact,
  networkLayout,
  stewardshipFusion,
  bfsDistances,
} from '../../app/core/domain/orgNetwork.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-27T10:00:00.000Z');
const TODAY = '2026-10-27';

function kvStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}
function harness(now = NOW) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-net-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}
function demoHarness() {
  const env = harness();
  assert.equal(env.store.seedDemo().ok, true);
  return env;
}

/** Build a tiny synthetic graph object for pure-math assertions. */
function graph(ids, edges) {
  const adjacency = new Map(ids.map((id) => [id, new Map()]));
  for (const [a, b, w] of edges) {
    adjacency.get(a).set(b, w || 1);
    adjacency.get(b).set(a, w || 1);
  }
  return { ids, adjacency, edges: edges.map(([a, b, w]) => ({ a, b, weight: w || 1 })) };
}

/** A minimal state with n people and explicit shared contexts (via links). */
function stateWithPeople(n, linkSpecs = []) {
  const state = createEmptyState(NOW.toISOString());
  state.people = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`, name: `Person ${i + 1}`, role: 'IC', team: 'X', managerId: null,
    startDate: '2024-01-01', focus: '', talkingPoints: [], status: 'active',
    createdAt: NOW.toISOString(), archivedAt: null,
  }));
  state.links = linkSpecs.map(([sType, sId, tType, tId, relation], i) => ({
    id: `lnk${i}`, sourceType: sType, sourceId: sId, targetType: tType, targetId: tId,
    relation: relation || 'involves', ruleId: '', summary: '', createdOn: TODAY, createdAt: NOW.toISOString(),
  }));
  return state;
}

/* ========================================================== 1. graph maths */

test('Brandes betweenness + Freeman centralization: path and star are exact', () => {
  const path = graph(['A', 'B', 'C', 'D'], [['A', 'B'], ['B', 'C'], ['C', 'D']]);
  const pb = betweennessCentrality(path);
  assert.equal(pb.normalized.get('B'), 0.6667);
  assert.equal(pb.normalized.get('C'), 0.6667);
  assert.equal(pb.normalized.get('A'), 0);
  assert.equal(pb.centralization, 0.4444); // 4/9

  const star = graph(['O', 'L1', 'L2', 'L3'], [['O', 'L1'], ['O', 'L2'], ['O', 'L3']]);
  const sb = betweennessCentrality(star);
  assert.equal(sb.normalized.get('O'), 1, 'star centre lies on every shortest path');
  assert.equal(sb.normalized.get('L1'), 0);
  assert.equal(sb.centralization, 1, 'star is maximally centralised');

  const k4 = graph(['A', 'B', 'C', 'D'], [['A', 'B'], ['A', 'C'], ['A', 'D'], ['B', 'C'], ['B', 'D'], ['C', 'D']]);
  assert.deepEqual([...betweennessCentrality(k4).normalized.values()], [0, 0, 0, 0], 'complete graph has no broker');
  assert.equal(graphDensity(k4), 1);
});

test('PageRank, closeness, constraint, clustering, efficiency are exact on textbook graphs', () => {
  const star = graph(['O', 'L1', 'L2', 'L3'], [['O', 'L1'], ['O', 'L2'], ['O', 'L3']]);
  const pr = pageRankCentrality(star);
  assert.ok(pr.get('O') > 0.47 && pr.get('O') < 0.49, 'centre PageRank ≈ 0.48');
  const sum = [...pr.values()].reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum - 1) < 0.01, 'PageRank is a probability distribution');
  assert.equal(closenessCentrality(star).get('O'), 1);
  assert.equal(closenessCentrality(star).get('L1'), 0.6);
  assert.equal(burtConstraint(star).get('O'), 0.3333, 'star centre spans 3 structural holes -> constraint 1/k');
  assert.equal(burtConstraint(star).get('L1'), 1, 'a leaf with one alter is fully constrained');
  assert.equal(clusteringCoefficient(star).get('O'), 0);
  assert.equal(clusteringCoefficient(graph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['A', 'C']])).get('A'), 1, 'triangle cliques cluster fully');
  assert.equal(networkEfficiency(star.adjacency, star.ids), 0.75);
  assert.deepEqual(bfsDistances(star.adjacency, 'L1').get('L2'), 2);
});

test('Tarjan articulation/bridges + node-removal criticality are exact', () => {
  const star = graph(['O', 'L1', 'L2', 'L3'], [['O', 'L1'], ['O', 'L2'], ['O', 'L3']]);
  const art = articulationPointsAndBridges(star);
  assert.deepEqual([...art.articulation], ['O']);
  assert.equal(art.bridges.length, 3);
  assert.deepEqual(connectedComponents(star), [['L1', 'L2', 'L3', 'O']].map((c) => c.slice().sort()));

  const ri = removalImpact(star, 'O');
  assert.equal(ri.componentsBefore, 1);
  assert.equal(ri.componentsAfter, 3);
  assert.equal(ri.fragmentsBy, 2);
  assert.equal(ri.efficiencyLoss, 1);
  assert.equal(ri.isolatesAfter, 3);
  assert.equal(removalImpact(star, 'L1').fragmentsBy, 0, 'removing a leaf does not fragment');
});

test('degree centrality & graphDensity on a weighted path are normalised correctly', () => {
  const g = graph(['A', 'B', 'C'], [['A', 'B', 3], ['B', 'C', 1]]);
  const d = degreeCentrality(g);
  assert.equal(d.get('B').degree, 2);
  assert.equal(d.get('B').degreeNorm, 1);
  assert.equal(d.get('B').strength, 4);
  assert.equal(d.get('A').degreeNorm, 0.5);
  assert.equal(graphDensity(g), 0.6667);
});

/* ============================================= 2. projection & backbone */

test('co-affiliation projection never invents ties and is deterministic', () => {
  // Two cases, each linking two people -> one person-person tie of weight 2.
  const s = stateWithPeople(3, [
    ['case', 'c1', 'person', 'p1', 'coaches'],
    ['case', 'c1', 'person', 'p2', 'coaches'],
    ['decision', 'd1', 'person', 'p1', 'decides'],
    ['decision', 'd1', 'person', 'p2', 'decides'],
    ['goal', 'g1', 'person', 'p3', 'impacts-goal'],
  ]);
  const aff = collectAffiliations(s);
  const shared = sharedPairCounts(aff);
  assert.equal(shared.size, 1, 'only p1-p2 actually co-appear; p3 is in a singleton context -> no invented pairs');
  const p12 = [...shared.values()].find((e) => (e.a === 'p1' && e.b === 'p2'));
  assert.equal(p12.count, 2, 'p1 & p2 co-appear in 2 contexts');
  const g = projectPersonGraph(aff, { minShared: 2 });
  assert.equal(g.edges.length, 1, 'only the strong p1-p2 tie survives a floor of 2');
  assert.equal(g.edges[0].weight, 2);
  assert.equal(g.adjacency.get('p3').size, 0, 'p3 is isolated');
  assert.ok(g.edges.every((e) => e.a !== e.b), 'no self-edges');
});

test('collectAffiliations excludes confidential conflict/pulse endpoints', () => {
  const s = stateWithPeople(2, []);
  s.conflicts = [{ id: 'conf1', personId: 'p1', notes: 'private', status: 'open' }];
  s.pulses = [{ id: 'pulse1', personId: 'p1', score: 3 }];
  s.links.push(
    { id: 'good', sourceType: 'case', sourceId: 'c1', targetType: 'person', targetId: 'p1', relation: 'coaches', ruleId: '', summary: '', createdOn: TODAY, createdAt: NOW.toISOString() },
    { id: 'good2', sourceType: 'case', sourceId: 'c1', targetType: 'person', targetId: 'p2', relation: 'coaches', ruleId: '', summary: '', createdOn: TODAY, createdAt: NOW.toISOString() },
    { id: 'bad', sourceType: 'conflict', sourceId: 'conf1', targetType: 'person', targetId: 'p2', relation: 'coaches', ruleId: '', summary: '', createdOn: TODAY, createdAt: NOW.toISOString() },
  );
  const aff = collectAffiliations(s);
  assert.ok(aff.contexts.length >= 1, 'the legitimate case context is present');
  assert.equal(aff.contexts.some((c) => c.key.includes('conf1')), false, 'conflict link never enters the general work graph');
  assert.ok(aff.contexts.every((c) => !c.people.has('p2') || c.key.startsWith('case:')), 'p2 is not affiliated via the forbidden conflict edge');
});

test('relative strong-tie backbone resolves a data-driven floor; empty/uniform graphs stay honest', () => {
  const s = stateWithPeople(4, []);
  // Fabricate affiliations with a clear weight gradient via repeated contexts.
  const aff = {
    people: s.people,
    personIds: new Set(s.people.map((p) => p.id)),
    contexts: [
      { key: 'k1', type: 'case', label: '', people: new Set(['p1', 'p2']) },
      { key: 'k2', type: 'case', label: '', people: new Set(['p1', 'p2']) },
      { key: 'k3', type: 'case', label: '', people: new Set(['p1', 'p2']) },
      { key: 'k4', type: 'case', label: '', people: new Set(['p1', 'p2']) },
      { key: 'k5', type: 'case', label: '', people: new Set(['p2', 'p3']) },
    ],
  };
  const tie = resolveTieFloor(aff, { networkTiePct: 50 }, { minShared: 1 });
  assert.equal(tie.maxWeight, 4);
  assert.equal(tie.relative, 2, '50% of the max weight 4 -> floor 2');
  assert.equal(tie.floor, 2);
  const g = projectPersonGraph(aff, { minShared: tie.floor });
  assert.deepEqual(g.edges.map((e) => [e.a, e.b]), [['p1', 'p2']], 'the weak p2-p3 tie is pruned');
  assert.equal(g.adjacency.get('p4').size, 0, 'p4 with no context stays isolated — nothing fabricated');

  // A workspace with fewer than ORG_MIN_TEAM people is unmeasurable (not zero).
  const tiny = buildNetworkReport(stateWithPeople(1, []), NOW);
  assert.equal(tiny.ok, false);
  assert.equal(tiny.analysis.reason, 'too-few-people');
  assert.equal(tiny.totals.attention, 0);
  assert.equal(ORG_MIN_TEAM, 2);
});

test('networkLayout is deterministic and finite', () => {
  const g = graph(['A', 'B', 'C', 'D'], [['A', 'B', 3], ['B', 'C', 2], ['C', 'D', 1], ['A', 'D', 1]]);
  const l1 = networkLayout(g);
  const l2 = networkLayout(g);
  for (const id of g.ids) {
    assert.equal(l1.get(id).x, l2.get(id).x, 'deterministic x');
    assert.equal(l1.get(id).y, l2.get(id).y, 'deterministic y');
    assert.ok(Number.isFinite(l1.get(id).x) && Number.isFinite(l1.get(id).y));
    assert.ok(l1.get(id).x >= 0 && l1.get(id).x <= 1 && l1.get(id).y >= 0 && l1.get(id).y <= 1);
  }
});

/* ================================================ 3. report/signals/brief */

test('demo report is rich, deterministic, and structurally sound', () => {
  const state = buildDemoState(NOW);
  const r1 = buildNetworkReport(state, NOW);
  const r2 = buildNetworkReport(state, NOW);
  assert.equal(r1.ok, true);
  assert.equal(r1.analysis.engineVersion, ORG_ENGINE_VERSION);
  assert.equal(JSON.stringify(r1.totals), JSON.stringify(r2.totals), 'deterministic totals');
  assert.ok(r1.analysis.nodeCount >= 5);
  assert.ok(r1.analysis.tieFloor >= 1);
  assert.ok(r1.analysis.graph.edges.length > 0, 'strong-tie backbone is not empty');
  assert.ok(r1.analysis.metrics.density < 1, 'backbone reveals structure (not a complete graph)');
  assert.equal(r1.analysis.perPerson.length, r1.analysis.nodeCount, 'one row per person');
  // PageRank probabilities sum ~1 and every metric is finite.
  const prSum = r1.analysis.perPerson.reduce((s, p) => s + p.pageRank, 0);
  assert.ok(Math.abs(prSum - 1) < 0.01);
  for (const p of r1.analysis.perPerson) {
    for (const v of [p.degree, p.betweenness, p.closeness, p.pageRank, p.clustering, p.impact.efficiencyLoss]) {
      assert.ok(Number.isFinite(v), `${p.name} metrics finite`);
    }
  }
  assert.ok(r1.totals.attention >= 1, 'findings surface as attention');
});

test('signals are one-fact-one-signal, blameless, and wired into buildInsights', () => {
  const state = buildDemoState(NOW);
  const signals = networkSignals(state, NOW);
  assert.ok(signals.length >= 2);
  const ids = new Set(signals.map((s) => s.ruleId));
  assert.ok(ids.has('ORG-02') || ids.has('ORG-01'), 'structural key-person or isolate signal present');
  for (const s of signals) {
    assert.equal(s.domain, 'Org network');
    assert.ok(s.action && s.action.route.startsWith('#/network'));
    assert.ok(Array.isArray(s.evidence) && s.evidence.length > 0);
    assert.ok(!/lazy|incompetent|blame/i.test(s.title), 'no blaming language');
  }
  assert.ok(DOMAIN_ORDER.includes('Org network'), 'domain registered for grouping');
  const insights = buildInsights(state, NOW);
  const orgFindings = insights.findings.filter((f) => f.ruleId && f.ruleId.startsWith('ORG-'));
  assert.ok(orgFindings.length >= 2, 'network signals reach the global insights spine');
});

test('board brief is deterministic, privacy-safe, and contains no person rating', () => {
  const state = buildDemoState(NOW);
  const report = buildNetworkReport(state, NOW);
  const b1 = buildNetworkBrief(report);
  const b2 = buildNetworkBrief(report);
  assert.equal(b1, b2);
  assert.ok(b1.includes('No communications'));
  assert.ok(b1.includes('PageRank') || b1.includes('MOST INFLUENTIAL'));
  assert.ok(b1.includes('STRUCTURAL KEY-PERSON STRESS TEST'));
  assert.ok(/conditional, not predictions/.test(b1));
  const emptyBrief = buildNetworkBrief(buildNetworkReport(stateWithPeople(1, []), NOW));
  assert.ok(/cannot be measured/.test(emptyBrief));
});

/* =============================== 4. actions & atomic cross-module propagation */

test('rescanNetwork fans ONE analysis into links, delegation, DACI decision, 1:1s and signals — atomically', () => {
  const { store, api } = demoHarness();
  const before = {
    decisions: store.state.decisions.length,
    delegations: store.state.delegations.length,
    links: store.state.links.length,
  };
  const result = api.rescanNetwork();
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);

  const s = store.state;
  // (a) A DACI org-design decision (RULE-ORG-03).
  const orgDecisions = s.decisions.filter((d) => /\[RULE-ORG-03:/.test(d.question || ''));
  assert.equal(orgDecisions.length, 1, 'exactly one org-design decision');
  assert.ok(Array.isArray(orgDecisions[0].options) && orgDecisions[0].options.length >= 2, 'a real DACI trade-off with options');
  assert.equal(s.decisions.length, before.decisions + 1);

  // (b) A blameless cross-training delegation (RULE-ORG-02).
  const orgDelegations = s.delegations.filter((d) => /\[RULE-ORG-02:/.test(d.support || ''));
  assert.ok(orgDelegations.length >= 1, 'a structural key-person delegation was opened');
  assert.equal(s.delegations.length, before.delegations + orgDelegations.length);
  assert.ok(/resilience, not a performance rating|coordination risk, not a performance rating/.test(orgDelegations[0].support), 'blameless');

  // (c) Typed graph links (RULE-ORG-01, 02, 03).
  const orgLinks = s.links.filter((l) => String(l.ruleId || '').startsWith('RULE-ORG-'));
  assert.ok(orgLinks.length >= 2, 'typed links recorded');
  assert.ok(orgLinks.some((l) => l.relation === 'involves' && l.ruleId === 'RULE-ORG-01'), 'person↔person collaboration link');
  assert.ok(orgLinks.some((l) => l.targetType === 'delegation' && l.relation === 'develops'), 'person→delegation develops link');
  assert.equal(s.links.length, before.links + orgLinks.length);

  // (d) Blameless 1:1 talking points (RULE-ORG-02/04/05).
  const orgTPs = s.people.flatMap((p) => (p.talkingPoints || []).filter((t) => /\[RULE-ORG-/.test(t)));
  assert.ok(orgTPs.length >= 1, '1:1 coaching prompts queued');
  assert.ok(orgTPs.every((t) => /blameless|resilience|coordination risk|check-in/i.test(t)), 'prompts are blameless');

  // (e) Append-only audit trail of every propagation.
  const events = s.events.filter((e) => e.type === 'automation.propagated' && /\[RULE-ORG-/.test(e.summary || ''));
  assert.ok(events.length >= 3, 'each fan-out is audited');
});

test('post-commit spine registers networkRule before decisionTempoRule', () => {
  const names = DEFAULT_POST_COMMIT_RULES.map((r) => r.name);
  assert.ok(names.includes('networkRule'), 'networkRule is on the shared spine');
  assert.ok(names.indexOf('networkRule') < names.indexOf('decisionTempoRule'), 'runs before tempo');
});

test('rescan is idempotent; repeated scans converge and never duplicate artifacts', () => {
  const { store, api } = demoHarness();
  assert.equal(api.rescanNetwork().changed, true);
  const snap = {
    decisions: store.state.decisions.length,
    delegations: store.state.delegations.length,
    links: store.state.links.length,
    tps: store.state.people.flatMap((p) => (p.talkingPoints || []).filter((t) => /RULE-ORG/.test(t))).length,
  };
  const second = api.rescanNetwork();
  assert.equal(second.changed, false, 'second scan changes nothing');
  assert.equal(store.state.decisions.length, snap.decisions);
  assert.equal(store.state.delegations.length, snap.delegations);
  assert.equal(store.state.links.length, snap.links);
  assert.equal(store.state.people.flatMap((p) => (p.talkingPoints || []).filter((t) => /RULE-ORG/.test(t))).length, snap.tps);
  assert.equal(store.state.decisions.filter((d) => /\[RULE-ORG-03:/.test(d.question || '')).length, 1, 'no duplicate decision');
});

test('stale ORG 1:1 prompts self-clean while employee-owned topics survive', () => {
  const { store, api } = demoHarness();
  api.rescanNetwork();
  const jordan = () => store.state.people.find((p) => p.id === 'person-demo-2');
  const owned = jordan().talkingPoints.filter((t) => !/RULE-ORG/.test(t));
  assert.ok(jordan().talkingPoints.some((t) => /RULE-ORG/.test(t)), 'ORG prompt exists');
  // Widen to every real tie -> dense graph -> no isolates/key-persons/findings.
  assert.equal(api.setNetworkTiePct(0).ok, true);
  api.rescanNetwork();
  const orgTPs = store.state.people.flatMap((p) => (p.talkingPoints || []).filter((t) => /RULE-ORG/.test(t)));
  assert.equal(orgTPs.length, 0, 'resolved prompts cleared');
  assert.deepEqual(jordan().talkingPoints, owned, 'employee-authored topics untouched');
});

test('networkAutoPropagate pauses automatic declared events but an explicit scan always runs', () => {
  // ON: a declared rules:['network'] event fans out.
  const on = demoHarness();
  on.store.update(() => {}, { type: 'network.sense', entity: 'workspace', rules: ['network'], summary: 'declared while ON' });
  assert.ok(on.store.state.decisions.some((d) => /\[RULE-ORG-03:/.test(d.question || '')), 'ON declared event propagates');

  // PAUSED: the same declared event does NOT fan out.
  const off = demoHarness();
  assert.equal(off.api.setNetworkAutoPropagate(false).ok, true);
  off.store.update(() => {}, { type: 'network.sense', entity: 'workspace', rules: ['network'], summary: 'declared while paused' });
  assert.equal(off.store.state.decisions.some((d) => /\[RULE-ORG-03:/.test(d.question || '')), false, 'paused declared event does not propagate');
  // An explicit human scan bypasses the pause.
  assert.equal(off.api.rescanNetwork().ok, true);
  assert.ok(off.store.state.decisions.some((d) => /\[RULE-ORG-03:/.test(d.question || '')), 'explicit scan always runs');
});

test('unrelated writes never trigger network propagation (no alert fatigue)', () => {
  const { store, api } = demoHarness();
  const orgBefore = store.state.decisions.filter((d) => /\[RULE-ORG-03:/.test(d.question || '')).length;
  api.addPerson({ name: 'New Joiner', role: 'Engineer', startDate: '2026-01-01' });
  api.addCase({ title: 'A routine case', kind: 'risk' });
  assert.equal(store.state.decisions.filter((d) => /\[RULE-ORG-03:/.test(d.question || '')).length, orgBefore,
    'unrelated person/case writes do not fan out the network rule');
});

test('networkRule is a no-op without a network-significant event', () => {
  const draft = JSON.parse(JSON.stringify(buildDemoState(NOW)));
  const before = draft.links.length + draft.decisions.length + draft.delegations.length;
  const props = networkRule(draft, { event: { type: 'goal.created' }, now: NOW, idFactory: (p) => `${p}-x`, logEvent: () => {} });
  assert.deepEqual(props, []);
  assert.equal(draft.links.length + draft.decisions.length + draft.delegations.length, before);
});

test('stewardshipFusion counts primary stewards and missing verified backups', () => {
  const state = createEmptyState(NOW.toISOString());
  state.dependencies = [
    { id: 'd1', name: 'KMS', stewards: [
      { personId: 'p1', role: 'primary', verifiedOn: '2026-01-01' },
      { personId: 'p2', role: 'backup', verifiedOn: '2026-01-01' },
    ] },
    { id: 'd2', name: 'Billing', stewards: [
      { personId: 'p1', role: 'primary', verifiedOn: '2026-01-01' },
      { personId: 'p3', role: 'trainee', verifiedOn: null },
    ] },
  ];
  const f = stewardshipFusion(state);
  assert.equal(f.get('p1').primaryOf, 2);
  assert.equal(f.get('p1').unverifiedBackup, 1, 'd2 has no verified backup');
});

/* ========================================== 5. settings & schema parity */

test('network settings are additive on Schema v30 and validated/normalised', () => {
  assert.equal(SCHEMA_VERSION, 49, 'v47 adds the scorecard ledger, v43 the after-action review ledger, v42 the after-action review ledger, v42 the strategy coherence portfolio, v41 durable propagation receipts, v40 the watch response context, v39 the early-warning watch; earlier additive migrations are unchanged');
  assert.equal(DEFAULT_SETTINGS.networkTiePct, 50);
  assert.equal(DEFAULT_SETTINGS.networkAutoPropagate, true);

  const { store, api } = harness();
  assert.equal(api.setNetworkTiePct(200).ok, false, 'out-of-range tie focus rejected');
  assert.equal(api.setNetworkTiePct(-5).ok, false);
  assert.equal(api.setNetworkTiePct(30).ok, true);
  assert.equal(api.updateSettings({ networkAutoPropagate: 'yes' }).ok, false, 'non-boolean rejected at the settings boundary');
  // The dedicated toggle coerces by design (mirrors setResilienceAutoPropagate).
  assert.equal(api.setNetworkAutoPropagate(1).ok, true);
  assert.equal(store.state.settings.networkAutoPropagate, true);

  // normalizeSettings fills defaults and clamps corrupt blobs.
  const n = normalizeSettings({ networkTiePct: 999, networkAutoPropagate: false });
  assert.equal(n.networkTiePct, 90);
  assert.equal(n.networkAutoPropagate, false);
  const n2 = normalizeSettings({});
  assert.equal(n2.networkTiePct, 50);
  assert.equal(n2.networkAutoPropagate, true);

  // A normalized empty state carries the new settings with no migration.
  const empty = normalizeState(createEmptyState(NOW.toISOString()), { now: NOW });
  assert.equal(empty.state.settings.networkTiePct, 50);
  assert.equal(empty.state.settings.networkAutoPropagate, true);
});

test('analyzing a demo state never mutates it (pure read-side engine)', () => {
  const state = buildDemoState(NOW);
  const snapshot = JSON.stringify(state);
  buildNetworkReport(state, NOW);
  networkSignals(state, NOW);
  buildNetworkBrief(buildNetworkReport(state, NOW));
  networkLayout(buildNetworkReport(state, NOW).analysis.graph);
  assert.equal(JSON.stringify(state), snapshot, 'engine is pure');
});

/* ============================================== 6. CSV scope #31 */

test('CSV scope #31 is data-minimised: counts/scores only, one row per person', () => {
  assert.equal(CSV_EXPORTS.length, 43);
  const descriptor = CSV_EXPORTS.find((s) => s.key === 'networkTopology');
  assert.ok(descriptor);
  assert.equal(descriptor.sensitive, false);
  const state = buildDemoState(NOW);
  const names = state.people.map((p) => p.name);
  const result = exportWorkspaceCsv(state, 'networkTopology', NOW);
  assert.equal(result.ok, true);
  assert.equal(result.rowCount, state.people.filter((p) => p.status !== 'archived').length);
  assert.ok(result.columnCount >= 20);
  const header = result.csv.split('\r\n')[0];
  assert.ok(!/name|title|note|summary|free.?text/i.test(header), 'no name-bearing columns');
  assert.ok(/^node_index,/.test(header), 'keyed by an opaque index');
  for (const name of names) assert.equal(result.csv.includes(name), false, `no leaked name: ${name}`);
  assert.ok(result.csv.includes('engine_version'));
  assert.equal(AUTOMATION_RULES.length, 119, '+ LCS rules');
  assert.ok(ORG_RULES.length === 5 && ORG_RULES.every((r) => r.id.startsWith('RULE-ORG-')));
});

/* ============================================== 7. UI (jsdom + axe) */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}
async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const r = await env.window.axe.run(env.document.querySelector(selector), { rules: { 'color-contrast': { enabled: false } } });
  return Array.from(r.violations).map((v) => `${v.id}: ${v.help}`);
}
async function appWithDemo() {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  app.ctx.loadDemo();
  return { env, app };
}

test('UI: all five network tabs render axe-clean, with an accessible SVG map and labelled tables', async () => {
  const { env, app } = await appWithDemo();
  try {
    const routes = [
      '#/network', '#/network?tab=map', '#/network?tab=positions',
      '#/network?tab=holes', '#/network?tab=stress',
      '#/network?tab=stress&person=person-demo-2',
      '#/network?tab=followthrough',
    ];
    for (const route of routes) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.length > 200, `${route} renders content`);
      assert.ok(!/failed to draw|is not a function/.test(view.textContent), `${route} no render error`);
      assert.deepEqual(await axeViolations(env), [], `${route} axe-clean`);
      for (const tbl of Array.from(view.querySelectorAll('table'))) {
        assert.ok(tbl.getAttribute('aria-label') || tbl.querySelector('caption'), `${route}: table labelled`);
        for (const th of Array.from(tbl.querySelectorAll('th'))) {
          assert.ok((th.textContent || '').trim().length > 0, `${route}: no empty header`);
        }
      }
      for (const s of Array.from(view.querySelectorAll('svg[role="img"]'))) {
        assert.ok((s.getAttribute('aria-label') || '').length > 20, `${route}: SVG map has an accessible name`);
      }
    }
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});

test('UI: empty workspace shows a privacy-safe guidance state and passes axe', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.navigate('#/network');
    const view = env.document.querySelector('#view');
    assert.ok(/Add a few people|at least two active people/.test(view.textContent), 'guidance shown');
    assert.ok(/never reads email|no surveillance/i.test(view.textContent), 'privacy posture explicit');
    assert.deepEqual(await axeViolations(env), [], 'empty state axe-clean');
  } finally {
    env.dom.window.close();
  }
});

test('UI: nav exposes the Influence network route and Today shows structural triage', async () => {
  const { env, app } = await appWithDemo();
  try {
    const navLink = Array.from(env.document.querySelectorAll('a')).find((a) => /Influence network/.test(a.textContent));
    assert.ok(navLink, 'nav item present');
    app.ctx.navigate('#/today');
    const today = env.document.querySelector('#view');
    assert.ok(/Influence network|structural single point/i.test(today.textContent), 'Today triage card present for the demo');
    assert.deepEqual(await axeViolations(env), [], 'Today with the new card axe-clean');
  } finally {
    env.dom.window.close();
  }
});
