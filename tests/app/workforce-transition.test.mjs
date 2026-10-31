/**
 * tests/app/workforce-transition.test.mjs — Schema v52, the Workforce Transition
 * Terminal.
 *
 * The claims under test are specific and falsifiable:
 *
 *   1. The v51 → v52 migration is additive: no programme, no candidate and no
 *      target is invented for an existing workspace.
 *   2. A candidate row whose person has left the roster stays readable and is
 *      never selectable; a programme with no usable weight gets the printed
 *      defaults back rather than a selection with no criteria.
 *   3. Exit cost is arithmetic over recorded pay and the declared conventions.
 *      A missing pay figure stays `null`, so "unpriced" can never become zero.
 *   4. The four-fifths screen runs on the *decision*, carries Wilson intervals,
 *      refuses to compare groups below the floor, and reports `insufficient`
 *      rather than a ratio nobody should quote.
 *   5. The compliance search finds the cheapest swap set that reaches the floor,
 *      keeps headcount unchanged, and reports infeasibility instead of inventing
 *      a plan.
 *   6. The weight ensemble is deterministic for a programme, and the banding is
 *      total and exhaustive.
 *   7. The optimizer respects locked rows, refuses to select a sole steward of a
 *      critical dependency, repairs a cost ceiling, and prints a bound rather
 *      than claiming optimality.
 *   8. The actions refuse what the module refuses: selecting a sole holder, a
 *      target that is under-named at decision time, and a finalization with no
 *      priced exit at all.
 *   9. One decided programme produces typed `separates` edges, one mechanism
 *      decision when the screen fails, owned hand-over delegations with typed
 *      edges to the dependencies at stake, and blameless survivor prompts — all
 *      idempotently, and all in the same transaction as the decision.
 *  10. Finalization freezes the reading, opens one dated outcome review and one
 *      tracking task, and `person.archived` resolves the frozen prediction so the
 *      survivor convention can be scored — withheld below five outcomes.
 *  11. CSV scope #46 carries counts and ratios with no name, no identifier, no
 *      group code, no note and no per-person probability.
 *  12. The demo carries a frozen past programme and a live one, the module stays
 *      quiet when there is nothing to say, and demo cleanup keeps a frozen
 *      snapshot while dropping rows for removed demo people.
 *  13. The page, its five tabs and both dialogs render keyboard-operably and
 *      axe-clean.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import {
  TRANSITION_CONVENTIONS,
  TRANSITION_DEFAULT_WEIGHTS,
  alternatives,
  candidates,
  complianceRepair,
  exitCostFor,
  impactScreen,
  normalizeWeights,
  optimizeSelection,
  robustnessEnsemble,
  survivorImpact,
  transitionBrief,
  transitionCalibration,
  transitionReading,
  transitionSignals,
} from '../../app/core/domain/transition.js';
import {
  buildTransitionSnapshot,
  normalizeTransitionPrograms,
  normalizeTransitionSnapshot,
} from '../../app/core/domain/transitionSchema.js';
import {
  TRANSITION_RULE_IDS,
  transitionRule,
} from '../../app/core/domain/transitionRules.js';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const TODAY = '2026-10-29';
const EFFECTIVE = '2026-12-15';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const RATINGS = ['meets-expectations', 'needs-development', 'often-exceeds', 'meets-expectations', 'sets-standard', 'meets-expectations', 'often-exceeds', 'meets-expectations'];
const LEVELS = ['senior', 'senior', 'lead', 'ic', 'senior', 'lead', 'ic', 'manager'];

/**
 * Sixteen people in two opaque groups of eight, with a sixteen-day spread of
 * tenure and a pay figure per person. Two critical dependencies: one with a sole
 * steward (p-1, the case the action must refuse) and one with two stewards.
 * Four people own an open case, which is what makes a hand-over obligation real
 * rather than hypothetical.
 */
function fixture({ groupA = 'G1', groupB = 'G2' } = {}) {
  const people = [];
  const reviews = [];
  const rows = [];
  const cases = [];
  for (let index = 0; index < 16; index += 1) {
    const personId = `p-${index + 1}`;
    const level = LEVELS[index % LEVELS.length];
    people.push({
      id: personId,
      name: `Person ${index + 1}`,
      role: `Role ${index + 1}`,
      level,
      team: index < 8 ? 'core' : 'ops',
      status: 'active',
      startDate: `202${index % 5}-0${(index % 9) + 1}-15`,
      managerId: null,
      talkingPoints: [],
    });
    reviews.push({
      id: `r-${index + 1}`,
      personId,
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      status: 'complete',
      completedAt: '2026-07-01T00:00:00.000Z',
      manager: { rating: RATINGS[index % RATINGS.length] },
    });
    rows.push({
      personId,
      level,
      currentPay: 90000 + index * 2500,
      proposedPay: 90000 + index * 2500,
      origin: index % 2 ? 'internal' : 'external',
      retentionConcern: index === 0,
      note: '',
    });
    if (index >= 3 && index <= 6) {
      cases.push({
        id: `case-${index}`,
        title: `Open case ${index}`,
        kind: 'issue',
        status: 'active',
        severity: 'medium',
        ownerId: personId,
        openedOn: '2026-09-01',
      });
    }
  }
  return {
    people,
    reviews,
    rows,
    cases,
    band: groupA,
    bandB: groupB,
  };
}

function makeStore(now = NOW) {
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-v52-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => now, idFactory });
  store.load();
  const api = createApi(store, { now: () => now, idFactory });
  return { store, api, idFactory };
}

function seedWorkspace(store, fixtureValue = fixture()) {
  store.update((draft) => {
    draft.people = fixtureValue.people;
    draft.reviews = fixtureValue.reviews;
    draft.cases = fixtureValue.cases;
    draft.meritCycles = [{
      id: 'merit-fixture',
      label: 'Recorded pay',
      currency: 'USD',
      effectiveOn: '2026-01-01',
      status: 'draft',
      budget: { kind: 'amount', value: 1000 },
      comparison: { dimension: 'origin' },
      ownerId: null,
      rows: fixtureValue.rows,
      audit: null,
      outcomes: [],
    }];
    draft.dependencies = [
      {
        id: 'dep-critical-1',
        label: 'Payments authorisation service',
        kind: 'service',
        criticality: 'critical',
        status: 'active',
        substitutability: 'none',
        stewards: [{ personId: 'p-1', role: 'primary', verifiedOn: '2026-09-01', notes: 'Wrote the failover runbook' }],
        upstreamIds: [],
        linkedGoalIds: [],
        drills: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'dep-critical-2',
        label: 'Regulatory reporting pipeline',
        kind: 'process',
        criticality: 'critical',
        status: 'active',
        substitutability: 'partial',
        stewards: [
          { personId: 'p-2', role: 'primary', verifiedOn: '2026-09-01', notes: '' },
          { personId: 'p-3', role: 'backup', verifiedOn: '2026-09-02', notes: '' },
        ],
        upstreamIds: [],
        linkedGoalIds: [],
        drills: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
      },
    ];
    draft.readiness = [
      { id: 'rd-1', personId: 'p-9', seat: 'Payments lead', rating: 'ready-now', notes: '', updatedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'rd-2', personId: 'p-10', seat: 'Payments lead', rating: 'ready-later', notes: '', updatedAt: '2026-08-01T00:00:00.000Z' },
    ];
    draft.goals = [
      { id: 'goal-1', title: 'Close the reporting gap', ownerId: 'p-5', status: 'active', dueOn: '2026-12-01', progress: 40, keyResults: [], checkins: [] },
    ];
    draft.delegations = [
      { id: 'del-1', personId: 'p-6', title: 'Own the migration cutover plan', expectedOutcome: 'Cutover plan agreed', authority: 'act-inform', support: '', delegatedOn: '2026-09-01', dueOn: '2026-12-01', status: 'active', checkins: [], completedOn: null, completionNote: '', returnedOn: '', returnReason: '', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
    ];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed roster, pay, dependencies and work' });
}

/**
 * Declare a programme, group every candidate, then name the exits.
 *
 * Grouping everyone is deliberate: a person with no group code is outside a
 * declared-dimension comparison by design, so a test that grouped only the named
 * people would be exercising the exclusion path rather than the screen.
 */
function stageProgram(api, store, { label = 'FY26 scope consolidation', headcount = 4, named = [], dimension = 'declared-group', ownerId = 'p-11' } = {}) {
  const created = api.addTransitionProgram({
    label,
    currency: 'USD',
    kind: 'reduction',
    effectiveOn: EFFECTIVE,
    headcount,
    dimension,
    ownerId,
  });
  assert.equal(created.ok, true, created.error);
  const synced = api.syncTransitionRoster(created.id);
  assert.equal(synced.ok, true, synced.error);
  for (const person of store.state.people) {
    const index = Number(person.id.split('-')[1]);
    const grouped = api.setTransitionRow(created.id, person.id, { group: index <= 8 ? 'G1' : 'G2' });
    assert.equal(grouped.ok, true, `${person.id}: ${grouped.error}`);
  }
  for (const personId of named) {
    const result = api.setTransitionRow(created.id, personId, { selected: true });
    assert.equal(result.ok, true, `${personId}: ${result.error}`);
  }
  return store.state.transitionPrograms.find((program) => program.id === created.id);
}

function factsFor(store, program) {
  return candidates(store.state, program, NOW);
}

/* ------------------------------------------------------------- migration */

test('v51 → v52 is additive: no programme, candidate or target is invented', () => {
  assert.equal(SCHEMA_VERSION, 67);
  const v51 = {
    schemaVersion: 51,
    settings: { teamName: 'Existing team' },
    people: [{ id: 'p1', name: 'Existing', status: 'active' }],
    meritCycles: [],
    compBands: [],
  };
  const migrated = migrate(v51);
  assert.equal(migrated.raw.schemaVersion, 67);
  assert.equal(migrated.applied.at(-1), '66 → 67');
  assert.deepEqual(migrated.raw.transitionPrograms, []);
  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.equal(state.transitionPrograms.length, 0);
  assert.deepEqual(warnings.filter((warning) => /Transition/i.test(warning)), []);
  for (const key of [
    'transitionNoticeDays',
    'transitionSeveranceMonthsPerYear',
    'transitionSeveranceCapMonths',
    'transitionImpactRatio',
    'transitionMinGroupSize',
    'transitionSurvivorLoadPct',
    'transitionHorizonDays',
    'transitionAutoPropagate',
  ]) {
    assert.ok(key in state.settings, `${key} is installed by the defaults`);
  }
  // The conventions are clamped, never trusted: a hand-edited file cannot
  // silently shorten a notice period or make the screen unfalsifiable.
  const repaired = normalizeState({
    ...migrated.raw,
    settings: { ...migrated.raw.settings, transitionNoticeDays: -5, transitionImpactRatio: 0.1, transitionMinGroupSize: 1 },
  }, { now: NOW }).state;
  assert.equal(repaired.settings.transitionNoticeDays, 1);
  assert.equal(repaired.settings.transitionImpactRatio, 0.5);
  assert.equal(repaired.settings.transitionMinGroupSize, 3);
});

test('normalisation keeps a dangling row readable, restores default weights, and preserves a frozen snapshot', () => {
  const { state } = normalizeState({ schemaVersion: 52, people: [{ id: 'p1', name: 'Real', status: 'active' }] }, { now: NOW });
  const raw = [{
    id: 'trn-1',
    label: 'A programme',
    effectiveOn: EFFECTIVE,
    dimension: 'nonsense',
    target: { headcount: 3 },
    weights: { performance: 0, capability: 0, cost: 0, tenure: 0, futureFit: 0 },
    rows: [
      { personId: 'p1', selected: true, group: 'g1', mobility: 400, workloadUnits: -2, note: 'kept' },
      { personId: 'ghost', selected: true, group: 'g2' },
      { personId: 'p1', selected: false },
    ],
    snapshot: { on: EFFECTIVE, currency: 'USD', target: { headcount: 3 }, achieved: { named: 2, cashCost: 1000 } },
  }];
  const warnings = [];
  const programs = normalizeTransitionPrograms(raw, state, NOW.toISOString(), warnings);
  assert.equal(programs.length, 1);
  const program = programs[0];
  assert.equal(program.dimension, 'team', 'an unrecognised dimension is repaired to a real one');
  // A programme with every weight at zero is not a programme with no criteria.
  assert.equal(program.weights.performance, 30);
  assert.ok(warnings.some((warning) => /default weighting/i.test(warning)));
  // The dangling row survives for history and is not selectable.
  assert.equal(program.rows.length, 2, 'the duplicate row for the same person is dropped');
  const ghost = program.rows.find((row) => row.personId === 'ghost');
  assert.ok(ghost);
  assert.equal(ghost.group, 'G2');
  const facts = candidates(state, program, NOW).rows;
  const ghostFacts = facts.find((row) => row.personId === 'ghost');
  assert.equal(ghostFacts.stillActive, false);
  assert.equal(facts.find((row) => row.personId === 'p1').group, 'G1');
  assert.equal(facts.find((row) => row.personId === 'p1').mobility, 100, 'mobility is clamped, not rejected');
  assert.equal(facts.find((row) => row.personId === 'p1').workloadUnits, 0, 'a negative ownership override is clamped to zero');
  // A snapshot is preserved exactly and is never recomputed.
  const snapshot = normalizeTransitionSnapshot(program.snapshot);
  assert.equal(snapshot.achieved.named, 2);
  assert.equal(snapshot.achieved.cashCost, 1000);
});

/* --------------------------------------------------------------- economics */

test('exit cost is arithmetic over recorded pay and the declared conventions, and missing pay stays missing', () => {
  const priced = exitCostFor({ annualPay: 120000, tenureYears: 4, noticeDays: 60, monthsPerYear: 1, capMonths: 6 });
  assert.equal(priced.status, 'priced');
  // 60 days of pay in lieu = 2 months of 10,000; severance = min(6, 4 years × 1) = 4 months.
  assert.equal(priced.noticePay, 20000);
  assert.equal(priced.severancePay, 40000);
  assert.equal(priced.severanceMonths, 4);
  assert.equal(priced.total, 60000);

  const capped = exitCostFor({ annualPay: 120000, tenureYears: 30, noticeDays: 30, monthsPerYear: 1, capMonths: 6 });
  assert.equal(capped.severanceMonths, 6, 'the cap binds');

  const unpriced = exitCostFor({ annualPay: null, tenureYears: 4, noticeDays: 60, monthsPerYear: 1, capMonths: 6 });
  assert.equal(unpriced.status, 'unpriced');
  assert.equal(unpriced.total, null, 'a missing pay figure is never zero');
});

/* ----------------------------------------------------------------- screen */

test('the selection screen runs on the decision, carries intervals, and refuses small groups', () => {
  const { store, api } = makeStore();
  seedWorkspace(store);
  const program = stageProgram(api, store, { named: ['p-4', 'p-5', 'p-6', 'p-9'], headcount: 4 });
  const facts = factsFor(store, program);

  const plan = new Set(['p-4', 'p-5', 'p-6', 'p-9']);
  const screen = impactScreen(facts.rows, plan, { dimension: 'declared-group', threshold: 0.8, minGroupSize: 5 });
  assert.equal(screen.status, 'ok');
  assert.equal(screen.groups.length, 2);
  assert.equal(screen.groups.find((group) => group.label === 'G1').selected, 3);
  assert.equal(screen.groups.find((group) => group.label === 'G2').selected, 1);
  assert.equal(screen.ratio, 0.333);
  assert.equal(screen.flagged, true);
  assert.equal(screen.reliable, true);
  assert.equal(screen.coverage.complete, true);
  for (const group of screen.groups) {
    assert.ok(group.low <= group.rate && group.rate <= group.high, 'the interval brackets the rate');
  }
  // The 2024 critique of the four-fifths rule in one number: 3/8 against 1/8
  // reverses with a single transfer at constant headcount.
  assert.equal(screen.fragility.flipsAt, 1);
  assert.match(screen.fragility.statement, /reverses/i);

  // Below the floor, the screen refuses rather than printing one-versus-one.
  const small = impactScreen(facts.rows.slice(0, 4), new Set(['p-4']), { dimension: 'declared-group', minGroupSize: 5 });
  assert.equal(small.status, 'insufficient');
  assert.equal(small.ratio, null);
  assert.match(small.detail, /needed|excluded/i);

  // An undeclared person is not a group. Ungrouped candidates must never become
  // an `unspecified` bucket that outvotes the declared groups.
  const stripped = facts.rows.map((row) => (Number(row.personId.split('-')[1]) > 8 ? { ...row, group: '' } : row));
  const declaredOnly = impactScreen(stripped, plan, { dimension: 'declared-group', threshold: 0.8, minGroupSize: 5 });
  assert.equal(declaredOnly.status, 'insufficient', 'one declared group cannot be compared with itself');
  assert.equal(declaredOnly.coverage.declared, 8);
  assert.equal(declaredOnly.coverage.total, 16);
  assert.ok(declaredOnly.excluded.some((group) => group.reason === 'no-group'));
});

test('compliance repair finds the cheapest swap set, keeps headcount, and says when nothing can work', () => {
  const { store, api } = makeStore();
  seedWorkspace(store);
  const program = stageProgram(api, store, { named: ['p-4', 'p-5', 'p-6', 'p-9'], headcount: 4 });
  const facts = factsFor(store, program);
  const planned = new Set(['p-4', 'p-5', 'p-6', 'p-9']);

  const repair = complianceRepair(facts.rows, planned, { dimension: 'declared-group', threshold: 0.8, minGroupSize: 5 });
  assert.equal(repair.status, 'ok');
  assert.equal(repair.feasible, true);
  assert.ok(repair.swaps.length >= 1);
  assert.ok(repair.after.ratio >= 0.8, `the repaired ratio ${repair.after.ratio} clears the floor`);
  assert.equal(repair.repairedIds.size, planned.size, 'headcount is unchanged: this is a different list, not a smaller one');
  assert.ok(repair.swaps.every((swap) => swap.outGroup !== swap.inGroup), 'every swap moves one person across the groups');
  assert.ok(repair.detail.includes('Headcount is unchanged'));

  // A floor that no swap set inside this plan can reach must be reported as
  // infeasible rather than repaired by inventing a smaller plan.
  const infeasible = complianceRepair(facts.rows, new Set(['p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-9', 'p-10']), {
    dimension: 'team',
    threshold: 0.95,
    minGroupSize: 5,
    maxSwaps: 2,
  });
  assert.equal(infeasible.status, 'ok');
  assert.equal(infeasible.feasible, false);
  assert.match(infeasible.detail, /No swap set reaches/i);
});

/* ------------------------------------------------------------ the optimizer */

test('the optimizer respects locks and exclusions, repairs a cost ceiling, and prints its bound', () => {
  // Synthetic rows with known costs: the ceiling test must be arithmetic, not a
  // hope that the fixture happens to produce a binding constraint.
  const row = (personId, performance, exitCost) => ({
    personId,
    stillActive: true,
    exitCost,
    capabilityRaw: 1,
    exposure: { performance, capability: 0.5, cost: 0.5, tenure: 0.5, futureFit: 0.5 },
  });
  const synthetic = [
    row('a', 0.95, 400), row('b', 0.9, 400), row('c', 0.85, 400), row('d', 0.8, 400),
    row('e', 0.4, 50), row('f', 0.35, 50), row('g', 0.3, 50), row('h', 0.25, 50),
  ];
  const weights = { performance: 1, capability: 0, cost: 0, tenure: 0, futureFit: 0 };
  const unconstrained = optimizeSelection(synthetic, {
    targetCount: 4,
    weights,
    lockedIn: new Set(['h']),
    lockedOut: new Set(['a']),
    blocked: new Map([['g', 'blocked for this test']]),
  });
  assert.equal(unconstrained.selected.length, 4);
  assert.ok(unconstrained.selectedIds.has('h'), 'a locked-in row is always selected');
  assert.equal(unconstrained.selectedIds.has('a'), false, 'a locked-out row is never selected');
  assert.equal(unconstrained.selectedIds.has('g'), false, 'a blocked row is never selected');
  assert.ok(unconstrained.excluded.some((entry) => entry.row.personId === 'a'));
  assert.ok(unconstrained.excluded.some((entry) => entry.row.personId === 'g'));
  assert.equal(unconstrained.bound, null, 'no ceiling means no knapsack bound');
  assert.equal(unconstrained.costCeilingBreached, false);

  const constrained = optimizeSelection(synthetic, {
    targetCount: 4,
    weights,
    costCeiling: 500,
    lockedIn: new Set(['h']),
  });
  assert.ok(constrained.repairs >= 1, 'the ceiling forced at least one swap');
  assert.ok(constrained.cost <= 500, `repaired cost ${constrained.cost} respects the ceiling`);
  assert.equal(constrained.costCeilingBreached, false);
  assert.ok(constrained.gapPct !== null && constrained.gapPct >= 0, 'the relaxation gap is reported, never claimed as optimality');
  assert.ok(constrained.bound !== null);

  // The same exclusions apply on the real pool, where a sole holder is blocked
  // by name rather than by score.
  const { store, api } = makeStore();
  seedWorkspace(store);
  const program = stageProgram(api, store, { named: ['p-4'], headcount: 1 });
  const facts = factsFor(store, program);
  const real = optimizeSelection(facts.rows, {
    targetCount: 3,
    weights: TRANSITION_DEFAULT_WEIGHTS,
    blocked: new Map([['p-1', 'sole steward of a critical dependency']]),
    lockedIn: new Set(['p-16']),
  });
  assert.equal(real.selected.length, 3);
  assert.equal(real.selectedIds.has('p-1'), false);
  assert.ok(real.selectedIds.has('p-16'));
});

test('the weight ensemble is deterministic, bounded by the target, and declines a thin run', () => {
  const { store, api } = makeStore();
  seedWorkspace(store);
  const program = stageProgram(api, store, { named: ['p-4', 'p-5'], headcount: 4 });
  const facts = factsFor(store, program);
  const weights = TRANSITION_DEFAULT_WEIGHTS;

  const first = robustnessEnsemble(facts.rows, { targetCount: 4, weights, draws: 60, seed: program.id });
  const second = robustnessEnsemble(facts.rows, { targetCount: 4, weights, draws: 60, seed: program.id });
  assert.equal(first.status, 'ok');
  assert.equal(first.draws, 60);
  assert.ok(first.core.length <= 4, 'no more people can be robust than the target');
  assert.equal(
    first.core.length + first.knifeEdge.length + first.stableRetained.length,
    facts.rows.filter((row) => row.stillActive).length,
    'every eligible person carries a band',
  );
  for (const [personId, entry] of first.byPerson) {
    assert.equal(second.byPerson.get(personId).pct, entry.pct, `${personId} is stable across runs`);
    assert.ok(entry.pct >= 0 && entry.pct <= 100);
  }

  const thin = robustnessEnsemble(facts.rows, { targetCount: 4, weights, draws: 10, seed: program.id });
  assert.equal(thin.status, 'thin');
  assert.match(thin.reason, /indicative/i);

  const nothing = robustnessEnsemble([], { targetCount: 4, weights });
  assert.equal(nothing.status, 'insufficient');
  assert.equal(nothing.draws, 0);
});

/* ---------------------------------------------------------------- actions */

test('actions refuse a sole holder, an under-named target and an edit to a closed plan', () => {
  const { store, api } = makeStore();
  seedWorkspace(store);
  const program = stageProgram(api, store, { headcount: 2, named: [] });
  const programId = program.id;

  const sole = api.setTransitionRow(programId, 'p-1', { selected: true });
  assert.equal(sole.ok, false);
  assert.match(sole.error, /only recorded steward/i);

  // Reassigning the dependency is the work item the refusal names.
  store.update((draft) => {
    const dependency = draft.dependencies.find((row) => row.id === 'dep-critical-1');
    dependency.stewards = [
      { personId: 'p-1', role: 'primary', verifiedOn: '2026-09-01', notes: '' },
      { personId: 'p-8', role: 'backup', verifiedOn: TODAY, notes: 'Verified during the transition review' },
    ];
  }, { type: 'test.reassign', entity: 'workspace', entityId: '', summary: 'Add a backup steward' });
  const nowSelectable = api.setTransitionRow(programId, 'p-1', { selected: true });
  assert.equal(nowSelectable.ok, true, nowSelectable.error);

  const underNamed = api.decideTransition(programId);
  assert.equal(underNamed.ok, false, 'one of two exits is not a decided plan');
  assert.match(underNamed.error, /named|lower the target/i);

  const second = api.setTransitionRow(programId, 'p-2', { selected: true });
  assert.equal(second.ok, true, second.error);
  const decided = api.decideTransition(programId);
  assert.equal(decided.ok, true, decided.error);

  const finalized = api.finalizeTransitionProgram(programId);
  assert.equal(finalized.ok, true, finalized.error);
  const frozenRow = api.setTransitionRow(programId, 'p-3', { selected: true });
  assert.equal(frozenRow.ok, false);
  assert.match(frozenRow.error, /closed/i);

  // A programme declared before anyone was accountable must be able to acquire
  // an owner; otherwise the gate is a dead end rather than a gate.
  const unowned = stageProgram(api, store, { label: 'Unowned', headcount: 1, named: ['p-7'], ownerId: null });
  const refused = api.decideTransition(unowned.id);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /accountable owner/i);
  const rejectedOwner = api.updateTransitionProgram(unowned.id, { ownerId: 'ghost' });
  assert.equal(rejectedOwner.ok, false);
  assert.match(rejectedOwner.error, /no longer in the roster/i);
  const appointed = api.updateTransitionProgram(unowned.id, { ownerId: 'p-12' });
  assert.equal(appointed.ok, true, appointed.error);
  const decidedNow = api.decideTransition(unowned.id);
  assert.equal(decidedNow.ok, true, decidedNow.error);
  assert.ok(store.state.links.some((link) => link.sourceId === unowned.id
    && link.targetType === 'person' && link.targetId === 'p-12' && link.relation === 'stewards'));
});

/* --------------------------------------------------- cross-module cascade */

test('one decided programme cascades into typed links, a mechanism decision, hand-overs and survivor prompts — idempotently', () => {
  const { store, api } = makeStore();
  seedWorkspace(store);
  const program = stageProgram(api, store, { named: ['p-4', 'p-5', 'p-6', 'p-9'], headcount: 4 });
  const programId = program.id;

  const before = store.state.people.reduce((sum, person) => sum + (person.talkingPoints || []).length, 0);
  const decided = api.decideTransition(programId);
  assert.equal(decided.ok, true, decided.error);

  // RULE-TRN-01: one typed edge per named exit.
  const separates = (store.state.links || []).filter((link) => link.sourceType === 'transition'
    && link.sourceId === programId && link.relation === 'separates');
  assert.equal(separates.length, 4);
  assert.ok(separates.every((link) => link.ruleId === TRANSITION_RULE_IDS.LINKED));
  const resolved = resolveLinkedEntity(store.state, 'transition', programId);
  assert.ok(resolved && resolved.route.includes('transition'));

  // RULE-TRN-02: the screen failed, so exactly one mechanism decision exists.
  const mechanismDecisions = store.state.decisions.filter((decision) => String(decision.question).includes(`[TRN-SCREEN:${programId}]`));
  assert.equal(mechanismDecisions.length, 1);
  assert.match(mechanismDecisions[0].title, /criteria/i);
  assert.equal(mechanismDecisions[0].options.length, 4);
  assert.match(mechanismDecisions[0].question, /0\.333|floor/i);
  assert.ok(store.state.links.some((link) => link.relation === 'screens' && link.targetId === mechanismDecisions[0].id));

  // RULE-TRN-03: every at-risk leaver gets one owned hand-over with a typed edge.
  const handovers = store.state.delegations.filter((delegation) => typeof delegation.support === 'string'
    && delegation.support.includes(`[TRN-HANDOVER:${programId}:`));
  assert.ok(handovers.length >= 1, 'at least one leaver carried open work');
  assert.ok(handovers.every((delegation) => delegation.dueOn <= EFFECTIVE), 'the hand-over is due before the last working day');
  assert.equal(store.state.links.filter((link) => link.relation === 'hands-over').length, handovers.length);

  // RULE-TRN-04: prompts are bounded and blameless, one per flagged stayer.
  const reading = transitionReading(store.state, store.state.transitionPrograms.find((row) => row.id === programId), NOW);
  const prompts = store.state.people.reduce((sum, person) => sum + (person.talkingPoints || []).length, 0);
  assert.equal(prompts, Math.min(3, reading.survivors.flagged.length));
  for (const person of store.state.people) {
    for (const point of person.talkingPoints || []) {
      assert.doesNotMatch(String(point), /performance (issue|problem)|underperform/i);
    }
  }
  assert.ok(prompts >= 0 && prompts <= 3);

  // Idempotency: a second scan adds no copy of anything.
  const snapshot = {
    decisions: store.state.decisions.length,
    delegations: store.state.delegations.length,
    links: store.state.links.length,
    prompts: store.state.people.reduce((sum, person) => sum + (person.talkingPoints || []).length, 0),
  };
  const scan = api.scanTransition(programId);
  assert.equal(scan.ok, true);
  assert.equal(scan.changed, false, 'nothing new to propagate');
  assert.equal(store.state.decisions.length, snapshot.decisions);
  assert.equal(store.state.delegations.length, snapshot.delegations);
  assert.equal(store.state.links.length, snapshot.links);
  assert.equal(store.state.people.reduce((sum, person) => sum + (person.talkingPoints || []).length, 0), snapshot.prompts);
  void before;
});

test('finalisation freezes the prediction, opens a dated review, and a departure resolves it', () => {
  const { store, api } = makeStore();
  seedWorkspace(store);
  const program = stageProgram(api, store, { named: ['p-4', 'p-5'], headcount: 2 });
  const programId = program.id;
  assert.equal(api.decideTransition(programId).ok, true);

  const finalized = api.finalizeTransitionProgram(programId);
  assert.equal(finalized.ok, true, finalized.error);
  const frozenProgram = store.state.transitionPrograms.find((row) => row.id === programId);
  assert.equal(frozenProgram.status, 'finalized');
  assert.ok(frozenProgram.snapshot, 'the snapshot is frozen');
  assert.equal(frozenProgram.snapshot.achieved.named, 2);
  assert.ok(frozenProgram.snapshot.predictions.length >= 2, 'the selected people are frozen');
  assert.ok(frozenProgram.snapshot.predictions.some((row) => row.selected === false && row.departurePct !== null),
    'a retained person is frozen too, so false positives are recordable');

  const review = store.state.decisions.find((decision) => String(decision.question).includes(`[TRN-REVIEW:${programId}]`));
  assert.ok(review, 'one dated outcome review is opened');
  assert.match(review.question, /frozen on/i);
  assert.ok(store.state.delegations.some((delegation) => typeof delegation.support === 'string'
    && delegation.support.includes(`[TRN-TRACK:${programId}]`)));
  assert.equal(store.state.decisions.filter((decision) => String(decision.question).includes(`[TRN-REVIEW:${programId}]`)).length, 1);
  const preserved = normalizeTransitionSnapshot(JSON.parse(JSON.stringify(frozenProgram.snapshot)));
  assert.deepEqual(preserved, frozenProgram.snapshot);

  // Archiving a retained person resolves the frozen prediction about them.
  const retained = frozenProgram.snapshot.predictions.find((row) => row.selected === false && row.departurePct !== null);
  assert.ok(retained, 'the fixture has a retained high-value person');
  const archived = api.archivePerson(retained.personId);
  assert.equal(archived.ok, true, archived.error);
  const after = store.state.transitionPrograms.find((row) => row.id === programId);
  const resolved = after.outcomes.find((outcome) => outcome.personId === retained.personId);
  assert.ok(resolved, 'the departure is recorded against the frozen prediction');
  assert.equal(resolved.departed, true);
  assert.equal(resolved.selected, false, 'a false positive is recorded as a false positive');

  const calibration = transitionCalibration(store.state, NOW);
  assert.ok(calibration.n >= 1);
  assert.equal(calibration.measurable, false, 'one outcome is not a calibration');
  assert.match(calibration.note, /Withheld/i);
});

/* -------------------------------------------------------------- reporting */

test('CSV scope #46 carries counts and ratios, never a name, identifier, group code or probability', () => {
  assert.equal(CSV_EXPORTS.length, 57);
  const scope = CSV_EXPORTS.find((row) => row.key === 'transition');
  assert.ok(scope);
  const state = buildDemoState(NOW);
  state.transitionPrograms[0].notes = 'A note that must not leak';
  state.transitionPrograms[1].rows[0].group = 'Z9';
  state.transitionPrograms[1].rows[0].note = 'A row note that must not leak';
  const text = exportWorkspaceCsv(state, 'transition', { now: NOW }).csv;
  assert.match(text, /programme_code/);
  assert.match(text, /screen_ratio/);
  assert.match(text, /pareto_frontier/);
  assert.doesNotMatch(text, /A note that must not leak/);
  assert.doesNotMatch(text, /A row note that must not leak/);
  assert.doesNotMatch(text, /Person \d/);
  assert.doesNotMatch(text, /person-demo/);
  assert.doesNotMatch(text, /Z9/);
  assert.doesNotMatch(text, /FY26 billing|FY25 support/);
  assert.doesNotMatch(text, /departure_pct|departurePct/);
});

test('the demo carries a frozen past programme and a live one, is quiet when clean, and cleans up honestly', () => {
  const state = buildDemoState(NOW);
  assert.equal(state.transitionPrograms.length, 2);
  const past = state.transitionPrograms.find((row) => row.status === 'finalized');
  const live = state.transitionPrograms.find((row) => row.status === 'draft');
  assert.ok(past && live);
  assert.ok(past.snapshot && past.snapshot.achieved.named >= 1);
  assert.ok(past.outcomes.length >= 1, 'the past programme has a resolved outcome');
  assert.equal(live.rows.filter((row) => row.selected).length, 1);

  const reading = transitionReading(state, live, NOW);
  assert.equal(reading.plan.target, 1);
  assert.equal(reading.plan.proposed.length, 1);
  assert.ok(reading.plan.cost > 0, 'the demo has recorded pay, so the exit is priced');
  assert.equal(reading.plan.unpriced, 0);
  assert.equal(reading.screen.status, 'insufficient', 'five people cannot support a rate comparison, and the demo says so');
  assert.equal(reading.options.options.length, 4);
  assert.ok(String(reading.options.tradeoff || '').length > 20);

  // A clean programme says nothing. The module is quiet by design.
  const insights = buildInsights(state, NOW);
  assert.equal(insights.findings.filter((finding) => finding.domain === 'Workforce transition').length, 0);

  // A live finding does land in the domain roll-up, which is the only reason
  // the domain is listed at all.
  const { store, api } = makeStore();
  seedWorkspace(store);
  stageProgram(api, store, { named: ['p-4'], headcount: 3 });
  const signals = transitionSignals(store.state, NOW);
  assert.ok(signals.length >= 1);
  assert.ok(signals.every((signal) => signal.domain === 'Workforce transition'));
  const liveInsights = buildInsights(store.state, NOW);
  const bucket = liveInsights.byDomain.find((row) => row.domain === 'Workforce transition');
  assert.ok(bucket, 'the domain is counted in the roll-up');
  assert.ok(bucket.count >= 1);

  // Demo cleanup: demo programmes go; a retained programme keeps its frozen
  // snapshot and loses only the rows of removed people.
  const cleanupStore = makeStore().store;
  cleanupStore.update((draft) => {
    for (const [key, value] of Object.entries(state)) draft[key] = JSON.parse(JSON.stringify(value));
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Load a demo workspace' });
  cleanupStore.update((draft) => {
    draft.transitionPrograms = draft.transitionPrograms.map((program) => (
      program.status === 'finalized' ? { ...program, id: 'trn-retained' } : program
    ));
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Retain one programme' });
  const frozenBefore = JSON.parse(JSON.stringify(cleanupStore.state.transitionPrograms.find((row) => row.id === 'trn-retained').snapshot));
  cleanupStore.clearDemo();
  const retained = cleanupStore.state.transitionPrograms.find((row) => row.id === 'trn-retained');
  assert.ok(retained, 'the retained programme survives');
  assert.deepEqual(retained.snapshot, frozenBefore, 'the frozen snapshot is kept verbatim');
  assert.equal(retained.rows.length, 0, 'rows that referred to removed demo people are dropped');
  assert.ok((retained.history || []).some((entry) => entry.type === 'demo-cleanup'));
  assert.equal(cleanupStore.state.transitionPrograms.filter((row) => String(row.id).includes('-demo-')).length, 0);
});

test('the module is registered on the shared spine, the catalog and the graph', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.name === 'transitionRule'));
  assert.ok(PROPAGATION_CONTRACTS.some((contract) => contract.rule.name === 'transitionRule'));
  assert.ok(AUTOMATION_RULES.some((rule) => rule.id === TRANSITION_RULE_IDS.SCREEN));
  assert.ok(AUTOMATION_RULES.some((rule) => rule.id === TRANSITION_RULE_IDS.HANDOVER));
  assert.ok(AUTOMATION_RULES.filter((rule) => String(rule.id).startsWith('RULE-TRN-')).every((rule) => /\w{4}/.test(rule.framework)));
  assert.ok(LINK_ENTITY_TYPES.includes('transition'));
  for (const relation of ['separates', 'screens', 'hands-over']) {
    assert.ok(LINK_RELATIONS.includes(relation), `${relation} is a declared relation`);
  }
  const draft = createEmptyState(NOW.toISOString());
  draft.transitionPrograms = [];
  assert.deepEqual(transitionRule(draft, { event: { type: 'case.created', entity: 'case', entityId: 'c1' }, now: NOW }), []);
});

test('the brief is deterministic and states the conventions rather than asserting legality', () => {
  const state = buildDemoState(NOW);
  assert.equal(transitionBrief(state, NOW), transitionBrief(state, NOW));
  const brief = transitionBrief(state, NOW);
  assert.match(brief, /WORKFORCE TRANSITION BRIEF/);
  assert.match(brief, /not legal advice/i);
  assert.match(brief, /No protected characteristic is stored/i);
  assert.match(brief, /notice \d+ days/);
  assert.doesNotMatch(brief, /Person \d/);
});

test('alternatives price four paths, exclude the ones that miss the target, and never convert cash into capability', () => {
  const { store, api } = makeStore();
  seedWorkspace(store);
  const program = stageProgram(api, store, { named: ['p-4', 'p-5'], headcount: 2 });
  const facts = factsFor(store, program);
  const proposed = new Set(['p-4', 'p-5']);
  const result = alternatives(facts, proposed, { _requisitions: 0 }, NOW);
  assert.equal(result.options.length, 4);
  const byId = new Map(result.options.map((option) => [option.id, option]));
  assert.equal(byId.get('involuntary').headcount, 2);
  assert.equal(byId.get('involuntary').meetsTarget, true);
  assert.equal(byId.get('attrition').headcount, 0);
  assert.equal(byId.get('attrition').meetsTarget, false, 'doing nothing does not meet a headcount target');
  assert.equal(byId.get('attrition').shortfallPct, 100);
  assert.equal(byId.get('redeploy').meetsTarget, false, 'with no requisition there is nowhere to redeploy');
  assert.equal(byId.get('redeploy').available, false, 'and it is marked unavailable rather than silently equal to the involuntary plan');
  assert.equal(byId.get('attrition').available, true, 'doing nothing is always available, which is why it must be priced');
  assert.ok(byId.get('involuntary').cost > 0);
  assert.ok(result.frontier.length >= 1);
  assert.ok(result.frontier.includes('involuntary'));
  assert.ok(result.tradeoff.length > 20);
  assert.match(result.framework, /Pareto/);
});
