// ADR-0238 — Distributed-Work Equity Register (Schema v193).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — three empty ledgers and five declared
//      conventions, and no window, sitting, burden figure or verdict inferred
//      from anything an upgraded workspace already holds;
//   2. the loaders are FAIL-CLOSED — an unsourced window, an unreadable wall
//      clock, an unknown zone, a duplicated attendee and a missing duration are
//      DROPPED with counted warnings, never repaired; an ambiguous window PAIR
//      is kept and refused on read, never silently latest-wins;
//   3. PLACEMENT IS EXACT — outside minutes are integer minutes between the
//      sitting's resolved instant and the window resolved in the attendee's own
//      zone and day; the same sitting placed against two zones gives two
//      different, both correct, answers;
//   4. DST IS REFUSED, NOT SMOOTHED — a start the clocks skipped is refused, a
//      start that occurs twice must say which occurrence is meant, and a window
//      boundary inside a gap refuses that reading with its reason;
//   5. ONE PERSON, ONCE — an attendee on two lines is measured once, their
//      burden is never divided, and a chair holding two of the attendee's lines
//      falls to the named ambiguous bucket instead of an invented split;
//   6. a refused sitting contributes to NOBODY'S total and is counted; the
//      person rows re-add to the valid sittings (the first claim), while
//      coverage is a SEPARATE claim (unreadable people and refused sittings are
//      printed, never folded into a zero);
//   7. the equity verdict is refused below its declared floors with the reason,
//      and above them the top share and the even share are exact;
//   8. RULE-DWE-01 files one opaque ask per (signature, addressee) to the joint
//      apex above the convening and holding lines, is idempotent, closes its own
//      ask when the condition clears, observes unreadable attendees as
//      identity-free markers, and is paused on every path including a scan;
//   9. the door refuses the unsourced window, the future day, the off-roster
//      attendee and the unresolvable start, and a declaration supersedes the
//      active window in the open;
//  10. the CSV boundary is aggregate and identity-free, and the panel prints the
//      reader's own figures, cell by cell.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDistributedEquity, distributedEquityMatrix } from '../../app/core/domain/distributedEquity.js';
import {
  normalizeDweSittings,
  normalizeDweWindows,
  dweWallClock,
  dweSittingMinutes,
  dweZone,
} from '../../app/core/domain/distributedEquitySchema.js';
import { resolveSittingStart, sittingOutsideMinutes } from '../../app/core/domain/distributedEquityTime.js';
import {
  distributedEquityConditions,
  distributedEquityRule,
  indexDistributedEquityAsks,
  dweAskSignature,
} from '../../app/core/domain/distributedEquityRules.js';
import {
  DWE_CSV_SCOPE,
  DWE_LIMITS,
  DWE_RIGHTS,
  DWE_SETTING_KEYS,
} from '../../app/core/domain/distributedEquityRegistry.js';
import { renderDistributedEquity } from '../../app/views/distributedEquity.js';

const T0 = '2026-11-17T12:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);
const NOW = at('2026-11-17');
const L = DWE_LIMITS;

const person = (id, managerId) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  managerId,
  role: 'Engineer',
  status: 'active',
  startDate: '2026-01-01T09:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T09:00:00.000Z',
});

// priya (workspace leader, Copenhagen) → mei (Copenhagen) / samuel (New York)
// → freya (New York). mei ALSO answers to samuel on a declared project line,
// so the morning sitting that samuel chairs places mei's attendance against
// mei's own window while samuel holds two of mei's lines — the ambiguous-chair
// bucket. The late bridges (21:30 Copenhagen) are outside every Copenhagen
// window and land at 15:30 in New York — INSIDE the New York windows. The
// burden is carried by the Copenhagen side; that asymmetry is the point.
function fixture() {
  const raw = createEmptyState(T0);
  raw.people = [
    person('priya', null),
    person('mei', 'priya'),
    person('samuel', 'priya'),
    person('freya', 'samuel'),
  ];
  raw.reportingLines = [{
    id: 'rl-mei-samuel', personId: 'mei', managerId: 'samuel', kind: 'project', shareH: 20,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  const win = (id, personId, zone, start = '09:00', end = '17:00') => ({
    id, personId, zone, start, end,
    declaredOn: '2026-10-20', declaredById: 'leader',
    source: 'Stated by the person at the weekly 1:1 on 2026-10-20 and kept in the team working agreement.',
    note: '', status: 'active', withdrawnOn: null, withdrawalReason: '',
    createdAt: T0, updatedAt: T0,
  });
  raw.dweWindows = [
    win('w-priya', 'priya', 'Europe/Copenhagen'),
    win('w-mei', 'mei', 'Europe/Copenhagen'),
    win('w-samuel', 'samuel', 'America/New_York'),
    win('w-freya', 'freya', 'America/New_York'),
  ];
  raw.dweSittings = [
    { id: 's-late', day: '2026-11-11', start: '21:30', minutes: 60, zone: 'Europe/Copenhagen', attendeeIds: ['mei', 'samuel', 'freya'], chairId: 'priya', status: 'active', note: 'late bridge' },
    { id: 's-morning', day: '2026-11-12', start: '09:30', minutes: 30, zone: 'America/New_York', attendeeIds: ['mei', 'samuel'], chairId: 'samuel', status: 'active', note: 'morning sync' },
    { id: 's-edge', day: '2026-11-13', start: '16:45', minutes: 60, zone: 'Europe/Copenhagen', attendeeIds: ['priya', 'mei'], chairId: 'priya', status: 'active', note: 'overran' },
  ];
  return normalizeState(raw, { now: NOW }).state;
}

// The reader's own arithmetic over the fixture, for the tests that pin figures.
// s-late   21:30–22:30 CET Nov 11 (= 15:30–16:30 EST) → outside mei 60, inside
//          for samuel and freya (0 outside each).
// s-morning 09:30–10:00 EST Nov 12 → 15:30–16:00 CET, inside both windows → 0.
// s-edge   16:45–17:45 CET Nov 13 → 15 minutes inside, 45 outside for priya
//          and mei.
// Totals: mei 105 outside over 150 held; samuel 0 over 90; freya 0 over 60;
// priya 45 over 60. Workspace outside = 150 over 360 attendance minutes.

function makeEnv(state = fixture()) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const clock = () => new Date(T0);
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: clock, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: clock, idFactory }), store, { now: () => new Date(T0).getTime() });
  return { store, api, values, storage };
}

/* ------------------------------------------------------- 1. the schema bump */

test('ADR-0238 schema: the bump is additive — three empty ledgers, and nothing is inferred', () => {
  assert.equal(SCHEMA_VERSION, 195);
  for (const key of ['dweWindows', 'dweSittings', 'dweMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  const migrated = migrate({ schemaVersion: 192, settings: { ...createEmptyState(T0).settings } });
  // ADR-0238's own step is still applied in order; later bumps (v194 ADR-0240,
  // v195 ADR-0241) append, so the step that matters to THIS register is asserted
  // by position rather than by being the last one.
  assert.equal(migrated.applied.at(-3), '192 → 193', 'ADR-0238’s own step still runs, in order');
  assert.ok(migrated.applied.includes('192 → 193'), 'the whole chain runs to the current schema');
  assert.equal(migrated.raw.schemaVersion, 195);
  assert.deepEqual(migrated.raw.dweWindows, []);
  assert.deepEqual(migrated.raw.dweSittings, []);
  assert.deepEqual(migrated.raw.dweMarkers, []);
  assert.equal(migrated.raw.settings[DWE_SETTING_KEYS.autoPropagate], true, 'the rule starts on');
  assert.equal(migrated.raw.settings[DWE_SETTING_KEYS.outsideMinutesCeiling], 600, 'the ceiling is a declared default, not a fitted one');
});

/* ------------------------------------------------------- 2. fail-closed loaders */

test('ADR-0238 loaders: an unsourced window, a duplicated attendee, an unknown zone and a missing duration are dropped with counted warnings', () => {
  const warnings = [];
  const windows = normalizeDweWindows([
    { id: 'w1', personId: 'mei', zone: 'Europe/Copenhagen', start: '09:00', end: '17:00', declaredOn: '2026-10-20', status: 'active', source: '' },
    { id: 'w2', personId: 'mei', zone: 'Mars/Olympus', start: '09:00', end: '17:00', declaredOn: '2026-10-20', status: 'active', source: 'Stated by the person at the 1:1 on 2026-10-20.' },
    { id: 'w3', personId: 'mei', zone: 'Europe/Copenhagen', start: '09:60', end: '17:00', declaredOn: '2026-10-20', status: 'active', source: 'Stated by the person at the 1:1 on 2026-10-20.' },
  ], warnings);
  assert.deepEqual(windows.map((row) => row.id), [], 'every unreadable window is dropped');
  assert.equal(warnings.length, 3);
  assert.ok(warnings.some((w) => w.includes('no written source')), 'the unsourced window is refused by name');

  const sitWarnings = [];
  const sittings = normalizeDweSittings([
    { id: 's1', day: '2026-11-11', start: '21:30', minutes: 60, zone: 'Europe/Copenhagen', attendeeIds: ['mei', 'mei'], chairId: 'priya', status: 'active' },
    { id: 's2', day: '2026-11-11', start: '21:30', minutes: 60.5, zone: 'Europe/Copenhagen', attendeeIds: ['mei'], chairId: 'priya', status: 'active' },
    { id: 's3', day: '2026-11-11', start: '21:30', minutes: 0, zone: 'Europe/Copenhagen', attendeeIds: ['mei'], chairId: 'priya', status: 'active' },
    { id: 's4', day: '2026-11-11', start: '21:30', minutes: L.minutesMax + 1, zone: 'Europe/Copenhagen', attendeeIds: ['mei'], chairId: 'priya', status: 'active' },
    { id: 's5', day: '2026-11-11', start: '21:30', minutes: 60, zone: 'Europe/Copenhagen', attendeeIds: ['mei'], chairId: 'priya', status: 'active' },
  ], sitWarnings);
  assert.deepEqual(sittings.map((row) => row.id), ['s5'], 'only the fully readable sitting survives');
  assert.ok(sitWarnings.some((w) => w.includes('listed a person twice')), 'the duplicated attendee is refused by name');
  assert.equal(dweWallClock('24:00'), null, '24:00 is not a wall clock');
  assert.equal(dweWallClock('9.30'), null, 'a decimal is not a wall clock');
  assert.equal(dweSittingMinutes(60.5), null, 'a fraction is not a duration');
  assert.equal(dweZone('Mars/Olympus'), null, 'an unknown zone is never read as UTC');
});

test('ADR-0238 loaders: two active windows for one person are KEPT and refused on read — never silently latest-wins', () => {
  const state = fixture();
  state.dweWindows.push({
    id: 'w-mei-2', personId: 'mei', zone: 'Europe/Copenhagen', start: '08:00', end: '16:00',
    declaredOn: '2026-10-25', declaredById: 'leader',
    source: 'Stated by the person at the 1:1 on 2026-10-25; conflicts with the older row on purpose.',
    note: '', status: 'active', withdrawnOn: null, withdrawalReason: '', createdAt: T0, updatedAt: T0,
  });
  const report = buildDistributedEquity(state, { now: NOW, seat: null });
  assert.equal(report.totals.windowAmbiguityN, 1, 'the ambiguity is counted');
  const mei = report.people.find((row) => row.personId === 'mei');
  assert.equal(mei.outsideMinutes, null, 'the person’s burden is refused, not computed from one of the two');
  assert.ok(mei.unreadableReason.toLowerCase().includes('more than one active working window'), 'the reason is printed');
  assert.equal(report.figuresComplete, false, 'coverage is NOT certified over an ambiguous window');
});

/* ------------------------------------------------------- 3. exact placement */

test('ADR-0238 placement: outside minutes are exact integer minutes in the attendee’s own day', () => {
  const state = fixture();
  const report = buildDistributedEquity(state, { now: NOW, seat: null });
  const mei = report.people.find((row) => row.personId === 'mei');
  const samuel = report.people.find((row) => row.personId === 'samuel');
  const freya = report.people.find((row) => row.personId === 'freya');
  const priya = report.people.find((row) => row.personId === 'priya');
  assert.equal(mei.minutesTotal, 150, 'mei attended three sittings');
  assert.equal(mei.outsideMinutes, 105, '60 (late bridge) + 45 (the 15-minute overrun) — exact integers');
  assert.equal(samuel.outsideMinutes, 0, 'the late bridge is 15:30 in New York: inside samuel’s window, over 90 minutes held');
  assert.equal(freya.outsideMinutes, 0, 'not unknown: 0 outside, placed exactly');
  assert.equal(priya.outsideMinutes, 45, 'priya chaired and attended the overrun only');
  assert.equal(report.totals.attendanceMinutes, 360, 'the sittings × attendees, exactly');
  assert.equal(report.totals.outsideMinutes, 150, 'the workspace outside figure is the sum of the person figures');
});

test('ADR-0238 placement: the same sitting against a different attendee zone gives a different, both-correct answer', () => {
  const state = fixture();
  const report = buildDistributedEquity(state, { now: NOW, seat: null });
  const mei = report.people.find((row) => row.personId === 'mei');
  assert.equal(mei.unreadableSittingsN, 0, 'every placement resolved');
  // Cross-check the pure function directly at the instant level: 09:30 New
  // York on 2026-11-12 is 15:30 Copenhagen (EST−5, CET+1) — inside both
  // attendees' windows.
  const utcStart = resolveSittingStart('America/New_York', '2026-11-12', '09:30', null).utcMin;
  assert.equal(sittingOutsideMinutes({ zone: 'Europe/Copenhagen', start: '09:00', end: '17:00' }, { minutes: 30 }, utcStart).outside, 0,
    'inside mei’s Copenhagen day, where she received it');
  assert.equal(sittingOutsideMinutes({ zone: 'America/New_York', start: '09:00', end: '17:00' }, { minutes: 30 }, utcStart).outside, 0,
    'and inside samuel’s New York day, where it was convened');
  const utcLate = resolveSittingStart('Europe/Copenhagen', '2026-11-11', '21:30', null).utcMin;
  assert.equal(sittingOutsideMinutes({ zone: 'Europe/Copenhagen', start: '09:00', end: '17:00' }, { minutes: 60 }, utcLate).outside, 60,
    'the same wall-clock slot in Copenhagen is fully outside mei’s window');
  assert.equal(sittingOutsideMinutes({ zone: 'America/New_York', start: '09:00', end: '17:00' }, { minutes: 60 }, utcLate).outside, 0,
    '…while in New York it is a mid-afternoon call: the same sitting, two honest answers');
});

/* ------------------------------------------------------- 4. DST is refused */

test('ADR-0238 DST: a skipped start is refused, a doubled start must say which, and a window boundary in a gap refuses the reading', () => {
  const skipped = resolveSittingStart('Europe/Copenhagen', '2026-03-29', '02:30', null);
  assert.equal(skipped.ok, false);
  assert.equal(skipped.code, 'nonexistent');
  const doubled = resolveSittingStart('Europe/Copenhagen', '2026-10-25', '02:30', null);
  assert.equal(doubled.ok, false);
  assert.equal(doubled.code, 'unresolvable');
  const first = resolveSittingStart('Europe/Copenhagen', '2026-10-25', '02:30', 'first');
  const second = resolveSittingStart('Europe/Copenhagen', '2026-10-25', '02:30', 'second');
  assert.ok(first.ok && second.ok, 'naming the occurrence resolves it');
  assert.notEqual(first.utcMin, second.utcMin, 'the two occurrences are different instants, an hour apart');

  // An overnight window (20:00–02:30) whose END boundary does not exist on
  // 2026-03-29 in Copenhagen: a sitting that day cannot be placed against it —
  // refused, never moved to a neighbouring minute.
  const state = fixture();
  const endRow = state.dweWindows.find((row) => row.id === 'w-mei');
  endRow.start = '20:00';
  endRow.end = '02:30';
  state.dweSittings = [
    { id: 's-gap', day: '2026-03-29', start: '01:00', minutes: 60, zone: 'Europe/Copenhagen', attendeeIds: ['mei'], chairId: 'priya', status: 'active', note: '' },
  ];
  const report = buildDistributedEquity(state, { now: new Date('2026-03-30T12:00:00.000Z'), seat: null });
  const mei = report.people.find((row) => row.personId === 'mei');
  assert.equal(mei.outsideMinutes, null, 'the reading is refused');
  assert.ok(mei.unreadableReason.includes('does not exist'), 'the refusal names the calendar');
});

/* ------------------------------------------------------- 5. one person, once */

test('ADR-0238 matrix: an attendee on two lines is measured once, and the attribution buckets are exact', () => {
  const state = fixture();
  const report = buildDistributedEquity(state, { now: NOW, seat: null });
  const meiRows = report.people.filter((row) => row.personId === 'mei');
  assert.equal(meiRows.length, 1, 'one person, one row, measured once');
  const noLine = report.noDeclaredLine;
  // Attribution, bucket by bucket: samuel chairs mei through mei’s declared
  // project line (attributed); priya chairs freya, whose declared line belongs
  // to samuel, not priya (off the attendee’s graph); attendees convening their
  // own sittings fall to the self bucket. Nothing is split, nothing invented.
  assert.equal(noLine.selfConvenedMinutes, 90, 'samuel’s morning attendance + priya’s overrun attendance');
  assert.equal(noLine.selfConvenedOutside, 45);
  assert.equal(noLine.offGraphChairMinutes, 60, 'freya’s late-bridge attendance under a grand-manager chair');
  assert.equal(noLine.offGraphChairOutside, 0, 'the late bridge is a mid-afternoon call in New York: convened, but zero burden');
  assert.deepEqual(report.lines.map((row) => [row.lineId, row.convenedMinutes, row.convenedOutsideMinutes]),
    [['priya', 180, 105], ['samuel', 30, 0]], 'each line receives exactly the attendance its chair convened');
});

/* ------------------------------------------------------- 6. two claims apart */

test('ADR-0238 coverage: a refused sitting counts for nobody and the two claims are printed separately', () => {
  const state = fixture();
  state.dweSittings.push({
    id: 's-ghost', day: '2026-11-14', start: '10:00', minutes: 45, zone: 'Europe/Copenhagen',
    attendeeIds: ['mei', 'departed-ghost'], chairId: 'priya', status: 'active', note: 'names a leaver',
  });
  const report = buildDistributedEquity(state, { now: NOW, seat: null });
  assert.equal(report.totals.sittingsRefused, 1, 'the whole sitting is refused');
  assert.equal(report.refusedSittings[0].code, 'unknownAttendee');
  const mei = report.people.find((row) => row.personId === 'mei');
  assert.equal(mei.minutesTotal, 150, 'the refused sitting contributes to nobody’s total');
  assert.equal(report.countsReconcile, true, 'the parts still re-add over the valid sittings');
  assert.equal(report.figuresComplete, false, 'coverage is NOT certified — and that is a separate claim');
  assert.ok(report.coverageReasons.some((reason) => reason.includes('refused whole')));
});

test('ADR-0238 coverage: a person with no window is unknown, not zero, and the register says so', () => {
  const state = fixture();
  state.dweWindows = state.dweWindows.filter((row) => row.personId !== 'freya');
  const report = buildDistributedEquity(state, { now: NOW, seat: null });
  const freya = report.people.find((row) => row.personId === 'freya');
  assert.equal(freya.outsideMinutes, null);
  assert.equal(freya.windowRefusalCode, 'none');
  assert.ok(freya.unreadableReason.includes('unknown, not zero'));
  assert.equal(report.totals.unreadablePeopleN, 1);
  assert.equal(report.figuresComplete, false);
});

test('ADR-0238 coverage: a roster member who never attended is not a zero-filled population row', () => {
  const state = fixture();
  state.dweSittings = state.dweSittings.filter((row) => row.id !== 's-edge'); // priya stops attending
  const report = buildDistributedEquity(state, { now: NOW, seat: null });
  assert.equal(report.people.some((row) => row.personId === 'priya'), false, 'no invented row for a measured nobody');
  assert.equal(report.figuresComplete, true, 'coverage stays complete: every ATTENDEE is placed');
});

/* ------------------------------------------------------- 7. the equity verdict */

test('ADR-0238 equity: below the floors the verdict is refused with its reason; above them the shares are exact', () => {
  const state = fixture();
  const report = buildDistributedEquity(state, { now: NOW, seat: null });
  assert.ok(report.workspaceEquity.measured, 'above the floors the verdict is measured');
  assert.equal(report.workspaceEquity.peopleN, 4, 'mei, samuel, freya and priya all attended');
  assert.equal(report.workspaceEquity.evenShareBp, 2500, 'round(10000 / 4)');
  assert.equal(report.workspaceEquity.topShareBp, 7000, 'mei: 105 of 150, exactly');
  assert.equal(report.workspaceEquity.verdict, 'concentrated', '7000 ≥ 2 × 2500 — the Copenhagen side carries it');

  // Push mei's burden up and the same exact shares read concentrated.
  const skewed = fixture();
  skewed.dweSittings.push({ id: 's-late2', day: '2026-11-14', start: '21:30', minutes: 60, zone: 'Europe/Copenhagen', attendeeIds: ['mei'], chairId: 'priya', status: 'active', note: 'follow-up' });
  const skewReport = buildDistributedEquity(skewed, { now: NOW, seat: null });
  assert.equal(skewReport.workspaceEquity.topShareBp, 7857, 'mei: 165 of 210, exactly');
  assert.equal(skewReport.workspaceEquity.verdict, 'concentrated');

  const tiny = fixture();
  tiny.dweSittings = tiny.dweSittings.slice(0, 2); // two sittings < the floor of three
  const small = buildDistributedEquity(tiny, { now: NOW, seat: null });
  assert.equal(small.workspaceEquity.measured, false);
  assert.ok(small.workspaceEquity.reason.includes('below the 3-sitting floor'), 'the floor is named');
  assert.equal(small.workspaceEquity.verdict, null, 'no verdict is printed below its floors');
});

test('ADR-0238 equity: an even burden reads distributed, not concentrated', () => {
  const state = fixture();
  state.settings = { ...state.settings, dweEquityMinPeople: 2 };
  state.dweSittings = [
    { id: 'e1', day: '2026-11-11', start: '21:30', minutes: 60, zone: 'Europe/Copenhagen', attendeeIds: ['mei', 'priya'], chairId: 'priya', status: 'active', note: '' },
    { id: 'e2', day: '2026-11-12', start: '21:30', minutes: 60, zone: 'Europe/Copenhagen', attendeeIds: ['mei', 'priya'], chairId: 'priya', status: 'active', note: '' },
    { id: 'e3', day: '2026-11-13', start: '21:30', minutes: 60, zone: 'Europe/Copenhagen', attendeeIds: ['mei', 'priya'], chairId: 'priya', status: 'active', note: '' },
  ];
  const report = buildDistributedEquity(state, { now: NOW, seat: null });
  assert.equal(report.workspaceEquity.peopleN, 2, 'mei and priya carry the same windows in the same zone');
  assert.equal(report.workspaceEquity.topShareBp, report.workspaceEquity.evenShareBp, 'two identical burdens share exactly');
  assert.equal(report.workspaceEquity.verdict, 'distributed');
});

/* ------------------------------------------------------- 8. RULE-DWE-01 */

test('ADR-0238 rule internals: the condition set is a pure function of the reader and the live matrix', () => {
  const state = fixture();
  state.settings = { ...state.settings, dweOutsideMinutesCeiling: 60 };
  const report = buildDistributedEquity(state, { now: NOW, seat: null });
  assert.equal(report.totals.overCeilingN, 1, 'mei: 105 trailing outside minutes over a 60-minute ceiling');
  const matrix = distributedEquityMatrix(state, NOW, state.settings);
  const built = distributedEquityConditions(report, { today: '2026-11-17', matrix });
  assert.equal(built.conditions.length, 1, 'one person over the ceiling is one condition');
  assert.equal(built.conditions[0].kind, 'unsociable-over-ceiling');
  assert.equal(built.conditions[0].personId, 'mei');
  assert.deepEqual(built.conditions[0].seatIds, ['priya'], 'the apex above mei’s lines and the chair’s line');
  assert.ok(built.conditions[0].signature.startsWith('dwe1:over-ceiling:mei:'));
  assert.equal(built.observations.length, 0, 'no observations when every window is readable');
  assert.equal(typeof distributedEquityRule, 'function');
  assert.equal(distributedEquityRule.id, 'distributedEquityRule');
  assert.equal(dweAskSignature('mei', '2026-10-21'), 'dwe1:over-ceiling:mei:2026-10-21');
});

test('ADR-0238 rule: one opaque ask to the joint apex above the convening and holding lines, idempotent, self-closing, and paused on every path', () => {
  const state = fixture();
  state.settings = { ...state.settings, dweOutsideMinutesCeiling: 60 };
  const event = { type: 'distributedEquity.sitting.declared', entity: 'workspace', entityId: 's-late' };
  const run = (draft, suffix) => distributedEquityRule(draft, {
    event, now: NOW, idFactory: (prefix) => `${prefix}-${suffix}`, derived: false,
    logEvent: () => {}, recordEffect: () => {},
  });

  const draft = JSON.parse(JSON.stringify(state));
  run(draft, 'run-1');
  const asks = indexDistributedEquityAsks(draft);
  assert.equal(asks.length, 1, 'one ask, filed once');
  const task = draft.delegations.find((row) => row.title.includes('distributed-work equity register'));
  assert.ok(task, 'the ask is a delegation');
  assert.ok(!task.title.includes('mei') && !task.title.includes('minute'), 'the ask title is opaque: no person, no minutes');
  assert.ok(!JSON.stringify(task).includes('Mei'), 'the ask names nobody');
  assert.equal(task.personId, 'priya', 'the joint apex above mei’s lines and the chair’s line');
  assert.equal(task.authority, 'act-inform');

  const again = JSON.parse(JSON.stringify(draft));
  run(again, 'run-2');
  assert.equal(indexDistributedEquityAsks(again).length, 1, 'no duplicate ask');

  const cleared = JSON.parse(JSON.stringify(draft));
  cleared.settings = { ...cleared.settings, dweOutsideMinutesCeiling: 600 };
  run(cleared, 'run-3');
  assert.equal(indexDistributedEquityAsks(cleared).filter((row) => row.task.status === 'active').length, 0, 'the ask closed with its condition');

  const paused = JSON.parse(JSON.stringify(draft));
  paused.delegations = [];
  paused.settings = { ...paused.settings, dweAutoPropagate: false };
  const pausedOut = run(paused, 'run-4');
  assert.deepEqual(pausedOut, [], 'a pause is a pause, including on an explicit scan');
});

test('ADR-0238 rule: an unreadable attendee is observed as an identity-free marker, never asked about', () => {
  const state = fixture();
  state.dweWindows = state.dweWindows.filter((row) => row.personId !== 'freya');
  const draft = JSON.parse(JSON.stringify(state));
  const event = { type: 'distributedEquity.sitting.declared', entity: 'workspace', entityId: 's-late' };
  const run = (draft2) => distributedEquityRule(draft2, { event, now: NOW, idFactory: (prefix) => `${prefix}-obs`, derived: false, logEvent: () => {}, recordEffect: () => {} });
  run(draft);
  const marker = draft.dweMarkers.find((row) => row.key.includes('freya') && row.key.includes('unreadable'));
  assert.ok(marker, 'one marker per (person, window period)');
  assert.ok(!marker.detail.includes('Freya'), 'the marker carries no identity');
  assert.equal(indexDistributedEquityAsks(draft).length, 0, 'nobody was asked');
  const again = JSON.parse(JSON.stringify(draft));
  run(again);
  assert.equal(again.dweMarkers.length, draft.dweMarkers.length, 'the observation is idempotent by key');
});

/* ------------------------------------------------------- 9. the door */

test('ADR-0238 door: an unsourced window, an unknown zone, a future day and an unreadable wall clock are refused', () => {
  const { api } = makeEnv();
  const unsourced = api.distributedEquityDeclareWindow({ personId: 'mei', zone: 'Europe/Copenhagen', start: '09:00', end: '18:00', declaredOn: '2026-11-17', source: 'trust me' });
  assert.equal(unsourced.ok, false);
  assert.equal(unsourced.refusal, 'distributedEquity:source-missing');

  const badZone = api.distributedEquityDeclareWindow({ personId: 'mei', zone: 'Mars/Olympus', start: '09:00', end: '18:00', declaredOn: '2026-11-17', source: 'Stated by the person at the 1:1 on 2026-11-17.' });
  assert.equal(badZone.ok, false);
  assert.equal(badZone.refusal, 'distributedEquity:zone-invalid');

  const future = api.distributedEquityDeclareWindow({ personId: 'mei', zone: 'Europe/Copenhagen', start: '09:00', end: '18:00', declaredOn: '2026-12-01', source: 'Stated by the person at the 1:1 on 2026-11-17.' });
  assert.equal(future.ok, false);
  assert.equal(future.refusal, 'distributedEquity:day-future');

  const badClock = api.distributedEquityDeclareWindow({ personId: 'mei', zone: 'Europe/Copenhagen', start: '09:60', end: '18:00', declaredOn: '2026-11-17', source: 'Stated by the person at the 1:1 on 2026-11-17.' });
  assert.equal(badClock.ok, false);
  assert.equal(badClock.refusal, 'distributedEquity:wall-clock-invalid');
});

test('ADR-0238 door: declaring a window supersedes the active one in the open, and a withdrawal is final', () => {
  const { api, store } = makeEnv();
  const declared = api.distributedEquityDeclareWindow({ personId: 'mei', zone: 'Europe/Copenhagen', start: '10:00', end: '18:00', declaredOn: '2026-11-17', source: 'Stated by the person at the 1:1 on 2026-11-17; the hours moved for the winter.' });
  assert.equal(declared.ok, true, declared.error || '');
  const rows = normalizeDweWindows(store.state.dweWindows, []);
  const active = rows.filter((row) => row.personId === 'mei' && row.status === 'active');
  assert.equal(active.length, 1, 'exactly one live window');
  assert.equal(active[0].start, '10:00');
  assert.equal(rows.filter((row) => row.personId === 'mei' && row.status === 'superseded').length, 1, 'the older row is history, not silence');

  const withdrawn = api.distributedEquityWithdrawWindow({ windowId: active[0].id, on: '2026-11-17', reason: 'The person changed teams and the working agreement no longer applies.' });
  assert.equal(withdrawn.ok, true, withdrawn.error || '');
  const after = normalizeDweWindows(store.state.dweWindows, []).filter((row) => row.personId === 'mei' && row.status === 'active');
  assert.equal(after.length, 0, 'the window is gone');
  const report = buildDistributedEquity(store.state, { now: NOW, seat: null });
  const mei = report.people.find((row) => row.personId === 'mei');
  assert.equal(mei.outsideMinutes, null, 'the burden is unknown again, not zero');

  const redeclare = api.distributedEquityWithdrawWindow({ windowId: active[0].id, on: '2026-11-17', reason: 'Trying to withdraw the same window twice, which history must refuse.' });
  assert.equal(redeclare.ok, false, 'a withdrawn row is never rewritten');
});

test('ADR-0238 door: an off-roster attendee refuses the whole sitting, and an ambiguous start must name its occurrence', () => {
  const { api, store } = makeEnv();
  const ghost = api.distributedEquityDeclareSitting({ day: '2026-11-16', start: '10:00', minutes: 30, zone: 'Europe/Copenhagen', attendeeIds: ['mei', 'ghost'], chairId: 'priya' });
  assert.equal(ghost.ok, false);
  assert.equal(ghost.refusal, 'distributedEquity:attendee-not-on-roster');

  const future = api.distributedEquityDeclareSitting({ day: '2026-12-01', start: '10:00', minutes: 30, zone: 'Europe/Copenhagen', attendeeIds: ['mei'], chairId: 'priya' });
  assert.equal(future.ok, false);
  assert.equal(future.refusal, 'distributedEquity:day-future');

  // 2026-10-25 02:30 occurs twice in Copenhagen: the record must name the fold,
  // and the reader resolves it on read.
  const folded = api.distributedEquityDeclareSitting({ day: '2026-10-25', start: '02:30', minutes: 30, zone: 'Europe/Copenhagen', attendeeIds: ['mei'], chairId: 'priya', fold: 'first' });
  assert.equal(folded.ok, true, folded.error || '');

  const retracted = api.distributedEquityRetractSitting({ sittingId: folded.id, reason: 'Recorded against the wrong occurrence of the doubled hour; the corrected sitting follows.' });
  assert.equal(retracted.ok, true, retracted.error || '');
  const report = buildDistributedEquity(store.state, { now: NOW, seat: null });
  assert.equal(report.totals.sittingsRetracted, 1, 'the retraction is counted, not deleted');
});

/* ------------------------------------------------------- 10. CSV + panel + wiring */

test('ADR-0238 CSV #179: aggregate, identity-free, blank with a reason rather than a zero', () => {
  const state = fixture();
  state.dweWindows = state.dweWindows.filter((row) => row.personId !== 'freya');
  const exported = exportWorkspaceCsv(state, DWE_CSV_SCOPE, { now: NOW });
  assert.equal(exported.ok, true, exported.error || exported.reason || '');
  const text = exported.csv.replace(/\r/g, '');
  for (const leak of ['mei', 'priya', 'samuel', 'freya', 'Europe/Copenhagen', 'America/New_York', '21:30', 'person_id', 'window_']) {
    assert.ok(!text.includes(leak), `the export does not leak “${leak}”`);
  }
  const parsed = parseCsv(text);
  const header = parsed.headers;
  for (const expected of ['as_of', 'row_kind', 'key', 'verdict', 'complete', 'blank_reason']) {
    assert.ok(header.includes(expected), `the ${expected} column exports`);
  }
  const rows = parsed.rows.map((cells) => Object.fromEntries(header.map((key, i) => [key, cells[i]])));
  assert.equal(rows[0].row_kind, 'summary');
  assert.equal(rows[0].key, 'workspace');
  for (const row of rows.slice(1)) {
    assert.match(row.key, /^L\d{2}$/, 'lines export as stable L-codes');
    assert.equal(row.row_kind, 'line');
  }
  assert.equal(rows[0].complete, 'no');
  assert.ok(rows[0].blank_reason.length > 0, 'the coverage gap travels with the summary row');
  assert.equal(rows[0].outside_minutes, '150', 'the placed figure exports as the reader’s own integer');
});

test('ADR-0238 panel: the printed figures are the reader’s own figures, cell by cell', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'https://leados.test/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.localStorage = dom.window.localStorage;
  global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  try {
    const { store } = makeEnv();
    const api = guardApi(createApi(store, { now: () => new Date(T0) }), store, { now: () => new Date(T0).getTime() });
    const report = api.distributedEquityReport();
    assert.equal(report.ok, true);
    const view = renderDistributedEquity({
      api,
      query: new URLSearchParams('view=burden'),
      refresh: () => {},
      navigate: () => {},
    });
    dom.window.document.getElementById('view').appendChild(view);
    const mei = report.people.find((row) => row.personId === 'mei');
    const printed = dom.window.document.querySelector('[data-testid="dwe-outside-mei"]');
    assert.ok(printed, 'the person cell is printed');
    assert.equal(printed.getAttribute('data-minutes'), String(mei.outsideMinutes), 'display == computed, exactly');
    const held = dom.window.document.querySelector('[data-testid="dwe-held-mei"]');
    assert.equal(held.getAttribute('data-minutes'), String(mei.minutesTotal));
    const summary = dom.window.document.querySelector('[data-testid="dwe-count-outside"]');
    assert.ok(summary.textContent.includes('2 h 30 min'), 'the workspace outside figure (150 min) is printed from the reader');
    const workspaceVerdict = dom.window.document.querySelector('[data-testid="dwe-workspace-verdict"]');
    assert.ok(workspaceVerdict, 'the workspace verdict is printed above its floors');
  } finally {
    delete global.window; delete global.document; delete global.Element;
    delete global.HTMLElement; delete global.Node; delete global.localStorage;
    delete global.requestAnimationFrame;
  }
});

test('ADR-0238 wiring: the reads are registered safe, the rights exist, and the api surface is exposed', () => {
  assert.ok(SAFE_READS.has('distributedEquityReport'));
  assert.ok(SAFE_READS.has('distributedEquityAttentionCount'));
  const { api } = makeEnv();
  for (const name of ['distributedEquityReport', 'distributedEquityAttentionCount', 'distributedEquityDeclareWindow', 'distributedEquityWithdrawWindow', 'distributedEquityDeclareSitting', 'distributedEquityRetractSitting', 'distributedEquitySetConventions', 'distributedEquityScan']) {
    assert.equal(typeof api[name], 'function', `${name} is on the api`);
  }
  assert.equal(typeof DWE_RIGHTS.READ, 'string');
  assert.equal(typeof DWE_RIGHTS.DECLARE, 'string');
});

test('ADR-0238 wiring: the conventions setter refuses out-of-bounds values instead of clamping them', () => {
  const { api, store } = makeEnv();
  const refused = api.distributedEquitySetConventions({ dweWindowDays: 500 });
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal, 'distributedEquity:convention-out-of-bounds');
  const set = api.distributedEquitySetConventions({ dweOutsideMinutesCeiling: 240, dweWindowDays: 14 });
  assert.equal(set.ok, true, set.error || '');
  assert.equal(store.state.settings[DWE_SETTING_KEYS.outsideMinutesCeiling], 240);
  assert.equal(store.state.settings[DWE_SETTING_KEYS.windowDays], 14);
});

test('ADR-0238 demo: the distributed roster seeds windows and sittings the reader can read', () => {
  const demo = normalizeState(buildDemoState(new Date('2026-11-17T09:00:00.000Z')), { now: new Date('2026-11-17T09:00:00.000Z') }).state;
  assert.ok(Array.isArray(demo.dweWindows) && demo.dweWindows.length >= 5, 'every demo attendee carries a sourced window');
  assert.ok(Array.isArray(demo.dweSittings) && demo.dweSittings.length >= 5, 'the demo carries a real sitting pattern');
  const report = buildDistributedEquity(demo, { now: new Date('2026-11-17T09:00:00.000Z'), seat: null });
  assert.ok(report.ok);
  assert.ok(report.totals.sittingsValid >= 5);
  assert.ok(report.totals.outsideMinutes > 0, 'the demo burden is a real computed figure, not a seeded number');
  assert.equal(report.totals.sittingsRefused, 0, 'every demo sitting resolves');
  assert.equal(report.figuresComplete, true, 'every demo attendee carries a readable window');
});

import { buildDemoState } from '../../app/core/demo.js';
