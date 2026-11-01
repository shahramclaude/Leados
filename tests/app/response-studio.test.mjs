import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { createEmptyState, normalizeState, SCHEMA_VERSION, migrate } from '../../app/core/schema.js';
import { toCaseInput } from '../../app/core/domain/intake.js';
import { rehearseResponse } from '../../app/services/responseRehearsal.js';
import {
  responseEconomics, responseCaseInput, responseSourceFingerprint, responsePlanInputFingerprint,
  responseBrief, responseSignals, responsePlanReport,
} from '../../app/core/domain/response.js';
import { validateResponseAssumptions, normalizeResponsePlans } from '../../app/core/domain/responseSchema.js';
import { runResponseRehearsal } from '../../app/ui/response-worker.js';
import { renderResponses } from '../../app/views/responses.js';
import { resolveLinkedEntity, LINK_ENTITY_TYPES, LINK_RELATIONS } from '../../app/core/domain/cases.js';
import { parseRoute, NAV } from '../../app/main.js';

const require = createRequire(import.meta.url);
const AXE_SRC = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-11-01T12:00:00Z');
const NOTE = 'Our supplier delivery is delayed three weeks and the production delay will cost 40000 USD. The team is overloaded and the sponsor demands escalation this week.';
const ASSUMPTIONS = { currency: 'USD', mitigationBudget: 5000, weeklyDelayLow: 1000, weeklyDelayMode: 2000, weeklyDelayHigh: 4000, delayDays: 14, evidenceDays: 3 };

function memoryStorage(state = null) {
  const data = new Map(state ? [[STORAGE_KEY, JSON.stringify(state)]] : []);
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k), dump: () => Object.fromEntries(data) };
}
function setup({ state, now = NOW } = {}) {
  const storage = memoryStorage(state);
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-test-${++seq}`;
  const store = createStore({ storage, now: () => now, idFactory });
  store.load();
  const api = createApi(store, { now: () => now, idFactory });
  return { store, api, storage, idFactory, now };
}
function withDraft(options = {}) {
  const env = setup(options);
  const person = env.api.addPerson({ name: 'Alex Leader', role: 'Manager' });
  env.api.updateSettings({ leaderName: 'Alex Leader', teamName: 'Platform' });
  const saved = env.api.saveIntakeDraft(NOTE);
  assert.equal(saved.ok, true, saved.error);
  const draft = env.store.state.intakeDrafts.find((d) => d.id === saved.id);
  const base = toCaseInput(draft.analysis);
  base.ownerId = person.id;
  base.stakeholders = [{ id: 'stk-test', name: 'Sponsor', role: 'Approver', power: 5, interest: 5, stance: 'neutral', keyMessage: 'Confirm the recovery checkpoint.' }];
  return { ...env, draft, base, person };
}
function input(env, overrides = {}) {
  return { strategy: 'contain', caseInput: env.base, assumptions: ASSUMPTIONS, fieldsConfirmed: true,
    sourceFingerprint: responseSourceFingerprint(env.draft), ...overrides };
}
function rehearseAndSave(env, overrides = {}) {
  const result = rehearseResponse(env.store.state, env.draft.id, input(env, overrides), { now: env.now });
  assert.equal(result.ok, true, result.error);
  const saved = env.api.saveResponsePlan(result);
  assert.equal(saved.ok, true, saved.error);
  return { result, plan: saved.plan };
}

test('schema v73 migrates additively and never invents a historical rehearsal', () => {
  const old = { ...createEmptyState(), schemaVersion: 72 };
  delete old.responsePlans;
  const migrated = migrate(old);
  assert.ok(migrated.applied.includes('72 → 73'));
  assert.deepEqual(migrated.raw.responsePlans, []);
  const normalized = normalizeState(migrated.raw, { now: NOW });
  assert.equal(normalized.state.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(normalized.state.responsePlans, []);
});

test('assumptions are strict, ordered and explicit; blank is not zero', () => {
  assert.equal(validateResponseAssumptions(ASSUMPTIONS).ok, true);
  for (const patch of [{ mitigationBudget: '' }, { weeklyDelayLow: -1 }, { weeklyDelayMode: 5000 }, { delayDays: 0 }, { delayDays: 91 }, { evidenceDays: 2.5 }, { currency: 'US' }, { weeklyDelayHigh: Infinity }]) {
    assert.equal(validateResponseAssumptions({ ...ASSUMPTIONS, ...patch }).ok, false, JSON.stringify(patch));
  }
});

test('cost scenarios are hand-computable and do not claim confidence intervals', () => {
  const e = responseEconomics(ASSUMPTIONS);
  assert.equal(e.available, true);
  const contain = e.rows.find((r) => r.id === 'contain');
  const verify = e.rows.find((r) => r.id === 'verify');
  const wait = e.rows.find((r) => r.id === 'wait');
  assert.equal(contain.mode, 5000);
  assert.equal(verify.mode, 5857.14);
  assert.equal(wait.low, 7000); assert.equal(wait.mode, 9000); assert.equal(wait.high, 13000);
  assert.equal(e.verificationBreakEvenPct, 18.57);
  assert.match(e.scope, /not a probability|No discounting/);
});

test('strategy adapter changes only declared policy fields and never invents an owner or cause', () => {
  const base = { title: 'Delay', ownerId: null, financial: { currency: 'USD', mostLikely: 10 }, rca: { rootCause: '' }, reviewOn: '2026-11-10' };
  const contain = responseCaseInput(base, 'contain', ASSUMPTIONS, NOW);
  const verify = responseCaseInput(base, 'verify', ASSUMPTIONS, NOW);
  assert.equal(contain.financial.mitigationCost, 5000);
  assert.equal(verify.financial.mitigationCost, 0);
  assert.equal(verify.reviewOn, '2026-11-04');
  assert.equal(contain.ownerId, null); assert.equal(contain.rca.rootCause, '');
});

test('rehearsal refuses unconfirmed facts, changed source and confidential conflict text', () => {
  const env = withDraft();
  assert.equal(rehearseResponse(env.store.state, env.draft.id, input(env, { fieldsConfirmed: false }), { now: NOW }).ok, false);
  assert.equal(rehearseResponse(env.store.state, env.draft.id, input(env, { sourceFingerprint: '0000000000000000' }), { now: NOW }).ok, false);
  const conflict = env.api.saveIntakeDraft('Two colleagues are in a hostile conflict and one made a bullying accusation against the other.');
  if (conflict.ok) {
    const r = rehearseResponse(env.store.state, conflict.id, { ...input(env), fieldsConfirmed: true }, { now: NOW });
    assert.equal(r.ok, false);
  }
});

test('three policy branches replay production fan-out without mutating the live workspace', () => {
  const env = withDraft();
  const before = JSON.stringify(env.store.state);
  const result = rehearseResponse(env.store.state, env.draft.id, input(env), { now: NOW });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.preview.branches.map((b) => b.id), ['contain', 'verify', 'wait']);
  assert.equal(result.preview.branches[2].at.slice(0, 10), '2026-11-15');
  for (const branch of result.preview.branches) {
    assert.equal(branch.failureCount, 0);
    assert.ok(branch.changes.some((c) => c.collection === 'cases' && c.created === 1));
    assert.ok(branch.changes.some((c) => c.collection === 'decisions' && c.created > 0));
    assert.ok(branch.changes.some((c) => c.collection === 'delegations' && c.created > 0));
    assert.ok(branch.changes.some((c) => c.collection === 'commsDrafts' && c.created > 0));
  }
  assert.equal(JSON.stringify(env.store.state), before);
  assert.deepEqual(result, rehearseResponse(env.store.state, env.draft.id, input(env), { now: NOW }));
  assert.doesNotMatch(JSON.stringify(result.preview), /Alex Leader|Sponsor|supplier delivery/);
});

test('saving a receipt links the privacy-safe intake node and is idempotent on re-rehearsal', () => {
  const env = withDraft();
  const { plan } = rehearseAndSave(env);
  assert.ok(env.store.state.links.some((l) => l.sourceType === 'response' && l.targetType === 'intake' && l.relation === 'rehearses'));
  const node = resolveLinkedEntity(env.store.state, 'intake', env.draft.id);
  assert.equal(node.title, 'Situation note');
  assert.doesNotMatch(node.title, /supplier/);
  const count = env.store.state.responsePlans.length;
  rehearseAndSave(env);
  assert.equal(env.store.state.responsePlans.length, count);
  assert.equal(env.store.state.responsePlans[0].id, plan.id);
});

test('adoption is one source transaction: case, intake confirmation and receipt commit together', () => {
  const env = withDraft();
  const { plan } = rehearseAndSave(env);
  let updates = 0;
  const original = env.store.update;
  env.store.update = (...args) => { updates += 1; return original(...args); };
  const result = env.api.commitResponsePlan(plan.id, { expectedRevision: env.store.state.meta.revision });
  env.store.update = original;
  assert.equal(result.ok, true, result.error);
  assert.equal(updates, 1);
  const committed = env.store.state.responsePlans.find((p) => p.id === plan.id);
  const intake = env.store.state.intakeDrafts.find((d) => d.id === env.draft.id);
  assert.equal(committed.status, 'committed'); assert.equal(committed.caseId, result.caseId);
  assert.equal(intake.status, 'confirmed'); assert.equal(intake.confirmedCaseId, result.caseId);
  assert.ok(env.store.state.links.some((l) => l.sourceType === 'response' && l.targetType === 'case' && l.relation === 'responds-to'));
  assert.equal(env.api.commitResponsePlan(plan.id, { expectedRevision: env.store.state.meta.revision }).ok, false);
});

test('ordinary intake confirmation is also atomic after the v73 repair', () => {
  const env = withDraft();
  let updates = 0;
  const original = env.store.update;
  env.store.update = (...args) => { updates += 1; return original(...args); };
  const result = env.api.confirmIntakeDraft(env.draft.id);
  env.store.update = original;
  assert.equal(result.ok, true, result.error);
  assert.equal(updates, 1);
  assert.equal(env.store.state.intakeDrafts.find((d) => d.id === env.draft.id).status, 'confirmed');
});

test('a stale workspace revision blocks adoption without a partial write', () => {
  const env = withDraft();
  const { plan } = rehearseAndSave(env);
  const revision = env.store.state.meta.revision;
  env.api.updateSettings({ teamName: 'Changed' });
  const casesBefore = env.store.state.cases.length;
  const result = env.api.commitResponsePlan(plan.id, { expectedRevision: revision });
  assert.equal(result.ok, false); assert.equal(result.code, 'stale-rehearsal');
  assert.equal(env.store.state.cases.length, casesBefore);
});

test('a failed rule in any branch blocks adoption', () => {
  const env = withDraft();
  const { result } = rehearseAndSave(env);
  result.preview.branches[0].failureCount = 1;
  result.baseRevision = env.store.state.meta.revision;
  // Re-identity the payload after tampering so the receipt normalizer accepts it.
  const saved = env.api.saveResponsePlan(result);
  assert.equal(saved.ok, true);
  const commit = env.api.commitResponsePlan(saved.id, { expectedRevision: env.store.state.meta.revision });
  assert.equal(commit.ok, false);
});

test('scheduling a delayed response creates exactly one real follow-up and typed link', () => {
  const env = withDraft();
  const { plan } = rehearseAndSave(env, { strategy: 'wait' });
  const before = env.store.state.delegations.length + env.store.state.decisions.length;
  const scheduled = env.api.scheduleResponsePlan(plan.id);
  assert.equal(scheduled.ok, true, scheduled.error);
  assert.equal(scheduled.reviewOn, '2026-11-15');
  assert.equal(env.store.state.delegations.length + env.store.state.decisions.length, before + 1);
  env.api.scanResponsePlans(); env.api.scanResponsePlans();
  assert.equal(env.store.state.delegations.length + env.store.state.decisions.length, before + 1);
  assert.ok(env.store.state.links.some((l) => l.sourceType === 'response' && ['tracks-followup', 'decides'].includes(l.relation)));
});

test('paused response automation keeps the date but creates no follow-up work', () => {
  const env = withDraft();
  const { plan } = rehearseAndSave(env, { strategy: 'wait' });
  env.api.updateSettings({ responseAutoPropagate: false });
  const before = env.store.state.delegations.length + env.store.state.decisions.length;
  assert.equal(env.api.scheduleResponsePlan(plan.id).ok, true);
  assert.equal(env.store.state.delegations.length + env.store.state.decisions.length, before);
});

test('safety/legal stakes require review and refuse delayed adoption', () => {
  const env = setup();
  env.api.addPerson({ name: 'Alex Leader' });
  const saved = env.api.saveIntakeDraft('A warehouse safety incident created a compliance breach and a legal exposure that needs escalation today.');
  assert.equal(saved.ok, true);
  const draft = env.store.state.intakeDrafts.find((d) => d.id === saved.id);
  const base = toCaseInput(draft.analysis);
  const payload = { strategy: 'wait', caseInput: base, assumptions: ASSUMPTIONS, fieldsConfirmed: true, sourceFingerprint: responseSourceFingerprint(draft) };
  assert.equal(rehearseResponse(env.store.state, draft.id, payload, { now: NOW }).ok, false);
  const reviewed = rehearseResponse(env.store.state, draft.id, { ...payload, strategy: 'contain', safetyReviewed: true }, { now: NOW });
  assert.equal(reviewed.ok, true, reviewed.error);
  assert.equal(reviewed.safety.delayAllowed, false);
});

test('committed receipts are immutable and archive cannot erase adoption history', () => {
  const env = withDraft();
  const { plan } = rehearseAndSave(env);
  env.api.commitResponsePlan(plan.id, { expectedRevision: env.store.state.meta.revision });
  assert.equal(env.api.archiveResponsePlan(plan.id).ok, false);
  assert.equal(env.store.state.responsePlans.find((p) => p.id === plan.id).status, 'committed');
});

test('normalizer drops malformed receipts and clears dangling case pointers without erasing history', () => {
  const env = withDraft();
  const { plan } = rehearseAndSave(env);
  const warnings = [];
  const broken = { ...plan, caseId: 'missing-case', status: 'committed', committedAt: NOW.toISOString() };
  const rows = normalizeResponsePlans([broken, { id: 'bad' }], env.store.state, NOW.toISOString(), warnings);
  assert.equal(rows.length, 1); assert.equal(rows[0].caseId, null); assert.equal(rows[0].status, 'committed');
  assert.ok(warnings.length >= 1);
});

test('board receipt and CSV scope are identity-free', () => {
  const env = withDraft();
  const { plan } = rehearseAndSave(env);
  const brief = responseBrief(plan);
  assert.doesNotMatch(brief, /Alex Leader|Sponsor|supplier delivery|test-/);
  const csv = env.store.exportCSV('response-studio');
  assert.equal(csv.ok, true, csv.error);
  assert.doesNotMatch(csv.csv, /Alex Leader|Sponsor|supplier delivery|test-/);
  assert.match(csv.csv, /contain/);
});

test('signals and nav badge surface due, stale and incomplete plans', () => {
  const env = withDraft();
  const { plan } = rehearseAndSave(env, { strategy: 'wait' });
  env.api.scheduleResponsePlan(plan.id);
  const later = new Date('2026-11-16T12:00:00Z');
  const report = responsePlanReport(env.store.state, later);
  assert.equal(report.due.length, 1); assert.equal(report.stale.length, 1);
  const signals = responseSignals(env.store.state, later);
  assert.ok(signals.some((s) => s.ruleId === 'RSP-01'));
  assert.ok(signals.every((s) => s.action.route.startsWith('#/responses')));
});

test('typed registry and route aliases expose the new graph nodes', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('response')); assert.ok(LINK_ENTITY_TYPES.includes('intake'));
  assert.ok(LINK_RELATIONS.includes('rehearses')); assert.ok(LINK_RELATIONS.includes('responds-to'));
  assert.equal(parseRoute('#/response-studio').route, 'responses');
  assert.equal(parseRoute('#/command').route, 'responses');
  assert.ok(NAV.flatMap((g) => g.items).some((i) => i.route === 'responses'));
});

test('worker client resolves a matching request and terminates the worker', async () => {
  let terminated = false;
  class FakeWorker {
    postMessage(message) { setTimeout(() => this.onmessage({ data: { requestId: message.requestId, result: { ok: true, value: 42 } } }), 0); }
    terminate() { terminated = true; }
  }
  const result = await runResponseRehearsal({}, 'draft', {}, NOW, { workerFactory: () => new FakeWorker() });
  assert.deepEqual(result, { ok: true, value: 42 }); assert.equal(terminated, true);
});

test('worker timeout refuses rather than falling back to main-thread computation', async () => {
  class SilentWorker { postMessage() {} terminate() {} }
  const result = await runResponseRehearsal({}, 'draft', {}, NOW, { workerFactory: () => new SilentWorker(), timeoutMs: 10 });
  assert.equal(result.ok, false); assert.match(result.error, /No live records/);
});

function domEnv() {
  const dom = new JSDOM('<!doctype html><html><body><main id="view"></main></body></html>', { url: 'https://leados.test/#/responses' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  return dom;
}
function ctxFor(env, query = '') {
  return { state: env.store.state, api: env.api, now: env.now, query: new URLSearchParams(query), navigate: () => {}, refresh: () => {} };
}

test('Response Studio renders an accessible empty journey and a reviewed draft form', async () => {
  const dom = domEnv();
  const env = withDraft();
  const ctx = ctxFor(env, `draft=${env.draft.id}`);
  const node = renderResponses(ctx);
  document.getElementById('view').appendChild(node);
  assert.equal(node.querySelectorAll('h1').length, 1);
  assert.ok(node.querySelector('#response-note'));
  assert.ok(node.querySelector('[name="mitigationBudget"]'));
  assert.ok(node.querySelector('[name="responseStrategy"][value="wait"]'));
  dom.window.eval(AXE_SRC);
  const results = await dom.window.axe.run(node, { rules: { 'color-contrast': { enabled: false } } });
  assert.deepEqual(results.violations.map((v) => v.id), []);
  dom.window.close();
});

test('saved plan renders a receipt with adoption controls and no duplicate h1', () => {
  const dom = domEnv();
  const env = withDraft();
  const { plan } = rehearseAndSave(env);
  const node = renderResponses(ctxFor(env, `plan=${plan.id}`));
  document.getElementById('view').appendChild(node);
  assert.equal(node.querySelectorAll('h1').length, 1);
  assert.match(node.textContent, /Rehearsal complete/);
  assert.match(node.textContent, /Adopt reviewed response/);
  dom.window.close();
});

test('the standalone inline bundle also boots as a worker and rehearses without a DOM', () => {
  const html = fs.readFileSync(path.resolve(import.meta.dirname, '../../LeadOS-standalone.html'), 'utf8');
  const match = html.match(/<script id="leados-standalone-app">([\s\S]*?)<\/script>/);
  assert.ok(match, 'inline app bundle exists');
  const env = withDraft();
  const messages = [];
  const context = { console, setTimeout, clearTimeout, URL, Blob, postMessage: (message) => messages.push(message) };
  context.self = context;
  vm.createContext(context);
  vm.runInContext(match[1], context, { timeout: 10000 });
  assert.equal(typeof context.onmessage, 'function');
  context.onmessage({ data: { requestId: 'offline-worker', state: env.store.state, draftId: env.draft.id, input: input(env), now: NOW.toISOString() } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].requestId, 'offline-worker');
  assert.equal(messages[0].result.ok, true, messages[0].result.error);
  assert.equal(messages[0].result.preview.branches.length, 3);
});
