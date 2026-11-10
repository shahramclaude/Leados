/**
 * ADR-0165 — a declared reporting line is an accountability, not a readership
 * of the conversation. Per-line 1:1 body confidentiality, matrix and single-chain.
 *
 * What this suite proves, end to end through the REAL projection path
 * (safeSeatContext + scopedViewState) and the real store:
 *   1. a line-only seat keeps the FACT of another manager's meeting and loses
 *      everything said in it (notes, agenda, promises, mood) — view-only;
 *   2. the holder reads their own meeting; the tree reads legacy unattributed
 *      rows exactly as before; the undeclared operator is byte-identical;
 *   3. even the home manager cannot read the project manager's room once the
 *      holder is recorded — one hierarchy rule, no side doors;
 *   4. persisted bytes are never touched by the boundary (display == stored);
 *   5. the write doors (toggle/add/owner) refuse a meeting that is not this
 *      seat's conversation, and the rendered page never prints withheld text.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { matrixRule } from '../../app/core/domain/matrixRules.js';
import { safeSeatContext, scopedViewState } from '../../app/core/domain/viewScope.js';
import { renderOneOnOnes } from '../../app/views/oneonones.js';

const NOW = new Date('2026-11-10T10:00:00.000Z');
const ISO = NOW.toISOString();
const HOME_NOTES = 'Home conversation: Sam raised the promotion case.';
const PROJECT_NOTES = 'Project conversation: migration cutover weekend.';
const LEGACY_NOTES = 'Legacy conversation: nobody can attribute this.';
const ACTIONS_A = [{ id: 'a-home', text: 'Home commitment: draft promotion case', personId: 'sam', owner: 'leader', done: false, due: null, carryCount: 0, firstAgreedOn: '2026-11-08' }];
const ACTIONS_B = [{ id: 'a-project', text: 'Project commitment: freeze the schema', personId: 'sam', owner: 'them', done: false, due: null, carryCount: 0, firstAgreedOn: '2026-11-09' }];

function storage() {
  const map = new Map();
  return {
    fail: false,
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { if (this.fail) throw new Error('storage unavailable'); map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

function fixture({ withLine = true, singleChain = false } = {}) {
  const state = createEmptyState(ISO);
  state.schemaVersion = 132;
  state.settings.activeSeatId = 'project';
  state.people = [
    { id: 'director', name: 'Director', level: 'director', managerId: null, status: 'active', createdAt: ISO },
    { id: 'home', name: 'Home Manager', level: 'manager', managerId: 'director', status: 'active', createdAt: ISO },
    { id: 'project', name: 'Project Manager', level: 'manager', managerId: 'director', status: 'active', createdAt: ISO },
    { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active', createdAt: ISO },
  ];
  state.reportingLines = withLine
    ? [{ id: 'project-line', personId: 'sam', managerId: 'project', kind: 'project', shareH: 40, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: ISO, status: 'active' }]
    : [];
  const meetingList = [
    { id: 'm-home', personId: 'sam', date: '2026-11-08', dateUncertain: false, status: 'held', mood: 4, notes: HOME_NOTES, agenda: [{ id: 'ag-home', text: 'promotion case', done: true, source: 'manual' }], resolvedTopics: [], actions: ACTIONS_A.map((a) => ({ ...a })), heldById: 'home', heldByBasis: 'seat', heldByAt: ISO, createdAt: ISO },
    { id: 'm-project', personId: 'sam', date: '2026-11-09', dateUncertain: false, status: 'held', mood: 2, notes: PROJECT_NOTES, agenda: [{ id: 'ag-project', text: 'cutover weekend', done: true, source: 'manual' }], resolvedTopics: [], actions: ACTIONS_B.map((a) => ({ ...a })), heldById: 'project', heldByBasis: 'seat', heldByAt: ISO, createdAt: ISO },
    { id: 'm-legacy', personId: 'sam', date: '2026-11-05', dateUncertain: false, status: 'held', mood: 3, notes: LEGACY_NOTES, agenda: [], resolvedTopics: [], actions: [], createdAt: ISO },
    { id: 'm-skipped', personId: 'sam', date: '2026-11-07', dateUncertain: false, status: 'skipped', mood: null, notes: 'Home skipped because Sam was on leave.', agenda: [], resolvedTopics: [], actions: [], heldById: 'home', heldByBasis: 'seat', heldByAt: ISO, createdAt: ISO },
  ];
  // In a genuine single-chain workspace the second manager never holds a
  // meeting with someone who is not their report: sam's meetings are all
  // home's (or unattributed legacy rows) — that is the world this rule must
  // not change.
  state.oneOnOnes = singleChain ? meetingList.filter((m) => ['m-home', 'm-legacy'].includes(m.id)) : meetingList;
  return state;
}

function harness(opts) {
  const disk = storage();
  disk.setItem(STORAGE_KEY, JSON.stringify(fixture(opts)));
  const store = createStore({ storage: disk, now: () => NOW, postCommitRules: [matrixRule] });
  store.load();
  const api = createApi(store, { now: () => NOW });
  return { store, api, disk };
}

function operateAs(store, seatId) {
  store.update((draft) => { draft.settings.activeSeatId = seatId; }, { type: 'test.seat', entity: 'seat', entityId: seatId, summary: `Operate as ${seatId}` });
}

function viewStateFor(store) {
  const seatCtx = safeSeatContext(store.state, NOW);
  assert.equal(seatCtx.error, null);
  return scopedViewState(store.state, seatCtx, { now: NOW, settings: store.state.settings });
}

const meetingById = (vs, id) => (vs.oneOnOnes || []).find((m) => m.id === id);

test('a line-only seat keeps the FACT of another manager’s meeting and loses its body — holder, tree and legacy rules all honoured', () => {
  const { store } = harness();
  operateAs(store, 'project');
  const vs = viewStateFor(store);

  const homeMeeting = meetingById(vs, 'm-home');
  assert.ok(homeMeeting, 'the fact of the meeting survives the projection');
  assert.equal(homeMeeting.bodyWithheld, true);
  assert.equal(homeMeeting.notes, '');
  assert.deepEqual(homeMeeting.actions, []);
  assert.deepEqual(homeMeeting.agenda, []);
  assert.deepEqual(homeMeeting.resolvedTopics, []);
  assert.equal(homeMeeting.mood, null);
  // Identity keys are verbatim from storage — the fact is real, not invented.
  assert.equal(homeMeeting.date, '2026-11-08');
  assert.equal(homeMeeting.status, 'held');
  assert.equal(homeMeeting.heldById, 'home');

  // The seat's own conversation is fully readable.
  const own = meetingById(vs, 'm-project');
  assert.equal(own.bodyWithheld, undefined);
  assert.equal(own.notes, PROJECT_NOTES);
  assert.equal(own.actions.length, 1);

  // A legacy unattributed meeting: the line learns that one happened, nothing else.
  const legacy = meetingById(vs, 'm-legacy');
  assert.equal(legacy.bodyWithheld, true);
  assert.equal(legacy.notes, '');
  assert.match(legacy.bodyWithheldReason, /no holder/i);
  assert.equal(legacy.date, '2026-11-05');

  // A skipped meeting from another manager is the same rule.
  const skipped = meetingById(vs, 'm-skipped');
  assert.equal(skipped.bodyWithheld, true);
  assert.equal(skipped.status, 'skipped');
});

test('even the home manager cannot read the project manager’s room once the holder is recorded — and legacy rows stay readable through the tree', () => {
  const { store } = harness();
  operateAs(store, 'home');
  const vs = viewStateFor(store);

  const projectMeeting = meetingById(vs, 'm-project');
  assert.equal(projectMeeting.bodyWithheld, true, 'a recorded holder identifies the room; the home tree does not open it');
  assert.equal(projectMeeting.notes, '');

  const own = meetingById(vs, 'm-home');
  assert.equal(own.bodyWithheld, undefined);
  assert.equal(own.notes, HOME_NOTES);
  assert.equal(own.actions.length, 1);

  const legacy = meetingById(vs, 'm-legacy');
  assert.equal(legacy.bodyWithheld, undefined, 'unattributed rows keep the pre-ADR-0165 tree visibility');
  assert.equal(legacy.notes, LEGACY_NOTES);

  // ...and what the seat reads is exactly what is stored, field for field.
  const stored = store.state.oneOnOnes.find((m) => m.id === 'm-project');
  assert.equal(stored.notes, PROJECT_NOTES, 'the boundary never rewrites stored bytes');
});

test('a single-chain workspace (no declared additional line) behaves exactly as before', () => {
  const { store } = harness({ withLine: false, singleChain: true });
  operateAs(store, 'home');
  const vs = viewStateFor(store);
  assert.equal(vs.oneOnOnes.filter((m) => m.bodyWithheld).length, 0);
  const notes = Object.fromEntries(vs.oneOnOnes.map((m) => [m.id, m.notes]));
  assert.equal(notes['m-home'], HOME_NOTES);
  assert.equal(notes['m-legacy'], LEGACY_NOTES);
  // The peer manager without a line has no reach at all: sam's meetings are not projected.
  operateAs(store, 'project');
  const vsPeer = viewStateFor(store);
  assert.equal(vsPeer.oneOnOnes.length, 0, 'no reach, no rows — exactly the pre-matrix sideways rule');
});

test('the undeclared operator view is byte-identical to the raw state', () => {
  const { store } = harness();
  operateAs(store, '');
  const raw = store.state;
  const vs = viewStateFor(store);
  assert.equal(vs, raw, 'fullAccess returns the same object — no projection, no stubs');
});

test('the write doors refuse a conversation that is not this seat’s', () => {
  const { store, api } = harness();
  operateAs(store, 'project');
  const toggle = api.toggleMeetingAction('m-home', 'a-home');
  assert.equal(toggle.ok, false);
  const added = api.addMeetingAction('m-home', 'smuggle in an action');
  assert.equal(added.ok, false);
  const owned = api.setActionOwner('m-home', 'a-home', 'them');
  assert.equal(owned.ok, false);
  const toggleSkipped = api.toggleMeetingAction('m-skipped', 'nope');
  assert.equal(toggleSkipped.ok, false);

  // The seat's own room still works.
  const ownToggle = api.toggleMeetingAction('m-project', 'a-project');
  assert.equal(ownToggle.ok, true, ownToggle.error);

  // The home manager keeps full command of their own room.
  operateAs(store, 'home');
  const homeToggle = api.toggleMeetingAction('m-home', 'a-home');
  assert.equal(homeToggle.ok, true, homeToggle.error);
});

test('display == stored: the projection stubs, the disk keeps the record, and the page never prints withheld text', () => {
  const { store, disk, api } = harness();
  operateAs(store, 'project');
  const bytesBefore = disk.getItem(STORAGE_KEY);
  const vs = viewStateFor(store);

  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const old = new Map(keys.map((key) => [key, globalThis[key]]));
  try {
    for (const key of keys) globalThis[key] = key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key];
    const page = renderOneOnOnes({ state: vs, now: NOW, query: new URLSearchParams(), api, navigate() {} });
    const text = page.textContent;
    assert.ok(text.includes('2026-11-08') || text.includes('Nov'), 'the fact of the home meeting is still visible');
    assert.ok(!text.includes('promotion case'), 'agenda from another manager’s room is never printed');
    assert.ok(!text.includes(HOME_NOTES), 'notes from another manager’s room are never printed');
    assert.ok(!text.includes('Home commitment: draft promotion case'), 'promises from another manager’s room are never printed');
    assert.ok(!text.includes('left the promotion case in the review'), 'paranoia check');
    assert.match(text, /recorded by another manager/i, 'the fact-only reason is printed, not hidden');
    assert.ok(text.includes(PROJECT_NOTES), 'the seat’s own room renders in full');
  } finally {
    for (const key of keys) globalThis[key] = old.get(key);
    dom.window.close();
  }
  assert.equal(disk.getItem(STORAGE_KEY), bytesBefore, 'rendering and projection never touch stored bytes');
  const persisted = JSON.parse(disk.getItem(STORAGE_KEY));
  assert.equal(persisted.oneOnOnes.find((m) => m.id === 'm-home').notes, HOME_NOTES, 'stored record is verbatim');
  // ...and a real reload sees the same projection again (display == stored across loads).
  const reloaded = normalizeState(persisted, { now: NOW }).state;
  const reloadedVs = scopedViewState(reloaded, safeSeatContext(reloaded, NOW), { now: NOW, settings: reloaded.settings });
  assert.equal(meetingById(reloadedVs, 'm-home').notes, '');
  assert.equal(meetingById(reloadedVs, 'm-home').heldById, 'home');
});

test('claiming an unattributed meeting is a recorded attestation: after the claim, the claimant reads it — and the release path exists', () => {
  const { store, api } = harness();
  operateAs(store, 'project');
  const before = viewStateFor(store);
  assert.equal(meetingById(before, 'm-legacy').bodyWithheld, true);
  const claim = api.oneOnOneLineClaim('m-legacy', {});
  assert.equal(claim.ok, true, claim.error);
  assert.equal(store.state.oneOnOnes.find((m) => m.id === 'm-legacy').heldById, 'project');
  assert.equal(store.state.oneOnOnes.find((m) => m.id === 'm-legacy').heldByBasis, 'claimed');
  const after = viewStateFor(store);
  const claimed = meetingById(after, 'm-legacy');
  assert.equal(claimed.bodyWithheld, undefined, 'the recorded attestation identifies the room: the claimant reads it');
  assert.equal(claimed.notes, LEGACY_NOTES);
});
