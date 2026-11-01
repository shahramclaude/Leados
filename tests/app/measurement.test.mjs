/**
 * tests/app/measurement.test.mjs — Scorecard Integrity Lab
 * (Schema v47, ADR-0035, RULE-MTX-01..02).
 *
 *   1. Schema v47: version, additive migration from v46, settings clamps and
 *      the absence of any fabricated historical scorecard.
 *   2. Normalization: nameless/duplicate tasks, weight renormalization, the
 *      frozen prediction kept exactly as written, and an honest warning where a
 *      declaration cannot be modelled.
 *   3. The equilibrium: first-best is reached by a clean single metric; a
 *      gameable metric collapses value; effort is CONSERVED with and without
 *      uncounted work (the defect this session found); ratchet withholds
 *      genuine effort; noise costs value; stakes raise gaming (Campbell).
 *   4. The redesign search: deterministic, guardrails lower gaming, measurement
 *      carries a declared cost, and "keep it" is a legitimate answer.
 *   5. Actions: validation, drafts-only editing, stale-key and stale-revision
 *      refusal, one observation per commit, pause switch, retirement.
 *   6. The rule spine: one decision, at most two delegations, one talking point,
 *      typed links, idempotence; falsified observation opens a calibration
 *      decision and a pre-filled review — and a hit opens nothing.
 *   7. Read-side: Insights domain + MTX signals, and an opaque CSV scope.
 *   8. JSDOM + axe across `#/measurement` in the demo and on an empty workspace.
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
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import {
  MEASUREMENT_ENGINE_VERSION,
  MEASUREMENT_FALSIFIER_MARGIN_PP,
  MEASUREMENT_MIN_EFFICIENCY,
  MEASUREMENT_RULE_IDS,
  buildMeasurementReport,
  freezeMeasurementPrediction,
  goodhartProfile,
  measurementBrief,
  measurementSignals,
  rankDesigns,
  scoreMeasurementObservation,
  scorecardDesignKey,
  scorecardEquilibrium,
  scorecardIntegrity,
} from '../../app/core/domain/measurement.js';
import { measurementRule, SCORECARD_COMMITTED_EVENT, SCORECARD_OBSERVED_EVENT } from '../../app/core/domain/measurementRule.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-29T10:00:00.000Z');

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

const TASKS = [
  { id: 't1', name: 'Tickets closed', kind: 'measured', weightPct: 70, trueValue: 25, effortCost: 25, gamingEase: 80, noisePct: 15, ratchetPct: 40 },
  { id: 't2', name: 'Customer-confirmed resolution', kind: 'measured', weightPct: 30, trueValue: 85, effortCost: 60, gamingEase: 15, noisePct: 35, ratchetPct: 10 },
  { id: 't3', name: 'Runbook nobody reads yet', kind: 'unmeasured', weightPct: 0, trueValue: 75, effortCost: 45, gamingEase: 0, noisePct: 10, ratchetPct: 0 },
];

function card(overrides = {}) {
  return {
    id: 'sc-test',
    title: 'Support throughput',
    objective: 'Resolutions that hold',
    ownerId: null,
    status: 'draft',
    stakesPct: 70,
    professionalismPct: 20,
    riskAversionPct: 40,
    detectionPct: 25,
    effortHoursPerWeek: 32,
    reviewOn: '2026-12-01',
    tasks: TASKS.map((t) => ({ ...t })),
    frozen: null,
    observation: null,
    committedAt: null,
    reviewedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    history: [],
    ...overrides,
  };
}

/* ===================================================== 1. Schema v47 */

test('schema v47: additive migration never fabricates a scorecard or a prediction', () => {
  assert.equal(SCHEMA_VERSION, 74);
  const v46 = {
    schemaVersion: 46,
    settings: { ...DEFAULT_SETTINGS },
    people: [], scorecards: undefined,
  };
  const migrated = migrate(v46);
  assert.ok(migrated.applied.includes('46 → 47'));
  assert.equal(migrated.raw.schemaVersion, 74);
  assert.deepEqual(migrated.raw.scorecards, [], 'an older workspace starts with an empty lab');
  assert.equal(migrated.raw.settings.measurementMetricCostPct, 2);
  assert.equal(migrated.raw.settings.measurementAutoPropagate, true);

  const empty = createEmptyState(NOW.toISOString());
  assert.deepEqual(empty.scorecards, []);
  assert.deepEqual(empty.propagationLineage, []);
});

test('schema v47: settings are clamped and the pause switch survives normalization', () => {
  const state = normalizeState({
    schemaVersion: 47,
    settings: { ...DEFAULT_SETTINGS, measurementMetricCostPct: 900, measurementAutoPropagate: false },
  }).state;
  assert.equal(state.settings.measurementMetricCostPct, 25, 'a wild cost is clamped, not honoured');
  assert.equal(state.settings.measurementAutoPropagate, false, 'pausing propagation is honoured');
  const negative = normalizeState({ schemaVersion: 47, settings: { ...DEFAULT_SETTINGS, measurementMetricCostPct: -4 } }).state;
  assert.equal(negative.settings.measurementMetricCostPct, 0, 'zero cost is a legitimate declaration');
});

test('normalization: drops unusable rows, renormalizes nothing silently, and keeps the frozen prediction verbatim', () => {
  const good = card({ status: 'committed' });
  good.frozen = { at: NOW.toISOString(), prediction: freezeMeasurementPrediction(good) };
  const raw = {
    schemaVersion: 47,
    settings: { ...DEFAULT_SETTINGS },
    people: [],
    scorecards: [
      good,
      { ...card({ id: 'sc-noname' }), tasks: [{ name: '' }, { name: '', kind: 'measured' }] },
      { ...card({ id: 'sc-unmeasured-only' }), tasks: [{ name: 'Only uncounted work', kind: 'unmeasured', trueValue: 50 }] },
      { ...card({ id: 'sc-dup' }), tasks: [{ id: 'x', name: 'A', kind: 'measured' }, { id: 'x', name: 'B', kind: 'measured' }] },
    ],
  };
  const { state, warnings } = normalizeState(raw);
  assert.equal(state.scorecards.length, 2, 'the empty and unmeasured-only cards are refused');
  assert.ok(warnings.some((w) => w.includes('declares no tasks')));
  assert.ok(warnings.some((w) => w.includes('no measured task')));
  assert.ok(warnings.some((w) => w.includes('duplicate id')));
  const kept = state.scorecards.find((row) => row.id === 'sc-test');
  assert.equal(kept.frozen.prediction.gamingSharePct, good.frozen.prediction.gamingSharePct);
  assert.equal(kept.frozen.prediction.engineVersion, MEASUREMENT_ENGINE_VERSION);
  assert.equal(kept.tasks.length, 3);

  // A card whose measured weights are all zero is kept and reported, not
  // silently equal-weighted behind the leader's back.
  const zeroWeights = normalizeState({
    schemaVersion: 47,
    settings: { ...DEFAULT_SETTINGS },
    scorecards: [card({ id: 'sc-zero', tasks: [{ name: 'Counted', kind: 'measured', weightPct: 0, trueValue: 40, effortCost: 40, gamingEase: 10, noisePct: 10, ratchetPct: 0 }] })],
  });
  assert.ok(zeroWeights.warnings.some((w) => w.includes('declares no reward weight')));
  assert.equal(zeroWeights.state.scorecards[0].equilibrium, undefined, 'derived figures are never stored');
});

/* ================================================ 3. the equilibrium */

test('equilibrium: a clean single metric reaches first-best; a metric with no gaming and no noise costs nothing', () => {
  const eq = scorecardEquilibrium({
    tasks: [{ name: 'Only task', kind: 'measured', weightPct: 100, trueValue: 60, effortCost: 50, gamingEase: 0, noisePct: 0, ratchetPct: 0 }],
    professionalismPct: 0,
    riskAversionPct: 0,
    stakesPct: 0,
    detectionPct: 100,
  });
  assert.equal(eq.rows.length, 1);
  assert.equal(eq.gamingSharePct, 0);
  assert.equal(eq.efficiencyPct, 100, 'with no gaming, no noise and one task, the incentive reaches first-best');
  assert.equal(eq.counts.unmeasured, 0);
});

test('equilibrium: a gameable metric collapses delivered value and dominates the effort mix', () => {
  const clean = scorecardEquilibrium({
    tasks: [{ name: 'Metric', kind: 'measured', weightPct: 100, trueValue: 80, effortCost: 30, gamingEase: 0, noisePct: 10, ratchetPct: 0 }],
    professionalismPct: 0, riskAversionPct: 20, stakesPct: 50, detectionPct: 100,
  });
  const gameable = scorecardEquilibrium({
    tasks: [{ name: 'Metric', kind: 'measured', weightPct: 100, trueValue: 80, effortCost: 30, gamingEase: 90, noisePct: 10, ratchetPct: 0 }],
    professionalismPct: 0, riskAversionPct: 20, stakesPct: 50, detectionPct: 100,
  });
  assert.ok(gameable.efficiencyPct < clean.efficiencyPct / 2, `gaming must cost real value (${gameable.efficiencyPct} vs ${clean.efficiencyPct})`);
  assert.ok(gameable.gamingSharePct > 60, `a 90%-gameable metric should be mostly cosmetic (got ${gameable.gamingSharePct}%)`);

  // Monotone in gaming ease: this is the property the redesign search relies on.
  const shares = [0, 25, 50, 75, 100].map((ease) => scorecardEquilibrium({
    tasks: [{ name: 'M', kind: 'measured', weightPct: 100, trueValue: 50, effortCost: 50, gamingEase: ease, noisePct: 0, ratchetPct: 0 }],
    professionalismPct: 0, riskAversionPct: 0, stakesPct: 50,
  }).gamingSharePct);
  for (let i = 1; i < shares.length; i += 1) {
    assert.ok(shares[i] > shares[i - 1], `gaming share must rise with ease: ${shares.join(', ')}`);
  }
});

test('equilibrium: effort is conserved with and without uncounted work (the defect this session fixed)', () => {
  const withUnmeasured = scorecardEquilibrium({ tasks: TASKS, professionalismPct: 20 });
  const totalA = withUnmeasured.rows.reduce((sum, r) => sum + r.effortPct, 0);
  assert.ok(Math.abs(totalA - 100) < 0.6, `effort must sum to 100%, got ${totalA}`);

  const withoutUnmeasured = scorecardEquilibrium({
    tasks: TASKS.filter((t) => t.kind === 'measured'),
    professionalismPct: 20,
  });
  const totalB = withoutUnmeasured.rows.reduce((sum, r) => sum + r.effortPct, 0);
  assert.ok(Math.abs(totalB - 100) < 0.6, `the uncounted-work floor must redistribute, not evaporate (got ${totalB})`);
  assert.equal(withoutUnmeasured.counts.unmeasured, 0);
  assert.equal(withoutUnmeasured.unmeasuredNeglectPct, 0);
});

test('equilibrium: uncounted work receives none of the incentive and the shortfall is reported', () => {
  const eq = scorecardEquilibrium({ tasks: TASKS, professionalismPct: 0 });
  const unmeasured = eq.rows.find((r) => r.kind === 'unmeasured');
  assert.equal(unmeasured.gamingEffortPct, 0);
  assert.equal(unmeasured.effortPct, 0, 'with a zero floor, Holmström–Milgrom says uncounted work gets nothing');
  assert.ok(eq.unmeasuredNeglectPct > 20, `the shortfall against first-best is printed (got ${eq.unmeasuredNeglectPct})`);
});

test('equilibrium: ratchet withholds genuine effort, noise costs value, and stakes raise gaming (Campbell)', () => {
  const base = { tasks: [{ name: 'M', kind: 'measured', weightPct: 100, trueValue: 70, effortCost: 40, gamingEase: 30, noisePct: 0, ratchetPct: 0 }], professionalismPct: 0, riskAversionPct: 40, stakesPct: 50 };
  const noRatchet = scorecardEquilibrium(base);
  const ratcheted = scorecardEquilibrium({ ...base, tasks: [{ ...base.tasks[0], ratchetPct: 100 }] });
  assert.ok(ratcheted.rows[0].genuineEffortPct < noRatchet.rows[0].genuineEffortPct, 'a 100% ratchet withholds genuine effort');

  // Noise is a price, not a composition change: in a one-metric card genuine and
  // cosmetic effort scale together, so the premium is what moves. Across two
  // metrics of equal value, the noisier one attracts less of both.
  const paired = (noiseOnSecond) => scorecardEquilibrium({
    tasks: [
      { name: 'Clean', kind: 'measured', weightPct: 50, trueValue: 60, effortCost: 40, gamingEase: 20, noisePct: 0, ratchetPct: 0 },
      { name: 'Noisy', kind: 'measured', weightPct: 50, trueValue: 60, effortCost: 40, gamingEase: 20, noisePct: noiseOnSecond, ratchetPct: 0 },
    ],
    professionalismPct: 0, riskAversionPct: 80, stakesPct: 50,
  });
  const pairedQuiet = paired(0);
  const pairedNoisy = paired(100);
  const noisyShare = (eq) => eq.rows.find((r) => r.name === 'Noisy').effortPct;
  assert.ok(noisyShare(pairedNoisy) < noisyShare(pairedQuiet), 'a noisy metric attracts less effort than a clean one of equal weight');
  assert.ok(pairedNoisy.riskPremiumPct > pairedQuiet.riskPremiumPct, 'and the principal pays a premium for what it does attract');

  const quiet = scorecardEquilibrium({ ...base, tasks: [{ ...base.tasks[0], noisePct: 0 }] });
  const noisy = scorecardEquilibrium({ ...base, tasks: [{ ...base.tasks[0], noisePct: 100 }] });
  assert.ok(noisy.riskPremiumPct > quiet.riskPremiumPct, 'noise always raises the risk premium');

  const lowStakes = scorecardEquilibrium({ ...base, stakesPct: 0 });
  const highStakes = scorecardEquilibrium({ ...base, stakesPct: 100 });
  assert.ok(highStakes.gamingSharePct > lowStakes.gamingSharePct, 'Campbell: more at stake invites more cosmetic behaviour');
});

test('goodhart profile: orders metrics and is bounded', () => {
  const profile = goodhartProfile(card());
  assert.ok(profile.metrics.length === 2);
  assert.equal(profile.metrics[0].name, 'Tickets closed', 'the most gameable metric sorts first');
  for (const metric of profile.metrics) {
    assert.ok(metric.goodhartIndex >= 0 && metric.goodhartIndex <= 100);
  }
  assert.ok(profile.portfolioIndex > 0 && profile.portfolioIndex <= 100);
});

/* ============================================== 4. redesign search */

test('redesign: deterministic, monotone where it should be, and honest about measurement cost', () => {
  const a = rankDesigns(card());
  const b = rankDesigns(card());
  assert.deepEqual(a.ranked.map((d) => d.id), b.ranked.map((d) => d.id), 'the search is deterministic');
  assert.equal(a.ranked[0].netValue >= a.ranked[a.ranked.length - 1].netValue, true, 'ranked by net value');

  const guardrailed = a.designs.find((d) => d.id === 'guardrailed');
  const baseline = a.designs.find((d) => d.id === 'current');
  assert.ok(guardrailed.gamingSharePct < baseline.gamingSharePct, 'pairing a counter-metric halves gaming ease on the worst metric');

  // Measurement is never free: a design with N metrics pays (N-1) × cost.
  const expensive = rankDesigns(card(), { metricCostPct: 10 });
  const costlyBest = expensive.designs.find((d) => d.id === 'measure-the-gap');
  assert.equal(costlyBest.measurementCost, (costlyBest.metricCount - 1) * 10);

  // A sound scorecard is not "improved" for the sake of it.
  const sound = rankDesigns({
    tasks: [{ name: 'One honest metric', kind: 'measured', weightPct: 100, trueValue: 90, effortCost: 40, gamingEase: 0, noisePct: 0, ratchetPct: 0 }],
    stakesPct: 0, professionalismPct: 0, riskAversionPct: 0, detectionPct: 100,
  });
  assert.equal(sound.recommend, false, 'no redesign is recommended when nothing can be improved');
  assert.match(sound.reason, /No redesign beats/);
});

test('integrity: badge bands follow the modelled numbers', () => {
  const distorted = scorecardIntegrity(card());
  assert.equal(distorted.badge.id, 'distorted');
  assert.ok(distorted.equilibrium.efficiencyPct < MEASUREMENT_MIN_EFFICIENCY);
  const sound = scorecardIntegrity({
    tasks: [{ name: 'Honest', kind: 'measured', weightPct: 100, trueValue: 90, effortCost: 40, gamingEase: 0, noisePct: 0, ratchetPct: 0 }],
    stakesPct: 0, professionalismPct: 0, riskAversionPct: 0, detectionPct: 100,
  });
  assert.equal(sound.badge.id, 'sound');
  assert.equal(typeof distorted.designKey, 'string');
  assert.equal(distorted.designKey, scorecardDesignKey(distorted));
});

/* ====================================================== 5. actions */

test('actions: validation refuses a scorecard that cannot be modelled', () => {
  const store = createStore({ storage: memStorage(), now: () => NOW });
  const api = createApi(store, { now: () => NOW });

  assert.equal(api.createScorecard({ title: 'ab', tasks: TASKS }).ok, false);
  assert.equal(api.createScorecard({ title: 'Valid name', tasks: [] }).ok, false);
  const noMeasured = api.createScorecard({ title: 'Valid name', tasks: [{ name: 'Only uncounted', kind: 'unmeasured', trueValue: 60 }] });
  assert.equal(noMeasured.ok, false);
  assert.match(noMeasured.error, /measured/);
  assert.equal(store.state.scorecards.length, 0, 'a refused declaration writes nothing');

  const created = api.createScorecard({ title: 'Valid name', tasks: TASKS, stakesPct: 60, detectionPct: 30 });
  assert.equal(created.ok, true);
  assert.equal(store.state.scorecards[0].status, 'draft');
  assert.equal(store.state.scorecards[0].frozen, null, 'a draft freezes no prediction');
});

test('actions: a committed design is evidence — editing it is refused, forking is allowed', () => {
  const store = createStore({ storage: memStorage(), now: () => NOW });
  const api = createApi(store, { now: () => NOW });
  const created = api.createScorecard({ title: 'Support throughput', tasks: TASKS, stakesPct: 60, detectionPct: 25 });

  const edited = api.updateScorecard(created.id, { title: 'Renamed' });
  assert.equal(edited.ok, true);
  assert.equal(store.state.scorecards[0].title, 'Renamed');

  assert.equal(api.commitScorecard(created.id, {}).ok, true);
  const refused = api.updateScorecard(created.id, { title: 'Rewritten history' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /fork/i);
  assert.equal(store.state.scorecards[0].title, 'Renamed', 'the committed record is untouched');

  const forked = api.forkScorecard(created.id, { designId: 'guardrailed' });
  assert.equal(forked.ok, true);
  assert.notEqual(forked.id, created.id);
  const draft = store.state.scorecards.find((row) => row.id === forked.id);
  assert.equal(draft.status, 'draft');
  assert.match(draft.title, /counter-metric/i);
  assert.equal(store.state.scorecards.find((row) => row.id === created.id).status, 'committed', 'forking never retires the original');
});

test('actions: commit refuses a stale design key, a stale revision and a paused policy', () => {
  const store = createStore({ storage: memStorage(), now: () => NOW });
  const api = createApi(store, { now: () => NOW });
  const created = api.createScorecard({ title: 'Support throughput', tasks: TASKS });

  assert.equal(api.commitScorecard(created.id, { designKey: 'mtx-deadbeef' }).ok, false, 'a stale preview cannot commit a different design');
  assert.equal(api.commitScorecard(created.id, { expectedRevision: store.state.meta.revision + 5 }).ok, false, 'a stale revision is refused');

  api.updateSettings({ measurementAutoPropagate: false });
  const paused = api.commitScorecard(created.id, {});
  assert.equal(paused.ok, false);
  assert.match(paused.error, /paused/i);
  api.updateSettings({ measurementAutoPropagate: true });

  const live = scorecardIntegrity(store.state.scorecards[0]).designKey;
  const committed = api.commitScorecard(created.id, { designKey: live });
  assert.equal(committed.ok, true, committed.error);
  const frozen = store.state.scorecards[0].frozen.prediction;
  assert.equal(frozen.engineVersion, MEASUREMENT_ENGINE_VERSION);
  assert.equal(frozen.efficiencyPct, committed.prediction.efficiencyPct);
  assert.equal(frozen.gamingSharePct, committed.prediction.gamingSharePct);
  assert.ok(frozen.falsifierGamingPct >= frozen.gamingSharePct);
});

test('actions: observation validation, one per commit, and no future or pre-commit evidence', () => {
  const store = createStore({ storage: memStorage(), now: () => NOW });
  const api = createApi(store, { now: () => NOW });
  const created = api.createScorecard({ title: 'Support throughput', tasks: TASKS, stakesPct: 60 });
  assert.equal(api.recordScorecardObservation(created.id, { recordedOn: '2026-10-29', note: 'not committed yet' }).ok, false);
  api.commitScorecard(created.id, {});

  assert.equal(api.recordScorecardObservation(created.id, { recordedOn: '2027-01-01', note: 'in the future, obviously' }).ok, false);
  assert.equal(api.recordScorecardObservation(created.id, { recordedOn: '2000-01-01', note: 'before it was committed' }).ok, false);
  assert.equal(api.recordScorecardObservation(created.id, { recordedOn: '2026-10-29', note: 'too short' }).ok, false);
  assert.equal(api.recordScorecardObservation(created.id, { recordedOn: '2026-10-29', gamingSharePct: 140, note: 'an impossible share' }).ok, false);

  const ok = api.recordScorecardObservation(created.id, {
    recordedOn: '2026-10-29',
    gamingSharePct: 60,
    metricMovedPct: 30,
    trueOutcomePct: 10,
    note: 'Two people described splitting tickets to raise the count; reopen rate rose with it.',
    source: 'conversation',
  });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(store.state.scorecards[0].observation.gamingSharePct, 60);

  const second = api.recordScorecardObservation(created.id, {
    recordedOn: '2026-10-29', gamingSharePct: 10, note: 'A better story, told after the first one.',
  });
  assert.equal(second.ok, false, 'the ledger keeps one observation per commit');
  assert.match(second.error, /already has an observation/);
});

test('actions: the cycle closes only after an observation, and retirement keeps the record', () => {
  const store = createStore({ storage: memStorage(), now: () => NOW });
  const api = createApi(store, { now: () => NOW });
  const created = api.createScorecard({ title: 'Support throughput', tasks: TASKS, stakesPct: 60 });
  api.commitScorecard(created.id, {});
  assert.equal(api.reviewScorecard(created.id, {}).ok, false, 'a cycle with no observation teaches nothing');

  api.recordScorecardObservation(created.id, { recordedOn: '2026-10-29', note: 'Measured from the reopened-ticket audit.' });
  assert.equal(api.reviewScorecard(created.id, { note: 'Closed the loop.' }).ok, true);
  assert.equal(store.state.scorecards[0].status, 'reviewed');

  const retired = api.retireScorecard(created.id, { note: 'Superseded by a paired-metric design.' });
  assert.equal(retired.ok, true);
  const record = store.state.scorecards[0];
  assert.equal(record.status, 'retired');
  assert.equal(record.frozen.prediction.engineVersion, MEASUREMENT_ENGINE_VERSION, 'retirement keeps the frozen prediction');
  assert.ok(record.history.some((row) => row.type === 'retired'));
});

test('actions: the measurement policy is bounded', () => {
  const store = createStore({ storage: memStorage(), now: () => NOW });
  const api = createApi(store, { now: () => NOW });
  assert.equal(api.updateMeasurementPolicy({ metricCostPct: 99 }).ok, false);
  assert.equal(api.updateMeasurementPolicy({ metricCostPct: 4 }).ok, true);
  assert.equal(store.state.settings.measurementMetricCostPct, 4);
  assert.equal(api.updateMeasurementPolicy({ autoPropagate: false }).ok, true);
  assert.equal(store.state.settings.measurementAutoPropagate, false);
});

/* ==================================================== 6. rule spine */

test('rule spine: a distorted commit opens exactly one decision, ≤2 delegations, one prompt and typed links', () => {
  const store = createStore({ storage: memStorage(), now: () => NOW });
  store.seedDemo(buildDemoState(NOW));
  const api = createApi(store, { now: () => NOW });
  const person = store.state.people.find((p) => p.status !== 'archived');
  const created = api.createScorecard({ title: 'Support throughput v2', tasks: TASKS, ownerId: person.id, stakesPct: 70, detectionPct: 20 });

  const before = {
    decisions: store.state.decisions.length,
    delegations: store.state.delegations.length,
    retros: store.state.retros.length,
    prompts: person.talkingPoints.length,
  };
  const res = api.commitScorecard(created.id, {});
  assert.equal(res.ok, true, res.error);

  const marker = `[MTX:${created.id}]`;
  const decisions = store.state.decisions.filter((d) => String(d.question).includes(marker));
  assert.equal(decisions.length, 1, 'exactly one redesign decision');
  assert.equal(decisions[0].options.length, 4, 'four real options, including keeping it');
  assert.match(decisions[0].question, /modelled/i);
  assert.ok(decisions[0].reviewOn, 'the decision carries its own review date');

  const delegations = store.state.delegations.filter((d) => String(d.support).includes(marker));
  assert.ok(delegations.length > 0 && delegations.length <= 2, `at most two owned tasks (got ${delegations.length})`);
  for (const delegation of delegations) {
    assert.notEqual(delegation.personId, undefined);
    assert.equal(delegation.status, 'active');
  }
  const target = store.state.people.find((p) => p.id === person.id);
  const prompts = target.talkingPoints.filter((t) => t.includes(marker));
  assert.equal(prompts.length, 1, 'one blameless question, not a briefing');
  assert.match(prompts[0], /least want us to optimise/);

  const links = store.state.links.filter((link) => link.ruleId === MEASUREMENT_RULE_IDS.REDESIGN);
  const decisionFollowups = links.filter((link) => link.sourceType === 'decision'
    && link.targetType === 'delegation' && link.relation === 'tracks-followup');
  assert.ok(decisionFollowups.length >= 1, 'the decision remains linked to the work it created');
  assert.ok(decisionFollowups.every((link) => link.sourceId === decisions[0].id));
  const scorecardProvenance = links.filter((link) => link.sourceType === 'scorecard' && link.sourceId === created.id);
  assert.ok(scorecardProvenance.some((link) => link.targetType === 'decision' && link.targetId === decisions[0].id),
    'the scorecard is a navigable source for the redesign decision');
  assert.ok(scorecardProvenance.some((link) => link.targetType === 'delegation'),
    'the scorecard also points directly to its counter-metric task');
  assert.equal(store.state.retros.length, before.retros, 'a commit is not a review');
});

test('rule spine: a sound commit creates no ceremony at all', () => {
  const store = createStore({ storage: memStorage(), now: () => NOW });
  store.seedDemo(buildDemoState(NOW));
  const api = createApi(store, { now: () => NOW });
  const before = { decisions: store.state.decisions.length, delegations: store.state.delegations.length };
  const created = api.createScorecard({
    title: 'One honest metric',
    tasks: [{ name: 'Customer-confirmed resolution', kind: 'measured', weightPct: 100, trueValue: 90, effortCost: 40, gamingEase: 0, noisePct: 0, ratchetPct: 0 }],
    stakesPct: 0, professionalismPct: 0, riskAversionPct: 0, detectionPct: 100,
  });
  const res = api.commitScorecard(created.id, {});
  assert.equal(res.ok, true);
  assert.equal(store.state.decisions.length, before.decisions, 'a sound scorecard opens no decision');
  assert.equal(store.state.delegations.length, before.delegations, 'and no busywork');
});

test('rule spine: a falsified observation opens one calibration decision and one pre-filled review — a hit opens nothing', () => {
  const store = createStore({ storage: memStorage(), now: () => NOW });
  store.seedDemo(buildDemoState(NOW));
  const api = createApi(store, { now: () => NOW });
  const created = api.createScorecard({ title: 'Support throughput v3', tasks: TASKS, stakesPct: 70, detectionPct: 20 });
  api.commitScorecard(created.id, {});
  const frozenGaming = store.state.scorecards.find((row) => row.id === created.id).frozen.prediction.gamingSharePct;
  const decisionsBefore = store.state.decisions.length;
  const retrosBefore = store.state.retros.length;

  // A miss inside the margin: the model was close enough. Nothing is created.
  const hit = api.recordScorecardObservation(created.id, {
    recordedOn: '2026-10-29',
    gamingSharePct: Math.max(0, frozenGaming - 3),
    note: 'Checked the reopen-rate sample; roughly what the model said.',
  });
  assert.equal(hit.ok, true, hit.error);
  assert.equal(hit.score.falsified, false);
  assert.equal(store.state.decisions.length, decisionsBefore, 'a called prediction opens no decision');
  assert.equal(store.state.retros.length, retrosBefore, 'a called prediction drafts no review');

  // A second card whose observation beats the frozen prediction by more than
  // the declared margin IS falsified and produces the loop-closing work.
  const second = api.createScorecard({ title: 'Support throughput v4', tasks: TASKS, stakesPct: 70, detectionPct: 20 });
  api.commitScorecard(second.id, {});
  const frozen2 = store.state.scorecards.find((row) => row.id === second.id).frozen.prediction.gamingSharePct;
  const observed = Math.min(100, frozen2 + MEASUREMENT_FALSIFIER_MARGIN_PP + 5);
  const miss = api.recordScorecardObservation(second.id, {
    recordedOn: '2026-10-29',
    gamingSharePct: observed,
    metricMovedPct: 40,
    trueOutcomePct: 6,
    note: 'Audit found the count split across duplicate tickets; the outcome barely moved.',
  });
  assert.equal(miss.ok, true, miss.error);
  if (observed - frozen2 >= MEASUREMENT_FALSIFIER_MARGIN_PP) {
    assert.equal(miss.score.falsified, true);
    const calibration = store.state.decisions.filter((d) => String(d.question).includes(`[MTX-OBS:${second.id}]`));
    assert.equal(calibration.length, 1, 'one calibration decision');
    const retros = store.state.retros.filter((r) => String(r.subjectLabel).includes(`[MTX-OBS:${second.id}]`));
    assert.equal(retros.length, 1, 'one pre-filled after-action review');
    assert.match(retros[0].actual, /cosmetic gap/i);
    assert.equal(retros[0].status, 'draft');
  }
});

test('rule spine: registration, ordering before Decision Tempo and a declared contract', () => {
  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.name || rule.toString());
  assert.ok(ids.length >= 20);
  const position = DEFAULT_POST_COMMIT_RULES.indexOf(measurementRule);
  assert.ok(position >= 0, 'the rule is registered on the default spine');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === measurementRule);
  assert.ok(contract, 'every rule has an auditable contract');
  assert.equal(contract.module, 'measurementRule.js');
  assert.ok(contract.writes.includes('decisions'));
  assert.equal(contract.scansWorkspace, false);
});

test('rule spine: the pause switch stops every effect of the rule', () => {
  const store = createStore({ storage: memStorage(), now: () => NOW });
  store.seedDemo(buildDemoState(NOW));
  const api = createApi(store, { now: () => NOW });
  api.updateSettings({ measurementAutoPropagate: false });
  const created = api.createScorecard({ title: 'Blocked card', tasks: TASKS, stakesPct: 90 });
  const before = store.state.decisions.length;
  const res = api.commitScorecard(created.id, {});
  assert.equal(res.ok, false, 'committing is refused while paused, rather than committing silently with no follow-through');
  assert.equal(store.state.decisions.length, before);

  // The rule itself also refuses, so a direct event cannot bypass the policy.
  const draft = { ...createEmptyState(NOW.toISOString()), scorecards: [{ ...card({ id: 'sc-direct', status: 'committed' }), frozen: { at: NOW.toISOString(), prediction: freezeMeasurementPrediction(card()) } }], settings: { ...DEFAULT_SETTINGS, measurementAutoPropagate: false } };
  const effects = measurementRule(draft, {
    event: { type: SCORECARD_COMMITTED_EVENT, entityId: 'sc-direct' },
    now: NOW,
    idFactory: (p) => `${p}-x`,
  });
  assert.deepEqual(effects, []);
});

/* ==================================================== 7. read side */

test('read side: report, signals, brief and the Insights domain', () => {
  const store = demoStore();
  const report = buildMeasurementReport(store.state, { now: NOW });
  assert.equal(report.totals.total, 1);
  assert.equal(report.totals.active, 1);
  assert.ok(report.totals.misdirectedHoursPerWeek > 0);
  assert.ok(report.attention.some((row) => row.kind === 'distortion'));
  assert.ok(report.assumptions.length >= 4);

  const signals = measurementSignals(store.state, NOW);
  assert.ok(signals.some((s) => s.ruleId === 'MTX-01'));
  assert.ok(signals.some((s) => s.ruleId === 'MTX-05'));
  for (const signal of signals) {
    assert.equal(signal.domain, 'Scorecard integrity');
    assert.ok(signal.action.route.startsWith('#/'));
  }
  const insights = buildInsights(store.state, NOW);
  assert.ok(insights.findings.some((row) => row.domain === 'Scorecard integrity'), 'the domain is in DOMAIN_ORDER, so it is not silently dropped from the roll-up');
  assert.ok(insights.byDomain.some((row) => row.domain === 'Scorecard integrity'));

  const brief = measurementBrief(store.state, { now: NOW });
  assert.match(brief, /SCORECARD INTEGRITY/);
  assert.match(brief, /ASSUMPTIONS/);
  assert.match(brief, /Support throughput/);
});

test('read side: calibration refuses to claim skill below the counts-only floor', () => {
  const report = buildMeasurementReport({ scorecards: [card()] }, { now: NOW });
  assert.equal(report.calibration.sufficient, false);
  assert.ok(report.calibration.rows.length <= 1);
  assert.match(report.calibration.message, /anchored|anecdote|scored observation/i);
  assert.equal(scoreMeasurementObservation(card()), null, 'no frozen prediction means no score');
});

test('read side: the CSV scope is opaque — no task names, objectives, notes or people', () => {
  const store = demoStore();
  const api = createApi(store, { now: () => NOW });
  const created = api.createScorecard({ title: 'Named scorecard', tasks: TASKS, stakesPct: 80 });
  api.commitScorecard(created.id, {});
  api.recordScorecardObservation(created.id, {
    recordedOn: '2026-10-29', gamingSharePct: 20,
    note: 'A confidential note naming Priya and the reopen audit',
  });

  assert.ok(CSV_EXPORTS.some((scope) => scope.key === 'scorecardIntegrity'));
  const exported = exportWorkspaceCsv(store.state, 'scorecardIntegrity', { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  const csv = exported.csv;
  assert.match(csv, /scorecard_code/);
  assert.match(csv, /modelled_gaming_share_pct/);
  assert.ok(!csv.includes('Named scorecard'));
  assert.ok(!csv.includes('Tickets closed'), 'no task names');
  assert.ok(!csv.includes('confidential note'), 'no observation notes');
  assert.ok(!csv.includes('Resolutions that hold'), 'no objective text');
  for (const person of store.state.people || []) {
    if (person.name) assert.ok(!csv.includes(person.name), `no person name ${person.name}`);
  }
});

/* ============================================================ 8. UI */

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
    delete globalThis.window;
    delete globalThis.document;
  }
}

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

test('UI: #/measurement renders the model, declares, commits and is axe-clean', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.store.seedDemo(buildDemoState(NOW));
    app.ctx.navigate('#/measurement');
    const page = document.querySelector('[data-testid="measurement-page"]');
    assert.ok(page, 'the route renders');
    assert.match(page.textContent, /Scorecard integrity/);
    assert.match(page.textContent, /Support throughput/, 'the demo scorecard is shown');
    assert.match(page.textContent, /Holmström & Milgrom/, 'the model is named, not hidden');
    assert.match(page.textContent, /Modelled genuine value/);
    assert.ok(document.querySelectorAll('form').length >= 1, 'there is a declaration form');
    assert.deepEqual(await axeViolations(env), [], '#/measurement is axe-clean');

    // Every interactive control is a real button with a type, so it is
    // keyboard-operable and cannot submit a form by accident.
    for (const button of document.querySelectorAll('#view button')) {
      assert.ok(button.getAttribute('type'), `button “${button.textContent}” has no type`);
    }

    // The declaration form posts through the api and lands on an editable draft.
    const titleInput = document.getElementById('mtx-title');
    titleInput.value = 'UI declared card';
    const rows = document.querySelectorAll('tr.mtx-task-row');
    assert.ok(rows.length >= 3);
    document.querySelector('#view form').dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true }));
    const created = app.store.state.scorecards.find((row) => row.title === 'UI declared card');
    assert.ok(created, 'the form created a draft');
    assert.equal(created.status, 'draft');
    assert.ok(document.querySelector('[data-testid="measurement-page"]'));
    assert.deepEqual(await axeViolations(env), [], 'the edited draft is axe-clean');
    assert.equal(env.consoleErrors.length, 0, `unexpected console errors: ${env.consoleErrors.join(' | ')}`);
  });
});

test('UI: an empty workspace explains the model and is axe-clean', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.ctx.navigate('#/measurement');
    const page = document.querySelector('[data-testid="measurement-page"]');
    assert.ok(page);
    assert.match(page.textContent, /No scorecard has been declared/);
    assert.match(page.textContent, /No observation has been recorded yet/);
    assert.deepEqual(await axeViolations(env), [], 'the empty lab is axe-clean');
    assert.equal(env.consoleErrors.length, 0, `unexpected console errors: ${env.consoleErrors.join(' | ')}`);
  });
});
