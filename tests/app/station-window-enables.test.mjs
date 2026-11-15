// ADR-0207 — Cross-window enabling declarations: feed, blocked, ambiguous, contradicted.
//
// The `stationWindowEnables` register, its write door and the cross-window
// pass in the station-coverage reader exist (Schema v161). This is the
// dedicated test suite Session 276 left unwritten. Every figure below is
// hand-computed from two dated windows and the calendar relation between them:
// strict order (feeder closes before the consumer opens), same-day, overlap
// and contradiction. The register never infers an order: two adjacent shifts
// say nothing about which one waits for the other until a human declares it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import {
  buildStationCoverage,
  stationCoverageBriefText,
  stationCoverageCsvRows,
} from '../../app/core/domain/stationCoverage.js';
import {
  normalizeSkillStationRows,
  normalizeStationWindowEnables,
  normalizeStationWindows,
  stationWindowEnableError,
  stationWindowRelation,
} from '../../app/core/domain/stationCoverageSchema.js';
import { STATION_COVERAGE_CSV_COLUMNS } from '../../app/core/domain/stationCoverageRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { renderStandardWork } from '../../app/views/standardWork.js';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const AT = '2026-11-10T09:00:00.000Z';
const MON = '2026-11-16';
const TUE = '2026-11-17';
const WED = '2026-11-18';

const person = (id, managerId, level = 'ic') => ({
  id, name: id.toUpperCase(), managerId, level, role: 'Operations', status: 'active', createdAt: AT, updatedAt: AT,
});
const task = (id, holderId) => ({
  id, holderId, title: `Task ${id}`, standard: 'Run the machine to the documented operating standard.',
  floor: 1, declaredAt: AT, retiredOn: null,
});
const act = (id, taskId, personId, byId, extra = {}) => ({
  id, taskId, personId, byId, level: 'U', recordedAt: AT,
  expiresOn: '2026-12-31', evidence: `Observed ${personId} on ${taskId} unsupervised.`, supersedesId: null, ...extra,
});
const win = (id, holderId, fromDay, toDay, extra = {}) => ({
  id, holderId, label: `Shift ${id}`, fromDay, toDay, declaredAt: AT, retiredOn: null, ...extra,
});
const station = (id, windowId, holderId, taskId, extra = {}) => ({
  id, windowId, holderId, title: `Station ${id}`,
  standard: 'Manned and running to the documented standard for the whole shift.',
  taskId, requirement: 'concurrent', demand: 1, declaredAt: AT, retiredOn: null, ...extra,
});
const avail = (id, personId, windowId, fromDay, toDay, byId, extra = {}) => ({
  id, personId, windowId, byId, basis: byId === personId ? 'self' : 'manager',
  fromDay, toDay, capacity: 1, declaredAt: AT,
  withdrawnAt: null, withdrawnBy: null, note: '', stationIds: [], ...extra,
});

// Two windows, two stations, one qualified available person per station.
// W1 (Ann's window, Monday) feeds W2 (Kim's window, Tuesday). Ann manages Kim,
// so Ann is the lowest joint apex of the two window holders and may declare
// between them; nobody else can.
const BASE = {
  skillTasks: [task('T1', 'ann'), task('T2', 'ann')],
  skillActs: [
    act('q1', 'T1', 'kim', 'ann'),
    act('q2', 'T2', 'toni', 'ann'),
  ],
  stationWindows: [win('W1', 'ann', MON, MON), win('W2', 'kim', TUE, TUE)],
  skillStations: [
    station('S1', 'W1', 'ann', 'T1'),
    station('S2', 'W2', 'kim', 'T2'),
  ],
  stationAvailability: [
    avail('a1', 'kim', 'W1', MON, MON, 'kim'),
    avail('a2', 'toni', 'W2', TUE, TUE, 'toni'),
  ],
};

// One live cross-window declaration: W1's S1 feeds W2's S2, declared by Ann
// (the joint apex of the two window holders), verbatim as the register stores it.
const E1 = {
  id: 'e1', fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2',
  byId: 'ann', basis: 'joint-apex', reason: 'The feed line must be up before the pack station can run.', declaredAt: AT, retiredOn: null, retiredBy: null, retireReason: null,
};

function fixture(patch = {}) {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    person('ada', null, 'vp'), person('ann', 'ada'), person('kim', 'ann'),
    person('toni', 'kim'), person('bob', 'ada'),
  ];
  raw.reportingLines = [];
  return normalizeState({ ...raw, ...patch }, { now: NOW }).state;
}

const read = (state) => buildStationCoverage(state, { now: NOW });
const windowOf = (report, id) => report.windows.find((row) => row.windowId === id);

function openStore(patch = {}) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(fixture(patch))]]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  let n = 0;
  const idFactory = (prefix) => `${prefix}-t${++n}`;
  const store = createStore({ storage, now: () => NOW, idFactory, postCommitRules: [] });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  const takeSeat = (id) =>
    store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
      { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'test seat' });
  return { store, api, takeSeat };
}

function feedSummary(feed) {
  return {
    status: feed.status,
    declaredN: feed.declaredN,
    liveN: feed.liveN,
    orderN: feed.orderN,
    blockedN: feed.blockedN,
    unprovenN: feed.unprovenN,
    ambiguousN: feed.ambiguousN,
    contradictedN: feed.contradictedN,
    withheldN: feed.withheldN,
    danglingN: feed.danglingN,
    downstreamN: feed.downstreamN,
  };
}

/* ------------------------------------------------------------- reader */

test('schema is at v161 and the cross-window ledger is a real, empty collection', () => {
  assert.equal(SCHEMA_VERSION, 172);
  const state = normalizeState(fixture(), { now: NOW }).state;
  assert.ok(Array.isArray(state.stationWindowEnables));
  assert.equal(state.stationWindowEnables.length, 0);
});

test('strict calendar order proves the feed: the Monday feeder precedes the Tuesday consumer', () => {
  const report = read(fixture({ ...BASE, stationWindowEnables: [E1] }));
  const w1 = windowOf(report, 'W1');
  const w2 = windowOf(report, 'W2');
  // Each window stands alone: one station, nobody competing, no claim either way.
  assert.equal(w1.verdict, 'inert');
  assert.equal(w2.verdict, 'inert');
  assert.deepEqual(w1.stations.map((s) => ({ stationId: s.stationId, state: s.state })), [{ stationId: 'S1', state: 'single-point' }]);
  assert.deepEqual(w2.stations.map((s) => ({ stationId: s.stationId, state: s.state })), [{ stationId: 'S2', state: 'single-point' }]);
  // W1 declares nothing: no prerequisite, no claim.
  assert.equal(w1.feed.status, 'none');
  assert.equal(w1.feed.declaredN, 0);
  assert.equal(w1.feed.liveN, 0);
  // W2 declares W1's S1 as its prerequisite: the calendar proves the order.
  assert.equal(w2.feed.status, 'fed');
  assert.equal(w2.feed.declaredN, 1);
  assert.equal(w2.feed.liveN, 1);
  assert.equal(w2.feed.orderN, 1);
  assert.equal(w2.feed.blockedN, 0);
  assert.equal(w2.feed.ambiguousN, 0);
  assert.equal(w2.feed.contradictedN, 0);
  assert.equal(w2.feed.danglingN, 0);
  const edge = w2.feed.edges[0];
  assert.equal(edge.toStationId, 'S2');
  assert.equal(edge.fromStationId, 'S1');
  assert.equal(edge.fromWindowId, 'W1');
  assert.equal(edge.status, 'order');
  assert.equal(edge.proven, true);
  assert.equal(edge.relation, 'strict');
  assert.equal(edge.relationLabel, 'Calendar order proven — the feeder window closes first');
  assert.equal(edge.declaredBy, 'ANN');
  assert.equal(edge.basis, 'joint-apex');
  assert.equal(edge.fromTitle, 'Station S1');
  assert.equal(edge.toTitle, 'Station S2');
  assert.equal(edge.fromWindowVerdict, 'inert');
  assert.equal(edge.fromState, 'single-point');
  assert.ok(edge.why.includes('the order holds for every possible running order'));
  // The station keeps its own reading: a proven prerequisite does not block it.
  assert.equal(report.totals.crossWindowEdgesN, 1);
  assert.equal(report.totals.crossWindowLiveN, 1);
  assert.equal(report.totals.crossWindowOrderN, 1);
  assert.equal(report.totals.feedFedWindowsN, 1);
  assert.equal(report.claims.countsReconcile, true);
  assert.equal(report.claims.figuresComplete, true);
  assert.equal(report.claims.ordersComplete, true);
  assert.equal(report.claims.reasons.length, 0);
  assert.ok(stationCoverageBriefText(report).includes('1 calendar order(s)'));
});

test('windows meeting on one day make the order ambiguous, never assumed', () => {
  const report = read(fixture({ ...BASE,
    stationWindows: [win('W1', 'ann', MON, MON), win('W2', 'kim', MON, MON)],
    stationAvailability: [
      avail('a1', 'kim', 'W1', MON, MON, 'kim'), avail('a2', 'toni', 'W2', MON, MON, 'toni'),
    ],
    stationWindowEnables: [E1],
  }));
  const w2 = windowOf(report, 'W2');
  assert.equal(w2.feed.status, 'ambiguous');
  const edge = w2.feed.edges[0];
  assert.equal(edge.status, 'ambiguous');
  assert.equal(edge.proven, false);
  assert.equal(edge.relation, 'same-day');
  assert.ok(edge.why.includes('holds no clock below the day'));
  // The dependent station keeps its own state: ambiguity blocks nothing.
  assert.equal(w2.stations[0].state, 'single-point');
  assert.equal(w2.verdict, 'inert');
  assert.equal(report.totals.crossWindowAmbiguousN, 1);
  assert.equal(report.totals.crossWindowOrderN, 0);
  assert.equal(report.claims.countsReconcile, true);
  assert.equal(report.claims.figuresComplete, true);
  // Ambiguity is a separate claim: it does not make the figures incomplete,
  // but it does mean the declared orders are not complete.
  assert.equal(report.claims.ordersComplete, false);
  assert.ok(report.claims.reasons.some((r) => r.includes('does not prove')));
});

test('overlapping windows are also ambiguous: the calendar forces nothing', () => {
  const report = read(fixture({ ...BASE,
    stationWindows: [win('W1', 'ann', MON, WED), win('W2', 'kim', TUE, TUE)],
    stationAvailability: [
      avail('a1', 'kim', 'W1', MON, WED, 'kim'), avail('a2', 'toni', 'W2', TUE, TUE, 'toni'),
    ],
    stationWindowEnables: [E1],
  }));
  const w2 = windowOf(report, 'W2');
  assert.equal(w2.feed.status, 'ambiguous');
  assert.equal(w2.feed.edges[0].relation, 'overlap');
  assert.equal(w2.feed.edges[0].proven, false);
  assert.equal(report.totals.crossWindowAmbiguousN, 1);
  assert.equal(report.claims.ordersComplete, false);
});

test('a consumer window that closes before the feeder opens contradicts the order', () => {
  const report = read(fixture({ ...BASE,
    stationWindows: [win('W1', 'ann', WED, WED), win('W2', 'kim', MON, MON)],
    stationAvailability: [
      avail('a1', 'kim', 'W1', WED, WED, 'kim'), avail('a2', 'toni', 'W2', MON, MON, 'toni'),
    ],
    stationWindowEnables: [E1],
  }));
  const w2 = windowOf(report, 'W2');
  const edge = w2.feed.edges[0];
  assert.equal(edge.relation, 'contradiction');
  assert.equal(edge.status, 'contradiction');
  assert.equal(edge.proven, true);
  assert.ok(edge.why.includes('the feeder can never be manned first'));
  // A proven contradiction flips the window off `feasible`/`inert` and the
  // dependent station reads `blocked-by-enabler`, its own pool still printed.
  assert.equal(w2.feed.status, 'contradicted');
  assert.equal(w2.stations[0].state, 'blocked-by-enabler');
  assert.ok(w2.stations[0].reason.includes('cannot be manned'));
  assert.equal(w2.verdict, 'blocked');
  assert.equal(w2.proven, true);
  assert.ok(w2.reasons.some((r) => r.startsWith('The calendar forbids the declared prerequisite order')));
  assert.equal(report.totals.crossWindowContradictionsN, 1);
  assert.equal(report.totals.blockedWindowsN, 1);
  // Contradiction is a proof, not a gap: figures stay complete and orders complete.
  assert.equal(report.claims.countsReconcile, true);
  assert.equal(report.claims.figuresComplete, true);
  assert.equal(report.claims.ordersComplete, true);
});

test('a feeder station nobody can man blocks the dependent window, proven', () => {
  const report = read(fixture({ ...BASE,
    // Kim is qualified for T1 but declares no availability: S1 cannot be manned.
    stationAvailability: [avail('a2', 'toni', 'W2', TUE, TUE, 'toni')],
    stationWindowEnables: [E1],
  }));
  const w1 = windowOf(report, 'W1');
  const w2 = windowOf(report, 'W2');
  assert.equal(w1.stations[0].state, 'no-available');
  assert.ok(w1.reasons.some((r) => r.includes('none declared availability')));
  const edge = w2.feed.edges[0];
  assert.equal(edge.status, 'blocked');
  assert.equal(edge.proven, true);
  assert.equal(w2.feed.status, 'blocked');
  assert.equal(w2.stations[0].state, 'blocked-by-enabler');
  assert.ok(w2.stations[0].reason.includes('cannot be manned'));
  assert.equal(w2.verdict, 'blocked');
  assert.equal(report.totals.crossWindowBlockedN, 1);
  assert.equal(report.totals.feedBlockedWindowsN, 1);
  // The unproven feeder makes this register incomplete, but not contradictory.
  assert.equal(report.claims.countsReconcile, true);
  assert.equal(report.claims.figuresComplete, false);
  assert.equal(report.claims.ordersComplete, true);
  // S1's own no-availability reason is printed on W1; it does not reach the
  // cross-window claims because W2's blocked order is a proven reason.
  assert.equal(report.claims.reasons.length, 0);
});

test('a proven order chains across three windows', () => {
  const report = read(fixture({ ...BASE,
    stationWindows: [win('W1', 'ann', MON, MON), win('W2', 'kim', TUE, TUE), win('W3', 'ann', WED, WED)],
    skillStations: [
      station('S1', 'W1', 'ann', 'T1'), station('S2', 'W2', 'kim', 'T2'), station('S3', 'W3', 'ann', 'T2'),
    ],
    skillActs: [
      act('q1', 'T1', 'kim', 'ann'), act('q2', 'T2', 'toni', 'ann'), act('q3', 'T2', 'kim', 'ann'),
    ],
    stationAvailability: [
      avail('a1', 'kim', 'W1', MON, MON, 'kim'), avail('a2', 'toni', 'W2', TUE, TUE, 'toni'), avail('a3', 'kim', 'W3', WED, WED, 'kim'),
    ],
    stationWindowEnables: [
      { id: 'e1', fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2', byId: 'ann', basis: 'joint-apex', reason: 'The feed line must be up before the pack station can run.', declaredAt: AT, retiredOn: null, retiredBy: null, retireReason: null },
      { id: 'e2', fromWindowId: 'W2', fromStationId: 'S2', toWindowId: 'W3', toStationId: 'S3', byId: 'ann', basis: 'joint-apex', reason: 'The pack line must be up before the label station can run.', declaredAt: AT, retiredOn: null, retiredBy: null, retireReason: null },
    ],
  }));
  const w2 = windowOf(report, 'W2');
  const w3 = windowOf(report, 'W3');
  assert.equal(w2.feed.status, 'fed');
  assert.equal(w2.feed.orderN, 1);
  assert.equal(w3.feed.status, 'fed');
  assert.equal(w3.feed.orderN, 1);
  assert.equal(w3.feed.edges[0].fromWindowId, 'W2');
  assert.equal(w3.feed.edges[0].status, 'order');
  assert.equal(w3.feed.edges[0].proven, true);
  assert.equal(report.totals.crossWindowOrderN, 2);
  assert.equal(report.totals.crossWindowEdgesN, 2);
  assert.equal(report.claims.countsReconcile, true);
  assert.equal(report.claims.figuresComplete, true);
  assert.equal(report.claims.ordersComplete, true);
});

test('a retired dependent station leaves the declaration dangling: it carries no order', () => {
  const report = read(fixture({ ...BASE,
    skillStations: [
      station('S1', 'W1', 'ann', 'T1'),
      station('S2', 'W2', 'kim', 'T2', { retiredOn: WED }),
    ],
    stationWindowEnables: [E1],
  }));
  const w2 = windowOf(report, 'W2');
  assert.equal(w2.stations.length, 0, 'the retired station is not listed as live');
  assert.equal(w2.feed.status, 'none');
  assert.equal(w2.feed.declaredN, 1);
  assert.equal(w2.feed.liveN, 1, 'the declaration itself is not retired');
  assert.equal(w2.feed.retiredN, 0);
  assert.equal(w2.feed.danglingN, 1);
  const edge = w2.feed.edges[0];
  assert.equal(edge.status, 'dangling');
  assert.equal(edge.proven, false);
  assert.ok(edge.why.includes('no longer live in this window'));
  assert.equal(w2.verdict, 'inert');
  assert.equal(report.totals.crossWindowDanglingN, 1);
  assert.equal(report.claims.countsReconcile, true);
  assert.equal(report.claims.figuresComplete, true);
});

test('a retired window leaves every declaration naming it dangling', () => {
  const report = read(fixture({ ...BASE,
    stationWindows: [win('W1', 'ann', MON, MON), win('W2', 'kim', TUE, TUE, { retiredOn: WED })],
    skillStations: [
      station('S1', 'W1', 'ann', 'T1'),
      station('S2', 'W2', 'kim', 'T2'),
    ],
    stationWindowEnables: [
      { id: 'e1', fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2', byId: 'ann', basis: 'joint-apex', reason: 'The feed line must be up before the pack station can run.', declaredAt: AT, retiredOn: null, retiredBy: null, retireReason: null },
    ],
  }));
  const w1 = windowOf(report, 'W1');
  assert.equal(w1.feed.status, 'none');
  assert.equal(w1.feed.declaredN, 0);
  const w2 = windowOf(report, 'W2');
  assert.equal(w2.feed.status, 'none');
  assert.equal(w2.feed.declaredN, 1);
  assert.equal(w2.feed.liveN, 1, 'the declaration itself is not retired');
  assert.equal(w2.feed.retiredN, 0);
  assert.equal(w2.feed.danglingN, 1);
  const edge = w2.feed.edges[0];
  assert.equal(edge.status, 'dangling');
  assert.equal(edge.proven, false);
  assert.ok(edge.why.includes('One of the windows in this declaration has been retired'));
  assert.equal(report.totals.crossWindowDanglingN, 1);
  assert.equal(report.claims.countsReconcile, true);
});

test('a feeder station no longer live leaves the declaration dangling', () => {
  const report = read(fixture({ ...BASE,
    skillStations: [
      station('S1', 'W1', 'ann', 'T1', { retiredOn: TUE }),
      station('S2', 'W2', 'kim', 'T2'),
    ],
    stationWindowEnables: [E1],
  }));
  const w2 = windowOf(report, 'W2');
  assert.equal(w2.feed.status, 'none');
  assert.equal(w2.feed.danglingN, 1);
  assert.equal(w2.feed.edges[0].status, 'dangling');
  assert.equal(w2.feed.edges[0].proven, false);
  assert.ok(w2.feed.edges[0].why.includes('feeder station is no longer live in its window'));
  assert.equal(w2.stations[0].state, 'single-point', 'the dependent station is not punished for a dead feeder');
});

test('a seat that cannot see the feeder window reads the declaration as withheld, never as a claim', () => {
  const state = fixture({ ...BASE,
    stationWindowEnables: [
      { id: 'e1', fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2', byId: 'ann', basis: 'joint-apex', reason: 'The feed line must be up before the pack station can run.', declaredAt: AT, retiredOn: null, retiredBy: null, retireReason: null },
    ],
  });
  const seat = { id: 'bob', nodeId: 'bob', fullAccess: false, scope: new Set(['kim']), lineScope: new Set(), disclosure: { floorN: 0 } };
  const report = buildStationCoverage(state, { now: NOW, seat });
  const w2 = windowOf(report, 'W2');
  // Bob's reach covers Kim's window but not Ann's: the feeder window is outside his span.
  assert.equal(report.windows.length, 1, 'windows outside the seat\u2019s reach are not readable');
  assert.equal(w2.feed.declaredN, 1);
  assert.equal(w2.feed.liveN, 1);
  assert.equal(w2.feed.danglingN, 0);
  // ADR-0207 promises the difference between a declaration that is dangling and
  // one whose feeder is another span's record: this is the latter, counted as
  // withheld and never repaired into a claim about a window the seat cannot see.
  assert.equal(w2.feed.withheldN, 1);
  const edge = w2.feed.edges[0];
  assert.equal(edge.status, 'withheld');
  assert.equal(edge.proven, false);
  assert.equal(edge.fromTitle, null, 'the feeder station is another span\u2019s record');
  assert.ok(edge.why.includes('outside this seat\u2019s reach'));
  assert.equal(w2.verdict, 'inert');
  // Below the disclosure floor the dependent's own coverage is withheld from
  // this span view — but it is never re-labelled `blocked-by-enabler` for a
  // feeder the seat cannot read; the declaration reads as dangling, never as a claim.
  assert.equal(w2.stations[0].state, 'withheld', 'the dependent station is not punished for an unreachable feeder');
  assert.equal(report.claims.figuresComplete, true);
});

/* ------------------------------------------------------------ normalizer */

test('station window relation: strict, same-day, overlap, contradiction', () => {
  assert.equal(stationWindowRelation({ fromDay: MON, toDay: MON }, { fromDay: TUE, toDay: TUE }), 'strict');
  assert.equal(stationWindowRelation({ fromDay: MON, toDay: MON }, { fromDay: MON, toDay: MON }), 'same-day');
  assert.equal(stationWindowRelation({ fromDay: MON, toDay: WED }, { fromDay: TUE, toDay: TUE }), 'overlap');
  assert.equal(stationWindowRelation({ fromDay: TUE, toDay: TUE }, { fromDay: MON, toDay: MON }), 'contradiction');
  assert.equal(stationWindowRelation(null, { fromDay: MON, toDay: MON }), null);
  assert.equal(stationWindowRelation({ fromDay: MON, toDay: MON }, null), null);
});

test('the normalizer retains and refuses bad cross-window rows, and keeps the good one', () => {
  const windows = normalizeStationWindows([win('W1', 'ann', MON, MON), win('W2', 'kim', TUE, TUE)], []);
  const stations = normalizeSkillStationRows([
    station('S1', 'W1', 'ann', 'T1'), station('S2', 'W2', 'kim', 'T2'),
  ], windows, []);
  const warnings = [];
  const rows = normalizeStationWindowEnables([
    { id: 'e1', fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2', byId: 'ann', basis: 'joint-apex', reason: 'The feed line must be up before the pack station can run.', declaredAt: AT, retiredOn: null, retiredBy: null, retireReason: null },
    { id: 'e2', fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2', byId: 'ann', basis: 'joint-apex', reason: 'A second live declaration of the same ordered station pair must not exist.', declaredAt: AT, retiredOn: null, retiredBy: null, retireReason: null },
    { id: 'e3', fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W1', toStationId: 'S1', byId: 'ann', basis: 'joint-apex', reason: 'Same window on both sides is a category error.', declaredAt: AT, retiredOn: null, retiredBy: null, retireReason: null },
    { id: 'e4', fromWindowId: 'W1', fromStationId: 'S9', toWindowId: 'W2', toStationId: 'S2', byId: 'ann', basis: 'joint-apex', reason: 'The enabler is a ghost station.', declaredAt: AT, retiredOn: null, retiredBy: null, retireReason: null },
    { id: 'e5', fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2', byId: 'ann', basis: 'joint-apex', reason: 'short', declaredAt: AT, retiredOn: null, retiredBy: null, retireReason: null },
  ], { windows, stations }, warnings);
  assert.equal(rows.filter((r) => r.invalid).length, 4);
  assert.equal(rows.find((r) => r.id === 'e1').invalid, undefined);
  assert.equal(rows.find((r) => r.id === 'e2').invalid, true, 'the normalizer itself refuses a second live declaration of one ordered pair');
  assert.equal(rows.find((r) => r.id === 'e3').invalid, true);
  assert.equal(rows.find((r) => r.id === 'e4').invalid, true);
  assert.equal(rows.find((r) => r.id === 'e5').invalid, true);
  assert.equal(warnings.some((w) => w.includes('two live declarations for one ordered station pair')), true);
});

test('stationWindowEnableError refuses ghost windows, stations, short reasons and retired contradictions', () => {
  const windows = normalizeStationWindows([win('W1', 'ann', MON, MON), win('W2', 'kim', TUE, TUE)], []);
  const stations = normalizeSkillStationRows([station('S1', 'W1', 'ann', 'T1'), station('S2', 'W2', 'kim', 'T2')], windows, []);
  const base = { id: 'e1', fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2', byId: 'ann', basis: 'joint-apex', reason: 'The feeder must come up before the dependent.', declaredAt: AT, retiredOn: null, retiredBy: null, retireReason: null };
  // Stating the same window on both sides is refused: one order has exactly one home.
  assert.equal(stationWindowEnableError({ ...base, toWindowId: 'W1' }, { windows, stations }),
    'Both stations sit in the same window; that order belongs to the in-window enabling register, so one order has exactly one home.');
  // A declaration naming a window that does not exist is refused.
  assert.ok(stationWindowEnableError({ ...base, toWindowId: 'W9' }, { windows, stations }).includes('not a readable declaration'));
  // A station that is not live in its named window is refused.
  assert.ok(stationWindowEnableError({ ...base, fromStationId: 'S9' }, { windows, stations }).includes('not a readable station'));
  // A reason below the floor is refused.
  assert.ok(stationWindowEnableError({ ...base, reason: 'too short' }, { windows, stations }).includes('at least 10 characters'));
  // A declaration that predates its own window is a contradiction, not a clamp.
  assert.ok(stationWindowEnableError({ ...base, declaredAt: '2026-11-09T09:00:00.000Z' }, { windows, stations }).includes('predates one of its windows'));
  // Retirement without a declarer, and a declarer without a retirement, are contradictions.
  assert.ok(stationWindowEnableError({ ...base, retiredOn: '2026-11-20', retiredBy: null }, { windows, stations }).includes('retirement must name who retired'));
  assert.ok(stationWindowEnableError({ ...base, retiredBy: 'ann' }, { windows, stations }).includes('declarer exists with no retirement'));
  assert.ok(stationWindowEnableError({ ...base, retiredOn: '2026-11-20', retiredBy: 'ann', retireReason: 'x' }, { windows, stations }).includes('at least 5 characters'));
});

/* ------------------------------------------------------------ write door */

test('declaring a cross-window prerequisite through the real store: joint apex, stored verbatim, event appended', () => {
  const { store, api, takeSeat } = openStore(BASE);
  takeSeat('ann');
  const declared = api.stationCoverageDeclareWindowEnable({
    fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2',
    reason: 'The feed line must be up before the pack station can run.',
  });
  assert.equal(declared.ok, true, declared.error);
  assert.equal(declared.relation, 'strict');
  const row = store.state.stationWindowEnables.at(-1);
  assert.equal(row.id.startsWith('station-window-enable-t'), true);
  assert.equal(row.fromWindowId, 'W1');
  assert.equal(row.fromStationId, 'S1');
  assert.equal(row.toWindowId, 'W2');
  assert.equal(row.toStationId, 'S2');
  assert.equal(row.byId, 'ann');
  assert.equal(row.basis, 'joint-apex');
  assert.equal(row.reason, 'The feed line must be up before the pack station can run.');
  assert.equal(row.declaredAt.slice(0, 10), '2026-11-20');
  assert.equal(row.retiredOn, null);
  assert.equal(store.state.events.filter((e) => e.type === 'stations.window-enable.declared').length, 1);
  // The reader re-derives the same order from the stored row.
  const report = buildStationCoverage(store.state, { now: NOW });
  const w2 = windowOf(report, 'W2');
  assert.equal(w2.feed.status, 'fed');
  assert.equal(w2.feed.orderN, 1);
  assert.equal(w2.feed.edges[0].status, 'order');
  assert.equal(w2.feed.edges[0].proven, true);
  assert.equal(report.totals.crossWindowOrderN, 1);
  assert.equal(report.claims.countsReconcile, true);
  assert.equal(report.claims.figuresComplete, true);
});

test('a second live declaration of the same ordered station pair is refused', () => {
  const { store, api, takeSeat } = openStore(BASE);
  takeSeat('ann');
  const first = api.stationCoverageDeclareWindowEnable({
    fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2',
    reason: 'The feed line must be up before the pack station can run.',
  });
  assert.equal(first.ok, true, first.error);
  const second = api.stationCoverageDeclareWindowEnable({
    fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2',
    reason: 'The same order written a second time must not create a second claim.',
  });
  assert.equal(second.ok, false);
  assert.ok(second.error.includes('already stands'), `unexpected refusal: ${second.error}`);
  assert.equal(store.state.stationWindowEnables.length, 1);
  assert.equal(store.state.events.filter((e) => e.type === 'stations.window-enable.declared').length, 1);
});

test('a manager cannot order a peer\u2019s window: only the seat holding both lines may declare', () => {
  const { store, api, takeSeat } = openStore(BASE);
  takeSeat('ann');
  assert.equal(api.stationCoverageDeclareWindowEnable({
    fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2',
    reason: 'Ann holds Ann\u2019s own line and Kim\u2019s line, so she is the joint apex.',
  }).ok, true);
  // Kim and ada both hold leadership seats; neither holds both windows.
  for (const seatId of ['kim', 'ada']) {
    takeSeat(seatId);
    const refused = api.stationCoverageDeclareWindowEnable({
      fromWindowId: 'W2', fromStationId: 'S2', toWindowId: 'W1', toStationId: 'S1',
      reason: `A seat that does not hold both lines must not order across them (${seatId}).`,
    });
    assert.equal(refused.ok, false, `${seatId} must be refused: ${JSON.stringify(refused)}`);
    assert.ok(refused.error.includes('not one holder'), `${seatId} wrong refusal: ${refused.error}`);
  }
  // Nothing was written by the refusals: Ann's single declaration stands.
  assert.equal(store.state.stationWindowEnables.length, 1);
  assert.equal(store.state.events.filter((e) => e.type === 'stations.window-enable.declared').length, 1);
});

test('a contradiction is recordable: the register prints it and asks the declarer to repair', () => {
  const { store, api, takeSeat } = openStore(BASE);
  takeSeat('ann');
  const declared = api.stationCoverageDeclareWindowEnable({
    fromWindowId: 'W2', fromStationId: 'S2', toWindowId: 'W1', toStationId: 'S1',
    reason: 'Tuesday cannot feed Monday: the consumer closes before the feeder opens.',
  });
  assert.equal(declared.ok, true, declared.error);
  assert.equal(declared.relation, 'contradiction');
  assert.ok(declared.warning, 'the contradiction warning must be printed');
  assert.ok(declared.warning.includes('contradicts'), `unexpected warning: ${declared.warning}`);
  const report = buildStationCoverage(store.state, { now: NOW });
  const w1 = windowOf(report, 'W1');
  assert.equal(w1.feed.status, 'contradicted');
  assert.equal(w1.stations[0].state, 'blocked-by-enabler');
  assert.equal(w1.verdict, 'blocked');
});

test('declarations are refused at the door: same window, retired window, ghost station, short reason', () => {
  const { store: firstStore, api: firstApi, takeSeat } = openStore(BASE);
  takeSeat('ann');
  // Same window pair is refused inside the action itself.
  const same = firstApi.stationCoverageDeclareWindowEnable({ fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W1', toStationId: 'S2', reason: 'Same-window order has no home.' });
  assert.equal(same.ok, false);
  assert.ok(same.error.includes('one order has exactly one home'));
  // A retired window names nothing anybody can run.
  const { store: secondStore, api: secondApi, takeSeat: takeSeat2 } = openStore({ ...BASE, stationWindows: [win('W1', 'ann', MON, MON), win('W2', 'kim', TUE, TUE, { retiredOn: WED })], skillStations: [station('S1', 'W1', 'ann', 'T1'), station('S2', 'W2', 'kim', 'T2')] });
  takeSeat2('ann');
  const retired = secondApi.stationCoverageDeclareWindowEnable({ fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2', reason: 'A retired window orders nothing.' });
  assert.equal(retired.ok, false);
  assert.ok(retired.error.includes('live windows'), `unexpected: ${retired.error}`);
  // Both windows live: a ghost dependent station is refused.
  const { store: thirdStore, api: thirdApi, takeSeat: takeSeat3 } = openStore(BASE);
  takeSeat3('ann');
  const ghost = thirdApi.stationCoverageDeclareWindowEnable({ fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S9', reason: 'The dependent station must exist in its window.' });
  assert.equal(ghost.ok, false);
  assert.ok(ghost.error.includes('station'), `unexpected: ${ghost.error}`);
  // A reason below the floor is refused.
  const short = thirdApi.stationCoverageDeclareWindowEnable({ fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2', reason: 'tiny' });
  assert.equal(short.ok, false);
  assert.ok(short.error.includes('at least 10 characters'), `unexpected: ${short.error}`);
  // No row survived any refusal, in any store.
  assert.equal(firstStore.state.stationWindowEnables.length, 0);
  assert.equal(secondStore.state.stationWindowEnables.length, 0);
  assert.equal(thirdStore.state.stationWindowEnables.length, 0);
});

test('retiring a cross-window declaration drops the order and restores the window', () => {
  const { store, api, takeSeat } = openStore(BASE);
  takeSeat('ann');
  const declared = api.stationCoverageDeclareWindowEnable({
    fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2',
    reason: 'The feed line must be up before the pack station can run.',
  });
  assert.equal(declared.ok, true);
  const row = store.state.stationWindowEnables.find((r) => !r.retiredOn);
  const retired = api.stationCoverageRetireWindowEnable(row.id, 'The line was recommissioned after the refit, so the order is gone.');
  assert.equal(retired.ok, true, retired.error);
  const kept = store.state.stationWindowEnables.find((r) => r.id === row.id);
  assert.equal(kept.retiredOn, '2026-11-20');
  assert.equal(kept.retiredBy, 'ann');
  assert.equal(kept.retireReason, 'The line was recommissioned after the refit, so the order is gone.');
  assert.equal(kept.reason, 'The feed line must be up before the pack station can run.', 'the original declaration is never edited');
  const report = buildStationCoverage(store.state, { now: NOW });
  const w2 = windowOf(report, 'W2');
  assert.equal(w2.feed.status, 'none');
  assert.equal(w2.feed.declaredN, 1);
  assert.equal(w2.feed.liveN, 0);
  assert.equal(w2.feed.retiredN, 1);
  assert.equal(w2.feed.orderN, 0);
  assert.equal(w2.stations[0].state, 'single-point');
  assert.equal(w2.verdict, 'inert');
  assert.equal(report.totals.crossWindowOrderN, 0);
  assert.equal(report.claims.countsReconcile, true);
  assert.equal(report.claims.figuresComplete, true);
});

test('retiring a cross-window declaration is governed: once, by the declarer, with a reason', () => {
  const { store, api, takeSeat } = openStore(BASE);
  takeSeat('ann');
  const declared = api.stationCoverageDeclareWindowEnable({
    fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2',
    reason: 'The feed line must be up before the pack station can run.',
  });
  assert.equal(declared.ok, true);
  const row = store.state.stationWindowEnables.at(-1);
  takeSeat('kim');
  assert.equal(api.stationCoverageRetireWindowEnable(row.id, 'Someone else may not retire it.').ok, false);
  takeSeat('ann');
  assert.equal(api.stationCoverageRetireWindowEnable(row.id, 'tiny').ok, false);
  const first = api.stationCoverageRetireWindowEnable(row.id, 'The interlock was removed after the line change was commissioned.');
  assert.equal(first.ok, true, first.error);
  const second = api.stationCoverageRetireWindowEnable(row.id, 'Already retired.');
  assert.equal(second.ok, false);
  assert.equal(store.state.stationWindowEnables.filter((r) => r.id === row.id && !r.retiredOn).length, 0);
});

/* ------------------------------------------------------------ CSV and store-door read */

test('CSV #148 carries the cross-window counts the screen printed, identity-free', () => {
  const draft = fixture({ ...BASE, stationWindowEnables: [E1] });
  const report = read(draft);
  const rows = stationCoverageCsvRows(report);
  const workspace = rows.find((r) => r.row_type === 'workspace');
  assert.equal(workspace.cross_window_edges_n, 1);
  assert.equal(workspace.cross_window_order_edges_n, 1);
  assert.equal(workspace.cross_window_ambiguous_edges_n, 0);
  assert.equal(workspace.cross_window_contradictions_n, 0);
  assert.equal(workspace.counts_reconcile, 'yes');
  const exported = exportWorkspaceCsv(draft, 'skill-station-coverage', { now: NOW });
  assert.equal(exported.ok, true, exported.reason);
  const parsed = parseCsv(exported.content ?? exported.csv);
  assert.deepEqual(parsed.headers, STATION_COVERAGE_CSV_COLUMNS);
  assert.equal(parsed.rows.length, rows.length);
  const flat = String(exported.content ?? exported.csv);
  for (const secret of ['ANN', 'KIM', 'TONI', 'BOB', 'Station S1', 'Station S2', 'Task T1', 'Task T2', 'W1', 'W2', 'Shift W1']) {
    assert.equal(flat.includes(secret), false, `${secret} must not reach the export`);
  }
});

test('a read never mutates the stored record or bumps the revision', () => {
  const state = fixture(BASE);
  const before = JSON.stringify(state);
  const eventsBefore = storeEventCount(state);
  const first = read(state);
  const second = read(state);
  assert.deepEqual(first, second, 'two reads of the same record must print identical figures');
  assert.equal(JSON.stringify(state), before, 'the reader must not write back into the stored state');
  assert.equal(storeEventCount(state), eventsBefore, 'a read appends no event');
});

function storeEventCount(state) {
  return Array.isArray(state.events) ? state.events.length : 0;
}

/* ----------------------------------------------------- matrix and single chain */

test('a declared second reporting line does not move the coverage figures', () => {
  // Kim declares a second line to Ada on top of her home line to Ann. The
  // matrix layer sits over the hierarchy engine: an extra declared line changes
  // who may declare between windows at the write door, not what the calendar
  // proves about two already-declared windows.
  const matrix = fixture({ ...BASE, reportingLines: [{ id: 'rl1', personId: 'kim', managerId: 'ada' }], stationWindowEnables: [E1] });
  const single = read(fixture({ ...BASE, stationWindowEnables: [E1] }));
  const crossed = read(matrix);
  assert.deepEqual(crossed.windows, single.windows);
  assert.deepEqual(crossed.totals, single.totals);
  assert.deepEqual(crossed.claims, single.claims);
  // In single-chain the same read proves the same order.
  assert.equal(windowOf(crossed, 'W2').feed.status, 'fed');
  assert.equal(crossed.totals.crossWindowOrderN, 1);
});

test('the joint apex is still Ann with a second line in play, and a peer seat is still refused', () => {
  const { store, api, takeSeat } = openStore({ ...BASE, reportingLines: [{ id: 'rl1', personId: 'kim', managerId: 'ada' }] });
  takeSeat('ann');
  assert.equal(api.stationCoverageDeclareWindowEnable({
    fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2',
    reason: 'Ann remains the lowest joint apex of Ann\u2019s window and Kim\u2019s window.',
  }).ok, true);
  takeSeat('ada');
  assert.equal(api.stationCoverageDeclareWindowEnable({
    fromWindowId: 'W1', fromStationId: 'S1', toWindowId: 'W2', toStationId: 'S2',
    reason: 'Ada holds Ann\u2019s line but not Kim\u2019s: not the apex of both windows.',
  }).ok, false);
});

/* ------------------------------------------------------------------ the panel */

// The panel's own fixture: the two windows sit AFTER the reader's day, so they
// are live work rather than history. Nothing else changes — the calendar
// relation between Monday and Tuesday is still `strict`.
const PANEL = {
  ...BASE,
  stationWindows: [win('W1', 'ann', '2026-12-07', '2026-12-07'), win('W2', 'kim', '2026-12-08', '2026-12-08')],
  stationAvailability: [
    avail('a1', 'kim', 'W1', '2026-12-07', '2026-12-07', 'kim'),
    avail('a2', 'toni', 'W2', '2026-12-08', '2026-12-08', 'toni'),
  ],
  stationWindowEnables: [E1],
};

function withDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const old = new Map(keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const k of keys) {
    const value = dom.window[k];
    Object.defineProperty(globalThis, k, {
      value: k.includes('AnimationFrame') && typeof value === 'function' ? value.bind(dom.window) : value,
      configurable: true, writable: true,
    });
  }
  try {
    return fn(dom);
  } finally {
    for (const k of keys) {
      const d = old.get(k);
      if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
    }
  }
}

test('the stations panel prints the cross-window reading from the reader and offers only a declaration the door accepts', () => {
  withDom(() => {
    const { store, api, takeSeat } = openStore(PANEL);
    takeSeat('ann');
    const eventsBefore = store.state.events.length;
    const ctx = { api, query: new URLSearchParams('panel=stations'), navigate() {}, refresh() {} };
    document.getElementById('root').append(renderStandardWork(ctx));
    const r = api.stationCoverageReport().report;
    const w2 = r.windows.find((row) => row.windowId === 'W2');
    // The figure the header prints is the reader's own figure, not a second count.
    const summary = document.querySelector('[data-testid="station-summary"]').textContent;
    assert.ok(summary.includes(`${r.totals.crossWindowLiveN} live cross-window prerequisite(s)`), summary);
    assert.ok(summary.includes(`${r.totals.crossWindowOrderN} proven by the calendar`), summary);
    // The workspace card prints two separate claims, in the register's words.
    const claims = document.querySelector('[data-testid="station-cross-claims"]').textContent;
    assert.ok(claims.includes('every declared prerequisite order is proven by the calendar — yes'), claims);
    assert.ok(document.querySelector('[data-testid="station-cross-summary"]'));
    // The consumer window reads what the engine decided, beside its own figures.
    const cardNode = document.querySelector('[data-testid="station-cross-W2"]');
    assert.ok(cardNode);
    assert.equal(cardNode.getAttribute('data-feed-status'), 'fed');
    assert.equal(w2.feed.status, 'fed');
    assert.ok(cardNode.textContent.includes('Fed by a proven earlier window'));
    assert.ok(cardNode.textContent.includes(`${w2.feed.orderN} proven order`));
    assert.ok(cardNode.textContent.includes('Station S1'));
    assert.ok(cardNode.textContent.includes('ANN'));
    assert.ok(cardNode.textContent.includes(E1.reason));
    // The declarer may retire their own declaration; the door re-checks it.
    assert.ok(document.querySelector('[data-testid="station-cross-retire-e1"]'));
    // The joint apex is offered the declaration; neither station is scheduled.
    assert.ok(document.querySelector('[data-testid="station-cross-add-W2"]'));
    const labels = [...document.querySelectorAll('button')].map((b) => b.textContent.toLowerCase()).join(' | ');
    assert.equal(/assign|schedule|deploy|level/.test(labels), false, labels);
    // The method illustration is a real asset and is captioned as generated.
    const img = document.querySelector('img[src$="station-cross-window.jpg"]');
    assert.ok(img && img.alt.length > 60);
    const bytes = fs.readFileSync(new URL('../../app/assets/station-cross-window.jpg', import.meta.url));
    assert.ok(bytes.length > 10000);
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    // Reading the panel wrote nothing and appended no event.
    assert.equal(store.state.stationWindowEnables.length, 1);
    assert.equal(store.state.events.length, eventsBefore);
  });
});

test('a seat that holds only one of the two windows is offered no declaration, and the feeder stays withheld', () => {
  withDom(() => {
    const { store, api, takeSeat } = openStore(PANEL);
    takeSeat('kim');
    const ctx = { api, query: new URLSearchParams('panel=stations'), navigate() {}, refresh() {} };
    document.getElementById('root').append(renderStandardWork(ctx));
    const r = api.stationCoverageReport().report;
    const w2 = r.windows.find((row) => row.windowId === 'W2');
    // Kim holds W2 and not W1: the feeder window is outside her reach, so its
    // staffing is withheld. A withheld declaration carries no order, so the
    // window itself claims nothing.
    assert.equal(w2.feed.status, 'none');
    assert.equal(w2.feed.withheldN, 1);
    assert.equal(w2.feed.danglingN, 0);
    assert.equal(w2.feed.orderN, 0);
    // The screen must not offer a declaration the door would refuse.
    assert.equal(document.querySelectorAll('[data-testid^="station-cross-add-"]').length, 0);
    // Nor a retire control for a declaration somebody else made.
    assert.equal(document.querySelectorAll('[data-testid^="station-cross-retire-"]').length, 0);
    const cardNode = document.querySelector('[data-testid="station-cross-W2"]');
    assert.ok(cardNode);
    assert.ok(cardNode.textContent.includes('1 outside reach'));
    assert.ok(cardNode.textContent.includes('Withheld — the feeder window is outside this seat’s reach'));
    // She is one of the two windows' holders, so she may read WHO must come up
    // first; only the feeder's staffing is another span's record.
    assert.ok(cardNode.textContent.includes('Station S1'));
    // She still reads her own window's figures: the withholding is the
    // feeder's record, not a punishment of her own stations.
    assert.equal(w2.stations[0].state, 'single-point');
    const windowCard = document.querySelector('[data-testid="station-window-W2"]');
    assert.ok(windowCard && windowCard.textContent.includes(w2.verdictLabel));
    assert.equal(store.state.stationWindowEnables.length, 1);
  });
});
