// ADR-0250 — Provision & Reimbursement Register (Schema v204).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — five empty ledgers and two declared
//      conventions, and no assessment, provision, reimbursement asset or
//      reconciliation inferred from a claim matter, a reserve, an insurance
//      recovery or a finance figure on the record;
//   2. the loaders are FAIL-CLOSED — an assessment with no classification, no
//      best-estimate method, no currency, no written basis, no responsible hand
//      or no assessment day, a most-likely assessment with no amount, a second
//      assessment for one matter, an orphan assessment, a scenario with a
//      probability outside 0..10,000 or a fractional amount, a second
//      recognition for one matter and a second carrying for one currency are all
//      DROPPED with counted warnings and never repaired;
//   3. the arithmetic is EXACT — an expected value is refused when the
//      probabilities do not sum to exactly 10,000 basis points or the weighted
//      sum is not a whole minor unit, an asset is capped at the provision with
//      the excess printed, and the reconciliation gap is `carried − provision`;
//   4. the PROVISION IS DERIVED, never stored — it is the product of a declared
//      classification and a declared best estimate, recomputed on every read;
//   5. all SIX STATES are six different facts — a matter with no assessment is
//      `unassessed` and NEVER a zero, a possible or unestimable obligation is
//      `disclosed-only`, and a remote obligation carries neither;
//   6. the REIMBURSEMENT ASSET is recognized only when it is virtually certain
//      (cash the insurer paid, or a declared written judgment on a claimed
//      amount), is capped at the provision, and the excess is printed as a
//      figure rather than recognized as an asset;
//   7. the NET EXPOSURE is printed APART from the provision and the asset, and
//      the RECONCILIATION against the declared finance carrying prints the
//      exact gap rather than adopting either number;
//   8. the MATRIX is correct — every active line holding every responsible hand
//      is resolved, a person is counted once, the joint apex is over ALL of
//      them, and a hand off the graph is printed as an orphan, never dropped;
//   9. RULE-PROV-01 is idempotent, capped, self-closing, pause-governed on every
//      path, OPAQUE in its ask text (a provision schedule is as sensitive as the
//      claim export) and observes identity-free where nobody can be asked;
//  10. the DOOR refuses a duplicate assessment, a holder outside the seat, a
//      classification this register does not carry, a fractional amount, a
//      missing basis, a future day and an unknown convention;
//  11. the CSV boundary is aggregate, identity-free and floored, and its summary
//      equals the reader's own totals;
//  12. the panel prints the reader's own figures cell by cell (display ==
//      computed), on an empty workspace and on the demo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { buildProvisions, derivePrvProvision, provisionSignals, provisionAttentionCount } from '../../app/core/domain/prvProvision.js';
import {
  normalizePrvAssessments,
  normalizePrvCarryings,
  normalizePrvReimbursements,
  normalizePrvScenarios,
  normalizePrvSettings,
} from '../../app/core/domain/prvSchema.js';
import {
  capAssetMinor,
  expectedValueMinor,
  minorUnits,
  reconciliation,
  sumMinor,
  utcDayMs,
} from '../../app/core/domain/prvMath.js';
import {
  provisionConditions,
  provisionRule,
  indexProvisionAsks,
  prvAskSignature,
  PROV_PAUSE_SWITCH,
} from '../../app/core/domain/prvRules.js';
import {
  PROV_CSV_COLUMNS,
  PROV_CSV_SCOPE,
  PROV_CLASSIFICATION_KEYS,
  PROV_ESTIMATE_METHOD_KEYS,
  PROV_SETTING_KEYS,
  PROV_STATE_KEYS,
} from '../../app/core/domain/prvRegistry.js';
import { provisionCsvRows } from '../../app/core/domain/prvReport.js';
import { renderProvisions } from '../../app/views/provisions.js';

const NOW = new Date('2026-11-17T09:00:00.000Z');
const T0 = NOW.toISOString();
const iso = (value) => new Date(value).toISOString();
const day = (offset) => new Date(NOW.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

/* ---------------------------------------------------------------- fixtures */

function person(id, name, level, managerId) {
  return { id, name, role: level, level, managerId, status: 'active', startDate: iso('2024-01-01T00:00:00.000Z'), createdAt: iso('2024-01-01T00:00:00.000Z'), updatedAt: iso('2024-01-01T00:00:00.000Z') };
}

function line(id, personId, managerId, kind = 'function') {
  return { id, personId, managerId, kind, shareH: null, rights: [], fromISO: iso('2024-01-01T00:00:00.000Z'), toISO: null, declaredAt: iso('2024-01-01T00:00:00.000Z'), note: '', status: 'active', history: [] };
}

function fixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('ceo', 'Cleo Executive', 'vp', null),
    person('dana', 'Dana Function', 'director', 'ceo'),
    person('omar', 'Omar Project', 'director', 'ceo'),
    person('mei', 'Mei Manager', 'manager', 'dana'),
    person('priya', 'Priya Manager', 'manager', 'omar'),
    person('samuel', 'Samuel Holder', 'ic', 'mei'),
    person('frieda', 'Frieda Holder', 'ic', 'priya'),
  ];
  raw.reportingLines = [
    line('rl-mei-dana', 'mei', 'dana'),
    line('rl-priya-omar', 'priya', 'omar'),
    line('rl-samuel-mei', 'samuel', 'mei'),
    line('rl-frieda-priya', 'frieda', 'priya'),
  ];
  Object.assign(raw, overrides);
  return raw;
}

const matter = (overrides = {}) => ({
  id: 'm-one',
  matterRef: 'CLM-2026-0001 — letter before action, reference on the letter',
  partyRef: 'Northgate Supplies Ltd',
  claimType: 'breach-of-contract',
  forumRef: 'Commercial Court',
  currency: 'GBP',
  claimedMinor: 5000000,
  responsibleIds: ['samuel'],
  openedById: 'mei',
  openedAt: iso('2026-06-01T09:00:00.000Z'),
  mergedIntoId: null,
  createdAt: iso('2026-06-01T09:00:00.000Z'),
  updatedAt: iso('2026-06-01T09:00:00.000Z'),
  ...overrides,
});

const accrual = (overrides = {}) => ({
  id: 'a-one',
  matterId: 'm-one',
  accrualDay: '2026-05-01',
  accrualRule: 'The breach accrued on the day the final delivery under clause 9.2 was not made.',
  knowledgeDay: null,
  periodMonths: 12,
  declaredById: 'mei',
  createdAt: iso('2026-05-02T09:00:00.000Z'),
  ...overrides,
});

const assessment = (overrides = {}) => ({
  id: 'prv-ass-one',
  matterId: 'm-one',
  classification: 'probable',
  estimateMethod: 'most-likely',
  mostLikelyMinor: 4000000,
  currency: 'GBP',
  basisRef: 'Present obligation from the pleaded breach; the outflow is more likely than not and the amount is reliably estimable at the most likely settlement.',
  responsibleIds: ['samuel'],
  assessedById: 'mei',
  assessedAt: iso('2026-06-01T09:00:00.000Z'),
  assessedDay: '2026-06-01',
  createdAt: iso('2026-06-01T09:00:00.000Z'),
  updatedAt: iso('2026-06-01T09:00:00.000Z'),
  ...overrides,
});

const scenario = (overrides = {}) => ({
  id: 'prv-scn-one',
  matterId: 'm-one',
  outcome: 'Settlement at the pleaded sum after disclosure',
  probabilityBps: 10000,
  amountMinor: 4000000,
  currency: 'GBP',
  basisRef: 'The single dominant outcome on the pleaded loss and the comparator evidence.',
  declaredById: 'mei',
  declaredAt: iso('2026-06-02T09:00:00.000Z'),
  declaredDay: '2026-06-02',
  createdAt: iso('2026-06-02T09:00:00.000Z'),
  ...overrides,
});

const reimbursement = (overrides = {}) => ({
  id: 'prv-rec-one',
  matterId: 'm-one',
  virtuallyCertain: true,
  basisRef: 'The insurer’s coverage opinion admits the wording and the indemnity claim is quantified against the pleaded sum.',
  declaredById: 'mei',
  declaredAt: iso('2026-06-03T09:00:00.000Z'),
  declaredDay: '2026-06-03',
  createdAt: iso('2026-06-03T09:00:00.000Z'),
  ...overrides,
});

const carrying = (overrides = {}) => ({
  id: 'prv-car-one',
  currency: 'GBP',
  carriedMinor: 4000000,
  carriedRef: 'GL-2400-118 — general ledger provision account, quarter-close pack section 4.2',
  declaredById: 'mei',
  declaredAt: iso('2026-06-04T09:00:00.000Z'),
  declaredDay: '2026-06-04',
  createdAt: iso('2026-06-04T09:00:00.000Z'),
  ...overrides,
});

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildProvisions(load(raw), { now: NOW, seat: null, ...opts });

function harness(raw) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(load(raw))]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-t-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  return { store, storage, api };
}

function asSeat(api, store, seatId) {
  store.update((draft) => { draft.settings.activeSeatId = seatId; }, { type: 'test.seat', entity: 'workspace', entityId: seatId, summary: 'test seat' });
  return api;
}

/* --------------------------------------------------------------- 1. schema */

test('schema v204 is additive: five empty ledgers, two conventions, nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 209, 'ADR-0257 (tax controversy) is the current head');
  const keys = ['prvAssessments', 'prvScenarios', 'prvReimbursements', 'prvCarryings', 'prvMarkers'];
  for (const key of keys) assert.ok(COLLECTIONS.includes(key), `${key} must be a declared collection`);
  const empty = createEmptyState(T0);
  for (const key of keys) assert.deepEqual(empty[key], [], `${key} must be empty on a fresh workspace`);
  assert.equal(empty.settings.provAutoPropagate, true);
  assert.equal(empty.settings.provPrivacyFloor, 3);
  assert.equal('prvWarningHorizonDays' in empty.settings, false, 'a provision carries no clock, so there is no warning horizon');
});

test('migrating a v203 workspace adds five empty ledgers and infers no assessment, provision or asset', () => {
  const base = createEmptyState(T0);
  base.schemaVersion = 203;
  base.lfgMatters = [matter()];
  base.lfgAccruals = [accrual()];
  for (const key of ['prvAssessments', 'prvScenarios', 'prvReimbursements', 'prvCarryings', 'prvMarkers']) delete base[key];
  const migrated = migrate(base).raw;
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(migrated.prvAssessments, [], 'a matter on the claim register is not a provision assessment');
  assert.deepEqual(migrated.prvScenarios, [], 'no scenario is inferred from anything on the record');
  assert.deepEqual(migrated.prvCarryings, [], 'no finance carrying is inferred from a reserve');
  assert.equal(migrated.settings.provAutoPropagate, true);
});

/* -------------------------------------------------------------- 2. loaders */

test('the assessment loader drops a row with no classification, method, currency, basis, hand, day or amount, and drops a duplicate per matter', () => {
  const warnings = [];
  const rows = normalizePrvAssessments([
    assessment({ id: 'ok' }),
    assessment({ id: 'no-class', classification: 'probably' }),
    assessment({ id: 'no-method', estimateMethod: 'gut' }),
    assessment({ id: 'no-cur', currency: 'POUNDS' }),
    assessment({ id: 'no-basis', basisRef: 'too short' }),
    assessment({ id: 'no-hands', responsibleIds: [] }),
    assessment({ id: 'partial-hands', responsibleIds: ['samuel', ''] }),
    assessment({ id: 'five-hands', responsibleIds: ['samuel', 'frieda', 'mei', 'priya', 'dana'] }),
    assessment({ id: 'no-day', assessedDay: 'not-a-day' }),
    assessment({ id: 'no-amount', mostLikelyMinor: null }),
    assessment({ id: 'frac-amount', mostLikelyMinor: 100.5 }),
    assessment({ id: 'dup-matter' }),
    assessment({ id: 'orphan-matter', matterId: 'not-a-matter' }),
  ], [matter()], warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok']);
  assert.equal(warnings.length, 2, 'one warning for the orphan matter, one for the unreadable rows');
  assert.ok(warnings.some((line) => /not on the claim register/.test(line)));
  assert.ok(warnings.some((line) => /could not be read exactly/.test(line)));
  assert.ok(warnings.some((line) => /Nothing was repaired/.test(line)));
});

test('the scenario loader drops a bad probability, a fractional amount, an orphan matter and a duplicate id', () => {
  const assessments = normalizePrvAssessments([assessment()], [matter()], []);
  const warnings = [];
  const rows = normalizePrvScenarios([
    scenario({ id: 'ok' }),
    scenario({ id: 'over', probabilityBps: 10001 }),
    scenario({ id: 'neg', probabilityBps: -1 }),
    scenario({ id: 'frac', amountMinor: 25.5 }),
    scenario({ id: 'orphan', matterId: 'not-a-matter' }),
    scenario({ id: 'ok' }),
  ], assessments, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok']);
  assert.ok(warnings.some((line) => /could not be read exactly/.test(line)));
  assert.ok(warnings.some((line) => /no assessment/.test(line)));
});

test('the reimbursement loader drops a non-boolean certainty, a missing basis and a second recognition for one matter', () => {
  const assessments = normalizePrvAssessments([assessment()], [matter()], []);
  const warnings = [];
  const rows = normalizePrvReimbursements([
    reimbursement({ id: 'ok' }),
    reimbursement({ id: 'no-flag', virtuallyCertain: 'yes' }),
    reimbursement({ id: 'no-basis', basisRef: 'short' }),
    reimbursement({ id: 'second' }),
  ], assessments, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok']);
  assert.match(warnings[0], /could not be read exactly/);
});

test('the carrying loader drops a missing reference, a fractional amount and a second carrying for one currency', () => {
  const warnings = [];
  const rows = normalizePrvCarryings([
    carrying({ id: 'ok' }),
    carrying({ id: 'no-ref', carriedRef: 'GL-1' }),
    carrying({ id: 'frac', carriedMinor: 100.5 }),
    carrying({ id: 'second-cur' }),
    carrying({ id: 'other-cur', currency: 'USD', carriedMinor: 2000000, carriedRef: 'GL-2400-220 — dollar provision account reference' }),
  ], warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok', 'other-cur']);
  assert.match(warnings[0], /could not be read exactly/);
});

test('an assessment whose hands are off the roster is KEPT and printed as an orphan, never dropped', () => {
  const rows = normalizePrvAssessments([assessment({ responsibleIds: ['ghost'] })], [matter()], []);
  assert.equal(rows.length, 1, 'deleting it would erase a live provision');
  assert.equal(rows[0].responsibleIds[0], 'ghost');
});

/* ------------------------------------------------------------- 3. arithmetic */

test('the expected value is exact: it refuses a set that is not 100% or not a whole minor unit', () => {
  assert.deepEqual(expectedValueMinor([]), { minor: null, reason: 'No scenarios are declared, so no expected value can be computed.' });
  assert.equal(expectedValueMinor([
    { probabilityBps: 6000, amountMinor: 10000000 },
    { probabilityBps: 3000, amountMinor: 16000000 },
    { probabilityBps: 1000, amountMinor: 24000000 },
  ]).minor, 13200000);
  const short = expectedValueMinor([
    { probabilityBps: 4000, amountMinor: 18000000 },
    { probabilityBps: 4000, amountMinor: 22000000 },
  ]);
  assert.equal(short.minor, null);
  assert.match(short.reason, /sum to 8000 basis points, not 10,000/);
  const fractional = expectedValueMinor([
    { probabilityBps: 5000, amountMinor: 1000001 },
    { probabilityBps: 5000, amountMinor: 1000000 },
  ]);
  assert.equal(fractional.minor, null);
  assert.match(fractional.reason, /not a whole minor unit/);
});

test('the asset is capped at the provision, the excess is printed, and a zero provision supports no asset', () => {
  const capped = capAssetMinor({ expectedMinor: 3300000, provisionMinor: 2000000 });
  assert.deepEqual({ assetMinor: capped.assetMinor, capped: capped.capped, excessMinor: capped.excessMinor }, { assetMinor: 2000000, capped: true, excessMinor: 1300000 });
  const whole = capAssetMinor({ expectedMinor: 5000000, provisionMinor: 13200000 });
  assert.deepEqual({ assetMinor: whole.assetMinor, capped: whole.capped }, { assetMinor: 5000000, capped: false });
  const none = capAssetMinor({ expectedMinor: 8000000, provisionMinor: 0 });
  assert.equal(none.assetMinor, null, 'an unprovided matter supports no asset');
  assert.match(none.reason, /No provision is recognized/);
  assert.equal(capAssetMinor({ expectedMinor: null, provisionMinor: 4000000 }).assetMinor, null);
});

test('the reconciliation gap is carried − provision, and a missing carrying is a refusal, not a zero', () => {
  assert.deepEqual(reconciliation({ provisionMinor: 17700000, carriedMinor: 15000000 }), { reconciled: false, gapMinor: -2700000, reason: null });
  assert.deepEqual(reconciliation({ provisionMinor: 17700000, carriedMinor: 17700000 }).reconciled, true);
  const missing = reconciliation({ provisionMinor: 17700000, carriedMinor: null });
  assert.equal(missing.reconciled, null);
  assert.match(missing.reason, /No finance carrying is declared/);
});

test('money is integer minor units and the sum is exact', () => {
  assert.equal(minorUnits(1250000), 1250000);
  assert.equal(minorUnits(12.5), null);
  assert.equal(minorUnits(-1), null);
  assert.equal(sumMinor([100, 250, 25], (row) => row), 375);
  assert.equal(utcDayMs('2026-11-17T00:00:00.000Z'), Date.UTC(2026, 10, 17));
});

/* ------------------------------------------------------- 4. provision kernel */

test('the provision is derived from the declared classification and best estimate, and a matter with no assessment is unassessed, never zero', () => {
  const unassessed = derivePrvProvision({ assessment: null, scenarios: [] });
  assert.equal(unassessed.state.key, 'unassessed');
  assert.equal(unassessed.provisionRecognized, false);
  assert.equal(unassessed.bestEstimateMinor, null);
  assert.match(unassessed.bestEstimateReason, /No assessment is on the record/);

  const probable = derivePrvProvision({ assessment: assessment(), scenarios: [] });
  assert.equal(probable.state.key, 'provided');
  assert.equal(probable.provisionMinor, 4000000);

  const possible = derivePrvProvision({ assessment: assessment({ classification: 'possible' }), scenarios: [] });
  assert.equal(possible.state.key, 'disclosed-only');
  assert.equal(possible.provisionMinor, 0);

  const remote = derivePrvProvision({ assessment: assessment({ classification: 'remote' }), scenarios: [] });
  assert.equal(remote.state.key, 'remote');

  const unestimable = derivePrvProvision({
    assessment: assessment({ estimateMethod: 'expected-value', mostLikelyMinor: null }),
    scenarios: [{ probabilityBps: 4000, amountMinor: 18000000 }],
  });
  assert.equal(unestimable.state.key, 'disclosed-only', 'a probable obligation with no reliable estimate is disclosed, not provided');
  assert.equal(unestimable.provisionRecognized, false);
});

test('all six states are six different facts', () => {
  const report = read(fixture({
    lfgMatters: [
      matter({ id: 'm-provided', matterRef: 'CLM-2026-0101 — provided letter' }),
      matter({ id: 'm-possible', matterRef: 'CLM-2026-0102 — possible letter' }),
      matter({ id: 'm-remote', matterRef: 'CLM-2026-0103 — remote letter' }),
      matter({ id: 'm-unassessed', matterRef: 'CLM-2026-0104 — unassessed letter' }),
    ],
    lfgAccruals: [
      accrual({ id: 'a1', matterId: 'm-provided' }),
      accrual({ id: 'a2', matterId: 'm-possible' }),
      accrual({ id: 'a3', matterId: 'm-remote' }),
      accrual({ id: 'a4', matterId: 'm-unassessed' }),
    ],
    prvAssessments: [
      assessment({ id: 'as-prov', matterId: 'm-provided' }),
      assessment({ id: 'as-poss', matterId: 'm-possible', classification: 'possible' }),
      assessment({ id: 'as-rem', matterId: 'm-remote', classification: 'remote' }),
    ],
  }));
  const byMatter = Object.fromEntries(report.rows.map((row) => [row.matter.id, row.state.key]));
  assert.equal(byMatter['m-provided'], 'provided');
  assert.equal(byMatter['m-possible'], 'disclosed-only');
  assert.equal(byMatter['m-remote'], 'remote');
  assert.equal(byMatter['m-unassessed'], 'unassessed');
  assert.equal(report.stateTotal, report.totals.matters);
  assert.equal(report.balances.statesReconcile, true);
  for (const key of PROV_STATE_KEYS) assert.ok(key in report.states, `${key} must be a declared state`);
  assert.deepEqual(PROV_CLASSIFICATION_KEYS, ['probable', 'possible', 'remote']);
  assert.deepEqual(PROV_ESTIMATE_METHOD_KEYS, ['most-likely', 'expected-value']);
});

/* ---------------------------------------------------- 5. asset & reconciliation */

test('cash the insurer paid is an asset without a declaration; a pending claim needs a declared virtual certainty', () => {
  const withCash = read(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
    prvAssessments: [assessment({ mostLikelyMinor: 4000000 })],
    insPolicies: [{
      id: 'pol-one', policyRef: 'POL-2026-0001 — declaration page reference on the schedule',
      insurerRef: 'Albion Syndicate 2026', policyClass: 'general-liability', basis: 'occurrence',
      periodStartDay: '2026-01-01', periodEndDay: '2026-12-31', notificationWindowDays: 30,
      limitMinor: 10000000, deductibleMinor: 250000, currency: 'GBP', triggerRef: null,
      responsibleIds: ['samuel'], declaredById: 'mei', declaredAt: iso('2026-01-01T09:00:00.000Z'),
      createdAt: iso('2026-01-01T09:00:00.000Z'), updatedAt: iso('2026-01-01T09:00:00.000Z'),
    }],
    insCoverages: [{
      id: 'cov-one', matterId: 'm-one', policyId: 'pol-one', coveredMinor: 4000000, currency: 'GBP',
      basisRef: 'Public liability wording clause 4.1 answers for third-party property damage during the period.',
      declaredById: 'mei', createdAt: iso('2026-06-02T09:00:00.000Z'),
    }],
    insRecoveries: [
      { id: 'r1', coverageId: 'cov-one', kind: 'claimed', atDay: '2026-06-01', amountMinor: 4000000, currency: 'GBP', basisRef: 'Proof of loss submitted to the syndicate.', recordedById: 'mei', createdAt: T0 },
      { id: 'r2', coverageId: 'cov-one', kind: 'recovered', atDay: '2026-08-01', amountMinor: 2000000, currency: 'GBP', basisRef: 'Interim settlement received from the syndicate.', recordedById: 'mei', createdAt: T0 },
    ],
  }));
  const cashRow = withCash.rows[0];
  assert.equal(cashRow.cashReceivedMinor, 2000000);
  assert.equal(cashRow.assetMinor, 2000000, 'cash is certain, so no declaration is needed');
  assert.equal(cashRow.state.key, 'provided-with-asset');
  assert.equal(cashRow.netExposureMinor, 2000000, 'the net exposure is the provision less the asset');
  assert.equal(cashRow.assetWithoutCash, false);

  const pending = read(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
    prvAssessments: [assessment({ mostLikelyMinor: 4000000 })],
    insPolicies: [{
      id: 'pol-one', policyRef: 'POL-2026-0001 — declaration page reference on the schedule',
      insurerRef: 'Albion Syndicate 2026', policyClass: 'general-liability', basis: 'occurrence',
      periodStartDay: '2026-01-01', periodEndDay: '2026-12-31', notificationWindowDays: 30,
      limitMinor: 10000000, deductibleMinor: 250000, currency: 'GBP', triggerRef: null,
      responsibleIds: ['samuel'], declaredById: 'mei', declaredAt: iso('2026-01-01T09:00:00.000Z'),
      createdAt: iso('2026-01-01T09:00:00.000Z'), updatedAt: iso('2026-01-01T09:00:00.000Z'),
    }],
    insCoverages: [{
      id: 'cov-one', matterId: 'm-one', policyId: 'pol-one', coveredMinor: 4000000, currency: 'GBP',
      basisRef: 'Public liability wording clause 4.1 answers for third-party property damage during the period.',
      declaredById: 'mei', createdAt: iso('2026-06-02T09:00:00.000Z'),
    }],
    insRecoveries: [
      { id: 'r1', coverageId: 'cov-one', kind: 'claimed', atDay: '2026-06-01', amountMinor: 4000000, currency: 'GBP', basisRef: 'Proof of loss submitted to the syndicate.', recordedById: 'mei', createdAt: T0 },
    ],
  }));
  const pendingRow = pending.rows[0];
  assert.equal(pendingRow.cashReceivedMinor, 0);
  assert.equal(pendingRow.assetMinor, null, 'a pending claim is not virtually certain until a seat declares it');
  assert.equal(pendingRow.state.key, 'provided');
  assert.match(pendingRow.expectedReason, /no virtual certainty is declared/);

  const declared = read(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
    prvAssessments: [assessment({ mostLikelyMinor: 2000000 })],
    prvReimbursements: [reimbursement()],
    insPolicies: [{
      id: 'pol-one', policyRef: 'POL-2026-0001 — declaration page reference on the schedule',
      insurerRef: 'Albion Syndicate 2026', policyClass: 'general-liability', basis: 'occurrence',
      periodStartDay: '2026-01-01', periodEndDay: '2026-12-31', notificationWindowDays: 30,
      limitMinor: 10000000, deductibleMinor: 250000, currency: 'GBP', triggerRef: null,
      responsibleIds: ['samuel'], declaredById: 'mei', declaredAt: iso('2026-01-01T09:00:00.000Z'),
      createdAt: iso('2026-01-01T09:00:00.000Z'), updatedAt: iso('2026-01-01T09:00:00.000Z'),
    }],
    insCoverages: [{
      id: 'cov-one', matterId: 'm-one', policyId: 'pol-one', coveredMinor: 4000000, currency: 'GBP',
      basisRef: 'Public liability wording clause 4.1 answers for third-party property damage during the period.',
      declaredById: 'mei', createdAt: iso('2026-06-02T09:00:00.000Z'),
    }],
    insRecoveries: [
      { id: 'r1', coverageId: 'cov-one', kind: 'claimed', atDay: '2026-06-01', amountMinor: 3300000, currency: 'GBP', basisRef: 'Proof of loss submitted to the syndicate.', recordedById: 'mei', createdAt: T0 },
    ],
  }));
  const cappedRow = declared.rows[0];
  assert.equal(cappedRow.assetMinor, 2000000, 'the asset is capped at the provision');
  assert.equal(cappedRow.assetCapped, true);
  assert.equal(cappedRow.assetExcessMinor, 1300000, 'the excess is printed, never recognized');
  assert.equal(cappedRow.assetWithoutCash, true, 'the register says plainly that no cash supports it yet');
  assert.equal(cappedRow.state.key, 'provided-asset-capped');
  assert.equal(cappedRow.netExposureMinor, 0);
});

test('the reconciliation prints the exact gap against the declared finance carrying', () => {
  const report = read(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
    prvAssessments: [assessment({ mostLikelyMinor: 4000000 })],
    prvCarryings: [carrying({ carriedMinor: 2500000 })],
  }));
  assert.equal(report.currencyRows.length, 1);
  const row = report.currencyRows[0];
  assert.equal(row.provisionMinor, 4000000);
  assert.equal(row.carriedMinor, 2500000);
  assert.equal(row.gapMinor, -1500000);
  assert.equal(row.reconciled, false);
  assert.equal(report.attention.unreconciledN, 1);
});

test('a currency with no declared carrying prints no gap and says why', () => {
  const report = read(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
    prvAssessments: [assessment({ mostLikelyMinor: 4000000 })],
  }));
  const row = report.currencyRows[0];
  assert.equal(row.carriedMinor, null);
  assert.equal(row.gapMinor, null);
  assert.equal(row.reconciled, null);
  assert.ok(report.incompleteReasons.some((line) => /no declared finance carrying/.test(line)));
  assert.equal(report.figuresComplete, false);
});

test('a closed matter carries no open obligation and is counted, never silently dropped', () => {
  const report = read(fixture({
    lfgMatters: [
      matter({ id: 'm-open', matterRef: 'CLM-2026-0201 — open letter' }),
      matter({ id: 'm-settled', matterRef: 'CLM-2026-0202 — settled letter' }),
      matter({ id: 'm-merged', matterRef: 'CLM-2026-0203 — merged letter' }),
    ],
    lfgAccruals: [
      accrual({ id: 'a1', matterId: 'm-open' }),
      accrual({ id: 'a2', matterId: 'm-settled' }),
      accrual({ id: 'a3', matterId: 'm-merged' }),
    ],
    lfgResolutions: [
      { id: 'res-1', matterId: 'm-settled', kind: 'settled', resolvedDay: day(-30), amountMinor: 3000000, currency: 'GBP', basisRef: 'Settled at mediation with no admission of liability.', mergedIntoId: null, recordedById: 'mei', createdAt: T0 },
      { id: 'res-2', matterId: 'm-merged', kind: 'merged', resolvedDay: day(-10), amountMinor: null, currency: null, basisRef: 'Consolidated into the first claim by direction.', mergedIntoId: 'm-open', recordedById: 'mei', createdAt: T0 },
    ],
  }));
  assert.equal(report.totals.matters, 1);
  assert.equal(report.totals.closedMatters, 2);
  assert.equal(report.rows[0].matter.id, 'm-open');
});

/* ---------------------------------------------------------------- 6. matrix */

test('the matrix resolves every active line, counts a person once and computes the joint apex over all of them', () => {
  const report = read(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
    prvAssessments: [assessment({ responsibleIds: ['samuel', 'frieda'] })],
  }));
  const row = report.rows[0];
  assert.deepEqual(row.managerIds.sort(), ['mei', 'priya']);
  assert.equal(row.holderRows.length, 2);
  assert.equal(new Set(row.holderRows.map((holder) => holder.personId)).size, 2, 'a person is counted once');
  assert.ok(row.apexIds.length >= 1);
  assert.ok(!row.apexIds.includes('mei') && !row.apexIds.includes('priya'), 'the apex sits above both lines');
  assert.equal(row.orphan, false);
});

test('a responsible hand off the graph is printed as an orphan, never dropped', () => {
  const report = read(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
    prvAssessments: [assessment({ responsibleIds: ['ghost'] })],
  }));
  assert.equal(report.rows.length, 1, 'deleting the row would erase a live provision');
  assert.equal(report.rows[0].orphan, true);
  assert.equal(report.orphanHolderN, 1);
  assert.equal(report.figuresComplete, false);
  assert.ok(report.incompleteReasons.some((line) => /not on the reporting graph/.test(line)));
});

test('the line roll-up counts a person once per line and never doubles a matter across lines', () => {
  const report = read(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 }), matter({ id: 'm-two', matterRef: 'CLM-2026-0301 — second letter', responsibleIds: ['frieda'] })],
    lfgAccruals: [accrual(), accrual({ id: 'a-two', matterId: 'm-two' })],
    prvAssessments: [
      assessment({ id: 'as-one', matterId: 'm-one', responsibleIds: ['samuel', 'frieda'] }),
      assessment({ id: 'as-two', matterId: 'm-two', responsibleIds: ['frieda'] }),
    ],
  }));
  const mei = report.lineRows.find((row) => row.managerName === 'Mei Manager');
  const priya = report.lineRows.find((row) => row.managerName === 'Priya Manager');
  assert.equal(mei.mattersN, 1, 'the first matter holds samuel on Mei’s line');
  assert.equal(priya.mattersN, 2, 'Frieda’s line holds both matters, each counted once');
  assert.equal(mei.holdersN, 1);
  assert.equal(priya.holdersN, 1);
});

/* ----------------------------------------------------------------- 7. rule */

test('RULE-PROV-01 files an opaque ask at the joint apex, is idempotent, and never names the matter or the sum', () => {
  const raw = fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
  });
  const { api, store } = harness(raw);

  const report = buildProvisions(store.state, { now: NOW, seat: null });
  assert.equal(report.rows[0].state.key, 'unassessed');

  const { conditions } = provisionConditions(report);
  const unassessed = conditions.find((row) => row.kind === 'unassessed');
  assert.ok(unassessed);
  assert.equal(unassessed.signature, prvAskSignature('unassessed', 'm-one'));

  const result = api.provisionSetConventions({ provPrivacyFloor: 3 });
  assert.equal(result.ok, true, result.error);

  const asks = indexProvisionAsks(store.state);
  assert.ok(asks.length >= 1);
  const task = asks.find((row) => row.kind === 'unassessed')?.task;
  assert.ok(task);
  const text = `${task.title} ${task.expectedOutcome} ${task.support}`;
  for (const forbidden of ['Northgate', 'CLM-2026-0001', 'Sam', 'Samuel', '5,000', '5000000']) {
    assert.ok(!text.includes(forbidden), `the ask must not name “${forbidden}”`);
  }

  const before = indexProvisionAsks(store.state).length;
  api.provisionSetConventions({ provPrivacyFloor: 3 });
  assert.equal(indexProvisionAsks(store.state).length, before, 'the rule is idempotent');

  // Self-closing: declare the assessment and the ask closes itself.
  const declared = api.provisionDeclareAssessment({
    matterId: 'm-one', classification: 'probable', estimateMethod: 'most-likely',
    mostLikelyMinor: 4000000, currency: 'GBP',
    basisRef: 'Present obligation from the pleaded breach; the outflow is more likely than not and the amount is reliably estimable.',
    responsibleIds: ['samuel'],
  });
  assert.equal(declared.ok, true, declared.error);
  const active = indexProvisionAsks(store.state).filter((row) => row.kind === 'unassessed' && row.task && row.task.status === 'active');
  assert.equal(active.length, 0);
});

test('the rule stays silent when paused, and observes identity-free where nobody can be asked', () => {
  const raw = fixture({
    lfgMatters: [matter({ claimedMinor: 5000000, responsibleIds: ['ghost'] })],
    lfgAccruals: [accrual()],
  });
  const { store } = harness(raw);
  const draft = JSON.parse(JSON.stringify(store.state));
  const event = { type: 'provision.assessment.declared' };

  const out = provisionRule(draft, { event, now: NOW, idFactory: (prefix) => `${prefix}-r` });
  assert.equal(draft.delegations.length, 0);
  assert.equal(draft.prvMarkers.length, 1);
  const marker = draft.prvMarkers[0];
  assert.equal(marker.kind, 'provision');
  for (const forbidden of ['Northgate', 'CLM-2026-0001', 'ghost']) {
    assert.ok(!marker.detail.includes(forbidden));
  }
  assert.ok(out.some((effect) => effect.action === 'observed'));

  const pausedDraft = JSON.parse(JSON.stringify(store.state));
  pausedDraft.settings[PROV_PAUSE_SWITCH] = false;
  const paused = provisionRule(pausedDraft, { event, now: NOW, idFactory: (prefix) => `${prefix}-p` });
  assert.deepEqual(paused, []);
  assert.equal(pausedDraft.prvMarkers.length, 0);
  assert.equal(pausedDraft.delegations.length, 0);
});

test('the rule is registered on the spine, in the propagation contracts, and in the pause census', () => {
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 166, 'the spine carries ADR-0250 (RULE-PROV-01) after ADR-0249, then ADR-0253 (RULE-QNC-01), ADR-0254 (RULE-DGI-01) and ADR-0257 (RULE-TAX-01)');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule?.id === 'provisionRule' || row.module === 'prvRules.js');
  assert.ok(contract, 'the rule must have a propagation contract');
  assert.deepEqual(contract.writes.sort(), ['delegations', 'links', 'prvMarkers']);
  assert.equal(contract.scansWorkspace, true);
});

test('the rule caps new asks per commit and counts the remainder rather than dropping it silently', () => {
  const matters = [];
  const accruals = [];
  for (let i = 0; i < 6; i += 1) {
    matters.push(matter({ id: `m-${i}`, matterRef: `CLM-2026-10${i} — unassessed letter ${i}` }));
    accruals.push(accrual({ id: `a-${i}`, matterId: `m-${i}` }));
  }
  const { store } = harness(fixture({ lfgMatters: matters, lfgAccruals: accruals }));
  const draft = JSON.parse(JSON.stringify(store.state));
  const out = provisionRule(draft, {
    event: { type: 'provision.assessment.declared' },
    now: NOW,
    idFactory: (prefix) => `${prefix}-c-${Math.random().toString(36).slice(2, 8)}`,
  });
  assert.equal(draft.delegations.length, 4);
  assert.ok(out.some((effect) => effect.action === 'deferred'));
});

/* ----------------------------------------------------------------- 8. door */

test('the door refuses a duplicate assessment, a bad classification, a fractional amount, a missing basis and a future day', () => {
  const { api } = harness(fixture({
    lfgMatters: [
      matter({ claimedMinor: 5000000 }),
      matter({ id: 'm-two', matterRef: 'CLM-2026-0002 — second letter before action' }),
    ],
    lfgAccruals: [accrual(), accrual({ id: 'a-two', matterId: 'm-two' })],
  }));

  const good = {
    matterId: 'm-one', classification: 'probable', estimateMethod: 'most-likely',
    mostLikelyMinor: 4000000, currency: 'GBP',
    basisRef: 'Present obligation from the pleaded breach; the outflow is more likely than not and the amount is reliably estimable.',
    responsibleIds: ['samuel'],
  };
  const first = api.provisionDeclareAssessment(good);
  assert.equal(first.ok, true, first.error);

  const duplicate = api.provisionDeclareAssessment(good);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.refusal, 'provisions:assessment-duplicate');

  const badClass = api.provisionDeclareAssessment({ ...good, classification: 'probably' });
  assert.equal(badClass.ok, false);
  assert.equal(badClass.refusal, 'provisions:classification-invalid');

  const fractional = api.provisionDeclareAssessment({ ...good, matterId: 'm-two', mostLikelyMinor: 100.5 });
  assert.equal(fractional.ok, false);
  assert.equal(fractional.refusal, 'provisions:amount-missing');
  assert.match(fractional.error, /fractional minor unit is refused rather than rounded/);

  const noBasis = api.provisionDeclareAssessment({ ...good, matterId: 'm-two', basisRef: 'short' });
  assert.equal(noBasis.ok, false);
  assert.equal(noBasis.refusal, 'provisions:basis-missing');

  const future = api.provisionDeclareAssessment({ ...good, matterId: 'm-two', assessedDay: day(5) });
  assert.equal(future.ok, false);
  assert.equal(future.refusal, 'provisions:day-future');
});

test('the door narrows every write to a seat that holds the responsible hands', () => {
  const { api, store } = harness(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
  }));
  asSeat(api, store, 'dana');
  const outside = api.provisionDeclareAssessment({
    matterId: 'm-one', classification: 'probable', estimateMethod: 'most-likely',
    mostLikelyMinor: 4000000, currency: 'GBP',
    basisRef: 'Present obligation from the pleaded breach; the outflow is more likely than not and the amount is reliably estimable.',
    responsibleIds: ['frieda'],
  });
  assert.equal(outside.ok, false);
  assert.match(outside.error, /not on a line this seat holds/);
});

test('the door refuses a scenario on an unassessed matter, a bad probability and a fractional amount', () => {
  const { api } = harness(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
  }));
  const orphan = api.provisionDeclareScenario({
    matterId: 'm-one', outcome: 'Settlement at the pleaded sum', probabilityBps: 10000,
    amountMinor: 4000000, currency: 'GBP', basisRef: 'The single dominant outcome on the pleaded loss and the comparator evidence.',
  });
  assert.equal(orphan.ok, false);
  assert.equal(orphan.refusal, 'provisions:assessment-not-found');

  assert.equal(api.provisionDeclareAssessment({
    matterId: 'm-one', classification: 'probable', estimateMethod: 'expected-value',
    mostLikelyMinor: null, currency: 'GBP',
    basisRef: 'Present obligation from the pleaded breach; the amount is a population of distinct outcomes.',
    responsibleIds: ['samuel'],
  }).ok, true);

  const badProbability = api.provisionDeclareScenario({
    matterId: 'm-one', outcome: 'Settlement at the pleaded sum', probabilityBps: 10001,
    amountMinor: 4000000, currency: 'GBP', basisRef: 'The single dominant outcome on the pleaded loss and the comparator evidence.',
  });
  assert.equal(badProbability.ok, false);
  assert.equal(badProbability.refusal, 'provisions:probability-invalid');

  const fractional = api.provisionDeclareScenario({
    matterId: 'm-one', outcome: 'Settlement at the pleaded sum', probabilityBps: 10000,
    amountMinor: 25.5, currency: 'GBP', basisRef: 'The single dominant outcome on the pleaded loss and the comparator evidence.',
  });
  assert.equal(fractional.ok, false);
  assert.equal(fractional.refusal, 'provisions:amount-invalid');
});

test('the door refuses a carrying with no reference and a second carrying for one currency', () => {
  const { api } = harness(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
    prvAssessments: [assessment()],
  }));
  const noRef = api.provisionDeclareCarrying({ currency: 'GBP', carriedMinor: 4000000, carriedRef: 'GL-1' });
  assert.equal(noRef.ok, false);
  assert.equal(noRef.refusal, 'provisions:reference-missing');

  const first = api.provisionDeclareCarrying({ currency: 'GBP', carriedMinor: 4000000, carriedRef: 'GL-2400-118 — general ledger provision account, quarter-close pack section 4.2' });
  assert.equal(first.ok, true, first.error);

  const second = api.provisionDeclareCarrying({ currency: 'GBP', carriedMinor: 5000000, carriedRef: 'GL-2400-119 — general ledger provision account, revised close pack section 4.2' });
  assert.equal(second.ok, false);
  assert.equal(second.refusal, 'provisions:carrying-duplicate');
});

test('conventions normalize fail-closed and refuse an unknown key at the door', () => {
  const normalized = normalizePrvSettings({ provPrivacyFloor: 1, provAutoPropagate: 'no' });
  assert.equal(normalized[PROV_SETTING_KEYS.privacyFloor], 3);
  assert.equal(normalized[PROV_SETTING_KEYS.autoPropagate], true);

  const { api } = harness(fixture());
  const unknown = api.provisionSetConventions({ notASetting: 1 });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.refusal, 'provisions:unknown-setting');
  const outOfBounds = api.provisionSetConventions({ provPrivacyFloor: 99 });
  assert.equal(outOfBounds.ok, false);
  assert.equal(outOfBounds.refusal, 'provisions:setting-out-of-bounds');
  const accepted = api.provisionSetConventions({ provPrivacyFloor: 5 });
  assert.equal(accepted.ok, true, accepted.error);
  assert.equal(accepted.conventions[PROV_SETTING_KEYS.privacyFloor], 5);
});

/* -------------------------------------------------------------------- 9. csv */

test('CSV #191 is aggregate, identity-free, floored, and its summary equals the reader', () => {
  const exported = CSV_EXPORTS.find((row) => row.key === PROV_CSV_SCOPE);
  assert.ok(exported, 'provision-reimbursement must be a registered export');
  assert.equal(exported.sensitive, true);

  const state = buildDemoState(NOW);
  const report = buildProvisions(state, { now: NOW, seat: null });
  const file = exportWorkspaceCsv(state, PROV_CSV_SCOPE, { now: NOW });
  assert.equal(file.ok, true, file.error);
  const parsed = parseCsv(file.csv);
  assert.deepEqual(parsed.headers, [...PROV_CSV_COLUMNS]);
  const at = (row, key) => row[parsed.headers.indexOf(key)];
  const summaryRow = parsed.rows.find((row) => at(row, 'row_kind') === 'summary');
  assert.ok(summaryRow, 'the export must carry a summary row');
  assert.equal(Number(at(summaryRow, 'assessments_n')), report.totals.assessments);
  assert.equal(Number(at(summaryRow, 'provided_n')), report.totals.provided);
  assert.equal(Number(at(summaryRow, 'provided_with_asset_n')), report.totals.providedWithAsset);
  assert.equal(Number(at(summaryRow, 'provided_asset_capped_n')), report.totals.providedAssetCapped);
  assert.equal(Number(at(summaryRow, 'disclosed_only_n')), report.totals.disclosedOnly);
  assert.equal(Number(at(summaryRow, 'remote_n')), report.totals.remote);
  assert.equal(Number(at(summaryRow, 'unassessed_n')), report.totals.unassessed);
  assert.equal(Number(at(summaryRow, 'scenarios_n')), report.totals.scenarios);
  assert.equal(Number(at(summaryRow, 'asset_recognized_n')), report.totals.assetRecognized);
  assert.equal(Number(at(summaryRow, 'asset_capped_n')), report.totals.assetCapped);
  assert.equal(Number(at(summaryRow, 'asset_without_cash_n')), report.totals.assetWithoutCash);
  assert.equal(Number(at(summaryRow, 'complete')), 1);

  // IDENTITY-FREE.
  for (const forbidden of ['Northgate', 'Ardley', 'Nordwind', 'Riverbend', 'Hallow', 'Sam', 'Priya', 'Mei', 'Freya', 'Frieda', 'GL-2400', 'ET1-', 'CLM-', 'LTR-', 'PI-2024']) {
    assert.ok(!file.csv.toLowerCase().includes(forbidden.toLowerCase()), `the export must not contain “${forbidden}”`);
  }

  const currencyRow = parsed.rows.find((row) => at(row, 'row_kind') === 'currency');
  assert.ok(currencyRow, 'the export must carry a per-currency money bridge');
  assert.equal(Number(at(currencyRow, 'provision_total_minor')), report.currencyRows[0].provisionMinor);
  assert.equal(Number(at(currencyRow, 'gap_minor')), report.currencyRows[0].gapMinor);
});

test('a per-state count below the floor is withheld BLANK with its reason', () => {
  const report = read(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
    prvAssessments: [assessment()],
  }));
  const rows = provisionCsvRows(report);
  const provided = rows.find((row) => row.row_kind === 'state' && row.key === 'provided');
  assert.equal(provided.provided_n, '');
  assert.match(provided.blank_reason, /privacy floor/);
});

/* ------------------------------------------------------------------ 10. panel */

test('the panel prints the reader’s own figures cell by cell (display == computed)', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const raw = fixture({
      lfgMatters: [matter({ claimedMinor: 5000000 })],
      lfgAccruals: [accrual()],
      prvAssessments: [assessment({ mostLikelyMinor: 4000000 })],
      prvCarryings: [carrying({ carriedMinor: 2500000 })],
    });
    const state = load(raw);
    const report = buildProvisions(state, { now: NOW, seat: null });
    const { api } = harness(raw);
    const view = renderProvisions({ api, query: new URLSearchParams(''), state });
    const html = view.outerHTML;
    const cell = (testid) => {
      const match = new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`).exec(html);
      return match ? match[1].trim() : null;
    };
    assert.equal(cell('prv-count-matters'), String(report.totals.matters));
    assert.equal(cell('prv-count-provided'), String(report.totals.provided + report.totals.providedWithAsset + report.totals.providedAssetCapped));
    assert.equal(cell('prv-count-disclosed'), String(report.totals.disclosedOnly));
    assert.equal(cell('prv-count-unassessed'), String(report.totals.unassessed));
    assert.equal(cell('prv-count-remote'), String(report.totals.remote));
    assert.ok(html.includes('GBP 40,000.00'), 'the provision and the net exposure are formatted from the reader’s own figure');
    assert.equal(cell('prv-count-unreconciled'), String(report.attention.unreconciledN));
    assert.equal(cell('prv-count-attention'), String(report.attention.total));

    assert.ok(html.includes('data-testid="prv-state-provided"'));

    const recon = renderProvisions({ api, query: new URLSearchParams('view=reconciliation'), state });
    const reconHtml = recon.outerHTML;
    assert.ok(reconHtml.includes('GBP 40,000.00'), 'the computed provision is printed on the reconciliation');
    assert.ok(reconHtml.includes('GBP 25,000.00'), 'the declared carrying is printed beside it');
    assert.ok(reconHtml.includes('-GBP 15,000.00'), 'the exact gap is printed, never silently adopted');
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});

test('the panel renders every tab without throwing, on an empty workspace and on the demo', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    for (const raw of [fixture(), buildDemoState(NOW)]) {
      const { api } = harness(raw);
      const state = load(raw);
      for (const view of ['provisions', 'scenarios', 'reimbursements', 'reconciliation', 'method']) {
        const node = renderProvisions({ api, query: new URLSearchParams(`view=${view}`), state });
        assert.ok(node.outerHTML.length > 0, `${view} must render`);
      }
    }
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});

/* -------------------------------------------------------------------- 11. demo */

test('the demo seeds every printed state and derives them live from the injected clock', () => {
  const state = buildDemoState(NOW);
  const report = buildProvisions(state, { now: NOW, seat: null });
  assert.equal(report.totals.matters, 7);
  assert.equal(report.totals.closedMatters, 3);
  for (const key of PROV_STATE_KEYS) {
    assert.ok(report.states[key] >= 1, `the demo must exercise ${key}`);
  }
  assert.equal(report.balances.statesReconcile, true);
  assert.equal(report.figuresComplete, true, report.incompleteReasons.join(' '));
  assert.ok(report.currencyRows[0].provisionMinor > 0);
  assert.ok(report.currencyRows[0].gapMinor < 0, 'the demo carries an unreconciled gap');
  assert.equal(report.attention.unreconciledN, 1);
});

/* ------------------------------------------------------------------- 12. reads */

test('the read surface is reachable, the signals fire, and the attention count is decision-shaped', () => {
  const { api } = harness(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual()],
  }));
  const report = api.provisionReport();
  assert.equal(report.ok, true, report.error);
  assert.equal(report.report.totals.matters, 1);
  const attention = api.provisionAttention();
  assert.equal(attention.ok, true, attention.error);
  assert.equal(attention.count, report.report.attention.total);
  assert.ok(attention.count >= 1);

  const state = buildDemoState(NOW);
  const signals = provisionSignals(state, NOW, state.settings);
  assert.ok(signals.length >= 4);
  for (const signal of signals) {
    assert.equal(signal.domain, 'Provisions & reimbursement');
    assert.equal(signal.route, '#/provisions');
  }
  const unassessed = signals.find((signal) => signal.ruleId === 'PRV-01');
  assert.ok(unassessed);
  assert.match(unassessed.detail, /refuses to print a zero/);

  const count = provisionAttentionCount(state, { now: NOW, settings: state.settings, seat: null });
  assert.equal(count, buildProvisions(state, { now: NOW, seat: null }).attention.total);
});
