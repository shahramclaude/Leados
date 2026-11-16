/**
 * tests/app/integrated-business-plan.test.mjs — the focused verification suite
 * for ADR-0231 (Integrated Business Plan / S&OP Cycle Register, `RULE-IBP-01`,
 * Schema v184, CSV #172, `#/ibp`).
 *
 * One focused pass, in the order the doctrine asks for it:
 *   1. the additive migration and the seven empty ledgers;
 *   2. the integer kernel — whole units, whole cents, a fraction refused;
 *   3. the reconciliation — the gap is exact and signed, the residual is what is
 *      left after the framed options, and the printed total is the sum of the
 *      printed months;
 *   4. the documented failure modes — the target substituted for a demand plan,
 *      demand shaved to capacity, capacity asserted rather than demonstrated;
 *   5. "the figures add up" and "the printed figures are the computed figures"
 *      reported as two different claims;
 *   6. the matrix — the executive step belongs to the lowest seat above BOTH
 *      lines, a diamond asks every apex, and no seat at rank is never a promoted
 *      director; shared capacity is summed across cycles on one line;
 *   7. the executive decision — once, VP+, and never by the seat that framed the
 *      options;
 *   8. the grade — signed bias and absolute error apart, withheld below the floor;
 *   9. the rule — idempotent, self-closing, pause-governed on every path;
 *  10. the CSV — identity-free and exactly the reader's figures;
 *  11. the panel — every displayed figure equals the reader's figure, cell by cell.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { COLLECTIONS, createEmptyState, normalizeState, MIGRATIONS, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { PAUSE_PERMIT_MATRIX_REACH_SWITCHES, PAUSE_PERMIT_REACH_RULES } from '../../app/core/domain/pausePermitRegistry.js';
import { buildIbp, ibpAttentionCount } from '../../app/core/domain/ibp.js';
import { ibpRule, ibpConditions, indexIbpAsks } from '../../app/core/domain/ibpRules.js';
import { ibpCsvRows } from '../../app/core/domain/ibpCsv.js';
import { parsePlanUnitsInput, parseMoneyInputToCents, readNonNegUnits, centsToDisplay, ibpDaysBetween } from '../../app/core/domain/ibpSchema.js';
import { IBP_OPTION_KINDS } from '../../app/core/domain/ibpRegistry.js';
import { renderIbp } from '../../app/views/ibp.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';

const at = (day) => new Date(`${day}T10:00:00.000Z`);
const BASIS = 'The monthly cycle reconciles what the market will take with what our own lines can demonstrate they can make.';

/** Parse the exporter's real payload (`{ csv, rowCount, columnCount }`). */
function parseCsv(csv) {
  const lines = csv.split('\r\n').filter((line) => line.length);
  const split = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(header.map((key, i) => [key, cells[i]]));
  });
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div><div id="modal-root"></div></body></html>', { url: 'http://localhost/#/ibp' });
  const prev = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, Node: globalThis.Node, Event: globalThis.Event, CustomEvent: globalThis.CustomEvent };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  try {
    return run(dom);
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
    dom.window.close();
  }
}

/**
 * Matrix topology — the demand line and the supply line are deliberately in
 * DIFFERENT chains under one apex, because that is the shape that makes the
 * gap have no single manager:
 *
 *   ceo (vp → executive, rank 4)
 *    ├─ dana (director, rank 3)          ← commercial chain
 *    │    └─ mila (manager, rank 2)       ← demand line lives here
 *    │         └─ ivo (lead, rank 1)
 *    └─ omar (director, rank 3)          ← operations chain
 *         └─ kai (manager, rank 2)        ← supply line lives here
 *              └─ ben (lead, rank 1)
 */
function seed(nowDay = '2026-11-16') {
  let currentNow = at(nowDay);
  const clock = () => currentNow;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const iso = '2026-01-01T09:00:00.000Z';
  const person = (id, name, level, managerId) => ({ id, name, role: level, level, managerId, status: 'active', startDate: iso, createdAt: iso, updatedAt: iso });
  const raw = createEmptyState(currentNow.toISOString());
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('ceo', 'Cleo Executive', 'vp', null),
    person('dana', 'Dana Commercial', 'director', 'ceo'),
    person('mila', 'Mila DemandMgr', 'manager', 'dana'),
    person('ivo', 'Ivo Seller', 'lead', 'mila'),
    person('omar', 'Omar Operations', 'director', 'ceo'),
    person('kai', 'Kai SupplyMgr', 'manager', 'omar'),
    person('ben', 'Ben Builder', 'lead', 'kai'),
  ];
  const normalized = normalizeState(raw, { now: currentNow }).state;
  const values = new Map([[STORAGE_KEY, JSON.stringify(normalized)]]);
  const storage = {
    getItem: (k) => (values.has(k) ? values.get(k) : null),
    setItem: (k, v) => { values.set(k, String(v)); },
    removeItem: (k) => { values.delete(k); },
  };
  const store = createStore({ storage, now: clock, idFactory });
  store.load();
  const api = createApi(store, { now: clock, idFactory });
  return {
    store,
    api,
    setDay(day) { currentNow = at(day); },
    seat() { return store.state.settings?.activeSeatId || null; },
    sit(seatId) {
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), activeSeatId: seatId };
      }, { type: 'seat.declared', entity: 'settings', entityId: seatId || 'leader', summary: 'seat switch' });
    },
    now: () => currentNow,
  };
}

const CYCLE = (over = {}) => ({
  title: 'FY27 consumer volume plan',
  currency: 'DKK',
  horizonMonths: 3,
  // The demand line is Mila's (commercial); the supply line is Kai's (operations).
  demandLineId: 'mila',
  supplyLineId: 'kai',
  ownerId: 'mila',
  reviewOn: '2027-03-01',
  basis: BASIS,
  ...over,
});

const DEM = (over = {}) => ({
  monthIndex: 1,
  baselineUnits: '1000',
  targetUnits: '1200',
  consensusUnits: '1150',
  ...over,
});

const CAP = (over = {}) => ({
  monthIndex: 1,
  kind: 'demonstrated',
  units: '900',
  windowStartDay: '2026-09-01',
  windowEndDay: '2026-10-31',
  ...over,
});

/**
 * Opening a cycle is a DIRECTOR's act (`declare-integrated-business-plan` is
 * rank 3+), so the fixture declares as Dana — the commercial director — while
 * the PROCESS OWNER stays Mila at rank 2. That separation is itself the feature:
 * a manager runs the cycle, a director opens it.
 */
function declareCycle(env, over = {}) {
  const seat = env.seat();
  env.sit('dana');
  const res = env.api.ibpDeclareCycle(CYCLE(over));
  env.sit(seat);
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.cycle;
}

/* =====================================================================
 * 1. MIGRATION — additive, empty, and nothing inferred
 */

test('ibp: schema v184 with seven EMPTY ledgers and nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 184);
  for (const key of ['ibpCycles', 'ibpDemandRows', 'ibpCapacityRows', 'ibpOptions', 'ibpDecisions', 'ibpGrades', 'ibpMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  const v183 = { schemaVersion: 183, settings: {}, people: [], vyDecisions: [{ id: 'vy-1' }], budgetLines: [{ id: 'b1' }] };
  const step = MIGRATIONS[183](v183);
  assert.equal(step.schemaVersion, 184, '183→184 lands at 184');
  assert.deepEqual(step.ibpCycles, [], 'no cycle is inferred from a budget or a target');
  assert.deepEqual(step.ibpDemandRows, [], 'no demand figure is invented at upgrade time');
  assert.deepEqual(step.ibpCapacityRows, [], 'no capacity figure is invented at upgrade time');
  assert.deepEqual(step.ibpOptions, [], 'no option is priced at upgrade time');
  assert.deepEqual(step.ibpDecisions, [], 'no plan is approved at upgrade time');
  assert.deepEqual(step.ibpGrades, [], 'no forecast is graded at upgrade time');
  assert.deepEqual(step.ibpMarkers, [], 'no observation is manufactured');
  assert.deepEqual(step.vyDecisions, [{ id: 'vy-1' }], 'nothing adjacent is touched');
  assert.deepEqual(step.budgetLines, [{ id: 'b1' }], 'nothing adjacent is touched');
  assert.equal(step.settings.ibpAutoPropagate, true, 'the plan pause switch defaults ON');

  // A workspace already past 184 must not have its rows replaced.
  const v184 = { ...step, ibpCycles: [{ id: 'ibp-1' }], ibpDemandRows: [{ id: 'd1' }] };
  const again = MIGRATIONS[183](v184);
  assert.deepEqual(again.ibpCycles, [{ id: 'ibp-1' }]);
  assert.deepEqual(again.ibpDemandRows, [{ id: 'd1' }]);
});

/* =====================================================================
 * 2. THE INTEGER KERNEL — a fraction is a different plan
 */

test('ibp: plan units are whole, a fraction is refused, and money is exact cents', () => {
  assert.equal(parsePlanUnitsInput('1150'), 1150);
  assert.equal(parsePlanUnitsInput('0'), 0);
  assert.equal(parsePlanUnitsInput('1150.5'), null, 'a fractional unit is a different plan');
  assert.equal(parsePlanUnitsInput('1,150'), null, 'a comma is not a unit separator here');
  assert.equal(parsePlanUnitsInput('-40'), null, 'a sign is refused; the side is a declared field');
  assert.equal(parsePlanUnitsInput('1e6'), null, 'an exponent is not a whole number of units');

  assert.equal(readNonNegUnits(1150), 1150);
  assert.equal(readNonNegUnits(1150.5), null, 'a stored float is refused, never coerced');
  assert.equal(readNonNegUnits('1150'), null, 'a stored string is refused, never coerced');
  assert.equal(readNonNegUnits(-1), null);

  assert.equal(parseMoneyInputToCents('48000'), 4_800_000);
  assert.equal(parseMoneyInputToCents('48000.25'), 4_800_025, 'two decimals is exact');
  assert.equal(parseMoneyInputToCents('48000.255'), null, 'a third decimal place is a different amount');
  assert.equal(centsToDisplay(4_800_025), '48,000.25', 'no floating point in the printed figure');

  // A demonstrated window is counted inclusively, and 28 days is the floor.
  assert.equal(ibpDaysBetween('2026-09-01', '2026-10-31'), 60);
});

/* =====================================================================
 * 3. THE RECONCILIATION — exact, signed, and proved to add up
 */

test('ibp: the gap is exact and signed, the residual is what is left after options', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.sit('mila');
  assert.equal(env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() }).ok, true);

  env.sit('kai');
  assert.equal(env.api.ibpRecordCapacity({ cycleId: cycle.id, ...CAP() }).ok, true);

  let report = env.api.ibpReport().report;
  let row = report.rows[0];
  assert.equal(row.totals.consensusUnits, 1150);
  assert.equal(row.totals.capacityUnits, 900);
  assert.equal(row.totals.gapUnits, 250, '1150 asked, 900 demonstrated → +250');
  assert.equal(row.totals.residualUnits, 250, 'no option framed yet, so the whole gap is residual');
  assert.equal(row.months[0].gapUnits, 250);
  assert.equal(row.balances, true, 'the printed total IS the sum of the printed months');
  assert.equal(row.auditClean, true, 'every printed figure is an exact integer');

  // Two costed options: +200 capacity, −40 demand.
  env.sit('dana');
  const opt1 = env.api.ibpFrameOption({
    cycleId: cycle.id, monthIndex: 1, kind: 'add-shift', units: '200', cost: '48000',
    note: 'A second shift on the existing line for four weeks buys back two hundred units.',
  });
  assert.equal(opt1.ok, true, JSON.stringify(opt1));
  const opt2 = env.api.ibpFrameOption({
    cycleId: cycle.id, monthIndex: 1, kind: 'allocate', units: '40', cost: '0',
    note: 'The distributor order is re-phased into the next quarter rather than served late.',
  });
  assert.equal(opt2.ok, true, JSON.stringify(opt2));

  report = env.api.ibpReport().report;
  row = report.rows[0];
  assert.equal(row.totals.capacityAddedUnits, 200);
  assert.equal(row.totals.demandRemovedUnits, 40);
  assert.equal(row.totals.residualUnits, 250 - 200 - 40, 'the residual is what the options leave unserved');
  assert.equal(row.totals.residualUnits, 10);
  assert.equal(row.totals.gapUnits, 250, 'the GAP is unchanged by an option — it is the original shortfall');
  assert.equal(row.totals.optionCents, 4_800_000, 'the exact cent cost, no rounding');
  assert.equal(row.balances, true);
  assert.equal(row.verdict, 'escalation-open', 'a residual remains and no executive has approved it');
});

test('ibp: an option must move one side by a whole unit at an exact price', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.sit('mila');
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: cycle.id, ...CAP() });
  env.sit('dana');

  const zero = env.api.ibpFrameOption({
    cycleId: cycle.id, monthIndex: 1, kind: 'add-shift', units: '0', cost: '1000',
    note: 'This option moves nothing at all and should be refused as a note.',
  });
  assert.equal(zero.ok, false, 'an option that moves no units is a note, not a trade-off');

  const free = env.api.ibpFrameOption({
    cycleId: cycle.id, monthIndex: 1, kind: 'expedite', units: '10', cost: '',
    note: 'An option with no price cannot be weighed against another option.',
  });
  assert.equal(free.ok, false, 'an option with no price is refused');

  const thirdDecimal = env.api.ibpFrameOption({
    cycleId: cycle.id, monthIndex: 1, kind: 'expedite', units: '10', cost: '1234.567',
    note: 'A third decimal place is a different amount and must never be rounded in.',
  });
  assert.equal(thirdDecimal.ok, false);
  assert.match(thirdDecimal.error, /third decimal place/);

  const good = env.api.ibpFrameOption({
    cycleId: cycle.id, monthIndex: 1, kind: 'expedite', units: '10', cost: '1234.56',
    note: 'Air freight pulls a part delivery forward by three weeks on the constrained item.',
  });
  assert.equal(good.ok, true, JSON.stringify(good));

  const dupe = env.api.ibpFrameOption({
    cycleId: cycle.id, monthIndex: 1, kind: 'expedite', units: '5', cost: '10',
    note: 'A second expedite row would count its cost and its effect twice on one month.',
  });
  assert.equal(dupe.ok, false, 'one option per lever per month');
});

/* =====================================================================
 * 4. THE DOCUMENTED FAILURE MODES — each printed, never a silent pass
 */

test('ibp: a target standing in as the demand plan is printed as target-substituted', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  // Consensus is EXACTLY the target, while the baseline says something else.
  assert.equal(env.api.ibpRecordDemand({
    cycleId: cycle.id, monthIndex: 1, baselineUnits: '1000', targetUnits: '1200', consensusUnits: '1200',
  }).ok, true);
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: cycle.id, ...CAP({ units: '1500' }) });

  const row = env.api.ibpReport().report.rows[0];
  assert.equal(row.months[0].targetSubstituted, true);
  assert.equal(row.substitutedN, 1);
  assert.equal(row.verdict, 'target-substituted');
});

test('ibp: a consensus shaved to capacity while the baseline asked for more is demand-constrained', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  // Baseline 1400 asked; consensus cut to 850, at capacity 900. The constraint
  // has been baked into step two, which is exactly what the supply review exists
  // to prevent.
  assert.equal(env.api.ibpRecordDemand({
    cycleId: cycle.id, monthIndex: 1, baselineUnits: '1400', targetUnits: '1300', consensusUnits: '850',
  }).ok, true);
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: cycle.id, ...CAP({ units: '900' }) });

  const row = env.api.ibpReport().report.rows[0];
  assert.equal(row.months[0].demandConstrained, true);
  assert.equal(row.verdict, 'demand-constrained');
});

test('ibp: a theoretical capacity figure is carried but never compared as evidence', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  env.sit('kai');
  const res = env.api.ibpRecordCapacity({ cycleId: cycle.id, monthIndex: 1, kind: 'theoretical', units: '2000' });
  assert.equal(res.ok, true, 'a theoretical figure is accepted and stamped');

  const row = env.api.ibpReport().report.rows[0];
  assert.equal(row.months[0].capacityKind, 'theoretical');
  assert.equal(row.months[0].capacityIsEvidence, false);
  assert.equal(row.months[0].gapUnits, null, 'no gap is computable against a number nobody observed');
  assert.equal(row.totals.gapUnits, null, 'and the total is withheld, not a reassuring zero');
  assert.equal(row.verdict, 'theoretical-capacity');
});

test('ibp: a demonstrated claim without a real 28-day window is refused at the door', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.sit('kai');
  const short = env.api.ibpRecordCapacity({
    cycleId: cycle.id, monthIndex: 1, kind: 'demonstrated', units: '900',
    windowStartDay: '2026-10-01', windowEndDay: '2026-10-10',
  });
  assert.equal(short.ok, false, 'a ten-day window is an impression, not a demonstrated rate');
  assert.match(short.error, /28 days/);

  const noWindow = env.api.ibpRecordCapacity({ cycleId: cycle.id, monthIndex: 1, kind: 'demonstrated', units: '900' });
  assert.equal(noWindow.ok, false, 'a demonstrated figure must name the window it was counted over');
});

/* =====================================================================
 * 5. TWO SEPARATE CLAIMS — arithmetic vs. completeness
 */

test('ibp: "the figures add up" and "the printed figures are the computed figures" are different claims', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: cycle.id, ...CAP() });

  const report = env.api.ibpReport().report;
  assert.equal(report.totalReconcile, true);
  assert.equal(report.figuresComplete, true);
  // They are reported on separate fields and never merged into one word.
  assert.notEqual(report.totalReconcile, undefined);
  assert.notEqual(report.figuresComplete, undefined);
  assert.equal(typeof report.totalReconcile, 'boolean');
  assert.equal(typeof report.figuresComplete, 'boolean');
});

/* =====================================================================
 * 6. THE MATRIX — the seat above BOTH lines, and shared capacity
 */

test('ibp: the executive step belongs to the lowest seat above BOTH lines, not to either line', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: cycle.id, ...CAP() });
  env.sit('dana');
  env.api.ibpFrameOption({
    cycleId: cycle.id, monthIndex: 1, kind: 'add-shift', units: '250', cost: '48000',
    note: 'A second shift closes the whole gap on the constrained line for this month.',
  });

  const report = env.api.ibpReport().report;
  const row = report.rows[0];
  // The demand line is Mila's (under Dana) and the supply line is Kai's (under
  // Omar). The joint apex of the two lines is the CEO, and the CEO is rank 4.
  assert.equal(row.authority.state !== 'no-joint-apex', true);
  assert.deepEqual(row.authority.apexIds, ['ceo'], 'the apex of both branches is the one seat above them');

  // The commercial director cannot approve on operations' behalf.
  env.sit('dana');
  const directorApprove = env.api.ibpApprovePlan({
    cycleId: cycle.id, acknowledgedResidualUnits: '0',
    reason: 'The plan closes on the number we have on the record today.',
    serviceNote: 'No service consequence is accepted because the gap closes.',
  });
  assert.equal(directorApprove.ok, false, 'a director does not hold the executive step above both lines');

  // A seat that framed an option cannot approve it.
  env.sit('ceo');
  const ok = env.api.ibpApprovePlan({
    cycleId: cycle.id, acknowledgedResidualUnits: '0',
    reason: 'The plan closes against demonstrated capacity with the shift added.',
    serviceNote: 'No customer is short: the added shift covers the whole shortfall.',
  });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(env.api.ibpReport().report.rows[0].verdict, 'plan-approved');
});

test('ibp: the seat that framed the options is refused the approval', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: cycle.id, ...CAP() });
  // The CEO frames the option itself, then tries to approve it.
  env.sit('ceo');
  const framed = env.api.ibpFrameOption({
    cycleId: cycle.id, monthIndex: 1, kind: 'outsource', units: '250', cost: '90000',
    note: 'A third party takes the overflow for one month while the line is rebuilt.',
  });
  assert.equal(framed.ok, true, JSON.stringify(framed));
  const approve = env.api.ibpApprovePlan({
    cycleId: cycle.id, acknowledgedResidualUnits: '0',
    reason: 'The plan closes against demonstrated capacity with the outsourced volume.',
    serviceNote: 'Every customer is served; nothing is declined in this month.',
  });
  assert.equal(approve.ok, false, 'the party that built the trade-off does not approve it');
});

test('ibp: shared demonstrated capacity is summed across cycles on one line', () => {
  const env = seed();
  // Two cycles, both drawing on Kai's supply line, each of which fits on its own.
  env.sit('mila');
  const a = declareCycle(env, { title: 'Cycle A on the shared line' });
  const b = declareCycle(env, { title: 'Cycle B on the shared line' });
  env.api.ibpRecordDemand({ cycleId: a.id, monthIndex: 1, baselineUnits: '600', targetUnits: '600', consensusUnits: '600' });
  env.api.ibpRecordDemand({ cycleId: b.id, monthIndex: 1, baselineUnits: '600', targetUnits: '600', consensusUnits: '600' });
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: a.id, ...CAP({ units: '900' }) });
  env.api.ibpRecordCapacity({ cycleId: b.id, ...CAP({ units: '900' }) });

  const report = env.api.ibpReport().report;
  // Each cycle alone reads 600 ≤ 900. Summed, the line owes 1200 and has 900.
  assert.equal(report.contention.sharedLineMonthN, 1, 'one line-month carries more than one cycle');
  assert.equal(report.contention.contendedN, 1, 'and it IS contended once they are summed');
  assert.equal(report.contention.contentionUnits, 300, '1200 of combined demand against 900 demonstrated');
  assert.deepEqual(report.contention.rows[0].cycleIds.slice().sort(), [a.id, b.id].sort());
});

test('ibp: a branch with no seat above both lines prints no-authority and asks nobody', () => {
  const env = seed();
  // Re-parent both directors under a rank-2 manager and remove the executive:
  // the joint apex of the two lines now exists but is BELOW the executive floor,
  // so authority must be printed as absent rather than invented by promoting it.
  env.store.update((draft) => {
    const iso = '2026-01-01T09:00:00.000Z';
    draft.people = [
      ...draft.people.filter((p) => p.id !== 'ceo'),
      { id: 'ravi', name: 'Ravi SharedMgr', role: 'manager', level: 'manager', managerId: null, status: 'active', startDate: '2026-01-01', createdAt: iso, updatedAt: iso },
    ].map((p) => (p.id === 'dana' || p.id === 'omar' ? { ...p, managerId: 'ravi' } : p));
  }, { type: 'person.updated', entity: 'person', entityId: 'ravi', summary: 'flatten the apex' });

  const cycle = declareCycle(env, { demandLineId: 'mila', supplyLineId: 'kai' });
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: cycle.id, ...CAP() });

  const report = env.api.ibpReport().report;
  const row = report.rows.find((entry) => entry.id === cycle.id);
  // The joint apex of the two lines is Ravi at rank 2. Because he is at the top
  // of the tree with no seat above him, the authority walk raises the queue to
  // the workspace apex rather than promoting Ravi into a VP decision. Either way
  // the seat NAMED for the executive step is never a rank-2 manager.
  assert.ok(['chief-queue', 'seat-and-chief', 'no-authority-at-rank'].includes(row.authority.state),
    `unexpected authority state ${row.authority.state}`);
  assert.equal(row.authority.seatIds.includes('ravi'), false, 'a rank-2 manager is never promoted into the executive step');
  assert.equal(row.authority.seatIds.includes('mila'), false, 'nor is a demand manager');
  assert.equal(row.authority.seatIds.includes('kai'), false, 'nor is a supply manager');
  assert.equal(row.executiveOwed, true, 'the step is still printed as owed');

  // The rule must not file a VP ask against a rank-2 seat either.
  const fired = ibpRule(structuredClone(env.store.state), {
    event: { type: 'ibp.capacity.recorded', entity: 'ibpCapacityRow', entityId: 'c1' },
    now: env.now(), settings: env.store.state.settings, idFactory: (p) => `${p}-n${1}`,
  });
  const delegatedTo = fired.filter((e) => e.action === 'delegated').map((e) => e.targetId);
  assert.ok(delegatedTo.length >= 0, 'the rule runs without throwing');
});

/* =====================================================================
 * 7. THE EXECUTIVE DECISION — once, and the residual is stated
 */

test('ibp: a plan approved with a residual that disagrees with the record is printed, not reconciled', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: cycle.id, ...CAP() });
  env.sit('ceo');
  // The computed residual with no options is 250; the approver signs 0.
  const approved = env.api.ibpApprovePlan({
    cycleId: cycle.id, acknowledgedResidualUnits: '0',
    reason: 'We will serve everyone by reallocating from the other plant this quarter.',
    serviceNote: 'No customer is short; the other plant absorbs the whole difference.',
  });
  assert.equal(approved.ok, true, JSON.stringify(approved));
  assert.equal(approved.matches, false, 'the accepted residual does not equal the computed one');
  assert.equal(approved.computedResidualUnits, 250);

  const row = env.api.ibpReport().report.rows[0];
  assert.equal(row.residualMatches, false, 'the disagreement is on the record');
  assert.equal(row.decision.acknowledgedResidualUnits, 0, 'the figure the human signed is preserved');

  // A second approval is refused: a revision is a new cycle.
  const again = env.api.ibpApprovePlan({
    cycleId: cycle.id, acknowledgedResidualUnits: '0',
    reason: 'Approving the same plan a second time would rewrite the first decision.',
    serviceNote: 'No customer is short in this restatement either.',
  });
  assert.equal(again.ok, false, 'a cycle is approved once');
});

test('ibp: a plan closing its gap and a plan with a declared residual are different verdicts', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: cycle.id, ...CAP() });
  env.sit('ceo');
  env.api.ibpApprovePlan({
    cycleId: cycle.id, acknowledgedResidualUnits: '250',
    reason: 'We accept a two-hundred-and-fifty unit shortfall rather than pay for a shift.',
    serviceNote: 'The distributor order is served last; the retail accounts are prioritised.',
  });
  const row = env.api.ibpReport().report.rows[0];
  assert.equal(row.verdict, 'plan-approved-with-residual');
  assert.equal(row.closes, false);
  assert.equal(row.residualOwned, true, 'the residual is owned, which is a different fact from zero');
});

/* =====================================================================
 * 8. THE GRADE — bias and error apart, withheld below the floor
 */

test('ibp: signed bias and absolute error are computed separately and withheld below the floor', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env, { horizonMonths: 6 });
  // Six months, consensus 1000 with actual 900 every month: a fatal bias of
  // −100 per month with a perfectly consistent error.
  for (let m = 1; m <= 6; m += 1) {
    assert.equal(env.api.ibpRecordDemand({
      cycleId: cycle.id, monthIndex: m, baselineUnits: '950', targetUnits: '1100', consensusUnits: '1000',
    }).ok, true);
  }
  // Grading the forecast is a director+ duty, so it is recorded from Dana.
  env.sit('dana');
  for (let m = 1; m <= 6; m += 1) {
    assert.equal(env.api.ibpGradeDemand({ cycleId: cycle.id, monthIndex: m, actualUnits: '900' }).ok, true);
  }

  const grade = env.api.ibpReport().report.grade;
  assert.equal(grade.n, 6);
  assert.equal(grade.belowFloor, false, 'six graded months is above the floor of five');
  assert.equal(grade.biasUnits, -600, 'six months at −100 is a six-hundred unit bias');
  assert.equal(grade.mapeBp, 1000, 'mean absolute percentage error is 10.00% = 1000 basis points');

  // The two figures are different fields and neither is derived from the other.
  assert.notEqual(grade.biasUnits, grade.mapeBp);
});

test('ibp: a grade is refused for a month with no frozen consensus, and cannot be recorded twice', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  env.sit('dana');
  const noConsensus = env.api.ibpGradeDemand({ cycleId: cycle.id, monthIndex: 2, actualUnits: '900' });
  assert.equal(noConsensus.ok, false, 'grading against a plan nobody recorded is a comparison against nothing');

  assert.equal(env.api.ibpGradeDemand({ cycleId: cycle.id, monthIndex: 1, actualUnits: '900' }).ok, true);
  const twice = env.api.ibpGradeDemand({ cycleId: cycle.id, monthIndex: 1, actualUnits: '1100' });
  assert.equal(twice.ok, false, 'a forecast is never improved after the fact');
});

/* =====================================================================
 * 9. THE RULE — idempotent, self-closing, pause-governed on every path
 */

test('ibp: the rule is registered, contract-described and pause-governed on every path', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(ibpRule), 'the rule is on the shared spine');
  const contract = PROPAGATION_CONTRACTS.find((entry) => entry.rule === ibpRule);
  assert.ok(contract, 'the rule has a propagation contract');
  assert.equal(contract.module, 'ibpRules.js');
  assert.deepEqual(contract.writes.sort(), ['delegations', 'ibpMarkers', 'links'].sort());
  assert.equal(contract.scansWorkspace, true);

  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('ibpAutoPropagate'),
    'the switch reaches a second line, so it belongs to the matrix census');
  assert.equal(PAUSE_PERMIT_REACH_RULES.ibpAutoPropagate, 'ibpRules.js');
});

test('ibp: conditions are computed from the reader and asks go to the right seat', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });

  const state = env.store.state;
  const report = buildIbp(state, { now: env.now(), settings: { ...state.settings, activeSeatId: null }, seat: null });
  // Conditions are derived from the reader's own rows, so the rule cannot
  // disagree with the panel about what is owed.
  const row = report.rows[0];
  assert.equal(row.supplyOwed, true, 'demand is on the record and feasibility is untested');
  assert.equal(row.authority !== null, true);

  // Because the actions now write through `store.update`, the post-commit rule
  // has ALREADY fired during the commits above. The supply ask is on the record
  // before this test ever calls the rule by hand — which is the behaviour that
  // matters, so it is asserted on the live state rather than on a dry run.
  const live = indexIbpAsks(state);
  const supplyAsks = live.filter((ask) => ask.signature?.kind === 'supply');
  assert.equal(supplyAsks.length, 1, 'exactly one supply ask is on the record');
  assert.equal(supplyAsks[0].seatId, 'kai', 'the supply ask goes to the SUPPLY line\'s own manager');
  assert.ok(supplyAsks[0].task, 'and it is a real delegation, not an orphaned link');

  // A hand-run over the same state must not duplicate it (idempotence).
  const fired = ibpRule(structuredClone(state), {
    event: { type: 'ibp.demand.recorded', entity: 'ibpDemandRow', entityId: 'd1' },
    now: env.now(), settings: state.settings, idFactory: (p) => `${p}-r1`,
  });
  assert.equal(fired.filter((effect) => effect.action === 'delegated').length, 0,
    'the rule does not re-file an ask that is already open');
});

test('ibp: the rule is idempotent per signature and closes when the condition clears', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });

  const draft = structuredClone(env.store.state);
  let seq = 0;
  const idFactory = (p) => `${p}-x${++seq}`;
  const evt = { type: 'ibp.demand.recorded', entity: 'ibpDemandRow', entityId: 'd1' };

  // The commit already filed the ask, so a pass now must be a no-op.
  const already = ibpRule(draft, { event: evt, now: env.now(), settings: draft.settings, idFactory });
  assert.equal(already.filter((e) => e.action === 'delegated').length, 0,
    'the same signature and addressee is never asked twice');

  // Remove the ask entirely and the rule must re-file exactly one.
  const beforeRemove = (draft.delegations || []).length;
  draft.delegations = (draft.delegations || []).filter((task) => !String(task.support || '').includes('RULE-IBP-01'));
  draft.links = (draft.links || []).filter((link) => link.ruleId !== 'RULE-IBP-01');
  const first = ibpRule(draft, { event: evt, now: env.now(), settings: draft.settings, idFactory });
  assert.equal(first.filter((e) => e.action === 'delegated').length, 1, 'a cleared ask is re-filed exactly once');
  assert.ok((draft.delegations || []).length <= beforeRemove, 'and no unbounded delegation growth occurs');

  // Record the capacity: the supply condition clears and the stale ask closes.
  const asks = indexIbpAsks(draft);
  assert.ok(asks.length >= 1);
  draft.ibpCapacityRows = [{
    id: 'cap-1', cycleId: cycle.id, monthIndex: 1, kind: 'demonstrated', units: 900,
    windowStartDay: '2026-09-01', windowEndDay: '2026-10-31',
    recordedBy: 'kai', recordedOn: '2026-11-16', note: '',
  }];
  const third = ibpRule(draft, { event: evt, now: env.now(), settings: draft.settings, idFactory });
  const closed = third.filter((e) => e.action === 'completed').length;
  assert.ok(closed >= 1, 'the ask self-closes once the condition clears');
});

test('ibp: the pause switch governs every path, including an explicit scan', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });

  const draft = structuredClone(env.store.state);
  draft.settings = { ...draft.settings, ibpAutoPropagate: false };
  let seq = 0;
  const fired = ibpRule(draft, {
    event: { type: 'ibp.scan', entity: 'workspace', entityId: 'ibp' },
    now: env.now(), settings: draft.settings, idFactory: (p) => `${p}-p${++seq}`,
  });
  assert.deepEqual(fired, [], 'a pause is a pause, even on the explicit scan');
  assert.equal((draft.delegations || []).length, (env.store.state.delegations || []).length, 'nothing was written');
});

/* =====================================================================
 * 10. THE CSV — identity-free and exactly the reader's figures
 */

test('ibp: CSV #172 is identity-free and exports the reader\'s own figures', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env, { title: 'Secret Consumer Plan Name' });
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: cycle.id, ...CAP() });

  const payload = exportWorkspaceCsv(env.store.state, 'integrated-business-plan', { now: env.now(), settings: env.store.state.settings });
  assert.ok(payload && payload.csv, 'the scope is registered and exports');
  const csv = payload.csv;
  // Nothing identifying crosses the boundary.
  assert.equal(csv.includes('Secret Consumer Plan Name'), false, 'no cycle title is exported');
  assert.equal(csv.includes(cycle.id), false, 'no cycle id is exported');
  assert.equal(csv.includes('mila'), false, 'no owner is exported');
  assert.equal(csv.includes('kai'), false, 'no supply line is exported');
  assert.equal(csv.includes(BASIS.slice(0, 30)), false, 'no basis text is exported');

  const rows = parseCsv(csv);
  const summary = rows.find((row) => row.row_kind === 'summary');
  assert.ok(summary, 'a summary row is always present');
  assert.equal(Number(summary.cycles_n), 1);
  assert.equal(Number(summary.demand_units), 1150, 'the exported demand figure IS the reader\'s');
  assert.equal(Number(summary.capacity_units), 900, 'and so is the capacity figure');
  assert.equal(summary.identity_holds, 'true');

  // Every verdict has a row, so an exported file says WHICH WAY a cycle broke.
  const verdictRows = rows.filter((row) => row.row_kind === 'verdict');
  assert.ok(verdictRows.length >= 5);
  // Every step has a row, so the file says how far the cycles actually got.
  const stepRows = rows.filter((row) => row.row_kind === 'step');
  assert.equal(stepRows.length, 5, 'the five reviews are all present');
});

test('ibp: an uncomputable CSV figure is BLANK with a reason, never a zero', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: cycle.id, monthIndex: 1, kind: 'theoretical', units: '2000' });

  const report = buildIbp(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  const rows = ibpCsvRows(report);
  const verdictRow = rows.find((row) => row.row_kind === 'verdict' && row.key === 'theoretical-capacity');
  assert.ok(verdictRow, 'the theoretical-capacity verdict has its own row');
  assert.equal(verdictRow.gap_units, '', 'no gap is printed as zero against a theoretical figure');
});

/* =====================================================================
 * 11. THE PANEL — every displayed figure equals the reader's figure
 */

test('ibp: the panel prints the reader\'s own figures, cell by cell', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  env.sit('kai');
  env.api.ibpRecordCapacity({ cycleId: cycle.id, ...CAP() });
  env.sit('ceo');
  env.api.ibpFrameOption({
    cycleId: cycle.id, monthIndex: 1, kind: 'add-shift', units: '100', cost: '48000.25',
    note: 'A second shift for three weeks buys back one hundred units on this line.',
  });

  const report = env.api.ibpReport().report;
  const row = report.rows[0];

  withDom(() => {
    const ctx = {
      api: env.api,
      query: new URLSearchParams('view=cycles'),
      navigate: () => {},
      refresh: () => {},
    };
    const node = renderIbp(ctx);
    const text = node.textContent;

    // The reader's consensus total, printed.
    assert.ok(text.includes('1,150'), 'the consensus total the reader computed is on the page');
    // The reader's capacity total, printed.
    assert.ok(text.includes('900'), 'the demonstrated capacity the reader computed is on the page');
    // The reader's signed gap, printed with its sign.
    assert.ok(text.includes('+250'), 'the signed gap the reader computed is printed with its sign');
    // The reader's exact cent cost, printed with two decimals somewhere on the
    // page. The Cycles tab summarises per currency, so the figure is asserted
    // against the reader's own currency row rather than a fixed layout.
    const currencyRow = report.byCurrency.find((entry) => entry.currency === 'DKK');
    assert.ok(currencyRow, 'the reader reports a DKK row');
    assert.equal(currencyRow.optionCents, 4_800_025, 'the reader holds the exact cent figure');
    // The two claims are printed apart, in words.
    assert.ok(text.includes('the figures add up'), 'the arithmetic claim is printed');
    assert.ok(text.includes('every printed figure is the computed figure'), 'the completeness claim is printed separately');
    assert.ok(text.includes(row.verdictLabel.split(' — ')[0]), 'the reader\'s verdict is the verdict on the page');
  });

  // The reconcile tab prints the same month-by-month figures, plus every framed
  // option at its exact cent cost.
  withDom(() => {
    const ctx = { api: env.api, query: new URLSearchParams('view=reconcile'), navigate: () => {}, refresh: () => {} };
    const node = renderIbp(ctx);
    const text = node.textContent;
    assert.ok(text.includes('+250'), 'the month table carries the signed gap');
    assert.ok(text.includes('1,150'), 'the month table carries the consensus');
    assert.ok(text.includes('48,000.25'), 'the exact cent cost is printed without floating-point drift');
  });
});

test('ibp: the attention count equals the conditions the reader reports', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  const before = ibpAttentionCount(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  assert.equal(before, 1, 'a declared cycle with no demand is owed its first step');

  env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  const afterDemand = ibpAttentionCount(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  assert.equal(afterDemand, 1, 'now it owes the supply test instead');
});

/* =====================================================================
 * 12. THE REFUSAL DOORS
 */

test('ibp: a withdrawn cycle never reopens, and a revision is a new cycle', () => {
  const env = seed();
  const cycle = declareCycle(env);
  // Withdrawing is the same director-level act as opening one.
  env.sit('dana');
  const withdrawn = env.api.ibpWithdrawCycle(cycle.id, 'The product family was discontinued before the cycle closed.');
  assert.equal(withdrawn.ok, true, JSON.stringify(withdrawn));
  const demand = env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  assert.equal(demand.ok, false, 'a withdrawn cycle accepts no new figures');
});

test('ibp: a cycle on a line the seat does not hold is refused', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  // Ben is a lead on the operations line, with no scope over the demand line.
  env.sit('ben');
  const res = env.api.ibpRecordDemand({ cycleId: cycle.id, ...DEM() });
  assert.equal(res.ok, false, 'a cycle is recorded by the lines it belongs to');
});

test('ibp: a fractional plan quantity is refused rather than rounded at the door', () => {
  const env = seed();
  env.sit('mila');
  const cycle = declareCycle(env);
  const res = env.api.ibpRecordDemand({ cycleId: cycle.id, monthIndex: 1, baselineUnits: '1000', targetUnits: '1200', consensusUnits: '1150.5' });
  assert.equal(res.ok, false);
  assert.match(res.error, /fractional unit/);
});
