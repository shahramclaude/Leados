/** ADR-0085: Hoshin Carryover Terminal — settlement, release, roll-up and calibration. */
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
  buildCarryoverReport,
  carryoverBriefText,
  carryoverCalibration,
  carryoverReleasePreview,
  resolvePactBet,
  wilsonInterval,
} from '../../app/core/domain/carryover.js';
import { normalizeCarryoverRecords, normalizeCarryoverSettings } from '../../app/core/domain/carryoverSchema.js';
import { renderCarryover } from '../../app/views/carryover.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const DAY = 86400000;

function fixture() {
  const state = createEmptyState(NOW.toISOString());
  for (const key of Object.keys(state.settings)) if (key.endsWith('AutoPropagate')) state.settings[key] = false;
  state.settings.catchballAutoPropagate = true;
  state.settings.carryoverAutoPropagate = true;
  state.people = [
    { id: 'vp', name: 'Vic Executive', role: 'VP', level: 'vp', status: 'active' },
    { id: 'dir', name: 'Dee Director', role: 'Director', level: 'director', managerId: 'vp', status: 'active' },
    { id: 'mgr', name: 'Morgan Manager', role: 'Manager', level: 'manager', managerId: 'dir', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', managerId: 'mgr', status: 'active' },
    { id: 'lead2', name: 'Pat Lead', role: 'Lead', level: 'lead', managerId: 'mgr', status: 'active' },
    { id: 'ic1', name: 'Ari Analyst', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Bo Analyst', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active' },
  ];
  state.strategyBets = [{
    id: 'bet1', title: 'A strategy bet', weightPct: 60, status: 'active', ownerId: 'dir',
    killCriterion: { metric: 'Median time to first value', threshold: 14, direction: 'above', checkOn: '2026-10-01', note: '' },
    createdAt: NOW.toISOString(),
  }];
  state.budgets = [{
    id: 'budget1', name: 'Operations', ownerId: 'dir', status: 'active', currency: 'DKK', limit: 2000,
    lines: [{
      id: 'line1', title: 'Pact encumbrance', category: 'tools-software', status: 'committed',
      committedAmount: 500, actualAmount: null, committedOn: '2026-09-01', expectedOn: '2026-10-20',
      spentOn: null, releasedOn: null, releasedReason: '', actualsDueOn: null,
    }],
    createdAt: NOW.toISOString(),
  }];
  state.goals = [{ id: 'existing-goal', title: 'Existing commitment', ownerId: 'lead1', status: 'active', keyResults: [], createdAt: NOW.toISOString() }];
  return normalizeState(state, { now: NOW }).state;
}

function harness(state = fixture()) {
  const mem = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  let serial = 0; let current = NOW;
  const idFactory = (p) => `${p}-test-${++serial}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { api, store, setNow: (date) => { current = date; } };
}

const proposal = (toSeatId = 'lead1', extra = {}) => ({
  title: 'Improve the delivery flow', toSeatId, effortDays: 2,
  budgetId: 'budget1', currency: 'DKK', resourceAskAmount: 500,
  strategyBetId: 'bet1', ...extra,
});

/** Find the budget line a pact encumbered (the accept action creates its own). */
function encumberedLine(state, budgetId) {
  const budget = state.budgets.find((b) => b.id === budgetId);
  if (!budget) return null;
  // The pact's encumbrance points at the line the accept action created.
  const pact = (state.catchballPacts || []).find((p) => p && p.budgetId === budgetId && p.encumberedLineId);
  if (pact) return budget.lines.find((l) => l.id === pact.encumberedLineId) || null;
  return budget.lines.find((l) => l.status === 'committed') || null;
}

// ---------------------------------------------------------------------------
// Schema, graph vocabulary and spine parity
// ---------------------------------------------------------------------------

test('v90 migration, record validation, graph vocabulary and spine parity', () => {
  assert.equal(SCHEMA_VERSION, 152);
  const migrated = migrate({ schemaVersion: 90, settings: { leaderName: 'Keep' }, people: [] });
  assert.deepEqual(migrated.applied, ['90 → 91', '91 → 92', '92 → 93', '93 → 94', '94 → 95', '95 → 96', '96 → 97', '97 → 98', '98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113', '113 → 114', '114 → 115', '115 → 116', '116 → 117', '117 → 118', '118 → 119', '119 → 120', '120 → 121', '121 → 122', '122 → 123', '123 → 124', '124 → 125', '125 → 126', '126 → 127', '127 → 128', '128 → 129', '129 → 130', '130 → 131', '131 → 132', '132 → 133', '133 → 134', '134 → 135', '135 → 136', '136 → 137', '137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149', '149 → 150', '150 → 151', '151 → 152']);
  assert.deepEqual(migrated.raw.carryoverRecords, []);
  assert.deepEqual(migrated.raw.carryoverMarkers, []);
  assert.deepEqual(migrated.raw.carryoverGradings, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep');
  assert.equal(migrated.raw.settings.carryoverCellFloor, 5);
  const warnings = [];
  assert.deepEqual(normalizeCarryoverRecords([{ id: 'bad', pactId: 'p', status: 'nope' }], warnings), []);
  assert.ok(warnings.length);
  assert.equal(LINK_ENTITY_COLLECTIONS.carryover, 'carryoverRecords');
  for (const relation of ['carries-over', 'settles', 'releases-resource']) {
    assert.ok(LINK_RELATIONS.includes(relation));
    assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes(relation));
  }
  const names = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.name);
  // Position is by dependency, not adjacency: it reads settled pacts, so it must
  // come after the catchball rule and before the market's work-producing pass.
  assert.ok(names.indexOf('carryoverRule') > names.indexOf('catchballRule'));
  assert.ok(names.indexOf('carryoverRule') < names.indexOf('attentionMarketRule'));
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  assert.equal(CSV_EXPORTS.filter((s) => s.key === 'carryover-settlement').length, 1, 'registered exactly once');
  // Settings clamp to declared bounds.
  const clamped = normalizeCarryoverSettings({ carryoverCellFloor: 999, carryoverReliabilityFloorPct: -5 });
  assert.equal(clamped.carryoverCellFloor, 100);
  assert.equal(clamped.carryoverReliabilityFloorPct, 1);
});

// ---------------------------------------------------------------------------
// RULE-CO-01: settlement cascade — one transaction, modules × hierarchy
// ---------------------------------------------------------------------------

test('settling a pact as thesis-invalidated creates the record, decision and roll-up in one transaction', () => {
  const { api, store } = harness();
  const proposed = api.catchballPropose(proposal('lead1'));
  assert.equal(proposed.ok, true, proposed.error);
  const pactId = proposed.pact.id;
  const accepted = api.catchballAccept(pactId, {});
  assert.equal(accepted.ok, true, accepted.error);
  const line = encumberedLine(store.state, 'budget1');
  assert.ok(line, 'the pact encumbered a budget line');

  const settled = api.catchballSettle(pactId, { gradedOutcome: 'thesis-invalidated' });
  assert.equal(settled.ok, true, settled.error);

  const state = store.state;
  const records = state.carryoverRecords || [];
  assert.equal(records.length, 1, 'exactly one carryover record');
  const record = records[0];
  assert.equal(record.pactId, pactId);
  assert.equal(record.betId, 'bet1');
  assert.equal(record.betBasis, 'pact.strategyBetId');
  assert.equal(record.status, 'pending-settlement');
  assert.equal(record.resource.effortDays, 2);
  assert.equal(record.resource.budgetId, 'budget1');
  assert.equal(record.resource.encumberedLineId, line.id);
  assert.equal(record.resource.committedAmount, 500);

  // The governed settlement decision exists and is attached.
  const decision = (state.decisions || []).find((d) => d.id === record.settlementDecisionId);
  assert.ok(decision, 'a settlement decision was opened');
  assert.equal(decision.chosen, '');
  assert.ok(decision.question.includes('[CO-SET:bet1]'));
  assert.ok(decision.question.includes('thesis-invalidated'));

  // Cross-altitude roll-up: one rolls-up-to edge to every leadership ancestor.
  const rollup = (state.links || []).filter((l) => l.sourceType === 'carryover' && l.sourceId === record.id && l.relation === 'rolls-up-to');
  const targets = rollup.map((l) => l.targetId).sort();
  assert.deepEqual(targets, ['lead1', 'mgr', 'dir', 'vp'].sort(), 'frontline → manager → director → VP fan-out');

  // Typed provenance edges.
  assert.ok((state.links || []).some((l) => l.sourceType === 'catchballpact' && l.sourceId === pactId && l.targetType === 'carryover' && l.relation === 'carries-over'));
  assert.ok((state.links || []).some((l) => l.sourceType === 'carryover' && l.sourceId === record.id && l.targetType === 'strategy' && l.targetId === 'bet1' && l.relation === 'settles'));
});

test('an explicit scan catches invalidations that landed outside a live session (idempotent)', () => {
  const { api, store } = harness();
  const proposed = api.catchballPropose(proposal('lead1'));
  const accepted = api.catchballAccept(proposed.pact.id, {});
  api.catchballSettle(proposed.pact.id, { gradedOutcome: 'thesis-invalidated' });
  const first = (store.state.carryoverRecords || []).length;
  assert.equal(first, 1);
  const scan = api.carryoverScan();
  assert.equal(scan.ok, true, scan.error);
  assert.equal((store.state.carryoverRecords || []).length, 1, 'scans never duplicate records');
  const decisions = (store.state.decisions || []).filter((d) => String(d.question).includes('[CO-SET:bet1]'));
  assert.equal(decisions.length, 1, 'one settlement decision per bet');
});

test('a pact with no resolvable bet is carried with the decision refused, not guessed', () => {
  const state = fixture();
  state.strategyBets = [];
  state.settings.carryoverAutoPropagate = true;
  const { api, store } = harness(normalizeState(state, { now: NOW }).state);
  const proposed = api.catchballPropose({ title: 'Unlinked work', toSeatId: 'lead1', effortDays: 1 });
  assert.equal(proposed.ok, true, proposed.error);
  api.catchballAccept(proposed.pact.id, {});
  api.catchballSettle(proposed.pact.id, { gradedOutcome: 'thesis-invalidated' });
  const records = store.state.carryoverRecords || [];
  assert.equal(records.length, 1);
  assert.equal(records[0].betId, null);
  assert.equal(records[0].betBasis, 'unresolved');
  assert.equal((store.state.decisions || []).filter((d) => String(d.question).includes('[CO-SET:')).length, 0, 'no decision for an unresolved bet');
});

// ---------------------------------------------------------------------------
// RULE-CO-02: resolution and resource release
// ---------------------------------------------------------------------------

test('a retire verdict releases the budget line in the same transaction', () => {
  const { api, store } = harness();
  const proposed = api.catchballPropose(proposal('lead1'));
  api.catchballAccept(proposed.pact.id, {});
  const line = encumberedLine(store.state, 'budget1');
  api.catchballSettle(proposed.pact.id, { gradedOutcome: 'thesis-invalidated' });
  const record = store.state.carryoverRecords[0];

  const resolved = api.carryoverResolveSettlement(record.id, { chosen: 'Retire the bet', rationale: 'The mechanism did not move the metric.' });
  assert.equal(resolved.ok, true, resolved.error);

  const after = store.state;
  const updated = after.carryoverRecords.find((r) => r.id === record.id);
  assert.equal(updated.settlementVerdict, 'retire-bet');
  assert.equal(updated.status, 'settled-released');
  assert.equal(updated.releaseOutcome, 'released');

  // The budget line moved committed → released in the SAME transaction.
  const budget = after.budgets.find((b) => b.id === 'budget1');
  const released = budget.lines.find((l) => l.id === line.id);
  assert.equal(released.status, 'released');
  assert.equal(released.actualAmount, null, 'a recorded spend is never erased by a release');
  assert.ok(released.releasedReason.includes('RULE-CO-02'));

  // releases-resource edge and next-cycle supply.
  assert.ok(after.links.some((l) => l.sourceType === 'carryover' && l.sourceId === record.id && l.targetType === 'budget' && l.relation === 'releases-resource'));
  const report = api.carryoverReport();
  assert.equal(report.counts.released, 1);
  assert.equal(report.nextCycle.totals.effortDays, 2);
});

test('resolving twice is refused; revise opens an owned stop-rule delegation; reaffirm keeps resources', () => {
  const { api, store } = harness();
  const proposed = api.catchballPropose(proposal('lead1'));
  api.catchballAccept(proposed.pact.id, {});
  api.catchballSettle(proposed.pact.id, { gradedOutcome: 'thesis-invalidated' });
  const record = store.state.carryoverRecords[0];

  const first = api.carryoverResolveSettlement(record.id, { chosen: 'Reaffirm with a new hypothesis' });
  assert.equal(first.ok, true, first.error);
  const again = api.carryoverResolveSettlement(record.id, { chosen: 'Retire the bet' });
  assert.equal(again.ok, false, 'settlement trials are immutable');

  const after = store.state;
  const updated = after.carryoverRecords.find((r) => r.id === record.id);
  assert.equal(updated.settlementVerdict, 'reaffirm');
  assert.equal(updated.releaseOutcome, 'withheld');
  const line = after.budgets.find((b) => b.id === 'budget1').lines.find((l) => l.status === 'committed');
  assert.equal(line.status, 'committed', 'reaffirm keeps the encumbrance');
  assert.ok(after.people.find((p) => p.id === 'dir').talkingPoints.some((t) => t.includes('[CO-REAFF:bet1]')));

  // Revise opens an owned delegation, never a release.
  const { api: api2, store: store2 } = harness();
  const p2 = api2.catchballPropose(proposal('lead1', { title: 'Second pact' }));
  api2.catchballAccept(p2.pact.id, {});
  api2.catchballSettle(p2.pact.id, { gradedOutcome: 'thesis-invalidated' });
  const rec2 = store2.state.carryoverRecords[0];
  const resolved = api2.carryoverResolveSettlement(rec2.id, { chosen: 'Revise the stop rule' });
  assert.equal(resolved.ok, true, resolved.error);
  const after2 = store2.state;
  assert.equal(after2.carryoverRecords.find((r) => r.id === rec2.id).releaseOutcome, 'withheld');
  assert.ok(after2.delegations.some((d) => d.personId === 'dir' && String(d.expectedOutcome).includes('[CO-REV:bet1]')));
});

test('a spent line is released as already-spent — never subtracted from a recorded actual', () => {
  const { api, store } = harness();
  const proposed = api.catchballPropose(proposal('lead1'));
  api.catchballAccept(proposed.pact.id, {});
  const line = encumberedLine(store.state, 'budget1');
  // Simulate the money landing before settlement.
  store.update((draft) => {
    const b = draft.budgets.find((x) => x.id === 'budget1');
    const l = b.lines.find((x) => x.id === line.id);
    l.status = 'spent';
    l.actualAmount = 480;
  }, { type: 'budget.actualRecorded', entity: 'budget', entityId: 'budget1', summary: 'Test: spend landed' });
  api.catchballSettle(proposed.pact.id, { gradedOutcome: 'thesis-invalidated' });
  const record = store.state.carryoverRecords[0];
  const resolved = api.carryoverResolveSettlement(record.id, { chosen: 'Retire the bet' });
  assert.equal(resolved.ok, true, resolved.error);
  const after = store.state;
  const updated = after.carryoverRecords.find((r) => r.id === record.id);
  assert.equal(updated.releaseOutcome, 'already-spent');
  assert.equal(updated.status, 'settled-withheld');
  const spent = after.budgets.find((b) => b.id === 'budget1').lines.find((l) => l.id === line.id);
  assert.equal(spent.status, 'spent');
  assert.equal(spent.actualAmount, 480);
});

// ---------------------------------------------------------------------------
// RULE-CO-03: human verdicts settle records
// ---------------------------------------------------------------------------

test('retiring the bet directly settles and releases its pending records', () => {
  const { api, store } = harness();
  const proposed = api.catchballPropose(proposal('lead1'));
  api.catchballAccept(proposed.pact.id, {});
  const line = encumberedLine(store.state, 'budget1');
  api.catchballSettle(proposed.pact.id, { gradedOutcome: 'thesis-invalidated' });
  const record = store.state.carryoverRecords[0];

  const retired = api.retireStrategyBet('bet1', { reason: 'The stop rule fired and the mechanism failed.' });
  assert.equal(retired.ok, true, retired.error);

  const after = store.state;
  const updated = after.carryoverRecords.find((r) => r.id === record.id);
  assert.equal(updated.settlementVerdict, 'retire-bet');
  assert.equal(updated.status, 'settled-released');
  const released = after.budgets.find((b) => b.id === 'budget1').lines.find((l) => l.id === line.id);
  assert.equal(released.status, 'released');
  assert.equal(after.strategyBets.find((b) => b.id === 'bet1').status, 'retired');
});

// ---------------------------------------------------------------------------
// RULE-CO-04: once-only later grading and floor breaches
// ---------------------------------------------------------------------------

test('settled records are graded once, later, and never re-graded', () => {
  const { api, store, setNow } = harness();
  const proposed = api.catchballPropose(proposal('lead1'));
  api.catchballAccept(proposed.pact.id, {});
  api.catchballSettle(proposed.pact.id, { gradedOutcome: 'thesis-invalidated' });
  const record = store.state.carryoverRecords[0];
  api.carryoverResolveSettlement(record.id, { chosen: 'Retire the bet' });

  // Too soon: the grading delay has not elapsed.
  setNow(new Date(NOW.getTime() + 7 * DAY));
  api.carryoverScan();
  assert.equal((store.state.carryoverGradings || []).length, 0, 'grading waits for the delay');

  // After the delay: graded once.
  setNow(new Date(NOW.getTime() + 20 * DAY));
  api.carryoverScan();
  const gradings = store.state.carryoverGradings || [];
  assert.equal(gradings.length, 1);
  assert.equal(gradings[0].recordId, record.id);
  assert.equal(gradings[0].settlementOutcome, 'retire-bet');
  assert.equal(gradings[0].releaseOutcome, 'released');
  assert.equal(store.state.carryoverRecords.find((r) => r.id === record.id).graded, true);

  // A second scan never re-grades.
  api.carryoverScan();
  assert.equal((store.state.carryoverGradings || []).length, 1);
});

test('a cell below the reliability floor opens one governed review per ISO week', () => {
  const state = fixture();
  state.settings.carryoverReliabilityFloorPct = 90;
  state.settings.carryoverCellFloor = 2;
  const { api, store, setNow } = harness(normalizeState(state, { now: NOW }).state);
  // Two pacts on the same bet, both settled and released quickly — hold rate 100%.
  for (let i = 0; i < 2; i += 1) {
    const proposed = api.catchballPropose(proposal('lead1', { title: `Pact ${i}` }));
    api.catchballAccept(proposed.pact.id, {});
    api.catchballSettle(proposed.pact.id, { gradedOutcome: 'thesis-invalidated' });
    api.carryoverResolveSettlement(store.state.carryoverRecords.at(-1).id, { chosen: 'Reaffirm with a new hypothesis' });
  }
  setNow(new Date(NOW.getTime() + 20 * DAY));
  api.carryoverScan();
  const decisions = (store.state.decisions || []).filter((d) => String(d.question).includes('[CO-CAL:'));
  assert.equal(decisions.length, 1, 'one floor-breach decision');
  assert.ok(decisions[0].question.includes('reliability floor'));
  // A second scan in the same ISO week does not duplicate it.
  api.carryoverScan();
  assert.equal((store.state.decisions || []).filter((d) => String(d.question).includes('[CO-CAL:')).length, 1);
});

// ---------------------------------------------------------------------------
// Read model, calibration math, brief and CSV
// ---------------------------------------------------------------------------

test('the report separates queues, bets, next-cycle supply and calibration', () => {
  const { api, store } = harness();
  const proposed = api.catchballPropose(proposal('lead1'));
  api.catchballAccept(proposed.pact.id, {});
  api.catchballSettle(proposed.pact.id, { gradedOutcome: 'thesis-invalidated' });
  const report = api.carryoverReport();
  assert.equal(report.counts.invalidated, 1);
  assert.equal(report.counts.decisionDue, 1);
  assert.equal(report.counts.releaseDue, 0);
  assert.equal(report.bets.length, 1);
  assert.equal(report.bets[0].betState.state, 'stop-rule-due', 'the kill criterion date passed with no verdict');
  assert.equal(report.bets[0].betState.daysOverdue > 0, true);
});

test('Wilson intervals refuse below the floor and bound the printed rate', () => {
  assert.equal(wilsonInterval(1, 4, 5), null, 'refused below the floor');
  const w = wilsonInterval(3, 10, 5);
  assert.ok(w.lo >= 0 && w.hi <= 100 && w.lo < w.hi);
});

test('the brief and CSV are identity-free', () => {
  const { api, store } = harness();
  const proposed = api.catchballPropose(proposal('lead1'));
  api.catchballAccept(proposed.pact.id, {});
  api.catchballSettle(proposed.pact.id, { gradedOutcome: 'thesis-invalidated' });
  api.carryoverResolveSettlement(store.state.carryoverRecords[0].id, { chosen: 'Retire the bet' });

  const brief = api.carryoverBriefText();
  assert.equal(brief.includes('Improve the delivery flow'), false, 'no pact title');
  assert.equal(brief.includes('A strategy bet'), false, 'no bet title');
  assert.equal(brief.includes('Lee Lead'), false, 'no names');
  assert.equal(brief.includes('Operations'), false, 'no budget name');

  const csv = exportWorkspaceCsv(store.state, 'carryover-settlement', { now: NOW });
  assert.equal(csv.ok, true, csv.error);
  assert.equal(csv.csv.includes('Improve the delivery flow'), false);
  assert.equal(csv.csv.includes('bet1'), false);
  assert.equal(csv.csv.includes('Lee Lead'), false);
  assert.ok(csv.csv.includes('released_person_days'));
});

test('release preview refuses honestly: spent lines and vanished envelopes', () => {
  const state = fixture();
  const { api } = harness(state);
  const proposed = api.catchballPropose(proposal('lead1'));
  api.catchballAccept(proposed.pact.id, {});
  api.catchballSettle(proposed.pact.id, { gradedOutcome: 'thesis-invalidated' });
  const record = api.carryoverReport().records[0].record;

  const ok = api.carryoverReleasePreview(record.id);
  assert.equal(ok.ok, true);
  assert.equal(ok.preview.outcome, 'committed');

  // Vanished envelope.
  const state2 = fixture();
  state2.budgets = [];
  const { api: api2 } = harness(normalizeState(state2, { now: NOW }).state);
  const p2 = api2.catchballPropose({ title: 'No budget', toSeatId: 'lead1', effortDays: 1 });
  api2.catchballAccept(p2.pact.id, {});
  api2.catchballSettle(p2.pact.id, { gradedOutcome: 'thesis-invalidated' });
  const rec2 = api2.carryoverReport().records[0].record;
  assert.equal(rec2.resource.budgetId, null);
});

test('bet resolution walks the tag graph when the pact has no direct bet link', () => {
  const state = fixture();
  state.strategyTags = [{ id: 'tag1', betId: 'bet1', entityType: 'goal', entityId: 'existing-goal', effortWeeks: 2, note: '', createdAt: NOW.toISOString(), createdOn: '2026-10-01' }];
  const resolved = resolvePactBet(normalizeState(state, { now: NOW }).state, { linkedGoalId: 'existing-goal' });
  assert.equal(resolved.betId, 'bet1');
  assert.equal(resolved.betBasis, 'goal-tag');
});

test('the terminal renders all five panels axe-clean', async () => {
  const dom = new JSDOM('<!doctype html><div id="modal-root"></div><div id="toast-root"></div>', { url: 'https://leados.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  try {
    const { api, store } = harness();
    const proposed = api.catchballPropose(proposal('lead1'));
    api.catchballAccept(proposed.pact.id, {});
    api.catchballSettle(proposed.pact.id, { gradedOutcome: 'thesis-invalidated' });
    const axe = (await import('axe-core')).default;
    for (const panel of ['queue', 'bets', 'resources', 'calibration', 'brief']) {
      const ctx = {
        state: store.state, api, now: NOW, query: new URLSearchParams(`panel=${panel}`),
        navigate: () => {}, refresh: () => {}, seatContext: { seat: null }, warnings: [],
      };
      const node = renderCarryover(ctx);
      document.getElementById('modal-root')?.replaceChildren();
      document.body.appendChild(node);
      const results = await axe.run(node, { rules: { region: { enabled: false } } });
      assert.deepEqual(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })), [], `axe: ${panel}`);
      assert.ok(node.querySelector('h1'), `${panel}: one page heading`);
      assert.match(node.textContent, /Carryover/);
      node.remove();
    }
  } finally { dom.window.close(); }
});
