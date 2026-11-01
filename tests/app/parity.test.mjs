/**
 * tests/app/parity.test.mjs — Leadership Parity & Standard Consistency Terminal
 * (`#/parity`, Schema v65, ADR-0054, CSV scope #55).
 *
 * Verifies:
 *   1. Schema v65 additivity, 64→65 migration, settings clamps & normalizers
 *   2. Exact cross-domain math: finite-sample Gini, zero-safe Atkinson (ε=0.5),
 *      additive Theil T = T_between + T_within, Wilson 95% score intervals,
 *      and Kendall's τ_b with ties
 *   3. Sample-size & early-ramp protection refusals (<4 post-ramp withholds
 *      indices; <30d joiners protected from deficit flags while 30-60-90
 *      manager promises remain audited; <2 plans / <3 reviews / <5 Brier floors)
 *   4. Structural Fringe, LMX Disparity vs Variety, Promise Ledger (strictly
 *      leader-owed commitments only), and Intra-Leader Standard Consistency
 *      (concern thresholds, halo vs overlooked bench, review concordance & recency)
 *   5. Counterfactual 14-day rebalancing planner & frozen parity audit grading
 *   6. Synchronous rule spine (RULE-PAR-01..05): automatic calibration decision
 *      on `readiness.set` / `performance.plan.adopted` / `review.completed`,
 *      explicit `scanParity` & `freezeParityAudit` creating blameless prompts,
 *      leader-owned tasks (never assigned to neglected reports!) and typed
 *      `audits-consistency`, `rebalances-attention`, `repairs-contract` edges,
 *      marker idempotency, pause switch, and stale-edge reconciliation
 *   7. Privacy wall (`conflicts` and `pulses` untouched), no-names brief,
 *      anonymous CSV scope #55 (`parity`), Insights rollup, and all 6 panels
 *      of `#/parity` passing axe-core
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
  SYSTEM_GENERATED_LINK_RELATIONS, linksForEntity, resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { decisionTempoRule } from '../../app/core/domain/decisionTempo.js';
import {
  normalizeParityAudits,
  normalizeParityMarkers,
} from '../../app/core/domain/paritySchema.js';
import {
  PARITY_SIGNAL_IDS,
  wilsonInterval,
  computeInequality,
  computeTheilDecomposition,
  computeKendallTauB,
  auditConcernConsistency,
  auditReadinessConsistency,
  auditReviewConsistency,
  parityReport,
  planParityRebalance,
  paritySignals,
  parityAttentionCount,
  parityBrief,
} from '../../app/core/domain/parity.js';
import { parityRule, PARITY_RULE_IDS } from '../../app/core/domain/parityRules.js';
import { renderParity } from '../../app/views/parity.js';

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
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory: (p) => `${p}-par-${(seq += 1)}` });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory: (p) => `${p}-api-${(seq += 1)}` });
  const target = initialState || buildParityFixture();
  const imported = store.importJSON(JSON.stringify(target), { now: NOW });
  assert.equal(imported.ok, true);
  return { store, api };
}

function buildParityFixture() {
  const s = createEmptyState(NOW_ISO);
  s.settings.leaderName = 'Rae Mensah';
  s.people = [
    // Leader on roster so leader-owned tasks can resolve to p-leader
    { id: 'p-leader', name: 'Rae Mensah', role: 'Engineering Manager', level: 'manager', startDate: '2024-01-10', status: 'active', talkingPoints: [] },
    // Inner-circle IC receiving disproportionate coaching, feedback, stretch & halo nomination
    { id: 'p-inner', name: 'Liam Vance', role: 'Engineer', level: 'ic', startDate: '2025-01-15', status: 'active', talkingPoints: [] },
    // Steady IC with strong behavioural evidence (overlooked bench)
    { id: 'p-bench', name: 'Maya Lin', role: 'Engineer', level: 'ic', startDate: '2025-02-01', status: 'active', talkingPoints: [] },
    // Neglected IC in Structural Fringe + broken leader promises
    { id: 'p-fringe', name: 'Noor Haddad', role: 'Engineer', level: 'ic', startDate: '2025-03-01', status: 'active', talkingPoints: [] },
    // Senior peer
    { id: 'p-senior', name: 'Omar Silva', role: 'Senior Engineer', level: 'senior', startDate: '2024-06-01', status: 'active', talkingPoints: [] },
    // Early-ramp joiner (<30d on roster) — must be protected from deficit flags!
    { id: 'p-ramp', name: 'Pia Lind', role: 'Engineer', level: 'ic', startDate: '2026-10-15', status: 'active', talkingPoints: [] },
  ];

  // 1:1s: Liam gets 6 held + fulfilled leader promises; Noor gets 2 skipped + overdue/carried leader promises;
  // report-owned action on Noor must NEVER count as a broken leader promise!
  s.oneOnOnes = [
    {
      id: 'oo-1', personId: 'p-inner', date: '2026-10-24', status: 'held',
      actions: [
        { id: 'a-1', text: 'Intro to VP Product', owner: 'leader', due: '2026-10-28', done: true, completedOn: '2026-10-26' },
        { id: 'a-2', text: 'Approve conference budget', owner: 'leader', due: '2026-10-29', done: true, completedOn: '2026-10-27' },
      ],
    },
    { id: 'oo-2', personId: 'p-inner', date: '2026-10-10', status: 'held', actions: [] },
    { id: 'oo-3', personId: 'p-inner', date: '2026-09-26', status: 'held', actions: [] },
    { id: 'oo-4', personId: 'p-bench', date: '2026-10-22', status: 'held', actions: [] },
    { id: 'oo-4b', personId: 'p-bench', date: '2026-10-08', status: 'held', actions: [] },
    { id: 'oo-5', personId: 'p-senior', date: '2026-10-20', status: 'held', actions: [] },
    { id: 'oo-6', personId: 'p-leader', date: '2026-10-21', status: 'held', actions: [] },
    // Carry chain on Noor (`oo-prev1` -> `oo-prev2` -> `oo-7` = 2 carries) + `them`-owned action excluded
    {
      id: 'oo-prev1', personId: 'p-fringe', date: '2026-07-05', status: 'held',
      actions: [
        { id: 'a-3-0', text: 'Unblock staging access', owner: 'leader', due: '2026-07-15', done: false, carriedToMeetingId: 'oo-prev2', carriedToActionId: 'a-3-1' },
      ],
    },
    {
      id: 'oo-prev2', personId: 'p-fringe', date: '2026-07-20', status: 'held',
      actions: [
        { id: 'a-3-1', text: 'Unblock staging access', owner: 'leader', due: '2026-07-28', done: false, carriedFrom: { meetingId: 'oo-prev1', actionId: 'a-3-0' }, carriedToMeetingId: 'oo-7', carriedToActionId: 'a-3' },
      ],
    },
    {
      id: 'oo-7', personId: 'p-fringe', date: '2026-09-15', status: 'skipped',
      actions: [
        { id: 'a-3', text: 'Unblock staging access', owner: 'leader', due: '2026-09-25', done: false, carriedFrom: { meetingId: 'oo-prev2', actionId: 'a-3-1' } },
        { id: 'a-4', text: 'Share promo rubric', owner: 'shared', due: '2026-10-01', done: false },
        { id: 'a-report', text: 'Draft RFC section', owner: 'them', due: '2026-09-20', done: false },
      ],
    },
    { id: 'oo-8', personId: 'p-fringe', date: '2026-10-01', status: 'skipped', actions: [] },
  ];

  // SBI feedback concentrated on Maya (giving her 5/5 readiness signals); Liam has 0 feedback (so <=2/5 readiness signals); zero on Noor
  s.feedback = [
    {
      id: 'fb-3', personId: 'p-bench', date: '2026-10-12', observedOn: '2026-10-11', kind: 'praise',
      situation: 'During billing schema cutover',
      behavior: 'wrote rollback verification script and paired with two newer teammates',
      impact: 'zero customer-facing errors across 40k events',
    },
    {
      id: 'fb-4', personId: 'p-bench', date: '2026-09-14', observedOn: '2026-09-13', kind: 'constructive',
      situation: 'In weekly architecture clinic',
      behavior: 'documented trade-offs across 3 queue designs clearly',
      impact: 'unblocked two downstream teams',
    },
  ];

  // Stretch delegations & goals giving Maya >=4/5 readiness behavioural signals,
  // while Liam has thin behavioural readiness signals yet gets nominated `ready-now`!
  s.delegations = [
    {
      id: 'del-1', personId: 'p-bench', title: 'Own Q4 settlement service cutover',
      expectedOutcome: 'Zero-downtime cutover', authority: 'own', support: 'Weekly check-in',
      delegatedOn: '2026-08-15', dueOn: '2026-10-05', status: 'done', completedOn: '2026-10-03',
      checkins: [{ id: 'ck-1', date: '2026-09-10', status: 'on-track', note: 'Smooth' }],
    },
    {
      id: 'del-2', personId: 'p-bench', title: 'Lead partner webhook contract v2',
      expectedOutcome: 'Signed spec', authority: 'decide-inform', support: '',
      delegatedOn: '2026-09-01', dueOn: '2026-10-15', status: 'done', completedOn: '2026-10-12',
      checkins: [],
    },
    {
      id: 'del-3', personId: 'p-inner', title: 'Draft internal demo deck',
      expectedOutcome: 'Slides ready', authority: 'recommend', support: '',
      delegatedOn: '2026-10-05', dueOn: '2026-11-10', status: 'active',
      checkins: [],
    },
  ];

  s.goals = [
    {
      id: 'g-1', ownerId: 'p-bench', title: 'Cut p99 settlement latency below 120ms',
      timeframe: 'Q4', status: 'active', coAuthored: true,
      keyResults: [{ id: 'kr-1', label: 'p99 ms', current: 85, target: 100 }],
      checkins: [{ id: 'gc-1', date: '2026-09-15', confidence: 'on-track', progressPct: 85 }],
    },
  ];
  s.growthPlans = [
    {
      id: 'gp-1', personId: 'p-bench', goal: 'Staff-level system stewardship',
      reality: 'Leading cross-pod APIs', options: ['Architecture clinic', 'Incident IC rotation'],
      will: [{ id: 'w-1', text: 'Chair two clinics', due: '2026-10-01', done: true, completedOn: '2026-09-29' }],
      status: 'active', lastReviewedOn: '2026-10-10',
    },
  ];
  s.recognition = [
    { id: 'rec-1', personId: 'p-inner', date: '2026-10-16', what: 'Demo polish', impact: 'Exec visibility', channel: 'public' },
    { id: 'rec-2', personId: 'p-bench', date: '2026-10-02', what: 'Zero-error cutover', impact: 'Reliability', channel: 'team' },
  ];

  // Readiness inversion: Liam (`p-inner`) nominated `ready-now` with low evidence (2/5);
  // Maya (`p-bench`) has 5/5 behavioural signals and NO nomination!
  s.readiness = [
    { id: 'rd-1', personId: 'p-inner', seat: 'Tech Lead — Core', rating: 'ready-now', notes: 'Visible' },
  ];

  // Two adopted performance concerns with sharply unequal evidentiary bars
  s.performanceConcerns = [
    {
      id: 'pc-1', personId: 'p-senior', label: 'Release runbook gap', status: 'plan',
      openedOn: '2026-09-10',
      standard: { expectation: 'Complete canary sign-off', source: 'role-description', recordedOn: '2026-09-01' },
      gap: { observed: 'Missed two release sign-offs', impact: 'Rollback' },
      observations: [
        { id: 'ob-1', on: '2026-09-10', situation: 'Release 41', behavior: 'Skipped checklist', impact: 'Rollback' },
        { id: 'ob-2', on: '2026-09-16', situation: 'Release 42', behavior: 'Late sign-off', impact: 'Delay' },
        { id: 'ob-3', on: '2026-09-24', situation: 'Release 43', behavior: 'Missing canary check', impact: 'Alert' },
        { id: 'ob-4', on: '2026-09-26', situation: 'Postmortem', behavior: 'Action item unlogged', impact: 'Slip' },
      ],
      conversations: [
        { id: 'cv-1', on: '2026-09-27', kind: 'two-way', summary: 'Reviewed rubric', theirView: 'Interrupt spike' },
      ],
      supports: [
        { id: 'sp-1', on: '2026-09-27', kind: 'coaching', detail: 'Paired on release checklist' },
      ],
      plan: {
        adoptedOn: '2026-09-30',
        reviewOn: '2026-11-15',
        objectives: [{ id: 'obj-1', text: 'Complete canary sign-off on next 3 releases', measure: '3/3 signed', byWhen: '2026-11-15' }],
        overrideReason: '',
      },
    },
    {
      id: 'pc-2', personId: 'p-fringe', label: 'Async update timing', status: 'plan',
      openedOn: '2026-10-18',
      standard: { expectation: 'Post Friday status', source: 'team-agreement', recordedOn: '2026-10-01' },
      gap: { observed: 'Late sprint status update', impact: 'Late rollup' },
      observations: [
        { id: 'ob-5', on: '2026-10-18', situation: 'Sprint 19', behavior: 'Posted Monday morning', impact: 'Late rollup' },
      ],
      conversations: [
        { id: 'cv-2', on: '2026-10-19', kind: 'one-way', summary: 'Sent note' },
      ],
      supports: [],
      plan: {
        adoptedOn: '2026-10-20',
        reviewOn: '2026-11-20',
        objectives: [{ id: 'obj-2', text: 'Post update by Friday 16:00', measure: 'On time', byWhen: '2026-11-20' }],
        overrideReason: 'Adopted early ahead of Q4 planning.',
      },
    },
  ];

  // Three rated IC reviews with a clear discordant pair (Liam rated often-exceeds with
  // 1 evidence item while Maya rated meets-expectations with 4 positive items)
  s.reviews = [
    {
      id: 'rev-1', personId: 'p-inner', periodStart: '2026-07-01', periodEnd: '2026-10-25',
      status: 'completed', manager: { rating: 'often-exceeds', achievements: 'Visible', development: '', nextSteps: '' },
      evidence: [
        { id: 'e-1', sourceType: 'recognition', date: '2026-10-20', summary: 'Exec demo', valence: 'positive' },
      ],
    },
    {
      id: 'rev-2', personId: 'p-bench', periodStart: '2026-07-01', periodEnd: '2026-10-25',
      status: 'completed', manager: { rating: 'meets-expectations', achievements: 'Execution', development: '', nextSteps: '' },
      evidence: [
        { id: 'e-2', sourceType: 'goal', date: '2026-07-20', summary: 'Latency KR', valence: 'positive' },
        { id: 'e-3', sourceType: 'delegation', date: '2026-08-18', summary: 'Cutover owned', valence: 'positive' },
        { id: 'e-4', sourceType: 'delegation', date: '2026-09-12', summary: 'Webhook v2', valence: 'positive' },
        { id: 'e-5', sourceType: 'feedback', date: '2026-10-02', summary: 'Rollback script', valence: 'positive' },
      ],
    },
    {
      id: 'rev-3', personId: 'p-fringe', periodStart: '2026-07-01', periodEnd: '2026-10-25',
      status: 'completed', manager: { rating: 'needs-development', achievements: '', development: 'Cadence', nextSteps: '' },
      evidence: [
        { id: 'e-6', sourceType: 'feedback', date: '2026-08-10', summary: 'Needs scope check', valence: 'constructive' },
      ],
    },
  ];

  // Confidential conflict & pulse records to prove the privacy wall ignores them
  s.conflicts = [
    { id: 'conf-secret', title: 'CONFIDENTIAL_MEDIATION_TOKEN', status: 'open', partyIds: ['p-fringe', 'p-inner'], createdOn: '2026-10-10' },
  ];
  s.pulses = [
    { id: 'pulse-secret', date: '2026-10-15', comment: 'ANONYMOUS_PULSE_SECRET_TOKEN', safety: 2, clarity: 2, workload: 2, recognition: 2, growth: 2 },
  ];

  return normalizeState(s, { now: NOW }).state;
}

describe('Schema v65 & normalizers', () => {
  test('SCHEMA_VERSION is 65 and 64→65 migration is additive and empty', () => {
    assert.equal(SCHEMA_VERSION, 75);
    assert.equal(typeof MIGRATIONS[64], 'function');
    const migrated = migrate({ schemaVersion: 64, appId: 'leados', people: [] });
    assert.equal(migrated.raw.schemaVersion, 75);
    assert.deepEqual(migrated.raw.parityAudits, []);
    assert.deepEqual(migrated.raw.parityMarkers, []);
  });

  test('normalizeParityAudits fails closed and repairs ungraded claims downward', () => {
    const warnings = [];
    const out = normalizeParityAudits([
      null,
      { id: 'pa-bad-date', frozenOn: 'not-a-date', reviewOn: '2026-10-29' },
      {
        id: 'pa-claimed',
        status: 'graded',
        label: 'Claimed graded without grade object',
        frozenOn: '2026-10-01',
        reviewOn: '2026-10-29',
        grade: null,
      },
    ], NOW_ISO, warnings);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'pa-claimed');
    assert.equal(out[0].status, 'frozen');
    assert.ok(warnings.length >= 2);
    assert.deepEqual(normalizeParityMarkers(['RULE-PAR-01:2026-W44', 'RULE-PAR-01:2026-W44', '']), ['RULE-PAR-01:2026-W44']);
  });
});

describe('Cross-domain mathematical estimators', () => {
  test('finite-sample Gini, Atkinson (ε=0.5) and Theil T hit exact boundary identities', () => {
    const equal = computeInequality([5, 5, 5, 5], 4);
    assert.equal(equal.available, true);
    assert.equal(equal.giniPct, 0);
    assert.equal(equal.atkinsonPct, 0);

    const monopoly = computeInequality([12, 0, 0, 0], 4);
    assert.equal(monopoly.available, true);
    assert.equal(monopoly.giniPct, 100);
    assert.equal(monopoly.atkinsonPct, 75);

    const monoTheil = computeTheilDecomposition([
      { value: 12, cohort: 'ic:steady' },
      { value: 0, cohort: 'ic:steady' },
      { value: 0, cohort: 'ic:steady' },
      { value: 0, cohort: 'ic:steady' },
    ], 4);
    assert.ok(Math.abs(monoTheil.theil - Math.log(4)) < 1e-3);

    const small = computeInequality([10, 0, 0], 4);
    assert.equal(small.available, false);
  });

  test('Theil T decomposes additively into T_between + T_within across cohorts', () => {
    const dec = computeTheilDecomposition([
      { value: 10, cohort: 'ic:steady' },
      { value: 2, cohort: 'ic:steady' },
      { value: 0, cohort: 'ic:steady' },
      { value: 8, cohort: 'senior:steady' },
      { value: 7, cohort: 'senior:steady' },
    ], 4);
    assert.equal(dec.available, true);
    assert.ok(Math.abs((dec.betweenTheil + dec.withinTheil) - dec.theil) <= 1e-3);
    assert.ok(dec.withinTheil > dec.betweenTheil, 'peer disparity within ic:steady exceeds between-level variety');
  });

  test('Wilson 95% score intervals and Kendall τ_b handle small denominators and ties', () => {
    const w0 = wilsonInterval(0, 0);
    assert.equal(w0.available, false);
    assert.equal(w0.ratePct, null);
    const w1 = wilsonInterval(1, 1);
    assert.equal(w1.ratePct, 100);
    assert.ok(w1.lowPct < 25 && w1.highPct === 100, '1/1 promise record is never treated as narrow certainty');

    const perfect = computeKendallTauB([{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }], 3);
    assert.equal(perfect.available, true);
    assert.equal(perfect.tauB, 1);

    const inverted = computeKendallTauB([{ x: 1, y: 30 }, { x: 2, y: 20 }, { x: 3, y: 10 }], 3);
    assert.equal(inverted.tauB, -1);

    const withheld = computeKendallTauB([{ x: 1, y: 10 }, { x: 2, y: 20 }], 3);
    assert.equal(withheld.available, false);
  });
});

describe('Domain report, early-ramp protection, promises & standard consistency', () => {
  test('protects early-ramp joiner from fringe flags while detecting post-ramp fringe, promise asymmetry and standard inversions', () => {
    const state = buildParityFixture();
    const report = parityReport(state, NOW);

    assert.equal(report.counts.activePeople, 6);
    assert.equal(report.counts.rampProtected, 1, 'Pia Lind (<30d tenure) is ramp-protected');
    assert.equal(report.counts.eligiblePostRamp, 5);

    // Noor is in Structural Fringe; Pia (ramp-protected) is NOT!
    assert.ok(report.fringeRows.some((r) => r.personId === 'p-fringe'));
    assert.ok(!report.fringeRows.some((r) => r.personId === 'p-ramp'));

    // Promise ledger counts ONLY leader/shared promises (never `a-report` owned by report!)
    const noorPromises = report.promises.rows.find((r) => r.personId === 'p-fringe');
    assert.equal(noorPromises.totalPromises, 2, 'report-owned action is strictly excluded');
    assert.equal(noorPromises.overdueOpen, 2);
    assert.equal(noorPromises.carriedTwicePlus, 1);
    assert.equal(noorPromises.breachRisk, true);
    assert.equal(report.promises.promiseGapPp, 100, 'Liam 100% vs Noor 0%');

    // Standard consistency detects all three intra-leader inversions
    assert.equal(report.standardConsistency.concerns.inconsistent, true);
    assert.equal(report.standardConsistency.readiness.haloNominations.length, 1);
    assert.equal(report.standardConsistency.readiness.overlookedBench.length, 1);
    assert.equal(report.standardConsistency.reviews.discordantPairs.length, 1);

    // Signals PAR-01, PAR-03, PAR-04, PAR-05 fire
    const sigs = paritySignals(state, NOW);
    const ids = new Set(sigs.map((s) => s.id));
    assert.ok(ids.has(PARITY_SIGNAL_IDS.FRINGE));
    assert.ok(ids.has(PARITY_SIGNAL_IDS.PROMISE));
    assert.ok(ids.has(PARITY_SIGNAL_IDS.CONCERN_BAR));
    assert.ok(ids.has(PARITY_SIGNAL_IDS.BENCH_REVIEW));
    assert.ok(parityAttentionCount(state, NOW) >= 3);
  });

  test('counterfactual 14-day rebalancing planner reduces T_within, overdue promises and inversions within hour budget', () => {
    const state = buildParityFixture();
    const plan = planParityRebalance(state, NOW, { hourBudget: 4 });
    assert.ok(plan.chosen.length >= 2);
    assert.ok(plan.hoursPlanned <= 4);
    assert.ok(plan.after.overdueLeaderPromises < plan.before.overdueLeaderPromises || plan.after.inversionsCount < plan.before.inversionsCount);
  });
});

describe('Cross-module rule spine (RULE-PAR-01..05) & typed entity graph', () => {
  test('parityRule sits before decisionTempoRule and has a registered propagation contract', () => {
    const parIdx = DEFAULT_POST_COMMIT_RULES.indexOf(parityRule);
    const tempoIdx = DEFAULT_POST_COMMIT_RULES.indexOf(decisionTempoRule);
    assert.ok(parIdx >= 0 && parIdx < tempoIdx, 'parityRule must precede decisionTempoRule');
    assert.ok(PROPAGATION_CONTRACTS.some((c) => c.rule === parityRule));
    assert.ok(LINK_ENTITY_TYPES.includes('parity'));
    assert.equal(LINK_ENTITY_COLLECTIONS.parity, 'parityAudits');
    for (const rel of ['audits-consistency', 'rebalances-attention', 'repairs-contract']) {
      assert.ok(LINK_RELATIONS.includes(rel));
      assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes(rel));
    }
  });

  test('freezeParityAudit + scanParity fan out blameless prompts, leader-owned tasks (never on neglected report!), DACI decision and typed edges idempotently', () => {
    const { store, api } = harness();

    const frozen = api.freezeParityAudit({
      label: 'Q4 parity baseline',
      commitment: 'Hold biweekly 1:1 with Noor and clear carried promises',
      reviewOn: '2026-11-28',
      predictedImprovementPct: 75,
    });
    assert.equal(frozen.ok, true);

    const st = store.state;
    // Calibration decision opened by RULE-PAR-01
    const calDec = st.decisions.find((d) => d.rationale.includes(PARITY_RULE_IDS.STANDARD));
    assert.ok(calDec, 'RULE-PAR-01 opened standard-consistency calibration decision');

    // Leader-owned delegations opened on p-leader — NEVER on p-fringe!
    const fringeTasksOnReport = st.delegations.filter((d) => d.personId === 'p-fringe');
    assert.equal(fringeTasksOnReport.length, 0, 'never assigns leader-rebalancing homework to neglected employee');
    const leaderTasks = st.delegations.filter((d) => d.personId === 'p-leader');
    assert.ok(leaderTasks.length >= 2, 'leader receives coaching & promise-recovery tasks');

    // Blameless talking points queued on Noor (fringe + promise) and Maya (overlooked bench)
    const noor = st.people.find((p) => p.id === 'p-fringe');
    const maya = st.people.find((p) => p.id === 'p-bench');
    assert.ok(noor.talkingPoints.some((t) => t.includes(PARITY_RULE_IDS.FRINGE)));
    assert.ok(noor.talkingPoints.some((t) => t.includes(PARITY_RULE_IDS.PROMISE)));
    assert.ok(maya.talkingPoints.some((t) => t.includes(PARITY_RULE_IDS.BENCH)));

    // Typed links resolve cleanly from `parity` audit node
    const auditLinks = linksForEntity(st, 'parity', frozen.id);
    assert.ok(auditLinks.some((l) => l.relation === 'audits-consistency'));
    assert.ok(auditLinks.some((l) => l.relation === 'rebalances-attention'));
    assert.ok(auditLinks.some((l) => l.relation === 'repairs-contract'));
    const resolved = resolveLinkedEntity(st, 'parity', frozen.id);
    assert.equal(resolved.route, `#/parity?panel=rebalance&audit=${encodeURIComponent(frozen.id)}`);

    // Second scan is strictly idempotent
    const second = api.scanParity();
    assert.equal(second.ok, true);
    assert.equal(second.changed, false);

    // Premature grading before reviewOn is refused
    const earlyGrade = api.gradeParityAudit(frozen.id, { notes: 'Too early' });
    assert.equal(earlyGrade.ok, false);
  });

  test('parityAutoPropagate=false pauses automatic readiness.set fan-out while explicit scanParity still runs', () => {
    const base = buildParityFixture();
    base.settings.parityAutoPropagate = false;
    const { store, api } = harness(base);

    api.setReadiness({ personId: 'p-inner', seat: 'Director', rating: 'ready-now', strengths: 'Vis', gaps: '', nextStep: '' });
    assert.equal(store.state.decisions.length, 0, 'auto-propagation paused');

    const explicit = api.scanParity();
    assert.equal(explicit.ok, true);
    assert.equal(explicit.changed, true);
    assert.ok(store.state.decisions.length >= 1, 'explicit scan still executes');
  });

  test('due parity audit grades irreversibly with Brier score and refuses deletion once graded', () => {
    const base = buildParityFixture();
    base.parityAudits = [{
      id: 'pa-due',
      schemaVersion: 1,
      status: 'frozen',
      label: 'Past audit',
      commitment: 'Close gaps',
      frozenOn: '2026-09-15',
      reviewOn: '2026-10-15',
      windowDays: 90,
      eligibleCount: 5,
      withinTheilMean: 0.95,
      fringeCount: 3,
      promiseFulfillmentPct: 20,
      promiseGapPp: 100,
      overdueLeaderPromises: 5,
      inversionsCount: 5,
      predictedImprovementPct: 80,
      channels: [],
      grade: null,
      notes: '',
      createdAt: NOW_ISO,
    }];
    const { api } = harness(normalizeState(base, { now: NOW }).state);

    const graded = api.gradeParityAudit('pa-due', { notes: 'Narrowed fringe & inversions' });
    assert.equal(graded.ok, true);
    assert.equal(graded.grade.improved, true);
    assert.equal(graded.grade.brier, 0.04); // (0.8 - 1)^2 = 0.04!

    const regrade = api.gradeParityAudit('pa-due', { notes: 'Retry' });
    assert.equal(regrade.ok, false);
    const del = api.deleteParityAudit('pa-due');
    assert.equal(del.ok, false);
  });
});

describe('Privacy wall, no-names brief, CSV #55 & Insights', () => {
  test('brief and CSV #55 never leak person names, conflict titles or pulse comments', () => {
    const state = buildParityFixture();
    const brief = parityBrief(state, NOW);
    for (const p of state.people) {
      assert.ok(!brief.includes(p.name), `brief must not contain person name ${p.name}`);
    }
    assert.ok(!brief.includes('CONFIDENTIAL_MEDIATION_TOKEN'));
    assert.ok(!brief.includes('ANONYMOUS_PULSE_SECRET_TOKEN'));

    assert.equal(CSV_EXPORTS.length, 65);
    const res = exportWorkspaceCsv(state, 'parity', { now: NOW });
    assert.equal(res.ok, true);
    for (const p of state.people) {
      assert.ok(!res.csv.includes(p.name), `CSV must not contain person name ${p.name}`);
    }
    assert.ok(!res.csv.includes('CONFIDENTIAL_MEDIATION_TOKEN'));
    const parsed = parseCsv(res.csv);
    assert.equal(parsed.rows.length, 6, '4 channels + PROMISE-LEDGER + STANDARD-AUDIT');
  });

  test('DOMAIN_ORDER includes Leadership parity and buildInsights surfaces PAR signals', () => {
    assert.ok(DOMAIN_ORDER.includes('Leadership parity'));
    const insights = buildInsights(buildParityFixture(), NOW);
    assert.ok(insights.findings.some((f) => f.domain === 'Leadership parity'));
    assert.ok(insights.byDomain.some((b) => b.domain === 'Leadership parity'));
  });

  test('demo workspace includes a due frozen parity audit without altering existing demo counts', () => {
    const demo = buildDemoState(NOW);
    assert.equal(demo.parityAudits.length, 1);
    assert.equal(demo.parityAudits[0].status, 'frozen');
  });
});

describe('View (#/parity) & accessibility', () => {
  test('all 6 panels render with one h1, inline Lorenz SVGs, and zero axe-core violations', async () => {
    const state = buildParityFixture();
    for (const panel of ['overview', 'allocation', 'promises', 'consistency', 'rebalance', 'method']) {
      const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div></body></html>', {
        virtualConsole: new VirtualConsole(),
        url: `https://leados.test/#/parity?panel=${panel}`,
        runScripts: 'outside-only',
      });
      const { window } = dom;
      globalThis.window = window;
      globalThis.document = window.document;
      globalThis.Node = window.Node;
      globalThis.Element = window.Element;
      globalThis.HTMLElement = window.HTMLElement;
      globalThis.SVGElement = window.SVGElement;
      globalThis.Event = window.Event;
      globalThis.MouseEvent = window.MouseEvent;
      globalThis.KeyboardEvent = window.KeyboardEvent;

      const node = renderParity({
        state,
        now: NOW,
        query: new URLSearchParams(`panel=${panel}`),
        navigate: () => {},
        api: {
          scanParity: () => ({ ok: true, changed: false }),
          freezeParityAudit: () => ({ ok: true, id: 'pa-1' }),
          gradeParityAudit: () => ({ ok: true }),
          deleteParityAudit: () => ({ ok: true }),
          parityBriefText: () => parityBrief(state, NOW),
        },
      });
      window.document.getElementById('view').appendChild(node);
      assert.equal(window.document.querySelectorAll('h1').length, 1, `panel ${panel} has one h1`);
      if (panel === 'overview') {
        assert.ok(window.document.querySelectorAll('svg[role="img"]').length >= 2, 'overview renders accessible Lorenz curve SVGs');
      }
      window.eval(AXE_SRC);
      const axeRes = await window.axe.run(window.document.getElementById('view'), {
        rules: { 'color-contrast': { enabled: false } },
      });
      assert.deepEqual(
        Array.from(axeRes.violations).map((v) => v.id),
        [],
        `panel ${panel} must be axe-clean`,
      );
    }
  });
});
