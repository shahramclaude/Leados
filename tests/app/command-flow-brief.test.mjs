/** One adopted case -> reviewed recipient -> shared case event -> scoped unsent brief. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { rehearseMissionCapture } from '../../app/services/missionCaptureRehearsal.js';
import { buildChain, harvestWork } from '../../app/core/domain/chain.js';
import { renderMission } from '../../app/views/mission.js';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const NOTE = 'The supplier delivery is late again and the billing backlog is blocking handoffs across the shift. The team needs an accountable recovery checkpoint.';
const SECRET = 'PRIVATE_NOTE_ALPHA_998';
const ACTOR = { name: 'Morgan Supplier', role: 'Vendor operations', power: 5, interest: 4, stance: 'skeptical', keyMessage: '' };
const copy = (v) => JSON.parse(JSON.stringify(v));
function fixture(seat = 'dir1') {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Chief', chainLeaderAltitude: 'chief', activeSeatId: seat, missionCellFloor: 5 };
  state.people = [
    ['vp1', null, 'vp', 'Rina VP'], ['vp2', null, 'vp', 'Omar VP'],
    ['dir1', 'vp1', 'director', 'Sam Director'], ['dir2', 'vp1', 'director', 'Ira Director'],
    ['dir3', 'vp2', 'director', 'Noor Director'],
    ['mgr1', 'dir1', 'manager', 'Mei Manager'], ['mgr2', 'dir1', 'manager', 'Alex Manager'],
    ['mgr3', 'dir2', 'manager', 'Leo Manager'],
    ['lead1', 'mgr1', 'lead', 'Priya Lead'], ['lead2', 'mgr2', 'lead', 'Tessa Lead'],
    ['ic1', 'lead1', 'ic', 'Ari Klein'], ['ic2', 'lead2', 'ic', 'Bo Vance'],
  ].map(([id, managerId, level, name]) => ({ id, name, role: level, level, managerId, status: 'active' }));
  state.stakeholders = [{ id: 'stk-actual', name: ACTOR.name, role: ACTOR.role, category: 'external-vendor',
    power: 5, interest: 4, legitimacy: 4, urgency: 4, stance: 'skeptical', status: 'active',
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
  { id: 'stk-peer', name: 'Peer Sponsor', role: 'VP for another division', personId: 'vp2', category: 'internal-exec',
    power: 5, interest: 5, legitimacy: 4, urgency: 3, stance: 'neutral', status: 'active',
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }];
  return normalizeState(state, { now: NOW }).state;
}
function setup({ state = fixture(), rules = undefined } = {}) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  let seq = 0;
  const idFactory = (p) => `${p}-brief-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory, ...(rules ? { postCommitRules: rules } : {}) }); store.load();
  return { api: createApi(store, { now: () => NOW, idFactory }), store, storage };
}
function adopt(env, seat = 'dir1') {
  assert.equal(env.api.setActiveSeat(seat).ok, true);
  const accountable = seat === 'dir1' ? 'mgr1' : seat === 'vp1' ? 'dir1' : seat;
  const prepared = env.api.missionCapturePrepare({ text: NOTE, title: 'Supplier & billing handoff recovery', ownerId: accountable,
    kinds: ['decision', 'delegation'], reviewOn: '2026-11-14', severity: 7 });
  assert.equal(prepared.ok, true, prepared.error);
  const rehearsal = rehearseMissionCapture(env.store.state, prepared.id, { now: NOW });
  assert.equal(rehearsal.ok, true, rehearsal.error);
  assert.equal(env.api.saveMissionCapturePreview(prepared.id, rehearsal).ok, true);
  const result = env.api.missionCaptureCommit(prepared.id, env.store.state.meta.revision, true);
  assert.equal(result.ok, true, result.error);
  return { captureId: prepared.id, ...result };
}
function draft(env, captureId, actor = ACTOR) {
  const preview = env.api.missionCaptureBriefPreview(captureId, actor);
  assert.equal(preview.ok, true, preview.error);
  const committed = env.api.missionCaptureBriefDraft(captureId, { ...actor, expectedRevision: preview.revision,
    previewFingerprint: preview.fingerprint, reviewed: true });
  assert.equal(committed.ok, true, committed.error);
  return { preview, committed };
}

test('director: exact-name register linkage, real recipient review, one case event and one case-owned unsent brief; reload retains the roll-up', () => {
  const env = setup(); const receipt = adopt(env);
  const before = env.store.state.meta.revision;
  const noReview = env.api.missionCaptureBriefDraft(receipt.captureId, { ...ACTOR });
  assert.equal(noReview.ok, false); assert.equal(env.store.state.meta.revision, before);
  const { preview, committed } = draft(env, receipt.captureId);
  assert.equal(preview.recipient.name, ACTOR.name);
  assert.equal(preview.preview.body.includes(SECRET), false);
  const caseRecord = env.store.state.cases.find((c) => c.id === receipt.caseId);
  assert.equal(caseRecord.stakeholders.length, 1);
  assert.equal(caseRecord.stakeholders[0].id, committed.stakeholderId);
  const message = env.store.state.commsDrafts.find((d) => d.id === committed.draftId);
  assert.equal(message.status, 'draft'); assert.equal(message.sentOn, null);
  assert.equal(message.subject, preview.preview.subject); assert.equal(message.body, preview.preview.body);
  assert.ok(env.store.state.links.some((l) => l.sourceType === 'case' && l.sourceId === receipt.caseId && l.targetType === 'comms' && l.targetId === message.id && l.relation === 'communicates'));
  assert.ok(env.store.state.links.some((l) => l.sourceType === 'case' && l.sourceId === receipt.caseId && l.targetType === 'stakeholder' && l.targetId === 'stk-actual' && l.relation === 'involves'));
  assert.ok(env.store.state.links.some((l) => l.sourceType === 'missioncapture' && l.sourceId === receipt.captureId && l.targetId === receipt.caseId && l.relation === 'responds-to'));
  assert.ok(env.store.state.links.some((l) => l.sourceType === 'missioncapture' && l.sourceId === receipt.captureId && l.targetId === 'vp1' && l.relation === 'rolls-up-to'));
  const items = harvestWork(env.store.state, buildChain(env.store.state, { now: NOW }), { now: NOW });
  assert.equal(items.filter((item) => item.type === 'case' && item.entityId === receipt.caseId).length, 1);
  assert.equal(items.find((item) => item.type === 'case' && item.entityId === receipt.caseId).ownerNodeId, 'dir1');
  const reading = env.api.missionCaptureBriefRead(receipt.captureId);
  assert.equal(reading.ok, true, reading.error); assert.deepEqual(reading.drafts.map((d) => d.id), [message.id]);
  env.store.load();
  assert.equal(env.api.missionCaptureBriefRead(receipt.captureId).drafts[0].body, preview.preview.body);
});

test('director: incomplete facts require acknowledgement; edits withdraw approval, delivery only after human send; closure follows the recorded touch', () => {
  const env = setup(); const receipt = adopt(env); const { committed } = draft(env, receipt.captureId);
  const id = committed.draftId; const rev = () => env.store.state.meta.revision;
  const read = () => env.api.missionCaptureBriefRead(receipt.captureId).drafts.find((d) => d.id === id);
  assert.ok(read().missing.includes('preventive action'));
  assert.equal(env.api.missionCaptureBriefApprove(receipt.captureId, id, { expectedRevision: rev() }).ok, false);
  assert.equal(env.api.missionCaptureBriefSent(receipt.captureId, id, { expectedRevision: rev(), reviewed: true, channel: 'Email', sentOn: '2026-11-07' }).ok, false);
  assert.equal(env.api.missionCaptureBriefApprove(receipt.captureId, id, { expectedRevision: rev(), acknowledgeGaps: true }).ok, true);
  assert.equal(read().status, 'approved');
  assert.equal(env.api.missionCaptureBriefEdit(receipt.captureId, id, { expectedRevision: rev(), subject: 'Reviewed vendor recovery', body: 'Hi Morgan, I will confirm the next checkpoint after the team checks the recovery plan.' }).ok, true);
  assert.equal(read().status, 'draft', 'editing revokes prior approval');
  assert.equal(env.api.missionCaptureBriefApprove(receipt.captureId, id, { expectedRevision: rev(), acknowledgeGaps: true }).ok, true);
  assert.equal(env.api.missionCaptureBriefSent(receipt.captureId, id, { expectedRevision: rev(), reviewed: false, channel: 'Email', sentOn: '2026-11-07' }).ok, false);
  const delivery = env.api.missionCaptureBriefSent(receipt.captureId, id, { expectedRevision: rev(), reviewed: true, channel: 'Email', sentOn: '2026-11-07' });
  assert.equal(delivery.ok, true, delivery.error);
  assert.equal(read().status, 'sent');
  const stakeholder = env.store.state.cases.find((c) => c.id === receipt.caseId).stakeholders[0];
  assert.equal(stakeholder.lastCommsOn, '2026-11-07'); assert.ok(stakeholder.nextCommsOn >= '2026-11-07');
  assert.equal(env.api.updateCase(receipt.caseId, { status: 'resolved', resolutionNotes: 'The vendor and billing queues were reconciled.' }).ok, true);
  assert.ok(env.api.missionCaptureBriefRead(receipt.captureId).drafts.some((d) => d.purpose === 'closure' && d.status === 'draft'));
});

test('VP: the case-owned scoped adapter permits the executive to edit their own briefs, not peer work or another altitude’s private capture', () => {
  const env = setup({ state: fixture('vp1') }); const receipt = adopt(env, 'vp1');
  const bad = env.api.missionCaptureBriefPreview(receipt.captureId, { ...ACTOR, name: 'Peer Sponsor', role: 'Peer VP' });
  assert.equal(bad.ok, false, 'a registered person outside the VP subtree is not an eligible recipient');
  const { committed } = draft(env, receipt.captureId);
  const revised = env.api.missionCaptureBriefEdit(receipt.captureId, committed.draftId,
    { expectedRevision: env.store.state.meta.revision, subject: 'VP reviewed update', body: 'Hi Morgan, review the recovery plan at the next checkpoint.' });
  assert.equal(revised.ok, true, revised.error);
  assert.equal(env.api.missionCaptureBriefRead(receipt.captureId).drafts[0].subject, 'VP reviewed update');
  assert.equal(env.api.setActiveSeat('dir2').ok, true);
  assert.equal(env.api.missionCaptureBriefRead(receipt.captureId).ok, false);
  assert.equal(env.api.missionCaptureBriefApprove(receipt.captureId, committed.draftId, { expectedRevision: env.store.state.meta.revision, acknowledgeGaps: true }).ok, false);
  assert.equal(env.api.approveCommsDraft(committed.draftId, { acknowledgeGaps: true }).ok, false, 'direct peer outbox access remains closed');
  env.api.setActiveSeat('vp1');
  const ok = env.api.missionCaptureBriefApprove(receipt.captureId, committed.draftId, { expectedRevision: env.store.state.meta.revision, acknowledgeGaps: true });
  assert.equal(ok.ok, true, ok.error);
});

test('cross-span LCA adoption owns the brief; merged constituent notes and sibling outboxes never cross into its reading', () => {
  const env = setup({ state: fixture('lead1') });
  const first = env.api.missionCapturePrepare({ text: `${NOTE} ${SECRET}`, ownerId: 'lead1', kinds: ['decision'], reviewOn: '2026-11-14' });
  assert.equal(first.ok, true, first.error);
  env.api.setActiveSeat('lead2');
  const second = env.api.missionCapturePrepare({ text: `${NOTE} A separate shift reported the same backlog.`, ownerId: 'lead2', kinds: ['decision'], reviewOn: '2026-11-14' });
  assert.equal(second.ok, true, second.error);
  env.api.setActiveSeat('dir1');
  const cand = env.api.missionRead().mergeCandidates[0]; assert.ok(cand, 'the two disjoint child spans have a matching constraint');
  const merged = env.api.missionCapturePrepareMerge({ memberCaptureIds: cand.memberCaptureIds, dedupeFingerprint: cand.dedupeFingerprint,
    ownerId: 'mgr1', kinds: ['decision', 'delegation'], reviewOn: '2026-11-14' });
  assert.equal(merged.ok, true, merged.error);
  const rehearsal = rehearseMissionCapture(env.store.state, merged.id, { now: NOW }); assert.equal(rehearsal.ok, true, rehearsal.error);
  assert.equal(env.api.saveMissionCapturePreview(merged.id, rehearsal).ok, true);
  assert.equal(env.api.missionCaptureCommit(merged.id, env.store.state.meta.revision, true).ok, true);
  const { committed } = draft(env, merged.id);
  const reading = env.api.missionCaptureBriefRead(merged.id);
  assert.equal(reading.ok, true); assert.equal(JSON.stringify(reading).includes(SECRET), false);
  assert.equal(reading.drafts[0].id, committed.draftId);
  env.api.setActiveSeat('lead1');
  assert.equal(env.api.missionCaptureBriefRead(first.id).ok, false, 'merged constituent is not an LCA author');
  assert.equal(env.api.missionCaptureBriefRead(merged.id).ok, false, 'ancestors retain work but not another seat’s note');
  env.api.setActiveSeat('dir1');
  assert.equal(env.api.missionCaptureBriefRead(second.id).ok, false, 'director cannot read a child’s capture');
});

test('refusals and injected rule failures make no partial recipient, draft, or cross-module links', () => {
  const env = setup(); const receipt = adopt(env);
  const noSalience = env.api.missionCaptureBriefPreview(receipt.captureId, { ...ACTOR, power: 1, interest: 1, stance: 'neutral' });
  assert.equal(noSalience.ok, false);
  assert.equal(env.api.missionCaptureBriefPreview(receipt.captureId, { ...ACTOR, power: true }).ok, false);
  const preview = env.api.missionCaptureBriefPreview(receipt.captureId, ACTOR); assert.equal(preview.ok, true);
  const forged = env.api.missionCaptureBriefDraft(receipt.captureId, { ...ACTOR, role: 'Different role', expectedRevision: preview.revision, previewFingerprint: preview.fingerprint, reviewed: true });
  assert.equal(forged.ok, false); assert.equal(env.store.state.cases[0].stakeholders.length, 0);
  const stale = env.api.missionCaptureBriefDraft(receipt.captureId, { ...ACTOR, expectedRevision: preview.revision - 1, previewFingerprint: preview.fingerprint, reviewed: true });
  assert.equal(stale.ok, false);
  // Inject a broken subscriber ONLY for this case update. The store records a
  // rule failure in its draft; the adapter must refuse before persistence.
  const broken = setup({ state: copy(env.store.state), rules: [(_, ctx) => {
    if (ctx.event?.type === 'case.updated') throw new Error('Injected brief-rule failure');
    return [];
  }] });
  const p = broken.api.missionCaptureBriefPreview(receipt.captureId, ACTOR); assert.equal(p.ok, true, p.error);
  const before = copy(broken.store.state);
  const res = broken.api.missionCaptureBriefDraft(receipt.captureId, { ...ACTOR, expectedRevision: p.revision, previewFingerprint: p.fingerprint, reviewed: true });
  assert.equal(res.ok, false); assert.deepEqual(broken.store.state, before, 'no partial case mutation or missing draft is persisted');
});

test('adopted-case brief card and preview are operable from Mission Control without exposing global outbox state', () => {
  const dom = new JSDOM('<!doctype html><html><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>',
    { url: 'https://leados.test/#/mission?panel=capture', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element; globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.FormData = dom.window.FormData;
  const env = setup(); const receipt = adopt(env);
  const view = document.getElementById('view');
  const ctx = { api: env.api, store: env.store, now: NOW,
    query: new URLSearchParams(`panel=capture&capture=${receipt.captureId}`),
    refresh() { view.replaceChildren(renderMission(ctx)); }, navigate() {} };
  ctx.refresh();
  assert.ok(view.textContent.includes('Stakeholder briefs · adopted case'));
  const add = [...view.querySelectorAll('button')].find((b) => b.textContent.includes('Preview & draft for a named recipient'));
  assert.ok(add); add.click();
  const form = document.querySelector('#flow-brief-name').closest('form');
  form.querySelector('#flow-brief-name').value = ACTOR.name;
  form.querySelector('#flow-brief-role').value = ACTOR.role;
  form.querySelector('#flow-brief-power').value = '5';
  form.querySelector('#flow-brief-interest').value = '4';
  form.querySelector('#flow-brief-stance').value = 'skeptical';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.ok(form.textContent.includes('To Morgan Supplier'));
  const approve = form.querySelector('#flow-brief-reviewed'); approve.checked = true;
  approve.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const button = [...form.querySelectorAll('button')].find((b) => b.textContent.includes('Create unsent draft'));
  assert.equal(button.disabled, false); button.click();
  assert.equal(env.store.state.commsDrafts.length, 1);
  assert.ok(view.textContent.includes('Approve reviewed text'));
  dom.window.close();
});
