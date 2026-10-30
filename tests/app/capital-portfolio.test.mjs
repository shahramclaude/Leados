/**
 * tests/app/capital-portfolio.test.mjs — Structural Capital Allocation
 * (Session 58, Schema v38).
 *
 *   1. Objective function: hand-computed normalisation and weights.
 *   2. Effort book: conventions applied per unit, and totals.
 *   3. Allocation: budget feasibility, determinism, complementarity pass, and
 *      a frontier that is non-dominated by construction.
 *   4. Attribution: exact Shapley efficiency, single-player and null-player
 *      cases, and pair interactions that reconcile with the solo scores.
 *   5. Robustness: seeded determinism, ordered bands, minimax-regret selection.
 *   6. Checkpoint scoring: hand-computed skill, missing baseline withheld, and
 *      pooled suppression below two observations.
 *   7. Trust ladder: every grade reachable, none claimed without evidence.
 *   8. Schema v38: additive migration, normalizers that repair rather than
 *      trust, and a stored skill that cannot survive a hand edit.
 *   9. Actions: validated adoption that freezes prediction + baseline, the real
 *      cross-module cascade through the store, idempotent rescans, and the
 *      out-of-sample failure path.
 *  10. Signals, insights, CSV scope #39, brief, demo seed, and JSDOM+axe.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION, DEFAULT_SETTINGS } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { addDays, dayKey } from '../../app/core/time.js';
import {
  CAP_DEFAULT_BUDGET_UNITS,
  CAP_EFFORT_BOOK,
  CAP_ENGINE_VERSION,
  CAP_RULE_IDS,
  CAP_RULES,
  CAP_TRUST_GRADES,
  allocate,
  buildCapitalReport,
  capitalAttentionCount,
  capitalBrief,
  capitalSignals,
  effortOf,
  modelTrust,
  normalizeCapitalPolicyPayload,
  normalizeDynamicsCheckpointPayload,
  objectiveScore,
  pairInteractions,
  policyPortfolioRule,
  pooledCheckpointSkill,
  robustness,
  scoreCheckpoint,
  shapleyAttribution,
} from '../../app/core/domain/policyPortfolio.js';
import { deriveDynamicsModel, DYN_MAX_HORIZON_WEEKS } from '../../app/core/domain/dynamics.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS } from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-28T10:00:00.000Z');
const TODAY = '2026-10-28';

/* --------------------------------------------------------------- fixtures */

function kvStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness(now = NOW) {
  // The clock is adjustable because a checkpoint may not be dated in the future
  // and may not predate adoption: real governance needs days to pass between an
  // adoption and its first honest observation, so the harness has to let them.
  const clock = { now };
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-cap-${++seq}`;
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

function person(i, extra = {}) {
  return {
    id: `person-${i}`,
    name: `Person ${i}`,
    role: 'Engineer',
    level: 'senior',
    team: 'Core',
    managerId: null,
    startDate: '2026-01-05',
    focalPoints: [],
    talkingPoints: [],
    status: 'active',
    createdAt: '2026-01-05T00:00:00.000Z',
    archivedAt: null,
    ...extra,
  };
}

function portfolioItem(i, extra = {}) {
  return {
    id: `pf-${i}`,
    title: `Item ${i}`,
    kind: 'project',
    horizon: 'core',
    status: i <= 5 ? 'open' : 'done',
    sourceType: 'manual',
    sourceId: null,
    ownerId: `person-${(i % 4) + 1}`,
    effortDays: { optimistic: 10, mostLikely: 10, pessimistic: 10 },
    value: { optimistic: 1000, mostLikely: 1000, pessimistic: 1000 },
    currency: 'USD',
    decision: 'funded',
    decisionOn: '2026-09-01',
    rationale: '',
    targetOn: null,
    createdOn: '2026-07-01',
    completedOn: i <= 5 ? null : '2026-09-20',
    releasedOn: null,
    actualEffortDays: null,
    actualValue: null,
    forecastSnapshot: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...extra,
  };
}

function workspace(patch = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.people = [1, 2, 3, 4, 5].map((i) => person(i));
  state.portfolio = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => portfolioItem(i));
  return { ...state, ...patch };
}

function policyPayload(extra = {}) {
  return {
    name: 'Cap intake before hiring',
    hypothesis: 'If intake is capped, pressure stops climbing inside one quarter.',
    levers: { hirePerWeek: 0, wipCapPct: 20, scopeCutPct: 0, reworkInvestment: 0, delegationShare: 0, learningShare: 0 },
    budgetUnits: 6,
    horizonWeeks: 26,
    ownerId: 'person-1',
    checkpointOn: addDays(TODAY, 30),
    notes: '',
    ...extra,
  };
}

function checkpointRow({ skill = 0.4, subjectId = 'cap-1', subjectType = 'policy', recordedOn = '2026-10-20' } = {}) {
  return {
    id: `chk-${recordedOn}-${subjectId}`,
    subjectType,
    subjectId,
    recordedOn,
    observed: { saturationPct: 90 },
    scoring: { skill, verdict: skill > 0.05 ? 'beats-persistence' : 'no-better-than-persistence', mae: 1 },
  };
}

/* ------------------------------------------------ 1. objective function */

test('the composite scores relative gains with declared weights by hand', () => {
  const baseline = { endSaturationPct: 100, cumulativeThroughputDays: 1000, endCapacityPerWeek: 10, endWipDays: 100 };
  const scenario = { endSaturationPct: 80, cumulativeThroughputDays: 1100, endCapacityPerWeek: 11, endWipDays: 90 };
  const result = objectiveScore(baseline, scenario);
  // saturation (100-80)/100 = .20 -> 20 points; throughput 100/1000 = .10 -> 10;
  // capacity 1/10 = .10 -> 10; WIP 10/100 = .10 -> 10.
  assert.deepEqual(result.parts, { saturation: 20, throughput: 10, capacity: 10, wip: 10 });
  // .35*20 + .25*10 + .2*10 + .2*10 = 7 + 2.5 + 2 + 2 = 13.5
  assert.equal(result.score, 13.5);
  assert.deepEqual(result.raw, { saturationPct: -20, wipDays: -10, capacityPerWeek: 1, throughputDays: 100, dependencyPct: 0 });
});

test('a single relative gain is clamped so no one metric can own the composite', () => {
  const baseline = { endSaturationPct: 100, cumulativeThroughputDays: 100, endCapacityPerWeek: 10, endWipDays: 10 };
  const scenario = { endSaturationPct: 0, cumulativeThroughputDays: 100, endCapacityPerWeek: 10, endWipDays: 10 };
  const result = objectiveScore(baseline, scenario);
  assert.equal(result.parts.saturation, 100, 'a 100% improvement is the ceiling for the saturation term');
  assert.equal(result.score, 35);
});

test('weights are normalised, and an all-zero weight set falls back to the convention', () => {
  const baseline = { endSaturationPct: 100, cumulativeThroughputDays: 1000, endCapacityPerWeek: 10, endWipDays: 100 };
  const scenario = { endSaturationPct: 90, cumulativeThroughputDays: 1000, endCapacityPerWeek: 10, endWipDays: 100 };
  const weighted = objectiveScore(baseline, scenario, { saturation: 1, throughput: 0, capacity: 0, wip: 0 });
  assert.equal(weighted.weights.saturation, 1);
  assert.equal(weighted.score, 10, 'all weight on saturation gives exactly the saturation gain');
  const fallback = objectiveScore(baseline, scenario, { saturation: 0, throughput: 0, capacity: 0, wip: 0 });
  assert.equal(fallback.weights.saturation, 0.35);
});

/* ------------------------------------------------------ 2. effort book */

test('effort is priced per unit of each lever, and zero levers cost nothing', () => {
  const none = effortOf({});
  assert.equal(none.total, 0);
  assert.deepEqual(none.rows, []);
  const effort = effortOf({ wipCapPct: 20, delegationShare: 0.5 });
  // 20 * 0.07 = 1.4 ; 0.5 * 5 = 2.5
  assert.equal(effort.total, 3.9);
  assert.equal(effort.rows.length, 2);
  assert.ok(effort.rows.every((row) => row.basis === 'assumed'), 'every effort cost is labelled a convention');
  assert.ok(CAP_EFFORT_BOOK.wipCapPct.note.length > 10, 'each convention explains what it prices');
});

/* ------------------------------------------------------- 3. allocation */

test('the allocation never spends more than the budget and reports what it left', () => {
  const model = deriveDynamicsModel(workspace(), NOW);
  const allocation = allocate(model, { budget: 4 });
  assert.ok(allocation.effort <= 4.0001, `effort ${allocation.effort} must respect the budget`);
  assert.ok(allocation.remaining >= -0.0001);
  assert.ok(allocation.steps.every((step) => step.gain > 0), 'every accepted increment paid for itself');
  assert.ok(allocation.effortRows.length >= 1, 'a budget this size buys something');
});

test('allocation is deterministic for the same model and budget', () => {
  const model = deriveDynamicsModel(workspace(), NOW);
  const a = allocate(model, { budget: 6 });
  const b = allocate(model, { budget: 6 });
  assert.deepEqual(a.levers, b.levers);
  assert.equal(a.score, b.score);
  assert.deepEqual(a.steps.map((step) => step.key), b.steps.map((step) => step.key));
});

test('a zero budget funds nothing and says so instead of inventing a plan', () => {
  const model = deriveDynamicsModel(workspace(), NOW);
  const allocation = allocate(model, { budget: 0 });
  assert.equal(allocation.effort, 0);
  assert.equal(allocation.score, 0);
  assert.equal(allocation.steps.length, 0);
});

test('the frontier is non-dominated and starts at zero effort', () => {
  const model = deriveDynamicsModel(workspace(), NOW);
  const allocation = allocate(model, { budget: 10 });
  const points = allocation.path.points;
  assert.equal(points[0].effort, 0);
  assert.equal(points[0].score, 0);
  for (let i = 1; i < points.length; i += 1) {
    assert.ok(points[i].effort > points[i - 1].effort, 'effort must strictly rise along the frontier');
    assert.ok(points[i].score >= points[i - 1].score, 'a dominated point must not survive');
  }
  assert.equal(allocation.path.exhausted, allocation.effort >= 10 - 1e-6);
});

test('two levers that pay only together are found by the complementarity pass', () => {
  // Learning alone costs throughput inside this horizon; capping WIP alone pays.
  const model = deriveDynamicsModel(workspace(), NOW);
  const pairs = pairInteractions(model, { wipCapPct: 20, learningShare: 0.2 });
  assert.equal(pairs.pairs.length, 1);
  const pair = pairs.pairs[0];
  assert.equal(pair.interaction, Math.round((pair.joint - pair.soloA - pair.soloB) * 100) / 100);
  assert.ok(['substitute', 'complement', 'additive'].includes(pair.kind));
});

/* ------------------------------------------------------ 4. attribution */

test('exact Shapley values satisfy the efficiency identity', () => {
  const model = deriveDynamicsModel(workspace(), NOW);
  const attribution = shapleyAttribution(model, { wipCapPct: 20, learningShare: 0.15, delegationShare: 0.3 });
  assert.equal(attribution.method, 'exact-shapley');
  assert.equal(attribution.coalitions, 8, 'three levers means eight coalitions');
  assert.equal(attribution.efficiencyGap, 0, 'attributed values must add up to the joint gain');
  const sum = Math.round(attribution.contributions.reduce((total, row) => total + row.marginal, 0) * 100) / 100;
  // Each marginal is rounded to a cent for display, so the displayed shares may
  // miss the displayed total by at most half a cent per player. The raw identity
  // above is the one that must be exact.
  assert.ok(Math.abs(sum - attribution.total) <= 0.01 * attribution.contributions.length,
    `rounded contributions ${sum} should reconstruct ${attribution.total} within a cent per player`);
  const shareSum = attribution.contributions.reduce((total, row) => total + (row.sharePct || 0), 0);
  assert.ok(Math.abs(shareSum - 100) < 0.4, `shares should account for the whole gain, got ${shareSum}`);
});

test('a single funded lever owns the whole gain, and no funded lever means no attribution', () => {
  const model = deriveDynamicsModel(workspace(), NOW);
  const single = shapleyAttribution(model, { wipCapPct: 20 });
  assert.equal(single.contributions.length, 1);
  assert.equal(single.contributions[0].marginal, single.total);
  assert.equal(single.contributions[0].sharePct, 100);
  const empty = shapleyAttribution(model, {});
  assert.deepEqual(empty.contributions, []);
  assert.equal(empty.total, 0);
});

/* ------------------------------------------------------ 5. robustness */

test('robustness is reproducible under the same seed and orders its bands', () => {
  const model = deriveDynamicsModel(workspace(), NOW);
  const levers = { wipCapPct: 20, learningShare: 0.1 };
  const a = robustness(model, levers, { draws: 12 });
  const b = robustness(model, levers, { draws: 12 });
  assert.deepEqual(a.options.map((row) => row.meanScore), b.options.map((row) => row.meanScore));
  for (const row of a.options) {
    assert.ok(row.p10 <= row.meanScore + 1e-9);
    assert.ok(row.p90 >= row.meanScore - 1e-9);
    assert.ok(row.maxRegret >= row.meanRegret - 1e-9);
  }
  const minimax = [...a.options].sort((x, y) => x.maxRegret - y.maxRegret)[0];
  assert.equal(a.minimax.key, minimax.key);
  assert.ok(a.options.some((row) => row.kind === 'baseline'), 'doing nothing is always an option');
  assert.ok(a.options.some((row) => row.kind === 'playbook'), 'the named playbooks are the comparison set');
});

test('the do-nothing option has zero regret only when it wins', () => {
  const model = deriveDynamicsModel(workspace(), NOW);
  const run = robustness(model, { wipCapPct: 20 }, { draws: 10 });
  const nothing = run.options.find((row) => row.key === 'do-nothing');
  assert.ok(nothing.meanScore <= run.portfolio.meanScore + 1e-9 || run.portfolio.winRatePct < 100);
  assert.ok(run.portfolio.winRatePct >= 0 && run.portfolio.winRatePct <= 100);
});

/* ------------------------------------------------- 6. checkpoint scoring */

test('checkpoint skill is hand-computed against naive persistence', () => {
  const predicted = { endSaturationPct: 100, baseline: { endSaturationPct: 120 } };
  const scored = scoreCheckpoint(predicted, { saturationPct: 90 });
  assert.equal(scored.mae, 10);
  assert.equal(scored.naiveMae, 30);
  assert.equal(scored.skill, 0.67, '1 - 10/30 rounds to 0.67');
  assert.equal(scored.verdict, 'beats-persistence');
  const worse = scoreCheckpoint({ endSaturationPct: 100, baseline: { endSaturationPct: 120 } }, { saturationPct: 128 });
  // model error 28, naive error 8 -> 1 - 28/8 = -2.5. A loss, reported as one.
  assert.equal(worse.skill, -2.5);
  assert.equal(worse.verdict, 'no-better-than-persistence');
});

test('a missing baseline withholds the skill score instead of inventing a denominator', () => {
  const scored = scoreCheckpoint({ endSaturationPct: 100 }, { saturationPct: 90 });
  assert.equal(scored.skill, null);
  assert.equal(scored.verdict, 'no-baseline');
  assert.ok(scored.reason.includes('withheld'));
  assert.equal(scored.mae, 10, 'the absolute error is still reported');
});

test('an unscorable checkpoint says so, and pooled skill is counts-only below two', () => {
  const empty = scoreCheckpoint({ endSaturationPct: 100 }, {});
  assert.equal(empty.verdict, 'unscorable');
  assert.equal(empty.mae, null);

  const one = pooledCheckpointSkill([checkpointRow({ skill: 0.4 })]);
  assert.equal(one.n, 1);
  assert.equal(one.skill, null, 'one observation is a count, not a pooled skill');
  assert.equal(one.suppressed, true);
  assert.ok(one.reason.includes('below the 2 required'));

  const two = pooledCheckpointSkill([checkpointRow({ skill: 0.6 }), checkpointRow({ skill: -0.2, recordedOn: '2026-10-21' })]);
  assert.equal(two.n, 2);
  assert.equal(two.skill, 0.2);
  assert.equal(two.beats, 1);
  assert.equal(two.verdict, 'beats-persistence');
});

/* ------------------------------------------------------- 7. trust ladder */

function trustReport({ skill = null, assumedPct = 10 } = {}) {
  return {
    calibration: skill === null ? { status: 'insufficient', reason: 'Not enough dated history.' } : { status: 'scored', skill, mase: 1.1 },
    provenance: { assumedPct, measured: 10 - assumedPct, estimated: 0, assumed: assumedPct },
  };
}

test('the trust ladder only claims what the evidence supports', () => {
  const unvalidated = modelTrust(trustReport({ skill: null }));
  assert.equal(unvalidated.grade, 'unvalidated');
  assert.equal(unvalidated.recommendation, 'comparative');
  assert.ok(unvalidated.blockers.some((line) => line.includes('Hindcast unavailable')));

  const refuted = modelTrust(trustReport({ skill: -0.8 }));
  assert.equal(refuted.grade, 'refuted');
  assert.equal(refuted.recommendation, 'comparative');

  const provisional = modelTrust(trustReport({ skill: 0.4, assumedPct: 60 }));
  assert.equal(provisional.grade, 'provisional');
  assert.equal(provisional.recommendation, 'directional');
  assert.ok(provisional.blockers.some((line) => line.includes('60% of parameters')));

  const backtested = modelTrust(trustReport({ skill: 0.4, assumedPct: 10 }));
  assert.equal(backtested.grade, 'backtested');
  assert.ok(backtested.blockers.some((line) => line.includes('more independently dated')));

  const validated = modelTrust(trustReport({ skill: 0.4, assumedPct: 10 }), [
    checkpointRow({ skill: 0.5 }), checkpointRow({ skill: 0.2, recordedOn: '2026-10-21' }),
  ]);
  assert.equal(validated.grade, 'validated');
  assert.equal(validated.recommendation, 'actionable');
  assert.equal(validated.actionable, true);

  const failedOutOfSample = modelTrust(trustReport({ skill: 0.4, assumedPct: 10 }), [
    checkpointRow({ skill: -0.3 }), checkpointRow({ skill: -0.1, recordedOn: '2026-10-21' }),
  ]);
  assert.equal(failedOutOfSample.grade, 'refuted', 'a backtest that loses out of sample is refuted, not “validated-lite”');
  assert.equal(CAP_TRUST_GRADES.validated.rank, 4);
});

/* --------------------------------------------------------- 8. schema v38 */

test('Schema v38 adds portfolios and checkpoints additively', () => {
  assert.equal(SCHEMA_VERSION, 58);
  assert.equal(DEFAULT_SETTINGS.capitalEffortBudget, 12);
  assert.equal(DEFAULT_SETTINGS.capitalAutoPropagate, true);
  const empty = createEmptyState(NOW.toISOString());
  assert.deepEqual(empty.capitalPolicies, []);
  assert.deepEqual(empty.dynamicsCheckpoints, []);
  const migrated = migrate({ schemaVersion: 37, settings: {}, people: [], portfolio: [] });
  assert.equal(migrated.raw.schemaVersion, 58);
  assert.equal(migrated.applied.at(-1), '57 → 58');
  assert.deepEqual(migrated.raw.capitalPolicies, []);
  assert.deepEqual(migrated.raw.dynamicsCheckpoints, []);
  const state = normalizeState(migrated.raw, { now: NOW }).state;
  assert.equal(state.schemaVersion, 58);
  assert.ok(LINK_ENTITY_TYPES.includes('capital'));
  assert.ok(LINK_ENTITY_TYPES.includes('checkpoint'));
  assert.ok(LINK_RELATIONS.includes('allocates'));
  assert.ok(LINK_RELATIONS.includes('scores'));
});

test('the portfolio normalizer repairs corrupt rows instead of trusting them', () => {
  const state = workspace();
  state.capitalPolicies = [
    { id: 'cap-a', name: 'Valid portfolio', hypothesis: 'A real expectation over ten characters.', levers: { wipCapPct: 999 }, budgetUnits: 999, weights: { saturation: 4, throughput: 0, capacity: 0, wip: 0 }, ownerId: 'ghost', status: 'adopted', adoptedOn: null },
    { id: 'cap-a', name: 'Duplicate id', hypothesis: 'Duplicate identifiers are dropped.', levers: { wipCapPct: 5 } },
    { id: 'cap-b', name: '', hypothesis: 'A nameless row is unusable.', levers: { wipCapPct: 5 } },
    { id: 'cap-c', name: 'Adopted with a date', hypothesis: 'A dated adoption is kept as adopted.', levers: { wipCapPct: 10 }, adoptedOn: '2026-10-01', status: 'adopted', predicted: { endSaturationPct: 100, baseline: { endSaturationPct: 120 }, attribution: [{ key: 'wipCapPct', label: 'Cap WIP', marginal: 3, sharePct: 100 }] } },
  ];
  const { state: normalized } = normalizeState(state, { now: NOW });
  const ids = normalized.capitalPolicies.map((row) => row.id);
  assert.deepEqual(ids, ['cap-a', 'cap-c'], 'duplicates and nameless rows are dropped');
  const repaired = normalized.capitalPolicies[0];
  assert.equal(repaired.status, 'draft', 'an undated adoption is demoted rather than retro-frozen');
  assert.equal(repaired.adoptedOn, null);
  assert.equal(repaired.ownerId, null, 'a departed owner is cleared');
  assert.equal(repaired.levers.wipCapPct, 60, 'levers are clamped to the dynamics bounds');
  assert.equal(repaired.budgetUnits, 40);
  assert.equal(repaired.weights.saturation, 1, 'weights are renormalised');
  const adopted = normalized.capitalPolicies[1];
  assert.equal(adopted.status, 'adopted');
  assert.equal(adopted.predicted.baseline.endSaturationPct, 120);
  assert.equal(adopted.predicted.attribution[0].sharePct, 100);
});

test('a stored checkpoint score is re-derived from the observation on load', () => {
  const state = workspace();
  state.capitalPolicies = [{
    id: 'cap-1', name: 'Portfolio one', hypothesis: 'A testable expectation in a sentence.', levers: { wipCapPct: 20 },
    budgetUnits: 4, ownerId: 'person-1', status: 'adopted', adoptedOn: '2026-10-01',
    predicted: { endSaturationPct: 100, endWipDays: 60, baseline: { endSaturationPct: 120, endWipDays: 80 } },
  }];
  state.dynamicsCheckpoints = [
    { id: 'chk-1', subjectType: 'policy', subjectId: 'cap-1', recordedOn: '2026-10-20', observed: { saturationPct: 90, wipDays: 70 }, scoring: { skill: 999 } },
    { id: 'chk-1', subjectType: 'policy', subjectId: 'cap-1', recordedOn: '2026-10-21', observed: { saturationPct: 95 } },
    { id: 'chk-2', subjectType: 'policy', subjectId: 'missing', recordedOn: '2026-10-21', observed: { saturationPct: 95 } },
    { id: 'chk-3', subjectType: 'policy', subjectId: 'cap-1', recordedOn: '2026-10-20', observed: { saturationPct: 91 } },
    { id: 'chk-4', subjectType: 'policy', subjectId: 'cap-1', recordedOn: '', observed: { saturationPct: 91 } },
    { id: 'chk-5', subjectType: 'policy', subjectId: 'cap-1', recordedOn: '2026-10-22', observed: { saturationPct: 9999 } },
  ];
  const { state: normalized, warnings } = normalizeState(state, { now: NOW });
  assert.equal(normalized.dynamicsCheckpoints.length, 1, 'duplicate dates, orphans, undated rows and impossible values are dropped');
  const checkpoint = normalized.dynamicsCheckpoints[0];
  // pressure: 100 vs 90, naive 120 vs 90 -> skill 1 - 10/30 = 0.67
  // WIP: 60 vs 70, naive 80 vs 70 -> skill 1 - 10/10 = 0
  assert.equal(checkpoint.scoring.stocks.length, 2);
  assert.equal(checkpoint.scoring.skill, 0.34, 'the hand-edited 999 is gone and the mean is recomputed');
  assert.ok(warnings.some((line) => line.includes('second checkpoint')));
});

test('payload validation refuses portfolios and checkpoints that cannot mean anything', () => {
  assert.equal(normalizeCapitalPolicyPayload({ name: 'ab', hypothesis: 'long enough text here' }).ok, false);
  assert.equal(normalizeCapitalPolicyPayload({ name: 'A plan', hypothesis: 'short' }).ok, false);
  const noLevers = normalizeCapitalPolicyPayload({ name: 'A plan', hypothesis: 'A testable expectation over ten characters.', levers: {} });
  assert.equal(noLevers.ok, false);
  assert.ok(noLevers.error.includes('Fund at least one lever'));
  const ok = normalizeCapitalPolicyPayload(policyPayload());
  assert.equal(ok.ok, true);
  assert.ok(Math.abs(Object.values(ok.value.weights).reduce((a, b) => a + b, 0) - 1) < 0.05);

  assert.equal(normalizeDynamicsCheckpointPayload({ subjectType: 'policy' }).ok, false);
  assert.equal(normalizeDynamicsCheckpointPayload({ subjectType: 'policy', subjectId: 'x', recordedOn: '2026-10-20' }).ok, false);
  assert.equal(normalizeDynamicsCheckpointPayload({ subjectType: 'policy', subjectId: 'x', recordedOn: '2026-10-20', observed: { saturationPct: 2000 } }).ok, false);
  const checkpoint = normalizeDynamicsCheckpointPayload({ subjectType: 'policy', subjectId: 'x', recordedOn: '2026-10-20', observed: { saturationPct: 90 } });
  assert.equal(checkpoint.ok, true);
});

/* ----------------------------------------------------------- 9. actions */

test('saving a portfolio validates the budget, the owner and the checkpoint date', () => {
  const { store, api } = harness();
  store.update((draft) => { draft.people = [person(1)]; }, { type: 'person.created', entity: 'person', entityId: 'person-1', summary: 'seed' });
  const overBudget = api.saveCapitalPolicy(policyPayload({ budgetUnits: 1, levers: { delegationShare: 1 } }));
  assert.equal(overBudget.ok, false);
  assert.ok(overBudget.error.includes('effort-weeks'));
  const badOwner = api.saveCapitalPolicy(policyPayload({ ownerId: 'ghost' }));
  assert.equal(badOwner.ok, false);
  const pastDate = api.saveCapitalPolicy(policyPayload({ checkpointOn: '2026-01-01' }));
  assert.equal(pastDate.ok, false);
  const saved = api.saveCapitalPolicy(policyPayload());
  assert.equal(saved.ok, true);
  assert.equal(store.state.capitalPolicies.length, 1);
  assert.equal(store.state.capitalPolicies[0].status, 'draft');
  // Adoption requires an owner and a real model.
  const noOwner = api.saveCapitalPolicy(policyPayload({ ownerId: '', id: saved.id }));
  assert.equal(noOwner.ok, true, 'a draft may exist without an owner');
  const adoptRefused = api.adoptCapitalPolicy(saved.id, {});
  assert.equal(adoptRefused.ok, false);
  assert.ok(adoptRefused.error.includes('owner'));
});

test('adoption freezes the prediction, the baseline and the attribution, and fans out atomically', () => {
  const { store, api } = harness();
  store.update((draft) => { draft.people = [person(1), person(2), person(3)]; }, { type: 'person.created', entity: 'person', entityId: 'person-1', summary: 'seed' });
  const saved = api.saveCapitalPolicy(policyPayload({ budgetUnits: 6 }));
  assert.equal(saved.ok, true);
  const decisionsBefore = store.state.decisions.length;
  const adopted = api.adoptCapitalPolicy(saved.id, { checkpointOn: addDays(TODAY, 21) });
  assert.equal(adopted.ok, true);
  const record = store.state.capitalPolicies[0];
  assert.equal(record.status, 'adopted');
  assert.ok(record.predicted.baseline, 'the do-nothing baseline is frozen with the prediction');
  assert.ok(Number.isFinite(record.predicted.endSaturationPct));
  assert.ok(record.predicted.attribution.length >= 1);
  assert.ok(['unvalidated', 'refuted', 'provisional'].includes(record.predicted.trustGrade),
    'a workspace with no measured history cannot claim a validated model');
  assert.equal(record.checkpointOn, addDays(TODAY, 21));

  const capitalDecisions = store.state.decisions.filter((decision) => String(decision.question).includes(`[${CAP_RULE_IDS.COMMIT}:${saved.id}]`));
  assert.equal(capitalDecisions.length, 1, 'RULE-CAP-01 opens exactly one commitment decision');
  assert.equal(store.state.decisions.length, decisionsBefore + 1);
  const delegations = store.state.delegations.filter((delegation) => `${delegation.support}`.includes(`[${CAP_RULE_IDS.CHECKPOINT}:${saved.id}]`));
  assert.equal(delegations.length, 1, 'RULE-CAP-02 opens exactly one owned checkpoint');
  assert.equal(delegations[0].personId, 'person-1');
  assert.ok(delegations[0].support.includes('baseline'));
  const owner = store.state.people.find((p) => p.id === 'person-1');
  assert.equal(owner.talkingPoints.filter((point) => point.includes(`[${CAP_RULE_IDS.COMMIT}-review:${saved.id}]`)).length, 1);

  const links = store.state.links;
  assert.ok(links.some((link) => link.sourceType === 'capital' && link.targetType === 'decision' && link.relation === 'allocates'));
  assert.ok(links.some((link) => link.sourceType === 'capital' && link.targetType === 'delegation' && link.relation === 'tracks-followup'));
  assert.ok(store.state.events.some((event) => event.type === 'automation.propagated' && event.summary.includes(CAP_RULE_IDS.COMMIT)));
});

test('repeated scans converge instead of duplicating decisions or delegations', () => {
  const { store, api } = harness();
  store.update((draft) => { draft.people = [person(1), person(2), person(3)]; }, { type: 'person.created', entity: 'person', entityId: 'person-1', summary: 'seed' });
  const saved = api.saveCapitalPolicy(policyPayload());
  api.adoptCapitalPolicy(saved.id, {});
  const counts = {
    decisions: store.state.decisions.length,
    delegations: store.state.delegations.length,
    links: store.state.links.length,
  };
  api.scanCapital();
  api.scanCapital();
  assert.equal(store.state.decisions.length, counts.decisions);
  assert.equal(store.state.delegations.length, counts.delegations);
  assert.equal(store.state.links.length, counts.links);
});

test('an adopted portfolio cannot be silently edited, and retirement needs a reason', () => {
  const { store, api } = harness();
  store.update((draft) => { draft.people = [person(1), person(2), person(3)]; }, { type: 'person.created', entity: 'person', entityId: 'person-1', summary: 'seed' });
  const saved = api.saveCapitalPolicy(policyPayload());
  api.adoptCapitalPolicy(saved.id, {});
  const edit = api.saveCapitalPolicy(policyPayload({ id: saved.id }));
  assert.equal(edit.ok, false);
  assert.ok(edit.error.includes('Retire it'));
  const noReason = api.retireCapitalPolicy(saved.id, { note: 'x' });
  assert.equal(noReason.ok, false);
  const retired = api.retireCapitalPolicy(saved.id, { note: 'The intake cap cost us a commitment.' });
  assert.equal(retired.ok, true);
  assert.equal(store.state.capitalPolicies[0].status, 'retired');
  assert.ok(store.state.capitalPolicies[0].notes.includes('cost us a commitment'));
  const del = api.deleteCapitalPolicy(saved.id);
  assert.equal(del.ok, true, 'a retired portfolio can be deleted');
});

test('checkpoint recording is append-only, dated honestly, and typed into the graph', () => {
  const { store, api } = harness();
  store.update((draft) => { draft.people = [person(1), person(2), person(3)]; }, { type: 'person.created', entity: 'person', entityId: 'person-1', summary: 'seed' });
  const saved = api.saveCapitalPolicy(policyPayload());
  // A draft has no frozen prediction, so scoring it would be scoring nothing.
  const draftOnly = api.recordDynamicsCheckpoint({
    subjectType: 'policy', subjectId: saved.id, recordedOn: TODAY, observed: { saturationPct: 90 },
  });
  assert.equal(draftOnly.ok, false, 'an adopted commitment is required before scoring');
  api.adoptCapitalPolicy(saved.id, {});

  const future = api.recordDynamicsCheckpoint({
    subjectType: 'policy', subjectId: saved.id, recordedOn: addDays(TODAY, 3), observed: { saturationPct: 90 },
  });
  assert.equal(future.ok, false);
  assert.ok(future.error.includes('future'));

  const predate = api.recordDynamicsCheckpoint({
    subjectType: 'policy', subjectId: saved.id, recordedOn: '2026-01-01', observed: { saturationPct: 90 },
  });
  assert.equal(predate.ok, false);
  assert.ok(predate.error.includes('predates'));

  const recorded = api.recordDynamicsCheckpoint({
    subjectType: 'policy', subjectId: saved.id, recordedOn: TODAY, observed: { saturationPct: 140, wipDays: 70 },
  });
  assert.equal(recorded.ok, true);
  assert.equal(store.state.dynamicsCheckpoints.length, 1);
  assert.ok(Number.isFinite(recorded.scoring.skill));
  assert.equal(store.state.links.filter((link) => link.sourceType === 'checkpoint' && link.relation === 'scores').length, 1);

  const duplicate = api.recordDynamicsCheckpoint({
    subjectType: 'policy', subjectId: saved.id, recordedOn: TODAY, observed: { saturationPct: 130 },
  });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.error.includes('already a checkpoint'));
});

test('two failing checkpoints open exactly one re-baselining decision', () => {
  const { store, api, advance } = harness();
  store.update((draft) => { draft.people = [person(1), person(2), person(3)]; }, { type: 'person.created', entity: 'person', entityId: 'person-1', summary: 'seed' });
  const saved = api.saveCapitalPolicy(policyPayload());
  api.adoptCapitalPolicy(saved.id, {});
  // Deliberately wrong in the same direction twice: observed pressure far worse
  // than both the prediction and the baseline.
  const first = advance(10);
  assert.equal(api.recordDynamicsCheckpoint({ subjectType: 'policy', subjectId: saved.id, recordedOn: first, observed: { saturationPct: 400 } }).ok, true);
  assert.equal(store.state.decisions.filter((d) => String(d.question).includes(`[${CAP_RULE_IDS.REBASELINE}]`)).length, 0,
    'one failing checkpoint is a data point, not a verdict');
  const second = advance(1);
  assert.equal(api.recordDynamicsCheckpoint({ subjectType: 'policy', subjectId: saved.id, recordedOn: second, observed: { saturationPct: 410 } }).ok, true);
  const decisions = store.state.decisions.filter((d) => String(d.question).includes(`[${CAP_RULE_IDS.REBASELINE}]`));
  assert.equal(decisions.length, 1);
  assert.ok(decisions[0].question.includes('pooled out-of-sample skill'));
  const third = advance(1);
  assert.equal(api.recordDynamicsCheckpoint({ subjectType: 'policy', subjectId: saved.id, recordedOn: third, observed: { saturationPct: 420 } }).ok, true);
  assert.equal(store.state.decisions.filter((d) => String(d.question).includes(`[${CAP_RULE_IDS.REBASELINE}]`)).length, 1,
    'the governance decision is idempotent');
});

test('the pause switch stops checkpoint governance but never an explicit adoption or scan', () => {
  const { store, api, advance } = harness();
  store.update((draft) => { draft.people = [person(1), person(2), person(3)]; }, { type: 'person.created', entity: 'person', entityId: 'person-1', summary: 'seed' });
  api.setCapitalPolicy({ autoPropagate: false });
  const saved = api.saveCapitalPolicy(policyPayload());
  api.adoptCapitalPolicy(saved.id, {});
  assert.equal(store.state.decisions.filter((d) => String(d.question).includes(`[${CAP_RULE_IDS.COMMIT}:`)).length, 1,
    'an adoption the leader just made always fans out');
  api.recordDynamicsCheckpoint({ subjectType: 'policy', subjectId: saved.id, recordedOn: advance(10), observed: { saturationPct: 400 } });
  api.recordDynamicsCheckpoint({ subjectType: 'policy', subjectId: saved.id, recordedOn: advance(1), observed: { saturationPct: 410 } });
  assert.equal(store.state.decisions.filter((d) => String(d.question).includes(`[${CAP_RULE_IDS.REBASELINE}]`)).length, 0,
    'paused governance does not open the re-baselining decision');
  assert.equal(store.state.links.filter((link) => link.sourceType === 'checkpoint').length, 0, 'nor the lineage edges');
});

/* --------------------------------------------------- 10. signals and output */

test('signals carry rule ids, evidence and a route, and merge into Signals', () => {
  const { store, api, advance, clock } = harness();
  store.update((draft) => { draft.people = [person(1), person(2), person(3)]; }, { type: 'person.created', entity: 'person', entityId: 'person-1', summary: 'seed' });
  const saved = api.saveCapitalPolicy(policyPayload());
  api.adoptCapitalPolicy(saved.id, {});
  api.recordDynamicsCheckpoint({ subjectType: 'policy', subjectId: saved.id, recordedOn: advance(10), observed: { saturationPct: 400 } });
  api.recordDynamicsCheckpoint({ subjectType: 'policy', subjectId: saved.id, recordedOn: advance(1), observed: { saturationPct: 410 } });
  const signals = capitalSignals(store.state, clock.now);
  assert.ok(signals.length >= 2);
  assert.ok(signals.every((signal) => signal.ruleId.startsWith('SCA-')));
  assert.ok(signals.every((signal) => signal.domain === 'Capital allocation'));
  assert.ok(signals.every((signal) => signal.evidence.length > 0 && signal.action.route.startsWith('#/capital')));
  assert.ok(signals.some((signal) => signal.ruleId === 'SCA-02'));
  assert.ok(DOMAIN_ORDER.includes('Capital allocation'));
  const insights = buildInsights(store.state, clock.now);
  assert.ok(insights.byDomain.some((entry) => entry.domain === 'Capital allocation'));
  assert.ok(capitalAttentionCount(store.state, clock.now) >= 1);
  assert.ok(store.state.events.some((event) => event.type === 'dynamics.checkpoint.recorded'));
});

test('CSV scope #39 exports numeric telemetry with opaque codes and no free text', () => {
  assert.equal(CSV_EXPORTS.length, 50);
  const scope = CSV_EXPORTS.find((entry) => entry.key === 'capital');
  assert.ok(scope);
  assert.equal(scope.group, 'analytics');
  const demo = buildDemoState(NOW);
  const exported = exportWorkspaceCsv(demo, 'capital', { now: NOW });
  assert.equal(exported.ok, true);
  const csv = exported.csv;
  assert.ok(csv.includes('engine_version'));
  assert.ok(csv.includes(CAP_ENGINE_VERSION));
  assert.ok(csv.includes('cap-rec-01'), 'the recommendation is exported under an opaque code');
  assert.ok(!csv.includes('Protect flow before adding headcount'), 'portfolio names never leave the workspace');
  assert.ok(!csv.includes('Recorded in the weekly review'), 'notes never leave the workspace');
  assert.ok(!csv.includes('Person 1'), 'no names');
  assert.ok(csv.includes('model_trust_grade'));
  assert.equal(exported.rowCount, 3, 'one recommendation row, one portfolio row and one checkpoint row');
});

test('the brief states the portfolio, the attribution, the regret and the caveats', () => {
  const demo = buildDemoState(NOW);
  const brief = capitalBrief(demo, NOW);
  assert.ok(brief.includes('Structural capital allocation brief'));
  assert.ok(brief.includes('Model trust:'));
  assert.ok(brief.includes('Allocated portfolio'));
  assert.ok(brief.includes('Attribution (exact Shapley, inside the model)'));
  assert.ok(brief.includes('Robustness (Savage minimax regret)'));
  assert.ok(brief.includes('not observed causality'));
  assert.ok(brief.includes('not a probability of the future'));
});

test('the demo ships a draft portfolio and one scored checkpoint without inventing a score', () => {
  const demo = buildDemoState(NOW);
  assert.equal(demo.capitalPolicies.length, 1);
  assert.equal(demo.capitalPolicies[0].status, 'draft');
  assert.equal(demo.dynamicsCheckpoints.length, 1);
  const checkpoint = demo.dynamicsCheckpoints[0];
  assert.equal(checkpoint.subjectType, 'experiment');
  assert.ok(Number.isFinite(checkpoint.scoring.skill), 'the demo scores a real observation against a real frozen baseline');
  assert.equal(checkpoint.scoring.verdict, 'beats-persistence');
  const report = buildCapitalReport(demo, NOW);
  assert.equal(report.adequate, true);
  assert.ok(report.allocation.effort <= report.budgetUnits);
  assert.ok(report.attribution.coalitions >= 2);
  assert.equal(report.trust.grade, 'refuted', 'the demo says its own model lost the hindcast');
  const again = buildCapitalReport(buildDemoState(NOW), NOW);
  assert.equal(again.allocation.score, report.allocation.score, 'the demo allocation is deterministic');
});

test('the capital rule is registered on the shared spine and in the catalogue', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.name === 'policyPortfolioRule'));
  const ids = AUTOMATION_RULES.map((rule) => rule.id);
  for (const rule of CAP_RULES) {
    assert.ok(ids.includes(rule.id), `${rule.id} must be in the catalogue`);
    assert.ok(rule.framework.length > 20, 'every rule names the framework it implements');
  }
  assert.equal(CAP_RULES.length, 4);
});

test('an empty workspace gets an honest refusal instead of an allocation', () => {
  const { api } = harness();
  const report = api.capitalReport();
  assert.equal(report.adequate, false);
  assert.ok(report.reason.length > 20);
  assert.equal(report.allocation, null);
  assert.equal(report.totals.attention, 0);
  assert.equal(capitalSignals(createEmptyState(NOW.toISOString()), NOW).length, 0);
});

/* ------------------------------------------------------------- 11. UI */

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
  return Array.from(result.violations).map((violation) => `${violation.id}: ${violation.help}`);
}

test('UI: every capital tab renders axe-clean on the demo workspace', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    for (const route of ['#/capital', '#/capital?tab=attribution', '#/capital?tab=robustness', '#/capital?tab=checkpoints']) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.length > 300, `${route} renders content`);
      assert.ok(!/is not a function|undefined is|NaN/.test(view.textContent), `${route} renders without an error panel`);
      assert.deepEqual(await axeViolations(env), [], `${route} axe-clean`);
    }
    app.ctx.navigate('#/capital');
    assert.match(env.document.querySelector('#view').textContent, /Structural capital allocation/);
    assert.ok(env.document.querySelector('[href="#/capital"]'), 'reachable from navigation');
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});

test('UI: the funding dialog previews the model and saves a draft portfolio', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    app.ctx.navigate('#/capital?tab=checkpoints');
    const buttons = Array.from(env.document.querySelectorAll('#view button'));
    const create = buttons.find((button) => /New portfolio/.test(button.textContent));
    assert.ok(create, 'the terminal offers a create action');
    create.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    const dialog = env.document.querySelector('#modal-root');
    assert.ok(dialog && dialog.textContent.length > 100, 'the funding dialog opens');
    assert.match(dialog.textContent, /Live model/, 'the preview runs against the derived model');
    assert.match(dialog.textContent, /Effort .* weeks/, 'the preview prices the effort');
    const nameInput = dialog.querySelector('input[name="name"]');
    const hypothesisInput = dialog.querySelector('textarea[name="hypothesis"]');
    const ownerSelect = dialog.querySelector('select[name="ownerId"]');
    assert.ok(nameInput && hypothesisInput && ownerSelect);
    nameInput.value = 'Cap intake for one quarter';
    hypothesisInput.value = 'If intake is capped, pressure falls below 100% inside a quarter.';
    ownerSelect.value = ownerSelect.options[1].value;
    dialog.querySelector('.btn-primary').dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    const policies = app.ctx.state.capitalPolicies;
    assert.ok(policies.some((policy) => policy.name === 'Cap intake for one quarter' && policy.status === 'draft'));
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});

test('UI: adopting from the terminal fans out and records a checkpoint', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    app.ctx.navigate('#/capital?tab=checkpoints');
    const decisionsBefore = app.ctx.state.decisions.length;
    // The demo ships a draft portfolio with an owner, so adopting is one click.
    const adopt = Array.from(env.document.querySelectorAll('#view button')).find((button) => /^Adopt$/.test(button.textContent.trim()));
    assert.ok(adopt, 'the draft portfolio offers an adopt action');
    adopt.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    const dialog = env.document.querySelector('#modal-root');
    assert.match(dialog.textContent, /Frozen at adoption/);
    dialog.querySelector('.btn-primary').dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    const adopted = app.ctx.state.capitalPolicies.find((policy) => policy.status === 'adopted');
    assert.ok(adopted, 'the portfolio is adopted');
    assert.ok(adopted.predicted.baseline, 'the baseline is frozen');
    assert.equal(app.ctx.state.decisions.length, decisionsBefore + 1, 'exactly one commitment decision was opened');
    assert.ok(app.ctx.state.delegations.some((delegation) => String(delegation.support).includes(`[${CAP_RULE_IDS.CHECKPOINT}:`)),
      'one owned checkpoint delegation was opened');
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});

test('clearing the demo removes its capital records but keeps a real portfolio and its typed edges', () => {
  const { store, api } = harness();
  store.seedDemo({ force: true });
  store.update((draft) => { draft.people = [...(draft.people || []), person(9)]; },
    { type: 'person.created', entity: 'person', entityId: 'person-9', summary: 'seed' });
  const real = api.saveCapitalPolicy(policyPayload({ ownerId: 'person-9' }));
  assert.equal(api.adoptCapitalPolicy(real.id, {}).ok, true);
  assert.ok(store.state.links.some((link) => link.sourceType === 'capital' && link.sourceId === real.id));

  store.clearDemo();

  assert.equal(store.state.capitalPolicies.filter((policy) => policy.id.includes('-demo-')).length, 0);
  assert.equal(store.state.dynamicsCheckpoints.filter((row) => row.id.includes('-demo-')).length, 0);
  assert.deepEqual(store.state.capitalPolicies.map((policy) => policy.id), [real.id],
    'a leader-created portfolio survives the demo cleanup');
  assert.ok(store.state.links.some((link) => link.sourceType === 'capital' && link.sourceId === real.id),
    'and so does its typed lineage: the graph filter must know the capital entity types');
  assert.ok(store.state.links.every((link) => {
    const live = {
      capital: new Set(store.state.capitalPolicies.map((row) => row.id)),
      checkpoint: new Set(store.state.dynamicsCheckpoints.map((row) => row.id)),
      decision: new Set(store.state.decisions.map((row) => row.id)),
      delegation: new Set(store.state.delegations.map((row) => row.id)),
      person: new Set(store.state.people.map((row) => row.id)),
    };
    return (live[link.sourceType]?.has(link.sourceId) ?? true)
      && (live[link.targetType]?.has(link.targetId) ?? true);
  }), 'no dangling capital or checkpoint edge remains');
});

test('the repository index advertises schema v38 and the new route', () => {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(index.includes('Schema v40'), 'index.html carries the schema version');
  assert.ok(index.includes('#/capital') || index.includes('Capital allocation'), 'the route is discoverable from the shell');
});
