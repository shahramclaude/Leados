/**
 * ADR-0098, Schema v100 — the Hierarchical Clearinghouse (`#/clearing`).
 *
 * These tests keep the mechanism honest at the architecture boundaries: the
 * exact solver is deterministic, minimum-viable floors do not force funding,
 * sealed projections do not reveal sibling bids, one commit produces one
 * atomic propagation set, settlement is once-only, and the generic CSV cannot
 * carry raw round or bid detail.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { buildClearingReport, clearingCsvRows, solveClearingRound } from '../../app/core/domain/clearing.js';
import { CLEARING_LIMITS } from '../../app/core/domain/clearingRegistry.js';
import { ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { API_RIGHTS } from '../../app/core/domain/accessGateway.js';
import { MODULE_MANIFESTS } from '../../app/core/domain/disclosureManifests.js';
import { LINK_ENTITY_COLLECTIONS, LINK_ENTITY_TYPES } from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { normalizeClearingRounds, normalizeClearingSettings } from '../../app/core/domain/clearingSchema.js';

const NOW = new Date('2026-11-05T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();

function stateWithSeats(activeSeatId = 'mgr1') {
  const state = createEmptyState(NOW_ISO);
  state.settings = { ...state.settings, chainLeaderAltitude: 'chief', activeSeatId };
  state.people = [
    { id: 'dir1', name: 'Dana Director', role: 'Director', level: 'director', team: 'Ops', status: 'active' },
    { id: 'mgr1', name: 'Mira Manager', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', team: 'Billing', managerId: 'mgr1', status: 'active' },
    { id: 'lead2', name: 'Pat Lead', role: 'Lead', level: 'lead', team: 'Claims', managerId: 'mgr1', status: 'active' },
    { id: 'ic1', name: 'Ira Analyst', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Ida Analyst', role: 'Analyst', level: 'ic', team: 'Claims', managerId: 'lead2', status: 'active' },
  ];
  // Keep propagation quiet while constructing fixtures; the lifecycle test turns
  // only the relevant clearing rule back on through the normal default.
  return state;
}

function harness(state = stateWithSeats()) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-clearing-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api, setSeat: (id) => { store.state.settings.activeSeatId = id; } };
}

function bidFor(bidderSeatId, valueHi, label = `package-${bidderSeatId}`) {
  return {
    bidderSeatId,
    submittedOn: '2026-11-05',
    submittedAt: NOW_ISO,
    linkedEntityType: null,
    linkedEntityId: null,
    note: `${bidderSeatId} private note`,
    tiers: [{ key: `tier-${bidderSeatId}`, label, cost: 40, capacityDays: 4, valueLo: valueHi - 2, valueHi }],
  };
}

function roundWithBids({ bids, respectFloors = true } = {}) {
  return {
    id: 'clr-test',
    title: 'Raw title must never enter an aggregate CSV',
    outcomeLabel: 'closed blockers',
    currency: 'EUR',
    openedOn: '2026-11-05',
    horizonOn: '2026-11-12',
    scopeSeatId: 'mgr1',
    altitudeKey: 'manager',
    rank: 2,
    budgetCap: 40,
    capacityCap: 4,
    reserveBudget: 0,
    reserveCapacity: 0,
    gamma: 0,
    respectFloors,
    expectedHurdleHoldPct: null,
    bids: bids || [bidFor('lead1', 10), bidFor('lead2', 8)],
    status: 'open',
  };
}

test('Schema v100 adds an empty clearing ledger and clamps its conventions', () => {
  assert.equal(SCHEMA_VERSION, 111);
  const migrated = migrate({ schemaVersion: 99, settings: { leaderName: 'Keep this' } });
  assert.deepEqual(migrated.applied, ['99 → 100', '100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111']);
  assert.deepEqual(migrated.raw.clearingRounds, []);
  assert.deepEqual(migrated.raw.clearingMarkers, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep this');
  assert.equal(migrated.raw.settings.clearingCellFloor, 3);
  assert.equal(normalizeClearingSettings({ clearingCellFloor: 999, clearingReviewDays: 0 }).clearingCellFloor, CLEARING_LIMITS.cellFloorMax);
  assert.equal(normalizeClearingSettings({ clearingMixImbalanceLowPct: 65, clearingMixImbalanceHighPct: 70 }).clearingMixImbalanceLowPct, 60);

  const warnings = [];
  const hostile = normalizeClearingRounds([{ id: 'bad', status: 'cleared', title: '', bids: [] }], warnings);
  assert.deepEqual(hostile, []);
  assert.ok(warnings.some((warning) => /malformed clearing round/.test(warning)));
});

test('the exact economy keeps the unfunded choice beside a minimum-viable floor', () => {
  const round = roundWithBids({ bids: [
    { ...bidFor('lead1', 10), tiers: [
      { key: 'too-cheap', label: 'Sub-floor', cost: 5, capacityDays: 1, valueLo: 1, valueHi: 9, isMinimumViable: false },
      { key: 'floor', label: 'Minimum viable', cost: 40, capacityDays: 4, valueLo: 2, valueHi: 6, isMinimumViable: true },
    ] },
    bidFor('lead2', 8),
  ] });
  const solved = solveClearingRound(round);
  assert.equal(solved.ok, true, solved.reason);
  assert.equal(solved.allocations.length, 2);
  assert.ok(solved.allocations.some((allocation) => allocation.bidderSeatId === 'lead1' && allocation.chosenTierIndex === 0), 'a floor does not force the span to be funded');
  assert.equal(solved.certificate.certified, true);
});

test('rights, registries, and the propagation contract are wired once', () => {
  assert.equal(API_RIGHTS.clearingOpenRound, 'chair-clearing-round');
  assert.equal(API_RIGHTS.clearingSubmitBid, 'submit-clearing-bid');
  assert.ok(ACTION_RIGHTS['chair-clearing-round']);
  assert.equal(RECORD_POLICIES.clearingRounds.detailCeiling, 0);
  assert.equal(RECORD_POLICIES.clearingMarkers.detailCeiling, 0);
  assert.ok(MODULE_MANIFESTS.clearing.adapterScoped);
  assert.equal(MODULE_MANIFESTS.clearing.detailCeiling, 0);
  assert.equal(LINK_ENTITY_COLLECTIONS.clearinground, 'clearingRounds');
  assert.ok(LINK_ENTITY_TYPES.includes('clearinground'));
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.name === 'clearingRule'));
  const contract = PROPAGATION_CONTRACTS.find((entry) => entry.module === 'clearingRules.js');
  assert.ok(contract);
  assert.deepEqual(contract.writes.sort(), ['budgets', 'clearingMarkers', 'decisions', 'delegations', 'links']);
});

test('chair, sealed bids, atomic propagation, one-time settlement, and scoped read', () => {
  const { store, api, setSeat } = harness();
  const opened = api.clearingOpenRound({
    title: 'Manager envelope', outcomeLabel: 'closed blockers', currency: 'EUR',
    budgetCap: 40, capacityCap: 4, horizonDays: 7, gamma: 0,
  });
  assert.equal(opened.ok, true, opened.error);
  const roundId = opened.id;

  setSeat('lead1');
  const first = api.clearingSubmitBid(roundId, {
    tiers: [{ key: 'lead-one', label: 'Lead one package', cost: 40, capacityDays: 4, valueLo: 8, valueHi: 10 }],
    note: 'private lead one note',
  });
  assert.equal(first.ok, true, first.error);

  setSeat('lead2');
  const second = api.clearingSubmitBid(roundId, {
    tiers: [{ key: 'lead-two', label: 'Lead two package', cost: 40, capacityDays: 4, valueLo: 6, valueHi: 8 }],
    note: 'private lead two note',
  });
  assert.equal(second.ok, true, second.error);

  const leadView = api.clearingRead(roundId);
  assert.equal(leadView.rounds[0].accessRole, 'invited-bidder');
  assert.equal(leadView.rounds[0].bids.length, 1);
  assert.equal(leadView.rounds[0].bids[0].bidderSeatId, 'lead2');
  assert.ok(!JSON.stringify(leadView.rounds[0]).includes('lead1'), 'the invited seat cannot see sibling bid identifiers');

  setSeat('mgr1');
  const committed = api.clearingCommit(roundId);
  assert.equal(committed.ok, true, committed.error);
  assert.equal(store.state.clearingRounds[0].status, 'cleared');
  assert.equal(store.state.clearingMarkers.filter((marker) => marker.kind === 'clear').length, 1);
  assert.equal(store.state.decisions.filter((decision) => String(decision.rationale).includes('RULE-CLR-01')).length, 1);
  assert.equal(store.state.delegations.filter((task) => String(task.support).includes('RULE-CLR-01')).length, 1);
  assert.ok(store.state.links.some((link) => link.sourceType === 'clearinground' && link.relation === 'rolls-up-to'));
  assert.equal(store.state.clearingMarkers.filter((marker) => marker.kind === 'clear').length, 1, 'post-commit clear is idempotent');

  const settled = api.clearingSettle(roundId, { outcomes: [{ bidderSeatId: 'lead1', realizedValue: 0 }] });
  assert.equal(settled.ok, true, settled.error);
  assert.equal(store.state.clearingRounds[0].status, 'settled');
  assert.equal(store.state.clearingMarkers.filter((marker) => marker.kind === 'hurdle').length, 1, 'a pivotal miss opens one mechanism review');
  const again = api.clearingSettle(roundId, { outcomes: [{ bidderSeatId: 'lead1', realizedValue: 10 }] });
  assert.equal(again.ok, false);
  assert.match(again.error, /settled once/);
});

test('aggregate CSV is differencing-safe and excludes raw clearing detail', () => {
  const state = normalizeState(stateWithSeats('mgr1'), { now: NOW }).state;
  state.clearingRounds = [roundWithBids({})];
  const report = buildClearingReport(state, { now: NOW });
  const rows = clearingCsvRows(report);
  const csv = JSON.stringify(rows);
  assert.ok(rows.length >= 6, 'one row per altitude plus workspace aggregate');
  assert.ok(rows.some((row) => row.row_kind === 'workspace'));
  assert.ok(rows.some((row) => row.rounds_n === ''), 'sub-floor cells are blank, not zero');
  for (const secret of ['clr-test', 'Raw title', 'lead-one', 'private lead one note', 'tier-lead1']) {
    assert.ok(!csv.includes(secret), `aggregate CSV excludes ${secret}`);
  }

  const descriptor = CSV_EXPORTS.find((item) => item.key === 'internal-clearinghouse');
  assert.ok(descriptor);
  const exported = exportWorkspaceCsv(state, 'internal-clearinghouse', { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  assert.ok(!exported.csv.includes('Raw title'));
  assert.ok(!exported.csv.includes('clr-test'));
});
