/**
 * tests/app/calibration.test.mjs — Forecast Calibration & Reference-Class
 * Learning (Schema v21, Session 31).
 *
 * Covers: Brier/Murphy/reliability maths on known pairs; forecast capture at
 * decide time with the anti-hindsight freeze after review; RULE-FCT-01
 * funding-time forecast snapshots (immutable under later estimate edits,
 * cleared on un-funding); delivery actuals capture/backfill with validation;
 * estimate-calibration statistics (ratio distribution, interval coverage,
 * Flyvbjerg uplift floors); RULE-FCT-02 one-shot governance decision on
 * systematic optimism; FCT-01..04 signals (silent on the demo baseline);
 * scenario-decision auto-forecast from CRN overload odds; the `calibration`
 * CSV scope with CWE-1236 safety; v20→v21 additive migration; and the
 * #/decisions calibration card + #/capacity delivery dialog in JSDOM.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import {
  brierScore,
  calibrationCurve,
  calibrationSummary,
  decisionCalibration,
  decisionForecastPairs,
  estimateCalibration,
  estimatePairs,
  missingActualItems,
  murphyDecomposition,
  normalizeForecastPercent,
  referenceClassAdjustment,
  negotiationSettlementCalibration,
  negotiationSettlementPairs,
  NEGOTIATION_MATERIAL_SHORTFALL_PCT,
} from '../../app/core/domain/calibration.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { compareScenarios } from '../../app/core/domain/scenarios.js';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const NOW = new Date('2026-10-26T10:00:00.000Z');
const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const flush = () => new Promise((r) => setTimeout(r, 15));

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

function harness() {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const store = createStore({ storage: memStorage(), now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api };
}

/** Fund + deliver one item with a known estimate and actual; returns the id. */
function deliverItem(api, ownerId, { title, effort, actual, createdOn = '2026-09-01', completedOn = '2026-10-20', targetOn = null }) {
  const created = api.addPortfolioItem({
    title,
    kind: 'project',
    decision: 'funded',
    ownerId,
    createdOn,
    targetOn,
    effortDays: effort,
    value: { optimistic: 10000, mostLikely: 20000, pessimistic: 30000 },
  });
  assert.equal(created.ok, true, `fund ${title}: ${created.error || ''}`);
  if (actual !== undefined) {
    const done = api.completePortfolioItem(created.id, { completedOn, actualEffortDays: actual });
    assert.equal(done.ok, true, `deliver ${title}: ${done.error || ''}`);
    return { id: created.id, complete: done };
  }
  const done = api.completePortfolioItem(created.id, { completedOn });
  assert.equal(done.ok, true, `deliver ${title}: ${done.error || ''}`);
  return { id: created.id, complete: done };
}

function settlementRecord({
  id,
  currency = 'USD',
  direction = 'maximize',
  agreedValue = 100,
  realisedValue = 100,
  counterpartyDelivered = true,
} = {}) {
  return {
    id,
    title: `Negotiation ${id}`,
    status: 'agreed',
    openedOn: '2026-01-01',
    closedOn: '2026-02-01',
    stakesCurrency: currency,
    stakesValue: agreedValue,
    issues: [{ id: `issue-${id}`, unit: currency, direction, weight: 5 }],
    agreedTerms: [],
    settlement: {
      settledOn: '2026-03-01',
      realisedValue,
      counterpartyDelivered,
      note: realisedValue === null ? 'Manual follow-up requested.' : '',
    },
  };
}

test('Brier, Murphy decomposition and reliability quintiles on known forecast pairs; Cromwell clamping', () => {
  const state = {
    decisions: [
      { id: 'd1', title: 'A', date: '2026-08-01', chosen: 'x', reviewedOn: '2026-09-01', outcome: 'good', forecastProbability: 90 },
      { id: 'd2', title: 'B', date: '2026-08-02', chosen: 'x', reviewedOn: '2026-09-02', outcome: 'good', forecastProbability: 80 },
      { id: 'd3', title: 'C', date: '2026-08-03', chosen: 'x', reviewedOn: '2026-09-03', outcome: 'mixed', forecastProbability: 70 },
      { id: 'd4', title: 'D', date: '2026-08-04', chosen: 'x', reviewedOn: '2026-09-04', outcome: 'bad', forecastProbability: 60 },
      { id: 'd5', title: 'E', date: '2026-08-05', chosen: 'x', reviewedOn: '2026-09-05', outcome: 'good', forecastProbability: 50 },
      { id: 'd6', title: 'F (no forecast)', date: '2026-08-06', chosen: 'x', reviewedOn: '2026-09-06', outcome: 'good', forecastProbability: null },
      { id: 'd7', title: 'G (unreviewed)', date: '2026-08-07', chosen: 'x', reviewedOn: null, outcome: 'pending', forecastProbability: 75 },
    ],
  };
  const pairs = decisionForecastPairs(state);
  assert.equal(pairs.length, 5, 'only reviewed decisions with a recorded forecast are scored');
  // ((.1)^2+(.2)^2+(.2)^2+(.6)^2+(.5)^2)/5 = 0.70/5
  assert.equal(brierScore(pairs), 0.14);

  const murphy = murphyDecomposition(pairs);
  assert.equal(murphy.reliability, 0.123);
  assert.equal(murphy.resolution, 0.135);
  assert.equal(murphy.uncertainty, 0.16);
  assert.equal(murphy.residual, -0.008, 'fractional-outcome residual is reported, not hidden');

  const curve = calibrationCurve(pairs);
  assert.deepEqual(curve.map((b) => b.count), [0, 0, 1, 2, 2]);
  assert.equal(curve[4].meanForecast, 0.85);
  assert.equal(curve[4].observedRate, 1);
  assert.equal(curve[3].observedRate, 0.25);

  const cal = decisionCalibration(state);
  assert.equal(cal.sufficient, true);
  assert.equal(cal.biasPp, 0);
  assert.equal(cal.verdict.id, 'well-calibrated');
  assert.equal(cal.pendingForecasts, 1);
  assert.equal(cal.reviewedTotal, 6);

  // Cromwell's rule at the domain boundary.
  assert.equal(normalizeForecastPercent(100), 95);
  assert.equal(normalizeForecastPercent(0), 5);
  assert.equal(normalizeForecastPercent('not a number'), null);
  assert.equal(normalizeForecastPercent(''), null);
});

test('Negotiation settlement calibration keeps currency/direction cohorts separate, withholds small-sample statistics, and raises NEG-09 at the 20% review guardrail', () => {
  assert.equal(NEGOTIATION_MATERIAL_SHORTFALL_PCT, 20);
  const negotiations = [
    ...Array.from({ length: 5 }, (_, index) => settlementRecord({
      id: `usd-max-${index + 1}`,
      currency: 'USD',
      direction: 'maximize',
      agreedValue: 100,
      realisedValue: 80,
    })),
    ...Array.from({ length: 5 }, (_, index) => settlementRecord({
      id: `usd-min-${index + 1}`,
      currency: 'USD',
      direction: 'minimize',
      agreedValue: 100,
      realisedValue: 80,
    })),
    ...Array.from({ length: 4 }, (_, index) => settlementRecord({
      id: `eur-max-${index + 1}`,
      currency: 'EUR',
      direction: 'maximize',
      agreedValue: 100,
      realisedValue: 40,
    })),
    settlementRecord({ id: 'missing-realised', currency: 'GBP', agreedValue: 200, realisedValue: null }),
    settlementRecord({ id: 'zero-baseline', currency: 'USD', agreedValue: 0, realisedValue: 0 }),
  ];
  const state = { negotiations };
  const calibration = negotiationSettlementCalibration(state);
  const cohort = (currency, direction) => calibration.cohorts.find((item) => item.currency === currency && item.direction === direction);
  const usdMax = cohort('USD', 'maximize');
  const usdMin = cohort('USD', 'minimize');
  const eurMax = cohort('EUR', 'maximize');

  assert.equal(calibration.settledCount, 16, 'all settled agreements are counted, including unscorable records');
  assert.equal(calibration.scoredCount, 14);
  assert.equal(calibration.missingActuals, 2);
  assert.equal(negotiationSettlementPairs(state).length, 14);
  assert.equal(calibration.cohorts.length, 3, 'different currencies and directions never merge');

  assert.equal(usdMax.n, 5);
  assert.equal(usdMax.sufficient, true);
  assert.equal(usdMax.medianFavorableVariancePct, -20);
  assert.equal(usdMax.medianShortfallPct, 20, 'a 20% median shortfall meets the inclusive review trigger');
  assert.equal(usdMax.p80ShortfallPct, 20);
  assert.equal(usdMax.materialShortfall, true);
  assert.equal(usdMax.deliveryRate, 1);

  assert.equal(usdMin.n, 5);
  assert.equal(usdMin.medianFavorableVariancePct, 20, 'lower actual value is favorable for a cost-minimising issue');
  assert.equal(usdMin.medianShortfallPct, 0);
  assert.equal(usdMin.materialShortfall, false);

  assert.equal(eurMax.n, 4);
  assert.equal(eurMax.sufficient, false);
  assert.equal(eurMax.verdict.id, 'collecting');
  assert.equal(eurMax.medianFavorableVariancePct, null);
  assert.equal(eurMax.medianShortfallPct, null);
  assert.equal(eurMax.p80ShortfallPct, null);
  assert.equal(eurMax.deliveryRate, null);

  const insightState = buildDemoState(NOW);
  insightState.negotiations = negotiations;
  const signals = buildInsights(insightState, NOW).findings.filter((finding) => finding.ruleId === 'NEG-09');
  assert.equal(signals.length, 1, 'only the sufficient USD cost/value direction cohort meeting the trigger raises NEG-09');
  assert.match(signals[0].title, /USD value-maximising.*20%.*n=5/);
  assert.equal(signals[0].action.route, '#/decisions');
  assert.match(signals[0].detail, /not a negotiation-skill or employee-performance score/);
});

test('Forecast capture at decide time, outcome scoring, and the anti-hindsight freeze', () => {
  const { store, api } = harness();
  const created = api.addDecision({ title: 'Adopt trunk-based development', date: '2026-10-01', reviewOn: '2026-10-20' });
  assert.equal(created.ok, true);

  // Out-of-range certainty claims are rejected with coaching, not clamped.
  const tooSure = api.decideDecision(created.id, { chosen: 'Adopt trunk-based', forecastProbability: 99 });
  assert.equal(tooSure.ok, false);
  assert.match(tooSure.error, /5% and 95%/);

  const decided = api.decideDecision(created.id, {
    chosen: 'Adopt trunk-based',
    rationale: 'Merge pain dominates review pain at our size.',
    reviewOn: '2026-10-20',
    forecastProbability: 70,
  });
  assert.equal(decided.ok, true);
  assert.equal(store.state.decisions.find((d) => d.id === created.id).forecastProbability, 70);

  const reviewed = api.reviewDecision(created.id, { outcome: 'good', outcomeNotes: 'Lead time halved.', reviewedOn: '2026-10-20' });
  assert.equal(reviewed.ok, true);

  const pairs = decisionForecastPairs(store.state);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].brier, 0.09, '(0.70 − 1.0)^2');

  // Anti-hindsight: rewriting the forecast after the outcome is known is refused.
  const rewrite = api.updateDecision(created.id, { forecastProbability: 95 });
  assert.equal(rewrite.ok, false);
  assert.match(rewrite.error, /frozen once the outcome has been reviewed/);
  assert.equal(store.state.decisions.find((d) => d.id === created.id).forecastProbability, 70);

  // A forecast attached to no actual call never enters the record.
  const open = api.addDecision({ title: 'Undecided thing', date: '2026-10-10', forecastProbability: 60 });
  assert.equal(open.ok, true);
  assert.equal(store.state.decisions.find((d) => d.id === open.id).forecastProbability, null);
});

test('RULE-FCT-01: funding freezes the forecast; edits cannot rewrite it; un-funding clears it', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Ada Lovelace', role: 'Staff Engineer', startDate: '2025-01-10' });

  const created = api.addPortfolioItem({
    title: 'Billing export pipeline',
    decision: 'undecided',
    ownerId: owner.id,
    effortDays: { optimistic: 4, mostLikely: 6, pessimistic: 10 },
    value: { optimistic: 10000, mostLikely: 20000, pessimistic: 30000 },
  });
  assert.equal(created.ok, true);
  assert.equal(store.state.portfolio.find((p) => p.id === created.id).forecastSnapshot, null, 'unfunded work has no frozen forecast');

  const funded = api.setPortfolioDecision(created.id, { decision: 'funded', rationale: 'Quarter commitment' });
  assert.equal(funded.ok, true);
  assert.ok(funded.propagations.some((p) => p.ruleId === 'RULE-FCT-01'), 'freeze is reported as a propagation');
  const snap = store.state.portfolio.find((p) => p.id === created.id).forecastSnapshot;
  assert.ok(snap, 'snapshot frozen at funding');
  assert.equal(snap.effortExpected, 6.33); // (4 + 4*6 + 10) / 6
  assert.equal(snap.fundedOn, '2026-10-26');

  // Mid-flight estimate revision must NOT rewrite the frozen belief.
  const edited = api.updatePortfolioItem(created.id, { effortDays: { optimistic: 2, mostLikely: 3, pessimistic: 4 } });
  assert.equal(edited.ok, true);
  const snapAfterEdit = store.state.portfolio.find((p) => p.id === created.id).forecastSnapshot;
  assert.equal(snapAfterEdit.effortExpected, 6.33, 'snapshot survives estimate edits — history is not rewritten');

  // Un-funding clears the snapshot so a later re-funding freezes the new commitment.
  const deferred = api.setPortfolioDecision(created.id, { decision: 'deferred', rationale: 'Capacity went to the incident' });
  assert.equal(deferred.ok, true);
  assert.equal(store.state.portfolio.find((p) => p.id === created.id).forecastSnapshot, null);

  const refunded = api.setPortfolioDecision(created.id, { decision: 'funded', rationale: 'Back on the plan' });
  assert.equal(refunded.ok, true);
  const snap2 = store.state.portfolio.find((p) => p.id === created.id).forecastSnapshot;
  assert.equal(snap2.effortExpected, 3, 're-funding freezes the revised estimate (2 + 4*3 + 4) / 6');

  // Work created already-funded freezes at creation.
  const bornFunded = api.addPortfolioItem({
    title: 'Born funded',
    decision: 'funded',
    ownerId: owner.id,
    effortDays: { optimistic: 3, mostLikely: 5, pessimistic: 7 },
    value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
  });
  assert.equal(bornFunded.ok, true);
  assert.ok(bornFunded.propagations.some((p) => p.ruleId === 'RULE-FCT-01'));
  assert.ok(store.state.portfolio.find((p) => p.id === bornFunded.id).forecastSnapshot);
});

test('Delivery actuals: capture with validation, honest blanks, backfill via recordPortfolioActuals', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Grace Hopper', role: 'Senior Engineer', startDate: '2025-02-10' });

  const { id: withActual } = deliverItem(api, owner.id, {
    title: 'With actuals',
    effort: { optimistic: 2, mostLikely: 4, pessimistic: 6 },
    actual: 5,
  });
  const stored = store.state.portfolio.find((p) => p.id === withActual);
  assert.equal(stored.actualEffortDays, 5);
  assert.equal(estimatePairs(store.state).length, 1);

  const { id: blank } = deliverItem(api, owner.id, {
    title: 'Delivered blind',
    effort: { optimistic: 2, mostLikely: 4, pessimistic: 6 },
  });
  assert.deepEqual(missingActualItems(store.state).map((m) => m.itemId), [blank]);

  // Negative actuals are rejected; actuals on open work are rejected.
  const openItem = api.addPortfolioItem({
    title: 'Still open',
    decision: 'funded',
    ownerId: owner.id,
    effortDays: { optimistic: 1, mostLikely: 2, pessimistic: 3 },
    value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
  });
  const neg = api.completePortfolioItem(openItem.id, { completedOn: '2026-10-26', actualEffortDays: -3 });
  assert.equal(neg.ok, false);
  assert.match(neg.error, /zero or more/);
  const early = api.recordPortfolioActuals(openItem.id, { actualEffortDays: 2 });
  assert.equal(early.ok, false);
  assert.match(early.error, /only be recorded once work is delivered/);

  // Backfill closes the loop.
  const backfill = api.recordPortfolioActuals(blank, { actualEffortDays: 6.5, actualValue: 18000 });
  assert.equal(backfill.ok, true);
  assert.equal(missingActualItems(store.state).length, 0);
  const pair = estimatePairs(store.state).find((p) => p.itemId === blank);
  assert.equal(pair.actual, 6.5);
  assert.equal(pair.source, 'snapshot');
  assert.equal(store.state.events.some((e) => e.type === 'portfolio.actuals'), true, 'backfill is audit-logged');
});

test('Estimate calibration statistics: ratio distribution, interval coverage, reference-class floors', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Ada Lovelace', role: 'Staff Engineer', startDate: '2025-01-10' });

  // effort {2,4,6} -> expected 4.0; ratios [1.25, 1.5, 1.0, 2.0, 1.25, 1.5]
  [5, 6, 4, 8, 5, 6].forEach((actual, i) => {
    deliverItem(api, owner.id, {
      title: `Item ${i}`,
      effort: { optimistic: 2, mostLikely: 4, pessimistic: 6 },
      actual,
      targetOn: '2026-10-15',
    });
  });

  const cal = estimateCalibration(store.state);
  assert.equal(cal.n, 6);
  assert.equal(cal.sufficient, true);
  assert.equal(cal.medianRatio, 1.375, 'median of [1.0,1.25,1.25,1.5,1.5,2.0]');
  assert.equal(cal.verdict.id, 'optimistic');
  assert.equal(cal.withinRangeRate, 0.8333, 'only the 8d actual escaped [2,6]');
  assert.equal(cal.schedule.onTimeRate, 0, 'all six missed the 2026-10-15 target (delivered 2026-10-20)');
  assert.equal(cal.schedule.medianSlipDays, 5);

  const adj = referenceClassAdjustment(10, cal);
  assert.equal(adj.adjustedDays, 13.75);
  assert.ok(adj.adjustedP80Days > adj.adjustedDays, 'P80 uplift exceeds the median uplift');

  // Below the hint floor there is no factor — a two-item superstition is refused.
  const thin = estimateCalibration({
    portfolio: store.state.portfolio.slice(0, 2),
  });
  assert.equal(thin.hintReady, false);
  assert.equal(referenceClassAdjustment(10, thin), null);
  assert.equal(thin.verdict.id, 'collecting');
});

test('RULE-FCT-02: systematic optimism opens exactly one governance decision, linked to the worst overrun', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Ada Lovelace', role: 'Staff Engineer', startDate: '2025-01-10' });

  // effort {4,5,6} -> expected 5.0; actuals make ratios [1.4,1.6,1.8,1.4,1.6] -> median 1.6.
  const actuals = [7, 8, 9, 7, 8];
  let lastComplete = null;
  actuals.forEach((actual, i) => {
    const r = deliverItem(api, owner.id, {
      title: `Optimistic ${i}`,
      effort: { optimistic: 4, mostLikely: 5, pessimistic: 6 },
      actual,
    });
    lastComplete = r.complete;
  });

  assert.ok(lastComplete.propagations.some((p) => p.ruleId === 'RULE-FCT-02'), 'fifth delivery triggers the rule');
  const fctDecisions = store.state.decisions.filter((d) => d.title.startsWith('Forecast calibration:'));
  assert.equal(fctDecisions.length, 1);
  assert.match(fctDecisions[0].question, /median item took 1\.6×/);
  assert.equal(fctDecisions[0].options.length, 4, 'uplift, P80 uplift, investigate, accept');
  const links = store.state.links.filter((l) => l.ruleId === 'RULE-FCT-02');
  assert.equal(links.length, 1);
  const worst = store.state.portfolio.find((p) => p.id === links[0].targetId);
  assert.equal(worst.title, 'Optimistic 2', 'linked to the worst overrun (9d vs 5d = 1.8×)');
  assert.equal(links[0].relation, 'decides');

  // A sixth overrun while the decision awaits review does not stack a duplicate.
  const sixth = deliverItem(api, owner.id, {
    title: 'Optimistic 5',
    effort: { optimistic: 4, mostLikely: 5, pessimistic: 6 },
    actual: 9,
  });
  assert.equal(sixth.complete.propagations.some((p) => p.ruleId === 'RULE-FCT-02'), false);
  assert.equal(store.state.decisions.filter((d) => d.title.startsWith('Forecast calibration:')).length, 1);
  assert.ok(store.state.events.some((e) => e.type === 'automation.propagated' && e.summary.includes('RULE-FCT-02')));
});

test('FCT-01..04 signals fire on evidence and stay silent on the demo baseline', () => {
  // Demo: 7 estimate pairs (2 before Schema v33; the Allocation Governor's
  // settled demo history adds 5 honestly-scored pairs), 1 scored decision,
  // 0 missing actuals -> no FCT noise.
  const demo = buildDemoState(NOW);
  const demoFindings = buildInsights(demo, NOW).findings.filter((f) => f.ruleId.startsWith('FCT-'));
  assert.equal(demoFindings.length, 0, 'demo baseline carries no calibration findings (small samples stay descriptive)');
  const demoCal = calibrationSummary(demo);
  assert.equal(demoCal.decisions.brier, 0.04);
  assert.equal(demoCal.estimates.n, 7);

  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Grace Hopper', role: 'Senior Engineer', startDate: '2025-02-10' });

  // Optimistic + intervals-too-narrow evidence (n=6).
  [7, 8, 9, 7, 8, 3].forEach((actual, i) => {
    deliverItem(api, owner.id, {
      title: `Signal item ${i}`,
      effort: { optimistic: 4, mostLikely: 5, pessimistic: 6 },
      actual,
    });
  });
  // Three delivered without actuals -> FCT-04.
  [0, 1, 2].forEach((i) => {
    deliverItem(api, owner.id, {
      title: `Blind item ${i}`,
      effort: { optimistic: 4, mostLikely: 5, pessimistic: 6 },
    });
  });
  // Five overconfident decision forecasts (mean 80%, outcomes all bad) -> FCT-03.
  for (let i = 0; i < 5; i += 1) {
    const d = api.addDecision({ title: `Rosy call ${i}`, date: '2026-09-01', reviewOn: '2026-10-01' });
    assert.equal(api.decideDecision(d.id, { chosen: 'Go', forecastProbability: 80, reviewOn: '2026-10-01' }).ok, true);
    assert.equal(api.reviewDecision(d.id, { outcome: 'bad', reviewedOn: '2026-10-01' }).ok, true);
  }

  const findings = buildInsights(store.state, NOW).findings;
  const byRule = (id) => findings.filter((f) => f.ruleId === id);
  assert.equal(byRule('FCT-01').length, 1, 'systematic optimism signal');
  assert.match(byRule('FCT-01')[0].title, /runs 1\.5× its estimates/);
  assert.equal(byRule('FCT-02').length, 1, 'intervals too narrow (1/6 inside range)');
  assert.equal(byRule('FCT-03').length, 1, 'decision overconfidence (+80pp)');
  assert.match(byRule('FCT-03')[0].title, /overconfident/);
  assert.equal(byRule('FCT-04').length, 1, 'missing actuals prompt at three');
  for (const f of findings.filter((x) => x.ruleId.startsWith('FCT-'))) {
    assert.equal(f.action.route, '#/decisions', 'all calibration signals route to the calibration card');
    assert.ok(f.evidence.length >= 1, 'findings carry evidence');
  }
});

test('Scenario decisions record a structured forecast from CRN overload odds', () => {
  const { store, api } = harness();
  const p1 = api.addPerson({ name: 'Ada Lovelace', role: 'Staff Engineer', startDate: '2025-01-10' });
  const itemA = api.addPortfolioItem({
    title: 'Core ledger migration',
    kind: 'project',
    decision: 'funded',
    ownerId: p1.id,
    effortDays: { optimistic: 8, mostLikely: 12, pessimistic: 20 },
    value: { optimistic: 80000, mostLikely: 120000, pessimistic: 160000 },
  });
  const itemB = api.addPortfolioItem({
    title: 'Low-value internal polish',
    kind: 'project',
    decision: 'funded',
    ownerId: p1.id,
    effortDays: { optimistic: 6, mostLikely: 10, pessimistic: 16 },
    value: { optimistic: 5000, mostLikely: 8000, pessimistic: 12000 },
  });
  assert.equal(itemA.ok && itemB.ok, true);

  const spec = {
    id: 'scn-forecast',
    name: 'Defer the polish',
    levers: { portfolioDecisions: [{ itemId: itemB.id, decision: 'deferred' }] },
  };
  const cmp = compareScenarios(store.state, [spec], { now: NOW });
  const expected = Math.min(95, Math.max(5, Math.round(100 - cmp.scenarios[1].monteCarlo.overloadProbability * 100)));

  const logged = api.recordScenarioDecision({ scenarioSpec: spec, rationale: 'Testing the calibration hook.' });
  assert.equal(logged.ok, true, logged.error || '');
  const decision = store.state.decisions.find((d) => d.id === logged.id);
  assert.equal(decision.forecastProbability, expected, 'forecast = 100 − chosen-scenario overload odds, Cromwell-clamped');
  assert.ok(decision.forecastProbability >= 5 && decision.forecastProbability <= 95);
});

test('Schema v20 → v21 migration is additive; normalization never invents forecasts or actuals', () => {
  assert.equal(SCHEMA_VERSION, 53);
  const v20 = {
    schemaVersion: 20,
    settings: {},
    people: [{ id: 'p1', name: 'Ada Lovelace', status: 'active' }],
    portfolio: [{
      id: 'pf-old',
      title: 'Legacy delivered work',
      kind: 'project',
      status: 'done',
      decision: 'funded',
      ownerId: 'p1',
      effortDays: { optimistic: 2, mostLikely: 4, pessimistic: 6 },
      value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
      createdOn: '2026-08-01',
      completedOn: '2026-09-01',
    }],
    decisions: [{
      id: 'dec-old',
      title: 'Legacy call',
      date: '2026-08-01',
      chosen: 'Ship it',
      reviewedOn: '2026-09-01',
      outcome: 'good',
    }],
  };
  const migrated = migrate(v20);
  assert.deepEqual(migrated.applied, ['20 → 21', '21 → 22', '22 → 23', '23 → 24', '24 → 25', '25 → 26', '26 → 27', '27 → 28', '28 → 29', '29 → 30', '30 → 31', '31 → 32', '32 → 33', '33 → 34', '34 → 35', '35 → 36', '36 → 37', '37 → 38', '38 → 39', '39 → 40', '40 → 41', '41 → 42', '42 → 43', '43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48', '48 → 49', '49 → 50', '50 → 51', '51 → 52', '52 → 53']);
  const { state } = normalizeState(migrated.raw, { now: NOW });
  const item = state.portfolio.find((p) => p.id === 'pf-old');
  assert.equal(item.actualEffortDays, null, 'no actual is invented for legacy deliveries');
  assert.equal(item.actualValue, null);
  assert.equal(item.forecastSnapshot, null, 'no snapshot is fabricated for pre-v21 funding');
  assert.equal(state.decisions.find((d) => d.id === 'dec-old').forecastProbability, null, 'no 50% default is invented');

  // Legacy deliveries score against the current estimate and say so.
  const pairs = estimatePairs({
    portfolio: [{ ...item, actualEffortDays: 6 }],
  });
  assert.equal(pairs[0].source, 'current-estimate');
  assert.equal(pairs[0].ratio, 1.5, '6d actual vs 4d expected');

  // Invalid persisted values are repaired to null, never clamped into data.
  const dirty = normalizeState({
    schemaVersion: 21,
    portfolio: [{ ...v20.portfolio[0], actualEffortDays: -4, forecastSnapshot: { effortExpected: -1 } }],
    decisions: [{ ...v20.decisions[0], forecastProbability: 'banana' }],
  }, { now: NOW }).state;
  assert.equal(dirty.portfolio[0].actualEffortDays, null);
  assert.equal(dirty.portfolio[0].forecastSnapshot, null);
  assert.equal(dirty.decisions[0].forecastProbability, null);
});

test('Calibration CSV scope: scored rows, missing-actual rows, decisions Brier column, CWE-1236 safety', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Ada Lovelace', role: 'Staff Engineer', startDate: '2025-01-10' });

  const d = api.addDecision({ title: '=SUM(evil) migration call', date: '2026-09-01', reviewOn: '2026-10-01' });
  api.decideDecision(d.id, { chosen: 'Migrate', forecastProbability: 70, reviewOn: '2026-10-01' });
  api.reviewDecision(d.id, { outcome: 'mixed', reviewedOn: '2026-10-01' });

  deliverItem(api, owner.id, {
    title: 'Scored delivery',
    effort: { optimistic: 2, mostLikely: 4, pessimistic: 6 },
    actual: 6,
  });
  deliverItem(api, owner.id, {
    title: 'Unscored delivery',
    effort: { optimistic: 2, mostLikely: 4, pessimistic: 6 },
  });

  const out = exportWorkspaceCsv(store.state, 'calibration', { now: NOW });
  assert.equal(out.ok, true);
  assert.ok(!out.csv.includes('"=SUM'), 'formula payload never starts a cell unescaped');
  const { headers: header, rows } = parseCsv(out.csv);
  const col = (name) => header.indexOf(name);
  const dataRows = rows.filter((r) => r[col('record_type')]);
  const types = dataRows.map((r) => r[col('record_type')]).sort();
  assert.deepEqual(types, ['decision-forecast', 'effort-estimate', 'missing-actual']);
  const decRow = dataRows.find((r) => r[col('record_type')] === 'decision-forecast');
  assert.equal(decRow[col('forecast')], '70%');
  assert.equal(decRow[col('score')], '0.04', '(0.7 − 0.5)^2 for the mixed outcome');
  const estRow = dataRows.find((r) => r[col('record_type')] === 'effort-estimate');
  assert.equal(estRow[col('score')], '1.5');

  const decCsv = exportWorkspaceCsv(store.state, 'decisions', { now: NOW });
  assert.equal(decCsv.ok, true);
  const { headers: dHeader, rows: decRows } = parseCsv(decCsv.csv);
  assert.ok(dHeader.includes('forecast_probability_pct'));
  assert.ok(dHeader.includes('brier_contribution'));
  const row = decRows.find((r) => r[dHeader.indexOf('decision_id')] === d.id);
  assert.equal(row[dHeader.indexOf('forecast_probability_pct')], '70');
  assert.equal(row[dHeader.indexOf('brier_contribution')], '0.04');
});

test('Negotiation settlement calibration CSV exports scored pairs, count-only cohorts, and the incomplete-settlement follow-up list', () => {
  const state = buildDemoState(NOW);
  state.negotiations = [
    settlementRecord({ id: 'csv-settled', currency: 'EUR', direction: 'minimize', agreedValue: 120, realisedValue: 90 }),
    settlementRecord({ id: 'csv-missing', currency: 'EUR', direction: 'minimize', agreedValue: 120, realisedValue: null }),
  ];
  const out = exportWorkspaceCsv(state, 'calibration', { now: NOW });
  assert.equal(out.ok, true);
  const { headers, rows } = parseCsv(out.csv);
  const col = (name) => headers.indexOf(name);
  const negotiationRows = rows.filter((row) => row[col('record_type')]?.startsWith('negotiation-'));
  assert.deepEqual(
    negotiationRows.map((row) => row[col('record_type')]).sort(),
    ['negotiation-missing-actual', 'negotiation-reference-class', 'negotiation-settlement'],
  );
  const pair = negotiationRows.find((row) => row[col('record_type')] === 'negotiation-settlement');
  assert.equal(pair[col('forecast')], 'EUR 120');
  assert.equal(pair[col('actual_or_outcome')], 'EUR 90');
  assert.equal(pair[col('score')], '25');
  assert.match(pair[col('scored_against')], /minimize-direction variance/);

  const cohort = negotiationRows.find((row) => row[col('record_type')] === 'negotiation-reference-class');
  assert.equal(cohort[col('forecast')], '1 comparable settlement(s)');
  assert.equal(cohort[col('actual_or_outcome')], 'Counts only');
  assert.equal(cohort[col('score')], '');
  assert.match(cohort[col('scored_against')], /counts only below n=5/);

  const missing = negotiationRows.find((row) => row[col('record_type')] === 'negotiation-missing-actual');
  assert.equal(missing[col('record_id')], 'csv-missing');
  assert.equal(missing[col('actual_or_outcome')], 'not comparable');
  assert.match(missing[col('scored_against')], /realised deal value is not recorded/i);
});

test('AUTOMATION_RULES catalogues calibration and negotiation-settlement rules with named frameworks', () => {
  const fct = AUTOMATION_RULES.filter((r) => r.id.startsWith('RULE-FCT-'));
  assert.equal(fct.length, 4, 'FCT-03/FCT-04 joined FCT-01/FCT-02 with the Schema v22 case-cost ledger');
  assert.match(fct[0].framework, /Tetlock/);
  assert.match(fct[1].framework, /Flyvbjerg/);
  assert.match(fct[2].framework, /FAIR/);
  assert.match(fct[3].framework, /Actuarial/);
  assert.equal(fct[0].targetModule, 'portfolio');
  assert.equal(fct[1].targetModule, 'decisions');
  assert.equal(fct[2].targetModule, 'cases');
  assert.equal(fct[3].targetModule, 'decisions');

  const settlement = AUTOMATION_RULES.find((rule) => rule.id === 'RULE-NEG-07');
  assert.ok(settlement);
  assert.match(settlement.framework, /Flyvbjerg.*Perold/);
  assert.equal(settlement.trigger, 'negotiation.settled');
  assert.match(settlement.targetModule, /calibration.*insights/);
  assert.match(settlement.description, /No FX conversion/);
});

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
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

test('UI: #/decisions calibration card renders with chart; #/capacity Deliver dialog records actuals; axe-clean', async () => {
  const env = bootDom();
  let app = null;
  try {
    const { createApp } = await import('../../app/main.js');
    app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    const owner = app.ctx.state.people[0];
    const addSettledDeal = (title, realisedValue) => {
      const made = app.api.addNegotiation({
        title,
        ownerId: owner.id,
        openedOn: '2026-10-01',
        stakesCurrency: 'USD',
        stakesValue: 100,
        issues: [{ name: 'Annual fee', unit: 'USD', direction: 'minimize', weight: 5 }],
      });
      assert.equal(made.ok, true);
      assert.equal(app.api.recordNegotiationAgreement(made.id, { closedOn: '2026-10-05' }).ok, true);
      return app.api.recordNegotiationSettlement(made.id, {
        settledOn: '2026-10-15',
        realisedValue,
        counterpartyDelivered: true,
      });
    };
    assert.equal(addSettledDeal('One scored settlement', 80).ok, true);
    assert.equal(addSettledDeal('Settlement awaiting realised actual', null).ok, true);

    app.navigate('#/decisions');
    await flush();
    const view = env.document.querySelector('#view');
    const text = view.textContent;
    assert.ok(text.includes('Forecast calibration'), 'calibration card present on #/decisions');
    assert.ok(text.includes('Brier score'));
    assert.ok(text.includes('0.04'), 'demo Brier shown');
    assert.ok(text.includes('Collecting evidence'), 'small-sample honesty on the demo');
    assert.ok(text.includes('Forecast'), 'decision card shows its forecast');
    const chartSvg = view.querySelector('svg[aria-label*="Calibration diagram"]');
    assert.ok(chartSvg, 'reliability diagram SVG with text summary');
    assert.ok(view.querySelector('table[aria-label*="calibration" i]') || view.textContent.includes('Calibration data table'));
    const settlementTable = view.querySelector('table[aria-label="Negotiation settlement reference classes by currency and direction"]');
    assert.ok(settlementTable, 'negotiation calibration joins the Decisions readout');
    assert.match(settlementTable.textContent, /USD · minimise cost/);
    assert.match(settlementTable.textContent, /Counts only \(requires n≥5\)/);
    assert.equal(settlementTable.querySelector('a'), null, 'small cohorts do not reveal a ranked source or performance statistic');
    assert.ok(text.includes('Settlements needing comparable actuals'));
    assert.ok(text.includes('Settlement awaiting realised actual'));
    assert.ok(text.includes('Open source agreement'), 'missing comparison values are actionable follow-up records');

    env.window.eval(AXE_SRC);
    const axeRes = await env.window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(axeRes.violations).map((v) => v.id), [], 'zero axe violations on #/decisions with calibration card');

    // Deliver flow: the button now opens the actuals dialog instead of
    // completing instantly.
    app.navigate('#/capacity');
    await flush();
    const deliverBtn = Array.from(env.document.querySelectorAll('#view button')).find((b) => b.textContent.trim() === 'Deliver');
    assert.ok(deliverBtn, 'a Deliver button exists for funded work');
    deliverBtn.click();
    await flush();
    const modal = env.document.querySelector('#modal-root');
    assert.ok(modal.textContent.includes('Forecast being scored'), 'dialog shows the frozen forecast');
    const actualInput = modal.querySelector('[name="actualEffortDays"]');
    assert.ok(actualInput, 'actual effort field exists');
    assert.equal(actualInput.value, '', 'actual is never pre-filled from the estimate');
    actualInput.value = '11';
    const saveBtn = modal.querySelector('.btn-primary');
    saveBtn.click();
    await flush();
    const delivered = app.ctx.state.portfolio.find((p) => p.status === 'done' && p.actualEffortDays === 11);
    assert.ok(delivered, 'actual effort recorded through the dialog');
    assert.deepEqual(env.consoleErrors, []);
  } finally {
    app?.destroy?.();
    env.dom.window.close();
  }
});
