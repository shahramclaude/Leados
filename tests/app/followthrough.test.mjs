import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeState } from '../../app/core/schema.js';
import { allActions, followThroughStats, previousMeetingCommitments, suggestAgenda } from '../../app/core/domain/oneonone.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';

test('schema normalizes action status with backward compatibility for legacy done: boolean', () => {
  const raw = {
    people: [{ id: 'p1', name: 'Dev 1' }],
    oneOnOnes: [
      {
        id: 'oo1',
        personId: 'p1',
        date: '2026-10-01',
        actions: [
          { id: 'a1', text: 'Task 1', done: true, completedOn: '2026-10-03' },
          { id: 'a2', text: 'Task 2', done: false },
          { id: 'a3', text: 'Task 3', status: 'dropped', dropReason: 'Scope change' },
          { id: 'a4', text: 'Task 4', status: 'completed', completedOn: '2026-10-04' },
        ],
      },
    ],
  };

  const { state } = normalizeState(raw);
  const actions = state.oneOnOnes[0].actions;

  assert.equal(actions.length, 4);
  assert.equal(actions[0].status, 'completed');
  assert.equal(actions[0].done, true);
  assert.equal(actions[0].completedOn, '2026-10-03');

  assert.equal(actions[1].status, 'open');
  assert.equal(actions[1].done, false);
  assert.equal(actions[1].completedOn, null);

  assert.equal(actions[2].status, 'dropped');
  assert.equal(actions[2].done, false);
  assert.equal(actions[2].dropReason, 'Scope change');

  assert.equal(actions[3].status, 'completed');
  assert.equal(actions[3].done, true);
});

test('previousMeetingCommitments identifies commitments needing reconciliation strictly prior to reference date', () => {
  const state = {
    people: [{ id: 'p1', name: 'Dev 1', status: 'active' }],
    oneOnOnes: [
      {
        id: 'm1',
        personId: 'p1',
        date: '2026-10-01',
        status: 'held',
        actions: [
          { id: 'a1', text: 'Fix bug', due: '2026-10-05', done: true, completedOn: '2026-10-04' },
          { id: 'a2', text: 'Write docs', due: '2026-10-08', done: false },
        ],
      },
      {
        id: 'm2',
        personId: 'p1',
        date: '2026-10-15',
        status: 'held',
        actions: [
          { id: 'a3', text: 'Design refactor', due: '2026-10-20', done: false },
        ],
      },
    ],
  };

  const now = new Date('2026-10-24T10:00:00Z');

  // When meeting on 2026-10-15, previous meeting should be m1 (from 2026-10-01)
  const reconM2 = previousMeetingCommitments(state, 'p1', '2026-10-15', now);
  assert.equal(reconM2.previousMeeting.id, 'm1');
  assert.equal(reconM2.total, 2);
  assert.equal(reconM2.pending.length, 1);
  assert.equal(reconM2.pending[0].id, 'a2');
  assert.equal(reconM2.completed.length, 1);
  assert.equal(reconM2.allDone, false);
  assert.equal(reconM2.hasPending, true);

  // When planning next meeting with no reference date, previous meeting is m2 (latest held)
  const reconLatest = previousMeetingCommitments(state, 'p1', null, now);
  assert.equal(reconLatest.previousMeeting.id, 'm2');
  assert.equal(reconLatest.total, 1);
  assert.equal(reconLatest.pending.length, 1);
  assert.equal(reconLatest.pending[0].id, 'a3');
});

test('followThroughStats calculates promise integrity rate, on-time rate, and average latency honest to non-fabrication', () => {
  const emptyState = {
    settings: {},
    people: [{ id: 'p1', name: 'Dev 1', status: 'active' }],
    oneOnOnes: [],
  };

  const emptyStats = followThroughStats(emptyState, 'p1');
  assert.equal(emptyStats.total, 0);
  assert.equal(emptyStats.promiseIntegrityRate, null); // Non-fabrication: null, not 0% or 100%
  assert.equal(emptyStats.onTimeCompletionRate, null);
  assert.equal(emptyStats.avgDaysToResolve, null);

  const populatedState = {
    settings: {},
    people: [{ id: 'p1', name: 'Dev 1', status: 'active' }],
    oneOnOnes: [
      {
        id: 'm1',
        personId: 'p1',
        date: '2026-10-01',
        status: 'held',
        actions: [
          { id: 'a1', text: 'Task 1', due: '2026-10-05', status: 'completed', done: true, completedOn: '2026-10-04' }, // on time (3 days)
          { id: 'a2', text: 'Task 2', due: '2026-10-05', status: 'completed', done: true, completedOn: '2026-10-08' }, // late (7 days)
          { id: 'a3', text: 'Task 3', due: '2026-10-05', status: 'dropped', dropReason: 'Deprecated' }, // dropped
          { id: 'a4', text: 'Task 4', due: '2026-10-25', status: 'open', done: false }, // open
        ],
      },
    ],
  };

  const now = new Date('2026-10-24T10:00:00Z');
  const stats = followThroughStats(populatedState, 'p1', now);

  assert.equal(stats.total, 4);
  assert.equal(stats.open, 1);
  assert.equal(stats.completed, 2);
  assert.equal(stats.dropped, 1);
  assert.equal(stats.resolved, 3);
  // Promise integrity: 2 completed / 3 resolved = 67%
  assert.equal(stats.promiseIntegrityRate, 67);
  // On-time rate: 1 of 2 completed on time = 50%
  assert.equal(stats.onTimeCompletionRate, 50);
  // Average days to resolve: (3 + 7) / 2 = 5.0
  assert.equal(stats.avgDaysToResolve, 5.0);
});

test('suggestAgenda includes previous meeting commitment reconciliation when pending items exist', () => {
  const state = {
    settings: { oneOnOneCadenceDays: 7 },
    people: [{ id: 'p1', name: 'Dev 1', status: 'active' }],
    oneOnOnes: [
      {
        id: 'm1',
        personId: 'p1',
        date: '2026-10-20',
        status: 'held',
        actions: [{ id: 'a1', text: 'Review architecture RFC', due: '2026-10-25', done: false, status: 'open' }],
      },
    ],
    goals: [],
    delegations: [],
    growthPlans: [],
    feedback: [],
    recognition: [],
  };

  const now = new Date('2026-10-24T10:00:00Z');
  const suggestions = suggestAgenda(state, 'p1', now, state.settings);

  const reconSuggestion = suggestions.find((s) => s.source === 'reconciliation');
  assert.ok(reconSuggestion, 'Expected reconciliation agenda suggestion');
  assert.match(reconSuggestion.text, /Review prior 1:1 commitments/);
  assert.match(reconSuggestion.text, /Review architecture RFC/);
});

test('actions API supports individual and batch commitment resolution', () => {
  const memoryStore = {
    storage: new Map(),
    getItem(k) { return this.storage.get(k) || null; },
    setItem(k, v) { this.storage.set(k, String(v)); },
    removeItem(k) { this.storage.delete(k); },
  };

  const store = createStore({ storage: memoryStore });
  store.importJSON(JSON.stringify({
    schemaVersion: 5,
    people: [{ id: 'p1', name: 'Alex', status: 'active' }],
    oneOnOnes: [
      {
        id: 'm1',
        personId: 'p1',
        date: '2026-10-10',
        status: 'held',
        actions: [
          { id: 'act-1', text: 'Commitment A', status: 'open', done: false },
          { id: 'act-2', text: 'Commitment B', status: 'open', done: false },
        ],
      },
    ],
  }));

  const api = createApi(store, { now: () => new Date('2026-10-24T10:00:00Z') });

  // Resolve individual commitment as dropped
  const dropRes = api.resolveOneOnOneAction('act-1', { status: 'dropped', dropReason: 'No longer prioritized' });
  assert.equal(dropRes.ok, true);

  const act1 = store.state.oneOnOnes[0].actions.find((a) => a.id === 'act-1');
  assert.equal(act1.status, 'dropped');
  assert.equal(act1.done, false);
  assert.equal(act1.dropReason, 'No longer prioritized');

  // Batch reconcile during new 1:1 logging
  const logRes = api.logOneOnOne({
    personId: 'p1',
    date: '2026-10-24',
    status: 'held',
    actions: [{ text: 'New task for next week' }],
    reconciliations: [
      { id: 'act-2', status: 'completed' },
    ],
  });
  assert.equal(logRes.ok, true);

  const act2 = store.state.oneOnOnes[0].actions.find((a) => a.id === 'act-2');
  assert.equal(act2.status, 'completed');
  assert.equal(act2.done, true);
  assert.equal(act2.completedOn, '2026-10-24');
  assert.equal(act2.resolvedInMeetingId, logRes.id);
});

test('CSV actions export includes status and drop_reason columns', () => {
  const state = {
    settings: {},
    people: [{ id: 'p1', name: 'Alex' }],
    oneOnOnes: [
      {
        id: 'm1',
        personId: 'p1',
        date: '2026-10-15',
        actions: [
          { id: 'a1', text: 'Deploy service', status: 'dropped', dropReason: 'Replaced by managed service' },
          { id: 'a2', text: 'Run benchmarks', status: 'completed', completedOn: '2026-10-18', done: true },
        ],
      },
    ],
    growthPlans: [],
    feedback: [],
  };

  const { csv } = exportWorkspaceCsv(state, 'actions');
  assert.match(csv, /status,completed_on,drop_reason/);
  assert.match(csv, /dropped,,Replaced by managed service/);
  assert.match(csv, /completed,2026-10-18,/);
});
