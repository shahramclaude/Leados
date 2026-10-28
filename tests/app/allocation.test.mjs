/**
 * tests/app/allocation.test.mjs — Allocation Governor (Session 51, Schema v33).
 *
 *   1. UCB1 arm mathematics: exact mean/median/bonus/index from settled bets.
 *   2. Guardrails: counts-only below n=5, currencies never mixed, unobserved
 *      settlements excluded (never zero), horizons never inferred.
 *   3. Funded-flow starvation: floor, window, decision-count and reserve rules.
 *   4. Atomic cross-module cascade through the real store: RULE-ALLOC-01
 *      (one DACI decision + typed links), 02 (bet-checkpoint talking point),
 *      03 (evidence-closure delegation), 04 (classification prompt + clearing).
 *   5. Policy: pause switch, validated settings actions, classify action.
 *   6. Schema v33: migration, horizon normalization, settings defaults, and
 *      honest "unrated" FMEA cases (blank persists as null, never a silent 5).
 *   7. store.lastPropagations: post-commit results are now really reported.
 *   8. Signals, insights merge, CSV scope #33, brief, demo seed, DOM/axe.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION, DEFAULT_SETTINGS } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { dayKey, addDays } from '../../app/core/time.js';
import {
  ALLOC_MIN_ARM_N,
  ALLOC_RULES,
  ALLOC_RULE_IDS,
  allocationBrief,
  allocationRule,
  allocationSignals,
  buildAllocationReport,
} from '../../app/core/domain/allocation.js';
import { isFmeaRated, LINK_RELATIONS } from '../../app/core/domain/cases.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-27T10:00:00.000Z');
const TODAY = '2026-10-27';

/* --------------------------------------------------------------- fixtures */

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
  const idFactory = (prefix) => `${prefix}-al-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}

let itemSeq = 0;
function row(overrides = {}) {
  itemSeq += 1;
  return {
    id: `pf-t-${itemSeq}`,
    title: `Item ${itemSeq}`,
    kind: 'project',
    horizon: 'core',
    status: 'open',
    sourceType: 'manual',
    sourceId: null,
    ownerId: null,
    effortDays: { optimistic: 10, mostLikely: 10, pessimistic: 10 },
    value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
    currency: 'USD',
    decision: 'undecided',
    decisionOn: null,
    rationale: '',
    targetOn: null,
    createdOn: '2026-08-01',
    completedOn: null,
    releasedOn: null,
    actualEffortDays: null,
    actualValue: null,
    forecastSnapshot: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function settled(horizon, days, value, extra = {}) {
  return row({
    horizon, status: 'done', decision: 'funded', decisionOn: '2026-07-01',
    completedOn: '2026-08-15', actualEffortDays: days, actualValue: value, ...extra,
  });
}

function stateWith(rows, settingsPatch = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.portfolio = rows;
  state.settings = { ...state.settings, ...settingsPatch };
  return state;
}

const allocDecisions = (store) => store.state.decisions.filter((d) => String(d.question || '').includes('[RULE-ALLOC-01]'));

/* ------------------------------------------------------- 1. UCB mathematics */

test('arms: UCB1 index is mean + robust-scale exploration bonus, computed exactly', () => {
  const rows = [
    ...[1, 2, 3, 4, 5].map(() => settled('core', 10, 10000)), // reward 1000/day ×5
    ...[1, 2, 3, 4, 5].map(() => settled('adjacent', 10, 20000)), // 2000/day ×5
    settled('exploratory', 10, 30000), settled('exploratory', 10, 5000),
    settled('exploratory', 10, 45000), settled('exploratory', 10, 15000),
    settled('exploratory', 10, 25000), // rewards 3000,500,4500,1500,2500 → mean 2400
  ];
  const report = buildAllocationReport(stateWith(rows), NOW);
  const usd = report.armsByCurrency.find((b) => b.currency === 'USD');
  assert.equal(usd.totalObservations, 15);

  // Independent recomputation of the pooled robust scale (1.4826·MAD).
  const rewards = [1000, 1000, 1000, 1000, 1000, 2000, 2000, 2000, 2000, 2000, 3000, 500, 4500, 1500, 2500];
  const sorted = [...rewards].sort((a, b) => a - b);
  assert.equal(sorted[7], 2000, 'pooled median is 2000');
  const absDev = rewards.map((r) => Math.abs(r - 2000)).sort((a, b) => a - b);
  assert.equal(absDev[7], 1000, 'pooled MAD is 1000');
  const scale = 1.4826 * 1000;
  const bonus = scale * Math.sqrt((2 * Math.log(15)) / 5);
  const round2 = (n) => Math.round(n * 100) / 100;

  const core = usd.arms.find((a) => a.horizon === 'core');
  assert.equal(core.verdict, 'learned');
  assert.equal(core.meanReward, 1000);
  assert.equal(core.explorationBonus, round2(bonus));
  assert.equal(core.ucb, round2(1000 + bonus));
  assert.equal(core.settledEffortDays, 50);

  const exploratory = usd.arms.find((a) => a.horizon === 'exploratory');
  assert.equal(exploratory.meanReward, 2400);
  assert.equal(exploratory.medianReward, 2500);
  assert.equal(exploratory.ucb, round2(2400 + bonus));
  assert.equal(usd.leader.horizon, 'exploratory', 'highest UCB leads');
  // Hindsight regret: core 50d ×(2400-1000) + adjacent 50d ×(2400-2000) = 90,000.
  assert.equal(usd.hindsightRegret, 90000);
});

test('arms: fewer than five settled bets is counts-only — no mean, no index, no leader claim', () => {
  const rows = [settled('core', 10, 50000), settled('core', 10, 50000), settled('core', 10, 50000), settled('core', 10, 50000)];
  const report = buildAllocationReport(stateWith(rows), NOW);
  const core = report.armsByCurrency[0].arms.find((a) => a.horizon === 'core');
  assert.equal(core.n, 4);
  assert.equal(core.verdict, 'counts-only');
  assert.equal(core.meanReward, null, 'a 4-bet mean is not dressed up as knowledge');
  assert.equal(core.ucb, null);
  assert.equal(report.armsByCurrency[0].leader, null);
  const brief = allocationBrief(stateWith(rows), NOW);
  assert.match(brief, /counts only until n=5/, 'the brief says so instead of implying a return');
  assert.equal(ALLOC_MIN_ARM_N, 5);
});

test('arms: currencies are segmented and settled-without-actuals is excluded, never zero', () => {
  const rows = [
    ...[1, 2, 3, 4, 5].map(() => settled('core', 10, 10000)),
    settled('core', 10, 90000, { currency: 'EUR' }),
    row({ horizon: 'adjacent', status: 'done', decision: 'funded', decisionOn: '2026-07-01', completedOn: '2026-08-01', actualEffortDays: null, actualValue: null, title: 'Silent settlement' }),
    row({ horizon: null, status: 'done', decision: 'funded', decisionOn: '2026-07-01', completedOn: '2026-08-01', actualEffortDays: 5, actualValue: 5000 }),
  ];
  const report = buildAllocationReport(stateWith(rows), NOW);
  const usd = report.armsByCurrency.find((b) => b.currency === 'USD');
  const eur = report.armsByCurrency.find((b) => b.currency === 'EUR');
  assert.equal(usd.totalObservations, 5, 'EUR evidence never leaks into USD arms');
  assert.equal(usd.arms.find((a) => a.horizon === 'core').meanReward, 1000);
  assert.equal(eur.totalObservations, 1);
  assert.equal(report.totals.settledMissingEvidence, 1, 'settled without actuals is an evidence debt');
  assert.equal(report.missingEvidence[0].title, 'Silent settlement');
  assert.equal(report.totals.settledUnclassified, 1, 'an unclassified settlement is unmeasured, not guessed');
});

/* ---------------------------------------------------------- 2. starvation */

test('funded flow: starvation needs a pattern (≥3 decisions), a floor, and chosen funding only', () => {
  const coreFunded = (decisionOn) => row({ horizon: 'core', decision: 'funded', decisionOn, effortDays: { optimistic: 10, mostLikely: 10, pessimistic: 10 } });
  const candidate = row({ horizon: 'exploratory', decision: 'undecided', title: 'Queued bet' });

  const two = buildAllocationReport(stateWith([coreFunded('2026-10-01'), coreFunded('2026-09-01'), candidate]), NOW);
  assert.equal(two.fundedFlow.starvation, false, 'two decisions are not yet a funding pattern');

  const three = buildAllocationReport(stateWith([coreFunded('2026-10-01'), coreFunded('2026-09-01'), coreFunded('2026-08-01'), candidate]), NOW);
  assert.equal(three.fundedFlow.explorationSharePct, 0);
  assert.equal(three.fundedFlow.starvation, true);
  assert.equal(three.fundedFlow.starvationDebtDays, 3, '10% of 30 classified days');

  const floorOff = buildAllocationReport(stateWith([coreFunded('2026-10-01'), coreFunded('2026-09-01'), coreFunded('2026-08-01'), candidate], { allocationExplorationFloorPct: 0 }), NOW);
  assert.equal(floorOff.fundedFlow.starvation, false, 'a 0% floor deliberately disables the check');

  const reserve = row({ kind: 'capacity-reserve', horizon: null, decision: 'funded', decisionOn: '2026-10-10', effortDays: { optimistic: 100, mostLikely: 100, pessimistic: 100 } });
  const withReserve = buildAllocationReport(stateWith([coreFunded('2026-10-01'), coreFunded('2026-09-01'), coreFunded('2026-08-01'), reserve, candidate]), NOW);
  assert.equal(withReserve.fundedFlow.reserveDaysExcluded, 100, 'incident reserves are obligations, not choices');
  assert.equal(withReserve.fundedFlow.decisions, 3);

  const old = coreFunded(addDays(TODAY, -181));
  const windowed = buildAllocationReport(stateWith([old, coreFunded('2026-10-01'), coreFunded('2026-09-01'), candidate]), NOW);
  assert.equal(windowed.fundedFlow.decisions, 2, 'funding older than the window does not count as current behaviour');
  assert.equal(windowed.fundedFlow.starvation, false);
});

/* ------------------------------------------------ 3. cascade through the store */

test('RULE-ALLOC-01: a third core funding opens exactly one DACI decision with typed links, atomically', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Owner One', role: 'Lead', startDate: '2024-01-01' });
  assert.equal(owner.ok, true, owner.error);

  const cand = api.addPortfolioItem({
    title: 'Exploratory prototype bet', kind: 'project', horizon: 'exploratory', ownerId: owner.id,
    effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 10 },
    value: { optimistic: 20000, mostLikely: 45000, pessimistic: 90000 },
    currency: 'USD', decision: 'undecided', createdOn: '2026-10-20',
  });
  assert.equal(cand.ok, true, cand.error);
  assert.equal(store.state.portfolio.find((p) => p.id === cand.id).horizon, 'exploratory', 'horizon persists from creation');

  for (let i = 0; i < 3; i += 1) {
    const res = api.addPortfolioItem({
      title: `Core platform work ${i + 1}`, kind: 'project', horizon: 'core', ownerId: owner.id,
      effortDays: { optimistic: 10, mostLikely: 10, pessimistic: 10 },
      value: { optimistic: 10000, mostLikely: 15000, pessimistic: 20000 },
      currency: 'USD', decision: 'funded', createdOn: '2026-10-20',
    });
    assert.equal(res.ok, true, res.error);
  }

  const decisions = allocDecisions(store);
  assert.equal(decisions.length, 1, 'exactly one rebalancing decision');
  assert.equal(decisions[0].options.length, 4, 'fund / probe / deliberate deferral / lower the floor');
  assert.match(decisions[0].question, /0% of classified effort/);
  const links = store.state.links.filter((l) => l.ruleId === 'RULE-ALLOC-01');
  assert.ok(links.some((l) => l.relation === 'decides' && l.targetType === 'decision'), 'trigger item decides → decision');
  assert.ok(links.some((l) => l.relation === 'funds' && l.targetId === cand.id), 'decision funds → candidate bet');
  assert.ok(LINK_RELATIONS.includes('funds') && LINK_RELATIONS.includes('decides'));

  const scan = api.scanAllocation();
  assert.equal(scan.ok, true);
  assert.equal(allocDecisions(store).length, 1, 're-scanning converges — the marker prevents duplicates');

  const names = DEFAULT_POST_COMMIT_RULES.map((fn) => fn.name);
  assert.ok(names.indexOf('allocationRule') >= 0 && names.indexOf('allocationRule') < names.indexOf('decisionTempoRule'),
    'the Governor runs before decision tempo so its decision is priced in the same transaction');
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(allocationRule));
});

test('RULE-ALLOC-02/04: funding queues one blameless talking point; classifying clears the classify prompt', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Bet Owner', role: 'Engineer', startDate: '2024-01-01' });
  const bet = api.addPortfolioItem({
    title: 'New-market prototype', kind: 'project', horizon: 'exploratory', ownerId: owner.id,
    effortDays: { optimistic: 3, mostLikely: 5, pessimistic: 9 },
    value: { optimistic: 10000, mostLikely: 30000, pessimistic: 80000 },
    currency: 'USD', decision: 'undecided', createdOn: '2026-10-24',
  });
  assert.equal(bet.ok, true, bet.error);
  const funded = api.setPortfolioDecision(bet.id, { decision: 'funded', rationale: 'Small bet, big option value' });
  assert.equal(funded.ok, true, funded.error);
  let person = store.state.people.find((p) => p.id === owner.id);
  const betPoints = person.talkingPoints.filter((t) => t.includes(`[RULE-ALLOC-02:${bet.id}]`));
  assert.equal(betPoints.length, 1, 'one learning-checkpoint prompt');
  assert.match(betPoints[0], /what result would make us stop/);
  api.scanAllocation();
  person = store.state.people.find((p) => p.id === owner.id);
  assert.equal(person.talkingPoints.filter((t) => t.includes('[RULE-ALLOC-02:')).length, 1, 'idempotent across scans');

  const mystery = api.addPortfolioItem({
    title: 'Unlabelled funded work', kind: 'project', ownerId: owner.id,
    effortDays: { optimistic: 5, mostLikely: 5, pessimistic: 5 },
    value: { optimistic: 5000, mostLikely: 8000, pessimistic: 10000 },
    currency: 'USD', decision: 'funded', createdOn: '2026-10-24',
  });
  assert.equal(mystery.ok, true, mystery.error);
  person = store.state.people.find((p) => p.id === owner.id);
  assert.equal(person.talkingPoints.filter((t) => t.includes(`[RULE-ALLOC-04:${mystery.id}]`)).length, 1, 'classification prompt queued');
  const classified = api.classifyPortfolioHorizon(mystery.id, 'adjacent');
  assert.equal(classified.ok, true, classified.error);
  person = store.state.people.find((p) => p.id === owner.id);
  assert.equal(person.talkingPoints.filter((t) => t.includes('[RULE-ALLOC-04:')).length, 0, 'the prompt clears itself once classified');
  assert.equal(store.state.portfolio.find((p) => p.id === mystery.id).horizon, 'adjacent');
  const bad = api.classifyPortfolioHorizon(mystery.id, 'moonshot');
  assert.equal(bad.ok, false);
  assert.equal(bad.field, 'horizon');
});

test('RULE-ALLOC-03: delivering without actuals opens one evidence-closure delegation', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Delivery Owner', role: 'Engineer', startDate: '2024-01-01' });
  const item = api.addPortfolioItem({
    title: 'Adjacent integration', kind: 'project', horizon: 'adjacent', ownerId: owner.id,
    effortDays: { optimistic: 5, mostLikely: 7, pessimistic: 10 },
    value: { optimistic: 20000, mostLikely: 30000, pessimistic: 40000 },
    currency: 'USD', decision: 'funded', createdOn: '2026-10-01',
  });
  assert.equal(item.ok, true, item.error);
  const done = api.completePortfolioItem(item.id, { completedOn: '2026-10-26' });
  assert.equal(done.ok, true, done.error);
  const delegations = store.state.delegations.filter((d) => `${d.title} ${d.support}`.includes(`[RULE-ALLOC-03:${item.id}]`));
  assert.equal(delegations.length, 1, 'exactly one evidence-closure delegation');
  assert.equal(delegations[0].personId, owner.id);
  assert.match(delegations[0].support, /not a delivery judgement/);
  assert.ok(store.state.links.some((l) => l.ruleId === 'RULE-ALLOC-03' && l.relation === 'tracks-followup' && l.targetId === delegations[0].id));
  api.scanAllocation();
  assert.equal(store.state.delegations.filter((d) => `${d.title} ${d.support}`.includes('[RULE-ALLOC-03:')).length, 1, 'idempotent');
});

/* --------------------------------------------------------------- 4. policy */

test('policy: the pause switch stops propagation; settings actions validate conventions', () => {
  const { store, api } = harness();
  const paused = api.setAllocationPolicy({ autoPropagate: false });
  assert.equal(paused.ok, true, paused.error);
  assert.equal(store.state.settings.allocationAutoPropagate, false);

  api.addPortfolioItem({
    title: 'Queued bet', kind: 'project', horizon: 'exploratory',
    effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 10 },
    value: { optimistic: 10000, mostLikely: 20000, pessimistic: 30000 },
    currency: 'USD', decision: 'undecided', createdOn: '2026-10-20',
  });
  for (let i = 0; i < 3; i += 1) {
    api.addPortfolioItem({
      title: `Core work ${i}`, kind: 'project', horizon: 'core',
      effortDays: { optimistic: 10, mostLikely: 10, pessimistic: 10 },
      value: { optimistic: 10000, mostLikely: 10000, pessimistic: 10000 },
      currency: 'USD', decision: 'funded', createdOn: '2026-10-20',
    });
  }
  api.scanAllocation();
  assert.equal(allocDecisions(store).length, 0, 'paused: measurement only, no decision opened');
  assert.equal(buildAllocationReport(store.state, NOW).fundedFlow.starvation, true, 'the breach is still measured while paused');

  assert.equal(api.setAllocationPolicy({ explorationFloorPct: 51 }).ok, false);
  assert.equal(api.setAllocationPolicy({ windowDays: 10 }).ok, false);
  const set = api.setAllocationPolicy({ explorationFloorPct: 15, windowDays: 90, autoPropagate: true });
  assert.equal(set.ok, true, set.error);
  assert.equal(store.state.settings.allocationExplorationFloorPct, 15);
  assert.equal(store.state.settings.allocationWindowDays, 90);
  api.scanAllocation();
  assert.equal(allocDecisions(store).length, 1, 'resuming lets the next scan open the decision');
});

test('catalog: four named ALLOC rules with explicit frameworks on the shared spine', () => {
  assert.deepEqual(ALLOC_RULES.map((r) => r.id), ['RULE-ALLOC-01', 'RULE-ALLOC-02', 'RULE-ALLOC-03', 'RULE-ALLOC-04']);
  for (const rule of ALLOC_RULES) assert.ok(rule.framework.length > 20, `${rule.id} names its framework`);
  assert.ok(AUTOMATION_RULES.some((r) => r.id === ALLOC_RULE_IDS.FLOOR));
  assert.equal(AUTOMATION_RULES.length, 118, '+ LCS rules');
});

/* ----------------------------------------------------- 5. schema & FMEA */

test('schema v33: migration is additive, horizons normalize honestly, settings default and clamp', () => {
  assert.equal(SCHEMA_VERSION, 46);
  assert.equal(DEFAULT_SETTINGS.allocationExplorationFloorPct, 10);
  assert.equal(DEFAULT_SETTINGS.allocationWindowDays, 180);
  assert.equal(DEFAULT_SETTINGS.allocationAutoPropagate, true);

  const migrated = migrate({ schemaVersion: 32, settings: {}, people: [], portfolio: [{ id: 'p1', title: 'Old work' }] });
  assert.ok(migrated.applied.includes('32 → 33'));
  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.equal(state.portfolio[0].horizon, null, 'no item is retro-classified');

  const dirty = normalizeState({
    schemaVersion: 33,
    settings: { allocationExplorationFloorPct: 99, allocationWindowDays: 2 },
    portfolio: [
      { id: 'p2', title: 'Weird horizon', horizon: 'moonshot' },
      { id: 'p3', title: 'Real horizon', horizon: 'exploratory' },
    ],
  }, { now: NOW });
  assert.equal(dirty.state.portfolio.find((p) => p.id === 'p2').horizon, null, 'an unrecognised horizon degrades to unclassified');
  assert.equal(dirty.state.portfolio.find((p) => p.id === 'p3').horizon, 'exploratory');
  assert.ok(dirty.warnings.some((w) => /horizon/i.test(w)));
  assert.equal(dirty.state.settings.allocationExplorationFloorPct, 50, 'floor clamps to 50');
  assert.equal(dirty.state.settings.allocationWindowDays, 30, 'window clamps to a real look-back');
  assert.ok(warnings !== undefined);
});

test('FMEA: a blank rating persists as null (not a silent 5) and can be cleared back', () => {
  const { store, api } = harness();
  const unrated = api.addCase({
    title: 'Unscoped risk', kind: 'risk', openedOn: '2026-10-26',
    fmea: {}, stakeholders: [],
  });
  assert.equal(unrated.ok, true, unrated.error);
  const stored = store.state.cases.find((c) => c.id === unrated.id);
  assert.equal(stored.fmea.severity, null, 'blank severity is honestly unrated');
  assert.equal(stored.fmea.probability, null);
  assert.equal(stored.fmea.detectability, null);
  assert.equal(isFmeaRated(stored.fmea), false);

  const normalized = normalizeState(JSON.parse(JSON.stringify(store.state)), { now: NOW }).state;
  assert.equal(normalized.cases.find((c) => c.id === unrated.id).fmea.severity, null, 'normalization preserves nulls');

  const rated = api.updateCase(unrated.id, { fmea: { severity: 8, probability: 6, detectability: 7 } });
  assert.equal(rated.ok, true, rated.error);
  assert.equal(isFmeaRated(store.state.cases.find((c) => c.id === unrated.id).fmea), true);
  const cleared = api.updateCase(unrated.id, { fmea: { severity: '' } });
  assert.equal(cleared.ok, true, cleared.error);
  assert.equal(store.state.cases.find((c) => c.id === unrated.id).fmea.severity, null, 'blank clears back to unrated');

  const invalid = api.addCase({ title: 'Bad rating', kind: 'risk', openedOn: '2026-10-26', fmea: { severity: 99 }, stakeholders: [] });
  assert.equal(invalid.ok, false, 'a provided rating outside 1–10 is still rejected');
  // Existing stored numbers are untouched by the v33 normalizer.
  const legacy = normalizeState({ schemaVersion: 32, cases: [{ id: 'old', title: 'Old', kind: 'risk', status: 'open', openedOn: '2026-01-01', fmea: { severity: 5, probability: 5, detectability: 5 } }] }, { now: NOW }).state;
  assert.equal(legacy.cases[0].fmea.severity, 5, 'a historical 5 cannot be told apart from a deliberate 5, so it is kept');
});

/* ---------------------------------------------------- 6. lastPropagations */

test('store.lastPropagations really reports what the post-commit rules did', () => {
  const { store, api } = harness();
  const coreItem = (title) => api.addPortfolioItem({
    title, kind: 'project', horizon: 'core',
    effortDays: { optimistic: 10, mostLikely: 10, pessimistic: 10 },
    value: { optimistic: 10000, mostLikely: 10000, pessimistic: 10000 },
    currency: 'USD', decision: 'funded', createdOn: '2026-10-20',
  });
  coreItem('Core A'); coreItem('Core B'); coreItem('Core C');
  assert.equal(allocDecisions(store).length, 0, 'no candidate queued yet, so no decision');

  const queued = api.addPortfolioItem({
    title: 'Unlabelled maybe-bet', kind: 'project',
    effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 10 },
    value: { optimistic: 10000, mostLikely: 25000, pessimistic: 60000 },
    currency: 'USD', decision: 'undecided', createdOn: '2026-10-21',
  });
  assert.equal(queued.ok, true, queued.error);
  const res = api.classifyPortfolioHorizon(queued.id, 'exploratory');
  assert.equal(res.ok, true, res.error);
  assert.ok(Array.isArray(res.propagations) && res.propagations.some((p) => p.ruleId === 'RULE-ALLOC-01'),
    'the classify action result carries the real propagation, not a dead []');
  assert.equal(allocDecisions(store).length, 1);
  assert.ok(store.lastPropagations.some((p) => p.ruleId === 'RULE-ALLOC-01'), 'the store publishes post-commit results');
});

/* ------------------------------------------- 7. signals, CSV, brief, demo */

test('signals: ALLOC findings merge into the insights feed under the Allocation domain', () => {
  const rows = [
    ...[1, 2, 3].map(() => row({ horizon: 'core', decision: 'funded', decisionOn: '2026-10-01' })),
    row({ horizon: 'exploratory', decision: 'undecided', title: 'Waiting bet' }),
    row({ horizon: 'adjacent', status: 'done', decision: 'funded', decisionOn: '2026-07-01', completedOn: '2026-08-01', title: 'Unrecorded delivery' }),
  ];
  const state = stateWith(rows);
  const signals = allocationSignals(state, NOW);
  assert.ok(signals.some((s) => s.ruleId === 'ALLOC-01' && s.domain === 'Allocation' && s.severity === 3));
  assert.ok(signals.some((s) => s.ruleId === 'ALLOC-03'));
  assert.ok(DOMAIN_ORDER.includes('Allocation'));
  const insights = buildInsights(state, NOW);
  assert.ok(insights.findings.some((f) => f.domain === 'Allocation'), 'merged into Signals');
});

test('CSV scope #33: arm aggregates only — counts-only interest is blank, no titles leak', () => {
  assert.equal(CSV_EXPORTS.length, 41);
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'allocation'));
  const rows = [
    ...[1, 2, 3, 4, 5].map(() => settled('core', 10, 10000, { title: 'Secret core title' })),
    settled('exploratory', 10, 60000, { title: 'Secret bet title' }),
  ];
  const result = exportWorkspaceCsv(stateWith(rows), 'allocation', { now: NOW });
  assert.equal(result.ok, true, result.error);
  assert.ok(!result.csv.includes('Secret'), 'no item titles in the aggregate scope');
  const parsed = parseCsv(result.csv);
  const idx = (name) => parsed.headers.indexOf(name);
  const core = parsed.rows.find((r) => r[idx('horizon')] === 'core');
  const exploratory = parsed.rows.find((r) => r[idx('horizon')] === 'exploratory');
  assert.equal(core[idx('settled_bets')], '5');
  assert.equal(core[idx('mean_value_per_day')], '1000');
  assert.equal(exploratory[idx('ucb_index_per_day')], '', 'below n=5 the index cell stays blank');
  assert.equal(exploratory[idx('verdict')], 'counts-only');
});

test('brief: deterministic, names the breach and the candidate, and states its caveats', () => {
  const rows = [
    ...[1, 2, 3].map(() => row({ horizon: 'core', decision: 'funded', decisionOn: '2026-10-01' })),
    row({ horizon: 'exploratory', decision: 'undecided', title: 'The queued bet', value: { optimistic: 10000, mostLikely: 30000, pessimistic: 70000 } }),
  ];
  const state = stateWith(rows);
  const a = allocationBrief(state, NOW);
  assert.equal(a, allocationBrief(state, NOW), 'same records, same brief');
  assert.match(a, /BELOW FLOOR/);
  assert.match(a, /The queued bet/);
  assert.match(a, /never scored as zero/);
});

test('demo: the Governor has already run — one real decision, counts-only arms, live signals', () => {
  const demo = buildDemoState(NOW);
  const report = buildAllocationReport(demo, NOW);
  assert.equal(report.fundedFlow.starvation, true, 'demo funding behaviour starves exploration');
  assert.equal(report.totals.settledObserved, 7);
  assert.equal(demo.decisions.filter((d) => String(d.question || '').includes('[RULE-ALLOC-01]')).length, 1,
    'the decision in the demo was produced by the engine, not hand-written');
  assert.ok(demo.links.some((l) => l.ruleId === 'RULE-ALLOC-01' && l.relation === 'funds'));
  assert.ok(allocationSignals(demo, NOW).some((s) => s.ruleId === 'ALLOC-01'));
  const usd = report.armsByCurrency.find((b) => b.currency === 'USD');
  assert.equal(usd.arms.find((a) => a.horizon === 'core').n, 4);
  assert.equal(usd.arms.find((a) => a.horizon === 'exploratory').verdict, 'counts-only', 'the demo honestly shows guardrails, not fake precision');
});

/* ----------------------------------------------------------------- 8. DOM */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const css = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = css;
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

async function axeViolations(env) {
  const axeSrc = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
  if (!env.window.axe) env.window.eval(axeSrc);
  const result = await env.window.axe.run(env.document.querySelector('#view'), { rules: { 'color-contrast': { enabled: false } } });
  return Array.from(result.violations).map((v) => `${v.id}: ${v.help}`);
}

test('UI: every Allocation Governor tab renders axe-clean on the demo workspace', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    for (const route of ['#/allocation', '#/allocation?tab=arms', '#/allocation?tab=candidates', '#/allocation?tab=policy']) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.length > 200, `${route} renders content`);
      assert.ok(!/is not a function|undefined is|NaN/.test(view.textContent), `${route} renders without an error panel`);
      assert.deepEqual(await axeViolations(env), [], `${route} axe-clean`);
    }
    app.ctx.navigate('#/allocation?tab=mix');
    assert.match(env.document.querySelector('#view').textContent, /Exploratory share/);
    assert.ok(env.document.querySelector('[href="#/allocation"]'), 'reachable from navigation');
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});
