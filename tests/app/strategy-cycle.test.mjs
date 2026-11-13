/** ADR-0089, Schema v94: cross-altitude Strategy ↔ Catchball renewal bridge. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, CSV_EXPORTS, parseCsv } from '../../app/core/csv.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { buildSeats, activeSeat, canSee, projectForSeat } from '../../app/core/domain/seat.js';
import { compileDisclosure } from '../../app/core/domain/disclosure.js';
import { workspaceRouteVerdict } from '../../app/core/domain/accessGateway.js';
import { LINK_ENTITY_COLLECTIONS, LINK_ENTITY_TYPES, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { buildStrategyCycleReport, strategyCycleBrier, strategyCycleBriefText, strategyCycleCsvRows } from '../../app/core/domain/strategyCycle.js';
import { STRATEGY_CYCLE_LIMITS, STRATEGY_CYCLE_PLAYBOOK } from '../../app/core/domain/strategyCycleRegistry.js';
import { normalizeStrategyCycleReading } from '../../app/core/domain/strategyCycleSchema.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();
const day = (offset) => new Date(NOW.getTime() + offset * 86400000).toISOString().slice(0, 10);
const clone = (value) => JSON.parse(JSON.stringify(value));

function pact(id, toSeatId, { betId = 'bet-a', status = 'agreed', gradedOn = null, outcome = null, effortDays = 1, confidencePct = 70 } = {}) {
  return {
    id,
    title: `Private pact title ${id}`,
    summary: `Private negotiation summary ${id}`,
    strategyBetId: betId,
    fromSeatId: 'leader',
    toSeatId,
    altitudeKey: toSeatId === 'dir' ? 'director' : toSeatId === 'mgr' ? 'manager' : 'frontline',
    status,
    leadingMetric: 'Private leading measure',
    leadingUnit: 'items',
    leadingTarget: 10,
    leadingActual: 8,
    leadingPct: 80,
    laggingMetric: 'Private outcome measure',
    laggingUnit: 'percent',
    laggingTarget: 80,
    laggingActual: 70,
    laggingPct: 70,
    reportedPct: 75,
    effortDays,
    frozenConfidencePct: confidencePct,
    dueOn: day(10),
    startsOn: day(-7),
    gradedOn,
    gradedOutcome: outcome,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
}

function fixture({ activeSeatId = null, small = false, settings = {}, pacts = null, cycles = [] } = {}) {
  const state = createEmptyState(NOW_ISO);
  state.settings = {
    ...state.settings,
    chainLeaderAltitude: 'chief',
    activeSeatId,
    strategyCycleEvidenceFloor: 3,
    strategyCycleCellFloor: 3,
    strategyCycleAutoPropagate: true,
    catchballAutoPropagate: false,
    ...settings,
  };
  state.people = [
    { id: 'vp', name: 'Vic Executive', role: 'VP', level: 'vp', status: 'active' },
    { id: 'dir', name: 'Dee Director', role: 'Director', level: 'director', managerId: 'vp', status: 'active' },
    { id: 'mgr', name: 'Morgan Manager', role: 'Manager', level: 'manager', managerId: 'dir', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', managerId: 'mgr', status: 'active' },
    { id: 'lead2', name: 'Pat Lead', role: 'Lead', level: 'lead', managerId: 'mgr', status: 'active' },
    { id: 'ic1', name: 'Ari Analyst', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Bo Analyst', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active' },
  ];
  state.strategyBets = [
    { id: 'bet-a', title: 'Improve delivery reliability', status: 'active', adoptedOn: '2026-01-01', weightPct: 60,
      ownerId: 'dir', horizonWeeks: 26, killCriterion: { metric: 'delivery', threshold: 60, direction: 'below', checkOn: '2026-12-15' } },
    { id: 'bet-b', title: 'Reduce avoidable rework', status: 'active', adoptedOn: '2026-01-01', weightPct: 40,
      ownerId: 'dir', horizonWeeks: 26, killCriterion: { metric: 'rework', threshold: 50, direction: 'above', checkOn: '2026-12-15' } },
  ];
  state.catchballPacts = pacts || (small
    ? [pact('pact-small', 'lead1')]
    : [
      pact('pact-a1', 'lead1'), pact('pact-a2', 'lead1'), pact('pact-a3', 'lead1'),
      pact('pact-b1', 'lead2', { betId: 'bet-b' }), pact('pact-b2', 'lead2', { betId: 'bet-b' }), pact('pact-b3', 'lead2', { betId: 'bet-b' }),
    ]);
  state.strategyCycles = cycles;
  return normalizeState(state, { now: NOW }).state;
}

function harness(state = fixture()) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let current = NOW;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-strategy-cycle-${++seq}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { store, api, setNow: (value) => { current = value; } };
}

function reportAt(state, seatId) {
  const copy = clone(state);
  copy.settings.activeSeatId = seatId;
  return buildStrategyCycleReport(copy, { now: NOW });
}

function reading(id, scopeSeatId, altitudeKey, rank, patch = {}) {
  return {
    id, scopeSeatId, altitudeKey, rank, status: 'frozen',
    frozenOn: '2026-10-01', reviewOn: '2026-11-01', periodStart: '2026-10-01',
    windowDays: 31, sourceRevision: 1, previousId: null,
    cohortPactIds: [],
    metrics: { active: 0, carryover: 0, overdue: 0, watermelon: 0, stopRuleDue: 0, stoppedBet: 0,
      unmeasured: 0, effortDays: 0, releasedEffortDays: 0, reviewEffortDays: 0, suppressed: false },
    forecast: { basis: 'same-altitude', settledN: 0, deliveredN: 0, deliveryRatePct: null,
      lowerPct: null, upperPct: null, brier: null, refusal: 'no-settled-history' },
    byAltitude: [], byBet: [], grade: null, createdAt: '2026-10-01T00:00:00.000Z',
    ...patch,
  };
}

test('Schema v94 migrates additively without fabricating cycles and strips untyped snapshot content', () => {
  assert.equal(SCHEMA_VERSION, 149);
  const migrated = migrate({ schemaVersion: 93, settings: { leaderName: 'Keep this' }, catchballPacts: [{ id: 'existing-pact' }] });
  assert.deepEqual(migrated.applied, ['93 → 94', '94 → 95', '95 → 96', '96 → 97', '97 → 98', '98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113', '113 → 114', '114 → 115', '115 → 116', '116 → 117', '117 → 118', '118 → 119', '119 → 120', '120 → 121', '121 → 122', '122 → 123', '123 → 124', '124 → 125', '125 → 126', '126 → 127', '127 → 128', '128 → 129', '129 → 130', '130 → 131', '131 → 132', '132 → 133', '133 → 134', '134 → 135', '135 → 136', '136 → 137', '137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149']);
  assert.deepEqual(migrated.raw.strategyCycles, []);
  assert.deepEqual(migrated.raw.strategyCycleMarkers, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep this');
  assert.equal(migrated.raw.settings.strategyCycleEvidenceFloor, 5);
  assert.equal(migrated.raw.settings.strategyCycleAutoPropagate, true);
  assert.deepEqual(createEmptyState(NOW_ISO).strategyCycles, []);
  assert.equal(LINK_ENTITY_COLLECTIONS.strategycycle, 'strategyCycles');
  assert.ok(LINK_ENTITY_TYPES.includes('strategycycle'));
  assert.deepEqual(Object.keys(LINK_ENTITY_COLLECTIONS).sort(), [...LINK_ENTITY_TYPES].sort());
  const safeCycle = reading('linked-cycle', 'leader', 'chief', 5, { cohortPactIds: ['secret-pact-id'] });
  const linked = resolveLinkedEntity({ strategyCycles: [safeCycle] }, 'strategycycle', safeCycle.id);
  assert.equal(linked.route, '#/strategy-cycle?cycle=linked-cycle');
  assert.equal(linked.raw.cohortPactIds, undefined, 'the general graph resolver never returns frozen cohort IDs');

  const hostile = reading('cycle-safe', 'leader', 'chief', 5, {
    title: 'PRIVATE CYCLE TITLE', notes: 'PRIVATE CYCLE NOTE', personName: 'PRIVATE PERSON',
    byBet: [{ betId: 'bet-a', betTitle: 'PRIVATE BET TITLE', activeN: 4, privateNote: 'PRIVATE BET NOTE' }],
    metrics: { active: 999, effortDays: 17, suppressed: false },
  });
  const normalized = normalizeStrategyCycleReading(hostile);
  assert.equal(normalized.metrics.active, STRATEGY_CYCLE_LIMITS.cohortPacts);
  const serialized = JSON.stringify(normalized);
  for (const secret of ['PRIVATE CYCLE TITLE', 'PRIVATE CYCLE NOTE', 'PRIVATE PERSON', 'PRIVATE BET TITLE', 'PRIVATE BET NOTE']) {
    assert.ok(!serialized.includes(secret), `frozen reading drops ${secret}`);
  }
});

test('the Disclosure Compiler opens only the scoped Strategy Cycle adapter, not raw cohort rows', () => {
  const state = fixture({ activeSeatId: 'lead1', cycles: [reading('opaque-cycle', 'leader', 'chief', 5)] });
  state.strategyCycleMarkers = [{ id: 'opaque-marker', cycleId: 'opaque-cycle' }];
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const seat = activeSeat(built);
  const projection = projectForSeat(state, seat, built);
  const compiled = compileDisclosure(state, seat, built, { now: NOW, settings: state.settings });

  assert.deepEqual(projection.visible.strategyCycles, [], 'raw frozen cohort IDs never enter a declared-seat projection');
  assert.deepEqual(projection.visible.strategyCycleMarkers, [], 'internal rule markers never enter a declared-seat projection');
  assert.equal(compiled.entries['strategy-cycle'].posture, 'detail', 'the route renders its independently scoped report rather than a generic aggregate');
  assert.equal(workspaceRouteVerdict('strategy-cycle', seat, { state, built, compiled }).allow, true);
});

test('five altitude surfaces have different decision objects and the intended detail boundary', () => {
  const state = fixture();
  state.strategyBets.push({ id: 'outside-bet', title: 'Outside-scope strategic bet', status: 'active', ownerId: 'other-seat', weightPct: 100 });
  const frontline = reportAt(state, 'lead1');
  const manager = reportAt(state, 'mgr');
  const director = reportAt(state, 'dir');
  const executive = reportAt(state, 'vp');
  const chief = reportAt(state, 'leader');

  assert.deepEqual([frontline, manager, director, executive, chief].map((report) => report.seat.rank), [1, 2, 3, 4, 5]);
  assert.equal(new Set(Object.values(STRATEGY_CYCLE_PLAYBOOK).map((entry) => entry.title)).size, 5);
  assert.equal(new Set(Object.values(STRATEGY_CYCLE_PLAYBOOK).map((entry) => entry.decision)).size, 5);

  assert.equal(frontline.live.details.length, 3);
  assert.match(frontline.live.details[0].title, /Private pact title/);
  assert.equal(frontline.live.byBet.length, 0);
  assert.equal(manager.live.details.length, 6);
  assert.equal(manager.live.metrics.active, 6);

  assert.equal(director.live.details.length, 0, 'director sees bet-level data, not local pact titles');
  assert.deepEqual(director.live.byBet.map((row) => row.activeN), [3, 3]);
  assert.ok(!director.live.byBet.some((row) => row.betId === 'outside-bet'), 'unrelated strategic bet titles do not cross the director scope');
  assert.ok(director.live.byBet.some((row) => row.projectedEffortDays >= 0));
  assert.equal(executive.live.byBet.length, 0);
  assert.equal(executive.live.details.length, 0);
  assert.equal(executive.live.forecast.basis, 'same-altitude');
  assert.ok(executive.live.spans.every((row) => !['Dee Director', 'Morgan Manager', 'Lee Lead', 'Pat Lead'].includes(row.label)));
  assert.equal(chief.playbook.title, STRATEGY_CYCLE_PLAYBOOK.chief.title);
  assert.equal(chief.live.forecast.basis, 'all-altitudes');
  assert.equal(chief.live.details.length, 0);

  const unsorted = fixture({ cycles: [
    reading('older', 'leader', 'chief', 5, { frozenOn: '2026-09-01', reviewOn: '2026-10-01', periodStart: '2026-09-01' }),
    reading('newer', 'leader', 'chief', 5, { frozenOn: '2026-10-15', reviewOn: '2026-11-01', periodStart: '2026-10-15' }),
  ] });
  const priorOrder = unsorted.strategyCycles.map((cycle) => cycle.id);
  buildStrategyCycleReport(unsorted, { now: NOW });
  assert.deepEqual(unsorted.strategyCycles.map((cycle) => cycle.id), priorOrder, 'the read model sorts a copy, not the persisted ledger');

  const built = buildSeats(state, { now: NOW });
  const projection = projectForSeat(state, built.byId.get('dir'), built);
  assert.deepEqual(projection.visible.strategyCycles, [], 'raw frozen cohort IDs never enter a declared-seat projection');
  assert.deepEqual(projection.visible.strategyCycleMarkers, [], 'internal rule markers are never projected');
  assert.equal(canSee(state.strategyCycles[0] || reading('raw-cycle', 'dir', 'director', 3), 'strategyCycles', built.byId.get('dir'), built).allow, 'aggregate');
});

test('director and executive small cells suppress complements, history counts and scoped exports', () => {
  const state = fixture({ small: true });
  const director = reportAt(state, 'dir');
  assert.equal(director.live.metrics.suppressed, true);
  assert.deepEqual(director.live.byBet, []);
  assert.ok(director.live.byAltitude.every((row) => row.suppressed && row.activeN === 0));
  assert.ok(director.live.spans.every((row) => row.suppressed));
  assert.deepEqual(director.live.details, []);

  const cycle = reading('one-small-cycle', 'vp', 'exec', 4, {
    metrics: { active: 1, carryover: 0, overdue: 0, watermelon: 0, stopRuleDue: 0, stoppedBet: 0,
      unmeasured: 0, effortDays: 2, releasedEffortDays: 0, reviewEffortDays: 0, suppressed: false },
    cohortPactIds: ['pact-small'],
  });
  const high = fixture({ activeSeatId: 'vp', small: true, cycles: [cycle], pacts: [pact('pact-small', 'lead1')] });
  const executive = buildStrategyCycleReport(high, { now: NOW });
  assert.equal(executive.live.historyCount, null, 'a small history count is not released');
  assert.equal(executive.history[0].metrics.suppressed, true);
  assert.equal(executive.history[0].metrics.active, 0);
  assert.equal(executive.history[0].cohortPactIds, undefined);

  const splitHistory = reading('split-history', 'dir', 'director', 3, {
    metrics: { active: 9, carryover: 0, overdue: 0, watermelon: 0, stopRuleDue: 0, stoppedBet: 0,
      unmeasured: 0, effortDays: 9, releasedEffortDays: 0, reviewEffortDays: 0, suppressed: false },
    byAltitude: [
      { altitudeKey: 'director', rank: 3, activeN: 8, carryoverN: 0, overdueN: 0, effortDays: 8 },
      { altitudeKey: 'manager', rank: 2, activeN: 1, carryoverN: 0, overdueN: 0, effortDays: 1 },
    ],
    byBet: [{ betId: 'bet-a', activeN: 8, effortDays: 8 }, { betId: 'bet-b', activeN: 1, effortDays: 1 }],
    forecast: { basis: 'same-altitude', settledN: 8, deliveredN: 6, deliveryRatePct: 75,
      lowerPct: 40, upperPct: 92, brier: 0.2, refusal: 'none' },
  });
  const splitReport = buildStrategyCycleReport(fixture({ activeSeatId: 'dir', pacts: [], cycles: [splitHistory] }), { now: NOW });
  assert.equal(splitReport.history[0].metrics.suppressed, true);
  assert.equal(splitReport.history[0].metrics.active, 0, 'a small child cannot be reconstructed by subtracting a complementary total');
  assert.equal(splitReport.history[0].forecast.refusal, 'small-cell-suppressed');
  assert.deepEqual(splitReport.history[0].byBet, []);

  const csv = exportWorkspaceCsv({ ...clone(state), settings: { ...state.settings, activeSeatId: 'dir' } }, 'strategy-renewal', { now: NOW });
  assert.equal(csv.ok, true);
  assert.equal(csv.scope, 'strategy-renewal');
  assert.match(csv.csv, /withheld-small-cell/);
  const scopedReport = buildStrategyCycleReport({ ...clone(state), settings: { ...state.settings, activeSeatId: 'dir' } }, { now: NOW });
  assert.equal(strategyCycleCsvRows(scopedReport).length, parseCsv(csv.csv).rows.length);
  for (const secret of ['pact-small', 'Private pact title', 'bet-a', 'Improve delivery reliability', 'PRIVATE']) {
    assert.ok(!csv.csv.includes(secret), `scoped export omits ${secret}`);
  }
  assert.equal(CSV_EXPORTS.find((row) => row.key === 'strategy-renewal').sensitive, false);
  assert.deepEqual(parseCsv(csv.csv).headers, ['row_kind', 'altitude', 'rank', 'active_pacts', 'carryover_pacts', 'overdue_pacts',
    'effort_days', 'delivery_reference_pct', 'delivery_interval_low_pct', 'delivery_interval_high_pct', 'settled_n', 'verdict']);
});

test('forecast refuses to label the reference as prediction and withholds small denominators', () => {
  const settled = [
    pact('settled-1', 'dir', { status: 'settled', gradedOn: '2026-10-15', outcome: 'delivered' }),
    pact('settled-2', 'dir', { status: 'settled', gradedOn: '2026-10-20', outcome: 'missed' }),
    pact('settled-old', 'lead1', { status: 'settled', gradedOn: '2026-09-30', outcome: 'delivered', confidencePct: null }),
  ];
  const state = fixture({ activeSeatId: 'dir', pacts: settled });
  const report = buildStrategyCycleReport(state, { now: NOW });
  assert.equal(report.live.forecast.refusal, 'small-cell-suppressed');
  assert.equal(report.live.forecast.settledN, 0);
  assert.equal(report.live.forecast.deliveryRatePct, null);
  assert.match(strategyCycleBriefText(report), /withheld \(small-cell-suppressed, n=0\)/);

  const root = reportAt(state, 'leader');
  assert.equal(root.live.forecast.basis, 'all-altitudes');
  assert.equal(root.live.forecast.refusal, 'none', 'three all-altitude historical outcomes meet the declared floor');
  assert.equal(root.live.forecast.settledN, 3);
  assert.equal(root.live.forecast.brier, null, 'Brier abstains when explicit confidence observations fall below the evidence floor');
  assert.equal(strategyCycleBrier([
    { frozenConfidencePct: 70, gradedOutcome: 'delivered' },
    { frozenConfidencePct: 70, gradedOutcome: 'missed' },
    { frozenConfidencePct: null, gradedOutcome: 'delivered' },
  ], 2), 0.29, 'missing confidence is excluded, not coerced to a 0% forecast');
});

test('freeze rejects an over-cap cohort rather than silently truncating frozen evidence', () => {
  const oversized = Array.from({ length: STRATEGY_CYCLE_LIMITS.cohortPacts + 1 }, (_, index) => pact(`overflow-${index}`, 'lead1'));
  const { store, api } = harness(fixture({ pacts: oversized }));
  const result = api.strategyCycleFreeze({ reviewOn: '2026-11-20' });
  assert.equal(result.ok, false);
  assert.match(result.error, /will not silently truncate/);
  assert.equal(store.state.strategyCycles.length, 0);
  assert.equal(store.state.catchballPacts.length, STRATEGY_CYCLE_LIMITS.cohortPacts + 1);
  assert.ok(!store.state.events.some((event) => event.type === 'strategy-cycle.frozen'));
});

test('freeze is prospective, idempotent per seat/day, and creates typed human-governed renewal links atomically', () => {
  const { store, api, setNow } = harness();
  const originalPacts = clone(store.state.catchballPacts);
  const originalBets = clone(store.state.strategyBets);
  const first = api.strategyCycleFreeze({ reviewOn: '2026-11-20' });
  assert.equal(first.ok, true, first.error);
  assert.equal(first.existing, false);
  const cycle = store.state.strategyCycles.find((row) => row.id === first.id);
  assert.ok(cycle);
  assert.equal(cycle.cohortPactIds.length, 6);
  assert.equal(cycle.metrics.active, 6);
  const cycleLinks = store.state.links.filter((link) => link.sourceType === 'strategycycle' && link.sourceId === cycle.id);
  assert.ok(cycleLinks.some((link) => link.targetType === 'catchballpact' && link.relation === 'audits-cascade'));
  assert.ok(cycleLinks.some((link) => link.targetType === 'strategy' && link.relation === 'audits-cascade'));
  assert.equal(store.state.decisions.length, 0);
  const secondSameDay = api.strategyCycleFreeze({ reviewOn: '2026-11-25' });
  assert.equal(secondSameDay.ok, true);
  assert.equal(secondSameDay.existing, true);
  assert.equal(store.state.strategyCycles.length, 1);

  setNow(new Date('2026-11-05T12:00:00.000Z'));
  const next = api.strategyCycleFreeze({ reviewOn: '2026-11-25' });
  assert.equal(next.ok, true, next.error);
  assert.equal(store.state.strategyCycles.length, 2);
  const linksBeforeRescan = store.state.links.length;
  const decisionsBeforeRescan = store.state.decisions.length;
  api.strategyCycleScan();
  assert.equal(store.state.links.length, linksBeforeRescan);
  assert.equal(store.state.decisions.length, decisionsBeforeRescan);
  const renewal = store.state.decisions[0];
  assert.match(renewal.title, /Renew or reconcile/);
  assert.match(renewal.question, /No budget, owner, date or pact changes/);
  assert.equal(store.state.links.filter((link) => link.targetType === 'decision' && link.targetId === renewal.id && link.relation === 'reconciles').length, 6);
  assert.deepEqual(store.state.catchballPacts, originalPacts, 'the rule never changes a Catchball owner’s commitment');
  assert.deepEqual(store.state.strategyBets, originalBets, 'the rule never reallocates or edits a strategic bet');
  assert.equal(store.state.events.filter((event) => event.type === 'automation.rule_error').length, 0);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  const names = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.name);
  assert.equal(names.indexOf('strategyCycleRule'), names.indexOf('catchballRule') + 1);
  assert.equal(names.at(-1), 'sealRule');
});

test('explicit scans bypass the pause but process only the active seat’s frozen cycles', () => {
  const cycles = [
    reading('cycle-lead1', 'lead1', 'frontline', 1, { cohortPactIds: ['pact-a1'] }),
    reading('cycle-lead2', 'lead2', 'frontline', 1, { cohortPactIds: ['pact-b1'] }),
  ];
  const state = fixture({ activeSeatId: 'lead1', settings: { strategyCycleAutoPropagate: false }, cycles });
  const { store, api } = harness(state);
  assert.equal(store.state.settings.strategyCycleAutoPropagate, false);
  const result = api.strategyCycleScan();
  assert.equal(result.ok, true, result.error);
  assert.ok(store.state.links.some((link) => link.sourceType === 'strategycycle' && link.sourceId === 'cycle-lead1'));
  assert.ok(!store.state.links.some((link) => link.sourceType === 'strategycycle' && link.sourceId === 'cycle-lead2'));
  assert.ok(store.state.strategyCycleMarkers.some((marker) => marker.readingId === 'cycle-lead1'));
  assert.ok(!store.state.strategyCycleMarkers.some((marker) => marker.readingId === 'cycle-lead2'));
});

test('retiring a bet leaves its Catchball work untouched and opens one owner-consent reconciliation', () => {
  const { store, api } = harness();
  const before = clone(store.state.catchballPacts);
  const result = api.retireStrategyBet('bet-a', { reason: 'The stop rule was crossed.' });
  assert.equal(result.ok, true, result.error);
  assert.equal(store.state.strategyBets.find((row) => row.id === 'bet-a').status, 'retired');
  assert.deepEqual(store.state.catchballPacts, before);
  assert.equal(store.state.decisions.length, 1);
  assert.match(store.state.decisions[0].question, /owner agrees/);
  assert.ok(store.state.links.some((link) => link.sourceType === 'strategy' && link.sourceId === 'bet-a'
    && link.targetType === 'decision' && link.relation === 'decides'));
  assert.ok(store.state.links.some((link) => link.targetType === 'decision' && link.relation === 'reconciles'));
  const director = buildStrategyCycleReport({ ...clone(store.state), settings: { ...store.state.settings, activeSeatId: 'dir' } }, { now: NOW });
  const scenario = director.live.byBet.find((row) => row.betId === 'bet-b');
  assert.equal(scenario.projectedEffortDays, 6, 'released effort is shown as a counterfactual across the remaining active bet weights');
  assert.equal(store.state.catchballPacts[0].status, 'agreed');
});

test('an over-cap retired-bet scope is recorded as withheld instead of creating a partial owner-consent decision', () => {
  const oversized = Array.from({ length: STRATEGY_CYCLE_LIMITS.cohortPacts + 1 }, (_, index) => pact(`retired-overflow-${index}`, 'lead1'));
  const { store, api } = harness(fixture({ pacts: oversized }));
  const before = clone(store.state.catchballPacts);
  const result = api.retireStrategyBet('bet-a', { reason: 'A human strategy review retired this bet.' });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(store.state.catchballPacts, before);
  assert.equal(store.state.decisions.length, 0);
  assert.ok(store.state.strategyCycleMarkers.some((marker) => marker.kind === 'retired-bet-overflow'));
  assert.ok(store.state.events.some((event) => /no partial owner-consent decision/.test(event.summary)));
  assert.ok(!store.state.links.some((link) => link.targetType === 'decision' && link.relation === 'reconciles'));
});

test('out-of-sample grade only counts frozen-cohort outcomes settled inside its review window', () => {
  const pacts = [
    pact('grade-1', 'dir', { status: 'settled', gradedOn: '2026-10-10', outcome: 'delivered' }),
    pact('grade-2', 'dir', { status: 'settled', gradedOn: '2026-10-20', outcome: 'delivered' }),
    pact('grade-3', 'dir', { status: 'settled', gradedOn: '2026-10-30', outcome: 'missed', confidencePct: null }),
    pact('grade-4', 'dir', { status: 'settled', gradedOn: '2026-10-25', outcome: 'missed' }),
    pact('grade-before-freeze', 'dir', { status: 'settled', gradedOn: '2026-09-30', outcome: 'delivered' }),
    pact('grade-after-window', 'dir', { status: 'settled', gradedOn: '2026-11-02', outcome: 'delivered' }),
  ];
  const frozen = reading('frozen-grade-window', 'leader', 'chief', 5, {
    cohortPactIds: pacts.map((row) => row.id),
    metrics: { active: 5, carryover: 0, overdue: 0, watermelon: 0, stopRuleDue: 0, stoppedBet: 0,
      unmeasured: 0, effortDays: 0, releasedEffortDays: 0, reviewEffortDays: 0, suppressed: false },
  });
  const state = fixture({ pacts, cycles: [frozen] });
  const { store, api } = harness(state);
  const result = api.strategyCycleScan();
  assert.equal(result.ok, true, result.error);
  const updated = store.state.strategyCycles.find((row) => row.id === frozen.id);
  assert.equal(updated.status, 'graded');
  assert.equal(updated.grade.settledN, 4);
  assert.equal(updated.grade.deliveredN, 2);
  assert.equal(updated.grade.brier, 0.2233, 'the Brier score uses only pacts with explicitly frozen confidence');
  assert.equal(updated.grade.gradedOn, '2026-11-04');
});
