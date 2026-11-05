/**
 * tests/app/aggregate-determinacy.test.mjs — ADR-0091: exact recoverability of a
 * withheld aggregate cell.
 *
 * The claims this suite makes, in order:
 *   1. THE ORACLE. Given a published surface (printed cells, printed totals, the
 *      integer box each withheld cell must live in), the audit names every
 *      withheld value that is recoverable by arithmetic — including the pattern
 *      the shipped code actually produced: one sub-floor cell, one printed cell,
 *      a printed total. That pattern is a 2-line subtraction, and the oracle
 *      calls it what it is.
 *   2. THE FIX. `moduleAggregate` never ships that pattern. Either a second cell
 *      is withheld with it or the total is withheld; in both cases the printed
 *      surface determines nothing.
 *   3. BOX SATURATION. Three cells withheld at 4 against a floor of 5 and a
 *      printed total of 12 are all exactly 4. No complementary suppression can
 *      fix that, so the total is withheld instead — the case a counting rule
 *      cannot see.
 *   4. A DETERMINED ZERO IS NOT A DISCLOSURE, so a table is not over-suppressed
 *      to hide the fact that nobody was overdue.
 *   5. The audit does not trust the planner: an unsafe pattern handed to it
 *      directly is still reported unsafe.
 *   6. Every aggregate on every route at four altitudes compiles with
 *      `guard.recoverableN === 0`, and the console and the brief print that
 *      verdict rather than asserting it silently.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { moduleAggregate, disclosureReport, disclosureBriefText } from '../../app/core/domain/disclosure.js';
import {
  auditAggregateSuppression,
  groupDeterminacy,
  planAggregateSuppression,
  determinacyLine,
  DETERMINACY_VERDICTS,
} from '../../app/core/domain/aggregateDeterminacy.js';
import { renderDisclosure } from '../../app/views/disclosure.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');
const ago = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);
const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * A director with three spans under them and a known case distribution, so the
 * published table is fully determined by the arguments.
 *   lead1 ← ic1, ic2   (the big span)
 *   lead2 ← ic3        (a second span)
 *   lead3 ← ic4        (the span nobody should be able to count)
 */
function fixture({ lead1 = 6, lead2 = 0, lead3 = 1, floor = 5, seatId = 'dir1' } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Root',
    activeSeatId: seatId,
    chainLeaderAltitude: 'chief',
    disclosureCellFloor: floor,
  };
  state.people = [
    { id: 'vp1', name: 'Rina Vee', role: 'VP', level: 'vp', managerId: null, status: 'active' },
    { id: 'dir1', name: 'Sam Dee', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'lead1', name: 'Priya Ell', role: 'Shift lead', level: 'lead', managerId: 'dir1', status: 'active' },
    { id: 'ic1', name: 'Ari One', role: 'Operator', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Bo Two', role: 'Operator', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'lead2', name: 'Jordan Ell', role: 'Shift lead', level: 'lead', managerId: 'dir1', status: 'active' },
    { id: 'ic3', name: 'Cy Three', role: 'Operator', level: 'ic', managerId: 'lead2', status: 'active' },
    { id: 'lead3', name: 'Kim Ell', role: 'Shift lead', level: 'lead', managerId: 'dir1', status: 'active' },
    { id: 'ic4', name: 'Dee Four', role: 'Operator', level: 'ic', managerId: 'lead3', status: 'active' },
  ];
  const cases = [];
  const add = (ownerId, n, severity) => {
    for (let i = 0; i < n; i += 1) {
      cases.push({
        id: `c-${ownerId}-${i}`,
        title: `Work item ${cases.length + 1}`,
        status: 'open',
        ownerId,
        involvedPersonIds: [],
        openedOn: ago(10),
        fmea: { severity },
      });
    }
  };
  // lead1's operators share the big span; ic1 owns every case so the split
  // between ic1 and ic2 cannot inflate the bucket count.
  add('ic1', lead1, 8);
  add('ic3', lead2, 7);
  add('ic4', lead3, 9);
  state.cases = cases;
  return normalizeState(state, { now: NOW }).state;
}

function bootStore(state) {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now: () => NOW, idFactory: (prefix) => `${prefix}-t-${map.size}` });
  store.load();
  return store;
}

function seated(state, seatId) {
  const next = clone(state);
  next.settings = { ...next.settings, activeSeatId: seatId };
  return normalizeState(next, { now: NOW }).state;
}

function aggregate(state, route = 'cases') {
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  return { agg: moduleAggregate(state, route, activeSeat(built), built, { now: NOW, settings: state.settings }), built };
}

/** What a reader can actually do with the printed table. */
function subtraction(state) {
  const { agg } = aggregate(state);
  const printed = agg.spans.filter((span) => !span.withhold).reduce((sum, span) => sum + span.count, 0);
  const withheld = agg.spans.filter((span) => span.withhold);
  return {
    agg,
    printed,
    withheld,
    recoverableBySubtraction: agg.spanTotal === null ? null : agg.spanTotal - printed,
  };
}

/* -------------------------------------------------------- 1. the oracle */

test('the oracle names the value the shipped rule used to hand back', () => {
  // The exact surface the old aggregate produced for a director with one big
  // span and one sub-floor span: the big cell printed, the small cell blanked,
  // the total printed, no complementary suppression.
  const surface = {
    cells: [
      { key: 'lead1', count: 6, open: 6, overdue: 0 },
      { key: 'lead3', count: 1, open: 1, overdue: 0 },
    ],
    totals: { count: 7, open: 7, overdue: 0 },
  };
  const unsafe = auditAggregateSuppression({ ...surface, withheld: ['lead3'], floor: 5 });
  assert.equal(unsafe.safe, false);
  // Both the count and the derived open load are pinned exactly, and the oracle
  // reports the coordinate without printing the value as a public figure.
  const pinned = unsafe.recoverable.filter((row) => row.key === 'lead3').map((row) => row.measure).sort();
  assert.deepEqual(pinned, ['count', 'open']);
  assert.equal(unsafe.recoverable.find((row) => row.measure === 'count').lo, 1);
  assert.equal(unsafe.recoverable.find((row) => row.measure === 'count').hi, 1);

  // And the naive subtraction a reader would do reaches the same number.
  assert.equal(surface.totals.count - surface.cells[0].count, 1);

  // One more hidden cell makes the same subtraction useless.
  const safe = auditAggregateSuppression({ ...surface, withheld: ['lead3', 'lead1'], floor: 5 });
  assert.equal(safe.safe, true);
  assert.equal(safe.recoverableN, 0);
});

test('the audit is independent of the planner, and inconsistency is refused rather than resolved', () => {
  const inconsistent = auditAggregateSuppression({
    cells: [
      { key: 'a', count: 6, open: 6, overdue: 0 },
      { key: 'b', count: 1, open: 1, overdue: 0 },
    ],
    totals: { count: 4, open: 0, overdue: 0 },
    withheld: ['b'],
    floor: 5,
  });
  assert.equal(inconsistent.safe, false);
  assert.ok(inconsistent.inconsistent.some((row) => row.reason === 'published-total-outside-box'));
});

/* ----------------------------------------------------------- 2. the fix */

test('the shipped aggregate never hands a withheld cell back by subtraction', () => {
  // Exactly the table that used to leak: one 6-record span, one 1-record span.
  const state = seated(fixture({ lead1: 6, lead2: 0, lead3: 1 }), 'dir1');
  const { agg, printed, withheld, recoverableBySubtraction } = subtraction(state);
  assert.equal(withheld.length > 0, true, 'the sub-floor span is withheld');
  assert.equal(agg.guard.recoverableN, 0, 'the guard proves nothing is recoverable');
  assert.equal(agg.guard.checkedMeasures.length > 0 || agg.spanTotal === null, true);
  if (agg.spanTotal !== null) {
    // With a total printed, subtraction is the attack — so it must leave at
    // least two unknowns, never one.
    assert.ok(withheld.length >= 2, `a printed total next to ${withheld.length} hidden cell(s) is a subtraction`);
    assert.equal(recoverableBySubtraction, agg.spanTotal - printed);
  } else {
    assert.equal(recoverableBySubtraction, null, 'no total is printed, so there is nothing to subtract');
  }
  assert.ok(agg.notes.some((note) => /no withheld cell is recoverable/i.test(note)), 'the table says so');
  assert.match(agg.guard.line, /no withheld cell is recoverable/i);
});

test('complementary suppression keeps the total and hides the smallest printed cell', () => {
  // Three spans, one below the floor: the cheapest safe table keeps its total.
  const state = seated(fixture({ lead1: 6, lead2: 7, lead3: 2 }), 'dir1');
  const { agg } = subtraction(state);
  assert.notEqual(agg.spanTotal, null);
  assert.equal(agg.complementary, true);
  assert.ok(agg.spans.filter((span) => span.withhold).length >= 2);
  assert.equal(agg.guard.recoverableN, 0);
  assert.ok(agg.spans.some((span) => /complementary/i.test(span.withholdReason || '')));
});

test('box saturation withholds the total: no complementary cell can help three 4s', () => {
  const plan = planAggregateSuppression({
    cells: [
      { key: 'a', count: 4, open: 4, overdue: 0 },
      { key: 'b', count: 4, open: 4, overdue: 0 },
      { key: 'c', count: 4, open: 4, overdue: 0 },
    ],
    totals: { count: 12, open: 12, overdue: 0 },
    floor: 5,
  });
  assert.equal(plan.verdict, DETERMINACY_VERDICTS.TOTALS_WITHHELD);
  assert.deepEqual(plan.withholdTotals.sort(), ['count', 'open']);
  assert.ok(plan.notes.some((note) => /withheld/i.test(note)));
  const proof = auditAggregateSuppression({
    cells: [
      { key: 'a', count: 4, open: 4, overdue: 0, why: 'floor' },
      { key: 'b', count: 4, open: 4, overdue: 0, why: 'floor' },
      { key: 'c', count: 4, open: 4, overdue: 0, why: 'floor' },
    ],
    totals: { count: 12, open: 12, overdue: 0 },
    withheld: ['a', 'b', 'c'],
    floor: 5,
  });
  assert.equal(proof.recoverableN > 0, true, 'the total really does pin all three');
});

test('the same table without a printed total is left alone instead of over-suppressed', () => {
  const plan = planAggregateSuppression({
    cells: [
      { key: 'a', count: 4, open: 0, overdue: 0 },
      { key: 'b', count: 4, open: 0, overdue: 0 },
      { key: 'c', count: 4, open: 0, overdue: 0 },
    ],
    totals: { count: null, open: null, overdue: null },
    floor: 5,
  });
  assert.deepEqual(plan.suppress.sort(), ['a', 'b', 'c'], 'only the floor decides');
  assert.deepEqual(plan.added, [], 'no cell is hidden to buy nothing');
  assert.deepEqual(plan.withholdTotals, []);
});

/* ------------------------------------------------ 3. a zero is not a secret */

test('a value pinned to zero is not counted as recoverable', () => {
  const pinnedZero = groupDeterminacy({
    totalValue: 0,
    members: [{ key: 'a', measure: 'overdue', withheld: true, lo: 0, hi: 4, why: 'floor' }],
  });
  assert.equal(pinnedZero.resolved[0].lo, 0);
  assert.equal(pinnedZero.resolved[0].recoverable, false);
  assert.equal(pinnedZero.recoverable.length, 0);

  // And the planner does not hide a partner to protect "nobody was overdue".
  const plan = planAggregateSuppression({
    cells: [
      { key: 'a', count: 6, open: 0, overdue: 0 },
      { key: 'b', count: 1, open: 0, overdue: 0 },
    ],
    totals: { count: null, open: 0, overdue: 0 },
    floor: 5,
  });
  assert.deepEqual(plan.added, [], 'an all-zero derived total protects nothing worth hiding');
});

/* ------------------------------------------------------- 4. every altitude */

test('every aggregate at every altitude compiles with zero recoverable cells', () => {
  const base = fixture({ lead1: 6, lead2: 7, lead3: 2 });
  for (const seatId of ['lead1', 'lead2', 'lead3', 'dir1', 'vp1']) {
    const state = seated(base, seatId);
    const built = buildSeats(state, { now: NOW, settings: state.settings });
    const report = disclosureReport(state, { now: NOW, settings: state.settings, seat: activeSeat(built), built });
    assert.ok(report.aggregates.length > 0, `${seatId} compiles at least one aggregate`);
    for (const agg of report.aggregates) {
      assert.equal(agg.guard.recoverableN, 0, `${seatId}/${agg.route}: ${agg.guard.line}`);
      assert.equal(agg.guard.inconsistentN, 0, `${seatId}/${agg.route}: a total disagreed with its cells`);
      // The verdict is a sentence, not a boolean, and the screen can print it.
      assert.ok(agg.guard.line.length > 20);
    }
  }
});

test('the brief carries the determinacy verdict, and says when it cannot', () => {
  const state = seated(fixture({ lead1: 6, lead2: 7, lead3: 2 }), 'dir1');
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const report = disclosureReport(state, { now: NOW, settings: state.settings, seat: activeSeat(built), built });
  const brief = disclosureBriefText(report, { at: '2026-11-04' });
  assert.match(brief, /Determinacy:|nothing to recover/);
  assert.ok(!/undefined|NaN/.test(brief), 'the brief never prints a broken figure');
});

/* ------------------------------------------------------------- 5. console */

test('the console shows the withheld count beside the recoverable count', async () => {
  const state = seated(fixture({ lead1: 6, lead2: 7, lead3: 2 }), 'dir1');
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const seat = activeSeat(built);
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node; globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Event = dom.window.Event;
  const store = bootStore(state);
  const node = renderDisclosure({
    state: store.state,
    seatContext: { seat, built },
    now: NOW,
    route: 'disclosure',
    query: new URLSearchParams('panel=posture'),
    api: createApi(store, { now: () => NOW }),
    navigate: () => {},
    refresh: () => {},
  });
  document.getElementById('view').replaceChildren(node);
  const text = node.textContent;
  assert.match(text, /recoverable by subtraction/i);
  assert.ok(!/TODO|lorem|placeholder/i.test(text));

  // The line the module produces is the line the console prints.
  const { agg } = subtraction(state);
  assert.equal(agg.guard.recoverableN, 0);
  assert.match(determinacyLine({ ...agg.guard, suppress: ['x'], recoverableN: 0, checkedMeasures: agg.guard.checkedMeasures }), /no withheld cell is recoverable/);
});
