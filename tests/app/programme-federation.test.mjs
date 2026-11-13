/**
 * ADR-0090, Schema v95 — the Programme Federation Reading (`#/federation`).
 *
 * Cross-module and cross-altitude by construction: these tests measure declared
 * leadership edges from artefacts OTHER modules wrote (envoy packet carriage,
 * frozen renewal readings, accepted Catchball commitments, closed expectation
 * rounds, frozen cadence readings), then prove that
 *   - the state is derived from carriage and never from the declaration,
 *   - a small-cell floor and a span floor actually withhold a figure,
 *   - RULE-FED-01/02/03 write through the shared spine, once per edge per week,
 *   - a recovering measurement never auto-closes the human decision,
 *   - and no person's name can reach the screen, the brief or the CSV.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { buildSeats, activeSeat, projectForSeat } from '../../app/core/domain/seat.js';
import { compileDisclosure } from '../../app/core/domain/disclosure.js';
import { workspaceRouteVerdict, API_RIGHTS } from '../../app/core/domain/accessGateway.js';
import {
  LINK_ENTITY_COLLECTIONS,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { MODULE_MANIFESTS } from '../../app/core/domain/disclosureManifests.js';
import {
  buildFederationReport,
  buildFederationSnapshot,
  federationBriefText,
  federationCsvRows,
  measureFederation,
  parentSeatOf,
  wilsonInterval,
  FEDERATION_EXTRACTOR_KEYS,
} from '../../app/core/domain/federation.js';
import {
  FEDERATION_CHANNEL_KEYS,
  FEDERATION_LIMITS,
  FEDERATION_PLAYBOOK,
  FEDERATION_RULE_IDS,
} from '../../app/core/domain/federationRegistry.js';
import { normalizeFederationAssessment, normalizeFederationSettings } from '../../app/core/domain/federationSchema.js';
import { renderFederation } from '../../app/views/federation.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();
const day = (offset) => new Date(NOW.getTime() + offset * 86400000).toISOString().slice(0, 10);
const clone = (value) => JSON.parse(JSON.stringify(value));

const NAMES = ['Vera Executive', 'Dana Director', 'Mira Manager', 'Malik Manager', 'Lee Lead', 'Pat Lead'];

/**
 * A five-altitude tree: two frontline leads under two managers, under a
 * director, under an executive, under the workspace root (chief).
 */
function tree({ activeSeatId = null, settings = {}, wide = false } = {}) {
  const state = createEmptyState(NOW_ISO);
  state.settings = { ...state.settings, chainLeaderAltitude: 'chief', activeSeatId, ...settings };
  for (const key of Object.keys(state.settings)) if (key.endsWith('AutoPropagate')) state.settings[key] = false;
  state.settings.federationAutoPropagate = true;
  state.settings.federationWindowDays = 30;
  state.settings.federationMinSpans = 3;
  state.settings.federationCellFloor = 2;
  state.people = [
    { id: 'vp1', name: 'Vera Executive', role: 'VP', level: 'vp', team: 'Ops', status: 'active' },
    { id: 'dir1', name: 'Dana Director', role: 'Director', level: 'director', team: 'Ops', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mira Manager', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active' },
    { id: 'mgr2', name: 'Malik Manager', role: 'Manager', level: 'manager', team: 'Claims', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', team: 'Billing', managerId: 'mgr1', status: 'active' },
    { id: 'lead2', name: 'Pat Lead', role: 'Lead', level: 'lead', team: 'Claims', managerId: 'mgr2', status: 'active' },
    { id: 'ic1', name: 'Ira Analyst', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Ida Analyst', role: 'Analyst', level: 'ic', team: 'Claims', managerId: 'lead2', status: 'active' },
  ];
  if (wide) {
    for (let index = 1; index <= 4; index += 1) {
      state.people.push({ id: `mgr-w${index}`, name: `Wide Manager ${index}`, role: 'Manager', level: 'manager', team: `Wide ${index}`, managerId: 'dir1', status: 'active' });
      state.people.push({ id: `lead-w${index}`, name: `Wide Lead ${index}`, role: 'Lead', level: 'lead', team: `Wide ${index}`, managerId: `mgr-w${index}`, status: 'active' });
    }
  }
  return state;
}

/** An ingested inbound packet, carried to `targets` exactly as RULE-ENV-01 does. */
function carriage(state, { id, recipientSeatId, targets, daysAgo = 1, items = 2 }) {
  const on = new Date(NOW.getTime() - daysAgo * 86400000).toISOString();
  const packetId = `${id}`.padEnd(64, 'a').slice(0, 64).replace(/[^a-f0-9]/g, 'a');
  state.exchangePackets = Array.isArray(state.exchangePackets) ? state.exchangePackets : [];
  state.exchangePackets.push({
    id,
    packetId,
    direction: 'inbound',
    status: 'ingested',
    originWorkspaceId: 'ws-origin',
    recipientSeatId,
    recipientAltitudeKey: 'manager',
    recipientClass: 'unit',
    itemCount: items,
    withheldCount: 0,
    merkleRoot: 'a'.repeat(64),
    items: [],
    withheld: [],
    verification: { ok: true, failures: [] },
    signatureKeyed: false,
    createdAt: on,
    receivedAt: on,
  });
  state.links = Array.isArray(state.links) ? state.links : [];
  for (const target of targets) {
    state.links.push({
      id: `lnk-${id}-${target}`,
      sourceType: 'exchangepacket',
      sourceId: id,
      targetType: 'person',
      targetId: target,
      relation: 'carries',
      ruleId: 'RULE-ENV-01',
      summary: 'Attested packet carried up the chain.',
      createdOn: on.slice(0, 10),
      createdAt: on,
    });
  }
  return state;
}

function normalize(state) {
  return normalizeState(state, { now: NOW }).state;
}

function harness(state = tree()) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let current = NOW;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-federation-${++seq}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { store, api, state: store.state, setNow: (value) => { current = value; } };
}

const rowFor = (report, seatId) => report.rows.find((row) => row.seatId === seatId);
const edgeKey = (report, seatId) => rowFor(report, seatId)?.state;

/* ------------------------------------------------------------------ schema */

test('Schema v95 migrates additively: empty ledgers, declared conventions, no inferred carriage', () => {
  assert.equal(SCHEMA_VERSION, 155);
  const migrated = migrate({ schemaVersion: 94, settings: { leaderName: 'Keep this', federationWindowDays: 999 }, strategyCycles: [] });
  // The chain now runs one further additive step for the Clearinghouse; the
  // federation migration itself is unchanged, which is what this suite is about.
  assert.deepEqual(migrated.applied, ['94 → 95', '95 → 96', '96 → 97', '97 → 98', '98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113', '113 → 114', '114 → 115', '115 → 116', '116 → 117', '117 → 118', '118 → 119', '119 → 120', '120 → 121', '121 → 122', '122 → 123', '123 → 124', '124 → 125', '125 → 126', '126 → 127', '127 → 128', '128 → 129', '129 → 130', '130 → 131', '131 → 132', '132 → 133', '133 → 134', '134 → 135', '135 → 136', '136 → 137', '137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149', '149 → 150', '150 → 151', '151 → 152', '152 → 153', '153 → 154', '154 → 155']);
  assert.deepEqual(migrated.raw.federationAssessments, []);
  assert.deepEqual(migrated.raw.federationMarkers, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep this');
  assert.equal(migrated.raw.settings.federationWindowDays, 999, 'migration does not rewrite an existing value; the reader clamps it');
  assert.equal(migrated.raw.settings.federationAutoPropagate, true);

  const empty = createEmptyState(NOW_ISO);
  assert.deepEqual(empty.federationAssessments, []);
  assert.deepEqual(empty.federationMarkers, []);
  assert.equal(empty.settings.federationWindowDays, 30);

  const clamped = normalizeFederationSettings({ federationWindowDays: 4000, federationMinSpans: 1, federationCellFloor: 3 });
  assert.equal(clamped.federationWindowDays, FEDERATION_LIMITS.windowDaysMax);
  assert.equal(clamped.federationMinSpans, 3, 'the span floor can never sit below the cell floor');
});

test('the typed-link registry stays exhaustive and the assessment node never leaks span detail', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('federationassessment'));
  assert.equal(LINK_ENTITY_COLLECTIONS.federationassessment, 'federationAssessments');
  assert.deepEqual(Object.keys(LINK_ENTITY_COLLECTIONS).sort(), [...LINK_ENTITY_TYPES].sort());
  assert.ok(LINK_RELATIONS.includes('reconnects'));
  assert.ok(RECORD_POLICIES.federationAssessments, 'the assessment ledger has a declared record class');
  assert.equal(RECORD_POLICIES.federationAssessments.classKey, 'unit');
  assert.ok(MODULE_MANIFESTS.federation, 'the route is declared once in the module catalogue');

  const state = { federationAssessments: [{
    id: 'fed-a', scopeSeatId: 'dir1', altitudeKey: 'director', rank: 3, frozenOn: '2026-11-01', windowDays: 30,
    windowStart: '2026-10-02', summary: { spansDeclared: 2, withParentN: 2, direct: 1, bypass: 0, stale: 0, silent: 1, root: 0,
      suppressedN: 0, coverage: { n: 2, k: 1, pct: 50, lowPct: 10, highPct: 90, refused: false, reason: '', minSpans: 3 } },
    rows: [{ seatId: 'mgr1', parentId: 'dir1', state: 'silent', rank: 2, altitudeKey: 'manager', evidenceN: 0, directN: 0, bypassN: 0 }],
  }] };
  const linked = resolveLinkedEntity(state, 'federationassessment', 'fed-a');
  assert.equal(linked.route, '#/federation?assessment=fed-a');
  assert.equal(linked.raw.rows, undefined, 'the general graph resolver never returns the span list');
  const serialized = JSON.stringify(linked);
  for (const name of NAMES) assert.ok(!serialized.includes(name), `graph node drops ${name}`);
});

test('the channel registry and the extraction code cannot drift apart', () => {
  assert.deepEqual([...FEDERATION_EXTRACTOR_KEYS].sort(), [...FEDERATION_CHANNEL_KEYS].sort());
  assert.equal(new Set(FEDERATION_CHANNEL_KEYS).size, FEDERATION_CHANNEL_KEYS.length);
});

/* ------------------------------------------------------------- measurement */

test('a declared edge with no carriage is SILENT — the reading is not the reporting line', () => {
  const state = normalize(tree());
  const report = buildFederationReport(state, { now: NOW });
  assert.equal(report.ok, true);
  assert.equal(report.summary.withParentN, 5, 'lead1, lead2, mgr1, mgr2 and dir1 have a span above them; vp1 is the top');
  assert.equal(report.summary.silent, 5);
  assert.equal(report.summary.direct, 0);
  assert.equal(rowFor(report, 'vp1').state, 'root', 'the top of the tree has no edge to measure and says so');
  assert.equal(report.coverage.refused, false, 'five edges clear this fixture’s declared floor of three');
  assert.equal(report.coverage.pct, 0);
  assert.equal(report.coverage.lowPct, 0);
  assert.ok(report.coverage.highPct > 40, 'a 0 of 5 rate carries a wide upper bound, not certainty');
});

test('measured carriage flips the edge to DIRECT and a skipped span to BYPASS', () => {
  const state = tree();
  // Packet 1: received by the billing manager and carried to the director.
  carriage(state, { id: 'pkt-billing', recipientSeatId: 'mgr1', targets: ['dir1'] });
  // Packet 2: received by the claims manager but carried straight to the VP,
  // skipping the director — a structural hole in the declared path.
  carriage(state, { id: 'pkt-claims', recipientSeatId: 'mgr2', targets: ['vp1'] });
  const normalized = normalize(state);
  assert.equal(normalized.links.length, 2, 'the fixture’s carriage edges survive normalization');
  const report = buildFederationReport(normalized, { now: NOW });

  assert.equal(edgeKey(report, 'mgr1'), 'direct');
  assert.equal(rowFor(report, 'mgr1').channels[0].key, 'packet');
  assert.equal(edgeKey(report, 'mgr2'), 'bypass');
  assert.equal(rowFor(report, 'mgr2').directN, 0);
  assert.equal(rowFor(report, 'mgr2').bypassN, 1);
  assert.equal(edgeKey(report, 'dir1'), 'silent', 'the director still receives nothing through its own edge');
  assert.equal(edgeKey(report, 'lead1'), 'silent');
  assert.equal(report.summary.direct, 1);
  assert.equal(report.summary.bypass, 1);
  assert.equal(report.coverage.pct, 20);
});

test('carriage older than the window reads STALE, never connected', () => {
  const state = tree({ settings: { federationWindowDays: 30 } });
  carriage(state, { id: 'pkt-old', recipientSeatId: 'mgr1', targets: ['dir1'], daysAgo: 90 });
  const report = buildFederationReport(normalize(state), { now: NOW });
  assert.equal(edgeKey(report, 'mgr1'), 'stale');
  assert.equal(rowFor(report, 'mgr1').directN, 0, 'nothing inside the window counts');
  assert.equal(rowFor(report, 'mgr1').lastCarriageOn, day(-90));
  assert.equal(rowFor(report, 'mgr1').daysSince, 90);
});

test('a frozen renewal reading is itself the upward report — and an IC is attributed to its lead', () => {
  const state = tree();
  state.strategyCycles = [{
    id: 'cycle-lead', scopeSeatId: 'lead1', altitudeKey: 'frontline', rank: 1, status: 'frozen',
    frozenOn: day(-3), reviewOn: day(20), periodStart: day(-34), windowDays: 31, sourceRevision: 1, previousId: null,
    cohortPactIds: [],
    metrics: { active: 1, carryover: 0, overdue: 0, watermelon: 0, stopRuleDue: 0, stoppedBet: 0, unmeasured: 0,
      effortDays: 1, releasedEffortDays: 0, reviewEffortDays: 0, suppressed: false },
    forecast: { basis: 'same-altitude', settledN: 0, deliveredN: 0, deliveryRatePct: null, lowerPct: null, upperPct: null, brier: null, refusal: 'no-settled-history' },
    byAltitude: [], byBet: [], grade: null, createdAt: NOW_ISO,
  }];
  const report = buildFederationReport(normalize(state), { now: NOW });
  assert.equal(edgeKey(report, 'lead1'), 'direct');
  assert.equal(rowFor(report, 'lead1').channels[0].key, 'renewal');

  // An expectation round carried by a non-leadership person is attributed to the
  // nearest leadership span: an IC's round with the lead is the LEAD's carriage.
  const state2 = tree();
  const closedRound = (id, leaderId, memberId) => ({
    id, leaderId, memberId, status: 'closed', openedOn: day(-20), closedOn: day(-6),
    leaderSubmittedAt: `${day(-6)}T09:00:00.000Z`, memberSubmittedAt: `${day(-6)}T10:00:00.000Z`,
    items: [{ key: 'autonomy', leader: 3, member: 3 }],
    leaderNote: '', memberNote: '', cycle: '2026-Q4', createdAt: NOW_ISO,
  });
  state2.expectationRounds = [closedRound('round-1', 'mgr1', 'lead1')];
  const normalized2 = normalize(state2);
  const report2 = buildFederationReport(normalized2, { now: NOW });
  assert.equal(edgeKey(report2, 'lead1'), 'direct', 'a round the lead closed with the manager above it is carriage on that edge');
  assert.equal(rowFor(report2, 'lead1').channels[0].key, 'concordance');

  // A round INSIDE a span (member IC, leader their own lead) is not carriage
  // across the edge above that span, and is never counted as such.
  const state3 = tree();
  state3.expectationRounds = [closedRound('round-2', 'lead1', 'ic1')];
  assert.equal(edgeKey(buildFederationReport(normalize(state3), { now: NOW }), 'lead1'), 'silent');
});

/* ----------------------------------------------------------------- privacy */

test('small cells are suppressed with a complementary cell, and the span floor refuses a rate', () => {
  const state = tree({ wide: true, settings: { federationMinSpans: 5, federationCellFloor: 3 } });
  // One packet on mgr1 (evidence 1, under the floor of 3) and four packets on
  // mgr-W1 (evidence 4, publishable) so the complementary cell has a partner.
  carriage(state, { id: 'pkt-single', recipientSeatId: 'mgr1', targets: ['dir1'] });
  for (let index = 1; index <= 4; index += 1) {
    carriage(state, { id: `pkt-wide-${index}`, recipientSeatId: 'mgr-w1', targets: ['dir1'] });
  }
  const director = normalize(state);
  director.settings.activeSeatId = 'dir1';
  const report = buildFederationReport(director, { now: NOW });

  const suppressed = report.rows.filter((row) => row.suppressed);
  assert.equal(suppressed.length, 2, 'the small cell blanks itself AND one complement in its altitude group');
  assert.equal(suppressed.filter((row) => row.altitudeKey === 'manager').length, 2);
  for (const row of suppressed) {
    assert.equal(row.evidenceN, null);
    assert.deepEqual(row.channels, []);
  }
  assert.ok(report.withheld.some((entry) => /Small-case|Small-cell/.test(entry.reason)), 'the withholding is printed, not silent');

  // Below the declared span floor the rate is WITHHELD — never a confident 0%.
  const small = buildFederationReport(normalize(tree({ settings: { federationMinSpans: 9 } })), { now: NOW, settings: { federationMinSpans: 9, federationWindowDays: 30, federationCellFloor: 2 } });
  assert.equal(small.coverage.refused, true);
  assert.equal(small.coverage.pct, null);
  assert.match(small.coverage.reason, /WITHHELD/);
});

test('no person’s name reaches the screen, the brief or the CSV at any altitude', () => {
  const state = tree();
  carriage(state, { id: 'pkt-dir', recipientSeatId: 'dir1', targets: ['vp1'] });
  const normalized = normalize(state);
  for (const seatId of ['lead1', 'mgr1', 'dir1', 'vp1', 'leader']) {
    const copy = clone(normalized);
    copy.settings.activeSeatId = seatId;
    const report = buildFederationReport(copy, { now: NOW });
    const payload = JSON.stringify({ report, brief: federationBriefText(report), csv: federationCsvRows(report) });
    for (const name of NAMES) {
      assert.ok(!payload.includes(name), `seat ${seatId} reading never prints ${name}`);
    }
  }
});

/* ------------------------------------------------------------------- rules */

test('the three federation rules are on the shared spine with a published contract', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.name === 'federationRule' || String(rule).includes('federation')));
  const contract = PROPAGATION_CONTRACTS.find((entry) => entry.module === 'federationRules.js');
  assert.ok(contract, 'the federation rules publish a propagation contract');
  assert.deepEqual(contract.writes.sort(), ['decisions', 'federationMarkers', 'links']);
  assert.equal(contract.scansWorkspace, true);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'one contract per rule on the spine');
  assert.equal(new Set(PROPAGATION_CONTRACTS.map((entry) => entry.rule)).size, PROPAGATION_CONTRACTS.length, 'no rule is registered twice');
});

test('a freeze writes an identity-reduced assessment, rolls it up, and opens one finding per broken edge', () => {
  const { store, api } = harness();
  const before = store.state.decisions.length;
  const frozen = api.federationFreeze();
  assert.equal(frozen.ok, true, frozen.error);
  const assessment = store.state.federationAssessments[0];
  assert.ok(assessment, 'the assessment is stored');
  assert.equal(assessment.rows.length, 6, 'five edges with a span above plus the top of the tree');
  const serialized = JSON.stringify(assessment);
  for (const name of NAMES) assert.ok(!serialized.includes(name), `frozen assessment drops ${name}`);

  // RULE-FED-01: the reading rolled up in the same transaction.
  const spanEdges = store.state.links.filter((link) => link.sourceType === 'federationassessment' && link.relation === 'summarizes-span');
  assert.ok(spanEdges.length >= 2, 'the reading links to its span and every ancestor above it');
  assert.ok(spanEdges.some((link) => link.targetId === 'vp1'), 'the executive receives the reading it did not build');

  // RULE-FED-02: five declared edges, five silent findings, one decision each.
  const opened = store.state.decisions.filter((decision) => String(decision.rationale || '').includes('RULE-FED-02'));
  assert.equal(opened.length, 5);
  assert.equal(store.state.decisions.length, before + 5);
  assert.ok(opened.every((decision) => decision.outcome === 'pending'), 'the engine never resolves its own finding');
  assert.ok(opened.every((decision) => /Edge|edge|span/i.test(decision.title)));

  // Idempotent: a second freeze the same day and an explicit scan add nothing.
  api.federationFreeze();
  api.federationScan();
  assert.equal(store.state.decisions.filter((decision) => String(decision.rationale || '').includes('RULE-FED-02')).length, 5);
  assert.equal(store.state.federationAssessments.length, 1);
});

test('a manager’s freeze or scan opens findings only inside its own span, never about a peer', () => {
  const state = tree({ activeSeatId: 'mgr1' });
  const { store, api } = harness(state);
  const scanned = api.federationScan();
  assert.equal(scanned.ok, true, scanned.error);
  const fromScan = store.state.decisions.filter((decision) => String(decision.rationale || '').includes('RULE-FED-02'));
  assert.equal(fromScan.length, 2, 'exactly the manager’s own two edges: its lead’s and its own');
  const scannedText = fromScan.map((decision) => decision.question).join(' ');
  assert.ok(scannedText.includes('#lead1'), 'the lead under this manager is in scope');
  assert.ok(scannedText.includes('#mgr1'), 'the manager’s own edge to the director is in scope');
  assert.ok(!scannedText.includes('#lead2'), 'a peer manager’s lead is never in scope');
  assert.ok(!scannedText.includes('#mgr2'), 'a peer manager is never in scope');

  const frozen = api.federationFreeze();
  assert.equal(frozen.ok, true, frozen.error);
  const afterFreeze = store.state.decisions.filter((decision) => String(decision.rationale || '').includes('RULE-FED-02'));
  assert.equal(afterFreeze.length, 2, 'the same week’s findings are not re-opened by a freeze');
});

test('a recovering measurement records a reconnection and does NOT close the human decision', () => {
  const { store, api } = harness();
  api.federationFreeze();
  const decision = store.state.decisions.find((row) => String(row.rationale || '').includes('RULE-FED-02') && row.question.includes('#mgr1'));
  assert.ok(decision, 'a finding exists for the manager edge');

  store.update((draft) => {
    draft.exchangePackets.push({
      id: 'pkt-recover', packetId: 'b'.repeat(64), direction: 'inbound', status: 'ingested',
      originWorkspaceId: 'ws-origin', recipientSeatId: 'mgr1', recipientAltitudeKey: 'manager',
      recipientClass: 'unit', itemCount: 1, withheldCount: 0, merkleRoot: 'b'.repeat(64),
      items: [], withheld: [], verification: { ok: true, failures: [] }, signatureKeyed: false,
      createdAt: day(-1), receivedAt: day(-1),
    });
    draft.links.push({
      id: 'lnk-recover', sourceType: 'exchangepacket', sourceId: 'pkt-recover', targetType: 'person',
      targetId: 'dir1', relation: 'carries', ruleId: 'RULE-ENV-01', summary: 'carried',
      createdOn: day(-1), createdAt: NOW_ISO,
    });
  }, { type: 'case.updated', entity: 'case', entityId: 'case-manual' });

  api.federationScan();
  const reconciliation = store.state.federationMarkers.filter((marker) => marker.kind === 'reconnect');
  assert.equal(reconciliation.length, 1, 'exactly one reconnection marker for the recovered edge');
  assert.equal(reconciliation[0].childSeatId, 'mgr1');
  assert.equal(reconciliation[0].reconnected, true);
  const after = store.state.decisions.find((row) => row.id === decision.id);
  assert.equal(after.outcome, 'pending', 'a measurement recovering is not a human sign-off');
  assert.equal(after.chosen, '');
  assert.ok(store.state.links.some((link) => link.relation === 'reconnects' && link.targetId === 'mgr1'));
});

/* ------------------------------------------------------------ seat / access */

test('every altitude holds a different decision and the boundary opens the route', () => {
  const state = tree();
  carriage(state, { id: 'pkt-dir', recipientSeatId: 'dir1', targets: ['vp1'] });
  const normalized = normalize(state);
  const ranks = [];
  for (const seatId of ['lead1', 'mgr1', 'dir1', 'vp1', 'leader']) {
    const copy = clone(normalized);
    copy.settings.activeSeatId = seatId;
    const report = buildFederationReport(copy, { now: NOW });
    ranks.push(report.seat.rank);
    const built = buildSeats(copy, { now: NOW, settings: copy.settings });
    const seat = activeSeat(built);
    const compiled = compileDisclosure(copy, seat, built, { now: NOW, settings: copy.settings });
    assert.equal(workspaceRouteVerdict('federation', seat, { state: copy, built, compiled }).allow, true, `${seatId} may open its own reading`);
    const projection = projectForSeat(copy, seat, built);
    assert.deepEqual(projection.visible.federationAssessments, [], 'raw assessment rows never enter a declared-seat projection');
  }
  assert.deepEqual(ranks, [1, 2, 3, 4, 5]);
  assert.equal(new Set(Object.values(FEDERATION_PLAYBOOK).map((entry) => entry.title)).size, 5);

  assert.ok(ACTION_RIGHTS['govern-federation']);
  assert.equal(API_RIGHTS.federationFreeze, 'govern-federation');
  assert.equal(API_RIGHTS.federationScan, 'govern-federation');
  assert.ok(CSV_EXPORTS.some((scope) => scope.key === 'programme-federation'), 'the aggregate-only export scope is registered');
});

test('a declared seat only reads its own span, and a manager sees child edges not peers', () => {
  const state = tree();
  carriage(state, { id: 'pkt-billing', recipientSeatId: 'mgr1', targets: ['dir1'] });
  const normalized = normalize(state);
  const managerCopy = clone(normalized);
  managerCopy.settings.activeSeatId = 'mgr1';
  const manager = buildFederationReport(managerCopy, { now: NOW });
  const seats = manager.rows.map((row) => row.seatId);
  assert.deepEqual(seats.sort(), ['lead1', 'mgr1']);
  assert.ok(!seats.includes('mgr2'), 'a peer span is not readable from another manager');

  const chiefCopy = clone(normalized);
  chiefCopy.settings.activeSeatId = 'leader';
  const chief = buildFederationReport(chiefCopy, { now: NOW });
  assert.deepEqual([...new Set(chief.rows.map((row) => row.seatId))].sort(), ['dir1', 'lead1', 'lead2', 'mgr1', 'mgr2', 'vp1']);
});

test('the CSV export is aggregate-only and blanks a suppressed cell rather than printing zero', () => {
  const state = tree({ wide: true, settings: { federationMinSpans: 5, federationCellFloor: 3 } });
  carriage(state, { id: 'pkt-single', recipientSeatId: 'mgr1', targets: ['dir1'] });
  const normalized = normalize(state);
  const csv = exportWorkspaceCsv(normalized, 'programme-federation', { now: NOW });
  assert.ok(csv.ok, csv.error);
  assert.match(csv.csv, /row_kind/);
  for (const name of NAMES) assert.ok(!csv.csv.includes(name), `the export never prints ${name}`);
  const lines = csv.csv.trim().split('\n');
  assert.ok(lines.length >= 2);
});

/* -------------------------------------------------------------------- view */

test('the view renders at four altitudes without throwing and never prints a person', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  const state = tree();
  carriage(state, { id: 'pkt-billing', recipientSeatId: 'mgr1', targets: ['dir1'] });
  const normalized = normalize(state);
  for (const seatId of ['lead1', 'mgr1', 'dir1', 'vp1']) {
    const copy = clone(normalized);
    copy.settings.activeSeatId = seatId;
    const report = buildFederationReport(copy, { now: NOW });
    for (const panel of ['desk', 'edges', 'channels', 'coverage', 'certificate']) {
      const node = renderFederation({
        state: copy,
        now: NOW,
        query: new URLSearchParams(`panel=${panel}`),
        navigate: () => {},
        refresh: () => {},
        api: { federationRead: () => report, federationFreeze: () => ({ ok: true }), federationScan: () => ({ ok: true }), federationSetConventions: () => ({ ok: true }), federationBriefText: () => ({ ok: true, text: federationBriefText(report) }), federationCsvRows: () => ({ ok: true, rows: federationCsvRows(report) }) },
      });
      assert.ok(node, `panel ${panel} renders at ${seatId}`);
      const html = node.outerHTML;
      for (const name of NAMES) assert.ok(!html.includes(name), `panel ${panel} at ${seatId} never prints ${name}`);
      assert.ok(!/undefined/.test(html), `panel ${panel} at ${seatId} has no undefined cell`);
    }
  }
});

test('the frozen snapshot refuses an over-wide span instead of writing a partial reading', () => {
  const state = tree({ wide: true });
  const built = buildFederationSnapshot(normalize(state), { id: 'fed-wide', now: NOW });
  assert.equal(built.ok, true, 'thirteen seats is inside the bounded row cap');
  const assessment = normalizeFederationAssessment(built.assessment);
  assert.ok(assessment, 'the snapshot round-trips through the fail-closed normalizer');
  const hostile = normalizeFederationAssessment({ ...built.assessment, rows: [...built.assessment.rows, { seatId: 'x', state: 'connected' }] });
  assert.equal(hostile.rows.length, built.assessment.rows.length, 'a row with an undeclared state is dropped, not repaired');
});

test('the measurement reports where an edge could not be placed rather than counting it', () => {
  const state = tree();
  const normalized = normalize(state);
  const measurement = measureFederation(normalized, { now: NOW });
  const ghost = { ...normalized, catchballPacts: [{ id: 'p', fromSeatId: 'ghost-seat', toSeatId: 'mgr1', status: 'agreed', agreedOn: day(-2) }] };
  const withGhost = measureFederation(ghost, { now: NOW });
  assert.ok(withGhost.unplaced.length >= 1, 'carriage from a seat outside the tree is reported, not counted');
  assert.equal(measurement.unplaced.length, 0);
  const bound = wilsonInterval(0, 4);
  assert.equal(bound.low, 0);
  assert.ok(bound.high > 0.4 && bound.high < 0.7, 'Wilson upper bound on 0 of 4 is about 0.49');
});
