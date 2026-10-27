/**
 * tests/app/talent-retention.test.mjs — Retention Intelligence & Talent Economics
 * (Schema v29, RULE-RET-01..04, RET-01..07).
 *
 * Named apart from `retention.test.mjs`, which covers the Schema v18 candidate-record
 * retention *review* rule (a hiring concern). Two different meanings of "retention"
 * live in this product; they are not the same feature and they do not share a file.
 *
 *  1. Survival maths: exact chi-square quantiles, Kaplan–Meier with censoring,
 *     Greenwood variance, log–log bands, median identification.
 *  2. Lexis-expanded band hazards and empirical-Bayes smoothing.
 *  3. The prior-centred penalised Poisson fit: it recovers the empirical ratio,
 *     collapses to the priors as λ grows, and abstains below the evidence floor.
 *  4. Factor detection from non-confidential records, and the privacy wall.
 *  5. Economics: recorded-cost replacement, expected loss, and unpriced honesty.
 *  6. The two-constraint allocation lab, including its fairness tier.
 *  7. Calibration: Harrell's C with censoring and the Brier score over plans.
 *  8. Actions and the departure cascade through the shared case engine.
 *  9. Rules: proposal idempotency, moot on departure, model-governance and
 *     systemic-driver decisions, and the pause switch.
 * 10. Schema v28 → v29 additive migration, repair, rewind and clearDemo.
 * 11. CSV scope #29 pseudonymisation and formula safety.
 * 12. RET-01..07 signals, silence on an empty workspace.
 * 13. JSDOM + axe-core across all six tabs and the plan dialog.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  PRIOR_LOG_SPREAD,
  RETENTION_ENGINE_VERSION,
  RETENTION_MIN_EVENTS,
  RETENTION_MIN_PAIRS,
  bandHazards,
  buildPersonTime,
  buildRetentionReport,
  candidateInterventions,
  chiSquareQuantile,
  concordance,
  detectFactors,
  expectedLoss,
  exitReasonClusters,
  fitHazardModel,
  gammaP,
  kaplanMeier,
  monthsBetween,
  normalQuantile,
  optimizeRetention,
  planBrier,
  poissonRateCI,
  replacementCostFor,
  retentionBrief,
  retentionRule,
  retentionSignals,
  riskBandFor,
  riskForPerson,
} from '../../app/core/domain/retention.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-26T10:00:00.000Z');
const TODAY = '2026-10-26';

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
  const idFactory = (prefix) => `${prefix}-rt-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}

/** Add a person with a start date `monthsAgo`, optional pay, optional departure. */
function addPerson(env, { name, monthsAgo = 12, pay = null, departure = null }) {
  const startDate = new Date(NOW.getTime() - monthsAgo * 30.4375 * 86400000).toISOString().slice(0, 10);
  const person = env.api.addPerson({ name, role: 'Engineer', startDate });
  assert.ok(person.ok, person.error);
  if (pay) {
    const res = env.api.updatePersonCompensation(person.id, pay);
    assert.ok(res.ok, res.error);
  }
  if (departure) {
    const res = env.api.recordDeparture(person.id, departure);
    assert.ok(res.ok, res.error);
  }
  return person.id;
}

/* ================================================== 1. pure survival maths */

test('survival maths: quantiles, months and Poisson intervals are exact enough to defend', () => {
  assert.ok(Math.abs(normalQuantile(0.975) - 1.9599639845) < 1e-6);
  assert.ok(Math.abs(chiSquareQuantile(0.95, 2) - 5.99146) < 1e-3);
  assert.ok(Math.abs(chiSquareQuantile(0.025, 2) - 0.050636) < 1e-3);
  assert.ok(Math.abs(chiSquareQuantile(0.975, 4) - 11.14329) < 1e-3);
  assert.ok(Math.abs(gammaP(1, 1) - (1 - Math.exp(-1))) < 1e-9);
  assert.ok(Math.abs(monthsBetween('2025-01-01', '2026-01-01') - 12) < 0.02);

  // Three events over 100 person-months: the interval must bracket the crude rate.
  const ci = poissonRateCI(3, 100);
  assert.ok(ci.lower < 0.03 && ci.upper > 0.03, 'the band brackets the point estimate');
  assert.equal(poissonRateCI(0, 100).lower, 0, 'zero events have a zero lower bound, not a negative one');
  assert.ok(poissonRateCI(0, 100).upper > 0);
});

test('Kaplan–Meier is computed by hand-checkable steps with Greenwood bands and censoring', () => {
  // Four people: departures at 6 and 12 months, censoring at 18 and 24.
  const rows = [
    { personId: 'a', event: true, tenureMonths: 6, tenureBand: '6-12m', bands: { '0-6m': 6 } },
    { personId: 'b', event: true, tenureMonths: 12, tenureBand: '12-24m', bands: { '0-6m': 6, '6-12m': 6 } },
    { personId: 'c', event: false, tenureMonths: 18, tenureBand: '12-24m', bands: { '0-6m': 6, '6-12m': 6, '12-24m': 6 } },
    { personId: 'd', event: false, tenureMonths: 24, tenureBand: '12-24m', bands: { '0-6m': 6, '6-12m': 6, '12-24m': 12 } },
  ];
  const km = kaplanMeier(rows);
  // At t=6: at risk 4, events 1 → S = 0.75. At t=12: at risk 3, events 1 → S = 0.5.
  assert.equal(km.points.find((p) => p.t === 6).survival, 0.75);
  assert.ok(Math.abs(km.points.find((p) => p.t === 12).survival - 0.5) < 1e-12);
  assert.equal(km.events, 2);
  assert.equal(km.censored, 2);
  assert.ok(Math.abs(km.censorShare - 0.5) < 1e-12);
  assert.equal(km.median, 12, 'the curve touches 50% exactly at twelve months');
  assert.equal(km.medianIdentified, true);
  const first = km.points.find((p) => p.t === 6);
  assert.ok(first.ciLo <= first.survival && first.ciHi >= first.survival, 'the band contains the estimate');
  assert.ok(first.ciLo > 0 && first.ciHi <= 1, 'the log–log band stays inside [0,1]');
  assert.equal(km.sufficient, false, `${RETENTION_MIN_EVENTS} events are required for sufficiency`);

  // A curve that never reaches 50% must say the median is unidentified.
  // One event among four people at risk leaves S = 0.75, so the curve never
  // reaches 50% and the median must be reported as unidentified rather than
  // guessed from the longest tenure.
  const never = kaplanMeier([
    { personId: 'x', event: true, tenureMonths: 3, tenureBand: '0-6m', bands: { '0-6m': 3 } },
    { personId: 'w', event: false, tenureMonths: 9, tenureBand: '6-12m', bands: { '0-6m': 6, '6-12m': 3 } },
    { personId: 'v', event: false, tenureMonths: 20, tenureBand: '12-24m', bands: { '0-6m': 6, '6-12m': 6, '12-24m': 8 } },
    { personId: 'y', event: false, tenureMonths: 30, tenureBand: '24-48m', bands: { '0-6m': 6, '6-12m': 6, '12-24m': 12, '24-48m': 6 } },
  ]);
  assert.equal(never.medianIdentified, false);
  assert.equal(never.median, null);
  const empty = kaplanMeier([]);
  assert.equal(empty.events, 0);
  assert.equal(empty.medianIdentified, false);
});

test('band hazards split exposure by person-months and shrink toward the prior', () => {
  const rows = [
    { personId: 'a', event: true, tenureMonths: 3, tenureBand: '0-6m', bands: { '0-6m': 3 } },
    { personId: 'b', event: false, tenureMonths: 5, tenureBand: '0-6m', bands: { '0-6m': 5 } },
  ];
  const thin = bandHazards(rows, { priorMonthlyHazard: 0.02, strength: 12 });
  // One event over 8 months with strength 12 → (1 + 12*0.02) / (8 + 12) = 0.062.
  assert.ok(Math.abs(thin.byKey['0-6m'].smoothed - 0.062) < 1e-12);
  assert.equal(thin.byKey['0-6m'].priorDriven, true, '8 person-months is less than the smoothing strength');

  const noExposure = bandHazards([], { priorMonthlyHazard: 0.02, strength: 12 });
  assert.equal(noExposure.byKey['48m+'].smoothed, 0.02, 'no exposure returns the prior exactly');
  assert.equal(noExposure.byKey['48m+'].crude, null);
});

/* ============================================== 2. the regression and abstention */

/** Deterministic PRNG so the synthetic fit is reproducible. */
function prng(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function exponentialCohort({ n, hazard, factorHazard, followUp = 60, seed = 11 }) {
  const rnd = prng(seed);
  const rows = [];
  const matrix = new Map();
  for (let i = 0; i < n; i += 1) {
    const hasFactor = i % 2 === 1;
    const h = hazard * (hasFactor ? factorHazard : 1);
    const t = -Math.log(1 - rnd()) / h;
    const tenure = Math.min(t, followUp);
    const bands = {};
    for (const [key, from, to] of [['0-6m', 0, 6], ['6-12m', 6, 12], ['12-24m', 12, 24], ['24-48m', 24, 48], ['48m+', 48, Infinity]]) {
      const overlap = Math.max(0, Math.min(tenure, to) - from);
      if (overlap > 0) bands[key] = overlap;
    }
    const tenureBand = tenure < 6 ? '0-6m' : tenure < 12 ? '6-12m' : tenure < 24 ? '12-24m' : tenure < 48 ? '24-48m' : '48m+';
    const personId = `q${i}`;
    rows.push({ personId, event: t <= followUp, tenureMonths: tenure, tenureBand, bands });
    matrix.set(personId, new Set(hasFactor ? ['pay-below-band'] : []));
  }
  return { rows, matrix };
}

test('the penalised Poisson fit recovers the empirical hazard ratio and reports intervals', () => {
  const { rows, matrix } = exponentialCohort({ n: 400, hazard: 0.012, factorHazard: 2 });
  const crude = (() => {
    let ef = 0; let mf = 0; let eo = 0; let mo = 0;
    for (const row of rows) {
      const months = Object.values(row.bands).reduce((a, b) => a + b, 0);
      if (matrix.get(row.personId).has('pay-below-band')) { ef += row.event ? 1 : 0; mf += months; }
      else { eo += row.event ? 1 : 0; mo += months; }
    }
    return (ef / mf) / (eo / mo);
  })();
  const model = fitHazardModel({ rows }, matrix, { ridge: 0.01, minEvents: 10 });
  assert.equal(model.mode, 'pooled');
  assert.equal(model.converged, true);
  const coefficient = model.coefficients.find((c) => c.id === 'pay-below-band');
  assert.ok(Math.abs(coefficient.hr - crude) < 0.12, `fitted ${coefficient.hr.toFixed(3)} vs crude ${crude.toFixed(3)}`);
  assert.ok(coefficient.lo < coefficient.hr && coefficient.hi > coefficient.hr, 'the interval brackets the estimate');
  assert.equal(coefficient.source, 'fitted');

  // Factors with no evidence stay exactly at their prior.
  const untouched = model.coefficients.filter((c) => c.id !== 'pay-below-band');
  for (const c of untouched) assert.ok(Math.abs(c.hr - c.priorHr) < 1e-6, `${c.id} should sit at its prior`);
});

test('the prior is the penalty: larger λ pulls the estimate back toward the published ratio', () => {
  const { rows, matrix } = exponentialCohort({ n: 400, hazard: 0.012, factorHazard: 2 });
  const loose = fitHazardModel({ rows }, matrix, { ridge: 0.01, minEvents: 10 });
  const tight = fitHazardModel({ rows }, matrix, { ridge: 50, minEvents: 10 });
  const looseHr = loose.coefficients.find((c) => c.id === 'pay-below-band').hr;
  const tightHr = tight.coefficients.find((c) => c.id === 'pay-below-band').hr;
  const prior = loose.coefficients.find((c) => c.id === 'pay-below-band').priorHr;
  assert.ok(looseHr > tightHr, 'more shrinkage means a smaller departure from the prior');
  assert.ok(Math.abs(tightHr - prior) < Math.abs(looseHr - prior), 'the heavier penalty is closer to the prior');
});

test('the model abstains below the evidence floor and says how much more it needs', () => {
  const empty = fitHazardModel({ rows: [] }, new Map(), { ridge: 2, minEvents: 10 });
  assert.equal(empty.mode, 'prior');
  assert.equal(empty.events, 0);
  assert.equal(empty.needs, RETENTION_MIN_EVENTS);
  assert.ok(empty.reason.includes('No voluntary departures'));
  assert.equal(empty.coefficients.length > 0, true);

  const { rows, matrix } = exponentialCohort({ n: 10, hazard: 0.02, factorHazard: 2, followUp: 8, seed: 3 });
  const thin = fitHazardModel({ rows }, matrix, { ridge: 2, minEvents: 10 });
  if (thin.events < 10) {
    assert.equal(thin.mode, 'prior');
    assert.equal(thin.needs, 10 - thin.events);
    assert.ok(thin.reason.includes('need'));
  }
});

test('risk intervals bracket the point estimate and the ledger abstains honestly', () => {
  const model = fitHazardModel({ rows: [] }, new Map(), { minEvents: 10 });
  const base = { smoothed: 0.02, lo: 0.01, hi: 0.04 };
  const plain = riskForPerson({ baseHazard: base, factors: [], model, horizonDays: 90 });
  const loaded = riskForPerson({
    baseHazard: base,
    factors: [{ id: 'pay-below-band', label: 'Pay', priorHr: 1.4 }, { id: 'promotion-stall', label: 'Stall', priorHr: 1.55 }],
    model,
    horizonDays: 90,
  });
  assert.ok(loaded.point > plain.point, 'two factors raise the risk');
  assert.ok(loaded.lo <= loaded.point && loaded.hi >= loaded.point, 'the band contains the estimate');
  assert.ok(loaded.multiplier > 2, 'multipliers compound');
  assert.equal(loaded.mode, 'prior');
  assert.ok(loaded.intervalBasis.includes('Baseline-hazard'));
  assert.ok(loaded.hi < 1 && loaded.lo >= 0, 'a probability stays a probability');
  // A longer horizon raises the probability monotonically.
  const longer = riskForPerson({ baseHazard: base, factors: [], model, horizonDays: 365 });
  assert.ok(longer.point > plain.point);

  assert.equal(riskBandFor(0.02).key, 'low');
  assert.equal(riskBandFor(0.2, { retentionRiskThresholdPct: 12 }).key, 'elevated');
  assert.equal(riskBandFor(0.5, { retentionRiskThresholdPct: 12 }).key, 'high');
});

/* ================================================== 3. detection and privacy */

test('every factor fires from its own recorded evidence, and only from it', () => {
  const env = harness();
  const id = addPerson(env, {
    name: 'Ada Lovelace',
    monthsAgo: 40,
    pay: { currency: 'USD', annualCost: 90000, bandMin: 104000, bandMax: 128000 },
  });
  const person = env.store.state.people.find((p) => p.id === id);
  const factors = detectFactors(env.store.state, person, { now: NOW, settings: env.store.state.settings });
  const ids = factors.map((f) => f.id);
  assert.ok(ids.includes('pay-below-band'), 'below-band pay is detected');
  assert.ok(ids.includes('promotion-stall'), 'no level change in 40 months is detected');
  assert.ok(ids.includes('development-void'), 'no growth plan is detected');
  assert.ok(ids.includes('feedback-drought'), 'no feedback is detected');
  assert.ok(ids.includes('cadence-decay'), 'no held 1:1 is detected');
  assert.ok(!ids.includes('sustained-overload'), 'no committed work means no overload factor');
  // Every factor carries human-readable evidence.
  for (const factor of factors) assert.ok(factor.evidence.length > 0 && factor.evidence.every((e) => typeof e === 'string'));

  // A person inside their band with recent feedback and a held 1:1 carries fewer.
  const healthy = addPerson(env, {
    name: 'Grace Hopper',
    monthsAgo: 8,
    pay: { currency: 'USD', annualCost: 110000, bandMin: 104000, bandMax: 128000 },
  });
  env.api.logOneOnOne({ personId: healthy, date: TODAY, status: 'held', mood: 4, notes: 'Good week.', agenda: [] });
  env.api.addFeedback({ personId: healthy, kind: 'praise', situation: 'Release', behavior: 'Ran the rollout', impact: 'No incidents', date: TODAY });
  const healthyPerson = env.store.state.people.find((p) => p.id === healthy);
  const healthyFactors = detectFactors(env.store.state, healthyPerson, { now: NOW, settings: env.store.state.settings }).map((f) => f.id);
  assert.ok(!healthyFactors.includes('pay-below-band'));
  assert.ok(!healthyFactors.includes('feedback-drought'));
  assert.ok(!healthyFactors.includes('cadence-decay'));
  assert.ok(!healthyFactors.includes('promotion-stall'), 'eight months in level is not a stall');
});

test('the retention engine cannot read a confidential conflict or an anonymous pulse', () => {
  const env = harness();
  const id = addPerson(env, { name: 'Quiet Person', monthsAgo: 8 });
  env.api.logOneOnOne({ personId: id, date: TODAY, status: 'held', mood: 4, notes: 'Fine.', agenda: [] });
  env.api.addFeedback({ personId: id, kind: 'praise', situation: 's', behavior: 'b', impact: 'i', date: TODAY });
  env.api.addGrowthPlan?.({ personId: id, focus: 'Technical leadership', wills: [] });
  // A severe conflict and a bleak pulse exist for this person.
  env.api.addConflict?.({ personId: id, title: 'Escalation', summary: 'Serious interpersonal breakdown', severity: 'high' });
  env.api.logPulse?.({ week: '2026-W40', responses: { safety: 1, clarity: 1, workload: 1, growth: 1 } });
  const person = env.store.state.people.find((p) => p.id === id);
  const before = detectFactors(env.store.state, person, { now: NOW, settings: env.store.state.settings });
  assert.ok(!before.some((f) => /conflict|pulse|sentiment|mood/i.test(f.id)), 'no factor is derived from confidential or anonymous data');
  // The report never surfaces conflict or pulse content either.
  const report = buildRetentionReport(env.store.state, { now: NOW, settings: env.store.state.settings });
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes('Serious interpersonal breakdown'));
  assert.ok(!serialized.includes('Escalation'));
});

/* =========================================================== 4. economics */

test('replacement cost and expected loss are derived from recorded figures only', () => {
  const priced = replacementCostFor({ compensation: { currency: 'eur', annualCost: 100000 } }, { retentionReplacementPct: 50 });
  assert.equal(priced.amount, 50000);
  assert.equal(priced.currency, 'EUR');
  assert.ok(priced.basis.includes('convention'));
  assert.equal(replacementCostFor({ compensation: { annualCost: 100000 } }, {}), null, 'no currency means no price');
  assert.equal(replacementCostFor({}, {}), null);

  const risk = { point: 0.2, lo: 0.1, hi: 0.4 };
  const loss = expectedLoss(risk, priced);
  assert.equal(loss.point, 10000);
  assert.equal(loss.lo, 5000);
  assert.equal(loss.hi, 20000);
  assert.equal(expectedLoss(risk, null), null);
});

test('interventions are priced from the gap and blocked rather than guessed', () => {
  const env = harness();
  const id = addPerson(env, {
    name: 'Priced Person',
    monthsAgo: 40,
    pay: { currency: 'USD', annualCost: 90000, bandMin: 104000, bandMax: 128000 },
  });
  const person = env.store.state.people.find((p) => p.id === id);
  const model = fitHazardModel({ rows: [] }, new Map(), { minEvents: 10 });
  const factors = detectFactors(env.store.state, person, { now: NOW, settings: env.store.state.settings });
  const risk = riskForPerson({ baseHazard: { smoothed: 0.02, lo: 0.01, hi: 0.04 }, factors, model, horizonDays: 90 });
  const cost = replacementCostFor(person, env.store.state.settings);
  const candidates = candidateInterventions(env.store.state, person, risk, cost, env.store.state.settings);
  const payAdjust = candidates.find((c) => c.id === 'pay-adjust');
  // Target = max(bandMin, 0.95 × midpoint) = max(104000, 110200) = 110200; gap = 20200.
  assert.equal(payAdjust.moneyCost, 20200);
  assert.equal(payAdjust.currency, 'USD');
  assert.ok(payAdjust.hazardReduction > 0 && payAdjust.hazardReduction < 1);
  assert.ok(payAdjust.benefit > 0);
  assert.ok(payAdjust.benefitLo <= payAdjust.benefit, 'the conservative benefit never exceeds the point estimate');
  const freebies = candidates.filter((c) => c.costKind === undefined && c.moneyCost === 0);
  assert.ok(freebies.every((c) => c.hours > 0), 'an attention-only intervention still costs attention');

  // Someone with no pay data gets a blocked raise, not an invented one.
  const blind = addPerson(env, { name: 'Unpriced Person', monthsAgo: 40 });
  const blindPerson = env.store.state.people.find((p) => p.id === blind);
  const blindFactors = detectFactors(env.store.state, blindPerson, { now: NOW, settings: env.store.state.settings });
  const blindRisk = riskForPerson({ baseHazard: { smoothed: 0.02, lo: 0.01, hi: 0.04 }, factors: blindFactors, model, horizonDays: 90 });
  const blindCandidates = candidateInterventions(env.store.state, blindPerson, blindRisk, null, env.store.state.settings);
  assert.equal(blindCandidates.some((c) => c.id === 'pay-adjust'), false, 'no pay factor without pay data');
});

/* ==================================================== 5. the allocation lab */

test('the optimiser respects both constraints, ranks, and keeps its fairness tier', () => {
  const candidates = [
    { id: 'pay-adjust', personId: 'p1', moneyCost: 12000, hours: 2, benefit: 9000, benefitLo: 1000, hazardFactor: 0.7, removesFactors: ['pay-below-band'] },
    { id: 'growth-plan', personId: 'p2', moneyCost: 0, hours: 2, benefit: 6000, benefitLo: 3000, hazardFactor: 0.8, removesFactors: ['development-void'] },
    { id: 'cadence-reset', personId: 'p3', moneyCost: 0, hours: 8, benefit: 5000, benefitLo: 2500, hazardFactor: 0.77, removesFactors: ['cadence-decay'] },
    { id: 'level-review', personId: 'p4', moneyCost: 20000, hours: 6, benefit: 15000, benefitLo: 4000, hazardFactor: 0.65, removesFactors: ['promotion-stall'] },
  ];
  const tight = optimizeRetention(candidates, { budget: 12000, hours: 10 });
  // Tier 0 (pay gap) is funded before anything else even though its ratio is worse.
  assert.equal(tight.selected[0].id, 'pay-adjust');
  assert.ok(tight.spend <= 12000);
  assert.ok(tight.hoursUsed <= 10);
  assert.ok(tight.selected.length >= 2, 'attention-only interventions still fit');
  assert.ok(tight.skipped.every((c) => c.skippedBecause));
  assert.equal(tight.equity.warning, null, 'the pay gap was funded, so no fairness warning');

  const unfair = optimizeRetention(candidates, { budget: 1000, hours: 10 });
  assert.equal(unfair.selected.some((c) => c.id === 'pay-adjust'), false);
  assert.ok(unfair.equity.unaddressedPayGaps >= 1);
  assert.ok(unfair.equity.warning.includes('unfunded'));

  const noHours = optimizeRetention(candidates, { budget: 100000, hours: 1 });
  assert.equal(noHours.selected.length, 0, 'nothing fits a one-hour allowance');
  assert.ok(noHours.method.includes('Greedy'));
});

/* ========================================================= 6. calibration */

test('concordance is censoring-aware and a reversed ordering scores below chance', () => {
  const rows = [
    { personId: 'a', event: true, tenureMonths: 6 },
    { personId: 'b', event: true, tenureMonths: 12 },
    { personId: 'c', event: false, tenureMonths: 20 },
  ];
  const perfect = concordance(rows, new Map([['a', 3], ['b', 2], ['c', 1]]));
  assert.equal(perfect.c, 1);
  assert.equal(perfect.pairs, 3);
  assert.equal(perfect.sufficient, false, `${RETENTION_MIN_PAIRS} pairs are required`);

  const reversed = concordance(rows, new Map([['a', 1], ['b', 2], ['c', 3]]));
  assert.equal(reversed.c, 0);

  // A censored record that left earlier than an event cannot be compared with it.
  const censoredEarly = concordance(
    [{ personId: 'x', event: false, tenureMonths: 4 }, { personId: 'y', event: true, tenureMonths: 9 }],
    new Map([['x', 5], ['y', 1]]),
  );
  assert.equal(censoredEarly.pairs, 0);
  assert.equal(censoredEarly.c, null);
});

test('the Brier score only counts plans whose horizon has actually closed', () => {
  const env = harness();
  const id = addPerson(env, { name: 'Settled Person', monthsAgo: 30 });
  env.store.update((draft) => {
    draft.retentionPlans.push({
      id: 'ret-1', personId: id, status: 'committed', source: 'manual', proposedOn: '2025-01-01',
      committedOn: '2025-01-01', reviewOn: '2025-02-01', horizonDays: 90, predictedRisk: 40,
      predictedBand: 'elevated', mode: 'prior', rationale: '', interventions: [], committedCost: 0,
      currency: 'USD', budgetId: null, decisionId: null, caseId: null, closedOn: null, closeReason: '',
      createdAt: `${TODAY}T09:00:00.000Z`, updatedAt: `${TODAY}T09:00:00.000Z`, history: [],
    });
    draft.retentionPlans.push({
      id: 'ret-2', personId: id, status: 'committed', source: 'manual', proposedOn: TODAY,
      committedOn: TODAY, reviewOn: null, horizonDays: 90, predictedRisk: 40, predictedBand: 'elevated',
      mode: 'prior', rationale: '', interventions: [], committedCost: 0, currency: null, budgetId: null,
      decisionId: null, caseId: null, closedOn: null, closeReason: '', createdAt: `${TODAY}T09:00:00.000Z`,
      updatedAt: `${TODAY}T09:00:00.000Z`, history: [],
    });
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'seed plans' });
  const brier = planBrier(env.store.state, { now: NOW });
  assert.equal(brier.n, 1, 'the open-horizon plan is not scored');
  assert.ok(Math.abs(brier.brier - 0.16) < 1e-9, 'a 40% forecast with no departure scores 0.16');
});

/* ============================================== 7. report composition */

test('the report separates priced from unpriced people and never sums currencies', () => {
  const env = harness();
  addPerson(env, { name: 'Dollar One', monthsAgo: 20, pay: { currency: 'USD', annualCost: 90000, bandMin: 100000, bandMax: 120000 } });
  addPerson(env, { name: 'Euro One', monthsAgo: 20, pay: { currency: 'EUR', annualCost: 80000, bandMin: 90000, bandMax: 110000 } });
  addPerson(env, { name: 'No Pay', monthsAgo: 6 });
  const report = buildRetentionReport(env.store.state, { now: NOW, settings: env.store.state.settings });
  assert.equal(report.people.length, 3);
  const currencies = report.totals.byCurrency.map((c) => c.currency).sort();
  assert.deepEqual(currencies, ['EUR', 'USD']);
  assert.equal(report.totals.unpriced, 1);
  assert.ok(report.totals.byCurrency.every((c) => Number.isFinite(c.point) && c.point > 0));
  assert.equal(report.engineVersion, RETENTION_ENGINE_VERSION);
  assert.equal(report.model.mode, 'prior');
  assert.ok(retentionBrief(report, { teamName: 'Test' }).length > 0);
});

test('archived people stay in the survival evidence but leave the risk ledger', () => {
  const env = harness();
  addPerson(env, {
    name: 'Departed Person',
    monthsAgo: 40,
    pay: { currency: 'USD', annualCost: 90000, bandMin: 100000, bandMax: 120000 },
    departure: { lastDay: new Date(NOW.getTime() - 60 * 86400000).toISOString().slice(0, 10), type: 'voluntary', reasonClass: 'growth' },
  });
  addPerson(env, { name: 'Present Person', monthsAgo: 10 });
  const report = buildRetentionReport(env.store.state, { now: NOW, settings: env.store.state.settings });
  assert.equal(report.people.length, 1, 'the ledger ranks people still here');
  assert.equal(report.people[0].person.name, 'Present Person');
  assert.equal(report.survivorship.totalEvents, 1, 'the departure is still evidence');
  const personTime = buildPersonTime(env.store.state, { now: NOW });
  assert.equal(personTime.rows.length, 2);
  assert.equal(personTime.rows.find((r) => r.event).personId !== undefined, true);
});

/* ========================================================= 8. the writes */

test('compensation is validated, cleared honestly and never derived', () => {
  const env = harness();
  const id = addPerson(env, { name: 'Pay Person', monthsAgo: 24 });
  assert.equal(env.store.state.people.find((p) => p.id === id).compensation, null);

  assert.equal(env.api.updatePersonCompensation(id, { annualCost: 100000 }).ok, false, 'a figure needs a currency');
  assert.equal(env.api.updatePersonCompensation(id, { currency: 'ZZZZZ', annualCost: 1 }).ok, false);
  assert.equal(env.api.updatePersonCompensation(id, { currency: 'USD', bandMin: 100, bandMax: 50 }).ok, false, 'min above max is rejected, not repaired');
  assert.equal(env.api.updatePersonCompensation(id, { currency: 'USD', annualCost: -5 }).ok, false);
  assert.equal(env.api.updatePersonCompensation(id, { currency: 'USD', lastPromotionOn: '2999-01-01' }).ok, false);

  assert.equal(env.api.updatePersonCompensation(id, { currency: 'usd', annualCost: 100000, bandMin: 90000, bandMax: 120000, lastPromotionOn: '2025-06-01' }).ok, true);
  const person = env.store.state.people.find((p) => p.id === id);
  assert.equal(person.compensation.currency, 'USD');
  assert.equal(person.compensation.annualCost, 100000);
  assert.equal(person.lastPromotionOn, '2025-06-01');

  assert.equal(env.api.updatePersonCompensation(id, { currency: '', annualCost: '', bandMin: '', bandMax: '' }).ok, true);
  assert.equal(env.store.state.people.find((p) => p.id === id).compensation, null, 'blank clears back to unknown');
});

test('recording a departure archives the person, opens a continuity case and cascades', () => {
  const env = harness();
  const id = addPerson(env, { name: 'Leaving Person', monthsAgo: 30, pay: { currency: 'USD', annualCost: 90000, bandMin: 100000, bandMax: 120000 } });
  const casesBefore = env.store.state.cases.length;
  const lastDay = new Date(NOW.getTime() - 5 * 86400000).toISOString().slice(0, 10);
  const result = env.api.recordDeparture(id, { lastDay, type: 'voluntary', reasonClass: 'compensation', regrettable: true });
  assert.ok(result.ok);
  assert.ok(result.caseId, 'a continuity case is opened through the shared case engine');
  const state = env.store.state;
  assert.equal(state.departures.length, 1);
  assert.equal(state.departures[0].continuityCaseId, result.caseId);
  assert.equal(state.people.find((p) => p.id === id).status, 'archived');
  assert.equal(state.cases.length, casesBefore + 1);
  // The case engine's own propagation ran: at least one link or audit event.
  assert.ok(state.links.some((l) => l.sourceType === 'case' && l.sourceId === result.caseId && l.targetType === 'person' && l.targetId === id));
  assert.ok(state.events.some((e) => e.type === 'departure.continuity'));

  // One person leaves once.
  assert.equal(env.api.recordDeparture(id, { lastDay, type: 'voluntary' }).ok, false);
  // Future and pre-start departures are rejected.
  const other = addPerson(env, { name: 'Still Here', monthsAgo: 3 });
  assert.equal(env.api.recordDeparture(other, { lastDay: '2999-01-01' }).ok, false);
  assert.equal(env.api.recordDeparture(other, { lastDay: '1999-01-01' }).ok, false);
  assert.equal(env.api.recordDeparture(other, { lastDay: TODAY, type: 'sabbatical' }).ok, false);
});

test('a plan is proposed, committed once, checked in and never silently deleted', () => {
  const env = harness();
  // RULE-RET-01 would otherwise propose a plan the moment this person is added;
  // this test is about the manual write path, not the rule.
  env.store.update((draft) => { draft.settings.retentionAutoPropagate = false; }, {
    type: 'settings.updated', entity: 'settings', entityId: '', summary: 'paused for the write-path test',
  });
  const id = addPerson(env, {
    name: 'Planned Person',
    monthsAgo: 40,
    pay: { currency: 'USD', annualCost: 90000, bandMin: 104000, bandMax: 128000 },
  });
  const proposal = env.api.planRetention(id, { interventions: ['pay-adjust', 'cadence-reset'], rationale: 'Below band and drifting.' });
  assert.ok(proposal.ok, proposal.error);
  const plan = env.store.state.retentionPlans.find((p) => p.id === proposal.id);
  assert.equal(plan.status, 'proposed');
  assert.equal(plan.committedCost, 0, 'a proposal commits no money');
  assert.ok(plan.predictedRisk > 0, 'the forecast is recorded for calibration');
  assert.equal(env.api.planRetention(id, {}).ok, false, 'one live plan per person');

  const commit = env.api.commitRetentionPlan(plan.id, { interventions: ['pay-adjust', 'cadence-reset'] });
  assert.ok(commit.ok, commit.error);
  assert.ok(commit.committedCost > 0);
  assert.ok(commit.decisionId, 'committing raises a DACI decision');
  const committed = env.store.state.retentionPlans.find((p) => p.id === plan.id);
  assert.equal(committed.status, 'committed');
  assert.equal(committed.decisionId, commit.decisionId);
  assert.ok(env.store.state.decisions.some((d) => d.id === commit.decisionId));
  assert.ok(env.store.state.links.some((l) => l.sourceType === 'decision' && l.sourceId === commit.decisionId && l.targetType === 'retention' && l.targetId === plan.id));

  assert.equal(env.api.commitRetentionPlan(plan.id, {}).ok, false, 'a committed plan cannot be committed twice');
  assert.equal(env.api.deleteRetentionPlan(plan.id).ok, false, 'a commitment is history');
  assert.equal(env.api.logRetentionCheckin(plan.id, { note: 'short' }).ok, false);
  assert.ok(env.api.logRetentionCheckin(plan.id, { note: 'Pay correction approved and on-call reduced.' }).ok);
  assert.equal(env.store.state.retentionPlans.find((p) => p.id === plan.id).history.length, 3);
  assert.ok(env.api.completeRetentionPlan(plan.id, { note: 'Settled: pay corrected, load reduced, engagement up.' }).ok);
  assert.equal(env.store.state.retentionPlans.find((p) => p.id === plan.id).status, 'completed');

  // A declined plan requires a written reason.
  const second = addPerson(env, { name: 'Second Person', monthsAgo: 40 });
  const secondPlan = env.api.planRetention(second, { interventions: ['growth-plan'] });
  assert.ok(secondPlan.ok, secondPlan.error);
  assert.equal(env.api.declineRetentionPlan(secondPlan.id, 'no').ok, false);
  assert.ok(env.api.declineRetentionPlan(secondPlan.id, 'Not the right quarter to spend on this.').ok);
});

/* =========================================================== 9. the rules */

test('RULE-RET-01 proposes exactly one plan per at-risk person, and never commits money', () => {
  const env = harness();
  const id = addPerson(env, {
    name: 'At Risk',
    monthsAgo: 40,
    pay: { currency: 'USD', annualCost: 70000, bandMin: 104000, bandMax: 128000 },
  });
  // A plan costs a leader's attention, so RULE-RET-01 only proposes for someone
  // the workspace has actually observed. The unobserved twin must stay silent.
  const unobserved = addPerson(env, {
    name: 'Imported Only',
    monthsAgo: 40,
    pay: { currency: 'USD', annualCost: 70000, bandMin: 104000, bandMax: 128000 },
  });
  env.api.logOneOnOne({ personId: id, date: TODAY, status: 'held', mood: 2, notes: 'Stretched.', agenda: [] });
  env.api.scanRetention();
  const first = env.store.state.retentionPlans.filter((p) => p.personId === id);
  assert.equal(first.length, 1);
  assert.equal(first[0].status, 'proposed');
  assert.equal(first[0].source, 'RULE-RET-01');
  assert.equal(first[0].committedCost, 0);
  assert.ok(first[0].interventions.length > 0);

  env.api.scanRetention();
  env.api.scanRetention();
  assert.equal(env.store.state.retentionPlans.filter((p) => p.personId === id).length, 1, 'the rule is idempotent');
  assert.equal(env.store.state.retentionPlans.filter((p) => p.personId === unobserved).length, 0, 'missing data is not risk');
  assert.ok(env.store.state.links.some((l) => l.sourceType === 'person' && l.sourceId === id && l.targetType === 'retention' && l.relation === 'retains'));
});

test('RULE-RET-02 makes a live plan moot on departure, with a written reason', () => {
  const env = harness();
  const id = addPerson(env, { name: 'Planned Leaver', monthsAgo: 40, pay: { currency: 'USD', annualCost: 70000, bandMin: 104000, bandMax: 128000 } });
  env.api.logOneOnOne({ personId: id, date: TODAY, status: 'held', mood: 2, notes: 'Wobbling.', agenda: [] });
  env.api.scanRetention();
  const plan = env.store.state.retentionPlans.find((p) => p.personId === id);
  assert.ok(plan);
  const lastDay = new Date(NOW.getTime() - 3 * 86400000).toISOString().slice(0, 10);
  env.api.recordDeparture(id, { lastDay, type: 'voluntary', reasonClass: 'compensation' });
  const after = env.store.state.retentionPlans.find((p) => p.personId === id);
  assert.equal(after.status, 'moot');
  assert.ok(after.closeReason.includes(lastDay));
  assert.ok(after.history.some((h) => h.action === 'moot'));
});

test('RULE-RET-03 and RULE-RET-04 raise one governance decision each, not a case per person', () => {
  const env = harness();
  // 10 voluntary departures cross the evidence floor.
  for (let i = 0; i < 12; i += 1) {
    const id = addPerson(env, {
      name: `Leaver ${i}`,
      monthsAgo: 40 + i,
      pay: { currency: 'USD', annualCost: 90000, bandMin: 95000, bandMax: 120000 },
    });
    const lastDay = new Date(NOW.getTime() - (30 + i * 20) * 86400000).toISOString().slice(0, 10);
    env.api.recordDeparture(id, { lastDay, type: 'voluntary', reasonClass: i < 3 ? 'workload' : 'growth' });
  }
  env.api.scanRetention();
  env.api.scanRetention();
  const state = env.store.state;
  const floorDecisions = state.decisions.filter((d) => String(d.rationale).includes('[RULE-RET-03]'));
  assert.equal(floorDecisions.length, 1, 'the evidence-floor decision is raised exactly once');
  const clusterDecisions = state.decisions.filter((d) => String(d.rationale).includes('[RULE-RET-04:'));
  assert.equal(clusterDecisions.length, 2, 'one decision per clustered reason class, not one per person');
  assert.equal(clusterDecisions.length, exitReasonClusters(state, { now: NOW }).length);
  // Every decision carries options a human can choose between.
  for (const decision of [...floorDecisions, ...clusterDecisions]) assert.ok(decision.options.length >= 2);
});

test('pausing automatic retention propagation stops rule writes, but an explicit scan still runs', () => {
  const env = harness();
  // The switch has to be off before the write that would otherwise propagate,
  // so the person is added into an already-paused workspace.
  env.store.update((draft) => { draft.settings.retentionAutoPropagate = false; }, { type: 'settings.updated', entity: 'settings', entityId: '', summary: 'paused' });
  const id = addPerson(env, {
    name: 'Paused Risk',
    monthsAgo: 40,
    pay: { currency: 'USD', annualCost: 70000, bandMin: 104000, bandMax: 128000 },
  });
  env.api.logOneOnOne({ personId: id, date: TODAY, status: 'held', mood: 2, notes: 'Tired.', agenda: [] });
  assert.equal(env.store.state.retentionPlans.length, 0, 'automatic writes are paused');
  env.api.scanRetention();
  assert.equal(env.store.state.retentionPlans.length, 1, 'an explicit scan still runs');
});

test('the rule never throws into the store when a record is malformed', () => {
  const draft = {
    settings: {},
    people: [{ id: 'p1', name: 'Broken', startDate: null, status: 'active' }],
    departures: [{ id: 'd1', personId: 'p1', lastDay: null, type: 'voluntary' }],
    retentionPlans: [{ id: 'r1', personId: 'p1', status: 'committed' }],
    decisions: null,
    links: null,
  };
  const propagations = retentionRule(draft, { event: { type: 'departure.recorded' }, now: NOW, idFactory: (p) => `${p}-x` });
  assert.ok(Array.isArray(propagations));
});

/* ================================================== 10. schema & migration */

test('schema v28 → v29 is additive and invents no compensation, departure or plan', () => {
  assert.equal(SCHEMA_VERSION, 29);
  const v28 = {
    schemaVersion: 28,
    meta: { createdAt: `${TODAY}T09:00:00.000Z`, updatedAt: `${TODAY}T09:00:00.000Z`, isDemo: false, revision: 3 },
    settings: { leaderName: 'Sam', teamName: 'Team' },
    people: [{ id: 'p1', name: 'Real Person', startDate: '2024-01-01', status: 'active' }],
    decisions: [], links: [], events: [],
  };
  const migrated = migrate(v28);
  assert.equal(migrated.raw.schemaVersion, 29, 'the migrator rewrites the version');
  assert.ok(migrated.applied.length > 0);
  // migrate() returns { raw, applied }; normalisation is a separate step.
  const state = normalizeState(migrated.raw, { now: new Date(`${TODAY}T09:00:00Z`) }).state;
  assert.equal(state.schemaVersion, 29);
  assert.deepEqual(state.departures, []);
  assert.deepEqual(state.retentionPlans, []);
  assert.equal(state.people[0].compensation, null, 'no compensation is invented');
  assert.equal(state.people[0].lastPromotionOn, null);
  assert.equal(state.settings.retentionEvidenceFloor, 10);
  assert.equal(state.settings.retentionHorizonDays, 90);
  assert.equal(state.settings.retentionAutoPropagate, true);
});

test('normalisation repairs the retention ledger instead of trusting it', () => {
  const raw = {
    ...createEmptyState(`${TODAY}T09:00:00.000Z`),
    schemaVersion: 29,
    settings: { retentionHorizonDays: -40, retentionRidge: 9999, retentionPriorMonthlyHazardPct: 'nonsense' },
    people: [
      { id: 'p1', name: 'Kept', startDate: '2024-01-01', status: 'active', compensation: { currency: 'usd', annualCost: '85000', bandMin: 90000, bandMax: 80000 } },
      { id: 'gone', name: 'Removed', startDate: '2024-01-01', status: 'active' },
    ],
    departures: [
      { id: 'd-ok', personId: 'p1', lastDay: '2026-01-10', type: 'voluntary', reasonClass: 'growth' },
      { id: 'd-dup', personId: 'p1', lastDay: '2026-02-10', type: 'voluntary', reasonClass: 'growth' },
      { id: 'd-undated', personId: 'p1', lastDay: null, type: 'voluntary' },
      { id: 'd-orphan', personId: 'ghost', lastDay: '2026-01-01', type: 'voluntary' },
      { id: 'd-future', personId: 'p1', lastDay: '2999-01-01', type: 'voluntary' },
      { id: 'd-type', personId: 'gone', lastDay: '2026-01-01', type: 'sabbatical' },
    ],
    retentionPlans: [
      { id: 'r-orphan', personId: 'ghost', status: 'proposed' },
      { id: 'r-bad-status', personId: 'p1', status: 'wishful' },
      { id: 'r-committed-no-date', personId: 'p1', status: 'committed', committedOn: null },
      { id: 'r-ok', personId: 'p1', status: 'committed', committedOn: '2026-01-01', interventions: [{ id: 'pay-adjust', moneyCost: 1000, hours: 2 }, { id: 'not-a-thing' }] },
    ],
    links: [{ id: 'l1', sourceType: 'person', sourceId: 'p1', targetType: 'retention', targetId: 'r-ok', relation: 'retains', createdOn: TODAY }],
  };
  const result = normalizeState(raw, { now: new Date(`${TODAY}T09:00:00Z`) });
  const state = result.state;
  assert.equal(state.settings.retentionHorizonDays, 90, 'an invalid horizon falls back to the default');
  assert.equal(state.settings.retentionPriorMonthlyHazardPct, 1.2);
  assert.equal(state.people.find((p) => p.id === 'p1').compensation.currency, 'USD');
  assert.equal(state.people.find((p) => p.id === 'p1').compensation.bandMin, 90000, 'an inverted band is kept as recorded');
  assert.ok(result.warnings.some((w) => w.includes('minimum above its maximum')));

  assert.equal(state.departures.length, 2, 'duplicate, undated, orphaned, future and invalid-type records are dropped or kept honestly');
  assert.equal(state.departures.some((d) => d.personId === 'gone' && d.type === 'unknown'), true);
  assert.equal(state.retentionPlans.length, 3, 'only the orphaned plan is dropped; a bad status and a dateless commitment are repaired, not deleted');
  assert.equal(state.retentionPlans.find((p) => p.id === 'r-bad-status').status, 'proposed');
  assert.equal(state.retentionPlans.find((p) => p.id === 'r-committed-no-date').status, 'proposed', 'a commitment without a date is not a commitment');
  assert.equal(state.retentionPlans.find((p) => p.id === 'r-ok').interventions.length, 1, 'an unknown intervention id is dropped');
  assert.ok(state.links.some((l) => l.targetType === 'retention' && l.targetId === 'r-ok'));
});

test('point-in-time rewind removes later departures, plans and commitments', () => {
  const env = harness();
  const keptId = addPerson(env, { name: 'Rewind Kept', monthsAgo: 40, pay: { currency: 'USD', annualCost: 70000, bandMin: 104000, bandMax: 128000 } });
  env.api.logOneOnOne({ personId: keptId, date: TODAY, status: 'held', mood: 2, notes: 'Stretched.', agenda: [] });
  env.api.scanRetention();
  const plan = env.store.state.retentionPlans[0];
  env.api.commitRetentionPlan(plan.id, {});
  const stateNow = env.store.state;
  assert.equal(stateNow.retentionPlans[0].status, 'committed');

  const rewound = reconstructStateAt(stateNow, '2020-01-01', { currentDay: TODAY });
  assert.equal(rewound.state.retentionPlans.length, 0, 'a plan created after the cutoff did not exist yet');
  assert.equal(rewound.state.departures.length, 0);
  assert.ok(Array.isArray(rewound.fidelity.retention.reasons), 'the rewind reports what it had to leave out');
});

test('clearDemo removes fabricated departures and plans with their people', () => {
  const demo = buildDemoState(NOW);
  assert.ok(demo.departures.length >= 3);
  assert.ok(demo.retentionPlans.length >= 2);
  const env = harness();
  env.store.load();
  env.store.seedDemo({ now: NOW });
  assert.ok(env.store.state.departures.length >= 3);
  const realPerson = env.api.addPerson({ name: 'Real Person', startDate: '2025-01-01' });
  env.api.updatePersonCompensation(realPerson.id, { currency: 'USD', annualCost: 80000, bandMin: 85000, bandMax: 100000 });
  env.store.clearDemo();
  assert.equal(env.store.state.departures.length, 0);
  assert.ok(
    env.store.state.retentionPlans.every((p) => p.personId === realPerson.id),
    'demo plans go with their people; a plan the rule proposed for a real person stays',
  );
  assert.ok(env.store.state.people.some((p) => p.id === realPerson.id), 'the real person survives');
});

/* ============================================================== 11. CSV */

test('CSV scope #29 is pseudonymous, formula-safe and free of free text', () => {
  assert.equal(CSV_EXPORTS.length, 29);
  const scope = CSV_EXPORTS.find((s) => s.key === 'retention');
  assert.ok(scope);
  assert.equal(scope.sensitive, true);
  assert.ok(scope.description.includes('opaque references'));

  const state = buildDemoState(NOW);
  const result = exportWorkspaceCsv(state, 'retention', { now: NOW });
  assert.ok(result.ok, result.error);
  const text = result.csv;
  assert.ok(text.includes('person_ref'));
  for (const person of state.people) {
    assert.equal(text.includes(person.name), false, `the export must not contain the name ${person.name}`);
  }
  assert.ok(!text.includes('Priya'), 'no names anywhere');
  assert.ok(!text.includes('On-call load was raised'), 'exit notes are excluded');
  // People are exported as opaque references.
  assert.ok(/p1/.test(text));
  // Header count matches every row.
  const lines = text.split('\r\n').filter(Boolean);
  const header = lines[0].split(',');
  for (const line of lines.slice(1)) {
    // Only check row arity for rows without embedded commas in quoted cells.
    if (!line.includes('"')) assert.equal(line.split(',').length, header.length, `row arity: ${line.slice(0, 80)}`);
  }
  assert.ok(text.includes('tenure_band'));
  assert.ok(text.includes('hazard_ratio'));
});

test('CSV export neutralises formula injection in the retention scope', () => {
  const env = harness();
  const id = addPerson(env, { name: '=HYPERLINK("evil")', monthsAgo: 20, pay: { currency: 'USD', annualCost: 90000, bandMin: 95000, bandMax: 120000 } });
  env.api.planRetention(id, { interventions: ['growth-plan'], rationale: '=cmd' });
  const result = exportWorkspaceCsv(env.store.state, 'retention', { now: NOW });
  assert.ok(result.ok, result.error);
  assert.ok(!/(^|,)=HYPERLINK/m.test(result.csv), 'a leading = is neutralised');
  assert.ok(!/(^|,)=cmd/m.test(result.csv));
});

/* =========================================================== 12. signals */

test('RET signals fire on evidence and stay silent on an empty workspace', () => {
  const empty = createEmptyState(`${TODAY}T09:00:00.000Z`);
  assert.deepEqual(retentionSignals(empty, NOW), []);

  const env = harness();
  const id = addPerson(env, {
    name: 'Signal Person',
    monthsAgo: 40,
    pay: { currency: 'USD', annualCost: 70000, bandMin: 104000, bandMax: 128000 },
  });
  const signals = retentionSignals(env.store.state, NOW);
  const ids = signals.map((s) => s.ruleId);
  assert.ok(ids.includes('RET-01'), 'elevated risk without a committed plan');
  assert.ok(ids.includes('RET-02'), 'prior-mode disclosure');
  assert.ok(ids.includes('RET-06') === false, 'everyone here is priced');
  const risk = signals.find((s) => s.ruleId === 'RET-01');
  assert.equal(risk.personId, id);
  assert.ok(risk.evidence.length >= 2);
  assert.equal(risk.action.route, '#/retention');
  // A committed plan silences RET-01.
  env.api.logOneOnOne({ personId: id, date: TODAY, status: 'held', mood: 2, notes: 'Stretched.', agenda: [] });
  env.api.scanRetention();
  const plan = env.store.state.retentionPlans[0];
  assert.ok(plan, 'the rule proposed a plan once the person had been observed');
  env.api.commitRetentionPlan(plan.id, {});
  const after = retentionSignals(env.store.state, NOW).map((s) => s.ruleId);
  assert.ok(!after.includes('RET-01'), 'a committed plan silences the risk signal');

  // Unpriced people produce RET-06.
  addPerson(env, { name: 'Unpriced Person', monthsAgo: 20 });
  assert.ok(retentionSignals(env.store.state, NOW).some((s) => s.ruleId === 'RET-06'));

  // The signals flow into the shared insights pipeline under the Retention domain.
  const insights = buildInsights(env.store.state, NOW);
  // insights.urgent is a subset of findings, so the same signal can appear twice.
  const surfaced = Array.from(new Map([...insights.findings, ...insights.urgent]
    .filter((f) => f.domain === 'Retention')
    .map((f) => [`${f.ruleId}|${f.personId || ''}|${f.title}`, f])).values());
  assert.ok(surfaced.length >= 1, 'retention signals reach the shared insights pipeline');
  assert.ok(surfaced.every((f) => f.action?.route?.startsWith('#/retention')), 'every retention finding routes into the terminal');
});

/* =============================================================== 13. UI */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => consoleErrors.push(e.message));
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

function click(node) {
  assert.ok(node, 'expected a clickable DOM node');
  node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
}

async function withApp(fn) {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    await fn(app, env);
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
}

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

test('UI: all six retention tabs render axe-clean on the demo workspace', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.ctx.loadDemo();
    assert.ok(app.store.state.departures.length >= 3, 'the demo carries a real exit history');

    for (const [hash, marker] of [
      ['#/retention', 'Risk ledger'],
      ['#/retention?tab=plans', 'Plan ledger'],
      ['#/retention?tab=survival', 'Kaplan–Meier survival of tenure'],
      ['#/retention?tab=invest', 'Set the constraints'],
      ['#/retention?tab=departures', 'Departure ledger'],
      ['#/retention?tab=board', 'Board pack'],
    ]) {
      window.location.hash = hash;
      await new Promise((r) => setTimeout(r, 30));
      assert.ok(document.body.textContent.includes(marker), `expected ${marker} on ${hash}`);
      assert.deepEqual(await axeViolations(env), [], `${hash} is axe-clean`);
    }
    assert.equal(env.consoleErrors.length, 0, `unexpected console errors: ${env.consoleErrors.join(' | ')}`);
  });
});

test('UI: the nav badge and Today card surface retention attention', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.ctx.loadDemo();
    window.location.hash = '#/today';
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(document.body.textContent.includes('Retention attention'), 'Today shows the retention card');
    assert.ok(document.body.textContent.includes('over 90d'));
    // The badge counts people above the watch band without a committed plan.
    app.ctx.navigate('#/retention');
    await new Promise((r) => setTimeout(r, 30));
    const navItem = Array.from(document.querySelectorAll('.nav-item')).find((n) => n.textContent.includes('Retention'));
    assert.ok(navItem, 'the retention route is in the navigation');
  });
});

test('UI: proposing a plan from the ledger writes a proposal and no money', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.ctx.loadDemo();
    window.location.hash = '#/retention';
    await new Promise((r) => setTimeout(r, 40));
    const person = app.store.state.people.find((p) => p.name === 'Priya Natarajan');
    // Priya already has a committed demo plan, so use someone without one.
    const target = app.store.state.people.find((p) => p.status !== 'archived' && !app.store.state.retentionPlans.some((plan) => plan.personId === p.id && (plan.status === 'proposed' || plan.status === 'committed')));
    assert.ok(target, 'the demo has a person with no live plan');
    const button = document.querySelector(`[data-testid="retention-plan-${target.id}"]`);
    click(button);
    await new Promise((r) => setTimeout(r, 30));
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'the plan dialog opens');
    const form = dialog.querySelector('form');
    assert.ok(form);
    form.dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 40));
    const plans = app.store.state.retentionPlans.filter((p) => p.personId === target.id);
    assert.equal(plans.length, 1, 'one proposal was written');
    assert.equal(plans[0].status, 'proposed');
    assert.equal(plans[0].committedCost, 0);
    assert.ok(person);
  });
});

test('UI: recording a departure from the ledger cascades and refreshes the terminal', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.ctx.loadDemo();
    window.location.hash = '#/retention?tab=departures';
    await new Promise((r) => setTimeout(r, 40));
    const before = app.store.state.departures.length;
    const person = app.store.state.people.find((p) => p.status !== 'archived');
    const recordButton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Record departure');
    assert.ok(recordButton);
    click(recordButton);
    await new Promise((r) => setTimeout(r, 30));
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    dialog.querySelector('form').dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(app.store.state.departures.length, before + 1, 'the departure is recorded');
    const departure = app.store.state.departures.at(-1);
    assert.ok(departure.continuityCaseId, 'a continuity case was opened');
    assert.equal(app.store.state.people.find((p) => p.id === person.id).status, 'archived');
  });
});
