// ADR-0213 — Flexible-Budget Variance Statement.
//
// The statement's claims are arithmetic and governance, so the tests are too.
// One focused pass over what Session 286 built:
//
//   1. the exact kernel is checked against an INDEPENDENT oracle written here
//      from the textbook definitions, on a hand-worked case and on randomised
//      problems — every identity is re-added, and no printed cell may sit a
//      whole cent from its exact value;
//   2. an interim reading withholds the activity and fixed-cost variances, a
//      line that consumed nothing does not split its price, and a pool of one
//      has no mix;
//   3. a typed amount is refused rather than rounded, and a stored amount is
//      not re-scaled on reload — the stored row IS the loaded row;
//   4. a budget holder never declares their own standard, one line never names
//      a peer line's manager as an owner, a partial recording is refused;
//   5. in a matrix a cost object is counted once, the joint price × quantity
//      term is shared between two owners and added to neither, and the
//      attribution re-adds to the variance it divides;
//   6. what the panel prints is what the reader computed, what the CSV exports
//      is the same integer, and a read mutates nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { COLLECTIONS, createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { CSV_EXPORTS, buildScopeTable, serializeCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import {
  buildFlexBudget,
  flexBudgetAttentionCount,
  flexBudgetCsvRows,
  flexMoney,
  flexVarianceText,
} from '../../app/core/domain/flexBudget.js';
import { apportion, computeFlexStatement, isMaterial, rat, rRound } from '../../app/core/domain/flexBudgetMath.js';
import {
  FLEX_BUDGET_CSV_COLUMNS,
  FLEX_BUDGET_CSV_DESCRIPTOR,
  FLEX_BUDGET_CSV_SCOPE,
  FLEX_BUDGET_RIGHTS,
  FLEX_BUDGET_SETTING_KEYS,
} from '../../app/core/domain/flexBudgetRegistry.js';
import {
  normalizeFlexBudgetActuals,
  normalizeFlexBudgetPlans,
  parseFlexMoney,
  parseFlexPrice,
  parseFlexQuantity,
} from '../../app/core/domain/flexBudgetSchema.js';
import { renderFinance } from '../../app/views/finance.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T0 = '2026-11-15T12:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);

// vera (VP) → dan, eve (directors) → mia, ned (managers) → ivo, kai. mia also
// answers to eve on a declared project line, so mia's cost object is reached by
// two lines — the matrix case the statement exists for.
const person = (id, managerId, level) => ({ id, name: `${id[0].toUpperCase()}${id.slice(1)} Name`, managerId, level, role: 'Operations', status: 'active', startDate: '2026-01-01T09:00:00.000Z', createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:00:00.000Z' });

function fixture(now = T0) {
  const raw = createEmptyState(now);
  raw.people = [
    person('vera', null, 'vp'),
    person('dan', 'vera', 'director'),
    person('eve', 'vera', 'director'),
    person('mia', 'dan', 'manager'),
    person('ned', 'eve', 'manager'),
    person('ivo', 'mia', 'ic'),
    person('kai', 'ned', 'ic'),
  ];
  raw.reportingLines = [{ id: 'rl-mia-eve', personId: 'mia', managerId: 'eve', kind: 'project', shareH: 30, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '' }];
  return normalizeState(raw, { now: new Date(now) }).state;
}

function seed(state = fixture(), startAt = T0) {
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
  return { store, api, sit, on, values };
}

const LINES = [
  'variable; Senior engineers; 1200 h; 650; labour; rate=eve; usage=dan',
  'variable; Engineers; 2400 h; 380; labour',
  'variable; Cloud compute; 90000 vCPU-h; 0.42',
  'fixed; Tooling licences; 180000',
].join('\n');
const planInput = (extra = {}) => ({
  title: 'Service desk — October', ownerId: 'mia', currency: 'DKK', periodFrom: '2026-10-01', periodTo: '2026-10-31',
  driverLabel: 'tickets resolved', volume: '4000', materialityAmount: '5000', materialityPercent: '2',
  linesText: LINES, rateOwnerId: 'eve', usageOwnerId: 'mia', volumeOwnerId: 'vera',
  basis: 'Approved FY26 operating budget, rate card v3.', ...extra,
});
const ACTUALS = 'L1; 1510.5; 998765.43\nL2; 2290.25; 880123.45\nL3; 101234.567; 44000.01\nL4; 182500\nunplanned; Emergency contractor; 1234.56';
const actualInput = (planId, extra = {}) => ({ planId, asOf: '2026-10-31', volume: '4370', linesText: ACTUALS, basis: 'October ledger close, extract of 2026-11-04.', ...extra });

/** vera declares the matrix plan for mia; mia records the final actuals. */
function declaredAndRecorded() {
  const env = seed();
  env.sit('vera');
  const made = env.api.flexBudgetDeclarePlan(planInput());
  assert.ok(made.ok, made.error);
  env.sit('mia');
  const rec = env.api.flexBudgetRecordActuals(actualInput(made.planId));
  assert.ok(rec.ok, rec.error);
  return { ...env, planId: made.planId, actualId: rec.actualId };
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'Event', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value = typeof dom.window[key] === 'function' ? dom.window[key].bind(dom.window) : dom.window[key];
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
 * 1. THE KERNEL — against an oracle written here from the definitions
 */

// The oracle's own fractions: a pair of BigInts compared by cross-multiplying.
// Deliberately NOT the kernel's `rat`, and never reduced.
const F = (n, d = 1n) => ({ n: BigInt(n), d: BigInt(d) });
const fAdd = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
const fSub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
const fMul = (a, b) => F(a.n * b.n, a.d * b.d);
const fDiv = (a, b) => F(a.n * b.d, a.d * b.n);
const same = (kernel, oracle) => kernel.n * oracle.d === oracle.n * kernel.d;
const abs = (x) => (x < 0n ? -x : x);
/** |printed − exact| < 1, by integers only. */
const withinACent = (printed, exact) => abs(BigInt(printed) * exact.d - exact.n) < abs(exact.d);

/** The textbook definitions, for one variable line. Cents throughout. */
function oracleLine(plan, actual, line, row) {
  const ratio = F(actual.volumeE3, plan.volumeE3);
  const SP = F(line.priceE4, 100000n); // cents per thousandth of a unit
  const SQ = fMul(F(line.qtyE3), ratio); // standard quantity allowed, thousandths
  const AQ = F(row.qtyE3);
  const staticBudget = fMul(F(line.qtyE3), SP);
  const flex = fMul(SQ, SP);
  const out = { static: staticBudget, flex, activity: fSub(flex, staticBudget), efficiency: fMul(fSub(AQ, SQ), SP) };
  if (row.qtyE3 > 0) {
    const AP = fDiv(F(row.cents), AQ);
    out.price = fMul(fSub(AP, SP), SQ);
    out.joint = fMul(fSub(AP, SP), fSub(AQ, SQ));
    out.conventionalPrice = fMul(fSub(AP, SP), AQ);
  } else {
    out.price = fSub(F(row.cents), fMul(AQ, SP));
    out.joint = null;
  }
  return out;
}

test('ADR-0213 kernel: the hand-worked textbook case comes out to the cent, exactly', () => {
  // 1,000 units planned at 2 kg each and 5.00 per kg → static 10,000.00.
  // 1,100 units made with 2,300 kg costing 12,650.00 (5.50 per kg).
  const plan = { volumeE3: 1_000_000, lines: [{ key: 'L1', behaviour: 'variable', qtyE3: 2_000_000, priceE4: 50_000, pool: null }] };
  const actual = { volumeE3: 1_100_000, final: true, lines: [{ key: 'L1', qtyE3: 2_300_000, cents: 1_265_000 }], unplanned: [] };
  const s = computeFlexStatement(plan, actual);
  assert.equal(s.ok, true);
  const c = s.lines[0].cents;
  assert.equal(c.static, 1_000_000, 'static budget 10,000.00');
  assert.equal(c.flex, 1_100_000, 'flexible budget = 2,200 kg × 5.00');
  assert.equal(c.activity, 100_000, 'activity = 1,000.00 unfavourable: more work, not overspending');
  assert.equal(c.price, 110_000, 'pure price = 0.50 × 2,200 kg allowed');
  assert.equal(c.joint, 5_000, 'joint = 0.50 × 100 kg over');
  assert.equal(c.efficiency, 50_000, 'efficiency = 100 kg × 5.00 standard');
  assert.equal(c.price + c.joint, 115_000, 'pure + joint is the conventional price variance (0.50 × 2,300 kg)');
  assert.equal(c.flex + c.price + c.joint + c.efficiency, c.actual, 'the causes add to the actual cost');
  assert.equal(c.static + c.activity, c.flex);
  assert.equal(c.total, 265_000);
  assert.equal(s.balances, true);
  assert.equal(s.rounding.roundedCells, 0, 'every figure of this case is a whole cent, and the statement says so');
  assert.equal(s.totals.cents.total, 265_000);
});

test('ADR-0213 kernel: randomised problems agree with the independent oracle and re-add from printed cents', () => {
  // mulberry32: a seeded generator whose low bits are usable, so the run is reproducible.
  let seedValue = 20261115;
  const rnd = (n) => {
    seedValue = (seedValue + 0x6D2B79F5) | 0;
    let x = Math.imul(seedValue ^ (seedValue >>> 15), 1 | seedValue);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * n);
  };
  let rounded = 0;
  let pooledSeen = 0;
  for (let round = 0; round < 250; round += 1) {
    const linesN = 1 + rnd(5);
    const lines = [];
    for (let i = 0; i < linesN; i += 1) {
      if (rnd(5) === 0) lines.push({ key: `L${i + 1}`, behaviour: 'fixed', budgetCents: rnd(5_000_000) });
      else lines.push({ key: `L${i + 1}`, behaviour: 'variable', qtyE3: 1 + rnd(9_000_000), priceE4: 1 + rnd(9_000_000), pool: rnd(2) ? 'p' : null });
    }
    const plan = { volumeE3: 1 + rnd(7_000_000), lines };
    const final = rnd(3) !== 0;
    const actual = {
      volumeE3: rnd(9_000_000), final,
      lines: lines.map((line) => ({ key: line.key, qtyE3: line.behaviour === 'variable' ? (rnd(9) === 0 ? 0 : rnd(12_000_000)) : null, cents: rnd(900_000_000) })),
      unplanned: rnd(4) === 0 ? [{ key: 'U1', cents: 1 + rnd(100_000) }] : [],
    };
    const s = computeFlexStatement(plan, actual);
    assert.equal(s.ok, true, `round ${round}`);
    assert.equal(s.balances, true, `round ${round}: printed cents re-add (${s.defects.join('; ')})`);
    assert.deepEqual(s.defects, []);
    rounded += s.rounding.roundedCells;

    for (const line of lines) {
      const out = s.lines.find((row) => row.key === line.key);
      const row = actual.lines.find((entry) => entry.key === line.key);
      if (line.behaviour === 'fixed') {
        assert.equal(out.cents.actual, row.cents);
        assert.equal(out.cents.spending, final ? row.cents - line.budgetCents : null, 'fixed spending is withheld on an interim reading');
        assert.equal(out.cents.activity, final ? 0 : null);
        continue;
      }
      const want = oracleLine(plan, actual, line, row);
      assert.ok(same(out.exact.flex, want.flex), `round ${round} ${line.key}: flexible budget`);
      assert.ok(same(out.exact.efficiency, want.efficiency), `round ${round} ${line.key}: efficiency`);
      assert.ok(same(out.exact.price, want.price), `round ${round} ${line.key}: price`);
      if (want.joint === null) {
        assert.equal(out.split, 'combined');
        assert.equal(out.cents.joint, null, 'no quantity, no actual price, no joint term');
      } else {
        assert.equal(out.split, 'three-way');
        assert.ok(same(out.exact.joint, want.joint), `round ${round} ${line.key}: joint`);
        assert.ok(same(want.conventionalPrice, fAdd(want.price, want.joint)), 'oracle: conventional = pure + joint');
      }
      // Exact identity, from the oracle's own figures.
      const causes = [want.price, want.joint, want.efficiency].filter(Boolean).reduce(fAdd, want.flex);
      assert.ok(same(causes, F(row.cents)), `round ${round} ${line.key}: exact causes add to the recorded cost`);
      // Printed identity and the one-cent bound.
      assert.equal(out.cents.flex + out.cents.price + (out.cents.joint ?? 0) + out.cents.efficiency, row.cents);
      for (const key of ['flex', 'price', 'efficiency']) assert.ok(withinACent(out.cents[key], want[key]), `round ${round} ${line.key}.${key} is within a cent of exact`);
      if (want.joint) assert.ok(withinACent(out.cents.joint, want.joint));
      if (final) {
        assert.ok(same(out.exact.activity, want.activity));
        assert.equal(out.cents.static + out.cents.activity, out.cents.flex);
        assert.ok(withinACent(out.cents.static, want.static) && withinACent(out.cents.activity, want.activity));
        assert.equal(out.cents.total, row.cents - out.cents.static);
      } else {
        assert.equal(out.cents.activity, null);
        assert.equal(out.cents.static, null);
        assert.equal(out.cents.total, null);
      }
      if (out.pooled) {
        pooledSeen += 1;
        assert.equal(out.cents.mix + out.cents.yield, out.cents.efficiency, 'per line: mix + yield = efficiency, in printed cents');
      } else {
        assert.equal(out.cents.mix, null);
      }
    }
    for (const pool of s.pools.filter((entry) => entry.pooled)) {
      assert.equal(pool.cents.mix + pool.cents.yield, pool.cents.efficiency, 'per pool: mix + yield = efficiency');
      // Yield from first principles: (ΣAQ − ΣSQ allowed) × the budgeted blend's average standard price.
      const members = lines.filter((line) => line.behaviour === 'variable' && line.pool === pool.key);
      const ratio = F(actual.volumeE3, plan.volumeE3);
      const sumBudgetQty = members.reduce((acc, line) => acc + BigInt(line.qtyE3), 0n);
      const sumBudgetCost = members.reduce((acc, line) => fAdd(acc, fMul(F(line.qtyE3), F(line.priceE4, 100000n))), F(0));
      const sumAQ = members.reduce((acc, line) => acc + BigInt(actual.lines.find((row) => row.key === line.key).qtyE3), 0n);
      const wantYield = fMul(fSub(F(sumAQ), fMul(F(sumBudgetQty), ratio)), fDiv(sumBudgetCost, F(sumBudgetQty)));
      const gotYield = s.lines.filter((row) => row.pool === pool.key).reduce((acc, row) => fAdd(acc, F(row.exact.yield.n, row.exact.yield.d)), F(0));
      assert.ok(same(gotYield, wantYield), `round ${round}: pool yield equals the first-principles figure`);
    }
    const t = s.totals.cents;
    if (final) {
      assert.equal(t.static + t.activity + t.price + (t.joint ?? 0) + (t.efficiency ?? 0) + (t.spending ?? 0) + (t.unplanned ?? 0), t.actual, `round ${round}: the full bridge re-adds`);
      assert.equal(t.actual, actual.lines.reduce((a, r) => a + r.cents, 0) + actual.unplanned.reduce((a, r) => a + r.cents, 0), 'the actual total is the sum of what was recorded');
    } else {
      assert.equal(t.activity, null);
      assert.equal(t.total, null);
      assert.equal(t.spending, null);
    }
  }
  assert.ok(rounded > 100, 'the randomised set really exercised non-terminating figures');
  assert.ok(pooledSeen > 20, 'and real pools');
});

test('ADR-0213 kernel: refusals, a pool of one, apportionment and materiality on the exact figure', () => {
  const line = { key: 'L1', behaviour: 'variable', qtyE3: 1000, priceE4: 10000, pool: 'solo' };
  assert.equal(computeFlexStatement({ volumeE3: 0, lines: [line] }, { volumeE3: 1, final: true, lines: [{ key: 'L1', qtyE3: 1, cents: 1 }], unplanned: [] }).reason, 'no-planned-volume');
  assert.equal(computeFlexStatement({ volumeE3: 1000, lines: [line] }, { volumeE3: 1000, final: true, lines: [], unplanned: [] }).reason, 'line-missing');
  assert.equal(computeFlexStatement({ volumeE3: 1000, lines: [line] }, { volumeE3: 1000, final: true, lines: [{ key: 'L1', qtyE3: null, cents: 1 }], unplanned: [] }).reason, 'quantity-missing');
  const solo = computeFlexStatement({ volumeE3: 1000, lines: [line] }, { volumeE3: 1000, final: true, lines: [{ key: 'L1', qtyE3: 1200, cents: 130 }], unplanned: [] });
  assert.equal(solo.lines[0].pooled, false);
  assert.equal(solo.lines[0].poolReason, 'pool-of-one');
  assert.equal(solo.lines[0].cents.mix, null, 'a pool of one has nothing to substitute');

  // Largest remainder: thirds of 100 print 34 + 33 + 33, never 33 + 33 + 33.
  assert.deepEqual(apportion([rat(100n, 3n), rat(100n, 3n), rat(100n, 3n)], 100n), [34n, 33n, 33n]);
  assert.equal(apportion([rat(1n), rat(1n)], 5n), null, 'parts that do not add to the total are a defect, not a residue');
  assert.equal(rRound(rat(5n, 2n)), 2n, 'half to even');
  assert.equal(rRound(rat(7n, 2n)), 4n);

  // 499.6 cents prints as 500 and is NOT material against a 500-cent floor.
  assert.equal(isMaterial(rat(4996n, 10n), rat(100000n), { floorCents: 500, bp: 0 }), false, 'a rounded cent cannot flip a verdict');
  assert.equal(isMaterial(rat(500n), rat(100000n), { floorCents: 500, bp: 0 }), true);
  assert.equal(isMaterial(rat(-600n), rat(100000n), { floorCents: 500, bp: 100 }), false, 'both thresholds must be reached: 0.6% is under 1%');
  assert.equal(isMaterial(rat(-1000n), rat(100000n), { floorCents: 500, bp: 100 }), true, 'a favourable variance is flagged as readily as an unfavourable one');
});

/* =====================================================================
 * 2. TYPED AND STORED VALUES
 */

test('ADR-0213 loaders: a typed amount is refused rather than rounded; a stored amount is never re-scaled', () => {
  assert.equal(parseFlexMoney('1500.50'), 150050);
  assert.equal(parseFlexMoney('1500.505'), null, 'a third decimal is refused, not rounded');
  assert.equal(parseFlexMoney('1,500'), null);
  assert.equal(parseFlexMoney('1e3'), null);
  assert.equal(parseFlexMoney('-5'), null);
  assert.equal(parseFlexQuantity('37.5'), 37500);
  assert.equal(parseFlexQuantity('0.0005'), null);
  assert.equal(parseFlexPrice('0.0425'), 425);
  assert.equal(parseFlexPrice('0.04255'), null);

  const { store, values, planId, actualId } = declaredAndRecorded();
  const plan = store.state.flexBudgetPlans.find((row) => row.id === planId);
  assert.equal(plan.lines[0].qtyE3, 1_200_000);
  assert.equal(plan.lines[0].priceE4, 6_500_000);
  assert.equal(plan.lines[3].budgetCents, 18_000_000);
  assert.equal(plan.materialityBp, 200);
  assert.equal(plan.materialityCents, 500_000);
  // Reload from what was persisted: the loaded rows are the stored rows, byte for byte.
  const reloaded = normalizeState(JSON.parse(values.get(STORAGE_KEY)), { now: new Date(T0) }).state;
  assert.deepEqual(reloaded.flexBudgetPlans, store.state.flexBudgetPlans);
  assert.deepEqual(reloaded.flexBudgetActuals, store.state.flexBudgetActuals);
  assert.deepEqual(normalizeFlexBudgetPlans(store.state.flexBudgetPlans, []), store.state.flexBudgetPlans);
  assert.equal(store.state.flexBudgetActuals.find((row) => row.id === actualId).lines[0].cents, 99_876_543, 'cents stay cents after a reload');

  // An unreadable row is dropped with a counted warning, never repaired.
  const warnings = [];
  const damaged = normalizeFlexBudgetPlans([{ ...plan, volumeE3: 0 }, { ...plan, id: 'p2', lines: [{ ...plan.lines[0], priceE4: 12.5 }] }, plan], warnings);
  assert.equal(damaged.length, 1);
  assert.match(warnings[0], /2 flexible-budget plan row\(s\)/);
  const orphanWarnings = [];
  assert.equal(normalizeFlexBudgetActuals(store.state.flexBudgetActuals, [], orphanWarnings).length, 0, 'a recording never survives its plan');
  const short = [{ ...store.state.flexBudgetActuals[0], lines: store.state.flexBudgetActuals[0].lines.slice(0, 3) }];
  assert.equal(normalizeFlexBudgetActuals(short, [plan], []).length, 0, 'a recording missing a plan line is dropped whole, never zero-filled');
});

/* =====================================================================
 * 3. GOVERNANCE — who may declare, name, record
 */

test('ADR-0213 governance: the measured person never sets the standard; a line never names a peer line’s manager', () => {
  const { api, sit, store } = seed();

  sit('mia');
  const byManager = api.flexBudgetDeclarePlan(planInput({ ownerId: 'ivo' }));
  assert.equal(byManager.ok, false, 'declaring a standard is a director’s act by rank');
  assert.match(byManager.error, /rank/i);

  sit('dan');
  const own = api.flexBudgetDeclarePlan(planInput({ ownerId: 'dan', rateOwnerId: '', usageOwnerId: '', volumeOwnerId: '', linesText: 'fixed; Licences; 1000' }));
  assert.equal(own.ok, false);
  assert.match(own.error, /does not declare their own standard/);
  const peerOwner = api.flexBudgetDeclarePlan(planInput());
  assert.equal(peerOwner.ok, false, 'dan does not hold eve, so dan cannot attribute a variance to eve');
  assert.match(peerOwner.error, /never attributes a variance to a peer line’s manager/);
  const peerHolder = api.flexBudgetDeclarePlan(planInput({ ownerId: 'ned' }));
  assert.equal(peerHolder.ok, false);
  assert.equal(peerHolder.code, 'scope-refusal', 'a budget holder on a peer line is refused at the gateway');
  assert.equal(store.state.flexBudgetPlans.length, 0, 'nothing was written by any refusal');

  // dan may declare for mia, leaving the rate he does not control UNDECLARED.
  const danPlan = api.flexBudgetDeclarePlan(planInput({ rateOwnerId: '', volumeOwnerId: 'dan', linesText: LINES.replace('; rate=eve; usage=dan', '') }));
  assert.ok(danPlan.ok, danPlan.error);
  assert.equal(danPlan.via, 'home-line');
  assert.equal(danPlan.staticBudgetCents, 190_980_000, '1,200×650 + 2,400×380 + 90,000×0.42 + 180,000');

  // eve reaches mia ONLY through the declared project line, and may declare there.
  sit('eve');
  const evePlan = api.flexBudgetDeclarePlan(planInput({ title: 'Project line — October', volumeOwnerId: 'eve', linesText: LINES.replace('usage=dan', 'usage=mia') }));
  assert.ok(evePlan.ok, evePlan.error);
  assert.equal(evePlan.via, 'declared-line');

  // Typed lines are refused with the row named.
  sit('vera');
  for (const [linesText, pattern] of [
    ['variable; Alpha; 10 h; 5; pool-a\nvariable; Beta; 10 kg; 5; pool-a', /ONE unit/],
    ['variable; Alpha; 10 h; 5\nvariable; alpha; 10 h; 5', /repeats the label/],
    ['fixed; Rent; 1000; rate=dan', /fixed lump has no rate/],
    ['variable; Alpha; 10.12345 h; 5', /at most three decimals/],
    ['overhead; Alpha; 10', /start it with/],
  ]) {
    const refused = api.flexBudgetDeclarePlan(planInput({ linesText }));
    assert.equal(refused.ok, false, linesText);
    assert.match(refused.error, pattern);
    assert.equal(refused.field, 'linesText');
  }
  assert.equal(api.flexBudgetDeclarePlan(planInput({ basis: 'short' })).field, 'basis');
  assert.equal(api.flexBudgetDeclarePlan(planInput({ volume: '0' })).field, 'volume');
  assert.equal(api.flexBudgetDeclarePlan(planInput({ periodTo: '2026-09-01' })).field, 'periodTo');
  assert.equal(store.state.flexBudgetPlans.length, 2);

  // Recording: every line or nothing; never the future; never a stranger.
  const planId = danPlan.planId;
  sit('ned');
  const stranger = api.flexBudgetRecordActuals(actualInput(planId));
  assert.equal(stranger.ok, false);
  assert.match(stranger.error, /neither/);
  sit('mia');
  const partial = api.flexBudgetRecordActuals(actualInput(planId, { linesText: 'L1; 1510.5; 998765.43\nL2; 2290.25; 880123.45\nL4; 182500' }));
  assert.equal(partial.ok, false);
  assert.match(partial.error, /Line L3 .* has no actual/);
  const outside = api.flexBudgetRecordActuals(actualInput(planId, { asOf: '2026-11-02' }));
  assert.match(outside.error, /outside the period/);
  assert.equal(store.state.flexBudgetActuals.length, 0);
  const ok = api.flexBudgetRecordActuals(actualInput(planId));
  assert.ok(ok.ok, ok.error);
  assert.equal(ok.final, true);
  assert.equal(ok.via, 'budget-holder');
  const retireOwn = api.flexBudgetRetirePlan({ planId, reason: 'I would rather not be measured.' });
  assert.equal(retireOwn.ok, false, 'a manager has no right to retire a standard at all');

  // A future cut-off is refused on a period that is still running.
  sit('vera');
  const running = api.flexBudgetDeclarePlan(planInput({ title: 'Service desk — November', periodFrom: '2026-11-01', periodTo: '2026-11-30' }));
  assert.ok(running.ok, running.error);
  sit('mia');
  assert.match(api.flexBudgetRecordActuals(actualInput(running.planId, { asOf: '2026-11-20' })).error, /after today/);
  const interim = api.flexBudgetRecordActuals(actualInput(running.planId, { asOf: '2026-11-15', volume: '2000' }));
  assert.ok(interim.ok, interim.error);
  assert.equal(interim.final, false);

  // Conventions: refused outside the bounds, never clamped; governed at VP altitude.
  const K = FLEX_BUDGET_SETTING_KEYS.actualsDueDays;
  sit('dan');
  assert.equal(api.flexBudgetSetConventions({ [K]: 10 }).ok, false, 'a director does not govern the due window');
  sit('vera');
  const tooLong = api.flexBudgetSetConventions({ [K]: 400 });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, /Nothing was clamped/);
  assert.equal(store.state.settings[K], 15);
  assert.ok(api.flexBudgetSetConventions({ [K]: 10 }).ok);
  assert.equal(store.state.settings[K], 10);
});

/* =====================================================================
 * 4. THE READER — matrix, attribution, interim, projection
 */

test('ADR-0213 reader: one cost object counted once across two lines; the joint term is shared and added to neither', () => {
  const { api, sit, store, planId } = declaredAndRecorded();

  sit(null);
  const before = JSON.stringify(store.state);
  const operator = api.flexBudgetReport().report;
  api.flexBudgetBriefText(); api.flexBudgetCsvRows(); api.flexBudgetAttentionCount(); api.flexBudgetCandidates();
  assert.equal(JSON.stringify(store.state), before, 'reading mutates nothing');
  assert.equal(operator.totals.statementsN, 1, 'mia answers to two lines; her cost object is still ONE statement');

  const s = operator.statements[0];
  assert.equal(s.stateKey, 'final');
  assert.equal(s.balances, true);
  assert.equal(s.attributionBalances, true);
  const t = s.totals.cents;
  assert.equal(t.static, 190_980_000);
  assert.equal(t.actual, 99_876_543 + 88_012_345 + 4_400_001 + 18_250_000 + 123_456, 'actual is the sum of what was recorded');
  assert.equal(t.flex, 206_980_650, 'static × 4,370 / 4,000 on the variable lines, plus the lump');
  assert.equal(t.activity, 16_000_650);
  assert.equal(t.static + t.activity + t.price + t.joint + t.efficiency + t.spending + t.unplanned, t.actual, 'the bridge re-adds from printed cents');
  assert.equal(t.spending, 250_000);
  assert.equal(t.unplanned, 123_456);
  assert.equal(t.mix + t.yield, s.pools[0].cents.efficiency, 'mix + yield is the labour pool’s efficiency');
  assert.equal(s.printedExact, false, 'the statement admits its figures are not all whole cents');
  assert.ok(s.rounding.roundedCells > 0 && s.rounding.exactCells > 0);

  // L1: rate=eve, usage=dan → joint SHARED. L2: rate=eve (plan), usage=mia (plan) → shared. L3 the same.
  const L1 = s.lines.find((line) => line.key === 'L1');
  assert.equal(L1.jointShared, true);
  assert.deepEqual([L1.owners.rate.id, L1.owners.rate.source, L1.owners.usage.id, L1.owners.usage.source], ['eve', 'line', 'dan', 'line']);
  const bucket = (key) => s.attribution.find((row) => row.key === key);
  assert.equal(bucket('shared:dan+eve').cents.joint, L1.cents.joint, 'L1’s joint term sits in the shared row');
  assert.equal(bucket('person:eve').cents.joint, 0, 'and is added to neither owner');
  assert.equal(bucket('person:dan').cents.joint, 0);
  assert.equal(bucket('person:eve').cents.price, t.price, 'eve agreed every price');
  assert.equal(bucket('person:dan').cents.efficiency, L1.cents.efficiency);
  assert.equal(bucket('person:vera').cents.activity, t.activity, 'the seat that set the volume answers for the activity variance');
  assert.equal(bucket('person:mia').cents.unplanned, t.unplanned, 'unplanned cost answers to the budget holder');
  assert.equal(bucket('person:mia').cents.spending, t.spending);
  assert.equal(s.attribution.reduce((acc, row) => acc + row.totalCents, 0), t.total, 'the attribution re-adds to the total variance');
  assert.equal(s.attribution.filter((row) => row.kind === 'shared').reduce((acc, row) => acc + row.cents.joint, 0), t.joint, 'the whole joint term is shared here');
  assert.equal(s.undeclaredCells, 0);
  assert.ok(operator.refusals.some((row) => row.key === 'joint-shared'));

  // Materiality on the declared thresholds: both 5,000.00 and 2% of the line’s flexible budget.
  assert.deepEqual(s.exceptions.map((row) => `${row.lineKey}:${row.classKey}:${row.direction}`), ['L1:efficiency:U', 'L2:efficiency:F'], 'largest first; a favourable variance is an exception too');
  assert.ok(s.commentary.every((sentence) => !/NaN|undefined|null/.test(sentence)));
  assert.ok(s.commentary[0].includes(flexMoney('DKK', t.actual)) && s.commentary[0].includes(flexMoney('DKK', t.static)), 'the commentary quotes the printed figures');

  // Roll-up per currency = the one final statement, re-added.
  const roll = operator.currencies[0];
  assert.equal(roll.finalN, 1);
  assert.deepEqual(roll.cents, Object.fromEntries(Object.keys(roll.cents).map((key) => [key, t[key]])));
  assert.equal(roll.balances, true);
  assert.equal(roll.attributionBalances, true);
  assert.equal(roll.sharedCents, t.joint);

  // Projection: every line that reaches mia sees ONE statement; ned sees a count.
  const seen = {};
  for (const who of ['vera', 'dan', 'eve', 'mia', 'ned', 'kai']) {
    sit(who);
    const result = api.flexBudgetReport();
    seen[who] = result.ok ? { n: result.report.totals.statementsN, outside: result.report.totals.outsideN, reach: result.report.statements[0]?.reach || null, total: result.report.statements[0]?.totals.cents.total ?? null } : result.error;
  }
  assert.deepEqual(seen.vera, { n: 1, outside: 0, reach: 'tree', total: t.total });
  assert.deepEqual(seen.dan, { n: 1, outside: 0, reach: 'tree', total: t.total });
  assert.deepEqual(seen.eve, { n: 1, outside: 0, reach: 'line', total: t.total }, 'the declared line reads the same statement, once');
  assert.deepEqual(seen.mia, { n: 1, outside: 0, reach: 'own', total: t.total });
  assert.deepEqual(seen.ned, { n: 0, outside: 1, reach: null, total: null }, 'a peer line sees a count and no figure');

  // A person NAMED as an owner reads the statement even without holding the budget holder.
  sit('vera');
  const forDan = api.flexBudgetDeclarePlan(planInput({ title: 'Platform — October', ownerId: 'dan', usageOwnerId: 'dan', linesText: 'variable; Cloud; 1000 vCPU-h; 2' }));
  assert.ok(forDan.ok, forDan.error);
  sit('eve');
  const eveView = api.flexBudgetReport().report;
  const named = eveView.statements.find((row) => row.planId === forDan.planId);
  assert.equal(named.reach, 'named', 'eve is the declared rate owner, so she may read what is attributed to her');
  assert.equal(named.canRecord, false);
  assert.equal(named.stateKey, 'no-actuals');
  assert.equal(named.totals, null, 'no actuals, no variance — not a zero');
  sit('ned');
  assert.equal(api.flexBudgetReport().report.totals.outsideN, 2);

  // Withdrawing the only recording returns the statement to "no actuals"; the row is kept.
  sit('ned');
  assert.equal(api.flexBudgetWithdrawActuals({ actualId: store.state.flexBudgetActuals[0].id, reason: 'I disagree with these figures.' }).ok, false);
  sit('mia');
  const withdrawn = api.flexBudgetWithdrawActuals({ actualId: store.state.flexBudgetActuals[0].id, reason: 'Wrong ledger extract was used.' });
  assert.ok(withdrawn.ok, withdrawn.error);
  assert.equal(store.state.flexBudgetActuals.length, 1, 'the row stays on the ledger');
  assert.equal(api.flexBudgetReport().report.statements.find((row) => row.planId === planId).stateKey, 'no-actuals');
});

test('ADR-0213 reader: an interim reading withholds what a full-period budget cannot support; undeclared stays undeclared', () => {
  const { api, sit } = seed();
  sit('vera');
  const made = api.flexBudgetDeclarePlan(planInput({ title: 'Service desk — November', periodFrom: '2026-11-01', periodTo: '2026-11-30', rateOwnerId: '', usageOwnerId: '', volumeOwnerId: '', linesText: 'variable; Engineers; 2400 h; 380\nvariable; Parts; 100 kg; 12.5\nfixed; Tooling licences; 180000' }));
  assert.ok(made.ok, made.error);
  sit('mia');
  const rec = api.flexBudgetRecordActuals({ planId: made.planId, asOf: '2026-11-15', volume: '2100', linesText: 'L1; 1300; 500000\nL2; 0; 250\nL3; 90000', basis: 'Mid-month ledger extract of 2026-11-15.' });
  assert.ok(rec.ok, rec.error);
  const report = api.flexBudgetReport().report;
  const s = report.statements[0];
  assert.equal(s.stateKey, 'interim');
  const t = s.totals.cents;
  assert.equal(t.static, null);
  assert.equal(t.activity, null);
  assert.equal(t.spending, null);
  assert.equal(t.total, null);
  assert.equal(t.comparedFlex + t.price + t.joint + t.efficiency, t.comparedActual, 'the interim bridge re-adds on the variable lines');
  assert.equal(t.comparedActual, 50_000_000 + 25_000, 'the fixed lump is left out of an interim comparison');
  const L2 = s.lines.find((line) => line.key === 'L2');
  assert.equal(L2.split, 'combined', 'nothing consumed → no actual price → the price variance is not split');
  assert.equal(L2.cents.joint, null);
  assert.equal(L2.cents.price, 25_000);
  const L3 = s.lines.find((line) => line.key === 'L3');
  assert.equal(L3.cents.spending, null);
  assert.equal(L3.cents.actual, 9_000_000, 'the recorded cost is still shown');
  assert.equal(s.balances, true);
  assert.deepEqual(s.attribution.map((row) => row.kind), ['undeclared'], 'nobody was named, so nobody is — not even the budget holder');
  assert.equal(s.attribution[0].totalCents, t.flexVariance);
  assert.equal(s.attributionBalances, true);
  assert.deepEqual(s.bridge.map((step) => step.key), ['flex', 'price', 'joint', 'efficiency', 'actual']);
  const keys = report.refusals.map((row) => row.key);
  for (const key of ['interim-withheld', 'interim-not-rolled-up', 'no-quantity-no-split', 'owner-undeclared']) assert.ok(keys.includes(key), key);
  assert.equal(report.currencies[0].finalN, 0);
  assert.equal(report.currencies[0].cents.flex, null, 'an interim statement never enters a roll-up');
  assert.equal(report.currencies[0].balances, null);
});

test('ADR-0213 badge: final actuals past due are counted for every seat that may record, and cleared only by a FINAL recording', () => {
  const { api, sit, on, store } = seed();
  sit('vera');
  const made = api.flexBudgetDeclarePlan(planInput());
  assert.ok(made.ok, made.error);
  const count = (who) => { sit(who); return api.flexBudgetAttentionCount().count; };
  assert.equal(count('mia'), 0, 'due 15 days after 2026-10-31 — today is the last day, not yet past');
  on('2026-11-16');
  assert.deepEqual(['mia', 'dan', 'eve', 'vera', 'ned'].map(count), [1, 1, 1, 1, 0]);
  sit(null);
  assert.equal(flexBudgetAttentionCount(store.state, { now: at('2026-11-16'), settings: store.state.settings, seat: null }), 1);
  assert.equal(api.flexBudgetReport().report.totals.overdueN, 1);
  sit('mia');
  const interim = api.flexBudgetRecordActuals(actualInput(made.planId, { asOf: '2026-10-20' }));
  assert.ok(interim.ok, interim.error);
  assert.equal(count('mia'), 1, 'an interim recording does not discharge the final one');
  const final = api.flexBudgetRecordActuals(actualInput(made.planId));
  assert.ok(final.ok, final.error);
  assert.equal(final.supersededId, interim.actualId);
  assert.deepEqual(['mia', 'dan', 'eve', 'vera'].map(count), [0, 0, 0, 0]);
});

/* =====================================================================
 * 5. DISPLAY == COMPUTED == EXPORTED
 */

test('ADR-0213 panel and CSV: every printed cell is the reader’s integer, and the export is the same integer', () => {
  const { api, sit, store } = declaredAndRecorded();
  // A second, interim statement in another currency, so blanks and non-pooling are on screen too.
  sit('vera');
  const eur = api.flexBudgetDeclarePlan(planInput({ title: 'Field team — November', currency: 'EUR', periodFrom: '2026-11-01', periodTo: '2026-11-30', linesText: 'variable; Technicians; 800 h; 55.5\nfixed; Vans; 12000' }));
  assert.ok(eur.ok, eur.error);
  sit('mia');
  assert.ok(api.flexBudgetRecordActuals({ planId: eur.planId, asOf: '2026-11-10', volume: '1337', linesText: 'L1; 301.25; 17000.33\nL2; 4000', basis: 'Timesheet close of 2026-11-10.' }).ok);

  sit('vera');
  const report = api.flexBudgetReport().report;
  assert.equal(report.statements.length, 2);
  const before = JSON.stringify(store.state);

  withDom(() => {
    const ctx = { api, state: store.state, now: at('2026-11-15'), query: new URLSearchParams('panel=variance'), seatContext: { seat: null, built: null }, navigate: () => {}, refresh: () => {} };
    const page = renderFinance(ctx);
    document.getElementById('root').appendChild(page);
    assert.equal(page.querySelectorAll('h1').length, 1, 'one h1');
    const cell = (testid) => page.querySelector(`[data-testid="${testid}"]`);
    let checked = 0;
    for (const s of report.statements) {
      assert.equal(cell(`flex-statement-${s.code}`).getAttribute('data-state'), s.stateKey);
      const t = s.totals.cents;
      const totals = { static: t.static, activity: t.activity, flex: s.final ? t.flex : t.comparedFlex, flexVariance: t.flexVariance, actual: s.final ? t.actual : t.comparedActual, total: t.total };
      for (const [key, cents] of Object.entries(totals)) {
        const node = cell(`flex-total-${s.code}-${key}`);
        assert.ok(node, `flex-total-${s.code}-${key} is on the page`);
        assert.equal(node.getAttribute('data-cents'), cents === null ? '' : String(cents), `${s.code} total ${key}`);
        const variance = ['activity', 'flexVariance', 'total'].includes(key);
        assert.equal(node.textContent, variance ? flexVarianceText(s.currency, cents) : flexMoney(s.currency, cents), `${s.code} total ${key} text`);
        checked += 1;
      }
      for (const line of s.lines) {
        const keys = ['flex', 'price', 'joint', 'efficiency', 'actual'];
        if (line.pooled) keys.push('mix', 'yield');
        if (line.kind === 'fixed') keys.push('spending');
        if (line.kind === 'unplanned') keys.push('unplanned');
        for (const key of keys) {
          const node = cell(`flex-cell-${s.code}-${line.key}-${key}`);
          assert.ok(node, `flex-cell-${s.code}-${line.key}-${key} is on the page`);
          const cents = line.cents[key];
          assert.equal(node.getAttribute('data-cents'), cents === null || cents === undefined ? '' : String(cents), `${s.code} ${line.key} ${key}`);
          if (cents === null || cents === undefined) assert.equal(node.textContent, '—', 'a withheld figure is a dash, never a zero');
          checked += 1;
        }
      }
      for (const row of s.attribution) {
        assert.equal(cell(`flex-owner-${s.code}-${row.key}`).getAttribute('data-cents'), String(row.totalCents));
        checked += 1;
      }
      const printedCommentary = [...cell(`flex-commentary-${s.code}`).querySelectorAll('p')].map((node) => node.textContent);
      assert.deepEqual(printedCommentary, s.commentary);
      assert.ok(cell(`flex-chart-${s.code}`).querySelector('svg[role="img"]').getAttribute('aria-label').length > 20, 'the chart has a text alternative');
    }
    assert.ok(checked > 50, `checked ${checked} printed cells against the reader`);
    for (const [testid, value] of [['statements', report.totals.statementsN], ['final', report.totals.finalN], ['interim', report.totals.interimN], ['no-actuals', report.totals.noActualsN], ['overdue', report.totals.overdueN], ['exceptions', report.totals.exceptionsN], ['outside', report.totals.outsideN]]) {
      assert.equal(cell(`flex-count-${testid}`).textContent, String(value), `summary count ${testid}`);
    }
    assert.equal(page.querySelectorAll('[data-testid^="flex-statement-"]').length, report.totals.statementsN, 'the count printed equals the cards printed');
    assert.deepEqual([...page.querySelectorAll('[data-testid="flex-refusals"] li')].map((node) => node.getAttribute('data-refusal')), report.refusals.map((row) => row.key));
    const tabs = [...page.querySelectorAll('a[href^="#/finance"], [role="tab"]')].map((node) => node.textContent);
    assert.ok(tabs.some((label) => label.includes('Variance statements')), 'the finance navigation carries the fifth panel');

    // The other two views render from the same report.
    const owners = renderFinance({ ...ctx, query: new URLSearchParams('panel=variance&view=owners') });
    const dkk = report.currencies.find((row) => row.currency === 'DKK');
    for (const key of ['activity', 'price', 'joint', 'efficiency', 'spending', 'unplanned', 'total']) {
      assert.equal(owners.querySelector(`[data-testid="flex-rollup-DKK-${key}"]`).getAttribute('data-cents'), String(dkk.cents[key]), `roll-up ${key}`);
    }
    assert.match(owners.querySelector('[data-testid="flex-rollup-EUR"]').textContent, /nothing is rolled up/i, 'the interim EUR statement is not rolled up, and DKK is not added to it');
    const method = renderFinance({ ...ctx, query: new URLSearchParams('panel=variance&view=method') });
    const img = method.querySelector('img');
    assert.equal(img.getAttribute('src'), './app/assets/flex-budget-variance-bridge.jpg');
    assert.ok(img.getAttribute('alt').length > 80);
    assert.ok(fs.statSync(path.join(REPO, 'app/assets/flex-budget-variance-bridge.jpg')).size > 10_000, 'the illustration is a real file');
    assert.match(method.textContent, /generated asset/);
  });
  assert.equal(JSON.stringify(store.state), before, 'rendering mutates nothing');

  // CSV: built with no seat (the whole workspace) from the same reader.
  const table = buildScopeTable(store.state, FLEX_BUDGET_CSV_SCOPE, at('2026-11-15'));
  const whole = buildFlexBudget(store.state, { now: at('2026-11-15'), settings: store.state.settings, seat: null });
  assert.deepEqual(table.columns.map((column) => column.key), [...FLEX_BUDGET_CSV_COLUMNS]);
  assert.deepEqual(table.rows, flexBudgetCsvRows(whole));
  for (const row of table.rows) assert.deepEqual(Object.keys(row), [...FLEX_BUDGET_CSV_COLUMNS], 'every row carries exactly the declared columns');
  const statementRows = table.rows.filter((row) => row.row_type === 'statement');
  assert.equal(statementRows.length, whole.totals.statementsN);
  for (const s of whole.allStatements) {
    const row = statementRows.find((entry) => entry.statement_code === s.code);
    const shown = report.statements.find((entry) => entry.planId === s.planId);
    assert.equal(row.flexible_budget_cents, String(shown.totals.cents.flex), 'the exported flexible budget is the printed one');
    assert.equal(row.price_variance_cents, String(shown.totals.cents.price));
    assert.equal(row.actual_cents, String(shown.totals.cents.actual));
    assert.equal(row.balances, 'yes');
    if (s.final) {
      assert.equal(row.total_variance_cents, String(shown.totals.cents.total));
      assert.equal(row.static_budget_cents, String(shown.totals.cents.static));
      assert.equal(row.refusal_key, '');
    } else {
      assert.equal(row.total_variance_cents, '', 'a withheld figure exports BLANK, never zero');
      assert.equal(row.static_budget_cents, '');
      assert.equal(row.activity_variance_cents, '');
      assert.equal(row.refusal_key, 'interim-withheld');
    }
    assert.equal(table.rows.filter((entry) => entry.row_type === 'line' && entry.statement_code === s.code).length, s.lines.length);
  }
  const currencyRows = table.rows.filter((row) => row.row_type === 'currency');
  assert.deepEqual(currencyRows.map((row) => `${row.currency}:${row.final_n}:${row.total_variance_cents}`), [`DKK:1:${whole.allCurrencies[0].cents.total}`, 'EUR:0:']);
  const text = serializeCsv(table.columns, table.rows);
  for (const secret of ['Mia', 'Vera', 'Dan Name', 'Eve', 'mia', 'vera', 'Service desk', 'Field team', 'Senior engineers', 'Technicians', 'Emergency contractor', 'ledger', 'rate card']) {
    assert.ok(!text.includes(secret), `the export carries no “${secret}”`);
  }
});

/* =====================================================================
 * 6. REGISTRATION
 */

test('ADR-0213 registration: schema v167, two empty ledgers, CSV scope #155, rights and gateway rows — and no new spine rule', () => {
  assert.equal(SCHEMA_VERSION, 171);
  assert.ok(COLLECTIONS.includes('flexBudgetPlans') && COLLECTIONS.includes('flexBudgetActuals'));
  const empty = createEmptyState(T0);
  assert.deepEqual([empty.flexBudgetPlans, empty.flexBudgetActuals], [[], []]);
  assert.equal(empty.settings[FLEX_BUDGET_SETTING_KEYS.actualsDueDays], 15);

  assert.equal(CSV_EXPORTS.length, 159);
  assert.ok(CSV_EXPORTS.includes(FLEX_BUDGET_CSV_DESCRIPTOR), 'the flex-budget export is registered');
  assert.equal(CSV_EXPORTS.at(-2), FLEX_BUDGET_CSV_DESCRIPTOR, 'ADR-0214’s value-bridge export is registered after it');
  assert.equal(FLEX_BUDGET_CSV_DESCRIPTOR.sensitive, false);
  assert.equal(new Set(FLEX_BUDGET_CSV_COLUMNS).size, FLEX_BUDGET_CSV_COLUMNS.length);

  for (const name of ['flexBudgetReport', 'flexBudgetBriefText', 'flexBudgetCsvRows', 'flexBudgetAttentionCount', 'flexBudgetCandidates']) {
    assert.ok(SAFE_READS.has ? SAFE_READS.has(name) : SAFE_READS.includes(name), `${name} is a registered read`);
  }
  assert.deepEqual(
    Object.values(FLEX_BUDGET_RIGHTS).map((right) => [right, ACTION_RIGHTS[right]?.minRank, ACTION_RIGHTS[right]?.maxRank]),
    [['read-flex-budget', 1, 5], ['declare-flex-budget-plan', 3, 5], ['record-flex-budget-actuals', 1, 5], ['govern-flex-budget', 4, 5]],
  );
  assert.equal(RECORD_POLICIES.flexBudgetPlans.detailCeiling, 0);
  assert.equal(RECORD_POLICIES.flexBudgetActuals.detailCeiling, 0);
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 134, 'this slice adds no rule to the shared spine');

  // 166 → 167 adds two EMPTY ledgers and infers nothing from the envelopes already held.
  const old = { ...createEmptyState(T0), schemaVersion: 166, budgets: [{ id: 'b1', currency: 'DKK' }] };
  delete old.flexBudgetPlans;
  delete old.flexBudgetActuals;
  const migrated = migrate(old);
  assert.equal(migrated.applied.at(-1), '170 → 171');
  assert.deepEqual([migrated.raw.flexBudgetPlans, migrated.raw.flexBudgetActuals], [[], []], 'no standard is invented from an envelope');
  assert.equal(migrated.raw.schemaVersion, 171);

  // Every exported surface the wiring names really exists on the assembled API.
  const { api } = seed();
  for (const name of ['flexBudgetDeclarePlan', 'flexBudgetRetirePlan', 'flexBudgetRecordActuals', 'flexBudgetWithdrawActuals', 'flexBudgetSetConventions']) {
    assert.equal(typeof api[name], 'function', name);
  }
  const adr = fs.readFileSync(path.join(REPO, 'docs/adr/0213-flexible-budget-variance-statement.md'), 'utf8');
  assert.match(adr, /ADR-0213/);
  assert.match(fs.readFileSync(path.join(REPO, 'docs/adr/INDEX.md'), 'utf8'), /0213-flexible-budget-variance-statement\.md/);
});
