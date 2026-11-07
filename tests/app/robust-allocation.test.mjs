/**
 * ADR-0095, Schema v98 — the Robust Allocation Terminal.
 *
 * These are integration tests, not unit tests of a form. They prove that ONE
 * `robustAllocationAdopt` call, through the standard API gateway and the SHARED
 * post-commit spine, writes a governed DACI decision, one owned delivery task
 * per funded line, typed provenance and one `rolls-up-to` edge per leadership
 * ancestor in the SAME atomic transaction; that the exact integer solver prints
 * the Wald maximin and Savage minimax-regret plans, prices the equity floor and
 * refuses an over-cap or infeasible plan; that a linked prospective contract
 * graded below its threshold opens a governed re-allocation decision; that
 * altitudes above the declaring seat read the aggregate while a peer span reads
 * nothing; and that no name, title, plan id or currency amount survives into the
 * brief, the CSV or any renderer panel.
 *
 * Named frameworks exercised: Bertsimas–Sim (2004) budgeted uncertainty Γ,
 * Wald (1950) maximin, Savage (1951) minimax regret, exact scenario enumeration
 * (Goerigk–Lendl 2021 / Yaman 2023), a Rawlsian equity floor and its price of
 * fairness, Little capacity saturation, one-at-a-time break-even sensitivity,
 * Raiffa–Schlaifer value of information, the Wilson (1927) interval, Jaques'
 * time-span of discretion for the five altitude horizons, and small-cell
 * complementary suppression / fail-closed disclosure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv, serializeCsv } from '../../app/core/csv.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { activeSeat, buildSeats, canAct } from '../../app/core/domain/seat.js';
import { API_RIGHTS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { MODULE_MANIFESTS } from '../../app/core/domain/disclosureManifests.js';
import {
  LINK_ENTITY_COLLECTIONS, LINK_ENTITY_TYPES, LINK_RELATIONS,
  SYSTEM_GENERATED_LINK_RELATIONS, resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  buildRobustAllocationReport, enumerateFeasible, planState, robustAllocationBriefText,
  robustAllocationCsvRows, robustHash, solveRobustPlan, wilsonInterval,
} from '../../app/core/domain/robustAllocation.js';
import {
  ROBUST_ALLOCATION_ENGINE_VERSION, ROBUST_ALLOCATION_PLAYBOOK, ROBUST_ALLOCATION_RULE_IDS,
} from '../../app/core/domain/robustAllocationRegistry.js';
import {
  normalizeRobustPlan, normalizeRobustPlans, normalizeRobustAllocationSettings,
  robustAllocationConventions, validateRobustAllocationDeclaration,
} from '../../app/core/domain/robustAllocationSchema.js';
import { renderRobustAllocation } from '../../app/views/robustAllocation.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const AFTER = new Date('2026-11-19T12:00:00.000Z');
const clone = (value) => JSON.parse(JSON.stringify(value));
const NAMES = ['Vera Executive', 'Dana Director', 'Mira Manager', 'Malik Manager', 'Lee Lead', 'Pat Lead', 'Ira Analyst', 'Ida Analyst'];
const TITLE = 'SENTINEL-PLAN-TITLE-NEVER-EXPORTS';
const CASE_TITLE = 'SENTINEL-CASE-TITLE-NEVER-EXPORTS';

/** A five-altitude tree with two sibling branches, so a peer span is testable. */
function tree({ activeSeatId = null, settings = {} } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, chainLeaderAltitude: 'chief', activeSeatId, ...settings };
  for (const key of Object.keys(state.settings)) if (key.endsWith('AutoPropagate')) state.settings[key] = false;
  state.settings.prospectiveAutoPropagate = true;
  state.settings.robustAllocationAutoPropagate = true;
  state.people = [
    { id: 'vp1', name: 'Vera Executive', role: 'VP', level: 'vp', team: 'Ops', status: 'active' },
    { id: 'dir1', name: 'Dana Director', role: 'Director', level: 'director', team: 'Ops', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mira Manager', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active' },
    { id: 'mgr2', name: 'Malik Manager', role: 'Manager', level: 'manager', team: 'Claims', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', team: 'Billing', managerId: 'mgr1', status: 'active' },
    { id: 'lead2', name: 'Pat Lead', role: 'Lead', level: 'lead', team: 'Claims', managerId: 'mgr2', status: 'active' },
    { id: 'ic1', name: 'Ira Analyst', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Ida Analyst', role: 'Analyst', level: 'ic', team: 'Claims', managerId: 'lead2', status: 'active' },
  ];
  state.cases = ['a', 'b', 'c', 'd'].map((letter) => ({
    id: `case-${letter}`,
    title: `${CASE_TITLE}-${letter}`,
    status: 'open',
    openedOn: '2026-10-01',
    personId: 'lead1',
    ownerId: 'lead1',
    severity: 'medium',
    createdAt: NOW.toISOString(),
  }));
  return state;
}

function normalize(state) {
  return normalizeState(state, { now: NOW }).state;
}

function harness(state = tree({ activeSeatId: 'lead1' })) {
  const seeded = normalize(state);
  seeded.settings.activeSeatId = state.settings.activeSeatId;
  const values = new Map([[STORAGE_KEY, JSON.stringify(seeded)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let current = NOW;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-ral-${++seq}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { store, api, setNow: (value) => { current = value; }, values };
}

const linkRows = (state, sourceType, relation = null) => (state.links || []).filter((l) => l
  && l.sourceType === sourceType && (!relation || l.relation === relation));

/** A small, honest declaration the solver can enumerate exactly. */
function declaration(overrides = {}) {
  return {
    title: TITLE,
    outcomeLabel: 'on-time completions',
    currency: 'EUR',
    budgetCap: 100,
    hoursCap: 40,
    horizonDays: 14,
    gamma: 1,
    segments: [
      { key: 'seg-a', label: 'Billing queue', size: 10, floorCoverage: 2 },
      { key: 'seg-b', label: 'Claims queue', size: 10, floorCoverage: 0 },
    ],
    actions: [
      { key: 'x', label: 'Coaching block', segmentKey: 'seg-a', unitCost: 10, unitHours: 5, unitCoverage: 1, effectLo: 2, effectHi: 6, maxUnits: 4 },
      { key: 'y', label: 'Process fix', segmentKey: 'seg-b', unitCost: 10, unitHours: 5, unitCoverage: 1, effectLo: 1, effectHi: 8, maxUnits: 4 },
      { key: 'z', label: 'Tooling rollout', segmentKey: 'seg-a', unitCost: 20, unitHours: 8, unitCoverage: 2, effectLo: 3, effectHi: 5, maxUnits: 3 },
    ],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ schema */

test('Schema v98 migrates additively: empty ledgers, declared conventions, nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 115);
  const migrated = migrate({ schemaVersion: 96, settings: { leaderName: 'Keep this' }, cases: [{ id: 'x' }] });
  assert.deepEqual(migrated.applied, ['96 → 97', '97 → 98', '98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113', '113 → 114', '114 → 115']);
  assert.equal(migrated.raw.schemaVersion, 115);
  assert.deepEqual(migrated.raw.robustPlans, []);
  assert.deepEqual(migrated.raw.robustMarkers, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep this');
  assert.equal(migrated.raw.settings.robustAllocationCellFloor, 4);
  assert.equal(migrated.raw.settings.robustAllocationReviewDays, 14);
  assert.equal(migrated.raw.settings.robustAllocationAutoPropagate, true);
  assert.equal(migrated.raw.settings.robustAllocationMaxCombinations, 50000);
  for (const key of ['robustPlans', 'robustMarkers']) {
    assert.ok(createEmptyState()[key], `${key} is a collection`);
  }
});

test('the persistence boundary clamps conventions and drops malformed plans with warnings', () => {
  const settings = normalizeRobustAllocationSettings({ robustAllocationCellFloor: 999, robustAllocationReviewDays: -3, robustAllocationMaxCombinations: 'abc', robustAllocationAutoPropagate: false });
  assert.equal(settings.robustAllocationCellFloor, 20);
  assert.equal(settings.robustAllocationReviewDays, 1);
  assert.equal(settings.robustAllocationMaxCombinations, 50000);
  assert.equal(settings.robustAllocationAutoPropagate, false);
  assert.equal(robustAllocationConventions({}).robustAllocationCellFloor, 4);
  const warnings = [];
  const good = normalizeRobustPlan({ ...declaration(), id: 'ok', declaredOn: '2026-11-04', horizonOn: '2026-11-18', scopeSeatId: 'lead1', altitudeKey: 'frontline', rank: 1, status: 'draft' });
  assert.ok(good);
  const plans = normalizeRobustPlans([
    good,
    { id: 'bad', declaredOn: '2026-11-04', horizonOn: '2026-11-18', segments: [], actions: [] },
    { ...good, id: 'ok' },
    { ...good, id: 'adopted-no-frozen', status: 'adopted', frozen: null },
  ], warnings);
  assert.equal(plans.length, 1, 'an empty plan, a duplicate id and an adopted plan with no frozen solution are dropped, never repaired');
  assert.ok(warnings.length >= 3);
});

test('the declaration validator refuses bad currency, infeasible floors, duplicate keys and bad ranges', () => {
  assert.equal(validateRobustAllocationDeclaration(declaration({ currency: 'EURO' })).ok, false);
  assert.equal(validateRobustAllocationDeclaration(declaration({ gamma: 99 })).ok, false);
  assert.equal(validateRobustAllocationDeclaration(declaration({ horizonDays: 3 })).ok, false);
  assert.equal(validateRobustAllocationDeclaration(declaration({ title: '' })).ok, false);
  const dup = declaration();
  dup.actions[1].key = dup.actions[0].key;
  assert.equal(validateRobustAllocationDeclaration(dup).ok, false);
  const badRange = declaration();
  badRange.actions[0].effectHi = 1; // hi < lo
  assert.equal(validateRobustAllocationDeclaration(badRange).ok, false);
  const orphanFloor = declaration();
  orphanFloor.segments[1].floorCoverage = 5; // seg-b floor but no action serves seg-b? y serves seg-b, so reachable
  orphanFloor.segments.push({ key: 'seg-c', label: 'Empty', size: 5, floorCoverage: 2 });
  assert.equal(validateRobustAllocationDeclaration(orphanFloor).ok, false, 'a floor no action can serve is infeasible');
  const good = validateRobustAllocationDeclaration(declaration({ title: '  Honest plan  ' }));
  assert.equal(good.ok, true);
  assert.equal(good.declaration.title, 'Honest plan');
});

/* -------------------------------------------------------- exact solver */

test('the solver is exact: Wald maximin, Savage minimax regret and the optimist’s worst case', () => {
  const plan = { ...declaration(), id: 'p', declaredOn: '2026-11-04', horizonOn: '2026-11-18' };
  const s = solveRobustPlan(plan, { maxCombinations: 50000 });
  assert.equal(s.ok, true, s.reason);
  // Hand-verified: robust [4,2,1] → nominal 45, worst 45 − max(16,14,2) = 29.
  assert.deepEqual(s.robustUnits, [4, 2, 1]);
  assert.equal(s.robustWorstCase, 29);
  assert.equal(s.robustOptimistic, 45);
  assert.equal(s.robustMaxRegret, 13);
  // The optimist funds [4,4,0] (nominal 56) but its worst case is only 28.
  assert.deepEqual(s.optimisticUnits, [4, 4, 0]);
  assert.equal(s.optimisticWorstCase, 28);
  // Minimax regret never exceeds the robust plan’s own regret.
  assert.ok(s.minimaxMaxRegret <= s.robustMaxRegret);
  assert.equal(s.minimaxMaxRegret, 6);
  assert.equal(s.committedHours, 38);
  assert.equal(s.committedBudget, 80);
  assert.ok(s.feasibleN > 0 && s.scenariosN === 3, 'Γ=1 over 3 actions is 3 scenario problems');
  // Constraints hold exactly.
  assert.ok(s.committedBudget <= plan.budgetCap && s.committedHours <= plan.hoursCap);
});

test('the equity floor is priced: a binding Rawlsian floor costs worst-case value', () => {
  const plan = {
    id: 'f', declaredOn: '2026-11-04', horizonOn: '2026-11-18',
    budgetCap: 50, hoursCap: 100, gamma: 1,
    segments: [{ key: 'a', label: 'A', size: 10, floorCoverage: 0 }, { key: 'b', label: 'B', size: 10, floorCoverage: 3 }],
    actions: [
      { key: 'p', label: 'P', segmentKey: 'a', unitCost: 10, unitHours: 1, unitCoverage: 1, effectLo: 5, effectHi: 5, maxUnits: 5 },
      { key: 'q', label: 'Q', segmentKey: 'b', unitCost: 10, unitHours: 1, unitCoverage: 1, effectLo: 1, effectHi: 1, maxUnits: 5 },
    ],
  };
  const s = solveRobustPlan(plan, { maxCombinations: 50000 });
  assert.equal(s.ok, true);
  assert.deepEqual(s.robustUnits, [2, 3], 'the floor forces 3 units into the low-effect segment');
  assert.equal(s.robustWorstCase, 13);
  assert.equal(s.priceOfFairness, 12, 'unconstrained worst case 25 minus constrained 13');
});

test('sensitivity names a stress switch and value of information releases exact regret', () => {
  const plan = {
    id: 'v', declaredOn: '2026-11-04', horizonOn: '2026-11-18',
    budgetCap: 40, hoursCap: 40, gamma: 2,
    segments: [{ key: 's', label: 'S', size: 20, floorCoverage: 0 }],
    actions: [
      { key: 'act0', label: 'A0', segmentKey: 's', unitCost: 10, unitHours: 1, unitCoverage: 1, effectLo: 0, effectHi: 9, maxUnits: 3 },
      { key: 'act1', label: 'A1', segmentKey: 's', unitCost: 10, unitHours: 1, unitCoverage: 1, effectLo: 2, effectHi: 5, maxUnits: 3 },
      { key: 'act2', label: 'A2', segmentKey: 's', unitCost: 10, unitHours: 1, unitCoverage: 1, effectLo: 1, effectHi: 7, maxUnits: 3 },
    ],
  };
  const s = solveRobustPlan(plan, { maxCombinations: 50000 });
  assert.equal(s.ok, true);
  assert.equal(s.minimaxMaxRegret, 14);
  assert.equal(s.topExposureAction, 'act0');
  assert.equal(s.regretRelease, 10, 'resolving the widest range releases 10 units of maximum regret');
  assert.ok(s.regretRelease <= s.minimaxMaxRegret);
  assert.ok(Array.isArray(s.stressSwitches));
  for (const key of s.stressSwitches) assert.ok(plan.actions.some((a) => a.key === key));
});

test('an over-cap grid falls to the certified branch-and-bound; out-of-regime and infeasible plans are REFUSED, never approximated', () => {
  const big = {
    id: 'b', declaredOn: '2026-11-04', horizonOn: '2026-11-18',
    budgetCap: 100000, hoursCap: 100000, gamma: 3,
    segments: [{ key: 'a', label: 'A', size: 1000, floorCoverage: 0 }],
    actions: Array.from({ length: 5 }, (_, i) => ({ key: `a${i}`, label: `A${i}`, segmentKey: 'a', unitCost: 1, unitHours: 1, unitCoverage: 1, effectLo: 1, effectHi: 5, maxUnits: 8 })),
  };
  // ADR-0097: a 9^5 = 59,049 grid no longer refuses — the certified
  // branch-and-bound proves the same values the enumerator proves.
  const over = solveRobustPlan(big, { maxCombinations: 50000 });
  assert.equal(over.ok, true);
  assert.equal(over.certificate.engine, 'branch-and-bound');
  assert.equal(over.certificate.certified, true);
  assert.ok(over.certificate.nodes > 0 && over.certificate.nodes <= 250000);
  const truth = solveRobustPlan(big, { maxCombinations: 10000000 });
  for (const key of ['robustUnits', 'robustWorstCase', 'minimaxUnits', 'minimaxMaxRegret', 'optimisticUnits', 'optimisticWorstCase', 'priceOfFairness', 'regretRelease']) {
    assert.deepEqual(over[key], truth[key], `branch-and-bound matches enumeration on ${key}`);
  }
  // An exhausted node budget refuses the whole solve, never approximates.
  const starved = solveRobustPlan(big, { maxCombinations: 50000, nodeBudget: 25000 });
  if (!starved.ok) assert.match(starved.reason, /node budget/);
  const infeasible = {
    id: 'i', declaredOn: '2026-11-04', horizonOn: '2026-11-18',
    budgetCap: 5, hoursCap: 100, gamma: 0,
    segments: [{ key: 'a', label: 'A', size: 10, floorCoverage: 5 }],
    actions: [{ key: 'p', label: 'P', segmentKey: 'a', unitCost: 10, unitHours: 1, unitCoverage: 1, effectLo: 5, effectHi: 5, maxUnits: 5 }],
  };
  const inf = solveRobustPlan(infeasible, { maxCombinations: 50000 });
  assert.equal(inf.ok, false);
  assert.match(inf.reason, /No feasible allocation/);
  // The enumerator itself respects the bound before doing any work.
  assert.equal(enumerateFeasible(big, { maxCombinations: 50000 }).ok, false);
  // Beyond the certified regime (unit sum above 40 — reachable at 6×8), the refusal stands.
  const huge = { ...big, actions: [...big.actions, { key: 'a6', label: 'A6', segmentKey: 'a', unitCost: 1, unitHours: 1, unitCoverage: 1, effectLo: 1, effectHi: 5, maxUnits: 8 }] };
  const out = solveRobustPlan(huge, { maxCombinations: 100, nodeBudget: 2000000 });
  assert.equal(out.ok, false);
  assert.match(out.reason, /unit sum|scenario|refus/i);
});

test('Wilson interval and the hash helper are deterministic and refusal-honest', () => {
  assert.ok(Math.abs(wilsonInterval(3, 4).pct - 75) < 0.01);
  assert.equal(wilsonInterval(0, 0).refused, true);
  assert.equal(robustHash('a|b'), robustHash('a|b'));
  assert.notEqual(robustHash('a|b'), robustHash('a|c'));
});

/* ------------------------------------------- cross-module + vertical spine */

test('ONE adoption writes a decision, one task per funded line and typed provenance through the SHARED spine', () => {
  const { store, api } = harness();
  const declared = api.robustAllocationDeclare(declaration());
  assert.equal(declared.ok, true, declared.error);
  const planId = declared.id;
  assert.equal(store.state.robustPlans.length, 1);
  assert.equal(store.state.robustPlans[0].status, 'draft');
  assert.equal(store.state.decisions.length, 0, 'a draft opens no governed work');
  const before = { decisions: store.state.decisions.length, delegations: store.state.delegations.length, links: store.state.links.length };
  const adopted = api.robustAllocationAdopt(planId);
  assert.equal(adopted.ok, true, adopted.error);
  assert.equal(adopted.saved, true);
  const state = store.state;
  assert.equal(state.robustPlans[0].status, 'adopted');
  assert.ok(state.robustPlans[0].frozen, 'the solution is frozen at adoption');
  assert.deepEqual(state.robustPlans[0].frozen.robustUnits, [4, 2, 1]);
  const funded = state.robustPlans[0].frozen.robustUnits.filter((u) => u > 0).length;
  assert.equal(state.decisions.length, before.decisions + 1, 'RULE-RAL-01 opened one governed DACI decision');
  assert.equal(state.delegations.length, before.delegations + funded, 'one owned delivery task per funded line');
  const decision = state.decisions.at(-1);
  assert.match(decision.rationale, /RULE-RAL-01/);
  assert.equal(decision.chosen, '', 'the engine never approves the commitment');
  assert.equal(decision.outcome, 'pending');
  assert.equal(linkRows(state, 'robustplan', 'allocates').length, 1);
  assert.equal(linkRows(state, 'robustplan', 'consumes-capacity').length, funded);
  assert.equal(state.robustMarkers.filter((m) => m.kind === 'adopted').length, 1);
  assert.ok(state.links.length > before.links + funded + 1, 'typed edges were written in the same transaction');
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.name === 'robustAllocationRule'));
  assert.ok(PROPAGATION_CONTRACTS.some((c) => c.rule.name === 'robustAllocationRule'));
  assert.ok(state.events.some((e) => e.type === 'robustAllocation.adopted'), 'the action history is append-only and meaningful');
});

test('the roll-up is REAL: every leadership ancestor gets a typed edge; a peer span reads nothing', () => {
  const { store, api } = harness();
  const declared = api.robustAllocationDeclare(declaration());
  api.robustAllocationAdopt(declared.id);
  const state = store.state;
  const rolled = linkRows(state, 'robustplan', 'rolls-up-to').map((l) => l.targetId);
  assert.deepEqual([...rolled].sort(), ['dir1', 'mgr1', 'vp1'], 'frontline → manager → director → VP in ONE atomic write');
  for (const targetId of rolled) {
    assert.ok(resolveLinkedEntity(state, 'person', targetId), `${targetId} is a real navigation target`);
  }
  const atDirector = clone(state);
  atDirector.settings.activeSeatId = 'dir1';
  const directorReport = buildRobustAllocationReport(atDirector, { now: NOW });
  assert.equal(directorReport.summary.adopted, 1);
  assert.equal(directorReport.seat.rank, 3);
  assert.equal(directorReport.detailAllowed, false, 'a director reads the span, never the local title');
  assert.equal(directorReport.rows[0].title, '', 'the title never travels upward');
  const atPeer = clone(state);
  atPeer.settings.activeSeatId = 'lead2';
  const peerReport = buildRobustAllocationReport(atPeer, { now: NOW });
  assert.equal(peerReport.summary.plans, 0, 'no sideways leakage across sibling spans');
  const atLead = buildRobustAllocationReport(state, { now: NOW });
  assert.equal(atLead.coverage.refused, true);
  assert.match(atLead.coverage.reason, /withheld below director rank/);
  assert.equal(atLead.rows[0].title, TITLE, 'the declaring altitude may read its own title');
});

test('a falsified linked premise opens ONE governed re-allocation decision per plan per ISO week', () => {
  const { store, api, setNow } = harness();
  // Pre-register a bet over the four cases, then link an allocation to it.
  const bet = api.prospectiveDeclare({ instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, horizonDays: 14, title: 'Linked bet' });
  assert.equal(bet.ok, true, bet.error);
  const declared = api.robustAllocationDeclare(declaration({ linkedContractId: bet.id }));
  api.robustAllocationAdopt(declared.id);
  assert.equal(linkRows(store.state, 'robustplan', 'rests-on').length, 1, 'the allocation rests on the pre-registered bet');
  setNow(AFTER);
  // Close only ONE of four cases → reached 1/4 = 25% < 50% threshold → outcome 0.
  store.update((draft) => {
    draft.cases[0].status = 'closed';
    draft.cases[0].resolvedOn = '2026-11-10';
  }, { type: 'case.updated', entity: 'case', entityId: 'case-a', summary: 'closed one case' });
  api.prospectiveScan();
  const grade = store.state.prospectiveGrades.find((g) => g.contractId === bet.id);
  assert.ok(grade && grade.outcome === 0, 'the linked premise was falsified out of sample');
  const before = store.state.decisions.filter((d) => /RULE-RAL-02/.test(d.rationale || '')).length;
  api.robustAllocationScan();
  const findings = store.state.decisions.filter((d) => /RULE-RAL-02/.test(d.rationale || ''));
  assert.equal(findings.length, before + 1, 'one governed re-allocation decision opened');
  assert.equal(planState(store.state, store.state.robustPlans[0], { today: '2026-11-19', reviewDays: 14 }), 'falsified');
  // Idempotent within the same ISO week.
  api.robustAllocationScan();
  assert.equal(store.state.decisions.filter((d) => /RULE-RAL-02/.test(d.rationale || '')).length, findings.length, 'marker-idempotent per ISO week');
});

test('an overdue funded line and an ungraded premise each open one bounded governed decision', () => {
  const { store, api, setNow } = harness();
  const declared = api.robustAllocationDeclare(declaration());
  api.robustAllocationAdopt(declared.id);
  setNow(new Date('2026-12-20T12:00:00.000Z')); // well past horizon + review
  api.robustAllocationScan();
  assert.ok(store.state.decisions.some((d) => /RULE-RAL-03/.test(d.rationale || '')), 'overdue delivery-integrity decision');
  assert.equal(planState(store.state, store.state.robustPlans[0], { today: '2026-12-20', reviewDays: 14 }), 'overdue');
  // A linked but never-graded contract past its window is an evidence-integrity finding.
  const { store: s2, api: a2, setNow: set2 } = harness();
  const bet = a2.prospectiveDeclare({ instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, horizonDays: 14, title: 'Ungraded bet' });
  const d2 = a2.robustAllocationDeclare(declaration({ linkedContractId: bet.id }));
  a2.robustAllocationAdopt(d2.id);
  set2(new Date('2026-12-20T12:00:00.000Z'));
  a2.robustAllocationScan();
  assert.ok(s2.state.decisions.some((d) => /RULE-RAL-04/.test(d.rationale || '')), 'ungraded evidence-integrity decision');
});

test('a reload preserves the frozen plan and every typed edge with zero repair warnings', () => {
  const { store, api, values } = harness();
  const declared = api.robustAllocationDeclare(declaration());
  api.robustAllocationAdopt(declared.id);
  const persisted = JSON.parse(values.get(STORAGE_KEY));
  const reloaded = normalizeState(persisted, { now: NOW });
  assert.equal(reloaded.warnings.length, 0, 'no malformed row was invented or repaired');
  assert.equal(reloaded.state.robustPlans.length, 1);
  assert.equal(reloaded.state.robustPlans[0].status, 'adopted');
  assert.deepEqual(reloaded.state.robustPlans[0].frozen.robustUnits, [4, 2, 1]);
  assert.equal(linkRows(reloaded.state, 'robustplan', 'rolls-up-to').length, 3);
  assert.equal(linkRows(reloaded.state, 'robustplan', 'consumes-capacity').length, 3);
});

/* ---------------------------------------------------------- permissions */

test('permissions: declared rights, rank windows, refuse-unknown and director+ conventions', () => {
  assert.ok(ACTION_RIGHTS['declare-robust-allocation']);
  assert.equal(ACTION_RIGHTS['declare-robust-allocation'].minRank, 1);
  assert.equal(API_RIGHTS.robustAllocationDeclare, 'declare-robust-allocation');
  assert.equal(API_RIGHTS.robustAllocationAdopt, 'declare-robust-allocation');
  assert.equal(API_RIGHTS.robustAllocationSetConventions, 'declare-robust-allocation');
  assert.ok(RECORD_POLICIES.robustPlans);
  assert.equal(RECORD_POLICIES.robustPlans.detailCeiling, 0);
  const { store, api } = harness(tree({ activeSeatId: 'lead1' }));
  const built = buildSeats(store.state, { now: NOW, settings: store.state.settings });
  const lead = activeSeat(built);
  assert.equal(canAct('declare-robust-allocation', lead).allow, true);
  // A frontline lead cannot set the conventions that bound everyone below.
  const refused = api.robustAllocationSetConventions({ cellFloor: 5 });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /director rank/);
  // A director can.
  const atDir = harness(tree({ activeSeatId: 'dir1' }));
  const ok = atDir.api.robustAllocationSetConventions({ cellFloor: 5 });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(atDir.store.state.settings.robustAllocationCellFloor, 5);
  // An unresolved seat fails closed.
  const unresolved = harness(tree({ activeSeatId: 'nobody' }));
  assert.equal(unresolved.api.robustAllocationDeclare(declaration()).ok, false);
});

test('the five rule ids, the graph vocabulary and the propagation contract are all declared', () => {
  assert.deepEqual(Object.values(ROBUST_ALLOCATION_RULE_IDS), ['RULE-RAL-01', 'RULE-RAL-02', 'RULE-RAL-03', 'RULE-RAL-04', 'RULE-RAL-05']);
  assert.ok(LINK_ENTITY_TYPES.includes('robustplan'));
  assert.equal(LINK_ENTITY_COLLECTIONS.robustplan, 'robustPlans');
  // The types ↔ collections invariant the registry is audited against.
  for (const type of LINK_ENTITY_TYPES) {
    assert.ok(type in LINK_ENTITY_COLLECTIONS, `${type} has a collection mapping`);
  }
  for (const relation of ['allocates', 'consumes-capacity', 'rests-on', 'rolls-up-to']) {
    assert.ok(LINK_RELATIONS.includes(relation) || SYSTEM_GENERATED_LINK_RELATIONS.includes(relation), `${relation} is a declared relation`);
  }
  assert.ok(MODULE_MANIFESTS['robust-allocation'], 'the route has its own disclosure manifest row');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule.name === 'robustAllocationRule');
  assert.ok(contract);
  assert.ok(contract.writes.includes('robustMarkers'));
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, '1:1 rule/contract parity');
  assert.ok(ROBUST_ALLOCATION_PLAYBOOK.frontline && ROBUST_ALLOCATION_PLAYBOOK.chief);
});

/* ---------------------------------------------------- disclosure / leak oracle */

test('the brief, the CSV and all six renderer panels carry no name, title, plan id or amount', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  const { store, api } = harness();
  const declared = api.robustAllocationDeclare(declaration());
  api.robustAllocationAdopt(declared.id);
  const state = store.state;
  const planId = declared.id;
  const brief = robustAllocationBriefText(api.robustAllocationRead());
  const rows = robustAllocationCsvRows(api.robustAllocationRead());
  const csv = serializeCsv(['row_kind', 'altitude', 'rank', 'plans_n', 'adopted_n', 'funded_lines_n', 'committed_hours', 'falsified_n', 'overdue_n', 'ungraded_n', 'falsified_pct', 'interval_low_pct', 'interval_high_pct', 'refused', 'reason'], rows);
  const leaked = (text, { allowTitle = false } = {}) => {
    for (const name of NAMES) assert.ok(!text.includes(name), `never prints ${name}`);
    if (!allowTitle) assert.ok(!text.includes(TITLE), 'never prints the plan title');
    assert.ok(!text.includes(CASE_TITLE), 'never prints a cohort record title');
    assert.ok(!text.includes(planId), 'never prints a plan id');
    assert.ok(!text.includes('ral-'), 'never prints a ledger id');
    assert.ok(!/undefined|NaN/.test(text), 'no undefined or NaN cell');
  };
  leaked(brief);
  leaked(csv);
  leaked(JSON.stringify(rows));
  assert.ok(brief.includes('Wilson') || brief.includes('WITHHELD'), 'the brief states its interval or its refusal');
  assert.ok(brief.includes('never pooled across currencies'), 'the brief states the money boundary');
  for (const seatId of ['lead1', 'mgr1', 'dir1', 'vp1']) {
    const copy = clone(state);
    copy.settings.activeSeatId = seatId;
    const report = buildRobustAllocationReport(copy, { now: NOW, planId });
    for (const panel of ['desk', 'plans', 'solve', 'calibration', 'rollup', 'certificate']) {
      const node = renderRobustAllocation({
        state: copy,
        now: NOW,
        query: new URLSearchParams(`panel=${panel}&plan=${planId}`),
        navigate: () => {},
        refresh: () => {},
        api: {
          robustAllocationRead: () => report,
          robustAllocationDeclare: () => ({ ok: true }),
          robustAllocationAdopt: () => ({ ok: true }),
          robustAllocationScan: () => ({ ok: true }),
          robustAllocationSetConventions: () => ({ ok: true }),
          robustAllocationBriefText: () => ({ ok: true, text: brief }),
          robustAllocationCsvRows: () => ({ ok: true, rows }),
          prospectiveRead: () => ({ rows: [] }),
        },
      });
      assert.ok(node, `${panel} renders at ${seatId}`);
      const html = node.outerHTML;
      leaked(html, { allowTitle: report.detailAllowed });
      if (!report.detailAllowed) assert.ok(!html.includes(TITLE), `${panel} at ${seatId} never lifts a local title upward`);
      assert.equal(node.querySelectorAll('[role="tab"]').length, 6, 'six keyboard-reachable panel tabs');
      assert.ok(node.querySelector('h1') || node.querySelector('h2'), `${panel} has semantic headings`);
    }
  }
  delete globalThis.window;
  delete globalThis.document;
});

test('CSV scope #93 (with #94 reserved for Clearinghouse) is aggregate-only, refusal-honest and refuses an unknown scope', () => {
  assert.equal(CSV_EXPORTS.length, 103);
  const descriptor = CSV_EXPORTS.find((item) => item.key === 'robust-allocation');
  assert.ok(descriptor);
  assert.equal(descriptor.sensitive, false);
  const state = normalize(tree({ activeSeatId: 'dir1' }));
  state.settings.activeSeatId = 'dir1';
  state.robustPlans = [normalizeRobustPlan({ ...declaration(), id: 'plan-1', declaredOn: '2026-11-04', horizonOn: '2026-11-18', scopeSeatId: 'lead1', altitudeKey: 'frontline', rank: 1, status: 'draft' })].filter(Boolean);
  const out = exportWorkspaceCsv(state, 'robust-allocation', { now: NOW });
  assert.equal(out.ok, true, 'the declared scope is a real export, not an unknown scope');
  assert.ok(out.csv.includes('row_kind'));
  assert.ok(out.csv.includes('workspace'));
  assert.ok(!out.csv.includes(TITLE));
  assert.ok(!out.csv.includes('plan-1'));
  assert.ok(!out.csv.includes('EUR'), 'no currency amount is exported or pooled');
  const unknown = exportWorkspaceCsv(state, 'robust-allocation-not-a-scope');
  assert.equal(unknown.ok, false);
});

test('the graph resolver projects an adopted plan identity-free', () => {
  const { store, api } = harness();
  const declared = api.robustAllocationDeclare(declaration());
  api.robustAllocationAdopt(declared.id);
  const resolved = resolveLinkedEntity(store.state, 'robustplan', declared.id);
  assert.ok(resolved);
  assert.equal(resolved.type, 'robustplan');
  assert.ok(!resolved.title.includes(TITLE), 'the resolver never lifts the plan title');
  assert.ok(!JSON.stringify(resolved.raw).includes(TITLE));
  assert.match(resolved.route, /#\/robust-allocation\?panel=solve/);
});

test('an unresolved seat and an unknown method fail closed at the API boundary', () => {
  const unresolved = harness(tree({ activeSeatId: 'nobody' }));
  assert.equal(unresolved.api.robustAllocationScan().ok, false);
  const { api } = harness();
  assert.equal(typeof api.robustAllocationNotAMethod, 'undefined');
  // Adopting a plan outside the seat's span is refused.
  const peer = harness(tree({ activeSeatId: 'lead2' }));
  const owner = harness(tree({ activeSeatId: 'lead1' }));
  const declared = owner.api.robustAllocationDeclare(declaration());
  // Inject the owner's plan into the peer store, then try to adopt it from the peer seat.
  peer.store.update((draft) => { draft.robustPlans = clone(owner.store.state.robustPlans); }, { type: 'robustAllocation.declared', entity: 'robustplan', entityId: declared.id, summary: 'injected for boundary test' });
  const refused = peer.api.robustAllocationAdopt(declared.id);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /outside this seat/);
});
