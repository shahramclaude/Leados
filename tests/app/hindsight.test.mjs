/**
 * ADR-0102, Schema v104 — the Hindsight Lock (`#/hindsight`).
 *
 * Cross-module and cross-altitude by construction: these tests prove that
 *   - a decision's information set is frozen ONCE, from the link history that
 *     already existed on or before the decision date, and never rewritten,
 *   - the three-way partition is exact: known / knowable-but-unconsulted /
 *     arrived-later, with undated facts excluded and printed,
 *   - coverage is REFUSED below the declared fact floor and no quadrant is
 *     invented for an unmeasurable information axis,
 *   - RULE-HND-01..04 write through the shared spine: the lock is a graph node
 *     with `locks` / `consults` / `rolls-up-to` edges in the SAME transaction,
 *     exactly one process review is ever opened for a successful mistake, and a
 *     decision that left knowable facts unconsulted opens exactly one finding,
 *   - the resulting share and Fisher's exact test are refused below the declared
 *     floor, and the CSV carries no decision, lock, person or fact identifier,
 *   - and role boundaries hold: the conventions are director+ AND full access.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.localStorage = dom.window.localStorage;

import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { manifestFor } from '../../app/core/domain/disclosureManifests.js';
import { LINK_ENTITY_COLLECTIONS, LINK_ENTITY_TYPES, LINK_RELATIONS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  auditLock,
  buildHindsightReport,
  buildLockRecord,
  fisherExactTwoSided,
  hindsightCsvRows,
  linkedFacts,
  recordDateOf,
  wilsonInterval,
} from '../../app/core/domain/hindsight.js';
import { hindsightRule } from '../../app/core/domain/hindsightRules.js';
import { normalizeDecisionLocks, normalizeHindsightMarkers, normalizeHindsightSettings } from '../../app/core/domain/hindsightSchema.js';
import { HINDSIGHT_RULE_IDS } from '../../app/core/domain/hindsightRegistry.js';
import { renderHindsight } from '../../app/views/hindsight.js';

const NOW = new Date('2026-11-05T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();
const decisionOn = '2026-10-20';

function tree() {
  const state = createEmptyState(NOW_ISO);
  state.settings = {
    ...state.settings,
    chainLeaderAltitude: 'chief',
    hindsightQualityFloor: 4,
    hindsightCoveragePct: 60,
    hindsightFactFloor: 3,
    hindsightGapFloor: 2,
    hindsightSettledFloor: 4,
    hindsightCellFloor: 2,
    hindsightReviewGraceDays: 14,
    hindsightAutoPropagate: true,
  };
  for (const key of Object.keys(state.settings)) {
    if (key.endsWith('AutoPropagate') && key !== 'hindsightAutoPropagate') state.settings[key] = false;
  }
  state.people = [
    { id: 'vp1', name: 'Vera Executive', role: 'VP', level: 'vp', team: 'Ops', status: 'active' },
    { id: 'dir1', name: 'Dana Director', role: 'Director', level: 'director', team: 'Ops', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mira Manager', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', team: 'Billing', managerId: 'mgr1', status: 'active' },
  ];
  return normalizeState(state, { now: NOW }).state;
}

const soundDecision = (over = {}) => ({
  id: 'd1',
  title: 'Consolidate the billing queues',
  question: 'Should the two billing queues be run as one?',
  date: decisionOn,
  reversibility: 'reversible',
  approver: 'Mira Manager',
  driver: 'Mira Manager',
  options: [
    { id: 'o1', label: 'Consolidate', pros: 'One queue, one priority order.', cons: 'Loses specialisation.' },
    { id: 'o2', label: 'Keep two queues', pros: 'Keeps specialisation.', cons: 'Double triage.' },
  ],
  chosen: 'Consolidate',
  rationale: 'Two queues means two triage decisions a day and no single priority order, which is what the backlog actually tracks.',
  reviewOn: '2026-11-01',
  reviewedOn: '2026-11-02',
  outcome: 'good',
  outcomeNotes: 'Backlog fell for two weeks.',
  createdAt: '2026-10-20T09:00:00.000Z',
  ...over,
});

const thinDecision = (over = {}) => soundDecision({
  id: 'd2',
  title: 'Move the invoice run to Friday',
  options: [{ id: 'o9', label: 'Move it', pros: '', cons: '' }],
  approver: '',
  rationale: 'It seemed better.',
  ...over,
});

function withFacts(state, { decision, facts }) {
  state.decisions = [decision];
  state.cases = facts.map((fact) => ({
    id: fact.id,
    title: `Case ${fact.id}`,
    kind: 'issue',
    status: 'open',
    openedOn: fact.on,
    createdAt: `${fact.on}T08:00:00.000Z`,
  }));
  state.links = facts
    .filter((fact) => fact.linkOn)
    .map((fact, index) => ({
      id: `lnk-${index}`,
      sourceType: 'decision',
      sourceId: decision.id,
      targetType: 'case',
      targetId: fact.id,
      relation: 'informs',
      ruleId: 'TEST',
      summary: '',
      createdOn: fact.linkOn,
      createdAt: `${fact.linkOn}T08:00:00.000Z`,
    }));
  return normalizeState(state, { now: NOW }).state;
}

function harness(state) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let current = NOW;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-hnd-${++seq}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { store, api, setNow: (value) => { current = value; } };
}

/** known 2 · missed 2 · later 1 — a thin process with a good outcome. */
function thinScenario() {
  return withFacts(tree(), {
    decision: thinDecision(),
    facts: [
      { id: 'k1', on: '2026-09-01', linkOn: '2026-10-15' },
      { id: 'k2', on: '2026-09-10', linkOn: '2026-10-18' },
      { id: 'm1', on: '2026-09-20', linkOn: '2026-11-01' },
      { id: 'm2', on: '2026-09-25', linkOn: '2026-11-01' },
      { id: 'l1', on: '2026-11-03', linkOn: '2026-11-04' },
    ],
  });
}

/* ------------------------------------------------------------------ schema */

test('Schema v104 migrates additively: empty lock ledgers, declared conventions, nothing back-filled', () => {
  assert.equal(SCHEMA_VERSION, 149);
  const migrated = migrate({ schemaVersion: 103, settings: { leaderName: 'Keep this' } });
  assert.deepEqual(migrated.applied, ['103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113', '113 → 114', '114 → 115', '115 → 116', '116 → 117', '117 → 118', '118 → 119', '119 → 120', '120 → 121', '121 → 122', '122 → 123', '123 → 124', '124 → 125', '125 → 126', '126 → 127', '127 → 128', '128 → 129', '129 → 130', '130 → 131', '131 → 132', '132 → 133', '133 → 134', '134 → 135', '135 → 136', '136 → 137', '137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149']);
  assert.deepEqual(migrated.raw.decisionLocks, []);
  assert.deepEqual(migrated.raw.decisionLockMarkers, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep this');
  assert.equal(migrated.raw.settings.hindsightQualityFloor, 4);
  assert.equal(migrated.raw.settings.hindsightReviewGraceDays, 14);
});

test('the lock normalizer is fail-closed: a future-dated lock, a duplicate and an unreadable row are dropped', () => {
  const warnings = [];
  const rows = normalizeDecisionLocks([
    { id: 'l1', decisionId: 'd1', decisionOn: '2026-10-20', frozenOn: '2026-10-20', consulted: [{ type: 'case', id: 'c1', on: '2026-09-01' }], qualityMet: 5 },
    { id: 'l1', decisionId: 'd1', decisionOn: '2026-10-20', frozenOn: '2026-10-20' },
    { id: 'l2', decisionId: 'd2', decisionOn: '2026-12-01', frozenOn: '2026-12-01' },
    { decisionId: 'd3' },
  ], warnings, { now: NOW });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].consultedN, 1);
  assert.ok(warnings.some((line) => line.includes('future')));
  assert.ok(warnings.some((line) => line.includes('duplicate')));
  assert.ok(warnings.some((line) => line.includes('unreadable')));
  assert.deepEqual(normalizeHindsightMarkers([{ id: 'm1', kind: 'resulted', decisionId: 'dec-1' }]).length, 1);
  const clamped = normalizeHindsightSettings({ hindsightCoveragePct: 400, hindsightFactFloor: -3, hindsightAutoPropagate: false });
  assert.equal(clamped.hindsightCoveragePct, 95);
  assert.equal(clamped.hindsightFactFloor, 2);
  assert.equal(clamped.hindsightAutoPropagate, false);
});

/* --------------------------------------------------------------- statistics */

test('the statistics are the named ones: Wilson 1927 and an exact two-sided Fisher p', () => {
  const wilson = wilsonInterval(5, 10);
  assert.equal(wilson.pct, 50);
  assert.ok(wilson.lowPct > 23 && wilson.lowPct < 24.5, `Wilson low ${wilson.lowPct}`);
  assert.ok(wilson.highPct > 75.5 && wilson.highPct < 77, `Wilson high ${wilson.highPct}`);
  assert.equal(wilsonInterval(0, 0), null);

  // Fisher's exact test on [[3,1],[1,3]]: p = 0.485714…, the textbook value.
  const p = fisherExactTwoSided(3, 1, 1, 3);
  assert.ok(p.supported);
  assert.ok(Math.abs(p.p - 0.4857142857) < 1e-6, `p=${p.p}`);
  assert.equal(p.expected, 2);
  const degenerate = fisherExactTwoSided(0, 0, 2, 3);
  assert.equal(degenerate.supported, false);
  assert.match(degenerate.reason, /margin/);
});

/* ------------------------------------------------------------------- lock */

test('a lock freezes only what the link history had tied to the decision by that day, and never rewrites', () => {
  const state = thinScenario();
  const { api, store } = harness(state);
  assert.equal(api.hindsightScan().ok, true);
  assert.equal(store.state.decisionLocks.length, 1);
  const lock = store.state.decisionLocks[0];
  assert.equal(lock.decisionId, 'd2');
  assert.equal(lock.decisionOn, decisionOn);
  assert.equal(lock.consultedN, 2, 'only the two links written before the decision are frozen');
  assert.equal(lock.qualityMet, 2, 'approver and two options were missing when the call was made');
  assert.ok(lock.qualityMissing.includes('Approver named'));

  // The decision is edited afterwards — the lock is untouched.
  const edit = api.updateDecision('d2', { rationale: 'Rewritten after the fact with two options and an approver.' });
  assert.equal(edit.ok, true, edit.error);
  const again = store.state.decisionLocks;
  assert.equal(again.length, 1);
  assert.equal(again[0].qualityMet, 2);
  assert.equal(again[0].consultedN, 2);
});

test('the partition is exact: known, knowable-but-unconsulted, arrived later, and undated excluded', () => {
  const state = thinScenario();
  const { api, store } = harness(state);
  api.hindsightScan();
  const audit = auditLock(store.state, store.state.decisionLocks[0], { now: NOW, settings: store.state.settings });
  assert.equal(audit.coverage.knownN, 2);
  assert.equal(audit.coverage.missedN, 2);
  assert.equal(audit.coverage.laterN, 1);
  assert.equal(audit.coverage.undatedN, 0);
  assert.equal(audit.coverage.knowableN, 4);
  assert.equal(audit.coverage.refused, false);
  assert.equal(audit.coverage.pct, 50);
  assert.ok(audit.coverage.lowPct < 50 && audit.coverage.highPct > 50);
  assert.ok(audit.missed.every((fact) => fact.on <= decisionOn), 'a missed fact is dated on or before the decision');
  assert.ok(audit.later.every((fact) => fact.on > decisionOn), 'a later fact is dated after the decision');
  assert.equal(audit.lagged ?? null, null);
  assert.ok(audit.lagDays > 30, 'the newest consulted fact is weeks older than the call');
});

test('coverage is REFUSED below the declared fact floor, and the quadrant stays unmeasured', () => {
  const state = withFacts(tree(), {
    decision: thinDecision(),
    facts: [
      { id: 'k1', on: '2026-09-01', linkOn: '2026-10-15' },
      { id: 'm1', on: '2026-09-20', linkOn: '2026-11-01' },
      { id: 'l1', on: '2026-11-03', linkOn: '2026-11-04' },
    ],
  });
  const { api, store } = harness(state);
  api.hindsightScan();
  const audit = auditLock(store.state, store.state.decisionLocks[0], { now: NOW, settings: store.state.settings });
  assert.equal(audit.coverage.refused, true);
  assert.equal(audit.coverage.pct, null);
  assert.match(audit.coverage.reason, /floor of 3/);
  assert.equal(audit.informed, null);
  assert.equal(audit.quadrant, 'unmeasured');
  assert.match(audit.quadrantReason, /floor of 3/);
});

test('a fact that arrives after the decision is never charged to it', () => {
  const state = withFacts(tree(), {
    decision: soundDecision(),
    facts: [
      { id: 'k1', on: '2026-09-01', linkOn: '2026-10-15' },
      { id: 'k2', on: '2026-09-10', linkOn: '2026-10-16' },
      { id: 'k3', on: '2026-09-11', linkOn: '2026-10-17' },
      { id: 'l1', on: '2026-11-03', linkOn: '2026-11-04' },
      { id: 'l2', on: '2026-11-04', linkOn: '2026-11-04' },
    ],
  });
  const { api, store } = harness(state);
  api.hindsightScan();
  const audit = auditLock(store.state, store.state.decisionLocks[0], { now: NOW, settings: store.state.settings });
  assert.equal(audit.coverage.knownN, 3);
  assert.equal(audit.coverage.missedN, 0);
  assert.equal(audit.coverage.laterN, 2);
  assert.equal(audit.coverage.pct, 100);
  assert.equal(audit.quadrant, 'earned');
});

test('the record date resolver reads the record itself and refuses to guess', () => {
  const state = tree();
  state.cases = normalizeState({ ...state, cases: [{ id: 'c1', title: 'Case', status: 'open', openedOn: '2026-08-09' }] }, { now: NOW }).state.cases;
  assert.equal(recordDateOf(state, 'case', 'c1'), '2026-08-09');
  assert.equal(recordDateOf(state, 'case', 'nope'), null);
  assert.equal(recordDateOf(state, 'unknowntype', 'c1'), null);
});

/* -------------------------------------------------------------- quadrants */

test('all four quadrants are reachable from the frozen claim and the live outcome', () => {
  const cases = [
    { label: 'earned', decision: soundDecision({ id: 'd-e', outcome: 'good' }), facts: [{ id: 'k1', on: '2026-09-01', linkOn: '2026-10-15' }, { id: 'k2', on: '2026-09-02', linkOn: '2026-10-15' }, { id: 'k3', on: '2026-09-03', linkOn: '2026-10-15' }] },
    { label: 'resulted', decision: thinDecision({ id: 'd-r', outcome: 'good' }), facts: [{ id: 'k1', on: '2026-09-01', linkOn: '2026-10-15' }, { id: 'm1', on: '2026-09-02', linkOn: '2026-11-01' }, { id: 'm2', on: '2026-09-03', linkOn: '2026-11-01' }] },
    { label: 'variance', decision: soundDecision({ id: 'd-v', outcome: 'bad' }), facts: [{ id: 'k1', on: '2026-09-01', linkOn: '2026-10-15' }, { id: 'k2', on: '2026-09-02', linkOn: '2026-10-15' }, { id: 'k3', on: '2026-09-03', linkOn: '2026-10-15' }] },
    { label: 'fixable', decision: thinDecision({ id: 'd-f', outcome: 'bad' }), facts: [{ id: 'k1', on: '2026-09-01', linkOn: '2026-10-15' }, { id: 'm1', on: '2026-09-02', linkOn: '2026-11-01' }, { id: 'm2', on: '2026-09-03', linkOn: '2026-11-01' }] },
  ];
  for (const scenario of cases) {
    const state = withFacts(tree(), { decision: scenario.decision, facts: scenario.facts });
    const { api, store } = harness(state);
    api.hindsightScan();
    const audit = auditLock(store.state, store.state.decisionLocks[0], { now: NOW, settings: store.state.settings });
    assert.equal(audit.quadrant, scenario.label, `${scenario.label}: ${audit.quadrantReason}`);
  }
});

/* --------------------------------------------------------------- the spine */

test('RULE-HND-01 registers the lock as a graph node with locks / consults / rolls-up-to in the same transaction', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(hindsightRule));
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 90);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  assert.ok(LINK_ENTITY_TYPES.includes('hindsightlock'));
  assert.ok(LINK_RELATIONS.includes('locks') && LINK_RELATIONS.includes('consults'));

  const state = thinScenario();
  const { api, store } = harness(state);
  assert.equal(api.setActiveSeat('mgr1').ok, true);
  api.hindsightScan();
  const lock = store.state.decisionLocks[0];
  assert.equal(lock.ownerSeatId, 'mgr1');
  assert.equal(lock.altitudeKey, 'manager');
  const locks = store.state.links.filter((link) => link.sourceType === 'hindsightlock' && link.relation === 'locks');
  assert.equal(locks.length, 1);
  assert.equal(locks[0].targetId, 'd2');
  const consults = store.state.links.filter((link) => link.sourceType === 'hindsightlock' && link.relation === 'consults');
  assert.equal(consults.length, 2, 'one consults edge per frozen fact');
  const rollups = store.state.links.filter((link) => link.sourceType === 'hindsightlock' && link.relation === 'rolls-up-to');
  const ancestors = rollups.map((link) => link.targetId).sort();
  assert.deepEqual(ancestors, ['dir1', 'vp1'], 'the lock rolls up every leadership ancestor of the owning span');
});

test('RULE-HND-02 opens exactly ONE process review for a successful mistake, and never twice', () => {
  const state = thinScenario();
  const { api, store } = harness(state);
  assert.equal(api.setActiveSeat('mgr1').ok, true);
  api.hindsightScan();
  const opened = store.state.decisions.filter((row) => /Successful mistake/.test(row.title));
  assert.equal(opened.length, 1, 'one governed process review for the resulting decision');
  const marker = store.state.decisionLockMarkers.find((row) => row.kind === 'resulted');
  assert.ok(marker);
  assert.equal(marker.decisionId, opened[0].id);
  const links = store.state.links.filter((link) => link.sourceType === 'decision' && link.sourceId === opened[0].id);
  assert.ok(links.some((link) => link.relation === 'tracks-followup' && link.targetId === 'd2'));
  assert.ok(links.some((link) => link.relation === 'informs' && link.targetId === 'mgr1'));

  // A second scan must not open a second review, and the finding must never be
  // locked as if it were a decision the module audits.
  api.hindsightScan();
  assert.equal(store.state.decisions.filter((row) => /Successful mistake/.test(row.title)).length, 1);
  assert.ok(store.state.decisionLocks.every((lock) => lock.decisionId !== opened[0].id));
});

test('RULE-HND-03 opens one process decision when knowable facts were left unconsulted', () => {
  const state = thinScenario();
  const { api, store } = harness(state);
  api.hindsightScan();
  const gaps = store.state.decisions.filter((row) => /knowable facts unconsulted/.test(row.title));
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].question, /Consulted 2 of 4 knowable fact/);
  api.hindsightScan();
  assert.equal(store.state.decisions.filter((row) => /knowable facts unconsulted/.test(row.title)).length, 1);
});

test('RULE-HND-04 asks once a week about a decision that passed its own review date ungraded', () => {
  const late = decisionOn;
  const state = withFacts(tree(), {
    decision: soundDecision({ id: 'd3', reviewedOn: null, outcome: 'pending', reviewOn: '2026-10-01', chosen: 'Consolidate' }),
    facts: [
      { id: 'k1', on: '2026-09-01', linkOn: '2026-10-15' },
      { id: 'k2', on: '2026-09-02', linkOn: '2026-10-15' },
      { id: 'k3', on: '2026-09-03', linkOn: '2026-10-15' },
    ],
  });
  const { api, store } = harness(state);
  api.hindsightScan();
  const audit = auditLock(store.state, store.state.decisionLocks[0], { now: NOW, settings: store.state.settings });
  assert.equal(audit.status, 'pending');
  assert.equal(audit.overdue, true, `review grace from ${late} should have expired`);
  const prompts = store.state.decisions.filter((row) => /past its review grace/.test(row.title));
  assert.equal(prompts.length, 1);
  api.hindsightScan();
  assert.equal(store.state.decisions.filter((row) => /past its review grace/.test(row.title)).length, 1, 'one prompt per lock per ISO week');
});

/* ---------------------------------------------------------------- roll-up */

test('the report scopes to the active seat, refuses below the floors, and suppresses small cells', () => {
  const state = thinScenario();
  const { api, store } = harness(state);
  // The lock is owned by the seat that held the workspace when it was frozen.
  assert.equal(api.setActiveSeat('mgr1').ok, true);
  api.hindsightScan();
  assert.equal(api.setActiveSeat(null).ok, true);
  const operator = buildHindsightReport(store.state, { now: NOW, settings: store.state.settings });
  assert.equal(operator.summary.locksN, 1);
  // One good outcome is below the declared share floor: REFUSED, never a number.
  assert.equal(operator.quadrants.resultingShare.refused, true);
  assert.equal(operator.quadrants.resultingShare.pct, null);
  assert.equal(operator.quadrants.test.refused, true);
  assert.equal(operator.quadrants.test.p, null);
  assert.match(operator.quadrants.test.reason, /settled floor/);
  // The one altitude cell is below the cell floor and is suppressed, never zero.
  assert.equal(operator.altitudeRows[0].suppressed, true);

  assert.equal(api.setActiveSeat('mgr1').ok, true);
  const managerView = buildHindsightReport(store.state, { now: NOW, settings: store.state.settings });
  assert.equal(managerView.seat.rank, 2);
  assert.equal(managerView.summary.locksN, 1);
  assert.ok(managerView.seatRows.some((row) => row.seatId === 'mgr1'));

  assert.equal(api.setActiveSeat('vp1').ok, true);
  const execView = buildHindsightReport(store.state, { now: NOW, settings: store.state.settings });
  assert.equal(execView.seat.rank, 4);
  assert.equal(execView.seatRows.length, 0, 'above director rank the per-span rows are withheld');
  assert.ok(execView.altitudeRows.length >= 1, 'counts by altitude remain');
});

test('the lock is a navigable graph node that carries no fact content and no person', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('hindsightlock'), 'the node type is registered');
  assert.equal(LINK_ENTITY_COLLECTIONS.hindsightlock, 'decisionLocks');
  for (const relation of ['locks', 'consults']) assert.ok(LINK_RELATIONS.includes(relation), relation);

  const state = thinScenario();
  const { api, store } = harness(state);
  assert.equal(api.setActiveSeat('mgr1').ok, true);
  api.hindsightScan();
  const lock = store.state.decisionLocks[0];
  assert.ok(lock, 'the scan froze a lock');

  const resolved = resolveLinkedEntity(store.state, 'hindsightlock', lock.id);
  assert.ok(resolved, 'the node resolves');
  assert.equal(resolved.type, 'hindsightlock');
  assert.match(resolved.route, /^#\/hindsight\?panel=information&lock=/);
  // Identity-free and content-free: the resolver exposes the dates and counts only.
  for (const banned of ['FACT-SECRET', 'Mira Manager', 'mgr1']) {
    assert.ok(!JSON.stringify(resolved).includes(banned), `the graph node must not carry ${banned}`);
  }
  assert.equal(resolved.raw.decisionId, lock.decisionId);
});

/* --------------------------------------------------------- permissions */

test('the conventions are director+ AND full access; the gateway denies an unknown command', () => {
  const { api } = harness(thinScenario());
  assert.equal(api.setActiveSeat('mgr1').ok, true);
  const refused = api.hindsightSetConventions({ hindsightCoveragePct: 70 });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /rank|director|declare/i);

  const unknown = api.hindsightDropTheLock;
  assert.equal(unknown, undefined, 'only declared commands are mounted');
});

/* ------------------------------------------------------- CSV and brief */

test('CSV scope #98 is registered and carries no decision, lock, person or fact identifier', () => {
  const state = thinScenario();
  const { api, store } = harness(state);
  api.setActiveSeat('mgr1');
  api.hindsightScan();
  const spec = CSV_EXPORTS.find((row) => row.key === 'hindsight');
  assert.ok(spec, 'CSV scope #98 is registered');
  assert.equal(CSV_EXPORTS.length, 141);
  const res = exportWorkspaceCsv(store.state, 'hindsight', { now: NOW });
  assert.equal(res.ok, true, res.error);
  assert.ok(res.rowCount > 0);
  const text = res.csv || '';
  for (const forbidden of ['Consolidate the billing queues', 'Move the invoice run', 'Mira Manager', 'Lee Lead', 'd2', 'lock-hnd', 'k1', 'm1', 'l1']) {
    assert.ok(!text.includes(forbidden), `CSV must not contain ${forbidden}`);
  }
  const rows = hindsightCsvRows(buildHindsightReport(store.state, { now: NOW, settings: store.state.settings }));
  assert.ok(rows.some((row) => row.row_kind === 'resulting-share'));
  assert.ok(rows.some((row) => row.row_kind === 'association-test'));
  assert.ok(rows.every((row) => !('lock_id' in row) && !('decision_id' in row) && !('person' in row)));
});

test('the brief is identity-free and prints its refusals instead of a number', () => {
  const state = thinScenario();
  const { api } = harness(state);
  assert.equal(api.setActiveSeat('mgr1').ok, true);
  api.hindsightScan();
  const brief = api.hindsightBriefText();
  assert.equal(brief.ok, true);
  for (const forbidden of ['Mira Manager', 'Lee Lead', 'Dana Director', 'Consolidate the billing queues']) {
    assert.ok(!brief.text.includes(forbidden), `brief must not contain ${forbidden}`);
  }
  assert.match(brief.text, /Hindsight lock/);
  assert.match(brief.text, /REFUSED/);
});

test('the disclosure manifest declares the adapter, the class and the detail ceiling', () => {
  const manifest = manifestFor('hindsight');
  assert.ok(manifest);
  assert.equal(manifest.route, 'hindsight');
  assert.equal(manifest.classKey, 'unit');
  assert.equal(manifest.adapterScoped, true);
  assert.equal(manifest.detailCeiling, 5);
  assert.ok(manifest.collections.includes('decisionLocks'));
});

/* ------------------------------------------------------------------- view */

test('the view renders axe-clean across all six panels', async () => {
  const state = thinScenario();
  const { api, store } = harness(state);
  api.setActiveSeat('mgr1');
  api.hindsightScan();
  for (const panel of ['desk', 'locks', 'information', 'luck', 'rollup', 'method']) {
    const view = document.getElementById('view');
    view.innerHTML = '';
    const ctx = {
      api,
      state: store.state,
      query: new URLSearchParams(`panel=${panel}`),
      navigate: () => {},
      seatContext: null,
    };
    view.appendChild(renderHindsight(ctx));
    const results = await axe.run(view);
    assert.deepEqual(results.violations, [], `panel ${panel} is axe-clean: ${JSON.stringify(results.violations.map((v) => v.id))}`);
  }
});

test('an empty workspace renders the empty state and offers the decision screen', async () => {
  const { api, store } = harness(tree());
  const view = document.getElementById('view');
  view.innerHTML = '';
  view.appendChild(renderHindsight({ api, state: store.state, query: new URLSearchParams('panel=locks'), navigate: () => {}, seatContext: null }));
  const results = await axe.run(view);
  assert.deepEqual(results.violations, []);
  assert.match(view.textContent, /No lock yet/);
});
