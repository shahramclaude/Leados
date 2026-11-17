// ADR-0247 — Statutory Authorisation & Licence-to-Operate Register (Schema v201).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — six empty ledgers and three declared
//      conventions, and no authority inferred from a permit, an incident, a
//      regulatory undertaking or a sourcing case;
//   2. the loaders are FAIL-CLOSED — an authority with no written instrument, a
//      reversed span, a fractional lead, a partially readable holder list, a
//      duplicate condition key, a half-closed action, an improvement notice with no
//      compliance day, a half-decided renewal and a grant that would shorten
//      validity are DROPPED with counted warnings and never repaired;
//   3. a closure recorded against a revocation is KEPT and printed as having no
//      effect — deleting it would erase the revocation, and deleting the fields
//      would erase the belief that it was lifted;
//   4. the arithmetic is EXACT — the state is a half-open instant comparison, the
//      renewal window is whole UTC calendar days, and elapsed minutes are floored;
//   5. the NINE STATES are nine different facts — in force, inside the renewal
//      window, lapsed, lapsed awaiting a decision, not yet granted, suspended,
//      revoked and prohibited are never folded into each other;
//   6. a SUBMISSION is not a grant, and only a recorded decision moves the expiry;
//   7. a CONDITION is never “met” because the licence exists — it is current, stale
//      against its own window, or unevidenced;
//   8. the MATRIX is correct — every active line holding every accountable hand is
//      resolved, a person is counted once, and the joint apex is over ALL of them;
//   9. RULE-LTO-01 is idempotent, capped, self-closing, pause-governed on every
//      path, opaque in its ask text, and observes identity-free where nobody can be
//      asked;
//  10. the DOOR refuses a duplicate live authority, a holder outside the seat, a
//      close on a revocation, a second revocation, a renewal while one is undecided,
//      a grant that shortens and a refusal carrying an expiry;
//  11. the CSV boundary is aggregate, identity-free and floored, and its summary
//      equals the reader’s own totals;
//  12. the panel prints the reader’s own figures cell by cell (display == computed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildAuthorisations, deriveLtoState } from '../../app/core/domain/authorisation.js';
import {
  normalizeLtoActions,
  normalizeLtoAuthorisations,
  normalizeLtoConditions,
  normalizeLtoEvidence,
  normalizeLtoRenewals,
  normalizeLtoSettings,
} from '../../app/core/domain/authorisationSchema.js';
import {
  instantMs,
  wholeDaysBetween,
  lapsedMinutes,
  daysToExpiry,
  renewalWindowOpensMs,
  declaredSpanDays,
} from '../../app/core/domain/authorisationMath.js';
import {
  authorisationRule,
  authorisationConditions,
  indexAuthorisationAsks,
  ltoAskSignature,
} from '../../app/core/domain/authorisationRules.js';
import {
  LTO_CSV_COLUMNS,
  LTO_CSV_SCOPE,
  LTO_SETTING_KEYS,
  LTO_STATE_BY_KEY,
} from '../../app/core/domain/authorisationRegistry.js';
import { authorisationCsvRows } from '../../app/core/domain/authorisationReport.js';
import { renderAuthorisations } from '../../app/views/authorisations.js';

const NOW = new Date('2026-11-17T09:00:00.000Z');
const T0 = NOW.toISOString();
const iso = (value) => new Date(value).toISOString();

const person = (id, managerId) => ({
  id, name: id[0].toUpperCase() + id.slice(1), managerId, role: 'Operator',
  status: 'active', startDate: '2026-01-01T09:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:00:00.000Z',
});

/** priya → mei → sam, and freya → priya on a declared PROJECT line, so sam holds two. */
function fixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.people = [person('priya', null), person('mei', 'priya'), person('sam', 'mei'), person('freya', 'priya'), person('jordan', 'mei')];
  raw.reportingLines = [{
    id: 'rl-sam-freya', personId: 'sam', managerId: 'freya', kind: 'project', shareH: 30,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  if (overrides.activeSeatId) raw.settings = { ...raw.settings, activeSeatId: overrides.activeSeatId };
  raw.ltoAuthorisations = overrides.authorisations || [authority()];
  raw.ltoConditions = overrides.conditions || [];
  raw.ltoEvidence = overrides.evidence || [];
  raw.ltoActions = overrides.actions || [];
  raw.ltoRenewals = overrides.renewals || [];
  raw.ltoMarkers = overrides.markers || [];
  return raw;
}

/**
 * A loader-valid authority for sam: granted 2025-01-01, effective expiry
 * 2027-06-01, with a 90-day renewal lead. At NOW it is IN FORCE and OUTSIDE its
 * window; overrides move it into any other state.
 */
function authority(overrides = {}) {
  return {
    id: 'aut-1',
    siteRef: 'Tank farm — north',
    activityRef: 'Bulk fuel storage and transfer',
    issuingAuthority: 'Environment Agency',
    instrumentRef: 'EPR/AB1234CD — permit rev 3',
    grantedAt: iso('2025-01-01T00:00:00.000Z'),
    expiresAt: iso('2027-06-01T00:00:00.000Z'),
    renewalLeadDays: 90,
    accountableIds: ['sam'],
    declaredById: 'mei',
    createdAt: iso('2025-01-01T00:00:00.000Z'),
    updatedAt: iso('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const condition = (overrides = {}) => ({
  id: 'con-1',
  authorisationId: 'aut-1',
  conditionKey: 'bund-inspection',
  conditionRef: 'Secondary containment bunding inspected monthly and defects remediated before further transfer.',
  maxAgeDays: 30,
  declaredById: 'mei',
  createdAt: iso('2025-01-01T00:00:00.000Z'),
  ...overrides,
});

const evidenceRow = (overrides = {}) => ({
  id: 'evd-1',
  conditionId: 'con-1',
  evidenceRef: 'BUND-2026-084 — bund inspection',
  at: iso('2026-11-07T09:00:00.000Z'),
  byId: 'mei',
  note: '',
  createdAt: iso('2026-11-07T09:00:00.000Z'),
  ...overrides,
});

const action = (overrides = {}) => ({
  id: 'act-1',
  authorisationId: 'aut-1',
  kind: 'suspension',
  servedAt: iso('2026-11-01T09:00:00.000Z'),
  effectiveFrom: iso('2026-11-01T09:00:00.000Z'),
  basisRef: 'Suspension order SUS/2026/007: pressure relief certification not produced at inspection.',
  noticeRef: 'SUS/2026/007',
  scopeRef: null,
  dueOn: null,
  recordedById: 'mei',
  closedAt: null,
  closeKind: null,
  closeBasisRef: null,
  closedById: null,
  createdAt: iso('2026-11-01T09:00:00.000Z'),
  ...overrides,
});

const renewal = (overrides = {}) => ({
  id: 'ren-1',
  authorisationId: 'aut-1',
  submittedAt: iso('2026-11-10T09:00:00.000Z'),
  basisRef: 'Renewal application EPR/AB1234CD/R1 filed with the Agency, reference ACK-2026-331.',
  submittedById: 'mei',
  decision: null,
  decidedAt: null,
  grantedExpiresAt: null,
  decidedById: null,
  note: '',
  createdAt: iso('2026-11-10T09:00:00.000Z'),
  ...overrides,
});

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildAuthorisations(load(raw), { now: NOW, seat: null, ...opts });

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

/* --------------------------------------------------------------- 1. schema */

test('schema v201 is additive: six empty ledgers, three conventions, nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 203);
  for (const key of ['ltoAuthorisations', 'ltoConditions', 'ltoEvidence', 'ltoActions', 'ltoRenewals', 'ltoMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} must be a declared collection`);
  }
  const empty = createEmptyState(T0);
  for (const key of ['ltoAuthorisations', 'ltoConditions', 'ltoEvidence', 'ltoActions', 'ltoRenewals', 'ltoMarkers']) {
    assert.deepEqual(empty[key], [], `${key} must be empty on a fresh workspace`);
  }
  assert.equal(empty.settings.ltoAutoPropagate, true);
  assert.equal(empty.settings.ltoPrivacyFloor, 3);
  assert.equal(empty.settings.ltoHorizonDays, 90);
});

test('migrating a v200 workspace adds six empty ledgers and infers no authority', () => {
  const base = createEmptyState(T0);
  base.schemaVersion = 200;
  base.ptwPermits = [{ id: 'ptw-x', areaRef: 'Tank room' }];
  delete base.ltoAuthorisations;
  delete base.ltoConditions;
  delete base.ltoEvidence;
  delete base.ltoActions;
  delete base.ltoRenewals;
  delete base.ltoMarkers;
  const migrated = migrate(base).raw;
  assert.equal(migrated.schemaVersion, 203);
  assert.deepEqual(migrated.ltoAuthorisations, [], 'a permit to work is not an authority granted by anybody');
  assert.deepEqual(migrated.ltoConditions, [], 'no condition is inferred from a permit');
  assert.deepEqual(migrated.ltoActions, []);
  assert.deepEqual(migrated.ltoRenewals, []);
  assert.equal(migrated.settings.ltoAutoPropagate, true);
});

/* -------------------------------------------------------------- 2. loaders */

test('the loader drops an authority with no written instrument, a reversed span, a fractional lead or a partial holder list', () => {
  const warnings = [];
  const rows = [
    authority({ id: 'a-ok' }),
    authority({ id: 'a-no-instrument', instrumentRef: 'short' }),
    authority({ id: 'a-reversed', expiresAt: iso('2024-01-01T00:00:00.000Z') }),
    authority({ id: 'a-fractional-lead', renewalLeadDays: 12.5 }),
    authority({ id: 'a-partial-holders', accountableIds: ['sam', 'not a valid id!'] }),
    authority({ id: 'a-no-holders', accountableIds: [] }),
  ];
  const loaded = normalizeLtoAuthorisations(rows, warnings);
  assert.deepEqual(loaded.map((row) => row.id), ['a-ok']);
  assert.match(warnings.join(' '), /5 authority row\(s\) could not be read exactly/);
});

test('the loader drops a duplicate condition key, orphan evidence, a half-closed action and an improvement notice with no day', () => {
  const authorities = normalizeLtoAuthorisations([authority()], []);
  const warnings = [];
  const conditions = normalizeLtoConditions([
    condition({ id: 'c-1' }),
    condition({ id: 'c-2', conditionKey: 'bund-inspection' }),
    condition({ id: 'c-3', conditionKey: 'leak-detection' }),
  ], authorities, warnings);
  assert.deepEqual(conditions.map((row) => row.id), ['c-1', 'c-3'], 'two windows under one key would make evidence age ambiguous');

  const evidence = normalizeLtoEvidence([
    evidenceRow({ id: 'e-1', conditionId: 'c-1' }),
    evidenceRow({ id: 'e-2', conditionId: 'c-1', at: iso('2026-11-07T09:00:00.000Z') }),
    evidenceRow({ id: 'e-3', conditionId: 'c-missing' }),
  ], conditions, warnings);
  assert.deepEqual(evidence.map((row) => row.id), ['e-1'], 'a second row at the same instant is the same row');

  const actionWarnings = [];
  const actions = normalizeLtoActions([
    action({ id: 'x-1', kind: 'improvement-notice' }),
    action({ id: 'x-2', closedAt: iso('2026-11-02T09:00:00.000Z') }),
    action({ id: 'x-3', closedAt: iso('2026-11-02T09:00:00.000Z'), closeKind: 'lifted', closeBasisRef: 'The regulator lifted the suspension in writing.', closedById: 'priya' }),
    action({ id: 'x-4', kind: 'improvement-notice', dueOn: '2026-12-01' }),
  ], authorities, actionWarnings);
  assert.deepEqual(actions.map((row) => row.id), ['x-3', 'x-4']);
  assert.match(actionWarnings.join(' '), /2 regulator-action row\(s\)/);
});

test('the loader drops a half-decided renewal, a grant that would shorten validity and a refusal carrying an expiry', () => {
  const authorities = normalizeLtoAuthorisations([authority()], []);
  const warnings = [];
  const renewals = normalizeLtoRenewals([
    renewal({ id: 'r-1' }),
    renewal({ id: 'r-2', decidedAt: iso('2026-11-11T09:00:00.000Z') }),
    renewal({ id: 'r-3', decision: 'granted', decidedAt: iso('2026-11-11T09:00:00.000Z'), grantedExpiresAt: iso('2026-06-01T00:00:00.000Z'), decidedById: 'priya' }),
    renewal({ id: 'r-4', decision: 'refused', decidedAt: iso('2026-11-11T09:00:00.000Z'), grantedExpiresAt: iso('2028-01-01T00:00:00.000Z'), decidedById: 'priya', note: 'Refused.' }),
    renewal({ id: 'r-5', decision: 'granted', decidedAt: iso('2026-11-11T09:00:00.000Z'), grantedExpiresAt: iso('2028-01-01T00:00:00.000Z'), decidedById: 'priya' }),
  ], authorities, warnings);
  assert.deepEqual(renewals.map((row) => row.id), ['r-1', 'r-5']);
  assert.match(warnings.join(' '), /3 renewal row\(s\)/);
});

test('a closure recorded against a revocation is kept and flagged, and survives a second normalisation', () => {
  const authorities = normalizeLtoAuthorisations([authority({ id: 'aut-rev' })], []);
  const revoked = {
    ...action({
      id: 'rev-1', authorisationId: 'aut-rev', kind: 'revocation',
      closedAt: iso('2026-11-05T09:00:00.000Z'), closeKind: 'lifted',
      closeBasisRef: 'Somebody recorded a lifting act against this revocation.', closedById: 'mei',
    }),
  };
  const first = normalizeLtoActions([revoked], authorities, []);
  assert.equal(first.length, 1, 'the revocation is never dropped');
  assert.equal(first[0].closeIgnored, true);
  assert.equal(first[0].closedAt, null, 'a revocation cannot be closed');
  assert.equal(first[0].ignoredClose.kind, 'lifted');

  const second = normalizeLtoActions(first, authorities, []);
  assert.equal(second[0].closeIgnored, true, 'a second normalisation must not forget the attempted lift');
  assert.equal(second[0].ignoredClose.basisRef, 'Somebody recorded a lifting act against this revocation.');
});

/* ----------------------------------------------------------- 3. arithmetic */

test('the arithmetic is exact: half-open instants, UTC calendar days and floored minutes', () => {
  assert.equal(instantMs('2026-11-17T09:00:00.000Z'), Date.parse('2026-11-17T09:00:00.000Z'));
  assert.equal(instantMs(12345), null, 'a bare number in a file is not an instant');
  // 23:59 to 00:01 is one calendar day, which is what a renewal window means.
  assert.equal(wholeDaysBetween(iso('2026-11-17T23:59:00.000Z'), iso('2026-11-18T00:01:00.000Z')), 1);
  assert.equal(daysToExpiry(Date.parse('2026-11-17T09:00:00.000Z'), Date.parse('2026-11-17T09:00:30.000Z')), 0);
  assert.equal(lapsedMinutes(Date.parse('2026-11-17T09:00:30.000Z'), Date.parse('2026-11-17T09:00:00.000Z')), 0, 'thirty seconds is not a whole minute');
  assert.equal(lapsedMinutes(Date.parse('2026-11-17T09:30:30.000Z'), Date.parse('2026-11-17T09:00:00.000Z')), 30);
  assert.equal(renewalWindowOpensMs(Date.parse('2027-01-01T00:00:00.000Z'), 90), Date.parse('2026-10-03T00:00:00.000Z'));
  assert.equal(declaredSpanDays(Date.parse('2026-01-01T00:00:00.000Z'), Date.parse('2027-01-01T00:00:00.000Z')), 365);
  assert.equal(declaredSpanDays(Date.parse('2027-01-01T00:00:00.000Z'), Date.parse('2026-01-01T00:00:00.000Z')), null);
});

/* -------------------------------------------------------------- 4. states */

test('each of the nine states is derived and none is folded into another', () => {
  const raw = fixture({
    authorisations: [
      authority({ id: 's-in-force', siteRef: 'Site A', activityRef: 'Activity A', instrumentRef: 'INST-A-000001', expiresAt: iso('2027-06-01T00:00:00.000Z') }),
      authority({ id: 's-expiring', siteRef: 'Site B', activityRef: 'Activity B', instrumentRef: 'INST-B-000001', expiresAt: iso('2026-12-15T00:00:00.000Z') }),
      authority({ id: 's-lapsed', siteRef: 'Site C', activityRef: 'Activity C', instrumentRef: 'INST-C-000001', expiresAt: iso('2026-10-01T00:00:00.000Z') }),
      authority({ id: 's-lapsed-awaiting', siteRef: 'Site D', activityRef: 'Activity D', instrumentRef: 'INST-D-000001', expiresAt: iso('2026-10-01T00:00:00.000Z') }),
      authority({ id: 's-suspended', siteRef: 'Site E', activityRef: 'Activity E', instrumentRef: 'INST-E-000001' }),
      authority({ id: 's-revoked', siteRef: 'Site F', activityRef: 'Activity F', instrumentRef: 'INST-F-000001' }),
      authority({ id: 's-prohibited', siteRef: 'Site G', activityRef: 'Activity G', instrumentRef: 'INST-G-000001' }),
      authority({ id: 's-not-yet', siteRef: 'Site H', activityRef: 'Activity H', instrumentRef: 'INST-H-000001', grantedAt: iso('2026-12-01T00:00:00.000Z'), expiresAt: iso('2027-12-01T00:00:00.000Z') }),
      authority({ id: 's-in-flight', siteRef: 'Site I', activityRef: 'Activity I', instrumentRef: 'INST-I-000001', expiresAt: iso('2027-06-01T00:00:00.000Z') }),
    ],
    actions: [
      action({ id: 'act-susp', authorisationId: 's-suspended', kind: 'suspension' }),
      action({ id: 'act-rev', authorisationId: 's-revoked', kind: 'revocation' }),
      action({ id: 'act-proh', authorisationId: 's-prohibited', kind: 'prohibition-notice' }),
    ],
    renewals: [
      renewal({ id: 'ren-lapsed', authorisationId: 's-lapsed-awaiting' }),
      renewal({ id: 'ren-inflight', authorisationId: 's-in-flight' }),
    ],
  });
  const report = read(raw);
  const byId = new Map(report.rows.map((row) => [row.authorisation.id, row.state.key]));
  assert.equal(byId.get('s-in-force'), 'in-force');
  assert.equal(byId.get('s-expiring'), 'expiring');
  assert.equal(byId.get('s-lapsed'), 'lapsed');
  assert.equal(byId.get('s-lapsed-awaiting'), 'lapsed-awaiting-decision');
  assert.equal(byId.get('s-suspended'), 'suspended');
  assert.equal(byId.get('s-revoked'), 'revoked');
  assert.equal(byId.get('s-prohibited'), 'prohibited');
  assert.equal(byId.get('s-not-yet'), 'not-yet-granted');
  assert.equal(byId.get('s-in-flight'), 'renewal-in-flight');
  assert.equal(report.stateTotal, 9);
  assert.equal(report.balances.statesReconcile, true);
});

test('a lapsed authority with no stop on the record says exactly that, and never claims the activity stopped', () => {
  const report = read(fixture({
    authorisations: [
      authority({ id: 'l-1', expiresAt: iso('2026-11-17T08:30:00.000Z') }),
      authority({ id: 'l-2', siteRef: 'Site 2', activityRef: 'Activity 2', instrumentRef: 'INST-000002 rev 1', expiresAt: iso('2026-11-17T08:30:00.000Z') }),
    ],
    actions: [action({ id: 'sus-2', authorisationId: 'l-2', kind: 'suspension' })],
  }));
  const one = report.rows.find((row) => row.authorisation.id === 'l-1');
  const two = report.rows.find((row) => row.authorisation.id === 'l-2');
  assert.equal(one.state.key, 'lapsed');
  assert.equal(one.lapsedMinutes, 30, 'thirty whole minutes since the expiry instant');
  assert.equal(one.noStopRecorded, true);
  assert.equal(two.state.key, 'suspended', 'a suspension outranks the lapse it carries');
  assert.equal(two.noStopRecorded, false);
  assert.match(LTO_STATE_BY_KEY.lapsed.says, /cannot prove the activity stopped/);
});

/* ------------------------------------------------- 5. actions and renewals */

test('an action is standing only between its effective instant and its close', () => {
  const report = read(fixture({
    authorisations: [
      authority({ id: 'a-closed' }),
      authority({ id: 'a-future-susp', siteRef: 'Site Two', activityRef: 'Activity Two', instrumentRef: 'INST-000002 rev 1' }),
    ],
    actions: [
      action({ id: 'closed', authorisationId: 'a-closed', kind: 'suspension', closedAt: iso('2026-11-05T09:00:00.000Z'), closeKind: 'lifted', closeBasisRef: 'Regulator lifted the suspension in writing.', closedById: 'priya' }),
      action({ id: 'future', authorisationId: 'a-future-susp', kind: 'suspension', servedAt: iso('2026-11-16T09:00:00.000Z'), effectiveFrom: iso('2026-12-01T09:00:00.000Z') }),
    ],
  }));
  assert.equal(report.rows.find((row) => row.authorisation.id === 'a-closed').state.key, 'in-force');
  assert.equal(report.rows.find((row) => row.authorisation.id === 'a-future-susp').state.key, 'in-force', 'an action effective later does not stand yet');
});

test('a submission does not extend the expiry, a granted decision does, and a refusal does not', () => {
  const base = read(fixture({ renewals: [renewal()] }));
  assert.equal(base.rows[0].state.key, 'renewal-in-flight');
  assert.equal(base.rows[0].effectiveExpiresAt, iso('2027-06-01T00:00:00.000Z'), 'a submission never moves the expiry');

  const granted = read(fixture({
    renewals: [renewal({ decision: 'granted', decidedAt: iso('2026-11-12T09:00:00.000Z'), grantedExpiresAt: iso('2029-01-01T00:00:00.000Z'), decidedById: 'priya', note: 'Granted for three years on the same conditions.' })],
  }));
  assert.equal(granted.rows[0].effectiveExpiresAt, iso('2029-01-01T00:00:00.000Z'));
  assert.equal(granted.rows[0].latestGrant.id, 'ren-1');

  const refused = read(fixture({
    renewals: [renewal({ decision: 'refused', decidedAt: iso('2026-11-12T09:00:00.000Z'), decidedById: 'priya', note: 'Refused pending the fire-water certificate.' })],
  }));
  assert.equal(refused.rows[0].effectiveExpiresAt, iso('2027-06-01T00:00:00.000Z'), 'a refusal takes no expiry');
  assert.equal(refused.rows[0].state.key, 'in-force');
  assert.equal(refused.totals.renewalRefused, 1);
});

/* ------------------------------------------------------------ 6. conditions */

test('a condition is current, stale against its own window, or unevidenced — never “met” because the licence exists', () => {
  const report = read(fixture({
    conditions: [
      condition({ id: 'c-current', conditionKey: 'bund' }),
      condition({ id: 'c-stale', conditionKey: 'throughput', maxAgeDays: 30 }),
      condition({ id: 'c-none', conditionKey: 'fire-water', maxAgeDays: 365 }),
      condition({ id: 'c-no-window', conditionKey: 'register', maxAgeDays: 0 }),
    ],
    evidence: [
      evidenceRow({ id: 'e-current', conditionId: 'c-current', at: iso('2026-11-07T09:00:00.000Z') }),
      evidenceRow({ id: 'e-stale', conditionId: 'c-stale', at: iso('2026-09-01T09:00:00.000Z') }),
      evidenceRow({ id: 'e-nowindow', conditionId: 'c-no-window', at: iso('2020-01-01T09:00:00.000Z') }),
    ],
  }));
  const states = Object.fromEntries(report.rows[0].conditionRows.map((row) => [row.condition.conditionKey, row.state.key]));
  assert.equal(states.bund, 'current');
  assert.equal(states.throughput, 'stale');
  assert.equal(states['fire-water'], 'unevidenced');
  assert.equal(states.register, 'current', 'a declared 0-day window means no window, not “always stale”');
  assert.equal(report.totals.conditionsUnevidenced, 1);
  assert.equal(report.totals.conditionsStale, 1);
  assert.equal(report.figuresComplete, true);
});

/* ---------------------------------------------------------------- 7. matrix */

test('the matrix resolves every line holding every accountable hand and computes one joint apex', () => {
  const report = read(fixture({
    authorisations: [authority({ accountableIds: ['sam', 'freya'] })],
  }));
  const row = report.rows[0];
  assert.equal(row.holderRows.length, 2);
  const sam = row.holderRows.find((holder) => holder.personId === 'sam');
  assert.deepEqual(sam.lines.map((line) => line.managerId).sort(), ['freya', 'mei'], 'both active lines are visible');
  assert.deepEqual(row.managerIds.sort(), ['freya', 'mei', 'priya'].filter((id) => row.managerIds.includes(id)).sort());
  assert.deepEqual(row.apex.apexIds, ['priya'], 'the joint apex above mei and freya is priya');
  assert.equal(report.totals.holders, 2, 'two distinct people, counted once each');
});

test('a holder off the graph is printed as an orphan rather than deleted, and coverage is not certified', () => {
  const report = read(fixture({
    authorisations: [authority({ accountableIds: ['sam', 'ghost'] })],
  }));
  const row = report.rows[0];
  assert.equal(report.rows.length, 1, 'the live authority is never dropped for an orphan hand');
  assert.equal(row.orphan, false);
  assert.deepEqual(row.orphanHolders, ['ghost']);
  assert.equal(report.orphanHolderN, 1);
  assert.equal(report.figuresComplete, false);
  assert.match(report.incompleteReasons.join(' '), /not on the reporting graph/);
});

/* ------------------------------------------------------------------ 8. rule */

test('RULE-LTO-01 derives its five conditions from the one reader, and names no site in its asks', () => {
  const report = read(fixture({
    authorisations: [
      authority({ id: 'r-lapsed', siteRef: 'Secret Site One', activityRef: 'Secret Activity', instrumentRef: 'SECRET-INSTRUMENT-1', expiresAt: iso('2026-10-01T00:00:00.000Z') }),
      authority({ id: 'r-expiring', siteRef: 'Secret Site Two', activityRef: 'Other Activity', instrumentRef: 'SECRET-INSTRUMENT-2', expiresAt: iso('2026-12-01T00:00:00.000Z') }),
      authority({ id: 'r-notice', siteRef: 'Secret Site Three', activityRef: 'Third Activity', instrumentRef: 'SECRET-INSTRUMENT-3' }),
    ],
    conditions: [
      condition({ id: 'r-con', authorisationId: 'r-lapsed', conditionKey: 'bund', conditionRef: 'Bunding inspected monthly and defects remediated before transfer.' }),
    ],
    actions: [
      action({ id: 'r-imp', authorisationId: 'r-notice', kind: 'improvement-notice', dueOn: '2026-11-01' }),
      action({ id: 'r-pro', authorisationId: 'r-notice', kind: 'prohibition-notice', scopeRef: 'Night loading' }),
    ],
  }));
  const { conditions } = authorisationConditions(report);
  const kinds = new Set(conditions.map((row) => row.kind));
  for (const kind of ['lapsed', 'expiring', 'conditions', 'prohibition', 'improvement-overdue']) {
    assert.ok(kinds.has(kind), `${kind} must be derived`);
  }
  assert.ok(conditions.every((row) => row.signature.startsWith('lto1:')));

  const draft = JSON.parse(JSON.stringify(load(fixture({
    authorisations: [authority({ id: 'r-lapsed', siteRef: 'Secret Site One', activityRef: 'Secret Activity', instrumentRef: 'SECRET-INSTRUMENT-1', expiresAt: iso('2026-10-01T00:00:00.000Z') })],
  }))));
  let sequence = 0;
  const effects = authorisationRule(draft, { event: { type: 'authorisation.declared' }, now: NOW, idFactory: (prefix) => `${prefix}-r-${++sequence}` });
  assert.ok(effects.length > 0);
  const taskIds = effects.filter((effect) => effect.action === 'delegated').map((effect) => effect.targetId);
  assert.ok(taskIds.length > 0);
  const tasks = draft.delegations.filter((task) => taskIds.includes(task.id));
  const text = JSON.stringify(tasks);
  assert.ok(!text.includes('Secret Site One'), 'the ask names no site');
  assert.ok(!text.includes('Secret Activity'), 'the ask names no activity');
  assert.ok(!text.includes('SECRET-INSTRUMENT-1'), 'the ask names no instrument');
  assert.ok(!text.includes('Sam'), 'the ask names no accountable hand');
  assert.ok(indexAuthorisationAsks(draft).every((ask) => !ask.signature.includes('Secret')));
});

test('RULE-LTO-01 is idempotent, capped, self-closing and pause-governed', () => {
  const many = Array.from({ length: 6 }, (_, index) => authority({
    id: `cap-${index}`,
    siteRef: `Site ${index}`,
    activityRef: `Activity ${index}`,
    instrumentRef: `INST-CAP-00000${index}`,
    expiresAt: iso('2026-10-01T00:00:00.000Z'),
  }));
  const draft = JSON.parse(JSON.stringify(load(fixture({ authorisations: many }))));
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-c-${++sequence}`;
  const effects = authorisationRule(draft, { event: { type: 'authorisation.declared' }, now: NOW, idFactory });
  assert.equal(indexAuthorisationAsks(draft).length, 4, 'at most four new asks per commit');
  assert.ok(effects.some((effect) => effect.action === 'deferred'));

  const two = JSON.parse(JSON.stringify(load(fixture({
    authorisations: [
      authority({ id: 'i-1', expiresAt: iso('2026-10-01T00:00:00.000Z') }),
      authority({ id: 'i-2', siteRef: 'Site Two', activityRef: 'Activity Two', instrumentRef: 'INST-000002 rev 1', expiresAt: iso('2026-10-01T00:00:00.000Z') }),
    ],
  }))));
  const first = authorisationRule(two, { event: { type: 'authorisation.declared' }, now: NOW, idFactory });
  const second = authorisationRule(two, { event: { type: 'authorisation.declared' }, now: NOW, idFactory });
  assert.ok(first.length >= 2);
  assert.equal(indexAuthorisationAsks(two).filter((ask) => ask.task?.status === 'active').length, first.filter((effect) => effect.action === 'delegated').length);
  assert.equal(second.filter((effect) => effect.action === 'delegated').length, 0, 'a second pass re-files nothing');

  // Clearing the condition closes the rule's own asks with the rule’s own note.
  const cleared = JSON.parse(JSON.stringify(two));
  cleared.ltoAuthorisations = [];
  const closed = authorisationRule(cleared, { event: { type: 'authorisation.declared' }, now: NOW, idFactory: (prefix) => `${prefix}-d-${++sequence}` });
  assert.ok(closed.some((effect) => effect.action === 'closed'));
  assert.ok(cleared.delegations.every((task) => task.status !== 'active' || !String(task.title).includes('statutory authority')));

  const paused = JSON.parse(JSON.stringify(two));
  paused.settings = { ...paused.settings, ltoAutoPropagate: false };
  assert.deepEqual(authorisationRule(paused, { event: { type: 'authorisation.declared' }, now: NOW, idFactory }), []);
});

test('where no line can be asked, the rule writes one identity-free observation and substitutes nobody', () => {
  const draft = JSON.parse(JSON.stringify(load(fixture({
    authorisations: [authority({ accountableIds: ['ghost'], expiresAt: iso('2026-10-01T00:00:00.000Z') })],
  }))));
  let sequence = 0;
  authorisationRule(draft, { event: { type: 'authorisation.declared' }, now: NOW, idFactory: (prefix) => `${prefix}-m-${++sequence}` });
  assert.equal(indexAuthorisationAsks(draft).length, 0, 'nobody is invented');
  assert.ok(draft.ltoMarkers.length >= 1);
  assert.match(draft.ltoMarkers[0].detail, /no seat can be asked/);
  assert.ok(!JSON.stringify(draft.ltoMarkers).includes('Tank farm'));
});

/* ------------------------------------------------------------------ 9. door */

test('the door declares an authority on its instrument and reloads the stored row exactly', () => {
  const { api, store } = harness(fixture({ authorisations: [] }));
  const result = api.authorisationDeclare({
    siteRef: 'Tank farm — south',
    activityRef: 'Solvent storage',
    issuingAuthority: 'Environment Agency',
    instrumentRef: 'EPR/ZZ9988 — permit rev 1',
    grantedAt: iso('2026-01-01T00:00:00.000Z'),
    expiresAt: iso('2027-01-01T00:00:00.000Z'),
    renewalLeadDays: 90,
    accountableIds: ['sam', 'freya'],
  });
  assert.equal(result.ok, true, result.error);
  const stored = store.state.ltoAuthorisations[0];
  const reloaded = normalizeLtoAuthorisations(store.state.ltoAuthorisations, []);
  assert.equal(reloaded.length, 1);
  assert.deepEqual(reloaded[0], stored, 'the stored row is the row the loader returns');
  assert.deepEqual(stored.accountableIds, ['sam', 'freya']);
});

test('the door refuses a duplicate live authority, a holder outside the seat, a close on a revocation and a second revocation', () => {
  const duplicate = harness(fixture()).api.authorisationDeclare({
    siteRef: 'Tank farm — north', activityRef: 'Bulk fuel storage and transfer', issuingAuthority: 'Environment Agency',
    instrumentRef: 'EPR/AB1234CD — permit rev 3', grantedAt: iso('2026-01-01T00:00:00.000Z'),
    expiresAt: iso('2028-01-01T00:00:00.000Z'), renewalLeadDays: 90, accountableIds: ['sam'],
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.refusal, 'authorisation:duplicate-authority');
  assert.match(duplicate.error, /already on the record/);

  const seatBound = harness(fixture({ authorisations: [], activeSeatId: 'mei' }));
  const notMine = seatBound.api.authorisationDeclare({
    siteRef: 'Other site', activityRef: 'Other activity', issuingAuthority: 'A regulator',
    instrumentRef: 'INST-OTHER-0001 rev 1', grantedAt: iso('2026-01-01T00:00:00.000Z'),
    expiresAt: iso('2027-01-01T00:00:00.000Z'), renewalLeadDays: 30, accountableIds: ['freya'],
  });
  assert.equal(notMine.ok, false);
  assert.equal(notMine.refusal, 'authorisation:holder-not-your-person');

  const revoked = harness(fixture({ actions: [action({ id: 'rev-1', kind: 'revocation' })] }));
  const closeRevocation = revoked.api.authorisationCloseAction({
    actionId: 'rev-1', closeKind: 'lifted', closedAt: iso('2026-11-10T09:00:00.000Z'), closeBasisRef: 'An attempt to lift a revocation that cannot be lifted.',
  });
  assert.equal(closeRevocation.ok, false);
  assert.equal(closeRevocation.refusal, 'authorisation:not-closable');

  const secondRevocation = revoked.api.authorisationRecordAction({
    authorisationId: 'aut-1', kind: 'revocation', servedAt: iso('2026-11-16T09:00:00.000Z'),
    effectiveFrom: iso('2026-11-16T09:00:00.000Z'), basisRef: 'A second revocation notice served on the same authority.',
  });
  assert.equal(secondRevocation.ok, false);
  assert.equal(secondRevocation.refusal, 'authorisation:already-revoked');
});

test('the door refuses a renewal while one is undecided, a grant that shortens validity and a refusal carrying an expiry', () => {
  const { api, store } = harness(fixture({ renewals: [renewal()] }));
  const pending = api.authorisationSubmitRenewal({
    authorisationId: 'aut-1', submittedAt: iso('2026-11-16T09:00:00.000Z'), basisRef: 'A second renewal application filed while the first is undecided.',
  });
  assert.equal(pending.ok, false);
  assert.equal(pending.refusal, 'authorisation:renewal-pending');

  const shortens = api.authorisationDecideRenewal({
    renewalId: 'ren-1', decision: 'granted', decidedAt: iso('2026-11-16T09:00:00.000Z'),
    grantedExpiresAt: iso('2026-12-01T00:00:00.000Z'), note: 'Granted, but on a new expiry earlier than the existing one.',
  });
  assert.equal(shortens.ok, false);
  assert.equal(shortens.refusal, 'authorisation:grant-shortens');
  assert.equal(store.state.ltoRenewals[0].decision, null, 'a refused write changes nothing');

  const refusalWithExpiry = api.authorisationDecideRenewal({
    renewalId: 'ren-1', decision: 'refused', decidedAt: iso('2026-11-16T09:00:00.000Z'),
    grantedExpiresAt: iso('2029-01-01T00:00:00.000Z'), note: 'Refused, and no new expiry belongs on a refusal.',
  });
  assert.equal(refusalWithExpiry.ok, false);
  assert.equal(refusalWithExpiry.refusal, 'authorisation:refusal-with-expiry');
});

test('the door records evidence only later than the last evidence on that condition', () => {
  const { api } = harness(fixture({ conditions: [condition()], evidence: [evidenceRow()] }));
  const backwards = api.authorisationRecordEvidence({
    conditionId: 'con-1', evidenceRef: 'BUND-2026-070 — earlier inspection', at: iso('2026-10-01T09:00:00.000Z'),
  });
  assert.equal(backwards.ok, false);
  assert.equal(backwards.refusal, 'authorisation:evidence-not-later');
  const same = api.authorisationRecordEvidence({
    conditionId: 'con-1', evidenceRef: 'BUND-2026-084 — the same inspection again', at: iso('2026-11-07T09:00:00.000Z'),
  });
  assert.equal(same.ok, false);
  const later = api.authorisationRecordEvidence({
    conditionId: 'con-1', evidenceRef: 'BUND-2026-091 — re-inspection after the spall repair', at: iso('2026-11-15T09:00:00.000Z'),
  });
  assert.equal(later.ok, true, later.error);
});

/* ------------------------------------------------------------------ 10. CSV */

test('the CSV is identity-free, its summary equals the reader, and a sub-floor state exports blank', () => {
  const state = load(fixture({
    authorisations: [
      authority({ id: 'csv-1', siteRef: 'Secret Site Alpha', activityRef: 'Secret Activity Alpha', instrumentRef: 'SECRET-INSTRUMENT-ALPHA', expiresAt: iso('2027-09-01T00:00:00.000Z') }),
    ],
    conditions: [condition({ conditionKey: 'bund' })],
    evidence: [evidenceRow()],
  }));
  const report = buildAuthorisations(state, { now: NOW, seat: null });
  const rows = authorisationCsvRows(report);
  const csvText = JSON.stringify(rows);
  for (const secret of ['Secret Site Alpha', 'Secret Activity Alpha', 'SECRET-INSTRUMENT-ALPHA', 'Environment Agency', 'Tank farm', 'mei', 'sam']) {
    assert.ok(!csvText.includes(secret), `${secret} must not cross the export boundary`);
  }
  const summary = rows.find((row) => row.row_kind === 'summary');
  assert.equal(summary.authorisations_n, report.totals.authorisations);
  assert.equal(summary.conditions_unevidenced_n, report.totals.conditionsUnevidenced);
  assert.equal(summary.holders_n, report.totals.holders);
  assert.equal(summary.lapsed_minutes_total, report.totals.lapsedMinutesTotal);
  assert.equal(summary.complete, report.figuresComplete ? 1 : 0);
  const inForce = rows.find((row) => row.row_kind === 'state' && row.key === 'in-force');
  assert.equal(inForce.authorisations_n, '', 'one authority is below the declared floor and is withheld');
  assert.match(inForce.blank_reason, /privacy floor of 3/);
  const zero = rows.find((row) => row.row_kind === 'state' && row.key === 'revoked');
  assert.equal(zero.authorisations_n, 0, 'a computed zero is exported as a zero');
  assert.equal(rows[0] && Object.keys(rows[0]).length, LTO_CSV_COLUMNS.length);

  const file = exportWorkspaceCsv(state, LTO_CSV_SCOPE);
  assert.equal(file.ok, true, file.error);
  const parsed = parseCsv(file.csv);
  assert.equal(parsed.headers.length, LTO_CSV_COLUMNS.length);
  assert.ok(parsed.rows.length >= 2);
});

/* ---------------------------------------------------------------- 11. panel */

test('the panel prints the reader’s own figures cell by cell (display == computed)', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const raw = fixture({
      authorisations: [
        authority({ id: 'p-lapsed', siteRef: 'Site P', activityRef: 'Activity P', instrumentRef: 'INST-P-000001 rev 1', expiresAt: iso('2026-11-17T08:30:00.000Z') }),
        authority({ id: 'p-expiring', siteRef: 'Site Q', activityRef: 'Activity Q', instrumentRef: 'INST-Q-000001 rev 1', expiresAt: iso('2026-12-15T00:00:00.000Z') }),
      ],
      conditions: [condition({ id: 'p-con', authorisationId: 'p-lapsed' })],
    });
    const state = load(raw);
    const report = buildAuthorisations(state, { now: NOW, seat: null });
    const { api } = harness(raw);
    const view = renderAuthorisations({ api, query: new URLSearchParams(''), state });
    const html = view.outerHTML;
    const cell = (testid) => {
      const match = new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`).exec(html);
      return match ? match[1].trim() : null;
    };
    assert.equal(cell('lto-count-authorisations'), String(report.totals.authorisations));
    assert.equal(cell('lto-count-inforce'), String(report.totals.inForce));
    assert.equal(cell('lto-count-expiring'), String(report.totals.expiring));
    assert.equal(cell('lto-count-lapsed'), String(report.totals.lapsed + report.totals.lapsedAwaiting));
    assert.equal(cell('lto-count-suspended'), String(report.totals.suspended));
    assert.equal(cell('lto-count-prohibited'), String(report.totals.prohibited));
    assert.equal(cell('lto-count-unevidenced'), String(report.totals.conditionsUnevidenced));
    assert.equal(cell('lto-count-attention'), String(report.attention.total));
    assert.ok(html.includes('data-testid="lto-state-lapsed"'));
    assert.ok(html.includes('30 min lapsed'), 'the exact computed lapse is printed, not a rounded label');
    const conditionTab = renderAuthorisations({ api, query: new URLSearchParams('view=conditions'), state }).outerHTML;
    assert.ok(conditionTab.includes('data-testid="lto-condition-unevidenced"'));
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});

test('the panel renders every tab without throwing on an empty workspace', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const raw = fixture({ authorisations: [] });
    const state = load(raw);
    const { api } = harness(raw);
    for (const view of ['register', 'conditions', 'actions', 'method']) {
      const node = renderAuthorisations({ api, query: new URLSearchParams(`view=${view}`), state });
      assert.ok(node.outerHTML.length > 0);
    }
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});

/* ----------------------------------------------------------------- 12. demo */

test('the demo seeds one authority for each of the nine states and the overdue notice', () => {
  const state = buildDemoState(NOW);
  const report = buildAuthorisations(state, { now: NOW, seat: null });
  assert.equal(report.rows.length, 9);
  for (const key of ['in-force', 'expiring', 'lapsed', 'lapsed-awaiting-decision', 'not-yet-granted', 'renewal-in-flight', 'suspended', 'revoked', 'prohibited']) {
    assert.ok(report.states[key] >= 1, `the demo must exercise ${key}`);
  }
  assert.equal(report.totals.improvementOverdue, 1);
  assert.equal(report.totals.conditionsUnevidenced, 1);
  assert.equal(report.totals.conditionsStale, 1);
  assert.equal(report.totals.closeIgnored, 1, 'the demo shows a close recorded against a revocation');
  assert.equal(report.balances.statesReconcile, true);
  assert.equal(report.figuresComplete, true, report.incompleteReasons.join(' '));
});

test('the conventions normalize fail-closed and refuse an unknown key at the door', () => {
  const normalized = normalizeLtoSettings({ ltoPrivacyFloor: 1, ltoHorizonDays: 999, ltoAutoPropagate: 'no' });
  assert.equal(normalized[LTO_SETTING_KEYS.privacyFloor], 2, 'clamped on load, never left out of bounds');
  assert.equal(normalized[LTO_SETTING_KEYS.horizonDays], 365);
  assert.equal(normalized[LTO_SETTING_KEYS.autoPropagate], true, 'only an explicit false pauses the rule');

  const { api } = harness(fixture());
  const unknown = api.authorisationSetConventions({ notASetting: 1 });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.refusal, 'authorisation:unknown-setting');
  const outOfBounds = api.authorisationSetConventions({ ltoPrivacyFloor: 99 });
  assert.equal(outOfBounds.ok, false);
  assert.equal(outOfBounds.refusal, 'authorisation:setting-out-of-bounds');
  const accepted = api.authorisationSetConventions({ ltoPrivacyFloor: 5, ltoHorizonDays: 30 });
  assert.equal(accepted.ok, true, accepted.error);
});
