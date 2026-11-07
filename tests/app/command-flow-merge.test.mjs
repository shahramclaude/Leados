/**
 * ADR-0116: Cross-span capture merge inside Command Flow (`#/mission?panel=capture`).
 *
 * Verifies true N-way LCA routing (manager, director, VP, CEO), privacy-safe
 * Broder shingle + ADR-0113 `prepares-for` lineage matching, human confirmation,
 * constituent `merged` settlement, atomic rollback, standalone worker parity and
 * zero-violation axe accessibility.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildChain, harvestWork } from '../../app/core/domain/chain.js';
import { multiSpanLowestCommonAncestor } from '../../app/core/domain/missionCaptureMerge.js';
import { rehearseMissionCapture } from '../../app/services/missionCaptureRehearsal.js';
import { renderMission } from '../../app/views/mission.js';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-11-07T12:00:00.000Z');
const clone = (v) => JSON.parse(JSON.stringify(v));

const SECRET_LEAD1 = 'SECRET_NOTE_ALPHA_991: Ari Klein stayed late clearing gateway retries.';
const SECRET_LEAD3 = 'SECRET_NOTE_OMEGA_774: Bo Vance flagged the invoice queue stalling.';
const NOTE_SPAN_A = `The supplier delivery is late again and the billing backlog is blocking handoffs across the shift. ${SECRET_LEAD1}`;
const NOTE_SPAN_B = `Vendor shipment is late and the billing backlog blocked downstream handoffs all week. ${SECRET_LEAD3}`;
const NOTE_SPAN_C = 'Hardware supplier delivery is late and our billing backlog is blocking handoffs at shift change.';

function fixture(activeSeatId = 'lead1') {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Chief', chainLeaderAltitude: 'chief', activeSeatId, missionCellFloor: 5 };
  state.people = [
    ['vp1', null, 'vp', 'Rina VP'],
    ['vp2', null, 'vp', 'omar VP'],
    ['dir1', 'vp1', 'director', 'Sam Director'],
    ['dir2', 'vp1', 'director', 'Ira Director'],
    ['dir3', 'vp2', 'director', 'Noor Director'],
    ['mgr1', 'dir1', 'manager', 'Mei Manager'],
    ['mgr2', 'dir1', 'manager', 'Alex Manager'],
    ['mgr3', 'dir3', 'manager', 'Zoe Manager'],
    ['mgr4', 'dir2', 'manager', 'Kai Manager'],
    ['lead1', 'mgr1', 'lead', 'Priya Lead'],
    ['lead2', 'mgr1', 'lead', 'Jordan Lead'],
    ['lead3', 'mgr2', 'lead', 'Tessa Lead'],
    ['ic1', 'lead1', 'ic', 'Ari Klein'],
    ['ic2', 'lead2', 'ic', 'Cy Orlov'],
    ['ic3', 'lead3', 'ic', 'Bo Vance'],
    ['ic4', 'mgr3', 'ic', 'Dev Patel'],
    ['ic5', 'mgr4', 'ic', 'Noa Lin'],
  ].map(([id, managerId, level, name]) => ({ id, name, role: level, level, managerId, status: 'active' }));
  state.budgets = [
    { id: 'b-vp1', name: 'VP1 envelope', label: 'VP1 envelope', ownerId: 'vp1', currency: 'USD', limit: 80000, status: 'active', lines: [] },
    { id: 'b-ent', name: 'Enterprise reserve', label: 'Enterprise reserve', ownerId: null, currency: 'USD', limit: 200000, status: 'active', lines: [] },
  ];
  return normalizeState(state, { now: NOW }).state;
}

function setup({ state = fixture(), rules } = {}) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  let seq = 0;
  const idFactory = (p) => `${p}-mrg-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory, ...(rules ? { postCommitRules: rules } : {}) });
  store.load();
  return { store, storage, api: createApi(store, { now: () => NOW, idFactory }) };
}

function rehearseAndSave(env, id) {
  const res = rehearseMissionCapture(env.store.state, id, { now: NOW });
  assert.equal(res.ok, true, res.error);
  const saved = env.api.saveMissionCapturePreview(id, res);
  assert.equal(saved.ok, true, saved.error);
  return res;
}

test('subsidiarity & true N-way LCA: 2 leads under mgr1 route to mgr1; adding a 3rd lead under mgr2 elevates the LCA to dir1 (director)', () => {
  const env = setup({ state: fixture('lead1') });
  const chain = buildChain(env.store.state, { now: NOW });
  assert.equal(multiSpanLowestCommonAncestor(chain, ['lead1', 'lead2']), 'mgr1');
  assert.equal(multiSpanLowestCommonAncestor(chain, ['lead1', 'lead2', 'lead3']), 'dir1');

  const c1 = env.api.missionCapturePrepare({ text: NOTE_SPAN_A, title: 'Billing backlog stalling handoffs', ownerId: 'lead1', kinds: ['decision', 'delegation'], reviewOn: '2026-11-14', severity: 6 });
  assert.equal(c1.ok, true, c1.error);
  env.api.setActiveSeat('lead2');
  const c2 = env.api.missionCapturePrepare({ text: NOTE_SPAN_C, title: 'Supplier delay & billing handoff backlog', ownerId: 'lead2', kinds: ['decision', 'delegation'], reviewOn: '2026-11-15', severity: 7 });
  assert.equal(c2.ok, true, c2.error);

  // Two sibling leads under mgr1: mgr1 is the LCA; dir1 must NOT hijack it.
  env.api.setActiveSeat('mgr1');
  const atMgr = env.api.missionRead();
  assert.equal(atMgr.mergeCandidates.length, 1);
  assert.equal(atMgr.mergeCandidates[0].lcaSeatId, 'mgr1');
  env.api.setActiveSeat('dir1');
  assert.equal(env.api.missionRead().mergeCandidates.length, 0, 'subsidiarity keeps 2-lead merge at mgr1');
  assert.equal(env.api.missionCapturePrepareMerge({ memberCaptureIds: [c1.id, c2.id], dedupeFingerprint: atMgr.mergeCandidates[0].dedupeFingerprint, ownerId: 'mgr1' }).ok, false);

  // Now lead3 (under mgr2 -> dir1) reports the same constraint: the 3-way cluster rises to dir1!
  env.api.setActiveSeat('lead3');
  const c3 = env.api.missionCapturePrepare({ text: NOTE_SPAN_B, title: 'Vendor late & billing backlog blocking shift', ownerId: 'lead3', kinds: ['decision', 'delegation'], reviewOn: '2026-11-13', severity: 8 });
  assert.equal(c3.ok, true, c3.error);

  // Note: lead1 and lead2 sit under mgr1 while lead3 sits under mgr2, so the disjoint cross-unit cluster at dir1 picks one representative under mgr1 + lead3 under mgr2 -> LCA is dir1!
  env.api.setActiveSeat('dir1');
  const atDir = env.api.missionRead();
  assert.equal(atDir.mergeCandidates.length, 1);
  const cand = atDir.mergeCandidates[0];
  assert.equal(cand.lcaSeatId, 'dir1');
  assert.equal(cand.maxSeverity, 8);
  assert.equal(cand.suggestedReviewOn, '2026-11-13');
  assert.deepEqual(cand.directBranchIds.sort(), ['mgr1', 'mgr2']);

  // Privacy check: raw notes and IC names NEVER appear in the director's read.
  const serializedDir = JSON.stringify(atDir);
  assert.equal(serializedDir.includes(SECRET_LEAD1), false);
  assert.equal(serializedDir.includes(SECRET_LEAD3), false);
  assert.equal(serializedDir.includes('Ari Klein'), false);
  assert.equal(serializedDir.includes('Bo Vance'), false);

  // Privacy check on frontline collision advisory: lead3 sees LCA advisory, zero sibling note/title/seat leak.
  env.api.setActiveSeat('lead3');
  const atLead3 = env.api.missionRead();
  const ownCap = atLead3.captures.find((c) => c.id === c3.id);
  assert.ok(ownCap.mergeAdvisory);
  assert.equal(ownCap.mergeAdvisory.dedupeFingerprint, cand.dedupeFingerprint);
  assert.equal(ownCap.mergeAdvisory.lcaSeatId, 'dir1');
  const serializedLead3 = JSON.stringify(ownCap.mergeAdvisory);
  assert.equal(serializedLead3.includes('Priya'), false);
  assert.equal(serializedLead3.includes('Jordan'), false);
  assert.equal(serializedLead3.includes(SECRET_LEAD1), false);

  // Director prepares, edits commands (ADR-0114), rehearses and adopts ONE consolidated LCA case.
  env.api.setActiveSeat('dir1');
  const prepared = env.api.missionCapturePrepareMerge({
    memberCaptureIds: cand.memberCaptureIds,
    dedupeFingerprint: cand.dedupeFingerprint,
    title: 'Cross-unit billing & supplier recovery',
    ownerId: 'mgr1',
    kinds: ['decision', 'delegation', 'premise'],
    priorPct: 75,
    commandEdits: {
      decision: {
        title: 'Arbitrate cross-unit supplier & billing buffer',
        question: 'How should Mei and Alex sequence handoffs while supplier shipments lag?',
        options: [
          { label: 'Pool intake queue across both spans for two weeks', pros: 'Eliminates Friday bottleneck', cons: 'Shared triage overhead' },
          { label: 'Freeze non-critical handoffs until backlog drops below 25', pros: 'Protects SLA', cons: 'Defers secondary work' },
        ],
      },
      premise: {
        title: 'Pooling removes the cross-span handoff queue',
        statement: 'A pooled triage window cuts cross-span billing wait below 24 hours within 10 days.',
        signpost: 'Disproved if cross-span queue age exceeds 24 hours on 2026-11-13.',
      },
    },
  });
  assert.equal(prepared.ok, true, prepared.error);
  rehearseAndSave(env, prepared.id);
  const committed = env.api.missionCaptureCommit(prepared.id, env.store.state.meta.revision, true);
  assert.equal(committed.ok, true, committed.error);

  const s = env.store.state;
  assert.equal(s.cases.length, 1, 'exactly ONE consolidated case created');
  assert.equal(s.actionBundles.length, 1, 'exactly ONE action bundle created');
  assert.equal(s.premises.length, 1);
  assert.equal(s.premises[0].statement, 'A pooled triage window cuts cross-span billing wait below 24 hours within 10 days.');

  // Verify the single consolidated case is owned directly by dir1 (the LCA) in Command Chain harvest!
  const work = harvestWork(s, buildChain(s, { now: NOW }), { now: NOW });
  const caseItem = work.find((w) => w.type === 'case' && w.entityId === committed.caseId);
  assert.ok(caseItem);
  assert.equal(caseItem.ownerNodeId, 'dir1', 'consolidated case sits at the exact LCA span');

  // Constituent captures are settled to `merged` and linked on the shared spine (RULE-MIS-01).
  for (const memberId of cand.memberCaptureIds) {
    const m = s.missionCaptures.find((c) => c.id === memberId);
    assert.equal(m.status, 'merged');
    assert.equal(m.mergedIntoCaptureId, prepared.id);
    assert.equal(m.caseId, committed.caseId);
    assert.equal(m.bundleId, committed.bundleId);
    assert.ok(s.links.some((l) => l.sourceType === 'missioncapture' && l.sourceId === memberId && l.relation === 'responds-to' && l.targetId === committed.caseId));
    assert.ok(s.links.some((l) => l.sourceType === 'missioncapture' && l.sourceId === memberId && l.relation === 'coordinates' && l.targetId === committed.bundleId));
    for (const anc of ['dir1', 'vp1', 'leader']) {
      assert.ok(s.links.some((l) => l.sourceType === 'missioncapture' && l.sourceId === memberId && l.relation === 'rolls-up-to' && l.targetId === anc));
    }
  }

  // Normalization round-trip preserves `merged` status and receipts cleanly.
  const reloaded = normalizeState(clone(s), { now: NOW });
  assert.equal(reloaded.warnings.filter((w) => w.includes('Mission captures')).length, 0);
  assert.equal(reloaded.state.missionCaptures.find((c) => c.id === c3.id).status, 'merged');

  // Constituent seat can read its consolidation receipt, cannot withdraw LCA actions directly.
  env.api.setActiveSeat('lead3');
  const receipt = env.api.missionCaptureReceipt(c3.id);
  assert.equal(receipt.ok, true);
  assert.ok(receipt.text.includes(committed.caseId));
  assert.equal(env.api.missionCaptureWithdraw(c3.id, 'Trying to withdraw from constituent seat').ok, false);
});

test('VP (rank 4) & CEO (rank 5) cross-division merges withhold unit titles above rank 3; VP unlocks budget envelopes and CEO adopts enterprise governance', () => {
  // 1. VP (rank 4): dir1 + dir2 both report to vp1 -> vp1 consolidates with budget commitment, child titles withheld.
  const vpEnv = setup({ state: fixture('dir1') });
  assert.equal(vpEnv.api.missionCapturePrepare({ text: NOTE_SPAN_A, title: 'Unit-specific secret title Alpha', ownerId: 'dir1', kinds: ['decision'], reviewOn: '2026-11-20', severity: 7 }).ok, true);
  vpEnv.api.setActiveSeat('dir2');
  assert.equal(vpEnv.api.missionCapturePrepare({ text: NOTE_SPAN_B, title: 'Unit-specific secret title Gamma', ownerId: 'dir2', kinds: ['decision'], reviewOn: '2026-11-21', severity: 8 }).ok, true);

  vpEnv.api.setActiveSeat('vp1');
  const atVp = vpEnv.api.missionRead();
  assert.equal(atVp.mergeCandidates.length, 1);
  const vpCand = atVp.mergeCandidates[0];
  assert.equal(vpCand.lcaSeatId, 'vp1');
  assert.equal(vpCand.members.every((m) => m.titleWithheld === true), true);
  assert.equal(JSON.stringify(vpCand).includes('Unit-specific secret title'), false);
  const vpMerged = vpEnv.api.missionCapturePrepareMerge({
    memberCaptureIds: vpCand.memberCaptureIds,
    dedupeFingerprint: vpCand.dedupeFingerprint,
    title: 'Division supplier resilience response',
    ownerId: 'dir1',
    kinds: ['decision', 'budget'],
    budgetId: 'b-vp1',
    amount: 15000,
  });
  assert.equal(vpMerged.ok, true, vpMerged.error);
  rehearseAndSave(vpEnv, vpMerged.id);
  assert.equal(vpEnv.api.missionCaptureCommit(vpMerged.id, vpEnv.store.state.meta.revision, true).ok, true);
  assert.ok(vpEnv.store.state.budgets.find((b) => b.id === 'b-vp1').lines.some((l) => l.committedAmount === 15000));

  // 2. CEO / Enterprise (rank 5): dir1 (under vp1) + dir3 (under vp2) -> LCA is `leader` (rank 5)!
  const chiefEnv = setup({ state: fixture('dir1') });
  assert.equal(chiefEnv.api.missionCapturePrepare({ text: NOTE_SPAN_A, title: 'Unit-specific secret title Alpha', ownerId: 'dir1', kinds: ['decision'], reviewOn: '2026-11-20', severity: 7 }).ok, true);
  chiefEnv.api.setActiveSeat('dir3');
  assert.equal(chiefEnv.api.missionCapturePrepare({ text: NOTE_SPAN_B, title: 'Unit-specific secret title Beta', ownerId: 'dir3', kinds: ['decision'], reviewOn: '2026-11-22', severity: 8 }).ok, true);

  chiefEnv.api.setActiveSeat('vp1');
  assert.equal(chiefEnv.api.missionRead().mergeCandidates.length, 0, 'vp1 does not contain vp2 subtree');

  chiefEnv.api.setActiveSeat('leader');
  const atChief = chiefEnv.api.missionRead();
  assert.equal(atChief.mergeCandidates.length, 1);
  const cand = atChief.mergeCandidates[0];
  assert.equal(cand.lcaSeatId, 'leader');
  assert.equal(cand.members.every((m) => m.titleWithheld === true), true);
  assert.equal(JSON.stringify(cand).includes('Unit-specific secret title'), false);

  const merged = chiefEnv.api.missionCapturePrepareMerge({
    memberCaptureIds: cand.memberCaptureIds,
    dedupeFingerprint: cand.dedupeFingerprint,
    title: 'Enterprise supplier resilience response',
    ownerId: 'vp1',
    kinds: ['decision', 'delegation', 'premise'],
  });
  assert.equal(merged.ok, true, merged.error);
  rehearseAndSave(chiefEnv, merged.id);
  const res = chiefEnv.api.missionCaptureCommit(merged.id, chiefEnv.store.state.meta.revision, true);
  assert.equal(res.ok, true, res.error);
  assert.equal(chiefEnv.store.state.cases.length, 1);
});

test('ADR-0113 prepares-for lineage edges anchor cross-span merges; unrelated same-category notes do not false-merge', () => {
  const env = setup({ state: fixture('lead1') });
  // First verify two unrelated delivery notes do NOT merge:
  const u1 = env.api.missionCapturePrepare({ text: 'Laptop hardware shipment is delayed at customs for new hires.', title: 'Laptop customs delay', ownerId: 'lead1', kinds: ['decision'], reviewOn: '2026-11-14' });
  env.api.setActiveSeat('lead2');
  const u2 = env.api.missionCapturePrepare({ text: 'Client onboarding milestone slipped while legal contract redlines wait.', title: 'Onboarding milestone slip', ownerId: 'lead2', kinds: ['decision'], reviewOn: '2026-11-14' });
  assert.equal(u1.ok && u2.ok, true);
  env.api.setActiveSeat('mgr1');
  assert.equal(env.api.missionRead().mergeCandidates.length, 0, 'unrelated delivery captures must not merge');

  // Now both leads file ADR-0113 1:1 agenda commitments (`prepares-for` edges) citing the same upstream bottleneck ref:
  env.api.setActiveSeat('lead1');
  const f1 = env.api.agendaFile({ personId: 'ic1', prompt: 'Capacity trade-off follow-up [RULE-CAP-02:pf-shared-bottleneck]' });
  assert.equal(f1.ok, true, f1.error);
  env.api.setActiveSeat('lead2');
  const f2 = env.api.agendaFile({ personId: 'ic2', prompt: 'Protected focus recovery check [RULE-CAP-02:pf-shared-bottleneck]' });
  assert.equal(f2.ok, true, f2.error);

  env.api.setActiveSeat('mgr1');
  const linked = env.api.missionRead().mergeCandidates;
  assert.equal(linked.length, 1, 'shared ADR-0113 prepares-for lineage edge anchors the cross-span merge');
  assert.equal(linked[0].exactLineageMatch, true);
  assert.ok(linked[0].sharedLineageCount >= 1);
});

test('human confirmation gates: declining a merge keeps local captures open; changed constituents and rule failures block or roll back atomically', () => {
  const env = setup({ state: fixture('lead1') });
  const c1 = env.api.missionCapturePrepare({ text: NOTE_SPAN_A, title: 'Span A delay', ownerId: 'lead1', kinds: ['decision'], reviewOn: '2026-11-14' });
  env.api.setActiveSeat('lead2');
  const c2 = env.api.missionCapturePrepare({ text: NOTE_SPAN_C, title: 'Span B delay', ownerId: 'lead2', kinds: ['decision'], reviewOn: '2026-11-14' });
  assert.equal(c1.ok && c2.ok, true);

  env.api.setActiveSeat('mgr1');
  const cand = env.api.missionRead().mergeCandidates[0];
  assert.ok(cand);
  assert.equal(env.api.missionCaptureDismissMerge({ memberCaptureIds: cand.memberCaptureIds, dedupeFingerprint: cand.dedupeFingerprint, reason: 'no' }).ok, false, 'short reason refused');
  const declined = env.api.missionCaptureDismissMerge({ memberCaptureIds: cand.memberCaptureIds, dedupeFingerprint: cand.dedupeFingerprint, reason: 'Different suppliers: hardware vs billing vendor.' });
  assert.equal(declined.ok, true, declined.error);
  assert.equal(env.api.missionRead().mergeCandidates.length, 0, 'declined fingerprint is suppressed');
  assert.equal(env.store.state.missionCaptures.find((c) => c.id === c1.id).status, 'draft', 'constituent captures remain open');

  // Editing a constituent capture creates a new dedupe fingerprint (fresh facts re-surface).
  env.api.setActiveSeat('lead2');
  const updatedC2 = env.api.missionCapturePrepare({ captureId: c2.id, text: `${NOTE_SPAN_C} Confirmed same billing supplier.`, title: 'Span B delay updated', ownerId: 'lead2', kinds: ['decision'], reviewOn: '2026-11-15' });
  assert.equal(updatedC2.ok, true);

  env.api.setActiveSeat('mgr1');
  const freshCand = env.api.missionRead().mergeCandidates[0];
  assert.ok(freshCand);
  assert.notEqual(freshCand.dedupeFingerprint, cand.dedupeFingerprint);

  const mrg = env.api.missionCapturePrepareMerge({ memberCaptureIds: freshCand.memberCaptureIds, dedupeFingerprint: freshCand.dedupeFingerprint, ownerId: 'lead1', kinds: ['decision'] });
  assert.equal(mrg.ok, true, mrg.error);
  const preview = rehearseMissionCapture(env.store.state, mrg.id, { now: NOW });
  assert.equal(preview.ok, true, preview.error);

  // If a failing post-commit rule throws on live adoption, neither the case nor constituent `merged` state persists.
  const failing = setup({ state: clone(env.store.state), rules: [() => { throw new Error('Injected merge rule failure'); }] });
  assert.equal(failing.api.saveMissionCapturePreview(mrg.id, preview).ok, true);
  const beforeFail = clone(failing.store.state);
  const failedCommit = failing.api.missionCaptureCommit(mrg.id, beforeFail.meta.revision, true);
  assert.equal(failedCommit.ok, false);
  assert.deepEqual(failing.store.state, beforeFail, 'rule failure rolls back case, bundle and constituent statuses');

  // Save rehearsal on `env`; if lead1 edits their capture afterwards, stale adoption is refused.
  assert.equal(env.api.saveMissionCapturePreview(mrg.id, preview).ok, true);

  // If lead1 edits their capture after mgr1 rehearsed, stale adoption is refused.
  env.api.setActiveSeat('lead1');
  env.api.missionCapturePrepare({ captureId: c1.id, text: `${NOTE_SPAN_A} Scope changed.`, title: 'Span A revised', ownerId: 'lead1', kinds: ['decision'], reviewOn: '2026-11-16' });
  env.api.setActiveSeat('mgr1');
  assert.equal(env.api.missionCaptureCommit(mrg.id, env.store.state.meta.revision, true).ok, false);
  assert.equal(env.store.state.cases.length, 0);
});

test('Command Flow cross-span merge UI renders cleanly and passes axe-core at LCA and constituent altitudes', async () => {
  const dom = new JSDOM('<!doctype html><html><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/#/mission?panel=capture', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node; globalThis.Element = dom.window.Element; globalThis.HTMLElement = dom.window.HTMLElement;
  dom.window.eval(AXE_SRC);

  const env = setup({ state: fixture('lead1') });
  const c1 = env.api.missionCapturePrepare({ text: NOTE_SPAN_A, title: 'Billing backlog A', ownerId: 'lead1', kinds: ['decision', 'delegation'], reviewOn: '2026-11-14' });
  env.api.setActiveSeat('lead3');
  const c3 = env.api.missionCapturePrepare({ text: NOTE_SPAN_B, title: 'Billing backlog B', ownerId: 'lead3', kinds: ['decision', 'delegation'], reviewOn: '2026-11-14' });
  assert.equal(c1.ok && c3.ok, true);

  const view = document.getElementById('view');
  const ctx = { api: env.api, store: env.store, now: NOW, query: new URLSearchParams('panel=capture'), refresh() { view.replaceChildren(renderMission(ctx)); }, navigate() {} };

  // 1. Constituent frontline view with identity-free cross-span overlap banner.
  ctx.refresh();
  assert.ok(view.textContent.includes('Cross-span overlap detected'));
  let axeRes = await dom.window.axe.run(view, { rules: { region: { enabled: false } } });
  assert.deepEqual(axeRes.violations.map((v) => v.id), []);

  // 2. Director LCA view with merge candidates table + staged consolidation editor.
  env.api.setActiveSeat('dir1');
  ctx.refresh();
  assert.ok(view.textContent.includes('Cross-span constraint merges awaiting confirmation'));
  axeRes = await dom.window.axe.run(view, { rules: { region: { enabled: false } } });
  assert.deepEqual(axeRes.violations.map((v) => v.id), []);

  const stageBtn = [...view.querySelectorAll('button')].find((b) => b.textContent.includes('Stage consolidated LCA response'));
  assert.ok(stageBtn);
  stageBtn.click();
  assert.ok(view.textContent.includes('Consolidate cross-span constraint at LCA'));
  axeRes = await dom.window.axe.run(view, { rules: { region: { enabled: false } } });
  assert.deepEqual(axeRes.violations.map((v) => v.id), []);

  // 3. Adopt and verify settled `merged` receipt card on frontline seat passes axe.
  const cand = env.api.missionRead().mergeCandidates[0];
  const mrg = env.api.missionCapturePrepareMerge({ memberCaptureIds: cand.memberCaptureIds, dedupeFingerprint: cand.dedupeFingerprint, ownerId: 'mgr1', kinds: ['decision', 'delegation'] });
  rehearseAndSave(env, mrg.id);
  assert.equal(env.api.missionCaptureCommit(mrg.id, env.store.state.meta.revision, true).ok, true);

  env.api.setActiveSeat('lead3');
  ctx.query = new URLSearchParams(`panel=capture&capture=${c3.id}`);
  ctx.refresh();
  assert.ok(view.textContent.includes('Consolidated at lowest common ancestor'));
  axeRes = await dom.window.axe.run(view, { rules: { region: { enabled: false } } });
  assert.deepEqual(axeRes.violations.map((v) => v.id), []);

  dom.window.close();
});
