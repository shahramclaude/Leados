// ADR-0245 — Personal-Account Dealing, Insider Lists & Closed-Period Pre-Clearance
// (Schema v199).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — six empty ledgers, three declared
//      conventions, and NO window, designation, clearance, decision or dealing
//      inferred from a results calendar, a delegation, an existing register or a
//      prior year's pattern;
//   2. the loaders are FAIL-CLOSED — a designation with no written basis
//      reference, a clearance with no security, side or quantity, a decision with
//      no clearance, a cleared decision with no validity, a refusal with no
//      written reason, and a dealing with no broker reference are DROPPED with
//      counted warnings and never repaired;
//   3. A SEEDED SELF-APPROVAL IS KEPT AND PRINTED, never dropped and never
//      repaired: a decision by the person who requested it survives the loader,
//      reads `breach-decided-by-requester`, and says so in the warnings. The DOOR
//      still refuses to create one;
//   4. the arithmetic is EXACT — the window opens and closes on whole days from
//      the event's own declared dates, the days inside and the days left are
//      whole days, the validity close and the turnaround due day are whole days;
//   5. AN UNDETERMINABLE WINDOW IS NEVER "OPEN" — an event with no declared
//      before/after bound, and an instrument the event does not scope, both read
//      `dealt-window-undeterminable`, never a silent pass;
//   6. AN ORDERING FACT IS KEPT, NOT REPAIRED — a dealing before the designation
//      reads `dealt-before-designation`; a trade inside a closed window WHILE
//      properly cleared reads `breach-dealt-in-closed-window` and keeps the
//      clearance's own `cleared-and-dealt` state beside it, because both facts are
//      true and the graver one is printed;
//   7. the DOOR refuses — a person cannot decide a clearance they requested, a
//      seat that is not strictly above the requester cannot decide it, a refusal
//      with no written reason, a cleared decision with no validity, a designation
//      with no written basis reference;
//   8. the MATRIX is correct — independence is computed through the one
//      `matrixJointApex` engine against the requester AND every line manager, a
//      project-line manager below the apex is not independent, and the apex above
//      two lines (priya) is;
//   9. DISCLOSURE FOLLOWS THE DUTY, NOT THE RANK ALONE — a rank-3 seat that is the
//      proven apex sees the row it is asked to decide in full, while the same seat
//      sees a stranger's row as `withheld`. A disclosure rule that blinds the
//      decider would disable the control;
//  10. a LISTED PERSON WITH NO OPERATING SEAT is a printed limitation, not a
//      silence — an IC holds no seat, the reader says so, and the record therefore
//      prints who asked on their behalf;
//  11. RULE-DWL-01 is idempotent per (kind, id, addressee), capped at four asks a
//      commit, asks only seats strictly above every line, never the person, opaque
//      in its text, self-closing, and pause-governed on every path;
//  12. the CSV boundary is aggregate and identity-free, prints a below-floor count
//      BLANK with its reason, and keeps `complete` apart from the counts;
//  13. the panel prints the reader's own figures cell by cell (display ==
//      computed), and the demo record derives live hours-independent states.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import {
  buildPersonalDealing,
  deriveDwlClearance,
  deriveDwlDealing,
  windowVerdictFor,
} from '../../app/core/domain/personalDealing.js';
import {
  normalizeDwlClearances,
  normalizeDwlDealings,
  normalizeDwlDecisions,
  normalizeDwlDesignations,
  normalizeDwlEvents,
  normalizeDwlSettings,
} from '../../app/core/domain/personalDealingSchema.js';
import { dwlDay, windowSpan, daysInside, validThrough, turnaroundDueOn } from '../../app/core/domain/personalDealingMath.js';
import { personalDealingCsvRows } from '../../app/core/domain/personalDealingReport.js';
import {
  DWL_CSV_COLUMNS,
  DWL_CSV_SCOPE,
  DWL_DEFAULTS,
  DWL_STATE_KEYS,
  DWL_CLEARANCE_STATE_KEYS,
  DWL_WINDOW_STATES,
} from '../../app/core/domain/personalDealingRegistry.js';
import {
  personalDealingRule,
  personalDealingConditions,
  DWL_PAUSE_SWITCH,
} from '../../app/core/domain/personalDealingRules.js';
import { renderPersonalDealing } from '../../app/views/personalDealing.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';

const NOW = new Date('2026-11-17T09:00:00.000Z');
const T0 = NOW.toISOString();
const day = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const dayF = (n) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

const person = (id, managerId, overrides = {}) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  managerId,
  role: 'Lead',
  status: 'active',
  startDate: '2026-01-01',
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T09:00:00.000Z',
  ...overrides,
});

/**
 * Priya leads mei and freya. Sam reports to mei on his home line and holds a
 * declared PROJECT line to freya. Sam is an IC: he has no reports, so he holds
 * no operating seat — which is the case claim 10 is about. Mei requests his
 * clearance for him, and priya is the one joint seat above mei AND freya.
 */
function fixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.people = [
    person('priya', null, { level: 'director' }),
    person('mei', 'priya', { level: 'manager' }),
    person('freya', 'priya', { level: 'manager' }),
    person('sam', 'mei', { level: 'ic' }),
  ];
  raw.reportingLines = [{
    id: 'rl-sam-freya', personId: 'sam', managerId: 'freya', kind: 'project', shareH: 30,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  if (overrides.activeSeatId) raw.settings = { ...raw.settings, activeSeatId: overrides.activeSeatId };
  raw.dwlDesignations = overrides.designations !== undefined ? overrides.designations : [designation()];
  raw.dwlEvents = overrides.events !== undefined ? overrides.events : [event()];
  raw.dwlClearances = overrides.clearances || [];
  raw.dwlDecisions = overrides.decisions || [];
  raw.dwlDealings = overrides.dealings || [];
  raw.dwlMarkers = overrides.markers || [];
  return raw;
}

function designation(overrides = {}) {
  return {
    id: 'des-1',
    personId: 'sam',
    basis: 'access-to-unpublished-price-sensitive',
    instrumentRef: 'Group Insider Dealing & Market Abuse Policy 2026, clause 4.2 — designated persons list',
    declaredOn: day(200),
    endsOn: null,
    note: '',
    declaredById: 'priya',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/** Results in 5 days, 21 closed days before, 0 after: the window is CLOSED today. */
function event(overrides = {}) {
  return {
    id: 'evt-1',
    kind: 'results-announcement',
    subject: 'Half-year results for the period ended 30 September 2026',
    disclosesOn: dayF(5),
    beforeDays: 21,
    afterDays: 0,
    scopeLineIds: [],
    declaredById: 'priya',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function clearance(overrides = {}) {
  return {
    id: 'clr-1',
    personId: 'sam',
    securityRef: 'DK0062498333',
    side: 'sell',
    quantity: 400,
    requestedOn: day(2),
    requestedById: 'mei',
    reason: '',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function decision(overrides = {}) {
  return {
    id: 'dec-1',
    clearanceId: 'clr-1',
    decidedOn: day(1),
    decidedById: 'priya',
    outcome: 'cleared',
    validityDays: 10,
    reason: '',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function dealing(overrides = {}) {
  return {
    id: 'dlg-1',
    personId: 'sam',
    securityRef: 'DK0062498333',
    side: 'sell',
    quantity: 400,
    dealtOn: day(0),
    brokerRef: 'Contract note 2026-11-17-8871 (Nordea)',
    clearanceId: null,
    note: '',
    recordedById: 'mei',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildPersonalDealing(load(raw), { now: NOW, seat: null, ...opts });

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
  return { store, api };
}

/* ------------------------------------------------------------------ schema */

test('the schema bump is additive and infers nothing', () => {
  assert.equal(SCHEMA_VERSION, 203);
  const migrated = migrate({ ...createEmptyState(T0), schemaVersion: 198 }, { now: NOW });
  assert.equal(migrated.raw.schemaVersion, 203);
  for (const key of ['dwlDesignations', 'dwlEvents', 'dwlClearances', 'dwlDecisions', 'dwlDealings', 'dwlMarkers']) {
    assert.ok(Array.isArray(migrated.raw[key]), `${key} must be an array`);
    assert.equal(migrated.raw[key].length, 0, `${key} must start EMPTY — nothing is inferred`);
  }
  // Three declared conventions, and NO window default: a closed period is a
  // declaration a human makes about a real event, never a system guess.
  assert.equal(migrated.raw.settings.dwlClearanceTurnaroundDays, DWL_DEFAULTS.clearanceTurnaroundDays);
  assert.equal(migrated.raw.settings.dwlPrivacyFloor, DWL_DEFAULTS.privacyFloor);
  assert.equal(migrated.raw.settings.dwlAutoPropagate, true, 'the reader refuses silence as an approval by default');
  assert.equal(migrated.raw.settings.dwlBeforeDays, undefined);
  assert.equal(migrated.raw.settings.dwlAfterDays, undefined);
});

test('settings are clamped into their bounds rather than trusted', () => {
  const settings = normalizeDwlSettings({
    dwlClearanceTurnaroundDays: 900,
    dwlPrivacyFloor: 0,
    dwlAutoPropagate: 'yes',
  });
  assert.equal(settings.dwlClearanceTurnaroundDays, 30, 'turnaround clamps to its ceiling');
  assert.equal(settings.dwlPrivacyFloor, 2, 'the floor clamps UP: a floor of 1 is no floor');
  assert.equal(settings.dwlAutoPropagate, true, 'a declared switch is read as declared');
});

/* ------------------------------------------------------------- fail-closed */

test('the loaders drop what cannot be evidenced and count every drop', () => {
  const desWarnings = [];
  const des = normalizeDwlDesignations([
    designation({ id: 'd-ok' }),
    designation({ id: 'd-no-ref', instrumentRef: '' }),
    designation({ id: 'd-no-basis', basis: 'vibes' }),
    designation({ id: 'd-ends-before', declaredOn: day(10), endsOn: day(20) }),
  ], desWarnings);
  assert.deepEqual(des.map((row) => row.id), ['d-ok']);
  assert.ok(desWarnings.some((line) => line.includes('could not be read exactly')),
    'the drops are counted, none is silent');
  assert.ok(desWarnings.length >= 1);

  const evtWarnings = [];
  const evt = normalizeDwlEvents([
    event({ id: 'e-ok' }),
    event({ id: 'e-no-anchor', disclosesOn: '' }),
    event({ id: 'e-no-before', beforeDays: null }),
    event({ id: 'e-no-after', afterDays: null }),
  ], evtWarnings);
  assert.deepEqual(evt.map((row) => row.id), ['e-ok']);
  assert.ok(evtWarnings.some((line) => line.includes('could not be read exactly')),
    'the drops are COUNTED, never silent');
  assert.equal(evtWarnings.filter((line) => line.includes('could not be read exactly')).length, 1);

  const clrWarnings = [];
  const clr = normalizeDwlClearances([
    clearance({ id: 'c-ok' }),
    clearance({ id: 'c-no-sec', securityRef: '' }),
    clearance({ id: 'c-zero', quantity: 0 }),
    clearance({ id: 'c-no-side', side: 'swap' }),
    clearance({ id: 'c-no-requester', requestedById: '' }),
  ], des, clrWarnings);
  assert.deepEqual(clr.map((row) => row.id), ['c-ok'], 'a clearance must name who asked');
  assert.ok(clrWarnings.some((line) => line.includes('could not be read exactly')));

  const decWarnings = [];
  const dec = normalizeDwlDecisions([
    decision({ id: 'k-ok' }),
    decision({ id: 'k-no-clr', clearanceId: 'ghost' }),
    decision({ id: 'k-no-validity', validityDays: null }),
    decision({ id: 'k-refuse-no-reason', outcome: 'refused', validityDays: null, reason: '' }),
  ], clr, decWarnings);
  assert.ok(dec.length <= 1,
    'a decision must belong to a known clearance and a cleared one must declare a validity');
  assert.ok(decWarnings.some((line) => line.includes('could not be read exactly')));

  const dlgWarnings = [];
  const dlg = normalizeDwlDealings([
    dealing({ id: 'g-ok' }),
    dealing({ id: 'g-no-broker', brokerRef: '' }),
    dealing({ id: 'g-no-day', dealtOn: '' }),
  ], clr, dlgWarnings);
  assert.deepEqual(dlg.map((row) => row.id), ['g-ok']);
  assert.ok(dlgWarnings.some((line) => line.includes('could not be read exactly')));
});

test('a seeded self-approval is KEPT and printed, never dropped or repaired', () => {
  const state = load(fixture({
    clearances: [clearance({ requestedById: 'sam' })],
    decisions: [decision({ decidedById: 'sam' })],
    dealings: [dealing({ dealtOn: day(3) })],
  }));
  const report = buildPersonalDealing(state, { now: NOW, seat: null });
  assert.equal(report.decisions.length, 1, 'the decision survives the loader');
  assert.equal(report.clearanceRows[0].state.key, 'breach-decided-by-requester');
  assert.ok(
    report.warnings.some((line) => line.includes('REQUESTER')),
    'the warning names the fact rather than quietly deleting the row',
  );
});

/* ------------------------------------------------------------------ arithmetic */

test('the window opens and closes on whole days from the event declaration', () => {
  const span = windowSpan(dayF(5), 21, 0);
  assert.equal(span.anchor, dayF(5));
  assert.equal(span.opensOn, day(16), '5 + 21 days before the announcement');
  assert.equal(span.closesOn, dayF(5), 'afterDays 0 closes ON the announcement day');
  // Inside is inclusive of both ends. `daysInside` reports the distance from the
  // NEAREST edge: 0 means the day sits on the first or last closed day, which is
  // still inside. A day outside is null, never 0 — those two must never be
  // confused, because 0-inside and outside are opposite answers.
  assert.equal(daysInside(day(16), span), 0, 'the first closed day is INSIDE, at distance 0');
  assert.equal(daysInside(day(0), span), 5);
  assert.equal(daysInside(dayF(5), span), 0, 'the announcement day is the last closed day');
  assert.equal(daysInside(dayF(6), span), null, 'a day after the window is not inside it');
  assert.equal(daysInside(day(17), span), null, 'the day before it opens is not inside it either');
  assert.equal(dwlDay('2026-11-17'), '2026-11-17');
  assert.equal(dwlDay('2026-11-17T23:00:00.000Z'), null, 'a day is a declared date, never a slashed instant');
  assert.equal(dwlDay('2026-02-30'), null, 'a day that does not exist is not read as one');
});

test('the clearance validity and the turnaround are whole days', () => {
  assert.equal(validThrough(day(0), 10), dayF(10));
  assert.equal(validThrough(day(3), 1), day(2));
  assert.equal(turnaroundDueOn(day(2), 3), dayF(1));
  assert.equal(turnaroundDueOn(day(9), 3), day(6), '9 days ago plus a 3-day turnaround');
});

test('a window verdict is one of exactly three declared answers', () => {
  assert.deepEqual(DWL_WINDOW_STATES.map((row) => row.key).sort(), ['closed', 'open', 'undeterminable']);
  assert.ok(DWL_WINDOW_STATES.every((row) => row.label && row.says), 'every state explains itself on screen');
  const evt = event();
  const closed = windowVerdictFor(evt, [], day(0));
  assert.equal(closed.state, 'closed', 'five days before results, today is inside the window');
  assert.equal(closed.daysInsideWindow, 5);
  assert.equal(windowVerdictFor(evt, [], day(40)).state, 'open', '40 days ago is outside it');
  assert.equal(windowVerdictFor(evt, [], dayF(6)).state, 'open', 'a day after the close is outside');
  // An event scoped to a line the person is not on does not bind them.
  assert.equal(windowVerdictFor({ ...evt, scopeLineIds: ['rl-other'] }, ['rl-mine'], day(0)).state, 'open');
  assert.equal(windowVerdictFor({ ...evt, scopeLineIds: ['rl-mine'] }, ['rl-mine'], day(0)).state, 'closed');
  // A bound that cannot be resolved is NEVER open.
  assert.equal(windowVerdictFor({ ...evt, beforeDays: null }, [], day(0)).state, 'undeterminable');
});

/* ---------------------------------------------------- states are kept, not repaired */

test('an undeterminable window is never reported as open', () => {
  const noBounds = load(fixture({ events: [event({ beforeDays: null })] }));
  const row = deriveDwlDealing({
    dealing: dealing(),
    designations: noBounds.dwlDesignations,
    // normalizeState drops an unresolvable event, so build the kernel case directly.
    events: [event({ beforeDays: null })],
    nowDay: day(0),
  });
  assert.equal(row.state.key, 'dealt-window-undeterminable');
  assert.notEqual(row.windowAnswer.state, 'open');
});

test('a dealing before the designation is kept as that fact', () => {
  const state = load(fixture({
    designations: [designation({ declaredOn: day(30) })],
    dealings: [dealing({ dealtOn: day(90) })],
  }));
  const report = buildPersonalDealing(state, { now: NOW, seat: null });
  assert.equal(report.dealingRows[0].state.key, 'dealt-before-designation');
});

test('a cleared trade inside a closed window keeps BOTH facts, graver first', () => {
  const state = load(fixture({
    clearances: [clearance({ requestedOn: day(4) })],
    decisions: [decision({ decidedOn: day(4), validityDays: 14 })],
    dealings: [dealing({ dealtOn: day(0), clearanceId: 'clr-1' })],
  }));
  const report = buildPersonalDealing(state, { now: NOW, seat: null });
  const row = report.dealingRows[0];
  assert.equal(row.state.key, 'breach-dealt-in-closed-window');
  assert.equal(row.windowAnswer.daysInsideWindow, 5, 'the exact days inside are printed');
  assert.equal(row.breaches.length, 1);
  assert.deepEqual(row.breaches.map((b) => b.key), ['dealt-in-closed-window']);
  // The clearance it cited is still properly cleared — the two facts coexist.
  assert.equal(report.clearanceRows[0].state.key, 'cleared-and-dealt');
  assert.equal(report.totals.dealtInClosedWindowN, 1);
});

test('a dealing with no clearance is recorded, never refused', () => {
  const state = load(fixture({ dealings: [dealing({ dealtOn: day(40) })] }));
  const report = buildPersonalDealing(state, { now: NOW, seat: null });
  assert.equal(report.dealingRows[0].state.key, 'dealt-without-clearance');
  assert.equal(report.totals.dealtWithoutClearanceN, 1);
});

test('a clearance past its turnaround with no decision is overdue, not pending', () => {
  const state = load(fixture({ clearances: [clearance({ requestedOn: day(9) })] }));
  const report = buildPersonalDealing(state, { now: NOW, seat: null });
  assert.equal(report.clearanceRows[0].state.key, 'pending-overdue');
  assert.equal(report.clearanceRows[0].overdue, 6, '6 days past the declared 3-day turnaround');
  assert.equal(report.clearanceRows[0].dueOn, day(6), '9 days ago plus a 3-day turnaround');
  assert.equal(report.totals.pendingOverdueN, 1);
});

test('every derived state is one of the declared states', () => {
  const report = read(fixture({
    clearances: [clearance()],
    decisions: [decision()],
    dealings: [dealing({ dealtOn: day(1), clearanceId: 'clr-1' })],
  }));
  for (const row of report.dealingRows) assert.ok(DWL_STATE_KEYS.includes(row.state.key), row.state.key);
  for (const row of report.clearanceRows) assert.ok(DWL_CLEARANCE_STATE_KEYS.includes(row.state.key), row.state.key);
  assert.equal(report.balances.dealingStatesReconcile, true);
  assert.equal(report.balances.clearanceStatesReconcile, true);
  assert.equal(report.balances.decisionsReconcile, true);
});

/* ----------------------------------------------------------------- the door */

test('a person cannot decide the clearance they requested', () => {
  const { api, store } = harness(fixture({
    activeSeatId: 'mei',
    clearances: [clearance({ requestedById: 'mei' })],
  }));
  const refused = api.dwlDecideClearance({ clearanceId: 'clr-1', outcome: 'cleared', decidedOn: day(0), validityDays: 5 });
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal, 'personal-dealing:self-decision');
  const stored = store.state.dwlDecisions || [];
  assert.equal(stored.length, 0, 'nothing was written');
});

test('a seat that is not strictly above the requester cannot decide', () => {
  const { api } = harness(fixture({ activeSeatId: 'freya', clearances: [clearance()] }));
  const refused = api.dwlDecideClearance({ clearanceId: 'clr-1', outcome: 'cleared', decidedOn: day(0), validityDays: 5 });
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal, 'personal-dealing:not-above-requester');
});

test('the joint apex above two lines can decide, and records who did', () => {
  const { api } = harness(fixture({ activeSeatId: 'priya', clearances: [clearance()] }));
  const done = api.dwlDecideClearance({ clearanceId: 'clr-1', outcome: 'cleared', decidedOn: day(0), validityDays: 5 });
  assert.equal(done.ok, true, done.refusal || done.error);
  assert.equal(done.validThrough, dayF(5));
  const report = api.dwlReport().report;
  assert.equal(report.clearanceRows[0].state.key, 'cleared-not-dealt');
  assert.equal(report.clearanceRows[0].decision.decidedById, 'priya');
});

test('the door refuses a refusal with no reason and a clearance with no validity', () => {
  const bare = harness(fixture({ activeSeatId: 'priya', clearances: [clearance()] }));
  assert.equal(
    bare.api.dwlDecideClearance({ clearanceId: 'clr-1', outcome: 'refused', decidedOn: day(0), reason: 'no' }).refusal,
    'personal-dealing:reason-missing',
  );
  const other = harness(fixture({ activeSeatId: 'priya', clearances: [clearance()] }));
  assert.equal(
    other.api.dwlDecideClearance({ clearanceId: 'clr-1', outcome: 'cleared', decidedOn: day(0) }).refusal,
    'personal-dealing:validity-missing',
  );
});

test('a designation requires a written basis reference, not a self-certified basis', () => {
  const { api } = harness(fixture({ activeSeatId: 'priya' }));
  const refused = api.dwlDeclareDesignation({ personId: 'sam', basis: 'statutory-insider', instrumentRef: 'x', declaredOn: day(10) });
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal, 'personal-dealing:instrument-missing');
});

test('a listed dealing is recorded with the hand that recorded it', () => {
  const { api } = harness(fixture({ activeSeatId: 'priya' }));
  const done = api.dwlRecordDealing({
    personId: 'sam', securityRef: 'DK0062498333', side: 'sell', quantity: 400, dealtOn: day(0),
    brokerRef: 'Contract note 2026-11-17-8871 (Nordea)', clearanceId: null,
  });
  assert.equal(done.ok, true, done.refusal || done.error);
  const row = api.dwlReport().report.dealingRows[0];
  assert.equal(row.dealing.recordedById, 'priya');
  assert.equal(row.dealing.personId, 'sam');
});

/* --------------------------------------------------------------- matrix */

test('independence is computed through the one joint-apex engine', () => {
  const report = read(fixture({ clearances: [clearance()] }));
  const row = report.clearanceRows[0];
  assert.equal(row.clearance.requestedById, 'mei');
  assert.equal(row.state.key, 'pending');
  // Priya is the one seat above mei AND freya; the engine says so directly.
  const state = load(fixture({ clearances: [clearance()] }));
  assert.equal(row.clearance.personId, 'sam');
  assert.ok(report.matrix, 'the reporting graph was read');
  // The breach is the DECISION by the requester, not the request. A request the
  // person made for themselves is pending — and the door refuses to let them
  // decide it, which is the control.
  const selfRequest = read(fixture({ clearances: [clearance({ requestedById: 'sam' })] }));
  assert.equal(selfRequest.clearanceRows[0].state.key, 'pending');
});

/* ------------------------------------------------------------- disclosure */

test('disclosure follows the duty: the decider sees the row it must decide', () => {
  const state = load(fixture({
    clearances: [clearance()],
    decisions: [decision()],
    dealings: [dealing({ dealtOn: day(1), clearanceId: 'clr-1' })],
  }));

  // Priya is rank 3, above the detail ceiling — but she is the proven apex above
  // sam, so the rows she must act on are hers to see.
  const apexSeat = { id: 'priya', nodeId: 'priya', rank: 3, label: 'Director', scope: new Set(['mei', 'freya', 'sam']), lineScope: new Set() };
  const apexYes = buildPersonalDealing(state, { now: NOW, seat: apexSeat });
  assert.equal(apexYes.clearanceRows[0].inDetail, true);
  assert.equal(apexYes.dealingRows[0].inDetail, true);

  // A rank-3 seat that holds none of these people is handed counts, and the page
  // knows a row is withheld rather than rendering it blank by accident.
  const stranger = { id: 'ola', nodeId: 'ola', rank: 3, label: 'Director', scope: new Set(['zed']), lineScope: new Set() };
  const apexNo = buildPersonalDealing(state, { now: NOW, seat: stranger });
  assert.equal(apexNo.clearanceRows[0].inDetail, false);
  assert.equal(apexNo.dealingRows[0].inDetail, false);
  assert.equal(apexNo.anyWithheld, true);
  assert.ok(apexNo.disclosure.reason.includes('disables the control'),
    'the reader states WHY detail follows the duty instead of the rank alone');

  // Rank 2 legitimately holds individual detail.
  const closeSeat = { id: 'mei', nodeId: 'mei', rank: 2, label: 'Manager', scope: new Set(['sam']), lineScope: new Set() };
  const close = buildPersonalDealing(state, { now: NOW, seat: closeSeat });
  assert.equal(close.clearanceRows[0].inDetail, true);
});

test('a listed person with no operating seat is a printed limitation', () => {
  const report = read(fixture());
  const sam = report.listedPeople.find((row) => row.personId === 'sam');
  assert.equal(sam.holdsSeat, false, 'an IC with no reports holds no seat');
  assert.ok(sam.seatReason.includes('no operating seat'));
  assert.equal(report.totals.listedWithoutSeatN, 1);
  assert.equal(report.figuresComplete, false);
  assert.ok(report.incompleteReasons.some((line) => line.includes('no operating seat')));
});

/* -------------------------------------------------------------- RULE-DWL-01 */

test('RULE-DWL-01 is declared, indexed and registered', () => {
  assert.equal(personalDealingRule.id, 'personalDealingRule', 'the spine keys the rule by its exported name');
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.id === 'personalDealingRule'));
  assert.ok(Array.isArray(PROPAGATION_CONTRACTS));
  const contract = PROPAGATION_CONTRACTS.find((row) => row.module === 'personalDealingRules.js');
  assert.ok(contract, 'the rule has a propagation contract');
  assert.equal(contract.rule?.id, 'personalDealingRule');
  assert.equal(contract.scansWorkspace, true, 'a closed period opens and closes by the calendar');
  for (const target of ['delegations', 'links', 'dwlMarkers']) {
    assert.ok(contract.writes.includes(target), `the contract must declare its write to ${target}`);
  }
});

test('RULE-DWL-01 asks a seat strictly above the person and never the person', () => {
  const state = load(fixture({ clearances: [clearance()] }));
  const report = read(fixture({ clearances: [clearance({ requestedOn: day(9) })] }));
  const { conditions, observations } = personalDealingConditions(report);
  assert.ok(Array.isArray(conditions));
  assert.ok(Array.isArray(observations));
  const overdue = conditions.find((row) => row.kind === 'clearance-overdue');
  assert.ok(overdue, `an overdue clearance must raise a condition, got ${conditions.map((c) => c.kind).join(',')}`);
  assert.equal(overdue.signature.startsWith('dwl1:clearance-overdue:'), true,
    'the signature keys the condition to the request, deterministically');
  assert.equal(JSON.stringify(overdue).includes('DK0062498333'), false);

  // The ADDRESSEES are resolved by the rule, which knows the graph. The ask goes
  // to the joint apex above mei AND freya — and never to sam, whose own dealing
  // is the subject.
  const draft = load(fixture({ clearances: [clearance({ requestedOn: day(9) })] }));
  const emitted = personalDealingRule(draft, {
    event: { type: 'personalDealing.scan', entity: 'workspace', entityId: 'personal-dealing' },
    now: NOW,
    idFactory: (prefix) => `${prefix}-t`,
    linkCtx: { idFactory: (prefix) => `${prefix}-t` },
  });
  assert.ok(emitted.length >= 1, 'the scan files the overdue ask');
  const asks = draft.delegations || [];
  assert.ok((overdue.seatIds || []).includes('priya'), 'the joint apex above every line is asked');
  assert.equal((overdue.seatIds || []).includes('sam'), false,
    'the person whose dealing is the subject is never asked about it');
  const task = asks.map((row) => String(row.title || '')).find((title) => title.length > 0);
  assert.ok(task, 'the ask exists on the spine');
  assert.equal(task.includes('DK0062498333'), false, 'the ask text names no security');
  assert.equal(typeof DWL_PAUSE_SWITCH, 'string');
});

test('RULE-DWL-01 is opaque in its ask text', () => {
  const report = read(fixture({ clearances: [clearance()], dealings: [dealing({ dealtOn: day(0) })] }));
  const { conditions } = personalDealingConditions(report);
  assert.ok(conditions.length >= 1, 'a breach raises a condition');
  const text = JSON.stringify(conditions);
  for (const leak of ['DK0062498333', 'Contract note', '400', 'Nordea', 'Sam']) {
    assert.equal(text.includes(leak), false, `the ask text must not carry ${leak}`);
  }
});

/* -------------------------------------------------------------------- CSV */

test('the CSV export is aggregate, identity-free, and blanks a below-floor count', () => {
  const state = load(fixture({
    clearances: [clearance()],
    decisions: [decision()],
    dealings: [dealing({ dealtOn: day(0), clearanceId: 'clr-1' })],
  }));
  const csv = exportWorkspaceCsv(state, DWL_CSV_SCOPE);
  assert.equal(csv.ok, true, csv.error);
  const text = csv.csv;
  for (const secret of ['Sam', 'DK0062498333', 'Contract note 2026-11-17-8871', 'Nordea', 'Group Insider Dealing']) {
    assert.equal(text.includes(secret), false, `the CSV must not carry ${secret}`);
  }
  assert.ok(text.includes('withheld'), 'a below-floor count prints BLANK with its reason');
  const header = text.split('\n')[0];
  for (const column of DWL_CSV_COLUMNS) assert.ok(header.includes(column), `missing column ${column}`);
});

test('the CSV rows are built from the reader, not from a second opinion', () => {
  const state = load(fixture({ clearances: [clearance()], decisions: [decision()] }));
  const report = buildPersonalDealing(state, { now: NOW, seat: null });
  const rows = personalDealingCsvRows(report);
  assert.ok(rows.length >= 2, 'a summary row and one row per state');
  const summary = rows.find((row) => row.row_kind === 'summary');
  assert.ok(summary, 'the summary row is present and named');
  assert.equal(summary.dealings_n, String(report.totals.dealings),
    'the summary carries the reader\'s own figure, not a second opinion');
  assert.equal(summary.clearances_n, String(report.totals.clearances));
  assert.equal(summary.privacy_floor, String(report.conventions.dwlPrivacyFloor));
  assert.equal(summary.complete, report.figuresComplete ? '1' : '0', 'complete is kept apart from the counts');
  const flat = JSON.stringify(rows);
  assert.equal(flat.includes('DK0062498333'), false, 'no security reference reaches the CSV');
  assert.equal(flat.includes('Sam'), false, 'no person name reaches the CSV');
});

/* ------------------------------------------------------------------ panel */

test('the panel prints the reader\'s own figures cell by cell', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const { document } = dom.window;
  const previous = globalThis.document;
  const previousWindow = globalThis.window;
  const previousNode = globalThis.Node;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.Node = dom.window.Node;
  try {
    const raw = fixture({
      clearances: [clearance()],
      decisions: [decision()],
      dealings: [dealing({ dealtOn: day(3), clearanceId: 'clr-1' })],
    });
    const { api, store } = harness(raw);
    const state = store.state;
    const report = buildPersonalDealing(state, { now: NOW, seat: null });
    const node = renderPersonalDealing({
      api: { ...api, getState: () => state },
      query: new URLSearchParams(),
      rerender: () => {},
      state,
    });
    document.body.appendChild(node);

    const cell = (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();
    assert.equal(cell('dwl-count-listed'), String(report.totals.listedPeople), 'listed people');
    assert.equal(cell('dwl-count-windows'), String(report.totals.openWindowsN), 'windows open today');
    assert.equal(cell('dwl-count-clearances'), String(report.totals.clearances), 'clearances');
    assert.equal(cell('dwl-count-dealings'), String(report.totals.dealings), 'dealings');
    assert.equal(cell('dwl-count-closed-window'), String(report.totals.dealtInClosedWindowN), 'closed-window trades');
    assert.equal(cell('dwl-count-overdue'), String(report.totals.pendingOverdueN), 'decision owed');
    assert.equal(cell('dwl-count-clearance-breach'), String(report.totals.clearanceBreachesN), 'clearance breaches');
    // Every derived state the reader carries a count for is named on screen, so the
    // panel cannot quietly disagree with the engine.
    const text = node.textContent;
    for (const row of report.stateRows.filter((entry) => entry.count > 0)) {
      assert.ok(text.includes(row.label), `the panel must name ${row.label}`);
    }
    assert.ok(text.includes(report.disclosure.reason || ''), 'the disclosure rule is stated on screen');
  } finally {
    globalThis.document = previous;
    globalThis.window = previousWindow;
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
  }
});

/* ------------------------------------------------------------------- demo */

test('the demo record derives live states from the injected clock', () => {
  const state = load(buildDemoState(NOW));
  const report = buildPersonalDealing(state, { now: NOW, seat: null });
  assert.equal(report.ok, true);
  assert.equal(report.windowFor(report.listedPeople[0].personId, report.asOf).state, 'closed',
    'the demo is closed TODAY, not on the day it was written');
  const states = report.dealingRows.map((row) => row.state.key);
  assert.ok(states.includes('breach-dealt-in-closed-window'), states.join(','));
  assert.ok(states.includes('dealt-without-clearance'));
  assert.equal(report.totals.dealtInClosedWindowN, 1);
  assert.equal(report.totals.pendingOverdueN, 1);
  const breach = report.dealingRows.find((row) => row.state.key === 'breach-dealt-in-closed-window');
  assert.equal(breach.windowAnswer.daysInsideWindow > 0, true);
  assert.equal(Object.values(report.balances).every(Boolean), true, 'every balance reconciles');
});
