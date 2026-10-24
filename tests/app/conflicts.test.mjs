import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import {
  agreementReadiness, resolutionReadiness, currentAgreement, conflictHealth, conflictSummary,
} from '../../app/core/domain/conflicts.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { buildReviewEvidence } from '../../app/core/domain/reviews.js';
import { suggestAgenda } from '../../app/core/domain/oneonone.js';
import { personTimeline } from '../../app/core/domain/people.js';
import { teamHealth } from '../../app/core/domain/health.js';
import { closeAllModals } from '../../app/ui/dom.js';

const NOW = new Date('2026-10-24T10:00:00Z');
const TODAY = '2026-10-24';
const HTML = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
}
function harness(storage = memoryStorage()) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-test-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory }); store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage };
}
function input(overrides = {}) {
  return {
    title: 'Handoff expectations', summary: 'Two colleagues disagree about the review handoff and both lose time.',
    coordinator: 'Manager', openedOn: '2026-10-20', nextFollowUpOn: TODAY, safety: 'ordinary',
    process: 'Hear each person separately, then a voluntary joint conversation with equal airtime.',
    sharing: 'Only the agreed commitments may be shared with the delivery team.',
    participants: [
      { name: 'Avery', perspective: 'Late changes arrive after review.', interest: 'Enough time to check quality.', participation: 'willing' },
      { name: 'Blair', perspective: 'Requirements change after customer calls.', interest: 'A way to respond without surprising the reviewer.', participation: 'willing' },
    ], ...overrides,
  };
}
function agreement(overrides = {}) {
  return { date: TODAY, text: 'Use a change cutoff and discuss urgent exceptions before review.', confirmedByAll: true, reviewOn: '2026-10-31',
    actions: [{ owner: 'Avery', text: 'Publish the review cutoff and exception route.', dueOn: TODAY }], ...overrides };
}
function followup(overrides = {}) {
  return { date: TODAY, note: 'Asked each colleague separately and reviewed the handoff record.', outcome: 'holding', confirmedByAll: true, nextFollowUpOn: '2026-10-31', ...overrides };
}
function createReady(h) {
  const result = h.api.addConflict(input()); assert.equal(result.ok, true, result.error);
  assert.equal(h.api.agreeConflict(result.id, agreement()).ok, true);
  return result.id;
}
const recordFor = (h, id) => h.store.state.conflicts.find((r) => r.id === id);
function completeAndVerify(h, id) {
  assert.equal(h.api.completeConflictAction(id, currentAgreement(recordFor(h, id)).actions[0].id,
    { completedOn: TODAY, completionNote: 'The cutoff and exception route were published and tried.' }).ok, true);
  assert.equal(h.api.followUpConflict(id, followup()).ok, true);
}
function assertRefusedWithoutWrite(h, work) {
  const before = JSON.stringify(h.store.state);
  const result = work(); assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.error); assert.equal(JSON.stringify(h.store.state), before, 'validation must not partially write or append events');
}

test('v1, v2 and v3 migrate additively to conflict schema v4 without fabricating cases', () => {
  for (const schemaVersion of [1, 2, 3]) {
    const old = { ...createEmptyState(NOW.toISOString()), schemaVersion }; delete old.conflicts;
    old.people.push({ id: 'p1', name: 'Existing person', status: 'active', createdAt: NOW.toISOString() });
    const result = migrate(old);
    assert.equal(result.raw.schemaVersion, 4); assert.ok(result.applied.includes('3 → 4'));
    const normalized = normalizeState(result.raw);
    assert.deepEqual(normalized.state.conflicts, []); assert.equal(normalized.state.people[0].name, 'Existing person');
    assert.equal(old.conflicts, undefined, 'migration does not mutate its source');
  }
});

test('conflict creation validates real dates, neutral context, coordinator and distinct participants before writing', () => {
  const h = harness();
  for (const patch of [{ title: '' }, { summary: '' }, { coordinator: '' }, { participants: [{ name: 'Only one' }] },
    { participants: [{ name: ' AVERY ' }, { name: 'avery' }] }, { openedOn: '2026-02-31' }, { openedOn: '2026-10-25' },
    { nextFollowUpOn: '2026-10-19' }, { safety: 'auto-diagnosed' }]) {
    assertRefusedWithoutWrite(h, () => h.api.addConflict(input(patch)));
  }
  const result = h.api.addConflict(input({ safety: 'unknown', participants: [{ name: 'Avery' }, { name: 'Blair' }] }));
  assert.equal(result.ok, true); assert.equal(recordFor(h, result.id).participants[0].participation, 'unknown');
});

test('agreement requires an appropriate route, heard interests, willing participation, process and sharing limits', () => {
  for (const patch of [{ safety: 'unknown' }, { safety: 'support' }, { process: '' }, { sharing: '' },
    { participants: input().participants.map((p) => ({ ...p, participation: 'unknown' })) },
    { participants: input().participants.map((p) => ({ ...p, participation: 'declined' })) },
    { participants: input().participants.map((p) => ({ ...p, interest: '' })) }]) {
    const h = harness(); const id = h.api.addConflict(input(patch)).id;
    assert.equal(agreementReadiness(recordFor(h, id)).canAgree, false);
    assertRefusedWithoutWrite(h, () => h.api.agreeConflict(id, agreement()));
  }
});

test('a manager proposal and malformed commitments cannot be recorded as an agreement', () => {
  const h = harness(); const id = h.api.addConflict(input()).id;
  for (const patch of [{ confirmedByAll: false }, { confirmedByAll: 'true' }, { text: '' }, { date: '2026-10-25' },
    { date: '2026-10-19' }, { reviewOn: '2026-10-23' }, { actions: [] },
    { actions: [{ owner: '', text: 'Try something', dueOn: TODAY }] },
    { actions: [{ owner: 'Avery', text: 'Try something', dueOn: '2026-02-31' }] },
    { actions: [{ owner: 'Avery', text: 'Try something', dueOn: '2026-10-23' }] }]) {
    assertRefusedWithoutWrite(h, () => h.api.agreeConflict(id, agreement(patch)));
  }
});

test('agreement → result → all-party follow-up → resolution survives persistence and JSON roundtrip', () => {
  const h = harness(); const id = createReady(h);
  assert.equal(recordFor(h, id).status, 'agreed'); assert.equal(resolutionReadiness(recordFor(h, id)).canResolve, false);
  completeAndVerify(h, id);
  assert.equal(resolutionReadiness(recordFor(h, id)).canResolve, true);
  assert.equal(h.api.resolveConflict(id, { date: TODAY, note: 'Both report the new handoff works and commitments are delivered.' }).ok, true);
  assert.equal(recordFor(h, id).status, 'resolved'); assert.equal(recordFor(h, id).nextFollowUpOn, null);
  const reloaded = harness(h.storage); assert.deepEqual(recordFor(reloaded, id), recordFor(h, id));
  const imported = harness(); const result = imported.store.importJSON(h.store.exportJSON());
  assert.equal(result.ok, true); assert.deepEqual(imported.store.state.conflicts, h.store.state.conflicts);
  assert.equal(imported.store.state.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(h.store.state.events.map((e) => e.type), ['conflict.created', 'conflict.agreement-recorded', 'conflict.commitment-completed', 'conflict.follow-up-recorded', 'conflict.resolved']);
});

test('a same-day check-in before commitment results cannot verify those results', () => {
  const h = harness(); const id = createReady(h);
  assert.equal(h.api.followUpConflict(id, followup()).ok, true);
  assert.equal(resolutionReadiness(recordFor(h, id)).canResolve, false);
  assert.equal(h.api.completeConflictAction(id, currentAgreement(recordFor(h, id)).actions[0].id, { completedOn: TODAY, completionNote: 'Delivered the agreed change.' }).ok, true);
  assertRefusedWithoutWrite(h, () => h.api.resolveConflict(id, { note: 'Too soon.' }));
  assert.equal(h.api.followUpConflict(id, followup()).ok, true);
  assert.equal(resolutionReadiness(recordFor(h, id)).canResolve, true);
});

test('latest same-day not-holding or unknown follow-up overrides an older holding claim', () => {
  const h = harness(); const id = createReady(h); completeAndVerify(h, id);
  assert.equal(h.api.followUpConflict(id, followup({ outcome: 'not-holding', confirmedByAll: false })).ok, true);
  assert.equal(conflictHealth(recordFor(h, id), NOW).notHolding, true);
  assert.equal(resolutionReadiness(recordFor(h, id)).canResolve, false);
  h.api.followUpConflict(id, followup({ outcome: 'unknown', confirmedByAll: false }));
  assert.equal(resolutionReadiness(recordFor(h, id)).canResolve, false, 'unknown cannot be treated as holding');
});

test('closed records are read-only and reopening requires new verification, even on the same day', () => {
  const h = harness(); const id = createReady(h); completeAndVerify(h, id);
  h.api.resolveConflict(id, { note: 'Both report a workable result.' });
  assertRefusedWithoutWrite(h, () => h.api.updateConflict(id, { title: 'Changed' }));
  assertRefusedWithoutWrite(h, () => h.api.followUpConflict(id, followup()));
  assertRefusedWithoutWrite(h, () => h.api.agreeConflict(id, agreement()));
  assertRefusedWithoutWrite(h, () => h.api.reopenConflict(id, { note: '', nextFollowUpOn: TODAY }));
  assert.equal(h.api.reopenConflict(id, { date: TODAY, note: 'An exception exposed the original tension again.', nextFollowUpOn: TODAY }).ok, true);
  assert.equal(recordFor(h, id).agreements.length, 1); assert.equal(recordFor(h, id).transitions.length, 2);
  assert.equal(resolutionReadiness(recordFor(h, id)).canResolve, false);
  assertRefusedWithoutWrite(h, () => h.api.resolveConflict(id, { note: 'Cannot reuse the old check-in.' }));
  assert.equal(h.api.followUpConflict(id, followup()).ok, true); assert.equal(resolutionReadiness(recordFor(h, id)).canResolve, true);
});

test('a changed discussion context invalidates closure and a new agreement preserves earlier versions', () => {
  for (const patch of [{ process: 'An impartial facilitator will now support both colleagues.' },
    { summary: 'A newly reported situation requires a different agreement.' }]) {
    const h = harness(); const id = createReady(h); completeAndVerify(h, id);
    const before = JSON.stringify(currentAgreement(recordFor(h, id)));
    assert.equal(h.api.updateConflict(id, { ...patch, nextFollowUpOn: TODAY }).ok, true);
    assert.equal(conflictHealth(recordFor(h, id), NOW).changedContext, true);
    assert.equal(resolutionReadiness(recordFor(h, id)).canResolve, false);
    assertRefusedWithoutWrite(h, () => h.api.followUpConflict(id, followup()));
    assert.equal(h.api.agreeConflict(id, agreement({ text: 'New agreement in the changed situation.' })).ok, true);
    assert.equal(recordFor(h, id).agreements.length, 2); assert.equal(JSON.stringify(recordFor(h, id).agreements[0]), before);
    assert.equal(recordFor(h, id).agreements[0].context.summary, input().summary, 'earlier situation remains with the earlier agreement');
    assert.equal(resolutionReadiness(recordFor(h, id)).canResolve, false, 'old actions/check-in cannot verify the new version');
  }
});

test('support handoff is manual, not resolved; its follow-up remains due and history survives reopening', () => {
  const h = harness(); const id = h.api.addConflict(input({ safety: 'support' })).id;
  assertRefusedWithoutWrite(h, () => h.api.escalateConflict(id, { note: 'Ask for help', nextFollowUpOn: TODAY }));
  assert.equal(h.api.escalateConflict(id, { date: TODAY, handoffTo: 'Independent HR contact', note: 'Contact privately and agree what can be shared.', nextFollowUpOn: TODAY }).ok, true);
  const record = recordFor(h, id); assert.equal(record.status, 'escalated');
  assert.equal(conflictHealth(record, NOW).followUpDue, true); assert.equal(conflictHealth(record, NOW).needsSupport, false);
  assertRefusedWithoutWrite(h, () => h.api.resolveConflict(id, { note: 'Handoff is not resolution.' }));
  assertRefusedWithoutWrite(h, () => h.api.followUpConflict(id, followup()));
  assert.equal(h.api.followUpConflict(id, followup({ outcome: 'unknown', confirmedByAll: false })).ok, true);
  assert.equal(h.api.reopenConflict(id, { note: 'Support advised a fresh process, not a finding.', nextFollowUpOn: TODAY }).ok, true);
  assert.equal(recordFor(h, id).transitions[0].handoffTo, 'Independent HR contact');
  assert.equal(agreementReadiness(recordFor(h, id)).canAgree, false, 'reopening does not silently change the serious assessment');
});

test('chronology rejects impossible, future and pre-history entries without partial changes', () => {
  const h = harness(); const id = createReady(h); const actionId = currentAgreement(recordFor(h, id)).actions[0].id;
  for (const patch of [{ completedOn: '2026-02-31' }, { completedOn: '2026-10-25' }, { completedOn: '2026-10-23' }, { completionNote: '' }])
    assertRefusedWithoutWrite(h, () => h.api.completeConflictAction(id, actionId, { completedOn: TODAY, completionNote: 'Delivered.', ...patch }));
  for (const patch of [{ date: '2026-10-19' }, { date: '2026-10-25' }, { nextFollowUpOn: '2026-10-23' }, { outcome: 'assumed' }, { confirmedByAll: false }])
    assertRefusedWithoutWrite(h, () => h.api.followUpConflict(id, followup(patch)));
  assertRefusedWithoutWrite(h, () => h.api.updateConflict(id, { openedOn: '2026-10-25' }));
  assertRefusedWithoutWrite(h, () => h.api.updateConflict(id, { nextFollowUpOn: '2026-10-23' }));
});

test('normalization repairs malformed dates and never infers willing participation or supported resolution', () => {
  const h = harness(); const id = createReady(h); completeAndVerify(h, id); h.api.resolveConflict(id, { note: 'Verified.' });
  const raw = JSON.parse(h.store.exportJSON()).state;
  raw.conflicts[0].participants[0].participation = true;
  raw.conflicts[0].followUps[0].confirmedByAll = 'true';
  raw.conflicts[0].openedOn = '2026-02-31';
  const { state, warnings } = normalizeState(raw);
  assert.equal(state.conflicts[0].openedOn, null); assert.equal(state.conflicts[0].participants[0].participation, 'unknown');
  assert.notEqual(state.conflicts[0].status, 'resolved'); assert.equal(state.conflicts[0].followUps[0].outcome, 'unknown');
  assert.ok(warnings.some((w) => w.startsWith('Conflicts:'))); assert.equal(state.conflicts[0].summary, raw.conflicts[0].summary);
});

test('conflicts never enter automatic performance evidence, person timelines, agendas, scores or general audit prose', () => {
  const h = harness(); const personId = h.api.addPerson({ name: 'Avery' }).id;
  const healthBefore = teamHealth(h.store.state, NOW);
  const secret = 'PRIVATE-CONTENT-3d56'; const name = 'PRIVATE-PARTICIPANT-9d48';
  h.api.addConflict(input({ title: secret, summary: secret, safety: 'support', participants: [{ name, perspective: secret, interest: secret }, { name: 'Other', perspective: secret }] }));
  const signals = buildInsights(h.store.state, NOW).findings.filter((f) => f.ruleId.startsWith('CFL-'));
  assert.ok(signals.length >= 2); assert.ok(signals.every((s) => s.personId === null));
  for (const value of [signals, h.store.state.events, buildReviewEvidence(h.store.state, personId, '2026-10-01', TODAY),
    personTimeline(h.store.state, personId), suggestAgenda(h.store.state, personId, NOW, h.store.state.settings)]) {
    assert.ok(!JSON.stringify(value).includes(secret)); assert.ok(!JSON.stringify(value).includes(name));
  }
  assert.deepEqual(teamHealth(h.store.state, NOW), healthBefore, 'conflict counts do not grade people or team health');
});

test('conflict health distinguishes today, overdue commitments, unknown route and explicit support handoff', () => {
  const h = harness(); const id = createReady(h);
  const record = recordFor(h, id);
  assert.equal(conflictHealth(record, NOW).followUpDue, false, 'agreement review is in the future');
  assert.equal(conflictHealth(record, new Date('2026-10-31T23:59Z')).followUpDue, true, 'due includes the review day');
  assert.equal(conflictHealth(record, new Date('2026-10-25T00:00Z')).overdueActions.length, 1);
  assert.equal(conflictSummary(h.store.state, NOW).resolved, 0);
});

test('demo replacement protects delegation-only and conflict-only real records; cleanup preserves real conflict notes', () => {
  const h = harness(); h.store.seedDemo();
  const personId = h.store.state.people[0].id;
  assert.equal(h.api.addDelegation({ personId, title: 'Real delegated outcome', expectedOutcome: 'A published runbook', authority: 'own', support: 'Time to do it', delegatedOn: TODAY, dueOn: '2026-10-31' }).ok, true);
  assert.equal(h.store.hasRealData(), true); assert.equal(h.store.seedDemo().ok, false);
  h.store.reset(); const id = h.api.addConflict(input()).id;
  assert.equal(h.store.state.people.length, 0); assert.equal(h.store.hasRealData(), true); assert.equal(h.store.seedDemo().ok, false);
  h.store.update((draft) => { draft.conflicts.push({ ...recordFor(h, id), id: 'conflict-demo-1' }); draft.meta.isDemo = true; });
  h.store.clearDemo(); assert.equal(h.store.state.conflicts.length, 1); assert.equal(h.store.state.conflicts[0].id, id);
});

test('storage failure is returned explicitly, not presented as a saved conflict record', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('Storage disabled'); } };
  const h = harness(storage); const result = h.api.addConflict(input());
  assert.equal(result.ok, true); assert.match(result.warning, /Could not save/); assert.equal(h.store.state.conflicts.length, 1);
});

function boot(t, storageSeed = null) {
  closeAllModals();
  const errors = []; const vc = new VirtualConsole();
  vc.on('jsdomError', (error) => errors.push(error.message)); vc.on('error', (...args) => errors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom; window.__LEADOS_TEST__ = true;
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'FileReader', 'localStorage']) globalThis[key] = key === 'window' ? window : window[key];
  if (storageSeed) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storageSeed));
  t.after(() => { closeAllModals(); dom.window.close(); });
  return { window, document: window.document, errors };
}
async function appFor(env) {
  const { createApp } = await import('../../app/main.js');
  let seq = 0;
  return createApp({ storage: env.window.localStorage, now: () => NOW, idFactory: (p) => `${p}-ui-${++seq}` });
}
function click(node) { assert.ok(node, 'expected an element to click'); node.click(); }
function byText(env, label, root = env.document.getElementById('view')) {
  return [...root.querySelectorAll('button, a')].find((node) => node.textContent.trim() === label);
}
const modal = (env) => env.document.querySelector('[role="dialog"]');
function fill(env, name, value, root = modal(env)) {
  const field = root.querySelector(`[name="${name}"]`); assert.ok(field, `field ${name}`);
  if (field.type === 'checkbox') field.checked = value; else field.value = value;
  field.dispatchEvent(new env.window.Event('input', { bubbles: true })); field.dispatchEvent(new env.window.Event('change', { bubbles: true }));
}
function save(env) { click(modal(env).querySelector('.modal-foot .btn-primary')); }
function fillCreate(env) {
  for (const key of ['title', 'coordinator', 'openedOn', 'nextFollowUpOn', 'safety', 'summary', 'process', 'sharing']) fill(env, key, input()[key]);
  const groups = modal(env).querySelectorAll('fieldset');
  input().participants.forEach((party, i) => { for (const [key, value] of Object.entries(party)) fill(env, key, value, groups[i]); });
}

test('conflict UI creates, confirms, completes, follows up, resolves and reopens through real dialogs', async (t) => {
  const env = boot(t); const app = await appFor(env); app.navigate('#/conflicts');
  click(byText(env, 'Start a conflict record')); assert.equal(modal(env).querySelectorAll('form form').length, 0);
  save(env); assert.ok(modal(env).textContent.includes('neutral reference')); assert.equal(app.store.state.conflicts.length, 0);
  fillCreate(env); save(env); assert.equal(modal(env), null); assert.equal(app.route, 'conflict');
  const id = app.store.state.conflicts[0].id;
  assert.equal(env.document.querySelector('a[href="#/conflicts"][aria-current="page"]').textContent.includes('Conflict resolution'), true);
  click(byText(env, 'Record agreement')); fill(env, 'text', agreement().text); fill(env, 'confirmedByAll', true);
  const row = modal(env).querySelector('fieldset');
  for (const [key, value] of Object.entries(agreement().actions[0])) fill(env, key, value, row);
  save(env); assert.equal(modal(env), null); assert.equal(recordFor({ store: app.store }, id).status, 'agreed');
  assert.equal(byText(env, 'Record resolution').disabled, true);
  click(byText(env, 'Record commitment result')); fill(env, 'completionNote', 'Published and tested the cutoff.'); save(env);
  click(byText(env, 'Record follow-up')); fill(env, 'note', 'Each colleague confirms the new handoff works.'); fill(env, 'outcome', 'holding');
  save(env); assert.ok(modal(env).textContent.includes('Check with everyone')); fill(env, 'confirmedByAll', true); save(env);
  assert.equal(byText(env, 'Record resolution').disabled, false);
  click(byText(env, 'Record resolution')); fill(env, 'note', 'Commitments are delivered and both confirmed the working arrangement.'); save(env);
  assert.equal(app.store.state.conflicts[0].status, 'resolved'); assert.equal(byText(env, 'Edit context'), undefined);
  click(byText(env, 'Reopen record')); fill(env, 'note', 'A new exception needs checking.'); save(env);
  assert.equal(app.store.state.conflicts[0].status, 'agreed'); assert.equal(byText(env, 'Record resolution').disabled, true);
  const exported = JSON.parse(app.store.exportJSON()).state; assert.equal(exported.conflicts[0].transitions.length, 2);
  assert.deepEqual(env.errors, []);
});

test('conflict UI handles unknown/declined participation, dynamic rows and manual support handoff without pretending to send', async (t) => {
  const env = boot(t); const app = await appFor(env); app.navigate('#/conflicts'); click(byText(env, 'Start a conflict record'));
  fillCreate(env); fill(env, 'safety', 'unknown');
  click(byText(env, 'Add participant', modal(env))); assert.equal(modal(env).querySelectorAll('fieldset').length, 3);
  click(byText(env, 'Remove participant', modal(env).querySelectorAll('fieldset')[2])); assert.equal(modal(env).querySelectorAll('fieldset').length, 2);
  save(env); assert.equal(byText(env, 'Record agreement').disabled, true);
  click(byText(env, 'Record support handoff')); fill(env, 'handoffTo', 'Independent support contact'); fill(env, 'note', 'Contact privately and agree the next step.'); save(env);
  assert.equal(app.store.state.conflicts[0].status, 'escalated'); assert.ok(env.document.getElementById('view').textContent.includes('not sent, not resolved'));
  assert.ok(byText(env, 'Record follow-up')); assert.equal(byText(env, 'Record resolution'), undefined);
  assert.deepEqual(env.errors, []);
});

test('conflict context edit preserves agreement versions and forces a new agreement after material changes', async (t) => {
  const env = boot(t); const app = await appFor(env); const id = app.api.addConflict(input()).id; app.api.agreeConflict(id, agreement());
  app.navigate(`#/conflicts/${id}`); click(byText(env, 'Edit context')); fill(env, 'process', 'A trained neutral facilitator will help everyone explore options.'); save(env);
  assert.equal(app.store.state.conflicts[0].agreements.length, 1); assert.ok(env.document.getElementById('view').textContent.includes('context changed'));
  assert.equal(byText(env, 'Record resolution').disabled, true);
});

test('conflict filters, missing routes, general reminders and XSS-safe notes work without a roster', async (t) => {
  const env = boot(t); const app = await appFor(env); const secret = '<img src=x onerror=alert(1)> PRIVATE-NOTE';
  const id = app.api.addConflict(input({ title: 'Neutral reference', summary: secret, participants: [{ name: 'Private A' }, { name: 'Private B' }] })).id;
  app.navigate(`#/conflicts/${id}`); assert.ok(env.document.getElementById('view').textContent.includes(secret)); assert.equal(env.document.querySelector('#view img'), null);
  app.navigate('#/today'); assert.ok(env.document.getElementById('view').textContent.includes('conflict record(s)')); assert.ok(!env.document.getElementById('view').textContent.includes(secret));
  app.navigate('#/insights'); assert.ok(!env.document.getElementById('view').textContent.includes('Private A'));
  app.navigate('#/settings'); assert.ok(!env.document.getElementById('view').textContent.includes(secret));
  app.navigate('#/conflicts'); click([...env.document.querySelectorAll('[aria-pressed]')].find((n) => n.textContent.startsWith('Resolved')));
  assert.equal(env.window.location.hash, '#/conflicts?filter=resolved'); assert.equal(env.document.querySelectorAll('.conflict-list').length, 0);
  app.navigate('#/conflicts/missing'); assert.ok(env.document.getElementById('view').textContent.includes('not found')); assert.ok(byText(env, 'Back to conflicts'));
  assert.deepEqual(env.errors, []);
});

test('conflict dialog Escape restores focus, Tab wraps and changing route closes the editor', async (t) => {
  const env = boot(t); const app = await appFor(env); app.navigate('#/conflicts');
  const opener = byText(env, 'Start a conflict record'); opener.focus(); click(opener);
  const focusables = modal(env).querySelectorAll('button:not([disabled]), input, textarea, select'); const last = focusables[focusables.length - 1]; last.focus();
  env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(env.document.activeElement, focusables[0]);
  env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(modal(env), null); assert.equal(env.document.activeElement, opener);
  click(opener); app.navigate('#/today'); assert.equal(modal(env), null);
});

test('goal and delegation filter tabs navigate using real keys and show the matching records', async (t) => {
  const env = boot(t, buildDemoState(NOW)); const app = await appFor(env);
  app.navigate('#/delegations'); click([...env.document.querySelectorAll('[role="tab"]')].find((node) => node.textContent.startsWith('Completed')));
  assert.equal(env.window.location.hash, '#/delegations?filter=done');
  assert.equal(env.document.querySelectorAll('.delegation-card').length, app.store.state.delegations.filter((d) => d.status === 'done').length);
  assert.equal(env.document.querySelector('[role="tab"][aria-selected="true"]').textContent.startsWith('Completed'), true);
  app.navigate('#/goals'); click([...env.document.querySelectorAll('[role="tab"]')].find((node) => node.textContent.startsWith('Team goals')));
  assert.equal(env.window.location.hash, '#/goals?view=team');
  assert.equal(env.document.querySelectorAll('.goal-meta').length, app.store.state.goals.filter((g) => !g.ownerId && g.status === 'active').length);
  assert.deepEqual(env.errors, []);
});

test('reopened agreement JSON roundtrips keep the verification floor and permit only a fresh closing check', () => {
  const h = harness(); const id = createReady(h); completeAndVerify(h, id);
  h.api.resolveConflict(id, { note: 'Confirmed in the first check.' });
  h.api.reopenConflict(id, { note: 'A new exception needs checking.', nextFollowUpOn: TODAY });
  assert.equal(recordFor(h, id).transitions.at(-1).followUpFloor, 1);
  const imported = harness(); assert.equal(imported.store.importJSON(h.store.exportJSON()).ok, true);
  assert.deepEqual(recordFor(imported, id), recordFor(h, id));
  assert.equal(resolutionReadiness(recordFor(imported, id)).canResolve, false);
  imported.api.followUpConflict(id, followup());
  assert.equal(imported.api.resolveConflict(id, { note: 'A new check confirms the result.' }).ok, true);
  assert.deepEqual(recordFor(harness(imported.storage), id), recordFor(imported, id));
});

test('import repairs a removed/tampered reopening floor instead of reusing pre-reopening confirmation', () => {
  const h = harness(); const id = createReady(h); completeAndVerify(h, id);
  h.api.resolveConflict(id, { note: 'First closure.' }); h.api.reopenConflict(id, { note: 'New check needed.', nextFollowUpOn: TODAY });
  for (const removeTransitionFloor of [false, true]) {
    const raw = JSON.parse(h.store.exportJSON()).state; raw.conflicts[0].followUpFloor = 0;
    if (removeTransitionFloor) delete raw.conflicts[0].transitions.at(-1).followUpFloor;
    const { state, warnings } = normalizeState(raw, { now: NOW });
    assert.equal(state.conflicts[0].followUpFloor, 1); assert.equal(resolutionReadiness(state.conflicts[0]).canResolve, false);
    assert.ok(warnings.some((warning) => warning.includes('repair')));
  }
});

test('future conflict history cannot turn planned work into completed or resolved evidence on import', () => {
  const h = harness(); const id = createReady(h); completeAndVerify(h, id); h.api.resolveConflict(id, { note: 'Closed with a real check.' });
  for (const kind of ['result', 'check', 'opening']) {
    const raw = JSON.parse(h.store.exportJSON()).state;
    if (kind === 'result') raw.conflicts[0].agreements[0].actions[0].completedOn = '2026-10-25';
    if (kind === 'check') raw.conflicts[0].followUps[0].date = '2026-10-25';
    if (kind === 'opening') raw.conflicts[0].openedOn = '2026-10-25';
    const { state, warnings } = normalizeState(raw, { now: NOW });
    assert.notEqual(state.conflicts[0].status, 'resolved'); assert.equal(resolutionReadiness(state.conflicts[0]).canResolve, false);
    assert.ok(warnings.length); assert.equal(state.conflicts[0].agreements[0].reviewOn, '2026-10-31', 'future review dates are legitimate plans');
  }
});

test('malformed and duplicate conflict entries generate warnings without disclosing their private content in the warning', () => {
  const h = harness(); const id = createReady(h);
  const raw = JSON.parse(h.store.exportJSON()).state;
  raw.conflicts[0].agreements[0].actions.push({ ...raw.conflicts[0].agreements[0].actions[0] });
  raw.conflicts.push({ ...raw.conflicts[0] }, null, false);
  const { state, warnings } = normalizeState(raw, { now: NOW });
  assert.equal(state.conflicts.length, 1); assert.equal(state.conflicts[0].id, id);
  assert.equal(state.conflicts[0].agreements[0].actions.length, 1);
  assert.ok(warnings.some((warning) => warning.includes('duplicate'))); assert.ok(warnings.some((warning) => warning.includes('malformed')));
  assert.ok(!warnings.join(' ').includes(input().title)); assert.ok(!warnings.join(' ').includes('Avery'));
});

test('keyboard focus stays in the conflict form after row removal and reaches the new heading after save', async (t) => {
  const env = boot(t); const app = await appFor(env); app.navigate('#/conflicts'); click(byText(env, 'Start a conflict record'));
  fillCreate(env); click(byText(env, 'Add participant', modal(env)));
  click(byText(env, 'Remove participant', modal(env).querySelectorAll('fieldset')[2]));
  assert.equal(env.document.activeElement.textContent, 'Add participant');
  save(env); assert.equal(env.document.activeElement, env.document.querySelector('#view h1'));
});

test('Settings export fallback offers copyable JSON and its Close button actually closes the dialog', async (t) => {
  const env = boot(t); const app = await appFor(env); app.navigate('#/settings');
  const originalURL = globalThis.URL; globalThis.URL = env.window.URL;
  t.after(() => { globalThis.URL = originalURL; });
  click(byText(env, 'Export JSON')); assert.ok(modal(env));
  assert.equal(JSON.parse(modal(env).querySelector('textarea').value).app, 'LeadOS');
  click(byText(env, 'Close', modal(env))); assert.equal(modal(env), null);
  assert.deepEqual(env.errors, []);
});

test('oversize conflict notes and commitments are refused without silently truncating a write', () => {
  const h = harness();
  for (const patch of [{ title: 'x'.repeat(201) }, { summary: 'x'.repeat(4001) },
    { participants: input().participants.map((p) => ({ ...p, perspective: 'x'.repeat(2001) })) }]) {
    assertRefusedWithoutWrite(h, () => h.api.addConflict(input(patch)));
  }
  const id = h.api.addConflict(input()).id;
  assertRefusedWithoutWrite(h, () => h.api.agreeConflict(id, agreement({ actions: [{ owner: 'Avery', text: 'x'.repeat(1001), dueOn: TODAY }] })));
  assertRefusedWithoutWrite(h, () => h.api.updateConflict(id, { sharing: 'x'.repeat(4001) }));
  const raw = JSON.parse(h.store.exportJSON()).state; raw.conflicts[0].summary = 'x'.repeat(4001);
  const { state, warnings } = normalizeState(raw, { now: NOW });
  assert.equal(state.conflicts[0].summary.length, 4000); assert.ok(warnings.some((warning) => warning.includes('repair')));
});
