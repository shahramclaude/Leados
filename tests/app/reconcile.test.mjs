/**
 * tests/app/reconcile.test.mjs — 1:1 follow-through reconciliation (Schema v7).
 *
 * Covers the promise lifecycle the product previously could not express:
 * a commitment is done in a conversation, carried into a later one, dropped
 * with a reason, or left explicitly open — and every decision survives a
 * reload, an export and a corrupted import.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  openActions,
  commitmentCounts,
  reconciliationCandidates,
  reconciledInMeeting,
  followThroughIndex,
} from '../../app/core/domain/oneonone.js';
import { buildInsights, buildWins } from '../../app/core/domain/insights.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { buildPrepSheet } from '../../app/core/domain/prep.js';
import { buildReviewEvidence } from '../../app/core/domain/reviews.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-24T10:00:00.000Z');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness(storage = memoryStorage()) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-t-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage };
}

function person(id = 'p1', name = 'Ada Lovelace') {
  return {
    id, name, role: 'Engineer', level: 'senior', team: 'Core', managerId: null,
    startDate: '2025-01-01', focus: '', status: 'active', createdAt: '2025-01-01T09:00:00.000Z', archivedAt: null,
  };
}

function action(id, text, overrides = {}) {
  return {
    id,
    text,
    due: null,
    done: false,
    completedOn: null,
    completedInMeetingId: null,
    dropped: false,
    droppedOn: null,
    droppedReason: '',
    droppedInMeetingId: null,
    personId: 'p1',
    carriedFrom: null,
    carriedToMeetingId: null,
    carriedToActionId: null,
    ...overrides,
  };
}

/* ------------------------------------------------------ schema & migration */

test('schema v6 → v7 adds follow-through fields without inventing a history', () => {
  const v6 = {
    schemaVersion: 6,
    people: [{ id: 'p1', name: 'Ada', status: 'active' }],
    oneOnOnes: [{
      id: 'm1', personId: 'p1', date: '2026-10-01', status: 'held',
      actions: [
        { id: 'a1', text: 'Ship the runbook', done: false },
        { id: 'a2', text: 'Close the loop on the incident', done: true, completedOn: '2026-10-01' },
      ],
    }],
  };
  const before = JSON.parse(JSON.stringify(v6));
  const migrated = migrate(v6);
  assert.equal(migrated.raw.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(migrated.applied, ['6 → 7', '7 → 8', '8 → 9', '9 → 10', '10 → 11', '11 → 12', '12 → 13', '13 → 14', '14 → 15', '15 → 16', '16 → 17', '17 → 18', '18 → 19', '19 → 20', '20 → 21', '21 → 22', '22 → 23', '23 → 24', '24 → 25']);
  assert.deepEqual(v6, before, 'migration does not mutate its input');

  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.deepEqual(warnings, []);
  const [open, done] = state.oneOnOnes[0].actions;
  assert.equal(open.carriedFrom, null);
  assert.equal(open.carriedToMeetingId, null);
  assert.equal(open.dropped, false);
  assert.equal(open.completedInMeetingId, null);
  assert.equal(done.done, true);
  assert.equal(done.completedInMeetingId, null, 'a v6 completion cannot name a conversation retroactively');
});

test('schema v13 migration adds an empty manager-support ledger and legacy check-ins get stable source IDs', () => {
  const v13 = {
    schemaVersion: 13,
    people: [{ ...person(), startDate: '2026-09-01' }],
    onboarding: [{
      id: 'plan-old', personId: 'p1', startDate: '2026-09-01', status: 'active',
      reviews: { 30: { heldOn: '2026-10-01', summary: 'Recorded before the source ID field.' } },
    }],
    oneOnOnes: [{ id: 'm-old', personId: 'p1', date: '2026-10-02', status: 'held', actions: [action('a-old', 'Keep the real meeting action')] }],
  };
  const migrated = migrate(v13);
  assert.deepEqual(migrated.applied, ['13 → 14', '14 → 15', '15 → 16', '16 → 17', '17 → 18', '18 → 19', '19 → 20', '20 → 21', '21 → 22', '22 → 23', '23 → 24', '24 → 25']);
  assert.deepEqual(migrated.raw.managerSupport, [], 'no older action/check-in is inferred into the new ledger');
  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.deepEqual(warnings, []);
  assert.equal(state.managerSupport.length, 0);
  assert.equal(state.onboarding[0].reviews[30].id, 'onbr-plan-old-30');
  assert.equal(state.oneOnOnes[0].actions[0].text, 'Keep the real meeting action');
});

test('normalization repairs broken carry chains instead of losing the promise', () => {
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    people: [person()],
    oneOnOnes: [
      {
        id: 'm1', personId: 'p1', date: '2026-10-01', status: 'held',
        actions: [
          action('a1', 'Dangling successor', { carriedToMeetingId: 'missing', carriedToActionId: 'nope' }),
          action('a2', 'Points at another person', { carriedToMeetingId: 'm3', carriedToActionId: 'a4' }),
          action('a3', 'Carried backwards in time', { carriedToMeetingId: 'm0', carriedToActionId: 'a6' }),
          action('a3', 'Duplicate id', {}),
        ],
      },
      { id: 'm0', personId: 'p1', date: '2026-09-01', status: 'held', actions: [action('a6', 'Older meeting')] },
      { id: 'm3', personId: 'p2', date: '2026-10-05', status: 'held', actions: [action('a4', 'Someone else', { personId: 'p2' })] },
    ],
  };
  const { state, warnings } = normalizeState(raw, { now: NOW });
  const actions = state.oneOnOnes.find((m) => m.id === 'm1').actions;
  assert.equal(actions.length, 3, 'duplicate action id dropped');
  assert.equal(actions[0].carriedToMeetingId, null, 'missing successor reopens the promise');
  assert.equal(actions[1].carriedToMeetingId, null, 'cross-person successor reopens the promise');
  assert.equal(actions[2].carriedToMeetingId, null, 'a carry cannot point at an earlier meeting');
  assert.ok(warnings.some((w) => w.includes('reopened 3 carried-forward')));
  assert.ok(warnings.some((w) => w.includes('duplicate action id')));
  assert.equal(openActions(state, { now: NOW }).length, 5, 'reopened promises stay visible');
});

test('normalization breaks carry cycles and keeps completion evidence separate from a stale link', () => {
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    people: [person()],
    oneOnOnes: [
      { id: 'm1', personId: 'p1', date: '2026-10-01', status: 'held', actions: [action('a1', 'Loop A', { carriedToMeetingId: 'm2', carriedToActionId: 'a2' })] },
      { id: 'm2', personId: 'p1', date: '2026-10-08', status: 'held', actions: [action('a2', 'Loop B', { carriedFrom: { meetingId: 'm1', actionId: 'a1' }, carriedToMeetingId: 'm1', carriedToActionId: 'a1' })] },
      {
        id: 'm3', personId: 'p1', date: '2026-10-15', status: 'held',
        actions: [action('a3', 'Done and carried', { done: true, completedOn: '2026-10-15', completedInMeetingId: 'ghost', carriedToMeetingId: 'm2', carriedToActionId: 'a2' })],
      },
    ],
  };
  const { state, warnings } = normalizeState(raw, { now: NOW });
  const loopA = state.oneOnOnes[0].actions[0];
  const loopB = state.oneOnOnes[1].actions[0];
  assert.equal(loopB.carriedToMeetingId, null, 'cycle broken at the last hop');
  assert.equal(loopA.carriedToMeetingId, 'm2', 'the valid first hop survives');
  const doneAndCarried = state.oneOnOnes[2].actions[0];
  assert.equal(doneAndCarried.done, true);
  assert.equal(doneAndCarried.carriedToMeetingId, null, 'completion wins over a stale carry link');
  assert.equal(doneAndCarried.completedInMeetingId, null, 'a confirmation pointing at a missing 1:1 is cleared, the completion kept');
  assert.ok(warnings.some((w) => w.includes('reopened 1 carried-forward')));
  assert.ok(warnings.some((w) => w.includes('cleared a confirmation')));
  assert.equal(openActions(state, { now: NOW }).length, 1, 'only the reopened cycle member is open; the done action is not');
});

/* ------------------------------------------------------------- pure domain */

test('open actions exclude done, dropped and carried-forward copies and report the real carry depth', () => {
  const state = normalizeState({
    schemaVersion: SCHEMA_VERSION,
    people: [person()],
    oneOnOnes: [
      { id: 'm1', personId: 'p1', date: '2026-09-20', status: 'held', actions: [action('a1', 'Long-lived promise', { due: '2026-09-30' })] },
      {
        id: 'm2', personId: 'p1', date: '2026-10-01', status: 'held',
        actions: [action('a2', 'Long-lived promise', {
          carriedFrom: { meetingId: 'm1', actionId: 'a1' },
          carriedToMeetingId: 'm3',
          carriedToActionId: 'a3',
        })],
      },
      {
        id: 'm3', personId: 'p1', date: '2026-10-10', status: 'held',
        actions: [
          action('a3', 'Long-lived promise', { carriedFrom: { meetingId: 'm2', actionId: 'a2' }, due: '2026-10-15' }),
          action('a4', 'Dropped on purpose', { dropped: true, droppedOn: '2026-10-10', droppedReason: 'Scope cut' }),
          action('a5', 'Closed on the board', { done: true, completedOn: '2026-10-12' }),
        ],
      },
    ],
  }, { now: NOW }).state;

  const open = openActions(state, { now: NOW });
  assert.equal(open.length, 1, 'only the live copy of the promise is open');
  assert.equal(open[0].text, 'Long-lived promise');
  assert.equal(open[0].carryCount, 2);
  assert.equal(open[0].firstAgreedOn, '2026-09-20', 'the original agreement date travels with the promise');
  assert.equal(open[0].overdue, true);
  assert.equal(open[0].completedInMeetingId, null);

  const index = followThroughIndex(state);
  assert.equal(index.get('m3|a3').depth, 2);
  assert.equal(index.get('m3|a3').firstAgreedOn, '2026-09-20');

  const counts = commitmentCounts(state, NOW);
  assert.equal(counts.open, 1);
  assert.equal(counts.overdue, 1);
  assert.equal(counts.carriedOpen, 1);
  assert.equal(counts.maxCarry, 2);
  assert.equal(counts.done, 1);
  assert.equal(counts.dropped, 1);
  assert.equal(counts.carriedForward, 2, 'both originals are closed by a carry');

  assert.deepEqual(
    reconciliationCandidates(state, 'p1', '2026-10-05', NOW).map((c) => c.actionId),
    [],
    'a promise whose meeting is later cannot be settled by an earlier conversation',
  );
  const nowCandidates = reconciliationCandidates(state, 'p1', '2026-10-20', NOW);
  assert.deepEqual(nowCandidates.map((c) => c.actionId), ['a3']);
  assert.equal(nowCandidates[0].carryCount, 2, 'the live copy still knows it survived two conversations');
});

/* ------------------------------------------------------------- write path */

test('logging a 1:1 records done, carried, dropped and untouched promises atomically', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Mei Chen' }).id;
  const first = h.api.logOneOnOne({
    personId,
    date: '2026-09-28',
    status: 'held',
    notes: 'Worked through the migration plan and who owns each piece',
    actions: [
      { text: 'Publish the runbook', due: '2026-10-05' },
      { text: 'Get legal sign-off', due: '2026-10-06' },
      { text: 'Cancel the old dashboard', due: '2026-10-07' },
    ],
  });
  assert.equal(first.ok, true);
  const meeting1 = h.store.state.oneOnOnes[0];
  const [runbook, legal, dashboard] = meeting1.actions;

  const second = h.api.logOneOnOne({
    personId,
    date: '2026-10-10',
    status: 'held',
    notes: 'Runbook shipped; legal is stuck on the retention clause',
    actions: [{ text: 'Book the retention review', due: '2026-10-17' }],
    reconciliations: [
      { meetingId: meeting1.id, actionId: runbook.id, outcome: 'done' },
      { meetingId: meeting1.id, actionId: legal.id, outcome: 'carried', due: '2026-10-24' },
      { meetingId: meeting1.id, actionId: dashboard.id, outcome: 'dropped', reason: 'Product decided to keep it' },
    ],
  });
  assert.equal(second.ok, true);
  assert.deepEqual(
    { closed: second.closed, carried: second.carried, dropped: second.dropped },
    { closed: 1, carried: 1, dropped: 1 },
  );

  // store.update replaces the state object, so re-read the records by id
  // instead of holding a reference into the previous revision.
  const state = h.store.state;
  const meeting2 = state.oneOnOnes.find((m) => m.id === second.id);
  const source = state.oneOnOnes.find((m) => m.id === meeting1.id);
  const runbookAfter = source.actions.find((a) => a.id === runbook.id);
  const legalAfter = source.actions.find((a) => a.id === legal.id);
  const dashboardAfter = source.actions.find((a) => a.id === dashboard.id);
  assert.equal(runbookAfter.done, true);
  assert.equal(runbookAfter.completedOn, '2026-10-10');
  assert.equal(runbookAfter.completedInMeetingId, meeting2.id);

  assert.equal(legalAfter.carriedToMeetingId, meeting2.id);
  const successor = meeting2.actions.find((a) => a.carriedFrom?.actionId === legal.id);
  assert.ok(successor, 'the carried promise is a new action in the meeting that moved it');
  assert.equal(successor.due, '2026-10-24');
  assert.equal(successor.text, 'Get legal sign-off', 'text is copied, not re-typed');
  assert.equal(legalAfter.carriedToActionId, successor.id);

  assert.equal(dashboardAfter.dropped, true);
  assert.equal(dashboardAfter.droppedOn, '2026-10-10');
  assert.equal(dashboardAfter.droppedReason, 'Product decided to keep it');
  assert.equal(dashboardAfter.droppedInMeetingId, meeting2.id);

  const ledger = reconciledInMeeting(state, meeting2.id);
  assert.deepEqual(ledger.closed.map((a) => a.id), [runbook.id]);
  assert.deepEqual(ledger.carriedIn.map((a) => a.id), [successor.id]);
  assert.deepEqual(ledger.dropped.map((a) => a.id), [dashboard.id]);

  const open = openActions(state, { now: NOW });
  assert.deepEqual(open.map((a) => a.text).sort(), ['Book the retention review', 'Get legal sign-off'].sort());
  const carriedRow = open.find((a) => a.carryCount === 1);
  assert.equal(carriedRow.firstAgreedOn, '2026-09-28');
  assert.equal(carriedRow.overdue, false, 'due today is due, not late');

  assert.match(state.events.at(-1).summary, /1 promise closed, 1 carried forward, 1 dropped/);

  // The same decisions survive export → import, including the chain.
  const exported = h.store.exportJSON();
  const round = harness();
  const imported = round.store.importJSON(exported);
  assert.equal(imported.ok, true);
  const reloadedOpen = openActions(round.store.state, { now: NOW });
  assert.deepEqual(reloadedOpen.map((a) => [a.text, a.carryCount, a.firstAgreedOn]).sort(), [
    ['Book the retention review', 0, '2026-10-10'],
    ['Get legal sign-off', 1, '2026-09-28'],
  ].sort());
});

test('the write path refuses reconciliations it cannot honestly record', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Ada' }).id;
  const otherId = h.api.addPerson({ name: 'Grace' }).id;
  h.api.logOneOnOne({ personId, date: '2026-10-01', status: 'held', notes: 'First substantive conversation about scope', actions: [{ text: 'Publish the plan', due: '2026-10-05' }] });
  const meeting = h.store.state.oneOnOnes[0];
  const target = meeting.actions[0];
  const base = { personId, date: '2026-10-10', status: 'held', notes: 'Reviewed progress and next steps together' };

  assert.match(h.api.logOneOnOne({ ...base, date: '2026-10-30', reconciliations: [] }).error, /before it has happened/);
  assert.match(h.api.logOneOnOne({ ...base, date: '2026-02-31' }).error, /valid meeting date/);
  assert.match(
    h.api.logOneOnOne({ ...base, status: 'skipped', reconciliations: [{ meetingId: meeting.id, actionId: target.id, outcome: 'done' }] }).error,
    /Only a 1:1 that was held/,
  );
  assert.match(
    h.api.logOneOnOne({ ...base, personId: otherId, reconciliations: [{ meetingId: meeting.id, actionId: target.id, outcome: 'done' }] }).error,
    /person it was agreed with/,
  );
  assert.match(
    h.api.logOneOnOne({ ...base, date: '2026-09-30', reconciliations: [{ meetingId: meeting.id, actionId: target.id, outcome: 'done' }] }).error,
    /happened before it was made/,
  );
  assert.match(
    h.api.logOneOnOne({ ...base, reconciliations: [{ meetingId: meeting.id, actionId: target.id, outcome: 'shrug' }] }).error,
    /done, still open, carried forward or dropped/,
  );
  assert.match(
    h.api.logOneOnOne({ ...base, reconciliations: [{ meetingId: meeting.id, actionId: target.id, outcome: 'carried', due: '2026-10-01' }] }).error,
    /cannot be due before the 1:1/,
  );
  assert.match(
    h.api.logOneOnOne({
      ...base,
      reconciliations: [
        { meetingId: meeting.id, actionId: target.id, outcome: 'done' },
        { meetingId: meeting.id, actionId: target.id, outcome: 'done' },
      ],
    }).error,
    /listed twice/,
  );
  assert.equal(h.store.state.oneOnOnes.length, 1, 'every rejected attempt wrote nothing');
  assert.equal(h.store.state.oneOnOnes[0].actions[0].done, false);
});

test('board completion is a report, and carried or dropped copies can no longer be toggled', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Ada' }).id;
  h.api.logOneOnOne({ personId, date: '2026-10-01', status: 'held', notes: 'Set the plan and the review rhythm for the quarter', actions: [{ text: 'Publish the plan' }, { text: 'Book the review' }] });
  const m1 = h.store.state.oneOnOnes[0];
  const [first, second] = m1.actions;

  h.api.logOneOnOne({
    personId, date: '2026-10-08', status: 'held', notes: 'Moved one promise and dropped the other with a reason',
    reconciliations: [
      { meetingId: m1.id, actionId: first.id, outcome: 'carried', due: '2026-10-20' },
      { meetingId: m1.id, actionId: second.id, outcome: 'dropped', reason: 'No longer needed' },
    ],
  });
  const afterCarry = h.api.toggleMeetingAction(m1.id, first.id);
  assert.equal(afterCarry.ok, false);
  assert.match(afterCarry.error, /carried forward to a later 1:1/);
  assert.match(h.api.toggleMeetingAction(m1.id, second.id).error, /explicitly dropped/);

  const m2 = h.store.state.oneOnOnes[1];
  const successor = m2.actions[0];
  assert.equal(h.api.toggleMeetingAction(m2.id, successor.id).ok, true);
  const done = h.store.state.oneOnOnes[1].actions[0];
  assert.equal(done.done, true);
  assert.equal(done.completedOn, '2026-10-24');
  assert.equal(done.completedInMeetingId, null, 'ticking a box outside a 1:1 does not claim one');
  assert.equal(h.api.toggleMeetingAction(m2.id, successor.id).ok, true);
  assert.equal(h.store.state.oneOnOnes[1].actions[0].done, false);
});

test('a historical snapshot reopens promises that were settled after that date', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Ada' }).id;
  h.api.logOneOnOne({
    personId, date: '2026-09-20', status: 'held', notes: 'Agreed three things and wrote them down with owners',
    actions: [{ text: 'Ship the runbook' }, { text: 'Get legal sign-off' }, { text: 'Cancel the old dashboard' }],
  });
  const m1 = h.store.state.oneOnOnes[0];
  const [ship, legal, cancel] = m1.actions;
  h.api.logOneOnOne({
    personId, date: '2026-10-10', status: 'held', notes: 'Closed one, moved one and dropped one with a reason',
    reconciliations: [
      { meetingId: m1.id, actionId: ship.id, outcome: 'done' },
      { meetingId: m1.id, actionId: legal.id, outcome: 'carried', due: '2026-10-24' },
      { meetingId: m1.id, actionId: cancel.id, outcome: 'dropped', reason: 'Product kept it' },
    ],
  });

  const snapshot = reconstructStateAt(h.store.state, '2026-10-01', { currentDay: '2026-10-24' });
  assert.equal(snapshot.state.oneOnOnes.length, 1, 'the October meeting did not exist yet');
  const actions = snapshot.state.oneOnOnes[0].actions;
  assert.equal(actions.find((a) => a.id === ship.id).done, false, 'completion is rewound');
  assert.equal(actions.find((a) => a.id === ship.id).completedInMeetingId, null);
  assert.equal(actions.find((a) => a.id === legal.id).carriedToMeetingId, null, 'carry is rewound');
  assert.equal(actions.find((a) => a.id === cancel.id).dropped, false, 'drop is rewound');
  assert.equal(actions.find((a) => a.id === cancel.id).droppedReason, '');
  assert.equal(
    openActions(snapshot.state, { now: new Date('2026-10-01T10:00:00Z') }).length,
    3,
    'all three promises were still open on 1 October',
  );
  assert.equal(openActions(h.store.state, { now: NOW }).length, 1, 'the present-day state is untouched');
});

/* -------------------------------------------------------------- signals */

test('CONV-06 fires only when a promise has already survived two conversations', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Ada' }).id;
  h.api.logOneOnOne({ personId, date: '2026-09-20', status: 'held', notes: 'First pass at the retention decision and who owns it', actions: [{ text: 'Get legal sign-off', due: '2026-09-25' }] });
  const m1 = h.store.state.oneOnOnes[0];
  const rules = () => new Set(buildInsights(h.store.state, NOW).findings.map((f) => f.ruleId));

  h.api.logOneOnOne({ personId, date: '2026-10-01', status: 'held', notes: 'Checked the sign-off and what is actually blocking it', reconciliations: [{ meetingId: m1.id, actionId: m1.actions[0].id, outcome: 'carried', due: '2026-10-10' }] });
  assert.equal(rules().has('CONV-06'), false, 'one carry is patience, not a pattern');

  const m2 = h.store.state.oneOnOnes[1];
  h.api.logOneOnOne({ personId, date: '2026-10-12', status: 'held', notes: 'Still blocked; named the blocker and the owner of it', reconciliations: [{ meetingId: m2.id, actionId: m2.actions[0].id, outcome: 'carried', due: '2026-10-20' }] });
  const finding = buildInsights(h.store.state, NOW).findings.find((f) => f.ruleId === 'CONV-06');
  assert.ok(finding, 'CONV-06 fires after two carries');
  assert.equal(finding.severity, 4);
  assert.equal(finding.personId, personId);
  assert.match(finding.evidence[0], /carried 2× since 2026-09-20/);
  assert.equal(finding.action.route, '#/oneonones');

  const m3 = h.store.state.oneOnOnes[2];
  h.api.logOneOnOne({ personId, date: '2026-10-20', status: 'held', notes: 'Sign-off arrived and the promise is finally closed', reconciliations: [{ meetingId: m3.id, actionId: m3.actions[0].id, outcome: 'done' }] });
  assert.equal(rules().has('CONV-06'), false, 'closing it clears the signal');
  assert.ok(buildWins(h.store.state, NOW).some((w) => w.title.includes('promises closed in a 1:1')) === false, 'one completion is not a win yet');
});

test('prep sheet marks a promise that was carried forward and the CSV keeps the same facts', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Mei' }).id;
  h.api.logOneOnOne({ personId, date: '2026-09-20', status: 'held', notes: 'Agreed the legal review and the data-retention scope', actions: [{ text: 'Get legal sign-off', due: '2026-09-28' }] });
  const m1 = h.store.state.oneOnOnes[0];
  h.api.logOneOnOne({ personId, date: '2026-10-10', status: 'held', notes: 'Carried the sign-off forward because legal was away', reconciliations: [{ meetingId: m1.id, actionId: m1.actions[0].id, outcome: 'carried', due: '2026-10-30' }] });

  const sheet = buildPrepSheet(h.store.state, personId, NOW, h.store.state.settings);
  assert.equal(sheet.commitments.actions.length, 1);
  assert.equal(sheet.commitments.actions[0].carryCount, 1);
  assert.equal(sheet.commitments.actions[0].firstAgreedOn, '2026-09-20');
  assert.equal(sheet.sinceLast.openActions.length, 1, 'only live promises appear in the last-meeting recap');

  const actionsCsv = exportWorkspaceCsv(h.store.state, 'actions', { now: NOW });
  assert.equal(actionsCsv.ok, true);
  const parsed = parseCsv(actionsCsv.csv);
  assert.equal(parsed.headers.length, actionsCsv.columnCount);
  const rowFor = (text) => parsed.rows.find((row) => row[parsed.headers.indexOf('commitment')] === text);
  const original = rowFor('Get legal sign-off');
  const rows = parsed.rows.filter((row) => row[parsed.headers.indexOf('commitment')] === 'Get legal sign-off');
  assert.equal(rows.length, 2, 'both the original and its successor are exported');
  const states = rows.map((row) => row[parsed.headers.indexOf('state')]).sort();
  assert.deepEqual(states, ['carried-forward', 'open']);
  assert.equal(original[parsed.headers.indexOf('first_agreed_on')], '2026-09-20');
  const successor = rows.find((row) => row[parsed.headers.indexOf('state')] === 'open');
  assert.equal(successor[parsed.headers.indexOf('carried_forward_count')], '1');
  assert.equal(successor[parsed.headers.indexOf('due_on')], '2026-10-30');

  const meetingCsv = exportWorkspaceCsv(h.store.state, 'oneOnOnes', { now: NOW });
  const meetings = parseCsv(meetingCsv.csv);
  const latest = meetings.rows.find((row) => row[meetings.headers.indexOf('date')] === '2026-10-10');
  assert.equal(latest[meetings.headers.indexOf('open_actions')], '1', 'the carried copy is open');
  assert.equal(latest[meetings.headers.indexOf('carried_in')], '1', 'this meeting inherited one promise');
  assert.equal(latest[meetings.headers.indexOf('carried_out')], '0');
  assert.equal(latest[meetings.headers.indexOf('completed_actions')], '0');
  const firstMeeting = meetings.rows.find((row) => row[meetings.headers.indexOf('date')] === '2026-09-20');
  assert.equal(firstMeeting[meetings.headers.indexOf('carried_out')], '1', 'the original was moved, not left open');
  assert.equal(firstMeeting[meetings.headers.indexOf('open_actions')], '0');
});

/* ------------------------------------------------------------------- UI */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (String(error?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(error.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

function click(node) {
  assert.ok(node, 'expected a clickable node');
  node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function setValue(input, value) {
  assert.ok(input, 'expected a form control');
  if (input.type === 'radio' || input.type === 'checkbox') input.checked = Boolean(value);
  else input.value = String(value);
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

function buttonByText(env, text, scope = env.document) {
  return [...scope.querySelectorAll('button, a')].find((el) => el.textContent.trim().toLowerCase().includes(text.toLowerCase()));
}

test('the 1:1 dialog reconciles a promise, carries it forward, then closes it face to face', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });
  try {
    const { id: personId } = app.api.addPerson({ name: 'Mei Chen' });
    const first = app.api.logOneOnOne({
      personId, date: '2026-10-01', status: 'held',
      notes: 'Agreed who would chase legal and what "done" means',
      actions: [{ text: 'Get legal sign-off', due: '2026-10-08' }],
    });
    assert.equal(first.ok, true);
    const original = app.store.state.oneOnOnes[0].actions[0];

    app.navigate('#/oneonones');
    click(buttonByText(env, 'Log a 1:1', env.document.getElementById('view')));
    let dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'the dialog opened');
    assert.ok(dialog.textContent.includes('Get legal sign-off'), 'the open promise is in front of the leader');
    assert.match(dialog.textContent, /1 open commitment · 1 overdue/);

    setValue(dialog.querySelector('input[name="date"]'), '2026-10-12');
    const row = dialog.querySelector('.recon-row');
    setValue(row.querySelector('input[value="carried"]'), true);
    const dueInput = row.querySelector('.recon-extra input[type="date"]');
    assert.ok(dueInput, 'choosing carry forward asks for a new date');
    setValue(dueInput, '2026-10-26');
    setValue(dialog.querySelector('textarea[name="notes"]'), 'Legal was away; agreed to escalate through Priya and keep the clause.');

    if (!env.window.axe) env.window.eval(AXE_SRC);
    const axe = await env.window.axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } });
    assert.equal(axe.violations.length, 0, JSON.stringify(axe.violations.map((v) => v.id)));

    click(dialog.querySelector('.modal-foot .btn-primary'));
    assert.equal(app.store.state.oneOnOnes.length, 2);
    const second = app.store.state.oneOnOnes[1];
    assert.equal(second.actions.length, 1);
    assert.equal(second.actions[0].carriedFrom.actionId, original.id);
    assert.equal(app.store.state.oneOnOnes[0].actions[0].carriedToMeetingId, second.id);

    app.navigate('#/oneonones');
    let view = env.document.getElementById('view');
    assert.ok(view.textContent.includes('carried 1×'), 'the board shows how often it has moved');
    assert.ok(view.textContent.includes('Commitments that keep moving'), 'the follow-through card surfaces it');

    // Next conversation: close it.
    click(buttonByText(env, 'Log a 1:1', view));
    dialog = env.document.querySelector('[role="dialog"]');
    setValue(dialog.querySelector('input[name="date"]'), '2026-10-20');
    const closeRow = dialog.querySelector('.recon-row');
    assert.ok(closeRow.textContent.includes('carried forward 1×'));
    setValue(closeRow.querySelector('input[value="done"]'), true);
    setValue(dialog.querySelector('textarea[name="notes"]'), 'Legal signed off; the clause ships with the migration.');
    click(dialog.querySelector('.modal-foot .btn-primary'));

    const third = app.store.state.oneOnOnes[2];
    const closed = app.store.state.oneOnOnes[1].actions[0];
    assert.equal(closed.done, true);
    assert.equal(closed.completedOn, '2026-10-20');
    assert.equal(closed.completedInMeetingId, third.id);
    assert.equal(openActions(app.store.state, { now: NOW }).length, 0);

    app.navigate('#/oneonones');
    view = env.document.getElementById('view');
    assert.ok(view.textContent.includes('No open promises'));
    assert.ok(view.textContent.includes('closed 1'), 'the meeting history records what it settled');
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
});

test('person page and prep sheet show how long a promise has been moving', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });
  try {
    const { id: personId } = app.api.addPerson({ name: 'Mei Chen' });
    const first = app.api.logOneOnOne({
      personId, date: '2026-09-20', status: 'held',
      notes: 'Agreed who owns the legal review and by when',
      actions: [{ text: 'Get legal sign-off', due: '2026-09-30' }],
    });
    const original = app.store.state.oneOnOnes[0].actions[0];
    const second = app.api.logOneOnOne({
      personId, date: '2026-10-05', status: 'held', notes: 'Legal was away; moved it with a firm date',
      reconciliations: [{ meetingId: first.id, actionId: original.id, outcome: 'carried', due: '2026-10-24' }],
    });
    assert.equal(second.ok, true);
    assert.equal(second.carried, 1);

    app.navigate(`#/people/${personId}`);
    let view = env.document.getElementById('view');
    const personText = view.textContent.replace(/\s+/g, ' ');
    assert.match(personText, /carried forward/, 'the person page names the follow-through state');
    assert.match(personText, /→ carried forward/, 'the original action is marked as moved, not silently open');

    app.navigate(`#/prep/${personId}`);
    view = env.document.getElementById('view');
    const prepText = view.textContent.replace(/\s+/g, ' ');
    assert.match(prepText, /carried forward 1× since/, 'the printable sheet shows the age of the promise');
    assert.ok(prepText.includes('Get legal sign-off'));

    if (!env.window.axe) env.window.eval(AXE_SRC);
    const axe = await env.window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.equal(axe.violations.length, 0, JSON.stringify(axe.violations.map((v) => v.id)));

    const counts = commitmentCounts(app.store.state, NOW);
    assert.equal(counts.carriedOpen, 1);
    assert.equal(counts.open, 1);
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
});

test('Day 30/60/90 manager follow-up is explicit, phase/date-bound, separately owned, and reconciles through real 1:1s', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Mina Patel', startDate: '2026-09-01' }).id;
  const created = h.api.createOnboardingPlan({ personId, startDate: '2026-09-01', useTemplate: true });
  assert.equal(created.ok, true);
  assert.equal(h.api.recordOnboardingReview(created.id, {
    horizon: 30,
    heldOn: '2026-10-10',
    summary: 'Role boundaries are clearer after pairing.',
    blockers: 'CONFIDENTIAL_BLOCKER: access requests have been ignored.',
  }).ok, true);
  const checkin = h.store.state.onboarding.find((plan) => plan.id === created.id).reviews[30];
  assert.equal(h.store.state.managerSupport.length, 0, 'recording candid notes does not silently create a task');

  assert.equal(h.api.addManagerSupportCommitment({
    planId: created.id, horizon: 30, checkinId: 'wrong-checkin',
    text: 'Schedule the systems walkthrough', due: '2026-10-30',
  }).ok, false, 'the source check-in identity is verified');
  assert.equal(h.api.addManagerSupportCommitment({
    planId: created.id, horizon: 30, checkinId: checkin.id,
    text: 'Schedule the systems walkthrough', due: '2026-10-09',
  }).ok, false, 'a follow-up cannot predate its source check-in');
  const added = h.api.addManagerSupportCommitment({
    planId: created.id, horizon: 30, checkinId: checkin.id,
    text: 'Schedule the systems walkthrough', due: '2026-10-30',
  });
  assert.equal(added.ok, true);
  const original = h.store.state.managerSupport[0];
  assert.equal(original.owner, 'leader');
  assert.equal(original.sourcePlanId, created.id);
  assert.equal(original.sourceCheckinId, checkin.id);
  assert.equal(original.sourceHorizon, 30);
  assert.equal(original.sourceHeldOn, '2026-10-10');
  assert.equal(original.text.includes('CONFIDENTIAL_BLOCKER'), false);

  // Correcting the check-in later preserves its identity and the manager
  // commitment's exact source-date snapshot.
  assert.equal(h.api.recordOnboardingReview(created.id, {
    horizon: 30,
    heldOn: '2026-10-11',
    summary: 'Role boundaries are clearer after pairing; corrected date.',
    blockers: 'CONFIDENTIAL_BLOCKER: access requests have been ignored.',
  }).ok, true);
  const revised = h.store.state.onboarding.find((plan) => plan.id === created.id).reviews[30];
  assert.equal(revised.id, checkin.id);
  assert.equal(h.store.state.managerSupport[0].sourceHeldOn, '2026-10-10');

  const candidate = reconciliationCandidates(h.store.state, personId, '2026-10-24', NOW)
    .find((item) => item.sourceType === 'managerSupport');
  assert.equal(candidate.managerSupportId, added.id);
  assert.equal(candidate.sourcePlanId, created.id);
  const firstMeeting = h.api.logOneOnOne({
    personId,
    date: '2026-10-24',
    status: 'held',
    notes: 'Confirmed that I will arrange access and the systems walkthrough.',
    reconciliations: [{
      sourceType: 'managerSupport', managerSupportId: added.id,
      outcome: 'carried', due: '2026-10-31',
    }],
  });
  assert.equal(firstMeeting.ok, true);
  const records = h.store.state.managerSupport;
  assert.equal(records[0].status, 'carried');
  assert.equal(records[0].carriedInMeetingId, firstMeeting.id);
  const successor = records.find((item) => item.carriedFromId === original.id);
  assert.ok(successor);
  assert.equal(successor.sourceCheckinId, checkin.id, 'the carry keeps the original check-in provenance');
  assert.equal(successor.sourceHeldOn, '2026-10-10');
  assert.equal(successor.carriedFromMeetingId, firstMeeting.id);

  const secondMeeting = h.api.logOneOnOne({
    personId,
    date: '2026-10-24',
    status: 'held',
    notes: 'The systems walkthrough has been scheduled and the access path is clear.',
    reconciliations: [{
      sourceType: 'managerSupport', managerSupportId: successor.id, outcome: 'done',
    }],
  });
  assert.equal(secondMeeting.ok, true);
  const completed = h.store.state.managerSupport.find((item) => item.id === successor.id);
  assert.equal(completed.status, 'done');
  assert.equal(completed.completedInMeetingId, secondMeeting.id);
  assert.equal(openActions(h.store.state, { now: NOW }).some((item) => item.sourceType === 'managerSupport'), false);
  assert.equal(reconciledInMeeting(h.store.state, firstMeeting.id).carriedIn.length, 1);
  assert.equal(reconciledInMeeting(h.store.state, firstMeeting.id).carriedOut.length, 1);
  assert.equal(reconciledInMeeting(h.store.state, secondMeeting.id).closed.some((item) => item.id === successor.id), true);

  const toDrop = h.api.addManagerSupportCommitment({
    planId: created.id, horizon: 30, checkinId: checkin.id,
    text: 'Send the optional reference sheet', due: '2026-11-01',
  });
  assert.equal(toDrop.ok, true);
  const thirdMeeting = h.api.logOneOnOne({
    personId, date: '2026-10-24', status: 'held', notes: 'The person already has the relevant reference.',
    reconciliations: [{
      sourceType: 'managerSupport', managerSupportId: toDrop.id,
      outcome: 'dropped', reason: 'No longer needed after the walkthrough.',
    }],
  });
  assert.equal(thirdMeeting.ok, true);
  const dropped = h.store.state.managerSupport.find((item) => item.id === toDrop.id);
  assert.equal(dropped.status, 'dropped');
  assert.equal(dropped.droppedReason, 'No longer needed after the walkthrough.');
  assert.equal(dropped.droppedInMeetingId, thirdMeeting.id);
  assert.equal(reconciledInMeeting(h.store.state, thirdMeeting.id).dropped.some((item) => item.id === toDrop.id), true);
  assert.equal(h.api.toggleManagerSupportCommitment(toDrop.id, { done: true }).ok, false);

  const evidence = buildReviewEvidence(h.store.state, personId, '2026-10-01', '2026-10-31');
  assert.equal(evidence.some((item) => item.sourceId === original.id || item.sourceId === successor.id), false);
  assert.equal(JSON.stringify(evidence).includes('CONFIDENTIAL_BLOCKER'), false);
  assert.equal(JSON.stringify(evidence).includes('Schedule the systems walkthrough'), false);

  const actionsCsv = exportWorkspaceCsv(h.store.state, 'actions', { now: NOW });
  assert.equal(actionsCsv.ok, true);
  const parsed = parseCsv(actionsCsv.csv);
  const column = (key) => parsed.headers.indexOf(key);
  const exportRow = parsed.rows.find((row) => row[column('source_id')] === successor.id);
  assert.ok(exportRow);
  assert.equal(exportRow[column('source_type')], 'Manager support');
  assert.equal(exportRow[column('source_checkin_id')], checkin.id);
  assert.equal(exportRow[column('source_plan_id')], created.id);
  assert.equal(exportRow[column('source_horizon')], '30');
  assert.equal(exportRow[column('source_held_on')], '2026-10-10');
  assert.equal(exportRow[column('confirmed_in_meeting')], secondMeeting.id);

  const historical = JSON.parse(JSON.stringify(h.store.state));
  const prior = historical.managerSupport.find((item) => item.id === original.id);
  const live = historical.managerSupport.find((item) => item.id === successor.id);
  prior.addedOn = '2026-10-12';
  prior.createdAt = '2026-10-12T09:00:00.000Z';
  prior.carriedOn = '2026-10-14';
  live.addedOn = '2026-10-15';
  live.createdAt = '2026-10-15T09:00:00.000Z';
  live.completedOn = '2026-10-20';
  const snapshot = reconstructStateAt(historical, '2026-10-16', { currentDay: '2026-10-24' }).state;
  assert.equal(snapshot.managerSupport.find((item) => item.id === prior.id).status, 'carried');
  const snapshotLive = snapshot.managerSupport.find((item) => item.id === live.id);
  assert.equal(snapshotLive.status, 'open', 'completion after the historical date is rewound');
  assert.equal(snapshotLive.completedOn, null);
  assert.equal(snapshotLive.sourceCheckinId, checkin.id);
});
