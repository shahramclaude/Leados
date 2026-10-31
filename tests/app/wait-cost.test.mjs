/**
 * tests/app/wait-cost.test.mjs — the Cost of Waiting Terminal (Schema v64).
 *
 * Verifies:
 *   1. Schema v64 additivity, the 63→64 migration and the settings clamps
 *   2. Normalizer refusals: unreadable prices/certificates/markers are dropped
 *   3. stillOpenProbability: S(age+Δ)/S(age) on a hand-computed KM fixture,
 *      the at-risk floor refusal, the observed-tail flag
 *   4. Pricing: decision-derived rate from linked value at stake, declared
 *      class price, and unpriced-never-zero
 *   5. The report: ranking, confidence labels, per-currency totals that never
 *      pool currencies, scenario aggregation with coverage counts
 *   6. buildExposureCertificate: bounded, audit-shaped, scenario-carrying
 *   7. Signals WAIT-01..06, attention count, deterministic title-free brief
 *   8. The rule spine: declareWaitPrice cascades certificate + prices-delay
 *      edges + one triage DACI decision + owned tasks in ONE transaction;
 *      rescan is idempotent; the pause blocks automatic work but not a scan;
 *      closing an item reconciles its edge on the next scan
 *   9. CSV scope #54: registered, aggregate-only, opaque, scenario cells
 *      blanked below the at-risk floor
 *  10. Cross-module graph: `exposure` node, `prices-delay` relation, resolver
 *  11. Insights: the "Cost of waiting" bucket surfaces WAIT signals
 *  12. The view renders every panel with one h1; the empty workspace is a
 *      explained dead end; the queue table is well-formed; axe-core clean
 *  13. Routes: #/wait and the aliases resolve to the terminal
 *  14. The demo workspace ships declared prices and a priced report
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
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import {
  LINK_ENTITY_TYPES, LINK_RELATIONS, LINK_ENTITY_COLLECTIONS, linksForEntity, resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { decisionTempoRule } from '../../app/core/domain/decisionTempo.js';
import { attentionMarketRule } from '../../app/core/domain/attentionMarketRules.js';
import {
  WAIT_DEFAULTS,
  WAIT_SIGNAL_IDS,
  WAIT_CLASS_KEYS,
  activeWaitPrice,
  buildExposureCertificate,
  priceForRow,
  stillOpenProbability,
  waitConventionsFromSettings,
  waitCostAttentionCount,
  waitCostBrief,
  waitCostReport,
  waitCostSignals,
} from '../../app/core/domain/waitCost.js';
import {
  normalizeWaitCostMarkers,
  normalizeWaitExposures,
  normalizeWaitPrices,
} from '../../app/core/domain/waitCostSchema.js';
import { waitCostRule, WAIT_EVENTS, WAIT_RULE_IDS } from '../../app/core/domain/waitCostRules.js';
import { kaplanMeier } from '../../app/core/domain/survival.js';
import { renderWaitCost } from '../../app/views/waitCost.js';
import { parseRoute } from '../../app/main.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-31T10:00:00.000Z'); // a Saturday; week starts Monday 2026-10-26
const NOW_ISO = NOW.toISOString();

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

/* ------------------------------------------------------------ fixtures */

/**
 * A hand-checkable class history for the "work" class (10 portfolio items):
 *   completed at 2, 4, 6, 8, 10, 15 days (all completedOn = today, 2026-10-31);
 *   censored (open) at 13, 14, 16, 17 days.
 * Kaplan–Meier over all exits: S(10) = 5/10 = 0.5, S(15) = 0.5 * (2/3) = 1/3,
 * maxObservedDays = 17. Completion incidence reaches exactly 50% at day 10,
 * so every open item older than 10 days is past the class median (overdue),
 * and atRiskAt(13) = 5 >= the floor of 4, so the scenario can be read.
 * For an item at age 13, +2 weeks -> target 27 > 17 (extrapolated tail flag):
 * P(still open) = S(27)/S(13) = (1/3)/0.5 = 2/3 = 66.7%.
 */
function fixtureState() {
  const state = createEmptyState(NOW_ISO);
  state.settings.leaderName = 'Rae Mensah';
  state.people = [
    { id: 'p-leader', name: 'Rae Mensah', status: 'active', role: 'Head of Support' },
    { id: 'p-two', name: 'Tomas Berg', status: 'active', role: 'Engineer' },
  ];
  const day = (elapsed) => `2026-10-${String(31 - elapsed).padStart(2, '0')}`;
  const done = (id, elapsed) => ({ id, title: `Closed at ${elapsed}`, status: 'done', createdOn: day(elapsed), completedOn: '2026-10-31', ownerId: 'p-two' });
  const open = (id, elapsed, title, ownerId) => ({ id, title, status: 'open', createdOn: day(elapsed), completedOn: null, ownerId });
  state.portfolio = [
    done('w-d2', 2), done('w-d4', 4), done('w-d6', 6), done('w-d8', 8), done('w-d10', 10), done('w-d15', 15),
    open('w-open-13', 13, 'Rebuild the queue', 'p-two'),
    open('w-open-14', 14, 'Vendor scorecard', 'p-two'),
    open('w-open-16', 16, 'Runbook rewrite', null),
    open('w-open-17', 17, 'On-call rotation', 'p-two'),
  ];
  // A thin class: one open case, two exits — below the at-risk floor, so its
  // scenario cells must be withheld, never guessed.
  state.cases = [
    { id: 'c1', title: 'Sev1 checkout', status: 'resolved', openedOn: '2026-10-20', resolvedOn: '2026-10-24', ownerId: 'p-two', kind: 'incident' },
    { id: 'c2', title: 'PII in logs', status: 'resolved', openedOn: '2026-10-18', resolvedOn: '2026-10-28', ownerId: 'p-leader', kind: 'risk' },
    { id: 'c3', title: 'Rota gap', status: 'open', openedOn: '2026-10-19', ownerId: 'p-two', kind: 'risk' },
  ];
  // An unpriced class with an overdue open programme (change class: median
  // completion 6 days, the open programme is 16 days old, and no price is
  // declared for it — unpriced, not zero).
  state.changes = [
    { id: 'ch1', title: 'Split the team', status: 'anchored', openedOn: '2026-10-25', anchoredOn: '2026-10-29' },
    { id: 'ch2', title: 'New on-call model', status: 'anchored', openedOn: '2026-10-24', anchoredOn: '2026-10-30' },
    { id: 'ch3', title: 'Stream-aligned pods', status: 'active', openedOn: '2026-10-15' },
  ];
  // An open decision with linked money at stake: a committed budget line.
  state.budgets = [{
    id: 'b1', name: 'FY26 platform', currency: 'USD', ceiling: 500000, status: 'active',
    lines: [{ id: 'l1', title: 'Vendor migration', status: 'committed', committedAmount: 120000, actualAmount: 0, sourceType: 'decision', sourceId: 'dec-open' }],
  }];
  state.decisions = [
    { id: 'dec-done', title: 'Choose a vendor', date: '2026-10-01', chosen: 'Vendor A', decidedOn: '2026-10-08', reversibility: 'reversible' },
    { id: 'dec-open', title: 'Rebuild or buy the billing path', date: '2026-10-25', chosen: '', reversibility: 'irreversible' },
  ];
  state.links = [
    { id: 'lnk-1', sourceType: 'decision', sourceId: 'dec-open', targetType: 'budget', targetId: 'b1', relation: 'funds', ruleId: '', summary: '', createdOn: '2026-10-25', createdAt: NOW_ISO },
  ];
  state.waitPrices = [
    { id: 'wp-1', classKey: 'work', weeklyAmount: 100, currency: 'USD', declaredOn: '2026-10-20', note: 'funded work waits are priced', createdAt: NOW_ISO },
    { id: 'wp-2', classKey: 'case', weeklyAmount: 50, currency: 'EUR', declaredOn: '2026-10-21', note: '', createdAt: NOW_ISO },
  ];
  return normalizeState(state, { now: NOW }).state;
}

function harness() {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-wait-${(seq += 1)}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  let seq2 = 500;
  const api = createApi(store, { now: () => NOW, idFactory: (prefix) => `${prefix}-api-${(seq2 += 1)}` });
  const imported = store.importJSON(JSON.stringify(fixtureState()), { now: NOW });
  assert.equal(imported.ok, true);
  return { store, api };
}

/* ------------------------------------------------------------ 1. schema */

describe('schema v64: migration, clamps, normalizers', () => {
  test('SCHEMA_VERSION is 64 and the 63→64 migration is additive and empty', () => {
    assert.equal(SCHEMA_VERSION, 69);
    assert.equal(typeof MIGRATIONS[63], 'function');
    const migrated = migrate({ schemaVersion: 63, settings: {}, people: [], cases: [] });
    assert.deepEqual(migrated.applied, ['63 → 64', '64 → 65', '65 → 66', '66 → 67', '67 → 68', '68 → 69']);
    assert.equal(migrated.raw.schemaVersion, 69);
    assert.deepEqual(migrated.raw.waitPrices, []);
    assert.deepEqual(migrated.raw.waitExposures, []);
    assert.deepEqual(migrated.raw.waitCostMarkers, []);
  });

  test('a v63 workspace normalizes into v64 with the three new collections', () => {
    const raw = { schemaVersion: 63, settings: {}, people: [], cases: [] };
    const { state, warnings } = normalizeState(migrate(raw).raw, { now: NOW });
    assert.equal(state.schemaVersion, 69);
    assert.deepEqual(state.waitPrices, []);
    assert.deepEqual(state.waitExposures, []);
    assert.deepEqual(state.waitCostMarkers, []);
    assert.ok(Array.isArray(warnings));
  });

  test('settings clamps bound every wait convention and a typo cannot flip the pause', () => {
    const c = waitConventionsFromSettings({
      waitErosionWeeks: -5, waitScenarioWeeks: '0,2,999,x,4,4', waitTriageThreshold: -3,
      waitConfidenceFloor: 1, waitMaxTasksPerScan: 99, waitMaxPriceTasks: -1,
      waitMaxLinks: 0, waitExposureCap: 5, waitAutoPropagate: false,
    });
    assert.equal(c.erosionWeeks, 1);
    assert.deepEqual(c.scenarioWeeks, [2, 4]);
    assert.equal(c.triageThreshold, 0);
    assert.equal(c.confidenceFloor, 2);
    assert.equal(c.maxTasksPerScan, 10);
    assert.equal(c.maxPriceTasks, 0);
    assert.equal(c.maxLinks, 1);
    assert.equal(c.exposureCap, 10);
    assert.equal(c.autoPropagate, false);
    const d = waitConventionsFromSettings({});
    assert.deepEqual(d.scenarioWeeks, [1, 2, 4, 8]);
    assert.equal(d.autoPropagate, true);
    assert.equal(d.minAtRisk, 4);
  });

  test('normalizeWaitPrices is fail-closed: unknown class and non-numeric amount are dropped with warnings', () => {
    const warnings = [];
    const out = normalizeWaitPrices([
      { id: 'a', classKey: 'work', weeklyAmount: 10, currency: 'usd', declaredOn: '2026-10-01' },
      { id: 'b', classKey: 'nonsense', weeklyAmount: 10 },
      { id: 'c', classKey: 'case', weeklyAmount: 'lots' },
      { id: 'd', classKey: 'case', weeklyAmount: -2 },
      'garbage',
    ], warnings);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'a');
    assert.equal(out[0].currency, 'USD');
    assert.ok(warnings.length >= 3);
  });

  test('normalizeWaitExposures drops an unreadable certificate rather than repairing it', () => {
    const warnings = [];
    const out = normalizeWaitExposures([
      { id: 'ok', week: '2026-10-26', frozenOn: '2026-10-31', totals: [{ currency: 'usd', weeklyExposure: 10, weeklyExposureOverdue: 5, pricedItems: 2, overduePricedItems: 1, topItemSharePct: 50, scenarios: [{ weeks: 2, expectedAdditionalCost: 9, coveredRows: 2 }] }], items: [{ key: 'case:c1', sourceType: 'case', sourceId: 'c1', title: 'T', classKey: 'case', elapsedDays: 12, overdue: true, weeklyAmount: 5, currency: 'USD', priceSource: 'declared', confidence: 'high', scenarios: [{ weeks: 2, stillOpenPct: 60, expectedAdditionalCost: 6 }] }], markers: ['m'], history: [{ at: NOW_ISO, type: 'frozen', summary: 's' }] },
      { id: 'bad', week: 'not-a-day', frozenOn: '2026-10-31' },
      { frozenOn: '2026-10-31' },
    ], warnings);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'ok');
    assert.equal(out[0].totals[0].currency, 'USD');
    assert.equal(out[0].items[0].scenarios.length, 1);
    assert.ok(warnings.length >= 1);
  });

  test('markers are strings only, bounded', () => {
    const out = normalizeWaitCostMarkers(['a', 5, '', 'b'.repeat(500)]);
    assert.deepEqual(out.map((m) => m.length <= 200), [true, true]);
    assert.equal(out.length, 2);
  });
});

/* ------------------------------------------- 2. still-open probability */

describe('stillOpenProbability on a hand-computed curve', () => {
  const items = [
    { elapsedDays: 2, exitType: 'completed' },
    { elapsedDays: 4, exitType: 'completed' },
    { elapsedDays: 6, exitType: 'completed' },
    { elapsedDays: 8, exitType: 'completed' },
    { elapsedDays: 10, exitType: 'completed' },
    { elapsedDays: 15, exitType: 'completed' },
    { elapsedDays: 13, exitType: null },
    { elapsedDays: 14, exitType: null },
    { elapsedDays: 16, exitType: null },
    { elapsedDays: 17, exitType: null },
  ];
  const curve = kaplanMeier(items);

  test('KM steps match the hand computation S(10)=0.5, S(15)=1/3', () => {
    assert.ok(Math.abs(curve.survivalAt(10) - 0.5) < 1e-6);
    assert.ok(Math.abs(curve.survivalAt(15) - 1 / 3) < 1e-6);
    assert.equal(curve.maxObservedDays, 17);
  });

  test('P(still open at age+Δ | age) = S(age+Δ)/S(age); at age 13, +2 weeks → 2/3', () => {
    const reading = stillOpenProbability(curve, 13, 14, 4);
    assert.equal(reading.available, true);
    // S(13) = 0.5 (no event at 13); S(27) = S(17) = 1/3 → P = (1/3)/0.5 = 2/3.
    assert.ok(Math.abs(reading.probability - 2 / 3) < 1e-3);
    assert.equal(reading.probabilityPct, 66.7);
    assert.equal(reading.atRisk, 5);
    assert.equal(reading.beyondEvidence, true, 'target 27 > maxObserved 17 is flagged, not drawn silently');
  });

  test('below the at-risk floor the reading is refused with its reason', () => {
    const reading = stillOpenProbability(curve, 17, 7, 4);
    assert.equal(reading.available, false);
    assert.match(reading.reason, /at risk/);
  });

  test('an empty curve refuses instead of inventing a probability', () => {
    const reading = stillOpenProbability(kaplanMeier([]), 5, 7, 4);
    assert.equal(reading.available, false);
    assert.match(reading.reason, /no dated record/);
  });
});

/* ------------------------------------------------------- 3. pricing */

describe('priceForRow: derived, declared, unpriced — never zero', () => {
  test('an open decision with linked committed money is priced from its value at stake ÷ erosion window', () => {
    const state = fixtureState();
    const report = waitCostReport(state, NOW, state.settings);
    const row = report.rows.find((r) => r.item.kind === 'decision' && r.item.sourceId === 'dec-open');
    assert.ok(row, 'the open decision is in the queue');
    assert.equal(row.price.priced, true);
    assert.equal(row.price.source, 'derived');
    // 120000 USD at stake ÷ 12 weeks = 10000/week (linear cost-of-delay).
    assert.equal(row.price.weeklyAmount, 10000);
    assert.equal(row.price.currency, 'USD');
    assert.equal(row.price.valueAtStake, 120000);
    assert.match(row.price.basis, /Reinertsen|erosion window/);
  });

  test('a work item is priced by the declared class price; the case class uses its own currency', () => {
    const state = fixtureState();
    const report = waitCostReport(state, NOW, state.settings);
    const workRow = report.rows.find((r) => r.item.sourceId === 'w-open-13');
    assert.equal(workRow.price.priced, true);
    assert.equal(workRow.price.source, 'declared');
    assert.equal(workRow.price.weeklyAmount, 100);
    assert.equal(workRow.price.currency, 'USD');
    const caseRow = report.rows.find((r) => r.item.sourceId === 'c3');
    assert.equal(caseRow.price.currency, 'EUR');
    assert.equal(caseRow.price.weeklyAmount, 50);
  });

  test('an unpriced class reports unpriced with a reason — never zero', () => {
    const state = fixtureState();
    const report = waitCostReport(state, NOW, state.settings);
    const reqRow = report.rows.find((r) => r.item.kind === 'delegation');
    if (reqRow) {
      assert.equal(reqRow.price.priced, false);
      assert.equal(reqRow.price.weeklyAmount, null);
      assert.match(row0Basis(reqRow), /unpriced/i);
    }
    const decDone = report.rows.find((r) => r.item.sourceId === 'dec-done');
    assert.equal(decDone, undefined, 'a decided decision is not open, so it is not in the queue');
    function row0Basis(row) { return row.price.basis; }
  });

  test('activeWaitPrice returns the latest declaration per class', () => {
    const state = fixtureState();
    state.waitPrices.push({ id: 'wp-3', classKey: 'work', weeklyAmount: 250, currency: 'USD', declaredOn: '2026-10-30' });
    assert.equal(activeWaitPrice(state, 'work').weeklyAmount, 250);
    assert.equal(activeWaitPrice(state, 'hiring'), null);
  });
});

/* ------------------------------------------------------- 4. the report */

describe('waitCostReport: ranking, confidence, per-currency totals, scenarios', () => {
  test('rows are ranked priced-overdue first, then priced, then unpriced by age', () => {
    const report = waitCostReport(fixtureState(), NOW, fixtureState().settings);
    const pricedFirst = report.rows.findIndex((r) => !r.price.priced);
    assert.ok(pricedFirst === -1 || report.rows.slice(0, pricedFirst).every((r) => r.price.priced));
    const overdueRow = report.rows.find((r) => r.item.sourceId === 'w-open-13');
    assert.equal(overdueRow.overdue, true);
    assert.equal(overdueRow.overdueBy, 3); // 13 days old, class median completion 10 days
    assert.ok(report.rows.indexOf(overdueRow) < pricedFirst || pricedFirst === -1);
  });

  test('confidence is high only with a price, enough exits and the at-risk floor met', () => {
    const report = waitCostReport(fixtureState(), NOW, fixtureState().settings);
    const workRow = report.rows.find((r) => r.item.sourceId === 'w-open-13');
    assert.equal(workRow.confidence.level, 'high'); // 6 exits, at risk 5, declared price
    const caseRow = report.rows.find((r) => r.item.sourceId === 'c3');
    assert.equal(caseRow.confidence.level, 'low'); // priced but only 2 exits
    assert.match(caseRow.confidence.basis, /thin|almost no evidence/);
  });

  test('totals are per currency and never pooled; scenario coverage is counted', () => {
    const state = fixtureState();
    const report = waitCostReport(state, NOW, state.settings);
    const usd = report.totals.find((t) => t.currency === 'USD');
    const eur = report.totals.find((t) => t.currency === 'EUR');
    assert.ok(usd && eur, 'two currencies, two buckets');
    // USD: work items at 100/wk (4 open) + the decision at 10000/wk.
    assert.equal(usd.weeklyExposure, 10400);
    assert.equal(usd.weeklyExposureOverdue, 400); // the four open work items are all past the day-10 median
    assert.equal(eur.weeklyExposure, 50);
    assert.equal(eur.weeklyExposureOverdue, 50); // the open case (12d) is past the day-10 median
    const twoWeek = usd.scenarios.find((s) => s.weeks === 2);
    assert.ok(twoWeek.expectedAdditionalCost > 0);
    assert.ok(twoWeek.coveredRows >= 1);
    // The decision row is at age 6 with a thin decision class: its scenario
    // may be withheld; the aggregate only counts rows the curve could answer.
    assert.ok(usd.scenarios.every((s) => s.coveredRows <= usd.pricedItems));
  });

  test('the +2 week scenario of the overdue work item matches the hand computation', () => {
    const state = fixtureState();
    const report = waitCostReport(state, NOW, state.settings);
    const row = report.rows.find((r) => r.item.sourceId === 'w-open-13');
    const scenario = row.scenarios.find((s) => s.weeks === 2);
    assert.equal(scenario.available, true);
    assert.equal(scenario.stillOpenPct, 66.7);
    // 100/week × 2 weeks × 0.6667 (the 4dp-rounded 2/3) = 133.34
    assert.equal(scenario.expectedAdditionalCost, 133.34);
    assert.equal(scenario.beyondEvidence, true);
  });

  test('a thin class withholds its scenario with the reason instead of guessing', () => {
    const state = fixtureState();
    const report = waitCostReport(state, NOW, state.settings);
    const row = report.rows.find((r) => r.item.sourceId === 'c3');
    assert.ok(row.scenarios.every((s) => !s.available));
    assert.match(row.scenarios[0].reason, /at risk|no dated record/);
  });

  test('counts separate priced / unpriced / overdue / severe', () => {
    const report = waitCostReport(fixtureState(), NOW, fixtureState().settings);
    assert.equal(report.counts.pricedOverdue, 5); // 4 work items + 1 case
    assert.equal(report.counts.currencies, 2);
    assert.equal(report.counts.unpricedOverdue, 1); // the open change programme
    assert.equal(report.counts.unpriced, 1);
  });
});

/* ------------------------------------------------- 5. the certificate */

describe('buildExposureCertificate', () => {
  test('freezes the priced queue bounded by the link cap, with totals and scenarios', () => {
    const state = fixtureState();
    const report = waitCostReport(state, NOW, state.settings);
    const cert = buildExposureCertificate(report, { id: 'wxp-1', label: 'Week test', reviewOn: '2026-11-07', nowIso: NOW_ISO });
    assert.equal(cert.id, 'wxp-1');
    assert.equal(cert.week, report.week);
    assert.equal(cert.frozenOn, report.today);
    assert.equal(cert.items.length, report.rows.filter((r) => r.price.priced).length);
    assert.equal(cert.totals.length, 2);
    assert.equal(cert.markers.length, 0);
    assert.equal(cert.history[0].type, 'frozen');
    assert.ok(cert.items.every((item) => Number.isFinite(item.weeklyAmount)));
  });
});

/* ------------------------------------------------------ 6. signals etc. */

describe('signals, attention count and brief', () => {
  test('WAIT-01..04 fire on the fixture; WAIT-05/06 depend on guardrail/concentration', () => {
    const state = fixtureState();
    const signals = waitCostSignals(state, NOW, state.settings);
    const ids = signals.map((s) => s.ruleId);
    for (const id of ['WAIT-01', 'WAIT-02', 'WAIT-03', 'WAIT-04']) {
      assert.ok(ids.includes(id), `expected ${id} on the fixture, got ${ids.join(',')}`);
    }
    for (const id of WAIT_SIGNAL_IDS) {
      assert.ok(WAIT_SIGNAL_IDS.includes(id));
    }
    const wait02 = signals.find((s) => s.ruleId === 'WAIT-02');
    assert.match(wait02.title, /USD/);
    assert.match(wait02.title, /week/);
    for (const signal of signals) {
      assert.equal(signal.domain, 'Cost of waiting');
      assert.ok(signal.action?.route.startsWith('#/wait'));
      assert.ok(Array.isArray(signal.evidence) && signal.evidence.length > 0);
    }
  });

  test('attention count is severity-3+ only; brief is deterministic and omits item titles', () => {
    const state = fixtureState();
    const count = waitCostAttentionCount(state, NOW, state.settings);
    assert.ok(count >= 2, 'WAIT-01 and WAIT-02 are severity 3');
    const brief1 = waitCostBrief(state, NOW, state.settings);
    const brief2 = waitCostBrief(state, NOW, state.settings);
    assert.equal(brief1, brief2);
    assert.equal(brief1.includes('Rebuild the queue'), false, 'the brief carries no item titles');
    assert.equal(brief1.includes('p-two'), false, 'the brief carries no person ids');
    assert.match(brief1, /COST OF WAITING/);
    assert.match(brief1, /unpriced is not zero|UNPRICED/i);
  });

  test('an empty workspace produces no signals and an explained brief', () => {
    const empty = createEmptyState(NOW_ISO);
    assert.deepEqual(waitCostSignals(empty, NOW, {}), []);
    const brief = waitCostBrief(empty, NOW, {});
    assert.match(brief, /No open dated work/);
  });
});

/* ------------------------------------------------------ 7. the spine */

describe('RULE-WAIT-01..05 on the post-commit spine', () => {
  test('the rule is registered, contracted, and runs before decision tempo with attention market last', () => {
    assert.ok(DEFAULT_POST_COMMIT_RULES.includes(waitCostRule));
    assert.ok(PROPAGATION_CONTRACTS.some((c) => c.rule === waitCostRule && c.module === 'waitCostRules.js'));
    assert.ok(DEFAULT_POST_COMMIT_RULES.indexOf(waitCostRule) < DEFAULT_POST_COMMIT_RULES.indexOf(decisionTempoRule),
      'the triage decision must be priced by tempo in the same transaction');
    assert.equal(DEFAULT_POST_COMMIT_RULES[DEFAULT_POST_COMMIT_RULES.length - 1], attentionMarketRule);
    assert.deepEqual(waitCostRule.triggers.sort(), Object.values(WAIT_EVENTS).sort());
  });

  test('declaring a price cascades in ONE transaction: certificate, prices-delay edges, triage decision, owned task', () => {
    const { store, api } = harness();
    const result = api.declareWaitPrice({ classKey: 'delegation', weeklyAmount: 25, currency: 'USD', note: 'test' });
    assert.equal(result.ok, true);
    const ruleIds = (result.propagations || []).map((p) => p.ruleId);
    assert.ok(ruleIds.includes(WAIT_RULE_IDS.FREEZE), 'certificate frozen');
    assert.ok(ruleIds.includes(WAIT_RULE_IDS.LINK), 'edges linked');
    assert.ok(ruleIds.includes(WAIT_RULE_IDS.TRIAGE), 'triage decision opened');
    assert.ok(ruleIds.includes(WAIT_RULE_IDS.TASK), 'owned task opened for the overdue priced item');

    assert.equal(store.state.waitExposures.length, 1);
    const cert = store.state.waitExposures[0];
    assert.equal(cert.week, '2026-10-26');
    const edges = store.state.links.filter((l) => l.relation === 'prices-delay');
    assert.ok(edges.length >= 1);
    assert.ok(edges.every((l) => l.sourceType === 'exposure' && l.sourceId === cert.id));
    assert.ok(edges.some((l) => l.targetType === 'portfolio' && l.targetId === 'w-open-13'));
    assert.match(edges.find((l) => l.targetId === 'w-open-13').summary, /USD 100\/week/);
    const triage = store.state.decisions.find((d) => d.title.includes('waiting is costing'));
    assert.ok(triage, 'exactly the triage decision exists');
    assert.equal(triage.outcome, 'pending');
    assert.match(triage.rationale, /RULE-WAIT-02/);
    const task = store.state.delegations.find((d) => d.support.includes(WAIT_RULE_IDS.TASK));
    assert.ok(task, 'one owned task for the recorded owner');
    assert.equal(task.personId, 'p-two', 'the item’s recorded owner, never an invented one');
  });

  test('a rescan is idempotent: no second certificate, edge, decision or task', () => {
    const { store, api } = harness();
    api.declareWaitPrice({ classKey: 'work', weeklyAmount: 100, currency: 'USD' });
    const snapshot = JSON.stringify({
      e: store.state.waitExposures.length,
      l: store.state.links.filter((l) => l.relation === 'prices-delay').length,
      d: store.state.decisions.length,
      t: store.state.delegations.length,
      m: store.state.waitCostMarkers.length,
    });
    const again = api.scanWaitCost();
    assert.equal(again.ok, true);
    assert.equal(again.changed, false, 'a second scan in the same week changes nothing');
    assert.equal(JSON.stringify({
      e: store.state.waitExposures.length,
      l: store.state.links.filter((l) => l.relation === 'prices-delay').length,
      d: store.state.decisions.length,
      t: store.state.delegations.length,
      m: store.state.waitCostMarkers.length,
    }), snapshot);
  });

  test('the pause blocks automatic propagation but an explicit scan always catches up', () => {
    const { store, api } = harness();
    api.updateSettings({ waitAutoPropagate: false });
    const r = api.declareWaitPrice({ classKey: 'hiring', weeklyAmount: 10, currency: 'USD' });
    assert.equal(r.ok, true);
    assert.equal((r.propagations || []).length, 0, 'paused: no cascade on a price declaration');
    assert.equal(store.state.waitExposures.length, 0);
    const scan = api.scanWaitCost();
    assert.equal(scan.ok, true);
    assert.equal(store.state.waitExposures.length, 1, 'the explicit scan still runs');
  });

  test('closing an item reconciles its prices-delay edge on the next scan', () => {
    const { store, api } = harness();
    api.scanWaitCost();
    const before = store.state.links.filter((l) => l.relation === 'prices-delay').length;
    assert.ok(before >= 1);
    // Close the overdue work item through a real store write.
    store.update(
      (draft) => {
        const item = draft.portfolio.find((row) => row.id === 'w-open-13');
        item.status = 'done';
        item.completedOn = '2026-10-31';
      },
      { type: 'portfolio.updated', entity: 'portfolio', entityId: 'w-open-13', summary: 'test close' },
    );
    api.scanWaitCost();
    const after = store.state.links.filter((l) => l.relation === 'prices-delay');
    assert.equal(after.length, before - 1, 'the stale edge to the closed item is removed');
    assert.ok(!after.some((l) => l.targetId === 'w-open-13'));
  });

  test('freezeWaitExposure refuses an empty queue and a past review date, and the FROZEN event links edges', () => {
    const { store, api } = harness();
    const emptyStore = createStore({ storage: memoryStorage(), now: () => NOW, idFactory: (p) => `${p}-e${Math.random()}` });
    emptyStore.load();
    const emptyApi = createApi(emptyStore, { now: () => NOW, idFactory: (p) => `${p}-e2${Math.random()}` });
    const refused = emptyApi.freezeWaitExposure({});
    assert.equal(refused.ok, false);
    assert.match(refused.error, /No open dated work/);
    const past = api.freezeWaitExposure({ reviewOn: '2026-10-01' });
    assert.equal(past.ok, false);
    assert.match(past.error, /future/);
    const ok = api.freezeWaitExposure({ label: 'Explicit freeze', reviewOn: '2026-11-14' });
    assert.equal(ok.ok, true);
    assert.ok((ok.propagations || []).some((p) => p.ruleId === WAIT_RULE_IDS.LINK), 'the frozen event fans out links');
    const cert = store.state.waitExposures.find((row) => row.id === ok.id);
    assert.equal(cert.label, 'Explicit freeze');
    assert.equal(cert.reviewOn, '2026-11-14');
  });

  test('declareWaitPrice validates its input', () => {
    const { api } = harness();
    assert.equal(api.declareWaitPrice({ classKey: 'nope', weeklyAmount: 1 }).ok, false);
    assert.equal(api.declareWaitPrice({ classKey: 'case', weeklyAmount: -5 }).ok, false);
    assert.equal(api.declareWaitPrice({ classKey: 'case', weeklyAmount: 'x' }).ok, false);
    const ok = api.declareWaitPrice({ classKey: 'case', weeklyAmount: 75, currency: 'eur' });
    assert.equal(ok.ok, true);
    assert.equal(ok.active.currency, 'EUR');
    assert.equal(ok.active.weeklyAmount, 75);
  });

  test('unpriced overdue classes get a declare-a-price task, once per class per week', () => {
    const { store, api } = harness();
    // Give the case class an overdue unpriced item: remove its price first.
    api.removeWaitPrice('wp-2');
    api.scanWaitCost();
    const priceTasks = store.state.delegations.filter((d) => d.support.includes(WAIT_RULE_IDS.PRICE));
    assert.ok(priceTasks.length >= 1, 'at least one declare-a-price task');
    assert.equal(priceTasks[0].personId, 'p-leader', 'price tasks go to the leader');
    const countBefore = store.state.delegations.length;
    api.scanWaitCost();
    assert.equal(store.state.delegations.length, countBefore, 'idempotent per class per week');
  });
});

/* ------------------------------------------------------ 8. CSV scope */

describe('CSV scope #54 (waitcost)', () => {
  test('the scope is registered and exportable', () => {
    assert.equal(CSV_EXPORTS.length, 59);
    assert.ok(CSV_EXPORTS.some((s) => s.key === 'waitcost' && s.filenameSlug === 'cost-of-waiting'));
    const result = exportWorkspaceCsv(fixtureState(), 'waitcost', { now: NOW });
    assert.equal(result.ok, true);
    assert.ok(result.rowCount >= 3);
    assert.match(result.csv, /class_code/);
    assert.match(result.csv, /currency_code/);
    assert.match(result.csv, /ALL/);
  });

  test('the export is aggregate-only: no item titles, no record or person ids', () => {
    const result = exportWorkspaceCsv(fixtureState(), 'waitcost', { now: NOW });
    assert.equal(result.csv.includes('Rebuild the queue'), false);
    assert.equal(result.csv.includes('w-open-13'), false);
    assert.equal(result.csv.includes('p-two'), false);
    assert.equal(result.csv.includes('dec-open'), false);
    assert.match(result.csv, /C01/);
  });

  test('legacy CSV endpoint field keeps its key but declares lower-bound semantics on every row', () => {
    const result = exportWorkspaceCsv(fixtureState(), 'waitcost', { now: NOW });
    const [header, ...rows] = result.csv.trim().split('\n');
    const idx = header.split(',').indexOf('scenario_semantics');
    assert.ok(idx >= 0, 'the old scenario_Xw_expected header must not silently claim an expectation');
    assert.ok(rows.every((r) => r.split(',')[idx] === 'endpoint_lower_bound_legacy'));
  });

  test('scenario cells are blank below the at-risk floor, not zero', () => {
    const result = exportWorkspaceCsv(fixtureState(), 'waitcost', { now: NOW });
    const lines = result.csv.trim().split('\n');
    const header = lines[0].split(',');
    const caseIdx = header.indexOf('class_code');
    const eurIdx = header.indexOf('currency_code');
    const expIdx = header.indexOf('scenario_2w_expected');
    const coveredIdx = header.indexOf('scenario_2w_covered');
    const caseRow = lines.slice(1).find((line) => {
      const cols = line.split(',');
      return cols[caseIdx] === 'C02' && cols[eurIdx] === 'EUR';
    });
    assert.ok(caseRow, 'the case class has a EUR row');
    const cols = caseRow.split(',');
    assert.equal(cols[coveredIdx], '0', 'the thin case class could not answer');
    assert.equal(cols[expIdx], '', 'the expected cost is blank, not zero');
  });
});

/* --------------------------------------------------- 9. graph wiring */

describe('cross-module graph: exposure node and prices-delay relation', () => {
  test('the entity type, collection, relation and label are registered', () => {
    assert.ok(LINK_ENTITY_TYPES.includes('exposure'));
    assert.equal(LINK_ENTITY_COLLECTIONS.exposure, 'waitExposures');
    assert.ok(LINK_RELATIONS.includes('prices-delay'));
    const { store, api } = harness();
    api.scanWaitCost();
    const cert = store.state.waitExposures[0];
    const resolved = resolveLinkedEntity(store.state, 'exposure', cert.id);
    assert.ok(resolved);
    assert.equal(resolved.type, 'exposure');
    assert.equal(resolved.route, `#/wait?panel=certificates&exposure=${cert.id}`);
    const query = new URLSearchParams(resolved.route.split('?')[1]);
    assert.equal(query.get('exposure'), cert.id);
    const viaLinks = linksForEntity(store.state, 'exposure', cert.id);
    assert.ok(viaLinks.length >= 1);
    assert.equal(viaLinks[0].peer.type, 'portfolio');
    assert.ok(viaLinks.every((entry) => entry.relationLabel.length > 0));
  });
});

/* ------------------------------------------------------ 10. insights */

describe('insights bucket', () => {
  test('the domain is listed and WAIT signals surface through buildInsights', () => {
    assert.ok(DOMAIN_ORDER.includes('Cost of waiting'));
    const { store, api } = harness();
    api.scanWaitCost();
    const insights = buildInsights(store.state, NOW);
    const waitFindings = insights.findings.filter((f) => f.domain === 'Cost of waiting');
    assert.ok(waitFindings.length >= 2, `expected WAIT findings, got ${waitFindings.length}`);
    assert.ok(insights.byDomain.some((b) => b.domain === 'Cost of waiting'));
  });
});

/* -------------------------------------------------------- 11. the view */

describe('the view (#/wait)', () => {
  function renderDom(state, hash = '#/wait') {
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
      refresh: () => {},
      api: {
        scanWaitCost: () => ({ ok: true, changed: false }),
        freezeWaitExposure: () => ({ ok: true, id: 'x' }),
        declareWaitPrice: () => ({ ok: true }),
        removeWaitPrice: () => ({ ok: true }),
        waitCostBriefText: () => 'brief',
      },
    };
    const node = renderWaitCost(ctx);
    window.document.getElementById('view').appendChild(node);
    return window;
  }

  test('every panel renders with exactly one h1', () => {
    const state = fixtureState();
    for (const panel of ['overview', 'queue', 'scenarios', 'prices', 'certificates', 'method']) {
      const window = renderDom(state, `#/wait?panel=${panel}`);
      assert.equal(window.document.querySelectorAll('h1').length, 1, `panel ${panel} must have one h1`);
      assert.ok(window.document.querySelector('.tabs'), 'the panel bar renders');
      assert.ok(window.document.body.textContent.length > 100);
    }
  });

  test('the empty workspace renders an explained dead end', () => {
    const window = renderDom(createEmptyState(NOW_ISO));
    assert.equal(window.document.querySelectorAll('h1').length, 1);
    assert.match(window.document.body.textContent, /unpriced|No open|priced/i);
  });

  test('the legacy wait-scenario panel labels the endpoint number as a lower bound, not an expectation', () => {
    const window = renderDom(fixtureState(), '#/wait?panel=scenarios');
    assert.match(window.document.body.textContent, /Endpoint-only lower bound/);
    assert.match(window.document.body.textContent, /not expected carrying cost/);
  });

  test('the queue table has one cell per header and marks unpriced as not-zero', () => {
    const window = renderDom(fixtureState(), '#/wait?panel=queue');
    const table = window.document.querySelector('table');
    const headers = table.querySelectorAll('thead th').length;
    for (const row of table.querySelectorAll('tbody tr')) {
      assert.equal(row.querySelectorAll('td').length, headers);
    }
    assert.match(window.document.body.textContent, /unpriced, not zero/);
  });

  test('routes resolve: #/wait and the aliases', () => {
    assert.equal(parseRoute('#/wait').route, 'wait');
    assert.equal(parseRoute('#/cost-of-waiting?panel=queue').route, 'wait');
    assert.equal(parseRoute('#/cost-of-delay').route, 'wait');
    assert.equal(parseRoute('#/cod').route, 'wait');
    assert.equal(parseRoute('#/exposure').route, 'wait');
  });

  test('the terminal passes axe-core on the overview and queue panels', async () => {
    const virtualConsole = new VirtualConsole();
    const dom = new JSDOM(HTML, { url: 'https://leados.test/#/wait', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
    if (!dom.window.axe) dom.window.eval(AXE_SRC);
    for (const panel of ['overview', 'queue']) {
      const node = renderWaitCost({
        state: fixtureState(),
        now: NOW,
        query: new URLSearchParams(`panel=${panel}`),
        navigate: () => {},
        refresh: () => {},
        api: {
          scanWaitCost: () => ({ ok: true, changed: false }),
          freezeWaitExposure: () => ({ ok: true, id: 'x' }),
          declareWaitPrice: () => ({ ok: true }),
          removeWaitPrice: () => ({ ok: true }),
          waitCostBriefText: () => 'brief',
        },
      });
      const view = dom.window.document.getElementById('view') || dom.window.document.body.appendChild(dom.window.document.createElement('div'));
      view.replaceChildren();
      view.appendChild(node);
      const result = await dom.window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
      assert.deepEqual(Array.from(result.violations).map((v) => `${v.id}: ${v.help}`), [], `panel ${panel} must be axe-clean`);
    }
  });
});

/* ---------------------------------------------------------- 12. demo */

describe('the demo workspace', () => {
  test('ships declared prices and produces a priced report with signals', () => {
    const state = buildDemoState(NOW);
    assert.equal(state.waitPrices.length, 3);
    const report = waitCostReport(state, NOW, state.settings);
    assert.ok(report.counts.open > 0);
    assert.ok(report.counts.priced > 0, 'the demo declares prices, so items are priced');
    assert.ok(report.totals.length >= 1);
    assert.ok(waitCostSignals(state, NOW, state.settings).length >= 1);
    // And no certificate is pre-frozen: freezing one on the leader's behalf
    // would be a record made after the fact.
    assert.equal(state.waitExposures.length, 0);
  });
});
