// ADR-0253 — Product Nonconformance & Disposition Register (Schema v206).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — six empty ledgers and one declared switch,
//      and no case, containment, disposition or verification inferred from a
//      production plan, a shipment, an incident or a lot number kept elsewhere;
//   2. a case names ONE identifier kind and its value — a case with no kind, an
//      unknown kind, or no value is DROPPED with a counted warning;
//   3. the LATEST containment attestation governs: a later partial act leaves the
//      case uncontained even when an earlier act claimed the whole output;
//   4. a disposition needs a complete containment and a resolved joint apex, and
//      every required apex must sign the SAME disposition in the SAME round —
//      a partial set authorises nothing, and the same hand cannot sign twice;
//   5. independence is STRICT SENIORITY, enforced on the write path and again in
//      the reader, so an imported peer verification is kept, printed and never
//      releases the lot;
//   6. the act a state waits for is the only act the door accepts, a release is
//      always a separate act, and return/scrap are terminal NON-RELEASE outcomes;
//   7. use-as-is needs a written concession reference, and then its own release;
//   8. above rank 3 the reader prints counts only, with a privacy floor; the CSV
//      is identity-free and blanks a non-zero count below the floor;
//   9. RULE-QNC-01 is idempotent, self-closing, pause-governed, opaque in its ask
//      text, and records identity-free observations where nobody can be asked;
//  10. `provisions` carries the route floor its declared rights require.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { ACTION_RIGHTS, routeRankWindow, routeVerdict } from '../../app/core/domain/seatRegistry.js';
import {
  buildProductNonconformance,
  productNonconformanceCsvRows,
  qncVerificationSeniority,
} from '../../app/core/domain/productNonconformance.js';
import {
  normalizeQncCases,
  normalizeQncSettings,
} from '../../app/core/domain/productNonconformanceSchema.js';
import {
  indexQncAsks,
  productNonconformanceRule,
  qncAskSignature,
} from '../../app/core/domain/productNonconformanceRules.js';
import {
  QNC_CSV_COLUMNS,
  QNC_CSV_SCOPE,
  QNC_LIMITS,
  QNC_RIGHTS,
  QNC_SETTING_KEYS,
} from '../../app/core/domain/productNonconformanceRegistry.js';
import { PAUSE_PERMIT_MATRIX_REACH_SWITCHES, PAUSE_PERMIT_SWITCH_RULES } from '../../app/core/domain/pausePermitRegistry.js';

const NOW = new Date('2026-11-18T09:00:00.000Z');
const T0 = NOW.toISOString();
const DAY = '2026-11-18';
const iso = (value) => new Date(value).toISOString();

const person = (id, level, managerId) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  role: level,
  level,
  managerId,
  status: 'active',
  startDate: iso('2024-01-01T00:00:00.000Z'),
  createdAt: iso('2024-01-01T00:00:00.000Z'),
  updatedAt: iso('2024-01-01T00:00:00.000Z'),
});

const line = (id, personId, managerId, kind = 'function') => ({
  id, personId, managerId, kind, shareH: null, rights: [],
  fromISO: iso('2024-01-01T00:00:00.000Z'), toISO: null,
  declaredAt: iso('2024-01-01T00:00:00.000Z'), note: '', status: 'active', history: [],
});

/**
 * ceo (vp)
 *  ├── dana (director)
 *  │    └── mei (manager)
 *  │         ├── sam (ic)
 *  │         └── riley (ic)
 *  └── omar (director)
 *       └── finn (ic)
 *
 * mei holds the case and its two accountable hands; the joint apex above her line
 * and dana's is dana. omar is dana's peer — a manager-level peer of mei — and is
 * therefore NOT strictly senior to her.
 */
function fixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('ceo', 'vp', null),
    person('dana', 'director', 'ceo'),
    person('omar', 'director', 'ceo'),
    person('mei', 'manager', 'dana'),
    person('finn', 'ic', 'omar'),
    person('sam', 'ic', 'mei'),
    person('riley', 'ic', 'mei'),
  ];
  raw.reportingLines = [
    line('rl-dana-ceo', 'dana', 'ceo'),
    line('rl-omar-ceo', 'omar', 'ceo'),
    line('rl-mei-dana', 'mei', 'dana'),
    line('rl-finn-omar', 'finn', 'omar'),
    line('rl-sam-mei', 'sam', 'mei'),
    line('rl-riley-mei', 'riley', 'mei'),
  ];
  if (overrides.activeSeatId) raw.settings = { ...raw.settings, activeSeatId: overrides.activeSeatId };
  for (const key of ['qncCases', 'qncContainments', 'qncDecisions', 'qncDispositionActs', 'qncVerifications', 'qncMarkers']) {
    raw[key] = overrides[key] || [];
  }
  return raw;
}

const CASE = Object.freeze({
  id: 'case-1',
  caseRef: 'QNC-2026-001',
  productRef: 'Bracket assembly 44-B',
  siteRef: 'Copenhagen plant',
  identifierKind: 'lot',
  identifierRef: 'LOT-2026-0456',
  sourceKind: 'in-process-inspection',
  specRef: 'SPEC-44-B-REV-C',
  requirement: 'The bracket bore must measure within the drawing tolerance band across every sampled part.',
  finding: 'Three of twenty sampled bores measured outside the drawing tolerance band on the in-process gauge.',
  evidenceRef: 'INSP-2026-0456-03',
  identifiedOn: DAY,
  ownerIds: ['mei'],
  declaredById: 'mei',
  createdAt: T0,
});

const REASON = 'The bore can be re-machined to the drawing tolerance band on the same set-up without changing the part geometry.';
const NOTE = 'The whole identified lot was moved to the quarantine cage and labelled with the case reference.';

const containment = (overrides = {}) => ({
  id: 'hold-1',
  caseId: 'case-1',
  scope: 'entire',
  method: 'segregated',
  scopeRef: 'QUAR-2026-0456-Q1',
  evidenceRef: 'PHOTO-2026-0456-01',
  note: NOTE,
  byId: 'mei',
  recordedAt: T0,
  ...overrides,
});

const decision = (overrides = {}) => ({
  id: 'dec-1',
  caseId: 'case-1',
  decisionRound: 1,
  routeIds: ['dana'],
  routeKey: 'dana',
  disposition: 'rework',
  reason: REASON,
  concessionRef: null,
  decidedById: 'dana',
  decidedAt: T0,
  ...overrides,
});

const completion = (overrides = {}) => ({
  id: 'act-1',
  caseId: 'case-1',
  routeKey: 'dana',
  decisionRound: 1,
  sequence: 1,
  kind: 'rework-completed',
  evidenceRef: 'REWORK-2026-0456-01',
  note: 'All twenty parts were re-machined and re-measured against the drawing tolerance band.',
  performedById: 'mei',
  performedAt: T0,
  ...overrides,
});

function load(raw) {
  return normalizeState(raw, { now: NOW }).state;
}

let harnessSeq = 0;

function harness(raw) {
  const run = ++harnessSeq;
  const values = new Map([[STORAGE_KEY, JSON.stringify(load(raw))]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  // Each harness gets its own id namespace: two stores in one test must not mint
  // the same row id, which the loader would (correctly) refuse as a duplicate.
  const idFactory = (prefix) => `${prefix}-h${run}-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  return { store, storage, api };
}

/**
 * A DIAMOND: pia reports to sam, quinn to riley, and both sam and riley hold the
 * SAME two lines (dana and omar). The minimal common ancestors of sam and riley are
 * therefore dana AND omar — neither is above the other, so both must sign.
 */
function tieFixture(overrides = {}) {
  const raw = fixture({
    qncCases: [{ ...CASE, ownerIds: ['pia', 'quinn'] }],
    qncContainments: [containment()],
    ...overrides,
  });
  raw.people.push(person('pia', 'ic', 'sam'), person('quinn', 'ic', 'riley'));
  raw.reportingLines.push(
    line('rl-pia-sam', 'pia', 'sam'),
    line('rl-quinn-riley', 'quinn', 'riley'),
    line('rl-sam-dana', 'sam', 'dana'),
    line('rl-sam-omar', 'sam', 'omar', 'project'),
    line('rl-riley-dana', 'riley', 'dana'),
    line('rl-riley-omar', 'riley', 'omar', 'project'),
  );
  return raw;
}

/** Re-declare the operating seat on an existing fixture without rebuilding it. */
const asSeat = (raw, activeSeatId) => ({ ...raw, settings: { ...(raw.settings || {}), activeSeatId } });

const seatOf = (raw, activeSeatId) => activeSeat(buildSeats({ ...raw, settings: { ...raw.settings, activeSeatId } }, { now: NOW }));

const rowOf = (state, caseId = 'case-1') => buildProductNonconformance(state, { now: NOW, settings: state.settings, seat: null })
  .rows.find((row) => row.case.id === caseId);

/* --------------------------------------------------------------- 1. schema */

test('schema v206 is additive: six empty ledgers, one declared switch, nothing inferred', () => {
  const empty = createEmptyState(T0);
  assert.equal(SCHEMA_VERSION, 206);
  for (const key of ['qncCases', 'qncContainments', 'qncDecisions', 'qncDispositionActs', 'qncVerifications', 'qncMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
    assert.deepEqual(empty[key], [], `${key} starts empty`);
  }
  const loaded = normalizeState(createEmptyState(T0), { now: NOW }).state;
  assert.equal(loaded.settings[QNC_SETTING_KEYS.autoPropagate], true, 'the rule switch is ON by default');
  for (const forbidden of ['qncHoldDays', 'qncDefaultDisposition', 'qncReworkDays', 'qncConcessionLimit', 'qncReleaseAuthority']) {
    assert.equal(Object.keys(loaded.settings).includes(forbidden), false, `${forbidden} must not exist as a workspace default`);
  }

  const previous = { ...createEmptyState(T0), schemaVersion: 205 };
  for (const key of ['qncCases', 'qncContainments', 'qncDecisions', 'qncDispositionActs', 'qncVerifications', 'qncMarkers']) delete previous[key];
  const { raw, applied } = migrate(previous);
  assert.deepEqual(applied, ['205 → 206']);
  assert.equal(raw.schemaVersion, SCHEMA_VERSION);
  for (const key of ['qncCases', 'qncContainments', 'qncDecisions', 'qncDispositionActs', 'qncVerifications', 'qncMarkers']) {
    assert.deepEqual(raw[key], [], 'nothing is manufactured at upgrade time');
  }
});

test('the loader refuses a case with no identifier kind, an unknown kind, no value, or a bad source', () => {
  const [valid] = normalizeQncCases([CASE], NOW, []);
  assert.equal(valid.identifierKind, 'lot');
  assert.equal(valid.identifierRef, 'LOT-2026-0456');

  const { identifierKind: _kind, identifierRef: _ref, ...bare } = CASE;
  const warnings = [];
  const rows = normalizeQncCases([
    { ...bare, id: 'c-2', caseRef: 'QNC-2' },
    { ...CASE, id: 'c-3', caseRef: 'QNC-3', identifierKind: 'batch' },
    { ...CASE, id: 'c-4', caseRef: 'QNC-4', identifierRef: '' },
    { ...CASE, id: 'c-5', caseRef: 'QNC-5', sourceKind: 'rumour' },
    { ...bare, id: 'c-6', caseRef: 'QNC-6', lotRef: 'LOT-2026-0456' },
  ], NOW, warnings);
  assert.deepEqual(rows, [], 'an unidentifiable output is not a case — a bare lotRef cannot say what kind it is');
  assert.match(warnings.join(' '), /5 case row\(s\) could not be read/);
});

/* ---------------------------------------------------- 2. containment governs */

test('containment: missing, then the LATEST attestation governs, so a later partial act un-contains the case', () => {
  assert.equal(rowOf(load(fixture({ qncCases: [CASE] }))).state.key, 'containment-missing');

  const full = rowOf(load(fixture({ qncCases: [CASE], qncContainments: [containment()] })));
  assert.equal(full.fullContainment, true);
  assert.equal(full.state.key, 'decision-pending');

  const later = containment({
    id: 'hold-2',
    scope: 'partial',
    scopeRef: 'QUAR-2026-0456-Q2',
    note: 'Only the first pallet could be moved; the remaining pallet stays on the line pending the shift lead.',
  });
  const row = rowOf(load(fixture({ qncCases: [CASE], qncContainments: [containment(), later] })));
  assert.equal(row.fullContainment, false, 'an earlier entire attestation does not survive a later partial one');
  assert.equal(row.state.key, 'containment-partial');
  assert.equal(row.containmentSupersededN, 1);
  assert.equal(row.containments.length, 2, 'history is kept, not deleted');
});

/* ------------------------------------------------- 3. joint disposition */

test('a disposition needs a full containment, and a partial signature set authorises nothing', () => {
  const noHold = harness(fixture({ qncCases: [CASE], activeSeatId: 'dana' })).api
    .qncSignDisposition({ caseId: 'case-1', disposition: 'rework', reason: REASON });
  assert.equal(noHold.ok, false);
  assert.match(noHold.error, /No containment act attests/);

  const { api, store } = harness(fixture({ qncCases: [CASE], qncContainments: [containment()], activeSeatId: 'dana' }));
  const signed = api.qncSignDisposition({ caseId: 'case-1', disposition: 'rework', reason: REASON });
  assert.equal(signed.ok, true, signed.error || '');
  const row = rowOf(store.state);
  assert.deepEqual(row.authority.apexIds, ['dana'], 'dana is the single minimal common apex above the accountable lines');
  assert.equal(row.state.key, 'rework-pending');
  assert.equal(signed.warning, null);
});

test('two incomparable apexes must both sign the same disposition in the same round', () => {
  // mei holds the case; her home line runs to dana and a declared project line to
  // omar. Both are directors under the same chief, so the minimal common ancestors
  // are BOTH of them and neither may decide alone.
  const raw = tieFixture({ activeSeatId: 'mei' });
  const { api, store } = harness(raw);
  let row = rowOf(store.state);
  assert.deepEqual(row.authority.apexIds, ['mei', 'omar'], 'a diamond tie resolves to BOTH minimal ancestors');

  const first = api.qncSignDisposition({ caseId: 'case-1', disposition: 'rework', reason: REASON });
  assert.equal(first.ok, true, first.error || '');
  row = rowOf(store.state);
  assert.equal(row.state.key, 'awaiting-joint-approval');
  assert.match(first.warning || '', /not signed this round/);

  const twice = api.qncSignDisposition({ caseId: 'case-1', disposition: 'rework', reason: REASON });
  assert.equal(twice.ok, false);
  assert.match(twice.error, /already signed/);

  const other = harness(asSeat({ ...raw, qncDecisions: store.state.qncDecisions }, 'omar'));
  const second = other.api.qncSignDisposition({ caseId: 'case-1', disposition: 'rework', reason: REASON });
  assert.equal(second.ok, true, second.error || '');
  assert.equal(rowOf(other.store.state).state.key, 'rework-pending', 'both apexes signed the same disposition');
});

test('the same round signed with different dispositions is a disagreement, never a majority', () => {
  const raw = tieFixture({
    qncDecisions: [decision({ decidedById: 'mei', routeIds: ['mei', 'omar'], routeKey: 'mei|omar' })],
    activeSeatId: 'omar',
  });
  const { api, store } = harness(raw);
  const conflicting = api.qncSignDisposition({
    caseId: 'case-1', disposition: 'scrap',
    reason: 'The bore cannot be corrected within the drawing tolerance band and the part is not serviceable.',
  });
  assert.equal(conflicting.ok, true, conflicting.error || '');
  const row = rowOf(store.state);
  assert.equal(row.state.key, 'decision-disagreement');
  assert.equal(row.currentDisposition, null, 'nothing is selected by majority or first-write-wins');
});

/* ------------------------------------------------ 4. strict seniority */

test('re-verification: a peer and the performer are refused; a strictly senior hand passes, and release is separate', () => {
  const base = fixture({ qncCases: [CASE], qncContainments: [containment()], activeSeatId: 'dana' });
  const { api, store } = harness(base);
  assert.equal(api.qncSignDisposition({ caseId: 'case-1', disposition: 'rework', reason: REASON }).ok, true);

  // mei (the accountable hand) completes the rework.
  const asMei = harness(asSeat({ ...base, qncDecisions: store.state.qncDecisions }, 'mei'));
  const done = asMei.api.qncRecordDispositionAct({
    caseId: 'case-1', kind: 'rework-completed', evidenceRef: 'REWORK-2026-0456-01',
    note: 'All twenty parts were re-machined and re-measured against the drawing tolerance band.',
  });
  assert.equal(done.ok, true, done.error || '');
  assert.equal(rowOf(asMei.store.state).state.key, 'reverification-pending');

  const carried = {
    qncCases: asMei.store.state.qncCases,
    qncContainments: asMei.store.state.qncContainments,
    qncDecisions: asMei.store.state.qncDecisions,
    qncDispositionActs: asMei.store.state.qncDispositionActs,
  };
  // omar is a director, but he is not above mei on the reporting graph.
  const asPeer = harness(asSeat({ ...base, ...carried }, 'omar'));
  const peer = asPeer.api.qncVerifyRework({
    caseId: 'case-1', outcome: 'pass', evidenceRef: 'VERIFY-2026-0456-01',
    note: 'Re-measured every re-machined part against the drawing tolerance band on the calibrated gauge.',
  });
  assert.equal(peer.ok, false);
  assert.match(peer.error, /strictly senior/i);

  // mei cannot verify her own rework.
  const asSelf = harness(asSeat({ ...base, ...carried }, 'mei'));
  const self = asSelf.api.qncVerifyRework({
    caseId: 'case-1', outcome: 'pass', evidenceRef: 'VERIFY-2026-0456-02',
    note: 'Re-measured every re-machined part against the drawing tolerance band on the calibrated gauge.',
  });
  assert.equal(self.ok, false);
  assert.match(self.error, /same hand|strictly senior/i);

  // dana is mei's manager: strictly senior, so the verification is accepted.
  const asSenior = harness(asSeat({ ...base, ...carried }, 'dana'));
  const senior = asSenior.api.qncVerifyRework({
    caseId: 'case-1', outcome: 'pass', evidenceRef: 'VERIFY-2026-0456-03',
    note: 'Re-measured every re-machined part against the drawing tolerance band on the calibrated gauge.',
  });
  assert.equal(senior.ok, true, senior.error || '');
  assert.equal(rowOf(asSenior.store.state).state.key, 'release-pending', 'a pass is NOT a release');
  assert.match(senior.warning || '', /separate release/);

  const release = asSenior.api.qncRecordDispositionAct({
    caseId: 'case-1', kind: 'released-after-rework', evidenceRef: 'REL-2026-0456-01',
    note: 'The lot was released from quarantine to finished goods after the passing re-verification.',
  });
  assert.equal(release.ok, true, release.error || '');
  const row = rowOf(asSenior.store.state);
  assert.equal(row.state.key, 'closed-rework');
  assert.equal(row.terminal, true);

  const afterClose = asSenior.api.qncRecordDispositionAct({
    caseId: 'case-1', kind: 'released-after-rework', evidenceRef: 'REL-2026-0456-02',
    note: 'Attempted second release after the case had already been closed by the first one.',
  });
  assert.equal(afterClose.ok, false);
});

test('an imported peer verification is KEPT, PRINTED and never satisfies the state', () => {
  const state = load(fixture({
    qncCases: [CASE],
    qncContainments: [containment()],
    qncDecisions: [decision()],
    qncDispositionActs: [completion()],
    qncVerifications: [{
      id: 'ver-1', caseId: 'case-1', routeKey: 'dana', decisionRound: 1, completionId: 'act-1',
      outcome: 'pass', evidenceRef: 'VERIFY-2026-0456-01',
      note: 'A peer signed off the rework without measuring anything against the drawing tolerance band.',
      verifiedById: 'omar', verifiedAt: T0,
    }],
  }));
  assert.equal(state.qncVerifications.length, 1, 'the row is retained, not deleted');
  const row = rowOf(state);
  assert.equal(row.state.key, 'reverification-pending', 'a peer verification releases nothing');
  assert.equal(row.rejectedVerifications.length, 1);
  assert.match(row.rejectedVerifications[0].reason, /strictly senior/);
});

test('qncVerificationSeniority is one pure rule used by both paths', () => {
  const state = load(fixture());
  const matrix = buildProductNonconformance(state, { now: NOW, settings: state.settings, seat: null }).matrix;
  const done = { performedById: 'mei' };
  assert.equal(qncVerificationSeniority(matrix, done, { performedById: 'mei', verifiedById: 'mei' }).ok, false);
  assert.equal(qncVerificationSeniority(matrix, done, { performedById: 'mei', verifiedById: 'omar' }).ok, false, 'a director outside the line is not senior to her');
  assert.equal(qncVerificationSeniority(matrix, done, { performedById: 'mei', verifiedById: 'sam' }).ok, false, 'a subordinate is not senior');
  assert.equal(qncVerificationSeniority(matrix, done, { performedById: 'mei', verifiedById: 'dana' }).ok, true);
  assert.equal(qncVerificationSeniority(null, done, { performedById: 'mei', verifiedById: 'dana' }).ok, false, 'an unreadable graph proves nothing');
});

/* --------------------------------------------- 5. return, scrap, concession */

test('return and scrap are terminal NON-release outcomes, and use-as-is needs its written concession', () => {
  const returned = harness(fixture({ qncCases: [CASE], qncContainments: [containment()], activeSeatId: 'dana' }));
  assert.equal(returned.api.qncSignDisposition({ caseId: 'case-1', disposition: 'return', reason: 'The supplier accepts the lot back against their own certificate of conformity for the batch.' }).ok, true);
  const early = returned.api.qncRecordDispositionAct({ caseId: 'case-1', kind: 'released-after-rework', evidenceRef: 'REL-X', note: 'Attempting a release on a return disposition, which the door must refuse outright.' });
  assert.equal(early.ok, false, 'a release is not an act a return disposition waits for');
  const back = returned.api.qncRecordDispositionAct({ caseId: 'case-1', kind: 'returned', evidenceRef: 'RMA-2026-0456-01', note: 'The lot left on the supplier collection and the return note is on file.' });
  assert.equal(back.ok, true, back.error || '');
  assert.equal(rowOf(returned.store.state).state.key, 'closed-returned');
  assert.equal(rowOf(returned.store.state).terminal, true);

  const scrap = harness(fixture({ qncCases: [CASE], qncContainments: [containment()], activeSeatId: 'dana' }));
  assert.equal(scrap.api.qncSignDisposition({ caseId: 'case-1', disposition: 'scrap', reason: 'The bore cannot be corrected within the drawing tolerance band and the part is not serviceable.' }).ok, true);
  assert.equal(scrap.api.qncRecordDispositionAct({ caseId: 'case-1', kind: 'scrapped', evidenceRef: 'SCRAP-2026-0456-01', note: 'The lot was destroyed at the site scrap station and witnessed by the shift lead.' }).ok, true);
  assert.equal(rowOf(scrap.store.state).state.key, 'closed-scrapped');

  const noConcession = harness(fixture({ qncCases: [CASE], qncContainments: [containment()], activeSeatId: 'dana' }));
  const refused = noConcession.api.qncSignDisposition({ caseId: 'case-1', disposition: 'use-as-is', reason: 'Engineering believes the deviation is immaterial to fit and function in service.' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /written concession reference/);

  const concession = harness(fixture({ qncCases: [CASE], qncContainments: [containment()], activeSeatId: 'dana' }));
  assert.equal(concession.api.qncSignDisposition({
    caseId: 'case-1', disposition: 'use-as-is', concessionRef: 'CONC-2026-0456-01',
    reason: 'Engineering assessed the deviation as immaterial to fit and function and signed a written concession.',
  }).ok, true);
  let row = rowOf(concession.store.state);
  assert.equal(row.state.key, 'release-pending');
  assert.equal(row.currentConcessionRef, 'CONC-2026-0456-01');
  assert.equal(concession.api.qncRecordDispositionAct({ caseId: 'case-1', kind: 'released-under-concession', evidenceRef: 'REL-2026-0456-03', note: 'The lot was released to the customer order against the written concession reference.' }).ok, true);
  row = rowOf(concession.store.state);
  assert.equal(row.state.key, 'closed-concession');
});

/* ----------------------------------------------------------- 6. the door */

test('the door refuses a duplicate reference, a future identified day, and an act the state is not waiting for', () => {
  const { api } = harness(fixture({ activeSeatId: 'mei' }));
  const opened = api.qncOpen({
    caseRef: 'QNC-2026-002', productRef: 'Housing 12-A', siteRef: 'Copenhagen plant',
    identifierKind: 'serial', identifierRef: 'SN-000123', sourceKind: 'final-inspection',
    specRef: 'SPEC-12-A-REV-A',
    requirement: 'The housing seal face must be free of tool marks across the full sealing land.',
    finding: 'A circumferential tool mark was found across the sealing land on the final inspection bench.',
    evidenceRef: 'INSP-2026-000123-01', identifiedOn: DAY, ownerIds: ['mei'],
  });
  assert.equal(opened.ok, true, opened.error || '');
  assert.equal(opened.case.identifierKind, 'serial');

  const duplicate = api.qncOpen({
    caseRef: 'qnc-2026-002', productRef: 'Housing 12-A', siteRef: 'Copenhagen plant',
    identifierKind: 'lot', identifierRef: 'LOT-2', sourceKind: 'final-inspection',
    specRef: 'SPEC-12-A-REV-A',
    requirement: 'The housing seal face must be free of tool marks across the full sealing land.',
    finding: 'A circumferential tool mark was found across the sealing land on the final inspection bench.',
    evidenceRef: 'INSP-2026-000123-02', identifiedOn: DAY, ownerIds: ['mei'],
  });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /already on the register/);

  const future = api.qncOpen({
    caseRef: 'QNC-2026-003', productRef: 'Housing 12-A', siteRef: 'Copenhagen plant',
    identifierKind: 'lot', identifierRef: 'LOT-3', sourceKind: 'final-inspection', specRef: 'SPEC-12-A-REV-A',
    requirement: 'The housing seal face must be free of tool marks across the full sealing land.',
    finding: 'A circumferential tool mark was found across the sealing land on the final inspection bench.',
    evidenceRef: 'INSP-2026-000123-03', identifiedOn: '2026-12-24', ownerIds: ['mei'],
  });
  assert.equal(future.ok, false);
  assert.match(future.error, /future/);

  const act = api.qncRecordDispositionAct({ caseId: opened.id, kind: 'released-after-rework', evidenceRef: 'REL-1', note: 'Attempting a release on a case with no containment and no disposition at all.' });
  assert.equal(act.ok, false);
  assert.match(act.error, /not allowed|waiting/i);

  const outsider = api.qncRecordContainment({ caseId: opened.id, scope: 'entire', method: 'segregated', scopeRef: 'QUAR-2026-000123-Q1', evidenceRef: 'PHOTO-2026-000123-01', note: NOTE });
  assert.equal(outsider.ok, true, 'the seat holds mei, so it may attest containment for her case');
});

/* ------------------------------------------------- 7. disclosure and CSV */

test('above rank 3 the reader prints counts only, with a floor; the CSV blanks a non-zero count below it', () => {
  const raw = fixture({ qncCases: [CASE], qncContainments: [containment()] });
  const state = load(raw);
  const chief = seatOf(raw, 'ceo');
  const report = buildProductNonconformance(state, { now: NOW, settings: state.settings, seat: chief });
  assert.equal(report.detailed, false, 'rank 4 receives aggregates, not cases');
  assert.deepEqual(report.rows, []);
  assert.equal(report.totals.cases, null, 'a count of one is withheld, never printed');
  assert.equal(report.privacyFloor, 3);
  assert.match(report.disclosure.reason, /withheld/);

  const csv = productNonconformanceCsvRows(report);
  assert.equal(csv[0].cases_n, null);
  assert.match(csv[0].blank_reason, /Below privacy floor 3/);

  // The exported aggregate applies the same floor: ONE case exports BLANK, not 1.
  const one = exportWorkspaceCsv(state, QNC_CSV_SCOPE, { now: NOW });
  assert.equal(one.ok, true, one.error || '');
  const oneParsed = parseCsv(one.csv);
  assert.deepEqual(oneParsed.headers, [...QNC_CSV_COLUMNS]);
  const oneRecords = oneParsed.rows.map((row) => Object.fromEntries(oneParsed.headers.map((key, index) => [key, row[index]])));
  assert.equal(oneRecords[0].cases_n, '');
  assert.match(oneRecords[0].blank_reason, /Below privacy floor 3/);

  const three = load(fixture({
    qncCases: [
      CASE,
      { ...CASE, id: 'case-2', caseRef: 'QNC-2026-002' },
      { ...CASE, id: 'case-3', caseRef: 'QNC-2026-003' },
    ],
    qncContainments: [containment()],
  }));
  const full = buildProductNonconformance(three, { now: NOW, settings: three.settings, seat: null });
  assert.equal(full.rows.length, 3);
  const exported = exportWorkspaceCsv(three, QNC_CSV_SCOPE, { now: NOW });
  assert.equal(exported.ok, true, exported.error || '');
  const parsed = parseCsv(exported.csv);
  const records = parsed.rows.map((row) => Object.fromEntries(parsed.headers.map((key, index) => [key, row[index]])));
  assert.equal(Number(records[0].cases_n), 3, 'three cases clear the floor and print the exact count');
  assert.equal(records[0].row_kind, 'summary');
  assert.equal(records.filter((row) => row.row_kind === 'state').length, full.states.length);
  const descriptor = CSV_EXPORTS.find((item) => item.key === QNC_CSV_SCOPE);
  assert.ok(descriptor, 'CSV scope #192 is registered');
  assert.equal(descriptor.sensitive, true);
  // No identity may cross this boundary.
  const body = JSON.stringify(records);
  for (const secret of ['QNC-2026-001', 'Bracket', 'Copenhagen', 'LOT-2026-0456', 'mei', 'dana', 'SPEC-44', 'INSP-2026', 'QUAR-2026']) {
    assert.equal(body.includes(secret), false, `${secret} must not cross the CSV boundary`);
  }
});

/* ----------------------------------------------------------------- 8. rule */

test('RULE-QNC-01 files one opaque ask to the joint apex, is idempotent, and closes itself', () => {
  const draft = load(fixture({ qncCases: [CASE] }));
  const ctx = { event: { type: 'product-nonconformance.case.opened' }, now: NOW, idFactory: (prefix) => `${prefix}-r-1` };

  const first = productNonconformanceRule(draft, ctx);
  assert.ok(first.length >= 1);
  const asks = draft.delegations.filter((task) => task.status === 'active');
  assert.equal(asks.length, 1, 'dana is the single joint apex above the accountable lines');
  assert.equal(asks[0].personId, 'dana');
  for (const secret of ['QNC-2026-001', 'Bracket', 'LOT-2026-0456', 'Copenhagen', 'SPEC-44', 'INSP-2026', 'mei']) {
    assert.equal(`${asks[0].title} ${asks[0].expectedOutcome} ${asks[0].support}`.includes(secret), false, `${secret} must not appear in an ask`);
  }
  const signature = qncAskSignature('containment-owed', 'case-1');
  assert.match(JSON.stringify(draft.links), new RegExp(signature));
  assert.ok(indexQncAsks(draft).some((ask) => ask.signature === signature));

  // Idempotent: a second pass on the same record files nothing new.
  const second = productNonconformanceRule(draft, { ...ctx, idFactory: (prefix) => `${prefix}-r-2` });
  assert.equal(second.filter((effect) => effect.action === 'delegated').length, 0);

  // The condition clears: the register closes its own ask.
  draft.qncContainments.push(containment());
  draft.qncDecisions.push(decision({ disposition: 'scrap', reason: 'The bore cannot be corrected within the drawing tolerance band and the part is not serviceable.' }));
  draft.qncDispositionActs.push(completion({
    kind: 'scrapped', evidenceRef: 'SCRAP-2026-0456-01',
    note: 'The lot was destroyed at the site scrap station and witnessed by the shift lead.',
  }));
  const closed = productNonconformanceRule(draft, { ...ctx, event: { type: 'product-nonconformance.disposition.act-recorded' } });
  assert.ok(closed.some((effect) => effect.action === 'closed'), 'the ask closes itself when the condition clears');
  assert.equal(draft.delegations.find((task) => task.id === asks[0].id).status, 'done');
});

test('RULE-QNC-01 observes identity-free where nobody can be asked, and is pause-governed', () => {
  const orphan = { ...CASE, id: 'case-9', caseRef: 'QNC-2026-009', ownerIds: ['ghost'] };
  const draft = load(fixture({ qncCases: [orphan] }));
  const effects = productNonconformanceRule(draft, { event: { type: 'product-nonconformance.case.opened' }, now: NOW, idFactory: (p) => `${p}-o-1` });
  assert.ok(effects.some((effect) => effect.action === 'observed'));
  assert.equal(draft.delegations.length, 0, 'nobody is asked and nobody is substituted');
  assert.equal(draft.qncMarkers.length, 1);
  assert.match(draft.qncMarkers[0].detail, /no seat can be asked/);

  const paused = load(fixture({ qncCases: [CASE] }));
  paused.settings = { ...paused.settings, qncAutoPropagate: false };
  assert.deepEqual(productNonconformanceRule(paused, { event: { type: 'product-nonconformance.case.opened' }, now: NOW }), []);
  assert.equal(normalizeQncSettings({ qncAutoPropagate: 'no' }).qncAutoPropagate, true, 'a malformed switch never silences the rule');
});

/* --------------------------------------------------------- 9. wiring pins */

test('the register is wired: rights, rule, contract, pause census and CSV scope', () => {
  for (const right of Object.values(QNC_RIGHTS)) assert.ok(ACTION_RIGHTS[right], `${right} is a declared action right`);
  const rule = DEFAULT_POST_COMMIT_RULES.find((item) => item.id === 'productNonconformanceRule');
  assert.ok(rule, 'RULE-QNC-01 is on the spine');
  assert.ok(PROPAGATION_CONTRACTS.some((contract) => contract.rule === rule), 'the rule has a propagation contract');
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes(QNC_SETTING_KEYS.autoPropagate), 'the switch is in the reach census');
  assert.equal(PAUSE_PERMIT_SWITCH_RULES[QNC_SETTING_KEYS.autoPropagate], 'productNonconformanceRules.js');
  assert.ok(QNC_LIMITS.cases >= 100);
});

test('the provisions route carries the floor its declared rights require', () => {
  assert.deepEqual(routeRankWindow('provisions'), { floor: 3, ceiling: 5, kind: 'portfolio' });
  const frontline = seatOf(fixture(), 'mei');
  assert.equal(routeVerdict('provisions', frontline).allow, false);
  assert.match(routeVerdict('provisions', frontline).reason, /floor is rank 3/);
  // The nonconformance register itself stays open on the floor: the reader scopes it.
  assert.deepEqual(routeRankWindow('nonconformance'), { floor: 1, ceiling: 5, kind: 'open' });
});
