// ADR-0193 — cross-line goal commitment conflicts.
//
// Two reporting lines can each promise the SAME person a dated slice of effort
// toward goals whose measures move in opposite directions, and nothing on the
// record used to say so. This suite holds the register to its doctrine:
//   * every figure printed is a figure computed from the declarations, the
//     goals and the ONE matrix engine — never a score, never a default;
//   * a refusal, a withheld cell and an inert workspace each print their own
//     reason and are counted, never folded into "no conflict found";
//   * a conflict is routed to the lowest joint apex of the lines involved and
//     never settled on the shared person;
//   * every write is a seat-checked, traceable, append-only act.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION, MIGRATIONS, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { PAUSE_PERMIT_MATRIX_REACH_SWITCHES, PAUSE_PERMIT_REACH_RULES } from '../../app/core/domain/pausePermitRegistry.js';
import {
  buildGoalCommitments,
  goalCommitmentBriefText,
  goalCommitmentCsvRows,
} from '../../app/core/domain/goalCommitment.js';
import { goalCommitmentConditions, goalCommitmentRule } from '../../app/core/domain/goalCommitmentRules.js';
import {
  GOAL_COMMITMENT_ADR,
  GOAL_COMMITMENT_CLOSED_PREFIX,
  GOAL_COMMITMENT_CSV_SCOPE,
  GOAL_COMMITMENT_EVENTS,
  GOAL_COMMITMENT_HOME_LINE,
  GOAL_COMMITMENT_LIMITS,
  GOAL_COMMITMENT_MARKER_KIND,
  GOAL_COMMITMENT_NO_LINE,
  GOAL_COMMITMENT_PANEL,
  GOAL_COMMITMENT_RIGHTS,
  GOAL_COMMITMENT_RULE_ID,
  GOAL_COMMITMENT_SETTING_KEYS,
} from '../../app/core/domain/goalCommitmentRegistry.js';
import {
  goalCommitmentInclusiveDays,
  goalCommitmentOverlapDays,
  normalizeGoalCommitments,
  normalizeGoalCommitmentSettings,
} from '../../app/core/domain/goalCommitmentSchema.js';
import { LEADER_ID } from '../../app/core/domain/chain.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { renderMatrixGoalCommitmentPanel } from '../../app/views/matrixGoalCommitmentPanel.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOW = new Date('2026-11-13T12:00:00.000Z');
const STAMP = '2020-01-01T00:00:00.000Z';

const person = (id, name, managerId, level) => ({ id, name, role: `${name} role`, level, managerId, status: 'active', startDate: STAMP, createdAt: STAMP, updatedAt: STAMP });
const line = (id, personId, managerId, kind, shareH = null, extra = {}) => ({ id, personId, managerId, kind, shareH, rights: [], fromISO: '2026-01-01', toISO: null, status: 'active', declaredAt: STAMP, history: [], note: '', ...extra });
const goal = (id, title, ownerId, extra = {}) => ({ id, title, ownerId, status: 'active', scope: 'person', dueDate: '2026-12-31', createdAt: '2026-10-01T09:00:00.000Z', ...extra });
const commitment = (id, goalId, ownerId, lineKey, holderId, windowFrom, windowTo, effortShareH, extra = {}) => ({
  id, goalId, ownerId, lineKey, holderId, windowFrom, windowTo, effortShareH,
  measureKey: '', direction: null, note: '', declaredById: holderId || ownerId, declaredOn: '2026-11-01', declaredAt: '2026-11-01T09:00:00.000Z', ...extra,
});

/**
 * ada leads; vera is the lowest joint apex of the three line holders; ann, bob
 * and cara hold lines over kim (ann the home line through person.managerId).
 * dave and tom exist so that bob and ann hold leadership seats of their own.
 */
function rawFixture({ shareBob = null, shareCara = null, commitments = 'conflict', managersDirectToLeader = false, extraPeople = [] } = {}) {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    person('ada', 'Ada Exec', null, 'vp'),
    person('vera', 'Vera VP', 'ada', 'vp'),
    person('ann', 'Ann Dir', managersDirectToLeader ? 'ada' : 'vera', 'manager'),
    person('bob', 'Bob Proj', managersDirectToLeader ? 'ada' : 'vera', 'manager'),
    person('cara', 'Cara Ops', managersDirectToLeader ? 'ada' : 'vera', 'manager'),
    person('kim', 'Kim Lead', 'ann', 'lead'),
    person('tom', 'Tom Maker', 'ann', 'ic'),
    person('dave', 'Dave Maker', 'bob', 'ic'),
    ...extraPeople,
  ];
  raw.reportingLines = [
    line('rl-kim-bob', 'kim', 'bob', 'project', shareBob),
    line('rl-kim-cara', 'kim', 'cara', 'product', shareCara),
  ];
  raw.goals = [
    goal('g1', 'Cut the cycle time of the nightly batch', 'kim'),
    goal('g2', 'Raise the change failure rate budget', 'kim'),
    goal('g3', 'Grow activation in the self-serve funnel', 'tom'),
  ];
  if (commitments === 'conflict') {
    // Same measure, opposed directions, 21 overlapping days: a target conflict.
    // 60 + 70 = 130 hundredths on the overlap: a week fuller than one person.
    raw.goalCommitments = [
      commitment('c1', 'g1', 'kim', GOAL_COMMITMENT_HOME_LINE, 'ann', '2026-11-10', '2026-12-10', 60, { measureKey: 'cycle time', direction: 'decrease' }),
      commitment('c2', 'g2', 'kim', 'rl-kim-bob', 'bob', '2026-11-20', '2026-12-20', 70, { measureKey: 'Cycle Time', direction: 'increase' }),
    ];
  } else if (commitments === 'line-share') {
    // The whole week fits (50 + 40 = 90) but bob's own line promised 50 against
    // a declared share of 30: ONE line above its own word, nobody's week broken.
    raw.goalCommitments = [
      commitment('c1', 'g1', 'kim', 'rl-kim-bob', 'bob', '2026-11-16', '2026-12-16', 50),
      commitment('c2', 'g2', 'kim', 'rl-kim-cara', 'cara', '2026-11-16', '2026-12-16', 40),
    ];
  } else if (commitments === 'none') {
    raw.goalCommitments = [];
  }
  return raw;
}
const fixture = (options) => normalizeState(rawFixture(options), { now: NOW }).state;
const read = (state, extra = {}) => buildGoalCommitments(state, { now: NOW, settings: state.settings, ...extra });
const ownerOf = (report, id) => report.owners.find((row) => row.personId === id);

function seed(state) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  return { store, api, sit };
}

const asksOf = (draft) => (draft.delegations || []).filter((row) => String(row.support || '').includes(GOAL_COMMITMENT_RULE_ID));

function runRule(state, { event = GOAL_COMMITMENT_EVENTS.DECLARED, settings = null } = {}) {
  const draft = JSON.parse(JSON.stringify(state));
  if (settings) draft.settings = { ...draft.settings, ...settings };
  const out = goalCommitmentRule(draft, {
    now: NOW, event: { type: event, entity: 'goalCommitment', entityId: 'c1' },
    idFactory: (prefix) => `${prefix}-test-${draft.delegations.length + 1}`,
  });
  return { draft, out };
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div><div id="toast-root"></div></body></html>');
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map((key) => [key, globalThis[key]]));
  try {
    for (const key of globals) globalThis[key] = key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key];
    return run(dom);
  } finally {
    for (const key of globals) globalThis[key] = previous.get(key);
  }
}

/* ---------------------------------------------------------- 1. registration */

test('the engine registers its rights, its pause, its export and its place on the spine', () => {
  for (const key of Object.values(GOAL_COMMITMENT_RIGHTS)) {
    assert.ok(ACTION_RIGHTS[key], `${key} is a declared right`);
  }
  assert.equal(ACTION_RIGHTS[GOAL_COMMITMENT_RIGHTS.GOVERN].minRank, 3, 'governing the register is a director-and-up act');
  for (const action of ['matrixGoalCommitmentReport', 'matrixGoalCommitmentBriefText', 'matrixGoalCommitmentCsvRows', 'matrixGoalCommitmentAttentionCount']) {
    assert.ok(SAFE_READS.has(action), `${action} is a safe read through the gateway`);
  }
  assert.equal(SAFE_READS.has('matrixGoalCommitmentCandidates'), false, 'the candidate list names lines and seats, so it is not a safe read');
  // Silencing this rule silences a second reporting line, so the pause permit
  // registry must know the switch AND what it reaches.
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes(GOAL_COMMITMENT_SETTING_KEYS.autoPropagate), 'the switch is registered as matrix-reaching');
  assert.equal(PAUSE_PERMIT_REACH_RULES[GOAL_COMMITMENT_SETTING_KEYS.autoPropagate], 'goalCommitmentRules.js', 'the switch names the rule file it silences');
  // Export, panel and spine.
  const scope = CSV_EXPORTS.find((row) => row.key === GOAL_COMMITMENT_CSV_SCOPE);
  assert.ok(scope, 'the register has its own CSV scope');
  assert.equal(CSV_EXPORTS.length, 145, 'the register is scope #145 and nothing else moved');
  assert.ok(MATRIX_PANELS.some((row) => row.key === GOAL_COMMITMENT_PANEL), 'the matrix view carries the commitments panel');
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length, 'spine and audit registry stay in parity');
  const spine = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id);
  assert.ok(spine.indexOf('goalCommitmentRule') > -1, 'the rule rides the shared post-commit spine');
  assert.ok(spine.indexOf('goalCommitmentRule') < spine.indexOf('seatRule'), 'commitments are routed before seats are re-read');
  assert.ok(PROPAGATION_CONTRACTS.some((row) => row.rule?.id === 'goalCommitmentRule'), 'the rule is audited by a propagation contract');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule?.id === 'goalCommitmentRule');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'goalCommitmentMarkers'], 'the contract declares exactly what the rule may write');
});

test('schema v153 carries the ledger, the markers and the conventions', () => {
  assert.equal(SCHEMA_VERSION, 153);
  assert.ok(COLLECTIONS.includes('goalCommitments') && COLLECTIONS.includes('goalCommitmentMarkers'));
  assert.ok(MIGRATIONS['152'], 'v152 state migrates forward');
  const state = fixture();
  const conv = state.settings;
  assert.equal(conv[GOAL_COMMITMENT_SETTING_KEYS.askDueDays], 3);
  assert.equal(conv[GOAL_COMMITMENT_SETTING_KEYS.horizonDays], 90);
  assert.equal(conv[GOAL_COMMITMENT_SETTING_KEYS.minOverlapDays], 5);
  assert.equal(conv[GOAL_COMMITMENT_SETTING_KEYS.minGoals], 3);
  assert.equal(conv[GOAL_COMMITMENT_SETTING_KEYS.autoPropagate], true);
  // A half declaration is dropped, counted and never completed by inference.
  const warnings = [];
  const kept = normalizeGoalCommitments([
    commitment('c1', 'g1', 'kim', 'home', 'ann', '2026-11-10', '2026-12-10', 60, { measureKey: 'cycle time', direction: null }),
    commitment('c2', 'g1', 'kim', 'home', 'ann', '2026-11-10', '2026-12-10', 140),
    commitment('c3', 'g1', 'kim', 'home', 'ann', '2026-11-10', '2026-12-10', 60),
  ], warnings);
  assert.deepEqual(kept.map((row) => row.id), ['c3']);
  assert.equal(warnings.length, 1);
  // Re-normalizing changes nothing: the ledger is a fixed point.
  const again = normalizeState(JSON.parse(JSON.stringify(state)), { now: NOW }).state;
  assert.deepEqual(again.goalCommitments, state.goalCommitments);
  assert.deepEqual(again.settings, state.settings);
});

/* --------------------------------------------------------------- 2. reader */

test('a workspace with lines but no declarations is inert or undeclared, and says which', () => {
  const report = read(fixture({ commitments: 'none' }));
  assert.equal(report.board.commitmentsN, 0);
  assert.equal(report.board.ownersInertN, 1, 'tom holds one line: there is nothing cross-line to compare');
  assert.equal(report.board.ownersUndeclaredN, 1, 'kim holds three lines and not one declaration');
  const kim = ownerOf(report, 'kim');
  const tom = ownerOf(report, 'tom');
  assert.equal(kim.verdict, 'undeclared');
  assert.match(kim.verdictSays, /silence here is not compatibility/i, 'undeclared must never read as a clean bill of health');
  assert.equal(tom.verdict, 'inert');
  assert.match(tom.verdictSays, /fewer than two active reporting lines/i);
  assert.equal(/no conflict/i.test(`${kim.verdictLabel} ${tom.verdictLabel}`), false, 'neither absence prints as a clean bill of health');
  assert.equal(report.board.countsReconcile, true);
  assert.equal(report.board.figuresComplete, true);
});

test('a goal nobody declared a line for is unattributed, never charged to the home line', () => {
  const report = read(fixture({ commitments: 'none' }));
  assert.equal(report.board.goalsUnattributedN, 2, 'kim’s two goals stand undeclared in the cross-line comparison');
  assert.equal(report.board.goalsComparableN, 2, 'tom’s single-line goal is that line’s own ordering, not a cross-line figure');
  assert.equal(report.board.goalsDeclaredN, 0);
  // The attribution figure WITHHELDS rather than printing a plausible zero.
  assert.equal(report.board.attributionPct, null);
  assert.equal(report.board.attributionWithheld, true);
  assert.ok(String(report.board.attributionWithheldReason).length > 10, 'the withheld figure carries its reason');
});

test('opposed measures over shared days are a target conflict with exact overlap and one apex', () => {
  const report = read(fixture());
  const kim = ownerOf(report, 'kim');
  assert.equal(kim.verdict, 'target-conflict');
  const pair = kim.pairs[0];
  assert.equal(pair.verdict, 'target-conflict');
  assert.equal(pair.overlapDays, goalCommitmentOverlapDays('2026-11-10', '2026-12-10', '2026-11-20', '2026-12-20'));
  assert.equal(pair.overlapDays, 21);
  assert.equal(pair.overlapFrom, '2026-11-20');
  assert.equal(pair.overlapTo, '2026-12-10');
  assert.equal(pair.measureKey, 'cycle time', 'the measure key is canonicalized, not compared as typed');
  // The conflict is owed to the lines' lowest joint apex — vera, not ada and
  // never kim.
  assert.equal(kim.apex.unique, true);
  assert.equal(kim.apex.apexId, 'vera');
  assert.equal(report.board.targetConflictN, 1);
  assert.equal(report.board.pairsCrossLineN, 1);
  assert.equal(report.board.countsReconcile, true);
});

test('colliding windows without opposed measures are printed, not escalated', () => {
  const state = fixture();
  state.goalCommitments = state.goalCommitments.map((row) => (row.id === 'c2' ? { ...row, measureKey: '', direction: null } : row));
  const report = read(state);
  const kim = ownerOf(report, 'kim');
  assert.equal(kim.pairs[0].verdict, 'date-overlap');
  assert.equal(report.board.dateOverlapN, 1);
  assert.equal(report.board.targetConflictN, 0);
  // A bare collision escalates nowhere: no condition, no ask.
  assert.deepEqual(goalCommitmentConditions(report).filter((row) => row.kind === 'target-conflict'), []);
});

test('concurrent effort above one person is a capacity verdict with its peak day', () => {
  const report = read(fixture());
  const kim = ownerOf(report, 'kim');
  assert.equal(report.board.capacityOvercommitN, 1);
  assert.equal(report.board.peakSumH, 130);
  assert.equal(report.board.peakDay, '2026-11-20', 'the peak is the first day the heavier window joins');
  assert.equal(kim.capacity.peakSumH, 130);
  assert.equal(kim.capacity.basisH, 100, 'the basis is ONE person, in hundredths');
  assert.equal(kim.capacity.overByH, 30);
  // Pair verdicts and capacity verdicts stay separate vocabularies.
  assert.equal(kim.pairs[0].verdict, 'target-conflict');
  assert.equal(report.board.capacityFitsN, 0);
});

test('one line above its own declared share, while the week still fits, is its own verdict', () => {
  const report = read(fixture({ commitments: 'line-share', shareBob: 30, shareCara: 70 }));
  const kim = ownerOf(report, 'kim');
  assert.equal(report.board.capacityFitsN, 1, 'the whole week fits: 50 + 40 = 90 of 100');
  assert.equal(report.board.capacityOvercommitN, 0, 'nobody’s week is fuller than one person');
  assert.equal(report.board.lineOvercommitN, 1);
  // The owner headline is capacity vocabulary; the capacity block below it says
  // WHICH capacity claim fired — the person’s week or one line’s own share.
  assert.equal(kim.verdict, 'capacity-overcommit');
  assert.equal(kim.capacity.verdict, 'fits');
  const over = kim.capacity.lines.find((row) => row.lineKey === 'rl-kim-bob');
  const inside = kim.capacity.lines.find((row) => row.lineKey === 'rl-kim-cara');
  assert.equal(over.verdict, 'overcommit');
  assert.equal(over.declaredShareH, 30);
  assert.equal(over.peakSumH, 50);
  assert.equal(over.overByH, 20);
  assert.equal(inside.verdict, 'fits');
  // Exactly ONE condition, routed at bob alone — not at the joint apex.
  const conditions = goalCommitmentConditions(report);
  assert.deepEqual(conditions.map((row) => row.kind), ['line-share-exceeded']);
  assert.equal(conditions[0].seatId, 'bob');
});

test('an undeclared line share is a refusal with a reason, and withholds the Wilson figure', () => {
  const report = read(fixture());
  assert.equal(report.board.lineShareUndeclaredN, 2, 'home and rl-kim-bob carry no declared share');
  const refusal = report.refusals.find((row) => row.key === 'share-undeclared');
  assert.ok(refusal, 'the refusal is counted under its own key');
  assert.equal(refusal.count, 2);
  assert.ok(String(refusal.reason).length > 10, 'the refusal prints what is missing');
  const kim = ownerOf(report, 'kim');
  const home = kim.capacity.lines.find((row) => row.lineKey === GOAL_COMMITMENT_HOME_LINE);
  assert.equal(home.verdict, 'share-undeclared');
  assert.equal(home.overByH, null, 'a refused line prints no excess figure at all');
  // The attribution rate is below its floor here too: withheld, with its reason.
  assert.equal(report.board.attributionPct, null);
  assert.equal(report.board.attributionWithheld, true);
});

test('a window past its goal’s due date is printed as a contradiction, never clamped', () => {
  const state = fixture();
  state.goalCommitments = state.goalCommitments.map((row) => (row.id === 'c2' ? { ...row, windowFrom: '2026-12-20', windowTo: '2027-02-20' } : row));
  const report = read(state);
  const c2 = report.commitments.find((row) => row.commitmentId === 'c2');
  assert.ok(c2.flags.some((flag) => /due/i.test(flag)), `the late window is flagged: ${c2.flags.join(' | ')}`);
  assert.equal(c2.state, 'live', 'a contradiction is printed, not used to erase the declaration');
  assert.equal(report.board.countsReconcile, true);
});

test('the CSV scope prints every row type and leaves withheld cells blank with their reason', () => {
  const report = read(fixture());
  const rows = goalCommitmentCsvRows(report);
  const types = new Set(rows.map((row) => row.row_type));
  for (const type of ['workspace', 'owner-verdict', 'pair-verdict', 'commitment-state', 'capacity-verdict', 'attribution', 'refusal']) {
    assert.ok(types.has(type), `${type} rows are exported`);
  }
  // A refused per-line reading exports as its own row carrying the reason —
  // and no numeric figure standing in for what could not be measured.
  const refusedLine = rows.find((row) => row.row_type === 'capacity-verdict' && row.key === 'share-undeclared');
  assert.ok(refusedLine, 'the undeclared share exports as a withheld capacity row');
  assert.ok(String(refusedLine.label).length > 10, 'the withheld row carries its reason');
  const refusal = rows.find((row) => row.row_type === 'refusal' && row.key === 'share-undeclared');
  assert.ok(refusal && String(refusal.label).length > 10, 'and the refusal count row explains itself');
  // The Wilson rate is below its floor: blank on every row, reason on every row.
  for (const row of rows) {
    assert.equal(row.attribution_pct, null, 'the withheld rate is blank, never zero');
    assert.ok(String(row.attribution_withheld_reason || '').length > 10, 'every blank carries its reason');
  }
  const csv = exportWorkspaceCsv(fixture(), GOAL_COMMITMENT_CSV_SCOPE, { now: NOW });
  assert.equal(csv.ok, true, csv.reason);
  const text = String(csv.text || csv.csv || '');
  for (const secret of ['Kim', 'Ann', 'Bob', 'Cara', 'Vera', 'nightly batch', 'rl-kim-bob']) {
    assert.equal(text.includes(secret), false, `${secret} must not reach the aggregate-only export`);
  }
  const parsed = parseCsv(text);
  assert.ok(parsed.rows.length >= rows.length - 1, 'the export round-trips through the parser');
  assert.equal(String(parsed.rows[0].attribution_pct ?? '').trim(), '', 'the blank survives serialization');
});

test('the brief states the separate claims and names no person', () => {
  const text = goalCommitmentBriefText(read(fixture()));
  assert.match(text, /1\.30 of one person on 2026-11-20/, 'the peak figure and its exact day are stated');
  assert.match(text, /basis of 1\.00/);
  assert.match(text, /reconcile/i);
  assert.match(text, /withheld/i, 'the withheld attribution rate is stated as withheld');
  for (const secret of ['Kim', 'Ann', 'Bob', 'nightly batch']) assert.equal(text.includes(secret), false, `${secret} must not reach the identity-free brief`);
});

/* -------------------------------------------------------------- 3. actions */

test('a line holder declares a commitment; a second live promise on the same slot is refused and named', () => {
  const { api, sit, store } = seed(fixture({ commitments: 'none' }));
  sit('ann');
  const declared = api.matrixGoalCommitmentDeclare({
    goalId: 'g1', lineKey: GOAL_COMMITMENT_HOME_LINE, windowFrom: '2026-11-16', windowTo: '2026-12-16',
    effortShareH: 40, measureKey: 'cycle time', direction: 'decrease',
  });
  assert.equal(declared.ok, true, declared.error);
  assert.equal(declared.effortShareH, 40);
  assert.equal(declared.windowDays, goalCommitmentInclusiveDays('2026-11-16', '2026-12-16'));
  assert.equal(store.state.goalCommitments.length, 1);
  const again = api.matrixGoalCommitmentDeclare({
    goalId: 'g1', lineKey: GOAL_COMMITMENT_HOME_LINE, windowFrom: '2026-12-01', windowTo: '2026-12-20', effortShareH: 20,
  });
  assert.equal(again.ok, false);
  assert.match(again.error, /already|live/i);
  assert.equal(store.state.goalCommitments.length, 1, 'the refusal saved nothing');
});

test('no-line belongs to the person whose goal it is or the operator view; a named line belongs to its holder', () => {
  const { api, sit, store } = seed(fixture({ commitments: 'none' }));
  // No declared seat at all is the operator view: the whole workspace, as
  // before seats existed. It may state a goal is owed under no line.
  const operator = api.matrixGoalCommitmentDeclare({ goalId: 'g1', lineKey: GOAL_COMMITMENT_NO_LINE, windowFrom: '2026-11-16', windowTo: '2026-12-16', effortShareH: 30 });
  assert.equal(operator.ok, true, operator.error);
  assert.equal(store.state.goalCommitments[0].lineKey, GOAL_COMMITMENT_NO_LINE);
  assert.equal(store.state.goalCommitments[0].holderId, null);
  sit('ann'); // holds kim's home line, not rl-kim-bob, and is not the owner
  const peerLine = api.matrixGoalCommitmentDeclare({ goalId: 'g2', lineKey: 'rl-kim-bob', windowFrom: '2026-11-16', windowTo: '2026-12-16', effortShareH: 30 });
  assert.equal(peerLine.ok, false, 'a peer holder may not declare for a line they do not hold');
  assert.match(peerLine.error, /Bob Proj holds that line/);
  const onBehalf = api.matrixGoalCommitmentDeclare({ goalId: 'g2', lineKey: GOAL_COMMITMENT_NO_LINE, windowFrom: '2026-11-16', windowTo: '2026-12-16', effortShareH: 30 });
  assert.equal(onBehalf.ok, false, 'a manager may not withdraw somebody else’s goal from the comparison');
  sit('bob'); // the holder of rl-kim-bob may declare for it
  const mine = api.matrixGoalCommitmentDeclare({ goalId: 'g2', lineKey: 'rl-kim-bob', windowFrom: '2026-11-16', windowTo: '2026-12-16', effortShareH: 30 });
  assert.equal(mine.ok, true, mine.error);
});

test('the door refuses a half declaration, an impossible effort and a window before the goal existed', () => {
  const { api, sit } = seed(fixture({ commitments: 'none' }));
  sit('ann');
  const base = { goalId: 'g1', lineKey: GOAL_COMMITMENT_HOME_LINE, windowFrom: '2026-11-16', windowTo: '2026-12-16' };
  const tooMuch = api.matrixGoalCommitmentDeclare({ ...base, effortShareH: 101 });
  assert.equal(tooMuch.ok, false);
  assert.match(tooMuch.error, /100|one person/i);
  const fractional = api.matrixGoalCommitmentDeclare({ ...base, effortShareH: 40.5 });
  assert.equal(fractional.ok, false, 'effort is a whole hundredth or it is refused');
  const halfMeasure = api.matrixGoalCommitmentDeclare({ ...base, effortShareH: 40, measureKey: 'cycle time' });
  assert.equal(halfMeasure.ok, false, 'a measure with no direction is half a declaration');
  const halfDirection = api.matrixGoalCommitmentDeclare({ ...base, effortShareH: 40, direction: 'increase' });
  assert.equal(halfDirection.ok, false, 'a direction with no measure is half a declaration');
  const before = api.matrixGoalCommitmentDeclare({ ...base, effortShareH: 40, windowFrom: '2026-09-01', windowTo: '2026-09-20' });
  assert.equal(before.ok, false, 'a promise dated before the goal existed is refused at the door');
  const pastDue = api.matrixGoalCommitmentDeclare({ ...base, effortShareH: 40, windowFrom: '2026-12-20', windowTo: '2027-01-20' });
  assert.equal(pastDue.ok, true, pastDue.error || 'a window past the goal’s due date is allowed and printed');
});

test('re-baseline writes the successor and closes the predecessor in one commit', () => {
  const { api, sit, store } = seed(fixture());
  sit('ann');
  const short = api.matrixGoalCommitmentRebaseline({ commitmentId: 'c1', reason: 'oops', windowFrom: '2026-11-16', windowTo: '2026-12-16', effortShareH: 50 });
  assert.equal(short.ok, false);
  assert.match(short.error, /at least/i);
  const moved = api.matrixGoalCommitmentRebaseline({
    commitmentId: 'c1', reason: 'The batch window moved with the platform cut-over.',
    windowFrom: '2026-11-25', windowTo: '2026-12-25', effortShareH: 50, measureKey: 'cycle time', direction: 'decrease',
  });
  assert.equal(moved.ok, true, moved.error);
  const rows = store.state.goalCommitments;
  const predecessor = rows.find((row) => row.id === 'c1');
  const successor = rows.find((row) => row.id === moved.commitmentId);
  assert.ok(successor && predecessor.supersededOn, 'both halves of the act landed in ONE commit');
  assert.equal(predecessor.supersededById, successor.id);
  assert.equal(successor.supersededOn, null, 'the successor points at nothing');
  const stale = api.matrixGoalCommitmentRebaseline({ commitmentId: 'c1', reason: 'Trying to re-baseline a closed row again.', windowFrom: '2026-12-01', windowTo: '2026-12-20', effortShareH: 10 });
  assert.equal(stale.ok, false, 'a superseded row is history, not a slot');
});

test('release needs a reason and belongs to the declaring line', () => {
  const { api, sit, store } = seed(fixture());
  sit('cara'); // holds no line this commitment was declared under
  const wrongSeat = api.matrixGoalCommitmentRelease({ commitmentId: 'c1', reason: 'Not mine to release but I shall try.' });
  assert.equal(wrongSeat.ok, false);
  sit('ann');
  const noReason = api.matrixGoalCommitmentRelease({ commitmentId: 'c1', reason: 'bye' });
  assert.equal(noReason.ok, false);
  const released = api.matrixGoalCommitmentRelease({ commitmentId: 'c1', reason: 'The batch work was folded into the platform cut-over.' });
  assert.equal(released.ok, true, released.error);
  assert.equal(store.state.goalCommitments.find((row) => row.id === 'c1').releasedOn, '2026-11-13');
  const report = read(store.state);
  assert.equal(report.commitments.find((row) => row.commitmentId === 'c1').state, 'released');
  assert.equal(report.board.liveN, 1, 'a released commitment stops drawing on the person');
});

test('conventions outside their bounds are refused, never clamped', () => {
  const { api, sit, store } = seed(fixture());
  sit('ada');
  const before = { ...store.state.settings };
  const refused = api.matrixGoalCommitmentSetConventions({ [GOAL_COMMITMENT_SETTING_KEYS.horizonDays]: 4000 });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /clamped|nothing was saved/i);
  assert.equal(store.state.settings[GOAL_COMMITMENT_SETTING_KEYS.horizonDays], before[GOAL_COMMITMENT_SETTING_KEYS.horizonDays], 'the stored value did not move');
  const unknown = api.matrixGoalCommitmentSetConventions({ goalCommitmentMagic: 7 });
  assert.equal(unknown.ok, false);
  const applied = api.matrixGoalCommitmentSetConventions({ [GOAL_COMMITMENT_SETTING_KEYS.horizonDays]: 60, [GOAL_COMMITMENT_SETTING_KEYS.autoPropagate]: false });
  assert.equal(applied.ok, true, applied.error);
  assert.equal(store.state.settings[GOAL_COMMITMENT_SETTING_KEYS.horizonDays], 60);
  assert.equal(store.state.settings[GOAL_COMMITMENT_SETTING_KEYS.autoPropagate], false);
});

test('a read-only seat is refused the register, and governing is a director-and-up act', () => {
  const { api, store } = seed(fixture());
  store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: 'nobody-here' }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const refused = api.matrixGoalCommitmentReport();
  assert.equal(refused.ok, false, 'an unresolved seat reads nothing');
  const { api: fresh, sit } = seed(fixture());
  sit('kim'); // an ic with no leadership seat
  const scan = fresh.matrixGoalCommitmentScan();
  assert.equal(scan.ok, false, 'scanning the register is a governing act');
  sit('vera');
  const governed = fresh.matrixGoalCommitmentScan();
  assert.equal(governed.ok, true, governed.error);
  assert.equal(governed.report.board.targetConflictN, 1);
});

/* ---------------------------------------------------------------- 4. rules */

test('RULE-GCC-01 files ONE dated ask per condition at the joint apex, and only once', () => {
  const state = fixture();
  const first = runRule(state);
  const asks = asksOf(first.draft);
  // The fixture stands under TWO conditions — an opposed-target pair and a
  // week fuller than one person — so exactly two signatures, two asks.
  assert.equal(asks.length, 2, 'one ask per standing condition, never one per commit');
  for (const ask of asks) {
    assert.equal(ask.personId, 'vera', 'the ask lands on the lowest joint apex, not on kim');
    assert.equal(ask.dueOn, '2026-11-16', 'the ask is dated by the ask window');
    assert.equal(ask.authority, 'act-inform');
  }
  const links = first.draft.links.filter((row) => row.ruleId === GOAL_COMMITMENT_RULE_ID);
  assert.ok(links.some((row) => row.relation === 'issues-obligation' && row.sourceId === 'vera'), 'the obligation is linked to the seat');
  assert.ok(links.some((row) => row.relation === 'rolls-up-to' && row.targetId === 'ada'), 'the ask rolls up across every line');
  assert.equal(first.out.filter((effect) => effect.action === 'delegated').length, 2, 'the commit reports what it routed');
  // Idempotence: the same standing conditions never file a second ask.
  goalCommitmentRule(first.draft, { now: NOW, event: { type: GOAL_COMMITMENT_EVENTS.SCAN, entity: 'workspace', entityId: 'x' } });
  assert.equal(asksOf(first.draft).length, 2, 'standing conditions are answered once');
});

test('a capacity overcommit is routed at the apex of every holder carrying the peak', () => {
  const state = fixture({ shareBob: 40, shareCara: 60 });
  const { draft } = runRule(state);
  const asks = asksOf(draft);
  assert.equal(asks.length, 2);
  for (const ask of asks) assert.equal(ask.personId, 'vera');
  const capacityAsk = asks.find((row) => /of one person on 2026-11-20/.test(row.title));
  assert.ok(capacityAsk, 'the capacity condition files its own ask');
  assert.match(capacityAsk.expectedOutcome, /1\.30 of one person against a basis of 1\.00/, 'the sum and the basis are stated in hundredths');
  assert.match(capacityAsk.expectedOutcome, /2 commitment\(s\) from 2 line\(s\)/, 'the ask names how many lines carry the peak day');
});

test('a line above its own share is asked of that holder alone, and only when the week fits', () => {
  const fits = runRule(fixture({ commitments: 'line-share', shareBob: 30, shareCara: 70 }));
  const asks = fits.draft.delegations.filter((row) => String(row.support || '').includes(GOAL_COMMITMENT_RULE_ID));
  assert.equal(asks.length, 1);
  assert.equal(asks[0].personId, 'bob', 'the holder of the over-reaching line is asked, not the joint apex');
  // When capacity itself fires, the line-share condition stands down.
  const broken = runRule(fixture({ shareBob: 30, shareCara: 60 }));
  const kinds = goalCommitmentConditions(read(broken.draft, { settings: broken.draft.settings })).map((row) => row.kind);
  assert.ok(kinds.includes('capacity-overcommit'));
  assert.ok(!kinds.includes('line-share-exceeded'), 'one week, one capacity verdict — never two asks for the same peak');
});

test('a conflict with no single joint apex is printed and observed, never delegated to a guessed seat', () => {
  // Bob's own manager is missing from the record, so his chain shares no
  // ancestor with Ann's: the two holders of the conflicting lines have NO
  // joint apex. The conflict is still printed in full — but nobody is invented
  // to answer it, and an identity-free marker carries the fact instead.
  const raw = rawFixture();
  raw.people = raw.people.map((row) => (row.id === 'bob' ? { ...row, managerId: 'nobody-on-record' } : row));
  const state = normalizeState(raw, { now: NOW }).state;
  const report = read(state);
  const kim = ownerOf(report, 'kim');
  assert.equal(kim.pairs[0].verdict, 'target-conflict', 'the conflict itself is still computed and printed');
  assert.equal(kim.apex.unique, false, 'and the register says plainly that it found no single seat');
  const { draft, out } = runRule(state);
  assert.equal(asksOf(draft).length, 0, 'no delegation is invented for an ambiguous apex');
  assert.ok((draft.goalCommitmentMarkers || []).length >= 1, 'the standing conflict is observed instead');
  assert.equal(draft.goalCommitmentMarkers[0].kind, GOAL_COMMITMENT_MARKER_KIND);
  assert.match(draft.goalCommitmentMarkers[0].detail, /apex/i);
  assert.ok(out.some((effect) => effect.action === 'observed'), 'the commit reports the observation');
});

test('a pause governs every path, including writes and an explicit scan', () => {
  const paused = runRule(fixture(), { event: GOAL_COMMITMENT_EVENTS.SCAN, settings: { [GOAL_COMMITMENT_SETTING_KEYS.autoPropagate]: false } });
  assert.deepEqual(paused.out, [], 'the rule writes nothing while paused');
  assert.equal(paused.draft.delegations.length, 0);
  // Pause FIRST, then let the conflict arrive through human writes: the
  // commits that carry the declarations must not route anything either.
  const { api, sit, store } = seed(fixture({ commitments: 'none' }));
  sit('ada');
  const paused0 = api.matrixGoalCommitmentSetConventions({ [GOAL_COMMITMENT_SETTING_KEYS.autoPropagate]: false });
  assert.equal(paused0.ok, true, paused0.error);
  sit('ann');
  const declared = api.matrixGoalCommitmentDeclare({ goalId: 'g1', lineKey: GOAL_COMMITMENT_HOME_LINE, windowFrom: '2026-11-10', windowTo: '2026-12-10', effortShareH: 60, measureKey: 'cycle time', direction: 'decrease' });
  assert.equal(declared.ok, true, declared.error);
  sit('bob');
  const crossed = api.matrixGoalCommitmentDeclare({ goalId: 'g2', lineKey: 'rl-kim-bob', windowFrom: '2026-11-20', windowTo: '2026-12-20', effortShareH: 70, measureKey: 'cycle time', direction: 'increase' });
  assert.equal(crossed.ok, true, crossed.error);
  assert.equal(asksOf(store.state).length, 0, 'the declaring commits routed nothing while paused');
  sit('ada');
  const scanned = api.matrixGoalCommitmentScan();
  assert.equal(scanned.ok, true, scanned.error);
  assert.equal(asksOf(store.state).length, 0, 'a scan retries the cap; it does not override the pause');
  // Unpausing lets the very next commit route the standing conflict.
  const unpaused = api.matrixGoalCommitmentSetConventions({ [GOAL_COMMITMENT_SETTING_KEYS.autoPropagate]: true });
  assert.equal(unpaused.ok, true, unpaused.error);
  assert.ok(asksOf(store.state).length >= 1, 'the pause lifted, the standing conflict routes on the next commit');
});

test('an ask closes when its condition clears, and a human answer is never overwritten', () => {
  const first = runRule(fixture());
  const askIds = asksOf(first.draft).map((row) => row.id);
  assert.equal(askIds.length, 2);
  // The conditions clear: bob's line releases its promise.
  first.draft.goalCommitments = first.draft.goalCommitments.map((row) => (row.id === 'c2'
    ? { ...row, releasedOn: '2026-11-13', releasedReason: 'The change budget was withdrawn at the October review.' }
    : row));
  goalCommitmentRule(first.draft, { now: NOW, event: { type: GOAL_COMMITMENT_EVENTS.SCAN, entity: 'workspace', entityId: 'x' } });
  for (const id of askIds) {
    const closed = first.draft.delegations.find((row) => row.id === id);
    assert.equal(closed.status, 'done');
    assert.ok(String(closed.completionNote).startsWith(GOAL_COMMITMENT_CLOSED_PREFIX), 'the closure says the rule closed it');
  }
  // A HUMAN answer to a standing condition is respected: no re-ask, no edit.
  const answered = runRule(fixture());
  const human = asksOf(answered.draft)[0];
  human.status = 'done';
  human.completedOn = '2026-11-12';
  human.completionNote = 'Settled in the Monday sync: bob re-dates his window.';
  goalCommitmentRule(answered.draft, { now: NOW, event: { type: GOAL_COMMITMENT_EVENTS.SCAN, entity: 'workspace', entityId: 'x' } });
  const ruleAsks = asksOf(answered.draft);
  assert.equal(ruleAsks.length, 2, 'no third ask is filed while two conditions stand answered or open');
  const touched = ruleAsks.find((row) => row.id === human.id);
  assert.equal(touched.status, 'done');
  assert.equal(touched.completionNote, 'Settled in the Monday sync: bob re-dates his window.', 'the human’s answer is never overwritten');
});

test('asks are bounded per commit and the remainder is counted, not lost', () => {
  const raw = rawFixture({ commitments: 'none' });
  for (let i = 1; i <= 7; i += 1) {
    raw.people.push(person(`h${i}a`, `Holder ${i} A`, 'vera', 'manager'), person(`h${i}b`, `Holder ${i} B`, 'vera', 'manager'));
    raw.people.push(person(`o${i}`, `Owner ${i}`, `h${i}a`, 'lead'));
    raw.reportingLines.push(line(`rl-o${i}-b`, `o${i}`, `h${i}b`, 'project'));
    raw.goals.push(goal(`ga${i}`, `Measure goal ${i} a`, `o${i}`), goal(`gb${i}`, `Measure goal ${i} b`, `o${i}`));
    raw.goalCommitments.push(
      commitment(`ca${i}`, `ga${i}`, `o${i}`, GOAL_COMMITMENT_HOME_LINE, `h${i}a`, '2026-11-16', '2026-12-16', 40, { measureKey: `measure ${i}`, direction: 'decrease' }),
      commitment(`cb${i}`, `gb${i}`, `o${i}`, `rl-o${i}-b`, `h${i}b`, '2026-11-16', '2026-12-16', 40, { measureKey: `measure ${i}`, direction: 'increase' }),
    );
  }
  const state = normalizeState(raw, { now: NOW }).state;
  const { draft, out } = runRule(state);
  const asks = draft.delegations.filter((row) => String(row.support || '').includes(GOAL_COMMITMENT_RULE_ID));
  assert.equal(asks.length, GOAL_COMMITMENT_LIMITS.asksPerCommit, 'the cap holds');
  assert.ok(out.some((effect) => /deferred/i.test(effect.verb || effect.kind || effect.summary || '')), 'the seventh condition is counted as deferred');
});

/* ---------------------------------------------------------------- 5. panel */

test('the panel prints the reader’s own figures, its diagram and its refusals', () => {
  withDom(() => {
    const state = fixture();
    const ctx = { state, query: new URLSearchParams('panel=board'), navigate: () => {}, refresh: () => {}, api: {} };
    const node = renderMatrixGoalCommitmentPanel(ctx, { now: NOW });
    globalThis.document.body.appendChild(node);
    assert.equal(node.getAttribute('data-testid'), 'goal-commitment-panel');
    const text = node.textContent;
    const report = read(state);
    assert.ok(node.querySelector('[data-testid="goal-commitment-stats"]'), 'the stat grid renders');
    const owner = node.querySelector('[data-testid="goal-commitment-owner-kim"]');
    assert.ok(owner, 'the shared person gets a row of their own');
    assert.equal(owner.getAttribute('data-verdict'), 'target-conflict');
    assert.ok(text.includes('1.30'), 'the peak the reader computed is the peak the panel prints, in hundredths');
    assert.ok(text.includes('Vera'), 'the joint apex is named');
    assert.ok(text.includes('21'), 'the exact overlap is printed in days');
    assert.equal(report.board.peakSumH, 130, 'and the stored figure is the same integer hundredths');
    // The diagram is a real file in the repo, referenced by the method panel.
    const method = renderMatrixGoalCommitmentPanel({ ...ctx, query: new URLSearchParams('panel=method') }, { now: NOW });
    const img = method.querySelector('img');
    assert.ok(img, 'the method figure renders');
    const src = String(img.getAttribute('src') || '');
    assert.match(src, /goal-commitment-conflict\.jpg$/);
    assert.ok(fs.existsSync(path.join(REPO, src.replace(/^\.\//, ''))), `${src} exists on disk`);
    // No api, no act buttons: the screen never invents a seat.
    assert.equal(node.querySelector('[data-testid="goal-commitment-open-declare"]'), null);
    assert.match(method.textContent, /refus|withheld/i);
    assert.match(method.textContent, /ADR-0193|RULE-GCC-01/);
  });
});

test('the panel shows act buttons to a seat that holds a line, and prints a refusal as a refusal', () => {
  withDom(() => {
    const state = fixture();
    const acting = {
      state, query: new URLSearchParams('panel=board'), navigate: () => {}, refresh: () => {},
      api: {
        matrixGoalCommitmentReport: () => ({ ok: true, report: read(state) }),
        matrixGoalCommitmentCandidates: () => ({ ok: true, candidates: [], actorId: 'ann', effortBounds: { min: 0, max: 100 }, windowMaxDays: GOAL_COMMITMENT_LIMITS.windowMaxDays }),
        matrixGoalCommitmentDeclare: () => ({ ok: false, error: 'nope' }),
        matrixGoalCommitmentRebaseline: () => ({ ok: false, error: 'nope' }),
        matrixGoalCommitmentRelease: () => ({ ok: false, error: 'nope' }),
      },
    };
    const node = renderMatrixGoalCommitmentPanel(acting, { now: NOW });
    assert.ok(node.querySelector('[data-testid="goal-commitment-open-declare"]'), 'a seat that can act sees the declare door');
    assert.ok(node.querySelector('[data-testid^="goal-commitment-rebaseline-"]'), 'and a re-baseline door per live commitment');
    const refused = renderMatrixGoalCommitmentPanel({
      state, query: new URLSearchParams('panel=board'), navigate: () => {}, refresh: () => {},
      api: { matrixGoalCommitmentReport: () => ({ ok: false, error: 'The declared seat is unresolved and read-only.' }) },
    }, { now: NOW });
    assert.match(refused.textContent, /Reading refused/);
    assert.match(refused.textContent, /unresolved/);
    assert.equal(refused.querySelector('[data-testid="goal-commitment-stats"]'), null, 'a refused read renders no figures at all');
  });
});

/* ------------------------------------------------------- 6. doctrine pins */

test('the register’s identity is the doctrine it ships under', () => {
  assert.equal(GOAL_COMMITMENT_ADR, 'ADR-0193');
  assert.equal(GOAL_COMMITMENT_RULE_ID, 'RULE-GCC-01');
  assert.equal(GOAL_COMMITMENT_PANEL, 'commitments');
  assert.ok(Object.values(GOAL_COMMITMENT_EVENTS).every((type) => typeof type === 'string' && type.length > 0));
  assert.ok(Object.values(GOAL_COMMITMENT_EVENTS).some((type) => type.startsWith('goalCommitment.')));
});
