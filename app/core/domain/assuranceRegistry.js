/**
 * app/core/domain/assuranceRegistry.js — closed vocabulary for the
 * Assurance Finding & Remediation Register (ADR-0232, `RULE-AFR-01`).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. Somebody finds that a control did not
 * work — an audit, a supervisor, an incident review, or the person doing the
 * work. Somebody is named to fix it. A date is set. Then two things happen in
 * most organisations and neither is visible: the fix is ASSERTED and never
 * tested, and the same finding comes back next year with a new number. An
 * executive signing a statement about the state of control is signing over
 * exactly that gap, and the workspace had nothing in it: no finding, no owner,
 * no target day, no independent test, no memory that this is the third time.
 *
 * This register is that memory, and it is built around one separation the
 * literature insists on and software usually collapses: THE PERSON WHO OWNS
 * THE FIX IS NEVER THE PERSON WHO VERIFIES IT (IIA Three Lines Model, 2020:
 * management owns and manages risk; independent assurance tests it). A
 * remediation that closes on its owner's word is not a remediation; it is a
 * claim.
 *
 * The second thing the register refuses to blur is RECURRENCE. A finding on
 * the same control and scope whose predecessor was CLOSED AS VERIFIED is not a
 * new problem: it is a fix that did not hold. A finding whose predecessor was
 * closed by ACCEPTANCE is a different thing — a risk somebody agreed to carry
 * and then saw again. Those are two counts and they are never added together.
 *
 * The register states nothing about a person: no volume, no rate, no score,
 * no ranking. It counts findings, lines and dates.
 */

export const AFR_ENGINE_VERSION = 'assurance-finding-remediation-2026.11-v1';
export const AFR_ADR = 'ADR-0232';
export const AFR_RULE_ID = 'RULE-AFR-01';
export const AFR_ROUTE = 'findings';
export const AFR_HREF = '#/findings';
export const AFR_MARKER_KIND = 'assurance-finding';

export const AFR_LIMITS = Object.freeze({
  findings: 300,
  acts: 4000,
  markers: 400,
  accountableMin: 1,
  accountableMax: 4,
  refMin: 3,
  refMax: 80,
  textMin: 24,
  textMax: 600,
  remediationMinDays: 1,
  remediationMaxDays: 365,
  verificationMinDays: 1,
  verificationMaxDays: 365,
  /** How far back a prior finding on the same control still counts as "again". */
  recurrenceWindowDays: 730,
  acceptMinRank: 4,
  privacyFloor: 3,
  askDueDays: 2,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
});

/**
 * Who said it. A closed list, because "an audit said so" and "the person doing
 * the work said so" carry different weight and the register must be able to
 * print the difference rather than average it.
 */
export const AFR_SOURCES = Object.freeze([
  Object.freeze({ key: 'internal-audit', label: 'Internal audit' }),
  Object.freeze({ key: 'external-audit', label: 'External audit' }),
  Object.freeze({ key: 'regulator', label: 'Regulator / supervisor' }),
  Object.freeze({ key: 'second-line', label: 'Second line (risk, compliance, quality)' }),
  Object.freeze({ key: 'incident-review', label: 'Incident or after-action review' }),
  Object.freeze({ key: 'management-review', label: 'Management review' }),
  Object.freeze({ key: 'self-identified', label: 'Self-identified by the people doing the work' }),
]);
export const AFR_SOURCE_KEYS = Object.freeze(AFR_SOURCES.map((row) => row.key));

/**
 * The COSO / PCAOB severity ladder (COSO Internal Control—Integrated Framework
 * 2013; PCAOB AS 2201). Severity is a HUMAN judgement about magnitude and
 * likelihood, declared here by name and never computed from a count, a dollar
 * figure, a keyword or the passage of time.
 */
export const AFR_SEVERITIES = Object.freeze([
  Object.freeze({ key: 'observation', label: 'Observation — worth fixing, no control failure asserted' }),
  Object.freeze({ key: 'deficiency', label: 'Control deficiency — the control did not operate as designed' }),
  Object.freeze({ key: 'significant-deficiency', label: 'Significant deficiency — less severe than a material weakness, important enough to be reported' }),
  Object.freeze({ key: 'material-weakness', label: 'Material weakness — a reasonable possibility of a material misstatement or loss' }),
]);
export const AFR_SEVERITY_KEYS = Object.freeze(AFR_SEVERITIES.map((row) => row.key));

/** Derived states. Nothing stores a state; every one is re-read from acts. */
export const AFR_STATES = Object.freeze([
  Object.freeze({ key: 'open-unassigned', label: 'Open — no accountable line has named a remediation owner' }),
  Object.freeze({ key: 'open-partially-assigned', label: 'Open — some accountable lines have named an owner, not all' }),
  Object.freeze({ key: 'remediating', label: 'Remediating — every line has an owner and a target day' }),
  Object.freeze({ key: 'asserted-awaiting-verification', label: 'Asserted — every line claims the fix; independent verification is owed' }),
  Object.freeze({ key: 'rejected-remediation-owed', label: 'Rejected — an independent verification refused the fix; remediation is owed again' }),
  Object.freeze({ key: 'closed-verified', label: 'Closed verified — every line’s fix was independently verified' }),
  Object.freeze({ key: 'closed-accepted', label: 'Closed accepted — the residual risk was accepted by a named authority' }),
]);
export const AFR_STATE_KEYS = Object.freeze(AFR_STATES.map((row) => row.key));

/** Per-line states, the parts the finding's state is built from. */
export const AFR_LINE_STATES = Object.freeze([
  Object.freeze({ key: 'unassigned', label: 'No remediation owner named on this line' }),
  Object.freeze({ key: 'remediating', label: 'Owner named — the fix is not yet asserted' }),
  Object.freeze({ key: 'asserted', label: 'The owner asserts the fix — verification is owed' }),
  Object.freeze({ key: 'verified', label: 'Independently verified' }),
  Object.freeze({ key: 'rejected', label: 'Independently rejected — the fix is owed again' }),
]);

export const AFR_DECISIONS = Object.freeze(['confirm', 'reject']);

export const AFR_FLAGS = Object.freeze({
  remediationOverdue: 'remediation-overdue',
  verificationOverdue: 'verification-overdue',
  /** The same control and scope came back after a fix that was VERIFIED. */
  recurrent: 'recurrent',
  /** The same control and scope came back after a risk that was ACCEPTED. */
  reobserved: 'reobserved-after-acceptance',
  /** An accountable line no longer resolves on the reporting graph. Printed, never repaired. */
  lineUnresolved: 'accountable-line-unresolved',
});

export const AFR_ACT_KINDS = Object.freeze(['assign', 'assert', 'verify', 'accept']);

export const AFR_REFUSALS = Object.freeze({
  unknownFinding: 'unknown-finding',
  notAccountable: 'not-accountable-on-this-line',
  lineUnresolved: 'accountable-line-not-resolved',
  alreadyAssigned: 'already-assigned-on-this-line',
  ownerUnknown: 'owner-unknown',
  ownerArchived: 'owner-archived',
  ownerOutOfReach: 'owner-out-of-reach',
  ownerIsSelf: 'owner-is-the-accountable-holder',
  dueOutOfRange: 'remediation-due-out-of-range',
  noAssignment: 'no-assignment-on-this-line',
  notOwner: 'not-the-named-remediation-owner',
  nothingToAssert: 'nothing-to-assert-on-this-line',
  assertionPending: 'assertion-already-pending-verification',
  notIndependent: 'verifier-not-independent',
  nothingToVerify: 'nothing-to-verify-on-this-line',
  verificationCurrent: 'verification-already-current',
  notAuthority: 'not-a-risk-acceptance-authority',
  acceptorIsOwner: 'acceptor-owns-the-remediation',
  alreadyClosed: 'finding-already-closed',
  beforeOpened: 'before-opened',
  futureDated: 'future-dated',
  ledgerFull: 'ledger-full',
  unreadable: 'unreadable',
  noActor: 'no-actor',
});

export const AFR_EVENTS = Object.freeze({
  DECLARED: 'assurance.finding.declared',
  ASSIGNED: 'assurance.remediation.assigned',
  ASSERTED: 'assurance.remediation.asserted',
  VERIFIED: 'assurance.remediation.verified',
  ACCEPTED: 'assurance.finding.accepted',
  SCANNED: 'assurance.findings.scanned',
});
export const AFR_EVENT_PREFIX = 'assurance.';

/**
 * FIVE RIGHTS, every one re-proved inside the action when a record is named:
 *   READ      — the register reads from the frontline upward, narrowed to the
 *               findings this seat is a party to or can reach.
 *   DECLARE   — anybody may put a finding on the record; a self-identified
 *               finding from the person doing the work is the cheapest control
 *               failure an enterprise ever gets.
 *   REMEDIATE — the accountable line's holder names the owner (assign); the
 *               named owner asserts the fix (assert). Two different acts under
 *               one right, both narrowed to the line or the owner named.
 *   VERIFY    — an independent seat strictly above the owner on the reporting
 *               DAG confirms or rejects. Never the owner, never a subordinate.
 *   ACCEPT    — residual-risk acceptance: an executive act (rank 4+), and
 *               never by a person who owns remediation on that finding.
 */
export const AFR_RIGHTS = Object.freeze({
  READ: 'read-assurance-findings',
  DECLARE: 'declare-assurance-finding',
  REMEDIATE: 'remediate-assurance-finding',
  VERIFY: 'verify-assurance-remediation',
  ACCEPT: 'accept-assurance-finding-risk',
});

export const AFR_SECTION_TITLES = Object.freeze({
  rows: 'Findings',
  lines: 'By accountable line',
  counts: 'Counts, aging and on-time rates',
  refusals: 'Refused acts',
  method: 'Method & limits',
});

/** The pause switch, named by its literal key so the pause-permit census can grep it. */
export const AFR_PAUSE_SWITCH = 'assuranceAutoPropagate';
export const AFR_DEFAULTS = Object.freeze({ autoPropagate: true });

export function normalizeAssuranceSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return { [AFR_PAUSE_SWITCH]: s[AFR_PAUSE_SWITCH] !== false };
}

export const AFR_METHOD = Object.freeze({
  engine: AFR_ENGINE_VERSION,
  adr: AFR_ADR,
  frameworks: Object.freeze([
    'IIA Three Lines Model (2020): the first line owns and manages risk, the second line provides oversight and challenge, independent assurance tests it. The register’s central rule is that separation — the person who owns the fix never verifies it, and a fix that closes on its owner’s word is printed as an assertion, not a remediation.',
    'COSO Internal Control—Integrated Framework (2013) and PCAOB AS 2201: a control failure is graded by severity — observation, deficiency, significant deficiency, material weakness — a judgement about magnitude and likelihood that a human declares here by name. Nothing in this module derives severity from a count, a figure, a keyword or a date.',
    'ISO 9001:2015 §10.2 (nonconformity and corrective action) requires that the EFFECTIVENESS of a corrective action be reviewed. ISO 19011 requires a finding to be stated against criteria. Both are represented: a finding carries the criteria it departs from, and a fix is not closed until an independent party has tested it.',
    'Repeat-finding practice (PCAOB inspection reporting; audit-committee recurrence tracking): a previously reported deficiency that reappears is evidence that remediation failed, not a new event. The register counts `recurrent` only where the prior finding on the same control AND scope was closed as VERIFIED, and prints `reobserved-after-acceptance` separately where the prior was closed by acceptance. The two are never added together, because a failed fix and a carried risk are different facts.',
    'Matrix accountability (ADR-0140): a finding usually crosses functions — the process owner, the system owner and the policy owner sit on different reporting lines. Each accountable line names its own remediation owner and target day, so no line can be dropped for being inconvenient and no single manager is silently picked. Where the record owes an escalation, the ask goes to the joint apex above EVERY accountable line.',
    'Segregation of duties (ADR-0170): the acceptor of a residual risk is never a remediation owner on that finding. The party who failed to fix it does not decide that the enterprise can live with it.',
  ]),
  invariants: Object.freeze([
    'A finding is declared once. Its control, scope, criteria, source, severity, accountable lines and dates are never edited; a correction is a new finding.',
    'An assignment names one remediation owner and one target day per accountable line, made by the holder of that line, once. A second assignment on the same line is refused and the first stands.',
    'Only the named owner asserts the fix, and only after the line carries an assignment. An assertion is a claim, never a closure.',
    'Verification is independent: strictly above the owner on the reporting DAG, never the owner, never a subordinate of the owner, never the same hand twice. A rejection returns the line to remediation owed and closes nothing.',
    'A finding closes two ways and only two: every line independently verified, or the residual risk accepted by a named authority at rank 4 or above who does not own remediation on it.',
    'Nothing closes by the passage of time. Overdue is a flag printed beside the state and it decides nothing.',
    'Counts are re-derived from stored records on every read. `partitionReconciles` (the printed state counts add to the finding total) and `figuresComplete` (no refused act, no dropped row) are reported apart — neither implies the other.',
    'A accountable-line roll-up is NON-ADDITIVE and says so: a finding naming two lines is counted under both, so the line rows do not sum to the finding total.',
    'This register does not verify that a cited control, criteria reference or evidence record exists elsewhere in the workspace. Evidence is declared, not checked, and the method note says so.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No automatic severity from prose, keyword, count or money figure. Severity is declared by a named human.',
    'No automatic root-cause inference and no cause classification engine. The cause is written by the people who own the fix.',
    'No auto-closure, no auto-verification, no automatic escalation beyond ONE dated, idempotent ask per (condition, addressee).',
    'No compliance score, no control-effectiveness percentage, no maturity rating and no benchmark against other organisations.',
    'No per-person volume, rate, ranking or score. The register counts findings, lines and dates; it never counts a person’s faults.',
    'No cost, loss or impact quantification. Nothing here turns a finding into a number of dollars; an enterprise that wants that declares it elsewhere, on its own evidence.',
  ]),
});

/* ------------------------------------------------------------------- CSV */

/**
 * CSV scope #175 (ADR-0232, Schema v187). Aggregate and identity-free: one
 * summary row, one coverage row, and one row per derived state, severity,
 * source, aging bucket and accountable line (under an opaque code). No finding
 * id, control name, scope name, criteria, statement, owner, verifier, acceptor
 * or line name crosses this boundary; a cell below the privacy floor of three
 * exports BLANK with its reason, never zero.
 */
export const AFR_CSV_SCOPE = 'assurance-findings';

export const AFR_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'state', 'severity', 'source',
  'findings', 'open', 'closed', 'recurrent',
  'overdue_remediation', 'overdue_verification',
  'owed', 'on_time', 'on_time_rate_bp', 'blank_reason',
]);

export const AFR_CSV_DESCRIPTOR = Object.freeze({
  key: AFR_CSV_SCOPE,
  label: 'Assurance finding & remediation register (aggregate)',
  group: 'leadership',
  sensitive: true,
  filenameSlug: 'assurance-findings',
  description: 'One summary row, one coverage row, and one row per derived state, severity, source, aging bucket and accountable line, all as exact integer counts over the whole register. No finding id, control, scope, criteria, statement, owner, verifier, acceptor or line name is exported; a cell below the privacy floor of three is blank with its reason, never zero.',
});
