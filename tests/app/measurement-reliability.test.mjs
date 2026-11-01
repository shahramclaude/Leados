/**
 * tests/app/measurement-reliability.test.mjs — Schema v77, ADR-0069.
 *
 * The claims this suite makes, in order:
 *  1. The migration is additive and invents nothing.
 *  2. The normalizer is fail-closed: person-level fields never survive, a grade
 *     cannot predate its freeze, blame prose is scrubbed, out-of-range numbers
 *     are nulled rather than trusted.
 *  3. The estimator is the classical two-way random-effects estimator when the
 *     design is balanced — proven against an independent computation, not
 *     against itself.
 *  4. The limits are real: constant-within-person data gives ICC = 1, and a
 *     record with no between-person variance gives ICC = 0 with every reading
 *     collapsing to the team mean.
 *  5. Spearman–Brown and its inverse agree; credibility Z is n/(n + σ²/τ²); the
 *     posterior variance is 1/(1/τ² + n/σ²); regression to the mean is the
 *     credibility estimate.
 *  6. Separation produces a partial order with alphabetical membership, and the
 *     pair probabilities agree with the posterior formula.
 *  7. The floors refuse, with a machine-readable reason, and the view explains
 *     the refusal instead of printing a dead screen.
 *  8. The rule spine captures once, tempers a rating without changing it, and
 *     grades or lapses a frozen reading.
 *  9. The export carries no identity and blanks nothing into a zero.
 * 10. Every panel renders with one h1 and no axe violations.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { buildDemoState } from '../../app/core/demo.js';
import {
  credibilityReadings,
  decomposeVariance,
  decisionStudy,
  fQuantile,
  fSurvival,
  harvestReviewObservations,
  invNormal,
  normalCdf,
  observationsForReliability,
  reliabilityAttentionCount,
  reliabilityBrief,
  reliabilityReport,
  reliabilitySignals,
  separationTiers,
  spearman,
  spearmanBrown,
  spearmanPermutationP,
  tTwoSidedP,
} from '../../app/core/domain/reliability.js';
import { reliabilityRule } from '../../app/core/domain/reliabilityRules.js';
import {
  normalizeReliabilityMarkers,
  normalizeReliabilityReadings,
  normalizeReliabilitySettings,
} from '../../app/core/domain/reliabilitySchema.js';
import {
  RELIABILITY_LIMITS,
  RELIABILITY_RULE_IDS,
  reviewRatingValue,
} from '../../app/core/domain/reliabilityRegistry.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import {
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  SYSTEM_GENERATED_LINK_RELATIONS,
  resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import { renderReliability } from '../../app/views/reliability.js';
import { parseRoute, NAV } from '../../app/main.js';
import { DOMAIN_ORDER, buildInsights } from '../../app/core/domain/insights.js';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-11-01T12:00:00Z');
const TODAY = '2026-11-01';
const clone = (v) => JSON.parse(JSON.stringify(v));
const RATINGS = ['needs-development', 'meets-expectations', 'often-exceeds', 'sets-standard'];

function setup({ state, failWrites = false } = {}) {
  const data = new Map(state ? [[STORAGE_KEY, JSON.stringify(state)]] : []);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (failWrites) throw new Error('Quota exceeded');
      data.set(k, v);
    },
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const idFactory = (p) => `${p}-reltest-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage, idFactory };
}

/**
 * A rated workspace. `patterns` is one rating index (0–3) per person per cycle,
 * read column-wise: patterns[cycleIndex][personIndex].
 */
function ratingWorkspace(patterns, { people = 5 } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.schemaVersion = SCHEMA_VERSION;
  state.settings.leaderName = 'Test Leader';
  state.people = Array.from({ length: people }, (_, i) => ({
    id: `person-${i + 1}`,
    name: `Person ${String.fromCharCode(65 + i)}`,
    role: 'Engineer',
    level: 'ic',
    team: 'Platform',
    managerId: null,
    startDate: '2024-01-01',
    focus: '',
    talkingPoints: [],
    status: 'active',
    createdAt: NOW.toISOString(),
    archivedAt: null,
  }));
  // Quarterly cycle ends, oldest first.
  const ends = ['2025-12-31', '2026-03-31', '2026-06-30', '2026-09-30'];
  let seq = 0;
  state.reviews = [];
  patterns.forEach((row, cycleIndex) => {
    row.forEach((ratingIndex, personIndex) => {
      if (ratingIndex === null || personIndex >= people) return;
      seq += 1;
      state.reviews.push({
        id: `review-${seq}`,
        personId: `person-${personIndex + 1}`,
        periodStart: ends[Math.max(0, cycleIndex - 1)],
        periodEnd: ends[cycleIndex % ends.length],
        status: 'complete',
        selfReflection: { achievements: '', challenges: '', growth: '', support: '' },
        selfReflectionRecordedAt: null,
        manager: { achievements: '', development: '', nextSteps: '', rating: RATINGS[ratingIndex] },
        instrumentNotes: [],
        evidence: [],
        evidenceCapturedAt: `${ends[cycleIndex % ends.length]}T10:00:00.000Z`,
        createdAt: `${ends[Math.max(0, cycleIndex - 1)]}T09:00:00.000Z`,
        updatedAt: `${ends[cycleIndex % ends.length]}T10:00:00.000Z`,
        completedAt: `${ends[cycleIndex % ends.length]}T10:00:00.000Z`,
      });
    });
  });
  return state;
}

const MIXED = [
  [2, 1, 3, 1, 2],
  [1, 2, 3, 0, 1],
  [3, 1, 2, 1, 2],
  [2, 2, 3, 1, 1],
];
const CONSTANT = [
  [2, 1, 3, 0, 1],
  [2, 1, 3, 0, 1],
  [2, 1, 3, 0, 1],
];
const FLAT = [
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [1, 1, 1, 1, 1],
];

/* ------------------------------------------------------------------ *
 * 1. Schema & migration
 * ------------------------------------------------------------------ */

test('v76 -> v77 migrates additively and invents nothing', () => {
  const v76 = createEmptyState(NOW.toISOString());
  v76.schemaVersion = 76;
  delete v76.reliabilityReadings;
  delete v76.reliabilityMarkers;
  const { raw: v77, applied } = migrate(clone(v76));
  assert.ok(applied.includes('76 → 77'));
  assert.equal(v77.schemaVersion, 77);
  assert.deepEqual(v77.reliabilityReadings, []);
  assert.deepEqual(v77.reliabilityMarkers, []);
  assert.equal(SCHEMA_VERSION, 77);
});

test('a v75 workspace chains through both additive migrations', () => {
  const v75 = createEmptyState(NOW.toISOString());
  v75.schemaVersion = 75;
  const { raw, applied } = migrate(clone(v75));
  assert.ok(applied.includes('75 → 76'));
  assert.ok(applied.includes('76 → 77'));
  assert.equal(raw.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(raw.policyEvaluations, []);
  assert.deepEqual(raw.reliabilityReadings, []);
});

test('the normalizer strips every person-level field from a frozen reading', () => {
  const warnings = [];
  const out = normalizeReliabilityReadings([{
    id: 'rel-1',
    frozenAt: `${TODAY}T10:00:00.000Z`,
    frozenOn: TODAY,
    personId: 'person-1',
    members: ['person-1', 'person-2'],
    tiers: [{ personId: 'person-1', rank: 1 }],
    icc: 0.42,
    thresholdPct: 50,
  }], warnings);
  assert.equal(out.length, 1);
  assert.equal(out[0].personId, undefined);
  assert.equal(out[0].members, undefined);
  assert.equal(out[0].tiers, undefined);
  assert.ok(warnings.some((w) => /person-level fields/.test(w)));
  assert.equal(out[0].icc, 0.42);
});

test('the normalizer refuses a grade dated before its freeze and nulls bad numbers', () => {
  const warnings = [];
  const out = normalizeReliabilityReadings([{
    id: 'rel-2',
    frozenAt: `${TODAY}T10:00:00.000Z`,
    frozenOn: TODAY,
    status: 'graded',
    icc: 1.4,
    grade: { gradedAt: '2026-01-01T00:00:00.000Z', exceeded: true },
  }], warnings);
  assert.equal(out[0].status, 'frozen');
  assert.equal(out[0].grade, null);
  assert.equal(out[0].icc, null, 'an ICC of 1.4 is a corrupted file, not a rounding error');
});

test('blame language is scrubbed from reading notes and marker notes', () => {
  const out = normalizeReliabilityReadings([{
    id: 'rel-3',
    frozenAt: `${TODAY}T10:00:00.000Z`,
    frozenOn: TODAY,
    history: [{ at: `${TODAY}T10:00:00.000Z`, type: 'frozen', summary: 'this person is a dead weight' }],
  }]);
  assert.equal(out[0].history[0].summary, '');
  const markers = normalizeReliabilityMarkers([{ key: 'obs:r1', kind: 'observation', day: TODAY, note: 'careless rater' }]);
  assert.equal(markers[0].note, '');
});

test('markers with no kind or no valid day are dropped rather than guessed', () => {
  const markers = normalizeReliabilityMarkers([
    { key: 'a', kind: 'observation', day: TODAY },
    { key: 'b', kind: 'nonsense', day: TODAY },
    { key: 'c', kind: 'observation', day: '2026-02-30' },
    { key: 'a', kind: 'temper', day: TODAY },
  ]);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].key, 'a');
  assert.equal(markers[0].kind, 'observation');
});

test('settings clamp into their declared ranges', () => {
  const s = normalizeReliabilitySettings({
    reliabilityMinPersons: 99,
    reliabilityIccFloorPct: 5,
    reliabilitySeparationPct: 1000,
    reliabilityTargetReliabilityPct: 'nonsense',
    reliabilityAutoPropagate: false,
  });
  assert.equal(s.reliabilityMinPersons, 12);
  assert.equal(s.reliabilityIccFloorPct, 20);
  assert.equal(s.reliabilitySeparationPct, 99);
  assert.equal(s.reliabilityTargetReliabilityPct, RELIABILITY_LIMITS.targetReliabilityPct);
  assert.equal(s.reliabilityAutoPropagate, false);
});

/* ------------------------------------------------------------------ *
 * 2. Numeric helpers
 * ------------------------------------------------------------------ */

test('the distribution helpers agree with published critical values', () => {
  assert.ok(Math.abs(normalCdf(1.959964) - 0.975) < 1e-5);
  assert.ok(Math.abs(invNormal(0.975) - 1.959964) < 1e-5);
  assert.ok(Math.abs(tTwoSidedP(2.228, 10) - 0.05) < 5e-4);
  assert.ok(Math.abs(fSurvival(3.478, 4, 10) - 0.05) < 5e-4);
  assert.ok(Math.abs(fQuantile(0.95, 4, 10) - 3.478) < 0.01);
});

test('Spearman-Brown and its inverse are exact inverses', () => {
  for (const rho of [0.2, 0.35, 0.5, 0.68]) {
    for (const target of [0.7, 0.8, 0.9]) {
      const k = observationsForReliability(rho, target);
      assert.ok(k !== null);
      assert.ok(Math.abs(spearmanBrown(rho, k) - target) < 1e-9, `rho ${rho} target ${target}`);
    }
  }
  // A target below the current reliability needs no work, and is refused rather
  // than returned as a negative count.
  assert.equal(observationsForReliability(0.8, 0.7), null);
  assert.equal(observationsForReliability(0, 0.8), null);
});

test('the exact permutation test enumerates every ordering and reports a real p', () => {
  const perfect = spearmanPermutationP([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
  assert.equal(perfect.method, 'exact-permutation');
  assert.equal(perfect.permutations, 120);
  assert.ok(Math.abs(perfect.p - 2 / 120) < 1e-12);
  const reversed = spearmanPermutationP([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]);
  assert.ok(Math.abs(reversed.p - 2 / 120) < 1e-12);
  // Above the exact cutoff the test switches method, and says so.
  const asymptotic = spearmanPermutationP([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 8, 7]);
  assert.equal(asymptotic.method, 'asymptotic-t');
  assert.ok(asymptotic.p >= 0 && asymptotic.p <= 1);
  // A constant vector has no rank correlation at all.
  assert.equal(spearman([1, 1, 1, 1], [1, 2, 3, 4]), null);
});

/* ------------------------------------------------------------------ *
 * 3. The estimator
 * ------------------------------------------------------------------ */

test('a balanced design reduces exactly to the classical two-way random-effects estimator', () => {
  // An arbitrary balanced P = 4, J = 3 design with non-round values.
  const values = [
    [0.42, 0.61, 0.55],
    [0.31, 0.55, 0.49],
    [0.77, 0.83, 0.71],
    [0.12, 0.28, 0.19],
  ];
  const P = values.length;
  const J = values[0].length;
  const cells = [];
  values.forEach((row, i) => row.forEach((v, j) => cells.push({ personId: `p${i}`, occasion: `c${j}`, value: v })));
  const flat = cells.map((c) => c.value);
  const gm = flat.reduce((a, b) => a + b, 0) / flat.length;
  const personMeans = values.map((row) => row.reduce((a, b) => a + b, 0) / row.length);
  const occMeans = Array.from({ length: J }, (_, j) => values.reduce((a, row) => a + row[j], 0) / P);
  const ssP = J * personMeans.reduce((a, m) => a + (m - gm) ** 2, 0);
  const ssO = P * occMeans.reduce((a, m) => a + (m - gm) ** 2, 0);
  const ssTotal = flat.reduce((a, v) => a + (v - gm) ** 2, 0);
  const ssE = ssTotal - ssP - ssO;
  const msP = ssP / (P - 1);
  const msO = ssO / (J - 1);
  const msE = ssE / ((P - 1) * (J - 1));
  const sigma2 = msE;
  const tau2 = (msP - msE) / J;
  const omega2 = (msO - msE) / P;

  const d = decomposeVariance(cells);
  assert.equal(d.ok, true);
  assert.ok(Math.abs(d.sigma2 - sigma2) < 1e-12, `sigma2 ${d.sigma2} vs ${sigma2}`);
  assert.ok(Math.abs(d.tau2 - tau2) < 1e-12, `tau2 ${d.tau2} vs ${tau2}`);
  assert.ok(Math.abs(d.omega2 - omega2) < 1e-12, `omega2 ${d.omega2} vs ${omega2}`);
  assert.ok(Math.abs(d.nZero - J) < 1e-12, 'Cochran n0 equals the per-person count when balanced');
});

test('the unbalanced design uses Cochran n0 and still reports a design', () => {
  const cells = [];
  const plan = { a: 4, b: 3, c: 3, d: 2, e: 2 };
  const base = { a: 0.7, b: 0.5, c: 0.9, d: 0.2, e: 0.4 };
  for (const [personId, count] of Object.entries(plan)) {
    for (let j = 0; j < count; j += 1) {
      cells.push({ personId, occasion: `c${j}`, value: base[personId] + (j === 1 ? 0.03 : 0) });
    }
  }
  const d = decomposeVariance(cells);
  assert.equal(d.ok, true);
  // Cochran's n0 = (N − Σ n_i²/N)/(P−1) on this design.
  const N = cells.length;
  const sumSq = Object.values(plan).reduce((a, n) => a + n * n, 0);
  const expected = (N - sumSq / N) / (Object.keys(plan).length - 1);
  assert.ok(Math.abs(d.nZero - Math.round(expected * 100) / 100) < 0.011, `n0 ${d.nZero} vs ${expected}`);
  assert.ok(d.design.balanceRatio >= 1);
});

test('identical ratings inside every person give ICC = 1 and no complaint', () => {
  const state = ratingWorkspace(CONSTANT);
  const report = reliabilityReport(state, NOW);
  assert.equal(report.observable, true);
  assert.equal(report.components.icc, 1);
  assert.equal(report.verdict, 'strongly-separable');
  // Two people share the same rating level in this design (five people, four
  // levels), so exactly that pair is a tie and is printed as indistinguishable.
  for (const pair of report.separation.pairs) {
    if (pair.gapPoints === 0) assert.equal(pair.distinguishable, false);
    else assert.equal(pair.distinguishable, true);
  }
  assert.ok(report.components.iccCi === null, 'a zero-variance residual yields no interval rather than an infinite one');
});

test('a record with no between-person variance gives ICC = 0 and collapses every reading to the mean', () => {
  const state = ratingWorkspace(FLAT);
  const report = reliabilityReport(state, NOW);
  assert.equal(report.observable, true);
  assert.equal(report.components.icc, 0);
  assert.equal(report.components.tau2, 0);
  assert.equal(report.verdict, 'noise-dominated');
  for (const row of report.personRows) {
    assert.equal(row.credibility, 0);
    assert.equal(row.estimate, report.components.mu);
    assert.ok(Math.abs(row.shrinkPoints - (row.rawMean - row.estimate) * 3) < 1e-6);
  }
  assert.equal(report.separation.tierCount, 1, 'nobody is separable from anybody');
});

test('an unbalanced design is refused with a machine-readable reason', () => {
  const state = ratingWorkspace(MIXED);
  // Give one person four times the observations of everyone else.
  for (let i = 0; i < 12; i += 1) {
    state.reviews.push({
      ...clone(state.reviews[0]),
      id: `review-extra-${i}`,
      periodEnd: `2024-${String(Math.floor(i / 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      completedAt: `2024-${String(Math.floor(i / 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
    });
  }
  const report = reliabilityReport(state, NOW);
  assert.equal(report.observable, false);
  assert.equal(report.reason, 'too-unbalanced');
  assert.ok(report.design.balanceRatio > RELIABILITY_LIMITS.maxImbalanceRatio);
});

/* ------------------------------------------------------------------ *
 * 4. Credibility & separation
 * ------------------------------------------------------------------ */

test('credibility is n/(n + K) with K = occasion error / between-person variance', () => {
  const cells = [];
  const values = new Map([
    ['a', [3, 3, 2, 3]],
    ['b', [1, 2, 1, 1]],
    ['c', [2, 2, 3, 2]],
    ['d', [0, 1, 1, 0]],
    ['e', [1, 1, 2, 1]],
  ]);
  for (const [personId, rows] of values) {
    rows.forEach((r, j) => cells.push({ personId, occasion: `c${j}`, value: r / 3 }));
  }
  const d = decomposeVariance(cells);
  const cred = credibilityReadings(d, cells);
  const K = d.occasionError / d.tau2;
  for (const row of cred.rows) {
    const expected = row.n / (row.n + K);
    assert.ok(Math.abs(row.credibility - expected) < 1e-3, `${row.personId}: ${row.credibility} vs ${expected}`);
    const postVar = (d.tau2 * d.occasionError) / (row.n * d.tau2 + d.occasionError);
    assert.ok(Math.abs(row.posteriorSd - Math.sqrt(postVar)) < 1e-3);
    // Regression to the mean IS the credibility estimate, by construction.
    assert.ok(Math.abs(row.expectedNextPoints - (1 + row.estimate * 3)) < 1e-3);
    assert.ok(row.interval.low <= row.estimate && row.estimate <= row.interval.high);
  }
});

test('separation is a partial order with alphabetically ordered membership', () => {
  const state = ratingWorkspace(CONSTANT, { people: 5 });
  const report = reliabilityReport(state, NOW);
  const s = report.separation;
  assert.ok(s.tierCount >= 1);
  assert.equal(s.pairs.length, report.personRows.length - 1);
  for (const tier of s.tiers) {
    const ids = tier.members.map((m) => m.personId);
    assert.deepEqual(ids, ids.slice().sort(), 'membership is alphabetical so no order is implied');
  }
  // The posterior separation probability is monotone in the gap: the widest gap
  // is the most separable pair.
  const sortedPairs = s.pairs.slice().sort((a, b) => b.gapPoints - a.gapPoints);
  assert.ok(sortedPairs[0].p >= sortedPairs[sortedPairs.length - 1].p);
});

test('a wider separation bar can only ever merge tiers, never split them', () => {
  const cells = [];
  const values = new Map([
    ['a', [3, 3, 3, 3]],
    ['b', [2, 2, 2, 3]],
    ['c', [2, 1, 2, 2]],
    ['d', [1, 1, 1, 0]],
    ['e', [0, 0, 1, 0]],
  ]);
  for (const [personId, rows] of values) rows.forEach((r, j) => cells.push({ personId, occasion: `c${j}`, value: r / 3 }));
  const d = decomposeVariance(cells);
  const cred = credibilityReadings(d, cells);
  const lax = separationTiers(cred, { threshold: 0.5 });
  const strict = separationTiers(cred, { threshold: 0.99 });
  // A stricter bar can only merge tiers: separability is harder to establish.
  assert.ok(strict.tierCount <= lax.tierCount);
});

/* ------------------------------------------------------------------ *
 * 5. Harvest
 * ------------------------------------------------------------------ */

test('one observation per person per cycle: a duplicate is counted, not double-counted', () => {
  const state = ratingWorkspace(MIXED);
  const base = harvestReviewObservations(state);
  assert.equal(base.observations.length, 20);
  state.reviews.push({
    ...clone(state.reviews[0]),
    id: 'review-dup',
    completedAt: '2026-10-05T10:00:00.000Z',
    manager: { ...state.reviews[0].manager, rating: 'sets-standard' },
  });
  const after = harvestReviewObservations(state);
  assert.equal(after.observations.length, 20);
  assert.equal(after.duplicates, 1);
  const personOne = after.byPerson.get('person-1').find((o) => o.occasion === state.reviews[0].periodEnd);
  assert.equal(personOne.rating, 'sets-standard', 'the later completion wins');
});

test('draft reviews, unrated reviews and archived people are excluded', () => {
  const state = ratingWorkspace(MIXED);
  state.reviews[0].status = 'draft';
  state.reviews[1].manager = { ...state.reviews[1].manager, rating: '' };
  state.people.find((p) => p.id === 'person-5').status = 'archived';
  const harvest = harvestReviewObservations(state);
  assert.equal(harvest.observations.some((o) => o.reviewId === state.reviews[0].id), false);
  assert.equal(harvest.unrated, 1);
  assert.equal(harvest.observations.some((o) => o.personId === 'person-5'), false);
  assert.equal(harvest.people.length, 4);
});

test('the rating scale maps the four declared levels onto [0, 1]', () => {
  assert.equal(reviewRatingValue('needs-development'), 0);
  assert.equal(reviewRatingValue('sets-standard'), 1);
  assert.equal(reviewRatingValue('unknown'), null);
});

/* ------------------------------------------------------------------ *
 * 6. Report, floors, signals
 * ------------------------------------------------------------------ */

test('below the floor the report refuses and names every figure it withholds', () => {
  const state = createEmptyState(NOW.toISOString());
  state.people = [
    { id: 'p1', name: 'A', status: 'active' },
    { id: 'p2', name: 'B', status: 'active' },
  ];
  const report = reliabilityReport(state, NOW);
  assert.equal(report.observable, false);
  assert.equal(report.verdict, 'insufficient');
  assert.ok(report.floors.minObservations >= 12);
  assert.equal(report.components, null);
  assert.equal(report.decision, null);
  assert.ok(report.caveats.some((c) => /Decomposition refused/.test(c)));
});

test('the demo workspace clears the floor and produces a coherent reading', () => {
  const state = buildDemoState(NOW);
  const report = reliabilityReport(state, NOW);
  assert.equal(report.observable, true);
  assert.ok(report.components.icc > 0 && report.components.icc < 1);
  assert.ok(report.components.iccCi.low <= report.components.icc);
  assert.ok(report.components.iccCi.high >= report.components.icc);
  assert.ok(report.separation.tierCount >= 1);
  assert.ok(report.decision.requiredK !== null || report.components.icc === 0);
  assert.ok(report.personRows.every((row) => row.n >= RELIABILITY_LIMITS.minObsPerPerson));
});

test('the report is cached per state and never serves a stale figure after a write', () => {
  const state = ratingWorkspace(MIXED);
  const a = reliabilityReport(state, NOW);
  const b = reliabilityReport(state, NOW);
  assert.equal(a, b, 'the same state on the same day returns the identical object');
  const next = { ...state, reviews: state.reviews.slice(1) };
  assert.notEqual(reliabilityReport(next, NOW), a);
});

test('signals carry the declared ids and route back into the terminal', () => {
  const state = buildDemoState(NOW);
  const signals = reliabilitySignals(state, NOW);
  for (const signal of signals) {
    assert.ok(['REL-01', 'REL-02', 'REL-03', 'REL-04', 'REL-05', 'REL-06'].includes(signal.ruleId));
    assert.ok(signal.action.route.startsWith('#/reliability'));
    assert.equal(signal.domain, 'Measurement reliability');
  }
  assert.ok(signals.length >= 1);
  // The bucket is registered, so an unlisted domain cannot be silently dropped.
  assert.ok(DOMAIN_ORDER.includes('Measurement reliability'));
  const insights = buildInsights(state, NOW);
  assert.ok(insights.findings.some((f) => f.domain === 'Measurement reliability'));
});

test('attention counts only what a leader should actually look at', () => {
  const demo = buildDemoState(NOW);
  assert.ok(reliabilityAttentionCount(demo, NOW) >= 1);
  const empty = createEmptyState(NOW.toISOString());
  assert.equal(reliabilityAttentionCount(empty, NOW), 0);
});

test('the brief is aggregate-only: it names no person', () => {
  const state = buildDemoState(NOW);
  const report = reliabilityReport(state, NOW);
  const text = reliabilityBrief(report, NOW);
  assert.ok(text.includes('MEASUREMENT RELIABILITY BRIEF'));
  assert.ok(text.includes('NOT'));
  for (const person of state.people) {
    assert.equal(text.includes(person.name), false, `the brief leaked ${person.name}`);
    assert.equal(text.includes(person.id), false, `the brief leaked ${person.id}`);
  }
});

/* ------------------------------------------------------------------ *
 * 7. Rule spine
 * ------------------------------------------------------------------ */

test('RULE-REL-01 writes one observation marker per review and is idempotent', () => {
  const state = ratingWorkspace(MIXED);
  const effects = [];
  const ctx = { event: { type: 'reliability.scan' }, now: NOW, idFactory: (p) => `${p}-x`, log: (e) => effects.push(e) };
  reliabilityRule(state, ctx);
  const first = state.reliabilityMarkers.length;
  assert.equal(first, 20);
  reliabilityRule(state, ctx);
  assert.equal(state.reliabilityMarkers.length, first, 'a repeated scan writes nothing new');
  assert.ok(effects.some((e) => e.ruleId === RELIABILITY_RULE_IDS.CAPTURE));
});

test('RULE-REL-03 tempers a surprise rating without changing it', () => {
  const state = ratingWorkspace(MIXED);
  // Warm the record so a credibility reading exists for person-1.
  reliabilityRule(state, { event: { type: 'reliability.scan' }, now: NOW, idFactory: (p) => `${p}-w` });
  const before = reliabilityReport(state, NOW).personRows.find((r) => r.personId === 'person-1');
  assert.ok(before);
  // Add a review that sits a full point away from that reading.
  const extreme = before.estimate < 0.5 ? 'sets-standard' : 'needs-development';
  state.reviews.push({
    id: 'review-surprise',
    personId: 'person-1',
    periodStart: '2026-09-30',
    periodEnd: '2026-12-31',
    status: 'complete',
    selfReflection: { achievements: '', challenges: '', growth: '', support: '' },
    selfReflectionRecordedAt: null,
    manager: { achievements: '', development: '', nextSteps: '', rating: extreme },
    instrumentNotes: [],
    evidence: [],
    evidenceCapturedAt: '2026-10-15T10:00:00.000Z',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    completedAt: '2026-10-15T10:00:00.000Z',
  });
  const effects = [];
  reliabilityRule(state, {
    event: { type: 'review.completed', entity: 'review', entityId: 'review-surprise' },
    now: NOW,
    idFactory: (p) => `${p}-t`,
    log: (e) => effects.push(e),
  });
  const review = state.reviews.find((r) => r.id === 'review-surprise');
  assert.equal(review.manager.rating, extreme, 'the rating is never rewritten');
  assert.equal(review.instrumentNotes.length, 1);
  assert.ok(/rating is unchanged/i.test(review.instrumentNotes[0].text));
  assert.ok(state.delegations.some((d) => (d.support || '').includes('[REL-03:review-surprise]')));
  assert.ok(effects.some((e) => e.ruleId === RELIABILITY_RULE_IDS.TEMPER));
  // A replay is a strict no-op.
  const notesAfter = review.instrumentNotes.length;
  const tasksAfter = state.delegations.length;
  reliabilityRule(state, {
    event: { type: 'review.completed', entity: 'review', entityId: 'review-surprise' },
    now: NOW,
    idFactory: (p) => `${p}-t`,
  });
  assert.equal(review.instrumentNotes.length, notesAfter);
  assert.equal(state.delegations.length, tasksAfter);
});

test('RULE-REL-02 opens one governed decision when differentiation is asked of a noisy instrument', () => {
  const state = ratingWorkspace(FLAT);
  state.meritCycles = [{ id: 'merit-1', label: 'FY26 cycle', status: 'draft' }];
  const effects = [];
  reliabilityRule(state, {
    event: { type: 'reliability.scan' }, now: NOW, idFactory: (p) => `${p}-q`, log: (e) => effects.push(e),
  });
  const decisions = state.decisions.filter((d) => (d.context || '').includes('[REL-02:'));
  assert.equal(decisions.length, 1);
  assert.ok(/instrument/i.test(decisions[0].title + decisions[0].question));
  assert.equal(decisions[0].chosen, '', 'the decision is opened unanswered');
  assert.ok(state.links.some((l) => l.relation === 'qualifies-differentiation'));
  // Second scan in the same week: still one decision.
  reliabilityRule(state, {
    event: { type: 'reliability.scan' }, now: NOW, idFactory: (p) => `${p}-q2`,
  });
  assert.equal(state.decisions.filter((d) => (d.context || '').includes('[REL-02:')).length, 1);
  assert.ok(effects.some((e) => e.ruleId === RELIABILITY_RULE_IDS.QUALIFY));
});

test('RULE-REL-02 does nothing when no differentiation is being asked for', () => {
  const state = ratingWorkspace(FLAT);
  reliabilityRule(state, { event: { type: 'reliability.scan' }, now: NOW, idFactory: (p) => `${p}-a` });
  assert.equal(state.decisions.filter((d) => (d.context || '').includes('[REL-02:')).length, 0);
});

test('RULE-REL-05 grades a due reading once and lapses one that closed empty', () => {
  const state = ratingWorkspace(MIXED);
  state.reliabilityReadings = [
    {
      id: 'rel-due',
      frozenAt: '2026-06-01T10:00:00.000Z',
      frozenOn: '2026-06-01',
      horizonDays: 30,
      status: 'frozen',
      thresholdPct: 50,
      predictedExceed: 0.7,
      design: { persons: 5, occasions: 3, observations: 15, medianObsPerPerson: 3, balanceRatio: 1 },
      history: [],
      updatedAt: '2026-06-01T10:00:00.000Z',
    },
    {
      id: 'rel-empty',
      frozenAt: '2026-06-01T10:00:00.000Z',
      frozenOn: '2026-06-01',
      horizonDays: 30,
      status: 'frozen',
      thresholdPct: 50,
      predictedExceed: 0.5,
      // Claims the record already held everything, so nothing new can arrive.
      design: { persons: 5, occasions: 4, observations: 20, medianObsPerPerson: 4, balanceRatio: 1 },
      history: [],
      updatedAt: '2026-06-01T10:00:00.000Z',
    },
  ];
  reliabilityRule(state, { event: { type: 'reliability.scan' }, now: NOW, idFactory: (p) => `${p}-g` });
  const due = state.reliabilityReadings.find((r) => r.id === 'rel-due');
  const empty = state.reliabilityReadings.find((r) => r.id === 'rel-empty');
  assert.equal(due.status, 'graded');
  assert.equal(typeof due.grade.exceeded, 'boolean');
  assert.ok(due.grade.brier !== null && due.grade.brier >= 0 && due.grade.brier <= 1);
  assert.equal(empty.status, 'graded');
  assert.equal(empty.grade.exceeded, null);
  assert.equal(empty.grade.brier, null);
  assert.ok(/Lapsed/.test(empty.grade.note));
});

test('RULE-REL-05 drops markers whose review no longer exists', () => {
  const state = ratingWorkspace(MIXED);
  reliabilityRule(state, { event: { type: 'reliability.scan' }, now: NOW, idFactory: (p) => `${p}-r` });
  const removed = state.reviews[0].id;
  state.reviews = state.reviews.filter((r) => r.id !== removed);
  reliabilityRule(state, { event: { type: 'reliability.scan' }, now: NOW, idFactory: (p) => `${p}-r2` });
  assert.equal(state.reliabilityMarkers.some((m) => m.reviewId === removed), false);
});

test('the rule is on the shared spine, declared, and never changes a rating', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((r) => r.name === 'reliabilityRule'));
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule?.name === 'reliabilityRule');
  assert.ok(contract, 'every spine rule declares a contract');
  assert.ok(contract.writes.includes('reliabilityMarkers'));
  assert.ok(/never/i.test(contract.purpose));
});

/* ------------------------------------------------------------------ *
 * 8. API boundary
 * ------------------------------------------------------------------ */

test('the freeze action refuses below the floor, validates the window and rejects blame', () => {
  const empty = setup({ state: createEmptyState(NOW.toISOString()) });
  const refused = empty.api.freezeReliabilityReading({ horizonDays: 90, notes: '' });
  assert.equal(refused.ok, false);
  assert.ok(/floor/i.test(refused.error));

  const env = setup({ state: ratingWorkspace(MIXED) });
  const tooShort = env.api.freezeReliabilityReading({ horizonDays: 5, notes: '' });
  assert.equal(tooShort.ok, false);
  const blame = env.api.freezeReliabilityReading({ horizonDays: 90, notes: 'this is a dead weight on the team' });
  assert.equal(blame.ok, false);
  assert.ok(/never about a person/i.test(blame.error));

  const ok = env.api.freezeReliabilityReading({ horizonDays: 90, notes: 'Watching whether the fourth cycle lifts the coefficient.' });
  assert.equal(ok.ok, true);
  assert.equal(ok.record.status, 'frozen');
  assert.equal(env.store.state.reliabilityReadings.length, 1);
  // The stored record carries no identity at all.
  const blob = JSON.stringify(env.store.state.reliabilityReadings[0]);
  for (const leak of ['Person A', 'Person B', 'person-1']) {
    assert.equal(blob.includes(leak), false, `the frozen record leaked ${leak}`);
  }
});

test('the scan runs the spine and the API read agrees with the domain read', () => {
  const env = setup({ state: ratingWorkspace(MIXED) });
  const res = env.api.scanReliability();
  assert.equal(res.ok, true);
  const fromApi = env.api.reliabilityRead();
  const direct = reliabilityReport(env.store.state, NOW);
  assert.equal(fromApi.components.icc, direct.components.icc);
  assert.ok(env.api.reliabilityBriefText().includes('MEASUREMENT RELIABILITY BRIEF'));
});

test('a failed write is reported, never silently swallowed', () => {
  const env = setup({ state: ratingWorkspace(MIXED), failWrites: true });
  const res = env.api.freezeReliabilityReading({ horizonDays: 90, notes: '' });
  assert.equal(res.ok, true);
  assert.equal(res.saved, false);
  assert.ok(res.warning);
});

/* ------------------------------------------------------------------ *
 * 9. Wiring: links, export, routes, nav
 * ------------------------------------------------------------------ */

test('the reading is a first-class graph node with a resolver route', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('reliability'));
  assert.ok(LINK_RELATIONS.includes('qualifies-differentiation'));
  assert.ok(LINK_RELATIONS.includes('tempers-rating'));
  assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes('qualifies-differentiation'));
  assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes('tempers-rating'));
  const state = createEmptyState(NOW.toISOString());
  state.reliabilityReadings = [{
    id: 'rel-node', label: 'Instrument reading', frozenAt: `${TODAY}T10:00:00.000Z`, frozenOn: TODAY,
    horizonDays: 90, status: 'frozen', grade: null, history: [], updatedAt: `${TODAY}T10:00:00.000Z`,
  }];
  const resolved = resolveLinkedEntity(state, 'reliability', 'rel-node');
  assert.ok(resolved);
  assert.equal(resolved.route, '#/reliability?panel=ledger&reading=rel-node');
});

test('CSV scope #67 exports aggregate rows and leaks nothing', () => {
  const scope = CSV_EXPORTS.find((s) => s.key === 'measurement-reliability');
  assert.ok(scope, 'the scope is registered');
  assert.equal(scope.sensitive, false);
  const state = ratingWorkspace(MIXED);
  state.feedback = [
    { id: 'fb1', personId: 'person-1', direction: 'given', kind: 'praise', date: '2026-09-01' },
    { id: 'fb2', personId: 'person-1', direction: 'given', kind: 'constructive', date: '2026-09-02' },
  ];
  const res = exportWorkspaceCsv(state, 'measurement-reliability', { now: NOW });
  assert.equal(res.ok, true);
  const parsed = parseCsv(res.csv);
  assert.ok(parsed.headers.includes('icc'));
  assert.ok(parsed.rows.some((r) => r[parsed.headers.indexOf('row_kind')] === 'instrument'));
  const blob = JSON.stringify(parsed.rows);
  for (const leak of ['Person A', 'person-1', 'fb1']) {
    assert.equal(blob.includes(leak), false, `CSV scope #67 leaked ${leak}`);
  }
  const empty = exportWorkspaceCsv(createEmptyState(NOW.toISOString()), 'measurement-reliability', { now: NOW });
  const emptyParsed = parseCsv(empty.csv);
  const iccIdx = emptyParsed.headers.indexOf('icc');
  assert.ok(emptyParsed.rows.every((r) => r[iccIdx] === ''), 'a withheld figure is blank, never zero');
  assert.ok(emptyParsed.rows.some((r) => r[emptyParsed.headers.indexOf('row_kind')] === 'below_floor'));
});

test('the route, the nav entry and the document title are wired', () => {
  // `#/measurement` is a real, different route (Scorecard integrity), so it is
  // deliberately NOT an alias here — an alias would silently steal that page.
  assert.equal(parseRoute('#/measurement').route, 'measurement');
  for (const alias of ['reliability', 'measurement-reliability', 'instrument', 'psychometrics', 'icc', 'g-theory', 'tiers']) {
    assert.equal(parseRoute(`#/${alias}`).route, 'reliability', `alias ${alias} must resolve`);
  }
  const item = NAV.flatMap((s) => s.items).find((i) => i.route === 'reliability');
  assert.ok(item, 'the terminal is in the nav');
  assert.equal(item.badge, 'reliability');
});

test('a normalized workspace round-trips the new collections unchanged', () => {
  const state = buildDemoState(NOW);
  const { state: again, warnings } = normalizeState(clone(state), { now: NOW });
  assert.equal(again.reliabilityReadings.length, state.reliabilityReadings.length);
  assert.equal(again.reliabilityMarkers.length, state.reliabilityMarkers.length);
  assert.deepEqual(warnings.filter((w) => /reliability/i.test(w)), []);
  assert.equal(again.reviews.every((r) => Array.isArray(r.instrumentNotes)), true);
});

/* ------------------------------------------------------------------ *
 * 10. View rendering & accessibility
 * ------------------------------------------------------------------ */

const PANELS = ['signal', 'readings', 'separation', 'decision', 'convergence', 'ledger', 'method'];

const VIEW_DOM = new JSDOM('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Measurement reliability</title></head><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', {
  url: 'https://leados.test/#/reliability',
  runScripts: 'outside-only',
});
VIEW_DOM.window.eval(AXE_SRC);
globalThis.window = VIEW_DOM.window;
globalThis.document = VIEW_DOM.window.document;
globalThis.SVGElement = VIEW_DOM.window.SVGElement;
globalThis.Node = VIEW_DOM.window.Node;
globalThis.Element = VIEW_DOM.window.Element;
globalThis.HTMLElement = VIEW_DOM.window.HTMLElement;

async function axeCheck(node) {
  const results = await VIEW_DOM.window.axe.run(node, {
    resultTypes: ['violations'],
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(results.violations || []).map((v) => `${v.id}: ${v.help}`);
}

function renderPanel(state, panel) {
  const ctx = {
    state,
    now: NOW,
    query: new URLSearchParams({ panel }),
    navigate: () => {},
    refresh: () => {},
    api: {
      reliabilityBriefText: () => 'brief',
      reliabilityRead: () => reliabilityReport(state, NOW),
      scanReliability: () => ({ ok: true, propagations: [] }),
      freezeReliabilityReading: () => ({ ok: true, saved: true }),
    },
  };
  const node = renderReliability(ctx);
  const view = VIEW_DOM.window.document.getElementById('view');
  view.replaceChildren();
  view.appendChild(node);
  return node;
}

test('every panel renders on a live workspace and on an empty one, each with one h1', () => {
  for (const state of [buildDemoState(NOW), createEmptyState(NOW.toISOString())]) {
    for (const panel of PANELS) {
      let node = null;
      assert.doesNotThrow(() => { node = renderPanel(state, panel); }, `panel ${panel} threw`);
      assert.equal(node.querySelectorAll('h1').length, 1, `panel ${panel} must carry exactly one h1`);
      assert.ok(node.textContent.trim().length > 40, `panel ${panel} rendered nothing readable`);
    }
  }
});

test('all seven panels are axe-clean', async () => {
  const state = buildDemoState(NOW);
  for (const panel of PANELS) {
    const node = renderPanel(state, panel);
    const violations = await axeCheck(node);
    assert.deepEqual(violations, [], `panel ${panel} has accessibility violations`);
  }
});

test('the empty state explains the floor instead of printing a dead screen', () => {
  const node = renderPanel(createEmptyState(NOW.toISOString()), 'signal');
  const text = node.textContent;
  assert.ok(/Not enough/i.test(text));
  assert.ok(/12/.test(text), 'the observation floor is printed');
});

test('the separation panel prints names inside tiers and never a rank number', () => {
  const node = renderPanel(buildDemoState(NOW), 'separation');
  const text = node.textContent;
  assert.ok(/Tier 1/.test(text));
  assert.ok(/alphabetical/i.test(text));
  assert.equal(/rank 1|#1 →|leaderboard/i.test(text), false);
});
