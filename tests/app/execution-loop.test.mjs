/** ADR-0106: evidence-based closure, hierarchy roll-up, privacy and role-first navigation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { rehearseMissionCapture } from '../../app/services/missionCaptureRehearsal.js';
import { bundleExecution, executionOwnerNodeId } from '../../app/core/domain/execution.js';
import { EXECUTION_ADAPTERS, EXECUTION_EVENTS } from '../../app/core/domain/executionRegistry.js';
import { BUNDLE_KINDS } from '../../app/core/domain/actionBundleRegistry.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { buildMission } from '../../app/core/domain/mission.js';
import { renderMission } from '../../app/views/mission.js';
import { renderActionBundles } from '../../app/views/actionBundles.js';
import { buildWorkspaceNav, renderWorkspaceNav } from '../../app/ui/workspace-nav.js';
import { NAV } from '../../app/main.js';
import { workspaceRouteVerdict } from '../../app/core/domain/accessGateway.js';
import { compileDisclosure } from '../../app/core/domain/disclosure.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { executionRule } from '../../app/core/domain/executionRules.js';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-11-06T12:00:00.000Z');
const clone = (v) => JSON.parse(JSON.stringify(v));
const NOTE = 'The supplier delivery is late again and the team is overloaded. Ari Klein says the billing backlog is blocking handoffs.';
function fixture(seat = 'lead1') {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Root', chainLeaderAltitude: 'chief', activeSeatId: seat, seatEnforce: true, missionCellFloor: 3 };
  state.people = [['vp1', null, 'vp', 'Rina VP'], ['dir1', 'vp1', 'director', 'Sam Director'], ['mgr1', 'dir1', 'manager', 'Mei Manager'], ['lead1', 'mgr1', 'lead', 'Priya Lead'], ['lead2', 'mgr1', 'lead', 'Jordan Lead'], ['ic1', 'lead1', 'ic', 'Ari Klein'], ['ic3', 'lead2', 'ic', 'Cy Orlov']]
    .map(([id, managerId, level, name]) => ({ id, name, role: level, level, managerId, status: 'active' }));
  return normalizeState(state, { now: NOW }).state;
}
function setup({ state = fixture(), rules } = {}) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  let seq = 0; const idFactory = (p) => `${p}-exe-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory, ...(rules ? { postCommitRules: rules } : {}) }); store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}
function adopt(env, kinds = ['decision', 'delegation', 'coaching']) {
  const p = env.api.missionCapturePrepare({ text: NOTE, title: 'Billing backlog recovery', ownerId: 'lead1', kinds, reviewOn: '2026-11-13' });
  assert.equal(p.ok, true, p.error);
  const r = rehearseMissionCapture(env.store.state, p.id, { now: NOW }); assert.equal(r.ok, true, r.error);
  assert.equal(env.api.saveMissionCapturePreview(p.id, r).ok, true);
  const c = env.api.missionCaptureCommit(p.id, env.store.state.meta.revision, true); assert.equal(c.ok, true, c.error);
  return env.store.state.actionBundles[0];
}
function settleActions(env, b) {
  const del = b.outputs.find((o) => o.kind === 'delegation');
  assert.equal(env.api.completeDelegation(del.id, { completionNote: 'Delivered the recovery checkpoint.' }).ok, true);
  const dec = b.outputs.find((o) => o.kind === 'decision');
  assert.equal(env.api.decideDecision(dec.id, { chosen: 'Proceed with the reviewed response', rationale: 'Reviewed with the owner.' }).ok, true);
  assert.equal(env.api.reviewDecision(dec.id, { outcome: 'good', outcomeNotes: 'Backlog cleared.' }).ok, true);
  const coach = b.outputs.find((o) => o.kind === 'coaching');
  assert.equal(env.api.logOneOnOne({ personId: coach.id, date: '2026-11-06', status: 'held', resolvedTalkingPoints: [coach.prompt] }).ok, true);
}

test('v108 is additive and fail-closed: historical meetings have no invented coaching proof', () => {
  assert.equal(SCHEMA_VERSION, 116);
  const old = { schemaVersion: 107, settings: { leaderName: 'Keep', executionAutoReconcile: false }, oneOnOnes: [{ id: 'oo-old', personId: 'p', date: '2026-11-01', status: 'held' }], actionBundles: [{ id: 'b-old' }] };
  const m = migrate(old); assert.equal(m.raw.schemaVersion, 116); assert.deepEqual(m.raw.oneOnOnes[0].resolvedTopics, []); assert.equal(m.raw.actionBundles[0].execution, null); assert.deepEqual(migrate(m.raw).applied, []);
  const env = setup(); assert.equal(env.store.state.settings.executionAutoReconcile, true);
  const b = adopt(env); const raw = clone(env.store.state); raw.actionBundles[0].execution = { state: 'closed', fingerprint: 'forged' };
  const warnings = []; const normalized = normalizeState(raw, { now: NOW, warnings });
  assert.equal(normalized.state.actionBundles[0].execution, null); assert.ok(normalized.warnings.length || warnings.length);
  assert.equal(bundleExecution(normalized.state, normalized.state.actionBundles[0], NOW).state, 'waiting', 'a forged marker never becomes live truth');
  assert.ok(b.execution);
});

test('the evidence registry covers every command kind and is wired into the shared spine/contract', () => {
  assert.deepEqual(Object.keys(EXECUTION_ADAPTERS).sort(), [...BUNDLE_KINDS].sort());
  for (const kind of BUNDLE_KINDS) assert.ok(EXECUTION_ADAPTERS[kind].events.length, kind);
  assert.ok(EXECUTION_EVENTS.includes('delegation.completed')); assert.ok(EXECUTION_EVENTS.includes('case.resolved'));
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(executionRule));
  assert.ok(PROPAGATION_CONTRACTS.some((c) => c.rule === executionRule && c.writes.includes('actionBundles')));
});

test('one adoption closes across modules AND every altitude only after terminal evidence + human case resolution', () => {
  const env = setup(); const b = adopt(env);
  assert.equal(b.execution.state, 'waiting');
  settleActions(env, b);
  let live = env.store.state.actionBundles[0]; assert.equal(live.execution.state, 'ready', 'actions alone do not close the PDCA loop');
  const caseId = live.sourceId;
  assert.equal(env.api.resolveCase(caseId, { resolutionNotes: 'Recovered and installed a systemic guardrail.', resolvedOn: '2026-11-06' }).ok, true);
  live = env.store.state.actionBundles[0]; assert.equal(live.execution.state, 'closed'); assert.equal(live.execution.closedOn, '2026-11-06');
  const task = env.store.state.delegations.find((d) => d.support.includes(`[BND-02:${live.id}]`)); assert.equal(task.status, 'done'); assert.match(task.completionNote, /System-reconciled/);
  for (const ancestor of ['mgr1', 'dir1', 'vp1', 'leader']) assert.ok(env.store.state.links.some((l) => l.sourceType === 'bundle' && l.sourceId === live.id && l.relation === 'rolls-up-to' && l.targetId === ancestor), ancestor);
  assert.ok(env.store.state.links.some((l) => l.sourceType === 'bundle' && l.relation === 'rests-on' && l.targetType === 'case' && l.targetId === caseId));
  assert.ok(env.store.state.links.some((l) => l.sourceType === 'bundle' && l.relation === 'rests-on' && l.targetType === 'oneonone'));
  assert.equal(JSON.stringify(env.store.state.events).includes(NOTE), false, 'the private note never enters the audit log');
  const before = clone(env.store.state); const scan = env.api.executionScan(); assert.equal(scan.ok, true);
  assert.deepEqual(env.store.state.actionBundles[0].history, before.actionBundles[0].history, 'idempotent scan appends no duplicate transition');
  assert.equal(env.store.state.links.filter((l) => l.ruleId === 'RULE-EXE-01').length, before.links.filter((l) => l.ruleId === 'RULE-EXE-01').length);
});

test('returned work, deleted prompts and released money are not delivery; pause gates automatic writes but not an explicit scan', () => {
  const env = setup(); const b = adopt(env, ['decision', 'delegation', 'coaching']);
  const del = b.outputs.find((o) => o.kind === 'delegation'); env.api.returnDelegation(del.id, { returnReason: 'Outside my authority.' });
  const coach = b.outputs.find((o) => o.kind === 'coaching'); const p = env.store.state.people.find((x) => x.id === coach.id); env.api.updatePerson(p.id, { talkingPoints: p.talkingPoints.filter((t) => t !== coach.prompt) });
  env.api.resolveCase(b.sourceId, { resolutionNotes: 'Case closed administratively.', resolvedOn: '2026-11-06' });
  let e = bundleExecution(env.store.state, env.store.state.actionBundles[0], NOW); assert.equal(e.state, 'blocked'); assert.equal(e.counts.fulfilled, 0); assert.ok(e.counts.blocked >= 2);
  const s = clone(env.store.state); s.budgets = [{ id: 'bud', currency: 'USD', lines: [{ id: 'line', status: 'released', releasedOn: '2026-11-06' }] }];
  const budgetBundle = { ...b, outputs: [{ kind: 'budget', id: 'line', budgetId: 'bud' }] };
  assert.equal(EXECUTION_ADAPTERS.budget.inspect(s, budgetBundle.outputs[0], budgetBundle).state, 'stopped');
  const historyN = env.store.state.actionBundles[0].history.length;
  env.api.setExecutionAutoPropagate(false); const revision = env.store.state.meta.revision;
  env.api.updateDecision(b.outputs.find((o) => o.kind === 'decision').id, { title: 'A later edit while paused' });
  assert.equal(env.store.state.actionBundles[0].history.length, historyN, 'paused automatic pass appends no reconciliation');
  assert.ok(env.store.state.meta.revision > revision);
  assert.equal(env.api.executionScan().ok, true); assert.ok(env.store.state.actionBundles[0].history.length >= historyN);
});

test('vertical roll-up is detail-bounded: frontline sees proof, seniors see intervals, sideways drill is refused', () => {
  const env = setup(); const b = adopt(env); settleActions(env, b); env.api.resolveCase(b.sourceId, { resolutionNotes: 'Recovered with a guardrail.', resolvedOn: '2026-11-06' });
  const lead = env.api.missionRead(); assert.equal(lead.execution.detail, true); assert.equal(lead.execution.summary.closed, 1); assert.ok(lead.execution.loops[0].outputs.length);
  const receipt = env.api.missionExecutionReceipt(b.id); assert.equal(receipt.ok, true); assert.match(receipt.text, /Closed on: 2026-11-06/);
  const manager = (() => { env.api.setActiveSeat('mgr1'); return env.api.missionRead(); })();
  assert.equal(manager.execution.detail, true, 'manager is the existing individual-detail ceiling for their own span');
  assert.ok(manager.execution.loops.length);
  for (const seat of ['dir1', 'vp1', 'leader']) {
    env.api.setActiveSeat(seat); const m = env.api.missionRead();
    assert.equal(m.execution.detail, false, seat); assert.equal(m.execution.summary, null); assert.deepEqual(m.execution.loops, []);
    assert.ok(m.execution.hierarchy.totals.open.lower <= m.execution.hierarchy.totals.open.upper);
    assert.equal(env.api.missionExecutionReceipt(b.id).ok, false, `${seat} must not receive proof pointers`);
  }
  env.api.setActiveSeat('lead2'); assert.equal(env.api.missionRead('lead1').ok, false, 'sideways drill-down is refused');
  const built = buildSeats(env.store.state, { now: NOW }); const source = env.store.state.cases.find((c) => c.id === b.sourceId);
  assert.equal(executionOwnerNodeId(source, built), 'lead1', 'an accountable leader is not escalated one rung by the generic people-LCA');
});

test('reopening the source case reopens the loop without erasing the closure history', () => {
  const env = setup(); const b = adopt(env); settleActions(env, b); env.api.resolveCase(b.sourceId, { resolutionNotes: 'Recovered with a guardrail.', resolvedOn: '2026-11-06' });
  const closedHistory = env.store.state.actionBundles[0].history.length;
  assert.equal(env.api.reopenCase(b.sourceId, { reason: 'The backlog returned.' }).ok, true);
  const live = env.store.state.actionBundles[0]; assert.equal(live.execution.state, 'reopened'); assert.ok(live.history.length > closedHistory); assert.ok(live.history.some((h) => h.type === 'execution.closed'));
});

test('Mission execution, bundle receipt and role-first navigation render accessibly', async () => {
  const dom = new JSDOM('<!doctype html><html><body><nav id="sidebar-nav"></nav><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/#/mission?panel=execution', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node; globalThis.Element = dom.window.Element; globalThis.HTMLElement = dom.window.HTMLElement;
  const env = setup(); const b = adopt(env);
  const ctx = { api: env.api, store: env.store, state: env.store.state, now: NOW, query: new URLSearchParams('panel=execution'), refresh() {}, navigate() {} };
  const view = document.getElementById('view'); view.replaceChildren(renderMission(ctx)); assert.ok(view.textContent.includes('Execution evidence')); assert.ok(view.querySelector('a[href="#/mission?panel=capture"]'));
  dom.window.eval(AXE_SRC); let results = await dom.window.axe.run(view, { rules: { region: { enabled: false } } }); assert.deepEqual(results.violations.map((v) => v.id), []);
  ctx.query = new URLSearchParams(`bundle=${b.id}`); ctx.state = env.store.state; view.replaceChildren(renderActionBundles(ctx)); assert.ok(view.textContent.includes('Terminal evidence by action'));
  results = await dom.window.axe.run(view, { rules: { region: { enabled: false } } }); assert.deepEqual(results.violations.map((v) => v.id), []);
  const nav = document.getElementById('sidebar-nav'); const built = buildSeats(env.store.state, { now: NOW }); const seat = activeSeat(built); const compiled = compileDisclosure(env.store.state, seat, built, { now: NOW, settings: env.store.state.settings });
  const allowed = (i) => workspaceRouteVerdict(i.route, seat, { state: env.store.state, built, now: NOW, settings: env.store.state.settings, compiled }).allow;
  nav.replaceChildren(renderWorkspaceNav({ groups: NAV, route: 'mission', seat, allowed, counts: {}, isAggregate: () => false, currentHref: '#/mission?panel=execution' }));
  assert.ok(nav.querySelector('#workspace-nav-search')); assert.ok(nav.querySelector('a[href="#/mission?panel=execution"]')); assert.ok(nav.textContent.includes('Coaching cadence'));
  results = await dom.window.axe.run(nav, { rules: { region: { enabled: false } } }); assert.deepEqual(results.violations.map((v) => v.id), []);
  dom.window.close();
});

test('navigation is altitude-specific, searchable, and never offers a route the router refuses', () => {
  for (const [seatId, expectDuty, forbid] of [['lead1', 'Coaching cadence', 'board'], ['leader', 'Board', 'oneonones']]) {
    const state = fixture(seatId); const built = buildSeats(state, { now: NOW }); const seat = activeSeat(built);
    const compiled = compileDisclosure(state, seat, built, { now: NOW, settings: state.settings });
    const allowed = (i) => workspaceRouteVerdict(i.route, seat, { state, built, now: NOW, settings: state.settings, compiled }).allow;
    const model = buildWorkspaceNav(NAV, { route: 'mission', seat, allowed });
    assert.ok(model.sections.some((s) => s.section.toLowerCase().includes(expectDuty.toLowerCase())), `${seatId} duty`);
    const dutyItems = model.sections.filter((s) => !s.catalogue).flatMap((s) => s.items.map((i) => i.route));
    assert.equal(dutyItems.includes(forbid), false, `${seatId} duty surface must not lead with ${forbid}`);
    const offered = model.sections.flatMap((s) => s.items.map((i) => i.route));
    if (seatId === 'leader' && offered.includes('oneonones')) assert.notEqual(workspaceRouteVerdict('oneonones', seat, { state, built, now: NOW, settings: state.settings, compiled }).posture, 'detail', 'chief may read a span aggregate, never individual 1:1 detail');
    assert.ok(offered.every((r) => allowed({ route: r })));
    const search = buildWorkspaceNav(NAV, { route: 'mission', seat, allowed, query: 'settings' });
    assert.equal(search.mode, 'search'); assert.ok(search.sections[0].items.some((i) => i.route === 'settings'));
  }
});
