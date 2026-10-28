/**
 * tests/app/early-warning.test.mjs — the Early-Warning Watch (Schema v39).
 *
 *   1. Statistics: normal tail, exact binomial tail, the exported α table, and
 *      the Bonferroni factor applied per series.
 *   2. Benjamini–Hochberg: hand-computed step-up, tie stability, empty case.
 *   3. Wilson interval: hand-computed 3-of-4, and the null cases.
 *   4. Scoring: hand-computed skill, withheld skill when naive is exact, the
 *      evidence floors, precision accounting and the tolerance verdict.
 *   5. Scan: a real demo workspace — m, rejections, adverse-only promotion.
 *   6. Schema v39: additive migration and a normaliser that repairs in the
 *      honest direction.
 *   7. The real store cascade: a human verdict opens exactly one case; a second
 *      scan does not duplicate it; verdicts are one-way.
 *   8. Governors: budget suppression, cooldown, noisy-series demotion, and the
 *      stale-triage escalation.
 *   9. The pause switch, signals, insights, CSV scope #40, brief determinism.
 *  10. JSDOM + axe across all five tabs, and the verdict dialog end to end.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { SCHEMA_VERSION, createEmptyState, migrate, normalizeState, DEFAULT_SETTINGS } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { addDays, dayKey } from '../../app/core/time.js';
import {
  EW_ENGINE_VERSION,
  EW_RULE_IDS,
  EW_SERIES_REGISTRY,
  EW_VERDICTS,
  alertPrecision,
  benjaminiHochberg,
  binomialTail,
  buildWatchReport,
  earlyWarningRule,
  nominalAlpha,
  normalCdf,
  pooledSkill,
  readWatchPolicy,
  scanWatch,
  scoreFrozen,
  seriesPValue,
  watchBrief,
  watchSignals,
  wilsonInterval,
} from '../../app/core/domain/earlyWarning.js';
import { EW_ALERT_STATUSES, EW_SUPPRESSION_REASONS } from '../../app/core/domain/watchRegistry.js';
import { LINK_ENTITY_TYPES } from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-28T10:00:00.000Z');
const TODAY = '2026-10-28';

function kvStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness(now = NOW) {
  const clock = { now };
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-ew-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => clock.now, idFactory });
  store.load();
  const api = createApi(store, { now: () => clock.now, idFactory });
  return {
    store,
    api,
    clock,
    advance(days) {
      clock.now = new Date(clock.now.getTime() + days * 86400000);
      return dayKey(clock.now);
    },
  };
}

const demo = () => buildDemoState(NOW);

/* -------------------------------------------------------- 1. statistics */

test('normal tail: Φ(0), Φ(1.96), Φ(3) to the A&S error bound', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalCdf(1.959964) - 0.975) < 1e-5);
  assert.ok(Math.abs(normalCdf(3) - 0.998650102) < 1e-7);
  // Symmetry, and both tails.
  assert.ok(Math.abs(normalCdf(-1.5) + normalCdf(1.5) - 1) < 1e-7);
  assert.equal(normalCdf(-1.5) < normalCdf(0), true);
});

test('binomial tail is exact: P(X≥3 | n=4, p=0.5) = 5/16', () => {
  assert.ok(Math.abs(binomialTail(4, 3, 0.5) - 0.3125) < 1e-12);
  assert.ok(Math.abs(binomialTail(8, 8, 0.5) - Math.pow(0.5, 8)) < 1e-12);
  assert.equal(binomialTail(4, 5, 0.5), binomialTail(4, 5, 0.5)); // non-finite, deterministic
  assert.ok(Number.isNaN(binomialTail(4, 5, 0.5)));
});

test('the exported α table matches its own null models', () => {
  assert.ok(Math.abs(nominalAlpha('beyond-limit') - 2 * (1 - normalCdf(3))) < 1e-15);
  assert.ok(Math.abs(nominalAlpha('beyond-limit') - 0.0026997) < 1e-6);
  assert.equal(nominalAlpha('sustained-shift'), Math.pow(0.5, 7));
  assert.ok(Math.abs(nominalAlpha('near-limit-cluster')
    - binomialTail(4, 3, 1 - normalCdf(2))) < 1e-18);
  assert.equal(nominalAlpha('not-a-rule'), 1);
});

test('series p value is Bonferroni-inflated by four rules and capped at 1', () => {
  const p = seriesPValue([{ rule: 'beyond-limit' }, { rule: 'sustained-shift' }]);
  assert.ok(Math.abs(p - 4 * nominalAlpha('beyond-limit')) < 1e-15);
  assert.equal(seriesPValue([]), 1);
  assert.equal(seriesPValue([{ rule: 'unknown' }]), 1);
});

/* ------------------------------------------------- 2. Benjamini–Hochberg */

test('BH-style step-up: hand-computed rejection set without a false-count guarantee', () => {
  const bh = benjaminiHochberg([0.001, 0.02, 0.04, 0.2, 0.5], 0.1);
  assert.equal(bh.m, 5);
  assert.equal(bh.k, 3);
  assert.ok(Math.abs(bh.threshold - 0.06) < 1e-12);
  assert.deepEqual(bh.rejected, [0, 1, 2]);
  assert.equal(Object.hasOwn(bh, 'expectedFalseDiscoveries'), false);
  // The fourth rank fails: 0.2 > 0.08.
  assert.equal(bh.ranked[3].passes, false);
});

test('BH is deterministic on ties and refuses to reject when nothing passes', () => {
  const a = benjaminiHochberg([0.0108, 0.0108, 0.0108], 0.1);
  const b = benjaminiHochberg([0.0108, 0.0108, 0.0108], 0.1);
  assert.deepEqual(a.rejected, b.rejected);
  // Thresholds are k/3 × 0.1 = 0.0333…, so all three pass; k = 3.
  assert.equal(a.k, 3);
  const none = benjaminiHochberg([0.4, 0.5, 0.9], 0.05);
  assert.equal(none.k, 0);
  assert.deepEqual(none.rejected, []);
  assert.equal(none.threshold, null);
  const empty = benjaminiHochberg([], 0.1);
  assert.equal(empty.m, 0);
  assert.equal(Object.hasOwn(empty, 'expectedFalseDiscoveries'), false);
});

/* ---------------------------------------------------------- 3. Wilson */

test('Wilson interval: 3 of 4 matches the published 0.3006–0.9544', () => {
  const ci = wilsonInterval(3, 4);
  assert.equal(ci.p, 0.75);
  assert.equal(ci.lo, 0.3006);
  assert.equal(ci.hi, 0.9544);
  assert.equal(wilsonInterval(0, 0).p, null);
  assert.equal(wilsonInterval(5, 3).p, null);
  // More evidence narrows the interval at the same proportion.
  const wide = wilsonInterval(3, 4);
  const narrow = wilsonInterval(30, 40);
  assert.ok((narrow.hi - narrow.lo) < (wide.hi - wide.lo));
});

/* --------------------------------------------------------- 4. scoring */

test('scoreFrozen: hand-computed skill and direction hit', () => {
  const frozen = { point: 10, baselinePoint: 8, dueOn: '2026-10-25', lo: 8, hi: 12, sigma: 1 };
  const scored = scoreFrozen(frozen, 13);
  assert.equal(scored.scored, true);
  assert.equal(scored.absErrorModel, 3);
  assert.equal(scored.absErrorNaive, 5);
  assert.equal(scored.skill, 0.4); // 1 − 3/5
  assert.equal(scored.directionHit, true); // predicted +2, realised +5
  // A worse-than-naive prediction gets a negative skill, not a floor at zero:
  // model error 5, naive error 3 ⇒ 1 − 5/3 = −0.6667.
  assert.equal(scoreFrozen(frozen, 5).skill, -0.6667);
  // Naive is exactly right: skill is withheld rather than divided by zero.
  const exact = scoreFrozen({ ...frozen, baselinePoint: 13 }, 13);
  assert.equal(exact.absErrorNaive, 0);
  assert.equal(exact.skill, null);
  // Unmeasured realisation is never scored as zero error.
  const unmeasured = scoreFrozen(frozen, null);
  assert.equal(unmeasured.scored, false);
  assert.equal(unmeasured.reason, 'unmeasured');
});

test('pooledSkill reports counts only below the floor, then a measured figure', () => {
  const rows = [
    { scored: true, absErrorModel: 1, absErrorNaive: 2, skill: 0.5, directionHit: true },
    { scored: true, absErrorModel: 3, absErrorNaive: 2, skill: -0.5, directionHit: false },
    { scored: false, reason: 'pending' },
    { scored: false, reason: 'unmeasured' },
  ];
  const thin = pooledSkill(rows);
  assert.equal(thin.scored, 2);
  assert.equal(thin.reliable, false);
  assert.equal(thin.meanSkill, null);
  assert.equal(thin.pending, 1);
  assert.equal(thin.unmeasured, 1);
  const thick = pooledSkill([...rows, ...Array.from({ length: 3 }, () => ({ scored: true, absErrorModel: 2, absErrorNaive: 2, skill: 0, directionHit: true }))]);
  assert.equal(thick.reliable, true);
  assert.equal(thick.scored, 5);
  assert.ok(Math.abs(thick.meanSkill - 0) < 1e-12);
  assert.ok(Math.abs(thick.maeModel - 2) < 1e-12);
  assert.equal(thick.directionAccuracy, 0.8);
});

test('alertPrecision excludes explained and dismissed, and flags a badly tuned detector', () => {
  const rows = [
    { status: 'confirmed' }, { status: 'false-alarm' }, { status: 'confirmed' },
    { status: 'explained' }, { status: 'dismissed' }, { status: 'open' }, { status: 'suppressed' },
  ];
  const p = alertPrecision(rows);
  assert.equal(p.judged, 3);
  assert.equal(p.confirmed, 2);
  assert.equal(p.falseAlarms, 1);
  assert.equal(p.explained, 1);
  assert.equal(p.dismissed, 1);
  assert.equal(p.suppressed, 1);
  assert.equal(p.reliable, true);
  assert.ok(Math.abs(p.precision - 0.6667) < 1e-4);
  assert.ok(p.lo < p.precision && p.hi > p.precision);
  assert.equal(p.badlyTuned, false);

  const bad = alertPrecision([{ status: 'false-alarm' }, { status: 'false-alarm' }, { status: 'confirmed' }]);
  assert.equal(bad.badlyTuned, true);
  // Unjudged alerts are never counted as successes.
  const unjudged = alertPrecision([{ status: 'open' }, { status: 'open' }]);
  assert.equal(unjudged.judged, 0);
  assert.equal(unjudged.reliable, false);
  assert.equal(unjudged.precision, null);
});

/* --------------------------------------------------------------- 5. scan */

test('scan over the demo: m counts tested charts, and only adverse rejections promote', () => {
  const state = demo();
  const scan = scanWatch(state, NOW);
  assert.equal(scan.testedCount, scan.series.filter((s) => s.hasChart).length);
  assert.ok(scan.testedCount >= 8, 'the demo reconstructs a real set of series');
  assert.equal(scan.fdr.m, scan.testedCount);
  assert.ok(scan.fdr.rejected.length >= 3);
  // Every promotion is adverse and rejected; every favorable rejection is not.
  for (const promo of scan.promotions) {
    assert.equal(promo.polarity, 'adverse');
    assert.ok(promo.pValue <= promo.threshold + 1e-12);
    assert.ok(promo.frozen.point !== undefined && promo.frozen.dueOn > promo.latestDate);
  }
  const favorableRejections = scan.candidates.filter((c) => c.rejected && c.polarity === 'favorable');
  assert.ok(favorableRejections.length > 0, 'the demo has favorable signals the procedure rejects but does not promote');
});

test('an empty workspace promotes nothing and says why', () => {
  const empty = createEmptyState(NOW.toISOString());
  const scan = scanWatch(empty, NOW);
  assert.equal(scan.promotions.length, 0);
  assert.equal(scan.suppressions.length, 0);
  assert.equal(scan.fdr.m, 0);
  assert.equal(scan.unreducedSeries.length, EW_SERIES_REGISTRY.length);
  assert.ok(scan.unreducedSeries.every((s) => s.reason && s.reason.length > 10));
  assert.equal(watchSignals(empty, NOW).length, 0);
});

test('policy is clamped from settings, so a hand-edited blob cannot disable the detector', () => {
  const p1 = readWatchPolicy({ watchQ: 99, watchAlertBudget: -3, watchTriageDays: 'x' });
  assert.equal(p1.q, 0.5);
  assert.equal(p1.budget, 1);
  assert.equal(p1.triageDays, DEFAULT_SETTINGS.watchTriageDays);
  const p2 = readWatchPolicy({});
  assert.equal(p2.q, DEFAULT_SETTINGS.watchQ);
  assert.equal(p2.autoPropagate, true);
  const p3 = readWatchPolicy({ watchAutoPropagate: false });
  assert.equal(p3.autoPropagate, false);
});

/* ------------------------------------------------------- 6. schema v39 */

test('schema v39: additive migration keeps an existing workspace intact', () => {
  assert.equal(SCHEMA_VERSION, 42);
  const v38 = { ...createEmptyState(NOW.toISOString()), schemaVersion: 38, cases: [], watchAlerts: undefined };
  delete v38.watchAlerts;
  delete v38.watchForecasts;
  const migrated = migrate(v38);
  assert.deepEqual(migrated.applied, ['38 → 39', '39 → 40', '40 → 41', '41 → 42']);
  assert.deepEqual(migrated.raw.watchAlerts, []);
  assert.deepEqual(migrated.raw.watchForecasts, []);
  const normalized = normalizeState(migrated.raw, { now: NOW }).state;
  assert.equal(normalized.schemaVersion, 42);
  assert.deepEqual(normalized.watchAlerts, []);
  assert.equal(normalized.settings.watchQ, DEFAULT_SETTINGS.watchQ);
});

test('normalisers repair in the honest direction and never invent a verdict', () => {
  const raw = {
    schemaVersion: 39,
    watchAlerts: [
      // unknown series → dropped
      { id: 'a1', seriesId: 'not-a-series', detectedOn: TODAY, status: 'confirmed' },
      // unknown status → open (a human is asked), not confirmed
      { id: 'a2', seriesId: 'open-cases', detectedOn: '2026-10-20', status: 'definitely-real' },
      // duplicate series/day → dropped
      { id: 'a3', seriesId: 'open-cases', detectedOn: '2026-10-20', status: 'open' },
      // verdict without a date takes the detection date
      { id: 'a4', seriesId: 'feedback-latency', detectedOn: '2026-10-10', status: 'false-alarm' },
      // future detection date → clamped to today
      { id: 'a5', seriesId: 'open-cases', detectedOn: '2099-01-01', status: 'open' },
      // frozen prediction with a missing number → dropped entirely
      { id: 'a6', seriesId: 'pulse-index', detectedOn: '2026-10-01', status: 'open', frozen: { point: 50, dueOn: '2026-10-10' } },
      // suppressed with an unknown reason → defaulted, never silently promoted
      { id: 'a7', seriesId: 'case-cycle', detectedOn: '2026-10-02', status: 'suppressed', suppressedReason: 'because' },
    ],
    watchForecasts: [
      { id: 'f1', seriesId: 'open-cases', issuedOn: '2026-10-01', dueOn: '2026-10-08', point: 2, lo: 0, hi: 4, baselinePoint: 2, sigma: 0.6 },
      { id: 'f2', seriesId: 'open-cases', issuedOn: '2026-10-01', dueOn: '2026-10-08', point: 2, lo: 0, hi: 4, baselinePoint: 2 },
      { id: 'f3', seriesId: 'ghost', issuedOn: '2026-10-01', dueOn: '2026-10-08', point: 2, lo: 0, hi: 4, baselinePoint: 2 },
      { id: 'f4', seriesId: 'pulse-index', issuedOn: '2026-10-05', dueOn: '2026-10-05', point: 2, lo: 0, hi: 4, baselinePoint: 2 },
    ],
  };
  const { state, warnings } = normalizeState(raw, { now: NOW });
  const ids = state.watchAlerts.map((a) => a.id).sort();
  assert.deepEqual(ids, ['a2', 'a4', 'a5', 'a6', 'a7']);
  const byId = new Map(state.watchAlerts.map((a) => [a.id, a]));
  assert.equal(byId.get('a2').status, 'open');
  assert.equal(byId.get('a4').triagedOn, '2026-10-10');
  assert.equal(byId.get('a5').detectedOn, TODAY);
  assert.equal(byId.get('a6').frozen, null);
  assert.equal(byId.get('a7').suppressedReason, 'cooldown');
  assert.deepEqual(state.watchForecasts.map((f) => f.id), ['f1', 'f4']);
  assert.ok(warnings.some((w) => /invalid historical timing window/.test(w)));
  assert.ok(warnings.some((w) => /not a series that is not monitored/.test(w) || /not monitored/.test(w)));
  assert.ok(warnings.some((w) => /repaired an unrecognised status/.test(w)));
  assert.ok(warnings.some((w) => /no date, so it takes the detection date/.test(w)));
});

test('every alert status and suppression reason in the vocabulary is handled', () => {
  for (const status of EW_ALERT_STATUSES) {
    assert.ok(typeof status === 'string');
  }
  for (const reason of Object.keys(EW_SUPPRESSION_REASONS)) {
    assert.ok(EW_SUPPRESSION_REASONS[reason].length > 20);
  }
  assert.deepEqual([...EW_VERDICTS], ['confirmed', 'false-alarm', 'explained', 'dismissed']);
});

/* -------------------------------------------- 7. the real store cascade */

test('a human confirmation opens exactly one case, once, with a typed edge', () => {
  const h = harness();
  h.store.seedDemo();
  const open = h.store.state.watchAlerts.filter((a) => a.status === 'open');
  assert.ok(open.length >= 1, 'the demo produced at least one alert to triage');
  const alert = open[0];
  const casesBefore = h.store.state.cases.length;
  const result = h.api.triageWatchAlert(alert.id, { verdict: 'confirmed', note: 'Confirmed after checking the underlying records.' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'confirmed');
  assert.equal(h.store.state.cases.length, casesBefore + 1);
  const created = h.store.state.cases.at(-1);
  assert.match(created.title, /Confirmed early warning/);
  assert.equal(created.kind, 'risk');
  assert.equal(created.status, 'open');
  assert.match(created.summary, /Benjamini–Hochberg rank/);
  const link = h.store.state.links.find((l) => l.sourceType === 'case' && l.sourceId === created.id
    && l.targetType === 'alert' && l.targetId === alert.id && l.relation === 'escalates-from');
  assert.ok(link, 'the case points at the alert it came from');
  assert.ok(result.propagations.some((p) => p.ruleId === EW_RULE_IDS.PROMOTE));

  // A second scan must not duplicate the case.
  const beforeSecond = h.store.state.cases.length;
  h.api.scanWatch();
  h.api.scanWatch();
  assert.equal(h.store.state.cases.length, beforeSecond);
});

test('verdicts are one-way, and an unknown verdict is refused', () => {
  const h = harness();
  h.store.seedDemo();
  const alert = h.store.state.watchAlerts.find((a) => a.status === 'open');
  const first = h.api.triageWatchAlert(alert.id, { verdict: 'false-alarm' });
  assert.equal(first.ok, true);
  const second = h.api.triageWatchAlert(alert.id, { verdict: 'confirmed' });
  assert.equal(second.ok, false);
  assert.match(second.error, /one-way/i);
  const bogus = h.api.triageWatchAlert(alert.id, { verdict: 'vibes' });
  assert.equal(bogus.ok, false);
  const missing = h.api.triageWatchAlert('nope', { verdict: 'confirmed' });
  assert.equal(missing.ok, false);
});

test('a false alarm feeds the precision ledger and eventually demotes the series', () => {
  const h = harness();
  h.store.seedDemo();
  const alert = h.store.state.watchAlerts.find((a) => a.status === 'open');
  const seriesId = alert.seriesId;
  h.api.triageWatchAlert(alert.id, { verdict: 'false-alarm' });
  const report = buildWatchReport(h.store.state, h.now ? h.now() : NOW);
  assert.equal(report.precision.falseAlarms, 1);
  assert.equal(report.precision.reliable, false);
  // Two more false alarms on the same series within the look-back make it noisy.
  const crafted = JSON.parse(JSON.stringify(h.store.state));
  crafted.watchAlerts.push(
    { id: 'x1', seriesId, detectedOn: addDays(TODAY, -20), status: 'false-alarm', triagedOn: addDays(TODAY, -20) },
    { id: 'x2', seriesId, detectedOn: addDays(TODAY, -40), status: 'false-alarm', triagedOn: addDays(TODAY, -40) },
  );
  const normalized = normalizeState(crafted, { now: NOW }).state;
  const rescanned = scanWatch(normalized, NOW);
  const row = rescanned.series.find((s) => s.id === seriesId);
  assert.equal(row.noisy, true);
  assert.ok(rescanned.suppressions.some((s) => s.seriesId === seriesId && s.reason === 'noisy-series')
    || rescanned.promotions.every((p) => p.seriesId !== seriesId));
});

/* ---------------------------------------------------- 8. governors */

test('the alert budget suppresses real candidates, records them, and opens one scope decision', () => {
  const state = demo();
  state.settings = { ...state.settings, watchAlertBudget: 1, watchWindowDays: 28 };
  state.watchAlerts = [];
  state.decisions = [];
  let seq = 0;
  const ctx = {
    event: { type: 'watch.scan' },
    now: NOW,
    idFactory: (p) => `${p}-bud${++seq}`,
  };
  const draft = JSON.parse(JSON.stringify(state));
  const effects = earlyWarningRule(draft, ctx);
  const promoted = draft.watchAlerts.filter((a) => a.status === 'open');
  const suppressed = draft.watchAlerts.filter((a) => a.status === 'suppressed' && a.suppressedReason === 'budget');
  assert.equal(promoted.length, 1);
  assert.ok(suppressed.length >= 1, 'a real candidate was suppressed for budget');
  assert.ok(suppressed.every((a) => a.pValue !== null && a.pValue <= 1));
  assert.ok(effects.some((e) => e.ruleId === EW_RULE_IDS.SENSE && e.action === 'suppressed'));
  const scopeDecision = draft.decisions.find((d) => String(d.question).includes(`[${EW_RULE_IDS.BUDGET}:`));
  assert.ok(scopeDecision, 'budget exhaustion opened exactly one monitoring-scope decision');

  // Re-running in the same window must not open a second one.
  const again = JSON.parse(JSON.stringify(draft));
  earlyWarningRule(again, ctx);
  assert.equal(again.decisions.filter((d) => String(d.question).includes(`[${EW_RULE_IDS.BUDGET}:`)).length, 1);
  assert.equal(again.watchAlerts.filter((a) => a.status === 'open').length, 1);
});

test('an alert past the triage deadline escalates into exactly one decision', () => {
  const state = demo();
  state.decisions = [];
  state.watchAlerts = [];
  state.watchForecasts = [];
  state.watchAlerts.push({
    id: 'ew-stale',
    seriesId: 'open-cases',
    detectedOn: addDays(TODAY, -12),
    detectedAt: NOW.toISOString(),
    status: 'open',
    rule: 'beyond-limit',
    polarity: 'adverse',
    severity: 3,
    pValue: 0.0108,
    bhRank: 2,
    bhThreshold: 0.02,
    m: 10,
    q: 0.1,
    latestValue: 4,
    mean: 1.5,
    unpl: 3.2,
    lnpl: 0,
    sigma: 0.6,
    summary: 'A stale alert used to prove the escalation path',
    frozen: null,
    triagedOn: null,
    verdictNote: '',
    linkedCaseId: null,
    linkedDecisionId: null,
    suppressedReason: null,
  });
  let seq = 0;
  const ctx = { event: { type: 'watch.scan' }, now: NOW, idFactory: (p) => `${p}-stale${++seq}` };
  const draft = JSON.parse(JSON.stringify(state));
  const effects = earlyWarningRule(draft, ctx);
  const decisions = draft.decisions.filter((d) => String(d.question).includes(`[${EW_RULE_IDS.STALE}:ew-stale]`));
  assert.equal(decisions.length, 1);
  assert.match(decisions[0].title, /Decide what the Open operational cases signal means/);
  assert.equal(decisions[0].options.length, 4);
  assert.ok(effects.some((e) => e.ruleId === EW_RULE_IDS.STALE));
  const link = draft.links.find((l) => l.sourceType === 'alert' && l.sourceId === 'ew-stale'
    && l.targetType === 'decision' && l.targetId === decisions[0].id && l.relation === 'decides');
  assert.ok(link);

  const again = JSON.parse(JSON.stringify(draft));
  earlyWarningRule(again, ctx);
  assert.equal(again.decisions.filter((d) => String(d.question).includes(`[${EW_RULE_IDS.STALE}:ew-stale]`)).length, 1);
});

test('the pause switch stops event-triggered sensing but never blocks an explicit scan', () => {
  const state = demo();
  state.settings = { ...state.settings, watchAutoPropagate: false };
  state.watchAlerts = [];
  state.watchForecasts = [];
  let seq = 0;
  const idFactory = (p) => `${p}-pause${++seq}`;
  const paused = JSON.parse(JSON.stringify(state));
  earlyWarningRule(paused, { event: { type: 'case.created' }, now: NOW, idFactory });
  assert.equal(paused.watchAlerts.length, 0);
  assert.equal(paused.watchForecasts.length, 0);

  const explicit = JSON.parse(JSON.stringify(state));
  earlyWarningRule(explicit, { event: { type: 'watch.scan' }, now: NOW, idFactory });
  assert.ok(explicit.watchAlerts.length >= 1, 'the human asked, so the scan runs');
});

test('the rule ignores unrelated events and malformed contexts', () => {
  const state = demo();
  const before = JSON.stringify(state.watchAlerts);
  let seq = 0;
  const idFactory = (p) => `${p}-noop${++seq}`;
  assert.deepEqual(earlyWarningRule(JSON.parse(JSON.stringify(state)), { event: { type: 'settings.saved' }, now: NOW, idFactory }), []);
  assert.deepEqual(earlyWarningRule(null, { event: { type: 'watch.scan' }, now: NOW }), []);
  assert.deepEqual(earlyWarningRule({}, {}), []);
  assert.equal(JSON.stringify(state.watchAlerts), before);
});

/* --------------------------------------- 9. wiring, signals, CSV, brief */

test('the rule is registered on the spine, catalogued, and the graph knows the nodes', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(earlyWarningRule));
  const ids = AUTOMATION_RULES.map((r) => r.id);
  for (const ruleId of Object.values(EW_RULE_IDS)) {
    assert.ok(ids.includes(ruleId), `${ruleId} is in the automation catalogue`);
    assert.equal(ids.filter((id) => id === ruleId).length, 1, `${ruleId} is unique`);
  }
  assert.ok(LINK_ENTITY_TYPES.includes('alert'));
  assert.ok(LINK_ENTITY_TYPES.includes('series'));
});

test('signals: a queued alert raises EW-01 but demo replay cannot prove EW-05', () => {
  const state = demo();
  const signals = watchSignals(state, NOW);
  const ids = signals.map((s) => s.ruleId);
  assert.ok(ids.includes('EW-01'));
  assert.ok(!ids.includes('EW-05'), 'demo replay is not evidence of real forecasting skill');
  for (const signal of signals) {
    assert.equal(signal.domain, 'Early warning');
    assert.ok(signal.detail.length > 40);
    assert.ok(Array.isArray(signal.evidence) && signal.evidence.length >= 1);
    assert.ok(signal.action.route.startsWith('#/watch'));
  }
  const insights = buildInsights(state, NOW);
  assert.ok(DOMAIN_ORDER.includes('Early warning'));
  assert.ok(insights.findings.some((f) => f.domain === 'Early warning'));
});

test('CSV scope #40 exports opaque codes and no free text', () => {
  const state = demo();
  const descriptor = CSV_EXPORTS.find((e) => e.key === 'watch');
  assert.ok(descriptor);
  assert.equal(CSV_EXPORTS.length, 40);
  const result = exportWorkspaceCsv(state, 'watch', { now: NOW });
  assert.equal(result.ok, true);
  assert.ok(result.csv.split('\n').length > 2);
  const header = result.csv.split('\n')[0];
  assert.match(header, /^engine_version,row_kind,code,series,status,rule,p_value/);
  assert.ok(!/summary|note|title|name|owner/i.test(header), 'no narrative columns');
  // Alert summaries and verdict notes must never appear in the export.
  for (const alert of state.watchAlerts) {
    if (alert.summary) assert.ok(!result.csv.includes(alert.summary.slice(0, 30)));
  }
  assert.ok(!result.csv.includes('Person '), 'no people');
  assert.ok(result.csv.includes(EW_ENGINE_VERSION));
});

test('the board brief is deterministic and refuses to overstate', () => {
  const state = demo();
  const a = watchBrief(state, NOW);
  const b = watchBrief(state, NOW);
  assert.equal(a, b);
  assert.match(a, /Benjamini–Hochberg/);
  assert.match(a, /p value cannot directly create a case/);
  assert.match(a, /error-rate control.*not established/);
  assert.match(a, /Precision:/);
  assert.match(a, /Forecast skill:/);
  assert.ok(a.length > 800, 'a brief with substance, not a stub');
  const empty = watchBrief(createEmptyState(NOW.toISOString()), NOW);
  assert.match(empty, /Series tested: 0/);
});

test('the demo replay is explicitly excluded from real forecast skill', () => {
  const state = demo();
  const report = buildWatchReport(state, NOW);
  assert.ok(report.forecasts.length >= 20);
  assert.ok(report.forecasts.every((f) => f.dueOn > f.issuedOn));
  assert.ok(report.forecasts.every((f) => f.issuedOn <= f.dueOn));
  assert.equal(report.skill.scored, 0);
  assert.equal(report.skill.reliable, false);
  assert.ok(report.skill.legacy > 0);
  // No prediction may be issued after the week it describes.
  assert.ok(report.forecasts.every((f) => f.issuedOn < f.dueOn));
  assert.ok(state.watchForecasts.length <= 240);
});

/* --------------------------------------------------------------- 10. UI */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (String(error?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(error.message);
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

test('UI: every watch tab renders axe-clean on the demo workspace', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    for (const route of ['#/watch', '#/watch?tab=scan', '#/watch?tab=forecasts', '#/watch?tab=calibration', '#/watch?tab=policy']) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.length > 300, `${route} renders content`);
      assert.ok(!/is not a function|undefined is|NaN/.test(view.textContent), `${route} renders without an error panel`);
      assert.deepEqual(await axeViolations(env), [], `${route} axe-clean`);
    }
    app.ctx.navigate('#/watch');
    assert.match(env.document.querySelector('#view').textContent, /Early-Warning Watch/);
    assert.ok(env.document.querySelector('[href="#/watch"]'), 'reachable from navigation');
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});

test('UI: the verdict dialog confirms an alert and the case appears', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    app.ctx.navigate('#/watch?tab=queue');
    const button = Array.from(env.document.querySelectorAll('#view button'))
      .find((b) => /Record verdict/.test(b.textContent));
    assert.ok(button, 'the queue offers a verdict action');
    button.click();
    const submit = Array.from(env.document.querySelectorAll('button'))
      .find((b) => /Record verdict/.test(b.textContent) && b.closest('.modal'));
    assert.ok(submit, 'the dialog opened');
    submit.click();
    const state = app.ctx.state;
    assert.ok(state.cases.some((c) => /Confirmed early warning/.test(c.title)));
    assert.ok(state.watchAlerts.some((a) => a.status === 'confirmed' && a.linkedCaseId));
  } finally {
    env.dom.window.close();
  }
});
