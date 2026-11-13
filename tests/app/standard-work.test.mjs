/**
 * tests/app/standard-work.test.mjs — ADR-0190, Session 258, Schema v150,
 * `#/standard-work`, CSV scope #143, RULE-LSW-01.
 *
 * ONE focused pass over what this session built. Every expected number below is
 * worked out BY HAND from the fixture and written here before it is asserted.
 *
 * THE FIXTURE (single-chain AND matrix). Reading day Friday 2026-11-13.
 * ISO weeks: W43 = 10-19..10-25, W44 = 10-26..11-01, W45 = 11-02..11-08,
 * W46 = 11-09..11-15 (the current, still-open week). Read window 28 days →
 * from 2026-10-16.
 *
 *   leader (workspace)
 *    └ ada (vp)
 *       ├ ann (director)            home-line manager of kim and ria
 *       │   ├ kim (lead) ── tom (ic)        kim ALSO holds a project line to bob
 *       │   └ ria (lead) ── uma (ic)        ria holds ONE line
 *       └ bob (manager)             declared PROJECT line over kim (rl-kim-bob)
 *
 *   R1  ria  daily Mon–Fri from 11-02, no line named  → single-line, next tier ann
 *   R2  kim  daily Mon–Fri from 11-02, line rl-kim-bob → named-line,  next tier BOB
 *   R3  kim  weekly        from 11-02, no line named  → AMBIGUOUS (two lines)
 *   R4  ann  weekly        from 10-19, no line named  → single-line, next tier ada
 *
 * HAND-COMPUTED SLOTS.
 *   R1: owed 11-02,03,04,05,06,09,10,11,12 (9 closed) + 11-13 (open).
 *       done 02,03,05,09,12 = 5 · abnormal 04,10,11 = 3 · missed 06 = 1 · unrecorded 0.
 *       adherence (5+3)/9 = 88.9%. Wilson 95%: p=.8889, n=9, z=1.96 →
 *       (p + z²/2n ∓ z√(p(1−p)/n + z²/4n²)) / (1 + z²/n)
 *       = (.8889 + .2134 ∓ .2962) / 1.4268 = 56.5% … 98.0%.
 *       last closed slot (11-12) is done → run 0 → verdict GAPS (one miss).
 *   R2: done 02..06 = 5 · unrecorded 09,10,11,12 = 4 · closed 9 · open 1.
 *       adherence 5/9 = 55.6%; Wilson (.5556 + .2134 ∓ .3885)/1.4268 = 26.7% … 81.1%.
 *       trailing run of not-done closed slots = 4 ≥ lapse run 3 → LAPSED.
 *       zero findings in 5 checks → exact upper bound 1 − 0.05^(1/5) = 45.1%.
 *   R3: W45 done (closed 1), W46 open. 1 < slot floor 5 → rate WITHHELD. HELD.
 *   R4: W43, W44, W45 unrecorded (closed 3), W46 open. Rate withheld. Run 3 → LAPSED.
 *
 *   Totals: closed 9+9+1+3 = 22 = done 11 + abnormal 3 + missed 1 + unrecorded 7.
 *   open 4. adherence 14/22 = 63.6%; Wilson (.6364 + .0873 ∓ .2192)/1.1746 = 43.0 … 80.3.
 *   verdicts: lapsed 2 · gaps 1 · held 1 · new 0. owners 3 (ria, kim, ann).
 *   tier states: single-line 2 · named-line 1 · ambiguous 1.
 *
 * ESCALATIONS.
 *   c3 (R1, 11-04) → ann, no act. Age 9 days > tier window 2 → OVERDUE, due 11-06.
 *   c7 (R1, 11-10) → ann; ann escalated to ada 11-11; ada contained 11-12
 *      → CONTAINED after 2 hops. Median hops over closed chains = 2.
 *
 * SPANS (the matrix roll-up; kim is reached by ada through ann AND through bob).
 *   ann: R1,R2,R3 → 3 routines, closed 19, done-ish 14 → 73.7%; 0 via a dotted line.
 *   bob: R2,R3   → 2 routines, closed 10, done-ish 6 → 60.0%; BOTH via the dotted line.
 *   ada: 4 routines, closed 22 — NOT 32: kim's 10 closed slots are counted once.
 *   leader: 4 routines, closed 22.
 *
 * STRUCTURED TIME (2400-minute week). ria 5×20 = 100 min → 4.2%; kim 100+20 = 120
 * → 5.0%; ann 20 → 0.8%. All below their reference band.
 *
 * RULE-LSW-01 on this record files exactly three asks:
 *   bob  ← R2 lapsed (the NAMED project line — not ann), due 11-13 + 2 = 11-15
 *   ada  ← R4 lapsed, due 11-15
 *   ann  ← tier-ask for c3, due today (its 11-06 deadline already passed)
 * and 2 `rolls-up-to` links (bob→ada, ann→ada; ada's only ancestor is the
 * workspace leader, who holds no roster seat).
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
  buildStandardWork,
  standardWorkBriefText,
  standardWorkCsvRows,
  standardWorkFisherExact,
  standardWorkZeroUpperPct,
} from '../../app/core/domain/standardWork.js';
import { standardWorkRule } from '../../app/core/domain/standardWorkRules.js';
import {
  parseStandardWorkAskSummary,
  standardWorkAskSummary,
  standardWorkOwesSlot,
  standardWorkPreviousSlot,
  standardWorkSignature,
  standardWorkSlotKeyFor,
  standardWorkSlotRange,
} from '../../app/core/domain/standardWorkSchema.js';
import {
  STANDARD_WORK_CLOSED_PREFIX,
  STANDARD_WORK_CSV_COLUMNS,
  STANDARD_WORK_CSV_SCOPE,
  STANDARD_WORK_EVENTS,
  STANDARD_WORK_MARKER_KIND,
  STANDARD_WORK_READ_REFUSAL_KEYS,
  STANDARD_WORK_RULE_ID,
} from '../../app/core/domain/standardWorkRegistry.js';
import { renderStandardWork } from '../../app/views/standardWork.js';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const STAMP = '2020-01-01T00:00:00.000Z';

const person = (id, name, managerId, level) => ({
  id, name, role: `${name} role`, level, managerId, status: 'active', startDate: STAMP, createdAt: STAMP, updatedAt: STAMP,
});
const line = (id, personId, managerId, kind = 'project') => ({
  id, personId, managerId, kind, shareH: null, rights: [], fromISO: '2026-01-01', toISO: null, status: 'active',
  declaredAt: STAMP, history: [], note: '',
});
const routine = (id, ownerId, cadence, fromDay, extra = {}) => ({
  id, ownerId, title: `Routine ${id} walk`, standard: 'The cell board is current and plan versus actual is filled in.',
  kind: 'gemba', cadence, minutes: 20, weekdays: cadence === 'daily' ? [1, 2, 3, 4, 5] : [], lineKey: null, fromDay,
  retiredOn: null, retiredReason: '', declaredOn: fromDay, declaredAt: `${fromDay}T08:00:00.000Z`, declaredById: ownerId, ...extra,
});
const check = (id, routineId, slotKey, outcome, recordedOn, by, extra = {}) => ({
  id, routineId, slotKey, outcome, recordedOn, recordedAt: `${recordedOn}T09:00:00.000Z`, recordedById: by, late: false,
  note: outcome === 'done' ? '' : 'Guide rail on station two is worn past the mark.', disposition: null, toId: null, ...extra,
});

function rawFixture({ r3Lapsed = false } = {}) {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    person('ada', 'Ada Exec', null, 'vp'),
    person('ann', 'Ann Dir', 'ada', 'director'),
    person('bob', 'Bob Proj', 'ada', 'manager'),
    person('kim', 'Kim Lead', 'ann', 'lead'),
    person('ria', 'Ria Lead', 'ann', 'lead'),
    person('tom', 'Tom Maker', 'kim', 'ic'),
    person('uma', 'Uma Maker', 'ria', 'ic'),
  ];
  raw.reportingLines = [line('rl-kim-bob', 'kim', 'bob')];
  raw.settings = { ...raw.settings, leaderName: 'Riley Lead', activeSeatId: null };
  raw.standardWorkRoutines = [
    routine('R1', 'ria', 'daily', '2026-11-02'),
    routine('R2', 'kim', 'daily', '2026-11-02', { lineKey: 'rl-kim-bob' }),
    routine('R3', 'kim', 'weekly', r3Lapsed ? '2026-10-19' : '2026-11-02'),
    routine('R4', 'ann', 'weekly', '2026-10-19'),
  ];
  raw.standardWorkChecks = [
    check('c1', 'R1', '2026-11-02', 'done', '2026-11-02', 'ria'),
    check('c2', 'R1', '2026-11-03', 'done', '2026-11-03', 'ria'),
    check('c3', 'R1', '2026-11-04', 'abnormal', '2026-11-04', 'ria', { disposition: 'escalated', toId: 'ann' }),
    check('c4', 'R1', '2026-11-05', 'done', '2026-11-05', 'ria'),
    check('c5', 'R1', '2026-11-06', 'missed', '2026-11-06', 'ria'),
    check('c6', 'R1', '2026-11-09', 'done', '2026-11-09', 'ria'),
    check('c7', 'R1', '2026-11-10', 'abnormal', '2026-11-10', 'ria', { disposition: 'escalated', toId: 'ann' }),
    check('c8', 'R1', '2026-11-11', 'abnormal', '2026-11-11', 'ria', { disposition: 'contained' }),
    check('c9', 'R1', '2026-11-12', 'done', '2026-11-12', 'ria'),
    ...['02', '03', '04', '05', '06'].map((d, i) => check(`k${i}`, 'R2', `2026-11-${d}`, 'done', `2026-11-${d}`, 'kim')),
    ...(r3Lapsed ? [] : [check('w1', 'R3', '2026-W45', 'done', '2026-11-06', 'kim')]),
  ];
  raw.standardWorkTierActs = [
    { id: 't1', checkId: 'c7', hop: 1, actorId: 'ann', act: 'escalated', toId: 'ada', actedOn: '2026-11-11', actedAt: '2026-11-11T09:00:00.000Z', note: 'Needs a budget decision above my tier.' },
    { id: 't2', checkId: 'c7', hop: 2, actorId: 'ada', act: 'contained', toId: null, actedOn: '2026-11-12', actedAt: '2026-11-12T09:00:00.000Z', note: 'Approved the replacement part order.' },
  ];
  return raw;
}
const fixture = (options) => normalizeState(rawFixture(options), { now: NOW }).state;
const read = (state, extra = {}) => buildStandardWork(state, { now: NOW, settings: state.settings, ...extra });
const rowOf = (report, id) => report.routines.find((row) => row.routineId === id);

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
function runRule(state, { event = STANDARD_WORK_EVENTS.SCAN } = {}) {
  const draft = JSON.parse(JSON.stringify(state));
  const out = standardWorkRule(draft, {
    now: NOW, event: { type: event, entity: 'workspace', entityId: 'standard-work' },
    idFactory: (prefix) => `${prefix}-t${++seq}`, recordEffect: () => {},
  });
  return { draft, out };
}
const lswAsks = (state) => {
  const ids = new Set((state.links || []).filter((l) => l.ruleId === STANDARD_WORK_RULE_ID && l.relation === 'issues-obligation').map((l) => l.targetId));
  return (state.delegations || []).filter((d) => ids.has(d.id));
};
const activeFor = (state, personId) => lswAsks(state).filter((d) => d.status === 'active' && d.personId === personId);

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

test('registration: schema v150, three ledgers, CSV #143, RULE-LSW-01 as spine rule 120, rights and pause switch', () => {
  assert.equal(SCHEMA_VERSION, 151);
  for (const key of ['standardWorkRoutines', 'standardWorkChecks', 'standardWorkTierActs']) assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  const scope = CSV_EXPORTS.find((entry) => entry.key === STANDARD_WORK_CSV_SCOPE);
  assert.ok(scope, 'CSV #143 is registered');
  assert.equal(scope.sensitive, false, 'the export is aggregate-only');
  assert.equal(CSV_EXPORTS.length, 144);
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule?.id === 'standardWorkRule');
  assert.ok(contract, 'RULE-LSW-01 declares its propagation contract');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'matrixMarkers']);
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 121);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'one contract per spine rule');
  const tail = DEFAULT_POST_COMMIT_RULES.slice(-4).map((rule) => rule.id);
  assert.deepEqual(tail, ['standardWorkRule', 'priorityRule', 'seatRule', 'sealRule'],
    'RULE-LSW-01 stays ahead of the seat roll-up and the seal; later rules register between them');
  assert.deepEqual(ACTION_RIGHTS['record-standard-work'].minRank, 1, 'recording is open to the frontline');
  assert.equal(ACTION_RIGHTS['govern-standard-work'].minRank, 3);
  assert.ok(SAFE_READS.has('standardWorkReport'));
  assert.ok(!SAFE_READS.has('standardWorkRecordCheck'), 'recording writes');
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('standardWorkAutoPropagate'));
});

test('MIGRATIONS[149] adds three EMPTY ledgers and declares the conventions; nothing is inferred', () => {
  const v149 = { ...createEmptyState(NOW.toISOString()), schemaVersion: 149 };
  delete v149.standardWorkRoutines; delete v149.standardWorkChecks; delete v149.standardWorkTierActs;
  v149.settings = { ...v149.settings };
  delete v149.settings.standardWorkLapseRun;
  v149.oneOnOnes = [{ id: 'o1' }];
  const next = MIGRATIONS[149](v149);
  assert.equal(next.schemaVersion, 151);
  assert.deepEqual(next.standardWorkRoutines, []);
  assert.deepEqual(next.standardWorkChecks, []);
  assert.deepEqual(next.standardWorkTierActs, []);
  assert.equal(next.settings.standardWorkLapseRun, 3);
  assert.equal(next.settings.standardWorkWindowDays, 28);
  assert.equal(next.settings.standardWorkAutoPropagate, true);
  assert.equal(next.oneOnOnes, v149.oneOnOnes, 'existing records are untouched and no routine is derived from them');
});

/* ------------------------------------------------------- 2. slot arithmetic */

test('calendar slots: ISO weeks, month ranges, previous slot across a weekend, whole-period ownership', () => {
  assert.equal(standardWorkSlotKeyFor('daily', '2026-11-13'), '2026-11-13');
  assert.equal(standardWorkSlotKeyFor('weekly', '2026-11-13'), '2026-W46');
  assert.equal(standardWorkSlotKeyFor('monthly', '2026-11-13'), '2026-11');
  assert.deepEqual(standardWorkSlotRange('weekly', '2026-W46'), { start: '2026-11-09', end: '2026-11-15' });
  assert.deepEqual(standardWorkSlotRange('monthly', '2026-02'), { start: '2026-02-01', end: '2026-02-28' });
  // 2026-01-01 is a Thursday, so it belongs to ISO week 1 of 2026; 2027-01-01 is a
  // Friday and belongs to week 53 of 2026.
  assert.equal(standardWorkSlotKeyFor('weekly', '2026-01-01'), '2026-W01');
  assert.equal(standardWorkSlotKeyFor('weekly', '2027-01-01'), '2026-W53');
  assert.equal(standardWorkSlotRange('weekly', '2026-W54'), null, 'a week that does not exist is refused');
  const daily = routine('x', 'ria', 'daily', '2026-11-02');
  assert.equal(standardWorkPreviousSlot(daily, '2026-11-09'), '2026-11-06', 'the slot before a Monday is the Friday');
  assert.equal(standardWorkOwesSlot(daily, '2026-11-07'), false, 'a Saturday is not a declared working day');
  // Declared on Wednesday 11-04: the week it was declared in is a part-period and is not owed.
  const weekly = routine('y', 'ria', 'weekly', '2026-11-04');
  assert.equal(standardWorkOwesSlot(weekly, '2026-W45'), false);
  assert.equal(standardWorkOwesSlot(weekly, '2026-W46'), true);
});

/* ------------------------------------------------------------ 3. exact maths */

test('exact maths: Fisher two-sided p and the zero-finding upper bound, against hand-worked values', () => {
  // [[3,0],[0,3]]: P(a=3) = C(3,3)·C(3,0)/C(6,3) = 1/20; the mirror table a=0 is
  // equally likely, so the two-sided p is 2/20 = 0.1.
  assert.ok(Math.abs(standardWorkFisherExact(3, 0, 0, 3) - 0.1) < 1e-12);
  // [[1,1],[1,1]]: every table is at most as likely as the observed one → p = 1.
  assert.ok(Math.abs(standardWorkFisherExact(1, 1, 1, 1) - 1) < 1e-12);
  // [[2,0],[0,2]]: P = 1/C(4,2) = 1/6, mirrored → 2/6.
  assert.ok(Math.abs(standardWorkFisherExact(2, 0, 0, 2) - 1 / 3) < 1e-12);
  assert.equal(standardWorkFisherExact(-1, 0, 0, 1), null);
  // 1 − 0.05^(1/n): n=1 → 95.0; n=5 → 1 − e^(−0.59915) = 45.1; n=19 → 14.6; n=59 → 5.0.
  assert.equal(standardWorkZeroUpperPct(1), 95);
  assert.equal(standardWorkZeroUpperPct(5), 45.1);
  assert.equal(standardWorkZeroUpperPct(19), 14.6);
  assert.equal(standardWorkZeroUpperPct(59), 5);
  assert.equal(standardWorkZeroUpperPct(0), null, 'no checks, no bound');
});

/* ---------------------------------------------------------- 4. the read model */

test('workspace read: every routine figure matches the hand-computed slots', () => {
  const report = read(fixture());
  const r1 = rowOf(report, 'R1');
  assert.deepEqual([r1.closedN, r1.doneN, r1.abnormalN, r1.missedN, r1.unrecordedN, r1.openN], [9, 5, 3, 1, 0, 1]);
  assert.deepEqual([r1.adherencePct, r1.adherenceLowPct, r1.adherenceHighPct], [88.9, 56.5, 98]);
  assert.equal(r1.verdict, 'gaps');
  assert.deepEqual([r1.tierState, r1.nextTierId], ['single-line', 'ann']);

  const r2 = rowOf(report, 'R2');
  assert.deepEqual([r2.closedN, r2.doneN, r2.abnormalN, r2.missedN, r2.unrecordedN, r2.openN], [9, 5, 0, 0, 4, 1]);
  assert.deepEqual([r2.adherencePct, r2.adherenceLowPct, r2.adherenceHighPct], [55.6, 26.7, 81.1]);
  assert.deepEqual([r2.verdict, r2.run], ['lapsed', 4]);
  assert.deepEqual([r2.tierState, r2.nextTierId, r2.lineKind], ['named-line', 'bob', 'project'], 'the NAMED line decides the next tier, not the home line');
  assert.equal(r2.yield.zeroUpperPct, 45.1);

  const r3 = rowOf(report, 'R3');
  assert.deepEqual([r3.closedN, r3.doneN, r3.openN, r3.verdict], [1, 1, 1, 'held']);
  assert.equal(r3.adherenceWithheld, true, 'one closed slot is below the floor of five');
  assert.equal(r3.adherencePct, null, 'a withheld rate is null, never zero');
  assert.deepEqual([r3.tierState, r3.nextTierId], ['ambiguous', null], 'two lines and none named: no next tier is chosen');

  const r4 = rowOf(report, 'R4');
  assert.deepEqual([r4.closedN, r4.unrecordedN, r4.openN, r4.verdict, r4.run], [3, 3, 1, 'lapsed', 3]);
  assert.equal(r4.adherenceWithheld, true);
  assert.equal(r4.nextTierId, 'ada');
});

test('workspace read: totals, partitions and the two claims', () => {
  const report = read(fixture());
  const t = report.totals;
  assert.deepEqual([t.routinesN, t.ownersN, t.closedN, t.doneN, t.abnormalN, t.missedN, t.unrecordedN, t.openN], [4, 3, 22, 11, 3, 1, 7, 4]);
  assert.equal(t.doneN + t.abnormalN + t.missedN + t.unrecordedN, t.closedN);
  assert.deepEqual([t.adherencePct, t.adherenceLowPct, t.adherenceHighPct], [63.6, 43, 80.3]);
  assert.deepEqual(t.verdictCounts, { lapsed: 2, gaps: 1, held: 1, new: 0 });
  assert.deepEqual(t.tierStateCounts, { 'single-line': 2, 'named-line': 1, 'top-tier': 0, ambiguous: 1, 'line-ended': 0, 'off-roster': 0 });
  assert.equal(t.tierUnresolvedN, 1);
  assert.equal(t.lapsedN, 2);
  assert.deepEqual(report.claims, { countsReconcile: true, figuresComplete: true, reasons: [] });
  assert.equal(report.window.fromDay, '2026-10-16');
  const refusals = Object.fromEntries(report.refusals.map((row) => [row.key, row.n]));
  // thin-slots: R3 and R4. tier-unresolved: R3. yield-thin: R1 (8 checks, but the
  // rest of its kind has 5+1 = 6 < 8), R2 (5) and R3 (1); R4 has no check at all.
  assert.deepEqual(refusals, { 'thin-slots': 2, 'tier-unresolved': 1, 'yield-thin': 3 });
  for (const key of Object.keys(refusals)) assert.ok(STANDARD_WORK_READ_REFUSAL_KEYS.includes(key));
});

test('tier escalations are replayed hop by hop: one overdue at its tier, one contained after two hops', () => {
  const report = read(fixture());
  const t = report.totals;
  assert.equal(t.escalationsN, 2);
  assert.deepEqual(t.escalationCounts, { overdue: 1, open: 0, unattributable: 0, contained: 1, returned: 0 });
  assert.equal(t.escalationsOpenN, 1);
  assert.equal(t.medianHops, 2);
  const c3 = report.escalations.find((row) => row.checkId === 'c3');
  assert.deepEqual([c3.state, c3.holderId, c3.hopN, c3.ageDays, c3.dueOn], ['overdue', 'ann', 1, 9, '2026-11-06']);
  const c7 = report.escalations.find((row) => row.checkId === 'c7');
  assert.deepEqual([c7.state, c7.holderId, c7.hopN, c7.closedOn], ['contained', null, 2, '2026-11-12']);
  assert.deepEqual(c7.hops.map((hop) => [hop.holderId, hop.act]), [['ann', 'escalated'], ['ada', 'contained']]);
});

test('matrix roll-up: a leader reached through two lines is in a span ONCE, and the dotted-line span is real', () => {
  const report = read(fixture());
  const span = Object.fromEntries(report.spans.map((row) => [row.nodeId, row]));
  assert.deepEqual(Object.keys(span).sort(), ['ada', 'ann', 'bob', 'leader']);
  assert.deepEqual([span.ann.routinesN, span.ann.closedN, span.ann.adherencePct, span.ann.viaLineOnlyN, span.ann.openEscalationsN], [3, 19, 73.7, 0, 1]);
  assert.deepEqual([span.bob.routinesN, span.bob.closedN, span.bob.adherencePct, span.bob.viaLineOnlyN, span.bob.openEscalationsN], [2, 10, 60, 2, 0]);
  // ada reaches kim through ann AND through bob. 22, not 22 + 10.
  assert.deepEqual([span.ada.routinesN, span.ada.closedN, span.ada.ownersN], [4, 22, 3]);
  assert.deepEqual([span.leader.routinesN, span.leader.closedN], [4, 22]);
});

test('structured time is printed beside the reference band for the altitude', () => {
  const owners = Object.fromEntries(read(fixture()).owners.map((row) => [row.ownerId, row]));
  assert.deepEqual([owners.ria.weekMinutes, owners.ria.sharePct, owners.ria.bandLowPct, owners.ria.bandHighPct, owners.ria.verdict], [100, 4.2, 50, 80, 'below-band']);
  assert.deepEqual([owners.kim.weekMinutes, owners.kim.sharePct], [120, 5]);
  assert.deepEqual([owners.ann.weekMinutes, owners.ann.sharePct, owners.ann.bandLowPct, owners.ann.verdict], [20, 0.8, 15, 'below-band']);
});

test('finding yield: a routine that never finds anything is raised as a QUESTION only against enough peers', () => {
  // Three process confirmations, daily from Monday 10-19: closed slots are
  // 10-19..23, 10-26..30, 11-02..06, 11-09..12 = 5+5+5+4 = 19 each.
  // Y1 (ria): 19 done, 0 findings. Y2 (kim) and Y3 (ann): 10 findings in 19.
  // Y1 against the rest: [[0,19],[20,18]]. P(a=0) = Π_{i=0..19} (38−i)/(57−i),
  // every factor ≤ 2/3, so P ≤ (2/3)^20 ≈ 3.0e-4 — far below 0.05/3.
  const raw = rawFixture();
  const days = [];
  for (let d = new Date('2026-10-19T00:00:00Z'); d <= new Date('2026-11-12T00:00:00Z'); d = new Date(d.getTime() + 86400000)) {
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) days.push(d.toISOString().slice(0, 10));
  }
  assert.equal(days.length, 19);
  raw.standardWorkRoutines = [
    routine('Y1', 'ria', 'daily', '2026-10-19', { kind: 'process-confirmation' }),
    routine('Y2', 'kim', 'daily', '2026-10-19', { kind: 'process-confirmation', lineKey: 'home' }),
    routine('Y3', 'ann', 'daily', '2026-10-19', { kind: 'process-confirmation' }),
  ];
  raw.standardWorkChecks = [];
  raw.standardWorkTierActs = [];
  days.forEach((day, i) => {
    raw.standardWorkChecks.push(check(`y1-${i}`, 'Y1', day, 'done', day, 'ria'));
    for (const [rid, by] of [['Y2', 'kim'], ['Y3', 'ann']]) {
      raw.standardWorkChecks.push(i < 10 ? check(`${rid}-${i}`, rid, day, 'abnormal', day, by, { disposition: 'contained' }) : check(`${rid}-${i}`, rid, day, 'done', day, by));
    }
  });
  const report = read(normalizeState(raw, { now: NOW }).state);
  const y1 = rowOf(report, 'Y1').yield;
  assert.deepEqual([y1.checksN, y1.abnormalN, y1.zeroUpperPct, y1.tested, y1.testsN], [19, 0, 14.6, true, 3]);
  assert.deepEqual([y1.restChecksN, y1.restRatePct], [38, 52.6], '20 findings in 38 peer checks = 52.6%');
  assert.ok(y1.p <= Math.pow(2 / 3, 20) * 2 + 1e-12 && y1.p > 0, 'the exact p is inside the hand bound');
  assert.equal(y1.adjustedP, Math.min(1, y1.p * 3), 'Bonferroni across every routine tested');
  assert.equal(y1.question, true);
  assert.equal(rowOf(report, 'Y2').yield.question, false, 'a routine that finds MORE than its peers is never questioned');
  assert.equal(report.totals.yieldQuestionsN, 1);
  assert.equal(rowOf(report, 'Y1').verdict, 'held', 'the question does not change the adherence verdict');
});

/* -------------------------------------------------------- 5. fail-closed load */

test('normalization drops what the actions would have refused, and repairs nothing', () => {
  const raw = rawFixture();
  raw.standardWorkChecks.push(
    check('bad-orphan', 'R9', '2026-11-12', 'done', '2026-11-12', 'ria'),
    check('bad-saturday', 'R1', '2026-11-07', 'done', '2026-11-07', 'ria'),
    check('bad-duplicate', 'R1', '2026-11-12', 'done', '2026-11-12', 'ria'),
    check('bad-proxy', 'R2', '2026-11-12', 'done', '2026-11-12', 'ann'),          // a manager ticking a report's routine
    check('bad-backfill', 'R2', '2026-11-09', 'done', '2026-11-13', 'kim'),        // three slots late
    check('bad-silent-miss', 'R2', '2026-11-11', 'missed', '2026-11-11', 'kim', { note: '' }),
  );
  raw.standardWorkTierActs.push(
    { id: 'bad-actor', checkId: 'c3', hop: 1, actorId: 'bob', act: 'contained', toId: null, actedOn: '2026-11-05', actedAt: STAMP, note: 'Not the leader it was addressed to.' },
    { id: 'bad-after-close', checkId: 'c7', hop: 3, actorId: 'ada', act: 'returned', toId: null, actedOn: '2026-11-13', actedAt: STAMP, note: 'An act after the chain closed.' },
  );
  const out = normalizeState(raw, { now: NOW });
  assert.equal(out.state.standardWorkChecks.length, 15, 'the fifteen real checks survive; all six bad rows are dropped');
  assert.deepEqual(out.state.standardWorkTierActs.map((row) => row.id), ['t1', 't2']);
  assert.ok(out.state.standardWorkChecks.every((row) => !row.id.startsWith('bad-')));
  assert.equal(read(out.state).totals.closedN, 22, 'the read is unchanged by the rejected rows');
});

/* --------------------------------------------------------------- 6. the rule */

test('RULE-LSW-01 files one dated ask per condition, to the tier the line names, and is idempotent', () => {
  const { draft, out } = runRule(fixture());
  const asks = lswAsks(draft);
  assert.equal(asks.length, 3);
  assert.equal(out.filter((effect) => effect.action === 'delegated').length, 3);
  const bob = activeFor(draft, 'bob');
  assert.equal(bob.length, 1, 'the lapsed routine named the PROJECT line, so its manager is asked');
  assert.equal(bob[0].dueOn, '2026-11-15');
  assert.ok(bob[0].title.includes('Routine R2 walk'));
  assert.equal(activeFor(draft, 'ada').length, 1);
  const ann = activeFor(draft, 'ann');
  assert.equal(ann.length, 1, 'ann holds the overdue escalation — and is NOT asked about kim’s project-line routine');
  assert.ok(ann[0].title.startsWith('Tier escalation'));
  assert.equal(ann[0].dueOn, '2026-11-13', 'its tier deadline already passed, so it is due today');
  assert.ok(asks.every((ask) => ask.authority === 'act-inform'));
  const links = draft.links.filter((l) => l.ruleId === STANDARD_WORK_RULE_ID);
  assert.equal(links.filter((l) => l.relation === 'issues-obligation').length, 3);
  assert.deepEqual(links.filter((l) => l.relation === 'rolls-up-to').map((l) => l.targetId).sort(), ['ada', 'ada']);
  assert.equal((draft.matrixMarkers || []).filter((m) => m.kind === STANDARD_WORK_MARKER_KIND).length, 0);

  const again = runRule(draft);
  assert.equal(again.out.length, 0, 'a second scan of the same record writes nothing');
  assert.equal(lswAsks(again.draft).length, 3);
});

test('matrix: a lapsed routine whose owner holds two lines and named none asks NOBODY and records one observation', () => {
  // R3 from 10-19 with no check: W43, W44, W45 unrecorded → lapsed, and ambiguous.
  const { draft } = runRule(fixture({ r3Lapsed: true }));
  assert.equal(lswAsks(draft).length, 3, 'still only R2 → bob, R4 → ada and the tier-ask → ann');
  assert.ok(!lswAsks(draft).some((ask) => ask.title.includes('Routine R3')));
  const markers = draft.matrixMarkers.filter((m) => m.kind === STANDARD_WORK_MARKER_KIND);
  assert.equal(markers.length, 1);
  assert.ok(markers[0].detail.includes('nobody was asked on a guess'));
  for (const name of ['Kim', 'Ann', 'Bob', 'Routine R3']) assert.ok(!markers[0].detail.includes(name), 'the observation is identity-free');
  assert.equal(runRule(draft).draft.matrixMarkers.filter((m) => m.kind === STANDARD_WORK_MARKER_KIND).length, 1, 'the observation is recorded once');
});

test('matrix: when the named line ends, the stale ask is closed and nobody is substituted', () => {
  const first = runRule(fixture());
  const ended = JSON.parse(JSON.stringify(first.draft));
  ended.reportingLines[0] = { ...ended.reportingLines[0], status: 'ended', toISO: '2026-11-12' };
  const state = normalizeState(ended, { now: NOW }).state;
  const report = read(state);
  assert.equal(rowOf(report, 'R2').tierState, 'line-ended');
  assert.equal(rowOf(report, 'R2').nextTierId, null, 'the home-line manager is NOT substituted for the ended line');
  const { draft } = runRule(state);
  assert.equal(activeFor(draft, 'bob').length, 0);
  const closed = lswAsks(draft).find((ask) => ask.personId === 'bob');
  assert.equal(closed.status, 'done');
  assert.ok(closed.completionNote.startsWith(STANDARD_WORK_CLOSED_PREFIX));
  assert.equal(activeFor(draft, 'ann').length, 1, 'ann still holds only her own tier-ask');
  assert.equal(draft.matrixMarkers.filter((m) => m.kind === STANDARD_WORK_MARKER_KIND).length, 1);
});

test('the rule honours the pause on every path, never re-asks a condition a human closed, and is inert when empty', () => {
  const paused = fixture();
  paused.settings.standardWorkAutoPropagate = false;
  assert.equal(runRule(paused).out.length, 0, 'an explicit scan does not override the pause');

  const first = runRule(fixture());
  const annAsk = activeFor(first.draft, 'ann')[0];
  annAsk.status = 'done';
  annAsk.completionNote = 'Looked at it with Ria; parts are on order.';
  const second = runRule(first.draft);
  assert.equal(second.out.length, 0, 'the condition still stands, and a human already answered it');
  assert.equal(activeFor(second.draft, 'ann').length, 0);

  const empty = normalizeState(createEmptyState(NOW.toISOString()), { now: NOW }).state;
  assert.equal(runRule(empty).out.length, 0);
});

test('signatures are fixed-length, identity-free and round-trip through the link summary', () => {
  const a = standardWorkSignature('routine-lapsed', 'R2|2026-11-09');
  assert.match(a, /^lsw1:routine-lapsed:[0-9a-f]{16}$/);
  assert.equal(a, standardWorkSignature('routine-lapsed', 'R2|2026-11-09'));
  assert.notEqual(a, standardWorkSignature('routine-lapsed', 'R2|2026-11-10'));
  assert.ok(!a.includes('R2'));
  assert.deepEqual(parseStandardWorkAskSummary(standardWorkAskSummary(a)), { signature: a });
  assert.equal(parseStandardWorkAskSummary('Some other link'), null);
});

/* ------------------------------------------------------------ 7. the actions */

test('a check is first-person: operator, manager and peer are refused; the owner records once per slot', () => {
  const { store, api, sit } = seed(fixture());
  const asOperator = api.standardWorkRecordCheck({ routineId: 'R1', outcome: 'done' });
  assert.equal(asOperator.ok, false);
  assert.match(asOperator.error, /first-person/);
  sit('ann');
  assert.equal(api.standardWorkRecordCheck({ routineId: 'R1', outcome: 'done' }).ok, false, 'a manager cannot tick a report’s routine');
  sit('kim');
  assert.equal(api.standardWorkRecordCheck({ routineId: 'R1', outcome: 'done' }).ok, false, 'a peer cannot either');
  sit('ria');
  const ok = api.standardWorkRecordCheck({ routineId: 'R1', outcome: 'done' });
  assert.equal(ok.ok, true, ok.error);
  assert.deepEqual([ok.slotKey, ok.late], ['2026-11-13', false]);
  assert.equal(store.state.standardWorkChecks.length, 16);
  const twice = api.standardWorkRecordCheck({ routineId: 'R1', outcome: 'done' });
  assert.equal(twice.ok, false, 'one check per slot');
  assert.equal(store.state.standardWorkChecks.length, 16);
  // R1 now: closed 10, done 6 + abnormal 3 = 9/10 = 90.0%.
  const r1 = rowOf(api.standardWorkReport().report, 'R1');
  assert.deepEqual([r1.closedN, r1.openN, r1.adherencePct], [10, 0, 90]);
});

test('late recording reaches back exactly one slot; a miss and an abnormality need their words', () => {
  const { api, sit } = seed(fixture());
  sit('kim');
  const board = rowOf(api.standardWorkReport().report, 'R2');
  assert.deepEqual(board.recordable.map((slot) => [slot.slotKey, slot.late]), [['2026-11-13', false], ['2026-11-12', true]]);
  const backfill = api.standardWorkRecordCheck({ routineId: 'R2', slotKey: '2026-11-10', outcome: 'done' });
  assert.equal(backfill.ok, false);
  assert.match(backfill.error, /cannot be back-filled/);
  assert.equal(api.standardWorkRecordCheck({ routineId: 'R2', slotKey: '2026-11-12', outcome: 'missed', note: 'short' }).field, 'note');
  const late = api.standardWorkRecordCheck({ routineId: 'R2', slotKey: '2026-11-12', outcome: 'missed', note: 'Line stop meeting ran through the walk.' });
  assert.equal(late.ok, true, late.error);
  assert.equal(late.late, true);
  assert.equal(api.standardWorkRecordCheck({ routineId: 'R2', outcome: 'abnormal', note: 'Board not updated since Monday.' }).field, 'disposition');
});

test('matrix escalation: two lines and no named manager is refused; a named line manager receives the ask in the same commit', () => {
  const { store, api, sit } = seed(fixture());
  api.standardWorkScan();
  assert.equal(activeFor(store.state, 'bob').length, 1, 'before: bob holds the lapsed-routine ask');
  sit('kim');
  const input = { routineId: 'R2', outcome: 'abnormal', note: 'Board not updated since Monday.', disposition: 'escalated' };
  const unnamed = api.standardWorkRecordCheck(input);
  assert.deepEqual([unnamed.ok, unnamed.field], [false, 'toId']);
  assert.match(unnamed.error, /will not pick one of your managers/);
  const wrong = api.standardWorkRecordCheck({ ...input, toId: 'ada' });
  assert.equal(wrong.ok, false, 'ada holds no line over kim');
  const named = api.standardWorkRecordCheck({ ...input, toId: 'bob' });
  assert.equal(named.ok, true, named.error);
  // Same transaction: R2's trailing run is now 0 (today's slot is done-with-finding),
  // so the lapsed ask closes itself, and the tier-ask for the new escalation opens.
  const bobAsks = lswAsks(store.state).filter((ask) => ask.personId === 'bob');
  assert.equal(bobAsks.filter((ask) => ask.status === 'done' && ask.completionNote.startsWith(STANDARD_WORK_CLOSED_PREFIX)).length, 1);
  const open = bobAsks.filter((ask) => ask.status === 'active');
  assert.equal(open.length, 1);
  assert.ok(open[0].title.startsWith('Tier escalation'));
  assert.equal(open[0].dueOn, '2026-11-15', 'addressed today + the two-day tier window');
  assert.equal(rowOf(api.standardWorkReport().report, 'R2').verdict, 'gaps');
});

test('a tier act belongs to the addressed leader, closes the ask, and the chain is append-only', () => {
  const { store, api, sit } = seed(fixture());
  api.standardWorkScan();
  sit('bob');
  const notMine = api.standardWorkTierAct({ checkId: 'c3', act: 'contained', note: 'Replaced the worn guide rail.' });
  assert.equal(notMine.ok, false);
  assert.match(notMine.error, /addressed to Ann Dir/);
  sit('ann');
  assert.equal(api.standardWorkReport().report.totals.attentionN, 2, 'one escalation at her tier + her own lapsed routine');
  assert.equal(api.standardWorkTierAct({ checkId: 'c3', act: 'escalated', note: 'Needs capital approval above me.', toId: 'bob' }).ok, false, 'bob is not ann’s manager');
  const done = api.standardWorkTierAct({ checkId: 'c3', act: 'contained', note: 'Replaced the worn guide rail on station two.' });
  assert.equal(done.ok, true, done.error);
  assert.equal(done.hop, 1);
  assert.equal(activeFor(store.state, 'ann').length, 0, 'her tier-ask closed in the same transaction');
  const t = api.standardWorkReport().report.totals;
  assert.deepEqual(t.escalationCounts, { overdue: 0, open: 0, unattributable: 0, contained: 2, returned: 0 });
  assert.equal(t.medianHops, 1.5, 'closed chains took 1 and 2 hops');
  assert.equal(t.attentionN, 1);
  assert.equal(api.standardWorkTierAct({ checkId: 'c3', act: 'returned', note: 'A second act on a closed chain.' }).ok, false);
});

test('declaring: the owner or a line manager under THEIR line only; no back-dating; a matrix owner must name the line', () => {
  const { store, api, sit } = seed(fixture());
  const base = { title: 'Weekly 5S audit', standard: 'Every station scored against the 5S sheet.', kind: 'safety', cadence: 'weekly', minutes: 30 };
  sit('kim');
  const noLine = api.standardWorkDeclareRoutine(base);
  assert.deepEqual([noLine.ok, noLine.field], [false, 'lineKey']);
  const home = api.standardWorkDeclareRoutine({ ...base, lineKey: 'home' });
  assert.equal(home.ok, true, home.error);
  assert.equal(rowOf(api.standardWorkReport().report, home.routineId).nextTierId, 'ann');
  assert.equal(api.standardWorkDeclareRoutine({ ...base, lineKey: 'home' }).field, 'title', 'a duplicate live title is refused');
  assert.equal(api.standardWorkDeclareRoutine({ ...base, title: 'Back-dated', lineKey: 'home', fromDay: '2026-11-01' }).field, 'fromDay');
  assert.equal(api.standardWorkDeclareRoutine({ ...base, title: 'For a peer', ownerId: 'ria' }).ok, false, 'kim holds no line over ria');
  assert.equal(api.standardWorkDeclareRoutine({ ...base, title: 'For an IC', ownerId: 'tom' }).ok, false, 'an individual contributor holds no leadership altitude');

  sit('bob');
  const viaLine = api.standardWorkDeclareRoutine({ ...base, title: 'Project stand-up', kind: 'tier-huddle', ownerId: 'kim' });
  assert.equal(viaLine.ok, true, viaLine.error);
  assert.equal(viaLine.lineKey, 'rl-kim-bob', 'a dotted-line manager declares under the line they hold, and no other');
  assert.equal(api.standardWorkDeclareRoutine({ ...base, title: 'Wrong line', ownerId: 'kim', lineKey: 'home' }).ok, false);
  assert.equal(store.state.standardWorkRoutines.length, 6);

  const cands = api.standardWorkCandidates().candidates.map((c) => [c.ownerId, c.lines.map((l) => l.lineKey)]);
  assert.deepEqual(cands, [['bob', ['home']], ['kim', ['rl-kim-bob']]]);
});

test('retiring keeps history; conventions are refused out of bounds, never clamped, and governed by rank', () => {
  const { store, api, sit } = seed(fixture());
  sit('ria');
  assert.equal(api.standardWorkSetConventions({ standardWorkLapseRun: 4 }).ok, false, 'a frontline seat does not govern the conventions');
  const retired = api.standardWorkRetireRoutine({ routineId: 'R1', reason: 'Cell three moved to the new line; the walk is replaced.' });
  assert.equal(retired.ok, true, retired.error);
  assert.equal(store.state.standardWorkChecks.filter((row) => row.routineId === 'R1').length, 9, 'no check is deleted');
  const r1 = rowOf(api.standardWorkReport().report, 'R1');
  assert.deepEqual([r1.retired, r1.closedN, r1.openN, r1.canRecord], [true, 9, 0, false], 'today is no longer owed');
  sit('ann');
  const over = api.standardWorkSetConventions({ standardWorkLapseRun: 11 });
  assert.equal(over.ok, false);
  assert.match(over.error, /Nothing was clamped/);
  assert.equal(store.state.settings.standardWorkLapseRun, 3);
  assert.equal(api.standardWorkSetConventions({ standardWorkNope: 1 }).ok, false);
  const set = api.standardWorkSetConventions({ standardWorkLapseRun: 5 });
  assert.equal(set.ok, true, set.error);
  // R2's trailing run is 4 < 5 → no longer lapsed; R4's run is 3 < 5 → no longer lapsed.
  sit(null);
  assert.deepEqual(api.standardWorkReport().report.totals.verdictCounts, { lapsed: 0, gaps: 3, held: 1, new: 0 });
});

/* ------------------------------------------------------- 8. seat-scoped reads */

test('a seat reads its own tier and the tier beneath it; deeper routines are counted, not listed', () => {
  const { api, sit } = seed(fixture());
  sit('ria');
  const ria = api.standardWorkReport().report;
  assert.equal(ria.scope, 'seat');
  assert.deepEqual(ria.routines.map((row) => row.routineId), ['R1']);
  assert.deepEqual([ria.totals.routinesN, ria.totals.closedN, ria.totals.adherencePct], [1, 9, 88.9]);
  assert.deepEqual(ria.escalations.map((row) => [row.checkId, row.canAct]), [['c3', false], ['c7', false]], 'she raised both and can act on neither');

  sit('ann');
  const ann = api.standardWorkReport().report;
  // In reach: her own R4, ria's R1, kim's R2 and R3. R2 is owed to bob's tier, so it
  // is counted and not listed; R3 is listed because its missing line is hers to see.
  assert.deepEqual(ann.routines.map((row) => row.routineId).sort(), ['R1', 'R3', 'R4']);
  assert.deepEqual([ann.totals.routinesN, ann.totals.belowTierN, ann.totals.closedN], [4, 1, 22]);
  assert.equal(ann.refusals.find((row) => row.key === 'below-tier').n, 1);
  assert.equal(ann.claims.countsReconcile, true);

  sit('bob');
  const bob = api.standardWorkReport().report;
  assert.deepEqual(bob.routines.map((row) => row.routineId).sort(), ['R2', 'R3'], 'the dotted-line manager sees the routines owed under his line');
  assert.deepEqual([bob.totals.routinesN, bob.totals.closedN, bob.totals.adherencePct, bob.totals.attentionN], [2, 10, 60, 1]);
  assert.equal(bob.escalations.length, 0, 'ria’s escalations are outside his reach');
});

/* ------------------------------------------------------ 9. outputs and screen */

test('CSV #143 and the brief print the same figures as the report, and no identity', () => {
  const state = fixture();
  const report = read(state);
  const rows = standardWorkCsvRows(report);
  const head = rows[0];
  assert.deepEqual([head.row_type, head.routines_n, head.closed_slots_n, head.done_n, head.abnormal_n, head.missed_n, head.unrecorded_n], ['workspace', 4, 22, 11, 3, 1, 7]);
  assert.deepEqual([head.adherence_pct, head.adherence_low_pct, head.adherence_high_pct, head.lapsed_n, head.escalations_overdue_n, head.median_hops], [63.6, 43, 80.3, 2, 1, 2]);
  assert.deepEqual([head.counts_reconcile, head.figures_complete], ['yes', 'yes']);
  assert.equal(rows.find((row) => row.row_type === 'routine-verdict' && row.key === 'lapsed').routines_n, 2);
  assert.equal(rows.find((row) => row.row_type === 'routine-kind' && row.key === 'gemba').closed_slots_n, 22);
  assert.ok(rows.every((row) => Object.keys(row).every((key) => STANDARD_WORK_CSV_COLUMNS.includes(key))), 'every exported field is a declared column');

  const exported = exportWorkspaceCsv(state, STANDARD_WORK_CSV_SCOPE, { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  assert.deepEqual(parseCsv(exported.csv).headers, [...STANDARD_WORK_CSV_COLUMNS]);
  const brief = standardWorkBriefText(report);
  for (const leaked of ['Ria Lead', 'Kim Lead', 'Ann Dir', 'Bob Proj', 'Routine R1', 'Guide rail', 'rl-kim-bob']) {
    assert.ok(!exported.csv.includes(leaked), `the export must not leak “${leaked}”`);
    assert.ok(!brief.includes(leaked), `the workspace brief must not leak “${leaked}”`);
  }
  assert.ok(brief.includes('Closed slots: 22 = done 11 + done with abnormality 3 + missed with a reason 1 + unrecorded 7.'));
  assert.ok(brief.includes('Adherence: 63.6% (95% Wilson 43–80.3%).'));
});

test('the screen renders the report it was given: figures, a real Record button, the Act button and the method diagram', () => {
  withDom((dom) => {
    const { api, sit } = seed(fixture());
    sit('ann');
    const ctx = { api, now: NOW, query: new URLSearchParams(''), refresh: () => {}, navigate: () => {} };
    const node = renderStandardWork(ctx);
    dom.window.document.body.appendChild(node);
    const text = node.textContent;
    assert.ok(node.querySelector('h1'));
    const stats = node.querySelector('[data-testid="lsw-stats"]').textContent;
    assert.ok(stats.includes('63.6%'), 'the adherence printed is the computed one');
    assert.ok(stats.includes('95% Wilson 43–80.3%'));
    assert.ok(stats.includes('done 11 · abnormality 3 · missed 1 · unrecorded 7'));
    assert.ok(text.includes('Two claims, apart: the figures add up — yes'));
    assert.ok(node.querySelector('[data-testid="lsw-act-c3"]'), 'the escalation at her tier has an Act button');
    assert.equal(node.querySelector('[data-testid="lsw-act-c7"]'), null, 'a closed chain has none');
    assert.ok(node.querySelector('[data-testid="lsw-record-R4"]'), 'her own routine has a Record button');
    assert.equal(node.querySelector('[data-testid="lsw-record-R1"]'), null, 'a report’s routine has none');
    assert.ok(!text.includes('Routine R2 walk'), 'a routine owed to another tier is not listed');
    assert.ok(text.includes('Routines further than one tier below this seat are counted'));
    // A withheld rate is a dash, never 0%.
    const r4Row = [...node.querySelectorAll('tr')].find((tr) => tr.textContent.includes('Routine R4 walk'));
    assert.ok(r4Row.textContent.includes('—'));
    assert.ok(!/\b0%/.test(r4Row.textContent));

    // The Record dialog is a working form wired to the action.
    node.querySelector('[data-testid="lsw-record-R4"]').click();
    const modal = dom.window.document.getElementById('modal-root');
    assert.ok(modal.textContent.includes('Record — “Routine R4 walk”'));
    assert.ok(modal.querySelector('select[name="slotKey"]').textContent.includes('2026-W46'));

    const method = renderStandardWork({ ...ctx, query: new URLSearchParams('panel=method') });
    const img = method.querySelector('figure img');
    assert.equal(img.getAttribute('src'), './app/assets/standard-work-tiers.jpg');
    assert.ok(img.getAttribute('alt').length > 40);
    assert.ok(method.querySelector('[data-testid="lsw-conventions"]').textContent.includes('28'));

    const spans = renderStandardWork({ ...ctx, query: new URLSearchParams('panel=spans') });
    assert.ok(spans.textContent.includes('Span roll-up'));
    assert.ok(spans.textContent.includes('73.7%'), 'ann’s own span: 14 of 19');
  });
});
