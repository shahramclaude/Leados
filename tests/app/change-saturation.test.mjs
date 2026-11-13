/**
 * tests/app/change-saturation.test.mjs — ADR-0186, Session 254, Schema v148,
 * `#/matrix?panel=change-saturation`, CSV scope #140, RULE-CSA-01.
 *
 * ONE focused pass over what this session built. Every expected number below is
 * worked out BY HAND from the fixture and stated in a comment next to it; no
 * assertion calls the engine a second time to discover its own answer.
 *
 * THE FIXTURE (the matrix case). Reading day 2026-11-13, default read window 90
 * days INCLUSIVE, so the window is 2026-08-16 → 2026-11-13. A day after the 13th
 * is outside the window and charges nothing: the window ends today, it never runs
 * forward into a declared window.
 *
 *   ceo (Ada Chief)
 *    ├ ann (Ann Func)     home-line manager of kim, ria, tom
 *    └ bob (Bob Project)  declared PROJECT line of kim, ria and tom
 *
 *   changes: chg-a active (impacts kim, ria, tom) · chg-b proposed (impacts kim)
 *            chg-c ANCHORED (impacts ria) · chg-d PAUSED (impacts tom)
 *
 *   demands                                            window              band
 *   a1  chg-a · kim · ann's home line                  11-01 → 11-30         4
 *   a2  chg-a · kim · bob's project line               11-01 → 11-30         4  ← same change, same person: ONE charge, not two
 *   a3  chg-b · kim · bob's project line               11-05 → 11-20         3
 *   a4  chg-a · ria · ann's home line                  10-01 → 11-30         2
 *   a5  chg-a · ria · bob's project line               10-01 → 11-30         5  ← DIVERGENT bands for one impact
 *   a6  chg-c · ria · ann's home line                  11-02 → 11-10         4  ← change anchored: absorbed
 *   a7  chg-a · tom · ann's home line                  11-01 → 11-30         5
 *   a8  chg-d · tom · bob's project line               11-01 → 11-30         5  ← change paused: halted
 *   a9  chg-a · tom · bob's project line               05-01 → 05-31         1  ← wholly before the window
 *
 *   ceilings
 *   c1  person kim  6 units   2026-11-01 → 2026-12-31   in force
 *   c2  person ria  5 units   2026-01-01 → 2026-11-12   EXPIRED the day before the read
 *   c3  pool   ann  8 units   2026-11-01 → 2026-12-31   in force
 *   c4  pool   bob  4 units   2026-11-01 → 2026-12-31   in force
 *
 * HAND-COMPUTED ANSWERS.
 *   kim: chg-a charges max(4,4)=4 from 11-01; chg-b adds 3 from 11-05.
 *        11-01..11-04 → 4; 11-05..11-13 → 7. Peak 7 against a ceiling of 6 →
 *        SATURATED; days over 9 (11-05..11-13); longest run 9; first over day
 *        2026-11-05; excess at the peak 1; 7/6 = 1167 per-mille exactly; headroom
 *        −3 + 2 = −1. The judged window starts at the ceiling's first day (11-01),
 *        so 08-16..10-31 = 77 window days are UNJUDGED and counted, never assumed
 *        compliant. Exposure 4×4 + 7×9 = 79 unit-days.
 *   ria: 2 vs 5 for one change and person → CONTESTED, no peak printed, the
 *        heaviest band (5) still charges her day, and nothing is averaged.
 *   tom: only a7 is live (5 on 11-01..11-13) and he has no PERSON ceiling →
 *        NO-CEILING. ann's and bob's pool ceilings are never borrowed as his limit.
 *   ann's pool (demands her own line declared): kim 4 + ria 2 + tom 5 = 11 on every
 *        judged day (ria's a4 began 10-01, inside her window) → peak 11 against a
 *        ceiling of 8 → over on all 13 judged days (11-01..11-13), run 13.
 *   bob's pool: kim 4 + ria 5 = 9 from 11-01, +3 for chg-b from 11-05 → peak 12
 *        against a ceiling of 4 → over on all 13 judged days, run 13.
 *   ledger partitions: 6 read + 0 withdrawn + 1 absorbed + 1 halted
 *        + 0 unattributable + 1 before-window = 9 stored acts.
 *   clearances (open changes × impacted people = 4 pairs):
 *        chg-a|kim refused, tipping (without it the peak is 3 ≤ 6)
 *        chg-b|kim refused, tipping (without it the peak is 4 ≤ 6)
 *        chg-a|ria unavailable — intensity-divergence
 *        chg-a|tom unavailable — no-ceiling
 *        chg-c and chg-d are closed → 2 impacted people counted as not-open.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION, MIGRATIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { buildChangeSaturation, changeSaturationBriefText, changeSaturationCsvRows } from '../../app/core/domain/changeSaturation.js';
import { changeSaturationRule, CHANGE_SATURATION_CLOSED_PREFIX } from '../../app/core/domain/changeSaturationRules.js';
import { validateChangeDemand, validateChangeCeiling, liveChangeCeilings } from '../../app/core/domain/changeSaturationSchema.js';
import {
  CHANGE_SATURATION_ACT_REFUSALS,
  CHANGE_SATURATION_BANDS,
  CHANGE_SATURATION_CEILING_REFUSALS,
  CHANGE_SATURATION_CSV_COLUMNS,
  CHANGE_SATURATION_CSV_SCOPE,
  CHANGE_SATURATION_EVENTS,
  CHANGE_SATURATION_READ_REFUSAL_KEYS,
  CHANGE_SATURATION_RULE_ID,
  CHANGE_SATURATION_STATES,
  CHANGE_SATURATION_WITHHELD,
} from '../../app/core/domain/changeSaturationRegistry.js';
import { renderMatrixChangeSaturationPanel } from '../../app/views/matrixChangeSaturationPanel.js';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const STAMP = '2020-01-01T00:00:00.000Z';

const person = (id, name, managerId = null, level = 'frontline') => ({
  id, name, role: `${name} role`, level, managerId, status: 'active', startDate: STAMP, createdAt: STAMP, updatedAt: STAMP,
});

const demand = (id, changeId, personId, lineKey, band, fromOn, toOn) => ({
  id, changeId, personId, lineKey, band, fromOn, toOn, note: '',
  declaredOn: fromOn, declaredById: null, at: `${fromOn}T09:00:00.000Z`,
  withdrawn: false, withdrawnOn: null, withdrawnById: null, withdrawnReason: null, withdrawnAt: null,
});

const ceiling = (id, scope, subjectId, units, fromOn, toOn) => ({
  id, scope, subjectId, units, fromOn, toOn, note: '',
  declaredOn: fromOn, declaredById: null, retired: false, retiredOn: null, retiredById: null,
  at: `${fromOn}T09:00:00.000Z`,
});

const change = (id, title, status, impacted) => ({
  id, title, kind: 'topology', status, summary: '', vision: '', nonGoals: '',
  reversibility: 'reversible', ownerId: null, linkedGoalId: null,
  openedOn: '2026-10-01', targetOn: '2026-12-01', reviewOn: null,
  anchoredOn: status === 'anchored' ? '2026-11-01' : null,
  closedReason: '', kotterStage: 'urgency', completedSteps: [],
  topology: { teamName: '', currentType: 'stream-aligned', targetType: 'stream-aligned', interactionMode: 'x-as-a-service', collaboratingTeamsCount: 0 },
  forces: [], star: {}, coalition: [],
  impacts: impacted.map((personId, i) => ({ id: `${id}-i${i}`, personId, impactKind: 'scope-shift', newRoleLabel: '', createTransitionPlan: false })),
  effortDays: {}, economics: {}, metrics: [], autoCreateDecision: false,
  createdAt: STAMP, updatedAt: STAMP,
});

function fixture({ withLines = true, withCeilings = true, acts = null, ceilings = null, seat = null, settings = null } = {}) {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    person('ceo', 'Ada Chief', null, 'chief'),
    person('ann', 'Ann Func', 'ceo', 'director'),
    person('bob', 'Bob Project', 'ceo', 'manager'),
    person('kim', 'Kim Builder', 'ann'),
    person('ria', 'Ria Analyst', 'ann'),
    person('tom', 'Tom Ops', 'ann'),
  ];
  raw.reportingLines = withLines
    ? ['kim', 'ria', 'tom'].map((pid) => ({
      id: `p-${pid}`, personId: pid, managerId: 'bob', kind: 'project', shareH: 40,
      rights: [], fromISO: '2026-01-01', toISO: null, status: 'active', declaredAt: STAMP, history: [], note: '',
    }))
    : [];
  raw.changes = [
    change('chg-a', 'Split the billing pod', 'active', ['kim', 'ria', 'tom']),
    change('chg-b', 'Tooling cutover', 'proposed', ['kim']),
    change('chg-c', 'Old process move', 'anchored', ['ria']),
    change('chg-d', 'Paused reorg', 'paused', ['tom']),
  ];
  raw.changeSaturationActs = acts ?? [
    demand('a1', 'chg-a', 'kim', 'home:kim', 4, '2026-11-01', '2026-11-30'),
    demand('a2', 'chg-a', 'kim', 'p-kim', 4, '2026-11-01', '2026-11-30'),
    demand('a3', 'chg-b', 'kim', 'p-kim', 3, '2026-11-05', '2026-11-20'),
    demand('a4', 'chg-a', 'ria', 'home:ria', 2, '2026-10-01', '2026-11-30'),
    demand('a5', 'chg-a', 'ria', 'p-ria', 5, '2026-10-01', '2026-11-30'),
    demand('a6', 'chg-c', 'ria', 'home:ria', 4, '2026-11-02', '2026-11-10'),
    demand('a7', 'chg-a', 'tom', 'home:tom', 5, '2026-11-01', '2026-11-30'),
    demand('a8', 'chg-d', 'tom', 'p-tom', 5, '2026-11-01', '2026-11-30'),
    demand('a9', 'chg-a', 'tom', 'p-tom', 1, '2026-05-01', '2026-05-31'),
  ];
  raw.changeSaturationCeilings = ceilings ?? (withCeilings ? [
    ceiling('c1', 'person', 'kim', 6, '2026-11-01', '2026-12-31'),
    ceiling('c2', 'person', 'ria', 5, '2026-01-01', '2026-11-12'),
    ceiling('c3', 'pool', 'ann', 8, '2026-11-01', '2026-12-31'),
    ceiling('c4', 'pool', 'bob', 4, '2026-11-01', '2026-12-31'),
  ] : []);
  raw.settings = { ...raw.settings, leaderName: 'Riley Lead', activeSeatId: seat, ...settings };
  return normalizeState(raw, { now: NOW }).state;
}

const read = (state, extra = {}) => buildChangeSaturation(state, { now: NOW, settings: state.settings, ...extra });
const byId = (rows, id) => rows.find((row) => row.personId === id || row.managerId === id || row.pairKey === id);

function seed(state) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const rawApi = createApi(store, { now: () => NOW, idFactory });
  return { store, storage, api: guardApi(rawApi, store, { now: () => NOW.getTime() }) };
}

/**
 * The spine calls a rule as `(draft, ctx)` and the rule MUTATES the draft, so the
 * harness does exactly that: a deep copy, the scan event, and a throwaway effect
 * sink. Nothing here re-implements the arithmetic — the assertions below are the
 * hand-computed numbers from the header.
 */
let seq = 0;
function runRule(state, { event = CHANGE_SATURATION_EVENTS.SCAN, at = NOW } = {}) {
  const draft = JSON.parse(JSON.stringify(state));
  const out = changeSaturationRule(draft, {
    now: at,
    event: { type: event, entity: 'workspace', entityId: 'change-saturation' },
    idFactory: (prefix) => `${prefix}-t${++seq}`,
    recordEffect: () => {},
  });
  return { draft, out };
}
const asksOf = (draft) => draft.delegations.filter((d) => d && d.status === 'active');
const markersOf = (draft) => draft.changeSaturationMarkers.filter((m) => m && m.kind === 'ask');

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map((key) => [key, globalThis[key]]));
  try {
    for (const key of globals) {
      globalThis[key] = key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key];
    }
    return run(dom);
  } finally {
    for (const key of globals) globalThis[key] = previous.get(key);
  }
}

/* ------------------------------------------------------------- 1. registration */

test('registration: schema v148, the 33rd matrix panel, CSV scope #140, RULE-CSA-01, one safe read', () => {
  assert.equal(SCHEMA_VERSION, 149);
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'change-saturation'), 'the panel is on the matrix tab bar');
  assert.equal(MATRIX_PANELS.filter((panel) => panel.key === 'change-saturation').length, 1, 'exactly one panel entry');
  assert.equal(MATRIX_PANELS.length, 33, 'the 33rd matrix panel');
  const scope = CSV_EXPORTS.find((entry) => entry.key === CHANGE_SATURATION_CSV_SCOPE);
  assert.ok(scope, 'CSV #140 is registered');
  assert.equal(scope.sensitive, false, 'the export is aggregate-only, so it is not a sensitive scope');
  assert.equal(CSV_EXPORTS.length, 141, 'the export count moved from 139 to 140 and nothing else did');
  assert.ok(SAFE_READS.has('changeSaturationReport'), 'the seat-scoped board is a declared safe read');
  assert.ok(!SAFE_READS.has('changeSaturationDeclareDemand'), 'declaring a demand is NOT a safe read: it writes');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule?.id === 'changeSaturationRule');
  assert.ok(contract, 'RULE-CSA-01 declares its propagation contract');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'changeSaturationMarkers']);
  assert.equal(CHANGE_SATURATION_RULE_ID, 'RULE-CSA-01');
  assert.equal(CHANGE_SATURATION_BANDS.length, 5, 'five declared weight bands');
  assert.equal(CHANGE_SATURATION_STATES.length, 6, 'six verdicts that never collapse into each other');
  assert.ok(ACTION_RIGHTS['declare-change-demand'], 'declaring a demand is a declared right, not an assumed one');
  assert.ok(ACTION_RIGHTS['govern-change-saturation'], 'declaring a ceiling is a declared right');
});

test('the reader can only raise a reason the registry declares', () => {
  const declared = new Set(CHANGE_SATURATION_READ_REFUSAL_KEYS);
  const board = read(fixture());
  const raised = new Set();
  const collect = (row) => {
    for (const reason of row.reasons || []) raised.add(reason);
    if (row.withheld) raised.add(row.withheld);
  };
  for (const row of board.people) collect(row);
  for (const row of board.pools) collect(row);
  for (const row of board.clearances) collect(row);
  for (const row of board.refusals) raised.add(row.reason);
  assert.ok(raised.size >= 2, `the fixture exercises several refusals (got ${[...raised].join(', ')})`);
  assert.deepEqual([...raised].filter((key) => !declared.has(key)), [], 'no undeclared read-side reason');
  for (const list of [CHANGE_SATURATION_ACT_REFUSALS, CHANGE_SATURATION_CEILING_REFUSALS, CHANGE_SATURATION_WITHHELD]) {
    assert.equal(new Set(list.map((row) => row.key)).size, list.length, 'no duplicated refusal key');
    for (const row of list) assert.match(row.says, /[.!?]$/, `${row.key} explains itself in a full sentence`);
  }
});

/* --------------------------------------------- 2. the arithmetic that is the product */

test('one impact is charged once however many lines declared it, and two changes sum', () => {
  const kim = byId(read(fixture()).people, 'kim');
  assert.ok(kim, 'kim carries a verdict');
  // a1 (4, ann) and a2 (4, bob) are the SAME change for the SAME person: the day is
  // charged 4, not 8. a3 is a DIFFERENT change, so it adds.
  assert.equal(kim.demandsN, 3, 'three declarations read');
  assert.equal(kim.changesN, 2, 'across two changes');
  assert.equal(kim.peakUnits, 7, '4 + 3 on the overlapping days, not 4 + 4 + 3');
  assert.equal(kim.exposureUnitsDays, 4 * 4 + 7 * 9, 'unit-days over the window: 4×(11-01..11-04) + 7×(11-05..11-13)');
  assert.equal(kim.ceilingUnits, 6);
  assert.equal(kim.state, 'saturated');
  assert.equal(kim.daysOverCeiling, 9, '11-05 → 11-13');
  assert.equal(kim.longestRunDays, 9);
  assert.equal(kim.firstOverDay, '2026-11-05');
  assert.equal(kim.peakExcess, 1);
  assert.equal(kim.peakPermille, 1167, '7/6 as exact per-mille, not a floating reassurance');
  assert.equal(kim.headroomUnits, -1);
  assert.equal(kim.daysUnjudged, 77, '08-16 → 10-31 predates the ceiling: counted as unjudged, never as compliant');
  assert.equal(kim.lineN, 2);
  assert.equal(kim.demandLines.length, 2, 'both lines that put it there are named');
  assert.deepEqual(kim.demandLines.map((line) => line.managerName).sort(), ['Ann Func', 'Bob Project']);
  assert.deepEqual(kim.bandUnits, [3, 4], 'per change: one charge per change, the heaviest band any line declared for it');
});

test('two lines that disagree about one impact get a contested verdict, never an average', () => {
  const ria = byId(read(fixture()).people, 'ria');
  assert.equal(ria.state, 'contested');
  assert.deepEqual(ria.reasons, ['intensity-divergence']);
  assert.equal(ria.peakUnits, null, 'no peak, no verdict, no clearance prints over a disagreement');
  assert.equal(ria.daysOverCeiling, null);
  assert.equal(ria.withheld, 'intensity-divergence');
  assert.match(ria.withheldReason, /no average was taken/);
  assert.equal(ria.divergentChangesN, 1, 'exactly one change is disputed');
  assert.equal(ria.peakWindowUnits, 5, 'the heaviest band still charges the day; 3.5 is not a number this register can hold');
});

test('an expired ceiling is history, not compliance and not a licence to guess', () => {
  const state = fixture();
  assert.equal(state.changeSaturationCeilings.find((row) => row.id === 'c2').toOn, '2026-11-12', 'the expired row survives the reload');
  const board = read(state);
  assert.equal(board.totals.ceilingsExpiredN, 1);
  assert.equal(board.ceilingCensus.expired, 1);
  assert.equal(board.ceilingCensus['in-force'], 3);
  assert.equal(liveChangeCeilings(state.changeSaturationCeilings, '2026-11-13').has('person:ria'), false, 'an expired row governs no reading');
  assert.equal(board.people.find((row) => row.personId === 'ria').ceilingUnits, null, 'ria is not measured against a limit that lapsed yesterday');
  // Remove ria's divergence and her story is the refusal, not a generous default.
  const agreed = read(fixture({
    acts: [demand('a4', 'chg-a', 'ria', 'home:ria', 2, '2026-10-01', '2026-11-30')],
  }));
  const ria = byId(agreed.people, 'ria');
  assert.equal(ria.state, 'no-ceiling');
  assert.equal(ria.peakUnits, null);
  assert.equal(ria.peakWindowUnits, 2, 'her load is a fact and still prints');
  assert.match(ria.withheldReason, /pool ceiling is never borrowed/);
});

test('a pool ceiling is never borrowed as an individual limit', () => {
  const tom = byId(read(fixture()).people, 'tom');
  assert.equal(tom.state, 'no-ceiling', 'two live pool ceilings and no person ceiling → no verdict');
  assert.equal(tom.demandsN, 1);
  assert.equal(tom.peakUnits, null, 'the day is charged 5 but nothing is compared against it');
  assert.equal(tom.daysOverCeiling, null);
  assert.equal(tom.peakWindowUnits, 5);
});

test('pools are measured on their own declarations against their own ceilings', () => {
  const board = read(fixture());
  const ann = board.pools.find((row) => row.managerId === 'ann');
  // ann declared 4 (kim) + 2 (ria) + 5 (tom) = 11 on every judged day.
  assert.equal(ann.peopleN, 3, 'three people carry her line’s demands: at the floor, so the figure prints');
  assert.equal(ann.demandsN, 3);
  assert.equal(ann.peakUnits, 11);
  assert.equal(ann.daysOverCeiling, 13, '11-01 → 11-13, the whole judged window');
  assert.equal(ann.longestRunDays, 13);
  assert.equal(ann.state, 'saturated');
  // bob’s own line declared for kim (a2, a3) and ria (a5) only — a8 rides a paused
  // change and a9 sits before the window — so his pool covers 2 people, below the
  // disclosure floor of 3: its concurrency figure is withheld, not zeroed.
  const bob = board.pools.find((row) => row.managerId === 'bob');
  assert.equal(bob.demandsN, 3, 'a2, a3, a5: the live demands his line declared');
  assert.equal(bob.peopleN, 2);
  assert.equal(bob.peakUnits, null);
  assert.equal(bob.state, 'pool-below-floor');
  assert.match(bob.withheldReason, /below the declared floor of 3/);
  // A demand two lines both declared charges EACH line’s pool: the dedup protects
  // the person from being counted twice, it does not erase that both asked.
  assert.equal(ann.demandsN + bob.demandsN, 6, 'the pool counts sum above the people count because a2 is declared by both lines');
});

test('a pool below the disclosure floor prints its counts and no concurrency figure', () => {
  const board = read(fixture({
    acts: [demand('a1', 'chg-a', 'kim', 'home:kim', 4, '2026-11-01', '2026-11-30')],
  }));
  const ann = board.pools.find((row) => row.managerId === 'ann');
  assert.equal(ann.peopleN, 1);
  assert.equal(ann.state, 'pool-below-floor');
  assert.equal(ann.peakUnits, null, 'one person is not a pool figure: the number would describe a named individual');
  assert.match(ann.withheldReason, /below the declared floor of 3/);
  assert.equal(board.totals.actsReadN, 1, 'a withheld figure is not a dropped fact');
  assert.equal(board.totals.countsReconcile, true);
});

/* ------------------------------------------------------- 3. the ledger partitions */

test('absorbed, halted, before-window and unattributable demands are each counted apart', () => {
  const board = read(fixture());
  const t = board.totals;
  assert.equal(t.actsTotalN, 9);
  assert.equal(t.actsReadN, 6);
  assert.equal(t.actsAbsorbedN, 1, 'a6 rides an ANCHORED change: the impact is in practice, so it charges no future day');
  assert.equal(t.actsHaltedN, 1, 'a8 rides a PAUSED change: a real weight, not a demand to clear');
  assert.equal(t.actsBeforeWindowN, 1, 'a9 ended 2026-05-31, before the window opened on 08-16');
  assert.equal(t.actsWithdrawnN, 0);
  assert.equal(t.actsUnattributedN, 0);
  assert.equal(t.actsReadN + t.actsWithdrawnN + t.actsAbsorbedN + t.actsHaltedN + t.actsBeforeWindowN + t.actsUnattributedN, t.actsTotalN);
  assert.equal(t.countsReconcile, true, 'the six partitions are provably the ledger');
  assert.equal(byId(board.people, 'ria').demandsN, 2, 'a6 is not one of ria’s live charges');
  assert.equal(byId(board.people, 'tom').demandsN, 1, 'a8 and a9 are not tom’s charges');
  assert.deepEqual(board.totals.stateCounts, {
    unreadable: 0, contested: 1, 'no-ceiling': 1, saturated: 1, 'at-limit': 0, within: 0,
  }, 'the three verdicts are counted apart and never collapse into one “over” row');
  assert.equal(board.totals.overDaysTotal, 9 + 13, 'kim’s 9 person-days + ann’s pool 13; bob’s pool is withheld, so it contributes nothing');
  assert.equal(board.totals.longestRunDays, 13);
  assert.equal(board.totals.peakUnits, 11, 'the heaviest cell actually printed');
});

test('a demand whose line has ended is unattributable: history kept, day uncharged, nobody substituted', () => {
  const state = fixture();
  state.reportingLines = [];  // bob’s project lines are gone; the acts survive
  const reloaded = normalizeState({ ...state, settings: state.settings }, { now: NOW }).state;
  const board = read(reloaded);
  const t = board.totals;
  assert.equal(t.actsTotalN, 9);
  // a2, a3, a5, a8 AND a9 all named bob's lines. The line check runs BEFORE the
  // window check on purpose: an act nobody owns is the more actionable finding, and
  // counting it as merely out-of-date would hide that no pool is accountable.
  assert.equal(t.actsUnattributedN, 5, 'every demand declared down an ended line, including the one whose window also passed');
  assert.equal(t.actsBeforeWindowN, 0, 'a9 is partitioned as unattributable, not twice');
  assert.equal(t.actsReadN, 3, 'only the three home-line demands still charge a day');
  assert.equal(t.actsAbsorbedN, 1);
  assert.equal(t.countsReconcile, true);
  assert.equal(board.refusalCounts['line-not-active'], 5);
  assert.ok(board.refusals.some((row) => row.reason === 'line-not-active'), 'the refusal names itself and its count');
  // kim keeps only a1: 4 against a ceiling of 6 → within, not saturated.
  const kim = byId(board.people, 'kim');
  assert.equal(kim.demandsN, 1);
  assert.equal(kim.peakUnits, 4);
  assert.equal(kim.state, 'within');
  assert.equal(kim.lineN, 1);
  // And the cross-line claim goes inert rather than restating one line’s figures.
  assert.equal(board.crossLine.claim, 'inert');
  assert.equal(board.claims.crossLineClaim, false);
  assert.equal(board.totals.multiLinePeopleN, 0);
});

test('a single-chain workspace reads the person-level ledger in full and claims nothing cross-line', () => {
  const board = read(fixture({
    withLines: false,
    acts: [
      demand('a1', 'chg-a', 'kim', 'home:kim', 4, '2026-11-01', '2026-11-30'),
      demand('a7', 'chg-a', 'tom', 'home:tom', 5, '2026-11-01', '2026-11-30'),
    ],
    ceilings: [ceiling('c1', 'person', 'kim', 6, '2026-11-01', '2026-12-31')],
  }));
  assert.equal(board.crossLine.claim, 'inert');
  assert.equal(board.totals.multiLinePeopleN, 0);
  assert.equal(board.totals.actsReadN, 2);
  assert.equal(byId(board.people, 'kim').state, 'within');
  assert.equal(byId(board.people, 'tom').state, 'no-ceiling');
  assert.equal(board.totals.countsReconcile, true);
  assert.equal(board.totals.figuresComplete, false, 'tom’s withheld cell is counted, not hidden');
});

/* -------------------------------------------------------- 4. the door’s refusals */

test('the demand validator refuses an invented burden instead of storing it', () => {
  // A clear field for the clause cases: on the full fixture several triples already
  // exist, and a duplicate refusal would mask the clause under test.
  const state = fixture({ acts: [], ceilings: [] });
  const cases = [
    ['unknown-band', { changeId: 'chg-a', personId: 'kim', lineKey: 'home:kim', band: 6, fromOn: '2026-11-01', toOn: '2026-11-05' }],
    ['unknown-band', { changeId: 'chg-a', personId: 'kim', lineKey: 'home:kim', band: 'four', fromOn: '2026-11-01', toOn: '2026-11-05' }],
    ['unknown-band', { changeId: 'chg-a', personId: 'kim', lineKey: 'home:kim', band: 0, fromOn: '2026-11-01', toOn: '2026-11-05' }],
    ['missing-person', { changeId: 'chg-a', personId: '', lineKey: 'home:kim', band: 3, fromOn: '2026-11-01', toOn: '2026-11-05' }],
    ['missing-change', { changeId: '', personId: 'kim', lineKey: 'home:kim', band: 3, fromOn: '2026-11-01', toOn: '2026-11-05' }],
    ['impact-not-recorded', { changeId: 'chg-b', personId: 'ria', lineKey: 'home:ria', band: 3, fromOn: '2026-11-01', toOn: '2026-11-05' }],
    ['unknown-change', { changeId: 'chg-z', personId: 'kim', lineKey: 'home:kim', band: 3, fromOn: '2026-11-01', toOn: '2026-11-05' }],
    ['unknown-line', { changeId: 'chg-a', personId: 'kim', lineKey: 'p-tom', band: 3, fromOn: '2026-11-01', toOn: '2026-11-05' }, { linesByPerson: new Map([['kim', [{ id: 'home:kim', managerId: 'ann', active: true }]]]) }],
    ['reversed-window', { changeId: 'chg-a', personId: 'kim', lineKey: 'home:kim', band: 3, fromOn: '2026-11-05', toOn: '2026-11-01' }],
    ['future-window', { changeId: 'chg-a', personId: 'kim', lineKey: 'home:kim', band: 3, fromOn: '2026-12-01', toOn: '2026-12-05' }],
    ['bad-day', { changeId: 'chg-a', personId: 'kim', lineKey: 'home:kim', band: 3, fromOn: '2026-02-31', toOn: '2026-11-05' }],
    ['missing-person', { changeId: 'chg-a', personId: 'ghost', lineKey: 'home:kim', band: 2, fromOn: '2026-11-01', toOn: '2026-11-05' }],
    // 1049 days inclusive: far past the 730-day cap on a single demand’s span.
    ['window-too-long', { changeId: 'chg-a', personId: 'kim', lineKey: 'home:kim', band: 2, fromOn: '2024-01-01', toOn: '2026-11-13' }],
  ];
  for (const [expected, input, matrix] of cases) {
    const { refusals } = validateChangeDemand(state, input, { today: '2026-11-13', ...(matrix ? { matrix } : {}) });
    assert.ok(refusals.includes(expected), `${expected} is refused (got ${refusals.join(', ')})`);
  }
  // A demand for a person the change never claimed cannot be filed under the
  // change’s name, and the live-line check runs only where a graph was supplied.
  const withGraph = validateChangeDemand(state, {
    changeId: 'chg-a', personId: 'ria', lineKey: 'p-ria', band: 1, fromOn: '2026-11-11', toOn: '2026-11-12',
  }, { today: '2026-11-13', matrix: { linesByPerson: new Map([['ria', []]]) } });
  assert.ok(withGraph.refusals.includes('unknown-line'), 'an active-line set that does not hold the line refuses the act');
  const full = fixture();
  assert.ok(full.changeSaturationActs.some((a) => a.lineKey === 'home:kim' && a.changeId === 'chg-a'), 'the fixture states the pair the clause reads');
  assert.ok(validateChangeDemand(full, {
    changeId: 'chg-a', personId: 'kim', lineKey: 'home:kim', band: 1, fromOn: '2026-11-11', toOn: '2026-11-12',
  }, { today: '2026-11-13' }).refusals.includes('duplicate-line-demand'), 'one line states one demand per change per person');
  // chg-b is kim’s other change: Bob’s line has stated it, Ann’s has not, so the
  // counterpart’s sentence is legal and the pair is the cross-line case itself.
  const counterpart = validateChangeDemand(full, {
    changeId: 'chg-b', personId: 'kim', lineKey: 'home:kim', band: 4, fromOn: '2026-11-11', toOn: '2026-11-12',
  }, { today: '2026-11-13' });
  assert.deepEqual(counterpart.refusals, [], 'a SECOND line may state its own weight for the same impact — that pair is the cross-line case the ledger exists to read');
});

test('a ceiling cannot be born already expired, cannot be fractional, and cannot be scoped to nobody', () => {
  const state = fixture();
  assert.ok(validateChangeCeiling(state, { scope: 'person', subjectId: 'kim', units: 6, fromOn: '2026-01-01', toOn: '2026-11-01' }, { today: '2026-11-13' }).refusals.includes('window-passed'),
    'the door refuses a past window: expiry is produced by time, not by declaration');
  assert.equal(validateChangeCeiling(state, { scope: 'person', subjectId: 'tom', units: 6, fromOn: '2026-01-01', toOn: '2026-11-01' }, { today: '2026-11-13', allowPassedWindow: true }).refusals.length, 0,
    'the loader keeps one that aged into expiry — the record of what was agreed survives');
  assert.ok(validateChangeCeiling(state, { scope: 'person', subjectId: 'kim', units: 6.5, fromOn: '2026-11-01', toOn: '2026-12-01' }, { today: '2026-11-13' }).refusals.includes('band-not-whole'));
  assert.ok(validateChangeCeiling(state, { scope: 'span', subjectId: 'kim', units: 6, fromOn: '2026-11-01', toOn: '2026-12-01' }, { today: '2026-11-13' }).refusals.includes('unknown-scope'),
    'there is no team, unit or altitude scope: that would be a ceiling nobody named');
  assert.ok(validateChangeCeiling(state, { scope: 'pool', subjectId: 'kim', units: 6, fromOn: '2026-11-01', toOn: '2026-12-01' }, { today: '2026-11-13' }).refusals.includes('missing-subject'),
    'a pool ceiling over a person with nobody in their span is not a pool');
  assert.ok(validateChangeCeiling(fixture({ withLines: false }), { scope: 'pool', subjectId: 'bob', units: 6, fromOn: '2026-11-01', toOn: '2026-12-01' }, { today: '2026-11-13' }).refusals.includes('missing-subject'),
    'and with no lines at all Bob runs no pool');
  assert.equal(validateChangeCeiling(state, { scope: 'pool', subjectId: 'bob', units: 6, fromOn: '2027-01-01', toOn: '2027-02-01' }, { today: '2026-11-13' }).refusals.length, 0,
    'a manager who holds only declared matrix lines still runs a pool worth bounding');
  assert.ok(validateChangeCeiling(state, { scope: 'person', subjectId: 'kim', units: 6, fromOn: '2026-11-05', toOn: '2026-11-20' }, { today: '2026-11-13' }).refusals.includes('overlapping-ceiling'),
    'one live ceiling per subject: a second is a conflict, not a choice');
  assert.ok(validateChangeCeiling(state, { scope: 'person', subjectId: 'ceo', units: 0, fromOn: '2026-11-05', toOn: '2026-11-20' }, { today: '2026-11-13' }).refusals.includes('band-out-of-range'),
    'zero is not “no capacity”: a ceiling of nothing is a vacancy nobody declared, so the bounded range starts at 1');
});

test('two live, disagreeing ceilings refuse the comparison instead of picking one', () => {
  const board = read(fixture({
    acts: [demand('a1', 'chg-a', 'kim', 'home:kim', 4, '2026-11-01', '2026-11-30')],
    ceilings: [
      ceiling('c1', 'person', 'kim', 6, '2026-11-01', '2026-12-31'),
      ceiling('c1b', 'person', 'kim', 9, '2026-11-01', '2026-12-31'),
    ],
  }));
  const kim = byId(board.people, 'kim');
  assert.equal(kim.state, 'contested');
  assert.deepEqual(kim.reasons, ['ceiling-conflict']);
  assert.equal(kim.peakUnits, null, 'no verdict is issued over a ceiling nobody settled');
  assert.equal(kim.withheld, 'ceiling-conflict');
  assert.equal(kim.ceilingUnits, null, 'neither the min nor the max was chosen for them');
  assert.equal(kim.ceilingIds.length, 2, 'and both rows are named, so the conflict can be settled');
});

test('the clearance names the demand that tips a person over, and never blocks the change', () => {
  const board = read(fixture());
  const clearances = new Map(board.clearances.map((row) => [row.pairKey, row]));
  const chgA = clearances.get('chg-a|kim');
  assert.equal(chgA.verdict, 'refused');
  assert.equal(chgA.peakWithUnits, 7);
  assert.equal(chgA.peakWithoutUnits, 3, 'without chg-a, only chg-b’s 3 units remain');
  assert.equal(chgA.tipping, true, 'this is the demand that crossed the line');
  assert.equal(chgA.excessUnits, 1);
  assert.equal(chgA.firstOverDay, '2026-11-05');
  const chgB = clearances.get('chg-b|kim');
  assert.equal(chgB.verdict, 'refused');
  assert.equal(chgB.peakWithoutUnits, 4, 'without chg-b, chg-a’s 4 remain');
  assert.equal(chgB.tipping, true);
  assert.equal(clearances.get('chg-a|ria').verdict, 'unavailable');
  assert.deepEqual(clearances.get('chg-a|ria').reasons, ['intensity-divergence', 'no-ceiling'],
    'both clauses print: her lines disagree AND her ceiling expired — neither is folded into the other');
  assert.deepEqual(clearances.get('chg-a|tom').reasons, ['no-ceiling']);
  assert.deepEqual(board.totals.clearanceCounts, { clearable: 0, refused: 2, unavailable: 2, notOpen: 2 });
  // A demand that did not tip anything is reported separately from one that did.
  const already = read(fixture({
    acts: [
      demand('a1', 'chg-a', 'kim', 'home:kim', 4, '2026-11-01', '2026-11-30'),
      demand('a3', 'chg-b', 'kim', 'p-kim', 3, '2026-11-05', '2026-11-20'),
    ],
    ceilings: [ceiling('c1', 'person', 'kim', 2, '2026-11-01', '2026-12-31')],
  }));
  const chgBRow = already.clearances.find((row) => row.pairKey === 'chg-b|kim');
  assert.equal(chgBRow.verdict, 'refused');
  assert.equal(chgBRow.tipping, false, 'kim was already over before this demand was counted');
  assert.deepEqual(chgBRow.reasons, ['already-over-ceiling']);
  // With nothing declared, every open pair is unavailable: the gap, not a clearance.
  const emptyBoard = read(fixture({ acts: [], ceilings: [] }));
  const orphan = emptyBoard.clearances.find((row) => row.verdict === 'unavailable');
  assert.ok(orphan, 'the register still answers the question it can answer');
  assert.ok(orphan.reasons.includes('demand-not-declared'));
  assert.equal(emptyBoard.claims.loadObserved, false);
  assert.equal(emptyBoard.claims.clearanceMade, false);
});

test('a declared demand inside the headroom comes back clearable — and stops short of approval', () => {
  const board = read(fixture({
    acts: [demand('a1', 'chg-a', 'kim', 'home:kim', 4, '2026-11-01', '2026-11-30')],
    ceilings: [ceiling('c1', 'person', 'kim', 5, '2026-10-01', '2026-12-31')],
  }));
  const kim = byId(board.people, 'kim');
  assert.equal(kim.state, 'within', '4 against a declared ceiling of 5');
  assert.equal(kim.headroomUnits, 1);
  const clearance = board.clearances.find((row) => row.pairKey === 'chg-a|kim');
  assert.equal(clearance.verdict, 'clearable');
  assert.equal(clearance.peakWithUnits, 4);
  assert.equal(clearance.peakWithoutUnits, 0);
  assert.equal(clearance.verdictLabel, 'Absorbable on the record');
  assert.match(changeSaturationBriefText(board), /A clearance is a statement about this record, never an approval/);
  // The exact limit is its own state: `at-limit` is never folded into `within`.
  const atLimit = read(fixture({
    acts: [demand('a1', 'chg-a', 'kim', 'home:kim', 5, '2026-11-01', '2026-11-30')],
    ceilings: [ceiling('c1', 'person', 'kim', 5, '2026-10-01', '2026-12-31')],
  }));
  assert.equal(byId(atLimit.people, 'kim').state, 'at-limit');
  assert.equal(atLimit.totals.stateCounts.within, 0, 'the two states never collapse into each other');
  assert.equal(atLimit.totals.figuresComplete, false, 'the only withheld cell is the pool row: one person is below the disclosure floor');
  assert.equal(atLimit.pools[0].state, 'pool-below-floor');
  assert.equal(atLimit.people[0].state, 'at-limit', 'the person’s own row is complete');
  // A pair the change never names cannot be filed against it at all.
  const outside = read(fixture({
    acts: [demand('a1', 'chg-a', 'ria', 'home:ria', 4, '2026-11-01', '2026-11-30')],
    ceilings: [],
  }));
  assert.ok(!outside.clearances.some((row) => row.pairKey === 'chg-b|ria'), 'chg-b does not claim ria, so no clearance exists for that pair');
});

/* ------------------------------------------- 6. displayed == stored, both ways */

test('an act the action accepted is the act the next reload reads, field for field', () => {
  const { store, api } = seed(fixture({ acts: [], ceilings: [] }));
  const result = api.changeSaturationDeclareDemand({
    changeId: 'chg-a', personId: 'kim', lineKey: 'home:kim', band: 3,
    fromOn: '2026-11-02', toOn: '2026-11-20', note: '  Rework the billing handover.  ',
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const stored = store.state.changeSaturationActs[0];
  assert.equal(stored.band, 3);
  assert.equal(stored.note, 'Rework the billing handover.', 'trimmed, never rewritten');
  assert.equal(stored.declaredOn, '2026-11-13', 'the act is dated the day it was made, not the day its window opens');
  const again = normalizeState(JSON.parse(JSON.stringify(store.state)), { now: NOW }).state;
  assert.equal(again.changeSaturationActs.length, 1, 'the loader did not drop what the action accepted');
  assert.deepEqual(again.changeSaturationActs[0], store.state.changeSaturationActs[0], 'every field round-trips');
  const board = read(again);
  assert.equal(board.totals.actsReadN, 1);
  assert.equal(byId(board.people, 'kim').peakWindowUnits, 3, 'one demand, three units, nothing else in the window');
  assert.equal(byId(board.people, 'kim').peakUnits, null, 'with no ceiling in force the load prints and the verdict is withheld');
  assert.equal(byId(board.people, 'kim').state, 'no-ceiling');
  assert.equal(byId(board.people, 'kim').lineN, 2, 'kim still HOLDS two lines…');
  assert.equal(byId(board.people, 'kim').demandLines.length, 1, '…but only one of them declared anything, so this is not a cross-line claim');
  assert.equal(board.crossLine.claim, 'inert');
  // The refused path writes nothing at all, and says which clause failed.
  const refused = api.changeSaturationDeclareDemand({
    changeId: 'chg-b', personId: 'tom', lineKey: 'home:tom', band: 3,
    fromOn: '2026-11-02', toOn: '2026-11-20',
  });
  assert.equal(refused.ok, false);
  assert.ok(refused.refusals.includes('impact-not-recorded'), 'chg-b never claimed tom as impacted');
  assert.equal(store.state.changeSaturationActs.length, 1, 'the refusal wrote nothing');
});

test('a withdrawal marks the row, keeps the history, and moves only what it should', () => {
  const { store, api } = seed(fixture());
  assert.equal(byId(read(store.state).people, 'kim').state, 'saturated');
  assert.equal(api.changeSaturationWithdrawDemand('a1', 'short').ok, false, 'a withdrawal with no usable reason is refused');
  assert.equal(api.changeSaturationWithdrawDemand('nope', 'Because it was declared against the wrong window entirely.').ok, false, 'an unknown demand id is refused, not ignored');
  const done = api.changeSaturationWithdrawDemand('a1', 'Declared against the wrong window; the project line owns it.');
  assert.equal(done.ok, true, JSON.stringify(done));
  const row = store.state.changeSaturationActs.find((a) => a.id === 'a1');
  assert.equal(row.withdrawn, true);
  assert.equal(row.withdrawnOn, '2026-11-13');
  assert.equal(store.state.changeSaturationActs.length, 9, 'the ledger kept its row');
  const after = read(store.state);
  assert.equal(after.totals.actsWithdrawnN, 1);
  assert.equal(after.totals.actsReadN, 5);
  assert.equal(after.totals.countsReconcile, true);
  // kim stands at 4 (a2, bob’s line) + 3 (a3) = 7 on the overlap, so the peak and
  // the verdict are UNCHANGED — which is exactly what dedup means: withdrawing one
  // of two identical declarations removes nothing the day was not already carrying.
  assert.equal(byId(after.people, 'kim').peakUnits, 7);
  assert.equal(byId(after.people, 'kim').state, 'saturated');
  // Withdrawing the surviving one does move it.
  assert.equal(api.changeSaturationWithdrawDemand('a2', 'The project line reclassified this as routine delivery work.').ok, true);
  const third = read(store.state);
  assert.equal(byId(third.people, 'kim').peakUnits, 3, 'only chg-b’s 3 units remain');
  assert.equal(byId(third.people, 'kim').state, 'within');
  assert.equal(third.totals.actsWithdrawnN, 2);
  assert.equal(third.totals.actsReadN, 4);
});

test('the CSV carries exactly the figures the reader computed and no identity at all', () => {
  const state = fixture();
  const board = read(state);
  const res = exportWorkspaceCsv(state, CHANGE_SATURATION_CSV_SCOPE, { now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.columnCount, CHANGE_SATURATION_CSV_COLUMNS.length, 'every declared column, none undeclared');
  assert.equal(res.rowCount, 1 + CHANGE_SATURATION_STATES.length, 'one workspace row plus one row per verdict');
  const parsed = parseCsv(res.csv);
  assert.deepEqual(parsed.headers, [...CHANGE_SATURATION_CSV_COLUMNS], 'the declared header row, in order');
  const cells = Object.fromEntries(CHANGE_SATURATION_CSV_COLUMNS.map((key, i) => [key, parsed.rows[0][i]]));
  assert.equal(cells.row_kind, 'workspace');
  assert.equal(cells.as_of, board.today);
  assert.equal(cells.window_days, '90');
  assert.equal(cells.acts_total_n, '9');
  assert.equal(cells.acts_read_n, '6');
  assert.equal(cells.acts_absorbed_n, '1');
  assert.equal(cells.acts_halted_n, '1');
  assert.equal(cells.acts_before_window_n, '1');
  assert.equal(cells.people_n, '3');
  assert.equal(cells.multi_line_people_n, '2');
  assert.equal(cells.saturated_n, '1');
  assert.equal(cells.contested_n, '1');
  assert.equal(cells.no_ceiling_n, '1');
  assert.equal(cells.clearance_refused_n, '2');
  assert.equal(cells.peak_units, '11');
  assert.equal(cells.over_days_total, '22');
  assert.equal(cells.saturated_pct, '33', '1 of the 3 people carrying a verdict — the listed base, never the whole roster');
  assert.equal(cells.saturated_pct_withheld_reason, '', 'the reason cell is blank when nothing was withheld');
  assert.equal(cells.claim_cross_line, 'available');
  assert.equal(cells.counts_reconcile, 'true');
  assert.equal(cells.figures_complete, 'false', 'two rows carry a withheld cell');
  // Identity audit: no name, id, change title or prose from the record reaches it.
  const banned = ['kim', 'ria', 'tom', 'ann', 'bob', 'ada chief', 'ann func', 'bob project', 'kim builder', 'split the billing pod', 'tooling cutover', 'home:kim', 'p-kim', 'scope-shift', 'rework', 'a1', 'c1'];
  for (const row of parsed.rows) {
    for (const cell of row) {
      for (const token of banned) {
        assert.ok(!cell.toLowerCase().includes(token), `the export must not carry “${token}”; got “${cell}”`);
      }
    }
  }
  // The state rows repeat the workspace denominators and carry their own count.
  const saturatedRow = parsed.rows.find((row) => row[0] === 'state:saturated');
  assert.ok(saturatedRow, 'one row per verdict state');
  assert.equal(saturatedRow[CHANGE_SATURATION_CSV_COLUMNS.indexOf('people_n')], '1');
  assert.equal(saturatedRow[CHANGE_SATURATION_CSV_COLUMNS.indexOf('saturated_pct')], '', 'a percentage is a workspace figure only, never a state-row figure');
  assert.equal(saturatedRow[CHANGE_SATURATION_CSV_COLUMNS.indexOf('acts_read_n')], '6', 'the same denominators on every row, so a rate cannot be built from one row alone');
});

test('the export is the panel’s own rows, built from one reader', () => {
  const board = read(fixture());
  const rows = changeSaturationCsvRows(board);
  // `{ now: NOW }`, not a bare Date: `exportWorkspaceCsv`'s third argument is an
  // options object, and a positional date there is silently IGNORED — the export
  // then reads the real wall clock while the board was read at the fixture date,
  // and the equality below passes only for as long as the two happen to agree.
  const parsed = parseCsv(exportWorkspaceCsv(fixture(), CHANGE_SATURATION_CSV_SCOPE, { now: NOW }).csv);
  assert.equal(parsed.rows.length, rows.length, 'the same number of rows the panel prints');
  assert.deepEqual(parsed.rows, rows.map((row) => CHANGE_SATURATION_CSV_COLUMNS.map((key) => (row[key] === null || row[key] === undefined ? '' : String(row[key])))),
    'cell for cell, in the declared column order');
  const brief = changeSaturationBriefText(board);
  assert.match(brief, /The count reconciles to the ledger: yes/);
  assert.match(brief, /Heaviest day printed: 11 change-weight unit-days/);
  assert.match(brief, /declarations disagree: 1/);
  assert.match(brief, /Refusals on read: window-outside-read × 1/);
  assert.match(brief, /A clearance is a statement about this record, never an approval/);
});

/* ---------------------------------------------------------- 7. the shared spine */

test('RULE-CSA-01 raises one dated ask per finding, at the apex of the line HOLDERS — never the affected person', () => {
  const { draft, out } = runRule(fixture());
  const asks = asksOf(draft);
  assert.equal(asks.length, 2, `saturation-over and ceilings-expired (got ${asks.map((a) => a.title).join(' / ')})`);
  assert.deepEqual(markersOf(draft).map((m) => m.subject).sort(), ['ceilings-expired', 'saturation-over']);
  assert.equal(new Set(asks.map((a) => a.personId)).size, 1, 'both findings share one owning seat');
  assert.deepEqual([...new Set(asks.map((a) => a.personId))], ['ceo'],
    'Ada is the joint apex of Ann’s and Bob’s lines. The ask never goes to Kim, who carries the two changes and can sequence neither.');
  for (const ask of asks) {
    assert.ok(ask.expectedOutcome.length > 200, 'the ask states the figure, the window and what answering it does');
    assert.match(ask.expectedOutcome, /does not defer a change|is history, not compliance/);
    assert.equal(ask.delegatedOn, '2026-11-13');
    assert.equal(ask.dueOn, '2026-11-27', 'the declared 14-day ask window');
    assert.equal(ask.authority, 'act-inform', 'an ask to settle the record, not an authority to act on it');
  }
  const links = draft.links.filter((l) => l.ruleId === CHANGE_SATURATION_RULE_ID);
  assert.equal(links.length, 2, 'one obligation edge per ask; Ada has no ancestors to roll up to');
  assert.deepEqual([...new Set(links.map((l) => l.relation))], ['issues-obligation']);
  assert.equal(out.length, 1);
  assert.equal(out[0].action, 'delegated');
  assert.match(out[0].summary, /Issued 2 cross-line change-saturation ask\(s\)/);
});

test('the rule is idempotent per finding, closes itself when the finding clears, and writes nothing else', () => {
  const first = runRule(fixture());
  const again = runRule(first.draft);
  assert.deepEqual(again.out, [], 'an open ask for the same finding is never re-issued');
  assert.equal(asksOf(again.draft).length, 2);
  assert.equal(again.draft.changeSaturationMarkers.length, 2);
  // Every write the rule makes is its own three collections: it never touches a
  // change record, a person record or a reporting line.
  const before = JSON.stringify({ c: fixture().changes, p: fixture().people, l: fixture().reportingLines });
  const after = JSON.stringify({ c: first.draft.changes, p: first.draft.people, l: first.draft.reportingLines });
  assert.equal(before, after, 'the register read, asked, and changed nothing else');
  // Clear the findings and the asks close themselves with the reason on the task.
  const cleared = first.draft;
  cleared.changeSaturationActs = [];
  cleared.changeSaturationCeilings = [];
  const closedRun = runRule(cleared);
  assert.equal(closedRun.draft.delegations.filter((d) => d.status === 'active').length, 0);
  assert.equal(closedRun.draft.delegations.filter((d) => d.status === 'done').length, 2);
  for (const task of closedRun.draft.delegations) {
    assert.ok(task.completionNote.startsWith(`${CHANGE_SATURATION_CLOSED_PREFIX} `), 'the close says which rule closed it and why');
  }
  assert.match(closedRun.out[0].summary, /Closed 2 change-saturation ask\(s\)/);
});

test('an ambiguous apex is observed and counted — nobody is substituted as the owner of a cross-line sum', () => {
  const state = fixture();
  // Two incomparable apexes: Ann and Bob both answer to nobody.
  state.people = state.people.map((p) => (p.id === 'ceo' ? { ...p, status: 'archived' } : p));
  const { draft, out } = runRule(normalizeState(state, { now: NOW }).state);
  assert.equal(asksOf(draft).length, 0, 'no ask is issued to a seat nobody named');
  const observations = draft.changeSaturationMarkers.filter((m) => m.kind === 'observation');
  assert.ok(observations.length >= 1, 'the finding is recorded as observed, not dropped');
  assert.match(observations[0].summary, /Nobody was substituted/);
  assert.ok(out.some((e) => e.action === 'observed'), 'and the effect line says so');
});

test('the rule is inert with nobody on the roster, and honours the automation switch on ordinary writes', () => {
  const empty = createEmptyState(NOW.toISOString());
  empty.settings = { ...empty.settings, leaderName: 'Riley Lead', activeSeatId: null };
  const { draft, out } = runRule(normalizeState(empty, { now: NOW }).state);
  assert.deepEqual(out, [], 'no people, no finding, no ask');
  assert.equal(draft.delegations.length, 0);
  assert.equal(draft.changeSaturationMarkers.length, 0);
  // The switch off: an ordinary write silences the register…
  const off = fixture({ settings: { changeSaturationAutoPropagate: false } });
  assert.equal(off.settings.changeSaturationAutoPropagate, false, 'the convention is carried through the loader');
  const silenced = runRule(off, { event: 'person.updated' });
  assert.deepEqual(silenced.out, [], 'the register writes nothing while the switch is off');
  assert.equal(silenced.draft.changeSaturationMarkers.length, 0);
  // …but an explicit scan still runs, so a pause can never hide the load.
  const scanned = runRule(off);
  assert.equal(asksOf(scanned.draft).length, 2, 'the operator asked, so the register answered');
  const board = read(off);
  assert.equal(board.totals.actsReadN, 6);
  assert.equal(byId(board.people, 'kim').state, 'saturated');
});

test('an ordinary, unrelated event type does not wake the register at all', () => {
  const { draft, out } = runRule(fixture(), { event: 'goal.updated' });
  assert.deepEqual(out, []);
  assert.equal(draft.delegations.length, 0);
  assert.equal(draft.changeSaturationMarkers.length, 0, 'a rule that ran on every event would be noise; this one is a trigger list');
});

test('the asks reach the seat through the store, end to end', () => {
  const { store, api } = seed(fixture({ acts: [], ceilings: [] }));
  const result = api.changeSaturationDeclareDemand({
    changeId: 'chg-a', personId: 'kim', lineKey: 'home:kim', band: 5, fromOn: '2026-11-01', toOn: '2026-11-13',
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(store.state.changeSaturationActs.length, 1);
  assert.deepEqual(store.state.changeSaturationCeilings.length, 0);
  // kim is now charged 5 with no ceiling in force anywhere → `ceilings-missing`.
  const board = read(store.state);
  assert.equal(byId(board.people, 'kim').state, 'no-ceiling');
  assert.equal(board.claims.ceilingsDeclared, false);
  assert.equal(board.claims.loadObserved, true);
  const ask = store.state.delegations.find((d) => d.status === 'active');
  assert.ok(ask, 'the commit that declared the demand also delivered the ask');
  assert.equal(ask.personId, 'ceo', 'the apex of the line holders, not the person carrying the change');
  assert.match(ask.title, /Declare the change capacity you intend to hold/);
  assert.equal(store.state.changeSaturationMarkers.filter((m) => m.kind === 'ask').length, 1);
});

/* ------------------------------------------------------------ 8. seat scoping */

test('a manager may declare down a line they hold and may not speak for a counterpart', () => {
  // A clear ledger: chg-b names kim, kim's home line is Ann's and her project line
  // is Bob's, and Bob has already declared his own weight for it.
  const base = fixture({ acts: [demand('b1', 'chg-b', 'kim', 'p-kim', 3, '2026-11-02', '2026-11-10')], ceilings: [] });
  const { api, store } = seed({ ...base, settings: { ...base.settings, activeSeatId: 'ann' } });
  const ok = api.changeSaturationDeclareDemand({
    changeId: 'chg-b', personId: 'kim', lineKey: 'home:kim', band: 2, fromOn: '2026-11-06', toOn: '2026-11-18',
  });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(store.state.changeSaturationActs.length, 2, 'both lines have now stated their own weight for one impact');
  const overTheLine = api.changeSaturationDeclareDemand({
    changeId: 'chg-a', personId: 'kim', lineKey: 'p-kim', band: 2, fromOn: '2026-11-06', toOn: '2026-11-18',
  });
  assert.equal(overTheLine.ok, false);
  assert.match(overTheLine.error, /line you hold/);
  assert.equal(api.changeSaturationDeclareDemand({
    changeId: 'chg-b', personId: 'kim', lineKey: 'home:kim', band: 4, fromOn: '2026-11-06', toOn: '2026-11-18',
  }).ok, false, 'a line states one demand per change: it withdraws first rather than quietly changing its mind');
  assert.equal(store.state.changeSaturationActs.length, 2, 'the refusals wrote nothing');
  // Ann may cap her own pool forward; she may not cap Bob's, and may not withdraw
  // a demand her line never declared.
  assert.equal(api.changeSaturationDeclareCeiling({ scope: 'pool', subjectId: 'bob', units: 5, fromOn: '2026-12-01', toOn: '2026-12-31' }).ok, false);
  assert.equal(api.changeSaturationDeclareCeiling({ scope: 'pool', subjectId: 'ann', units: 5, fromOn: '2026-12-01', toOn: '2026-12-31' }).ok, true);
  assert.equal(api.changeSaturationWithdrawDemand('b1', 'This belongs to the project line, not to me, and never did.').ok, false);
  assert.equal(api.changeSaturationWithdrawDemand('csa-1', 'Declared against the wrong window; the project line owns it.').ok, true);
  // Her own read is scoped to her span and named at her rank.
  const board = api.changeSaturationReport().report;
  assert.equal(board.scope, 'seat');
  assert.ok(board.people.length >= 1, 'the person she manages is readable to her');
  assert.ok(board.people.every((row) => ['kim', 'ria', 'tom'].includes(row.personId)), 'nobody outside her subtree is listed');
});

test('a rank-2 seat reads the board as counts without names, and is told why', () => {
  // Ann is declared at `manager` rank 2: below the register's disclosure floor of
  // rank 3, her rows come back with their figures and no identities, and the
  // reason is printed rather than hidden. Rank 1 is the same story one rung down.
  const state = fixture({ seat: 'ann' });
  state.people = state.people.map((p) => (p.id === 'ann' ? { ...p, level: 'manager' } : p));
  const { api } = seed(normalizeState(state, { now: NOW }).state);
  const result = api.changeSaturationReport();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.seat.rank, 2);
  assert.equal(result.seat.detailLevel, 'span', 'rank 2 is above `none` and below `full`');
  const board = result.report;
  assert.ok(board.people.length >= 1, 'the people in her span are still counted');
  for (const row of board.people) {
    assert.equal(row.personId, null, 'not even a record id survives the ladder');
    assert.equal(row.name, 'withheld at this disclosure level', 'the row is de-identified, never deleted');
    assert.equal(row.demandLines.every((line) => line.managerName === null), true, 'no counterpart manager leaks through the line list');
    assert.equal(typeof row.demandsN, 'number', 'the counts survive the redaction');
    assert.equal(row.ceilingIds.length, 0, 'and the ceiling rows are not handed out as ids');
  }
  assert.match(board.detailReason, /no others/);
  assert.ok(board.pools.length >= 1 && board.pools.every((row) => row.managerName === 'withheld at this disclosure level'), 'pools lose their manager too');
  assert.ok(board.clearances.every((row) => row.personName === 'withheld at this disclosure level'), 'clearances lose the person');
  assert.ok(board.candidates.every((row) => row.personName === 'withheld at this disclosure level'), 'and so do the candidates');
  assert.ok(board.ceilings.every((row) => row.subjectId === null), 'a ceiling row is not an identity either');
  assert.equal(typeof board.totals.actsReadN, 'number', 'the workspace totals are not a privilege');
});

test('conventions refuse an out-of-bounds value instead of clamping it', () => {
  const { api, store } = seed(fixture());
  const refused = api.changeSaturationSetConventions({ changeSaturationWindowDays: 5 });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /14 to 365/);
  assert.match(refused.error, /Nothing was clamped and nothing was saved/);
  assert.equal(api.changeSaturationSetConventions({ changeSaturationMaxPeaks: 3 }).ok, false, 'no convention nobody declared');
  assert.equal(api.changeSaturationSetConventions({ changeSaturationWindowDays: '90' }).ok, false, 'a numeral-as-string is not a day count');
  const done = api.changeSaturationSetConventions({ changeSaturationWindowDays: 30, changeSaturationMinPoolN: 4 });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(store.state.settings.changeSaturationWindowDays, 30);
  const board = read(store.state);
  assert.equal(board.window.days, 30);
  assert.equal(board.window.fromISO, '2026-10-15', '30 days back from the reading day, inclusive of both ends');
  assert.equal(board.pools.find((row) => row.managerId === 'ann').state, 'pool-below-floor', 'the floor is honoured on read too: three people is now below four');
  assert.equal(api.changeSaturationSetConventions({ changeSaturationWindowDays: 30 }).ok, false, 'a no-op convention write is refused, not sealed as a change');
  assert.equal(api.changeSaturationSetConventions({ changeSaturationMinPoolN: 0 }).ok, false, 'a floor of zero would turn a pool statistic into a name');
});

test('a read refuses rather than guessing when the seat is unresolved and the operator view is off', () => {
  const state = fixture();
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const store = createStore({ storage, now: () => NOW, idFactory: (prefix) => `${prefix}-u` });
  store.load();
  store.update((draft) => {
    draft.settings = { ...draft.settings, activeSeatId: 'ghost-seat', operatorViewEnabled: false };
  }, { type: 'person.updated', entity: 'person', entityId: 'kim', summary: 'Broke the seat on purpose.' });
  const api = guardApi(createApi(store, { now: () => NOW, idFactory: (p) => `${p}-v` }), store, { now: () => NOW.getTime() });
  const result = api.changeSaturationReport();
  assert.equal(result.ok, false, 'an unresolved seat is refused, never silently widened to the whole workspace');
  assert.match(result.error, /seat/);
});

/* --------------------------------------------------------- 9. migration, panel */

test('147 → 148 is additive: three EMPTY collections, four conventions, nothing invented', () => {
  const v147 = {
    schemaVersion: 147,
    people: [person('kim', 'Kim Builder', null)],
    changes: [change('chg-a', 'A change', 'active', ['kim'])],
    reportingLines: [],
    settings: { leaderName: 'Old', activeSeatId: null },
  };
  const next = MIGRATIONS[147](v147);
  // MIGRATION 147 → 148 stops at 148 by definition; the head is 149 after ADR-0188.
  assert.equal(next.schemaVersion, 148);
  assert.deepEqual(next.changeSaturationActs, []);
  assert.deepEqual(next.changeSaturationCeilings, []);
  assert.deepEqual(next.changeSaturationMarkers, []);
  assert.equal(next.settings.changeSaturationWindowDays, 90);
  assert.equal(next.settings.changeSaturationMinPoolN, 3);
  assert.equal(next.settings.changeSaturationAskDueDays, 14);
  assert.equal(next.settings.changeSaturationAutoPropagate, true, 'the automation switch is on, like its siblings');
  assert.deepEqual(next.changes, v147.changes, 'no change record was touched');
  assert.deepEqual(next.people, v147.people, 'no person record was touched');
  const board = buildChangeSaturation(normalizeState(next, { now: NOW }).state, { now: NOW, settings: next.settings });
  assert.equal(board.totals.actsTotalN, 0, 'an upgraded workspace has nothing to charge and says so');
  assert.equal(board.claims.loadObserved, false);
  assert.match(changeSaturationBriefText(board), /Nothing declared in the window; the candidate list is the gap/);
  assert.deepEqual(board.totals.stateCounts, { unreadable: 0, contested: 0, 'no-ceiling': 0, saturated: 0, 'at-limit': 0, within: 0 });
});

test('the settings survive a reload: every convention the panel prints is one the loader carries', () => {
  const state = fixture();
  const reloaded = normalizeState(JSON.parse(JSON.stringify(state)), { now: NOW }).state;
  for (const key of ['changeSaturationWindowDays', 'changeSaturationMinPoolN', 'changeSaturationAskDueDays', 'changeSaturationAutoPropagate']) {
    assert.equal(reloaded.settings[key], state.settings[key], `${key} is not dropped on load`);
  }
  assert.deepEqual(read(reloaded).totals, read(state).totals, 'and the whole board is identical across the reload');
});

test('the panel prints the read model’s own figures, with a real diagram and no console error', () => {
  const board = read(fixture());
  withDom((dom) => {
    const errors = [];
    dom.window.console.error = (...args) => errors.push(args.join(' '));
    const container = dom.window.document.createElement('div');
    const ctx = {
      state: { settings: fixture().settings },
      api: { changeSaturationReport: () => ({ ok: true, report: board }) },
      toast: () => {},
    };
    container.appendChild(renderMatrixChangeSaturationPanel(ctx));
    const text = container.textContent;
    assert.deepEqual(errors, [], 'no console error while rendering');
    assert.ok(text.includes('Kim Builder'), 'the person the record names is printed');
    assert.ok(text.includes('Ann Func') && text.includes('Bob Project'), 'both lines that put work on kim are named');
    assert.ok(/Over declared capacity/.test(text), 'the saturated verdict is labelled in words, not colour alone');
    assert.ok(/No capacity declared/.test(text), 'tom’s refusal is a row of its own');
    assert.ok(/Declarations disagree/.test(text), 'the contested label is printed, not folded into “over”');
    assert.ok(/unjudged/.test(text), 'days the register could not judge are printed as unjudged');
    assert.ok(text.includes('7'), 'kim’s peak day is the computed 7');
    assert.ok(!text.includes('1167'), 'a raw per-mille is not printed as reassurance');
    const img = container.querySelector('img[data-testid="change-saturation-diagram"]');
    assert.ok(img, 'the method diagram is rendered, not a placeholder block');
    assert.equal(img.getAttribute('src'), './app/assets/change-saturation.jpg');
    assert.ok(img.getAttribute('alt').length > 60, 'the diagram carries a real description for a screen reader');
    assert.ok(img.getAttribute('loading') === 'lazy' && img.getAttribute('width') === '1100', 'with explicit sizing so the layout does not jump');
  });
});

test('the panel refuses to render a board the seat cannot read, and says so', () => {
  withDom((dom) => {
    const container = dom.window.document.createElement('div');
    const node = renderMatrixChangeSaturationPanel({
      state: {},
      api: { changeSaturationReport: () => ({ ok: false, error: 'The operating seat is unresolved.' }) },
      toast: () => {},
    });
    container.appendChild(node);
    assert.match(container.textContent, /could not be read/);
    assert.match(container.textContent, /The operating seat is unresolved/);
  });
});
