/**
 * tests/app/duty-absence-concurrency.test.mjs — ADR-0123, Schema v115, Session 169.
 *
 * CONCURRENT ABSENCE EXPOSURE answers the question a per-absence plan cannot:
 * "two or three seats are out on the SAME dates — which duty lines lose their
 * cover on those shared dates, and is one person the only declared cover for
 * more than one of the absent seats?"
 *
 * What this suite proves, against the REAL store, the REAL report and the REAL
 * view:
 *   1. The sweep refuses honestly: no absence, one absence, and absences that
 *      never share a date each print a refusal instead of a reassuring zero.
 *   2. The sweep finds the maximal shared date range, with inclusive boundaries
 *      and adjacency (one window ending the day before the next opens) NOT
 *      counted as overlap.
 *   3. The window band and the exposed counts are derived from the per-duty
 *      window plan; open work is counted separately from exposure.
 *   4. A single point of failure is found across two absent seats when ONE
 *      declared cover is the only answerable person for both — and it is
 *      withheld above the manager altitude while its counts survive.
 *   5. A declared cover who is themselves absent on the shared dates reads as
 *      a conflict (no available cover), not as a coverage.
 *   6. Concurrency is DERIVED: nothing about it is stored on the absence row,
 *      and a reload re-derives the identical reading.
 *   7. The register report carries the concurrency section at every altitude
 *      and the upward brief prints it; the CSV row kinds are unchanged.
 *   8. Declaring an absence that creates an overlap puts the concurrency on
 *      the governed decision in the SAME transaction, and on the event record.
 *   9. The sweep is capped: the remainder is counted and printed, never folded
 *      into a comfortable number.
 *  10. The plan panel renders the concurrency card, axe-clean, at the director
 *      altitude with names withheld and at the manager altitude with them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { SCHEMA_VERSION, createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import {
  absenceConcurrency, dutyAbsenceRollup, buildDutyCoverageReport, dutyCoverageBriefText,
  dutyCoverageCsvRows,
} from '../../app/core/domain/dutyCoverage.js';
import {
  DUTY_CONCURRENCY_ENGINE_VERSION, DUTY_CONCURRENCY_PREMISE, DUTY_ABSENCE_LIMITS,
} from '../../app/core/domain/dutyAbsenceRegistry.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const NOW = new Date('2027-06-30T00:00:00.000Z');
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);

/**
 * leader (chief) → vp1 → dir1 → { mgr1 → lead1, lead2 → ic1/ic2/ic3; mgr2 → lead3 → ic4 }
 * Two branches under one director so a cross-branch overlap exists at the
 * director altitude and is provably outside the manager's span.
 */
function people() {
  return [
    { id: 'vp1', name: 'Rina Okafor', role: 'VP Operations', level: 'vp', managerId: null },
    { id: 'dir1', name: 'Samuel Park', role: 'Director', level: 'director', managerId: 'vp1' },
    { id: 'mgr1', name: 'Mei Chen', role: 'Manager', level: 'manager', managerId: 'dir1' },
    { id: 'mgr2', name: 'Tomas Ito', role: 'Manager', level: 'manager', managerId: 'dir1' },
    { id: 'lead1', name: 'Priya Raman', role: 'Shift lead', level: 'lead', managerId: 'mgr1' },
    { id: 'lead2', name: 'Jordan Lee', role: 'Shift lead', level: 'lead', managerId: 'mgr1' },
    { id: 'lead3', name: 'Ana Duarte', role: 'Shift lead', level: 'lead', managerId: 'mgr2' },
    { id: 'ic1', name: 'Ari Klein', role: 'Analyst', level: 'ic', managerId: 'lead1' },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Analyst', level: 'ic', managerId: 'lead1' },
    { id: 'ic3', name: 'Cy Orlov', role: 'Analyst', level: 'ic', managerId: 'lead2' },
    { id: 'ic4', name: 'Dee Marsh', role: 'Analyst', level: 'ic', managerId: 'lead3' },
  ];
}

function makeState({ activeSeatId = 'dir1', absences = [], covers = [], roster = people() } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    oneOnOneCadenceDays: 7,
    activeSeatId,
  };
  state.people = roster.map((p) => ({ status: 'active', createdAt: ago(500), ...p }));
  state.oneOnOnes = [{ id: 'oo1', personId: 'ic1', date: ago(3), status: 'held', notes: 'Weekly cadence held.', agenda: [], actions: [] }];
  state.cases = [{
    id: 'case1', title: 'Night-shift handover blocker', status: 'open', ownerId: 'ic1',
    openedOn: ago(11), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), involvedPersonIds: ['ic1'],
  }];
  state.absencePlans = absences.map((a, i) => ({
    id: `abs-${i + 1}`,
    seatId: a.seatId,
    from: a.from,
    to: a.to,
    reason: a.reason || 'A planned absence declared for this window.',
    note: '',
    decisionId: null,
    declaredBySeatId: a.seatId,
    declaredOn: ago(2),
    declaredAt: NOW.toISOString(),
    status: 'active',
    revokedOn: null,
    revokedAt: null,
    revokeReason: '',
    version: 'duty-absence-2026.11-v1',
  }));
  state.dutyCovers = covers.map((c, i) => ({
    id: `cover-${i + 1}`,
    dutyId: `${c.seatId}|${c.dutyKey || 'coach'}`,
    seatId: c.seatId,
    dutyKey: c.dutyKey || 'coach',
    coverId: c.coverId,
    note: c.note || 'Declared answerable for this duty while the holder is absent.',
    decisionId: null,
    declaredBySeatId: 'dir1',
    declaredOn: ago(5),
    declaredAt: NOW.toISOString(),
    status: 'active',
    revokedOn: null,
    revokedAt: null,
    revokeReason: '',
    verifiedOn: null,
    version: 'duty-coverage-2026.11-v1',
  }));
  return normalizeState(state, { now: NOW }).state;
}

function boot(state = makeState()) {
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  let seq = 0;
  const now = () => NOW;
  const store = createStore({ storage, now, idFactory: (p) => `${p}-t${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-t${++seq}` });
  return { store, api, map };
}

function read(state) {
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const seat = activeSeat(built);
  return absenceConcurrency(state, built, seat, { now: NOW, settings: state.settings });
}

/* ------------------------------------------------------- 1. honest refusals */

test('the sweep refuses honestly: no absence, one absence, and windows that never share a date', () => {
  assert.equal(SCHEMA_VERSION, 118, 'ADR-0123 adds no schema bump');
  assert.equal(DUTY_CONCURRENCY_ENGINE_VERSION, 'duty-concurrency-2026.11-v1');
  assert.ok(DUTY_CONCURRENCY_PREMISE.length > 0, 'the premise is printed in the product');

  const empty = read(makeState({ activeSeatId: 'dir1' }));
  assert.equal(empty.summary.participantsN, 0);
  assert.equal(empty.windows.length, 0);
  assert.match(empty.refused, /No active absence plan/i, 'an empty ledger is refused, not reported as clear');

  const single = read(makeState({
    activeSeatId: 'mgr1',
    absences: [{ seatId: 'lead1', from: '2027-07-05', to: '2027-07-09' }],
  }));
  assert.equal(single.summary.participantsN, 1);
  assert.match(single.refused, /Only one active absence plan/i, 'one declaration cannot be an overlap');

  // Adjacency is not overlap: 07-05 → 07-06 and 07-07 → 07-09 never share a day.
  const adjacent = read(makeState({
    activeSeatId: 'mgr1',
    absences: [
      { seatId: 'lead1', from: '2027-07-05', to: '2027-07-06' },
      { seatId: 'lead2', from: '2027-07-07', to: '2027-07-09' },
    ],
  }));
  assert.equal(adjacent.summary.participantsN, 2);
  assert.equal(adjacent.windows.length, 0);
  assert.match(adjacent.refused, /no two windows share a date/i);
  assert.match(adjacent.refused, /Adjacency is not overlap/i);
});

/* ---------------------------------------------------- 2. the shared range */

test('the sweep finds the maximal shared date range, inclusive, and merges one cast', () => {
  const state = makeState({
    activeSeatId: 'mgr1',
    absences: [
      { seatId: 'lead1', from: '2027-07-05', to: '2027-07-09' },
      { seatId: 'lead2', from: '2027-07-07', to: '2027-07-12' },
    ],
  });
  const conc = read(state);
  assert.equal(conc.refused, null);
  assert.equal(conc.windows.length, 1, 'one shared range with a stable cast');
  const w = conc.windows[0];
  assert.equal(w.from, '2027-07-07', 'the shared range opens when the second seat leaves');
  assert.equal(w.to, '2027-07-09', 'and closes when the first seat returns');
  assert.equal(w.days, 3);
  assert.equal(w.count, 2);
  assert.deepEqual(w.seats.map((s) => s.seatId).sort(), ['lead1', 'lead2']);
  assert.deepEqual(w.seats.map((s) => s.ref).sort(), ['Jordan Lee', 'Priya Raman'], 'below the name wall the seats are named');
  assert.equal(conc.summary.maxConcurrent, 2);
  assert.equal(conc.summary.seatsInOverlapN, 2);

  // A full swallow is one window, not three fragments.
  const swallowed = read(makeState({
    activeSeatId: 'mgr1',
    absences: [
      { seatId: 'lead1', from: '2027-07-05', to: '2027-07-09' },
      { seatId: 'lead2', from: '2027-07-01', to: '2027-07-20' },
    ],
  }));
  assert.equal(swallowed.windows.length, 1);
  assert.deepEqual([swallowed.windows[0].from, swallowed.windows[0].to], ['2027-07-05', '2027-07-09']);
});

/* ------------------------------------------------ 3. exposure on shared dates */

test('exposure is derived per duty line on the shared dates, with open work counted apart', () => {
  const state = makeState({
    activeSeatId: 'mgr1',
    absences: [
      { seatId: 'lead1', from: '2027-07-05', to: '2027-07-09' },
      { seatId: 'lead2', from: '2027-07-05', to: '2027-07-09' },
    ],
  });
  const conc = read(state);
  const w = conc.windows[0];
  assert.ok(['exposed', 'open-exposed'].includes(w.band), `band ${w.band}`);
  assert.ok(w.exposedN > 0, 'with no cover declared the shared dates are exposed');
  assert.equal(w.exposedN, w.seats.reduce((sum, s) => sum + s.exposedN, 0), 'seat counts add up to the window');
  assert.equal(w.exposedOpenN, w.seats.reduce((sum, s) => sum + s.exposedOpenN, 0));
  assert.ok(w.exposedOpenN <= w.exposedN);
  assert.match(w.reason, /absent at once 2027-07-05 → 2027-07-09/);
  assert.equal(w.singleCovers.length, 0, 'no cover declared means no single cover is named');

  // The window is graded against the SHARED dates, not against the longer of the
  // two absences: an exposed reading must name the days it actually covers.
  const staggered = read(makeState({
    activeSeatId: 'mgr1',
    absences: [
      { seatId: 'lead1', from: '2027-07-01', to: '2027-07-03' },
      { seatId: 'lead2', from: '2027-07-02', to: '2027-07-30' },
    ],
  }));
  assert.deepEqual([staggered.windows[0].from, staggered.windows[0].to], ['2027-07-02', '2027-07-03']);
});

/* -------------------------------------- 4. the single point of failure (SPOF) */

test('one declared cover for two absent seats is a single point of failure, withheld above the manager altitude', () => {
  const absences = [
    { seatId: 'lead1', from: '2027-07-05', to: '2027-07-09' },
    { seatId: 'lead2', from: '2027-07-05', to: '2027-07-09' },
  ];
  const covers = [
    { seatId: 'lead1', dutyKey: 'coach', coverId: 'mgr1' },
    { seatId: 'lead2', dutyKey: 'coach', coverId: 'mgr1' },
  ];

  const atManager = read(makeState({ activeSeatId: 'mgr1', absences, covers }));
  const w = atManager.windows[0];
  assert.equal(w.singleCovers.length, 1, 'one person is the only answerable cover for both seats');
  const spof = w.singleCovers[0];
  assert.equal(spof.name, 'Mei Chen', 'the manager altitude names the person');
  assert.equal(spof.label, 'Manager');
  assert.equal(spof.seatsN, 2);
  assert.equal(spof.dutiesN, 2);
  assert.deepEqual(spof.refs.sort(), ['Jordan Lee', 'Priya Raman']);
  assert.match(w.reason, /ONLY answerable person/i);

  // Above rank 2 the name is withheld; every count survives.
  const atDirector = read(makeState({ activeSeatId: 'dir1', absences, covers }));
  assert.equal(atDirector.namesVisible, false);
  assert.equal(atDirector.windows[0].singleCovers.length, 1, 'the finding is not hidden, only the name');
  const redacted = atDirector.windows[0].singleCovers[0];
  assert.equal(redacted.name, null);
  assert.equal(redacted.coverId, null);
  assert.equal(redacted.label, 'Manager', 'the seat label survives');
  assert.equal(redacted.seatsN, 2);
  assert.equal(redacted.dutiesN, 2);
  const serialized = JSON.stringify(atDirector);
  for (const name of ['Mei Chen', 'Priya Raman', 'Jordan Lee', 'Ari Klein', 'Tomas Ito']) {
    assert.ok(!serialized.includes(name), `the director reading must not carry “${name}”`);
  }
});

/* --------------------------------------------- 5. cover who is themselves out */

test('a declared cover who is absent on the shared dates reads as a conflict, not as cover', () => {
  const state = makeState({
    activeSeatId: 'dir1',
    absences: [
      { seatId: 'lead1', from: '2027-07-05', to: '2027-07-09' },
      { seatId: 'lead2', from: '2027-07-05', to: '2027-07-09' },
      { seatId: 'mgr1', from: '2027-07-01', to: '2027-07-12' },
    ],
    covers: [
      { seatId: 'lead1', dutyKey: 'coach', coverId: 'mgr1' },
      { seatId: 'lead2', dutyKey: 'coach', coverId: 'mgr1' },
    ],
  });
  const conc = read(state);
  assert.equal(conc.windows.length, 1, 'the three absorptions are one shared cast');
  const w = conc.windows[0];
  assert.equal(w.count, 3);
  assert.ok(w.conflicts.length >= 1, 'the absent cover is printed');
  assert.equal(w.conflicts[0].name, null, 'names withheld at the director altitude');
  assert.equal(w.conflicts[0].label, 'Manager');
  assert.equal(w.conflicts[0].from, '2027-07-01');
  assert.equal(w.singleCovers.length, 0, 'a cover who cannot answer is not a single point of coverage');
  assert.ok(w.exposedOpenN > 0 || w.exposedN > 0, 'their duty lines are exposed on the shared dates');
  assert.match(w.reason, /no available/i);

  // The manager's own reading includes their own declared absence.
  const atManager = read(makeState({
    activeSeatId: 'mgr1',
    absences: [{ seatId: 'mgr1', from: '2027-07-01', to: '2027-07-12' }],
  }));
  assert.equal(atManager.summary.participantsN, 1);
  assert.equal(atManager.participants[0].self, true, 'the acting seat’s own window is swept, flagged as self');
});

/* ------------------------------------------------ 6. derived, never stored */

test('concurrency is derived on every read: nothing is stored on the absence row and a reload agrees', () => {
  const state = makeState({
    activeSeatId: 'dir1',
    absences: [
      { seatId: 'lead1', from: '2027-07-05', to: '2027-07-09' },
      { seatId: 'lead3', from: '2027-07-07', to: '2027-07-12' },
    ],
    covers: [
      { seatId: 'lead1', dutyKey: 'coach', coverId: 'dir1' },
      { seatId: 'lead3', dutyKey: 'coach', coverId: 'dir1' },
    ],
  });
  for (const row of state.absencePlans) {
    for (const banned of ['concurrency', 'available', 'windowBand', 'overlap', 'singleCover']) {
      assert.equal(Object.prototype.hasOwnProperty.call(row, banned), false, `the absence row must not store “${banned}”`);
    }
  }

  const first = read(state);
  const booted = boot(state);
  const reloaded = read(JSON.parse(booted.map.get(STORAGE_KEY)));
  assert.deepEqual(reloaded, first, 'a reload re-derives the identical reading');

  // Moving one window changes the overlap without touching any stored row.
  const shifted = { ...state, absencePlans: state.absencePlans.map((r) => (r.seatId === 'lead3' ? { ...r, from: '2027-08-01', to: '2027-08-06' } : r)) };
  const after = read(shifted);
  assert.equal(after.windows.length, 0);
  assert.match(after.refused, /no two windows share a date/i, 'the reading follows the dates, not a stored verdict');
});

/* ------------------------------------------- 7. report, brief, roll-up, CSV */

test('the report carries concurrency at every altitude; the brief prints it; CSV row kinds are unchanged', () => {
  const absences = [
    { seatId: 'lead1', from: '2027-07-05', to: '2027-07-09' },
    { seatId: 'lead3', from: '2027-07-07', to: '2027-07-12' },
  ];
  const covers = [
    { seatId: 'lead1', dutyKey: 'coach', coverId: 'dir1' },
    { seatId: 'lead3', dutyKey: 'coach', coverId: 'dir1' },
  ];

  const perAltitude = {};
  for (const seatId of ['lead1', 'mgr1', 'dir1', 'vp1', 'leader']) {
    const state = makeState({ activeSeatId: seatId, absences, covers });
    const report = buildDutyCoverageReport(state, { now: NOW, settings: state.settings });
    assert.ok(report.absences.concurrency, `${seatId} report carries the concurrency section`);
    perAltitude[seatId] = report.absences.concurrency;
    assert.equal(report.bounds.dutyConcurrencyWindowCap, DUTY_ABSENCE_LIMITS.concurrentWindowCap);
  }

  // The director, VP and chief roll the same shared dates up; the frontline lead
  // sees only their own span and prints the refusal rather than a zero.
  for (const seatId of ['dir1', 'vp1', 'leader']) {
    const conc = perAltitude[seatId];
    assert.equal(conc.windows.length, 1, `${seatId} sees the cross-branch overlap`);
    assert.equal(conc.windows[0].count, 2);
    assert.equal(conc.windows[0].singleCovers.length, 1, `${seatId} sees the single cover`);
  }
  assert.equal(perAltitude.mgr1.windows.length, 0, 'the overlap is outside the first manager’s own span');
  assert.match(perAltitude.mgr1.refused, /Only one active absence plan/i);
  assert.equal(perAltitude.lead1.windows.length, 0);
  assert.ok(perAltitude.lead1.refused, 'the frontline seat gets a printed refusal, not a fake clear');

  // The brief is identity-free and prints the concurrency line.
  const dirState = makeState({ activeSeatId: 'dir1', absences, covers });
  const brief = dutyCoverageBriefText(buildDutyCoverageReport(dirState, { now: NOW, settings: dirState.settings }));
  assert.match(brief, /Concurrent absence: 1 overlapping window/);
  assert.match(brief, /single-cover point/);
  assert.ok(!brief.includes('Samuel Park'), 'the brief names no person');
  assert.ok(!brief.includes('Priya Raman'));

  // The CSV keeps its existing row kinds: concurrency is a register reading,
  // not a new export scope that would change every downstream consumer.
  const csv = dutyCoverageCsvRows(buildDutyCoverageReport(dirState, { now: NOW, settings: dirState.settings }));
  assert.deepEqual([...new Set(csv.map((r) => r.row_kind))].sort(), ['absence', 'branch', 'branch-summary', 'duty', 'register']);

  // No absences at all: nothing is printed as a concurrency reading.
  const quiet = makeState({ activeSeatId: 'dir1' });
  const quietBrief = dutyCoverageBriefText(buildDutyCoverageReport(quiet, { now: NOW, settings: quiet.settings }));
  assert.ok(!/Concurrent absence:/.test(quietBrief), 'an empty ledger is silent in the brief, not falsely clear');
});

/* --------------------------------------- 8. the write path records the overlap */

test('declaring an absence that creates an overlap puts it on the governed decision and the event', () => {
  // The manager's own absence while a lead is already declared out: the manager's
  // span holds both windows, so the overlap is graded and recorded in the SAME
  // transaction. (A rank-1 peer cannot see another peer's window — that privacy
  // seam is unchanged; the overlap rolls up to the manager's own read instead.)
  const mgrState = makeState({
    activeSeatId: 'mgr1',
    absences: [{ seatId: 'lead1', from: '2027-07-05', to: '2027-07-09' }],
  });
  const h2 = boot(mgrState);
  const declared = h2.api.dutyAbsenceDeclare({
    from: '2027-07-07', to: '2027-07-12', reason: 'A second absence in the same week.',
  });
  assert.ok(declared.ok, declared.error);
  assert.equal(declared.concurrency.windowsN, 1, 'the declaration reports the overlap it created');
  assert.ok(declared.concurrency.maxConcurrent >= 2);

  const row = h2.store.state.absencePlans.find((r) => r.id === declared.id);
  const decision = h2.store.state.decisions.find((d) => d.id === row.decisionId);
  assert.ok(decision, 'the governed decision is on the record');
  assert.match(decision.question, /Concurrency: this window overlaps 1 other declared absence/);
  assert.match(decision.question, /absent at once/);

  const event = h2.store.state.events.find((e) => e.entityId === row.id && /declared/i.test(e.type));
  assert.ok(event, 'the declare event is on the record');
  assert.match(event.summary, /concurrent window/i);

  // The scan reports the same derived reading, and schedules nothing.
  const scan = h2.api.dutyAbsenceScan();
  assert.ok(scan.ok, scan.error);
  assert.equal(scan.concurrency.windowsN, 1);
  assert.equal(scan.concurrency.refused, null);
});

/* -------------------------------------------------- 9. the sweep is capped */

test('the sweep is capped and the deferred remainder is counted and printed', () => {
  const roster = people();
  const absences = [];
  for (let i = 0; i < 22; i += 1) {
    const id = `leadx${i}`;
    // A seat exists for a leader who holds people in the reporting tree, so each
    // extra lead carries one report — otherwise the absence is a person, not a seat.
    roster.push({ id, name: `Extra Lead ${i}`, role: 'Shift lead', level: 'lead', managerId: i % 2 ? 'mgr1' : 'mgr2' });
    roster.push({ id: `icx${i}`, name: `Extra Analyst ${i}`, role: 'Analyst', level: 'ic', managerId: id });
    const start = new Date(Date.parse('2027-09-01T00:00:00.000Z') + i * 86400000).toISOString().slice(0, 10);
    const end = new Date(Date.parse('2027-09-01T00:00:00.000Z') + (i + 5) * 86400000).toISOString().slice(0, 10);
    absences.push({ seatId: id, from: start, to: end });
  }
  const state = makeState({ activeSeatId: 'dir1', absences, roster });
  const conc = read(state);
  assert.equal(conc.windows.length, DUTY_ABSENCE_LIMITS.concurrentWindowCap, 'the graded windows are capped');
  assert.ok(conc.summary.deferredWindowsN > 0, 'the remainder is counted, never folded in');
  const brief = dutyCoverageBriefText(buildDutyCoverageReport(state, { now: NOW, settings: state.settings }));
  assert.match(brief, /were not graded/i);
});

/* ------------------------------------------------------------ 10. the view */

test('the plan panel renders the concurrency card: named at the manager altitude, withheld at the director', async () => {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);
  for (const [k, v] of Object.entries({
    window, document: window.document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement, Event: window.Event, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent,
    FileReader: window.FileReader, localStorage: window.localStorage,
  })) globalThis[k] = v;
  if (!window.axe) window.eval(AXE_SRC);

  const absences = [
    { seatId: 'lead1', from: '2027-07-05', to: '2027-07-09' },
    { seatId: 'lead2', from: '2027-07-05', to: '2027-07-09' },
  ];
  const covers = [
    { seatId: 'lead1', dutyKey: 'coach', coverId: 'mgr1' },
    { seatId: 'lead2', dutyKey: 'coach', coverId: 'mgr1' },
  ];
  const view = window.document.querySelector('#view') || (() => {
    const main = window.document.createElement('main');
    main.id = 'view';
    window.document.body.appendChild(main);
    return main;
  })();

  const render = async (seatId) => {
    const { api } = boot(makeState({ activeSeatId: seatId, absences, covers }));
    const ctx = { api, query: new URLSearchParams('panel=plan'), navigate: () => {}, refresh: () => {} };
    const node = renderDutyCover(ctx);
    view.replaceChildren(node);
    assert.ok(view.querySelector('h1'), 'the plan panel has an h1');
    assert.match(view.textContent, /Concurrent absence exposure/, 'the concurrency card is rendered');
    assert.match(view.textContent, /2027-07-05/, 'the shared dates are printed');
    assert.ok(!/undefined|\[object Object\]/.test(view.textContent), 'no placeholder leaked into the DOM');
    for (const el of view.querySelectorAll('button, a[href]')) {
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('value') || '').trim();
      assert.ok(name.length > 0, `an unnamed ${el.tagName} control would fail a screen-reader user`);
    }
    const res = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(res.violations).map((v) => `${v.id}: ${v.help}`), [], `axe violations at ${seatId}`);
    return view.textContent;
  };

  const managerText = await render('mgr1');
  assert.match(managerText, /Mei Chen/, 'the manager sees the person who is the single point of failure');
  assert.match(managerText, /only answerable cover/i);

  const directorText = await render('dir1');
  assert.ok(!directorText.includes('Mei Chen'), 'above the manager altitude the person is not named');
  assert.ok(!directorText.includes('Priya Raman'), 'nor is an absent seat holder');
  assert.match(directorText, /single-cover|only answerable cover/i, 'the finding itself survives redaction');

  assert.deepEqual(consoleErrors, [], 'no console errors while rendering');
  window.close();
});
