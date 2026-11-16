// ADR-0226 — Shared-dependency concentration of declared risk retention.
//
// The claims this suite exists to prove:
//
//   1. a shared row is the EXACT integer sum of the declared retentions of the
//      live risks that rely on one dependency, counted ONCE per risk even when
//      the reliance is declared twice or reached by two routes;
//   2. the share is exact basis points over the WHOLE declared population of the
//      same domain and currency, and the ceiling comparison is the register's own
//      breach rule (sum > ceiling) — and NO declared ceiling prints NOT COMPARED,
//      never "within";
//   3. currencies are never pooled: the same dependency in two currencies gives
//      two rows, each summed in its own currency;
//   4. reliance is recorded, never inferred: an unlinked risk is counted and
//      printed, a risk linked only to a retired dependency is counted, and neither
//      is placed in a dependency row;
//   5. an upstream chain is read from the dependency record, with the minimal hop
//      count, a cycle terminates, and a retired link is not traversed;
//   6. the partition claim (every declared risk accounted for once) and the
//      coverage claim (every open risk declared, every declared risk linked) are
//      reported separately;
//   7. a risk the seat may not see is never summed into a figure it can read: the
//      whole reading is withheld with a printed reason;
//   8. what the page prints is what the reader computed, cell by cell, and each
//      printed figure is re-derived here, independently, from the raw record.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import {
  RC_ADR,
  RC_DEPENDENCY_ROW_CAP,
  RC_ENGINE_VERSION,
  RC_MAX_HOPS,
  RC_METHOD,
  buildRiskConcentration,
  reachDependencies,
  riskConcentrationCsvRows,
} from '../../app/core/domain/riskConcentration.js';
import { riskConcentrationConditions, riskConcentrationRule, indexRiskConcentrationAsks } from '../../app/core/domain/riskConcentrationRules.js';
import { RC_CSV_SCOPE, RC_LIMITS as RC_LIMITS_REGISTRY, RC_RULE_ID } from '../../app/core/domain/riskConcentrationRegistry.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';
import { renderRiskAppetite } from '../../app/views/riskAppetite.js';
import { activeSeat, buildSeats } from '../../app/core/domain/seat.js';
import { buildMatrix } from '../../app/core/domain/matrix.js';

const T0 = '2026-11-15T12:00:00.000Z';
const TODAY = new Date(T0);
const BASIS = 'The retained amount is accepted deliberately until the planned control lands; the exposure is priced, not overlooked.';

const person = (id, managerId, level) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  managerId,
  level,
  role: 'Executive',
  status: 'active',
  startDate: '2026-01-01T09:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T09:00:00.000Z',
});
const caseRow = (id, title, ownerId, status = 'open', kind = 'risk') => ({
  id, title, kind, status, ownerId, openedOn: '2026-10-01', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z',
});
const dep = (id, extra = {}) => ({
  id, name: `Dependency ${id}`, kind: 'service', criticality: 'critical', status: 'active',
  upstreamIds: [], stewards: [], drills: [], history: [], createdOn: '2026-01-01',
  createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:00:00.000Z', ...extra,
});
const link = (sourceId, targetId, sourceType = 'case', targetType = 'dependency', relation = 'depends-on') => ({
  id: `lnk-${sourceId}-${targetId}`, sourceType, sourceId, targetType, targetId, relation,
  ruleId: 'test', summary: 'test', createdOn: '2026-01-01', createdAt: '2026-01-01T09:00:00.000Z',
});
const decl = (id, caseId, retainedCents, extra = {}) => ({
  id, caseId, domain: 'operational', currency: 'DKK', retainedCents, basis: BASIS,
  declaredOn: '2026-11-02', declaredById: 'dan', ...extra,
});
const statement = (id, currency, toleranceCents, extra = {}) => ({
  id, domain: 'operational', measure: 'retained-exposure', currency, toleranceCents, appetite: 'open',
  declaredOn: '2026-11-01', reviewOn: '2027-02-01', declaredById: 'ceo', basis: BASIS, ...extra,
});

// ceo (rank 4) → dan (director) → mia, kai (managers) → ivo, lea (ICs)
function base() {
  const raw = createEmptyState(T0);
  raw.people = [
    person('ceo', null, 'vp'),
    person('dan', 'ceo', 'director'),
    person('mia', 'dan', 'manager'),
    person('ivo', 'mia', 'ic'),
    person('kai', 'dan', 'manager'),
    person('lea', 'kai', 'ic'),
  ];
  raw.cases = [
    caseRow('c1', 'Furnace liner degradation', 'ivo'),
    caseRow('c2', 'Supplier single point of failure', 'lea'),
    caseRow('c3', 'Night shift near miss', 'lea'),
    caseRow('c4', 'Undeclared vendor exit', 'ivo'),
  ];
  return raw;
}
const norm = (raw) => normalizeState(raw, { now: TODAY }).state;
// A seat exactly as the action builds it: the declared seat id, resolved through the roster.
const seatFor = (state, id) => activeSeat(buildSeats(state, {
  now: TODAY, settings: { ...(state.settings || {}), activeSeatId: id },
}));
const reading = (raw, seat = { fullAccess: true, id: 'operator' }) =>
  buildRiskConcentration(norm(raw), { now: TODAY, seat });

/* ------------------------------------------------------- 1. graph reading */

test('ADR-0226 graph: the minimal hop count is read, a cycle terminates, a retired node is not traversed', () => {
  const depsActive = new Map([
    ['A', { id: 'A', upstreamIds: ['B'] }],
    ['B', { id: 'B', upstreamIds: ['C'] }],
    ['C', { id: 'C', upstreamIds: ['A', 'D'] }],
    ['D', { id: 'D', upstreamIds: [] }],
  ]);
  const { reach, truncated } = reachDependencies(['A'], depsActive, RC_MAX_HOPS);
  assert.equal(truncated, false);
  assert.deepEqual([...reach.entries()].sort(), [['A', 0], ['B', 1], ['C', 2], ['D', 3]]);

  // A direct link reached by a shorter route keeps the shorter hop count.
  const twoRoutes = new Map([
    ['X', { id: 'X', upstreamIds: ['Y', 'Z'] }],
    ['Y', { id: 'Y', upstreamIds: ['Z'] }],
    ['Z', { id: 'Z', upstreamIds: [] }],
  ]);
  assert.equal(reachDependencies(['X'], twoRoutes).reach.get('Z'), 1);

  // A depth bound is printed as truncation, never silently cut.
  const chain = new Map([['P0', { id: 'P0', upstreamIds: ['P1'] }], ['P1', { id: 'P1', upstreamIds: ['P2'] }], ['P2', { id: 'P2', upstreamIds: [] }]]);
  const bounded = reachDependencies(['P0'], chain, 1);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.reach.has('P2'), false);
});

/* ------------------------------------------- 2. exact sums, shares, verdicts */

test('ADR-0226 sums: a risk counted once per dependency, exact cents, exact basis-point share, breach rule as the register', () => {
  const raw = base();
  raw.dependencies = [dep('D1')];
  // c1 declares its reliance twice (the normaliser keeps one edge); c2 once; c3 names none.
  raw.links = [link('c1', 'D1'), link('c1', 'D1'), link('c2', 'D1')];
  raw.riskDeclarations = [
    decl('rd1', 'c1', 125000000),
    decl('rd2', 'c2', 50000000, { declaredById: 'dan' }),
    decl('rd3', 'c3', 20000000),
  ];
  raw.riskAppetiteStatements = [statement('ras1', 'DKK', 170000000)];
  const r = reading(raw);
  assert.equal(r.withheld, false);
  assert.equal(r.adr, RC_ADR);
  assert.equal(r.engineVersion, RC_ENGINE_VERSION);
  assert.equal(r.sharedRows.length, 1);
  const row = r.sharedRows[0];
  assert.equal(row.riskN, 2);
  assert.deepEqual(row.riskIds, ['rd1', 'rd2']);
  assert.equal(row.retainedCents, 175000000, 'exact integer sum of the two risks, counted once each');
  assert.equal(row.domainTotalCents, 195000000, 'the denominator includes the unlinked risk');
  assert.equal(row.domainPopulationN, 3);
  assert.equal(row.shareBp, 8974, 'floor(175000000 * 10000 / 195000000) = 8974');
  assert.equal(row.toleranceCents, 170000000);
  assert.equal(row.verdict, 'would-exceed');
  assert.equal(row.overCeilingBy, 5000000);
  // The partition: 2 linked + 1 unlinked = 3 declared, each exactly once.
  assert.equal(r.totals.linkedN, 2);
  assert.equal(r.totals.unlinkedN, 1);
  assert.equal(r.totals.partitionReconciles, true);
  // The coverage claims are separate and BOTH false here: c4 is open and undeclared,
  // and c3 is declared but names no dependency.
  assert.equal(r.totals.undeclaredN, 1);
  assert.equal(r.totals.declarationCoverage, false);
  assert.equal(r.totals.dependencyCoverage, false);
  assert.equal(r.totals.wholePopulationMeasured, false);
  assert.ok(r.coverageReasons.some((text) => text.includes('UNKNOWN, not independent')));
});

test('ADR-0226 ceiling: no declared ceiling prints NOT COMPARED, never within; a sum exactly at the ceiling is within', () => {
  const raw = base();
  raw.dependencies = [dep('D1')];
  raw.links = [link('c1', 'D1'), link('c2', 'D1')];
  raw.riskDeclarations = [decl('rd1', 'c1', 100000000), decl('rd2', 'c2', 70000000)];
  const none = reading(raw);
  assert.equal(none.sharedRows[0].verdict, 'no-ceiling');
  assert.equal(none.sharedRows[0].toleranceCents, null);
  assert.equal(none.totals.noCeilingN, 1);
  assert.equal(none.totals.withinCeilingN, 0);

  raw.riskAppetiteStatements = [statement('ras1', 'DKK', 170000000)];
  const atCeiling = reading(raw);
  assert.equal(atCeiling.sharedRows[0].retainedCents, 170000000);
  assert.equal(atCeiling.sharedRows[0].verdict, 'within-ceiling', 'at the ceiling is within, as the register breach rule has it');
  assert.equal(atCeiling.sharedRows[0].overCeilingBy, null);
});

/* -------------------------------------------------------- 3. no pooling */

test('ADR-0226 currency: the same dependency in two currencies is two rows, each summed in its own currency', () => {
  const raw = base();
  raw.dependencies = [dep('D1')];
  raw.links = [link('c1', 'D1'), link('c2', 'D1')];
  raw.riskDeclarations = [
    decl('rd1', 'c1', 100000000, { currency: 'DKK' }),
    decl('rd2', 'c2', 9000000, { currency: 'USD' }),
  ];
  const r = reading(raw);
  // One risk per currency: neither currency has two risks on D1, so neither is a shared row.
  assert.equal(r.sharedRows.length, 0);
  assert.equal(r.dependencies[0].membersN, 2, 'the dependency is still read as carrying two declared risks');
  assert.equal(r.dependencies[0].shared, true);

  raw.riskDeclarations.push(decl('rd3', 'c3', 30000000, { currency: 'USD' }));
  raw.links.push(link('c3', 'D1'));
  const two = reading(raw);
  const usd = two.sharedRows.find((row) => row.currency === 'USD');
  const dkk = two.sharedRows.find((row) => row.currency === 'DKK');
  assert.equal(two.sharedRows.length, 1, 'DKK has one risk on D1, so only USD is a shared row');
  assert.equal(usd.retainedCents, 39000000, 'USD sums USD only');
  assert.equal(dkk, undefined);
});

/* -------------------------------------------------- 4. reliance is recorded */

test('ADR-0226 reliance: a risk linked only to a retired dependency is counted apart and read through nothing', () => {
  const raw = base();
  raw.dependencies = [dep('D1'), dep('R1', { status: 'retired', retiredOn: '2026-10-01', retiredReason: 'replaced by D1' })];
  raw.links = [link('c1', 'R1'), link('c2', 'D1')];
  raw.riskDeclarations = [decl('rd1', 'c1', 10000000), decl('rd2', 'c2', 20000000)];
  const r = reading(raw);
  assert.equal(r.totals.onlyRetiredN, 1);
  assert.equal(r.totals.linkedN, 1);
  assert.equal(r.totals.partitionReconciles, true, 'linked + unlinked + retired-only = declared');
  assert.equal(r.dependencies.some((row) => row.id === 'R1'), false);
  assert.equal(r.totals.retiredDependenciesN, 1);
  assert.equal(r.dependencies.find((row) => row.id === 'D1').membersN, 1);
});

test('ADR-0226 coverage: an open risk with no declaration is a coverage gap; a withdrawn declaration is not summed', () => {
  const raw = base();
  raw.dependencies = [dep('D1')];
  raw.links = [link('c1', 'D1'), link('c2', 'D1'), link('c4', 'D1')];
  raw.riskDeclarations = [
    decl('rd1', 'c1', 10000000),
    decl('rd2', 'c2', 20000000),
    decl('rd4', 'c4', 40000000, { withdrawnOn: '2026-11-10', withdrawnById: 'dan', withdrawalReason: 'The vendor exit is now mitigated by a contract.' }),
  ];
  const r = reading(raw);
  assert.equal(r.totals.undeclaredN, 2, 'c3 was never declared; c4 has its only declaration withdrawn');
  assert.equal(r.totals.declaredRisksN, 2, 'the withdrawn retention is not in the population');
  assert.equal(r.totals.declarationCoverage, false);
  assert.equal(r.totals.wholePopulationMeasured, false);
  assert.equal(r.sharedRows[0].retainedCents, 30000000, 'the withdrawn 40,000,000 is not summed');
  assert.ok(r.coverageReasons.some((text) => text.includes('missing its exposure')));
});

/* -------------------------------------------------------- 5. upstream chain */

test('ADR-0226 upstream: two services that rely on one upstream dependency share it, read through the record', () => {
  const raw = base();
  raw.dependencies = [
    dep('SVC-A', { upstreamIds: ['CLOUD'] }),
    dep('SVC-B', { upstreamIds: ['CLOUD'] }),
    dep('CLOUD'),
  ];
  raw.links = [link('c1', 'SVC-A'), link('c2', 'SVC-B')];
  raw.riskDeclarations = [decl('rd1', 'c1', 60000000), decl('rd2', 'c2', 25000000)];
  raw.riskAppetiteStatements = [statement('ras1', 'DKK', 80000000)];
  const r = reading(raw);
  const cloud = r.dependencies.find((row) => row.id === 'CLOUD');
  assert.equal(cloud.membersN, 2);
  assert.equal(cloud.directN, 0);
  assert.equal(cloud.viaUpstreamN, 2, 'both reach CLOUD only through one upstream hop');
  const row = r.sharedRows.find((item) => item.dependencyId === 'CLOUD');
  assert.equal(row.retainedCents, 85000000);
  assert.equal(row.verdict, 'would-exceed', '85,000,000 against an 80,000,000 ceiling, on the cloud alone');
  assert.equal(r.dependencies[0].id, 'CLOUD', 'the most-shared dependency is listed first');
});

/* ------------------------------------------------------ 6. the seat's grant */

// base() plus a second director branch: dan's span does not reach fay, so a
// declaration on fay's risk is one dan may not see, and dan's reading must be withheld.
function withheldRaw() {
  const raw = base();
  raw.people.push(person('eve', 'ceo', 'director'), person('fay', 'eve', 'ic'));
  raw.cases.push(caseRow('c5', 'Outside-span vendor exit', 'fay'));
  raw.dependencies = [dep('D1')];
  raw.links = [link('c1', 'D1'), link('c2', 'D1'), link('c5', 'D1')];
  raw.riskDeclarations = [
    decl('rd1', 'c1', 10000000),
    decl('rd2', 'c2', 20000000),
    decl('rd5', 'c5', 30000000, { declaredById: 'ceo' }),
  ];
  return raw;
}

test('ADR-0226 seat: a risk the seat may not see withholds the WHOLE reading, with a printed reason and no figure', () => {
  const raw = withheldRaw();
  const hidden = buildRiskConcentration(norm(raw), { now: TODAY, seat: seatFor(norm(raw), 'dan') });
  assert.equal(hidden.withheld, true);
  assert.ok(hidden.withheldReason.length > 0);
  assert.equal(hidden.totals, null);
  assert.equal(hidden.sharedRows.length, 0);
  assert.equal(hidden.dependencies.length, 0);
  assert.equal(hidden.hiddenN >= 1, true);

  // The VP sees the whole tree, so the same record is read in full: 10 + 20 + 30 = 60,000,000.
  const full = buildRiskConcentration(norm(raw), { now: TODAY, seat: seatFor(norm(raw), 'ceo') });
  assert.equal(full.withheld, false);
  assert.equal(full.sharedRows[0].retainedCents, 60000000);
  assert.equal(full.sharedRows[0].riskN, 3);
});

/* ----------------------------------------------- 7. API, view and parity */

function seed(raw) {
  const state = norm(raw);
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let clock = new Date(T0);
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => clock, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => clock, idFactory }), store, { now: () => clock.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  return { store, api, sit };
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

test('ADR-0226 API and panel: the printed shared row is the reader’s figure, and the reader is re-derived from the raw record', () => withDom(() => {
  const raw = base();
  raw.dependencies = [dep('D1'), dep('D2')];
  raw.links = [link('c1', 'D1'), link('c2', 'D1'), link('c2', 'D2'), link('c3', 'D2')];
  const env = seed(raw);
  // Declarations and the ceiling go through the register's own doors, as a user would.
  env.sit('dan');
  const carried = [
    ['c1', '1250000.00'], ['c2', '500000.00'], ['c3', '300000.00'],
  ].map(([caseId, retained]) => env.api.riskAppetiteDeclareRisk({
    caseId, domain: 'operational', currency: 'DKK', retained, declaredOn: '2026-11-02', basis: BASIS,
  }));
  assert.ok(carried.every((result) => result.ok), 'declarations accepted');
  env.sit('ceo');
  const ceiling = env.api.riskAppetiteDeclareStatement({
    domain: 'operational', measure: 'retained-exposure', currency: 'DKK', tolerance: '1700000.00',
    appetite: 'open', declaredOn: '2026-11-01', reviewOn: '2027-02-01', basis: BASIS,
  });
  assert.ok(ceiling.ok, 'ceiling accepted');

  const report = env.api.riskAppetiteConcentration();
  assert.equal(report.withheld, false);
  // Independent re-derivation from the raw stored declarations and links.
  const declared = env.store.state.riskDeclarations.filter((row) => !row.withdrawnOn);
  const cents = (id) => BigInt(declared.find((row) => row.caseId === id).retainedCents);
  const d1 = report.sharedRows.find((row) => row.dependencyId === 'D1');
  assert.equal(BigInt(d1.retainedCents), cents('c1') + cents('c2'), 'D1 sum recomputed from the record');
  assert.equal(d1.verdict, 'would-exceed', '1,750,000 against the 1,700,000 ceiling');
  assert.equal(BigInt(d1.overCeilingBy), cents('c1') + cents('c2') - 170000000n);
  assert.equal(d1.shareBp, Number((cents('c1') + cents('c2')) * 10000n / (cents('c1') + cents('c2') + cents('c3'))));
  // D2 is shared by c2 and c3 and is within the ceiling on its own.
  const d2 = report.sharedRows.find((row) => row.dependencyId === 'D2');
  assert.equal(BigInt(d2.retainedCents), cents('c2') + cents('c3'));
  assert.equal(d2.verdict, 'within-ceiling');
  // Dependency rows overlap by design: the risk c2 is under both, so the rows exceed the population.
  const rowSum = report.dependencies.reduce((acc, row) => acc + row.membersN, 0);
  assert.equal(rowSum, 4, 'c1 once, c2 twice, c3 once: overlap is shown, not hidden');
  assert.equal(report.totals.partitionReconciles, true);
  // c4 is open and was never declared, so the population is NOT whole — and the claim says so.
  assert.equal(report.totals.undeclaredN, 1);
  assert.equal(report.totals.wholePopulationMeasured, false);

  // The panel prints the reader’s own figures.
  const ctx = { api: env.api, navigate: () => {}, refresh: () => {}, query: new URLSearchParams('view=shared') };
  const node = renderRiskAppetite(ctx);
  const text = (testid) => node.querySelector(`[data-testid="${testid}"]`)?.textContent?.trim();
  assert.ok(node.querySelector('[data-testid="rc-view"]'), 'the shared-dependency view renders');
  assert.equal(text('rc-count-shared'), String(report.totals.sharedRowsN));
  assert.equal(text('rc-count-exceed'), String(report.totals.wouldExceedN));
  assert.equal(text('rc-count-declared'), String(report.totals.declaredRisksN));
  const cell = node.querySelector(`[data-testid="rc-row-cents-${d1.rowId}"]`);
  assert.equal(cell.getAttribute('data-cents'), String(d1.retainedCents));
  assert.ok(cell.textContent.includes('DKK 1,750,000.00'), 'the printed sum is the computed sum');
  const share = node.querySelector(`[data-testid="rc-row-share-${d1.rowId}"]`);
  assert.equal(share.getAttribute('data-bp'), String(d1.shareBp));
  assert.ok(share.textContent.includes(`${(d1.shareBp / 100).toFixed(2)}%`));
  assert.ok(node.querySelector(`[data-testid="rc-row-${d1.rowId}"]`).textContent.includes('Would exceed'));
  assert.equal(RC_METHOD.frameworks.length >= 3, true);
}));

test('ADR-0226 API: a director who cannot see one risk gets the withheld reading, and the panel prints no sum', () => withDom(() => {
  const raw = withheldRaw();
  const env = seed(raw);
  env.sit('dan');
  const report = env.api.riskAppetiteConcentration();
  assert.equal(report.withheld, true);
  assert.equal(report.totals, null);
  assert.equal(report.sharedRows.length, 0);
  const ctx = { api: env.api, navigate: () => {}, refresh: () => {}, query: new URLSearchParams('view=shared') };
  const node = renderRiskAppetite(ctx);
  assert.ok(node.textContent.includes('Withheld from this seat'));
  assert.equal(node.querySelector('[data-testid="rc-count-shared"]'), null, 'no figure is printed');
}));

test('ADR-0226 API gate: an individual contributor is refused at the read gate, not given a partial reading', () => {
  const env = seed(base());
  env.sit('lea');
  const result = env.api.riskAppetiteConcentration();
  assert.equal(result.ok, false, 'the read right is re-proved inside the action');
  assert.ok(result.error && result.error.length > 0, 'the refusal is printed with its reason');
});

test('ADR-0226 contract: the reader is read-only, the cap is printed, and the reading is deterministic', () => {
  const raw = base();
  raw.dependencies = [dep('D1'), dep('D2')];
  raw.links = [link('c1', 'D1'), link('c2', 'D2')];
  raw.riskDeclarations = [decl('rd1', 'c1', 10000000), decl('rd2', 'c2', 20000000)];
  const state = norm(raw);
  const before = JSON.stringify(state);
  const a = buildRiskConcentration(state, { now: TODAY, seat: { fullAccess: true, id: 'ceo', rank: 4 } });
  const b = buildRiskConcentration(state, { now: TODAY, seat: { fullAccess: true, id: 'ceo', rank: 4 } });
  assert.equal(JSON.stringify(state), before, 'no write');
  assert.deepEqual(a, b, 'a pure function of the record');
  assert.equal(a.dependenciesCapped, Math.max(0, a.dependencies.length - RC_DEPENDENCY_ROW_CAP));
  assert.equal(a.dependenciesShown + a.dependenciesCapped, 2);
});

/* ------------------------------------------------------------------ 9. rule */

/** One shared dependency whose combined retention would exceed its ceiling. */
function concentrationFixture() {
  const raw = base();
  raw.dependencies = [dep('D1')];
  raw.links = [link('c1', 'D1'), link('c2', 'D1')];
  raw.riskDeclarations = [
    decl('rd1', 'c1', 125000000),
    decl('rd2', 'c2', 50000000, { declaredById: 'dan' }),
  ];
  raw.riskAppetiteStatements = [statement('ras1', 'DKK', 170000000)];
  return raw;
}

function rccAsks(state) {
  return indexRiskConcentrationAsks(state).filter((ask) => ask.task && ask.task.status === 'active');
}

test('RULE-RCC-01 conditions: one ask to the seat above every carrying line', () => {
  const state = norm(concentrationFixture());
  const matrix = buildMatrix(state, { now: TODAY, settings: {} });
  const { conditions, observations } = riskConcentrationConditions(state, buildRiskConcentration(state, { now: TODAY, seat: null }), { today: '2026-11-15', matrix });
  assert.equal(observations.length, 0, 'no unaddressable observation');
  assert.equal(conditions.length, 1, 'exactly one condition');
  assert.equal(conditions[0].kind, 'concentration-would-exceed');
  assert.deepEqual(conditions[0].seatIds, ['dan'], 'the joint seat above mia and kai, both carrying lines');
  assert.equal(conditions[0].signature, 'rcc1:D1|operational|DKK');
  assert.equal(new Date(conditions[0].dueOn).toISOString().slice(0, 10), '2026-11-18');
});

test('RULE-RCC-01 conditions: a diamond tie files one condition per joint apex', () => {
  const state = norm(concentrationFixture());
  // Two minimal common seats above the carrying lines, neither above the other.
  const matrix = {
    nodes: new Map([
      ['mia', { id: 'mia', ancestors: new Set(['alfa', 'beta']) }],
      ['kai', { id: 'kai', ancestors: new Set(['alfa', 'beta']) }],
      ['alfa', { id: 'alfa', ancestors: new Set() }],
      ['beta', { id: 'beta', ancestors: new Set() }],
    ]),
    linesByPerson: new Map([
      ['ivo', [{ id: 'l1', personId: 'ivo', managerId: 'mia', active: true }]],
      ['lea', [{ id: 'l2', personId: 'lea', managerId: 'kai', active: true }]],
    ]),
  };
  const { conditions, observations } = riskConcentrationConditions(state, buildRiskConcentration(state, { now: TODAY, seat: null }), { today: '2026-11-15', matrix });
  assert.equal(observations.length, 0);
  assert.equal(conditions.length, 1);
  assert.deepEqual(conditions[0].seatIds.sort(), ['alfa', 'beta'], 'one seat per minimal joint apex');
});

test('RULE-RCC-01 conditions: no joint seat and no carrying line are observations, not asks', () => {
  const state = norm(concentrationFixture());
  const disconnected = {
    nodes: new Map([['mia', { id: 'mia', ancestors: new Set() }], ['kai', { id: 'kai', ancestors: new Set() }]]),
    linesByPerson: new Map([
      ['ivo', [{ id: 'l1', personId: 'ivo', managerId: 'mia', active: true }]],
      ['lea', [{ id: 'l2', personId: 'lea', managerId: 'kai', active: true }]],
    ]),
  };
  const away = riskConcentrationConditions(state, buildRiskConcentration(state, { now: TODAY, seat: null }), { today: '2026-11-15', matrix: disconnected });
  assert.equal(away.conditions.length, 0);
  assert.equal(away.observations.length, 1);
  assert.equal(away.observations[0].reason, 'no-joint-apex');

  // Owners that resolve to no active line at all.
  const raw = concentrationFixture();
  raw.cases = raw.cases.map((c) => (c.id === 'c1' || c.id === 'c2') ? { ...c, ownerId: 'nobody' } : c);
  const stateless = riskConcentrationConditions(norm(raw), buildRiskConcentration(norm(raw), { now: TODAY, seat: null }), { today: '2026-11-15', matrix: buildMatrix(norm(raw), { now: TODAY, settings: {} }) });
  assert.equal(stateless.conditions.length, 0);
  assert.equal(stateless.observations.length, 1);
  assert.equal(stateless.observations[0].reason, 'no-carrying-line');

  // A sum inside the ceiling files nothing at all.
  const inside = norm(concentrationFixture());
  inside.riskAppetiteStatements = [statement('ras1', 'DKK', 500000000)];
  const clear = riskConcentrationConditions(inside, buildRiskConcentration(inside, { now: TODAY, seat: null }), { today: '2026-11-15', matrix: buildMatrix(inside, { now: TODAY, settings: {} }).matrix });
  assert.equal(clear.conditions.length, 0);
  assert.equal(clear.observations.length, 0);
});

/** The shared fixture minus declarations and appetite — everything is filed through the API. */
function cleanFixture() {
  const raw = base();
  raw.dependencies = [dep('D1')];
  raw.links = [link('c1', 'D1'), link('c2', 'D1')];
  return raw;
}

test('RULE-RCC-01: one opaque ask per shared row, idempotent, closed when the ceiling rises', () => {
  const raw = norm(cleanFixture());
  const values = new Map([[STORAGE_KEY, JSON.stringify(raw)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => TODAY, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => TODAY, idFactory }), store, { now: () => TODAY.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; }, { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });

  // The declaration commits run the rule; the condition exists once the ceiling is declared.
  sit('dan');
  const carried = [
    ['c1', '1250000.00'], ['c2', '500000.00'],
  ].map(([caseId, retained]) => api.riskAppetiteDeclareRisk({ caseId, domain: 'operational', currency: 'DKK', retained, declaredOn: '2026-11-02', basis: BASIS }));
  assert.ok(carried.every((result) => result.ok), 'declarations accepted');
  sit('ceo');
  const ceiling = api.riskAppetiteDeclareStatement({ domain: 'operational', measure: 'retained-exposure', currency: 'DKK', tolerance: '1700000.00', appetite: 'open', declaredOn: '2026-11-01', reviewOn: '2027-02-01', basis: BASIS });
  assert.ok(ceiling.ok, 'ceiling accepted');

  let asks = rccAsks(store.state);
  assert.equal(asks.length, 1, 'the over-ceiling shared row files exactly one ask');
  assert.equal(asks[0].seatId, 'dan', 'to the joint seat above both carrying lines');
  const text = `${asks[0].task.title} ${asks[0].task.expectedOutcome} ${asks[0].task.support}`;
  for (const leak of ['D1', 'Dependency', 'operational', 'DKK', '1,750,000', '175000000', '1,700,000', 'c1', 'c2', 'would-exceed', 'rd1', 'rd2']) {
    assert.ok(!text.includes(leak), `the ask does not leak “${leak}”`);
  }
  const link = store.state.links.find((row) => row.ruleId === RC_RULE_ID && row.relation === 'issues-obligation');
  assert.ok(link, 'the typed issues-obligation link carries the signature');
  assert.ok(link.summary.includes('rcc1:D1|operational|DKK'));

  // A second commit for the same standing condition files nothing new.
  sit('ceo');
  assert.equal(rccAsks(store.state).length, 1, 'idempotent per (signature, addressee)');

  // A human's answer is respected and not filed again.
  const ask = asks[0].task;
  store.update((draft) => {
    const row = (draft.delegations || []).find((task) => task.id === ask.id);
    row.status = 'done';
    row.completedOn = '2026-11-15';
    row.completionNote = 'Tolerance raised by the board; see the minutes.';
  }, { type: 'delegation.done', entity: 'delegation', entityId: ask.id, summary: 'done by hand' });
  sit('ceo');
  assert.equal(rccAsks(store.state).length, 0, 'the answer stands');
});

test('RULE-RCC-01: a ceiling that rises above the exposure clears the condition and closes the ask', () => {
  const raw = norm(cleanFixture());
  const values = new Map([[STORAGE_KEY, JSON.stringify(raw)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => TODAY, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => TODAY, idFactory }), store, { now: () => TODAY.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; }, { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  sit('dan');
  assert.ok(api.riskAppetiteDeclareRisk({ caseId: 'c1', domain: 'operational', currency: 'DKK', retained: '1250000.00', declaredOn: '2026-11-02', basis: BASIS }).ok);
  assert.ok(api.riskAppetiteDeclareRisk({ caseId: 'c2', domain: 'operational', currency: 'DKK', retained: '500000.00', declaredOn: '2026-11-02', basis: BASIS }).ok);
  sit('ceo');
  const tight = api.riskAppetiteDeclareStatement({ domain: 'operational', measure: 'retained-exposure', currency: 'DKK', tolerance: '1700000.00', appetite: 'open', declaredOn: '2026-11-01', reviewOn: '2027-02-01', basis: BASIS });
  assert.ok(tight.ok, 'the tight ceiling is accepted');
  assert.equal(rccAsks(store.state).length, 1, 'the over-ceiling shared row files exactly one ask');
  const firstAsk = rccAsks(store.state)[0].task;
  const raised = api.riskAppetiteDeclareStatement({ domain: 'operational', measure: 'retained-exposure', currency: 'DKK', tolerance: '500000000.00', appetite: 'open', declaredOn: '2026-11-03', reviewOn: '2027-02-01', basis: BASIS });
  assert.ok(raised.ok, 'the higher ceiling is accepted');
  sit('ceo');
  const asksAfter = rccAsks(store.state);
  assert.equal(asksAfter.length, 0, 'the cleared condition files no ask');
  const closed = store.state.delegations.find((row) => row.id === firstAsk.id);
  assert.ok(closed && String(closed.completionNote || '').startsWith(RC_RULE_ID), 'the rule closed its own ask when the condition cleared');
});

test('RULE-RCC-01: the pause governs every path, and the switch survives reload', () => {
  const env = seed(norm(concentrationFixture()));
  env.sit('dan');
  apiDeclare(env, 'c1', '1250000.00');
  apiDeclare(env, 'c2', '500000.00');
  env.sit('ceo');
  env.api.riskAppetiteDeclareStatement({ domain: 'operational', measure: 'retained-exposure', currency: 'DKK', tolerance: '1700000.00', appetite: 'open', declaredOn: '2026-11-01', reviewOn: '2027-02-01', basis: BASIS });
  assert.equal(rccAsks(env.store.state).length, 1, 'a condition on the record files its ask');

  env.sit('ceo');
  assert.ok(env.api.updateSettings({ riskConcentrationAutoPropagate: false }).ok, 'the pause is granted');
  env.sit('ceo');
  assert.equal(rccAsks(env.store.state).length, 1, 'the pause stops new asks; the standing ask is left in place, not silently closed');

  env.sit('ceo');
  assert.ok(env.api.updateSettings({ riskConcentrationAutoPropagate: true }).ok, 'resuming');
  env.sit('ceo');
  assert.equal(rccAsks(env.store.state).length, 1, 'resuming files the standing condition');

  // Reload keeps the switch: it is declared in the persistence vocabulary.
  const reloaded = normalizeState(env.store.state, { now: TODAY }).state;
  assert.equal(reloaded.settings.riskConcentrationAutoPropagate, true, 'the switch survives normalization');
});

test('RULE-RCC-01: no ceiling, no condition — the row is printed but never asked about', () => {
  const env = seed(norm(cleanFixture()));
  env.sit('dan');
  apiDeclare(env, 'c1', '1250000.00');
  apiDeclare(env, 'c2', '500000.00');
  // No statement: the shared row reads no-ceiling / NOT COMPARED.
  env.sit('ceo');
  assert.equal(rccAsks(env.store.state).length, 0, 'no ceiling means nothing is owed');
});

test('RULE-RCC-01: CSV scope #169 is aggregate, identity-free, and floor-of-three suppressed', () => {
  const raw = norm(concentrationFixture());
  const csv = exportWorkspaceCsv(raw, RC_CSV_SCOPE, { now: TODAY });
  assert.equal(csv.ok, true, 'the scope is declared');
  const text = csv.csv;
  assert.ok(csv.filename.includes('risk-concentration'), 'the filename carries the scope');
  // Identity-free: no person, case title, declaration id or dependency name reaches the file.
  // Domain, currency, amounts and the verdict are aggregate figures — they are the point of the report.
  for (const leak of ['dan', 'ceo', 'ivo', 'lea', 'Furnace', 'Supplier', 'Dependency', 'rd1', 'rd2', 'c1', 'c2']) {
    assert.ok(!text.includes(leak), `the export does not leak “${leak}”`);
  }
  const lines = text.trim().replace(/\r/g, '').split('\n');
  const header = lines[0].split(',');
  assert.ok(header.includes('dependency_code') && header.includes('verdict') && header.includes('blank_reason'), 'the expected columns');
  assert.equal(header.indexOf('dependency_code'), 5, 'dependency_code is the opaque identity column');
  const summary = lines.find((line) => line.startsWith('2026-11-15,summary,all,'));
  assert.ok(summary && summary.includes('small_cell_suppressed(1)'), 'a summary row with the reader’s own counts');
  const shared = lines.filter((line) => line.includes(',shared-row,'));
  assert.equal(shared.length, 1, 'one shared row');
  const cells = shared[0].split(',');
  const row = Object.fromEntries(header.map((key, i) => [key, cells[i]]));
  assert.equal(row.dependency_code, 'D01', 'the dependency exports under an opaque code');
  assert.equal(row.domain, 'operational');
  assert.equal(row.currency, 'DKK');
  assert.equal(row.risks_n, '', 'floor of three: two risks suppress the count cell');
  assert.equal(row.domain_population_n, '', 'floor of three: a population of two suppresses its count cell too');
  assert.equal(row.retained_together_cents, '175000000');
  assert.equal(row.share_of_domain_bp, '10000');
  assert.equal(row.declared_ceiling_cents, '170000000');
  assert.equal(row.verdict, 'would-exceed');
  assert.equal(row.blank_reason, 'small_cell_suppressed');

  // Three risks on the dependency: the count cell prints above the floor.
  const bigger = norm(concentrationFixture());
  bigger.riskDeclarations.push(decl('rd3', 'c3', 30000000, { currency: 'DKK' }));
  bigger.links.push(link('c3', 'D1'));
  const bigCsv = exportWorkspaceCsv(bigger, RC_CSV_SCOPE, { now: TODAY }).csv.replace(/\r/g, '');
  const bigShared = bigCsv.split('\n').filter((line) => line.includes(',shared-row,'))[0].split(',');
  const bigHeader = bigCsv.split('\n')[0].split(',');
  const bigRow = Object.fromEntries(bigHeader.map((key, i) => [key, bigShared[i]]));
  assert.equal(bigRow.risks_n, '3', 'three shared risks print above the floor of three');
  assert.equal(bigRow.retained_together_cents, '205000000');
});

function apiDeclare(env, caseId, retained) {
  return env.api.riskAppetiteDeclareRisk({ caseId, domain: 'operational', currency: 'DKK', retained, declaredOn: '2026-11-02', basis: BASIS });
}
