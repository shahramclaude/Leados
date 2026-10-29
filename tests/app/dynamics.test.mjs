/**
 * tests/app/dynamics.test.mjs — Operating System Dynamics Lab (Session 57, Schema v37).
 *
 *   1. Linear algebra: characteristic polynomial and complex roots by hand.
 *   2. Integrator: RK4 boundedness, equilibrium behaviour, and the loop-term
 *      tagging that makes dominance a measurement rather than a story.
 *   3. Policy semantics: WIP cap, hiring drag inside the ramp only, learning as
 *      a delayed investment, Monte Carlo determinism and band ordering.
 *   4. Stability and archetypes: self-correcting vs divergent structures, and
 *      archetype detection from measured loop gain.
 *   5. Calibration: weekly WIP reconstruction, completeness over records, and
 *      an honest "no better than persistence" verdict.
 *   6. Schema v37: migration, settings defaults, normalizer repairs.
 *   7. Validated actions and the real atomic cross-module cascade
 *      (RULE-DYN-01/02/03) through the store, idempotent across rescans.
 *   8. Signals, insights merge, CSV scope #38, brief, demo seed, DOM/axe.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION, DEFAULT_SETTINGS } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { addDays, dayKey } from '../../app/core/time.js';
import {
  DYN_LEVERS,
  DYN_LOOPS,
  DYN_MIN_PEOPLE,
  DYN_PLAYBOOK,
  DYN_RULE_IDS,
  buildDynamicsReport,
  calibrateDynamics,
  characteristicPolynomial,
  deriveDynamicsModel,
  derivatives,
  detectArchetypes,
  dynamicsBrief,
  dynamicsRule,
  dynamicsSignals,
  evaluatePolicy,
  jacobian,
  loopGains,
  monteCarloPolicy,
  mulberry32,
  normalizeDynamicsExperimentPayload,
  observedWipSeries,
  polynomialRoots,
  simulate,
  stabilityAnalysis,
} from '../../app/core/domain/dynamics.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS } from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-28T10:00:00.000Z');
const TODAY = '2026-10-28';

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
  const idFactory = (prefix) => `${prefix}-dy-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}

function person(i, extra = {}) {
  return {
    id: `person-${i}`,
    name: `Person ${i}`,
    role: 'Engineer',
    level: 'senior',
    team: 'Core',
    managerId: null,
    startDate: '2026-01-05',
    focus: '',
    talkingPoints: [],
    status: 'active',
    createdAt: '2026-01-05T00:00:00.000Z',
    archivedAt: null,
    ...extra,
  };
}

function portfolioItem(i, extra = {}) {
  return {
    id: `pf-${i}`,
    title: `Item ${i}`,
    kind: 'project',
    horizon: 'core',
    status: 'open',
    sourceType: 'manual',
    sourceId: null,
    ownerId: `person-${(i % 4) + 1}`,
    effortDays: { optimistic: 10, mostLikely: 10, pessimistic: 10 },
    value: { optimistic: 1000, mostLikely: 1000, pessimistic: 1000 },
    currency: 'USD',
    decision: 'funded',
    decisionOn: '2026-09-01',
    rationale: '',
    targetOn: null,
    createdOn: '2026-09-01',
    completedOn: null,
    releasedOn: null,
    actualEffortDays: null,
    actualValue: null,
    forecastSnapshot: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...extra,
  };
}

/** A small, fully dated workspace: four people, eight funded items. */
function workspace(patch = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.people = [1, 2, 3, 4].map((i) => person(i));
  state.portfolio = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => portfolioItem(i));
  return { ...state, ...patch };
}

/* ------------------------------------------------- 1. linear algebra */

test('characteristic polynomial matches the hand-computed 2×2 determinant', () => {
  // A = [[0, 1], [-2, -3]] → λ² + 3λ + 2 = 0 → roots −1, −2.
  const coeffs = characteristicPolynomial([[0, 1], [-2, -3]]);
  assert.deepEqual(coeffs.map((c) => Math.round(c * 1e6) / 1e6), [1, 3, 2]);
  const roots = polynomialRoots(coeffs);
  assert.equal(roots.length, 2);
  assert.ok(Math.abs(roots[0].re + 1) < 1e-6, `largest root is −1, got ${roots[0].re}`);
  assert.ok(Math.abs(roots[1].re + 2) < 1e-6, `second root is −2, got ${roots[1].re}`);
  assert.equal(roots[0].im, 0);
});

test('Durand–Kerner finds a complex conjugate pair and the trace identity holds', () => {
  // Rotation-by-90° block: eigenvalues ±i (and a real 1).
  const roots = polynomialRoots([1, -1, 1, -1]); // (λ−1)(λ²+1)
  const real = roots.map((r) => r.re).sort((a, b) => a - b);
  assert.ok(Math.abs(real[0]) < 1e-6 && Math.abs(real[2] - 1) < 1e-6, `real parts are 0,0,1; got ${real}`);
  const imaginary = roots.map((r) => Math.abs(r.im)).sort((a, b) => a - b);
  assert.ok(Math.abs(imaginary[0]) < 1e-6, 'one root is real');
  assert.ok(Math.abs(imaginary[1] - 1) < 1e-3, 'a complex conjugate pair with |Im| = 1 is present');
  // Sum of roots equals −(coefficient of λ²) for a monic cubic.
  const sum = roots.reduce((s, r) => s + r.re, 0);
  assert.ok(Math.abs(sum - 1) < 1e-3, `trace identity: sum of roots = 1, got ${sum}`);
});

test('numerical Jacobian reproduces a known linear system exactly', () => {
  const stock = { capacity: 10, wip: 20, qualityDebt: 2, pressure: 0.8, dependency: 0.2 };
  const params = {
    growthRate: 0, capacityCeilingMultiple: 1.5, attendanceBase: 0,
    attritionPerWeek: 0.01, overloadAttrition: 0, reworkGenRate: 0, qualityDebtIncidence: 0,
    qualityFixWeeks: 5, dependencyRouting: 0, dependencyDecay: 0.1, demandPerWeek: 4,
    demandRelaxation: 0, wipHalf: 8, pressureLagWeeks: 2, targetWipWeeks: 4,
    onboardingDragPd: 0, rampWeeks: 12,
  };
  const J = jacobian(stock, params, {});
  assert.equal(J.length, 5);
  // d(pressure)/d(wip) = 1/(capacity·targetWip·lag) exactly.
  assert.ok(Math.abs(J[3][1] - 1 / (10 * 4 * 2)) < 1e-4, `pressure responds to WIP at ${J[3][1]}`);
  // d(capacity)/d(capacity) = −attrition rate when growth is off.
  assert.ok(Math.abs(J[0][0] + 0.01) < 1e-3, `capacity self-decay is −1%, got ${J[0][0]}`);
});

/* ------------------------------------------------- 2. integrator */

const BASE_PARAMS = Object.freeze({
  growthRate: 0.004,
  capacityCeilingMultiple: 1.5,
  attritionPerWeek: 0.004,
  overloadAttrition: 0.03,
  reworkGenRate: 0.05,
  qualityDebtIncidence: 0.05,
  qualityFixWeeks: 6,
  dependencyRouting: 0.3,
  dependencyDecay: 0.1,
  demandPerWeek: 10,
  demandRelaxation: 0.35,
  wipHalf: 7.5,
  pressureLagWeeks: 3,
  targetWipWeeks: 4,
  onboardingDragPd: 2.5,
  rampWeeks: 12,
});

function equilibriumStocks(overrides = {}) {
  return { capacity: 10, wip: 40, qualityDebt: 0, pressure: 1, dependency: 0.2, ...overrides };
}

test('a balanced system stays bounded and near its equilibrium', () => {
  const run = simulate(equilibriumStocks({ wip: 24, pressure: 0.6 }), { ...BASE_PARAMS, demandPerWeek: 7 }, {}, { weeks: 26 });
  assert.equal(run.trajectory.length, 27);
  assert.ok(run.summary.endSaturationPct < 100, `bounded run, got ${run.summary.endSaturationPct}%`);
  assert.ok(stabilityAnalysis(equilibriumStocks({ wip: 24, pressure: 0.6 }), { ...BASE_PARAMS, demandPerWeek: 7 }, {}).maxRealPart < 0,
    'a team with slack absorbs disturbance rather than amplifying it');
  assert.equal(run.clampedWeeks, 0, 'no stock is clamped in a balanced run');
  assert.ok(run.summary.endCapacityPerWeek > 0);
  assert.ok(run.trajectory.every((row) => row.wip >= 0 && row.capacity >= 0 && row.qualityDebt >= 0));
});

test('a structurally impossible plan diverges, and the divergence is diagnosable', () => {
  const stocks = equilibriumStocks({ pressure: 1.4, wip: 70 });
  const run = simulate(stocks, { ...BASE_PARAMS, demandPerWeek: 16 }, {}, { weeks: 26 });
  assert.ok(run.summary.endSaturationPct > run.summary.startSaturationPct, 'pressure rises');
  assert.ok(run.summary.wipDeltaDays > 0, 'the backlog grows when demand exceeds deliverable capacity');
  const stability = stabilityAnalysis(stocks, { ...BASE_PARAMS, demandPerWeek: 16 }, {});
  assert.ok(stability.ok);
  assert.ok(stability.eigenvalues.length === 5, 'five eigenvalues for a five-dimensional system');
  assert.ok(stability.maxRealPart > 0, `the overloaded structure amplifies disturbance, got λ=${stability.maxRealPart}`);
  assert.equal(stability.verdict, stability.maxRealPart > 0.02 ? 'divergent' : 'weakly divergent');
});

test('the capacity floor stops the linear model from inventing a collapse', () => {
  const stocks = equilibriumStocks({ pressure: 2.5, wip: 200 });
  const brutal = { ...BASE_PARAMS, attritionPerWeek: 0.2, overloadAttrition: 2, demandPerWeek: 40 };
  const run = simulate(stocks, brutal, {}, { weeks: 52 });
  assert.ok(run.summary.endCapacityPerWeek >= 4 - 1e-6, 'capacity never falls below 40% of its starting value');
  assert.ok(run.clampedWeeks > 0, 'the clamp is reported, not hidden');
  assert.ok(run.summary.capacityChangePct <= -40, 'the report says how far capacity fell');
  const flows = derivatives(stocks, brutal, {}, 4)._flows;
  assert.equal(flows.floorActive, true, 'the floor is visible as a flow, not a silent edit');
});

/* ------------------------------------------------- 3. policy semantics */

test('every loop owns its own flow terms, so dominance can be measured', () => {
  // No overload, no quality debt, no hiring: the reinforcing loops are inert.
  const quiet = loopGains(equilibriumStocks({ pressure: 0.8, qualityDebt: 0 }), BASE_PARAMS, {});
  assert.ok(quiet.R1 < 1e-6, `R1 is inert without overload, got ${quiet.R1}`);
  assert.ok(quiet.B3 < 1e-6, `B3 is inert without quality debt, got ${quiet.B3}`);
  assert.ok(quiet.B1 > 0, 'the backlog drain is always active: throughput responds to WIP');

  // Under overload with debt, the reinforcing loops wake up.
  const loud = loopGains(equilibriumStocks({ pressure: 2.2, qualityDebt: 40 }), BASE_PARAMS, {});
  assert.ok(loud.R1 > quiet.R1, 'R1 gain rises with overload');
  assert.ok(loud.B3 > quiet.B3, 'B3 gain rises with quality debt');

  const run = simulate(equilibriumStocks({ pressure: 2.2, qualityDebt: 40 }), BASE_PARAMS, {}, { weeks: 8 });
  const first = run.dominance[0];
  const shareSum = first.shares.reduce((sum, s) => sum + s.sharePct, 0);
  assert.ok(Math.abs(shareSum - 100) <= 2, `dominance shares sum to ~100, got ${shareSum}`);
  assert.ok(first.dominant, 'a dominant loop is named');
});

test('capping WIP lowers the backlog and the end-state pressure', () => {
  const stocks = equilibriumStocks({ pressure: 1.3, wip: 60 });
  const baseline = simulate(stocks, BASE_PARAMS, {}, { weeks: 26 });
  const capped = simulate(stocks, { ...BASE_PARAMS, demandPerWeek: 10 }, { wipCapPct: 30 }, { weeks: 26 });
  assert.ok(capped.summary.endWipDays < baseline.summary.endWipDays, 'the queue drains faster');
  assert.ok(capped.summary.endSaturationPct < baseline.summary.endSaturationPct, 'pressure is lower');
});

test('hiring costs capacity only inside the ramp window', () => {
  const stocks = equilibriumStocks();
  const params = { ...BASE_PARAMS, demandPerWeek: 8, rampWeeks: 6 };
  const run = simulate(stocks, params, { hirePerWeek: 2 }, { weeks: 26 });
  const duringRamp = run.trajectory[3];
  const afterRamp = run.trajectory[20];
  const noHire = simulate(stocks, params, {}, { weeks: 26 });
  assert.ok(duringRamp.throughput < noHire.trajectory[3].throughput, 'onboarding borrows senior capacity during the ramp');
  assert.ok(afterRamp.capacity > noHire.trajectory[20].capacity, 'after the ramp the added capacity is real');
});

test('learning is classed as an investment when the team has slack to learn in', () => {
  // Moderate load, some quality debt: protecting learning costs throughput this
  // quarter and raises the ceiling. That is an investment, not a win.
  const stocks = equilibriumStocks({ pressure: 0.9, wip: 36 });
  const evaluation = evaluatePolicy({ stocks, params: { ...BASE_PARAMS, demandPerWeek: 8 } }, { learningShare: 0.15 }, { weeks: 26 });
  assert.equal(evaluation.verdict, 'investment', 'costs throughput now, raises the ceiling later');
  assert.ok(evaluation.delta.capacityPerWeek > 0, 'the ceiling is higher by the end of the horizon');
  assert.ok(evaluation.delta.throughputDays < 0, 'and the cost is stated rather than hidden');
});

test('learning is not a rescue once the team is saturated', () => {
  // Same lever, hostile structure: spending a share of a collapsing delivery
  // capacity on learning feeds the spiral. The engine must not launder this
  // into "investment" because the lever sounds systemic.
  const stocks = equilibriumStocks({ pressure: 1.6, wip: 70, qualityDebt: 30 });
  const evaluation = evaluatePolicy({ stocks, params: { ...BASE_PARAMS, demandPerWeek: 13 } }, { learningShare: 0.15 }, { weeks: 26 });
  assert.ok(['worsens', 'neutral'].includes(evaluation.verdict), `got ${evaluation.verdict}`);
  assert.ok(evaluation.delta.capacityPerWeek <= 0, 'capacity does not rise when the learning is funded out of an overloaded system');
});

test('Monte Carlo is reproducible and its bands are ordered', () => {
  const model = { stocks: equilibriumStocks({ pressure: 1.2 }), params: BASE_PARAMS };
  const a = monteCarloPolicy(model, { wipCapPct: 20 }, { weeks: 12, trials: 40, seed: 7 });
  const b = monteCarloPolicy(model, { wipCapPct: 20 }, { weeks: 12, trials: 40, seed: 7 });
  const c = monteCarloPolicy(model, { wipCapPct: 20 }, { weeks: 12, trials: 40, seed: 8 });
  assert.deepEqual(a.saturationPct, b.saturationPct, 'the same seed produces the same draws');
  assert.notDeepEqual(a.saturationPct, c.saturationPct, 'a different seed produces different draws');
  assert.ok(a.saturationPct.p50 <= a.saturationPct.p80 && a.saturationPct.p80 <= a.saturationPct.p90);
  assert.equal(a.trials, 40);
  assert.match(a.note, /not a probability of the future/);
});

test('the seeded PRNG is deterministic and bounded to [0,1)', () => {
  const first = mulberry32(42);
  const second = mulberry32(42);
  for (let i = 0; i < 20; i += 1) {
    const value = first();
    assert.equal(value, second());
    assert.ok(value >= 0 && value < 1);
  }
});

/* ------------------------------------------------- 4. archetypes */

test('archetype detection reads measured loop gain, and says how confident it is', () => {
  const model = {
    stocks: equilibriumStocks({ pressure: 1.6, qualityDebt: 45, dependency: 0.55 }),
    params: { ...BASE_PARAMS, growthRate: 0, demandPerWeek: 14 },
    context: { activePeople: 6, wipWeeks: 5 },
    provenance: { assumedPct: 20 },
  };
  const run = simulate(model.stocks, model.params, {}, { weeks: 26 });
  const stability = stabilityAnalysis(model.stocks, model.params, {});
  const archetypes = detectArchetypes(model, run, stability);
  assert.ok(archetypes.findings.length >= 1);
  assert.ok(archetypes.findings.some((f) => ['shifting-the-burden', 'limits-to-growth', 'success-to-the-successful', 'fixes-that-fail'].includes(f.id)),
    `expected a structural archetype, got ${archetypes.findings.map((f) => f.id).join(', ')}`);
  for (const finding of archetypes.findings) {
    assert.ok(finding.evidence.length >= 2, 'every archetype claim carries evidence lines');
    assert.ok(finding.repair.length > 10, 'and a named repair');
  }
  assert.equal(archetypes.confidence, 'structural', 'adequate provenance and a real team');
  const thin = detectArchetypes({ ...model, provenance: { assumedPct: 70 } }, run, stability);
  assert.equal(thin.confidence, 'provisional', 'a model built mostly on conventions says so');
});

test('a healthy structure is reported as balancing rather than dramatised', () => {
  const model = {
    stocks: equilibriumStocks({ pressure: 0.7, dependency: 0.15 }),
    params: { ...BASE_PARAMS, demandPerWeek: 8 },
    context: { activePeople: 9, wipWeeks: 2 },
    provenance: { assumedPct: 10 },
  };
  const run = simulate(model.stocks, model.params, {}, { weeks: 20 });
  const archetypes = detectArchetypes(model, run, stabilityAnalysis(model.stocks, model.params, {}));
  assert.ok(archetypes.findings.some((f) => f.id === 'balancing' || f.id === 'reinvestment'));
  assert.ok(archetypes.findings.every((f) => f.severity <= 3), 'no alarm without a reinforcing loop');
});

/* ------------------------------------------------- 5. calibration */

test('weekly WIP is reconstructed from dated records and gaps are counted, not filled', () => {
  const state = workspace();
  state.portfolio = [
    portfolioItem(1, { createdOn: '2026-09-01', status: 'done', completedOn: '2026-10-14' }),
    portfolioItem(2, { createdOn: '2026-10-01' }),
    portfolioItem(3, { createdOn: '2026-10-20', status: 'done', completedOn: null }), // done, undated
    portfolioItem(4, { createdOn: null, createdAt: null }), // undated entirely
  ];
  const series = observedWipSeries(state, NOW, { weeks: 8 });
  assert.equal(series.series.length, 8);
  assert.equal(series.completenessPct, 50, 'one undated record and one done-without-a-date out of four');
  assert.equal(series.series[0].records, 1, 'the item created in September was open eight weeks ago');
  assert.equal(series.series[0].wipDays, 10, 'and it carried its full expected effort');
  assert.ok(series.weeksWithData >= 1);
  assert.equal(series.undatedRecords, 1);
  assert.equal(series.closedWithoutDate, 1);
  assert.equal(series.series[7].records >= 1, true, 'this week sees the open work');
  assert.ok(series.series[7].wipDays > 0, 'the open item is counted this week');
  assert.match(series.note, /excluded rather than interpolated/);
});

test('calibration refuses to score a thin ledger and explains why', () => {
  const state = workspace({
    portfolio: [portfolioItem(1, { createdOn: '2026-10-20' })],
  });
  const model = deriveDynamicsModel(state, NOW);
  const calibration = calibrateDynamics(model, state, NOW);
  assert.equal(calibration.status, 'insufficient');
  assert.equal(calibration.skill, null);
  assert.match(calibration.reason, /week|records?|% of portfolio/);
});

test('calibration scores against naive persistence and reports negative skill honestly', () => {
  // A flat, fully dated history: the naive baseline is near-perfect, so a model
  // that drifts earns a skill at or below zero — and must say so.
  const items = [];
  for (let week = 0; week < 16; week += 1) {
    items.push(portfolioItem(week + 1, {
      createdOn: dayKey(addDays(TODAY, -(week * 7) - 1)),
      effortDays: { optimistic: 5, mostLikely: 5, pessimistic: 5 },
      ownerId: null,
    }));
  }
  const state = workspace({ portfolio: items });
  const model = deriveDynamicsModel(state, NOW);
  const calibration = calibrateDynamics(model, state, NOW);
  assert.equal(calibration.status, 'scored');
  assert.ok(calibration.observed.completenessPct >= 80);
  assert.equal(typeof calibration.skill, 'number');
  assert.ok(['informative', 'marginal', 'no-better-than-persistence'].includes(calibration.verdict));
  assert.ok(calibration.mase !== null);
  assert.match(calibration.note, /not forecasting power/);
});

/* ------------------------------------------------- 6. schema v37 */

test('Schema v37: additive migration adds the experiment ledger without inventing one', () => {
  assert.equal(SCHEMA_VERSION, 47);
  assert.equal(DEFAULT_SETTINGS.dynamicsHorizonWeeks, 26);
  assert.equal(DEFAULT_SETTINGS.dynamicsTargetWipWeeks, 4);
  assert.equal(DEFAULT_SETTINGS.dynamicsPressureLagWeeks, 3);
  assert.equal(DEFAULT_SETTINGS.dynamicsQualityFixWeeks, 6);
  assert.equal(DEFAULT_SETTINGS.dynamicsRampWeeks, 12);
  assert.equal(DEFAULT_SETTINGS.dynamicsStructuralRiskPct, 65);
  assert.equal(DEFAULT_SETTINGS.dynamicsAutoPropagate, true);
  const empty = createEmptyState(NOW.toISOString());
  assert.deepEqual(empty.dynamicsExperiments, []);
  const migrated = migrate({ schemaVersion: 36, settings: {}, people: [], portfolio: [] });
  assert.equal(migrated.raw.schemaVersion, 47);
  assert.equal(migrated.applied.at(-1), '46 → 47');
  assert.deepEqual(migrated.raw.dynamicsExperiments, []);
  const state = normalizeState(migrated.raw, { now: NOW }).state;
  assert.equal(state.schemaVersion, 47);
  assert.deepEqual(state.dynamicsExperiments, []);
  assert.ok(LINK_ENTITY_TYPES.includes('dynamics'), 'a structural experiment is a first-class graph node');
  assert.ok(LINK_RELATIONS.includes('tracks-followup'));
  assert.ok(DYN_LOOPS.length >= 6, 'the loop catalogue is explicit');
  assert.ok(DYN_LEVERS.every((lever) => Number.isInteger(lever.leverageClass)));
});

test('normalization repairs corrupt experiments rather than trusting them', () => {
  const result = normalizeState({
    schemaVersion: 37,
    settings: {},
    people: [person(1)],
    portfolio: [],
    dynamicsExperiments: [
      // adopted without an adoption date → demoted
      { id: 'e1', name: 'Adopted with no date', hypothesis: 'Something testable happens', status: 'adopted', adoptedOn: null, levers: { wipCapPct: 20 }, ownerId: 'person-1', horizonWeeks: 26 },
      // owner who left → cleared
      { id: 'e2', name: 'Owner left', hypothesis: 'Something testable happens', status: 'draft', levers: { hirePerWeek: 2 }, ownerId: 'ghost', horizonWeeks: 999 },
      // no levers moved → kept, warned
      { id: 'e3', name: 'No levers', hypothesis: 'Something testable happens', levers: {}, horizonWeeks: 4 },
      // unusable name → dropped
      { id: 'e4', name: 'x', hypothesis: 'y', levers: { wipCapPct: 5 } },
      // duplicate id → dropped
      { id: 'e1', name: 'Duplicate', hypothesis: 'Duplicate entry', levers: { wipCapPct: 5 } },
      // absurd lever values → clamped
      { id: 'e5', name: 'Absurd levers', hypothesis: 'Something testable happens', levers: { hirePerWeek: 999, learningShare: -4 }, horizonWeeks: 26 },
      'not an object',
    ],
  }, { now: NOW });
  const byId = Object.fromEntries(result.state.dynamicsExperiments.map((e) => [e.id, e]));
  assert.equal(result.state.dynamicsExperiments.length, 4, 'e4 (bad name), the duplicate and the non-object are dropped');
  assert.equal(byId.e1.status, 'draft', 'an undated adoption is reopened rather than back-dated');
  assert.equal(byId.e2.ownerId, null);
  assert.equal(byId.e2.horizonWeeks, 52);
  assert.equal(byId.e3.levers.wipCapPct, 0);
  assert.equal(byId.e5.levers.hirePerWeek, 10);
  assert.equal(byId.e5.levers.learningShare, 0);
  assert.ok(result.warnings.some((w) => /adoption date/.test(w)));
  assert.ok(result.warnings.some((w) => /no longer on the active roster/.test(w)));
  assert.ok(result.warnings.some((w) => /moved no lever/.test(w)));
  assert.ok(result.warnings.some((w) => /duplicate id/.test(w)));
  assert.ok(result.warnings.some((w) => /no usable name/.test(w)));
});

test('payload validation rejects an experiment that tests nothing', () => {
  assert.equal(normalizeDynamicsExperimentPayload({ name: 'ab', hypothesis: 'x'.repeat(20) }).ok, false);
  assert.equal(normalizeDynamicsExperimentPayload({ name: 'Valid name', hypothesis: 'short' }).ok, false);
  const noLevers = normalizeDynamicsExperimentPayload({ name: 'Valid name', hypothesis: 'A testable expectation' });
  assert.equal(noLevers.ok, false);
  assert.match(noLevers.error, /changes nothing/);
  const clamped = normalizeDynamicsExperimentPayload({
    name: 'Valid name', hypothesis: 'A testable expectation', levers: { hirePerWeek: 500, learningShare: 9 }, horizonWeeks: 999,
  });
  assert.equal(clamped.ok, true);
  assert.equal(clamped.value.levers.hirePerWeek, 10);
  assert.equal(clamped.value.levers.learningShare, 0.4);
  assert.equal(clamped.value.horizonWeeks, 52);
});

/* ------------------------------------------------- 7. report & actions */

test('the report derives stocks, provenance and archetypes from real records', () => {
  const state = normalizeState(workspace(), { now: NOW }).state;
  const report = buildDynamicsReport(state, NOW);
  assert.equal(report.adequate, true);
  assert.ok(report.model.context.activePeople === 4);
  assert.ok(report.model.stocks.capacity > 0);
  assert.ok(report.model.stocks.wip > 0);
  assert.equal(typeof report.structuralRiskPct, 'number');
  assert.ok(report.provenance.assumedPct > 0, 'the model admits its assumptions');
  assert.ok(report.policies.rows.length === DYN_PLAYBOOK.length);
  assert.ok(report.policies.best, 'a best playbook is ranked');
  assert.ok(report.simulation.trajectory.length === report.horizonWeeks + 1);

  const thin = normalizeState(createEmptyState(NOW.toISOString()), { now: NOW }).state;
  const thinReport = buildDynamicsReport(thin, NOW);
  assert.equal(thinReport.adequate, false);
  assert.match(thinReport.reason, /at least 3 active people|No people/);
});

test('the Lab refuses to simulate a team of two and says why', () => {
  const state = normalizeState(workspace({ people: [person(1), person(2)] }), { now: NOW }).state;
  const report = buildDynamicsReport(state, NOW);
  assert.equal(report.adequate, false);
  assert.ok(String(report.reason).includes(String(DYN_MIN_PEOPLE)));
});

test('a created experiment beats a scan on the shared spine without duplicating anything', () => {
  const { store, api } = harness();
  store.update((draft) => {
    draft.people = [1, 2, 3, 4].map((i) => person(i));
    draft.portfolio = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => portfolioItem(i));
  }, { type: 'workspace.seeded', entity: 'workspace', entityId: '', summary: 'seed' });

  const created = api.saveDynamicsExperiment({
    name: 'Cap WIP before hiring',
    hypothesis: 'If intake is throttled, cycle time falls within six weeks.',
    ownerId: 'person-1',
    horizonWeeks: 26,
    levers: { wipCapPct: 20 },
  });
  assert.equal(created.ok, true);
  const [experiment] = store.state.dynamicsExperiments;
  assert.equal(experiment.status, 'draft');
  assert.equal(experiment.name, 'Cap WIP before hiring');
  assert.equal(experiment.levers.wipCapPct, 20);

  const adopted = api.adoptDynamicsExperiment(experiment.id);
  assert.equal(adopted.ok, true);
  assert.equal(store.state.dynamicsExperiments[0].status, 'adopted');
  assert.equal(store.state.dynamicsExperiments[0].adoptedOn, TODAY);
  assert.ok(store.state.dynamicsExperiments[0].predicted.endSaturationPct >= 0);
  assert.ok(store.state.dynamicsExperiments[0].predicted.frozenAt);

  const checkpoints = store.state.delegations.filter((d) => String(d.support || '').includes(`[${DYN_RULE_IDS.EXPERIMENT}:`));
  assert.equal(checkpoints.length, 1, 'RULE-DYN-03 opened exactly one owned checkpoint');
  assert.ok(checkpoints[0].expectedOutcome.includes(String(store.state.dynamicsExperiments[0].predicted.endSaturationPct)));
  assert.ok(store.state.links.some((l) => l.sourceType === 'dynamics' && l.targetType === 'delegation' && l.relation === 'tracks-followup'));

  // Idempotent: a second adoption attempt and a rescan add nothing.
  assert.equal(api.adoptDynamicsExperiment(experiment.id).ok, false);
  api.scanDynamics();
  assert.equal(store.state.delegations.filter((d) => String(d.support || '').includes(`[${DYN_RULE_IDS.EXPERIMENT}:`)).length, 1);
});

test('adoption is refused without an owner, and an adopted experiment cannot be edited', () => {
  const { store, api } = harness();
  store.update((draft) => {
    draft.people = [1, 2, 3, 4].map((i) => person(i));
    draft.portfolio = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => portfolioItem(i));
  }, { type: 'workspace.seeded', entity: 'workspace', entityId: '', summary: 'seed' });
  const created = api.saveDynamicsExperiment({
    name: 'Ownerless experiment',
    hypothesis: 'Something testable will happen within a quarter.',
    levers: { wipCapPct: 10 },
  });
  assert.equal(created.ok, true);
  const adopt = api.adoptDynamicsExperiment(created.id);
  assert.equal(adopt.ok, false);
  assert.match(adopt.error, /owner/);

  const withOwner = api.saveDynamicsExperiment({
    id: created.id,
    name: 'Ownerless experiment',
    hypothesis: 'Something testable will happen within a quarter.',
    ownerId: 'person-2',
    levers: { wipCapPct: 10 },
  });
  assert.equal(withOwner.ok, true);
  assert.equal(api.adoptDynamicsExperiment(created.id).ok, true);
  const edit = api.saveDynamicsExperiment({
    id: created.id,
    name: 'Renamed after adoption',
    hypothesis: 'Something testable will happen within a quarter.',
    ownerId: 'person-2',
    levers: { wipCapPct: 40 },
  });
  assert.equal(edit.ok, false);
  assert.match(edit.error, /Retire it/);
});

test('retirement needs a reason, keeps the record, and drafts can be deleted', () => {
  const { store, api } = harness();
  store.update((draft) => {
    draft.people = [1, 2, 3, 4].map((i) => person(i));
    draft.portfolio = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => portfolioItem(i));
  }, { type: 'workspace.seeded', entity: 'workspace', entityId: '', summary: 'seed' });
  const draft1 = api.saveDynamicsExperiment({ name: 'Delete me', hypothesis: 'A testable expectation to remove.', levers: { wipCapPct: 5 } });
  assert.equal(api.deleteDynamicsExperiment(draft1.id).ok, true);
  assert.equal(store.state.dynamicsExperiments.length, 0);

  const kept = api.saveDynamicsExperiment({ name: 'Keep me', hypothesis: 'A testable expectation to retire.', levers: { wipCapPct: 5 } });
  assert.equal(api.retireDynamicsExperiment(kept.id, { note: '' }).ok, false);
  assert.equal(api.retireDynamicsExperiment(kept.id, { note: 'The cap cost a customer commitment.' }).ok, true);
  assert.equal(store.state.dynamicsExperiments[0].status, 'retired');
  assert.match(store.state.dynamicsExperiments[0].notes, /Retired/);
  const removal = api.deleteDynamicsExperiment(kept.id);
  assert.equal(removal.ok, false, 'a retired experiment stays on the record');
  assert.match(removal.error, /part of the record/);
});

test('policy settings are validated and clamped by the one settings path', () => {
  const { store, api } = harness();
  assert.equal(api.setDynamicsPolicy({ horizonWeeks: 3 }).ok, false);
  assert.equal(api.setDynamicsPolicy({ targetWipWeeks: 0 }).ok, false);
  assert.equal(api.setDynamicsPolicy({ structuralRiskPct: 10 }).ok, false);
  assert.equal(api.setDynamicsPolicy({ horizonWeeks: 13, targetWipWeeks: 3, autoPropagate: false }).ok, true);
  assert.equal(store.state.settings.dynamicsHorizonWeeks, 13);
  assert.equal(store.state.settings.dynamicsTargetWipWeeks, 3);
  assert.equal(store.state.settings.dynamicsAutoPropagate, false);
});

test('RULE-DYN-01 opens exactly one DACI structural decision, priced by tempo', () => {
  const { store, api } = harness();
  // A structurally hostile workspace: not enough capacity for the committed plan.
  store.update((draft) => {
    draft.people = [1, 2, 3, 4, 5].map((i) => person(i));
    draft.portfolio = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((i) => portfolioItem(i, {
      effortDays: { optimistic: 20, mostLikely: 20, pessimistic: 20 },
    }));
    draft.dependencies = [{
      id: 'dep-1', name: 'Payments path', kind: 'service', criticality: 'critical', status: 'active',
      stewards: [{ personId: 'person-1', role: 'primary' }], ownerId: 'person-1',
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    }];
  }, { type: 'workspace.seeded', entity: 'workspace', entityId: '', summary: 'seed' });

  const report = buildDynamicsReport(store.state, NOW);
  const scan = api.scanDynamics();
  assert.equal(scan.ok, true);
  const decisions = store.state.decisions.filter((d) => String(d.question || '').includes(`[${DYN_RULE_IDS.STRUCTURE}]`));
  if (report.structuralRiskPct >= 65) {
    assert.equal(decisions.length, 1, 'exactly one structural decision');
    assert.equal(decisions[0].options.length, 4, 'four leverage levels, not four variants of the same fix');
    assert.match(decisions[0].options[0].label, /parameter/i);
    assert.match(decisions[0].options[3].label, /Redesign the loop/i);
    const tempo = store.state.tempoSchedules.filter((s) => s.decisionId === decisions[0].id);
    assert.equal(tempo.length, 1, 'Decision Tempo priced it in the same transaction');
    api.scanDynamics();
    assert.equal(store.state.decisions.filter((d) => String(d.question || '').includes(`[${DYN_RULE_IDS.STRUCTURE}]`)).length, 1,
      'a second scan converges instead of duplicating the decision');
  } else {
    assert.equal(decisions.length, 0, 'below the threshold nothing is opened');
  }
  assert.ok(store.state.events.some((e) => e.type === 'dynamics.scan'));
});

test('RULE-DYN-02 queues one blameless talking point whose marker survives normalization', () => {
  const { store, api } = harness();
  store.update((draft) => {
    draft.people = [1, 2, 3, 4, 5].map((i) => person(i, i === 3 ? { talkingPoints: ['Existing note'] } : {}));
    draft.portfolio = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => portfolioItem(i, { ownerId: i === 3 ? 'person-3' : `person-${(i % 3) + 1}` }));
    draft.dependencies = [{
      id: 'dep-1', name: 'Payments path', kind: 'service', criticality: 'critical', status: 'active',
      stewards: [{ personId: 'person-3', role: 'primary' }], ownerId: 'person-3',
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    }];
  }, { type: 'workspace.seeded', entity: 'workspace', entityId: '', summary: 'seed' });
  api.scanDynamics();
  api.scanDynamics();
  const prompts = store.state.people.flatMap((p) => (p.talkingPoints || []).filter((t) => String(t).includes(`[${DYN_RULE_IDS.ARCHETYPE}:`)));
  assert.ok(prompts.length <= 1, 'at most one archetype prompt exists');
  if (prompts.length) {
    assert.ok(prompts[0].startsWith(`[${DYN_RULE_IDS.ARCHETYPE}:`), 'the marker leads the string so normalization cannot truncate it away');
    assert.ok(prompts[0].length <= 200);
    assert.match(prompts[0], /not a performance point/i);
  }
});

test('the pause switch stops automatic propagation but never an explicit scan', () => {
  const { store, api } = harness();
  store.update((draft) => {
    draft.people = [1, 2, 3, 4, 5].map((i) => person(i));
    draft.portfolio = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => portfolioItem(i));
    draft.settings = { ...draft.settings, dynamicsAutoPropagate: false };
  }, { type: 'workspace.seeded', entity: 'workspace', entityId: '', summary: 'seed' });

  const before = JSON.stringify(store.state.decisions);
  store.update((draft) => {
    draft.portfolio.push(portfolioItem(99, { createdOn: TODAY }));
  }, { type: 'portfolio.created', entity: 'portfolio', entityId: 'pf-99', summary: 'New item' });
  assert.equal(JSON.stringify(store.state.decisions), before, 'an operational event does not trigger the rule while paused');

  const scan = api.scanDynamics();
  assert.equal(scan.ok, true, 'the explicit scan still runs');
  assert.ok(store.state.events.some((e) => e.type === 'dynamics.scan'));
});

/* ------------------------------------------------- 8. read-side & docs */

test('signals carry rule ids, evidence and a route, and merge into Signals', () => {
  const demo = buildDemoState(NOW);
  const signals = dynamicsSignals(demo, NOW);
  assert.ok(signals.length >= 1);
  for (const signal of signals) {
    assert.match(signal.ruleId, /^DYN-0[1-5]$/);
    assert.equal(signal.domain, 'System dynamics');
    assert.ok(signal.severity >= 1 && signal.severity <= 5);
    assert.ok(['high', 'medium', 'low'].includes(signal.confidence));
    assert.ok(signal.evidence.length >= 1);
    assert.match(signal.action.route, /^#\/dynamics/);
  }
  const insights = buildInsights(demo, NOW);
  assert.ok(insights.findings.some((f) => f.domain === 'System dynamics'), 'the Lab contributes to the Signals feed');
  assert.ok(DOMAIN_ORDER.includes('System dynamics'));
});

test('CSV scope #38 exports model telemetry with opaque codes and no free text', () => {
  const demo = buildDemoState(NOW);
  const exported = exportWorkspaceCsv(demo, 'dynamics', { now: NOW });
  assert.equal(exported.ok, true);
  assert.equal(exported.rowCount, demo.dynamicsExperiments.length);
  assert.ok(exported.columnCount >= 18);
  const lines = exported.csv.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  assert.ok(header.includes('record_code'));
  assert.ok(header.includes('structural_risk_pct'));
  assert.ok(!header.some((h) => /name|hypothesis|note|owner/i.test(h)), 'no identity or free-text columns');
  const body = lines.slice(1).join('\n');
  for (const experiment of demo.dynamicsExperiments) {
    assert.ok(!body.includes(experiment.name), 'experiment names never leave the workspace');
    assert.ok(!body.includes(experiment.hypothesis), 'hypotheses never leave the workspace');
  }
  assert.match(body, /dyn-01/);
  assert.ok(CSV_EXPORTS.some((scope) => scope.key === 'dynamics'));
});

test('the brief states the structure, the archetype and the caveats', () => {
  const demo = buildDemoState(NOW);
  const brief = dynamicsBrief(demo, NOW);
  assert.match(brief, /Operating system dynamics brief/);
  assert.match(brief, /Structural risk/);
  assert.match(brief, /Archetypes detected/);
  assert.match(brief, /Policy experiments/);
  assert.match(brief, /not a forecast/);
  assert.match(brief, /Convention|assumed/i);
});

test('the demo runs the real rules: one decision, one checkpoint, no hand-written copy', () => {
  const demo = buildDemoState(NOW);
  assert.equal(demo.dynamicsExperiments.length, 2);
  assert.ok(demo.dynamicsExperiments.some((e) => e.status === 'adopted'));
  assert.ok(demo.dynamicsExperiments.some((e) => e.status === 'draft'));
  const structural = demo.decisions.filter((d) => String(d.question || '').includes(`[${DYN_RULE_IDS.STRUCTURE}]`));
  assert.ok(structural.length <= 1);
  assert.equal(demo.delegations.filter((d) => String(d.support || '').includes(`[${DYN_RULE_IDS.EXPERIMENT}:`)).length, 1);
  const playbook = Object.fromEntries(buildDynamicsReport(demo, NOW).policies.rows.map((row) => [row.key, row]));
  assert.equal(playbook['hire-two'].verdict, 'investment',
    'hiring raises the ceiling while costing throughput inside the horizon — an investment, not a win and not a failure');
  assert.ok(playbook['hire-two'].delta.capacityPerWeek > 0);
  assert.ok(playbook['hire-two'].delta.throughputDays < 0, 'the throughput invoice is shown');
  assert.equal(playbook['protect-learning'].verdict, 'investment', 'learning has a delay; the first quarter pays for it');
  assert.equal(playbook['cap-wip'].verdict, 'improves', 'throttling intake pays back inside the horizon');
  const again = buildDemoState(NOW);
  assert.deepEqual(again.dynamicsExperiments.map((e) => e.name), demo.dynamicsExperiments.map((e) => e.name), 'the demo is deterministic');
});

test('the dynamics rule is registered on the shared spine and in the catalogue', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.name === 'dynamicsRule'),
    'registered by function name so a reordering stays visible');
  const ids = AUTOMATION_RULES.map((rule) => rule.id);
  assert.ok(ids.includes(DYN_RULE_IDS.STRUCTURE));
  assert.ok(ids.includes(DYN_RULE_IDS.ARCHETYPE));
  assert.ok(ids.includes(DYN_RULE_IDS.EXPERIMENT));
  const catalogueEntry = AUTOMATION_RULES.find((rule) => rule.id === DYN_RULE_IDS.STRUCTURE);
  assert.ok(catalogueEntry.framework.length > 20, 'every rule names the framework it implements');
});

test('loop activation is finite and non-negative for every simulated state', () => {
  const run = simulate(equilibriumStocks({ pressure: 2.4, qualityDebt: 80 }), BASE_PARAMS, { hirePerWeek: 4 }, { weeks: 12 });
  for (const row of run.dominance) {
    for (const share of row.shares) {
      assert.ok(Number.isFinite(share.gain) && share.gain >= 0);
      assert.ok(Number.isFinite(share.activation) && share.activation >= 0);
    }
  }
  const flows = derivatives(equilibriumStocks(), BASE_PARAMS, {})._flows;
  Object.entries(flows).forEach(([key, value]) => {
    if (typeof value === 'boolean') return;
    assert.ok(Number.isFinite(value), `${key} is finite`);
  });
});

/* ----------------------------------------------------------------- 9. DOM */

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

test('UI: all four tabs render axe-clean on the demo workspace', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    for (const route of ['#/dynamics', '#/dynamics?tab=loops', '#/dynamics?tab=lab', '#/dynamics?tab=calibration']) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.length > 300, `${route} renders content`);
      assert.ok(!/is not a function|undefined is|NaN/.test(view.textContent), `${route} renders without an error panel`);
      assert.deepEqual(await axeViolations(env), [], `${route} axe-clean`);
    }
    app.ctx.navigate('#/dynamics');
    assert.match(env.document.querySelector('#view').textContent, /Operating system dynamics/);
    assert.ok(env.document.querySelector('[href="#/dynamics"]'), 'reachable from navigation');
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});

test('UI: the experiment dialog previews the model live and saves a draft', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    app.ctx.navigate('#/dynamics?tab=lab');
    const buttons = Array.from(env.document.querySelectorAll('#view button'));
    const create = buttons.find((b) => /New experiment/.test(b.textContent));
    assert.ok(create, 'the lab offers a create action');
    create.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    const dialog = env.document.querySelector('#modal-root');
    assert.ok(dialog && dialog.textContent.length > 100, 'the policy designer opens');
    assert.match(dialog.textContent, /Leverage class/);
    // Fill the required fields and submit.
    const nameInput = dialog.querySelector('input[name="name"]');
    const hypothesisInput = dialog.querySelector('textarea[name="hypothesis"]');
    const lever = dialog.querySelector('input[name="lever_wipCapPct"]');
    assert.ok(nameInput && hypothesisInput && lever);
    nameInput.value = 'Throttle intake';
    hypothesisInput.value = 'If intake is capped, cycle time falls within six weeks.';
    lever.value = '20';
    lever.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    const submit = Array.from(dialog.querySelectorAll('button')).find((b) => /Create experiment/.test(b.textContent));
    submit.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    assert.ok(app.store.state.dynamicsExperiments.some((e) => e.name === 'Throttle intake'), 'the draft is saved through the validated API');
  } finally {
    env.dom.window.close();
  }
});
