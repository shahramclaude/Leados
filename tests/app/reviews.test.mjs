import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  buildReviewEvidence, summarizeReviewEvidence, calibrateReview, reviewReadiness,
  validPeriod, hasSelfReflection,
} from '../../app/core/domain/reviews.js';
import { planProgress } from '../../app/core/domain/growth.js';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const ISO = NOW.toISOString();

function makeState() {
  const state = createEmptyState(ISO);
  state.people = [
    { id: 'p1', name: 'Ada Lovelace', role: 'Engineer', createdAt: '2025-01-01T09:00:00.000Z', startDate: '2025-01-01' },
    { id: 'p2', name: 'Grace Hopper', role: 'Engineer', createdAt: '2025-01-01T09:00:00.000Z', startDate: '2025-01-01' },
  ];
  state.oneOnOnes = [
    { id: 'm-start', personId: 'p1', date: '2026-07-01', status: 'held', notes: 'Start boundary is included.' },
    { id: 'm-end', personId: 'p1', date: '2026-09-30', status: 'held', notes: 'End boundary is included.' },
    { id: 'm-before', personId: 'p1', date: '2026-06-30', status: 'held', notes: 'Outside.' },
    { id: 'm-after', personId: 'p1', date: '2026-10-01', status: 'held', notes: 'Outside.' },
    { id: 'm-other', personId: 'p2', date: '2026-08-01', status: 'held', notes: 'Another person.' },
  ];
  state.feedback = [
    { id: 'f-praise', personId: 'p1', direction: 'given', kind: 'praise', date: '2026-07-15', situation: 'Release review', behavior: 'you explained the trade-offs', impact: 'the team decided quickly' },
    { id: 'f-upward', personId: 'p1', direction: 'received', kind: 'constructive', date: '2026-08-01', situation: '1:1', behavior: 'you delayed my decision', impact: 'my work waited' },
    { id: 'f-constructive', personId: 'p1', direction: 'given', kind: 'constructive', date: '2026-09-25', situation: 'Planning session', behavior: 'the estimate omitted testing', impact: 'the plan was unrealistic' },
  ];
  state.recognition = [{ id: 'r1', personId: 'p1', date: '2026-08-10', what: 'Owned the incident review.', values: ['Ownership'] }];
  state.goals = [
    {
      id: 'g1', ownerId: 'p1', title: 'Reduce activation time', status: 'active', confidence: 'on-track', createdAt: '2026-06-01T09:00:00.000Z', dueDate: '2026-11-01',
      keyResults: [{ id: 'kr1', title: 'Minutes', start: 20, target: 10, current: 15, unit: 'min' }],
      checkins: [{ id: 'c1', date: '2026-07-10', note: 'The new flow is underway.', confidence: 'on-track' }],
    },
    {
      id: 'g-no-kr', ownerId: 'p1', title: 'Improve documentation', status: 'active', confidence: 'on-track', createdAt: '2026-08-01T09:00:00.000Z', dueDate: '2026-10-15', keyResults: [],
      checkins: [{ id: 'c2', date: '2026-08-12', note: 'Scope agreed.', confidence: 'on-track' }],
    },
  ];
  state.growthPlans = [{
    id: 'gp1', personId: 'p1', goal: 'Grow technical communication across teams.', status: 'active', createdAt: '2026-07-05T09:00:00.000Z', reviewOn: '2026-10-01',
    will: [{ id: 'w1', text: 'Write a decision memo', due: '2026-09-01', done: true }], options: [], competencies: [],
  }];
  state.pulses = [{ id: 'anon', date: '2026-08-10', anonymity: 'anonymous', personId: null, scores: { safety: 2 } }];
  return normalizeState(state).state;
}

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) || null,
    setItem: (key, value) => map.set(key, String(value)),
    dump: () => Object.fromEntries(map),
  };
}

function assessment() {
  return {
    achievements: 'Ada explained the technical trade-offs clearly and helped the team make a faster release decision.',
    development: 'Ada should include testing in every estimate so delivery plans reflect the full cost of the work.',
    nextSteps: 'Ada will use the revised estimation checklist from 1 November; we will inspect it in our next 1:1.',
    rating: 'meets-expectations',
  };
}

test('review periods are validated and both boundary dates are inclusive', () => {
  assert.equal(validPeriod('2026-07-01', '2026-09-30'), true);
  assert.equal(validPeriod('2026-09-30', '2026-07-01'), false);
  assert.equal(validPeriod('not-a-date', '2026-09-30'), false);
  const evidence = buildReviewEvidence(makeState(), 'p1', '2026-07-01', '2026-09-30');
  assert.ok(evidence.some((item) => item.sourceId === 'm-start'));
  assert.ok(evidence.some((item) => item.sourceId === 'm-end'));
  assert.ok(!evidence.some((item) => ['m-before', 'm-after', 'm-other'].includes(item.sourceId)));
});

test('review evidence covers six sources but excludes upward feedback and anonymous pulse', () => {
  const evidence = buildReviewEvidence(makeState(), 'p1', '2026-07-01', '2026-09-30');
  assert.deepEqual(new Set(evidence.map((item) => item.sourceType)), new Set(['oneonone', 'feedback', 'goal', 'growth', 'recognition']));
  assert.ok(!evidence.some((item) => item.sourceId === 'f-upward'), 'feedback from the person about the manager is not evidence about the person');
  assert.ok(!evidence.some((item) => item.sourceId === 'anon'), 'anonymous answers are never attributed');
  assert.ok(evidence.every((item) => item.route.startsWith('#/') && item.sourceId && item.basis));
  assert.equal(evidence[0].date, '2026-07-01', 'oldest evidence appears first');
});

test('goal evidence says unmeasured and capture-time rather than inventing period history', () => {
  const evidence = buildReviewEvidence(makeState(), 'p1', '2026-07-01', '2026-09-30');
  const unmeasured = evidence.find((item) => item.sourceId === 'g-no-kr');
  assert.ok(unmeasured.meta.includes('Unmeasured at capture'));
  assert.ok(!unmeasured.meta.includes('0%'));
  const measured = evidence.find((item) => item.sourceId === 'g1');
  assert.ok(measured.meta.includes('50% progress at capture'));
  assert.equal(measured.detail, 'The new flow is underway.');

  const state = makeState();
  state.goals[0].checkins = [];
  const snapshot = buildReviewEvidence(state, 'p1', '2026-07-01', '2026-09-30').find((item) => item.sourceId === 'g1');
  assert.equal(snapshot.date, null);
  assert.ok(snapshot.basis.includes('Current goal snapshot'));
});

test('evidence summary measures period coverage and balance without a score', () => {
  const evidence = buildReviewEvidence(makeState(), 'p1', '2026-07-01', '2026-09-30');
  const summary = summarizeReviewEvidence(evidence, '2026-07-01', '2026-09-30');
  assert.equal(summary.periodDays, 92);
  assert.equal(summary.sourceTypes, 5);
  assert.equal(summary.positive, 3); // praise, recognition, completed development commitment
  assert.equal(summary.constructive, 1);
  assert.ok(summary.early > 0 && summary.late > 0);
  assert.equal(summary.firstDate, '2026-07-01');
  assert.equal(summary.lastDate, '2026-09-30');
});

test('calibration flags recency concentration rather than treating it as a verdict', () => {
  const review = {
    periodStart: '2026-01-01', periodEnd: '2026-06-30', manager: { ...assessment(), rating: '' }, selfReflection: {},
    evidence: [
      { sourceType: 'feedback', date: '2026-06-01', valence: 'positive' },
      { sourceType: 'recognition', date: '2026-06-20', valence: 'positive' },
    ],
  };
  const warnings = calibrateReview(review);
  assert.ok(warnings.some((warning) => warning.id === 'CAL-02'));
  assert.ok(warnings.find((warning) => warning.id === 'CAL-02').detail.includes('full 181-day period'));
});

test('calibration challenges unsupported high and low ratings independently', () => {
  const base = { periodStart: '2026-07-01', periodEnd: '2026-09-30', manager: assessment(), selfReflection: {} };
  const developmental = [
    { sourceType: 'feedback', date: '2026-07-10', valence: 'constructive' },
    { sourceType: 'oneonone', date: '2026-08-10', valence: 'neutral' },
  ];
  const high = calibrateReview({ ...base, manager: { ...assessment(), rating: 'often-exceeds' }, evidence: developmental });
  assert.ok(high.some((warning) => warning.id === 'CAL-03'));

  const positive = [
    { sourceType: 'feedback', date: '2026-07-10', valence: 'positive' },
    { sourceType: 'oneonone', date: '2026-08-10', valence: 'neutral' },
  ];
  const low = calibrateReview({ ...base, manager: { ...assessment(), rating: 'needs-development' }, evidence: positive });
  assert.ok(low.some((warning) => warning.id === 'CAL-04'));
});

test('completion readiness requires evidence and manager writing, never a self-rating', () => {
  const review = {
    periodStart: '2026-07-01', periodEnd: '2026-09-30',
    manager: { achievements: '', development: '', nextSteps: '', rating: '' }, selfReflection: {},
    evidence: [{ sourceType: 'oneonone', date: '2026-07-01', valence: 'neutral' }],
  };
  assert.equal(reviewReadiness(review).canComplete, false);
  assert.equal(reviewReadiness(review).selfReflectionPresent, false);
  review.manager = assessment();
  assert.equal(reviewReadiness(review).canComplete, true);
  assert.equal(hasSelfReflection(review), false, 'completion does not fabricate employee participation');
});

test('schema v1 migrates in place and review normalization repairs unsafe fields', () => {
  const old = { schemaVersion: 1, people: [{ id: 'p1', name: 'Ada' }] };
  const { raw, applied } = migrate(old);
  assert.deepEqual(applied, ['1 → 2', '2 → 3', '3 → 4']);
  const { state, warnings } = normalizeState({
    ...raw,
    reviews: [
      {
        id: 'review1', personId: 'p1', periodStart: '2026-07-01', periodEnd: '2026-09-30', status: 'complete',
        manager: { rating: 'invented-rating' },
        evidence: [{ sourceType: 'feedback', sourceId: 'f1', title: 'Praise', date: '2026-02-31', route: 'https://evil.example', valence: 'unexpected' }],
      },
      { id: 'bad-review', personId: 'p1', periodStart: '2026-02-31', periodEnd: '2026-09-30' },
    ],
  });
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.people[0].name, 'Ada');
  assert.equal(state.reviews.length, 1);
  assert.equal(state.reviews[0].manager.rating, '');
  assert.equal(state.reviews[0].evidence[0].route, '#/reviews');
  assert.equal(state.reviews[0].evidence[0].date, null, 'impossible calendar dates are not imported');
  assert.equal(state.reviews[0].evidence[0].valence, 'neutral');
  assert.ok(warnings.some((warning) => warning.includes('invalid period')));
});

test('review actions refresh drafts, freeze completion, audit, and reload', () => {
  const storage = fakeStorage({ 'leados.lifecycle.v1': JSON.stringify(makeState()) });
  const store = createStore({ storage, now: () => NOW });
  store.load();
  const api = createApi(store, { now: () => NOW });

  assert.equal(api.createReview({ personId: 'p1', periodStart: '2026-09-30', periodEnd: '2026-07-01' }).ok, false);
  const created = api.createReview({ personId: 'p1', periodStart: '2026-07-01', periodEnd: '2026-09-30' });
  assert.equal(created.ok, true);
  assert.equal(api.createReview({ personId: 'p1', periodStart: '2026-07-01', periodEnd: '2026-09-30' }).ok, false, 'exact duplicates are refused');

  const before = store.state.reviews[0].evidence.length;
  api.addRecognition({ personId: 'p1', date: '2026-09-29', what: 'Prepared a clear handover for the on-call team.' });
  assert.equal(store.state.reviews[0].evidence.length, before, 'draft snapshot does not drift silently');
  assert.equal(api.refreshReviewEvidence(created.id).evidenceCount, before + 1);

  assert.equal(api.completeReview(created.id).ok, false, 'empty manager assessment cannot be completed');
  api.updateReflection(created.id, { achievements: 'I made the release trade-offs understandable to the whole team.' });
  api.updateAssessment(created.id, assessment());
  const completed = api.completeReview(created.id);
  assert.equal(completed.ok, true);
  assert.equal(store.state.reviews[0].status, 'complete');
  assert.equal(store.state.reviews[0].evidence.length, before + 1);
  assert.equal(store.state.events.at(-1).type, 'review.completed');

  const frozen = store.state.reviews[0].evidence.length;
  api.addRecognition({ personId: 'p1', date: '2026-09-28', what: 'Documented the release checklist for future use.' });
  assert.equal(api.refreshReviewEvidence(created.id).ok, false);
  assert.equal(api.updateAssessment(created.id, assessment()).ok, false);
  assert.equal(store.state.reviews[0].evidence.length, frozen, 'completed evidence is immutable until reopen');

  const reloaded = createStore({ storage, now: () => NOW });
  reloaded.load();
  assert.equal(reloaded.state.reviews.length, 1);
  assert.equal(reloaded.state.reviews[0].status, 'complete');
  assert.equal(reloaded.state.reviews[0].manager.rating, 'meets-expectations');
  assert.equal(reloaded.state.reviews[0].evidence.length, frozen);

  const reopenedApi = createApi(reloaded, { now: () => NOW });
  assert.equal(reopenedApi.reopenReview(created.id).ok, true);
  assert.equal(reopenedApi.refreshReviewEvidence(created.id).evidenceCount, frozen + 1);
  assert.ok(reloaded.state.events.some((event) => event.type === 'review.reopened'));
});

test('development action overdue counts use the injected date, not the wall clock', () => {
  const plan = { will: [{ id: 'w1', text: 'Old commitment', due: '2020-01-01', done: false }] };
  assert.equal(planProgress(plan, new Date('2026-10-24T10:00:00.000Z')).overdue, 1);
  assert.equal(planProgress(plan, new Date('2019-10-24T10:00:00.000Z')).overdue, 0);
});
