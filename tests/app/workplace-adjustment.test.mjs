// ADR-0241 — Workplace Adjustment & Functional-Restriction Register (Schema v195).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — five empty ledgers and four declared
//      conventions, and no restriction, adjustment, acknowledgement or review
//      inferred from an absence, a plan, a roster or an existing report;
//   2. the loaders are FAIL-CLOSED — an unsourced restriction, a limit that does
//      not match its domain's unit, a withdrawal with half its facts, an
//      operational day before the agreement, and a diagnosis-shaped field are
//      DROPPED with counted warnings and never repaired; a diagnosis field is
//      dropped WHOLE rather than stripped;
//   3. the arithmetic is EXACT — night minutes inside a DECLARED window are
//      whole minutes computed against a wrapping window, a night shift is a real
//      span and not a rejected one, and consecutive spells across TWO managers
//      are merged before a minimum-rest limit is tested;
//   4. AGREED IS NOT IN PLACE — an adjustment with an agreement day and no
//      operational day is its own state, the exact days between the two are
//      printed, and the median is refused below its declared floor;
//   5. A TESTED LIMIT IS NOT AN UNTESTED ONE — a lifting limit is never printed
//      as clear, an advisory instrument is never tested, and silence about
//      declared work is a printed refusal rather than a pass;
//   6. DECLINED IS NOT UNANSWERED — a recorded refusal with a reason is its own
//      state, and a later adjustment outranks it;
//   7. TIME NEVER LIFTS A RESTRICTION — a passed review day prints
//      `review-overdue` and the door REFUSES a withdrawal with no recorded review;
//   8. the MATRIX is correct — a conflict declared on the second line is caught,
//      every active line owes its own acknowledgement, a person is counted once,
//      and the rule asks the JOINT APEX above the lines and never the person;
//   9. RULE-WPA-01 is idempotent, capped, self-closing, pause-governed on every
//      path, opaque in its ask text, and observes identity-free where nobody can
//      be asked;
//  10. the CSV boundary is aggregate and identity-free, and the panel prints the
//      reader's own figures cell by cell (display == computed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildMatrix, matrixJointApex } from '../../app/core/domain/matrix.js';
import { buildWorkplaceAdjustment } from '../../app/core/domain/workplaceAdjustment.js';
import {
  normalizeWpaRestrictions,
  normalizeWpaAdjustments,
  normalizeWpaAcknowledgements,
  normalizeWpaReviews,
  normalizeWpaNightWindow,
  wpaLimit,
  wpaWallClock,
} from '../../app/core/domain/workplaceAdjustmentSchema.js';
import {
  nightMinutesInShift,
  shiftSpanMinutes,
  restGaps,
  mergeIntervals,
  exactMedian,
  testMaxLimit,
  testMinLimit,
} from '../../app/core/domain/workplaceAdjustmentMath.js';
import {
  workplaceAdjustmentRule,
  workplaceAdjustmentConditions,
  indexWorkplaceAdjustmentAsks,
  wpaAskSignature,
} from '../../app/core/domain/workplaceAdjustmentRules.js';
import {
  WPA_CSV_COLUMNS,
  WPA_CSV_SCOPE,
  WPA_DOMAIN_BY_KEY,
  WPA_RIGHTS,
  WPA_SETTING_KEYS,
} from '../../app/core/domain/workplaceAdjustmentRegistry.js';
import { workplaceAdjustmentCsvRows } from '../../app/core/domain/workplaceAdjustmentReport.js';
import { renderAdjustments } from '../../app/views/adjustments.js';

const NOW = new Date('2026-11-17T09:00:00.000Z');
const T0 = NOW.toISOString();
const at = (day) => `${day}T00:00:00.000Z`;

// 23:00 → 06:00 declared on the PROJECT line: 420 minutes of night.
const NIGHT_SHIFT = {
  id: 'sh-night', personId: 'sam', lineManagerId: 'freya', zone: 'Europe/Copenhagen',
  start: '2026-11-10T23:00', end: '2026-11-11T06:00', startOffsetMin: 60, endOffsetMin: 60,
  source: 'roster', note: '', declaredOn: '2026-11-09', declaredAt: at('2026-11-09'),
  declaredById: 'leader', via: 'operator',
};
// 08:00 → 16:00 declared on the HOME line: no night minutes, 480 minutes long.
const DAY_SHIFT = {
  id: 'sh-day', personId: 'sam', lineManagerId: 'mei', zone: 'Europe/Copenhagen',
  start: '2026-11-12T08:00', end: '2026-11-12T16:00', startOffsetMin: 60, endOffsetMin: 60,
  source: 'roster', note: '', declaredOn: '2026-11-11', declaredAt: at('2026-11-11'),
  declaredById: 'leader', via: 'operator',
};

const person = (id, managerId) => ({
  id, name: id[0].toUpperCase() + id.slice(1), managerId, role: 'Operator',
  status: 'active', startDate: '2026-01-01T09:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:00:00.000Z',
});

/**
 * priya (leader) → mei (manager) → sam
 * mei ALSO answers to freya on a declared project line, so sam has two active
 * lines and both owe an acknowledgement. The night shift is declared on the
 * PROJECT line and the day shift on the home line: a single-line reader sees
 * one of them and calls the limit clear.
 */
function fixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.people = [person('priya', null), person('mei', 'priya'), person('sam', 'mei'), person('freya', 'priya')];
  raw.reportingLines = [{
    id: 'rl-sam-freya', personId: 'sam', managerId: 'freya', kind: 'project', shareH: 30,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  const restriction = (id, personId, domain, instrument, limitValue, declaredOn, reviewOn = null) => ({
    id, personId, domain, instrument,
    statement: 'Must not do the restricted thing while the instrument stands.',
    sourceRef: 'A written instrument of 2026-10-01 recording the limitation in its own words.',
    limitUnit: WPA_DOMAIN_BY_KEY[domain].limit,
    limitValue,
    declaredOn,
    declaredAt: at(declaredOn),
    declaredById: 'leader',
    reviewOn,
    note: '',
    status: 'active',
    withdrawnOn: null, withdrawalReason: '', withdrawnById: '',
    createdAt: at(declaredOn), updatedAt: at(declaredOn),
  });
  raw.wpaRestrictions = overrides.restrictions || [
    restriction('r-night', 'sam', 'no-night-work', 'fit-note', null, '2026-10-01'),
  ];
  raw.wpaAdjustments = overrides.adjustments || [];
  raw.wpaAcknowledgements = overrides.acknowledgements || [];
  raw.wpaReviews = overrides.reviews || [];
  raw.wpaMarkers = [];
  raw.workRestShifts = overrides.shifts || [NIGHT_SHIFT, DAY_SHIFT];
  return raw;
}

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildWorkplaceAdjustment(load(raw), { now: NOW, seat: null, ...opts });

/** A real store over an in-memory blob, so the door is exercised as the app uses it. */
function harness(raw) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(load(raw))]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-t-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  return { store, storage, api };
}

/* ------------------------------------------------------------ 1. schema */

test('schema v195 is additive: five empty ledgers, four conventions, nothing inferred', () => {
  const empty = createEmptyState(T0);
  assert.equal(SCHEMA_VERSION, 195);
  for (const key of ['wpaRestrictions', 'wpaAdjustments', 'wpaAcknowledgements', 'wpaReviews', 'wpaMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
    assert.deepEqual(empty[key], [], `${key} starts empty`);
  }
  // Settings defaults appear only after normalization, so the conventions are
  // read through the real state path rather than off the bare empty state.
  const loaded = normalizeState(createEmptyState(T0), { now: NOW }).state;
  assert.equal(loaded.settings[WPA_SETTING_KEYS.autoPropagate], true);
  assert.equal(loaded.settings[WPA_SETTING_KEYS.adjustmentGraceDays], 14);
  assert.equal(loaded.settings[WPA_SETTING_KEYS.reviewWarnDays], 14);
  assert.equal(loaded.settings[WPA_SETTING_KEYS.privacyFloor], 3);
  assert.equal(loaded.settings.wpaNightStartMinute, 1320);
  assert.equal(loaded.settings.wpaNightEndMinute, 360);

  const previous = { ...createEmptyState(T0), schemaVersion: 194 };
  delete previous.wpaRestrictions; delete previous.wpaAdjustments; delete previous.wpaAcknowledgements;
  delete previous.wpaReviews; delete previous.wpaMarkers;
  const { raw, applied } = migrate(previous);
  assert.deepEqual(applied, ['194 → 195']);
  assert.equal(raw.schemaVersion, 195);
  // NOTHING IS INFERRED. The upgrade invents no restriction from the absence of a
  // plan, the roster, or a return-to-work record — and a workspace with a
  // reboarding plan on file does not thereby carry a limitation.
  for (const key of ['wpaRestrictions', 'wpaAdjustments', 'wpaAcknowledgements', 'wpaReviews', 'wpaMarkers']) {
    assert.deepEqual(raw[key], []);
  }
});

test('a workspace with work/rest shifts but no restriction reads an honest empty register', () => {
  const raw = fixture({ restrictions: [] });
  const report = read(raw);
  assert.equal(report.totals.live, 0);
  assert.equal(report.totals.conflictN, 0);
  // An empty register is complete: nothing was needed and nothing was missing.
  assert.equal(report.figuresComplete, true, report.incompleteReasons.join(' '));
});

/* ----------------------------------------------------------- 2. loaders */

test('loaders are fail-closed: unsourced, unit-mismatched and diagnosis-bearing rows are dropped and counted', () => {
  const warnings = [];
  const bad = normalizeWpaRestrictions([
    // no written source reference at all
    { id: 'a', personId: 'sam', domain: 'no-night-work', instrument: 'fit-note', statement: 'A limitation long enough to read.', sourceRef: '', declaredOn: '2026-10-01', declaredAt: at('2026-10-01'), declaredById: 'leader', status: 'active' },
    // a gram value on an hours domain
    { id: 'b', personId: 'sam', domain: 'max-shift-hours', instrument: 'fit-note', statement: 'A limitation long enough to read.', sourceRef: 'A written instrument recording the limitation.', limitUnit: 'minutes', limitValue: 5000, declaredOn: '2026-10-01', declaredAt: at('2026-10-01'), declaredById: 'leader', status: 'active' },
    // a number attached to a pure prohibition
    { id: 'c', personId: 'sam', domain: 'no-night-work', instrument: 'fit-note', statement: 'A limitation long enough to read.', sourceRef: 'A written instrument recording the limitation.', limitValue: 60, declaredOn: '2026-10-01', declaredAt: at('2026-10-01'), declaredById: 'leader', status: 'active' },
    // a diagnosis smuggled onto the row
    { id: 'd', personId: 'sam', domain: 'no-night-work', instrument: 'fit-note', statement: 'A limitation long enough to read.', sourceRef: 'A written instrument recording the limitation.', declaredOn: '2026-10-01', declaredAt: at('2026-10-01'), declaredById: 'leader', status: 'active', diagnosis: 'something clinical' },
    // a review day before the declaration
    { id: 'e', personId: 'sam', domain: 'no-night-work', instrument: 'fit-note', statement: 'A limitation long enough to read.', sourceRef: 'A written instrument recording the limitation.', declaredOn: '2026-10-10', declaredAt: at('2026-10-10'), declaredById: 'leader', status: 'active', reviewOn: '2026-10-01' },
  ], warnings);
  assert.deepEqual(bad, [], 'every unreadable row is dropped');
  assert.equal(warnings.length, 2);
  assert.match(warnings.join(' '), /could not be read exactly/);
  assert.match(warnings.join(' '), /diagnosis-shaped field/);
});

test('a unit mismatch is refused at the door by the same rule the loader enforces', () => {
  assert.deepEqual(wpaLimit('max-shift-hours', 480), { unit: 'minutes', value: 480 });
  assert.equal(wpaLimit('max-shift-hours', 480.5), null, 'a fractional minute is not a minute');
  assert.equal(wpaLimit('max-shift-hours', -1), null);
  assert.deepEqual(wpaLimit('manual-handling', 5000), { unit: 'grams', value: 5000 });
  assert.deepEqual(wpaLimit('no-night-work', null), { unit: null, value: null });
  assert.equal(wpaLimit('no-night-work', 60), null, 'a prohibition cannot carry a number');
});

test('an adjustment with an operational day before its agreement, and half a retirement, are dropped', () => {
  const warnings = [];
  const restrictions = normalizeWpaRestrictions(fixture().wpaRestrictions, []);
  const rows = normalizeWpaAdjustments([
    { id: 'x', restrictionId: 'r-night', kind: 'equipment', detail: 'An aid long enough to read.', agreedOn: '2026-11-10', agreedAt: at('2026-11-10'), agreedById: 'leader', operationalOn: '2026-11-01', status: 'active' },
    { id: 'y', restrictionId: 'r-night', kind: 'equipment', detail: 'An aid long enough to read.', agreedOn: '2026-11-01', agreedAt: at('2026-11-01'), agreedById: 'leader', status: 'retired', retiredOn: '2026-11-10' },
    { id: 'z', restrictionId: 'unknown', kind: 'equipment', detail: 'An aid long enough to read.', agreedOn: '2026-11-01', agreedAt: at('2026-11-01'), agreedById: 'leader', status: 'active' },
  ], restrictions, warnings);
  assert.deepEqual(rows, []);
  assert.match(warnings.join(' '), /adjustment row\(s\) could not be read exactly/);
});

test('a continue review with no next review day is refused, and a person cannot acknowledge their own line', () => {
  const restrictions = normalizeWpaRestrictions(fixture().wpaRestrictions, []);
  const reviews = normalizeWpaReviews([
    { id: 'rv', restrictionId: 'r-night', decision: 'continue', basis: 'The instrument still stands and the person agrees.', reviewedOn: '2026-11-01', reviewedAt: at('2026-11-01'), reviewedById: 'leader', nextReviewOn: null },
  ], restrictions, []);
  assert.deepEqual(reviews, [], 'a continue that names no next review day would fall out of the cycle for ever');

  const acks = normalizeWpaAcknowledgements([
    { id: 'k', restrictionId: 'r-night', lineManagerId: 'sam', acknowledgedOn: '2026-11-01', acknowledgedAt: at('2026-11-01'), acknowledgedById: 'leader' },
  ], restrictions, []);
  assert.deepEqual(acks, [], 'the person carrying the restriction cannot sign for a line that holds them');
});

/* ---------------------------------------------------------- 3. arithmetic */

test('night minutes are exact against a WRAPPING declared window', () => {
  // 22:00 → 06:00 declared; a 23:00 → 05:00 shift is 360 minutes, all of it night.
  assert.equal(nightMinutesInShift(23 * 60, 29 * 60, 22 * 60, 6 * 60), 360);
  // A 20:00 → 23:30 shift carries 90 minutes inside the window, not a boolean.
  assert.equal(nightMinutesInShift(20 * 60, 23 * 60 + 30, 22 * 60, 6 * 60), 90);
  // A 05:00 → 09:00 shift carries 60 minutes of night at its start.
  assert.equal(nightMinutesInShift(5 * 60, 9 * 60, 22 * 60, 6 * 60), 60);
  // A purely daytime shift carries none.
  assert.equal(nightMinutesInShift(8 * 60, 16 * 60, 22 * 60, 6 * 60), 0);
  // A shift spanning more than a day still takes the same code path.
  assert.equal(nightMinutesInShift(0, 48 * 60, 22 * 60, 6 * 60), 960);
});

test('a night span is a real span, not a rejected one, and a zero-length span is refused', () => {
  assert.equal(shiftSpanMinutes(23 * 60, 6 * 60), 420, 'end before start crosses midnight');
  assert.equal(shiftSpanMinutes(8 * 60, 16 * 60), 480);
  assert.equal(shiftSpanMinutes(9 * 60, 9 * 60), null, 'an empty span is unreadable');
});

test('the declared night window may wrap, but a zero-length night is refused', () => {
  assert.deepEqual(normalizeWpaNightWindow({ startMinute: 22 * 60, endMinute: 6 * 60 }), { startMinute: 1320, endMinute: 360 });
  assert.equal(normalizeWpaNightWindow({ startMinute: 22 * 60, endMinute: 22 * 60 }), null, 'a zero-length night would make every test vacuously pass');
  assert.equal(normalizeWpaNightWindow({ startMinute: 0, endMinute: 10 }), null, 'a ten-minute night is not a night window');
  assert.deepEqual(normalizeWpaNightWindow({}), { startMinute: 1320, endMinute: 360 });
});

test('spells across two managers are MERGED before a minimum-rest limit is tested', () => {
  const merged = mergeIntervals([[0, 480], [960, 1440]]);
  assert.deepEqual(merged, [[0, 480], [960, 1440]]);
  // Touching spans are one continuous spell of work, not a zero-minute rest.
  assert.deepEqual(mergeIntervals([[0, 480], [480, 960]]), [[0, 960]]);
  const gaps = restGaps([[0, 480], [840, 1440]]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].minutes, 360);
  assert.equal(testMinLimit(gaps[0].minutes, 660).verdict, 'breached');
  assert.equal(testMinLimit(gaps[0].minutes, 360).verdict, 'within');
});

test('limit tests have three outcomes and never turn an unmeasurable one into a pass', () => {
  assert.deepEqual(testMaxLimit(540, 480), { verdict: 'breached', measuredMinutes: 540, overByMinutes: 60 });
  assert.deepEqual(testMaxLimit(480, 480), { verdict: 'within', measuredMinutes: 480, overByMinutes: 0 });
  assert.equal(testMaxLimit(null, 480).verdict, 'unproven');
  assert.equal(testMinLimit(null, 480).verdict, 'unproven');
});

test('the median is exact and a half day is printed as a half day, never rounded', () => {
  assert.deepEqual(exactMedian([1, 2, 3]), { value: 2, halves: false });
  assert.deepEqual(exactMedian([1, 2]), { value: 1.5, halves: true });
  assert.equal(exactMedian([]), null);
});

/* --------------------------------------------- 4/5/6. state derivations */

test('agreed is not in place: the exact days are printed and the state is its own', () => {
  // The restriction is on a domain the record cannot test, so the state under
  // test is the only thing deciding the row — a conflict would outrank it, by
  // design, and is asserted separately.
  const raw = fixture({
    restrictions: [{ ...fixture().wpaRestrictions[0], domain: 'manual-handling', instrument: 'ergonomic-assessment', limitUnit: 'grams', limitValue: 5000 }],
    adjustments: [{
      id: 'adj-1', restrictionId: 'r-night', kind: 'task-substitution',
      detail: 'Night cover was taken off this person and given to a volunteer.',
      agreedOn: '2026-11-05', agreedAt: at('2026-11-05'), agreedById: 'leader',
      operationalOn: null, status: 'active', retiredOn: null, retiredReason: '', createdAt: at('2026-11-05'), updatedAt: at('2026-11-05'),
    }],
  });
  const report = read(raw);
  const row = report.liveRows[0];
  assert.equal(row.state.key, 'agreed-not-in-place');
  assert.equal(row.state.agreedDaysAgo, 12, 'the exact days since agreement, not an approximation');
  assert.equal(row.state.pastGrace, false, 'the default grace is 14 days');

  const later = buildWorkplaceAdjustment(load(raw), { now: new Date('2026-11-30T09:00:00.000Z'), seat: null });
  assert.equal(later.liveRows[0].state.pastGrace, true, 'the same row is past its grace 25 days later, with no write');
});

test('an adjustment with an operational day reads in-place and the distance is measured', () => {
  const raw = fixture({
    restrictions: [{ ...fixture().wpaRestrictions[0], domain: 'manual-handling', instrument: 'ergonomic-assessment', limitUnit: 'grams', limitValue: 5000 }],
    adjustments: [{
      id: 'adj-1', restrictionId: 'r-night', kind: 'equipment',
      detail: 'A lifting aid was bought and put into service.',
      agreedOn: '2026-11-01', agreedAt: at('2026-11-01'), agreedById: 'leader',
      operationalOn: '2026-11-09', operationalAt: at('2026-11-09'), operationalById: 'leader',
      status: 'active', retiredOn: null, retiredReason: '', createdAt: at('2026-11-01'), updatedAt: at('2026-11-09'),
    }],
  });
  const report = read(raw);
  assert.equal(report.liveRows[0].state.key, 'in-place', 'agreed AND operational, with nothing on the record contradicting it');
  assert.equal(report.totals.inPlaceN, 1);
});

test('the agreed-to-operational median is REFUSED below its declared floor', () => {
  const one = fixture({
    adjustments: [{
      id: 'adj-1', restrictionId: 'r-night', kind: 'equipment', detail: 'An aid was bought and put into service.',
      agreedOn: '2026-11-01', agreedAt: at('2026-11-01'), agreedById: 'leader',
      operationalOn: '2026-11-05', operationalAt: at('2026-11-05'), operationalById: 'leader',
      status: 'active', retiredOn: null, retiredReason: '', createdAt: at('2026-11-01'), updatedAt: at('2026-11-05'),
    }],
  });
  const report = read(one);
  assert.equal(report.medianAgreedToOperational, null, 'one adjustment is not a distribution');
  assert.match(report.medianReason, /Fewer than 3/);
});

test('a restriction past its review day reads review-overdue and time never lifts it', () => {
  const raw = fixture({ restrictions: [
    { ...fixture().wpaRestrictions[0], reviewOn: '2026-11-01', domain: 'manual-handling', instrument: 'ergonomic-assessment', limitUnit: 'grams', limitValue: 5000 },
  ] });
  const report = read(raw);
  assert.equal(report.liveRows[0].state.key, 'review-overdue');
  assert.equal(report.totals.reviewOverdueN, 1);
  assert.equal(report.liveRows[0].restriction.status, 'active', 'a passed review day changes the printed state, never the duty');
});

test('a declined review is a distinct state, and a later adjustment outranks it', () => {
  const base = fixture().wpaRestrictions.map((row) => ({ ...row, reviewOn: '2026-12-20', domain: 'manual-handling', instrument: 'ergonomic-assessment', limitUnit: 'grams', limitValue: 5000 }));
  const declinedOnly = fixture({
    restrictions: base,
    reviews: [{ id: 'rv', restrictionId: 'r-night', decision: 'declined', basis: 'The aid requested was declined on cost; the limitation itself is unchanged.', reviewedOn: '2026-11-10', reviewedAt: at('2026-11-10'), reviewedById: 'leader', nextReviewOn: null }],
  });
  const report = read(declinedOnly);
  assert.equal(report.liveRows[0].state.key, 'declined');
  assert.equal(report.totals.declinedN, 1);

  const answered = fixture({
    restrictions: base,
    reviews: [{ id: 'rv', restrictionId: 'r-night', decision: 'declined', basis: 'The aid requested was declined on cost; the limitation itself is unchanged.', reviewedOn: '2026-11-10', reviewedAt: at('2026-11-10'), reviewedById: 'leader', nextReviewOn: null }],
    adjustments: [{
      id: 'adj-1', restrictionId: 'r-night', kind: 'supervision', detail: 'A named buddy was arranged for the task the aid was requested for.',
      agreedOn: '2026-11-11', agreedAt: at('2026-11-11'), agreedById: 'leader',
      operationalOn: '2026-11-12', operationalAt: at('2026-11-12'), operationalById: 'leader',
      status: 'active', retiredOn: null, retiredReason: '', createdAt: at('2026-11-11'), updatedAt: at('2026-11-12'),
    }],
  });
  const later = read(answered);
  assert.notEqual(later.liveRows[0].state.key, 'declined', 'a recorded adjustment answers the request the refusal declined');
});

test('a lifting limit is never printed as clear, and an advisory instrument is never tested', () => {
  const raw = fixture({ restrictions: [
    { ...fixture().wpaRestrictions[0], id: 'r-lift', domain: 'manual-handling', instrument: 'ergonomic-assessment', limitUnit: 'grams', limitValue: 5000 },
    { ...fixture().wpaRestrictions[0], id: 'r-advice', domain: 'no-night-work', instrument: 'recommendation' },
    { ...fixture().wpaRestrictions[0], id: 'r-night2' },
  ] });
  const report = read(raw);
  const lift = report.liveRows.find((row) => row.restriction.id === 'r-lift');
  const advice = report.liveRows.find((row) => row.restriction.id === 'r-advice');
  const night = report.liveRows.find((row) => row.restriction.id === 'r-night2');
  assert.equal(lift.test.testable, false);
  assert.equal(lift.test.refused, 'no-exposure-record');
  assert.match(lift.test.reason, /not a clearance/);
  assert.equal(advice.test.refused, 'advisory', 'advice is recorded and never tested as a prohibition');
  assert.equal(night.test.verdict, 'breached');
  assert.equal(night.test.measuredMinutes, 420);
});

test('silence about declared work is a printed refusal, not a pass', () => {
  const raw = fixture({ shifts: [] });
  const report = read(raw);
  assert.equal(report.liveRows[0].test.refused, 'no-shifts');
  assert.match(report.liveRows[0].test.reason, /not clearance/);
});

/* ------------------------------------------------------- 7/8. matrix */

test('a conflict declared on the SECOND line is caught, and the person is counted once', () => {
  const report = read(fixture());
  const row = report.liveRows[0];
  assert.equal(row.test.verdict, 'breached');
  assert.equal(row.ack.linesN, 2, 'both active lines owe an acknowledgement');
  assert.equal(report.totals.peopleN, 1, 'the person is counted once across two lines');
  assert.equal(report.lineRows.length, 2, 'and appears on both lines');

  // Drop the project-line shift and the same restriction reads within the limit:
  // the conflict came from the line a single-line reader cannot see.
  const homeOnly = read(fixture({ shifts: [DAY_SHIFT] }));
  assert.equal(homeOnly.liveRows[0].test.verdict, 'within');
  assert.equal(homeOnly.liveRows[0].test.measuredMinutes, 0);
});

test('the rule asks the JOINT APEX above the lines and never the person', () => {
  const raw = fixture();
  const matrix = buildMatrix(load(raw), { now: NOW, settings: { activeSeatId: null } });
  const apex = matrixJointApex(matrix, ['mei', 'freya']);
  const report = read(raw);
  const { conditions } = workplaceAdjustmentConditions(report, { today: '2026-11-17', matrix, conventions: report.conventions });
  const conflict = conditions.filter((row) => row.kind === 'work-conflict');
  assert.equal(conflict.length, 1);
  assert.deepEqual(conflict[0].seatIds, apex.apexIds, 'the ask goes to the joint apex, computed not chosen');
  assert.ok(!conflict[0].seatIds.includes('sam'), 'never to the person carrying the restriction');
});

test('a restriction on a person above every line asks the joint apex, never the person', () => {
  // The leader carries their own restriction. They sit above every line, so the
  // apex cannot collapse onto them from below: the ask goes to the leader, and
  // the register does NOT fall into the self-apex interlock by confusing "the
  // top of the graph" with "the person the restriction is about".
  const raw = createEmptyState(T0);
  raw.people = [person('sam', null), person('a', 'sam')];
  raw.wpaRestrictions = [{ ...fixture().wpaRestrictions[0], personId: 'leader' }];
  raw.workRestShifts = [{ ...NIGHT_SHIFT, personId: 'leader', lineManagerId: 'a' }];
  const state = load(raw);
  const matrix = buildMatrix(state, { now: NOW, settings: state.settings });
  const report = buildWorkplaceAdjustment(state, { now: NOW, seat: null });
  assert.equal(report.liveRows[0].test.verdict, 'breached', 'the conflict is still proven for someone at the top');
  assert.equal(report.liveRows[0].ack.linesN, 0, 'and nobody sits above them on a declared line');
});

test('the reporting graph always yields an addressee — the observation path is an interlock', () => {
  // Brute-forced over the manager/hierarchy/line-kind combinations a roster can
  // hold, `matrixJointApex` never returns the restricted person, and a person with
  // no declared manager is still placed on the leader's line by the matrix. So no
  // legal roster produces a restriction nobody can be asked about, and NONE of
  // the no-line / no-apex / self-apex branches is a state a reader can see. They
  // remain as guards. Their contract is pinned below against the pure function,
  // which is the only honest way to test a branch the data cannot reach.
  const raw = fixture();
  const state = load(raw);
  const matrix = buildMatrix(state, { now: NOW, settings: state.settings });
  const report = buildWorkplaceAdjustment(state, { now: NOW, seat: null });
  assert.ok(!report.liveRows[0].apex.apexIds.includes('sam'), 'the joint apex of a person’s lines is never that person');

  // A restriction on someone above every line: nobody sits above them.
  const top = createEmptyState(T0);
  top.people = [person('sam', null), person('a', 'sam')];
  top.wpaRestrictions = [{ ...fixture().wpaRestrictions[0], personId: 'leader' }];
  top.workRestShifts = [{ ...NIGHT_SHIFT, personId: 'leader', lineManagerId: 'a' }];
  const topState = load(top);
  const topReport = buildWorkplaceAdjustment(topState, { now: NOW, seat: null });
  assert.equal(topReport.liveRows[0].test.verdict, 'breached', 'the conflict is proven even at the top of the graph');
  assert.equal(topReport.liveRows[0].ack.linesN, 0, 'and no declared line sits above them');

  // The pure contract: no line → an observation naming no line; lines but no
  // apex → an observation naming no seat; apex == the person → never an ask.
  const row = (overrides) => ({
    restriction: { id: 'r', personId: 'sam' },
    state: { key: 'operational-conflict' },
    test: { testable: true, verdict: 'breached' },
    ack: { lines: [] },
    ...overrides,
  });

  // A row with no derived state is skipped rather than guessed at.
  const stateless = workplaceAdjustmentConditions(
    { ok: true, liveRows: [{ restriction: { id: 'r' }, test: { testable: true, verdict: 'breached' }, ack: { lines: [] } }] },
    { today: '2026-11-17', matrix, conventions: {} },
  );
  assert.equal(stateless.conditions.length, 0);
  assert.equal(stateless.observations.length, 0, 'a row that proves nothing files nothing, silently and safely');
  const empty = workplaceAdjustmentConditions({ ok: true, liveRows: [row({})] }, { today: '2026-11-17', matrix, conventions: {} });
  assert.equal(empty.conditions.length, 0);
  assert.ok(empty.observations.some((o) => o.signature.includes('no-line')), 'nobody to ask is observed, not dropped');
  for (const observation of empty.observations) assert.ok(!/sam/i.test(observation.detail));

  const lineRow = row({ ack: { lines: [{ managerId: 'mei' }] } });
  const noMatrix = workplaceAdjustmentConditions({ ok: true, liveRows: [lineRow] }, { today: '2026-11-17', matrix: null, conventions: {} });
  assert.equal(noMatrix.conditions.length, 0, 'no apex is never turned into an ask at a guess');
  assert.ok(noMatrix.observations.length >= 1);
});

/* ------------------------------------------------- 9. the rule itself */

function runRule(raw, { eventType = 'workplaceAdjustment.scan', now = NOW, settings = null } = {}) {
  const draft = JSON.parse(JSON.stringify(load(raw)));
  if (settings) draft.settings = { ...draft.settings, ...settings };
  const effects = [];
  const out = workplaceAdjustmentRule(draft, {
    event: { type: eventType },
    now,
    idFactory: (prefix) => `${prefix}-t-${Math.random().toString(36).slice(2, 10)}`,
    recordEffect: (effect) => effects.push(effect),
    linkCtx: { idFactory: () => `lnk-${Math.random().toString(36).slice(2, 10)}` },
  });
  return { draft, out, effects };
}

test('RULE-WPA-01 files one opaque ask per obligation, to the right hand', () => {
  const { draft, effects } = runRule(fixture());
  const asks = indexWorkplaceAdjustmentAsks(draft);
  const conflicts = asks.filter((ask) => ask.signature.startsWith('wpa1:work-conflict:'));
  const unack = asks.filter((ask) => ask.signature.startsWith('wpa1:line-unacknowledged:'));
  assert.equal(conflicts.length, 1);
  assert.equal(unack.length, 2, 'each active line owes its own acknowledgement');
  // The ask TEXT names nobody and nothing.
  for (const effect of effects.filter((row) => row.action === 'delegated')) {
    assert.ok(!/sam|night|420|no-night-work/i.test(effect.summary), `ask summary leaks detail: ${effect.summary}`);
  }
  const task = draft.delegations.find((row) => row.id === asks[0].task.id);
  assert.ok(!/sam|night/i.test(task.title), 'the title is opaque');
  assert.ok(!/sam|night/i.test(task.expectedOutcome), 'the outcome is opaque');
});

test('RULE-WPA-01 is idempotent, self-closing, capped and pause-governed', () => {
  const first = runRule(fixture());
  const before = indexWorkplaceAdjustmentAsks(first.draft).length;
  assert.ok(before > 0);

  // Idempotent: a second pass over its own output files nothing new.
  const effects = [];
  workplaceAdjustmentRule(first.draft, {
    event: { type: 'workplaceAdjustment.scan' },
    now: NOW,
    idFactory: (prefix) => `${prefix}-t2-${Math.random().toString(36).slice(2, 10)}`,
    recordEffect: (effect) => effects.push(effect),
    linkCtx: { idFactory: () => `lnk2-${Math.random().toString(36).slice(2, 10)}` },
  });
  assert.equal(indexWorkplaceAdjustmentAsks(first.draft).length, before, 'no second ask for the same obligation');

  // Pause governs every path, including the explicit scan.
  const paused = runRule(fixture(), { settings: { wpaAutoPropagate: false } });
  assert.equal(indexWorkplaceAdjustmentAsks(paused.draft).length, 0);
  // And an automation event never re-enters.
  const own = JSON.parse(JSON.stringify(load(fixture())));
  const none = workplaceAdjustmentRule(own, { event: { type: 'automation.propagated' }, now: NOW, idFactory: () => 'x', recordEffect: () => {} });
  assert.deepEqual(none, []);

  // Self-closing: with every line acknowledged the unacknowledged asks close.
  const allAcked = fixture({ acknowledgements: [
    { id: 'k1', restrictionId: 'r-night', lineManagerId: 'mei', acknowledgedOn: '2026-11-02', acknowledgedAt: at('2026-11-02'), acknowledgedById: 'leader', note: '' },
    { id: 'k2', restrictionId: 'r-night', lineManagerId: 'freya', acknowledgedOn: '2026-11-02', acknowledgedAt: at('2026-11-02'), acknowledgedById: 'leader', note: '' },
  ] });
  const second = runRule(allAcked);
  const remaining = indexWorkplaceAdjustmentAsks(second.draft).filter((ask) => ask.signature.startsWith('wpa1:line-unacknowledged:'));
  assert.equal(remaining.filter((ask) => ask.task && ask.task.status === 'active').length, 0, 'the acknowledgement asks closed themselves');
});

test('the cap is four asks per commit and the remainder is counted, never dropped silently', () => {
  const restrictions = [];
  const acknowledgements = [];
  for (let i = 0; i < 7; i += 1) {
    restrictions.push({ ...fixture().wpaRestrictions[0], id: `r-${i}` });
  }
  const raw = fixture({ restrictions });
  const { effects, draft } = runRule(raw);
  const delegated = effects.filter((row) => row.action === 'delegated');
  const deferred = effects.filter((row) => row.action === 'deferred');
  assert.equal(delegated.length, 4, 'bounded at four per commit');
  assert.equal(deferred.length, 1);
  assert.match(deferred[0].summary, /deferred/);
  assert.equal(indexWorkplaceAdjustmentAsks(draft).length, 4);
});

test('a person with no declared manager is still placed on the leader line and asked about', () => {
  // The matrix does not leave a person unattached: someone with no declared
  // manager sits on the leader's functional line. The register therefore asks the
  // leader, and writes no anonymous marker — an unaddressed restriction would be
  // a failure to ask, not a fact worth recording.
  const raw = createEmptyState(T0);
  raw.people = [person('sam', null)];
  raw.wpaRestrictions = fixture().wpaRestrictions;
  raw.workRestShifts = [NIGHT_SHIFT];
  const { draft } = runRule(raw);
  const asks = indexWorkplaceAdjustmentAsks(draft);
  assert.ok(asks.length >= 1, 'the conflict is filed against the seat that holds the line');
  for (const ask of asks) {
    const task = draft.delegations.find((row) => row.id === ask.task.id);
    assert.ok(!/sam|night/i.test(task.title), 'and the ask text names nothing');
  }
  assert.equal(draft.wpaMarkers.length, 0, 'no anonymous observation was written for a condition that had an addressee');
});

/* ------------------------------------------------ 10. door and exports */

test('the door refuses an unsourced restriction, a unit mismatch and a future declaration', () => {
  const { store, api } = harness(fixture({ restrictions: [] }));

  const unsourced = api.workplaceAdjustmentDeclareRestriction({
    personId: 'sam', domain: 'no-night-work', instrument: 'fit-note',
    statement: 'Must not work nights.', sourceRef: '', limitValue: null,
  });
  assert.equal(unsourced.ok, false);
  assert.equal(unsourced.field, 'sourceRef');

  const unit = api.workplaceAdjustmentDeclareRestriction({
    personId: 'sam', domain: 'max-shift-hours', instrument: 'fit-note',
    statement: 'No more than eight hours.', sourceRef: 'A note of 2026-11-01 recording the hours limit.', limitValue: 5000,
  });
  assert.equal(unit.ok, false);
  assert.equal(unit.field, 'limitValue');

  const future = api.workplaceAdjustmentDeclareRestriction({
    personId: 'sam', domain: 'no-night-work', instrument: 'fit-note',
    statement: 'Must not work nights.', sourceRef: 'A note of 2026-11-01 recording the limitation.', limitValue: null,
    declaredOn: '2099-01-01',
  });
  assert.equal(future.ok, false);
  assert.equal(future.field, 'declaredOn');

  const ok = api.workplaceAdjustmentDeclareRestriction({
    personId: 'sam', domain: 'no-night-work', instrument: 'fit-note',
    statement: 'Must not work nights.', sourceRef: 'A note of 2026-11-01 recording the limitation.', limitValue: null,
    declaredOn: '2026-11-01',
  });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(store.state.wpaRestrictions.length, 1);
});

test('the door REFUSES a withdrawal with no recorded review, and accepts one after it', () => {
  const { store, api } = harness(fixture());

  const refused = api.workplaceAdjustmentWithdrawRestriction({ restrictionId: 'r-night', reason: 'The treatment finished and the instrument was not renewed.', on: '2026-11-15' });
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal, 'workplaceAdjustment:review-required');
  assert.equal(store.state.wpaRestrictions[0].status, 'active', 'nothing was withdrawn');

  const review = api.workplaceAdjustmentRecordReview({ restrictionId: 'r-night', decision: 'close', basis: 'The treating clinician confirmed the limitation no longer applies.', reviewedOn: '2026-11-14' });
  assert.equal(review.ok, true, review.error);

  const before = api.workplaceAdjustmentWithdrawRestriction({ restrictionId: 'r-night', reason: 'The treatment finished and the instrument was not renewed.', on: '2026-11-13' });
  assert.equal(before.ok, false, 'a withdrawal before the review that decided it is refused');

  const done = api.workplaceAdjustmentWithdrawRestriction({ restrictionId: 'r-night', reason: 'The treatment finished and the instrument was not renewed.', on: '2026-11-15' });
  assert.equal(done.ok, true, done.error);
  assert.equal(store.state.wpaRestrictions[0].status, 'withdrawn');
  const after = buildWorkplaceAdjustment(store.state, { now: NOW, seat: null });
  assert.equal(after.liveRows.length, 0);
  assert.equal(after.rows[0].state.key, 'withdrawn', 'history is retained, not deleted');
});

test('the door refuses a second operational day and a self-acknowledgement', () => {
  const { store, api } = harness(fixture({ restrictions: [] }));
  const declared = api.workplaceAdjustmentDeclareRestriction({
    personId: 'sam', domain: 'no-night-work', instrument: 'fit-note',
    statement: 'Must not work nights.', sourceRef: 'A note of 2026-11-01 recording the limitation.', limitValue: null, declaredOn: '2026-11-01',
  });
  assert.equal(declared.ok, true, declared.error);
  const restrictionId = declared.id;

  const self = api.workplaceAdjustmentAcknowledgeLine({ restrictionId, lineManagerId: 'sam', acknowledgedOn: '2026-11-05' });
  assert.equal(self.ok, false);
  assert.equal(self.refusal, 'workplaceAdjustment:self-acknowledgement');

  const notLine = api.workplaceAdjustmentAcknowledgeLine({ restrictionId, lineManagerId: 'priya', acknowledgedOn: '2026-11-05' });
  assert.equal(notLine.ok, false, 'a manager who holds no active line cannot acknowledge one');

  const line = api.workplaceAdjustmentAcknowledgeLine({ restrictionId, lineManagerId: 'mei', acknowledgedOn: '2026-11-05' });
  assert.equal(line.ok, true, line.error);

  const recorded = api.workplaceAdjustmentRecordAdjustment({
    restrictionId, kind: 'task-substitution', detail: 'Night cover was taken off this person entirely.',
    agreedOn: '2026-11-05',
  });
  assert.equal(recorded.ok, true, recorded.error);

  const first = api.workplaceAdjustmentMarkOperational({ adjustmentId: recorded.id, operationalOn: '2026-11-10' });
  assert.equal(first.ok, true, first.error);
  const second = api.workplaceAdjustmentMarkOperational({ adjustmentId: recorded.id, operationalOn: '2026-11-11' });
  assert.equal(second.ok, false);
  assert.equal(second.refusal, 'workplaceAdjustment:already-operational');
});

test('the CSV boundary is aggregate and identity-free and re-adds to the reader', () => {
  const report = read(fixture({
    adjustments: [{
      id: 'adj-1', restrictionId: 'r-night', kind: 'equipment', detail: 'A lifting aid was bought and put into service.',
      agreedOn: '2026-11-01', agreedAt: at('2026-11-01'), agreedById: 'leader',
      operationalOn: '2026-11-05', operationalAt: at('2026-11-05'), operationalById: 'leader',
      status: 'active', retiredOn: null, retiredReason: '', createdAt: at('2026-11-01'), updatedAt: at('2026-11-05'),
    }],
  }));
  const rows = workplaceAdjustmentCsvRows(report);
  assert.ok(rows.length >= 2);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row), [...WPA_CSV_COLUMNS], 'every row carries the declared column set');
  }
  const flat = JSON.stringify(rows);
  for (const forbidden of ['sam', 'Sam', 'mei', 'freya', 'r-night', 'adj-1', 'Must not do the restricted thing', 'written instrument', '2026-11-10']) {
    assert.ok(!flat.includes(forbidden), `identity leaked into the export: ${forbidden}`);
  }
  const summary = rows.find((row) => row.row_kind === 'summary');
  assert.equal(Number(summary.live_n), report.totals.live);
  assert.equal(Number(summary.conflict_n), report.totals.conflictN);
  assert.equal(Number(summary.lines_unacknowledged_n), report.totals.linesMissingN);

  // Through the real export path.
  const { store } = harness(fixture());
  const exported = exportWorkspaceCsv(store.state, WPA_CSV_SCOPE);
  assert.equal(exported.ok, true, exported.error);
  assert.ok(!exported.csv.includes('sam'), 'no person name crosses the boundary');
  const parsed = parseCsv(exported.csv);
  assert.deepEqual(parsed.headers, [...WPA_CSV_COLUMNS], 'the header is the declared column set');
  assert.ok(parsed.rows.length >= 2);
});

test('the panel prints the reader’s own figures cell for cell', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const raw = fixture({
      adjustments: [{
        id: 'adj-1', restrictionId: 'r-night', kind: 'equipment', detail: 'A lifting aid was bought and put into service.',
        agreedOn: '2026-11-01', agreedAt: at('2026-11-01'), agreedById: 'leader',
        operationalOn: null, status: 'active', retiredOn: null, retiredReason: '', createdAt: at('2026-11-01'), updatedAt: at('2026-11-01'),
      }],
    });
    const state = load(raw);
    const report = buildWorkplaceAdjustment(state, { now: NOW, seat: null });
    const { api } = harness(raw);
    const view = renderAdjustments({ api, query: new URLSearchParams(''), state });
    const html = view.outerHTML;

    const cell = (testid) => {
      const match = new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`).exec(html);
      return match ? match[1].trim() : null;
    };
    assert.equal(cell('wpa-count-live'), String(report.totals.live), 'displayed live count == computed');
    assert.equal(cell('wpa-count-conflict'), String(report.totals.conflictN), 'displayed conflict count == computed');
    assert.equal(cell('wpa-count-agreed'), String(report.totals.agreedNotInPlaceN));
    assert.equal(cell('wpa-count-attention'), String(report.attention.total));
    assert.equal(cell('wpa-count-unproven'), String(report.totals.unprovenN));

    // The conflict cell carries the exact computed minutes, not a rounded label.
    const testCell = new RegExp(`data-testid="wpa-test-r-night"[^>]*data-minutes="(\\d+)"`).exec(html);
    assert.ok(testCell, 'the conflict cell prints its exact measured minutes');
    assert.equal(Number(testCell[1]), report.liveRows[0].test.measuredMinutes);

    // The state badge printed is the state the reader DERIVED, whatever it is.
    assert.ok(html.includes(`data-testid="wpa-state-${report.liveRows[0].state.key}"`),
      `the printed state must be the computed one (${report.liveRows[0].state.key})`);
    // No raw person id leaks onto the screen in place of a name.
    assert.ok(!/person-|>sam</.test(html.replace(/wpa-[a-z-]+/g, '')), 'no raw id printed as a name');
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});

test('the demo seed proves four real duties and every derived figure re-adds', () => {
  const { state } = normalizeState(buildDemoState(NOW), { now: NOW });
  const report = buildWorkplaceAdjustment(state, { now: NOW, seat: null });
  assert.equal(report.totals.live, 4);
  assert.equal(report.totals.conflictN, 2, 'the night-work conflict and the hours conflict are both proven');
  assert.equal(report.totals.conflictMinutes, 960);
  assert.equal(report.totals.unprovenN, 2, 'the two untestable domains are counted, never cleared');
  assert.ok(report.totals.linesMissingN >= 1, 'at least one line has never been shown a restriction it holds');
  assert.equal(report.balances.statesReconcile, true);
  assert.equal(report.balances.linesReconcile, true);
  assert.equal(report.stateTotal, report.totals.live);
  assert.ok(report.medianAgreedToOperational, 'the demo carries enough dated adjustments for a median');
  assert.equal(report.medianAgreedToOperational.value, 6);
  assert.equal(report.figuresComplete, false, 'and it correctly reports that a real gap is outstanding');
});

test('the register is reachable, badged and read-gated', () => {
  assert.equal(WPA_RIGHTS.READ, 'read-workplace-adjustments');
  const { api } = harness(fixture());
  const result = api.workplaceAdjustmentReport();
  assert.equal(result.ok, true, result.error);
  assert.equal(result.report.totals.live, 1);
  const attention = api.workplaceAdjustmentAttention();
  assert.equal(attention.ok, true);
  assert.equal(attention.count, result.report.attention.total);
});
