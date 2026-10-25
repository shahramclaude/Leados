import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { feedbackLatency, feedbackLatencySummary, personFeedbackStats, teamFeedbackSummary } from '../../app/core/domain/feedback.js';
import { delegationHealth, delegationSummary } from '../../app/core/domain/delegations.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { suggestAgenda } from '../../app/core/domain/oneonone.js';
import { buildReviewEvidence } from '../../app/core/domain/reviews.js';
import { buildDemoState } from '../../app/core/demo.js';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const ISO = NOW.toISOString();
const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) || null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
}

function apiHarness(storage = memoryStorage()) {
  const store = createStore({ storage, now: () => NOW });
  store.load();
  return { store, api: createApi(store, { now: () => NOW }), storage };
}

function domainState() {
  const state = createEmptyState(ISO);
  state.people = [{
    id: 'p1', name: 'Ada Lovelace', role: 'Engineer', level: 'senior', team: 'Core', managerId: null,
    startDate: '2025-01-01', focus: '', status: 'active', createdAt: '2025-01-01T09:00:00.000Z', archivedAt: null,
  }];
  return normalizeState(state).state;
}

function delegationInput(personId, overrides = {}) {
  return {
    personId,
    title: 'Own the customer-risk review',
    expectedOutcome: 'Every risk has an owner, a next action and a short weekly summary.',
    authority: 'act-inform',
    support: 'Dashboard access and a weekly 20-minute escalation slot with the leader.',
    delegatedOn: '2026-10-01',
    dueOn: '2026-10-20',
    ...overrides,
  };
}

/* ------------------------------------------------------- feedback latency */

test('feedback latency measures real date pairs and never turns unknown into zero', () => {
  assert.deepEqual(feedbackLatency({ observedOn: '2026-10-24', date: '2026-10-24' }), { status: 'measured', days: 0 });
  assert.deepEqual(feedbackLatency({ observedOn: null, date: '2026-10-24' }), { status: 'unmeasured', days: null });
  assert.deepEqual(feedbackLatency({ observedOn: '2026-10-25', date: '2026-10-24' }), { status: 'invalid', days: null });
  const summary = feedbackLatencySummary([
    { id: 'same', observedOn: '2026-10-24', date: '2026-10-24' },
    { id: 'slow', observedOn: '2026-10-01', date: '2026-10-11' },
    { id: 'unknown', observedOn: null, date: '2026-10-12' },
  ], 7);
  assert.equal(summary.samples, 2);
  assert.equal(summary.average, 5);
  assert.equal(summary.max, 10);
  assert.equal(summary.delayed, 1);
  assert.equal(summary.unmeasured, 1);
});

test('FB-06 uses only measured 90-day feedback and links to the delayed records', () => {
  const state = domainState();
  state.feedback = normalizeState({
    ...state,
    feedback: [
      { id: 'slow', personId: 'p1', direction: 'given', kind: 'constructive', behavior: 'specific behavior', date: '2026-10-20', observedOn: '2026-10-01' },
      { id: 'unknown', personId: 'p1', direction: 'given', kind: 'praise', behavior: 'specific behavior', date: '2026-10-21', observedOn: null },
      { id: 'old', personId: 'p1', direction: 'given', kind: 'praise', behavior: 'old behavior', date: '2026-06-01', observedOn: '2026-05-01' },
      { id: 'upward', personId: 'p1', direction: 'received', kind: 'constructive', behavior: 'manager behavior', date: '2026-10-20', observedOn: '2026-09-01' },
    ],
  }).state.feedback;
  const stats = personFeedbackStats(state, 'p1', NOW, state.settings);
  assert.equal(stats.latencySamples, 1);
  assert.equal(stats.averageLatency, 19);
  assert.equal(stats.delayedLatency, 1);
  assert.equal(stats.unmeasuredLatency, 1);
  const finding = buildInsights(state, NOW).findings.find((item) => item.ruleId === 'FB-06');
  assert.ok(finding);
  assert.equal(finding.action.route, '#/feedback?person=p1&filter=latency');
  assert.ok(finding.evidence.some((line) => line.includes('unknown excluded')));

  state.feedback.find((item) => item.id === 'slow').observedOn = null;
  assert.equal(buildInsights(state, NOW).findings.some((item) => item.ruleId === 'FB-06'), false);
  const team = teamFeedbackSummary(state, NOW, state.settings);
  assert.equal(team.averageLatency, null, 'no measured dates means no average, not 0d');
});

test('feedback actions preserve observation dates and reject impossible chronology', () => {
  const { store, api } = apiHarness();
  const { id: personId } = api.addPerson({ name: 'Ada' });
  const created = api.addFeedback({ personId, kind: 'praise', behavior: 'you documented the decision clearly', date: '2026-10-20', observedOn: '2026-10-18' });
  assert.equal(created.ok, true);
  assert.equal(store.state.feedback[0].observedOn, '2026-10-18');
  const events = store.state.events.length;
  assert.equal(api.addFeedback({ personId, behavior: 'another specific behavior', date: '2026-10-20', observedOn: '2026-10-21' }).ok, false);
  assert.equal(api.addFeedback({ personId, behavior: 'another specific behavior', date: '2026-10-20', observedOn: '2026-02-31' }).ok, false);
  assert.equal(api.addFeedback({ personId, behavior: 'another specific behavior', date: '2026-10-25', observedOn: null }).ok, false);
  assert.equal(api.updateFeedback(created.id, { observedOn: '2026-10-22' }).ok, false);
  assert.equal(api.updateFeedback(created.id, { date: '2026-10-25' }).ok, false);
  assert.equal(api.updateFeedback('missing', { observedOn: null }).ok, false);
  assert.equal(store.state.feedback.length, 1);
  assert.equal(store.state.feedback[0].observedOn, '2026-10-18');
  assert.equal(store.state.events.length, events, 'rejected writes do not create audit events');
});

/* ------------------------------------------------------- goal authorship */

test('schema v2 migration adds nullable context without inventing authorship or dates', () => {
  const old = {
    schemaVersion: 2,
    settings: { feedbackTargetDays: 30 },
    people: [{ id: 'p1', name: 'Ada' }],
    feedback: [{ id: 'f1', personId: 'p1', behavior: 'behavior', date: '2026-10-20' }],
    goals: [
      { id: 'g1', ownerId: 'p1', title: 'Owned goal', keyResults: [] },
      { id: 'g2', ownerId: null, title: 'Team goal', coAuthored: true, keyResults: [] },
    ],
  };
  const migrated = migrate(old);
  assert.deepEqual(migrated.applied, ['2 → 3', '3 → 4', '4 → 5', '5 → 6', '6 → 7', '7 → 8']);
  const { state } = normalizeState(migrated.raw);
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.settings.feedbackTargetDays, 30);
  assert.equal(state.settings.feedbackLatencyTargetDays, 7);
  assert.equal(state.settings.delegationCheckinDays, 7);
  assert.equal(state.feedback[0].observedOn, null);
  assert.equal(state.goals[0].coAuthored, null);
  assert.equal(state.goals[1].coAuthored, null, 'team goals are not applicable, not co-authored');
  assert.deepEqual(state.delegations, []);
});

test('goal actions and GOAL-06 distinguish true, false and unknown', () => {
  const { store, api } = apiHarness();
  const { id: personId } = api.addPerson({ name: 'Ada' });
  const created = api.addGoal({ title: 'Improve activation', ownerId: personId, coAuthored: null, keyResults: [] });
  assert.equal(created.ok, true);
  assert.equal(store.state.goals[0].coAuthored, null);
  assert.equal(buildInsights(store.state, NOW).findings.some((item) => item.ruleId === 'GOAL-06'), false, 'unknown is not leader-authored');

  assert.equal(api.updateGoal(created.id, { coAuthored: false }).ok, true);
  const finding = buildInsights(store.state, NOW).findings.find((item) => item.ruleId === 'GOAL-06');
  assert.ok(finding);
  assert.equal(finding.action.route, `#/goals?goal=${created.id}`);
  assert.equal(api.updateGoal(created.id, { coAuthored: true }).ok, true);
  assert.equal(buildInsights(store.state, NOW).findings.some((item) => item.ruleId === 'GOAL-06'), false);

  assert.equal(api.updateGoal(created.id, { ownerId: null, coAuthored: true }).ok, true);
  assert.equal(store.state.goals[0].coAuthored, null);
  assert.equal(api.updateGoal('missing', { coAuthored: false }).ok, false);
});

/* ------------------------------------------------------------ delegation */

test('delegation normalization keeps authority unknown and reports damaged history', () => {
  const base = domainState();
  const { state, warnings } = normalizeState({
    ...base,
    goals: [{ id: 'bad-authorship', ownerId: 'p1', title: 'Damaged authorship', coAuthored: 'yes', keyResults: [] }],
    feedback: [
      { id: 'bad-observation', personId: 'p1', behavior: 'behavior', date: '2026-10-20', observedOn: '2026-02-31' },
      { id: 'reversed-observation', personId: 'p1', behavior: 'behavior', date: '2026-10-20', observedOn: '2026-10-21' },
    ],
    delegations: [
      {
        id: 'd1', personId: 'p1', title: 'Valid history', delegatedOn: '2026-10-01', dueOn: '2026-10-20', authority: 'invented', status: 'done', completedOn: '2026-10-20', completionNote: 'Delivered.',
        checkins: [
          { id: 'ok', date: '2026-10-10', progress: 'on-track', note: 'Progress.' },
          { id: 'bad-date', date: '2026-02-31', progress: 'blocked', note: 'Bad date.' },
          { id: 'too-early', date: '2026-09-01', progress: 'blocked', note: 'Before delegation.' },
          { id: 'post-terminal', date: '2026-10-21', progress: 'blocked', note: 'After completion.' },
        ],
      },
      { id: 'd2', personId: 'p1', title: 'Reversed due date', delegatedOn: '2026-10-20', dueOn: '2026-10-01' },
      { id: 'd4', personId: 'p1', title: 'Missing completion date', delegatedOn: '2026-10-01', status: 'done', completedOn: null },
      { id: 'd3', personId: 'missing', title: 'Orphan history', delegatedOn: '2026-10-01', dueOn: '2026-10-20' },
    ],
  });
  assert.equal(state.feedback[0].observedOn, null);
  assert.equal(state.feedback[1].observedOn, '2026-10-21', 'reversed dates remain visible for correction');
  assert.equal(state.delegations.length, 2);
  assert.equal(state.delegations[0].authority, '');
  assert.equal(state.delegations[0].checkins.length, 1);
  assert.equal(state.goals[0].coAuthored, null);
  assert.ok(warnings.some((warning) => warning.includes('invalid authorship')));
  assert.ok(warnings.some((warning) => warning.includes('invalid observation')));
  assert.ok(warnings.some((warning) => warning.includes('after the conversation')));
  assert.ok(warnings.some((warning) => warning.includes('inconsistent dates')));
  assert.ok(warnings.some((warning) => warning.includes('check-in')));
  assert.ok(warnings.some((warning) => warning.includes('no longer in the roster')));
});

test('delegation health separates overdue, blocked, checkpoint and terminal states', () => {
  const active = {
    id: 'd1', status: 'active', delegatedOn: '2026-10-01', dueOn: '2026-10-20',
    checkins: [{ id: 'c1', date: '2026-10-10', progress: 'blocked', note: 'Need a decision.' }],
  };
  const health = delegationHealth(active, NOW, { delegationCheckinDays: 7 });
  assert.equal(health.status, 'blocked');
  assert.equal(health.blocked, true);
  assert.equal(health.overdue, true);
  assert.equal(health.daysOverdue, 4);
  assert.equal(health.checkinAge, 14);

  const checkpoint = delegationHealth({ ...active, dueOn: '2026-11-01', checkins: [{ id: 'c2', date: '2026-10-23', progress: 'on-track' }] }, NOW, { delegationCheckinDays: 7 });
  assert.equal(checkpoint.status, 'on-track');
  const due = delegationHealth({ ...active, dueOn: '2026-11-01', checkins: [] }, NOW, { delegationCheckinDays: 7 });
  assert.equal(due.status, 'checkin-due');
  assert.equal(delegationHealth({ ...active, status: 'done', completedOn: '2026-10-20' }, NOW).status, 'done');
  assert.equal(delegationHealth({ ...active, status: 'returned', returnedOn: '2026-10-20' }, NOW).status, 'returned');
  const summary = delegationSummary({ delegations: [active] }, NOW, { delegationCheckinDays: 7 });
  assert.equal(summary.overdue, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.attention.length, 1);
});

test('delegation actions validate the outcome, authority, support and dates before writing', () => {
  const { store, api } = apiHarness();
  const { id: personId } = api.addPerson({ name: 'Ada' });
  for (const patch of [{ expectedOutcome: '' }, { support: '' }, { authority: 'invented' }, { dueOn: null }, { dueOn: '2026-09-01' }, { delegatedOn: '2026-02-31' }, { delegatedOn: '2026-10-25' }]) {
    assert.equal(api.addDelegation(delegationInput(personId, patch)).ok, false, JSON.stringify(patch));
  }
  assert.equal(store.state.delegations.length, 0);
  const created = api.addDelegation(delegationInput(personId));
  assert.equal(created.ok, true);
  const record = store.state.delegations[0];
  assert.equal(record.status, 'active');
  assert.equal(record.authority, 'act-inform');
  assert.deepEqual(record.checkins, []);
  assert.equal(store.state.events.at(-1).type, 'delegation.created');
});

test('delegation check-ins are dated, audited, and a later same-day note can unblock', () => {
  const { store, api } = apiHarness();
  const { id: personId } = api.addPerson({ name: 'Ada' });
  const { id } = api.addDelegation(delegationInput(personId, { dueOn: '2026-11-01' }));
  assert.equal(api.checkInDelegation(id, { date: '2026-09-30', progress: 'blocked', note: 'Too early.' }).ok, false);
  assert.equal(api.checkInDelegation(id, { date: '2026-10-25', progress: 'blocked', note: 'Future.' }).ok, false);
  assert.equal(api.checkInDelegation(id, { date: '2026-10-24', progress: 'blocked', note: '' }).ok, false);
  assert.equal(api.checkInDelegation(id, { date: '2026-10-24', progress: 'blocked', note: 'Waiting on budget approval.' }).ok, true);
  assert.equal(delegationHealth(store.state.delegations[0], NOW, store.state.settings).status, 'blocked');
  assert.equal(api.checkInDelegation(id, { date: '2026-10-24', progress: 'on-track', note: 'Budget approved; owner is proceeding.' }).ok, true);
  const record = store.state.delegations[0];
  assert.equal(record.checkins.length, 2);
  assert.equal(delegationHealth(record, NOW, store.state.settings).status, 'on-track');
  assert.equal(store.state.events.at(-1).type, 'delegation.checkin');
});

test('delegation completion and return are explicit terminal outcomes that survive reload', () => {
  const { store, api, storage } = apiHarness();
  const { id: personId } = api.addPerson({ name: 'Ada' });
  const first = api.addDelegation(delegationInput(personId));
  assert.equal(api.checkInDelegation(first.id, { date: '2026-10-23', progress: 'on-track', note: 'Ready for final review.' }).ok, true);
  assert.equal(api.completeDelegation(first.id, { completedOn: '2026-10-22', completionNote: 'Invalid chronology.' }).ok, false);
  assert.equal(api.completeDelegation(first.id, { completedOn: '2026-10-24', completionNote: '' }).ok, false);
  assert.equal(api.completeDelegation(first.id, { completedOn: '2026-10-24', completionNote: 'Weekly review is live; next monthly audit is 24 November.' }).ok, true);
  assert.equal(api.updateDelegation(first.id, { title: 'Rewrite history' }).ok, false);
  const second = api.addDelegation(delegationInput(personId, { title: 'Draft the budget' }));
  assert.equal(api.checkInDelegation(second.id, { date: '2026-10-23', progress: 'blocked', note: 'Scope needs a leadership decision.' }).ok, true);
  assert.equal(api.returnDelegation(second.id, { returnedOn: '2026-10-22', returnReason: 'Invalid chronology.' }).ok, false);
  assert.equal(api.returnDelegation(second.id, { returnedOn: '2026-10-24', returnReason: 'Planning moved centrally; leader will reissue the scope.' }).ok, true);

  const reloaded = createStore({ storage, now: () => NOW });
  reloaded.load();
  assert.equal(reloaded.state.delegations.length, 2);
  assert.equal(reloaded.state.delegations.find((item) => item.id === first.id).status, 'done');
  assert.equal(reloaded.state.delegations.find((item) => item.id === second.id).status, 'returned');
  assert.ok(reloaded.state.events.some((event) => event.type === 'delegation.completed'));
  assert.ok(reloaded.state.events.some((event) => event.type === 'delegation.returned'));
});

test('delegation signals and 1:1 agendas point to the outcome that needs follow-through', () => {
  const { store, api } = apiHarness();
  const { id: personId } = api.addPerson({ name: 'Ada', startDate: '2025-01-01' });
  const { id } = api.addDelegation(delegationInput(personId));
  api.checkInDelegation(id, { date: '2026-10-24', progress: 'blocked', note: 'Need a staffing decision.' });
  const finding = buildInsights(store.state, NOW).findings.find((item) => item.ruleId === 'DEL-02');
  assert.ok(finding);
  assert.equal(finding.action.route, `#/delegations?delegation=${id}`);
  assert.ok(finding.evidence.some((line) => line.includes('Decision authority')));
  const suggestion = suggestAgenda(store.state, personId, NOW, store.state.settings).find((item) => item.source === 'delegation');
  assert.ok(suggestion);
  assert.ok(suggestion.text.includes('customer-risk review'));
  api.completeDelegation(id, { completedOn: '2026-10-24', completionNote: 'Review launched with agreed staffing.' });
  assert.equal(buildInsights(store.state, NOW).findings.some((item) => item.ruleId === 'DEL-02'), false);
});

test('review evidence includes latency, goal authorship and dated delegation outcomes', () => {
  const state = domainState();
  state.feedback = [{ id: 'f1', personId: 'p1', direction: 'given', kind: 'constructive', behavior: 'behavior', impact: 'impact', date: '2026-10-20', observedOn: '2026-10-01' }];
  state.goals = [{
    id: 'g1', ownerId: 'p1', title: 'Co-owned objective', status: 'active', confidence: 'on-track', coAuthored: false,
    createdAt: '2026-09-01T09:00:00.000Z', dueDate: '2026-11-01', keyResults: [],
    checkins: [{ id: 'gc1', date: '2026-10-10', note: 'Scope reviewed.', confidence: 'on-track' }],
  }];
  state.delegations = [{
    id: 'd1', personId: 'p1', title: 'Own the review', expectedOutcome: 'A reliable weekly review.', authority: 'own', support: 'Dashboard access.',
    delegatedOn: '2026-10-01', dueOn: '2026-10-20', status: 'done',
    checkins: [{ id: 'dc1', date: '2026-10-10', progress: 'blocked', note: 'Needed access.', createdAt: ISO }],
    completedOn: '2026-10-20', completionNote: 'Weekly review is live.', returnedOn: null, returnReason: '', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: ISO,
  }];
  const evidence = buildReviewEvidence(normalizeState(state).state, 'p1', '2026-10-01', '2026-10-24');
  assert.ok(evidence.find((item) => item.sourceId === 'f1').meta.includes('19d observation-to-conversation gap'));
  assert.ok(evidence.find((item) => item.sourceId === 'g1').meta.includes('explicitly leader-set'));
  const delegation = evidence.find((item) => item.sourceId === 'd1');
  assert.equal(delegation.sourceType, 'delegation');
  assert.equal(delegation.date, '2026-10-20');
  assert.equal(delegation.valence, 'positive');
  assert.equal(delegation.detail, 'Weekly review is live.');
  assert.ok(delegation.meta.includes('Own the outcome'));
  assert.equal(delegation.route, '#/delegations?delegation=d1');
});

test('demo signals are computed and clearing demo preserves only real-person delegations', () => {
  const demo = buildDemoState(NOW);
  const feedback = teamFeedbackSummary(demo, NOW, demo.settings);
  assert.equal(feedback.latencySamples, 4);
  assert.equal(feedback.averageLatency, 3);
  assert.equal(feedback.delayedLatency, 1);
  assert.equal(demo.delegations.length, 4);
  const rules = new Set(buildInsights(demo, NOW).findings.map((finding) => finding.ruleId));
  for (const rule of ['FB-06', 'GOAL-06', 'DEL-02', 'DEL-03']) assert.ok(rules.has(rule), `${rule} should fire from demo evidence`);

  const { store, api } = apiHarness();
  assert.equal(store.seedDemo().ok, true);
  const demoPerson = store.state.people[0];
  const real = api.addPerson({ name: 'Real Person' });
  api.addDelegation(delegationInput(demoPerson.id, { title: 'User note on demo person' }));
  const realDelegation = api.addDelegation(delegationInput(real.id, { title: 'Real delegation' }));
  store.clearDemo();
  assert.equal(store.state.people.length, 1);
  assert.equal(store.state.delegations.length, 1);
  assert.equal(store.state.delegations[0].id, realDelegation.id);
  assert.equal(store.state.meta.isDemo, false);
});

/* -------------------------------------------------------------- real DOM */

function boot() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => consoleErrors.push(error.message));
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
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

let appModule;
async function appFor(env) {
  appModule ||= await import('../../app/main.js');
  return appModule.createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });
}

function click(node) {
  assert.ok(node, 'expected element to click');
  node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function byText(env, text, scope = env.document, exact = false) {
  return [...scope.querySelectorAll('button, a')].find((element) => exact ? element.textContent.trim() === text : element.textContent.trim().toLowerCase().includes(text.toLowerCase()));
}

function setValue(input, value) {
  assert.ok(input, 'expected form field');
  input.value = value;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

function dialog(env) {
  const node = env.document.querySelector('[role="dialog"]');
  assert.ok(node, 'expected an open dialog');
  return node;
}

function saveDialog(env) {
  const primary = dialog(env).querySelector('.modal-foot .btn-primary');
  assert.ok(primary, 'expected a primary save button');
  click(primary);
}

test('feedback UI records observation latency and filters only delayed measured items', async () => {
  const env = boot();
  const app = await appFor(env);
  const { id: personId } = app.api.addPerson({ name: 'Ada' });
  app.navigate('#/feedback');
  click(byText(env, 'Give constructive', env.document.getElementById('view')));
  const form = dialog(env);
  setValue(form.querySelector('input[name="observedOn"]'), '2026-10-01');
  setValue(form.querySelector('textarea[name="behavior"]'), 'you shared the design two hours before the review without a summary');
  saveDialog(env);
  assert.equal(app.store.state.feedback[0].observedOn, '2026-10-01');
  app.api.addFeedback({ personId, behavior: 'you documented the final decision', date: '2026-10-22', observedOn: null });

  app.navigate('#/feedback?filter=latency');
  let view = env.document.getElementById('view');
  assert.equal(view.querySelectorAll('tbody tr').length, 1, 'unknown latency is not included as delayed');
  assert.ok(view.textContent.includes('23d to discuss'));
  app.navigate('#/feedback');
  view = env.document.getElementById('view');
  assert.ok(view.textContent.includes('Observation date not recorded'));
  assert.ok(view.textContent.includes('1 measured · 1 unknown'));
  const unknownRow = [...view.querySelectorAll('tbody tr')].find((row) => row.textContent.includes('Observation date not recorded'));
  click(byText(env, 'Edit dates', unknownRow, true));
  setValue(dialog(env).querySelector('input[name="observedOn"]'), '2026-10-21');
  saveDialog(env);
  assert.equal(app.store.state.feedback.find((item) => item.date === '2026-10-22').observedOn, '2026-10-21');
  assert.ok(env.document.getElementById('view').textContent.includes('2 measured · 0 unknown'));
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
});

test('goal edit UI corrects co-authorship without replacing key results or history', async () => {
  const env = boot();
  const app = await appFor(env);
  const { id: personId } = app.api.addPerson({ name: 'Ada', startDate: '2025-01-01' });
  const created = app.api.addGoal({
    title: 'Improve activation', ownerId: personId, coAuthored: null,
    keyResults: [{ title: 'Activation', start: 0, target: 100, current: 40, unit: '%' }],
  });
  app.api.checkInGoal(created.id, { note: 'Initial scope reviewed.', confidence: 'on-track' });
  app.navigate(`#/goals?goal=${created.id}`);
  click(byText(env, 'Edit goal', env.document.getElementById('view'), true));
  setValue(dialog(env).querySelector('select[name="coAuthored"]'), 'false');
  saveDialog(env);
  assert.equal(app.store.state.goals[0].coAuthored, false);
  assert.ok(env.document.getElementById('view').textContent.includes('leader-set'));
  assert.ok(buildInsights(app.store.state, NOW).findings.some((finding) => finding.ruleId === 'GOAL-06'));

  click(byText(env, 'Edit goal', env.document.getElementById('view'), true));
  setValue(dialog(env).querySelector('select[name="coAuthored"]'), 'true');
  saveDialog(env);
  const goal = app.store.state.goals[0];
  assert.equal(goal.id, created.id);
  assert.equal(goal.coAuthored, true);
  assert.equal(goal.keyResults.length, 1);
  assert.equal(goal.checkins.length, 1);
  assert.ok(env.document.getElementById('view').textContent.includes('co-authored'));
  assert.equal(buildInsights(app.store.state, NOW).findings.some((finding) => finding.ruleId === 'GOAL-06'), false);
});

test('delegation UI supports create, blocked check-in, edit, completion and review source links', async () => {
  const env = boot();
  const app = await appFor(env);
  const { id: personId } = app.api.addPerson({ name: 'Ada', startDate: '2025-01-01' });
  app.navigate('#/delegations');
  click(byText(env, 'Delegate an outcome', env.document.getElementById('view')));
  let form = dialog(env);
  setValue(form.querySelector('input[name="title"]'), 'Own the customer-risk review');
  setValue(form.querySelector('textarea[name="expectedOutcome"]'), 'Every customer risk has an owner and a weekly next action.');
  setValue(form.querySelector('select[name="authority"]'), 'own');
  setValue(form.querySelector('textarea[name="support"]'), 'Dashboard access and a weekly escalation slot.');
  setValue(form.querySelector('input[name="delegatedOn"]'), '2026-10-01');
  setValue(form.querySelector('input[name="dueOn"]'), '2026-10-20');
  saveDialog(env);
  const id = app.store.state.delegations[0].id;
  assert.ok(env.document.getElementById('view').textContent.includes('Overdue'));

  click(byText(env, 'Check in', env.document.querySelector('.delegation-card'), true));
  form = dialog(env);
  setValue(form.querySelector('select[name="progress"]'), 'blocked');
  setValue(form.querySelector('textarea[name="note"]'), 'Need a staffing decision before the next review.');
  saveDialog(env);
  assert.ok(env.document.getElementById('view').textContent.includes('Support is needed now'));

  click(byText(env, 'Edit', env.document.querySelector('.delegation-card'), true));
  form = dialog(env);
  setValue(form.querySelector('textarea[name="support"]'), 'Dashboard access, staffing decision and weekly escalation slot.');
  saveDialog(env);
  assert.equal(app.store.state.delegations[0].checkins.length, 1);

  click(byText(env, 'Mark completed', env.document.querySelector('.delegation-card'), true));
  form = dialog(env);
  setValue(form.querySelector('textarea[name="completionNote"]'), 'Weekly review launched with staffing agreed; next audit is in one month.');
  saveDialog(env);
  assert.equal(app.store.state.delegations[0].status, 'done');
  app.navigate('#/delegations?filter=all');
  assert.ok(env.document.getElementById('view').textContent.includes('Outcome completed'));

  const review = app.api.createReview({ personId, periodStart: '2026-10-01', periodEnd: '2026-10-24' });
  const item = app.store.state.reviews.find((entry) => entry.id === review.id).evidence.find((entry) => entry.sourceType === 'delegation');
  assert.ok(item);
  app.navigate(item.route);
  assert.equal(env.document.querySelectorAll('.delegation-card.is-focused').length, 1);
  for (const type of ['delegation.created', 'delegation.checkin', 'delegation.updated', 'delegation.completed']) {
    assert.ok(app.store.state.events.some((event) => event.type === type), `${type} audited`);
  }
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
});

test('settings UI exposes both conventions and persists them with the current schema', async () => {
  const env = boot();
  const app = await appFor(env);
  app.navigate('#/settings');
  assert.ok(env.document.getElementById('view').textContent.includes(`Schema v${SCHEMA_VERSION}`));
  assert.ok(env.document.getElementById('view').textContent.includes('Observation → conversation convention'));
  click(byText(env, 'Edit cadences', env.document.getElementById('view')));
  const form = dialog(env);
  setValue(form.querySelector('input[name="feedbackLatencyTargetDays"]'), '10');
  setValue(form.querySelector('input[name="delegationCheckinDays"]'), '9');
  saveDialog(env);
  assert.equal(app.store.state.settings.feedbackLatencyTargetDays, 10);
  assert.equal(app.store.state.settings.delegationCheckinDays, 9);
  assert.ok(env.document.getElementById('view').textContent.includes('10 days'));
  assert.ok(env.document.getElementById('view').textContent.includes('9 days'));
});
