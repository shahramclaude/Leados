/**
 * ADR-0135 — the Board Room carry-forward ledger (Schema v118 unchanged).
 *
 * Proves, against the REAL schema, the REAL store/API and the REAL view:
 *  - a look is a FROZEN snapshot: drafts carry nothing and are not counted;
 *  - with one pack every claim is a first look, no direction is claimed, and the
 *    refusal is printed rather than filled in;
 *  - movement is CLASSIFIED, not summarised: separated intervals are evidence,
 *    overlapping intervals are not, a moved declared threshold outranks both,
 *    and a reading with no interval is unresolved rather than assumed;
 *  - a streak carries only when it reaches the declared floor, the carried-since
 *    date is the OLDEST look in the current unbroken carry, and a claim that
 *    failed, held, then failed carries nothing;
 *  - a figure nobody could produce for two packs is carried as measurement debt;
 *  - the queue is bounded, ordered oldest-carry-first, and the remainder is
 *    counted rather than dropped;
 *  - the ledger is deterministic and order-independent, carries no memo id or
 *    person, and travels into the upward brief and the aggregate CSV;
 *  - a SUPERSEDED pack keeps its frozen snapshot across a reload, because the
 *    board was shown it and erasing it would shorten the record silently;
 *  - the Cycle panel renders at the chief altitude over real synced state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { normalizeBoardMemo, normalizeBoardMemos } from '../../app/core/domain/boardSchema.js';
import { BOARD_CLAIMS, BOARD_CONTINUITY, BOARD_PANELS } from '../../app/core/domain/boardRegistry.js';
import {
  boardContinuity, boardCarryForwardText, boardContinuityBrief, boardLooks,
} from '../../app/core/domain/boardContinuity.js';
import { boardRead, boardBriefText, boardCsvRows } from '../../app/core/domain/board.js';
import { CSV_EXPORTS } from '../../app/core/csv.js';
import { SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { renderBoard } from '../../app/views/board.js';

const NOW = new Date('2026-11-08T12:00:00.000Z');

/* --------------------------------------------------------------- fixtures */

const claim = (key, { verdict, value = null, lower = null, upper = null, n = 0, threshold = 60, tag = 'recomputed' }) => ({
  key, verdict, value, lower, upper, n, threshold, tag,
});

/** One frozen pack. `at` is the instant the verdicts were written down. */
const pack = (id, at, claims, { cycle = '', status = 'frozen', revision = 1 } = {}) => ({
  id,
  revision,
  title: `Pack ${id}`,
  cycle,
  status,
  ownerNodeId: null,
  ownerSeatId: null,
  claims: claims.map((c) => ({
    key: c.key, comparator: 'gte', unit: 'pct', threshold: c.threshold,
    declaredAt: at, declaredBy: null, lookedAt: at, lastLookAt: at,
    revisedAfterLook: false, revisionCount: 0, note: '',
  })),
  snapshot: { takenAt: at, fingerprint: 'abcd1234', claims },
  lookCount: 1,
  lastLookAt: at,
  openedAt: at,
  openedBy: null,
  committedAt: status === 'committed' || status === 'frozen' ? at : null,
  frozenAt: status === 'frozen' ? at : null,
  supersededAt: null,
  createdAt: at,
  updatedAt: at,
});

function stateWith(memos) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Root', chainLeaderAltitude: 'chief', activeSeatId: null };
  state.people = [
    { id: 'vp1', name: 'Rina VP', role: 'VP', level: 'vp', managerId: null, status: 'active' },
    { id: 'dir1', name: 'Sam Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mei Manager', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
    { id: 'ic1', name: 'Ari Klein', role: 'Operator', level: 'ic', managerId: 'mgr1', status: 'active' },
  ];
  state.boardMemos = memos;
  return normalizeState(state, { now: NOW }).state;
}

function boot(state = stateWith([])) {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  const idFactory = (p) => `${p}-test-${++seq}`;
  const now = () => NOW;
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now, idFactory });
  store.load();
  return { store, api: createApi(store, { now, idFactory }) };
}

function bootDocument() {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(String(e?.message || e)));
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole: vc });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  return { dom, errors };
}

const byKey = (report, key) => report.claims.find((c) => c.key === key);

function governedDecision(id, memoId, {
  claimKey = 'bench-coverage', chosen = '', reviewOn = '2026-12-01', reviewedOn = null,
  decidedOn = null, question = null,
} = {}) {
  const declared = BOARD_CLAIMS.find((row) => row.key === claimKey);
  return {
    decision: {
      id, title: `Board line fails: ${declared.label}`,
      question: question || `${declared.assertion} Which correction do we fund?`,
      date: '2026-10-01', chosen, reviewOn, reviewedOn, decidedOn,
      outcome: reviewedOn ? 'worked' : 'pending', outcomeNotes: '',
      options: [{ id: `${id}-opt`, label: 'Fund the correction', pros: '', cons: '' }],
      createdAt: '2026-10-01T10:00:00.000Z',
    },
    link: {
      id: `lnk-${id}`, sourceType: 'decision', sourceId: id,
      targetType: 'boardmemo', targetId: memoId, relation: 'escalates-from',
      ruleId: 'RULE-BRD-01', createdAt: '2026-10-01T10:00:00.000Z',
    },
  };
}

function stateWithResponses(rows) {
  const state = stateWith(TWO_PACKS());
  state.decisions = rows.map((row) => row.decision);
  state.links = rows.map((row) => row.link);
  return normalizeState(state, { now: NOW }).state;
}

/* Two packs that exercise every transition class at once. */
const TWO_PACKS = () => [
  // Stored newest-first on purpose: the ledger must order by the frozen instant.
  pack('brm-new', '2026-10-01T09:00:00.000Z', [
    claim('bench-coverage', { verdict: 'failing', value: 41, lower: 30, upper: 53, n: 20, threshold: 60 }),
    claim('bench-concentration', { verdict: 'holding', value: 18, lower: 12, upper: 26, n: 20, threshold: 25 }),
    claim('promise-reliability', { verdict: 'refused', n: 0, threshold: 75, tag: 'refused' }),
    claim('authority-hold', { verdict: 'holding', value: 74, lower: 70, upper: 78, n: 40, threshold: 70 }),
  ], { cycle: '2026-Q4' }),
  pack('brm-old', '2026-01-15T09:00:00.000Z', [
    claim('bench-coverage', { verdict: 'failing', value: 52, lower: 42, upper: 62, n: 18, threshold: 60 }),
    claim('bench-concentration', { verdict: 'failing', value: 31, lower: 22, upper: 41, n: 18, threshold: 25 }),
    claim('promise-reliability', { verdict: 'withheld', n: 2, threshold: 75, tag: 'withheld' }),
    claim('authority-hold', { verdict: 'holding', value: 60, lower: 52, upper: 68, n: 30, threshold: 70 }),
  ], { cycle: '2026-Q1' }),
];

/* ---------------------------------------------------------- schema/wiring */

test('the vocabulary and the bounded windows are declared once, and the panel exists', () => {
  assert.equal(SCHEMA_VERSION, 155, 'no schema bump: the ledger stores nothing');
  assert.ok(BOARD_PANELS.includes('cycle'), 'the Cycle panel is a declared panel');
  assert.equal(BOARD_CONTINUITY.streakFloor, 2);
  assert.deepEqual(Object.values(BOARD_CONTINUITY.transitions).sort(),
    ['first-look', 'inside-noise', 'ruler-moved', 'separated', 'steady', 'unclassified']);
  assert.ok(BOARD_CONTINUITY.looks >= BOARD_CONTINUITY.streakFloor, 'the look window can hold a streak');
  assert.ok(BOARD_CONTINUITY.method.length >= 4, 'every named method is printed');
  assert.match(BOARD_CONTINUITY.method.map((m) => m.name).join(' | '), /Wilson/);
  assert.ok(SAFE_READS.has('boardContinuity') && SAFE_READS.has('boardContinuityText'), 'readable under enforcement');
});

test('a superseded pack keeps its frozen snapshot across a reload; a draft still cannot carry one', () => {
  const [newer, older] = TWO_PACKS();
  const superseded = { ...older, status: 'superseded', supersededAt: '2026-02-01T00:00:00.000Z' };
  const normalized = normalizeBoardMemos([superseded], [], { cap: 10 });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].status, 'superseded');
  assert.ok(normalized[0].snapshot, 'the pack the board was shown stays readable');
  assert.equal(normalized[0].snapshot.claims.length, 4);

  const draft = normalizeBoardMemo({ ...newer, status: 'draft', committedAt: null, frozenAt: null }, []);
  assert.equal(draft.snapshot, null, 'a verdict nobody froze is not a disclosure');
});

/* ------------------------------------------------------------- the ledger */

test('with no frozen pack the ledger refuses rather than reporting zero movement', () => {
  const state = stateWith([{ ...pack('brm-draft', '2026-10-01T09:00:00.000Z', [claim('bench-coverage', { verdict: 'failing', value: 40, lower: 30, upper: 50, n: 10 })], { status: 'draft' }), snapshot: { takenAt: '2026-10-01T09:00:00.000Z', claims: [] } }]);
  const report = boardContinuity(state, { now: NOW });
  assert.equal(report.counts.looks, 0);
  assert.equal(report.counts.carryForward, 0);
  assert.equal(report.slice.length, 0);
  assert.match(report.refusals[0], /No frozen or committed pack exists/);
  assert.match(boardCarryForwardText(state, { now: NOW }), /No pack has been frozen/);
  assert.match(boardContinuityBrief(state, { now: NOW }), /no frozen pack exists/);
});

test('one pack is a reading, not a movement: every claim is a first look and every count is honest', () => {
  const one = [TWO_PACKS()[0]];
  const state = stateWith(one);
  const report = boardContinuity(state, { now: NOW });
  assert.equal(report.counts.looks, 1);
  assert.equal(report.counts.claimsTracked, 4);
  assert.equal(report.counts.firstLook, 4);
  assert.equal(report.counts.separated + report.counts.insideNoise + report.counts.rulerMoved, 0);
  for (const row of report.claims) {
    assert.equal(row.transition, 'first-look');
    assert.equal(row.movePp, null);
    assert.equal(row.carryForward, false, 'a single look cannot carry');
  }
  assert.ok(report.refusals.some((r) => /One pack is a reading, not a movement/.test(r)));
  assert.equal(report.counts.claimsNeverLooked, BOARD_CLAIMS.length - 4);
});

test('the read is order-independent: storage order cannot change the ledger', () => {
  const newestFirst = stateWith(TWO_PACKS());
  const oldestFirst = stateWith([...TWO_PACKS()].reverse());
  const a = boardContinuity(newestFirst, { now: NOW });
  const b = boardContinuity(oldestFirst, { now: NOW });
  assert.deepEqual(a.counts, b.counts);
  assert.deepEqual(a.claims.map((c) => [c.key, c.transition, c.movePp, c.carryLength]), b.claims.map((c) => [c.key, c.transition, c.movePp, c.carryLength]));
  assert.deepEqual(boardLooks(newestFirst).map((l) => l.memoId), ['brm-old', 'brm-new']);
});

test('movement is classified by the interval screen, never summarised into a direction', () => {
  const report = boardContinuity(stateWith(TWO_PACKS()), { now: NOW });

  // authority-hold: HOLDS → HOLDS, intervals overlap. Verdict identical, so the
  // class is steady even though the point estimate rose 14pp.
  const authority = byKey(report, 'authority-hold');
  assert.equal(authority.transition, 'steady');
  assert.equal(authority.movePp, 14, 'the movement is still reported, it is just not called evidence');

  // bench-concentration: FAILS → HOLDS with overlapping intervals (22–41 vs
  // 12–26) — the conservative end crossed the bar, the record did not move.
  const concentration = byKey(report, 'bench-concentration');
  assert.equal(concentration.transition, 'inside-noise');
  assert.equal(concentration.movePp, -13);
  assert.match(concentration.transitionReason, /overlap/);

  // bench-coverage: FAILS → FAILS: steady, and carried.
  const coverage = byKey(report, 'bench-coverage');
  assert.equal(coverage.transition, 'steady');
  assert.equal(coverage.movePp, -11);
  assert.equal(coverage.carryReason, 'recurring-failure');
});

test('separated intervals are the only movement called evidence, and a moved bar outranks them', () => {
  const separated = stateWith([
    pack('p2', '2026-10-01T09:00:00.000Z', [claim('bench-coverage', { verdict: 'failing', value: 35, lower: 30, upper: 41, n: 40, threshold: 60 })]),
    pack('p1', '2026-01-15T09:00:00.000Z', [claim('bench-coverage', { verdict: 'holding', value: 72, lower: 66, upper: 78, n: 40, threshold: 60 })]),
  ]);
  const spaced = byKey(boardContinuity(separated, { now: NOW }), 'bench-coverage');
  assert.equal(spaced.transition, 'separated');
  assert.match(spaced.transitionReason, /do not overlap/);

  const movedBar = stateWith([
    pack('p2', '2026-10-01T09:00:00.000Z', [claim('bench-coverage', { verdict: 'failing', value: 35, lower: 30, upper: 41, n: 40, threshold: 70 })]),
    pack('p1', '2026-01-15T09:00:00.000Z', [claim('bench-coverage', { verdict: 'holding', value: 72, lower: 66, upper: 78, n: 40, threshold: 60 })]),
  ]);
  const ruler = byKey(boardContinuity(movedBar, { now: NOW }), 'bench-coverage');
  assert.equal(ruler.transition, 'ruler-moved');
  assert.match(ruler.transitionReason, /ruler, not to the record/);
});

test('a changed verdict with no interval is unresolved and says so', () => {
  const state = stateWith([
    pack('p2', '2026-10-01T09:00:00.000Z', [claim('bench-coverage', { verdict: 'failing', value: null, lower: null, upper: null, n: 3, threshold: 60, tag: 'withheld' })]),
    pack('p1', '2026-01-15T09:00:00.000Z', [claim('bench-coverage', { verdict: 'holding', value: 68, lower: null, upper: null, n: 1, threshold: 60 })]),
  ]);
  const report = boardContinuity(state, { now: NOW });
  const row = byKey(report, 'bench-coverage');
  assert.equal(row.transition, 'unclassified');
  assert.match(row.transitionReason, /no interval/);
  assert.ok(report.refusals.some((r) => /unresolved rather than adjudicated/.test(r)));
});

test('a streak carries only at the declared floor, and its age is the oldest look in the unbroken carry', () => {
  const three = stateWith([
    pack('p3', '2026-10-01T09:00:00.000Z', [claim('bench-coverage', { verdict: 'failing', value: 40, lower: 33, upper: 47, n: 30 })]),
    pack('p2', '2026-06-01T09:00:00.000Z', [claim('bench-coverage', { verdict: 'failing', value: 44, lower: 37, upper: 51, n: 30 })]),
    pack('p1', '2026-01-15T09:00:00.000Z', [claim('bench-coverage', { verdict: 'failing', value: 48, lower: 41, upper: 55, n: 30 })]),
  ]);
  const carried = byKey(boardContinuity(three, { now: NOW }), 'bench-coverage');
  assert.equal(carried.failingStreak, 3);
  assert.equal(carried.carryLength, 3);
  assert.equal(carried.carriedSince, '2026-01-15', 'the chief can answer "how long has this been on the list?"');
  assert.equal(carried.carryForward, true);

  // fail → hold → fail: nothing has carried, because the failure did not repeat.
  const broken = stateWith([
    pack('p3', '2026-10-01T09:00:00.000Z', [claim('bench-coverage', { verdict: 'failing', value: 40, lower: 33, upper: 47, n: 30 })]),
    pack('p2', '2026-06-01T09:00:00.000Z', [claim('bench-coverage', { verdict: 'holding', value: 66, lower: 60, upper: 72, n: 30 })]),
    pack('p1', '2026-01-15T09:00:00.000Z', [claim('bench-coverage', { verdict: 'failing', value: 48, lower: 41, upper: 55, n: 30 })]),
  ]);
  const notCarried = byKey(boardContinuity(broken, { now: NOW }), 'bench-coverage');
  assert.equal(notCarried.failingStreak, 1);
  assert.equal(notCarried.carryForward, false);
  assert.equal(notCarried.transition, 'separated', 'it moved, and the movement is still reported');
});

test('a figure nobody could produce is carried as measurement debt, not as a finding about anyone', () => {
  const report = boardContinuity(stateWith(TWO_PACKS()), { now: NOW });
  const promise = byKey(report, 'promise-reliability');
  assert.equal(promise.unverifiedStreak, 2);
  assert.equal(promise.carryReason, 'repeated-unverified');
  assert.equal(promise.carryForward, true);
  const text = boardCarryForwardText(stateWith(TWO_PACKS()), { now: NOW });
  assert.match(text, /FIGURE STILL NOT PRODUCIBLE/);
  assert.match(text, /measurement debt/);
});

test('the queue is oldest-carry-first, bounded, and the remainder is counted', () => {
  const report = boardContinuity(stateWith(TWO_PACKS()), { now: NOW });
  assert.equal(report.counts.carryForward, 2);
  assert.deepEqual(report.slice.map((c) => c.key), ['bench-coverage', 'promise-reliability'],
    'both were carried from the same look, so the register order breaks the tie');
  assert.equal(report.counts.queueDeferred, 0);

  const longer = stateWith([
    pack('p3', '2026-10-01T09:00:00.000Z', [
      claim('bench-coverage', { verdict: 'failing', value: 40, lower: 33, upper: 47, n: 30 }),
      claim('promise-reliability', { verdict: 'refused', n: 0, threshold: 75, tag: 'refused' }),
    ]),
    pack('p2', '2026-06-01T09:00:00.000Z', [
      claim('bench-coverage', { verdict: 'failing', value: 44, lower: 37, upper: 51, n: 30 }),
      claim('promise-reliability', { verdict: 'refused', n: 0, threshold: 75, tag: 'refused' }),
    ]),
    pack('p1', '2026-01-15T09:00:00.000Z', [
      claim('bench-coverage', { verdict: 'failing', value: 48, lower: 41, upper: 55, n: 30 }),
      claim('promise-reliability', { verdict: 'refused', n: 0, threshold: 75, tag: 'refused' }),
    ]),
  ]);
  const aged = boardContinuity(longer, { now: NOW });
  assert.equal(byKey(aged, 'bench-coverage').carryLength, 3);
  assert.equal(byKey(aged, 'promise-reliability').carryLength, 3);
  assert.equal(aged.counts.queueDeferred, 0);
});

/* ------------------------------------------------------ governed response */

test('the latest failing pack cannot borrow coverage from an earlier decision, and provenance is never guessed', () => {
  const uncovered = byKey(boardContinuity(stateWith(TWO_PACKS()), { now: NOW }), 'bench-coverage');
  assert.equal(uncovered.response.state, 'uncovered');
  assert.equal(uncovered.response.uncoveredPacks, 2);
  assert.equal(uncovered.response.route, '#/board?panel=memo');
  assert.equal(boardContinuity(stateWith(TWO_PACKS()), { now: NOW }).counts.responseDebt, 1);
  assert.equal(byKey(boardContinuity(stateWith(TWO_PACKS()), { now: NOW }), 'promise-reliability').response.state, 'not-required');

  const prior = governedDecision('dec-old', 'brm-old', { chosen: 'Fund the correction', decidedOn: '2026-02-01', reviewedOn: '2026-03-01' });
  const state = stateWithResponses([prior]);
  const report = boardContinuity(state, { now: NOW });
  const current = byKey(report, 'bench-coverage');
  assert.equal(current.response.state, 'uncovered', 'a reviewed response to the old pack does not answer the new one');
  assert.equal(current.response.uncoveredPacks, 1);
  assert.equal(current.response.decisions, 1);
  assert.equal(current.response.decisionId, 'dec-old');
  assert.match(current.response.route, /dec-old/);

  const wrongAssertion = governedDecision('dec-wrong', 'brm-new', { question: 'A differently worded question with no exact claim assertion.' });
  const guessed = byKey(boardContinuity(stateWithResponses([prior, wrongAssertion]), { now: NOW }), 'bench-coverage');
  assert.equal(guessed.response.state, 'uncovered', 'a typed edge alone cannot guess which claim a decision answers');
});

test('response debt distinguishes undecided work, a due outcome review and a fully reviewed response', () => {
  const older = governedDecision('dec-old', 'brm-old');
  const newer = governedDecision('dec-new', 'brm-new', { chosen: 'Fund the correction', decidedOn: '2026-10-02' });
  let report = boardContinuity(stateWithResponses([older, newer]), { now: NOW });
  let response = byKey(report, 'bench-coverage').response;
  assert.equal(response.state, 'undecided', 'an older open call remains work even when the latest call was made');
  assert.equal(response.undecided, 1);
  assert.equal(response.decisionId, 'dec-old', 'the action opens the unresolved call, not an already-chosen newer one');
  assert.equal(report.counts.responseUndecided, 1);

  older.decision.chosen = 'Fund the correction';
  older.decision.decidedOn = '2026-02-01';
  older.decision.reviewedOn = '2026-03-01';
  older.decision.outcome = 'worked';
  newer.decision.reviewOn = '2026-11-01';
  report = boardContinuity(stateWithResponses([older, newer]), { now: NOW });
  response = byKey(report, 'bench-coverage').response;
  assert.equal(response.state, 'review-due');
  assert.equal(response.reviewDue, 1);
  assert.equal(report.counts.responseReviewDue, 1);
  assert.match(response.reason, /choice is not evidence/);

  newer.decision.reviewedOn = '2026-11-03';
  newer.decision.outcome = 'worked';
  report = boardContinuity(stateWithResponses([older, newer]), { now: NOW });
  response = byKey(report, 'bench-coverage').response;
  assert.equal(response.state, 'reviewed');
  assert.equal(response.reviewed, 2);
  assert.equal(report.counts.responseDebt, 0, 'review never rewrites the still-failing frozen verdict');
  assert.equal(byKey(report, 'bench-coverage').latest.verdict, 'failing');
  assert.match(boardCarryForwardText(stateWithResponses([older, newer]), { now: NOW }), /Governed response: REVIEWED/);
});

/* ------------------------------------------------------------ text/brief/CSV */

test('the ledger text is deterministic, names no memo or person, and prints its method', () => {
  const state = stateWith(TWO_PACKS());
  const first = boardCarryForwardText(state, { now: NOW });
  const second = boardCarryForwardText(state, { now: NOW });
  assert.equal(first, second, 'the same record produces the same document');
  assert.ok(!first.includes('brm-new') && !first.includes('brm-old'), 'no memo id crosses');
  for (const person of ['Dana Root', 'Rina VP', 'Sam Director', 'Mei Manager']) {
    assert.ok(!first.includes(person), `no person name (${person})`);
  }
  assert.match(first, /BOARD CARRY-FORWARD LEDGER/);
  assert.match(first, /carry floor: 2 consecutive packs \(declared convention\)/);
  assert.match(first, /Trail: FAILS 2026-01-15 · FAILS 2026-10-01/);
  assert.match(first, /METHOD/);
  assert.match(first, /Wilson/);
});

test('the read travels into the board brief and the aggregate CSV', () => {
  const state = stateWith(TWO_PACKS());
  const brief = boardBriefText(state, { now: NOW });
  assert.match(brief, /Board carry-forward across 2 packs/);
  assert.match(brief, /2 claim\(s\) carried/);

  const read = boardRead(state, { now: NOW });
  assert.equal(read.continuity.counts.looks, 2, 'the read is on the existing board read model');

  const rows = boardCsvRows(state, { now: NOW });
  const workspace = rows.find((r) => r.scope === 'workspace');
  assert.equal(workspace.packs, 2);
  assert.equal(workspace.carry_forward, '', 'the workspace row carries counts, not a verdict');
  const coverage = rows.find((r) => r.claim === 'bench-coverage');
  assert.equal(coverage.carry_forward, 'yes');
  assert.equal(coverage.carry_reason, 'recurring-failure');
  assert.equal(coverage.failing_streak, 2);
  assert.equal(coverage.transition, 'steady');
  assert.equal(coverage.move_pp, -11);
  assert.equal(coverage.response_state, 'uncovered');
  assert.equal(coverage.response_uncovered_packs, 2);
  assert.equal(workspace.response_uncovered_packs, 2);
  assert.match(brief, /Governed response debt: 1/);
  const spec = CSV_EXPORTS.find((e) => e.key === 'board-claims');
  assert.match(spec.description, /carry-forward/);
});

/* ------------------------------------------------------------------ the API */

test('the store API reads the ledger from real synced state and writes nothing', () => {
  const { store, api } = boot(stateWith(TWO_PACKS()));
  const before = JSON.stringify(store.state.boardMemos);
  const report = api.boardContinuity();
  assert.equal(report.counts.looks, 2);
  assert.equal(report.counts.carryForward, 2);
  assert.equal(JSON.stringify(store.state.boardMemos), before, 'a read never mutates the record');
  const text = api.boardContinuityText();
  assert.equal(text.ok, true);
  assert.match(text.text, /BOARD CARRY-FORWARD LEDGER/);
});

/* --------------------------------------------------------------- the view */

test('the Cycle panel renders the queue over real state with no dead end', () => {
  const { dom, errors } = bootDocument();
  try {
    const { api } = boot(stateWith(TWO_PACKS()));
    const ctx = {
      api,
      now: NOW,
      query: new URLSearchParams('panel=cycle'),
      navigate: () => {},
      refresh: () => {},
      seatContext: { seat: { fullAccess: false, rank: 5, label: 'CEO / C-suite' } },
    };
    const node = renderBoard(ctx);
    assert.equal(node.tagName, 'DIV');
    assert.equal(node.querySelector('main'), null, 'no duplicate main landmark');
    const text = node.textContent;
    assert.match(text, /Carry-forward queue/);
    assert.match(text, /Bench coverage/);
    assert.match(text, /Carried since|carried since|2026-01-15/);
    assert.match(text, /Wilson/);
    assert.match(text, /Figure still not producible|FIGURE STILL NOT/i);
    assert.match(text, /Governed response debt/);
    assert.match(text, /Open memo to reconcile/);
    for (const button of node.querySelectorAll('button')) {
      assert.ok((button.textContent || '').trim().length > 0 || button.getAttribute('aria-label'), 'every button has a name');
    }
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
