/**
 * Route-to-view regression tests for typed cross-module links. A link is only
 * useful if its canonical resolver URL opens the owning module and selects the
 * referenced record without mutating it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { createStore } from '../../app/core/store.js';

const NOW = new Date('2026-10-29T10:00:00.000Z');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function routeQuery(route) {
  const query = route.slice(1).split('?')[1] || '';
  return new URLSearchParams(query);
}

function renderAt(root, render, ctx, route) {
  root.replaceChildren();
  const query = routeQuery(route);
  root.appendChild(render({ ...ctx, query }));
  return root;
}

test('typed entity links land on a focused, non-mutating record in each destination view', async () => {
  const dom = new JSDOM('<!doctype html><html><body><main id="view"></main></body></html>', {
    url: 'https://leados.test/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;

  const store = createStore({ storage: memoryStorage(), now: () => NOW });
  const seeded = store.seedDemo();
  assert.equal(seeded.ok, true, seeded.error);
  const state = store.state;
  const api = createApi(store, { now: () => NOW });
  const caseId = state.cases[0].id;
  state.forecastChallenges.push({
    id: 'forecast-focus-test',
    atomKey: 'case:delivery-days',
    sourceType: 'case',
    sourceId: caseId,
    sourceRoute: `#/cases/${encodeURIComponent(caseId)}`,
    title: 'Focused outside-view challenge',
    note: 'A route test only.',
    recordedForecast: 8,
    referenceClassCentral: 10,
    bandLow: 6,
    bandHigh: 13,
    bandScope: 'own-class',
    coverageBound: 0.8,
    evidenceN: 4,
    confidence: 'low',
    status: 'open',
    createdAt: NOW.toISOString(),
  });
  state.premiseOutcomes.push({
    id: 'premise-outcome-focus-test',
    premiseId: state.premises[0].id,
    verdict: 'inconclusive',
    settledOn: '2026-10-28',
    note: '',
    createdAt: NOW.toISOString(),
  });

  const [
    { renderLearning },
    { renderReadiness },
    { renderCapacity },
    { renderForecasts },
    { renderComms },
    { renderPremises },
    { renderDynamics },
    { renderTempo },
    { renderStrategy },
    { renderCapital },
    { renderWatch },
    { renderMeasurement },
  ] = await Promise.all([
    import('../../app/views/learning.js'),
    import('../../app/views/readiness.js'),
    import('../../app/views/capacity.js'),
    import('../../app/views/forecasts.js'),
    import('../../app/views/comms.js'),
    import('../../app/views/premises.js'),
    import('../../app/views/dynamics.js'),
    import('../../app/views/tempo.js'),
    import('../../app/views/strategy.js'),
    import('../../app/views/capital.js'),
    import('../../app/views/watch.js'),
    import('../../app/views/measurement.js'),
  ]);

  const ctx = {
    state,
    store,
    api,
    now: NOW,
    navigate: () => {},
    refresh: () => {},
    warnings: [],
  };
  const root = window.document.getElementById('view');
  const focus = (type, id) => {
    const resolved = resolveLinkedEntity(state, type, id);
    assert.ok(resolved, `${type}:${id} must resolve`);
    return resolved;
  };
  const assertFocusRow = (type, id, render, selector, dataAttribute, expectedValue = id) => {
    const resolved = focus(type, id);
    renderAt(root, render, ctx, resolved.route);
    const row = [...root.querySelectorAll(selector)].find((node) => node.getAttribute(dataAttribute) === expectedValue);
    assert.ok(row, `${type}:${id} should be present at ${resolved.route}`);
    assert.ok(row.classList.contains('lineage-selected'), `${type}:${id} should be visibly selected`);
    return resolved;
  };

  const lesson = state.retros.flatMap((retro) => retro.lessons || [])[0];
  const lessonRoute = assertFocusRow('lesson', lesson.id, renderLearning, '[data-lesson-id]', 'data-lesson-id');
  assert.equal(routeQuery(lessonRoute.route).get('tab'), 'ledger');

  const readiness = state.readiness[0];
  const readinessRoute = assertFocusRow('readiness', readiness.id, renderReadiness, '[data-readiness-seat]', 'data-readiness-seat', readiness.seat);
  assert.equal(routeQuery(readinessRoute.route).get('seat'), readiness.seat);

  const portfolioItem = state.portfolio[0];
  assertFocusRow('portfolio', portfolioItem.id, renderCapacity, 'tr[data-portfolio-item-id]', 'data-portfolio-item-id');

  const challenge = state.forecastChallenges[0];
  const challengeRoute = assertFocusRow('forecast', challenge.id, renderForecasts, 'tr[data-forecast-challenge-id]', 'data-forecast-challenge-id');
  assert.equal(routeQuery(challengeRoute.route).get('tab'), 'challenges');

  const draft = state.commsDrafts.find((row) => row.status === 'draft');
  const commsRoute = assertFocusRow('comms', draft.id, renderComms, '[data-comms-draft-id]', 'data-comms-draft-id');
  assert.equal(routeQuery(commsRoute.route).get('tab'), 'approve');

  const premise = state.premises[0];
  assertFocusRow('premise', premise.id, renderPremises, 'tr[data-premise-id]', 'data-premise-id');
  const premiseOutcome = state.premiseOutcomes[0];
  assertFocusRow('premiseOutcome', premiseOutcome.id, renderPremises, 'tr[data-premise-outcome-id]', 'data-premise-outcome-id');

  const experiment = state.dynamicsExperiments[0];
  const experimentRoute = assertFocusRow('dynamics', experiment.id, renderDynamics, '[data-dynamics-experiment-id]', 'data-dynamics-experiment-id');
  assert.equal(routeQuery(experimentRoute.route).get('tab'), 'lab');

  const schedule = state.tempoSchedules[0];
  const scheduleRoute = focus('tempo', schedule.id);
  renderAt(root, renderTempo, ctx, scheduleRoute.route);
  const timebox = root.querySelector(`#tempo-${schedule.id}`);
  assert.ok(timebox?.classList.contains('lineage-selected'), 'the exact timebox, not only its decision, is focused');
  assert.equal(routeQuery(scheduleRoute.route).get('schedule'), schedule.id);

  const bet = state.strategyBets[0];
  assertFocusRow('strategy', bet.id, renderStrategy, '[data-strategy-bet-id]', 'data-strategy-bet-id');

  const policy = state.capitalPolicies[0];
  assertFocusRow('capital', policy.id, renderCapital, 'tr[data-capital-policy-id]', 'data-capital-policy-id');
  const checkpoint = state.dynamicsCheckpoints[0];
  assertFocusRow('checkpoint', checkpoint.id, renderCapital, 'tr[data-capital-checkpoint-id]', 'data-capital-checkpoint-id');

  const alert = state.watchAlerts[0];
  assertFocusRow('alert', alert.id, renderWatch, '[data-watch-alert-id]', 'data-watch-alert-id');
  const series = focus('series', 'open-cases');
  renderAt(root, renderWatch, ctx, series.route);
  assert.ok([...root.querySelectorAll('[data-watch-series-id]')]
    .some((node) => node.getAttribute('data-watch-series-id') === 'open-cases' && node.classList.contains('lineage-selected')));

  const scorecard = state.scorecards[0];
  const scorecardRoute = assertFocusRow('scorecard', scorecard.id, renderMeasurement, '[data-scorecard-id]', 'data-scorecard-id');
  scorecard.observation = { recordedOn: '2026-10-28', source: 'review' };
  renderAt(root, renderMeasurement, ctx, scorecardRoute.route);
  assert.ok([...root.querySelectorAll('button')].some((button) => button.textContent === 'Close the cycle'),
    'a committed scorecard with a recorded observation renders its close-cycle action');
  const retiredScorecard = {
    ...structuredClone(scorecard),
    id: 'scorecard-retired-link-test',
    title: 'Retired scorecard retained for provenance',
    status: 'retired',
  };
  state.scorecards.push(retiredScorecard);
  assertFocusRow('scorecard', retiredScorecard.id, renderMeasurement, '[data-scorecard-id]', 'data-scorecard-id');

  assert.equal(state.forecastChallenges[0].status, 'open', 'opening a deep link did not record a challenge response');
  assert.equal(state.premiseOutcomes[0].verdict, 'inconclusive', 'opening a deep link did not rewrite the append-only assessment');
  dom.window.close();
});
