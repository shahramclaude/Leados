import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { createEmptyState } from '../../app/core/schema.js';
import { casesRollup } from '../../app/core/domain/cases.js';
import { evaluateScenario, computeParetoFrontier } from '../../app/core/domain/scenarios.js';

const now = new Date('2026-11-01T10:00:00Z');
const makeCase = (id, currency, amount) => ({ id, title: id, kind: 'risk', status: 'open', openedOn: '2026-10-01', fmea: { severity: 8, probability: 5, detectability: 5 }, financial: { currency, optimistic: amount, mostLikely: amount, pessimistic: amount, mitigationCost: 100 }, rca: {}, stakeholders: [] });

test('case portfolio never adds currencies, but preserves each currency and single-currency compatibility', () => {
  const state = { cases: [makeCase('a', 'USD', 1000), makeCase('b', 'EUR', 2000)] };
  const result = casesRollup(state, now);
  assert.equal(result.mixedCurrencies, true);
  assert.equal(result.expectedExposure, null);
  assert.equal(result.netRiskAdjustedValue, null);
  assert.deepEqual(result.currencyBreakdown.map((r) => [r.currency, r.expectedExposure]), [['EUR', 2000], ['USD', 1000]]);
  state.cases.pop();
  const single = casesRollup(state, now);
  assert.equal(single.expectedExposure, 1000);
  assert.equal(single.primaryCurrency, 'USD');
});

test('scenario refuses mixed case currencies and Pareto comparison; restored when units agree', () => {
  const state = createEmptyState();
  state.cases = [makeCase('a', 'USD', 1000), makeCase('b', 'EUR', 2000)];
  const evaluate = () => evaluateScenario(state, { id: 'baseline', name: 'Baseline', levers: {} }, { now, seed: 42, trials: 100 });
  let result = evaluate();
  assert.deepEqual(result.economics.currencies, ['EUR', 'USD']);
  assert.equal(result.economics.measured, false);
  assert.equal(result.economics.netRiskAdjustedValue, null);
  assert.equal(result.economics.openCaseResidualLoss, null);
  assert.equal(computeParetoFrontier([result])[0].paretoOptimal, null);
  state.cases[1].financial.currency = 'USD';
  result = evaluate();
  assert.equal(result.economics.mixedCurrencies, false);
  assert.equal(result.economics.currency, 'USD');
  assert.equal(result.economics.measured, true);
});

test('cross-ledger case and hiring currencies are caught; numeric daily vacancy cost is included', () => {
  const state = createEmptyState();
  state.cases = [makeCase('a', 'EUR', 1000)];
  state.requisitions = [{ id: 'req', title: 'Engineer', status: 'open', currency: 'USD', dailyVacancyCost: 20, openedOn: '2026-10-01' }];
  const evaluate = () => evaluateScenario(state, { id: 'baseline', name: 'Baseline', levers: {} }, { now, seed: 42, trials: 100 });
  assert.equal(evaluate().economics.mixedCurrencies, true);
  state.requisitions[0].currency = 'EUR';
  const econ = evaluate().economics;
  assert.equal(econ.currency, 'EUR');
  assert.equal(econ.horizonVacancyCost, 560);
});

test('case creation propagates decision, delegation, capacity and coaching while currency guard updates automatically', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  let n = 0;
  const idFactory = (prefix) => `${prefix}-${++n}`;
  const store = createStore({ storage, now: () => now, idFactory });
  store.load();
  const api = createApi(store, { now: () => now, idFactory });
  const owner = api.addPerson({ name: 'Alex', role: 'Lead', startDate: '2025-01-01' });
  assert.equal(owner.ok, true);
  for (const currency of ['USD', 'EUR']) {
    const res = api.addCase({ ...makeCase(currency, currency, 20000), ownerId: owner.id, financial: { ...makeCase(currency, currency, 20000).financial, capacityDaysOptimistic: 1, capacityDaysMostLikely: 2, capacityDaysPessimistic: 3 }, rca: { preventiveAction: 'Verify supplier' }, autoPropagate: true });
    assert.equal(res.ok, true, res.error);
  }
  assert.equal(casesRollup(store.state, now).mixedCurrencies, true);
  assert.ok(store.state.decisions.length >= 2);
  assert.ok(store.state.delegations.length >= 2);
  assert.ok(store.state.portfolio.filter((p) => p.kind === 'capacity-reserve').length >= 2);
  assert.ok(store.state.people.find((p) => p.id === owner.id).talkingPoints.some((t) => t.includes('Case support')));
  const econ = evaluateScenario(store.state, { id: 'baseline', name: 'Baseline', levers: {} }, { now, seed: 42, trials: 100 }).economics;
  assert.equal(econ.mixedCurrencies, true);
  assert.equal(econ.netRiskAdjustedValue, null);
  const decision = api.recordScenarioDecision({ scenarioSpec: { id: 'mitigate', name: 'Mitigate EUR', levers: { caseMitigations: [store.state.cases.find((c) => c.financial.currency === 'EUR').id] } } });
  assert.equal(decision.ok, true, decision.error);
  const created = store.state.decisions.find((d) => d.id === decision.id);
  assert.ok(created.options.some((o) => o.pros.includes('Pareto comparison unavailable')));
  assert.ok(!created.options.some((o) => o.pros.includes('Dominated by peer')));
});

test('Pareto never compares two otherwise valid valuations with different units', () => {
  const row = (id, currency) => ({ id, name: id, economics: { measured: true, currency, netRiskAdjustedValue: 100 }, monteCarlo: { overloadProbability: 0.1, effectiveP80Days: 5 } });
  assert.deepEqual(computeParetoFrontier([row('a', 'USD'), row('b', 'EUR')]).map((r) => r.paretoOptimal), [null, null]);
  const mixed = row('c', 'USD'); mixed.economics.mixedCurrencies = true; mixed.economics.measured = false;
  assert.deepEqual(computeParetoFrontier([row('a', 'USD'), mixed]).map((r) => r.paretoOptimal), [null, null]);
});

test('case portfolio shows the currency breakdown in the rendered screen', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://leados.test/' });
  const previous = { window: globalThis.window, document: globalThis.document, Node: globalThis.Node };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  try {
    const { renderCases } = await import('../../app/views/cases.js');
    const state = createEmptyState();
    state.cases = [makeCase('a', 'USD', 1000), makeCase('b', 'EUR', 2000)];
    const view = renderCases({ state, now, query: new URLSearchParams(), navigate() {} });
    assert.match(view.textContent, /Exposure by currency/);
    assert.match(view.textContent, /EUR 2,000/);
    assert.match(view.textContent, /USD 1,000/);
    assert.match(view.textContent, /cannot be added to produce a portfolio P90/);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
    dom.window.close();
  }
});

test('capacity refuses cross-currency priority and release rankings, restores them when units agree', async () => {
  const { rankPortfolio } = await import('../../app/core/domain/capacity.js');
  const item = (id, currency, valueDensity) => ({ id, title: id, currency, valueDensity, effort: { measured: true, expected: 2 }, kind: 'project' });
  const model = { slackDays: -2, demand: { wanted: [item('wanted', 'USD', 100)], committed: [item('funded', 'EUR', 50)] } };
  let rank = rankPortfolio(model);
  assert.equal(rank.mixedCurrencies, true);
  assert.deepEqual(rank.releaseCandidates, []);
  assert.deepEqual(rank.funded, []);
  assert.equal(rank.nextInLine, null);
  model.demand.committed[0].currency = 'USD';
  rank = rankPortfolio(model);
  assert.equal(rank.mixedCurrencies, false);
  assert.equal(rank.releaseCandidates[0].id, 'funded');
});

test('hiring exposure is broken down by currency and scenario does not relabel it', async () => {
  const { hiringSummary } = await import('../../app/core/domain/hiring.js');
  const state = createEmptyState();
  state.requisitions = ['USD', 'EUR'].map((currency) => ({ id: currency, title: currency, status: 'open', currency, dailyVacancyCost: 20, openedOn: '2026-10-01' }));
  const summary = hiringSummary(state, { now });
  assert.equal(summary.vacancyMixedCurrencies, true);
  assert.equal(summary.vacancyExposure, null);
  assert.deepEqual(summary.vacancyByCurrency.map((b) => b.currency), ['EUR', 'USD']);
  const econ = evaluateScenario(state, { id: 'baseline', name: 'Baseline', levers: {} }, { now, seed: 42, trials: 100 }).economics;
  assert.equal(econ.totalVacancyToDate, null);
  state.requisitions[1].currency = 'USD';
  assert.equal(hiringSummary(state, { now }).vacancyMixedCurrencies, false);
});
