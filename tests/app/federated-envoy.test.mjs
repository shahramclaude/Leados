/**
 * ADR-0088 — the Federated Envoy (`#/envoy`).
 *
 * Cross-module and cross-altitude by construction: these tests build a packet
 * in one workspace, verify and ingest it in a second, and then prove that the
 * ingest wrote the chain-of-command carriage, opened exactly one governed
 * reconciliation decision on divergence, refused a tampered packet without
 * writing anything, and never let a person's name into an aggregate export.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  LINK_ENTITY_COLLECTIONS,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  SYSTEM_GENERATED_LINK_RELATIONS,
  resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { registerSealKey, clearSealKey } from '../../app/core/domain/sealCrypto.js';
import {
  contentHashOf,
  merkleRootOf,
  packetIdentity,
  verifyPacket,
  envoyReport,
  envoyBriefText,
  envoyCsvRows,
  workspaceIdentity,
} from '../../app/core/domain/envoy.js';
import { renderEnvoy } from '../../app/views/envoy.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const DAY = 86400000;

function fixture({ createdAt = NOW, keyed = false } = {}) {
  const state = createEmptyState(createdAt.toISOString());
  for (const key of Object.keys(state.settings)) if (key.endsWith('AutoPropagate')) state.settings[key] = false;
  state.settings.envoyAutoPropagate = true;
  // Plain-mode tests opt out of the keyed requirement explicitly; the default is
  // "require keyed", and one test below proves that default refuses a plain packet.
  state.settings.envoyRequireKeyedSignature = keyed;
  state.people = [
    { id: 'vp1', name: 'Vera Executive', role: 'VP', level: 'vp', team: 'Ops', status: 'active' },
    { id: 'dir1', name: 'Dana Director', role: 'Director', level: 'director', team: 'Ops', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mira Manager', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active' },
    { id: 'mgr2', name: 'Malik Manager', role: 'Manager', level: 'manager', team: 'Claims', managerId: 'dir1', status: 'active' },
    { id: 'ic1', name: 'Ira Analyst', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'mgr1', status: 'active' },
    { id: 'ic2', name: 'Ida Analyst', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'mgr1', status: 'active' },
    { id: 'ic3', name: 'Ivo Analyst', role: 'Analyst', level: 'ic', team: 'Claims', managerId: 'mgr2', status: 'active' },
  ];
  state.cases = [
    {
      id: 'case-critical', title: 'Statutory ledger close is running without a named approver',
      kind: 'risk', status: 'open', ownerId: 'ic1', openedOn: '2026-10-20',
      fmea: { severity: 9, probability: 4, detectability: 6 },
      financial: { currency: 'DKK', optimistic: 100000, mostLikely: 120000, pessimistic: 160000 },
    },
    {
      id: 'case-watch', title: 'Billing run needs a manual reconciliation step',
      kind: 'quality', status: 'open', ownerId: 'ic2', openedOn: '2026-10-28',
      fmea: { severity: 4, probability: 3, detectability: 4 },
    },
  ];
  state.decisions = [
    {
      id: 'decision-open', title: 'Whether to dual-run the ledger for one month',
      question: 'Dual-run or cut over?', date: '2026-10-29', reversibility: 'reversible',
      chosen: '', createdAt: '2026-10-29T09:00:00.000Z',
    },
  ];
  state.mandates = [
    {
      id: 'mandate-accepted', sourceType: 'case', sourceId: 'case-critical',
      fromSeatId: 'mgr1', toSeatId: 'ic1', status: 'accepted',
      outcome: 'A written ledger close runbook with a named approver', actions: ['commit'],
      effortDays: 4, expiresOn: '2026-12-01', createdAt: '2026-10-30T09:00:00.000Z',
      history: [],
    },
  ];
  state.catchballPacts = [
    {
      id: 'pact-week45', title: 'Close the ledger on time in week 45', toSeatId: 'mgr1',
      status: 'agreed', horizonDays: 7, roundCount: 3,
      leadingTargetPct: 90, laggingTargetPct: 95, createdAt: '2026-10-31T09:00:00.000Z',
    },
  ];
  return normalizeState(state, { now: createdAt }).state;
}

function harness({ state = fixture(), start = NOW } = {}) {
  const mem = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  let serial = 0;
  let current = start;
  const idFactory = (prefix) => `${prefix}-test-${++serial}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { api, store, setNow: (date) => { current = date; } };
}

/**
 * `store.load()` deliberately clears any registered session key (the workspace
 * is locked until a passphrase opens it), so the key is registered AFTER the
 * harness exists — exactly as the vault does at unlock time.
 */
const withKey = (fn) => {
  try { return fn(); } finally { clearSealKey(); }
};

/* ------------------------------------------------------------------ schema */

test('additive with no schema bump: collections, graph vocabulary, spine and exports', () => {
  assert.equal(SCHEMA_VERSION, 112, 'ADR-0088 added no bump of its own; ADR-0103 is the current additive version (this assertion was stale at 97 on main and is repaired here)');
  const migrated = migrate({ schemaVersion: 92, settings: { leaderName: 'Keep me' }, people: [] });
  assert.deepEqual(migrated.applied, ['92 → 93', '93 → 94', '94 → 95', '95 → 96', '96 → 97', '97 → 98', '98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113', '113 → 114', '114 → 115', '115 → 116', '116 → 117', '117 → 118', '118 → 119']);
  assert.equal(migrated.raw.settings.leaderName, 'Keep me');
  const empty = createEmptyState(NOW.toISOString());
  for (const key of ['exchangePackets', 'exchangeArtefacts', 'exchangeMarkers']) {
    assert.deepEqual(empty[key], [], `${key} is an empty collection, not a fabricated exchange`);
  }
  assert.equal(empty.settings.envoyMaxItems, 60);
  assert.equal(empty.settings.envoyRequireKeyedSignature, true);
  assert.equal(empty.settings.envoyAttributionRiskFloorPct, undefined);
  assert.equal(LINK_ENTITY_COLLECTIONS.exchangepacket, 'exchangePackets');
  assert.ok(LINK_ENTITY_TYPES.includes('exchangepacket'));
  for (const relation of ['carries', 'reconciles']) {
    assert.ok(LINK_RELATIONS.includes(relation), relation);
    assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes(relation), `${relation} is written only by rules`);
  }
  assert.equal(ACTION_RIGHTS['exchange-packets'].minRank, 1);
  const names = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.name);
  // Position is by dependency, not by seniority: the envoy reads ingested packets
  // and opens decisions the market then prices, so it sits before the final
  // work-producing pass and before the seat audit and the seal.
  assert.ok(names.indexOf('envoyRule') > names.indexOf('boardRule'));
  assert.ok(names.indexOf('envoyRule') < names.indexOf('attentionMarketRule'));
  assert.equal(names.at(-1), 'sealRule', 'the seal still covers every write, including an ingest');
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'rule/contract parity');
  // The scope is appended after every scope that existed when it shipped; a
  // later session appending its own must not break this, so ORDER is asserted.
  assert.ok(CSV_EXPORTS.findIndex((s) => s.key === 'operating-cadence') < CSV_EXPORTS.findIndex((s) => s.key === 'federated-exchange'));
  assert.equal(CSV_EXPORTS.filter((s) => s.key === 'federated-exchange').length, 1, 'registered exactly once');
});

/* ------------------------------------------------------------------ compose */

test('compose projects the payload at the receiving altitude and commits it', () => {
  const { api, store } = harness();
  const toManager = api.envoyCompose({ recipientSeatId: 'mgr1', purpose: 'Week 45 close-up' });
  assert.equal(toManager.ok, true, toManager.error);
  const packet = toManager.packet;
  assert.equal(packet.format, 'leados.envoy.packet');
  assert.equal(packet.recipientAltitudeKey, 'manager');
  assert.equal(packet.recipientClass, 'names');
  assert.ok(packet.items.length >= 4, 'cases, a decision, a mandate and a pact all travel at names');
  assert.ok(packet.items.some((item) => item.kind === 'case' && item.fields.title), 'a manager may hold titles');
  assert.equal(packet.attestation.items >= 4, true);
  assert.equal(packet.attestation.openCritical, 1, 'one open case clears severity 7');
  assert.equal(packet.attestation.valueAtStake.length, 1);
  assert.equal(packet.attestation.valueAtStake[0].currency, 'DKK');
  assert.ok(packet.attestation.valueAtStake[0].amount >= 100000, 'the PERT expected value the whole app uses, not a second definition');

  // Every hash a receiver can recompute agrees with the packet.
  const verdict = verifyPacket(packet, { settings: store.state.settings, localSchemaVersion: SCHEMA_VERSION });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.failures));
  for (const item of packet.items) {
    assert.equal(contentHashOf(item.kind, item.fields), item.contentHash);
  }
  assert.equal(merkleRootOf(packet.items.map((i) => i.contentHash)), packet.merkleRoot);
  assert.equal(
    packetIdentity({ merkleRoot: packet.merkleRoot, originWorkspaceId: packet.originWorkspaceId, recipientAltitudeKey: packet.recipientAltitudeKey, createdAt: packet.createdAt }),
    packet.packetId,
  );
  assert.equal(packet.signature.keyed, false);
  const row = store.state.exchangePackets.find((r) => r.id === toManager.recordId);
  assert.equal(row.direction, 'outbound');
  assert.equal(row.itemCount, packet.items.length);
  assert.equal(store.state.events.filter((e) => e.type === 'automation.rule_error').length, 0);

  // The same span addressed to the chief loses every title, and says what it lost.
  const toChief = api.envoyCompose({ purpose: 'Board line' });
  assert.equal(toChief.ok, true, toChief.error);
  assert.equal(toChief.packet.recipientClass, 'aggregate');
  assert.equal(toChief.packet.items.some((item) => 'title' in item.fields), false, 'no title survives an aggregate projection');
  assert.ok(toChief.packet.items.every((item) => ['aggregate'].includes(item.cls)));
  assert.ok(toChief.packet.attestation.items >= toChief.packet.items.length);
});

test('a keyed signature is required by default, and the two modes are not the same claim', () => {
  // Default settings: keyed required, and this packet is plain → refused.
  const plain = harness({ state: fixture({ keyed: true }) });
  clearSealKey();
  const built = plain.api.envoyCompose({ recipientSeatId: 'mgr1' });
  assert.equal(built.ok, true, built.error);
  assert.equal(built.packet.signature.keyed, false);
  const refused = plain.api.envoyIngest(built.text);
  assert.equal(refused.ok, false);
  assert.equal(refused.failures[0].code, 'signature-required');
  assert.equal(plain.store.state.exchangePackets.find((r) => r.direction === 'inbound').status, 'refused');
  assert.equal(plain.store.state.exchangeArtefacts.length, 0, 'a refused packet writes no artefact');

  // Keyed: the same workspace signs with the session key and verifies cleanly.
  withKey(() => {
    const keyed = harness({ state: fixture({ keyed: true }) });
    registerSealKey('a-test-session-key-for-the-envoy-protocol');
    const signed = keyed.api.envoyCompose({ recipientSeatId: 'mgr1' });
    assert.equal(signed.packet.signature.keyed, true);
    assert.equal(signed.packet.signature.alg, 'hmac-sha256');
    const verdict = verifyPacket(signed.text, { settings: keyed.store.state.settings, localSchemaVersion: SCHEMA_VERSION });
    assert.equal(verdict.ok, true, JSON.stringify(verdict.failures));
    // Without the key, a keyed packet cannot be verified — and says so.
    clearSealKey();
    const noKey = verifyPacket(signed.text, { settings: keyed.store.state.settings, localSchemaVersion: SCHEMA_VERSION });
    assert.equal(noKey.ok, false);
    assert.equal(noKey.failures[0].code, 'signature');
  });
});

test('tampering is localised: an edited item, a rewritten root and a re-dated packet all fail', () => {
  const { api, store } = harness();
  const built = api.envoyCompose({ recipientSeatId: 'mgr1' });
  const original = JSON.parse(built.text);

  const editedItem = JSON.parse(JSON.stringify(original));
  const target = editedItem.items.find((item) => item.kind === 'case');
  target.fields.title = 'A different title entirely';
  const itemVerdict = verifyPacket(editedItem, { settings: store.state.settings, localSchemaVersion: SCHEMA_VERSION });
  assert.equal(itemVerdict.ok, false);
  assert.ok(itemVerdict.failures.some((f) => f.code === 'item-hash'), 'the altered leaf is named');

  const rewrittenRoot = JSON.parse(JSON.stringify(original));
  rewrittenRoot.merkleRoot = 'f'.repeat(64);
  const rootVerdict = verifyPacket(rewrittenRoot, { settings: store.state.settings, localSchemaVersion: SCHEMA_VERSION });
  assert.equal(rootVerdict.ok, false);
  assert.ok(rootVerdict.failures.some((f) => f.code === 'merkle-root'));

  const redated = JSON.parse(JSON.stringify(original));
  redated.createdAt = '2026-11-05T00:00:00.000Z';
  const idVerdict = verifyPacket(redated, { settings: store.state.settings, localSchemaVersion: SCHEMA_VERSION });
  assert.equal(idVerdict.ok, false);
  assert.ok(idVerdict.failures.some((f) => f.code === 'packet-id'));

  const ahead = JSON.parse(JSON.stringify(original));
  ahead.schemaVersion = 999;
  const schemaVerdict = verifyPacket(ahead, { settings: store.state.settings, localSchemaVersion: SCHEMA_VERSION });
  assert.equal(schemaVerdict.ok, false);
  assert.ok(schemaVerdict.failures.some((f) => f.code === 'schema-ahead'));
});

/* ------------------------------------------------------------------- ingest */

test('one ingest carries the packet up every ancestor, in one transaction', () => {
  const producer = harness();
  const consumer = harness({ state: fixture({ createdAt: new Date(NOW.getTime() + DAY) }) });
  const built = producer.api.envoyCompose({ recipientSeatId: 'mgr1', purpose: 'Week 45 close-up' });
  assert.ok(consumer.api.setActiveSeat('mgr1').ok);
  const res = consumer.api.envoyIngest(built.text);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.counts.imported, built.packet.items.length);
  assert.equal(res.counts.diverged, 0);

  const packetRow = consumer.store.state.exchangePackets.find((row) => row.direction === 'inbound');
  const carries = consumer.store.state.links.filter((link) => link.ruleId === 'RULE-ENV-01' && link.sourceId === packetRow.id);
  const targets = carries.map((link) => link.targetId).sort();
  assert.deepEqual(targets, ['dir1', 'mgr1', 'vp1'], 'the receiving span and both ancestors, in the same transaction');
  assert.ok(carries.every((link) => link.relation === 'carries' && link.targetType === 'person'));

  // The packet is a navigable graph node; its payload is not projected into it.
  const resolved = resolveLinkedEntity(consumer.store.state, 'exchangepacket', packetRow.id);
  assert.ok(resolved);
  assert.match(resolved.route, /^#\/envoy\?panel=packets&packet=/);
  assert.doesNotMatch(resolved.title, /ledger/i, 'the packet node names the altitude and count, never a foreign title');

  // Idempotent: the identical packet again changes nothing.
  const before = consumer.store.state.exchangeArtefacts.length;
  const again = consumer.api.envoyIngest(built.text);
  assert.equal(again.ok, true);
  assert.equal(again.duplicatePacket, true);
  assert.equal(consumer.store.state.exchangeArtefacts.length, before);
  assert.equal(consumer.store.state.events.filter((e) => e.type === 'automation.rule_error').length, 0);
});

test('a divergence never overwrites the local record and opens exactly one decision', () => {
  const producer = harness();
  const consumer = harness({ state: fixture({ createdAt: new Date(NOW.getTime() + DAY) }) });
  const first = producer.api.envoyCompose({ recipientSeatId: 'mgr1' });
  assert.ok(consumer.api.setActiveSeat('mgr1').ok);
  assert.equal(consumer.api.envoyIngest(first.text).ok, true);

  // The sending workspace edits the same case and re-issues the packet.
  producer.setNow(new Date(NOW.getTime() + 2 * DAY));
  const edited = producer.store.state.cases.find((c) => c.id === 'case-critical');
  edited.title = 'Statutory ledger close: approver named, runbook still missing';
  const second = producer.api.envoyCompose({ recipientSeatId: 'mgr1' });
  assert.equal(second.ok, true, second.error);
  assert.notEqual(second.packet.packetId, first.packet.packetId);

  const localBefore = JSON.stringify(consumer.store.state.cases);
  consumer.setNow(new Date(NOW.getTime() + 3 * DAY));
  const res = consumer.api.envoyIngest(second.text);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.counts.diverged, 1);
  const diverged = consumer.store.state.exchangeArtefacts.filter((row) => row.status === 'diverged');
  assert.equal(diverged.length, 1);
  assert.equal(diverged[0].originId, 'case-critical');

  // The local record is untouched: a foreign packet is evidence, never an edit.
  assert.equal(JSON.stringify(consumer.store.state.cases), localBefore);

  const decisions = consumer.store.state.decisions.filter((d) => String(d.rationale || '').includes('RULE-ENV-02'));
  assert.equal(decisions.length, 1, 'exactly one reconciliation decision');
  const reconciles = consumer.store.state.links
    .filter((l) => l.relation === 'reconciles' && l.targetId === decisions[0].id);
  assert.equal(reconciles.length, 1);
  assert.equal(reconciles[0].sourceType, 'exchangepacket');
  assert.match(decisions[0].question, /NOT overwritten/i);
  // Both hashes are named inside the decision: the reader can see the disagreement.
  assert.ok(diverged[0].contentHash.length === 64);
  assert.match(decisions[0].rationale, /hashes to [0-9a-f]{12}/);

  // A scan re-runs the rules and writes no second decision for the same record.
  assert.ok(consumer.api.envoyScan().ok);
  assert.equal(
    consumer.store.state.decisions.filter((d) => String(d.rationale || '').includes('RULE-ENV-02')).length,
    1,
    'the divergence marker makes the rule idempotent',
  );
});

test('a packet addressed above the seat is refused, and no artefact is written', () => {
  const producer = harness();
  const detail = producer.api.envoyCompose({ recipientSeatId: 'mgr1' });
  assert.equal(detail.packet.recipientClass, 'names');

  const consumer = harness({ state: fixture({ createdAt: new Date(NOW.getTime() + DAY) }) });
  // A VP holds aggregates; a packet written for a manager's board is more
  // specific than that seat may hold, so it is refused rather than filtered.
  assert.ok(consumer.api.setActiveSeat('vp1').ok);
  const res = consumer.api.envoyIngest(detail.text);
  assert.equal(res.ok, false);
  assert.equal(res.failures[0].code, 'altitude-mismatch');
  assert.equal(res.wroteNothing, true);
  assert.equal(consumer.store.state.exchangeArtefacts.length, 0);
  assert.equal(consumer.store.state.decisions.length, 1, 'only the fixture decision remains');
  assert.equal(consumer.store.state.exchangePackets.filter((p) => p.status === 'ingested').length, 0);
  // The refusal itself is on the ledger: "we were offered this and turned it away".
  assert.equal(consumer.store.state.exchangePackets.filter((p) => p.status === 'refused').length, 1);
});

test('an attested exposure opens one review only above the declared floor', () => {
  const producer = harness();
  const built = producer.api.envoyCompose({ recipientSeatId: 'mgr1' });
  const items = built.packet.attestation.items;
  const critical = built.packet.attestation.openCritical;
  assert.ok(items >= 3, 'the fixture fills the 3-item cell floor');
  const share = (critical / items) * 100;

  // Below the declared floor: a marker, no decision.
  const careful = harness({ state: fixture({ createdAt: new Date(NOW.getTime() + DAY) }) });
  careful.store.state.settings.envoyAttestationRiskFloorPct = Math.min(100, Math.ceil(share) + 5);
  assert.ok(careful.api.setActiveSeat('mgr1').ok);
  assert.equal(careful.api.envoyIngest(built.text).ok, true);
  assert.equal(careful.store.state.decisions.filter((d) => String(d.rationale || '').includes('RULE-ENV-03')).length, 0);
  assert.ok(careful.store.state.exchangeMarkers.some((m) => m.kind === 'attested'));

  // Above it: exactly one decision and one follow-up link to the packet.
  const alert = harness({ state: fixture({ createdAt: new Date(NOW.getTime() + DAY) }) });
  alert.store.state.settings.envoyAttestationRiskFloorPct = 1;
  assert.ok(alert.api.setActiveSeat('mgr1').ok);
  assert.equal(alert.api.envoyIngest(built.text).ok, true);
  const reviews = alert.store.state.decisions.filter((d) => String(d.rationale || '').includes('RULE-ENV-03'));
  assert.equal(reviews.length, 1);
  const followups = alert.store.state.links.filter((l) => l.relation === 'tracks-followup' && l.targetId === reviews[0].id);
  assert.equal(followups.length, 1);
  assert.match(reviews[0].rationale, /not this workspace’s measurement/);
});

test('a declared seat may not publish a peer span, and unknown methods fail closed', () => {
  const w = harness();
  assert.ok(w.api.setActiveSeat('mgr1').ok);

  // A peer manager's span is not reachable from here.
  const peer = w.api.envoyCompose({ recipientSeatId: 'mgr2' });
  assert.equal(peer.ok, false);
  assert.match(peer.error, /peer span/i);

  // A director's own packet is aggregated to its unit, not to names.
  assert.ok(w.api.setActiveSeat('dir1').ok);
  const unit = w.api.envoyCompose({ recipientSeatId: 'dir1' });
  assert.equal(unit.ok, true, unit.error);
  assert.equal(unit.packet.recipientClass, 'unit');
  assert.ok(unit.packet.items.every((item) => !('title' in item.fields)), 'no titles at unit class');

  for (const name of ['envoyRead', 'envoyBriefText', 'envoyCsvRows', 'envoyAttentionCount', 'envoyPacketText',
    'envoyPreview', 'envoyCompose', 'envoyVerify', 'envoyIngest', 'envoyScan', 'envoySetConventions', 'envoyIdentity']) {
    assert.equal(typeof w.api[name], 'function', `${name} must be a declared command`);
  }
  assert.equal(w.api.envoyDispatch, undefined, 'no undeclared method rides along');
});

test('the certificate and the CSV are aggregate-only and refusal-honest', () => {
  const producer = harness();
  const consumer = harness({ state: fixture({ createdAt: new Date(NOW.getTime() + DAY) }) });
  const built = producer.api.envoyCompose({ recipientSeatId: 'mgr1', purpose: 'Confidential board pre-read' });
  assert.ok(built.ok, built.error);
  assert.ok(built.packet.purpose.length > 0);
  assert.ok(consumer.api.setActiveSeat('mgr1').ok);
  assert.equal(consumer.api.envoyIngest(built.text).ok, true);

  const report = envoyReport(consumer.store.state, { now: new Date(NOW.getTime() + 2 * DAY) });
  assert.equal(report.stats.ingested, 1);
  assert.equal(report.stats.itemsImported, 4);
  assert.equal(report.stats.spans >= 3, true);
  // Four spans is below the 5-cell floor for a rate, so the share is refused.
  const brief = envoyBriefText(report, new Date(NOW.getTime() + 2 * DAY));
  assert.match(brief, /LIMITS/);
  assert.match(brief, /not authentication/i);
  assert.match(brief, /not encrypted/i);

  const rows = envoyCsvRows(consumer.store.state, { now: new Date(NOW.getTime() + 2 * DAY) });
  assert.ok(rows.length >= 2);
  const flat = JSON.stringify(rows);
  for (const secret of ['Statutory ledger close', 'Ira Analyst', 'case-critical', 'Confidential']) {
    assert.equal(flat.includes(secret), false, `${secret} must not enter the CSV`);
  }
  assert.equal(rows.at(-1).row_kind, 'workspace');

  // Identity is derived and stable, and two workspaces created differently differ.
  assert.equal(workspaceIdentity(consumer.store.state), report.workspaceId);
  assert.notEqual(workspaceIdentity(producer.store.state), workspaceIdentity(consumer.store.state));
});

/* --------------------------------------------------------------------- view */

test('all five panels render, keyboard-reachable, with no dead figure', () => {
  const { api, store } = harness();
  assert.ok(api.envoyCompose({ recipientSeatId: 'mgr1' }).ok);
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/' });
  try {
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.Element = dom.window.Element;
    globalThis.HTMLElement = dom.window.HTMLElement;
    for (const panel of ['desk', 'packets', 'carriage', 'divergence', 'certificate']) {
      const node = renderEnvoy({
        now: NOW, state: store.state, api,
        query: new URLSearchParams({ panel }),
        navigate() {}, refresh() {},
      });
      assert.equal(node.querySelectorAll('h1').length, 1, panel);
      assert.match(node.textContent, /Sealed exchange/);
      assert.doesNotMatch(node.textContent, /undefined|NaN/);
      assert.ok(node.querySelectorAll('button, a, select, input, textarea').length > 0, `${panel} is operable`);
    }
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
    delete globalThis.HTMLElement;
    dom.window.close();
  }
});
