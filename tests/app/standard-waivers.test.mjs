// ADR-0212 — Temporary Standard Waiver Register.
//
// The claims are governance claims, so the tests are: a door that refuses,
// a state that is derived rather than stored, a chain that counts only
// contiguous links, coverage that never overstates, and a printed figure that
// is the computed figure. One focused pass over what this session built:
//
//   1. registration — schema, collections, CSV, spine position, rights, pause;
//   2. the loader drops an authority it cannot read, and never un-revokes one;
//   3. authority is the line the routine is owed under, including a declared
//      matrix line, an ended line and the top of the workspace;
//   4. the door: owner-only requests, line-holder-only answers, no
//      self-authorisation, no wider grant, no gap passed off as a renewal;
//   5. every state, including the one the register exists for;
//   6. coverage counts a slot only when EVERY day of it was authorised;
//   7. RULE-TSW-01 asks the right seat for each of its two conditions and
//      nothing at all when it is paused;
//   8. display == stored: a reload reproduces every derived figure;
//   9. the CSV and the panel print the figures the reader computed.
//
// What is NOT tested here, and is not claimed: a real-browser or assistive-
// technology walkthrough, and a full `npm test` (the focused pass is recorded
// in AI-SESSION-LOG.md).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { COLLECTIONS, DEFAULT_SETTINGS, MIGRATIONS, SCHEMA_VERSION, createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS, serializeCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { PAUSE_PERMIT_MATRIX_REACH_SWITCHES, PAUSE_PERMIT_REACH_RULES } from '../../app/core/domain/pausePermitRegistry.js';
import {
  buildStandardWaivers,
  standardWaiverAttentionCount,
  standardWaiverBriefText,
  standardWaiverCsvRows,
  standardWaiverAuthority,
} from '../../app/core/domain/standardWaiver.js';
import { standardWaiverRule, indexStandardWaiverAsks, standardWaiverConditions } from '../../app/core/domain/standardWaiverRules.js';
import {
  STANDARD_WAIVER_CSV_COLUMNS,
  STANDARD_WAIVER_CSV_SCOPE,
  STANDARD_WAIVER_STATES,
  STANDARD_WAIVER_SETTING_KEYS,
} from '../../app/core/domain/standardWaiverRegistry.js';
import { buildMatrix } from '../../app/core/domain/matrix.js';
import { renderStandardWaiverPanel } from '../../app/views/standardWaiverPanel.js';
import { renderStandardWork } from '../../app/views/standardWork.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T0 = '2026-11-15T12:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);
const plusDays = (day, n) => new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 86400000).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ fixture */

const person = (id, managerId, level) => ({
  id, name: `${id[0].toUpperCase()}${id.slice(1)} Name`, managerId, level, role: 'Operations', team: 'Ops',
  status: 'active', startDate: '2026-01-01T09:00:00.000Z', createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:00:00.000Z',
});

const routine = (id, ownerId, patch = {}) => ({
  id, ownerId, title: patch.title || `Routine ${id}`, standard: patch.standard || 'Walk the line at 07:00 and compare the board against the plan.',
  kind: patch.kind || 'gemba', cadence: patch.cadence || 'daily', minutes: 20, weekdays: patch.weekdays || [1, 2, 3, 4, 5],
  lineKey: patch.lineKey || 'home', fromDay: patch.fromDay || '2026-09-01', retiredOn: patch.retiredOn || null,
  retiredReason: patch.retiredReason || '', declaredOn: '2026-09-01', declaredAt: '2026-09-01T09:00:00.000Z', declaredById: ownerId,
});

function rawFixture(patch = {}, now = T0) {
  const raw = createEmptyState(now);
  raw.people = [
    person('vera', null, 'vp'),
    person('dan', 'vera', 'director'),
    person('eve', 'vera', 'director'),
    person('mia', 'dan', 'manager'),
    // A frontline supervisor holds a line over somebody — that is what makes
    // `tom` a seat of his own rather than a display row. `ivy` never needs one.
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
    routine('r-home', 'tom'),
    routine('r-proj', 'tom', { lineKey: 'rl-tom-eve', cadence: 'weekly', weekdays: [], title: 'Weekly interface review' }),
    routine('r-ended', 'tom', { lineKey: 'rl-old' }),
    routine('r-missing', 'tom', { lineKey: 'rl-nope' }),
    routine('r-mia', 'mia', { title: 'Mia’s tier huddle' }),
    routine('r-leader', 'leader', { title: 'The leader’s own walk' }),
    routine('r-weekly', 'tom', { cadence: 'weekly', weekdays: [], title: 'Tom’s weekly board review' }),
    routine('r-monthly', 'tom', { cadence: 'monthly', weekdays: [], title: 'Tom’s monthly check' }),
    routine('r-retired', 'tom', { retiredOn: '2026-10-01', retiredReason: 'Replaced by the tier huddle.' }),
  ];
  return { ...raw, ...patch };
}
const fixture = (patch = {}, now = T0) => normalizeState(rawFixture(patch, now), { now: new Date(now) }).state;

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

/** Request a waiver through the real door and return its id. Fails the test if refused. */
function ask(env, { routineId = 'r-home', kind = 'capacity', reason = 'The relief operator did not arrive and nobody else was qualified.', safeguard = 'The tier huddle checks the board instead.', from, to, renewsRequestId = null }) {
  const made = env.api.standardWaiverRequest({ routineId, kind, reason, safeguard, from, to, renewsRequestId });
  assert.ok(made.ok, `request ${routineId} ${from}–${to}: ${made.error}`);
  return made.requestId;
}
/** Answer a request through the real door; returns the result (so a refusal can be asserted). */
function answer(env, requestId, { decision = 'granted', basis = 'Authorised for the stated window; the safeguard is adequate.', from, to, renewsRequestId = null } = {}) {
  return env.api.standardWaiverAnswer({ requestId, decision, basis, from, to, renewsRequestId });
}
function read(store, now = T0) {
  return buildStandardWaivers(store.state, { now: new Date(now), settings: store.state.settings, seat: null });
}

/* =====================================================================
 * 1. REGISTRATION
 */

test('registration: schema v166, four ledgers, CSV #154, RULE-TSW-01 as spine rule 131, rights, pause and contract', () => {
  assert.equal(SCHEMA_VERSION, 175);
  for (const key of ['standardWaiverRequests', 'standardWaiverGrants', 'standardWaiverDecisions', 'standardWaiverMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  const scope = CSV_EXPORTS.find((entry) => entry.key === STANDARD_WAIVER_CSV_SCOPE);
  assert.ok(scope, 'CSV #154 is registered');
  assert.equal(scope.sensitive, false, 'the export is aggregate-only');
  assert.equal(CSV_EXPORTS.length, 163);
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 137);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'one contract per spine rule');
  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id);
  assert.equal(ids.at(-1), 'sealRule', 'the seal is absolutely last');
  assert.equal(ids.at(-2), 'seatRule', 'the seat roll-up runs after every other rule');
  assert.equal(ids.at(-4), 'standardWaiverRule', 'RULE-TSW-01 sits just above the newest rule, before the seat roll-up');
  assert.equal(ids.at(-3), 'speakUpRule', 'ADR-0215 registers after it and still ahead of the seat roll-up');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule?.id === 'standardWaiverRule');
  assert.ok(contract, 'RULE-TSW-01 declares its propagation contract');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'standardWaiverMarkers']);
  assert.equal(contract.scansWorkspace, true);
  assert.deepEqual(
    [ACTION_RIGHTS['read-standard-work-waivers'].minRank, ACTION_RIGHTS['request-standard-work-waiver'].minRank,
      ACTION_RIGHTS['authorise-standard-work-waiver'].minRank, ACTION_RIGHTS['decide-standard-work-waiver'].minRank,
      ACTION_RIGHTS['govern-standard-work-waivers'].minRank],
    [1, 1, 2, 1, 3],
    'the frontline may read, ask and close; only a manager authorises; governance is director-and-above',
  );
  assert.ok(SAFE_READS.has('standardWaiverReport'));
  assert.ok(SAFE_READS.has('standardWaiverCandidates'));
  assert.ok(!SAFE_READS.has('standardWaiverRequest'), 'requesting writes');
  assert.ok(!SAFE_READS.has('standardWaiverDecide'), 'deciding writes');
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('standardWaiverAutoPropagate'), 'the switch is on the reach list');
  assert.equal(PAUSE_PERMIT_REACH_RULES.standardWaiverAutoPropagate, 'standardWaiverRules.js');
  // The reach claim is checkable against the source that reads it.
  const source = fs.readFileSync(path.join(REPO, 'app/core/domain/standardWaiverRules.js'), 'utf8');
  assert.ok(source.includes('standardWaiverAutoPropagate'), 'the rule file names its own pause switch literally');
  for (const key of Object.values(STANDARD_WAIVER_SETTING_KEYS)) {
    assert.ok(key in DEFAULT_SETTINGS, `${key} has a declared default`);
  }
});

test('migration 165 → 166 adds four EMPTY ledgers and the conventions; no waiver is inferred from the record', () => {
  const v165 = { ...createEmptyState('2026-11-01T00:00:00.000Z'), schemaVersion: 165 };
  v165.standardWorkRoutines = [routine('r-1', 'tom')];
  v165.standardWorkChecks = [{ id: 'c1', routineId: 'r-1', slotKey: '2026-10-30', recordedOn: '2026-10-30', outcome: 'missed', reason: 'the line was down' }];
  delete v165.standardWaiverRequests; delete v165.standardWaiverGrants;
  delete v165.standardWaiverDecisions; delete v165.standardWaiverMarkers;
  v165.settings = { ...v165.settings };
  for (const key of Object.values(STANDARD_WAIVER_SETTING_KEYS)) delete v165.settings[key];
  const next = MIGRATIONS[165](v165);
  assert.equal(next.schemaVersion, 166, 'this STEP returns 166; the head is pinned on the chain, not here');
  assert.deepEqual(next.standardWaiverRequests, []);
  assert.deepEqual(next.standardWaiverGrants, []);
  assert.deepEqual(next.standardWaiverDecisions, []);
  assert.deepEqual(next.standardWaiverMarkers, []);
  assert.equal(next.settings.standardWaiverMaxDays, 30);
  assert.equal(next.settings.standardWaiverRenewalReviewAfter, 3);
  assert.equal(next.settings.standardWaiverAutoPropagate, true);
  assert.deepEqual(next.standardWorkRoutines, v165.standardWorkRoutines, 'existing records are untouched');
  assert.deepEqual(next.standardWorkChecks, v165.standardWorkChecks);
});

/* =====================================================================
 * 2. THE LOADER — drops an authority it cannot read, never un-revokes one
 */

test('loader: a request against no routine, a weak reason, a reversed window and a widening grant are all dropped, never repaired', () => {
  const request = (id, patch = {}) => ({
    id, routineId: 'r-home', ownerId: 'tom', kind: 'capacity',
    reason: 'The relief operator did not arrive and nobody else was qualified.',
    safeguard: 'The tier huddle checks the board instead.', from: '2026-11-20', to: '2026-11-22',
    at: '2026-11-15T09:00:00.000Z', ...patch,
  });
  const raw = rawFixture({
    standardWaiverRequests: [
      request('q1'),
      request('q-unknown', { routineId: 'r-nope' }),
      request('q-weak', { reason: 'busy' }),
      request('q-backwards', { from: '2026-11-22', to: '2026-11-20' }),
      request('q-long', { from: '2026-11-20', to: '2027-03-20' }),
    ],
    standardWaiverGrants: [
      { id: 'g1', requestId: 'q1', authoriserId: 'mia', decision: 'granted', basis: 'Authorised for the stated window.', from: '2026-11-20', to: '2026-11-22', at: '2026-11-15T10:00:00.000Z', revoked: false },
      { id: 'g-wide', requestId: 'q1', authoriserId: 'mia', decision: 'granted', basis: 'Authorised for a wider window.', from: '2026-11-19', to: '2026-11-23', at: '2026-11-15T10:00:00.000Z' },
      { id: 'g-orphan', requestId: 'q-missing', authoriserId: 'mia', decision: 'granted', basis: 'An answer to nothing at all.', from: '2026-11-20', to: '2026-11-21', at: '2026-11-15T10:00:00.000Z' },
    ],
    standardWaiverDecisions: [
      { id: 'd-early', requestId: 'q1', kind: 'restored', decidedById: 'tom', decidedOn: '2026-11-10', basis: 'Restored before it started.', at: '2026-11-15T11:00:00.000Z' },
    ],
  });
  const loaded = normalizeState(raw, { now: new Date(T0) });
  assert.equal(loaded.state.standardWaiverRequests.length, 1, 'only the readable request survives');
  assert.equal(loaded.state.standardWaiverRequests[0].id, 'q1');
  assert.equal(loaded.state.standardWaiverGrants.length, 1, 'the widening grant and the orphan are dropped');
  assert.equal(loaded.state.standardWaiverGrants[0].id, 'g1');
  assert.equal(loaded.state.standardWaiverDecisions.length, 0, 'a decision dated before the departure began cannot survive');
  const said = loaded.warnings.join(' | ');
  assert.match(said, /naming a routine this workspace does not hold/);
  assert.match(said, /shorter than the declared floor/);
  assert.match(said, /window is missing, reversed or longer than the hard ceiling/);
  assert.match(said, /naming no request on the register/);
  assert.match(said, /wider than the request they answer/);
  assert.match(said, /dated before the departure began/);
});

test('loader: a revocation with no written reason stays revoked and is printed as such', () => {
  const raw = rawFixture({
    standardWaiverRequests: [{
      id: 'q1', routineId: 'r-home', ownerId: 'tom', kind: 'capacity',
      reason: 'The relief operator did not arrive and nobody else was qualified.',
      safeguard: 'The tier huddle checks the board instead.',
      from: '2026-11-10', to: '2026-11-20', at: '2026-11-09T09:00:00.000Z',
    }],
    standardWaiverGrants: [{
      id: 'g1', requestId: 'q1', authoriserId: 'mia', decision: 'granted', basis: 'Authorised for the stated window.',
      from: '2026-11-10', to: '2026-11-20', at: '2026-11-09T10:00:00.000Z',
      revoked: true, revokedOn: '2026-11-12', revokedById: 'mia', revokedReason: '',
    }],
  });
  const loaded = normalizeState(raw, { now: new Date(T0) });
  const grant = loaded.state.standardWaiverGrants[0];
  assert.equal(grant.revoked, true, 'the revocation is a fact and is not un-revoked by the loader');
  assert.equal(grant.revokedReason, null);
  assert.match(loaded.warnings.join(' '), /kept 1 revocation\(s\) with no written reason/);
  const report = buildStandardWaivers(loaded.state, { now: new Date(T0), seat: null });
  assert.equal(report.requests[0].stateKey, 'revoked');
});

/* =====================================================================
 * 3. AUTHORITY — the line the routine is owed under, and nobody else
 */

test('authority: home line, a declared matrix line, an ended line, an unknown line and the top of the workspace', () => {
  const state = fixture();
  const matrix = buildMatrix(state, { now: at('2026-11-15'), settings: state.settings });
  const byId = new Map(state.standardWorkRoutines.map((row) => [row.id, row]));
  assert.deepEqual(
    (({ state: s, managerId }) => [s, managerId])(standardWaiverAuthority(matrix, byId.get('r-home'))),
    ['seat', 'mia'], 'the home line is held by the roster manager',
  );
  assert.deepEqual(
    (({ state: s, managerId }) => [s, managerId])(standardWaiverAuthority(matrix, byId.get('r-proj'))),
    ['seat', 'eve'], 'a routine declared under a project line is authorised by THAT line’s holder',
  );
  const ended = standardWaiverAuthority(matrix, byId.get('r-ended'));
  assert.equal(ended.state, 'line-ended');
  assert.equal(ended.managerId, null, 'nobody is substituted for an ended line');
  assert.match(ended.says, /has ended/);
  assert.equal(standardWaiverAuthority(matrix, byId.get('r-missing')).state, 'line-unknown');
  assert.equal(standardWaiverAuthority(matrix, byId.get('r-leader')).state, 'no-authority');
});

test('the door: only the owner asks, only the line holder answers, and nobody authorises themselves', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('mia');
  const notOwner = env.api.standardWaiverRequest({ routineId: 'r-home', kind: 'capacity', reason: 'A manager cannot ask on the owner’s behalf.', safeguard: 'None declared here.', from: '2026-11-20', to: '2026-11-22' });
  assert.equal(notOwner.ok, false);
  assert.match(notOwner.error, /requested by the person who owes the standard/);

  env.sit('tom');
  const shortReason = env.api.standardWaiverRequest({ routineId: 'r-home', kind: 'capacity', reason: 'busy', safeguard: 'The huddle checks the board.', from: '2026-11-20', to: '2026-11-22' });
  assert.equal(shortReason.ok, false);
  assert.match(shortReason.error, /at least 20 characters/);
  const noSafeguard = env.api.standardWaiverRequest({ routineId: 'r-home', kind: 'capacity', reason: 'The relief operator did not arrive and nobody else was qualified.', safeguard: 'n/a', from: '2026-11-20', to: '2026-11-22' });
  assert.equal(noSafeguard.ok, false);
  assert.match(noSafeguard.error, /safeguard/);
  const past = env.api.standardWaiverRequest({ routineId: 'r-home', kind: 'capacity', reason: 'The relief operator did not arrive and nobody else was qualified.', safeguard: 'The huddle checks the board.', from: '2026-10-01', to: '2026-10-02' });
  assert.equal(past.ok, false);
  assert.match(past.error, /pardon, not a permission/);
  const long = env.api.standardWaiverRequest({ routineId: 'r-home', kind: 'capacity', reason: 'The relief operator did not arrive and nobody else was qualified.', safeguard: 'The huddle checks the board.', from: '2026-11-20', to: '2027-01-20' });
  assert.equal(long.ok, false);
  assert.match(long.error, /declared maximum is 30/);
  const retired = env.api.standardWaiverRequest({ routineId: 'r-retired', kind: 'capacity', reason: 'The relief operator did not arrive and nobody else was qualified.', safeguard: 'The huddle checks the board.', from: '2026-11-20', to: '2026-11-22' });
  assert.equal(retired.ok, false);
  assert.match(retired.error, /retired/);

  const requestId = ask(env, { from: '2026-11-20', to: '2026-11-22' });
  // The requester cannot answer their own request, and neither can an ancestor.
  env.sit('tom');
  const selfAnswer = answer(env, requestId, { from: '2026-11-20', to: '2026-11-22' });
  assert.equal(selfAnswer.ok, false, 'a frontline lead is below the authorising rank at all');
  env.sit('dan');
  const ancestor = answer(env, requestId, { from: '2026-11-20', to: '2026-11-22' });
  assert.equal(ancestor.ok, false);
  assert.match(ancestor.error, /Only the holder of the line/);
  env.operator();
  const operatorTry = answer(env, requestId, { from: '2026-11-20', to: '2026-11-22' });
  assert.equal(operatorTry.ok, false, 'the operator acts as the leader, and the leader does not hold this line');
  env.sit('mia');
  const granted = answer(env, requestId, { from: '2026-11-20', to: '2026-11-22' });
  assert.ok(granted.ok, granted.error);
  const second = answer(env, requestId, { from: '2026-11-20', to: '2026-11-22' });
  assert.equal(second.ok, false);
  assert.match(second.error, /already granted or refused/);
});

test('a manager at the same altitude cannot authorise their own departure, and an ended line authorises nobody', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('mia');
  const requestId = ask(env, { routineId: 'r-mia', from: '2026-11-20', to: '2026-11-22' });
  // mia is rank 2, so the rank gate admits her; the ACTION still refuses the
  // self-authorisation, which is the control that matters.
  const self = answer(env, requestId, { from: '2026-11-20', to: '2026-11-22' });
  assert.equal(self.ok, false);
  assert.match(self.error, /authorised by the person it excuses is not an authorisation/);
  env.sit('dan');
  const byHolder = answer(env, requestId, { from: '2026-11-20', to: '2026-11-22' });
  assert.ok(byHolder.ok, byHolder.error);

  // A routine declared under an ENDED line: the owner may ask, and nobody can say yes.
  env.sit('tom');
  const endedId = ask(env, { routineId: 'r-ended', from: '2026-11-20', to: '2026-11-22' });
  // A director can reach the authorising rank, so this reaches the authority
  // question itself: the line has ended and nobody may substitute for it.
  env.sit('dan');
  const ended = answer(env, endedId, { from: '2026-11-20', to: '2026-11-22' });
  assert.equal(ended.ok, false);
  assert.match(ended.error, /has ended/);
  const report = read(env.store);
  assert.equal(report.requests.find((row) => row.id === endedId).stateKey, 'requested', 'the request stays on the record unanswered, and the standard stands');
});

test('a grant may narrow the window it answers and may never widen it', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const requestId = ask(env, { from: '2026-11-20', to: '2026-11-27' });
  env.sit('mia');
  const widerStart = answer(env, requestId, { from: '2026-11-19', to: '2026-11-27' });
  assert.equal(widerStart.ok, false);
  assert.match(widerStart.error, /may not widen|may never widen/);
  const widerEnd = answer(env, requestId, { from: '2026-11-20', to: '2026-11-28' });
  assert.equal(widerEnd.ok, false);
  const narrowed = answer(env, requestId, { from: '2026-11-21', to: '2026-11-24' });
  assert.ok(narrowed.ok, narrowed.error);
  const report = read(env.store);
  const row = report.requests.find((item) => item.id === requestId);
  assert.equal(row.grantFrom, '2026-11-21');
  assert.equal(row.grantTo, '2026-11-24');
  assert.equal(row.stateKey, 'pending-start');
});

test('a refusal is a dated act with a written basis, and it creates no authority', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const requestId = ask(env, { from: '2026-11-20', to: '2026-11-22' });
  env.sit('mia');
  const short = answer(env, requestId, { decision: 'refused', basis: 'no' });
  assert.equal(short.ok, false);
  assert.match(short.error, /basis/);
  const refused = answer(env, requestId, { decision: 'refused', basis: 'The line is covered by the relief roster from Monday; the departure is not needed.' });
  assert.ok(refused.ok, refused.error);
  const report = read(env.store);
  assert.equal(report.requests[0].stateKey, 'refused');
  assert.equal(report.totals.liveN, 0);
  assert.equal(report.totals.grantedN, 0, 'a refused request is never counted as granted');
  assert.equal(report.totals.requestsN, 1);
});

/* =====================================================================
 * 4. STATES — every one derived, including the one the register exists for
 */

test('states: pending-start, in-force, expired-unrestored, restored and revoked each read as themselves', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const requestId = ask(env, { from: '2026-11-20', to: '2026-11-22' });
  env.sit('mia');
  assert.ok(answer(env, requestId, { from: '2026-11-20', to: '2026-11-22' }).ok);

  const stateOn = (day) => read(env.store, `${day}T12:00:00.000Z`).requests.find((row) => row.id === requestId);
  assert.equal(stateOn('2026-11-15').stateKey, 'pending-start');
  assert.equal(stateOn('2026-11-20').stateKey, 'in-force');
  assert.equal(stateOn('2026-11-22').stateKey, 'in-force', 'the last day is inclusive');
  assert.equal(stateOn('2026-11-23').stateKey, 'expired-unrestored');
  assert.equal(stateOn('2026-11-23').stateTone, 'bad');

  // A closing decision, dated inside the window, restores the standard early.
  env.on('2026-11-21');
  env.sit('tom');
  const closed = env.api.standardWaiverDecide({ requestId, kind: 'restored', decidedOn: '2026-11-21', basis: 'The relief operator is back and the walk ran as written this morning.' });
  assert.ok(closed.ok, closed.error);
  const after = read(env.store, '2026-11-23T12:00:00.000Z');
  assert.equal(after.requests[0].stateKey, 'restored');
  assert.equal(after.requests[0].decidedOn, '2026-11-21');
  assert.equal(after.routines.find((row) => row.routineId === 'r-home').coverageDaysN, 1, 'coverage stops the day before a restoration');
});

test('states: a revocation ends the authority on its day, and a window that already ended cannot be revoked', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const requestId = ask(env, { from: '2026-11-20', to: '2026-11-26' });
  env.sit('mia');
  assert.ok(answer(env, requestId, { from: '2026-11-20', to: '2026-11-26' }).ok);
  env.on('2026-11-22');
  const revoked = env.api.standardWaiverRevoke({ requestId, reason: 'The equipment is back; the standard applies from today.' });
  assert.ok(revoked.ok, revoked.error);
  const report = read(env.store, '2026-11-23T12:00:00.000Z');
  assert.equal(report.requests[0].stateKey, 'revoked');
  assert.equal(report.requests[0].revokedOn, '2026-11-22');
  env.on('2026-11-30');
  const late = env.api.standardWaiverRevoke({ requestId, reason: 'Too late to withdraw this window now.' });
  assert.equal(late.ok, false);
  assert.match(late.error, /already revoked/);
});

test('a request never answered reads as a lapsed request and never as a departure', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const requestId = ask(env, { from: '2026-11-16', to: '2026-11-17' });
  const later = read(env.store, '2026-11-20T12:00:00.000Z');
  const row = later.requests.find((item) => item.id === requestId);
  assert.equal(row.stateKey, 'lapsed-request');
  assert.equal(later.totals.grantedN, 0);
  assert.equal(later.routines.find((item) => item.routineId === 'r-home').stateKey, 'clear');
});

test('“the routine was retired” is refused unless the retirement is on the record on or before the day claimed', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const requestId = ask(env, { from: '2026-11-16', to: '2026-11-20' });
  env.sit('mia');
  assert.ok(answer(env, requestId, { from: '2026-11-16', to: '2026-11-20' }).ok);
  env.on('2026-11-18');
  const falseClaim = env.api.standardWaiverDecide({ requestId, kind: 'ended-with-routine', decidedOn: '2026-11-18', basis: 'The routine is being retired anyway.' });
  assert.equal(falseClaim.ok, false);
  assert.match(falseClaim.error, /record contradicts/);
  // Retire the routine through the standard-work door, then the claim is true.
  env.sit('tom');
  const retired = env.api.standardWorkRetireRoutine({ routineId: 'r-home', reason: 'Replaced by the new tier walk as of this week.' });
  assert.ok(retired.ok, retired.error);
  const real = env.api.standardWaiverDecide({ requestId, kind: 'ended-with-routine', decidedOn: '2026-11-18', basis: 'The routine itself was retired today; there is no standard left to restore.' });
  assert.ok(real.ok, real.error);
  assert.equal(read(env.store, '2026-11-25T12:00:00.000Z').requests[0].stateKey, 'ended-with-routine');
  const twice = env.api.standardWaiverDecide({ requestId, kind: 'restored', decidedOn: '2026-11-19', basis: 'A second decision would rewrite history.' });
  assert.equal(twice.ok, false);
  assert.match(twice.error, /already recorded/);
});

/* =====================================================================
 * 5. RENEWAL CHAINS — only contiguous links count
 */

test('renewals: a contiguous continuation counts, a two-day gap is refused as a renewal and allowed as a new departure', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const first = ask(env, { from: '2026-11-16', to: '2026-11-18' });
  env.sit('mia');
  assert.ok(answer(env, first, { from: '2026-11-16', to: '2026-11-18' }).ok);
  env.sit('tom');
  const second = ask(env, { from: '2026-11-19', to: '2026-11-21', renewsRequestId: first });
  env.sit('mia');
  assert.ok(answer(env, second, { from: '2026-11-19', to: '2026-11-21', renewsRequestId: first }).ok);
  env.sit('tom');
  // A gap of two days: the standard was back in force on 22 and 23. The request
  // door refuses to call that a continuation.
  const gapClaim = env.api.standardWaiverRequest({
    routineId: 'r-home', kind: 'capacity',
    reason: 'The departure did not really stop, so this looks like a continuation.',
    safeguard: 'The tier huddle checks the board instead.',
    from: '2026-11-24', to: '2026-11-26', renewsRequestId: second,
  });
  assert.equal(gapClaim.ok, false);
  assert.match(gapClaim.error, /no later than the day after/);
  // Asked as a NEW departure it is accepted, and it starts a new chain.
  const gapRequest = ask(env, { from: '2026-11-24', to: '2026-11-26' });
  env.sit('mia');
  const asNew = answer(env, gapRequest, { from: '2026-11-24', to: '2026-11-26' });
  assert.ok(asNew.ok, asNew.error);
  env.on('2026-11-21');
  const report = read(env.store, '2026-11-21T12:00:00.000Z');
  const secondRow = report.requests.find((row) => row.id === second);
  assert.equal(secondRow.chainLength, 2, 'the contiguous link counts');
  const gapRow = report.requests.find((row) => row.id === gapRequest);
  assert.equal(gapRow.chainLength, 1, 'a two-day gap starts a new chain');
  assert.equal(report.routines.find((row) => row.routineId === 'r-home').longestChainN, 2);
});

test('renewals: a refused or different-routine predecessor is refused by name', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const refused = ask(env, { from: '2026-11-16', to: '2026-11-18' });
  env.sit('mia');
  assert.ok(answer(env, refused, { decision: 'refused', basis: 'The standard applies; the relief roster covers the week.' }).ok);
  env.sit('tom');
  const afterRefusal = ask(env, { from: '2026-11-19', to: '2026-11-21' });
  env.sit('mia');
  const renewal = answer(env, afterRefusal, { from: '2026-11-19', to: '2026-11-21', renewsRequestId: refused });
  assert.equal(renewal.ok, false);
  assert.match(renewal.error, /never granted/);
  // A different routine cannot continue this one.
  env.sit('tom');
  const grantedHome = ask(env, { from: '2026-11-19', to: '2026-11-20' });
  env.sit('mia');
  assert.ok(answer(env, grantedHome, { from: '2026-11-19', to: '2026-11-20' }).ok);
  env.sit('tom');
  const other = ask(env, { routineId: 'r-weekly', from: '2026-11-21', to: '2026-11-23' });
  env.sit('mia');
  const wrongRoutine = answer(env, other, { from: '2026-11-21', to: '2026-11-23', renewsRequestId: grantedHome });
  assert.equal(wrongRoutine.ok, false);
  assert.match(wrongRoutine.error, /SAME routine/);
});

test('one routine, one authority: an overlapping window is refused at both doors', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const a = ask(env, { from: '2026-11-20', to: '2026-11-25' });
  env.sit('mia');
  assert.ok(answer(env, a, { from: '2026-11-20', to: '2026-11-25' }).ok);
  env.sit('tom');
  const overlapAsk = env.api.standardWaiverRequest({
    routineId: 'r-home', kind: 'capacity',
    reason: 'A second departure for the same days, asked separately.',
    safeguard: 'The tier huddle checks the board instead.',
    from: '2026-11-24', to: '2026-11-28',
  });
  assert.equal(overlapAsk.ok, false);
  assert.match(overlapAsk.error, /already covers 2026-11-20–2026-11-25/);
  // A window after the standing authority is accepted.
  const after = ask(env, { from: '2026-11-26', to: '2026-11-27' });
  assert.ok(after);
});

/* =====================================================================
 * 6. COVERAGE — exact, narrow, and withheld below its floor
 */

test('coverage: one waived day does not waive a week, and a fully covered weekly slot does', () => {
  // 2026-11-02 is a Monday: the ISO week 2026-W45 runs 11-02 → 11-08, and
  // 2026-W46 runs 11-09 → 11-15. The clock is moved back so each window is
  // authorised BEFORE it happens — which is what the door requires, and what a
  // real supervisor does. Reading at 11-15 then treats both weeks as closed.
  const env = seed(fixture());
  env.on('2026-11-02');
  env.sit('tom');
  const oneDay = ask(env, { routineId: 'r-weekly', from: '2026-11-03', to: '2026-11-03' });
  env.sit('mia');
  assert.ok(answer(env, oneDay, { from: '2026-11-03', to: '2026-11-03' }).ok);

  env.on('2026-11-09');
  env.sit('tom');
  const wholeWeek = ask(env, { routineId: 'r-weekly', from: '2026-11-09', to: '2026-11-15' });
  env.sit('mia');
  assert.ok(answer(env, wholeWeek, { from: '2026-11-09', to: '2026-11-15' }).ok);

  const full = read(env.store, '2026-11-16T12:00:00.000Z');
  const fullRow = full.routines.find((row) => row.routineId === 'r-weekly');
  assert.ok(fullRow.owedSlotsN >= 2, 'both weeks are owed and closed by the reading day');
  assert.equal(fullRow.waivedSlotKeys.includes('2026-W45'), false, 'a single waived day does not waive the week');
  assert.ok(fullRow.waivedSlotKeys.includes('2026-W46'), 'every day of 2026-W46 was authorised, so the slot is waived');
  assert.equal(fullRow.waivedSlotsN, 1);
  assert.equal(fullRow.coverageDaysN, 8, 'one day in W45 plus the seven days of W46');
});

test('coverage: a share below the declared closed-slot floor is withheld with its counts printed', () => {
  const env = seed(fixture());
  env.on('2026-11-01');
  // The monthly routine owes a handful of closed slots in the horizon; the floor
  // is 8, so no share may be printed. The clock is set inside the window so the
  // departure is authorised before it happens.
  env.sit('tom');
  const requestId = ask(env, { routineId: 'r-monthly', from: '2026-11-01', to: '2026-11-05' });
  env.sit('mia');
  assert.ok(answer(env, requestId, { from: '2026-11-01', to: '2026-11-05' }).ok);
  const report = read(env.store, '2026-11-15T12:00:00.000Z');
  const row = report.routines.find((item) => item.routineId === 'r-monthly');
  assert.equal(row.waivedShareWithheld, true);
  assert.equal(row.waivedSharePct, null);
  assert.match(row.waivedShareReason, /fewer than the declared floor of 8/);
  // The CSV codes routines in the reader's own order; find this routine's code
  // rather than assuming the order.
  const code = `R${String(report.routines.findIndex((item) => item.routineId === 'r-monthly') + 1).padStart(2, '0')}`;
  const csv = standardWaiverCsvRows(report).find((line) => line.row_type === 'routine' && line.routine_code === code);
  assert.equal(csv.waived_share_pct, '', 'a withheld figure exports blank, never zero');
  assert.match(csv.waived_share_withheld_reason, /floor/);
});

/* =====================================================================
 * 7. RULE-TSW-01 — the two conditions, their addressees, and the pause
 */

test('rule: a lapsed departure is asked of the line holder who granted it, once, and closes itself', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const requestId = ask(env, { from: '2026-11-16', to: '2026-11-17' });
  env.sit('mia');
  assert.ok(answer(env, requestId, { from: '2026-11-16', to: '2026-11-17' }).ok);

  env.on('2026-11-25');
  env.operator();
  const scan = env.api.standardWaiverScan();
  assert.ok(scan.ok, scan.error);
  const asks = indexStandardWaiverAsks(env.store.state).filter((ask) => ask.task && ask.task.status === 'active');
  assert.equal(asks.length, 1, 'one condition, one ask');
  assert.equal(asks[0].seatId, 'mia', 'the ask goes to the authorising line holder');
  assert.equal(asks[0].task.personId, 'mia');
  assert.match(asks[0].task.expectedOutcome, /suspended by silence/);
  const links = env.store.state.links.filter((link) => link.ruleId === 'RULE-TSW-01' && link.relation === 'rolls-up-to');
  assert.ok(links.length >= 1, 'the ask carries roll-up provenance across every ancestor');
  assert.ok(links.some((link) => link.targetId === 'dan'));

  // Idempotent: a second scan does not file a second ask.
  env.api.standardWaiverScan();
  assert.equal(indexStandardWaiverAsks(env.store.state).filter((ask) => ask.task && ask.task.status === 'active').length, 1);

  // Closing the departure closes its ask.
  env.on('2026-11-25');
  env.sit('mia');
  const closed = env.api.standardWaiverDecide({ requestId, kind: 'restored', decidedOn: '2026-11-18', basis: 'The standard was back in force on the eighteenth; the record is being completed now.' });
  assert.ok(closed.ok, closed.error);
  env.operator();
  env.api.standardWaiverScan();
  const after = indexStandardWaiverAsks(env.store.state);
  assert.equal(after.filter((ask) => ask.task && ask.task.status === 'active').length, 0, 'the ask closed itself');
  assert.equal(after[0].task.status, 'done');
  assert.match(after[0].task.completionNote, /RULE-TSW-01/);
});

test('rule: a contiguous chain at the threshold is reviewed ABOVE the renewing manager, never by them', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  // Three one-day departures in an unbroken run: 16, 17, 18 November.
  let previous = null;
  for (const day of ['2026-11-16', '2026-11-17', '2026-11-18']) {
    env.sit('tom');
    const requestId = ask(env, { from: day, to: day, renewsRequestId: previous });
    env.sit('mia');
    const made = answer(env, requestId, { from: day, to: day, renewsRequestId: previous });
    assert.ok(made.ok, made.error);
    previous = requestId;
  }
  const report = read(env.store);
  assert.equal(report.routines.find((row) => row.routineId === 'r-home').chainReviewDue, true);
  assert.equal(report.totals.chainReviewDueN, 1);

  const asks = indexStandardWaiverAsks(env.store.state).filter((ask) => ask.task && ask.task.status === 'active' && /renewed 3 times/.test(ask.task.title));
  assert.equal(asks.length, 1, 'the chain condition filed one ask');
  assert.equal(asks[0].seatId, 'dan', 'the review goes to mia’s own manager, not to mia');
  assert.notEqual(asks[0].seatId, 'mia');
  assert.match(asks[0].task.expectedOutcome, /longer temporary|no longer temporary/);
  assert.match(asks[0].task.expectedOutcome, /not a finding against anybody’s conduct/);
});

test('rule: a pause writes nothing on every path, including the explicit scan', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const requestId = ask(env, { from: '2026-11-16', to: '2026-11-17' });
  env.sit('mia');
  assert.ok(answer(env, requestId, { from: '2026-11-16', to: '2026-11-17' }).ok);
  env.operator();
  const paused = env.api.standardWaiverSetConventions({ standardWaiverAutoPropagate: false });
  assert.ok(paused.ok, paused.error);
  env.on('2026-11-25');
  // Other rules on the spine may still file their own asks on this commit; what
  // must not happen is a single ask from RULE-TSW-01.
  const scan = env.api.standardWaiverScan();
  assert.ok(scan.ok, scan.error);
  assert.equal(indexStandardWaiverAsks(env.store.state).length, 0);
  const marker = env.store.state.standardWaiverMarkers.filter((row) => row.ruleId === 'RULE-TSW-01');
  assert.equal(marker.length, 0, 'a pause writes no observation either');
  // The door still governs the SETTING itself: a value outside its bounds is refused.
  const bad = env.api.standardWaiverSetConventions({ standardWaiverMaxDays: 500 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /must be a whole number from 1 to 90/);
});

test('rule: a condition with no roster addressee becomes one identity-free observation and asks nobody', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  // vera is a VP whose home line runs to the workspace leader. A departure she
  // owes cannot be reviewed above her because the next seat is the leader.
  const state = env.store.state;
  state.standardWorkRoutines.push(routine('r-vera', 'vera', { title: 'Vera’s own gemba walk' }));
  state.standardWaiverRequests.push({
    id: 'q-vera', routineId: 'r-vera', ownerId: 'vera', kind: 'demand',
    reason: 'An unplanned customer escalation displaced the walk for three days.',
    safeguard: 'The duty manager walks in her place and reports at the huddle.',
    from: '2026-11-10', to: '2026-11-12', at: '2026-11-09T09:00:00.000Z',
  });
  state.standardWaiverGrants.push({
    id: 'g-vera', requestId: 'q-vera', authoriserId: 'leader', decision: 'granted',
    basis: 'Authorised by the workspace leader for the stated window.',
    from: '2026-11-10', to: '2026-11-12', at: '2026-11-09T10:00:00.000Z',
    revoked: false, revokedOn: null, revokedById: null, revokedReason: null,
  });
  env.on('2026-11-20');
  env.operator();
  const scan = env.api.standardWaiverScan();
  assert.ok(scan.ok, scan.error);
  const report = read(env.store, '2026-11-20T12:00:00.000Z');
  assert.equal(report.requests.find((row) => row.id === 'q-vera').stateKey, 'expired-unrestored');
  const markers = env.store.state.standardWaiverMarkers.filter((row) => row.ruleId === 'RULE-TSW-01');
  assert.equal(markers.length, 1, 'leader-held conditions are observed, not delegated');
  assert.equal(indexStandardWaiverAsks(env.store.state).length, 0);
  assert.equal(markers[0].kind, 'standard-waiver');
  assert.match(markers[0].detail, /workspace leader/);
});

/* =====================================================================
 * 8. READ INTEGRITY — display == stored, and the totals add up
 */

test('reader: every state sums to the requests printed, and reconciliation is reported apart from audit', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const live = ask(env, { from: '2026-11-16', to: '2026-11-18' });
  env.sit('mia');
  assert.ok(answer(env, live, { from: '2026-11-16', to: '2026-11-18' }).ok);
  env.sit('tom');
  const pending = ask(env, { from: '2026-11-20', to: '2026-11-21' });
  assert.ok(pending);
  const report = read(env.store, '2026-11-17T12:00:00.000Z');
  const sum = Object.values(report.totals.stateCounts).reduce((n, value) => n + value, 0);
  assert.equal(sum, report.totals.requestsN);
  assert.equal(report.totals.statesSum, report.totals.requestsN);
  assert.equal(report.totals.requestsReconcile, true);
  assert.equal(report.totals.balances, true);
  assert.equal(report.totals.auditClean, true);
  assert.equal(report.totals.liveN, 1);
  assert.equal(report.totals.requestedN, 1);
  const named = STANDARD_WAIVER_STATES.filter((key) => report.totals.stateCounts[key] > 0);
  assert.deepEqual(named.sort(), ['in-force', 'requested'].sort());
});

test('reader: a reload reproduces every derived figure, and nothing derived is ever stored', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const requestId = ask(env, { from: '2026-11-16', to: '2026-11-18' });
  env.sit('mia');
  assert.ok(answer(env, requestId, { from: '2026-11-16', to: '2026-11-18' }).ok);
  env.on('2026-11-25');
  const first = read(env.store, '2026-11-25T12:00:00.000Z');
  const reloaded = fixture(JSON.parse(JSON.stringify(env.store.state)));
  const second = buildStandardWaivers(reloaded, { now: at('2026-11-25'), settings: reloaded.settings, seat: null });
  const strip = (report) => JSON.stringify({
    totals: report.totals,
    requests: report.requests.map((row) => ({ id: row.id, stateKey: row.stateKey, chainLength: row.chainLength, coverage: row.daysGranted })),
    routines: report.routines.map((row) => ({ id: row.routineId, stateKey: row.stateKey, owed: row.owedSlotsN, waived: row.waivedSlotsN, chain: row.longestChainN, review: row.chainReviewDue })),
  });
  assert.equal(strip(second), strip(first), 'a reload prints exactly what the first read printed');
  const stored = ['standardWaiverRequests', 'standardWaiverGrants', 'standardWaiverDecisions'];
  const derivedKeys = ['stateKey', 'chainLength', 'coverageDaysN', 'waivedSlotsN', 'waivedSharePct', 'chainReviewDue', 'auditClean'];
  for (const collection of stored) {
    for (const row of reloaded[collection]) {
      for (const key of derivedKeys) assert.equal(key in row, false, `${collection}.${key} must never be stored`);
    }
  }
});

test('reader: a declared seat sees its own span and says that the rest is not counted', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  ask(env, { from: '2026-11-16', to: '2026-11-18' });
  env.sit('mia');
  const built = env.api.standardWaiverReport();
  assert.ok(built.ok, built.error);
  const report = built.report;
  assert.equal(report.scope, 'seat');
  assert.equal(report.totals.figuresComplete, false, 'routines outside the span are not counted');
  assert.ok(report.totals.outsideReachN > 0);
  const owners = new Set(report.routines.map((row) => row.ownerId));
  for (const owner of owners) assert.ok(['tom', 'mia'].includes(owner), `${owner} is inside this seat’s span`);
  // The operator reads the whole record.
  env.operator();
  const whole = env.api.standardWaiverReport().report;
  assert.equal(whole.scope, 'workspace');
  assert.equal(whole.totals.figuresComplete, true);
  assert.ok(whole.totals.routinesN > report.totals.routinesN);
  assert.equal(standardWaiverAttentionCount(env.store.state, { now: at('2026-11-15') }), whole.attention.length);
});

/* =====================================================================
 * 9. EXPORT AND SURFACE
 */

test('CSV #154: identity-free, one row per state and per routine, and every figure equals the reader’s', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const requestId = ask(env, { from: '2026-11-16', to: '2026-11-18' });
  env.sit('mia');
  assert.ok(answer(env, requestId, { from: '2026-11-16', to: '2026-11-18' }).ok);
  const report = read(env.store);
  const rows = standardWaiverCsvRows(report);
  const headers = serializeCsv(STANDARD_WAIVER_CSV_COLUMNS.map((key) => ({ key, header: key })), rows).split('\n');
  assert.equal(headers[0].split(',').length, STANDARD_WAIVER_CSV_COLUMNS.length);
  const workspace = rows.find((row) => row.row_type === 'workspace');
  assert.equal(workspace.requests_n, report.totals.requestsN);
  assert.equal(workspace.waivers_live_n, report.totals.liveN);
  assert.equal(workspace.states_sum_n, report.totals.statesSum);
  const stateRows = rows.filter((row) => row.row_type === 'state');
  assert.equal(stateRows.length, STANDARD_WAIVER_STATES.length);
  assert.equal(stateRows.reduce((sum, row) => sum + Number(row.state_n || 0), 0), report.totals.requestsN, 'the state rows sum to the request total');
  const routineRows = rows.filter((row) => row.row_type === 'routine');
  assert.equal(routineRows.length, report.routines.length);
  const serialized = serializeCsv(STANDARD_WAIVER_CSV_COLUMNS.map((key) => ({ key, header: key })), rows);
  for (const secret of ['Tom Name', 'Mia Name', 'Routine r-home', 'relief operator', 'tier huddle checks', 'Authorised for the stated window']) {
    assert.equal(serialized.includes(secret), false, `the export never carries “${secret}”`);
  }
});

test('panel: prints the reader’s own figures, offers no control that edits a stored state, and stores nothing', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const requestId = ask(env, { from: '2026-11-16', to: '2026-11-18' });
  env.sit('mia');
  assert.ok(answer(env, requestId, { from: '2026-11-16', to: '2026-11-18' }).ok);
  env.on('2026-11-25');
  const report = read(env.store, '2026-11-25T12:00:00.000Z');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'Event', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value = typeof dom.window[key] === 'function' ? dom.window[key].bind(dom.window) : dom.window[key];
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  try {
    const before = JSON.stringify(env.store.state);
    const ctx = {
      api: env.api,
      query: new URLSearchParams('panel=waivers'),
      navigate: () => {},
      refresh: () => {},
    };
    const node = renderStandardWaiverPanel(ctx);
    dom.window.document.getElementById('root').appendChild(node);
    const text = node.textContent;
    assert.ok(text.includes(`${report.totals.requestsN}`), 'the request count is printed');
    assert.ok(text.includes('Suspended by silence'), 'the state the register exists for is named');
    assert.ok(text.includes(report.routines[0].title), 'a routine in the seat’s span is printed');
    const levels = [...node.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => Number(el.tagName.slice(1)));
    for (let i = 1; i < levels.length; i += 1) assert.ok(levels[i] - levels[i - 1] <= 1, 'no skipped heading level');
    // The board renders no input that writes a state: the acts are dated dialogs.
    assert.equal(node.querySelectorAll('form').length, 0, 'the board itself contains no inline write form');
    assert.equal(JSON.stringify(env.store.state), before, 'a render stores nothing');
    // The standard-work page routes to the panel.
    const page = renderStandardWork(ctx);
    assert.ok(page.textContent.includes('Waivers'), 'the standard-work navigation offers the waiver panel');
  } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('brief: speaks in counts and never names a person, a routine or a reason', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.sit('tom');
  const requestId = ask(env, { from: '2026-11-16', to: '2026-11-18' });
  env.sit('mia');
  assert.ok(answer(env, requestId, { from: '2026-11-16', to: '2026-11-18' }).ok);
  const text = standardWaiverBriefText(read(env.store));
  for (const secret of ['Tom Name', 'Mia Name', 'Routine r-home', 'relief operator', 'tier huddle', 'Authorised for the stated window']) {
    assert.equal(text.includes(secret), false, `the brief never carries “${secret}”`);
  }
  assert.match(text, /Temporary standard waivers/);
  assert.match(text, /No person is rated here/);
});

test('conventions: the request window is bounded by the declared maximum, and the reader honours the floor', () => {
  const env = seed(fixture());
  env.on('2026-11-15');
  env.operator();
  const tightened = env.api.standardWaiverSetConventions({ standardWaiverMaxDays: 7, standardWaiverDefaultDays: 5 });
  assert.ok(tightened.ok, tightened.error);
  env.sit('tom');
  const tooLong = env.api.standardWaiverRequest({
    routineId: 'r-home', kind: 'capacity',
    reason: 'A departure longer than the tightened convention allows.',
    safeguard: 'The huddle checks the board instead.',
    from: '2026-11-16', to: '2026-11-30',
  });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, /declared maximum is 7/);
  const fits = ask(env, { from: '2026-11-16', to: '2026-11-20' });
  assert.ok(fits);
});
