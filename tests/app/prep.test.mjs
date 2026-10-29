/**
 * tests/app/prep.test.mjs — the printable 1:1 preparation sheet.
 *
 * Covers the domain assembly (agenda + employee topics + grouped commitments),
 * the privacy invariant (conflict records and anonymous pulse never reach the
 * sheet), persistence of the new person field, the routing/render path and the
 * accessibility of the printable document.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, normalizeTalkingPoints, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildPrepSheet } from '../../app/core/domain/prep.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
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

function conflictInput(secret, participant) {
  return {
    title: secret,
    summary: secret,
    coordinator: 'Manager',
    openedOn: '2026-10-20',
    nextFollowUpOn: '2026-10-24',
    safety: 'support',
    participants: [
      { name: participant, perspective: secret, interest: secret },
      { name: 'Other party', perspective: secret },
    ],
  };
}

/* ---------------------------------------------------------------- domain */

test('normalizeTalkingPoints trims, collapses whitespace, dedupes case-insensitively and caps at 12', () => {
  const out = normalizeTalkingPoints([
    '  On-call load  ',
    'On-call load',
    '',
    '   ',
    'second topic',
    ...Array.from({ length: 15 }, (_, i) => `topic ${i}`),
  ]);
  assert.deepEqual(out.slice(0, 2), ['On-call load', 'second topic']);
  assert.equal(out.length, 12);
  assert.deepEqual(normalizeTalkingPoints('not an array'), []);
  assert.deepEqual(normalizeTalkingPoints(null), []);
  assert.deepEqual(normalizeTalkingPoints([42, null, 'ok']), ['ok']);
});

test('buildPrepSheet assembles agenda, employee topics and grouped open commitments', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Priya', role: 'Engineering Lead' }).id;
  assert.equal(h.api.updatePerson(personId, { talkingPoints: ['On-call load', 'Promotion path'] }).ok, true);

  assert.equal(
    h.api.logOneOnOne({
      personId, date: '2026-10-10', status: 'held', mood: 3,
      notes: 'Spoke about load and the roadmap.',
      actions: [{ text: 'Publish runbook', due: '2026-10-18' }],
    }).ok,
    true,
  );
  assert.equal(h.api.addGoal({ title: 'Ship platform reliability', ownerId: personId, scope: 'person', confidence: 'at-risk', keyResults: [{ title: 'p99 latency', start: 0, target: 100, current: 20 }] }).ok, true);
  assert.equal(h.api.saveGrowthPlan({ personId, goal: 'Grow into the staff engineer seat', reality: 'Currently owns on-call.', options: ['Shadow incident command', 'Own the reliability budget'], will: [{ text: 'Take the on-call rotation lead', due: '2026-10-20' }] }).ok, true);
  assert.equal(h.api.addFeedback({ personId, kind: 'constructive', situation: 'Missed the handoff window', behavior: ' handed off late', date: '2026-10-12', followUpOn: '2026-10-22' }).ok, true);
  assert.equal(h.api.addDelegation({ personId, title: 'Own the escalation runbook', expectedOutcome: 'A published runbook', authority: 'own', support: 'Time and a reviewer', delegatedOn: '2026-10-05', dueOn: '2026-10-20' }).ok, true);

  const sheet = buildPrepSheet(h.store.state, personId, NOW, h.store.state.settings);
  assert.equal(sheet.missing, false);
  assert.equal(sheet.person.name, 'Priya');
  assert.deepEqual(sheet.theirTopics.map((t) => t.text), ['On-call load', 'Promotion path']);

  assert.ok(sheet.agenda.length >= 5, 'the agenda carries the standing open questions plus generated items');
  assert.ok(sheet.agenda.every((item) => typeof item.reason === 'string' && item.reason.length));

  assert.ok(sheet.commitments.actions.some((a) => a.text === 'Publish runbook' && a.overdue === true));
  assert.ok(sheet.commitments.development.some((a) => a.text.includes('on-call rotation lead') && a.overdue === true));
  assert.ok(sheet.commitments.feedback.some((f) => f.text.includes('Missed the handoff window') && f.overdue === true));
  assert.ok(sheet.commitments.delegations.some((d) => d.text.includes('escalation runbook') && d.detail));
  assert.equal(sheet.goalsAtRisk.length, 1);
  assert.equal(sheet.goalsAtRisk[0].confidence, 'at-risk');

  assert.equal(sheet.sinceLast.notes.includes('load and the roadmap'), true);
  assert.equal(sheet.sinceLast.mood, 3);
  assert.equal(sheet.commitmentCount, 4);
});

test('buildPrepSheet sorts overdue commitments first within each group', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Ada' }).id;
  h.api.logOneOnOne({ personId, date: '2026-10-10', status: 'held', actions: [{ text: 'Due soon', due: '2026-10-26' }, { text: 'Overdue one', due: '2026-10-18' }] });
  const sheet = buildPrepSheet(h.store.state, personId, NOW, h.store.state.settings);
  const texts = sheet.commitments.actions.map((a) => a.text);
  assert.deepEqual(texts, ['Overdue one', 'Due soon']);
});

test('buildPrepSheet on an empty workspace is honest: no topics, no commitments, no prior meeting', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Ada' }).id;
  const sheet = buildPrepSheet(h.store.state, personId, NOW, h.store.state.settings);
  assert.deepEqual(sheet.theirTopics, []);
  assert.equal(sheet.commitmentCount, 0);
  assert.equal(sheet.sinceLast.lastHeldDate, null);
  assert.equal(sheet.sinceLast.notes, '');
  assert.ok(sheet.agenda.length >= 2, 'standing open questions remain');
});

test('buildPrepSheet reports a missing person without throwing', () => {
  const h = harness();
  assert.deepEqual(buildPrepSheet(h.store.state, 'person-missing', NOW, h.store.state.settings), { missing: true });
});

test('the prep sheet never carries conflict records or anonymous pulse answers', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Avery' }).id;
  const secret = 'PRIVATE-CONTENT-prep-77';
  const participant = 'PRIVATE-PARTICIPANT-prep-88';
  assert.equal(h.api.addConflict(conflictInput(secret, participant)).ok, true);
  assert.equal(h.api.submitPulse({ anonymity: 'anonymous', scores: { safety: 2, clarity: 3 }, comment: 'ANONYMOUS-COMMENT-prep' }).ok, true);

  const sheet = buildPrepSheet(h.store.state, personId, NOW, h.store.state.settings);
  const serialized = JSON.stringify(sheet);
  for (const value of [secret, participant, 'ANONYMOUS-COMMENT-prep']) {
    assert.ok(!serialized.includes(value), `prep sheet must not contain ${value}`);
  }
  assert.ok(sheet.excluded.some((e) => /conflict/i.test(e)));
  assert.ok(sheet.excluded.some((e) => /anonymous/i.test(e)));
});

test('talking points persist through the action API, survive a reload and are repaired on malformed import', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Jordan' }).id;
  assert.equal(h.api.updatePerson(personId, { talkingPoints: ['a', 'b'] }).ok, true);
  assert.deepEqual(h.store.state.people[0].talkingPoints, ['a', 'b']);

  const reloaded = normalizeState(JSON.parse(h.store.exportJSON()).state).state;
  assert.deepEqual(reloaded.people[0].talkingPoints, ['a', 'b']);

  const repaired = normalizeState({ people: [{ id: 'x', name: 'X', talkingPoints: ['ok', '', 42, 'ok ', '   '] }] }).state.people[0];
  assert.deepEqual(repaired.talkingPoints, ['ok']);
  assert.equal(SCHEMA_VERSION, 49, 'current schema version is v49');
});

/* ---------------------------------------------------------------- integration */

test('due-meeting queues open preparation first while retaining an explicit quick-log path', async () => {
  await withApp(async (app, env) => {
    const personId = app.api.addPerson({ name: 'Alex Rivera', role: 'Design Lead' }).id;

    app.navigate('#/today');
    const todayView = env.document.getElementById('view');
    const prepareToday = todayView.querySelector(`button[aria-label="Prepare 1:1 with Alex Rivera"]`);
    assert.ok(prepareToday, 'Today offers a direct route into the evidence-linked prep sheet');
    const quickLogToday = todayView.querySelector(`button[aria-label="Log 1:1 with Alex Rivera without opening preparation"]`);
    assert.ok(quickLogToday, 'the fast path remains available and explicit');
    prepareToday.click();
    assert.equal(app.route, 'prep');
    assert.ok(todayView.textContent.includes('Suggested agenda'));
    assert.ok(todayView.textContent.includes('No 1:1 recorded yet'));
    assert.equal(todayView.querySelector('a.back-link').getAttribute('href'), `#/people/${encodeURIComponent(personId)}`);

    app.navigate('#/oneonones');
    const boardView = env.document.getElementById('view');
    const prepareBoard = boardView.querySelector(`button[aria-label="Prepare 1:1 with Alex Rivera"]`);
    assert.ok(prepareBoard, 'the 1:1 queue offers the same preparation journey');
    prepareBoard.click();
    assert.equal(app.route, 'prep');
    assert.ok(boardView.textContent.includes('Open commitments'));
  });
});

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
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
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

async function runAxe(env) {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const results = await env.window.axe.run(env.document, { rules: { 'color-contrast': { enabled: false } } });
  return Array.from(results.violations);
}

async function withApp(fn) {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });
  await fn(app, env);
  return env;
}

test('the #/prep route renders a printable document, opens the print flow and passes axe-core', async () => {
  let printCalls = 0;
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    env.window.print = () => { printCalls += 1; };
    const person = app.store.state.people[0];
    assert.equal(app.api.updatePerson(person.id, { talkingPoints: ['On-call load'] }).ok, true);

    app.navigate(`#/prep/${encodeURIComponent(person.id)}`);
    assert.equal(app.route, 'prep');
    const view = env.document.getElementById('view');
    assert.ok(view.textContent.includes('Their topics'), 'their-topics section renders');
    assert.ok(view.textContent.includes('Suggested agenda'), 'agenda section renders');
    assert.ok(view.textContent.includes('Open commitments'), 'commitments section renders');
    assert.ok(view.textContent.includes('Notes from this meeting'), 'notes area renders');
    assert.ok(view.textContent.includes('On-call load'), 'employee topic appears');
    assert.ok(view.textContent.includes('deliberately excluded'), 'the privacy exclusion is stated');

    const printBtn = [...view.querySelectorAll('button')].find((b) => /print/i.test(b.textContent));
    assert.ok(printBtn, 'print button present');
    printBtn.click();
    assert.equal(printCalls, 1, 'print button opens the browser print/save-PDF flow');

    const violations = await runAxe(env);
    assert.deepEqual(violations.map((v) => `${v.id}: ${v.help}`), [], 'zero axe-core violations on the prep sheet');
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  });
});

test('the person page links to the printable prep sheet for that person', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    const person = app.store.state.people[0];
    app.navigate(`#/people/${encodeURIComponent(person.id)}`);
    const link = [...env.document.querySelectorAll('a')].find((a) => a.getAttribute('href') === `#/prep/${encodeURIComponent(person.id)}`);
    assert.ok(link, 'person page offers a printable prep sheet');
    assert.ok(link.textContent.includes('Print prep sheet'));
  });
});

test('an unknown prep target renders a not-found panel instead of throwing (empty or populated roster)', async () => {
  await withApp(async (app, env) => {
    app.navigate('#/prep/does-not-exist');
    const view = env.document.getElementById('view');
    assert.ok(view.textContent.includes('Person not found'));
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));

    // Also verify when state.people is populated (regression for sheet.person.id before sheet.missing)
    app.ctx.loadDemo();
    app.navigate('#/prep/still-does-not-exist');
    assert.ok(view.textContent.includes('Person not found'));
    assert.ok(!view.textContent.includes('Something went wrong'), 'must render not-found card, not error boundary');
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  });
});

test('editing a person from the prep sheet preserves their topics and start date', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    const person = app.store.state.people[0];
    assert.equal(app.api.updatePerson(person.id, { talkingPoints: ['On-call load'], startDate: '2024-03-01' }).ok, true);

    app.navigate(`#/prep/${encodeURIComponent(person.id)}`);
    const editBtn = [...env.document.getElementById('view').querySelectorAll('button')].find((b) => b.textContent.includes('Edit person'));
    assert.ok(editBtn, 'edit button present');
    editBtn.click();

    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'the edit dialog opens');
    const topics = dialog.querySelector('textarea[name="talkingPoints"]');
    assert.ok(topics, 'the topics field is present');
    assert.equal(topics.value, 'On-call load', 'topics are prefilled, not reset');
    assert.equal(dialog.querySelector('input[name="startDate"]').value, '2024-03-01', 'start date is prefilled');
  });
});

test('prep closes completed manager-owned promises without claiming a meeting confirmed them', async () => {
  await withApp(async (app, env) => {
    const person = app.api.addPerson({ name: 'Mina' });
    assert.ok(person.id);
    assert.equal(app.api.logOneOnOne({
      personId: person.id,
      date: '2026-10-20',
      status: 'held',
      actions: [{ text: 'Send the rollout notes', owner: 'leader', due: '2026-10-23' }],
    }).ok, true);

    const plan = app.api.createOnboardingPlan({ personId: person.id, startDate: '2026-09-01', useTemplate: true });
    assert.equal(plan.ok, true);
    assert.equal(app.api.recordOnboardingReview(plan.id, {
      horizon: 30, heldOn: '2026-10-10', summary: 'Reviewed the transition.',
    }).ok, true);
    const checkin = app.store.state.onboarding.find((item) => item.id === plan.id).reviews[30];
    const followup = app.api.addManagerSupportCommitment({
      planId: plan.id, horizon: 30, checkinId: checkin.id,
      text: 'Book the systems walkthrough', due: '2026-10-24',
    });
    assert.equal(followup.ok, true);

    app.navigate(`#/prep/${encodeURIComponent(person.id)}`);
    const view = env.document.getElementById('view');
    const actions = [...view.querySelectorAll('button[aria-label^="Mark complete:"]')];
    assert.equal(actions.length, 2, 'both 1:1 and manager-owned promises have explicit close controls');
    assert.ok(actions.every((button) => button.classList.contains('no-print')), 'completion controls stay off the printed sheet');
    assert.deepEqual((await runAxe(env)).map((v) => `${v.id}: ${v.help}`), [], 'interactive prep remains axe-clean');

    const realToggle = app.api.toggleMeetingAction;
    app.api.toggleMeetingAction = () => ({ ok: false, error: 'That action no longer exists.' });
    actions.find((button) => button.getAttribute('aria-label').includes('Send the rollout notes')).click();
    assert.ok(view.textContent.includes('Send the rollout notes'), 'a stale action remains visible after a failed close');
    app.api.toggleMeetingAction = realToggle;
    view.querySelector('button[aria-label*="Send the rollout notes"]').click();
    assert.equal(app.store.state.oneOnOnes[0].actions[0].done, true);
    const undo = env.document.querySelector('#toast-root button[aria-label="Undo"]')
      || env.document.querySelector('#toast-root button');
    assert.ok(undo, 'completion has a short-lived undo action');
    undo.click();
    assert.equal(app.store.state.oneOnOnes[0].actions[0].done, false, 'undo restores the open commitment');
    assert.ok(view.querySelector('button[aria-label*="Send the rollout notes"]'));

    view.querySelector('button[aria-label*="Send the rollout notes"]').click();
    view.querySelector('button[aria-label*="Book the systems walkthrough"]').click();
    assert.equal(app.store.state.oneOnOnes[0].actions[0].done, true);
    assert.equal(app.store.state.oneOnOnes[0].actions[0].completedInMeetingId, null, 'manager update is not misrepresented as a held conversation');
    assert.equal(app.store.state.managerSupport.find((item) => item.id === followup.id).status, 'done');
    assert.equal(view.querySelectorAll('button[aria-label^="Mark complete:"]').length, 0, 'closed items leave the open commitment list');

    const reloaded = createStore({ storage: env.window.localStorage, now: () => NOW });
    reloaded.load();
    assert.equal(reloaded.state.oneOnOnes[0].actions[0].done, true, 'the completion survives a workspace reload');
    assert.equal(reloaded.state.oneOnOnes[0].actions[0].completedInMeetingId, null);
    assert.equal(reloaded.state.managerSupport.find((item) => item.id === followup.id).status, 'done');
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  });
});
