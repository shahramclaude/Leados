/**
 * tests/app/execution-loops.test.mjs — Session 15 suite covering:
 *   1. Schema v10 → v11 migration & return-to-work ('reboarding') 30-60-90 plans
 *   2. Development review-due queue on Today (dueGrowthReviews + direct review dialog)
 *   3. Succession → role-transition handoff (#/readiness & #/people/:id → 30-60-90)
 *   4. Audited bug fixes:
 *      - #/people/:id Carry & Drop GROW commitment dialogs (no ReferenceError)
 *      - openOneOnOneDialog mounted interactive suggested agenda checkboxes
 *      - buildForm boxLabel / span:2 support with single accessible checkbox label
 *      - suggestAgenda ignoring retired (carried-forward) and dropped GROW commitments
 *      - Settings '30-60-90 plans' label, recognition visibility CSV, and readiness CSV scope
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
  ONBOARDING_KINDS,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  activeOnboarding,
  onboardingHealth,
  onboardingSummary,
  newJoinersWithoutPlan,
  defaultReboardingCheckpoints,
  planKind,
  planKindNoun,
  planKindRecordNoun,
} from '../../app/core/domain/onboarding.js';
import { dueGrowthReviews, openWillActions } from '../../app/core/domain/growth.js';
import { transitionHandoff } from '../../app/core/domain/readiness.js';
import { suggestAgenda } from '../../app/core/domain/oneonone.js';
import { buildPrepSheet } from '../../app/core/domain/prep.js';
import { personTimeline, tenureDays, isNewJoiner } from '../../app/core/domain/people.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';

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
  const idFactory = (prefix) => `${prefix}-s15-${++seq}`;
  const store = createStore({ storage, now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }), storage };
}

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
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

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

function click(node) {
  assert.ok(node, 'expected a clickable DOM node');
  node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function setValue(input, value) {
  assert.ok(input, 'expected a form input');
  if (input.type === 'checkbox' || input.type === 'radio') {
    input.checked = Boolean(value);
  } else {
    input.value = String(value);
  }
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

/* ------------------------------------------- 1. Schema v11 & Re-boarding */

test('schema v10 → v11 preserves existing onboarding kinds and supports reboarding without leave-reason fields', () => {
  assert.equal(SCHEMA_VERSION, 76);
  assert.deepEqual(ONBOARDING_KINDS, ['new-hire', 'role-transition', 'reboarding']);

  const v10 = {
    ...createEmptyState(NOW.toISOString()),
    schemaVersion: 10,
    people: [{ id: 'p1', name: 'Clara Holm', startDate: '2022-05-01', status: 'active', createdAt: NOW.toISOString() }],
    onboarding: [
      { id: 'onb-nh', personId: 'p1', startDate: '2022-05-01', status: 'completed', kind: 'new-hire', reviews: { 90: { heldOn: '2022-08-01', summary: 'Completed' } } },
      { id: 'onb-tr', personId: 'p1', startDate: '2025-02-01', status: 'completed', kind: 'role-transition', label: 'Staff Engineer', reviews: { 90: { heldOn: '2025-05-02', summary: 'Completed' } } },
      { id: 'onb-rb', personId: 'p1', startDate: '2026-10-15', status: 'active', kind: 'reboarding', label: '' },
    ],
  };
  const snapshot = JSON.stringify(v10);
  const migrated = migrate(v10);
  assert.equal(JSON.stringify(v10), snapshot, 'migration never mutates input');
  assert.equal(migrated.raw.schemaVersion, 76);
  assert.deepEqual(migrated.applied, ['10 → 11', '11 → 12', '12 → 13', '13 → 14', '14 → 15', '15 → 16', '16 → 17', '17 → 18', '18 → 19', '19 → 20', '20 → 21', '21 → 22', '22 → 23', '23 → 24', '24 → 25', '25 → 26', '26 → 27', '27 → 28', '28 → 29', '29 → 30', '30 → 31', '31 → 32', '32 → 33', '33 → 34', '34 → 35', '35 → 36', '36 → 37', '37 → 38', '38 → 39', '39 → 40', '40 → 41', '41 → 42', '42 → 43', '43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48', '48 → 49', '49 → 50', '50 → 51', '51 → 52', '52 → 53', '53 → 54', '54 → 55', '55 → 56', '56 → 57', '57 → 58', '58 → 59', '59 → 60', '60 → 61', '61 → 62', '62 → 63', '63 → 64', '64 → 65', '65 → 66', '66 → 67', '67 → 68', '68 → 69', '69 → 70', '70 → 71', '71 → 72', '72 → 73', '73 → 74', '74 → 75', '75 → 76']);

  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.deepEqual(warnings, [], 'reboarding without a label is valid and produces no warnings');
  assert.equal(state.onboarding.find((p) => p.id === 'onb-nh').kind, 'new-hire');
  assert.equal(state.onboarding.find((p) => p.id === 'onb-tr').kind, 'role-transition');
  const rb = state.onboarding.find((p) => p.id === 'onb-rb');
  assert.equal(rb.kind, 'reboarding');
  assert.equal(rb.label, '');
  assert.equal('leaveReason' in rb, false, 'no medical or leave-reason field exists in schema');
  assert.equal(planKind(rb), 'reboarding');
  assert.equal(planKindNoun(rb), 're-boarding');
  assert.equal(planKindRecordNoun(rb), 're-boarding plan');
});

test('reboarding lifecycle: anchors to return date, preserves tenure, seeds catch-up/pacing checkpoints, and wires signals/prep/timeline/CSV', () => {
  const h = harness();
  const claraId = h.api.addPerson({ name: 'Clara Holm', role: 'Staff Engineer', startDate: '2022-05-01' }).id;

  // Cannot start return-to-work before joining the team
  assert.equal(
    h.api.createOnboardingPlan({ personId: claraId, kind: 'reboarding', startDate: '2021-12-01' }).ok,
    false,
  );

  // Label is optional for reboarding; startDate defaults to today (never 2022-05-01)
  const created = h.api.createOnboardingPlan({ personId: claraId, kind: 'reboarding' });
  assert.equal(created.ok, true);
  const plan = activeOnboarding(h.store.state, claraId);
  assert.equal(plan.kind, 'reboarding');
  assert.equal(plan.label, '');
  assert.equal(plan.startDate, '2026-10-25');
  assert.equal(h.store.state.people[0].startDate, '2022-05-01', 'original start date untouched');
  assert.equal(tenureDays(h.store.state.people[0], NOW), 1638);
  assert.equal(isNewJoiner(h.store.state.people[0], NOW, h.store.state.settings), false);

  const template = defaultReboardingCheckpoints('2026-10-25');
  assert.equal(template.length, 6);
  assert.ok(template[0].title.includes('what changed while you were away'));
  assert.ok(template[1].title.includes('load pacing'));
  assert.deepEqual(plan.checkpoints.map((c) => c.title), template.map((c) => c.title));

  // Move startDate back 40 days to verify ONB-03 and ONB-04 re-boarding wording
  assert.equal(h.api.updateOnboardingPlan(plan.id, { startDate: '2026-09-15', label: 'Autumn return' }).ok, true);
  const findings = buildInsights(h.store.state, NOW).findings.filter((f) => f.personId === claraId);
  assert.equal(findings.some((f) => f.ruleId === 'ONB-01' || f.ruleId === 'ONB-02'), false);
  const onb03 = findings.find((f) => f.ruleId === 'ONB-03');
  assert.ok(onb03 && onb03.title.includes('re-boarding plan'));
  assert.ok(onb03.evidence.some((e) => e.includes('what changed while away')));
  assert.ok(onb03.evidence.some((e) => e.includes('No peer catch-up buddy assigned for return to work')));
  const onb04 = findings.find((f) => f.ruleId === 'ONB-04');
  assert.ok(onb04 && onb04.title.includes('30-60-90 re-boarding'));

  // Agenda & prep sheet reflect re-boarding and still exclude confidential conflicts
  h.api.addConflict({
    title: 'PRIVATE_DISPUTE', summary: 'PRIVATE_NOTES', coordinator: 'Manager',
    openedOn: '2026-10-20', nextFollowUpOn: '2026-10-28', safety: 'direct',
    participants: [{ name: 'Clara Holm' }, { name: 'Other Person' }],
  });
  const agenda = suggestAgenda(h.store.state, claraId, NOW, h.store.state.settings);
  assert.ok(agenda.some((i) => i.source === 'onboarding' && i.text.includes('Day 30 re-boarding check-in')));
  const prep = buildPrepSheet(h.store.state, claraId, NOW, h.store.state.settings);
  assert.ok(prep.commitments.onboarding.some((c) => c.text === 'Hold Day 30 re-boarding check-in'));
  assert.equal(JSON.stringify(prep).includes('PRIVATE_DISPUTE'), false);

  // Summary counts separate onboarding, transitions, and re-boarding
  const summary = onboardingSummary(h.store.state, NOW, h.store.state.settings);
  assert.equal(summary.activeCount, 1);
  assert.equal(summary.activeReboardingCount, 1);
  assert.equal(summary.activeNewHireCount, 0);
  assert.equal(summary.activeTransitionCount, 0);

  // Complete Day 30/60/90 check-ins and graduate plan -> timeline & CSV
  assert.equal(h.api.recordOnboardingReview(plan.id, { horizon: 30, heldOn: '2026-10-15', summary: 'Caught up on Q3 architecture changes.' }).ok, true);
  assert.equal(h.api.recordOnboardingReview(plan.id, { horizon: 60, heldOn: '2026-10-22', summary: 'Pacing sustainable; delivered service runbook refresh.' }).ok, true);
  assert.equal(h.api.recordOnboardingReview(plan.id, { horizon: 90, heldOn: '2026-10-25', summary: 'Back at steady-state ownership.' }).ok, true);
  assert.equal(h.api.completeOnboardingPlan(plan.id).ok, true);

  const timeline = personTimeline(h.store.state, claraId);
  assert.ok(timeline.some((t) => t.kind === 'Return to work' && t.title.includes('Autumn return')));
  assert.ok(timeline.some((t) => t.title === 'Day 30 re-boarding check-in held'));
  assert.ok(timeline.some((t) => t.kind === 'Return to work completed'));

  const onbCsv = parseCsv(exportWorkspaceCsv(h.store.state, 'onboarding', { now: NOW }).csv);
  const idxKind = onbCsv.headers.indexOf('plan_kind');
  assert.equal(onbCsv.rows[0][idxKind], 'reboarding');
  const actionsCsv = exportWorkspaceCsv(h.store.state, 'actions', { now: NOW }).csv;
  assert.ok(actionsCsv.includes('Return to work Day 30'));

  // A new joiner whose only plan is 'reboarding' still appears in newJoinersWithoutPlan
  const joinerId = h.api.addPerson({ name: 'Fresh Joiner', startDate: '2026-10-20' }).id;
  h.api.createOnboardingPlan({ personId: joinerId, kind: 'reboarding', startDate: '2026-10-20' });
  assert.ok(newJoinersWithoutPlan(h.store.state, NOW, h.store.state.settings).some((p) => p.id === joinerId));
});

/* ------------------------------ 2. Review-Due Queue on Today (#/today) */

test('dueGrowthReviews orders overdue → due-soon → unscheduled and excludes future scheduled or archived people', () => {
  const h = harness();
  const ada = h.api.addPerson({ name: 'Ada Lovelace', startDate: '2024-01-01' }).id;
  const bo = h.api.addPerson({ name: 'Bo Diaz', startDate: '2024-01-01' }).id;
  const cam = h.api.addPerson({ name: 'Cam Patel', startDate: '2024-01-01' }).id;
  const dan = h.api.addPerson({ name: 'Dan Kim', startDate: '2024-01-01' }).id;
  const archived = h.api.addPerson({ name: 'Former Member', startDate: '2024-01-01' }).id;

  h.api.saveGrowthPlan({
    personId: ada, goal: 'Lead architecture RFCs', reality: 'Strong coder',
    options: ['Run RFC'], will: [{ text: 'Draft billing RFC', due: '2026-10-20' }],
    reviewOn: '2026-10-28', // due in 3 days (soon)
  });
  h.api.saveGrowthPlan({
    personId: bo, goal: 'Own incident postmortems', reality: 'Reactive today',
    options: ['Chair 2 retros'], will: [{ text: 'Chair October retro', due: '2026-10-18' }],
    reviewOn: '2026-10-15', // 10 days overdue
  });
  const camPlanId = h.api.saveGrowthPlan({
    personId: cam, goal: 'Mentor junior engineers', reality: 'Solo contributor',
    options: ['Pair weekly'], will: [{ text: 'Pair with Samuel', due: '2026-11-05' }],
    reviewOn: '', // unscheduled -> saveGrowthPlan sets default unless cleared
  }).id;
  h.api.saveGrowthPlan({ id: camPlanId, personId: cam, goal: 'Mentor junior engineers', reality: 'Solo contributor', options: ['Pair weekly'], reviewOn: null });
  // Manually clear reviewOn via import/normalize check or verify scheduled > 7d excluded:
  h.api.saveGrowthPlan({
    personId: dan, goal: 'Cross-org roadmap alignment', reality: 'Good team scope',
    options: ['Quarterly planning'], will: [{ text: 'Co-write Q1 brief', due: '2026-12-01' }],
    reviewOn: '2026-11-25', // 31 days out -> scheduled, should NOT be in due queue
  });
  h.api.saveGrowthPlan({
    personId: archived, goal: 'Archived plan', reality: 'N/A',
    options: ['N/A'], will: [{ text: 'N/A', due: '2026-10-10' }],
    reviewOn: '2026-10-01',
  });
  h.api.archivePerson(archived);

  // Force Cam's plan to have null reviewOn to test the 'none' bucket
  h.store.update((draft) => {
    const t = draft.growthPlans.find((p) => p.id === camPlanId);
    t.reviewOn = null;
  });

  const queue = dueGrowthReviews(h.store.state, NOW);
  assert.deepEqual(
    queue.map((r) => [r.person.name, r.review.state]),
    [
      ['Bo Diaz', 'overdue'],
      ['Ada Lovelace', 'soon'],
      ['Cam Patel', 'none'],
    ],
  );
  assert.equal(queue[0].overdueActions.length, 1);
});

test('#/today surfaces Development reviews card, opens openGrowthReviewDialog directly, settles commitments, and passes axe-core', async () => {
  await withApp(async (app, env) => {
    const meiId = app.api.addPerson({ name: 'Mei Lin Chen', role: 'Senior Engineer', startDate: '2025-01-10' }).id;
    app.api.saveGrowthPlan({
      personId: meiId,
      goal: 'Own cross-team technical direction across billing',
      reality: 'Strongest debugger; written alignment lags.',
      options: ['Write decision memos'],
      will: [{ text: 'Publish billing schema memo', due: '2026-10-20' }],
      reviewOn: '2026-10-18', // 7d overdue
    });

    app.navigate('#/today');
    const view = env.document.getElementById('view');
    assert.ok(view.textContent.includes('Development reviews'), 'Today shows Development reviews card');
    assert.ok(view.textContent.includes('7d overdue'));
    assert.deepEqual(await axeViolations(env, '#view'), []);

    const holdBtn = [...view.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hold review');
    assert.ok(holdBtn, 'Hold review button is directly on Today');
    click(holdBtn);

    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'Growth review dialog opens directly on Today without navigating away');
    assert.equal(app.route, 'today');
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), []);

    // Mark the open commitment done, write review notes, and schedule next review 30d out
    const doneRadio = dialog.querySelector('input[type="radio"][value="done"]');
    setValue(doneRadio, true);
    setValue(dialog.querySelector('textarea[name="notes"]'), 'Reviewed the schema memo; adopted by Platform and Support.');
    setValue(dialog.querySelector('input[name="nextReviewOn"]'), '2026-11-24');
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Record review')));

    assert.equal(env.document.querySelector('[role="dialog"]'), null, 'dialog closes after recording review');
    const updatedPlan = app.store.state.growthPlans[0];
    assert.equal(updatedPlan.reviews.length, 1);
    assert.equal(updatedPlan.will[0].done, true);
    assert.equal(updatedPlan.reviewOn, '2026-11-24');
    assert.equal(view.textContent.includes('Development reviews'), false, 'resolved review leaves the Today due queue');
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  });
});

/* ------------------- 3. Succession → Role-Transition Handoff (#/readiness) */

test('succession → transition handoff pre-fills seat & readiness context without fabricating roleClarity or rewriting roster fields', async () => {
  await withApp(async (app, env) => {
    const priyaId = app.api.addPerson({
      name: 'Priya Natarajan',
      role: 'Engineering Lead',
      level: 'lead',
      startDate: '2023-06-01',
    }).id;
    app.api.setReadiness({
      personId: priyaId,
      seat: 'Director of Platform',
      rating: 'ready-later',
      notes: 'Strong incident leadership; needs cross-org budgeting exposure.',
    });

    const before = transitionHandoff(app.store.state, priyaId, 'Director of Platform', NOW, app.store.state.settings);
    assert.equal(before.canStartTransition, true);
    assert.equal(before.prefill.kind, 'role-transition');
    assert.equal(before.prefill.label, 'Director of Platform');
    assert.equal(before.prefill.handoffContext.notes, 'Strong incident leadership; needs cross-org budgeting exposure.');

    app.navigate('#/readiness');
    const view = env.document.getElementById('view');
    assert.ok(view.textContent.includes('Director of Platform'));
    assert.deepEqual(await axeViolations(env, '#view'), []);

    const startBtn = [...view.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start transition');
    assert.ok(startBtn, 'Start transition button rendered on candidate row');
    click(startBtn);

    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, '30-60-90 dialog opens from #/readiness');
    assert.ok(dialog.textContent.includes('Stepping into tracked seat: Director of Platform'));
    assert.ok(dialog.textContent.includes('Strong incident leadership; needs cross-org budgeting exposure.'));
    assert.equal(dialog.querySelector('select[name="kind"]').value, 'role-transition');
    assert.equal(dialog.querySelector('input[name="label"]').value, 'Director of Platform');
    assert.equal(dialog.querySelector('input[name="startDate"]').value, '2026-10-25');
    assert.equal(dialog.querySelector('textarea[name="roleClarity"]').value, '', 'roleClarity is never fabricated from evaluation notes');
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), []);

    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Create 30-60-90 plan')));
    assert.equal(env.document.querySelector('[role="dialog"]'), null);

    const createdPlan = activeOnboarding(app.store.state, priyaId);
    assert.ok(createdPlan);
    assert.equal(createdPlan.kind, 'role-transition');
    assert.equal(createdPlan.label, 'Director of Platform');
    assert.equal(createdPlan.roleClarity, '', 'left empty honestly until manager writes expectations');

    const priya = app.store.state.people.find((p) => p.id === priyaId);
    assert.equal(priya.role, 'Engineering Lead', 'roster role not silently overwritten');
    assert.equal(priya.startDate, '2023-06-01', 'roster start date untouched');

    // #/readiness now shows active transition status and link instead of duplicate Start button
    assert.ok(view.textContent.includes('In transition (30-60-90)'));
    assert.ok(view.textContent.includes('Open 30-60-90 plan'));
    assert.equal(
      [...view.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Start transition'),
      false,
    );
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  });
});

/* ------------------------------------------- 4. Audited Bug Fixes Verified */

test('person page Carry and Drop buttons on GROW commitments open dialogs cleanly without ReferenceError', async () => {
  await withApp(async (app, env) => {
    const id = app.api.addPerson({ name: 'Jordan Alvarez', role: 'PM', startDate: '2024-04-01' }).id;
    const planRes = app.api.saveGrowthPlan({
      personId: id,
      goal: 'Lead pricing strategy',
      reality: 'Strong execution on single-squad features',
      options: ['Own pricing discovery'],
      will: [
        { text: 'Interview five churned customers', due: '2026-10-20' },
        { text: 'Draft old competitor matrix', due: '2026-10-22' },
      ],
      reviewOn: '2026-11-15',
    });
    assert.equal(planRes.ok, true);

    app.navigate(`#/people/${encodeURIComponent(id)}`);
    const view = env.document.getElementById('view');

    // Carry the first commitment from #/people/:id
    const carryBtn = [...view.querySelectorAll('.will-side button')].find((b) => b.textContent.trim() === 'Carry');
    assert.ok(carryBtn);
    click(carryBtn);
    let dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'Carry dialog opens without throwing ReferenceError');
    setValue(dialog.querySelector('input[name="due"]'), '2026-11-10');
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Carry forward')));
    assert.equal(env.document.querySelector('[role="dialog"]'), null);

    // Drop the second commitment from #/people/:id
    const dropBtns = [...view.querySelectorAll('.will-side button')].filter((b) => b.textContent.trim() === 'Drop');
    assert.equal(dropBtns.length, 2);
    click(dropBtns[0]);
    dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'Drop dialog opens from person page');
    setValue(dialog.querySelector('textarea[name="reason"]'), 'Replaced by live customer interviews');
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Drop it')));
    assert.equal(env.document.querySelector('[role="dialog"]'), null);

    const plan = app.store.state.growthPlans[0];
    const live = openWillActions(plan, NOW);
    assert.equal(live.length, 1);
    assert.equal(live[0].text, 'Interview five churned customers');
    assert.equal(live[0].carryCount, 1);

    // Retired/dropped GROW actions do not leak into suggestAgenda
    const agenda = suggestAgenda(app.store.state, id, NOW, app.store.state.settings);
    assert.equal(
      agenda.some((item) => item.text.includes('Draft old competitor matrix')),
      false,
      'dropped commitment must never appear in 1:1 suggested agenda',
    );
    assert.ok(
      agenda.some((item) => item.text.includes('Interview five churned customers')),
      'live carried commitment appears in 1:1 suggested agenda',
    );
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  });
});

test('1:1 dialog mounts interactive suggested agenda checkboxes, onboarding checkboxes render boxLabel cleanly, and readiness/recognition CSVs round-trip', async () => {
  await withApp(async (app, env) => {
    const id = app.api.addPerson({
      name: 'Nadia Lind',
      role: 'Designer',
      startDate: '2026-10-20',
      talkingPoints: ['Design critique cadence'],
    }).id;
    app.api.addRecognition({ personId: id, what: 'Simplified onboarding flow', visibility: 'public', values: ['Craft'] });
    app.api.setReadiness({ personId: id, seat: 'Design Lead', rating: 'not-ready', notes: '=2+3 formula note' });

    // Open 1:1 dialog and verify suggested agenda checkboxes are mounted and interactive
    app.navigate('#/oneonones');
    const view = env.document.getElementById('view');
    click([...view.querySelectorAll('button')].find((b) => b.textContent.includes('Log a 1:1')));
    let dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    const agendaPicks = [...dialog.querySelectorAll('.agenda-picks input[type="checkbox"]')];
    assert.ok(agendaPicks.length >= 2, 'suggested agenda checkboxes are mounted in DOM');
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), []);

    // Uncheck all but the first agenda item and save
    while (dialog.querySelectorAll('.agenda-picks input:not([name]):checked').length > 1) {
      setValue(dialog.querySelectorAll('.agenda-picks input:not([name]):checked')[1], false);
    }
    setValue(dialog.querySelector('input[name=confirmDiscussed]'), true);
    setValue(dialog.querySelector('textarea[name="notes"]'), 'Discussed critique cadence and week-one setup.');
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Log it')));
    assert.equal(app.store.state.oneOnOnes[0].agenda.length, 1, 'only the checked agenda item was logged');
    assert.equal(app.store.state.oneOnOnes[0].agenda[0].done, true);

    // Verify onboarding dialog renders boxLabel text and single label[for] (axe-clean)
    app.navigate('#/onboarding');
    click([...view.querySelectorAll('button')].find((b) => b.textContent.includes('Start plan for Nadia Lind')));
    dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog.textContent.includes('Include 6 editable 30 / 60 / 90 checkpoints'), 'boxLabel text is rendered');
    const templateInput = dialog.querySelector('input[name="useTemplate"]');
    assert.equal(dialog.querySelectorAll(`label[for="${templateInput.id}"]`).length, 1, 'exactly one <label for> per checkbox');
    assert.ok(templateInput.closest('.field').classList.contains('field-wide'), 'span: 2 applies field-wide');
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), []);
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Cancel')));

    // Verify Settings shows '30-60-90 plans' (not raw 'onboarding') and CSV exports readiness + recognition visibility
    app.navigate('#/settings');
    assert.ok(view.textContent.includes('30-60-90 plans'));
    assert.equal(view.textContent.includes('\nonboarding\n'), false);

    const recCsv = parseCsv(exportWorkspaceCsv(app.store.state, 'recognition', { now: NOW }).csv);
    const visIdx = recCsv.headers.indexOf('visibility');
    assert.ok(visIdx >= 0);
    assert.equal(recCsv.rows[0][visIdx], 'public');

    const readyCsv = parseCsv(exportWorkspaceCsv(app.store.state, 'readiness', { now: NOW }).csv);
    assert.ok(readyCsv.headers.includes('seat') && readyCsv.headers.includes('evidence_met_count'));
    const notesIdx = readyCsv.headers.indexOf('notes');
    assert.equal(readyCsv.rows[0][notesIdx], "'=2+3 formula note", 'readiness CSV neutralizes formula injection');

    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  });
});

test('#/onboarding renders reboarding alongside new-hire and transition plans, Edit rating pre-populates readiness fields, and operational JSON round-trips', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    const freya = app.store.state.people.find((p) => p.name.includes('Freya'));
    assert.ok(freya);

    // Create a reboarding plan through the dialog on #/onboarding
    app.navigate('#/onboarding');
    const view = env.document.getElementById('view');
    click([...view.querySelectorAll('button')].find((b) => b.textContent.includes('Start 30-60-90 plan')));
    let dialog = env.document.querySelector('[role="dialog"]');
    setValue(dialog.querySelector('select[name="personId"]'), freya.id);
    setValue(dialog.querySelector('select[name="kind"]'), 'reboarding');
    assert.ok(dialog.textContent.includes('never record medical or personal leave reasons'));
    assert.equal(dialog.querySelector('input[name="startDate"]').value, '2026-10-25');
    setValue(dialog.querySelector('textarea[name="roleClarity"]'), 'Catch up on Q3 metrics definitions and resume weekly experimentation triage.');
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), []);
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Create 30-60-90 plan')));

    assert.equal(env.document.querySelector('[role="dialog"]'), null);
    assert.ok(view.textContent.includes('1 onboarding · 1 transition · 1 return to work'));
    assert.ok(view.textContent.includes('Return to work'));
    assert.deepEqual(await axeViolations(env, '#view'), []);

    // Verify Edit rating on #/readiness pre-populates existing rating & notes
    const priya = app.store.state.people.find((p) => p.name.includes('Priya'));
    app.api.setReadiness({
      personId: priya.id,
      seat: 'Director of Engineering',
      rating: 'not-ready',
      notes: 'Lead cross-squad hiring plan in Q4.',
    });
    app.navigate('#/readiness');
    const dirSeat = [...view.querySelectorAll('.seat-card')].find((s) => s.textContent.includes('Director of Engineering'));
    click([...dirSeat.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Edit rating'));
    dialog = env.document.querySelector('[role="dialog"]');
    assert.equal(dialog.querySelector('select[name="rating"]').value, 'not-ready');
    assert.equal(dialog.querySelector('textarea[name="notes"]').value, 'Lead cross-squad hiring plan in Q4.');
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Cancel')));

    // Verify Start transition from #/people/:id opens handoff dialog
    app.navigate(`#/people/${encodeURIComponent(priya.id)}`);
    const personStartBtn = [...view.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start transition');
    assert.ok(personStartBtn);
    click(personStartBtn);
    dialog = env.document.querySelector('[role="dialog"]');
    assert.equal(dialog.querySelector('input[name="label"]').value, 'Director of Engineering');
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Cancel')));

    // Operational (redacted) JSON export preserves reboarding kind cleanly
    const exported = JSON.parse(app.store.exportJSON({ redact: true }));
    assert.equal(exported.schemaVersion, SCHEMA_VERSION);
    assert.ok(exported.state.onboarding.some((p) => p.kind === 'reboarding'));
    assert.equal(exported.state.conflicts.length, 0, 'confidential conflicts omitted in operational export');
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  });
});


test('1:1 preparation is not evidence of discussion; explicit confirmation closes only selected topics', async () => {
  await withApp(async (app, env) => {
    const id = app.api.addPerson({ name: 'Morgan', talkingPoints: ['Workload', 'Career path'] }).id;
    const open = () => {
      app.navigate(`#/prep/${id}`);
      click([...env.document.querySelectorAll('#view button')].find((b) => b.textContent.includes('Log the 1:1')));
      return env.document.querySelector('[role="dialog"]');
    };
    const save = (dialog) => click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Log it')));
    let dialog = open();
    assert.equal(dialog.querySelector('input[name=confirmDiscussed]').checked, false);
    assert.equal(dialog.querySelector('input[name=clearCoveredTopics]').disabled, true);
    save(dialog);
    assert.deepEqual(app.store.state.people.find((p) => p.id === id).talkingPoints, ['Workload', 'Career path']);
    assert.ok(app.store.state.oneOnOnes[0].agenda.every((a) => !a.done));
    const reloaded = createStore({ storage: env.window.localStorage, now: () => NOW });
    reloaded.load();
    assert.deepEqual(reloaded.state.people.find((p) => p.id === id).talkingPoints, ['Workload', 'Career path']);

    dialog = open();
    const career = [...dialog.querySelectorAll('.agenda-pick')].find((row) => row.textContent.includes('Career path'));
    setValue(career.querySelector('input'), false);
    setValue(dialog.querySelector('input[name=confirmDiscussed]'), true);
    setValue(dialog.querySelector('input[name=clearCoveredTopics]'), true);
    save(dialog);
    assert.deepEqual(app.store.state.people.find((p) => p.id === id).talkingPoints, ['Career path']);
    assert.ok(app.store.state.oneOnOnes.at(-1).agenda.find((a) => a.text === 'Workload').done);

    dialog = open();
    setValue(dialog.querySelector('input[name=confirmDiscussed]'), true);
    setValue(dialog.querySelector('input[name=clearCoveredTopics]'), true);
    const firstPick = dialog.querySelector('.agenda-picks input:not([name])');
    setValue(firstPick, !firstPick.checked);
    assert.equal(dialog.querySelector('input[name=confirmDiscussed]').checked, false);
    assert.equal(dialog.querySelector('input[name=clearCoveredTopics]').checked, false);
    setValue(dialog.querySelector('input[name=confirmDiscussed]'), true);
    setValue(dialog.querySelector('input[name=clearCoveredTopics]'), true);
    setValue(dialog.querySelector('select[name=status]'), 'skipped');
    assert.equal(dialog.querySelector('input[name=confirmDiscussed]').disabled, true);
    setValue(dialog.querySelector('select[name=status]'), 'held');
    assert.equal(dialog.querySelector('input[name=confirmDiscussed]').checked, false);
    assert.equal(dialog.querySelector('input[name=clearCoveredTopics]').checked, false);
    save(dialog);
    assert.deepEqual(app.store.state.people.find((p) => p.id === id).talkingPoints, ['Career path']);
  });
});
