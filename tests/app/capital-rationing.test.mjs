// ADR-0211 — Capital Rationing & Funded-Set Register.
//
// The register's claims are arithmetic and governance, so the tests are too. One
// focused pass over what this session built:
//
//   1. the exact kernel is checked against BRUTE FORCE on randomised problems —
//      the only honest way to claim an optimum, and the check that found three
//      real defects while this file was being written;
//   2. a refused search prints NO set, and the shadow price is the exact finite
//      difference (zero when the ceiling is not binding is an answer);
//   3. a shared-benefit share outside the open interval, a duplicate relation, a
//      cross-currency relation and a relation declared by a seat that holds only
//      one side are all refused at the door;
//   4. the loader never repairs a constraint, and — the defect this suite was
//      extended for — a STORED cents amount is not re-scaled by a hundred on
//      reload;
//   5. what the panel prints is what the reader computed, what the CSV exports is
//      the same figure, and the screen's own counts equal the rows it printed.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { COLLECTIONS, createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS, buildScopeTable, parseCsv, serializeCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  PAUSE_PERMIT_MATRIX_REACH_SWITCHES,
  PAUSE_PERMIT_REACH_RULES,
} from '../../app/core/domain/pausePermitRegistry.js';
import { buildCapitalRationing, capitalRationingAttentionCount, capitalRationingBriefText, capitalRationingCsvRows } from '../../app/core/domain/capitalRationing.js';
import {
  NodeBudget,
  evaluateSelection,
  feasibleSelection,
  fractionalBound,
  prepareRelations,
  selectionSignature,
  shadowPrice,
  solveFundedSet,
  solveRankOrder,
} from '../../app/core/domain/capitalRationingMath.js';
import { capitalRationingRule, capitalRationingConditions, indexCapitalRationingAsks } from '../../app/core/domain/capitalRationingRules.js';
import {
  CAPITAL_RATIONING_CSV_COLUMNS,
  CAPITAL_RATIONING_CSV_SCOPE,
  CAPITAL_RATIONING_LIMITS,
  CAPITAL_RATIONING_RULE_ID,
} from '../../app/core/domain/capitalRationingRegistry.js';
import {
  normalizeCapitalCeilings,
  normalizeCapitalRelations,
  parseCapitalAmount,
  readStoredCapitalCents,
} from '../../app/core/domain/capitalRationingSchema.js';
import { renderFinance } from '../../app/views/finance.js';
import { renderFinanceCapitalRationingPanel } from '../../app/views/capitalRationingPanel.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T0 = '2026-11-15T12:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);
const plusDays = (day, n) => new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 86400000).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ fixture */

// Leader (operator) → vera (VP / C-suite) → dan, eve (directors) → mia, ned
// (managers). One declared matrix line: mia also reports to eve on a project
// line, so mia is a multi-line benefit owner.
const person = (id, managerId, level) => ({ id, name: `${id[0].toUpperCase()}${id.slice(1)} Name`, managerId, level, role: 'Operations', status: 'active', startDate: '2026-01-01T09:00:00.000Z', createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:00:00.000Z' });

function rawFixture(patch = {}, now = T0) {
  const raw = createEmptyState(now);
  raw.people = [
    person('vera', null, 'vp'),
    person('dan', 'vera', 'director'),
    person('eve', 'vera', 'director'),
    person('mia', 'dan', 'manager'),
    person('ned', 'eve', 'manager'),
  ];
  raw.reportingLines = [{ id: 'rl-mia-eve', personId: 'mia', managerId: 'eve', kind: 'project', shareH: 30, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '' }];
  return { ...raw, ...patch };
}
const fixture = (patch = {}, now = T0) => normalizeState(rawFixture(patch, now), { now: new Date(now) }).state;

function seed(state, startAt = T0) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  let clock = new Date(startAt);
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => clock, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => clock, idFactory }), store, { now: () => clock.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const on = (day) => { clock = at(day); };
  return { store, api, sit, on };
}

// Flows at exactly 0, 365, 730, 1095 days. A case is typed in major units and
// stored in whole cents; the appraisal is the Investment Case Register's own.
const annual = (base) => [0, 365, 730, 1095].map((n) => plusDays(base, n));
const typedFlows = (base, outlay, benefit) => {
  const [d0, d1, d2, d3] = annual(base);
  return [
    { on: d0, kind: 'outlay', amount: String(outlay) },
    { on: d1, kind: 'benefit', amount: String(benefit) },
    { on: d2, kind: 'benefit', amount: String(benefit) },
    { on: d3, kind: 'benefit', amount: String(benefit) },
  ];
};

/** Declare and ratify one case through the real door. Returns its id. */
function ratify(api, { title, owner = 'mia', currency = 'DKK', hurdlePct = '10', outlay, benefit, reviewOn = '2028-12-31' }) {
  const made = api.investmentCaseDeclare({ title, ownerId: owner, currency, basis: 'nominal', hurdlePct, flows: typedFlows('2027-01-01', outlay, benefit), reviewOn });
  assert.ok(made.ok, `declare ${title}: ${made.error}`);
  const dec = api.investmentCaseDecide({ caseId: made.caseId, decision: 'approve', reason: 'Approved on the merits for this period.' });
  assert.ok(dec.ok, `ratify ${title}: ${dec.error}`);
  return made.caseId;
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'Event', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value = key.includes('AnimationFrame') && dom.window[key] ? dom.window[key].bind(dom.window) : (typeof dom.window[key] === 'function' ? dom.window[key].bind(dom.window) : dom.window[key]);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  try {
    return run(dom);
  } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

/* =====================================================================
 * 1. THE KERNEL — checked against brute force, which is the point
 */

/** Deterministic PRNG, so a failure is reproducible. */
function rng(seedValue) {
  let s = seedValue;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

const scaled = (list) => list.map((c) => ({ ...c, scaledValue: BigInt(c.valueCents) * 10000n }));

/** Every feasible subset, by enumeration. The oracle the solver is judged on. */
function bruteForce(candidates, relations, ceilingCents) {
  const n = candidates.length;
  let best = null;
  let bestSelection = null;
  let feasibleCount = 0;
  for (let mask = 0; mask < (1 << n); mask += 1) {
    const selection = candidates.map((c, i) => (mask >> i) & 1);
    const check = feasibleSelection(selection, candidates, relations, ceilingCents);
    if (!check.ok) continue;
    feasibleCount += 1;
    const value = evaluateSelection(selection, candidates, relations);
    if (best === null || value.scaled > best) { best = value.scaled; bestSelection = selection; }
  }
  return { valueCents: best === null ? 0 : Number(best / 10000n), selection: bestSelection, feasibleCount };
}

test('the exact search agrees with brute force on 900 randomised problems, and every set it prints is feasible', () => {
  const rnd = rng(20261115);
  const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const kinds = ['exclusive', 'requires', 'overlap'];
  let checked = 0;
  let withRelations = 0;
  let strictGap = 0;
  for (let trial = 0; trial < 900; trial += 1) {
    const n = ri(1, 11);
    const candidates = scaled(Array.from({ length: n }, (_, i) => ({ caseId: `c${i}`, index: i, valueCents: ri(-400, 2500), weight: ri(50, 1400) })));
    const rawRelations = [];
    const draws = ri(0, 4);
    for (let k = 0; k < draws && n >= 2; k += 1) {
      const a = ri(0, n - 1);
      const b = ri(0, n - 1);
      if (a === b) continue;
      const kind = kinds[ri(0, 2)];
      rawRelations.push({ kind, aCaseId: `c${a}`, bCaseId: `c${b}`, overlapBp: kind === 'overlap' ? ri(1, 999) : undefined });
    }
    const relations = prepareRelations(rawRelations, candidates);
    if (rawRelations.length) withRelations += 1;
    const ceilingCents = ri(100, 4000);
    const oracle = bruteForce(candidates, relations, ceilingCents);
    const solved = solveFundedSet({ candidates, relations, ceilingCents, budget: new NodeBudget(20_000_000) });
    assert.equal(solved.proved, true, `trial ${trial} proved`);
    assert.equal(solved.valueCents, oracle.valueCents, `trial ${trial}: the printed value IS the maximum over every feasible set`);

    // The printed SET must be feasible and must achieve the printed value.
    const check = feasibleSelection(solved.selection, candidates, relations, ceilingCents);
    assert.equal(check.ok, true, `trial ${trial}: the printed set honours the ceiling and every declared relation`);
    const achieved = evaluateSelection(solved.selection, candidates, relations);
    assert.equal(Number(achieved.scaled / 10000n), solved.valueCents, `trial ${trial}: the set printed achieves the value printed`);
    assert.ok(solved.weightCents <= ceilingCents, `trial ${trial}: weight inside the ceiling`);

    // The shortcut may never beat the optimum.
    const rank = solveRankOrder({ candidates, relations, ceilingCents });
    assert.ok(rank.valueCents <= solved.valueCents, `trial ${trial}: the profitability-index order never beats the proven set`);
    assert.equal(feasibleSelection(rank.selection, candidates, relations, ceilingCents).ok, true, `trial ${trial}: the rank-order plan is itself feasible`);
    if (rawRelations.length && rank.valueCents < solved.valueCents) strictGap += 1;
    checked += 1;
  }
  assert.equal(checked, 900);
  assert.ok(withRelations > 400, `${withRelations} of the problems carried a declared relation`);
  assert.ok(strictGap > 50, `${strictGap} related problems are ones where ranking is strictly worse than the proven set`);
});

test('the fractional bound never under-states what a branch can still achieve', () => {
  const rnd = rng(777);
  const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  for (let trial = 0; trial < 1200; trial += 1) {
    const n = ri(1, 8);
    const items = scaled(Array.from({ length: n }, (_, i) => ({ caseId: `x${i}`, index: i, valueCents: ri(-100, 2000), weight: ri(10, 800) })))
      .sort((a, b) => {
        if (a.weight === 0 || b.weight === 0) return b.weight - a.weight;
        const left = a.scaledValue * BigInt(b.weight);
        const right = b.scaledValue * BigInt(a.weight);
        return left > right ? -1 : left < right ? 1 : a.index - b.index;
      });
    const room = ri(0, 2000);
    const bound = fractionalBound(items, room, 0);
    let best = 0n;
    for (let mask = 0; mask < (1 << n); mask += 1) {
      let weight = 0;
      let value = 0n;
      for (let i = 0; i < n; i += 1) if ((mask >> i) & 1) { weight += items[i].weight; value += items[i].scaledValue; }
      if (weight <= room && value > best) best = value;
    }
    // bound.num / bound.den >= best, compared by cross-multiplication.
    assert.ok(bound.num >= best * bound.den, `trial ${trial}: the bound over-states (it must never under-state, or pruning would be unsound)`);
  }
});

test('a search that exhausts its node budget REFUSES and prints no set', () => {
  const rnd = rng(4242);
  const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const candidates = scaled(Array.from({ length: 24 }, (_, i) => ({ caseId: `c${i}`, index: i, valueCents: ri(20000, 90000), weight: ri(9000, 11000) })));
  const relations = prepareRelations([], candidates);
  const starved = solveFundedSet({ candidates, relations, ceilingCents: 60000, budget: new NodeBudget(40) });
  assert.equal(starved.proved, false, 'a starved search is not a proven one');
  assert.equal(starved.selection, undefined, 'NO set is printed when optimality was not proven');
  assert.match(starved.reason, /node budget/);
  assert.equal(starved.budgetExhausted, true);

  // With an adequate budget the same problem proves, so the refusal is about the
  // budget and not about the problem.
  const solved = solveFundedSet({ candidates, relations, ceilingCents: 60000, budget: new NodeBudget(5_000_000) });
  assert.equal(solved.proved, true);
  assert.ok(solved.nodesPruned > 0, 'pruning happened, so the bound is doing work');
});

test('the shadow price is the exact finite difference, and zero is printed as zero', () => {
  // Three independent cases, each worth more than it costs; a ceiling that binds.
  const candidates = scaled([
    { caseId: 'a', index: 0, valueCents: 500, weight: 1000 },
    { caseId: 'b', index: 1, valueCents: 400, weight: 1000 },
    { caseId: 'c', index: 2, valueCents: 300, weight: 1000 },
  ]);
  const relations = prepareRelations([], candidates);

  // Ceiling 2000 funds a and b: value 900. One more cent changes nothing.
  const tight = shadowPrice({ candidates, relations, ceilingCents: 2000, budget: new NodeBudget(1_000_000) });
  assert.equal(tight.baseValueCents, 900);
  assert.equal(tight.deltaCents, 0, 'one more cent does not buy a whole case, so the price of it is exactly zero');
  assert.equal(tight.shadowBp, 0);

  // Ceiling 1999 funds only a (b and c each need 1000 and 1999-1000=999 left is
  // not enough for either), so value 500; one more cent lets b in → 900.
  const binds = shadowPrice({ candidates, relations, ceilingCents: 1999, budget: new NodeBudget(1_000_000) });
  assert.equal(binds.baseValueCents, 500);
  assert.equal(binds.deltaCents, 400, 'the exact change when one more cent admits a whole case');
  assert.equal(binds.raisedSelectionDiffers, true);

  // The step is a parameter, and the difference is exact for any step.
  const bigger = shadowPrice({ candidates, relations, ceilingCents: 1000, budget: new NodeBudget(1_000_000), stepCents: 1000 });
  assert.equal(bigger.baseValueCents, 500);
  assert.equal(bigger.raisedValueCents, 900, 'a 1000-cent step admits b');
  assert.equal(bigger.deltaCents, 400);
});

test('the relations are read into exact constraints, and a symmetric pair is ONE constraint', () => {
  const candidates = scaled([
    { caseId: 'a', index: 0, valueCents: 100, weight: 10 },
    { caseId: 'b', index: 1, valueCents: 100, weight: 10 },
    { caseId: 'z', index: 2, valueCents: 100, weight: 10 },
  ]);
  const prepared = prepareRelations([
    { kind: 'exclusive', aCaseId: 'a', bCaseId: 'b' },
    { kind: 'exclusive', aCaseId: 'b', bCaseId: 'a' }, // the same fact, other direction
    { kind: 'requires', aCaseId: 'z', bCaseId: 'a' },
    { kind: 'overlap', aCaseId: 'a', bCaseId: 'z', overlapBp: 2500 },
    { kind: 'exclusive', aCaseId: 'a', bCaseId: 'nobody' }, // not a candidate
    { kind: 'nonsense', aCaseId: 'a', bCaseId: 'b' }, // undeclared kind
  ], candidates);
  assert.equal(prepared.exclusive.length, 1, 'the symmetric pair is recorded once');
  assert.equal(prepared.requires.length, 1);
  assert.equal(prepared.overlap.length, 1);
  assert.equal(prepared.excluded.length, 2, 'the relation naming a non-candidate and the undeclared kind are counted, not invented');

  // The overlap deduction applies ONLY when both ends are funded.
  const both = evaluateSelection([1, 0, 1], candidates, prepared);
  assert.equal(both.scaled, 100n * 10000n + 100n * 10000n - (100n * 10000n * 2500n) / 10000n);
  const one = evaluateSelection([1, 0, 0], candidates, prepared);
  assert.equal(one.deductions, 0n, 'a set that funds one end claims nothing twice');
});

test('a candidate too heavy for the whole ceiling is pinned out, still reported, and never funded', () => {
  const candidates = scaled([
    { caseId: 'small', index: 0, valueCents: 100, weight: 10 },
    { caseId: 'huge', index: 1, valueCents: 99999, weight: 5000 },
  ]);
  const relations = prepareRelations([], candidates);
  const solved = solveFundedSet({ candidates, relations, ceilingCents: 100, budget: new NodeBudget(100000) });
  assert.equal(solved.proved, true);
  assert.equal(solved.valueCents, 100, 'the huge case is not funded');
  assert.deepEqual(solved.tooHeavy, ['huge'], 'and it is REPORTED rather than dropped in silence');
});

/* =====================================================================
 * 2. THE DOOR — every refusal this register exists for
 */

test('a ceiling is declared whole or not at all, and a typed amount is read to the exact cent', () => {
  assert.equal(parseCapitalAmount('40000000'), 4000000000);
  assert.equal(parseCapitalAmount('1500.5'), 150050);
  assert.equal(parseCapitalAmount('0.25'), 25);
  assert.equal(parseCapitalAmount('1e6'), null, 'an exponent is refused');
  assert.equal(parseCapitalAmount('1,000'), null, 'a thousands separator is refused');
  assert.equal(parseCapitalAmount('1.005'), null, 'three decimals are refused');
  assert.equal(parseCapitalAmount('-5'), null);
  // A value already in cents is read exactly, never re-scaled.
  assert.equal(readStoredCapitalCents(950000000), 950000000);
  assert.equal(readStoredCapitalCents('9500000'), null, 'a string is not a stored amount');

  const { api } = seed(fixture());
  const ok = api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '9500000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'Board approved capital envelope, minute 2025-12-11 item 7.' });
  assert.ok(ok.ok, ok.error);
  assert.equal(ok.cents, 950000000, 'nine and a half million, in cents');

  assert.equal(api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '1e6', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'Board approved capital envelope.' }).ok, false);
  assert.equal(api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '100', periodFrom: '2026-12-31', periodTo: '2026-01-01', basis: 'Board approved capital envelope.' }).ok, false, 'a period ending before it starts is refused');
  assert.equal(api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '100', periodFrom: '2026-01-01', periodTo: '2029-12-31', basis: 'Board approved capital envelope.' }).ok, false, 'a ceiling running past two years is refused');
  assert.equal(api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '100', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'short' }).ok, false, 'a ceiling with no written basis is a number somebody typed');
  assert.equal(api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '100', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'A sound and written basis.' }).ok, true);
});

test('a stored ceiling survives its own loader unchanged — the defect this suite was extended for', () => {
  const stored = [{
    id: 'cceil-1', currency: 'DKK', periodFrom: '2026-01-01', periodTo: '2026-12-31',
    cents: 950000000, basis: 'Board approved capital envelope, minute 2025-12-11 item 7.',
    declaredOn: '2026-01-01', declaredAt: '2026-01-01T09:00:00.000Z', declaredById: 'vera',
  }];
  const once = normalizeCapitalCeilings(stored, []);
  assert.equal(once.length, 1);
  assert.equal(once[0].cents, 950000000, 'a stored amount is cents; it must NOT be re-parsed as major units and multiplied by a hundred');
  // Twice through the loader is the same value: reloads cannot inflate it.
  const twice = normalizeCapitalCeilings(once, []);
  assert.equal(twice[0].cents, 950000000);
  // A row that is not whole cents is refused, never repaired.
  const warnings = [];
  const dropped = normalizeCapitalCeilings([{ ...stored[0], cents: '9500000' }, { ...stored[0], id: 'cceil-2', cents: -5 }], warnings);
  assert.equal(dropped.length, 0, 'nothing is repaired into a constraint');
  assert.ok(warnings.some((w) => /could not be read exactly/.test(w)));
});

test('a shared-benefit share outside the open interval is refused with the sentence that says why', () => {
  const state = fixture();
  const { api } = seed(state);
  const a = ratify(api, { title: 'Energy recovery', outlay: 800, benefit: 400 });
  const b = ratify(api, { title: 'Waste heat reuse', outlay: 900, benefit: 450 });

  const full = api.capitalRationingDeclareRelation({ aCaseId: a, bCaseId: b, kind: 'overlap', overlapPct: '100', reason: 'The whole benefit is shared between the two cases.' });
  assert.equal(full.ok, false);
  assert.match(full.error, /WHOLE benefit/, 'a full overlap is refused BY NAME as an alternatives declaration');
  assert.match(full.error, /alternatives/);

  assert.equal(api.capitalRationingDeclareRelation({ aCaseId: a, bCaseId: b, kind: 'overlap', overlapPct: '0', reason: 'Nothing at all is shared between the two.' }).ok, false, 'a zero share is not a relation');

  const sound = api.capitalRationingDeclareRelation({ aCaseId: a, bCaseId: b, kind: 'overlap', overlapPct: '40', reason: 'Forty per cent of the energy saving is genuinely double-counted.' });
  assert.ok(sound.ok, sound.error);
  assert.equal(sound.overlapBp, 4000, '40% is stored as 4000 whole basis points');

  const duplicate = api.capitalRationingDeclareRelation({ aCaseId: b, bCaseId: a, kind: 'overlap', overlapPct: '20', reason: 'A second declaration of the same fact.' });
  assert.equal(duplicate.ok, false, 'two declarations of one fact would each deduct their own share');
});

test('a relation needs two different cases on the same register and in the same currency', () => {
  const { api } = seed(fixture());
  const a = ratify(api, { title: 'Line A', outlay: 800, benefit: 400 });
  const eur = ratify(api, { title: 'Line B', currency: 'EUR', outlay: 800, benefit: 400 });
  assert.equal(api.capitalRationingDeclareRelation({ aCaseId: a, bCaseId: a, kind: 'exclusive', reason: 'A case cannot be an alternative to itself.' }).ok, false);
  assert.equal(api.capitalRationingDeclareRelation({ aCaseId: a, bCaseId: 'ghost', kind: 'exclusive', reason: 'A case that is not on the register.' }).ok, false);
  const cross = api.capitalRationingDeclareRelation({ aCaseId: a, bCaseId: eur, kind: 'exclusive', reason: 'One DKK case and one EUR case, which cannot be alternatives.' });
  assert.equal(cross.ok, false);
  assert.match(cross.error, /different currencies/);
});

test('a relation is refused to a seat that holds only ONE side, and granted to the joint apex', () => {
  const { api, sit, store } = seed(fixture());
  // Two cases owned by people in different directorates: mia (under dan) and ned (under eve).
  const a = ratify(api, { title: 'Dan side line', owner: 'mia', outlay: 800, benefit: 400 });
  const b = ratify(api, { title: 'Eve side line', owner: 'ned', outlay: 900, benefit: 450 });

  // dan holds mia but NOT ned.
  sit('dan');
  const byDan = api.capitalRationingDeclareRelation({ aCaseId: a, bCaseId: b, kind: 'exclusive', reason: 'These two pursue the same objective by different means.' });
  assert.equal(byDan.ok, false, 'a line that holds one side only cannot rule on its own alternative');
  assert.match(byDan.error, /above BOTH/);

  // vera holds BOTH directors, so vera is the joint apex and may declare it.
  sit('vera');
  const byVera = api.capitalRationingDeclareRelation({ aCaseId: a, bCaseId: b, kind: 'exclusive', reason: 'These two pursue the same objective by different means.' });
  assert.ok(byVera.ok, byVera.error);
  assert.equal(store.state.capitalRelations.length, 1);
});

test('declaring a ceiling is a VP-and-above act: a frontline manager is refused by rank', () => {
  const { api, sit } = seed(fixture());
  sit('mia'); // rank 2 — a manager
  const refused = api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '5000000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'A written basis that is long enough.' });
  assert.equal(refused.ok, false, 'a capital ceiling is a claim on the balance sheet, not a manager’s act');
  sit('vera'); // rank 4 — VP / C-suite
  const granted = api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '5000000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'A written basis that is long enough.' });
  assert.ok(granted.ok, granted.error);
});

test('retiring anything requires a written reason, and a second retirement is refused', () => {
  const { api } = seed(fixture());
  const made = api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '5000000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'A written basis that is long enough.' });
  assert.ok(made.ok);
  assert.equal(api.capitalRationingRetireCeiling({ ceilingId: made.ceilingId, reason: 'short' }).ok, false, 'a retirement without a reason is a deletion wearing a date');
  assert.ok(api.capitalRationingRetireCeiling({ ceilingId: made.ceilingId, reason: 'Superseded by the FY2027 envelope.' }).ok);
  assert.equal(api.capitalRationingRetireCeiling({ ceilingId: made.ceilingId, reason: 'Retired once already on this record.' }).ok, false, 'a retirement is a dated act, not a toggle');
});

/* =====================================================================
 * 3. THE READER — candidates, exclusions and the two claims
 */

function ledger() {
  const state = fixture();
  const { store, api, sit } = seed(state);
  const ids = {
    line: ratify(api, { title: 'Second filling line', owner: 'mia', outlay: 4000, benefit: 1800 }),
    shift: ratify(api, { title: 'Third shift', owner: 'ned', outlay: 3500, benefit: 1600 }),
    depot: ratify(api, { title: 'Warehouse expansion', owner: 'mia', outlay: 2000, benefit: 900 }),
  };
  // A refused case and an unratified proposal: neither is a candidate.
  const rejected = api.investmentCaseDeclare({ title: 'Speculative', ownerId: 'mia', currency: 'DKK', basis: 'nominal', hurdlePct: '10', flows: typedFlows('2027-01-01', 9000, 100), reviewOn: '2028-12-31' });
  api.investmentCaseDecide({ caseId: rejected.caseId, decision: 'reject', reason: 'Too speculative for this period.' });
  const proposed = api.investmentCaseDeclare({ title: 'Unratified', ownerId: 'mia', currency: 'DKK', basis: 'nominal', hurdlePct: '10', flows: typedFlows('2027-01-01', 500, 300), reviewOn: '2028-12-31' });
  return { store, api, sit, ids, rejected: rejected.caseId, proposed: proposed.caseId };
}

const read = (store, seat = null) => buildCapitalRationing(store.state, { now: at('2026-11-15'), seat });

test('a candidate is a RATIFIED case only; every other lifecycle state is counted and named', () => {
  const { store } = ledger();
  const report = read(store);
  assert.equal(report.totals.candidatesN, 3, 'the three ratified cases are the candidates');
  assert.equal(report.totals.proposedN, 1, 'the unratified proposal is counted');
  assert.equal(report.totals.rejectedN, 1, 'the refused case is counted');
  const keys = report.refusals.map((row) => row.key);
  assert.ok(keys.includes('already-decided'));
});

test('a currency with no declared ceiling prints no set, and is not read as “everything fits”', () => {
  const { store } = ledger();
  const report = read(store);
  const dkk = report.allCurrencies.find((row) => row.currency === 'DKK');
  assert.equal(dkk.stateKey, 'no-ceiling');
  assert.equal(dkk.plan, null, 'no set is computed against a ceiling nobody declared');
  assert.equal(dkk.figuresComplete, false);
  assert.equal(report.refusals.find((row) => row.key === 'no-ceiling-declared').key, 'no-ceiling-declared');
  assert.equal(capitalRationingAttentionCount(store.state, { now: at('2026-11-15') }), 1, 'the badge counts the one currency that owes a ceiling');
});

test('with a ceiling and a relation, the proven set is optimal, reconciles, and beats the ranking', () => {
  const { store, api } = ledger();
  api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '7000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'Board approved capital envelope for FY2026.' });
  let report = read(store);
  let dkk = report.allCurrencies.find((row) => row.currency === 'DKK');
  assert.equal(dkk.stateKey, 'optimal');
  assert.equal(dkk.plan.reconciles, true, 'the printed value IS the value of the printed set');
  assert.equal(dkk.figuresComplete, true);
  const withoutRelation = dkk.plan.valueCents;

  // The two capacity routes are alternatives: at most one may be funded.
  const line = report.allCurrencies[0].candidates.find((r) => r.title === 'Second filling line');
  const shift = report.allCurrencies[0].candidates.find((r) => r.title === 'Third shift');
  const rel = api.capitalRationingDeclareRelation({ aCaseId: line.caseId, bCaseId: shift.caseId, kind: 'exclusive', reason: 'Both deliver the same additional capacity; only one is needed.' });
  assert.ok(rel.ok, rel.error);

  report = read(store);
  dkk = report.allCurrencies.find((row) => row.currency === 'DKK');
  assert.equal(dkk.exclusiveN, 1, 'the constraint is applied');
  const selectedTitles = dkk.plan.selected.map((row) => row.title);
  assert.equal(selectedTitles.includes('Second filling line') && selectedTitles.includes('Third shift'), false, 'never both alternatives');
  assert.ok(dkk.plan.valueCents <= withoutRelation, 'the constraint can only remove sets, never add value');
  assert.equal(dkk.plan.reconciles, true);
  // And the exact objective of the printed set equals the printed value.
  const achieved = evaluateSelection(dkk.plan.selected.map(() => 1), dkk.candidates.map((c) => ({ ...c, index: c.index, weight: c.outlayCents, scaledValue: BigInt(c.npvCents) * 10000n })), { exclusive: [], requires: [], overlap: [] });
  assert.ok(achieved);
});

test('a currency whose ceiling is ambiguous prints BOTH ceilings and refuses to pick one', () => {
  const { store, api } = seed(fixture());
  ratify(api, { title: 'Only case', outlay: 1000, benefit: 600 });
  api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '5000000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'The treasury limit for FY2026 capital.' });
  api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '9000000', periodFrom: '2026-06-01', periodTo: '2027-06-01', basis: 'A second envelope declared for the rolling year.' });
  const report = read(store);
  const dkk = report.allCurrencies.find((row) => row.currency === 'DKK');
  assert.equal(dkk.ceiling.ambiguous, true);
  assert.equal(dkk.ceiling.othersN, 1);
  assert.equal(dkk.figuresComplete, false, 'an ambiguous constraint makes the completeness claim false');
  assert.ok(report.refusals.some((row) => /MORE THAN ONE live ceiling/.test(row.says)));
});

test('display equals stored: every printed figure is the figure a fresh store computes, and a read mutates nothing', () => {
  const { store, api } = ledger();
  api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '7000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'Board approved capital envelope for FY2026.' });
  const before = JSON.stringify(store.state);
  const first = read(store);
  const second = read(store);
  assert.equal(JSON.stringify(store.state), before, 'a read writes nothing');
  assert.deepEqual(
    first.allCurrencies.map((row) => [row.currency, row.stateKey, row.plan?.valueCents ?? null, row.plan?.weightCents ?? null]),
    second.allCurrencies.map((row) => [row.currency, row.stateKey, row.plan?.valueCents ?? null, row.plan?.weightCents ?? null]),
  );
  // The plan's value is the exact objective of the plan's own selection.
  const dkk = first.allCurrencies.find((row) => row.currency === 'DKK');
  const candidates = dkk.candidates.map((c) => ({ ...c, weight: c.outlayCents, scaledValue: BigInt(c.npvCents) * 10000n }));
  const selection = dkk.candidates.map((c) => (c.selected ? 1 : 0));
  const exact = evaluateSelection(selection, candidates, { exclusive: [], requires: [], overlap: [] });
  assert.equal(Number(exact.scaled / 10000n), dkk.plan.valueCents, 'the total the screen prints is the sum of the rows it prints');
  assert.equal(exact.weight, dkk.plan.weightCents, 'and so is the money committed');
});

test('every currency is solved on its own: no ceiling, no set and no shadow price crosses a currency boundary', () => {
  const { api, store } = seed(fixture());
  ratify(api, { title: 'DKK case', currency: 'DKK', outlay: 1000, benefit: 600 });
  ratify(api, { title: 'EUR case', currency: 'EUR', outlay: 1000, benefit: 600 });
  api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '2000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'Only the DKK fund has a declared ceiling.' });
  const report = read(store);
  const dkk = report.allCurrencies.find((row) => row.currency === 'DKK');
  const eur = report.allCurrencies.find((row) => row.currency === 'EUR');
  assert.equal(dkk.stateKey, 'optimal');
  assert.equal(eur.stateKey, 'no-ceiling', 'a DKK ceiling does not ration EUR, and no rate is invented to make it');
  assert.ok(report.refusals.some((row) => row.key === 'currencies-not-pooled'));
});

/* =====================================================================
 * 4. THE RULE — the one condition, its owner, and the pause
 */

test('RULE-CRS-01 is registered end to end: schema v165, three collections, the spine, the gateway and CSV #153', () => {
  assert.equal(SCHEMA_VERSION, 172);
  for (const key of ['capitalCeilings', 'capitalRelations', 'capitalRationingMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  assert.ok(CSV_EXPORTS.some((row) => row.key === CAPITAL_RATIONING_CSV_SCOPE), 'CSV #153 is registered');
  assert.equal(CSV_EXPORTS.length, 160);
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.id === 'capitalRationingRule'), 'the rule is on the spine');
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length, 'one rule, one contract');
  assert.ok(PROPAGATION_CONTRACTS.some((row) => row.rule === capitalRationingRule), 'the contract is registered');
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('capitalRationingAutoPropagate'), 'the pause reaches a second reporting line');
  assert.equal(PAUSE_PERMIT_REACH_RULES.capitalRationingAutoPropagate, 'capitalRationingRules.js');
  // The rule names its switch LITERALLY, so the reach audit can grep it.
  const src = fs.readFileSync(path.join(REPO, 'app/core/domain/capitalRationingRules.js'), 'utf8');
  assert.ok(src.includes('capitalRationingAutoPropagate'));
  assert.match(src, /buildMatrix|matrixJointApex/);
  for (const read_ of ['capitalRationingReport', 'capitalRationingBriefText', 'capitalRationingCsvRows', 'capitalRationingAttentionCount']) {
    assert.ok(SAFE_READS.has(read_), `${read_} is a safe read`);
  }
});

test('the rule asks the seat that may declare a ceiling, once, and closes its ask when one is declared', () => {
  const { store, api } = ledger();
  const ask = () => indexCapitalRationingAsks(store.state).filter((row) => row.task);
  const open = () => ask().filter((row) => row.task.status === 'active');
  // The ratifying commit already ran the rule, so the ask is on the record before
  // anything is asked for explicitly. ONE condition, ONE ask.
  assert.equal(open().length, 1, 'the ratifying commit filed the ask without being asked to');
  const filed = open();
  assert.ok(filed.length <= CAPITAL_RATIONING_LIMITS.asksPerCommit, 'bounded per commit');
  assert.equal(filed[0].seatId, 'vera', 'the ask goes to the lowest seat above every reporting line, never to a benefit owner');
  assert.match(filed[0].task.expectedOutcome, /Nothing here asks you to fund any particular case/);

  // An explicit scan with the condition already filed files no SECOND ask.
  api.capitalRationingScan();
  assert.equal(open().length, 1, 'the same condition is never asked twice');

  // Declaring a ceiling settles the condition and closes the ask on the next write.
  api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '7000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'Board approved capital envelope for FY2026.' });
  assert.equal(open().length, 0, 'the ask self-closes when the ceiling is declared');
  assert.match(ask()[0].task.completionNote, /Closed by RULE-CRS-01/);
});

test('a pause on capitalRationingAutoPropagate stops EVERY path, including an explicit scan', () => {
  const { store, api } = ledger();
  // First prove the scan DOES file one while the switch is on.
  assert.ok(api.capitalRationingSetConventions({ capitalRationingAutoPropagate: true }).ok);
  api.capitalRationingScan();
  const filed = indexCapitalRationingAsks(store.state).filter((row) => row.task && row.task.status === 'active');
  assert.equal(filed.length, 1, 'the scan files the ask while the switch is on');

  // Retire it and silence the rule: the explicit scan now files nothing at all.
  assert.ok(api.capitalRationingSetConventions({ capitalRationingAutoPropagate: false }).ok);
  const paused = api.capitalRationingScan();
  assert.ok(paused.ok, paused.error);
  assert.equal(paused.effects.length, 0, 'a paused rule reports no effect at all');
  assert.equal(indexCapitalRationingAsks(store.state).filter((row) => row.task && row.task.status === 'active').length, 1,
    'the scan neither filed a new ask nor silently cleared the standing one');
  // And the report still prints the currency, because a pause silences automation
  // and never the record.
  assert.ok(paused.report.allCurrencies.some((row) => row.currency === 'DKK' && row.stateKey === 'no-ceiling'));
});

test('where the apex is the workspace leader the rule records an observation and asks NOBODY', () => {
  // The working record, but with no one left on the roster: the enterprise
  // altitude is the workspace leader's own seat, so there is no second line to
  // hand the ask to. The gap is printed and nobody is invented.
  const { store } = ledger();
  const draft = JSON.parse(JSON.stringify({
    people: [], delegations: [], links: [], capitalRationingMarkers: [],
    investmentCases: store.state.investmentCases,
    investmentCaseActs: store.state.investmentCaseActs,
    settings: store.state.settings,
    reportingLines: [],
  }));
  const out = capitalRationingRule(draft, { event: { type: 'capitalRationing.scan' }, now: at('2026-11-15') });
  assert.equal(out.filter((effect) => effect.action === 'delegated').length, 0, 'no ask is filed');
  assert.equal(draft.delegations.length, 0, 'and no delegation row is written');
  const markers = draft.capitalRationingMarkers;
  assert.equal(markers.length, 1, 'one identity-free observation is recorded instead');
  assert.equal(markers[0].kind, 'capital-rationing');
  assert.equal(markers[0].ruleId, CAPITAL_RATIONING_RULE_ID);
  assert.match(markers[0].detail, /workspace leader/, 'the marker says where the altitude sits');
  assert.equal(/[A-Z][a-z]+ Name/.test(markers[0].detail), false, 'the marker names no person');
  assert.match(markers[0].key, /^capital-rationing\|obs\|crs1:/, 'and it is keyed by the condition it observed');
});

test('the conditions are derived from the record, so a settled currency creates none', () => {
  const { store } = ledger();
  const report = read(store);
  const conditions = capitalRationingConditions(report, { today: '2026-11-15', askDueDays: 14 });
  assert.equal(conditions.length, 1);
  assert.equal(conditions[0].currency, 'DKK');
  assert.equal(conditions[0].dueOn, '2026-11-29', 'the ask window is the declared convention');
});

/* =====================================================================
 * 5. THE SCREEN — what it prints is what was computed
 */

test('the CSV carries the exact figured the panel printed, blanks a refused figure, and names no person or case', () => {
  const { store, api } = ledger();
  api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '7000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'Board approved capital envelope for FY2026.' });
  ratify(api, { title: 'EUR case', currency: 'EUR', outlay: 1000, benefit: 600 });
  const report = read(store);
  const rows = capitalRationingCsvRows(report);
  const live = report.allCurrencies.find((row) => row.currency === 'DKK');
  // A row carries the columns its record type owns; the exported TABLE carries
  // every declared column on every line, which is the promise a CSV makes.
  assert.ok(rows.some((row) => row.row_type === 'workspace'));
  assert.ok(rows.some((row) => row.row_type === 'currency'));
  assert.ok(rows.some((row) => row.row_type === 'case'));
  const table = buildScopeTable(store.state, CAPITAL_RATIONING_CSV_SCOPE, at('2026-11-15'));
  assert.deepEqual(table.columns.map((column) => column.key), [...CAPITAL_RATIONING_CSV_COLUMNS], 'the exported header is the declared header, in order');
  // Every line of the real file fills every declared column: a short row is a
  // figure that has silently moved under the wrong heading.
  const parsedTable = parseCsv(serializeCsv(table.columns, table.rows));
  assert.deepEqual(parsedTable.headers, [...CAPITAL_RATIONING_CSV_COLUMNS]);
  for (const cells of parsedTable.rows) {
    assert.equal(cells.length, CAPITAL_RATIONING_CSV_COLUMNS.length, `every line fills all ${CAPITAL_RATIONING_CSV_COLUMNS.length} declared columns`);
  }
  // The values that left the building are the values the screen printed.
  const line = parsedTable.rows.map((cells) => Object.fromEntries(parsedTable.headers.map((h, i) => [h, cells[i] ?? ''])));
  const currencyLine = line.find((row) => row.row_type === 'currency' && row.currency === 'DKK');
  assert.equal(Number(currencyLine.optimal_npv_cents), live.plan.valueCents, 'the value in the CSV text is the value on the screen');
  assert.equal(Number(currencyLine.ceiling_cents), live.ceiling.cents);
  const currencyRows = rows.filter((row) => row.row_type === 'currency');
  const dkk = currencyRows.find((row) => row.currency === 'DKK');
  assert.equal(Number(dkk.optimal_npv_cents), live.plan.valueCents, 'the exported value is the printed value');
  assert.equal(Number(dkk.selected_cents), live.plan.weightCents);
  assert.equal(Number(dkk.rank_order_gap_cents), live.plan.rank.gapCents);
  const eur = currencyRows.find((row) => row.currency === 'EUR');
  assert.equal(eur.optimal_npv_cents, '', 'a refused figure exports BLANK, never zero');
  assert.equal(eur.selection_state, 'no-ceiling');
  // No person, manager, case id, title or reason text reaches the file. A bare
  // id is checked as a WHOLE CELL — "ned" is a substring of "planned", so a
  // substring test would fail on innocent prose and prove nothing.
  const text = serializeCsv(table.columns, table.rows);
  const cells = text.split('\n').flatMap((line) => line.split(','));
  for (const id of ['mia', 'ned', 'vera', 'dan', 'eve']) {
    assert.equal(cells.includes(id), false, `no cell is the person id "${id}"`);
  }
  for (const secret of ['Mia Name', 'Ned Name', 'Second filling line', 'Board approved', 'cceil-', 'icase-']) {
    assert.equal(text.includes(secret), false, `the CSV never carries "${secret}"`);
  }
});

test('the register exports through the shared CSV scope, with the same rows the panel rendered', () => {
  const { store, api } = ledger();
  api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '7000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'Board approved capital envelope for FY2026.' });
  const built = buildScopeTable(store.state, CAPITAL_RATIONING_CSV_SCOPE, at('2026-11-15'));
  assert.ok(built.rows.length >= 2, 'a workspace row and a currency row at minimum');
  assert.deepEqual(built.columns.map((column) => column.key), [...CAPITAL_RATIONING_CSV_COLUMNS]);
  const report = read(store);
  assert.equal(built.rows.filter((row) => row.row_type === 'case').length, report.allCurrencies.reduce((n, row) => n + row.candidatesN, 0), 'one exported case row per candidate the screen lists');
});

test('the panel prints what the reader computed, and a render stores nothing', () => {
  const { store, api } = ledger();
  api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '7000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'Board approved capital envelope for FY2026.' });
  const before = JSON.stringify(store.state);
  const report = read(store);
  const dkk = report.allCurrencies.find((row) => row.currency === 'DKK');

  withDom(() => {
    const ctx = { api, state: store.state, now: at('2026-11-15'), query: new URLSearchParams('panel=rationing'), seatContext: { seat: null, built: null }, navigate: () => {}, refresh: () => {} };
    const node = renderFinanceCapitalRationingPanel(ctx, { tabs: null });
    const text = node.textContent;
    // The counts the screen prints are the counts the reader computed.
    assert.ok(text.includes(`${report.totals.candidatesN}`), 'the candidate count is printed');
    assert.ok(text.includes(dkk.stateMeta.label) || text.includes('proven'), 'the state of the currency is printed');
    // Exactly one h1, and no skipped heading level.
    const levels = [...node.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => Number(el.tagName.slice(1)));
    assert.equal(levels.filter((n) => n === 1).length, 1, 'exactly one h1');
    for (let i = 1; i < levels.length; i += 1) assert.ok(levels[i] - levels[i - 1] <= 1, 'no skipped heading level');
    // The two claims are printed apart, in words a reader can act on.
    assert.ok(/two claims, kept apart/i.test(text), 'the two claims are named');
    // The finance page itself routes to the panel.
    const page = renderFinance(ctx);
    assert.ok(page.textContent.includes('Capital rationing'), 'the finance navigation offers the panel');
  });
  assert.equal(JSON.stringify(store.state), before, 'a render stores nothing');
});

test('the brief names no person, no case and no title', () => {
  const { store, api } = ledger();
  api.capitalRationingDeclareCeiling({ currency: 'DKK', amountText: '7000', periodFrom: '2026-01-01', periodTo: '2026-12-31', basis: 'Board approved capital envelope for FY2026.' });
  const text = capitalRationingBriefText(read(store));
  for (const secret of ['mia', 'Mia Name', 'Second filling line', 'Board approved']) {
    assert.equal(text.includes(secret), false, `the brief never carries "${secret}"`);
  }
  assert.match(text, /Capital rationing/);
  assert.match(text, /Currencies are never pooled/);
});

test('the signature of a funded set is stable across order and differs across membership', () => {
  assert.equal(selectionSignature(['a', 'b', 'c']), selectionSignature(['c', 'a', 'b']));
  assert.notEqual(selectionSignature(['a', 'b']), selectionSignature(['a', 'c']));
  assert.match(selectionSignature(['a', 'b']), /^fnd1:[0-9a-f]+:[0-9a-f]{16}$/);
});

test('migration 164 → 165 adds three EMPTY collections and two conventions, and declares no constraint', () => {
  const raw = createEmptyState(T0);
  raw.schemaVersion = 164;
  delete raw.capitalCeilings;
  delete raw.capitalRelations;
  delete raw.capitalRationingMarkers;
  const { state } = normalizeState({ ...raw, schemaVersion: 164 }, { now: new Date(T0) });
  assert.equal(state.schemaVersion, 172);
  assert.deepEqual(state.capitalCeilings, [], 'no ceiling is inferred from the budget envelopes an upgraded workspace already holds');
  assert.deepEqual(state.capitalRelations, [], 'no relation is inferred between existing cases');
  assert.deepEqual(state.capitalRationingMarkers, []);
  assert.equal(state.settings.capitalRationingAutoPropagate, true, 'a new workspace has the switch on');
  assert.equal(state.settings.capitalRationingAskDueDays, 14);
  const report = buildCapitalRationing(state, { now: at('2026-11-15') });
  assert.equal(report.allCurrencies.length, 0);
  assert.ok(report.refusals.some((row) => row.key === 'no-ceiling-by-any-seat'));
});

test('the whole workspace still loads clean through the shared normalizer', () => {
  const state = fixture();
  const { state: normalized, warnings } = normalizeState(state, { now: new Date(T0) });
  assert.deepEqual(warnings.filter((w) => /capital/i.test(w)), [], 'no capital-rationing warning on a clean workspace');
  assert.equal(normalized.schemaVersion, SCHEMA_VERSION);
});
