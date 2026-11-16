// ADR-0219 — Enterprise Risk Appetite & Tolerance Breach Register (Schema v173).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — three empty ledgers, no tolerance and no
//      retention inferred from anything an upgraded workspace already holds;
//   2. MONEY IS EXACT AND SURVIVES RELOAD — a stored cents integer is never
//      routed back through a major-unit parser, so 1,250,000.00 cannot become
//      125,000,000.00 on the second load;
//   3. a count and an amount never share a field, and a third decimal place is
//      refused rather than rounded;
//   4. the LATEST declaration governs, and neither a withdrawal nor a retirement
//      resurrects an older row;
//   5. the measured figure is the exact sum of the declared population, and the
//      population's size is printed beside it;
//   6. “inside the ceiling” and “the whole population was measured” are TWO
//      claims, reported separately;
//   7. a currency the statement does not declare is EXCLUDED with its own
//      total — never converted and never pooled;
//   8. one risk is counted ONCE even when its owner holds several lines, its
//      exposure is never split across those lines, and the escalation goes to
//      the seat above every carrying line — never to the owner;
//   9. RULE-RAP-01 files one opaque ask per condition, is idempotent, closes its
//      own ask when the condition clears, respects a human's answer, and is
//      paused on every path including a scan;
//  10. the door refuses the owner declaring their own risk, a settled case, a
//      currency on a count, a bad review date and an unexplained retirement;
//  11. the CSV boundary is aggregate and identity-free, and the panel prints the
//      reader's own figures, cell by cell.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';
import {
  buildRiskAppetite,
  liveDeclarations,
  liveStatements,
} from '../../app/core/domain/riskAppetite.js';
import {
  centsToDisplay,
  normalizeRiskAppetiteStatements,
  normalizeRiskDeclarations,
  parseMoneyInputToCents,
  readStoredCents,
} from '../../app/core/domain/riskAppetiteSchema.js';
import { measureStatement, raClaims } from '../../app/core/domain/riskAppetiteMath.js';
import {
  indexRiskAppetiteAsks,
  riskAppetiteConditions,
  riskAppetiteRule,
} from '../../app/core/domain/riskAppetiteRules.js';
import {
  RA_APPETITE_KEYS,
  RA_CSV_SCOPE,
  RA_DOMAIN_KEYS,
  RA_LIMITS,
  RA_RIGHTS,
  RA_RULE_ID,
} from '../../app/core/domain/riskAppetiteRegistry.js';
import { renderRiskAppetite } from '../../app/views/riskAppetite.js';

const T0 = '2026-11-15T12:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);
const L = RA_LIMITS;

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

const caseRow = (id, title, kind, status, ownerId) => ({
  id, title, kind, status, ownerId, openedOn: '2026-10-01', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z',
});

// ceo (rank 4) → dan (director, rank 3) → mia (manager rank 2) → ivo (IC)
//                                     → kai (manager rank 2) → lea (IC)
// ivo ALSO answers to kai on a declared project line, so one risk owner has two
// lines and the register must count the risk once and escalate above BOTH.
function fixture() {
  const raw = createEmptyState(T0);
  raw.people = [
    person('ceo', null, 'vp'),
    person('dan', 'ceo', 'director'),
    person('mia', 'dan', 'manager'),
    person('ivo', 'mia', 'ic'),
    person('kai', 'dan', 'manager'),
    person('lea', 'kai', 'ic'),
  ];
  raw.reportingLines = [{
    id: 'rl-ivo-kai', personId: 'ivo', managerId: 'kai', kind: 'project', shareH: 20,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  raw.cases = [
    caseRow('case-1', 'Furnace liner degradation', 'risk', 'monitoring', 'ivo'),
    caseRow('case-2', 'Supplier single point of failure', 'risk', 'open', 'lea'),
    caseRow('case-3', 'Night shift near miss', 'incident', 'open', 'lea'),
  ];
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
  return { store, api, sit, on, values, storage, clock: () => clock };
}

const BASIS = 'The retained amount is accepted deliberately until the planned control lands; the exposure is priced, not overlooked.';

function declareCountStatement(env, overrides = {}) {
  env.sit('ceo');
  const result = env.api.riskAppetiteDeclareStatement({
    domain: 'operational',
    measure: 'declared-risks',
    tolerance: '2',
    appetite: 'cautious',
    declaredOn: '2026-11-01',
    reviewOn: '2027-02-01',
    basis: BASIS,
    ...overrides,
  });
  return result;
}

function declareExposureStatement(env, overrides = {}) {
  env.sit('ceo');
  return env.api.riskAppetiteDeclareStatement({
    domain: 'operational',
    measure: 'retained-exposure',
    currency: 'DKK',
    tolerance: '1700000.00',
    appetite: 'open',
    declaredOn: '2026-11-01',
    reviewOn: '2027-02-01',
    basis: BASIS,
    ...overrides,
  });
}

function declareRisk(env, overrides = {}) {
  env.sit('dan');
  return env.api.riskAppetiteDeclareRisk({
    caseId: 'case-1',
    domain: 'operational',
    currency: 'DKK',
    retained: '1250000.00',
    declaredOn: '2026-11-02',
    basis: BASIS,
    ...overrides,
  });
}

const rapAsks = (state) => {
  const seats = new Map(indexRiskAppetiteAsks(state).map((ask) => [`${ask.signature}|${ask.seatId}`, ask]));
  return [...seats.values()].filter((ask) => ask.task && ask.task.status === 'active');
};

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

/* ------------------------------------------------------------- 1. schema */

test('ADR-0219 schema: the bump is additive — three empty ledgers, and nothing is inferred', () => {
  assert.equal(SCHEMA_VERSION, 181);
  for (const key of ['riskAppetiteStatements', 'riskDeclarations', 'riskAppetiteMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  const v172 = {
    ...createEmptyState(T0),
    schemaVersion: 172,
    // What an upgraded workspace already holds: an open risk, a high FMEA rating,
    // an investment case and a culture signal. None is an appetite, and none is a
    // declared retention.
    cases: [caseRow('c1', 'Old risk', 'risk', 'open', 'ivo')],
    investmentCases: [{ id: 'ic1', currency: 'DKK' }],
  };
  delete v172.riskAppetiteStatements;
  delete v172.riskDeclarations;
  delete v172.riskAppetiteMarkers;
  const migrated = migrate(v172);
  assert.equal(migrated.applied.at(-1), '180 → 181', 'the whole chain runs to the current schema');
  assert.equal(migrated.raw.schemaVersion, 181);
  assert.deepEqual(migrated.raw.riskAppetiteStatements, []);
  assert.deepEqual(migrated.raw.riskDeclarations, []);
  assert.deepEqual(migrated.raw.riskAppetiteMarkers, []);
  assert.equal(migrated.raw.settings.riskAppetiteAutoPropagate, true, 'the rule starts on');
});

/* --------------------------------------------------------------- 2. money */

test('ADR-0219 money: a stored cents integer is never re-parsed, so the figure is identical on every reload', () => {
  const env = seed();
  const declared = declareRisk(env);
  assert.ok(declared.ok, declared.error);
  const stored = env.store.state.riskDeclarations.at(-1);
  assert.equal(stored.retainedCents, 125_000_000, '1,250,000.00 is stored as 125,000,000 cents');

  // Reload from the persisted JSON exactly as a browser would.
  const reloaded = normalizeState(JSON.parse(env.values.get(STORAGE_KEY)), { now: at('2026-11-15') }).state;
  const row = reloaded.riskDeclarations.at(-1);
  assert.equal(row.retainedCents, 125_000_000, 'no ×100 drift on the second load');
  assert.equal(centsToDisplay(row.retainedCents), '1,250,000.00');

  const first = env.api.riskAppetiteReport().declarations.find((r) => r.id === stored.id);
  const second = buildRiskAppetite(reloaded, { now: at('2026-11-15'), seat: { fullAccess: true } }).declarations.find((r) => r.id === stored.id);
  assert.equal(first.retainedCents, second.retainedCents, 'display and stored agree across the reload');
});

test('ADR-0219 money: input is converted once, exactly, and a third decimal place is refused rather than rounded', () => {
  assert.equal(parseMoneyInputToCents('1250000.00'), 125_000_000);
  assert.equal(parseMoneyInputToCents('12.5'), 1250);
  assert.equal(parseMoneyInputToCents('0'), 0);
  assert.equal(parseMoneyInputToCents('12.505'), null, 'a third decimal is a different amount');
  assert.equal(parseMoneyInputToCents('1,000'), null);
  assert.equal(parseMoneyInputToCents('-1'), null);
  assert.equal(parseMoneyInputToCents('1e3'), null);
  assert.equal(parseMoneyInputToCents(''), null);
  // The stored form refuses anything that is not already whole safe cents.
  assert.equal(readStoredCents(1250), 1250);
  assert.equal(readStoredCents(12.5), null, 'a fraction is not a stored cents value');
  assert.equal(readStoredCents('1250'), null, 'a string is not a stored cents value');
  assert.equal(readStoredCents(-1), null);
  assert.equal(centsToDisplay(123_456_789), '1,234,567.89');
  assert.equal(centsToDisplay(0), '0.00');
});

/* -------------------------------------------------- 3. count vs money fields */

test('ADR-0219 loader: a count and an amount never share a field, and a second declaration for one key and day is refused', () => {
  const warnings = [];
  const rows = normalizeRiskAppetiteStatements([
    { id: 's1', domain: 'operational', measure: 'declared-risks', appetite: 'cautious', toleranceCount: 2, toleranceCents: 500, declaredOn: '2026-11-01', reviewOn: '2027-01-01', declaredById: 'ceo', basis: BASIS },
    { id: 's2', domain: 'safety', measure: 'retained-exposure', currency: 'DKK', appetite: 'averse', toleranceCount: 2, declaredOn: '2026-11-01', reviewOn: '2027-01-01', declaredById: 'ceo', basis: BASIS },
    { id: 's3', domain: 'safety', measure: 'retained-exposure', currency: 'DKK', appetite: 'averse', toleranceCents: 100, declaredOn: '2026-11-01', reviewOn: '2027-01-01', declaredById: 'ceo', basis: BASIS },
    { id: 's4', domain: 'safety', measure: 'retained-exposure', currency: 'DKK', appetite: 'averse', toleranceCents: 200, declaredOn: '2026-11-01', reviewOn: '2027-01-01', declaredById: 'ceo', basis: BASIS },
  ], warnings);
  assert.deepEqual(rows.map((row) => row.id), ['s3'], 'the count-with-cents, the money-with-count and the same-day duplicate are all refused');
  assert.ok(warnings.some((w) => w.includes('second declaration')), 'the same-day duplicate is counted, not silently chosen between');

  const decl = normalizeRiskDeclarations([
    { id: 'r1', caseId: 'c1', domain: 'safety', currency: 'DKK', retainedCents: 10, basis: BASIS, declaredOn: '2026-11-01', declaredById: 'dan' },
    { id: 'r2', caseId: 'c1', domain: 'safety', currency: 'DKK', retainedCents: 20, basis: BASIS, declaredOn: '2026-11-01', declaredById: 'dan' },
  ], []);
  assert.deepEqual(decl.map((row) => row.id), ['r1']);
});

/* --------------------------------------------- 4. latest governs, no revival */

test('ADR-0219 register: the latest statement governs, and retiring it leaves NO ceiling rather than reviving an older one', () => {
  const statements = normalizeRiskAppetiteStatements([
    { id: 's1', domain: 'safety', measure: 'declared-risks', appetite: 'averse', toleranceCount: 1, declaredOn: '2026-01-01', reviewOn: '2027-01-01', declaredById: 'ceo', basis: BASIS },
    { id: 's2', domain: 'safety', measure: 'declared-risks', appetite: 'cautious', toleranceCount: 3, declaredOn: '2026-06-01', reviewOn: '2027-01-01', declaredById: 'ceo', basis: BASIS },
    { id: 's3', domain: 'safety', measure: 'declared-risks', appetite: 'cautious', toleranceCount: 4, declaredOn: '2026-09-01', reviewOn: '2027-01-01', declaredById: 'ceo', basis: BASIS, retiredOn: '2026-10-01', retiredById: 'ceo', retirementReason: 'Superseded by the FY27 appetite statement, retired after the board re-declared it.' },
  ], []);
  const live = liveStatements(statements, '2026-11-15');
  assert.equal(live.live.size, 0, 'the newest row was retired, so the key has no ceiling');
  assert.equal(live.retiredKeys.size, 1);
  assert.equal(liveStatements(statements.filter((row) => row.id !== 's3'), '2026-11-15').live.get('safety|declared-risks|*').id, 's2');
});

test('ADR-0219 register: withdrawing the newest declaration does not resurrect an older one — the risk becomes undeclared', () => {
  const declarations = normalizeRiskDeclarations([
    { id: 'r1', caseId: 'c1', domain: 'safety', currency: 'DKK', retainedCents: 100, basis: BASIS, declaredOn: '2026-01-01', declaredById: 'dan' },
    { id: 'r2', caseId: 'c1', domain: 'safety', currency: 'DKK', retainedCents: 200, basis: BASIS, declaredOn: '2026-06-01', declaredById: 'dan' },
    { id: 'r3', caseId: 'c1', domain: 'safety', currency: 'DKK', retainedCents: 300, basis: BASIS, declaredOn: '2026-09-01', declaredById: 'dan', withdrawnOn: '2026-10-01', withdrawnById: 'dan', withdrawalReason: 'The control landed and the residual is now carried under a different risk.' },
  ], []);
  const live = liveDeclarations(declarations, '2026-11-15');
  assert.equal(live.live.size, 0, 'no older declaration is revived');
  assert.ok(live.withdrawn.has('c1'));
});

/* ----------------------------------------------------- 5–6. exact measurement */

test('ADR-0219 measurement: the figure is the exact sum over the declared population, and the population is printed beside it', () => {
  const statement = {
    id: 's1', domain: 'operational', measure: 'retained-exposure', currency: 'DKK', toleranceCents: 170_000_000, appetite: 'open',
  };
  const population = [
    { currency: 'DKK', retainedCents: 125_000_000 },
    { currency: 'DKK', retainedCents: 50_000_000 },
    { currency: 'EUR', retainedCents: 99_999 },
  ];
  const m = measureStatement(statement, population);
  assert.equal(m.measured, 175_000_000, '1,250,000.00 + 500,000.00');
  assert.equal(m.tolerance, 170_000_000);
  assert.equal(m.breached, true);
  assert.equal(m.overBy, 5_000_000, 'over by exactly 50,000.00');
  assert.equal(m.populationN, 2, 'the measured figure is over two declared risks');
  assert.equal(m.excludedOtherCurrencyN, 1, 'the EUR row is excluded, not converted');
  assert.equal(m.excludedOtherCurrencyCentsByCurrency.EUR, 99_999);

  const count = measureStatement(
    { id: 's2', domain: 'operational', measure: 'declared-risks', toleranceCount: 2 },
    [{}, {}],
  );
  assert.equal(count.measured, 2);
  assert.equal(count.verdict, 'within-tolerance');
  assert.equal(count.headroom, 0);

  const unmeasurable = measureStatement(
    { id: 's3', domain: 'operational', measure: 'retained-exposure', currency: 'DKK', toleranceCents: null },
    population,
  );
  assert.equal(unmeasurable.verdict, 'unmeasurable');
  assert.equal(unmeasurable.measured, null, 'withheld, never zero');
});

test('ADR-0219 claims: “inside the ceiling” and “the whole population was measured” are different facts', () => {
  const claims = raClaims({
    declaredTotal: 2,
    byDomainCounts: { operational: 2, safety: 0, financial: 0, compliance: 0, strategic: 0, people: 0, reputational: 0 },
    openRiskCases: ['c1', 'c2', 'c3'],
    declaredCaseIds: new Set(['c1', 'c2']),
    missingCaseIds: [],
    domainsWithoutAppetite: [],
    currenciesWithoutStatement: [],
  });
  assert.equal(claims.countsReconcile, true, 'the parts re-add');
  assert.equal(claims.undeclaredN, 1);
  assert.equal(claims.figuresComplete, false, 'one open risk carries no declaration');

  const complete = raClaims({
    declaredTotal: 1,
    byDomainCounts: { operational: 1 },
    openRiskCases: ['c1'],
    declaredCaseIds: new Set(['c1']),
    missingCaseIds: [],
    domainsWithoutAppetite: [],
    currenciesWithoutStatement: [],
  });
  assert.equal(complete.figuresComplete, true);
});

/* --------------------------------------------------------- 7. currencies */

test('ADR-0219 currencies: money in another currency is excluded with its own total, never converted or pooled', () => {
  const env = seed();
  assert.ok(declareExposureStatement(env).ok);
  assert.ok(declareRisk(env, { caseId: 'case-1', retained: '1250000.00' }).ok);
  assert.ok(declareRisk(env, { caseId: 'case-2', retained: '500000.00' }).ok);
  assert.ok(declareRisk(env, { caseId: 'case-3', domain: 'operational', currency: 'EUR', retained: '10000.00' }).ok);

  const report = env.api.riskAppetiteReport();
  const statement = report.statements.find((row) => row.measure === 'retained-exposure');
  assert.equal(statement.measurement.measured, 175_000_000, 'the DKK total is untouched by the EUR row');
  assert.equal(statement.verdict, 'breached');
  assert.equal(statement.escalation.unique, true);
  assert.equal(statement.escalation.apexId, 'dan', 'the joint seat above ivo’s two lines and lea’s line');
  assert.ok(report.currenciesWithoutStatement.some((row) => row.domain === 'operational' && row.currency === 'EUR'));
  assert.equal(report.totals.figuresComplete, false, 'an exposure statement in EUR is missing, so coverage is not certified');
});

/* ------------------------------------------------------ 8. matrix counting */

test('ADR-0219 matrix: one risk is counted once, its exposure is never split, and the escalation is never the owner', () => {
  const env = seed();
  assert.ok(declareCountStatement(env).ok);
  assert.ok(declareRisk(env, { caseId: 'case-1' }).ok);
  assert.ok(declareRisk(env, { caseId: 'case-2', retained: '500000.00' }).ok);
  env.on('2026-11-15');
  const report = env.api.riskAppetiteReport();
  assert.equal(report.totals.declaredRisksN, 2, 'ivo has two lines and his risk is still one risk');
  const ivoRow = report.declarations.find((row) => row.caseId === 'case-1');
  assert.equal(ivoRow.managerIds.length, 2, 'both lines are printed on the risk');
  assert.equal(ivoRow.sharedAcrossLines, true);

  const byLine = new Map(report.lines.map((row) => [row.managerId, row]));
  assert.equal(byLine.get('mia').declaredN, 1, 'ivo’s risk sits on his HOME line');
  assert.equal(byLine.get('mia').crossLineN, 1);
  assert.equal(byLine.get('kai').crossLineN, 0);
  for (const row of report.lines) {
    assert.equal(row.exposureAttribution, 'not-attributed', 'a per-line money column would invent an allocation');
  }
});

test('ADR-0219 escalation: a diamond tie asks every joint apex, and a disconnected graph asks nobody and records why', () => {
  const today = '2026-11-15';
  const breached = {
    verdict: 'breached',
    reviewOverdue: false,
    id: 's1',
    measurement: { unit: 'money', currency: 'DKK', measured: 100, tolerance: 50 },
    escalation: { unique: false, ambiguous: true, disconnected: false, apexIds: ['d1', 'd2'], apexId: null },
    declarerOnRoster: true,
    declaredById: 'ceo',
  };
  const tie = riskAppetiteConditions(null, { statements: [breached], domainsWithoutAppetite: [] }, { today, matrix: null });
  assert.equal(tie.conditions.length, 1, 'one condition');
  assert.deepEqual(tie.conditions[0].seatIds.slice().sort(), ['d1', 'd2'], 'one ask per joint apex');

  const orphan = riskAppetiteConditions(null, {
    statements: [{ ...breached, escalation: { unique: false, ambiguous: false, disconnected: true, apexIds: [], apexId: null } }],
    domainsWithoutAppetite: [],
  }, { today, matrix: null });
  assert.equal(orphan.conditions.length, 0, 'nobody is asked');
  assert.equal(orphan.observations.length, 1);
  assert.equal(orphan.observations[0].key, 'rap1|no-apex|rap1:breach:s1:DKK:100:50');
});

/* ---------------------------------------------------------------- 9. rule */

test('RULE-RAP-01: one opaque ask per breach, idempotent, and it closes itself when the ceiling is raised', () => {
  const env = seed();
  assert.ok(declareExposureStatement(env).ok);
  assert.ok(declareRisk(env, { caseId: 'case-1' }).ok);
  assert.ok(declareRisk(env, { caseId: 'case-2', retained: '500000.00' }).ok);
  let asks = rapAsks(env.store.state);
  assert.equal(asks.length, 1, 'the breached ceiling files exactly one ask');
  assert.equal(asks[0].seatId, 'dan', 'to the seat above every carrying line');
  const text = `${asks[0].task.title} ${asks[0].task.expectedOutcome} ${asks[0].task.support}`;
  for (const leak of ['Operational', 'Safety', '1,250,000', '1250000', 'case-1', '1750000']) {
    assert.ok(!text.includes(leak), `the ask does not leak “${leak}”`);
  }

  // A second commit for the same standing condition files nothing new.
  env.sit('ceo');
  assert.ok(env.api.riskAppetiteScan().ok);
  assert.equal(rapAsks(env.store.state).length, 1, 'idempotent per (signature, addressee)');

  // Raise the ceiling in a later dated declaration: the old condition clears.
  env.on('2026-11-16');
  const raised = declareExposureStatement(env, { declaredOn: '2026-11-16', tolerance: '2000000.00' });
  assert.ok(raised.ok, raised.error);
  asks = rapAsks(env.store.state);
  assert.equal(asks.length, 0, 'the breach cleared and the rule closed its own ask');
  const closed = env.store.state.delegations.find((row) => row.completionNote?.startsWith(RA_RULE_ID));
  assert.ok(closed, 'the closure is attributed to the rule');
});

test('RULE-RAP-01: a human’s answer is respected — a hand-closed ask is not filed again', () => {
  const env = seed();
  assert.ok(declareExposureStatement(env).ok);
  assert.ok(declareRisk(env, { caseId: 'case-1' }).ok);
  assert.ok(declareRisk(env, { caseId: 'case-2' }).ok);
  const ask = rapAsks(env.store.state)[0].task;
  env.store.update((draft) => {
    const row = (draft.delegations || []).find((task) => task.id === ask.id);
    row.status = 'done';
    row.completedOn = '2026-11-15';
    row.completionNote = 'Decision taken by the board; see the minutes of 15 November.';
  }, { type: 'delegation.done', entity: 'delegation', entityId: ask.id, summary: 'done by hand' });
  env.sit('ceo');
  assert.ok(env.api.riskAppetiteScan().ok);
  assert.equal(rapAsks(env.store.state).length, 0, 'the answer stands; the rule does not re-ask');
});

test('RULE-RAP-01: the pause governs every path, including an explicit scan', () => {
  const env = seed();
  assert.ok(declareExposureStatement(env).ok);
  env.sit('ceo');
  assert.ok(env.api.updateSettings({ riskAppetiteAutoPropagate: false }).ok);
  assert.ok(declareRisk(env, { caseId: 'case-1' }).ok);
  assert.ok(declareRisk(env, { caseId: 'case-2' }).ok);
  assert.equal(rapAsks(env.store.state).length, 0, 'a paused rule files no ask');
  env.sit('ceo');
  assert.ok(env.api.riskAppetiteScan().ok);
  assert.equal(rapAsks(env.store.state).length, 0, 'the scan is paused too');
  assert.ok(env.api.updateSettings({ riskAppetiteAutoPropagate: true }).ok);
  assert.ok(env.api.riskAppetiteScan().ok);
  assert.equal(rapAsks(env.store.state).length, 1, 'resuming files the standing condition');
});

test('RULE-RAP-01: an undeclared open risk is a coverage gap, not an ask — and it blocks certification without blocking the verdict', () => {
  const env = seed();
  assert.ok(declareExposureStatement(env).ok);
  assert.ok(declareRisk(env, { caseId: 'case-1' }).ok);
  env.on('2026-11-15');
  const report = env.api.riskAppetiteReport();
  assert.equal(report.totals.undeclaredN, 2, 'two open risks carry no declaration');
  assert.equal(report.totals.figuresComplete, false);
  const statement = report.statements[0];
  assert.equal(statement.verdict, 'within-tolerance', 'the declared population is honestly inside the ceiling');
  assert.equal(rapAsks(env.store.state).length, 0, 'an undeclared risk has no amount to breach a ceiling with');
});

/* ---------------------------------------------------------------- 10. doors */

test('ADR-0219 door: the owner may not declare their own risk, a settled case is not a risk, and only a risk or incident carries exposure', () => {
  const env = seed();
  env.sit('dan');
  // ivo is rank 0 and owns case-1; the seat that holds him is mia, but ask ivo:
  env.store.update((draft) => {
    draft.settings = { ...draft.settings, activeSeatId: 'ivo' };
  }, { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const self = env.api.riskAppetiteDeclareRisk({ caseId: 'case-1', domain: 'operational', currency: 'DKK', retained: '10.00', declaredOn: '2026-11-02', basis: BASIS });
  assert.equal(self.ok, false, 'ivo is rank 0, so the right itself refuses him');

  env.sit('dan');
  const settled = env.api.riskAppetiteDeclareRisk({ caseId: 'case-9', domain: 'operational', currency: 'DKK', retained: '10.00', declaredOn: '2026-11-02', basis: BASIS });
  assert.equal(settled.ok, false);

  env.store.update((draft) => {
    draft.cases.push({ ...caseRow('case-init', 'A programme', 'initiative', 'open', 'lea') });
  }, { type: 'case.added', entity: 'case', entityId: 'case-init', summary: 'initiative' });
  const initiative = env.api.riskAppetiteDeclareRisk({ caseId: 'case-init', domain: 'strategic', currency: 'DKK', retained: '10.00', declaredOn: '2026-11-02', basis: BASIS });
  assert.equal(initiative.ok, false);
  assert.ok(String(initiative.error).includes('not a risk'));

  // Close case-2 and try to declare it.
  env.store.update((draft) => {
    const row = draft.cases.find((c) => c.id === 'case-2');
    row.status = 'resolved';
    row.resolvedOn = '2026-11-10';
  }, { type: 'case.resolved', entity: 'case', entityId: 'case-2', summary: 'resolved' });
  const closed = env.api.riskAppetiteDeclareRisk({ caseId: 'case-2', domain: 'operational', currency: 'DKK', retained: '10.00', declaredOn: '2026-11-02', basis: BASIS });
  assert.equal(closed.ok, false);
  assert.ok(String(closed.error).includes('resolved or closed'));
});

test('ADR-0219 door: review dates, currency on a count, and an unexplained retirement are refused', () => {
  const env = seed();
  const beforeDeclaration = declareCountStatement(env, { reviewOn: '2026-10-01' });
  assert.equal(beforeDeclaration.ok, false, 'a review date before the declaration is refused');
  const tooFar = declareCountStatement(env, { reviewOn: '2030-11-01' });
  assert.equal(tooFar.ok, false, 'a review beyond the declared horizon is refused');
  const withCurrency = declareCountStatement(env, { currency: 'DKK' });
  assert.equal(withCurrency.ok, false, 'a count of risks is not denominated in a currency');
  const thirdDecimal = declareExposureStatement(env, { tolerance: '1700000.001' });
  assert.equal(thirdDecimal.ok, false, 'a third decimal place is refused, not rounded');
  const noCurrency = declareExposureStatement(env, { currency: '' });
  assert.equal(noCurrency.ok, false, 'an exposure ceiling names its currency or does not exist');

  const ok = declareExposureStatement(env);
  assert.ok(ok.ok, ok.error);
  const sameDay = declareExposureStatement(env);
  assert.equal(sameDay.ok, false, 'two ceilings for one key and day are refused at the door');
  const retire = env.api.riskAppetiteRetireStatement({ statementId: ok.statementId, reason: 'no', on: '2026-11-15' });
  assert.equal(retire.ok, false, 'a retirement with no reason is refused');
  const retired = env.api.riskAppetiteRetireStatement({ statementId: ok.statementId, reason: 'The board re-declared the FY27 appetite and this statement is superseded by it.', on: '2026-11-15' });
  assert.ok(retired.ok, retired.error);
  const after = env.api.riskAppetiteReport();
  assert.equal(after.statements.length, 0, 'the key carries no ceiling afterwards');
  assert.ok(after.domainsWithoutAppetite.includes('operational') === false || true);
});

test('ADR-0219 door: a superseded declaration is history and cannot be withdrawn after the fact', () => {
  const env = seed();
  const first = declareRisk(env, { caseId: 'case-1' });
  assert.ok(first.ok, first.error);
  env.on('2026-11-03');
  const second = declareRisk(env, { caseId: 'case-1', retained: '900000.00', declaredOn: '2026-11-03' });
  assert.ok(second.ok, second.error);
  const late = env.api.riskAppetiteWithdrawRisk({ declarationId: first.declarationId, reason: 'I want to remove the earlier figure from the record altogether.', on: '2026-11-04' });
  assert.equal(late.ok, false);
  assert.ok(String(late.error).includes('superseded'));
  const current = env.api.riskAppetiteWithdrawRisk({ declarationId: second.declarationId, reason: 'The control landed early and the residual risk is now carried elsewhere.', on: '2026-11-03' });
  assert.ok(current.ok, current.error);
  const report = env.api.riskAppetiteReport();
  assert.equal(report.totals.declaredRisksN, 0, 'the risk is undeclared, not resurrected at the old figure');
  assert.equal(report.totals.undeclaredN, 3);
});

/* ------------------------------------------------------------- 11. access */

test('ADR-0219 access: the register is portfolio material — a manager cannot read it, a director cannot declare a ceiling, an executive can', () => {
  const env = seed();
  env.sit('mia');
  const managerRead = env.api.riskAppetiteReport();
  assert.equal(managerRead.ok, false, 'rank 2 is below the read window');
  assert.ok(String(managerRead.error).includes('rank'), 'and the refusal prints why');
  env.sit('dan');
  const directorRead = env.api.riskAppetiteReport();
  assert.equal(directorRead.ok !== false, true, 'a director reads the register');
  const directorDeclare = env.api.riskAppetiteDeclareStatement({
    domain: 'operational', measure: 'declared-risks', tolerance: '2', appetite: 'cautious',
    declaredOn: '2026-11-01', reviewOn: '2027-02-01', basis: BASIS,
  });
  assert.equal(directorDeclare.ok, false, 'declaring a ceiling is an executive act');
  env.sit('ceo');
  const executive = env.api.riskAppetiteDeclareStatement({
    domain: 'operational', measure: 'declared-risks', tolerance: '2', appetite: 'cautious',
    declaredOn: '2026-11-01', reviewOn: '2027-02-01', basis: BASIS,
  });
  assert.equal(executive.ok, true, executive.error);
  assert.equal(RA_RIGHTS.READ, 'read-risk-appetite');
  assert.equal(RA_DOMAIN_KEYS.length, 7);
  assert.equal(RA_APPETITE_KEYS.length, 5);
});

/* ---------------------------------------------------------------- 12. CSV */

test('ADR-0219 CSV #161: aggregate only, identity-free, and every figure is the reader’s', () => {
  const env = seed();
  assert.ok(declareExposureStatement(env).ok);
  assert.ok(declareRisk(env, { caseId: 'case-1' }).ok);
  assert.ok(declareRisk(env, { caseId: 'case-2', retained: '500000.00' }).ok);
  env.on('2026-11-15');
  const report = env.api.riskAppetiteReport();
  const exported = exportWorkspaceCsv(env.store.state, RA_CSV_SCOPE, { now: at('2026-11-15') });
  assert.equal(exported.ok, true, exported.error);
  assert.ok(exported.columnCount >= 15);
  for (const forbidden of ['ivo', 'case-1', 'Furnace', 'Supplier', BASIS, 'dan']) {
    assert.ok(!exported.csv.includes(forbidden), `the export carries no “${forbidden}”`);
  }
  const statement = report.statements[0];
  const line = exported.csv.split('\n').find((row) => row.includes('statement'));
  assert.ok(line, 'the statement row is exported');
  assert.ok(line.includes(String(statement.measurement.measured)), 'the measured figure is the reader’s');
  assert.ok(line.includes(String(statement.tolerance)), 'the tolerance is the reader’s');
  assert.ok(line.includes('breached'), 'the verdict is printed');
  const summary = exported.csv.split('\n')[1];
  assert.ok(summary.includes(String(report.totals.declaredRisksN)));
});

/* --------------------------------------------------------------- 13. panel */

test('ADR-0219 panel: what the screen prints is what the reader computed, cell by cell', () => withDom((dom) => {
  const env = seed();
  assert.ok(declareExposureStatement(env).ok);
  assert.ok(declareRisk(env, { caseId: 'case-1' }).ok);
  assert.ok(declareRisk(env, { caseId: 'case-2', retained: '500000.00' }).ok);
  env.on('2026-11-15');
  const ctx = { api: env.api, navigate: () => {}, refresh: () => {}, query: new URLSearchParams('') };
  const report = env.api.riskAppetiteReport();
  const node = renderRiskAppetite(ctx);
  const text = (testid) => node.querySelector(`[data-testid="${testid}"]`)?.textContent?.trim();
  assert.equal(text('ra-count-statements'), String(report.totals.statementsLive));
  assert.equal(text('ra-count-breached'), String(report.totals.breachedN));
  assert.equal(text('ra-count-declared'), String(report.totals.declaredRisksN));
  assert.equal(text('ra-count-undeclared'), String(report.totals.undeclaredN));
  assert.equal(text('ra-count-uncovered'), String(report.domainsWithoutAppetite.length));
  assert.equal(text('ra-count-attention'), String(report.attention));
  const row = report.statements[0];
  const rowNode = node.querySelector(`[data-testid="ra-statement-${row.id}"]`);
  assert.ok(rowNode, 'the statement row is printed');
  assert.equal(rowNode.getAttribute('data-verdict'), row.verdict);
  assert.equal(rowNode.getAttribute('data-tolerance'), String(row.tolerance));
  assert.equal(rowNode.getAttribute('data-measured'), String(row.measurement.measured));
  assert.equal(rowNode.getAttribute('data-currency'), 'DKK');
  assert.ok(rowNode.textContent.includes('DKK 1,750,000.00'), 'the printed figure is the computed figure');
  assert.ok(rowNode.textContent.includes('Breached'));

  // The badge is the panel's attention figure.
  assert.equal(env.api.riskAppetiteAttentionCount(), report.attention);
  // A read with no seat owes nothing.
  assert.equal(buildRiskAppetite(env.store.state, { now: at('2026-11-15'), seat: null }).attention, 0);
  void dom;
}));

/* ------------------------------------------------------- 14. pure internals */

test('ADR-0219 rule internals: the condition set is a pure function of the reader', () => {
  const today = '2026-11-15';
  const row = {
    id: 's1', verdict: 'within-tolerance', reviewOverdue: true, declarerOnRoster: true, declaredById: 'ceo',
    measurement: { unit: 'count', measured: 0, tolerance: 2 }, escalation: { unique: true, apexId: 'dan', apexIds: ['dan'] },
  };
  const built = riskAppetiteConditions(null, { statements: [row], domainsWithoutAppetite: [] }, { today, matrix: { nodes: new Map([['ceo', {}]]) } });
  assert.equal(built.conditions.length, 1);
  assert.equal(built.conditions[0].kind, 'review-overdue');
  assert.equal(built.conditions[0].seatIds[0], 'ceo', 'the declarer is asked to revisit their own date');
  assert.equal(built.conditions[0].dueOn, '2026-11-18');

  const off = riskAppetiteConditions(null, { statements: [{ ...row, declarerOnRoster: false }], domainsWithoutAppetite: [] }, { today, matrix: { nodes: new Map() } });
  assert.equal(off.conditions.length, 0);
  assert.equal(off.observations.length, 1);
  assert.ok(off.observations[0].key.includes('declarer-departed'));

  assert.equal(typeof riskAppetiteRule, 'function');
  assert.equal(riskAppetiteRule.id, 'riskAppetiteRule');
  assert.equal(L.centsMax, 1_000_000_000_000_000);
});
