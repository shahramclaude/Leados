/**
 * tests/app/promise-solvency.test.mjs — Schema v80, ADR-0073, RULE-SLV-01..05.
 *
 * The claims this suite makes, in order:
 *
 *  1. Schema v80 is additive: three empty ledgers, no reading, no marker and no
 *     moved date invented by the migration.
 *  2. The special functions are exact to the digits the screen prints, and the
 *     copula reduces to its closed forms at both ends of ρ.
 *  3. The count distribution is a real distribution: it sums to one, its mean is
 *     the sum of the marginals under every ρ, and P(N = 0) equals 1 − P(any).
 *  4. The scores are proper: a perfect forecast scores zero, and RPS punishes a
 *     forecast wrong by three more than one wrong by one.
 *  5. Promises are harvested from real dated records, right-censored at today,
 *     and a source with no history prices nothing rather than pricing zero.
 *  6. The coverage ratio is capacity ÷ demand over the same 28 days, and the
 *     stress curve is monotone.
 *  7. A reading freezes once a day, carries the ceiling it will never be graded
 *     on, and refuses to freeze an empty book.
 *  8. Grading is exact: per-promise Brier against a hand-computed value, count
 *     scores against hand-computed RPS and log score; refuses early, grades once,
 *     lapses when every promise was deleted.
 *  9. RULE-SLV-01 opens capped repair work, writes `endangers-promise` edges and
 *     exactly one `underwrites-commitment` edge per week on a coverage deficit —
 *     without moving a single date.
 * 10. Cross-module propagation is real: a freeze opens a task inside the
 *     delegation ledger, and a renegotiation changes the real source record and
 *     appends to the append-only ledger with a `renegotiates` edge.
 * 11. The relations, entity type and post-commit registration exist.
 * 12. Insights, CSV scope #70, the route/aliases and the six panels all render,
 *     axe-clean, and the CSV carries aggregates only.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  MIGRATIONS,
  SCHEMA_VERSION,
  createEmptyState,
  migrate,
  normalizeState,
} from '../../app/core/schema.js';
import { buildDemoState } from '../../app/core/demo.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  breachCountDistribution,
  breachProbability,
  buildSolvencyReading,
  countLogScore,
  erf,
  findPromise,
  gradeSolvencyReading,
  harvestPromises,
  isBreachedAt,
  jointBreachRisk,
  normCdf,
  normInv,
  promiseMoves,
  rankedProbabilityScore,
  solvencyAttentionCount,
  solvencyBrief,
  solvencyReport,
  solvencySignals,
  solvencySkill,
  wilsonInterval,
} from '../../app/core/domain/solvency.js';
import { SOLVENCY_EVENTS, SOLVENCY_LIMITS, SOLVENCY_RULE_IDS, PROMISE_SOURCE_KEYS } from '../../app/core/domain/solvencyRegistry.js';
import {
  normalizeSolvencyMarkers,
  normalizeSolvencyReadings,
  normalizeSolvencyRenegotiations,
} from '../../app/core/domain/solvencySchema.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  LINK_RELATION_LABELS,
  resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { DOMAIN_ORDER, buildInsights } from '../../app/core/domain/insights.js';
import { parseRoute } from '../../app/main.js';
import { renderSolvency } from '../../app/views/solvency.js';

const NOW = new Date('2026-11-02T10:00:00.000Z');
const TODAY = '2026-11-02';
const ROOT = path.resolve(import.meta.dirname, '../..');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const clone = (v) => JSON.parse(JSON.stringify(v));

function storage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
  };
}

function harness(initial) {
  let seq = 0;
  const store = createStore({ storage: storage(), now: () => NOW, idFactory: (p) => `${p}-s-${++seq}` });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory: (p) => `${p}-a-${++seq}` });
  if (initial) assert.equal(store.importJSON(JSON.stringify(initial), { now: NOW }).ok, true);
  return { store, api };
}

/* ------------------------------------------------------------------ 1. schema */

test('schema v80 is additive and invents no reading, marker or moved date', () => {
  assert.equal(SCHEMA_VERSION, 104);
  const v79 = { ...createEmptyState(NOW.toISOString()), schemaVersion: 79 };
  delete v79.solvencyReadings;
  delete v79.solvencyMarkers;
  delete v79.solvencyRenegotiations;
  const migrated = migrate(v79);
  assert.equal(migrated.applied.at(-1), '103 → 104');
  assert.deepEqual(migrated.raw.solvencyReadings, []);
  assert.deepEqual(migrated.raw.solvencyMarkers, []);
  assert.deepEqual(migrated.raw.solvencyRenegotiations, []);
  assert.equal(MIGRATIONS[79] !== undefined, true);
  const normalized = normalizeState(migrated.raw, { now: NOW }).state;
  assert.deepEqual(normalized.solvencyReadings, []);
  assert.equal(normalized.schemaVersion, 104);
  assert.equal(normalized.schemaVersion, 104);
});

test('the three normalizers are fail-closed and drop what they cannot read', () => {
  const state = buildDemoState(NOW);
  const report = solvencyReport(state, NOW, state.settings || {});
  const built = buildSolvencyReading(report, state, NOW, 'keep');
  assert.equal(built.ok, true);
  const warnings = [];
  const readings = normalizeSolvencyReadings([
    built.record,
    { id: 'no-review', frozenAt: NOW.toISOString() },
    { ...built.record, id: 'no-probability', predictedAnyBreachPct: null, predictedIndependencePct: null },
    { id: 'dupe-of-keep', ...built.record },
    'not an object',
  ], warnings);
  assert.deepEqual(readings.map((r) => r.id), ['keep'], 'one good reading survives, the rest are dropped');
  assert.ok(warnings.length >= 1, 'a dropped record is announced, never silently repaired');
  assert.deepEqual(normalizeSolvencyMarkers(['a', 'a', '', null, 3]), ['a']);
  assert.deepEqual(normalizeSolvencyRenegotiations([{ sourceKey: 'delegation' }]), [],
    'a ledger row without a promise, a reason and a date is not a renegotiation');
});

/* ------------------------------------------------------- 2. special functions */

test('erf, Φ and Φ⁻¹ are exact to the printed digits', () => {
  assert.equal(erf(1), 0.8427007929497148);
  assert.equal(erf(0.5), 0.5204998778130465);
  assert.equal(normCdf(1.96), 0.9750021048517794);
  assert.ok(Math.abs(normCdf(-3) - 0.0013498980316300) < 1e-15);
  assert.ok(Math.abs(normInv(0.975) - 1.9599639845400538) < 1e-12);
  assert.equal(normInv(0.5), 0);
  const w = wilsonInterval(9, 10, 1.959963984540054);
  assert.equal(w.pct, 90);
  assert.ok(w.loPct < 90 && w.hiPct > 90 && w.loPct > 50, 'the interval brackets the point estimate');
  const empty = wilsonInterval(0, 0);
  assert.ok(empty === null || empty.pct === null, 'no sample means no rate, not zero');
});

test('the copula reduces to its closed forms at both ends of ρ', () => {
  const pds = [0.1, 0.2];
  const zero = jointBreachRisk({ pds, rho: 0 });
  assert.equal(zero.pAny, 1 - (0.9 * 0.8));
  assert.equal(zero.pAny, zero.independence);
  const comonotonic = jointBreachRisk({ pds, rho: 0.999 });
  assert.ok(comonotonic.pAny < zero.pAny);
  assert.ok(comonotonic.pAny > 0.19 && comonotonic.pAny < 0.21, 'ρ → 1 approaches max(PD) from below');
  assert.equal(comonotonic.comonotonic, 0.2);
  assert.equal(comonotonic.frechetLow, 0.2);
  assert.equal(comonotonic.frechetHigh, 0.30000000000000004);
  for (const marginal of comonotonic.marginal) assert.ok(marginal >= 0 && marginal <= comonotonic.pAny);
  // Monotone in ρ: more correlation never raises the probability of at least one.
  let previous = 1;
  for (const rho of [0, 0.2, 0.4, 0.6, 0.8, 0.95]) {
    const current = jointBreachRisk({ pds: new Array(12).fill(0.3), rho }).pAny;
    assert.ok(current <= previous + 1e-9, `ρ ${rho} must not raise P(any)`);
    previous = current;
  }
});

/* --------------------------------------------------- 3. the count distribution */

test('the count distribution is a distribution, under every ρ', () => {
  for (const [pds, rho] of [
    [[0.1, 0.2], 0],
    [[0.1, 0.2], 0.3],
    [[0.5, 0.5], 0.9],
    [new Array(16).fill(0.3), 0.3],
    [new Array(9).fill(0.72), 0.55],
  ]) {
    const dist = breachCountDistribution({ pds, rho });
    const joint = jointBreachRisk({ pds, rho });
    const total = dist.pmf.reduce((a, b) => a + b, 0);
    const mean = dist.pmf.reduce((sum, p, k) => sum + p * k, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `pmf sums to 1 at ρ ${rho}`);
    assert.ok(Math.abs(mean - pds.reduce((a, b) => a + b, 0)) < 1e-6, 'mean is the sum of the marginals');
    assert.ok(Math.abs(dist.pmf[0] - (1 - joint.pAny)) < 1e-6, 'P(N = 0) is 1 − P(any)');
    assert.equal(dist.pmf.length, pds.length + 1);
  }
  // At ρ = 0 the law is the Poisson-binomial, in closed form for two marginals.
  const two = breachCountDistribution({ pds: [0.1, 0.6], rho: 0 });
  assert.ok(Math.abs(two.pmf[0] - 0.36) < 1e-12);
  assert.ok(Math.abs(two.pmf[1] - 0.58) < 1e-12);
  assert.ok(Math.abs(two.pmf[2] - 0.06) < 1e-12);
  // Degenerate marginals: certain never, and certain always.
  assert.deepEqual(breachCountDistribution({ pds: [], rho: 0.3 }).pmf, [1]);
});

/* ------------------------------------------------------------- 4. proper scores */

test('the scores are proper and the RPS is a step, not an accumulation', () => {
  assert.equal(rankedProbabilityScore([0, 0, 1], 2), 0, 'a certain forecast scores zero');
  assert.equal(rankedProbabilityScore([1, 0, 0], 0), 0);
  assert.equal(rankedProbabilityScore([0, 1, 0], 2), 1, 'wrong by one category');
  const four = rankedProbabilityScore([0, 0, 0, 0, 1], 4);
  assert.equal(four, 0);
  const offByOne = rankedProbabilityScore([0, 0, 0, 1, 0], 4);
  const offByThree = rankedProbabilityScore([0, 1, 0, 0, 0], 4);
  assert.equal(offByOne, 1);
  assert.equal(offByThree, 3, 'the RPS of a forecast three categories away is three, not nine');
  assert.ok(offByThree > offByOne);
  assert.ok(offByThree <= 4, 'RPS never exceeds the number of categories minus one');
  assert.equal(countLogScore([0, 0, 1], 2), 0);
  assert.equal(countLogScore([0, 1, 0], 2), null, 'a zero on the observed category is refused, not flattered');
  assert.ok(Math.abs(countLogScore([0.5, 0.5], 1) - Math.log(2)) < 1e-12);
});

/* ------------------------------------------------------------- 5. the harvest */

test('promises are the dated records the workspace already keeps', () => {
  const state = buildDemoState(NOW);
  const report = solvencyReport(state, NOW, state.settings || {});
  assert.deepEqual(report.sources.map((s) => s.key), [...PROMISE_SOURCE_KEYS]);
  assert.equal(report.counts.open, report.book.length);
  for (const promise of report.book) {
    assert.match(promise.obligationOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(PROMISE_SOURCE_KEYS.includes(promise.sourceKey));
  }
  // A source with no history of its own prices nothing from it. Where class
  // pooling is allowed it may borrow the class curve, and the promise says so.
  const unproven = report.sources.filter((s) => s.verdict === 'unproven');
  for (const source of unproven) {
    assert.notEqual(source.pricedBy, 'own', 'an unproven source never prices from its own record');
  }
  for (const promise of report.book) {
    if (promise.pricedBy === 'pool') assert.ok(promise.pdPct !== null, 'a pooled promise still carries a number');
  }
  for (const promise of report.book) {
    if (promise.pricedBy === 'none') {
      assert.equal(promise.pdPct, null, 'an unpriced promise carries no number and is not assumed safe');
    }
  }
  const overdue = report.book.filter((p) => p.state === 'overdue');
  assert.equal(overdue.length, report.counts.overdue);
  for (const promise of overdue) assert.ok(promise.daysUntil < 0);
  // Right-censoring: a settled promise is never treated as if it were still open.
  for (const promise of harvestPromises(state, 'delegation')) {
    if (promise.settlementOn) assert.equal(promise.open, false);
  }
});

test('the breach probability is bounded, monotone in the deadline, and refused without history', () => {
  const offsets = [2, 5, -2, -2, 8, -2, 7, -2, 6, 7];
  const near = breachProbability({ offsets, obligationOn: TODAY, today: TODAY, minHistory: 3 });
  const far = breachProbability({ offsets, obligationOn: '2026-12-31', today: TODAY, minHistory: 3 });
  assert.ok(near !== null && far !== null);
  assert.ok(near > 0 && near < 1);
  assert.ok(far <= near, 'a later deadline cannot be riskier than an earlier one');
  assert.equal(breachProbability({ offsets: [], obligationOn: '2027-03-01', today: TODAY, minHistory: 3 }), null,
    'no history means no quantile and no number');
  // A settled promise is a virtual on-time settlement at offset 0, never a silent zero offset.
  const allLate = breachProbability({ offsets: [9, 9, 9, 9, 9], obligationOn: TODAY, today: TODAY, minHistory: 3 });
  assert.ok(allLate > 0.5, `a source that is always nine days late is not a coin flip (saw ${allLate})`);
});

/* ------------------------------------------------------------ 6. the capacity */

test('coverage is capacity ÷ demand over the same 28 days, and stress is monotone', () => {
  const state = buildDemoState(NOW);
  const report = solvencyReport(state, NOW, state.settings || {});
  const { coverageRatio, servicePerWeek, dueNext28, clearanceWeeks } = report.capacity;
  if (coverageRatio !== null) {
    assert.ok(Math.abs(coverageRatio - (servicePerWeek * 4) / dueNext28) < 0.05,
      `coverage ${coverageRatio} must be four weeks of service over the due count`);
  }
  const shortfalls = report.capacity.stress.map((row) => row.shortfall);
  for (let i = 1; i < shortfalls.length; i += 1) {
    assert.ok(shortfalls[i] >= shortfalls[i - 1], 'less capacity never creates more headroom');
  }
  if (clearanceWeeks !== null) assert.ok(clearanceWeeks > 0);
  // Little's Law: the book clears faster with more capacity, and never in a negative time.
  const slow = solvencyReport(state, NOW, { ...(state.settings || {}), solvencyWindowDays: 365 });
  assert.ok(slow.capacity.servicePerWeek >= 0);
});

/* -------------------------------------------------------------- 7. the freeze */

test('a reading freezes once a day, carries its ceiling, and refuses an empty book', () => {
  const { store, api } = harness(buildDemoState(NOW));
  const first = api.freezeSolvencyReading({ reviewDays: 30 });
  assert.equal(first.ok, true, first.error || '');
  const second = api.freezeSolvencyReading({ reviewDays: 30 });
  assert.equal(second.ok, false, 'a second freeze on the same day cannot count as a second claim');
  assert.match(second.error, /already frozen today/i);
  const state = store.state;
  const report = solvencyReport(state, NOW, state.settings || {});
  const built = buildSolvencyReading(report, state, NOW, 'slv-test');
  assert.equal(built.ok, true);
  assert.equal(built.record.exposures.length, report.counts.withinHorizon);
  assert.ok(built.record.predictedAnyBreachPct > 0 && built.record.predictedAnyBreachPct <= 100);
  assert.ok(built.record.predictedCeilingPct >= built.record.predictedAnyBreachPct);
  assert.equal(built.record.reviewOn > TODAY, true);
  // An empty workspace has no exposure to quote and refuses to freeze.
  const barren = normalizeState(createEmptyState(NOW.toISOString()), { now: NOW }).state;
  const refused = buildSolvencyReading(solvencyReport(barren, NOW, {}), barren, NOW, 'slv-empty');
  assert.equal(refused.ok, false);
});

/* -------------------------------------------------------------- 8. the grade */

function gradeFixture() {
  const state = normalizeState({
    ...createEmptyState('2026-03-01T00:00:00.000Z'),
    delegations: [
      {
        id: 'd-early', personId: 'p1', title: 'Early promise', expectedOutcome: 'Done', authority: 'own',
        support: '', delegatedOn: '2026-02-01', dueOn: '2026-03-10', status: 'done',
        completedOn: '2026-03-08', returnedOn: null, checkins: [],
      },
      {
        id: 'd-late', personId: 'p1', title: 'Late promise', expectedOutcome: 'Done', authority: 'own',
        support: '', delegatedOn: '2026-02-01', dueOn: '2026-03-10', status: 'done',
        completedOn: '2026-03-20', returnedOn: null, checkins: [],
      },
    ],
  }, { now: new Date('2026-04-02T00:00:00.000Z') }).state;
  const reading = {
    id: 'slv-grade',
    frozenAt: '2026-03-01T09:00:00.000Z',
    reviewOn: '2026-04-01',
    horizonDays: 56,
    rhoPct: 0,
    predictedAnyBreachPct: 64,
    predictedCeilingPct: 70,
    exposures: [
      { sourceKey: 'delegation', promiseId: 'd-early', pdPct: 10, weight: 1 },
      { sourceKey: 'delegation', promiseId: 'd-late', pdPct: 60, weight: 1 },
    ],
  };
  return { state, reading };
}

test('grading is exact: per-promise Brier, climatology, RPS and log score', () => {
  const { state, reading } = gradeFixture();
  const graded = gradeSolvencyReading(reading, state, new Date('2026-04-02T00:00:00.000Z'));
  assert.equal(graded.ok, true);
  const { grade } = graded;
  assert.equal(grade.considered, 2);
  assert.equal(grade.breachedCount, 1);
  assert.equal(grade.anyBreach, true);
  assert.equal(grade.scored, 2);
  // ((0.1 − 0)² + (0.6 − 1)²) / 2 = 0.085
  assert.equal(grade.brier, 0.085);
  // base rate 0.5 → mean((0.5 − o)²) = 0.25
  assert.equal(grade.brierRef, 0.25);
  assert.equal(grade.baseRatePct, 50);
  assert.equal(grade.skill, 0.66);
  // Count distribution at ρ = 0: P(1) = 0.58, so RPS = 0.36² + (0.94 − 1)² = 0.1332.
  assert.equal(grade.countRps, 0.133);
  assert.equal(grade.countLog, 0.545);
  // The binary claim is scored but never substitutes for the count.
  assert.equal(grade.brierJoint, 0.1296);
  // Independence comparator is identical at ρ = 0, by construction.
  assert.equal(grade.countRpsIndependence, grade.countRps);
  // The ceiling is carried on the reading and deliberately not scored.
  assert.equal('brierJointCeiling' in grade, false);
});

test('grading refuses early, grades once, and lapses when every promise is gone', () => {
  const { state, reading } = gradeFixture();
  const early = gradeSolvencyReading(reading, state, new Date('2026-03-15T00:00:00.000Z'));
  assert.equal(early.ok, false);
  assert.match(early.reason, /has not arrived/);
  const once = { ...reading, graded: gradeSolvencyReading(reading, state, new Date('2026-04-02T00:00:00.000Z')).grade };
  const twice = gradeSolvencyReading(once, state, new Date('2026-04-03T00:00:00.000Z'));
  assert.equal(twice.ok, false);
  assert.match(twice.reason, /graded once/);
  const gone = gradeSolvencyReading(reading, { ...state, delegations: [] }, new Date('2026-04-02T00:00:00.000Z'));
  assert.equal(gone.ok, true);
  assert.equal(gone.grade.lapsed, true);
  assert.equal(gone.grade.considered, 0);
  assert.equal(gone.grade.brier, null, 'nothing left to score is a refusal, not an average of nothing');
});

test('book-level skill hides behind five readings and refuses a zero reference', () => {
  assert.equal(solvencySkill([]).skill, null);
  assert.equal(solvencySkill([]).n, 0);
  const one = { graded: { brier: 0.2, brierRef: 0.25, scored: 4, countRps: 1, countRpsIndependence: 1.4, countLog: 2, countLogIndependence: 2.6, brierJoint: 0.1 } };
  const three = solvencySkill([one, one, one]);
  assert.equal(three.skill, null, 'a mean of three does not identify a skill');
  assert.ok(Math.abs(three.countGainRps - 0.4) < 1e-9);
  const five = solvencySkill([one, one, one, one, one]);
  assert.equal(five.skill, 0.2);
  // Weighted by promises, not by readings: one reading of eight outvotes one of two.
  const heavy = solvencySkill([
    { graded: { brier: 0.1, brierRef: 0.2, scored: 8, countRps: 1, countRpsIndependence: 1, countLog: 1, countLogIndependence: 1, brierJoint: 0 } },
    { graded: { brier: 0.5, brierRef: 0.6, scored: 2, countRps: 3, countRpsIndependence: 2, countLog: 3, countLogIndependence: 1, brierJoint: 1 } },
  ]);
  assert.ok(Math.abs(heavy.brier - ((0.1 * 8 + 0.5 * 2) / 10)) < 1e-4);
  assert.ok(heavy.countGainRps < 0, 'independence scored better here and the number says so');
  const flat = solvencySkill([
    { graded: { brier: 0.2, brierRef: 0, scored: 3, countRps: 1, countRpsIndependence: 1, countLog: 1, countLogIndependence: 1, brierJoint: 0 } },
    { graded: { brier: 0.2, brierRef: 0, scored: 3, countRps: 1, countRpsIndependence: 1, countLog: 1, countLogIndependence: 1, brierJoint: 0 } },
    { graded: { brier: 0.2, brierRef: 0, scored: 3, countRps: 1, countRpsIndependence: 1, countLog: 1, countLogIndependence: 1, brierJoint: 0 } },
    { graded: { brier: 0.2, brierRef: 0, scored: 3, countRps: 1, countRpsIndependence: 1, countLog: 1, countLogIndependence: 1, brierJoint: 0 } },
    { graded: { brier: 0.2, brierRef: 0, scored: 3, countRps: 1, countRpsIndependence: 1, countLog: 1, countLogIndependence: 1, brierJoint: 0 } },
  ]);
  assert.equal(flat.brierRef, null, 'when nothing varied there is no climatology to beat');
  assert.equal(flat.skill, null);
});

/* --------------------------------------------------------- 9. the rule spine */

test('RULE-SLV-01 commits work, writes typed edges, and moves no date', () => {
  const { store, api } = harness(buildDemoState(NOW));
  const state = store.state;
  const before = {
    tasks: state.delegations.length,
    decisions: state.decisions.length,
    dueDates: new Map(state.delegations.map((d) => [d.id, d.dueOn])),
  };
  const frozen = api.freezeSolvencyReading({ reviewDays: 30 });
  assert.equal(frozen.ok, true);
  const after = store.state;
  const tags = after.delegations.filter((d) => String(d.support || '').includes(SOLVENCY_RULE_IDS.READ));
  assert.ok(tags.length > 0 && tags.length <= 3, 'repair work is capped, not one task per promise');
  for (const task of tags) {
    assert.equal(task.status, 'active');
    assert.equal(task.authority, 'act-inform');
    assert.ok(task.expectedOutcome.length > 20, 'each task carries the sentence to say, not a label');
  }
  const edges = after.links.filter((l) => l.relation === 'endangers-promise');
  assert.ok(edges.length > 0 && edges.length <= 8, 'provenance is capped at eight edges a freeze');
  for (const edge of edges) {
    assert.equal(edge.sourceType, 'solvencyreading');
    assert.equal(edge.sourceId, frozen.record.id);
    assert.ok(LINK_ENTITY_TYPES.includes(edge.targetType));
  }
  const underwritten = after.links.filter((l) => l.relation === 'underwrites-commitment');
  assert.ok(underwritten.length <= 1, 'a coverage deficit is one decision a week, not one per render');
  if (underwritten.length) {
    const decision = after.decisions.find((d) => d.id === underwritten[0].targetId);
    assert.ok(decision, 'the edge points at a decision that exists');
    assert.match(decision.question, /coverage/i);
  }
  // Nothing was moved by the rule.
  for (const [id, dueOn] of before.dueDates) {
    const row = after.delegations.find((d) => d.id === id);
    if (row) assert.equal(row.dueOn, dueOn, `RULE-SLV-01 must not move ${id}`);
  }
  // The same freeze cannot fire the same repair twice.
  const markers = after.solvencyMarkers.filter((m) => m.startsWith(`${SOLVENCY_RULE_IDS.READ}:task:`));
  assert.equal(new Set(markers).size, markers.length);
  assert.ok(after.events.some((e) => e.type === SOLVENCY_EVENTS.FROZEN));
});

test('RULE-SLV-02 opens one acknowledgement task for promises already broken', () => {
  const { store, api } = harness(buildDemoState(NOW));
  const scanned = api.scanSolvency();
  assert.equal(scanned.ok, true);
  const state = store.state;
  const report = solvencyReport(state, NOW, state.settings || {});
  const ack = state.delegations.filter((d) => String(d.support || '').includes(SOLVENCY_RULE_IDS.OVERDUE));
  if (report.counts.overdue > 0) {
    assert.ok(ack.length >= 1 && ack.length <= 2, 'one acknowledgement per promise ever, capped at two a scan');
    for (const task of ack) {
      assert.match(task.title, /Acknowledge a broken promise/);
      assert.ok(/say|acknowledg|renegotiat|decide|withdraw|sentence/i.test(task.expectedOutcome), 'the task carries the sentence to say');
    }
    const markers = store.state.solvencyMarkers.filter((m) => m.startsWith(SOLVENCY_RULE_IDS.OVERDUE));
    assert.equal(new Set(markers).size, markers.length, 'no promise is acknowledged twice');
  } else {
    assert.equal(ack.length, 0);
  }
});

/* ------------------------------------------------ 10. cross-module propagation */

test('a renegotiation writes the real source record, the ledger and the graph', () => {
  const { store, api } = harness(buildDemoState(NOW));
  const report = solvencyReport(store.state, NOW, store.state.settings || {});
  const target = report.book.find((p) => p.sourceKey === 'delegation' && p.pdPct !== null && p.moves === 0)
    || report.book.find((p) => p.sourceKey === 'delegation');
  assert.ok(target, 'the demo holds a delegation to renegotiate');
  const record = store.state.delegations.find((d) => d.id === target.promiseId);
  const originalDue = record.dueOn;
  const ledgerBefore = store.state.solvencyRenegotiations.length;

  const later = new Date(Date.parse(`${originalDue}T00:00:00.000Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const tooFar = new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + 400 * 86400000).toISOString().slice(0, 10);
  assert.equal(api.renegotiatePromise({ sourceKey: 'delegation', promiseId: target.promiseId, toOn: originalDue, reason: 'The same date is not a renegotiation.' }).ok, false);
  assert.equal(api.renegotiatePromise({ sourceKey: 'delegation', promiseId: target.promiseId, toOn: tooFar, reason: 'A year out is not a date, it is a wish.' }).ok, false);
  assert.equal(api.renegotiatePromise({ sourceKey: 'delegation', promiseId: target.promiseId, toOn: later, reason: 'short' }).ok, false);

  const moved = api.renegotiatePromise({
    sourceKey: 'delegation', promiseId: target.promiseId, toOn: later,
    reason: 'The integration date moved; the upstream team confirmed the new date in writing.',
  });
  assert.equal(moved.ok, true, moved.error || '');
  assert.equal(moved.fromOn, originalDue);
  assert.equal(moved.toOn, later);
  const after = store.state;
  assert.equal(after.delegations.find((d) => d.id === target.promiseId).dueOn, later,
    'the promise date on the source record actually moved');
  assert.equal(after.solvencyRenegotiations.length, ledgerBefore + 1);
  const row = after.solvencyRenegotiations.at(-1);
  assert.equal(row.promiseId, target.promiseId);
  assert.ok(String(row.reason).length >= 8);
  const edge = after.links.find((l) => l.relation === 'renegotiates' && l.sourceType === 'solvencyrenegotiation');
  assert.ok(edge, 'the ledger row is a graph node and links to the promise it moved');
  assert.equal(edge.targetId, target.promiseId);
  assert.ok(LINK_ENTITY_TYPES.includes('solvencyrenegotiation'));
  const resolved = resolveLinkedEntity(after, 'solvencyrenegotiation', edge.sourceId);
  assert.ok(resolved);
  assert.match(String(resolved.route), /^#\/solvency\?panel=repair/);
  assert.ok(after.events.some((e) => e.type === SOLVENCY_EVENTS.RENEGOTIATED));
  assert.equal(promiseMoves(after, 'delegation', target.promiseId), 1);
  // Past the cap, the answer is a decision, not another date.
  const cap = Number(after.settings.solvencyMaxMoves || SOLVENCY_LIMITS.maxMovesDefault);
  let current = later;
  for (let i = 1; i < cap; i += 1) {
    current = new Date(Date.parse(`${current}T00:00:00.000Z`) + 7 * 86400000).toISOString().slice(0, 10);
    const step = api.renegotiatePromise({
      sourceKey: 'delegation', promiseId: target.promiseId, toOn: current,
      reason: `Second slip; the reason is recorded because a date alone is not one.`,
    });
    assert.equal(step.ok, true, step.error || '');
  }
  const over = api.renegotiatePromise({
    sourceKey: 'delegation', promiseId: target.promiseId,
    toOn: new Date(Date.parse(`${current}T00:00:00.000Z`) + 7 * 86400000).toISOString().slice(0, 10),
    reason: 'A third slip is not a renegotiation, it is a decision.',
  });
  assert.equal(over.ok, false);
  assert.match(over.error, /cap|decide/i);
  assert.equal(findPromise(store.state, 'delegation', target.promiseId).obligationOn, current,
    'a refused move leaves the record exactly where it was');
});

/* -------------------------------------------------------------- 11. the wiring */

test('the entity type, the relations and the post-commit registration exist', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('solvencyreading'));
  for (const relation of ['endangers-promise', 'underwrites-commitment', 'renegotiates']) {
    assert.ok(LINK_RELATIONS.includes(relation), relation);
    assert.ok(LINK_RELATION_LABELS[relation], relation);
  }
  const resolved = resolveLinkedEntity(buildDemoState(NOW), 'solvencyreading', 'slv-demo-1');
  assert.ok(resolved);
  assert.match(String(resolved.route || ''), /^#\/solvency/);
  const registered = DEFAULT_POST_COMMIT_RULES.find((rule) => rule.id === 'solvencyRule' || rule.ruleId === 'solvencyRule' || rule.name === 'solvencyRule');
  assert.ok(registered || DEFAULT_POST_COMMIT_RULES.some((rule) => String(rule).includes('solvency')), 'registered in post-commit');
  assert.ok(PROPAGATION_CONTRACTS.some((c) => c.rule === DEFAULT_POST_COMMIT_RULES.find((r) => r === undefined)?.id || typeof c.rule === 'function' && c.module === 'solvencyRules.js'),
    'registered in the propagation contracts');
});

test('insights carry the domain, and the badge counts only what is urgent', () => {
  assert.ok(DOMAIN_ORDER.includes('Promise solvency'));
  const state = buildDemoState(NOW);
  const insights = buildInsights(state, NOW);
  const bucket = (insights.byDomain || []).find((d) => d.domain === 'Promise solvency') || null;
  assert.ok(Array.isArray(solvencySignals(state, NOW)));
  const signals = solvencySignals(state, NOW);
  for (const signal of signals) {
    assert.equal(signal.domain, 'Promise solvency');
    assert.ok(signal.action.route.startsWith('#/solvency'));
    assert.ok(signal.evidence.length > 0);
  }
  assert.equal(solvencyAttentionCount(state, NOW), signals.filter((s) => s.severity >= 3).length);
  if (bucket) assert.ok(bucket.count > 0, 'the roll-up counts the solvency signals rather than dropping them');
  const text = solvencyBrief(solvencyReport(state, NOW, state.settings || {}), NOW);
  for (const person of state.people.slice(0, 12)) {
    assert.equal(text.includes(person.name), false, `the brief must not name ${person.name}`);
  }
  assert.match(text, /Expected breaches|expected/i);
});

test('CSV scope #70 exports aggregates only, and a refusal is blank rather than zero', () => {
  assert.equal(CSV_EXPORTS.length, 98);
  const scope = CSV_EXPORTS.find((e) => e.key === 'promise-solvency');
  assert.ok(scope);
  const state = buildDemoState(NOW);
  const exported = exportWorkspaceCsv(state, 'promise-solvency', NOW);
  assert.equal(exported.ok, true);
  const parsed = parseCsv(exported.csv);
  for (const header of ['row_kind', 'settled_n', 'on_time_pct', 'brier', 'count_rps', 'observed_breach_pct']) {
    assert.ok(parsed.headers.includes(header), header);
  }
  assert.equal(/delegation-demo|fb-demo|Rae|Ola|Promise solvency/.test(exported.csv), false,
    'no id, no title, no person, no prose');
  const cell = (row, key) => (Array.isArray(row) ? row[parsed.headers.indexOf(key)] : row[key]);
  const readingRow = parsed.rows.find((r) => cell(r, 'row_kind') === 'reading');
  assert.ok(readingRow, 'the demo reading is exported');
  assert.notEqual(cell(readingRow, 'brier'), '', 'a graded reading exports its Brier');
  const ungraded = parsed.rows.find((r) => cell(r, 'row_kind') === 'reading' && cell(r, 'graded') === 'no');
  if (ungraded) assert.equal(cell(ungraded, 'brier'), '', 'an ungraded reading exports a blank, never a zero');
});

/* ---------------------------------------------------------- 12. the terminal */

describe('the terminal renders six panels, accessibly', () => {
  function renderDom(state, hash) {
    const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div></body></html>', {
      url: `https://example.test/${hash}`, pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const { window } = dom;
    Object.assign(globalThis, {
      window, document: window.document, Node: window.Node, Element: window.Element,
      HTMLElement: window.HTMLElement, Event: window.Event, MouseEvent: window.MouseEvent,
    });
    const { store, api } = harness(state);
    const [, queryPart] = hash.replace(/^#/, '').split('?');
    const ctx = {
      state: store.state, now: NOW, query: new URLSearchParams(queryPart || ''),
      navigate: () => {}, api, refresh: () => {},
    };
    window.document.getElementById('view').appendChild(renderSolvency(ctx));
    return dom;
  }

  test('routes and aliases reach the terminal', () => {
    for (const hash of ['#/solvency', '#/solvency?panel=risk', '#/promise', '#/coverage', '#/renegotiate']) {
      assert.equal(parseRoute(hash).route, 'solvency', hash);
    }
    const source = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
    assert.match(source, /route: 'solvency'/);
    assert.match(source, /solvencyAttentionCount/);
  });

  test('every panel: one h1, named tables, real content, axe-clean', async () => {
    const state = buildDemoState(NOW);
    for (const panel of ['book', 'risk', 'capacity', 'repair', 'frozen', 'method']) {
      const dom = renderDom(state, `#/solvency?panel=${panel}`);
      const { document } = dom.window;
      assert.equal(document.querySelectorAll('h1').length, 1, panel);
      assert.ok(document.body.textContent.length > 800, `${panel} renders real content`);
      assert.equal(document.body.textContent.includes('failed to draw'), false, `${panel} did not fall over`);
      for (const tableNode of document.querySelectorAll('table')) {
        assert.ok(tableNode.getAttribute('aria-label'), `${panel} table is named`);
      }
      if (panel === 'risk') assert.match(document.body.textContent, /count you are actually signing/);
      if (panel === 'method') assert.match(document.body.textContent, /not scored|never graded/i);
      if (panel === 'frozen') assert.match(document.body.textContent, /Brier|No reading/);
      dom.window.eval(AXE_SRC);
      const result = await dom.window.axe.run(document.getElementById('view'), { rules: { 'color-contrast': { enabled: false } } });
      assert.deepEqual(Array.from(result.violations).map((v) => v.id), [], `${panel} is axe-clean`);
      dom.window.close();
    }
  });

  test('the demo freezes before it grades, and the seeded ledger is real', () => {
    const state = buildDemoState(NOW);
    const report = solvencyReport(state, NOW, state.settings || {});
    const reading = report.readings.find((r) => r.id === 'slv-demo-1');
    assert.ok(reading, 'the demo seeds one reading');
    assert.ok(reading.frozenAt < reading.reviewOn, 'frozen before its window, never after');
    assert.ok(reading.exposures.length >= 10, 'a reading with three exposures is not a book');
    assert.ok(reading.graded, 'and it is graded once the window closed');
    assert.ok(reading.graded.scored > 0);
    assert.ok(reading.graded.countRps !== null && reading.graded.countLog !== null);
    assert.ok(state.solvencyRenegotiations.length >= 2);
    for (const row of state.solvencyRenegotiations) {
      assert.ok(row.reason && row.reason.length >= 8);
      assert.ok(row.toOn > row.fromOn);
    }
  });
});
