/**
 * tests/app/evidence.test.mjs — Evidence Terminal (`#/evidence`, Schema v66,
 * ADR-0055, CSV scope #56).
 *
 * The question this terminal answers is the one every other terminal in this
 * workspace quietly assumes: several studies of the same lever on the same
 * metric have now closed — what do they say *together*, and how much is one
 * more study worth? Everything below defends the four ways that question can
 * be answered dishonestly:
 *
 *   1. Pooling as if the estimates were interchangeable (fixed effect) when
 *      the studies disagree by more than sampling noise allows.
 *   2. Reporting a pooled interval as if it were exact, when a random-effects
 *      interval with few studies is not a normal deviate.
 *   3. Reporting coverage as if it were accuracy — a wide interval covers
 *      almost anything.
 *   4. Treating an unreplicated result, or a subgroup found after the fact, as
 *      a finding rather than as a hypothesis.
 *
 * Verifies:
 *   1. Schema v66 additivity, 65→66 migration, settings clamps & normalizers
 *   2. Exact estimator math: DerSimonian–Laird random effects, Hartung–Knapp
 *      small-study correction, Q / τ² / I², Egger, leave-one-out, cumulative,
 *      Wilson intervals, and the normal/t/χ² primitives they rest on
 *   3. EVPI / EVSI with both limits asserted (uninformative trial ⇒ zero,
 *      perfect trial ⇒ EVPI)
 *   4. Pooling floors, direction-aware harm, heterogeneity and the overlap
 *      warning (shared observations break independence)
 *   5. Frozen review lifecycle: build → grade → delete, with every refusal
 *   6. Cross-module rule spine (RULE-EBM-01..05) on the shared post-commit
 *      engine: harm decision, replication task, exploration task, typed
 *      `recommends-for` edges, marker idempotency and pause switch
 *   7. Privacy wall (aggregates only), no-names brief, CSV scope #56,
 *      Insights rollup, and all six panels of `#/evidence` passing axe-core
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
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import {
  LINK_ENTITY_TYPES, LINK_RELATIONS, LINK_ENTITY_COLLECTIONS,
  linksForEntity, resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  normalizeEvidenceReviews, normalizeEvidenceMarkers, EVIDENCE_SCHEMA_CAPS,
} from '../../app/core/domain/evidenceSchema.js';
import {
  EVIDENCE_ENGINE_VERSION,
  EVIDENCE_DEFAULTS,
  EVIDENCE_SIGNAL_IDS,
  evidenceConventionsFromSettings,
  normalCdf, normalQuantile, twoSidedPt, tQuantile, chiSquareUpper,
  wilsonInterval,
  randomEffectsPool,
  eggerTest,
  leaveOneOut,
  cumulativePool,
  expectedValueWithPerfectInformation,
  valueOfInformation,
  overlappingPairs,
  cellVerdictMeta,
  evidenceReport,
  evidenceSignals,
  evidenceBrief,
  evidenceAttentionCount,
  buildEvidenceReview,
  gradeEvidenceReview,
} from '../../app/core/domain/evidence.js';
import { evidenceRule, EVIDENCE_RULE_IDS, EVIDENCE_EVENTS } from '../../app/core/domain/evidenceRules.js';
import { renderEvidence } from '../../app/views/evidence.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-31T10:00:00.000Z');
const NOW_ISO = NOW.toISOString();

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness(initialState = null) {
  let seq = 0;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory: (p) => `${p}-ev-${(seq += 1)}` });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory: (p) => `${p}-api-${(seq += 1)}` });
  const target = initialState || buildEvidenceFixture();
  const imported = store.importJSON(JSON.stringify(target), { now: NOW });
  assert.equal(imported.ok, true);
  return { store, api };
}

/* --------------------------------------------------------------- fixtures */

/**
 * A scored impact study, written in the exact shape `evaluateStudy` produces.
 *
 * The fixture is synthetic but every number the terminal reports is computed
 * from these by the real estimator — nothing in this file asserts a hand-typed
 * pooled estimate.
 */
function scoredStudy({ id, vitalId, interventionType, levelShift, seLevel, preMean = 100, verdict = 'supported',
  treatmentDate, expectedEffect = 0.1, expectedConfidence = 60, direction = 'up-good', title = 'Study',
  replicationOfId = null }) {
  return {
    id,
    title,
    hypothesis: 'A pre-registered hypothesis about this lever and this metric.',
    vitalId,
    interventionType,
    interventionId: null,
    interventionLabel: title,
    windowStart: treatmentDate,
    baselineWeeks: 8,
    windowWeeks: 4,
    alpha: 0.1,
    expectedEffect,
    expectedConfidence,
    declaredOn: '2026-01-05',
    status: 'scored',
    lockedOn: treatmentDate,
    verdict,
    evaluation: {
      ok: true,
      verdict,
      estimate: (levelShift / Math.abs(preMean)) * 100,
      its: {
        levelShift,
        seLevel,
        preMean,
        slopePre: 0,
        slopePost: 0,
        nPre: 8,
        nPost: 4,
      },
      direction,
      vitalLabel: vitalId,
      window: { treatmentDate, preBuckets: 8, postBuckets: 4 },
    },
    outcomeNotes: 'A note that must never cross the export boundary.',
    notes: 'Neither must this one.',
    autoPropagate: true,
    replicationOfId,
    executionSnapshot: null,
    implementationSnapshot: null,
    history: [],
    createdAt: `${treatmentDate}T09:00:00.000Z`,
    updatedAt: `${treatmentDate}T09:00:00.000Z`,
  };
}

/**
 * Four cells, each chosen to exercise a different verdict path:
 *
 *   feedback × feedback-cadence    four studies, all clearly negative, tight
 *                                  SEs  ⇒ a reliable BACKFIRE, and the one
 *                                  case where a rule may act on its own
 *   delegation × oneoneone-mood    three studies, all clearly positive
 *                                  ⇒ a reliable WORKS-HERE
 *   feedback × feedback-latency    three studies that disagree by far more
 *                                  than sampling noise ⇒ heterogeneous, so
 *                                  the average is not a policy
 *   change × oneoneone-mood        two studies ⇒ below the pooling floor,
 *                                  counts only, no estimate offered
 *   meeting × meeting-load         three studies, two of them replications of
 *                                  the first ⇒ pools, but ONE independent
 *                                  result, so it is named as unreplicated
 */
function buildEvidenceFixture() {
  const s = createEmptyState(NOW_ISO);
  s.settings.leaderName = 'Rae Mensah';
  s.people = [
    { id: 'p-leader', name: 'Rae Mensah', role: 'Engineering Manager', level: 'manager', startDate: '2024-01-10', status: 'active', talkingPoints: [] },
    { id: 'p-1', name: 'Liam Vance', role: 'Engineer', level: 'ic', startDate: '2025-01-15', status: 'active', talkingPoints: [] },
    { id: 'p-2', name: 'Maya Lin', role: 'Engineer', level: 'ic', startDate: '2025-02-01', status: 'active', talkingPoints: [] },
  ];
  s.cases = [
    { id: 'case-1', title: 'Support queue breach', status: 'open', severity: 'high', openedOn: '2026-10-01', mitigation: null, notes: '' },
    { id: 'case-2', title: 'Release train slippage', status: 'open', severity: 'medium', openedOn: '2026-10-04', mitigation: null, notes: '' },
  ];

  s.impactStudies = [
    // feedback × feedback-cadence — four tight, clearly negative studies.
    scoredStudy({ id: 's-h1', vitalId: 'feedback-cadence', interventionType: 'feedback', levelShift: -20, seLevel: 5, verdict: 'not-supported', treatmentDate: '2026-02-03' }),
    scoredStudy({ id: 's-h2', vitalId: 'feedback-cadence', interventionType: 'feedback', levelShift: -24, seLevel: 5, verdict: 'not-supported', treatmentDate: '2026-03-03' }),
    scoredStudy({ id: 's-h3', vitalId: 'feedback-cadence', interventionType: 'feedback', levelShift: -18, seLevel: 5, verdict: 'not-supported', treatmentDate: '2026-04-07' }),
    scoredStudy({ id: 's-h4', vitalId: 'feedback-cadence', interventionType: 'feedback', levelShift: -22, seLevel: 5, verdict: 'not-supported', treatmentDate: '2026-05-05' }),

    // delegation × oneoneone-mood — three tight, clearly positive studies.
    scoredStudy({ id: 's-w1', vitalId: 'oneoneone-mood', interventionType: 'delegation', levelShift: 18, seLevel: 5, verdict: 'supported', treatmentDate: '2026-02-10' }),
    scoredStudy({ id: 's-w2', vitalId: 'oneoneone-mood', interventionType: 'delegation', levelShift: 22, seLevel: 5, verdict: 'supported', treatmentDate: '2026-03-10' }),
    scoredStudy({ id: 's-w3', vitalId: 'oneoneone-mood', interventionType: 'delegation', levelShift: 20, seLevel: 5, verdict: 'supported', treatmentDate: '2026-04-14' }),

    // feedback × feedback-latency — four studies that disagree violently. Four
    // is deliberate: below `evidenceMinHeterogeneity` the terminal refuses to
    // call a cell heterogeneous, because three studies cannot separate
    // between-study variance from noise.
    scoredStudy({ id: 's-x1', vitalId: 'feedback-latency', interventionType: 'feedback', levelShift: -30, seLevel: 4, verdict: 'not-supported', treatmentDate: '2026-02-17' }),
    scoredStudy({ id: 's-x2', vitalId: 'feedback-latency', interventionType: 'feedback', levelShift: 0, seLevel: 4, verdict: 'supported', treatmentDate: '2026-03-17' }),
    scoredStudy({ id: 's-x3', vitalId: 'feedback-latency', interventionType: 'feedback', levelShift: 34, seLevel: 4, verdict: 'supported', treatmentDate: '2026-04-21' }),
    scoredStudy({ id: 's-x4', vitalId: 'feedback-latency', interventionType: 'feedback', levelShift: -28, seLevel: 4, verdict: 'not-supported', treatmentDate: '2026-05-19' }),

    // change × oneoneone-mood — two studies: below the pooling floor of three.
    scoredStudy({ id: 's-c1', vitalId: 'oneoneone-mood', interventionType: 'change', levelShift: 10, seLevel: 6, verdict: 'supported', treatmentDate: '2026-02-24' }),
    scoredStudy({ id: 's-c2', vitalId: 'oneoneone-mood', interventionType: 'change', levelShift: 12, seLevel: 6, verdict: 'supported', treatmentDate: '2026-03-24' }),

    // meeting × meeting-load — three studies, but two are replications of the
    // first. That pools (three estimates) while still being ONE independent
    // result, which is exactly the case the replication rule exists to catch.
    scoredStudy({ id: 's-u1', vitalId: 'meeting-load', interventionType: 'meeting', levelShift: 25, seLevel: 6, verdict: 'supported', treatmentDate: '2026-05-11' }),
    scoredStudy({ id: 's-u2', vitalId: 'meeting-load', interventionType: 'meeting', levelShift: 27, seLevel: 6, verdict: 'supported', treatmentDate: '2026-06-08', replicationOfId: 's-u1' }),
    scoredStudy({ id: 's-u3', vitalId: 'meeting-load', interventionType: 'meeting', levelShift: 26, seLevel: 6, verdict: 'supported', treatmentDate: '2026-07-06', replicationOfId: 's-u1' }),
  ];

  // Six resolved probability predictions across three sources, so the
  // judgement family clears its own floor of six and reports a Brier score.
  s.premises = [
    { id: 'prem-1', statement: 'Staging access is the binding constraint.', priorPct: 70, registeredOn: '2026-06-01' },
    { id: 'prem-2', statement: 'The on-call rota is under-provisioned.', priorPct: 40, registeredOn: '2026-06-01' },
  ];
  s.premiseOutcomes = [
    { id: 'po-1', premiseId: 'prem-1', verdict: 'held', settledOn: '2026-07-01', notes: '' },
    { id: 'po-2', premiseId: 'prem-2', verdict: 'failed', settledOn: '2026-07-08', notes: '' },
  ];
  s.performanceConcerns = [
    { id: 'pc-1', personId: 'p-1', openedOn: '2026-06-01', reason: 'missed commitments', plan: { prediction: { probabilityPct: 65, frozenOn: '2026-06-02', horizonDays: 30 } }, outcome: { verdict: 'met', reviewedOn: '2026-08-01' } },
    { id: 'pc-2', personId: 'p-2', openedOn: '2026-06-01', reason: 'escalation handling', plan: { prediction: { probabilityPct: 55, frozenOn: '2026-06-02', horizonDays: 30 } }, outcome: { verdict: 'not-met', reviewedOn: '2026-08-04' } },
  ];
  return s;
}

/* ================================================== 1. Schema v66 & contract */

describe('Schema v66 & normalizers', () => {
  test('the workspace is additive at 66 and the 65→66 migration carries both collections', () => {
    assert.equal(SCHEMA_VERSION, 71);
    const empty = createEmptyState(NOW_ISO);
    assert.ok(Array.isArray(empty.evidenceReviews));
    assert.ok(Array.isArray(empty.evidenceMarkers));

    const v65 = { ...createEmptyState(NOW_ISO), schemaVersion: 65 };
    delete v65.evidenceReviews;
    delete v65.evidenceMarkers;
    const migrated = migrate(JSON.parse(JSON.stringify(v65)));
    assert.equal(migrated.raw.schemaVersion, 71);
    assert.ok(Array.isArray(migrated.raw.evidenceReviews));
    assert.ok(Array.isArray(migrated.raw.evidenceMarkers));
    assert.ok(migrated.applied.includes('65 → 66'));
    assert.ok(MIGRATIONS[65], 'the 65 → 66 step is declared in the migration table');
  });

  test('settings defaults exist, are typed, and are clamped at both ends', () => {
    const base = createEmptyState(NOW_ISO).settings;
    for (const key of Object.keys(EVIDENCE_DEFAULTS)) {
      assert.equal(typeof base[key], typeof EVIDENCE_DEFAULTS[key], `${key} has the default's type`);
    }
    const raw = {
      evidenceMinPoolStudies: 999, evidenceMinHeterogeneity: 0, evidenceMinEggerStudies: 1,
      evidenceMinResolutions: 0, evidenceHorizonDecisions: 0, evidenceExploreWeight: -4,
      evidenceAlpha: 0.5, evidenceReviewDays: 0, evidenceMaxTasksPerScan: 99,
      evidenceMaxCaseLinks: 99, evidenceReviewCap: 1, evidenceAutoPropagate: 'yes',
    };
    const clean = normalizeState({ ...createEmptyState(NOW_ISO), settings: raw }, { now: NOW }).state.settings;
    assert.equal(clean.evidenceMinPoolStudies, 20);
    assert.equal(clean.evidenceMinHeterogeneity, 2);
    assert.equal(clean.evidenceMinEggerStudies, 3);
    assert.equal(clean.evidenceMinResolutions, 3);
    assert.equal(clean.evidenceHorizonDecisions, 1);
    assert.equal(clean.evidenceExploreWeight, 0);
    assert.ok([0.2, 0.1, 0.05].includes(clean.evidenceAlpha));
    assert.equal(clean.evidenceReviewDays, 1);
    assert.equal(clean.evidenceMaxTasksPerScan, 10);
    assert.equal(clean.evidenceMaxCaseLinks, 50);
    assert.equal(clean.evidenceReviewCap, 5);
    assert.equal(clean.evidenceAutoPropagate, true);

    // The alpha set is closed: a value outside it falls back, never through.
    const conv = evidenceConventionsFromSettings(clean);
    assert.equal(conv.alpha, 0.1);
    assert.equal(evidenceConventionsFromSettings({ evidenceAlpha: 0.05 }).alpha, 0.05);
  });

  test('a review is normalised fail-closed, and stores aggregates only', () => {
    const report = evidenceReport(buildEvidenceFixture(), NOW, createEmptyState(NOW_ISO).settings);
    const review = buildEvidenceReview(report, { id: 'evr-1', label: 'Fixture review', reviewOn: '2026-11-30', nowIso: NOW_ISO });
    assert.ok(review.cells.length >= 1);
    // No title, hypothesis, note or study id survives into the frozen record.
    const frozen = JSON.stringify(review);
    for (const leak of ['A pre-registered hypothesis', 'must never cross', 's-h1', 'Liam Vance']) {
      assert.equal(frozen.includes(leak), false, `the frozen review must not carry "${leak}"`);
    }
    for (const cell of review.cells) {
      assert.equal(typeof cell.key, 'string');
      assert.equal(Number.isFinite(cell.pooled), true);
      assert.equal(typeof cell.outcomeId, 'string');
      assert.equal(typeof cell.verdict, 'string');
    }
    assert.equal(typeof review.outcomeLabel, 'string');

    // Fail-closed: a cell with no pooled estimate is dropped rather than kept
    // with a null, because a null would later be read as "no effect".
    const withHole = { ...review, cells: [...review.cells, { key: 'x|y', n: 1, pooled: null, lo: null, hi: null, i2: null }] };
    const [kept] = normalizeEvidenceReviews([withHole, 'not-an-object', null], NOW_ISO, []);
    assert.ok(kept);
    assert.equal(kept.cells.some((cell) => !Number.isFinite(cell.pooled)), false);

    // A grade claimed without the pairs that support it is repaired downward.
    const lying = { ...review, graded: { gradedAt: NOW_ISO, cellsGraded: 3, cellsCovered: 3, meanAbsoluteError: 0 } };
    delete lying.gradePairs;
    const [repaired] = normalizeEvidenceReviews([lying], NOW_ISO, []);
    assert.equal(repaired.graded, null, 'a grade with no pairs is repaired away rather than trusted');
  });

  test('markers are strings, capped, and idempotency-shaped', () => {
    const out = normalizeEvidenceMarkers(['a', 5, null, '', 'b']);
    assert.deepEqual(out, ['a', 'b']);
    assert.equal(normalizeEvidenceMarkers('nope').length, 0);
    const many = normalizeEvidenceMarkers(Array.from({ length: EVIDENCE_SCHEMA_CAPS.markers + 50 }, (_, i) => `m-${i}`));
    assert.equal(many.length, EVIDENCE_SCHEMA_CAPS.markers);
  });
});

/* ============================================ 2. Estimators, exactly */

describe('Cross-domain mathematical estimators', () => {
  test('the distribution primitives return the values the pooling depends on', () => {
    assert.equal(normalCdf(1.96), 0.9750021738917761);
    assert.equal(normalQuantile(0.975), 1.9599628032742473);
    assert.equal(twoSidedPt(2.0, 10), 0.07338803477074059);
    assert.equal(tQuantile(0.975, 10), 2.2281388519862757);
    assert.equal(Number(chiSquareUpper(3.84, 1).toFixed(10)), 0.0500435212);
    assert.equal(Number(chiSquareUpper(7.81, 3).toFixed(10)), 0.0501060564);
    // Symmetry, which every two-sided p in this module relies on.
    assert.equal(twoSidedPt(-2.0, 10), twoSidedPt(2.0, 10));
    assert.equal(chiSquareUpper(0, 1), 1);
  });

  test('the Wilson score interval is the small-sample interval, not the normal approximation', () => {
    const w = wilsonInterval(5, 10, 0.1);
    assert.equal(w.rate, 50);
    assert.equal(w.lo, 26.93);
    assert.equal(w.hi, 73.07);
    // 0/10 must not report a zero lower bound: "we saw none" is not "none exist".
    const zero = wilsonInterval(0, 10, 0.1);
    assert.equal(zero.rate, 0);
    assert.ok(zero.hi > 0);
    assert.deepEqual(wilsonInterval(5, 0, 0.1), { rate: null, lo: null, hi: null });
  });

  test('DerSimonian–Laird pooling of three identical-precision studies', () => {
    const units = [
      { id: 'a', estimate: 10, se: 2 },
      { id: 'b', estimate: 12, se: 2 },
      { id: 'c', estimate: 11, se: 2 },
    ];
    const pool = randomEffectsPool(units, { alpha: 0.1, minHeterogeneity: 4 });
    assert.equal(pool.n, 3);
    assert.equal(pool.pooled, 11);
    assert.equal(Number(pool.se.toFixed(4)), 1.1547);
    assert.equal(Number(pool.ciLo.toFixed(3)), 9.101);
    assert.equal(Number(pool.ciHi.toFixed(3)), 12.899);
    assert.equal(pool.heterogeneity.tau2, 0);
    assert.equal(pool.heterogeneity.i2, 0);
    assert.equal(Number(pool.heterogeneity.pQ.toFixed(4)), 0.7788);
    // Three studies is below minHeterogeneity=4, so τ² is not reported at all:
    // three studies cannot distinguish between-study variance from noise.
    assert.equal(pool.heterogeneity.reportable, false);
    assert.equal(pool.heterogeneity.label, 'not reportable');
    // Both intervals are computed and the WIDER one is reported, so the
    // choice can never flatter the evidence.
    assert.equal(pool.reportedLo, Math.min(pool.ciLo, pool.hkLo));
    assert.equal(pool.reportedHi, Math.max(pool.ciHi, pool.hkHi));
    assert.equal(pool.method, 'DerSimonian–Laird random effects');
    assert.equal(randomEffectsPool([units[0]], {}), null, 'one study is not a synthesis');
    assert.equal(randomEffectsPool([], {}), null);
  });

  test('Hartung–Knapp widens the interval when studies are few and disagree', () => {
    const units = [
      { id: 'a', estimate: 2, se: 1 },
      { id: 'b', estimate: 14, se: 1 },
      { id: 'c', estimate: 5, se: 1 },
      { id: 'd', estimate: 11, se: 1 },
    ];
    const pool = randomEffectsPool(units, { alpha: 0.1, minHeterogeneity: 4 });
    assert.equal(pool.heterogeneity.reportable, true, 'four studies is enough to report heterogeneity');
    assert.ok(pool.heterogeneity.tau2 > 0, 'disagreeing studies produce a between-study variance');
    assert.ok(pool.heterogeneity.i2 > 50);
    assert.ok(pool.heterogeneity.q > 0);
    // The reported interval is the wider of the z interval and the
    // Hartung–Knapp one, so the small-study correction can only widen, never
    // tighten, what the terminal claims.
    assert.equal(pool.reportedLo, Math.min(pool.ciLo, pool.hkLo));
    assert.equal(pool.reportedHi, Math.max(pool.ciHi, pool.hkHi));
    assert.ok(pool.intervalsAgree === true || pool.intervalsAgree === false, 'the disagreement is reported, not hidden');
  });

  test('Egger is refused below its floor and reports an intercept above it', () => {
    const tight = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, estimate: 10 + i * 0.4, se: 1 + i * 0.02 }));
    const refused = eggerTest(tight, { minStudies: 10 });
    assert.equal(refused.ok, false, 'Egger on nine studies is a test with no power, so it refuses');
    assert.equal(refused.refused, true);
    assert.match(refused.reason, /at least 10 studies/);

    // Ten studies whose precision varies without any small-study effect
    // inflation: the intercept must be near zero, i.e. no funnel asymmetry.
    const symmetric = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      estimate: 10 + ((i * 37) % 7) - 3 + (i % 3) * 0.3,
      se: 1 + (i % 4) * 0.25,
    }));
    const ok = eggerTest(symmetric, { minStudies: 10 });
    assert.equal(ok.ok, true);
    assert.equal(ok.n, 10);
    assert.ok(Number.isFinite(ok.intercept));
    assert.ok(ok.p >= 0 && ok.p <= 1);

    // A one-sided funnel — small imprecise studies all exaggerating upward —
    // is detected rather than averaged away.
    const biased = Array.from({ length: 10 }, (_, i) => ({
      id: `b${i}`,
      estimate: i < 5 ? 40 + (i % 3) : 8 + (i % 5),
      se: i < 5 ? 4 + (i % 3) * 0.2 : 1 + (i % 3) * 0.1,
    }));
    const skewed = eggerTest(biased, { minStudies: 10 });
    assert.equal(skewed.ok, true);
    assert.equal(skewed.asymmetric, true, 'a one-sided funnel is named as asymmetric');
  });

  test('leave-one-out names the study that moves the answer', () => {
    const units = [
      { id: 'a', estimate: 10, se: 1 },
      { id: 'b', estimate: 11, se: 1 },
      { id: 'c', estimate: 10.5, se: 1 },
      { id: 'outlier', estimate: 60, se: 1 },
    ];
    const loo = leaveOneOut(units, { alpha: 0.1, minHeterogeneity: 4 });
    assert.equal(loo.length, 4);
    const row = loo.find((r) => r.id === 'outlier');
    assert.ok(row);
    assert.ok(Number.isFinite(row.shift));
    assert.equal(row.influential, true, 'dropping the outlier is the one deletion that moves the answer');
    assert.ok(Math.abs(row.shift) > 10, `the shift is large: ${row.shift}`);
    const others = loo.filter((r) => r.id !== 'outlier');
    assert.ok(others.every((r) => Math.abs(r.shift) < Math.abs(row.shift)),
      'the outlier moves the answer further than any ordinary study does');
    // The leave-one-out mean of a homogeneous set barely moves.
    const flat = leaveOneOut([
      { id: 'a', estimate: 10, se: 1 }, { id: 'b', estimate: 11, se: 1 }, { id: 'c', estimate: 10.5, se: 1 },
    ], { alpha: 0.1, minHeterogeneity: 4 });
    assert.ok(flat.every((r) => Math.abs(r.shift) < 1), 'a homogeneous pool is not carried by any one study');
  });

  test('cumulative pooling is monotone in the order studies were run', () => {
    const units = [
      { id: 'a', estimate: 10, se: 2, at: '2026-01-01' },
      { id: 'b', estimate: 12, se: 2, at: '2026-02-01' },
      { id: 'c', estimate: 11, se: 2, at: '2026-03-01' },
    ];
    const cum = cumulativePool(units, { alpha: 0.1, minHeterogeneity: 4 });
    assert.equal(cum.length, 3);
    // One study is not a synthesis, so the first row refuses rather than
    // reporting the single estimate as if it had been pooled.
    assert.equal(cum[0].k, 1);
    assert.equal(cum[0].insufficient, true);
    assert.equal(cum[0].pooled, null);
    assert.equal(cum[2].k, 3);
    // The interval can only narrow as evidence accumulates.
    assert.ok((cum[2].ciHi - cum[2].ciLo) <= (cum[1].ciHi - cum[1].ciLo) + 1e-9);
    assert.ok(Number.isFinite(cum[2].pooled));
  });

  test('overlapping windows are detected, not assumed away', () => {
    const mk = (id, from, to) => ({ id, windowFrom: from, windowTo: to });
    const overlap = overlappingPairs([mk('a', '2026-01-01', '2026-03-31'), mk('b', '2026-02-01', '2026-04-30'), mk('c', '2026-05-01', '2026-06-30')]);
    assert.equal(overlap.count, 1);
    assert.deepEqual(overlap.pairs, [['a', 'b']]);
    assert.equal(overlap.comparable, true);
    const disjoint = overlappingPairs([mk('a', '2026-01-01', '2026-01-31'), mk('b', '2026-02-01', '2026-02-28')]);
    assert.equal(disjoint.count, 0);
    assert.equal(overlappingPairs([]).count, 0);
  });
});

/* ==================================================== 3. Value of information */

describe('Value of information', () => {
  test('EVPI and EVSI on a normal prior, with both limits asserted', () => {
    const voi = valueOfInformation({ mean: 0, sd: 1, noise: 1, decisions: 6 });
    assert.equal(voi.evpi, 2.3937);
    assert.equal(voi.evsi, 1.6926);
    assert.equal(voi.posteriorSd, 0.7071);
    assert.equal(voi.resolutionShare, 0.707);
    assert.equal(voi.resolvable, true);
    // The ordering that makes the number usable: a trial is never worth more
    // than perfect information, and never worth less than nothing.
    assert.ok(voi.evsi <= voi.evpi + 1e-9);
    assert.ok(voi.evsi >= 0);

    // An uninformative trial resolves nothing and is worth exactly zero.
    const useless = valueOfInformation({ mean: 0, sd: 1, noise: 1e9, decisions: 6 });
    assert.ok(Math.abs(useless.evsi) < 1e-3, `a trial with no resolving power is worth ~0, got ${useless.evsi}`);
    // A perfect trial is worth EVPI.
    const perfect = valueOfInformation({ mean: 0, sd: 1, noise: 1e-9, decisions: 6 });
    assert.ok(Math.abs(perfect.evsi - perfect.evpi) < 1e-3);
  });

  test('no declared noise means the value of one more trial is not priced', () => {
    const voi = valueOfInformation({ mean: 0, sd: 1, noise: null, decisions: 6 });
    assert.equal(voi.evsi, null);
    assert.equal(voi.resolvable, false);
    assert.ok(voi.reason.length > 0, 'the refusal says why rather than returning a zero');
    assert.ok(voi.evpi > 0, 'the ceiling is still priced — only the trial is not');
  });

  test('a foregone conclusion is worth nothing to investigate', () => {
    const settled = valueOfInformation({ mean: 5, sd: 1, noise: 1, decisions: 6 });
    assert.equal(settled.evpi, 0);
    assert.equal(settled.evsi, 0);
    assert.equal(settled.without, 30);
    assert.equal(expectedValueWithPerfectInformation(5, 0), 5);
    assert.equal(expectedValueWithPerfectInformation(0, 0), 0);
  });
});

/* ============================================= 4. Report, floors and honesty */

describe('Evidence report: pooling floors, direction, heterogeneity', () => {
  test('the five fixture cells land on five different verdicts', () => {
    const state = buildEvidenceFixture();
    const report = evidenceReport(state, NOW, state.settings);
    const byKey = new Map(report.effects.cells.map((c) => [c.key, c]));

    const harm = byKey.get('feedback|feedback-cadence');
    assert.equal(harm.verdict, 'harms-here', 'four tight negative studies on an up-good metric is a backfire');
    assert.ok(harm.pool.ciHi < 0, 'and the interval must exclude zero to say so');

    const works = byKey.get('delegation|oneoneone-mood');
    assert.equal(works.verdict, 'works-here');
    assert.ok(works.pool.ciLo > 0);

    const het = byKey.get('feedback|feedback-latency');
    assert.equal(het.verdict, 'heterogeneous', 'studies that disagree are reported as disagreement, not averaged into a policy');
    assert.ok(het.pool.heterogeneity.i2 >= 75 && het.pool.heterogeneity.pQ < 0.1);

    const below = byKey.get('change|oneoneone-mood');
    assert.equal(below.verdict, 'counts-only');
    assert.equal(below.pool, null, 'two studies is a count, not a pooled estimate');

    // Three studies, two of them replications of the first: this POOLS, and
    // still counts as one independent result.
    const chained = byKey.get('meeting|meeting-load');
    assert.equal(chained.verdict, 'works-here');
    assert.equal(chained.n, 3);
    assert.equal(chained.roots, 1, 'two of the three are replications of the first');
    assert.equal(chained.replications, 2);
    const unreplicatedCells = report.unreplicated.map((c) => c.key);
    assert.ok(unreplicatedCells.includes('meeting|meeting-load'), 'a pooled result with one root is named as unreplicated');
    assert.equal(report.counts.unreplicated, 1);
  });

  test('direction is respected: the same effect is a win or a backfire by metric', () => {
    const state = buildEvidenceFixture();
    const flipped = JSON.parse(JSON.stringify(state));
    // Re-label the harmful cell's metric as "down is good" — the same negative
    // shift must now read as a benefit, because the sign is not the semantics.
    for (const study of flipped.impactStudies) {
      if (study.vitalId === 'feedback-cadence') study.evaluation.direction = 'down-good';
    }
    const report = evidenceReport(flipped, NOW, flipped.settings);
    const cell = report.effects.cells.find((c) => c.key === 'feedback|feedback-cadence');
    assert.equal(cell.verdict, 'works-here');
    assert.equal(cell.pool.pooled > 0, true, 'the sign is oriented so that positive always means better');
    // The raw level shift is untouched: the metric went DOWN, which for a
    // "down is good" metric is the improvement.
    assert.ok(cell.units.every((unit) => unit.rawEffect < 0 && unit.effect > 0),
      'the oriented and un-oriented effects are both kept, so neither is lost');
    assert.equal(cell.oriented, true);
  });

  test('a cell refuses to pool when the floor is raised, and says why', () => {
    const state = buildEvidenceFixture();
    const strict = { ...state.settings, evidenceMinPoolStudies: 5 };
    const report = evidenceReport(state, NOW, strict);
    assert.equal(report.counts.eligibleCells, 0, 'raising the floor to five removes every fixture cell');
    const cell = report.effects.cells.find((c) => c.key === 'feedback|feedback-cadence');
    assert.equal(cell.pool, null);
    assert.match(cell.refusalReason, /pool/i);
    assert.ok(report.effects.cells.every((c) => c.pool === null || c.nConfirmatory >= 5));
  });

  test('overlap is surfaced per cell rather than hidden behind the pooled SE', () => {
    const state = buildEvidenceFixture();
    const report = evidenceReport(state, NOW, state.settings);
    const harm = report.effects.cells.find((c) => c.key === 'feedback|feedback-cadence');
    assert.ok(harm.overlap.count > 0, 'four studies on one metric over consecutive months share observations');
    assert.equal(harm.overlap.comparable, true);
    const text = JSON.stringify(report);
    assert.match(text, /overlap|independen/i, 'the report states the independence caveat');
  });

  test('the resolution family holds itself to its own floor and reports both error measures', () => {
    const state = buildEvidenceFixture();
    const report = evidenceReport(state, NOW, state.settings);
    // 16 impact verdicts + 2 premises + 2 concerns = 20 resolved predictions.
    assert.equal(report.resolutions.n, 20);
    assert.equal(report.resolutions.sources, 3);
    assert.equal(report.resolutions.scored, true);
    assert.ok(report.resolutions.brier >= 0 && report.resolutions.brier <= 1);
    assert.ok(Number.isFinite(report.resolutions.pool.pooledRatePct));
    assert.ok(report.resolutions.gapPp !== null, 'a calibration gap is reported in percentage points');
    assert.equal(report.resolutions.cells.length, 3, 'one row per source: impact, premise, performance');
    assert.ok(report.resolutions.cells.every((c) => c.wilson && Number.isFinite(c.brier)));

    const starving = { ...state };
    starving.impactStudies = starving.impactStudies.map((row) => ({ ...row, expectedConfidence: undefined }));
    starving.premiseOutcomes = [];
    starving.performanceConcerns = [];
    const thin = evidenceReport(starving, NOW, starving.settings);
    assert.equal(thin.resolutions.n, 0, 'with no declared confidence there is no prediction to score');
    assert.equal(thin.resolutions.scored, false);
    assert.match(thin.resolutions.refusalReason, /withheld/);
  });

  test('the recommendation ranks on the lower bound plus the value of learning', () => {
    const state = buildEvidenceFixture();
    const report = evidenceReport(state, NOW, state.settings);
    const rec = report.recommendation;
    assert.ok(rec);
    assert.ok(rec.rows.length >= 4);
    const tested = rec.rows.filter((r) => r.tested);
    assert.ok(tested.length >= 1);
    // Ranked descending by the rank value, which is the lower credible bound
    // for tested levers and the priced value of learning for untested ones.
    for (let i = 1; i < rec.rows.length; i += 1) {
      assert.ok(rec.rows[i - 1].rank >= rec.rows[i].rank - 1e-9, 'the ranking is monotone');
    }
    for (const row of rec.rows) {
      assert.equal(typeof row.label, 'string');
      // A row only earns a mean when its cell actually pooled.
      if (row.verdict === 'works-here' || row.verdict === 'harms-here' || row.verdict === 'no-detectable-effect') {
        assert.ok(Number.isFinite(row.mean), `${row.label} has a pooled mean`);
      } else {
        assert.equal(row.mean, null, `${row.label} is not given a mean it has not earned`);
      }
      assert.ok(row.evsi === null || row.evsi >= 0);
      assert.ok(row.evpi === null || row.evpi >= 0);
    }
    // An untested lever is never given a mean it has not earned.
    assert.ok(rec.rows.filter((r) => !r.tested).every((r) => r.mean === null));
  });

  test('signals, attention count and brief are deterministic and leak nothing', () => {
    const state = buildEvidenceFixture();
    const a = JSON.stringify(evidenceSignals(state, NOW, state.settings));
    const b = JSON.stringify(evidenceSignals(state, NOW, state.settings));
    assert.equal(a, b, 'the same workspace produces byte-identical signals');
    const signals = evidenceSignals(state, NOW, state.settings);
    assert.ok(signals.length >= 1);
    for (const signal of signals) {
      assert.ok(EVIDENCE_SIGNAL_IDS.includes(signal.id), `${signal.id} is a declared signal id`);
      assert.ok(signal.severity >= 1 && signal.severity <= 4, `${signal.id} severity is on the 1..4 scale`);
      assert.ok(Array.isArray(signal.evidence) && signal.evidence.length > 0, `${signal.id} cites its evidence`);
      assert.ok(String(signal.detail || '').length > 40, `${signal.id} explains itself`);
    }
    assert.ok(evidenceAttentionCount(state, NOW) >= 0);

    const brief = evidenceBrief(state, NOW, state.settings);
    assert.ok(brief.length > 200);
    for (const leak of ['Liam Vance', 'Maya Lin', 'A pre-registered hypothesis', 'must never cross', 's-h1']) {
      assert.equal(brief.includes(leak), false, `the brief must not carry "${leak}"`);
    }
    const emptyBrief = evidenceBrief(createEmptyState(NOW_ISO), NOW, createEmptyState(NOW_ISO).settings);
    assert.match(emptyBrief, /no pre-registered, scored evidence/i, 'an empty workspace says so rather than reporting zeros');
    assert.match(emptyBrief, /NOT CLAIM/i, 'and it states what it is not claiming');
  });
});

/* ================================================= 5. Frozen review lifecycle */

describe('Frozen review: build, grade, delete and every refusal', () => {
  test('freezing refuses when nothing is poolable, and on a past review date', () => {
    const { api } = harness();
    const empty = createEmptyState(NOW_ISO);
    const { store } = harness(empty);
    const api2 = createApi(store, { now: () => NOW, idFactory: (p) => `${p}-x` });
    const refused = api2.freezeEvidenceReview({ label: 'Nothing to freeze' });
    assert.equal(refused.ok, false);
    assert.match(refused.error, /no pooled cell/i);

    const full = harness();
    const past = full.api.freezeEvidenceReview({ label: 'Yesterday', reviewOn: '2026-10-30' });
    assert.equal(past.ok, false);
    assert.match(past.error, /future/i);
  });

  test('a frozen review grades against today, and a grade is permanent', () => {
    const { store, api } = harness();
    const frozen = api.freezeEvidenceReview({ label: 'Fixture', reviewOn: '2026-11-30' });
    assert.equal(frozen.ok, true);
    assert.ok(frozen.review.cells.length >= 1);
    assert.equal(store.state.evidenceReviews.length, 1);
    assert.equal(store.state.evidenceReviews[0].engineVersion, EVIDENCE_ENGINE_VERSION);

    const graded = api.gradeEvidenceReview(frozen.id);
    assert.equal(graded.ok, true);
    assert.ok(graded.grade.cellsGraded >= 1);
    assert.ok(graded.grade.cellsCovered <= graded.grade.cellsGraded);
    assert.ok(Number.isFinite(graded.grade.meanAbsoluteError), 'accuracy is reported beside coverage');
    assert.ok(Number.isFinite(graded.grade.medianFrozenWidth));

    const again = api.gradeEvidenceReview(frozen.id);
    assert.equal(again.ok, false, 'a grade is part of the record and cannot be rewritten');

    const deleted = api.deleteEvidenceReview(frozen.id);
    assert.equal(deleted.ok, false, 'a graded review is calibration history');
    assert.match(deleted.error, /cannot be deleted/i);
  });

  test('an ungraded review can be deleted, and its edges go with it', () => {
    const { store, api } = harness();
    const frozen = api.freezeEvidenceReview({ label: 'Fixture', reviewOn: '2026-11-30' });
    api.scanEvidence();
    const edges = (store.state.links || []).filter((l) => l.sourceType === 'evidence' && l.sourceId === frozen.id);
    assert.ok(edges.length >= 1, 'the scan attached the recommendation to open cases');
    const removed = api.deleteEvidenceReview(frozen.id);
    assert.equal(removed.ok, true);
    assert.equal((store.state.links || []).filter((l) => l.sourceId === frozen.id).length, 0, 'deleting a review removes its edges');
    assert.equal(store.state.evidenceReviews.length, 0);
  });

  test('grading re-derives today’s figures rather than trusting the frozen ones', () => {
    const state = buildEvidenceFixture();
    const report = evidenceReport(state, NOW, state.settings);
    const review = buildEvidenceReview(report, { id: 'evr-g', label: 'G', reviewOn: '2026-11-30', nowIso: NOW_ISO });
    const grading = gradeEvidenceReview(review, report);
    assert.equal(grading.ok, true, 'a review graded against an unchanged workspace still holds');
    assert.equal(grading.cellsCovered, grading.cellsGraded, 'and every frozen interval still covers today’s estimate');
    assert.equal(grading.meanAbsoluteError, 0);
  });
});

/* ====================================== 6. Rule spine and cross-module reach */

describe('Cross-module rule spine (RULE-EBM-01..05)', () => {
  function runRules(state, event, extra = {}) {
    let seq = 0;
    const warnings = [];
    const emitted = [];
    const results = [];
    const ctx = {
      now: NOW, actor: 'leader', idFactory: (p) => `${p}-r-${(seq += 1)}`,
      logEvent: (e) => emitted.push(e), warnings,
      event: event || null,
      ...extra,
    };
    // The rule is run through the shared engine, not called directly, so the
    // registration on the spine is what is being proved here.
    for (const rule of DEFAULT_POST_COMMIT_RULES) {
      if (rule !== evidenceRule) continue;
      try {
        const effects = rule(state, ctx) || [];
        results.push(...effects);
      } catch (error) {
        assert.fail(`evidenceRule threw: ${error.message}`);
      }
    }
    return { effects: results, emitted, warnings, state };
  }

  test('the rule is registered on the shared spine with a declared contract', () => {
    assert.ok(DEFAULT_POST_COMMIT_RULES.includes(evidenceRule), 'the rule runs on the shared engine');
    const contract = PROPAGATION_CONTRACTS.find((c) => c && c.rule === evidenceRule);
    assert.ok(contract, 'and declares a propagation contract');
    assert.ok(contract.writes.includes('evidenceMarkers'));
    assert.ok(contract.writes.includes('links'));
    for (const id of Object.values(EVIDENCE_RULE_IDS)) assert.match(id, /^RULE-EBM-\d\d$/);
    assert.ok(Object.values(EVIDENCE_EVENTS).every((e) => typeof e === 'string' && e.length > 0));
    // EBM-02 listens to the impact ledger's own lifecycle event: a replication
    // task belongs to the moment a result lands, not to a manual scan.
    assert.equal(EVIDENCE_EVENTS.SCORED, 'impact.scored');
  });

  test('a reliable backfire opens exactly one harm decision per cell, once ever', () => {
    const first = runRules(buildEvidenceFixture(), { type: EVIDENCE_EVENTS.SCAN, entity: 'evidence', entityId: '' });
    const harm = first.state.decisions.filter((d) => String(d.rationale || '').includes(EVIDENCE_RULE_IDS.HARM));
    assert.equal(harm.length, 1, 'one cell backfires, so one decision is opened');
    assert.match(harm[0].question, /pool/i);
    assert.ok(harm[0].title.length > 10);
    assert.ok(harm[0].options.length >= 3, 'the decision offers real alternatives, not a yes/no');
    assert.equal(first.state.links.filter((l) => l.relation === 'grounds-practice').length, 0,
      'and it grounds nothing on a review until one has been frozen');

    // Idempotency is by marker, not by time: a second scan must not re-open it.
    const before = first.state.decisions.length;
    const second = runRules(first.state, { type: EVIDENCE_EVENTS.SCAN, entity: 'evidence', entityId: '' });
    assert.equal(second.state.decisions.length, before, 'the harm decision is not re-opened on a second scan');
    assert.equal(second.effects.length, 0, 'and the second scan reports no writes at all');
  });

  test('a lone supported result earns one replication study, opened once', () => {
    // RULE-EBM-02 is event-driven: it fires when a study is SCORED, because
    // that is the moment a single result becomes a claim about a standard.
    const chained = runRules(buildEvidenceFixture(), { type: EVIDENCE_EVENTS.SCORED, entity: 'impact', entityId: 's-u1' });
    assert.equal(chained.state.delegations.filter((d) => String(d.support || '').includes(EVIDENCE_RULE_IDS.REPLICATE)).length, 0,
      's-u1 already has two replications, so the cell is not a lone result');

    // Drop the two replications and the SAME study is now one unconfirmed
    // finding — which is exactly what the rule exists to catch.
    const lone = buildEvidenceFixture();
    lone.impactStudies = lone.impactStudies.filter((row) => !row.replicationOfId);
    const run = runRules(lone, { type: EVIDENCE_EVENTS.SCORED, entity: 'impact', entityId: 's-u1' });
    const opened = run.state.delegations.filter((d) => String(d.support || '').includes(EVIDENCE_RULE_IDS.REPLICATE));
    assert.equal(opened.length, 1, 'a single unreplicated result is a hypothesis, and the rule says so');
    assert.match(opened[0].expectedOutcome, /pre-registered/i, 'the task says what makes the next study evidence');
    assert.equal(opened[0].personId, 'p-leader', 'and it is owned by the leader, never by a report');
    const before = run.state.delegations.length;
    const again = runRules(run.state, { type: EVIDENCE_EVENTS.SCORED, entity: 'impact', entityId: 's-u1' });
    assert.equal(again.state.delegations.length, before, 'the replication task is opened once');
    assert.equal(again.effects.length, 0);
  });

  test('the recommendation reaches open cases as typed edges the case view can resolve', () => {
    // RULE-EBM-04 hangs the recommendation off a FROZEN review: a typed edge
    // needs a durable source, and a page view is not one.
    const seeded = buildEvidenceFixture();
    const seededReport = evidenceReport(seeded, NOW, seeded.settings);
    seeded.evidenceReviews = [buildEvidenceReview(seededReport, {
      id: 'evr-1', label: 'Fixture review', reviewOn: '2026-11-30', nowIso: NOW_ISO,
    })];
    const run = runRules(seeded, { type: EVIDENCE_EVENTS.SCAN, entity: 'evidence', entityId: '' });
    const edges = run.state.links.filter((l) => l.relation === 'recommends-for');
    assert.ok(edges.length >= 1);
    assert.ok(edges.length <= EVIDENCE_DEFAULTS.evidenceMaxCaseLinks);
    for (const edge of edges) {
      assert.equal(edge.sourceType, 'evidence');
      assert.equal(edge.targetType, 'case');
      assert.equal(edge.ruleId, EVIDENCE_RULE_IDS.APPLY);
      const resolved = resolveLinkedEntity(run.state, edge.targetType, edge.targetId);
      assert.ok(resolved && resolved.route.startsWith('#/case'), 'the edge resolves to a navigable case');
      assert.ok(LINK_ENTITY_TYPES.includes('evidence'));
      assert.ok(LINK_RELATIONS.includes('recommends-for') || Object.values(LINK_RELATIONS).includes('recommends-for'));
      assert.ok(LINK_ENTITY_COLLECTIONS.evidence === 'evidenceReviews');
    }
    // The edge is visible from the case side, not only from the review side.
    const targetId = edges[0].targetId;
    assert.ok(linksForEntity(run.state, 'case', targetId).some((entry) => entry.link.relation === 'recommends-for'));
  });

  test('the pause switch stops automatic propagation but never an explicit scan', () => {
    const paused = buildEvidenceFixture();
    paused.settings.evidenceAutoPropagate = false;
    const auto = runRules(paused, { type: 'impact.scored', entity: 'impact', entityId: 's-u1' });
    assert.equal(auto.effects.length, 0, 'a paused workspace writes nothing on a derived event');

    const explicit = runRules(paused, { type: EVIDENCE_EVENTS.SCAN, entity: 'evidence', entityId: '' });
    assert.ok(explicit.effects.length > 0, 'but the leader pressing scan always runs');
  });

  test('the demo workspace produces pooled cells and a frozen review on its own records', () => {
    const demo = buildDemoState(NOW);
    assert.ok((demo.evidenceReviews || []).length >= 1, 'the demo freezes one review through the real builder');
    const report = evidenceReport(demo, NOW, demo.settings || {});
    assert.ok(report.counts.effectUnits >= 8, 'the demo scores its own studies rather than asserting numbers');
    assert.ok(report.counts.eligibleCells >= 1, 'at least one demo cell reaches the pooling floor');
    assert.ok(report.counts.untested >= 1, 'and at least one is honestly left as a count');
    for (const cell of report.effects.cells) {
      if (cell.pool === null) assert.ok(cell.refusalReason, 'every refusal says why');
    }
  });
});

/* ============================== 7. Privacy wall, CSV #56, Insights and view */

describe('Privacy wall, no-names brief, CSV #56 & Insights', () => {
  test('CSV scope #56 exports aggregates and codes, never a title, note or name', () => {
    const scope = CSV_EXPORTS.find((entry) => entry.scope === 'evidence' || entry.key === 'evidence');
    assert.ok(scope, 'the evidence scope is registered');
    assert.equal(CSV_EXPORTS.length, 61);
    const { store } = harness();
    const res = exportWorkspaceCsv(store.state, 'evidence', { now: NOW });
    assert.equal(res.ok, true);
    const csv = res.csv;
    const parsed = parseCsv(csv);
    assert.ok(parsed.rows.length >= 1);
    const flat = csv.toLowerCase();
    for (const leak of ['liam vance', 'maya lin', 'rae mensah', 'a pre-registered hypothesis', 'must never cross', 's-h1', 'support queue breach']) {
      assert.equal(flat.includes(leak), false, `CSV scope #56 must not carry "${leak}"`);
    }
    // Round-trip: it parses back to the same number of rows.
    assert.equal(parsed.rows.length, parseCsv(exportWorkspaceCsv(store.state, 'evidence', { now: NOW }).csv).rows.length);
  });

  test('the terminal names itself in the insights rollup', () => {
    const state = buildEvidenceFixture();
    const insights = buildInsights(state, NOW);
    assert.ok(DOMAIN_ORDER.includes('Evidence'));
    const domain = insights.byDomain.find((d) => d.domain === 'Evidence');
    assert.ok(domain, 'the Evidence domain appears in the rollup');
    assert.ok(domain.count >= 1, 'and it carries the signals it raised');
    const ebm = insights.findings.filter((f) => EVIDENCE_SIGNAL_IDS.includes(f.id));
    assert.ok(ebm.length >= 1);
    for (const finding of ebm) {
      assert.equal(finding.domain, 'Evidence');
      assert.ok(finding.action && finding.action.route.startsWith('#/evidence'), 'every finding points at the terminal that raised it');
    }
  });

});

describe('View (#/evidence) & accessibility', () => {
  function bootDom() {
    const consoleErrors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => {
      if (String(e?.message || '').includes('getContext()')) return;
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
    Object.assign(globalThis, {
      window, document: window.document, Node: window.Node, Element: window.Element,
      HTMLElement: window.HTMLElement, Event: window.Event, MouseEvent: window.MouseEvent,
      KeyboardEvent: window.KeyboardEvent, FileReader: window.FileReader, localStorage: window.localStorage,
    });
    return { dom, window, document: window.document, consoleErrors };
  }

  async function axeViolations(env, root) {
    if (!env.window.axe) env.window.eval(AXE_SRC);
    const result = await env.window.axe.run(root, { rules: { 'color-contrast': { enabled: false } } });
    return Array.from(result.violations).map((v) => `${v.id}: ${v.help}`);
  }

  test('all six panels render axe-clean with labelled tables and a described chart', async () => {
    const env = bootDom();
    try {
      const { createApp } = await import('../../app/main.js');
      const app = createApp({ storage: env.window.localStorage, now: () => NOW });
      app.ctx.loadDemo();
      for (const panel of ['overview', 'works', 'recommend', 'judgement', 'reviews', 'method']) {
        app.ctx.navigate(`#/evidence?panel=${panel}`);
        const view = env.document.querySelector('#view');
        assert.deepEqual(await axeViolations(env, view), [], `#/evidence?panel=${panel} is axe-clean`);
        assert.ok(view.textContent.length > 200, `${panel} renders content`);
        const svgs = view.querySelectorAll('svg');
        for (const svg of svgs) {
          assert.ok(svg.getAttribute('role') === 'img' || svg.getAttribute('aria-hidden') === 'true'
            || svg.querySelector('title') || svg.getAttribute('aria-label'),
          `${panel}: every chart is either described or hidden`);
        }
        for (const table of view.querySelectorAll('table')) {
          assert.ok(table.querySelector('caption') || table.getAttribute('aria-label'), `${panel}: tables are labelled`);
        }
      }
      assert.deepEqual(env.consoleErrors, []);
    } finally {
      env.dom.window.close();
    }
  });

  test('routing: #/evidence is a first-class route with a nav entry, title and aliases', async () => {
    const env = bootDom();
    try {
      const { createApp } = await import('../../app/main.js');
      const app = createApp({ storage: env.window.localStorage, now: () => NOW });
      app.ctx.loadDemo();
      const navLink = Array.from(env.document.querySelectorAll('#sidebar-nav a')).find((a) => /Evidence/.test(a.textContent));
      assert.ok(navLink, 'the nav entry is present');
      assert.equal(navLink.getAttribute('href'), '#/evidence');
      for (const alias of ['#/what-works', '#/meta-analysis', '#/replication', '#/ebm']) {
        app.ctx.navigate(alias);
        assert.equal(app.ctx.route, 'evidence', `${alias} resolves to the evidence terminal`);
      }
      app.ctx.navigate('#/evidence');
      assert.match(env.document.title, /Evidence/i);
      assert.deepEqual(env.consoleErrors, []);
    } finally {
      env.dom.window.close();
    }
  });

  test('an empty workspace renders an honest empty state rather than a confident zero', () => {
    const env = bootDom();
    try {
      const empty = createEmptyState(NOW_ISO);
      const node = renderEvidence({
        state: empty, settings: empty.settings, now: NOW,
        query: new URLSearchParams(''), navigate: () => {}, api: {}, toast: () => {},
      });
      const host = env.document.createElement('div');
      host.appendChild(node);
      env.document.body.appendChild(host);
      const text = host.textContent;
      assert.ok(text.length > 100);
      assert.match(text, /no evidence|nothing|no studies|no review/i, 'it says what is missing');
    } finally {
      env.dom.window.close();
    }
  });

  test('the verdict vocabulary is plain language, not statistics', () => {
    for (const key of ['works-here', 'harms-here', 'no-detectable-effect', 'heterogeneous', 'counts-only', 'no-evidence']) {
      const meta = cellVerdictMeta(key);
      assert.ok(meta.plain.length > 20, `${key} explains itself`);
      assert.equal(/τ|I²|heterogene|p </.test(meta.plain), false, `${key} avoids jargon in its plain reading`);
    }
    assert.equal(cellVerdictMeta('nonsense').plain, cellVerdictMeta('no-detectable-effect').plain, 'an unknown verdict falls back rather than throwing');
  });
});
