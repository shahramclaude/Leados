import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { proposeBundle, validateBundleCommands, BUNDLE_ADAPTERS } from '../../app/core/domain/actionBundleRegistry.js';
import { rehearseActionBundle } from '../../app/services/actionBundleRehearsal.js';
import { fingerprint, withdrawalCheck, bundleReport, bundleSourceFingerprint, bundleInputFingerprint } from '../../app/core/domain/actionBundles.js';
import { normalizeActionBundles } from '../../app/core/domain/actionBundleSchema.js';
import { runPostCommitRules } from '../../app/core/domain/postCommit.js';
import { runActionBundleRehearsal } from '../../app/ui/response-worker.js';
import { renderActionBundles } from '../../app/views/actionBundles.js';
import { exportWorkspaceCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { parseRoute, NAV } from '../../app/main.js';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-11-01T12:00:00Z');
const clone = (v) => JSON.parse(JSON.stringify(v));
function setup({ state, rules, failWrites = false } = {}) {
  const data = new Map(state ? [[STORAGE_KEY, JSON.stringify(state)]] : []);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { if (failWrites) throw new Error('Quota exceeded'); data.set(k, v); }, removeItem: (k) => data.delete(k) };
  let seq = 0; const idFactory = (p) => `${p}-test-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory, ...(rules ? { postCommitRules: rules } : {}) }); store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage, idFactory };
}
function workspace(options = {}) {
  const env = setup(options);
  const person = env.api.addPerson({ name: 'Alex Leader', role: 'Manager' }); assert.equal(person.ok, true);
  const c = env.api.addCase({ title: 'Supplier delay', ownerId: person.id, kind: 'risk', financial: { currency: 'USD', mitigationCost: 1000 }, stakeholders: [{ name: 'Sponsor', power: 5, interest: 5, stance: 'neutral' }] }); assert.equal(c.ok, true, c.error);
  const budget = env.api.addBudget({ name: 'Recovery envelope', currency: 'USD', limit: 10000 }); assert.equal(budget.ok, true, budget.error);
  const proposal = proposeBundle(env.store.state, c.id, NOW); assert.equal(proposal.ok, true, proposal.error);
  // Add a key stakeholder while case automation is paused. The bundle's refresh
  // command will create that stakeholder's first brief; no existing draft is reused.
  const src = env.store.state.cases.find((r) => r.id === c.id);
  env.api.updateCase(c.id, { autoPropagate: false, stakeholders: [...src.stakeholders, { name: 'Operations sponsor', power: 5, interest: 4, stance: 'skeptical', keyMessage: 'Confirm the reviewed recovery checkpoint.' }] });
  env.store.state.cases.find((r) => r.id === c.id).autoPropagate = true;
  proposal.commands.push({ kind: 'comms', title: 'Refresh sponsor brief', sourceId: c.id, dueOn: proposal.reviewOn });
  const created = env.api.createActionBundle(proposal); assert.equal(created.ok, true, created.error);
  return { ...env, caseId: c.id, personId: person.id, budgetId: budget.id, bundleId: created.id };
}
function rehearsed(env) {
  const preview = rehearseActionBundle(clone(env.store.state), env.bundleId, { now: NOW }); assert.equal(preview.ok, true, preview.error);
  const saved = env.api.saveActionBundlePreview(env.bundleId, preview); assert.equal(saved.ok, true, saved.error);
  return { preview, bundle: saved.bundle };
}
function adopted(env) { const r = rehearsed(env); const result = env.api.commitActionBundle(env.bundleId, { expectedRevision: env.store.state.meta.revision, reviewed: true }); assert.equal(result.ok, true, result.error); return result.bundle; }
const bundleOf = (env) => env.store.state.actionBundles.find((b) => b.id === env.bundleId);

test('v73 → v74 is additive, empty and idempotent; no historical bundle is invented', () => {
  const old = createEmptyState(); old.schemaVersion = 73; delete old.actionBundles;
  const migrated = migrate(old); assert.deepEqual(migrated.applied, ['73 → 74', '74 → 75', '75 → 76', '76 → 77', '77 → 78', '78 → 79']); assert.deepEqual(migrated.raw.actionBundles, []);
  assert.deepEqual(migrate(migrated.raw).applied, []);
  const n = normalizeState(migrated.raw, { now: NOW }); assert.equal(n.state.schemaVersion, SCHEMA_VERSION); assert.deepEqual(n.state.actionBundles, []);
});
test('proposal uses only existing case, owner, estimate and envelope facts', () => {
  const env = workspace(); const b = bundleOf(env);
  assert.deepEqual(b.commands.map((a) => a.kind).sort(), ['budget', 'coaching', 'comms', 'decision', 'delegation', 'premise']);
  assert.equal(b.commands.find((a) => a.kind === 'budget').amount, 1000);
  assert.equal(b.commands.find((a) => a.kind === 'budget').budgetId, env.budgetId);
  assert.equal(validateBundleCommands([...b.commands, b.commands[0]], env.store.state, NOW).ok, false);
  assert.equal(validateBundleCommands([{ ...b.commands[0], kind: 'eval' }], env.store.state, NOW).ok, false);
  assert.equal(env.api.createActionBundle({ ...b, sourceId: 'missing' }).ok, false);
});
test('real-command rehearsal creates multi-module work only in a disposable store', () => {
  const env = workspace(); const before = JSON.stringify(env.store.state); const { preview, bundle } = rehearsed(env);
  assert.equal(JSON.stringify(env.store.state.actionBundles.find((b) => b.id === env.bundleId).outputs), '[]');
  assert.equal(bundle.status, 'rehearsed'); assert.equal(preview.preview.failureCount, 0);
  for (const k of ['decisions', 'delegations', 'premises', 'budgets', 'people', 'links']) assert.ok(preview.preview.changes.some((c) => c.collection === k), k);
  assert.ok(preview.preview.relationships.some((r) => r.sourceType === 'bundle' && r.relation === 'coordinates'));
  assert.equal(env.store.state.decisions.length, JSON.parse(before).decisions.length);
  assert.equal(env.store.state.budgets.find((b) => b.id === env.budgetId).lines.length, 0);
});
test('adoption requires explicit review and refuses stale revisions, changed inputs and changed source facts', () => {
  const env = workspace(); const { bundle } = rehearsed(env);
  assert.equal(env.api.commitActionBundle(bundle.id, { expectedRevision: env.store.state.meta.revision, reviewed: false }).ok, false);
  env.api.updateSettings({ teamName: 'Changed team' });
  assert.equal(env.api.commitActionBundle(bundle.id, { expectedRevision: env.store.state.meta.revision, reviewed: true }).code, 'stale-rehearsal');
  rehearsed(env); env.api.updateCase(env.caseId, { summary: 'A new fact changes the source.' });
  assert.equal(env.api.commitActionBundle(bundle.id, { expectedRevision: env.store.state.meta.revision, reviewed: true }).code, 'stale-rehearsal');
});
test('a forged operational preview cannot authorize a different live footprint', () => {
  const env = workspace(); const preview = rehearseActionBundle(clone(env.store.state), env.bundleId, { now: NOW });
  preview.preview.changes = []; const saved = env.api.saveActionBundlePreview(env.bundleId, preview); assert.equal(saved.ok, true, saved.error);
  const before = clone(env.store.state); const result = env.api.commitActionBundle(env.bundleId, { expectedRevision: before.meta.revision, reviewed: true });
  assert.equal(result.ok, false); assert.match(result.error, /differs from the reviewed rehearsal/); assert.deepEqual(env.store.state, before);
});
test('one adoption delivers source events to the generalized spine and creates typed provenance plus one review checkpoint', () => {
  const env = workspace(); const b = adopted(env); const s = env.store.state;
  assert.equal(b.outputs.length, 6); assert.equal(b.status, 'committed'); assert.deepEqual(b.actual.changes, b.preview.changes);
  assert.equal(s.decisions.length, 1); assert.equal(s.premises.length, 1); assert.equal(s.budgets[0].lines[0].committedAmount, 1000);
  assert.equal(s.delegations.filter((d) => d.support.includes(`[BND-02:${b.id}]`)).length, 1);
  assert.ok(s.links.some((l) => l.sourceType === 'bundle' && l.relation === 'coordinates' && l.targetType === 'decision'));
  assert.ok(s.events.some((e) => e.type === 'decision.created')); assert.ok(s.events.some((e) => e.type === 'premise.created'));
  const revision = s.meta.revision; env.api.scanActionBundles();
  assert.equal(env.store.state.delegations.filter((d) => d.support.includes(`[BND-02:${b.id}]`)).length, 1);
  assert.ok(env.store.state.meta.revision > revision);
  assert.ok(resolveLinkedEntity(s, 'bundle', b.id).route.includes(encodeURIComponent(b.id)));
});
test('a failing rule rolls back every command, receipt, event and graph edge', () => {
  const env = workspace();
  const { preview } = rehearsed(env);
  const failing = setup({ state: env.store.state, rules: [() => { throw new Error('Injected rule failure'); }] });
  const saved = failing.api.saveActionBundlePreview(env.bundleId, { ...preview, baseRevision: failing.store.state.meta.revision }); assert.equal(saved.ok, true, saved.error);
  const before = clone(failing.store.state); const result = failing.api.commitActionBundle(env.bundleId, { expectedRevision: before.meta.revision, reviewed: true });
  assert.equal(result.ok, false); assert.deepEqual(failing.store.state, before); assert.equal(failing.storage.getItem(STORAGE_KEY), JSON.stringify(before));
});
test('a failing later command rolls back earlier commands without nested persistence', () => {
  const env = workspace(); const b = bundleOf(env); const bad = clone(b.commands); bad.find((a) => a.kind === 'budget').amount = -1;
  const before = clone(env.store.state); const result = env.api.updateActionBundle(b.id, { ...b, commands: bad }); assert.equal(result.ok, false); assert.deepEqual(env.store.state, before);
});
test('untouched-only compensation returns work, releases money, dismisses drafts and retains the adoption receipt', () => {
  const env = workspace(); const b = adopted(env); assert.equal(withdrawalCheck(env.store.state, b).ok, true);
  const result = env.api.withdrawActionBundle(b.id, { reason: 'The supplier recovered before any work began.' }); assert.equal(result.ok, true, result.error);
  const s = env.store.state; const after = s.actionBundles.find((r) => r.id === b.id);
  assert.equal(after.status, 'withdrawn'); assert.ok(after.committedAt); assert.equal(after.history.filter((h) => h.type === 'committed').length, 1);
  assert.equal(s.decisions.length, 0); assert.equal(s.premises.length, 0); assert.equal(s.budgets[0].lines[0].status, 'released');
  assert.ok(s.delegations.every((d) => d.status === 'returned')); assert.ok(b.outputs.filter((o) => o.kind === 'comms').every((o) => s.commsDrafts.find((d) => d.id === o.id).status === 'dismissed'));
  assert.equal(s.people[0].talkingPoints.includes(b.outputs.find((o) => o.kind === 'coaching').prompt), false);
  assert.ok(s.events.some((e) => e.type === 'bundle.withdrawn')); assert.equal(env.api.withdrawActionBundle(b.id, { reason: 'Do not compensate twice please.' }).ok, false);
});
test('any touched target protects the entire bundle, including a later person edit and a sent brief', () => {
  for (const kind of ['delegation', 'budget', 'decision', 'premise', 'coaching', 'comms']) {
    const env = workspace(); const b = adopted(env); const o = b.outputs.find((r) => r.kind === kind);
    if (kind === 'delegation') env.api.checkInDelegation(o.id, { date: '2026-11-01', progress: 'blocked', note: 'A real blocker was recorded.' });
    if (kind === 'budget') env.api.recordBudgetActual(o.budgetId, o.id, { actualAmount: 200, spentOn: '2026-11-01' });
    if (kind === 'decision') env.api.decideDecision(o.id, { chosen: env.store.state.decisions[0].options[0].id, rationale: 'A human chose this path.' });
    if (kind === 'premise') env.api.reviewPremise(o.id, { reviewedOn: '2026-11-01', note: 'A human reviewed the evidence.' });
    if (kind === 'coaching') env.api.updatePerson(o.id, { focus: 'Later human edit' });
    if (kind === 'comms') assert.equal(env.api.approveCommsDraft(o.id, { acknowledgeGaps: true }).ok, true);
    const before = clone(env.store.state); const result = env.api.withdrawActionBundle(b.id, { reason: 'Attempt withdrawal after later work.' });
    assert.equal(result.ok, false, kind); assert.deepEqual(env.store.state, before, kind);
  }
});
test('pause suppresses only the review checkpoint; explicit scan still reconciles provenance', () => {
  const env = workspace(); env.api.updateSettings({ bundleAutoPropagate: false }); adopted(env);
  assert.equal(env.store.state.delegations.filter((d) => d.support.includes('[BND-02:')).length, 0);
  assert.ok(env.store.state.links.some((l) => l.sourceType === 'bundle'));
  env.api.scanActionBundles(); assert.equal(env.store.state.delegations.filter((d) => d.support.includes('[BND-02:')).length, 0);
  assert.equal(env.api.updateSettings({ bundleAutoPropagate: 'yes' }).ok, false);
});
test('reload preserves exact compensation fingerprints and refuses a malformed adopted receipt', () => {
  const env = workspace(); const b = adopted(env); const raw = clone(env.store.state); const warnings = [];
  const normalized = normalizeActionBundles(raw.actionBundles, raw, NOW.toISOString(), warnings);
  assert.deepEqual(warnings, []); assert.deepEqual(normalized[0].outputs, b.outputs); assert.equal(withdrawalCheck(raw, normalized[0]).ok, true);
  raw.actionBundles[0].outputs[0].fingerprint = 'broken'; const repaired = [];
  assert.equal(normalizeActionBundles(raw.actionBundles, raw, NOW.toISOString(), repaired)[0].status, 'draft'); assert.ok(repaired.length);
});
test('source-event preflight rejects an over-budget batch before any rule executes', () => {
  const state = createEmptyState(); let ran = false;
  assert.throws(() => runPostCommitRules(state, { event: { type: 'bundle.committed', entity: 'bundle', entityId: 'b' }, now: NOW,
    sourceEvents: Array.from({ length: 64 }, (_, i) => ({ type: 'person.updated', entity: 'person', entityId: `p${i}` })), rules: [() => { ran = true; return []; }] }), /event budget/);
  assert.equal(ran, false);
});
test('storage failure is disclosed rather than reported as a saved adoption', () => {
  const env = workspace(); const { preview } = rehearsed(env);
  // Fail only the adoption persistence call, after a valid reviewed preview exists.
  env.storage.setItem = () => { throw new Error('Quota exceeded'); }; const result = env.api.commitActionBundle(env.bundleId, { expectedRevision: env.store.state.meta.revision, reviewed: true });
  assert.equal(result.ok, true); assert.equal(result.saved, false); assert.match(result.warning, /Quota exceeded/);
});
test('CSV #64 is aggregate-only and contains no identifiers, titles, prompts or amounts', () => {
  const env = workspace(); adopted(env); const scope = CSV_EXPORTS.find((s) => s.key === 'action-bundles'); assert.ok(scope);
  const csv = exportWorkspaceCsv(env.store.state, 'action-bundles', { now: NOW }).csv;
  assert.match(csv, /action_kind/); assert.doesNotMatch(csv, /Supplier delay|Alex Leader|bundle-test|case-test|person-test|1000/);
});
test('demo cleanup removes open demo proposals but keeps terminal history without dangling graph edges', () => {
  const env = workspace(); const b = adopted(env); const raw = clone(env.store.state);
  raw.cases[0].id = 'case-demo-source'; raw.actionBundles[0].sourceId = raw.cases[0].id;
  raw.actionBundles.push({ ...clone(b), id: 'bnd-demo-open', status: 'draft', outputs: [], preview: null });
  const fresh = setup({ state: raw }); fresh.store.clearDemo();
  assert.equal(fresh.store.state.actionBundles.length, 1); assert.equal(fresh.store.state.actionBundles[0].status, 'committed');
  assert.equal(fresh.store.state.links.some((l) => l.targetType === 'case' && l.targetId === raw.cases[0].id), false);
});
test('worker adapter correlates results, terminates and never falls back on timeout', async () => {
  let posted, terminated = false;
  const worker = { postMessage: (m) => { posted = m; }, terminate: () => { terminated = true; } };
  const promise = runActionBundleRehearsal({ meta: { revision: 2 } }, 'b1', NOW, { workerFactory: () => worker });
  assert.equal(posted.kind, 'bundle'); assert.equal(posted.bundleId, 'b1'); worker.onmessage({ data: { requestId: posted.requestId, result: { ok: true } } });
  assert.deepEqual(await promise, { ok: true }); assert.equal(terminated, true);
  const silent = { postMessage() {}, terminate() {} }; const timeout = await runActionBundleRehearsal({}, 'b', NOW, { workerFactory: () => silent, timeoutMs: 5 });
  assert.equal(timeout.ok, false); assert.match(timeout.error, /No live records/);
});
test('standalone inline worker rehearses the new bundle without a DOM or network', () => {
  const env = workspace(); const html = fs.readFileSync(path.resolve(import.meta.dirname, '../../LeadOS-standalone.html'), 'utf8');
  const source = html.match(/<script id="leados-standalone-app">([\s\S]*?)<\/script>/)[1]; const messages = [];
  const context = { console, setTimeout, clearTimeout, URL, Blob, postMessage: (m) => messages.push(m) }; context.self = context; vm.createContext(context);
  vm.runInContext(source, context, { timeout: 10000 }); context.onmessage({ data: { kind: 'bundle', requestId: 'offline-bundle', state: env.store.state, bundleId: env.bundleId, now: NOW.toISOString() } });
  assert.equal(messages.length, 1); assert.equal(messages[0].result.ok, true, messages[0].result.error); assert.equal(messages[0].result.preview.failureCount, 0);
});
test('route, navigation and accessible reviewed-plan journey are wired', async () => {
  assert.equal(parseRoute('#/action-bundles').route, 'bundles'); assert.ok(NAV.some((g) => g.items.some((i) => i.route === 'bundles')));
  const dom = new JSDOM('<!doctype html><html><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/#/bundles' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  const env = workspace(); rehearsed(env);
  const ctx = { state: env.store.state, store: env.store, api: env.api, now: NOW, query: new URLSearchParams(`bundle=${env.bundleId}`), navigate() {}, refresh() {} };
  const node = renderActionBundles(ctx); document.getElementById('view').appendChild(node);
  assert.equal(node.querySelectorAll('h1').length, 1); assert.ok(node.querySelector('[name="include-budget"]')); assert.match(node.textContent, /Review & adopt bundle/);
  dom.window.eval(AXE_SRC); const results = await dom.window.axe.run(node, { rules: { 'color-contrast': { enabled: false } } });
  assert.deepEqual(results.violations.map((v) => v.id), []); dom.window.close();
});