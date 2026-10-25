/** Actionable delegation follow-through queue: pure priority, direct capture and audit persistence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { dueDelegationCheckins } from '../../app/core/domain/delegations.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-25T10:00:00.000Z');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function harness(storage = memoryStorage()) {
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-q-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage };
}

function makeState(delegations, people = [{ id: 'p', name: 'Avery', status: 'active' }]) {
  return { ...createEmptyState(NOW.toISOString()), people, delegations };
}

function delegation(id, patch = {}) {
  return {
    id, personId: 'p', title: `Outcome ${id}`, expectedOutcome: 'A usable outcome with a named result.',
    authority: 'act-inform', support: 'Leader available for questions.', delegatedOn: '2026-10-01',
    dueOn: '2026-11-01', status: 'active', checkins: [],
    ...patch,
  };
}

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => consoleErrors.push(error.message));
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const style = window.document.createElement('style');
  style.textContent = CSS;
  window.document.head.append(style);
  Object.assign(globalThis, {
    window, document: window.document, Node: window.Node, Element: window.Element,
    HTMLElement: window.HTMLElement, Event: window.Event, MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent, FileReader: window.FileReader, localStorage: window.localStorage,
  });
  return { dom, window, document: window.document, consoleErrors };
}

function click(node) {
  assert.ok(node, 'expected a DOM node');
  node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function setValue(input, value) {
  assert.ok(input, 'expected an input');
  input.value = value;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

function save(document) {
  click(document.querySelector('[role="dialog"] .modal-foot .btn-primary'));
}

async function runAxe(env, selector) {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  return env.window.axe.run(env.document.querySelector(selector), {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
}

test('delegation queue prioritizes blocked and late outcomes, then missing dates and stale check-ins; closes never leak in', () => {
  const state = makeState([
    delegation('stale', { delegatedOn: '2026-10-01', dueOn: '2026-11-30' }),
    delegation('blocked', { checkins: [{ id: 'c1', date: '2026-10-24', progress: 'blocked', note: 'Needs help.' }] }),
    delegation('late', { dueOn: '2026-10-20', checkins: [{ id: 'c2', date: '2026-10-23', progress: 'on-track', note: 'Moving.' }] }),
    delegation('unscheduled', { dueOn: null }),
    delegation('fresh', { delegatedOn: '2026-10-24', dueOn: '2026-11-20' }),
    delegation('done', { status: 'done', dueOn: '2026-10-01' }),
  ]);
  const snapshot = JSON.stringify(state);
  for (const key of ['conflicts', 'pulses', 'reviews']) Object.defineProperty(state, key, { get() { throw new Error(`must not read ${key}`); } });
  const rows = dueDelegationCheckins(state, NOW, { delegationCheckinDays: 7 });
  assert.deepEqual(rows.map(({ delegation: item, kind }) => [item.id, kind]), [
    ['blocked', 'blocked'], ['late', 'overdue'], ['unscheduled', 'unscheduled'], ['stale', 'checkin-due'],
  ]);
  const after = JSON.parse(snapshot);
  assert.deepEqual(state.delegations, after.delegations);
  assert.deepEqual(state.people, after.people);
  assert.equal(dueDelegationCheckins({}, NOW).length, 0);
});

test('Today records a blocked delegation check-in in place; cancel is inert and successful save is audited/reloadable', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    const person = app.api.addPerson({ name: 'Riley Example' });
    assert.equal(person.ok, true);
    const outcome = app.api.addDelegation({
      personId: person.id, title: 'Prepare the customer handoff',
      expectedOutcome: 'A handoff the receiving team can use.', authority: 'act-inform',
      support: 'Leader will unblock access.', delegatedOn: '2026-10-01', dueOn: '2026-11-01',
    });
    assert.equal(outcome.ok, true, outcome.error);
    assert.equal(app.api.checkInDelegation(outcome.id, { date: '2026-10-24', progress: 'blocked', note: 'Waiting for access.' }).ok, true);

    app.navigate('#/today');
    let queue = env.document.querySelector('#delegation-checkins');
    assert.ok(queue);
    assert.match(queue.textContent, /1 blocked/);
    assert.equal(queue.querySelectorAll('li[data-delegation-id]').length, 1);
    assert.equal(queue.querySelector('a[href="#/delegations?filter=attention"]').textContent, 'All 1 outcomes');
    assert.equal((await runAxe(env, '#view')).violations.length, 0);
    const before = JSON.stringify(app.store.state);
    click(queue.querySelector('button[aria-label="Record check-in for Prepare the customer handoff"]'));
    let dialog = env.document.querySelector('[role="dialog"]');
    assert.match(dialog.textContent, /Ask about progress and support without taking the outcome back/);
    assert.equal((await runAxe(env, '[role="dialog"]')).violations.length, 0);
    click(dialog.querySelector('button[aria-label="Close dialog"]'));
    assert.equal(JSON.stringify(app.store.state), before, 'cancel writes nothing');

    queue = env.document.querySelector('#delegation-checkins');
    click(queue.querySelector('button[aria-label="Record check-in for Prepare the customer handoff"]'));
    dialog = env.document.querySelector('[role="dialog"]');
    setValue(dialog.querySelector('[name="note"]'), 'Leader restored access; Riley will continue independently.');
    save(env.document);
    assert.equal(env.document.querySelector('[role="dialog"]'), null);
    assert.equal(env.document.querySelector('#delegation-checkins'), null, 'an on-track check-in clears the attention row, not the delegation');
    const saved = app.store.state.delegations.find((item) => item.id === outcome.id);
    assert.equal(saved.status, 'active');
    assert.equal(saved.checkins.at(-1).progress, 'on-track');
    assert.equal(saved.checkins.at(-1).note, 'Leader restored access; Riley will continue independently.');
    assert.ok(app.store.state.events.some((event) => event.type === 'delegation.checkin' && event.entityId === outcome.id));

    const reloaded = harness(env.window.localStorage);
    assert.equal(reloaded.store.state.delegations[0].checkins.at(-1).note, saved.checkins.at(-1).note);
    assert.equal(reloaded.store.state.delegations[0].status, 'active');
    assert.deepEqual(env.consoleErrors, []);
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
});

test('Today completion is explicit, requires the delivered outcome, and preserves a terminal audit record', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    const person = app.api.addPerson({ name: 'Jordan Example' });
    const outcome = app.api.addDelegation({
      personId: person.id, title: 'Publish the service handoff',
      expectedOutcome: 'Receiving team has the operational handoff.', authority: 'own',
      support: 'Leader available for escalation.', delegatedOn: '2026-10-01', dueOn: '2026-10-20',
    });
    assert.equal(outcome.ok, true, outcome.error);
    app.navigate('#/today');
    const row = env.document.querySelector(`#delegation-checkins li[data-delegation-id="${outcome.id}"]`);
    assert.ok(row);
    click(row.querySelector('button[aria-label="Complete delegated outcome: Publish the service handoff"]'));
    const dialog = env.document.querySelector('[role="dialog"]');
    assert.match(dialog.textContent, /Close the loop with the result actually delivered/);
    save(env.document);
    assert.ok(env.document.querySelector('[role="dialog"]'), 'completion without outcome evidence is refused');
    setValue(dialog.querySelector('[name="completionNote"]'), 'Runbook and access handoff accepted by the receiving team.');
    save(env.document);
    assert.equal(env.document.querySelector('[role="dialog"]'), null);
    assert.equal(app.store.state.delegations.find((item) => item.id === outcome.id).status, 'done');
    assert.ok(app.store.state.events.some((event) => event.type === 'delegation.completed' && event.entityId === outcome.id));
    assert.equal(env.document.querySelector('#delegation-checkins'), null, 'completed outcomes leave the attention queue');
    assert.deepEqual(env.consoleErrors, []);
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
});

test('Today keeps actionable delegation work visible after the owner leaves the active roster', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    const person = app.api.addPerson({ name: 'Former teammate' });
    const outcome = app.api.addDelegation({
      personId: person.id, title: 'Finish the handoff', expectedOutcome: 'A complete handoff.',
      authority: 'own', support: 'Leader is available.', delegatedOn: '2026-10-01', dueOn: '2026-10-20',
    });
    assert.equal(outcome.ok, true);
    assert.equal(app.api.archivePerson(person.id).ok, true);
    app.navigate('#/today');
    assert.match(env.document.querySelector('#delegation-checkins').textContent, /Former teammate · archived/);
    assert.ok(env.document.querySelector('#delegation-checkins button[aria-label="Record check-in for Finish the handoff"]'));
    assert.deepEqual(env.consoleErrors, []);
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
});
