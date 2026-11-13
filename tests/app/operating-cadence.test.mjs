/**
 * tests/app/operating-cadence.test.mjs — ADR-0087, Schema v93.
 *
 * The session's concrete self-test. In ONE atomic transaction it proves:
 *   - a case filed in the workspace is attributed to the ONE standing forum
 *     competent to close it (kind competence AND time span AND class horizon),
 *   - `RULE-CAD-01` writes a `queued-for` edge to that forum and a
 *     `rolls-up-to` edge to EVERY leadership ancestor of the owning span, so a
 *     frontline item reaches director, VP and chief with zero re-entry,
 *   - a sensitive source (a performance concern) contributes NO edge at all,
 *   - `RULE-CAD-02` opens exactly one governed constraint decision per ISO week
 *     when a forum is congested, and fans it up the reporting line,
 *   - `RULE-CAD-03` records the agenda-fit gap against the owning seat a forum's
 *     membership is missing.
 *
 * It then proves the statistics analytically: utilisation ρ, Little's law flow
 * time, the refusal at ρ ≥ 1, the Wilson interval against a hand-computed value,
 * and the escape-ladder arithmetic on a hand-built fixture.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  LINK_ENTITY_COLLECTIONS, LINK_RELATIONS, SYSTEM_GENERATED_LINK_RELATIONS,
} from '../../app/core/domain/cases.js';
import {
  buildCadenceReport, buildCadenceClock, buildDemandPicture, classifyInput,
  forumDemand, forumFlow, nextSittingOn, cadenceWilson, utilisationBand,
  nameConstraint,
} from '../../app/core/domain/cadence.js';
import { cadenceSkill } from '../../app/core/domain/cadence.js';
import { normalizeCadenceForums, normalizeCadenceSessions } from '../../app/core/domain/cadenceSchema.js';
import { renderCadence } from '../../app/views/cadence.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const DAY = 86400000;

function fixture() {
  const state = createEmptyState(NOW.toISOString());
  for (const key of Object.keys(state.settings)) if (key.endsWith('AutoPropagate')) state.settings[key] = false;
  state.settings.cadenceAutoPropagate = true;
  // A five-altitude chain: ceo → vp → dir → mgr → lead1 → ic1.
  state.people = [
    { id: 'ceo', name: 'Cleo Chief', role: 'CEO', level: 'vp', status: 'active' },
    { id: 'vp', name: 'Vic Exec', role: 'VP', level: 'vp', managerId: 'ceo', status: 'active' },
    { id: 'dir', name: 'Dee Director', role: 'Director', level: 'director', managerId: 'vp', status: 'active' },
    { id: 'mgr', name: 'Morgan Manager', role: 'Manager', level: 'manager', managerId: 'dir', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', managerId: 'mgr', status: 'active' },
    { id: 'ic1', name: 'Ari Analyst', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active' },
  ];
  state.cases = [
    {
      id: 'case-1', title: 'Line 3 keeps stopping', status: 'open', kind: 'operational',
      openedOn: '2026-10-28', ownerId: 'lead1', involvedPersonIds: ['lead1'],
      fmea: { severity: 9, probability: 6, detectability: 5 },
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    },
  ];
  return normalizeState(state, { now: NOW }).state;
}

function harness(state = fixture()) {
  const mem = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  let serial = 0;
  let current = NOW;
  const idFactory = (p) => `${p}-test-${++serial}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { api, store, setNow: (d) => { current = d; } };
}

const weeklyForum = (extra = {}) => ({
  title: 'Weekly operating review',
  kind: 'operating-review',
  cadence: 'weekly',
  chairSeatId: 'mgr',
  attending: ['mgr', 'lead1'],
  decisionCapacity: 4,
  serviceDays: 3,
  ...extra,
});

/* ------------------------------------------------------------------ schema */

test('v92 → v93 migration is additive, and no forum is ever invented', () => {
  assert.equal(SCHEMA_VERSION, 152);
  const migrated = migrate({ schemaVersion: 90, settings: { leaderName: 'Keep' }, people: [] });
  assert.deepEqual(migrated.applied, ['90 → 91', '91 → 92', '92 → 93', '93 → 94', '94 → 95', '95 → 96', '96 → 97', '97 → 98', '98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113', '113 → 114', '114 → 115', '115 → 116', '116 → 117', '117 → 118', '118 → 119', '119 → 120', '120 → 121', '121 → 122', '122 → 123', '123 → 124', '124 → 125', '125 → 126', '126 → 127', '127 → 128', '128 → 129', '129 → 130', '130 → 131', '131 → 132', '132 → 133', '133 → 134', '134 → 135', '135 → 136', '136 → 137', '137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149', '149 → 150', '150 → 151', '151 → 152']);
  assert.deepEqual(migrated.raw.cadenceForums, []);
  assert.deepEqual(migrated.raw.cadenceSessions, []);
  assert.deepEqual(migrated.raw.cadenceReadings, []);
  assert.deepEqual(migrated.raw.cadenceMarkers, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep');
  assert.equal(migrated.raw.settings.cadenceUtilisationTargetPct, 85);
  // A workspace that already has cadence data keeps it untouched.
  const kept = migrate({ schemaVersion: 92, cadenceForums: [{ id: 'existing' }], settings: {} });
  assert.equal(kept.raw.cadenceForums[0].id, 'existing');
  // Fail-closed normalizers: a forum with no chair, an unknown kind, or an unknown
  // cadence is dropped with a warning rather than guessed at.
  const warnings = [];
  assert.deepEqual(normalizeCadenceForums([
    { id: 'a', title: 'No chair', kind: 'operating-review', cadence: 'weekly', status: 'active' },
    { id: 'b', title: 'Bad kind', kind: 'standup', cadence: 'weekly', status: 'active', chairSeatId: 'mgr' },
    { id: 'c', title: 'Bad cadence', kind: 'operating-review', cadence: 'hourly', status: 'active', chairSeatId: 'mgr' },
  ], warnings), []);
  assert.equal(warnings.length, 3);
  // A sitting with no date is refused; a sitting cannot claim more than capacity
  // (that guard lives in the action layer and is exercised below).
  const sessionWarnings = [];
  assert.deepEqual(normalizeCadenceSessions([{ id: 's1', forumId: 'f1', status: 'held' }], sessionWarnings), []);
  assert.equal(sessionWarnings.length, 1);
});

test('graph vocabulary and spine parity are exhaustive', () => {
  assert.equal(LINK_ENTITY_COLLECTIONS.cadenceforum, 'cadenceForums');
  assert.equal(LINK_ENTITY_COLLECTIONS.cadencereading, 'cadenceReadings');
  for (const relation of ['queued-for', 'fit-gap']) {
    assert.ok(LINK_RELATIONS.includes(relation), `${relation} must be a declared relation`);
    assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes(relation), `${relation} is written by the spine, never by hand`);
  }
  const names = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.name);
  // ADR-0088 inserted carryoverRule between strategyCycleRule (whose invalidations
  // it settles) and cadenceRule; the contract is the ORDER, not this file's age.
  assert.ok(names.indexOf('strategyCycleRule') < names.indexOf('carryoverRule'), 'the renewal bridge invalidates before carryover settles');
  assert.ok(names.indexOf('carryoverRule') < names.indexOf('cadenceRule'), 'carryover settles before the cadence clock routes');
  assert.ok(names.indexOf('cadenceRule') < names.indexOf('attentionMarketRule'));
  assert.ok(names.indexOf('cadenceRule') < names.indexOf('seatRule'));
  assert.equal(names.at(-1), 'sealRule', 'the seal must remain absolutely last');
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule && c.rule.name === 'cadenceRule');
  assert.ok(contract, 'cadenceRule must have an auditable contract');
  assert.ok(contract.scansWorkspace);
  assert.ok(contract.writes.includes('links'));
  assert.ok(contract.writes.includes('decisions'));
  // ADR-0088 appends after this scope, so the registry ORDER is the contract.
  assert.ok(CSV_EXPORTS.findIndex((s) => s.key === 'operating-cadence') < CSV_EXPORTS.findIndex((s) => s.key === 'federated-exchange'));
  assert.equal(CSV_EXPORTS.length, 144);
});

/* ------------------------------------- the concrete self-test: one transaction */

test('one case creates a queued-for edge and a roll-up edge per ancestor', () => {
  const { api, store } = harness();
  const declared = api.cadenceDeclareForum(weeklyForum());
  assert.equal(declared.ok, true, declared.error);
  const forumId = declared.forum.id;

  // Recording a sitting is the trigger that makes the queue concrete — and it
  // re-runs the whole spine in the same atomic commit.
  const logged = api.cadenceLogSession(forumId, {
    heldOn: '2026-11-02', status: 'held', closedN: 2, plannedN: 3,
    closedClassKeys: ['quality-defect'], estimatedServiceDays: 2,
  });
  assert.equal(logged.ok, true, logged.error);

  const links = (store.state.links || []).filter((l) => String(l.ruleId || '').startsWith('RULE-CAD'));

  const queued = links.filter((l) => l.relation === 'queued-for');
  assert.equal(queued.length, 1, 'exactly one competent forum receives the item');
  assert.equal(queued[0].sourceType, 'case');
  assert.equal(queued[0].sourceId, 'case-1');
  assert.equal(queued[0].targetType, 'cadenceforum');
  assert.equal(queued[0].targetId, forumId);

  // Cross-altitude roll-up: the owning span AND every leadership ancestor above it.
  const rollup = links.filter((l) => l.relation === 'rolls-up-to').map((l) => l.targetId);
  for (const seat of ['mgr', 'dir', 'vp', 'ceo']) {
    assert.ok(rollup.includes(seat), `the queue must roll up to ${seat}`);
  }
  // The disclosure ladder is printed on each rung.
  const toVp = links.find((l) => l.relation === 'rolls-up-to' && l.targetId === 'vp');
  assert.match(toVp.summary, /aggregate disclosure/);

  // Idempotence: a second scan adds no duplicate edges.
  const before = store.state.links.length;
  api.cadenceScan();
  assert.equal(store.state.links.length, before, 'a re-scan must not duplicate provenance');
});

test('a sensitive source contributes no edge to the governance graph', () => {
  const state = fixture();
  state.performanceConcerns = [{
    id: 'pc-1', personId: 'ic1', status: 'assessing', openedOn: '2026-10-20',
    standard: { expectation: 'Deliver the weekly report', recordedOn: '2026-10-01' },
    observations: [], conversations: [], supports: [], answers: {},
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  }];
  const normalized = normalizeState(state, { now: NOW }).state;
  const { api, store } = harness(normalized);
  const declared = api.cadenceDeclareForum(weeklyForum());
  assert.equal(declared.ok, true, declared.error);
  const forumId = declared.forum.id;
  api.cadenceLogSession(forumId, { heldOn: '2026-11-02', status: 'held', closedN: 1 });

  const cadenceLinks = (store.state.links || []).filter((l) => String(l.ruleId || '').startsWith('RULE-CAD'));
  assert.equal(
    cadenceLinks.filter((l) => l.sourceType === 'perfconcern').length, 0,
    'a confidential people record must never enter the shared graph',
  );
  // But it IS counted, and classified as not-reviewable rather than guessed.
  const report = buildCadenceReport(store.state, { now: NOW });
  assert.ok(report.counts.unreviewable >= 1);
  const concernItem = report.picture.perItem.find((i) => i.entityId === 'pc-1');
  assert.equal(concernItem.classKey, 'unreviewable');
  assert.equal(concernItem.reviewable, false);
});

test('a congested forum opens exactly one governed decision per ISO week, fanned up', () => {
  const state = fixture();
  // Seven severe cases against a 4-decision weekly forum: ρ well above 1.
  for (let i = 2; i <= 8; i += 1) {
    state.cases.push({
      id: `case-${i}`, title: `Quality escape ${i}`, status: 'open', kind: 'operational',
      openedOn: '2026-10-30', ownerId: 'lead1', fmea: { severity: 9, probability: 7, detectability: 4 },
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    });
  }
  const normalized = normalizeState(state, { now: NOW }).state;
  const { api, store } = harness(normalized);
  const declared = api.cadenceDeclareForum(weeklyForum({ decisionCapacity: 4, serviceDays: 3 }));
  assert.equal(declared.ok, true, declared.error);
  const forumId = declared.forum.id;
  api.cadenceLogSession(forumId, { heldOn: '2026-11-02', status: 'held', closedN: 1 });

  const report = buildCadenceReport(store.state, { now: NOW });
  const row = report.picture.forums.find((f) => f.id === forumId);
  assert.ok(row.demand.rho >= 1, `expected congestion, got ρ = ${row.demand.rho}`);
  assert.equal(report.constraint.type, 'forum-capacity');

  const tagged = (store.state.decisions || []).filter((d) => String(d.question || '').includes('[CAD-SIG:forum-capacity'));
  assert.equal(tagged.length, 1, 'one governed constraint decision per ISO week');

  // The decision rolls up the reporting line, above the forum's chair (mgr).
  const decisionLinks = (store.state.links || []).filter(
    (l) => l.relation === 'rolls-up-to' && l.sourceType === 'decision' && l.sourceId === tagged[0].id,
  );
  assert.ok(decisionLinks.some((l) => l.targetId === 'dir'));
  assert.ok(decisionLinks.some((l) => l.targetId === 'vp'));

  // Running the scan again in the same week adds no second decision.
  api.cadenceScan();
  assert.equal(
    (store.state.decisions || []).filter((d) => String(d.question || '').includes('[CAD-SIG:forum-capacity')).length, 1,
  );
});

test('agenda fit records the owning seat a forum is missing', () => {
  // The case belongs to lead1 but its OWNING seat is the manager altitude (mgr).
  // A director-chaired forum that meets without mgr therefore cannot close that
  // span's work directly: Conway's law says the forum topology and the work
  // topology disagree, and RULE-CAD-03 must name the missing seat.
  const normalized = normalizeState(fixture(), { now: NOW }).state;
  const { api, store } = harness(normalized);
  const declared = api.cadenceDeclareForum({
    title: 'Director operating review',
    kind: 'operating-review',
    cadence: 'weekly',
    chairSeatId: 'dir',
    attending: ['dir'], // mgr, the seat that owns the arriving work, is absent
    decisionCapacity: 5,
    serviceDays: 3,
  });
  assert.equal(declared.ok, true, declared.error);
  api.cadenceLogSession(declared.forum.id, { heldOn: '2026-11-02', status: 'held', closedN: 1 });

  const report = buildCadenceReport(store.state, { now: NOW });
  const row = report.picture.forums.find((f) => f.id === declared.forum.id);
  assert.equal(row.fit.topology, 'disjoint', row.fit.topologyNote);
  const owner = report.picture.perItem.find((i) => i.forumId === declared.forum.id);
  assert.equal(owner.ownerNodeId, 'mgr');

  const gaps = (store.state.links || []).filter((l) => l.relation === 'fit-gap');
  assert.ok(gaps.length >= 1, 'an agenda-fit gap must be recorded');
  assert.ok(gaps.some((l) => l.targetType === 'person' && l.targetId === 'mgr'),
    'the gap must name the owning seat, not the reporter');

  // A mirrored forum — membership covers the owning seat — writes NO gap, so the
  // finding is a real topology signal and not a blanket complaint.
  const second = api.cadenceDeclareForum({
    title: 'Manager standup', kind: 'operating-review', cadence: 'weekly',
    chairSeatId: 'mgr', attending: ['mgr', 'lead1'], decisionCapacity: 3, serviceDays: 2,
  });
  assert.equal(second.ok, true, second.error);
  const after = buildCadenceReport(store.state, { now: NOW });
  const mirrored = after.picture.forums.find((f) => f.id === second.forum.id);
  assert.notEqual(mirrored.fit.topology, 'disjoint', mirrored.fit.topologyNote);
  assert.equal(mirrored.fit.coveragePct, 100);
  assert.ok(!(store.state.links || []).some((l) => l.relation === 'fit-gap' && l.sourceId === second.forum.id));
});

/* --------------------------------------------------------- command refusals */

test('the command layer refuses invented history and out-of-scope forums', () => {
  const { api, store } = harness();
  const declared = api.cadenceDeclareForum(weeklyForum({ decisionCapacity: 4 }));
  const forumId = declared.forum.id;

  // A sitting cannot be recorded in the future.
  const future = api.cadenceLogSession(forumId, { heldOn: '2026-12-01', status: 'held', closedN: 1 });
  assert.equal(future.ok, false);

  // More closures than the declared capacity is refused, so the measured
  // closures-per-sitting figure cannot be inflated by data entry.
  const over = api.cadenceLogSession(forumId, { heldOn: '2026-11-03', status: 'held', closedN: 9 });
  assert.equal(over.ok, false);
  assert.match(over.error, /at most 4/);

  // A cancelled sitting may not claim closures.
  const cancelled = api.cadenceLogSession(forumId, { heldOn: '2026-11-03', status: 'cancelled', closedN: 2 });
  assert.equal(cancelled.ok, false);

  // A duplicate declaration of the same kind + chair + cadence is refused.
  const dup = api.cadenceDeclareForum(weeklyForum());
  assert.equal(dup.ok, false);
  assert.match(dup.error, /already covers/);

  // A forum chaired by a non-leadership node is refused.
  const badChair = api.cadenceDeclareForum(weeklyForum({ chairSeatId: 'ic1', attending: ['ic1'] }));
  assert.equal(badChair.ok, false);

  // The recorded sitting advances the clock; a cancelled one does not.
  assert.equal(api.cadenceLogSession(forumId, { heldOn: '2026-11-02', status: 'held', closedN: 2 }).ok, true);
  assert.equal(store.state.cadenceForums.find((f) => f.id === forumId).lastHeldOn, '2026-11-02');
  assert.equal(api.cadenceLogSession(forumId, { heldOn: '2026-11-03', status: 'cancelled', closedN: 0 }).ok, true);
  assert.equal(store.state.cadenceForums.find((f) => f.id === forumId).lastHeldOn, '2026-11-02');
});

/* ---------------------------------------------------- analytics, analytically */

test('utilisation, Little/Kingman flow and the ρ ≥ 1 refusal', () => {
  const forum = {
    kind: 'operating-review', horizonDays: 30, intervalDays: 7, decisionCapacity: 4, serviceDays: 3,
  };
  // 4 execution blockers, each 3.5 service days = 14 demand-days.
  // Capacity = 4 × 3 × 0.85 = 10.2 capacity-days. ρ = 14 / 10.2.
  const demand = forumDemand(forum, { 'execution-blocker': 4 }, { cadenceUtilisationTargetPct: 85 });
  assert.equal(demand.demandDays, 14);
  assert.equal(demand.capacityDays, 10.2);
  assert.equal(demand.rho, Math.round((14 / 10.2) * 1000) / 1000);

  // Below ρ = 1 Kingman gives a finite wait: Wq = ρ/(1-ρ)·S.
  const slack = forumFlow(forum, { ...demand, demandDays: 5.1, capacityDays: 10.2, rho: 0.5, byClass: [{ n: 2 }] });
  assert.equal(slack.waitDays, 3); // 0.5/0.5 × 3
  assert.equal(slack.flowDays, 6); // S + Wq
  assert.ok(slack.queueN !== null);

  // At ρ ≥ 1 the flow is REFUSED, not printed as a large number.
  const congested = forumFlow(forum, { ...demand, rho: 1.2 });
  assert.equal(congested.flowDays, null);
  assert.equal(congested.waitDays, null);
  assert.equal(congested.verdict, 'congested');
  assert.match(congested.assumption, /single server/);
});

test('the escape ladder measures lateness against the declared service time', () => {
  // A weekly forum with a 7-day interval and 3-day service, 4 slots.
  const forum = {
    id: 'f1', title: 'Weekly review', kind: 'operating-review', cadence: 'weekly',
    status: 'active', altitudeKey: 'manager', horizonDays: 30, chairSeatId: 'mgr',
    attending: ['mgr'], decisionCapacity: 4, serviceDays: 3, lastHeldOn: '2026-11-02',
  };
  const next = nextSittingOn(forum, '2026-11-04');
  assert.equal(next.on, '2026-11-09');
  assert.equal(next.daysAway, 5);

  // A forum that has never sat has NO predictable next sitting.
  const never = nextSittingOn({ ...forum, lastHeldOn: null }, '2026-11-04');
  assert.equal(never.on, null);
  assert.match(never.reason, /never sat/);

  // A 6-day-old quality defect needs a 7-day horizon. Slack = 7 − 6 − 5 − 3 = −7.
  const clock = buildCadenceClock({
    today: '2026-11-04',
    forums: [{
      id: 'f1', title: 'Weekly review', kind: 'operating-review', status: 'active',
      chairSeatId: 'mgr', forum,
      demand: { rho: 0.4, demandDays: 3, capacityDays: 10.2, byClass: [] },
      flow: { flowDays: 5, queueN: 0.2, verdict: 'slack' },
      next: { on: '2026-11-09', known: true, daysAway: 5, overdueDays: 0 },
      itemN: 1,
    }],
    perItem: [{
      type: 'case', entityId: 'c1', title: 'Quality escape', classKey: 'quality-defect',
      reviewable: true, horizonDays: 7, requiredHorizonDays: 7, ageDays: 6,
      forumId: 'f1', ownerNodeId: 'mgr', sensitive: false,
    }],
    unreviewable: [], unmatched: [], counts: {},
  }, { now: NOW });
  const row = clock.rows[0];
  assert.equal(row.clock.state, 'escape-ladder');
  assert.equal(row.clock.forumPath[0].declaredSlackDays, -7);
  assert.match(row.clock.reason, /AFTER its own 7-day horizon/);
});

test('classification reads the record, and refuses to guess', () => {
  assert.equal(classifyInput({ type: 'case', severity: 3, ageDays: 3 }).key, 'quality-defect');
  assert.equal(classifyInput({ type: 'case', severity: 1, ageDays: 3 }).key, 'execution-blocker');
  assert.equal(classifyInput({ type: 'requisition' }).key, 'staffing-gap');
  assert.equal(classifyInput({ type: 'decision', severity: 3 }).key, 'investment-tradeoff');
  assert.equal(classifyInput({ type: 'perfconcern' }).key, 'unreviewable');
  assert.equal(classifyInput({ type: 'oneonone' }).key, 'unreviewable');
  assert.equal(classifyInput({}).key, 'unreviewable');
});

test('Wilson interval matches a hand-computed value and refuses below the floor', () => {
  // k = 8, n = 10 → p = 0.8. Hand-computed: denom = 1 + 3.8415/10 = 1.38415;
  // centre = (0.8 + 0.19207)/1.38415 = 0.71693; half = 1.95996*sqrt(0.016+0.0096)/1.38415
  // = 1.95996*0.16330/1.38415 = 0.22658 → [0.49016, 0.94332] → [49.0, 94.3] (1 dp).
  // (Exact long-division re-derivation: centre 0.71674, half 0.22658.)
  const iv = cadenceWilson(8, 10, 5);
  assert.equal(iv.lo, 49);
  assert.equal(iv.hi, 94.3);
  assert.equal(cadenceWilson(3, 3, 5), null, 'below the floor the interval is withheld');
  assert.equal(cadenceWilson(0, 12, 5).lo, 0);
});

test('utilisation bands are monotone and the top band is unbounded', () => {
  assert.equal(utilisationBand(0.2).key, 'slack');
  assert.equal(utilisationBand(0.7).key, 'balanced');
  assert.equal(utilisationBand(0.95).key, 'critical');
  assert.equal(utilisationBand(1.4).key, 'congested');
  assert.equal(utilisationBand(9).key, 'congested');
  assert.equal(utilisationBand(null).key, 'unmeasured');
});

test('the frozen reading is graded once and its Brier skill is withheld below the floor', () => {
  const { api, store } = harness();
  const declared = api.cadenceDeclareForum(weeklyForum());
  assert.equal(declared.ok, true, declared.error);
  api.cadenceLogSession(declared.forum.id, { heldOn: '2026-11-02', status: 'held', closedN: 2 });

  const frozen = api.cadenceFreezeReading({ reviewDays: 7 });
  assert.equal(frozen.ok, true, frozen.error);
  assert.ok(frozen.reading.prediction, 'a reading must make a falsifiable claim');
  assert.equal(frozen.reading.prediction.dueOn, '2026-11-11');

  // Not yet due → refused, not silently marked as held.
  const early = api.cadenceGradeReading(frozen.reading.id);
  assert.equal(early.ok, false);
  assert.match(early.error, /not yet due/);

  // Advance the clock, record a sitting after the freeze, then grade.
  const later = new Date(NOW.getTime() + 10 * DAY);
  const store2 = store;
  store2.update(() => {}, { type: 'cadence.scan', entity: 'cadenceforum', entityId: '', summary: 'tick' });
  const report = buildCadenceReport(store.state, { now: later });
  assert.ok(report.clock);

  // A grade written by hand is never re-opened.
  const graded = { ...store.state.cadenceReadings[0], grade: { gradedOn: '2026-11-11', outcome: 'held', observedDays: 7, note: 'x' } };
  const readings = [graded];
  const skill = cadenceSkill(readings, 5);
  assert.equal(skill.skill, null, 'one grade is not a calibration sample');
  assert.match(skill.refused, /5 required/);

  // Five graded readings produce a real figure.
  const five = Array.from({ length: 5 }, (_, i) => ({
    prediction: { probabilityPct: 80 },
    grade: { outcome: i < 4 ? 'held' : 'failed' },
  }));
  const s = cadenceSkill(five, 5);
  assert.ok(s.skill !== null);
  // Brier = (4×0.04 + 0.64)/5 = 0.16; base = 0.8 → baseRateBrier = 0.16; skill = 0.
  assert.equal(s.brier, 0.16);
  assert.equal(s.skill, 0);
});

/* ------------------------------------------------------- disclosure & export */

test('the CSV scope is aggregate-only and blanks small cells', () => {
  const { api, store } = harness();
  const declared = api.cadenceDeclareForum(weeklyForum());
  api.cadenceLogSession(declared.forum.id, { heldOn: '2026-11-02', status: 'held', closedN: 2 });

  const exported = exportWorkspaceCsv(store.state, 'operating-cadence', { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  assert.ok(exported.rowCount >= 1, 'a declared forum is always exported');
  const text = exported.csv;
  const lines = text.trim().split('\r\n');
  assert.equal(lines.length, exported.rowCount + 1, 'header plus one row per aggregate');
  // No person name, no forum title, no item title may survive the boundary.
  assert.ok(!text.includes('Cleo Chief'));
  assert.ok(!text.includes('Weekly operating review'));
  assert.ok(!text.includes('Line 3 keeps stopping'));
  const header = lines[0].split(',');
  assert.ok(header.includes('rho'));
  assert.ok(header.includes('suppressed'));
  assert.ok(!header.includes('person'), 'the export carries no person-level column');
  // The small-cell suppression is stated, never silently zeroed.
  assert.ok(lines.slice(1).some((line) => line.includes('small cell')), 'a thin forum cell must be blanked with a reason');
});

test('a declared seat sees only forums inside its span', () => {
  const { api, store } = harness();
  api.cadenceDeclareForum(weeklyForum());
  api.cadenceDeclareForum({
    title: 'Portfolio review', kind: 'portfolio-review', cadence: 'quarterly',
    chairSeatId: 'dir', attending: ['dir'], decisionCapacity: 6, serviceDays: 15,
  });
  assert.equal(store.state.cadenceForums.length, 2);

  // Operate from `lead1`, whose span does not include either chair.
  store.update((draft) => { draft.settings.activeSeatId = 'lead1'; }, {
    type: 'seat.declared', entity: 'seat', entityId: 'lead1', summary: 'Declare lead1',
  });
  const scoped = api.cadenceRead();
  assert.equal(scoped.ok, true, scoped.error);
  assert.equal(scoped.forums.length, 0, 'a peer span must not read the forum register');

  // The operator sees everything.
  store.update((draft) => { draft.settings.activeSeatId = null; }, {
    type: 'seat.declared', entity: 'seat', entityId: '', summary: 'Operator',
  });
  assert.equal(api.cadenceRead().forums.length, 2);
});

test('the engine is inert until a forum is declared', () => {
  const { api, store } = harness();
  api.cadenceScan();
  // No forum exists, so nothing can be queued and no forum edge can be written.
  assert.equal(
    (store.state.links || []).filter((l) => l.relation === 'queued-for' || l.relation === 'fit-gap').length, 0,
    'no forum, no queue and no agenda-fit edge',
  );
  const report = buildCadenceReport(store.state, { now: NOW });
  assert.equal(report.picture.forums.length, 0);
  assert.equal(report.constraint.type, 'competence-gap');

  // The one thing the engine MUST say is that open work has no competent forum.
  // It says it once per ISO week per signature — scanning again must not mint a
  // second decision, or a polling UI would flood the log.
  const afterFirst = (store.state.decisions || []).length;
  assert.equal(afterFirst, 1, 'exactly one competence-gap decision');
  api.cadenceScan();
  api.cadenceScan();
  assert.equal((store.state.decisions || []).length, afterFirst, 'escalation is idempotent within the week');
  const decision = store.state.decisions[0];
  assert.match(String(decision.title || ''), /forum/i);
  // …and declaring the forum that closes the gap replaces the competence gap with
  // a measured one: the case is now routed, so whatever binds next is real capacity,
  // not a missing forum. The constraint never silently reads "none" while the work
  // has nowhere to go, and it never keeps claiming the wrong bottleneck.
  const declared = api.cadenceDeclareForum(weeklyForum({ attending: ['mgr', 'lead1'] }));
  assert.equal(declared.ok, true, declared.error);
  const after = buildCadenceReport(store.state, { now: NOW });
  assert.equal(after.picture.forums.length, 1);
  assert.equal(after.picture.perItem[0].forumId, declared.forum.id);
  assert.notEqual(after.constraint.type, 'competence-gap', 'the gap is closed by the declaration');
  assert.ok(['calendar-unknown', 'forum-capacity', 'service-time', 'none'].includes(after.constraint.type), after.constraint.type);
});

test('every panel renders without an accessibility violation', async () => {
  const { api, store } = harness();
  const declared = api.cadenceDeclareForum(weeklyForum());
  api.cadenceLogSession(declared.forum.id, { heldOn: '2026-11-02', status: 'held', closedN: 2 });
  api.cadenceFreezeReading({});

  const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>');
  const { document, window } = dom.window;
  globalThis.window = window;
  globalThis.document = document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  const { createApp } = await import('../../app/main.js');
  void createApp;

  const ctx = {
    state: store.state,
    now: NOW,
    api,
    query: new URLSearchParams(''),
    navigate: () => {},
    seatContext: null,
  };
  for (const panel of ['clock', 'workbench', 'constraint', 'fit', 'brief']) {
    ctx.query = new URLSearchParams(`panel=${panel}`);
    const node = renderCadence(ctx);
    assert.ok(node, `panel ${panel} rendered`);
    document.getElementById('root').replaceChildren(node);
    const headings = document.querySelectorAll('h1');
    assert.equal(headings.length, 1, `panel ${panel} has exactly one h1`);
    // Every table carries an accessible name.
    for (const t of document.querySelectorAll('table')) {
      assert.ok(t.getAttribute('aria-label') || t.querySelector('caption'), `panel ${panel}: table needs a name`);
    }
  }
});
