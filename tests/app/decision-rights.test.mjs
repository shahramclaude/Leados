/**
 * tests/app/decision-rights.test.mjs — ADR-0078, Session 118.
 * Decision Rights Exchange: bounded authority contracts over existing work.
 *
 * Claims pinned here:
 *  1. Schema v84 is additive; malformed contracts are refused, not repaired.
 *  2. Routing reuses the reporting tree: down/up only, LCA for cross-span,
 *     rank floors, real calendar dates, budget currency/headroom/period.
 *  3. The lifecycle is two-sided: offer → explicit accept → evidence deliver →
 *     sender verify. Acceptance opens a DACI record and (below the root) an
 *     owned task; delivery is not verification.
 *  4. Spending authority encumbers a real budget line on acceptance, posts the
 *     recorded actual on verification, and releases only when no actual exists.
 *  5. Return/revoke/expiry/scope/budget drift opens a named recovery path and
 *     grades the acceptance decision bad rather than leaving it pending.
 *  6. Permissions: only the sender/receiver seats may act; the operator view
 *     cannot accept for someone else; evidence refs must be visible records.
 *  7. Roll-up partitions by receiving span (no ancestor double count); rank ≥4
 *     non-parties see redacted detail; CSV/brief are aggregate-only.
 *  8. Automatic reconciliation is pausable; explicit scan always runs.
 *  9. Four panels render axe-clean; the succession brief download regression is
 *     pinned (object args + honest blocked-download fallback).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import { SCHEMA_VERSION, createEmptyState, migrate, normalizeState, MIGRATIONS } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { LINK_ENTITY_COLLECTIONS, LINK_RELATIONS } from '../../app/core/domain/cases.js';
import { MANDATE_STATUSES, MANDATE_ACTIONS } from '../../app/core/domain/mandateRegistry.js';
import { normalizeMandates } from '../../app/core/domain/mandateSchema.js';
import { mandateReport, rollupMandates, mandateSourceRoute } from '../../app/core/domain/mandates.js';
import { renderMandates } from '../../app/views/mandates.js';
import { renderSuccession } from '../../app/views/succession.js';
import { exportWorkspaceCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { successionReport, successionView } from '../../app/core/domain/succession.js';

const NOW = new Date('2026-11-03T10:00:00.000Z');
const ago = (d) => new Date(NOW.getTime() - d * 86400000).toISOString().slice(0, 10);
const ahead = (d) => new Date(NOW.getTime() + d * 86400000).toISOString().slice(0, 10);
const clone = (v) => JSON.parse(JSON.stringify(v));

function fixture(overrides = {}) {
  const state = createEmptyState(NOW.toISOString());
  const settings = { ...state.settings, leaderName: 'Dana Whitfield', chainLeaderAltitude: 'chief', activeSeatId: null, seatAutoPropagate: true, mandateAutoPropagate: true };
  for (const key of Object.keys(settings)) if (/AutoPropagate$/.test(key) && !['seatAutoPropagate', 'mandateAutoPropagate'].includes(key)) settings[key] = false;
  state.settings = { ...settings, ...overrides };
  state.people = [
    { id: 'vp1', name: 'Rina Okafor', role: 'VP', level: 'vp', managerId: null, status: 'active', createdAt: ago(500) },
    { id: 'dir1', name: 'Samuel Park', role: 'Director', level: 'director', managerId: 'vp1', status: 'active', createdAt: ago(500) },
    { id: 'mgr1', name: 'Mei Chen', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active', createdAt: ago(500) },
    { id: 'lead1', name: 'Priya Raman', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active', createdAt: ago(500) },
    { id: 'lead2', name: 'Jordan Lee', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active', createdAt: ago(500) },
    { id: 'ic1', name: 'Ari Klein', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active', createdAt: ago(400) },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active', createdAt: ago(400) },
    { id: 'ic3', name: 'Cy Orlov', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active', createdAt: ago(400) },
  ];
  state.cases = [
    { id: 'case-1', title: 'Stabilise the handover rota', kind: 'incident', status: 'open', ownerId: 'ic1', involvedPersonIds: ['ic2'], openedOn: ago(2), reviewOn: ahead(5), fmea: { severity: 4 }, createdAt: ago(2) },
    { id: 'case-2', title: 'Second-shift cover gap', kind: 'incident', status: 'open', ownerId: 'ic3', involvedPersonIds: [], openedOn: ago(3), reviewOn: ahead(5), fmea: { severity: 3 }, createdAt: ago(3) },
  ];
  state.budgets = [
    { id: 'bud-1', name: 'Operations envelope', currency: 'DKK', limit: 10000, status: 'active', ownerId: 'dir1', startsOn: ago(30), endsOn: ahead(120), lines: [], autoPropagate: false, createdAt: ago(30), updatedAt: ago(30) },
  ];
  return state;
}

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

function newApp(seed = fixture()) {
  let counter = 0;
  let now = NOW;
  const store = createStore({ storage: memoryStorage(), now: () => now, idFactory: (p) => `${p}-t${(counter += 1)}` });
  store.load();
  store.update((draft) => Object.assign(draft, seed), { type: 'fixture.loaded', entity: 'workspace' });
  const api = createApi(store, { now: () => now, idFactory: (p) => `${p}-t${(counter += 1)}` });
  return { store, api, setNow: (d) => { now = d; }, state: () => store.state };
}

const offer = (extra = {}) => ({
  sourceType: 'case', sourceId: 'case-1', toSeatId: 'lead1',
  outcome: 'Publish a rota both shifts can run without escalation',
  stopCondition: 'Return if the affected span or expiry would be exceeded',
  effortDays: 1, expiresOn: ahead(7), actions: ['replan'], capacityNote: 'Receiver will drop the Friday audit to make room.', ...extra,
});

function propose(app, from = 'mgr1', extra = {}) {
  assert.ok(app.api.setActiveSeat(from).ok);
  const result = app.api.proposeMandate(offer(extra));
  assert.ok(result.ok, result.error);
  return result.id;
}

function accept(app, id, to = 'lead1') {
  assert.ok(app.api.setActiveSeat(to).ok);
  const result = app.api.acceptMandate(id, { note: 'I accept the outcome, limits and return trigger.', capacityNote: 'Friday audit dropped; rota work fits the week.' });
  assert.ok(result.ok, result.error);
}

function deliver(app, id, to = 'lead1', extra = {}) {
  assert.ok(app.api.setActiveSeat(to).ok);
  const result = app.api.deliverMandate(id, { evidence: 'Both shifts ran the new rota for three days without escalation.', ...extra });
  assert.ok(result.ok, result.error);
}

/* ---------------------------------------------------------------- 1. schema */

test('1. schema v84 is additive and fail-closed', () => {
  assert.equal(SCHEMA_VERSION, 84);
  const migrated = migrate({ schemaVersion: 83, people: [] });
  assert.equal(migrated.raw.schemaVersion, 84);
  assert.deepEqual(migrated.raw.mandates, []);
  assert.equal(migrated.applied.at(-1), '83 → 84');
  assert.equal(typeof MIGRATIONS[83], 'function');
  const empty = createEmptyState(NOW.toISOString());
  assert.deepEqual(empty.mandates, []);
  assert.equal(empty.settings.mandateAutoPropagate, true);
  assert.equal(LINK_ENTITY_COLLECTIONS.mandate, 'mandates');
  for (const rel of ['authorizes', 'binds-receiver', 'recovers-authority']) assert.ok(LINK_RELATIONS.includes(rel));
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-1).name, 'seatRule');
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((r) => r.name === 'mandateRule'));
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'decision-rights'));

  const warnings = [];
  const rows = normalizeMandates([
    null, { id: 'x' },
    { id: 'm1', sourceId: 'case-1', sourceType: 'case', fromSeatId: 'mgr1', toSeatId: 'lead1', status: 'active', outcome: 'A real outcome', actions: ['replan'], effortDays: 1, createdAt: NOW.toISOString(), expiresOn: ahead(7), history: [{ at: NOW.toISOString(), status: 'active', actorSeatId: 'lead1', note: 'ok' }] },
    { id: 'm1', sourceId: 'case-1', sourceType: 'case', fromSeatId: 'mgr1', toSeatId: 'lead1', status: 'active', outcome: 'duplicate', actions: ['replan'], effortDays: 1, createdAt: NOW.toISOString(), expiresOn: ahead(7), history: [{ at: NOW.toISOString(), status: 'active', actorSeatId: 'lead1', note: 'ok' }] },
    { id: 'm2', sourceId: 'case-1', sourceType: 'case', fromSeatId: 'mgr1', toSeatId: 'lead1', status: 'active', outcome: 'Spend without currency', actions: ['spend'], spendCeiling: 10, currency: '', effortDays: 1, createdAt: NOW.toISOString(), expiresOn: ahead(7), history: [{ at: NOW.toISOString(), status: 'active', actorSeatId: 'lead1', note: 'ok' }] },
  ], warnings);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'm1');
  assert.ok(warnings.length >= 2);
  assert.deepEqual(MANDATE_STATUSES, ['proposed', 'active', 'delivered', 'completed', 'returned', 'expired', 'revoked']);
  assert.ok(Object.hasOwn(MANDATE_ACTIONS, 'spend'));
});

/* ---------------------------------------------------------------- 2. routing */

test('2. routing refuses operator, peer, invalid date, rank and budget violations', () => {
  const app = newApp();
  assert.equal(app.api.proposeMandate(offer()).ok, false, 'operator cannot offer');
  app.api.setActiveSeat('lead1');
  assert.equal(app.api.previewMandate(offer({ toSeatId: 'lead2' })).ok, false, 'peer span refused');
  app.api.setActiveSeat('mgr1');
  assert.equal(app.api.previewMandate(offer({ expiresOn: '2027-02-31' })).ok, false, 'rollover date refused');
  assert.equal(app.api.previewMandate(offer({ actions: ['spend'], spendCeiling: 10, currency: 'DKK', budgetId: 'bud-1' })).ok, false, 'spend below director refused');
  app.api.setActiveSeat('dir1');
  const spend = { sourceType: 'case', sourceId: 'case-1', toSeatId: 'vp1', outcome: 'Approve a bounded supplier exception', stopCondition: 'Return if the ceiling would be exceeded', effortDays: 1, expiresOn: ahead(7), actions: ['spend'], spendCeiling: 500, currency: 'DKK', budgetId: 'bud-1', capacityNote: 'Director will pause the vendor review.' };
  const preview = app.api.previewMandate(spend);
  assert.ok(preview.ok, preview.error);
  assert.equal(app.api.previewMandate({ ...spend, currency: 'EUR' }).ok, false, 'currency mismatch');
  assert.equal(app.api.previewMandate({ ...spend, spendCeiling: 20000 }).ok, false, 'headroom');
  assert.equal(app.api.previewMandate({ ...spend, expiresOn: ahead(200) }).ok, false, 'outlives budget');
});

/* ---------------------------------------------------------------- 3. lifecycle */

test('3. two-sided lifecycle opens DACI + task + typed edges + vertical roll-up in one transaction', () => {
  const app = newApp();
  const id = propose(app);
  let m = app.state().mandates.find((r) => r.id === id);
  assert.equal(m.status, 'proposed');
  assert.ok(app.state().events.some((e) => e.type === 'mandate.proposed' && e.entityId === id), 'audit carries the real id');
  accept(app, id);
  m = app.state().mandates.find((r) => r.id === id);
  assert.equal(m.status, 'active');
  assert.ok(m.decisionId && m.taskId);
  const decision = app.state().decisions.find((d) => d.id === m.decisionId);
  assert.equal(decision.chosen, 'Accept the bounded contract');
  assert.equal(decision.outcome, 'pending');
  const task = app.state().delegations.find((d) => d.id === m.taskId);
  assert.equal(task.personId, 'lead1');
  assert.equal(task.authority, 'recommend');
  const links = app.state().links;
  assert.ok(links.some((l) => l.sourceType === 'case' && l.targetType === 'mandate' && l.relation === 'authorizes'));
  assert.ok(links.some((l) => l.sourceType === 'mandate' && l.targetType === 'person' && l.relation === 'binds-receiver'));
  assert.ok(links.some((l) => l.sourceType === 'mandate' && l.targetType === 'delegation' && l.relation === 'tracks-followup'));
  assert.ok(links.some((l) => l.sourceType === 'mandate' && l.targetType === 'decision' && l.relation === 'decides'));
  // The acceptance task rolls up the hierarchy through the existing seat rule.
  for (const ancestor of ['mgr1', 'dir1', 'vp1']) {
    assert.ok(links.some((l) => l.sourceType === 'delegation' && l.sourceId === m.taskId && l.targetId === ancestor && l.relation === 'rolls-up-to'), `rolls up to ${ancestor}`);
  }
  deliver(app, id);
  m = app.state().mandates.find((r) => r.id === id);
  assert.equal(m.status, 'delivered');
  assert.equal(app.state().decisions.find((d) => d.id === m.decisionId).outcome, 'pending', 'delivery is not verification');
  assert.ok(app.api.setActiveSeat('mgr1').ok);
  assert.ok(app.api.verifyMandate(id, { note: 'Evidence meets the contracted outcome.' }).ok);
  m = app.state().mandates.find((r) => r.id === id);
  assert.equal(m.status, 'completed');
  assert.equal(app.state().decisions.find((d) => d.id === m.decisionId).outcome, 'good');
  assert.equal(app.state().delegations.find((d) => d.id === m.taskId).status, 'done');
  const before = app.state().links.length;
  app.api.scanMandates();
  assert.equal(app.state().links.length, before, 'scan is idempotent');
  assert.equal(m.history.length, 4);
});

test('4. capacity unknown requires a plan; accept re-checks headroom and source fingerprint', () => {
  const app = newApp();
  app.api.setActiveSeat('mgr1');
  assert.equal(app.api.proposeMandate(offer({ capacityNote: '' })).ok, false);
  const id = propose(app);
  app.api.setActiveSeat('lead1');
  assert.equal(app.api.acceptMandate(id, { note: 'I accept the bounded outcome.', capacityNote: '' }).ok, false);
  // Source edits between offer and acceptance invalidate the fingerprint.
  app.api.updateSettings({ mandateAutoPropagate: false });
  app.store.update((draft) => { draft.cases.find((c) => c.id === 'case-1').title = 'A different outcome'; }, { type: 'case.updated', entity: 'case', entityId: 'case-1' });
  const result = app.api.acceptMandate(id, { note: 'I accept the bounded outcome.', capacityNote: 'Room made by dropping the audit.' });
  assert.equal(result.ok, false);
  assert.match(result.error, /changed/i);
});

/* ---------------------------------------------------------------- 5. finance */

test('5. spending authority encumbers, posts actuals, and releases only without an actual', () => {
  const app = newApp();
  app.api.setActiveSeat('dir1');
  const spend = { sourceType: 'case', sourceId: 'case-1', toSeatId: 'vp1', outcome: 'Approve a bounded supplier exception', stopCondition: 'Return if the ceiling would be exceeded', effortDays: 1, expiresOn: ahead(7), actions: ['spend'], spendCeiling: 500, currency: 'DKK', budgetId: 'bud-1', capacityNote: 'Director will pause the vendor review.' };
  const proposed = app.api.proposeMandate(spend);
  assert.ok(proposed.ok, proposed.error);
  assert.equal(app.state().budgets[0].lines.length, 0, 'offer does not encumber');
  accept(app, proposed.id, 'vp1');
  let m = app.state().mandates.find((r) => r.id === proposed.id);
  let line = app.state().budgets[0].lines.find((l) => l.id === m.budgetLineId);
  assert.equal(line.status, 'committed');
  assert.equal(line.committedAmount, 500);
  assert.equal(line.actualAmount, null);
  deliver(app, proposed.id, 'vp1', { actualSpend: 320 });
  assert.ok(app.api.setActiveSeat('dir1').ok);
  assert.ok(app.api.verifyMandate(proposed.id, { note: 'Receipt matches the contracted ceiling.' }).ok);
  line = app.state().budgets[0].lines.find((l) => l.id === m.budgetLineId);
  assert.equal(line.status, 'spent');
  assert.equal(line.actualAmount, 320);

  // Revoke after delivery but before verification: the recorded actual survives.
  app.api.setActiveSeat('dir1');
  const second = app.api.proposeMandate({ ...spend, sourceId: 'case-2', toSeatId: 'vp1' });
  assert.ok(second.ok, second.error);
  accept(app, second.id, 'vp1');
  deliver(app, second.id, 'vp1', { actualSpend: 100 });
  app.api.setActiveSeat('dir1');
  assert.ok(app.api.revokeMandate(second.id, { note: 'Supplier withdrew; withdraw authority.' }).ok);
  m = app.state().mandates.find((r) => r.id === second.id);
  line = app.state().budgets[0].lines.find((l) => l.id === m.budgetLineId);
  assert.equal(line.status, 'spent', 'a recorded actual is never erased by revocation');
  assert.equal(line.actualAmount, 100);

  // Revoke before delivery: encumbrance released, no invented actual.
  app.api.setActiveSeat('dir1');
  const third = app.api.proposeMandate({ ...spend, sourceId: 'case-1', toSeatId: 'vp1' });
  assert.ok(third.ok, third.error);
  accept(app, third.id, 'vp1');
  app.api.setActiveSeat('dir1');
  assert.ok(app.api.revokeMandate(third.id, { note: 'No longer needed this quarter.' }).ok);
  m = app.state().mandates.find((r) => r.id === third.id);
  line = app.state().budgets[0].lines.find((l) => l.id === m.budgetLineId);
  assert.equal(line.status, 'released');
  assert.equal(line.actualAmount, null);
});

/* ---------------------------------------------------------------- 6. recovery */

test('6. return, expiry and drift open recovery and grade the acceptance decision', () => {
  const app = newApp();
  const id = propose(app);
  accept(app, id);
  app.api.setActiveSeat('lead1');
  assert.ok(app.api.returnMandate(id, { note: 'Cannot make room this week.' }).ok);
  let m = app.state().mandates.find((r) => r.id === id);
  assert.equal(m.status, 'returned');
  assert.ok(m.recoveryTaskId);
  assert.equal(app.state().delegations.find((d) => d.id === m.recoveryTaskId).personId, 'mgr1');
  assert.equal(app.state().decisions.find((d) => d.id === m.decisionId).outcome, 'bad');

  const expired = propose(app);
  accept(app, expired);
  app.setNow(new Date('2026-11-20T10:00:00.000Z'));
  app.api.scanMandates();
  m = app.state().mandates.find((r) => r.id === expired);
  assert.equal(m.status, 'expired');
  assert.ok(m.recoveryTaskId);

  app.store.update((draft) => { draft.cases.push({ id: 'case-3', title: 'Fresh drift source', kind: 'incident', status: 'open', ownerId: 'ic1', involvedPersonIds: ['ic2'], openedOn: '2026-11-19', reviewOn: '2026-11-26', fmea: { severity: 3 }, createdAt: '2026-11-19T09:00:00.000Z' }); }, { type: 'case.created', entity: 'case', entityId: 'case-3' });
  const drift = propose(app, 'mgr1', { sourceId: 'case-3', expiresOn: '2026-11-27' });
  accept(app, drift);
  app.store.update((draft) => { draft.cases.find((c) => c.id === 'case-3').title = 'Scope changed after acceptance'; }, { type: 'case.updated', entity: 'case', entityId: 'case-3' });
  m = app.state().mandates.find((r) => r.id === drift);
  assert.equal(m.status, 'revoked', 'fingerprint drift revokes on the next write');
  assert.ok(m.recoveryTaskId);
});

/* ---------------------------------------------------------------- 7. permissions */

test('7. only contract parties may act; evidence refs must be visible existing records', () => {
  const app = newApp();
  const id = propose(app);
  app.api.setActiveSeat('dir1');
  assert.equal(app.api.acceptMandate(id, { note: 'Not my contract to accept.' }).ok, false);
  accept(app, id);
  app.api.setActiveSeat('mgr1');
  assert.equal(app.api.deliverMandate(id, { evidence: 'Sender cannot deliver for the receiver.' }).ok, false);
  app.api.setActiveSeat('lead1');
  assert.equal(app.api.deliverMandate(id, { evidence: 'A sufficiently long evidence note.', evidenceRefs: 'not-an-array' }).ok, false);
  assert.equal(app.api.deliverMandate(id, { evidence: 'A sufficiently long evidence note.', evidenceRefs: [{ type: 'case', id: 'does-not-exist' }] }).ok, false);
  assert.ok(app.api.deliverMandate(id, { evidence: 'Both shifts ran the rota without escalation.' }).ok, 'own task is automatic evidence');
  app.api.setActiveSeat('lead1');
  assert.equal(app.api.verifyMandate(id, { note: 'Receiver cannot verify their own delivery.' }).ok, false);
});

/* ---------------------------------------------------------------- 8. roll-up / disclosure */

test('8. receiver-partitioned roll-up, executive redaction, aggregate CSV and brief', () => {
  const app = newApp();
  const a = propose(app, 'mgr1', { toSeatId: 'lead1' });
  const b = propose(app, 'mgr1', { sourceId: 'case-2', toSeatId: 'lead2' });
  accept(app, a, 'lead1');
  accept(app, b, 'lead2');
  const root = rollupMandates(app.state(), 'leader', { now: NOW });
  assert.equal(root.total, 2);
  const sumChildren = (node) => node.own + node.children.reduce((n, c) => n + sumChildren(c), 0);
  assert.equal(sumChildren(root), root.total, 'no ancestor double count');
  app.api.setActiveSeat('vp1');
  const exec = app.api.mandateRead();
  assert.equal(exec.rows.length, 2);
  for (const row of exec.rows) {
    assert.match(row.displayTitle, /withheld/i);
    assert.match(row.outcome, /withheld/i);
    assert.equal(row.sourceRoute, '#/mandates?panel=method');
  }
  app.api.setActiveSeat('mgr1');
  const party = app.api.mandateRead();
  assert.ok(party.rows.every((r) => !/withheld/i.test(r.displayTitle)));
  assert.equal(mandateSourceRoute({ sourceType: 'case', sourceId: 'case-1' }), '#/cases/case-1');
  const csv = exportWorkspaceCsv(app.state(), 'decision-rights', { now: NOW });
  assert.ok(csv.ok);
  const text = csv.csv || csv.text || '';
  assert.ok(!/case-1|Ari Klein|Stabilise/.test(text), 'aggregate export carries no ids/names/titles');
  const brief = app.api.mandateBriefText();
  assert.ok(!/Ari Klein|case-1/.test(brief));
});

/* ---------------------------------------------------------------- 9. pause / scan */

test('9. automatic reconciliation is pausable; explicit scan always runs', () => {
  const app = newApp();
  const id = propose(app);
  accept(app, id);
  app.api.updateSettings({ mandateAutoPropagate: false });
  app.setNow(new Date('2026-11-20T10:00:00.000Z'));
  app.store.update((draft) => { draft.settings.teamName = 'Unrelated edit'; }, { type: 'settings.updated', entity: 'workspace' });
  assert.equal(app.state().mandates.find((r) => r.id === id).status, 'active', 'paused automation does not expire');
  app.api.scanMandates();
  assert.equal(app.state().mandates.find((r) => r.id === id).status, 'expired', 'explicit scan reconciles');
});

/* ---------------------------------------------------------------- 10. UI + download regression */

function bootDocument() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => consoleErrors.push(e.message));
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  Object.assign(globalThis, { window, document: window.document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement, Event: window.Event, localStorage: window.localStorage, URL: window.URL, Blob: window.Blob });
  return { window, document: window.document, consoleErrors };
}

test('10. four panels render axe-clean; succession brief download uses object args and honest fallback', async () => {
  const { window, document, consoleErrors } = bootDocument();
  const axe = (await import('axe-core')).default;
  const app = newApp();
  propose(app);
  const ctx = { state: app.state(), now: NOW, query: new URLSearchParams(), navigate: () => {}, refresh: () => {}, api: app.api };
  for (const panel of ['inbox', 'route', 'rollup', 'method']) {
    ctx.query = new URLSearchParams({ panel });
    const host = document.getElementById('view');
    host.innerHTML = '';
    const node = renderMandates(ctx);
    host.append(node);
    assert.ok(node.querySelector('h1'));
    assert.ok(!/undefined|NaN|\[object Object\]/.test(node.textContent), `${panel} placeholder`);
    const results = await axe.run(node, { runOnly: ['wcag2a', 'wcag2aa'] });
    assert.equal(results.violations.length, 0, `${panel}: ${results.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`);
  }

  // Succession export regression: capture the blob written by downloadText.
  const state = fixture();
  const report = successionReport(state, { now: NOW, settings: state.settings });
  const sctx = { state, now: NOW, query: new URLSearchParams({ panel: 'bench' }), navigate: () => {}, refresh: () => {}, api: {
    successionRead: () => ({ ...report, view: successionView(report, { seat: null, nodeId: null }) }),
    successionBriefText: () => 'Identity-free bench brief.',
  } };
  const host = document.getElementById('view');
  host.innerHTML = '';
  host.append(renderSuccession(sctx));
  let captured = null;
  const originalCreate = window.URL.createObjectURL;
  const originalRevoke = window.URL.revokeObjectURL;
  window.URL.createObjectURL = (blob) => { captured = blob; return 'blob:mock'; };
  window.URL.revokeObjectURL = () => {};
  const exportButton = [...host.querySelectorAll('button')].find((b) => /Export brief/.test(b.textContent));
  assert.ok(exportButton);
  exportButton.click();
  assert.ok(captured, 'downloadText received {filename,text,mime} and produced a blob');
  assert.equal(await captured.text(), 'Identity-free bench brief.');
  // Blocked download must not claim success; it opens a copyable fallback.
  window.URL.createObjectURL = () => { throw new Error('blocked'); };
  exportButton.click();
  assert.ok(document.querySelector('textarea[readonly]'), 'blocked download offers a copyable fallback');
  // Leave the mock revoke in place: downloadText schedules a 1s revoke that
  // would otherwise fire after the test restored jsdom's missing implementation.
  void originalCreate; void originalRevoke;
  const realErrors = consoleErrors.filter((m) => !/getContext\(\) method/.test(m));
  assert.deepEqual(realErrors, []);
});
