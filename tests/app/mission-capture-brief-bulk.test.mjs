/**
 * ADR-0119 — register-backed, privacy-scoped bulk briefing on an adopted case.
 *
 * One focused suite for the path this session built: the eligible audience is
 * DERIVED from the register (never typed), a selection is assessed as a whole,
 * and the write is one case transaction whose drafts must match the reviewed
 * previews exactly or nothing is kept.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { rehearseMissionCapture } from '../../app/services/missionCaptureRehearsal.js';
import { SAFE_READS, API_RIGHTS } from '../../app/core/domain/accessGateway.js';
import { BRIEF_BULK_LIMITS, briefCandidates } from '../../app/core/domain/missionCaptureBriefBulk.js';
import { personQueue } from '../../app/core/domain/agendaProvenance.js';
import { renderMission } from '../../app/views/mission.js';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const NOTE = 'The supplier delivery is late again and the billing backlog is blocking handoffs across the shift. The team needs an accountable recovery checkpoint.';
const SECRET = 'PRIVATE_NOTE_BETA_441';
const copy = (v) => JSON.parse(JSON.stringify(v));

const roster = (seat) => {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Chief', chainLeaderAltitude: 'chief', activeSeatId: seat, missionCellFloor: 5 };
  state.people = [
    ['vp1', null, 'vp', 'Rina VP'], ['vp2', null, 'vp', 'Omar VP'],
    ['dir1', 'vp1', 'director', 'Sam Director'], ['dir2', 'vp1', 'director', 'Ira Director'],
    ['dir3', 'vp2', 'director', 'Noor Director'],
    ['mgr1', 'dir1', 'manager', 'Mei Manager'], ['mgr2', 'dir1', 'manager', 'Alex Manager'],
    ['mgr3', 'dir2', 'manager', 'Leo Manager'],
    ['lead1', 'mgr1', 'lead', 'Priya Lead'], ['lead2', 'mgr2', 'lead', 'Tessa Lead'],
  ].map(([id, managerId, level, name]) => ({ id, name, role: level, level, managerId, status: 'active' }));
  const stk = (id, name, role, power, interest, stance, extra = {}) => ({ id, name, role, category: 'external-vendor',
    power, interest, legitimacy: 4, urgency: 4, stance, status: 'active',
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...extra });
  state.stakeholders = [
    // Qualifying: key player (power × interest ≥ 3) or opposing stance.
    stk('stk-vendor', 'Morgan Supplier', 'Vendor operations', 5, 4, 'skeptical'),
    stk('stk-finance', 'Rae Controller', 'Finance business partner', 4, 5, 'neutral'),
    stk('stk-peer-lead', 'Tessa Lead', 'Receiving shift lead', 3, 4, 'blocker', { personId: 'lead2' }),
    // Not qualifying: monitor quadrant, cooperative stance.
    stk('stk-monitor', 'Quiet Analyst', 'Reporting analyst', 1, 2, 'neutral'),
    // Outside this director's span: linked to a person in a peer division.
    stk('stk-peer-div', 'Omar VP', 'Peer division VP', 5, 5, 'blocker', { personId: 'vp2' }),
  ];
  return normalizeState(state, { now: NOW }).state;
};

function setup({ state = roster('dir1'), rules = undefined } = {}) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  let seq = 0;
  const idFactory = (p) => `${p}-bulk-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory, ...(rules ? { postCommitRules: rules } : {}) });
  store.load();
  return { api: createApi(store, { now: () => NOW, idFactory }), store, storage };
}

function adopt(env, seat = 'dir1') {
  assert.equal(env.api.setActiveSeat(seat).ok, true);
  const accountable = seat === 'dir1' ? 'mgr1' : 'dir1';
  const prepared = env.api.missionCapturePrepare({ text: `${NOTE} ${SECRET}`, title: 'Supplier & billing handoff recovery',
    ownerId: accountable, kinds: ['decision', 'delegation'], reviewOn: '2026-11-14', severity: 7 });
  assert.equal(prepared.ok, true, prepared.error);
  const rehearsal = rehearseMissionCapture(env.store.state, prepared.id, { now: NOW });
  assert.equal(rehearsal.ok, true, rehearsal.error);
  assert.equal(env.api.saveMissionCapturePreview(prepared.id, rehearsal).ok, true);
  const result = env.api.missionCaptureCommit(prepared.id, env.store.state.meta.revision, true);
  assert.equal(result.ok, true, result.error);
  return { captureId: prepared.id, ...result };
}

const caseOf = (env, receipt) => env.store.state.cases.find((c) => c.id === receipt.caseId);

test('candidates are derived from the register: eligible, already-on-case and refused each carry a printed reason', () => {
  const env = setup(); const receipt = adopt(env);
  const reading = env.api.missionCaptureBriefCandidates(receipt.captureId);
  assert.equal(reading.ok, true, reading.error);
  const byId = new Map(reading.rows.map((r) => [r.registerId, r]));
  assert.equal(byId.get('stk-vendor').state, 'eligible');
  assert.equal(byId.get('stk-vendor').quadrant, 'manage-closely');
  assert.equal(byId.get('stk-finance').state, 'eligible');
  assert.equal(byId.get('stk-peer-lead').state, 'eligible', 'an opposing in-span lead qualifies');
  assert.equal(byId.get('stk-monitor').state, 'refused');
  assert.match(byId.get('stk-monitor').reason, /Mendelow/);
  assert.equal(byId.get('stk-peer-div').state, 'refused');
  assert.match(byId.get('stk-peer-div').reason, /outside your operating span/);
  assert.deepEqual(reading.counts, { total: 5, eligible: 3, attached: 0, refused: 2 });
  // Nothing in a candidate row carries note text.
  assert.equal(JSON.stringify(reading).includes(SECRET), false);
});

test('a selection is assessed as a whole: a refused member refuses the batch, and the ceiling is arithmetic', () => {
  const env = setup(); const receipt = adopt(env);
  const withRefused = env.api.missionCaptureBriefBulkPreview(receipt.captureId, { recipientIds: ['stk-vendor', 'stk-monitor'] });
  assert.equal(withRefused.ok, false);
  assert.match(withRefused.error, /Quiet Analyst/);
  const peer = env.api.missionCaptureBriefBulkPreview(receipt.captureId, { recipientIds: ['stk-peer-div'] });
  assert.equal(peer.ok, false);
  const empty = env.api.missionCaptureBriefBulkPreview(receipt.captureId, { recipientIds: [] });
  assert.equal(empty.ok, false);
  const tooMany = env.api.missionCaptureBriefBulkPreview(receipt.captureId,
    { recipientIds: Array.from({ length: BRIEF_BULK_LIMITS.maxRecipients + 1 }, (_, i) => `x-${i}`) });
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.error, new RegExp(`at most ${BRIEF_BULK_LIMITS.maxRecipients}`));
  // The storage ceiling is computed from the case, not assumed.
  const capped = setup({ state: (() => {
    const s = roster('dir1');
    return s;
  })() });
  const cappedReceipt = adopt(capped);
  const caseRecord = caseOf(capped, cappedReceipt);
  caseRecord.stakeholders = Array.from({ length: BRIEF_BULK_LIMITS.caseStakeholderCap - 1 }, (_, i) => ({
    id: `cstk-f-${i}`, name: `Filler ${i}`, role: 'existing', power: 1, interest: 1, stance: 'neutral', commsCadence: '', lastCommsOn: null, nextCommsOn: null, keyMessage: '',
  }));
  const overCap = briefCandidates(capped.store.state, caseRecord, { fullAccess: true, scope: new Set() }, { now: NOW });
  assert.equal(overCap.atCap, false);
  assert.equal(overCap.headroom, 1);
  const plan = capped.api.missionCaptureBriefBulkPreview(cappedReceipt.captureId, { recipientIds: ['stk-vendor', 'stk-finance'] });
  assert.equal(plan.ok, false);
  assert.match(plan.error, new RegExp(`${BRIEF_BULK_LIMITS.caseStakeholderCap}-entry ceiling`));
});

test('one reviewed transaction attaches every recipient, one unsent brief each, and the exact case-level provenance', () => {
  const env = setup(); const receipt = adopt(env);
  const preview = env.api.missionCaptureBriefBulkPreview(receipt.captureId, { recipientIds: ['stk-vendor', 'stk-finance', 'stk-peer-lead'] });
  assert.equal(preview.ok, true, preview.error);
  assert.equal(preview.count, 3);
  assert.equal(JSON.stringify(preview).includes(SECRET), false, 'the private note never reaches the audience preview');

  const before = env.store.state.meta.revision;
  const unreviewed = env.api.missionCaptureBriefBulkDraft(receipt.captureId,
    { recipientIds: ['stk-vendor'], expectedRevision: preview.revision, previewFingerprint: preview.fingerprint });
  assert.equal(unreviewed.ok, false);
  assert.equal(env.store.state.meta.revision, before);

  const wrongSelection = env.api.missionCaptureBriefBulkDraft(receipt.captureId,
    { recipientIds: ['stk-vendor', 'stk-finance'], expectedRevision: preview.revision, previewFingerprint: preview.fingerprint, reviewed: true });
  assert.equal(wrongSelection.ok, false, 'a changed selection invalidates the reviewed fingerprint');
  assert.equal(caseOf(env, receipt).stakeholders.length, 0);

  const committed = env.api.missionCaptureBriefBulkDraft(receipt.captureId,
    { recipientIds: ['stk-vendor', 'stk-finance', 'stk-peer-lead'], expectedRevision: preview.revision,
      previewFingerprint: preview.fingerprint, reviewed: true });
  assert.equal(committed.ok, true, committed.error);
  assert.equal(committed.count, 3);

  const record = caseOf(env, receipt);
  assert.equal(record.stakeholders.length, 3);
  assert.deepEqual(record.stakeholders.map((s) => s.name).sort(), ['Morgan Supplier', 'Rae Controller', 'Tessa Lead']);
  // The register's own dated assessment is what was written, not a retyped one.
  assert.equal(record.stakeholders.find((s) => s.name === 'Rae Controller').interest, 5);

  const drafts = env.store.state.commsDrafts.filter((d) => d.caseId === receipt.caseId);
  assert.equal(drafts.length, 3, 'RULE-COMMS-01 authored exactly one unsent brief per qualifying recipient');
  assert.ok(drafts.every((d) => d.status === 'draft' && d.sentOn === null));
  for (let i = 0; i < preview.recipients.length; i += 1) {
    const expected = preview.recipients[i];
    const draft = drafts.find((d) => d.stakeholderKey === `id:${committed.stakeholderIds[i]}`);
    assert.ok(draft, `a draft exists for ${expected.name}`);
    assert.equal(draft.subject, expected.preview.subject);
    assert.equal(draft.body, expected.preview.body);
  }

  // RULE-STK-01 links each register record by exact name; the case-level
  // provenance is what survives reload, not a copied register id.
  const links = env.store.state.links;
  for (const id of ['stk-vendor', 'stk-finance', 'stk-peer-lead']) {
    assert.ok(links.some((l) => l.sourceType === 'case' && l.sourceId === receipt.caseId
      && l.targetType === 'stakeholder' && l.targetId === id && l.relation === 'involves'), `involves edge to ${id}`);
  }
  assert.ok(links.some((l) => l.sourceType === 'missioncapture' && l.sourceId === receipt.captureId && l.targetId === 'vp1' && l.relation === 'rolls-up-to'));

  // Reload: the audience, the briefs and the register edges all survive.
  env.store.load();
  const afterReload = caseOf(env, receipt);
  assert.equal(afterReload.stakeholders.length, 3);
  const reloaded = env.api.missionCaptureBriefCandidates(receipt.captureId);
  assert.equal(reloaded.counts.attached, 3);
  assert.equal(reloaded.counts.eligible, 0);
  assert.equal(JSON.stringify(reloaded).includes(SECRET), false);
});

test('a rule failure or a drifted draft rolls the WHOLE audience back — no partial audience is ever persisted', () => {
  const env = setup(); const receipt = adopt(env);
  const preview = env.api.missionCaptureBriefBulkPreview(receipt.captureId, { recipientIds: ['stk-vendor', 'stk-finance'] });
  assert.equal(preview.ok, true, preview.error);
  const broken = setup({ state: copy(env.store.state), rules: [(_, ctx) => {
    if (ctx.event?.type === 'case.updated') throw new Error('Injected bulk-rule failure');
    return [];
  }] });
  const p = broken.api.missionCaptureBriefBulkPreview(receipt.captureId, { recipientIds: ['stk-vendor', 'stk-finance'] });
  assert.equal(p.ok, true, p.error);
  const snapshot = copy(broken.store.state);
  const res = broken.api.missionCaptureBriefBulkDraft(receipt.captureId,
    { recipientIds: ['stk-vendor', 'stk-finance'], expectedRevision: p.revision, previewFingerprint: p.fingerprint, reviewed: true });
  assert.equal(res.ok, false);
  assert.deepEqual(broken.store.state.cases.find((c) => c.id === receipt.caseId).stakeholders, snapshot.cases.find((c) => c.id === receipt.caseId).stakeholders);
  assert.equal(broken.store.state.commsDrafts.length, snapshot.commsDrafts.length);
});

test('two register rows that read as one name are disambiguation, never a silent merge', () => {
  const state = roster('dir1');
  state.stakeholders.push({ id: 'stk-vendor-2', name: 'morgan  SUPPLIER', role: 'Procurement lead', category: 'external-partner',
    power: 4, interest: 4, legitimacy: 4, urgency: 3, stance: 'blocker', status: 'active',
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
  const env = setup({ state: normalizeState(state, { now: NOW }).state });
  const receipt = adopt(env);
  const reading = env.api.missionCaptureBriefCandidates(receipt.captureId);
  const vendor = reading.rows.find((r) => r.registerId === 'stk-vendor');
  assert.equal(vendor.nameCollision, true);
  assert.deepEqual(vendor.collidesWith, ['stk-vendor-2']);
  // Either row alone is briefable (selected by id)…
  assert.equal(env.api.missionCaptureBriefBulkPreview(receipt.captureId, { recipientIds: ['stk-vendor-2'] }).ok, true);
  // …but both at once is refused: two briefs to one apparent person.
  const both = env.api.missionCaptureBriefBulkPreview(receipt.captureId, { recipientIds: ['stk-vendor', 'stk-vendor-2'] });
  assert.equal(both.ok, false);
  assert.match(both.error, /appears twice/);
});

test('the VP altitude reads its own span, and the audience panel renders axe-visible state from Mission Control', () => {
  const env = setup({ state: roster('vp1') }); const receipt = adopt(env, 'vp1');
  const reading = env.api.missionCaptureBriefCandidates(receipt.captureId);
  assert.equal(reading.ok, true, reading.error);
  // The peer division's VP is inside vp1's enterprise scope only via the chief;
  // a sibling VP is not a valid recipient for this seat.
  const peerVp = reading.rows.find((r) => r.registerId === 'stk-peer-div');
  assert.equal(peerVp.state, 'refused', 'vp2 sits outside vp1’s downward span');

  const dom = new JSDOM('<!doctype html><html><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>',
    { url: 'https://leados.test/#/mission?panel=capture', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element; globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  const view = document.getElementById('view');
  const ctx = { api: env.api, store: env.store, now: NOW,
    query: new URLSearchParams(`panel=capture&capture=${receipt.captureId}`),
    refresh() { view.replaceChildren(renderMission(ctx)); }, navigate() {} };
  ctx.refresh();
  assert.ok(view.textContent.includes('Brief an audience · from the register'));
  assert.ok(view.textContent.includes('eligible'));
  assert.ok(view.textContent.includes('refused'));
  const open = [...view.querySelectorAll('button')].find((b) => b.textContent.includes('eligible register person'));
  assert.ok(open, 'the bulk entry point is reachable from the adopted-case brief card');
  open.click();
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, 'the audience dialog opens');
  assert.ok(dialog.textContent.includes('Morgan Supplier'));
  assert.ok(dialog.textContent.includes('outside your operating span'));
  assert.ok(dialog.textContent.includes('Mendelow'));
  // Preview is refused for an unselectable (refused) row: its checkbox is disabled.
  const refusedBox = dialog.querySelector('#flow-bulk-stk-peer-div');
  assert.equal(refusedBox.disabled, true);
  dom.window.close();
});

test('the bulk commands are declared: reads are safe adapters, the write rides the existing comms right', () => {
  for (const name of ['missionCaptureBriefCandidates', 'missionCaptureBriefBulkPreview']) {
    assert.ok(SAFE_READS.has(name), `${name} is a registered safe read`);
  }
  assert.equal(API_RIGHTS.missionCaptureBriefBulkDraft, 'prepare-comms');
  // The agenda guard is untouched by this session (adjacent-module regression check).
  assert.equal(personQueue({ id: 'p', talkingPoints: [] }).total, 0);
});
