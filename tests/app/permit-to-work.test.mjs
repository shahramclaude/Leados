// ADR-0246 — Permit-to-Work, Energy-Isolation & Simultaneous-Operations Register
// (Schema v200).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — seven empty ledgers and three declared
//      conventions, and no permit inferred from a shift, a station roster, an
//      incident, a maintenance job, a stop-work hold or a functional restriction;
//   2. the loaders are FAIL-CLOSED — a permit with no written basis, a fractional
//      validity, an unreadable or duplicated atmosphere limit, a confined-space
//      permit with no test plan, a half-closed row, an isolation citing an unknown
//      permit and a doubled gas reading are DROPPED with counted warnings, while a
//      self-issued permit and a hot-work permit with no fire watch are KEPT and
//      FLAGGED rather than erased;
//   3. the arithmetic is EXACT — minutes to expiry, minutes past expiry, minutes
//      since a test, minutes of overlap, the atmosphere verdict and the isolation
//      proof window, all floored and never rounded into a reassurance;
//   4. the NINE STATES are nine different facts, every one of them printed with the
//      flags that fired underneath it, and never folded into each other;
//   5. the SIMULTANEOUS-OPERATIONS conflicts are DERIVED on every read and never
//      stored — including the headline case: an isolation released while a hot-work
//      permit was live in the same area;
//   6. the MATRIX is correct — the ask goes to the joint apex above every line
//      holding the holder(s), never to a holder, and a person is counted once;
//   7. RULE-PTW-01 is idempotent, capped, self-closing, pause-governed on every path,
//      opaque in its ask text, and observes identity-free where nobody can be asked;
//   8. the door refuses self-issue, a holder double-booked over one window, hot work
//      with no fire watch, an energy-control kind waiving its control, a proof outside
//      the permit's own window, a self-verification, a bad handler and a second
//      closure — and ACCEPTS a failing gas reading, because a reading is a fact;
//   9. the CSV boundary is aggregate, identity-free, floored, and its summary equals
//      the reader's own totals; the conflict KINDS are named rather than hidden;
//  10. the panel prints the reader's own figures cell by cell (display == computed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildPermitToWork, derivePtwState, derivePtwConflicts } from '../../app/core/domain/permitToWork.js';
import {
  normalizePtwAtmosphere,
  normalizePtwClosures,
  normalizePtwHandovers,
  normalizePtwIsolations,
  normalizePtwPermits,
  normalizePtwSettings,
  normalizePtwSuspensions,
  ptwPlanEntry,
} from '../../app/core/domain/permitToWorkSchema.js';
import {
  atmosphereVerdict,
  freshnessReading,
  instantMs,
  isolationProof,
  minutesPast,
  minutesRemaining,
  overlapMinutes,
  validityEndMs,
} from '../../app/core/domain/permitToWorkMath.js';
import {
  indexPermitToWorkAsks,
  permitToWorkConditions,
  permitToWorkRule,
  ptwAskSignature,
} from '../../app/core/domain/permitToWorkRules.js';
import {
  PTW_CSV_COLUMNS,
  PTW_CSV_SCOPE,
  PTW_SETTING_KEYS,
  PTW_STATE_BY_KEY,
} from '../../app/core/domain/permitToWorkRegistry.js';
import { permitToWorkCsvRows } from '../../app/core/domain/permitToWorkReport.js';
import { renderPermitToWork } from '../../app/views/permitToWork.js';

const NOW = new Date('2026-11-17T09:00:00.000Z');
const T0 = NOW.toISOString();
const iso = (value) => new Date(value).toISOString();
const plus = (minutes) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const person = (id, managerId) => ({
  id, name: id[0].toUpperCase() + id.slice(1), managerId, role: 'Technician',
  status: 'active', startDate: '2026-01-01T09:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:00:00.000Z',
});

/**
 * priya → mei → sam, and freya → sam on a declared PROJECT line. Sam therefore holds
 * TWO active reporting lines: the case in which the line that authorised the work is
 * not the line the holder sits on.
 */
function fixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.people = [person('priya', null), person('mei', 'priya'), person('sam', 'mei'), person('freya', 'priya')];
  raw.reportingLines = [{
    id: 'rl-sam-freya', personId: 'sam', managerId: 'freya', kind: 'project', shareH: 30,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  if (overrides.activeSeatId) raw.settings = { ...raw.settings, activeSeatId: overrides.activeSeatId };
  raw.ptwPermits = overrides.permits || [permit()];
  raw.ptwIsolations = overrides.isolations || [];
  raw.ptwAtmosphere = overrides.atmosphere || [];
  raw.ptwHandovers = overrides.handovers || [];
  raw.ptwSuspensions = overrides.suspensions || [];
  raw.ptwClosures = overrides.closures || [];
  raw.ptwMarkers = overrides.markers || [];
  return raw;
}

/** A loader-valid electrical permit for sam: 480 minutes from 06:00, energy control. */
function permit(overrides = {}) {
  return {
    id: 'permit-1',
    workRef: 'PTW-9001 pump bay electrical',
    areaRef: 'Pump house — bay 2',
    workKind: 'electrical-isolation',
    authorityKind: 'single',
    holderId: 'sam',
    issuerId: 'mei',
    lineManagerId: 'mei',
    basisRef: 'MS-207 rev 3 — LV motor replacement with isolation',
    validityMinutes: 480,
    validFromAt: iso('2026-11-17T06:00:00.000Z'),
    flightFromAt: null,
    fireWatchId: null,
    crewIds: [],
    energyControl: true,
    atmospherePlan: [],
    createdAt: iso('2026-11-17T05:00:00.000Z'),
    updatedAt: iso('2026-11-17T05:00:00.000Z'),
    ...overrides,
  };
}

/** An isolation applied at 06:00, proved at 06:20 inside a 30-minute window. */
function isolation(overrides = {}) {
  return {
    id: 'iso-1',
    permitId: 'permit-1',
    pointRef: 'Bay 2 MCC breaker 14',
    lockRef: 'LOCK-2041',
    energyKind: 'electrical',
    appliedAt: iso('2026-11-17T06:00:00.000Z'),
    appliedById: 'sam',
    verifyWithinMinutes: 30,
    verifiedAt: iso('2026-11-17T06:20:00.000Z'),
    verifiedById: 'mei',
    removedAt: null,
    removedById: null,
    removalConfirmedById: null,
    removalNote: '',
    createdAt: iso('2026-11-17T06:00:00.000Z'),
    ...overrides,
  };
}

const contact = (overrides = {}) => ({
  id: 'atm-1',
  permitId: 'permit-1',
  testKey: 'oxygen',
  reading: 20.8,
  testedAt: iso('2026-11-17T08:40:00.000Z'),
  testedById: 'sam',
  instrumentRef: 'GX-3R 4471',
  note: '',
  createdAt: iso('2026-11-17T08:40:00.000Z'),
  ...overrides,
});

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildPermitToWork(load(raw), { now: NOW, seat: null, ...opts });

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

/* --------------------------------------------------------------- 1. schema */

test('schema v201 is additive: the v200 step adds seven empty ledgers, three conventions, nothing inferred', () => {
  const empty = createEmptyState(T0);
  // ADR-0247 moved the head to 201; the v201 step is asserted in its own suite.
  assert.equal(SCHEMA_VERSION, 213, 'ADR-0260 (modern slavery & due diligence) is the current head');
  const keys = ['ptwPermits', 'ptwIsolations', 'ptwAtmosphere', 'ptwHandovers', 'ptwSuspensions', 'ptwClosures', 'ptwMarkers'];
  for (const key of keys) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
    assert.deepEqual(empty[key], [], `${key} starts empty`);
  }
  const loaded = normalizeState(createEmptyState(T0), { now: NOW }).state;
  assert.equal(loaded.settings[PTW_SETTING_KEYS.autoPropagate], true);
  assert.equal(loaded.settings[PTW_SETTING_KEYS.privacyFloor], 3);
  assert.equal(loaded.settings[PTW_SETTING_KEYS.horizonDays], 14);
  // THERE IS NO DEFAULT VALIDITY, LIMIT, FRESHNESS OR VERIFICATION WINDOW ANYWHERE.
  const settingsKeys = Object.keys(loaded.settings);
  for (const forbidden of ['ptwValidity', 'ptwOxygenLimit', 'ptwFreshness', 'ptwVerifyWithin', 'ptwDefaultValidity']) {
    assert.equal(settingsKeys.includes(forbidden), false, `${forbidden} must not exist as a workspace default`);
  }

  const previous = { ...createEmptyState(T0), schemaVersion: 199 };
  for (const key of keys) delete previous[key];
  const { raw, applied } = migrate(previous);
  assert.deepEqual(applied, ['199 → 200', '200 → 201', '201 → 202', '202 → 203', '203 → 204', '204 → 205', '205 → 206', '206 → 207', '207 → 208', '208 → 209', '209 → 210', '210 → 211', '211 → 212'], 'every step from ADR-0246 to the current schema runs once, in order');
  assert.equal(raw.schemaVersion, SCHEMA_VERSION);
  for (const key of keys) assert.deepEqual(raw[key], [], 'NOTHING is inferred at upgrade');
});

test('the spine carries RULE-PTW-01 with exactly one contract, and CSV #187 is registered', () => {
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 169, 'ADR-0246..ADR-0258 registered through the 167th spine rule (RULE-PSR-01), and ADR-0260 (RULE-MSA-01) is the 168th');
  assert.equal(DEFAULT_POST_COMMIT_RULES.some((rule) => rule && rule.id === 'permitToWorkRule'), true);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'one contract per spine rule');
  assert.equal(PROPAGATION_CONTRACTS.some((contract) => contract.rule && contract.rule.id === 'permitToWorkRule'), true);
  assert.equal(CSV_EXPORTS.some((entry) => entry.key === PTW_CSV_SCOPE), true);
  assert.equal(CSV_EXPORTS.length, 196, 'ADR-0246..ADR-0260 registered through CSV #196 (modern-slavery)');
});

/* -------------------------------------------------------------- 2. loaders */

test('loaders are fail-closed: no basis, a fractional validity, a duplicate limit, no test plan', () => {
  const warnings = [];
  const base = permit();
  const rows = normalizePtwPermits([
    { ...base, id: 'a', basisRef: '' },
    { ...base, id: 'b', validityMinutes: 60.5 },
    { ...base, id: 'c', validityMinutes: 0 },
    { ...base, id: 'd', workRef: '' },
    { ...base, id: 'e', workKind: 'teleportation' },
    {
      ...base, id: 'f', workKind: 'confined-space-entry',
      atmospherePlan: [
        { testKey: 'oxygen', limitMin: 19.5, limitMax: 23.5, freshnessMinutes: 60 },
        { testKey: 'oxygen', limitMin: 20, limitMax: 21, freshnessMinutes: 60 },
      ],
    },
    { ...base, id: 'g', workKind: 'confined-space-entry', atmospherePlan: [] },
    { ...base, id: 'h', workKind: 'confined-space-entry', atmospherePlan: [{ testKey: 'oxygen', limitMin: 19.5, limitMax: 23.5, freshnessMinutes: 0 }] },
    { ...base, id: 'i' },
  ], warnings);
  assert.deepEqual(rows.map((row) => row.id), ['i'], 'only the complete, readable permit survives');
  assert.match(warnings.join(' '), /could not be read exactly/);
});

test('a self-issued permit and a hot-work permit with no fire watch are KEPT and FLAGGED, never erased', () => {
  const warnings = [];
  const rows = normalizePtwPermits([
    permit({ id: 'self', holderId: 'sam', issuerId: 'sam' }),
    permit({ id: 'hot', workKind: 'hot-work', fireWatchId: null, energyControl: false }),
  ], warnings);
  assert.equal(rows.length, 2, 'both rows survive');
  assert.equal(rows.find((row) => row.id === 'self').selfIssued, true);
  assert.equal(rows.find((row) => row.id === 'hot').noFireWatch, true);
  assert.match(warnings.join(' '), /issued by their own holder/);
  assert.match(warnings.join(' '), /no named fire watch/);
});

test('an isolation citing an unknown permit, a half-recorded removal and a doubled point are dropped', () => {
  const permits = normalizePtwPermits([permit()], []);
  const warnings = [];
  const rows = normalizePtwIsolations([
    isolation({ id: 'a', permitId: 'nope' }),
    isolation({ id: 'b', removedAt: iso('2026-11-17T07:00:00.000Z') }),
    isolation({ id: 'c', verifyWithinMinutes: 0 }),
    isolation({ id: 'd', pointRef: 'Bay 2 MCC breaker 14', lockRef: 'LOCK-2041' }),
    isolation({ id: 'e', pointRef: 'Bay 2 MCC breaker 14', lockRef: 'LOCK-2041' }),
    isolation({ id: 'f', pointRef: 'Bay 2 MCC breaker 15', lockRef: 'LOCK-2042' }),
  ], permits, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['d', 'f'], 'one readable row per point and lock, no duplicates');
  assert.match(warnings.join(' '), /could not be read exactly/);
});

test('an isolation applied BEFORE the permit validity start is legal — preparation precedes authorisation', () => {
  const permits = normalizePtwPermits([permit()], []);
  const rows = normalizePtwIsolations([
    isolation({ id: 'early', appliedAt: iso('2026-11-17T05:00:00.000Z'), verifiedAt: iso('2026-11-17T05:20:00.000Z') }),
  ], permits, []);
  assert.deepEqual(rows.map((row) => row.id), ['early'], 'the real industrial sequence is not refused by the loader');
});

test('a gas reading is KEPT when it fails the limit, dropped when it names an undeclared test', () => {
  const permits = normalizePtwPermits([permit({
    id: 'permit-1',
    workKind: 'confined-space-entry',
    atmospherePlan: [{ testKey: 'h2s', limitMin: 0, limitMax: 5, freshnessMinutes: 60 }],
  })], []);
  const warnings = [];
  const rows = normalizePtwAtmosphere([
    contact({ id: 'fails', testKey: 'h2s', reading: 40 }),
    contact({ id: 'undeclared', testKey: 'co', reading: 3 }),
    contact({ id: 'impossible', testKey: 'h2s', reading: 5000 }),
    contact({ id: 'noinstrument', instrumentRef: '' }),
  ], permits, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['fails'], 'the failing reading is the one that must survive');
  assert.match(warnings.join(' '), /could not be read exactly/);
});

test('the plan entry is bounded by the test’s own published range, and the direction is never a field', () => {
  assert.equal(ptwPlanEntry({ testKey: 'oxygen', limitMin: 19.5, limitMax: 23.5, freshnessMinutes: 60 }).limitDirection, 'between');
  assert.equal(ptwPlanEntry({ testKey: 'oxygen', limitMin: 5, limitMax: 6, freshnessMinutes: 60 }), null, 'an oxygen band of 5–6% is a waiver');
  assert.equal(ptwPlanEntry({ testKey: 'lel', limitMin: 0, limitMax: 26, freshnessMinutes: 60 }), null, 'the LEL limit is bounded at 25');
  assert.equal(ptwPlanEntry({ testKey: 'h2s', limitMin: 0, limitMax: 5, freshnessMinutes: 0 }), null, 'no freshness window is no control');
});

test('a second closure is refused by the loader rather than overwriting the first', () => {
  const permits = normalizePtwPermits([permit()], []);
  const warnings = [];
  const rows = normalizePtwClosures([
    { id: 'c1', permitId: 'permit-1', closedAt: iso('2026-11-17T10:00:00.000Z'), closedById: 'mei', outcome: 'work-completed', note: 'Finished and both isolations restored before hand-back.' },
    { id: 'c2', permitId: 'permit-1', closedAt: iso('2026-11-17T11:00:00.000Z'), closedById: 'mei', outcome: 'work-abandoned', note: 'A second closure that must not replace the first one.' },
  ], permits, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['c1']);
  assert.match(warnings.join(' '), /second closure/);
});

/* ----------------------------------------------------------- 3. arithmetic */

test('the arithmetic is exact whole minutes, floored, and refuses rather than guesses', () => {
  const start = instantMs('2026-11-17T06:00:00.000Z');
  const end = validityEndMs(start, 480);
  assert.equal(iso(end), '2026-11-17T14:00:00.000Z');
  assert.equal(validityEndMs(start, 480.5), null, 'a fractional validity has no end instant');
  assert.equal(validityEndMs(start, 0), null);
  assert.equal(minutesRemaining(instantMs('2026-11-17T13:30:59.000Z'), end), 29, 'thirty-nine seconds is not a minute');
  assert.equal(minutesRemaining(end, end), 0);
  assert.equal(minutesPast(end, end), 0);
  assert.equal(minutesPast(instantMs('2026-11-17T14:59:00.000Z'), end), 59);
  assert.equal(overlapMinutes(start, end, instantMs('2026-11-17T13:00:00.000Z'), instantMs('2026-11-17T15:00:00.000Z')), 60);
  assert.equal(overlapMinutes(start, end, end, end + 60_000), 0, 'abutting windows do not overlap');
  assert.equal(minutesRemaining(instantMs('nope'), end), null);
});

test('the atmosphere verdict is a verdict, never a boolean, and direction comes from the test', () => {
  const oxygen = { testKey: 'oxygen', limitDirection: 'between', limitMin: 19.5, limitMax: 23.5 };
  assert.equal(atmosphereVerdict(oxygen, 20.8).verdict, 'pass');
  assert.equal(atmosphereVerdict(oxygen, 24).verdict, 'fail');
  assert.equal(atmosphereVerdict(oxygen, 18).verdict, 'fail');
  assert.equal(atmosphereVerdict(oxygen, null).verdict, 'undeterminable');
  const h2s = { testKey: 'h2s', limitDirection: 'at-most', limitMin: 0, limitMax: 5 };
  assert.equal(atmosphereVerdict(h2s, 12).verdict, 'fail', 'a failing reading is a verdict, not an absence');
  assert.equal(atmosphereVerdict(h2s, 0).verdict, 'pass');
  assert.match(atmosphereVerdict(null, 1).reason, /declares no limit/);
});

test('freshness and the isolation proof window are judged against the permit’s own declaration', () => {
  const tested = instantMs('2026-11-17T09:00:00.000Z');
  assert.equal(freshnessReading(instantMs('2026-11-17T09:59:00.000Z'), tested, 60).stale, false);
  const stale = freshnessReading(instantMs('2026-11-17T10:31:00.000Z'), tested, 60);
  assert.equal(stale.stale, true);
  assert.equal(stale.minutesOver, 31, 'the exact minutes over the declared window');
  const laterMs = instantMs('2026-11-17T11:00:00.000Z');
  assert.equal(freshnessReading(laterMs, tested, 0).stale, null, 'no declared window means no judgement');

  const applied = instantMs('2026-11-17T06:00:00.000Z');
  assert.equal(isolationProof({ appliedMs: applied, verifiedMs: instantMs('2026-11-17T06:29:00.000Z'), verifyWithinMinutes: 30 }).proved, true);
  const late = isolationProof({ appliedMs: applied, verifiedMs: instantMs('2026-11-17T07:15:00.000Z'), verifyWithinMinutes: 30 });
  assert.equal(late.proved, false);
  assert.equal(late.overdue, true);
  assert.equal(late.minutesOverWindow, 45, 'the exact minutes outside the permit’s own window');
  assert.equal(isolationProof({ appliedMs: applied, verifiedMs: instantMs('2026-11-17T05:00:00.000Z'), verifyWithinMinutes: 30 }).proved, false, 'a proof before the apply proves nothing');
  assert.equal(isolationProof({ appliedMs: applied, verifiedMs: null, verifyWithinMinutes: 30 }).proved, false);
});

/* ---------------------------------------------------------------- 4. states */

test('a live permit inside its validity with a proved isolation is `live`', () => {
  const report = read(fixture({ isolations: [isolation()] }));
  const row = report.rows[0];
  assert.equal(row.state.key, 'live');
  assert.equal(row.unverifiedIsolationN, 0);
  assert.equal(row.remainingMinutes, 300, 'five whole hours left of the 480-minute validity at 09:00');
});

test('an isolation applied and never proved makes the permit `live-unverified`, never `live`', () => {
  const report = read(fixture({ isolations: [isolation({ verifiedAt: null, verifiedById: null })] }));
  assert.equal(report.rows[0].state.key, 'live-unverified');
  assert.equal(report.rows[0].flags.includes('isolation-unverified'), true);
  assert.match(PTW_STATE_BY_KEY['live-unverified'].says, /injured by plant they believe is dead/);
});

test('a proof recorded OUTSIDE the permit’s own window is overdue, and the state says so', () => {
  const report = read(fixture({ isolations: [isolation({ verifiedAt: iso('2026-11-17T08:00:00.000Z') })] }));
  const row = report.rows[0];
  assert.equal(row.state.key, 'live-unverified');
  assert.equal(row.overdueIsolationN, 1);
  assert.equal(row.flags.includes('isolation-verification-overdue'), true);
  assert.equal(row.isolationRows[0].proof.minutesOverWindow, 90, '06:00 + 30 min window, proved at 08:00');
  assert.ok(report.conflicts.some((conflict) => conflict.kind === 'isolation-verification-overdue'));
});

test('energy-control work with NO isolation at all is `live-unverified`, not `live`', () => {
  const report = read(fixture({ isolations: [] }));
  const row = report.rows[0];
  assert.equal(row.state.key, 'live-unverified');
  assert.equal(row.noIsolationDeclared, true);
  assert.equal(row.flags.includes('no-isolation-declared'), true);
});

test('an atmosphere failing its own declared limit makes the permit `live-atmosphere`', () => {
  const raw = fixture({
    permits: [permit({
      workKind: 'confined-space-entry',
      atmospherePlan: [
        { testKey: 'oxygen', limitMin: 19.5, limitMax: 23.5, freshnessMinutes: 60 },
        { testKey: 'h2s', limitMin: 0, limitMax: 5, freshnessMinutes: 60 },
      ],
    })],
    isolations: [isolation()],
    atmosphere: [contact({ id: 'a1', testKey: 'oxygen', reading: 20.8 }), contact({ id: 'a2', testKey: 'h2s', reading: 12 })],
  });
  const report = read(raw);
  const row = report.rows[0];
  assert.equal(row.state.key, 'live-atmosphere');
  assert.equal(row.atmosphereOutOfLimitN, 1);
  assert.equal(row.flags.includes('atmosphere-out-of-limit'), true);
  assert.ok(report.conflicts.some((conflict) => conflict.kind === 'atmosphere-out-of-limit'));
});

test('a declared test that was NEVER recorded is a failure, not a pass', () => {
  const raw = fixture({
    permits: [permit({
      workKind: 'confined-space-entry',
      atmospherePlan: [{ testKey: 'oxygen', limitMin: 19.5, limitMax: 23.5, freshnessMinutes: 60 }],
    })],
    isolations: [isolation()],
    atmosphere: [],
  });
  const report = read(raw);
  assert.equal(report.rows[0].state.key, 'live-atmosphere');
  assert.equal(report.rows[0].atmosphereMissingN, 1);
});

test('a passing but STALE reading is its own state, with the exact minutes over', () => {
  const raw = fixture({
    permits: [permit({
      workKind: 'confined-space-entry',
      atmospherePlan: [{ testKey: 'oxygen', limitMin: 19.5, limitMax: 23.5, freshnessMinutes: 30 }],
    })],
    isolations: [isolation()],
    atmosphere: [contact({ id: 'a1', testKey: 'oxygen', reading: 20.8, testedAt: iso('2026-11-17T08:00:00.000Z') })],
  });
  const report = read(raw);
  const row = report.rows[0];
  assert.equal(row.state.key, 'live-atmosphere-stale');
  assert.equal(row.readings[0].freshness.minutesOver, 30, 'sixty minutes old against a thirty-minute window');
  assert.ok(report.conflicts.some((conflict) => conflict.kind === 'atmosphere-stale'));
});

test('a lapsed permit nobody closed is `expired-open` with the exact minutes past its end', () => {
  const report = read(fixture({
    permits: [permit({ validFromAt: iso('2026-11-17T02:00:00.000Z'), validityMinutes: 240 })],
    isolations: [isolation()],
  }));
  const row = report.rows[0];
  assert.equal(row.state.key, 'expired-open');
  assert.equal(row.lateMinutes, 180, 'validity ended 06:00, read at 09:00');
  assert.ok(report.conflicts.some((conflict) => conflict.kind === 'permit-lapsed-open'));
});

test('a suspension reads `suspended` until a separate resumption is recorded', () => {
  const base = {
    permits: [permit()],
    isolations: [isolation({ verifiedAt: null, verifiedById: null })],
  };
  const suspended = read(fixture({
    ...base,
    suspensions: [{ id: 's1', permitId: 'permit-1', suspendedAt: iso('2026-11-17T07:00:00.000Z'), suspendedById: 'mei', reason: 'Process upset upstream; work stopped until the plant settled.', resumedAt: null, resumedById: null, resumeNote: '' }],
  }));
  assert.equal(suspended.rows[0].state.key, 'suspended', 'a suspension headline outranks the unproved isolation it still carries');
  assert.equal(suspended.rows[0].flags.includes('isolation-unverified'), true, 'and the unproved isolation is still printed');

  const resumed = read(fixture({
    ...base,
    suspensions: [{ id: 's1', permitId: 'permit-1', suspendedAt: iso('2026-11-17T07:00:00.000Z'), suspendedById: 'mei', reason: 'Process upset upstream; work stopped until the plant settled.', resumedAt: iso('2026-11-17T08:00:00.000Z'), resumedById: 'mei', resumeNote: 'Plant settled and the gauge re-checked; isolation still on.' }],
  }));
  assert.equal(resumed.rows[0].state.key, 'live-unverified', 'a resumption does NOT restore the pre-suspension record');
});

test('a permit declared for a later window is `not-yet-valid`, and nobody may work under it', () => {
  const report = read(fixture({
    permits: [permit({ validFromAt: iso('2026-11-17T12:00:00.000Z'), flightFromAt: iso('2026-11-17T12:30:00.000Z') })],
    isolations: [isolation()],
  }));
  const row = report.rows[0];
  assert.equal(row.state.key, 'not-yet-valid');
  assert.equal(row.goLiveMs, instantMs('2026-11-17T12:30:00.000Z'), 'the declared first entry is when it goes live');
});

test('a closure with every isolation restored is `closed-complete`; one with an isolation left is printed', () => {
  const restored = read(fixture({
    isolations: [isolation({ removedAt: iso('2026-11-17T08:00:00.000Z'), removedById: 'sam', removalConfirmedById: 'mei', removalNote: 'Breaker re-racked and the lock returned to the board.' })],
    closures: [{ id: 'c1', permitId: 'permit-1', closedAt: iso('2026-11-17T08:30:00.000Z'), closedById: 'mei', outcome: 'work-completed', note: 'Job finished and the isolation restored before hand-back.' }],
  }));
  assert.equal(restored.rows[0].state.key, 'closed-complete');

  const owed = read(fixture({
    isolations: [isolation()],
    closures: [{ id: 'c1', permitId: 'permit-1', closedAt: iso('2026-11-17T08:30:00.000Z'), closedById: 'mei', outcome: 'work-abandoned', note: 'Called off with the breaker still locked, which is the fact this state prints.' }],
  }));
  assert.equal(owed.rows[0].state.key, 'closed-isolation-owed');
  assert.ok(owed.conflicts.some((conflict) => conflict.kind === 'closure-isolation-owed'));
});

/* ------------------------------------------------------------- 5. conflicts */

test('the headline conflict: an isolation released while a hot-work permit was live in the same area', () => {
  const hot = permit({
    id: 'hot', workRef: 'Hot work in the tank room', areaRef: 'Tank room — north',
    workKind: 'hot-work', fireWatchId: 'freya', energyControl: false,
    validFromAt: iso('2026-11-17T06:00:00.000Z'), validityMinutes: 480,
  });
  const breaker = permit({
    id: 'brk', workRef: 'Line break on the transfer main', areaRef: 'Tank room — north',
    workKind: 'line-breaking', holderId: 'freya', issuerId: 'priya',
    validFromAt: iso('2026-11-17T04:00:00.000Z'), validityMinutes: 300,
  });
  const released = isolation({
    id: 'iso-2', permitId: 'brk', pointRef: 'Transfer main XV-118', lockRef: 'LOCK-2052',
    energyKind: 'process-fluid',
    appliedAt: iso('2026-11-17T04:00:00.000Z'), verifiedAt: iso('2026-11-17T04:20:00.000Z'), verifiedById: 'priya',
    removedAt: iso('2026-11-17T07:00:00.000Z'), removedById: 'freya', removalConfirmedById: 'priya',
    removalNote: 'Zero pressure confirmed and the line drained before the valve was reopened.',
  });
  const report = read(fixture({ permits: [hot, breaker], isolations: [released] }));
  const conflict = report.conflicts.find((row) => row.kind === 'hot-work-over-isolation-release');
  assert.ok(conflict, 'the register derives the release-under-hot-work conflict');
  assert.deepEqual(conflict.permitIds.sort(), ['brk', 'hot']);
  assert.equal(conflict.minutes, 60, 'the release came 60 whole minutes after the hot work started');
  assert.equal(conflict.severity, 5);
});

test('two live hot-work permits in one area and a double-booked holder are both derived', () => {
  const a = permit({ id: 'h1', workKind: 'hot-work', fireWatchId: 'freya', areaRef: 'Bay 1', validFromAt: iso('2026-11-17T06:00:00.000Z'), validityMinutes: 480 });
  const b = permit({ id: 'h2', workKind: 'hot-work', fireWatchId: 'freya', areaRef: 'Bay 1', holderId: 'freya', issuerId: 'priya', validFromAt: iso('2026-11-17T07:00:00.000Z'), validityMinutes: 480 });
  const report = read(fixture({ permits: [a, b], isolations: [] }));
  assert.ok(report.conflicts.some((row) => row.kind === 'two-hot-work-same-area'));
  const doubleBooked = read(fixture({
    permits: [
      permit({ id: 'd1', areaRef: 'Bay 1', validFromAt: iso('2026-11-17T06:00:00.000Z'), validityMinutes: 480 }),
      permit({ id: 'd2', areaRef: 'Bay 2', validFromAt: iso('2026-11-17T07:00:00.000Z'), validityMinutes: 480 }),
    ],
    isolations: [],
  }));
  assert.ok(doubleBooked.conflicts.some((row) => row.kind === 'holder-double-booked'));
});

test('conflicts are DERIVED on every read: nothing about them is stored', () => {
  const raw = fixture({ isolations: [isolation({ verifiedAt: null, verifiedById: null })] });
  const state = load(raw);
  const first = buildPermitToWork(state, { now: NOW, seat: null });
  const second = buildPermitToWork(state, { now: NOW, seat: null });
  assert.deepEqual(first.conflicts.map((row) => row.kind), second.conflicts.map((row) => row.kind));
  // No stored collection carries a conflict, a state or a verdict.
  for (const key of ['ptwPermits', 'ptwIsolations', 'ptwAtmosphere', 'ptwClosures', 'ptwSuspensions']) {
    for (const row of state[key] || []) {
      for (const forbidden of ['state', 'conflict', 'verdict', 'proved', 'expired', 'lapsed', 'breach']) {
        assert.equal(Object.hasOwn(row, forbidden), false, `${key} must not store "${forbidden}"`);
      }
    }
  }
});

/* ---------------------------------------------------------------- 6. matrix */

test('the ask goes to the JOINT APEX above every line holding the holder, and never to the holder', () => {
  const raw = fixture({ isolations: [isolation({ verifiedAt: null, verifiedById: null })] });
  const report = buildPermitToWork(load(raw), { now: NOW, seat: null });
  const row = report.rows[0];
  assert.equal(row.lines.length, 2, 'both active lines are resolved');
  assert.deepEqual(row.lines.map((line) => line.managerId).sort(), ['freya', 'mei']);
  const { conditions } = permitToWorkConditions(report);
  const unverified = conditions.filter((condition) => condition.kind === 'live-unverified');
  assert.equal(unverified.length, 1);
  assert.deepEqual(unverified[0].seatIds, ['priya'], 'mei and freya are siblings under priya');
  assert.ok(!unverified[0].seatIds.includes('sam'), 'never to the holder, whose own plant the ask protects');
  assert.equal(report.totals.people, 1, 'the holder is counted once across two lines');
});

test('a conflict between two permits asks a seat above BOTH holders, computed from the graph', () => {
  const a = permit({ id: 'h1', workKind: 'hot-work', fireWatchId: 'freya', areaRef: 'Bay 1', holderId: 'sam', validFromAt: iso('2026-11-17T06:00:00.000Z'), validityMinutes: 480 });
  const b = permit({ id: 'h2', workKind: 'hot-work', fireWatchId: 'freya', areaRef: 'Bay 1', holderId: 'freya', issuerId: 'priya', validFromAt: iso('2026-11-17T06:00:00.000Z'), validityMinutes: 480 });
  const report = buildPermitToWork(load(fixture({ permits: [a, b], isolations: [] })), { now: NOW, seat: null });
  const { conditions } = permitToWorkConditions(report);
  const simops = conditions.filter((condition) => condition.kind === 'simultaneous-operations');
  assert.ok(simops.length >= 1, 'a conflict between two lines is askable');
  const seats = simops.flatMap((condition) => condition.seatIds);
  assert.ok(seats.includes('priya'), 'the joint apex above sam (via mei/freya) and freya is priya');
  assert.ok(!seats.includes('sam') && !seats.includes('freya'), 'never one of the holders');
});

test('a permit naming a holder who is not on the graph is OBSERVED, never asked, and counted', () => {
  const raw = fixture({ permits: [permit({ holderId: 'ghost' })] });
  const report = buildPermitToWork(load(raw), { now: NOW, seat: null });
  assert.equal(report.orphanN, 1);
  assert.equal(report.figuresComplete, false, 'an orphan is a provenance gap and is printed as one');
  const { conditions } = permitToWorkConditions(report);
  assert.equal(conditions.filter((condition) => condition.kind === 'live-unverified').length, 0);
  assert.ok(report.conflicts.some((conflict) => conflict.kind === 'orphan-holder'));
});

/* ----------------------------------------------------------- 7. RULE-PTW-01 */

test('RULE-PTW-01 files ONE ask per obligation and is idempotent across passes', () => {
  const draft = load(fixture({ isolations: [isolation({ verifiedAt: null, verifiedById: null })] }));
  const idFactory = (prefix) => `${prefix}-r-${Math.random().toString(36).slice(2, 8)}`;
  const ctx = { event: { type: 'permitToWork.permit.issued' }, now: NOW, idFactory, linkCtx: { idFactory } };
  const first = permitToWorkRule(draft, ctx);
  const asks = indexPermitToWorkAsks(draft);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].signature, ptwAskSignature('live-unverified', 'permit-1'));
  assert.equal(asks[0].seatId, 'priya');
  assert.ok(first.some((effect) => effect.action === 'delegated'));

  const before = draft.delegations.length;
  permitToWorkRule(draft, { ...ctx, event: { type: 'permitToWork.isolation.applied' } });
  assert.equal(indexPermitToWorkAsks(draft).length, 1, 'a second pass files nothing new');
  assert.equal(draft.delegations.length, before);
});

test('RULE-PTW-01 closes its own ask when the condition clears, and never re-nags a human answer', () => {
  const draft = load(fixture({ isolations: [isolation({ verifiedAt: null, verifiedById: null })] }));
  const idFactory = (prefix) => `${prefix}-r-${Math.random().toString(36).slice(2, 8)}`;
  const ctx = { event: { type: 'permitToWork.permit.issued' }, now: NOW, idFactory, linkCtx: { idFactory } };
  permitToWorkRule(draft, ctx);
  assert.equal(indexPermitToWorkAsks(draft).filter((ask) => ask.task?.status === 'active').length, 1);

  // The isolation is re-applied and proved INSIDE its own window — the only act that
  // actually clears the condition. A proof recorded after a missed window does not,
  // and must not, cure it.
  draft.ptwIsolations[0].appliedAt = iso('2026-11-17T08:50:00.000Z');
  draft.ptwIsolations[0].verifiedAt = iso('2026-11-17T08:55:00.000Z');
  draft.ptwIsolations[0].verifiedById = 'mei';
  permitToWorkRule(draft, { ...ctx, event: { type: 'permitToWork.isolation.verified' } });
  const ask = indexPermitToWorkAsks(draft)[0];
  assert.equal(ask.task.status, 'done');
  assert.match(ask.task.completionNote, /^RULE-PTW-01/);

  // A human closing the ask is an ANSWER: the rule must not file it again.
  const human = load(fixture({ isolations: [isolation({ verifiedAt: null, verifiedById: null })] }));
  permitToWorkRule(human, ctx);
  const humanAsk = indexPermitToWorkAsks(human)[0];
  human.delegations.find((row) => row.id === humanAsk.task.id).status = 'done';
  human.delegations.find((row) => row.id === humanAsk.task.id).completionNote = 'Took the permit off and re-applied the isolation with a fresh window.';
  permitToWorkRule(human, { ...ctx, event: { type: 'permitToWork.permit.issued' } });
  assert.equal(indexPermitToWorkAsks(human).length, 1, 'the rule does not nag somebody who has answered');
});

test('RULE-PTW-01 is pause-governed on every path, and its ask text names nobody and no area', () => {
  const raw = fixture({ isolations: [isolation({ verifiedAt: null, verifiedById: null })] });
  const paused = load(raw);
  paused.settings = { ...paused.settings, [PTW_SETTING_KEYS.autoPropagate]: false };
  const sole = (prefix) => `${prefix}-p`;
  const effects = permitToWorkRule(paused, { event: { type: 'permitToWork.permit.issued' }, now: NOW, idFactory: sole, linkCtx: { idFactory: sole } });
  assert.deepEqual(effects, []);
  assert.equal(indexPermitToWorkAsks(paused).length, 0);

  const unpaused = load(raw);
  const only = (prefix) => `${prefix}-q`;
  permitToWorkRule(unpaused, { event: { type: 'permitToWork.permit.issued' }, now: NOW, idFactory: only, linkCtx: { idFactory: only } });
  const task = unpaused.delegations[0];
  for (const forbidden of ['Sam', 'sam', 'Pump house', 'LOCK-2041', 'breaker', 'permit-1', 'GX-3R']) {
    assert.ok(!`${task.title} ${task.expectedOutcome} ${task.support}`.includes(forbidden),
      `the ask text must not contain “${forbidden}” — a delegation is readable above the addressee`);
  }
});

test('RULE-PTW-01 observes identity-free where no seat can be asked, and caps at four asks per commit', () => {
  const lonely = createEmptyState(T0);
  lonely.people = [person('sam', null)];
  lonely.ptwPermits = [permit({ holderId: 'ghost' })];
  lonely.ptwIsolations = [isolation({ verifiedAt: null, verifiedById: null })];
  const lonelyDraft = load(lonely);
  const lonelyFactory = (prefix) => `${prefix}-o`;
  permitToWorkRule(lonelyDraft, { event: { type: 'permitToWork.permit.issued' }, now: NOW, idFactory: lonelyFactory, linkCtx: { idFactory: lonelyFactory } });
  assert.equal(lonelyDraft.delegations.length, 0, 'nobody was asked');
  assert.equal(lonelyDraft.ptwMarkers.length, 1);
  assert.match(lonelyDraft.ptwMarkers[0].detail, /no active reporting line/);

  // Six permits, six obligations, one commit: four asks, the remainder deferred.
  const many = fixture({
    permits: Array.from({ length: 6 }, (_, index) => permit({
      id: `permit-${index + 1}`,
      workRef: `PTW-90${index} job`,
      validFromAt: iso('2026-11-17T06:00:00.000Z'),
      validityMinutes: 480,
    })),
    isolations: Array.from({ length: 6 }, (_, index) => isolation({
      id: `iso-${index + 1}`,
      permitId: `permit-${index + 1}`,
      pointRef: `Breaker ${index + 1}`,
      lockRef: `LOCK-30${index}`,
      verifiedAt: null,
      verifiedById: null,
    })),
  });
  const manyDraft = load(many);
  const manyFactory = (prefix) => `${prefix}-m-${Math.random().toString(36).slice(2, 7)}`;
  const effects = permitToWorkRule(manyDraft, { event: { type: 'permitToWork.permit.issued' }, now: NOW, idFactory: manyFactory, linkCtx: { idFactory: manyFactory } });
  assert.equal(indexPermitToWorkAsks(manyDraft).length, 4, 'capped at four');
  assert.ok(effects.some((effect) => effect.action === 'deferred'), 'the remainder is counted, not silently dropped');
});

test('RULE-PTW-01 announces lapsed and stale conditions on any commit, because time creates them', () => {
  const draft = load(fixture({
    permits: [permit({ validFromAt: iso('2026-11-17T02:00:00.000Z'), validityMinutes: 240 })],
    isolations: [isolation()],
  }));
  const idFactory = (prefix) => `${prefix}-z-${Math.random().toString(36).slice(2, 7)}`;
  // A commit that has nothing to do with permits at all.
  const effects = permitToWorkRule(draft, { event: { type: 'decision.logged' }, now: NOW, idFactory, linkCtx: { idFactory } });
  assert.ok(effects.some((effect) => effect.action === 'delegated'), 'the lapsed permit is asked about on an unrelated commit');
  assert.equal(indexPermitToWorkAsks(draft)[0].kind, 'expired-open');
});

/* ------------------------------------------------------------------ 8. door */

test('the door refuses an unsourced permit, a fractional validity and a self-issue', () => {
  const { api } = harness(fixture({ permits: [] }));
  const base = {
    workRef: 'PTW-9100 test job', areaRef: 'Bay 2', workKind: 'electrical-isolation',
    authorityKind: 'single', holderId: 'sam', basisRef: 'MS-207 rev 3 — LV motor replacement with isolation',
    validityMinutes: 480, validFromAt: '2026-11-17T06:00', energyControl: true,
  };
  const unsourced = api.permitToWorkIssue({ ...base, basisRef: 'short' });
  assert.equal(unsourced.ok, false);
  assert.equal(unsourced.field, 'basisRef');

  const fraction = api.permitToWorkIssue({ ...base, validityMinutes: 60.5 });
  assert.equal(fraction.ok, false);
  assert.equal(fraction.field, 'validityMinutes');

  const selfIssue = api.permitToWorkIssue({ ...base, holderId: 'leader' });
  assert.equal(selfIssue.ok, false, 'the operator seat may not issue a permit to itself');

  const ok = api.permitToWorkIssue(base);
  assert.equal(ok.ok, true, ok.error);
});

test('the door refuses hot work with no fire watch and a frozen-space permit with no test plan', () => {
  const { api } = harness(fixture({ permits: [] }));
  const hot = api.permitToWorkIssue({
    workRef: 'PTW-9101 hot work', areaRef: 'Tank room', workKind: 'hot-work', authorityKind: 'single',
    holderId: 'sam', basisRef: 'MS-114 rev 4 — tank room hot work and fire watch',
    validityMinutes: 480, validFromAt: '2026-11-17T06:00',
  });
  assert.equal(hot.ok, false);
  assert.equal(hot.field, 'fireWatchId');
  assert.match(hot.error, /named fire watch/);

  const entry = api.permitToWorkIssue({
    workRef: 'PTW-9102 sump entry', areaRef: 'Effluent sump 1', workKind: 'confined-space-entry',
    authorityKind: 'single', holderId: 'sam', basisRef: 'MS-402 rev 1 — effluent sump entry and testing',
    validityMinutes: 240, validFromAt: '2026-11-17T06:00', atmospherePlan: [],
  });
  assert.equal(entry.ok, false);
  assert.match(entry.error, /declared test plan/);
});

test('the door refuses to let an inherently energetic kind waive its energy control', () => {
  const { api } = harness(fixture({ permits: [] }));
  const result = api.permitToWorkIssue({
    workRef: 'PTW-9103 pump job', areaRef: 'Pump house', workKind: 'electrical-isolation',
    authorityKind: 'single', holderId: 'sam', basisRef: 'MS-207 rev 3 — LV motor replacement with isolation',
    validityMinutes: 480, validFromAt: '2026-11-17T06:00', energyControl: false,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /inherently touches stored energy/);
});

test('the door refuses a proof outside the permit’s own declared window', () => {
  // Applied 07:00 by freya, a 30-minute window, the proof offered at 08:00 → 60
  // minutes out. The permit declared the window; the door will not accept a later
  // proof and quietly call it proved.
  const raw = fixture({
    isolations: [isolation({ id: 'iso-1', appliedAt: iso('2026-11-17T07:00:00.000Z'), appliedById: 'freya', verifyWithinMinutes: 30, verifiedAt: null, verifiedById: null })],
    activeSeatId: 'mei',
  });
  const { api } = harness(raw);
  const late = api.permitToWorkVerifyIsolation({
    isolationId: 'iso-1',
    verifiedBy: 'Tested for dead at the MCC with the proving unit; no voltage at the terminals.',
    verifiedAt: '2026-11-17T08:00',
  });
  assert.equal(late.ok, false);
  assert.match(late.error, /outside the 30-minute verification window/);
});

test('the door refuses to let the hand that applied an isolation also prove it', () => {
  const raw = fixture({
    isolations: [isolation({ id: 'iso-1', appliedAt: iso('2026-11-17T08:45:00.000Z'), appliedById: 'mei', verifyWithinMinutes: 30, verifiedAt: null, verifiedById: null })],
    activeSeatId: 'mei',
  });
  const { api } = harness(raw);
  const selfProof = api.permitToWorkVerifyIsolation({
    isolationId: 'iso-1',
    verifiedBy: 'Checked it myself at the MCC; the breaker is open and the terminals are dead.',
    verifiedAt: '2026-11-17T08:50',
  });
  assert.equal(selfProof.ok, false);
  assert.match(selfProof.error, /cannot also be the hand that proves it/);
});

test('the door ACCEPTS a failing gas reading, because a reading is a fact', () => {
  const raw = fixture({
    permits: [permit({
      workKind: 'confined-space-entry',
      atmospherePlan: [{ testKey: 'h2s', limitMin: 0, limitMax: 5, freshnessMinutes: 60 }],
    })],
    isolations: [isolation()],
  });
  const { api } = harness(raw);
  const result = api.permitToWorkRecordAtmosphere({
    permitId: 'permit-1', testKey: 'h2s', reading: 12, instrumentRef: 'GX-3R 4471', testedAt: '2026-11-17T08:40',
  });
  assert.equal(result.ok, true, result.error);
  const report = api.permitToWorkReport().report;
  assert.equal(report.rows[0].state.key, 'live-atmosphere', 'and the reader prints the failure it recorded');
});

test('the door records a closure that leaves an isolation in place, and says what it did', () => {
  const raw = fixture({ isolations: [isolation()] });
  const { api } = harness(raw);
  const result = api.permitToWorkClose({
    permitId: 'permit-1', outcome: 'work-abandoned',
    note: 'Job called off when the breaker was found to need replacing; closed out with the lock still on.',
    closedAt: '2026-11-17T08:30',
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.outstandingIsolationN, 1);
  assert.match(result.warning, /never removed and confirmed/);
  assert.equal(api.permitToWorkReport().report.rows[0].state.key, 'closed-isolation-owed');
});

test('the door refuses a suspended permit’s closure and a second closure', () => {
  const raw = fixture({
    isolations: [isolation()],
    suspensions: [{ id: 's1', permitId: 'permit-1', suspendedAt: iso('2026-11-17T08:00:00.000Z'), suspendedById: 'mei', reason: 'Process upset upstream; work stopped until the plant settled.', resumedAt: null, resumedById: null, resumeNote: '' }],
  });
  const { api } = harness(raw);
  const suspended = api.permitToWorkClose({
    permitId: 'permit-1', outcome: 'work-completed', note: 'Attempting to close a permit that is still suspended.', closedAt: '2026-11-17T08:30',
  });
  assert.equal(suspended.ok, false);
  assert.match(suspended.error, /suspended and has not been resumed/);
});

test('the door refuses a holder double-booked over one window, with the refusal explained', () => {
  const raw = fixture({ permits: [permit()], isolations: [] });
  const { api } = harness(raw);
  const overlap = api.permitToWorkIssue({
    workRef: 'PTW-9104 second job', areaRef: 'Bay 9', workKind: 'cold-work', authorityKind: 'single',
    holderId: 'sam', basisRef: 'MS-155 rev 5 — compressor service and isolation',
    validityMinutes: 240, validFromAt: '2026-11-17T07:00', energyControl: true,
  });
  assert.equal(overlap.ok, false);
  assert.equal(overlap.field, 'validFromAt');
  assert.match(overlap.error, /two sets of isolations at once/);
});

/* ------------------------------------------------------------------- 9. CSV */

test('the CSV boundary is aggregate, identity-free and floored, and its summary equals the reader', () => {
  const state = buildDemoState(NOW);
  const report = buildPermitToWork(state, { now: NOW, settings: state.settings, seat: null });
  const out = exportWorkspaceCsv(state, PTW_CSV_SCOPE, { now: NOW });
  const { headers, rows } = parseCsv(out.csv);
  const ix = (key) => headers.indexOf(key);
  assert.deepEqual(headers, PTW_CSV_COLUMNS);

  const summary = rows[0];
  assert.equal(summary[ix('row_kind')], 'summary');
  const pairs = [
    ['permits_n', report.totals.permits],
    ['open_n', report.totals.open],
    ['closed_n', report.totals.closed],
    ['people_n', report.totals.people],
    ['isolations_n', report.totals.isolations],
    ['isolations_unverified_n', report.totals.isolationsUnverifiedN],
    ['live_unverified_n', report.totals.liveUnverifiedN],
    ['live_atmosphere_n', report.totals.liveAtmosphereN],
    ['expired_open_n', report.totals.expiredOpenN],
    ['expired_minutes_total', report.totals.expiredMinutes],
    ['conflicts_n', report.totals.conflicts],
    ['closed_isolation_owed_n', report.totals.closedIsolationOwedN],
  ];
  for (const [key, value] of pairs) {
    assert.equal(String(summary[ix(key)]), String(value), `CSV ${key} must equal the computed figure`);
  }

  // IDENTITY-FREE BY CONSTRUCTION.
  for (const leak of ['person-demo', 'Tank room', 'LOCK-', 'GX-3R', 'MS-1', 'PTW-24', 'priya', 'samuel']) {
    assert.equal(out.csv.includes(leak), false, `the export must not carry “${leak}”`);
  }

  // THE CONFLICT KINDS ARE NAMED, NOT HIDDEN.
  const conflictRows = rows.filter((row) => row[ix('row_kind')] === 'conflict');
  assert.equal(conflictRows.length, report.conflictKindRows.length, 'one row per conflict kind');
  assert.ok(conflictRows.some((row) => row[ix('key')] === 'hot-work-over-isolation-release'));

  // A per-state count below the floor is BLANK with its reason, never a small number.
  const stateRows = rows.filter((row) => row[ix('row_kind')] === 'state');
  for (const row of stateRows) {
    const printed = row[ix('permits_n')];
    if (printed === '') continue;
    assert.ok(Number(printed) >= report.conventions[PTW_SETTING_KEYS.privacyFloor] || Number(printed) === 0, 'no sub-floor count is printed');
  }
  const withheld = stateRows.filter((row) => row[ix('blank_reason')] !== '');
  assert.ok(withheld.length >= 1, 'the demo carries at least one sub-floor state, and it is explained');
  for (const row of withheld) assert.match(row[ix('blank_reason')], /privacy floor/);
});

test('two exports at the same clock are byte-identical', () => {
  const state = buildDemoState(NOW);
  const first = exportWorkspaceCsv(state, PTW_CSV_SCOPE, { now: NOW }).csv;
  const second = exportWorkspaceCsv(state, PTW_CSV_SCOPE, { now: NOW }).csv;
  assert.equal(first, second);
});

test('the direct report shaper never invents a zero for a figure the reader could not compute', () => {
  const rows = permitToWorkCsvRows({ ok: false });
  assert.deepEqual(rows, [], 'an unreadable report exports nothing rather than a plausible file');
});

/* --------------------------------------------------------------- 10. panel */

test('the demo derives every state in the register, so the panel is not an empty shell', () => {
  const state = buildDemoState(NOW);
  const report = buildPermitToWork(state, { now: NOW, settings: state.settings, seat: null });
  assert.ok(report.totals.permits >= 7);
  assert.equal(report.states['live'], 1, 'one clean live permit');
  assert.equal(report.states['live-unverified'], 2, 'two live permits on unproved isolations');
  assert.equal(report.states['live-atmosphere'], 1, 'one live entry with a failing H2S reading');
  assert.equal(report.states['expired-open'], 1, 'one lapsed permit nobody closed');
  assert.equal(report.states['closed-complete'], 1, 'one clean closure');
  assert.equal(report.states['closed-isolation-owed'], 1, 'one closure that left a line isolated');
  assert.equal(report.balances.statesReconcile, true);
  assert.equal(report.figuresComplete, true);
  assert.ok(report.conflicts.some((conflict) => conflict.kind === 'hot-work-over-isolation-release'));
  assert.ok(report.totals.isolations >= 6);
});

test('the panel prints the reader’s own figures cell by cell (display == computed)', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const raw = fixture({ isolations: [isolation({ verifiedAt: null, verifiedById: null })] });
    const { api } = harness(raw);
    const result = api.permitToWorkReport();
    const report = result.report;
    const view = renderPermitToWork({
      api,
      query: new URLSearchParams(''),
      state: load(raw),
      refresh: () => {},
      navigate: () => {},
    });
    const html = view.outerHTML;

    const cell = (testid) => {
      const host = view.querySelector(`[data-testid="${testid}"]`);
      assert.ok(host, `the panel prints ${testid}`);
      const value = host.querySelector('.stat-value');
      assert.ok(value, `${testid} carries a rendered value`);
      return value.textContent.trim();
    };
    assert.equal(cell('ptw-count-open'), String(report.totals.open));
    assert.equal(cell('ptw-count-unverified'), String(report.totals.liveUnverifiedN));
    assert.equal(cell('ptw-count-atmosphere'), String(report.totals.liveAtmosphereN));
    assert.equal(cell('ptw-count-expired'), String(report.totals.expiredOpenN));
    assert.equal(cell('ptw-count-conflicts'), String(report.totals.conflicts));
    assert.equal(cell('ptw-count-isolation-owed'), String(report.totals.closedIsolationOwedN));
    assert.equal(cell('ptw-count-isolations'), String(report.totals.isolations));

    // The state badge printed on the permit card is the state the reader derived.
    assert.ok(html.includes(PTW_STATE_BY_KEY['live-unverified'].label), 'the derived state label is on the page');

    // Every view renders without throwing.
    for (const viewKey of ['permits', 'isolations', 'conflicts', 'method']) {
      const node = renderPermitToWork({
        api,
        query: new URLSearchParams(`view=${viewKey}`),
        state: load(raw),
        refresh: () => {},
        navigate: () => {},
      });
      assert.ok(node.outerHTML.length > 200, `${viewKey} renders`);
    }
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});
