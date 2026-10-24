/**
 * Integration tests: the real index.html, the real modules, a real DOM.
 * jsdom does not execute type="module" scripts, so the app is constructed
 * explicitly against the parsed document — exactly the entry point the browser
 * uses, minus the script tag.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const NOW = new Date('2026-10-24T10:00:00.000Z');

function boot({ storageSeed = null } = {}) {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => consoleErrors.push(e.message));
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));

  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });

  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  if (storageSeed) {
    for (const [k, v] of Object.entries(storageSeed)) window.localStorage.setItem(k, v);
  }

  // Expose the browser globals the app modules expect.
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

let appModule = null;
async function getApp() {
  if (!appModule) appModule = await import('../../app/main.js');
  return appModule;
}

async function createAppInstance(env, options = {}) {
  const { createApp } = await getApp();
  return createApp({
    root: env.document.getElementById('view'),
    storage: env.window.localStorage,
    now: () => NOW,
    ...options,
  });
}

function $(selector) {
  return document.querySelector(selector);
}
function $$(selector) {
  return [...document.querySelectorAll(selector)];
}
function buttonByText(env, text, scope = null) {
  const root = scope || env.document;
  return [...root.querySelectorAll('button, a')].find((el) => el.textContent.trim().toLowerCase().includes(text.toLowerCase()));
}
function buttonByTextExact(env, text, scope = null) {
  const root = scope || env.document;
  return [...root.querySelectorAll('button, a')].find((el) => el.textContent.trim() === text);
}
function click(node) {
  assert.ok(node, 'expected an element to click');
  node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
}
function setValue(input, value) {
  input.value = value;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}
function submitDialog(env) {
  const dialog = $('[role="dialog"]');
  assert.ok(dialog, 'a dialog should be open');
  const save = [...dialog.querySelectorAll('.modal-foot button')].find((b) => /^(add|save|create|record|log|confirm|set)/i.test(b.textContent.trim()));
  assert.ok(save, `save button present (saw: ${[...dialog.querySelectorAll('.modal-foot button')].map((b) => b.textContent).join(' | ')})`);
  click(save);
  return dialog;
}

/* ----------------------------------------------------------------- setup */

test('app boots on Today with an empty workspace and no errors', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  assert.equal(app.route, 'today');
  const view = env.document.getElementById('view');
  assert.ok(view.textContent.includes('Start with the people you lead'));
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  // Navigation is rendered with real links, not click handlers only.
  const nav = env.document.querySelectorAll('#sidebar-nav a');
  assert.ok(nav.length >= 10);
  assert.ok([...nav].some((a) => a.getAttribute('aria-current') === 'page'));
  assert.equal(app.store.state.people.length, 0, 'nothing is fabricated on first run');
});

test('every route renders without throwing', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  const routes = ['today', 'insights', 'people', 'oneonones', 'feedback', 'goals', 'growth', 'readiness', 'health', 'decisions', 'recognition', 'settings'];
  for (const route of routes) {
    app.navigate(`#/${route}`);
    const view = env.document.getElementById('view');
    assert.ok(view.querySelector('h1'), `${route} should render an h1`);
    assert.ok(!view.textContent.includes('This screen failed to draw'), `${route} rendered an error panel`);
    assert.ok(!view.textContent.includes('That page does not exist'), `${route} fell through to not-found`);
  }
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
});

test('an unknown route is a friendly dead end with a way back', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.navigate('#/not-a-real-screen');
  const view = env.document.getElementById('view');
  assert.ok(view.textContent.includes('That page does not exist'));
  assert.ok(buttonByText(env, 'Back to Today'));
});

/* ---------------------------------------------------------------- people */

test('adding a person through the dialog updates the roster and the audit log', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.navigate('#/people');
  click(buttonByText(env, 'Add person', env.document.getElementById('view')));

  const dialog = $('[role="dialog"]');
  assert.ok(dialog, 'the add-person dialog opens');
  setValue(dialog.querySelector('input[name="name"]'), 'Ada Lovelace');
  setValue(dialog.querySelector('input[name="role"]'), 'Staff Engineer');
  submitDialog(env);

  assert.equal($('[role="dialog"]'), null, 'dialog closes after saving');
  const state = app.store.state;
  assert.equal(state.people.length, 1);
  assert.equal(state.people[0].name, 'Ada Lovelace');
  assert.equal(state.events.at(-1).type, 'person.created');
  assert.ok(env.document.getElementById('view').textContent.includes('Ada Lovelace'));
});

test('a person with no name is rejected with a field error, not a silent failure', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.navigate('#/people');
  click(buttonByText(env, 'Add person', env.document.getElementById('view')));
  submitDialog(env);
  const dialog = $('[role="dialog"]');
  assert.ok(dialog, 'dialog stays open');
  assert.equal(app.store.state.people.length, 0);
  assert.ok(dialog.textContent.toLowerCase().includes('name is required'));
});

test('names that look like HTML are rendered as text, not markup', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.api.addPerson({ name: '<img src=x onerror=alert(1)>', role: 'Tester' });
  app.navigate('#/people');
  const view = env.document.getElementById('view');
  assert.equal(view.querySelectorAll('img').length, 0, 'no injected element');
  assert.ok(view.textContent.includes('<img src=x onerror=alert(1)>'), 'the name is inert text');
});

test('the person page shows an agenda built from the record, with reasons', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  const { id } = app.api.addPerson({ name: 'Jordan Alvarez', role: 'Product Manager', startDate: '2026-06-01' });
  app.navigate(`#/people/${id}`);
  const view = env.document.getElementById('view');
  assert.ok(view.textContent.includes('Prepared agenda for the next 1:1'));
  const items = view.querySelectorAll('.agenda-item');
  assert.ok(items.length >= 2, 'a fresh person still gets questions');
  assert.ok([...items].every((li) => li.textContent.includes('·')), 'each suggestion names its reason');
});

/* ------------------------------------------------------------------- 1:1s */

test('logging a 1:1 records notes, actions and an audit event', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  const { id } = app.api.addPerson({ name: 'Mei Chen' });
  app.navigate('#/oneonones');
  click(buttonByText(env, 'Log a 1:1', env.document.getElementById('view')));

  const dialog = $('[role="dialog"]');
  setValue(dialog.querySelector('select[name="personId"]'), id);
  setValue(dialog.querySelector('textarea[name="notes"]'), 'Talked through the migration risk and agreed to cut scope.');
  setValue(dialog.querySelector('input[name="action"]'), 'Send the revised plan');
  submitDialog(env);

  const state = app.store.state;
  assert.equal(state.oneOnOnes.length, 1);
  assert.equal(state.oneOnOnes[0].status, 'held');
  assert.equal(state.oneOnOnes[0].actions.length, 1);
  assert.equal(state.events.at(-1).type, 'oneonone.logged');
  // The action shows up on the board as a promise in flight.
  assert.ok(env.document.getElementById('view').textContent.includes('Send the revised plan'));
});

test('a skipped 1:1 is recorded as a signal rather than ignored', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  const { id } = app.api.addPerson({ name: 'Sam Okafor' });
  app.api.logOneOnOne({ personId: id, date: '2026-10-20', status: 'skipped' });
  app.api.logOneOnOne({ personId: id, date: '2026-10-13', status: 'moved' });
  app.navigate('#/insights');
  const text = env.document.getElementById('view').textContent;
  assert.ok(text.includes('moved or skipped'), 'the pattern surfaces as a finding');
});

/* ---------------------------------------------------------------- feedback */

test('feedback dialog computes SBI quality live and saves the note', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  const { id } = app.api.addPerson({ name: 'Priya N' });
  app.navigate('#/feedback');
  click(buttonByText(env, 'Give constructive', env.document.getElementById('view')));

  const dialog = $('[role="dialog"]');
  setValue(dialog.querySelector('input[name="situation"]'), 'In Thursday’s schema review');
  setValue(dialog.querySelector('textarea[name="behavior"]'), 'you always present a bad attitude about the design process');
  const preview = dialog.querySelector('.sbi-preview');
  assert.ok(preview.textContent.length > 10, 'quality feedback appears as you type');
  assert.ok(preview.textContent.toLowerCase().includes('always'), 'the coaching points at the vague phrase');

  submitDialog(env);
  assert.equal(app.store.state.feedback.length, 1);
  assert.equal(app.store.state.feedback[0].kind, 'constructive');
  assert.ok(env.document.getElementById('view').textContent.includes('Constructive'));
});

test('feedback with no behaviour is rejected and the dialog stays open', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.api.addPerson({ name: 'Bo' });
  app.navigate('#/feedback');
  click(buttonByText(env, 'Give praise', env.document.getElementById('view')));
  submitDialog(env);
  assert.ok($('[role="dialog"]'), 'dialog remains open');
  assert.equal(app.store.state.feedback.length, 0);
  assert.ok($('[role="dialog"]').textContent.includes('behaviour'));
});

/* ------------------------------------------------------------------- goals */

test('a goal gets measurable progress, and a check-in moves it', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  const { id } = app.api.addPerson({ name: 'Freya N' });
  app.navigate('#/goals');
  click(buttonByText(env, 'Set a goal', env.document.getElementById('view')));

  const dialog = $('[role="dialog"]');
  setValue(dialog.querySelector('input[name="title"]'), 'Cut time to first value');
  setValue(dialog.querySelector('select[name="ownerId"]'), id);
  setValue(dialog.querySelector('input[name="krTitle"]'), 'Median minutes to first value');
  setValue(dialog.querySelector('input[name="krStart"]'), '26');
  setValue(dialog.querySelector('input[name="krTarget"]'), '10');
  setValue(dialog.querySelector('input[name="krCurrent"]'), '26');
  submitDialog(env);

  const goal = app.store.state.goals[0];
  assert.ok(goal, 'goal created');
  const view = env.document.getElementById('view');
  assert.ok(view.textContent.includes('Cut time to first value'));
  assert.ok(view.querySelectorAll('.kr-item').length === 1);

  app.api.checkInGoal(goal.id, { note: 'Started the onboarding rewrite', confidence: 'at-risk', keyResults: [{ id: goal.keyResults[0].id, current: 18 }] });
  app.navigate('#/goals');
  assert.equal(app.store.state.goals[0].keyResults[0].current, 18);
  assert.equal(app.store.state.goals[0].confidence, 'at-risk');
  assert.ok(env.document.getElementById('view').textContent.includes('at-risk'));
});

test('a goal without key results is called out rather than scored as zero', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.api.addGoal({ title: 'Improve onboarding' });
  app.navigate('#/insights');
  const text = env.document.getElementById('view').textContent;
  assert.ok(text.includes('no key results'));
});

/* ------------------------------------------------------------------- pulse */

test('anonymous pulse results stay hidden until the anonymity floor is met', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.api.addPerson({ name: 'A' });
  app.api.addPerson({ name: 'B' });

  // The floor is five, the published default across vendors.
  for (let i = 0; i < 4; i += 1) {
    app.api.submitPulse({ scores: { safety: 2 + (i % 2), clarity: 3, workload: 2, growth: 3 }, anonymity: 'anonymous' });
  }
  app.navigate('#/health');
  let view = env.document.getElementById('view');
  assert.ok(view.textContent.includes('below the anonymity floor') || view.textContent.includes('Suppressed'), 'four responses stay hidden');

  app.api.submitPulse({ scores: { safety: 3, clarity: 3, workload: 2, growth: 3 }, anonymity: 'anonymous' });
  view = env.document.getElementById('view');
  assert.ok(view.textContent.includes('2/5'), 'the workload average is now shown');
  assert.ok(view.querySelector('.chart-svg'), 'the trend chart renders');
  assert.equal(app.store.state.pulses.filter((p) => p.anonymity === 'anonymous').every((p) => p.personId === null), true);
});

test('the pulse dialog stores no person when anonymity is chosen', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.api.addPerson({ name: 'Named person' });
  app.navigate('#/health');
  click(buttonByText(env, 'Record a response', env.document.getElementById('view')));
  const dialog = $('[role="dialog"]');
  const scales = dialog.querySelectorAll('.scale');
  assert.equal(scales.length, 4, 'four questions');
  for (const group of scales) {
    const option = group.querySelectorAll('input[type="radio"]')[3];
    option.checked = true;
    option.dispatchEvent(new env.window.Event('change', { bubbles: true }));
  }
  submitDialog(env);
  assert.equal(app.store.state.pulses.length, 1);
  assert.equal(app.store.state.pulses[0].personId, null);
});

/* --------------------------------------------------------------- decisions */

test('a decision can be logged, decided, and reviewed', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.navigate('#/decisions');
  click(buttonByText(env, 'Log a decision', env.document.getElementById('view')));
  let dialog = $('[role="dialog"]');
  setValue(dialog.querySelector('input[name="title"]'), 'Move support to pods');
  setValue(dialog.querySelector('input[name="approver"]'), 'Head of Platform');
  setValue(dialog.querySelector('input[name="optionA"]'), 'Three pods');
  setValue(dialog.querySelector('input[name="optionB"]'), 'One queue');
  submitDialog(env);

  const decision = app.store.state.decisions[0];
  assert.ok(decision);
  assert.equal(decision.chosen, '');

  app.navigate('#/decisions');
  click(buttonByTextExact(env, 'Decide', env.document.getElementById('view')));
  dialog = $('[role="dialog"]');
  setValue(dialog.querySelector('input[name="chosen"]'), 'Three pods');
  setValue(dialog.querySelector('textarea[name="rationale"]'), 'Ownership was unclear and escalation was the top complaint in the pulse.');
  submitDialog(env);
  assert.equal(app.store.state.decisions[0].chosen, 'Three pods');

  app.api.reviewDecision(decision.id, { outcome: 'mixed', outcomeNotes: 'Right call, slow rollout.' });
  assert.equal(app.store.state.decisions[0].outcome, 'mixed');
  assert.ok(app.store.state.decisions[0].reviewedOn);
});

/* --------------------------------------------------------- persistence etc. */

test('data survives a reload from the same storage', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.api.addPerson({ name: 'Persisted Person' });
  app.api.recordNote = null;
  const reloaded = await createAppInstance(env);
  assert.equal(reloaded.store.state.people.length, 1);
  assert.equal(reloaded.store.state.people[0].name, 'Persisted Person');
});

test('export → reset → import round-trips through the UI data layer', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.api.addPerson({ name: 'Keep Me' });
  app.api.addGoal({ title: 'A goal to keep' });
  const json = app.ctx.exportJSON();
  app.ctx.resetStore();
  assert.equal(app.store.state.people.length, 0);
  const result = app.ctx.importJSON(json);
  assert.equal(result.ok, true);
  assert.equal(app.store.state.people.length, 1);
  assert.equal(app.store.state.goals.length, 1);
  assert.ok(env.document.getElementById('view').textContent.includes('Keep Me') || app.route === 'today');
});

test('a corrupt saved blob opens an empty workspace and explains itself', async () => {
  const env = boot({ storageSeed: { 'leados.lifecycle.v1': '{broken json' } });
  const app = await createAppInstance(env);
  assert.equal(app.store.state.people.length, 0);
  assert.ok(app.store.warnings[0].toLowerCase().includes('unreadable'));
  app.navigate('#/today');
  assert.ok(env.document.getElementById('view').textContent.includes('Saved data needed repair'));
});

test('the demo workspace is labelled everywhere it appears', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.ctx.loadDemo();
  const view = env.document.getElementById('view');
  assert.ok(view.textContent.includes('demo workspace'), 'banner on Today');
  assert.ok(env.document.querySelector('.demo-chip'), 'chip in the top bar');
  assert.equal(app.store.state.meta.isDemo, true);

  app.navigate('#/settings');
  assert.ok(env.document.getElementById('view').textContent.includes('Demo workspace active'));
  app.ctx.clearDemo();
  assert.equal(app.store.state.people.length, 0);
  assert.equal(app.store.state.meta.isDemo, false);
});

test('a full demo workspace renders every screen without an error panel', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.ctx.loadDemo();
  const routes = ['today', 'insights', 'people', 'oneonones', 'feedback', 'recognition', 'goals', 'growth', 'readiness', 'health', 'decisions', 'settings'];
  for (const route of routes) {
    app.navigate(`#/${route}`);
    const view = env.document.getElementById('view');
    assert.ok(!view.textContent.includes('This screen failed to draw'), `${route} failed: ${view.textContent.slice(0, 300)}`);
  }
  app.navigate(`#/people/${app.store.state.people[0].id}`);
  assert.ok(!env.document.getElementById('view').textContent.includes('This screen failed to draw'));
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
});

test('setting a readiness rating to "ready now" without evidence is flagged in the UI', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  const { id } = app.api.addPerson({ name: 'Unproven Candidate', role: 'Engineer' });
  app.api.setReadiness({ personId: id, seat: 'Staff engineer', rating: 'ready-now' });
  app.navigate('#/readiness');
  const text = env.document.getElementById('view').textContent;
  assert.ok(text.includes('not supported by evidence') || text.includes('evidence'), 'the claim is questioned');
  assert.ok(text.includes('GAP'));
});

test('the settings screen reports the storage footprint and revision', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.api.addPerson({ name: 'Someone' });
  app.navigate('#/settings');
  const text = env.document.getElementById('view').textContent;
  assert.ok(text.includes('Schema v1'));
  assert.ok(text.includes('Event log'));
  assert.ok(text.includes('Export JSON'));
  assert.ok(app.store.sizeBytes() > 100);
});

test('loading the demo over real work asks before replacing it', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.api.addPerson({ name: 'Real Work' });
  const result = app.ctx.loadDemo();
  assert.equal(result.ok, false);
  assert.equal(app.store.state.people.length, 1, 'nothing was replaced');
  assert.ok(result.error.includes('export'));
});

/* --------------------------------------------------- accessibility & scale */

test('the roster search filters live and says how many match', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.api.addPerson({ name: 'Priya Natarajan', role: 'Staff Engineer' });
  app.api.addPerson({ name: 'Jordan Alvarez', role: 'Product Manager' });
  app.api.addPerson({ name: 'Mei Chen', role: 'Designer' });
  app.navigate('#/people');

  const input = env.document.getElementById('roster-search');
  assert.ok(input, 'search box exists');
  const rows = () => [...env.document.querySelectorAll('tbody tr')].filter((tr) => !tr.hidden);
  assert.equal(rows().length, 3);

  input.value = 'jordan';
  input.dispatchEvent(new env.window.Event('input', { bubbles: true }));
  assert.equal(rows().length, 1, 'only the match stays visible');
  assert.ok(env.document.getElementById('view').textContent.includes('1 of 3 people match'));

  input.value = 'designer';
  input.dispatchEvent(new env.window.Event('input', { bubbles: true }));
  assert.equal(rows().length, 1, 'role is searchable too');

  input.value = 'zzz';
  input.dispatchEvent(new env.window.Event('input', { bubbles: true }));
  assert.equal(rows().length, 0);
  assert.ok(env.document.getElementById('view').textContent.includes('No one matches that'));
});

test('Escape closes a dialog and focus returns to the button that opened it', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.navigate('#/people');
  const opener = buttonByTextExact(env, 'Add person', env.document.getElementById('view'));
  opener.focus();
  click(opener);
  assert.ok($('[role="dialog"]'), 'dialog opened');

  env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal($('[role="dialog"]'), null, 'dialog closed');
  assert.equal(env.document.activeElement, opener, 'focus went back to the trigger');
});

test('a large roster still renders every screen and collapses repeated signals', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  for (let i = 0; i < 24; i += 1) {
    app.api.addPerson({ name: `Person ${String(i).padStart(2, '0')}` });
  }
  app.navigate('#/insights');
  const view = env.document.getElementById('view');
  assert.ok(!view.textContent.includes('This screen failed to draw'));
  assert.ok(
    view.textContent.includes('24 people have had no feedback recently') || view.textContent.includes('24 recent joiners have too few logged 1:1s'),
    'repetition is rolled up into one line naming the group',
  );
  assert.ok(view.querySelectorAll('.finding').length <= 12, 'the page renders a handful of findings, not one per person');
  assert.ok(view.textContent.length < 20000, 'the page stays readable');
});

test('navigating away closes an open dialog instead of leaving it over the new screen', async () => {
  const env = boot();
  const app = await createAppInstance(env);
  app.navigate('#/people');
  click(buttonByTextExact(env, 'Add person', env.document.getElementById('view')));
  assert.ok($('[role="dialog"]'), 'dialog is open');

  app.navigate('#/goals');
  assert.equal($('[role="dialog"]'), null, 'the dialog did not survive the route change');
  assert.ok(env.document.getElementById('view').textContent.includes('Goals') || env.document.getElementById('view').textContent.includes('goal'));
});
