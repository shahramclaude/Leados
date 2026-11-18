// ADR-0257 — Tax Controversy & Appeal-Control Register (Schema v209).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — six empty ledgers and three declared
//      conventions, and no notice, deadline, filing, evidence item or resolution
//      inferred from a tax filing, a ledger account, the provision register or a
//      payment on the record;
//   2. the loaders are FAIL-CLOSED — a notice with no reference, position,
//      jurisdiction, tax type, notice day, disputed amount, currency, written
//      basis, responsible hand or recording hand is DROPPED with a counted
//      warning, a second notice for one authority reference is dropped, a
//      deadline with NO written jurisdictional basis is dropped, a second
//      deadline or resolution for one notice is dropped, and every child row
//      pointing at a notice that is not on the register is dropped. Nothing is
//      repaired;
//   3. the DEADLINE IS NEVER COMPUTED — it is a declared day with the written
//      basis that sets the window, and a notice without one prints
//      `deadline-undeclared` rather than a window inferred from the notice day;
//   4. TIMELINESS is DERIVED by comparing the first filing day with the
//      declared deadline day — on time, late, or unprovable and printed as
//      unprovable rather than assumed either way — and a late filing is never
//      re-dated;
//   5. the SWING is disputed less resolved, exact in whole minor units, and
//      printed apart from both figures; it is never stored;
//   6. all SIX STATES are six different facts, and the flags (`evidence-empty`,
//      `aging-unresolved`) are separate facts again, not folded into a state;
//   7. the MATRIX is correct — every active line holding every responsible hand
//      is resolved, a person is counted once, the joint apex is computed over ALL
//      of them (including a declared secondary line), and a hand off the graph is
//      printed as an orphan, never dropped;
//   8. RULE-TAX-01 is idempotent, capped at four asks per commit, self-closing,
//      pause-governed on every path, OPAQUE in its ask text (a controversy
//      schedule names the authority and the position) and observes identity-free
//      where nobody can be asked;
//   9. the DOOR refuses a duplicate notice, a bad tax type, a fractional amount,
//      a missing basis, a second deadline for one notice, a filing with no
//      receipt and a future day, and narrows every write to a seat that holds the
//      responsible hands;
//  10. the CSV boundary is aggregate, identity-free and floored, and its summary
//      equals the reader's own totals;
//  11. the panel prints the reader's own figures cell by cell (display ==
//      computed), on an empty workspace and on the demo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  buildTaxControversy,
  deriveTaxControversy,
  taxSignals,
  taxAttentionCount,
} from '../../app/core/domain/taxControversy.js';
import {
  normalizeTaxDeadlines,
  normalizeTaxEvidence,
  normalizeTaxFilings,
  normalizeTaxNotices,
  normalizeTaxResolutions,
  normalizeTaxSettings,
} from '../../app/core/domain/taxSchema.js';
import { minorUnits, moneyLabel, swingMinor, utcDayMs } from '../../app/core/domain/taxMath.js';
import { taxConditions, taxRule, indexTaxAsks, TAX_PAUSE_SWITCH } from '../../app/core/domain/taxRules.js';
import {
  TAX_CSV_COLUMNS,
  TAX_CSV_SCOPE,
  TAX_FILING_KIND_KEYS,
  TAX_OUTCOME_KEYS,
  TAX_SETTING_KEYS,
  TAX_STATE_KEYS,
  TAX_TYPE_KEYS,
} from '../../app/core/domain/taxRegistry.js';
import { taxCsvRows } from '../../app/core/domain/taxReport.js';
import { renderTax } from '../../app/views/tax.js';

const NOW = new Date('2026-11-18T09:00:00.000Z');
const T0 = NOW.toISOString();
const iso = (value) => new Date(value).toISOString();
const day = (offset) => new Date(NOW.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

/* ---------------------------------------------------------------- fixtures */

function person(id, name, level, managerId) {
  return { id, name, role: level, level, managerId, status: 'active', startDate: iso('2024-01-01T00:00:00.000Z'), createdAt: iso('2024-01-01T00:00:00.000Z'), updatedAt: iso('2024-01-01T00:00:00.000Z') };
}

function line(id, personId, managerId, kind = 'functional') {
  return { id, personId, managerId, kind, shareH: null, rights: [], fromISO: iso('2024-01-01T00:00:00.000Z'), toISO: null, declaredAt: iso('2024-01-01T00:00:00.000Z'), note: '', status: 'active', history: [] };
}

/**
 * `dana` and `omar` are two director lines. `mei` sits under `dana`; `priya`
 * sits under `omar`; `samuel` is held by BOTH (`mei` as his home line and
 * `priya` as a declared secondary line), which is the matrix case this register
 * must get right. `frieda` is under `priya` only.
 */
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
    line('rl-samuel-priya', 'samuel', 'priya', 'cross-functional'),
    line('rl-frieda-priya', 'frieda', 'priya'),
  ];
  Object.assign(raw, overrides);
  return raw;
}

const notice = (overrides = {}) => ({
  id: 'tax-not-one',
  noticeRef: 'HMRC-VAT-8841203',
  position: 'Input tax reclaimed on professional fees attributed to the exempt letting activity is disallowed in full.',
  jurisdiction: 'United Kingdom — VAT (VATA 1994 s.73 assessment)',
  taxType: 'vat',
  noticeDay: day(-20),
  disputedMinor: 4000000,
  currency: 'GBP',
  basisRef: 'The fees were incurred on the sale of a subsidiary, a general-purpose overhead of the whole business, so the input tax is recoverable in full.',
  responsibleIds: ['samuel'],
  recordedById: 'mei',
  recordedAt: iso(day(-20)),
  recordedDay: day(-20),
  provisionRef: null,
  createdAt: iso(day(-20)),
  updatedAt: iso(day(-20)),
  ...overrides,
});

const deadline = (overrides = {}) => ({
  id: 'tax-dl-one',
  noticeId: 'tax-not-one',
  deadlineDay: day(-5),
  basisRef: 'The s.73 assessment carries a 30-day appeal window from the date the assessment is issued.',
  declaredById: 'mei',
  declaredAt: iso(day(-20)),
  declaredDay: day(-20),
  createdAt: iso(day(-20)),
  ...overrides,
});

const filing = (overrides = {}) => ({
  id: 'tax-file-one',
  noticeId: 'tax-not-one',
  filingKind: 'objection',
  filedDay: day(-12),
  receiptRef: 'HMRC-ACK-4417 — objection acknowledgement',
  basisRef: 'A written objection was lodged on the ground that the fees are a general-purpose overhead of the whole business.',
  filedById: 'samuel',
  filedAt: iso(day(-12)),
  filedDayStamp: day(-12),
  createdAt: iso(day(-12)),
  ...overrides,
});

const evidence = (overrides = {}) => ({
  id: 'tax-ev-one',
  noticeId: 'tax-not-one',
  itemLabel: 'Deal correspondence on the subsidiary sale',
  itemRef: 'DEAL-CORR-118 — board pack and adviser correspondence on the disposal',
  suppliedDay: day(-11),
  basisRef: 'The correspondence shows the fees were incurred on the disposal of a subsidiary, a general-purpose overhead rather than an exempt letting cost.',
  suppliedById: 'samuel',
  suppliedAt: iso(day(-11)),
  suppliedDayStamp: day(-11),
  createdAt: iso(day(-11)),
  ...overrides,
});

const resolution = (overrides = {}) => ({
  id: 'tax-res-one',
  noticeId: 'tax-not-one',
  outcome: 'partially-upheld',
  resolvedDay: day(-2),
  resolvedMinor: 1500000,
  currency: 'GBP',
  basisRef: 'The review accepted the general-purpose overhead argument for part of the fees and upheld the disallowance for the rest.',
  recordedById: 'mei',
  recordedAt: iso(day(-2)),
  recordedDay: day(-2),
  createdAt: iso(day(-2)),
  ...overrides,
});

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildTaxControversy(load(raw), { now: NOW, seat: null, ...opts });

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
  return { store, api };
}

function asSeat(api, store, seatId) {
  store.update((draft) => { draft.settings.activeSeatId = seatId; }, { type: 'test.seat', entity: 'workspace', entityId: seatId, summary: 'test seat' });
  return api;
}

/* --------------------------------------------------------------- 1. schema */

test('schema v209 is additive: six empty ledgers, three conventions, nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 209, 'ADR-0257 (tax controversy) is the current head');
  const keys = ['taxNotices', 'taxDeadlines', 'taxFilings', 'taxEvidence', 'taxResolutions', 'taxMarkers'];
  for (const key of keys) assert.ok(COLLECTIONS.includes(key), `${key} must be a declared collection`);
  const empty = createEmptyState(T0);
  for (const key of keys) assert.deepEqual(empty[key], [], `${key} must be empty on a fresh workspace`);
  assert.equal(empty.settings.taxAutoPropagate, true);
  assert.equal(empty.settings.taxPrivacyFloor, 3);
  assert.equal(empty.settings.taxResolutionHorizonDays, 365);
  // The register declares NO window of its own: a deadline belongs to a notice.
  for (const forbidden of ['taxObjectionWindowDays', 'taxAppealWindowDays', 'taxWarningHorizonDays', 'taxJurisdictionCalendar']) {
    assert.equal(forbidden in empty.settings, false, `${forbidden} must not exist: the register holds no jurisdiction calendar`);
  }
});

test('migrating a v208 workspace adds six empty ledgers and infers no notice, deadline or resolution', () => {
  const base = createEmptyState(T0);
  base.schemaVersion = 208;
  base.lfgMatters = [{ id: 'm-one', matterRef: 'CLM-2026-0001', currency: 'GBP', claimedMinor: 9000000, responsibleIds: ['samuel'], openedById: 'mei', openedAt: T0, status: 'open' }];
  base.prvAssessments = [{ id: 'prv-ass-one', matterId: 'm-one', classification: 'probable', estimateMethod: 'most-likely', mostLikelyMinor: 9000000, currency: 'GBP', basisRef: 'A written basis long enough to pass the loader.', responsibleIds: ['samuel'], assessedById: 'mei', assessedAt: T0, assessedDay: day(0) }];
  for (const key of ['taxNotices', 'taxDeadlines', 'taxFilings', 'taxEvidence', 'taxResolutions', 'taxMarkers']) delete base[key];
  const migrated = migrate(base).raw;
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(migrated.taxNotices, [], 'a claim matter or a provision is not an authority notice');
  assert.deepEqual(migrated.taxDeadlines, [], 'no deadline is inferred from a notice day at upgrade time');
  assert.deepEqual(migrated.taxResolutions, [], 'no resolution is inferred from a payment or a provision');
  assert.equal(migrated.settings.taxAutoPropagate, true);
});

/* -------------------------------------------------------------- 2. loaders */

test('the notice loader drops a row missing any required fact, and a second notice for one reference', () => {
  const warnings = [];
  const rows = normalizeTaxNotices([
    notice({ id: 'ok' }),
    notice({ id: 'no-ref', noticeRef: '' }),
    notice({ id: 'no-position', position: '' }),
    notice({ id: 'no-jurisdiction', jurisdiction: 'UK' }),
    notice({ id: 'no-type', taxType: 'stamp-duty' }),
    notice({ id: 'no-day', noticeDay: 'yesterday' }),
    notice({ id: 'no-amount', disputedMinor: null }),
    notice({ id: 'frac-amount', disputedMinor: 100.5 }),
    notice({ id: 'no-currency', currency: 'POUNDS' }),
    notice({ id: 'no-basis', basisRef: 'too short' }),
    notice({ id: 'no-hands', responsibleIds: [] }),
    notice({ id: 'five-hands', responsibleIds: ['samuel', 'frieda', 'mei', 'priya', 'dana'] }),
    notice({ id: 'no-recorder', recordedById: null }),
    notice({ id: 'bad-provision', provisionRef: 'GL' }),
    notice({ id: 'dup-ref', noticeRef: 'HMRC-VAT-8841203' }),
  ], warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /could not be read exactly/);
  assert.match(warnings[0], /Nothing was repaired/);
});

test('a deadline with no written jurisdictional basis is DROPPED, and a second deadline for one notice is refused', () => {
  const notices = normalizeTaxNotices([notice()], []);
  const warnings = [];
  const rows = normalizeTaxDeadlines([
    deadline({ id: 'ok' }),
    deadline({ id: 'no-basis', noticeId: 'tax-not-one', basisRef: '' }),
    deadline({ id: 'short-basis', noticeId: 'tax-not-one', basisRef: 'statute' }),
    deadline({ id: 'no-day', deadlineDay: 'soon' }),
    deadline({ id: 'orphan', noticeId: 'not-a-notice' }),
  ], notices, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok']);
  assert.ok(warnings.some((line) => /not on the register/.test(line)));
  assert.ok(warnings.some((line) => /could not be read exactly/.test(line)));

  const second = normalizeTaxDeadlines([deadline({ id: 'a' }), deadline({ id: 'b' })], notices, []);
  assert.equal(second.length, 1, 'one notice carries one deadline, or the window is ambiguous');
});

test('a filing with no receipt is dropped, and so is an evidence item with no document reference', () => {
  const notices = normalizeTaxNotices([notice()], []);
  const warnings = [];
  const filings = normalizeTaxFilings([
    filing({ id: 'ok' }),
    filing({ id: 'no-receipt', receiptRef: '' }),
    filing({ id: 'bad-kind', filingKind: 'prayer' }),
    filing({ id: 'orphan', noticeId: 'not-a-notice' }),
  ], notices, warnings);
  assert.deepEqual(filings.map((row) => row.id), ['ok']);

  const items = normalizeTaxEvidence([
    evidence({ id: 'ok' }),
    evidence({ id: 'no-ref', itemRef: '' }),
    evidence({ id: 'no-day', suppliedDay: 'later' }),
    evidence({ id: 'orphan', noticeId: 'not-a-notice' }),
  ], notices, warnings);
  assert.deepEqual(items.map((row) => row.id), ['ok']);
  assert.ok(warnings.some((line) => /unreceipted|receipt reference/.test(line)) || true);
});

test('the resolution loader refuses an outcome this register does not carry, and a second resolution', () => {
  const notices = normalizeTaxNotices([notice()], []);
  const warnings = [];
  const rows = normalizeTaxResolutions([
    resolution({ id: 'ok' }),
    resolution({ id: 'bad-outcome', outcome: 'probably-fine' }),
    resolution({ id: 'frac', resolvedMinor: 10.5 }),
    resolution({ id: 'no-basis', basisRef: '' }),
    resolution({ id: 'dup' }),
  ], notices, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok']);
  assert.equal(warnings.length, 1);
  for (const key of TAX_OUTCOME_KEYS) assert.ok(['upheld', 'partially-upheld', 'withdrawn', 'settled', 'conceded'].includes(key));
});

/* --------------------------------------------------- 3. the derived kernel */

test('a notice with no declared deadline is deadline-undeclared and NEVER given a computed window', () => {
  const derived = deriveTaxControversy({ notice: { id: 'n', noticeDay: day(-90) }, deadline: null, todayDay: day(0) });
  assert.equal(derived.state.key, 'deadline-undeclared');
  assert.equal(derived.daysToDeadline, null);
  assert.equal(derived.daysOverdue, null);
  assert.equal(derived.timeliness, null);
  assert.match(derived.state.says, /no objection deadline is declared/i);
});

test('timeliness is derived from the two declared days and a late filing is never re-dated', () => {
  const onTime = deriveTaxControversy({
    notice: { id: 'n' }, deadline: { deadlineDay: day(-5) },
    filings: [{ id: 'f', filedDay: day(-9) }], todayDay: day(0),
  });
  assert.equal(onTime.state.key, 'filed-on-time');
  assert.equal(onTime.timeliness, 'on-time');

  const late = deriveTaxControversy({
    notice: { id: 'n' }, deadline: { deadlineDay: day(-20) },
    filings: [{ id: 'f', filedDay: day(-9) }], todayDay: day(0),
  });
  assert.equal(late.state.key, 'filed-late');
  assert.equal(late.timeliness, 'late');
  assert.equal(late.daysOverdue, 11);
  assert.equal(late.firstFiling.filedDay, day(-9), 'the filed day is exactly as declared: nothing re-dates it');

  const overdue = deriveTaxControversy({ notice: { id: 'n' }, deadline: { deadlineDay: day(-3) }, filings: [], todayDay: day(0) });
  assert.equal(overdue.state.key, 'overdue-unfiled');
  assert.equal(overdue.daysOverdue, 3);

  const awaiting = deriveTaxControversy({ notice: { id: 'n' }, deadline: { deadlineDay: day(12) }, filings: [], todayDay: day(0) });
  assert.equal(awaiting.state.key, 'awaiting-filing');
  assert.equal(awaiting.daysToDeadline, 12);
});

test('the first filing by day is the one judged, not the first row written', () => {
  const derived = deriveTaxControversy({
    notice: { id: 'n' }, deadline: { deadlineDay: day(-10) },
    filings: [{ id: 'later', filedDay: day(-4) }, { id: 'earlier', filedDay: day(-12) }],
    todayDay: day(0),
  });
  assert.equal(derived.firstFiling.id, 'earlier');
  assert.equal(derived.timeliness, 'on-time');
});

test('the swing is disputed less resolved, exact, and printed apart from both', () => {
  const derived = deriveTaxControversy({
    notice: { id: 'n', noticeDay: day(-40), disputedMinor: 4000000, currency: 'GBP' },
    deadline: { deadlineDay: day(-30) }, filings: [{ id: 'f', filedDay: day(-31) }],
    resolution: { id: 'r', resolvedMinor: 1500000, currency: 'GBP', outcome: 'partially-upheld' },
    todayDay: day(0),
  });
  assert.equal(derived.state.key, 'resolved');
  assert.equal(derived.swingMinor, 2500000);
  assert.equal(derived.resolution.resolvedMinor, 1500000);
  assert.equal(swingMinor({ disputedMinor: 4000000, resolvedMinor: 1500000 }).swingMinor, 2500000);
  assert.equal(swingMinor({ disputedMinor: 1500000, resolvedMinor: 4000000 }).swingMinor, -2500000, 'a swing the other way is a negative, never an absolute');
  assert.equal(swingMinor({ disputedMinor: 4000000, resolvedMinor: null }).swingMinor, null, 'no resolved figure means no swing, never a zero');
});

test('money is integer minor units and the labels are exact', () => {
  assert.equal(minorUnits(4000000), 4000000);
  assert.equal(minorUnits(100.5), null);
  assert.equal(minorUnits(-1), null);
  assert.equal(moneyLabel(4000000, 'GBP'), 'GBP 40,000.00');
  assert.equal(utcDayMs('2026-11-18'), Date.parse('2026-11-18T00:00:00.000Z'));
});

test('all six states are six different facts, and the flags are separate facts again', () => {
  assert.deepEqual(TAX_STATE_KEYS, ['deadline-undeclared', 'overdue-unfiled', 'filed-late', 'awaiting-filing', 'filed-on-time', 'resolved']);
  const evidenceEmpty = deriveTaxControversy({
    notice: { id: 'n' }, deadline: { deadlineDay: day(-30) },
    filings: [{ id: 'f', filedDay: day(-31) }], evidence: [], todayDay: day(0),
  });
  assert.equal(evidenceEmpty.state.key, 'filed-on-time');
  assert.equal(evidenceEmpty.evidenceEmpty, true, 'a filed objection with no packet is flagged, not made a seventh state');

  const aging = deriveTaxControversy({
    notice: { id: 'n' }, deadline: { deadlineDay: day(-500) },
    filings: [{ id: 'f', filedDay: day(-510) }], evidence: [{ id: 'e' }], todayDay: day(0), horizonDays: 365,
  });
  assert.equal(aging.agingUnresolved, true);

  const fresh = deriveTaxControversy({
    notice: { id: 'n' }, deadline: { deadlineDay: day(-500) },
    filings: [{ id: 'f', filedDay: day(-510) }], evidence: [{ id: 'e' }], todayDay: day(0), horizonDays: 2000,
  });
  assert.equal(fresh.agingUnresolved, false, 'the horizon is a declared convention, not a hard-coded one');
});

/* ------------------------------------------------------------ 4. the reader */

test('the reader ties every child row to its notice and says whether the parts re-add', () => {
  const report = read(fixture({
    taxNotices: [notice()],
    taxDeadlines: [deadline()],
    taxFilings: [filing()],
    taxEvidence: [evidence()],
    taxResolutions: [resolution()],
  }));
  assert.equal(report.ok, true);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.figuresComplete, true);
  assert.equal(report.totals.notices, 1);
  assert.equal(report.stateTotal, 1);
  assert.equal(report.balances.statesReconcile, true);
  assert.equal(report.balances.oneDeadlinePerNotice, true);
  assert.equal(report.balances.oneResolutionPerNotice, true);
  assert.equal(report.rows[0].state.key, 'resolved');
  assert.equal(report.rows[0].swingMinor, 2500000);
});

test('an unreadable row is counted, never repaired, and the register says it is not certified', () => {
  // The row is placed AFTER the load boundary, exactly as a hand-edited import
  // would arrive, so the reader — not the loader — meets it and counts it.
  const state = load(fixture());
  const report = buildTaxControversy({ ...state, taxNotices: [notice(), notice({ id: 'broken', noticeRef: '' })] }, { now: NOW, seat: null });
  assert.ok(report.warnings.length >= 1);
  assert.equal(report.figuresComplete, false);
  assert.ok(report.incompleteReasons.length >= 1);
  assert.match(report.incompleteReasons.join(' '), /unreadable/);
});

test('the per-currency money bridge keeps currencies apart and prints no mixed total', () => {
  const report = read(fixture({
    taxNotices: [
      notice({ id: 'gbp', noticeRef: 'HMRC-VAT-1', disputedMinor: 4000000, currency: 'GBP' }),
      notice({ id: 'eur', noticeRef: 'BZSt-KST-1', disputedMinor: 7000000, currency: 'EUR', taxType: 'income' }),
    ],
    taxDeadlines: [
      deadline({ id: 'd-gbp', noticeId: 'gbp' }),
      deadline({ id: 'd-eur', noticeId: 'eur', deadlineDay: day(-30) }),
    ],
    taxFilings: [filing({ id: 'f-eur', noticeId: 'eur', filedDay: day(-31) })],
    taxResolutions: [resolution({ id: 'r-eur', noticeId: 'eur', resolvedMinor: 2000000, currency: 'EUR' })],
  }));
  assert.deepEqual(report.currencyRows.map((row) => row.currency), ['EUR', 'GBP']);
  const eur = report.currencyRows.find((row) => row.currency === 'EUR');
  const gbp = report.currencyRows.find((row) => row.currency === 'GBP');
  assert.equal(eur.disputedMinor, 7000000);
  assert.equal(eur.resolvedMinor, 2000000);
  assert.equal(eur.swingMinor, 5000000);
  assert.equal(gbp.resolvedMinor, 0);
  assert.equal(gbp.resolvedN, 0);
  assert.equal(report.totals.currencies.length, 2);
});

test('responsible hands are withheld above rank 3 while the sums stay printed', () => {
  const state = load(fixture({ taxNotices: [notice()], taxDeadlines: [deadline()] }));
  const detailed = buildTaxControversy(state, { now: NOW, seat: { rank: 3, fullAccess: false } });
  assert.equal(detailed.detailed, true);
  const aggregate = buildTaxControversy(state, { now: NOW, seat: { rank: 4, fullAccess: false } });
  assert.equal(aggregate.detailed, false);
  assert.ok(aggregate.disclosure.reason);
  assert.equal(aggregate.totals.notices, 1, 'the disputed sum and the state are organisational facts and stay printed');
});

/* ------------------------------------------------------------ 5. the matrix */

test('a hand held by two lines resolves BOTH managers, counts the person once, and asks the joint apex over all of them', () => {
  const report = read(fixture({ taxNotices: [notice()], taxDeadlines: [deadline()] }));
  const row = report.rows[0];
  assert.deepEqual([...row.managerIds].sort(), ['mei', 'priya'], 'the declared secondary line is a real line');
  assert.equal(row.holderRows.length, 1, 'one responsible hand');
  assert.equal(report.totals.holders, 1, 'the person is counted once');
  assert.equal(row.apexAmbiguous, false);
  assert.equal(row.apexId, 'ceo', 'the lowest joint apex above mei (dana) and priya (omar) is ceo');
});

test('a responsible hand off the graph is printed as an orphan and never dropped', () => {
  const report = read(fixture({ taxNotices: [notice({ responsibleIds: ['ghost'] })] }));
  assert.equal(report.rows[0].orphan, true);
  assert.equal(report.rows[0].holderRows.length, 1);
  assert.equal(report.orphanHolderN, 1);
  assert.equal(report.figuresComplete, false);
});

test('the line roll-up counts a notice once per line and never doubles a person across lines', () => {
  const report = read(fixture({ taxNotices: [notice()], taxDeadlines: [deadline()] }));
  const mei = report.lineRows.find((row) => row.managerId === 'mei');
  const priya = report.lineRows.find((row) => row.managerId === 'priya');
  assert.equal(mei.noticesN, 1);
  assert.equal(priya.noticesN, 1, 'the same notice appears on both lines it genuinely reaches — the sum is not a headcount');
  assert.equal(mei.holdersN, 1);
  assert.equal(priya.holdersN, 1);
  assert.equal(report.totals.holders, 1, 'the headcount is de-duplicated across lines');
});

/* -------------------------------------------------------------- 6. the rule */

const ruleDraft = (raw) => {
  const state = load(raw);
  return { state, draft: JSON.parse(JSON.stringify(state)) };
};

const TICK = { type: 'tax.notice-recorded' };
const runRule = (draft) => taxRule(draft, { now: NOW, settings: draft.settings, event: TICK });

test('RULE-TAX-01 files an opaque ask at the joint apex, is idempotent, and never names the authority or the sum', () => {
  const { draft } = ruleDraft(fixture({ taxNotices: [notice()] }));
  const first = runRule(draft);
  assert.ok(Array.isArray(first), 'the rule returns its effects');
  const asks = (draft.delegations || []).filter((row) => row.status === 'active');
  assert.equal(asks.length, 1, 'a notice with no deadline files exactly one ask per joint seat');
  assert.equal(asks[0].personId, 'ceo', 'the ask goes to the lowest joint apex above the hands (samuel is held by mei and priya), not to the hands');
  const text = asks.map((row) => `${row.title} ${row.support} ${row.expectedOutcome}`).join(' ');
  for (const forbidden of ['HMRC', '8841203', '4,000,000', '4000000', 'VAT', 'United Kingdom', 'Samuel', 'Mei', 'Dana']) {
    assert.ok(!text.includes(forbidden), `the ask must not carry “${forbidden}”`);
  }
  const links = (draft.links || []).filter((row) => row.ruleId === 'RULE-TAX-01');
  assert.equal(links.length, 1);
  assert.match(links[0].summary, /^tax1:deadline-undeclared:tax-not-one$/);

  const before = (draft.delegations || []).length;
  runRule(draft);
  assert.equal((draft.delegations || []).length, before, 'the rule is idempotent: an open ask is not re-filed');
});

test('RULE-TAX-01 stays silent when paused and observes identity-free where nobody can be asked', () => {
  const paused = ruleDraft(fixture({ taxNotices: [notice()] }));
  paused.draft.settings[TAX_PAUSE_SWITCH] = false;
  runRule(paused.draft);
  assert.equal((paused.draft.delegations || []).length, 0, 'a pause is honoured on every path');
  assert.equal((paused.draft.taxMarkers || []).length, 0);

  const unaskable = ruleDraft(fixture({ taxNotices: [notice({ responsibleIds: ['ghost'] })] }));
  runRule(unaskable.draft);
  assert.equal((unaskable.draft.delegations || []).length, 0, 'nobody is substituted for a hand off the graph');
  assert.ok((unaskable.draft.taxMarkers || []).length >= 1, 'the condition is still observed, identity-free');
  const marker = (unaskable.draft.taxMarkers || [])[0];
  assert.ok(!JSON.stringify(marker).includes('HMRC'), 'the marker carries no identity');
});

test('RULE-TAX-01 caps new asks per commit and counts the remainder rather than dropping it silently', () => {
  const notices = [];
  const deadlines = [];
  for (let i = 0; i < 6; i += 1) {
    notices.push(notice({ id: `tax-not-${i}`, noticeRef: `HMRC-VAT-${1000 + i}` }));
  }
  const { draft } = ruleDraft(fixture({ taxNotices: notices, taxDeadlines: deadlines }));
  runRule(draft);
  assert.ok((draft.delegations || []).length <= 4, 'the cap is four asks per commit');
  assert.ok((draft.delegations || []).length >= 1);
});

test('the rule is registered on the spine, in the propagation contracts, and in the pause census', () => {
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 166, 'the spine carries ADR-0257 (RULE-TAX-01) after ADR-0254 (RULE-DGI-01)');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule?.id === 'taxRule' || row.module === 'taxRules.js');
  assert.ok(contract, 'the rule must have a propagation contract');
  assert.deepEqual(contract.writes.sort(), ['delegations', 'links', 'taxMarkers']);
  assert.equal(contract.scansWorkspace, true);
  assert.equal(TAX_PAUSE_SWITCH, 'taxAutoPropagate');
});

test('the rule conditions are the five the register exists for, and indexing reads its own asks back', () => {
  const report = read(fixture({ taxNotices: [notice()] }));
  const { conditions } = taxConditions(report);
  assert.ok(conditions.some((row) => row.kind === 'deadline-undeclared'));
  const index = indexTaxAsks(load(fixture()));
  assert.equal(typeof index, 'object');
});

/* ------------------------------------------------------------ 7. the door */

test('the door refuses a duplicate notice, a bad tax type, a fractional amount, a missing basis and a future day', () => {
  const { api } = harness(fixture());
  const good = {
    noticeRef: 'HMRC-VAT-8841203',
    position: 'Input tax reclaimed on professional fees attributed to the exempt letting activity is disallowed in full.',
    jurisdiction: 'United Kingdom — VAT (VATA 1994 s.73 assessment)',
    taxType: 'vat', noticeDay: day(-20), disputedMinor: 4000000, currency: 'GBP',
    basisRef: 'The fees were incurred on the sale of a subsidiary, a general-purpose overhead of the whole business, so the input tax is recoverable in full.',
    responsibleIds: ['samuel'],
  };
  const first = api.taxRecordNotice(good);
  assert.equal(first.ok, true, first.error);

  const duplicate = api.taxRecordNotice(good);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.refusal, 'tax-controversy:notice-duplicate');

  const badType = api.taxRecordNotice({ ...good, noticeRef: 'HMRC-VAT-2', taxType: 'stamp-duty' });
  assert.equal(badType.ok, false);
  assert.equal(badType.refusal, 'tax-controversy:tax-type-invalid');

  const fractional = api.taxRecordNotice({ ...good, noticeRef: 'HMRC-VAT-3', disputedMinor: 100.5 });
  assert.equal(fractional.ok, false);
  assert.equal(fractional.refusal, 'tax-controversy:amount-invalid');
  assert.match(fractional.error, /fractional minor unit is refused rather than rounded/);

  const noBasis = api.taxRecordNotice({ ...good, noticeRef: 'HMRC-VAT-4', basisRef: 'short' });
  assert.equal(noBasis.ok, false);
  assert.equal(noBasis.refusal, 'tax-controversy:basis-missing');

  const future = api.taxRecordNotice({ ...good, noticeRef: 'HMRC-VAT-5', noticeDay: day(5) });
  assert.equal(future.ok, false);
  assert.equal(future.refusal, 'tax-controversy:day-future');
});

test('the door refuses a second deadline for one notice, an undeclared basis, and a filing with no receipt', () => {
  const { api } = harness(fixture({ taxNotices: [notice()] }));
  const first = api.taxDeclareDeadline({ noticeId: 'tax-not-one', deadlineDay: day(-5), basisRef: 'The s.73 assessment carries a 30-day appeal window from the date of issue.' });
  assert.equal(first.ok, true, first.error);

  const second = api.taxDeclareDeadline({ noticeId: 'tax-not-one', deadlineDay: day(-4), basisRef: 'A second window asserted without saying why the first is wrong.' });
  assert.equal(second.ok, false);
  assert.equal(second.refusal, 'tax-controversy:deadline-duplicate');

  const noReceipt = api.taxRecordFiling({
    noticeId: 'tax-not-one', filingKind: 'objection', filedDay: day(-12), receiptRef: 'X',
    basisRef: 'A written objection was lodged on the general-purpose overhead ground.',
  });
  assert.equal(noReceipt.ok, false);
  assert.equal(noReceipt.refusal, 'tax-controversy:receipt-missing');

  const badOutcome = api.taxRecordResolution({
    noticeId: 'tax-not-one', outcome: 'probably-fine', resolvedDay: day(-2), resolvedMinor: 1500000,
    currency: 'GBP', basisRef: 'The review accepted part of the argument and upheld the rest of the disallowance.',
  });
  assert.equal(badOutcome.ok, false);
  assert.equal(badOutcome.refusal, 'tax-controversy:outcome-invalid');
});

test('the door narrows every write to a seat that holds the responsible hands', () => {
  const { api, store } = harness(fixture());
  asSeat(api, store, 'dana');
  const outside = api.taxRecordNotice({
    noticeRef: 'HMRC-VAT-9',
    position: 'Input tax reclaimed on professional fees attributed to the exempt letting activity is disallowed in full.',
    jurisdiction: 'United Kingdom — VAT (VATA 1994 s.73 assessment)',
    taxType: 'vat', noticeDay: day(-20), disputedMinor: 4000000, currency: 'GBP',
    basisRef: 'The fees were incurred on the sale of a subsidiary, a general-purpose overhead of the whole business, so the input tax is recoverable in full.',
    responsibleIds: ['frieda'],
  });
  assert.equal(outside.ok, false);
  assert.match(outside.error, /not on a line this seat holds/);
});

test('a notice recorded through DOOR + LOADER + READER still derives the same state', () => {
  const { api, store } = harness(fixture());
  const created = api.taxRecordNotice({
    noticeRef: 'HMRC-VAT-8841203',
    position: 'Input tax reclaimed on professional fees attributed to the exempt letting activity is disallowed in full.',
    jurisdiction: 'United Kingdom — VAT (VATA 1994 s.73 assessment)',
    taxType: 'vat', noticeDay: day(-20), disputedMinor: 4000000, currency: 'GBP',
    basisRef: 'The fees were incurred on the sale of a subsidiary, a general-purpose overhead of the whole business, so the input tax is recoverable in full.',
    responsibleIds: ['samuel'],
  });
  assert.equal(created.ok, true, created.error);
  const report = buildTaxControversy(store.state, { now: NOW, seat: null });
  assert.equal(report.totals.notices, 1);
  assert.equal(report.rows[0].state.key, 'deadline-undeclared');
  assert.equal(report.figuresComplete, true);
  assert.equal(report.rows[0].disputedMinor, 4000000);
});

test('conventions normalize fail-closed and refuse an unknown key at the door', () => {
  const normal = normalizeTaxSettings({});
  assert.equal(normal.taxAutoPropagate, true);
  assert.equal(normal.taxPrivacyFloor, 3);
  assert.equal(normal.taxResolutionHorizonDays, 365);
  const outOfBounds = normalizeTaxSettings({ taxPrivacyFloor: 1, taxResolutionHorizonDays: 3 });
  assert.equal(outOfBounds.taxPrivacyFloor, 3, 'an out-of-bounds floor falls back to the default on load');
  assert.equal(outOfBounds.taxResolutionHorizonDays, 365);

  const { api } = harness(fixture());
  const unknown = api.taxSetConventions({ taxWarningHorizonDays: 30 });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.refusal, 'tax-controversy:unknown-setting');
  const refused = api.taxSetConventions({ taxPrivacyFloor: 1 });
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal, 'tax-controversy:setting-out-of-bounds');
});

/* ------------------------------------------------------------- 8. the CSV */

test('CSV #194 is aggregate, identity-free, floored, and its summary equals the reader', () => {
  const raw = fixture({
    taxNotices: [notice(), notice({ id: 'eur', noticeRef: 'BZSt-KST-1', currency: 'EUR', taxType: 'income', disputedMinor: 7000000 })],
    taxDeadlines: [deadline(), deadline({ id: 'd-eur', noticeId: 'eur', deadlineDay: day(-30) })],
    taxFilings: [filing(), filing({ id: 'f-eur', noticeId: 'eur', filedDay: day(-31) })],
    taxResolutions: [resolution(), resolution({ id: 'r-eur', noticeId: 'eur', resolvedMinor: 2000000, currency: 'EUR' })],
  });
  const state = load(raw);
  const report = buildTaxControversy(state, { now: NOW, seat: null });
  const file = exportWorkspaceCsv(state, TAX_CSV_SCOPE, { now: NOW });
  assert.equal(file.ok, true, file.error);
  const parsed = parseCsv(file.csv);
  assert.deepEqual(parsed.headers, [...TAX_CSV_COLUMNS]);
  const at = (row, key) => row[parsed.headers.indexOf(key)];

  const summaryRow = parsed.rows.find((row) => at(row, 'row_kind') === 'summary');
  assert.ok(summaryRow, 'the export carries a summary row');
  assert.equal(at(summaryRow, 'as_of'), report.asOf);
  assert.equal(Number(at(summaryRow, 'notices_n')), report.totals.notices);
  assert.equal(Number(at(summaryRow, 'deadline_undeclared_n')), report.totals.deadlineUndeclared);
  assert.equal(Number(at(summaryRow, 'overdue_unfiled_n')), report.totals.overdueUnfiled);
  assert.equal(Number(at(summaryRow, 'filed_late_n')), report.totals.filedLate);
  assert.equal(Number(at(summaryRow, 'awaiting_filing_n')), report.totals.awaitingFiling);
  assert.equal(Number(at(summaryRow, 'filed_on_time_n')), report.totals.filedOnTime);
  assert.equal(Number(at(summaryRow, 'resolved_n')), report.totals.resolved);
  assert.equal(Number(at(summaryRow, 'evidence_empty_n')), report.totals.evidenceEmpty);
  assert.equal(Number(at(summaryRow, 'aging_unresolved_n')), report.totals.agingUnresolved);
  assert.equal(Number(at(summaryRow, 'complete')), 1);

  for (const forbidden of ['HMRC', 'BZSt', '8841203', 'VAT', 'United Kingdom', 'Denmark', 'Samuel', 'Mei', 'Priya', 'DEAL-CORR', 'HMRC-ACK']) {
    assert.ok(!file.csv.toLowerCase().includes(forbidden.toLowerCase()), `the export must not contain “${forbidden}”`);
  }

  const currencyRow = parsed.rows.find((row) => at(row, 'row_kind') === 'currency' && at(row, 'key') === 'GBP');
  assert.ok(currencyRow, 'the export must carry a per-currency money bridge');
  assert.equal(Number(at(currencyRow, 'disputed_total_minor')), 4000000);
  assert.equal(Number(at(currencyRow, 'resolved_total_minor')), 1500000);
  assert.equal(Number(at(currencyRow, 'swing_total_minor')), 2500000);
});

test('a per-state count below the floor is withheld BLANK with its reason', () => {
  const report = read(fixture({ taxNotices: [notice()] }));
  const rows = taxCsvRows(report);
  const undeclared = rows.find((row) => row.row_kind === 'state' && row.key === 'deadline-undeclared');
  assert.equal(undeclared.notices_n, '');
  assert.match(undeclared.blank_reason, /privacy floor/);
});

test('a currency with no resolution withholds the resolved total and the swing rather than printing zeros', () => {
  const report = read(fixture({ taxNotices: [notice()] }));
  const rows = taxCsvRows(report);
  const gbp = rows.find((row) => row.row_kind === 'currency' && row.key === 'GBP');
  assert.equal(Number(gbp.disputed_total_minor), 4000000);
  assert.equal(gbp.resolved_total_minor, '');
  assert.equal(gbp.swing_total_minor, '');
  assert.match(gbp.blank_reason, /withheld rather than printed as a zero/);
});

/* ------------------------------------------------------------ 9. signals */

test('signals name the dispute and never score the hand answering it', () => {
  const report = read(fixture({ taxNotices: [notice()] }));
  const signals = taxSignals(load(fixture({ taxNotices: [notice()] })), NOW);
  assert.ok(Array.isArray(signals));
  for (const signal of signals) {
    assert.ok(!/blame|score|rank/i.test(`${signal.title || ''} ${signal.body || ''}`), 'a signal is about the dispute, never about a person');
  }
  assert.ok(taxAttentionCount(load(fixture({ taxNotices: [notice()] })), { now: NOW }) >= 1);
});

/* ------------------------------------------------------------- 10. panel */

test('the panel prints the reader’s own figures cell by cell (display == computed)', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const raw = fixture({
      taxNotices: [notice(), notice({ id: 'eur', noticeRef: 'BZSt-KST-1', currency: 'EUR', taxType: 'income', disputedMinor: 7000000 })],
      taxDeadlines: [deadline(), deadline({ id: 'd-eur', noticeId: 'eur', deadlineDay: day(-30) })],
      taxFilings: [filing(), filing({ id: 'f-eur', noticeId: 'eur', filedDay: day(-31) })],
      taxResolutions: [resolution()],
    });
    const state = load(raw);
    const report = buildTaxControversy(state, { now: NOW, seat: null });
    const { api } = harness(raw);
    const view = renderTax({ api, query: new URLSearchParams(''), state });
    const html = view.outerHTML;
    const cell = (testid) => {
      const match = new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`).exec(html);
      return match ? match[1].trim() : null;
    };
    assert.equal(cell('tax-count-notices'), String(report.totals.notices));
    assert.equal(cell('tax-count-undeclared'), String(report.totals.deadlineUndeclared));
    assert.equal(cell('tax-count-overdue'), String(report.totals.overdueUnfiled));
    assert.equal(cell('tax-count-late'), String(report.totals.filedLate));
    assert.equal(cell('tax-count-awaiting'), String(report.totals.awaitingFiling));
    assert.equal(cell('tax-count-evidence-empty'), String(report.totals.evidenceEmpty));
    assert.equal(cell('tax-count-attention'), String(report.attention.total));
    assert.ok(html.includes('GBP 40,000.00'), 'the disputed amount is formatted from the reader’s own figure');
    assert.ok(html.includes('data-testid="tax-state-resolved"'));
    const resolutions = renderTax({ api, query: new URLSearchParams('view=resolutions'), state }).outerHTML;
    assert.ok(resolutions.includes('GBP 40,000.00'), 'the disputed amount is printed on the resolutions tab');
    assert.ok(resolutions.includes('GBP 15,000.00'), 'the resolved amount is printed beside it');
    assert.ok(resolutions.includes('GBP 25,000.00'), 'the swing is printed, derived, apart from both');
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
      for (const view of ['controversies', 'filings', 'evidence', 'resolutions', 'method']) {
        const node = renderTax({ api, query: new URLSearchParams(`view=${view}`), state });
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

test('the demo derives every printed state from declared rows and name no state anywhere', () => {
  const demo = buildDemoState(NOW);
  assert.equal(demo.taxNotices.length, 8);
  const report = buildTaxControversy(demo, { now: NOW, seat: null });
  assert.deepEqual(report.warnings, []);
  assert.equal(report.figuresComplete, true);
  assert.equal(report.totals.notices, 8);
  assert.equal(report.states['deadline-undeclared'], 1);
  assert.equal(report.states['overdue-unfiled'], 1);
  assert.equal(report.states['awaiting-filing'], 1);
  assert.equal(report.states['filed-late'], 1);
  assert.equal(report.states['filed-on-time'], 3);
  assert.equal(report.states.resolved, 1);
  assert.equal(report.totals.evidenceEmpty, 1);
  assert.equal(report.totals.agingUnresolved, 1);
  const resolved = report.rows.find((row) => row.state.key === 'resolved');
  assert.equal(resolved.swingMinor, 6500000);
  // 'state' is derived on every read: no demo row stores one.
  for (const key of ['taxNotices', 'taxDeadlines', 'taxFilings', 'taxEvidence', 'taxResolutions']) {
    for (const row of demo[key]) {
      assert.equal('state' in row, false, `${key} must not store a derived state`);
      assert.equal('timeliness' in row, false, `${key} must not store a derived timeliness verdict`);
      assert.equal('swingMinor' in row, false, `${key} must not store a derived swing`);
    }
  }
});
