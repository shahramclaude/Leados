// ADR-0242 — Lone-Working Welfare Check Register (Schema v196).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — four empty ledgers and three declared
//      conventions, and no deployment inferred from a shift, a rota, a station
//      roster, a functional `lone-work` restriction or an existing incident;
//   2. the loaders are FAIL-CLOSED — a deployment with no written protocol, a
//      fractional interval, a half-closed deployment, a contact before the start
//      and a doubled contact are DROPPED with counted warnings and never repaired;
//   3. the arithmetic is EXACT — whole minutes past the declared deadline and the
//      declared end, computed from the LAST CONTACT, floored, and never rounded
//      into a reassurance;
//   4. the TEN STATES are ten different facts — contact, a concern nobody
//      answered, an escalation, silence, a late confirmation, a passed end and a
//      close with no contact are never folded into each other;
//   5. a CLOSED deployment is read at its close, not at this minute;
//   6. the MATRIX is correct — the ask goes to the joint apex above EVERY line
//      holding the person, never to the person, and a person is counted once;
//   7. RULE-LWK-01 is idempotent, capped, self-closing, pause-governed on every
//      path, opaque in its ask text, and observes identity-free where nobody can
//      be asked;
//   8. the door refuses self-declaration, an overlapping deployment, a fractional
//      interval, a future contact, a backwards contact, a self-escalation, an
//      escalation with nothing to answer, and a second close-out;
//   9. the CSV boundary is aggregate, identity-free and floored, and its summary
//      equals the reader's own totals;
//  10. the panel prints the reader's own figures cell by cell (display == computed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildMatrix } from '../../app/core/domain/matrix.js';
import { buildLoneWorking } from '../../app/core/domain/loneWorking.js';
import {
  normalizeLwkDeployments,
  normalizeLwkCheckins,
  normalizeLwkEscalations,
  normalizeLwkSettings,
  lwkInstant,
  lwkInterval,
  lwkGrace,
} from '../../app/core/domain/loneWorkingSchema.js';
import {
  deadlineMs,
  graceDeadlineMs,
  latenessMinutes,
  overrunMinutes,
  overlapMinutes,
  declaredSpanMinutes,
  instantMs,
} from '../../app/core/domain/loneWorkingMath.js';
import {
  loneWorkingRule,
  loneWorkingConditions,
  indexLoneWorkingAsks,
  lwkAskSignature,
} from '../../app/core/domain/loneWorkingRules.js';
import {
  LWK_CSV_COLUMNS,
  LWK_CSV_SCOPE,
  LWK_SETTING_KEYS,
  LWK_STATE_BY_KEY,
} from '../../app/core/domain/loneWorkingRegistry.js';
import { loneWorkingCsvRows } from '../../app/core/domain/loneWorkingReport.js';
import { renderLoneWorking } from '../../app/views/loneWorking.js';

const NOW = new Date('2026-11-17T09:00:00.000Z');
const T0 = NOW.toISOString();
const iso = (value) => new Date(value).toISOString();

const person = (id, managerId) => ({
  id, name: id[0].toUpperCase() + id.slice(1), managerId, role: 'Operator',
  status: 'active', startDate: '2026-01-01T09:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:00:00.000Z',
});

/**
 * priya → mei → sam, and freya → sam on a declared PROJECT line. Sam therefore
 * holds TWO active reporting lines: the case in which the line that sent somebody
 * out is not the line that answers for them.
 */
function fixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.people = [person('priya', null), person('mei', 'priya'), person('sam', 'mei'), person('freya', 'priya')];
  raw.reportingLines = [{
    id: 'rl-sam-freya', personId: 'sam', managerId: 'freya', kind: 'project', shareH: 30,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  if (overrides.activeSeatId) {
    raw.settings = { ...raw.settings, activeSeatId: overrides.activeSeatId };
  }
  raw.lwkDeployments = overrides.deployments || [deployment()];
  raw.lwkCheckins = overrides.checkins || [];
  raw.lwkEscalations = overrides.escalations || [];
  raw.lwkMarkers = overrides.markers || [];
  return raw;
}

/** A loader-valid deployment for sam: 05:00 → 13:00, hourly, ten minutes grace. */
function deployment(overrides = {}) {
  return {
    id: 'dep-1',
    personId: 'sam',
    lineManagerId: 'mei',
    siteRef: 'Substation 4 — Bay 2',
    task: 'Relay calibration with the isolation locked off',
    protocolRef: 'LWA-2026-114 rev 2 — substation isolation',
    intervalMinutes: 60,
    graceMinutes: 10,
    startAt: iso('2026-11-17T05:00:00.000Z'),
    expectedEndAt: iso('2026-11-17T13:00:00.000Z'),
    declaredById: 'mei',
    closedAt: null,
    closeOutcome: null,
    closedById: null,
    closeNote: '',
    createdAt: iso('2026-11-17T04:55:00.000Z'),
    updatedAt: iso('2026-11-17T04:55:00.000Z'),
    ...overrides,
  };
}

const contact = (id, at, overrides = {}) => ({
  id, deploymentId: 'dep-1', at: iso(at), channel: 'radio', outcome: 'ok', recordedById: 'mei', note: '', createdAt: iso(at), ...overrides,
});

/** Last contact 07:00 → due 08:00, grace to 08:10 → 50 whole minutes late at 09:00. */
const LATE_CONTACT = contact('c-1', '2026-11-17T07:00:00.000Z');

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildLoneWorking(load(raw), { now: NOW, seat: null, ...opts });

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

test('schema v196 is additive: four empty ledgers, three conventions, nothing inferred', () => {
  const empty = createEmptyState(T0);
  assert.equal(SCHEMA_VERSION, 197);
  for (const key of ['lwkDeployments', 'lwkCheckins', 'lwkEscalations', 'lwkMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
    assert.deepEqual(empty[key], [], `${key} starts empty`);
  }
  const loaded = normalizeState(createEmptyState(T0), { now: NOW }).state;
  assert.equal(loaded.settings[LWK_SETTING_KEYS.autoPropagate], true);
  assert.equal(loaded.settings[LWK_SETTING_KEYS.privacyFloor], 3);
  assert.equal(loaded.settings[LWK_SETTING_KEYS.horizonDays], 30);

  const previous = { ...createEmptyState(T0), schemaVersion: 195 };
  delete previous.lwkDeployments; delete previous.lwkCheckins;
  delete previous.lwkEscalations; delete previous.lwkMarkers;
  const { raw, applied } = migrate(previous);
  assert.deepEqual(applied, ['195 → 196', '196 → 197'], 'ADR-0242’s own step still runs first, in order');
  assert.equal(raw.schemaVersion, 197);
  // NOTHING IS INFERRED. A workspace with shifts, stations or a `lone-work`
  // restriction on file does not thereby have a person monitored for welfare.
  for (const key of ['lwkDeployments', 'lwkCheckins', 'lwkEscalations', 'lwkMarkers']) {
    assert.deepEqual(raw[key], []);
  }
});

test('the demo seeds live states relative to the injected clock, and the reader derives them', () => {
  const state = buildDemoState(NOW);
  const report = buildLoneWorking(state, { now: NOW, settings: state.settings, seat: null });
  assert.ok(report.totals.deployments >= 5);
  assert.equal(report.states['welfare-unconfirmed'], 1, 'one welfare check is genuinely unconfirmed');
  assert.equal(report.states['concern-unanswered'], 1, 'one concern nobody answered');
  assert.equal(report.states.overran, 1, 'one deployment past its declared end');
  assert.equal(report.states['closed-without-contact'], 1, 'one close-out with no contact ever recorded');
  assert.equal(report.totals.unconfirmedMinutes, 25, 'the demo’s lateness is exactly 25 whole minutes');
  assert.equal(report.totals.overrunMinutes, 30, 'the demo’s overrun is exactly 30 whole minutes');
  assert.equal(report.balances.statesReconcile, true);
});

/* -------------------------------------------------------------- 2. loaders */

test('loaders are fail-closed: no protocol, a fractional interval and a half-closed row are dropped', () => {
  const warnings = [];
  const base = deployment();
  const rows = normalizeLwkDeployments([
    { ...base, id: 'a', protocolRef: '' },
    { ...base, id: 'b', intervalMinutes: 60.5 },
    { ...base, id: 'c', intervalMinutes: 2 },
    { ...base, id: 'd', graceMinutes: 999 },
    { ...base, id: 'e', expectedEndAt: base.startAt },
    { ...base, id: 'f', closedAt: iso('2026-11-17T10:00:00.000Z') },
    { ...base, id: 'g', closedAt: iso('2026-11-17T10:00:00.000Z'), closeOutcome: 'returned', closedById: 'mei' },
  ], warnings);
  assert.deepEqual(rows.map((row) => row.id), ['g'], 'only the complete, readable row survives');
  assert.match(warnings.join(' '), /could not be read exactly/);
});

test('a contact before the deployment started, a doubled contact and an orphan escalation are dropped', () => {
  const deployments = normalizeLwkDeployments([deployment()], []);
  const warnings = [];
  const rows = normalizeLwkCheckins([
    contact('c-early', '2026-11-17T04:00:00.000Z'),
    contact('c-1', '2026-11-17T07:00:00.000Z'),
    contact('c-2', '2026-11-17T07:00:00.000Z'),
    contact('c-orphan', '2026-11-17T08:00:00.000Z', { deploymentId: 'nope' }),
  ], deployments, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['c-1'], 'one contact before the start, one doubled instant and one orphan are refused');
  assert.match(warnings.join(' '), /contact row\(s\) could not be read exactly/);

  const escalations = normalizeLwkEscalations([
    { id: 'e-1', deploymentId: 'dep-1', raisedAt: iso('2026-11-17T04:30:00.000Z'), raisedById: 'mei', basis: 'check-overdue', outcome: 'attempted', detail: 'Rang twice on the site radio and the mobile; no answer from either.' },
    { id: 'e-2', deploymentId: 'dep-1', raisedAt: iso('2026-11-17T08:30:00.000Z'), raisedById: 'mei', basis: 'check-overdue', outcome: 'attempted', detail: 'Rang twice on the site radio and the mobile; no answer from either.' },
  ], deployments, []);
  assert.deepEqual(escalations.map((row) => row.id), ['e-2'], 'an escalation cannot precede the deployment it answers');
});

test('the interval and grace are read exactly and never rounded', () => {
  assert.equal(lwkInterval(60), 60);
  assert.equal(lwkInterval(5), 5);
  assert.equal(lwkInterval(4), null);
  assert.equal(lwkInterval(60.5), null, 'a fractional minute is not a minute');
  assert.equal(lwkInterval('60'), null, 'a string is not a declared number');
  assert.equal(lwkGrace(0), 0, 'zero grace is a legitimate declaration');
  assert.equal(lwkGrace(-1), null);
  assert.equal(lwkInstant('not an instant'), null);
  assert.equal(lwkInstant('2026-11-17T07:00:00.000Z'), '2026-11-17T07:00:00.000Z');
});

/* ----------------------------------------------------------- 3. arithmetic */

test('the deadline and the grace deadline are exact whole minutes from the last contact', () => {
  const last = instantMs('2026-11-17T07:00:00.000Z');
  assert.equal(iso(deadlineMs(last, 60)), iso('2026-11-17T08:00:00.000Z'));
  assert.equal(iso(graceDeadlineMs(last, 60, 10)), iso('2026-11-17T08:10:00.000Z'));
  assert.equal(latenessMinutes(instantMs('2026-11-17T08:10:00.000Z'), graceDeadlineMs(last, 60, 10)), 0, 'at the grace instant it is not yet late');
  assert.equal(latenessMinutes(instantMs('2026-11-17T08:10:59.000Z'), graceDeadlineMs(last, 60, 10)), 0, 'fifty-nine seconds is not a minute');
  assert.equal(latenessMinutes(instantMs('2026-11-17T09:00:00.000Z'), graceDeadlineMs(last, 60, 10)), 50);
  assert.equal(overrunMinutes(instantMs('2026-11-17T13:30:30.000Z'), instantMs('2026-11-17T13:00:00.000Z')), 30);
  assert.equal(overrunMinutes(instantMs('2026-11-17T12:00:00.000Z'), instantMs('2026-11-17T13:00:00.000Z')), 0);
});

test('the overlap kernel is exact and the declared span refuses an empty or reversed one', () => {
  const a = { start: instantMs('2026-11-17T08:00:00.000Z'), end: instantMs('2026-11-17T12:00:00.000Z') };
  const b = { start: instantMs('2026-11-17T11:30:00.000Z'), end: instantMs('2026-11-17T14:00:00.000Z') };
  assert.equal(overlapMinutes(a.start, a.end, b.start, b.end), 30);
  assert.equal(overlapMinutes(a.start, a.end, a.end, a.end + 60_000), 0, 'an abutting span does not overlap');
  assert.equal(declaredSpanMinutes(a.start, a.end), 240);
  assert.equal(declaredSpanMinutes(a.start, a.start), null);
  assert.equal(declaredSpanMinutes(a.end, a.start), null);
});

/* ---------------------------------------------------------------- 4. states */

test('silence past the declared grace is `welfare-unconfirmed`, never “missing”', () => {
  const report = read(fixture({ checkins: [LATE_CONTACT] }));
  const row = report.rows[0];
  assert.equal(row.state.key, 'welfare-unconfirmed');
  assert.equal(row.latenessMinutes, 50, 'fifty whole minutes past the declared deadline');
  assert.equal(row.escalationsN, 0);
  assert.equal(report.totals.unconfirmedN, 1);
  assert.match(LWK_STATE_BY_KEY['welfare-unconfirmed'].says, /does not know where this person is/i);
});

test('contact inside the interval is `checked-in` and contact inside the grace is `check-due`', () => {
  const fresh = read(fixture({ checkins: [contact('c-1', '2026-11-17T08:30:00.000Z')] }));
  assert.equal(fresh.rows[0].state.key, 'checked-in');
  assert.equal(fresh.rows[0].latenessMinutes, 0);

  // Declared to start at 08:30 with no contact yet: the first deadline is 09:30,
  // so at 09:00 nothing is owed and the register says exactly that.
  const notDue = read(fixture({ deployments: [deployment({ startAt: iso('2026-11-17T08:30:00.000Z') })], checkins: [] }));
  assert.equal(notDue.rows[0].state.key, 'not-yet-due');
  assert.equal(notDue.rows[0].minutesSinceContact, 30);

  // Last contact 07:55 → due 08:55, grace to 09:05: inside the grace at 09:00.
  const due = read(fixture({ checkins: [contact('c-1', '2026-11-17T07:55:00.000Z')] }));
  assert.equal(due.rows[0].state.key, 'check-due');
  assert.equal(due.rows[0].latenessMinutes, 0, 'inside the grace is not late');
});

test('a concern at the last contact is `concern-unanswered` even though the clock reset', () => {
  const report = read(fixture({ checkins: [contact('c-1', '2026-11-17T08:40:00.000Z', { outcome: 'concern' })] }));
  const row = report.rows[0];
  assert.equal(row.state.key, 'concern-unanswered');
  assert.equal(row.latenessMinutes, 0, 'contact reset the clock, correctly');
  assert.equal(row.concernOpen, true);

  // An escalation recorded AFTER the concern answers it; one recorded before does not.
  const answered = read(fixture({
    checkins: [contact('c-1', '2026-11-17T08:40:00.000Z', { outcome: 'concern' })],
    escalations: [{
      id: 'e-1', deploymentId: 'dep-1', raisedAt: iso('2026-11-17T08:45:00.000Z'), raisedById: 'mei',
      basis: 'concern-follow-up', outcome: 'contact-made',
      detail: 'Rang him back on the site radio; he was moved to the office and the tank room was ventilated.', createdAt: iso('2026-11-17T08:45:00.000Z'),
    }],
  }));
  assert.equal(answered.rows[0].state.key, 'checked-in', 'the concern was answered and the clock is current');
  assert.equal(answered.rows[0].concernOpen, false);
});

test('an escalation with no confirmation is `escalation-open`; a confirmation makes it `welfare-confirmed-late` and keeps the minutes', () => {
  const base = {
    checkins: [LATE_CONTACT],
    escalations: [{
      id: 'e-1', deploymentId: 'dep-1', raisedAt: iso('2026-11-17T08:20:00.000Z'), raisedById: 'mei',
      basis: 'check-overdue', outcome: 'attempted',
      detail: 'Rang the site radio twice and the mobile once; no answer from either.', createdAt: iso('2026-11-17T08:20:00.000Z'),
    }],
  };
  const open = read(fixture(base));
  assert.equal(open.rows[0].state.key, 'escalation-open');
  assert.equal(open.rows[0].latenessMinutes, 50);

  const confirmed = read(fixture({
    ...base,
    escalations: [...base.escalations, {
      id: 'e-2', deploymentId: 'dep-1', raisedAt: iso('2026-11-17T08:50:00.000Z'), raisedById: 'mei',
      basis: 'welfare-doubt', outcome: 'welfare-confirmed',
      detail: 'Drove out and found him in the bay; safe, and the radio battery was flat.', createdAt: iso('2026-11-17T08:50:00.000Z'),
    }],
  }));
  assert.equal(confirmed.rows[0].state.key, 'welfare-confirmed-late');
  assert.equal(confirmed.rows[0].latenessMinutes, 50, 'confirmation never un-lates the minutes');
  assert.equal(confirmed.totals.unconfirmedMinutes, 50);
});

test('a deployment past its declared end with no close-out is `overran`, with exact minutes', () => {
  const report = read(fixture({
    deployments: [deployment({ expectedEndAt: iso('2026-11-17T08:30:00.000Z') })],
    checkins: [contact('c-1', '2026-11-17T08:50:00.000Z')],
  }));
  const row = report.rows[0];
  assert.equal(row.state.key, 'overran');
  assert.equal(row.overrunMinutes, 30);
  assert.equal(report.totals.overrunMinutes, 30);
});

test('a closed deployment is read AT ITS CLOSE, and a close with no contact is its own state', () => {
  const clean = read(fixture({
    deployments: [deployment({ closedAt: iso('2026-11-17T12:00:00.000Z'), closeOutcome: 'returned', closedById: 'mei', closeNote: 'Came back in and signed the log at the gate.' })],
    checkins: [contact('c-1', '2026-11-17T11:55:00.000Z')],
  }));
  assert.equal(clean.rows[0].state.key, 'closed-out');
  assert.equal(clean.rows[0].latenessMinutes, 0, 'the last contact was five minutes before the close, inside the interval');

  const silent = read(fixture({
    deployments: [deployment({
      expectedEndAt: iso('2026-11-17T08:00:00.000Z'),
      closedAt: iso('2026-11-17T12:00:00.000Z'), closeOutcome: 'returned', closedById: 'sam', closeNote: 'Signed out at the gate himself; no radio check was ever recorded.',
    })],
  }));
  assert.equal(silent.rows[0].state.key, 'closed-without-contact');
  assert.equal(silent.rows[0].closeOverrunMinutes, 240, 'four hours past its declared end when it was eventually closed');
  assert.equal(silent.rows[0].selfClosed, true, 'a close by the deployed person is printed as exactly that');
  assert.equal(silent.rows[0].latenessMinutes, 350, 'and the lateness it carried at the close is frozen there, not grown to now');
});

/* ---------------------------------------------------------------- 5. matrix */

test('the ask goes to the JOINT APEX above every line holding the person, and never to the person', () => {
  const raw = fixture({ checkins: [LATE_CONTACT] });
  const state = load(raw);
  const report = buildLoneWorking(state, { now: NOW, seat: null });
  const row = report.rows[0];
  assert.equal(row.lines.length, 2, 'both active lines are resolved');
  assert.deepEqual(row.lines.map((line) => line.managerId).sort(), ['freya', 'mei']);

  const { conditions } = loneWorkingConditions(report);
  const unconfirmed = conditions.filter((condition) => condition.kind === 'welfare-unconfirmed');
  assert.equal(unconfirmed.length, 1);
  // mei and freya are siblings under priya, so the joint apex is priya.
  assert.deepEqual(unconfirmed[0].seatIds, ['priya']);
  assert.ok(!unconfirmed[0].seatIds.includes('sam'), 'never to the deployed person');
  assert.equal(report.totals.people, 1, 'the person is counted once across two lines');
  assert.equal(report.lineRows.length, 2, 'and appears on both line positions');
});

test('a person under two branches asks a seat above BOTH, computed from the graph', () => {
  const raw = createEmptyState(T0);
  raw.people = [person('root', null), person('ann', 'root'), person('bo', 'root'), person('cy', 'ann'), person('dee', 'bo'), person('sam', 'cy')];
  raw.reportingLines = [{
    id: 'rl-2', personId: 'sam', managerId: 'dee', kind: 'project', shareH: 40,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  raw.lwkDeployments = [deployment()];
  raw.lwkCheckins = [LATE_CONTACT];
  const state = load(raw);
  const report = buildLoneWorking(state, { now: NOW, seat: null });
  assert.equal(report.rows[0].lines.length, 2);
  const { conditions } = loneWorkingConditions(report);
  const seatIds = conditions.filter((row) => row.kind === 'welfare-unconfirmed').flatMap((row) => row.seatIds);
  assert.ok(seatIds.length >= 1, 'somebody is asked');
  // ann and bo sit in different branches, so the lowest seat above BOTH is their
  // own manager — computed from the graph, not chosen by the register.
  assert.deepEqual(seatIds, ['root']);
  assert.ok(!seatIds.includes('sam'));
});

test('a deployment naming a person who is not on the graph is OBSERVED, never asked', () => {
  const raw = fixture({ checkins: [LATE_CONTACT] });
  raw.lwkDeployments = [deployment({ personId: 'ghost' })];
  const state = load(raw);
  const report = buildLoneWorking(state, { now: NOW, seat: null });
  assert.equal(report.orphanN, 1);
  assert.equal(report.figuresComplete, false, 'an orphan is a provenance gap and is printed as one');
  const { conditions, observations } = loneWorkingConditions(report);
  assert.equal(conditions.filter((row) => row.kind === 'welfare-unconfirmed').length, 0, 'nobody is asked');
  assert.equal(observations.length, 1);
  assert.match(observations[0].detail, /no active reporting line/);
});

/* ------------------------------------------------------- 6. RULE-LWK-01 */

test('RULE-LWK-01 files ONE ask per obligation and is idempotent across passes', () => {
  const raw = fixture({ checkins: [LATE_CONTACT] });
  const draft = load(raw);
  const idFactory = (prefix) => `${prefix}-r-${Math.random().toString(36).slice(2, 8)}`;
  const ctx = { event: { type: 'loneWorking.checkIn.recorded' }, now: NOW, idFactory, linkCtx: { idFactory } };
  const first = loneWorkingRule(draft, ctx);
  const asks = indexLoneWorkingAsks(draft);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].signature, lwkAskSignature('welfare-unconfirmed', 'dep-1'));
  assert.equal(asks[0].seatId, 'priya');
  assert.ok(first.some((effect) => effect.action === 'delegated'));

  const before = draft.delegations.length;
  loneWorkingRule(draft, { ...ctx, event: { type: 'loneWorking.deployment.closed' } });
  assert.equal(indexLoneWorkingAsks(draft).length, 1, 'a second pass files nothing new');
  assert.equal(draft.delegations.length, before);
});

test('RULE-LWK-01 closes its own ask when the condition clears, and never closes a human answer', () => {
  const raw = fixture({ checkins: [LATE_CONTACT] });
  const draft = load(raw);
  const idFactory = (prefix) => `${prefix}-r-${Math.random().toString(36).slice(2, 8)}`;
  const ctx = { event: { type: 'loneWorking.checkIn.recorded' }, now: NOW, idFactory, linkCtx: { idFactory } };
  loneWorkingRule(draft, ctx);
  assert.equal(indexLoneWorkingAsks(draft).filter((ask) => ask.task?.status === 'active').length, 1);

  // A fresh contact clears the condition; the rule closes its own ask and says so.
  draft.lwkCheckins.push({
    id: 'c-clear', deploymentId: 'dep-1', at: iso('2026-11-17T08:55:00.000Z'), channel: 'radio',
    outcome: 'ok', recordedById: 'mei', note: '', createdAt: iso('2026-11-17T08:55:00.000Z'),
  });
  loneWorkingRule(draft, { ...ctx, event: { type: 'loneWorking.checkIn.recorded' } });
  const ask = indexLoneWorkingAsks(draft)[0];
  assert.equal(ask.task.status, 'done');
  assert.match(ask.task.completionNote, /^RULE-LWK-01/);

  // A human closing the ask is an ANSWER: the rule must not re-file it.
  const human = load(fixture({ checkins: [LATE_CONTACT] }));
  loneWorkingRule(human, ctx);
  const humanAsk = indexLoneWorkingAsks(human)[0];
  human.delegations.find((row) => row.id === humanAsk.task.id).status = 'done';
  human.delegations.find((row) => row.id === humanAsk.task.id).completionNote = 'Called the site; he is fine.';
  loneWorkingRule(human, { ...ctx, event: { type: 'loneWorking.deployment.declared' } });
  assert.equal(indexLoneWorkingAsks(human).length, 1, 'the rule does not nag somebody who has answered');
});

test('RULE-LWK-01 is pause-governed on every path, and its ask text names nobody', () => {
  const raw = fixture({ checkins: [LATE_CONTACT] });
  const draft = load(raw);
  draft.settings = { ...draft.settings, [LWK_SETTING_KEYS.autoPropagate]: false };
  const sole = (p) => `${p}-p`;
  const effects = loneWorkingRule(draft, { event: { type: 'loneWorking.checkIn.recorded' }, now: NOW, idFactory: sole, linkCtx: { idFactory: sole } });
  assert.deepEqual(effects, []);
  assert.equal(indexLoneWorkingAsks(draft).length, 0);

  const unpaused = load(raw);
  const only = (p) => `${p}-q`;
  loneWorkingRule(unpaused, { event: { type: 'loneWorking.checkIn.recorded' }, now: NOW, idFactory: only, linkCtx: { idFactory: only } });
  const task = unpaused.delegations[0];
  for (const forbidden of ['Sam', 'sam', 'Substation', 'relay', '50', 'dep-1']) {
    assert.ok(!`${task.title} ${task.expectedOutcome} ${task.support}`.includes(forbidden),
      `the ask text must not contain “${forbidden}” — a delegation is readable above the addressee`);
  }
});

test('RULE-LWK-01 observes identity-free where no seat can be asked, and caps at four asks per commit', () => {
  // A deployment naming somebody who is not on the reporting graph at all: the
  // matrix has no node for them, so no line and no seat can be resolved.
  const lonely = createEmptyState(T0);
  lonely.people = [person('sam', null)];
  lonely.lwkDeployments = [deployment({ personId: 'ghost' })];
  lonely.lwkCheckins = [LATE_CONTACT];
  const lonelyDraft = load(lonely);
  const lonelyFactory = (p) => `${p}-o`;
  loneWorkingRule(lonelyDraft, { event: { type: 'loneWorking.checkIn.recorded' }, now: NOW, idFactory: lonelyFactory, linkCtx: { idFactory: lonelyFactory } });
  assert.equal(lonelyDraft.delegations.length, 0, 'nobody was asked');
  assert.equal(lonelyDraft.lwkMarkers.length, 1);
  assert.match(lonelyDraft.lwkMarkers[0].detail, /no active reporting line/);

  // Six deployments, six obligations, one commit: four asks, two deferred.
  const many = fixture({ checkins: [] });
  many.lwkDeployments = Array.from({ length: 6 }, (_, index) => deployment({
    id: `dep-${index + 1}`,
    personId: 'sam',
    startAt: iso(`2026-11-17T0${index}:00:00.000Z`),
    expectedEndAt: iso('2026-11-17T13:00:00.000Z'),
  }));
  many.lwkCheckins = Array.from({ length: 6 }, (_, index) => contact(`c-${index}`, `2026-11-17T0${index}:30:00.000Z`, { deploymentId: `dep-${index + 1}` }));
  const manyDraft = load(many);
  const manyFactory = (p) => `${p}-m-${Math.random().toString(36).slice(2, 7)}`;
  const effects = loneWorkingRule(manyDraft, { event: { type: 'loneWorking.checkIn.recorded' }, now: NOW, idFactory: manyFactory, linkCtx: { idFactory: manyFactory } });
  assert.equal(indexLoneWorkingAsks(manyDraft).length, 4, 'capped at four');
  assert.ok(effects.some((effect) => effect.action === 'deferred'), 'the remainder is counted, not silently dropped');
});

/* ------------------------------------------------------------------ 7. door */

test('the door refuses an unsourced deployment, a fractional interval and a reversed span', () => {
  const { api } = harness(fixture({ deployments: [] }));
  const base = {
    personId: 'sam', siteRef: 'Substation 4 — Bay 2', task: 'Relay calibration',
    protocolRef: 'LWA-2026-114 rev 2 — substation isolation', intervalMinutes: 60, graceMinutes: 10,
    startAt: '2026-11-17T05:00', expectedEndAt: '2026-11-17T13:00',
  };
  const unsourced = api.loneWorkingDeclareDeployment({ ...base, protocolRef: 'short' });
  assert.equal(unsourced.ok, false);
  assert.equal(unsourced.field, 'protocolRef');

  const fraction = api.loneWorkingDeclareDeployment({ ...base, intervalMinutes: 30.5 });
  assert.equal(fraction.ok, false);
  assert.equal(fraction.field, 'intervalMinutes');

  const reversed = api.loneWorkingDeclareDeployment({ ...base, expectedEndAt: '2026-11-17T04:00' });
  assert.equal(reversed.ok, false);
  assert.equal(reversed.field, 'expectedEndAt');

  const ok = api.loneWorkingDeclareDeployment(base);
  assert.equal(ok.ok, true, ok.error);
});

test('the door refuses an OVERLAPPING deployment and prints the exact overlap, and nobody declares themselves alone', () => {
  const { api } = harness(fixture());
  const overlap = api.loneWorkingDeclareDeployment({
    personId: 'sam', siteRef: 'Tank room — north', task: 'Valve inspection',
    protocolRef: 'LWA-2026-108 rev 3 — tank room entry', intervalMinutes: 30, graceMinutes: 5,
    startAt: '2026-11-17T07:30', expectedEndAt: '2026-11-17T10:00',
  });
  assert.equal(overlap.ok, false);
  assert.equal(overlap.field, 'startAt');
  assert.match(overlap.error, /overlapping by 150 whole minute/);

  // A seat that may declare, and that holds itself, still may not send ITSELF out
  // alone. Priya manages a line, so her rank opens the door — the door refuses her
  // for the person she named, not for her rank.
  const { api: seated } = harness(fixture({ activeSeatId: 'priya', deployments: [] }));
  const self = seated.loneWorkingDeclareDeployment({
    personId: 'priya', siteRef: 'Tank room — north', task: 'Valve inspection',
    protocolRef: 'LWA-2026-108 rev 3 — tank room entry', intervalMinutes: 30, graceMinutes: 5,
    startAt: '2026-11-17T08:00', expectedEndAt: '2026-11-17T10:00',
  });
  assert.equal(self.ok, false);
  assert.equal(self.refusal, 'loneWorking:self-declaration');
});

test('the door refuses a future, backwards or doubled contact, and a contact on a closed deployment', () => {
  const { store, api } = harness(fixture({ checkins: [contact('c-1', '2026-11-17T08:00:00.000Z')] }));

  const future = api.loneWorkingCheckIn({ deploymentId: 'dep-1', channel: 'radio', outcome: 'ok', at: '2026-11-17T10:00' });
  assert.equal(future.ok, false);
  assert.equal(future.refusal, 'loneWorking:instant-future');

  const backwards = api.loneWorkingCheckIn({ deploymentId: 'dep-1', channel: 'radio', outcome: 'ok', at: '2026-11-17T07:00' });
  assert.equal(backwards.ok, false);
  assert.equal(backwards.refusal, 'loneWorking:contact-not-later');

  const same = api.loneWorkingCheckIn({ deploymentId: 'dep-1', channel: 'radio', outcome: 'ok', at: '2026-11-17T08:00' });
  assert.equal(same.ok, false, 'a contact at the same instant is the same contact');

  const ok = api.loneWorkingCheckIn({ deploymentId: 'dep-1', channel: 'app', outcome: 'ok', at: '2026-11-17T08:30' });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(store.state.lwkCheckins.length, 2);

  const closed = api.loneWorkingCloseDeployment({ deploymentId: 'dep-1', closeOutcome: 'returned', note: 'Came back in and signed the log at the gate.', at: '2026-11-17T08:45' });
  assert.equal(closed.ok, true, closed.error);
  const after = api.loneWorkingCheckIn({ deploymentId: 'dep-1', channel: 'radio', outcome: 'ok', at: '2026-11-17T08:50' });
  assert.equal(after.ok, false);
  assert.equal(after.refusal, 'loneWorking:deployment-closed');
});

test('the door refuses an escalation with nothing to answer, and a person escalating about themselves', () => {
  const { api } = harness(fixture({ checkins: [contact('c-1', '2026-11-17T08:30:00.000Z')] }));
  const current = api.loneWorkingEscalate({
    deploymentId: 'dep-1', basis: 'check-overdue', outcome: 'attempted',
    detail: 'Rang the site radio and the mobile once each; no answer.', raisedAt: '2026-11-17T08:40',
  });
  assert.equal(current.ok, false, 'the deployment is current: there is no condition to answer');
  assert.equal(current.refusal, 'loneWorking:nothing-to-escalate');

  // A manager working alone, seated as herself, cannot raise her own welfare
  // escalation: a lapsed check owes SOMEBODY ELSE the act.
  const raw = fixture({
    activeSeatId: 'priya',
    deployments: [deployment({ id: 'dep-priya', personId: 'priya', lineManagerId: 'freya', declaredById: 'freya' })],
    checkins: [contact('c-priya', '2026-11-17T07:00:00.000Z', { deploymentId: 'dep-priya', recordedById: 'freya' })],
  });
  const seated = harness(raw);
  const self = seated.api.loneWorkingEscalate({
    deploymentId: 'dep-priya', basis: 'check-overdue', outcome: 'welfare-confirmed',
    detail: 'Ringing my own number and telling the register I am fine.', raisedAt: '2026-11-17T08:40',
  });
  assert.equal(self.ok, false);
  assert.equal(self.refusal, 'loneWorking:self-escalation');
});

test('a person may not raise the escalation about themselves, and a second close-out is refused', () => {
  // sam holds no line to himself, so the seat is his own record: rank 1 may not
  // declare at all, which is the first guard. The second is the door's own check,
  // which the operator seat reaches — and it refuses the deployed person.
  const { store, api } = harness(fixture({ checkins: [LATE_CONTACT] }));
  const escalated = api.loneWorkingEscalate({
    deploymentId: 'dep-1', basis: 'check-overdue', outcome: 'welfare-confirmed',
    detail: 'Drove to the bay and confirmed he is safe; the radio battery was flat.', raisedAt: '2026-11-17T08:40',
  });
  assert.equal(escalated.ok, true, escalated.error);
  assert.equal(store.state.lwkEscalations.length, 1);

  const closed = api.loneWorkingCloseDeployment({ deploymentId: 'dep-1', closeOutcome: 'returned', note: 'Came back in and signed the log at the gate.', at: '2026-11-17T08:45' });
  assert.equal(closed.ok, true, closed.error);
  const second = api.loneWorkingCloseDeployment({ deploymentId: 'dep-1', closeOutcome: 'returned', note: 'Trying to rewrite the close.', at: '2026-11-17T08:50' });
  assert.equal(second.ok, false);
  assert.equal(second.refusal, 'loneWorking:already-closed');
});

test('the door refuses a close-out with no written note, and conventions are refused rather than clamped', () => {
  const { api } = harness(fixture());
  const bare = api.loneWorkingCloseDeployment({ deploymentId: 'dep-1', closeOutcome: 'returned', note: '', at: '2026-11-17T08:45' });
  assert.equal(bare.ok, false);
  assert.equal(bare.field, 'note');

  const bad = api.loneWorkingSetConventions({ lwkHorizonDays: 500 });
  assert.equal(bad.ok, false);
  assert.equal(bad.refusal, 'loneWorking:setting-out-of-bounds');
  const unknown = api.loneWorkingSetConventions({ somethingElse: 1 });
  assert.equal(unknown.ok, false);
  const good = api.loneWorkingSetConventions({ lwkHorizonDays: 45, lwkPrivacyFloor: 4 });
  assert.equal(good.ok, true, good.error);
  assert.equal(good.conventions.lwkHorizonDays, 45);
  assert.equal(good.conventions.lwkPrivacyFloor, 4);
});

/* --------------------------------------------------------------- 8. exports */

test('the CSV boundary is aggregate, identity-free and printed in the declared column order', () => {
  const state = load(fixture({ checkins: [LATE_CONTACT] }));
  const report = buildLoneWorking(state, { now: NOW, seat: null });
  const rows = loneWorkingCsvRows(report);
  const summary = rows.find((row) => row.row_kind === 'summary');
  assert.equal(summary.unconfirmed_n, report.totals.unconfirmedN);
  assert.equal(summary.unconfirmed_minutes_total, report.totals.unconfirmedMinutes);
  assert.equal(summary.open_n, report.totals.open);
  assert.equal(summary.complete, 1);

  const text = JSON.stringify(rows);
  for (const forbidden of ['sam', 'mei', 'freya', 'Substation', 'relay', 'LWA-2026', 'dep-1']) {
    assert.ok(!text.includes(forbidden), `the export must not carry “${forbidden}”`);
  }

  const file = exportWorkspaceCsv(state, LWK_CSV_SCOPE, { now: NOW });
  assert.equal(file.ok, true, file.error);
  const parsed = parseCsv(file.csv);
  assert.deepEqual(parsed.headers, LWK_CSV_COLUMNS);
  assert.equal(parsed.rows.length, 1 + report.stateRows.length);
  // Byte-identical for two operators reading the same workspace at the same clock.
  assert.equal(file.csv, exportWorkspaceCsv(state, LWK_CSV_SCOPE, { now: NOW }).csv);
});

test('a per-state count below the declared privacy floor is exported BLANK with its reason', () => {
  const state = load(fixture({ checkins: [LATE_CONTACT] }));
  const report = buildLoneWorking(state, { now: NOW, seat: null });
  const rows = loneWorkingCsvRows(report);
  const stateRow = rows.find((row) => row.row_kind === 'state' && row.key === 'welfare-unconfirmed');
  assert.equal(stateRow.deployments_n, '', 'one unconfirmed deployment is below a floor of three and is withheld');
  assert.match(stateRow.blank_reason, /privacy floor of 3/);
  // A zero is a computed zero and is exported as such, not withheld.
  const zeroRow = rows.find((row) => row.row_kind === 'state' && row.key === 'check-due');
  assert.equal(zeroRow.deployments_n, 0);
});

/* ----------------------------------------------------------------- 9. panel */

test('the panel prints the reader’s own figures cell by cell (display == computed)', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const raw = fixture({ checkins: [LATE_CONTACT] });
    const state = load(raw);
    const report = buildLoneWorking(state, { now: NOW, seat: null });
    const { api } = harness(raw);
    const view = renderLoneWorking({ api, query: new URLSearchParams(''), state });
    const html = view.outerHTML;

    const cell = (testid) => {
      const match = new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`).exec(html);
      return match ? match[1].trim() : null;
    };
    assert.equal(cell('lwk-count-open'), String(report.totals.open));
    assert.equal(cell('lwk-count-unconfirmed'), String(report.totals.unconfirmedN));
    assert.equal(cell('lwk-count-concern'), String(report.totals.concernN));
    assert.equal(cell('lwk-count-overran'), String(report.totals.overranN));
    assert.equal(cell('lwk-count-due'), String(report.totals.checkDueN));
    assert.equal(cell('lwk-count-attention'), String(report.attention.total));
    assert.ok(html.includes(`data-testid="lwk-state-${report.rows[0].state.key}"`),
      `the printed state must be the computed one (${report.rows[0].state.key})`);
    assert.ok(html.includes('50 min late'), 'the exact computed lateness is printed, not a rounded label');
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});

test('the panel renders every tab without throwing on a workspace with no deployments', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const raw = fixture({ deployments: [] });
    const state = load(raw);
    const { api } = harness(raw);
    for (const view of ['now', 'lines', 'history', 'method']) {
      const node = renderLoneWorking({ api, query: new URLSearchParams(`view=${view}`), state });
      assert.ok(node.outerHTML.length > 0);
    }
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});
