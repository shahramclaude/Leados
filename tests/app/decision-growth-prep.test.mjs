/**
 * tests/app/decision-growth-prep.test.mjs — Session 16 suite covering:
 *   1. Schema v11 → v12 migration & normalization repairs (dangling/cross-person
 *      GROW delegation links, undecided-decision outcome reviews)
 *   2. Decision lifecycle integrity, DACI participant matching, editability
 *      (DEC-03), deep-linking (DEC-01), and Decision reviews queue on Today
 *   3. Delegation ↔ GROW development handoff (explicit link, carry-forward
 *      preservation, non-silent coaching reflection, CSV & snapshot rewind)
 *   4. 1:1 prep-sheet & employee-topic carry-through into Log a 1:1
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
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  reviewsDue,
  dueDecisionReviews,
  decisionReviewState,
  decisionsForPerson,
  decisionsInvolving,
} from '../../app/core/domain/decisions.js';
import {
  delegationGrowthHandoff,
  linkedDelegationForWill,
  growthLinkForDelegation,
  openWillActions,
} from '../../app/core/domain/growth.js';
import { buildMeetingAgendaCandidates } from '../../app/core/domain/oneonone.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-25T10:00:00.000Z');
const TODAY = '2026-10-25';

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
  const idFactory = (prefix) => `${prefix}-s16-${++seq}`;
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

/* -------------------------- 1. Schema v12 & Normalization Repairs */

test('schema v11 → v12 migrates non-destructively and normalizeState repairs broken delegation links and undecided decision reviews', () => {
  assert.equal(SCHEMA_VERSION, 48);

  const v11 = {
    ...createEmptyState(NOW.toISOString()),
    schemaVersion: 11,
    people: [
      { id: 'p1', name: 'Ada Lovelace', status: 'active', startDate: '2024-01-01', createdAt: NOW.toISOString() },
      { id: 'p2', name: 'Bo Diaz', status: 'active', startDate: '2024-01-01', createdAt: NOW.toISOString() },
    ],
    delegations: [
      {
        id: 'del-ada', personId: 'p1', title: 'Own migration cutover',
        expectedOutcome: 'Zero-downtime cutover', authority: 'own', support: 'DBA on call',
        delegatedOn: '2026-10-01', dueOn: '2026-11-01', status: 'active', checkins: [],
      },
      {
        id: 'del-bo', personId: 'p2', title: 'Bo owned work',
        expectedOutcome: 'Delivered', authority: 'agree', support: 'Pairing',
        delegatedOn: '2026-10-01', dueOn: '2026-11-01', status: 'active', checkins: [],
      },
    ],
    growthPlans: [
      {
        id: 'gp-ada', personId: 'p1', goal: 'Lead platform cutovers', reality: 'Strong IC',
        options: [{ id: 'o1', text: 'Run cutover' }],
        will: [
          { id: 'w-legacy', text: 'Legacy unlinked commitment', due: '2026-11-01', done: false },
          { id: 'w-valid', text: 'Valid linked commitment', due: '2026-11-01', done: false, delegationId: 'del-ada' },
          { id: 'w-missing', text: 'Dangling link', due: '2026-11-01', done: false, delegationId: 'del-ghost' },
          { id: 'w-wrong-owner', text: 'Cross-person link', due: '2026-11-01', done: false, delegationId: 'del-bo' },
        ],
        status: 'active', createdAt: NOW.toISOString(),
      },
    ],
    decisions: [
      {
        id: 'dec-bad', title: 'Undecided yet marked reviewed', date: '2026-10-01',
        chosen: '', reviewOn: '2026-10-15', reviewedOn: '2026-10-16', outcome: 'good', outcomeNotes: 'Premature',
      },
    ],
  };

  const snap = JSON.stringify(v11);
  const migrated = migrate(v11);
  assert.equal(JSON.stringify(v11), snap, 'migration never mutates input');
  assert.equal(migrated.raw.schemaVersion, 48);
  assert.deepEqual(migrated.applied, ['11 → 12', '12 → 13', '13 → 14', '14 → 15', '15 → 16', '16 → 17', '17 → 18', '18 → 19', '19 → 20', '20 → 21', '21 → 22', '22 → 23', '23 → 24', '24 → 25', '25 → 26', '26 → 27', '27 → 28', '28 → 29', '29 → 30', '30 → 31', '31 → 32', '32 → 33', '33 → 34', '34 → 35', '35 → 36', '36 → 37', '37 → 38', '38 → 39', '39 → 40', '40 → 41', '41 → 42', '42 → 43', '43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48']);
  assert.equal(migrated.raw.growthPlans[0].will[0].delegationId, null, 'legacy commitment gets null, never guessed');
  assert.equal(migrated.raw.growthPlans[0].will[1].delegationId, 'del-ada');

  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.ok(warnings.some((w) => w.includes('cleared 2 broken delegation link(s)')));
  assert.ok(warnings.some((w) => w.includes('cleared 1 outcome review(s) on undecided decision(s)')));
  const wills = state.growthPlans[0].will;
  assert.equal(wills.find((w) => w.id === 'w-valid').delegationId, 'del-ada');
  assert.equal(wills.find((w) => w.id === 'w-missing').delegationId, null);
  assert.equal(wills.find((w) => w.id === 'w-wrong-owner').delegationId, null);

  const repairedDec = state.decisions[0];
  assert.equal(repairedDec.reviewedOn, null);
  assert.equal(repairedDec.outcome, 'pending');
  assert.equal(repairedDec.outcomeNotes, '');
});

/* ---------------- 2. Decision Lifecycle, Guardrails & Today Queue */

test('decision domain & API: excludes undecided calls from reviewsDue, validates chronology/outcomes, matches DACI tokens cleanly, and rewinds history', () => {
  const h = harness();
  h.api.addPerson({ name: 'Bo', role: 'Engineer' });
  h.api.addPerson({ name: 'Bob', role: 'Lead' });

  // Chronology & date validation on addDecision
  assert.equal(h.api.addDecision({ title: 'Bad date', date: '2026-02-30' }).ok, false);
  assert.equal(h.api.addDecision({ title: 'Review before decision', date: '2026-10-20', reviewOn: '2026-10-10' }).ok, false);

  // Undecided call with past reviewOn must NOT enter reviewsDue or dueDecisionReviews
  const openPastId = h.api.addDecision({
    title: 'Still undecided',
    date: '2026-10-01',
    reviewOn: '2026-10-15',
    driver: 'Bob',
    contributors: 'Ana, Bono',
  }).id;
  assert.equal(decisionReviewState(h.store.state.decisions[0], NOW).state, 'undecided');
  assert.deepEqual(reviewsDue(h.store.state, NOW), [], 'undecided choice is not an outcome review due');
  assert.deepEqual(dueDecisionReviews(h.store.state, NOW), []);

  // Cannot review outcome of an undecided decision
  assert.equal(h.api.reviewDecision(openPastId, { outcome: 'good' }).ok, false);

  // DACI token matching: "Bo" does not match "Bob" or "Bono"
  assert.deepEqual(decisionsInvolving(h.store.state, 'Bo'), []);
  assert.equal(decisionsInvolving(h.store.state, 'Bob').length, 1);

  // Add decided calls: overdue, due today, due in 5d, and scheduled in 20d
  const overdueId = h.api.addDecision({
    title: 'Overdue reversible', date: '2026-09-20', reversibility: 'reversible',
    approver: 'CFO', contributors: 'Bo; Priya',
    options: [{ label: 'Opt 1', pros: 'Fast', cons: 'Manual' }, { label: 'Opt 2' }],
    chosen: 'Opt 1', rationale: 'Fastest safe path while customer volume settles.', reviewOn: '2026-10-18',
  }).id;
  const dueTodayId = h.api.addDecision({
    title: 'Due today irreversible', date: '2026-10-10', reversibility: 'irreversible',
    approver: '', chosen: 'Keep monolith', rationale: 'Splitting now delays Q4 launch.', reviewOn: '2026-10-25',
  }).id;
  const dueSoonId = h.api.addDecision({
    title: 'Due in 5 days', date: '2026-10-15', reversibility: 'reversible',
    approver: 'VP Eng', chosen: 'Weekly release train', reviewOn: '2026-10-30',
  }).id;
  h.api.addDecision({
    title: 'Future scheduled', date: '2026-10-20',
    approver: 'VP Eng', chosen: 'Defer caching', reviewOn: '2026-11-20',
  });

  // DEC-03 points directly to the single approverless decision when only one lacks an approver
  h.api.updateDecision(openPastId, { approver: 'VP Eng' });
  const dec03 = buildInsights(h.store.state, NOW).findings.find((f) => f.ruleId === 'DEC-03');
  assert.equal(dec03.action.route, `#/decisions?decision=${dueTodayId}`);

  // updateDecision preserves option pros/cons when labels match
  assert.equal(h.api.updateDecision(overdueId, { approver: 'Head of Platform', options: [{ label: 'Opt 1' }, { label: 'Opt 2' }] }).ok, true);
  assert.equal(h.store.state.decisions.find((d) => d.id === overdueId).options[0].pros, 'Fast');

  // Queue ordering: overdue -> due today -> due in 5d (excluding undecided & +20d)
  assert.deepEqual(reviewsDue(h.store.state, NOW).map((d) => d.id), [overdueId]);
  assert.deepEqual(dueDecisionReviews(h.store.state, NOW).map((r) => r.decision.id), [overdueId, dueTodayId, dueSoonId]);
  assert.deepEqual(decisionsForPerson(h.store.state, 'bo')[0].roles, ['Contributor']);

  // reviewDecision validates reviewedOn chronology and rewinds cleanly in reconstructStateAt
  assert.equal(h.api.reviewDecision(overdueId, { outcome: 'good', reviewedOn: '2026-10-30' }).ok, false, 'future review date rejected');
  assert.equal(h.api.reviewDecision(overdueId, { outcome: 'good', reviewedOn: '2026-09-01' }).ok, false, 'pre-decision review date rejected');
  assert.equal(h.api.reviewDecision(overdueId, { outcome: 'good', reviewedOn: '2026-10-22', outcomeNotes: 'Worked cleanly.' }).ok, true);

  const beforeReview = reconstructStateAt(h.store.state, '2026-10-20', { currentDay: TODAY });
  const rewoundDec = beforeReview.state.decisions.find((d) => d.id === overdueId);
  assert.equal(rewoundDec.reviewedOn, null);
  assert.equal(rewoundDec.outcome, 'pending');
});

/* ---------------- 3. Delegation ↔ GROW Development Handoff */

test('delegation ↔ GROW handoff: validates ownership, preserves link across carries, prompts coaching reflection without silent auto-close, and exports CSV', () => {
  const h = harness();
  const meiId = h.api.addPerson({ name: 'Mei Chen', role: 'Staff Engineer' }).id;
  const samId = h.api.addPerson({ name: 'Sam Okafor', role: 'Lead' }).id;

  const delMeiId = h.api.addDelegation({
    personId: meiId,
    title: 'Own the schema migration review',
    expectedOutcome: 'Every migration reviewed within 48h with zero incidents.',
    authority: 'act-inform',
    support: 'Principal engineer available for escalation.',
    delegatedOn: '2026-10-05',
    dueOn: '2026-11-05',
  }).id;
  const delSamId = h.api.addDelegation({
    personId: samId,
    title: 'Own support rota',
    expectedOutcome: '24/7 coverage agreed.',
    authority: 'agree',
    support: 'Ops budget.',
    delegatedOn: '2026-10-05',
    dueOn: '2026-11-05',
  }).id;

  // Before Mei has a GROW plan, handoff mode is 'start-plan'
  let handoff = delegationGrowthHandoff(h.store.state, delMeiId, NOW);
  assert.equal(handoff.available, true);
  assert.equal(handoff.mode, 'start-plan');
  assert.equal(handoff.prefill.delegationId, delMeiId);

  // Cross-person link is rejected
  assert.equal(
    h.api.saveGrowthPlan({
      personId: meiId,
      goal: 'Grow into cross-team technical leadership',
      will: [{ text: 'Wrong owner link', due: '2026-11-05', delegationId: delSamId }],
    }).ok,
    false,
  );

  // Create Mei's plan unlinked first -> handoff mode becomes 'add-will'
  const planId = h.api.saveGrowthPlan({
    personId: meiId,
    goal: 'Grow into cross-team technical leadership',
    reality: 'Trusted debugger, expanding org influence',
    options: ['Chair schema review', 'Write RFC templates'],
    will: [{ text: 'Write RFC template', due: '2026-10-20' }],
    reviewOn: '2026-11-15',
  }).id;

  handoff = delegationGrowthHandoff(h.store.state, delMeiId, NOW);
  assert.equal(handoff.available, true);
  assert.equal(handoff.mode, 'add-will');
  assert.equal(handoff.activePlan.id, planId);

  // Link delegation via addWillAction; duplicate live link on same plan is rejected
  const added = h.api.addWillAction(planId, handoff.prefill.willText, handoff.prefill.willDue, {
    delegationId: delMeiId,
  });
  assert.equal(added.ok, true);
  assert.equal(
    h.api.addWillAction(planId, 'Duplicate link', '2026-11-10', { delegationId: delMeiId }).ok,
    false,
  );
  assert.equal(delegationGrowthHandoff(h.store.state, delMeiId, NOW).available, false);
  assert.equal(delegationGrowthHandoff(h.store.state, delMeiId, NOW).reason, 'already-linked');

  // Carrying the commitment forward preserves delegationId on the live successor
  const carried = h.api.carryWillAction(planId, added.id, '2026-11-12');
  assert.equal(carried.ok, true);
  const liveWill = openWillActions(h.store.state.growthPlans[0], NOW).find((w) => w.id === carried.id);
  assert.equal(liveWill.delegationId, delMeiId);
  assert.equal(growthLinkForDelegation(h.store.state, delMeiId).action.id, carried.id);

  // Completing the delegation does NOT silently close the GROW commitment — sets awaitingReflection
  assert.equal(
    h.api.completeDelegation(delMeiId, {
      completedOn: '2026-10-24',
      completionNote: 'Ran four schema reviews with zero customer incidents.',
    }).ok,
    true,
  );
  const afterCompleteWill = h.store.state.growthPlans[0].will.find((w) => w.id === carried.id);
  assert.equal(afterCompleteWill.done, false, 'GROW commitment stays open for explicit coaching reflection');
  const linkStatus = linkedDelegationForWill(h.store.state, afterCompleteWill, NOW);
  assert.equal(linkStatus.awaitingReflection, true);

  // Snapshot before delegation existed rewinds delegationId to null
  const preDelSnap = reconstructStateAt(h.store.state, '2026-10-01', { currentDay: TODAY });
  for (const plan of preDelSnap.state.growthPlans) {
    assert.ok(plan.will.every((w) => w.delegationId === null));
  }

  // CSV exports expose the bidirectional link cleanly
  const actionsCsv = parseCsv(exportWorkspaceCsv(h.store.state, 'actions', { now: NOW }).csv);
  const idxLinkedDel = actionsCsv.headers.indexOf('linked_delegation_id');
  assert.ok(idxLinkedDel >= 0);
  assert.ok(actionsCsv.rows.some((r) => r[idxLinkedDel] === delMeiId));

  const delCsv = parseCsv(exportWorkspaceCsv(h.store.state, 'delegations', { now: NOW }).csv);
  const idxLinkedPlan = delCsv.headers.indexOf('linked_growth_plan_id');
  const meiDelRow = delCsv.rows.find((r) => r[0] === delMeiId);
  assert.equal(meiDelRow[idxLinkedPlan], planId);

  const gpCsv = parseCsv(exportWorkspaceCsv(h.store.state, 'growthPlans', { now: NOW }).csv);
  const idxCount = gpCsv.headers.indexOf('will_linked_delegations');
  assert.equal(gpCsv.rows[0][idxCount], '1');
});

/* ------------- 4. 1:1 Prep-Sheet & Employee Topics Carry-Through */

test('UI & end-to-end flows: Today decision reviews, DEC-03 edit, Delegation→GROW handoff, Prep→1:1 carry-through, and zero axe violations', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    const view = env.document.getElementById('view');

    // 1. Today screen shows Decision reviews queue and completes inline Review outcome
    app.navigate('#/today');
    assert.ok(view.textContent.includes('Decision reviews'), 'Today surfaces due decision reviews card');
    assert.ok(view.textContent.includes('Standardise weekly metrics on warehouse tables'));
    assert.deepEqual(await axeViolations(env, '#view'), []);

    const reviewOutcomeBtn = [...view.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Review outcome');
    assert.ok(reviewOutcomeBtn, 'inline Review outcome button rendered on Today');
    click(reviewOutcomeBtn);
    let dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), []);
    setValue(dialog.querySelector('select[name="outcome"]'), 'good');
    setValue(dialog.querySelector('textarea[name="outcomeNotes"]'), 'Weekly disputes dropped from 6 to 2 within three weeks.');
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Save review')));
    assert.equal(env.document.querySelector('[role="dialog"]'), null);

    // 2. DEC-01 ?decision=<id> focus filter & DEC-03 Edit decision dialog
    const openDec = app.store.state.decisions.find((d) => !d.chosen);
    app.navigate(`#/decisions?decision=${encodeURIComponent(openDec.id)}`);
    assert.equal(view.querySelectorAll('.decision-card.is-focused').length, 1);
    assert.ok(view.textContent.includes('Clear filters'));
    assert.deepEqual(await axeViolations(env, '#view'), []);

    const editDecBtn = [...view.querySelectorAll('.decision-card button')].find((b) => b.textContent.trim() === 'Edit');
    click(editDecBtn);
    dialog = env.document.querySelector('[role="dialog"]');
    setValue(dialog.querySelector('input[name="approver"]'), 'VP Engineering');
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.includes('Save changes')));
    assert.equal(app.store.state.decisions.find((d) => d.id === openDec.id).approver, 'VP Engineering');

    // 3. Delegation → GROW handoff through #/delegations and #/growth
    app.navigate('#/delegations');
    assert.ok(view.textContent.includes('GROW · open'), 'Mei demo delegation shows existing GROW link');
    const addToGrowBtn = [...view.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add to GROW');
    assert.ok(addToGrowBtn, 'Samuel unlinked active delegation offers Add to GROW');
    click(addToGrowBtn);
    dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog.querySelector('select[name="delegationId"]').value.startsWith('delegation-demo-'));
    assert.ok(dialog.querySelector('input[name="text"]').value.includes('Own the new P1 escalation rota'));
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), []);
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.trim() === 'Save'));

    app.navigate('#/growth');
    assert.ok(view.textContent.includes('Delegated outcome: Own the new P1 escalation rota'));
    assert.deepEqual(await axeViolations(env, '#view'), []);

    // 4. Prep sheet -> Log the 1:1 carry-through & selective employee topic clearing
    const jordan = app.store.state.people.find((p) => p.name === 'Jordan Alvarez');
    assert.equal(jordan.talkingPoints.length, 2);
    const candidates = buildMeetingAgendaCandidates(app.store.state, jordan.id, NOW, app.store.state.settings);
    assert.equal(candidates.theirTopics.length, 2);
    assert.equal(candidates.theirTopics[0].source, 'their-topic');

    // Person page surfaces Jordan's talking points AND DACI decisions
    app.navigate(`#/people/${encodeURIComponent(jordan.id)}`);
    assert.ok(view.textContent.includes('Topics they want to raise'));
    assert.ok(view.textContent.includes('Wants a decision on the activation definition'));
    assert.ok(view.textContent.includes('Decisions (DACI)'));
    assert.deepEqual(await axeViolations(env, '#view'), []);

    // Navigate to Jordan's prep sheet, uncheck the 2nd employee topic, and click Log the 1:1
    app.navigate(`#/prep/${encodeURIComponent(jordan.id)}`);
    assert.deepEqual(await axeViolations(env, '#view'), []);
    const topicCheckboxes = [...view.querySelectorAll('.prep-list-ordered')[0].querySelectorAll('input[type="checkbox"]')];
    assert.equal(topicCheckboxes.length, 2);
    setValue(topicCheckboxes[1], false); // Leave 2nd topic ("Asking for a larger design budget this quarter") for next time

    const logFromPrepBtn = [...view.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Log the 1:1');
    click(logFromPrepBtn);
    dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), []);

    const pickLabels = [...dialog.querySelectorAll('.agenda-picks .agenda-pick')];
    const firstTopicPick = pickLabels.find((l) => l.textContent.includes('Wants a decision on the activation definition'));
    const secondTopicPick = pickLabels.find((l) => l.textContent.includes('Asking for a larger design budget this quarter'));
    assert.equal(firstTopicPick.querySelector('input').checked, true, 'checked topic carried from prep sheet');
    assert.equal(secondTopicPick.querySelector('input').checked, false, 'unchecked topic stayed unchecked');

    setValue(dialog.querySelector('input[name="confirmDiscussed"]'), true);
    setValue(dialog.querySelector('input[name="clearCoveredTopics"]'), true);
    setValue(dialog.querySelector('textarea[name="notes"]'), 'Agreed activation definition; deferred design budget discussion to next week.');
    click([...dialog.querySelectorAll('.modal-foot button')].find((b) => b.textContent.trim() === 'Log it'));
    assert.equal(env.document.querySelector('[role="dialog"]'), null);

    // Only the covered topic was cleared; the unchecked topic remains on Jordan's waiting list!
    const updatedJordan = app.store.state.people.find((p) => p.id === jordan.id);
    assert.deepEqual(updatedJordan.talkingPoints, ['Asking for a larger design budget this quarter']);
    const loggedMeeting = app.store.state.oneOnOnes.at(-1);
    assert.ok(loggedMeeting.agenda.some((a) => a.text === 'Wants a decision on the activation definition' && a.source === 'their-topic'));
    assert.equal(loggedMeeting.agenda.some((a) => a.text.includes('design budget')), false);

    // Skipped 1:1 must NEVER clear the remaining topic
    assert.equal(
      app.api.logOneOnOne({
        personId: jordan.id,
        date: TODAY,
        status: 'skipped',
        notes: 'Customer call ran over',
        resolvedTalkingPoints: ['Asking for a larger design budget this quarter'],
      }).ok,
      false,
    );
    assert.deepEqual(
      app.store.state.people.find((p) => p.id === jordan.id).talkingPoints,
      ['Asking for a larger design budget this quarter'],
    );

    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
  });
});
