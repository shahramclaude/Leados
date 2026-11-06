/** ADR-0105: the note, rehearsal, atomic adoption, hierarchy and privacy contract. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildMission } from '../../app/core/domain/mission.js';
import { buildSeats } from '../../app/core/domain/seat.js';
import { normalizeMissionCaptures } from '../../app/core/domain/missionCaptureSchema.js';
import { analyzeCapture } from '../../app/core/domain/missionCapture.js';
import { rehearseMissionCapture } from '../../app/services/missionCaptureRehearsal.js';
import { runMissionCaptureRehearsal } from '../../app/ui/response-worker.js';
import { scopedViewState } from '../../app/core/domain/viewScope.js';
import { renderMission } from '../../app/views/mission.js';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-11-06T12:00:00.000Z');
const clone = (v) => JSON.parse(JSON.stringify(v));
const NOTE = 'The supplier delivery is late again and the team is overloaded. Ari Klein says the billing backlog is blocking handoffs. Jordan Lead reports a separate peer delay.';
function fixture(seat = 'lead1') {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Root', chainLeaderAltitude: 'chief', activeSeatId: seat, missionCellFloor: 5 };
  state.people = [
    ['vp1', null, 'vp', 'Rina VP'], ['dir1', 'vp1', 'director', 'Sam Director'], ['mgr1', 'dir1', 'manager', 'Mei Manager'],
    ['lead1', 'mgr1', 'lead', 'Priya Lead'], ['lead2', 'mgr1', 'lead', 'Jordan Lead'], ['ic1', 'lead1', 'ic', 'Ari Klein'], ['ic3', 'lead2', 'ic', 'Cy Orlov'],
  ].map(([id, managerId, level, name]) => ({ id, name, role: level, level, managerId, status: 'active' }));
  state.budgets = [{ id: 'b-vp', name: 'VP envelope', label: 'VP envelope', ownerId: 'vp1', currency: 'USD', limit: 50000, status: 'active', lines: [] }];
  return normalizeState(state, { now: NOW }).state;
}
function setup({ state = fixture(), rules, failWrites = false } = {}) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { if (failWrites) throw new Error('Quota exceeded'); data.set(k, String(v)); }, removeItem: (k) => data.delete(k) };
  let seq = 0; const idFactory = (p) => `${p}-flow-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory, ...(rules ? { postCommitRules: rules } : {}) }); store.load();
  return { store, storage, api: createApi(store, { now: () => NOW, idFactory }) };
}
function prepare(env, extra = {}) {
  const result = env.api.missionCapturePrepare({ text: NOTE, title: 'Billing backlog recovery', ownerId: env.store.state.settings.activeSeatId === 'leader' ? 'vp1' : env.store.state.settings.activeSeatId, kinds: ['decision', 'delegation'], reviewOn: '2026-11-13', severity: 7, ...extra });
  assert.equal(result.ok, true, result.error); return result.id;
}
function rehearsed(env, id) {
  const result = rehearseMissionCapture(env.store.state, id, { now: NOW }); assert.equal(result.ok, true, result.error);
  const saved = env.api.saveMissionCapturePreview(id, result); assert.equal(saved.ok, true, saved.error); return result;
}
function adopted(env, id) { const result = env.api.missionCaptureCommit(id, env.store.state.meta.revision, true); assert.equal(result.ok, true, result.error); return result; }

test('v107 is additive and fail-closed: no historical note is invented, corrupt approval loses authority', () => {
  assert.equal(SCHEMA_VERSION, 110);
  const old = { schemaVersion: 106, settings: { leaderName: 'Keep' }, cases: [{ id: 'keep-case' }] };
  const migrated = migrate(old); assert.equal(migrated.raw.schemaVersion, 110); assert.deepEqual(migrated.raw.missionCaptures, []); assert.equal(migrated.raw.cases[0].id, 'keep-case');
  assert.deepEqual(migrate(migrated.raw).applied, []);
  const env = setup(); const id = prepare(env); rehearsed(env, id);
  const raw = clone(env.store.state); raw.missionCaptures[0].preview = { failureCount: 4 };
  const warnings = []; const normalized = normalizeMissionCaptures(raw.missionCaptures, raw, warnings, { now: NOW });
  assert.equal(normalized[0].status, 'draft'); assert.ok(warnings.length);
  raw.missionCaptures[0].status = 'adopted'; raw.missionCaptures[0].caseId = 'missing';
  assert.deepEqual(normalizeMissionCaptures(raw.missionCaptures, raw, [], { now: NOW }), []);
});

test('the public analyzer never returns out-of-span person matches; confidential conflict text is refused without a write', () => {
  const env = setup(); const before = clone(env.store.state);
  const result = env.api.missionCaptureAnalyze(NOTE); assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.matchedOwnerIds, ['ic1']); assert.equal(result.analysis, undefined); assert.equal(JSON.stringify(result).includes('"personId"'), false);
  const internal = analyzeCapture(NOTE, env.store.state, { now: NOW }); assert.ok(internal.analysis.entities.people.length >= 2);
  const blocked = env.api.missionCapturePrepare({ text: 'Confidential mediation: the grievance alleges harassment and needs a private conflict process.', ownerId: 'lead1' });
  assert.equal(blocked.ok, false); assert.equal(blocked.code, 'privacy-wall'); assert.deepEqual(env.store.state, before);
});

test('altitude duties constrain the command vocabulary and money is never inferred from a loss', () => {
  for (const [seat, rank] of [['lead1', 1], ['mgr1', 2], ['dir1', 3], ['vp1', 4], ['leader', 5]]) {
    const env = setup({ state: fixture(seat) }); const m = buildMission(env.store.state, { now: NOW }); assert.equal(m.seat.rank, rank);
    assert.equal(env.api.missionCapturePrepare({ text: NOTE, ownerId: seat === 'leader' ? 'vp1' : seat, kinds: ['comms'] }).ok, false);
    if (rank < 4) assert.equal(env.api.missionCapturePrepare({ text: NOTE, ownerId: seat, kinds: ['budget'], budgetId: 'b-vp', amount: 100 }).ok, false);
    if (rank === 4) {
      assert.equal(env.api.missionCapturePrepare({ text: `${NOTE} The delay may cost USD 10000.`, ownerId: 'vp1', kinds: ['budget'], budgetId: 'b-vp' }).ok, false);
      const id = prepare(env, { ownerId: 'vp1', kinds: ['decision', 'budget'], budgetId: 'b-vp', amount: 1200 }); rehearsed(env, id); const result = adopted(env, id);
      assert.ok(env.store.state.budgets[0].lines.some((l) => l.committedAmount === 1200)); assert.ok(result.preview.changes.some((c) => c.collection === 'budgets'));
    }
  }
});

test('one reviewed adoption creates the case, actions, typed cross-module links and every ancestor roll-up; the note does not travel up', () => {
  const env = setup(); const id = prepare(env); const preview = rehearsed(env, id);
  assert.equal(preview.preview.failureCount, 0); assert.ok(preview.preview.changes.some((c) => c.collection === 'cases' && c.created === 1));
  assert.equal(env.store.state.cases.length, 0, 'rehearsal writes nothing live');
  assert.equal(env.api.missionCaptureCommit(id, env.store.state.meta.revision, false).ok, false);
  const result = adopted(env, id); const s = env.store.state; const capture = s.missionCaptures[0];
  assert.equal(capture.status, 'adopted'); assert.equal(s.cases.length, 1); assert.equal(s.actionBundles.length, 1); assert.ok(s.decisions.length >= 1); assert.ok(s.delegations.length >= 1);
  assert.equal(s.cases[0].summary.includes(NOTE), false); assert.equal(JSON.stringify(s.events).includes(NOTE), false);
  for (const ancestor of ['mgr1', 'dir1', 'vp1', 'leader']) assert.ok(s.links.some((l) => l.sourceType === 'missioncapture' && l.relation === 'rolls-up-to' && l.targetId === ancestor), ancestor);
  assert.ok(s.links.some((l) => l.sourceType === 'missioncapture' && l.relation === 'responds-to' && l.targetId === result.caseId));
  assert.ok(s.links.some((l) => l.sourceType === 'missioncapture' && l.relation === 'coordinates' && l.targetId === result.bundleId));
  assert.deepEqual(capture.preview.changes, result.preview.changes); assert.deepEqual(s.actionBundles[0].actual.changes, result.preview.changes);
  assert.equal(env.api.setActiveSeat('mgr1').ok, true); const upward = env.api.missionRead(); assert.deepEqual(upward.captures, []); assert.equal(env.api.missionCaptureRead(id).ok, false);
  const built = buildSeats(s, { now: NOW }); assert.deepEqual(scopedViewState(s, { seat: built.byId.get('mgr1'), built }, { now: NOW }).missionCaptures, []);
  env.api.setActiveSeat('lead1'); assert.equal(env.api.missionCaptureReceipt(id).text.includes(result.caseId), true);
});

test('stale revisions, changed source facts and forged footprints refuse adoption without a partial write', () => {
  const env = setup(); const id = prepare(env); const preview = rehearsed(env, id);
  env.api.updateSettings({ bundleAutoPropagate: false });
  assert.equal(env.api.missionCaptureCommit(id, env.store.state.meta.revision, true).ok, false);
  rehearsed(env, id); env.api.updatePerson('ic1', { focus: 'A later coaching fact' });
  assert.equal(env.api.missionCaptureCommit(id, env.store.state.meta.revision, true).ok, false);
  rehearsed(env, id); const forged = clone(preview); forged.preview.changes = [];
  assert.equal(env.api.saveMissionCapturePreview(id, { ...forged, baseRevision: env.store.state.meta.revision }).ok, true);
  const before = clone(env.store.state); const result = env.api.missionCaptureCommit(id, before.meta.revision, true);
  assert.equal(result.ok, false); assert.match(result.error, /differs from the rehearsal|differs from the reviewed rehearsal/); assert.deepEqual(env.store.state, before);
});

test('a failing generalized rule rolls back the case, every action, receipt, event and edge', () => {
  const env = setup(); const id = prepare(env); const preview = rehearseMissionCapture(env.store.state, id, { now: NOW }); assert.equal(preview.ok, true);
  const failing = setup({ state: env.store.state, rules: [() => { throw new Error('Injected capture rule failure'); }] });
  assert.equal(failing.api.saveMissionCapturePreview(id, preview).ok, true);
  const before = clone(failing.store.state); const result = failing.api.missionCaptureCommit(id, before.meta.revision, true);
  assert.equal(result.ok, false); assert.deepEqual(failing.store.state, before); assert.equal(failing.storage.getItem(STORAGE_KEY), JSON.stringify(before));
});

test('withdrawal protects later work and retains the source case; persistence failure is visible', () => {
  const env = setup(); const id = prepare(env); rehearsed(env, id); const result = adopted(env, id);
  const delegation = env.store.state.actionBundles[0].outputs.find((o) => o.kind === 'delegation');
  env.api.checkInDelegation(delegation.id, { date: '2026-11-06', progress: 'blocked', note: 'A real blocker arrived after adoption.' });
  assert.equal(env.api.missionCaptureWithdraw(id, 'The situation changed after adoption.').ok, false); assert.equal(env.store.state.cases.length, 1);
  const fresh = setup(); const freshId = prepare(fresh); rehearsed(fresh, freshId); adopted(fresh, freshId);
  assert.equal(fresh.api.missionCaptureWithdraw(freshId, 'The supplier recovered before any work began.').ok, true); assert.equal(fresh.store.state.cases.length, 1);
  const quota = setup({ failWrites: true }); const qid = prepare(quota); assert.equal(quota.store.state.missionCaptures.length, 1); assert.ok(quota.store.persistError);
  assert.equal(result.saved, true);
});

test('the worker boundary dispatches capture rehearsals and the standalone inline bundle supports them', async () => {
  const env = setup(); const id = prepare(env);
  const messages = []; let payload;
  const workerFactory = () => ({ postMessage: (p) => { payload = p; queueMicrotask(() => worker.onmessage({ data: { requestId: p.requestId, result: { ok: true, captureId: id } } })); }, terminate() {} });
  let worker; worker = workerFactory();
  const result = await runMissionCaptureRehearsal(clone(env.store.state), id, NOW, { workerFactory: () => worker });
  assert.equal(result.ok, true); assert.equal(payload.kind, 'capture'); assert.equal(payload.captureId, id);
  const html = fs.readFileSync(path.resolve(import.meta.dirname, '../../LeadOS-standalone.html'), 'utf8');
  const source = html.match(/<script id="leados-standalone-app">([\s\S]*?)<\/script>/)[1]; const posted = [];
  const context = { console, setTimeout, clearTimeout, URL, Blob, postMessage: (m) => posted.push(m) }; context.self = context; vm.createContext(context);
  vm.runInContext(source, context, { timeout: 10000 }); context.onmessage({ data: { kind: 'capture', requestId: 'offline-capture', state: env.store.state, captureId: id, now: NOW.toISOString() } });
  assert.equal(posted.length, 1); assert.equal(posted[0].result.ok, true, posted[0].result.error); assert.equal(posted[0].result.preview.failureCount, 0);
});

test('Command Flow renders an accessible workbench, disables unreviewed adoption and exposes the adopted receipt', async () => {
  const dom = new JSDOM('<!doctype html><html><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/#/mission?panel=capture', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node; globalThis.Element = dom.window.Element; globalThis.HTMLElement = dom.window.HTMLElement;
  const env = setup(); const id = prepare(env);
  const ctx = { api: env.api, store: env.store, now: NOW, query: new URLSearchParams('panel=capture'), refresh() {}, navigate() {} };
  const view = document.getElementById('view'); view.replaceChildren(renderMission(ctx));
  assert.ok(view.querySelector('#flow-text')); assert.equal(view.querySelector('#flow-adopt').disabled, true); assert.ok(view.textContent.includes('No language model or cloud call'));
  dom.window.eval(AXE_SRC); let results = await dom.window.axe.run(view, { rules: { region: { enabled: false } } }); assert.deepEqual(results.violations.map((v) => v.id), []);
  rehearsed(env, id); adopted(env, id); ctx.query = new URLSearchParams(`panel=capture&capture=${id}`); view.replaceChildren(renderMission(ctx));
  assert.ok(view.textContent.includes('Adopted as one transaction')); assert.ok(view.querySelector('a[href^="#/cases?case="]')); assert.ok(view.querySelector('a[href^="#/bundles?bundle="]'));
  results = await dom.window.axe.run(view, { rules: { region: { enabled: false } } }); assert.deepEqual(results.violations.map((v) => v.id), []);
  dom.window.close();
});
