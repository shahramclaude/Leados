/**
 * ADR-0179 — Matrix Forward Allocation Horizon (Schema v143 unchanged).
 *
 * WHAT THIS SUITE COVERS
 * ----------------------
 *   lineHorizonRegistry.js   the closed vocabulary;
 *   lineHorizon.js           the pure forward read model, brief and CSV rows;
 *   lineHorizonRules.js      RULE-LHZ-01, called directly on a plain draft AND
 *                            registered on the real post-commit spine;
 *   the wiring               `#/matrix?panel=horizon`, `matrixHorizonReport` /
 *                            `matrixHorizonScan` on both gateway lists, CSV
 *                            scope #134, the contract, the view dispatch and
 *                            the panel itself (DOM figures == the report the
 *                            action returned; a render stores nothing).
 *
 * The contract proved here:
 *   - the first figures are the live ledger's figures (one engine, not two);
 *   - every weekly person-day and share-day figure equals an independent
 *     day-by-day evaluation of the live ledger;
 *   - a total an undeclared split touches is withheld, never summed over the rest;
 *   - a scoped seat reads only its own wall, and a line that has not started
 *     does not move that wall;
 *   - the rule asks ONE seat, once, survives a normalisation round trip without
 *     asking again, closes its own ask when the exposure is gone, and never
 *     picks among managers;
 *   - under the REAL spine — copy-on-write savepoint, derived-event cascade,
 *     the Operating Seat's roll-up and the seal — the rule issues exactly one
 *     ask in one atomic commit, persists it, and does not ask twice.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { addDays } from '../../app/core/time.js';
import { activeSeat, buildSeats } from '../../app/core/domain/seat.js';
import { buildMatrix, buildMatrixReport, matrixAllocations, matrixLineScope } from '../../app/core/domain/matrix.js';
import { MATRIX_FLOORS, MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS } from '../../app/core/csv.js';
import {
  buildLineHorizon,
  lineHorizonBriefText,
  lineHorizonCsvRows,
  lineHorizonExposureSummary,
  lineHorizonExposures,
  parseLineHorizonExposureSummary,
  resolveLineHorizon,
} from '../../app/core/domain/lineHorizon.js';
import { LINE_HORIZON_CLOSED_PREFIX, lineHorizonRule } from '../../app/core/domain/lineHorizonRules.js';
import {
  LINE_HORIZON_BOUNDS,
  LINE_HORIZON_CSV_COLUMNS,
  LINE_HORIZON_CSV_DESCRIPTOR,
  LINE_HORIZON_LIMITS,
  LINE_HORIZON_OWNER_STATE_KEYS,
  LINE_HORIZON_RULE_ID,
  LINE_HORIZON_SCAN_EVENT,
  LINE_HORIZON_VERDICT_KEYS,
} from '../../app/core/domain/lineHorizonRegistry.js';
import { renderMatrixHorizonPanel } from '../../app/views/matrixHorizonPanel.js';
import { renderMatrix } from '../../app/views/matrix.js';

// A Wednesday, so the first week bucket is a short one (Wed–Sun, five days).
const NOW = new Date('2026-11-11T12:00:00.000Z');
const ISO = NOW.toISOString();
const at = (day) => new Date(`${day}T12:00:00.000Z`);

function person(id, name, level, managerId = null) {
  return { id, name, level, managerId, status: 'active', createdAt: ISO };
}

function line(id, personId, managerId, kind, shareH, fromISO = '2026-01-01', toISO = null) {
  return {
    id, personId, managerId, kind, shareH, rights: [], fromISO, toISO,
    declaredAt: ISO, declaredBySeatId: null, history: [], status: toISO ? 'ended' : 'active',
  };
}

/**
 * One functional director (Finn) with six reports, a project director (Petra)
 * and a product director (Pria), all under one VP (Vera).
 *
 *   Ann  home 0.60 + project 0.40 ending 30 Nov   → 0.60 from 1 Dec  (unallocated ahead)
 *   Ben  project 0.50 ending 15 Dec, NO home share → split unknown TODAY, whole from 16 Dec
 *   Cat  home 0.50 + project 0.50, product 0.30 from 23 Nov → 1.30 (double-booked ahead)
 *   Dan  home 1.00, project line with NO share from 4 Jan   → split unknown ahead
 *   Eve  home 0.60 + project 0.40 to 31 Dec, product 0.40 from 1 Jan → balanced throughout
 *   Fay  home line only                                      → steady
 */
function fixture({ settings = {}, mutate = null } = {}) {
  const state = createEmptyState(ISO);
  state.people = [
    person('vp', 'Vera Vice', 'vp'),
    person('fd', 'Finn Functional', 'director', 'vp'),
    person('pd', 'Petra Project', 'director', 'vp'),
    person('pr', 'Pria Product', 'director', 'vp'),
    person('ann', 'Ann Able', 'ic', 'fd'),
    person('ben', 'Ben Brook', 'ic', 'fd'),
    person('cat', 'Cat Cole', 'ic', 'fd'),
    person('dan', 'Dan Dove', 'ic', 'fd'),
    person('eve', 'Eve Eads', 'ic', 'fd'),
    person('fay', 'Fay Fenn', 'ic', 'fd'),
    person('gus', 'Gus Gray', 'ic', 'pd'),
  ];
  state.reportingLines = [
    line('h-ann', 'ann', 'fd', 'functional', 60),
    line('p-ann', 'ann', 'pd', 'project', 40, '2026-01-01', '2026-11-30'),
    line('p-ben', 'ben', 'pd', 'project', 50, '2026-01-01', '2026-12-15'),
    line('h-cat', 'cat', 'fd', 'functional', 50),
    line('p-cat', 'cat', 'pd', 'project', 50),
    line('r-cat', 'cat', 'pr', 'product', 30, '2026-11-23', null),
    line('h-dan', 'dan', 'fd', 'functional', 100),
    line('p-dan', 'dan', 'pd', 'project', null, '2027-01-04', null),
    line('h-eve', 'eve', 'fd', 'functional', 60),
    line('p-eve', 'eve', 'pd', 'project', 40, '2026-01-01', '2026-12-31'),
    line('r-eve', 'eve', 'pr', 'product', 40, '2027-01-01', null),
  ];
  if (mutate) mutate(state);
  state.settings = { ...state.settings, ...settings };
  return normalizeState(state, { now: NOW }).state;
}

/** Call the rule directly on a plain draft — the unit path. The spine proof below runs the registered rule under the real engine. */
function runRule(draft, type, { now = NOW, derived = false } = {}) {
  const log = [];
  const warnings = [];
  let sequence = draft.__seq || 0;
  const effects = lineHorizonRule(draft, {
    event: { type, entity: 'workspace', entityId: 'test' },
    now,
    derived,
    idFactory: (prefix) => `${prefix}-lhz-${++sequence}`,
    logEvent: (entry) => log.push(entry),
    warnings,
  });
  Object.defineProperty(draft, '__seq', { value: sequence, enumerable: false, configurable: true, writable: true });
  return { effects, log, warnings };
}

const draftOf = (state) => JSON.parse(JSON.stringify(state));
const asksOf = (draft) => draft.delegations.filter((d) => String(d.support || '').includes(LINE_HORIZON_RULE_ID));
const ruleLinks = (draft, relation) => draft.links.filter((l) => l.ruleId === LINE_HORIZON_RULE_ID && l.relation === relation);
const ruleMarkers = (draft) => draft.matrixMarkers.filter((m) => m.ruleId === LINE_HORIZON_RULE_ID);

/* ------------------------------------------------------- 0. honest boundary */

test('the horizon is wired end to end: panel, actions, gateway, CSV #134, rule and contract', () => {
  // ADR-0179 itself added no schema move (it shipped on v143). The pin tracks
  // the live version: ADR-0181 moved it to v144 for the work-turn ledger.
  assert.equal(SCHEMA_VERSION, 147, 'the live schema version (ADR-0179 added no move of its own)');
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'horizon'), 'the #/matrix?panel=horizon tab exists');
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'chargeback'), 'the previous panel is untouched');

  const scope = CSV_EXPORTS.find((item) => item.key === LINE_HORIZON_CSV_DESCRIPTOR.key);
  assert.equal(scope, LINE_HORIZON_CSV_DESCRIPTOR, 'CSV scope line-horizon is registered');
  assert.equal(CSV_EXPORTS.length, 139, 'the register holds every scope through #139 (the pin states the total so it cannot drift silently)');
  // Scopes are only ever appended: #134 keeps its index when #135 (ADR-0181) lands after it.
  assert.equal(CSV_EXPORTS[133], LINE_HORIZON_CSV_DESCRIPTOR, 'appended at index 133, and a later scope does not move it');

  const ruleIndex = DEFAULT_POST_COMMIT_RULES.indexOf(lineHorizonRule);
  assert.ok(ruleIndex > 0, 'RULE-LHZ-01 is on the post-commit spine');
  assert.equal(DEFAULT_POST_COMMIT_RULES[ruleIndex + 1].id, 'seatRule', 'immediately before seatRule: an ask issued here rolls up in the same transaction');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === lineHorizonRule);
  assert.ok(contract, 'one contract per rule');
  assert.match(contract.purpose, /RULE-LHZ-01/);
  assert.deepEqual(contract.writes, ['delegations', 'links', 'matrixMarkers']);
  assert.equal(contract.scansWorkspace, true);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'rule/contract parity');

  // The gateway: the report is a SAFE_READ under enforcement; the scan writes
  // through the spine, so it stays on a declared right and is never safe.
  assert.ok(SAFE_READS.has('matrixHorizonReport'), 'the report is readable under enforcement');
  assert.equal(SAFE_READS.has('matrixHorizonScan'), false, 'the scan is a write and is not a safe read');
  assert.equal(API_RIGHTS.matrixHorizonReport, 'declare-matrix-line');
  assert.equal(API_RIGHTS.matrixHorizonScan, 'declare-matrix-line');
});

/* ---------------------------------------------------------------- 1. registry */

test('the vocabulary is closed and the CSV header carries no identifier column', () => {
  assert.deepEqual(LINE_HORIZON_VERDICT_KEYS, [
    'double-booked-ahead', 'split-unknown-ahead', 'unallocated-ahead', 'exposed-now', 'changes-ahead', 'steady',
  ]);
  assert.deepEqual(LINE_HORIZON_OWNER_STATE_KEYS, ['unique', 'leader-held', 'ambiguous', 'off-roster']);
  assert.equal(LINE_HORIZON_CSV_COLUMNS.length, 39);
  assert.equal(new Set(LINE_HORIZON_CSV_COLUMNS).size, 39);
  assert.equal(LINE_HORIZON_CSV_COLUMNS.some((column) => /(^|_)(id|name|person|manager|seat|note)$/.test(column)), false);
  assert.equal(LINE_HORIZON_RULE_ID, 'RULE-LHZ-01');
  assert.deepEqual(parseLineHorizonExposureSummary(lineHorizonExposureSummary('over-committed', '2026-11-23')), { state: 'over-committed', fromISO: '2026-11-23' });
  assert.equal(parseLineHorizonExposureSummary('Forward allocation exposure: balanced from 2026-11-23.'), null);
  assert.equal(parseLineHorizonExposureSummary('anything else'), null);
});

/* ------------------------------------------------------------------ 2. window */

test('the horizon is whole ISO weeks from today; a value outside the bounds is refused, never clamped', () => {
  const window = resolveLineHorizon(NOW);
  assert.equal(window.valid, true);
  assert.equal(window.weeks, LINE_HORIZON_BOUNDS.weeks.fallback);
  assert.equal(window.from, '2026-11-11');
  assert.deepEqual({ ...window.buckets[0] }, { index: 1, from: '2026-11-11', to: '2026-11-15', days: 5, partial: true });
  assert.equal(window.buckets.length, 13);
  assert.equal(window.buckets.slice(1).every((bucket) => bucket.days === 7 && !bucket.partial), true);
  assert.equal(window.to, '2027-02-07');
  assert.equal(window.days, 5 + 12 * 7);
  assert.equal(window.buckets.reduce((sum, bucket) => sum + bucket.days, 0), window.days);

  const monday = resolveLineHorizon(at('2026-11-09'), 2);
  assert.deepEqual({ ...monday.buckets[0] }, { index: 1, from: '2026-11-09', to: '2026-11-15', days: 7, partial: false });
  assert.equal(monday.days, 14);
  assert.equal(resolveLineHorizon(NOW, '4').weeks, 4);

  for (const bad of [0, 27, -3, 1.5, 'abc', '13 weeks']) {
    const refused = resolveLineHorizon(NOW, bad);
    assert.equal(refused.valid, false, `${bad} must be refused`);
    assert.equal(refused.weeks, null, 'no other horizon is substituted');
    assert.match(refused.refuseReason, /from 1 to 26/);
  }
  const report = buildLineHorizon(fixture(), { now: NOW, weeks: 99 });
  assert.equal(report.window.valid, false);
  assert.deepEqual(report.people, []);
  assert.match(lineHorizonBriefText(report), /REFUSED/);
  const [row] = lineHorizonCsvRows(report);
  assert.equal(row.reading_complete, 'no');
  assert.deepEqual(Object.keys(row), [...LINE_HORIZON_CSV_COLUMNS]);
});

/* ------------------------------------------------------ 3. one engine, not two */

test('reading forward stores nothing, and its first day IS the live ledger', () => {
  const state = fixture();
  const before = JSON.stringify(state);
  const report = buildLineHorizon(state, { now: NOW });
  lineHorizonBriefText(report);
  lineHorizonCsvRows(report);
  assert.equal(JSON.stringify(state), before, 'a pure read: not one stored byte moved');

  const live = matrixAllocations(buildMatrix(state, { now: NOW }));
  assert.equal(report.board.peopleN, live.length);
  const tally = { balanced: 0, 'over-committed': 0, 'under-allocated': 0, undeclared: 0 };
  for (const allocation of live) {
    tally[allocation.shareState] += 1;
    const row = report.people.find((candidate) => candidate.personId === allocation.personId);
    assert.ok(row, `missing forward row for ${allocation.personId}`);
    assert.equal(row.stateToday, allocation.shareState);
    assert.equal(row.totalTodayH, allocation.totalH);
    assert.equal(row.lineNToday, allocation.lineN);
  }
  assert.deepEqual({ ...report.board.todayStates }, tally);
});

test('every weekly figure equals a day-by-day evaluation of the live ledger', () => {
  const state = fixture();
  const report = buildLineHorizon(state, { now: NOW });
  const buckets = report.window.buckets;
  const oracle = buckets.map(() => ({ states: { balanced: 0, 'over-committed': 0, 'under-allocated': 0, undeclared: 0 }, attributedH: 0, undeclaredDays: 0 }));
  let days = 0;
  for (let day = report.window.from; day <= report.window.to; day = addDays(day, 1)) {
    days += 1;
    const week = oracle[buckets.findIndex((bucket) => bucket.from <= day && day <= bucket.to)];
    for (const allocation of matrixAllocations(buildMatrix(state, { now: at(day) }))) {
      week.states[allocation.shareState] += 1;
      if (allocation.totalH === null) week.undeclaredDays += 1; else week.attributedH += allocation.totalH;
    }
  }
  assert.equal(days, report.window.days);
  assert.equal(report.board.segmentN, 6, 'the ledger was evaluated on 6 days, not 89');
  report.weeks.forEach((week, index) => {
    assert.deepEqual({ ...week.statePersonDays }, oracle[index].states, `week ${week.index} person-days by state`);
    assert.equal(week.personDaysN, report.board.peopleN * week.days);
    assert.equal(week.undeclaredPersonDaysN, oracle[index].undeclaredDays);
    assert.equal(week.personDaysReconcile, true);
    if (oracle[index].undeclaredDays === 0) {
      assert.equal(week.complete, true);
      assert.equal(week.attributedShareDaysH, oracle[index].attributedH, `week ${week.index} share-days`);
      assert.equal(week.capacityShareDaysH, 100 * report.board.peopleN * week.days);
      assert.equal(week.shareDaysReconcile, true);
    } else {
      // A partial sum would be a smaller number wearing the whole name.
      assert.equal(week.complete, false);
      assert.equal(week.attributedShareDaysH, null);
      assert.equal(week.overShareDaysH, null);
      assert.match(week.withheldReason, /WITHHELD/);
    }
  });
  // Weeks 7 and 8 are the only ones no undeclared split touches (Ben is whole
  // from 16 Dec, Dan's undeclared line starts 4 Jan).
  assert.deepEqual(report.weeks.filter((week) => week.complete).map((week) => week.index), [7, 8]);
  const week7 = report.weeks[6];
  assert.equal(week7.attributedShareDaysH, 7630);
  assert.equal(week7.overShareDaysH, 210, 'Cat: 0.30 over for 7 days');
  assert.equal(week7.unallocatedShareDaysH, 280, 'Ann: 0.40 held by nobody for 7 days');
  assert.equal(week7.attributedShareDaysH - week7.capacityShareDaysH, week7.overShareDaysH - week7.unallocatedShareDaysH + week7.driftShareDaysH);
});

/* ----------------------------------------------------- 4. verdicts and events */

test('one verdict per person, worst first, and the six add to the headcount', () => {
  const report = buildLineHorizon(fixture(), { now: NOW });
  const verdictOf = (id) => report.people.find((row) => row.personId === id).verdict;
  assert.equal(verdictOf('cat'), 'double-booked-ahead');
  assert.equal(verdictOf('dan'), 'split-unknown-ahead');
  assert.equal(verdictOf('ann'), 'unallocated-ahead');
  assert.equal(verdictOf('ben'), 'exposed-now', 'already undeclared today: the live ledger’s finding, not a forward one');
  assert.equal(verdictOf('eve'), 'changes-ahead');
  for (const id of ['fay', 'gus', 'vp', 'fd', 'pd', 'pr']) assert.equal(verdictOf(id), 'steady');
  assert.deepEqual({ ...report.board.verdicts }, {
    'double-booked-ahead': 1, 'split-unknown-ahead': 1, 'unallocated-ahead': 1, 'exposed-now': 1, 'changes-ahead': 1, steady: 6,
  });
  assert.equal(report.board.verdictsReconcile, true);
  assert.equal(report.board.personDaysReconcile, true);
  assert.equal(report.board.personDaysN, 11 * 89);
  assert.deepEqual(report.people.map((row) => row.verdict), [...report.people.map((row) => row.verdict)].sort((a, b) => LINE_HORIZON_VERDICT_KEYS.indexOf(a) - LINE_HORIZON_VERDICT_KEYS.indexOf(b)), 'worst first');

  const cat = report.people.find((row) => row.personId === 'cat');
  assert.deepEqual(cat.runs.map((run) => [run.state, run.from, run.to, run.days, run.totalDisplay]), [
    ['balanced', '2026-11-11', '2026-11-22', 12, '1.00'],
    ['over-committed', '2026-11-23', '2027-02-07', 77, '1.30'],
  ]);
  assert.equal(cat.attributedShareDaysH, 12 * 100 + 77 * 130);
  assert.equal(cat.overShareDaysH, 77 * 30);
  const dan = report.people.find((row) => row.personId === 'dan');
  assert.equal(dan.attributedShareDaysH, null, 'a person with an undeclared day has no share-day total');
  assert.equal(dan.unattributableDaysN, 35);
});

test('a dated change is printed with what the person is left in on the day after', () => {
  const report = buildLineHorizon(fixture(), { now: NOW });
  assert.deepEqual(report.events.map((event) => [event.day, event.kind, event.personId, event.managerId, event.outcome, event.totalAfterDisplay, event.weekIndex]), [
    ['2026-11-23', 'roll-on', 'cat', 'pr', 'over-committed', '1.30', 3],
    ['2026-12-01', 'roll-off', 'ann', 'pd', 'under-allocated', '0.60', 4],
    ['2026-12-16', 'roll-off', 'ben', 'pd', 'returns-to-home', '1.00', 6],
    ['2027-01-01', 'roll-off', 'eve', 'pd', 'balanced', '1.00', 8],
    ['2027-01-01', 'roll-on', 'eve', 'pr', 'balanced', '1.00', 8],
    ['2027-01-04', 'roll-on', 'dan', 'pd', 'undeclared', null, 9],
  ]);
  assert.equal(report.events.find((event) => event.personId === 'ann').lastDay, '2026-11-30', 'the last day ON the line is kept beside the first day off it');
  assert.equal(report.board.rollOffN, 3);
  assert.equal(report.board.rollOnN, 3);
  assert.equal(report.board.returnsToHomeN, 2, 'Ann and Ben are each left holding only their home line');
  assert.equal(report.board.returnsWholeN, 1, 'only Ben is whole; Ann’s home line declares 0.60');
  assert.equal(report.board.additionalLineN, 7);
  assert.equal(report.board.openEndedLineN, 4);
  assert.equal(report.weeks.reduce((sum, week) => sum + week.rollOffN, 0), report.board.rollOffN);
  assert.equal(report.weeks.reduce((sum, week) => sum + week.rollOnN, 0), report.board.rollOnN);

  const petra = report.managers.find((row) => row.managerId === 'pd');
  assert.deepEqual([petra.todayPeopleN, petra.lastPeopleN, petra.rollOffN, petra.rollOnN], [5, 3, 3, 1]);
  assert.equal(petra.shareDaysH, null, 'Ben’s and Dan’s unknown splits withhold her total');
  assert.equal(petra.unresolvedPersonDaysN, 70);
  const pria = report.managers.find((row) => row.managerId === 'pr');
  assert.deepEqual([pria.todayPeopleN, pria.todayShareH, pria.lastPeopleN, pria.lastShareH, pria.changeH], [0, 0, 2, 70, 70]);
  assert.equal(pria.shareDaysH, 77 * 30 + 38 * 40, 'Cat 0.30 for 77 days, Eve 0.40 for 38');
  assert.equal(pria.personDaysDisplay, '38.30');
  assert.equal(report.managers.find((row) => row.managerId === 'fd').returnsN, 2);
});

/* ------------------------------------------------------- 5. refusal vs totals */

test('a complete reading prints exact totals and four separate reconciliations; an incomplete one prints none', () => {
  const partial = buildLineHorizon(fixture(), { now: NOW });
  assert.equal(partial.board.readingComplete, false);
  assert.equal(partial.board.undeclaredPersonDaysN, 70, 'Ben 35 days + Dan 35 days');
  for (const key of ['attributedShareDaysH', 'capacityShareDaysH', 'overShareDaysH', 'unallocatedShareDaysH', 'shareDaysReconcile', 'fanOutReconcile']) {
    assert.equal(partial.board[key], null, `${key} must be withheld, not a partial figure`);
  }
  assert.match(partial.board.withheldReason, /70 person-day\(s\)/);

  const complete = buildLineHorizon(fixture({
    mutate: (state) => {
      state.reportingLines.push(line('h-ben', 'ben', 'fd', 'functional', 50));
      state.reportingLines.find((row) => row.id === 'p-dan').shareH = 20;
    },
  }), { now: NOW });
  const b = complete.board;
  assert.equal(b.readingComplete, true);
  assert.equal(b.withheldReason, '');
  assert.equal(b.capacityShareDaysH, 11 * 89 * 100);
  assert.equal(b.shareDaysReconcile, true);
  assert.equal(b.attributedShareDaysH - b.capacityShareDaysH, b.overShareDaysH - b.unallocatedShareDaysH + b.driftShareDaysH);
  assert.equal(b.fanOutReconcile, true, 'what the managers hold adds to what the people carry');
  assert.equal(b.fanOutShareDaysH, b.attributedShareDaysH);
  assert.equal(b.weeksReconcile, true, 'the person rows add to the weeks');
  assert.equal(complete.weeks.reduce((sum, week) => sum + week.attributedShareDaysH, 0), b.attributedShareDaysH);
  assert.equal(complete.managers.reduce((sum, row) => sum + row.shareDaysH, 0), b.attributedShareDaysH);
  // Cat 0.30 over for 77 days; Dan 1.20 for 35 days; Ann 0.40 short for 69; Ben 0.50 short from 16 Dec (54 days).
  assert.equal(b.overShareDaysH, 77 * 30 + 35 * 20);
  assert.equal(b.unallocatedShareDaysH, 69 * 40 + 54 * 50);
});

test('a declaration the ledger refuses withholds the totals it touches and is listed with its days', () => {
  const withRow = (row) => buildLineHorizon(fixture({
    mutate: (state) => {
      // Start from a reading that is otherwise complete, so the refusal is the only cause.
      state.reportingLines.push(line('h-ben', 'ben', 'fd', 'functional', 50));
      state.reportingLines.find((candidate) => candidate.id === 'p-dan').shareH = 20;
      if (row) state.reportingLines.push(row);
    },
  }), { now: NOW });
  assert.equal(withRow(null).board.readingComplete, true);

  const cases = [
    // An unparseable share on a line in force today: refused on all 89 days.
    [line('bad-fay', 'fay', 'pd', 'project', 999), 'bad-share', '2026-11-11', 89],
    // A line to a manager who is not on the roster, starting 1 Dec: refused from that day only.
    [line('ghost-fay', 'fay', 'nobody', 'project', 40, '2026-12-01'), 'missing-manager', '2026-12-01', 69],
    // Reversed dates name no window; the row is refused on every day between the two dates.
    [line('rev-fay', 'fay', 'pd', 'project', 40, '2026-12-10', '2026-12-01'), 'bad-window', '2026-12-01', 10],
  ];
  for (const [row, defect, firstDay, days] of cases) {
    const report = withRow(row);
    assert.deepEqual(report.refusedLines.map((l) => [l.lineId, l.defect, l.personName, l.firstDay, l.days]), [[row.id, defect, 'Fay Fenn', firstDay, days]], row.id);
    assert.equal(report.board.refusedLineN, 1);
    assert.equal(report.board.readingComplete, false, row.id);
    assert.equal(report.board.refusedLinePersonDaysN, days);
    assert.equal(report.board.undeclaredPersonDaysN, 0);
    assert.equal(report.board.attributedShareDaysH, null, 'no partial total');
    assert.match(report.board.withheldReason, new RegExp(`${days} person-day\\(s\\) under a declaration the ledger does not read`));
    const fay = report.people.find((candidate) => candidate.personId === 'fay');
    assert.equal(fay.attributedShareDaysH, null);
    assert.equal(fay.unattributableDaysN, days);
    // Counts survive: the refusal withholds totals, it does not drop people.
    assert.equal(report.board.verdictsReconcile, true);
    assert.equal(report.board.personDaysN, 11 * 89);
    // Only the weeks the refused days fall in lose their totals.
    assert.equal(report.weeks.filter((week) => !week.complete).reduce((sum, week) => sum + week.refusedLinePersonDaysN, 0), days);
    assert.equal(report.weeks.filter((week) => week.complete).every((week) => Number.isInteger(week.attributedShareDaysH)), true);
  }

  // A future line that would close a loop is refused from the day it starts; it is never wired.
  const loop = withRow(line('loop', 'fd', 'fay', 'project', 20, '2026-12-01'));
  assert.deepEqual(loop.refusedLines.map((l) => [l.lineId, l.defect, l.personName, l.firstDay, l.days]), [['loop', 'cycle', 'Finn Functional', '2026-12-01', 69]]);
  assert.equal(loop.events.some((event) => event.personId === 'fd'), false);
  assert.equal(loop.board.engineFlipN, 0);
});

test('a home share that lapses is a dated event, and the split it leaves unknown belongs to the home line', () => {
  const state = fixture({
    mutate: (raw) => {
      raw.reportingLines.push(line('h-fay', 'fay', 'fd', 'functional', 60, '2026-01-01', '2026-11-20'));
      raw.reportingLines.push(line('p-fay', 'fay', 'pd', 'project', 40));
    },
  });
  const report = buildLineHorizon(state, { now: NOW });
  const event = report.events.find((candidate) => candidate.personId === 'fay');
  assert.deepEqual([event.day, event.kind, event.managerId, event.lastDay, event.outcome], ['2026-11-21', 'home-share-end', 'fd', '2026-11-20', 'undeclared']);
  assert.equal(report.board.homeShareChangeN, 1);
  assert.equal(report.people.find((candidate) => candidate.personId === 'fay').verdict, 'split-unknown-ahead');
  const exposure = report.exposures.find((candidate) => candidate.personId === 'fay');
  assert.deepEqual([exposure.state, exposure.from, exposure.ownerState, exposure.ownerName], ['undeclared', '2026-11-21', 'unique', 'Finn Functional']);

  const draft = draftOf(state);
  runRule(draft, 'matrix.line.declared');
  const ask = asksOf(draft).find((d) => /Fay Fenn/.test(d.title));
  assert.equal(ask.personId, 'fd', 'the line with no declared share is the one that must speak');
  assert.equal(ask.dueOn, '2026-11-20');
  assert.match(ask.expectedOutcome, /holds 2 reporting lines and 1 of them carries no declared share/);
  assert.match(ask.expectedOutcome, /No share was filled in automatically/);
  // Roll-up provenance follows the matrix DAG — and the synthetic leader is
  // excluded, exactly as RULE-SEAT-01's ancestorsOf excludes it.
  const edges = draft.links.filter((link) => link.sourceType === 'delegation' && link.sourceId === ask.id
    && link.relation === 'rolls-up-to');
  assert.ok(edges.some((link) => link.targetId === 'vp' && link.ruleId === LINE_HORIZON_RULE_ID),
    'the ask rolls up to the VP seat above the owner');
  assert.equal(edges.some((link) => link.targetId === 'leader'), false,
    'the synthetic leader is not a roll-up target — the same convention as RULE-SEAT-01');
});

/* --------------------------------------------------------------- 6. the seat */

test('a scoped seat reads its own wall; a line that has not started does not move it', () => {
  const state = fixture({ settings: { activeSeatId: 'pd' } });
  const report = buildLineHorizon(state, { now: NOW });
  const matrix = buildMatrix(state, { now: NOW });
  const seat = activeSeat(buildSeats(state, { now: NOW, settings: state.settings, lineScope: matrixLineScope(matrix).byManager }));
  assert.equal(seat.id, 'pd');
  assert.equal(Boolean(seat.fullAccess), false);
  const wall = new Set([...seat.scope, ...(seat.lineScope || [])]);
  assert.equal(report.scope, 'seat-span');
  assert.equal(report.board.peopleN, [...wall].filter((id) => matrix.roster.has(id)).length);
  assert.equal(report.people.every((row) => wall.has(row.personId)), true);
  for (const id of ['gus', 'ann', 'ben', 'cat', 'eve']) assert.ok(report.people.some((row) => row.personId === id), `${id} is inside Petra’s wall`);
  for (const id of ['dan', 'fay', 'fd', 'vp', 'pr']) assert.equal(report.people.some((row) => row.personId === id), false, `${id} is outside Petra’s wall`);
  assert.equal(report.board.verdictsReconcile, true);
  assert.equal(report.board.personDaysN, report.board.peopleN * 89);

  // Dan's line to Petra starts on 4 Jan. Until then he is outside the wall, so
  // she is shown that ONE line as a party to it — not his state or other lines.
  assert.equal(report.events.some((event) => event.personId === 'dan'), false);
  assert.equal(report.exposures.some((row) => row.personId === 'dan'), false);
  assert.deepEqual(report.incoming, [{ day: '2027-01-04', daysUntil: 54, personName: 'Dan Dove', lineKindLabel: 'Project', shareDisplay: null, toISO: null }]);

  // Above the declared detail ceiling the live ledger withholds manager names;
  // the forward reading follows the same ceiling on the same seat.
  for (const seatId of ['pd', 'vp']) {
    const scoped = fixture({ settings: { activeSeatId: seatId } });
    const scopedSeat = activeSeat(buildSeats(scoped, { now: NOW, settings: scoped.settings, lineScope: matrixLineScope(buildMatrix(scoped, { now: NOW })).byManager }));
    const scopedReport = buildLineHorizon(scoped, { now: NOW });
    const above = Number(scopedSeat.rank) >= MATRIX_FLOORS.detailRank;
    assert.equal(scopedReport.managerNamesWithheld, above, `seat ${seatId} (rank ${scopedSeat.rank})`);
    assert.equal(scopedReport.managers.every((row) => (above ? row.name === null && row.managerId === null : typeof row.name === 'string')), true);
  }
});

test('a single-chain workspace gains no row, and the rule is inert in it', () => {
  const state = fixture({ mutate: (raw) => { raw.reportingLines = []; } });
  const report = buildLineHorizon(state, { now: NOW });
  assert.equal(report.isMatrix, false);
  assert.match(report.singleChainNote, /single-chain workspace gains no row/);
  assert.equal(report.board.verdicts.steady, 11);
  assert.deepEqual(report.events, []);
  assert.deepEqual(report.exposures, []);
  assert.equal(report.board.readingComplete, true);
  assert.equal(report.board.attributedShareDaysH, 11 * 89 * 100);

  const draft = draftOf(state);
  const before = JSON.stringify(draft);
  for (const type of ['matrix.line.declared', LINE_HORIZON_SCAN_EVENT, 'decision.created', 'person.updated']) {
    assert.deepEqual(runRule(draft, type).effects, []);
  }
  assert.equal(JSON.stringify(draft), before);
});

/* ----------------------------------------------------------- 7. brief and CSV */

test('the brief and the CSV are aggregate: no person, manager or line crosses the boundary', () => {
  const state = fixture();
  const report = buildLineHorizon(state, { now: NOW });
  const rows = lineHorizonCsvRows(report);
  assert.equal(rows.length, 1 + 13 + 6);
  for (const row of rows) assert.deepEqual(Object.keys(row), [...LINE_HORIZON_CSV_COLUMNS]);
  assert.deepEqual(rows.map((row) => row.row_kind), ['workspace', ...Array(13).fill('week'), ...Array(6).fill('verdict')]);

  const [workspace] = rows;
  assert.equal(workspace.people_n, 11);
  assert.equal(workspace.person_days_n, 979);
  assert.equal(workspace.over_person_days_n, 77);
  assert.equal(workspace.under_person_days_n, 69);
  assert.equal(workspace.undeclared_person_days_n, 70);
  assert.equal(workspace.attributed_share_days_h, '', 'withheld is a blank cell, never a zero');
  assert.equal(workspace.share_days_reconcile, '');
  assert.equal(workspace.reading_complete, 'no');
  assert.equal(workspace.person_days_reconcile, 'yes');
  assert.equal(workspace.verdicts_reconcile, 'yes');
  assert.equal(workspace.ahead_inside_lead_window_n, 1);
  assert.equal(workspace.owner_unique_n, 1);
  assert.equal(workspace.owner_unresolved_n, 0);
  assert.equal(rows.filter((row) => row.row_kind === 'verdict').reduce((sum, row) => sum + row.people_n, 0), 11);
  assert.equal(rows.filter((row) => row.row_kind === 'week').reduce((sum, row) => sum + row.person_days_n, 0), 979);
  assert.equal(rows[7].attributed_share_days_h, 7630, 'week 7 is complete and prints its integer');

  const exported = `${JSON.stringify(rows)} ${lineHorizonBriefText(report)}`;
  for (const p of state.people) {
    assert.equal(exported.includes(p.name), false, `${p.name} leaked`);
    assert.equal(new RegExp(`"${p.id}"`).test(exported), false, `${p.id} leaked`);
  }
  for (const row of state.reportingLines) assert.equal(exported.includes(row.id), false, `${row.id} leaked`);
  assert.match(lineHorizonBriefText(report), /1 double-booked ahead, 1 with a split that becomes unknown, 1 unallocated ahead, 1 exposed today/);
  assert.match(lineHorizonBriefText(report), /WITHHELD/);
});

/* ------------------------------------------------------------ 8. RULE-LHZ-01 */

test('RULE-LHZ-01 asks the ONE seat above a double-booking, once, with typed provenance', () => {
  const draft = draftOf(fixture());
  const first = runRule(draft, 'matrix.line.declared');
  assert.deepEqual(first.effects.map((effect) => effect.action), ['delegated', 'observed']);
  assert.equal(first.effects.every((effect) => effect.ruleId === LINE_HORIZON_RULE_ID), true);

  // Only Cat's exposure (23 Nov) begins inside the 14-day lead window; Ann's
  // (1 Dec) and Dan's (4 Jan) are read on the panel but not yet asked about.
  const asks = asksOf(draft);
  assert.equal(asks.length, 1);
  const [ask] = asks;
  assert.equal(ask.personId, 'vp', 'Finn, Petra and Pria each hold part of Cat; the one seat above all three is Vera');
  assert.equal(ask.status, 'active');
  assert.equal(ask.delegatedOn, '2026-11-11');
  assert.equal(ask.dueOn, '2026-11-22', 'the day before the double-booking starts');
  assert.match(ask.title, /Cat Cole/);
  assert.match(ask.expectedOutcome, /total 1\.30 of a person across 3 lines/);
  assert.match(ask.expectedOutcome, /Nothing was changed automatically/);

  assert.deepEqual(ruleLinks(draft, 'issues-obligation').map((l) => [l.sourceType, l.sourceId, l.targetType, l.targetId, l.summary]), [
    ['person', 'cat', 'delegation', ask.id, 'Forward allocation exposure: over-committed from 2026-11-23.'],
  ]);
  assert.equal(ruleMarkers(draft).length, 1);
  assert.match(ruleMarkers(draft)[0].key, /^horizon\|2026-11-11\|14\|/);
  assert.equal(/Cat|Vera|Finn|Petra|Pria/.test(ruleMarkers(draft)[0].detail), false, 'the shared-ledger trace is identity-free');
  assert.equal(JSON.stringify(draft.reportingLines), JSON.stringify(fixture().reportingLines), 'the rule never edits a line, a share or a date');

  // Idempotent on the same record…
  const snapshot = JSON.stringify(draft);
  assert.deepEqual(runRule(draft, 'matrix.line.retuned').effects, []);
  assert.deepEqual(runRule(draft, LINE_HORIZON_SCAN_EVENT).effects, []);
  assert.equal(JSON.stringify(draft), snapshot);

  // …and after a reload: everything the rule keys on survives normalisation.
  const reloaded = normalizeState(draftOf(draft), { now: NOW }).state;
  assert.equal(asksOf(reloaded).length, 1);
  assert.equal(ruleLinks(reloaded, 'issues-obligation')[0].summary, 'Forward allocation exposure: over-committed from 2026-11-23.');
  assert.equal(ruleMarkers(reloaded).length, 1);
  assert.deepEqual(runRule(reloaded, 'matrix.line.declared').effects, []);
  assert.equal(asksOf(reloaded).length, 1, 'no second ask for the same exposure of the same seat');

  // The panel reads the ask back from the typed graph.
  const report = buildLineHorizon(reloaded, { now: NOW });
  assert.deepEqual({ ...report.asks.owners }, { unique: 1, 'leader-held': 0, ambiguous: 0, 'off-roster': 0 });
  assert.deepEqual([report.asks.insideLeadWindowN, report.asks.openN, report.asks.answeredN, report.asks.notIssuedN], [1, 1, 0, 0]);
  const exposure = report.exposures.find((row) => row.personId === 'cat');
  assert.deepEqual([exposure.ownerState, exposure.ownerName, exposure.askState, exposure.askDueOn, exposure.insideLeadWindow], ['unique', 'Vera Vice', 'open', '2026-11-22', true]);
  assert.deepEqual(report.exposures.map((row) => [row.personId, row.state, row.from, row.ownerName, row.insideLeadWindow]), [
    ['cat', 'over-committed', '2026-11-23', 'Vera Vice', true],
    ['ann', 'under-allocated', '2026-12-01', 'Finn Functional', false],
    ['dan', 'undeclared', '2027-01-04', 'Petra Project', false],
  ]);
});

test('the ask closes itself when the declared lines stop creating the exposure, and may then be asked again', () => {
  const draft = draftOf(fixture());
  runRule(draft, 'matrix.line.declared');
  const [ask] = asksOf(draft);

  draft.reportingLines.find((row) => row.id === 'p-cat').shareH = 20; // 0.50 + 0.20 + 0.30 = 1.00
  const closed = runRule(draft, 'matrix.line.retuned');
  assert.deepEqual(closed.effects.map((effect) => effect.action), ['completed']);
  assert.equal(ask.status, 'done');
  assert.equal(ask.completedOn, '2026-11-11');
  assert.ok(ask.completionNote.startsWith(LINE_HORIZON_CLOSED_PREFIX));
  assert.equal(normalizeState(draftOf(draft), { now: NOW }).state.delegations.find((d) => d.id === ask.id).status, 'done', 'the close is schema-valid');
  assert.deepEqual(runRule(draft, 'matrix.line.retuned').effects, []);

  draft.reportingLines.find((row) => row.id === 'p-cat').shareH = 50; // the double-booking is back
  runRule(draft, 'matrix.line.retuned');
  assert.equal(asksOf(draft).length, 2, 'an ask the RULE closed is not an answer; the exposure is asked about again');
  assert.equal(asksOf(draft).filter((d) => d.status === 'active').length, 1);
});

test('an ask a person closed while the exposure stands is an answer, and is not re-issued', () => {
  const draft = draftOf(fixture());
  runRule(draft, 'matrix.line.declared');
  const [ask] = asksOf(draft);
  Object.assign(ask, { status: 'done', completedOn: '2026-11-11', completionNote: 'Agreed with all three managers: Cat carries 1.30 until the release.' });
  assert.deepEqual(runRule(draft, 'matrix.line.retuned').effects, []);
  assert.deepEqual(runRule(draft, LINE_HORIZON_SCAN_EVENT).effects, []);
  assert.equal(asksOf(draft).length, 1);
  const report = buildLineHorizon(draft, { now: NOW });
  assert.deepEqual([report.asks.openN, report.asks.answeredN, report.asks.notIssuedN], [0, 1, 0]);
  assert.equal(report.people.find((row) => row.personId === 'cat').verdict, 'double-booked-ahead', 'answering the ask does not launder the reading');
});

test('the rule is gated by the declared matrix convention; an explicit scan still runs', () => {
  const draft = draftOf(fixture());
  // Set on the live state, as `matrixSetConventions` does.
  draft.settings.matrixAutoPropagate = false;
  const before = JSON.stringify(draft);
  for (const type of ['matrix.line.declared', 'person.updated', 'decision.created']) assert.deepEqual(runRule(draft, type).effects, []);
  assert.equal(JSON.stringify(draft), before);
  assert.deepEqual(runRule(draft, LINE_HORIZON_SCAN_EVENT).effects.map((effect) => effect.action), ['delegated', 'observed']);
  assert.equal(asksOf(draft).length, 1);
});

test('time passing is noticed on an ordinary write, and only when the calendar can matter', () => {
  // A derived record created inside another rule's transaction is not a reason to re-read.
  const derived = draftOf(fixture());
  assert.deepEqual(runRule(derived, 'decision.created', { derived: true }).effects, []);
  assert.equal(asksOf(derived).length, 0);
  // Spine events never trigger it.
  assert.deepEqual(runRule(derived, 'automation.propagated').effects, []);
  assert.deepEqual(runRule(derived, 'seat.handover.opened').effects, []);

  // 17 Dec: no line starts or ends inside the next 14 days and no ask is open → nothing to do.
  const quiet = draftOf(fixture());
  const quietBefore = JSON.stringify(quiet);
  assert.deepEqual(runRule(quiet, 'decision.created', { now: at('2026-12-17') }).effects, []);
  assert.equal(JSON.stringify(quiet), quietBefore);

  // 20 Nov: Ann's exposure (1 Dec) has walked into the window. An ordinary
  // write issues it to her HOME manager, and it rolls up to the seat above him.
  const draft = draftOf(fixture());
  runRule(draft, 'decision.created');
  assert.deepEqual(asksOf(draft).map((d) => d.personId), ['vp']);
  const later = runRule(draft, 'decision.created', { now: at('2026-11-20') });
  assert.deepEqual(later.effects.map((effect) => effect.action), ['delegated', 'observed']);
  const annAsk = asksOf(draft).find((d) => /Ann Able/.test(d.title));
  assert.equal(annAsk.personId, 'fd', 'an unallocated remainder falls back to the home line');
  assert.equal(annAsk.dueOn, '2026-11-30');
  assert.match(annAsk.expectedOutcome, /total 0\.60 of a person, which leaves 0\.40 held by nobody/);
  assert.deepEqual(ruleLinks(draft, 'rolls-up-to').filter((l) => l.sourceId === annAsk.id).map((l) => [l.targetType, l.targetId]), [['person', 'vp']]);
  assert.equal(asksOf(draft).length, 2, 'Cat’s ask is still the same one');
});

test('the day arriving does not close an ask; the exposure running out does', () => {
  // Permanent double-booking: on 24 Nov it has started and is still unfixed.
  const standing = draftOf(fixture());
  runRule(standing, 'matrix.line.declared');
  const onTheDay = runRule(standing, 'decision.created', { now: at('2026-11-24') });
  assert.equal(onTheDay.effects.some((effect) => effect.action === 'completed'), false, 'nothing is closed because the calendar moved');
  const catAsks = asksOf(standing).filter((d) => /Cat Cole/.test(d.title));
  assert.equal(catAsks.length, 1, 'and it is not asked a second time');
  assert.equal(catAsks[0].status, 'active', 'an unfixed double-booking that has started is still unfixed');
  // (The same write does issue Ann's ask: on 24 Nov her 1 Dec exposure is inside the window.)
  assert.deepEqual(asksOf(standing).map((d) => d.personId).sort(), ['fd', 'vp']);
  assert.equal(buildLineHorizon(standing, { now: at('2026-11-24') }).people.find((row) => row.personId === 'cat').verdict, 'exposed-now');

  // Temporary double-booking (23–27 Nov). On 17 Dec nothing is inside the lead
  // window, but the rule's own ask is open — so an ordinary write re-reads it.
  const lapsed = draftOf(fixture({ mutate: (state) => { state.reportingLines.find((row) => row.id === 'r-cat').toISO = '2026-11-27'; } }));
  runRule(lapsed, 'matrix.line.declared');
  const [ask] = asksOf(lapsed);
  assert.equal(ask.status, 'active');
  const after = runRule(lapsed, 'decision.created', { now: at('2026-12-17') });
  assert.deepEqual(after.effects.map((effect) => effect.action), ['completed']);
  assert.equal(ask.status, 'done');
  assert.equal(ask.completedOn, '2026-12-17');
  assert.ok(ask.completionNote.startsWith(LINE_HORIZON_CLOSED_PREFIX));
});

test('the rule never picks among managers: a leader-held apex is observed, not asked', () => {
  // Without the VP, the three directors meet only at the workspace leader.
  const state = fixture({
    mutate: (raw) => {
      raw.people = raw.people.filter((p) => p.id !== 'vp').map((p) => (p.managerId === 'vp' ? { ...p, managerId: null } : p));
    },
  });
  const report = buildLineHorizon(state, { now: NOW });
  const exposure = report.exposures.find((row) => row.personId === 'cat');
  assert.equal(exposure.ownerState, 'leader-held');
  assert.equal(exposure.ownerName, null);
  assert.deepEqual({ ...report.asks.owners }, { unique: 0, 'leader-held': 1, ambiguous: 0, 'off-roster': 0 });
  assert.equal(report.asks.ownersReconcile, true);

  const draft = draftOf(state);
  const result = runRule(draft, 'matrix.line.declared');
  assert.deepEqual(result.effects.map((effect) => effect.action), ['observed']);
  assert.equal(asksOf(draft).length, 0, 'no manager is substituted for the leader');
  assert.equal(ruleMarkers(draft).length, 1);
  assert.match(ruleMarkers(draft)[0].detail, /1 held by the workspace leader/);
  assert.deepEqual(runRule(draft, 'matrix.line.declared').effects, [], 'the observation is written once per day and reading');
});

test('asks are bounded per commit and the remainder is counted, then follows', () => {
  // Twelve people, each double-booked from 23 Nov under the same three directors.
  const state = fixture({
    mutate: (raw) => {
      for (let i = 1; i <= 12; i += 1) {
        const id = `x${String(i).padStart(2, '0')}`;
        raw.people.push(person(id, `Extra ${String(i).padStart(2, '0')}`, 'ic', 'fd'));
        raw.reportingLines.push(line(`h-${id}`, id, 'fd', 'functional', 60));
        raw.reportingLines.push(line(`p-${id}`, id, 'pd', 'project', 40));
        raw.reportingLines.push(line(`r-${id}`, id, 'pr', 'product', 30, '2026-11-23', null));
      }
    },
  });
  const sweep = lineHorizonExposures(state, { now: NOW, endISO: '2026-11-25' });
  assert.equal(sweep.ok, true);
  assert.equal(sweep.exposures.length, 13);
  const draft = draftOf(state);
  const first = runRule(draft, 'matrix.line.declared');
  assert.equal(asksOf(draft).length, LINE_HORIZON_LIMITS.asksPerCommit);
  const deferred = first.effects.find((effect) => effect.action === 'deferred');
  assert.match(deferred.summary, /^5 forward allocation ask\(s\) were not issued in this commit/);
  runRule(draft, 'decision.created');
  assert.equal(asksOf(draft).length, 13, 'the remainder follows on the next write');
  assert.deepEqual(runRule(draft, 'decision.created').effects, []);
  assert.equal(new Set(ruleLinks(draft, 'issues-obligation').map((l) => l.sourceId)).size, 13, 'one ask per exposed person');
});

/* ------------------------------------------------- 9. the real spine */

function spineBoot({ settings = {} } = {}) {
  const map = new Map();
  const storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-spine-${++seq}`;
  const state = fixture({ settings: { activeSeatId: 'vp', sealEnabled: true, ...settings } });
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { map, storage, store, api };
}

test('under the REAL spine the rule issues one ask in one atomic commit — savepoint, cascade, seat roll-up and seal', () => {
  const { map, store, api } = spineBoot();

  // An ordinary operational write. The rule sweeps because the declared line
  // `r-cat` starts on 23 Nov, inside the 14-day lead window — no scan, no
  // structural event, exactly how an unrelated write walks an exposure in.
  const created = api.addCase({ title: 'Horizon spine proof', kind: 'risk', ownerId: 'cat', openedOn: '2026-11-11' });
  assert.equal(created.ok, true, created?.error || 'the operational write is accepted');

  const lhz = (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === LINE_HORIZON_RULE_ID);
  assert.deepEqual(lhz.map((effect) => effect.action), ['delegated', 'observed'],
    'one ask and one identity-free marker from RULE-LHZ-01 in the same commit');

  // The ask, its typed provenance and the marker are PERSISTED, not just in memory.
  const asks = asksOf(store.state);
  assert.equal(asks.length, 1, 'exactly one ask — the derived cascade did not ask twice');
  assert.equal(asks[0].personId, 'vp', 'Finn, Petra and Pria each hold part of Cat; the one seat above all three is Vera');
  assert.equal(asks[0].status, 'active');
  assert.match(asks[0].dueOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(ruleLinks(store.state, 'issues-obligation').length, 1);
  assert.equal(ruleLinks(store.state, 'issues-obligation')[0].summary, 'Forward allocation exposure: over-committed from 2026-11-23.');
  // The ask's owner (Vera) sits directly under the synthetic leader, which is
  // not a roll-up target under the same convention as RULE-SEAT-01 — so the
  // ask itself carries no edge, while the seat rule's own fan-out (the case,
  // owned by Cat) IS in the same commit's links.
  const seatRollups = store.state.links.filter((link) => link.ruleId === 'RULE-SEAT-01' && link.relation === 'rolls-up-to');
  assert.ok(seatRollups.length >= 1, 'the Operating Seat rolled work up in the same commit');
  assert.equal(store.state.links.some((link) => link.ruleId === LINE_HORIZON_RULE_ID && link.relation === 'rolls-up-to'), false,
    'no roll-up edge for an owner whose only ancestor is the excluded synthetic leader');
  assert.equal(ruleMarkers(store.state).length, 1);

  // The seat roll-up and the seal ran over the SAME transaction.
  assert.ok((store.lastPropagations || []).some((effect) => effect && effect.ruleId === 'RULE-SEAT-01'),
    'the Operating Seat fanned the same commit (an operational write under a declared seat)');
  const seals = store.state.events.filter((event) => event.type === 'audit.seal');
  assert.equal(seals.length, 1, 'exactly one audit.seal covers this commit');
  assert.match(seals[0].summary, /^prev=/);

  // The bytes on disk carry the ask — not only the in-memory draft.
  const stored = JSON.parse(map.get(STORAGE_KEY));
  assert.equal(stored.delegations.filter((task) => String(task.support || '').includes(LINE_HORIZON_RULE_ID)).length, 1,
    'one ask in the persisted bytes');

  // display == stored: a fresh store over the same storage reads the same ask,
  // and the panel figure IS the stored open-ask count.
  let seq = 0;
  const reboot = createStore({
    storage: { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) },
    now: () => NOW,
    idFactory: (prefix) => `${prefix}-reboot-${++seq}`,
  });
  reboot.load();
  const report = buildLineHorizon(reboot.state, { now: NOW });
  const storedOpen = reboot.state.delegations.filter((task) => String(task.support || '').includes(LINE_HORIZON_RULE_ID)
    && task.status === 'active').length;
  assert.equal(report.asks.openN, 1);
  assert.equal(report.asks.openN, storedOpen, 'the printed figure is the stored figure');

  // A second ordinary write: the ask stands and is not re-issued.
  const second = api.addCase({ title: 'Second write', kind: 'risk', ownerId: 'cat', openedOn: '2026-11-11' });
  assert.equal(second.ok, true, second?.error);
  const lhzAgain = (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === LINE_HORIZON_RULE_ID);
  assert.deepEqual(lhzAgain, [], 'idempotent under the spine: no second ask, no second marker');
  assert.equal(asksOf(store.state).length, 1);
});

/* ------------------------------------------------------ 10. the panel */

function bootDocument() {
  const vc = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div></body></html>', {
    url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole: vc,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  return dom;
}

test('the panel prints the report the action returns, and a render stores nothing', () => {
  const dom = bootDocument();
  const errors = [];
  dom.window.addEventListener('error', (event) => errors.push(String(event.message)));

  // Operator view (no declared seat): the whole workspace, no withheld names.
  const map = new Map();
  const storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-panel-${++seq}`;
  map.set(STORAGE_KEY, JSON.stringify(fixture()));
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });

  const before = JSON.stringify(store.state);
  const result = api.matrixHorizonReport({ weeks: null });
  assert.equal(result.ok, true, result?.error);
  const report = result.report;

  const node = renderMatrixHorizonPanel({
    api,
    state: store.state,
    query: new URLSearchParams('panel=horizon'),
    navigate() {},
    refresh() {},
  }, { now: NOW });
  dom.window.document.body.append(node);
  const text = node.textContent;

  // The window on the screen is the window the action computed.
  assert.ok(text.includes(`${report.window.from} → ${report.window.to}`), 'horizon range printed');

  const tables = [...node.querySelectorAll('table')];
  const tableByCaption = (caption) => tables.find((table) => table.getAttribute('aria-label') === caption);

  // Row-for-row: the printed rows are the report's rows.
  const weekTable = tableByCaption('ISO weeks of the horizon');
  assert.ok(weekTable, 'the weeks table exists');
  assert.equal(weekTable.querySelectorAll('tbody tr').length, report.weeks.length);

  const peopleTable = tableByCaption('Person verdicts with today and last-day states');
  assert.ok(peopleTable, 'the people table exists');
  assert.equal(peopleTable.querySelectorAll('tbody tr').length, report.people.length);
  const firstRow = peopleTable.querySelector('tbody tr');
  assert.equal(firstRow.querySelector('td').textContent, report.people[0].name, 'the first printed person is the report’s first row');
  assert.equal(firstRow.querySelectorAll('td')[1].textContent, report.people[0].verdictLabel, 'the printed verdict label is the report’s');

  // The verdict counts printed are the report's counts, and they add to the headcount.
  const verdictTable = tableByCaption('Person verdicts across the horizon');
  assert.ok(verdictTable, 'the verdicts table exists');
  const printedCounts = [...verdictTable.querySelectorAll('tbody tr')]
    .map((row) => Number(row.querySelectorAll('td')[1].textContent));
  assert.equal(printedCounts.reduce((sum, count) => sum + count, 0), report.board.peopleN,
    'the six printed verdict counts add to the printed headcount');
  assert.deepEqual(printedCounts, report.verdictDefs.map((def) => report.board.verdicts[def.key]),
    'every printed verdict count is the computed count');

  // A withheld total is printed as withheld with ITS reason — never a zero.
  const attributedStat = [...node.querySelectorAll('.stat')]
    .find((el) => el.querySelector('.stat-label')?.textContent === 'Attributed share-days');
  assert.ok(attributedStat, 'the attributed share-days stat exists');
  assert.equal(report.board.readingComplete, false, 'this fixture has undeclared person-days');
  assert.equal(attributedStat.querySelector('.stat-value').textContent, 'withheld');
  assert.equal(attributedStat.querySelector('.stat-hint').textContent, report.board.withheldReason,
    'the printed reason is the computed reason');

  // Every printed person row is a report row — nothing rendered that the
  // action did not return (and the operator view's scope is the workspace, so
  // every fixture person is legitimately listed).
  const printedNames = [...peopleTable.querySelectorAll('tbody tr')].map((row) => row.querySelector('td').textContent);
  assert.deepEqual(printedNames, report.people.map((row) => row.name), 'the printed people are exactly the report rows, in order');

  // A render mutates no stored byte.
  assert.equal(JSON.stringify(store.state), before, 'display == stored: reading and rendering change nothing');
  assert.deepEqual(errors, [], 'no jsdom errors during render');
});

test('the #/matrix?panel=horizon tab dispatches to the horizon panel', () => {
  const dom = bootDocument();
  const errors = [];
  dom.window.addEventListener('error', (event) => errors.push(String(event.message)));

  const state = fixture();
  const node = renderMatrix({
    api: {
      matrixReport: () => ({ ok: true, report: buildMatrixReport(state, { now: NOW, settings: state.settings }) }),
      matrixHorizonReport: () => ({ ok: true, report: buildLineHorizon(state, { now: NOW }) }),
    },
    query: new URLSearchParams('panel=horizon'),
    navigate() {},
    refresh() {},
  });
  dom.window.document.body.append(node);
  const text = node.textContent;

  assert.match(text, /Matrix Forward Allocation Horizon/, 'the horizon panel body is on the page, not the desk default');
  assert.equal(text.includes('Reading refused'), false, 'the horizon report was read successfully');
  assert.match(text, /ISO weeks of the horizon/, 'the weeks table rendered through the dispatch');
  assert.match(text, /Person verdicts across the horizon/, 'the verdicts table rendered through the dispatch');
  assert.equal(text.includes('The reconciliation: does the roll-up add up?'), false, 'the desk panel did not render');
  assert.deepEqual(errors, [], 'no jsdom errors through renderMatrix');
});
