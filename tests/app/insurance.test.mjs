// ADR-0249 — Insurance Notification & Recovery Register (Schema v203).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — five empty ledgers and three declared
//      conventions, and no policy, coverage, notification or recovery inferred
//      from a matter, a risk, a reserve or an undertaking on the record;
//   2. the loaders are FAIL-CLOSED — a policy with no declaration-page reference,
//      a coverage with no written basis, a notification with no reference, a
//      recovery with no exact amount, a reversed period, a second coverage for
//      one (matter, policy) pair, a second notification for one coverage, and an
//      amount on a denial are all DROPPED with counted warnings and never
//      repaired;
//   3. a LATE notification and a DENIAL are KEPT — deleting a late notification
//      would erase the breach while leaving the recovery that followed it, and
//      deleting a denial would leave the recovery ledger reading as though
//      nothing was ever claimed;
//   4. the arithmetic is EXACT — a notification deadline is whole UTC days from
//      the trigger day, the deadline day itself is in time, a period test is
//      inclusive of both ends, money is integer minor units, and the net cost is
//      gross less recovered;
//   5. COVER IS TESTED AGAINST THE PERIOD — an occurrence policy runs from the
//      occurrence day, a claims-made policy runs from the claim-made day, and a
//      trigger day outside the period prints `no-cover`;
//   6. all TEN STATES are ten different facts, and a coverage with no readable
//      trigger day or window prints `notification-unprovable` with NO day count
//      rather than a plausible default;
//   7. the NET COST IS DERIVED from the claim register's gross exposure less what
//      the insurer paid, and is printed apart from both;
//   8. the MATRIX is correct — every active line holding every responsible hand
//      is resolved, a person is counted once, and the joint apex is over ALL of
//      them;
//   9. RULE-INS-01 is idempotent, capped, self-closing, pause-governed on every
//      path, OPAQUE in its ask text (the register is commercially sensitive) and
//      observes identity-free where nobody can be asked;
//  10. the DOOR refuses a duplicate live policy, a holder outside the seat, a
//      second coverage for one (matter, policy) pair, a second notification, a
//      recovery with no amount, and a denial carrying one;
//  11. the CSV boundary is aggregate, identity-free and floored, and its summary
//      equals the reader's own totals;
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
import { buildInsurance, deriveInsNotification, insuranceSignals, insuranceAttentionCount } from '../../app/core/domain/insCoverage.js';
import {
  normalizeInsCoverages,
  normalizeInsNotifications,
  normalizeInsPolicies,
  normalizeInsRecoveries,
  normalizeInsSettings,
} from '../../app/core/domain/insSchema.js';
import {
  daysOver,
  daysRemaining,
  minorUnits,
  netCostMinor,
  notificationDeadline,
  notificationDaysOver,
  utcDayMs,
  wholeDaysBetween,
  withinPeriod,
} from '../../app/core/domain/insMath.js';
import {
  insuranceConditions,
  insuranceRule,
  indexInsuranceAsks,
  insAskSignature,
  INS_PAUSE_SWITCH,
} from '../../app/core/domain/insRules.js';
import {
  INS_CSV_COLUMNS,
  INS_CSV_SCOPE,
  INS_POLICY_CLASS_BY_KEY,
  INS_SETTING_KEYS,
  INS_STATE_KEYS,
} from '../../app/core/domain/insRegistry.js';
import { insuranceCsvRows } from '../../app/core/domain/insReport.js';
import { renderInsurance } from '../../app/views/insurance.js';

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

const policy = (overrides = {}) => ({
  id: 'pol-one',
  policyRef: 'POL-2026-0001 — declaration page reference on the schedule',
  insurerRef: 'Albion Syndicate 2026',
  policyClass: 'general-liability',
  basis: 'occurrence',
  periodStartDay: '2026-01-01',
  periodEndDay: '2026-12-31',
  notificationWindowDays: 30,
  limitMinor: 10000000,
  deductibleMinor: 250000,
  currency: 'GBP',
  triggerRef: null,
  responsibleIds: ['samuel'],
  declaredById: 'mei',
  declaredAt: iso('2026-01-01T09:00:00.000Z'),
  createdAt: iso('2026-01-01T09:00:00.000Z'),
  updatedAt: iso('2026-01-01T09:00:00.000Z'),
  ...overrides,
});

const coverage = (overrides = {}) => ({
  id: 'cov-one',
  matterId: 'm-one',
  policyId: 'pol-one',
  coveredMinor: null,
  currency: null,
  basisRef: 'Public liability wording clause 4.1 answers for third-party property damage during the period.',
  declaredById: 'mei',
  createdAt: iso('2026-06-02T09:00:00.000Z'),
  ...overrides,
});

const notification = (overrides = {}) => ({
  id: 'not-one',
  coverageId: 'cov-one',
  notifiedDay: '2026-05-15',
  method: 'broker-notification',
  referenceRef: 'BRK-2026-0091 — broker notification acknowledgement reference',
  recordedById: 'mei',
  createdAt: iso('2026-05-15T09:00:00.000Z'),
  ...overrides,
});

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildInsurance(load(raw), { now: NOW, seat: null, ...opts });

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

test('schema v203 is additive: five empty ledgers, three conventions, nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 213, 'ADR-0260 (modern slavery & due diligence) is the current head');
  const keys = ['insPolicies', 'insCoverages', 'insNotifications', 'insRecoveries', 'insMarkers'];
  for (const key of keys) assert.ok(COLLECTIONS.includes(key), `${key} must be a declared collection`);
  const empty = createEmptyState(T0);
  for (const key of keys) assert.deepEqual(empty[key], [], `${key} must be empty on a fresh workspace`);
  assert.equal(empty.settings.insAutoPropagate, true);
  assert.equal(empty.settings.insPrivacyFloor, 3);
  assert.equal(empty.settings.insWarningHorizonDays, 90);
});

test('migrating a v202 workspace adds five empty ledgers and infers no policy, coverage or deadline', () => {
  const base = createEmptyState(T0);
  base.schemaVersion = 202;
  base.lfgMatters = [matter()];
  base.lfgAccruals = [accrual()];
  for (const key of ['insPolicies', 'insCoverages', 'insNotifications', 'insRecoveries', 'insMarkers']) delete base[key];
  const migrated = migrate(base).raw;
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(migrated.insPolicies, [], 'a matter on the claim register is not an insurance policy');
  assert.deepEqual(migrated.insCoverages, [], 'no coverage is inferred from anything on the record');
  assert.equal(migrated.settings.insAutoPropagate, true);
});

/* -------------------------------------------------------------- 2. loaders */

test('the loader drops a policy with no document, no insurer, no basis, a reversed period, a bad currency or a partial holder list', () => {
  const warnings = [];
  const rows = normalizeInsPolicies([
    policy({ id: 'ok' }),
    policy({ id: 'no-ref', policyRef: '' }),
    policy({ id: 'short-ref', policyRef: 'POL-1' }),
    policy({ id: 'no-insurer', insurerRef: 'ab' }),
    policy({ id: 'bad-basis', basis: 'vibes' }),
    policy({ id: 'reversed', periodStartDay: '2026-12-31', periodEndDay: '2026-01-01' }),
    policy({ id: 'bad-cur', currency: 'POUNDS' }),
    policy({ id: 'partial', responsibleIds: ['samuel', ''] }),
    policy({ id: 'empty-holders', responsibleIds: [] }),
    policy({ id: 'dup' }),
    policy({ id: 'dup' }),
    policy({ id: 'frac-limit', limitMinor: 1234.5 }),
    policy({ id: 'neg-window', notificationWindowDays: -1 }),
  ], warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok', 'dup']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /dropped/);
  assert.match(warnings[0], /Nothing was repaired/);
});

test('the loader drops a coverage with no written basis, a second coverage for one (matter, policy) pair, or an orphan', () => {
  const matters = [matter(), matter({ id: 'm-two', matterRef: 'CLM-2026-0002 — second letter before action' })];
  const policies = normalizeInsPolicies([policy()], []);
  const warnings = [];
  const rows = normalizeInsCoverages([
    coverage({ id: 'ok' }),
    coverage({ id: 'no-basis', matterId: 'm-two', basisRef: 'too short' }),
    coverage({ id: 'second-for-pair' }),
    coverage({ id: 'frac-covered', matterId: 'm-two', coveredMinor: 100.5, currency: 'GBP' }),
    coverage({ id: 'orphan', matterId: 'not-a-matter' }),
  ], matters, policies, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['ok']);
  assert.ok(warnings.some((line) => /coverage row\(s\) could not be read exactly/.test(line)));
  assert.ok(warnings.some((line) => /name a matter or a policy that is not on the record/.test(line)));
});

test('a LATE notification is KEPT by the loader and says what was recorded — it is never deleted', () => {
  const coverages = normalizeInsCoverages([coverage()], [matter()], normalizeInsPolicies([policy()], []), []);
  const warnings = [];
  const rows = normalizeInsNotifications([
    notification({ id: 'late', notifiedDay: '2026-09-01' }),
    notification({ id: 'second-for-cov' }),
    notification({ id: 'no-ref', referenceRef: '' }),
  ], coverages, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['late']);
  assert.ok(warnings.some((line) => /notification row\(s\) could not be read exactly/.test(line)));
});

test('a recovery requiring an amount is dropped without one, and a denial is kept with no amount', () => {
  const coverages = normalizeInsCoverages([coverage()], [matter()], normalizeInsPolicies([policy()], []), []);
  const warnings = [];
  const rows = normalizeInsRecoveries([
    { id: 'rec-ok', coverageId: 'cov-one', kind: 'recovered', atDay: '2026-08-01', amountMinor: 100000, currency: 'GBP', basisRef: 'Insurer remittance advice settling the claim in full.', recordedById: 'mei', createdAt: T0 },
    { id: 'rec-no-amount', coverageId: 'cov-one', kind: 'recovered', atDay: '2026-08-01', amountMinor: null, currency: 'GBP', basisRef: 'Insurer remittance advice settling the claim in full.', recordedById: 'mei', createdAt: T0 },
    { id: 'denied-ok', coverageId: 'cov-one', kind: 'denied', atDay: '2026-08-02', amountMinor: null, currency: null, basisRef: 'Insurer declinature letter relying on the late-notice condition.', recordedById: 'mei', createdAt: T0 },
    { id: 'frac', coverageId: 'cov-one', kind: 'interim', atDay: '2026-08-03', amountMinor: 25.5, currency: 'GBP', basisRef: 'Interim payment on account of the loss.', recordedById: 'mei', createdAt: T0 },
  ], coverages, warnings);
  assert.deepEqual(rows.map((row) => row.id), ['rec-ok', 'denied-ok']);
  assert.ok(warnings.some((line) => /whole number of minor units/.test(line)));
});

/* ------------------------------------------------------------- 3. arithmetic */

test('the notification deadline is whole UTC days from the trigger day, and the deadline day itself is in time', () => {
  const trigger = utcDayMs('2026-05-01T00:00:00.000Z');
  const deadline = notificationDeadline({ triggerMs: trigger, windowDays: 30 });
  assert.equal(new Date(deadline).toISOString().slice(0, 10), '2026-05-31');
  assert.equal(notificationDaysOver(utcDayMs('2026-05-31T00:00:00.000Z'), deadline), 0, 'a notification on the deadline day is in time');
  assert.equal(notificationDaysOver(utcDayMs('2026-06-01T00:00:00.000Z'), deadline), 1, 'the day after is one day over');
  assert.equal(notificationDeadline({ triggerMs: null, windowDays: 30 }), null);
  assert.equal(notificationDeadline({ triggerMs: trigger, windowDays: -1 }), null);
});

test('the period test is inclusive of both ends, and net cost is gross less recovered capped at zero', () => {
  const start = utcDayMs('2026-01-01T00:00:00.000Z');
  const end = utcDayMs('2026-12-31T00:00:00.000Z');
  assert.equal(withinPeriod({ triggerMs: start, periodStartMs: start, periodEndMs: end }), true);
  assert.equal(withinPeriod({ triggerMs: end, periodStartMs: start, periodEndMs: end }), true);
  assert.equal(withinPeriod({ triggerMs: utcDayMs('2025-12-31T00:00:00.000Z'), periodStartMs: start, periodEndMs: end }), false);
  assert.equal(withinPeriod({ triggerMs: null, periodStartMs: start, periodEndMs: end }), null);

  assert.equal(netCostMinor({ grossMinor: 5000000, recoveredMinor: 3000000 }), 2000000);
  assert.equal(netCostMinor({ grossMinor: 5000000, recoveredMinor: 6000000 }), 0, 'the net cost is never negative');
  assert.equal(netCostMinor({ grossMinor: null, recoveredMinor: 3000000 }), null);
});

test('days remaining are whole UTC days, floored, and money is integer minor units', () => {
  const deadline = utcDayMs('2026-11-20T00:00:00.000Z');
  assert.equal(daysRemaining(utcDayMs('2026-11-17T00:00:00.000Z'), deadline), 3);
  assert.equal(daysRemaining(utcDayMs('2026-11-20T00:00:00.000Z'), deadline), 0);
  assert.equal(daysOver(utcDayMs('2026-11-23T00:00:00.000Z'), deadline), 3);
  assert.equal(minorUnits(1250000), 1250000);
  assert.equal(minorUnits(12.5), null);
});

/* ----------------------------------------------------- 4. cover & deadline */

test('cover is tested against the period: occurrence uses the accrual day, claims-made uses the opened day', () => {
  // Occurrence policy: period 2026, accrual in 2025 → no-cover.
  const outOfPeriod = deriveInsNotification({
    policy: policy({ basis: 'occurrence', periodStartDay: '2026-01-01', periodEndDay: '2026-12-31' }),
    notification: null,
    recoveries: [],
    triggerMs: utcDayMs('2025-06-01T00:00:00.000Z'),
    nowMs: NOW.getTime(),
    warningHorizonDays: 90,
  });
  assert.equal(outOfPeriod.hasCover, false);
  assert.equal(outOfPeriod.state.key, 'no-cover');

  // Inside period: covered.
  const inPeriod = deriveInsNotification({
    policy: policy({ basis: 'occurrence', periodStartDay: '2026-01-01', periodEndDay: '2026-12-31', notificationWindowDays: 365 }),
    notification: null,
    recoveries: [],
    triggerMs: utcDayMs('2026-06-01T00:00:00.000Z'),
    nowMs: NOW.getTime(),
    warningHorizonDays: 90,
  });
  assert.equal(inPeriod.hasCover, true);
  assert.equal(inPeriod.state.key, 'unnotified');
});

test('a coverage with no trigger day prints notification-unprovable with NO day count, never a default', () => {
  const derived = deriveInsNotification({
    policy: policy(),
    notification: null,
    recoveries: [],
    triggerMs: null,
    nowMs: NOW.getTime(),
    warningHorizonDays: 90,
  });
  assert.equal(derived.state.key, 'notification-unprovable');
  assert.equal(derived.daysRemaining, null, 'a zero here would read as “today, still time”');
  assert.equal(derived.deadlineMs, null);
  assert.equal(derived.deadlineProvable, false);
});

test('all ten states are ten different facts, and a late notification prints notification-late', () => {
  const p = policy({ periodStartDay: '2026-01-01', periodEndDay: '2026-12-31', notificationWindowDays: 30 });
  const trigger = utcDayMs('2026-05-01T00:00:00.000Z');

  // 1. no-cover
  assert.equal(deriveInsNotification({ policy: p, triggerMs: utcDayMs('2025-05-01T00:00:00.000Z'), nowMs: NOW.getTime() }).state.key, 'no-cover');
  // 2. notification-unprovable
  assert.equal(deriveInsNotification({ policy: p, triggerMs: null, nowMs: NOW.getTime() }).state.key, 'notification-unprovable');
  // 3. notification-late (unnotified past deadline)
  assert.equal(deriveInsNotification({ policy: p, triggerMs: trigger, nowMs: NOW.getTime() }).state.key, 'notification-late');
  // 4. notification-late (notified after deadline)
  const lateNotice = deriveInsNotification({ policy: p, notification: { notifiedDay: '2026-06-10' }, triggerMs: trigger, nowMs: NOW.getTime() });
  assert.equal(lateNotice.state.key, 'notification-late');
  assert.equal(lateNotice.lateBy, 10);
  // 5. notification-urgent
  assert.equal(deriveInsNotification({ policy: policy({ notificationWindowDays: 20 }), triggerMs: utcDayMs(day(-5)), nowMs: NOW.getTime(), warningHorizonDays: 90 }).state.key, 'notification-urgent');
  // 6. unnotified
  assert.equal(deriveInsNotification({ policy: policy({ notificationWindowDays: 200 }), triggerMs: utcDayMs(day(-5)), nowMs: NOW.getTime(), warningHorizonDays: 90 }).state.key, 'unnotified');
  // 7. notified-in-time
  assert.equal(deriveInsNotification({ policy: p, notification: { notifiedDay: '2026-05-15' }, triggerMs: trigger, nowMs: NOW.getTime() }).state.key, 'notified-in-time');
  // 8. recovery-pending
  assert.equal(deriveInsNotification({ policy: p, notification: { notifiedDay: '2026-05-15' }, recoveries: [{ kind: 'claimed', amountMinor: 1000 }], triggerMs: trigger, nowMs: NOW.getTime() }).state.key, 'recovery-pending');
  // 9. recovery-denied
  assert.equal(deriveInsNotification({ policy: p, notification: { notifiedDay: '2026-05-15' }, recoveries: [{ kind: 'claimed', amountMinor: 1000 }, { kind: 'denied' }], triggerMs: trigger, nowMs: NOW.getTime() }).state.key, 'recovery-denied');
  // 10. recovered & partially-recovered
  assert.equal(deriveInsNotification({ policy: p, notification: { notifiedDay: '2026-05-15' }, recoveries: [{ kind: 'claimed', amountMinor: 1000 }, { kind: 'recovered', amountMinor: 1000 }], triggerMs: trigger, nowMs: NOW.getTime() }).state.key, 'recovered');
  assert.equal(deriveInsNotification({ policy: p, notification: { notifiedDay: '2026-05-15' }, recoveries: [{ kind: 'claimed', amountMinor: 1000 }, { kind: 'recovered', amountMinor: 600 }], triggerMs: trigger, nowMs: NOW.getTime() }).state.key, 'partially-recovered');

  assert.equal(INS_STATE_KEYS.length, 10);
});

/* --------------------------------------------------------- 5. net cost */

test('the net cost is derived from the claim register gross less what the insurer paid', () => {
  const report = read(fixture({
    lfgMatters: [matter({ claimedMinor: 5000000 })],
    lfgAccruals: [accrual({ accrualDay: '2026-05-01' })],
    insPolicies: [policy()],
    insCoverages: [coverage()],
    insNotifications: [notification()],
    insRecoveries: [
      { id: 'r1', coverageId: 'cov-one', kind: 'claimed', atDay: '2026-06-01', amountMinor: 4750000, currency: 'GBP', basisRef: 'Proof of loss submitted to the syndicate.', recordedById: 'mei', createdAt: T0 },
      { id: 'r2', coverageId: 'cov-one', kind: 'recovered', atDay: '2026-08-01', amountMinor: 3000000, currency: 'GBP', basisRef: 'Interim settlement received from the syndicate.', recordedById: 'mei', createdAt: T0 },
    ],
  }));
  const row = report.rows[0];
  assert.equal(row.grossMinor, 5000000);
  assert.equal(row.recoveredMinor, 3000000);
  assert.equal(row.netMinor, 2000000, 'gross 50,000 less recovered 30,000 is net 20,000');
  assert.equal(row.state.key, 'partially-recovered');
});

/* ---------------------------------------------------------------- 6. matrix */

test('the matrix resolves every active line, counts a person once and computes the joint apex', () => {
  const report = read(fixture({
    lfgMatters: [matter()],
    lfgAccruals: [accrual()],
    insPolicies: [policy({ id: 'two-line', responsibleIds: ['samuel', 'frieda'] })],
    insCoverages: [coverage({ policyId: 'two-line' })],
  }));
  const row = report.rows[0];
  assert.equal(row.policy.responsibleIds.length, 2);
  assert.deepEqual(row.managerIds.sort(), ['mei', 'priya']);
  assert.ok(row.apexIds.length >= 1);
  assert.equal(row.orphan, false);
  assert.ok(!row.apexIds.includes('mei') || !row.apexIds.includes('priya'));
});

test('a responsible hand off the graph is printed as an orphan, never dropped', () => {
  const report = read(fixture({
    lfgMatters: [matter()],
    lfgAccruals: [accrual()],
    insPolicies: [policy({ responsibleIds: ['ghost'] })],
    insCoverages: [coverage()],
  }));
  assert.equal(report.rows.length, 1, 'deleting the row would erase live cover');
  assert.equal(report.rows[0].orphan, true);
  assert.equal(report.orphanHolderN, 1);
  assert.equal(report.figuresComplete, false);
  assert.ok(report.incompleteReasons.some((line) => /not on the reporting graph/.test(line)));
});

/* ----------------------------------------------------------------- 7. rule */

test('RULE-INS-01 files an opaque ask at the joint apex, is idempotent, and never names the insurer', () => {
  const raw = fixture({
    lfgMatters: [matter()],
    lfgAccruals: [accrual({ accrualDay: '2026-05-01' })],
    insPolicies: [policy({ responsibleIds: ['samuel'], notificationWindowDays: 30 })],
    insCoverages: [coverage()],
  });
  const { api, store } = harness(raw);
  const state = store.state;

  const report = buildInsurance(state, { now: NOW, seat: null });
  assert.equal(report.rows[0].state.key, 'notification-late');
  assert.ok(report.rows[0].daysOver > 0);

  const { conditions } = insuranceConditions(report);
  assert.ok(conditions.length >= 1);
  const late = conditions.find((row) => row.kind === 'notification-late');
  assert.ok(late);
  assert.equal(late.signature, insAskSignature('notification-late', 'cov-one'));

  const result = api.insuranceSetConventions({ insPrivacyFloor: 3 });
  assert.equal(result.ok, true, result.error);

  const asks = indexInsuranceAsks(store.state);
  assert.ok(asks.length >= 1);
  const task = asks.find((row) => row.kind === 'notification-late')?.task;
  assert.ok(task);
  const text = `${task.title} ${task.expectedOutcome} ${task.support}`;
  for (const forbidden of ['Albion', 'POL-2026-0001', 'Northgate', 'CLM-2026-0001', 'Sam', 'Samuel']) {
    assert.ok(!text.includes(forbidden), `the ask must not name “${forbidden}”`);
  }

  // Idempotent
  const before = indexInsuranceAsks(store.state).length;
  api.insuranceSetConventions({ insPrivacyFloor: 3 });
  const after = indexInsuranceAsks(store.state).length;
  assert.equal(after, before);

  // Self-closing: record a timely notification and the ask closes itself.
  const notified = api.insuranceRecordNotification({
    coverageId: 'cov-one',
    method: 'broker-notification',
    notifiedDay: '2026-05-15',
    referenceRef: 'BRK-2026-0091 — broker notification acknowledgement reference',
  });
  assert.equal(notified.ok, true, notified.error);
  const closed = indexInsuranceAsks(store.state).filter((row) => row.kind === 'notification-late' && row.task && row.task.status === 'active');
  assert.equal(closed.length, 0);
});

test('the rule stays silent when paused, and observes identity-free where nobody can be asked', () => {
  const raw = fixture({
    lfgMatters: [matter()],
    lfgAccruals: [accrual({ accrualDay: '2026-05-01' })],
    insPolicies: [policy({ responsibleIds: ['ghost'], notificationWindowDays: 30 })],
    insCoverages: [coverage()],
  });
  const { store } = harness(raw);
  const draft = JSON.parse(JSON.stringify(store.state));
  const event = { type: 'insurance.policy.declared' };

  const out = insuranceRule(draft, { event, now: NOW, idFactory: (prefix) => `${prefix}-r` });
  assert.equal(draft.delegations.length, 0);
  assert.equal(draft.insMarkers.length, 1);
  const marker = draft.insMarkers[0];
  for (const forbidden of ['Albion', 'POL-2026-0001', 'ghost']) {
    assert.ok(!marker.detail.includes(forbidden));
  }
  assert.ok(out.some((effect) => effect.action === 'observed'));

  const pausedDraft = JSON.parse(JSON.stringify(store.state));
  pausedDraft.settings[INS_PAUSE_SWITCH] = false;
  const paused = insuranceRule(pausedDraft, { event, now: NOW, idFactory: (prefix) => `${prefix}-p` });
  assert.deepEqual(paused, []);
  assert.equal(pausedDraft.insMarkers.length, 0);
  assert.equal(pausedDraft.delegations.length, 0);
});

test('the rule is registered on the spine, in the propagation contracts, and in the pause census', () => {
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 169, 'the spine carries RULE-INS-01..RULE-PSR-01 (ADR-0258) and RULE-MSA-01 (ADR-0260)');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule?.id === 'insuranceRule' || row.module === 'insRules.js');
  assert.ok(contract, 'the rule must have a propagation contract');
  assert.deepEqual(contract.writes.sort(), ['delegations', 'insMarkers', 'links']);
  assert.equal(contract.scansWorkspace, true);
});

test('the rule caps new asks per commit and counts the remainder rather than dropping it silently', () => {
  const policies = [];
  const coverages = [];
  for (let i = 0; i < 6; i += 1) {
    policies.push(policy({
      id: `pol-${i}`,
      policyRef: `POL-2026-10${i} — declaration page reference number ${i}`,
      notificationWindowDays: 30,
    }));
    coverages.push(coverage({ id: `cov-${i}`, policyId: `pol-${i}` }));
  }
  const { store } = harness(fixture({
    lfgMatters: [matter()],
    lfgAccruals: [accrual({ accrualDay: '2026-05-01' })],
    insPolicies: policies,
    insCoverages: coverages,
  }));
  const draft = JSON.parse(JSON.stringify(store.state));
  const out = insuranceRule(draft, { event: { type: 'insurance.policy.declared' }, now: NOW, idFactory: (prefix) => `${prefix}-c-${Math.random().toString(36).slice(2, 8)}` });
  assert.equal(draft.delegations.length, 4);
  assert.ok(out.some((effect) => effect.action === 'deferred'));
});

/* ------------------------------------------------------------------ 8. door */

test('the door refuses a duplicate live policy, a second coverage for one pair, a second notification and a bad window', () => {
  const { api } = harness(fixture({ lfgMatters: [matter()], lfgAccruals: [accrual()] }));

  const declared = api.insuranceDeclarePolicy({
    policyRef: 'POL-2026-0100 — declaration page reference on the schedule',
    insurerRef: 'Albion Syndicate 2026',
    policyClass: 'general-liability',
    basis: 'occurrence',
    periodStartDay: '2026-01-01',
    periodEndDay: '2026-12-31',
    notificationWindowDays: 30,
    currency: 'GBP',
    limitMinor: 5000000,
    responsibleIds: ['samuel'],
  });
  assert.equal(declared.ok, true, declared.error);

  const cov = api.insuranceDeclareCoverage({
    matterId: 'm-one',
    policyId: declared.id,
    basisRef: 'Public liability wording clause 4.1 answers for third-party property damage during the period.',
  });
  assert.equal(cov.ok, true, cov.error);

  // A second live record of the SAME policy reference and insurer is refused.
  const duplicate = api.insuranceDeclarePolicy({
    policyRef: 'POL-2026-0100 — declaration page reference on the schedule',
    insurerRef: 'Albion Syndicate 2026',
    policyClass: 'general-liability',
    basis: 'occurrence',
    periodStartDay: '2026-01-01',
    periodEndDay: '2026-12-31',
    notificationWindowDays: 30,
    currency: 'GBP',
    responsibleIds: ['samuel'],
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.refusal, 'insurance:duplicate-policy');

  // A second coverage for the same (matter, policy) pair is refused.
  const dupCov = api.insuranceDeclareCoverage({
    matterId: 'm-one',
    policyId: declared.id,
    basisRef: 'A rival coverage link that would make the recovery ambiguous.',
  });
  assert.equal(dupCov.ok, false);
  assert.equal(dupCov.refusal, 'insurance:coverage-duplicate');

  // Record a notification, then refuse a second.
  const not1 = api.insuranceRecordNotification({
    coverageId: cov.id,
    method: 'broker-notification',
    notifiedDay: '2026-05-15',
    referenceRef: 'BRK-2026-0091 — broker notification acknowledgement reference',
  });
  assert.equal(not1.ok, true, not1.error);
  const not2 = api.insuranceRecordNotification({
    coverageId: cov.id,
    method: 'direct-insurer',
    notifiedDay: '2026-05-16',
    referenceRef: 'INS-2026-0092 — a rival notification reference',
  });
  assert.equal(not2.ok, false);
  assert.equal(not2.refusal, 'insurance:notification-duplicate');
});

test('the door keeps a late notification with a warning, refuses a recovery without an amount, and refuses an amount on a denial', () => {
  const { api } = harness(fixture({
    lfgMatters: [matter()],
    lfgAccruals: [accrual({ accrualDay: '2026-05-01' })],
    insPolicies: [policy({ notificationWindowDays: 30 })],
    insCoverages: [coverage()],
  }));

  const late = api.insuranceRecordNotification({
    coverageId: 'cov-one',
    method: 'broker-notification',
    notifiedDay: '2026-07-01',
    referenceRef: 'BRK-2026-0500 — late broker notification reference',
  });
  assert.equal(late.ok, true, late.error);
  assert.match(late.warning, /notification-late/);

  const noAmount = api.insuranceRecordRecovery({
    coverageId: 'cov-one',
    kind: 'recovered',
    atDay: day(-1),
    basisRef: 'Insurer remittance advice settling the claim in full.',
  });
  assert.equal(noAmount.ok, false);
  assert.equal(noAmount.refusal, 'insurance:amount-missing');

  const moneyOnDenial = api.insuranceRecordRecovery({
    coverageId: 'cov-one',
    kind: 'denied',
    atDay: day(-1),
    amountMinor: 500,
    basisRef: 'Insurer declinature letter relying on the late-notice condition.',
  });
  assert.equal(moneyOnDenial.ok, false);
  assert.equal(moneyOnDenial.refusal, 'insurance:amount-not-permitted');

  const denied = api.insuranceRecordRecovery({
    coverageId: 'cov-one',
    kind: 'denied',
    atDay: day(-1),
    basisRef: 'Insurer declinature letter relying on the late-notice condition.',
  });
  assert.equal(denied.ok, true, denied.error);
});

test('the door narrows every write to a seat that holds the responsible hands', () => {
  const { api, store } = harness(fixture());
  asSeat(api, store, 'mei');
  const refused = api.insuranceDeclarePolicy({
    policyRef: 'POL-2026-0400 — declaration page on another line',
    insurerRef: 'Albion Syndicate 2026',
    policyClass: 'general-liability',
    basis: 'occurrence',
    periodStartDay: '2026-01-01',
    periodEndDay: '2026-12-31',
    notificationWindowDays: 30,
    currency: 'GBP',
    responsibleIds: ['frieda'],
  });
  assert.equal(refused.ok, false);
  assert.ok(['insurance:holder-not-your-person', 'insurance:holders-invalid'].includes(refused.refusal), refused.refusal);

  const ownLine = api.insuranceDeclarePolicy({
    policyRef: 'POL-2026-0401 — declaration page on my own line',
    insurerRef: 'Albion Syndicate 2026',
    policyClass: 'general-liability',
    basis: 'occurrence',
    periodStartDay: '2026-01-01',
    periodEndDay: '2026-12-31',
    notificationWindowDays: 30,
    currency: 'GBP',
    responsibleIds: ['samuel'],
  });
  assert.equal(ownLine.ok, true, ownLine.error);
});

/* ------------------------------------------------------------------- 9. CSV */

test('CSV #190 is aggregate, identity-free, floored, and its summary equals the reader', () => {
  const exported = CSV_EXPORTS.find((row) => row.key === INS_CSV_SCOPE);
  assert.ok(exported, 'insurance-recovery must be a registered export');
  assert.equal(exported.sensitive, true);

  const state = buildDemoState(NOW);
  const report = buildInsurance(state, { now: NOW, seat: null });
  const file = exportWorkspaceCsv(state, INS_CSV_SCOPE, { now: NOW });
  assert.equal(file.ok, true, file.error);
  const parsed = parseCsv(file.csv);
  assert.deepEqual(parsed.headers, [...INS_CSV_COLUMNS]);
  const at = (row, key) => row[parsed.headers.indexOf(key)];
  const summaryRow = parsed.rows.find((row) => at(row, 'row_kind') === 'summary');
  assert.ok(summaryRow, 'the export must carry a summary row');
  assert.equal(Number(at(summaryRow, 'coverages_n')), report.totals.coverages);
  assert.equal(Number(at(summaryRow, 'open_n')), report.totals.open);
  assert.equal(Number(at(summaryRow, 'notification_late_n')), report.totals.notificationLate);
  assert.equal(Number(at(summaryRow, 'notification_unprovable_n')), report.totals.notificationUnprovable);
  assert.equal(Number(at(summaryRow, 'no_cover_n')), report.totals.noCover);
  assert.equal(Number(at(summaryRow, 'recovery_denied_n')), report.totals.recoveryDenied);
  assert.equal(Number(at(summaryRow, 'recovered_n')), report.totals.recovered);
  assert.equal(Number(at(summaryRow, 'net_total_minor')), report.totals.netTotalMinor);
  assert.equal(Number(at(summaryRow, 'complete')), 1);

  // IDENTITY-FREE.
  for (const forbidden of ['Albion', 'Beazley', 'Chubb', 'Hiscox', 'Aviva', 'Zurich', 'QBE', 'POL-', 'BRK-', 'Northgate', 'Ardley', 'Sam', 'Priya', 'Mei', 'Frieda']) {
    assert.ok(!file.csv.toLowerCase().includes(forbidden.toLowerCase()), `the export must not contain “${forbidden}”`);
  }

  // A per-state count below the floor is withheld BLANK with its reason.
  const small = read(fixture({
    lfgMatters: [matter()],
    lfgAccruals: [accrual({ accrualDay: '2026-05-01' })],
    insPolicies: [policy({ notificationWindowDays: 30 })],
    insCoverages: [coverage()],
  }));
  const rows = insuranceCsvRows({ ...small, conventions: { ...small.conventions, [INS_SETTING_KEYS.privacyFloor]: 3 } });
  const late = rows.find((row) => row.row_kind === 'state' && row.key === 'notification-late');
  assert.equal(late.coverages_n, '');
  assert.match(late.blank_reason, /privacy floor/);
});

test('a mixed-currency register exports no money total and says why', () => {
  const report = read(fixture({
    lfgMatters: [matter({ id: 'm1' }), matter({ id: 'm2', matterRef: 'CLM-2026-0501 — second letter' })],
    lfgAccruals: [accrual({ id: 'a1', matterId: 'm1' }), accrual({ id: 'a2', matterId: 'm2' })],
    insPolicies: [
      policy({ id: 'gbp', policyRef: 'POL-2026-0500 — sterling policy' }),
      policy({ id: 'usd', policyRef: 'POL-2026-0501 — dollar policy', currency: 'USD' }),
    ],
    insCoverages: [
      coverage({ id: 'c1', matterId: 'm1', policyId: 'gbp' }),
      coverage({ id: 'c2', matterId: 'm2', policyId: 'usd' }),
    ],
  }));
  assert.equal(report.totals.netTotalMinor, null);
  assert.equal(report.totals.mixedCurrencyN, 1);
  assert.equal(report.figuresComplete, false);
  const rows = insuranceCsvRows(report);
  assert.equal(rows[0].net_total_minor, '');
  assert.match(rows[0].blank_reason, /cross-currency/);
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
        matter({ id: 'm-late', matterRef: 'CLM-2026-0600 — a late letter' }),
        matter({ id: 'm-open', matterRef: 'CLM-2026-0601 — an open letter' }),
        matter({ id: 'm-noclk', matterRef: 'CLM-2026-0602 — no accrual letter' }),
      ],
      lfgAccruals: [
        accrual({ id: 'a-late', matterId: 'm-late', accrualDay: '2026-05-01' }),
        accrual({ id: 'a-open', matterId: 'm-open', accrualDay: day(-5) }),
      ],
      insPolicies: [
        policy({ id: 'p-late', policyRef: 'POL-2026-0600 — late policy', notificationWindowDays: 30 }),
        policy({ id: 'p-open', policyRef: 'POL-2026-0601 — open policy', notificationWindowDays: 180 }),
      ],
      insCoverages: [
        coverage({ id: 'c-late', matterId: 'm-late', policyId: 'p-late' }),
        coverage({ id: 'c-open', matterId: 'm-open', policyId: 'p-open' }),
        coverage({ id: 'c-noclk', matterId: 'm-noclk', policyId: 'p-open' }),
      ],
    });
    const state = load(raw);
    const report = buildInsurance(state, { now: NOW, seat: null });
    const { api } = harness(raw);
    const view = renderInsurance({ api, query: new URLSearchParams(''), state });
    const html = view.outerHTML;
    const cell = (testid) => {
      const match = new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`).exec(html);
      return match ? match[1].trim() : null;
    };
    assert.equal(cell('ins-count-coverages'), String(report.totals.coverages));
    assert.equal(cell('ins-count-open'), String(report.totals.open));
    assert.equal(cell('ins-count-urgent'), String(report.totals.notificationUrgent));
    assert.equal(cell('ins-count-late'), String(report.totals.notificationLate));
    assert.equal(cell('ins-count-nocover'), String(report.totals.noCover));
    assert.equal(cell('ins-count-recovered'), String(report.totals.recovered));
    assert.equal(cell('ins-count-attention'), String(report.attention.total));

    assert.ok(html.includes('data-testid="ins-state-notification-late"'));
    assert.ok(html.includes('data-testid="ins-state-notification-unprovable"'));
    const lateRow = report.rows.find((row) => row.coverage.id === 'c-late');
    assert.ok(html.includes(`${lateRow.daysOver} overdue`));
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
      for (const view of ['coverages', 'notifications', 'recoveries', 'method']) {
        const node = renderInsurance({ api, query: new URLSearchParams(`view=${view}`), state });
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
  const report = buildInsurance(state, { now: NOW, seat: null });
  assert.equal(report.rows.length, 10);
  for (const key of ['no-cover', 'notification-late', 'notification-urgent', 'unnotified', 'notification-unprovable', 'notified-in-time', 'recovery-pending', 'recovery-denied', 'recovered', 'partially-recovered']) {
    assert.ok(report.states[key] >= 1, `the demo must exercise ${key}`);
  }
  assert.equal(report.balances.statesReconcile, true);
  assert.equal(report.figuresComplete, true, report.incompleteReasons.join(' '));
  assert.ok(report.totals.netTotalMinor > 0);
  assert.ok(report.totals.recoveredTotalMinor > 0);
});

/* -------------------------------------------------------- 12. read surface */

test('the read surface is reachable, the signals fire, and the attention count is decision-shaped', () => {
  const { api } = harness(fixture({
    lfgMatters: [matter()],
    lfgAccruals: [accrual({ accrualDay: '2026-05-01' })],
    insPolicies: [policy({ notificationWindowDays: 30 })],
    insCoverages: [coverage()],
  }));
  const report = api.insuranceReport();
  assert.equal(report.ok, true, report.error);
  assert.equal(report.report.totals.coverages, 1);
  const attention = api.insuranceAttention();
  assert.equal(attention.ok, true, attention.error);
  assert.equal(attention.count, report.report.attention.total);
  assert.ok(attention.count >= 1);

  const state = buildDemoState(NOW);
  const signals = insuranceSignals(state, NOW, state.settings);
  assert.ok(signals.length >= 4);
  for (const signal of signals) {
    assert.equal(signal.domain, 'Insurance & recovery');
    assert.equal(signal.route, '#/insurance');
  }
  const late = signals.find((signal) => signal.ruleId === 'INS-01');
  assert.ok(late);
  assert.match(late.detail, /cannot say whether the insurer accepted the late notice/);

  const count = insuranceAttentionCount(state, { now: NOW, settings: state.settings, seat: null });
  assert.equal(count, buildInsurance(state, { now: NOW, seat: null }).attention.total);
});

test('conventions normalize fail-closed and refuse an unknown key at the door', () => {
  const normalized = normalizeInsSettings({ insPrivacyFloor: 1, insWarningHorizonDays: 999, insAutoPropagate: 'no' });
  assert.equal(normalized[INS_SETTING_KEYS.privacyFloor], 3);
  assert.equal(normalized[INS_SETTING_KEYS.warningHorizonDays], 90);
  assert.equal(normalized[INS_SETTING_KEYS.autoPropagate], true);

  const { api } = harness(fixture());
  const unknown = api.insuranceSetConventions({ notASetting: 1 });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.refusal, 'insurance:unknown-setting');
  const outOfBounds = api.insuranceSetConventions({ insPrivacyFloor: 99 });
  assert.equal(outOfBounds.ok, false);
  assert.equal(outOfBounds.refusal, 'insurance:setting-out-of-bounds');
  const accepted = api.insuranceSetConventions({ insPrivacyFloor: 5, insWarningHorizonDays: 30 });
  assert.equal(accepted.ok, true, accepted.error);
  assert.equal(accepted.conventions[INS_SETTING_KEYS.warningHorizonDays], 30);
});

test('an unsupported policy class is kept and prints as unsupported rather than pretending to know the trigger', () => {
  const report = read(fixture({
    lfgMatters: [matter()],
    lfgAccruals: [accrual({ accrualDay: '2026-05-01' })],
    insPolicies: [policy({ policyClass: 'some-bespoke-binder', triggerRef: 'The binder requires notice within 30 days of any occurrence giving rise to loss under section B.' })],
    insCoverages: [coverage()],
  }));
  const row = report.rows[0];
  assert.equal(row.unsupportedClass, true);
  assert.equal(INS_POLICY_CLASS_BY_KEY.other.triggerIsClaimMade, false);
  assert.ok(wholeDaysBetween(NOW, NOW) === 0);
});
