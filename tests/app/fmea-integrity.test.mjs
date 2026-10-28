import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoState } from '../../app/core/demo.js';
import { normalizeState } from '../../app/core/schema.js';
import { computeFmea, computePertImpact, casesRollup, isFmeaRated } from '../../app/core/domain/cases.js';
import { buildCaseForecastSnapshot, caseCostPairs, caseCostCalibration } from '../../app/core/domain/calibration.js';
import { computeParetoFrontier, evaluateScenario } from '../../app/core/domain/scenarios.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { previewCasePropagations } from '../../app/core/domain/automation.js';

const NOW = new Date('2026-10-28T10:00:00Z');
const financial = {
  currency: 'USD', optimistic: 1000, mostLikely: 2000, pessimistic: 3000,
  mitigationCost: 500, capacityDaysOptimistic: 1, capacityDaysMostLikely: 2, capacityDaysPessimistic: 3,
};
const unrated = { severity: 9, probability: null, detectability: null };
function record(extra = {}) {
  return { id: 'unrated-fixture', title: 'Unrated exposure', kind: 'risk', status: 'open', openedOn: '2026-10-01', fmea: { ...unrated }, financial: { ...financial }, rca: {}, stakeholders: [], ...extra };
}

test('unrated FMEA keeps PERT magnitudes but withholds probability-dependent loss, ROI, priority and empty residual scores', () => {
  assert.equal(isFmeaRated(unrated), false);
  const fmea = computeFmea({ ...unrated, residualSeverity: '', residualProbability: '', residualDetectability: '' });
  assert.equal(fmea.rated, false);
  assert.equal(fmea.hasResidual, false);
  const impact = computePertImpact(financial, fmea);
  assert.equal(impact.cost.expected, 2000);
  assert.equal(impact.capacity.expected, 2);
  for (const key of ['preProbability', 'postProbability', 'expectedUnmitigatedLoss', 'expectedResidualLoss', 'expectedLossAvoided', 'netRiskAdjustedValue', 'mitigationRoi']) {
    assert.equal(impact[key], null, `${key} must remain unknown`);
  }
  const roll = casesRollup({ cases: [record()] }, NOW);
  assert.equal(roll.highPriority.length, 0);
  assert.equal(roll.unvaluedCases, 1);
  assert.equal(roll.valuedCases, 0);
  const previews = previewCasePropagations({ ...record(), propagateDecision: true }, {}, { now: NOW });
  const decision = previews.find((entry) => entry.ruleId === 'RULE-DEC-01');
  if (decision) assert.match(decision.detail, /not rated/i);
});

test('opening snapshot preserves unknown occurrence despite a later rating; cost magnitude is still scorable', () => {
  const opening = record();
  const snapshot = buildCaseForecastSnapshot(opening, '2026-10-01');
  assert.equal(snapshot.fmeaProbability, null);
  const closed = record({
    status: 'resolved', resolvedOn: '2026-10-26', fmea: { severity: 9, probability: 8, detectability: 7 },
    forecastSnapshot: snapshot,
    actuals: { materialised: true, realisedExposure: 3000, mitigationSpend: 500, divertedDays: 3, settledOn: '2026-10-26' },
  });
  const state = { cases: [closed] };
  const [pair] = caseCostPairs(state);
  assert.equal(pair.assessedProbability, null);
  assert.equal(pair.fmeaProbability, null);
  assert.equal(pair.occurrenceBrier, null);
  assert.equal(pair.expectedUnmitigatedLoss, null);
  assert.equal(pair.exposureRatio, 1.5);
  const calibration = caseCostCalibration(state);
  assert.equal(calibration.occurrence.n, 0);
  assert.equal(calibration.exposure.n, 1);
  assert.equal(calibration.aggregate.n, 0);
  const normalized = normalizeState({ ...buildDemoState(NOW), cases: [closed] }, { now: NOW }).state;
  assert.equal(normalized.cases[0].forecastSnapshot.fmeaProbability, null);
  assert.equal(caseCostPairs(normalized)[0].occurrenceBrier, null);
});

test('unrated case CSV does not export synthetic RPN or risk-adjusted loss', () => {
  const state = { ...buildDemoState(NOW), cases: [record()] };
  const { csv } = exportWorkspaceCsv(state, 'cases', { now: NOW });
  const { headers, rows } = parseCsv(csv);
  const row = rows[0];
  const cell = (name) => row[headers.indexOf(name)];
  assert.equal(cell('fmea_severity'), '9', 'a recorded partial rating is retained without inventing the missing ratings');
  assert.equal(cell('fmea_probability'), '');
  assert.equal(cell('fmea_rpn'), '');
  assert.equal(cell('fmea_action_priority'), '');
  assert.equal(cell('expected_unmitigated_loss'), '');
  assert.equal(cell('net_risk_adjusted_value'), '');
  assert.ok(Number(cell('pert_cost_expected')) > 0);
});

test('scenario valuation and Pareto claims are withheld for estimated cases with unrated occurrence', () => {
  const state = buildDemoState(NOW);
  state.cases.push(record());
  const evaluated = evaluateScenario(state, { id: 'baseline', name: 'Baseline', levers: {} }, { now: NOW, seed: 42, trials: 200 });
  assert.equal(evaluated.economics.unratedCaseCount, 1);
  assert.equal(evaluated.economics.measured, false);
  assert.equal(evaluated.economics.netRiskAdjustedValue, null);
  const [ranked] = computeParetoFrontier([evaluated]);
  assert.equal(ranked.paretoOptimal, null);
});

test('case UI leaves new and residual ratings blank and labels unrated valuation unknown', async () => {
  const fs = await import('node:fs');
  const { JSDOM, VirtualConsole } = await import('jsdom');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (error) => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8'), {
    url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'FileReader', 'localStorage']) {
    globalThis[name] = name === 'window' ? window : window[name];
  }
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: window.localStorage, now: () => NOW });
    const added = app.api.addCase({ title: 'Unrated UI case', kind: 'risk', openedOn: '2026-10-01', financial });
    assert.equal(added.ok, true, added.error);
    assert.equal(app.store.state.cases.find((row) => row.id === added.id).forecastSnapshot.fmeaProbability, null);
    app.navigate(`#/cases/${added.id}`);
    assert.match(window.document.querySelector('#view').textContent, /Unknown — occurrence not rated/);
    const click = (button) => button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    const resolve = [...window.document.querySelectorAll('#view button')].find((button) => button.textContent.includes('Resolve case'));
    assert.ok(resolve);
    click(resolve);
    for (const name of ['residualSeverity', 'residualProbability', 'residualDetectability']) {
      assert.equal(window.document.querySelector(`[name="${name}"]`).value, '', `${name} must not be prefilled`);
    }
    const cancel = [...window.document.querySelectorAll('#modal-root button')].find((button) => button.textContent === 'Cancel');
    click(cancel);
    app.navigate('#/cases');
    const add = [...window.document.querySelectorAll('#view button')].find((button) => button.textContent.includes('Register case'));
    click(add);
    for (const name of ['severity', 'probability', 'detectability']) {
      assert.equal(window.document.querySelector(`#modal-root [name="${name}"]`).value, '', `${name} must not be prefilled`);
    }
    assert.deepEqual(errors, []);
  } finally {
    window.close();
  }
});
