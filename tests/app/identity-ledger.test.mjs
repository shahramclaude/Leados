/**
 * ADR-0087 — The Attested Commit (Schema v93).
 *
 * Proves, against the REAL store + REAL rule spine + REAL gateway:
 *  - enrollment stores only the PUBLIC half of a credential (salt, 16-hex
 *    fingerprint, HMAC verifier) and never key material or a passphrase;
 *  - the first act under a credential is signed by it: the enroll commit
 *    itself carries a verifiable attestation;
 *  - one operational commit under an unlocked session appends exactly one
 *    `identity.attested` event whose MAC recomputes from (seat|keyId|rev|
 *    digest) and whose digest covers every event the transaction appended
 *    before it — cross-checked by hand, not against the same code path;
 *  - THE CROSS-MODULE × CROSS-ALTITUDE SELF-TEST: one unattributed write under
 *    enforcement opens exactly ONE governed DACI decision per seat per ISO
 *    week AND writes typed `rolls-up-to` edges to the manager, director AND VP
 *    above the acting seat in the SAME transaction — then a second write in
 *    the same week adds no second decision;
 *  - verification is three-valued and honest: no key → "digest-verified · key
 *    unavailable", never "verified"; tampered content → FAILED; vanished
 *    events → EVICTED, counted not hidden;
 *  - the rung-3 checkpoint detects truncation, rewinds and rewrites a hash
 *    chain cannot see, and its MAC binds the document body;
 *  - the gateway refuses unattested writes fail-closed under enforcement while
 *    boundary management (enroll/unlock/lock) stays reachable;
 *  - the attention-market ordering invariant and rule/contract parity survive;
 *  - aggregate-only CSV #82 and the identity-free certificate leak no seat id,
 *    name, fingerprint or MAC;
 *  - all five panels render axe-clean.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState, SCHEMA_VERSION, migrate } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS, describePropagationContracts, DECLINE_MEMO_RULES } from '../../app/core/domain/propagationContracts.js';
import { attentionMarketRule } from '../../app/core/domain/attentionMarketRules.js';
import { identityRule } from '../../app/core/domain/identityRules.js';
import {
  IDENTITY_RULE_IDS, IDENTITY_EVENTS, IDENTITY_DEFAULTS,
} from '../../app/core/domain/identityRegistry.js';
import {
  activeIdentitySession, clearIdentitySession, deriveSeatKeyBytes, registerIdentitySession,
  seatKeyId, seatKeyVerifier, timingSafeEqual,
} from '../../app/core/domain/identitySession.js';
import {
  normalizeSeatIdentities, normalizeIdentitySettings, normalizeIdentityMarkers,
} from '../../app/core/domain/identitySchema.js';
import {
  computeAttestation, parseAttestationEvent, verifyAttestations, identitySpanPosture,
  scopeIdentitySpans, identityReport, identityBriefText, identityCsvRows,
  buildIdentityCheckpoint, verifyIdentityCheckpoint, attestationInput, identityAttentionCount,
} from '../../app/core/domain/identity.js';
import { guardApiCall } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { renderIdentity } from '../../app/views/identity.js';
import { ACTION_RIGHTS, recordPolicy } from '../../app/core/domain/seatRegistry.js';
import { clearSealKey, sha256Hex, hmacSha256Hex } from '../../app/core/domain/sealCrypto.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');

function fixture(overrides = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Root', chainLeaderAltitude: 'chief', activeSeatId: null, ...overrides };
  state.people = [
    { id: 'vp1', name: 'Rina VP', role: 'VP', level: 'vp', managerId: null, status: 'active' },
    { id: 'dir1', name: 'Sam Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mei Manager', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
    { id: 'mgr2', name: 'Ola Manager', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
    { id: 'ic1', name: 'Ari Klein', role: 'Operator', level: 'ic', managerId: 'mgr1', status: 'active' },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Operator', level: 'ic', managerId: 'mgr1', status: 'active' },
    { id: 'ic3', name: 'Cy Orlov', role: 'Operator', level: 'ic', managerId: 'mgr2', status: 'active' },
    { id: 'ic4', name: 'Dee Sorensen', role: 'Operator', level: 'ic', managerId: 'mgr2', status: 'active' },
    { id: 'ic5', name: 'Eli Brandt', role: 'Operator', level: 'ic', managerId: 'mgr1', status: 'active' },
  ];
  return normalizeState(state, { now: NOW }).state;
}

function boot(state = fixture(), clockRef = null) {
  clearIdentitySession();
  clearSealKey();
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  const now = () => (clockRef ? clockRef.value : NOW);
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now, idFactory: (p) => `${p}-test-${++seq}` });
  store.load();
  return { store, api: createApi(store, { now, idFactory: (p) => `${p}-test-${++seq}` }) };
}

const PASS = 'correct-horse-battery-42';

async function enroll(api, seatId, passphrase = PASS) {
  const res = await api.identityEnroll({ seatId, passphrase });
  assert.equal(res.ok, true, res.error);
  return res;
}

function attestations(state) {
  return (state.events || []).filter((e) => e && e.type === IDENTITY_EVENTS.ATTESTED);
}

function unattributedEvents(state) {
  return (state.events || []).filter((e) => e && e.type === 'identity.unattributed');
}

function ruleIdnDecisions(state) {
  return (state.decisions || []).filter((d) => String(d.rationale || '').includes('RULE-IDN-02'));
}

function ruleIdnLinks(state) {
  return (state.links || []).filter((l) => l && l.ruleId === IDENTITY_RULE_IDS.UNATTRIBUTED);
}

/* ------------------------------------------------------------- 1. schema */

test('schema v91 migrates additively; malformed credential rows are dropped, never repaired', () => {
  assert.equal(SCHEMA_VERSION, 96);
  const old = { schemaVersion: 90, settings: { leaderName: 'Keep' }, cases: [{ id: 'keep' }] };
  const migrated = migrate(old);
  assert.equal(migrated.raw.schemaVersion, 96);
  assert.deepEqual(migrated.applied, ['90 → 91', '91 → 92', '92 → 93', '93 → 94', '94 → 95', '95 → 96']);
  assert.deepEqual(migrated.raw.seatIdentities, []);
  assert.deepEqual(migrated.raw.identityMarkers, []);
  assert.equal(migrated.raw.settings.identityEnabled, false);
  assert.equal(migrated.raw.settings.identityEnforced, false);
  assert.equal(migrated.raw.settings.identityIdleMins, 30);

  const warnings = [];
  const dropped = normalizeSeatIdentities([
    { seatId: 'ok', keyId: '0123456789abcdef', salt: 'YWJjZGVmZ2hpamtsbW5vcA==', iterations: 600000, verifier: 'a'.repeat(64), createdAt: NOW.toISOString() },
    { seatId: 'bad', keyId: 'nothex', salt: 'YWJjZGVmZ2hpamtsbW5vcA==', iterations: 600000, verifier: 'a'.repeat(64) },
    { seatId: 'ok', keyId: 'fedcba9876543210', salt: 'YWJjZGVmZ2hpamtsbW5vcA==', iterations: 600000, verifier: 'b'.repeat(64) },
    'not-an-object',
    { seatId: 'cheap', keyId: '0123456789abcdef', salt: 'YWJjZGVmZ2hpamtsbW5vcA==', iterations: 1, verifier: 'c'.repeat(64) },
  ], warnings);
  assert.equal(dropped.length, 1, 'only the one well-formed, unique row survives');
  assert.equal(dropped[0].seatId, 'ok');
  assert.ok(warnings.length >= 3, 'every drop is explained');
  const clamped = normalizeIdentitySettings({ identityIdleMins: 99999, identityEnabled: 'true', identityEnforced: 'no' });
  assert.equal(clamped.identityIdleMins, 480);
  assert.equal(clamped.identityEnabled, true);
  assert.equal(clamped.identityEnforced, false, 'fail-closed: only a real true enables enforcement');
  assert.deepEqual(normalizeIdentityMarkers(['a', 'a', 7, ' b ', 'b']), ['a', 'b']);
  assert.equal(IDENTITY_DEFAULTS.identityEnabled, false);
});

test('credential rows are enterprise material; boundary rights carry honest rank windows', () => {
  assert.equal(recordPolicy('seatIdentities').classKey, 'enterprise');
  assert.equal(recordPolicy('identityMarkers').classKey, 'unit');
  assert.equal(ACTION_RIGHTS['attest-seat-identity'].minRank, 1);
  assert.equal(ACTION_RIGHTS['govern-attestation'].minRank, 3);
});

/* -------------------------------------------------------- 2. enrollment */

test('enrollment stores only the public half — no key material, no passphrase, anywhere in state', async () => {
  const { store, api } = boot();
  await enroll(api, 'mgr1');
  const rows = normalizeSeatIdentities(store.state.seatIdentities);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.seatId, 'mgr1');
  assert.match(row.keyId, /^[0-9a-f]{16}$/);
  assert.match(row.verifier, /^[0-9a-f]{64}$/);
  assert.ok(row.iterations >= 10000);
  const frozen = JSON.stringify(store.state);
  assert.ok(!frozen.includes(PASS), 'the passphrase never touches the workspace');
  const session = activeIdentitySession(NOW.getTime());
  assert.ok(session && session.seatId === 'mgr1', 'enroll unlocks in the same breath');
  // The verifier cannot produce an attestation MAC (PRF one-wayness is not
  // something a test can prove, but the fields are disjoint and typed).
  const fields = Object.keys(row).sort();
  assert.deepEqual(fields, ['createdAt', 'iterations', 'keyId', 'revokedAt', 'rotatedAt', 'salt', 'seatId', 'verifier']);
});

test('weak passphrases are refused and the enrollment commit is itself attested', async () => {
  const { store, api } = boot();
  const weak = await api.identityEnroll({ seatId: 'mgr1', passphrase: 'short' });
  assert.equal(weak.ok, false);
  assert.match(weak.error, /at least 12 characters/);
  await enroll(api, 'mgr1');
  const att = attestations(store.state);
  assert.equal(att.length, 1, 'the enroll commit is the first attested act');
  const parsed = parseAttestationEvent(att[0]);
  assert.equal(parsed.seatId, 'mgr1');
  const v = verifyAttestations(store.state, { keys: new Map([['mgr1', activeIdentitySession(NOW.getTime()).key]]), now: NOW });
  assert.equal(v.counts.verified, 1);
  assert.equal(v.counts.failed, 0);
  // Hand recomputation: MAC over the exact declared input.
  const expected = computeAttestation(activeIdentitySession(NOW.getTime()).key, {
    seatId: parsed.seatId, keyId: parsed.keyId, revision: parsed.rev, digest: parsed.digest,
  });
  assert.equal(expected, parsed.mac, 'the MAC recomputes from the summary fields alone');
  assert.equal(attestationInput('mgr1', parsed.keyId, parsed.rev, parsed.digest),
    `leados-seat-attest-v1|mgr1|${parsed.keyId}|${parsed.rev}|${parsed.digest}`);
});

test('wrong passphrase fails closed, is audited, and unlock attempts are throttled', async () => {
  const { store, api } = boot();
  await enroll(api, 'mgr1');
  api.identityLock();
  assert.equal(activeIdentitySession(NOW.getTime()), null);
  for (let i = 0; i < 5; i += 1) {
    const bad = await api.identityUnlock({ seatId: 'mgr1', passphrase: 'wrong-passphrase-9999' });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /does not match/);
  }
  assert.equal(activeIdentitySession(NOW.getTime()), null, 'nothing unlocks on a wrong passphrase');
  assert.equal((store.state.events || []).filter((e) => e && e.type === IDENTITY_EVENTS.UNLOCK_FAILED).length, 5);
  // The 6th attempt is refused out of hand — even with the CORRECT passphrase
  // the seat must wait out the cooldown. Throttling beats grinding, and it
  // beats the "I know it now" shortcut too.
  const good = await api.identityUnlock({ seatId: 'mgr1', passphrase: PASS });
  assert.equal(good.ok, false, 'even the right passphrase must wait out the cooldown');
  assert.match(good.error, /Too many failed unlock attempts/);
  assert.equal(activeIdentitySession(NOW.getTime()), null);
});

test('an idle session expires honestly — an expired key stops attesting instead of lying', async () => {
  const { store, api } = boot();
  await enroll(api, 'mgr1');
  const key = activeIdentitySession(NOW.getTime()).key;
  registerIdentitySession({ seatId: 'mgr1', keyBytes: key, keyId: seatKeyId(key), expiresAt: NOW.getTime() - 1 });
  assert.equal(activeIdentitySession(NOW.getTime()), null, 'expired on read');
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n1', summary: 'A write after the session expired' });
  assert.equal(attestations(store.state).length, 1, 'only the enroll commit is attested; the expired session signs nothing');
});

/* ----------------------------------------------------- 3. the attestation */

test('ONE operational commit under a session = exactly one attestation whose digest covers the transaction — hand-checked', async () => {
  const { store, api } = boot();
  await enroll(api, 'mgr1');
  const before = attestations(store.state).length;
  const sessionKey = activeIdentitySession(NOW.getTime()).key;
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n1', summary: 'Operational write under an unlocked credential' });
  const att = attestations(store.state);
  assert.equal(att.length, before + 1);
  const parsed = parseAttestationEvent(att[att.length - 1]);
  const events = store.state.events;
  const idx = events.indexOf(att[att.length - 1]);
  // Hand reconstruction of the signed window: the events since the PREVIOUS
  // attestation, tail-capped at 512 — exactly what the rule signed.
  let prevIdx = -1;
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (events[i].type === IDENTITY_EVENTS.ATTESTED) { prevIdx = i; break; }
  }
  const gap = events.slice(prevIdx + 1, idx);
  assert.ok(gap.length >= parsed.evCount);
  const window = gap.slice(-parsed.evCount);
  const { txDigest } = await import('../../app/core/domain/sealChain.js');
  assert.equal(txDigest(window), parsed.digest, 'digest = SHA-256 over exactly the signed window');
  const expected = computeAttestation(sessionKey, {
    seatId: 'mgr1', keyId: parsed.keyId, revision: parsed.rev, digest: parsed.digest,
  });
  assert.equal(expected, parsed.mac);
  const v = verifyAttestations(store.state, { keys: new Map([['mgr1', sessionKey]]), now: NOW });
  assert.equal(v.counts.failed, 0);
  assert.equal(v.counts.mismatch, 0);
});

test('the rule is idempotent by revision — a retried rule run on the same revision signs nothing twice', async () => {
  const { store, api } = boot();
  await enroll(api, 'mgr1');
  const sessionKey = activeIdentitySession(NOW.getTime()).key;
  const before = attestations(store.state).length;
  // Simulate the rule-retry seam: run the rule twice against the SAME draft
  // revision (as a retried post-commit pass would).
  const draft = JSON.parse(JSON.stringify(store.state));
  // store.update bumps the revision BEFORE the rules run; a retried rule pass
  // runs against that same draft revision.
  draft.meta.revision = (draft.meta.revision || 0) + 1;
  let seq = 0;
  const idFactory = (p) => `${p}-rule-${++seq}`;
  const ctx = {
    now: NOW, idFactory, todayStr: '2026-11-04',
    event: { type: 'note.added', entity: 'note', entityId: 'n1', summary: 'retry seam' },
    logEvent: (partial) => {
      const ev = { id: idFactory('ev'), ts: NOW.toISOString(), ...partial };
      draft.events.push(ev);
      return ev;
    },
  };
  draft.events.push({ id: idFactory('ev'), ts: NOW.toISOString(), ...ctx.event });
  identityRule(draft, ctx);
  identityRule(draft, ctx);
  const added = attestations(draft).length - before;
  assert.equal(added, 1, 'one revision, one attestation — retries can never inflate the record');
  const session = { key: sessionKey, keyId: seatKeyId(sessionKey) };
  const v = verifyAttestations(draft, { keys: new Map([['mgr1', session.key]]), now: NOW });
  assert.equal(v.counts.verified, v.counts.total);
});

test('attestation is NOT pausable; breach escalation is', async () => {
  const { store, api } = boot();
  await enroll(api, 'mgr1');
  api.identitySetSettings({ identityAutoPropagate: false, identityEnabled: true });
  const before = attestations(store.state).length;
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n-paused', summary: 'Attestation must survive an automation pause' });
  assert.equal(attestations(store.state).length, before + 1,
    'pausing automation never pauses attestation — that would be a lie');
});

/* --------------- 4. THE CROSS-MODULE × CROSS-ALTITUDE SELF-TEST (§3, §0.3) */

test('ONE unattributed write under enforcement: one governed decision + rolls-up-to manager, director AND VP in the SAME transaction', () => {
  const { store } = boot(fixture({ activeSeatId: 'mgr1', identityEnforced: true, identityEnabled: true }));
  assert.equal(activeIdentitySession(NOW.getTime()), null, 'no credential is unlocked');
  const decisionsBefore = (store.state.decisions || []).length;

  // A write that reaches the store WITHOUT the gateway (import/automation
  // seam): the detection layer must catch it.
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n-unattr', summary: 'A write nobody signed for' });

  const unattr = unattributedEvents(store.state);
  assert.equal(unattr.length, 1, 'one unattributed event per unattributed write');
  assert.match(unattr[0].summary, /seat=mgr1/);

  const decisions = ruleIdnDecisions(store.state);
  assert.equal(decisions.length, 1, 'exactly ONE governed authorship-boundary decision');
  assert.ok((store.state.decisions || []).length === decisionsBefore + 1);
  assert.match(decisions[0].question, /no unlocked seat credential/);
  assert.equal(decisions[0].outcome, 'pending');

  // CROSS-ALTITUDE: the decision climbs EVERY leadership ancestor of mgr1 in
  // the same transaction — mgr1 itself, its director, and its VP — and never
  // the synthetic root.
  const links = ruleIdnLinks(store.state).filter((l) => l.relation === 'rolls-up-to' && l.sourceId === decisions[0].id);
  const targets = new Set(links.map((l) => l.targetId));
  assert.deepEqual([...targets].sort(), ['dir1', 'mgr1', 'vp1'],
    'frontline unattributed write reaches manager, director and VP with zero re-entry');
  assert.ok(!targets.has('leader'), 'the synthetic root is not a person');

  // Marker-idempotent: a SECOND unattributed write in the same ISO week logs
  // its event but must not open a second decision.
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n-unattr-2', summary: 'Another write nobody signed for' });
  assert.equal(unattributedEvents(store.state).length, 2, 'every write is counted');
  assert.equal(ruleIdnDecisions(store.state).length, 1, 'one governed decision per seat per ISO week');
  assert.equal((store.state.identityMarkers || []).filter((m) => m.includes(IDENTITY_RULE_IDS.UNATTRIBUTED)).length, 1);
});

test('with a session unlocked the same write is attested — no breach decision, gateway or not', async () => {
  const { store, api } = boot(fixture({ activeSeatId: 'mgr1', identityEnforced: true }));
  await enroll(api, 'mgr1');
  const before = attestations(store.state).length;
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n-ok', summary: 'Signed work' });
  assert.equal(attestations(store.state).length, before + 1);
  assert.equal(unattributedEvents(store.state).length, 0);
  assert.equal(ruleIdnDecisions(store.state).length, 0);
});

test('session-lifecycle events are never flagged unattributed — the boundary manages itself', async () => {
  const { store, api } = boot(fixture({ activeSeatId: 'mgr1', identityEnforced: true }));
  await enroll(api, 'mgr1');
  api.identityLock();
  assert.equal(unattributedEvents(store.state).length, 0, 'lock/unlock/enroll are boundary maintenance, not unattributed work');
  assert.equal(ruleIdnDecisions(store.state).length, 0);
});

test('RULE-IDN-02 is pausable; the explicit scan path still surfaces the gap', () => {
  const { store } = boot(fixture({ activeSeatId: 'mgr1', identityEnforced: true, identityAutoPropagate: false }));
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n1', summary: 'unattributed while paused' });
  assert.equal(ruleIdnDecisions(store.state).length, 0, 'paused automation opens no work');
  assert.equal(unattributedEvents(store.state).length, 0);
  store.update(() => {}, { type: IDENTITY_EVENTS.SCAN, entity: 'workspace', entityId: '', summary: 'explicit scan' });
  assert.equal(ruleIdnDecisions(store.state).length, 1, 'an explicit scan always runs');
  assert.equal(unattributedEvents(store.state).length, 1);
});

/* --------------------------------------------------------- 5. enforcement */

test('the gateway refuses unattested writes fail-closed under enforcement; boundary management is exempt but rank-gated', async () => {
  const { store, api } = boot(fixture({ activeSeatId: 'mgr1', identityEnforced: true }));
  const denied = guardApiCall(store.state, 'addCase', [{ title: 'Should be refused' }], NOW.getTime());
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'scope-refusal');
  assert.match(denied.error, /enforces attested commits/);
  // Boundary management is exempt from the enforcement gate — you must be
  // able to enroll your way out…
  assert.ok(guardApiCall(store.state, 'identityEnroll', [{ seatId: 'mgr1', passphrase: PASS }], NOW.getTime()).ok);
  assert.ok(guardApiCall(store.state, 'identityRead', [], NOW.getTime()).ok, 'reads never need a credential');
  // …but GOVERNING the boundary is director+ (govern-attestation, rank 3–5):
  // a manager may not switch enforcement off on their own authority.
  const usurp = guardApiCall(store.state, 'identitySetSettings', [{ identityEnforced: false }], NOW.getTime());
  assert.equal(usurp.ok, false);
  assert.match(usurp.error, /rank window/);
  const { store: vpStore } = boot(fixture({ activeSeatId: 'vp1', identityEnforced: true }));
  assert.ok(guardApiCall(vpStore.state, 'identitySetSettings', [{ identityEnforced: false }], NOW.getTime()).ok, 'the VP may govern the boundary');
  await enroll(api, 'mgr1');
  const allowed = guardApiCall(store.state, 'addCase', [{ title: 'Signed work' }], NOW.getTime());
  assert.equal(allowed.ok, true, 'with a session unlocked, writes pass');
});

test('under a declared seat you may only manage your own credential', async () => {
  const { api } = boot(fixture({ activeSeatId: 'mgr1' }));
  const gate = await api.identityEnroll({ seatId: 'vp1', passphrase: PASS });
  assert.equal(gate.ok, false);
  assert.match(gate.error, /your own operating seat/);
  const own = await api.identityEnroll({ seatId: 'mgr1', passphrase: PASS });
  assert.equal(own.ok, true, own.error);
});

/* --------------------------------------------- 6. verification honesty */

test('verification is three-valued: no key → digest-verified (never verified); tamper → FAILED; vanished events → EVICTED', async () => {
  const { store, api } = boot();
  await enroll(api, 'mgr1');
  const sessionKey = activeIdentitySession(NOW.getTime()).key;
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n1', summary: 'work' });

  // No key: honest unverifiable.
  const noKey = verifyAttestations(store.state, { keys: new Map(), now: NOW });
  assert.equal(noKey.counts.verified, 0);
  assert.equal(noKey.counts.digestOnly, 2);
  assert.ok(noKey.rows.every((r) => r.verdict === 'digest-verified · key unavailable'));

  // With key: verified.
  const withKey = verifyAttestations(store.state, { keys: new Map([['mgr1', sessionKey]]), now: NOW });
  assert.equal(withKey.counts.verified, 2);

  // Tamper with a signed event's content → structure mismatch + FAILED.
  const tampered = JSON.parse(JSON.stringify(store.state));
  const signedIdx = tampered.events.findIndex((e) => e.type === IDENTITY_EVENTS.ATTESTED);
  const victim = tampered.events.findIndex((e, i) => i < signedIdx && e.type === 'identity.enroll');
  tampered.events[victim].summary = 'TAMPERED';
  const afterTamper = verifyAttestations(tampered, { keys: new Map([['mgr1', sessionKey]]), now: NOW });
  assert.equal(afterTamper.counts.mismatch + afterTamper.counts.failed > 0, true);
  assert.ok(afterTamper.rows.some((r) => r.verdict === 'FAILED'), 'content tampering is a FAILED verdict, not a shrug');

  // Vanish events from a signed window → EVICTED, counted not hidden.
  const vanished = JSON.parse(JSON.stringify(store.state));
  vanished.events.splice(signedIdx - 1, 1);
  const afterVanish = verifyAttestations(vanished, { keys: new Map([['mgr1', sessionKey]]), now: NOW });
  assert.ok(afterVanish.counts.evicted > 0, 'vanished events read as evicted — honest, never silently passed');

  // Forging under the WRONG key fails; the stored verifier cannot produce MACs.
  const wrongKey = await deriveSeatKeyBytes({ passphrase: 'another-passphrase-123', salt: 'YWJjZGVmZ2hpamtsbW5vcA==', iterations: 10000, cryptoRef: globalThis.crypto });
  const wrong = verifyAttestations(store.state, { keys: new Map([['mgr1', wrongKey]]), now: NOW });
  assert.equal(wrong.counts.verified, 0);
  assert.ok(wrong.counts.failed >= 2, 'a wrong credential fails every MAC');
});

test('the identity scan records its verdict in the same log it verifies', async () => {
  const { store, api } = boot();
  await enroll(api, 'mgr1');
  const res = api.identityScan();
  assert.equal(res.ok, true);
  const verified = (store.state.events || []).filter((e) => e && e.type === IDENTITY_EVENTS.VERIFIED);
  assert.equal(verified.length, 1);
  assert.match(verified[0].summary, /Attestation verification/);
});

/* --------------------------------------------------- 7. cross-altitude posture */

test('span posture rolls up the chain of command — a seat’s counts reach every leadership ancestor, and peer detail stays hidden', async () => {
  const { store, api } = boot(fixture({ activeSeatId: 'mgr1' }));
  await enroll(api, 'mgr1');
  const sessionKey = activeIdentitySession(NOW.getTime()).key;
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n1', summary: 'mgr1 work' });
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n2', summary: 'mgr1 work again' });

  const posture = identitySpanPosture(store.state, { now: NOW, keys: new Map([['mgr1', sessionKey]]) });
  const row = (id) => posture.find((r) => r.seatId === id);
  assert.equal(row('mgr1').attestedTx, 3, 'enroll + two writes');
  assert.equal(row('mgr1').ownAttestedTx, 3);
  assert.equal(row('dir1').attestedTx, 3, 'the director inherits the count — zero re-entry');
  assert.equal(row('dir1').ownAttestedTx, 0);
  assert.equal(row('vp1').attestedTx, 3, 'so does the VP');
  assert.equal(row('mgr1').enrolled, true);
  assert.equal(row('dir1').enrolled, false);
  assert.equal(row('dir1').enrolledSubtree, 1, 'the director sees one enrolled credential below');

  // Seat scoping: a director must not see a VP-row detail — out-of-subtree
  // spans collapse to one aggregate row while counts survive upward.
  const scoped = scopeIdentitySpans(posture, fixture({ activeSeatId: 'dir1' }), { settings: fixture({ activeSeatId: 'dir1' }).settings });
  assert.equal(scoped.scoped, true);
  const outRow = scoped.spans.find((r) => r.seatId === '__out-of-scope__');
  assert.ok(outRow && outRow.aggregate, 'the VP row collapsed to an aggregate');
  assert.ok(scoped.spans.some((r) => r.seatId === 'mgr1'), 'own subtree stays detailed');
  assert.ok(!scoped.spans.some((r) => r.seatId === 'vp1'), 'peer/parent detail is not printed sideways');
});

/* ------------------------------------------------------- 8. checkpoints */

test('checkpoints anchor the tail: truncation, rewinds and replaced blocks are detected, the MAC binds the body', async () => {
  const { store, api } = boot(fixture({ sealEnabled: true }));
  api.enableSealing();
  await enroll(api, 'mgr1');
  const checkpoint = api.identityCheckpoint();
  assert.equal(checkpoint.ok, true);
  assert.equal(checkpoint.signed, true);
  assert.match(checkpoint.text, /checkpoint-mac=[0-9a-f]{64}/);

  // Nothing moved: the anchor holds.
  const same = api.identityCompareCheckpoint(checkpoint.text);
  assert.equal(same.verdict, 'chain-advanced');
  assert.equal(same.macVerdict, 'verified');

  // Advance the workspace: still fine.
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n1', summary: 'more work' });
  assert.equal(api.identityCompareCheckpoint(checkpoint.text).verdict, 'chain-advanced');

  // TRUNCATION: the anchor sees what the chain cannot.
  const truncated = JSON.parse(JSON.stringify(store.state));
  truncated.events = truncated.events.slice(0, Math.max(1, checkpoint.eventCount - 2));
  const trunc = verifyIdentityCheckpoint(truncated, checkpoint.text, { now: NOW, session: activeIdentitySession(NOW.getTime()) });
  assert.equal(trunc.verdict, 'TRUNCATED');
  assert.match(trunc.detail, /truncated/);

  // REWIND: a lower revision than the anchor.
  const rewound = JSON.parse(JSON.stringify(store.state));
  rewound.meta.revision = 0;
  assert.equal(verifyIdentityCheckpoint(rewound, checkpoint.text, { now: NOW, session: activeIdentitySession(NOW.getTime()) }).verdict, 'REWOUND');

  // REWRITTEN: same event count as the anchor, but the sealed blocks were
  // replaced — the anchored chain head no longer matches.
  const rewritten = JSON.parse(JSON.stringify(store.state));
  rewritten.events = rewritten.events.slice(0, checkpoint.eventCount);
  const sealEvent = [...rewritten.events].reverse().find((e) => e && e.type === 'audit.seal');
  assert.ok(sealEvent, 'the anchor point is a sealed block');
  const flip = (hex) => (hex[0] === '0' ? '1' : '0') + hex.slice(1);
  sealEvent.summary = sealEvent.summary.replace(/seal=([0-9a-f]{64})/, (_, hex) => `seal=${flip(hex)}`);
  if (/^[0-9a-f]{64}$/.test(sealEvent.entityId || '')) sealEvent.entityId = flip(sealEvent.entityId);
  const rew = verifyIdentityCheckpoint(rewritten, checkpoint.text, { now: NOW, session: activeIdentitySession(NOW.getTime()) });
  assert.equal(rew.verdict, 'REWRITTEN', 'a replaced block head is detected, never a calm chain-advanced');

  // The MAC binds the BODY: alter one well-formed digit and the document
  // still parses, still compares — but its signature no longer computes.
  const doctored = checkpoint.text.replace(/Workspace revision: (\d+)/, (_m, n) => `Workspace revision: ${Number(n) + 5}`);
  const doctor = api.identityCompareCheckpoint(doctored);
  assert.equal(doctor.macVerdict, 'FAILED', 'the document body is signed, not just its counts');
});

test('an unsigned checkpoint says so — structure only, anyone could have written it', async () => {
  const { store, api } = boot();
  api.identityLock();
  const checkpoint = api.identityCheckpoint();
  assert.equal(checkpoint.signed, false);
  assert.match(checkpoint.text, /checkpoint-mac=UNSIGNED/);
  assert.match(checkpoint.text, /UNSIGNED checkpoint/);
  void store;
});

/* ------------------------------------------- 9. CSV, brief, attention */

test('CSV #82 and the certificate carry counts only — no seat id, name, fingerprint or MAC', async () => {
  const { store, api } = boot();
  await enroll(api, 'mgr1');
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n1', summary: 'work' });
  assert.equal(CSV_EXPORTS.length, 91);
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'seat-attestation'));
  const out = exportWorkspaceCsv(store.state, 'seat-attestation', { now: NOW });
  assert.equal(out.ok, true, out.error);
  assert.ok(!out.csv.includes('mgr1'), 'no seat id');
  assert.ok(!out.csv.includes('Mei'), 'no name');
  const row = identityCsvRows(store.state, { now: NOW });
  const ws = row.find((r) => r.scope === 'workspace');
  assert.equal(ws.attested_tx, 2);
  assert.equal(ws.verified_rate_pct, '', 'below the 5-transaction floor a rate is BLANK, never 0');
  assert.ok(ws.verdict.length > 0);

  const brief = identityBriefText(identityReport(store.state, { now: NOW }));
  assert.ok(!brief.includes('Mei'));
  assert.ok(!brief.includes(PASS));
  assert.match(brief, /digest-verified, key unavailable/);
  assert.match(brief, /Not claimed: third-party non-repudiation/);
  assert.equal(identityAttentionCount(store.state, { now: NOW }), 0, 'nothing is wrong yet');

  // A failed MAC becomes attention.
  const sessionKey = activeIdentitySession(NOW.getTime()).key;
  registerIdentitySession({ seatId: 'mgr1', keyBytes: sessionKey, keyId: seatKeyId(sessionKey), expiresAt: Infinity });
  const forged = JSON.parse(JSON.stringify(store.state));
  forged.events.push({
    id: 'ev-forged', ts: NOW.toISOString(), type: IDENTITY_EVENTS.ATTESTED, entity: 'seat',
    entityId: 'f'.repeat(64),
    summary: `seat=mgr1 key=0123456789abcdef rev=999 ev=1 digest=${'0'.repeat(64)} mode=hmac`,
  });
  const forgedReport = identityReport(forged, { now: NOW });
  assert.ok(forgedReport.verification.counts.failed + forgedReport.verification.counts.mismatch > 0);
  assert.ok(identityAttentionCount(forged, { now: NOW }) > 0, 'the nav badge counts it');
});

/* ------------------------------------------------- 10. wiring invariants */

test('the spine keeps its ordering invariants and every rule has a contract', () => {
  const idxAttention = DEFAULT_POST_COMMIT_RULES.indexOf(attentionMarketRule);
  const idxIdentity = DEFAULT_POST_COMMIT_RULES.indexOf(identityRule);
  assert.ok(idxIdentity >= 0, 'the identity rule is on the spine');
  assert.ok(idxIdentity < idxAttention, 'attestation runs BEFORE the market so the integrity decision is priced as work');
  const derivedAfter = DEFAULT_POST_COMMIT_RULES.slice(idxAttention + 1).map((r) => r.id);
  assert.deepEqual(derivedAfter, ['successionRule', 'seatRule', 'sealRule'],
    'the market still runs last among work-producing rules (ADR-0047 invariant preserved)');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-1)?.id, 'sealRule', 'the seal still closes every transaction — and covers the attestation');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-2)?.id, 'seatRule');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === identityRule);
  assert.ok(contract, 'the identity rule declares a contract');
  assert.match(contract.purpose, /RULE-IDN-01/);
  assert.match(contract.purpose, /RULE-IDN-02/);
  assert.ok(!DECLINE_MEMO_RULES.has(identityRule), 'the attestation rule is never decline-memo-skipped');
  const described = describePropagationContracts();
  assert.equal(described.length, PROPAGATION_CONTRACTS.length, 'rule/contract parity');
});

test('inert workspaces are byte-for-byte unchanged: no enrollment, no attestation, no marker', () => {
  const { store } = boot();
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n1', summary: 'ordinary work' });
  assert.equal(attestations(store.state).length, 0);
  assert.equal(unattributedEvents(store.state).length, 0);
  assert.equal((store.state.identityMarkers || []).length, 0);
  assert.equal((store.state.seatIdentities || []).length, 0);
});

/* ------------------------------------------------------ 11. accessibility */

function bootDocument() {
  const vc = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole: vc });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Event = dom.window.Event;
  return dom;
}

test('all five panels render axe-clean with semantic, keyboard-usable markup', async () => {
  const dom = bootDocument();
  const { store, api } = boot(fixture({ activeSeatId: 'mgr1', identityEnforced: true }));
  await enroll(api, 'mgr1');
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n1', summary: 'work' });
  const axe = (await import('axe-core')).default;
  for (const panel of ['session', 'ledger', 'rollup', 'checkpoint', 'brief']) {
    const ctx = {
      state: store.state, api, now: NOW, query: new URLSearchParams(`panel=${panel}`),
      navigate: () => {}, refresh: () => {}, seatContext: null, warnings: [],
    };
    const node = renderIdentity(ctx);
    document.getElementById('view').replaceChildren(node);
    const results = await axe.run(node, { rules: { region: { enabled: false } } });
    assert.deepEqual(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })), [], `axe: ${panel}`);
    assert.ok(node.querySelector('h1'), `${panel}: one page heading`);
  }
  dom.window.close();
});

/* ------------------------------------------- 12. seal composition (rungs 1+2) */

test('the seal covers the attestation: one seal block digests the attestation event itself (rungs compose)', async () => {
  clearIdentitySession();
  clearSealKey();
  const { store, api } = boot(fixture({ sealEnabled: true }));
  api.enableSealing();
  await enroll(api, 'mgr1');
  const before = attestations(store.state).length;
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n1', summary: 'sealed and attested' });
  assert.equal(attestations(store.state).length, before + 1);
  const { verifySealChain, parseSealEvent } = await import('../../app/core/domain/sealChain.js');
  const chain = verifySealChain(store.state);
  assert.equal(chain.chainValid, true);
  assert.equal(chain.contentValid, true);
  // The attestation sits INSIDE a sealed block: a seal closes the transaction
  // after the attestation, covering it.
  const events = store.state.events;
  const lastAttestIdx = events.map((e, i) => [e, i]).filter(([e]) => e.type === IDENTITY_EVENTS.ATTESTED).pop()[1];
  let sealAfter = null;
  for (let i = lastAttestIdx + 1; i < events.length; i += 1) {
    const parsed = parseSealEvent(events[i]);
    if (parsed) { sealAfter = parsed; break; }
  }
  assert.ok(sealAfter, 'a seal closes the transaction after the attestation');
  const v = verifyAttestations(store.state, { keys: new Map([['mgr1', activeIdentitySession(NOW.getTime()).key]]), now: NOW });
  assert.equal(v.counts.verified, v.counts.total, 'every attestation verifies under the session key');
});

/* ------------------------------------------- 13. settings + rotation */

test('rotation replaces the credential; revoked credentials verify as key-unavailable, never as failed', async () => {
  const { store, api } = boot();
  await enroll(api, 'mgr1');
  const firstKeyId = activeIdentitySession(NOW.getTime()).keyId;
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n1', summary: 'under the first key' });
  const rotated = await api.identityRotate({ seatId: 'mgr1', passphrase: 'rotated-passphrase-77777' });
  assert.equal(rotated.ok, true, rotated.error);
  assert.notEqual(rotated.keyId, firstKeyId, 'a new passphrase is a new credential');
  store.update(() => {}, { type: 'note.added', entity: 'note', entityId: 'n2', summary: 'under the second key' });
  assert.equal(normalizeSeatIdentities(store.state.seatIdentities).length, 1, 'one row per seat — rotation replaces');
  const rows = normalizeSeatIdentities(store.state.seatIdentities);
  assert.ok(rows[0].rotatedAt, 'rotation is on the record');

  // Revoke: past attestations of the retired key read as key-unavailable.
  api.identityRevoke({ seatId: 'mgr1' });
  assert.equal(normalizeSeatIdentities(store.state.seatIdentities).length, 0);
  const v = verifyAttestations(store.state, { keys: new Map(), now: NOW });
  assert.equal(v.counts.failed, 0, 'revocation is not forgery');
  assert.ok(v.counts.digestOnly > 0, 'retired credentials honestly read “key unavailable”');

  const settings = api.identitySetSettings({ identityIdleMins: 45 });
  assert.equal(settings.ok, true);
  assert.equal(settings.settings.identityIdleMins, 45);
  const bad = api.identitySetSettings({ sealEnabled: true });
  assert.equal(bad.ok, false, 'only identity conventions are settable here');
});

test('timing-safe compare and verifier binding behave', async () => {
  const key = await deriveSeatKeyBytes({ passphrase: PASS, salt: 'YWJjZGVmZ2hpamtsbW5vcA==', iterations: 10000, cryptoRef: globalThis.crypto });
  assert.ok(key instanceof Uint8Array);
  const v1 = seatKeyVerifier(key, 'mgr1');
  const v2 = seatKeyVerifier(key, 'vp1');
  assert.notEqual(v1, v2, 'the verifier binds the seat id');
  assert.equal(timingSafeEqual(v1, v1), true);
  assert.equal(timingSafeEqual(v1, v2), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  // Sanity on the HMAC primitive underpinning everything.
  assert.equal(hmacSha256Hex(key, 'x').length, 64);
  assert.equal(sha256Hex('x').length, 64);
});
