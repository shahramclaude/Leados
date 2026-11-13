/**
 * tests/app/matrix-meeting-load.test.mjs — the Matrix Meeting-Load & Coordination
 * Tax Ledger (ADR-0169, Schema v135 unchanged, `#/matrix?panel=meeting-load`,
 * CSV scope #124).
 *
 * One focused pass over what this session built: the exact minute arithmetic,
 * the three figures that must never be collapsed (charged / printable /
 * refused), the refusals that ARE the product (no duration, unknown attendee),
 * the line-placement classes including the two-line refusal, the rate floors,
 * the aggregate-only export, the sitting-capture path the ledger depends on, and
 * a JSDOM render proving the displayed figure is the computed figure.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  buildMatrixMeetingLoad,
  matrixMeetingLoadBriefText,
  matrixMeetingLoadCsvRows,
  minutesToHours,
  permilleOf,
} from '../../app/core/domain/matrixMeetingLoad.js';
import {
  MATRIX_MEETING_LOAD_CSV_COLUMNS,
  MATRIX_MEETING_LOAD_BOUNDS,
} from '../../app/core/domain/matrixMeetingLoadRegistry.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { renderMatrixMeetingLoadPanel } from '../../app/views/matrixMeetingLoadPanel.js';
import { exportWorkspaceCsv, CSV_EXPORTS, parseCsv } from '../../app/core/csv.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const Q3_FROM = '2026-07-01';
const Q3_TO = '2026-09-30';

const lineRow = (id, personId, managerId, shareH, kind = 'project') => ({
  id, personId, managerId, kind, shareH, rights: [],
  fromISO: '2026-01-01', toISO: null, status: 'active',
  declaredAt: '2026-01-01T00:00:00.000Z', history: [],
});

const session = (id, forumId, heldOn, status, minutes, attendeeIds) => ({
  id, forumId, heldOn, status, minutes, attendeeIds,
  decisionCapacity: 5, plannedN: 1, closedN: 1, closedClassKeys: [],
  createdAt: '2026-07-01T00:00:00.000Z',
});

function baseState() {
  const state = createEmptyState(NOW.toISOString());
  state.people = [
    { id: 'home', name: 'Home Director', level: 'director', managerId: null, status: 'active' },
    { id: 'project', name: 'Project Manager', level: 'manager', managerId: 'home', status: 'active' },
    { id: 'product', name: 'Product Manager', level: 'manager', managerId: 'home', status: 'active' },
    { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active' },
    { id: 'leo', name: 'Leo', level: 'ic', managerId: 'home', status: 'active' },
    { id: 'ava', name: 'Ava', level: 'ic', managerId: 'home', status: 'active' },
  ];
  state.reportingLines = [
    lineRow('l-sam-project', 'sam', 'project', 40),
    lineRow('l-sam-product', 'sam', 'product', 60, 'product'),
    lineRow('l-leo-project', 'leo', 'project', 30),
    lineRow('l-leo-product', 'leo', 'product', 70, 'product'),
  ];
  state.cadenceForums = [
    { id: 'f-lead', title: 'Leadership sync', kind: 'leadership-sync', cadence: 'weekly', status: 'active', chairSeatId: 'home', attending: ['home', 'sam', 'leo'] },
    { id: 'f-proj', title: 'Project alpha review', kind: 'operating-review', cadence: 'weekly', status: 'active', chairSeatId: 'project', attending: ['project', 'sam', 'leo'] },
    { id: 'f-prod', title: 'Product council', kind: 'business-review', cadence: 'fortnightly', status: 'active', chairSeatId: 'product', attending: ['product', 'sam'] },
    { id: 'f-old', title: 'Retired sync', kind: 'leadership-sync', cadence: 'monthly', status: 'retired', chairSeatId: 'home', attending: ['home', 'ava'] },
  ];
  state.cadenceSessions = [
    session('s1', 'f-lead', '2026-07-06', 'held', 60, ['home', 'sam', 'leo']),
    session('s2', 'f-proj', '2026-07-07', 'held', 45, ['project', 'sam', 'leo']),
    session('s3', 'f-prod', '2026-07-08', 'held', 30, ['product', 'sam']),
    session('s4', 'f-lead', '2026-08-03', 'held', 60, ['home', 'sam', 'leo']),
    session('s5', 'f-proj', '2026-08-04', 'held', 45, ['project', 'sam']),
    session('s6', 'f-prod', '2026-09-02', 'held', 30, ['product', 'sam']),
    session('s7', 'f-old', '2026-09-10', 'held', 90, ['home', 'ava']),
    session('s8', 'f-proj', '2026-09-15', 'cancelled', null, ['project', 'sam']),
    session('s11', 'f-proj', '2026-09-20', 'held', 20, ['project', 'ava']),
  ];
  return normalizeState(state).state;
}

/** The same workspace plus the two sittings that REFUSE rather than charge. */
function refusedState() {
  const state = baseState();
  state.cadenceSessions.push(
    session('s9', 'f-proj', '2026-09-16', 'held', null, ['sam']),
    session('s10', 'f-lead', '2026-09-17', 'held', 30, ['leo', 'ghost']),
  );
  return normalizeState(state).state;
}

const read = (state, opts = {}) => buildMatrixMeetingLoad(state, {
  from: Q3_FROM, to: Q3_TO, now: NOW, settings: state.settings, ...opts,
});
const personOf = (report, id) => report.people.find((p) => p.personId === id);

/* ------------------------------------------------------------- the surface */

test('the panel and the export are registered, and the schema is untouched', () => {
  assert.equal(SCHEMA_VERSION, 149, 'meeting-share parity adds no collection');
  assert.ok(MATRIX_PANELS.some((p) => p.key === 'meeting-load'));
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'matrix-meeting-load'));
  assert.equal(MATRIX_MEETING_LOAD_CSV_COLUMNS.length, 41);
});

/* ------------------------------------------------------- exact arithmetic */

test('minutes are exact: the sitting log, the person rows and the export agree to the minute', () => {
  const state = baseState();
  const report = read(state);
  const b = report.board;

  // 180 + 135 + 60 + 180 + 90 + 60 + 180 + 40 = 925 recorded person-minutes.
  assert.equal(b.chargedMinutes, 925);
  assert.equal(b.sessionMinutes, 925);
  assert.equal(b.printableMinutes, 925, 'nothing is refused in this fixture');
  assert.equal(b.refusedKnownMinutes, 0);
  assert.equal(b.attendeeSittingsN, 19);

  // Same-window placements, each class exact.
  assert.equal(b.homeMinutes, 330);
  assert.equal(b.lineMinutes, 195);
  assert.equal(b.otherMinutes, 20);
  assert.equal(b.selfMinutes, 380);
  assert.equal(b.crossLineMinutes, 215, 'line + ambiguous + other');
  assert.equal(b.homeMinutes + b.selfMinutes + b.crossLineMinutes, b.chargedMinutes);

  assert.equal(b.minutesReconcile, true);
  assert.equal(b.figuresComplete, true);
  assert.equal(b.refusedSittingsN, 0);
  assert.equal(b.cancelledN, 1, 'a cancelled sitting is counted and charges nothing');

  // Per person, the printed minutes are the sums of the sittings they attended.
  const sam = personOf(report, 'sam');
  assert.equal(sam.minutes, 270);
  assert.equal(sam.chargedSittingsN, 6);
  assert.equal(sam.placementMinutes.home, 120);
  assert.equal(sam.placementMinutes.line, 150);
  assert.equal(sam.taxPermille, permilleOf(150, 270));
  assert.equal(sam.hours, minutesToHours(270));

  // The span rate is exact and above the declared floors.
  assert.equal(b.spanTaxPermille, permilleOf(215, 925));
  assert.equal(b.spanTaxPermille, 232);
  assert.match(matrixMeetingLoadBriefText(report), /coordination-tax rate is 232 per-mille/);
});

test('line share parity compares the canonical share-day ledger with exact line-chaired minutes and renders those same figures', () => {
  const state = baseState();
  const persisted = JSON.parse(JSON.stringify(state));
  const reloaded = normalizeState(persisted).state;
  const report = read(reloaded);
  const rows = report.lineShareParity.rows.filter((row) => row.personId === 'sam');
  const project = rows.find((row) => row.managerId === 'project');
  const product = rows.find((row) => row.managerId === 'product');
  assert.equal(project.state, 'computed');
  assert.equal(project.declaredPermille, 400);
  assert.equal(project.observedMinutes, 90);
  assert.equal(project.totalMinutes, 270);
  assert.equal(project.observedPermille, 333);
  assert.equal(project.deltaPermille, -67);
  assert.equal(product.declaredPermille, 600);
  assert.equal(product.observedMinutes, 60);
  assert.equal(product.observedPermille, 222);
  assert.equal(report.lineShareParity.board.rowsReconcile, true);
  assert.equal(report.lineShareParity.board.computedN + report.lineShareParity.board.refusedN, report.lineShareParity.board.rowsN);

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/' });
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map((key) => [key, globalThis[key]]));
  const before = JSON.stringify(state);
  try {
    for (const key of globals) globalThis[key] = key === 'document' ? dom.window.document : key === 'window' ? dom.window : dom.window[key];
    const root = renderMatrixMeetingLoadPanel({ state: reloaded, query: new URLSearchParams({ from: Q3_FROM, to: Q3_TO }), navigate() {} }, { now: NOW });
    dom.window.document.body.append(root);
    const text = dom.window.document.body.textContent;
    assert.match(text, /Observed meeting share vs declared line share/);
    assert.match(text, /400 ‰/);
    assert.match(text, /90 \/ 270 min/);
    assert.match(text, /333 ‰/);
    const parityTable = [...root.querySelectorAll('table')].find((table) => table.getAttribute('aria-label') === 'Per-person declared share against recorded meeting share');
    const samProjectRow = [...parityTable.querySelectorAll('tbody tr')].find((row) => row.textContent.startsWith('Sam') && row.textContent.includes('Project Manager'));
    assert.ok(samProjectRow);
    const cells = [...samProjectRow.querySelectorAll('td')].map((cell) => cell.textContent.trim());
    assert.equal(cells[2], `${project.declaredPermille} ‰ (${project.declaredShareDaysH} share-days / ${project.declaredDays} days)`);
    assert.equal(cells[3], `${project.observedMinutes} / ${project.totalMinutes} min`);
    assert.equal(cells[4], `${project.observedPermille} ‰`);
    assert.equal(JSON.stringify(persisted), before, 'reading and rendering do not mutate reloaded stored data');
  } finally {
    for (const key of globals) globalThis[key] = previous.get(key);
  }
});

test('line-share parity refuses incomplete sitting totals and partial-period structure instead of borrowing a figure', () => {
  const missingDuration = read(refusedState());
  const samRefusal = missingDuration.lineShareParity.rows.find((row) => row.personId === 'sam' && row.managerId === 'project');
  assert.equal(samRefusal.state, 'refused');
  assert.match(samRefusal.reason, /no readable duration|total is BLANK|could not be read/i);
  assert.equal(samRefusal.declaredPermille, null);
  assert.equal(samRefusal.observedPermille, null);

  const changedLine = baseState();
  changedLine.reportingLines.find((line) => line.id === 'l-sam-project').toISO = '2026-08-31';
  const partial = read(normalizeState(changedLine).state);
  const partialRow = partial.lineShareParity.rows.find((row) => row.personId === 'sam' && row.managerId === 'project');
  assert.equal(partialRow.state, 'refused');
  assert.match(partialRow.reason, /whole requested period/);
  assert.equal(partialRow.declaredPermille, null);
});

test('display equals stored: a reloaded workspace prints the same figures and a read mutates nothing', () => {
  const state = baseState();
  const before = JSON.stringify(state);
  const first = read(state);
  assert.equal(JSON.stringify(state), before, 'reading mutates nothing');

  const reloaded = normalizeState(JSON.parse(before), { now: NOW }).state;
  const second = read(reloaded);
  assert.equal(second.board.chargedMinutes, first.board.chargedMinutes);
  assert.equal(second.board.spanTaxPermille, first.board.spanTaxPermille);
  for (const p of first.people) {
    const twin = personOf(second, p.personId);
    assert.equal(twin.minutes, p.minutes, `${p.personId} minutes survive a reload`);
    assert.equal(twin.taxPermille, p.taxPermille, `${p.personId} rate survives a reload`);
  }
});

/* --------------------------------------------------------------- refusals */

test('a sitting with no recorded duration refuses its attendee’s total — never a partial sum', () => {
  const report = read(refusedState());
  const b = report.board;
  const sam = personOf(report, 'sam');

  assert.equal(b.refusalCounts['no-minutes'], 1);
  assert.equal(sam.state, 'refused');
  assert.equal(sam.minutes, null, 'the total is BLANK, not the known part');
  assert.equal(sam.knownMinutes, 270, 'the known part is counted, and printed only as a floor');
  assert.match(sam.reason, /BLANK rather than a partial sum/);
  assert.match(sam.reason, /at least 270 known minute/);

  // The refused sitting is charged to nobody, so the record identity still holds.
  assert.equal(b.chargedMinutes, 925);
  assert.equal(b.printableMinutes, 490);
  assert.equal(b.refusedKnownMinutes, 435);
  assert.equal(b.printableMinutes + b.refusedKnownMinutes, b.chargedMinutes);
  assert.equal(b.minutesReconcile, true);
  assert.equal(b.figuresComplete, false);
  assert.equal(b.refusedPeopleN, 2);
  assert.equal(b.spanTaxPermille, null, 'a rate over a refused population is refused');
  assert.match(b.spanTaxRefusedReason, /could not be read/);
});

test('a sitting naming an attendee outside the roster is refused whole, never charged to those recognised', () => {
  const report = read(refusedState());
  const b = report.board;
  const leo = personOf(report, 'leo');

  assert.equal(b.refusalCounts['unknown-attendee'], 1);
  assert.equal(leo.state, 'refused');
  assert.equal(leo.minutes, null);
  assert.equal(leo.knownMinutes, 165, 'the 30-minute sitting with the ghost attendee is charged to nobody');
  assert.equal(b.sessionMinutes, 925);
  assert.match(leo.reason, /validated room/);
});

test('the one-line-per-manager invariant: a second declaration cannot split a chair’s minutes', () => {
  const state = normalizeState((() => {
    const s = createEmptyState(NOW.toISOString());
    s.people = [
      { id: 'home', name: 'Home', level: 'director', managerId: null, status: 'active' },
      { id: 'pm', name: 'Programme Manager', level: 'manager', managerId: 'home', status: 'active' },
      { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active' },
    ];
    // Two declarations from the SAME manager. The matrix engine stores at most
    // one line per (person, manager), so there is no "two lines" class to reach.
    s.reportingLines = [
      lineRow('l-a', 'sam', 'pm', 40, 'project'),
      lineRow('l-b', 'sam', 'pm', 20, 'functional'),
    ];
    s.cadenceForums = [
      { id: 'f', title: 'Programme review', kind: 'portfolio-review', cadence: 'weekly', status: 'active', chairSeatId: 'pm', attending: ['pm', 'sam'] },
    ];
    s.cadenceSessions = [session('x1', 'f', '2026-08-05', 'held', 50, ['pm', 'sam'])];
    return s;
  })()).state;
  const report = read(state);
  const sam = personOf(report, 'sam');
  assert.equal(sam.linesN, 1, 'the matrix engine stores exactly one active line per manager');
  assert.equal(sam.placementMinutes.line, 50, 'the chair’s minutes land on the single line, once');
  assert.equal(sam.placementMinutes.other, 0);
  assert.equal(report.board.lineMinutes, 50);
  assert.equal(report.board.chargedMinutes, 100, '50 for each person in the room');
  assert.equal(report.board.minutesReconcile, true);
});

/* ------------------------------------------------------------- placement */

test('the home line is printed and never charged; the person’s own forum is not a tax', () => {
  const report = read(baseState());
  const ava = personOf(report, 'ava');
  assert.equal(ava.placementMinutes.home, 90, 'the retired forum chaired by her own manager still counts');
  assert.equal(ava.placementMinutes.other, 20, 'a convener holding no declared line is other, never a line');
  assert.equal(ava.taxPermille, 182);

  const home = personOf(report, 'home');
  assert.equal(home.placementMinutes.self, 210, 'chairing her own forums is her meeting time, not a tax');
  assert.equal(home.taxPermille, 0);
  assert.equal(report.forums.find((f) => f.forumId === 'f-old').status, 'retired', 'a retired forum keeps its history');
});

/* ------------------------------------------------------------ rate floors */

test('a rate is BLANK below the declared floor, with its reason, in the panel and the export', () => {
  const state = normalizeState((() => {
    const s = createEmptyState(NOW.toISOString());
    s.people = [
      { id: 'home', name: 'Home', level: 'director', managerId: null, status: 'active' },
      { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active' },
    ];
    s.cadenceForums = [
      { id: 'f', title: 'Standup', kind: 'operating-review', cadence: 'daily', status: 'active', chairSeatId: 'home', attending: ['home', 'sam'] },
    ];
    s.cadenceSessions = [session('x1', 'f', '2026-08-05', 'held', 5, ['sam'])];
    return s;
  })()).state;
  const report = read(state);
  const sam = personOf(report, 'sam');
  assert.equal(sam.minutes, 5);
  assert.equal(sam.taxPermille, null);
  assert.match(sam.taxRefusedReason, /Below the declared floor of 12/);
  assert.equal(report.board.spanTaxPermille, null);
  assert.match(report.board.spanTaxRefusedReason, /Only 1 measured person/);

  const csv = matrixMeetingLoadCsvRows(report);
  assert.equal(csv[0].coordination_tax_permille, '', 'a refused rate exports BLANK, never zero');
  assert.equal(csv[0].tax_withheld, true);
  assert.ok(csv[0].withheld_reason.length > 0);
});

/* ---------------------------------------------------------------- window */

test('the window places a sitting by the day it sat: outside stays out, cancelled charges nothing', () => {
  const state = baseState();
  state.cadenceSessions.push(session('s-out', 'f-lead', '2026-04-01', 'held', 600, ['home', 'sam']));
  const normalized = normalizeState(state).state;
  const report = read(normalized);
  assert.equal(report.board.outsideWindowN, 1);
  assert.equal(report.board.chargedMinutes, 925, 'the April sitting belongs to another period');
  assert.equal(personOf(report, 'sam').minutes, 270);

  const invalid = read(normalized, { from: '2026-09-30', to: '2026-07-01' });
  assert.equal(invalid.window.valid, false);
  assert.equal(invalid.board.chargedMinutes, 0);
  assert.match(matrixMeetingLoadBriefText(invalid), /period itself is refused/);
});

/* ----------------------------------------------------------- single-chain */

test('a single-chain workspace reads the same minutes and makes no line claim', () => {
  const state = createEmptyState(NOW.toISOString());
  state.people = [
    { id: 'home', name: 'Home', level: 'director', managerId: null, status: 'active' },
    { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active' },
  ];
  state.cadenceForums = [
    { id: 'f', title: 'Team sync', kind: 'operating-review', cadence: 'weekly', status: 'active', chairSeatId: 'home', attending: ['home', 'sam'] },
  ];
  state.cadenceSessions = [session('x1', 'f', '2026-08-05', 'held', 60, ['sam', 'home'])];
  const report = read(normalizeState(state).state);
  assert.equal(report.isMatrix, false);
  assert.equal(report.board.chargedMinutes, 120);
  assert.equal(report.board.crossLineMinutes, 0);
  assert.match(report.singleChainNote, /No second reporting line reaches this seat/);
  assert.equal(personOf(report, 'sam').linesN, 0);
});

/* ------------------------------------------------------------------- CSV */

test('the export is aggregate only: no person, chair, forum title or sitting day crosses the boundary', () => {
  const state = refusedState();
  const res = exportWorkspaceCsv(state, 'matrix-meeting-load', { now: NOW });
  assert.equal(res.ok, true, res.error);
  const parsed = parseCsv(res.csv);
  assert.deepEqual(parsed.headers, [...MATRIX_MEETING_LOAD_CSV_COLUMNS]);
  const kinds = parsed.rows.map((row) => row[4]).sort();
  assert.deepEqual(kinds, ['all', 'business-review', 'leadership-sync', 'operating-review']);
  for (const forbidden of ['sam', 'Sam', 'leo', 'Project alpha review', 'Leadership sync', '2026-07-06', 'ghost']) {
    assert.equal(res.csv.includes(forbidden), false, `the export must not contain "${forbidden}"`);
  }
  const summary = parsed.rows.find((row) => row[4] === 'all');
  const col = (key) => parsed.headers.indexOf(key);
  assert.equal(Number(summary[col('person_minutes')]), 925);
  assert.equal(Number(summary[col('people_refused_n')]), 2);
  assert.equal(summary[col('coordination_tax_permille')], '', 'refused rate exports BLANK');
  assert.equal(summary[col('minutes_reconcile')], 'true');
  assert.equal(summary[col('figures_complete')], 'false');
  // Per-kind minute totals sum exactly to the reported workspace total.
  const kindMinutes = parsed.rows.filter((row) => row[4] !== 'all')
    .reduce((acc, row) => acc + Number(row[col('person_minutes')]), 0);
  assert.equal(kindMinutes, 925);
});

/* ------------------------------------------------------- capture + render */

test('the sitting capture the ledger depends on persists duration and room, and the ledger reads them back', () => {
  const state = normalizeState((() => {
    const s = createEmptyState(NOW.toISOString());
    s.people = [
      { id: 'home', name: 'Home', level: 'director', managerId: null, status: 'active' },
      { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active' },
      { id: 'ava', name: 'Ava', level: 'ic', managerId: 'home', status: 'active' },
    ];
    return s;
  })()).state;
  const mem = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  let serial = 0;
  const idFactory = (p) => `${p}-${++serial}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });

  const declared = api.cadenceDeclareForum({
    title: 'Weekly operating review', kind: 'operating-review', cadence: 'weekly',
    chairSeatId: 'home', attending: ['home', 'sam'], decisionCapacity: 8, serviceDays: 1,
  });
  assert.equal(declared.ok, true, declared.error);
  const logged = api.cadenceLogSession(declared.forum.id, {
    heldOn: '2026-08-05', status: 'held', closedN: 1, plannedN: 2,
    minutes: 45, attendeeIds: ['home', 'sam', 'ava'],
  });
  assert.equal(logged.ok, true, logged.error);

  const persisted = JSON.parse(mem.get(STORAGE_KEY));
  const sitting = persisted.cadenceSessions.find((s) => s.heldOn === '2026-08-05');
  assert.equal(sitting.minutes, 45);
  assert.deepEqual([...sitting.attendeeIds].sort(), ['ava', 'home', 'sam']);

  const report = buildMatrixMeetingLoad(persisted, { from: Q3_FROM, to: Q3_TO, now: NOW, settings: persisted.settings });
  assert.equal(report.board.chargedMinutes, 135, '45 minutes × 3 people in the room');
  assert.equal(personOf(report, 'ava').minutes, 45);
  assert.equal(personOf(report, 'sam').placementMinutes.home, 45);

  // An explicit empty room is recorded as empty, not replaced by the forum list.
  const emptyRoom = api.cadenceLogSession(declared.forum.id, {
    heldOn: '2026-08-12', status: 'held', closedN: 1, plannedN: 1, minutes: 30, attendeeIds: [],
  });
  assert.equal(emptyRoom.ok, true, emptyRoom.error);
  const after = JSON.parse(mem.get(STORAGE_KEY));
  const emptySitting = after.cadenceSessions.find((s) => s.heldOn === '2026-08-12');
  assert.deepEqual(emptySitting.attendeeIds, []);
  const afterReport = buildMatrixMeetingLoad(after, { from: Q3_FROM, to: Q3_TO, now: NOW, settings: after.settings });
  assert.equal(afterReport.board.refusalCounts['no-attendees'], 1);
  assert.equal(afterReport.board.chargedMinutes, 135, 'a sitting that names nobody charges nobody');
});

test('the panel renders the computed figures, adds no page title and mutates nothing', () => {
  const state = refusedState();
  const report = read(state);
  const before = JSON.stringify(state);
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map((k) => [k, globalThis[k]]));
  try {
    for (const k of globals) {
      globalThis[k] = k === 'document' ? dom.window.document : k === 'window' ? dom.window : dom.window[k];
    }
    const node = renderMatrixMeetingLoadPanel({
      state,
      query: new URLSearchParams(`from=${Q3_FROM}&to=${Q3_TO}`),
      navigate() {},
      refresh() {},
    }, { now: NOW });
    assert.equal(JSON.stringify(state), before, 'rendering mutates nothing');
    assert.equal(node.querySelectorAll('h1').length, 0, 'the panel is not a page');
    const text = node.textContent;
    assert.match(text, /Minutes reconcile: verified/);
    assert.match(text, /Figures complete: NOT verified/);
    assert.match(text, /925/, 'the charged total is printed');

    const table = [...node.querySelectorAll('table')]
      .find((t) => t.getAttribute('aria-label') === 'Meeting burden per person in scope');
    assert.ok(table, 'the person table is rendered');
    const samRow = [...table.querySelectorAll('tbody tr')]
      .find((tr) => tr.textContent.startsWith('Sam'));
    assert.ok(samRow, 'every in-scope person has a row');
    const cells = [...samRow.querySelectorAll('td')].map((td) => td.textContent.trim());
    assert.equal(cells[3], '—', 'the refused total prints an em dash, never a number');
    assert.match(cells[10], /Total refused/);
  } finally {
    for (const k of globals) globalThis[k] = previous.get(k);
  }
});
