/**
 * tests/app/line-period-allocation.test.mjs — the Matrix Line Period-Allocation
 * Ledger (ADR-0158, Schema v129 unchanged, `#/matrix?panel=allocation`,
 * CSV scope #119).
 *
 * One focused pass over what this session built: the time-weighted reading, the
 * refusals that ARE the product (unprovable history, undeclared days, engine
 * refusals, the home line, partial sums), the exact-integer identities, the
 * seat scope, the real-API round trip with display == stored across a real
 * reload, the aggregate-only export and a JSDOM render of the panel.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  buildLinePeriodAllocation,
  defaultAllocationPeriod,
  linePeriodAllocationBriefText,
  linePeriodAllocationCsvRows,
  resolveAllocationWindow,
  shareOnDay,
  shareTimelineFor,
} from '../../app/core/domain/linePeriodAllocation.js';
import {
  LINE_PERIOD_ALLOCATION_CSV_COLUMNS,
  LINE_PERIOD_ALLOCATION_STATES,
} from '../../app/core/domain/linePeriodAllocationRegistry.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { renderMatrix } from '../../app/views/matrix.js';
import { exportWorkspaceCsv, CSV_EXPORTS } from '../../app/core/csv.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const Q3_FROM = '2026-07-01';
const Q3_TO = '2026-09-30';
const Q3_DAYS = 92;

function line(id, personId, managerId, extra = {}) {
  return {
    id, personId, managerId, kind: 'project', shareH: 20, rights: [],
    fromISO: '2026-01-01', toISO: null, status: 'active',
    declaredAt: '2026-01-01T00:00:00.000Z', history: [], ...extra,
  };
}

function fixture() {
  const state = createEmptyState(NOW.toISOString());
  state.people = [
    { id: 'home', name: 'Home Manager', level: 'director', managerId: null, status: 'active' },
    { id: 'project', name: 'Project Manager', level: 'manager', managerId: null, status: 'active' },
    { id: 'product', name: 'Product Manager', level: 'manager', managerId: null, status: 'active' },
    { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active' },
    { id: 'kim', name: 'Kim', level: 'ic', managerId: 'home', status: 'active' },
    { id: 'leo', name: 'Leo', level: 'ic', managerId: 'home', status: 'active' },
  ];
  state.reportingLines = [
    line('l-sam-project', 'sam', 'project', { shareH: 40 }),
    line('l-kim-project', 'kim', 'project', { shareH: 25, toISO: '2026-08-31', status: 'ended' }),
    line('l-leo-project', 'leo', 'project', { shareH: 10 }),
  ];
  return normalizeState(state).state;
}

const read = (state, { from = Q3_FROM, to = Q3_TO } = {}) => buildLinePeriodAllocation(state, {
  from, to, now: NOW, settings: state.settings,
});

const personOf = (report, id) => report.persons.find((p) => p.personId === id);
const rowOf = (report, personId, declarationId) => personOf(report, personId)?.lines.find((l) => l.declarationId === declarationId);

function openApi(state, now = () => NOW) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
  const store = createStore({ storage, now });
  store.load();
  return { store, api: createApi(store, { now }), data };
}

/* ------------------------------------------------------------- the window */

test('the default period is the last completed calendar quarter, named as the default', () => {
  assert.deepEqual(defaultAllocationPeriod(NOW), { from: Q3_FROM, to: Q3_TO, label: 'the last completed calendar quarter' });
  assert.deepEqual(defaultAllocationPeriod(new Date('2026-01-15T12:00:00Z')), { from: '2025-10-01', to: '2025-12-31', label: 'the last completed calendar quarter' });
  const report = buildLinePeriodAllocation(fixture(), { now: NOW });
  assert.equal(report.window.source, 'default');
  assert.equal(report.window.from, Q3_FROM);
  assert.equal(report.window.to, Q3_TO);
  assert.equal(report.window.days, Q3_DAYS);
  assert.equal(report.window.valid, true);
});

test('a named period is validated: reversed, unreadable and out-of-bounds windows are refused, never clamped or swapped', () => {
  const reversed = resolveAllocationWindow({ from: '2026-09-30', to: '2026-07-01', now: NOW, source: 'query' });
  assert.equal(reversed.valid, false);
  assert.match(reversed.refuseReason, /refused rather than swapped/);
  const huge = resolveAllocationWindow({ from: '2024-01-01', to: '2026-09-30', now: NOW, source: 'query' });
  assert.equal(huge.valid, false);
  assert.match(huge.refuseReason, /1–731 days/);
  const garbage = resolveAllocationWindow({ from: 'last quarter', to: null, now: NOW, source: 'query' });
  assert.equal(garbage.valid, false);
  assert.match(garbage.refuseReason, /not two readable YYYY-MM-DD days/);

  // The refusal flows through the whole report: nothing is weighed, and the
  // board says why instead of printing zeros as though the period were empty.
  const report = read(fixture(), { from: '2026-09-30', to: '2026-07-01' });
  assert.equal(report.window.valid, false);
  assert.equal(report.persons.length, 0);
  assert.equal(report.board.shareDaysRefused, true);
  assert.equal(report.board.shareDaysRefusedReason, report.window.refuseReason);
  assert.equal(report.board.shareDaysH, null);
});

/* ------------------------------------------------------- the weighted read */

test('a steady declared share is charged across the whole overlap in exact integer share-days', () => {
  const report = read(fixture());
  const row = rowOf(report, 'sam', 'l-sam-project');
  assert.equal(row.state, LINE_PERIOD_ALLOCATION_STATES.computed);
  assert.equal(row.shareDaysH, 40 * Q3_DAYS, '40 hundredths × 92 whole days, as an exact integer');
  assert.equal(row.daysInWindow, Q3_DAYS);
  assert.equal(row.averageArithmetic, '3680 share-days ÷ 92 day(s)');
  assert.equal(row.retunesInWindowN, 0);
  assert.equal(row.segments.length, 1);
  assert.deepEqual(row.segments[0], { fromDay: Q3_FROM, toDay: Q3_TO, days: Q3_DAYS, shareH: 40 });
  const sam = personOf(report, 'sam');
  assert.equal(sam.verdict, 'steady');
  assert.equal(sam.totals.shareDaysH, 3680);
  assert.equal(sam.totals.reconciles, true);
  assert.equal(report.board.shareDaysH, 3680 + 25 * 62 + 10 * Q3_DAYS, 'kim ended 31 Aug (62 days), leo runs the window');
  assert.equal(report.board.countsReconcile, true);
  assert.equal(report.board.totalsReconcile, true);
});

test('a mid-period retune is time-weighted at its boundary: today\'s single number demonstrably misprices the period', () => {
  const state = fixture();
  state.reportingLines.push(line('l-sam-product', 'sam', 'product', {
    kind: 'product', shareH: 15,
    history: [{ at: '2026-08-15T10:00:00.000Z', shareH: 30, rights: [] }],
  }));
  const report = read(normalizeState(state).state);
  const row = rowOf(report, 'sam', 'l-sam-product');
  assert.equal(row.state, LINE_PERIOD_ALLOCATION_STATES.computed);
  // Jul 1 – Aug 14 = 45 days at the replaced share 30; Aug 15 – Sep 30 = 47 at 15.
  assert.equal(row.shareDaysH, 30 * 45 + 15 * 47);
  assert.equal(row.retunesInWindowN, 1);
  assert.equal(row.firstShareH, 30);
  assert.equal(row.lastShareH, 15);
  assert.equal(row.segments.length, 2);
  assert.deepEqual(row.segments[0], { fromDay: Q3_FROM, toDay: '2026-08-14', days: 45, shareH: 30 });
  assert.deepEqual(row.segments[1], { fromDay: '2026-08-15', toDay: Q3_TO, days: 47, shareH: 15 });
  const sam = personOf(report, 'sam');
  assert.equal(sam.verdict, 'retuned-in-period');
  // The point of the module: neither today's number nor the old number prices the period.
  assert.notEqual(row.shareDaysH, 15 * Q3_DAYS);
  assert.notEqual(row.shareDaysH, 30 * Q3_DAYS);
});

test('an ended line is charged for the days it ran, and a line starting mid-period only from its start', () => {
  const state = fixture();
  state.reportingLines.push(line('l-kim-product', 'kim', 'product', { kind: 'product', shareH: 10, fromISO: '2026-09-01', declaredAt: '2026-09-01T00:00:00.000Z' }));
  const report = read(normalizeState(state).state);
  const ended = rowOf(report, 'kim', 'l-kim-project');
  assert.equal(ended.state, LINE_PERIOD_ALLOCATION_STATES.computed, 'a line the graph unwired because it ended is still part of the period\'s history');
  assert.equal(ended.overlap.to, '2026-08-31');
  assert.equal(ended.shareDaysH, 25 * 62);
  const started = rowOf(report, 'kim', 'l-kim-product');
  assert.equal(started.overlap.from, '2026-09-01');
  assert.equal(started.shareDaysH, 10 * 30);
  const kim = personOf(report, 'kim');
  assert.equal(kim.totals.shareDaysH, 25 * 62 + 10 * 30);
  assert.equal(kim.totals.reconciles, true);
  assert.equal(kim.totals.averageArithmetic, '1850 share-days ÷ 92 period day(s)');
});

test('a line whose window does not touch the period is out-of-window: not a gap, not a zero, and it refuses nothing', () => {
  const state = fixture();
  state.reportingLines.push(line('l-sam-old', 'sam', 'product', { kind: 'product', shareH: 50, fromISO: '2025-01-01', toISO: '2026-06-30', status: 'ended' }));
  const report = read(normalizeState(state).state);
  const old = rowOf(report, 'sam', 'l-sam-old');
  assert.equal(old.state, LINE_PERIOD_ALLOCATION_STATES.outOfWindow);
  assert.equal(old.inWindow, false);
  assert.equal(old.refusesTotal, false);
  assert.match(old.reason, /before this period began/);
  const sam = personOf(report, 'sam');
  assert.equal(sam.totals.refused, false);
  assert.equal(sam.totals.shareDaysH, 3680, 'the out-of-window line contributes nothing and blocks nothing');
  assert.equal(report.board.outOfWindowN, 1);
});

/* ----------------------------------------------------------- the refusals */

test('a period reaching behind the retained history cap is REFUSED, not projected backwards; a period after the coverage start computes', () => {
  const state = fixture();
  state.reportingLines = state.reportingLines.map((l) => (l.id === 'l-sam-project' ? {
    ...l,
    shareH: 10,
    history: [
      { at: '2026-08-01T09:00:00.000Z', shareH: 45, rights: [] },
      { at: '2026-08-15T09:00:00.000Z', shareH: 44, rights: [] },
      { at: '2026-09-01T09:00:00.000Z', shareH: 43, rights: [] },
      { at: '2026-09-15T09:00:00.000Z', shareH: 42, rights: [] },
      { at: '2026-10-01T09:00:00.000Z', shareH: 41, rights: [] },
    ],
  } : l));
  const normalized = normalizeState(state).state;
  const capped = normalized.reportingLines.find((l) => l.id === 'l-sam-project');
  assert.equal(capped.history.length, 5, 'the fixture sits exactly at the declared cap');

  const report = read(normalized);
  const row = rowOf(report, 'sam', 'l-sam-project');
  assert.equal(row.state, LINE_PERIOD_ALLOCATION_STATES.historyGap);
  assert.equal(row.shareDaysH, null, 'no weighted figure is invented for an unprovable window');
  assert.equal(row.historyAtCap, true);
  assert.equal(row.coverageFrom, '2026-08-01');
  assert.match(row.reason, /can prove coverage only from 2026-08-01 forward/);
  assert.match(row.reason, /31 day\(s\) cannot be proved/);
  const sam = personOf(report, 'sam');
  assert.equal(sam.verdict, 'period-refused');
  assert.equal(sam.totals.refused, true);
  assert.equal(report.board.shareDaysRefused, true, 'one refused person refuses the workspace total');
  assert.match(report.board.shareDaysRefusedReason, /could not be priced/);

  // A period entirely inside the provable coverage computes — the refusal is
  // about the RECORD, not about the line.
  const later = read(normalized, { from: '2026-08-01', to: '2026-09-30' });
  const laterRow = rowOf(later, 'sam', 'l-sam-project');
  assert.equal(laterRow.state, LINE_PERIOD_ALLOCATION_STATES.computed);
  // The retune day closes at the NEW share: Aug 1–14 at 44, Aug 15–31 at 43,
  // Sep 1–14 at 42, Sep 15–30 at 41.
  assert.equal(laterRow.shareDaysH, 44 * 14 + 43 * 17 + 42 * 14 + 41 * 16);

  // BELOW the cap the retained entries are ALL of them, so coverage is proven
  // back to the declaration's own first day: no refusal, and the days before
  // the oldest retained change are charged at the share that change replaced.
  const under = { ...capped, history: capped.history.slice(1) };
  const underState = normalizeState({ ...normalized, reportingLines: normalized.reportingLines.map((l) => (l.id === 'l-sam-project' ? under : l)) }).state;
  const timeline = shareTimelineFor(underState.reportingLines.find((l) => l.id === 'l-sam-project'));
  assert.equal(timeline.atCap, false);
  assert.equal(timeline.coverageFrom, '2026-01-01');
  assert.equal(shareOnDay(timeline, '2026-07-15'), 44, 'before the oldest retained change stands the share it replaced');
  const underReport = read(underState);
  assert.equal(rowOf(underReport, 'sam', 'l-sam-project').state, LINE_PERIOD_ALLOCATION_STATES.computed);
});

test('a day with no declared share refuses the whole row: never a partial sum, never a zero', () => {
  const state = fixture();
  state.reportingLines = state.reportingLines.map((l) => (l.id === 'l-sam-project' ? {
    ...l,
    shareH: 20,
    history: [{ at: '2026-08-01T09:00:00.000Z', shareH: null, rights: [] }],
  } : l));
  const report = read(normalizeState(state).state);
  const row = rowOf(report, 'sam', 'l-sam-project');
  assert.equal(row.state, LINE_PERIOD_ALLOCATION_STATES.undeclared);
  assert.equal(row.shareDaysH, null);
  assert.equal(row.undeclaredDaysN, 31, 'Jul 1 – Jul 31 carry no declared share');
  assert.match(row.reason, /31 of 92 day\(s\) inside the period carry no declared share/);
  assert.match(row.reason, /partial sum would understate/);
  const sam = personOf(report, 'sam');
  assert.equal(sam.verdict, 'period-refused');
  assert.equal(sam.totals.refused, true);
  assert.equal(report.board.shareDaysH, null);
  assert.equal(report.board.refusedUndeclaredN, 1);
});

test('a line the matrix engine refused is never weighted; the engine\'s own reason is printed', () => {
  const state = fixture();
  state.reportingLines.push(line('l-sam-ghost', 'sam', 'ghost', { shareH: 30, kind: 'product' }));
  const report = read(normalizeState(state).state);
  const row = rowOf(report, 'sam', 'l-sam-ghost');
  assert.equal(row.state, LINE_PERIOD_ALLOCATION_STATES.defect);
  assert.equal(row.refusesTotal, true);
  assert.equal(row.shareDaysH, null);
  assert.match(row.reason, /missing-manager/);
  assert.match(row.reason, /A refused line is never weighted/);
  assert.equal(personOf(report, 'sam').verdict, 'period-refused');
  assert.equal(report.board.refusedDefectN, 1);

  // A row naming no roster person cannot be attributed to anybody: it is
  // counted as an engine refusal and never becomes a person row.
  const ghostPerson = fixture();
  ghostPerson.reportingLines.push(line('l-nobody', 'stranger', 'project', { shareH: 30 }));
  const gReport = read(normalizeState(ghostPerson).state);
  assert.equal(gReport.board.engineRefusalsN, 1);
  assert.equal(gReport.engineRefusals[0].defect, 'missing-person');
  assert.equal(gReport.persons.some((p) => p.personId === 'stranger'), false);
});

test('the home line\'s own allocation is counted out of scope and never weighed into a past period', () => {
  const state = fixture();
  state.reportingLines.push(line('l-sam-home', 'sam', 'home', { kind: 'functional', shareH: 60 }));
  const report = read(normalizeState(state).state);
  const row = rowOf(report, 'sam', 'l-sam-home');
  assert.equal(row.state, LINE_PERIOD_ALLOCATION_STATES.homeScope);
  assert.equal(row.refusesTotal, false);
  assert.equal(row.shareDaysH, null);
  assert.match(row.reason, /ADR-0149/);
  const sam = personOf(report, 'sam');
  assert.equal(sam.counts.homeRows, 1);
  assert.equal(sam.totals.shareDaysH, 3680, 'the home allocation contributes no share-day');
  assert.equal(report.board.homeRowsN, 1);

  // A person whose ONLY declaration is a home allocation is not in this
  // ledger's population at all — single-chain people are not printed here.
  const only = fixture();
  only.people.push({ id: 'ana', name: 'Ana', level: 'ic', managerId: 'home', status: 'active' });
  only.reportingLines.push(line('l-ana-home', 'ana', 'home', { kind: 'functional', shareH: 100 }));
  only.reportingLines.push(line('l-sam-home', 'sam', 'home', { kind: 'functional', shareH: 60 }));
  const onlyReport = read(normalizeState(only).state);
  assert.equal(personOf(onlyReport, 'ana'), undefined, 'ana holds no additional line, so her home allocation is another module\'s business');
  assert.equal(onlyReport.persons.some((p) => p.lines.some((l) => l.declarationId === 'l-ana-home')), false);
  assert.equal(personOf(onlyReport, 'sam').counts.homeRows, 1, 'sam IS in the population, so her home row is counted out of scope');
});

test('over-commitment is a per-day floor, claimed only from a complete sweep and refused from a partial one', () => {
  const state = fixture();
  state.reportingLines = state.reportingLines.filter((l) => l.personId === 'sam');
  state.reportingLines.push(line('l-sam-product', 'sam', 'product', { kind: 'product', shareH: 70 }));
  state.reportingLines.find((l) => l.id === 'l-sam-project').shareH = 60;
  const report = read(normalizeState(state).state);
  const sam = personOf(report, 'sam');
  assert.equal(sam.verdict, 'over-committed');
  assert.equal(sam.totals.overDaysN, Q3_DAYS);
  assert.equal(sam.totals.worstDayShareH, 130);
  assert.equal(report.board.personsOverCommittedN, 1);
  assert.equal(report.board.overDaysN, Q3_DAYS);

  // Make one line unpriceable: the day claim is refused rather than narrowed,
  // because a partial sweep could hide an over-committed day.
  const partial = normalizeState(state).state;
  partial.reportingLines.find((l) => l.id === 'l-sam-product').shareH = null;
  const pReport = read(normalizeState(partial).state);
  const pSam = personOf(pReport, 'sam');
  assert.equal(pSam.verdict, 'period-refused');
  assert.equal(pSam.totals.overDaysN, 0);
  assert.equal(pSam.totals.overCommitmentRefused, true);
  assert.match(pSam.totals.overCommitmentRefusedReason, /partial sweep could hide/);
});

/* ----------------------------------------------- shapes of the record itself */

test('two declared kinds to one manager: one relationship in the graph, two charges on the person, both weighed', () => {
  const state = fixture();
  state.reportingLines.push(line('l-sam-xfunc', 'sam', 'project', { kind: 'cross-functional', shareH: 30 }));
  const report = read(normalizeState(state).state);
  const sam = personOf(report, 'sam');
  const a = rowOf(report, 'sam', 'l-sam-project');
  const b = rowOf(report, 'sam', 'l-sam-xfunc');
  assert.equal(a.state, LINE_PERIOD_ALLOCATION_STATES.computed);
  assert.equal(b.state, LINE_PERIOD_ALLOCATION_STATES.computed);
  assert.equal(a.relationshipMerged !== b.relationshipMerged, true, 'exactly one row carries the merge flag: the graph wired one edge');
  assert.equal(sam.totals.shareDaysH, (40 + 30) * Q3_DAYS, 'both declarations charge the person; neither is dropped as a duplicate');
});

test('same-day retunes close the day at the last value, and the row says so', () => {
  const state = fixture();
  state.reportingLines = state.reportingLines.map((l) => (l.id === 'l-sam-project' ? {
    ...l,
    shareH: 20,
    history: [
      { at: '2026-08-01T09:00:00.000Z', shareH: 40, rights: [] },
      { at: '2026-08-01T17:00:00.000Z', shareH: 30, rights: [] },
    ],
  } : l));
  const report = read(normalizeState(state).state);
  const row = rowOf(report, 'sam', 'l-sam-project');
  assert.equal(row.state, LINE_PERIOD_ALLOCATION_STATES.computed);
  assert.equal(row.sameDayRetunesN, 1);
  assert.match(row.reason, /2 change\(s\) inside the period/);
  // Jul 1–31 at 40 (31 days); Aug 1 closes at the last of the day's changes
  // and the current share 20 stands from there: Aug 1–Sep 30 = 61 days.
  assert.equal(row.shareDaysH, 40 * 31 + 20 * 61);
});

test('out-of-order stored history is read in timestamp order and the row prints that it reordered', () => {
  const state = fixture();
  state.reportingLines = state.reportingLines.map((l) => (l.id === 'l-sam-project' ? {
    ...l,
    shareH: 15,
    history: [
      { at: '2026-08-15T09:00:00.000Z', shareH: 30, rights: [] },
      { at: '2026-08-01T09:00:00.000Z', shareH: 40, rights: [] },
    ],
  } : l));
  const report = read(normalizeState(state).state);
  const row = rowOf(report, 'sam', 'l-sam-project');
  assert.equal(row.historyUnsorted, true);
  assert.equal(row.state, LINE_PERIOD_ALLOCATION_STATES.computed);
  // Jul at 40 (31d), Aug 1–14 at 30 (14d), Aug 15–Sep 30 at 15 (47d).
  assert.equal(row.shareDaysH, 40 * 31 + 30 * 14 + 15 * 47);
  assert.equal(row.segments.length, 3);
});

/* ------------------------------------------------------------------- seats */

test('a scoped seat counts and withholds the people it cannot reach; the operator sees all', () => {
  const state = fixture();
  state.reportingLines.push(line('l-sam-product', 'sam', 'product', { kind: 'product', shareH: 30 }));
  const normalized = normalizeState(state).state;

  const operator = read(normalized);
  assert.equal(operator.seat.fullAccess, true);
  assert.equal(operator.board.withheldN, 0);
  assert.ok(personOf(operator, 'leo'));

  const productSeat = read({ ...normalized, settings: { ...normalized.settings, activeSeatId: 'product' } });
  assert.equal(productSeat.seat.fullAccess, false);
  assert.equal(personOf(productSeat, 'leo'), undefined, 'leo holds only a project line and sits outside the product seat');
  assert.equal(personOf(productSeat, 'kim'), undefined, 'kim holds only a project line (ended, so not even a live line scope)');
  assert.equal(productSeat.board.withheldN, 2, 'withheld people are COUNTED, never silently dropped');
  assert.ok(personOf(productSeat, 'sam'), 'sam is visible through the product line scope');
});

/* ------------------------------------------------- single chain and purity */

test('a single-chain workspace is inert end to end, and every read mutates nothing', () => {
  const state = createEmptyState(NOW.toISOString());
  state.people = [
    { id: 'boss', name: 'Boss', level: 'director', managerId: null, status: 'active' },
    { id: 'ic', name: 'IC', level: 'ic', managerId: 'boss', status: 'active' },
  ];
  const normalized = normalizeState(state).state;
  const before = JSON.stringify(normalized);
  const report = buildLinePeriodAllocation(normalized, { now: NOW });
  assert.equal(report.isMatrix, false);
  assert.equal(report.persons.length, 0);
  assert.equal(report.board.linesN, 0);
  assert.equal(report.board.countsReconcile, true);
  assert.equal(report.board.totalsReconcile, true);
  assert.match(report.singleChainNote, /second share to weigh/);
  assert.equal(JSON.stringify(normalized), before, 'the read mutated nothing');
  assert.equal(SCHEMA_VERSION, 133);

  const rows = linePeriodAllocationCsvRows(report);
  assert.equal(rows.length, 1, 'the summary row says the workspace is empty; no kind rows are invented');
  assert.equal(rows[0].row_kind, 'workspace');
});

/* ------------------------------------------------- the real round trip */

test('real-API round trip: declare, retune, weigh — and display == stored across a real reload', () => {
  let clock = new Date('2026-07-01T09:00:00.000Z');
  const base = createEmptyState(clock.toISOString());
  base.people = [
    { id: 'home', name: 'Home Manager', level: 'director', managerId: null, status: 'active' },
    { id: 'project', name: 'Project Manager', level: 'manager', managerId: null, status: 'active' },
    { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active' },
  ];
  const first = openApi(normalizeState(base).state, () => clock);

  const declared = first.api.matrixDeclareLine({ personId: 'sam', managerId: 'project', kind: 'project', shareH: 40, fromISO: '2026-07-01' });
  assert.equal(declared.ok, true, declared.error || '');
  clock = new Date('2026-08-15T10:00:00.000Z');
  const retuned = first.api.matrixRetuneLine({ id: declared.id, shareH: 15 });
  assert.equal(retuned.ok, true, retuned.error || '');

  const report = buildLinePeriodAllocation(first.store.state, { from: Q3_FROM, to: Q3_TO, now: NOW });
  const row = rowOf(report, 'sam', declared.id);
  assert.equal(row.state, LINE_PERIOD_ALLOCATION_STATES.computed);
  assert.equal(row.shareDaysH, 40 * 45 + 15 * 47, 'the real retune act lands exactly where the day sweep reads it');
  assert.equal(row.retunesInWindowN, 1);

  // The stored record is what the reading claims: one bounded history entry
  // holding the REPLACED share, and the current share on the row.
  const storedBefore = first.data.get(STORAGE_KEY);
  const persistedRow = JSON.parse(storedBefore).reportingLines.find((l) => l.id === declared.id);
  assert.equal(persistedRow.shareH, 15);
  assert.equal(persistedRow.history.length, 1);
  assert.equal(persistedRow.history[0].shareH, 40);
  assert.equal(row.firstShareH, persistedRow.history[0].shareH, 'display == stored: the first day reads the replaced share');
  assert.equal(row.lastShareH, persistedRow.shareH, 'display == stored: the last day reads the stored share');

  // A real reload through a fresh store: the rebuilt report is the same report,
  // the read mutated no byte, and no revision moved.
  const second = openApi(JSON.parse(storedBefore), () => NOW);
  const revBefore = second.store.state.meta.revision;
  const reloaded = buildLinePeriodAllocation(second.store.state, { from: Q3_FROM, to: Q3_TO, now: NOW, settings: second.store.state.settings });
  assert.deepEqual(reloaded.board, report.board, 'display == computed from the stored blob after a real reload');
  assert.deepEqual(
    reloaded.persons.map((p) => [p.personId, p.verdict, p.totals.shareDaysH]),
    report.persons.map((p) => [p.personId, p.verdict, p.totals.shareDaysH]),
  );
  assert.equal(second.data.get(STORAGE_KEY), storedBefore, 'the read wrote nothing');
  assert.equal(second.store.state.meta.revision, revBefore, 'the read bumped no revision');
});

/* ------------------------------------------------------------------ export */

test('the export is aggregate-only, reconciles to the board, and a refused total exports BLANK with its reason', () => {
  const state = fixture();
  const report = read(state);
  const rows = linePeriodAllocationCsvRows(report);
  assert.deepEqual(Object.keys(rows[0]), [...LINE_PERIOD_ALLOCATION_CSV_COLUMNS]);
  const summary = rows[0];
  assert.equal(summary.row_kind, 'workspace');
  assert.equal(summary.period_from, Q3_FROM);
  assert.equal(summary.period_to, Q3_TO);
  assert.equal(Number(summary.period_days), Q3_DAYS);
  assert.equal(summary.window_valid, 'true');
  assert.equal(Number(summary.lines_n), report.board.linesN);
  assert.equal(Number(summary.computed_n), report.board.computedN);
  assert.equal(Number(summary.share_days_h), report.board.shareDaysH);
  assert.equal(Number(summary.over_days_n), report.board.overDaysN);
  assert.equal(summary.share_days_refused, 'false');
  assert.equal(summary.counts_reconcile, 'true');
  const kinds = rows.filter((r) => r.row_kind === 'line-kind');
  assert.equal(kinds.length, 1, 'the fixture declares one kind');
  assert.equal(kinds[0].line_kind, 'project');
  assert.equal(Number(kinds[0].computed_n), report.board.computedN);
  assert.equal(Number(kinds[0].share_days_h), report.board.shareDaysH);

  // Identity audit: no name, no id, no note text, no free text in any cell.
  const state2 = fixture();
  state2.reportingLines[0].note = 'The migration project, agreed with Priya.';
  const flat = JSON.stringify(linePeriodAllocationCsvRows(read(normalizeState(state2).state)));
  for (const banned of ['Sam', 'Kim', 'Leo', 'Project Manager', 'Product Manager', 'Home Manager', 'l-sam-project', 'migration', 'Priya', 'sam', 'kim']) {
    assert.equal(flat.includes(banned), false, `the export must not carry ${banned}`);
  }

  // A refused workspace total is BLANK with the reason in its own column, and
  // a refused kind total is BLANK too — never a zero, never a partial sum.
  const refusedState = fixture();
  refusedState.reportingLines.find((l) => l.id === 'l-sam-project').shareH = null;
  const refusedRows = linePeriodAllocationCsvRows(read(normalizeState(refusedState).state));
  assert.equal(refusedRows[0].share_days_h, '');
  assert.equal(refusedRows[0].share_days_refused, 'true');
  assert.ok(refusedRows[0].share_days_refused_reason.length > 0);
  const refusedKind = refusedRows.find((r) => r.row_kind === 'line-kind');
  assert.equal(refusedKind.share_days_h, '');
  assert.equal(refusedKind.share_days_refused, 'true');

  // The registered scope builds the same read model the panel renders.
  const exported = exportWorkspaceCsv(state, 'line-period-allocation', { now: NOW });
  assert.equal(exported.ok, true, exported.error || '');
  assert.equal(CSV_EXPORTS.filter((e) => e.key === 'line-period-allocation').length, 1);
});

test('the brief names nobody and prints the total, the identity claim and every refusal count', () => {
  const state = fixture();
  const text = linePeriodAllocationBriefText(read(state));
  assert.match(text, /2026-07-01 to 2026-09-30/);
  assert.match(text, /share-days in total/);
  assert.match(text, /verified/);
  assert.equal(text.includes('Sam'), false);
  assert.equal(text.includes('Project Manager'), false);
  assert.equal(text.includes('l-sam-project'), false);
});

/* ------------------------------------------------------------------ surface */

test('the panel is registered, renders the stored figures, and rendering mutates nothing', () => {
  assert.ok(MATRIX_PANELS.some((p) => p.key === 'allocation'), 'allocation is a matrix panel');

  const state = fixture();
  state.reportingLines.push(line('l-sam-product', 'sam', 'product', {
    kind: 'product', shareH: 15,
    history: [{ at: '2026-08-15T10:00:00.000Z', shareH: 30, rights: [] }],
  }));
  const normalized = normalizeState(state).state;
  const { store, api, data } = openApi(normalized);
  const report = buildLinePeriodAllocation(store.state, { from: Q3_FROM, to: Q3_TO, now: NOW, settings: store.state.settings });
  const storedBefore = data.get(STORAGE_KEY);

  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map((k) => [k, globalThis[k]]));
  try {
    for (const k of globals) globalThis[k] = k === 'document' ? dom.window.document : k === 'window' ? dom.window : dom.window[k];
    const node = renderMatrix({
      api, state: store.state,
      query: new URLSearchParams(`panel=allocation&from=${Q3_FROM}&to=${Q3_TO}`),
      navigate() {}, refresh() {},
    });
    assert.equal(data.get(STORAGE_KEY), storedBefore, 'render mutates nothing');
    const text = node.textContent;
    const table = [...node.querySelectorAll('table')].find((t) => t.querySelector('caption')?.textContent === 'Time-weighted period allocation per declared line');
    assert.ok(table, 'the ledger table renders');
    const rows = [...table.querySelectorAll('tbody tr')];
    const expected = report.persons.flatMap((p) => p.lines.map((l) => ({ ...l, personName: p.personName })));
    assert.equal(rows.length, expected.length);
    for (const [i, tr] of rows.entries()) {
      const model = expected[i];
      const cells = [...tr.querySelectorAll('td')].map((c) => c.textContent);
      assert.ok(cells[0].startsWith(model.personName), `row ${i}: the printed person is the model's person`);
      const weighted = model.shareDaysH === null ? 'refused' : `${model.shareDaysH} share-days`;
      assert.ok(cells[3].includes(weighted), `row ${i}: printed weight == computed weight (${weighted})`);
      assert.ok(cells[4].startsWith(model.stateLabel), `row ${i}: printed state == derived state`);
    }
    assert.ok(text.includes(`${report.board.shareDaysH} share-days over ${Q3_DAYS} period day(s)`), 'the board prints the exact integer total and its denominator');
    assert.match(text, /A share that changed mid-period/, 'the retune banner prints');
    assert.match(text, /The period being priced/, 'the named window prints');

    // A refused period renders the refusal instead of figures.
    const refusedNode = renderMatrix({
      api, state: store.state,
      query: new URLSearchParams('panel=allocation&from=2026-09-30&to=2026-07-01'),
      navigate() {}, refresh() {},
    });
    assert.match(refusedNode.textContent, /The period itself is refused/);
    assert.equal(data.get(STORAGE_KEY), storedBefore, 'the refused render mutates nothing either');
  } finally {
    for (const [k, v] of previous) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
    dom.window.close();
  }
});
