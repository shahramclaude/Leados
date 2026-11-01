/**
 * tests/app/signal-integrity.test.mjs — Schema v70, ADR-0061, RULE-INT-01..04.
 *
 * What this suite actually proves, in order:
 *   1. the alpha-spending arithmetic is exact and reproducible by hand, and the
 *      budget cannot be overspent by taking more looks;
 *   2. the multiplicity correction is a DECLARED convention (ρ) rather than an
 *      estimate, and Šidák/Bonferroni bracket each other the way they must;
 *   3. precision is measured from the leader's own one-way verdicts with a
 *      Wilson interval, and a figure below the verdict floor is withheld rather
 *      than guessed;
 *   4. every collection is fail-closed: an illegal verdict, a look that tested
 *      nothing and a review claiming a grade it never earned are all dropped;
 *   5. the four rules are marker-idempotent, write inside the caller's
 *      transaction, and never rate a person;
 *   6. the terminal renders, routes, exports and produces an axe-clean page.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION,
  MIGRATIONS,
  DEFAULT_SETTINGS,
  createEmptyState,
  normalizeState,
  normalizeSettings,
  migrate,
} from '../../app/core/schema.js';
import { buildDemoState } from '../../app/core/demo.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { INTEGRITY_EVENTS, INTEGRITY_RULE_IDS } from '../../app/core/domain/integrityRules.js';
import {
  SIGNAL_FAMILIES,
  SIGNAL_VERDICTS,
  STATISTICAL_FAMILIES,
} from '../../app/core/domain/integrityRegistry.js';
import {
  normalizeIntegrityLooks,
  normalizeIntegrityReviews,
  normalizeSignalVerdicts,
} from '../../app/core/domain/integritySchema.js';
import {
  alphaSpent,
  bonferroniAdjusted,
  buildIntegrityReview,
  buildLookLedger,
  collectVerdictObservations,
  effectiveTests,
  gradeIntegrityReview,
  integrityAttentionCount,
  integrityBrief,
  integrityConventions,
  integrityReport,
  integritySignals,
  lookBoundary,
  normalCdf,
  normalInv,
  pooledPrecision,
  reconstructLooks,
  scoreFamily,
  sidakAdjusted,
  signalInstanceKey,
  wilsonInterval,
} from '../../app/core/domain/integrity.js';
import { resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { renderIntegrity } from '../../app/views/integrity.js';
import { parseRoute } from '../../app/main.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const NOW_ISO = '2026-10-31T10:00:00.000Z';
const NOW = new Date(NOW_ISO);
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
  };
}

function harness(initial, now = () => NOW) {
  let seq = 0;
  const store = createStore({ storage: storage(), now, idFactory: (p) => `${p}-s-${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-a-${++seq}` });
  if (initial) assert.equal(store.importJSON(JSON.stringify(initial), { now: now() }).ok, true);
  return { store, api };
}

/** A workspace with a leader and nothing else, unless the caller says otherwise. */
function fixture({ alerts = [], verdicts = [], looks = [], reviews = [], settings = {} } = {}) {
  const s = createEmptyState(NOW_ISO);
  s.meta.isDemo = false;
  s.settings = { ...s.settings, leaderName: 'Rae Mensah', ...settings };
  s.people = [{
    id: 'p-leader', name: 'Rae Mensah', role: 'Engineering Manager', status: 'active',
    startDate: '2024-01-01', managerId: null, talkingPoints: [],
  }];
  s.watchAlerts = alerts;
  s.signalVerdicts = verdicts;
  s.integrityLooks = looks;
  s.integrityReviews = reviews;
  return normalizeState(s, { now: NOW }).state;
}

function alert(id, {
  status = 'open', p = 0.01, day = '2026-10-24', m = 12, rule = 'beyond-limit',
  seriesId = 'open-cases',
} = {}) {
  return {
    id, seriesId, detectedOn: day, detectedAt: `${day}T09:00:00.000Z`,
    status, rule, polarity: 'adverse', severity: 3, pValue: p, bhRank: 1, bhThreshold: 0.05,
    m, q: 0.1, latestValue: 5, mean: 3, unpl: 6, lnpl: 0, sigma: 1, summary: 'Series moved',
    frozen: null, triagedOn: null, verdictNote: '', linkedCaseId: null, linkedDecisionId: null,
    suppressedReason: status === 'suppressed' ? 'budget' : null,
  };
}

function verdictRow(id, domain, ruleId, verdict, day, { key = null, at = null } = {}) {
  return {
    id,
    instanceKey: key || signalInstanceKey({ ruleId, day, title: `${domain} finding ${id}`, personId: 'x' }),
    domain, ruleId, verdict, day,
    recordedAt: at || `${day}T09:00:00.000Z`,
    severityAtVerdict: 3, note: '', source: 'board',
  };
}

/* ------------------------------------------------------------- schema v70 */

describe('schema v70 and fail-closed persistence', () => {
  test('the 69→70 migration adds four empty ledgers and invents nothing', () => {
    assert.equal(SCHEMA_VERSION, 73);
    assert.equal(typeof MIGRATIONS[69], 'function');
    const raw = migrate({ schemaVersion: 69, settings: {}, people: [], watchAlerts: [] });
    assert.deepEqual(raw.applied, ['69 → 70', '70 → 71', '71 → 72', '72 → 73']);
    assert.equal(raw.raw.schemaVersion, 73);
    assert.deepEqual(raw.raw.integrityLooks, []);
    assert.deepEqual(raw.raw.signalVerdicts, []);
    assert.deepEqual(raw.raw.integrityReviews, []);
    assert.deepEqual(raw.raw.integrityMarkers, []);
    const state = normalizeState(raw.raw, { now: NOW }).state;
    assert.equal(state.schemaVersion, 73);
    assert.equal(state.integrityLooks.length, 0);
    assert.equal(state.signalVerdicts.length, 0);
  });

  test('an empty state carries the declared monitoring plan', () => {
    const state = createEmptyState(NOW_ISO);
    assert.equal(state.settings.integrityAlphaPct, 10);
    assert.equal(state.settings.integrityPlannedLooks, 12);
    assert.equal(state.settings.integritySpending, 'pocock');
    assert.equal(state.settings.integrityRhoPct, 30);
    assert.equal(DEFAULT_SETTINGS.integrityPrecisionFloorPct, 60);
  });

  test('a typo in a declared convention is clamped into a band, never read as "off"', () => {
    const s = normalizeSettings({
      integrityAlphaPct: 400,
      integrityPlannedLooks: 1,
      integritySpending: 'nonsense',
      integrityRhoPct: -20,
      integrityPrecisionFloorPct: 5,
      integrityMinVerdicts: 0,
    });
    assert.equal(s.integrityAlphaPct, 50);
    assert.equal(s.integrityPlannedLooks, 2);
    assert.equal(s.integritySpending, 'pocock');
    assert.equal(s.integrityRhoPct, 0);
    assert.equal(s.integrityPrecisionFloorPct, 20);
    assert.equal(s.integrityMinVerdicts, 2);
  });

  test('a look that tested nothing is not a look', () => {
    const warnings = [];
    const rows = normalizeIntegrityLooks([
      { id: 'l1', lookOn: '2026-10-01', recordedAt: '2026-10-01T09:00:00.000Z', seriesTested: 12, pValues: [0.01] },
      { id: 'l2', lookOn: '2026-10-02', recordedAt: '2026-10-02T09:00:00.000Z' },
      { id: 'l3', lookOn: 'not-a-day', recordedAt: '2026-10-03T09:00:00.000Z', seriesTested: 4 },
    ], warnings);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'l1');
    assert.equal(warnings.length, 2);
  });

  test('a p value outside [0, 1] is dropped, never clipped', () => {
    const rows = normalizeIntegrityLooks([{
      id: 'l1', lookOn: '2026-10-01', recordedAt: '2026-10-01T09:00:00.000Z',
      seriesTested: 12, pValues: [0.01, 1.4, -0.2, 1],
    }]);
    assert.deepEqual(rows[0].pValues, [0.01, 1]);
  });

  test('two looks on one day keep the later record — the budget is charged once', () => {
    const rows = normalizeIntegrityLooks([
      { id: 'a', lookOn: '2026-10-01', recordedAt: '2026-10-01T08:00:00.000Z', seriesTested: 12, pValues: [0.01] },
      { id: 'b', lookOn: '2026-10-01', recordedAt: '2026-10-01T18:00:00.000Z', seriesTested: 12, pValues: [0.02] },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'b');
  });

  test('the four legal verdicts are exactly the four the watch ledger uses', () => {
    assert.deepEqual([...SIGNAL_VERDICTS].sort(), ['confirmed', 'dismissed', 'explained', 'false-alarm']);
    const warnings = [];
    const rows = normalizeSignalVerdicts([
      verdictRow('v1', 'Goals', 'GOAL-01', 'confirmed', '2026-10-01'),
      verdictRow('v2', 'Goals', 'GOAL-01', 'maybe', '2026-10-02'),
    ], warnings);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].verdict, 'confirmed');
    assert.equal(warnings.length, 1);
  });

  test('a corrected verdict supersedes the earlier judgement for the same finding', () => {
    const key = signalInstanceKey({ ruleId: 'GOAL-01', day: '2026-10-01', title: 'x', personId: 'p' });
    const rows = normalizeSignalVerdicts([
      verdictRow('v1', 'Goals', 'GOAL-01', 'false-alarm', '2026-10-01', { key }),
      { ...verdictRow('v2', 'Goals', 'GOAL-01', 'confirmed', '2026-10-01', { key }), recordedAt: '2026-10-01T18:00:00.000Z' },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].verdict, 'confirmed');
    assert.equal(rows[0].id, 'v2');
  });

  test('a review without its one probability, or claiming a grade it never earned, is refused', () => {
    const warnings = [];
    const rows = normalizeIntegrityReviews([
      { id: 'r1', frozenAt: '2026-10-01T09:00:00.000Z', reviewOn: '2026-10-20', horizonAlerts: 5, predictedAnyFalseAlarmPct: null },
      {
        id: 'r2', frozenAt: '2026-10-01T09:00:00.000Z', reviewOn: '2026-10-20', horizonAlerts: 5,
        predictedAnyFalseAlarmPct: 40, graded: { gradedAt: '2026-10-21T09:00:00.000Z', brier: 0.2 },
      },
      { id: 'r3', frozenAt: '2026-10-01T09:00:00.000Z', reviewOn: '2026-09-01', horizonAlerts: 5, predictedAnyFalseAlarmPct: 40 },
    ], warnings);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'r2');
    assert.equal(rows[0].graded, null, 'a grade without an outcome returns to frozen');
    assert.equal(warnings.length, 3, 'the missing probability, the unevidenced grade and the inverted window each warn');
  });

  test('the digest is deterministic and stores no name', () => {
    const a = signalInstanceKey({ ruleId: 'CONV-01', day: '2026-10-31', title: 'Priya has had no 1:1', personId: 'p1' });
    const b = signalInstanceKey({ ruleId: 'CONV-01', day: '2026-10-31', title: 'Priya has had no 1:1', personId: 'p1' });
    const c = signalInstanceKey({ ruleId: 'CONV-01', day: '2026-10-31', title: 'Mei has had no 1:1', personId: 'p2' });
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^[0-9a-f]{16}$/);
    assert.equal(/priya|p1/i.test(a), false);
  });
});

/* ------------------------------------------------- normal law & spending */

describe('the normal law, exactly enough for the boundary', () => {
  test('Φ and Φ⁻¹ round-trip and hit the textbook values', () => {
    assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-9);
    assert.ok(Math.abs(normalCdf(1.959964) - 0.975) < 1e-6);
    assert.ok(Math.abs(normalInv(0.975) - 1.959964) < 1e-5);
    assert.ok(Math.abs(normalInv(0.5)) < 1e-6);
    assert.ok(Math.abs(normalCdf(normalInv(0.2)) - 0.2) < 1e-6);
    assert.equal(normalInv(0), null);
    assert.equal(normalInv(1), null);
    assert.equal(normalCdf(-6) < 1e-8, true);
  });
});

describe('alpha spending: the budget cannot be overspent by looking more', () => {
  test('both functions start at zero and end at exactly alpha', () => {
    for (const fn of ['pocock', 'obf']) {
      assert.equal(alphaSpent(fn, 0.1, 0), 0);
      assert.ok(Math.abs(alphaSpent(fn, 0.1, 1) - 0.1) < 1e-6, `${fn} must spend exactly alpha at t = 1`);
    }
  });

  test('spending is monotone non-decreasing in the information fraction', () => {
    for (const fn of ['pocock', 'obf']) {
      let previous = 0;
      for (let i = 1; i <= 12; i += 1) {
        const spend = alphaSpent(fn, 0.1, i / 12);
        assert.ok(spend >= previous - 1e-12, `${fn} must not un-spend`);
        previous = spend;
      }
    }
  });

  test('the increments of every planned look sum to the declared alpha', () => {
    for (const fn of ['pocock', 'obf']) {
      let total = 0;
      for (let k = 1; k <= 12; k += 1) {
        total += lookBoundary({ spending: fn, alpha: 0.1, plannedLooks: 12, lookIndex: k, mEff: 8.7 }).nominalAlpha;
      }
      assert.ok(Math.abs(total - 0.1) < 1e-6, `${fn} increments must sum to alpha, got ${total}`);
    }
  });

  test('OBrien-Fleming protects the ends and Pocock is roughly flat — the trade-off is real', () => {
    const obfFirst = lookBoundary({ spending: 'obf', alpha: 0.1, plannedLooks: 12, lookIndex: 1, mEff: 8.7 });
    const obfLast = lookBoundary({ spending: 'obf', alpha: 0.1, plannedLooks: 12, lookIndex: 12, mEff: 8.7 });
    assert.ok(obfFirst.nominalAlpha < obfLast.nominalAlpha / 10, 'OBF is far stricter early');
    assert.equal(obfFirst.effectivelyUnreachable, true);
    const pocFirst = lookBoundary({ spending: 'pocock', alpha: 0.1, plannedLooks: 12, lookIndex: 1, mEff: 8.7 });
    const pocLast = lookBoundary({ spending: 'pocock', alpha: 0.1, plannedLooks: 12, lookIndex: 12, mEff: 8.7 });
    assert.ok(pocLast.nominalAlpha < pocFirst.nominalAlpha, 'Pocock still tightens slightly toward the end');
    assert.ok(pocFirst.nominalAlpha / pocLast.nominalAlpha < 5, 'but nowhere near the OBF ratio');
  });

  test('a look beyond the plan spends nothing and grants no significance', () => {
    const beyond = lookBoundary({ spending: 'pocock', alpha: 0.1, plannedLooks: 12, lookIndex: 13, mEff: 8.7 });
    assert.equal(beyond.exhausted, true);
    assert.equal(beyond.nominalAlpha, 0);
    assert.equal(beyond.perTestThreshold, 0);
    assert.equal(beyond.zBoundary, null);
    assert.ok(Math.abs(beyond.cumulativeAlpha - 0.1) < 1e-9);
  });

  test('the per-test threshold is the nominal alpha over the effective test count', () => {
    const b = lookBoundary({ spending: 'pocock', alpha: 0.1, plannedLooks: 12, lookIndex: 3, mEff: 8.7 });
    assert.ok(Math.abs(b.perTestThreshold - b.nominalAlpha / 8.7) < 1e-9);
  });
});

describe('multiplicity: a declared convention, bracketed by the two bounds', () => {
  test('effective tests collapse to one at perfect dependence and to m at independence', () => {
    assert.equal(effectiveTests(1, 0.3), 1);
    assert.equal(effectiveTests(12, 0), 12);
    assert.equal(effectiveTests(12, 0.9), 2.1);
    assert.ok(effectiveTests(12, 0.3) < effectiveTests(12, 0.1));
  });

  test('Sidak is never more conservative than Bonferroni, and both are monotone in m', () => {
    const p = 0.01;
    assert.ok(sidakAdjusted(p, 10) <= bonferroniAdjusted(p, 10) + 1e-12);
    assert.ok(sidakAdjusted(p, 20) > sidakAdjusted(p, 10));
    assert.equal(bonferroniAdjusted(0, 10), 0);
    assert.equal(bonferroniAdjusted(1, 10), 1);
    assert.equal(sidakAdjusted(1, 10), 1);
  });

  test('the rho sensitivity is printed rather than hidden', () => {
    const state = fixture({
      looks: [{
        id: 'l1', lookOn: '2026-10-24', recordedAt: '2026-10-24T09:00:00.000Z',
        seriesTested: 12, pValues: [0.01], candidates: 1, promoted: 1,
      }],
    });
    const report = integrityReport(state, NOW);
    assert.equal(report.looks.rhoSensitivity.length, 3);
    const thresholds = report.looks.rhoSensitivity.map((r) => r.perTestThreshold);
    assert.ok(thresholds[0] < thresholds[2], 'declaring more dependence relaxes the bar, as it must');
  });
});

/* ---------------------------------------------------------------- precision */

describe('precision is measured, bracketed, then withheld below the floor', () => {
  test('Wilson matches a hand-checkable case and never leaves [0, 1]', () => {
    const w = wilsonInterval(0, 10);
    assert.equal(w.p, 0);
    assert.ok(Math.abs(w.hi - 0.2775) < 0.002);
    const full = wilsonInterval(10, 10);
    assert.equal(full.p, 1);
    assert.ok(full.lo > 0.7);
    assert.equal(wilsonInterval(0, 0).p, null);
  });

  test('a family below the verdict floor is counted, never scored', () => {
    const conventions = integrityConventions({ integrityMinVerdicts: 4 });
    const score = scoreFamily('Goals', [
      { domain: 'Goals', verdict: 'confirmed' },
      { domain: 'Goals', verdict: 'false-alarm' },
    ], conventions);
    assert.equal(score.n, 2);
    assert.equal(score.status, 'insufficient');
    assert.equal(score.actionable.p, 0.5, 'the point estimate is still printed');
    assert.equal(score.statusLabel, 'insufficient');
  });

  test('over-claiming requires the UPPER bound to fall below the floor', () => {
    const conventions = integrityConventions({ integrityMinVerdicts: 4, integrityPrecisionFloorPct: 60 });
    const bad = scoreFamily('Goals', [
      ...Array.from({ length: 2 }, () => ({ domain: 'Goals', verdict: 'confirmed' })),
      ...Array.from({ length: 7 }, () => ({ domain: 'Goals', verdict: 'false-alarm' })),
      { domain: 'Goals', verdict: 'explained' },
    ], conventions);
    assert.equal(bad.status, 'over-claiming');
    assert.equal(bad.counts['false-alarm'], 7);
    assert.ok(bad.actionable.hi < 0.6);

    const good = scoreFamily('Feedback',
      Array.from({ length: 9 }, () => ({ domain: 'Feedback', verdict: 'confirmed' })), conventions);
    assert.equal(good.status, 'calibrated');
    assert.equal(good.nnAlert, 1);

    const middle = scoreFamily('Conversations', [
      { domain: 'Conversations', verdict: 'confirmed' },
      { domain: 'Conversations', verdict: 'confirmed' },
      { domain: 'Conversations', verdict: 'false-alarm' },
      { domain: 'Conversations', verdict: 'false-alarm' },
      { domain: 'Conversations', verdict: 'explained' },
      { domain: 'Conversations', verdict: 'dismissed' },
    ], conventions);
    assert.equal(middle.status, 'indeterminate');
  });

  test('the four verdicts split into detection truth and actionable truth', () => {
    const score = scoreFamily('Goals', [
      { domain: 'Goals', verdict: 'confirmed' },
      { domain: 'Goals', verdict: 'explained' },
      { domain: 'Goals', verdict: 'dismissed' },
      { domain: 'Goals', verdict: 'false-alarm' },
    ], integrityConventions({}));
    assert.equal(score.trueCount, 3, 'explained and dismissed were real changes');
    assert.equal(score.falseCount, 1);
    assert.equal(score.actionable.n, 2, 'only the decisive verdicts enter actionable precision');
  });

  test('the watch ledger and the board ledger land in one observation set', () => {
    const state = fixture({
      alerts: [
        alert('a1', { status: 'confirmed', seriesId: 'open-cases' }),
        alert('a2', { status: 'false-alarm', seriesId: 'decision-latency', triagedOn: '2026-10-25' }),
        alert('a3', { status: 'suppressed', seriesId: 'feedback-latency' }),
      ],
      verdicts: [verdictRow('v1', 'Goals', 'GOAL-01', 'confirmed', '2026-10-20')],
    });
    const observations = collectVerdictObservations(state);
    assert.equal(observations.length, 3, 'a suppressed candidate carries no verdict, so it is not an observation');
    const early = observations.filter((o) => o.domain === 'Early warning');
    assert.equal(early.length, 2);
    assert.equal(early.every((o) => o.surfaced === true), true);
    assert.equal(observations.filter((o) => o.domain === 'Goals').length, 1);
  });

  test('pooling prints counts below the floor and never invents a zero', () => {
    const thin = pooledPrecision([{ verdict: 'confirmed' }], integrityConventions({ integrityMinVerdicts: 4 }));
    assert.equal(thin.ready, false);
    assert.equal(thin.n, 1);
    assert.equal(thin.actionablePct, 100);
    const empty = pooledPrecision([], integrityConventions({}));
    assert.equal(empty.n, 0);
    assert.equal(empty.actionablePct, null);
    assert.equal(empty.falseAlarmPct, null);
  });
});

/* -------------------------------------------------------------- look ledger */

describe('looks are reconstructed honestly and recorded durably', () => {
  test('alerts reconstruct one look per day, with suppressions counted as candidates', () => {
    const state = fixture({
      alerts: [
        alert('a1', { day: '2026-10-20', p: 0.01, seriesId: 'open-cases' }),
        alert('a2', { day: '2026-10-20', p: 0.04, status: 'suppressed', seriesId: 'decision-latency' }),
        alert('a3', { day: '2026-10-27', p: 0.008, seriesId: 'open-cases' }),
      ],
    });
    const looks = reconstructLooks(state);
    assert.equal(looks.length, 2);
    assert.equal(looks[0].candidates, 2);
    assert.equal(looks[0].promoted, 1);
    assert.equal(looks[1].candidates, 1);
  });

  test('a durable record wins over a reconstruction of the same day', () => {
    const state = fixture({
      alerts: [alert('a1', { day: '2026-10-20', p: 0.01 })],
      looks: [{
        id: 'l1', lookOn: '2026-10-20', recordedAt: '2026-10-20T09:00:00.000Z',
        seriesTested: 12, candidates: 1, promoted: 1, pValues: [0.01],
        alphaPctAtLook: 5, plannedLooksAtLook: 26, spendingAtLook: 'obf', note: '',
      }],
    });
    const ledger = buildLookLedger(state, NOW, state.settings);
    assert.equal(ledger.length, 1, 'one day is one look, not two');
    assert.equal(ledger[0].source, 'scan');
    assert.equal(ledger[0].planInForce, true);
    assert.equal(ledger[0].alphaPct, 5, 'the plan in force on that day is the one that is used');
    assert.equal(ledger[0].plannedLooks, 26);
  });

  test('the survivor count is the candidates that clear the derived threshold, not a stored number', () => {
    const state = fixture({
      looks: [{
        id: 'l1', lookOn: '2026-10-24', recordedAt: '2026-10-24T09:00:00.000Z',
        seriesTested: 12, candidates: 3, promoted: 1, pValues: [0.0001, 0.02, 0.3],
      }],
    });
    const [look] = buildLookLedger(state, NOW, state.settings);
    assert.ok(look.boundary.perTestThreshold > 0);
    assert.equal(look.survivors, 1);
    assert.equal(look.weakestSurvivor, 0.0001);
    assert.equal(look.minP, 0.0001);
  });

  test('a reconstruction is flagged a lower bound; a durable record is not', () => {
    const reconstructedOnly = integrityReport(fixture({ alerts: [alert('a1')] }), NOW);
    assert.equal(reconstructedOnly.looks.lowerBound, true);
    assert.ok(reconstructedOnly.looks.reconstructedDays >= 1);
    const durable = integrityReport(fixture({
      looks: [{
        id: 'l1', lookOn: '2026-10-24', recordedAt: '2026-10-24T09:00:00.000Z',
        seriesTested: 12, candidates: 0, promoted: 0, pValues: [], note: '',
      }],
    }), NOW);
    assert.equal(durable.looks.lowerBound, false);
    assert.equal(durable.looks.used, 1);
  });
});

/* ------------------------------------------------------- frozen & grading */

describe('a frozen review is a claim, graded once, from what actually followed', () => {
  function reviewed({ freezeDay = '2026-10-01', reviewOn = '2026-10-25', verdicts = [], horizon = 3 } = {}) {
    const state = fixture({ verdicts });
    const past = new Date(`${freezeDay}T10:00:00.000Z`);
    const report = integrityReport(state, past);
    const built = buildIntegrityReview(report, {
      id: 'r1', label: 'Review', reviewOn, horizonAlerts: horizon, nowIso: past.toISOString(),
    });
    assert.equal(built.ok, true);
    return built.record;
  }

  test('the frozen probability is the declared false-alarm rate compounded over the horizon', () => {
    const verdicts = [
      ...Array.from({ length: 6 }, (_, i) => verdictRow(`v${i}`, 'Goals', 'GOAL-01', 'confirmed', `2026-09-0${i + 1}`)),
      verdictRow('f1', 'Goals', 'GOAL-02', 'false-alarm', '2026-09-09'),
    ];
    const record = reviewed({ verdicts, horizon: 3 });
    // 1 of 7 verdicts was noise, so 1 - (1 - 1/7)^3 = 0.3703 -> 37.03%.
    const expected = (1 - (1 - 1 / 7) ** 3) * 100;
    assert.ok(Math.abs(record.predictedAnyFalseAlarmPct - expected) < 0.05, `got ${record.predictedAnyFalseAlarmPct}`);
  });

  test('a freeze with no verdicts is refused, never a guess with a date on it', () => {
    const report = integrityReport(fixture({}), NOW);
    const built = buildIntegrityReview(report, { id: 'r1', reviewOn: '2026-11-30', nowIso: NOW_ISO });
    assert.equal(built.ok, false);
    assert.match(built.error, /verdicts/);
  });

  test('grading counts only surfaced verdicts inside the window, and Brier follows', () => {
    const record = reviewed({
      freezeDay: '2026-10-01',
      reviewOn: '2026-10-25',
      verdicts: [
        verdictRow('v1', 'Goals', 'GOAL-01', 'confirmed', '2026-09-20'),
        verdictRow('v2', 'Goals', 'GOAL-01', 'false-alarm', '2026-10-10'),
        verdictRow('v3', 'Goals', 'GOAL-02', 'confirmed', '2026-10-12'),
        verdictRow('v4', 'Goals', 'GOAL-03', 'confirmed', '2026-10-27'),
      ],
    });
    const state = fixture({
      verdicts: [
        verdictRow('v1', 'Goals', 'GOAL-01', 'confirmed', '2026-09-20'),
        verdictRow('v2', 'Goals', 'GOAL-01', 'false-alarm', '2026-10-10'),
        verdictRow('v3', 'Goals', 'GOAL-02', 'confirmed', '2026-10-12'),
        verdictRow('v4', 'Goals', 'GOAL-03', 'confirmed', '2026-10-27'),
      ],
    });
    const grade = gradeIntegrityReview(record, state, NOW);
    assert.equal(grade.anyFalse, true);
    assert.equal(grade.scored, 2, 'the pre-freeze and post-window verdicts are excluded');
    assert.equal(grade.falseAlarms, 1);
    assert.ok(Math.abs(grade.brier - (record.predictedAnyFalseAlarmPct / 100 - 1) ** 2) < 1e-6);
  });

  test('an ungradable review stays ungraded instead of inventing an outcome', () => {
    const record = reviewed({ freezeDay: '2026-10-01', reviewOn: '2026-10-25', verdicts: [
      verdictRow('v1', 'Goals', 'GOAL-01', 'confirmed', '2026-09-20'),
      verdictRow('v2', 'Goals', 'GOAL-01', 'confirmed', '2026-09-21'),
    ] });
    const state = fixture({ verdicts: [] });
    assert.equal(gradeIntegrityReview(record, state, NOW), null);
    const early = { ...record, reviewOn: '2026-12-31' };
    assert.equal(gradeIntegrityReview(early, state, NOW), null, 'a window that has not closed cannot be graded');
  });
});

/* ------------------------------------------------------------------- rules */

describe('RULE-INT-01..04 on the post-commit spine', () => {
  test('a watch scan records exactly one look, and a second scan the same day does not', () => {
    const { store, api } = harness(fixture({}));
    const first = api.runWatchScan ? null : null;
    void first;
    store.update((draft) => {
      draft.watchAlerts = Array.isArray(draft.watchAlerts) ? draft.watchAlerts : [];
      draft.watchAlerts.push(alert('a-new', { day: '2026-10-31', p: 0.006 }));
    }, { type: 'watch.scan', entity: 'workspace', entityId: '', summary: 'scan' });
    assert.equal(store.state.integrityLooks.length, 1);
    const look = store.state.integrityLooks[0];
    assert.equal(look.lookOn, '2026-10-31');
    assert.equal(look.planInForceError, undefined);
    assert.equal(look.alphaPctAtLook, 10);
    assert.deepEqual(look.pValues, [0.006]);
    assert.equal(look.seriesTested, 12);

    store.update((draft) => {
      draft.watchAlerts.push(alert('a-new-2', { day: '2026-10-31', p: 0.004 }));
    }, { type: 'watch.scan', entity: 'workspace', entityId: '', summary: 'scan again' });
    assert.equal(store.state.integrityLooks.length, 1, 'the budget is charged once per day, not once per scan');
  });

  test('an explicit integrity scan records the look and grades a due review', () => {
    const { store, api } = harness(fixture({}));
    store.update((draft) => {
      draft.integrityReviews = [{
        id: 'r-due', label: 'Due', frozenAt: '2026-10-01T09:00:00.000Z', reviewOn: '2026-10-20',
        alphaPct: 10, plannedLooks: 12, spending: 'pocock', looksUsed: 1, cumulativeAlphaPct: 1.3,
        perTestThreshold: 0.001, seriesTested: 12, mEff: 8.7, verdictsScored: 4, familiesScored: 1,
        pooledDetectionPct: 75, pooledActionablePct: 60, pooledFalseAlarmPct: 40,
        horizonAlerts: 3, predictedAnyFalseAlarmPct: 78.4, graded: null, challengeNotes: [],
      }];
      draft.signalVerdicts = [
        verdictRow('v1', 'Goals', 'GOAL-01', 'false-alarm', '2026-10-10'),
        verdictRow('v2', 'Goals', 'GOAL-02', 'confirmed', '2026-10-12'),
      ];
    }, { type: 'settings.updated', entity: 'settings', entityId: '', summary: 'seed' });

    const result = api.scanIntegrity();
    assert.equal(result.ok, true);
    const review = store.state.integrityReviews.find((r) => r.id === 'r-due');
    assert.ok(review.graded, 'the due review is graded by the scan');
    assert.equal(review.graded.anyFalse, true);
    assert.equal(review.graded.scored, 2);
    assert.ok(store.state.integrityLooks.length >= 1);
  });

  test('a verdict re-scores its family and, when the interval is entirely below the floor, opens one owned task', () => {
    const { store, api } = harness(fixture({}));
    const verdicts = [];
    for (let i = 0; i < 9; i += 1) {
      verdicts.push(verdictRow(`seed-${i}`, 'Goals', `GOAL-0${i}`, 'false-alarm', `2026-10-0${(i % 9) + 1}`));
    }
    store.update((draft) => { draft.signalVerdicts = verdicts; },
      { type: 'settings.updated', entity: 'settings', entityId: '', summary: 'seed' });

    const before = store.state.delegations.length;
    const result = api.recordSignalVerdict({
      domain: 'Goals', ruleId: 'GOAL-01', title: 'Goals finding', verdict: 'false-alarm',
    });
    assert.equal(result.ok, true);
    const tasks = store.state.delegations.filter((d) => d.title.includes('Goals'));
    assert.equal(tasks.length, 1, 'exactly one calibration task');
    assert.equal(store.state.delegations.length, before + 1);
    assert.equal(tasks[0].personId, 'p-leader', 'the task is the leader\'s — never the colleague\'s');
    assert.match(tasks[0].expectedOutcome, /raise the rule|narrow the population|retire the rule/);

    // Idempotent within the week.
    api.recordSignalVerdict({ domain: 'Goals', ruleId: 'GOAL-02', title: 'Another goals finding', verdict: 'false-alarm' });
    assert.equal(store.state.delegations.filter((d) => d.title.includes('Goals')).length, 1,
      'one calibration task per family per ISO week');
  });

  test('the error-budget governor opens one decision, not a nag, and never changes the plan', () => {
    const { store, api } = harness(fixture({}));
    // Eight recorded looks plus the look today's scan records = nine of a
    // twelve-look plan: 82.8% of a Pocock budget spent with 25% of the plan
    // still to run, which is exactly the pace the governor exists to price.
    const looks = [];
    for (let i = 0; i < 8; i += 1) {
      looks.push({
        id: `l-${i}`, lookOn: `2026-10-${String(10 + i).padStart(2, '0')}`,
        recordedAt: `2026-10-${String(10 + i).padStart(2, '0')}T09:00:00.000Z`,
        seriesTested: 12, candidates: 1, promoted: 1, pValues: [0.01],
        alphaPctAtLook: 10, plannedLooksAtLook: 12, spendingAtLook: 'pocock', note: '',
      });
    }
    store.update((draft) => { draft.integrityLooks = looks; },
      { type: 'settings.updated', entity: 'settings', entityId: '', summary: 'seed' });
    const alphaBefore = store.state.settings.integrityAlphaPct;

    const result = api.scanIntegrity();
    assert.equal(result.ok, true);
    const decisions = store.state.decisions.filter((d) => /error budget/i.test(d.title));
    assert.equal(decisions.length, 1, 'exactly one governed decision');
    assert.equal(decisions[0].options.length, 4);
    assert.equal(store.state.settings.integrityAlphaPct, alphaBefore, 'the rule never changes the plan itself');

    api.scanIntegrity();
    assert.equal(store.state.decisions.filter((d) => /error budget/i.test(d.title)).length, 1,
      'the marker holds within the week');
  });

  test('every rule is registered on the spine and carries an auditable contract', () => {
    assert.ok(DEFAULT_POST_COMMIT_RULES.some((r) => r.id === 'integrity'));
    const contract = PROPAGATION_CONTRACTS.find((c) => c.module === 'integrityRules.js');
    assert.ok(contract, 'the rule has a published contract');
    assert.match(contract.purpose, /RULE-INT-01/);
    assert.match(contract.purpose, /no person is scored/);
    assert.ok(contract.writes.includes('integrityLooks'));
    assert.ok(contract.writes.includes('integrityReviews'));
    assert.equal(INTEGRITY_EVENTS.SCAN, 'integrity.scan');
    assert.equal(INTEGRITY_RULE_IDS.LOOK, 'RULE-INT-01');
  });

  test('the record and the decision are navigable from a frozen review', () => {
    const { store, api } = harness(fixture({}));
    const verdicts = Array.from({ length: 5 }, (_, i) => verdictRow(`v${i}`, 'Goals', 'GOAL-01', 'confirmed', `2026-10-0${i + 1}`));
    store.update((draft) => { draft.signalVerdicts = verdicts; },
      { type: 'settings.updated', entity: 'settings', entityId: '', summary: 'seed' });
    const frozen = api.freezeIntegrityReview({ reviewOn: '2026-11-30', horizonAlerts: 4 });
    assert.equal(frozen.ok, true);
    const resolved = resolveLinkedEntity(store.state, 'integrityreview', frozen.id);
    assert.ok(resolved, 'the review resolves as a first-class graph node');
    assert.equal(resolved.type, 'integrityreview');
    assert.match(resolved.route, /#\/integrity\?panel=ledger&review=/);
    assert.equal(resolved.raw.id, frozen.id);
  });
});

/* ---------------------------------------------------------------- actions */

describe('the api surface refuses what it cannot support', () => {
  test('an illegal verdict is refused with the legal vocabulary', () => {
    const { api } = harness(fixture({}));
    const bad = api.recordSignalVerdict({ domain: 'Goals', ruleId: 'GOAL-01', title: 'x', verdict: 'probably' });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /confirmed/);
    const badDomain = api.recordSignalVerdict({ domain: 'Nonexistent', ruleId: 'X', title: 'x', verdict: 'confirmed' });
    assert.equal(badDomain.ok, false);
  });

  test('a review cannot be frozen into the past, and a graded review is immutable', () => {
    const { store, api } = harness(fixture({}));
    store.update((draft) => {
      draft.signalVerdicts = Array.from({ length: 6 }, (_, i) => verdictRow(`v${i}`, 'Goals', 'GOAL-01', 'confirmed', `2026-09-0${i + 1}`));
    }, { type: 'settings.updated', entity: 'settings', entityId: '', summary: 'seed' });
    const past = api.freezeIntegrityReview({ reviewOn: '2026-09-01' });
    assert.equal(past.ok, false);
    const ok = api.freezeIntegrityReview({ reviewOn: '2026-11-15', horizonAlerts: 5 });
    assert.equal(ok.ok, true);
    const early = api.gradeIntegrityReviewNow(ok.id);
    assert.equal(early.ok, false, 'a window that has not closed cannot be graded');
    assert.match(early.error, /cannot be graded yet/);
  });

  test('declaring a plan refuses an out-of-band number instead of silently clamping it', () => {
    const { api } = harness(fixture({}));
    assert.equal(api.declareIntegrityPlan({ integrityAlphaPct: 90 }).ok, false);
    assert.equal(api.declareIntegrityPlan({ integritySpending: 'fancy' }).ok, false);
    assert.equal(api.declareIntegrityPlan({}).ok, false);
    const ok = api.declareIntegrityPlan({ integrityAlphaPct: 5, integrityPlannedLooks: 26, integritySpending: 'obf' });
    assert.equal(ok.ok, true);
    assert.equal(ok.settings.integrityAlphaPct, 5);
  });

  test('every integrity action is exposed on the api object', () => {
    const { api } = harness(fixture({}));
    for (const name of ['recordSignalVerdict', 'scanIntegrity', 'declareIntegrityPlan', 'freezeIntegrityReview',
      'gradeIntegrityReviewNow', 'deleteIntegrityReview', 'integrityRead', 'integrityBriefText', 'integrityVerdictsRead']) {
      assert.equal(typeof api[name], 'function', `${name} must be callable from the UI`);
    }
    assert.ok(api.integrityRead().suite.families > 50);
    assert.ok(api.integrityBriefText().includes('SIGNAL INTEGRITY'));
    assert.deepEqual(api.integrityVerdictsRead(), []);
  });
});

/* ------------------------------------------------------------ signals & csv */

describe('the board speaks to the recommendation engine and the export layer', () => {
  test('the family registry and the insight buckets cover each other in both directions', () => {
    const registered = new Set(SIGNAL_FAMILIES.map((f) => f.domain));
    for (const family of SIGNAL_FAMILIES) {
      assert.ok(DOMAIN_ORDER.includes(family.domain), `${family.domain} must have an insight bucket`);
    }
    assert.deepEqual([...STATISTICAL_FAMILIES], ['Early warning'], 'exactly one p-valued family is claimed');
    assert.ok(registered.has('Signal integrity'));
  });

  test('an ungraded suite raises INT-03 and a measured over-claim raises INT-02', () => {
    const unfired = integritySignals(fixture({}), NOW, null, [
      { domain: 'Goals', ruleId: 'GOAL-01', severity: 3 },
      { domain: 'Conversations', ruleId: 'CONV-01', severity: 4 },
    ]);
    assert.ok(unfired.some((s) => s.ruleId === 'INT-03'), 'a suite nobody has graded says so');
    assert.equal(integritySignals(fixture({}), NOW, null, []).some((s) => s.ruleId === 'INT-03'), false,
      'and stays silent on a workspace with nothing to judge');
    assert.equal(integritySignals(fixture({}), NOW, null, [{ domain: 'People', ruleId: 'SETUP-01', severity: 1 }])
      .some((s) => s.ruleId === 'INT-03'), false, 'a setup nudge is not a detector firing');
    const overclaiming = fixture({
      verdicts: Array.from({ length: 9 }, (_, i) => verdictRow(`v${i}`, 'Goals', `GOAL-0${i}`, 'false-alarm', '2026-10-01')),
    });
    const signals = integritySignals(overclaiming, NOW);
    assert.ok(signals.some((s) => s.ruleId === 'INT-02'));
    assert.ok(integrityAttentionCount(overclaiming, NOW) >= 1);
    const insights = buildInsights(overclaiming, NOW);
    assert.ok(insights.counts['Signal integrity'] > 0, 'the bucket is not silently dropped from the roll-up');
  });

  test('the brief is aggregate-only and names its own limits', () => {
    const text = integrityBrief(buildDemoState(NOW), NOW);
    assert.match(text, /SIGNAL INTEGRITY/);
    assert.match(text, /no person is scored/);
    assert.match(text, /LOWER BOUND|recorded durably/);
    assert.equal(/Priya|Jordan|Mei/.test(text), false, 'no name enters the brief');
  });

  test('CSV scope #60 exports family rows and look rows with blank cells, never zeros', () => {
    const scope = CSV_EXPORTS.find((s) => s.key === 'signal-integrity');
    assert.ok(scope, 'the scope is registered');
    assert.ok(CSV_EXPORTS.indexOf(scope) === 59, 'it is scope #60');
    assert.match(scope.description, /BLANK/);
    const exported = exportWorkspaceCsv(fixture({ verdicts: [
      verdictRow('v1', 'Goals', 'GOAL-01', 'confirmed', '2026-10-01'),
    ] }), 'signal-integrity', { now: NOW });
    assert.equal(exported.ok, true);
    const parsed = parseCsv(exported.csv);
    const records = parsed.rows.map((cells) => Object.fromEntries(parsed.headers.map((key, i) => [key, cells[i]])));
    assert.ok(records.length >= SIGNAL_FAMILIES.length, 'one row per family');
    const goals = records.find((r) => r.family === 'Goals');
    assert.equal(goals.verdicts, '1');
    // One confirmed verdict is a real point estimate but far below the four-verdict
    // floor, so the status is "insufficient" while the figure itself is printed —
    // the blank cell belongs to families with no decisive verdict at all.
    assert.equal(goals.status, 'insufficient');
    assert.equal(records.find((r) => r.family === 'Recognition').actionable_precision_pct, '',
      'a family with no verdicts leaves the cell blank, never zero');
    assert.ok(parsed.headers.includes('per_test_threshold'));
    assert.equal(/Priya|Jordan/.test(exported.csv), false);
  });
});

/* --------------------------------------------------------------------- UI */

describe('the terminal renders as a terminal, not a form', () => {
  function renderDom(state, hash) {
    const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div></body></html>', {
      url: `https://example.test/${hash}`, pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const { window } = dom;
    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.Node = window.Node;
    globalThis.Element = window.Element;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.Event = window.Event;
    globalThis.MouseEvent = window.MouseEvent;
    const [pathPart, queryPart] = hash.replace(/^#/, '').split('?');
    const ctx = {
      state,
      now: NOW,
      query: new URLSearchParams(queryPart || ''),
      navigate: () => {},
      api: {
        integrityRead: () => integrityReport(state, NOW, state.settings || {}),
        integrityBriefText: () => integrityBrief(state, NOW, state.settings || {}),
        scanIntegrity: () => ({ ok: true, changed: true }),
        recordSignalVerdict: () => ({ ok: true }),
        declareIntegrityPlan: () => ({ ok: true }),
        freezeIntegrityReview: () => ({ ok: true, record: { predictedAnyFalseAlarmPct: 40, horizonAlerts: 6 } }),
        gradeIntegrityReviewNow: () => ({ ok: true, grade: { brier: 0.1 } }),
        deleteIntegrityReview: () => ({ ok: true }),
      },
      route: pathPart,
    };
    window.document.getElementById('view').appendChild(renderIntegrity(ctx));
    return dom;
  }

  test('routes, aliases and the nav entry all reach the board', () => {
    assert.equal(parseRoute('#/integrity').route, 'integrity');
    assert.equal(parseRoute('#/integrity?panel=ledger').route, 'integrity');
    assert.equal(parseRoute('#/signal-integrity').route, 'integrity');
    assert.equal(parseRoute('#/false-discovery').route, 'integrity');
    assert.equal(parseRoute('#/error-budget').route, 'integrity');
    const source = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
    assert.match(source, /route: 'integrity'/);
    assert.match(source, /renderIntegrity/);
    assert.match(source, /integrityAttentionCount/);
  });

  test('the demo workspace renders one h1, named tables and honest figures', () => {
    const state = buildDemoState(NOW);
    const dom = renderDom(state, '#/integrity');
    const { document } = dom.window;
    assert.equal(document.querySelectorAll('h1').length, 1);
    const text = document.body.textContent;
    assert.match(text, /Signal integrity/);
    assert.match(text, /Error budget left/);
    assert.match(text, /Actionable precision/);
    for (const table of document.querySelectorAll('table')) {
      assert.ok(table.getAttribute('aria-label'), 'every table announces its purpose');
    }
    dom.window.close();
  });

  test('every panel renders and the inventory shows each family once', () => {
    const state = buildDemoState(NOW);
    for (const panel of ['overview', 'inventory', 'verdicts', 'ledger', 'method']) {
      const dom = renderDom(state, `#/integrity?panel=${panel}`);
      const { document } = dom.window;
      assert.equal(document.querySelectorAll('h1').length, 1, `${panel} has exactly one h1`);
      const text = document.body.textContent;
      assert.ok(text.length > 400, `${panel} renders real content`);
      if (panel === 'inventory') {
        const rows = document.querySelectorAll('tbody tr');
        assert.ok(rows.length >= SIGNAL_FAMILIES.length, 'every family is listed');
        assert.match(text, /Fired today/);
      }
      if (panel === 'method') {
        assert.match(text, /Lan–DeMets|Lan/);
        assert.match(text, /refuses to claim/);
      }
      if (panel === 'ledger') {
        assert.match(text, /Recorded looks/);
        assert.match(text, /Frozen reviews/);
      }
      dom.window.close();
    }
  });

  test('the board is axe-clean on every panel', async () => {
    const state = buildDemoState(NOW);
    for (const panel of ['overview', 'inventory', 'verdicts', 'ledger', 'method']) {
      const dom = renderDom(state, `#/integrity?panel=${panel}`);
      dom.window.eval(AXE_SRC);
      const result = await dom.window.axe.run(dom.window.document.getElementById('view'), {
        rules: { 'color-contrast': { enabled: false } },
      });
      assert.deepEqual(Array.from(result.violations).map((v) => v.id), [], `${panel} is axe-clean`);
      dom.window.close();
    }
  });

  test('an empty workspace gets an honest dead end, not an empty table', () => {
    const blank = normalizeState(createEmptyState(NOW_ISO), { now: NOW }).state;
    const dom = renderDom(blank, '#/integrity');
    const text = dom.window.document.body.textContent;
    assert.match(text, /nothing to audit yet/i);
    assert.match(text, /will not invent it/);
    dom.window.close();
  });

  test('the demo carries a graded review whose prediction predates its grade', () => {
    const state = buildDemoState(NOW);
    const graded = state.integrityReviews.filter((r) => r.graded);
    assert.ok(graded.length >= 1, 'at least one review is graded');
    for (const review of graded) {
      assert.ok(review.frozenAt.slice(0, 10) <= review.reviewOn);
      assert.ok(review.graded.gradedAt.slice(0, 10) >= review.reviewOn);
      assert.ok(Number.isFinite(review.graded.brier));
    }
    const pending = state.integrityReviews.filter((r) => !r.graded);
    assert.ok(pending.length >= 1, 'and one is still a live claim');
    assert.ok(state.integrityLooks.length >= 5, 'the budget has a real spend curve');
    const overclaiming = integrityReport(state, NOW).precision.overClaiming;
    assert.ok(overclaiming.length >= 1, 'the demo shows a family measured below its floor');
  });
});
