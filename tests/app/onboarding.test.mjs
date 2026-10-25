/**
 * tests/app/onboarding.test.mjs — 30-60-90 onboarding milestone tracker and
 * session-9 UI/CSV/settings regressions.
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
  defaultCheckpoints,
  onboardingFor,
  activeOnboarding,
  onboardingHealth,
  newJoinersWithoutPlan,
  onboardingSummary,
} from '../../app/core/domain/onboarding.js';
import { suggestAgenda } from '../../app/core/domain/oneonone.js';
import { buildPrepSheet } from '../../app/core/domain/prep.js';
import { personTimeline } from '../../app/core/domain/people.js';
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

/* ----------------------------------------------------- schema & migrations */

test('schema v1..v5 migrate additively to schema v6 without fabricating onboarding plans', () => {
  for (const schemaVersion of [1, 2, 3, 4, 5]) {
    const raw = { ...createEmptyState(NOW.toISOString()), schemaVersion };
    delete raw.onboarding;
    raw.people = [{ id: 'p1', name: 'Nadia Lind', startDate: '2026-10-01', status: 'active', createdAt: NOW.toISOString() }];
    const migrated = migrate(raw);
    assert.equal(migrated.raw.schemaVersion, SCHEMA_VERSION);
    assert.ok(migrated.applied.includes('5 → 6'));
    const normalized = normalizeState(migrated.raw, { now: NOW });
    assert.deepEqual(normalized.state.onboarding, [], 'migration never fabricates onboarding plans');
    assert.equal(raw.onboarding, undefined, 'source object is not mutated');
  }
});

test('normalizeState repairs self-buddies, duplicate stakeholders, invalid dates and unverified completed plans', () => {
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    people: [{ id: 'p1', name: 'Nadia Lind', startDate: '2026-09-01', status: 'active' }],
    onboarding: [
      {
        id: 'onb-1',
        personId: 'p1',
        startDate: '2026-09-01',
        buddyId: 'p1', // self-buddy invalid
        roleClarity: 'Own data quality.',
        stakeholders: [
          { id: 's1', name: 'Priya', purpose: 'On-call', met: true, metOn: 'not-a-date' },
          { id: 's2', name: 'priya ', purpose: 'Duplicate' },
        ],
        checkpoints: [
          { id: 'c1', horizon: 30, category: 'clarity', title: 'Scope walkthrough', due: '2026-02-31', done: true, completedOn: null },
        ],
        reviews: {
          30: { heldOn: '2026-11-30', summary: 'Future check-in must be ignored' },
          60: { heldOn: '2026-08-15', summary: 'Pre-start check-in must be ignored' },
          90: null,
        },
        status: 'completed', // invalid without Day 90 check-in
      },
      { id: 'onb-bad', personId: 'p1', startDate: '2026-02-30' },
    ],
  };

  const { state, warnings } = normalizeState(raw, { now: NOW });
  assert.equal(state.onboarding.length, 1);
  const plan = state.onboarding[0];
  assert.equal(plan.buddyId, null, 'self-assigned buddy cleared');
  assert.equal(plan.stakeholders.length, 1, 'case-insensitive duplicate stakeholder dropped');
  assert.equal(plan.stakeholders[0].metOn, null, 'unknown/invalid metOn stays null, never fabricated');
  assert.equal(plan.checkpoints[0].due, null, 'impossible calendar date repaired to null');
  assert.equal(plan.checkpoints[0].completedOn, null, 'missing completedOn stays null');
  assert.equal(plan.reviews[30], null, 'future check-in dropped');
  assert.equal(plan.reviews[60], null, 'pre-start check-in dropped');
  assert.equal(plan.status, 'active', 'completed plan without Day 90 check-in reopened');
  assert.ok(warnings.some((w) => w.includes('self-assigned buddy')));
  assert.ok(warnings.some((w) => w.includes('reopened a completed plan')));
});

/* ----------------------------------------------------- domain & actions */

test('onboarding lifecycle: create, scaffolding gaps, stakeholder & checkpoint updates, chronology guards, Day 90 gate, CSV and JSON round-trip', () => {
  const h = harness();
  const joinerId = h.api.addPerson({ name: 'Nadia Lind', role: 'Analytics Engineer', startDate: '2026-09-10' }).id;
  const buddyId = h.api.addPerson({ name: 'Priya Natarajan', role: 'Engineering Lead', startDate: '2024-05-01' }).id;

  // Before creating a plan, Nadia (day 45) appears in newJoinersWithoutPlan and triggers ONB-02
  assert.deepEqual(newJoinersWithoutPlan(h.store.state, NOW, h.store.state.settings).map((p) => p.id), [joinerId]);
  assert.ok(buildInsights(h.store.state, NOW).findings.some((f) => f.ruleId === 'ONB-02' && f.personId === joinerId));

  // Self-buddy and impossible startDate are rejected without writing
  assert.equal(h.api.createOnboardingPlan({ personId: joinerId, buddyId: joinerId }).ok, false);
  assert.equal(h.api.createOnboardingPlan({ personId: joinerId, startDate: '2026-02-29' }).ok, false);
  assert.equal(h.store.state.onboarding.length, 0);

  // Create minimal plan first to verify ONB-03 scaffolding-gap detection
  const created = h.api.createOnboardingPlan({
    personId: joinerId,
    startDate: '2026-09-10',
    useTemplate: true,
  });
  assert.equal(created.ok, true);
  assert.equal(defaultCheckpoints('2026-09-10').length, 6);

  // Duplicate active plan for same person is refused
  assert.equal(h.api.createOnboardingPlan({ personId: joinerId }).ok, false);

  let plan = activeOnboarding(h.store.state, joinerId);
  let health = onboardingHealth(plan, h.store.state, NOW, h.store.state.settings);
  assert.equal(health.dayNumber, 45);
  assert.equal(health.currentHorizon, 60);
  assert.equal(health.scaffoldingGaps.length, 4, 'role clarity, buddy, stakeholder map, and early win all missing at day 45');
  assert.equal(health.overdueReviews.length, 1, 'Day 30 check-in is overdue at day 45');
  assert.equal(health.checkpointStats.overdue, 2, 'both Day 30 default checkpoints are overdue');

  const insightsBefore = buildInsights(h.store.state, NOW).findings;
  assert.ok(!insightsBefore.some((f) => f.ruleId === 'ONB-02' && f.personId === joinerId), 'ONB-02 clears once plan exists');
  assert.ok(insightsBefore.some((f) => f.ruleId === 'ONB-03' && f.personId === joinerId), 'ONB-03 flags missing scaffolding');
  assert.ok(insightsBefore.some((f) => f.ruleId === 'ONB-04' && f.personId === joinerId), 'ONB-04 flags overdue Day 30 items');

  // Fill in scaffolding + stakeholders
  assert.equal(
    h.api.updateOnboardingPlan(plan.id, {
      buddyId,
      roleClarity: 'Own core product event pipelines and weekly data quality SLA.',
      earlyWin: 'Ship automated freshness checks on the activation funnel table.',
    }).ok,
    true,
  );
  const s1 = h.api.addOnboardingStakeholder(plan.id, { name: 'Mei Lin Chen', purpose: 'Billing schema contract' });
  assert.equal(s1.ok, true);
  assert.equal(h.api.addOnboardingStakeholder(plan.id, { name: 'mei lin chen' }).ok, false, 'duplicate stakeholder rejected');
  assert.equal(h.api.toggleOnboardingStakeholder(plan.id, s1.id, { met: true }).ok, true);

  plan = activeOnboarding(h.store.state, joinerId);
  health = onboardingHealth(plan, h.store.state, NOW, h.store.state.settings);
  assert.equal(health.scaffoldingGaps.length, 0, 'all scaffolding basics now in place');
  assert.equal(health.stakeholderStats.items[0].metOn, '2026-10-25');

  // Agenda & printable prep sheet carry onboarding items and still exclude conflicts & pulses
  h.api.addConflict({
    title: 'SECRET_CONFLICT_TITLE',
    summary: 'SECRET_CONFLICT_SUMMARY',
    coordinator: 'Manager',
    openedOn: '2026-10-20',
    nextFollowUpOn: '2026-10-28',
    safety: 'direct',
    participants: [{ name: 'Nadia Lind' }, { name: 'Priya Natarajan' }],
  });
  const agenda = suggestAgenda(h.store.state, joinerId, NOW, h.store.state.settings);
  assert.ok(agenda.some((item) => item.source === 'onboarding' && item.text.includes('Day 30')));
  const sheet = buildPrepSheet(h.store.state, joinerId, NOW, h.store.state.settings);
  assert.ok(sheet.commitments.onboarding.length >= 2);
  assert.equal(JSON.stringify(sheet).includes('SECRET_CONFLICT'), false, 'confidential conflicts never enter prep sheet');

  // Complete all checkpoints and verify chronology guards on check-in reviews
  for (const cp of plan.checkpoints) {
    assert.equal(h.api.toggleOnboardingCheckpoint(plan.id, cp.id, { done: true }).ok, true);
  }
  assert.equal(h.api.recordOnboardingReview(plan.id, { horizon: 30, heldOn: '2026-09-01', summary: 'Before start' }).ok, false);
  assert.equal(h.api.recordOnboardingReview(plan.id, { horizon: 30, heldOn: '2026-10-30', summary: 'Future date' }).ok, false);
  assert.equal(h.api.recordOnboardingReview(plan.id, { horizon: 30, heldOn: '2026-10-10', summary: '' }).ok, false);

  assert.equal(h.api.recordOnboardingReview(plan.id, { horizon: 30, heldOn: '2026-10-10', summary: 'Role scope clear; paired with Priya.' }).ok, true);
  assert.equal(h.api.recordOnboardingReview(plan.id, { horizon: 60, heldOn: '2026-10-24', summary: 'Freshness checks live in staging.' }).ok, true);

  // Cannot complete before Day 90 check-in is recorded
  assert.equal(h.api.completeOnboardingPlan(plan.id).ok, false);

  assert.equal(h.api.recordOnboardingReview(plan.id, { horizon: 90, heldOn: '2026-10-25', summary: 'Owns pipeline SLA; transitioning to Q4 goal.' }).ok, true);
  assert.equal(h.api.completeOnboardingPlan(plan.id).ok, true);

  // Completed plan is read-only until reopened, appears in timeline & wins, and exports cleanly
  assert.equal(h.api.addOnboardingCheckpoint(plan.id, { horizon: 90, title: 'Extra' }).ok, false);
  const timeline = personTimeline(h.store.state, joinerId);
  assert.ok(timeline.some((t) => t.kind === 'Onboarding completed'));
  assert.ok(timeline.some((t) => t.kind === 'Day 90 check-in'));
  assert.ok(buildInsights(h.store.state, NOW).wins.some((w) => w.title.includes('completed 30-60-90 plan')));

  const csvRes = exportWorkspaceCsv(h.store.state, 'onboarding', { now: NOW });
  assert.equal(csvRes.ok, true);
  const parsedCsv = parseCsv(csvRes.csv);
  assert.equal(parsedCsv.rows.length, 6);
  assert.ok(csvRes.csv.includes('Nadia Lind'));
  assert.equal(csvRes.csv.includes('SECRET_CONFLICT'), false);

  // JSON round-trip preserves everything
  const restored = harness();
  assert.equal(restored.store.importJSON(h.store.exportJSON()).ok, true);
  assert.deepEqual(onboardingFor(restored.store.state, joinerId), onboardingFor(h.store.state, joinerId));

  // Reopen works and logs audit event
  assert.equal(h.api.reopenOnboardingPlan(plan.id).ok, true);
  assert.equal(onboardingFor(h.store.state, joinerId)[0].status, 'active');
  assert.ok(h.store.state.events.some((e) => e.type === 'onboarding.reopened'));
});

test('archived buddy surfaces as a scaffolding gap and past-window active plan triggers ONB-05', () => {
  const h = harness();
  const joinerId = h.api.addPerson({ name: 'Omar Darwish', startDate: '2026-07-01' }).id;
  const buddyId = h.api.addPerson({ name: 'Former Buddy', startDate: '2025-01-01' }).id;
  const planId = h.api.createOnboardingPlan({
    personId: joinerId,
    startDate: '2026-07-01',
    buddyId,
    roleClarity: 'Own API gateway.',
    earlyWin: 'Add rate-limit dashboards.',
    stakeholders: [{ name: 'Platform', purpose: 'Gateway routing', met: true }],
  }).id;
  h.api.archivePerson(buddyId);

  const plan = activeOnboarding(h.store.state, joinerId);
  const health = onboardingHealth(plan, h.store.state, NOW, h.store.state.settings);
  assert.equal(health.hasBuddy, false);
  assert.ok(health.scaffoldingGaps.some((g) => g.key === 'buddy' && g.evidence.includes('archived')));
  assert.equal(health.pastWindow, true);
  const findings = buildInsights(h.store.state, NOW).findings;
  assert.ok(findings.some((f) => f.ruleId === 'ONB-05' && f.personId === joinerId));
  assert.equal(onboardingSummary(h.store.state, NOW, h.store.state.settings).overdueCount, 1);
  assert.ok(planId);
});

/* ----------------------------------------------------- UI & accessibility */

test('#/onboarding workflow, #/people onboarding card, #/recognition badges/filters, idleLockMinutes=0 and axe-core', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();

    // 1. Demo workspace renders #/onboarding cleanly and passes axe-core
    app.navigate('#/onboarding');
    const view = env.document.getElementById('view');
    assert.ok(view.textContent.includes('Onboarding & transitions (30-60-90)'));
    assert.ok(view.textContent.includes('Samuel Okafor'));
    const axeOnboarding = await runAxe(env, '#view');
    assert.equal(axeOnboarding.violations.length, 0, JSON.stringify(axeOnboarding.violations));

    // 2. Create a new joiner and start a 30-60-90 plan through the real UI dialog
    const nadiaId = app.api.addPerson({ name: 'Nadia Lind', role: 'Analytics Engineer', startDate: '2026-10-05' }).id;
    app.navigate('#/onboarding');
    const startForNadia = [...view.querySelectorAll('button')].find((b) => b.textContent.includes('Start plan for Nadia Lind'));
    assert.ok(startForNadia, 'unstarted new joiner banner offers 1-click plan button');
    click(startForNadia);

    let dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'plan creation dialog opens');
    setValue(dialog.querySelector('textarea[name="roleClarity"]'), 'Own product analytics definitions.');
    setValue(dialog.querySelector('textarea[name="earlyWin"]'), 'Validate activation funnel events.');
    setValue(dialog.querySelector('textarea[name="stakeholderLines"]'), 'Freya Nilsson | Warehouse pairing');
    const createBtn = [...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Create 30-60-90 plan'));
    click(createBtn);
    assert.equal(env.document.querySelector('[role="dialog"]'), null, 'dialog closes on valid create');

    // Filter to Nadia and log her Day 30 check-in through the dialog
    app.navigate(`#/onboarding?person=${encodeURIComponent(nadiaId)}`);
    assert.ok(view.textContent.includes('Own product analytics definitions.'));
    const logDay30 = [...view.querySelectorAll('button')].find((b) => b.textContent.includes('Log Day 30 check-in'));
    click(logDay30);
    dialog = env.document.querySelector('[role="dialog"]');
    setValue(dialog.querySelector('textarea[name="summary"]'), 'Clear on metric definitions and warehouse access.');
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Log check-in')));
    assert.ok(view.textContent.includes('Clear on metric definitions and warehouse access.'));

    // Person page displays the Onboarding (30-60-90) card and passes axe-core
    app.navigate(`#/people/${encodeURIComponent(nadiaId)}`);
    assert.ok(view.textContent.includes('Onboarding (30-60-90)'));
    assert.ok(view.textContent.includes('Day 30'));
    const axePerson = await runAxe(env, '#view');
    assert.equal(axePerson.violations.length, 0, JSON.stringify(axePerson.violations));

    // 3. Recognition view renders visibility === 'public' as 'shared' and supports ?person= filter
    app.navigate('#/recognition');
    assert.ok(view.textContent.includes('shared'), 'public recognition renders shared badge instead of private');
    app.navigate(`#/recognition?person=${encodeURIComponent(nadiaId)}`);
    assert.ok(view.textContent.includes('Filtered to Nadia Lind'));

    // 4. Settings dialog accepts idleLockMinutes = 0 ("0 disables it")
    app.navigate('#/settings');
    click([...view.querySelectorAll('button')].find((b) => b.textContent.includes('Edit cadences')));
    dialog = env.document.querySelector('[role="dialog"]');
    setValue(dialog.querySelector('input[name="idleLockMinutes"]'), '0');
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Save settings')));
    assert.equal(env.document.querySelector('[role="dialog"]'), null, 'settings dialog accepts 0 for idleLockMinutes');
    assert.equal(app.store.state.settings.idleLockMinutes, 0);
    assert.ok(view.textContent.includes('Off'), 'settings summary displays Off when idleLockMinutes is 0');

    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  });
});
