/**
 * tests/app/seal-chain.test.mjs — ADR-0082, Session 122: the Sealed Spine
 * (tamper-evident audit chain) + altitude-routed intake.
 *
 * The claims this suite makes, in order:
 *   1. Settings normalize with safe defaults and need NO schema bump of their
 *      own (repo at v88 after ADR-0081's Altitude Router; this feature adds no
 *      migration on top).
 *   2. INERTNESS: with sealing not enabled, an operational commit appends no
 *      `audit.seal` event — existing behaviour is byte-for-byte unchanged.
 *   3. Enabling sealing appends exactly one seal per committed transaction;
 *      the seal commits to (prev seal, tx digest, revision) and the chain
 *      verifies VALID from genesis.
 *   4. Multi-commit chains link correctly; each block records its root record.
 *   5. TAMPER EVIDENCE: editing an event inside a sealed block is a content
 *      mismatch at exactly that block; editing a seal is a chain break.
 *   6. HMAC mode: with a session key registered, seals are HMAC and cannot be
 *      verified (let alone forged) without the key.
 *   7. Idempotence: re-running the rule on the same revision never double-seals.
 *   8. Seal events are exempt from the event-log retention cap.
 *   9. THE HEADLINE: one committed frontline case, under a declared frontline
 *      seat with sealing on, produces cross-module propagation AND a typed
 *      rolls-up-to fan-out AND one audit.seal — in ONE atomic transaction — and
 *      the span attestation roll-up counts that sealed transaction at the
 *      frontline, manager, director, VP and enterprise spans.
 *  10. Explicit `seal.scan` always seals + verifies, even with sealing off.
 *  11. The seat gateway: reads/verify/scan are allowed under a declared seat;
 *      enabling sealing is operator-only (fail-closed).
 *  12. Intake altitude routing: a note naming an IC resolves to their lead's
 *      seat (LCA), two ICs under different leads resolve to the manager, and
 *      confirming the draft creates the case owned by that seat.
 *  13. All four Integrity panels render axe-clean with no placeholders.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION, createEmptyState, normalizeState, normalizeSettings,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { SEAT_RULE_IDS } from '../../app/core/domain/seatRegistry.js';
import { SEAL_EVENTS, SEAL_GENESIS, SEAL_RULE_IDS } from '../../app/core/domain/sealRegistry.js';
import {
  computeSeal, lastSealEvent, parseSealEvent, sealReport, sealSpanAttestations,
  scopeSealSpans, txDigest, verifySealChain,
} from '../../app/core/domain/sealChain.js';
import { sealRule } from '../../app/core/domain/sealRules.js';
import { registerSealKey, clearSealKey, sha256Hex, hmacSha256Hex } from '../../app/core/domain/sealCrypto.js';
import { analyzeIntakeText, toCaseInput } from '../../app/core/domain/intake.js';
import { renderSeal } from '../../app/views/seal.js';

const NOW = new Date('2027-07-05T00:00:00.000Z');
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);
const clone = (value) => JSON.parse(JSON.stringify(value));

function fixture(overrides = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    activeSeatId: null,
    seatAutoPropagate: true,
    sealEnabled: false,
    ...overrides,
  };
  state.people = [
    { id: 'vp1', name: 'Rina Okafor', role: 'VP Operations', level: 'vp', managerId: null, status: 'active', createdAt: ago(500) },
    { id: 'dir1', name: 'Samuel Park', role: 'Director', level: 'director', managerId: 'vp1', status: 'active', createdAt: ago(500) },
    { id: 'mgr1', name: 'Mei Chen', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active', createdAt: ago(500) },
    { id: 'lead1', name: 'Priya Raman', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active', createdAt: ago(500) },
    { id: 'lead2', name: 'Jordan Lee', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active', createdAt: ago(500) },
    { id: 'ic1', name: 'Ari Klein', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active', createdAt: ago(400) },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active', createdAt: ago(400) },
    { id: 'ic3', name: 'Cy Orlov', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active', createdAt: ago(400) },
    { id: 'ic4', name: 'Dee Park', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active', createdAt: ago(400) },
  ];
  return state;
}

function boot(overrides = {}) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-s${(seq += 1)}`;
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  store.update((draft) => Object.assign(draft, fixture(overrides)), { type: 'fixture.loaded', entity: 'workspace' });
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api, idFactory };
}

const sealEventsOf = (state) => state.events.filter((e) => e.type === SEAL_EVENTS.SEAL);

/* ------------------------------------------------------------ 1. settings */

test('1. seal settings normalize with safe defaults; no schema bump of its own', () => {
  assert.equal(SCHEMA_VERSION, 91, 'the seal adds no migration of its own');
  const s = normalizeSettings({});
  assert.equal(s.sealEnabled, false);
  assert.equal(s.sealAutoPropagate, true);
  assert.equal(s.sealMode, 'auto');
  const clamped = normalizeSettings({ sealEnabled: 1, sealAutoPropagate: 0, sealMode: 'hmac-always' });
  assert.equal(clamped.sealEnabled, false, 'only literal true enables');
  assert.equal(clamped.sealAutoPropagate, true, 'only literal false pauses');
  assert.equal(clamped.sealMode, 'auto', 'unknown mode falls back');
  const normalized = normalizeState({ ...createEmptyState(NOW.toISOString()), settings: { sealEnabled: true } }, { now: NOW });
  assert.equal(normalized.state.settings.sealEnabled, true);
  assert.equal(normalized.state.schemaVersion, 91);
});

/* ------------------------------------------------- 2-4. sealing behaviour */

test('2. inertness: with sealing off, operational commits append no seal', () => {
  const { store, api } = boot();
  api.addCase({ title: 'Unsealed case', kind: 'risk', ownerId: 'ic1', openedOn: ago(1) });
  assert.equal(sealEventsOf(store.state).length, 0);
  assert.equal(verifySealChain(store.state).blocks, 0);
});

test('3. enabling sealing appends exactly one audit.seal per commit and verifies VALID', () => {
  const { store, api } = boot();
  const enabled = api.enableSealing();
  assert.equal(enabled.ok, true);
  assert.equal(sealEventsOf(store.state).length, 1, 'the enabling transaction seals itself (explicit event)');
  api.addCase({ title: 'Sealed case one', kind: 'risk', ownerId: 'ic1', openedOn: ago(1) });
  api.addCase({ title: 'Sealed case two', kind: 'incident', ownerId: 'ic2', openedOn: ago(1) });
  const seals = sealEventsOf(store.state);
  assert.equal(seals.length, 3, 'one seal per committed transaction');
  for (const s of seals) {
    assert.match(s.entityId, /^[0-9a-f]{64}$/, 'entityId carries the 64-hex seal');
    const parsed = parseSealEvent(s);
    assert.ok(parsed, 'summary parses back into chain fields');
    assert.ok(parsed.evCount >= 1);
    assert.equal(parsed.mode, 'hash', 'no session key -> plain hash mode, printed honestly');
  }
  const v = verifySealChain(store.state);
  assert.equal(v.blocks, 3);
  assert.equal(v.chainValid, true);
  assert.equal(v.contentValid, true);
  assert.equal(v.breaks.length, 0);
  assert.equal(v.mode, 'hash');
  assert.notEqual(v.chainHead, SEAL_GENESIS);
  assert.equal(v.firstSealAt !== null, true);
  // chain links: each seal's prev is the previous seal
  const parsed = seals.map(parseSealEvent);
  assert.equal(parsed[0].prev, SEAL_GENESIS);
  assert.equal(parsed[1].prev, parsed[0].seal);
  assert.equal(parsed[2].prev, parsed[1].seal);
  // block roots recorded for the attestation roll-up
  assert.ok(parsed.some((p) => p.root.startsWith('case:')));
  // report surface
  const report = sealReport(store.state, { now: NOW, settings: store.state.settings });
  assert.equal(report.enabled, true);
  assert.equal(report.blocks, 3);
  assert.equal(report.keyed, false);
  assert.equal(report.verification.chainValid, true);
});

test('4. each seal covers exactly the events appended in its transaction', () => {
  const { store, api } = boot();
  api.enableSealing();
  const before = store.state.events.length;
  api.addCase({ title: 'Counted case', kind: 'risk', ownerId: 'ic1', openedOn: ago(1) });
  const seals = sealEventsOf(store.state);
  const last = parseSealEvent(seals[seals.length - 1]);
  const fresh = store.state.events.slice(before).filter((e) => e.type !== SEAL_EVENTS.SEAL);
  assert.equal(last.evCount, fresh.length, 'ev count equals the non-seal events appended in the transaction');
  assert.equal(txDigest(fresh), last.digest, 'digest recomputes from those events');
});

/* ------------------------------------------------------- 5. tamper evidence */

test('5. tamper evidence: content edit and seal edit are caught at the right block', () => {
  const { store, api } = boot();
  api.enableSealing();
  api.addCase({ title: 'Case A', kind: 'risk', ownerId: 'ic1', openedOn: ago(1) });
  api.addCase({ title: 'Case B', kind: 'risk', ownerId: 'ic2', openedOn: ago(1) });
  api.addCase({ title: 'Case C', kind: 'risk', ownerId: 'ic3', openedOn: ago(1) });
  const clean = verifySealChain(store.state);
  assert.equal(clean.chainValid && clean.contentValid, true);

  // (a) edit an event inside the MIDDLE sealed block -> content mismatch there, chain still valid
  const tampered = clone(store.state);
  const seals = sealEventsOf(tampered);
  const midIdx = seals[1].index ?? seals.findIndex((s) => s === seals[1]);
  const midSealPos = tampered.events.findIndex((e) => e.type === SEAL_EVENTS.SEAL && parseSealEvent(e)?.rev === parseSealEvent(seals[1]).rev);
  const prevSealPos = tampered.events.findIndex((e) => e.type === SEAL_EVENTS.SEAL && parseSealEvent(e)?.rev === parseSealEvent(seals[0]).rev);
  const victim = tampered.events[prevSealPos + 1]; // first event of the middle block
  victim.summary = 'forged summary';
  const v1 = verifySealChain(tampered);
  assert.equal(v1.chainValid, true, 'seals themselves are intact');
  assert.equal(v1.contentValid, false);
  const contentBreak = v1.breaks.find((b) => b.reason === 'content-mismatch');
  assert.ok(contentBreak, 'content break reported');
  assert.equal(contentBreak.rev, parseSealEvent(seals[1]).rev, 'blamed at exactly the tampered block');

  // (b) edit a seal -> chain break
  const tampered2 = clone(store.state);
  const sealPos = tampered2.events.findIndex((e) => e.type === SEAL_EVENTS.SEAL);
  tampered2.events[sealPos].entityId = 'f'.repeat(64);
  const v2 = verifySealChain(tampered2);
  assert.equal(v2.chainValid, false);
  assert.ok(v2.breaks.some((b) => b.reason === 'seal-mismatch'), 'forged seal detected');
});

/* ------------------------------------------------------------- 6. HMAC mode */

test('6. HMAC mode: keyed seals verify only with the key', () => {
  clearSealKey();
  const { store, api } = boot();
  api.enableSealing();
  api.addCase({ title: 'Hash case', kind: 'risk', ownerId: 'ic1', openedOn: ago(1) });
  registerSealKey('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  api.addCase({ title: 'HMAC case', kind: 'risk', ownerId: 'ic2', openedOn: ago(1) });
  const seals = sealEventsOf(store.state).map(parseSealEvent);
  assert.equal(seals[seals.length - 1].mode, 'hmac');
  assert.equal(seals[seals.length - 2].mode, 'hash');
  const withKey = verifySealChain(store.state);
  assert.equal(withKey.chainValid, true, 'chain verifies with the key');
  assert.equal(withKey.mode, 'mixed');
  clearSealKey();
  const noKey = verifySealChain(store.state);
  assert.equal(noKey.chainValid, false, 'without the key the HMAC block cannot be verified');
  assert.ok(noKey.breaks.some((b) => b.reason === 'key-missing'));
  // a forged seal under a wrong key is a seal-mismatch, not a pass
  registerSealKey('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  const wrongKey = verifySealChain(store.state);
  assert.ok(wrongKey.breaks.some((b) => b.reason === 'seal-mismatch'), 'wrong key cannot validate a keyed seal');
  clearSealKey();
});

test('6b. computeSeal binds mode, prev, digest and revision', () => {
  const base = { prevSeal: SEAL_GENESIS, digest: sha256Hex('x'), revision: 7 };
  const h = computeSeal({ ...base, mode: 'hash' });
  assert.equal(h, computeSeal({ ...base, mode: 'hash' }));
  assert.notEqual(h, computeSeal({ ...base, mode: 'hash', revision: 8 }));
  const m = computeSeal({ ...base, mode: 'hmac', key: new TextEncoder().encode('k') });
  assert.equal(m, hmacSha256Hex(new TextEncoder().encode('k'), `seal|${SEAL_GENESIS}|${base.digest}|7`));
  assert.notEqual(m, h);
});

/* ------------------------------------------------- 7-8. idempotence and caps */

test('7. idempotence: the rule never double-seals one revision', () => {
  const { store, api } = boot();
  api.enableSealing();
  api.addCase({ title: 'Once', kind: 'risk', ownerId: 'ic1', openedOn: ago(1) });
  const sealsBefore = sealEventsOf(store.state).length;
  // simulate a rule retry: same draft, same previousState, same revision
  const draft = clone(store.state);
  const ctx = {
    event: { type: 'case.created', entity: 'case', entityId: 'x', summary: 'retry' },
    previousState: store.state,
    now: NOW,
    idFactory: (p) => `${p}-retry`,
    logEvent: (e) => draft.events.push({ id: 'ev-retry', ts: NOW.toISOString(), ...e }),
  };
  const again = sealRule(draft, ctx);
  assert.equal(again.length, 0, 'same revision already sealed -> no-op');
  assert.equal(draft.events.filter((e) => e.type === SEAL_EVENTS.SEAL).length, sealsBefore);
});

test('8. seal events are exempt from the event-log retention cap', () => {
  const { store, api } = boot();
  api.enableSealing();
  api.addCase({ title: 'S1', kind: 'risk', ownerId: 'ic1', openedOn: ago(1) });
  api.addCase({ title: 'S2', kind: 'risk', ownerId: 'ic2', openedOn: ago(1) });
  const sealsBefore = sealEventsOf(store.state).length;
  // one transaction that logs 650 ordinary events (over the 600 cap)
  store.update((draft, { logEvent }) => {
    for (let i = 0; i < 650; i += 1) logEvent({ type: 'noise.event', entity: 'workspace', entityId: '', summary: `noise ${i}` });
  }, { type: 'noise.burst', entity: 'workspace', summary: '650 noise events in one commit' });
  const nonSeal = store.state.events.filter((e) => e.type !== SEAL_EVENTS.SEAL);
  const seals = sealEventsOf(store.state);
  assert.ok(nonSeal.length <= 600, `ordinary events still capped at 600 (got ${nonSeal.length})`);
  assert.equal(seals.length, sealsBefore + 1, 'all prior seals survive the burst; the burst itself seals');
  const v = verifySealChain(store.state);
  assert.equal(v.chainValid, true);
  assert.ok(v.evictedBlocks >= 1, 'blocks whose content was evicted by the cap are reported, not hidden');
});

/* --------------------------------------- 9. THE headline: one atomic commit */

test('9. ONE frontline commit = cross-module propagation + cross-altitude roll-up + one seal, atomically', () => {
  // sealing enabled at fixture time (the gateway rightly refuses enableSealing
  // under a declared seat — test 11 proves that)
  const { store, api } = boot({ activeSeatId: 'lead1', sealEnabled: true });
  const linksBefore = store.state.links.length;
  const res = api.addCase({
    title: 'Night shift missed the dispatch deadline; client escalated',
    kind: 'incident', ownerId: 'ic1', involvedPersonIds: ['ic2'],
    openedOn: ago(1), reviewOn: ago(-5),
    fmea: { severity: 8, probability: 6, detectability: 4 },
  });
  assert.equal(res.ok, true, res.error);
  const caseId = res.id;
  // (a) the seal exists, in the SAME transaction
  const seals = sealEventsOf(store.state);
  assert.equal(seals.length >= 2, true, 'enable + case commits are sealed');
  const lastSeal = parseSealEvent(seals[seals.length - 1]);
  assert.equal(lastSeal.root, `case:${caseId}`, 'the seal records its root record');
  assert.ok(lastSeal.evCount >= 2, 'the seal covers the case event AND the other rules’ derived events');
  // (b) cross-module: other rules propagated in the same commit
  const nonSeatLinks = store.state.links.length - linksBefore;
  assert.ok(store.state.links.some((l) => l.sourceId === caseId && l.ruleId !== SEAT_RULE_IDS.ROLLUP), 'cross-module links from the same commit');
  // (c) cross-altitude: typed rolls-up-to fan-out to every leadership ancestor
  const rollup = store.state.links.filter((l) => l.sourceId === caseId && l.relation === 'rolls-up-to' && l.ruleId === SEAT_RULE_IDS.ROLLUP);
  const targets = rollup.map((l) => l.targetId).sort();
  assert.deepEqual(targets, ['dir1', 'lead1', 'mgr1', 'vp1'], 'frontline case reaches lead → manager → director → VP in one transaction');
  // (d) the chain still verifies, and the span attestation roll-up counts the sealed case at every ancestor
  const v = verifySealChain(store.state);
  assert.equal(v.chainValid && v.contentValid, true);
  const spans = sealSpanAttestations(store.state, { now: NOW, settings: store.state.settings });
  const bySeat = new Map(spans.map((s) => [s.seatId, s]));
  for (const id of ['lead1', 'mgr1', 'dir1', 'vp1', 'leader']) {
    assert.ok(bySeat.get(id)?.sealedTx >= 1, `sealed transaction attested at ${id}`);
  }
  assert.ok(bySeat.get('lead1').openWork >= 1);
  // (e) scoping under the declared frontline seat: nothing outside the subtree leaks by name
  const scoped = scopeSealSpans(spans, store.state, { settings: store.state.settings });
  assert.equal(scoped.scoped, true);
  const out = scoped.spans.find((s) => s.seatId === '__out-of-scope__');
  assert.ok(out, 'out-of-subtree spans collapse to one aggregate row');
  assert.ok(scoped.spans.every((s) => s.seatId === '__out-of-scope__' || ['lead1', 'ic1', 'ic2'].includes(s.seatId) || s.aggregate));
  assert.equal(scoped.spans.some((s) => s.seatId === 'vp1' && !s.aggregate), false, 'the VP span is not named to the frontline seat');
});

/* ------------------------------------------------------ 10. explicit scan */

test('10. explicit seal.scan always seals and verifies, even with sealing off', () => {
  const { store, api } = boot();
  api.addCase({ title: 'Unsealed', kind: 'risk', ownerId: 'ic1', openedOn: ago(1) });
  assert.equal(sealEventsOf(store.state).length, 0);
  const res = api.sealScan();
  assert.equal(res.ok, true);
  assert.equal(res.verification.chainValid, true);
  assert.equal(sealEventsOf(store.state).length, 1, 'the scan transaction sealed itself');
  assert.ok(store.state.events.some((e) => e.type === SEAL_EVENTS.VERIFIED), 'the verdict is traceable in the log');
  assert.equal(store.state.settings.sealEnabled, false, 'scanning does not silently enable the automatic pass');
  // and the automatic pass stays off afterwards
  api.addCase({ title: 'Still unsealed', kind: 'risk', ownerId: 'ic2', openedOn: ago(1) });
  assert.equal(sealEventsOf(store.state).length, 1);
});

/* ------------------------------------------------------------ 11. gateway */

test('11. seat gateway: reads/verify/scan allowed at any rank; enabling is operator-only', () => {
  const { store, api } = boot({ activeSeatId: 'lead1' });
  assert.equal(api.sealRead().ok, true, 'chain status readable at frontline rank');
  assert.equal(api.sealRead().report.scoped, true, 'scoped to the declared seat');
  assert.equal(api.sealVerify().ok, true);
  assert.equal(api.sealScan().ok, true, 'audit-seal right covers every altitude');
  const enable = api.enableSealing();
  assert.equal(enable.ok, false, 'enabling sealing under a declared seat fails closed');
  assert.equal(enable.code, 'scope-refusal');
  assert.equal(store.state.settings.sealEnabled, false);
  const brief = api.sealBriefText();
  assert.equal(brief.ok, true);
  assert.ok(brief.text.includes('Integrity Certificate'));
});

/* --------------------------------------------- 12. intake altitude routing */

test('12. intake resolves the owning seat/altitude from the reporting tree and owns the case', () => {
  const { store, api } = boot();
  const text = 'Ari Klein missed the filing deadline again and the client is escalating; the schedule is slipping.';
  const analysis = analyzeIntakeText(text, store.state, { now: NOW });
  assert.equal(analysis.insufficient, false, analysis.insufficientReasons);
  const r = analysis.altitudeRouting;
  assert.ok(r, 'altitude routing attached');
  assert.equal(r.ownerNodeId, 'lead1', 'LCA of the managers of the named person = their lead');
  assert.equal(r.ownerPersonId, 'lead1');
  assert.equal(r.altitudeKey, 'frontline');
  assert.deepEqual(r.ancestors.map((a) => a.nodeId), ['lead1', 'mgr1', 'dir1', 'vp1', 'leader'], 'the full ancestor path is computed');
  assert.ok(r.routes.includes('#/oneonones'), 'altitude-appropriate routes come from the frontline duties');
  assert.ok(r.handUp.length >= 1, 'hand-up rules shown');
  assert.equal(analysis.caseSuggestion.ownerId, 'lead1', 'the suggested case is owned by the resolved seat');
  assert.equal(toCaseInput(analysis).ownerId, 'lead1');

  // two people under different leads -> the manager (LCA)
  const two = analyzeIntakeText('Ari Klein and Cy Orlov disagree on the handover; deadline missed, blocked, slipping', store.state, { now: NOW });
  assert.equal(two.altitudeRouting.ownerNodeId, 'mgr1', 'LCA of two leads is the manager');
  assert.equal(two.altitudeRouting.altitudeKey, 'manager');

  // nobody named + declared seat -> the seat owns it
  store.update((d) => { d.settings.activeSeatId = 'dir1'; }, { type: 'seat.switched', entity: 'seat', entityId: 'dir1', summary: 'test' });
  const noPeople = analyzeIntakeText('The vendor delivery is delayed and the backlog is growing past the deadline', store.state, { now: NOW });
  assert.equal(noPeople.altitudeRouting.ownerNodeId, 'dir1', 'falls back to the declared seat');
  assert.equal(noPeople.altitudeRouting.altitudeKey, 'director');

  // end-to-end: confirm the draft -> case owned by the resolved seat
  store.update((d) => { d.settings.activeSeatId = null; }, { type: 'seat.switched', entity: 'seat', entityId: '', summary: 'test back to operator' });
  const saved = api.saveIntakeDraft(text);
  assert.equal(saved.ok, true, saved.error);
  const confirmed = api.confirmIntakeDraft(saved.id);
  assert.equal(confirmed.ok, true, confirmed.error);
  const c = store.state.cases.find((x) => x.id === confirmed.caseId);
  assert.equal(c.ownerId, 'lead1', 'the confirmed case is owned by the altitude-resolved seat');
});

/* ------------------------------------------------------------- 13. the view */

function bootDocument() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => consoleErrors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', {
    url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole,
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { window, document: window.document, consoleErrors };
}

test('13. all four Integrity panels render axe-clean, sealed and unsealed', async () => {
  const { window, document, consoleErrors } = bootDocument();
  try {
    const { store, api } = boot();
    api.enableSealing();
    api.addCase({ title: 'Sealed for the view', kind: 'risk', ownerId: 'ic1', openedOn: ago(1) });
    api.sealScan();
    const axe = (await import('axe-core')).default;
    for (const panel of ['chain', 'spans', 'blocks', 'certificate']) {
      const ctx = {
        api, state: store.state, now: NOW,
        query: new URLSearchParams(`panel=${panel}`),
        navigate() {}, refresh() {},
      };
      const node = renderSeal(ctx);
      document.getElementById('view').replaceChildren(node);
      assert.ok(node.querySelector('h1'), `panel ${panel} has a heading`);
      assert.ok(node.textContent.length > 200, `panel ${panel} is not a placeholder`);
      const results = await axe.run(node, { rules: { region: { enabled: false } } });
      assert.deepEqual(results.violations.map((v) => v.id), [], `axe: ${panel}`);
    }
    // jsdom logs 'Not implemented: canvas getContext' when axe probes colour contrast; that is environment noise, not an app error.
    assert.deepEqual(consoleErrors.filter((m) => !m.startsWith('Not implemented:')), [], 'no jsdom errors');
    // the chain panel shows the verdict and the mode honestly
    const ctx = { api, state: store.state, now: NOW, query: new URLSearchParams('panel=chain'), navigate() {}, refresh() {} };
    const node = renderSeal(ctx);
    assert.ok(node.textContent.includes('Chain VALID'), 'valid chain announced');
    assert.ok(node.textContent.includes('Plain SHA-256') || node.textContent.includes('Keyed HMAC'), 'mode printed honestly');
    assert.ok(node.querySelector('[data-testid="seal-verify"]'));
    assert.ok(node.querySelector('[data-testid="seal-scan"]'));
    // unsealed workspace renders the empty state, not a crash
    const plain = boot();
    const node2 = renderSeal({ api: plain.api, state: plain.store.state, now: NOW, query: new URLSearchParams('panel=chain'), navigate() {}, refresh() {} });
    assert.ok(node2.textContent.includes('Nothing sealed yet'));
    assert.ok(node2.querySelector('[data-testid="seal-enable"]'), 'operator can enable from the surface');
  } finally {
    window.close();
  }
});

test('14. the rule is registered last on the shared spine with a contract', async () => {
  const { contractFor } = await import('../../app/core/domain/propagationContracts.js');
  assert.equal(DEFAULT_POST_COMMIT_RULES[DEFAULT_POST_COMMIT_RULES.length - 1], sealRule, 'sealRule runs last so the seal covers the whole transaction');
  const contract = contractFor(sealRule);
  assert.ok(contract, 'the seal rule has a declared propagation contract');
  assert.deepEqual(contract.writes, ['events']);
  assert.ok(String(contract.purpose).includes('RULE-SEAL-01'));
});
