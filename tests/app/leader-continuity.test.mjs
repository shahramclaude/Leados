/**
 * tests/app/leader-continuity.test.mjs — Leader Continuity Drill
 * (Schema v45, ADR-0032, RULE-LCS-01..03).
 *
 *   1. Schema v45: version, additive migration from v44, settings clamps.
 *   2. Demand inventory: what actually requires the leader inside a window,
 *      what is non-delegable by convention, and what is priced.
 *   3. Simulation: the exact Poisson-binomial tail against a seeded Monte
 *      Carlo, P50/P80/P90 monotonicity, and per-currency exposure that never
 *      sums two currencies.
 *   4. Cover planning: held items are never covered, coverage is measured
 *      against every critical item (the denominator bug), and the plan is
 *      deterministic.
 *   5. Drill ledger: frozen predictions, one open drill at a time, Brier/skill
 *      with unpredicted stalls, counts-only floors.
 *   6. Actions: stale plan key and stale window refusal, atomic commissioning,
 *      window-level idempotency, auto-propagate pause, policy bounds.
 *   7. Rule spine: registration, ordering before Decision Tempo, marker
 *      dedupe, propagation contracts, Insights merge.
 *   8. CSV scope #41 is opaque: no titles, names or notes.
 *   9. JSDOM + axe across `#/handover` and a dated deep link.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState, migrate, normalizeState, SCHEMA_VERSION, DEFAULT_SETTINGS,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { DEFAULT_POST_COMMIT_RULES, runPostCommitRules } from '../../app/core/domain/postCommit.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import {
  CONTINUITY_CRITICAL,
  CONTINUITY_KINDS,
  CONTINUITY_MIN_SCORED_ITEMS,
  CONTINUITY_RULE_IDS,
  CONTINUITY_RULES,
  attributeDrillOutcomes,
  buildCoverPlan,
  buildDeputyPool,
  buildLeaderContinuityReport,
  continuityBrief,
  continuitySignals,
  coverConcentration,
  coverPlanKey,
  deputyFitForItem,
  gradeCoveredSourceProgress,
  handoverImplementation,
  handoverReadiness,
  leaderDemandInventory,
  scoreDrillRecord,
  simulateCorrelatedAbsence,
  stressAbsence,
  vendorCommonModeContagion,
} from '../../app/core/domain/leaderContinuity.js';
import { leaderContinuityRule } from '../../app/core/domain/leaderContinuityRule.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-28T10:00:00.000Z');

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

function demoStore() {
  const store = createStore({ storage: memStorage(), now: () => NOW });
  store.seedDemo(buildDemoState(NOW));
  return store;
}

function demoApi() {
  const store = demoStore();
  return { store, api: createApi(store, { now: () => NOW }) };
}

/* ================================================== 1. Schema v45 */

test('Schema v46: version, additive v44 → v46 chain and settings clamps', () => {
  assert.equal(SCHEMA_VERSION, 61);
  const v44 = { ...createEmptyState(), schemaVersion: 44 };
  delete v44.continuityDrills;
  const { raw: migrated, applied } = migrate(v44);
  assert.equal(migrated.schemaVersion, 60);
  assert.ok(applied.includes('44 → 45'));
  assert.ok(applied.includes('45 → 46'));
  assert.equal(migrated.settings.continuityCommonCausePct, DEFAULT_SETTINGS.continuityCommonCausePct);
  assert.deepEqual(migrated.continuityDrills, []);
  assert.equal(migrated.settings.continuityHorizonDays, DEFAULT_SETTINGS.continuityHorizonDays);
  assert.equal(migrated.settings.continuityMinFitPct, DEFAULT_SETTINGS.continuityMinFitPct);
  assert.equal(migrated.settings.continuityAutoPropagate, true);

  const clamped = normalizeState({
    ...createEmptyState(),
    settings: {
      ...createEmptyState().settings,
      continuityHorizonDays: 500,
      continuityMinFitPct: -3,
      continuityCommonCausePct: 400,
    },
  }).state;
  assert.equal(clamped.settings.continuityCommonCausePct, 100, 'the shared-cause convention clamps into 0–100');
  assert.equal(clamped.settings.continuityHorizonDays, 90);
  assert.equal(clamped.settings.continuityMinFitPct, 1);

  const normalized = normalizeState({
    ...createEmptyState(),
    continuityDrills: [{
      id: 'd1',
      startOn: '2026-11-02',
      endOn: '2026-11-15',
      status: 'closed',
      predictions: [
        { key: 'decides|decision|dec-1', pStall: 0.75, dueOn: '2026-11-03' },
        { key: 'decides|decision|dec-2', pStall: 4, dueOn: '2026-11-03' },
      ],
      observedKeys: ['decides|decision|dec-1', 'not-a-prediction', 42],
      unexpectedStalls: 3,
    }],
  }).state;
  assert.equal(normalized.continuityDrills.length, 1);
  const drill = normalized.continuityDrills[0];
  assert.equal(drill.predictions.length, 1, 'a probability outside [0,1] is refused, not clamped');
  assert.equal(drill.predictions[0].pStall, 0.75);
  assert.deepEqual(drill.observedKeys, ['decides|decision|dec-1'], 'unknown observed keys are dropped');
  assert.equal(drill.unexpectedStalls, 3);
});

/* ================================================ 2. Demand inventory */

test('Demand inventory: window, kinds, criticality and non-delegable items', () => {
  const state = demoStore().state;
  const inventory = leaderDemandInventory(state, { now: NOW, horizonDays: 14 });
  assert.ok(inventory.items.length > 0);
  assert.equal(inventory.windowStart, '2026-10-28');
  assert.equal(inventory.windowEnd, '2026-11-11');
  assert.equal(inventory.counts.total, inventory.items.length);
  for (const row of inventory.items) {
    assert.ok(row.dueOn >= inventory.windowStart && row.dueOn <= inventory.windowEnd, `${row.dueOn} inside window`);
    assert.ok(CONTINUITY_KINDS.includes(row.stallKind));
    assert.ok(row.criticality >= 1 && row.criticality <= 5);
    assert.ok(Array.isArray(row.criticalityBasis) && row.criticalityBasis.length > 0);
  }
  const critical = inventory.items.filter((row) => row.criticality >= CONTINUITY_CRITICAL);
  assert.equal(inventory.counts.critical, critical.length);
  assert.equal(inventory.counts.criticalHeld, critical.filter((row) => row.delegability === 'held').length);
  assert.ok(inventory.counts.pricedCritical <= inventory.counts.critical);

  // A shorter window can never contain more work than a longer one.
  const short = leaderDemandInventory(state, { now: NOW, horizonDays: 3 });
  assert.ok(short.items.length <= inventory.items.length);
  for (const row of short.items) assert.ok(row.dueOn <= short.windowEnd);
});

/* ==================================================== 3. Simulation */

test('Simulation: exact Poisson-binomial tail agrees with the seeded Monte Carlo', () => {
  const state = demoStore().state;
  const report = buildLeaderContinuityReport(state, { now: NOW, horizonDays: 14 });
  const { exact, monteCarlo } = report.simulation;
  assert.ok(exact.expectedStalled > 0);
  assert.ok(exact.p50 <= exact.p80 && exact.p80 <= exact.p90, 'quantiles are monotone');
  assert.ok(exact.pNone >= 0 && exact.pNone <= 1);
  assert.ok(Math.abs(monteCarlo.mean - exact.expectedStalled) < 0.5,
    `MC mean ${monteCarlo.mean} near exact ${exact.expectedStalled}`);
  assert.ok(monteCarlo.p90 >= exact.p50, 'MC p90 dominates the exact median');

  // Determinism: same seed, same numbers.
  const again = buildLeaderContinuityReport(state, { now: NOW, horizonDays: 14 });
  assert.deepEqual(again.simulation.monteCarlo, monteCarlo);
  assert.deepEqual(again.planKey, report.planKey);

  // Currencies are reported separately and never summed.
  const currencies = Object.keys(report.simulation.tail).sort();
  assert.ok(currencies.length > 0);
  for (const currency of currencies) {
    const tail = report.simulation.tail[currency];
    assert.ok(tail.cvar90 >= tail.p90 || tail.cvar90 >= tail.mean, `${currency} coherent shortfall`);
  }
  assert.ok(!Object.prototype.hasOwnProperty.call(report.simulation, 'totalExposure'));
});

/* ================================================== 4. Cover planning */

test('Cover plan: held work is never covered and coverage uses every critical item', () => {
  const state = demoStore().state;
  const inventory = leaderDemandInventory(state, { now: NOW, horizonDays: 14 });
  const deputies = buildDeputyPool(state);
  const plan = buildCoverPlan(inventory, deputies, { minFitPct: state.settings.continuityMinFitPct, state });

  const held = new Set(inventory.items.filter((row) => row.delegability === 'held').map((row) => row.key));
  const coveredKeys = new Set(plan.actions.flatMap((action) => action.itemKeys));
  for (const key of coveredKeys) assert.equal(held.has(key), false, `held item ${key} was covered`);

  const totalCriticality = inventory.items
    .filter((row) => row.criticality >= CONTINUITY_CRITICAL)
    .reduce((sum, row) => sum + row.criticality, 0);
  assert.equal(plan.criticalityTotal, totalCriticality);
  assert.ok(plan.criticalityCovered <= plan.criticalityTotal);
  assert.equal(plan.coveragePct, Math.round((plan.criticalityCovered / plan.criticalityTotal) * 1000) / 10);
  assert.ok(plan.uncoveredKeys.length >= (inventory.counts.criticalHeld > 0 ? 1 : 0));
  for (const row of plan.uncoveredDetail) assert.ok(row.criticality >= CONTINUITY_CRITICAL);

  assert.equal(plan.actions.length <= 4, true, 'cover is capped at four deputies');
  for (const action of plan.actions) {
    assert.ok(action.itemKeys.length > 0);
    assert.ok(action.avgFit >= state.settings.continuityMinFitPct);
    assert.ok(action.setupMinutes > 0);
    assert.ok(typeof action.deputyName === 'string' && action.deputyName.length > 0);
    assert.ok(CONTINUITY_KINDS.includes(action.stallKind));
  }

  // Key is stable for identical inputs and changes when the window moves.
  assert.equal(coverPlanKey(plan, inventory), coverPlanKey(plan, inventory));
  const later = new Date(NOW.getTime() + 30 * 86400000);
  const shifted = leaderDemandInventory(state, { now: later, horizonDays: 14 });
  const shiftedPlan = buildCoverPlan(shifted, deputies, { minFitPct: state.settings.continuityMinFitPct, state });
  assert.notEqual(coverPlanKey(shiftedPlan, shifted), coverPlanKey(plan, inventory),
    'the plan key is bound to the window, not only to its actions');
});

/* ==================================================== 5. Drill ledger */

test('Drills: one open drill, frozen predictions, Brier and skill with unpredicted stalls', () => {
  const { store, api } = demoApi();
  assert.equal(api.startContinuityDrill({ startOn: '2026-11-02', endOn: '2026-11-15' }).ok, true);
  const open = store.state.continuityDrills[0];
  assert.equal(open.status, 'open');
  assert.ok(open.predictions.length > 0 && open.predictions.length <= 60);
  assert.ok(open.predictions.every((row) => row.pStall >= 0 && row.pStall <= 1));
  const frozen = JSON.stringify(open.predictions);

  const second = api.startContinuityDrill({ startOn: '2026-11-20', endOn: '2026-11-30' });
  assert.equal(second.ok, false);
  assert.match(second.error, /open drill/i);

  // Mutating the workspace must not rewrite a frozen prediction.
  api.updateContinuityPolicy({ horizonDays: 30 });
  assert.equal(JSON.stringify(store.state.continuityDrills[0].predictions), frozen);

  const keys = open.predictions.slice(0, 3).map((row) => row.key);
  const closed = api.closeContinuityDrill({
    drillId: open.id,
    observedKeys: [...keys, 'decides|decision|not-predicted'],
    unexpectedStalls: 2,
    note: 'Half-term cover test',
  });
  assert.equal(closed.ok, true, closed.error);
  assert.equal(closed.score.n, open.predictions.length);
  assert.equal(closed.score.hits, 3, 'observed keys outside the prediction set are discarded');

  const stored = store.state.continuityDrills[0];
  assert.equal(stored.status, 'closed');
  const score = scoreDrillRecord(stored);
  assert.equal(score.n, open.predictions.length);
  assert.equal(score.unexpected, 2);
  assert.ok(score.brier >= 0 && score.brier <= 1);
  assert.equal(score.countsOnly, score.n < CONTINUITY_MIN_SCORED_ITEMS);
  assert.ok(score.observedCoveragePct <= 100);

  // A second close on the same drill is refused, and a closed drill can be
  // followed by a new open one.
  assert.equal(api.closeContinuityDrill({ drillId: open.id, observedKeys: [] }).ok, false);
  assert.equal(api.startContinuityDrill({ startOn: '2026-11-16', endOn: '2026-11-30' }).ok, true);

  // Calibration stays counts-only below the drill floor.
  const report = api.leaderContinuityReport();
  assert.equal(report.calibration.countsOnly, true);
  assert.equal(report.calibration.drills, 1);
  assert.match(report.calibration.verdict, /Counts only/);
});

/* ======================================================= 6. Actions */

test('Actions: stale plan/window refusal, atomic commissioning and window idempotency', () => {
  const { store, api } = demoApi();
  const before = store.state.meta.revision;
  const report = api.leaderContinuityReport({ startOn: '2026-11-02', horizonDays: 13 });
  assert.equal(report.ok, true);
  assert.equal(report.inventory.windowStart, '2026-11-02');
  assert.equal(report.inventory.windowEnd, '2026-11-15');

  const stale = api.commissionContinuityCover({ planKey: 'lcs-deadbeef', startOn: '2026-11-02', horizonDays: 13, expectedRevision: store.state.meta.revision });
  assert.equal(stale.ok, false);
  assert.match(stale.error, /changed|reload/i);
  assert.equal(store.state.meta.revision, before, 'a refused commission writes nothing');

  const wrongWindow = api.commissionContinuityCover({ planKey: report.planKey, startOn: '2026-11-09', horizonDays: 13, expectedRevision: store.state.meta.revision });
  assert.equal(wrongWindow.ok, false);

  const decisionsBefore = store.state.decisions.length;
  const delegationsBefore = store.state.delegations.length;
  const linksBefore = (store.state.links || []).length;
  const first = api.commissionContinuityCover({
    planKey: report.planKey,
    startOn: '2026-11-02',
    horizonDays: 13,
    expectedRevision: store.state.meta.revision,
  });
  assert.equal(first.ok, true, first.error);
  assert.equal(store.state.decisions.length, decisionsBefore + 1);
  assert.ok(store.state.delegations.length > delegationsBefore);
  assert.ok((store.state.links || []).length > linksBefore);

  const decision = store.state.decisions.find((row) => row.id === first.id);
  assert.ok(decision);
  assert.match(decision.question, /LCS:/);
  assert.match(decision.question, /LCS-WINDOW:2026-11-02/);
  assert.equal(decision.options.length, 4);
  assert.equal(decision.reviewedOn, null);
  assert.equal(decision.outcome, 'pending');
  assert.ok(decision.reviewOn > report.inventory.windowEnd, 'the review lands after the absence');

  // The window marker makes a second click idempotent even though the plan key
  // has moved because the first commission changed the workspace.
  const after = api.leaderContinuityReport({ startOn: '2026-11-02', horizonDays: 13 });
  const second = api.commissionContinuityCover({
    planKey: after.planKey,
    startOn: '2026-11-02',
    horizonDays: 13,
    expectedRevision: store.state.meta.revision,
  });
  assert.equal(second.ok, true);
  assert.equal(second.existing, true);
  assert.equal(second.id, first.id);
  assert.equal(store.state.decisions.filter((row) => String(row.question || '').includes('LCS-WINDOW:2026-11-02')).length, 1);

  // Pausing automatic propagation must block a commission, not silently write.
  assert.equal(api.updateContinuityPolicy({ autoPropagate: false }).ok, true);
  const paused = api.commissionContinuityCover({
    planKey: api.leaderContinuityReport({ startOn: '2026-12-01', horizonDays: 13 }).planKey,
    startOn: '2026-12-01',
    horizonDays: 13,
    expectedRevision: store.state.meta.revision,
  });
  assert.equal(paused.ok, false);
  assert.match(paused.error, /paused/i);
  assert.equal(api.updateContinuityPolicy({ autoPropagate: true }).ok, true);

  // Policy validation.
  assert.equal(api.updateContinuityPolicy({ horizonDays: 0 }).ok, false);
  assert.equal(api.updateContinuityPolicy({ minFitPct: 101 }).ok, false);
  const clamped = api.updateContinuityPolicy({ horizonDays: 60, minFitPct: 70 });
  assert.equal(clamped.ok, true);
  assert.equal(store.state.settings.continuityHorizonDays, 60);
  assert.equal(store.state.settings.continuityMinFitPct, 70);
});

/* ==================================================== 7. Rule spine */

test('Rule spine: registration, ordering, marker dedupe and contracts', () => {
  const ids = AUTOMATION_RULES.map((rule) => rule.id);
  assert.ok(ids.includes(CONTINUITY_RULE_IDS.COVER));
  assert.ok(ids.includes(CONTINUITY_RULE_IDS.DRILL));
  assert.ok(ids.includes(CONTINUITY_RULE_IDS.STRUCTURAL));
  assert.ok(ids.includes(CONTINUITY_RULE_IDS.EXECUTION));
  assert.equal(CONTINUITY_RULES.length, 4);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate rule ids');

  const postIds = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id || rule.name);
  const continuityAt = DEFAULT_POST_COMMIT_RULES.findIndex((rule) => rule.name === 'leaderContinuityRule');
  const tempoAt = DEFAULT_POST_COMMIT_RULES.findIndex((rule) => rule.name === 'decisionTempoRule');
  assert.ok(continuityAt >= 0, 'leaderContinuityRule is registered in the post-commit spine');
  assert.ok(tempoAt > continuityAt, 'continuity runs before Decision Tempo can price the decision');
  assert.ok(postIds.length >= 1);

  const contract = PROPAGATION_CONTRACTS.find((row) => row.module === 'leaderContinuityRule.js');
  assert.ok(contract, 'the continuity rule has a documented propagation contract');
  assert.equal(contract.rule, leaderContinuityRule);
  assert.equal(contract.purpose.includes('absence'), true);
  assert.equal(contract.scansWorkspace, true);
  assert.ok(contract.writes.includes('decisions'));
  assert.ok(contract.writes.includes('delegations'));

  // The rule is idempotent: replaying the same event adds nothing.
  const store = demoStore();
  const draft = JSON.parse(JSON.stringify(store.state));
  const event = { type: 'continuity.scan', entity: 'workspace', entityId: 'workspace', actor: 'leader' };
  const ctx = {
    event,
    now: NOW,
    idFactory: (prefix) => `${prefix}-test`,
    logEvent: () => {},
    warnings: [],
    emitEvent: () => {},
  };
  leaderContinuityRule(JSON.parse(JSON.stringify(draft)), ctx);
  const first = JSON.parse(JSON.stringify(draft));
  const before = first.decisions.length;
  const second = leaderContinuityRule(first, ctx);
  assert.equal(second.length, 0, 're-running the scan is a no-op');
  assert.equal(first.decisions.length, before);
});

test('Insights: continuity signals merge and the brief is deterministic', () => {
  const state = demoStore().state;
  const report = buildLeaderContinuityReport(state, { now: NOW });
  assert.ok(report.signals.length > 0);
  assert.ok(report.signals.every((signal) => signal.action?.route === '#/handover'));
  const signals = continuitySignals(report);
  assert.deepEqual(signals, report.signals);

  const insights = buildInsights(state, NOW);
  const continuityFindings = insights.findings.filter((row) => String(row.ruleId || '').startsWith('LCS-'));
  assert.ok(continuityFindings.length > 0, 'continuity signals merge into Insights');
  assert.ok(continuityFindings.every((row) => row.domain === 'Leader continuity'));
  for (const row of continuityFindings) {
    assert.ok(row.title && row.detail);
    assert.ok(row.severity >= 1 && row.severity <= 5);
    assert.ok(Array.isArray(row.evidence));
    assert.equal(row.action.route, '#/handover');
  }

  const brief = continuityBrief(state, { now: NOW });
  assert.match(brief, /LEADER CONTINUITY/);
  assert.match(brief, /window 2026-10-28 → 2026-11-11 \(14 days\)/);
  assert.equal(brief, continuityBrief(state, { now: NOW }));
});


/* ============================== correlated absence + concentration (v46) */

test('Correlated stress: q = 0 reproduces independence, q = 100 takes the whole pool offline', () => {
  const state = demoStore().state;
  const inventory = leaderDemandInventory(state, { now: NOW, horizonDays: 14 });
  const deputies = buildDeputyPool(state);

  const none = simulateCorrelatedAbsence(inventory, deputies, {
    minFitPct: state.settings.continuityMinFitPct, commonCausePct: 0, individualAbsencePct: 0,
    seed: 7, trials: 600, state,
  });
  assert.equal(none.sharedShockTrials, 0);
  // The exact expectation is identical by construction; the sampled mean is a
  // Monte Carlo estimate of it and may differ by sampling error.
  const report = buildLeaderContinuityReport(state, { now: NOW, horizonDays: 14 });
  assert.equal(none.vsIndependent.expectedStalled, report.simulation.exact.expectedStalled,
    'q = 0 reproduces the independent expectation exactly');
  assert.equal(none.vsIndependent.p90, report.simulation.exact.p90);
  assert.ok(Math.abs(none.mean - none.vsIndependent.expectedStalled) < 0.45,
    `sampled mean ${none.mean} within sampling error of ${none.vsIndependent.expectedStalled}`);

  // One team only, no individual absence: a shared cause is total.
  const oneTeam = deputies.map((deputy) => ({ ...deputy, team: 'Platform' }));
  const all = simulateCorrelatedAbsence(inventory, oneTeam, {
    minFitPct: state.settings.continuityMinFitPct, commonCausePct: 100, individualAbsencePct: 0,
    seed: 7, trials: 200, state,
  });
  assert.equal(all.sharedShockPct, 100);
  assert.equal(all.mean, inventory.items.length, 'every item stalls when the only team is offline');
  assert.equal(all.pNone, 0);

  // With a shared cause, the correlated model can only be worse than independence.
  const severe = simulateCorrelatedAbsence(inventory, deputies, {
    minFitPct: state.settings.continuityMinFitPct, commonCausePct: 40, individualAbsencePct: 10,
    seed: 11, trials: 1500, state,
  });
  assert.ok(severe.mean > severe.vsIndependent.expectedStalled);
  assert.ok(severe.vsIndependent.meanLiftPct > 0);
  assert.ok(severe.p90 >= severe.vsIndependent.p90);
  const again = simulateCorrelatedAbsence(inventory, deputies, {
    minFitPct: state.settings.continuityMinFitPct, commonCausePct: 40, individualAbsencePct: 10,
    seed: 11, trials: 1500, state,
  });
  assert.deepEqual(again, severe, 'same seed, same stress numbers');
  assert.ok(severe.assumptions.length >= 4);
  assert.equal(severe.cluster.singleTeamPool, true, 'the demo pool is a single recorded team');
  assert.ok(severe.cluster.label.includes('one shared cause'));
});

test('Correlated stress: a deputy who is away falls back to the next deputy, not to nobody', () => {
  const state = demoStore().state;
  const inventory = leaderDemandInventory(state, { now: NOW, horizonDays: 14 });
  const deputies = buildDeputyPool(state);
  // 100% individual absence => every deputy is away in every trial, so every
  // coverable item must be a certain stall. This is the regression guard for
  // the first version, where availability multiplied coverage and an absent
  // deputy made an item look *better* covered than a held one.
  const allAway = simulateCorrelatedAbsence(inventory, deputies, {
    minFitPct: state.settings.continuityMinFitPct, commonCausePct: 0, individualAbsencePct: 100,
    seed: 3, trials: 60, state,
  });
  assert.equal(allAway.mean, inventory.items.length);

  const report = buildLeaderContinuityReport(state, { now: NOW, horizonDays: 14 });
  assert.ok(report.simulation.correlated);
  assert.equal(typeof report.simulation.correlated.vsIndependent.p90LiftPct, 'number');
  assert.ok(report.simulation.assumptions[0].includes('correlated stress model'));
  assert.ok(!report.simulation.assumptions.some((line) => line.includes('shared cause') && line.includes('not modelled') && !line.includes('Two simultaneous')));
});

test('Deputy stress and concentration are zero-write and never cover a person with themselves', () => {
  const { store, api } = demoApi();
  const before = JSON.stringify(store.state);
  const report = api.leaderContinuityReport();
  const allIds = report.deputies.map((deputy) => deputy.personId);

  const full = stressAbsence(report.inventory, report.deputies, {
    unavailableDeputyIds: allIds, minFitPct: report.inventory.minFitPct ?? store.state.settings.continuityMinFitPct, state: store.state,
  });
  assert.equal(full.availableDeputies, 0);
  for (const row of full.rows) {
    if (row.delegability === 'held') assert.equal(row.afterPStall, 1, 'held work was already certain');
    else assert.equal(row.afterPStall, 1, 'no deputy left means a certain stall');
  }
  assert.ok(full.afterExpectedStalled >= full.beforeExpectedStalled);
  assert.equal(JSON.stringify(store.state), before, 'a stress test writes nothing');

  const concentration = coverConcentration(report.inventory, report.deputies, {
    minFitPct: store.state.settings.continuityMinFitPct, state: store.state,
  });
  const stakeholder = store.state.stakeholders.find((row) => row.personId);
  assert.ok(stakeholder, 'demo has a stakeholder linked to a person');
  const item = report.inventory.items.find((row) => row.sourceType === 'stakeholder' && row.sourceId === stakeholder.id);
  if (item) {
    const self = report.deputies.find((deputy) => deputy.personId === stakeholder.personId);
    const fit = deputyFitForItem(item, self, store.state);
    assert.equal(fit.fit, 0, 'a person cannot cover contact with themselves');
    assert.ok(fit.components[0].detail.includes('themselves'));
  }
  for (const row of concentration.rows) {
    assert.equal(row.eligibleCount, row.eligibleDeputyIds.length);
    if (row.eligibleCount === 1) assert.ok(row.onlyDeputyId);
    else assert.equal(row.onlyDeputyId, null);
  }
});

/* ============================================ hand-over readiness (v46) */

test('Hand-over readiness counts recorded acknowledgements, and LCS-05 fires inside a week', () => {
  const { store, api } = demoApi();
  const empty = handoverReadiness(store.state, { now: NOW });
  assert.equal(empty.found, false);
  assert.equal(empty.verdict.id, 'none');

  const report = api.leaderContinuityReport({ startOn: '2026-11-02', horizonDays: 13 });
  const commissioned = api.commissionContinuityCover({
    planKey: report.planKey, startOn: '2026-11-02', horizonDays: 13, expectedRevision: store.state.meta.revision,
  });
  assert.equal(commissioned.ok, true, commissioned.error);

  const readiness = handoverReadiness(store.state, { now: NOW });
  assert.equal(readiness.found, true);
  assert.equal(readiness.windowStart, '2026-11-02');
  assert.equal(readiness.windowEnd, '2026-11-15');
  assert.ok(readiness.planned > 0);
  assert.equal(readiness.acknowledged, 0);
  assert.equal(readiness.decisionChosen, false);
  assert.equal(readiness.verdict.id, 'unchosen', 'an unapproved hand-over is not briefed');
  assert.ok(readiness.daysToAbsence <= 7);

  // Previewing today's window must still surface the future hand-over: the plan
  // that needs briefing is the one for the window that has not started.
  const todaysView = api.leaderContinuityReport();
  assert.equal(todaysView.inventory.windowStart, '2026-10-28');
  assert.equal(todaysView.readiness.windowStart, '2026-11-02', 'readiness falls back to the newest commissioned hand-over');
  assert.ok(todaysView.signals.some((row) => row.ruleId === 'LCS-05'));

  const signal = api.leaderContinuityReport({ startOn: '2026-11-02', horizonDays: 13 }).signals.find((row) => row.ruleId === 'LCS-05');
  assert.ok(signal, 'LCS-05 fires for an unbriefed hand-over inside a week');
  assert.equal(signal.severity, 4);
  assert.match(signal.title, /unbriefed cover delegation/);

  // Approve the decision and acknowledge one delegation: the count moves, and
  // the signal disappears only once every cover delegation is acknowledged.
  const decision = store.state.decisions.find((row) => row.id === commissioned.id);
  const decided = api.decideDecision(decision.id, { chosen: decision.options[0].label, rationale: 'Cover approved for the window.' });
  assert.equal(decided.ok, true, decided.error);
  const first = readiness.rows[0];
  const checked = api.checkInDelegation(first.id, { date: '2026-10-28', progress: 'on-track', note: 'Briefed on the cover and the escalation route.' });
  assert.equal(checked.ok, true, checked.error);

  const after = handoverReadiness(store.state, { now: NOW });
  assert.equal(after.acknowledged, 1);
  assert.equal(after.decisionChosen, true);
  assert.equal(after.verdict.id, after.acknowledged === after.planned ? 'briefed' : 'unbriefed');
  if (after.acknowledged < after.planned) {
    assert.ok(api.leaderContinuityReport({ startOn: '2026-11-02', horizonDays: 13 }).signals.some((row) => row.ruleId === 'LCS-05'));
  }
});

test('Policy: the shared-cause convention is bounded, saved and used by the report', () => {
  const { store, api } = demoApi();
  assert.equal(api.updateContinuityPolicy({ commonCausePct: -1 }).ok, false);
  assert.equal(api.updateContinuityPolicy({ commonCausePct: 101 }).ok, false);
  assert.equal(api.updateContinuityPolicy({ commonCausePct: 60 }).ok, true);
  assert.equal(store.state.settings.continuityCommonCausePct, 60);
  const report = api.leaderContinuityReport();
  assert.equal(report.simulation.correlated.commonCausePct, 60);
  const override = api.leaderContinuityReport({ commonCausePct: 0 });
  assert.equal(override.simulation.correlated.commonCausePct, 0);
  assert.equal(store.state.settings.continuityCommonCausePct, 60, 'a preview never writes the convention');
});

/* ======================================================= 8. CSV scope */

test('CSV scope #41 exports opaque drill codes only', () => {
  const { store, api } = demoApi();
  api.startContinuityDrill({ startOn: '2026-11-02', endOn: '2026-11-15' });
  const drill = store.state.continuityDrills[0];
  api.closeContinuityDrill({
    drillId: drill.id,
    observedKeys: [drill.predictions[0].key],
    unexpectedStalls: 1,
    note: 'Secret note about a named person',
  });

  assert.ok(CSV_EXPORTS.some((scope) => scope.key === 'continuity'));
  const exported = exportWorkspaceCsv(store.state, 'continuity', { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  const csv = exported.csv;
  assert.match(csv, /drill_code/);
  assert.match(csv, /frozen_probability/);
  assert.ok(!csv.includes('Secret note'));
  assert.ok(!csv.includes(drill.predictions[0].key.split('|')[2]), 'source ids never leak');
  for (const person of store.state.people || []) {
    if (person.name) assert.ok(!csv.includes(person.name), `no person name ${person.name}`);
  }
  for (const decision of store.state.decisions || []) {
    if (decision.title) assert.ok(!csv.includes(decision.title), 'no obligation titles');
  }
});

/* ============================================================ 9. UI */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
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

async function withApp(fn) {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    await fn(app, env);
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
}

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

test('UI: #/handover renders, deep-links a dated window, is keyboard-operable and axe-clean', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.store.seedDemo(buildDemoState(NOW));

    app.ctx.navigate('#/handover');
    assert.ok(document.querySelector('[data-testid="handover-page"]'), 'page renders');
    const summary = document.querySelector('[data-testid="handover-summary"]');
    assert.ok(summary && summary.textContent.includes('Obligations in window'));
    assert.ok(document.querySelector('[data-testid="handover-demand"]'));
    assert.ok(document.querySelector('[data-testid="handover-plan"]'));
    assert.ok(document.querySelector('[data-testid="handover-drill"]'));

    // Every interactive control is reachable by keyboard and labelled.
    const controls = [...document.querySelectorAll('#view button, #view input, #view a[href]')];
    assert.ok(controls.length > 0);
    for (const el of controls) {
      if (el.tagName === 'BUTTON') assert.ok(el.getAttribute('type'), 'buttons declare a type');
      if (el.tagName === 'INPUT' && el.type !== 'checkbox') {
        const id = el.getAttribute('id');
        const labelled = el.getAttribute('aria-label') || (id && document.querySelector(`label[for="${CSS.escape ? CSS.escape(id) : id}"]`));
        assert.ok(labelled, `input ${id} has a label`);
      }
    }
    assert.deepEqual(await axeViolations(env), [], '#/handover is axe-clean');

    // The dated deep link rebuilds the window without writing state.
    const revision = app.store.state.meta.revision;
    app.ctx.navigate('#/handover?start=2026-11-02&days=13');
    assert.ok(document.querySelector('[data-testid="handover-demand"]'));
    assert.equal(document.querySelector('#lcs-start').value, '2026-11-02');
    assert.equal(document.querySelector('#lcs-days').value, '13');
    assert.equal(app.store.state.meta.revision, revision, 'a report render never writes');
    assert.deepEqual(await axeViolations(env), [], '#/handover?start=... is axe-clean');

    // The drill form freezes a prediction through the real API.
    const form = document.querySelector('[data-testid="handover-drill"] form');
    assert.ok(form, 'drill form present');
    form.dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(app.store.state.continuityDrills.length, 1);
    assert.equal(app.store.state.continuityDrills[0].status, 'open');
    assert.ok(document.body.textContent.includes('Freeze a prediction') || document.body.textContent.includes('actually stalled'));
    assert.deepEqual(await axeViolations(env), [], 'open drill state is axe-clean');

    // Correlated stress card compares both models and prints its conventions.
    app.ctx.navigate('#/handover');
    const correlated = document.querySelector('[data-testid="handover-correlated"]');
    assert.ok(correlated.textContent.includes('Independence flatters the plan'));
    assert.ok(correlated.textContent.includes('Shared-cause probability'));
    assert.ok(document.querySelector('[data-testid="handover-stress"]'));
    assert.ok(document.querySelector('[data-testid="handover-readiness"]'));
    assert.ok(document.querySelector('[data-testid="handover-vendor-contagion"]'));
    assert.ok(document.querySelector('[data-testid="handover-implementation"]'));
    assert.deepEqual(await axeViolations(env), [], 'correlated + stress cards are axe-clean');

    // A zero-cause preview reproduces independence; a deep link carries it.
    app.ctx.navigate('#/handover?cause=0');
    assert.equal(document.querySelector('#lcs-cause').value, '0');
    assert.ok(document.querySelector('[data-testid="handover-correlated"]').textContent.includes('0% shared cause'));
    assert.deepEqual(await axeViolations(env), [], '#/handover?cause=0 is axe-clean');

    // The unavailability stress is a deep link and writes nothing.
    const stressRevision = app.store.state.meta.revision;
    const deputy = app.store.state.people.find((person) => person.status !== 'archived');
    app.ctx.navigate(`#/handover?stress=${encodeURIComponent(deputy.id)}`);
    assert.ok(document.querySelector('[data-testid="handover-stress"]').textContent.includes('Items that lose cover'));
    assert.equal(app.store.state.meta.revision, stressRevision, 'a stress deep link never writes');
    assert.deepEqual(await axeViolations(env), [], '#/handover?stress=... is axe-clean');

    assert.equal(env.consoleErrors.length, 0, `unexpected console errors: ${env.consoleErrors.join(' | ')}`);
  });
});

/* ========================================== 13. Session 69: Implementation, Attribution & Vendor Contagion */

test('Hand-over implementation: separates paper-only completion from verified covered-source movement and fires LCS-06', () => {
  const store = demoStore();
  const api = createApi(store, { now: () => NOW });

  const preview = api.leaderContinuityReport();
  const res = api.commissionContinuityCover({
    planKey: preview.planKey,
    horizonDays: preview.inventory.horizonDays,
    expectedRevision: store.state.meta.revision,
  });
  assert.equal(res.ok, true);

  // Approve the parent DACI hand-over decision.
  const decision = store.state.decisions.find((d) => d.id === res.id);
  api.decideDecision(decision.id, {
    chosen: decision.options[0].label,
    rationale: 'Approved cover plan before departure.',
    decidedOn: '2026-10-28',
  });

  const beforeImpl = handoverImplementation(store.state, { now: NOW, windowStart: preview.inventory.windowStart });
  assert.equal(beforeImpl.found, true);
  assert.equal(beforeImpl.decisionChosen, true);
  assert.ok(beforeImpl.planned >= 1);

  // Find a cover delegation with at least one linked source record and close it as done WITHOUT moving the source record.
  const targetRow = beforeImpl.rows.find((r) => r.sourcesTotal > 0);
  assert.ok(targetRow, 'commissioned cover delegation has linked source obligations');
  const completed = api.completeDelegation(targetRow.id, {
    completedOn: '2026-10-28',
    completionNote: 'Marked cover complete on paper without touching the underlying records.',
  });
  assert.equal(completed.ok, true);

  const paperImpl = handoverImplementation(store.state, { now: NOW, windowStart: preview.inventory.windowStart });
  assert.equal(paperImpl.paperOnly, 1, 'closing a cover delegation with 0 moved source records is graded paper-only');
  assert.equal(paperImpl.completedVerified, 0);
  assert.equal(paperImpl.verdict.id, 'paper-completion');

  // LCS-06 fires on paper-only completion.
  const paperReport = api.leaderContinuityReport();
  const lcs06 = paperReport.signals.find((s) => s.ruleId === 'LCS-06');
  assert.ok(lcs06, 'LCS-06 signal fires on paper-only completion');
  assert.match(lcs06.title, /paper-only/i);

  // Now advance one of the linked source records on or after windowStart: paper-only flips to completed-verified!
  const firstSource = targetRow.sources[0];
  if (firstSource.sourceType === 'decision') {
    const srcDec = store.state.decisions.find((d) => d.id === firstSource.sourceId);
    api.decideDecision(srcDec.id, {
      chosen: srcDec.options?.[0]?.label || 'Proceed',
      rationale: 'Deputy settled the call inside the window.',
      decidedOn: preview.inventory.windowStart,
    });
  } else if (firstSource.sourceType === 'case') {
    api.resolveCase(firstSource.sourceId, {
      status: 'mitigated',
      resolvedOn: preview.inventory.windowStart,
      resolutionNote: 'Mitigated by deputy during window.',
    });
  } else if (firstSource.sourceType === 'stakeholder') {
    api.recordStakeholderTouch(firstSource.sourceId, {
      date: preview.inventory.windowStart,
      stance: 'supportive',
      note: 'Deputy held scheduled touch.',
    });
  } else if (firstSource.sourceType === 'delegation') {
    api.checkInDelegation(firstSource.sourceId, {
      date: preview.inventory.windowStart,
      progress: 'on-track',
      note: 'Deputy unblocked delegation in window.',
    });
  }

  const gradedSource = gradeCoveredSourceProgress(store.state, firstSource.sourceType, firstSource.sourceId, {
    windowStart: preview.inventory.windowStart,
    windowEnd: preview.inventory.windowEnd,
  });
  assert.equal(gradedSource.moved, true, 'source record is now graded as moved');

  const verifiedImpl = handoverImplementation(store.state, { now: NOW, windowStart: preview.inventory.windowStart });
  const updatedRow = verifiedImpl.rows.find((r) => r.id === targetRow.id);
  assert.equal(updatedRow.executionState, 'completed-verified', 'moving a covered source record upgrades paper-only to completed-verified');
  assert.equal(verifiedImpl.paperOnly, 0);
});

test('RULE-LCS-04 on delegation.returned: re-allocates returned cover to backup deputy at 75% discount, or opens cover-gap decision when floor is unachievable', () => {
  const store = demoStore();
  const api = createApi(store, { now: () => NOW });

  // Non-continuity delegation return must not trigger RULE-LCS-04.
  const regularDel = store.state.delegations.find((d) => d.status === 'active' && !String(d.support || '').includes('[LCS:'));
  assert.ok(regularDel);
  const regReturn = api.returnDelegation(regularDel.id, {
    returnedOn: '2026-10-28',
    returnReason: 'Regular scope change unrelated to absence cover.',
  });
  assert.equal(regReturn.ok, true);
  assert.equal((regReturn.propagations || []).some((p) => p.ruleId === CONTINUITY_RULE_IDS.EXECUTION), false);

  // Commission hand-over cover and return one of the commissioned cover delegations.
  const preview = api.leaderContinuityReport();
  const commissioned = api.commissionContinuityCover({
    planKey: preview.planKey,
    horizonDays: preview.inventory.horizonDays,
    expectedRevision: store.state.meta.revision,
  });
  assert.equal(commissioned.ok, true);

  const coverDel = store.state.delegations.find((d) => d.status === 'active' && String(d.support || '').includes('[LCS:'));
  assert.ok(coverDel, 'commissioned cover delegation exists');

  const ret = api.returnDelegation(coverDel.id, {
    returnedOn: '2026-10-28',
    returnReason: 'Pulled into customer escalation; cannot hold cover.',
  });
  assert.equal(ret.ok, true);
  const lcs04Props = (ret.propagations || []).filter((p) => p.ruleId === CONTINUITY_RULE_IDS.EXECUTION);
  assert.ok(lcs04Props.length >= 1, 'RULE-LCS-04 fires on returned cover delegation');

  const updatedReturned = store.state.delegations.find((d) => d.id === coverDel.id);
  assert.ok(updatedReturned.supersededByDelegationId, 'returned cover delegation records its backup successor');
  const backupDel = store.state.delegations.find((d) => d.id === updatedReturned.supersededByDelegationId);
  assert.ok(backupDel, 'backup cover delegation was created');
  assert.notEqual(backupDel.personId, coverDel.personId, 'backup cover is assigned to a different deputy');
  assert.equal(backupDel.priorDelegationId, coverDel.id);
  assert.match(backupDel.support, /75% backup convention/);

  // Idempotent: re-running scan does not create a second backup delegation.
  const delCountBefore = store.state.delegations.length;
  api.scanLeaderContinuity();
  assert.equal(store.state.delegations.length, delCountBefore);

  // Now raise minFitPct to 99% so no remaining deputy can clear the floor, and return the backup delegation.
  api.updateContinuityPolicy({ minFitPct: 99 });
  const ret2 = api.returnDelegation(backupDel.id, {
    returnedOn: '2026-10-28',
    returnReason: 'Second deputy also unavailable.',
  });
  assert.equal(ret2.ok, true);
  const gapDecision = store.state.decisions.find((d) => String(d.question || '').includes(`[LCS-RETURN:${backupDel.id}]`));
  assert.ok(gapDecision, 'RULE-LCS-04 opens a DACI cover-gap decision when no deputy clears the floor');
});

test('Drill mechanism attribution & RULE-LCS-04 AAR draft: separates implementation drops from model fit misses', () => {
  const store = demoStore();
  const api = createApi(store, { now: () => NOW });

  // Commission cover for today's window.
  const preview = api.leaderContinuityReport();
  const commissioned = api.commissionContinuityCover({
    planKey: preview.planKey,
    horizonDays: preview.inventory.horizonDays,
    expectedRevision: store.state.meta.revision,
  });
  assert.equal(commissioned.ok, true);

  // Approve the hand-over decision and brief ONLY the first cover delegation; leave the rest unbriefed/unexecuted.
  const decision = store.state.decisions.find((d) => d.id === commissioned.id);
  api.decideDecision(decision.id, {
    chosen: decision.options[0].label,
    rationale: 'Approved cover plan.',
    decidedOn: '2026-10-28',
  });
  const implBefore = handoverImplementation(store.state, { now: NOW, windowStart: preview.inventory.windowStart });
  assert.ok(implBefore.rows.length >= 2, 'at least two cover delegations exist');
  const executedDel = implBefore.rows[0];
  const droppedDel = implBefore.rows[1];

  // Brief and execute the first cover delegation (log an in-window check-in).
  api.checkInDelegation(executedDel.id, {
    date: '2026-10-28',
    progress: 'on-track',
    note: 'Actively holding cover in window.',
  });

  // Open a drill for the same window.
  const opened = api.startContinuityDrill({
    startOn: '2026-10-28',
    endOn: '2026-11-10',
    note: 'Testing mechanism attribution between executed and unexecuted cover.',
  });
  assert.equal(opened.ok, true);

  // Find one prediction covered by executedDel and one covered by droppedDel.
  const drillRecord = store.state.continuityDrills.find((d) => d.id === opened.id);
  const execSourceKey = `${executedDel.sources[0].sourceType}|${executedDel.sources[0].sourceId}`;
  const dropSourceKey = `${droppedDel.sources[0].sourceType}|${droppedDel.sources[0].sourceId}`;
  const execPred = drillRecord.predictions.find((p) => p.key.endsWith(execSourceKey));
  const dropPred = drillRecord.predictions.find((p) => p.key.endsWith(dropSourceKey));
  assert.ok(execPred && dropPred, 'both covered obligations are in the frozen drill predictions');

  const retrosBefore = store.state.retros.length;
  const closed = api.closeContinuityDrill({
    drillId: opened.id,
    observedKeys: [execPred.key, dropPred.key],
    unexpectedStalls: 0,
  });
  assert.equal(closed.ok, true);
  assert.ok(closed.score.attribution, 'score includes causal mechanism attribution');
  assert.ok(closed.score.attribution.modelMissKeys.includes(execPred.key), 'stalled item under briefed & executing cover is classified as model-miss');
  assert.ok(closed.score.attribution.implementationDropKeys.includes(dropPred.key), 'stalled item under unbriefed/unexecuted cover is classified as implementation-drop');
  assert.ok(closed.score.attribution.executionConditionedBrier !== null, 'execution-conditioned Brier is computed');

  // RULE-LCS-04 automatically drafts one pre-filled After-Action Review and one ritual follow-up delegation.
  assert.equal(store.state.retros.length, retrosBefore + 1, 'RULE-LCS-04 drafted an After-Action Review in retros');
  const draftedRetro = store.state.retros[store.state.retros.length - 1];
  assert.equal(draftedRetro.status, 'draft');
  assert.match(draftedRetro.actual, /dropped hand-over implementation/i);
  const execFollowup = store.state.delegations.find((d) => String(d.support || '').includes(`[LCS-EXEC:${commissioned.id}]`));
  assert.ok(execFollowup, 'RULE-LCS-04 opened an owned execution follow-up delegation');
});

test('Vendor common-mode contagion & LCS-07: cross-team dependency shortfalls and unmodelled dependency honesty boundary', () => {
  const store = demoStore();
  const api = createApi(store, { now: () => NOW });

  const report = api.leaderContinuityReport({ secondShockPct: 20 });
  const contagion = report.vendorContagion;
  assert.ok(contagion, 'report includes vendorContagion');
  assert.equal(contagion.secondShockPct, 20);
  assert.ok(contagion.chokePoints.length >= 1, 'demo workspace surfaces active dependency choke points');
  assert.ok(contagion.crossTeamChokePoints.length >= 1, 'demo workspace surfaces cross-team/multi-deputy choke points');
  assert.ok(contagion.dualShockTrials > 0, 'dual simultaneous shocks fire when secondShockPct > 0');
  assert.ok(contagion.mean >= report.simulation.exact.expectedStalled, 'multi-shock + vendor contagion mean stalls >= independent expectation');

  const lcs07 = report.signals.find((s) => s.ruleId === 'LCS-07');
  assert.ok(lcs07, 'LCS-07 fires when a cross-team dependency choke point puts critical absence-window obligations at risk');

  // Adding an active dependency without annualFailureProb lists it in unmodeledDependencies rather than treating it as 0% risk.
  store.update((draft) => {
    draft.dependencies.push({
      id: 'dep-unmodelled-vendor',
      name: 'Unpriced Identity Gateway',
      kind: 'vendor',
      criticality: 'critical',
      status: 'active',
      ttsDays: 1,
      ttrDays: 5,
      annualFailureProb: null,
      substitutability: 'none',
      upstreamIds: [],
      stewards: [],
    });
  });
  const afterReport = api.leaderContinuityReport();
  assert.ok(
    afterReport.vendorContagion.unmodeledDependencies.some((d) => d.id === 'dep-unmodelled-vendor' && d.missing === 'annualFailureProb'),
    'dependency without annualFailureProb is surfaced in unmodeledDependencies',
  );
});
