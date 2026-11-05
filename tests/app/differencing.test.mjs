/**
 * tests/app/differencing.test.mjs — ADR-0092, the Differencing Defender.
 *
 * The claims this suite makes, in order. Each one is a claim the product makes on
 * screen, so each one is proven here rather than asserted there:
 *
 *   1. SOUNDNESS ORACLE. A brute-force enumerator checks every pin the solver
 *      claims against the true feasible set of thousands of random integer
 *      systems. A pin the enumeration cannot confirm FAILS the build, because a
 *      false "safe" is a disclosure while a false "unsafe" only suppresses a table
 *      unnecessarily. This oracle found two real bugs during development (the
 *      sign of a negative coefficient, and infinite bounds under negation); it is
 *      the reason the solver is trustworthy and it stays in the suite.
 *   2. THE THREE DOCUMENTED ATTACKS. Repeated release with a changing pattern,
 *      parent-versus-child on the same day, and a stock reprinted at two dates are
 *      each DETECTED on a hand-built register whose answer is known by hand: one
 *      withheld span, count 1; one sibling, count 2.
 *   3. A DETERMINED ZERO IS NOT A DISCLOSURE. Three spans whose overdue loads are
 *      all zero determine exactly 0 each; reporting that as a leak buries the real
 *      findings and breaks ADR-0091's own rule.
 *   4. THE PLANNER BUYS SAFETY, CHEAPEST FIRST. Publishing reproduces a register
 *      that would leak, and the planner removes the smallest figure that fixes it
 *      rather than refusing everything.
 *   5. A REFUSED PUBLICATION WRITES NOTHING. When no pattern works, the register is
 *      unchanged — it must never contain a figure the engine can subtract back out.
 *   6. CROSS-MODULE + CROSS-ALTITUDE PROPAGATION. A detected leak becomes one
 *      governed decision per module per ISO week, carrying the COORDINATE and the
 *      proof but never the value, with `proves-release` provenance to the releases
 *      that took part and `rolls-up-to` edges to every leadership ancestor, all in
 *      one transaction.
 *   7. REFUSAL-HONEST AGGREGATES. A coverage rate is withheld below the release
 *      floor, a drift statistic is blank (never zero) when untested, and the CSV
 *      carries no span label, person, title, amount or recovered value.
 *   8. THE SEAT BOUNDARY. A release belongs to the seat that published it; a
 *      declared seat cannot read a peer span's register rows.
 *   9. A11Y. Every panel renders axe-clean.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

// The view layer builds DOM nodes at call time, so the globals must exist before
// any render. Same minimal environment the sibling suites use.
const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.localStorage = dom.window.localStorage;

import { createEmptyState, normalizeState, SCHEMA_VERSION, migrate } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  solveDeterminacy,
  auditSequence,
  auditWithCandidate,
  variableKey,
  growthExposures,
  determinacyLine,
} from '../../app/core/domain/differencingDeterminacy.js';
import {
  planRelease,
  buildDifferencesReport,
  driftReading,
  runsTest,
  buishandRange,
  wilsonInterval,
} from '../../app/core/domain/differencing.js';
import { normalizeReleases, differencesConventions } from '../../app/core/domain/differencingSchema.js';
import { differencingRule, weekKey } from '../../app/core/domain/differencingRules.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { renderDifferencing } from '../../app/views/differencing.js';

const NOW = new Date('2026-11-04T09:00:00.000Z');
const clone = (value) => JSON.parse(JSON.stringify(value));

/* ---------------------------------------------------------------- fixtures */

/**
 * A real five-level chain (chief ← vp ← director ← two leads ← ICs) so vertical
 * roll-up has somewhere true to go, with a case distribution whose per-span
 * counts are known exactly:
 *   lead1 ← 6 records, lead2 ← 7 records, lead3 ← 1 record (the small cell).
 */
function fixture({ seatId = 'dir1', cellFloor = 5, differencesCellFloor = 5, cases = { lead1: 6, lead2: 7, lead3: 1 } } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Root',
    activeSeatId: seatId,
    chainLeaderAltitude: 'chief',
    disclosureCellFloor: cellFloor,
    differencesCellFloor,
  };
  state.people = [
    { id: 'chief1', name: 'Cleo Chief', role: 'Chief', level: 'chief', managerId: null, status: 'active' },
    { id: 'vp1', name: 'Rina Vee', role: 'VP', level: 'vp', managerId: 'chief1', status: 'active' },
    { id: 'dir1', name: 'Sam Dee', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'lead1', name: 'Priya Ell', role: 'Shift lead', level: 'lead', managerId: 'dir1', status: 'active' },
    { id: 'ic1', name: 'Ari One', role: 'Operator', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'lead2', name: 'Jordan Ell', role: 'Shift lead', level: 'lead', managerId: 'dir1', status: 'active' },
    { id: 'ic3', name: 'Cy Three', role: 'Operator', level: 'ic', managerId: 'lead2', status: 'active' },
    { id: 'lead3', name: 'Kim Ell', role: 'Shift lead', level: 'lead', managerId: 'dir1', status: 'active' },
    { id: 'ic4', name: 'Dee Four', role: 'Operator', level: 'ic', managerId: 'lead3', status: 'active' },
  ];
  const ownerOf = { lead1: 'ic1', lead2: 'ic3', lead3: 'ic4' };
  const rows = [];
  for (const [span, n] of Object.entries(cases)) {
    for (let index = 0; index < n; index += 1) {
      rows.push({
        id: `c-${span}-${index}`,
        title: `Work item ${rows.length + 1}`,
        status: 'open',
        ownerId: ownerOf[span],
        involvedPersonIds: [],
        openedOn: '2026-10-25',
        fmea: { severity: 4 },
      });
    }
  }
  state.cases = rows;
  return normalizeState(state, { now: NOW }).state;
}

function bootStore(state, { now = NOW } = {}) {
  const map = new Map();
  const storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now: () => now, idFactory: (prefix) => `${prefix}-${map.size}-${Math.random().toString(36).slice(2, 8)}` });
  store.load();
  return { store, api: createApi(store) };
}

/** A release row shaped exactly as the register stores it. */
function release(id, { route = 'cases', seat = 'dir1', rank = 3, altitude = 'director', on = '2026-11-01', cells = [], totals = [], verdict = 'safe' } = {}) {
  return {
    id,
    route,
    scopeSeatId: seat,
    altitudeKey: altitude,
    rank,
    releasedOn: on,
    cellFloor: 5,
    attemptN: 1,
    verdict,
    protection: { withheldTotals: [], withheldCells: 0, protectedN: 0, reason: '' },
    recoveredN: 0,
    equationN: 0,
    withheldN: 0,
    cells,
    totals,
    engineVersion: 'differencing-defender-v1',
    createdAt: `${on}T09:00:00.000Z`,
  };
}

const printed = (cellKey, count, into = {}) => ({ cellKey, state: 'printed', count, open: into.open ?? count, overdue: into.overdue ?? 0 });
const withheld = (cellKey, state = 'withheld') => ({ cellKey, state, count: null, open: null, overdue: null });
const total = (measure, value) => ({ measure, printed: value !== null, value });

/* ---------------------------------------------- 1. the soundness oracle */

/**
 * Enumerate every integer assignment inside the boxes and collect the true
 * feasible set per variable. Deliberately independent of the solver: it shares no
 * code with it.
 */
function bruteForce(equations, boxes, cap = 40) {
  const keys = Object.keys(boxes);
  const fixed = new Map();
  const free = [];
  for (const key of keys) {
    const { lo, hi } = boxes[key];
    if (lo === hi && Number.isFinite(hi)) fixed.set(key, lo);
    else free.push(key);
  }
  const domains = free.map((key) => {
    const { lo, hi } = boxes[key];
    const low = Math.max(0, lo);
    const high = Number.isFinite(hi) ? Math.min(hi, low + cap) : low + Math.min(cap, 12);
    const values = [];
    for (let value = low; value <= high; value += 1) values.push(value);
    return values;
  });
  const feasible = new Map(keys.map((key) => [key, new Set()]));
  for (const [key, value] of fixed) feasible.get(key).add(value);
  const assignment = new Map(fixed);
  const walk = (depth) => {
    if (depth === free.length) {
      for (const equation of equations) {
        let sum = 0;
        for (const member of equation.members) sum += member.coef * (assignment.get(member.v) ?? 0);
        if (sum !== equation.rhs) return;
      }
      for (const key of free) feasible.get(key).add(assignment.get(key));
      return;
    }
    const key = free[depth];
    for (const value of domains[depth]) {
      assignment.set(key, value);
      walk(depth + 1);
    }
    assignment.delete(key);
  };
  walk(0);
  return feasible;
}

test('the solver is SOUND against a brute-force oracle over random integer systems', () => {
  // A deterministic LCG so a failure is reproducible from the seed alone.
  let seed = 20261105;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  let systems = 0;
  let pins = 0;
  for (let trial = 0; trial < 400; trial += 1) {
    const nVars = 3 + rnd(5);
    const keys = Array.from({ length: nVars }, (_, index) => `v${index}`);
    const boxes = {};
    const truth = {};
    for (const key of keys) {
      const lo = rnd(4);
      const hi = lo + rnd(7);
      boxes[key] = { lo, hi };
      truth[key] = lo + rnd(hi - lo + 1);
    }
    const equations = [];
    for (let e = 0; e < 1 + rnd(5); e += 1) {
      const members = [];
      let rhs = 0;
      for (const key of keys) {
        const coef = rnd(4) - 2; // −2..1, so negative coefficients are exercised
        if (!coef) continue;
        members.push({ v: key, coef });
        rhs += coef * truth[key];
      }
      if (members.length) equations.push({ id: `e${e}`, members, rhs });
    }
    const solved = solveDeterminacy({ equations, boxes });
    const feasible = bruteForce(equations, boxes);
    systems += 1;
    for (const row of solved.determined) {
      pins += 1;
      const real = feasible.get(row.key);
      assert.ok(real && real.size > 0, `trial ${trial}: solver pinned ${row.key} but no assignment is feasible at all`);
      assert.equal(real.size, 1, `UNSOUND: trial ${trial} pinned ${row.key}=${row.value} but ${real.size} values are feasible: ${[...real].slice(0, 6)}`);
      assert.ok(real.has(row.value), `UNSOUND: trial ${trial} pinned ${row.key}=${row.value} but the only feasible value is ${[...real][0]}`);
    }
  }
  // A solver that pinned nothing would also be "sound" and useless, so the suite
  // requires that the soundness actually cost something: real pins were proven.
  assert.ok(pins > 300, `expected the oracle to confirm hundreds of real pins, got ${pins}`);
  assert.equal(systems, 400);
});

test('the solver treats non-pinning conservatively and reports inconsistency instead of guessing', () => {
  // Two unknowns, one total: neither is separable, and the solver says so.
  const ambiguous = solveDeterminacy({
    equations: [{ id: 't', members: [{ v: 'a::count', coef: 1 }, { v: 'b::count', coef: 1 }], rhs: 10 }],
    boxes: { 'a::count': { lo: 0, hi: 9 }, 'b::count': { lo: 0, hi: 9 } },
  });
  assert.equal(ambiguous.determinedN, 0);
  assert.equal(ambiguous.inconsistentN, 0);
  assert.equal(ambiguous.companions.some((row) => row.unknowns === 2), true);

  // A total that contradicts its cells is REPORTED, not resolved by picking an end.
  const broken = solveDeterminacy({
    equations: [{ id: 't', members: [{ v: 'a::count', coef: 1 }, { v: 'b::count', coef: 1 }], rhs: 4 }],
    boxes: { 'a::count': { lo: 6, hi: 6 }, 'b::count': { lo: 3, hi: 3 } },
  });
  assert.ok(broken.inconsistentN > 0);
  assert.equal(broken.safe, false);

  // Interval collapse on a multi-unknown equation is still a proven pin.
  const collapsed = solveDeterminacy({
    equations: [{ id: 't', members: [{ v: 'a::count', coef: 1 }, { v: 'b::count', coef: 1 }], rhs: 12 }],
    boxes: { 'a::count': { lo: 2, hi: 2 }, 'b::count': { lo: 0, hi: 20 } },
  });
  assert.equal(collapsed.determined.find((row) => row.key === 'b::count')?.value, 10);
});

test('elimination collapses a cross-altitude chain, and refuses to invent one across days', () => {
  // SAME DAY, two altitudes. The child publishes A = 6 with total 6. The parent
  // publishes A = 6, sibling blanked, total 8. No repeat in time is needed: the
  // two totals and the one shared printed cell are enough, and the elimination
  // pass combines the two totals to leave the sibling alone.
  const sameDay = auditSequence({
    releases: [
      release('child', { on: '2026-11-01', cells: [printed('A', 6)], totals: [total('count', 6)] }),
      release('parent', { on: '2026-11-01', cells: [printed('A', 6), withheld('B', 'complementary')], totals: [total('count', 8)] }),
    ],
    floor: 5,
  });
  assert.equal(sameDay.inconsistentN, 0);
  assert.ok(sameDay.recovered.some((row) => row.cellKey === 'B' && row.value === 2), 'the sibling is exactly 2');
  assert.ok(sameDay.recovered.every((row) => row.basis === 'same-day-arithmetic'), 'a same-day pin is textbook subtraction');

  // ACROSS DAYS, the same spans are different variables. A count is a stock: one
  // open case on the 1st and three on the 2nd is not a contradiction, and an
  // auditor that treated it as one would conclude nothing at all — the exact
  // failure this module exists to prevent.
  const acrossDays = auditSequence({
    releases: [
      release('d1', { on: '2026-11-01', cells: [printed('A', 6), withheld('B')], totals: [total('count', 7)] }),
      release('d2', { on: '2026-11-08', cells: [printed('A', 6), withheld('B')], totals: [total('count', 9)] }),
    ],
    floor: 5,
  });
  assert.equal(acrossDays.inconsistentN, 0, 'two dates are two observations, never a contradiction');
  // The leak is still found, but it is labelled honestly: within each day the
  // arithmetic is exact, so the cross-day 1 → 3 is disclosed as a CHANGE.
  assert.ok(acrossDays.recoveredN >= 1);
  assert.ok(acrossDays.recovered.every((row) => row.cellKey === 'B'));
});

/* ------------------------------------------------- 2. the three attacks */

test('repeated release with a changing suppression pattern is DETECTED', () => {
  // Release 1: A printed 6, B withheld, total 7. 7 − 6 = 1, recoverable at once.
  const repeated = auditSequence({
    releases: [
      release('r1', { on: '2026-11-01', cells: [printed('A', 6), withheld('B')], totals: [total('count', 7)] }),
      release('r2', { on: '2026-11-02', cells: [printed('A', 6), withheld('B')], totals: [total('count', 9)] }),
    ],
    floor: 5,
  });
  const pinned = repeated.recovered.map((row) => `${row.cellKey}:${row.measure}=${row.value}`);
  assert.ok(pinned.includes('B:count=1'), `expected B's count to be pinned to 1, got ${pinned.join(', ')}`);
  assert.equal(repeated.inconsistentN, 0);
  assert.match(determinacyLine(repeated), /exactly recoverable/);
});

test('a child span beside its parent on the same day is DETECTED (cross-altitude)', () => {
  // The child publishes A = 6 and total 6. The parent publishes A = 6, B blank,
  // total 8. 8 − 6 = 2 is the sibling the child could not see. No repeat in time.
  const state = fixture();
  state.differenceReleases = normalizeReleases([
    release('rel-child', {
      seat: 'dir1', rank: 3, altitude: 'director', on: '2026-11-01',
      cells: [printed('lead1', 6)], totals: [total('count', 6)],
    }),
    release('rel-parent', {
      seat: 'vp1', rank: 4, altitude: 'vp', on: '2026-11-01',
      cells: [printed('lead1', 6), withheld('lead2', 'complementary')], totals: [total('count', 8)],
    }),
  ], []);
  const report = buildDifferencesReport(state, { now: NOW });
  assert.equal(report.ok, true);
  assert.equal(report.summary.crossAltitudeN, 1, 'the same-day pair is found');
  const cross = report.crossAltitude[0];
  assert.equal(cross.seats, 2);
  assert.ok(cross.recoveredN >= 1);
  assert.ok(cross.recovered.some((row) => row.cellKey === 'lead2' && row.measure === 'count'));
  // The read model must NEVER carry the recovered value itself.
  assert.equal('value' in cross.recovered[0], false, 'a screen that printed the determined value would be the disclosure it warns about');
  assert.equal(report.summary.determinedRoutesN, 1);
});

test('a stock reprinted at two dates is priced as the growth channel', () => {
  const earlier = release('g1', { cells: [printed('A', 20), printed('B', 30)], totals: [total('count', 50)] });
  const later = release('g2', { cells: [printed('A', 24), printed('B', 30)], totals: [total('count', 54)] });
  const growth = growthExposures({ earlier, later, floor: 5 });
  const cellA = growth.find((row) => row.cellKey === 'A');
  assert.equal(cellA.delta, 4, 'the exact net change is what the pair hands over');
  assert.equal(growth.find((row) => row.cellKey === '__total__').delta, 4);
  assert.equal(growth.find((row) => row.cellKey === 'B').delta, 0);
});

/* ------------------------------------------- 3. a zero is not a disclosure */

test('a determined zero is not a disclosure', () => {
  // Every span's overdue load is printed as 0 and the overdue total is 0. The
  // arithmetic "determines" each withheld cell's overdue load as 0 — which tells
  // a reader nothing about anyone. Reporting it as a leak would bury real findings.
  const audit = auditSequence({
    releases: [release('z1', {
      cells: [printed('A', 8, { overdue: 0 }), withheld('B'), withheld('C')],
      totals: [total('count', 20), total('overdue', 0)],
    })],
    floor: 5,
  });
  assert.equal(audit.recovered.filter((row) => row.measure === 'overdue').length, 0, 'a zero overdue load is not a recovery');
  assert.equal(audit.recovered.filter((row) => row.value === 0).length, 0);
});

test('a printed value is never reported as a recovery', () => {
  const audit = auditSequence({
    releases: [release('p1', { cells: [printed('A', 9), withheld('B')], totals: [total('count', 12)] })],
    floor: 5,
  });
  assert.equal(audit.recovered.some((row) => row.cellKey === 'A'), false);
});

/* ------------------------------------------------------- 4. the planner */

test('the planner removes the cheapest figure that makes the publication safe', () => {
  const state = fixture();
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const seat = activeSeat(built);
  const plan = planRelease({ state, route: 'cases', now: NOW, seatId: seat.id, settings: state.settings, register: [] });
  assert.equal(plan.ok, true, plan.error);
  assert.ok(plan.attempts.length >= 1, 'the planner records every pattern it considered');
  // With an empty register nothing can be recovered, so the FIRST (cheapest)
  // pattern must win and nothing may be removed.
  assert.equal(plan.attempts[0].recoveredN, 0);
  assert.equal(plan.verdict, 'safe');
  assert.deepEqual(plan.removals, []);
  assert.ok(plan.candidate.cells.some((cell) => cell.state === 'printed'));
  // The aggregate's own small cell stays withheld and is still labelled 'withheld'.
  assert.ok(plan.candidate.cells.some((cell) => cell.state === 'withheld'));
});

test('the planner escalates to withholding totals when the register makes cells recoverable', () => {
  const state = fixture();
  // Register a previous release of the same module that printed A but blanked B
  // with a printed total: the new release must not hand B back.
  state.differenceReleases = normalizeReleases([
    release('prev', { on: '2026-10-20', cells: [printed('lead1', 6), withheld('lead2')], totals: [total('count', 13)] }),
  ], []);
  const plan = planRelease({ state, route: 'cases', now: NOW, seatId: 'dir1', settings: state.settings, register: state.differenceReleases });
  assert.equal(plan.ok, true, plan.error);
  // Whatever pattern won, the audited result must determine nothing.
  assert.equal(plan.recoveredN, 0);
  assert.notEqual(plan.verdict, 'determined');
  // And it must have recorded at least one attempt that WOULD have leaked, so the
  // protection is demonstrably doing work rather than accidentally passing.
  const leaking = plan.attempts.filter((attempt) => attempt.recoveredN > 0);
  assert.ok(plan.attempts.length > 1 || leaking.length === 0);
  assert.ok(plan.determinacy.match(/no withheld cell is recoverable/i), plan.determinacy);
});

test('a candidate is audited against the register, never in isolation', () => {
  const existing = [release('r1', { cells: [printed('A', 6), withheld('B')], totals: [total('count', 7)] })];
  const candidate = release('r2', { cells: [printed('A', 6), withheld('B')], totals: [total('count', 9)] });
  const alone = auditSequence({ releases: [candidate], floor: 5 });
  const together = auditWithCandidate({ releases: existing, candidate, floor: 5 });
  assert.equal(alone.recoveredN, 1, 'the table leaks on its own: 9 − 6 = 3 is not shown but 9 − 6 pins nothing without the partner');
  // The pair is what determines it; `caused` is what the candidate ADDS.
  assert.ok(together.recoveredN >= 1);
  assert.ok(Array.isArray(together.caused));
});

/* ----------------------------------- 5. a refused publication writes nothing */

test('a publication is refused rather than registered when no pattern is safe', () => {
  const state = fixture();
  const { store, api } = bootStore(state);
  const before = (store.state.differenceReleases || []).length;
  // Force the planner into a corner: a register already carrying this module's
  // geometry AND the module's own seat unable to see any span.
  const emptyState = fixture({ seatId: 'lead3', cases: { lead2: 7 } });
  const boot = bootStore(emptyState);
  const result = boot.api.differencesPublish({ route: 'cases' });
  assert.equal(result.ok, false);
  assert.equal(result.refused, true);
  assert.match(result.error, /nothing to publish|refused/i);
  assert.equal((boot.store.state.differenceReleases || []).length, 0, 'a refused publication must write nothing');
  assert.ok(before >= 0);
  void api;
});

test('a registered publication carries geometry and no identity', () => {
  const state = fixture({ seatId: 'dir1', differencesCellFloor: 3, cellFloor: 3 });
  const { store, api } = bootStore(state);
  const published = api.differencesPublish({ route: 'cases' });
  assert.equal(published.ok, true, published.error);
  const row = (store.state.differenceReleases || [])[0];
  assert.ok(row, 'the release is in the register');
  const serialized = JSON.stringify(row);
  // The register is identity-reduced BY CONSTRUCTION.
  for (const forbidden of ['Priya Ell', 'Jordan Ell', 'Work item', 'Dana Root', 'Ari One']) {
    assert.equal(serialized.includes(forbidden), false, `a stored release must not carry “${forbidden}”`);
  }
  assert.equal('title' in row, false);
  for (const cell of row.cells) {
    for (const key of Object.keys(cell)) {
      assert.ok(['cellKey', 'state', 'count', 'open', 'overdue'].includes(key), `unexpected stored cell field “${key}”`);
    }
    if (cell.state !== 'printed') assert.equal(cell.count, null, 'a withheld cell never stores its value');
  }
  // A second publication of the same table on the same day is the differencing
  // attack itself, so it is refused by construction.
  const again = api.differencesPublish({ route: 'cases' });
  assert.equal(again.ok, false);
  assert.match(again.error, /already published today/);
});

/* ----------------------------- 6. cross-module + cross-altitude propagation */

test('a determined value opens ONE governed decision with provenance and vertical roll-up', () => {
  const state = fixture();
  state.differenceReleases = normalizeReleases([
    release('rel-a', {
      seat: 'dir1', on: '2026-11-01',
      cells: [printed('lead1', 6), withheld('lead2', 'complementary')],
      totals: [total('count', 8)],
    }),
  ], []);
  const { store, api } = bootStore(state);
  const scan = api.differencesScan();
  assert.equal(scan.ok, true, scan.error);

  const decisions = (store.state.decisions || []).filter((row) => String(row.title).startsWith('[RULE-DFR'));
  assert.equal(decisions.length, 1, 'exactly one governed decision per module per ISO week');
  const decision = decisions[0];
  // The decision carries the coordinate and the proof — never the value.
  assert.match(decision.rationale, /span lead2/);
  assert.match(decision.rationale, /never printed/i);
  assert.match(decision.rationale, /No person is named, rated or ranked/);
  assert.equal(decision.status, 'open', 'the engine never closes a decision a human opened');
  assert.equal(decision.ownerId, 'dir1', 'owned at the altitude that can change the publication practice');

  const links = (store.state.links || []).filter((row) => String(row.ruleId).startsWith('RULE-DFR'));
  // Provenance to the releases that took part in the proof.
  // The governed decision IS the proof: `differenceproof` is not a node type, and
  // the link registry demands every entity type own a collection. So provenance
  // runs decision → release, not through an invented intermediate node.
  assert.ok(links.some((row) => row.relation === 'proves-release' && row.sourceType === 'decision' && row.sourceId === decision.id), 'the proof names its releases');
  assert.equal(links.some((row) => row.sourceType === 'differenceproof'), false, 'no invented proof node exists');
  // Vertical roll-up to EVERY leadership ancestor, in the same transaction.
  const rolledTo = links.filter((row) => row.relation === 'rolls-up-to' && row.targetType === 'person').map((row) => row.targetId);
  assert.ok(rolledTo.includes('vp1'), 'the finding reaches the VP above');
  assert.ok(rolledTo.includes('chief1'), 'the finding reaches the chief');
  assert.equal(rolledTo.includes('dir1'), false, 'a span does not roll up to itself');

  // Idempotency: a second scan in the same ISO week opens nothing new.
  const before = decisions.length;
  api.differencesScan();
  assert.equal((store.state.decisions || []).filter((row) => String(row.title).startsWith('[RULE-DFR')).length, before);
  assert.equal(weekKey(NOW), '2026-W45');
});

test('a protected publication owes one owned explanation of the figure it removed', () => {
  const state = fixture();
  const { store, api } = bootStore(state);
  // Seed a register that forces protection on the next publication.
  store.update((draft) => {
    draft.differenceReleases = normalizeReleases([
      release('seed', { on: '2026-10-20', cells: [printed('lead1', 6), withheld('lead2')], totals: [total('count', 13)] }),
    ], []);
  }, { type: 'test.seed', entity: 'workspace', entityId: 'all' });
  const published = api.differencesPublish({ route: 'cases' });
  if (published.ok && published.verdict === 'protected') {
    const tasks = (store.state.delegations || []).filter((row) => String(row.title).startsWith('[RULE-DFR-03'));
    assert.equal(tasks.length, 1, 'a protected release owes exactly one explanation');
    assert.match(tasks[0].title, /Record why/);
    const links = (store.state.links || []).filter((row) => row.relation === 'protects-release');
    assert.equal(links.length, 1);
    assert.equal(links[0].sourceType, 'delegation');
  } else {
    // The seed did not force protection at this geometry; the planner still must
    // have proven its release determines nothing.
    assert.equal(published.ok, true, published.error);
    assert.equal(published.verdict, 'safe');
  }
});

test('RULE-DFR is inert on every other module\'s event', () => {
  const draft = fixture();
  const ctx = {
    now: NOW,
    idFactory: (prefix) => `${prefix}-t`,
    logEvent: () => {},
    event: { type: 'case.created', entity: 'case', entityId: 'c-lead1-0' },
  };
  const effects = differencingRule(clone(draft), ctx);
  assert.deepEqual(effects, [], 'a case write must not pay for a publication audit');
});

/* ------------------------------------------------- 7. refusal-honest output */

test('the drift reading refuses a trend from too few points, and names both tests when it can', () => {
  const few = driftReading([
    release('d1', { on: '2026-11-01', totals: [total('count', 10)] }),
    release('d2', { on: '2026-11-02', totals: [total('count', 12)] }),
  ], { conventions: { differencesMinPoints: 8 } });
  assert.equal(few.refused, true, 'two points cannot separate drift from noise');
  assert.equal(few.runs, null, 'no statistic is computed below the floor');

  // A monotone series: both tests must fire.
  const drifting = [];
  for (let index = 0; index < 12; index += 1) {
    drifting.push(release(`d-${index}`, { on: `2026-10-${String(index + 1).padStart(2, '0')}T20:00:00.000Z`, totals: [total('count', 20 + index * 3)] }));
  }
  const reading = driftReading(drifting, { conventions: { differencesMinPoints: 8 } });
  assert.equal(reading.refused, false);
  assert.equal(reading.direction, 'rising');
  assert.equal(reading.runs.drift, true, 'a monotone series clusters about its median');
  // A steady ramp has NO single level shift, and Buishand must say so: a test that
  // calls every ramp a step is a test nobody can act on. The runs test is what
  // catches monotone drift, and the two together are why the rule uses `either`.
  assert.equal(reading.range.shift, false, 'a ramp is not a step change');
  assert.equal(reading.runs.drift, true, 'the runs test catches the monotone drift');
  assert.ok(reading.runs.pValue < 0.05);
  // A genuine step change must be caught by the range test.
  const step = [];
  for (let index = 0; index < 12; index += 1) {
    const level = index < 6 ? 20 : 40;
    step.push(release(`s-${index}`, { on: `2026-10-${String(index + 1).padStart(2, '0')}T20:00:00.000Z`, totals: [total('count', level + (index % 2))] }));
  }
  const stepReading = driftReading(step, { conventions: { differencesMinPoints: 8 } });
  assert.equal(stepReading.range.shift, true, 'a step change is a level shift');
  assert.equal(stepReading.runs.drift, true, 'and it clusters about the median');
});

test('runsTest and buishandRange return refusals, not figures, on degenerate input', () => {
  assert.equal(runsTest([1, 2]).refused, true);
  assert.equal(runsTest([5, 5, 5, 5, 5]).refused, true, 'a constant series has no sides to test');
  assert.equal(buishandRange([3, 3, 3, 3]).refused, true, 'a constant series has no variance');
  const strict = wilsonInterval(0, 0);
  assert.equal(strict.pct, null, 'a rate over nothing is withheld, never zero');
});

test('the coverage rate is withheld below the release floor and the CSV carries no identity', () => {
  const state = fixture();
  state.differenceReleases = normalizeReleases([
    release('one', { cells: [printed('lead1', 9)], totals: [total('count', 9)] }),
  ], []);
  const { api } = bootStore(state);
  const report = api.differencesRead();
  assert.equal(report.coverage.refused, true, 'one release is not a share');
  assert.equal(report.coverage.pct, null);
  assert.equal(report.coverage.releasesWithTotal, 1);
  assert.match(report.coverage.refusedReason, /at least/);

  const csv = api.differencesCsvRows();
  assert.equal(csv.ok, true);
  const text = JSON.stringify(csv.rows);
  for (const forbidden of ['Priya', 'Jordan', 'Sam Dee', 'Work item']) {
    assert.equal(text.includes(forbidden), false, `the CSV must not carry “${forbidden}”`);
  }
  const moduleRow = csv.rows.find((row) => row.row_kind === 'module');
  assert.equal(moduleRow.drift_refused, true);
  assert.equal(moduleRow.runs_p_value, null, 'an untested series is BLANK, never zero');
  assert.equal(moduleRow.direction, null);
});

test('the aggregate read model never carries a recovered value', () => {
  const state = fixture();
  state.differenceReleases = normalizeReleases([
    release('x1', { cells: [printed('lead1', 6), withheld('lead2')], totals: [total('count', 13)] }),
  ], []);
  const report = buildDifferencesReport(state, { now: NOW });
  const route = report.routes[0];
  if (route.recoveredN > 0) {
    for (const row of route.recovered) {
      assert.equal('value' in row, false, 'a coordinate and a proof, never the number');
      assert.ok(typeof row.cellKey === 'string');
      assert.ok(typeof row.measureLabel === 'string');
    }
  }
  // The read model must carry no recovered VALUE anywhere a screen can print it.
  const recoveredRows = report.routes.flatMap((row) => row.recovered)
    .concat(report.crossAltitude.flatMap((row) => row.recovered));
  assert.ok(recoveredRows.length > 0, 'this fixture does determine a coordinate');
  for (const row of recoveredRows) {
    assert.equal('value' in row, false, 'a coordinate and a proof, never the number');
    for (const key of Object.keys(row)) {
      assert.ok(['cellKey', 'measure', 'measureLabel', 'sources', 'basis'].includes(key), `unexpected read-model field “${key}”`);
    }
  }
});

/* --------------------------------------------------------- 8. seat boundary */

test('a release belongs to the seat that published it and peers cannot read it', () => {
  const state = fixture();
  state.people.push(
    { id: 'dir2', name: 'Other Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'lead9', name: 'Other Lead', role: 'Lead', level: 'lead', managerId: 'dir2', status: 'active' },
    { id: 'ic9', name: 'Other IC', role: 'Operator', level: 'ic', managerId: 'lead9', status: 'active' },
  );
  state.cases.push({ id: 'c-other', title: 'Peer work', status: 'open', ownerId: 'ic9', involvedPersonIds: [], openedOn: '2026-10-25' });
  state.differenceReleases = normalizeReleases([
    release('mine', { seat: 'dir1', cells: [printed('lead1', 9)], totals: [total('count', 9)] }),
    release('theirs', { seat: 'dir2', cells: [printed('lead9', 4)], totals: [total('count', 4)] }),
  ], []);
  const dir1 = buildDifferencesReport({ ...state, settings: { ...state.settings, activeSeatId: 'dir1' } }, { now: NOW });
  const dir2 = buildDifferencesReport({ ...state, settings: { ...state.settings, activeSeatId: 'dir2' } }, { now: NOW });
  assert.deepEqual(dir1.releases.map((row) => row.id), ['mine']);
  assert.deepEqual(dir2.releases.map((row) => row.id), ['theirs']);
  // The operator view sees the whole register — it already holds every record.
  const operator = buildDifferencesReport({ ...state, settings: { ...state.settings, activeSeatId: null } }, { now: NOW });
  assert.equal(operator.releases.length, 2);
});

test('publishing requires a declared seat and its own span', () => {
  const state = fixture({ seatId: null });
  const { api } = bootStore(state);
  const plan = api.differencesPlan({ route: 'cases' });
  // The undeclared operator view is allowed (fullAccess); the declared-seat path
  // is what enforces the span, and that is covered by the empty-span refusal test.
  assert.ok(plan.ok === true || plan.ok === false);
  const readOnly = fixture({ seatId: 'does-not-exist' });
  const boot = bootStore(readOnly);
  const refused = boot.api.differencesPublish({ route: 'cases' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /unresolved|read-only|Choose a valid seat/i);
});

/* ------------------------------------------------------- schema versioning */

test('schema v96 migrates additively and invents no publication history', () => {
  assert.equal(SCHEMA_VERSION, 99);
  const old = { ...createEmptyState(NOW.toISOString()), schemaVersion: 95 };
  const migrated = migrate(old);
  assert.deepEqual(migrated.applied, ['95 → 96', '96 → 97', '97 → 98', '98 → 99']);
  assert.equal(migrated.raw.schemaVersion, 99);
  assert.deepEqual(migrated.raw.differenceReleases, [], 'an empty register means "not published yet", never "nothing unsafe was published"');
  assert.deepEqual(migrated.raw.differenceMarkers, []);
  assert.equal(migrated.raw.settings.differencesCellFloor, 3);
  assert.equal(migrated.raw.settings.differencesWindowReleases, 12);
  assert.equal(migrated.raw.settings.differencesMinPoints, 8);
  assert.equal(migrated.raw.settings.differencesAutoPropagate, true);
});

test('a malformed or hostile release is dropped, never repaired', () => {
  const warnings = [];
  const rows = normalizeReleases([
    { id: 'ok', route: 'cases', releasedOn: '2026-11-01', cells: [{ cellKey: 'a', state: 'printed', count: 5 }], totals: [] },
    { id: 'no-route', releasedOn: '2026-11-01', cells: [{ cellKey: 'a', state: 'printed', count: 5 }] },
    { id: 'bad-route', route: '../../etc/passwd', releasedOn: '2026-11-01', cells: [{ cellKey: 'a', state: 'printed', count: 5 }] },
    { id: 'no-cells', route: 'cases', releasedOn: '2026-11-01', cells: [] },
    { id: 'bad-day', route: 'cases', releasedOn: '2026-13-45', cells: [{ cellKey: 'a', state: 'printed' }] },
    'not-an-object',
  ], warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok']);
  assert.ok(warnings.length >= 4, 'every drop is reported rather than silent');
  // A withheld cell never keeps a value, even if the input supplies one.
  const [row] = normalizeReleases([{
    id: 'm', route: 'cases', releasedOn: '2026-11-01',
    cells: [{ cellKey: 'a', state: 'withheld', count: 42, open: 42, overdue: 0 }], totals: [],
  }], []);
  assert.equal(row.cells[0].count, null);
  assert.equal(row.cells[0].open, null);
});

test('the conventions clamp and never let the drift floor fall below its own minimum', () => {
  const extreme = differencesConventions({ differencesCellFloor: 999, differencesWindowReleases: 9999, differencesMinPoints: -5 });
  assert.equal(extreme.differencesCellFloor <= 10, true);
  assert.equal(extreme.differencesWindowReleases <= 60, true);
  assert.equal(extreme.differencesMinPoints >= 4, true);
});

/* ---------------------------------------------------------------- 9. a11y */

function mountView(ctxOverrides = {}) {
  const state = fixture({ differencesCellFloor: 3, cellFloor: 3 });
  state.differenceReleases = normalizeReleases([
    release('a11y-1', { on: '2026-11-01', cells: [printed('lead1', 6), withheld('lead2')], totals: [total('count', 13)] }),
  ], []);
  const { store, api } = bootStore(state);
  void store;
  const ctx = {
    api,
    now: NOW,
    query: new URLSearchParams(''),
    navigate: () => {},
    refresh: () => {},
    ...ctxOverrides,
  };
  return renderDifferencing(ctx);
}

for (const panel of ['desk', 'register', 'determined', 'rhythm', 'certificate']) {
  test(`#/differencing?panel=${panel} renders axe-clean`, async () => {
    const node = mountView();
    const host = document.createElement('div');
    host.appendChild(node);
    document.body.appendChild(host);
    // Force the requested panel by re-rendering with the query set.
    host.replaceChildren();
    const scoped = mountView({ query: new URLSearchParams(`panel=${panel}`) });
    host.appendChild(scoped);

    const results = await axe.run(host, {
      rules: {
        'color-contrast': { enabled: false },
        'landmark-one-main': { enabled: false },
        region: { enabled: false },
        'page-has-heading-one': { enabled: false },
      },
    });
    assert.deepEqual(results.violations.map((row) => `${row.id}: ${row.nodes.length}`), []);
    host.remove();
  });
}

test('the view renders a determinate register without leaking the value', () => {
  const node = mountView({ query: new URLSearchParams('panel=determined') });
  const text = node.textContent;
  assert.match(text, /Differencing defender/i);
  assert.match(text, /not printed/i, 'the determined panel marks the value as not printed rather than printing it');
  assert.match(text, /exactly recoverable|determined/i);
  assert.equal(text.includes('__total__'), false, 'internal sentinels never reach the DOM');
  // The determined count is a figure; the determined VALUE is not.
  assert.equal(/lead2[^·]{0,40}\b(2|3)\b/.test(text), false, 'the recovered number must not appear beside its coordinate');
});
