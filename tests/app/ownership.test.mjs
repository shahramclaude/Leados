/**
 * tests/app/ownership.test.mjs — commitment ownership and the leader's own debt.
 *
 * Schema v8 records who owes a 1:1 promise (them / the leader / shared) and
 * leaves it null when nobody said. These tests cover the migration, the write
 * path, the carry rule, the leader-obligation roll-up, the CONV-07 signal, the
 * export and the two screens where the debt has to be visible.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  ACTION_OWNERS,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  isLeaderOwned,
  leaderObligations,
  openActions,
  ownershipSummary,
  ownerPhrase,
  commitmentCounts,
} from '../../app/core/domain/oneonone.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { buildPrepSheet } from '../../app/core/domain/prep.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

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

function person(id, name) {
  return {
    id, name, role: 'Engineer', level: 'senior', team: 'Core', managerId: null,
    startDate: '2025-01-01', focus: '', status: 'active', createdAt: '2025-01-01T09:00:00.000Z', archivedAt: null,
  };
}

function meeting(id, date, actions) {
  return { id, personId: 'p1', date, status: 'held', mood: 3, agenda: [], notes: 'A real conversation happened here.', actions, createdAt: `${date}T09:00:00.000Z` };
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
    owner: null,
    carriedFrom: null,
    carriedToMeetingId: null,
    carriedToActionId: null,
    ...overrides,
  };
}

/* ------------------------------------------------------ schema & migration */

test('schema v7 → v8 records ownership as unknown instead of inventing it', () => {
  assert.equal(SCHEMA_VERSION, 11);
  assert.deepEqual(ACTION_OWNERS, ['them', 'leader', 'shared']);

  const v7 = {
    schemaVersion: 7,
    people: [person('p1', 'Ada')],
    oneOnOnes: [meeting('m1', '2026-10-01', [
      action('a1', 'Ship the runbook', { due: '2026-10-10' }),
      action('a2', 'Chase legal', { done: true, completedOn: '2026-10-01', completedInMeetingId: 'm1' }),
    ])],
    growthPlans: [{
      id: 'gp1', personId: 'p1', goal: 'Become the person the team asks about schema design choices',
      reality: 'Reviews are rushed and decisions get re-litigated', options: [{ id: 'o1', text: 'shadow Priya' }],
      will: [{ id: 'w1', text: 'Run three schema reviews', due: '2026-11-01', done: false }],
      status: 'active', reviewOn: '2026-11-15', createdAt: '2026-09-01T09:00:00.000Z',
    }],
  };
  const snapshot = JSON.stringify(v7);
  const migrated = migrate(v7);
  assert.equal(JSON.stringify(v7), snapshot, 'migration must never mutate its input');
  assert.deepEqual(migrated.applied, ['7 → 8', '8 → 9', '9 → 10', '10 → 11']);

  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.deepEqual(warnings, []);
  assert.equal(state.schemaVersion, 11);
  for (const item of state.oneOnOnes[0].actions) {
    assert.equal(item.owner, null, 'nobody recorded an owner in v7, so none is invented');
    assert.ok('owner' in item, 'the field exists so the UI can ask for it');
  }
  assert.equal(state.growthPlans[0].will[0].owner, undefined, 'a GROW action is the report\'s by definition');
});

test('a relabelled v8 file keeps a real owner, and an impossible one is cleared out loud', () => {
  const v8 = {
    schemaVersion: 8,
    people: [person('p1', 'Ada')],
    oneOnOnes: [meeting('m1', '2026-10-01', [
      action('a1', 'Done differently', { owner: 'leader' }),
      action('a2', 'Nonsense owner', { owner: 'the-intern' }),
      action('a3', 'Shared work', { owner: 'SHARED ' }),
      action('a4', 'Unrecorded', { owner: 42 }),
    ])],
  };
  const { state, warnings } = normalizeState(migrate(v8).raw, { now: NOW });
  const byId = Object.fromEntries(state.oneOnOnes[0].actions.map((a) => [a.id, a]));
  assert.equal(byId.a1.owner, 'leader');
  assert.equal(byId.a3.owner, 'shared', 'case and whitespace are normalised, not rejected');
  assert.equal(byId.a2.owner, null);
  assert.equal(byId.a4.owner, null);
  assert.ok(warnings.some((w) => w.includes('cleared 2 unrecognised commitment owner(s)')), warnings.join(' | '));
});

/* ------------------------------------------------------------ write paths */

test('logging a 1:1 stores who owes each promise and refuses an unknown owner', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Mei Chen' }).id;
  const base = { personId, date: '2026-10-10', status: 'held', notes: 'Agreed the split of work clearly' };

  const bad = h.api.logOneOnOne({ ...base, actions: [{ text: 'Something', owner: 'nobody' }] });
  assert.equal(bad.ok, false);
  assert.equal(bad.field, 'actionOwner');
  assert.match(bad.error, /who owes/i);
  assert.equal(h.store.state.oneOnOnes.length, 0, 'nothing was written');

  const logged = h.api.logOneOnOne({
    ...base,
    actions: [
      { text: 'Draft the migration plan', owner: 'them', due: '2026-10-20' },
      { text: 'Escalate the legal block', owner: 'leader', due: '2026-10-18' },
      { text: 'Review the plan together', owner: 'shared' },
      { text: 'Something unnamed' },
    ],
  });
  assert.equal(logged.ok, true);
  const actions = h.store.state.oneOnOnes[0].actions;
  assert.deepEqual(actions.map((a) => a.owner), ['them', 'leader', 'shared', null]);

  const added = h.api.addMeetingAction(h.store.state.oneOnOnes[0].id, 'Book the room', '2026-10-22', 'leader');
  assert.equal(added.ok, true);
  assert.equal(h.store.state.oneOnOnes[0].actions.at(-1).owner, 'leader');
  assert.equal(h.api.addMeetingAction(h.store.state.oneOnOnes[0].id, 'Bad', null, 'somebody').ok, false);
});

test('a carried promise keeps the owner it was agreed with', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Ada' }).id;
  const first = h.api.logOneOnOne({
    personId, date: '2026-09-20', status: 'held', notes: 'Set the legal chase up with an owner',
    actions: [{ text: 'Get legal sign-off', due: '2026-09-30', owner: 'leader' }, { text: 'Draft the memo', owner: 'them' }],
  });
  assert.equal(first.ok, true);
  const [legal, memo] = h.store.state.oneOnOnes[0].actions;

  const second = h.api.logOneOnOne({
    personId, date: '2026-10-05', status: 'held', notes: 'Legal was away; moved it with a date',
    reconciliations: [
      { meetingId: first.id, actionId: legal.id, outcome: 'carried', due: '2026-10-20' },
      { meetingId: first.id, actionId: memo.id, outcome: 'carried', due: '2026-10-18' },
    ],
  });
  assert.equal(second.carried, 2);
  const successors = h.store.state.oneOnOnes.find((m) => m.id === second.id).actions;
  assert.deepEqual(successors.map((a) => a.owner).sort(), ['leader', 'them']);
  assert.equal(successors.find((a) => a.text === 'Get legal sign-off').owner, 'leader');
});

test('ownership can be corrected on an open promise and never on a closed one', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Ada' }).id;
  const logged = h.api.logOneOnOne({
    personId, date: '2026-10-01', status: 'held', notes: 'Promised two things without saying who',
    actions: [{ text: 'Publish the plan', due: '2026-10-20' }, { text: 'Book the review', due: '2026-10-21' }],
  });
  const meetingId = logged.id;
  const [plan, review] = h.store.state.oneOnOnes[0].actions;

  assert.equal(h.api.setActionOwner(meetingId, plan.id, 'leader').ok, true);
  assert.equal(h.store.state.oneOnOnes[0].actions[0].owner, 'leader');
  const event = h.store.state.events.at(-1);
  assert.equal(event.type, 'oneonone.action.owner');
  assert.match(event.summary, /you own it/i);

  assert.equal(h.api.setActionOwner(meetingId, plan.id, 'leader').unchanged, true, 'no event for a no-op');

  assert.equal(h.api.setActionOwner(meetingId, plan.id, 'everyone').ok, false);
  assert.equal(h.api.setActionOwner(meetingId, 'missing', 'leader').ok, false);
  assert.equal(h.api.setActionOwner('missing', plan.id, 'leader').ok, false);

  assert.equal(h.api.toggleMeetingAction(meetingId, review.id).ok, true);
  const closed = h.api.setActionOwner(meetingId, review.id, 'leader');
  assert.equal(closed.ok, false);
  assert.match(closed.error, /already closed/i);

  // Carried copies: the original is history, the live copy is where it belongs.
  const second = h.api.logOneOnOne({
    personId, date: '2026-10-10', status: 'held', notes: 'Moved the plan into another week',
    reconciliations: [{ meetingId, actionId: plan.id, outcome: 'carried', due: '2026-10-24' }],
  });
  const carried = h.api.setActionOwner(meetingId, plan.id, 'them');
  assert.equal(carried.ok, false);
  assert.match(carried.error, /carried forward to the 1:1 on 2026-10-10/i);
  const live = h.store.state.oneOnOnes.find((m) => m.id === second.id).actions[0];
  assert.equal(h.api.setActionOwner(second.id, live.id, 'them').ok, true);
  assert.equal(h.store.state.oneOnOnes.find((m) => m.id === second.id).actions[0].owner, 'them');

  // Survives a real export → import cycle.
  const exported = h.store.exportJSON();
  const other = harness();
  assert.equal(other.store.importJSON(exported).ok, true);
  const reimported = other.store.state.oneOnOnes.find((m) => m.id === second.id).actions[0];
  assert.equal(reimported.owner, 'them');
});

/* ---------------------------------------------------------- domain roll-up */

test('the leader sees only their own promises, late ones first', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Ada' }).id;
  h.api.logOneOnOne({
    personId, date: '2026-09-20', status: 'held', notes: 'Three promises with three different owners',
    actions: [
      { text: 'Theirs, late', due: '2026-09-25', owner: 'them' },
      { text: 'Mine, not yet due', due: '2026-11-01', owner: 'leader' },
      { text: 'Mine, late', due: '2026-09-30', owner: 'leader' },
      { text: 'Shared, late', due: '2026-09-28', owner: 'shared' },
      { text: 'Nobody said', due: '2026-09-27' },
    ],
  });

  const mine = leaderObligations(h.store.state, { now: NOW });
  assert.deepEqual(mine.map((a) => a.text), ['Shared, late', 'Mine, late', 'Mine, not yet due']);
  assert.ok(mine.every((a) => isLeaderOwned(a)));
  assert.equal(ownerPhrase('leader'), 'you owe it');
  assert.equal(ownerPhrase(null), 'no owner');

  assert.equal(leaderObligations(h.store.state, { now: NOW, personId: 'nobody' }).length, 0);

  const summary = ownershipSummary(h.store.state, { now: NOW });
  assert.deepEqual(summary, { them: 1, leader: 2, shared: 1, unknown: 1, total: 5, leaderOverdue: 2 });
  const counts = commitmentCounts(h.store.state, NOW);
  assert.equal(counts.leaderOwned, 3);
  assert.equal(counts.leaderOverdue, 2);
  assert.equal(counts.unattributed, 1);
  assert.equal(counts.open, 5);
});

/* ---------------------------------------------------------------- signals */

test('CONV-07 names who is waiting on the leader, and clears when the promise is closed', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Mei Chen' }).id;
  const logged = h.api.logOneOnOne({
    personId, date: '2026-09-20', status: 'held', notes: 'The manager took the legal chase on themselves',
    actions: [
      { text: 'Get legal sign-off', due: '2026-09-30', owner: 'leader' },
      { text: 'Their own deadline', due: '2026-09-25', owner: 'them' },
    ],
  });
  const rules = () => buildInsights(h.store.state, NOW).findings;

  const mine = rules().filter((f) => f.ruleId === 'CONV-07');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].personId, personId);
  assert.equal(mine[0].severity, 3);
  assert.match(mine[0].title, /Mei Chen is waiting on a promise you own/);
  assert.match(mine[0].evidence[0], /Get legal sign-off/);
  assert.match(mine[0].evidence[0], /late/);

  // The team's own overdue promise is still reported — but as CONV-05, so one
  // fact is never counted twice.
  assert.equal(rules().filter((f) => f.ruleId === 'CONV-05').length, 1);

  h.api.toggleMeetingAction(logged.id, h.store.state.oneOnOnes[0].actions[0].id);
  assert.equal(rules().filter((f) => f.ruleId === 'CONV-07').length, 0);

  // Two promises the leader owes the same person raise the severity.
  const other = h.api.logOneOnOne({
    personId, date: '2026-10-01', status: 'held', notes: 'Two more promises landed on the manager',
    actions: [
      { text: 'Second overdue promise', due: '2026-10-05', owner: 'leader' },
      { text: 'Third overdue promise', due: '2026-10-06', owner: 'shared' },
    ],
  });
  assert.equal(other.ok, true);
  const escalated = rules().filter((f) => f.ruleId === 'CONV-07');
  assert.equal(escalated.length, 1);
  assert.equal(escalated[0].severity, 4);
});

/* ------------------------------------------------------- export & documents */

test('the CSV reports ownership truthfully and leaves GROW rows blank', () => {
  const state = buildDemoState(NOW);
  const exported = exportWorkspaceCsv(state, 'actions', { now: NOW });
  assert.equal(exported.ok, true);
  const parsed = parseCsv(exported.csv);
  const ownerCol = parsed.headers.indexOf('owner');
  assert.ok(ownerCol >= 0, 'actions export has an owner column');
  const rowFor = (text) => parsed.rows.find((r) => r[parsed.headers.indexOf('commitment')] === text);
  assert.equal(rowFor('Get legal sign-off on the billing data-retention clause')[ownerCol], 'leader');
  assert.equal(rowFor('Agree who owns the activation metric')[ownerCol], 'shared');
  const growRows = parsed.rows.filter((r) => r[parsed.headers.indexOf('source_type')] === 'GROW commitment');
  assert.ok(growRows.length > 0);
  assert.ok(growRows.every((r) => r[ownerCol] === ''), 'GROW commitments are not given a 1:1 owner');
});

test('the prep sheet says what the leader owes, and a historical snapshot keeps ownership', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Mei Chen' }).id;
  h.api.logOneOnOne({
    personId, date: '2026-09-20', status: 'held', notes: 'Split the work between the two of us explicitly',
    actions: [
      { text: 'Get legal sign-off', due: '2026-09-30', owner: 'leader' },
      { text: 'Draft the memo', due: '2026-10-30', owner: 'them' },
      { text: 'Unnamed work', due: '2026-10-30' },
    ],
  });
  const sheet = buildPrepSheet(h.store.state, personId, NOW, h.store.state.settings);
  assert.equal(sheet.mineCount, 1);
  assert.equal(sheet.unownedCount, 1);
  assert.equal(sheet.commitments.actions.find((a) => a.text === 'Get legal sign-off').owner, 'leader');

  const back = reconstructStateAt(h.store.state, '2026-09-25', { currentDay: '2026-10-24' });
  const row = back.state.oneOnOnes[0].actions.find((a) => a.text === 'Get legal sign-off');
  assert.equal(row.owner, 'leader', 'rewinding time does not erase who owed it');
  assert.equal(row.done, false);
});

/* -------------------------------------------------------------------- UI */

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

test('the board lets a leader name an owner in place and count what they owe', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });
  try {
    const personId = app.api.addPerson({ name: 'Mei Chen' }).id;
    app.api.logOneOnOne({
      personId, date: '2026-10-01', status: 'held', notes: 'One promise, nobody named as its owner yet',
      actions: [{ text: 'Get legal sign-off', due: '2026-10-20' }],
    });
    app.navigate('#/oneonones');
    let view = env.document.getElementById('view');
    const select = view.querySelector('select.owner-select');
    assert.ok(select, 'an open promise offers an owner select');
    assert.equal(select.value, '');
    assert.match(select.textContent, /Owner not recorded/);
    assert.ok(view.textContent.includes('with no owner named'), 'the board nudges the gap');

    setValue(select, 'leader');
    const stored = app.store.state.oneOnOnes[0].actions[0];
    assert.equal(stored.owner, 'leader');

    view = env.document.getElementById('view');
    assert.ok(view.textContent.includes('I owe'), 'the board counts the leader\'s own promises');
    const mine = view.querySelector('select.owner-select');
    assert.equal(mine.value, 'leader');
    assert.ok(mine.classList.contains('is-mine'), 'the leader\'s own promise is visually distinct');

    if (!env.window.axe) env.window.eval(AXE_SRC);
    const axe = await env.window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.equal(axe.violations.length, 0, JSON.stringify(axe.violations.map((violation) => violation.id)));

    // A closed promise has no owner control: ownership of history is fixed.
    app.api.toggleMeetingAction(app.store.state.oneOnOnes[0].id, stored.id);
    app.navigate('#/oneonones');
    view = env.document.getElementById('view');
    assert.equal(view.querySelector('select.owner-select'), null);
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
});

test('Today shows "What you owe" and the 1:1 dialog captures an owner', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });
  try {
    const personId = app.api.addPerson({ name: 'Mei Chen' }).id;
    app.api.logOneOnOne({
      personId, date: '2026-10-01', status: 'held', notes: 'The manager promised to chase legal themselves',
      actions: [{ text: 'Get legal sign-off', due: '2026-10-10', owner: 'leader' }],
    });

    app.navigate('#/today');
    let view = env.document.getElementById('view');
    const today = view.textContent.replace(/\s+/g, ' ');
    assert.match(today, /What you owe/);
    assert.match(today, /Get legal sign-off/);
    assert.match(today, /d late/);

    // The leader can close their own promise from the card.
    click(buttonByText(env, 'Done', view));
    assert.equal(app.store.state.oneOnOnes[0].actions[0].done, true);
    app.navigate('#/today');
    view = env.document.getElementById('view');
    assert.equal(/What you owe/.test(view.textContent), false, 'the debt disappears once it is settled');

    // The dialog asks who owes a new promise.
    app.navigate('#/oneonones');
    click(buttonByText(env, 'Log a 1:1', env.document.getElementById('view')));
    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    const ownerField = dialog.querySelector('select[name="actionOwner"]');
    assert.ok(ownerField, 'the 1:1 dialog asks who owes the new action');
    assert.match(ownerField.textContent, /I do it/);
    setValue(dialog.querySelector('input[name="action"]'), 'Send the revised legal brief');
    setValue(ownerField, 'leader');
    setValue(dialog.querySelector('textarea[name="notes"]'), 'Wrote down the two things each of us would do.');
    if (!env.window.axe) env.window.eval(AXE_SRC);
    const axe = await env.window.axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } });
    assert.equal(axe.violations.length, 0, JSON.stringify(axe.violations.map((violation) => violation.id)));

    click(dialog.querySelector('.modal-foot .btn-primary'));
    const logged = app.store.state.oneOnOnes.at(-1);
    assert.equal(logged.actions.at(-1).owner, 'leader');
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
});
