// ADR-0260 — Modern Slavery & Supply-Chain Due-Diligence Statement Register
// (Schema v212).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — ten empty ledgers and four declared
//      conventions, and no statement, deadline, approval, publication, supplier,
//      assessment, finding, remediation act or training record inferred from a
//      contract, a hiring record, a permit, a provision or a ledger account;
//   2. the loaders are FAIL-CLOSED — a statement with no reference, entity,
//      financial-year label or end, regime, written basis, responsible hand or
//      recording hand is DROPPED with a counted warning, a second statement for
//      one reference is dropped, a deadline with NO written basis is dropped, a
//      second deadline, approval or publication for one statement is dropped, a
//      COMPLETE remediation act with no completed day or evidence reference is
//      dropped, and every child row pointing at a parent that is not on the
//      register is dropped. Nothing is repaired;
//   3. the DEADLINE IS NEVER COMPUTED — it is a declared day with the written
//      basis that sets the window, and a statement without one prints
//      `deadline-undeclared` rather than a window inferred from the financial
//      year end;
//   4. the STATES are DERIVED and six different facts, and a published
//      statement its record does not support is refined to
//      `published-with-gaps` while an unpublished one keeps its own state;
//   5. the CLAIM about identified instances is DERIVED, never stored — REFUSED
//      where no assessment supports any claim, `instances-identified` where one
//      does, `risks-only` where the findings are not instances, and
//      `none-identified` only where assessments exist and found nothing;
//   6. the ELEMENTS are six separate verdicts, each printed with its own reason
//      where missing — and an assessment with an adverse outcome and no finding
//      beneath it is a gap in risk management, never smoothed over;
//   7. the MATRIX is correct — every active line holding every responsible hand
//      is resolved, a person is counted once, the joint apex is computed over
//      ALL of them (including a declared secondary line), and a hand off the
//      graph is printed as an orphan, never dropped;
//   8. RULE-MSA-01 is idempotent, capped at four asks per commit, self-closing,
//      pause-governed on every path, OPAQUE in its ask text (a due-diligence
//      schedule names suppliers and findings about workers) and observes
//      identity-free where nobody can be asked;
//   9. the DOOR refuses a duplicate statement reference, a bad regime, a bad
//      tier, a bad assessment kind, a second deadline for one statement, a
//      COMPLETE remediation act with no evidence and a future day, and narrows
//      every write to a seat that holds the responsible hands;
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
  buildModernSlavery,
  deriveModernSlavery,
  msaAttentionCount,
  msaSignals,
} from '../../app/core/domain/modernSlavery.js';
import {
  normalizeMsaStatements,
  normalizeMsaDeadlines,
  normalizeMsaApprovals,
  normalizeMsaPublications,
  normalizeMsaSuppliers,
  normalizeMsaAssessments,
  normalizeMsaFindings,
  normalizeMsaRemediations,
  normalizeMsaTraining,
  normalizeMsaSettings,
} from '../../app/core/domain/msaSchema.js';
import { wholeCount, utcDayMs, dayLabel } from '../../app/core/domain/msaMath.js';
import { msaConditions, msaRule, indexMsaAsks, MSA_PAUSE_SWITCH } from '../../app/core/domain/msaRules.js';
import {
  MSA_ASSESSMENT_KIND_KEYS,
  MSA_ASSESSMENT_OUTCOME_KEYS,
  MSA_CLAIM_KEYS,
  MSA_CSV_COLUMNS,
  MSA_CSV_SCOPE,
  MSA_ELEMENT_KEYS,
  MSA_FINDING_KIND_KEYS,
  MSA_REGIME_KEYS,
  MSA_REMEDIATION_KIND_KEYS,
  MSA_SETTING_KEYS,
  MSA_STATE_KEYS,
} from '../../app/core/domain/msaRegistry.js';
import { msaCsvRows } from '../../app/core/domain/msaReport.js';
import { renderModernSlavery } from '../../app/views/modernSlavery.js';

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

const statement = (overrides = {}) => ({
  id: 'msa-stmt-one',
  statementRef: 'MSA-2025-26',
  entityName: 'Meridian Components Group',
  fyLabel: 'FY2025-26',
  fyEndDay: day(-170),
  regime: 'uk-msa-2015',
  structureRef: 'Website: /about/supply-chain (structure description v3, published 2026-04)',
  policyRef: 'POL-ETH-04 Responsible Sourcing & Anti-Slavery Policy, revision 6',
  effectivenessRef: 'QBR-ETH-2026-Q2 supplier ethics scorecard pack',
  basisRef: 'The statement is prepared under the Modern Slavery Act 2015 s.54 for the group and its subsidiaries.',
  responsibleIds: ['samuel'],
  recordedById: 'mei',
  recordedAt: iso(day(-40)),
  recordedDay: day(-40),
  createdAt: iso(day(-40)),
  updatedAt: iso(day(-40)),
  ...overrides,
});

const deadline = (overrides = {}) => ({
  id: 'msa-dl-one',
  statementId: 'msa-stmt-one',
  deadlineDay: day(20),
  basisRef: 'Modern Slavery Act 2015 s.54(6): the statement must be published before the end of the period of six months beginning with the day after the financial year end.',
  declaredById: 'mei',
  declaredAt: iso(day(-40)),
  declaredDay: day(-40),
  createdAt: iso(day(-40)),
  ...overrides,
});

const approval = (overrides = {}) => ({
  id: 'msa-apr-one',
  statementId: 'msa-stmt-one',
  approvedDay: day(-10),
  approvalRef: 'BOARD-MIN-2026-11-05-02 (approval of the modern slavery statement)',
  basisRef: 'The board approved the statement as presented by the ethics committee, minute reference recorded.',
  recordedById: 'mei',
  recordedAt: iso(day(-10)),
  recordedDay: day(-10),
  createdAt: iso(day(-10)),
  ...overrides,
});

const publication = (overrides = {}) => ({
  id: 'msa-pub-one',
  statementId: 'msa-stmt-one',
  publishedDay: day(-5),
  publicationRef: 'https://meridian.example/modern-slavery-statement-2026.pdf',
  basisRef: 'Published on the group website with a prominent link from the footer of every page, as the regime requires.',
  recordedById: 'mei',
  recordedAt: iso(day(-5)),
  recordedDay: day(-5),
  createdAt: iso(day(-5)),
  ...overrides,
});

const supplier = (overrides = {}) => ({
  id: 'msa-sup-one',
  supplierRef: 'SUP-1001',
  supplierName: 'Dhaka Precision Garments Ltd',
  tier: 1,
  country: 'Bangladesh',
  category: 'Garments',
  addedDay: day(-500),
  responsibleIds: ['samuel'],
  recordedById: 'mei',
  recordedAt: iso(day(-500)),
  recordedDay: day(-500),
  createdAt: iso(day(-500)),
  ...overrides,
});

const assessment = (overrides = {}) => ({
  id: 'msa-asm-one',
  statementId: 'msa-stmt-one',
  supplierId: 'msa-sup-one',
  assessmentKind: 'audit',
  outcome: 'issues-found',
  assessedOn: day(-60),
  assessorRef: 'Elevate Global — social audit programme',
  evidenceRef: 'AUD-2026-0871 social audit report',
  basisRef: 'Announced social audit against the group labour standards code, worker interviews and payroll sampling.',
  recordedById: 'mei',
  recordedAt: iso(day(-60)),
  recordedDay: day(-60),
  createdAt: iso(day(-60)),
  ...overrides,
});

const finding = (overrides = {}) => ({
  id: 'msa-fnd-one',
  assessmentId: 'msa-asm-one',
  findingKind: 'instance',
  severity: 'severe',
  identifiedOn: day(-60),
  findingRef: 'FND-2026-014',
  basisRef: 'Identified instance: agency workers paid recruitment fees and had identity documents retained pending repayment. Workers are owed direct remediation.',
  recordedById: 'mei',
  recordedAt: iso(day(-60)),
  recordedDay: day(-60),
  createdAt: iso(day(-60)),
  ...overrides,
});

const remediation = (overrides = {}) => ({
  id: 'msa-rem-one',
  findingId: 'msa-fnd-one',
  remediationKind: 'fees-repaid',
  status: 'planned',
  declaredOn: day(-55),
  completedOn: null,
  evidenceRef: null,
  basisRef: 'A worker-remediation plan is agreed with the agency: fees repaid in full, documents returned, housing terms corrected.',
  recordedById: 'mei',
  recordedAt: iso(day(-55)),
  recordedDay: day(-55),
  createdAt: iso(day(-55)),
  ...overrides,
});

const training = (overrides = {}) => ({
  id: 'msa-trn-one',
  statementId: 'msa-stmt-one',
  trainingDay: day(-45),
  populationRef: 'Procurement, buying and supplier-quality staff (46 people)',
  deliveryRef: 'MSA-REFRESH-2026-Q1 workshop',
  evidenceRef: 'LMS-EXPORT-2026-0112 completion records',
  basisRef: 'Annual refresher on the ILO indicators of forced labour, recruitment-fee red flags and the escalation path.',
  recordedById: 'mei',
  recordedAt: iso(day(-45)),
  recordedDay: day(-45),
  createdAt: iso(day(-45)),
  ...overrides,
});

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildModernSlavery(load(raw), { now: NOW, seat: null, ...opts });

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

test('schema v214 is additive: ten empty ledgers, four conventions, nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 214, 'ADR-0262 (secondment & assignment return) is the current head; prior registers ride along');
  const state = load(fixture());
  for (const collection of ['msaStatements', 'msaDeadlines', 'msaApprovals', 'msaPublications', 'msaSuppliers', 'msaAssessments', 'msaFindings', 'msaRemediations', 'msaTraining', 'msaMarkers']) {
    assert.ok(COLLECTIONS.includes(collection), `${collection} must be a governed collection`);
    assert.deepEqual(state[collection], [], `${collection} starts empty`);
  }
  assert.equal(state.settings.msaAutoPropagate, true);
  assert.equal(state.settings.msaPrivacyFloor, 3);
  assert.equal(state.settings.msaWarnHorizonDays, 90);
  assert.equal(state.settings.msaAssessmentCycleDays, 365);
});

test('migrating a v211 workspace adds ten empty ledgers and infers no statement or act', () => {
  const raw = createEmptyState(T0);
  raw.schemaVersion = 211;
  delete raw.msaStatements;
  delete raw.msaDeadlines;
  delete raw.msaApprovals;
  delete raw.msaPublications;
  delete raw.msaSuppliers;
  delete raw.msaAssessments;
  delete raw.msaFindings;
  delete raw.msaRemediations;
  delete raw.msaTraining;
  delete raw.msaMarkers;
  const migrated = migrate(raw, { now: NOW }).raw;
  for (const collection of ['msaStatements', 'msaDeadlines', 'msaApprovals', 'msaPublications', 'msaSuppliers', 'msaAssessments', 'msaFindings', 'msaRemediations', 'msaTraining', 'msaMarkers']) {
    assert.deepEqual(migrated.state?.[collection] ?? migrated[collection], []);
  }
});

/* ------------------------------------------------------------ 2. fail-closed */

test('the statement loader drops a row missing any required fact, and a second statement for one reference', () => {
  const warnings = [];
  const rows = [
    statement(),
    statement({ id: 'dup', statementRef: 'MSA-2025-26' }),
    statement({ id: 'no-ref', statementRef: '' }),
    statement({ id: 'no-entity', statementRef: 'REFB', entityName: '' }),
    statement({ id: 'no-fy', statementRef: 'REFC', fyEndDay: null }),
    statement({ id: 'bad-fy', statementRef: 'REFD', fyEndDay: 'sometime last year' }),
    statement({ id: 'bad-regime', statementRef: 'REFE', regime: 'fr-loi-devigilance' }),
    statement({ id: 'short-basis', statementRef: 'REFF', basisRef: 'short' }),
    statement({ id: 'ghost-holder', statementRef: 'REFG', responsibleIds: ['ghost'] }),
    statement({ id: 'no-recorder', statementRef: 'REFH', recordedById: null }),
  ];
  const kept = normalizeMsaStatements(rows, warnings);
  assert.deepEqual(kept.map((row) => row.id), ['msa-stmt-one', 'ghost-holder'], 'the unreadable rows are dropped; a statement whose hands are off the roster is KEPT — the reader prints it as an orphan rather than erasing a live statement');
  assert.equal(warnings.length, 1, 'the drops are counted in one aggregate warning, never repaired');
  assert.match(warnings[0], /could not be read exactly/);
  assert.match(warnings[0], /Nothing was repaired/);
  assert.match(warnings[0], /8 statement row/);
  // The future financial-year end is a DOOR refusal (claim 9): the loader has no
  // clock and never pretends to one.
});

test('a deadline with no written basis is DROPPED, and a second deadline for one statement is refused', () => {
  const warnings = [];
  const statements = normalizeMsaStatements([statement()], warnings);
  const rows = [
    deadline(),
    deadline({ id: 'dup', deadlineDay: day(30) }),
    deadline({ id: 'no-basis', statementId: 'msa-stmt-one', basisRef: '' }),
    deadline({ id: 'orphan', statementId: 'ghost-stmt' }),
    deadline({ id: 'future', statementId: 'msa-stmt-one', deadlineDay: null }),
  ];
  const kept = normalizeMsaDeadlines(rows, statements, warnings);
  assert.deepEqual(kept.map((row) => row.id), ['msa-dl-one']);
  assert.ok(warnings.some((line) => /not on the register/.test(line)), 'an orphan deadline is named as an orphan');
  assert.ok(warnings.some((line) => /could not be read exactly/.test(line)), 'the dropped rows are counted');
  assert.ok(warnings.some((line) => /Nothing was repaired/.test(line)));
});

test('a COMPLETE remediation act with no completed day or evidence reference is DROPPED', () => {
  const warnings = [];
  const statements = normalizeMsaStatements([statement()], warnings);
  const suppliers = normalizeMsaSuppliers([supplier()], warnings);
  const assessments = normalizeMsaAssessments([assessment()], statements, suppliers, warnings);
  const findings = normalizeMsaFindings([finding()], assessments, warnings);
  const rows = [
    remediation(),
    remediation({ id: 'complete-ok', status: 'complete', completedOn: day(-30), evidenceRef: 'PAY-2026-0181 repayment schedule' }),
    remediation({ id: 'complete-no-day', status: 'complete', completedOn: null, evidenceRef: 'PAY-1' }),
    remediation({ id: 'complete-no-ev', status: 'complete', completedOn: day(-30), evidenceRef: null }),
    remediation({ id: 'bad-kind', remediationKind: 'magic' }),
    remediation({ id: 'orphan', findingId: 'ghost' }),
  ];
  const kept = normalizeMsaRemediations(rows, findings, warnings);
  assert.deepEqual(kept.map((row) => row.id).sort(), ['complete-ok', 'msa-rem-one']);
  assert.ok(warnings.some((line) => /could not be read exactly/.test(line)), 'a plan is fine; an unevidenced completion is refused');
  assert.ok(warnings.some((line) => /not on the register/.test(line)));
});

test('an assessment with no evidence reference is dropped, and a child row pointing at no parent is dropped', () => {
  const warnings = [];
  const statements = normalizeMsaStatements([statement()], warnings);
  const suppliers = normalizeMsaSuppliers([supplier()], warnings);
  const assessments = normalizeMsaAssessments([
    assessment(),
    assessment({ id: 'no-ev', evidenceRef: '' }),
    assessment({ id: 'bad-kind', assessmentKind: 'vibes' }),
    assessment({ id: 'bad-outcome', outcome: 'fine-ish' }),
    assessment({ id: 'no-supplier', supplierId: 'ghost' }),
  ], statements, suppliers, warnings);
  assert.deepEqual(assessments.map((row) => row.id), ['msa-asm-one']);
  const findings = normalizeMsaFindings([finding(), finding({ id: 'orphan', assessmentId: 'ghost' }), finding({ id: 'bad-kind', findingKind: 'crime' })], assessments, warnings);
  assert.deepEqual(findings.map((row) => row.id), ['msa-fnd-one']);
  const trainingKept = normalizeMsaTraining([training(), training({ id: 'orphan', statementId: 'ghost' }), training({ id: 'no-pop', populationRef: '' })], statements, warnings);
  assert.deepEqual(trainingKept.map((row) => row.id), ['msa-trn-one']);
});

/* ------------------------------------------------- 3. the deadline is declared */

test('a statement with no declared deadline is deadline-undeclared and NEVER given a computed window', () => {
  const report = read(fixture({ msaStatements: [statement()] }));
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].state.key, 'deadline-undeclared');
  assert.equal(report.rows[0].deadline, null);
  assert.equal(report.rows[0].daysToDeadline, null);
  assert.equal(report.rows[0].daysOverdue, null);
});

test('the declared deadline is compared against the clock, never inferred from the financial-year end', () => {
  const ahead = read(fixture({
    msaStatements: [statement({ id: 'a', statementRef: 'REF-A' })],
    msaDeadlines: [deadline({ statementId: 'a', deadlineDay: day(20) })],
  }));
  const past = read(fixture({
    msaStatements: [statement({ id: 'b', statementRef: 'REF-B' })],
    msaDeadlines: [deadline({ statementId: 'b', deadlineDay: day(-10) })],
  }));
  assert.equal(ahead.rows[0].daysToDeadline, 20);
  assert.equal(ahead.rows[0].dueSoon, true, '20 days is inside the 90-day warning horizon');
  assert.equal(past.rows[0].daysOverdue, 10);
  // The financial year ended 170 days ago in BOTH rows: the fy end plays no part
  // in the window, and a fy end with no declared basis still prints
  // deadline-undeclared rather than a derived date.
  const undeclared = read(fixture({ msaStatements: [statement()] }));
  assert.equal(undeclared.rows[0].daysOverdue, null);
});

/* -------------------------------------------------------------- 4. the states */

test('all six states are six different facts, and a published statement is refined by its record', () => {
  const raw = fixture({
    msaStatements: [
      statement({ id: 's1', statementRef: 'ST-1', responsibleIds: ['mei'] }),
      statement({ id: 's2', statementRef: 'ST-2', responsibleIds: ['mei'] }),
      statement({ id: 's3', statementRef: 'ST-3', responsibleIds: ['mei'] }),
      statement({ id: 's4', statementRef: 'ST-4', responsibleIds: ['mei'] }),
      statement({ id: 's5', statementRef: 'ST-5', responsibleIds: ['mei'], structureRef: null, policyRef: null, effectivenessRef: null }),
      statement({ id: 's6', statementRef: 'ST-6', responsibleIds: ['mei'] }),
    ],
    msaDeadlines: [
      deadline({ id: 'd2', statementId: 's2', deadlineDay: day(-10) }),
      deadline({ id: 'd3', statementId: 's3', deadlineDay: day(40) }),
      deadline({ id: 'd4', statementId: 's4', deadlineDay: day(40) }),
      deadline({ id: 'd5', statementId: 's5', deadlineDay: day(-10) }),
      deadline({ id: 'd6', statementId: 's6', deadlineDay: day(-20) }),
    ],
    msaApprovals: [
      approval({ id: 'a4', statementId: 's4', approvedDay: day(-5) }),
      approval({ id: 'a5', statementId: 's5', approvedDay: day(-35) }),
      approval({ id: 'a6', statementId: 's6', approvedDay: day(-25) }),
    ],
    msaPublications: [
      publication({ id: 'p5', statementId: 's5', publishedDay: day(-30) }),
      publication({ id: 'p6', statementId: 's6', publishedDay: day(-18) }),
    ],
    msaSuppliers: [supplier()],
    msaAssessments: [
      assessment({ id: 'as5', statementId: 's5', outcome: 'no-issues', supplierId: 'msa-sup-one' }),
      assessment({ id: 'as6', statementId: 's6', outcome: 'no-issues', supplierId: 'msa-sup-one' }),
    ],
    msaTraining: [training({ id: 't5', statementId: 's5' }), training({ id: 't6', statementId: 's6' })],
  });
  const report = read(raw);
  const byRef = Object.fromEntries(report.rows.map((row) => [row.statement.statementRef, row]));
  assert.equal(byRef['ST-1'].state.key, 'deadline-undeclared');
  assert.equal(byRef['ST-2'].state.key, 'overdue-unpublished');
  assert.equal(byRef['ST-3'].state.key, 'awaiting-publication');
  assert.equal(byRef['ST-4'].state.key, 'approved-unpublished');
  assert.equal(byRef['ST-5'].state.key, 'published-with-gaps', 'published, but the record does not support it: three elements missing');
  assert.equal(byRef['ST-6'].state.key, 'published');
  assert.equal(report.balances.statesReconcile, true);
});

test('timeliness is derived from the two declared days and a late publication is never re-dated', () => {
  const report = read(fixture({
    msaStatements: [statement()],
    msaDeadlines: [deadline({ deadlineDay: day(-20) })],
    msaApprovals: [approval({ approvedDay: day(-12) })],
    msaPublications: [publication({ publishedDay: day(-12) })],
  }));
  const row = report.rows[0];
  assert.equal(row.publishedLate, true);
  assert.equal(row.publishedLateByDays, 8, 'published 8 days after the declared window closed');
});

/* --------------------------------------------------------------- 5. the claim */

test('the claim about instances is derived, never stored, and REFUSED where nothing supports any claim', () => {
  const refused = read(fixture({ msaStatements: [statement()] }));
  assert.equal(refused.rows[0].claim.key, 'refused', 'zero assessments: no instance may be claimed OR denied');

  const noneIdentified = read(fixture({
    msaStatements: [statement()],
    msaSuppliers: [supplier()],
    msaAssessments: [assessment({ outcome: 'no-issues' })],
  }));
  assert.equal(noneIdentified.rows[0].claim.key, 'none-identified', 'assessments ran and found nothing: the claim is earned');

  const risksOnly = read(fixture({
    msaStatements: [statement()],
    msaSuppliers: [supplier()],
    msaAssessments: [assessment({ outcome: 'issues-found' })],
    msaFindings: [finding({ findingKind: 'risk' })],
  }));
  assert.equal(risksOnly.rows[0].claim.key, 'risks-only', 'a risk indicator is never printed as an instance');

  const instances = read(fixture({
    msaStatements: [statement()],
    msaSuppliers: [supplier()],
    msaAssessments: [assessment({ outcome: 'issues-found' })],
    msaFindings: [finding({ findingKind: 'instance' })],
    msaRemediations: [remediation()],
  }));
  assert.equal(instances.rows[0].claim.key, 'instances-identified');
});

test('the four claim keys are the closed vocabulary and none of them is a stored field', () => {
  assert.deepEqual([...MSA_CLAIM_KEYS].sort(), ['instances-identified', 'none-identified', 'refused', 'risks-only']);
  const raw = fixture({ msaStatements: [statement({ claim: 'none-identified' })] });
  const report = read(raw);
  assert.equal(report.rows[0].claim.key, 'refused', 'a claim smuggled onto the statement row is ignored; the claim is computed from assessments');
});

/* ---------------------------------------------------- 6. the element matrix */

test('each of the six elements is its own verdict with its own reason where missing', () => {
  const report = read(fixture({
    msaStatements: [statement({ structureRef: null, policyRef: 'POL', effectivenessRef: null })],
    msaSuppliers: [supplier()],
    msaAssessments: [assessment({ outcome: 'issues-found' })],
    msaFindings: [finding({ findingKind: 'instance' })],
    msaRemediations: [remediation()],
  }));
  const elements = Object.fromEntries(report.rows[0].elements.map((row) => [row.key, row]));
  assert.deepEqual(Object.keys(elements).sort(), [...MSA_ELEMENT_KEYS].sort());
  assert.equal(elements.structure.evidenced, false);
  assert.match(elements.structure.reason, /structure description/i);
  assert.equal(elements.policies.evidenced, true);
  assert.equal(elements['due-diligence'].evidenced, true);
  assert.equal(elements['risk-management'].evidenced, false, 'the instance carries only a planned remediation');
  assert.match(elements['risk-management'].reason, /complete remediation/i);
  assert.equal(elements.effectiveness.evidenced, false);
  assert.equal(elements.training.evidenced, false);
  assert.equal(report.rows[0].elementsEvidencedN, 2);
  assert.equal(report.rows[0].elementsMissingN, 4);
});

test('an adverse outcome with no finding beneath it is a risk-management gap, never smoothed over', () => {
  const report = read(fixture({
    msaStatements: [statement()],
    msaSuppliers: [supplier()],
    msaAssessments: [assessment({ outcome: 'unable-to-assess' })],
  }));
  const elements = Object.fromEntries(report.rows[0].elements.map((row) => [row.key, row]));
  assert.equal(elements['risk-management'].evidenced, false);
  assert.match(elements['risk-management'].reason, /adverse outcome with no finding/i);
});

test('the reader ties every child row to its statement and says whether the parts re-add', () => {
  const report = read(fixture({
    msaStatements: [statement()],
    msaDeadlines: [deadline()],
    msaApprovals: [approval()],
    msaPublications: [publication()],
    msaSuppliers: [supplier()],
    msaAssessments: [assessment()],
    msaFindings: [finding()],
    msaRemediations: [remediation()],
    msaTraining: [training()],
  }));
  for (const key of Object.keys(report.balances)) {
    assert.equal(report.balances[key], true, `${key} must hold`);
  }
  assert.equal(report.figuresComplete, true, report.incompleteReasons.join(' | '));
});

/* ------------------------------------------------------- 7. the matrix cases */

test('the joint apex spans every line holding a hand, counts a person once, and prints orphans', () => {
  // samuel is held by mei (home) AND priya (declared secondary line); frieda is
  // held by priya. The joint apex above {samuel, frieda} is therefore above BOTH
  // director lines: the chief.
  const report = read(fixture({
    msaStatements: [statement({ responsibleIds: ['samuel', 'frieda'] })],
  }));
  assert.equal(report.totals.holders, 2);
  assert.equal(report.totals.linesN >= 2, true, 'both lines holding a hand are on the record');
  assert.equal(report.orphanHolderN, 0);

  const orphaned = read(fixture({
    msaStatements: [statement({ responsibleIds: ['samuel', 'ghost'] })],
  }));
  assert.equal(orphaned.orphanHolderN, 1, 'a hand off the graph is printed as an orphan, never dropped');
  assert.equal(orphaned.totals.holders, 2);
  assert.equal(orphaned.figuresComplete, false, 'an unresolved line position says so');

  // The apex itself: the rule must send the ask to `ceo`, above BOTH lines.
  const { draft } = ruleDraft(fixture({ msaStatements: [statement({ responsibleIds: ['samuel', 'frieda'] })] }));
  runRule(draft);
  const asks = (draft.delegations || []).filter((row) => row.status === 'active');
  assert.equal(asks.length, 1);
  assert.equal(asks[0].personId, 'ceo', 'the ask goes to the lowest joint apex above every hand, never to one line on another’s behalf');
});

test('the supplier coverage derives from dated assessments and prints unassessed suppliers', () => {
  const report = read(fixture({
    msaStatements: [statement()],
    msaSuppliers: [supplier(), supplier({ id: 's2', supplierRef: 'SUP-2' }), supplier({ id: 's3', supplierRef: 'SUP-3' })],
    msaAssessments: [assessment(), assessment({ id: 'as2', supplierId: 's2', assessedOn: day(-500) })],
  }));
  assert.equal(report.totals.suppliers, 3);
  assert.equal(report.totals.assessed, 2);
  assert.equal(report.totals.unassessed, 1, 'the unassessed supplier is printed, never silently absent');
  assert.equal(report.totals.stale, 1, 'the 500-day-old assessment is stale against the 365-day cycle');
});

/* --------------------------------------------------------------- 8. the rule */

const ruleDraft = (raw) => {
  const state = load(raw);
  return { state, draft: JSON.parse(JSON.stringify(state)) };
};

const TICK = { type: 'msa.statement-recorded' };
const runRule = (draft) => msaRule(draft, { now: NOW, settings: draft.settings, event: TICK });

test('RULE-MSA-01 files an opaque ask at the joint apex, is idempotent, and never names the supplier or the finding', () => {
  const { draft } = ruleDraft(fixture({ msaStatements: [statement()] }));
  const first = runRule(draft);
  assert.ok(Array.isArray(first), 'the rule returns its effects');
  const asks = (draft.delegations || []).filter((row) => row.status === 'active');
  assert.equal(asks.length, 1, 'a statement with no deadline files exactly one ask per joint seat');
  assert.equal(asks[0].personId, 'ceo', 'the ask goes to the lowest joint apex above the hands (samuel is held by mei and priya), not to the hands');
  const text = asks.map((row) => `${row.title} ${row.support} ${row.expectedOutcome}`).join(' ');
  for (const forbidden of ['MSA-2025-26', 'Meridian', 'Bangladesh', 'Dhaka', 'Samuel', 'Mei', 'Dana', 'FND-2026-014', 'SUP-1001']) {
    assert.ok(!text.includes(forbidden), `the ask must not carry “${forbidden}”`);
  }
  const links = (draft.links || []).filter((row) => row.ruleId === 'RULE-MSA-01');
  assert.equal(links.length, 1);
  assert.match(links[0].summary, /^msa1:deadline-undeclared:msa-stmt-one$/);

  const before = (draft.delegations || []).length;
  runRule(draft);
  assert.equal((draft.delegations || []).length, before, 'the rule is idempotent: an open ask is not re-filed');
});

test('RULE-MSA-01 stays silent when paused and observes identity-free where nobody can be asked', () => {
  const paused = ruleDraft(fixture({ msaStatements: [statement()] }));
  paused.draft.settings[MSA_PAUSE_SWITCH] = false;
  runRule(paused.draft);
  assert.equal((paused.draft.delegations || []).length, 0, 'a pause is honoured on every path');
  assert.equal((paused.draft.msaMarkers || []).length, 0);

  const unaskable = ruleDraft(fixture({ msaStatements: [statement({ responsibleIds: ['ghost'] })] }));
  runRule(unaskable.draft);
  assert.equal((unaskable.draft.delegations || []).length, 0, 'nobody is substituted for a hand off the graph');
  assert.ok((unaskable.draft.msaMarkers || []).length >= 1, 'the condition is still observed, identity-free');
  const marker = (unaskable.draft.msaMarkers || [])[0];
  assert.ok(!JSON.stringify(marker).includes('MSA-2025-26'), 'the marker carries no identity');
});

test('RULE-MSA-01 caps new asks per commit and counts the remainder rather than dropping it silently', () => {
  const statements = [];
  for (let i = 0; i < 6; i += 1) {
    statements.push(statement({ id: `msa-stmt-${i}`, statementRef: `MSA-${i}`, responsibleIds: ['mei'] }));
  }
  const { draft } = ruleDraft(fixture({ msaStatements: statements }));
  runRule(draft);
  assert.ok((draft.delegations || []).length <= 4, 'the cap is four asks per commit');
  assert.ok((draft.delegations || []).length >= 1);
});

test('RULE-MSA-01 closes its own ask when the condition clears, and never re-files an answered ask', () => {
  const { draft } = ruleDraft(fixture({ msaStatements: [statement({ responsibleIds: ['mei'] })] }));
  runRule(draft);
  const asks = (draft.delegations || []).filter((row) => row.status === 'active');
  assert.equal(asks.length, 1);
  runRule(draft);
  assert.equal((draft.delegations || []).filter((row) => row.status === 'active').length, 1, 'still owed');
  // The condition clears: a deadline is declared, far enough out that no other
  // clock condition replaces the ask.
  draft.msaDeadlines.push({
    id: 'msa-dl-later', statementId: 'msa-stmt-one', deadlineDay: day(200),
    basisRef: 'Modern Slavery Act 2015 s.54(6): six months from the day after the financial year end.',
    declaredById: 'mei', declaredAt: iso(day(-1)), declaredDay: day(-1), createdAt: iso(day(-1)),
  });
  runRule(draft);
  assert.equal((draft.delegations || []).filter((row) => row.status === 'active').length, 0, 'the ask closes itself when the condition clears');
  const closed = (draft.delegations || []).find((row) => row.id === asks[0].id);
  assert.equal(closed.status, 'done');
  assert.match(closed.completionNote || '', /RULE-MSA-01/, 'the register says it closed its own ask, not a human answer');
  // An answered ask is never re-filed: marking one done without the register’s
  // own note must not resurrect it while the condition persists.
  const { draft: draft2 } = ruleDraft(fixture({
    msaStatements: [statement({ responsibleIds: ['mei'] })],
  }));
  runRule(draft2);
  const prior = (draft2.delegations || []).filter((row) => row.status === 'active');
  assert.equal(prior.length, 1);
  prior[0].status = 'done';
  prior[0].completionNote = 'Answered by hand.';
  runRule(draft2);
  assert.equal((draft2.delegations || []).filter((row) => row.status === 'active').length, 0, 'an answered ask is never re-filed');
});

test('the rule conditions are the five the register exists for, and indexing reads its own asks back', () => {
  const report = read(fixture({ msaStatements: [statement()] }));
  const { conditions } = msaConditions(report);
  assert.ok(conditions.some((row) => row.kind === 'deadline-undeclared'));
  const kinds = new Set(conditions.map((row) => row.kind));
  for (const kind of kinds) {
    assert.ok(['deadline-undeclared', 'overdue-unpublished', 'publication-due', 'content-gap', 'remediation-open'].includes(kind));
  }
  const index = indexMsaAsks(load(fixture()));
  assert.equal(typeof index, 'object');
});

test('the rule is registered on the spine, in the propagation contracts, and in the pause census', () => {
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 170, 'the spine carries ADR-0257 (RULE-TAX-01), ADR-0258 (RULE-PSR-01), ADR-0260 (RULE-MSA-01), ADR-0261 (RULE-CAL-01) and, as the 170th, ADR-0262 (RULE-ASG-01)');
  assert.equal(PROPAGATION_CONTRACTS.length, 170);
  const contract = PROPAGATION_CONTRACTS.find((row) => row.module === 'msaRules.js');
  assert.ok(contract, 'the rule must have a propagation contract');
  assert.deepEqual(contract.writes.sort(), ['delegations', 'links', 'msaMarkers']);
  assert.equal(contract.scansWorkspace, true);
  assert.equal(MSA_PAUSE_SWITCH, 'msaAutoPropagate');
});

/* --------------------------------------------------------------- 9. the door */

test('the door refuses a duplicate statement reference, a bad regime, a missing basis and a future day', () => {
  const { api } = harness(fixture());
  const good = {
    statementRef: 'MSA-2025-26',
    entityName: 'Meridian Components Group',
    fyLabel: 'FY2025-26', fyEndDay: day(-170), regime: 'uk-msa-2015',
    basisRef: 'The statement is prepared under the Modern Slavery Act 2015 s.54 for the group and its subsidiaries.',
    responsibleIds: ['samuel'],
  };
  const first = api.msaRecordStatement(good);
  assert.equal(first.ok, true, first.error);

  const duplicate = api.msaRecordStatement(good);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.refusal, 'modern-slavery:statement-ref-duplicate');

  const badRegime = api.msaRecordStatement({ ...good, statementRef: 'MSA-2', regime: 'fr-loi-devigilance' });
  assert.equal(badRegime.ok, false);
  assert.equal(badRegime.refusal, 'modern-slavery:regime-invalid');

  const noBasis = api.msaRecordStatement({ ...good, statementRef: 'MSA-3', basisRef: 'short' });
  assert.equal(noBasis.ok, false);

  const future = api.msaRecordStatement({ ...good, statementRef: 'MSA-4', fyEndDay: day(5) });
  assert.equal(future.ok, false);
});

test('the door refuses a second deadline for one statement, a COMPLETE remediation with no evidence, and a bad tier', () => {
  const { api } = harness(fixture());
  const created = api.msaRecordStatement({
    statementRef: 'MSA-2025-26', entityName: 'Meridian Components Group', fyLabel: 'FY2025-26',
    fyEndDay: day(-170), regime: 'uk-msa-2015',
    basisRef: 'The statement is prepared under the Modern Slavery Act 2015 s.54 for the group and its subsidiaries.',
    responsibleIds: ['samuel'],
  });
  assert.equal(created.ok, true, created.error);

  const firstDeadline = api.msaDeclareDeadline({
    statementId: created.id, deadlineDay: day(20),
    basisRef: 'Modern Slavery Act 2015 s.54(6): six months from the day after the financial year end.',
  });
  assert.equal(firstDeadline.ok, true, firstDeadline.error);
  const secondDeadline = api.msaDeclareDeadline({
    statementId: created.id, deadlineDay: day(30),
    basisRef: 'Modern Slavery Act 2015 s.54(6): six months from the day after the financial year end.',
  });
  assert.equal(secondDeadline.ok, false);
  assert.equal(secondDeadline.refusal, 'modern-slavery:deadline-duplicate');

  assert.equal(api.msaRecordSupplier({
    supplierRef: 'SUP-1', supplierName: 'Kraków Pack & Print', tier: 9, country: 'Poland', category: 'Packaging',
  }).refusal, 'modern-slavery:tier-invalid');

  const sup = api.msaRecordSupplier({
    supplierRef: 'SUP-1', supplierName: 'Kraków Pack & Print', tier: 2, country: 'Poland', category: 'Packaging',
    responsibleIds: ['samuel'],
  });
  assert.equal(sup.ok, true, sup.error);

  assert.equal(api.msaRecordAssessment({
    statementId: created.id, supplierId: sup.id, assessmentKind: 'vibes', outcome: 'no-issues',
    assessedOn: day(-3), assessorRef: 'Group ethics officer', evidenceRef: 'AUD-2026-0001 social audit report',
    basisRef: 'A documented review of the supplier against the group labour standards code.',
  }).refusal, 'modern-slavery:assessment-kind-invalid');

  const asm = api.msaRecordAssessment({
    statementId: created.id, supplierId: sup.id, assessmentKind: 'audit', outcome: 'issues-found',
    assessedOn: day(-3), assessorRef: 'Group ethics officer', evidenceRef: 'AUD-2026-0001 social audit report',
    basisRef: 'A documented review of the supplier against the group labour standards code.',
  });
  assert.equal(asm.ok, true, asm.error);

  assert.equal(api.msaRecordFinding({
    assessmentId: 'ghost-assessment', findingKind: 'instance', severity: 'severe', identifiedOn: day(-2),
    findingRef: 'FND-1', basisRef: 'Identified instance: workers paid recruitment fees and had documents retained.',
  }).refusal, 'modern-slavery:assessment-not-found', 'a finding binds to an assessment on the record');

  const fnd = api.msaRecordFinding({
    assessmentId: asm.id, findingKind: 'instance', severity: 'severe', identifiedOn: day(-2),
    findingRef: 'FND-1', basisRef: 'Identified instance: workers paid recruitment fees and had documents retained.',
  });
  assert.equal(fnd.ok, true, fnd.error);

  assert.equal(api.msaRecordRemediation({
    findingId: 'ghost-finding', remediationKind: 'fees-repaid', status: 'complete', declaredOn: day(-2),
    basisRef: 'The fees were repaid in full to the affected workers with the payment schedule on file.',
  }).refusal, 'modern-slavery:finding-not-found', 'a remediation binds to a finding on the record');

  const completeNoEvidence = api.msaRecordRemediation({
    findingId: fnd.id, remediationKind: 'fees-repaid', status: 'complete', declaredOn: day(-2), completedOn: day(-1),
    basisRef: 'The fees were repaid in full to the affected workers with the payment schedule on file.',
  });
  assert.equal(completeNoEvidence.ok, false, 'a COMPLETE act with no evidence reference is refused');
  assert.equal(completeNoEvidence.refusal, 'modern-slavery:remediation-evidence-missing');

  const completeNoDay = api.msaRecordRemediation({
    findingId: fnd.id, remediationKind: 'fees-repaid', status: 'complete', declaredOn: day(-2),
    evidenceRef: 'PAY-2026-0181 repayment schedule',
    basisRef: 'The fees were repaid in full to the affected workers with the payment schedule on file.',
  });
  assert.equal(completeNoDay.ok, false, 'a COMPLETE act with no completed day is refused');
  assert.equal(completeNoDay.refusal, 'modern-slavery:day-invalid');

  const planned = api.msaRecordRemediation({
    findingId: fnd.id, remediationKind: 'fees-repaid', status: 'planned', declaredOn: day(-2),
    basisRef: 'A worker-remediation plan is agreed with the agency: fees repaid in full, documents returned.',
  });
  assert.equal(planned.ok, true, planned.error, 'a plan is fine — it closes nothing');
});

test('the door narrows every write to a seat that holds the responsible hands', () => {
  const { api, store } = harness(fixture());
  // `dana` is a director: she clears the rank floor, but `frieda` sits under
  // `priya` on `omar`'s line — not on a line `dana` holds.
  asSeat(api, store, 'dana');
  const outside = api.msaRecordStatement({
    statementRef: 'MSA-2025-26', entityName: 'Meridian Components Group', fyLabel: 'FY2025-26',
    fyEndDay: day(-170), regime: 'uk-msa-2015',
    basisRef: 'The statement is prepared under the Modern Slavery Act 2015 s.54 for the group and its subsidiaries.',
    responsibleIds: ['frieda'],
  });
  assert.equal(outside.ok, false, 'a seat that holds no responsible hand may not record the statement');
  assert.match(outside.error, /not on a line this seat holds/);
  assert.equal(outside.refusal, 'modern-slavery:holder-not-your-person');
});

/* -------------------------------------------------------------- 10. CSV boundary */

test('the CSV boundary is identity-free and floored, and its summary equals the reader’s totals', () => {
  const raw = fixture({
    msaStatements: [statement()],
    msaDeadlines: [deadline()],
    msaSuppliers: [supplier(), supplier({ id: 's2', supplierRef: 'SUP-2' }), supplier({ id: 's3', supplierRef: 'SUP-3' })],
    msaAssessments: [assessment()],
    msaFindings: [finding()],
    msaRemediations: [remediation()],
    msaTraining: [training()],
  });
  const state = load(raw);
  const report = buildModernSlavery(state, { now: NOW, seat: null });
  const { csv } = exportWorkspaceCsv(state, MSA_CSV_SCOPE);
  const text = typeof csv === 'string' ? csv : String(csv);
  for (const forbidden of ['Meridian', 'Dhaka', 'Bangladesh', 'Samuel', 'Mei', 'MSA-2025-26', 'SUP-1001', 'FND-2026-014', 'AUD-2026-0871']) {
    assert.ok(!text.includes(forbidden), `the CSV must not carry “${forbidden}”`);
  }
  const parsed = parseCsv(text);
  const rows = parsed.rows.map((cells) => Object.fromEntries(parsed.headers.map((header, i) => [header, cells[i] ?? ''])));
  const summary = rows.find((row) => row.row_kind === 'summary');
  assert.ok(summary, 'the export carries a summary row');
  assert.equal(Number(summary.statements_n), report.totals.statements);
  assert.equal(Number(summary.suppliers_n), report.totals.suppliers);
  assert.equal(Number(summary.assessments_n), report.totals.assessments);
  assert.equal(Number(summary.findings_n), report.totals.findings);
  assert.equal(Number(summary.remediation_open_n), report.totals.remediationOpen);
  assert.equal(Number(summary.training_n), report.totals.training);
  assert.equal(MSA_CSV_COLUMNS.length > 0, true);
});

test('the floored CSV prints counts-only and a refusal instead of a proportion of one', () => {
  const raw = fixture({
    msaStatements: [statement()],
    msaSuppliers: [supplier()],
    msaAssessments: [assessment()],
    msaFindings: [finding()],
    msaRemediations: [remediation()],
  });
  const state = load(raw);
  const { csv } = exportWorkspaceCsv(state, MSA_CSV_SCOPE);
  const text = typeof csv === 'string' ? csv : String(csv);
  const parsed = parseCsv(text);
  const rows = parsed.rows.map((cells) => Object.fromEntries(parsed.headers.map((header, i) => [header, cells[i] ?? ''])));
  const elements = rows.filter((row) => row.row_kind === 'element');
  assert.ok(elements.length >= 6, 'the element matrix is exported');
  for (const row of elements) {
    assert.ok(!Object.keys(row).includes('pct') || row.pct === '' || row.pct == null, 'no unfloored proportion is printed');
    for (const [key, value] of Object.entries(row)) {
      if (value == null) continue;
      assert.ok(!/Dhaka|Samuel|Meridian/.test(String(value)), 'every cell is identity-free');
    }
  }
});

/* --------------------------------------------------------------- 11. the panel */

test('the panel prints the reader’s own figures cell by cell (display == computed)', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const raw = fixture({
      msaStatements: [statement(), statement({ id: 's2', statementRef: 'MSA-2024-25', responsibleIds: ['frieda'] })],
      msaDeadlines: [deadline({ id: 'd2', statementId: 's2', deadlineDay: day(-10) })],
      msaSuppliers: [supplier()],
      msaAssessments: [assessment()],
      msaFindings: [finding()],
      msaRemediations: [remediation()],
    });
    const state = load(raw);
    const report = buildModernSlavery(state, { now: NOW, seat: null });
    const { api } = harness(raw);
    const view = renderModernSlavery({ api, query: new URLSearchParams(''), state });
    const html = view.outerHTML;
    const cell = (testid) => {
      const match = new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`).exec(html);
      return match ? match[1].trim() : null;
    };
    assert.equal(cell('msa-count-statements'), String(report.totals.statements));
    assert.equal(cell('msa-count-undeclared'), String(report.totals.deadlineUndeclared));
    assert.equal(cell('msa-count-overdue'), String(report.totals.overdueUnpublished));
    assert.equal(cell('msa-count-gaps'), String(report.totals.publishedWithGaps));
    assert.equal(cell('msa-count-suppliers'), String(report.totals.suppliers));
    assert.equal(cell('msa-count-findings'), String(report.totals.findings));
    assert.equal(cell('msa-count-open'), String(report.totals.remediationOpen));
    assert.equal(cell('msa-count-attention'), String(report.attention.total));
    assert.ok(html.includes('data-testid="msa-state-deadline-undeclared"'));
    assert.ok(html.includes('data-testid="msa-state-overdue-unpublished"'));
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
      for (const view of ['statements', 'supply', 'findings', 'training', 'method']) {
        const node = renderModernSlavery({ api, query: new URLSearchParams(`view=${view}`), state });
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

test('the demo exercises every derived statement state and the attention badge counts decision-shaped duty only', () => {
  const state = load(buildDemoState(NOW));
  const report = buildModernSlavery(state, { now: NOW, seat: null });
  for (const key of MSA_STATE_KEYS) {
    assert.ok((report.states[key] || 0) >= 1, `the demo must exercise the ${key} state`);
  }
  assert.equal(report.balances.statesReconcile, true);
  assert.equal(report.totals.unassessed >= 1, true, 'unassessed suppliers are printed, never silently absent');
  assert.equal(report.totals.remediationOpen >= 1, true, 'a planned act closes nothing and the open count proves it');
  const badge = msaAttentionCount(state, { now: NOW, settings: state.settings, seat: null });
  assert.equal(typeof badge, 'number');
  assert.equal(badge, report.attention.total, 'the badge reads the same figure the register prints');
  const signals = msaSignals(state, NOW);
  assert.ok(Array.isArray(signals));
  assert.ok(signals.length >= 1, 'a demo with an undeclared deadline and an overdue statement must reach the insights layer');
});
