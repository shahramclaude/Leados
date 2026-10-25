/**
 * tests/app/transitions.test.mjs — Schema v10 internal role-transition
 * 30-60-90 plans (Session 13).
 *
 * The behaviour under test: a tenured person promoted or moved into a new
 * scope gets the same 30-60-90 scaffolding as a new joiner, but labelled as
 * the move it is, anchored to the day the new role starts, and never by
 * rewriting `person.startDate` (their tenure and every tenure-derived signal
 * must stay truthful).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  activeOnboarding,
  onboardingFor,
  onboardingHealth,
  onboardingSummary,
  newJoinersWithoutPlan,
  defaultTransitionCheckpoints,
  planKind,
} from '../../app/core/domain/onboarding.js';
import { isNewJoiner, tenureDays, personTimeline } from '../../app/core/domain/people.js';
import { suggestAgenda } from '../../app/core/domain/oneonone.js';
import { buildPrepSheet } from '../../app/core/domain/prep.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { buildDemoState } from '../../app/core/demo.js';
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
  const idFactory = (prefix) => `${prefix}-t-${++seq}`;
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

/* ----------------------------------------------------- schema & migration */

test('schema v9 → v10 labels every existing plan new-hire without inventing a transition, and keeps a relabelled file intact', () => {
  assert.equal(SCHEMA_VERSION, 18);
  const v9 = {
    ...createEmptyState(NOW.toISOString()),
    schemaVersion: 9,
    people: [{ id: 'p1', name: 'Ruth Adler', startDate: '2023-03-01', status: 'active', createdAt: NOW.toISOString() }],
    onboarding: [
      { id: 'onb-old', personId: 'p1', startDate: '2023-03-01', status: 'completed', reviews: { 90: { heldOn: '2023-05-30', summary: 'Done' } } },
      { id: 'onb-relabelled', personId: 'p1', startDate: '2026-09-01', status: 'active', kind: 'role-transition', label: 'Support Director' },
    ],
  };
  const migrated = migrate(v9);
  assert.equal(migrated.raw.schemaVersion, 18);
  assert.deepEqual(migrated.applied, ['9 → 10', '10 → 11', '11 → 12', '12 → 13', '13 → 14', '14 → 15', '15 → 16', '16 → 17', '17 → 18']);
  assert.equal('kind' in v9.onboarding[0], false, 'source object is not mutated');

  const { state } = normalizeState(migrated.raw, { now: NOW });
  const old = state.onboarding.find((p) => p.id === 'onb-old');
  assert.equal(old.kind, 'new-hire', 'a pre-v10 plan is honestly a new-joiner plan');
  assert.equal(old.label, '');
  const relabelled = state.onboarding.find((p) => p.id === 'onb-relabelled');
  assert.equal(relabelled.kind, 'role-transition', 'a valid existing kind survives migration');
  assert.equal(relabelled.label, 'Support Director');
});

test('normalizeState repairs an unrecognised plan kind to new-hire and warns on an unlabelled transition', () => {
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    people: [{ id: 'p1', name: 'Ruth Adler', startDate: '2023-03-01', status: 'active' }],
    onboarding: [
      { id: 'onb-a', personId: 'p1', startDate: '2026-09-01', kind: 'sideways-promotion', label: 'x'.repeat(300) },
      { id: 'onb-b', personId: 'p1', startDate: '2026-09-01', kind: 'role-transition', label: '   ' },
    ],
  };
  const { state, warnings } = normalizeState(raw, { now: NOW });
  const a = state.onboarding.find((p) => p.id === 'onb-a');
  assert.equal(a.kind, 'new-hire', 'unknown kind is never guessed into a transition');
  assert.equal(a.label.length, 160, 'label is clipped to the stored maximum');
  const b = state.onboarding.find((p) => p.id === 'onb-b');
  assert.equal(b.kind, 'role-transition', 'an unlabelled transition is kept, not dropped');
  assert.ok(warnings.some((w) => w.includes('unrecognised plan type')));
  assert.ok(warnings.some((w) => w.includes('does not name the new role')));
  assert.equal(planKind({}), 'new-hire');
  assert.equal(planKind({ kind: 'role-transition' }), 'role-transition');
});

/* ----------------------------------------------------- domain & actions */

test('role transition: label required, anchored to the new role (never the original start date), tenure untouched, transition template', () => {
  const h = harness();
  const ruthId = h.api.addPerson({ name: 'Ruth Adler', role: 'Senior Support Engineer', startDate: '2023-03-01' }).id;

  // A transition without a label is refused and writes nothing.
  assert.equal(h.api.createOnboardingPlan({ personId: ruthId, kind: 'role-transition' }).ok, false);
  assert.equal(h.api.createOnboardingPlan({ personId: ruthId, kind: 'sideways', label: 'X' }).ok, false);
  // A transition cannot be anchored before the person joined the team.
  assert.equal(
    h.api.createOnboardingPlan({ personId: ruthId, kind: 'role-transition', label: 'Support Director', startDate: '2022-12-01' }).ok,
    false,
  );
  assert.equal(h.store.state.onboarding.length, 0, 'rejections never write');

  // No startDate supplied: the transition defaults to today, NOT 2023-03-01.
  const created = h.api.createOnboardingPlan({ personId: ruthId, kind: 'role-transition', label: 'Support Director' });
  assert.equal(created.ok, true);
  const plan = activeOnboarding(h.store.state, ruthId);
  assert.equal(plan.kind, 'role-transition');
  assert.equal(plan.label, 'Support Director');
  assert.equal(plan.startDate, '2026-10-25', 'anchored to the day the new role starts');

  const person = h.store.state.people.find((p) => p.id === ruthId);
  assert.equal(person.startDate, '2023-03-01', 'the roster record is never rewritten');
  assert.equal(tenureDays(person, NOW), 1334);
  assert.equal(isNewJoiner(person, NOW, h.store.state.settings), false, 'Ruth does not become a "new joiner" again');
  assert.ok(h.store.state.events.some((e) => e.type === 'onboarding.created' && e.summary.includes('role-transition') && e.summary.includes('Support Director')));

  // Transition template: handover first, habit-reset at 60, anchored dues.
  const template = defaultTransitionCheckpoints('2026-10-25');
  assert.equal(template.length, 6);
  assert.ok(template[0].title.includes('handover inventory'));
  assert.equal(template[0].due, '2026-11-08');
  assert.equal(template[5].due, '2027-01-23');
  assert.deepEqual(plan.checkpoints.map((c) => c.title), template.map((c) => c.title));

  // One active plan per person, across kinds, and the refusal names the plan.
  const dup = h.api.createOnboardingPlan({ personId: ruthId });
  assert.equal(dup.ok, false);
  assert.ok(dup.error.includes('role-transition plan') && dup.error.includes('Support Director'));

  // New-hire creation is unchanged: kind defaults, anchor defaults to the roster start date.
  const nadiaId = h.api.addPerson({ name: 'Nadia Lind', startDate: '2026-10-20' }).id;
  assert.equal(h.api.createOnboardingPlan({ personId: nadiaId }).ok, true);
  const nadiaPlan = activeOnboarding(h.store.state, nadiaId);
  assert.equal(nadiaPlan.kind, 'new-hire');
  assert.equal(nadiaPlan.label, '');
  assert.equal(nadiaPlan.startDate, '2026-10-20');
  assert.ok(nadiaPlan.checkpoints[0].title.includes('role scope'), 'new-joiner template unchanged');
});

test('reclassifying a plan changes only the framing: checkpoints, check-ins and history survive', () => {
  const h = harness();
  const ruthId = h.api.addPerson({ name: 'Ruth Adler', startDate: '2023-03-01' }).id;
  const planId = h.api.createOnboardingPlan({ personId: ruthId, startDate: '2026-09-15', roleClarity: 'Original framing.' }).id;
  assert.equal(h.api.recordOnboardingReview(planId, { horizon: 30, heldOn: '2026-10-15', summary: 'Settling in.' }).ok, true);
  const before = activeOnboarding(h.store.state, ruthId);

  // Converting to a transition still requires the label.
  assert.equal(h.api.updateOnboardingPlan(planId, { kind: 'role-transition' }).ok, false);
  assert.equal(h.api.updateOnboardingPlan(planId, { kind: 'lateral-ish' }).ok, false);
  assert.equal(h.api.updateOnboardingPlan(planId, { kind: 'role-transition', label: 'Support Director' }).ok, true);

  const after = activeOnboarding(h.store.state, ruthId);
  assert.equal(after.kind, 'role-transition');
  assert.equal(after.label, 'Support Director');
  assert.equal(after.startDate, '2026-09-15', 'the anchor is not moved by relabelling');
  assert.deepEqual(after.checkpoints, before.checkpoints);
  assert.deepEqual(after.reviews, before.reviews);
  assert.equal(after.roleClarity, 'Original framing.');

  // JSON round-trip preserves kind and label.
  const restored = harness();
  assert.equal(restored.store.importJSON(h.store.exportJSON()).ok, true);
  assert.deepEqual(onboardingFor(restored.store.state, ruthId), onboardingFor(h.store.state, ruthId));
});

test('signals: transition plans get ONB-03/04/05 with transition wording; tenure-based ONB-01/02 stay silent for tenured people', () => {
  const h = harness();
  const ruthId = h.api.addPerson({ name: 'Ruth Adler', startDate: '2023-03-01' }).id;
  // Day 40 of the transition, no scaffolding, no Day 30 check-in.
  h.api.createOnboardingPlan({ personId: ruthId, kind: 'role-transition', label: 'Support Director', startDate: '2026-09-15', useTemplate: true });

  const findings = buildInsights(h.store.state, NOW).findings.filter((f) => f.personId === ruthId);
  assert.equal(findings.some((f) => f.ruleId === 'ONB-01' || f.ruleId === 'ONB-02'), false, 'not a new joiner — no joiner signals');
  const onb03 = findings.find((f) => f.ruleId === 'ONB-03');
  assert.ok(onb03 && onb03.title.includes('role-transition plan'), 'ONB-03 names the transition');
  assert.ok(onb03.evidence.some((e) => e.includes('No peer buddy assigned for the new role')));
  const onb04 = findings.find((f) => f.ruleId === 'ONB-04');
  assert.ok(onb04 && onb04.title.includes('role transition'), 'ONB-04 names the transition');

  const health = onboardingHealth(activeOnboarding(h.store.state, ruthId), h.store.state, NOW, h.store.state.settings);
  assert.equal(health.isTransition, true);
  assert.equal(health.dayNumber, 40, 'days measured from the transition, not from 2023');
  assert.equal(health.scaffoldingGaps.length, 4);

  // Past-window transition (day 107) triggers ONB-05 with transition wording.
  const omarId = h.api.addPerson({ name: 'Omar Darwish', startDate: '2024-01-15' }).id;
  h.api.createOnboardingPlan({
    personId: omarId, kind: 'role-transition', label: 'Platform Lead', startDate: '2026-07-10',
    roleClarity: 'Own platform roadmap.', earlyWin: 'Ship the gateway migration.',
    buddyName: 'Priya (Engineering)', stakeholders: [{ name: 'CTO', purpose: 'Roadmap', met: true }],
  });
  const onb05 = buildInsights(h.store.state, NOW).findings.find((f) => f.ruleId === 'ONB-05' && f.personId === omarId);
  assert.ok(onb05 && onb05.title.includes('role-transition plan'), 'ONB-05 names the transition');

  const summary = onboardingSummary(h.store.state, NOW, h.store.state.settings);
  assert.equal(summary.activeCount, 2);
  assert.equal(summary.activeTransitionCount, 2);
  assert.equal(summary.activeNewHireCount, 0);

  // A brand-new joiner whose only plan is a transition still counts as plan-less onboarding.
  const newId = h.api.addPerson({ name: 'New Person', startDate: '2026-10-01' }).id;
  h.api.createOnboardingPlan({ personId: newId, kind: 'role-transition', label: 'Mislabelled start', startDate: '2026-10-01' });
  assert.ok(newJoinersWithoutPlan(h.store.state, NOW, h.store.state.settings).some((p) => p.id === newId));
  assert.ok(buildInsights(h.store.state, NOW).findings.some((f) => f.ruleId === 'ONB-02' && f.personId === newId));
});

test('transition lifecycle: Day 90 gate, completion, timeline, wins, agenda and prep wording', () => {
  const h = harness();
  const ruthId = h.api.addPerson({ name: 'Ruth Adler', startDate: '2023-03-01' }).id;
  const planId = h.api.createOnboardingPlan({
    personId: ruthId, kind: 'role-transition', label: 'Support Director', startDate: '2026-09-15',
    roleClarity: 'Own support quality and staffing.', earlyWin: 'Rework the triage rota.',
    buddyName: 'Daniel Osei', stakeholders: [{ name: 'VP CX', purpose: 'Escalations', met: true }],
  }).id;

  // Agenda + prep use transition wording and still exclude conflicts.
  h.api.addConflict({
    title: 'SECRET_CONFLICT_TITLE', summary: 'SECRET_CONFLICT_SUMMARY', coordinator: 'Manager',
    openedOn: '2026-10-20', nextFollowUpOn: '2026-10-28', safety: 'direct',
    participants: [{ name: 'Ruth Adler' }, { name: 'Priya Natarajan' }],
  });
  const agenda = suggestAgenda(h.store.state, ruthId, NOW, h.store.state.settings);
  assert.ok(agenda.some((i) => i.source === 'onboarding' && i.text.includes('Day 30 transition check-in')), `agenda: ${agenda.map((i) => i.text).join(' | ')}`);
  const sheet = buildPrepSheet(h.store.state, ruthId, NOW, h.store.state.settings);
  assert.ok(sheet.commitments.onboarding.some((c) => c.text === 'Hold Day 30 transition check-in'));
  assert.equal(JSON.stringify(sheet).includes('SECRET_CONFLICT'), false);

  // Chronology guards and the Day 90 completion gate apply identically.
  assert.equal(h.api.recordOnboardingReview(planId, { horizon: 30, heldOn: '2026-09-01', summary: 'Before the role started' }).ok, false);
  assert.equal(h.api.recordOnboardingReview(planId, { horizon: 30, heldOn: '2026-10-15', summary: 'Handover inventory agreed.' }).ok, true);
  assert.equal(h.api.completeOnboardingPlan(planId).ok, false);
  assert.equal(h.api.recordOnboardingReview(planId, { horizon: 60, heldOn: '2026-10-24', summary: 'Triage rota live.' }).ok, true);
  assert.equal(h.api.recordOnboardingReview(planId, { horizon: 90, heldOn: '2026-10-25', summary: 'Owns support quality end to end.' }).ok, true);
  assert.equal(h.api.completeOnboardingPlan(planId).ok, true);

  const timeline = personTimeline(h.store.state, ruthId);
  assert.ok(timeline.some((t) => t.kind === 'Role transition' && t.title.includes('Support Director')));
  assert.ok(timeline.some((t) => t.title === 'Day 30 transition check-in held'));
  assert.ok(timeline.some((t) => t.kind === 'Role transition completed'));
  assert.ok(buildInsights(h.store.state, NOW).wins.some((w) => w.title.includes('completed 30-60-90 plan')));
  assert.ok(h.store.state.events.some((e) => e.type === 'onboarding.completed' && e.summary.includes('role-transition')));
});

test('CSV: onboarding and actions exports carry plan kind and label, formula-safe', () => {
  const h = harness();
  const ruthId = h.api.addPerson({ name: 'Ruth Adler', startDate: '2023-03-01' }).id;
  const nadiaId = h.api.addPerson({ name: 'Nadia Lind', startDate: '2026-10-20' }).id;
  h.api.createOnboardingPlan({ personId: ruthId, kind: 'role-transition', label: '=2+5+cmd', startDate: '2026-10-13' });
  h.api.createOnboardingPlan({ personId: nadiaId, startDate: '2026-10-20' });

  const onb = exportWorkspaceCsv(h.store.state, 'onboarding', { now: NOW });
  assert.equal(onb.ok, true);
  const parsed = parseCsv(onb.csv);
  assert.ok(parsed.headers.includes('plan_kind') && parsed.headers.includes('plan_label'));
  const ruthRow = parsed.rows.map((r) => Object.fromEntries(parsed.headers.map((k, i) => [k, r[i]]))).find((r) => r.person_name === 'Ruth Adler');
  assert.equal(ruthRow.plan_kind, 'role-transition');
  const nadiaRow = parsed.rows.map((r) => Object.fromEntries(parsed.headers.map((k, i) => [k, r[i]]))).find((r) => r.person_name === 'Nadia Lind');
  assert.equal(nadiaRow.plan_kind, 'new-hire');
  assert.ok(onb.csv.includes("'=2+5+cmd"), 'formula-dangerous label is neutralised with a leading quote');

  const actions = exportWorkspaceCsv(h.store.state, 'actions', { now: NOW });
  assert.equal(actions.ok, true);
  assert.ok(actions.csv.includes('Role transition Day 30'));
  assert.ok(actions.csv.includes('Onboarding Day 30'));
});

test('demo workspace: Samuel onboards as a new joiner, Mei transitions at day 12 with 260 days of tenure intact', () => {
  const state = buildDemoState(NOW);
  assert.equal(state.onboarding.length, 2);
  const mei = state.people.find((p) => p.name === 'Mei Lin Chen');
  const samuel = state.people.find((p) => p.name === 'Samuel Okafor');
  const meiPlan = state.onboarding.find((p) => p.personId === mei.id);
  const samuelPlan = state.onboarding.find((p) => p.personId === samuel.id);
  assert.equal(samuelPlan.kind, 'new-hire');
  assert.equal(meiPlan.kind, 'role-transition');
  assert.equal(meiPlan.label, 'Billing platform tech lead');
  assert.equal(tenureDays(mei, NOW), 260, 'tenure is untouched by the transition plan');
  const health = onboardingHealth(meiPlan, state, NOW, state.settings);
  assert.equal(health.dayNumber, 12, 'the plan clock runs from the new role, not from her start date');
  assert.equal(health.scaffoldingGaps.length, 0);
  const summary = onboardingSummary(state, NOW, state.settings);
  assert.deepEqual([summary.activeCount, summary.activeNewHireCount, summary.activeTransitionCount], [2, 1, 1]);
  assert.equal(
    buildInsights(state, NOW).findings.some((f) => f.personId === mei.id && f.ruleId.startsWith('ONB')),
    false,
    'the demo transition is on track — no onboarding signal fires for Mei',
  );
});

/* ----------------------------------------------------- UI & accessibility */

test('#/onboarding renders both kinds; the dialog defaults a tenured person to a transition anchored today; axe-clean', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    app.navigate('#/onboarding');
    const view = env.document.getElementById('view');
    assert.ok(view.textContent.includes('Onboarding & transitions (30-60-90)'));
    assert.ok(view.textContent.includes('Role transition'));
    assert.ok(view.textContent.includes('Billing platform tech lead'));
    assert.ok(view.textContent.includes('1 onboarding · 1 transition'));
    const axeOnb = await runAxe(env, '#view');
    assert.equal(axeOnb.violations.length, 0, JSON.stringify(axeOnb.violations));

    // Person page frames Mei's card as a transition.
    const mei = app.store.state.people.find((p) => p.name === 'Mei Lin Chen');
    app.navigate(`#/people/${encodeURIComponent(mei.id)}`);
    assert.ok(view.textContent.includes('Role transition (30-60-90)'));
    assert.ok(view.textContent.includes('New scope: Billing platform tech lead'));

    // Start a plan for a tenured person through the real dialog.
    const ruthId = app.api.addPerson({ name: 'Ruth Adler', role: 'Senior Support Engineer', startDate: '2023-03-01' }).id;
    app.navigate(`#/onboarding?person=${encodeURIComponent(ruthId)}`);
    click([...view.querySelectorAll('button')].find((b) => b.textContent.includes('Start 30-60-90 plan')));
    let dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'plan dialog opens');
    const kindSelect = dialog.querySelector('select[name="kind"]');
    const startInput = dialog.querySelector('input[name="startDate"]');
    assert.equal(kindSelect.value, 'role-transition', 'tenured person defaults to a role transition');
    assert.equal(startInput.value, '2026-10-25', 'and anchors to today, not to 2023-03-01');

    // Submitting without the new-role label keeps the dialog open and writes nothing.
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Create 30-60-90 plan')));
    assert.ok(env.document.querySelector('[role="dialog"]'), 'dialog stays open without a label');
    assert.equal(activeOnboarding(app.store.state, ruthId), null);

    setValue(dialog.querySelector('input[name="label"]'), 'Support Director');
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Create 30-60-90 plan')));
    assert.equal(env.document.querySelector('[role="dialog"]'), null, 'dialog closes on valid create');
    const plan = activeOnboarding(app.store.state, ruthId);
    assert.equal(plan.kind, 'role-transition');
    assert.equal(plan.label, 'Support Director');
    assert.equal(plan.startDate, '2026-10-25');
    assert.ok(view.textContent.includes('Ruth Adler'));
    assert.ok(view.textContent.includes('Support Director'));
    const ruth = app.store.state.people.find((p) => p.id === ruthId);
    assert.equal(ruth.startDate, '2023-03-01', 'roster start date untouched by the UI flow');

    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  });
});

test('dialog start date follows the plan type until the leader picks a date themselves', async () => {
  await withApp(async (app, env) => {
    const ruthId = app.api.addPerson({ name: 'Ruth Adler', startDate: '2023-03-01' }).id;
    app.api.addPerson({ name: 'Nadia Lind', startDate: '2026-10-20' });
    app.navigate('#/onboarding');
    const view = env.document.getElementById('view');
    click([...view.querySelectorAll('button')].find((b) => b.textContent.includes('Start 30-60-90 plan')));
    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    const personSelect = dialog.querySelector('select[name="personId"]');
    const kindSelect = dialog.querySelector('select[name="kind"]');
    const startInput = dialog.querySelector('input[name="startDate"]');

    setValue(personSelect, ruthId);
    assert.equal(startInput.value, '2023-03-01', 'new-hire framing anchors to the roster start date');
    setValue(kindSelect, 'role-transition');
    assert.equal(startInput.value, '2026-10-25', 'transition framing re-anchors to today');
    setValue(startInput, '2026-10-06');
    setValue(kindSelect, 'new-hire');
    assert.equal(startInput.value, '2026-10-06', 'a date the leader picked is never overwritten');

    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  });
});
