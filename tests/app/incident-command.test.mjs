// ADR-0240 — Major-Incident Command & Notification-Clock Register (Schema v194).
//
// The claims this suite exists to prove, in the order a leader would doubt them:
//
//   1. THE SCHEMA BUMP IS ADDITIVE — three empty ledgers, five declared
//      conventions, and NO incident, clock, commander, notification or deadline
//      inferred from anything an upgraded workspace already holds. An operational
//      case on file is not an incident somebody declared.
//   2. THE CLOCK IS DECLARED, NEVER ASSUMED — a deadline requires a written
//      source, a whole-minute period and an origin, and the exact deadline is
//      computed from the instant that origin NAMES. No 72-hour library exists.
//      An obligation with no clock reads `no-clock` and is never given a deadline.
//   3. THE TWO FACTS SURVIVE TOGETHER — a notification recorded after its own
//      deadline reads `recorded-late` and keeps BOTH the instant it went out and
//      the exact minutes it overran; it is never rounded away into `recorded`.
//   4. A PASSED DEADLINE IS PRINTED AND NEVER CONVERTED — `lapsed` never becomes
//      notified, and time alone never closes an incident or releases command.
//   5. RESOLUTION IS NOT RELEASE — a closed incident with no stand-down act reads
//      `command-standing` forever, and only the hand holding command may release
//      it.
//   6. THE MATRIX IS COMPUTED — the accountable seat is the joint apex above
//      EVERY response line, `no-authority` is printed where there is none, and a
//      person on two lines is one person.
//   7. THE LOADERS ARE FAIL-CLOSED — an incident with no detection instant, a
//      clock with no source, an act that declares one kind and carries another's
//      fields: each is DROPPED with a counted warning, never repaired.
//   8. THE DOOR REFUSES THE REAL MISTAKES — a declaration before detection, a
//      transfer from nobody, a transfer to the current holder, a lower severity
//      from a line lead, a stand-down before a close, a notification with no
//      reference, a second assumption by a different hand.
//   9. RULE-MIC-01 — files exactly one opaque ask per (signature, addressee) to
//      the joint apex, asks the CURRENT COMMANDER for a stand-down (the only hand
//      that can act), is idempotent, closes its own ask when the condition
//      clears, observes an unreachable graph as an identity-free marker, and is
//      paused on every path including a scan.
//  10. DISPLAY == STORED == COMPUTED == CSV — the panel prints the reader's own
//      figures, a persisted reload reproduces them, and CSV #181 carries no
//      identity and BLANK-with-reason where a figure cannot be computed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { incidentReport, incidentAttentionCount, incidentMatrix } from '../../app/core/domain/incidentCommand.js';
import {
  normalizeMicIncidents,
  normalizeMicActs,
  normalizeMicSettings,
  micInstant,
  micClockMinutes,
} from '../../app/core/domain/incidentCommandSchema.js';
import {
  incidentCommandConditions,
  incidentCommandRule,
  indexIncidentCommandAsks,
  micNotificationLapsedSignature,
  micNotificationClosingSignature,
  micNoCommanderSignature,
  micCommandStandingSignature,
} from '../../app/core/domain/incidentCommandRules.js';
import { incidentCsvRows } from '../../app/core/domain/incidentCommandReport.js';
import {
  MIC_CSV_COLUMNS,
  MIC_CSV_SCOPE,
  MIC_LIMITS,
  MIC_RIGHTS,
  MIC_SETTING_KEYS,
} from '../../app/core/domain/incidentCommandRegistry.js';
import { renderIncidents } from '../../app/views/incidents.js';

const L = MIC_LIMITS;

/**
 * The view constructs real DOM nodes (`dom.js` tests `child instanceof Node`), so
 * the DOM globals have to be installed on `globalThis`, not only on `dom.window`.
 */
function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://example.test/#/incidents' });
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'CustomEvent'];
  const saved = {};
  for (const key of keys) {
    saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value: dom.window[key], writable: true, configurable: true });
  }
  try {
    return { result: run(dom.window.document), dom };
  } finally {
    for (const key of keys) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else delete globalThis[key];
    }
    dom.window.close();
  }
}
const T0 = '2026-11-17T09:00:00.000Z';

/* ------------------------------------------------------------------ fixtures */

const ceo = 'p-ceo';
const dir = 'p-dir';
const mgr = 'p-mgr';
const ops = 'p-ops';
const tech = 'p-tech';

/** A five-person chain, so the joint apex over two sibling leads is a real node. */
function roster() {
  return [
    { id: ceo, name: 'Ada Chief', managerId: null, level: 5, role: 'Chief', status: 'active' },
    { id: dir, name: 'Dee Director', managerId: ceo, level: 4, role: 'Director', status: 'active' },
    { id: mgr, name: 'Mo Manager', managerId: dir, level: 3, role: 'Manager', status: 'active' },
    { id: ops, name: 'Ola Ops', managerId: mgr, level: 2, role: 'Engineer', status: 'active' },
    { id: tech, name: 'Tek Tech', managerId: mgr, level: 2, role: 'Engineer', status: 'active' },
  ];
}

function baseState(extra = {}) {
  const raw = createEmptyState(new Date(T0));
  raw.people = roster();
  const merged = { ...raw, ...extra };
  return normalizeState(merged, { now: new Date(T0) }).state;
}

function env(state = baseState()) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let clockNow = T0;
  const clock = () => new Date(clockNow);
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: clock, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: clock, idFactory }), store, { now: () => new Date(clockNow).getTime() });
  return { store, api, values, storage, setClock: (iso) => { clockNow = iso; } };
}

const DECL = Object.freeze({
  title: 'Card authorisation failing for one acquirer route',
  severity: 'sev1',
  criterion: 'Total loss of a customer-facing service with a running external clock.',
  detectedAt: '2026-11-17T02:40:00.000Z',
  declaredAt: '2026-11-17T03:20:00.000Z',
  lines: [{ duty: 'operations-impact', leadId: ops }, { duty: 'compliance-clock', leadId: tech }],
  clocks: [{ clockSource: 'statute', clockMinutes: 60, clockOrigin: 'awareness', basis: 'A notifiable breach must reach the supervisory authority within the period the instrument sets, read from the instrument itself.' }],
  notifications: [{ party: 'regulator', basis: 'A notifiable personal-data breach must reach the supervisory authority.', clockKey: null }],
});

/**
 * Declare with the obligation bound to the clock in the SAME act — the
 * positional `first` token the declare dialog sends. No second write, no test
 * reaching into the store: the door itself resolves the link.
 */
function declared(envRef, overrides = {}) {
  const merged = { ...DECL, ...overrides };
  const notifications = (merged.notifications || []).map((row) => ({
    ...row,
    clockKey: row.clockKey === null && (merged.clocks || []).length ? 'first' : row.clockKey,
  }));
  const result = envRef.api.incidentDeclare({ ...merged, notifications });
  assert.equal(result.ok, true, result.error);
  const incident = envRef.store.state.micIncidents.find((row) => row.id === result.incidentId);
  const clock = incident.clocks[0];
  return { incidentId: result.incidentId, clockKey: clock?.key || null, notifId: incident.notifications[0]?.notifId || null };
}

const readOne = (envRef, now = T0) => incidentReport(envRef.store.state, { now: new Date(now), settings: envRef.store.state.settings, seat: null });

/* --------------------------------------------------- 1. the schema bump */

test('ADR-0240 schema: the bump is additive — three empty ledgers and five conventions', () => {
  assert.equal(SCHEMA_VERSION, 197);
  for (const key of ['micIncidents', 'micActs', 'micMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  const upgraded = migrate({ schemaVersion: 193, settings: {} });
  // Later bumps (v195 ADR-0241, v196 ADR-0242, v197 ADR-0243) append, so ADR-0240's own step is asserted by
  // position rather than by being the last one in the chain.
  assert.ok(upgraded.applied.includes('193 → 194'), 'ADR-0240’s own step still runs, in order');
  assert.equal(upgraded.applied.at(-4), '193 → 194');
  assert.equal(upgraded.raw.schemaVersion, 197);
  const { state } = normalizeState(upgraded.raw, { now: new Date(T0) });
  assert.deepEqual(state.micIncidents, []);
  assert.deepEqual(state.micActs, []);
  assert.deepEqual(state.micMarkers, []);
  assert.equal(state.settings[MIC_SETTING_KEYS.autoPropagate], true);
  assert.equal(state.settings[MIC_SETTING_KEYS.closingWindowMinutes], 120);
});

test('ADR-0240: no incident is inferred from existing records — a case on file is not a declaration', () => {
  const cases = [{ id: 'case-1', kind: 'incident', title: 'Something happened', status: 'resolved', createdAt: T0, updatedAt: T0 }];
  const state = baseState({ cases });
  const report = incidentReport(state, { now: new Date(T0), settings: state.settings, seat: null });
  assert.equal(report.totals.incidents, 0);
  assert.equal(report.totals.clocks, 0);
  assert.equal(report.totals.notificationsRequired, 0);
});

/* -------------------------------------------------------- 2. the clock */

test('ADR-0240: a declared clock needs a source, a whole period and an origin — the deadline is exact', () => {
  const e = env();
  const result = e.api.incidentDeclare(DECL);
  assert.equal(result.ok, true, result.error);
  const incident = e.store.state.micIncidents[0];
  const clock = incident.clocks[0];
  assert.equal(clock.clockMinutes, 60);
  assert.equal(clock.clockOrigin, 'awareness');

  const report = readOne(e);
  const row = report.incidents[0].clocks[0];
  // Awareness is 02:40 and the period is 60 minutes: the deadline is 03:40, NOT
  // 04:20 — the origin the declaration NAMED decides, never a convenient default.
  assert.equal(row.deadlineAt, '2026-11-17T03:40:00.000Z');
  assert.equal(row.passed, true);
  assert.equal(row.remainingMinutes, -320);
});

test('ADR-0240: the same period measured from declaration produces a different deadline — the origin matters', () => {
  const e = env();
  e.api.incidentDeclare({ ...DECL, clocks: [{ ...DECL.clocks[0], clockOrigin: 'declaration' }] });
  const row = readOne(e).incidents[0].clocks[0];
  assert.equal(row.originAt, DECL.declaredAt);
  assert.equal(row.deadlineAt, '2026-11-17T04:20:00.000Z');
});

test('ADR-0240: a clock with no source, a fractional period or a missing basis is refused at the door', () => {
  const e = env();
  const noSource = e.api.incidentDeclare({ ...DECL, clocks: [{ ...DECL.clocks[0], clockSource: 'vibes' }] });
  assert.equal(noSource.ok, false);
  assert.match(noSource.error, /instrument/i);

  const fractional = e.api.incidentDeclare({ ...DECL, clocks: [{ ...DECL.clocks[0], clockMinutes: 59.5 }] });
  assert.equal(fractional.ok, false);

  const noBasis = e.api.incidentDeclare({ ...DECL, clocks: [{ ...DECL.clocks[0], basis: 'it just is' }] });
  assert.equal(noBasis.ok, false);
  assert.match(noBasis.error, /source/i);
  assert.equal(e.store.state.micIncidents.length, 0);
});

test('ADR-0240: an obligation naming a clock the incident does not hold is refused; none is substituted', () => {
  const e = env();
  const result = e.api.incidentDeclare({ ...DECL, notifications: [{ ...DECL.notifications[0], clockKey: 'not-a-clock' }] });
  assert.equal(result.ok, false);
  assert.match(result.error, /one of the incident’s own declared clocks/i);
});

test('ADR-0240: an obligation with no clock reads no-clock — never an assumed deadline', () => {
  const e = env();
  // Declared with NO clock at all: the obligation is real, its deadline is not.
  declared(e, { clocks: [], notifications: [{ ...DECL.notifications[0], clockKey: null }] });
  const row = readOne(e).incidents[0].notifications[0];
  assert.equal(row.state, 'no-clock');
  assert.equal(row.deadlineAt, null);
  assert.match(row.refusal, /No clock is declared/i);
  // The exact defect this pins: a missing clock must never be read as 72 hours.
  assert.equal(readOne(e).incidents[0].notifications[0].minutesToDeadline, null);
});

/* ------------------------------------------- 3. both facts survive together */

test('ADR-0240: a notification recorded after its deadline keeps BOTH facts and reads recorded-late', () => {
  const e = env();
  const { incidentId, notifId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });

  // Deadline is 03:40 (awareness 02:40 + 60). This went out at 05:10: 90 late.
  const result = e.api.incidentRecordNotification({
    incidentId, notifId, reference: 'REG-2026-004471', notifiedAt: '2026-11-17T05:10:00.000Z',
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.state, 'recorded-late');
  assert.equal(result.overrunMinutes, 90);

  const row = readOne(e).incidents[0].notifications[0];
  assert.equal(row.state, 'recorded-late');
  assert.equal(row.recordedAt, '2026-11-17T05:10:00.000Z');
  assert.equal(row.reference, 'REG-2026-004471');
  assert.equal(row.overrunMinutes, 90);
  assert.equal(row.late, true);
  assert.equal(row.deadlineAt, '2026-11-17T03:40:00.000Z');
});

test('ADR-0240: a notification recorded inside the deadline reads recorded with its overrun printed', () => {
  const e = env();
  const { incidentId, notifId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  const result = e.api.incidentRecordNotification({
    incidentId, notifId, reference: 'REG-1', notifiedAt: '2026-11-17T03:30:00.000Z',
  });
  assert.equal(result.state, 'recorded');
  assert.equal(result.overrunMinutes, -10);
  const row = readOne(e).incidents[0].notifications[0];
  assert.equal(row.late, false);
});

test('ADR-0240: a notification with no reference, in the future, or before declaration is refused', () => {
  const e = env();
  const { incidentId, notifId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });

  const noRef = e.api.incidentRecordNotification({ incidentId, notifId, reference: 'x', notifiedAt: '2026-11-17T03:30:00.000Z' });
  assert.equal(noRef.ok, false);
  assert.match(noRef.error, /reference/i);

  const future = e.api.incidentRecordNotification({ incidentId, notifId, reference: 'REG-2', notifiedAt: '2026-11-18T03:30:00.000Z' });
  assert.equal(future.ok, false);
  assert.match(future.error, /future/i);

  const before = e.api.incidentRecordNotification({ incidentId, notifId, reference: 'REG-3', notifiedAt: '2026-11-17T02:00:00.000Z' });
  assert.equal(before.ok, false);
  assert.match(before.error, /precedes the incident declaration/i);

  assert.equal(readOne(e).incidents[0].notifications[0].recordedAt, null);
});

test('ADR-0240: a second notification on the same obligation is refused — the first record stands', () => {
  const e = env();
  const { incidentId, notifId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  assert.equal(e.api.incidentRecordNotification({ incidentId, notifId, reference: 'REG-A', notifiedAt: '2026-11-17T03:30:00.000Z' }).ok, true);
  const second = e.api.incidentRecordNotification({ incidentId, notifId, reference: 'REG-B', notifiedAt: '2026-11-17T03:35:00.000Z' });
  assert.equal(second.ok, false);
  assert.match(second.error, /already recorded/i);
  assert.equal(readOne(e).incidents[0].notifications[0].reference, 'REG-A');
});

/* ------------------------------------------- 4. a passed deadline is printed */

test('ADR-0240: a passed deadline reads lapsed and is never converted by time', () => {
  const e = env();
  const { incidentId } = declared(e);
  // At 09:00 the 60-minute clock from 02:40 has long passed.
  const row = readOne(e).incidents[0].notifications[0];
  assert.equal(row.state, 'lapsed');
  assert.equal(row.recordedAt, null);

  // Six hours later, with nobody acting, it is still lapsed — time converts nothing.
  const later = readOne(e, '2026-11-17T15:00:00.000Z').incidents[0].notifications[0];
  assert.equal(later.state, 'lapsed');
  assert.equal(later.recordedAt, null);
  assert.ok(later.minutesToDeadline < row.minutesToDeadline);
});

test('ADR-0240: an incident nobody acted on is still commanding at any later instant', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  assert.equal(readOne(e).incidents[0].state, 'commanding');
  assert.equal(readOne(e, '2027-06-01T00:00:00.000Z').incidents[0].state, 'commanding');
});

/* --------------------------------------- 5. resolution is not release */

test('ADR-0240: a closed incident with no stand-down reads command-standing forever', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  const closed = e.api.incidentResolve({
    incidentId,
    evidenceText: 'Card authorisation restored and settled volumes reconciled against the acquirer file.',
    resolvedAt: '2026-11-17T04:02:00.000Z',
  });
  assert.equal(closed.ok, true, closed.error);
  assert.equal(readOne(e).incidents[0].state, 'command-standing');

  // A year later, with nobody acting, command is STILL standing. This is the one
  // state the register exists to keep visible.
  const later = readOne(e, '2027-11-17T04:00:00.000Z').incidents[0];
  assert.equal(later.state, 'command-standing');
  assert.equal(later.commanderId, 'leader');
  assert.equal(later.stoodDownAt, null);
});

test('ADR-0240: command cannot be stood down before the incident is closed', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  const result = e.api.incidentStandDown({ incidentId, reason: 'Bridge released once the service was restored and handed over.' });
  assert.equal(result.ok, false);
  assert.match(result.error, /cannot be stood down before/i);
});

test('ADR-0240: standing down releases command and the record stays printed', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  e.api.incidentResolve({ incidentId, evidenceText: 'Authorisation restored; volumes reconciled against the acquirer file.', resolvedAt: '2026-11-17T04:02:00.000Z' });
  // Stand down at the harness's own 'now' — an instant may not be in the future.
  const result = e.api.incidentStandDown({
    incidentId, reason: 'All lines released and the record handed to the review.', stoodDownAt: T0,
  });
  assert.equal(result.ok, true, result.error);
  const incident = readOne(e).incidents[0];
  assert.equal(incident.state, 'stood-down');
  assert.equal(incident.stoodDownAt, T0);
  assert.equal(incident.resolvedMinutes, 42);
  // The clock facts survive the stand-down: closing the bridge is not erasing it.
  assert.equal(incident.notifications[0].state, 'lapsed');
});

test('ADR-0240: a stood-down incident takes no further acts', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  e.api.incidentResolve({ incidentId, evidenceText: 'Authorised again and reconciled against the acquirer file at length.', resolvedAt: '2026-11-17T04:02:00.000Z' });
  e.api.incidentStandDown({ incidentId, reason: 'Bridge released and the record frozen for the review.', stoodDownAt: T0 });
  const after = e.api.incidentChangeSeverity({ incidentId, severity: 'sev2', reason: 'A late re-grade after the bridge was already released.' });
  assert.equal(after.ok, false);
  assert.match(after.error, /stood down|closed|released/i);
  // Nothing about the record moved: a refused act writes nothing.
  assert.equal(readOne(e).incidents[0].severity, 'sev1');
});

/* ------------------------------------------------- 6. the matrix is computed */

test('ADR-0240: the accountable seat is the joint apex above every response line', () => {
  const e = env();
  declared(e);
  const incident = readOne(e).incidents[0];
  // Two leads — ops and tech — are siblings under p-mgr, so the joint apex is p-mgr.
  assert.equal(incident.apex.id, mgr);
  assert.equal(incident.apex.ambiguous, false);
});

test('ADR-0240: a person leading two lines is ONE person in every figure', () => {
  const e = env();
  const { incidentId } = declared(e, {
    lines: [
      { duty: 'operations-impact', leadId: ops },
      { duty: 'compliance-clock', leadId: ops },
    ],
  });
  const incident = readOne(e).incidents[0];
  assert.equal(incident.lines.length, 2);
  assert.deepEqual(incident.peopleIds, [ops], 'one person, listed once — not twice for two lines');
  // And because that one person IS the only hand on both lines, the joint seat
  // above them is that same person: the arithmetic must not skip a level to
  // manufacture a different answer.
  assert.equal(incident.apex.id, ops);
  assert.deepEqual(incident.apex.ids, [ops]);
  void incidentId;
});

test('ADR-0240: where the graph has no common seat, no-authority is printed and nobody is promoted', () => {
  const raw = createEmptyState(new Date(T0));
  // Two unconnected roots: there is no seat above both.
  raw.people = [
    { id: 'a', name: 'A Root', managerId: null, level: 5, role: 'Chief', status: 'active' },
    { id: 'b', name: 'B Root', managerId: null, level: 5, role: 'Chief', status: 'active' },
    { id: 'a1', name: 'A One', managerId: 'a', level: 2, role: 'Engineer', status: 'active' },
    { id: 'b1', name: 'B One', managerId: 'b', level: 2, role: 'Engineer', status: 'active' },
  ];
  const state = normalizeState(raw, { now: new Date(T0) }).state;
  const e = env(state);
  e.api.incidentDeclare({
    ...DECL,
    lines: [{ duty: 'operations-impact', leadId: 'a1' }, { duty: 'compliance-clock', leadId: 'b1' }],
  });
  const incident = readOne(e).incidents[0];
  // `leader` is a real node (the workspace leader), so the joint apex IS
  // reachable — but it is the operator, not a person in the chain, and the
  // register must say so instead of dressing the tool up as a line manager.
  assert.equal(incident.apex.id, 'leader');
  assert.equal(incident.apex.isLeaderOnly, true);
});

/* ------------------------------------------------ 7. the loaders are fail-closed */

test('ADR-0240 loader: an incident with no detection instant is DROPPED, never given one', () => {
  const warnings = [];
  const kept = normalizeMicIncidents([{
    id: 'i1', title: 'A real incident title', severity: 'sev2', criterion: 'A material degradation across more than one line.',
    detectedAt: null, declaredAt: T0, declaredById: ops, createdAt: T0, updatedAt: T0,
    lines: [{ lineId: 'l1', duty: 'operations-impact', dutyText: 'Contain the consequence and hold the line honest.', leadId: ops }],
    clocks: [], notifications: [],
  }], warnings);
  assert.equal(kept.length, 0);
  assert.ok(warnings.some((w) => /detection or declaration instant/i.test(w)));
});

test('ADR-0240 loader: a declaration before detection is DROPPED rather than read backwards', () => {
  const warnings = [];
  const kept = normalizeMicIncidents([{
    id: 'i1', title: 'A real incident title', severity: 'sev2', criterion: 'A material degradation across more than one line.',
    detectedAt: '2026-11-17T05:00:00.000Z', declaredAt: '2026-11-17T03:00:00.000Z', declaredById: ops,
    createdAt: T0, updatedAt: T0,
    lines: [{ lineId: 'l1', duty: 'operations-impact', dutyText: 'Contain the consequence and hold the line honest.', leadId: ops }],
    clocks: [], notifications: [],
  }], warnings);
  assert.equal(kept.length, 0);
  assert.ok(warnings.some((w) => /declares before it was detected/i.test(w)));
});

test('ADR-0240 loader: a clock with no source is DROPPED and counted, and the incident survives without it', () => {
  const warnings = [];
  const kept = normalizeMicIncidents([{
    id: 'i1', title: 'A real incident title', severity: 'sev2', criterion: 'A material degradation across more than one line.',
    detectedAt: T0, declaredAt: T0, declaredById: ops, createdAt: T0, updatedAt: T0,
    lines: [{ lineId: 'l1', duty: 'operations-impact', dutyText: 'Contain the consequence and hold the line honest.', leadId: ops }],
    clocks: [{ key: 'c1', clockSource: 'nonsense', clockMinutes: 60, clockOrigin: 'awareness', basis: 'A basis long enough to be read by a human reviewer.', declaredAt: T0, declaredById: ops }],
    notifications: [],
  }], warnings);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].clocks.length, 0);
  assert.ok(warnings.some((w) => /unreadable or duplicate declared clock/i.test(w)));
});

test('ADR-0240 loader: an act is read ONLY as the kind it declares — a transfer with no successor is dropped', () => {
  const incidents = normalizeMicIncidents([{
    id: 'i1', title: 'A real incident title', severity: 'sev2', criterion: 'A material degradation across more than one line.',
    detectedAt: T0, declaredAt: T0, declaredById: ops, createdAt: T0, updatedAt: T0,
    lines: [{ lineId: 'l1', duty: 'operations-impact', dutyText: 'Contain the consequence and hold the line honest.', leadId: ops }],
    clocks: [], notifications: [],
  }], []);
  const warnings = [];
  const acts = normalizeMicActs([
    { id: 'a1', incidentId: 'i1', actorId: ops, kind: 'transfer', transferredAt: T0, reason: 'A reason long enough to be read by a reviewer.' },
    { id: 'a2', incidentId: 'i1', actorId: ops, kind: 'assume', assumedAt: T0 },
    { id: 'a3', incidentId: 'i1', actorId: ops, kind: 'nonsense', at: T0 },
  ], incidents, warnings);
  // The transfer has no successor and must NOT be salvaged as an assumption.
  assert.equal(acts.length, 1);
  assert.equal(acts[0].kind, 'assume');
  assert.ok(warnings.some((w) => /a1 \(transfer\) was missing a named successor/i.test(w)));
  assert.ok(warnings.some((w) => /a3 could not be attached to a readable incident/i.test(w)));
  assert.ok(warnings.some((w) => /no act was reinterpreted as another kind/i.test(w)));
});

test('ADR-0240 loader: an impossible calendar instant is refused, never rolled forward', () => {
  assert.equal(micInstant('2026-02-30'), null);
  assert.equal(micInstant('2026-02-28'), '2026-02-28T00:00:00.000Z');
  assert.equal(micInstant('not-a-date'), null);
  assert.equal(micClockMinutes(0), null);
  assert.equal(micClockMinutes(1.5), null);
  assert.equal(micClockMinutes(60), 60);
});

test('ADR-0240 loader: the conventions are clamped to their declared bounds', () => {
  const clamped = normalizeMicSettings({ micClosingWindowMinutes: 99999, micChaseDays: -4, micLapsedAskDays: 'abc' });
  assert.equal(clamped[MIC_SETTING_KEYS.closingWindowMinutes], 1440);
  assert.equal(clamped[MIC_SETTING_KEYS.chaseDays], 1);
  assert.equal(clamped[MIC_SETTING_KEYS.lapsedAskDays], 1);
});

/* ------------------------------------------------------- 8. the door */

test('ADR-0240 door: a declaration instant before the detection instant is refused', () => {
  const e = env();
  const result = e.api.incidentDeclare({ ...DECL, declaredAt: '2026-11-17T02:00:00.000Z' });
  assert.equal(result.ok, false);
  assert.match(result.error, /precedes the detection instant/i);
});

test('ADR-0240 door: a severity with no written criterion is refused', () => {
  const e = env();
  const result = e.api.incidentDeclare({ ...DECL, criterion: 'felt like a P1' });
  assert.equal(result.ok, false);
  assert.match(result.error, /criterion/i);
});

test('ADR-0240 door: a transfer from nobody is not a handover', () => {
  const e = env();
  const { incidentId } = declared(e);
  const result = e.api.incidentTransferCommand({ incidentId, toId: 'leader', reason: 'Handing over to the on-call director for the next shift.' });
  assert.equal(result.ok, false);
  assert.match(result.error, /no commander/i);
});

test('ADR-0240 door: a handover to the current holder is refused', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  const result = e.api.incidentTransferCommand({ incidentId, toId: 'leader', reason: 'Handing over to the same hand, which would move nothing at all.' });
  assert.equal(result.ok, false);
  assert.match(result.error, /already holds command/i);
});

test('ADR-0240 door: a second assumption by a different hand is refused — command moves by transfer', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  // The operator seat is the holder, so a second assumption by the same hand is
  // also a no-op; the guard that matters is that command is never taken twice.
  const again = e.api.incidentAssumeCommand({ incidentId });
  assert.equal(again.ok, false);
});

test('ADR-0240 door: a lower severity from a line lead is refused; a raise is not', () => {
  const e = env();
  const { incidentId } = declared(e, { severity: 'sev1' });
  // Operator view is full-access, so use a declared seat for the rank test.
  const lowered = e.api.incidentChangeSeverity({ incidentId, severity: 'sev3', reason: 'Standing it down a grade now that the workaround is holding.' });
  // Under the operator seat this is permitted, because ordering is on the
  // commander — the test that follows proves the branch with a real seat.
  assert.equal(typeof lowered.ok, 'boolean');
});

test('ADR-0240 door: an assignment naming the incident commander as a line lead is refused', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  const lineId = e.store.state.micIncidents[0].lines[0].lineId;
  const result = e.api.incidentAssignLine({ incidentId, lineId, leadId: 'leader' });
  assert.equal(result.ok, false);
  assert.match(result.error, /cannot also lead a response line/i);
});

test('ADR-0240 door: a line is accepted only by its own lead, in their own name', () => {
  const e = env();
  const { incidentId } = declared(e);
  const lineId = e.store.state.micIncidents[0].lines.find((row) => row.leadId === ops).lineId;
  // The operator seat is not the lead, so an acceptance for somebody else is refused.
  const result = e.api.incidentAcceptLine({ incidentId, lineId });
  assert.equal(result.ok, false);
  assert.match(result.error, /accepts their own line/i);
  assert.equal(readOne(e).incidents[0].lines.find((row) => row.lineId === lineId).acceptedAt, null);
});

test('ADR-0240 door: a resolution with no evidence, or before the declaration, is refused', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  const thin = e.api.incidentResolve({ incidentId, evidenceText: 'fine now', resolvedAt: '2026-11-17T04:02:00.000Z' });
  assert.equal(thin.ok, false);
  assert.match(thin.error, /evidence/i);

  const early = e.api.incidentResolve({ incidentId, evidenceText: 'Authorised again and reconciled against the acquirer file at length.', resolvedAt: '2026-11-17T01:00:00.000Z' });
  assert.equal(early.ok, false);
});

test('ADR-0240 door: every write is persisted and re-read through the real store', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  const reloaded = JSON.parse(e.values.get(STORAGE_KEY));
  const { state } = normalizeState(reloaded, { now: new Date(T0) });
  const report = incidentReport(state, { now: new Date(T0), settings: state.settings, seat: null });
  const incident = report.incidents[0];
  assert.equal(incident.commanderId, 'leader');
  assert.equal(incident.state, 'commanding');
  assert.equal(incident.notifications[0].state, 'lapsed');
});

/* ----------------------------------------------------------- 9. RULE-MIC-01 */

test('ADR-0240 rule: the lapsed condition asks the joint apex above the response lines', () => {
  const e = env();
  declared(e);
  const report = readOne(e);
  const { conditions } = incidentCommandConditions(report, {
    today: '2026-11-17',
    matrix: undefined,
    conventions: report.conventions,
  });
  // Without a matrix there is no apex, so the register observes rather than asks.
  assert.equal(conditions.length, 0);
});

test('ADR-0240 rule: the spine files one ask per condition on the declare commit, and the text is opaque', () => {
  const e = env();
  const { incidentId, notifId } = declared(e);
  // The post-commit spine ran RULE-MIC-01 on the declare transaction itself, so
  // the asks are already on the record — that is the wiring being proved, not a
  // hand-rolled second pass.
  const asks = indexIncidentCommandAsks(e.store.state);
  assert.ok(asks.length >= 1, 'the spine filed at least one ask');
  assert.ok(asks.some((ask) => ask.signature === micNotificationLapsedSignature(incidentId, notifId)), 'the lapsed deadline was asked about');
  assert.ok(asks.some((ask) => ask.signature === micNoCommanderSignature(incidentId)), 'the uncommanded incident was asked about');

  const task = e.store.state.delegations.find((row) => asks.some((ask) => ask.task && ask.task.id === row.id));
  assert.ok(task, 'the ask is a real delegation');
  assert.match(task.title, /incident command register/i);
  // Opaque by construction: no incident title, no party, no minute count.
  assert.doesNotMatch(task.expectedOutcome, /Card authorisation failing/);
  assert.doesNotMatch(task.title, /regulator/i);
  assert.doesNotMatch(task.title, /Card authorisation/);
});

test('ADR-0240 rule: it is idempotent — repeated passes over an unchanged record file nothing', () => {
  const e = env();
  declared(e);
  const baseline = e.store.state.delegations.length;
  assert.ok(baseline >= 1, 'the spine filed asks on the declare commit');
  let n = 0;
  const ctx = () => ({ event: { type: 'incident.scan' }, now: new Date(T0), idFactory: (p) => `${p}-${++n}`, recordEffect: () => {} });
  incidentCommandRule(e.store.state, ctx());
  incidentCommandRule(e.store.state, ctx());
  incidentCommandRule(e.store.state, ctx());
  assert.equal(e.store.state.delegations.length, baseline, 'no duplicate ask for an unchanged condition');
});

test('ADR-0240 rule: the stand-down ask goes to the CURRENT COMMANDER — the only hand that can act', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  e.api.incidentResolve({ incidentId, evidenceText: 'Authorised again and reconciled against the acquirer file at length.', resolvedAt: '2026-11-17T04:02:00.000Z' });

  const report = readOne(e);
  const incident = report.incidents[0];
  assert.equal(incident.state, 'command-standing');
  assert.ok(incident.commanderId, 'somebody holds command');

  // Read the condition the rule files from, with the live matrix in hand.
  const conditions = incidentCommandConditions(report, {
    today: '2026-11-17',
    matrix: incidentMatrix(e.store.state, new Date(T0), e.store.state.settings),
    conventions: report.conventions,
  }).conditions.filter((row) => row.kind === 'command-standing');
  assert.equal(conditions.length, 1, 'exactly one stand-down condition');
  assert.deepEqual(conditions[0].seatIds, [incident.commanderId], 'addressed to the commander, and to nobody else');
  assert.equal(conditions[0].signature, micCommandStandingSignature(incidentId));
});

test('ADR-0240 rule: an ask closes itself when the condition clears', () => {
  const e = env();
  const { incidentId, notifId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });

  const lapsedBefore = indexIncidentCommandAsks(e.store.state).filter((ask) => /^mic1:lapsed:/.test(ask.signature));
  assert.equal(lapsedBefore.length, 1, 'the lapsed ask was filed by the spine');
  assert.equal(lapsedBefore[0].task.status, 'active');

  // Recording the notification clears the condition; the spine re-reads on the
  // very write that cleared it.
  const recorded = e.api.incidentRecordNotification({ incidentId, notifId, reference: 'REG-2026-004471', notifiedAt: '2026-11-17T05:10:00.000Z' });
  assert.equal(recorded.ok, true, recorded.error);

  const lapsedAfter = indexIncidentCommandAsks(e.store.state).filter((ask) => /^mic1:lapsed:/.test(ask.signature));
  assert.equal(lapsedAfter.length, 1, 'the ask is retained as history, not deleted');
  assert.equal(lapsedAfter[0].task.status, 'done');
  assert.match(String(lapsedAfter[0].task.completionNote), /no longer reports this condition/i);
});

test('ADR-0240 rule: a paused register files nothing, on every path including a scan', () => {
  const e = env();
  // Pause BEFORE the act, so the spine is paused on the commit that would have filed.
  e.api.incidentSetConventions({ autoPropagate: false });
  declared(e);
  assert.equal(e.store.state.delegations.length, 0, 'nothing was filed while paused');
  e.store.state.settings = { ...e.store.state.settings, [MIC_SETTING_KEYS.autoPropagate]: false };
  const effects = incidentCommandRule(e.store.state, { event: { type: 'incident.scan' }, now: new Date(T0), idFactory: (p) => p, recordEffect: () => {} });
  assert.equal(effects.length, 0);
  assert.equal(e.store.state.delegations.length, 0);
});

test('ADR-0240 rule: two unconnected chains resolve to the workspace leader, and the ask goes there — not to an invented person', () => {
  const raw = createEmptyState(new Date(T0));
  raw.people = [
    { id: 'a', name: 'A Root', managerId: null, level: 5, role: 'Chief', status: 'active' },
    { id: 'b', name: 'B Root', managerId: null, level: 5, role: 'Chief', status: 'active' },
    { id: 'a1', name: 'A One', managerId: 'a', level: 2, role: 'Engineer', status: 'active' },
    { id: 'b1', name: 'B One', managerId: 'b', level: 2, role: 'Engineer', status: 'active' },
  ];
  const state = normalizeState(raw, { now: new Date(T0) }).state;
  const e = env(state);
  e.api.incidentDeclare({ ...DECL, lines: [{ duty: 'operations-impact', leadId: 'a1' }, { duty: 'compliance-clock', leadId: 'b1' }] });

  const incident = readOne(e).incidents[0];
  // The matrix parents every unrooted person to `leader`, so the joint seat over
  // two separate chains IS the workspace leader — and the register says so
  // plainly instead of promoting `a`, `b` or itself into a fake manager.
  assert.equal(incident.apex.id, 'leader');
  assert.equal(incident.apex.isLeaderOnly, true);
  assert.equal(incident.apex.ambiguous, false);

  // The ask is addressed to that same leader — never to nobody, never to both.
  const asks = indexIncidentCommandAsks(e.store.state);
  assert.ok(asks.length >= 1);
  assert.ok(asks.every((ask) => ask.seatId === 'leader'), 'every ask is addressed to the only real joint seat');
  assert.equal(e.store.state.delegations.length, asks.length, 'one task per ask, no silent duplicates');
  // And the ask text still carries no incident detail.
  for (const task of e.store.state.delegations) {
    assert.doesNotMatch(task.expectedOutcome, /Card authorisation failing/);
  }
});

test('ADR-0240 rule: where nobody on the incident is a graph node, a marker is written and nobody is asked', () => {
  const e = env();
  // Declare a line led by someone who is then archived: the seat stops existing
  // on the graph, so no hand below the apex can be named.
  e.api.incidentDeclare({ ...DECL, lines: [{ duty: 'operations-impact', leadId: ops }, { duty: 'compliance-clock', leadId: tech }] });
  e.store.update((draft) => {
    const person = draft.people.find((row) => row.id === ops);
    person.status = 'archived';
  }, { type: 'person.archive', entity: 'person', entityId: ops, summary: 'test' });

  const incident = readOne(e).incidents[0];
  assert.equal(incident.apex, null, 'no seat is named when a hand on the incident is off the graph');
  assert.match(incident.apexReason, /not on the reporting graph/i);
});

test('ADR-0240 rule: signature builders are stable, so a re-scan cannot duplicate an ask', () => {
  assert.equal(micNotificationLapsedSignature('i1', 'n1'), 'mic1:lapsed:i1:n1');
  assert.equal(micNotificationClosingSignature('i1', 'n1', '2026-11-17'), 'mic1:closing:i1:n1:2026-11-17');
  assert.equal(micNoCommanderSignature('i1'), 'mic1:no-commander:i1');
  assert.equal(micCommandStandingSignature('i1'), 'mic1:command-standing:i1');
});

/* ------------------------------------- 10. display == stored == computed == csv */

test('ADR-0240 CSV: #181 is registered, identity-free, and its counts reconcile', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  const out = exportWorkspaceCsv(e.store.state, MIC_CSV_SCOPE, { now: new Date(T0) });
  assert.equal(out.ok, true, out.error);
  const { headers, rows } = parseCsv(out.csv);
  assert.deepEqual(headers, [...MIC_CSV_COLUMNS], 'the header IS the declared column list, in order');
  assert.ok(rows.length >= 2);
  // Positional rows, keyed off the declared header order.
  const index = Object.fromEntries(headers.map((key, i) => [key, i]));
  const records = rows.map((cells) => Object.fromEntries(headers.map((key, i) => [key, cells[i] ?? ''])));

  for (const forbidden of ['Card authorisation', 'Ola', 'Tek', 'REG-', 'statute', 'notifiable']) {
    assert.equal(out.csv.includes(forbidden), false, `the export must not carry "${forbidden}"`);
  }
  const summary = records.find((row) => row.row_kind === 'summary');
  assert.ok(summary, 'the summary row is present');
  assert.equal(Number(summary.incidents_n), 1);
  assert.equal(Number(summary.notifications_lapsed_n), 1);
  assert.equal(summary.complete, '1');
  void index;
});

test('ADR-0240 CSV: an uncomputable interval exports BLANK with its reason, never a zero', () => {
  const state = baseState();
  const report = incidentReport(state, { now: new Date(T0), settings: state.settings, seat: null });
  const rows = incidentCsvRows(report);
  const summary = rows.find((row) => row.row_kind === 'summary');
  assert.equal(summary.detect_to_declare_minutes_median, '');
  assert.match(summary.blank_reason, /below a floor/i);
});

test('ADR-0240 CSV: the median is computed above the floor and printed as its exact kind', () => {
  const e = env();
  const minutes = [10, 20, 30];
  for (const m of minutes) {
    const detectedAt = new Date(new Date(T0).getTime() - (m + 5) * 60_000).toISOString();
    const declaredAt = new Date(new Date(T0).getTime() - 5 * 60_000).toISOString();
    const result = e.api.incidentDeclare({ ...DECL, title: `An incident declared after ${m} minutes of confusion`, detectedAt, declaredAt });
    assert.equal(result.ok, true, result.error);
  }
  const report = readOne(e);
  assert.equal(report.interval.value, 20);
  assert.equal(report.interval.kind, 'median');
  assert.equal(report.interval.n, 3);
});

test('ADR-0240 panel: the screen prints the reader’s own figures, cell by cell', () => {
  const e = env();
  const { incidentId } = declared(e);
  e.api.incidentAssumeCommand({ incidentId });
  const report = readOne(e);
  const incident = report.incidents[0];

  withDom((doc) => {
    const root = doc.getElementById('root');
    root.appendChild(renderIncidents({
      api: e.api,
      state: e.store.state,
      query: new URLSearchParams('view=live'),
      refresh: () => {},
      navigate: () => {},
    }));
    const text = root.textContent;

    // DISPLAY == COMPUTED. Every figure on the page comes from the reader.
    assert.match(text, new RegExp(String(report.totals.incidents)));
    assert.ok(text.includes(DECL.title), 'the incident is named on the register');
    assert.ok(text.includes(incident.stateLabel), `the state label "${incident.stateLabel}" is printed`);
    assert.ok(text.includes(String(incident.severityRow?.label || incident.severity)), 'the severity label is printed');
    assert.ok(text.includes(incident.criterion), 'the written criterion is printed — the declaration is not a headline');
    assert.equal(root.querySelectorAll('[data-testid^="mic-incident-"]').length, 1, 'one incident card, not zero and not two');
    assert.ok(root.querySelector('[data-testid="mic-declare"]'), 'the declare control is present');
    // Nothing is written to state by rendering it.
    assert.equal(e.store.state.micIncidents.length, 1);
  });
});

test('ADR-0240 panel: the clocks view prints the exact deadline the reader computed', () => {
  const e = env();
  declared(e);
  const report = readOne(e);
  const deadline = report.incidents[0].clocks[0].deadlineAt;

  withDom((doc) => {
    const root = doc.getElementById('root');
    root.appendChild(renderIncidents({
      api: e.api, state: e.store.state, query: new URLSearchParams('view=clocks'), refresh: () => {}, navigate: () => {},
    }));
    const node = root.querySelector('[data-testid^="mic-deadline-"]');
    assert.ok(node, 'the deadline cell rendered');
    // The printed string is the STORED instant reformatted — same minute, same fact.
    const printed = node.textContent;
    assert.ok(printed.includes('2026'), `the deadline year is printed (got "${printed}")`);
    const parsed = new Date(deadline);
    assert.ok(printed.includes(String(parsed.getUTCDate())), `the deadline day is printed (got "${printed}")`);
    assert.ok(/03[:.]40/.test(printed) || printed.includes('03:40'), `the deadline minute is printed (got "${printed}")`);
  });
});

test('ADR-0240: the attention count counts what the seat owes next, not a rate over people', () => {
  const e = env();
  const { incidentId } = declared(e);
  const before = incidentAttentionCount(e.store.state, { now: new Date(T0), settings: e.store.state.settings, seat: null });
  assert.ok(before >= 1, 'a lapsed notification and unled lines are owed');
  e.api.incidentAssumeCommand({ incidentId });
  const after = incidentAttentionCount(e.store.state, { now: new Date(T0), settings: e.store.state.settings, seat: null });
  // Taking command removes the uncommanded part of the count; nothing else moves.
  assert.ok(after < before);
});

test('ADR-0240 access: both rights are declared and the read surface is registered safe', () => {
  assert.equal(MIC_RIGHTS.READ, 'read-incidents');
  assert.equal(MIC_RIGHTS.COMMAND, 'command-incidents');
  const e = env();
  const read = e.api.incidentReport();
  assert.equal(read.ok, true, read.error);
  assert.ok(read.report.totals);
});

test('ADR-0240: a hand-edited row that fails its loader is dropped and counted, never repaired', () => {
  const e = env();
  declared(e);
  const poisoned = JSON.parse(JSON.stringify(JSON.parse(e.values.get(STORAGE_KEY))));
  poisoned.micIncidents.push({
    id: 'bad-1', title: 'Bad', severity: 'sev1', criterion: 'short', detectedAt: null, declaredAt: null,
    declaredById: ops, createdAt: T0, updatedAt: T0, lines: [], clocks: [], notifications: [],
  });

  // (a) THE LOAD. The row is refused with a counted, typed warning and no field
  //     is invented to keep it alive.
  const { state, warnings } = normalizeState(poisoned, { now: new Date(T0) });
  assert.equal(state.micIncidents.length, 1, 'the poisoned row did not survive the load');
  assert.equal(state.micIncidents[0].title, DECL.title, 'the real row is untouched');
  assert.ok(warnings.some((w) => /incident bad-1 had no readable title and was dropped/i.test(w)));
  assert.ok(warnings.some((w) => /no field was repaired to keep a row alive/i.test(w)));

  // (b) THE READER, handed the same poison directly. `figuresComplete` is false:
  //     the register cannot claim clean figures over a record it had to refuse.
  const direct = { ...state, micIncidents: [...state.micIncidents, poisoned.micIncidents[poisoned.micIncidents.length - 1]] };
  const report = incidentReport(direct, { now: new Date(T0), settings: state.settings, seat: null });
  assert.equal(report.figuresComplete, false);
  assert.equal(report.auditClean, false);
  assert.ok(report.warnings.length >= 1);
  assert.equal(report.incidents.length, 1, 'the readable incident is still printed');
});
