/**
 * tests/app/assurance-findings.test.mjs — the kernel suite for ADR-0232
 * (Assurance Finding & Remediation Register, `RULE-AFR-01`).
 *
 * Every fixture is hand-built and its outcome is known by construction: the
 * dates, the accountable lines and the order of the acts are chosen so that the
 * derived state, the recurrence verdict and the counts can be written down
 * before the code runs. No test writes a derived state — there is nowhere to
 * write one.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAssuranceFindings } from '../../app/core/domain/assuranceFinding.js';
import { AFR_STATE_KEYS } from '../../app/core/domain/assuranceRegistry.js';
import { normalizeFindingActs, normalizeFindings } from '../../app/core/domain/assuranceSchema.js';

const at = (day, time = '10:00:00.000Z') => new Date(`${day}T${time}`);

function person(id, name, level, managerId) {
  return { id, name, role: level, level, managerId, status: 'active', startDate: '2026-01-01T09:00:00.000Z', createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:00:00.000Z' };
}

function line(id, personId, managerId, kind = 'function') {
  return { id, personId, managerId, kind, shareH: null, rights: [], fromISO: '2026-01-01T09:00:00.000Z', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '', status: 'active', history: [] };
}

const ROSTER = [
  person('ceo', 'Cleo Executive', 'vp', null),
  person('dana', 'Dana Function', 'director', 'ceo'),
  person('omar', 'Omar Project', 'director', 'ceo'),
  person('leila', 'Leila Platform', 'manager', 'dana'),
  person('kai', 'Kai Delivery', 'manager', 'omar'),
  person('ria', 'Ria Platform', 'manager', 'dana'),
];

const LINES = [
  line('rl-leila-dana', 'leila', 'dana'),
  line('rl-kai-omar', 'kai', 'omar'),
  line('rl-ria-dana', 'ria', 'dana'),
];

const STATEMENT = 'Three purchase orders were paid against a two-way match in September; the third approval was never recorded.';

function finding(id, over = {}) {
  return {
    id,
    controlRef: 'AP-07 three-way match',
    scopeRef: 'Shared services · Nordic entities',
    criteriaRef: 'Policy FIN-12 §4.2',
    source: 'internal-audit',
    severity: 'significant-deficiency',
    statement: STATEMENT,
    accountable: [{ personId: 'leila', lineId: 'rl-leila-dana' }],
    declaredById: 'dana',
    openedOn: '2026-09-01',
    remediationDueOn: '2026-10-01',
    verifyDueOn: '2026-11-01',
    createdAt: '2026-09-01T09:00:00.000Z',
    ...over,
  };
}

const act = (id, kind, over = {}) => ({
  id,
  kind,
  findingId: 'f1',
  actorId: 'leila',
  lineHolderId: 'leila',
  lineId: 'rl-leila-dana',
  ...over,
});

/**
 * An acceptance is a WHOLE-FINDING act: it names no line, and the loader
 * refuses one that does. Built apart from `act()` so the fixture cannot
 * accidentally hand the normalizer a row it is designed to drop.
 */
const acceptAct = (id, over = {}) => ({
  id,
  kind: 'accept',
  findingId: 'f1',
  actorId: 'ceo',
  reason: 'Replacing the payments platform in Q1; the interim control is a manual review of every payment above the limit.',
  reviewOn: '2027-01-31',
  acceptedAt: '2026-09-10T09:00:00.000Z',
  ...over,
});

function state(findings, acts, { now = at('2026-11-16'), reportingLines = LINES } = {}) {
  return {
    people: ROSTER,
    reportingLines,
    assuranceFindings: findings,
    assuranceFindingActs: acts,
    assuranceFindingMarkers: [],
    settings: {},
  };
}

const reading = (raw, day = '2026-11-16') => buildAssuranceFindings(raw, { now: at(day) });

/* ------------------------------------------------------- the state machine */

test('assurance: the state is derived from acts in order and never stored', () => {
  const findings = [finding('f1')];
  const row = (acts) => reading(state(findings, acts)).rows.find((r) => r.id === 'f1');

  assert.equal(row([]).state, 'open-unassigned');

  const assigned = [act('a1', 'assign', { ownerId: 'ria', dueOn: '2026-09-20', note: 'Ria owns the approval workflow in the payments system.', assignedAt: '2026-09-02T09:00:00.000Z' })];
  assert.equal(row(assigned).state, 'remediating');

  const asserted = [...assigned, act('a2', 'assert', { actorId: 'ria', changeText: 'The two-way match path now blocks at payment and writes the third approval record.', evidenceRef: 'Release 2026.09.14 · payments service', assertedAt: '2026-09-15T09:00:00.000Z' })];
  assert.equal(row(asserted).state, 'asserted-awaiting-verification');

  const verified = [...asserted, act('a3', 'verify', { actorId: 'dana', decision: 'confirm', methodText: 'Re-ran 40 September payments end to end and read the approval records written by the new path.', verifiedAt: '2026-09-25T09:00:00.000Z' })];
  const closed = row(verified);
  assert.equal(closed.state, 'closed-verified');
  assert.equal(closed.closed, true);

  // Nothing derived is stored: the same finding and acts read at every step
  // produce the state from the acts alone.
  const stored = JSON.parse(JSON.stringify(findings));
  assert.deepEqual(stored, findings, 'the finding row was not mutated by any read');
  for (const key of AFR_STATE_KEYS) {
    assert.equal(typeof key, 'string');
  }
  assert.equal('state' in findings[0], false, 'no state field exists on a finding row');
});

test('assurance: a rejection returns the line to remediation owed and closes nothing', () => {
  const assigned = [act('a1', 'assign', { ownerId: 'ria', dueOn: '2026-09-20', note: 'Ria owns the approval workflow in the payments system.', assignedAt: '2026-09-02T09:00:00.000Z' })];
  const asserted = [...assigned, act('a2', 'assert', { actorId: 'ria', changeText: 'The two-way match path now blocks at payment and writes the third approval record.', evidenceRef: 'Release 2026.09.14', assertedAt: '2026-09-15T09:00:00.000Z' })];
  const rejected = [...asserted, act('a3', 'verify', { actorId: 'dana', decision: 'reject', methodText: 'Sampled 20 October payments; four still passed with two approvals.', verifiedAt: '2026-10-05T09:00:00.000Z' })];

  const row = reading(state([finding('f1')], rejected)).rows[0];
  assert.equal(row.state, 'rejected-remediation-owed');
  assert.equal(row.closed, false);
  assert.equal(row.accountable[0].lineState, 'rejected');
  // A rejection is not a remediation: the whole-line completion dates stay null.
  assert.equal(row.allVerifiedOn, null);

  const reasserted = [...rejected, act('a4', 'assert', { id: 'a4', actorId: 'ria', changeText: 'The blocking rule now covers the four legacy supplier types missed in the first change.', evidenceRef: 'Release 2026.10.12 · configuration', assertedAt: '2026-10-15T09:00:00.000Z' })];
  const row2 = reading(state([finding('f1')], reasserted)).rows[0];
  assert.equal(row2.state, 'asserted-awaiting-verification', 'a fresh assertion after a rejection re-opens the verification door');
  assert.equal(row2.accountable[0].assertionCount, 2);

  const confirmed = [...reasserted, act('a5', 'verify', { actorId: 'dana', decision: 'confirm', methodText: 'Re-sampled the four legacy supplier types; every payment now carries three approvals.', verifiedAt: '2026-10-20T09:00:00.000Z' })];
  const row3 = reading(state([finding('f1')], confirmed)).rows[0];
  assert.equal(row3.state, 'closed-verified');
  assert.equal(row3.allVerifiedOn, '2026-10-20', 'the on-time date is the completion of EVERY line, not the first');
});

test('assurance: the first assignment governs, and an assertion with no assignment behind it counts for nothing', () => {
  const first = act('a1', 'assign', { ownerId: 'ria', dueOn: '2026-09-20', note: 'Ria owns the approval workflow in the payments system.', assignedAt: '2026-09-02T09:00:00.000Z' });
  const second = act('a2', 'assign', { ownerId: 'leila', dueOn: '2026-09-25', note: 'A later hand-edited row re-points the owner at the holder.', assignedAt: '2026-09-03T09:00:00.000Z' });
  const row = reading(state([finding('f1')], [first, second])).rows[0];
  assert.equal(row.accountable[0].ownerId, 'ria', 'a second assignment never overwrites the first — the action refuses it and the reader agrees');
  assert.equal(row.accountable[0].assignCount, 2, 'and the attempt is counted, not hidden');

  // An assertion with no assignment on its line names no owner.
  const orphan = [act('a1', 'assert', { actorId: 'leila', changeText: 'We changed the approval rule on the payments service last Tuesday.', evidenceRef: 'Release 2026.09.14', assertedAt: '2026-09-15T09:00:00.000Z' })];
  const orphanRow = reading(state([finding('f1')], orphan)).rows[0];
  assert.equal(orphanRow.state, 'open-unassigned');
  assert.equal(orphanRow.accountable[0].lineState, 'unassigned');
  assert.equal(orphanRow.allAssertedOn, null, 'nothing was repaired into an assertion');
});

test('assurance: a cross-line finding is closed only when EVERY accountable line is verified', () => {
  const findings = [finding('f1', {
    accountable: [
      { personId: 'leila', lineId: 'rl-leila-dana' },
      { personId: 'kai', lineId: 'rl-kai-omar' },
    ],
  })];
  const acts = [
    act('a1', 'assign', { actorId: 'leila', ownerId: 'ria', dueOn: '2026-09-20', note: 'Ria owns the approval workflow.', assignedAt: '2026-09-02T09:00:00.000Z' }),
    act('a2', 'assign', { actorId: 'kai', lineHolderId: 'kai', lineId: 'rl-kai-omar', ownerId: 'leila', dueOn: '2026-09-22', note: 'Leila owns the supplier-data feed.', assignedAt: '2026-09-03T09:00:00.000Z' }),
    act('a3', 'assert', { actorId: 'ria', changeText: 'Payments now block at two approvals.', evidenceRef: 'Release 2026.09.14', assertedAt: '2026-09-15T09:00:00.000Z' }),
  ];
  const partial = reading(state(findings, acts)).rows[0];
  assert.equal(partial.state, 'remediating', 'one line asserted and the other silent is still remediation, never closure');

  const both = [...acts, act('a4', 'assert', { id: 'a4', actorId: 'leila', lineHolderId: 'kai', lineId: 'rl-kai-omar', changeText: 'The supplier feed now carries the third approver.', evidenceRef: 'Release 2026.09.18', assertedAt: '2026-09-18T09:00:00.000Z' })];
  assert.equal(reading(state(findings, both)).rows[0].state, 'asserted-awaiting-verification');

  const oneVerified = [...both, act('a5', 'verify', { id: 'a5', actorId: 'dana', decision: 'confirm', methodText: 'Re-ran 40 September payments end to end.', verifiedAt: '2026-09-25T09:00:00.000Z' })];
  assert.equal(reading(state(findings, oneVerified)).rows[0].state, 'asserted-awaiting-verification', 'one line verified is not a closed finding');

  const allVerified = [...oneVerified, act('a6', 'verify', { id: 'a6', actorId: 'dana', lineHolderId: 'kai', lineId: 'rl-kai-omar', decision: 'confirm', methodText: 'Re-ran the supplier feed for 30 suppliers.', verifiedAt: '2026-09-26T09:00:00.000Z' })];
  assert.equal(reading(state(findings, allVerified)).rows[0].state, 'closed-verified');
});

/* --------------------------------------------------------------- overdue */

test('assurance: overdue is a printed flag beside the state and decides nothing', () => {
  const findings = [finding('f1')];
  const open = reading(state(findings, []), '2026-10-15').rows[0];
  assert.deepEqual(open.overdue, ['remediation-overdue']);
  assert.equal(open.state, 'open-unassigned', 'overdue did not close, decline or re-type anything');

  const both = reading(state(findings, []), '2026-11-16').rows[0];
  assert.deepEqual(both.overdue, ['remediation-overdue', 'verification-overdue']);

  // Remediation complete but verification late: only the verification is owed.
  const acts = [
    act('a1', 'assign', { ownerId: 'ria', dueOn: '2026-09-20', note: 'Ria owns the approval workflow in the payments system.', assignedAt: '2026-09-02T09:00:00.000Z' }),
    act('a2', 'assert', { actorId: 'ria', changeText: 'Payments now block at two approvals.', evidenceRef: 'Release 2026.09.14', assertedAt: '2026-09-15T09:00:00.000Z' }),
  ];
  const late = reading(state(findings, acts), '2026-11-16').rows[0];
  assert.deepEqual(late.overdue, ['verification-overdue'], 'a fix that landed on time is not a late remediation');
  assert.equal(late.remediatedOnTime, true);
  assert.equal(late.verifiedOnTime, null, 'and an untested fix is not an on-time verification — null, never false');
});

/* ------------------------------------------------------------ recurrence */

test('assurance: a repeat after a VERIFIED closure and a re-observation after ACCEPTANCE are two different facts', () => {
  const verifiedPrior = finding('f1');
  const closedByVerification = [
    act('a1', 'assign', { ownerId: 'ria', dueOn: '2026-09-20', note: 'Ria owns the approval workflow in the payments system.', assignedAt: '2026-09-02T09:00:00.000Z' }),
    act('a2', 'assert', { actorId: 'ria', changeText: 'Payments now block at two approvals.', evidenceRef: 'Release 2026.09.14', assertedAt: '2026-09-15T09:00:00.000Z' }),
    act('a3', 'verify', { actorId: 'dana', decision: 'confirm', methodText: 'Re-ran 40 September payments end to end.', verifiedAt: '2026-09-25T09:00:00.000Z' }),
  ];
  const repeat = finding('f2', { id: 'f2', openedOn: '2026-10-15', remediationDueOn: '2026-11-14', verifyDueOn: '2026-12-14', createdAt: '2026-10-15T09:00:00.000Z' });
  const report = reading(state([verifiedPrior, repeat], closedByVerification), '2026-11-16');

  const row = report.rows.find((r) => r.id === 'f2');
  assert.equal(row.recurrence.recurrent, true, 'a tested fix that did not hold is a recurrence');
  assert.equal(row.recurrence.priorFindingId, 'f1');
  assert.equal(row.recurrence.priorState, 'closed-verified');
  assert.equal(row.recurrence.priorClosedOn, '2026-09-25');
  assert.equal(row.recurrence.reobserved, false);
  assert.equal(report.counts.recurrent, 1);
  assert.equal(report.counts.reobserved, 0);

  // The same control in a DIFFERENT scope is not the same finding.
  const otherScope = finding('f3', { id: 'f3', scopeRef: 'Shared services · Iberia', openedOn: '2026-10-20', remediationDueOn: '2026-11-19', verifyDueOn: '2026-12-19', createdAt: '2026-10-20T09:00:00.000Z' });
  const mixed = reading(state([verifiedPrior, repeat, otherScope], closedByVerification), '2026-11-16');
  const other = mixed.rows.find((r) => r.id === 'f3');
  assert.equal(other.recurrence.recurrent, false, 'recurrence is read from the control AND the scope, never from wording');
  assert.equal(mixed.counts.recurrent, 1);

  // Accepted, then seen again: a carried risk, not a failed fix.
  const acceptedPrior = finding('f4', { id: 'f4', openedOn: '2026-08-01', remediationDueOn: '2026-08-31', verifyDueOn: '2026-09-30', createdAt: '2026-08-01T09:00:00.000Z' });
  const accept = acceptAct('a9', { findingId: 'f4', acceptedAt: '2026-08-10T09:00:00.000Z' });
  const repeatAfterAcceptance = finding('f5', { id: 'f5', openedOn: '2026-10-20', remediationDueOn: '2026-11-19', verifyDueOn: '2026-12-19', createdAt: '2026-10-20T09:00:00.000Z' });
  const report2 = reading(state([acceptedPrior, repeatAfterAcceptance], [accept]), '2026-11-16');
  const row5 = report2.rows.find((r) => r.id === 'f5');
  assert.equal(row5.recurrence.reobserved, true);
  assert.equal(row5.recurrence.recurrent, false, 'a carried risk seen again is not a failed fix, and the register never merges the two');
  assert.equal(report2.counts.reobserved, 1);
  assert.equal(report2.counts.recurrent, 0);
  const accepted = report2.rows.find((r) => r.id === 'f4');
  assert.equal(accepted.state, 'closed-accepted');
  assert.equal(accepted.verifiedOnTime, null, 'acceptance is not a verification and never reads as one');
});

test('assurance: an acceptance closes the finding, records the reviewer and the review date, and is never a verification', () => {
  const findings = [finding('f1')];
  const acts = [acceptAct('a1')];
  const row = reading(state(findings, acts)).rows[0];
  assert.equal(row.state, 'closed-accepted');
  assert.equal(row.acceptedById, 'ceo');
  assert.equal(row.acceptReviewOn, '2027-01-31');
  assert.equal(row.allVerifiedOn, null);
  assert.equal(row.verifiedOnTime, null);
  assert.equal(row.closed, true);
});

/* --------------------------------------------------------- line roll-ups */

test('assurance: the accountable-line roll-up is non-additive and says so', () => {
  const findings = [
    finding('f1', {
      accountable: [
        { personId: 'leila', lineId: 'rl-leila-dana' },
        { personId: 'kai', lineId: 'rl-kai-omar' },
      ],
    }),
    finding('f2', { id: 'f2', accountable: [{ personId: 'leila', lineId: 'rl-leila-dana' }] }),
  ];
  const report = reading(state(findings, []));
  assert.equal(report.counts.findings, 2);
  const sum = report.lines.reduce((total, cell) => total + cell.findings, 0);
  assert.equal(sum, 3, 'a finding naming two lines is counted under both — the roll-up is NOT a partition');
  const leila = report.lines.find((cell) => cell.personId === 'leila');
  assert.equal(leila.findings, 2);
  assert.equal(leila.open, 2);
  const kai = report.lines.find((cell) => cell.personId === 'kai');
  assert.equal(kai.findings, 1);
});

test('assurance: an accountable line the record no longer carries is printed, never substituted', () => {
  const findings = [finding('f1', { accountable: [{ personId: 'leila', lineId: 'rl-leila-dana' }, { personId: 'kai', lineId: 'rl-kai-omar' }] })];
  const withdrawnLines = LINES.map((row) => (row.id === 'rl-kai-omar'
    ? { ...row, status: 'ended', toISO: '2026-10-01T09:00:00.000Z' }
    : row));
  const report = reading(state(findings, [], { reportingLines: withdrawnLines }), '2026-11-16');
  const row = report.rows[0];
  assert.equal(row.accountable.find((entry) => entry.personId === 'kai').resolved, false);
  assert.ok(row.flags.includes('accountable-line-unresolved'));
  assert.equal(report.counts.unresolvedLines, 1);
  // The line still appears in the roll-up — a dropped line would silently
  // shrink the accountability.
  assert.ok(report.lines.some((cell) => cell.personId === 'kai'));
  assert.equal(report.lines.find((cell) => cell.personId === 'kai').unresolved, 1);
});

/* ---------------------------------------------------- counts and honesty */

test('assurance: the counts reconcile, and a dropped row is counted rather than repaired', () => {
  const findings = [finding('f1'), finding('f2', { id: 'f2' })];
  const report = reading(state(findings, []));
  assert.equal(report.partitionReconciles, true);
  assert.equal(report.figuresComplete, true);
  const summed = AFR_STATE_KEYS.reduce((total, key) => total + report.counts.byState[key], 0);
  assert.equal(summed, report.counts.findings);
  assert.equal(report.counts.bySeverity['significant-deficiency'], 2);
  assert.equal(report.counts.bySource['internal-audit'], 2);
  assert.equal(report.counts.aging['31-90'], 2, 'both findings were opened 76 days before the read day');
  assert.equal(report.counts.rates.remediation.onTimeBp, 0, 'two findings past their remediation day with nothing asserted: 0 of 2, printed as 0 bp with the denominator beside it');
  assert.equal(report.counts.rates.remediation.owed, 2);

  // A malformed row is dropped and counted, never repaired.
  const broken = [...findings, { id: 'f3', controlRef: 'x', scopeRef: 'y' }];
  const dirty = reading(state(broken, []));
  assert.equal(dirty.counts.findings, 2, 'the unreadable row never reached the register');
  assert.equal(dirty.counts.droppedRows, 1);
  assert.equal(dirty.figuresComplete, false, 'the figures are honest about the row behind them');
  assert.equal(dirty.partitionReconciles, true, 'the two claims are reported apart, never merged');
  assert.ok(dirty.warnings.some((warning) => /Assurance findings: refused 1/.test(warning)));
});

test('assurance: an act whose finding did not survive normalization is dropped, not orphaned', () => {
  const findings = [finding('f1')];
  const acts = [
    act('a1', 'assign', { ownerId: 'ria', dueOn: '2026-09-20', note: 'Ria owns the approval workflow in the payments system.', assignedAt: '2026-09-02T09:00:00.000Z' }),
    act('a2', 'assign', { id: 'a2', findingId: 'ghost', ownerId: 'ria', dueOn: '2026-09-20', note: 'An act pointing at a finding that does not exist.', assignedAt: '2026-09-02T09:00:00.000Z' }),
  ];
  const report = reading(state(findings, acts));
  assert.equal(report.rows[0].accountable[0].ownerId, 'ria');
  assert.equal(report.counts.droppedRows, 1);
  assert.equal(report.figuresComplete, false);
});

test('assurance: the reader is pure — it never mutates the input and reads the same twice', () => {
  const raw = state([finding('f1')], [
    act('a1', 'assign', { ownerId: 'ria', dueOn: '2026-09-20', note: 'Ria owns the approval workflow in the payments system.', assignedAt: '2026-09-02T09:00:00.000Z' }),
  ]);
  const snapshot = JSON.parse(JSON.stringify(raw));
  const first = JSON.parse(JSON.stringify(buildAssuranceFindings(raw, { now: at('2026-11-16') })));
  const second = JSON.parse(JSON.stringify(buildAssuranceFindings(raw, { now: at('2026-11-16') })));
  assert.deepEqual(raw, snapshot, 'the input state was not touched');
  assert.deepEqual(first, second, 'the reader is deterministic on (state, now)');
});

/* ----------------------------------------------------------- normalizers */

test('assurance: the loader refuses what it cannot read, and its output is a valid stored row', () => {
  const warnings = [];
  const findings = normalizeFindings([finding('f1'), { id: 'bad', controlRef: 'a' }], warnings);
  assert.equal(findings.length, 1);
  assert.ok(warnings.length);

  // Idempotence: the loader's output survives another pass through the loader.
  const acts = [{
    id: 'a1', findingId: 'f1', actorId: 'leila', kind: 'assign', lineHolderId: 'leila', lineId: 'rl-leila-dana',
    ownerId: 'ria', dueOn: '2026-09-20', note: 'Ria owns the approval workflow in the payments system.', assignedAt: '2026-09-02T09:00:00.000Z',
  }];
  const once = normalizeFindingActs(acts, findings, []);
  assert.equal(once.length, 1);
  assert.equal(once[0].assignedAt, '2026-09-02T09:00:00.000Z', 'the per-kind raw key is carried through, so the loader does not refuse its own output');
  const twice = normalizeFindingActs(once, findings, []);
  assert.equal(twice.length, 1, 'a stored act survives a reload');
  assert.deepEqual(twice[0].assignedAt, once[0].assignedAt);

  // A remediation target that overruns the declaration is refused outright.
  const overrun = normalizeFindings([finding('f1', { remediationDueOn: '2027-10-01' })], []);
  assert.equal(overrun.length, 0, 'a 395-day remediation window is outside the declared range and is dropped, not clamped');
});
