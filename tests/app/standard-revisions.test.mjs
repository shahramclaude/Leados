// ADR-0237 — Standard-Work Revision Register.
//
// The claims are governance claims, so the tests are: a door that refuses, a
// previous text that is read from the chain rather than typed, a state that is
// derived rather than stored, a briefing that is dated and never merged into
// "briefed", a reading that can reconcile yet be incomplete, a loader that drops
// what it cannot vouch for, and a printed figure that is the computed figure.
//
// What is covered: registration; the approval door (owner, line holder, a
// matrix line that names the approver, an ambiguous line refused); the chain
// and the day it takes effect; every state and verdict over time; briefing
// before, after and never; counts against completeness; fail-closed loading;
// lapse on retirement; display == stored across a reload and a render.
//
// What is NOT tested here, and is not claimed: a real-browser or assistive-
// technology walkthrough, the CSV surface (not built in this slice), and a
// full `npm test` run.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { COLLECTIONS, MIGRATIONS, SCHEMA_VERSION, createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { buildStandardRevisions } from '../../app/core/domain/standardRevision.js';
import { renderStandardRevisionPanel } from '../../app/views/standardRevisionPanel.js';
import { STANDARD_REVISION_RIGHTS } from '../../app/core/domain/standardRevisionRegistry.js';

const T0 = '2026-11-15T12:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);

/* ------------------------------------------------------------------ fixture */

const person = (id, managerId, level) => ({
  id, name: `${id[0].toUpperCase()}${id.slice(1)} Name`, managerId, level, role: 'Operations', team: 'Ops',
  status: 'active', startDate: '2026-01-01T09:00:00.000Z', createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:00:00.000Z',
});

const routine = (id, ownerId, patch = {}) => ({
  id, ownerId, title: patch.title || `Routine ${id}`,
  standard: patch.standard || 'Walk the line at 07:00 and compare the board against the plan.',
  kind: 'gemba', cadence: 'daily', minutes: 20, weekdays: [1, 2, 3, 4, 5],
  lineKey: Object.prototype.hasOwnProperty.call(patch, 'lineKey') ? patch.lineKey : 'home',
  fromDay: '2026-09-01', retiredOn: null, retiredReason: '', declaredOn: '2026-09-01',
  declaredAt: '2026-09-01T09:00:00.000Z', declaredById: ownerId,
});

function rawFixture(now = T0) {
  const raw = createEmptyState(now);
  raw.people = [
    person('vera', null, 'vp'),
    person('dan', 'vera', 'director'),
    person('eve', 'vera', 'director'),
    person('mia', 'dan', 'manager'),
    // tom holds two live lines: home under mia, and a project line under eve.
    person('tom', 'mia', 'lead'),
    person('ivy', 'tom', 'ic'),
    person('zoe', 'eve', 'lead'),
    person('yuri', 'zoe', 'ic'),
  ];
  raw.reportingLines = [
    { id: 'rl-tom-eve', personId: 'tom', managerId: 'eve', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '' },
    { id: 'rl-old', personId: 'tom', managerId: 'zoe', kind: 'project', shareH: 10, rights: [], fromISO: '2025-01-01', toISO: '2025-06-30', declaredAt: '2025-01-01T09:00:00.000Z', note: '' },
  ];
  raw.standardWorkRoutines = [
    routine('r-home', 'tom', { title: 'Tom’s morning walk' }),
    routine('r-proj', 'tom', { title: 'Weekly interface review', lineKey: 'rl-tom-eve' }),
    routine('r-amb', 'tom', { title: 'Ambiguous line routine', lineKey: null }),
    routine('r-mia', 'mia', { title: 'Mia’s tier huddle' }),
    routine('r-top', 'leader', { title: 'The leader’s own walk', lineKey: null }),
  ];
  return raw;
}
const fixture = (now = T0) => normalizeState(rawFixture(now), { now: new Date(now) }).state;

function seed(state, startAt = T0) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let clock = new Date(startAt);
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => clock, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => clock, idFactory }), store, { now: () => clock.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const on = (day) => { clock = at(day); };
  const operator = () => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: null }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'operator' });
  return { store, api, sit, on, operator };
}

const EFFECTIVE_1 = '2026-11-22';
const EFFECTIVE_2 = '2026-11-29';
const NEW_TEXT_1 = 'Walk the line at 06:30 and compare the board against the plan.';
const NEW_TEXT_2 = 'Walk the line at 06:30, compare the board against the plan, and read the andon log.';

function approve(env, patch = {}) {
  return env.api.standardRevisionApprove({
    routineId: 'r-home', standard: NEW_TEXT_1, changedStep: 'The walk moves from 07:00 to 06:30 before the shift.',
    basis: 'The 07:00 start overlaps the handover and the board is read against a stale plan.',
    effectiveOn: EFFECTIVE_1, briefeeIds: ['tom', 'ivy'], ...patch,
  });
}
function read(store, now, seat = null) {
  return buildStandardRevisions(store.state, { now: new Date(now), settings: store.state.settings, seat });
}
const revisionOf = (report, no, title = 'Tom’s morning walk') => report.revisions.find((row) => row.routineTitle === title && row.revisionNo === no);

/* =====================================================================
 * 1. REGISTRATION
 */
test('registration: schema v192, two ledgers, migration from v191, rights, gateway, record classes', () => {
  assert.equal(SCHEMA_VERSION, 197, 'ADR-0243 (employee voice and collective consultation) is the current head');
  for (const key of ['standardRevisions', 'standardRevisionBriefs']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  const upgraded = MIGRATIONS[191]({ schemaVersion: 191, standardWorkRoutines: [], people: [] });
  assert.equal(upgraded.schemaVersion, 192);
  assert.deepEqual(upgraded.standardRevisions, [], 'empty at upgrade: no revision is inferred');
  assert.deepEqual(upgraded.standardRevisionBriefs, [], 'empty at upgrade: no briefing is inferred');
  for (const name of ['standardRevisionReport', 'standardRevisionCandidates', 'standardRevisionApprove', 'standardRevisionBrief']) {
    assert.ok(typeof API_RIGHTS[name] === 'string', `${name} is gated by a named right`);
  }
  assert.equal(API_RIGHTS.standardRevisionApprove, STANDARD_REVISION_RIGHTS.APPROVE);
  assert.equal(API_RIGHTS.standardRevisionBrief, STANDARD_REVISION_RIGHTS.BRIEF);
  assert.ok(SAFE_READS.has('standardRevisionReport'), 'the report is a pure read');
  assert.ok(!SAFE_READS.has('standardRevisionApprove'), 'approving writes');
  assert.ok(!SAFE_READS.has('standardRevisionBrief'), 'briefing writes');
  assert.deepEqual(
    [ACTION_RIGHTS['read-standard-revisions'].minRank, ACTION_RIGHTS['approve-standard-revision'].minRank, ACTION_RIGHTS['brief-standard-revision'].minRank],
    [1, 2, 2],
    'the frontline may read; only a line holder approves or briefs',
  );
  for (const key of ['standardRevisions', 'standardRevisionBriefs']) {
    assert.equal(RECORD_POLICIES[key].classKey, 'unit', `${key} is a governed, report-only collection`);
    assert.equal(RECORD_POLICIES[key].detailCeiling, 0, `${key} discloses no detail through the generic projection`);
  }
});

/* =====================================================================
 * 2. THE APPROVAL DOOR
 */
test('approval: owner cannot approve own standard; the line holder under the routine’s line decides; a matrix line names the approver', () => {
  const env = seed(fixture());
  env.sit('tom');
  const own = approve(env);
  assert.equal(own.ok, false, 'the owner of a standard cannot approve its change');

  // r-home is owed under the HOME line, so mia decides. eve holds the project line only.
  env.sit('eve');
  const wrongLine = approve(env);
  assert.equal(wrongLine.ok, false);
  assert.match(wrongLine.error, /Mia Name/, 'the refusal names the holder of the line the routine is owed under');

  // r-proj is owed under the PROJECT line, so eve decides and mia (home line) does not.
  env.sit('mia');
  const projByHome = approve(env, { routineId: 'r-proj', standard: 'Review the interface board against the plan every Monday, with the owner present.', effectiveOn: EFFECTIVE_1, briefeeIds: ['tom'] });
  assert.equal(projByHome.ok, false, 'a matrix line decides: the home manager is not the project line holder');
  assert.match(projByHome.error, /Eve Name/);

  env.sit('eve');
  const projByLine = approve(env, { routineId: 'r-proj', standard: 'Review the interface board against the plan every Monday, with the owner present.', effectiveOn: EFFECTIVE_1, briefeeIds: ['tom'] });
  assert.equal(projByLine.ok, true, projByLine.error);

  // An ambiguous line: tom holds two lines and r-amb names none. Nobody is chosen for them.
  env.sit('mia');
  const ambiguous = approve(env, { routineId: 'r-amb', effectiveOn: EFFECTIVE_1, briefeeIds: ['tom'] });
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.error, /2 active reporting lines/);

  // The top tier has no line holder above it. The operator is the owner here, so
  // the owner refusal fires first; either refusal is a correct refusal.
  env.operator();
  const top = approve(env, { routineId: 'r-top', effectiveOn: EFFECTIVE_1, briefeeIds: ['leader'] });
  assert.equal(top.ok, false);
  assert.match(top.error, /owner of a standard|top-tier/);
});

test('approval: the previous text is read from the chain, and every date and briefee rule is enforced at the door', () => {
  const env = seed(fixture());
  env.sit('mia');
  const ok = approve(env);
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.revisionNo, 1);
  const stored = env.store.state.standardRevisions[0];
  assert.equal(stored.priorStandard, env.store.state.standardWorkRoutines.find((r) => r.id === 'r-home').standard,
    'the prior text is the declared text, read from the routine, not typed in');
  assert.equal(stored.approverId, 'mia', 'the approver is the seat that approved, not a name typed in');
  assert.equal(stored.approvedOn, '2026-11-15');

  const same = approve(env, { standard: NEW_TEXT_1 });
  assert.equal(same.field, 'standard', 'a text identical to the one in force is refused');
  const reverted = approve(env, { standard: stored.priorStandard });
  assert.equal(reverted.field, 'effectiveOn', 'a text that is not the one in force is a real change, and is refused here only for its day: an earlier revision already takes effect on it');
  assert.equal(approve(env, { standard: 'short' }).field, 'standard');
  // From here every probe is a genuine change of text, so only the rule under test can refuse it.
  const probe = (patch) => approve(env, { standard: NEW_TEXT_2, effectiveOn: EFFECTIVE_2, ...patch });
  assert.equal(probe({ changedStep: 'x' }).field, 'changedStep');
  assert.equal(probe({ basis: 'too short' }).field, 'basis');
  assert.equal(probe({ effectiveOn: '2026-11-10' }).field, 'effectiveOn', 'no back-dating');
  assert.equal(probe({ effectiveOn: '2027-06-01' }).field, 'effectiveOn', 'no change further than the declared horizon');
  assert.equal(probe({ effectiveOn: '2026-02-30' }).field, 'effectiveOn', 'not a real calendar day');
  assert.equal(probe({ briefeeIds: ['ivy'] }).field, 'briefeeIds', 'the owner is always owed the new text');
  assert.equal(probe({ briefeeIds: ['tom', 'tom'] }).field, 'briefeeIds', 'each person listed once');
  assert.equal(probe({ briefeeIds: ['tom', 'zoe'] }).field, 'briefeeIds', 'a person who does not report to the owner is not owed it');
  assert.equal(env.store.state.standardRevisions.length, 1, 'no refused probe reached the ledger');
});

test('approval: a frontline seat cannot approve a standard it does not hold a line over', () => {
  const env = seed(fixture());
  env.sit('ivy');
  const refused = approve(env);
  assert.equal(refused.ok, false, 'the frontline is refused at the right, and at the line');
});

/* =====================================================================
 * 3. CHAIN, DAYS AND STATES OVER TIME
 */
test('the chain: a second revision reads the first as its prior text, must take effect later, and states move with the day', () => {
  const env = seed(fixture());
  env.sit('mia');
  assert.equal(approve(env).ok, true);
  const second = approve(env, { standard: NEW_TEXT_2, effectiveOn: EFFECTIVE_1 });
  assert.equal(second.field, 'effectiveOn', 'a later revision must take effect after the earlier one');
  const next = approve(env, { standard: NEW_TEXT_2, effectiveOn: EFFECTIVE_2 });
  assert.equal(next.ok, true, next.error);
  assert.equal(next.revisionNo, 2);
  const rev2 = env.store.state.standardRevisions.find((row) => row.revisionNo === 2);
  assert.equal(rev2.priorStandard, NEW_TEXT_1, 'revision 2 reads revision 1’s text as the text it replaces');
  assert.equal(rev2.priorRevisionNo, 1);

  const before = read(env.store, '2026-11-20T12:00:00.000Z');
  assert.equal(revisionOf(before, 1).state, 'pending');
  assert.equal(revisionOf(before, 2).state, 'pending');
  assert.equal(before.routines.find((r) => r.title === 'Tom’s morning walk').inForceStandard,
    env.store.state.standardWorkRoutines.find((r) => r.id === 'r-home').standard, 'the declared text is in force before any revision applies');

  const mid = read(env.store, '2026-11-25T12:00:00.000Z');
  assert.equal(revisionOf(mid, 1).state, 'in-force');
  assert.equal(revisionOf(mid, 2).state, 'pending');
  assert.equal(mid.routines.find((r) => r.title === 'Tom’s morning walk').inForceStandard, NEW_TEXT_1);

  const after = read(env.store, '2026-12-01T12:00:00.000Z');
  assert.equal(revisionOf(after, 1).state, 'superseded');
  assert.equal(revisionOf(after, 2).state, 'in-force');
  assert.equal(after.routines.find((r) => r.title === 'Tom’s morning walk').inForceStandard, NEW_TEXT_2);
  assert.equal(after.totals.countsReconcile, true);
});

/* =====================================================================
 * 4. BRIEFING: dated, before or after, never merged, never inferred
 */
test('briefing: before, after and never are three different facts, and an unbriefed person in force is overdue', () => {
  const env = seed(fixture());
  env.sit('mia');
  assert.equal(approve(env).ok, true);

  env.on('2026-11-20');
  const early = env.api.standardRevisionBrief({ revisionId: env.store.state.standardRevisions[0].id, personIds: ['tom'] });
  assert.equal(early.ok, true, early.error);
  const pending = read(env.store, '2026-11-20T12:00:00.000Z');
  const ready = revisionOf(pending, 1);
  assert.equal(ready.briefees.find((b) => b.personId === 'tom').state, 'briefed-before');
  assert.equal(ready.briefees.find((b) => b.personId === 'ivy').state, 'due', 'not yet in force, not yet briefed: due');
  assert.equal(ready.verdict, 'briefing-due', 'a revision is not ready while anyone owed it is still unbriefed');

  env.on('2026-11-23');
  const inForce = read(env.store, '2026-11-23T12:00:00.000Z');
  const overdue = revisionOf(inForce, 1);
  assert.equal(overdue.briefees.find((b) => b.personId === 'ivy').state, 'overdue', 'in force and not briefed: overdue, not merely due');
  assert.equal(overdue.verdict, 'briefing-overdue');

  const late = env.api.standardRevisionBrief({ revisionId: env.store.state.standardRevisions[0].id, personIds: ['ivy'], briefedOn: '2026-11-23' });
  assert.equal(late.ok, true, late.error);
  const afterBrief = read(env.store, '2026-11-23T12:00:00.000Z');
  const row = revisionOf(afterBrief, 1);
  assert.equal(row.briefees.find((b) => b.personId === 'ivy').state, 'briefed-after', 'a briefing dated after the text applied is reported as late');
  assert.equal(row.verdict, 'briefed-late', 'late is not merged into “in time”');
  assert.equal(afterBrief.totals.briefedAfterN, 1);
  assert.equal(afterBrief.totals.briefedBeforeN, 1);
  assert.equal(afterBrief.totals.overdueN, 0);
});

test('briefing: the act refuses what the record cannot support', () => {
  const env = seed(fixture());
  env.sit('mia');
  assert.equal(approve(env).ok, true);
  const revisionId = env.store.state.standardRevisions[0].id;

  env.sit('eve');
  const notApprover = env.api.standardRevisionBrief({ revisionId, personIds: ['tom'] });
  assert.equal(notApprover.ok, false, 'only the approver records who was briefed');

  env.sit('mia');
  assert.equal(env.api.standardRevisionBrief({ revisionId, personIds: ['tom'], briefedOn: '2026-11-16' }).field, 'briefedOn', 'a future-dated briefing is refused');
  assert.equal(env.api.standardRevisionBrief({ revisionId, personIds: ['tom'], briefedOn: '2026-11-14' }).field, 'briefedOn', 'a briefing cannot predate the approval');
  assert.equal(env.api.standardRevisionBrief({ revisionId, personIds: ['zoe'] }).field, 'personIds', 'zoe is not owed this text');
  assert.equal(env.api.standardRevisionBrief({ revisionId, personIds: [] }).field, 'personIds');
  assert.equal(env.api.standardRevisionBrief({ revisionId, personIds: ['tom'] }).ok, true);
  assert.equal(env.api.standardRevisionBrief({ revisionId, personIds: ['tom'] }).ok, false, 'the first briefing on the record stands');
});

/* =====================================================================
 * 5. COUNTS AGAINST COMPLETENESS
 */
test('a reading can reconcile and still be incomplete for a seat that cannot see the whole record', () => {
  const env = seed(fixture());
  env.sit('mia');
  assert.equal(approve(env).ok, true);
  env.on('2026-11-23');

  env.operator();
  const whole = read(env.store, '2026-11-23T12:00:00.000Z');
  assert.equal(whole.totals.countsReconcile, true);
  assert.equal(whole.totals.figuresComplete, true, 'the operator reads the whole record');
  assert.equal(whole.totals.briefeesN, 2);
  assert.equal(whole.totals.overdueN, 2);
  assert.equal(whole.totals.coveragePct, 0, 'coverage is floored, and nobody is briefed yet');

  // zoe's span does not reach tom, so the r-home revision is counted out, not printed.
  const zoe = read(env.store, '2026-11-23T12:00:00.000Z', {
    id: 'zoe', nodeId: 'zoe', scope: ['zoe', 'yuri'], lineScope: [], fullAccess: false,
  });
  assert.equal(zoe.totals.revisionsN, 0, 'a revision outside the seat’s reach is not listed');
  assert.equal(zoe.totals.outsideReachN, 1);
  assert.equal(zoe.totals.figuresComplete, false, 'the figures are not claimed as the whole record');
  assert.equal(zoe.totals.countsReconcile, true, 'and the figures that ARE shown still add up');
  assert.ok(zoe.incomplete.some((line) => /outside this seat/.test(line)));
});

/* =====================================================================
 * 6. FAIL-CLOSED LOADING
 */
test('loading: a revision that breaks the chain is dropped with every later revision of its routine, and a briefing for someone not owed is dropped', () => {
  const env = seed(fixture());
  env.sit('mia');
  assert.equal(approve(env).ok, true);
  env.on('2026-11-16');
  // A second revision is only possible on a later day; approve it, then tamper with it.
  assert.equal(approve(env, { standard: NEW_TEXT_2, effectiveOn: EFFECTIVE_2 }).ok, true);
  const raw = JSON.parse(JSON.stringify(env.store.state));
  raw.standardRevisions[1].priorStandard = 'A prior text that was never in force on this routine.';
  raw.standardRevisionBriefs = [{ id: 'b-x', revisionId: raw.standardRevisions[0].id, personId: 'zoe', briefedOn: '2026-11-15', briefedAt: T0, briefedById: 'mia' }];
  const loaded = normalizeState(raw, { now: new Date(T0) });
  const state = loaded.state;
  assert.equal(state.standardRevisions.length, 1, 'the tampered revision and anything after it are dropped');
  assert.equal(state.standardRevisionBriefs.length, 0, 'a briefing for someone the revision does not owe is dropped');
  const allWarnings = loaded.warnings;
  assert.ok(allWarnings.some((line) => /unbroken, correctly sequenced chain/.test(line)), 'the drop is counted and explained, never silent');
  assert.ok(allWarnings.some((line) => /named an unknown revision or person/.test(line)));
});

test('loading: a revision approved by the owner of the standard is refused at the loader', () => {
  const env = seed(fixture());
  env.sit('mia');
  assert.equal(approve(env).ok, true);
  const raw = JSON.parse(JSON.stringify(env.store.state));
  raw.standardRevisions[0].approverId = 'tom';
  const loaded = normalizeState(raw, { now: new Date(T0) });
  assert.equal(loaded.state.standardRevisions.length, 0, 'a self-approved change is not kept');
  assert.ok(loaded.warnings.some((line) => /unbroken, correctly sequenced chain/.test(line)), 'and the drop is counted');
});

/* =====================================================================
 * 7. LAPSE ON RETIREMENT
 */
test('lapse: a routine retired before its revision takes effect never applied the text, and nobody was owed a briefing on it', () => {
  const env = seed(fixture());
  env.sit('mia');
  assert.equal(approve(env).ok, true);
  env.operator();
  const retired = env.api.standardWorkRetireRoutine({ routineId: 'r-home', reason: 'Replaced by the tier huddle as the morning walk.' });
  assert.equal(retired.ok, true, retired.error);
  const report = read(env.store, '2026-11-16T12:00:00.000Z');
  const row = revisionOf(report, 1);
  assert.equal(row.state, 'lapsed');
  assert.equal(row.verdict, 'not-owed');
  assert.ok(row.briefees.every((b) => b.state === 'not-owed'));
  assert.equal(report.totals.countsReconcile, true);
  env.sit('mia');
  assert.equal(env.api.standardRevisionBrief({ revisionId: row.revisionId, personIds: ['tom'] }).ok, false, 'no briefing is recorded against a lapsed revision');
});

/* =====================================================================
 * 8. DISPLAY == STORED
 */
test('display equals stored: a reload reproduces every figure, and the panel prints the computed text and figures', () => {
  const env = seed(fixture());
  env.sit('mia');
  assert.equal(approve(env).ok, true);
  env.on('2026-11-23');
  env.sit('mia');
  assert.equal(env.api.standardRevisionBrief({ revisionId: env.store.state.standardRevisions[0].id, personIds: ['tom'] }).ok, true);
  env.operator();

  const live = read(env.store, '2026-11-23T12:00:00.000Z');
  const reloaded = normalizeState(JSON.parse(JSON.stringify(env.store.state)), { now: new Date(T0) }).state;
  const again = buildStandardRevisions(reloaded, { now: new Date('2026-11-23T12:00:00.000Z'), settings: reloaded.settings, seat: null });
  assert.deepEqual(again.totals, live.totals, 'a reload reproduces the same figures');
  assert.deepEqual(again.revisions.map((r) => [r.revisionId, r.state, r.verdict]), live.revisions.map((r) => [r.revisionId, r.state, r.verdict]));

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'Event', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value = typeof dom.window[key] === 'function' ? dom.window[key].bind(dom.window) : dom.window[key];
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  try {
    const before = JSON.stringify(env.store.state);
    const ctx = { api: env.api, query: new URLSearchParams('panel=revisions'), navigate: () => {}, refresh: () => {} };
    const node = renderStandardRevisionPanel(ctx);
    dom.window.document.getElementById('root').appendChild(node);
    const text = node.textContent;
    assert.ok(text.includes('Tom’s morning walk'), 'the routine is printed');
    assert.ok(text.includes('Walk the line at 07:00'), 'the previous text is printed');
    assert.ok(text.includes(NEW_TEXT_1), 'the new text is printed');
    assert.ok(text.includes('figures add up'), 'the reconciliation claim is printed on its own');
    assert.ok(text.includes('whole record'), 'the completeness claim is printed on its own');
    assert.ok(text.includes('Briefed'), 'the briefing figure is named');
    assert.equal(live.totals.coveragePct, 50, 'and the figure printed is the one computed: one of two owed people briefed');
    assert.ok(text.includes('50%'));
    assert.equal(node.querySelectorAll('form').length, 0, 'the panel holds no inline write form');
    assert.equal(JSON.stringify(env.store.state), before, 'a render stores nothing');
  } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
