/**
 * tests/app/growth-ledger.test.mjs — the development commitment ledger.
 *
 * Schema v9 stops treating a GROW "will" as a checklist. A commitment can be
 * moved (kept, with a new date), dropped on purpose (with a reason), or closed
 * in a recorded review. These tests cover the migration, the chain repair, the
 * write paths, the derived state, the two new signals, the export, the time
 * snapshot and the screens that have to show all of it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { migrate, normalizeState, createEmptyState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  carriedWillActions,
  isOpenWill,
  lastReview,
  openWillActions,
  planHealth,
  planProgress,
  reviewHistory,
  reviewedIn,
  reviewState,
  stagnationDays,
  willChain,
  willIndex,
  willState,
} from '../../app/core/domain/growth.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-24T10:00:00.000Z');
const TODAY = '2026-10-24';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness() {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-t-${++seq}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

function person(id, name) {
  return {
    id, name, role: 'Engineer', level: 'senior', team: 'Core', managerId: null,
    startDate: '2025-01-01', focus: '', status: 'active',
    createdAt: '2025-01-01T09:00:00.000Z', archivedAt: null,
  };
}

function will(id, text, overrides = {}) {
  return {
    id,
    text,
    due: '2026-11-01',
    addedOn: '2026-09-20',
    done: false,
    completedOn: null,
    completedInReviewId: null,
    dropped: false,
    droppedOn: null,
    droppedReason: '',
    droppedInReviewId: null,
    personId: 'p1',
    carriedFromId: null,
    carriedToId: null,
    carriedInReviewId: null,
    ...overrides,
  };
}

function plan(overrides = {}) {
  return {
    id: 'gp1',
    personId: 'p1',
    goal: 'Own cross-team technical direction, not just the hardest code.',
    reality: 'Strongest debugger on the team; the gap is written communication.',
    options: [{ id: 'opt1', text: 'Write a decision memo per design choice.' }],
    will: [will('w1', 'Publish the memo format')],
    competencies: ['Written communication'],
    reviews: [],
    reviewOn: '2026-11-07',
    reviewDeferrals: 0,
    reviewMovedOn: null,
    status: 'active',
    closedOn: null,
    createdAt: '2026-09-20T09:00:00.000Z',
    stagesUpdatedOn: null,
    ...overrides,
  };
}

/** A store holding exactly the records a test needs, normalized as v9. */
function seeded(plans, people = [person('p1', 'Mei Chen')]) {
  const h = harness();
  const state = { ...createEmptyState('2026-01-01T09:00:00.000Z'), schemaVersion: 9, people, growthPlans: plans };
  const imported = h.store.importJSON(JSON.stringify({ app: 'LeadOS', schemaVersion: 9, exportedAt: NOW.toISOString(), state }));
  assert.equal(imported.ok, true, imported.error);
  return h;
}

const planById = (h, id = 'gp1') => h.store.state.growthPlans.find((p) => p.id === id);

/* ------------------------------------------------------ schema & migration */

test('schema v8 → v9 adds a review ledger and leaves unknown history empty', () => {
  assert.equal(SCHEMA_VERSION, 15);

  const v8 = {
    schemaVersion: 8,
    people: [person('p1', 'Mei Chen')],
    growthPlans: [{
      id: 'gp1',
      personId: 'p1',
      goal: 'Own technical direction',
      reality: 'Strong debugger',
      options: [{ id: 'opt1', text: 'Write memos' }],
      will: [{ id: 'w1', text: 'Publish the memo format', due: '2026-11-01', done: false }],
      competencies: [],
      reviewOn: '2026-11-07',
      status: 'active',
      createdAt: '2026-09-20T09:00:00.000Z',
    }],
  };
  const snapshot = JSON.stringify(v8);
  const migrated = migrate(v8);
  assert.deepEqual(migrated.applied, ['8 → 9', '9 → 10', '10 → 11', '11 → 12', '12 → 13', '13 → 14', '14 → 15']);
  assert.equal(JSON.stringify(v8), snapshot, 'migration must never mutate its input');

  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.deepEqual(warnings, []);
  assert.equal(state.schemaVersion, 15);
  const migratedPlan = state.growthPlans[0];
  assert.deepEqual(migratedPlan.reviews, [], 'no review is invented');
  assert.equal(migratedPlan.reviewDeferrals, 0, 'a v8 file did not count deferrals');
  assert.equal(migratedPlan.reviewMovedOn, null);
  const migratedWill = migratedPlan.will[0];
  assert.equal(migratedWill.addedOn, null, 'the day it was agreed is unknown, not today');
  assert.equal(migratedWill.dropped, false);
  assert.equal(migratedWill.droppedReason, '');
  assert.equal(migratedWill.carriedFromId, null);
  assert.equal(migratedWill.carriedToId, null);
  assert.equal(isOpenWill(migratedWill), true);
});

test('a carry link that cannot be honoured is reopened, and the back-reference is rebuilt', () => {
  const raw = {
    schemaVersion: 9,
    people: [person('p1', 'Mei Chen')],
    growthPlans: [
      plan({ id: 'gp1', will: [will('orphan', 'Moved to a copy that no longer exists', { carriedToId: 'gone' })] }),
      plan({
        id: 'gp2',
        will: [
          will('a', 'Original promise', { carriedToId: 'b' }),
          will('b', 'Live copy', { carriedFromId: null }),
        ],
      }),
      plan({
        id: 'gp3',
        will: [
          will('loop-a', 'First', { carriedToId: 'loop-b' }),
          will('loop-b', 'Second', { carriedFromId: 'loop-a', carriedToId: 'loop-a' }),
        ],
      }),
    ],
  };
  const { state, warnings } = normalizeState(migrate(raw).raw, { now: NOW });

  const orphan = state.growthPlans[0].will[0];
  assert.equal(orphan.carriedToId, null, 'the promise reopens rather than vanishing');
  assert.equal(isOpenWill(orphan), true);

  const [original, live] = state.growthPlans[1].will;
  assert.equal(live.carriedFromId, 'a', 'the successor points back at what it replaced');
  assert.equal(original.carriedToId, 'b');

  const plan3 = state.growthPlans[2];
  const live3 = plan3.will.filter((w) => isOpenWill(w));
  assert.equal(live3.length, 1, 'a cycle leaves exactly one live promise, not two and not none');
  // The walk has to terminate: whichever end of the loop was cut, walking the
  // chain cannot revisit a record.
  const seen = new Set();
  let cursor = plan3.will[0];
  while (cursor?.carriedToId && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    cursor = plan3.will.find((w) => w.id === cursor.carriedToId);
  }
  assert.ok(seen.size <= 2);
  assert.ok(warnings.some((w) => /reopened 2 carried-forward/.test(w)), warnings.join(' | '));
  assert.ok(warnings.some((w) => /rebuilt 2 carry link/.test(w)), warnings.join(' | '));
});

/* ------------------------------------------------------------- carry path */

test('carrying a commitment keeps the original as history and the promise intact', () => {
  const h = seeded([plan()]);
  const carried = h.api.carryWillAction('gp1', 'w1', '2026-11-15');
  assert.equal(carried.ok, true);
  assert.ok(carried.id);

  const stored = planById(h);
  assert.equal(stored.will.length, 2);
  const [original, successor] = stored.will;
  assert.equal(original.carriedToId, successor.id);
  assert.equal(successor.carriedFromId, original.id);
  assert.equal(successor.text, original.text, 'the promise is the same promise');
  assert.equal(successor.due, '2026-11-15');
  assert.equal(successor.addedOn, TODAY, 'the copy was agreed today');
  assert.equal(willChain(stored, successor).depth, 1);
  assert.equal(willChain(stored, successor).firstAgreedOn, '2026-09-20', 'the plan remembers when it was first agreed');

  const event = h.store.state.events.at(-1);
  assert.equal(event.type, 'growth.will.carried');
  assert.match(event.summary, /2026-11-15/);

  // The retired copy is history: it cannot be ticked, dropped or carried again.
  const toggled = h.api.toggleWillAction('gp1', 'w1');
  assert.equal(toggled.ok, false);
  assert.match(toggled.error, /carried forward/i);
  assert.equal(h.api.carryWillAction('gp1', 'w1', '2026-12-01').ok, false);
  assert.equal(h.api.dropWillAction('gp1', 'w1', 'No longer relevant').ok, false);
});

test('carrying needs a real future date and an open plan', () => {
  const h = seeded([plan()]);
  const noDate = h.api.carryWillAction('gp1', 'w1', '');
  assert.equal(noDate.ok, false);
  assert.equal(noDate.field, 'due');

  const past = h.api.carryWillAction('gp1', 'w1', '2026-10-01');
  assert.equal(past.ok, false);
  assert.match(past.error, /in the past/i);

  assert.equal(h.api.carryWillAction('missing', 'w1', '2026-11-15').ok, false);
  assert.equal(h.api.carryWillAction('gp1', 'missing', '2026-11-15').ok, false);

  const closed = seeded([plan({ status: 'done' })]);
  const result = closed.api.carryWillAction('gp1', 'w1', '2026-11-15');
  assert.equal(result.ok, false);
  assert.match(result.error, /closed/i);
  assert.equal(planById(closed).will.length, 1, 'history is not extended');
});

test('two carries are visible as a stall, and the live copy is the only live commitment', () => {
  const h = seeded([plan()]);
  const first = h.api.carryWillAction('gp1', 'w1', '2026-11-10');
  const second = h.api.carryWillAction('gp1', first.id, '2026-11-24');
  assert.equal(second.ok, true);

  const stored = planById(h);
  const live = openWillActions(stored, NOW);
  assert.equal(live.length, 1, 'one promise, one live row');
  assert.equal(live[0].id, second.id);
  assert.equal(live[0].carryCount, 2);
  assert.equal(live[0].firstAgreedOn, '2026-09-20');
  assert.equal(carriedWillActions(stored, NOW).length, 1);
  assert.equal(willState(stored.will[0]), 'carried-forward');
  assert.equal(willIndex(stored).size, 3);

  const progress = planProgress(stored, NOW);
  assert.equal(progress.total, 1, 'retired copies are not counted as unfinished work');
  assert.equal(progress.open, 1);
  assert.equal(progress.carriedForward, 2);
  assert.equal(progress.done, 0);

  const findings = buildInsights(h.store.state, NOW).findings.filter((f) => f.ruleId === 'GROW-06');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].personId, 'p1');
  assert.match(findings[0].title, /carried forward two or more times/);
  assert.match(findings[0].evidence[0], /carried 2× since 2026-09-20/);
});

test('one carry is a conversation, two is a signal', () => {
  const h = seeded([plan()]);
  h.api.carryWillAction('gp1', 'w1', '2026-11-10');
  assert.equal(buildInsights(h.store.state, NOW).findings.filter((f) => f.ruleId === 'GROW-06').length, 0);
});

/* -------------------------------------------------------------- drop path */

test('dropping needs a reason and removes the commitment from the live count', () => {
  const h = seeded([plan({ will: [will('w1', 'Shadow the on-call rotation'), will('w2', 'Publish the memo format')] })]);
  const tooShort = h.api.dropWillAction('gp1', 'w1', 'no');
  assert.equal(tooShort.ok, false);
  assert.equal(tooShort.field, 'reason');

  const dropped = h.api.dropWillAction('gp1', 'w1', 'The rotation moved to the platform team');
  assert.equal(dropped.ok, true);
  const stored = planById(h);
  const target = stored.will.find((w) => w.id === 'w1');
  assert.equal(target.dropped, true);
  assert.equal(target.droppedOn, TODAY);
  assert.equal(target.droppedReason, 'The rotation moved to the platform team');
  assert.equal(willState(target), 'dropped');

  assert.deepEqual(openWillActions(stored, NOW).map((w) => w.id), ['w2']);
  const progress = planProgress(stored, NOW);
  assert.equal(progress.dropped, 1);
  assert.equal(progress.total, 2, 'a dropped commitment stays in the record');
  assert.equal(progress.percent, 0, 'dropping is not completing');

  assert.equal(h.api.toggleWillAction('gp1', 'w1').ok, false);
  assert.match(h.api.dropWillAction('gp1', 'w1', 'Trying again').error, /only an open commitment/i);
  assert.equal(h.store.state.events.at(-1).type, 'growth.will.dropped');
});

test('a dropped commitment never counts as done, even if a stale flag remains', () => {
  const h = seeded([plan({ will: [will('w1', 'One thing', { done: true, dropped: true, completedOn: '2026-10-01', droppedOn: '2026-10-02' })] })]);
  const stored = planById(h);
  assert.equal(willState(stored.will[0]), 'done', 'done wins: it actually happened');
  assert.equal(isOpenWill(stored.will[0]), false);
  assert.equal(planProgress(stored, NOW).done, 1);
});

/* ------------------------------------------------------------ review path */

test('logging a review settles commitments, records the conversation and resets deferrals', () => {
  const h = seeded([plan({
    reviewDeferrals: 2,
    reviewMovedOn: '2026-10-20',
    will: [
      will('w1', 'Send Priya the memo template', { due: '2026-10-20' }),
      will('w2', 'Co-run one architecture review', { due: '2026-10-18' }),
      will('w3', 'Shadow the on-call rotation', { due: '2026-10-19' }),
      will('w4', 'Keep reading the design docs'),
    ],
  })]);

  const result = h.api.logGrowthReview('gp1', {
    date: '2026-10-20',
    notes: 'Memo format is in use on two design docs. Dropped the on-call shadowing because the rotation moved.',
    nextReviewOn: '2026-11-17',
    decisions: [
      { actionId: 'w1', outcome: 'done' },
      { actionId: 'w2', outcome: 'carried', due: '2026-11-14' },
      { actionId: 'w3', outcome: 'dropped', reason: 'The rotation moved to the platform team' },
      { actionId: 'w4', outcome: 'still-open' },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.closed, 1);
  assert.equal(result.carried, 1);
  assert.equal(result.dropped, 1);
  assert.equal(result.nextReviewOn, '2026-11-17');

  const stored = planById(h);
  assert.equal(stored.reviews.length, 1);
  const review = stored.reviews[0];
  assert.equal(review.date, '2026-10-20');
  assert.equal(review.nextReviewOn, '2026-11-17');
  assert.match(review.notes, /memo format/i);

  const done = stored.will.find((w) => w.id === 'w1');
  assert.equal(done.done, true);
  assert.equal(done.completedOn, '2026-10-20');
  assert.equal(done.completedInReviewId, review.id);

  const dropped = stored.will.find((w) => w.id === 'w3');
  assert.equal(dropped.dropped, true);
  assert.equal(dropped.droppedOn, '2026-10-20');
  assert.equal(dropped.droppedInReviewId, review.id);

  const carriedOriginal = stored.will.find((w) => w.id === 'w2');
  const successor = stored.will.find((w) => w.id === carriedOriginal.carriedToId);
  assert.equal(carriedOriginal.carriedInReviewId, null, 'the original was not the thing carried in the review');
  assert.equal(successor.carriedInReviewId, review.id);
  assert.equal(successor.addedOn, '2026-10-20', 'the successor was agreed in the review, not today');

  assert.equal(stored.reviewOn, '2026-11-17', 'the agreed next date becomes the plan date');
  assert.equal(stored.reviewDeferrals, 0, 'holding a review clears the deferral count');
  assert.equal(stored.reviewMovedOn, null);

  assert.deepEqual(reviewedIn(stored, review.id).closed.map((w) => w.id), ['w1']);
  assert.deepEqual(reviewedIn(stored, review.id).dropped.map((w) => w.id), ['w3']);
  assert.equal(reviewedIn(stored, review.id).carried.length, 1);
  assert.equal(lastReview(stored).id, review.id);
  assert.equal(reviewState(stored, NOW).reviewCount, 1);
  assert.equal(reviewState(stored, NOW).lastReviewedOn, '2026-10-20');

  const event = h.store.state.events.at(-1);
  assert.equal(event.type, 'growth.reviewed');
  assert.match(event.summary, /1 closed, 1 carried forward, 1 dropped/);
});

test('a review cannot be logged without a record, in the future, or with an impossible next date', () => {
  const h = seeded([plan({ will: [will('w1', 'Publish the memo format')] })]);
  const base = { date: '2026-10-20', notes: 'We talked about the memo format for twenty minutes.' };

  const noNotes = h.api.logGrowthReview('gp1', { ...base, notes: 'ok' });
  assert.equal(noNotes.ok, false);
  assert.equal(noNotes.field, 'notes');

  const future = h.api.logGrowthReview('gp1', { ...base, date: '2026-11-30' });
  assert.equal(future.ok, false);
  assert.equal(future.field, 'date');

  const backwards = h.api.logGrowthReview('gp1', { ...base, nextReviewOn: '2026-10-01' });
  assert.equal(backwards.ok, false);
  assert.equal(backwards.field, 'nextReviewOn');

  const badCarry = h.api.logGrowthReview('gp1', {
    ...base,
    nextReviewOn: '2026-11-17',
    decisions: [{ actionId: 'w1', outcome: 'carried', due: '2026-10-01' }],
  });
  assert.equal(badCarry.ok, false);
  assert.equal(badCarry.field, 'decisions');

  const noReason = h.api.logGrowthReview('gp1', {
    ...base,
    decisions: [{ actionId: 'w1', outcome: 'dropped', reason: 'x' }],
  });
  assert.equal(noReason.ok, false);
  assert.equal(noReason.field, 'decisions');

  const missing = h.api.logGrowthReview('gp1', {
    ...base,
    decisions: [{ actionId: 'nope', outcome: 'done' }],
  });
  assert.equal(missing.ok, false);

  assert.equal(planById(h).reviews.length, 0, 'a rejected review writes nothing');
  assert.equal(planById(h).will[0].done, false);

  const closed = seeded([plan({ status: 'done' })]);
  const closedResult = closed.api.logGrowthReview('gp1', base);
  assert.equal(closedResult.ok, false);
  assert.match(closedResult.error, /closed/i);
});

test('pushing the review date without holding one is counted, not silent', () => {
  const h = seeded([plan({ reviewOn: '2026-10-30' })]);
  assert.equal(h.api.updateGrowthPlan('gp1', { reviewOn: '2026-11-20' }).ok, true);
  let stored = planById(h);
  assert.equal(stored.reviewDeferrals, 1);
  assert.equal(stored.reviewMovedOn, TODAY);

  // Moving it earlier, or not at all, is not a deferral.
  assert.equal(h.api.updateGrowthPlan('gp1', { reviewOn: '2026-11-20' }).ok, true);
  assert.equal(planById(h).reviewDeferrals, 1);
  assert.equal(h.api.updateGrowthPlan('gp1', { reviewOn: '2026-11-01' }).ok, true);
  assert.equal(planById(h).reviewDeferrals, 1);

  assert.equal(h.api.updateGrowthPlan('gp1', { reviewOn: '2026-12-20' }).ok, true);
  stored = planById(h);
  assert.equal(stored.reviewDeferrals, 2);

  const findings = buildInsights(h.store.state, NOW).findings.filter((f) => f.ruleId === 'GROW-07');
  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /moved 2 times without being held/);
  assert.equal(findings[0].severity, 3);

  // Holding the review resets the count, and the rule clears.
  assert.equal(h.api.logGrowthReview('gp1', {
    date: '2026-10-24',
    notes: 'Twenty minutes on the memo format and what comes next.',
    nextReviewOn: '2026-11-21',
  }).ok, true);
  assert.equal(planById(h).reviewDeferrals, 0);
  assert.equal(buildInsights(h.store.state, NOW).findings.filter((f) => f.ruleId === 'GROW-07').length, 0);
});

test('the review record, not the plan date, is what makes development look alive', () => {
  const h = seeded([plan({
    createdAt: '2026-08-01T09:00:00.000Z',
    stagesUpdatedOn: '2026-08-01',
    reviewOn: '2026-10-01',
    will: [will('w1', 'Publish the memo format', { done: true, completedOn: '2026-08-10' })],
    reviews: [
      { id: 'grev-1', date: '2026-08-05', notes: 'First review', nextReviewOn: '2026-09-01', createdAt: '2026-08-05T09:00:00.000Z' },
      { id: 'grev-2', date: '2026-10-20', notes: 'Second review, a real conversation', nextReviewOn: '2026-11-17', createdAt: '2026-10-20T09:00:00.000Z' },
    ],
  })]);
  const stored = planById(h);

  assert.deepEqual(reviewHistory(stored).map((r) => r.id), ['grev-2', 'grev-1'], 'newest first');
  assert.equal(lastReview(stored).id, 'grev-2');
  assert.equal(stagnationDays(stored, NOW), 4, 'a held review is development work');

  const health = planHealth(stored, NOW);
  assert.ok(health.review.reviewCount === 2);
  assert.equal(health.issues.some((issue) => /moved .* times/.test(issue)), false);
});

/* ---------------------------------------------------------------- exports */

test('the export carries the ledger state, the carry depth and the review counts', () => {
  const h = seeded([plan({
    will: [
      will('w1', 'Publish the memo format', { due: '2026-10-10' }),
      will('w2', 'Sent to the review', { done: true, completedOn: '2026-10-01' }),
      will('w3', 'No longer needed', { dropped: true, droppedOn: '2026-10-02', droppedReason: 'Role changed' }),
    ],
    reviews: [{ id: 'grev-1', date: '2026-10-01', notes: 'Reviewed the memo work', nextReviewOn: '2026-11-01', createdAt: '2026-10-01T09:00:00.000Z' }],
    reviewDeferrals: 1,
  })]);
  // Carry a live commitment so the export has to derive a depth > 0.
  const carried = h.api.carryWillAction('gp1', 'w1', '2026-11-14');
  assert.equal(carried.ok, true);

  const actions = parseCsv(exportWorkspaceCsv(h.store.state, 'actions', { now: NOW }).csv);
  const col = (row, name) => row[actions.headers.indexOf(name)];
  const growRows = actions.rows.filter((r) => col(r, 'source_type') === 'GROW commitment');
  assert.equal(growRows.length, 4);
  const byText = (text) => growRows.filter((r) => col(r, 'commitment') === text);
  const [original, live] = byText('Publish the memo format');
  assert.equal(col(original, 'state'), 'carried-forward');
  assert.equal(col(original, 'carried_forward_count'), '0');
  assert.equal(col(live, 'state'), 'open');
  assert.equal(col(live, 'carried_forward_count'), '1');
  assert.equal(col(live, 'first_agreed_on'), '2026-09-20');
  assert.equal(col(byText('Sent to the review')[0], 'state'), 'done');
  assert.equal(col(byText('No longer needed')[0], 'state'), 'dropped');

  const plans = parseCsv(exportWorkspaceCsv(h.store.state, 'growthPlans', { now: NOW }).csv);
  const row = plans.rows[0];
  const field = (name) => row[plans.headers.indexOf(name)];
  assert.equal(field('will_total'), '4');
  assert.equal(field('will_completed'), '1');
  assert.equal(field('will_open'), '1', 'only the live, unfinished promise is open');
  assert.equal(field('will_carried'), '1');
  assert.equal(field('will_dropped'), '1');
  assert.equal(field('reviews_held'), '1');
  assert.equal(field('last_reviewed_on'), '2026-10-01');
  assert.equal(field('review_deferrals'), '1');
});

/* --------------------------------------------------------------- snapshots */

test('a snapshot taken before the review does not count work that had not happened', () => {
  const h = seeded([plan({
    will: [
      will('w1', 'Publish the memo format', { due: '2026-10-20' }),
      will('w2', 'Co-run the architecture review', { due: '2026-10-18' }),
    ],
    reviewOn: '2026-10-20',
  })]);
  const carried = h.api.carryWillAction('gp1', 'w2', '2026-11-14');
  assert.equal(carried.ok, true);
  assert.equal(h.api.logGrowthReview('gp1', {
    date: '2026-10-20',
    notes: 'Closed the memo work and moved the architecture review.',
    nextReviewOn: '2026-11-17',
    decisions: [{ actionId: 'w1', outcome: 'done' }],
  }).ok, true);

  const before = reconstructStateAt(h.store.state, '2026-10-05', { currentDay: TODAY });
  const rewound = before.state.growthPlans[0];
  assert.equal(rewound.will.find((w) => w.id === 'w1').done, false, 'it was not done yet');
  assert.equal(rewound.reviews.length, 0, 'the review had not happened');
  assert.equal(rewound.reviewOn, null, 'no next-review date is invented');
  assert.equal(rewound.will.some((w) => w.id === carried.id), false, 'the successor did not exist yet');
  assert.equal(rewound.will.find((w) => w.id === 'w2').carriedToId, null);
  assert.equal(before.fidelity.growth.level, 'approximate');
  assert.ok(
    before.fidelity.growth.reasons.some((note) => /review was recorded after this snapshot/i.test(note)),
    before.fidelity.growth.reasons.join(' | '),
  );

  const after = reconstructStateAt(h.store.state, '2026-10-22', { currentDay: TODAY });
  const current = after.state.growthPlans[0];
  assert.equal(current.will.find((w) => w.id === 'w1').done, true);
  assert.equal(current.reviews.length, 1);
  assert.equal(current.reviewOn, '2026-11-17');
});

/* -------------------------------------------------------------------- demo */

test('the demo workspace exercises every state in the ledger', () => {
  const state = buildDemoState(NOW);
  const mei = state.growthPlans.find((p) => p.personId === 'person-demo-3');
  const open = openWillActions(mei, NOW);
  assert.equal(open.length, 2);
  assert.equal(open.filter((w) => w.carryCount === 2).length, 1, 'one commitment carried twice');
  assert.equal(open.filter((w) => w.overdue).length, 1, 'one live commitment is late');
  assert.equal(mei.reviews.length, 1);
  assert.equal(mei.will.filter((w) => w.dropped).length, 1);
  assert.equal(mei.will.filter((w) => w.done).length, 1);
  assert.equal(reviewedIn(mei, mei.reviews[0].id).closed.length, 1);
  assert.equal(reviewedIn(mei, mei.reviews[0].id).dropped.length, 1);

  const rules = buildInsights(state, NOW).findings.filter((f) => f.ruleId === 'GROW-06' || f.ruleId === 'GROW-07');
  assert.deepEqual(rules.map((f) => f.ruleId).sort(), ['GROW-06', 'GROW-07']);
  assert.ok(rules.every((f) => f.personId === 'person-demo-3'));
});

/* ---------------------------------------------------------------------- UI */

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

function buttonByText(env, text, scope = env.document) {
  return [...scope.querySelectorAll('button, a')].find((el) => el.textContent.trim().toLowerCase().includes(text.toLowerCase()));
}

test('the growth page shows live commitments with carry and drop controls and the review record', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });
  try {
    const state = buildDemoState(NOW);
    app.store.seedDemo();
    // seedDemo builds its own demo at the app clock; replace it with the
    // date-stable fixture so the assertions below cannot drift.
    app.store.update((draft) => {
      draft.people = state.people;
      draft.growthPlans = state.growthPlans;
    }, { type: 'test.seed', entity: 'growthPlan', entityId: 'gp', summary: 'Fixture' });

    app.navigate('#/growth');
    const view = env.document.getElementById('view');
    const text = view.textContent.replace(/\s+/g, ' ');

    assert.match(text, /Open commitments/);
    assert.match(text, /Carried forward/);
    assert.match(text, /Reviews held/);
    assert.match(text, /carried 2×/, 'the twice-moved commitment is labelled');
    assert.match(text, /agreed 14 Sep/, 'the original agreement date survives the carries');
    assert.match(text, /d overdue/);
    assert.match(text, /Closed and moved commitments/);
    assert.match(text, /Hold review/);
    assert.match(text, /moved 2× without a review being held/);
    assert.match(text, /Walked through the memo format/, 'the review note is readable');

    const carryButtons = [...view.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Carry');
    assert.equal(carryButtons.length, 3, 'one Carry per live commitment across both plans');
    assert.ok([...view.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Drop'));

    if (!env.window.axe) env.window.eval(AXE_SRC);
    const axe = await env.window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.equal(axe.violations.length, 0, JSON.stringify(axe.violations.map((v) => v.id)));

    // Carrying from the page asks for a new date and writes the ledger.
    click(carryButtons[0]);
    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'carry opens a dialog');
    assert.match(dialog.textContent, /New due date/);
    const input = dialog.querySelector('input[name="due"]');
    input.value = '2026-11-30';
    input.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    input.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    click(dialog.querySelector('.modal-foot .btn-primary'));

    const mei = app.store.state.growthPlans.find((p) => p.personId === 'person-demo-3');
    assert.equal(mei.will.filter((w) => w.carriedToId).length, 4, 'the carry from the page is recorded');
    assert.equal(app.store.state.events.at(-1).type, 'growth.will.carried');

    // The review dialog shows the open commitments and their decisions.
    app.navigate('#/growth');
    click(buttonByText(env, 'Hold review', env.document.getElementById('view')));
    const review = env.document.querySelector('[role="dialog"]');
    assert.ok(review, 'the review dialog opens');
    assert.match(review.textContent, /What did you actually discuss/);
    assert.equal(
      review.querySelectorAll('.recon-row').length,
      2,
      `dialogs=${env.document.querySelectorAll('[role="dialog"]').length} rows=${[...review.querySelectorAll('.recon-row')].map((r) => r.textContent.slice(0, 40)).join(' | ')}`,
    );
    assert.ok(review.querySelector('textarea[name="notes"]'));

    if (!env.window.axe) env.window.eval(AXE_SRC);
    const axeDialog = await env.window.axe.run(review, { rules: { 'color-contrast': { enabled: false } } });
    assert.equal(axeDialog.violations.length, 0, JSON.stringify(axeDialog.violations.map((v) => v.id)));

    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
});

test('the person page shows carried work and where the review stands', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });
  try {
    const state = buildDemoState(NOW);
    app.store.seedDemo();
    app.store.update((draft) => {
      draft.people = state.people;
      draft.growthPlans = state.growthPlans;
    }, { type: 'test.seed', entity: 'growthPlan', entityId: 'gp', summary: 'Fixture' });

    app.navigate('#/people/person-demo-3');
    const view = env.document.getElementById('view');
    const text = view.textContent.replace(/\s+/g, ' ');
    assert.match(text, /Development/);
    assert.match(text, /carried 2×/);
    assert.match(text, /Reviews held: 1/);
    assert.ok(buttonByText(env, 'Hold review', view), 'the person page can open the review');

    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
});
