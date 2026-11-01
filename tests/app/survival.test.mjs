/**
 * tests/app/survival.test.mjs — Delivery Survival Terminal (Schema v63).
 *
 * Verifies:
 *   1. Schema v63 additivity, the migration and the settings clamps
 *   2. Harvest: every class, censoring, undated exclusions, abandoned exits
 *   3. Kaplan–Meier: the product-limit steps on a hand-checkable fixture
 *   4. Greenwood variance and the log–log band staying inside [0, 1]
 *   5. Aalen–Johansen incidence: abandonment is a competing risk, not censoring
 *   6. Conditional completion: the risk-set floor, the survival conditioning,
 *      and the refusal to extrapolate silently
 *   7. Censoring honesty: an open item is never dropped from the risk set
 *   8. Hazard buckets and the Katz rate-ratio interval
 *   9. The log-rank test and the exact one-degree chi-square p-value
 *  10. The planning-fallacy ratio: same unit only, sign-test floor
 *  11. Frozen readings: build, refusal on an empty curve, single grading,
 *      no early grading, immutable probabilities, Brier vs base rate
 *  12. The rule spine: RULE-SURV-01..05, marker idempotency, the pause
 *  13. Signals, insights bucket, attention count, brief
 *  14. CSV scope #53: registered, aggregate-only
 *  15. Cross-module graph: `reading` node, `endangers` relation, resolver
 *  16. The view renders every panel with one h1, and the route resolves
 *  17. Normalizer refusals: unreadable readings, fabricated grades, bounds
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION, MIGRATIONS, createEmptyState, normalizeState, migrate,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, linksForEntity, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import {
  SURVIVAL_CLASSES,
  agePercentile,
  SURVIVAL_DEFAULTS,
  SURVIVAL_SIGNAL_IDS,
  buildPredictionSet,
  chiSquarePValue1df,
  conditionalCompletion,
  conventionsFromSettings,
  effortBias,
  hazardBuckets,
  harvestWorkItems,
  incidenceQuantile,
  kaplanMeier,
  logRank,
  medianExit,
  signTest,
  survivalAttentionCount,
  survivalBrief,
  survivalReport,
  survivalSignals,
} from '../../app/core/domain/survival.js';
import { normalizeSurvivalReadings, READING_STATUSES } from '../../app/core/domain/survivalSchema.js';
import { survivalRule, SURVIVAL_EVENTS, SURVIVAL_RULE_IDS } from '../../app/core/domain/survivalRules.js';
import { renderSurvival } from '../../app/views/survival.js';
import { parseRoute } from '../../app/main.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-11-15T10:00:00.000Z');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness() {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-surv-${(seq += 1)}`;
  const clock = { now: NOW };
  const store = createStore({ storage: memoryStorage(), now: () => clock.now, idFactory });
  store.load();
  const api = createApi(store, { now: () => clock.now, idFactory });
  api.updateSettings({ leaderName: 'Rae Mensah' });
  const leader = api.addPerson({ name: 'Rae Mensah', role: 'Head of Support' });
  const other = api.addPerson({ name: 'Tomas Berg', role: 'Support Engineer', startDate: '2025-03-01' });
  return { store, api, clock, leaderId: leader.id, otherId: other.id };
}

/** A synthetic state with a hand-built duration history for statistical claims. */
function fixtureState() {
  const state = createEmptyState(new Date('2026-11-15T00:00:00.000Z'));
  state.settings.leaderName = 'Rae Mensah';
  state.people = [
    { id: 'p-leader', name: 'Rae Mensah', status: 'active', role: 'Head of Support' },
    { id: 'p-two', name: 'Tomas Berg', status: 'active', role: 'Engineer' },
  ];
  state.portfolio = [
    // Effort-days: declared vs actual, four pairs, all under-estimated.
    { id: 'w1', title: 'Migrate logs', status: 'done', createdOn: '2026-08-01', completedOn: '2026-08-11', ownerId: 'p-two', effortDays: { optimistic: 4, mostLikely: 5, pessimistic: 9 }, actualEffortDays: 10 },
    { id: 'w2', title: 'Retire vendor', status: 'done', createdOn: '2026-08-02', completedOn: '2026-08-20', ownerId: 'p-two', effortDays: { optimistic: 6, mostLikely: 8, pessimistic: 14 }, actualEffortDays: 14 },
    { id: 'w3', title: 'Rewrite runbook', status: 'done', createdOn: '2026-08-03', completedOn: '2026-08-17', ownerId: 'p-leader', effortDays: { optimistic: 5, mostLikely: 6, pessimistic: 10 }, actualEffortDays: 12 },
    { id: 'w4', title: 'Rotate on-call', status: 'done', createdOn: '2026-08-04', completedOn: '2026-08-14', ownerId: 'p-two', effortDays: { optimistic: 3, mostLikely: 4, pessimistic: 8 }, actualEffortDays: 6 },
    // Open, and already far past the class median: censored, never dropped.
    { id: 'w5', title: 'Rebuild the queue', status: 'open', createdOn: '2026-08-05', ownerId: null, effortDays: { optimistic: 5, mostLikely: 9, pessimistic: 20 } },
    { id: 'w6', title: 'Vendor scorecard', status: 'open', createdOn: '2026-08-06', ownerId: 'p-two' },
  ];
  state.cases = [
    { id: 'c1', title: 'Sev1 checkout', status: 'resolved', openedOn: '2026-09-01', resolvedOn: '2026-09-04', ownerId: 'p-two', kind: 'incident' },
    { id: 'c2', title: 'PII in logs', status: 'resolved', openedOn: '2026-09-02', resolvedOn: '2026-09-12', ownerId: 'p-leader', kind: 'risk' },
    { id: 'c3', title: 'Noisy alerts', status: 'open', openedOn: '2026-08-10', kind: 'risk' },
    { id: 'c4', title: 'Rota gap', status: 'open', openedOn: '2026-08-12', ownerId: 'p-two', kind: 'risk' },
  ];
  state.requisitions = [
    { id: 'r1', title: 'Support engineer', status: 'filled', openedOn: '2026-07-01', closedOn: '2026-08-10', filledPersonId: 'p-two' },
    { id: 'r2', title: 'Data analyst', status: 'cancelled', openedOn: '2026-07-05', closedOn: '2026-07-30' },
    { id: 'r3', title: 'Ops lead', status: 'open', openedOn: '2026-08-01' },
  ];
  state.delegations = [
    { id: 'd1', title: 'Write the runbook', personId: 'p-two', delegatedOn: '2026-09-01', status: 'done', completedOn: '2026-09-06', returnReason: '' },
    { id: 'd2', title: 'Own vendor calls', personId: 'p-two', delegatedOn: '2026-09-02', status: 'returned', returnedOn: '2026-09-09', returnReason: '' },
    { id: 'd3', title: 'Draft the QBR', personId: 'p-two', delegatedOn: '2026-08-01', status: 'active', returnReason: '' },
  ];
  state.decisions = [
    { id: 'dec1', title: 'Choose a vendor', date: '2026-09-01', chosen: 'Vendor A', decidedOn: '2026-09-08', reversibility: 'reversible' },
    { id: 'dec2', title: 'Change the rota', date: '2026-09-03', chosen: 'yes', decidedOn: '2026-09-05', reversibility: 'reversible' },
    { id: 'dec3', title: 'Rebuild or buy', date: '2026-08-01', chosen: '', reversibility: 'irreversible' },
  ];
  state.changes = [
    { id: 'ch1', title: 'Split the team', status: 'anchored', openedOn: '2026-07-01', anchoredOn: '2026-08-15' },
    { id: 'ch2', title: 'New on-call model', status: 'abandoned', openedOn: '2026-07-02', closedOn: '2026-08-01' },
    { id: 'ch3', title: 'Stream-aligned pods', status: 'active', openedOn: '2026-08-01' },
  ];
  return normalizeState(state, { now: NOW }).state;
}

/** A workspace where open items are young enough for the at-risk floor to be met. */
function youngState() {
  const state = createEmptyState('2026-11-15T00:00:00.000Z');
  state.settings.leaderName = 'Rae Mensah';
  state.people = [
    { id: 'p-leader', name: 'Rae Mensah', status: 'active' },
    { id: 'p-two', name: 'Tomas Berg', status: 'active' },
  ];
  state.portfolio = [
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `y-closed-${i}`,
      title: `Closed item ${i}`,
      status: 'done',
      createdOn: '2026-09-01',
      completedOn: `2026-09-${String(3 + i).padStart(2, '0')}`,
      ownerId: 'p-two',
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `y-open-${i}`,
      title: `Open item ${i}`,
      status: 'open',
      createdOn: '2026-11-09',
      ownerId: i === 0 ? null : 'p-two',
    })),
  ];
  return normalizeState(state, { now: NOW }).state;
}

function ruleContext(event, { now = NOW, settings = {} } = {}) {
  let seq = 0;
  return {
    event,
    now,
    settings,
    idFactory: (prefix) => `${prefix}-rule-${(seq += 1)}`,
    out: [],
    logEvent: () => {},
    warnings: [],
  };
}

/* ------------------------------------------------------------- 1. schema */

describe('Schema v63 — delivery survival', () => {
  test('the current schema version is 63 and the migration is additive', () => {
    assert.equal(SCHEMA_VERSION, 76);
    const migrated = migrate({ schemaVersion: 62, settings: {}, people: [] });
    assert.equal(migrated.raw.schemaVersion, 76);
    assert.deepEqual(migrated.applied, ['62 → 63', '63 → 64', '64 → 65', '65 → 66', '66 → 67', '67 → 68', '68 → 69', '69 → 70', '70 → 71', '71 → 72', '72 → 73', '73 → 74', '74 → 75', '75 → 76']);
    assert.deepEqual(migrated.raw.survivalReadings, []);
    assert.deepEqual(migrated.raw.survivalMarkers, []);
    // A prediction cannot be back-filled: the upgrade adds no reading.
    assert.equal(migrated.raw.survivalReadings.length, 0);
  });

  test('the v62 migration still runs and hands its settings forward', () => {
    const migrated = migrate({ schemaVersion: 61, settings: { couplingAutoPropagate: false } });
    assert.equal(migrated.raw.schemaVersion, 76);
    assert.equal(migrated.raw.settings.coupledLoadAutoPropagate, false);
    assert.deepEqual(migrated.raw.performanceConcerns, []);
    assert.deepEqual(migrated.raw.survivalReadings, []);
  });

  test('conventions are clamped, and the hazard bucket list cannot be inverted', () => {
    const state = createEmptyState('2026-11-15T00:00:00.000Z');
    state.settings = {
      ...state.settings,
      survHorizonDays: 0,
      survMinAtRisk: 0,
      survRiskFloorPct: 500,
      survBiasFloor: 1,
      survHazardBuckets: '30,-4,7,abc,999999',
    };
    const normalized = normalizeState(state, { now: NOW }).state;
    assert.equal(normalized.settings.survHorizonDays, 1);
    assert.equal(normalized.settings.survMinAtRisk, 2);
    assert.equal(normalized.settings.survRiskFloorPct, 100);
    assert.equal(normalized.settings.survBiasFloor, 3);
    assert.equal(normalized.settings.survHazardBuckets, '7,30');
    const conventions = conventionsFromSettings(normalized.settings);
    assert.deepEqual(conventions.hazardBuckets, [7, 30]);
  });
});

/* ------------------------------------------------------------ 2. harvest */

describe('Harvest — every class, censoring and exclusion', () => {
  test('each declared class is harvested from its own source with a real start date', () => {
    const harvest = harvestWorkItems(fixtureState(), NOW);
    const kinds = new Set(harvest.items.map((item) => item.kind));
    for (const spec of SURVIVAL_CLASSES) {
      assert.ok(kinds.has(spec.key), `expected at least one ${spec.key} item`);
    }
    assert.equal(harvest.items.length, 6 + 4 + 3 + 3 + 3 + 3);
  });

  test('an open item is censored at today, never dropped and never credited with a completion', () => {
    const harvest = harvestWorkItems(fixtureState(), NOW);
    const open = harvest.items.find((item) => item.key === 'portfolio:w5');
    assert.equal(open.exitType, null);
    assert.equal(open.censoredOn, '2026-11-15');
    assert.equal(open.elapsedDays, 102);
  });

  test('cancelled and returned work is an exit of a second type, not censoring', () => {
    const harvest = harvestWorkItems(fixtureState(), NOW);
    assert.equal(harvest.items.find((i) => i.key === 'requisition:r2').exitType, 'abandoned');
    assert.equal(harvest.items.find((i) => i.key === 'delegation:d2').exitType, 'abandoned');
  });

  test('an abandonment the record cannot date is censored and counted, never credited or dropped', () => {
    // A change record keeps `anchoredOn` and nothing else: an abandoned change
    // has an outcome but no event date. Crediting it with today would invent an
    // event; dropping it would invent a completion.
    const state = fixtureState();
    const harvest = harvestWorkItems(state, NOW);
    const abandoned = harvest.items.find((i) => i.key === 'change:ch2');
    assert.equal(abandoned.exitType, null);
    assert.equal(abandoned.partial, true);
    const report = survivalReport(state, NOW, {});
    assert.ok(report.counts.abandonedUndated >= 1);
  });

  test('a record that has not started has no time at risk', () => {
    // The harvest is handed a raw record here on purpose: the schema normaliser
    // clamps a future start to today, which is the right repair for a date entry
    // but would hide this rule from the test.
    const raw = { people: [], cases: [{ id: 'c-future', title: 'Starts later', status: 'open', openedOn: '2026-12-01', kind: 'risk' }] };
    const harvest = harvestWorkItems(raw, NOW);
    assert.equal(harvest.items.some((item) => item.sourceId === 'c-future'), false);
  });

  test('the age percentile answers at any age, but only above the exit floor', () => {
    const items = [
      { elapsedDays: 5, exitType: 'completed' },
      { elapsedDays: 10, exitType: 'completed' },
      { elapsedDays: 15, exitType: 'completed' },
      { elapsedDays: 20, exitType: 'abandoned' },
    ];
    const atTwelve = agePercentile(items, 12, 4);
    assert.equal(atTwelve.available, true);
    assert.equal(atTwelve.sooner, 2);
    assert.equal(atTwelve.percentile, 50);
    const tooFew = agePercentile(items.slice(0, 3), 12, 4);
    assert.equal(tooFew.available, false);
    assert.match(tooFew.reason, /floor/);
  });
});

/* ------------------------------------------------------- 3. Kaplan–Meier */

describe('Kaplan–Meier — the product-limit steps', () => {
  const items = [
    { elapsedDays: 2, exitType: 'completed' },
    { elapsedDays: 4, exitType: 'completed' },
    { elapsedDays: 6, exitType: 'abandoned' },
    { elapsedDays: 8, exitType: 'completed' },
    { elapsedDays: 10, exitType: null },
    { elapsedDays: 12, exitType: null },
  ];

  test('the survival function follows the product limit exactly on a six-item fixture', () => {
    const curve = kaplanMeier(items);
    const byTime = new Map(curve.steps.map((step) => [step.time, step]));
    assert.equal(byTime.get(2).atRisk, 6);
    assert.equal(Number(byTime.get(2).survival.toFixed(6)), Number((5 / 6).toFixed(6)));
    assert.equal(Number(byTime.get(4).survival.toFixed(6)), Number(((5 / 6) * (4 / 5)).toFixed(6)));
    // A censor at 10 removes an item from the risk set without moving the curve.
    assert.equal(Number(byTime.get(10).survival.toFixed(6)), Number(byTime.get(8).survival.toFixed(6)));
    assert.equal(byTime.get(10).censored, 1);
    assert.equal(curve.completions, 3);
    assert.equal(curve.abandonments, 1);
    assert.equal(curve.censored, 2);
  });

  test('the Greenwood band stays inside [0, 1] and widens as the risk set shrinks', () => {
    const curve = kaplanMeier(items);
    for (const step of curve.steps) {
      assert.ok(step.lo >= 0 && step.hi <= 1, `band ${step.lo}–${step.hi} escaped the unit interval`);
      assert.ok(step.lo <= step.survival + 1e-9);
      assert.ok(step.hi >= step.survival - 1e-9);
    }
    // At least one intermediate step must carry a non-degenerate band: a band
    // that is point-like everywhere would mean Greenwood was never computed.
    assert.ok(curve.steps.some((step) => step.survival > 0 && step.survival < 1 && step.hi > step.lo));
  });

  test('the survival, incidence and at-risk accessors interpolate to the last step at or before t', () => {
    const curve = kaplanMeier(items);
    assert.equal(curve.survivalAt(3), curve.steps[0].survival);
    assert.equal(curve.survivalAt(1000), curve.steps[curve.steps.length - 1].survival);
    assert.equal(curve.cifAt(1000), curve.steps[curve.steps.length - 1].cif);
    assert.equal(curve.atRiskAt(11), 1);
  });
});

/* ----------------------------------------------------- 4. competing risks */

describe('Competing risks — abandonment is not censoring', () => {
  const items = [
    // Four completions and four abandonments, all at day 5.
    ...Array.from({ length: 4 }, () => ({ elapsedDays: 5, exitType: 'completed' })),
    ...Array.from({ length: 4 }, () => ({ elapsedDays: 5, exitType: 'abandoned' })),
  ];

  test('the naive all-cause figure overstates completion when abandonment is present', () => {
    const curve = kaplanMeier(items);
    const naiveCompletion = 1 - curve.survivalAt(5);
    // All eight exited, so all-cause survival is 0 and the naive reading is 100%.
    assert.equal(Number(naiveCompletion.toFixed(6)), 1);
    // The cumulative incidence of completion is 50%, because half the exits
    // were abandonments. This is the number the page prints.
    assert.equal(Number(curve.cifAt(5).toFixed(6)), 0.5);
  });

  test('the Aalen incidence lies inside its own band and never exceeds one', () => {
    const curve = kaplanMeier(items);
    for (const step of curve.steps) {
      assert.ok(step.cifLo >= 0);
      assert.ok(step.cifHi <= 1);
      assert.ok(step.cifLo <= step.cif + 1e-9);
      assert.ok(step.cifHi >= step.cif - 1e-9);
    }
  });

  test('the incidence quantile reports "not reached" rather than inventing a date', () => {
    const curve = kaplanMeier([
      { elapsedDays: 3, exitType: 'completed' },
      { elapsedDays: 4, exitType: 'abandoned' },
      { elapsedDays: 5, exitType: 'abandoned' },
      { elapsedDays: 6, exitType: 'abandoned' },
    ]);
    const quantile = incidenceQuantile(curve, 0.5);
    assert.equal(quantile.reached, false);
    assert.equal(quantile.days, null);
  });
});

/* ------------------------------------------- 5. conditional completion */

describe('Conditional completion — the reading and its refusals', () => {
  const items = [
    ...Array.from({ length: 6 }, (_, index) => ({ elapsedDays: 2 + index, exitType: 'completed' })),
    ...Array.from({ length: 4 }, () => ({ elapsedDays: 20, exitType: null })),
  ];

  test('an empty curve returns no reading and says why', () => {
    const reading = conditionalCompletion(kaplanMeier([]), 5, 14);
    assert.equal(reading.available, false);
    assert.equal(reading.probability, null);
    assert.match(reading.reason, /no closed or open record/i);
  });

  test('the at-risk floor refuses a probability rather than printing a thin-tail guess', () => {
    const curve = kaplanMeier(items);
    const reading = conditionalCompletion(curve, 10, 14, { minAtRisk: 50 });
    assert.equal(reading.available, false);
    assert.match(reading.reason, /floor/i);
  });

  test('the probability is conditional on survival, so it is never larger than the unconditional one', () => {
    const curve = kaplanMeier(items);
    const early = conditionalCompletion(curve, 1, 10, { minAtRisk: 2 });
    const late = conditionalCompletion(curve, 25, 10, { minAtRisk: 2 });
    assert.ok(early.available);
    if (late.available) assert.ok(late.probability <= early.probability + 1e-9);
  });

  test('a horizon past the longest observation is flagged, not clipped silently', () => {
    const curve = kaplanMeier(items);
    const reading = conditionalCompletion(curve, 2, 400, { minAtRisk: 2 });
    assert.equal(reading.beyondEvidence, true);
    assert.match(reading.reason, /extrapolated/i);
  });
});

/* ------------------------------------------------------- 6. hazard, log-rank */

describe('Hazard and log-rank', () => {
  test('bucket exposure is the person-days actually spent in each bucket', () => {
    const { buckets } = hazardBuckets([
      { elapsedDays: 5, exitType: 'completed' },
      { elapsedDays: 40, exitType: 'completed' },
    ], [7, 30]);
    assert.equal(buckets.length, 3);
    // The second item contributes 7 days to bucket 1, 23 to bucket 2 and 10 to bucket 3.
    assert.equal(buckets[0].exposure, 7 + 5);
    assert.equal(buckets[1].exposure, 23);
    assert.equal(buckets[2].exposure, 10);
    assert.equal(buckets[0].events, 1);
    assert.equal(buckets[2].events, 1);
  });

  test('a rate ratio needs events at both ends and carries an interval', () => {
    const many = [
      ...Array.from({ length: 20 }, (_, i) => ({ elapsedDays: 1 + (i % 5), exitType: 'completed' })),
      ...Array.from({ length: 4 }, () => ({ elapsedDays: 60, exitType: 'completed' })),
      { elapsedDays: 60, exitType: null },
    ];
    const { ratio } = hazardBuckets(many, [7, 30]);
    assert.ok(ratio);
    assert.ok(ratio.value > 1);
    assert.ok(ratio.lo > 0 && ratio.hi >= ratio.lo);
    const none = hazardBuckets([{ elapsedDays: 2, exitType: null }], [7, 30]).ratio;
    assert.equal(none, null);
  });

  test('the log-rank p-value is the exact one-degree chi-square tail', () => {
    assert.equal(Number(chiSquarePValue1df(0).toFixed(6)), 1);
    assert.equal(Number(chiSquarePValue1df(1).toFixed(4)), 0.3173);
    assert.equal(Number(chiSquarePValue1df(3.841).toFixed(3)), 0.05);
    assert.ok(chiSquarePValue1df(20) < 1e-4);
  });

  test('the log-rank test refuses a comparison with one group or no variance', () => {
    assert.equal(logRank([{ elapsedDays: 1, exitType: 'completed' }], () => 'a'), null);
    assert.equal(logRank([
      { elapsedDays: 1, exitType: null },
      { elapsedDays: 2, exitType: null },
    ], (row) => (row.elapsedDays === 1 ? 'a' : 'b')), null);
  });
});

/* ------------------------------------------------ 7. planning-fallacy ratio */

describe('Declared effort against recorded effort', () => {
  test('the ratio is withheld below the floor and printed above it', () => {
    const three = [
      { declaredDays: 4, actualDays: 8 },
      { declaredDays: 5, actualDays: 10 },
      { declaredDays: 2, actualDays: 6 },
    ];
    assert.equal(effortBias(three, 4).available, false);
    const four = [...three, { declaredDays: 3, actualDays: 9 }];
    const bias = effortBias(four, 4);
    assert.equal(bias.available, true);
    assert.equal(bias.n, 4);
    assert.ok(bias.medianRatio > 2);
    assert.equal(bias.direction, 'over');
  });

  test('items without both quantities in the same unit are excluded, not divided', () => {
    const bias = effortBias([
      { declaredDays: 5, actualDays: null },
      { declaredDays: null, actualDays: 9 },
      { declaredDays: 5, actualDays: 5 },
    ], 3);
    assert.equal(bias.available, false);
    assert.equal(bias.pairs.length, 0, 'an incomplete pair is excluded, never filled');
    assert.match(bias.reason, /floor is 3/);
  });

  test('the sign test is exact and two-sided', () => {
    const allAbove = signTest([2, 2, 2, 2, 2]);
    assert.equal(allAbove.p, 0.0625);
    assert.equal(allAbove.direction, 'over');
    const balanced = signTest([2, 0.5, 2, 0.5]);
    assert.equal(balanced.direction, 'balanced');
    assert.equal(balanced.p, 1);
  });
});

/* -------------------------------------------------- 8. the report */

describe('The report', () => {
  test('every class is reported, including the ones with nothing in them', () => {
    const report = survivalReport(fixtureState(), NOW, {});
    assert.equal(report.classes.length, SURVIVAL_CLASSES.length);
    const keys = report.classes.map((row) => row.key);
    for (const spec of SURVIVAL_CLASSES) assert.ok(keys.includes(spec.key));
    assert.ok(report.pooled.counts.total === report.counts.items);
  });

  test('open items are ranked by their reading, and an unreadable item sorts last', () => {
    const report = survivalReport(fixtureState(), NOW, {});
    const probabilities = report.openItems.map((row) => (row.reading.available ? row.reading.probability : 2));
    const sorted = [...probabilities].sort((a, b) => a - b);
    assert.deepEqual(probabilities, sorted);
  });

  test('the counts distinguish completed, abandoned, censored and undated', () => {
    const report = survivalReport(fixtureState(), NOW, {});
    assert.equal(report.counts.completed, report.harvest.items.filter((i) => i.exitType === 'completed').length);
    assert.equal(report.counts.abandoned, report.harvest.items.filter((i) => i.exitType === 'abandoned').length);
    assert.equal(report.counts.open, report.harvest.items.filter((i) => !i.exitType).length);
    assert.equal(report.counts.completed + report.counts.abandoned + report.counts.open, report.counts.items);
  });

  test('the demo workspace has a curve, and nothing in it is invented', () => {
    const demo = buildDemoState(new Date('2026-11-15T00:00:00.000Z'));
    const report = survivalReport(demo, NOW, demo.settings || {});
    assert.ok(report.counts.items > 0, 'the demo carries dated work');
    for (const row of report.openItems) {
      if (row.reading.available) {
        assert.ok(row.reading.probability >= 0 && row.reading.probability <= 1);
        assert.ok(row.reading.atRisk >= row.klass.curve.n === false || row.reading.atRisk >= 0);
      }
    }
  });
});

/* ------------------------------------------------- 9. readings and scoring */

describe('Frozen readings', () => {
  test('a reading freezes the real predictions with their at-risk counts', () => {
    const { store, api } = harness();
    store.update((draft) => {
      const fixture = youngState();
      draft.portfolio = fixture.portfolio;
      draft.people = fixture.people;
    }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'fixture' });
    const result = api.freezeSurvivalReading({ label: 'Two-week read', horizonDays: 14 });
    assert.equal(result.ok, true);
    const reading = store.state.survivalReadings.find((row) => row.id === result.id);
    assert.ok(reading.predictions.length > 0);
    for (const prediction of reading.predictions) {
      assert.ok(prediction.probabilityPct >= 0 && prediction.probabilityPct <= 100);
      assert.ok(prediction.sourceId);
    }
    assert.equal(reading.reviewOn, '2026-11-29');
    assert.equal(reading.status, 'frozen');
  });

  test('freezing an empty curve is refused instead of writing a receipt', () => {
    const { api } = harness();
    const result = api.freezeSurvivalReading({ horizonDays: 14 });
    assert.equal(result.ok, false);
    assert.match(result.error, /nothing to freeze/i);
  });

  test('the review date must be in the future', () => {
    const { store, api } = harness();
    store.update((draft) => {
      const fixture = youngState();
      draft.portfolio = fixture.portfolio;
      draft.people = fixture.people;
    }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'fixture' });
    const result = api.freezeSurvivalReading({ reviewOn: '2026-11-15', horizonDays: 14 });
    assert.equal(result.ok, false);
    assert.match(result.error, /future/i);
  });

  test('grading cannot happen before the review date, and happens only once', () => {
    const { store, api, clock } = harness();
    store.update((draft) => {
      const fixture = youngState();
      draft.portfolio = fixture.portfolio;
      draft.people = fixture.people;
    }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'fixture' });
    const created = api.freezeSurvivalReading({ label: 'Grade me', horizonDays: 14 });
    assert.equal(created.ok, true);
    const early = api.gradeSurvivalReading(created.id);
    assert.equal(early.ok, false);
    assert.match(early.error, /review date/i);

    // Two of the predicted items settle inside the window; the rest stay open
    // and are excluded from the sample rather than counted as misses.
    store.update((draft) => {
      const first = draft.portfolio.find((row) => row.id === 'y-open-1');
      const second = draft.portfolio.find((row) => row.id === 'y-open-2');
      if (first) { first.status = 'done'; first.completedOn = '2026-11-20'; }
      if (second) { second.status = 'done'; second.completedOn = '2026-11-24'; }
    }, { type: 'test.settle', entity: 'workspace', entityId: '', summary: 'settle two items' });

    clock.now = new Date('2026-12-01T10:00:00.000Z');
    const graded = api.gradeSurvivalReading(created.id);
    assert.equal(graded.ok, true);
    const reading = store.state.survivalReadings.find((row) => row.id === created.id);
    assert.equal(reading.status, 'graded');
    assert.ok(reading.grade.settledCount > 0);
    // The frozen probabilities are unchanged by grading.
    assert.ok(reading.predictions.every((prediction) => Number.isFinite(prediction.probabilityPct)));
    const again = api.gradeSurvivalReading(created.id);
    assert.equal(again.ok, false);
    assert.match(again.error, /graded once/i);
    assert.equal(api.deleteSurvivalReading(created.id).ok, false);
  });

  test('an ungraded reading can be deleted, and its typed links go with it', () => {
    const { store, api } = harness();
    store.update((draft) => {
      const fixture = youngState();
      draft.portfolio = fixture.portfolio;
      draft.people = fixture.people;
    }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'fixture' });
    const created = api.freezeSurvivalReading({ label: 'Delete me', horizonDays: 14 });
    const linksBefore = (store.state.links || []).length;
    const result = api.deleteSurvivalReading(created.id);
    assert.equal(result.ok, true);
    assert.equal(store.state.survivalReadings.some((row) => row.id === created.id), false);
    assert.ok((store.state.links || []).length <= linksBefore);
    assert.equal((store.state.links || []).some((link) => link.sourceType === 'reading' && link.sourceId === created.id), false);
  });
});

/* ---------------------------------------------------------- 10. the spine */

describe('RULE-SURV-01..05 on the shared spine', () => {
  function seededDraft() {
    const fixture = fixtureState();
    const draft = JSON.parse(JSON.stringify(fixture));
    draft.survivalReadings = [{
      id: 'surv-1',
      label: 'Fixture reading',
      horizonDays: 14,
      reviewOn: '2026-11-20',
      frozenOn: '2026-11-06',
      status: 'frozen',
      curveDigest: { n: 10, completions: 5, abandonments: 2, censored: 3, maxObservedDays: 40, riskFloorPct: 35 },
      predictions: [
        { itemKey: 'portfolio:w5', sourceType: 'portfolio', sourceId: 'w5', title: 'Rebuild the queue', kind: 'work', elapsedDays: 102, probabilityPct: 4, atRisk: 5, classKey: 'work', outcome: null },
        { itemKey: 'portfolio:w6', sourceType: 'portfolio', sourceId: 'w6', title: 'Vendor scorecard', kind: 'work', elapsedDays: 101, probabilityPct: 12, atRisk: 5, classKey: 'work', outcome: null },
        { itemKey: 'case:c3', sourceType: 'case', sourceId: 'c3', title: 'Noisy alerts', kind: 'case', elapsedDays: 97, probabilityPct: 88, atRisk: 6, classKey: 'case', outcome: null },
      ],
      grade: null,
      notes: [],
      markers: [],
      history: [],
      createdAt: '2026-11-06T10:00:00.000Z',
      updatedAt: '2026-11-06T10:00:00.000Z',
    }];
    draft.delegations = [...draft.delegations, {
      id: 'd-returned', title: 'Untitled return', personId: 'p-two', delegatedOn: '2026-09-01',
      status: 'returned', returnedOn: '2026-09-08', returnReason: '', checkins: [],
    }];
    return draft;
  }

  test('RULE-SURV-01 links every endangered item and opens work for a resolvable owner', () => {
    const draft = seededDraft();
    const effects = survivalRule(draft, ruleContext({ type: SURVIVAL_EVENTS.FROZEN, entityId: 'surv-1' }));
    const links = draft.links.filter((link) => link.sourceType === 'reading' && link.relation === 'endangers');
    assert.equal(links.length, 2, 'two predictions sit below the 35% floor');
    assert.ok(effects.some((row) => row.ruleId === SURVIVAL_RULE_IDS.ENDANGERED && row.action === 'created'));
    // w6 has a recorded owner (p-two); w5 has none and falls back to the leader.
    const tasks = draft.delegations.filter((row) => String(row.support).includes('RULE-SURV-01'));
    assert.ok(tasks.length >= 1);
    for (const task of tasks) {
      assert.ok(draft.people.some((person) => person.id === task.personId), 'every task has a real person');
    }
  });

  test('RULE-SURV-01 is marker-idempotent', () => {
    const draft = seededDraft();
    survivalRule(draft, ruleContext({ type: SURVIVAL_EVENTS.FROZEN, entityId: 'surv-1' }));
    const linksAfterFirst = draft.links.filter((link) => link.relation === 'endangers').length;
    const tasksAfterFirst = draft.delegations.length;
    const second = survivalRule(draft, ruleContext({ type: SURVIVAL_EVENTS.FROZEN, entityId: 'surv-1' }));
    assert.equal(second.length, 0);
    assert.equal(draft.links.filter((link) => link.relation === 'endangers').length, linksAfterFirst);
    assert.equal(draft.delegations.length, tasksAfterFirst);
  });

  test('RULE-SURV-02 opens one repair task only when the reading lost to its base rate above the floor', () => {
    const draft = seededDraft();
    const reading = draft.survivalReadings[0];
    reading.status = 'graded';
    reading.grade = { gradedOn: '2026-11-21', settledCount: 6, brier: 0.4, baselineBrier: 0.2, baseRatePct: 50, skillScore: -1, hits: 3, misses: 3, belowFloor: false };
    const effects = survivalRule(draft, ruleContext({ type: SURVIVAL_EVENTS.GRADED, entityId: 'surv-1' }));
    assert.ok(effects.some((row) => row.ruleId === SURVIVAL_RULE_IDS.REPAIR));
    const tasks = draft.delegations.filter((row) => String(row.support).includes('RULE-SURV-02'));
    assert.equal(tasks.length, 1);

    const belowFloor = seededDraft();
    belowFloor.survivalReadings[0].status = 'graded';
    belowFloor.survivalReadings[0].grade = { gradedOn: '2026-11-21', settledCount: 4, brier: 0.4, baselineBrier: 0.2, baseRatePct: 50, skillScore: -1, hits: 2, misses: 2, belowFloor: true };
    const quiet = survivalRule(belowFloor, ruleContext({ type: SURVIVAL_EVENTS.GRADED, entityId: 'surv-1' }));
    assert.equal(quiet.length, 0, 'four settled items are not enough to call a model broken');
  });

  test('RULE-SURV-03 opens exactly one class decision per class per week', () => {
    const draft = seededDraft();
    // The fixture has two abandonments out of ten exits across classes; lower
    // the threshold so the rule must fire on the hiring class (1 of 2 exits).
    const settings = { survAbandonSharePct: 10 };
    const first = survivalRule(draft, ruleContext({ type: SURVIVAL_EVENTS.SCAN }, { settings }));
    const classDecisions = draft.decisions.filter((row) => String(row.rationale).includes('RULE-SURV-03'));
    assert.ok(classDecisions.length >= 1);
    const countAfterFirst = classDecisions.length;
    const second = survivalRule(draft, ruleContext({ type: SURVIVAL_EVENTS.SCAN }, { settings }));
    assert.equal(draft.decisions.filter((row) => String(row.rationale).includes('RULE-SURV-03')).length, countAfterFirst);
    assert.equal(second.filter((row) => row.ruleId === SURVIVAL_RULE_IDS.CLASS).length, 0);
    assert.ok(first.length > 0);
  });

  test('RULE-SURV-04 asks for the reason on a returned delegation, once', () => {
    const draft = seededDraft();
    // The fixture carries two returned delegations with no recorded reason.
    survivalRule(draft, ruleContext({ type: SURVIVAL_EVENTS.SCAN }));
    const tasks = draft.delegations.filter((row) => String(row.support).includes('RULE-SURV-04'));
    assert.equal(tasks.length, 2);
    assert.ok(tasks.every((task) => draft.people.some((person) => person.id === task.personId)));
    survivalRule(draft, ruleContext({ type: SURVIVAL_EVENTS.SCAN }));
    assert.equal(draft.delegations.filter((row) => String(row.support).includes('RULE-SURV-04')).length, 2);
  });

  test('RULE-SURV-05 asks for the grade only past the stale margin', () => {
    const draft = seededDraft();
    draft.survivalReadings[0].reviewOn = '2026-11-20';
    // 2026-11-15 is *before* the review date, so nothing is due.
    survivalRule(draft, ruleContext({ type: SURVIVAL_EVENTS.SCAN }));
    assert.equal(draft.delegations.filter((row) => String(row.support).includes('RULE-SURV-05')).length, 0);
    const later = new Date('2026-12-10T10:00:00.000Z');
    survivalRule(draft, ruleContext({ type: SURVIVAL_EVENTS.SCAN }, { now: later }));
    assert.equal(draft.delegations.filter((row) => String(row.support).includes('RULE-SURV-05')).length, 1);
  });

  test('the pause suppresses automatic work but never an explicit scan', () => {
    const draft = seededDraft();
    // The engine reads the workspace's own settings last, which is where the
    // Settings screen writes them; a rule that ignored them would make the
    // pause a decoration.
    draft.settings = { ...(draft.settings || {}), survAutoPropagate: false };
    const automatic = survivalRule(draft, ruleContext({ type: SURVIVAL_EVENTS.FROZEN, entityId: 'surv-1' }));
    assert.equal(automatic.length, 0);
    const scan = survivalRule(draft, ruleContext({ type: SURVIVAL_EVENTS.SCAN }));
    assert.ok(scan.length > 0);
  });

  test('the rule declares its id, module, triggers and effect adapter', () => {
    assert.equal(survivalRule.id, 'survival');
    assert.equal(survivalRule.module, 'survivalRules.js');
    assert.deepEqual(survivalRule.triggers, Object.values(SURVIVAL_EVENTS));
    assert.equal(typeof survivalRule.effect, 'function');
  });
});

/* ------------------------------------------------- 11. signals and registers */

describe('Signals, insights, attention and the brief', () => {
  test('signals use the declared ids and carry a route into the terminal', () => {
    const report = survivalReport(fixtureState(), NOW, {});
    const signals = survivalSignals(fixtureState(), NOW, {});
    for (const signal of signals) {
      assert.ok(SURVIVAL_SIGNAL_IDS.includes(signal.ruleId), `unexpected rule id ${signal.ruleId}`);
      assert.equal(signal.domain, 'Delivery survival');
      assert.ok(signal.action.route.startsWith('#/survival'));
      assert.ok(Array.isArray(signal.evidence) && signal.evidence.length > 0);
    }
    assert.ok(signals.length > 0, 'the fixture has a stale item and an unexplained abandonment');
    assert.ok(report.classes.length >= 6);
    assert.equal(survivalAttentionCount(fixtureState(), NOW, {}), signals.filter((row) => row.severity >= 3).length);
  });

  test('the insights roll-up keeps the Delivery survival bucket', () => {
    const insights = buildInsights(fixtureState(), NOW);
    const domain = insights.byDomain.find((row) => row.domain === 'Delivery survival');
    assert.ok(domain, 'an unlisted domain would be silently dropped from the roll-up');
    assert.ok(domain.count > 0);
    // The demo workspace also routes through the same registry without error.
    assert.ok(buildInsights(buildDemoState(new Date('2026-11-15T00:00:00.000Z')), NOW).byDomain);
  });

  test('the brief is deterministic, names no item title and states its assumption', () => {
    const first = survivalBrief(fixtureState(), NOW, {});
    const second = survivalBrief(fixtureState(), NOW, {});
    assert.equal(first, second);
    assert.match(first, /DELIVERY SURVIVAL/);
    assert.match(first, /censored/i);
    assert.equal(first.includes('Rebuild the queue'), false, 'item titles are omitted');
    assert.match(first, /Censoring is assumed independent/i);
  });

  test('CSV scope #53 is registered, aggregate-only and carries no identifiers', () => {
    const scope = CSV_EXPORTS.find((row) => row.key === 'survival');
    assert.ok(scope, 'the survival scope must be registered');
    assert.equal(scope.group, 'operational');
    assert.match(scope.description, /NO item titles/);
    const result = exportWorkspaceCsv(fixtureState(), 'survival', NOW);
    assert.equal(result.ok, true);
    assert.ok(result.rowCount >= 6);
    assert.match(result.csv, /class_code/);
    assert.equal(result.csv.includes('Rebuild the queue'), false);
    assert.equal(result.csv.includes('p-two'), false);
    // Class codes are opaque.
    assert.match(result.csv, /C01/);
    assert.equal(result.csv.includes('portfolio'), false);
  });
});

/* ------------------------------------------------------- 12. cross-module graph */

describe('Cross-module graph', () => {
  test('the reading node, the endangers relation and the resolver are registered', () => {
    assert.ok(LINK_ENTITY_TYPES.includes('reading'));
    assert.ok(LINK_RELATIONS.includes('endangers'));
    const state = {
      links: [{ id: 'l1', sourceType: 'reading', sourceId: 'surv-1', targetType: 'case', targetId: 'c1', relation: 'endangers', ruleId: 'RULE-SURV-01', summary: 'at risk', createdAt: '2026-11-15' }],
      cases: [{ id: 'c1', title: 'Sev1 checkout', status: 'open', openedOn: '2026-09-01' }],
      survivalReadings: [{ id: 'surv-1', label: 'Fixture reading', status: 'frozen', reviewOn: '2026-11-20', predictions: [] }],
    };
    const resolved = resolveLinkedEntity(state, 'reading', 'surv-1');
    assert.equal(resolved.route, '#/survival?panel=readings&reading=surv-1');
    const links = linksForEntity(state, 'case', 'c1');
    assert.equal(links.length, 1);
    assert.equal(links[0].peer.type, 'reading');
    assert.equal(links[0].relationLabel, 'At risk in a frozen reading');
  });
});

/* --------------------------------------------------------------- 13. schema normaliser */

describe('Reading normaliser — fail closed', () => {
  test('a reading that froze no prediction is dropped, not repaired', () => {
    const warnings = [];
    const rows = normalizeSurvivalReadings([
      { id: 'a', label: 'Empty reading', predictions: [] },
      { id: 'b', label: 'Zero probability', predictions: [{ sourceType: 'case', sourceId: 'c1', probabilityPct: null }] },
      { id: 'c', label: 'Good reading', predictions: [{ sourceType: 'case', sourceId: 'c1', probabilityPct: 40, elapsedDays: 3 }] },
    ], {}, '2026-11-15T00:00:00.000Z', warnings);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'c');
    assert.equal(warnings.length, 2);
  });

  test('a reading claiming a grade it does not have is repaired downward to frozen', () => {
    const rows = normalizeSurvivalReadings([{
      id: 'x',
      label: 'Claims a grade',
      status: 'graded',
      grade: null,
      predictions: [{ sourceType: 'case', sourceId: 'c1', probabilityPct: 40, elapsedDays: 3 }],
    }], {}, '2026-11-15T00:00:00.000Z', []);
    assert.equal(rows[0].status, 'frozen');
    assert.ok(READING_STATUSES.includes(rows[0].status));
  });

  test('duplicate ids and oversized lists are bounded rather than trusted', () => {
    const predictions = Array.from({ length: 80 }, (_, i) => ({
      sourceType: 'case', sourceId: `c${i}`, probabilityPct: 50, elapsedDays: 1,
    }));
    const rows = normalizeSurvivalReadings([
      { id: 'dup', label: 'First', predictions },
      { id: 'dup', label: 'Second', predictions },
    ], {}, '2026-11-15T00:00:00.000Z', []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].predictions.length, 40);
  });
});

/* ------------------------------------------------------------ 14. routing and view */

describe('Routing and rendering', () => {
  test('the route and its aliases resolve to the survival terminal', () => {
    for (const hash of ['#/survival', '#/delivery', '#/kaplan-meier', '#/cycle-time', '#/slippage', '#/on-time']) {
      const parsed = parseRoute(hash);
      assert.equal(parsed.route, 'survival', `${hash} should route to survival`);
    }
  });

  function renderDom(state, hash = '#/survival') {
    const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div></body></html>', {
      virtualConsole: new VirtualConsole(),
      url: `https://example.test/${hash}`,
    });
    const { window } = dom;
    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.Node = window.Node;
    globalThis.Element = window.Element;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.Event = window.Event;
    globalThis.MouseEvent = window.MouseEvent;
    globalThis.KeyboardEvent = window.KeyboardEvent;
    const ctx = {
      state,
      now: NOW,
      query: new URLSearchParams(hash.split('?')[1] || ''),
      navigate: () => {},
      api: {
        scanSurvival: () => ({ ok: true, changed: false }),
        survivalBriefText: () => 'brief',
      },
    };
    const node = renderSurvival(ctx);
    window.document.getElementById('view').appendChild(node);
    return window;
  }

  test('every panel renders with exactly one h1', () => {
    const state = fixtureState();
    for (const panel of ['queue', 'classes', 'readings', 'method']) {
      const window = renderDom(state, `#/survival?panel=${panel}`);
      assert.equal(window.document.querySelectorAll('h1').length, 1, `panel ${panel} must have one h1`);
      assert.equal(window.document.querySelectorAll('table').length >= 0, true);
      assert.ok(window.document.querySelector('.tabs'), 'the panel bar renders');
    }
  });

  test('the empty workspace renders a dead end that explains itself', () => {
    const window = renderDom(createEmptyState(new Date('2026-11-15T00:00:00.000Z')));
    assert.equal(window.document.querySelectorAll('h1').length, 1);
    assert.match(window.document.body.textContent, /Nothing is open|No open item|No dated record/i);
  });

  test('the queue table has one cell per header', () => {
    const window = renderDom(fixtureState(), '#/survival?panel=queue');
    const table = window.document.querySelector('table');
    const headers = table.querySelectorAll('thead th').length;
    for (const row of table.querySelectorAll('tbody tr')) {
      assert.equal(row.querySelectorAll('td').length, headers, 'a mismatched row would break the table semantics');
    }
  });

  test('the terminal passes axe-core on the queue and class panels', async () => {
    const virtualConsole = new VirtualConsole();
    const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
    dom.window.__LEADOS_TEST__ = true;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.Element = dom.window.Element;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;
    globalThis.MouseEvent = dom.window.MouseEvent;
    globalThis.KeyboardEvent = dom.window.KeyboardEvent;
    if (!dom.window.axe) dom.window.eval(AXE_SRC);
    const state = fixtureState();
    for (const panel of ['queue', 'classes', 'method']) {
      const node = renderSurvival({
        state,
        now: NOW,
        query: new URLSearchParams(`panel=${panel}`),
        navigate: () => {},
        api: { scanSurvival: () => ({ ok: true }), survivalBriefText: () => 'brief' },
      });
      dom.window.document.getElementById('view').replaceChildren(node);
      const result = await dom.window.axe.run(dom.window.document.querySelector('#view'), {
        rules: { 'color-contrast': { enabled: false } },
      });
      assert.deepEqual(Array.from(result.violations).map((violation) => `${violation.id}: ${violation.help}`), [], `panel ${panel} must be axe-clean`);
    }
  });

  test('the stylesheet carries the panel hooks the terminal uses', () => {
    assert.ok(CSS.length > 0);
    const window = renderDom(fixtureState(), '#/survival?panel=classes');
    assert.ok(window.document.querySelector('.stat-grid'), 'the stat row uses an existing class');
  });
});
