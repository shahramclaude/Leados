// ADR-0248 — Claim, Limitation & Settlement-Authority Register (Schema v202).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — seven empty ledgers and three declared
//      conventions, and no claim inferred from a permit, a grievance, an incident,
//      a regulatory undertaking or a risk on the register;
//   2. the loaders are FAIL-CLOSED — a matter with no document reference, an accrual
//      with no written rule, a settlement with no exact amount, a reversed stay, a
//      second accrual for one matter, an amount on an outcome that takes none and a
//      date of knowledge that precedes the damage are all DROPPED with counted
//      warnings and never repaired;
//   3. an UNPROVED stay is KEPT and moves NOTHING — deleting the allegation would
//      erase the belief while leaving the deadline that belief moved;
//   4. the arithmetic is EXACT — a limitation period is whole calendar months with the
//      end-of-month clamp, a stay span is inclusive of both days, overlapping stays
//      merge rather than double-count, money is integer minor units, and days are UTC;
//   5. the CLOCK RUNS FROM THE LATER OF THE DAMAGE AND THE DATE OF KNOWLEDGE, which is
//      what a knowledge-based cause of action actually accrues from;
//   6. all NINE STATES are nine different facts, and a matter with no readable accrual
//      prints `clock-unprovable` with NO day count rather than a plausible default;
//   7. SETTLEMENT AUTHORITY IS COMPUTED from the reporting graph — the joint apex over
//      every responsible line — and a settlement above it is KEPT and the gap printed;
//   8. the MATRIX is correct — every active line holding every responsible hand is
//      resolved, a person is counted once, and the joint apex is over ALL of them;
//   9. RULE-LFG-01 is idempotent, capped, self-closing, pause-governed on every path,
//      OPAQUE in its ask text (the register is privileged material) and observes
//      identity-free where nobody can be asked;
//  10. the DOOR refuses a duplicate live matter, a holder outside the seat, a second
//      accrual, a declared `proved` flag, a settlement with no amount, a withdrawal
//      carrying one, and a merger that names nobody;
//  11. the CSV boundary is aggregate, identity-free and floored, and its summary equals
//      the reader's own totals;
//  12. the panel prints the reader's own figures cell by cell (display == computed).

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
import { buildClaims, deriveLfgClock, deriveLfgSettlement, claimSignals, claimAttentionCount } from '../../app/core/domain/lfgClaims.js';
import {
  normalizeLfgAccruals,
  normalizeLfgAuthorityGrants,
  normalizeLfgConcessions,
  normalizeLfgMatters,
  normalizeLfgResolutions,
  normalizeLfgSettings,
  normalizeLfgStays,
} from '../../app/core/domain/lfgSchema.js';
import {
  addMonthsUtc,
  daysOver,
  daysRemaining,
  limitationDeadline,
  minorUnits,
  staySpanDays,
  utcDayMs,
  wholeDaysBetween,
} from '../../app/core/domain/lfgMath.js';
import {
  claimConditions,
  claimRule,
  indexClaimAsks,
  lfgAskSignature,
  LFG_PAUSE_SWITCH,
} from '../../app/core/domain/lfgRules.js';
import {
  LFG_CSV_COLUMNS,
  LFG_CSV_SCOPE,
  LFG_CLAIM_TYPE_BY_KEY,
  LFG_SETTING_KEYS,
  LFG_STATE_KEYS,
} from '../../app/core/domain/lfgRegistry.js';
import { claimCsvRows } from '../../app/core/domain/lfgReport.js';
import { renderClaims } from '../../app/views/claims.js';

const NOW = new Date('2026-11-17T09:00:00.000Z');
const T0 = NOW.toISOString();
const iso = (value) => new Date(value).toISOString();
const day = (offset) => {
  const d = new Date(NOW.getTime() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
};

/* ---------------------------------------------------------------- fixtures */

function person(id, name, level, managerId) {
  return { id, name, role: level, level, managerId, status: 'active', startDate: iso('2024-01-01T00:00:00.000Z'), createdAt: iso('2024-01-01T00:00:00.000Z'), updatedAt: iso('2024-01-01T00:00:00.000Z') };
}

function line(id, personId, managerId, kind = 'function') {
  return { id, personId, managerId, kind, shareH: null, rights: [], fromISO: iso('2024-01-01T00:00:00.000Z'), toISO: null, declaredAt: iso('2024-01-01T00:00:00.000Z'), note: '', status: 'active', history: [] };
}

/**
 * The matrix the fixture builds is deliberately two-line:
 *
 *   ceo (chief)
 *    ├── dana (director)
 *    │     └── mei (manager) ── home line for samuel
 *    └── omar (director)
 *          └── priya (manager) ── joint apex over mei and priya's line
 *    samuel ── home manager mei
 *    frieda ── home manager priya
 *
 * samuel and frieda are BOTH responsible for `m-two`, so the apex above their two
 * managers' lines is priya's line + mei's line → dana/omar → ceo. The fixture's
 * grants make that apex resolvable, which is the point: the ceiling is computed.
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
  openedAt: iso('2026-01-01T09:00:00.000Z'),
  mergedIntoId: null,
  createdAt: iso('2026-01-01T09:00:00.000Z'),
  updatedAt: iso('2026-01-01T09:00:00.000Z'),
  ...overrides,
});

const accrual = (overrides = {}) => ({
  id: 'a-one',
  matterId: 'm-one',
  accrualDay: '2026-01-01',
  accrualRule: 'The breach accrued on the day the final delivery under clause 9.2 was not made.',
  knowledgeDay: null,
  periodMonths: 12,
  declaredById: 'mei',
  createdAt: iso('2026-01-02T09:00:00.000Z'),
  ...overrides,
});

const stay = (overrides = {}) => ({
  id: 's-one',
  matterId: 'm-one',
  kind: 'court-order',
  instrumentRef: 'ORD-2026-001 — order of the Commercial Court staying the claim',
  parties: [],
  fromDay: '2026-02-01',
  toDay: '2026-02-10',
  recordedById: 'mei',
  note: '',
  createdAt: iso('2026-02-11T09:00:00.000Z'),
  ...overrides,
});

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildClaims(load(raw), { now: NOW, seat: null, ...opts });

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

test('schema v202 is additive: seven empty ledgers, three conventions, nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 211, 'ADR-0259 (cash covenant evidence) is the current head');
  const keys = ['lfgMatters', 'lfgAccruals', 'lfgStays', 'lfgResolutions', 'lfgConcessions', 'lfgAuthorityGrants', 'lfgMarkers'];
  for (const key of keys) assert.ok(COLLECTIONS.includes(key), `${key} must be a declared collection`);
  const empty = createEmptyState(T0);
  for (const key of keys) assert.deepEqual(empty[key], [], `${key} must be empty on a fresh workspace`);
  assert.equal(empty.settings.lfgAutoPropagate, true);
  assert.equal(empty.settings.lfgPrivacyFloor, 3);
  assert.equal(empty.settings.lfgWarningHorizonDays, 90);
});

test('migrating a v201 workspace adds seven empty ledgers and infers no claim and no deadline', () => {
  const base = createEmptyState(T0);
  base.schemaVersion = 201;
  base.ltoAuthorisations = [{ id: 'lto-x', siteRef: 'Tank farm' }];
  base.settlements = [{ id: 'stl-x' }];
  for (const key of ['lfgMatters', 'lfgAccruals', 'lfgStays', 'lfgResolutions', 'lfgConcessions', 'lfgAuthorityGrants', 'lfgMarkers']) delete base[key];
  const migrated = migrate(base).raw;
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(migrated.lfgMatters, [], 'a statutory authority is not a claim asserted by a third party');
  assert.deepEqual(migrated.lfgAccruals, [], 'no accrual is inferred from anything on the record');
  assert.equal(migrated.settings.lfgAutoPropagate, true);
});

/* -------------------------------------------------------------- 2. loaders */

test('the loader drops a matter with no document, no party, no forum, a bad currency or a partial holder list', () => {
  const warnings = [];
  const rows = normalizeLfgMatters([
    matter({ id: 'ok' }),
    matter({ id: 'no-ref', matterRef: '' }),
    matter({ id: 'short-ref', matterRef: 'CLM-1' }),
    matter({ id: 'no-party', partyRef: 'ab' }),
    matter({ id: 'no-forum', forumRef: '' }),
    matter({ id: 'bad-cur', currency: 'POUNDS' }),
    matter({ id: 'partial', responsibleIds: ['samuel', ''] }),
    matter({ id: 'empty-holders', responsibleIds: [] }),
    matter({ id: 'dup', ...{} }),
    matter({ id: 'dup' }),
    matter({ id: 'frac-claim', claimedMinor: 1234.5 }),
    matter({ id: 'no-open', openedById: '' }),
  ], warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok', 'dup']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /dropped/);
  assert.match(warnings[0], /Nothing was repaired/);
});

test('the loader drops an accrual with no written rule, a bad period, a second accrual for one matter, or knowledge before damage', () => {
  const matters = normalizeLfgMatters([matter(), matter({ id: 'm-two', matterRef: 'CLM-2026-0002 — second letter before action', claimedMinor: 100000 })], []);
  const warnings = [];
  const rows = normalizeLfgAccruals([
    accrual({ id: 'ok' }),
    accrual({ id: 'no-rule', matterId: 'm-two', accrualRule: 'too short' }),
    accrual({ id: 'no-period', matterId: 'm-two', periodMonths: 0 }),
    accrual({ id: 'frac-period', matterId: 'm-two', periodMonths: 1.5 }),
    accrual({ id: 'second-for-m-one' }),
    accrual({ id: 'knowledge-before', matterId: 'm-two', claimTypeFake: true, knowledgeDay: '2025-12-01' }),
    accrual({ id: 'orphan', matterId: 'not-a-matter' }),
  ], matters, warnings);
  // `ok` wins m-one; `second-for-m-one` is dropped as ambiguous; knowledge-before is
  // dropped because 2025-12-01 precedes the 2026-01-01 damage day.
  assert.deepEqual(rows.map((row) => row.id), ['ok']);
  assert.ok(warnings.some((line) => /accrual row\(s\) could not be read exactly/.test(line)));
  assert.ok(warnings.some((line) => /name a matter that is not on the record/.test(line)));
});

test('an UNPROVED stay is KEPT and says exactly what is missing — it is never deleted', () => {
  const matters = normalizeLfgMatters([matter()], []);
  const warnings = [];
  const rows = normalizeLfgStays([
    // A standstill naming only one party is NOT proved.
    stay({ id: 'alleged', kind: 'standstill-agreement', parties: ['Northgate Supplies Ltd'] }),
    // The same standstill with both parties named IS proved.
    stay({ id: 'proved', kind: 'standstill-agreement', parties: ['Northgate Supplies Ltd', 'The organisation'] }),
    stay({ id: 'reversed', fromDay: '2026-03-10', toDay: '2026-03-01' }),
    stay({ id: 'unknown-kind', kind: 'vibes' }),
    stay({ id: 'no-instrument', instrumentRef: '' }),
  ], matters, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['alleged', 'proved']);
  const alleged = rows.find((row) => row.id === 'alleged');
  assert.equal(alleged.proved, false);
  assert.deepEqual(alleged.missing, ['both parties named as signatories to the standstill']);
  assert.equal(alleged.spanDays, 10, 'both ends inclusive: 1 Feb to 10 Feb is 10 days');
  assert.equal(rows.find((row) => row.id === 'proved').proved, true);
  assert.ok(warnings.some((line) => /stay row\(s\) could not be read exactly/.test(line)));
});

test('a resolution requiring an amount is dropped without one, and a withdrawal carrying one is dropped', () => {
  const matters = normalizeLfgMatters([matter()], []);
  const warnings = [];
  const rows = normalizeLfgResolutions([
    { id: 'settled-ok', matterId: 'm-one', kind: 'settled', resolvedDay: '2026-05-01', amountMinor: 100000, currency: 'GBP', basisRef: 'Settlement agreement dated at mediation, full and final.', recordedById: 'mei', createdAt: T0 },
    { id: 'settled-no-amount', matterId: 'm-one', kind: 'settled', resolvedDay: '2026-05-01', amountMinor: null, currency: 'GBP', basisRef: 'Settlement agreement dated at mediation, full and final.', recordedById: 'mei', createdAt: T0 },
  ], matters, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['settled-ok']);
  assert.ok(warnings.some((line) => /resolution row\(s\) could not be read exactly/.test(line)));

  const second = normalizeLfgResolutions([
    { id: 'wd-ok', matterId: 'm-one', kind: 'withdrawn', resolvedDay: '2026-05-01', amountMinor: null, currency: null, basisRef: 'Claim discontinued by the claimant with no order as to costs.', recordedById: 'mei', createdAt: T0 },
  ], matters, []);
  assert.equal(second.length, 1);
  const third = normalizeLfgResolutions([
    { id: 'wd-money', matterId: 'm-one', kind: 'withdrawn', resolvedDay: '2026-05-01', amountMinor: 500, currency: 'GBP', basisRef: 'Claim discontinued by the claimant with no order as to costs.', recordedById: 'mei', createdAt: T0 },
  ], matters, []);
  assert.equal(third.length, 0, 'a withdrawal that pays money would print money against an outcome that paid none');
});

test('a concession with a fractional amount, or no basis, is dropped and never rounded into a total', () => {
  const matters = normalizeLfgMatters([matter()], []);
  const warnings = [];
  const rows = normalizeLfgConcessions([
    { id: 'ok', matterId: 'm-one', kind: 'reserve-set', atDay: '2026-03-01', amountMinor: 250000, currency: 'GBP', basisRef: 'Reserve set on the pleaded loss at the first assessment.', recordedById: 'mei', createdAt: T0 },
    { id: 'frac', matterId: 'm-one', kind: 'payments-on-account', atDay: '2026-03-02', amountMinor: 25.5, currency: 'GBP', basisRef: 'Interim payment made pending the expert report.', recordedById: 'mei', createdAt: T0 },
    { id: 'no-basis', matterId: 'm-one', kind: 'offer-made', atDay: '2026-03-03', amountMinor: 1000, currency: 'GBP', basisRef: '', recordedById: 'mei', createdAt: T0 },
    { id: 'unknown-kind', matterId: 'm-one', kind: 'goodwill', atDay: '2026-03-04', amountMinor: 1000, currency: 'GBP', basisRef: 'A kind this register does not carry at all.', recordedById: 'mei', createdAt: T0 },
  ], matters, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok']);
  assert.ok(warnings.some((line) => /whole number of minor units/.test(line)));
});

test('an authority grant needs a person, a ceiling and a written basis — and is dropped otherwise', () => {
  const warnings = [];
  const rows = normalizeLfgAuthorityGrants([
    { id: 'ok', personId: 'samuel', scopeRef: 'Operational claims', currency: 'GBP', ceilingMinor: 5000000, basisRef: 'Standing delegation from the board within the stated ceiling.', declaredById: 'mei', declaredAt: T0, createdAt: T0 },
    { id: 'no-ceiling', personId: 'samuel', scopeRef: 'Operational claims', currency: 'GBP', ceilingMinor: null, basisRef: 'Standing delegation from the board within the stated ceiling.', declaredById: 'mei', createdAt: T0 },
    { id: 'no-person', personId: '', scopeRef: 'Operational claims', currency: 'GBP', ceilingMinor: 100, basisRef: 'Standing delegation from the board within the stated ceiling.', declaredById: 'mei', createdAt: T0 },
  ], warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok']);
  assert.ok(warnings.length >= 1);
});

/* ------------------------------------------------------------- 3. arithmetic */

test('the limitation period is whole calendar months with the end-of-month clamp', () => {
  const jan31 = utcDayMs('2025-01-31T00:00:00.000Z');
  assert.equal(new Date(addMonthsUtc(jan31, 1)).toISOString().slice(0, 10), '2025-02-28');
  assert.equal(new Date(addMonthsUtc(jan31, 13)).toISOString().slice(0, 10), '2026-02-28', 'a non-leap February clamps to 28');
  const leap = utcDayMs('2024-01-31T00:00:00.000Z');
  assert.equal(new Date(addMonthsUtc(leap, 1)).toISOString().slice(0, 10), '2024-02-29', 'a leap February clamps to 29');
  assert.equal(new Date(addMonthsUtc(utcDayMs('2026-03-31T00:00:00.000Z'), 1)).toISOString().slice(0, 10), '2026-04-30');
  assert.equal(addMonthsUtc(null, 1), null);
  assert.equal(addMonthsUtc(jan31, 1.5), null);
});

test('a stay span is inclusive, overlapping stays merge, and the deadline adds the exact days', () => {
  assert.equal(staySpanDays('2026-02-01T00:00:00.000Z', '2026-02-10T00:00:00.000Z'), 10);
  assert.equal(staySpanDays('2026-02-10T00:00:00.000Z', '2026-02-01T00:00:00.000Z'), null, 'a reversed span is not a span');
  const base = { accrualMs: utcDayMs('2026-01-01T00:00:00.000Z'), periodMonths: 6 };
  const none = limitationDeadline(base);
  assert.equal(new Date(none.deadlineMs).toISOString().slice(0, 10), '2026-07-01');
  assert.equal(none.suspendedDays, 0);

  const one = limitationDeadline({ ...base, stays: [{ fromMs: utcDayMs('2026-02-01T00:00:00.000Z'), toMs: utcDayMs('2026-02-10T00:00:00.000Z') }] });
  assert.equal(one.suspendedDays, 10);
  assert.equal(new Date(one.deadlineMs).toISOString().slice(0, 10), '2026-07-11');

  // Two CONCURRENT stays suspend the clock once, not twice.
  const overlap = limitationDeadline({
    ...base,
    stays: [
      { fromMs: utcDayMs('2026-02-01T00:00:00.000Z'), toMs: utcDayMs('2026-02-10T00:00:00.000Z') },
      { fromMs: utcDayMs('2026-02-05T00:00:00.000Z'), toMs: utcDayMs('2026-02-15T00:00:00.000Z') },
    ],
  });
  assert.equal(overlap.suspendedDays, 15, '1 Feb to 15 Feb is 15 days, not 10 + 11');
  assert.equal(overlap.mergedSpans.length, 1);

  // Two DISJOINT stays sum.
  const disjoint = limitationDeadline({
    ...base,
    stays: [
      { fromMs: utcDayMs('2026-02-01T00:00:00.000Z'), toMs: utcDayMs('2026-02-10T00:00:00.000Z') },
      { fromMs: utcDayMs('2026-03-01T00:00:00.000Z'), toMs: utcDayMs('2026-03-05T00:00:00.000Z') },
    ],
  });
  assert.equal(disjoint.suspendedDays, 15);
  assert.equal(disjoint.mergedSpans.length, 2);
});

test('days remaining are whole UTC days, floored, and days over count only after the deadline', () => {
  const deadline = utcDayMs('2026-11-20T00:00:00.000Z');
  assert.equal(daysRemaining(utcDayMs('2026-11-17T00:00:00.000Z'), deadline), 3);
  assert.equal(daysRemaining(utcDayMs('2026-11-17T23:59:00.000Z'), deadline), 3, 'a day is a UTC day, not a clock');
  assert.equal(daysRemaining(utcDayMs('2026-11-20T00:00:00.000Z'), deadline), 0, 'the deadline day itself has ZERO whole days left');
  assert.equal(daysRemaining(utcDayMs('2026-11-21T00:00:00.000Z'), deadline), -1);
  assert.equal(daysOver(utcDayMs('2026-11-20T12:00:00.000Z'), deadline), 0, 'on the day itself nothing has been overrun');
  assert.equal(daysOver(utcDayMs('2026-11-23T00:00:00.000Z'), deadline), 3);
  assert.equal(daysOver(null, deadline), null);
});

test('money is integer minor units and a fractional or negative value is refused, never rounded', () => {
  assert.equal(minorUnits(1250000), 1250000);
  assert.equal(minorUnits(0), 0, 'zero is a real amount — a reserve of nothing is a declaration');
  assert.equal(minorUnits(12.5), null);
  assert.equal(minorUnits(-1), null);
  assert.equal(minorUnits('100'), null, 'a string is not an amount');
  assert.equal(minorUnits(Number.NaN), null);
});

/* ----------------------------------------------------- 4. clock derivation */

test('the clock runs from the LATER of the damage and the date of knowledge, and both are printed apart', () => {
  const m = matter({ claimType: 'personal-injury' });
  const damage = '2020-01-01';
  const knowledge = '2024-06-01';
  const later = deriveLfgClock({
    matter: m,
    accrual: accrual({ accrualDay: damage, knowledgeDay: knowledge, periodMonths: 36 }),
    stays: [],
    resolution: null,
    nowMs: NOW.getTime(),
    warningHorizonDays: 90,
  });
  assert.equal(later.clockOriginDay, knowledge, 'a knowledge-based claim accrues from the day of knowledge, not the injury');
  assert.equal(later.originIsKnowledge, true);
  assert.equal(new Date(later.baseDeadlineMs).toISOString().slice(0, 10), '2027-06-01');

  // The damage day is later: then the damage day is the origin.
  const earlierKnown = deriveLfgClock({
    matter: m,
    accrual: accrual({ accrualDay: '2024-01-01', knowledgeDay: '2023-01-01', periodMonths: 36 }),
    stays: [],
    resolution: null,
    nowMs: NOW.getTime(),
    warningHorizonDays: 90,
  });
  assert.equal(earlierKnown.clockOriginDay, '2024-01-01');
  assert.equal(earlierKnown.originIsKnowledge, false);
});

test('a matter with no accrual prints clock-unprovable with NO day count, never a default', () => {
  const clock = deriveLfgClock({ matter: matter(), accrual: null, stays: [], resolution: null, nowMs: NOW.getTime(), warningHorizonDays: 90 });
  assert.equal(clock.state.key, 'clock-unprovable');
  assert.equal(clock.daysRemaining, null, 'a zero here would read as “today, still time”');
  assert.equal(clock.deadlineMs, null);
  assert.equal(clock.clockProvable, false);
});

test('all nine states are nine different facts, and the warning bands follow the declared horizon', () => {
  const at = (accrualDay, periodMonths, extra = {}) => deriveLfgClock({
    matter: matter(),
    accrual: accrual({ accrualDay, periodMonths }),
    stays: [],
    resolution: null,
    nowMs: NOW.getTime(),
    warningHorizonDays: 90,
    ...extra,
  });

  // The declared horizon is 90 days, so the bands are: approaching 16–90 whole days,
  // urgent 16–45, critical 0–15, and anything negative is time-barred. Each fixture
  // below is built to land inside exactly one band, so a band boundary moving would
  // fail this test rather than pass quietly.
  // in-time: 120 months from January — far outside the horizon.
  assert.equal(at('2026-01-01', 120).state.key, 'in-time');
  // approaching: deadline 2027-01-16, sixty whole days out.
  assert.equal(at('2026-01-16', 12).state.key, 'approaching');
  // urgent: deadline 2026-12-17, thirty whole days out — inside half the horizon.
  assert.equal(at('2025-12-17', 12).state.key, 'urgent');
  // critical: deadline 2026-11-27, ten whole days out.
  assert.equal(at('2025-11-27', 12).state.key, 'critical');
  // time-barred: passed.
  assert.equal(at('2024-01-01', 12).state.key, 'time-barred');
  // resolved
  const resolved = deriveLfgClock({
    matter: matter(),
    accrual: accrual(),
    stays: [],
    resolution: { kind: 'settled', resolvedDay: day(-3) },
    nowMs: NOW.getTime(),
    warningHorizonDays: 90,
  });
  assert.equal(resolved.state.key, 'resolved');
  // merged outranks resolved
  const merged = deriveLfgClock({
    matter: matter(),
    accrual: accrual(),
    stays: [],
    resolution: { kind: 'merged', resolvedDay: day(-3) },
    nowMs: NOW.getTime(),
    warningHorizonDays: 90,
  });
  assert.equal(merged.state.key, 'merged');

  // Every state key is in the published vocabulary, and every one has a printed meaning.
  assert.equal(LFG_STATE_KEYS.length, 9);
});

test('a PROVED stay moves the deadline and an ALLEGED one moves nothing', () => {
  const base = { matter: matter(), accrual: accrual({ accrualDay: '2026-01-01', periodMonths: 6 }), resolution: null, nowMs: NOW.getTime(), warningHorizonDays: 90 };
  const proved = deriveLfgClock({ ...base, stays: [stay({ proved: true })] });
  const alleged = deriveLfgClock({ ...base, stays: [stay({ proved: false, missing: ['the order reference'] })] });
  assert.equal(proved.suspendedDays, 10);
  assert.equal(alleged.suspendedDays, 0);
  assert.equal(proved.deadlineMs - alleged.deadlineMs, 10 * 86_400_000);
  assert.equal(alleged.allegedStays.length, 1);
});

/* ------------------------------------------------- 5. settlement authority */

test('the ceiling is the joint apex grant, never a sum, and a settlement above it keeps the gap', () => {
  const grants = normalizeLfgAuthorityGrants([
    { id: 'g1', personId: 'mei', scopeRef: 'Operational claims', currency: 'GBP', ceilingMinor: 1000000, basisRef: 'Delegation within the stated ceiling from the board.', declaredById: 'ceo', createdAt: T0 },
    { id: 'g2', personId: 'priya', scopeRef: 'Group claims', currency: 'GBP', ceilingMinor: 6000000, basisRef: 'Delegation within the stated ceiling from the board.', declaredById: 'ceo', createdAt: T0 },
  ], []);

  const settled = deriveLfgSettlement({
    matter: matter({ claimedMinor: 12000000 }),
    resolution: { kind: 'settled', amountMinor: 9000000, currency: 'GBP' },
    concessions: [],
    apexId: 'priya',
    grants,
    currency: 'GBP',
  });
  assert.equal(settled.ceilingMinor, 6000000, 'the apex grant is the ceiling, never the sum of the two');
  assert.equal(settled.beyondAuthorityMinor, 3000000);

  // The apex holds no grant: NOBODY was authorised, and the register says so rather
  // than assuming a default ceiling.
  const noGrant = deriveLfgSettlement({
    matter: matter(),
    resolution: { kind: 'settled', amountMinor: 100, currency: 'GBP' },
    concessions: [],
    apexId: 'dana',
    grants,
    currency: 'GBP',
  });
  assert.equal(noGrant.ceilingMinor, null);
  assert.equal(noGrant.ceilingResolvable, false);

  // A grant in another currency yields no ceiling — a rate the record does not hold
  // would be needed, and inventing one is worse than printing the refusal.
  const mixed = deriveLfgSettlement({
    matter: matter(),
    resolution: null,
    concessions: [],
    apexId: 'priya',
    grants: normalizeLfgAuthorityGrants([
      { id: 'g3', personId: 'priya', scopeRef: 'Group claims', currency: 'USD', ceilingMinor: 6000000, basisRef: 'Delegation within the stated ceiling from the board.', declaredById: 'ceo', createdAt: T0 },
    ], []),
    currency: 'GBP',
  });
  assert.equal(mixed.ceilingMinor, null);
});

test('reserves, payments, costs and interest are summed exactly and kept apart', () => {
  const rows = normalizeLfgConcessions([
    { id: 'c1', matterId: 'm-one', kind: 'reserve-set', atDay: '2026-03-01', amountMinor: 2500000, currency: 'GBP', basisRef: 'Reserve set on the pleaded loss at the first assessment.', recordedById: 'mei', createdAt: T0 },
    { id: 'c2', matterId: 'm-one', kind: 'reserve-set', atDay: '2026-03-02', amountMinor: 500000, currency: 'GBP', basisRef: 'Reserve raised on the expert report received this week.', recordedById: 'mei', createdAt: T0 },
    { id: 'c3', matterId: 'm-one', kind: 'reserve-released', atDay: '2026-03-03', amountMinor: 200000, currency: 'GBP', basisRef: 'Reserve released on the claim that was struck out.', recordedById: 'mei', createdAt: T0 },
    { id: 'c4', matterId: 'm-one', kind: 'payments-on-account', atDay: '2026-03-04', amountMinor: 100000, currency: 'GBP', basisRef: 'Interim payment made without admission of liability.', recordedById: 'mei', createdAt: T0 },
    { id: 'c5', matterId: 'm-one', kind: 'costs-award', atDay: '2026-03-05', amountMinor: 40000, currency: 'GBP', basisRef: 'Costs incurred on the disclosure exercise to date.', recordedById: 'mei', createdAt: T0 },
    { id: 'c6', matterId: 'm-one', kind: 'interest', atDay: '2026-03-06', amountMinor: 1250, currency: 'GBP', basisRef: 'Interest accrued on the sum claimed at the statutory rate.', recordedById: 'mei', createdAt: T0 },
  ], normalizeLfgMatters([matter()], []), []);
  const s = deriveLfgSettlement({ matter: matter(), resolution: null, concessions: rows, apexId: null, grants: [], currency: 'GBP' });
  assert.equal(s.reserveTotalMinor, 2500000 + 500000 - 200000);
  assert.equal(s.paidTotalMinor, 100000);
  assert.equal(s.costsTotalMinor, 40000);
  assert.equal(s.interestTotalMinor, 1250);
});

/* ---------------------------------------------------------------- 6. matrix */

test('the matrix resolves every active line, counts a person once and computes the joint apex', () => {
  const report = read(fixture({
    lfgMatters: [matter({ id: 'two-line', matterRef: 'CLM-2026-0009 — framework claim', responsibleIds: ['samuel', 'frieda'] })],
    lfgAccruals: [accrual({ id: 'a-2', matterId: 'two-line', accrualDay: day(-10), periodMonths: 24 })],
    lfgAuthorityGrants: [
      { id: 'g1', personId: 'dana', scopeRef: 'Group claims', currency: 'GBP', ceilingMinor: 3000000, basisRef: 'Delegation within the stated ceiling from the board.', declaredById: 'ceo', createdAt: T0 },
    ],
  }));
  const row = report.rows[0];
  assert.equal(row.matter.responsibleIds.length, 2);
  assert.deepEqual(row.managerIds.sort(), ['mei', 'priya'], 'both lines are resolved');
  assert.ok(row.apexIds.length >= 1, 'the joint apex over two lines is computed, not chosen');
  assert.equal(row.orphan, false);
  // The joint apex above mei and priya is a seat above BOTH lines, so it is NOT either
  // of them — which is the whole point of the matrix mandate.
  assert.ok(!row.apexIds.includes('mei') || !row.apexIds.includes('priya'));
});

test('a responsible hand off the graph is printed as an orphan, never dropped', () => {
  const report = read(fixture({
    lfgMatters: [matter({ responsibleIds: ['ghost'] })],
    lfgAccruals: [accrual()],
  }));
  assert.equal(report.rows.length, 1, 'deleting the row would erase a live claim');
  assert.equal(report.rows[0].orphan, true);
  assert.equal(report.orphanHolderN, 1);
  assert.equal(report.figuresComplete, false);
  assert.ok(report.incompleteReasons.some((line) => /not on the reporting graph/.test(line)));
});

/* ----------------------------------------------------------------- 7. rule */

test('RULE-LFG-01 files an opaque ask at the joint apex, is idempotent, and never names the party', () => {
  const raw = fixture({
    lfgMatters: [matter({ responsibleIds: ['samuel'] })],
    lfgAccruals: [accrual({ accrualDay: day(-200), periodMonths: 6 })],
  });
  const { api, store } = harness(raw);
  const state = store.state;

  // The matter is time-barred (accrual 200 days ago, 6-month period, no stay).
  const report = buildClaims(state, { now: NOW, seat: null });
  assert.equal(report.rows[0].state.key, 'time-barred');
  assert.ok(report.rows[0].daysOver > 0);

  const { conditions } = claimConditions(report);
  assert.ok(conditions.length >= 1);
  const lapse = conditions.find((row) => row.kind === 'time-barred');
  assert.ok(lapse, 'the time-barred condition must be filed');
  assert.equal(lapse.signature, lfgAskSignature('time-barred', 'm-one'));

  // The ask is opaque: no party, claim type, forum, reference, amount or person.
  // Drive any write so the spine runs.
  const result = api.claimSetConventions({ lfgPrivacyFloor: 3 });
  assert.equal(result.ok, true, result.error);

  const asks = indexClaimAsks(store.state);
  assert.ok(asks.length >= 1, 'the rule must file an ask');
  const task = asks.find((row) => row.kind === 'time-barred')?.task;
  assert.ok(task, 'a time-barred ask must exist');
  const text = `${task.title} ${task.expectedOutcome} ${task.support}`;
  for (const forbidden of ['Northgate', 'CLM-2026-0001', 'Commercial Court', 'Sam', 'Samuel', 'breach-of-contract']) {
    assert.ok(!text.includes(forbidden), `the ask must not name “${forbidden}” — a delegation is readable above the addressee`);
  }

  // Idempotent: a second write on the same record files nothing new.
  const before = indexClaimAsks(store.state).length;
  api.claimSetConventions({ lfgPrivacyFloor: 3 });
  const after = indexClaimAsks(store.state).length;
  assert.equal(after, before, 'the rule must never re-file an ask it already filed');

  // Self-closing: resolve the matter and the ask closes itself.
  const resolve = api.claimRecordResolution({
    matterId: 'm-one',
    kind: 'withdrawn',
    resolvedDay: day(-1),
    basisRef: 'The claimant discontinued the claim with no order as to costs.',
  });
  assert.equal(resolve.ok, true, resolve.error);
  const closed = indexClaimAsks(store.state).filter((row) => row.kind === 'time-barred' && row.task && row.task.status === 'active');
  assert.equal(closed.length, 0, 'the register closes its own ask when the condition clears');
});

test('the rule stays silent when paused, and observes identity-free where nobody can be asked', () => {
  const raw = fixture({
    lfgMatters: [matter({ responsibleIds: ['ghost'] })],
    lfgAccruals: [accrual({ accrualDay: day(-200), periodMonths: 6 })],
  });
  const { store } = harness(raw);
  const draft = JSON.parse(JSON.stringify(store.state));
  const event = { type: 'claim.matter.opened' };

  // Unpaused: nobody on the graph, so ONE identity-free observation and no delegation.
  const out = claimRule(draft, { event, now: NOW, idFactory: (prefix) => `${prefix}-r` });
  assert.equal(draft.delegations.length, 0, 'no seat exists to be asked');
  assert.equal(draft.lfgMarkers.length, 1);
  const marker = draft.lfgMarkers[0];
  for (const forbidden of ['Northgate', 'CLM-2026-0001', 'ghost']) {
    assert.ok(!marker.detail.includes(forbidden), 'the observation must be identity-free');
  }
  assert.ok(out.some((effect) => effect.action === 'observed'));

  // Paused: the rule returns before doing anything at all.
  const pausedDraft = JSON.parse(JSON.stringify(store.state));
  pausedDraft.settings[LFG_PAUSE_SWITCH] = false;
  const paused = claimRule(pausedDraft, { event, now: NOW, idFactory: (prefix) => `${prefix}-p` });
  assert.deepEqual(paused, []);
  assert.equal(pausedDraft.lfgMarkers.length, 0);
  assert.equal(pausedDraft.delegations.length, 0);
});

test('the rule is registered on the spine, in the propagation contracts, and in the pause census', () => {
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 167, 'the spine carries ADR-0248..ADR-0258 (RULE-PSR-01)');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule?.id === 'claimRule' || row.module === 'lfgRules.js');
  assert.ok(contract, 'the rule must have a propagation contract');
  assert.deepEqual(contract.writes.sort(), ['delegations', 'lfgMarkers', 'links']);
  assert.equal(contract.scansWorkspace, true);
});

test('the rule caps new asks per commit and counts the remainder rather than dropping it silently', () => {
  const matters = [];
  const accruals = [];
  for (let i = 0; i < 6; i += 1) {
    matters.push(matter({
      id: `m-${i}`,
      matterRef: `CLM-2026-10${i} — letter before action number ${i}`,
      claimedMinor: 1000 * (i + 1),
    }));
    accruals.push(accrual({ id: `a-${i}`, matterId: `m-${i}`, accrualDay: day(-400), periodMonths: 6 }));
  }
  const { store } = harness(fixture({ lfgMatters: matters, lfgAccruals: accruals }));
  const draft = JSON.parse(JSON.stringify(store.state));
  const out = claimRule(draft, { event: { type: 'claim.matter.opened' }, now: NOW, idFactory: (prefix) => `${prefix}-c-${Math.random().toString(36).slice(2, 8)}` });
  assert.equal(draft.delegations.length, 4, 'at most four new asks per commit');
  assert.ok(out.some((effect) => effect.action === 'deferred'), 'the remainder is counted, not dropped');
});

/* ------------------------------------------------------------------ 8. door */

test('the door refuses a duplicate live matter, a second accrual, a declared proved flag and a bad period', () => {
  const { api } = harness(fixture());

  const opened = api.claimOpenMatter({
    matterRef: 'CLM-2026-0100 — letter before action, reference on the letter',
    partyRef: 'Northgate Supplies Ltd',
    claimType: 'breach-of-contract',
    forumRef: 'Commercial Court',
    currency: 'GBP',
    claimedMinor: 500000,
    responsibleIds: ['samuel'],
  });
  assert.equal(opened.ok, true, opened.error);

  // A second live record of the SAME document and party is refused.
  const duplicate = api.claimOpenMatter({
    matterRef: 'CLM-2026-0100 — letter before action, reference on the letter',
    partyRef: 'Northgate Supplies Ltd',
    claimType: 'breach-of-contract',
    forumRef: 'Commercial Court',
    currency: 'GBP',
    responsibleIds: ['samuel'],
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.refusal, 'claim:duplicate-matter');

  // An unsupported claim type is refused at the door — `other` exists for that.
  const badType = api.claimOpenMatter({
    matterRef: 'CLM-2026-0101 — a second letter before action',
    partyRef: 'Northgate Supplies Ltd', claimType: 'vibes', forumRef: 'Commercial Court',
    currency: 'GBP', responsibleIds: ['samuel'],
  });
  assert.equal(badType.ok, false);
  assert.equal(badType.refusal, 'claim:claim-type-invalid');

  // A fractional claimed amount is refused, never rounded.
  const frac = api.claimOpenMatter({
    matterRef: 'CLM-2026-0102 — a third letter before action',
    partyRef: 'Northgate Supplies Ltd', claimType: 'debt', forumRef: 'County Court',
    currency: 'GBP', claimedMinor: 100.5, responsibleIds: ['samuel'],
  });
  assert.equal(frac.ok, false);
  assert.equal(frac.refusal, 'claim:amount-invalid');

  const matterId = opened.id;
  const acc = api.claimDeclareAccrual({
    matterId,
    accrualDay: day(-100),
    accrualRule: 'The breach accrued on the day the delivery under clause 9.2 was not made.',
    periodMonths: 12,
  });
  assert.equal(acc.ok, true, acc.error);

  const second = api.claimDeclareAccrual({
    matterId,
    accrualDay: day(-90),
    accrualRule: 'A rival accrual day that would make the deadline ambiguous.',
    periodMonths: 12,
  });
  assert.equal(second.ok, false);
  assert.equal(second.refusal, 'claim:accrual-duplicate');

  const zeroPeriod = api.claimDeclareAccrual({
    matterId: 'not-a-matter', accrualDay: day(-10),
    accrualRule: 'A rule that would be written here if the matter existed.', periodMonths: 0,
  });
  assert.equal(zeroPeriod.ok, false);

  // A knowledge-based type demands the knowledge day.
  const openedPi = api.claimOpenMatter({
    matterRef: 'LTR-2026-0900 — letter of claim, contractor injury',
    partyRef: 'Contractor (electrical)', claimType: 'personal-injury', forumRef: 'High Court',
    currency: 'GBP', responsibleIds: ['samuel'],
  });
  assert.equal(openedPi.ok, true, openedPi.error);
  const noKnowledge = api.claimDeclareAccrual({
    matterId: openedPi.id, accrualDay: day(-400),
    accrualRule: 'The injury accrued on the day of the accident on the site.', periodMonths: 36,
  });
  assert.equal(noKnowledge.ok, false);
  assert.equal(noKnowledge.refusal, 'claim:knowledge-missing');
});

test('the door refuses a declared proved flag, and keeps an unproved stay as an allegation with a warning', () => {
  const { api } = harness(fixture());
  const opened = api.claimOpenMatter({
    matterRef: 'CLM-2026-0200 — letter before action, reference on the letter',
    partyRef: 'Northgate Supplies Ltd', claimType: 'breach-of-contract', forumRef: 'Commercial Court',
    currency: 'GBP', responsibleIds: ['samuel'],
  });
  assert.equal(opened.ok, true, opened.error);
  const matterId = opened.id;

  const declared = api.claimRecordStay({
    matterId, kind: 'court-order', fromDay: day(-10), toDay: day(-5),
    instrumentRef: 'ORD-2026-500 — order of the Commercial Court staying the claim', proved: true,
  });
  assert.equal(declared.ok, false);
  assert.equal(declared.refusal, 'claim:proved-declared', 'proof is computed from the evidence, never declared');

  const oneSided = api.claimRecordStay({
    matterId, kind: 'standstill-agreement', fromDay: day(-10), toDay: day(-5),
    instrumentRef: 'SSA-2026-011 — draft standstill agreement in circulation',
    parties: ['Northgate Supplies Ltd'],
  });
  assert.equal(oneSided.ok, true, oneSided.error);
  assert.equal(oneSided.stay.proved, false);
  assert.match(oneSided.warning, /ALLEGED/);

  const twoSided = api.claimRecordStay({
    matterId, kind: 'standstill-agreement', fromDay: day(-4), toDay: day(-2),
    instrumentRef: 'SSA-2026-012 — executed standstill agreement, both parties',
    parties: ['Northgate Supplies Ltd', 'The organisation'],
  });
  assert.equal(twoSided.ok, true, twoSided.error);
  assert.equal(twoSided.stay.proved, true);
});

test('the door refuses a settlement with no amount, a withdrawal with one, and a merger that names nobody', () => {
  const { api } = harness(fixture());
  const opened = api.claimOpenMatter({
    matterRef: 'CLM-2026-0300 — letter before action, reference on the letter',
    partyRef: 'Northgate Supplies Ltd', claimType: 'breach-of-contract', forumRef: 'Commercial Court',
    currency: 'GBP', responsibleIds: ['samuel'],
  });
  const matterId = opened.id;

  const noAmount = api.claimRecordResolution({
    matterId, kind: 'settled', resolvedDay: day(-1),
    basisRef: 'Settlement agreement dated at mediation, full and final.',
  });
  assert.equal(noAmount.ok, false);
  assert.equal(noAmount.refusal, 'claim:amount-missing');

  const moneyOnWithdrawal = api.claimRecordResolution({
    matterId, kind: 'withdrawn', resolvedDay: day(-1), amountMinor: 500,
    basisRef: 'Claim discontinued by the claimant with no order as to costs.',
  });
  assert.equal(moneyOnWithdrawal.ok, false);
  assert.equal(moneyOnWithdrawal.refusal, 'claim:amount-not-permitted');

  const mergerNoTarget = api.claimRecordResolution({
    matterId, kind: 'merged', resolvedDay: day(-1),
    basisRef: 'The claim was consolidated into another matter by direction.',
  });
  assert.equal(mergerNoTarget.ok, false);
  assert.equal(mergerNoTarget.refusal, 'claim:merge-target-missing');

  // A resolution CANNOT be recorded twice.
  const settled = api.claimRecordResolution({
    matterId, kind: 'settled', resolvedDay: day(-1), amountMinor: 250000, currency: 'GBP',
    basisRef: 'Settlement agreement dated at mediation, full and final.',
  });
  assert.equal(settled.ok, true, settled.error);
  const again = api.claimRecordResolution({
    matterId, kind: 'settled', resolvedDay: day(-1), amountMinor: 300000, currency: 'GBP',
    basisRef: 'A second close for a different amount is not a correction.',
  });
  assert.equal(again.ok, false);
  assert.equal(again.refusal, 'claim:resolution-duplicate');
});

test('the door narrows every write to a seat that holds the responsible hands', () => {
  const { api, store } = harness(fixture({
    lfgMatters: [matter({ responsibleIds: ['frieda'] })],
  }));
  // Mei holds Samuel's line only; frieda is on priya's line.
  asSeat(api, store, 'mei');
  const refused = api.claimOpenMatter({
    matterRef: 'CLM-2026-0400 — letter before action on another line',
    partyRef: 'Northgate Supplies Ltd', claimType: 'breach-of-contract', forumRef: 'Commercial Court',
    currency: 'GBP', responsibleIds: ['frieda'],
  });
  assert.equal(refused.ok, false);
  assert.ok(['claim:holder-not-your-person', 'claim:holders-invalid'].includes(refused.refusal), refused.refusal);

  const ownLine = api.claimOpenMatter({
    matterRef: 'CLM-2026-0401 — letter before action on my own line',
    partyRef: 'Northgate Supplies Ltd', claimType: 'breach-of-contract', forumRef: 'Commercial Court',
    currency: 'GBP', responsibleIds: ['samuel'],
  });
  assert.equal(ownLine.ok, true, ownLine.error);
});

/* ------------------------------------------------------------------- 9. CSV */

test('CSV #189 is aggregate, identity-free, floored, and its summary equals the reader', () => {
  const exported = CSV_EXPORTS.find((row) => row.key === LFG_CSV_SCOPE);
  assert.ok(exported, 'claims-control must be a registered export');
  assert.equal(exported.sensitive, true);

  const state = buildDemoState(NOW);
  const report = buildClaims(state, { now: NOW, seat: null });
  const file = exportWorkspaceCsv(state, LFG_CSV_SCOPE, { now: NOW });
  assert.equal(file.ok, true, file.error);
  const parsed = parseCsv(file.csv);
  assert.deepEqual(parsed.headers, [...LFG_CSV_COLUMNS]);
  // `parseCsv` returns positional arrays against `parsed.headers`; index by name so
  // this suite fails loudly if a column is ever inserted out of order.
  const at = (row, key) => row[parsed.headers.indexOf(key)];
  const summaryRow = parsed.rows.find((row) => at(row, 'row_kind') === 'summary');
  assert.ok(summaryRow, 'the export must carry a summary row');
  assert.equal(Number(at(summaryRow, 'matters_n')), report.totals.matters);
  assert.equal(Number(at(summaryRow, 'open_n')), report.totals.open);
  assert.equal(Number(at(summaryRow, 'time_barred_n')), report.totals.timeBarred);
  assert.equal(Number(at(summaryRow, 'clock_unprovable_n')), report.totals.clockUnprovable);
  assert.equal(Number(at(summaryRow, 'settled_beyond_authority_n')), report.totals.settledBeyondAuthority);
  assert.equal(Number(at(summaryRow, 'stays_proved_n')), report.totals.staysProved);
  assert.equal(Number(at(summaryRow, 'stays_alleged_n')), report.totals.staysAlleged);
  assert.equal(Number(at(summaryRow, 'beyond_authority_minor')), report.totals.beyondAuthorityTotalMinor);
  assert.equal(Number(at(summaryRow, 'complete')), 1);

  // IDENTITY-FREE. The most sensitive export in the estate must carry none of this.
  for (const forbidden of ['Northgate', 'Ardley', 'Hallow', 'Nordwind', 'Riverbend', 'Adjoining', 'ET1-', 'CLM-', 'LTR-', 'commercial court', 'tribunal', 'Sam', 'Priya', 'Mei', 'Frieda']) {
    assert.ok(!file.csv.toLowerCase().includes(forbidden.toLowerCase()), `the export must not contain “${forbidden}”`);
  }

  // A per-state count below the floor is withheld BLANK with its reason, never printed.
  const small = read(fixture({
    lfgMatters: [matter({ responsibleIds: ['samuel'] })],
    lfgAccruals: [accrual({ accrualDay: day(-400), periodMonths: 6 })],
  }));
  const rows = claimCsvRows({ ...small, conventions: { ...small.conventions, [LFG_SETTING_KEYS.privacyFloor]: 3 } });
  const timeBarred = rows.find((row) => row.row_kind === 'state' && row.key === 'time-barred');
  assert.equal(timeBarred.matters_n, '', 'one matter is below the floor of three and is withheld');
  assert.match(timeBarred.blank_reason, /privacy floor/);
});

test('a mixed-currency register exports no money total and says why', () => {
  const report = read(fixture({
    lfgMatters: [
      matter({ id: 'gbp', matterRef: 'CLM-2026-0500 — a letter in sterling', responsibleIds: ['samuel'] }),
      matter({ id: 'usd', matterRef: 'CLM-2026-0501 — a letter in dollars', currency: 'USD', claimedMinor: 900000, responsibleIds: ['samuel'] }),
    ],
    lfgAccruals: [
      accrual({ id: 'a-gbp', matterId: 'gbp', accrualDay: day(-20), periodMonths: 24 }),
      accrual({ id: 'a-usd', matterId: 'usd', accrualDay: day(-20), periodMonths: 24 }),
    ],
  }));
  assert.equal(report.totals.claimedTotalMinor, null);
  assert.equal(report.totals.mixedCurrencyN, 1);
  assert.equal(report.figuresComplete, false);
  const rows = claimCsvRows(report);
  const summary = rows[0];
  assert.equal(summary.claimed_total_minor, '');
  assert.match(summary.blank_reason, /cross-currency/);
});

/* ----------------------------------------------------------------- 10. panel */

test('the panel prints the reader’s own figures cell by cell (display == computed)', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const raw = fixture({
      lfgMatters: [
        matter({ id: 'p-barred', matterRef: 'CLM-2026-0600 — a barred letter', responsibleIds: ['samuel'] }),
        matter({ id: 'p-open', matterRef: 'CLM-2026-0601 — an open letter', claimedMinor: 100, responsibleIds: ['samuel'] }),
        matter({ id: 'p-noclk', matterRef: 'CLM-2026-0602 — no clock letter', claimedMinor: 200, responsibleIds: ['samuel'] }),
      ],
      lfgAccruals: [
        accrual({ id: 'a-barred', matterId: 'p-barred', accrualDay: day(-400), periodMonths: 6 }),
        accrual({ id: 'a-open', matterId: 'p-open', accrualDay: day(-5), periodMonths: 24 }),
      ],
    });
    const state = load(raw);
    const report = buildClaims(state, { now: NOW, seat: null });
    const { api } = harness(raw);
    const view = renderClaims({ api, query: new URLSearchParams(''), state });
    const html = view.outerHTML;
    const cell = (testid) => {
      const match = new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`).exec(html);
      return match ? match[1].trim() : null;
    };
    assert.equal(cell('lfg-count-matters'), String(report.totals.matters));
    assert.equal(cell('lfg-count-open'), String(report.totals.open));
    assert.equal(cell('lfg-count-approaching'), String(report.totals.approaching));
    assert.equal(cell('lfg-count-urgent'), String(report.totals.urgent + report.totals.critical));
    assert.equal(cell('lfg-count-timebarred'), String(report.totals.timeBarred));
    assert.equal(cell('lfg-count-unprovable'), String(report.totals.clockUnprovable));
    assert.equal(cell('lfg-count-resolved'), String(report.totals.resolved));
    assert.equal(cell('lfg-count-attention'), String(report.attention.total));

    assert.ok(html.includes('data-testid="lfg-state-time-barred"'));
    assert.ok(html.includes('data-testid="lfg-state-clock-unprovable"'));
    // The exact computed overrun is printed, not a rounded label.
    const barred = report.rows.find((row) => row.matter.id === 'p-barred');
    assert.ok(html.includes(`${barred.daysOver} overdue`), 'the exact whole days over are printed');
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
      for (const view of ['matters', 'clocks', 'settlements', 'method']) {
        const node = renderClaims({ api, query: new URLSearchParams(`view=${view}`), state });
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

/* ------------------------------------------------------------------ 11. demo */

test('the demo seeds every printed state and derives them live from the injected clock', () => {
  const state = buildDemoState(NOW);
  const report = buildClaims(state, { now: NOW, seat: null });
  assert.equal(report.rows.length, 10);
  for (const key of ['in-time', 'approaching', 'urgent', 'critical', 'time-barred', 'clock-unprovable', 'settled-beyond-authority', 'resolved', 'merged']) {
    assert.ok(report.states[key] >= 1, `the demo must exercise ${key}`);
  }
  assert.equal(report.totals.staysAlleged, 1, 'the demo shows an allegation that moves nothing');
  assert.ok(report.totals.staysProved >= 2);
  assert.equal(report.totals.settledBeyondAuthority, 1);
  assert.ok(report.totals.beyondAuthorityTotalMinor > 0, 'the settlement gap is a real figure');
  assert.equal(report.balances.statesReconcile, true);
  assert.equal(report.figuresComplete, true, report.incompleteReasons.join(' '));

  // The demo's critical matter is only critical BECAUSE of its proved suspension —
  // which is the whole argument for proving one.
  const critical = report.rows.find((row) => row.matter.partyRef === 'Former plant operator');
  assert.equal(critical.state.key, 'critical');
  assert.equal(critical.suspendedDays, 20);
  assert.ok(critical.daysRemaining > 0);
  assert.ok(critical.baseDeadlineMs < NOW.getTime(), 'without the suspension it would already be barred');

  // Re-reading at a later clock moves the states without any stored value changing.
  const later = buildClaims(state, { now: new Date(NOW.getTime() + 400 * 86_400_000), seat: null });
  assert.ok(later.totals.maybeTimeBarred === undefined);
  assert.ok(later.totals.timeBarred >= report.totals.timeBarred, 'the clock runs by the calendar with nobody writing anything');
});

/* -------------------------------------------------------- 12. read surface */

test('the read surface is reachable, the signals fire, and the attention count is decision-shaped', () => {
  const { api } = harness(fixture({
    lfgMatters: [matter({ responsibleIds: ['samuel'] })],
    lfgAccruals: [accrual({ accrualDay: day(-400), periodMonths: 6 })],
  }));
  const report = api.claimReport();
  assert.equal(report.ok, true, report.error);
  assert.equal(report.report.totals.matters, 1);
  const attention = api.claimAttention();
  assert.equal(attention.ok, true, attention.error);
  assert.equal(attention.count, report.report.attention.total);
  assert.ok(attention.count >= 1);

  const state = buildDemoState(NOW);
  const signals = claimSignals(state, NOW, state.settings);
  assert.ok(signals.length >= 3);
  for (const signal of signals) {
    assert.equal(signal.domain, 'Claims & limitation');
    assert.equal(signal.route, '#/claims');
  }
  // The time-barred signal must not claim proceedings were not issued.
  const barred = signals.find((signal) => signal.ruleId === 'LFG-01');
  assert.ok(barred);
  assert.match(barred.detail, /cannot say whether proceedings were issued/);

  const count = claimAttentionCount(state, { now: NOW, settings: state.settings, seat: null });
  assert.equal(count, buildClaims(state, { now: NOW, seat: null }).attention.total);
});

test('conventions normalize fail-closed and refuse an unknown key at the door', () => {
  const normalized = normalizeLfgSettings({ lfgPrivacyFloor: 1, lfgWarningHorizonDays: 999, lfgAutoPropagate: 'no' });
  assert.equal(normalized[LFG_SETTING_KEYS.privacyFloor], 3, 'an out-of-bounds floor falls back to the declared default, never left out of bounds');
  assert.equal(normalized[LFG_SETTING_KEYS.warningHorizonDays], 90, 'an out-of-bounds horizon falls back to the declared default on import; the DOOR refuses it outright');
  assert.equal(normalized[LFG_SETTING_KEYS.autoPropagate], true, 'only an explicit false pauses the rule');

  const { api } = harness(fixture());
  const unknown = api.claimSetConventions({ notASetting: 1 });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.refusal, 'claim:unknown-setting');
  const outOfBounds = api.claimSetConventions({ lfgPrivacyFloor: 99 });
  assert.equal(outOfBounds.ok, false);
  assert.equal(outOfBounds.refusal, 'claim:setting-out-of-bounds');
  const accepted = api.claimSetConventions({ lfgPrivacyFloor: 5, lfgWarningHorizonDays: 30 });
  assert.equal(accepted.ok, true, accepted.error);
  assert.equal(accepted.conventions[LFG_SETTING_KEYS.warningHorizonDays], 30);
});

test('an unsupported claim type is kept and prints as unsupported rather than pretending to know the period', () => {
  // `other` is a carried type whose accrual rule is the matter's own; a type absent
  // from the vocabulary is kept by the loader and flagged by the reader.
  const report = read(fixture({
    lfgMatters: [matter({ claimType: 'some-new-statutory-cause', responsibleIds: ['samuel'] })],
    lfgAccruals: [accrual({ accrualRule: 'The regulator’s penalty notice imposed the sum on the day it was served, which is the accrual day this matter relies on.', accrualDay: day(-10), periodMonths: 24 })],
  }));
  const row = report.rows[0];
  assert.equal(row.unsupportedType, true, 'the claim is real whether or not the register knows its rule');
  assert.equal(row.state.key, 'in-time', 'a carried type is not the point of this test');
  assert.equal(LFG_CLAIM_TYPE_BY_KEY.other.knowledgeBased, false);
  assert.ok(wholeDaysBetween(NOW, NOW) === 0);
});
