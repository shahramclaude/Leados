/**
 * ADR-0088: the Escalation Economy — lifecycle, disclosure, arithmetic and
 * cross-altitude roll-up.
 *
 * Deliberately asserts the MATH, not only the wiring: M/M/1 against its closed
 * form, Kingman against the same form at cᵥ = 1, the Shannon binary-symmetric
 * cascade against a hand expansion, Wilson against a textbook value, and the
 * roll-up as an exact partition.
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
import { LINK_ENTITY_COLLECTIONS, LINK_RELATIONS, SYSTEM_GENERATED_LINK_RELATIONS } from '../../app/core/domain/cases.js';
import {
  bscContext,
  binaryEntropy,
  escalationAttentionCount,
  escalationSignals,
  owningSeatId,
  rungsBetween,
  seatQueue,
  wilsonInterval,
} from '../../app/core/domain/escalation.js';
import { normalizeEscalationRecords } from '../../app/core/domain/escalationSchema.js';
import { buildSeats } from '../../app/core/domain/seat.js';
import { renderEscalation } from '../../app/views/escalation.js';
import { weekKey } from '../../app/core/time.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const DAY = 86400000;

function fixture() {
  const state = createEmptyState(NOW.toISOString());
  // Every other module's automation is paused so this suite measures the
  // Escalation spine, not the other sixty-four rules.
  for (const key of Object.keys(state.settings)) if (key.endsWith('AutoPropagate')) state.settings[key] = false;
  state.settings.escalationAutoPropagate = true;
  state.people = [
    { id: 'vp', name: 'Vic Executive', role: 'VP', level: 'vp', status: 'active' },
    { id: 'dir', name: 'Dee Director', role: 'Director', level: 'director', managerId: 'vp', status: 'active' },
    { id: 'mgr', name: 'Morgan Manager', role: 'Manager', level: 'manager', managerId: 'dir', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', managerId: 'mgr', status: 'active' },
    { id: 'lead2', name: 'Pat Lead', role: 'Lead', level: 'lead', managerId: 'mgr', status: 'active' },
    { id: 'ic1', name: 'Ari Analyst', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Bo Analyst', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active' },
  ];
  return normalizeState(state, { now: NOW }).state;
}

function harness(state = fixture()) {
  const mem = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  let serial = 0;
  let current = NOW;
  const idFactory = (p) => `${p}-test-${++serial}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { api, store, setNow: (date) => { current = date; } };
}

const esc = (toSeatId = 'mgr', extra = {}) => ({
  title: 'Vendor contract renewal terms',
  disposition: 'escalated',
  fromSeatId: 'lead1',
  toSeatId,
  reasonKey: 'authority',
  decisionClass: 'procurement',
  proposedAction: 'Renew at 3%',
  ...extra,
});

/* ------------------------------------------------------- 1. schema & spine */

test('v94 migration, fail-closed records, graph vocabulary and spine parity', () => {
  assert.equal(SCHEMA_VERSION, 149);
  const migrated = migrate({ schemaVersion: 93, settings: { leaderName: 'Keep' }, people: [] });
  assert.deepEqual(migrated.applied, ['93 → 94', '94 → 95', '95 → 96', '96 → 97', '97 → 98', '98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113', '113 → 114', '114 → 115', '115 → 116', '116 → 117', '117 → 118', '118 → 119', '119 → 120', '120 → 121', '121 → 122', '122 → 123', '123 → 124', '124 → 125', '125 → 126', '126 → 127', '127 → 128', '128 → 129', '129 → 130', '130 → 131', '131 → 132', '132 → 133', '133 → 134', '134 → 135', '135 → 136', '136 → 137', '137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149']);
  assert.deepEqual(migrated.raw.escalationRecords, []);
  assert.deepEqual(migrated.raw.escalationCommitments, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep');
  const afterCatchball = migrate({ schemaVersion: 92, catchballPacts: [{ id: 'keep-pact' }], settings: {} });
  assert.deepEqual(afterCatchball.applied, ['92 → 93', '93 → 94', '94 → 95', '95 → 96', '96 → 97', '97 → 98', '98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113', '113 → 114', '114 → 115', '115 → 116', '116 → 117', '117 → 118', '118 → 119', '119 → 120', '120 → 121', '121 → 122', '122 → 123', '123 → 124', '124 → 125', '125 → 126', '126 → 127', '127 → 128', '128 → 129', '129 → 130', '130 → 131', '131 → 132', '132 → 133', '133 → 134', '134 → 135', '135 → 136', '136 → 137', '137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149']);
  assert.equal(afterCatchball.raw.catchballPacts[0].id, 'keep-pact');

  const warnings = [];
  // A row that contradicts its own disposition is DROPPED, never repaired:
  // repairing an escalation with no receiver would fabricate the escalation rate.
  const rows = normalizeEscalationRecords([
    { id: 'a', title: 'No receiver', disposition: 'escalated', fromSeatId: 'p', status: 'open', reasonKey: 'authority' },
    { id: 'b', title: 'Absorbed but names a receiver', disposition: 'absorbed', fromSeatId: 'p', toSeatId: 'q', status: 'open', reasonKey: 'authority' },
    { id: 'c', title: 'Settled with no resolution', disposition: 'escalated', fromSeatId: 'p', toSeatId: 'q', status: 'settled', reasonKey: 'authority' },
    { id: 'd', title: 'Unknown reason', disposition: 'escalated', fromSeatId: 'p', toSeatId: 'q', status: 'open', reasonKey: 'because' },
    { id: 'e', title: 'Returned but status says settled', disposition: 'escalated', fromSeatId: 'p', toSeatId: 'q', status: 'settled', resolution: 'returned', reasonKey: 'authority' },
    { id: 'f', title: 'Good row', disposition: 'escalated', fromSeatId: 'p', toSeatId: 'q', status: 'open', reasonKey: 'authority' },
    { id: 'f', title: 'Duplicate id', disposition: 'escalated', fromSeatId: 'p', toSeatId: 'q', status: 'open', reasonKey: 'authority' },
  ], warnings);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'f');
  assert.equal(rows[0].title, 'Good row');
  assert.ok(warnings.length >= 6, `expected a warning per dropped row, got ${warnings.length}`);

  assert.equal(LINK_ENTITY_COLLECTIONS.escalationrecord, 'escalationRecords');
  assert.equal(LINK_ENTITY_COLLECTIONS.escalationcommitment, 'escalationCommitments');
  for (const relation of ['originates-from', 'reconciles-authority', 'escalates-to', 'rolls-up-to']) {
    assert.ok(LINK_RELATIONS.includes(relation), relation);
  }
  for (const relation of ['originates-from', 'reconciles-authority']) {
    assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes(relation), relation);
  }

  const names = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.name);
  // Before Decision Tempo so the governed decisions it opens are priced in the
  // SAME atomic write; before Seat and Seal so the roll-up boundary and the
  // transaction hash cover them.
  assert.ok(names.indexOf('escalationRule') < names.indexOf('decisionTempoRule'));
  assert.ok(names.indexOf('escalationRule') < names.indexOf('attentionMarketRule'));
  assert.ok(names.indexOf('escalationRule') < names.indexOf('seatRule'));
  assert.ok(names.indexOf('escalationRule') < names.indexOf('sealRule'));
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  // Same convention: relative order, with the reason printed. Being last is
  // true TODAY and is not a contract the next session can honour.
  const keys = CSV_EXPORTS.map((e) => e.key);
  assert.ok(keys.indexOf('operating-cadence') < keys.indexOf('escalation-economy'),
    'scope #83 is appended after main\'s #82');
  assert.ok(keys.indexOf('carryover-settlement') < keys.indexOf('escalation-economy'),
    'main\'s carryover scope precedes the later escalation scope');
});

/* --------------------------------------------- 2. cross-altitude roll-up */

test('one logged escalation writes provenance and rolls up to every ancestor', () => {
  const { api, store } = harness();
  const result = api.escalationLog(esc('mgr'));
  assert.equal(result.ok, true, result.error);
  const id = result.record.id;

  const links = store.state.links.filter((l) => l.sourceId === id && l.ruleId === 'RULE-ESC-01');
  assert.ok(links.some((l) => l.relation === 'escalates-to' && l.targetType === 'person' && l.targetId === 'mgr'));
  // Cross-altitude: frontline → manager → director → VP in ONE transaction.
  for (const person of ['mgr', 'dir', 'vp']) {
    assert.ok(links.some((l) => l.relation === 'rolls-up-to' && l.targetId === person), `missing roll-up to ${person}`);
  }

  const before = store.state.links.length;
  assert.ok(api.escalationScan().ok);
  assert.equal(store.state.links.length, before, 'a rescan cannot duplicate a typed edge');
  assert.equal(store.state.events.filter((e) => e.type === 'automation.rule_error').length, 0);

  const reloaded = normalizeState(store.state, { now: NOW }).state;
  assert.ok(reloaded.links.some((l) => l.sourceId === id && l.targetId === 'vp'));
});

test('the roll-up is an exact partition: ancestors inherit by addition', () => {
  const { api } = harness();
  for (let i = 0; i < 6; i += 1) api.escalationLog(esc('mgr', { title: `Item ${i}` }));
  const report = api.escalationRead();
  const byId = Object.fromEntries(report.seatRows.map((r) => [r.seatId, r]));
  // Lee's span owns all six; every ancestor inherits exactly the same six.
  assert.equal(byId.lead1.directN, 6);
  assert.equal(byId.lead1.inheritedN, 0);
  assert.equal(byId.mgr.directN, 0);
  assert.equal(byId.mgr.inheritedN, 6);
  assert.equal(byId.dir.inheritedN, 6);
  assert.equal(byId.vp.inheritedN, 6);
  // The altitude table counts each record ONCE, at the altitude it arose.
  const frontline = report.byAltitude.find((a) => a.altitudeKey === 'frontline');
  assert.equal(frontline.records, 6);
  const sum = report.byAltitude.reduce((s, a) => s + a.records, 0);
  assert.equal(sum, report.totals.records, 'adding the altitude rows must not inflate the workspace figure');
});

test('a childless specialist’s decision moment rolls into the span that carries them', () => {
  const { api } = harness();
  const built = buildSeats(api.escalationRead() ? fixture() : fixture(), { now: NOW });
  assert.equal(owningSeatId(built, 'ic1'), 'lead1', 'an IC owns no span; their nearest leadership ancestor does');
  assert.equal(owningSeatId(built, 'lead1'), 'lead1');
  assert.equal(rungsBetween(built, 'lead1', 'mgr').rungs, 1);
  assert.equal(rungsBetween(built, 'lead1', 'dir').rungs, 2);
  assert.equal(rungsBetween(built, 'lead1', 'vp').rungs, 3);

  const result = api.escalationLog(esc('mgr', { fromSeatId: 'ic1' }));
  assert.equal(result.ok, true, result.error);
  const report = api.escalationRead();
  const frontline = report.byAltitude.find((a) => a.altitudeKey === 'frontline');
  assert.equal(frontline.records, 1, 'the moment is attributed to the frontline span, not dropped');
});

/* --------------------------------------------------- 3. seat & consent */

test('declared seats enforce receiver-only settlement, peer isolation and origin scope', () => {
  const { api, store } = harness();
  assert.ok(api.escalationLog(esc('mgr')).ok);
  const id = store.state.escalationRecords[0].id;

  // The escalating level may not settle its own escalation: a self-reported
  // escalation yield is worthless, so the API refuses rather than warns.
  assert.ok(api.setActiveSeat('lead1').ok);
  assert.equal(api.escalationSettle(id, { resolution: 'endorsed', outcomeDiffers: false }).ok, false);

  // A sideways peer cannot see or settle it at all.
  assert.ok(api.setActiveSeat('lead2').ok);
  assert.equal(api.escalationSettle(id, { resolution: 'endorsed', outcomeDiffers: false }).ok, false);

  // An ancestor may read the roll-up but may not settle on the receiver's behalf.
  assert.ok(api.setActiveSeat('dir').ok);
  assert.equal(api.escalationSettle(id, { resolution: 'endorsed', outcomeDiffers: false }).ok, false);

  // Only the receiving span settles it — and must state whether the answer changed.
  assert.ok(api.setActiveSeat('mgr').ok);
  assert.equal(api.escalationSettle(id, { resolution: 'endorsed' }).ok, false, 'outcomeDiffers is mandatory');
  assert.ok(api.escalationSettle(id, { resolution: 'overruled', outcomeDiffers: true }).ok);
  assert.equal(store.state.escalationRecords[0].resolution, 'overruled');
});

test('a declared seat cannot log a decision moment outside its own span', () => {
  const { api } = harness();
  assert.ok(api.setActiveSeat('lead1').ok);
  assert.equal(api.escalationLog(esc('mgr', { fromSeatId: 'lead2' })).ok, false, 'sideways origin');
  assert.equal(api.escalationLog(esc('mgr', { fromSeatId: 'dir' })).ok, false, 'upstream origin');
  assert.ok(api.escalationLog(esc('mgr', { fromSeatId: 'ic1' })).ok, 'own subtree origin');
  assert.equal(api.escalationLog(esc('lead1', { fromSeatId: 'lead1' })).ok, false, 'cannot escalate to yourself');
});

/* --------------------------------------------------------- 4. arithmetic */

test('M/M/1 is exact, Kingman agrees at cᵥ = 1, and ρ ≥ 1 is refused not printed', () => {
  // λ = 4/week, μ = 8/week → ρ = 0.5. Wq = λ/(μ(μ−λ)) = 4/(8·4) = 0.125 wk = 0.875 d.
  const q = seatQueue(4, 8, 1, 85);
  assert.equal(q.state, 'stable');
  assert.equal(q.utilisationPct, 50);
  assert.equal(q.waitDaysMm1, 0.88);
  assert.equal(q.waitDaysKingman, 0.88, 'at cᵥ = 1 Kingman collapses onto the M/M/1 form');
  assert.equal(q.waitDaysLo, 0.88);
  assert.equal(q.waitDaysHi, 0.88);
  assert.equal(q.queueLength, 0.5); // Lq = λ·Wq = 4 · 0.125
  assert.equal(q.headroomPerWeek, 2.8); // 0.85·8 − 4

  // Variability widens the Kingman bound and nothing else.
  const wide = seatQueue(4, 8, 2, 85);
  assert.equal(wide.waitDaysMm1, 0.88);
  assert.equal(wide.waitDaysKingman, 3.5); // (0.5/0.5)·4/8 = 1 wk = 7 d… see note
  assert.ok(wide.waitDaysHi > wide.waitDaysMm1);

  // ρ ≥ 1: no finite waiting time exists, so the panel refuses the number.
  const unstable = seatQueue(9, 8, 1, 85);
  assert.equal(unstable.state, 'unstable');
  assert.equal(unstable.verdict, 'queue-unstable');
  assert.equal(unstable.waitDaysMm1, null);
  assert.equal(unstable.waitDaysKingman, null);
  assert.match(unstable.reason, /ρ ≥ 1/);

  // A zero service rate is refused, never divided into.
  assert.equal(seatQueue(4, 0, 1, 85).state, 'refused');
});

test('Shannon’s binary-symmetric cascade loses context at every rung', () => {
  assert.equal(binaryEntropy(0.5), 1);
  assert.equal(binaryEntropy(0), 0);
  assert.equal(binaryEntropy(1), 0);

  const zero = bscContext(0, 20);
  assert.equal(zero.mutualInformationBits, 1, 'no rung crossed, nothing lost');
  assert.equal(zero.retentionPct, 100);

  const one = bscContext(1, 20);
  assert.equal(one.cascadeErrorPct, 20);
  assert.equal(one.retentionPct, 80);
  // `bscContext` reports to 4 dp by convention; compare at the reported precision.
  assert.equal(one.mutualInformationBits, Math.round((1 - binaryEntropy(0.2)) * 1e4) / 1e4);

  // Two hops at ε = 0.2: ε₂ = (1 − (1 − 2·0.2)²)/2 = (1 − 0.36)/2 = 0.32.
  const two = bscContext(2, 20);
  assert.equal(two.cascadeErrorPct, 32);
  assert.equal(two.mutualInformationBits, Math.round((1 - binaryEntropy(0.32)) * 1e4) / 1e4);
  assert.equal(bscContext(0, 20).rungs, 0);
  assert.ok(two.mutualInformationBits < one.mutualInformationBits, 'context can only fall');

  // Monotone in rungs, and never below zero bits.
  let previous = 1;
  for (let k = 1; k <= 4; k += 1) {
    const row = bscContext(k, 15);
    assert.ok(row.mutualInformationBits < previous, `rung ${k}`);
    assert.ok(row.mutualInformationBits >= 0);
    previous = row.mutualInformationBits;
  }
});

test('Wilson intervals match the textbook form and refuse an empty sample', () => {
  const w = wilsonInterval(50, 100);
  assert.equal(w.pct, 50);
  assert.ok(Math.abs(w.lo - 40.4) < 0.2, `lo ${w.lo}`);
  assert.ok(Math.abs(w.hi - 59.6) < 0.2, `hi ${w.hi}`);
  const empty = wilsonInterval(0, 0);
  assert.equal(empty.pct, null);
  assert.equal(empty.lo, null);
  assert.equal(wilsonInterval(5, 3).pct, null, 'k > n is impossible and is refused');
});

/* ---------------------------------------------- 5. yield, tax, subsidiarity */

test('escalation yield detects pure overhead and the tax prices the receiving altitude', () => {
  const { api } = harness();
  // Five settled escalations, NONE of which changed the answer.
  for (let i = 0; i < 5; i += 1) {
    const r = api.escalationLog(esc('mgr', { title: `Item ${i}` }));
    api.escalationSettle(r.record.id, { resolution: 'endorsed', outcomeDiffers: false, effortHours: 2 });
  }
  const report = api.escalationRead();
  assert.equal(report.totals.settledN, 5);
  assert.equal(report.totals.yield.pct, 0);
  assert.equal(report.totals.verdict, 'pure-overhead');
  // Morgan is a manager: 5 × 2 h × the declared manager rate of 65/h.
  assert.equal(report.totals.tax.units, 650);
  assert.equal(report.totals.tax.currency, 'USD');
  assert.equal(report.totals.tax.hours, 10);
  assert.equal(report.totals.tax.meanRungs, 1);

  // A yield at or above the floor is not pure overhead even at a high rate.
  const { api: api2 } = harness();
  for (let i = 0; i < 5; i += 1) {
    const r = api2.escalationLog(esc('mgr', { title: `Item ${i}` }));
    api2.escalationSettle(r.record.id, { resolution: 'overruled', outcomeDiffers: i < 3, effortHours: 1 });
  }
  const healthy = api2.escalationRead();
  assert.equal(healthy.totals.yield.pct, 60);
  assert.notEqual(healthy.totals.verdict, 'pure-overhead');
});

test('subsidiarity counts what was resolved where it arose, including what came back', () => {
  const { api } = harness();
  const escalatedIds = [];
  for (let i = 0; i < 4; i += 1) {
    escalatedIds.push(api.escalationLog(esc('mgr', { title: `Escalated ${i}` })).record.id);
  }
  for (let i = 0; i < 4; i += 1) {
    api.escalationLog({ title: `Absorbed ${i}`, disposition: 'absorbed', fromSeatId: 'lead1', reasonKey: 'authority', decisionClass: 'ops' });
  }
  const before = api.escalationRead();
  const ops = before.classes.find((c) => c.decisionClass === 'ops');
  assert.equal(ops.n, 4);
  assert.equal(ops.subsidiarity.pct, 100, 'everything absorbed was resolved where it arose');
  const procurementBefore = before.classes.find((c) => c.decisionClass === 'procurement');
  assert.equal(procurementBefore.n, 4);
  assert.equal(procurementBefore.subsidiarity.pct, 0, 'nothing escalated has been resolved at the origin yet');

  // Returning an escalation downward restores it to the originating rung.
  assert.ok(api.escalationReturnDown(escalatedIds[0]).ok);
  const after = api.escalationRead();
  const procurement = after.classes.find((c) => c.decisionClass === 'procurement');
  assert.equal(procurement.atOriginN, 1, 'a returned monkey counts as resolved where it arose');
  assert.equal(procurement.subsidiarity.pct, 25);
  assert.equal(procurement.meanRungs, 1);
});

/* ------------------------------------------ 6. commitments: freeze & grade */

test('an intervention-rate commitment is frozen, graded once, and refused below the floor', () => {
  const { api, setNow } = harness();
  for (let i = 0; i < 6; i += 1) api.escalationLog(esc('mgr', { title: `Item ${i}` }));

  const declared = api.escalationDeclareCommitment({
    spanId: 'mgr',
    decisionClass: 'procurement',
    committedInterventionRatePct: 20,
    committedEscalationBudget: 1,
    forecastPct: 30,
  });
  assert.equal(declared.ok, true, declared.error);
  assert.equal(declared.commitment.status, 'declared');
  assert.equal(declared.commitment.observedInterventionRatePct, null, 'nothing is observed at declaration time');
  assert.equal(declared.commitment.periodKey, '2026-11-02');
  assert.equal(declared.commitment.reviewOn, '2026-11-18');

  assert.match(api.escalationGradeCommitment(declared.commitment.id).error, /before its review date/);

  setNow(new Date(NOW.getTime() + 30 * DAY));
  const graded = api.escalationGradeCommitment(declared.commitment.id);
  assert.equal(graded.ok, true, graded.error);
  assert.equal(graded.commitment.observedInterventionRatePct, 100);
  assert.equal(graded.commitment.observedEscalationCount, 6);
  assert.equal(graded.commitment.observedN, 6);
  assert.equal(graded.commitment.keptWithinBudget, 0, '6 escalations against a budget of 1');
  // Brier = (0.30 − 0)²
  assert.equal(graded.commitment.brier, 0.09);

  assert.match(api.escalationGradeCommitment(declared.commitment.id).error, /already been graded once/);

  const report = api.escalationRead();
  const mgr = report.authority.find((a) => a.seatId === 'mgr');
  assert.equal(mgr.verdict, 'above-commitment', 'de facto centralised: 100% observed against a 20% ceiling');
  assert.equal(report.calibration.gradedN, 1);
  assert.equal(report.calibration.brier, 0.09);
  assert.equal(report.calibration.skill, null, 'skill is withheld below the graded floor');
});

test('grading is refused below the evidence floor rather than graded from noise', () => {
  const { api, setNow } = harness();
  api.escalationLog(esc('mgr'));
  const declared = api.escalationDeclareCommitment({
    spanId: 'mgr', decisionClass: 'procurement',
    committedInterventionRatePct: 20, committedEscalationBudget: 1, forecastPct: 50,
  });
  assert.ok(declared.ok, declared.error);
  setNow(new Date(NOW.getTime() + 30 * DAY));
  assert.match(api.escalationGradeCommitment(declared.commitment.id).error, /below the 5-item floor/);
});

test('a breached graded commitment opens one authority reconciliation task', () => {
  const { api, store, setNow } = harness();
  for (let i = 0; i < 6; i += 1) api.escalationLog(esc('mgr', { title: `Item ${i}` }));
  const declared = api.escalationDeclareCommitment({
    spanId: 'mgr', decisionClass: 'procurement',
    committedInterventionRatePct: 20, committedEscalationBudget: 1, forecastPct: 30,
  });
  setNow(new Date(NOW.getTime() + 30 * DAY));
  api.escalationGradeCommitment(declared.commitment.id);

  const recon = store.state.delegations.filter((d) => String(d.title).includes('ESC-COMMIT'));
  assert.equal(recon.length, 1, 'exactly one reconciliation task per breached commitment');
  assert.equal(recon[0].personId, 'mgr');
  const edges = store.state.links.filter((l) => l.relation === 'reconciles-authority');
  assert.equal(edges.length, 1);

  const before = store.state.delegations.length;
  api.escalationScan();
  assert.equal(store.state.delegations.length, before, 'marker-idempotent');
});

/* ------------------------------------------------ 7. queue & monkey rules */

test('a saturated receiving span opens one capacity decision and one owned task', () => {
  const state = fixture();
  // 6 arrivals in 90 days = 0.467/wk against the 0.5/wk floor of the service
  // rate bound → ρ = 93%, past the 85% red floor.
  state.settings.escalationServiceRatePerWeek = 0.5;
  const { api, store } = harness(state);
  for (let i = 0; i < 6; i += 1) api.escalationLog(esc('mgr', { title: `Item ${i}` }));

  const report = api.escalationRead();
  const mgr = report.seatRows.find((r) => r.seatId === 'mgr');
  assert.equal(mgr.queue.state, 'saturated');
  assert.ok(mgr.queue.waitDaysLo > 0 && mgr.queue.waitDaysHi >= mgr.queue.waitDaysLo);

  const decisions = store.state.decisions.filter((d) => String(d.title).includes('ESC-QUEUE-mgr'));
  assert.equal(decisions.length, 1, 'exactly one governed decision per span per ISO week');
  assert.equal(decisions[0].options.length, 3);
  const tasks = store.state.delegations.filter((d) => String(d.title).includes('ESC-QUEUE-mgr'));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].personId, 'mgr');

  const before = store.state.decisions.length + store.state.delegations.length;
  api.escalationScan();
  assert.equal(store.state.decisions.length + store.state.delegations.length, before);
});

test('an unstable queue opens the capacity call and never prints a waiting time', () => {
  const state = fixture();
  state.settings.escalationWindowDays = 14; // 6 arrivals / 2 weeks = 3/wk
  state.settings.escalationServiceRatePerWeek = 0.5; // clamped floor
  const { api, store } = harness(state);
  for (let i = 0; i < 6; i += 1) api.escalationLog(esc('mgr', { title: `Item ${i}` }));
  const report = api.escalationRead();
  const mgr = report.seatRows.find((r) => r.seatId === 'mgr');
  assert.equal(mgr.queue.state, 'unstable');
  assert.equal(mgr.queue.waitDaysLo, null);
  assert.equal(mgr.queue.waitDaysHi, null);
  assert.ok(store.state.decisions.some((d) => String(d.title).includes('Queue unstable')));
});

test('the monkey ledger returns what has sat too long above where it arose', () => {
  const { api, store, setNow } = harness();
  api.escalationLog(esc('mgr', { title: 'A long-sitting item' }));
  setNow(new Date(NOW.getTime() + 30 * DAY));
  api.escalationScan();

  const returns = store.state.delegations.filter((d) => String(d.title).includes('ESC-MONKEY'));
  assert.equal(returns.length, 1, 'one return-the-monkey task, not one per scan');
  assert.equal(returns[0].personId, 'mgr', 'the task belongs to the span holding the monkey');

  const report = api.escalationRead();
  assert.equal(report.monkeys.total, 1);
  assert.equal(report.monkeys.overReturnWindow.length, 1);
  assert.equal(escalationAttentionCount(store.state, new Date(NOW.getTime() + 30 * DAY), store.state.settings), 1);

  const before = store.state.delegations.length;
  api.escalationScan();
  assert.equal(store.state.delegations.length, before);
});

test('automation is pausable and an explicit scan always runs', () => {
  const state = fixture();
  state.settings.escalationAutoPropagate = false;
  state.settings.escalationServiceRatePerWeek = 0.5;
  const { api, store } = harness(state);
  for (let i = 0; i < 6; i += 1) api.escalationLog(esc('mgr', { title: `Item ${i}` }));
  assert.equal(store.state.decisions.filter((d) => String(d.title).includes('ESC-QUEUE')).length, 0,
    'nothing is written automatically while automation is paused');

  assert.ok(api.escalationScan().ok, 'the explicit scan always runs');
  assert.equal(store.state.decisions.filter((d) => String(d.title).includes('ESC-QUEUE')).length, 1);
});

/* ------------------------------------------------- 8. exports & disclosure */

test('CSV scope #83 and the brief are aggregate-only: no person, name, title or note', () => {
  const { api, store } = harness();
  api.escalationLog(esc('mgr', { title: 'A very distinctive escalation title', note: 'A private note.', proposedAction: 'Do the distinctive thing' }));
  const rows = api.escalationCsvRows();
  assert.ok(rows.length >= 1);
  const blob = JSON.stringify(rows);
  for (const secret of ['A very distinctive escalation title', 'A private note.', 'Do the distinctive thing', 'lead1', 'Morgan Manager', 'Lee Lead']) {
    assert.ok(!blob.includes(secret), `CSV leaked "${secret}"`);
  }
  const brief = api.escalationBriefText();
  for (const secret of ['A very distinctive escalation title', 'A private note.', 'Morgan Manager', 'lead1']) {
    assert.ok(!brief.includes(secret), `brief leaked "${secret}"`);
  }
  assert.match(brief, /Escalation Economy/);
  assert.match(brief, /Aghion & Tirole/);
  const exported = exportWorkspaceCsv(store.state, 'escalation-economy', { now: NOW });
  assert.ok(exported.ok);
  assert.match(exported.csv, /row_kind/);
});

test('a subordinate seat sees its own span and nothing sideways', () => {
  const { api } = harness();
  assert.ok(api.escalationLog(esc('mgr', { title: 'Lee’s item' })).ok);
  assert.ok(api.setActiveSeat('lead2').ok);
  const read = api.escalationRead();
  assert.equal(read.totals.records, 0, 'a peer span cannot read another span’s ledger');
  assert.ok(!JSON.stringify(read).includes('Lee’s item'));
  // A declared seat MAY scan: the scan is scoped to its own subtree, and the
  // rules below only ever see the records the seat could already read.
  assert.ok(api.escalationScan().ok);
  assert.ok(!JSON.stringify(api.escalationRead()).includes('Lee’s item'), 'scanning cannot widen the boundary');
});

/* ------------------------------------------------------- 9. signals & UI */

test('insights signals appear only once the ledger has content', () => {
  const { store } = harness();
  assert.deepEqual(escalationSignals(store.state, NOW, store.state.settings), []);
  const { api, store: s2 } = harness();
  for (let i = 0; i < 5; i += 1) {
    const r = api.escalationLog(esc('mgr', { title: `Item ${i}` }));
    api.escalationSettle(r.record.id, { resolution: 'endorsed', outcomeDiffers: false });
  }
  const signals = escalationSignals(s2.state, NOW, s2.state.settings);
  assert.ok(signals.some((x) => x.ruleId === 'ESC-02'), 'pure overhead raises ESC-02');
  for (const signal of signals) {
    assert.ok(signal.action?.route?.startsWith('#/escalation'), signal.ruleId);
    assert.ok(['1', '2', '3', '4', '5'].includes(String(signal.severity)));
  }
});

test('all five panels render, carry one h1, and never leak a raw 0 for a refused figure', () => {
  const dom = new JSDOM('<!doctype html><div id="modal-root"></div><div id="toast-root"></div>', { url: 'https://leados.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  try {
    const { api, store } = harness();
    for (let i = 0; i < 6; i += 1) {
      const r = api.escalationLog(esc('mgr', { title: `Item ${i}` }));
      api.escalationSettle(r.record.id, { resolution: 'endorsed', outcomeDiffers: false });
    }
    api.escalationDeclareCommitment({
      spanId: 'mgr', decisionClass: 'procurement',
      committedInterventionRatePct: 20, committedEscalationBudget: 1, forecastPct: 30,
    });
    for (const panel of ['ledger', 'queue', 'yield', 'authority', 'brief']) {
      const node = renderEscalation({
        now: NOW, state: store.state, api,
        query: new URLSearchParams({ panel }), navigate() {}, refresh() {},
      });
      assert.equal(node.querySelectorAll('h1').length, 1, panel);
      assert.match(node.textContent, /Escalation Economy/, panel);
      assert.ok(node.textContent.includes('withheld') || node.textContent.includes('%'), `${panel} must print a figure or a refusal`);
    }
  } finally {
    dom.window.close();
  }
});

test('the week key convention the commitment period uses is the workspace one', () => {
  assert.equal(weekKey(NOW), '2026-11-02', 'Monday-based week start');
});
