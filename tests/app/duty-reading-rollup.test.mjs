/**
 * tests/app/duty-reading-rollup.test.mjs — ADR-0133, Schema v118 unchanged,
 * Session 180.
 *
 * THE DUTY A VP ACTUALLY PERFORMS
 * -------------------------------
 * "Three divisions report to me. One of them has a director two levels down
 * whose branch reading lapsed six weeks ago, another let an ask go overdue, and
 * a third declined. I have to commit the quarterly continuity position across
 * all three tomorrow, and my own one-level table shows me only the two cells I
 * asked about myself."
 *
 * ADR-0129 published the governed hand-off; ADR-0126 / Session 179 made the
 * direct-branch table safe with primary + complementary suppression. The
 * automation engine writes a `rolls-up-to` edge for EVERY ancestor span on each
 * act. But `branchCoverage.readings` stopped one rung short: it counts only the
 * withheld cells on the acting seat's own table, and the daily badge counts
 * only asks where that seat is asker or target. The VP is not blind to a figure
 * (correctly withheld) — they are blind to the fact that the governed signal
 * has gone dark anywhere below them.
 *
 * This suite proves the READER of those edges. It uses REAL transactions
 * (request / publish / decline / withdraw / revoke) through the shared event
 * spine, fail-closed reload, and the existing report → brief → CSV → Desk /
 * Method → scan surfaces. No new collection, event, rule, action, convention,
 * schema bump or badge change. Above rank 2 the roll-up carries no name, note,
 * band, person id, seat id or record id — only counts, a rank (a position
 * number), an anonymous branch position, dates and the derived state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState, normalizeState, SCHEMA_VERSION, DEFAULT_SETTINGS,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  buildDutyCoverageReport, dutyCoverageBriefText, dutyCoverageCsvRows,
  dutyCoverageAttentionCount, spanReadingRollup, SPAN_READINGS_CSV_COLUMNS,
} from '../../app/core/domain/dutyCoverage.js';
import {
  DUTY_COVERAGE_LIMITS, DUTY_COVERAGE_DEFAULTS, DUTY_COVERAGE_EVENTS,
  DUTY_READING_ROLLUP_ENGINE_VERSION, SPAN_READINGS_CSV_COLUMNS as REGISTRY_COLUMNS,
} from '../../app/core/domain/dutyCoverageRegistry.js';
import { exportWorkspaceCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2027-06-30T00:00:00.000Z');
const DAY = 86400000;
const later = (days) => new Date(NOW.getTime() + days * DAY);
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString().slice(0, 10);
const NOTE = 'Please read your own continuity position for the quarter.';

/**
 * leader (chief, rank 5)
 *   ├── vp-a (exec, rank 4)                 ← the VP forecasting the quarter
 *   │     ├── dir-a1 (director, rank 3)
 *   │     │     ├── dir-deep (director, rank 3)  ← TWO LEVELS DOWN from vp-a
 *   │     │     │     ├── mgr-deep1 → ic-deep1
 *   │     │     │     └── mgr-deep2 → ic-deep2
 *   │     │     └── mgr-a2 → ic-a2
 *   │     └── dir-a2 (director, rank 3)
 *   │           └── mgr-a3 → ic-a3
 *   └── vp-b (exec, rank 4)
 *         └── dir-b1 (director, rank 3)
 *               └── mgr-b1 → ic-b1
 *
 * A director at rank 3 may request a reading of one direct branch (rank 2), so
 * `dir-deep` can write the very act the VP could never see. `vp-b`'s director
 * writes an act OUTSIDE vp-a's span, which must never be read sideways.
 */
function roster() {
  return [
    { id: 'vp-a', name: 'Ada Vance', level: 'vp' },
    { id: 'dir-a1', name: 'Dora Aone', level: 'director', managerId: 'vp-a' },
    { id: 'dir-deep', name: 'Dee Deep', level: 'director', managerId: 'dir-a1' },
    { id: 'mgr-deep1', name: 'Moe Deep', level: 'manager', managerId: 'dir-deep' },
    { id: 'ic-deep1', name: 'Ion Deep', level: 'ic', managerId: 'mgr-deep1' },
    { id: 'mgr-deep2', name: 'Mia Deep', level: 'manager', managerId: 'dir-deep' },
    { id: 'ic-deep2', name: 'Iris Deep', level: 'ic', managerId: 'mgr-deep2' },
    { id: 'mgr-a2', name: 'Mira Atwo', level: 'manager', managerId: 'dir-a1' },
    { id: 'ic-a2', name: 'Ivy Atwo', level: 'ic', managerId: 'mgr-a2' },
    { id: 'dir-a2', name: 'Dirk Atwo', level: 'director', managerId: 'vp-a' },
    { id: 'mgr-a3', name: 'Mona Athree', level: 'manager', managerId: 'dir-a2' },
    { id: 'ic-a3', name: 'Ivo Athree', level: 'ic', managerId: 'mgr-a3' },
    { id: 'vp-b', name: 'Bo Vance', level: 'vp' },
    { id: 'dir-b1', name: 'Dana Bone', level: 'director', managerId: 'vp-b' },
    { id: 'mgr-b1', name: 'Mira Bone', level: 'manager', managerId: 'dir-b1' },
    { id: 'ic-b1', name: 'Ivan Bone', level: 'ic', managerId: 'mgr-b1' },
  ].map((p) => ({ status: 'active', createdAt: ago(500), ...p }));
}

function makeState({ activeSeatId = 'vp-a', floor = undefined } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    activeSeatId,
    ...(floor !== undefined ? { dutyCoverageBranchFloorN: floor } : {}),
  };
  state.people = roster();
  const n = normalizeState(state, { now: NOW });
  assert.deepEqual(n.warnings, [], `fixture must load fail-closed and clean: ${n.warnings.join(' | ')}`);
  return n.state;
}

function boot(state = makeState()) {
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  let seq = 0;
  let current = NOW;
  const now = () => current;
  const setNow = (d) => { current = d; };
  const store = createStore({ storage, now, idFactory: (p) => `${p}-t${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-t${++seq}` });
  return { store, api, map, setNow, now };
}

const at = (state, when = NOW) => buildDutyCoverageReport(state, { now: when, settings: state.settings });
const seat = (h, id) => { const r = h.api.setActiveSeat(id, { reason: 'ADR-0133 suite' }); assert.ok(r.ok, `setActiveSeat(${id}): ${r.error}`); };
const ok = (r, what) => { assert.ok(r.ok, `${what}: ${r.error}`); return r; };

/** The full six-state timeline, all through REAL transactions on the spine. */
function sixStateTimeline(h) {
  const ASK = {};
  // day 0 — a director TWO LEVELS DOWN from the VP asks its own direct branch.
  seat(h, 'dir-deep');
  ASK.overdue = ok(h.api.branchReadingRequest({ targetSeatId: 'mgr-deep1', note: NOTE }), 'overdue ask').id;
  ASK.lapsed = ok(h.api.branchReadingRequest({ targetSeatId: 'mgr-deep2', note: NOTE }), 'lapsed ask').id;
  // day 1 — publish the second; it will lapse by day 45 (validDays = 30).
  h.setNow(later(1));
  seat(h, 'mgr-deep2');
  ASK.lapsedReading = ok(h.api.branchReadingPublish({ id: ASK.lapsed, note: 'We are holding with two exercised covers across the unit.' }), 'publish lapsed').id;
  // day 3 — a withdrawn ask at a director one level down, same branch.
  h.setNow(later(3));
  seat(h, 'dir-a1');
  const w = ok(h.api.branchReadingRequest({ targetSeatId: 'mgr-a2', note: NOTE }), 'withdraw ask');
  ok(h.api.branchReadingWithdraw({ id: w.id, reason: 'The question was superseded by the new plan.' }), 'withdraw');
  // day 5 — a declined ask at the other direct branch of the VP.
  h.setNow(later(5));
  seat(h, 'dir-a2');
  const d = ok(h.api.branchReadingRequest({ targetSeatId: 'mgr-a3', note: NOTE }), 'decline ask');
  seat(h, 'mgr-a3');
  ok(h.api.branchReadingDecline({ id: d.id, reason: 'We cannot give a reading while the reorganisation is unresolved.' }), 'decline');
  // day 7 — an act in a SIBLING span, which must never be read sideways.
  h.setNow(later(7));
  seat(h, 'dir-b1');
  ASK.outside = ok(h.api.branchReadingRequest({ targetSeatId: 'mgr-b1', note: NOTE }), 'outside ask').id;
  // day 41 — the VP's OWN desk ask, still inside the 5-day window at day 45.
  h.setNow(later(41));
  seat(h, 'vp-a');
  ASK.own = ok(h.api.branchReadingRequest({ targetSeatId: 'dir-a1', note: NOTE }), 'own ask').id;
  // day 42 — a valid published reading in branch 1.
  h.setNow(later(42));
  seat(h, 'dir-a1');
  const p = ok(h.api.branchReadingRequest({ targetSeatId: 'dir-deep', note: NOTE }), 'publish ask');
  seat(h, 'dir-deep');
  ok(h.api.branchReadingPublish({ id: p.id, note: 'We are holding with exercised covers across the deep unit.' }), 'publish valid');
  const WHEN = later(45);
  h.setNow(WHEN);
  seat(h, 'vp-a');
  return { ASK, WHEN };
}

const identityTokens = () => [
  'Ada Vance', 'Dora Aone', 'Dee Deep', 'Moe Deep', 'Ion Deep', 'Mia Deep',
  'Iris Deep', 'Mira Atwo', 'Ivy Atwo', 'Dirk Atwo', 'Mona Athree',
  'Ivo Athree', 'Bo Vance', 'Dana Bone', 'Mira Bone', 'Ivan Bone',
  'vp-a', 'vp-b', 'dir-a1', 'dir-a2', 'dir-deep', 'dir-b1',
  'mgr-deep1', 'mgr-deep2', 'mgr-a2', 'mgr-a3', 'mgr-b1',
  'Please read your own continuity position', 'We are holding',
  'superseded by the new plan', 'reorganisation is unresolved',
];

/* ------------------------------------------- 1. additive, unchanged schema */

test('Schema v118 is unchanged: no new collection, event, rule, action, export spec or convention', () => {
  assert.equal(SCHEMA_VERSION, 149);
  // The pre-existing `state.spanReadings` collection is ADR-0100's span
  // CALIBRATION ledger, not this read model. `report.spanReadings` is a pure
  // projection of the two ADR-0129 ledgers and never reads that collection.
  const state = makeState();
  assert.ok(Array.isArray(state.spanReadings), 'ADR-0100 calibration ledger exists as before');
  assert.ok(Array.isArray(state.branchReadingAsks));
  assert.ok(Array.isArray(state.branchReadings));
  const before = JSON.stringify(state);
  const report = at(state);
  assert.ok(report.spanReadings, 'the projection exists on the report');
  assert.equal(JSON.stringify(state), before, 'reading the roll-up is a pure read: nothing is stored');
  assert.equal(report.spanReadings.engineVersion, DUTY_READING_ROLLUP_ENGINE_VERSION);
  // No new export spec and no new row kind.
  assert.equal(CSV_EXPORTS.length, 142);
  assert.equal(CSV_EXPORTS.filter((s) => s.key === 'duty-coverage').length, 1);
  // No new event type, right, action or convention.
  assert.deepEqual(Object.keys(DUTY_COVERAGE_EVENTS).sort(),
    ['DESIGNATE', 'REVOKE', 'SCAN', 'SETTINGS', 'VERIFIED']);
  assert.equal(Object.keys(ACTION_RIGHTS).filter((k) => /spanreading/i.test(k)).length, 0);
  const h = boot();
  assert.equal(Object.keys(h.api).filter((k) => /spanreading/i.test(k)).length, 0);
  assert.equal(Object.keys(DEFAULT_SETTINGS).filter((k) => /spanreading|rollup/i.test(k)).length, 0);
  // Both CSV column registries read the ONE declared constant.
  assert.deepEqual(SPAN_READINGS_CSV_COLUMNS, REGISTRY_COLUMNS);
  assert.equal(SPAN_READINGS_CSV_COLUMNS.length, 15);
  assert.ok(Object.isFrozen(SPAN_READINGS_CSV_COLUMNS));
  const viewSource = fs.readFileSync(path.join(ROOT, 'app/views/dutyCover.js'), 'utf8');
  const csvSource = fs.readFileSync(path.join(ROOT, 'app/core/csv.js'), 'utf8');
  assert.match(viewSource, /\.\.\.SPAN_READINGS_CSV_COLUMNS\]/, 'the Desk download uses the shared list');
  assert.match(csvSource, /\.\.\.SPAN_READINGS_CSV_COLUMNS\]/, 'the workspace export uses the shared list');
});

/* ------------------------------------------- 2. the gap, and the reader of it */

test('a VP is blind to a director two levels down on its own table and badge; the span roll-up sees every state', () => {
  const h = boot();
  const { ASK, WHEN } = sixStateTimeline(h);
  const state = h.store.state;
  const report = at(state, WHEN);
  const span = report.spanReadings;

  // The gap that ADR-0133 closes: the acting seat's OWN one-level table sees
  // only its own two withheld cells — one asked by itself, one not asked.
  assert.equal(report.branchCoverage.readings.cellsN, 2);
  assert.equal(report.branchCoverage.readings.notAskedN, 1);
  assert.equal(report.branchCoverage.readings.askedN, 1);
  assert.equal(report.branchCoverage.readings.overdueN, 0);
  assert.equal(report.branchCoverage.readings.lapsedN, 0);
  assert.equal(report.branchCoverage.readings.declinedN, 0);
  assert.equal(report.branchCoverage.readings.withdrawnN, 0);

  // And the badge is DELIBERATELY unchanged: the four dark hand-offs below are
  // not a second obligation on the VP. Emptying the two ledgers on an otherwise
  // identical state yields exactly the same attention count.
  const withoutLedger = { ...state, branchReadingAsks: [], branchReadings: [] };
  assert.equal(dutyCoverageAttentionCount(state, { now: WHEN, settings: state.settings }),
    dutyCoverageAttentionCount(withoutLedger, { now: WHEN, settings: state.settings }));

  // Meanwhile the roll-up reads the SAME two ledgers across the WHOLE span.
  assert.ok(span);
  assert.equal(span.seatRank, 4);
  assert.equal(span.today, '2027-08-14');
  assert.equal(span.rowCap, DUTY_COVERAGE_LIMITS.readingRollupRowCap);
  assert.equal(span.conventions.responseDays, DUTY_COVERAGE_DEFAULTS.dutyCoverageReadingResponseDays);
  assert.equal(span.conventions.validDays, DUTY_COVERAGE_DEFAULTS.dutyCoverageReadingValidDays);
  assert.equal(span.summary.actsN, 6);
  assert.equal(span.summary.attentionN, 4);
  assert.equal(span.summary.askedN, 1);
  assert.equal(span.summary.overdueN, 1);
  assert.equal(span.summary.publishedN, 1);
  assert.equal(span.summary.declinedN, 1);
  assert.equal(span.summary.lapsedN, 1);
  assert.equal(span.summary.withdrawnN, 1);
  assert.equal(span.summary.desksN, 4);
  assert.equal(span.summary.branchesN, 2);
  assert.equal(span.summary.ownN, 1);
  assert.equal(span.summary.outsideN, 1);
  assert.equal(span.summary.unpartitionedN, 0);
  assert.equal(span.summary.orphanedN, 0);
  assert.equal(span.summary.queueN, 5);
  assert.equal(span.summary.deferredN, 0);

  // Partitioned to the VP's OWN direct branches, never to the asker's id.
  assert.deepEqual(span.branches.map((b) => [b.pos, b.label, b.actsN]),
    [[1, 'Branch 1', 4], [2, 'Branch 2', 1]]);
  assert.equal(span.branches[0].desksN, 2);
  assert.equal(span.branches[0].overdueN, 1);
  assert.equal(span.branches[0].lapsedN, 1);
  assert.equal(span.branches[0].withdrawnN, 1);
  assert.equal(span.branches[0].publishedN, 1);
  assert.equal(span.branches[1].declinedN, 1);
  assert.equal(span.own.actsN, 1);
  assert.equal(span.own.askedN, 1);

  // The automation spine already wrote the roll-up edges in the SAME atomic
  // transaction as each act; this ADR adds a reader, not a second writer.
  const links = state.links || [];
  assert.ok(links.filter((l) => l.relation === 'rolls-up-to').length >= 6,
    'every act carries its upward lineage');
  assert.ok(links.some((l) => l.relation === 'requests-reading-from' && l.sourceId === ASK.overdue));
  assert.ok(links.some((l) => l.relation === 'answers-reading-ask'));
  assert.equal(state.events.filter((e) => /spanreading/i.test(String(e.type))).length, 0,
    'no new event type was introduced');
});

/* ------------------------------------------- 3. constraint-first review queue */

test('the queue is derived under the same day/windows as the desk and dispatched oldest-overdue-first', () => {
  const h = boot();
  const { WHEN } = sixStateTimeline(h);
  const span = at(h.store.state, WHEN).spanReadings;
  const q = span.queue;
  assert.equal(q.length, 5);
  assert.deepEqual(q.map((r) => r.state), ['overdue', 'lapsed', 'declined', 'withdrawn', 'asked'],
    'Goldratt constraint-first: overdue, oldest lapsed, terminal, earliest deadline');
  assert.equal(q[0].daysPast, 40, 'the oldest overdue ask is the binding constraint');
  assert.equal(q[0].askedOn, '2027-06-30');
  assert.equal(q[0].responseBy, '2027-07-05');
  assert.equal(q[1].state, 'lapsed');
  assert.equal(q[1].ageDays, 44, 'a July reading is not a September reading');
  assert.equal(q[1].publishedOn, '2027-07-01');
  assert.equal(q[4].daysLeft, 1, 'the ask nearest its deadline comes first among open asks');
  assert.ok(!q.some((r) => r.state === 'published'), 'a published reading needs nobody');
  // Every queue row is identity-free by construction.
  for (const row of q) {
    assert.ok(Number.isInteger(row.branchPos) || row.branchPos === 0);
    assert.ok(Number.isInteger(row.deskRank));
    assert.equal(typeof row.state, 'string');
    assert.equal(typeof row.stateLabel, 'string');
  }
  const serialised = JSON.stringify({ q, branches: span.branches, own: span.own, summary: span.summary });
  for (const token of identityTokens()) {
    assert.ok(!serialised.includes(token), `no identity crosses above rank 2: ${token}`);
  }
  for (const forbidden of ['askId', 'askNote', 'answerNote', 'why', 'band', 'note', 'seatId', 'personId']) {
    const keys = new Set(q.flatMap((r) => Object.keys(r)));
    assert.ok(!keys.has(forbidden), `queue rows never carry ${forbidden}`);
  }
  // Honest refusals: silence is not health, and sideways acts are not ours.
  assert.match(span.refusals[0], /silence is visible only on the seat’s own table/);
  assert.match(span.refusals.join(' '), /another span/);
});

/* ------------------------------- 4. re-derived at EVERY leadership seat in span */

test('the SAME ledgers are re-derived at every leadership seat in the span, and refused below rank 3 / operator', () => {
  const h = boot();
  const { WHEN } = sixStateTimeline(h);
  const expected = {
    leader: { rank: 5, acts: 7, outside: 0 },
    'vp-a': { rank: 4, acts: 6, outside: 1 },
    'vp-b': { rank: 4, acts: 1, outside: 6 },
    'dir-a1': { rank: 3, acts: 4, outside: 3 },
    'dir-deep': { rank: 3, acts: 2, outside: 5 },
    'dir-a2': { rank: 3, acts: 1, outside: 6 },
    'dir-b1': { rank: 3, acts: 1, outside: 6 },
  };
  for (const [id, want] of Object.entries(expected)) {
    seat(h, id);
    const r = at(h.store.state, WHEN);
    assert.equal(r.seat.rank, want.rank, `${id} rank`);
    assert.equal(r.spanReadings.summary.actsN, want.acts, `${id} sees exactly its own span`);
    assert.equal(r.spanReadings.summary.outsideN, want.outside, `${id} excludes sideways acts`);
    assert.equal(r.spanReadings.today, '2027-08-14', `${id} uses the same day`);
    assert.deepEqual(r.spanReadings.states, ['asked', 'overdue', 'published', 'declined', 'lapsed', 'withdrawn']);
  }
  // Below rank 3 there is no withheld cell to govern: the projection is REFUSED,
  // not a reassuring zero. The operator (fullAccess) and unresolved read-only
  // seats are refused too.
  seat(h, 'mgr-deep1');
  assert.equal(at(h.store.state, WHEN).spanReadings, null);
  assert.equal(spanReadingRollup(h.store.state, buildSeats(h.store.state, { now: WHEN }),
    activeSeat(buildSeats(h.store.state, { now: WHEN })), { now: WHEN }), null);
  assert.ok(h.api.setActiveSeat(null, { reason: 'operator' }).ok);
  assert.equal(at(h.store.state, WHEN).spanReadings, null, 'the undeclared operator view is refused');
  const readOnly = { ...h.store.state, settings: { ...h.store.state.settings, activeSeatId: 'not-on-roster' } };
  assert.equal(at(readOnly, WHEN).spanReadings, null, 'an unresolved read-only seat is refused');
  // No user override: an injected "disable" setting cannot switch the mandated
  // director / VP projection off (Session 179's coverage map).
  const overridden = { ...h.store.state, settings: { ...h.store.state.settings, activeSeatId: 'vp-a', spanReadingRollupEnabled: false } };
  assert.ok(at(overridden, WHEN).spanReadings, 'there is no off switch for this read model');
});

/* ------------------------------- 5. the disclosure floor is NOT re-applied */

test('reading-state counts are published unsuppressed even when every branch figure is withheld', () => {
  // A floor of 25 withholds BOTH of the VP's direct branch cells. The FIGURE
  // stays withheld; the count of governed acts must NOT be suppressed, because
  // ADR-0129 already publishes these counts and suppressing them would restore
  // exactly the blindness the hand-off fixed.
  const h = boot(makeState({ activeSeatId: 'vp-a', floor: 25 }));
  seat(h, 'dir-deep');
  ok(h.api.branchReadingRequest({ targetSeatId: 'mgr-deep1', note: NOTE }), 'floor ask');
  h.setNow(later(8));
  seat(h, 'vp-a');
  const report = at(h.store.state, later(8));
  assert.equal(report.branchCoverage.branches.length, 2);
  assert.ok(report.branchCoverage.branches.every((b) => b.suppressed), 'every figure is withheld');
  assert.equal(report.spanReadings.summary.actsN, 1);
  assert.equal(report.spanReadings.summary.overdueN, 1);
  assert.equal(report.spanReadings.summary.attentionN, 1);
  const rows = dutyCoverageCsvRows(report);
  const row = rows.find((r) => r.row_kind === 'register');
  assert.equal(row.span_reading_acts_n, 1, 'the count is printed, not blanked');
  assert.equal(row.span_reading_overdue_n, 1);
  const withheldCell = rows.find((r) => r.row_kind === 'branch' && r.branch_withheld === 'yes');
  assert.ok(withheldCell, 'the withheld branch cell still travels');
  assert.equal(withheldCell.branch_readiness_pct, '', 'the withheld FIGURE stays BLANK, never zero');
  assert.match(dutyCoverageBriefText(report), /1 hand-off\(s\).*1 need a human now \(1 overdue/);
});

/* ------------------------------- 6. bounded queues and printed deferrals */

test('the review queue and branch table are bounded, with the remainder counted and printed', () => {
  // 41 real request → withdraw pairs from one director: one more than the cap.
  const h = boot();
  seat(h, 'dir-deep');
  for (let i = 0; i < 41; i += 1) {
    const r = ok(h.api.branchReadingRequest({ targetSeatId: 'mgr-deep1', note: `Please read the continuity position for cycle ${i + 1}.` }), `ask ${i}`);
    ok(h.api.branchReadingWithdraw({ id: r.id, reason: 'The question was superseded by a newer plan this cycle.' }), `withdraw ${i}`);
  }
  seat(h, 'vp-a');
  const span = at(h.store.state, NOW).spanReadings;
  assert.equal(span.summary.actsN, 41);
  assert.equal(span.summary.queueN, 41);
  assert.equal(span.summary.deferredN, 1);
  assert.equal(span.queue.length, DUTY_COVERAGE_LIMITS.readingRollupRowCap);
  assert.match(span.refusals.join(' '), /1 further review row\(s\)/);
  assert.match(dutyCoverageBriefText(at(h.store.state, NOW)), /1 further review row\(s\) are counted but not printed/);
  const register = dutyCoverageCsvRows(at(h.store.state, NOW)).find((r) => r.row_kind === 'register');
  assert.equal(register.span_reading_queue_n, 41, 'the FULL count travels in CSV');
  assert.equal(register.span_reading_deferred_n, 1);
});

/* ------------------------------- 7. report → brief → CSV → Desk → Method → scan */

test('the roll-up feeds the existing brief, both CSV registries, the Desk, Method and the scan event', () => {
  const h = boot();
  const { WHEN } = sixStateTimeline(h);
  const state = h.store.state;
  const report = at(state, WHEN);
  const brief = dutyCoverageBriefText(report);

  // One counts-only, identity-free line, plus the printed refusals.
  assert.match(brief, /Span reading roll-up \(governed hand-offs anywhere in this span\): 6 hand-off\(s\) from 4 leadership seat\(s\) across 2 direct branch\(es\)/);
  assert.match(brief, /4 need a human now \(1 overdue, 1 lapsed, 1 declined, 1 withdrawn\)/);
  assert.match(brief, /oldest overdue ask first/);
  assert.match(brief, /These are counts of dated acts, not ratings of people/);
  assert.match(brief, /another span/);
  for (const token of identityTokens()) assert.ok(!brief.includes(token), `brief carries no ${token}`);

  // CSV: the 15 additive columns ride the EXISTING register and branch-summary
  // row kinds. No new row kind, no new export spec.
  const rows = dutyCoverageCsvRows(report);
  assert.deepEqual([...new Set(rows.map((r) => r.row_kind))].sort(),
    ['branch', 'branch-summary', 'duty', 'register'], 'no row kind was added');
  for (const kind of ['register', 'branch-summary']) {
    const row = rows.find((r) => r.row_kind === kind);
    assert.ok(row, `${kind} row exists`);
    for (const key of SPAN_READINGS_CSV_COLUMNS) {
      assert.ok(Object.hasOwn(row, key), `${kind} carries ${key}`);
    }
    assert.equal(row.span_reading_acts_n, 6);
    assert.equal(row.span_reading_attention_n, 4);
    assert.equal(row.span_reading_outside_n, 1);
    assert.equal(typeof row.span_reading_refused, 'string');
    assert.ok(row.span_reading_refused.length > 0);
  }
  const exported = exportWorkspaceCsv(state, 'duty-coverage', { now: WHEN });
  assert.equal(exported.ok, true);
  assert.equal(exported.columnCount, 66);
  const header = exported.csv.split('\r\n')[0];
  for (const key of SPAN_READINGS_CSV_COLUMNS) assert.ok(header.includes(key), `#duty-cover header carries ${key}`);
  assert.equal(CSV_EXPORTS.length, 142);

  // BLANK (not 0) below rank 3, where no withheld cell exists to govern.
  seat(h, 'mgr-deep1');
  const low = at(h.store.state, WHEN);
  const lowRows = dutyCoverageCsvRows(low);
  const lowRegister = lowRows.find((r) => r.row_kind === 'register');
  const lowSummary = lowRows.find((r) => r.row_kind === 'branch-summary');
  assert.ok(lowRegister, 'the register row exists below rank 3');
  for (const key of SPAN_READINGS_CSV_COLUMNS) {
    assert.equal(lowRegister[key], '', `${key} is BLANK below rank 3`);
    // A rank-2 seat has no withheld branch cell, so no branch-summary row is
    // emitted at all; when one exists it must be BLANK too, never zero.
    if (lowSummary) assert.equal(lowSummary[key], '', `${key} is BLANK below rank 3 on the summary row`);
  }
  assert.equal(/Span reading roll-up/.test(dutyCoverageBriefText(low)), false);
  for (const token of [...identityTokens(), '\n']) {
    if (token === '\n') continue;
    assert.ok(!JSON.stringify(rows).includes(token), 'CSV row objects carry no identity');
  }

  // The existing scan event prints the span counts; no new event type.
  seat(h, 'vp-a');
  h.setNow(WHEN);
  ok(h.api.dutyCoverageScan(), 'scan');
  const scanEvent = (h.store.state.events || []).filter((e) => e.type === DUTY_COVERAGE_EVENTS.SCAN).at(-1);
  assert.ok(scanEvent, 'the existing dutyCoverage.scan event fired');
  assert.match(scanEvent.summary, /Span readings: 6 in span, 4 need a human/);
  assert.match(scanEvent.summary, /Nothing was assigned\.$/);
  assert.match(scanEvent.summary, /inference-only cover check\(s\)/, 'the existing handover-digest text survives');
});

/* ------------------------------------------- 8. the screen, axe-clean */

test('the Desk and Method render the governed review queue, axe-clean and identity-free, at VP and chief', async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    errors.push(`jsdomError: ${e?.message || e}`);
  });
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://leados.test/', virtualConsole });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'getComputedStyle']) {
    globalThis[key] = dom.window[key];
  }
  const h = boot();
  const { WHEN } = sixStateTimeline(h);
  h.setNow(WHEN);

  const surfaces = [];
  for (const id of ['vp-a', 'leader']) {
    seat(h, id);
    for (const panel of ['desk', 'method']) {
      const ctx = { api: h.api, query: new URLSearchParams(`panel=${panel}`), navigate() {}, refresh() {} };
      const node = renderDutyCover(ctx);
      const text = node.textContent;
      if (panel === 'desk') {
        assert.match(text, /Continuity signal across the whole span/);
        assert.match(text, /Span reading gaps/);
        assert.match(text, /Governed review queue/);
        assert.match(text, /Branch 1/);
        assert.match(text, /rank 3/, 'the desk rank is a position number, not a name');
        assert.match(text, /nothing is assigned, chased, reminded or opened/i);
        assert.match(text, /not a clean bill of health/);
      } else {
        assert.match(text, /Span reading roll-up \(ADR-0133\)/);
        assert.match(text, /oldest-overdue-first/);
      }
      for (const token of identityTokens()) {
        assert.ok(!text.includes(token), `${id}/${panel} prints no ${token}`);
      }
      surfaces.push(node);
    }
  }
  dom.window.eval(AXE_SRC);
  for (const node of surfaces) {
    // One surface at a time: four page headers in one document would be a
    // duplicate banner landmark — an artefact of the test, not of the screen.
    dom.window.document.body.replaceChildren(node);
    const results = await dom.window.axe.run(node, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    });
    assert.deepEqual(results.violations.map((v) => `${v.id}: ${v.nodes.length}`), [], 'the surface is axe-clean');
  }
  assert.deepEqual(errors, []);
  dom.window.close();
});

/* ------------------------------------------- 9. fail-closed reload parity */

test('fail-closed reload re-derives the SAME roll-up from the two append-only ledgers', () => {
  const h = boot();
  const { WHEN } = sixStateTimeline(h);
  const before = at(h.store.state, WHEN).spanReadings;
  const reloaded = normalizeState(h.store.state, { now: WHEN });
  // This synthetic fixture writes dated acts up to day 45, so re-normalizing it
  // emits the pre-existing "harvested ahead of today" and broken-link warnings
  // from OTHER modules. What matters here: neither ADR-0129 ledger is dropped
  // or repaired, and the projection is byte-for-byte re-derived.
  assert.equal(reloaded.warnings.filter((w) => /branch reading/i.test(w)).length, 0,
    'no branch-reading act is dropped or repaired on reload');
  assert.equal(reloaded.state.branchReadingAsks.length, h.store.state.branchReadingAsks.length);
  assert.equal(reloaded.state.branchReadings.length, h.store.state.branchReadings.length);
  const after = at(reloaded.state, WHEN).spanReadings;
  assert.deepEqual(after, before, 'nothing was stored: the projection is fully re-derived');
  // A forged, third-party answer is dropped and never enters the roll-up.
  const forged = {
    ...reloaded.state,
    branchReadings: [
      ...reloaded.state.branchReadings,
      {
        id: 'branchreading-forged', askId: 'branchask-t1', branchSeatId: 'mgr-deep1',
        answeredBySeatId: 'dir-a2', answer: 'published', band: 'holding',
        note: 'A third party typed a reassuring band nobody derived.',
        answeredOn: '2027-07-01', answeredAt: later(1).toISOString(), status: 'active',
        version: 'branch-reading-2026.11-v1',
      },
    ],
  };
  const clean = normalizeState(forged, { now: WHEN });
  assert.ok(clean.warnings.length > 0, 'the forgery is dropped with a printed reason');
  assert.equal(clean.state.branchReadings.some((r) => r.id === 'branchreading-forged'), false);
  // Revocation is an append-only act: the lapsed reading falls back to overdue,
  // and the SAME state re-derives it on the next read without a stored state.
  seat(h, 'mgr-deep2');
  const lapsed = (h.store.state.branchReadings || []).find((r) => r.answer === 'published' && r.branchSeatId === 'mgr-deep2');
  assert.ok(lapsed, 'the published reading exists');
  h.setNow(WHEN);
  ok(h.api.branchReadingRevoke({ readingId: lapsed.id, reason: 'The unit reorganisation changed the position.' }), 'revoke');
  seat(h, 'vp-a');
  const afterRevoke = at(h.store.state, WHEN).spanReadings;
  assert.equal(afterRevoke.summary.lapsedN, 0, 'a revoked reading is no longer lapsed');
  assert.equal(afterRevoke.summary.publishedN, 1, 'the other, still-valid reading survives');
  assert.equal(afterRevoke.summary.overdueN, 2, 'the ask falls back to its derived overdue state');
});
