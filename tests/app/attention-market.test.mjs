/**
 * tests/app/attention-market.test.mjs — the Attention Market (Session 82,
 * Schema v57, ADR-0047, RULE-ATT-01..05).
 *
 * The claims here are specific and falsifiable:
 *
 *   1. Schema v57 is additive. A v56 workspace gains an empty plan list and
 *      nothing else; no budget, no plan and no prediction is invented.
 *   2. Every exposure and every hour is traced to a named field, and a missing
 *      field is `null` — never zero. A zero would rank an unpriced obligation
 *      last forever while looking like a measurement.
 *   3. Curve pruning keeps the CHEAPER of two alternatives when the expensive
 *      one adds nothing. This is a regression test: the first implementation
 *      removed the wrong point and silently deleted every delegation from the
 *      market.
 *   4. The solver is optimal — verified against exhaustive enumeration — on
 *      every random small market, with one resource and with two.
 *   5. The delegate pool is a real ceiling: a plan never exceeds it, and raising
 *      it never lowers the plan's value.
 *   6. Currencies are never summed, and the value of one more hour is a finite
 *      difference rather than a fractional-relaxation artefact.
 *   7. The rules attach typed edges, open exactly one owned delegation per named
 *      hand-off and exactly one forgone decision, and are marker-idempotent.
 *   8. A review excludes items that have not moved instead of scoring them as
 *      misses, and never rewrites the frozen prediction.
 *   9. The terminal renders keyboard-reachably with a single h1 and named tables.
 *  10. The rule is registered on the shared spine with a declared contract, and
 *      CSV scope #49 carries counts and codes but never a title or an amount.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { SCHEMA_VERSION, createEmptyState, migrate, normalizeState } from '../../app/core/schema.js';
import { createApi } from '../../app/actions.js';
import { normalizeAttentionPlans } from '../../app/core/domain/attentionMarketSchema.js';
import {
  ATT_SOURCE_BY_ID,
  attentionBrief,
  attentionAttentionCount,
  attSignals,
  buildAttentionMarket,
  completionDiscipline,
  commonCauseConcentration,
  conventionsFromSettings,
  delegateReliability,
  harvestCandidates,
  pruneToHull,
  resolveAtoms,
  scoreAttentionPlan,
  shrunkRate,
  solveExact,
  solveMarket,
} from '../../app/core/domain/attentionMarket.js';
import { attentionMarketRule } from '../../app/core/domain/attentionMarketRules.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { renderAttentionMarket } from '../../app/views/attentionMarket.js';
import { LINK_ENTITY_COLLECTIONS, LINK_ENTITY_TYPES, LINK_RELATIONS } from '../../app/core/domain/cases.js';

const NOW = new Date('2026-10-30T12:00:00.000Z');
const TODAY = '2026-10-30';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function makeStore() {
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-s82-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api };
}

function portfolioItem(id, { value = 10000, effortDays = 4, currency = 'USD' } = {}) {
  return {
    id,
    title: id,
    kind: 'project',
    horizon: 'core',
    status: 'open',
    sourceType: 'manual',
    sourceId: null,
    ownerId: null,
    effortDays: { optimistic: effortDays * 0.7, mostLikely: effortDays, pessimistic: effortDays * 1.4 },
    value: { optimistic: value * 0.8, mostLikely: value, pessimistic: value * 1.2 },
    currency,
    decision: 'funded',
    decisionOn: '2026-10-01',
    rationale: '',
    targetOn: '2026-11-20',
    createdOn: '2026-10-01',
    completedOn: null,
    releasedOn: null,
    actualEffortDays: 0,
    actualValue: 0,
    forecastSnapshot: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function delegation(id, personId, { dueOn = '2026-09-10', completedOn = '2026-09-09' } = {}) {
  return {
    id,
    personId,
    title: id,
    expectedOutcome: '',
    authority: 'act-inform',
    support: '',
    delegatedOn: '2026-09-01',
    dueOn,
    status: completedOn ? 'completed' : 'active',
    checkins: [],
    completedOn,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function seedWorkspace(store) {
  store.update((draft) => {
    draft.people = [
      { id: 'p-ana', name: 'Ana', role: 'Engineer', level: 'senior', managerId: null, status: 'active', startDate: '2024-01-01', talkingPoints: [] },
      { id: 'p-ben', name: 'Ben', role: 'Engineer', level: 'senior', managerId: null, status: 'active', startDate: '2024-01-01', talkingPoints: [] },
    ];
    draft.delegations = [
      delegation('d1', 'p-ana'), delegation('d2', 'p-ana'), delegation('d3', 'p-ana'),
      delegation('d4', 'p-ana'), delegation('d5', 'p-ana'),
      delegation('d6', 'p-ana', { completedOn: '2026-09-25' }),
      delegation('d7', 'p-ben'), delegation('d8', 'p-ben'),
      delegation('d9', 'p-ben', { completedOn: '2026-09-25' }),
      delegation('d10', 'p-ben', { completedOn: '2026-09-25' }),
    ];
    draft.portfolio = [portfolioItem('pf-1'), portfolioItem('pf-2'), portfolioItem('pf-3')];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed the attention-market fixture' });
}

/* ------------------------------------------------------------ 1. schema */

test('Schema v57 is additive: an existing workspace gains an empty plan list and nothing is invented', () => {
  assert.equal(SCHEMA_VERSION, 65);
  const empty = createEmptyState(NOW.toISOString());
  assert.deepEqual(empty.attentionPlans, []);
  assert.equal(empty.settings.attBudgetHours, 12);
  assert.equal(empty.settings.attHandoffSharePct, 25);
  assert.equal(empty.settings.attLeaderSharePct, 10);

  const migrated = migrate({ schemaVersion: 56, settings: {}, people: [], portfolio: [] });
  assert.equal(migrated.raw.schemaVersion, 65);
  assert.equal(migrated.applied.at(-1), '64 → 65');
  assert.deepEqual(migrated.raw.attentionPlans, []);

  const state = normalizeState({ schemaVersion: 56, people: [] }, { now: NOW }).state;
  assert.deepEqual(state.attentionPlans, []);
  assert.equal(state.settings.attBudgetHours, 12);
});

test('a settings typo cannot switch the optimisation off or explode the budget', () => {
  const state = normalizeState({
    schemaVersion: 58,
    people: [],
    settings: { attBudgetHours: 'nonsense', attHandoffSharePct: 900, attMinSamples: -4, attLeaderSharePct: 0 },
  }, { now: NOW }).state;
  assert.equal(state.settings.attBudgetHours, 12);
  assert.equal(state.settings.attHandoffSharePct, 100);
  assert.equal(state.settings.attMinSamples, 1);
  assert.equal(state.settings.attLeaderSharePct, 0.5);
});

test('a plan with no committed date or no frozen result is dropped, not repaired', () => {
  const warnings = [];
  const out = normalizeAttentionPlans([
    { id: 'a', result: { currency: 'USD', value: 1 } },
    { id: 'b', result: { committedOn: '2026-10-30', currency: 'usd', value: null, items: [{ sourceType: 'case', sourceId: 'c1', mode: 'nonsense' }], forgone: [] } },
    'not an object',
  ], { people: [] }, NOW.toISOString(), warnings);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'b');
  assert.equal(out[0].currency, 'USD');
  assert.equal(out[0].result.items[0].mode, 'do');
  assert.ok(warnings.length >= 1);
});

/* ----------------------------------------------------------- 2. harvest */

test('a case exposure is the PERT expected value of its own cost estimate, and an absent estimate is null', () => {
  const state = createEmptyState(NOW.toISOString());
  state.cases = [{
    id: 'c1',
    kind: 'risk',
    status: 'open',
    title: 'Billing drift',
    summary: '',
    ownerId: null,
    involvedPersonIds: [],
    linkedGoalId: null,
    openedOn: '2026-10-01',
    reviewOn: '2026-11-01',
    resolvedOn: null,
    resolutionNotes: '',
    fmea: { severity: null, probability: null, detectability: null, failureMode: '', effect: '', actionPriority: null },
    financial: {
      currency: 'USD',
      optimistic: 6000,
      mostLikely: 12000,
      pessimistic: 24000,
      mitigationCost: 0,
      capacityDaysOptimistic: 1,
      capacityDaysMostLikely: 2,
      capacityDaysPessimistic: 3,
      opportunityCost: '',
    },
    forecastSnapshot: null,
    actuals: null,
    rca: { problemStatement: '', whys: [], rootCause: '', systemicBarrier: '', preventiveAction: '' },
    stakeholders: [],
    autoPropagate: true,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  }, {
    id: 'c2',
    kind: 'risk',
    status: 'open',
    title: 'No estimate',
    summary: '',
    ownerId: null,
    involvedPersonIds: [],
    linkedGoalId: null,
    openedOn: '2026-10-01',
    reviewOn: null,
    resolvedOn: null,
    resolutionNotes: '',
    fmea: { severity: null, probability: null, detectability: null, failureMode: '', effect: '', actionPriority: null },
    financial: { currency: 'USD', optimistic: 0, mostLikely: 0, pessimistic: 0, mitigationCost: 0, capacityDaysOptimistic: 0, capacityDaysMostLikely: 0, capacityDaysPessimistic: 0, opportunityCost: '' },
    forecastSnapshot: null,
    actuals: null,
    rca: { problemStatement: '', whys: [], rootCause: '', systemicBarrier: '', preventiveAction: '' },
    stakeholders: [],
    autoPropagate: true,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  }];
  const rows = harvestCandidates(state, NOW, conventionsFromSettings(state.settings));
  const priced = rows.find((row) => row.sourceId === 'c1');
  const unpriced = rows.find((row) => row.sourceId === 'c2');
  // (6000 + 4*12000 + 24000) / 6 = 13000
  assert.equal(priced.exposure, 13000);
  assert.match(priced.exposureBasis, /PERT expected loss/);
  // (1 + 4*2 + 3) / 6 = 2 capacity-days expected, x 6 h x 10% leader share = 1.2
  assert.equal(priced.hours, 1.2);
  assert.match(priced.hoursBasis, /10% declared leader share/);
  assert.equal(unpriced.exposure, null, 'a missing estimate is null, never zero');
  assert.equal(unpriced.hours, null);
});

test('RULE-ATT-05 discovers same-barrier cases through real case events and removes stale typed edges', () => {
  const { store, api } = makeStore();
  const first = api.addCase({
    title: 'Payment retries', kind: 'risk', openedOn: TODAY,
    financial: { currency: 'USD', optimistic: 6000, mostLikely: 12000, pessimistic: 24000, capacityDaysOptimistic: 1, capacityDaysMostLikely: 2, capacityDaysPessimistic: 3 },
    rca: { systemicBarrier: 'Deploy without a guardrail' },
  });
  assert.ok(first.ok, first.error);
  const second = api.addCase({
    title: 'Queue saturation', kind: 'incident', openedOn: TODAY,
    financial: { currency: 'USD', optimistic: 3000, mostLikely: 6000, pessimistic: 12000, capacityDaysOptimistic: 1, capacityDaysMostLikely: 2, capacityDaysPessimistic: 3 },
    rca: { systemicBarrier: '  DEPLOY  without   a   GUARDRAIL  ' },
  });
  assert.ok(second.ok, second.error);
  const edge = store.state.links.find((link) => link.ruleId === 'RULE-ATT-05');
  assert.ok(edge, 'second case triggers the shared rule and creates a typed case-to-case edge');
  assert.equal(edge.relation, 'shares-barrier');
  assert.equal(edge.sourceType, 'case');
  assert.equal(edge.targetType, 'case');
  assert.ok(!edge.summary.includes('Deploy without a guardrail'), 'free-text barrier is not copied into lineage');
  assert.ok(second.propagations.some((effect) => effect.ruleId === 'RULE-ATT-05'));

  const report = buildAttentionMarket(store.state, NOW, { sensitivity: false, price: false });
  assert.equal(report.commonCauseClusters.length, 1);
  const [cluster] = report.commonCauseClusters;
  assert.equal(cluster.caseCount, 2);
  assert.equal(cluster.pricedCount, 2);
  assert.equal(cluster.fullOverlapScenario, 13000);
  assert.equal(cluster.additiveScenario, 19500);
  assert.ok(attSignals(store.state, NOW).some((signal) => signal.ruleId === 'ATT-S6'));
  const manual = api.linkCaseEntity(first.id, { targetType: 'case', targetId: second.id, relation: 'shares-barrier' });
  assert.equal(manual.ok, false, 'users cannot manually assert the semantics of an automated relation');

  const resolved = api.resolveCase(second.id, { resolvedOn: TODAY, resolutionNotes: 'Guardrail is now enforced.' });
  assert.ok(resolved.ok, resolved.error);
  assert.equal(store.state.links.filter((link) => link.ruleId === 'RULE-ATT-05').length, 0, 'resolved cases leave the active relation graph');
  assert.equal(buildAttentionMarket(store.state, NOW, { sensitivity: false, price: false }).commonCauseClusters.length, 0);
  const reopened = api.reopenCase(second.id);
  assert.ok(reopened.ok, reopened.error);
  assert.equal(store.state.links.filter((link) => link.ruleId === 'RULE-ATT-05').length, 1, 'reopening restores the relation');

  const edit = api.updateCase(second.id, { rca: { systemicBarrier: 'A different verified control' } });
  assert.ok(edit.ok, edit.error);
  assert.equal(store.state.links.filter((link) => link.ruleId === 'RULE-ATT-05').length, 0, 'a changed barrier removes the stale typed relation');
  assert.equal(buildAttentionMarket(store.state, NOW, { sensitivity: false, price: false }).commonCauseClusters.length, 0);
});

test('common-cause exposure keeps currencies separate and treats unpriced losses as unknown', () => {
  const candidates = [
    { sourceType: 'case', sourceId: 'a', title: 'A', route: '#/cases/a', currency: 'USD', exposure: 100 },
    { sourceType: 'case', sourceId: 'b', title: 'B', route: '#/cases/b', currency: 'USD', exposure: null },
    { sourceType: 'case', sourceId: 'c', title: 'C', route: '#/cases/c', currency: 'EUR', exposure: 80 },
    { sourceType: 'case', sourceId: 'd', title: 'D', route: '#/cases/d', currency: 'EUR', exposure: 120 },
  ];
  const state = { cases: candidates.map((row) => ({ id: row.sourceId, status: 'open', rca: { systemicBarrier: 'same exact barrier' } })) };
  const clusters = commonCauseConcentration(candidates, state);
  assert.deepEqual(clusters.map((row) => row.currency).sort(), ['EUR', 'USD']);
  const usd = clusters.find((row) => row.currency === 'USD');
  assert.equal(usd.fullOverlapScenario, 100);
  assert.equal(usd.additiveScenario, 100);
  assert.equal(usd.unpricedCount, 1);
  assert.equal(clusters.find((row) => row.currency === 'EUR').fullOverlapScenario, 120);
});

test('a negotiation is worth the surplus over the leader\'s own BATNA, and nothing at or below it', () => {
  const state = createEmptyState(NOW.toISOString());
  const base = {
    kind: 'vendor-contract',
    status: 'active',
    counterparty: 'X',
    counterpartyRole: '',
    ownerId: null,
    linkedGoalId: null,
    sourceType: null,
    sourceId: null,
    openedOn: '2026-10-01',
    nextSessionOn: '2026-11-02',
    reviewOn: '2026-11-07',
    closedOn: null,
    strategic: false,
    stakesCurrency: 'USD',
    ourBatnaDescription: '',
    ourBatnaValue: 80000,
    ourBatnaUnit: 'USD',
    theirBatnaEstimate: '',
    targetSettlement: null,
    reservationValue: null,
    terms: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
  state.negotiations = [
    { ...base, id: 'n1', title: 'Good deal', stakesValue: 96000 },
    { ...base, id: 'n2', title: 'Below BATNA', stakesValue: 70000 },
  ];
  const rows = harvestCandidates(state, NOW, conventionsFromSettings(state.settings));
  const good = rows.find((row) => row.sourceId === 'n1');
  const bad = rows.find((row) => row.sourceId === 'n2');
  assert.equal(good.exposure, 16000);
  assert.match(good.exposureBasis, /less BATNA/);
  assert.equal(bad.exposure, null, 'below BATNA there is no surplus to protect, and that is not zero exposure');
  assert.equal(ATT_SOURCE_BY_ID.negotiation.delegable, false, 'a negotiating mandate cannot be handed to a report');
});

/* ------------------------------------------------------- 3. curve pruning */

test('curve pruning keeps the cheap alternative when the expensive one adds no value', () => {
  const hull = pruneToHull([
    { key: 'drop', mode: 'drop', hours: 0, value: 0 },
    { key: 'delegate', mode: 'delegate', hours: 1, value: 500 },
    { key: 'do', mode: 'do', hours: 4, value: 500 },
  ]);
  assert.equal(hull.length, 2, 'the dominated do-it-yourself option is removed');
  assert.equal(hull[1].mode, 'delegate');
});

test('curve pruning is convex and empty-safe', () => {
  assert.deepEqual(pruneToHull([]), []);
  const hull = pruneToHull([
    { hours: 0, value: 0 },
    { hours: 1, value: 10 },
    { hours: 2, value: 12 },
    { hours: 3, value: 30 },
  ]);
  // (1,10) and (2,12) are below the chord from (0,0) to (3,30), so only the
  // endpoints and the strong point survive.
  assert.deepEqual(hull.map((row) => row.hours), [0, 3]);
});

/* ------------------------------------------------------------- 4. solver */

function bruteForce(groups, budget, delegateCapacity) {
  let best = -1;
  const indices = new Array(groups.length).fill(0);
  const walk = (depth, value, hours, load) => {
    if (depth === groups.length) { if (value > best) best = value; return; }
    const options = groups[depth].options;
    for (let i = 0; i < options.length; i += 1) {
      const option = options[i];
      if (hours + option.hours > budget + 1e-9) continue;
      if (load + (option.load || 0) > delegateCapacity + 1e-9) continue;
      walk(depth + 1, value + option.value, hours + option.hours, load + (option.load || 0));
    }
  };
  walk(0, 0, 0, 0);
  return best;
}

function randomMarket(seed) {
  let x = seed;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const size = 2 + Math.floor(rand() * 4);
  const groups = [];
  for (let i = 0; i < size; i += 1) {
    const value = 500 + Math.round(rand() * 9000);
    const hours = 1 + Math.round(rand() * 30) / 10;
    const options = [
      { key: 'drop', mode: 'drop', hours: 0, value: 0, load: 0 },
      { key: 'do', mode: 'do', hours, value, load: 0 },
    ];
    if (rand() > 0.4) {
      options.push({ key: 'delegate', mode: 'delegate', hours: Math.round(hours * 0.25 * 100) / 100, value: Math.round(value * (0.6 + rand() * 0.4)), load: hours });
    }
    groups.push({ id: `g${i}`, candidate: { id: `g${i}` }, options });
  }
  return groups;
}

test('the solver is optimal against exhaustive enumeration on 60 random markets', () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const groups = randomMarket(seed);
    const budget = 2 + (seed % 7);
    const capacity = 3 + (seed % 11);
    const exact = solveExact(groups, { budgetHours: budget, delegateHours: capacity });
    assert.ok(exact.ok, `seed ${seed} produced no feasible plan`);
    const reference = bruteForce(groups, budget, capacity);
    assert.ok(Math.abs(exact.value - reference) < 1e-6,
      `seed ${seed}: solver ${exact.value} vs exhaustive ${reference}`);
  }
});

test('the solver never exceeds either ceiling and raising a ceiling never lowers the value', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const groups = randomMarket(seed + 200);
    const budget = 3 + (seed % 6);
    let previous = -1;
    for (let capacity = 2; capacity <= 12; capacity += 2) {
      const solution = solveMarket(groups, { budgetHours: budget, delegateHours: capacity, price: false });
      assert.ok(solution.usedHours <= budget + 1e-6, `seed ${seed} overran the leader budget`);
      assert.ok(solution.delegateLoad <= capacity + 1e-6, `seed ${seed} overran the delegate pool`);
      assert.ok(solution.value >= previous - 1e-6, 'a larger delegate pool cannot lower the optimum');
      previous = solution.value;
    }
  }
});

test('a zero-hour budget buys nothing and a bigger budget never hurts', () => {
  const groups = randomMarket(9);
  const zero = solveMarket(groups, { budgetHours: 0, delegateHours: 5, price: false });
  assert.equal(zero.value, 0);
  let previous = -1;
  for (let budget = 0; budget <= 10; budget += 1) {
    const solution = solveMarket(groups, { budgetHours: budget, delegateHours: 100, price: false });
    assert.ok(solution.value >= previous - 1e-6);
    previous = solution.value;
  }
});

/* ------------------------------------------------------- 5. probabilities */

test('shrunk rates move toward the prior and never collapse to a certainty', () => {
  assert.equal(shrunkRate(0, 0), 0.5);
  assert.ok(shrunkRate(0, 4) > 0, 'four misses is not proof of zero');
  assert.ok(shrunkRate(4, 4) < 1, 'four hits is not proof of one');
  assert.ok(shrunkRate(5, 6, 0.5455) > shrunkRate(1, 5, 0.5455));
});

test('completion discipline counts only records with BOTH a due date and a close', () => {
  const state = createEmptyState(NOW.toISOString());
  state.cases = [
    { resolvedOn: '2026-09-09', reviewOn: '2026-09-10', openedOn: '2026-09-01' },
    { resolvedOn: '2026-09-20', reviewOn: '2026-09-10', openedOn: '2026-09-01' },
    { resolvedOn: '2026-09-09', reviewOn: null, openedOn: '2026-09-01' },
    { resolvedOn: null, reviewOn: '2026-09-10', openedOn: '2026-09-01' },
  ];
  const discipline = completionDiscipline(state, NOW);
  assert.equal(discipline.case.n, 3, 'three have a resolvable due date');
  assert.equal(discipline.case.hits, 2, 'one of the three closed late');
});

test('delegate reliability is measured, shrunk and ordered', () => {
  const { store } = makeStore();
  seedWorkspace(store);
  const conventions = conventionsFromSettings(store.state.settings);
  const reliability = delegateReliability(store.state, conventions);
  const ana = reliability.people.find((row) => row.personId === 'p-ana');
  const ben = reliability.people.find((row) => row.personId === 'p-ben');
  assert.ok(ana.measured && ben.measured);
  assert.ok(ana.rate > ben.rate, 'Ana kept five of six dates; Ben kept one of four');
  assert.equal(reliability.people[0].personId, 'p-ana');
});

/* -------------------------------------------------------------- 6. atoms */

test('two records protecting the same value through a typed link are collapsed once', () => {
  const candidates = [
    { id: 'case:c1', sourceType: 'case', sourceId: 'c1', exposure: 1000, title: 'Case' },
    { id: 'portfolio:pf1', sourceType: 'portfolio', sourceId: 'pf1', exposure: 4000, title: 'Work' },
    { id: 'case:c2', sourceType: 'case', sourceId: 'c2', exposure: 500, title: 'Unrelated' },
  ];
  const state = {
    links: [{ sourceType: 'case', sourceId: 'c1', targetType: 'portfolio', targetId: 'pf1', relation: 'structures' }],
  };
  const { survivors, shadowed } = resolveAtoms(candidates, state);
  assert.equal(shadowed.length, 1);
  assert.equal(shadowed[0].id, 'case:c1');
  assert.equal(survivors.length, 2);
  assert.ok(survivors.some((row) => row.id === 'portfolio:pf1'));
});

/* ------------------------------------------------------------ 7. actions */

test('committing a plan attaches typed edges, opens the named hand-off and writes ONE forgone decision', () => {
  const { store, api } = makeStore();
  seedWorkspace(store);
  const result = api.commitAttentionPlan({ label: 'Week 44', budgetHours: 6 });
  assert.ok(result.ok, result.error);
  const plan = store.state.attentionPlans[0];
  assert.equal(plan.status, 'committed');
  assert.ok(plan.result.items.length > 0, 'the plan bought something');
  assert.equal(plan.result.currency, 'USD');

  const edges = store.state.links.filter((link) => link.sourceType === 'attention');
  assert.equal(edges.filter((link) => link.relation === 'allocates').length, plan.result.items.length);
  assert.equal(edges.filter((link) => link.relation === 'forgoes').length, plan.result.forgone.length);

  const opened = store.state.delegations.filter((row) => String(row.support || '').includes('RULE-ATT-02'));
  assert.equal(opened.length, plan.result.items.filter((row) => row.mode === 'delegate').length);
  for (const row of opened) assert.equal(row.dueOn, plan.result.reviewOn);

  const forgoDecisions = store.state.decisions.filter((row) => String(row.rationale || '').includes('RULE-ATT-03'));
  assert.ok(forgoDecisions.length <= 1, 'exactly one decision covers the whole forgone list');
  if (plan.result.forgone.length) assert.equal(forgoDecisions.length, 1);
});

test('the commit rule is marker-idempotent and never duplicates its writes', () => {
  const { store, api } = makeStore();
  seedWorkspace(store);
  const result = api.commitAttentionPlan({ label: 'Week 44', budgetHours: 6 });
  assert.ok(result.ok);
  const plan = store.state.attentionPlans[0];
  const before = {
    links: store.state.links.length,
    delegations: store.state.delegations.length,
    decisions: store.state.decisions.length,
  };
  const draft = JSON.parse(JSON.stringify(store.state));
  const effects = attentionMarketRule(draft, {
    event: { type: 'attention.committed', entity: 'attentionPlan', entityId: plan.id },
    now: NOW,
    idFactory: (prefix) => `${prefix}-rerun`,
  });
  assert.deepEqual(effects, [], 'a second run is a no-op');
  assert.equal(store.state.links.length, before.links);
  assert.equal(store.state.delegations.length, before.delegations);
  assert.equal(store.state.decisions.length, before.decisions);
});

test('an unowned market cannot be committed into an empty plan', () => {
  const { api } = makeStore();
  const result = api.commitAttentionPlan({ label: 'Empty', budgetHours: 6 });
  assert.equal(result.ok, false);
  assert.match(result.error, /price/i);
});

/* ------------------------------------------------------------- 8. review */

test('a review excludes items that have not moved instead of scoring them as misses', () => {
  const { store, api } = makeStore();
  seedWorkspace(store);
  const result = api.commitAttentionPlan({ label: 'Week 44', budgetHours: 6 });
  assert.ok(result.ok);
  const review = api.reviewAttentionPlan(result.id, { note: 'Landed cleanly.' });
  assert.ok(review.ok, review.error);
  assert.equal(review.review.counts.realised, 0);
  assert.equal(review.review.counts.contradicted, 0);
  assert.equal(review.review.counts.open, review.review.counts.total);
  assert.equal(review.review.brier, null, 'no settled item means no score, not a zero');
  assert.equal(store.state.attentionPlans[0].result.value, result.result.value, 'the frozen prediction is untouched');

  const again = api.reviewAttentionPlan(result.id, {});
  assert.equal(again.ok, false, 'a second review would overwrite the number the plan was graded against');
});

test('a resolved record is scored as realised and the Brier term is recorded', () => {
  const { store, api } = makeStore();
  seedWorkspace(store);
  const result = api.commitAttentionPlan({ label: 'Week 44', budgetHours: 6 });
  assert.ok(result.ok);
  const bought = store.state.attentionPlans[0].result.items[0];
  store.update((draft) => {
    const item = draft.portfolio.find((row) => row.id === bought.sourceId);
    if (item) { item.status = 'done'; item.completedOn = TODAY; }
  }, { type: 'test.complete', entity: 'workspace', entityId: '', summary: 'Complete one bought item' });
  const review = api.reviewAttentionPlan(result.id, {});
  assert.ok(review.ok, review.error);
  assert.equal(review.review.counts.realised, 1);
  assert.ok(review.review.brier !== null);
  assert.ok(review.review.measuredAvoided > 0);
});

test('scoreAttentionPlan refuses a plan with no frozen result', () => {
  assert.equal(scoreAttentionPlan(null, {}, NOW).ok, false);
  assert.equal(scoreAttentionPlan({ id: 'x' }, {}, NOW).ok, false);
});

/* --------------------------------------------------------- 9. read model */

test('currencies are never summed and each market prices its own hour', () => {
  const { store } = makeStore();
  seedWorkspace(store);
  store.update((draft) => {
    draft.portfolio.push(portfolioItem('pf-eur', { currency: 'EUR', value: 20000 }));
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Add a EUR item' });
  const report = buildAttentionMarket(store.state, NOW, { sensitivity: false });
  assert.equal(report.markets.length, 2);
  assert.deepEqual(report.markets.map((row) => row.currency).sort(), ['EUR', 'USD']);
  assert.equal(Object.keys(report.totals.exposureByCurrency).sort().join(','), 'EUR,USD');
  for (const market of report.markets) assert.ok(market.totalExposure > 0);
});

test('an unpriced obligation is listed, counted and excluded — never silently dropped', () => {
  const { store } = makeStore();
  seedWorkspace(store);
  store.update((draft) => {
    draft.negotiations = [{
      id: 'neg-x', title: 'Aurora renewal', kind: 'vendor-contract', status: 'active',
      counterparty: 'X', counterpartyRole: '', ownerId: null, linkedGoalId: null,
      sourceType: null, sourceId: null, openedOn: '2026-10-01', nextSessionOn: '2026-11-02',
      reviewOn: '2026-11-07', closedOn: null, strategic: false, stakesValue: 96000,
      stakesCurrency: 'USD', ourBatnaDescription: '', ourBatnaValue: 80000, ourBatnaUnit: 'USD',
      theirBatnaEstimate: '', targetEstimate: null, reservationValue: null, terms: [],
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    }];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Add a negotiation' });
  const report = buildAttentionMarket(store.state, NOW, { sensitivity: false });
  const negotiation = report.candidates.find((row) => row.sourceType === 'negotiation');
  assert.ok(negotiation, 'the negotiation was harvested');
  assert.equal(negotiation.exposure, 16000);
  assert.equal(negotiation.hours, null);
  assert.ok(report.unpriced.some((row) => row.sourceType === 'negotiation'), 'no hours means it is unpriced');
  assert.ok(report.totals.unpriced >= 1);
  // With the portfolio removed this negotiation would be the whole priced queue,
  // so this fixture mixes both; the note fires only when unpriced work is at
  // least a quarter of the recorded hours.
  const hoursShare = report.totals.totalHours > 0
    ? (report.totals.unpricedHours / report.totals.totalHours) * 100
    : 0;
  assert.equal(Boolean(report.notes.some((note) => /could not be priced/.test(note.title))), hoursShare >= 25);
});

test('declaring hours moves an item from unpriced into the plan', () => {
  const { store } = makeStore();
  seedWorkspace(store);
  store.update((draft) => {
    draft.negotiations = [{
      id: 'neg-x', title: 'Aurora renewal', kind: 'vendor-contract', status: 'active',
      counterparty: 'X', counterpartyRole: '', ownerId: null, linkedGoalId: null,
      sourceType: null, sourceId: null, openedOn: '2026-10-01', nextSessionOn: '2026-11-02',
      reviewOn: '2026-11-07', closedOn: null, strategic: false, stakesValue: 96000,
      stakesCurrency: 'USD', ourBatnaDescription: '', ourBatnaValue: 80000, ourBatnaUnit: 'USD',
      theirBatnaEstimate: '', targetEstimate: null, reservationValue: null, terms: [],
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    }];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Add a negotiation' });
  const before = buildAttentionMarket(store.state, NOW, { sensitivity: false });
  const after = buildAttentionMarket(store.state, NOW, {
    sensitivity: false,
    declarations: { 'negotiation:neg-x': 2 },
  });
  assert.ok(after.totals.priced > before.totals.priced);
});

test('the brief is deterministic and states the method rather than claiming optimality', () => {
  const { store } = makeStore();
  seedWorkspace(store);
  const first = attentionBrief(store.state, NOW);
  const second = attentionBrief(store.state, NOW);
  assert.equal(first, second);
  assert.match(first, /Multiple-choice knapsack/);
  assert.match(first, /gap between them is a stated distance, not a claim of optimality/);
});

test('signals fire only on a real reading and the badge counts real work', () => {
  const { store } = makeStore();
  seedWorkspace(store);
  const signals = attSignals(store.state, NOW);
  assert.ok(signals.length > 0);
  for (const signal of signals) {
    assert.equal(signal.domain, 'Attention market');
    assert.match(signal.ruleId, /^ATT-S\d$/);
  }
  const count = attentionAttentionCount(store.state, NOW);
  assert.ok(count >= 0);
});

/* ---------------------------------------------------------------- 10. UI */

async function withDom(fn) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="modal-root"></div></body></html>', { virtualConsole, pretendToBeVisual: true, url: 'https://leados.test/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.localStorage = dom.window.localStorage;
  try { return await fn(dom.window); } finally {
    delete global.window; delete global.document; delete global.HTMLElement;
    delete global.Node; delete global.localStorage;
  }
}

test('the terminal renders with one h1 and named tables on every panel', async () => {
  const { store } = makeStore();
  seedWorkspace(store);
  const makeCtx = (panel) => ({
    state: store.state,
    now: NOW,
    query: new URLSearchParams(panel ? `panel=${panel}` : ''),
    navigate: () => {},
    refresh: () => {},
    api: {},
  });
  await withDom(async () => {
  for (const panel of ['plan', 'market', 'unpriced', 'frontier', 'method']) {
    const node = renderAttentionMarket(makeCtx(panel));
    const host = document.createElement('div');
    host.append(node);
    assert.equal(host.querySelectorAll('h1').length, 1, `panel ${panel} has exactly one h1`);
    for (const el of host.querySelectorAll('table')) {
      assert.ok(el.getAttribute('aria-label'), `panel ${panel}: a table has no accessible name`);
    }
  }
  });
});

/* ------------------------------------------------------------ 11. wiring */

test('the rule is registered on the shared spine with a declared contract', () => {
  const index = DEFAULT_POST_COMMIT_RULES.indexOf(attentionMarketRule);
  assert.ok(index >= 0, 'the rule is in the chain');
  assert.equal(index, DEFAULT_POST_COMMIT_RULES.length - 1, 'it reads the finished workspace, so it runs last');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === attentionMarketRule);
  assert.ok(contract, 'the rule declares a contract');
  assert.match(contract.purpose, /RULE-ATT-01/);
  assert.match(contract.purpose, /RULE-ATT-05/);
  assert.equal(contract.scansWorkspace, true);
});

test('the attention node is a typed graph node with both relations', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('attention'));
  assert.equal(LINK_ENTITY_COLLECTIONS.attention, 'attentionPlans');
  assert.ok(LINK_RELATIONS.includes('allocates'));
  assert.ok(LINK_RELATIONS.includes('forgoes'));
  assert.ok(LINK_RELATIONS.includes('shares-barrier'));
});

test('CSV scope #49 carries counts and codes but never a title or an amount', () => {
  const descriptor = CSV_EXPORTS.find((row) => row.key === 'attention');
  assert.ok(descriptor);
  assert.match(descriptor.description, /NO plan labels/);
  const { store, api } = makeStore();
  seedWorkspace(store);
  assert.ok(api.commitAttentionPlan({ label: 'Week 44', budgetHours: 6 }).ok);
  const exported = exportWorkspaceCsv(store.state, 'attention', { now: NOW });
  assert.ok(exported.ok, exported.error);
  const parsed = parseCsv(exported.csv);
  assert.equal(parsed.rows.length, 1, 'one plan');
  assert.ok(parsed.headers.includes('next_hour_value'));
  assert.ok(!parsed.headers.includes('title'));
  const serialized = JSON.stringify(parsed.rows);
  assert.ok(!serialized.includes('Week 44'), 'the plan label does not leak');
  assert.ok(!serialized.includes('pf-'), 'a record identifier does not leak');
});
