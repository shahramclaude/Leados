/** Phase-conversation queues: UTC boundaries, lifecycle and real-dialog persistence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { dueOnboardingReviews, onboardingHealth } from '../../app/core/domain/onboarding.js';
import { addDays } from '../../app/core/time.js';
import { buildInsights } from '../../app/core/domain/insights.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-25T10:00:00.000Z');
function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness(storage = memoryStorage(), now = NOW) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-t-${++seq}`;
  const store = createStore({ storage, now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }), storage };
}

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    // axe-core probes HTMLCanvasElement.getContext('2d') during ligature checks in jsdom.
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);

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

async function withApp(fn, now = NOW) {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => now });
  try {
    await fn(app, env);
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
}

async function runAxe(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  return env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
}

function click(node) {
  assert.ok(node, 'expected a clickable DOM node');
  node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function setValue(input, value) {
  assert.ok(input, 'expected a form input');
  if (input.type === 'checkbox') {
    input.checked = Boolean(value);
  } else {
    input.value = String(value);
  }
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

function fixture({ id = 'plan', personId = 'p', startDate = '2026-09-25', kind = 'new-hire', ...patch } = {}) {
  return { id, personId, startDate, kind, status: 'active', reviews: { 30: null, 60: null, 90: null }, checkpoints: [], stakeholders: [], ...patch };
}
function stateWith(plans, people = [{ id: 'p', name: 'Ada', status: 'active', startDate: '2020-01-01' }]) {
  return { ...createEmptyState(NOW.toISOString()), people, onboarding: plans };
}
function seed(api, { name = 'Ada', days = 31, kind = 'new-hire', ...patch } = {}) {
  const person = api.addPerson({ name, startDate: '2020-01-01' });
  assert.equal(person.ok, true);
  const plan = api.createOnboardingPlan({ personId: person.id, startDate: addDays(NOW, -days), kind, label: kind === 'role-transition' ? 'Acting team lead' : '', ...patch });
  assert.equal(plan.ok, true, plan.error);
  return { personId: person.id, planId: plan.id };
}
function rows(document) { return [...document.querySelectorAll('#onboarding-checkins li')]; }
function button(scope, label) { return [...scope.querySelectorAll('button')].find((b) => b.textContent === label); }
function save(document) { click(document.querySelector('[role="dialog"] .modal-foot .btn-primary')); }

test('phase queue uses UTC calendar days: overdue, today, inclusive seven-day cutoff and excluded eighth day', () => {
  const plans = [31, 30, 23, 22].map((days) => fixture({ id: `day-${days}`, startDate: addDays(NOW, -days) }));
  const state = stateWith(plans);
  for (const clock of ['2026-10-25T00:00:00Z', '2026-10-25T23:59:59Z', '2026-10-26T01:59:59+02:00']) {
    const queue = dueOnboardingReviews(state, new Date(clock));
    assert.deepEqual(queue.map(({ plan, review }) => [plan.id, review.horizon, review.state, review.daysUntil, review.overdueDays]), [
      ['day-31', 30, 'overdue', -1, 1], ['day-30', 30, 'due-soon', 0, 0], ['day-23', 30, 'due-soon', 7, 0],
    ]);
  }
});

test('all three plan kinds use their own start anchor, not tenure or configurable onboarding window', () => {
  const plans = ['new-hire', 'role-transition', 'reboarding'].map((kind) => fixture({ id: kind, kind }));
  const state = stateWith(plans);
  state.settings.onboardingDays = 7;
  const queue = dueOnboardingReviews(state, NOW);
  assert.equal(queue.length, 3);
  assert.ok(queue.every(({ review }) => review.horizon === 30 && review.daysUntil === 0));
});

test('held, completed, archived, orphaned, pre-start and invalid-anchor plans never enter the queue', () => {
  const plans = [
    fixture({ id: 'held', reviews: { 30: { heldOn: '2026-10-24' } } }),
    fixture({ id: 'completed', status: 'completed' }), fixture({ id: 'archived', status: 'archived' }),
    fixture({ id: 'archived-person', personId: 'old' }), fixture({ id: 'orphan', personId: 'missing' }),
    fixture({ id: 'pre-start', startDate: '2026-10-26' }), fixture({ id: 'bad-anchor', startDate: null }),
  ];
  assert.deepEqual(dueOnboardingReviews(stateWith(plans, [{ id: 'p', status: 'active' }, { id: 'old', status: 'archived' }]), NOW), []);
  assert.deepEqual(dueOnboardingReviews({}, NOW), []);
});

test('missed horizons remain separate; checkpoint completion and later phase conversations do not fabricate earlier conversations', () => {
  const plan = fixture({ startDate: addDays(NOW, -100), checkpoints: [{ done: true, horizon: 30 }], reviews: { 90: { heldOn: '2026-10-24' } } });
  const queue = dueOnboardingReviews(stateWith([plan]), NOW);
  assert.deepEqual(queue.map(({ review }) => [review.horizon, review.overdueDays]), [[30, 70], [60, 40]]);
});

test('phase queue is deterministic and immutable, and cannot read conflicts or raw pulse answers', () => {
  const state = stateWith([fixture({ id: 'b' }), fixture({ id: 'a' }), fixture({ id: 'z', personId: 'second' })], [
    { id: 'p', name: 'Ada', status: 'active' }, { id: 'second', name: 'Zoe', status: 'active' },
  ]);
  const before = JSON.stringify(state);
  for (const key of ['conflicts', 'pulses', 'reviews']) Object.defineProperty(state, key, { get() { throw new Error(`Must not access ${key}`); } });
  const freeze = (value) => { Object.freeze(value); for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) if (descriptor.value && typeof descriptor.value === 'object') freeze(descriptor.value); };
  freeze(state);
  assert.deepEqual(dueOnboardingReviews(state, NOW).map(({ plan }) => plan.id), ['a', 'b', 'z']);
  const withoutPrivate = JSON.parse(before);
  for (const key of ['conflicts', 'pulses', 'reviews']) delete withoutPrivate[key];
  const descriptorCopy = Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(state)).filter(([, d]) => 'value' in d).map(([key, d]) => [key, d.value]));
  assert.deepEqual(descriptorCopy, withoutPrivate);
});

test('phase queue status agrees with plan diagnostics and ONB-04; recording a review persists and removes only that horizon', () => {
  const h = harness();
  const { planId } = seed(h.api, { days: 65 });
  const plan = h.store.state.onboarding[0];
  const health = onboardingHealth(plan, h.store.state, NOW, h.store.state.settings);
  assert.equal(health.overdueReviews.length, 2);
  assert.equal(dueOnboardingReviews(h.store.state, NOW).length, 2);
  assert.ok(buildInsights(h.store.state, NOW).findings.some((f) => f.ruleId === 'ONB-04'));
  const snapshot = JSON.stringify(h.store.state);
  for (const input of [{ heldOn: '2026-10-26', summary: 'Not held' }, { heldOn: '2026-01-01', summary: 'Before start' }, { heldOn: '2026-10-25', summary: '' }]) {
    assert.equal(h.api.recordOnboardingReview(planId, { horizon: 30, ...input }).ok, false);
    assert.equal(JSON.stringify(h.store.state), snapshot);
  }
  assert.equal(h.api.recordOnboardingReview(planId, { horizon: 30, heldOn: '2026-10-25', summary: 'Clarified decision scope', blockers: 'Manager to arrange an introduction' }).ok, true);
  const restored = harness(h.storage);
  assert.deepEqual(dueOnboardingReviews(restored.store.state, NOW).map(({ review }) => review.horizon), [60]);
  assert.equal(restored.store.state.onboarding[0].reviews[30].blockers, 'Manager to arrange an introduction');
  assert.ok(restored.store.state.events.some((e) => e.type === 'onboarding.review.recorded' && e.entityId === planId));
  assert.deepEqual(restored.store.state.onboarding[0].checkpoints, plan.checkpoints);
});

test('Today logs each plan kind in place, gives person context, keeps cancelled dialogs inert and passes axe', async () => {
  await withApp(async (app, env) => {
    const cases = [
      seed(app.api, { name: 'Joiner', days: 31 }),
      seed(app.api, { name: 'Mover', kind: 'role-transition', days: 30 }),
      seed(app.api, { name: 'Returner', kind: 'reboarding', days: 23 }),
    ];
    app.navigate('#/today');
    assert.equal(rows(env.document).length, 3);
    assert.equal((await runAxe(env)).violations.length, 0);
    for (const [i, { planId }] of cases.entries()) {
      let row = rows(env.document).find((r) => r.dataset.planId === planId);
      assert.ok(row);
      const before = JSON.stringify(app.store.state);
      click(button(row, 'Log Day 30 check-in'));
      let dialog = env.document.querySelector('[role="dialog"]');
      assert.match(dialog.textContent, /opening this dialog does not mark it held/);
      assert.ok(dialog.textContent.includes(['Joiner', 'Mover', 'Returner'][i]));
      if (i === 2) assert.match(dialog.textContent, /Keep medical and leave reasons out/);
      if (i === 0) assert.equal((await runAxe(env, '[role="dialog"]')).violations.length, 0);
      click(button(dialog, 'Cancel'));
      assert.equal(JSON.stringify(app.store.state), before);
      row = rows(env.document).find((r) => r.dataset.planId === planId);
      click(button(row, 'Log Day 30 check-in'));
      dialog = env.document.querySelector('[role="dialog"]');
      save(env.document);
      assert.ok(env.document.querySelector('[role="dialog"]'), 'empty summary is refused');
      setValue(dialog.querySelector('[name="summary"]'), `Agreed next support for case ${i}`);
      setValue(dialog.querySelector('[name="blockers"]'), 'Manager will introduce the partner team');
      save(env.document);
      assert.equal(env.document.querySelector('[role="dialog"]'), null);
      assert.equal(app.ctx.route, 'today');
      assert.equal(rows(env.document).some((r) => r.dataset.planId === planId), false);
      assert.equal(app.store.state.onboarding.find((p) => p.id === planId).status, 'active', 'holding a conversation does not complete the plan');
    }
    assert.equal(env.document.querySelector('#onboarding-checkins'), null, 'Today hides an empty queue');
    const restored = harness(env.window.localStorage);
    assert.equal(dueOnboardingReviews(restored.store.state, NOW).length, 0);
    assert.equal(restored.store.state.events.filter((e) => e.type === 'onboarding.review.recorded').length, 3);
    assert.deepEqual(env.consoleErrors, []);
  });
});

test('Today shows four oldest due conversations with honest overflow and an all-due executable view', async () => {
  await withApp(async (app, env) => {
    seed(app.api, { name: 'Oldest', days: 95 });
    seed(app.api, { name: 'Second', days: 70 });
    const soon = seed(app.api, { name: 'Soon', days: 23 });
    app.navigate('#/today');
    let card = env.document.querySelector('#onboarding-checkins');
    assert.equal(rows(env.document).length, 4);
    assert.match(card.textContent, /Showing 4 of 6/);
    assert.match(card.textContent, /5 overdue · 1 due today or within 7 days · 3 active plans/);
    const all = card.querySelector('a[href="#/onboarding?status=checkins"]');
    assert.equal(all.textContent, 'All 6 check-ins');
    app.navigate(all.getAttribute('href'));
    assert.equal(rows(env.document).length, 6);
    assert.equal(env.document.querySelectorAll('.onboarding-card').length, 0, 'all-due view avoids repeating long plan cards');
    assert.equal((await runAxe(env)).violations.length, 0);
    click(button(rows(env.document).find((r) => r.dataset.planId === soon.planId), 'Log Day 30 check-in'));
    setValue(env.document.querySelector('[name="summary"]'), 'Discussed expectations and support');
    save(env.document);
    assert.equal(rows(env.document).length, 5);
    assert.equal(app.ctx.query.get('status'), 'checkins');
    assert.deepEqual(env.consoleErrors, []);
  });
});

test('all-due filters preserve person and exact plan scopes; completed plan deep links never substitute a newer plan', async () => {
  await withApp(async (app, env) => {
    const first = seed(app.api, { name: 'Ada', days: 95 });
    const second = seed(app.api, { name: 'Bo', days: 31 });
    app.navigate(`#/onboarding?status=checkins&person=${second.personId}`);
    assert.equal(rows(env.document).length, 1);
    assert.ok(rows(env.document)[0].textContent.includes('Bo'));
    const planLink = rows(env.document)[0].querySelector('a');
    app.navigate(planLink.getAttribute('href'));
    assert.equal(env.document.querySelectorAll('.onboarding-card').length, 1);
    assert.ok(env.document.querySelector('.onboarding-card').textContent.includes('Bo'));
    click([...env.document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.startsWith('Active')));
    assert.equal(app.ctx.query.get('status'), 'active');
    assert.equal(app.ctx.query.get('plan'), second.planId);
    for (const horizon of [30, 60, 90]) app.api.recordOnboardingReview(first.planId, { horizon, summary: 'Reviewed with Ada' });
    assert.equal(app.api.completeOnboardingPlan(first.planId).ok, true);
    const next = app.api.createOnboardingPlan({ personId: first.personId, kind: 'role-transition', label: 'New scope', startDate: '2026-10-25' });
    assert.equal(next.ok, true);
    app.navigate(`#/onboarding?plan=${first.planId}`);
    assert.equal(env.document.querySelectorAll('.onboarding-card').length, 1);
    assert.match(env.document.querySelector('.onboarding-card').textContent, /Reopen plan/);
    assert.ok(!env.document.querySelector('.onboarding-card').textContent.includes('New scope'));
    click([...env.document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.startsWith('Check-ins due')));
    assert.equal(rows(env.document).length, 0);
    assert.match(env.document.querySelector('#onboarding-checkins').textContent, /No phase check-ins due/);
    assert.equal((await runAxe(env)).violations.length, 0);
    assert.deepEqual(env.consoleErrors, []);
  });
});

test('invalid or archived-person plan links are explicit, can be cleared, and never show an unrelated plan', async () => {
  await withApp(async (app, env) => {
    const archived = seed(app.api, { name: 'Archived', days: 31 });
    seed(app.api, { name: 'Visible', days: 31 });
    app.api.archivePerson(archived.personId);
    for (const id of ['missing%2Fplan', archived.planId]) {
      app.navigate(`#/onboarding?plan=${id}`);
      assert.match(env.document.getElementById('view').textContent, /30-60-90 plan not found/);
      assert.equal(env.document.querySelectorAll('.onboarding-card').length, 0);
      assert.equal((await runAxe(env)).violations.length, 0);
    }
    app.navigate(env.document.querySelector('#view a[href="#/onboarding?status=all"]').getAttribute('href'));
    assert.equal(env.document.querySelectorAll('.onboarding-card').length, 1);
    assert.match(env.document.querySelector('.onboarding-card').textContent, /Visible/);
    assert.deepEqual(env.consoleErrors, []);
  });
});

test('queue escapes user-entered names and labels and route-encodes plan ids', async () => {
  await withApp(async (app, env) => {
    const seeded = seed(app.api, { name: '<img src=x onerror=alert(1)>', days: 31, kind: 'role-transition', label: '<script>bad()</script>' });
    app.store.update((draft) => { draft.onboarding.find((p) => p.id === seeded.planId).id = 'plan/a & ?b'; });
    app.navigate('#/today');
    const card = env.document.querySelector('#onboarding-checkins');
    assert.match(card.textContent, /<img src=x onerror=alert\(1\)>/);
    assert.match(card.textContent, /<script>bad\(\)<\/script>/);
    assert.equal(card.querySelectorAll('script, img').length, 0);
    const link = card.querySelector('a');
    assert.equal(link.getAttribute('href'), '#/onboarding?plan=plan%2Fa%20%26%20%3Fb');
    app.navigate(link.getAttribute('href'));
    assert.equal(env.document.querySelectorAll('.onboarding-card').length, 1);
    assert.deepEqual(env.consoleErrors, []);
  });
});

test('a failed check-in storage write is visible on Today and does not overwrite the last saved workspace', async () => {
  await withApp(async (app, env) => {
    const { planId } = seed(app.api);
    app.navigate('#/today');
    const key = 'leados.lifecycle.v1';
    const saved = env.window.localStorage.getItem(key);
    click(button(rows(env.document)[0], 'Log Day 30 check-in'));
    setValue(env.document.querySelector('[name="summary"]'), 'Clarified scope and support');
    const prototype = Object.getPrototypeOf(env.window.localStorage);
    const original = prototype.setItem;
    prototype.setItem = () => { throw new Error('Test quota exceeded'); };
    try {
      save(env.document);
      assert.match(env.document.getElementById('view').textContent, /Changes are not being saved/);
      assert.equal(env.window.localStorage.getItem(key), saved);
      assert.equal(app.store.state.onboarding.find((p) => p.id === planId).reviews[30].summary, 'Clarified scope and support');
      assert.ok(env.document.querySelector('#view .banner-bad button'), 'export action remains reachable');
    } finally { prototype.setItem = original; }
    assert.deepEqual(env.consoleErrors, []);
  });
});
