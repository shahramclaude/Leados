// ADR-0244 — Mutual-Aid Activation & Resource-Commitment Register (Schema v198).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — seven empty ledgers and three declared
//      conventions, and no agreement, request, acceptance, arrival, withdrawal
//      or release inferred from an incident record, a delegation or a prior
//      arrangement;
//   2. the loaders are FAIL-CLOSED — an agreement with no written reference, a
//      request with no agreement, subject, validity or requesting line, an
//      acceptance with no written confirmation, a second acceptance, an arrival
//      with no acceptance, a withdrawal or release with no acceptance, and a
//      cancellation dated before its request are DROPPED with counted warnings
//      and never repaired;
//   3. ORDERING BREACHES ARE KEPT, NEVER REPAIRED — a release dated before its
//      withdrawal, a cancellation dated after the acceptance, and a request
//      opened under an agreement that had expired survive the loader and print
//      the exact days;
//   4. the arithmetic is EXACT — the validity close, the days overdue, the days
//      late, the release due day and the coverage shortfalls are whole days and
//      whole quantities computed from the record's own declarations;
//   5. A REQUEST IS NEVER A PROMISE — a request that closes with no acceptance
//      is `request-lapsed`, never a live commitment;
//   6. the DOOR refuses to create a breach — an acceptance without a written
//      confirmation, a second acceptance, an arrival without a promise, a
//      withdrawal without an acceptance, a release before the help left, a
//      cancellation after the acceptance, and a request under a lapsed
//      agreement;
//   7. the ACCEPTANCE IS COMPARED AGAINST THE ASK and the ARRIVAL AGAINST THE
//      PROMISE, line by line, with exact shortfalls;
//   8. the MATRIX is correct — the joint apex is computed through the one
//      engine, a single line cannot commit another line's request, and a person
//      is counted once;
//   9. RULE-MAA-01 is idempotent, capped, self-closing, pause-governed on every
//      path, opaque in its ask text, and observes identity-free where nobody can
//      be asked;
//  10. the CSV boundary is aggregate and identity-free, exports a withheld count
//      BLANK with its reason, and keeps `complete` apart from the counts;
//  11. the panel prints the reader's own figures cell by cell (display ==
//      computed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildMutualAid, deriveMutualAidRequest } from '../../app/core/domain/mutualAid.js';
import {
  normalizeMutualAidAcceptances,
  normalizeMutualAidAgreements,
  normalizeMutualAidArrivals,
  normalizeMutualAidMarkers,
  normalizeMutualAidReleases,
  normalizeMutualAidRequests,
  normalizeMutualAidSettings,
  normalizeMutualAidWithdrawals,
} from '../../app/core/domain/mutualAidSchema.js';
import {
  mutualAidRule,
  mutualAidConditions,
  indexMutualAidAsks,
  mutualAidAskSignature,
} from '../../app/core/domain/mutualAidRules.js';
import {
  MAA_CSV_COLUMNS,
  MAA_CSV_SCOPE,
  MAA_SETTING_KEYS,
} from '../../app/core/domain/mutualAidRegistry.js';
import { mutualAidCsvRows } from '../../app/core/domain/mutualAidReport.js';
import { renderMutualAid } from '../../app/views/mutualAid.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';

const NOW = new Date('2026-11-17T09:00:00.000Z');
const T0 = NOW.toISOString();
const day = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const dayF = (n) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

const person = (id, managerId, overrides = {}) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  managerId,
  role: 'Lead',
  status: 'active',
  startDate: '2026-01-01',
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T09:00:00.000Z',
  ...overrides,
});

/**
 * priya leads mei and freya; sam reports to mei, and also holds a declared
 * PROJECT line to freya. A two-line request (lines mei + freya) therefore has
 * exactly one joint seat above it — priya — which is the matrix case the door
 * and the rule are built for.
 */
function fixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.people = [
    person('priya', null, { level: 'director' }),
    person('mei', 'priya', { level: 'manager' }),
    person('freya', 'priya', { level: 'manager' }),
    person('sam', 'mei', { level: 'ic' }),
  ];
  raw.reportingLines = [{
    id: 'rl-sam-freya', personId: 'sam', managerId: 'freya', kind: 'project', shareH: 30,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  if (overrides.activeSeatId) raw.settings = { ...raw.settings, activeSeatId: overrides.activeSeatId };
  raw.mutualAidAgreements = overrides.agreements !== undefined ? overrides.agreements : [agreement()];
  raw.mutualAidRequests = overrides.requests !== undefined ? overrides.requests : [request()];
  raw.mutualAidAcceptances = overrides.acceptances || [];
  raw.mutualAidArrivals = overrides.arrivals || [];
  raw.mutualAidWithdrawals = overrides.withdrawals || [];
  raw.mutualAidReleases = overrides.releases || [];
  raw.mutualAidMarkers = overrides.markers || [];
  return raw;
}

function agreement(overrides = {}) {
  return {
    id: 'agr-1',
    partnerOrg: 'Ringkøbing Plant',
    agreementRef: 'Mutual Aid Agreement 2024-R1 with Ringkøbing Plant, clause 3 — reciprocal assistance',
    agreedOn: '2026-01-06',
    expiresOn: null,
    scopeNote: 'Personnel, pumps and transport for plant-level incidents.',
    declaredById: 'leader',
    createdAt: '2026-01-06T09:00:00.000Z',
    updatedAt: '2026-01-06T09:00:00.000Z',
    ...overrides,
  };
}

/** A personnel request opened 12 days ago with a five-day validity (closed 7 days ago). */
function request(overrides = {}) {
  return {
    id: 'req-1',
    agreementId: 'agr-1',
    subject: 'Two responders and a pump for the flooding at the river-side yard',
    kind: 'personnel',
    openedOn: day(12),
    validityDays: 5,
    requestingLineIds: ['mei'],
    askedLines: [{ kind: 'personnel', quantity: 2 }, { kind: 'equipment', quantity: 1 }],
    cancelledOn: null,
    cancelledById: null,
    declaredById: 'mei',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function acceptance(overrides = {}) {
  return {
    id: 'acc-1',
    requestId: 'req-1',
    acceptedOn: day(3),
    confirmationRef: 'Ringkøbing duty officer message, reference RKP-2026-11-04-B, confirming one pump and one responder',
    acceptingHand: 'Ringkøbing duty officer',
    promisedArrivalOn: dayF(1),
    promisedLines: [{ kind: 'equipment', quantity: 1 }, { kind: 'personnel', quantity: 1 }],
    recordedById: 'mei',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildMutualAid(load(raw), { now: NOW, seat: null, ...opts });

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

test('schema v198 was additive: seven empty ledgers, three conventions, nothing inferred', () => {
  const empty = createEmptyState(T0);
  // ADR-0245 moved the world schema to v199; the mutual-aid ledgers are unchanged,
  // so this suite pins the FACTS it owns and follows the current version.
  assert.equal(SCHEMA_VERSION, 202);
  for (const key of ['mutualAidAgreements', 'mutualAidRequests', 'mutualAidAcceptances', 'mutualAidArrivals', 'mutualAidWithdrawals', 'mutualAidReleases', 'mutualAidMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
    assert.deepEqual(empty[key], [], `${key} starts empty`);
  }
  const loaded = normalizeState(createEmptyState(T0), { now: NOW }).state;
  assert.equal(loaded.settings[MAA_SETTING_KEYS.autoPropagate], true);
  assert.equal(loaded.settings[MAA_SETTING_KEYS.privacyFloor], 3);
  assert.equal(loaded.settings[MAA_SETTING_KEYS.releaseGraceDays], 7);
  // Nothing is inferred from an incident record, a delegation or a prior arrangement.
  assert.deepEqual(loaded.mutualAidRequests, []);
  assert.deepEqual(loaded.mutualAidAcceptances, []);
});

test('the 197 -> 198 migration adds seven empty ledgers and the conventions, nothing else', () => {
  const v197 = { ...createEmptyState(T0), schemaVersion: 197 };
  const { raw: out } = migrate(v197, { now: NOW });
  // Migration runs through to the current version; the order is what is pinned here.
  assert.equal(out.schemaVersion, SCHEMA_VERSION);
  for (const key of ['mutualAidAgreements', 'mutualAidRequests', 'mutualAidAcceptances', 'mutualAidArrivals', 'mutualAidWithdrawals', 'mutualAidReleases', 'mutualAidMarkers']) {
    assert.deepEqual(out[key], [], `${key} migrates empty`);
  }
  assert.equal(out.settings[MAA_SETTING_KEYS.releaseGraceDays], 7);
  // No request validity is manufactured at upgrade time.
  assert.equal(out.settings.maaValidityDays, undefined);
});

/* --------------------------------------------------------------- 2. loaders */

test('the loaders are fail-closed: unreadable rows are dropped with counted warnings, never repaired', () => {
  const warnings = [];
  // An agreement with no written reference is dropped.
  assert.deepEqual(normalizeMutualAidAgreements([agreement({ agreementRef: 'x' })], warnings), []);
  assert.ok(warnings.some((w) => w.includes('agreement row')));
  warnings.length = 0;
  // An agreement whose term ends before it begins is dropped.
  assert.deepEqual(normalizeMutualAidAgreements([agreement({ agreedOn: '2026-05-01', expiresOn: '2026-01-01' })], warnings), []);

  const agreements = [agreement()];
  // A request with no agreement, no subject, no validity or no requesting line is dropped.
  assert.deepEqual(normalizeMutualAidRequests([request({ agreementId: 'nope' })], agreements, warnings), []);
  assert.deepEqual(normalizeMutualAidRequests([request({ subject: 'x' })], agreements, warnings), []);
  assert.deepEqual(normalizeMutualAidRequests([request({ validityDays: 0 })], agreements, warnings), []);
  assert.deepEqual(normalizeMutualAidRequests([request({ requestingLineIds: [] })], agreements, warnings), []);
  // A request with an unreadable resource line is dropped.
  assert.deepEqual(normalizeMutualAidRequests([request({ askedLines: [{ kind: 'nonsense', quantity: 2 }] })], agreements, warnings), []);
  assert.deepEqual(normalizeMutualAidRequests([request({ askedLines: [{ kind: 'personnel', quantity: 0 }] })], agreements, warnings), []);
  assert.ok(warnings.some((w) => w.includes('request row')));

  const requests = normalizeMutualAidRequests([request()], agreements, []);
  warnings.length = 0;
  // An acceptance with no written confirmation is dropped.
  assert.deepEqual(normalizeMutualAidAcceptances([acceptance({ confirmationRef: 'x' })], requests, warnings), []);
  // A second acceptance to the same request is dropped.
  const second = acceptance({ id: 'acc-2' });
  assert.deepEqual(normalizeMutualAidAcceptances([acceptance(), second], requests, warnings), [acceptance()]);
  assert.ok(warnings.some((w) => w.includes('acceptance row')));
  warnings.length = 0;
  // An arrival with no acceptance, and a second arrival, are dropped.
  const accs = normalizeMutualAidAcceptances([acceptance()], requests, []);
  assert.deepEqual(normalizeMutualAidArrivals([{ id: 'arr-1', acceptanceId: 'nope', arrivedOn: day(1), arrivedLines: [{ kind: 'personnel', quantity: 1 }], recordedById: 'mei' }], accs, warnings), []);
  assert.deepEqual(normalizeMutualAidArrivals([
    { id: 'arr-1', acceptanceId: 'acc-1', arrivedOn: day(1), arrivedLines: [{ kind: 'personnel', quantity: 1 }], recordedById: 'mei' },
    { id: 'arr-2', acceptanceId: 'acc-1', arrivedOn: day(2), arrivedLines: [{ kind: 'personnel', quantity: 1 }], recordedById: 'mei' },
  ], accs, warnings), [{ id: 'arr-1', acceptanceId: 'acc-1', arrivedOn: day(1), arrivedLines: [{ kind: 'personnel', quantity: 1 }], note: '', recordedById: 'mei', createdAt: '', updatedAt: '' }]);
  assert.ok(warnings.some((w) => w.includes('arrival row')));
  warnings.length = 0;
  // A withdrawal or release with no acceptance is dropped.
  assert.deepEqual(normalizeMutualAidWithdrawals([{ id: 'wdr-1', acceptanceId: 'nope', withdrawnOn: day(1), recordedById: 'mei' }], accs, warnings), []);
  assert.deepEqual(normalizeMutualAidReleases([{ id: 'rel-1', acceptanceId: 'nope', releasedOn: day(1), recordedById: 'mei' }], accs, [], warnings), []);
  assert.ok(warnings.some((w) => w.includes('withdrawal row')));
  assert.ok(warnings.some((w) => w.includes('release row')));
});

test('a cancellation dated before its request is dropped; one dated after an acceptance is KEPT as a breach', () => {
  const warnings = [];
  const agreements = [agreement()];
  // Before the request existed: an unreadable pairing, dropped.
  assert.deepEqual(normalizeMutualAidRequests([request({ cancelledOn: day(20) })], agreements, warnings), []);
  // After the acceptance: the exact ordering fact, kept.
  const requests = normalizeMutualAidRequests([request({ cancelledOn: day(1) })], agreements, []);
  const accs = normalizeMutualAidAcceptances([acceptance({ acceptedOn: day(3) })], requests, []);
  assert.equal(accs.length, 1);
  const report = read(fixture({
    requests,
    acceptances: accs,
  }));
  const row = report.rows[0];
  assert.equal(row.state.key, 'breach-cancelled-after-acceptance');
  assert.ok(row.breaches.some((b) => b.key === 'cancelled-after-acceptance' && b.earlyDays === 2));
});

test('the loader keeps a release dated before its withdrawal and a request under an expired agreement', () => {
  // Release before withdrawal: kept, printed with the exact days.
  const acc = acceptance({ promisedArrivalOn: day(1) });
  const reqs = [request()];
  const accs = [acc];
  const wdr = { id: 'wdr-1', acceptanceId: 'acc-1', withdrawnOn: day(5), note: '', recordedById: 'mei', createdAt: '', updatedAt: '' };
  const rel = { id: 'rel-1', acceptanceId: 'acc-1', releasedOn: day(8), note: '', recordedById: 'mei', createdAt: '', updatedAt: '' };
  const report = read(fixture({ requests: reqs, acceptances: accs, withdrawals: [wdr], releases: [rel] }));
  assert.equal(report.rows[0].state.key, 'breach-release-before-withdrawal');
  assert.ok(report.rows[0].breaches.some((b) => b.key === 'release-before-withdrawal' && b.earlyDays === 3));

  // A request under an agreement that expired before it was opened: kept.
  const expired = agreement({ id: 'agr-old', expiresOn: day(40) });
  const req2 = request({ agreementId: 'agr-old', openedOn: day(10) });
  const report2 = read(fixture({ agreements: [expired], requests: [req2] }));
  assert.equal(report2.rows[0].state.key, 'breach-agreement-lapsed');
  assert.ok(report2.rows[0].breaches.some((b) => b.key === 'agreement-lapsed' && b.afterDays === 30));
});

/* ------------------------------------------------------------- 3. arithmetic */

test('the arithmetic is exact: validity, overdue days, late days, release grace and coverage', () => {
  // Validity: opened 12 days ago with a five-day validity closes 7 days ago.
  const report = read(fixture());
  const row = report.rows[0];
  assert.equal(row.closesOn, day(7));
  assert.equal(row.validityLapsed, 7);
  assert.equal(row.state.key, 'request-lapsed');

  // Coverage: the ask (2 personnel + 1 pump) against the promise (1 pump + 1
  // personnel) is short by one personnel — an exact integer, never a percentage.
  const accepted = read(fixture({ acceptances: [acceptance()] }));
  const acceptedRow = accepted.rows[0];
  assert.equal(acceptedRow.state.key, 'accepted-differently');
  assert.deepEqual(acceptedRow.coverage.shortfalls, [{ kind: 'personnel', asked: 2, promised: 1, shortfall: 1 }]);

  // Arrival late: promised tomorrow would be future; promised 5 days ago and
  // arrived 2 days ago is 3 days late, printed exactly.
  const acc2 = acceptance({ promisedArrivalOn: day(5) });
  const arr = { id: 'arr-1', acceptanceId: 'acc-1', arrivedOn: day(2), arrivedLines: [{ kind: 'equipment', quantity: 1 }, { kind: 'personnel', quantity: 1 }], note: '', recordedById: 'mei', createdAt: '', updatedAt: '' };
  const arrived = read(fixture({ acceptances: [acc2], arrivals: [arr] }));
  assert.equal(arrived.rows[0].state.key, 'arrived-late');
  assert.equal(arrived.rows[0].arrivalLate, 3);

  // Arrival partial: promised 2 personnel, arrived 1.
  const acc3 = acceptance({ promisedLines: [{ kind: 'personnel', quantity: 2 }] });
  const arr2 = { id: 'arr-2', acceptanceId: 'acc-1', arrivedOn: day(5), arrivedLines: [{ kind: 'personnel', quantity: 1 }], note: '', recordedById: 'mei', createdAt: '', updatedAt: '' };
  const partial = read(fixture({ acceptances: [acc3], arrivals: [arr2] }));
  assert.equal(partial.rows[0].state.key, 'arrived-partial');
  assert.deepEqual(partial.rows[0].arrivalVerdict.shortfalls, [{ kind: 'personnel', asked: 2, promised: 1, shortfall: 1 }]);

  // Release grace: withdrawn 10 days ago, grace 7 → the release is 3 days overdue.
  const acc4 = acceptance({ promisedArrivalOn: dayF(5) });
  const wdr2 = { id: 'wdr-2', acceptanceId: 'acc-1', withdrawnOn: day(10), note: '', recordedById: 'mei', createdAt: '', updatedAt: '' };
  const withdrawn = read(fixture({ acceptances: [acc4], withdrawals: [wdr2] }));
  assert.equal(withdrawn.rows[0].state.key, 'withdrawn');
  assert.equal(withdrawn.rows[0].releaseDueOn, day(3));
  assert.equal(withdrawn.rows[0].releaseOverdue, 3);
});

test('a request is never a promise: requested, awaiting-acceptance and request-lapsed are three states', () => {
  // Open, inside validity: awaiting-acceptance with days left.
  const open = request({ openedOn: day(2), validityDays: 10 });
  const r1 = read(fixture({ requests: [open] }));
  assert.equal(r1.rows[0].state.key, 'awaiting-acceptance');
  assert.equal(r1.rows[0].validityRemaining, 8);

  // Open, validity closing today: still awaiting-acceptance.
  const r2 = read(fixture({ requests: [request({ openedOn: day(5), validityDays: 5 })] }));
  assert.equal(r2.rows[0].state.key, 'awaiting-acceptance');
  assert.equal(r2.rows[0].validityRemaining, 0);

  // Closed with no acceptance: request-lapsed, never a commitment.
  const r3 = read(fixture());
  assert.equal(r3.rows[0].state.key, 'request-lapsed');
  assert.equal(r3.totals.requestLapsedN, 1);
  assert.equal(r3.totals.awaitingArrivalN, 0);
});

/* ---------------------------------------------------------------- 4. door */

test('the door refuses every breach it exists to refuse, with the control named', () => {
  const { api } = harness(fixture());
  // An acceptance without the partner's written confirmation.
  let res = api.maaRecordAcceptance({
    requestId: 'req-1', acceptedOn: day(3), confirmationRef: 'x', acceptingHand: 'duty officer',
    promisedArrivalOn: dayF(1), promisedLines: [{ kind: 'personnel', quantity: 2 }],
  });
  assert.equal(res.ok, false);
  assert.equal(res.refusal, 'mutual-aid:confirmation-missing');

  // A valid acceptance is stored and readable.
  res = api.maaRecordAcceptance({
    requestId: 'req-1', acceptedOn: day(3),
    confirmationRef: 'Ringkøbing duty officer message, reference RKP-2026-11-04-B',
    acceptingHand: 'duty officer', promisedArrivalOn: dayF(1),
    promisedLines: [{ kind: 'personnel', quantity: 2 }],
  });
  assert.equal(res.ok, true);

  // A second acceptance to the same request.
  res = api.maaRecordAcceptance({
    requestId: 'req-1', acceptedOn: day(2),
    confirmationRef: 'Another message from the partner confirming a different promise',
    acceptingHand: 'duty officer', promisedArrivalOn: dayF(2),
    promisedLines: [{ kind: 'personnel', quantity: 5 }],
  });
  assert.equal(res.ok, false);
  assert.equal(res.refusal, 'mutual-aid:already-accepted');

  // An arrival before any acceptance.
  res = api.maaRecordArrival({
    acceptanceId: 'nope', arrivedOn: day(1), arrivedLines: [{ kind: 'personnel', quantity: 1 }],
  });
  assert.equal(res.ok, false);
  assert.equal(res.refusal, 'mutual-aid:acceptance-not-found');

  // A withdrawal before any acceptance.
  res = api.maaRecordWithdrawal({ acceptanceId: 'nope', withdrawnOn: day(1) });
  assert.equal(res.ok, false);

  // A release before the help left.
  const acceptances = api.maaCandidates().acceptances;
  res = api.maaRecordRelease({ acceptanceId: acceptances[0].id, releasedOn: day(1) });
  assert.equal(res.ok, false);
  assert.equal(res.refusal, 'mutual-aid:no-withdrawal');

  // A cancellation after the acceptance.
  res = api.maaCancelRequest({ requestId: 'req-1', cancelledOn: day(1) });
  assert.equal(res.ok, false);
  assert.equal(res.refusal, 'mutual-aid:accepted');

  // A request under an agreement that has expired.
  const expiredHarness = harness(fixture({ agreements: [agreement({ id: 'agr-old', expiresOn: day(40) })] }));
  res = expiredHarness.api.maaOpenRequest({
    agreementId: 'agr-old', subject: 'Two responders for the flooded yard', kind: 'personnel',
    validityDays: 5, requestingLineIds: ['mei'], askedLines: [{ kind: 'personnel', quantity: 2 }],
  });
  assert.equal(res.ok, false);
  assert.equal(res.refusal, 'mutual-aid:agreement-lapsed');
});

test('the door refuses a request with no declared validity, and a request no line owns', () => {
  const { api } = harness(fixture());
  let res = api.maaOpenRequest({
    agreementId: 'agr-1', subject: 'Two responders for the flooded yard', kind: 'personnel',
    validityDays: 0, requestingLineIds: ['mei'], askedLines: [{ kind: 'personnel', quantity: 2 }],
  });
  assert.equal(res.ok, false);
  assert.equal(res.refusal, 'mutual-aid:validity-invalid');

  res = api.maaOpenRequest({
    agreementId: 'agr-1', subject: 'Two responders for the flooded yard', kind: 'personnel',
    validityDays: 5, requestingLineIds: [], askedLines: [{ kind: 'personnel', quantity: 2 }],
  });
  assert.equal(res.ok, false);
  assert.equal(res.refusal, 'mutual-aid:no-line');
});

test('the door narrows every act on a request to a seat that holds one of the requesting lines', () => {
  // Freya is a manager who can read the register, but she holds only her own
  // line (the declared project line to Sam) — she holds NONE of mei's
  // requesting line, so every act on mei's request is refused by the door.
  const { api } = harness(fixture({ activeSeatId: 'freya' }));
  const readRes = api.maaReport();
  assert.equal(readRes.ok, true);

  let res = api.maaOpenRequest({
    agreementId: 'agr-1', subject: 'Two responders for the flooded yard', kind: 'personnel',
    validityDays: 5, requestingLineIds: ['mei'], askedLines: [{ kind: 'personnel', quantity: 2 }],
  });
  assert.equal(res.ok, false);
  assert.equal(res.refusal, 'mutual-aid:not-your-line');

  res = api.maaRecordAcceptance({
    requestId: 'req-1', acceptedOn: day(3),
    confirmationRef: 'Ringkøbing duty officer message, reference RKP-2026-11-04-B',
    acceptingHand: 'duty officer', promisedArrivalOn: dayF(1),
    promisedLines: [{ kind: 'personnel', quantity: 2 }],
  });
  assert.equal(res.ok, false);
  assert.equal(res.refusal, 'mutual-aid:not-your-line');
});

test('a request made from two lines is answered at the joint seat, never by one line for the other', () => {
  const twoLine = request({ requestingLineIds: ['mei', 'freya'] });
  const report = read(fixture({ requests: [twoLine] }));
  const row = report.rows[0];
  // priya is the joint apex above mei and freya.
  assert.deepEqual(row.apex.apexIds, ['priya']);
  assert.equal(row.ambiguousApex, false);
  // The line view shows the request once on each of its two lines — never
  // duplicated within a line, and never merged away.
  assert.equal(report.lineRows.length, 2);
  assert.equal(report.lineRows.reduce((sum, row2) => sum + row2.requestsN, 0), 2);
  assert.ok(report.lineRows.every((row2) => row2.requestsN === 1));
});

/* ----------------------------------------------------------- 5. the rule */

test('RULE-MAA-01 files one ask per obligation, idempotently, and closes itself when the condition clears', () => {
  const raw = fixture();
  let draft = load(raw);
  const ctx = { event: { type: 'mutualAid.request.opened', entity: 'workspace', entityId: 'req-1' }, now: NOW, idFactory: (p) => `${p}-x`, linkCtx: { idFactory: (p) => `${p}-x` } };
  const first = mutualAidRule(draft, ctx);
  assert.ok(first.length > 0, 'the lapsed request files an ask');
  const asks = indexMutualAidAsks(draft);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].signature, mutualAidAskSignature('request-lapsed', 'req-1'));
  assert.equal(asks[0].seatId, 'mei', 'the ask goes to the seat that HOLDS the requesting line');
  assert.ok(asks[0].task.title.includes('no acceptance'));
  assert.ok(!asks[0].task.title.includes('Ringkøbing'), 'the ask text names no partner');

  // A second run on the same draft files nothing new.
  const second = mutualAidRule(draft, { ...ctx, event: { type: 'mutualAid.scan', entity: 'workspace', entityId: 'mutual-aid' } });
  assert.deepEqual(second, []);
  assert.equal(indexMutualAidAsks(draft).length, 1);

  // When the request is answered (an acceptance recorded), the ask closes itself.
  // The acceptance is recorded on the SAME draft, so the ask the rule filed is
  // still live and must be closed by the register itself.
  draft.mutualAidAcceptances = [acceptance()];
  const clear = mutualAidRule(draft, { ...ctx, event: { type: 'mutualAid.acceptance.recorded', entity: 'workspace', entityId: 'acc-1' } });
  assert.ok(clear.length > 0);
  const closed = indexMutualAidAsks(draft);
  assert.equal(closed[0].task.status, 'done');
});

test('RULE-MAA-01 is pause-governed on every path, including the explicit scan', () => {
  const raw = fixture();
  raw.settings = { ...raw.settings, maaAutoPropagate: false };
  const draft = load(raw);
  const event = { type: 'mutualAid.request.opened', entity: 'workspace', entityId: 'req-1' };
  assert.deepEqual(mutualAidRule(draft, { event, now: NOW }), []);
  assert.deepEqual(mutualAidRule(draft, { event: { type: 'mutualAid.scan', entity: 'workspace', entityId: 'mutual-aid' }, now: NOW }), []);
});

test('RULE-MAA-01 observes identity-free where no seat can be asked', () => {
  // A request whose line is not on the graph: no seat resolves, one identity-free
  // observation per condition, no ask.
  const ghost = request({ requestingLineIds: ['ghost'] });
  const draft = load(fixture({ requests: [ghost] }));
  const out = mutualAidRule(draft, { event: { type: 'mutualAid.request.opened', entity: 'workspace', entityId: 'req-1' }, now: NOW });
  assert.ok(out.length > 0);
  assert.equal(indexMutualAidAsks(draft).length, 0);
  assert.equal(draft.mutualAidMarkers.length, 1);
  assert.equal(draft.mutualAidMarkers[0].kind, 'mutual-aid');
  assert.ok(draft.mutualAidMarkers[0].detail.includes('no seat can be asked'));
});

test('RULE-MAA-01 files the release ask from the withdrawal, even when the arrival state prints', () => {
  // Help arrived complete, was withdrawn, and never released: the row prints
  // `arrived-complete`, and the rule must still ask about the dangling release.
  const acc = acceptance({ promisedArrivalOn: day(5) });
  const arr = { id: 'arr-1', acceptanceId: 'acc-1', arrivedOn: day(5), arrivedLines: [{ kind: 'equipment', quantity: 1 }, { kind: 'personnel', quantity: 1 }], note: '', recordedById: 'mei', createdAt: '', updatedAt: '' };
  const wdr = { id: 'wdr-1', acceptanceId: 'acc-1', withdrawnOn: day(10), note: '', recordedById: 'mei', createdAt: '', updatedAt: '' };
  const report = read(fixture({ acceptances: [acc], arrivals: [arr], withdrawals: [wdr] }));
  assert.equal(report.rows[0].state.key, 'arrived-complete');
  const conditions = mutualAidConditions(report);
  assert.ok(conditions.conditions.some((c) => c.kind === 'withdrawn-not-released'
    && c.signature === mutualAidAskSignature('withdrawn-not-released', 'acc-1')));
});

test('the spine carries ADR-0244: RULE-MAA-01 is registered with its contract', () => {
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 161, 'the spine carries ADR-0244 (RULE-MAA-01) and ADR-0245 (RULE-DWL-01)');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule && row.rule.id === 'mutualAidRule');
  assert.ok(contract, 'mutualAidRule has a propagation contract');
  assert.equal(contract.module, 'mutualAidRules.js');
  assert.ok(contract.writes.includes('mutualAidMarkers'));
});

/* ------------------------------------------------------------------ 6. CSV */

test('the CSV boundary is aggregate and identity-free, withheld counts blank, complete apart', () => {
  const report = read(fixture({ acceptances: [acceptance()] }));
  const rows = mutualAidCsvRows(report);
  assert.ok(rows.length >= 2);
  const summary = rows.find((row) => row.row_kind === 'summary');
  assert.equal(summary.requests_n, '1');
  assert.equal(summary.agreements_n, '1');
  // No partner name, agreement reference, subject, confirmation, hand or day.
  const csv = rows.map((row) => Object.values(row).join('|')).join('\n');
  for (const forbidden of ['Ringkøbing', 'Mutual Aid Agreement', 'flooding', 'RKP-', 'duty officer', day(12)]) {
    assert.ok(!csv.includes(forbidden), `the export carries no ${forbidden}`);
  }
  // A per-state count below the privacy floor exports blank with its reason.
  const withFloor = read(fixture(), { settings: { maaPrivacyFloor: 5 } });
  const floorRows = mutualAidCsvRows(withFloor);
  const lapsedRow = floorRows.find((row) => row.row_kind === 'request_state' && row.key === 'request-lapsed');
  assert.equal(lapsedRow.requests_n, '');
  assert.ok(lapsedRow.blank_reason.includes('withheld'));
  // `complete` is a separate claim, never folded into a count.
  assert.ok(['0', '1'].includes(summary.complete));
});

test('the registered export scope produces the same rows as the reader', () => {
  const state = load(fixture({ acceptances: [acceptance()] }));
  const file = exportWorkspaceCsv(state, MAA_CSV_SCOPE);
  assert.equal(file.ok, true);
  const parsed = parseCsv(file.csv);
  assert.ok(parsed.rows.length >= 2);
  assert.equal(parsed.headers.length, MAA_CSV_COLUMNS.length);
  assert.equal(parsed.rows[0].length, MAA_CSV_COLUMNS.length);
  const summary = parsed.rows.find((row) => row[1] === 'summary');
  assert.equal(summary[2], 'ALL');
  assert.equal(summary[6], '1', 'one request on the record');
});

/* --------------------------------------------------------------- 7. panel */

test("the panel prints the reader's own figures cell by cell (display == computed)", () => {
  const state = load(fixture({ acceptances: [acceptance()] }));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.localStorage = dom.window.localStorage;
  try {
    const { api, store } = harness(fixture({ acceptances: [acceptance()] }));
    const report = read(fixture({ acceptances: [acceptance()] }));
    const node = renderMutualAid({ api: { ...api, getState: () => store.state }, query: new URLSearchParams('panel=requests'), rerender: () => {}, state });
    const html = node.outerHTML;
    // The summary counts printed by the page are the reader's own figures.
    assert.ok(html.includes(String(report.totals.requests)), 'the request count is printed');
    assert.ok(html.includes(String(report.totals.agreements)), 'the agreement count is printed');
    assert.ok(html.includes(report.rows[0].state.label), 'the derived state label is printed');
    // The breach banner, when there is one, prints the reader's count.
    const breachFixture = load(fixture({
      requests: [request()],
      acceptances: [acceptance({ promisedArrivalOn: day(5) })],
      withdrawals: [{ id: 'wdr-1', acceptanceId: 'acc-1', withdrawnOn: day(10), note: '', recordedById: 'mei', createdAt: '', updatedAt: '' }],
      releases: [{ id: 'rel-1', acceptanceId: 'acc-1', releasedOn: day(13), note: '', recordedById: 'mei', createdAt: '', updatedAt: '' }],
    }));
    const breachNode = renderMutualAid({ api: { ...api, getState: () => breachFixture }, query: new URLSearchParams(), rerender: () => {}, state: breachFixture });
    assert.ok(breachNode.outerHTML.includes('out of order'), 'the breach is printed on the page');
  } finally {
    delete global.window; delete global.document; delete global.HTMLElement;
    delete global.Node; delete global.localStorage;
  }
});

/* ----------------------------------------------------------------- 8. demo */

test('the demo fixture derives the documented states exactly', () => {
  const demo = buildDemoState(NOW);
  const report = buildMutualAid(demo, { now: NOW, seat: null });
  assert.equal(report.totals.agreements, 2);
  assert.equal(report.totals.requests, 6);
  assert.equal(report.totals.acceptances, 4);
  assert.equal(report.totals.arrivals, 1);
  assert.equal(report.totals.withdrawals, 2);
  const byId = new Map(report.rows.map((row) => [row.request.id, row.state.key]));
  assert.equal(byId.get('maa-req-demo-1'), 'request-lapsed');
  assert.equal(byId.get('maa-req-demo-2'), 'accepted-differently');
  assert.equal(byId.get('maa-req-demo-3'), 'not-arrived-overdue');
  assert.equal(byId.get('maa-req-demo-4'), 'arrived-complete');
  assert.equal(byId.get('maa-req-demo-5'), 'withdrawn');
  assert.equal(byId.get('maa-req-demo-6'), 'cancelled');
  // The shortfall the demo promise carries: two pumps asked, one promised.
  const pumpRow = report.rows.find((row) => row.request.id === 'maa-req-demo-2');
  assert.deepEqual(pumpRow.coverage.shortfalls, [{ kind: 'equipment', asked: 2, promised: 1, shortfall: 1 }]);
  // The register still reconciles and is complete.
  assert.equal(report.balances.statesReconcile, true);
  assert.equal(report.figuresComplete, true);
});
