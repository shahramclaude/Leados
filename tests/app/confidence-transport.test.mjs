/**
 * tests/app/confidence-transport.test.mjs — Schema v72, ADR-0064,
 * RULE-CTR-01..04.
 *
 * What this suite proves, in order:
 *   1. the arithmetic is exact where it can be checked: sigmoid/logit, Wilson
 *      bounds, and a Platt fit that recovers a known distortion;
 *   2. isotonic calibration is monotone by construction, is smoothed rather than
 *      pinned to 0/100 by a single observation, and extends sensibly at the ends;
 *   3. the prequential walk has no look-ahead, and an in-sample fit is more
 *      optimistic than the same model scored prospectively;
 *   4. the verdict obeys its own rule: insufficient below the floors, no gain
 *      when the record is already calibrated, supported when it is not, and
 *      harmful when translating would damage a calibrated record;
 *   5. every adapter reads its ledger as documented, including polarity,
 *      ambiguous-outcome exclusion and survival censoring;
 *   6. Schema v72 is additive and fail-closed;
 *   7. the rules fire through the real store inside the transaction,
 *      marker-idempotent, never rewriting a declaration;
 *   8. links, resolver, insights bucket, CSV scope and the six panels are wired;
 *   9. the demo freezes before it grades.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION,
  MIGRATIONS,
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
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import {
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  SYSTEM_GENERATED_LINK_RELATIONS,
  resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import {
  CONFIDENCE_RULE_IDS,
  CONFIDENCE_SOURCES,
  CONFIDENCE_VERDICTS,
} from '../../app/core/domain/confidenceRegistry.js';
import {
  normalizeConfidenceBlocks,
  normalizeConfidenceCertificates,
  normalizeConfidenceMarkers,
} from '../../app/core/domain/confidenceSchema.js';
import {
  applyMap,
  buildConfidenceCertificate,
  certificateDue,
  certificateLedger,
  confidenceBrief,
  confidenceConventions,
  confidenceReport,
  confidenceSignals,
  decide,
  extractConfidenceSamples,
  fitIsotonic,
  fitPlatt,
  gradeConfidenceCertificate,
  logitPct,
  murphyDecomposition,
  pairedInterval,
  prequentialRace,
  sigmoid,
  wilsonInterval,
} from '../../app/core/domain/confidence.js';
import { confidenceRule, CONFIDENCE_TRIGGERS } from '../../app/core/domain/confidenceRules.js';
import { parseRoute } from '../../app/main.js';
import { renderConfidence } from '../../app/views/confidence.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const NOW_ISO = '2026-10-31T10:00:00.000Z';
const NOW = new Date(NOW_ISO);
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

function storage() {
  const map = new Map();
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

const day = (offset) => new Date(NOW.getTime() + offset * 86400000).toISOString().slice(0, 10);

function baseState() {
  const s = createEmptyState(NOW_ISO);
  s.meta.isDemo = false;
  s.settings = { ...s.settings, leaderName: 'Rae Mensah', confidenceMinTrain: 8, confidenceMinScored: 10, confidenceMinSamples: 16 };
  s.people = [
    { id: 'p-leader', name: 'Rae Mensah', role: 'EM', status: 'active', startDate: '2024-01-01', managerId: null, talkingPoints: [] },
    { id: 'p-2', name: 'Ola Berg', role: 'Engineer', status: 'active', startDate: '2024-01-01', managerId: 'p-leader', talkingPoints: [] },
  ];
  return s;
}

/**
 * A year of settled calls. Higher declarations land slightly more often and every
 * band lands far below what was declared — the ordinary shape of overconfidence,
 * deterministic so the suite does not depend on a random seed.
 */
function overconfidentCalls(n = 60, { start = 215, step = 3 } = {}) {
  const declarations = [65, 70, 75, 80, 85, 90, 95];
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const declared = declarations[i % declarations.length];
    const hit = ((i * 37) % 100) < (28 + (i % declarations.length) * 2);
    const decidedDaysAgo = start - i * step;
    const reviewedDaysAgo = decidedDaysAgo - 21;
    rows.push({
      id: `dec-${i + 1}`,
      title: `Settled call ${i + 1}`,
      question: 'A call recorded with a probability before the outcome was known',
      date: day(-decidedDaysAgo),
      reversibility: 'reversible',
      driver: 'Rae Mensah',
      approver: 'Rae Mensah',
      contributors: '',
      informed: '',
      options: [],
      chosen: 'The option on the table',
      rationale: 'Journal entry',
      reviewOn: day(-reviewedDaysAgo),
      reviewedOn: day(-reviewedDaysAgo),
      outcome: hit ? 'good' : 'bad',
      outcomeNotes: '',
      forecastProbability: declared,
      decidedOn: day(-decidedDaysAgo),
      createdAt: `${day(-decidedDaysAgo)}T09:00:00.000Z`,
    });
  }
  return rows;
}

/**
 * Calls whose per-band hit rate equals the declaration, twenty per band: an
 * exactly calibrated record. No monotone map can beat it, so the only honest
 * verdict is `no-gain`.
 */
function calibratedCalls() {
  const declarations = [65, 70, 75, 80, 85, 90, 95];
  const rows = [];
  let i = 0;
  for (const declared of declarations) {
    const hits = Math.round((declared * 20) / 100);
    for (let k = 0; k < 20; k += 1) {
      const decidedDaysAgo = 200 - i * 3;
      const reviewedDaysAgo = decidedDaysAgo - 21;
      rows.push({
        id: `cdec-${i + 1}`,
        title: `Calibrated call ${i + 1}`,
        question: 'A call whose declared probability matches its own hit rate',
        date: day(-decidedDaysAgo),
        reversibility: 'reversible',
        driver: 'Rae Mensah',
        approver: 'Rae Mensah',
        contributors: '',
        informed: '',
        options: [],
        chosen: 'The option on the table',
        rationale: 'Journal entry',
        reviewOn: day(-reviewedDaysAgo),
        reviewedOn: day(-reviewedDaysAgo),
        outcome: k < hits ? 'good' : 'bad',
        outcomeNotes: '',
        forecastProbability: declared,
        decidedOn: day(-decidedDaysAgo),
        createdAt: `${day(-decidedDaysAgo)}T09:00:00.000Z`,
      });
      i += 1;
    }
  }
  return rows;
}

const confidenceEffects = (result) => (result.propagations || []).filter((p) => String(p.ruleId).startsWith('RULE-CTR'));

/* ------------------------------------------------------------------ math */

describe('the arithmetic is exact where it can be checked', () => {
  test('sigmoid and logit invert each other', () => {
    for (const pct of [2, 17, 50, 63, 91, 98]) {
      assert.ok(Math.abs(sigmoid(logitPct(pct)) * 100 - pct) < 1e-9, `${pct}`);
    }
    assert.equal(logitPct(0), logitPct(0.5));
    assert.ok(Number.isFinite(logitPct(100)));
  });

  test('Wilson bounds bracket the observed rate and tighten with n', () => {
    const small = wilsonInterval(3, 10);
    const large = wilsonInterval(300, 1000);
    assert.ok(small.loPct < 30 && small.hiPct > 30);
    assert.ok(large.hiPct - large.loPct < small.hiPct - small.loPct);
    assert.equal(wilsonInterval(0, 0).pct, null);
    assert.equal(wilsonInterval(0, 10).loPct, 0);
  });

  test('Platt scaling recovers a known one-parameter distortion', () => {
    // p_declared is drawn from a grid; the truth is sigmoid(1.6 * logit(p) - 0.8).
    const rows = [];
    for (let k = 0; k < 60; k += 1) {
      const p = 50 + (k % 45);
      const truth = sigmoid(1.6 * logitPct(p) - 0.8);
      const hits = Math.round(truth * 40);
      for (let j = 0; j < 40; j += 1) rows.push({ declaredPct: p, outcome: j < hits ? 1 : 0 });
    }
    const fit = fitPlatt(rows);
    assert.equal(fit.ok, true);
    assert.ok(Math.abs(fit.a - 1.6) < 0.25, `a ${fit.a}`);
    assert.ok(Math.abs(fit.b + 0.8) < 0.3, `b ${fit.b}`);
  });

  test('the Platt prior keeps a short, separable record from running to its bounds', () => {
    const tiny = [
      { declaredPct: 95, outcome: 1 }, { declaredPct: 90, outcome: 0 },
      { declaredPct: 85, outcome: 1 }, { declaredPct: 80, outcome: 0 },
      { declaredPct: 75, outcome: 0 }, { declaredPct: 70, outcome: 1 },
    ];
    const fit = fitPlatt(tiny);
    assert.equal(fit.ok, true);
    assert.ok(Math.abs(fit.a) < 6 && Math.abs(fit.b) < 4);
    assert.equal(fitPlatt([{ declaredPct: 90, outcome: 1 }]).ok, false, 'four settlements are the floor');
  });

  test('isotonic calibration is monotone, smoothed, and extends at the ends', () => {
    const rows = [];
    for (const [pct, hits, n] of [[60, 1, 6], [70, 3, 6], [80, 5, 6], [90, 5, 6], [96, 6, 6]]) {
      for (let j = 0; j < n; j += 1) rows.push({ declaredPct: pct, outcome: j < hits ? 1 : 0 });
    }
    const fit = fitIsotonic(rows);
    assert.equal(fit.ok, true);
    for (let i = 1; i < fit.blocks.length; i += 1) assert.ok(fit.blocks[i].pct >= fit.blocks[i - 1].pct);
    const map = { mapType: 'isotonic', blocks: fit.blocks };
    assert.ok(applyMap(map, 5) >= 1 && applyMap(map, 5) <= 99, 'a below-range value is clamped, not extrapolated');
    assert.ok(applyMap(map, 99) <= 99);

    const single = fitIsotonic([{ declaredPct: 50, outcome: 0 }, { declaredPct: 55, outcome: 1 }, { declaredPct: 60, outcome: 1 }, { declaredPct: 65, outcome: 1 }]);
    assert.equal(single.ok, true);
    for (const block of single.blocks) {
      assert.ok(block.pct > 10 && block.pct < 90, `a bin holding one observation is smoothed, not pinned: ${block.pct}`);
    }
  });

  test('Murphy decomposition adds back up to the Brier score', () => {
    const rows = [];
    for (let i = 0; i < 200; i += 1) rows.push({ declaredPct: 60 + (i % 4) * 10, outcome: i % 3 === 0 ? 1 : 0 });
    const m = murphyDecomposition(rows);
    const recomposed = m.reliability - m.resolution + m.uncertainty;
    assert.ok(Math.abs(recomposed - m.brier) < 5e-4, `${recomposed} vs ${m.brier}`);
  });
});

/* ---------------------------------------------------------------- the race */

describe('the prequential race has no look-ahead', () => {
  const series = Array.from({ length: 80 }, (_, i) => ({ declaredPct: 60 + (i % 5) * 7, outcome: ((i * 29) % 100) < 35 ? 1 : 0 }));

  test('every test point is scored exactly once, after the warm-up', () => {
    const race = prequentialRace(series, { minTrain: 12, bootstrap: 100 });
    assert.equal(race.scored, 80 - 12);
    for (const model of race.models) assert.equal(model.n, 68);
  });

  test('an in-sample fit looks better than the same map scored prospectively', () => {
    const race = prequentialRace(series, { minTrain: 12, bootstrap: 100 });
    const inSample = fitIsotonic(series);
    const inSampleBrier = series.reduce((sum, row) => sum + ((applyMap({ mapType: 'isotonic', blocks: inSample.blocks }, row.declaredPct) / 100) - row.outcome) ** 2, 0) / series.length;
    const prospective = race.models.find((m) => m.key === 'isotonic').brier;
    assert.ok(inSampleBrier < prospective, `in-sample ${inSampleBrier} should be optimistic against ${prospective}`);
  });

  test('the paired interval is deterministic and brackets its mean', () => {
    const race = prequentialRace(series, { minTrain: 12, bootstrap: 300 });
    const a = pairedInterval(race, 'isotonic', { bootstrap: 300 });
    const b = pairedInterval(race, 'isotonic', { bootstrap: 300 });
    assert.deepEqual(a, b, 'the same record always prints the same interval');
    assert.ok(a.lo <= a.mean && a.mean <= a.hi);
  });
});

/* ------------------------------------------------------------- verdicts */

describe('the verdict obeys its own rule', () => {
  const conventions = confidenceConventions({});

  test('below the floors the answer is insufficient, not a fitted curve', () => {
    const few = Array.from({ length: 6 }, (_, i) => ({ declaredPct: 80, outcome: i % 2 }));
    const race = prequentialRace(few, { minTrain: 4, bootstrap: 100 });
    assert.equal(decide(race, conventions).verdict, 'insufficient');
  });

  test('an overconfident record supports transport', () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ declaredPct: 80 + (i % 3) * 5, outcome: ((i * 37) % 100) < 33 ? 1 : 0 }));
    const race = prequentialRace(rows, { minTrain: 12, bootstrap: 300 });
    const verdict = decide(race, conventions);
    assert.equal(verdict.verdict, 'supported');
    assert.ok(verdict.interval.lo > 0, 'the interval must exclude zero');
  });

  test('a calibrated record never earns support — the declared numbers are kept', () => {
    const rows = [];
    for (const [pct, hits] of [[65, 13], [70, 14], [75, 15], [80, 16], [85, 17], [90, 18], [95, 19]]) {
      for (let j = 0; j < 20; j += 1) rows.push({ declaredPct: pct, outcome: j < hits ? 1 : 0 });
    }
    const race = prequentialRace(rows, { minTrain: 12, bootstrap: 300 });
    const verdict = decide(race, conventions);
    assert.notEqual(verdict.verdict, 'supported');
    assert.equal(verdict.chosen, 'identity');
  });

  test('a gain too small to be material is no gain, not a small gain', () => {
    const rows = Array.from({ length: 40 }, () => ({ errs: { identity: 0.2, platt: 0.198, isotonic: 0.199 } }));
    const race = {
      scored: rows.length,
      models: [
        { key: 'identity', n: rows.length, brier: 0.2, skill: 0, wins: 0 },
        { key: 'platt', n: rows.length, brier: 0.198, skill: 0.01, wins: 20 },
        { key: 'isotonic', n: rows.length, brier: 0.199, skill: 0.005, wins: 20 },
      ],
      rows,
    };
    const verdict = decide(race, conventions);
    assert.equal(verdict.verdict, 'no-gain');
    assert.equal(verdict.chosen, 'identity');
  });

  test('a record a map would damage reads harmful, not "no gain"', () => {
    // A synthetic race where both maps are materially worse on every settlement.
    const rows = Array.from({ length: 40 }, () => ({ errs: { identity: 0.04, platt: 0.3, isotonic: 0.3 } }));
    const race = {
      scored: rows.length,
      models: [
        { key: 'identity', n: rows.length, brier: 0.04, skill: 0, wins: 0 },
        { key: 'platt', n: rows.length, brier: 0.3, skill: -6.5, wins: 0 },
        { key: 'isotonic', n: rows.length, brier: 0.3, skill: -6.5, wins: 0 },
      ],
      rows,
    };
    assert.equal(decide(race, conventions).verdict, 'harmful');
  });

  test('the verdict vocabulary is closed', () => {
    assert.deepEqual([...CONFIDENCE_VERDICTS].sort(), ['harmful', 'insufficient', 'no-gain', 'supported']);
  });
});

/* -------------------------------------------------------------- adapters */

describe('every adapter reads its ledger as documented', () => {
  function fixture() {
    const s = baseState();
    s.premises = [{
      id: 'prem-1', title: 'The vendor will hold the date', statement: 'Stated', signpost: 'Dated warning',
      criticality: 'load-bearing', priorPct: 85, watchPct: 55, breachPct: 30, halfLifeDays: 90,
      reviewBy: day(30), createdAt: `${day(-40)}T09:00:00.000Z`, observations: [], history: [], sourceRefs: [], status: 'observed',
    }];
    s.premiseOutcomes = [
      { id: 'po-1', premiseId: 'prem-1', verdict: 'failed', settledOn: day(-10), note: '', createdAt: NOW_ISO },
      { id: 'po-2', premiseId: 'prem-1', verdict: 'inconclusive', settledOn: day(-5), note: '', createdAt: NOW_ISO },
    ];
    s.decisions = [
      { id: 'd-good', title: 'A call that worked', question: '', date: day(-30), reversibility: 'reversible', driver: '', approver: '', contributors: '', informed: '', options: [], chosen: 'yes', rationale: '', reviewOn: day(-2), reviewedOn: day(-2), outcome: 'good', outcomeNotes: '', forecastProbability: 70, decidedOn: day(-30), createdAt: NOW_ISO },
      { id: 'd-mixed', title: 'A mixed call', question: '', date: day(-30), reversibility: 'reversible', driver: '', approver: '', contributors: '', informed: '', options: [], chosen: 'yes', rationale: '', reviewOn: day(-2), reviewedOn: day(-2), outcome: 'mixed', outcomeNotes: '', forecastProbability: 80, decidedOn: day(-30), createdAt: NOW_ISO },
    ];
    s.impactStudies = [
      { id: 'imp-1', title: 'A study', hypothesis: '', vitalId: 'v', interventionType: 'feedback', interventionLabel: '', windowStart: day(-60), baselineWeeks: 8, windowWeeks: 4, alpha: 0.1, expectedEffect: 10, expectedConfidence: 80, declaredOn: `${day(-60)}T09:00:00.000Z`, status: 'scored', lockedOn: day(-20), verdict: 'supported', evaluation: { verdict: 'supported', ok: true }, notes: '', outcomeNotes: '', createdAt: NOW_ISO, updatedAt: NOW_ISO },
      { id: 'imp-2', title: 'An underpowered study', hypothesis: '', vitalId: 'v', interventionType: 'feedback', interventionLabel: '', windowStart: day(-60), baselineWeeks: 8, windowWeeks: 4, alpha: 0.1, expectedEffect: 10, expectedConfidence: 90, declaredOn: `${day(-60)}T09:00:00.000Z`, status: 'scored', lockedOn: day(-20), verdict: 'underpowered', evaluation: { verdict: 'underpowered', ok: false }, notes: '', outcomeNotes: '', createdAt: NOW_ISO, updatedAt: NOW_ISO },
    ];
    s.deferralFrames = [{
      id: 'frame-1', decisionId: 'd-good', frozenAt: `${day(-60)}T09:00:00.000Z`, reviewOn: day(-20), horizonDays: 30,
      currency: 'USD', valueNow: 1000, commitCost: 0, carryPerWeek: 10, sigma: 0.3, sigmaSource: 'derived', drift: 0, discountRate: 0,
      verdict: 'wait', premium: 1, waitValue: 1, commitNow: 1, threshold: null, expectedWaitDays: 10,
      predictedCommitByDeadlinePct: 75, breakEvenCarryPerWeek: null, breakEvenSigma: null,
      graded: { gradedAt: `${day(-20)}T09:00:00.000Z`, committedByDeadline: false, decisionDate: null, brier: 0.56 },
    }];
    s.integrityReviews = [{
      id: 'irev-1', label: 'A review', frozenAt: `${day(-50)}T09:00:00.000Z`, reviewOn: day(-10), alphaPct: 5,
      plannedLooks: 12, spending: 'obf', looksUsed: 2, cumulativeAlphaPct: 1, perTestThreshold: 0.01, seriesTested: 40,
      mEff: 30, verdictsScored: 6, familiesScored: 3, pooledDetectionPct: 50, pooledActionablePct: 50, pooledFalseAlarmPct: 20,
      familyStatuses: [], horizonAlerts: 4, predictedAnyFalseAlarmPct: 60,
      graded: { gradedAt: `${day(-10)}T09:00:00.000Z`, anyFalse: true, scored: 4, falseAlarms: 1, brier: 0.16 },
      challengeNotes: [],
    }];
    s.survivalReadings = [{
      id: 'read-1', label: 'A reading', horizonDays: 21, reviewOn: day(-5), frozenOn: day(-40), status: 'graded',
      curveDigest: { n: 20, completions: 10, abandonments: 5, censored: 5, maxObservedDays: 90, riskFloorPct: 30 },
      predictions: [
        { itemKey: 'case:c1', sourceType: 'case', sourceId: 'c1', title: 'Exited inside the horizon', kind: 'case', elapsedDays: 10, probabilityPct: 80, atRisk: 20, classKey: 'case', outcome: { completedOn: day(-35), abandonedOn: null, missing: false } },
        { itemKey: 'case:c2', sourceType: 'case', sourceId: 'c2', title: 'Still open', kind: 'case', elapsedDays: 10, probabilityPct: 60, atRisk: 20, classKey: 'case', outcome: { completedOn: null, abandonedOn: null, missing: false } },
        { itemKey: 'case:c3', sourceType: 'case', sourceId: 'c3', title: 'Undated exit', kind: 'case', elapsedDays: 10, probabilityPct: 70, atRisk: 20, classKey: 'case', outcome: { completedOn: null, abandonedOn: null, missing: true } },
      ],
      grade: { gradedOn: day(-5), settledCount: 2, brier: 0.2, baselineBrier: 0.24, baseRatePct: 60, skillScore: 0.16, hits: 1, misses: 1, belowFloor: false },
      notes: [], markers: [],
    }];
    return normalizeState(s, { now: NOW }).state;
  }

  const read = (state, source) => extractConfidenceSamples(state).samples.filter((s) => s.source === source);

  test('assumption priors are scored by the recorded outcome, and inconclusive is excluded', () => {
    const rows = read(fixture(), 'assumptions');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].declaredPct, 85);
    assert.equal(rows[0].outcome, 0);
    assert.equal(rows[0].issuedOn, day(-40));
    assert.equal(rows[0].resolvedOn, day(-10));
    assert.equal(rows[0].horizonDays, 30);
  });

  test('a mixed decision is counted as ambiguous, never as a coin', () => {
    const result = extractConfidenceSamples(fixture());
    const calls = result.samples.filter((s) => s.source === 'calls');
    assert.deepEqual(calls.map((c) => c.recordId), ['d-good']);
    assert.ok(result.skipped.ambiguous >= 1);
  });

  test('only conclusive study verdicts enter the record', () => {
    const rows = read(fixture(), 'studies');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].outcome, 1);
    assert.equal(rows[0].declaredPct, 80);
  });

  test('timing and monitoring calls keep their own polarity', () => {
    const s = fixture();
    const timing = read(s, 'timing');
    assert.equal(timing.length, 1);
    assert.equal(timing[0].outcome, 0, 'not committed by the deadline is a miss on a P(commit) declaration');
    const signals = read(s, 'signals');
    assert.equal(signals.length, 1);
    assert.equal(signals[0].outcome, 1, 'a false alarm occurring is a hit on a P(false alarm) declaration');
  });

  test('survival predictions are oriented at the horizon and undated exits are censored', () => {
    const rows = read(fixture(), 'delivery');
    assert.equal(rows.length, 2, 'the missing outcome is excluded, not guessed');
    const exited = rows.find((r) => r.key.endsWith('case:c1'));
    const stillOpen = rows.find((r) => r.key.endsWith('case:c2'));
    assert.equal(exited.outcome, 0, 'an exit on or before the horizon means the item was not still open');
    assert.equal(stillOpen.outcome, 1);
  });

  test('the harvest is sorted in the order reality arrived', () => {
    const { samples } = extractConfidenceSamples(fixture());
    for (let i = 1; i < samples.length; i += 1) assert.ok(samples[i - 1].resolvedOn <= samples[i].resolvedOn);
  });
});

/* ---------------------------------------------------------------- schema */

describe('Schema v72 is additive and fail-closed', () => {
  test('the 71 → 72 migration adds two empty ledgers and invents nothing', () => {
    assert.equal(SCHEMA_VERSION, 75);
    assert.equal(typeof MIGRATIONS[71], 'function');
    const raw = migrate({ schemaVersion: 71, settings: {}, people: [] });
    assert.deepEqual(raw.applied, ['71 → 72', '72 → 73', '73 → 74', '74 → 75']);
    assert.deepEqual(raw.raw.confidenceCertificates, []);
    assert.deepEqual(raw.raw.confidenceMarkers, []);
    const state = normalizeState({ schemaVersion: 71 }, { now: NOW }).state;
    assert.equal(state.schemaVersion, 75);
    assert.equal(state.settings.confidenceMinSamples, 24);
    assert.equal(state.settings.confidenceReviewDays, 42);
  });

  test('settings are clamped into their declared bands, never read as "no evidence required"', () => {
    const settings = normalizeSettings({
      confidenceMinSamples: 0,
      confidenceMinScored: -5,
      confidenceBootstrap: 99999,
      confidenceGapPct: 1,
      confidenceAutoPropagate: false,
    });
    assert.equal(settings.confidenceMinSamples, 8);
    assert.equal(settings.confidenceMinScored, 6);
    assert.equal(settings.confidenceBootstrap, 4000);
    assert.equal(settings.confidenceGapPct, 5);
    assert.equal(settings.confidenceAutoPropagate, false);
  });

  test('certificates: a map without its parameters is dropped, not reconstructed', () => {
    const warnings = [];
    const good = {
      id: 'c1', label: 'A certificate', issuedOn: day(-40), reviewOn: day(-5), mapType: 'platt',
      plattA: 1.2, plattB: -0.4, verdict: 'supported', sampleN: 40, trainN: 20, scoredN: 20,
      brierDeclared: 0.3, brierPlatt: 0.2, brierIsotonic: 0.25, chosenBrier: 0.2, ciLo: 0.02, ciHi: 0.2,
    };
    const rows = normalizeConfidenceCertificates([
      good,
      { ...good, id: 'c2', mapType: 'platt', plattA: null, plattB: null },
      { ...good, id: 'c3', mapType: 'isotonic', isoBlocks: [] },
      { ...good, id: 'c4', reviewOn: day(-80) },
      { ...good, id: 'c5', mapType: 'nonsense' },
    ], warnings);
    assert.deepEqual(rows.map((r) => r.id), ['c1']);
    assert.equal(warnings.length, 4);
  });

  test('a grade without a complete outcome returns to frozen', () => {
    const warnings = [];
    const rows = normalizeConfidenceCertificates([{
      id: 'c1', issuedOn: day(-40), reviewOn: day(-5), mapType: 'isotonic', verdict: 'supported',
      isoBlocks: [{ loPct: 60, hiPct: 80, pct: 45, n: 10 }],
      graded: { gradedAt: `${day(-5)}T09:00:00.000Z`, observed: 5 },
    }], warnings);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].graded, null);
    assert.match(warnings.join(' '), /returned to frozen/);
  });

  test('a non-monotone stored block list is repaired, not trusted', () => {
    const blocks = normalizeConfidenceBlocks([
      { loPct: 0, hiPct: 50, pct: 60, n: 4 },
      { loPct: 50, hiPct: 100, pct: 40, n: 6 },
    ]);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[1].pct, 60);
  });

  test('markers are de-duplicated and bounded', () => {
    const many = Array.from({ length: 900 }, (_, i) => `m-${i}`);
    const rows = normalizeConfidenceMarkers([...many, 'm-1', '']);
    assert.equal(rows.length, 400);
    assert.equal(new Set(rows).size, rows.length);
  });
});

/* ----------------------------------------------------------------- rules */

describe('the four rules run on the shared spine', () => {
  test('the rule is registered with its triggers and no side effects on unrelated events', () => {
    assert.ok(DEFAULT_POST_COMMIT_RULES.includes(confidenceRule));
    assert.ok(CONFIDENCE_TRIGGERS.includes('confidence.scan'));
    assert.ok(CONFIDENCE_TRIGGERS.includes('premise.outcome'));
    const draft = { confidenceCertificates: [], confidenceMarkers: [] };
    assert.deepEqual(confidenceRule(draft, { event: { type: 'recognition.created' }, now: NOW }), []);
  });

  test('a scan certifies the supported instrument exactly once and links what it reads', () => {
    const state = baseState();
    state.decisions = overconfidentCalls(60);
    state.premises = [{
      id: 'prem-1', title: 'The vendor will hold the date', statement: 'Stated', signpost: 'Dated warning',
      criticality: 'load-bearing', priorPct: 92, watchPct: 55, breachPct: 30, halfLifeDays: 90,
      reviewBy: day(30), createdAt: `${day(-20)}T09:00:00.000Z`, observations: [], history: [], sourceRefs: [], status: 'unobserved',
    }];
    const { store, api } = harness(state);
    const before = store.state.decisions.map((d) => `${d.id}:${d.forecastProbability}`).join('|');

    const first = api.scanConfidence();
    assert.equal(first.ok, true);
    const effects = confidenceEffects(first);
    assert.ok(effects.some((e) => e.ruleId === CONFIDENCE_RULE_IDS.CERTIFY && e.action === 'frozen'), 'a certificate was frozen');
    assert.equal(store.state.confidenceCertificates.length, 1);
    const cert = store.state.confidenceCertificates[0];
    assert.equal(cert.mapType, 'isotonic');
    assert.equal(cert.graded, null, 'a certificate is never graded at issue');
    assert.ok(cert.reviewOn > NOW_ISO.slice(0, 10));
    assert.ok(cert.isoBlocks.length >= 1);

    const links = store.state.links.filter((l) => l.sourceType === 'certificate' && l.sourceId === cert.id);
    assert.ok(links.length >= 1);
    assert.equal(links.every((l) => l.relation === 'recalibrates-belief'), true);

    // A declaration was NOT rewritten by the rule.
    assert.equal(store.state.decisions.map((d) => `${d.id}:${d.forecastProbability}`).join('|'), before);

    // A flagged open promise earns one owned re-read task, linked to the promise.
    const tasks = store.state.delegations.filter((d) => String(d.support).includes('RULE-CTR-02'));
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].personId, 'p-leader');
    const taskLinks = store.state.links.filter((l) => l.sourceType === 'delegation' && l.sourceId === tasks[0].id);
    assert.ok(taskLinks.some((l) => l.targetType === 'premise' && l.relation === 'recalibrates-belief'));

    // Idempotent: a second scan in the same week freezes nothing new.
    const second = api.scanConfidence();
    assert.equal(second.ok, true);
    assert.equal(store.state.confidenceCertificates.length, 1);
    assert.equal(store.state.delegations.filter((d) => String(d.support).includes('RULE-CTR-02')).length, 1);
  });

  test('a certificate frozen by a scan is never credited: its window opens after the record it was fitted on', () => {
    // This looks like a defect from the outside — freeze, then scan, and the
    // certificate is still ungraded — but it is the refusal the module promises.
    // CTR-03 grades FIRST and CTR-01 freezes after it, and the window a fresh
    // certificate carries starts today. Nothing can resolve inside a window that
    // opens after every settlement that fitted the map, so the honest outcomes are
    // `withheld` and then `lapsed`; it must never be graded from the same record
    // it was fitted on.
    const state = baseState();
    state.decisions = overconfidentCalls(60);
    let clock = NOW;
    const { store, api } = harness(state, () => clock);

    assert.equal(api.scanConfidence().ok, true);
    const cert = store.state.confidenceCertificates[0];
    assert.ok(cert, 'the supported instrument was certified');
    assert.equal(cert.graded, null, 'a certificate is never graded in the transaction that froze it');
    assert.equal(certificateDue(cert, NOW_ISO.slice(0, 10)), false, 'its window is still open');

    // While the window is open, scans leave it untouched.
    assert.equal(api.scanConfidence().ok, true);
    assert.equal(store.state.confidenceCertificates[0].graded, null);

    // One day past the review day: due, nothing resolved inside it, so the grade is
    // WITHHELD rather than guessed — and the certificate is not credited.
    clock = new Date(new Date(`${cert.reviewOn}T10:00:00.000Z`).getTime() + 86400000);
    assert.equal(api.scanConfidence().ok, true);
    let sealed = store.state.confidenceCertificates.find((c) => c.id === cert.id);
    assert.equal(sealed.graded, null, 'an empty window is never graded');
    assert.equal(sealed.lapsedOn, null, 'it is withheld first, not lapsed immediately');

    // Past the review period: it LAPSES untested rather than being credited.
    const reviewDays = Number(store.state.settings?.confidenceReviewDays ?? 42);
    clock = new Date(new Date(`${cert.reviewOn}T10:00:00.000Z`).getTime() + (reviewDays + 1) * 86400000);
    assert.equal(api.scanConfidence().ok, true);
    sealed = store.state.confidenceCertificates.find((c) => c.id === cert.id);
    assert.equal(sealed.graded, null, 'lapsing is not grading');
    assert.ok(sealed.lapsedOn, 'an empty window that stayed empty lapsed untested');
    assert.equal(api.scanConfidence().ok, true);
    assert.equal(store.state.confidenceCertificates.find((c) => c.id === cert.id).lapsedOn, sealed.lapsedOn, 'the lapse is written once');
  });

  test('a due certificate is graded once from what resolved inside its window', () => {
    const state = baseState();
    state.decisions = overconfidentCalls(60);
    state.confidenceCertificates = [{
      id: 'ccert-1', label: 'Frozen 78 days ago', issuedOn: day(-78), reviewOn: day(-20),
      mapType: 'isotonic', verdict: 'supported', sampleN: 40, trainN: 20, scoredN: 30,
      isoBlocks: [{ loPct: 0, hiPct: 100, pct: 40, n: 30 }],
      brierDeclared: 0.4, brierPlatt: 0.42, brierIsotonic: 0.24, chosenBrier: 0.24, skill: 0.16, ciLo: 0.05, ciHi: 0.28,
      paceAtFit: 4, expectedResolutions: 8, lapsedOn: null, graded: null,
    }];
    const { store, api } = harness(state);
    assert.equal(certificateDue(store.state.confidenceCertificates[0], NOW_ISO.slice(0, 10)), true);
    const result = api.scanConfidence();
    assert.equal(result.ok, true);
    const sealed = store.state.confidenceCertificates.find((c) => c.id === 'ccert-1');
    const graded = sealed.graded;
    assert.ok(graded, 'the certificate was graded');
    assert.ok(graded.observed > 0);
    assert.ok(graded.brierTransported < graded.brierDeclared, 'a flat 40% map beats declarations written at 65-95% on a record that lands about 40% of the time');
    assert.equal(gradeConfidenceCertificate(sealed, store.state, NOW), null, 'a graded certificate is never re-graded');

    const ledger = certificateLedger(store.state.confidenceCertificates, confidenceConventions(store.state.settings));
    assert.equal(ledger.graded, 1);
    assert.equal(ledger.wins, 1);
    assert.equal(ledger.meanSkill !== null, true);
  });

  test('a certificate cannot be certified when the record does not support one', () => {
    const state = baseState();
    state.decisions = calibratedCalls();
    const { api } = harness(state);
    const result = api.freezeConfidenceCertificate({});
    assert.equal(result.ok, false);
    assert.match(result.error, /not supported|nothing to certify/i);
  });

  test('a certificate cannot be frozen for a window that has already closed', () => {
    const state = baseState();
    state.decisions = overconfidentCalls(60);
    const { api } = harness(state);
    const result = api.freezeConfidenceCertificate({ reviewOn: day(-1) });
    assert.equal(result.ok, false);
    assert.match(result.error, /after today/i);
  });

  test('conventions outside their band are refused, not clamped', () => {
    const { api } = harness(baseState());
    const bad = api.setConfidenceConventions({ confidenceMinSamples: 2 });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /8 to 400/);
    const good = api.setConfidenceConventions({ confidenceGapPct: 20, confidenceAutoPropagate: false });
    assert.equal(good.ok, true);
    assert.equal(good.settings.confidenceGapPct, 20);
    assert.equal(good.settings.confidenceAutoPropagate, false);
  });

  test('deleting a certificate removes every edge that pointed at it', () => {
    const state = baseState();
    state.decisions = overconfidentCalls(60);
    state.premises = [{
      id: 'prem-1', title: 'A promise', statement: 'Stated', signpost: 'Warning', criticality: 'major',
      priorPct: 92, watchPct: 55, breachPct: 30, halfLifeDays: 90, reviewBy: day(30),
      createdAt: `${day(-20)}T09:00:00.000Z`, observations: [], history: [], sourceRefs: [], status: 'unobserved',
    }];
    const { store, api } = harness(state);
    api.scanConfidence();
    const cert = store.state.confidenceCertificates[0];
    assert.ok(store.state.links.some((l) => l.sourceType === 'certificate' && l.sourceId === cert.id));
    assert.equal(api.deleteConfidenceCertificate(cert.id).ok, true);
    assert.equal(store.state.confidenceCertificates.length, 0);
    assert.equal(store.state.links.some((l) => l.sourceType === 'certificate' || l.targetType === 'certificate'), false);
  });
});

/* ------------------------------------------------------- cross-module wiring */

describe('the terminal is wired into the workspace', () => {
  test('the entity type, relation and resolver exist and resolve', () => {
    assert.ok(LINK_ENTITY_TYPES.includes('certificate'));
    assert.ok(LINK_RELATIONS.includes('recalibrates-belief'), 'the edge is assertable by the engine');
    assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes('recalibrates-belief'), 'and never by hand');
    const state = buildDemoState(NOW);
    const cert = state.confidenceCertificates[0];
    const resolved = resolveLinkedEntity(state, 'certificate', cert.id);
    assert.ok(resolved);
    assert.match(resolved.route, /^#\/confidence\?panel=certificates&certificate=/);
  });

  test('every source module names a real collection through the registry', () => {
    assert.ok(CONFIDENCE_SOURCES.length >= 6);
    for (const source of CONFIDENCE_SOURCES) {
      assert.ok(source.entityType, source.id);
      assert.ok(source.quantity.length > 10, source.id);
      assert.ok(source.outcome.length > 5, source.id);
    }
  });

  test('the Confidence bucket is in the roll-up and every signal links to the terminal', () => {
    assert.ok(DOMAIN_ORDER.includes('Confidence'));
    const state = buildDemoState(NOW);
    const insights = buildInsights(state, NOW);
    assert.ok(insights.byDomain.some((d) => d.domain === 'Confidence'));
    const signals = confidenceSignals(state, NOW, state.settings || {});
    assert.ok(signals.length >= 2);
    for (const signal of signals) {
      assert.equal(signal.domain, 'Confidence');
      assert.ok(signal.evidence.length > 0);
      assert.ok(signal.action.route.startsWith('#/confidence'));
    }
  });

  test('CSV scope #62 exports aggregates and never a title, id or name', () => {
    assert.ok(CSV_EXPORTS.some((e) => e.key === 'confidence-transport'));
    const state = buildDemoState(NOW);
    const exported = exportWorkspaceCsv(state, 'confidence-transport', NOW);
    assert.equal(exported.ok, true);
    const parsed = parseCsv(exported.csv);
    assert.ok(parsed.headers.includes('brier_transported'));
    assert.ok(parsed.rows.length >= 4);
    for (const person of state.people) assert.equal(exported.csv.includes(person.name), false, person.name);
    for (const decision of state.decisions.slice(0, 5)) {
      if (!decision.title) continue;
      assert.equal(exported.csv.includes(decision.title), false, 'no decision title leaves the workspace');
    }
    assert.equal(/dec-demo-cal|cert-demo|Settled call/.test(exported.csv), false);
  });

  test('the brief names no person and no declaration', () => {
    const state = buildDemoState(NOW);
    const text = confidenceBrief(state, NOW);
    assert.match(text, /CONFIDENCE TRANSPORT BRIEF/);
    for (const person of state.people) assert.equal(text.includes(person.name), false, person.name);
    for (const decision of state.decisions.slice(0, 5)) {
      if (!decision.title) continue;
      assert.equal(text.includes(decision.title), false);
    }
  });
});

/* ---------------------------------------------------------------- terminal */

describe('the terminal renders six panels, accessibly', () => {
  function renderDom(state, hash) {
    const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div></body></html>', {
      url: `https://example.test/${hash}`,
      pretendToBeVisual: true,
      runScripts: 'outside-only',
      virtualConsole: new VirtualConsole(),
    });
    const { window } = dom;
    Object.assign(globalThis, {
      window,
      document: window.document,
      Node: window.Node,
      Element: window.Element,
      HTMLElement: window.HTMLElement,
      Event: window.Event,
      MouseEvent: window.MouseEvent,
    });
    const { store, api } = harness(state);
    const [, queryPart] = hash.replace(/^#/, '').split('?');
    const ctx = {
      state: store.state,
      now: NOW,
      query: new URLSearchParams(queryPart || ''),
      navigate: () => {},
      api,
    };
    window.document.getElementById('view').appendChild(renderConfidence(ctx));
    return dom;
  }

  test('routes, aliases and the nav entry reach the terminal', () => {
    for (const hash of ['#/confidence', '#/confidence?panel=readings', '#/certificate', '#/calibration', '#/transport', '#/isotonic']) {
      assert.equal(parseRoute(hash).route, 'confidence', hash);
    }
    const source = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
    assert.match(source, /route: 'confidence'/);
    assert.match(source, /confidenceAttentionCount/);
    assert.match(source, /renderConfidence/);
  });

  test('every panel: one h1, named tables, a labelled chart, axe-clean', async () => {
    const state = buildDemoState(NOW);
    for (const panel of ['instrument', 'race', 'readings', 'horizon', 'certificates', 'method']) {
      const dom = renderDom(state, `#/confidence?panel=${panel}`);
      const { document, window } = dom.window;
      assert.equal(document.querySelectorAll('h1').length, 1, panel);
      assert.ok(document.body.textContent.length > 700, `${panel} renders real content`);
      for (const tableNode of document.querySelectorAll('table')) {
        assert.ok(tableNode.getAttribute('aria-label') || tableNode.querySelector('caption'), `${panel} table is named`);
      }
      const chart = document.querySelector('svg[role="img"]');
      if (chart) assert.ok((chart.getAttribute('aria-label') || '').length > 40, `${panel} chart has a description`);
      if (!window.axe) window.eval(AXE_SRC);
      const result = await window.axe.run(document.getElementById('view'), { rules: { 'color-contrast': { enabled: false } } });
      assert.equal(result.violations.length, 0, `${panel}: ${result.violations.map((v) => `${v.id}: ${v.help}`).join(' | ')}`);
      dom.window.close();
    }
  });

  test('an empty workspace says what it is waiting for instead of drawing a curve', () => {
    const dom = renderDom(baseState(), '#/confidence');
    const text = dom.window.document.body.textContent;
    assert.match(text, /No probability in this workspace has settled yet/);
    assert.equal(dom.window.document.querySelectorAll('svg').length, 0);
    dom.window.close();
  });

  test('an insufficient record prints counts and refuses a map', () => {
    const state = baseState();
    state.decisions = overconfidentCalls(12, { start: 90, step: 3 });
    const dom = renderDom(state, '#/confidence');
    assert.match(dom.window.document.body.textContent, /Calibration is not identifiable yet|Not enough settled forecasts/i);
    dom.window.close();
  });
});

/* -------------------------------------------------------------------- demo */

describe('the demo freezes before it grades', () => {
  test('every certificate predates the outcomes it is graded on', () => {
    const state = buildDemoState(NOW);
    assert.ok(state.confidenceCertificates.length >= 2, 'the demo ships an open and a graded certificate');
    const report = confidenceReport(state, NOW, state.settings || {});
    assert.equal(report.verdict, 'supported');
    assert.ok(report.race.scored >= report.conventions.minScored);
    for (const cert of report.certificates.certificates) {
      assert.ok(cert.reviewOn > cert.issuedOn, cert.id);
      if (cert.graded) {
        assert.ok(cert.graded.gradedAt.slice(0, 10) >= cert.reviewOn);
        assert.ok(cert.graded.observed > 0);
        assert.ok(cert.graded.brierTransported >= 0 && cert.graded.brierDeclared <= 1);
      }
    }
    assert.ok(report.certificates.graded >= 1);
    assert.ok(report.live.flagged >= 1, 'the demo opens on declarations the certificate reads differently');
    assert.ok(report.samples.every((s) => s.declaredPct >= 1 && s.declaredPct <= 99));
  });

  test('the demo verdict is earned, not asserted: a calibrated demo would refuse', () => {
    const state = baseState();
    state.decisions = calibratedCalls();
    const report = confidenceReport(state, NOW, state.settings || {});
    assert.notEqual(report.verdict, 'supported');
    assert.equal(report.chosen, 'identity');
  });
});
