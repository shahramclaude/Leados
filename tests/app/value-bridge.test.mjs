// ADR-0214 — Enterprise Value Bridge.
//
// The register's claims are arithmetic and governance, so the tests are too.
// One focused pass over what Session 287 built:
//
//   1. the exact kernel is checked against an INDEPENDENT oracle written here
//      from the definitions, on a hand-worked case and on randomised problems —
//      every printed cell must sit strictly less than a whole cent from its exact
//      value, and the printed cents must re-add;
//   2. a reading that will not declare its perimeter gets a refused attribution:
//      the two levels and the total movement are printed and no leg is claimed;
//   3. equity value is enterprise material — a director seat is refused the read
//      with a printed reason, and nobody records a reading on the future;
//   4. a row is the row its loader returns: no ×100 on reload, no rounding of a
//      typed third decimal, no silently overwritten restatement;
//   5. in a matrix two lines may claim one leg: both names print, the realised
//      figure is attributed to neither, and no attainment is invented;
//   6. a single declared owner gets promise-versus-realised from the PRINTED
//      leg; a claim whose period no bridge matches is kept and scored against
//      nothing;
//   7. what the panel prints is what the reader computed — cell by cell through
//      data-cents — and the CSV exports the same integers with no names.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS } from '../../app/core/csv.js';
import { buildValueBridge, valueBridgeCsvRows } from '../../app/core/domain/valueBridge.js';
import { computeBridge, rat, rCmp } from '../../app/core/domain/valueBridgeMath.js';
import { VALUE_BRIDGE_CSV_SCOPE } from '../../app/core/domain/valueBridgeRegistry.js';
import { renderFinance } from '../../app/views/finance.js';

const T0 = '2026-11-15T12:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);

// ceo (chief) → vera (vp) → dan (director) → mia (manager) → ivo (ic), and
//             → vic (vp) → kai (manager). mia ALSO answers to vic on a declared
// project line, so vic's seat reaches mia through the matrix — and vic may claim
// the same leg for kai that vera claims for mia, which is the contest this
// register exists to name instead of resolving.
const person = (id, managerId, level) => ({
  id,
  name: `${id[0].toUpperCase()}${id.slice(1)} Name`,
  managerId,
  level,
  role: 'Executive',
  status: 'active',
  startDate: '2026-01-01T09:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T09:00:00.000Z',
});

function fixture() {
  const raw = createEmptyState(T0);
  raw.people = [
    person('ceo', null, 'chief'),
    person('vera', 'ceo', 'vp'),
    person('vic', 'ceo', 'vp'),
    person('dan', 'vera', 'director'),
    person('mia', 'dan', 'manager'),
    person('ivo', 'mia', 'ic'),
    person('kai', 'vic', 'manager'),
  ];
  raw.reportingLines = [{
    id: 'rl-mia-vic', personId: 'mia', managerId: 'vic', kind: 'project', shareH: 20,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  return normalizeState(raw, { now: at('2026-11-15') }).state;
}

function seed(state = fixture(), startAt = T0) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
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

const BASIS = 'Board pack, signed valuation memo of the same date.';
const readingInput = (extra = {}) => ({
  day: '2026-08-31',
  currency: 'DKK',
  ebitda: '100000000.00',
  multiple: '8.5',
  netDebt: '320000000.00',
  perimeter: 'organic',
  basis: BASIS,
  ...extra,
});

/** vera (VP) records the two readings; a VP owns the operating leg for a manager. */
function withBridge(extra = {}) {
  const env = seed();
  env.sit('vera');
  const open = env.api.valueBridgeRecordReading(readingInput());
  assert.ok(open.ok, open.error);
  const close = env.api.valueBridgeRecordReading(readingInput({
    day: '2026-10-31',
    ebitda: '109000000.00',
    multiple: '8.0',
    netDebt: '240000000.00',
    perimeter: 'reported',
    perimeterAdjustment: '6000000.00',
    ...extra,
  }));
  assert.ok(close.ok, close.error);
  return { ...env, openId: open.readingId, closeId: close.readingId };
}

function claimInput(extra = {}) {
  return {
    leg: 'operating',
    personId: 'mia',
    fromDay: '2026-08-31',
    toDay: '2026-10-31',
    promised: '30000000.00',
    basis: 'Value-creation plan for the half, agreed with the board.',
    ...extra,
  };
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

// The oracle's own fractions, reduced by cross-multiplication only.
const F = (n, d = 1n) => ({ n: BigInt(n), d: BigInt(d) });
const fAdd = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
const fSub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
const fMul = (a, b) => F(a.n * b.n, a.d * b.d);
const fDiv = (a, b) => F(a.n * b.d, a.d * b.n);
const same = (kernel, oracle) => kernel.n * oracle.d === oracle.n * kernel.d;
const absBig = (x) => (x < 0n ? -x : x);
/** |printed − exact| < 1 cent, by integers only. */
const withinACent = (printed, exact) => absBig(BigInt(printed) * exact.d - exact.n) < absBig(exact.d);

/** The definitions, from the module header, with no help from the kernel. */
function oracleBridge(opening, closing) {
  const e0 = BigInt(opening.ebitdaCents);
  const e1 = BigInt(closing.ebitdaCents);
  const a0 = BigInt(opening.perimeter === 'organic' ? 0 : (opening.perimeterAdjCents ?? 0));
  const a1 = BigInt(closing.perimeter === 'organic' ? 0 : (closing.perimeterAdjCents ?? 0));
  const m0 = F(BigInt(opening.multipleE4), 10000n);
  const m1 = F(BigInt(closing.multipleE4), 10000n);
  const ev0 = fMul(F(e0), m0);
  const ev1 = fMul(F(e1), m1);
  const eq0 = fSub(ev0, F(BigInt(opening.netDebtCents)));
  const eq1 = fSub(ev1, F(BigInt(closing.netDebtCents)));
  return {
    eq0,
    eq1,
    operating: fMul(F(e1 - a1 - e0 + a0), m0),
    perimeter: fMul(F(a1 - a0), m0),
    rerating: fMul(F(e1), fSub(m1, m0)),
    debt: F(BigInt(opening.netDebtCents) - BigInt(closing.netDebtCents)),
  };
}

const asReading = (day, ebitdaCents, multipleE4, netDebtCents, perimeter = 'organic', perimeterAdjCents = 0) => ({
  day, currency: 'DKK', ebitdaCents, multipleE4, netDebtCents, perimeter, perimeterAdjCents,
});

test('ADR-0214 kernel: the hand-worked case divides to the cent and re-adds', () => {
  // Opening: EBITDA 100,000,000.00 at 8.5×, net debt 320,000,000.00.
  // Closing: EBITDA 109,000,000.00 at 8.0×, net debt 240,000,000.00, of which
  //          6,000,000.00 of EBITDA arrived with an acquisition (declared).
  const opening = asReading('2026-08-31', 10_000_000_000, 85_000, 32_000_000_000);
  const closing = asReading('2026-10-31', 10_900_000_000, 80_000, 24_000_000_000, 'reported', 600_000_000);
  const bridge = computeBridge(opening, closing);
  assert.equal(bridge.ok, true);
  assert.equal(bridge.state, 'attributable');

  // Open equity 850,000,000.00 − 320,000,000.00 = 530,000,000.00 (53,000,000,000 cents)
  assert.equal(bridge.printed.openingEquityCents, 53_000_000_000);
  // Close equity 872,000,000.00 − 240,000,000.00 = 632,000,000.00
  assert.equal(bridge.printed.closingEquityCents, 63_200_000_000);
  // Operating: organic EBITDA 103m − 100m = 3m, at the OPENING 8.5×
  assert.equal(bridge.printed.operatingCents, 2_550_000_000);
  // Perimeter: 6m of acquired EBITDA at the opening multiple
  assert.equal(bridge.printed.perimeterCents, 5_100_000_000);
  // Re-rating: closing EBITDA 109m × (8.0 − 8.5)
  assert.equal(bridge.printed.reratingCents, -5_450_000_000);
  // Net debt: 320m repaid down to 240m is 80m of value to the owner
  assert.equal(bridge.printed.debtCents, 8_000_000_000);
  assert.equal(bridge.printed.totalMovementCents, 10_200_000_000);

  assert.equal(bridge.balances, true, 'the printed cents re-add');
  assert.equal(bridge.rounding.exactN, 6, 'every cell of this case is a whole cent, and the register says so');
  assert.equal(bridge.rounding.movedN, 0);
  assert.equal(bridge.flags.perimeterMoved, true);
  assert.equal(bridge.flags.multipleNotMeaningful, false);
  assert.equal(bridge.levelClaim, 'independent');
});

test('ADR-0214 kernel: randomised readings agree with the oracle and never drift a whole cent', () => {
  // A seeded generator whose low bits are usable, so the run is reproducible.
  let seedValue = 20261115;
  const rnd = (n) => {
    seedValue = (seedValue + 0x6D2B79F5) | 0;
    let x = Math.imul(seedValue ^ (seedValue >>> 15), 1 | seedValue);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * n);
  };
  let moved = 0;
  for (let round = 0; round < 240; round += 1) {
    const netDebt0 = rnd(40_000_000_000) - 4_000_000_000;
    const netDebt1 = rnd(40_000_000_000) - 4_000_000_000;
    const ebitda0 = 1 + rnd(20_000_000_000);
    const ebitda1 = 1 + rnd(20_000_000_000);
    const m0 = 1 + rnd(90_000);
    const m1 = 1 + rnd(90_000);
    const adj1 = rnd(3) === 0 ? rnd(5_000_000_000) : 0;
    const opening = asReading('2026-08-31', ebitda0, m0, netDebt0);
    const closing = asReading('2026-10-31', ebitda1, m1, netDebt1, adj1 ? 'reported' : 'organic', adj1);
    const bridge = computeBridge(opening, closing);
    assert.equal(bridge.ok, true, `round ${round}: ${bridge.reason || ''}`);
    assert.equal(bridge.balances, true, `round ${round}: printed cents re-add`);
    const oracle = oracleBridge(opening, closing);

    assert.ok(same(rat(bridge.exact.equity0.n, bridge.exact.equity0.d), oracle.eq0), `round ${round}: opening equity`);
    assert.ok(same(rat(bridge.exact.equity1.n, bridge.exact.equity1.d), oracle.eq1), `round ${round}: closing equity`);
    for (const leg of ['operating', 'perimeter', 'rerating', 'debt']) {
      assert.ok(same(rat(bridge.exact.legs[leg].n, bridge.exact.legs[leg].d), oracle[leg]), `round ${round}: ${leg}`);
    }

    // Every printed cell is strictly less than a whole cent from its exact value.
    const cells = [
      [bridge.printed.openingEquityCents, oracle.eq0],
      [bridge.printed.operatingCents, oracle.operating],
      [bridge.printed.perimeterCents, oracle.perimeter],
      [bridge.printed.reratingCents, oracle.rerating],
      [bridge.printed.debtCents, oracle.debt],
      [bridge.printed.closingEquityCents, oracle.eq1],
    ];
    for (const [printed, exact] of cells) assert.ok(withinACent(printed, exact), `round ${round}: a printed cell drifted a whole cent`);
    // And the identity holds in the printed integers.
    assert.equal(
      bridge.printed.openingEquityCents + bridge.printed.operatingCents + bridge.printed.perimeterCents
        + bridge.printed.reratingCents + bridge.printed.debtCents,
      bridge.printed.closingEquityCents,
      `round ${round}: the printed column adds up`,
    );
    moved += bridge.rounding.movedN;
  }
  assert.ok(moved > 0, 'the randomised set actually exercised the apportionment');
});

/* =====================================================================
 * 2. THE READER — refusal, states and the two claims kept apart
 */

test('ADR-0214 reader: an unseparated perimeter prints both levels and refuses the four legs', () => {
  const env = seed();
  env.sit('vera');
  assert.ok(env.api.valueBridgeRecordReading(readingInput()).ok);
  const made = env.api.valueBridgeRecordReading(readingInput({
    day: '2026-10-31', ebitda: '109000000.00', multiple: '8.0', netDebt: '240000000.00', perimeter: 'unseparated',
  }));
  assert.ok(made.ok, made.error);
  const report = env.api.valueBridgeReport().report;
  const bridge = report.bridges[0];
  assert.equal(bridge.state, 'perimeter-undeclared');
  assert.equal(bridge.printed.operatingCents, undefined, 'no leg is claimed');
  assert.equal(bridge.printed.openingEquityCents, 53_000_000_000);
  assert.equal(bridge.printed.closingEquityCents, 63_200_000_000);
  assert.equal(bridge.balances, null, 'no identity is claimed when no attribution is');
  assert.deepEqual(bridge.withheld, ['operating', 'perimeter', 'rerating', 'debt']);
  assert.equal(bridge.withheldReason, 'perimeter-undeclared');
  assert.equal(report.totals.refusedN, 1);
});

test('ADR-0214 reader: a reported perimeter without an adjustment never becomes a zero adjustment', () => {
  // A hand-edited file: the claim is unusable, the levels are still true.
  const env = seed();
  env.sit('vera');
  assert.ok(env.api.valueBridgeRecordReading(readingInput()).ok);
  const state = JSON.parse(JSON.stringify(env.store.state));
  state.valueBridgeReadings.push({
    id: 'hand-edited', day: '2026-10-31', currency: 'DKK', ebitdaCents: 10_900_000_000, multipleE4: 80_000,
    netDebtCents: 24_000_000_000, perimeter: 'reported', perimeterAdjCents: null,
    basis: BASIS, recordedOn: '2026-11-01', recordedAt: '2026-11-01T09:00:00.000Z', recordedById: 'vera',
    supersedesId: null, supersededOn: null, supersededById: null, withdrawnOn: null, withdrawnById: null,
    withdrawReason: null, engineVersion: 'value-bridge-2026.11-v1',
  });
  const report = buildValueBridge(state, { now: at('2026-11-15'), settings: state.settings, seat: null });
  const bridge = report.bridges[0];
  assert.equal(bridge.closing.perimeter, 'unseparated', 'the claim is downgraded, not repaired');
  assert.equal(bridge.state, 'perimeter-undeclared');
  assert.ok(report.warnings.some((line) => /UNSEPARATED/.test(line)), 'the downgrade is reported');
});

/* =====================================================================
 * 3. GOVERNANCE — altitude, the future and the restatement
 */

test('ADR-0214 governance: equity value is enterprise material and the future is refused', () => {
  const env = seed();
  env.sit('dan'); // director, rank 3
  const refused = env.api.valueBridgeReport();
  assert.equal(refused.ok, false, 'a director is not handed enterprise value');
  assert.ok(refused.error.length > 10, 'the refusal prints its reason');

  env.sit('vera'); // VP, rank 4
  const future = env.api.valueBridgeRecordReading(readingInput({ day: '2026-12-31' }));
  assert.equal(future.ok, false);
  assert.equal(future.field, 'day');
  assert.match(future.error, /after today/);

  const zeroMultiple = env.api.valueBridgeRecordReading(readingInput({ multiple: '0' }));
  assert.equal(zeroMultiple.ok, false);
  assert.equal(zeroMultiple.field, 'multiple');

  const thirdDecimal = env.api.valueBridgeRecordReading(readingInput({ ebitda: '100000000.005' }));
  assert.equal(thirdDecimal.ok, false, 'a third decimal is refused, never rounded');
  assert.equal(thirdDecimal.field, 'ebitda');

  const commaSeparated = env.api.valueBridgeRecordReading(readingInput({ ebitda: '100,000,000.00' }));
  assert.equal(commaSeparated.ok, false, 'a comma is refused: in half of Europe it is the decimal point');
});

test('ADR-0214 governance: a restatement must name the reading it replaces', () => {
  const env = withBridge();
  const silent = env.api.valueBridgeRecordReading(readingInput({ day: '2026-10-31' }));
  assert.equal(silent.ok, false, 'a second live reading on one day is refused');
  assert.match(silent.error, /supersedes/);

  const restated = env.api.valueBridgeRecordReading(readingInput({
    day: '2026-10-31', ebitda: '109500000.00', multiple: '8.0', netDebt: '240000000.00',
    perimeter: 'reported', perimeterAdjustment: '6000000.00', supersedesId: env.closeId,
  }));
  assert.ok(restated.ok, restated.error);
  const readings = env.store.state.valueBridgeReadings;
  const superseded = readings.find((row) => row.id === env.closeId);
  assert.equal(superseded.supersededOn, '2026-11-15', 'the old row is kept and marked');
  const report = env.api.valueBridgeReport().report;
  assert.equal(report.bridges.length, 1, 'one live pair, one bridge');
  assert.equal(report.bridges[0].closing.ebitdaCents, 10_950_000_000, 'the bridge reads the restated figure');
});

/* =====================================================================
 * 4. THE MATRIX — two claims, one leg, no invented split
 */

test('ADR-0214 matrix: two lines claiming one leg print both names and attribute the figure to neither', () => {
  const env = withBridge();
  env.sit('vera'); // mia's home line
  const home = env.api.valueBridgeClaimLever(claimInput());
  assert.ok(home.ok, home.error);
  env.sit('vic'); // a second VP line, holding kai
  const line = env.api.valueBridgeClaimLever(claimInput({ personId: 'kai', promised: '20000000.00' }));
  assert.ok(line.ok, line.error);

  const report = env.api.valueBridgeReport().report;
  const ownership = report.bridges[0].ownership.operating;
  assert.equal(ownership.state, 'contested');
  assert.equal(ownership.owners.length, 2);
  assert.deepEqual(ownership.owners.map((owner) => owner.id).sort(), ['kai', 'mia'], 'two people, one leg, no invented split');
  assert.equal(ownership.realisedCents, null, 'the realised figure is attributed to nobody');
  assert.equal(ownership.attainedCents, null, 'no promise is scored');
  assert.equal(report.totals.contestedLegsN, 1);

  const csv = valueBridgeCsvRows(report);
  const row = csv.find((entry) => entry.row_code === 'B01');
  assert.equal(row.legs_contested, '1');
  assert.equal(row.promised_cents, '', 'a contested leg exports no promise');
  assert.equal(row.attained_cents, '');
});

test('ADR-0214 matrix: a seat may only claim a leg for a person it holds', () => {
  const env = withBridge();
  env.sit('vera');
  const peer = env.api.valueBridgeClaimLever(claimInput({ personId: 'kai' })); // vera does not hold kai
  assert.equal(peer.ok, false, 'a peer line’s manager cannot be named');
  assert.ok(peer.error.length > 10, 'the refusal prints its reason');
  const self = env.api.valueBridgeClaimLever(claimInput({ personId: 'vera' }));
  assert.ok(self.ok, 'a seat may take a leg on itself');
  const duplicate = env.api.valueBridgeClaimLever(claimInput({ personId: 'vera' }));
  assert.equal(duplicate.ok, false, 'the same person cannot claim one leg twice for one period');
  const throughLine = env.api.valueBridgeClaimLever(claimInput({ personId: 'mia', leg: 'debt' }));
  assert.ok(throughLine.ok, 'a declared line is a real hold');
});

/* =====================================================================
 * 5. PROMISE VERSUS DELIVERY
 */

test('ADR-0214 attainment: a single declared owner is scored against the printed leg, exactly', () => {
  const env = withBridge();
  env.sit('vera');
  assert.ok(env.api.valueBridgeClaimLever(claimInput()).ok);
  const report = env.api.valueBridgeReport().report;
  const ownership = report.bridges[0].ownership.operating;
  assert.equal(ownership.state, 'declared');
  assert.equal(ownership.owners[0].name, 'Mia Name');
  assert.equal(ownership.promisedCents, 3_000_000_000);
  assert.equal(ownership.realisedCents, 2_550_000_000, 'the PRINTED leg, not the sub-cent exact value');
  assert.equal(ownership.attainedCents, -450_000_000, '4.5m short of the promise');
});

test('ADR-0214 attainment: a claim whose period no bridge matches is kept and scored against nothing', () => {
  const env = withBridge();
  env.sit('vera');
  const off = env.api.valueBridgeClaimLever(claimInput({ fromDay: '2026-07-01', toDay: '2026-07-31' }));
  assert.ok(off.ok, off.error);
  const report = env.api.valueBridgeReport().report;
  assert.equal(report.claimsWithoutPeriod.length, 1);
  assert.equal(report.claimsWithoutPeriod[0].promisedCents, 3_000_000_000);
  assert.equal(report.bridges[0].ownership.operating.state, 'undeclared', 'nothing is prorated into a period it does not name');
});

/* =====================================================================
 * 6. WHAT IS PRINTED IS WHAT WAS COMPUTED
 */

test('ADR-0214 display: every panel cell carries the reader’s integer, and a refusal prints no figure', () => {
  withDom(() => {
    const env = withBridge();
    env.sit('vera');
    const report = env.api.valueBridgeReport().report;
    const bridge = report.bridges[0];
    const ctx = {
      api: env.api, state: env.store.state, now: at('2026-11-15'), query: new URLSearchParams('panel=value'),
      seatContext: { seat: null, built: null }, navigate: () => {}, refresh: () => {},
    };
    const page = renderFinance(ctx);
    const cell = (testid) => page.querySelector(`[data-testid="${testid}"]`);
    assert.equal(cell('vb-B01-opening').getAttribute('data-cents'), String(bridge.printed.openingEquityCents));
    assert.equal(cell('vb-B01-operating').getAttribute('data-cents'), String(bridge.printed.operatingCents));
    assert.equal(cell('vb-B01-perimeter').getAttribute('data-cents'), String(bridge.printed.perimeterCents));
    assert.equal(cell('vb-B01-rerating').getAttribute('data-cents'), String(bridge.printed.reratingCents));
    assert.equal(cell('vb-B01-debt').getAttribute('data-cents'), String(bridge.printed.debtCents));
    assert.equal(cell('vb-B01-closing').getAttribute('data-cents'), String(bridge.printed.closingEquityCents));
    assert.ok(page.textContent.includes('Enterprise value'), 'the finance navigation offers the panel');
    assert.ok(page.textContent.includes(bridge.key), 'the bridge is printed under its own code');

    // One h1, and no skipped heading level.
    const levels = [...page.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => Number(el.tagName.slice(1)));
    assert.equal(levels.filter((n) => n === 1).length, 1, 'exactly one h1');
    for (let i = 1; i < levels.length; i += 1) assert.ok(levels[i] - levels[i - 1] <= 1, 'no skipped heading level');
  });
});

test('ADR-0214 display = storage: the CSV exports the same integers and no identity', () => {
  const env = withBridge();
  env.sit('vera');
  assert.ok(env.api.valueBridgeClaimLever(claimInput()).ok);
  const report = env.api.valueBridgeReport().report;
  const bridge = report.bridges[0];
  const csv = env.api.valueBridgeCsvRows();
  assert.ok(csv.ok, csv.error);
  const row = csv.rows.find((entry) => entry.row_code === 'B01');
  assert.equal(row.operating_cents, String(bridge.printed.operatingCents));
  assert.equal(row.closing_equity_cents, String(bridge.printed.closingEquityCents));
  assert.equal(row.opening_equity_cents, String(bridge.printed.openingEquityCents));
  assert.equal(row.total_movement_cents, String(bridge.printed.totalMovementCents));
  assert.equal(row.balances, 'yes');
  assert.equal(row.legs_declared, '1');
  const flat = JSON.stringify(csv.rows);
  assert.ok(!flat.includes('Mia Name'), 'no person name reaches the file');
  assert.ok(!flat.includes('Board pack'), 'no basis text reaches the file');
  assert.ok(!flat.includes('8.5'), 'no multiple reaches the file');
});

/* =====================================================================
 * 7. THE LEDGER ITSELF
 */

test('ADR-0214 schema: a stored row is the row its loader returns, and the migration adds empty ledgers', () => {
  const env = withBridge();
  const stored = env.store.state.valueBridgeReadings;
  assert.equal(stored.length, 2);
  const reloaded = normalizeState(JSON.parse(JSON.stringify(env.store.state)), { now: at('2026-11-15') }).state;
  assert.deepEqual(reloaded.valueBridgeReadings, stored, 'no ×100, no re-scaling, no field invented');
  assert.equal(reloaded.valueBridgeReadings[0].ebitdaCents, 10_000_000_000);
  assert.equal(reloaded.valueBridgeReadings[0].multipleE4, 85_000);

  // The SOURCE version is 167: an upgraded workspace carries no readings.
  const migrated = migrate({ schemaVersion: 167 });
  assert.equal(migrated.raw.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.applied.at(-1), '169 → 170');
  assert.deepEqual(migrated.raw.valueBridgeReadings, []);
  assert.deepEqual(migrated.raw.valueBridgeLeverClaims, []);

  const scope = CSV_EXPORTS.find((entry) => entry.key === VALUE_BRIDGE_CSV_SCOPE);
  assert.ok(scope, 'the export is registered');
  assert.equal(CSV_EXPORTS.length, 158);
});

test('ADR-0214 chains: consecutive attributed bridges add up across the whole span', () => {
  const env = seed();
  env.sit('vera');
  assert.ok(env.api.valueBridgeRecordReading(readingInput()).ok);
  assert.ok(env.api.valueBridgeRecordReading(readingInput({
    day: '2026-09-30', ebitda: '105000000.00', multiple: '8.2', netDebt: '280000000.00',
  })).ok);
  assert.ok(env.api.valueBridgeRecordReading(readingInput({
    day: '2026-10-31', ebitda: '109000000.00', multiple: '8.0', netDebt: '240000000.00',
    perimeter: 'reported', perimeterAdjustment: '6000000.00',
  })).ok);
  const report = env.api.valueBridgeReport().report;
  assert.equal(report.bridges.length, 2);
  assert.equal(report.chains.length, 1);
  const chain = report.chains[0];
  assert.equal(chain.moments, 3);
  assert.equal(chain.balances, true);
  assert.equal(
    chain.printed.openingEquityCents + chain.printed.operatingCents + chain.printed.perimeterCents
      + chain.printed.reratingCents + chain.printed.debtCents,
    chain.printed.closingEquityCents,
  );
  const perPair = report.bridges.reduce((acc, bridge) => acc + bridge.printed.totalMovementCents, 0);
  assert.equal(perPair, chain.printed.totalMovementCents, 'the chain’s movement is the sum of the printed pairs');
});
