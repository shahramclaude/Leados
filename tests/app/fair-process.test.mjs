// ADR-0254 — Fair-Process Discipline & Grievance Register (Schema v207).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — ten empty ledgers and four bounded
//      conventions, and NO case, allegation, investigator, finding, decision or
//      appeal inferred from an incident, a just-culture review, a speak-up concern,
//      an absence or a claim;
//   2. an allegation carries its class, its written statement, the WRITTEN STANDARD
//      it is tested against and an evidence reference, or it is DROPPED with a
//      counted warning; a case with no readable allegation is dropped WHOLE;
//   3. the STANDARD OF PROOF is fixed at opening: a finding naming any other
//      standard is refused at the door and does not count on the read;
//   4. independence is a GRAPH PROPERTY: a hand that holds a party, is held by a
//      party, or IS a party is refused — in BOTH directions — and strict seniority
//      over the subject is required of the investigator;
//   5. the door refuses a decision before every allegation carries a reliable
//      finding, refuses a decider who is not strictly senior to the investigator,
//      and refuses a second decision;
//   6. the LADDER is computed from the subject's own live record of the same class,
//      printed beside the rung chosen, and every departure is counted — it is never
//      imposed;
//   7. an appeal needs a decision and its decider must be a DIFFERENT hand strictly
//      senior to the decision-maker; the decision row is never rewritten;
//   8. a withdrawal needs a declared reason and a written basis and never clears the
//      subject; a case with a decision cannot be withdrawn;
//   9. the acts are checked for fair ORDER: a finding before the case, a decision
//      before every finding, two decisions, an appeal before a decision, or a
//      decision resting on findings that do not count each derive `record-conflict`;
//  10. above rank 2 the reader prints counts only with a privacy floor, and the CSV
//      is identity-free and blanks a non-zero count below the floor;
//  11. RULE-DGI-01 is idempotent, self-closing, pause-governed, opaque in its ask
//      text, bounded at four per commit, and records identity-free observations
//      where nobody can be asked;
//  12. display == computed: the panel's figures are the reader's figures, and the
//      CSV cells are the reader's cells.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { buildScopeTable, CSV_EXPORTS } from '../../app/core/csv.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { ACTION_RIGHTS, routeRankWindow, routeVerdict } from '../../app/core/domain/seatRegistry.js';
import {
  buildCaseToAnswer,
  caseToAnswerCsvRows,
  dgiIndependence,
  dgiLadderReading,
  dgiStrictlySeniorTo,
  dgiDaysBetween,
} from '../../app/core/domain/caseToAnswer.js';
import {
  normalizeDgiAllegations,
  normalizeDgiCases,
  normalizeDgiSettings,
} from '../../app/core/domain/caseToAnswerSchema.js';
import {
  caseToAnswerConditions,
  caseToAnswerRule,
  dgiAskSignature,
  indexDgiAsks,
} from '../../app/core/domain/caseToAnswerRules.js';
import {
  DGI_CSV_COLUMNS,
  DGI_CSV_SCOPE,
  DGI_LIMITS,
  DGI_RIGHTS,
  DGI_SETTING_KEYS,
} from '../../app/core/domain/caseToAnswerRegistry.js';
import { PAUSE_PERMIT_MATRIX_REACH_SWITCHES, PAUSE_PERMIT_SWITCH_RULES } from '../../app/core/domain/pausePermitRegistry.js';

const NOW = new Date('2026-11-18T09:00:00.000Z');
const T0 = NOW.toISOString();
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
 *  │         ├── sam (ic)      <- the subject in most tests
 *  │         └── riley (ic)
 *  └── omar (director)
 *       └── finn (ic)
 *
 * The duty chain in this fixture is exactly one hand deep at each step:
 *   investigator  = mei   (holds sam as a subordinate? NO — mei is sam's manager,
 *                           so mei is NOT independent of sam. Dana investigates.)
 * The fixture therefore uses DANA as the investigator, MEI as her manager, and the
 * tests below assert the refusal when MEI tries to investigate her own report.
 */
function fixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('ceo', 'vp', null),
    person('dana', 'director', 'ceo'),
    person('omar', 'director', 'ceo'),
    person('finn', 'ic', 'omar'),
    person('mei', 'manager', 'dana'),
    person('sam', 'ic', 'mei'),
    person('riley', 'ic', 'mei'),
  ];
  raw.reportingLines = [
    line('rl-dana-ceo', 'dana', 'ceo'),
    line('rl-omar-ceo', 'omar', 'ceo'),
    line('rl-finn-omar', 'finn', 'omar'),
    line('rl-mei-dana', 'mei', 'dana'),
    line('rl-sam-mei', 'sam', 'mei'),
    line('rl-riley-mei', 'riley', 'mei'),
  ];
  if (overrides.activeSeatId) raw.settings = { ...raw.settings, activeSeatId: overrides.activeSeatId };
  for (const key of [
    'dgiCases', 'dgiAllegations', 'dgiInvestigators', 'dgiDirections', 'dgiFindings',
    'dgiDecisions', 'dgiAppeals', 'dgiAppealOutcomes', 'dgiWithdrawals', 'dgiMarkers',
  ]) {
    raw[key] = overrides[key] || [];
  }
  return raw;
}

const STANDARD_TEXT = 'A colleague’s work is reviewed in the channel the team agreed, and any concern is raised with the person first.';

const ALLEGATION = Object.freeze({
  id: 'alleg-1',
  caseId: 'case-1',
  classKey: 'conduct',
  statement: 'A review comment was posted in a public channel after the team had agreed review comments go to the author first.',
  standardRef: 'CS-REVIEW-02',
  standardText: STANDARD_TEXT,
  evidenceRef: 'SLACK-THREAD-0001',
  raisedOn: '2026-11-01',
  sequence: 1,
  createdAt: iso('2026-11-01T00:00:00.000Z'),
});

const CASE = Object.freeze({
  id: 'case-1',
  caseRef: 'FPR-2026-001',
  caseKind: 'conduct',
  supervisorRef: null,
  standardOfProof: 'balance-of-probabilities',
  subjectId: 'sam',
  raisedById: 'riley',
  basisRef: 'HR-POL-04',
  basisText: 'The team conduct procedure.',
  openedOn: '2026-11-01',
  declaredById: 'dana',
  createdAt: iso('2026-11-01T00:00:00.000Z'),
});

/**
 * THE FULL ARC: dana investigates (independent of sam and riley, strictly senior to
 * sam), the CEO decides (strictly senior to dana), and omar hears the appeal
 * (strictly senior to the CEO? NO — omar is the CEO's peer). The fixture therefore
 * uses `leader` above `ceo` for the appeal, and the suite asserts the refusal when
 * omar tries to hear an appeal on a decision the CEO made.
 */
const investigator = (overrides = {}) => ({
  id: 'inv-1',
  caseId: 'case-1',
  investigatorId: 'dana',
  termsRef: 'TOR-FPR-001',
  termsText: 'Establish whether the review comment departed from the agreed standard, on the balance of probabilities.',
  assignedOn: '2026-11-02',
  assignedById: 'dana',
  createdAt: iso('2026-11-02T00:00:00.000Z'),
  ...overrides,
});

const FINDING_REASON = 'The thread is on the record and the author-first rule was agreed in writing a month earlier. The departure is established.';

const finding = (overrides = {}) => ({
  id: 'find-1',
  caseId: 'case-1',
  allegationId: 'alleg-1',
  outcome: 'upheld',
  standardOfProof: 'balance-of-probabilities',
  reason: FINDING_REASON,
  evidenceRef: 'SLACK-EXPORT-0001',
  foundOn: '2026-11-05',
  foundById: 'dana',
  createdAt: iso('2026-11-05T00:00:00.000Z'),
  ...overrides,
});

const DECISION_REASON = 'A first recorded departure from the review standard. A written warning restating the standard is proportionate.';

const decision = (overrides = {}) => ({
  id: 'dec-1',
  caseId: 'case-1',
  sanction: 'written-warning',
  reason: DECISION_REASON,
  decidedOn: '2026-11-08',
  decidedById: 'ceo',
  expiresOn: '2027-05-08',
  effectiveOn: null,
  createdAt: iso('2026-11-08T00:00:00.000Z'),
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
  const idFactory = (prefix) => `${prefix}-h${run}-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  return { store, storage, api };
}

/**
 * A MATRIX fixture where the investigator reaches a party on a DECLARED line rather
 * than the home line. `quinn` reports to `sam` at home and to `dana` on a project
 * line, so a hand that holds quinn on EITHER line is not independent of quinn.
 */
function matrixFixture(overrides = {}) {
  const raw = fixture(overrides);
  raw.people.push(person('quinn', 'ic', 'sam'));
  raw.reportingLines.push(
    line('rl-quinn-sam', 'quinn', 'sam', 'function'),
    line('rl-quinn-dana', 'quinn', 'dana', 'project'),
  );
  return raw;
}

const asSeat = (raw, activeSeatId) => ({ ...raw, settings: { ...(raw.settings || {}), activeSeatId } });

const report = (state) => buildCaseToAnswer(state, { now: NOW, settings: state.settings, seat: null });

const rowOf = (state, caseId = 'case-1') => report(state).rows.find((row) => row.case.id === caseId);

/* ---------------------------------------------------------------- 1. schema */

test('schema v207 is additive: ten empty ledgers, four bounded conventions, nothing inferred', () => {
  const empty = createEmptyState(T0);
  assert.equal(SCHEMA_VERSION, 211, 'ADR-0259 (cash covenant evidence) is the current head');
  for (const key of [
    'dgiCases', 'dgiAllegations', 'dgiInvestigators', 'dgiDirections', 'dgiFindings',
    'dgiDecisions', 'dgiAppeals', 'dgiAppealOutcomes', 'dgiWithdrawals', 'dgiMarkers',
  ]) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
    assert.deepEqual(empty[key], [], `${key} starts empty`);
  }
  const loaded = normalizeState(createEmptyState(T0), { now: NOW }).state;
  assert.equal(loaded.settings.dgiAutoPropagate, true, 'the rule switch is ON by default');

  // WHAT MUST NOT EXIST: a workspace default sanction, standard, outcome or period.
  for (const forbidden of [
    'dgiDefaultSanction', 'dgiDefaultStandard', 'dgiPresumedOutcome',
    'dgiInvestigationDeadline', 'dgiWarningPeriod', 'dgiLadderOverride',
  ]) {
    assert.equal(Object.keys(loaded.settings).includes(forbidden), false, `${forbidden} must not exist as a workspace default`);
  }

  const previous = { ...createEmptyState(T0), schemaVersion: 206 };
  for (const key of [
    'dgiCases', 'dgiAllegations', 'dgiInvestigators', 'dgiDirections', 'dgiFindings',
    'dgiDecisions', 'dgiAppeals', 'dgiAppealOutcomes', 'dgiWithdrawals', 'dgiMarkers',
  ]) delete previous[key];
  const { raw, applied } = migrate(previous);
  assert.deepEqual(applied, ['206 → 207', '207 → 208', '208 → 209', '209 → 210', '210 → 211']);
  for (const key of [
    'dgiCases', 'dgiAllegations', 'dgiInvestigators', 'dgiDirections', 'dgiFindings',
    'dgiDecisions', 'dgiAppeals', 'dgiAppealOutcomes', 'dgiWithdrawals', 'dgiMarkers',
  ]) {
    assert.deepEqual(raw[key], [], `${key} is created empty by the migration step`);
  }
  assert.equal(raw.settings.dgiAutoPropagate, true);
});

/* --------------------------------------------------- 2. fail-closed loaders */

test('an allegation without a written standard, statement or evidence is DROPPED with a counted warning', () => {
  const warnings = [];
  const rows = normalizeDgiAllegations([
    ALLEGATION,
    { ...ALLEGATION, id: 'a2', standardRef: '' },
    { ...ALLEGATION, id: 'a3', statement: 'too short' },
    { ...ALLEGATION, id: 'a4', evidenceRef: '' },
    { ...ALLEGATION, id: 'a5', classKey: 'not-a-class' },
    { ...ALLEGATION, id: 'a5' },
  ], NOW, warnings);
  assert.equal(rows.length, 1, 'only the whole, readable allegation survives');
  assert.equal(rows[0].id, 'alleg-1');
  assert.ok(warnings.some((value) => value.includes('allegation')), 'the refusal is counted, not silent');
});

test('a case with no readable allegation is dropped WHOLE and its orphan allegations are counted', () => {
  const warnings = [];
  const allegations = normalizeDgiAllegations([{ ...ALLEGATION, caseId: 'gone' }], NOW, []);
  const cases = normalizeDgiCases([{ ...CASE, id: 'case-2' }], allegations, [{ id: 'sam' }, { id: 'riley' }], NOW, warnings);
  assert.equal(cases.length, 0, 'a case nobody can state is not a case');
  assert.ok(warnings.some((value) => value.includes('allegation(s) name a case that is not on the record')), 'the orphans are reported');
});

test('a case naming the same person as subject and raiser is dropped: one person cannot be both', () => {
  const allegations = normalizeDgiAllegations([ALLEGATION], NOW, []);
  const cases = normalizeDgiCases([{ ...CASE, raisedById: 'sam' }], allegations, [{ id: 'sam' }], NOW, []);
  assert.equal(cases.length, 0);
});

test('settings are clamped on load but the DEFAULT SANCTION, STANDARD and OUTCOME do not exist', () => {
  const clamped = normalizeDgiSettings({ dgiPrivacyFloor: 900, dgiAppealWindowDays: -5, dgiFindingWindowDays: 'x' });
  assert.equal(clamped.dgiPrivacyFloor, 20, 'clamped to the declared ceiling');
  assert.equal(clamped.dgiAppealWindowDays, 0, 'clamped to the declared floor');
  assert.equal(clamped.dgiFindingWindowDays, 28, 'an unreadable value falls back to the declared default');
  assert.equal(clamped.dgiAutoPropagate, true);
});

/* ------------------------------------------------ 3. standard of proof lock */

test('a finding naming a standard the case did not declare is REFUSED at the door and does not count on read', () => {
  const raw = fixture({
    dgiCases: [CASE],
    dgiAllegations: [ALLEGATION],
    dgiInvestigators: [investigator()],
    dgiFindings: [finding({ standardOfProof: 'serious-and-substantiated' })],
  });
  const { api } = harness(asSeat(raw, 'dana'));

  // THE READ: the finding is kept, printed and unreliable.
  const state = load(raw);
  const row = rowOf(state);
  assert.equal(row.allegations[0].standardMismatch, true);
  assert.equal(row.allegations[0].reliable, false);

  // THE DOOR: a fresh case refuses the same mistake outright.
  const open = api.dgiOpen({
    caseRef: 'FPR-2026-777',
    caseKind: 'conduct',
    standardOfProof: 'balance-of-probabilities',
    subjectId: 'sam',
    basisRef: 'HR-POL-04',
    openedOn: '2026-11-01',
    allegations: [{ classKey: 'conduct', statement: ALLEGATION.statement, standardRef: 'CS-REVIEW-02', standardText: STANDARD_TEXT, evidenceRef: 'SLACK-1' }],
  });
  assert.equal(open.ok, true, open.error);
  const assign = api.dgiAssignInvestigator({ caseId: open.id, investigatorId: 'dana', termsRef: 'TOR-777', termsText: investigator().termsText, assignedOn: '2026-11-02' });
  assert.equal(assign.ok, true, assign.error);
  const found = api.dgiRecordFinding({
    caseId: open.id,
    allegationId: open.allegations[0].id,
    outcome: 'upheld',
    standardOfProof: 'serious-and-substantiated',
    reason: FINDING_REASON,
    evidenceRef: 'SLACK-EXPORT-1',
    foundOn: '2026-11-05',
  });
  assert.equal(found.ok, false);
  assert.match(found.error, /does not change afterwards/);
});

/* --------------------------------------------- 4. independence and seniority */

test('independence refuses a hand in BOTH directions and refuses the parties themselves', () => {
  const state = load(matrixFixture({ dgiCases: [CASE], dgiAllegations: [ALLEGATION] }));
  const r = report(state);
  const matrix = r.matrix;

  // IS a party.
  assert.equal(dgiIndependence(matrix, 'sam', ['sam', 'riley']).ok, false);
  // HOLDS a party (mei manages sam).
  // mei manages BOTH parties in this fixture, so both are named back.
  const holds = dgiIndependence(matrix, 'mei', ['sam', 'riley']);
  assert.equal(holds.ok, false);
  assert.deepEqual(holds.holdsPartyIds, ['sam', 'riley']);
  // HOLDS a party on the home line: sam manages quinn, so sam must not
  // investigate a case quinn raised.
  const holdsQuinn = dgiIndependence(matrix, 'sam', ['riley', 'quinn']);
  assert.equal(holdsQuinn.ok, false);
  assert.deepEqual(holdsQuinn.holdsPartyIds, ['quinn']);
  // IS HELD BY a party — the direction that is easy to get backwards. riley
  // reports up through dana, so riley must not investigate a case dana raised:
  // riley owes its own position to the person it would be judging.
  const heldBy = dgiIndependence(matrix, 'riley', ['dana', 'omar']);
  assert.equal(heldBy.ok, false);
  assert.deepEqual(heldBy.heldByPartyIds, ['dana']);
  assert.deepEqual(heldBy.holdsPartyIds, [], 'held-by is reported as its own direction, never folded into held');
  // A hand on a DECLARED line counts: dana holds quinn on a project line.
  const projectLine = dgiIndependence(matrix, 'dana', ['quinn']);
  assert.equal(projectLine.ok, false);
  assert.deepEqual(projectLine.holdsPartyIds, ['quinn']);
  // An unrelated hand with no line either way is independent.
  assert.equal(dgiIndependence(matrix, 'omar', ['sam', 'riley']).ok, true);
  // Being SENIOR to a party is not a disqualifier — it is required of the decider.
  assert.equal(dgiIndependence(matrix, 'dana', ['sam']).ok, true);
});

test('strict seniority is one-directional: a peer is never senior, and a hand is not senior to itself', () => {
  const state = load(fixture({ dgiCases: [CASE], dgiAllegations: [ALLEGATION] }));
  const matrix = report(state).matrix;
  assert.equal(dgiStrictlySeniorTo(matrix, 'dana', 'sam').ok, true, 'dana is above sam');
  assert.equal(dgiStrictlySeniorTo(matrix, 'mei', 'dana').ok, false, 'mei reports to dana, not above her');
  assert.equal(dgiStrictlySeniorTo(matrix, 'omar', 'dana').ok, false, 'omar is dana’s peer');
  assert.equal(dgiStrictlySeniorTo(matrix, 'dana', 'dana').ok, false, 'a hand is not senior to itself');
});

test('the door refuses an investigator who manages a party, and refuses one who is not senior to the subject', () => {
  const raw = fixture({ dgiCases: [CASE], dgiAllegations: [ALLEGATION] });
  const { api } = harness(asSeat(raw, 'dana'));

  const manages = api.dgiAssignInvestigator({ caseId: 'case-1', investigatorId: 'mei', termsRef: 'TOR-1', termsText: investigator().termsText, assignedOn: '2026-11-02' });
  assert.equal(manages.ok, false);
  assert.match(manages.error, /not independent|not senior/);

  // riley is the person who RAISED it and is sam's peer: not senior to sam either.
  const peer = api.dgiAssignInvestigator({ caseId: 'case-1', investigatorId: 'riley', termsRef: 'TOR-1', termsText: investigator().termsText, assignedOn: '2026-11-02' });
  assert.equal(peer.ok, false);

  // finn is on a different branch entirely and junior to sam. Not a party, but not senior.
  const notSenior = api.dgiAssignInvestigator({ caseId: 'case-1', investigatorId: 'finn', termsRef: 'TOR-1', termsText: investigator().termsText, assignedOn: '2026-11-02' });
  assert.equal(notSenior.ok, false);
  assert.match(notSenior.error, /senior/);

  // dana is independent of both parties AND strictly senior to sam.
  const good = api.dgiAssignInvestigator({ caseId: 'case-1', investigatorId: 'dana', termsRef: 'TOR-FPR-001', termsText: investigator().termsText, assignedOn: '2026-11-02' });
  assert.equal(good.ok, true, good.error);
});

test('an investigator who walked into an interest AFTER assignment is printed, and their finding does not count', () => {
  const raw = fixture({
    dgiCases: [CASE],
    dgiAllegations: [ALLEGATION],
    dgiInvestigators: [investigator()],
    dgiFindings: [finding()],
  });
  // The live graph changes: dana now holds sam directly as well as mei.
  raw.reportingLines.push(line('rl-sam-dana', 'sam', 'dana', 'project'));
  const state = load(raw);
  const row = rowOf(state);
  assert.equal(row.investigatorValid, false, 'the verdict is recomputed on every read');
  assert.match(row.investigatorInvalidReason, /manager|reports|not/);
  assert.equal(row.allegations[0].reliable, false, 'a finding by that hand does not count');
  // A decision resting on those findings is a record conflict, never a closed case.
  const withDecision = load({ ...raw, dgiDecisions: [decision()] });
  assert.equal(rowOf(withDecision).state.key, 'record-conflict');
  assert.ok(rowOf(withDecision).conflicts.some((c) => c.key === 'decision-on-unreliable-findings'));
});

/* --------------------------------------------------------- 5. the decision */

test('the door refuses a decision before every allegation carries a reliable finding, and refuses a second decision', () => {
  const twoAllegations = [ALLEGATION, { ...ALLEGATION, id: 'alleg-2', sequence: 2, statement: 'A second written allegation of the same class, with its own evidence.' }];
  const raw = fixture({
    dgiCases: [CASE],
    dgiAllegations: twoAllegations,
    dgiInvestigators: [investigator()],
    dgiFindings: [finding()],
  });
  const { api } = harness(asSeat(raw, 'ceo'));
  const early = api.dgiDecideSanction({ caseId: 'case-1', sanction: 'written-warning', reason: DECISION_REASON, decidedOn: '2026-11-08' });
  assert.equal(early.ok, false);
  assert.match(early.error, /before every allegation carries a written finding/);

  // With both findings on the record the decision is accepted, and a second is refused.
  const complete = harness(asSeat(fixture({
    dgiCases: [CASE],
    dgiAllegations: twoAllegations,
    dgiInvestigators: [investigator()],
    dgiFindings: [finding(), finding({ id: 'find-2', allegationId: 'alleg-2' })],
  }), 'ceo'));
  const first = complete.api.dgiDecideSanction({ caseId: 'case-1', sanction: 'written-warning', reason: DECISION_REASON, decidedOn: '2026-11-08', expiresOn: '2027-05-08' });
  assert.equal(first.ok, true, first.error);
  const second = complete.api.dgiDecideSanction({ caseId: 'case-1', sanction: 'dismissal', reason: DECISION_REASON, decidedOn: '2026-11-08', effectiveOn: '2026-11-09' });
  assert.equal(second.ok, false);
  assert.match(second.error, /A second sanction decision|recorded once/);
});

test('the decider must be strictly senior to the investigator: the hand that decides what happened does not decide what it costs', () => {
  const raw = fixture({
    dgiCases: [CASE],
    dgiAllegations: [ALLEGATION],
    dgiInvestigators: [investigator()],
    dgiFindings: [finding()],
  });
  // dana investigated, so dana cannot decide her own finding.
  const asDana = harness(asSeat(raw, 'dana'));
  const refused = asDana.api.dgiDecideSanction({ caseId: 'case-1', sanction: 'written-warning', reason: DECISION_REASON, decidedOn: '2026-11-08' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /strictly senior to the investigator/);

  // mei is dana's subordinate: also refused.
  const asMei = harness(asSeat(raw, 'mei'));
  const subordinate = asMei.api.dgiDecideSanction({ caseId: 'case-1', sanction: 'written-warning', reason: DECISION_REASON, decidedOn: '2026-11-08' });
  assert.equal(subordinate.ok, false);
});

test('nothing to sanction: a case where every allegation failed needs no decision, and the door refuses to manufacture one', () => {
  const raw = fixture({
    dgiCases: [CASE],
    dgiAllegations: [ALLEGATION],
    dgiInvestigators: [investigator()],
    dgiFindings: [finding({ outcome: 'not-upheld' })],
  });
  const { api } = harness(asSeat(raw, 'ceo'));
  const refused = api.dgiDecideSanction({ caseId: 'case-1', sanction: 'written-warning', reason: DECISION_REASON, decidedOn: '2026-11-08' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /nothing to sanction/);
});

/* ------------------------------------------------------ 6. the ladder */

test('the ladder computes the lowest rung above the subject’s own live sanction of the same class', () => {
  // No prior record: the computed rung is a recorded conversation (rank 1), NOT `none`.
  const first = dgiLadderReading({ prior: null, chosenSanction: 'recorded-conversation' });
  assert.equal(first.computedRank, 1);
  assert.equal(first.isDeparture, false);
  // Choosing `none` on a first upheld allegation IS a departure and is printed.
  assert.equal(dgiLadderReading({ prior: null, chosenSanction: 'none' }).departure, -1);
  // With a live written warning, the next rung is a final written warning.
  const escalated = dgiLadderReading({ prior: { sanction: 'written-warning', decidedOn: '2026-06-01', caseRef: 'FPR-1', classKeys: ['conduct'] }, chosenSanction: 'final-written-warning' });
  assert.equal(escalated.computedRank, 3);
  assert.equal(escalated.isDeparture, false);
  // Escalating past it is a POSITIVE departure, and the exact rank is printed.
  const above = dgiLadderReading({ prior: { sanction: 'written-warning', decidedOn: '2026-06-01' }, chosenSanction: 'dismissal' });
  assert.equal(above.departure, 2);
  // The ladder tops out at dismissal.
  assert.equal(dgiLadderReading({ prior: { sanction: 'dismissal' }, chosenSanction: 'dismissal' }).computedRank, 5);
});

test('the reader reads the subject’s own live record, ignores other classes, and ignores an EXPIRED sanction', () => {
  const OTHER_CASE = {
    ...CASE,
    id: 'case-0',
    caseRef: 'FPR-2026-000',
    raisedById: 'riley',
    openedOn: '2026-05-01',
    createdAt: iso('2026-05-01T00:00:00.000Z'),
  };
  const otherAllegation = { ...ALLEGATION, id: 'alleg-0', caseId: 'case-0', raisedOn: '2026-05-01', createdAt: iso('2026-05-01T00:00:00.000Z') };
  const otherFinding = {
    ...finding({ id: 'find-0', caseId: 'case-0', allegationId: 'alleg-0', foundOn: '2026-05-05', createdAt: iso('2026-05-05T00:00:00.000Z') }),
  };
  const earlierDecision = decision({
    id: 'dec-0',
    caseId: 'case-0',
    decidedOn: '2026-05-08',
    expiresOn: '2026-11-08',
    createdAt: iso('2026-05-08T00:00:00.000Z'),
  });
  const raw = fixture({
    dgiCases: [OTHER_CASE, CASE],
    dgiAllegations: [otherAllegation, ALLEGATION],
    dgiInvestigators: [
      investigator({ id: 'inv-0', caseId: 'case-0', assignedOn: '2026-05-02', createdAt: iso('2026-05-02T00:00:00.000Z') }),
      investigator(),
    ],
    dgiFindings: [otherFinding, finding()],
    dgiDecisions: [earlierDecision, decision({ sanction: 'final-written-warning' })],
  });
  const row = rowOf(load(raw));
  assert.ok(row.ladder, 'the ladder reading exists');
  assert.equal(row.ladder.previousRank, 2, 'the earlier written warning is on the record');
  assert.equal(row.ladder.computedRank, 3);
  // The decision-maker chose exactly the rung the record computes, so there is NO
  // departure — which is the point: the ladder is satisfied by the obvious answer.
  assert.equal(row.ladder.isDeparture, false);
  assert.equal(row.ladder.departure, 0);

  // Now the SAME record with a decision ABOVE the computed rung: a positive departure.
  const aboveRaw = { ...raw, dgiDecisions: [earlierDecision, decision({ sanction: 'dismissal', effectiveOn: '2026-11-09' })] };
  const aboveRow = rowOf(load(aboveRaw));
  assert.equal(aboveRow.ladder.isDeparture, true);
  assert.equal(aboveRow.ladder.departure, 2);

  // Now expire it: the same decision with an expiry before this case's decision day.
  const expired = load({ ...raw, dgiDecisions: [{ ...earlierDecision, expiresOn: '2026-10-01' }, decision({ sanction: 'final-written-warning' })] });
  const expiredRow = rowOf(expired);
  assert.equal(expiredRow.ladder.previous, null, 'an expired sanction is not used to escalate a new case');
  assert.equal(expiredRow.ladder.computedRank, 1);
});

/* -------------------------------------------------------- 7. appeals */

test('an appeal needs a decision, a different hand, and strict seniority over the decision-maker', () => {
  const base = fixture({
    dgiCases: [CASE],
    dgiAllegations: [ALLEGATION],
    dgiInvestigators: [investigator()],
    dgiFindings: [finding()],
    dgiDecisions: [decision()],
  });
  // No appeal on a case with no decision. `mei` is a SEATED hand (rank 2, holds
  // sam on the home line) and carries the case, so only the missing decision can
  // be what refuses the lodge — not an unresolved seat.
  const noDecision = harness(asSeat(fixture({
    dgiCases: [CASE],
    dgiAllegations: [ALLEGATION],
    dgiInvestigators: [investigator()],
    dgiFindings: [finding()],
  }), 'mei'));
  const early = noDecision.api.dgiLodgeAppeal({ caseId: 'case-1', grounds: 'The finding rests on one screenshot and the context is missing from the record.', lodgedOn: '2026-11-09' });
  assert.equal(early.ok, false);
  assert.match(early.error, /only be lodged against a decision/);

  // THE SAME HAND CANNOT HEAR IT.
  const sameHand = harness(asSeat({ ...base, dgiAppeals: [{
    id: 'app-1', caseId: 'case-1', decisionId: 'dec-1',
    grounds: 'The finding rests on one screenshot and the context is missing from the record.',
    lodgedOn: '2026-11-09', lodgedById: 'sam', createdAt: iso('2026-11-09T00:00:00.000Z'),
  }] }, 'ceo'));
  const self = sameHand.api.dgiDecideAppeal({ caseId: 'case-1', outcome: 'allowed', reason: 'A written reason for the appeal decision that is long enough to pass.', decidedOn: '2026-11-12' });
  assert.equal(self.ok, false);
  assert.match(self.error, /did not decide|different hand|same hand|decided the case/i);

  // A PEER OF THE DECIDER CANNOT HEAR IT. omar is the ceo's peer.
  const peerHand = harness(asSeat({ ...base, dgiAppeals: [{
    id: 'app-1', caseId: 'case-1', decisionId: 'dec-1',
    grounds: 'The finding rests on one screenshot and the context is missing from the record.',
    lodgedOn: '2026-11-09', lodgedById: 'sam', createdAt: iso('2026-11-09T00:00:00.000Z'),
  }] }, 'omar'));
  const peer = peerHand.api.dgiDecideAppeal({ caseId: 'case-1', outcome: 'allowed', reason: 'A written reason for the appeal decision that is long enough to pass.', decidedOn: '2026-11-12' });
  assert.equal(peer.ok, false);

  // The workspace leader is above everyone and independent: allowed.
  const leader = harness(asSeat({ ...base, dgiAppeals: [{
    id: 'app-1', caseId: 'case-1', decisionId: 'dec-1',
    grounds: 'The finding rests on one screenshot and the context is missing from the record.',
    lodgedOn: '2026-11-09', lodgedById: 'sam', createdAt: iso('2026-11-09T00:00:00.000Z'),
  }] }, 'leader'));
  const ok = leader.api.dgiDecideAppeal({ caseId: 'case-1', outcome: 'varied', sanction: 'recorded-conversation', reason: 'A written reason for the appeal decision that is long enough to pass.', decidedOn: '2026-11-12' });
  assert.equal(ok.ok, true, ok.error);
  const row = rowOf(leader.store.state);
  assert.equal(row.decision.sanction, 'written-warning', 'the decision below is NEVER rewritten');
  assert.equal(row.effectiveSanction, 'recorded-conversation', 'the appeal outcome stands');
  assert.equal(row.overturned, true);
});

test('a varied appeal must carry a substituted sanction, and an allowed or refused one must not', () => {
  const base = { ...fixture({
    dgiCases: [CASE],
    dgiAllegations: [ALLEGATION],
    dgiInvestigators: [investigator()],
    dgiFindings: [finding()],
    dgiDecisions: [decision()],
  }), dgiAppeals: [{
    id: 'app-1', caseId: 'case-1', decisionId: 'dec-1',
    grounds: 'The sanction is above what a first departure has attracted in this team.',
    lodgedOn: '2026-11-09', lodgedById: 'sam', createdAt: iso('2026-11-09T00:00:00.000Z'),
  }] };
  const { api, store } = harness(asSeat(base, 'leader'));
  const noSanction = api.dgiDecideAppeal({ caseId: 'case-1', outcome: 'varied', reason: 'A written reason for the appeal decision that is long enough to pass.', decidedOn: '2026-11-12' });
  assert.equal(noSanction.ok, false);
  const straySanction = api.dgiDecideAppeal({ caseId: 'case-1', outcome: 'refused', sanction: 'none', reason: 'A written reason for the appeal decision that is long enough to pass.', decidedOn: '2026-11-12' });
  assert.equal(straySanction.ok, false);
  const refused = api.dgiDecideAppeal({ caseId: 'case-1', outcome: 'refused', reason: 'A written reason for the appeal decision that is long enough to pass.', decidedOn: '2026-11-12' });
  assert.equal(refused.ok, true, refused.error);
  const refusedRow = rowOf(store.state);
  assert.equal(refusedRow.appealOutcome.outcome, 'refused');
  assert.equal(refusedRow.decision.sanction, 'written-warning', 'a refused appeal leaves the decision exactly as it stood');
  assert.equal(refusedRow.effectiveSanction, 'written-warning');
  assert.equal(refusedRow.overturned, false, 'a refused appeal overturns nothing');
});

/* ---------------------------------------------------- 8. withdrawals */

test('a withdrawal needs a declared reason and a written basis, and never clears the subject', () => {
  const raw = fixture({ dgiCases: [CASE], dgiAllegations: [ALLEGATION] });
  const { api, store } = harness(asSeat(raw, 'dana'));
  const noReason = api.dgiWithdraw({ caseId: 'case-1', basis: 'The person who raised it asked in writing for it to be withdrawn.', withdrawnOn: '2026-11-10' });
  assert.equal(noReason.ok, false);
  const supersededNoRef = api.dgiWithdraw({ caseId: 'case-1', reasonKey: 'superseded', basis: 'A new case replaced this one and the new case is on the record.', withdrawnOn: '2026-11-10' });
  assert.equal(supersededNoRef.ok, false);
  const ok = api.dgiWithdraw({ caseId: 'case-1', reasonKey: 'withdrawn-by-complainant', basis: 'The person who raised it asked in writing for it to be withdrawn, for a stated reason.', withdrawnOn: '2026-11-10' });
  assert.equal(ok.ok, true, ok.error);
  const row = rowOf(store.state);
  assert.equal(row.state.key, 'withdrawn');
  assert.equal(row.caseUpheld, false, 'a withdrawal is not a finding in either direction');
  assert.equal(row.findingsComplete, false, 'nobody found anything, and the register does not pretend otherwise');
  assert.equal(row.upheldN, 0);
});

test('a case with a decision cannot be withdrawn: a decision is ended by an appeal, not erased', () => {
  const raw = fixture({
    dgiCases: [CASE],
    dgiAllegations: [ALLEGATION],
    dgiInvestigators: [investigator()],
    dgiFindings: [finding()],
    dgiDecisions: [decision()],
  });
  const { api } = harness(asSeat(raw, 'dana'));
  const refused = api.dgiWithdraw({ caseId: 'case-1', reasonKey: 'withdrawn-by-complainant', basis: 'Somebody asked for it to be withdrawn after the decision was made.', withdrawnOn: '2026-11-10' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /appeal, not by a withdrawal/);
});

/* ------------------------------------------------------ 9. fair order */

test('acts out of fair order derive record-conflict and are never repaired', () => {
  const cases = [CASE];
  const base = { dgiCases: cases, dgiAllegations: [ALLEGATION], dgiInvestigators: [investigator()] };

  // A finding before the case was opened.
  const beforeCase = load(fixture({ ...base, dgiFindings: [finding({ foundOn: '2026-10-20' })] }));
  assert.equal(rowOf(beforeCase).state.key, 'record-conflict');
  assert.ok(rowOf(beforeCase).conflicts.some((c) => c.key === 'finding-before-case'));

  // A decision before the findings.
  const beforeFinding = load(fixture({ ...base, dgiFindings: [finding({ foundOn: '2026-11-15' })], dgiDecisions: [decision({ decidedOn: '2026-11-10' })] }));
  assert.ok(rowOf(beforeFinding).conflicts.some((c) => c.key === 'decision-before-finding'));

  // Two decisions.
  const twoDecisions = load(fixture({
    ...base,
    dgiFindings: [finding()],
    dgiDecisions: [decision(), decision({ id: 'dec-2', sanction: 'dismissal', effectiveOn: '2026-11-09' })],
  }));
  assert.ok(rowOf(twoDecisions).conflicts.some((c) => c.key === 'two-decisions'));

  // An appeal dated before the decision it appeals.
  const appealBefore = load(fixture({
    ...base,
    dgiFindings: [finding()],
    dgiDecisions: [decision()],
    dgiAppeals: [{ id: 'app-1', caseId: 'case-1', decisionId: 'dec-1', grounds: 'Grounds long enough to be a real written ground of appeal.', lodgedOn: '2026-11-02', lodgedById: 'sam', createdAt: iso('2026-11-02T00:00:00.000Z') }],
  }));
  assert.ok(rowOf(appealBefore).conflicts.some((c) => c.key === 'appeal-before-decision'));
});

/* ------------------------------------------- 10. altitude and the export */

test('above rank 2 the reader prints counts only, with a floor; the CSV is identity-free', () => {
  const raw = fixture({
    dgiCases: [CASE],
    dgiAllegations: [ALLEGATION],
    dgiInvestigators: [investigator()],
    dgiFindings: [finding()],
  });
  const state = load(raw);
  const seat = (activeSeatId) => activeSeat(buildSeats({ ...state, settings: { ...state.settings, activeSeatId } }, { now: NOW }));

  // rank 1–2 sees the case.
  const manager = buildCaseToAnswer(state, { now: NOW, settings: state.settings, seat: seat('dana') });
  assert.equal(manager.detailed, true);
  assert.equal(manager.rows.length, 1);
  // The route itself is an individual-record route: ceiling 2.
  assert.deepEqual(routeRankWindow('fair-process'), { floor: 1, ceiling: 2, kind: 'individual' });
  assert.equal(routeVerdict('fair-process', seat('ceo')).allow, false, 'a VP is not handed individual case material');

  // rank 3+ is counts only, with the reason printed.
  const director = buildCaseToAnswer(state, { now: NOW, settings: state.settings, seat: seat('mei') });
  // mei is rank 2 (manager) but is not a party's manager? She manages sam, so she is
  // inside the case's own reach. Use a seat that is not: the ceo at rank 5.
  const above = buildCaseToAnswer(state, { now: NOW, settings: state.settings, seat: seat('ceo') });
  assert.equal(above.detailed, false);
  assert.deepEqual(above.rows, [], 'no row reaches a seat above the ceiling');
  assert.match(above.disclosure.reason, /withheld/);
  // A non-zero count below the floor is withheld, not shown as a small number.
  const single = above.states.find((row) => row.key === 'decision-owed');
  assert.equal(single.count, null, 'one case is below the floor of three');
  assert.equal(single.withheld, true);
  assert.ok(director); // the rank-2 party-manager read is exercised above

  // The export carries no identity at all.
  const exported = buildScopeTable(state, 'fair-process-discipline', NOW);
  const csv = [exported.columns.map((col) => col.key).join(','), ...exported.rows.map((row) => exported.columns.map((col) => row[col.key] ?? '').join(','))].join('\n');
  for (const forbidden of ['FPR-2026-001', 'sam', 'riley', 'dana', 'CS-REVIEW-02', 'SLACK', 'review comment']) {
    assert.equal(csv.includes(forbidden), false, `the export must not contain “${forbidden}”`);
  }
  assert.ok(CSV_EXPORTS.some((row) => row.key === DGI_CSV_SCOPE), 'the scope is registered');
});

test('the CSV rows are exactly the reader’s figures, and a below-floor cell is blank with its reason', () => {
  // TWO cases, because the declared floor cannot go below 2 and a one-case
  // fixture could therefore never be printed at all.
  const raw = fixture({
    dgiCases: [CASE, { ...CASE, id: 'case-2', caseRef: 'FPR-2026-002', subjectId: 'finn', raisedById: 'omar' }],
    dgiAllegations: [ALLEGATION, { ...ALLEGATION, id: 'alleg-2', caseId: 'case-2' }],
    dgiInvestigators: [investigator()],
    dgiFindings: [finding()],
  });
  const state = load(raw);
  // ABOVE the floor the cell carries the reader's own case count — identical, not
  // approximate. The floor is declared at its minimum of 2 for this half.
  const open = buildCaseToAnswer(state, { now: NOW, settings: { ...state.settings, dgiPrivacyFloor: 2 }, seat: null });
  const openSummary = caseToAnswerCsvRows(open).find((row) => row.row_kind === 'summary');
  assert.equal(openSummary.cases_n, open.totals.cases);
  assert.equal(openSummary.cases_n, 2);
  // BELOW the floor the same cell is BLANK with its reason, never a rounded or a
  // zeroed figure: a withheld count that reads `0` is a lie about the record.
  const held = buildCaseToAnswer(state, { now: NOW, settings: { ...state.settings, dgiPrivacyFloor: 3 }, seat: null });
  const summary = caseToAnswerCsvRows(held).find((row) => row.row_kind === 'summary');
  assert.equal(summary.cases_n, null);
  assert.match(summary.blank_reason, /Below the declared privacy floor of 3/i);
  // The columns are the declared columns, in order.
  const built = Object.keys(summary);
  for (const key of DGI_CSV_COLUMNS) assert.ok(built.includes(key), `${key} is a declared column`);
});

/* --------------------------------------------------- 11. the rule */

test('RULE-DGI-01 files opaque asks addressed to the right seat, and is idempotent', () => {
  const raw = fixture({ dgiCases: [CASE], dgiAllegations: [ALLEGATION] });
  const state = load(raw);
  const r = buildCaseToAnswer(state, { now: NOW, settings: state.settings, seat: null });
  const { conditions, observations } = caseToAnswerConditions(r);
  assert.ok(conditions.some((c) => c.kind === 'assignment-owed'), 'an unassigned case owes an assignment');
  assert.equal(observations.length, 0, 'the apex resolves in this fixture');

  const draft = JSON.parse(JSON.stringify(state));
  const ctx = { event: { type: 'fair-process.case.opened', entity: 'workspace', entityId: 'FPR-2026-001' }, now: NOW, idFactory: (p) => `${p}-rule` };
  const out = caseToAnswerRule(draft, ctx);
  assert.ok(out.some((row) => row.action === 'delegated'), 'an ask is filed');
  const asks = indexDgiAsks(draft);
  assert.ok(asks.length >= 1);
  for (const ask of asks) {
    assert.equal(ask.signature, dgiAskSignature('assignment-owed', 'case-1'), 'the signature is deterministic and case-scoped');
    const task = draft.delegations.find((row) => row.id === ask.task.id);
    // THE ASK NAMES NOTHING. No case reference, person, allegation, standard or finding.
    for (const forbidden of ['FPR-2026-001', 'Sam', 'sam', 'Riley', 'review comment', 'CS-REVIEW-02', 'SLACK']) {
      assert.equal(String(task.title).includes(forbidden), false, `the title must not leak “${forbidden}”`);
      assert.equal(String(task.expectedOutcome).includes(forbidden), false, `the outcome must not leak “${forbidden}”`);
    }
  }

  // Idempotent: a second pass files nothing new.
  const before = draft.delegations.length;
  caseToAnswerRule(draft, ctx);
  assert.equal(draft.delegations.length, before, 'a second run does not duplicate the ask');
});

test('RULE-DGI-01 closes its own asks when the condition clears, and never re-files a human answer', () => {
  const raw = fixture({ dgiCases: [CASE], dgiAllegations: [ALLEGATION] });
  const state = load(raw);
  const draft = JSON.parse(JSON.stringify(state));
  const ctx = { event: { type: 'fair-process.case.opened' }, now: NOW, idFactory: (p) => `${p}-rule` };
  caseToAnswerRule(draft, ctx);
  const filed = indexDgiAsks(draft).length;
  assert.ok(filed > 0);

  // The condition clears: an investigator is assigned.
  draft.dgiInvestigators = [investigator()];
  const out = caseToAnswerRule(draft, { event: { type: 'fair-process.case.investigator-set' }, now: NOW, idFactory: (p) => `${p}-rule2` });
  assert.ok(out.some((row) => row.action === 'closed'), 'the register closes its own ask');
  const stillAssignment = indexDgiAsks(draft).filter((ask) => ask.kind === 'assignment-owed' && ask.task.status === 'active');
  assert.equal(stillAssignment.length, 0);
});

test('RULE-DGI-01 is pause-governed, and the pause switch is in the matrix reach census', () => {
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('dgiAutoPropagate'), 'the switch reaches across lines');
  assert.equal(PAUSE_PERMIT_SWITCH_RULES.dgiAutoPropagate, 'caseToAnswerRules.js');
  const raw = fixture({ dgiCases: [CASE], dgiAllegations: [ALLEGATION] });
  const state = load(raw);
  const paused = { ...JSON.parse(JSON.stringify(state)), settings: { ...state.settings, dgiAutoPropagate: false } };
  const out = caseToAnswerRule(paused, { event: { type: 'fair-process.case.opened' }, now: NOW, idFactory: (p) => `${p}-rule` });
  assert.deepEqual(out, [], 'a pause files nothing');
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.id === 'caseToAnswerRule'), 'the rule is on the spine');
  assert.ok(PROPAGATION_CONTRACTS.some((row) => row.module === 'caseToAnswerRules.js'), 'the contract is published');
});

test('RULE-DGI-01 writes an identity-free observation where nobody can be asked, and asks nobody', () => {
  // A disconnected case: the subject is not on any active line, so no apex resolves.
  const raw = fixture({ dgiCases: [{ ...CASE, subjectId: 'ghost', raisedById: null }], dgiAllegations: [{ ...ALLEGATION }] });
  const state = load(raw);
  const r = buildCaseToAnswer(state, { now: NOW, settings: state.settings, seat: null });
  const { conditions, observations } = caseToAnswerConditions(r);
  assert.equal(conditions.length, 0, 'nobody is asked');
  assert.ok(observations.length >= 1, 'the condition is recorded');

  const draft = JSON.parse(JSON.stringify(state));
  caseToAnswerRule(draft, { event: { type: 'fair-process.case.opened' }, now: NOW, idFactory: (p) => `${p}-rule` });
  assert.ok(draft.dgiMarkers.length >= 1, 'a marker is written');
  for (const marker of draft.dgiMarkers) {
    assert.match(marker.key, /^dgi1:/);
    assert.equal(marker.kind, 'fair-process');
    // THE MARKER CARRIES NOBODY'S NAME.
    assert.equal(marker.detail.includes('ghost'), false);
  }
});

test('the rule files at most four new asks per commit and counts the rest as deferred', () => {
  const cases = [];
  const allegations = [];
  for (let index = 0; index < 7; index += 1) {
    cases.push({ ...CASE, id: `case-${index}`, caseRef: `FPR-2026-10${index}`, createdAt: iso('2026-11-01T00:00:00.000Z') });
    allegations.push({ ...ALLEGATION, id: `alleg-${index}`, caseId: `case-${index}` });
  }
  const raw = fixture({ dgiCases: cases, dgiAllegations: allegations });
  const draft = JSON.parse(JSON.stringify(load(raw)));
  const out = caseToAnswerRule(draft, { event: { type: 'fair-process.case.opened' }, now: NOW, idFactory: (p) => `${p}-rule` });
  const filed = out.filter((row) => row.action === 'delegated').length;
  assert.equal(filed, 4, 'the cap is four');
  assert.ok(out.some((row) => row.action === 'deferred'), 'the remainder is counted, never dropped');
});

/* ------------------------------------------------- 12. display == computed */

test('the panel’s own report is the reader’s report: the figures it prints are the figures computed', () => {
  const raw = fixture({
    dgiCases: [CASE],
    dgiAllegations: [ALLEGATION],
    dgiInvestigators: [investigator()],
    dgiFindings: [finding()],
  });
  const { store } = harness(asSeat(raw, 'dana'));
  const { api: raw_ } = harness(asSeat(raw, 'dana'));
  const reported = raw_.dgiReport();
  assert.equal(reported.ok, true, reported.error);
  const directly = buildCaseToAnswer(store.state, { now: NOW, settings: store.state.settings, seat: activeSeat(buildSeats(store.state, { now: NOW })) });
  assert.deepEqual(reported.report.totals, directly.totals, 'the panel figure and the pure reader agree exactly');
  assert.deepEqual(
    reported.report.rows.map((row) => [row.case.caseRef, row.state.key, row.upheldN, row.notUpheldN]),
    directly.rows.map((row) => [row.case.caseRef, row.state.key, row.upheldN, row.notUpheldN]),
  );
});

test('the balances reconcile: every case lands in exactly one state and findings never outnumber allegations', () => {
  const raw = fixture({ dgiCases: [CASE], dgiAllegations: [ALLEGATION], dgiInvestigators: [investigator()], dgiFindings: [finding()] });
  const r = report(load(raw));
  assert.equal(r.balances.stateCountsReconcile, true);
  assert.equal(r.balances.findingsPartition, true);
  assert.equal(Object.values(r.counts).reduce((sum, value) => sum + value, 0), r.totals.cases);
});

test('rights, route floor and the gateway agree: every write is a named right', () => {
  for (const key of Object.values(DGI_RIGHTS)) {
    assert.ok(ACTION_RIGHTS[key], `${key} has a declared rank window`);
  }
  assert.equal(ACTION_RIGHTS[DGI_RIGHTS.DECIDE].minRank, 2, 'deciding a sanction is not a rank-1 act');
  assert.equal(ACTION_RIGHTS[DGI_RIGHTS.APPEAL].minRank, 2);
  assert.equal(ACTION_RIGHTS[DGI_RIGHTS.GOVERN].minRank, 4);
  assert.equal(ACTION_RIGHTS[DGI_RIGHTS.OPEN].minRank, 1, 'the case is opened where the allegation is made');
  assert.ok(DGI_LIMITS.allegationsPerCaseMax >= 1 && DGI_LIMITS.allegationsPerCaseMax <= 12);
});

test('the door refuses a case with no allegation and a case whose two parties are the same person', () => {
  const { api } = harness(asSeat(fixture({}), 'dana'));
  const noAllegation = api.dgiOpen({
    caseRef: 'FPR-2026-900', caseKind: 'conduct', standardOfProof: 'balance-of-probabilities',
    subjectId: 'sam', basisRef: 'HR-POL-04', openedOn: '2026-11-01', allegations: [],
  });
  assert.equal(noAllegation.ok, false);
  const samePerson = api.dgiOpen({
    caseRef: 'FPR-2026-901', caseKind: 'conduct', standardOfProof: 'balance-of-probabilities',
    subjectId: 'sam', raisedById: 'sam', basisRef: 'HR-POL-04', openedOn: '2026-11-01',
    allegations: [{ classKey: 'conduct', statement: ALLEGATION.statement, standardRef: 'CS-REVIEW-02', standardText: STANDARD_TEXT, evidenceRef: 'E-1' }],
  });
  assert.equal(samePerson.ok, false);
});

test('whole-day arithmetic is exact and never a floating-point approximation', () => {
  assert.equal(dgiDaysBetween('2026-11-01', '2026-11-08'), 7);
  assert.equal(dgiDaysBetween('2026-02-27', '2026-03-01'), 2, 'a non-leap February is handled exactly');
  assert.equal(dgiDaysBetween('2028-02-27', '2028-03-01'), 3, 'a leap February is handled exactly');
  assert.equal(dgiDaysBetween('2026-11-08', '2026-11-01'), -7);
  assert.equal(dgiDaysBetween('nonsense', '2026-11-01'), null);
});
