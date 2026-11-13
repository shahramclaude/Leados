/**
 * tests/app/priority-ranking.test.mjs — ADR-0191, Session 259, Schema v151,
 * `#/matrix?panel=priority`, CSV scope #144, RULE-SOC-01.
 *
 * ONE focused pass over what this session built. Every expected figure below is
 * worked out BY HAND from the fixture and written here before it is asserted.
 *
 * THE FIXTURE. Reading day 2026-11-13.
 *
 *   leader
 *    └ ada (vp)
 *       ├ ann (director)   home-line manager of kim
 *       ├ bob (manager)    project line over kim (rl-kim-bob)
 *       └ cara (manager)   ops line over kim (rl-kim-cara)
 *
 *   kim (lead) holds THREE active lines: home(ann), bob, cara.
 *   kim's live open portfolio items: p1, p2, p3, p4.
 *
 *   R1 (cycle)  frozen p1,p2,p3 · lines ann,bob,cara · due 2026-11-16
 *       ann: p1>p2>p3 · bob: p2>p3>p1 · cara: p3>p1>p2
 *       Pairwise: p1>p2 2–1 · p2>p3 2–1 · p3>p1 2–1 → every item beats one and
 *       loses to one. NO Condorcet winner. Schwartz top cycle = {p1,p2,p3}.
 *       Beatpaths: every pair has strength 2 in both directions → no unique
 *       beatpath leader. Kemeny: three rotations tie at 5 ballot-pairs
 *       (p1>p2 2 + p1>p3 1 + p2>p3 2 = 5) → `tied`, 3 optima.
 *
 *   R2 (condorcet) frozen p1,p2,p4 · due 2026-11-20
 *       ann: p1>p2>p4 · bob: p1>p4>p2 · cara: p2>p1>p4
 *       Pairwise: p1>p2 2–1 · p1>p4 3–0 · p2>p4 2–1 → p1 beats every other.
 *       Kemeny: p1>p2>p4 scores 2 + 3 + 2 = 7 and is the UNIQUE optimum.
 *
 *   R3 (overdue) frozen p2,p3 · lines ann,bob,cara · opened 11-05, due 11-10
 *       Only ann voted (p2>p3). votes 1 < floor 2 → `insufficient`, and bob and
 *       cara are `overdue` (the deadline passed and no ballot is on record).
 *
 *   R4 (single line) tom (ic → ann) with t1,t2 · one frozen line → `inert`.
 *
 *   R5 (withdrawn) p1,p4 · one ballot · withdrawn with a written reason.
 *
 * HAND-COMPUTED COVERAGE over the LIVE rounds (a withdrawn round owes nothing;
 * its ballot stays on its own row as history and is never charged to the rate).
 *   live rounds R1..R4 lines = 3+3+3+1 = 10 · answered 3+3+1+0 = 7 · pending 1
 *   (R4's single line) · overdue 2 (R3 bob and cara) · unreachable 0.
 *   Coverage = 7/10 = 70.0%; Wilson 95% for 7/10 = 39.7% … 89.2%.
 *
 * RULE-SOC-01 on this record files THREE asks:
 *   ada  ← R1 majority cycle (joint apex of ann, bob and cara is ada), due 11-16
 *   bob  ← R3 overdue ballot, due 11-16
 *   cara ← R3 overdue ballot, due 11-16
 * and no ask for R2 (a Condorcet winner is not a disagreement), none for ann
 * (answered), none for R4 (one line) and none for R5 (withdrawn).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION, MIGRATIONS, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { PAUSE_PERMIT_MATRIX_REACH_SWITCHES } from '../../app/core/domain/pausePermitRegistry.js';
import {
  buildPriorityRanking,
  priorityBallotBriefText,
  priorityBallotCsvRows,
  priorityCondorcet,
  priorityKemeny,
  priorityPairCounts,
  prioritySchulze,
  prioritySchwartz,
} from '../../app/core/domain/priorityRanking.js';
import { priorityConditions, priorityRule } from '../../app/core/domain/priorityRankingRules.js';
import {
  normalizePriorityRoundLedger,
  normalizePriorityVotes,
  parsePriorityBallotAskSummary,
  priorityBallotDay,
  priorityBallotRankingIsPermutation,
  priorityBallotSignature,
} from '../../app/core/domain/priorityRankingSchema.js';
import {
  PRIORITY_BALLOT_CLOSED_PREFIX,
  PRIORITY_BALLOT_CSV_COLUMNS,
  PRIORITY_BALLOT_CSV_SCOPE,
  PRIORITY_BALLOT_EVENTS,
  PRIORITY_BALLOT_MARKER_KIND,
  PRIORITY_BALLOT_RIGHTS,
  PRIORITY_BALLOT_RULE_ID,
} from '../../app/core/domain/priorityRankingRegistry.js';
import { renderMatrixPriorityPanel } from '../../app/views/matrixPriorityPanel.js';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const STAMP = '2020-01-01T00:00:00.000Z';

const person = (id, name, managerId, level) => ({ id, name, role: `${name} role`, level, managerId, status: 'active', startDate: STAMP, createdAt: STAMP, updatedAt: STAMP });
const line = (id, personId, managerId, kind = 'project', extra = {}) => ({ id, personId, managerId, kind, shareH: null, rights: [], fromISO: '2026-01-01', toISO: null, status: 'active', declaredAt: STAMP, history: [], note: '', ...extra });
const item = (id, title, status = 'open') => ({ id, title, kind: 'project', status, ownerId: 'kim', decision: 'funded', createdOn: '2026-11-01', updatedAt: STAMP });
const snap = (...ids) => ids.map((id) => ({ key: id, title: { p1: 'Fix the nightly batch', p2: 'Rebuild onboarding', p3: 'Explore pricing', p4: 'Retire the old ledger', t1: 'Tom item one', t2: 'Tom item two', t3: 'Tom item three' }[id], sourceType: 'portfolio', sourceId: id }));
const round = (id, personId, itemIds, lines, extra = {}) => ({
  id, personId, title: `Round ${id}: what comes first`, itemSnapshot: snap(...itemIds),
  lineSnapshot: lines, openedOn: '2026-11-09', dueOn: '2026-11-16', withdrawnOn: null, withdrawnReason: '',
  declaredById: 'ada', declaredOn: '2026-11-09', declaredAt: '2026-11-09T09:00:00.000Z', ...extra,
});
const ballot = (id, roundId, lineKey, holderId, ranking, castOn = '2026-11-12') => ({ id, roundId, lineKey, holderId, ranking, castOn, castAt: `${castOn}T09:00:00.000Z`, note: '' });

const LINES = [
  { lineKey: 'home', managerId: 'ann', kind: 'functional', role: 'primary', shareH: null },
  { lineKey: 'rl-kim-bob', managerId: 'bob', kind: 'project', role: 'secondary', shareH: null },
  { lineKey: 'rl-kim-cara', managerId: 'cara', kind: 'product', role: 'secondary', shareH: null },
];
const TWO_LINES = [
  { lineKey: 'home', managerId: 'ann', kind: 'functional', role: 'primary', shareH: null },
  { lineKey: 'rl-kim-bob', managerId: 'bob', kind: 'project', role: 'secondary', shareH: null },
];

function rawFixture({ bobEnded = false, annToLeader = false } = {}) {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    person('ada', 'Ada Exec', null, 'vp'),
    person('ann', 'Ann Dir', annToLeader ? null : 'ada', 'director'),
    person('bob', 'Bob Proj', 'ada', 'manager'),
    person('cara', 'Cara Ops', 'ada', 'manager'),
    person('kim', 'Kim Lead', 'ann', 'lead'),
    person('tom', 'Tom Maker', 'ann', 'ic'),
    // A direct report gives bob a leadership seat of his own, so his ballot is
    // an act this workspace can actually be operated from.
    person('dave', 'Dave Maker', 'bob', 'ic'),
  ];
  raw.reportingLines = [
    line('rl-kim-bob', 'kim', 'bob', 'project', bobEnded ? { toISO: '2026-11-10' } : {}),
    line('rl-kim-cara', 'kim', 'cara', 'product'),
  ];
  raw.portfolio = [
    item('p1', 'Fix the nightly batch'), item('p2', 'Rebuild onboarding'),
    item('p3', 'Explore pricing'), item('p4', 'Retire the old ledger'),
    { ...item('t1', 'Tom item one'), ownerId: 'tom' },
    { ...item('t2', 'Tom item two'), ownerId: 'tom' },
    { ...item('t3', 'Tom item three'), ownerId: 'tom' },
  ];
  raw.priorityRounds = [
    round('r1', 'kim', ['p1', 'p2', 'p3'], LINES, { title: 'What Kim works on first' }),
    round('r2', 'kim', ['p1', 'p2', 'p4'], LINES, { title: 'What Kim delivers this sprint', openedOn: '2026-11-12', dueOn: '2026-11-20' }),
    round('r3', 'kim', ['p2', 'p3'], LINES, { title: 'Kim’s queue for the short week', openedOn: '2026-11-05', dueOn: '2026-11-10' }),
    round('r4', 'tom', ['t1', 't2'], [{ lineKey: 'home', managerId: 'ann', kind: 'functional', role: 'primary', shareH: null }], { title: 'Tom’s two items', openedOn: '2026-11-12', dueOn: '2026-11-19' }),
    round('r5', 'kim', ['p1', 'p4'], TWO_LINES, { title: 'A round that was withdrawn', withdrawnOn: '2026-11-13', withdrawnReason: 'The scope changed before enough ballots arrived.' }),
  ];
  raw.priorityBallots = [
    ballot('b1', 'r1', 'home', 'ann', ['p1', 'p2', 'p3']),
    ballot('b2', 'r1', 'rl-kim-bob', 'bob', ['p2', 'p3', 'p1']),
    ballot('b3', 'r1', 'rl-kim-cara', 'cara', ['p3', 'p1', 'p2']),
    ballot('b4', 'r2', 'home', 'ann', ['p1', 'p2', 'p4']),
    ballot('b5', 'r2', 'rl-kim-bob', 'bob', ['p1', 'p4', 'p2']),
    ballot('b6', 'r2', 'rl-kim-cara', 'cara', ['p2', 'p1', 'p4']),
    ballot('b7', 'r3', 'home', 'ann', ['p2', 'p3']),
    ballot('b8', 'r5', 'home', 'ann', ['p1', 'p4']),
  ];
  return raw;
}
const fixture = (options) => normalizeState(rawFixture(options), { now: NOW }).state;
const read = (state, extra = {}) => buildPriorityRanking(state, { now: NOW, settings: state.settings, ...extra });
const roundOf = (report, id) => report.rounds.find((row) => row.roundId === id);

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

let seq = 0;
function runRule(state, { event = PRIORITY_BALLOT_EVENTS.SCAN } = {}) {
  const draft = JSON.parse(JSON.stringify(state));
  const out = priorityRule(draft, {
    now: NOW, event: { type: event, entity: 'workspace', entityId: 'matrix-priority' },
    idFactory: (prefix) => `${prefix}-t${++seq}`, recordEffect: () => {},
  });
  return { draft, out };
}
const priorityAsks = (state) => {
  const ids = new Set((state.links || []).filter((l) => l.ruleId === PRIORITY_BALLOT_RULE_ID && l.relation === 'issues-obligation').map((l) => l.targetId));
  return (state.delegations || []).filter((d) => ids.has(d.id));
};
const openFor = (state, personId) => priorityAsks(state).filter((d) => d.status === 'active' && d.personId === personId);

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

test('registration: schema v151, two ledgers, CSV #144, RULE-SOC-01 as spine rule 121, rights and pause switch', () => {
  assert.equal(SCHEMA_VERSION, 154);
  for (const key of ['priorityRounds', 'priorityBallots']) assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  const scope = CSV_EXPORTS.find((entry) => entry.key === PRIORITY_BALLOT_CSV_SCOPE);
  assert.ok(scope, 'CSV #144 is registered');
  assert.equal(scope.sensitive, false, 'the export is aggregate-only');
  assert.equal(CSV_EXPORTS.length, 145);
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule?.id === 'priorityRule');
  assert.ok(contract, 'RULE-SOC-01 declares its propagation contract');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'matrixMarkers']);
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 122);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'one contract per spine rule');
  assert.deepEqual(DEFAULT_POST_COMMIT_RULES.slice(-4).map((rule) => rule.id), ['priorityRule', 'goalCommitmentRule', 'seatRule', 'sealRule'],
    'RULE-SOC-01 stays ahead of the goal-commitment rule (ADR-0193), the seat roll-up and the seal');
  assert.equal(ACTION_RIGHTS['cast-priority-ballot'].minRank, 1, 'casting is open to every rank; the action narrows it to the frozen holder');
  assert.equal(ACTION_RIGHTS['govern-priority-ballots'].minRank, 3);
  assert.ok(SAFE_READS.has('matrixPriorityReport'));
  assert.ok(!SAFE_READS.has('matrixPriorityCastBallot'), 'casting writes');
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('priorityBallotAutoPropagate'));
});

test('MIGRATIONS[150] adds two EMPTY ledgers and declares the conventions; nothing is inferred', () => {
  const v150 = { ...createEmptyState(NOW.toISOString()), schemaVersion: 150 };
  delete v150.priorityRounds; delete v150.priorityBallots;
  v150.settings = { ...v150.settings };
  delete v150.settings.priorityBallotDueDays;
  v150.portfolio = [item('p1', 'Fix the nightly batch')];
  const next = MIGRATIONS[150](v150);
  assert.equal(next.schemaVersion, 151);
  assert.deepEqual(next.priorityRounds, []);
  assert.deepEqual(next.priorityBallots, []);
  assert.equal(next.settings.priorityBallotDueDays, 5);
  assert.equal(next.settings.priorityAskDueDays, 3);
  assert.equal(next.settings.priorityMinBallots, 2);
  assert.equal(next.settings.priorityBallotAutoPropagate, true);
  assert.equal(next.portfolio, v150.portfolio, 'existing work items are untouched and no round is derived from them');
});

/* --------------------------------------------------------- 2. social choice */

test('pairwise, Condorcet, Schwartz, Schulze and Kemeny on the hand-computed 3-cycle', () => {
  const keys = ['A', 'B', 'C'];
  const ballots = [{ ranking: ['A', 'B', 'C'] }, { ranking: ['B', 'C', 'A'] }, { ranking: ['C', 'A', 'B'] }];
  const counts = priorityPairCounts(ballots, keys);
  // A>B 2–1 · B>C 2–1 · C>A 2–1 (each ballot is one arc of the cycle).
  assert.deepEqual([counts.A.B, counts.B.A, counts.B.C, counts.C.B, counts.C.A, counts.A.C], [2, 1, 2, 1, 2, 1]);
  assert.equal(priorityCondorcet(counts, keys), null, 'a 3-cycle has no Condorcet winner');
  assert.deepEqual(prioritySchwartz(counts, keys), ['A', 'B', 'C'], 'the top cycle is all three');
  const schulze = prioritySchulze(counts, keys);
  // Every pair is won 2–1, so every beatpath strength is 2 in BOTH directions:
  // no item beats another on path strength, hence no unique leader.
  assert.equal(schulze.strength.A.B, 2);
  assert.equal(schulze.strength.B.A, 2);
  assert.equal(schulze.leader, null);
  assert.equal(schulze.strict, false, 'a balanced cycle has no strict beatpath relation');
  assert.deepEqual(schulze.order, [], 'no order is claimed where every pair ties');
  // Kemeny: A>B>C scores A>B 2 + A>C 1 + B>C 2 = 5; all three rotations score 5.
  const kemeny = priorityKemeny(counts, keys);
  assert.deepEqual([kemeny.state, kemeny.optimalN, kemeny.score, kemeny.ranking], ['tied', 3, 5, null]);
});

test('the exact cap and the majority test are refused, never approximated', () => {
  const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const counts = priorityPairCounts([{ ranking: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }], keys);
  assert.deepEqual(priorityKemeny(counts, keys), { state: 'capped', ranking: null, optimalN: null, score: null });
  assert.equal(priorityCondorcet(counts, keys), 'A', 'one ballot makes A a Condorcet winner');
  assert.deepEqual(prioritySchwartz(counts, keys), ['A']);
});

/* ------------------------------------------------------------- 3. the read */

test('round R2 has the hand-computed Condorcet winner and a unique Kemeny ranking', () => {
  const report = read(fixture());
  const r2 = roundOf(report, 'r2');
  assert.equal(r2.verdict, 'condorcet');
  assert.equal(r2.condorcet.winnerKey, 'p1');
  assert.deepEqual(r2.schwartz, ['p1']);
  assert.deepEqual([r2.kemeny.state, r2.kemeny.ranking, r2.kemeny.score], ['unique', ['p1', 'p2', 'p4'], 7]);
  const pair = (a, b) => r2.pairwise.find((row) => (row.aKey === a && row.bKey === b) || (row.aKey === b && row.bKey === a));
  assert.deepEqual([pair('p1', 'p2').ab, pair('p1', 'p2').ba], [2, 1]);
  assert.deepEqual([pair('p1', 'p4').ab, pair('p1', 'p4').ba], [3, 0]);
  assert.deepEqual([pair('p2', 'p4').ab, pair('p2', 'p4').ba], [2, 1]);
});

test('round R1 is a printed majority cycle routed nowhere by the read itself', () => {
  const report = read(fixture());
  const r1 = roundOf(report, 'r1');
  assert.equal(r1.verdict, 'cycle');
  assert.equal(r1.condorcet.exists, false);
  assert.deepEqual(r1.schwartz, ['p1', 'p2', 'p3']);
  assert.equal(r1.kemeny.state, 'tied');
  assert.equal(r1.cycleEdges.length, 3, 'three majority arcs inside the top cycle');
  assert.deepEqual(r1.cycleEdges.map((edge) => `${edge.fromKey}>${edge.toKey}`).sort(), ['p1>p2', 'p2>p3', 'p3>p1']);
  assert.equal(report.board.cycleN, 1);
});

test('coverage, verdicts and the identity of every round match the hand-computed totals', () => {
  const report = read(fixture());
  assert.deepEqual(report.rounds.map((row) => `${row.roundId}:${row.verdict}`), ['r1:cycle', 'r2:condorcet', 'r3:insufficient', 'r4:inert', 'r5:withdrawn']);
  const r3 = roundOf(report, 'r3');
  assert.deepEqual([r3.coverage.answeredN, r3.coverage.pendingN, r3.coverage.overdueN], [1, 0, 2]);
  assert.equal(r3.coverage.linesN, 3);
  const b = report.board;
  assert.deepEqual([b.linesAskedN, b.ballotsCastN, b.overdueN, b.unresolvableN], [10, 7, 2, 0]);
  assert.deepEqual([b.liveN, b.withdrawnN, b.pendingN], [4, 1, 1]);
  // 7/10 = 70.0%; Wilson 95% = 39.7 … 89.2.
  assert.deepEqual([b.coveragePct, b.coverageLowPct, b.coverageHighPct], [70, 39.7, 89.2]);
  assert.equal(b.countsReconcile, true);
  assert.equal(b.figuresComplete, true);
  assert.equal(b.attentionN, 3, 'one cycle plus two overdue ballots');
});

test('the ballot floor withholds the aggregate and prints the counts', () => {
  const report = read(fixture());
  const r3 = roundOf(report, 'r3');
  assert.equal(r3.votesN, 1);
  assert.equal(r3.pairwise.length, 0, 'no pairwise matrix below the declared floor');
  assert.equal(r3.schulze.order.length, 0);
  assert.ok(report.refusals.some((row) => row.key === 'thin-ballots'));
});

test('a line that ended is counted, never substituted; the frozen holder stays the holder', () => {
  const report = read(fixture({ bobEnded: true }));
  const r3 = roundOf(report, 'r3');
  assert.deepEqual([r3.coverage.answeredN, r3.coverage.overdueN, r3.coverage.lineEndedN], [1, 1, 1]);
  const bobLine = r3.lines.find((row) => row.lineKey === 'rl-kim-bob');
  assert.equal(bobLine.state, 'line-ended');
  // R1's ballot was cast BEFORE the line ended, so it still counts as that holder's act.
  const r1 = roundOf(report, 'r1');
  assert.equal(r1.lines.find((row) => row.lineKey === 'rl-kim-bob').state, 'answered');
  assert.ok(report.refusals.some((row) => row.key === 'line-unreachable'));
});

test('a single line is inert and a withdrawn round keeps its ballots as history', () => {
  const report = read(fixture());
  const r4 = roundOf(report, 'r4');
  assert.deepEqual([r4.verdict, r4.votesN, r4.condorcet.exists], ['inert', 0, false]);
  const r5 = roundOf(report, 'r5');
  assert.deepEqual([r5.verdict, r5.ballots.length, r5.withdrawnOn], ['withdrawn', 1, '2026-11-13']);
  assert.equal(r5.pairwise.length, 0, 'a withdrawn round is never aggregated');
});

/* ------------------------------------------------------ 4. load and refuse */

test('the loader drops an incomplete ballot, a duplicate for one line and a wrong holder — never repairs them', () => {
  const warnings = [];
  const rounds = normalizePriorityRoundLedger(rawFixture().priorityRounds, warnings);
  const ballots = normalizePriorityVotes([
    ballot('x1', 'r1', 'home', 'ann', ['p1', 'p2']), // incomplete
    ballot('x2', 'r1', 'home', 'ann', ['p1', 'p1', 'p2']), // duplicate item
    ballot('x3', 'r1', 'home', 'bob', ['p1', 'p2', 'p3']), // not the frozen holder
    ballot('x4', 'r2', 'rl-kim-bob', 'bob', ['p1', 'p4', 'p2']), // valid
    ballot('x5', 'r2', 'rl-kim-bob', 'bob', ['p2', 'p1', 'p4'], '2026-11-13'), // second ballot, later
  ], rounds, warnings);
  assert.deepEqual(ballots.map((row) => row.id), ['x4'], 'only the first complete ballot by the frozen holder survives');
  assert.equal(warnings.length, 1);
  assert.equal(priorityBallotDay('2026-02-30'), null);
  assert.equal(priorityBallotRankingIsPermutation(['a', 'b'], ['a', 'b']), true);
  assert.equal(priorityBallotRankingIsPermutation(['a', 'a'], ['a', 'b']), false);
});

test('the condition signature is fixed-length, identity-free and round-trips through its link summary', () => {
  const sig = priorityBallotSignature('overdue', 'r3|rl-kim-cara');
  assert.match(sig, /^soc1:overdue:[0-9a-f]{16}$/);
  assert.equal(sig.includes('r3'), false, 'no round id reaches the summary');
  const parsed = parsePriorityBallotAskSummary(`Priority ballot condition: ${sig}`);
  assert.deepEqual(parsed, { signature: sig });
  assert.equal(parsePriorityBallotAskSummary('something else'), null);
});

/* -------------------------------------------------------------- 5. the rule */

test('RULE-SOC-01 files exactly the three hand-computed asks, to the right seats', () => {
  const { draft } = runRule(fixture());
  const asks = priorityAsks(draft);
  assert.equal(asks.length, 3);
  assert.deepEqual(asks.map((task) => task.personId).sort(), ['ada', 'bob', 'cara']);
  const cycle = asks.find((task) => task.personId === 'ada');
  assert.match(cycle.title, /disagree/i);
  assert.match(cycle.expectedOutcome, /majority cycle/i);
  assert.match(cycle.expectedOutcome, /Fix the nightly batch/);
  assert.equal(cycle.dueOn, '2026-11-16', 'today + the declared 3-day ask window');
  const bobAsk = asks.find((task) => task.personId === 'bob');
  assert.match(bobAsk.title, /ballot/i);
  assert.equal(bobAsk.authority, 'act-inform');
  // No ask for ann (answered) and none for the Condorcet round.
  assert.equal(openFor(draft, 'ann').length, 0);
  const signatures = asks.map((task) => (draft.links.find((link) => link.targetId === task.id && link.ruleId === PRIORITY_BALLOT_RULE_ID) || {}).summary);
  assert.ok(signatures.every((summary) => /Priority ballot condition: soc1:/.test(summary)));
});

test('RULE-SOC-01 is idempotent, self-closing and pause-governed', () => {
  const first = runRule(fixture()).draft;
  const second = priorityRule(JSON.parse(JSON.stringify(first)), {
    now: NOW, event: { type: PRIORITY_BALLOT_EVENTS.SCAN, entity: 'workspace', entityId: 'matrix-priority' },
    idFactory: (prefix) => `${prefix}-again`, recordEffect: () => {},
  });
  assert.equal(second.length, 0, 'a second pass files nothing new');
  assert.equal(priorityAsks(first).length, 3);

  // Withdrawing the cycle and casting the two missing ballots clears every condition.
  const cleared = JSON.parse(JSON.stringify(first));
  const r1 = cleared.priorityRounds.find((row) => row.id === 'r1');
  r1.withdrawnOn = '2026-11-13'; r1.withdrawnReason = 'The sprint was re-planned before the round could settle.';
  for (const [lineKey, holderId] of [['rl-kim-bob', 'bob'], ['rl-kim-cara', 'cara']]) {
    cleared.priorityBallots.push({ id: `fix-${holderId}`, roundId: 'r3', lineKey, holderId, ranking: ['p2', 'p3'], castOn: '2026-11-13', castAt: '2026-11-13T09:00:00.000Z', note: '' });
  }
  const effects = priorityRule(cleared, {
    now: NOW, event: { type: PRIORITY_BALLOT_EVENTS.ROUND_WITHDRAWN, entity: 'priorityRound', entityId: 'r1' },
    idFactory: (prefix) => `${prefix}-close`, recordEffect: () => {},
  });
  assert.equal(priorityAsks(cleared).filter((task) => task.status === 'active').length, 0, 'every condition cleared');
  assert.equal(priorityAsks(cleared).filter((task) => String(task.completionNote).startsWith(PRIORITY_BALLOT_CLOSED_PREFIX)).length, 3);
  assert.ok(effects.some((effect) => effect.action === 'completed'));

  // A pause stops every path, including an explicit scan.
  const paused = fixture();
  paused.settings = { ...paused.settings, priorityBallotAutoPropagate: false };
  const pausedRun = priorityRule(paused, {
    now: NOW, event: { type: PRIORITY_BALLOT_EVENTS.SCAN, entity: 'workspace', entityId: 'matrix-priority' },
    idFactory: (prefix) => `${prefix}-paused`, recordEffect: () => {},
  });
  assert.deepEqual(pausedRun, []);
  assert.equal(priorityAsks(paused).length, 0);
});

test('an apex the workspace leader holds is observed identity-free, never asked', () => {
  const state = fixture({ annToLeader: true });
  const { draft } = runRule(state);
  const asks = priorityAsks(draft).filter((task) => /disagree/i.test(task.title));
  assert.equal(asks.length, 0, 'the leader is never delegated work in their own name');
  assert.ok((draft.matrixMarkers || []).some((marker) => marker.kind === PRIORITY_BALLOT_MARKER_KIND && /workspace leader/.test(marker.detail)));
});

test('the rule is inert with no round and never reads a derived automation event', () => {
  const empty = fixture();
  empty.priorityRounds = []; empty.priorityBallots = []; empty.delegations = []; empty.links = [];
  assert.deepEqual(runRule(empty).out, []);
  const report = read(fixture());
  const conditions = priorityConditions(report);
  assert.deepEqual(conditions.map((row) => row.kind).sort(), ['cycle', 'overdue-ballot', 'overdue-ballot']);
  const derived = priorityRule(JSON.parse(JSON.stringify(fixture())), {
    now: NOW, derived: true, event: { type: 'automation.propagated', entity: 'workspace', entityId: 'x' }, recordEffect: () => {},
  });
  assert.deepEqual(derived, []);
});

/* ------------------------------------------------------------ 6. the doors */

test('the actions freeze the set, split the ballot by frozen line, and refuse a second ballot', () => {
  const { api, sit, store } = seed(fixture());
  // The operator view can OPEN a round but cannot cast: it is nobody's line holder.
  const declared = api.matrixPriorityDeclareRound({ personId: 'kim', title: 'What Kim does on Monday', itemKeys: ['p1', 'p2'] });
  assert.equal(declared.ok, true, declared.error);
  const created = store.state.priorityRounds.find((row) => row.id === declared.roundId);
  assert.equal(created.itemSnapshot.length, 2);
  assert.equal(created.lineSnapshot.length, 3, 'every active line is frozen');
  const operatorCast = api.matrixPriorityCastBallot({ roundId: declared.roundId, ranking: ['p1', 'p2'] });
  assert.equal(operatorCast.ok, false);

  sit('ann');
  const incomplete = api.matrixPriorityCastBallot({ roundId: declared.roundId, ranking: ['p1'] });
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.error, /Rank every frozen item/);
  const unknown = api.matrixPriorityCastBallot({ roundId: declared.roundId, ranking: ['p1', 'p9'] });
  assert.equal(unknown.ok, false);
  const cast = api.matrixPriorityCastBallot({ roundId: declared.roundId, ranking: ['p2', 'p1'] });
  assert.equal(cast.ok, true, cast.error);
  const again = api.matrixPriorityCastBallot({ roundId: declared.roundId, ranking: ['p1', 'p2'] });
  assert.equal(again.ok, false);
  assert.match(again.error, /already cast/);
});

test('a manager who holds no line over the person cannot open a round, and a closed item cannot be frozen', () => {
  const { api, sit, store } = seed(fixture());
  sit('bob');
  const notMine = api.matrixPriorityDeclareRound({ personId: 'tom', title: 'Tom’s priorities this week', itemKeys: ['t1', 't2'] });
  assert.equal(notMine.ok, false, 'bob holds no line over tom');
  sit('ann');
  // p4 is delivered AFTER the fixture loaded: a closed item has no priority
  // question left in it, so it cannot be frozen into a new round.
  store.update((draft) => { draft.portfolio = draft.portfolio.map((row) => (row.id === 'p4' ? { ...row, status: 'done', completedOn: '2026-11-12' } : row)); },
    { type: 'portfolio.completed', entity: 'portfolio', entityId: 'p4', summary: 'p4 delivered' });
  const closed = api.matrixPriorityDeclareRound({ personId: 'kim', title: 'A set with a stale item', itemKeys: ['p1', 'p4'] });
  assert.equal(closed.ok, false, 'a delivered item cannot be frozen');
  assert.match(closed.error, /not a live open portfolio item/);
  const live = api.matrixPriorityDeclareRound({ personId: 'kim', title: 'Two live items only', itemKeys: ['p1', 'p2'] });
  assert.equal(live.ok, true, live.error);
  const duplicate = api.matrixPriorityDeclareRound({ personId: 'kim', title: 'The same set again please', itemKeys: ['p2', 'p1'] });
  assert.equal(duplicate.ok, false, 'an identical live set is refused');
  assert.match(duplicate.error, /already exists/);
});

test('a ballot cast after the line ended is refused, and a holder of two frozen lines must name one', () => {
  const { api, sit, store } = seed(fixture());
  const announce = api.matrixPriorityDeclareRound({ personId: 'kim', title: 'Monday queue for every line', itemKeys: ['p1', 'p2'] });
  assert.equal(announce.ok, true, announce.error);
  // The declared project line ends AFTER the round froze it. The round keeps the
  // holder it asked; bob can no longer cast for a line he no longer holds.
  store.update((draft) => {
    draft.reportingLines = draft.reportingLines.map((row) => (row.id === 'rl-kim-bob' ? { ...row, toISO: '2026-11-12' } : row));
  }, { type: 'reporting.line.ended', entity: 'reportingLine', entityId: 'rl-kim-bob', summary: 'line ended' });
  sit('bob');
  const ended = api.matrixPriorityCastBallot({ roundId: announce.roundId, lineKey: 'rl-kim-bob', ranking: ['p1', 'p2'] });
  assert.equal(ended.ok, false);
  assert.match(ended.error, /ended or been re-pointed/);

  // A manager who holds no line over the person cannot cast into the round:
  // cara's line was not frozen into this one, so she has no ballot to give it.
  const other = seed(fixture());
  const onlyTwo = other.api.matrixPriorityDeclareRound({ personId: 'tom', title: 'Tom’s other two items', itemKeys: ['t1', 't3'] });
  assert.equal(onlyTwo.ok, true, onlyTwo.error);
  other.sit('bob');
  const stranger = other.api.matrixPriorityCastBallot({ roundId: onlyTwo.roundId, ranking: ['t1', 't3'] });
  assert.equal(stranger.ok, false);
  assert.match(stranger.error, /held no such line when the round opened/);
});

test('conventions are refused outside their bounds, and a scan runs the spine', () => {
  const { api, sit, store } = seed(fixture());
  sit('ada');
  const bad = api.matrixPrioritySetConventions({ priorityMinBallots: 9 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /whole number from 2 to 6/);
  const good = api.matrixPrioritySetConventions({ priorityBallotDueDays: 7, priorityMinBallots: 3 });
  assert.equal(good.ok, true, good.error);
  assert.equal(good.conventions.priorityBallotDueDays, 7);
  // The conventions write already ran RULE-SOC-01 on the shared spine, so the
  // scan is idempotent: it re-derives the same three conditions and files no
  // second ask for any of them.
  const before = priorityAsks(store.state).length;
  const scan = api.matrixPriorityScan();
  assert.equal(scan.ok, true, scan.error);
  assert.equal(priorityAsks(store.state).length, before, 'the scan files nothing twice');
  assert.equal(before, 3, 'the three hand-computed conditions are on the record');
});

/* -------------------------------------------------------- 7. export and view */

test('CSV #144 carries counts only and prints the same figures the reader printed', () => {
  const state = fixture();
  const report = read(state);
  const rows = priorityBallotCsvRows(report);
  assert.equal(rows[0].row_type, 'workspace');
  assert.equal(rows[0].rounds_n, 5);
  assert.equal(rows[0].ballots_cast_n, 7);
  assert.equal(rows[0].lines_asked_n, 10);
  assert.equal(rows.filter((row) => row.row_type === 'verdict').length, 5);
  assert.equal(rows.filter((row) => row.row_type === 'coverage').length, 6);
  assert.equal(rows[0].coverage_pct, 70);
  for (const row of rows) {
    for (const column of PRIORITY_BALLOT_CSV_COLUMNS) assert.ok(Object.prototype.hasOwnProperty.call(row, column), `${column} is present on every row`);
  }
  const csv = exportWorkspaceCsv(state, PRIORITY_BALLOT_CSV_SCOPE, { now: NOW });
  assert.equal(csv.ok, true, csv.reason);
  const text = String(csv.text || csv.csv || '');
  for (const secret of ['Kim', 'Ann', 'Bob', 'Cara', 'nightly batch', 'p1', 'rl-kim-bob']) {
    assert.equal(text.includes(secret), false, `${secret} must not reach the export`);
  }
});

test('the panel renders the round it was given, its verdict, and a real ballot button for the seat', () => {
  withDom(() => {
    const state = fixture();
    const ctx = { state, query: new URLSearchParams('panel=board'), navigate: () => {}, refresh: () => {}, api: {} };
    const node = renderMatrixPriorityPanel(ctx, { now: NOW });
    globalThis.document.body.appendChild(node);
    assert.equal(node.getAttribute('data-testid'), 'priority-panel', 'the panel root renders');
    const text = node.textContent;
    assert.match(text, /What Kim works on first/);
    assert.match(text, /Genuine disagreement/);
    assert.match(text, /Majority winner/);
    assert.match(text, /Condorcet winner/);
    assert.match(text, /Schwartz top cycle/);
    assert.ok(node.querySelector('[data-testid="priority-stats"]'), 'the stat grid renders');
    // No api means no act buttons — the screen never invents one.
    assert.equal(node.querySelector('[data-testid^="priority-ballot-"]'), null);
    const method = renderMatrixPriorityPanel({ ...ctx, query: new URLSearchParams('panel=method') }, { now: NOW });
    assert.match(method.textContent, /Method and what it refuses/);
    assert.match(method.textContent, /Bodies of work/);
  });
});

test('the brief states the separate claims and names no person or item', () => {
  const report = read(fixture());
  const text = priorityBallotBriefText(report);
  assert.match(text, /5 round\(s\)/);
  assert.match(text, /7 cast one/);
  assert.match(text, /1 hold a genuine majority cycle/);
  assert.match(text, /Counts reconcile/);
  for (const secret of ['Kim', 'Ann', 'nightly batch']) assert.equal(text.includes(secret), false);
});
