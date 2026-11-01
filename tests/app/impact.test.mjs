/**
 * tests/app/impact.test.mjs — Impact Ledger suite (Session 49, Schema v31).
 *
 *   1. Vitals: as-of reconstruction from dated records only, null ≠ zero,
 *      deterministic, no fabricated history before the first record.
 *   2. Anchored grid: no bucket mixes pre- and post-intervention days.
 *   3. Estimators: exact OLS recovery, segmented ITS coefficient recovery,
 *      HAC standard errors, MDE from pre-period variance, pre-trend test,
 *      in-time and in-space placebo inference, breakdown-trend arithmetic.
 *   4. Verdict gating: every gate that can downgrade a result is exercised.
 *   5. Pre-registration firewall: derived grade, immutable-after-window
 *      prediction, frozen evaluation.
 *   6. Atomic cross-module propagation RULE-IMP-01..04 with idempotency and
 *      pause semantics.
 *   7. Schema v31 migration and normalizer invariants.
 *   8. Signals, CSV scope and DOM/axe.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, normalizeSettings, migrate, SCHEMA_VERSION, IMPACT_INTERVENTION_TYPES } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { addDays, dayKey } from '../../app/core/time.js';
import {
  VITALS,
  VITAL_BY_ID,
  buildAnchoredGrid,
  buildVitalSeries,
  buildVitalPanel,
  cusumChangepoints,
  firstRecordDay,
  signedTowardHypothesis,
} from '../../app/core/domain/vitals.js';
import {
  IMPACT_ENGINE_VERSION,
  VERDICTS,
  breakdownTrend,
  buildImpactBrief,
  designPower,
  studyHorizonEnd,
  buildImpactReport,
  erfc,
  evaluateStudy,
  gradeOf,
  impactCalibration,
  impactSignals,
  inSpacePlacebo,
  inTimePlacebo,
  interruptedTimeSeries,
  olsWithHac,
  preTrendTest,
  studyGrid,
  studyStatusOf,
  syntheticControl,
  twoSidedP,
} from '../../app/core/domain/impact.js';
import { impactRule } from '../../app/core/domain/impactRules.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-27T10:00:00.000Z');
const TODAY = '2026-10-27';
const TREATMENT = '2026-09-01';

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
  const idFactory = (prefix) => `${prefix}-imp-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}

/**
 * A workspace with a controllable weekly feedback cadence.
 *
 * `pre[i]` is the number of feedback entries in pre-week i (4 people, so the
 * per-person cadence is count/4); `post[i]` the same after the intervention.
 * Dates are exact so the reconstruction, not the fixture, decides the value.
 */
function buildFixtures({ pre = [4, 4, 4, 4, 4, 4, 4, 4], post = [8, 8, 8, 8], treatment = TREATMENT, people = 4 } = {}) {
  const state = createEmptyState(`${dayKey(addDays(treatment, -140))}T09:00:00.000Z`);
  state.meta.isDemo = false;
  for (let i = 0; i < people; i += 1) {
    state.people.push({
      id: `p${i + 1}`,
      name: `Person ${i + 1}`,
      role: 'Engineer',
      level: 'ic',
      team: 'Platform',
      managerId: null,
      startDate: '2025-01-06',
      focus: '',
      talkingPoints: [],
      status: 'active',
      createdAt: `${dayKey(addDays(treatment, -140))}T09:00:00.000Z`,
      archivedAt: null,
    });
  }
  let seq = 0;
  const addFeedback = (day, personIndex) => {
    seq += 1;
    state.feedback.push({
      id: `fb-seed-${seq}`,
      personId: `p${personIndex + 1}`,
      direction: 'given',
      kind: 'positive',
      situation: 'Weekly check',
      behavior: 'Delivered the migration checklist',
      impact: 'The rollout stayed on schedule',
      tags: [],
      date: day,
      observedOn: day,
      followUpOn: null,
      followUpDone: false,
      followUpCompletedOn: null,
      createdAt: `${day}T10:00:00.000Z`,
    });
  };
  // Pre weeks: week i covers treatment - 7*(pre.length - i) .. +6
  pre.forEach((count, i) => {
    const start = addDays(treatment, -7 * (pre.length - i));
    for (let k = 0; k < count; k += 1) addFeedback(addDays(start, k % 7), k % people);
  });
  post.forEach((count, i) => {
    const start = addDays(treatment, 7 * i);
    for (let k = 0; k < count; k += 1) addFeedback(addDays(start, k % 7), k % people);
  });
  return normalizeState(state, { now: NOW }).state;
}

function study(overrides = {}) {
  return {
    id: 'impact-1',
    title: 'Weekly feedback push',
    hypothesis: 'If I give specific feedback every week, cadence rises.',
    vitalId: 'feedback-cadence',
    interventionType: 'feedback',
    interventionId: null,
    interventionLabel: 'Weekly feedback ritual',
    windowStart: TREATMENT,
    baselineWeeks: 8,
    windowWeeks: 4,
    alpha: 0.1,
    expectedEffect: 1,
    expectedConfidence: 70,
    declaredOn: addDays(TREATMENT, -7),
    status: 'running',
    lockedOn: null,
    verdict: null,
    evaluation: null,
    notes: '',
    outcomeNotes: '',
    autoPropagate: true,
    replicationOfId: null,
    history: [],
    createdAt: `${TREATMENT}T09:00:00.000Z`,
    updatedAt: `${TREATMENT}T09:00:00.000Z`,
    ...overrides,
  };
}

/* ================================================================== 1. vitals */

test('vitals: no record of a kind at all means no series — never a run of zeroes', () => {
  const state = buildFixtures();
  const series = buildVitalSeries(state, 'negotiation-cycle', { asOf: NOW, buckets: 12 });
  assert.equal(series.points.length, 0, 'nothing to draw beats twenty-two confident zeroes');
  assert.match(series.reason, /no dated record of this kind/i);
});

test('vitals: a null bucket stays null — an unmeasured week is never a zero', () => {
  const state = buildFixtures();
  // One negotiation opened four months ago and never closed: the log has a
  // coverage frontier, but no window contains a completed cycle.
  state.negotiations = [{
    id: 'neg-1', title: 'Renewal', status: 'active', counterparty: 'Vendor',
    openedOn: addDays(TODAY, -120), closedOn: null, createdAt: `${addDays(TODAY, -120)}T09:00:00.000Z`,
  }];
  const series = buildVitalSeries(state, 'negotiation-cycle', { asOf: NOW, buckets: 12 });
  assert.ok(series.points.length >= 4);
  assert.ok(series.points.every((p) => p.value === null), 'an unclosed negotiation is not a zero-day cycle');
  assert.equal(series.measured, 0);
  assert.ok(series.reason.includes('Fewer than two measurable buckets'));
});

test('vitals: a count of zero IS a real measurement when a denominator exists', () => {
  const state = buildFixtures({ pre: [0, 0, 0, 0, 0, 0, 0, 0], post: [0, 0, 0, 0] });
  // One dated entry well before the window defines the record-keeping frontier,
  // so the empty buckets inside the window are genuine measurements of zero.
  state.feedback.push({
    id: 'fb-old', personId: 'p1', direction: 'given', kind: 'praise', situation: '',
    behavior: 'Ancient history', impact: '', tags: [], date: addDays(TODAY, -220), observedOn: null,
    followUpOn: null, followUpDone: false, followUpCompletedOn: null,
    createdAt: `${addDays(TODAY, -220)}T09:00:00.000Z`,
  });
  const series = buildVitalSeries(state, 'feedback-cadence', { asOf: NOW, buckets: 12 });
  const measured = series.points.filter((p) => p.value !== null);
  assert.ok(measured.length >= 8, 'active people exist, so "zero feedback this week" is measurable');
  assert.ok(measured.every((p) => p.value === 0));
});

test('vitals: history starts at the first dated record, never earlier', () => {
  const state = buildFixtures();
  const earliest = firstRecordDay(state);
  const series = buildVitalSeries(state, 'feedback-cadence', { asOf: NOW, buckets: 60 });
  assert.ok(series.points.every((p) => p.date >= earliest));
});

test('vitals: reconstruction is derived from dates only and is deterministic', () => {
  const state = buildFixtures();
  const a = buildVitalSeries(state, 'feedback-cadence', { asOf: NOW, buckets: 14 });
  const b = buildVitalSeries(state, 'feedback-cadence', { asOf: NOW, buckets: 14 });
  assert.deepEqual(a.points, b.points, 'same state and clock produce the same history');
  // Change a record's date and the value at that week must move.
  const mutated = JSON.parse(JSON.stringify(state));
  mutated.feedback[0].date = addDays(mutated.feedback[0].date, -28);
  const c = buildVitalSeries(mutated, 'feedback-cadence', { asOf: NOW, buckets: 14 });
  assert.notDeepEqual(a.points, c.points);
});

/* ========================================================= 2. anchored grid */

test('grid: no bucket mixes pre- and post-intervention days', () => {
  const grid = buildAnchoredGrid(TREATMENT, { preBuckets: 8, postBuckets: 4 });
  assert.equal(grid.treatmentIndex, 8);
  assert.equal(grid.ends.length, 12);
  const treatmentEnd = grid.ends[grid.treatmentIndex];
  for (let i = 0; i < grid.treatmentIndex; i += 1) {
    assert.ok(grid.ends[i] < TREATMENT, 'every pre bucket ends before the intervention day');
    assert.ok(grid.fromFor(grid.ends[i]) < TREATMENT);
  }
  for (let i = grid.treatmentIndex; i < grid.ends.length; i += 1) {
    assert.equal(grid.fromFor(grid.ends[i]), addDays(grid.ends[i], -7), 'a half-open (from, to] window spans exactly seven days');
    assert.ok(grid.fromFor(grid.ends[i]) >= addDays(TREATMENT, -1), 'the first post window opens exactly on the intervention day');
  }
  assert.equal(addDays(grid.fromFor(treatmentEnd), 1), TREATMENT, 'first post day is the treatment day');
  // The pre window immediately before T covers the six days ending the day before T.
  const lastPre = grid.ends[grid.treatmentIndex - 1];
  assert.equal(lastPre, addDays(TREATMENT, -1));
});

test('grid: incomplete periods are excluded, so a partial week never enters the estimate', () => {
  const state = buildFixtures();
  const g = studyGrid(study(), state, NOW);
  assert.equal(g.ok, true);
  assert.ok(g.ends.every((end) => end < TODAY), 'no window reaches into today');
  assert.equal(g.preCount, 8);
  assert.equal(g.postCount, 4);
});

/* =========================================================== 3. estimators */

test('stats: erfc and the two-sided p-value match known values', () => {
  assert.ok(Math.abs(twoSidedP(1.959964) - 0.05) < 1e-4);
  assert.ok(Math.abs(twoSidedP(1.644854) - 0.1) < 1e-4);
  assert.ok(Math.abs(twoSidedP(0) - 1) < 1e-9);
  assert.ok(Math.abs(erfc(0) - 1) < 1e-6);
});

test('stats: OLS recovers coefficients exactly when the model is exact', () => {
  // y = 2 + 0.5u + 3·post + 0.25·u·post, u = t - 4
  const X = [];
  const y = [];
  for (let t = 0; t < 12; t += 1) {
    const u = t - 4;
    const post = t >= 4 ? 1 : 0;
    X.push([1, u, post, u * post]);
    y.push(2 + 0.5 * u + 3 * post + 0.25 * u * post);
  }
  const fit = olsWithHac(X, y);
  assert.ok(fit);
  const expected = [2, 0.5, 3, 0.25];
  fit.beta.forEach((b, i) => assert.ok(Math.abs(b - expected[i]) < 1e-9, `beta[${i}] = ${b}`));
});

test('ITS: recovers a known level shift and slope change', () => {
  const values = [];
  for (let t = 0; t < 14; t += 1) {
    const u = t - 8;
    const post = t >= 8 ? 1 : 0;
    values.push(10 + 0.2 * u + 4 * post - 0.15 * u * post);
  }
  const its = interruptedTimeSeries(values, 8);
  assert.equal(its.ok, true);
  assert.ok(Math.abs(its.levelShift - 4) < 1e-3, `level shift ${its.levelShift}`);
  assert.ok(Math.abs(its.slopeChange - -0.15) < 1e-3, `slope change ${its.slopeChange}`);
  assert.ok(Math.abs(its.preSlope - 0.2) < 1e-3);
  assert.deepEqual(its.verdict, undefined);
});

test('ITS: refuses a window it cannot fit instead of returning a number', () => {
  const its = interruptedTimeSeries([1, 2, 3, 4, 5], 4);
  assert.equal(its.ok, false);
  assert.ok(its.reason.includes('at least'));
});

test('ITS: a clean step is detected and its MDE is far below the effect', () => {
  const values = [3, 4, 3, 4, 3, 3, 4, 3, 9, 8, 9, 9];
  const its = interruptedTimeSeries(values, 8);
  assert.equal(its.ok, true);
  assert.ok(its.levelShift > 4, `level shift ${its.levelShift}`);
  assert.ok(Math.abs(its.levelShift) > its.mde, 'the effect clears its own noise floor');
  assert.ok(its.pLevel < 0.1);
  assert.ok(its.hacLag >= 0);
});

test('pre-trend: a drifting pre-period is flagged, a flat one is not', () => {
  const flat = [5, 5.2, 4.8, 5.1, 4.9, 5.0, 5.1, 4.9, 6, 6.1, 6, 6.2];
  const drifting = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const flatResult = preTrendTest(flat, 8);
  const driftResult = preTrendTest(drifting, 8);
  assert.equal(flatResult.verdict, 'no-significant-trend');
  assert.equal(driftResult.verdict, 'trending');
  assert.ok(driftResult.p < 0.1);
  assert.ok(flatResult.caveat.includes('does not establish parallel trends'));
});

test('in-time placebo: a stable pre-period yields a large p, a step does not', () => {
  const stable = [4, 5, 4, 5, 4, 5, 4, 5, 9, 8, 9, 9];
  const stepped = [1, 2, 2, 3, 2, 3, 3, 2, 8, 9, 9, 10, 9, 10];
  const values = stable.concat([]);
  const its = interruptedTimeSeries(values, 8);
  const placebo = inTimePlacebo(values, 8, { actualT: its.tLevel });
  assert.equal(placebo.ok, true);
  assert.ok(placebo.p >= 0.1, `stable pre-period should not look like an effect (p=${placebo.p})`);
  const its2 = interruptedTimeSeries(stepped, 8);
  const placebo2 = inTimePlacebo(stepped, 8, { actualT: its2.tLevel });
  assert.equal(placebo2.ok, true);
  assert.ok(placebo2.p < 0.5, 'a pre-period that already jumped should be suspicious');
});

test('synthetic control: a donor block that does not move isolates the treated effect', () => {
  const treated = [10, 10.2, 9.8, 10.1, 9.9, 10, 10.1, 9.9, 14, 14.1, 14, 13.9];
  const donors = [
    { id: 'a', label: 'A', values: [5, 5.1, 4.9, 5.0, 5.1, 4.9, 5.0, 5.1, 4.9, 5.0, 5.1, 5.0] },
    { id: 'b', label: 'B', values: [20, 20.2, 19.8, 20.1, 19.9, 20, 20.1, 19.9, 20, 20.1, 19.9, 20] },
    { id: 'c', label: 'C', values: [2, 2.1, 1.9, 2.0, 2.1, 1.9, 2.0, 2.1, 1.95, 2.05, 2.0, 1.95] },
  ];
  const sc = syntheticControl({ treated, donors, treatmentIndex: 8 });
  assert.equal(sc.ok, true);
  assert.equal(sc.donorCount, 3);
  assert.ok(sc.effect > 3.5, `difference-in-differences gap ${sc.effect}`);
  assert.ok(sc.note.includes('weights are not fitted'), 'the honest limitation is stated in the output');
});

test('in-space placebo: ranks the treated effect against donors and reports its own resolution', () => {
  const treated = [10, 10.2, 9.8, 10.1, 9.9, 10, 10.1, 9.9, 14, 14.1, 14, 13.9];
  const donors = [
    { id: 'a', label: 'A', values: [5, 5.1, 4.9, 5.0, 5.1, 4.9, 5.0, 5.1, 4.9, 5.0, 5.1, 5.0] },
    { id: 'b', label: 'B', values: [20, 20.2, 19.8, 20.1, 19.9, 20, 20.1, 19.9, 20, 20.1, 19.9, 20] },
    { id: 'c', label: 'C', values: [2, 2.1, 1.9, 2.0, 2.1, 1.9, 2.0, 2.1, 1.95, 2.05, 2.0, 1.95] },
    { id: 'd', label: 'D', values: [8, 8.1, 7.9, 8.0, 8.1, 7.9, 8.0, 8.1, 7.9, 8.0, 8.1, 8.0] },
  ];
  const result = inSpacePlacebo({ treated, donors, treatmentIndex: 8 });
  assert.equal(result.ok, true);
  assert.ok(result.p <= 0.4, `treated effect should be extreme relative to donors (p=${result.p})`);
  assert.ok(result.resolution > 0 && result.resolution <= 0.25);
  assert.ok(result.note.includes('Abadie'));
});

test('in-space placebo: refuses with too few donors rather than inventing a p-value', () => {
  const treated = [1, 2, 1, 2, 1, 2, 1, 2, 3, 3, 3, 3];
  const donor = { id: 'a', label: 'A', values: [2, 3, 2, 3, 2, 3, 2, 3, 3, 3, 3, 3] };
  const result = inSpacePlacebo({ treated, donors: [donor], treatmentIndex: 8 });
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes('at least'));
});

test('breakdown trend: states how much drift would erase the estimate', () => {
  const result = breakdownTrend(4, 8, 12, 10);
  assert.equal(result.ok, true);
  // post buckets 8..11 → mean exposure (0.5 + 1.5 + 2.5 + 3.5)/4 = 2
  assert.equal(result.meanExposureBuckets, 2);
  assert.equal(result.breakPerWeek, 2, 'a 2-unit/week differential trend would explain a 4-unit shift');
  assert.equal(result.pctOfPreMean, 20);
  assert.equal(result.fragile, false);
  const fragile = breakdownTrend(1, 8, 12, 100);
  assert.equal(fragile.fragile, true);
});

/* ======================================================== 4. verdict gating */

test('evaluator: a measurable level shift is scored supported', () => {
  const state = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [7, 8, 7, 8] });
  const result = evaluateStudy(study(), state, { now: NOW });
  assert.equal(result.ok, true, result.reason || '');
  assert.ok(result.estimate > 0, `estimate ${result.estimate}`);
  assert.equal(result.verdict, 'supported', `verdict ${result.verdict} p=${result.pValue} placebo=${result.placeboP}`);
  assert.equal(result.grade, 'confirmatory');
});

test('evaluator: a flat series is unmeasurable, not a zero effect', () => {
  const state = buildFixtures({ pre: [4, 4, 4, 4, 4, 4, 4, 4], post: [4, 4, 4, 4] });
  const result = evaluateStudy(study(), state, { now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, 'unmeasurable');
  assert.ok(result.reason.includes('did not vary'));
});

test('evaluator: a change in the wrong direction is not-supported, not inconclusive', () => {
  const state = buildFixtures({ pre: [8, 7, 8, 7, 8, 7, 8, 7], post: [3, 2, 3, 2] });
  const result = evaluateStudy(study(), state, { now: NOW });
  assert.equal(result.ok, true, result.reason || '');
  assert.ok(result.estimate < 0);
  assert.equal(result.verdict, 'not-supported', `verdict ${result.verdict} p=${result.pValue}`);
});

test('evaluator: a pre-existing trend downgrades the result before any effect is claimed', () => {
  // The metric ramps steadily through the whole period, so before/after alone
  // would credit the intervention with the drift.
  const state = buildFixtures({ pre: [1, 2, 3, 4, 5, 6, 7, 8], post: [9, 10, 11, 12] });
  const result = evaluateStudy(study(), state, { now: NOW });
  assert.equal(result.verdict, 'pre-trend', `verdict ${result.verdict}`);
  assert.equal(result.gates[0].gate, 'pre-trend');
  assert.equal(result.gates[0].passed, false);
});

test('evaluator: a tiny effect inside the noise floor is underpowered, never a failure', () => {
  const state = buildFixtures({ pre: [4, 5, 3, 4, 5, 3, 4, 5], post: [4, 5, 4, 5] });
  const result = evaluateStudy(study(), state, { now: NOW });
  assert.equal(result.ok, true, result.reason || '');
  assert.equal(result.verdict, 'underpowered', `verdict ${result.verdict} estimate=${result.estimate} mde=${result.its?.mde}`);
  assert.equal(result.meetsMde, false);
});

test('evaluator: grade is derived from dates, never self-declared', () => {
  assert.equal(gradeOf(study({ declaredOn: addDays(TREATMENT, -1) })), 'confirmatory');
  assert.equal(gradeOf(study({ declaredOn: TREATMENT })), 'confirmatory');
  assert.equal(gradeOf(study({ declaredOn: addDays(TREATMENT, 5) })), 'exploratory');
  const state = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [7, 8, 7, 8] });
  const late = evaluateStudy(study({ declaredOn: addDays(TREATMENT, 20) }), state, { now: NOW });
  assert.equal(late.grade, 'exploratory', 'a retrospective study can never be confirmatory');
});

test('evaluator: an unknown metric is reported, not guessed', () => {
  const state = buildFixtures();
  const result = evaluateStudy(study({ vitalId: 'not-a-vital' }), state, { now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes('no longer exists'));
});

/* ============================================ 5. pre-registration firewall */

test('actions: creating a study validates the intervention date and the metric', () => {
  const env = harness();
  assert.equal(env.api.createImpactStudy({ title: '', vitalId: 'feedback-cadence', windowStart: TREATMENT }).ok, false);
  assert.equal(env.api.createImpactStudy({ title: 'X', vitalId: 'nope', windowStart: TREATMENT }).ok, false);
  assert.equal(env.api.createImpactStudy({ title: 'X', vitalId: 'feedback-cadence', windowStart: '' }).ok, false);
  assert.equal(env.api.createImpactStudy({ title: 'X', vitalId: 'feedback-cadence', windowStart: '2030-01-01' }).ok, false);
  assert.equal(env.api.createImpactStudy({ title: 'X', vitalId: 'feedback-cadence', windowStart: TREATMENT, expectedEffect: -1 }).ok, false);
  assert.equal(env.api.createImpactStudy({ title: 'X', vitalId: 'feedback-cadence', windowStart: TREATMENT, expectedConfidence: 20 }).ok, false);
  assert.equal(env.store.state.impactStudies.length, 0, 'every rejected attempt wrote nothing');
});

test('actions: prediction edits are refused after the window closes', () => {
  const env = harness();
  const created = env.api.createImpactStudy({
    title: 'Feedback push', vitalId: 'feedback-cadence', windowStart: '2026-08-01',
    windowWeeks: 4, baselineWeeks: 8, expectedEffect: 1,
  });
  assert.equal(created.ok, true);
  // Window closed on 2026-08-28 (< today 2026-10-27), so predictions are frozen.
  const refused = env.api.updateImpactStudy(created.id, { expectedEffect: 3 });
  assert.equal(refused.ok, false);
  assert.ok(refused.error.includes('frozen'));
  // Describing what happened is still allowed.
  const notes = env.api.updateImpactStudy(created.id, { notes: 'Ran weekly', title: 'Feedback push (rerun)' });
  assert.equal(notes.ok, true);
  assert.equal(env.store.state.impactStudies[0].notes, 'Ran weekly');
});

test('actions: a locked study is frozen and cannot be rescored', () => {
  const env = harness();
  env.store.update((draft) => {
    const seeded = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [7, 8, 7, 8] });
    draft.people = seeded.people;
    draft.feedback = seeded.feedback;
  }, { type: 'test.seed', entity: 'workspace', entityId: '' });
  const created = env.api.createImpactStudy({
    title: 'Feedback push', vitalId: 'feedback-cadence', windowStart: TREATMENT,
    windowWeeks: 4, baselineWeeks: 8, expectedEffect: 1,
  });
  assert.equal(created.ok, true);
  const locked = env.api.lockImpactStudy(created.id, { outcomeNotes: 'It moved.' });
  assert.equal(locked.ok, true);
  assert.equal(locked.verdict, 'supported', `verdict ${locked.verdict}`);
  const row = env.store.state.impactStudies.find((s) => s.id === created.id);
  assert.equal(row.status, 'scored');
  assert.ok(row.lockedOn);
  assert.ok(row.evaluation, 'the frozen evaluation is stored');
  assert.equal(row.evaluation.verdict, 'supported');
  assert.equal(env.api.lockImpactStudy(created.id).ok, false, 'a second lock is refused');
  assert.equal(env.api.updateImpactStudy(created.id, { title: 'Renamed' }).ok, false, 'a scored study is immutable');
});

test('actions: abandoning is allowed only before scoring', () => {
  const env = harness();
  const created = env.api.createImpactStudy({ title: 'A', vitalId: 'feedback-cadence', windowStart: TREATMENT });
  assert.equal(env.api.abandonImpactStudy(created.id, 'changed plan').ok, true);
  assert.equal(env.store.state.impactStudies[0].status, 'abandoned');
  assert.equal(env.api.lockImpactStudy(created.id).ok, false, 'abandoned cannot be scored');
});

/* ================================================= 6. cross-module propagation */

test('propagation: a scored study fans out atomically into links, a decision and a replication', () => {
  const env = harness();
  env.store.update((draft) => {
    const seeded = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [7, 8, 7, 8] });
    draft.people = seeded.people;
    draft.feedback = seeded.feedback;
    // A delegation is the intervention record, so IMP-01 links to it and
    // IMP-03 can reach the person who was affected.
    draft.impactStudies.push(study({
      id: 'impact-seeded-1', interventionType: 'delegation', interventionId: 'del-1',
      declaredOn: addDays(TREATMENT, -7), status: 'running', lockedOn: null, verdict: null, evaluation: null,
    }));
    draft.delegations.push({
      id: 'del-1', personId: 'p1', title: 'Own the feedback ritual',
      expectedOutcome: 'Weekly specific feedback', authority: 'decide', support: 'Coverage on Fridays',
      delegatedOn: TREATMENT, dueOn: addDays(TREATMENT, 21), status: 'active',
      checkins: [], completedOn: null, completionNote: '', createdAt: `${TREATMENT}T09:00:00.000Z`, updatedAt: `${TREATMENT}T09:00:00.000Z`,
    });
  }, { type: 'test.seed', entity: 'workspace', entityId: '' });

  const created = { id: 'impact-seeded-1' };
  const locked = env.api.lockImpactStudy(created.id);
  assert.equal(locked.ok, true);
  assert.equal(locked.verdict, 'supported');

  const links = env.store.state.links.filter((l) => l.sourceType === 'impact');
  assert.ok(links.some((l) => l.targetType === 'delegation' && l.targetId === 'del-1' && l.relation === 'evaluates'), 'RULE-IMP-01 linked the intervention');
  assert.ok(links.some((l) => l.targetType === 'person' && l.targetId === 'p1'), 'RULE-IMP-01 linked the affected person');

  const decisions = env.store.state.decisions.filter((d) => String(d.question).includes(`[RULE-IMP-02:${created.id}]`));
  assert.equal(decisions.length, 1, 'exactly one DACI scale/stop decision');
  assert.ok(decisions[0].options.length === 4);
  assert.ok(links.some((l) => l.targetType === 'decision' && l.targetId === decisions[0].id && l.relation === 'decides'));

  const replications = env.store.state.impactStudies.filter((s) => s.replicationOfId === created.id);
  assert.equal(replications.length, 1, 'RULE-IMP-04 proposed exactly one replication');
  assert.equal(replications[0].status, 'running');
  assert.equal(replications[0].vitalId, 'feedback-cadence');

  // Every fan-out step is in the append-only event log.
  const events = env.store.state.events.filter((e) => e.type === 'automation.propagated');
  assert.ok(events.length >= 3, `propagated ${events.length} events`);
});

test('propagation: a second scan is a no-op', () => {
  const env = harness();
  env.store.update((draft) => {
    const seeded = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [7, 8, 7, 8] });
    draft.people = seeded.people;
    draft.feedback = seeded.feedback;
  }, { type: 'test.seed', entity: 'workspace', entityId: '' });
  env.store.update((draft) => {
    draft.impactStudies.push(study({ id: 'impact-seeded-2', declaredOn: addDays(TREATMENT, -7) }));
  }, { type: 'test.seed', entity: 'workspace', entityId: '' });
  const created = { id: 'impact-seeded-2' };
  env.api.lockImpactStudy(created.id);
  const before = {
    decisions: env.store.state.decisions.length,
    links: env.store.state.links.length,
    studies: env.store.state.impactStudies.length,
  };
  const again = env.api.scanImpact();
  assert.equal(again.changed, false, 'a repeated scan creates nothing new');
  assert.equal(env.store.state.decisions.length, before.decisions);
  assert.equal(env.store.state.links.length, before.links);
  assert.equal(env.store.state.impactStudies.length, before.studies);
});

test('propagation: a contradicted study opens no scale decision but does prompt a blameless check-in', () => {
  const env = harness();
  env.store.update((draft) => {
    const seeded = buildFixtures({ pre: [8, 7, 8, 7, 8, 7, 8, 7], post: [3, 2, 3, 2] });
    draft.people = seeded.people;
    draft.feedback = seeded.feedback;
    draft.impactStudies.push(study({
      id: 'impact-seeded-3', interventionType: 'delegation', interventionId: 'del-2',
      declaredOn: addDays(TREATMENT, -7), status: 'running', lockedOn: null, verdict: null, evaluation: null,
    }));
    draft.delegations.push({
      id: 'del-2', personId: 'p2', title: 'Own the feedback ritual',
      expectedOutcome: 'Weekly specific feedback', authority: 'decide', support: '',
      delegatedOn: TREATMENT, dueOn: addDays(TREATMENT, 21), status: 'active',
      checkins: [], completedOn: null, completionNote: '', createdAt: `${TREATMENT}T09:00:00.000Z`, updatedAt: `${TREATMENT}T09:00:00.000Z`,
    });
  }, { type: 'test.seed', entity: 'workspace', entityId: '' });
  const created = { id: 'impact-seeded-3' };
  const locked = env.api.lockImpactStudy(created.id);
  assert.equal(locked.verdict, 'not-supported', `verdict ${locked.verdict}`);
  const person = env.store.state.people.find((p) => p.id === 'p2');
  assert.ok((person.talkingPoints || []).some((t) => t.includes('Blameless check-in on a process, not a person')));
  assert.ok(!(person.talkingPoints || []).some((t) => /underperform|poor|failing/i.test(t)), 'the prompt never judges the person');
});

test('propagation: underpowered studies deliberately create no decision', () => {
  const env = harness();
  env.store.update((draft) => {
    const seeded = buildFixtures({ pre: [4, 5, 3, 4, 5, 3, 4, 5], post: [4, 5, 4, 5] });
    draft.people = seeded.people;
    draft.feedback = seeded.feedback;
  }, { type: 'test.seed', entity: 'workspace', entityId: '' });
  env.store.update((draft) => {
    draft.impactStudies.push(study({ id: 'impact-seeded-4', declaredOn: addDays(TREATMENT, -7) }));
  }, { type: 'test.seed', entity: 'workspace', entityId: '' });
  const created = { id: 'impact-seeded-4' };
  const locked = env.api.lockImpactStudy(created.id);
  assert.equal(locked.verdict, 'underpowered');
  assert.equal(env.store.state.decisions.filter((d) => String(d.question).includes('RULE-IMP-02')).length, 0);
  assert.equal(env.store.state.impactStudies.filter((s) => s.replicationOfId === created.id).length, 0);
});

test('propagation: the pause switch blocks automatic fan-out but an explicit scan still runs', () => {
  const env = harness();
  env.store.update((draft) => {
    const seeded = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [7, 8, 7, 8] });
    draft.people = seeded.people;
    draft.feedback = seeded.feedback;
    draft.settings.impactAutoPropagate = false;
  }, { type: 'test.seed', entity: 'workspace', entityId: '' });
  env.store.update((draft) => {
    draft.impactStudies.push(study({ id: 'impact-seeded-5', declaredOn: addDays(TREATMENT, -7) }));
  }, { type: 'test.seed', entity: 'workspace', entityId: '' });
  env.api.lockImpactStudy('impact-seeded-5');
  assert.equal(env.store.state.decisions.length, 0, 'paused: automatic fan-out on the score is suppressed');
  const scan = env.api.scanImpact();
  assert.equal(scan.ok, true);
  assert.equal(env.store.state.decisions.length, 1, 'an explicit human scan always runs');
  assert.equal(env.api.scanImpact().changed, false, 'and remains idempotent');
});

test('propagation: the rule is registered on the shared spine before decision tempo', () => {
  const names = DEFAULT_POST_COMMIT_RULES.map((fn) => fn.name);
  assert.ok(names.includes('impactRule'));
  const impactIdx = names.indexOf('impactRule');
  const tempoIdx = names.indexOf('decisionTempoRule');
  assert.ok(impactIdx >= 0 && tempoIdx > impactIdx, 'impact runs before decision tempo so a scale decision can be timed');
});

/* ================================================ 7. schema & migration */

test('schema: v31 adds impactStudies additively and repairs invalid records', () => {
  assert.equal(SCHEMA_VERSION, 77);
  const empty = createEmptyState('2026-10-27T00:00:00Z');
  assert.ok(Array.isArray(empty.impactStudies));
  assert.equal(empty.settings.impactAlpha, 0.1);

  const migrated = migrate({ schemaVersion: 30, settings: {}, people: [] });
  assert.deepEqual(migrated.applied, ['30 → 31', '31 → 32', '32 → 33', '33 → 34', '34 → 35', '35 → 36', '36 → 37', '37 → 38', '38 → 39', '39 → 40', '40 → 41', '41 → 42', '42 → 43', '43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48', '48 → 49', '49 → 50', '50 → 51', '51 → 52', '52 → 53', '53 → 54', '54 → 55', '55 → 56', '56 → 57', '57 → 58', '58 → 59', '59 → 60', '60 → 61', '61 → 62', '62 → 63', '63 → 64', '64 → 65', '65 → 66', '66 → 67', '67 → 68', '68 → 69', '69 → 70', '70 → 71', '71 → 72', '72 → 73', '73 → 74', '74 → 75', '75 → 76', '76 → 77']);
  assert.ok(Array.isArray(migrated.raw.impactStudies));
  assert.equal(migrated.raw.impactStudies.length, 0, 'no historical intervention is retro-labelled');

  const { state, warnings } = normalizeState({
    schemaVersion: 31,
    impactStudies: [
      { id: 'a', title: 'Kept', vitalId: 'feedback-cadence', windowStart: TREATMENT, status: 'scored', lockedOn: TODAY, evaluation: { verdict: 'supported' } },
      { id: 'b', title: 'No lock', vitalId: 'feedback-cadence', windowStart: TREATMENT, status: 'scored', evaluation: { verdict: 'supported' } },
      { id: 'c', title: 'No date', vitalId: 'feedback-cadence' },
    ],
  }, { now: NOW });
  assert.equal(state.impactStudies.length, 3);
  assert.equal(state.impactStudies[0].evaluation.verdict, 'supported', 'a locked evaluation survives');
  assert.equal(state.impactStudies[1].status, 'running', 'scored-without-lock is reopened');
  assert.equal(state.impactStudies[1].evaluation, null, 'an unlocked evaluation is discarded');
  assert.ok(warnings.some((w) => w.includes('no lock')));
  assert.ok(state.impactStudies[2].windowStart, 'a missing intervention date is anchored, with a warning');
  assert.ok(warnings.some((w) => w.includes('no intervention date')));
});

test('schema: settings are clamped and alphas are restricted', () => {
  const settings = normalizeSettings({ impactAlpha: 0.07, impactBaselineWeeks: 500, impactWindowWeeks: -3 });
  assert.equal(settings.impactAlpha, 0.1, 'an unsupported alpha falls back to the documented default');
  assert.equal(settings.impactBaselineWeeks, 26);
  assert.equal(settings.impactWindowWeeks, 2);
  assert.equal(normalizeSettings({ impactAlpha: 0.05 }).impactAlpha, 0.05);
  assert.equal(normalizeSettings({ impactAutoPropagate: false }).impactAutoPropagate, false);
});

/* ============================================================= 8. report */

test('report: calibration is withheld below three evaluable studies', () => {
  const rows = [{ study: study({ id: 'x' }), evaluation: { ok: true, verdict: 'supported', towardHypothesis: 1, effectRatio: 1 } }];
  const cal = impactCalibration(rows);
  assert.equal(cal.insufficient, true);
  assert.ok(cal.note.includes('not a calibration curve'));
});

test('report: direction accuracy and Brier score are computed from evidence only', () => {
  const rows = [1, 2, 3, 4].map((i) => ({
    study: study({ id: `s${i}`, expectedConfidence: 80 }),
    evaluation: { ok: true, verdict: i <= 3 ? 'supported' : 'not-supported', towardHypothesis: i <= 3 ? 1 : -1, effectRatio: i === 1 ? 0.5 : 1 },
  }));
  const cal = impactCalibration(rows);
  assert.equal(cal.directionScored, 4);
  assert.equal(cal.directionCorrect, 3);
  assert.equal(cal.directionAccuracy, 0.75);
  // p=0.8: three hits give 0.04 each, one miss gives 0.64 → mean 0.19
  assert.equal(cal.brier, 0.19);
  const report = buildImpactReport({ impactStudies: [study()] }, NOW);
  assert.equal(report.totals.studies, 1);
});

test('report: the brief states its own limits in plain language', () => {
  const state = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [7, 8, 7, 8] });
  const text = buildImpactBrief({ ...state, impactStudies: [study()] }, NOW);
  assert.ok(text.includes('Intervention impact brief'));
  assert.ok(text.includes('No study here establishes causation'));
  assert.ok(text.includes('segmented interrupted time series'));
  assert.ok(text.includes(IMPACT_ENGINE_VERSION));
});

test('signals: IMP-01 fires on a closed window and IMP-02 on a decisive score', () => {
  const state = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [7, 8, 7, 8] });
  const scored = study({
    status: 'scored', lockedOn: TODAY, verdict: 'supported',
    evaluation: { ok: true, verdict: 'supported', grade: 'confirmatory', estimate: 1, unit: 'per-person', placeboP: 0.1, placeboSource: 'in-space', its: { mde: 0.2 }, grid: { preCount: 8, postCount: 4 }, vitalLabel: 'Feedback given', towardHypothesis: 1, effectRatio: 1 },
  });
  const signals = impactSignals({ ...state, impactStudies: [scored] }, NOW);
  assert.ok(signals.some((s) => s.ruleId === 'IMP-02'));
  const empty = impactSignals({ impactStudies: [] }, NOW);
  assert.equal(empty.length, 0, 'an empty ledger is silent');
});

test('signals: every signal carries evidence and a route', () => {
  const state = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [7, 8, 7, 8] });
  const scored = study({ status: 'scored', lockedOn: TODAY, verdict: 'not-supported', evaluation: { ok: true, verdict: 'not-supported', grade: 'confirmatory', estimate: -1, unit: 'per-person', placeboP: 0.1, its: { mde: 0.2 }, grid: { preCount: 8, postCount: 4 }, vitalLabel: 'Feedback given', towardHypothesis: -1 } });
  for (const signal of impactSignals({ ...state, impactStudies: [scored] }, NOW)) {
    assert.ok(signal.ruleId.startsWith('IMP-'));
    assert.ok(signal.detail.length > 40);
    assert.ok(Array.isArray(signal.evidence) && signal.evidence.length);
    assert.ok(signal.action.route.startsWith('#/'));
  }
});

test('insights: the Impact domain is registered and contributes findings', () => {
  assert.ok(DOMAIN_ORDER.includes('Impact'));
  const state = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [7, 8, 7, 8] });
  const withStudy = { ...state, impactStudies: [study({ status: 'scored', lockedOn: TODAY, verdict: 'not-supported', evaluation: { ok: true, verdict: 'not-supported', grade: 'confirmatory', estimate: -1, unit: 'per-person', placeboP: 0.1, its: { mde: 0.2 }, grid: { preCount: 8, postCount: 4 }, vitalLabel: 'Feedback given', towardHypothesis: -1 } })] };
  const { findings } = buildInsights(withStudy, NOW);
  assert.ok(findings.some((f) => f.ruleId.startsWith('IMP-')));
});

test('automation catalog: RULE-IMP-01..06 are documented', () => {
  const ids = AUTOMATION_RULES.map((r) => r.id);
  for (const id of ['RULE-IMP-01', 'RULE-IMP-02', 'RULE-IMP-03', 'RULE-IMP-04', 'RULE-IMP-05', 'RULE-IMP-06']) {
    assert.ok(ids.includes(id), `${id} missing from the catalog`);
  }
  assert.equal(new Set(ids).size, ids.length, 'rule ids are unique');
});

/* ================================================================= 9. CSV */

test('csv: the study scope exports counts and scores but no titles or hypotheses', () => {
  const scope = CSV_EXPORTS.find((e) => e.key === 'impact');
  assert.ok(scope, 'impact CSV scope exists');
  const state = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [7, 8, 7, 8] });
  const withStudy = { ...state, impactStudies: [study({ status: 'scored', lockedOn: TODAY, verdict: 'supported', evaluation: { ok: true, verdict: 'supported', grade: 'confirmatory', estimate: 1, unit: 'per-person', placeboP: 0.1, its: { mde: 0.2 }, grid: { preCount: 8, postCount: 4 } } })] };
  const result = exportWorkspaceCsv(withStudy, 'impact');
  assert.equal(result.ok, true);
  assert.ok(result.csv.includes('feedback-cadence'));
  assert.ok(!result.csv.includes('Weekly feedback push'), 'no study title in the export');
  assert.ok(!result.csv.includes('If I give specific feedback'), 'no hypothesis text in the export');
});

/* ============================================ 10. gaps, coverage, planning */

test('ITS: an unobserved period is skipped, not filled with a zero', () => {
  // Nine observed periods out of eleven. The gap must be dropped from the
  // design, not turned into a 0, which would drag the level shift downwards and
  // manufacture a finding out of missingness.
  const withGap = [4, 4, 4, null, 4, 4, 4, 4, 9, 9, 9];
  const filled = [4, 4, 4, 0, 4, 4, 4, 4, 9, 9, 9];
  const skipped = interruptedTimeSeries(withGap, 8);
  const zeros = interruptedTimeSeries(filled, 8);
  assert.equal(skipped.ok, true, 'a gap does not disqualify the study');
  assert.equal(skipped.gaps, 1);
  assert.equal(skipped.nObserved, 10);
  // The observed periods are an exact step, so dropping the gap recovers it
  // exactly. Substituting a zero instead biases the estimate (it drags the
  // pre-period mean down, so the step looks bigger than it is) and inflates the
  // standard error — a fabricated point makes the finding both wrong and
  // over-confident at the same time.
  assert.ok(Math.abs(skipped.levelShift - 5) < 0.01, `shift recovered exactly (got ${skipped.levelShift})`);
  assert.ok(Math.abs(zeros.levelShift - 5) > 0.2, 'substituting a zero biases the estimate');
});

test('ITS: refuses a series whose observed pre-period is too short', () => {
  const sparse = [null, null, null, 4, null, null, 4, 9, 9, 9];
  const result = interruptedTimeSeries(sparse, 7);
  assert.equal(result.ok, false);
  assert.match(result.reason, /observed pre/);
});

test('vitals: leading fake zeroes are trimmed at the coverage frontier', () => {
  // The 1:1 log only reaches back four weeks. Without coverage trimming the
  // earlier buckets would render as weeks in which nobody met, which is a
  // fabricated accusation rather than a measurement.
  const state = createEmptyState(NOW.toISOString());
  state.people = [{ id: 'p1', name: 'A', role: 'IC', level: 'ic', team: 'T', managerId: null, startDate: '2025-01-01', focus: '', talkingPoints: [], status: 'active', createdAt: NOW.toISOString(), archivedAt: null }];
  state.oneOnOnes = [0, 7, 14, 21].map((d, i) => ({
    id: `oo${i}`, personId: 'p1', date: addDays(TODAY, -d), status: 'held', mood: 4,
    agenda: [], notes: '', actions: [], createdAt: `${addDays(TODAY, -d)}T09:00:00.000Z`,
  }));
  const series = buildVitalSeries(state, 'oneoneone-cadence', { asOf: NOW, buckets: 22 });
  assert.ok(series.measured > 0);
  assert.ok(series.points.length < 14, `series starts near the record, not 22 weeks back (got ${series.points.length})`);
  assert.ok(series.points.every((p) => p.date > addDays(TODAY, -70)), 'no bucket older than the record');
});

test('designPower: states what a design can detect before any intervention', () => {
  const state = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [3, 4, 3, 4] });
  const plan = designPower(state, 'feedback-cadence', { preWeeks: 8, postWeeks: 4, targetEffect: 0.5, asOf: NOW });
  assert.equal(plan.ok, true);
  assert.ok(plan.sigma > 0, 'noise estimated from the record');
  assert.ok(plan.mde > 0, 'MDE is positive');
  assert.equal(plan.detectable, plan.mde <= 0.5, 'detectability is defined by the MDE, not by hope');
  // A longer post-period can only improve (never worsen) the smallest detectable effect.
  const longer = designPower(state, 'feedback-cadence', { preWeeks: 8, postWeeks: 8, targetEffect: 0.5, asOf: NOW });
  assert.ok(longer.mde <= plan.mde, 'more post weeks never makes the design worse');
});

test('designPower: refuses to invent a noise estimate from a flat metric', () => {
  const state = createEmptyState(NOW.toISOString());
  const plan = designPower(state, 'feedback-cadence', { asOf: NOW });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /enough recorded history|has not varied/i);
});

test('report: a scored study reports its frozen evaluation, never a live rewrite', () => {
  const state = buildFixtures({ pre: [3, 4, 3, 4, 3, 4, 3, 4], post: [7, 8, 7, 8] });
  const frozen = {
    ok: true, verdict: 'supported', grade: 'confirmatory', estimate: 999, unit: 'per-person',
    its: { mde: 0.1, seLevel: 0.02, tLevel: 9 }, grid: { preCount: 8, postCount: 4 }, series: [],
    placeboP: null, placeboSource: null, gates: [],
  };
  const scored = study({ status: 'scored', lockedOn: TODAY, verdict: 'supported', evaluation: frozen });
  const report = buildImpactReport({ ...state, impactStudies: [scored] }, NOW);
  assert.equal(report.rows[0].evaluation.estimate, 999, 'the committed number cannot drift with later edits');
  // A running study is still evaluated live.
  const running = buildImpactReport({ ...state, impactStudies: [study()] }, NOW);
  assert.notEqual(running.rows[0].evaluation.estimate, 999);
});

test('study status: running, window-closed, scored and abandoned are distinct', () => {
  const running = study({ windowStart: addDays(TODAY, -7), windowWeeks: 4 });
  assert.equal(studyStatusOf(running, NOW), 'running');
  assert.equal(studyStatusOf(study(), NOW), 'window-closed');
  assert.equal(studyStatusOf(study({ status: 'scored' }), NOW), 'scored');
  assert.equal(studyStatusOf(study({ status: 'abandoned' }), NOW), 'abandoned');
  assert.equal(studyHorizonEnd(study()), addDays(TREATMENT, 27), 'the horizon is the last day of the final window week');
});

test('demo: three pre-registered studies, one supported, one contradicted, one live', () => {
  const demo = buildDemoState(NOW);
  // Schema v66: the demo now seeds ten studies, because the Evidence terminal
  // pools by (lever x metric) and three is the pooling floor. The three
  // original records are still there and still carry the supported /
  // contradicted / live triple below; the rest exist to give the pooling floor
  // something to reach and to fall short of.
  assert.equal(demo.impactStudies.length, 10);
  for (const record of demo.impactStudies) {
    assert.ok(record.declaredOn <= record.windowStart, `${record.id} is declared before its intervention`);
    assert.equal(gradeOf(record), 'confirmatory');
  }
  const report = buildImpactReport(demo, NOW);
  assert.equal(report.totals.supported, 1, 'one intervention is supported');
  assert.equal(report.totals.notSupported, 1, 'the same intervention is contradicted on another metric');
  assert.ok(report.totals.running >= 1, 'one study is still running');
  // The demo must not be a showcase of a tool that cannot fail.
  assert.ok(report.totals.notSupported >= 1);
});

/* ====================================================== 11. UI and routing */

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

test('UI: every impact tab renders axe-clean with labelled tables and an accessible chart', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    for (const route of ['#/impact', '#/impact?tab=vitals', '#/impact?tab=studies', '#/impact?tab=evaluate', '#/impact?tab=design', '#/impact?tab=brief']) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.length > 200, `${route} renders content`);
      assert.ok(!/failed to draw|is not a function|undefined/.test(view.textContent), `${route} renders without an error panel`);
      assert.ok(view.querySelector('h1'), `${route} has a single h1`);
      assert.deepEqual(await axeViolations(env), [], `${route} axe-clean`);
      for (const tbl of Array.from(view.querySelectorAll('table'))) {
        for (const th of Array.from(tbl.querySelectorAll('th'))) {
          assert.ok((th.textContent || '').trim().length > 0, `${route}: table headers are labelled`);
        }
      }
      for (const svg of Array.from(view.querySelectorAll('svg[role="img"]'))) {
        assert.ok((svg.getAttribute('aria-label') || '').length > 20, `${route}: chart has an accessible name`);
      }
    }
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});

test('UI: an empty workspace explains the prerequisite instead of showing an empty chart', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.navigate('#/impact');
    const view = env.document.querySelector('#view');
    assert.ok(/rebuilt from the dates|reconstructed from the dates/i.test(view.textContent), 'explains where history comes from');
    assert.ok(/Not enough dated history|No studies declared|Nothing to reconstruct/i.test(view.textContent), 'says what is missing');
    assert.deepEqual(await axeViolations(env), [], 'empty state axe-clean');
  } finally {
    env.dom.window.close();
  }
});

test('routing: #/impact is a first-class route with a nav entry, title and alias', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    const navLink = Array.from(env.document.querySelectorAll('#sidebar-nav a')).find((a) => /Impact ledger/.test(a.textContent));
    assert.ok(navLink, 'nav entry present');
    assert.equal(navLink.getAttribute('href'), '#/impact');
    // Schema v66: `evidence` is its own terminal now, so the impact ledger is
    // reached by its own aliases instead.
    for (const alias of ['#/studies', '#/did-it-work']) {
      app.ctx.navigate(alias);
      assert.equal(app.ctx.route, 'impact', `${alias} resolves to the same view`);
    }
    assert.match(env.document.title, /Impact/i);
  } finally {
    env.dom.window.close();
  }
});
