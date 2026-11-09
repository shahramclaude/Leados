/**
 * app/core/domain/rightsConcordanceRegistry.js — the declared vocabulary of
 * the Matrix Decision-Right Execution Concordance (ADR-0145, Schema v121
 * unchanged, `#/matrix?panel=concordance`, CSV scope #108).
 *
 * THE DUTY. The Matrix Accountability Ledger (ADR-0140) declares, per line,
 * WHICH decision rights that line holds over the people on it — and the
 * contradiction audit (ADR-0144) audits whether two lines' charters make one
 * another unachievable. Nothing in the product ever asks the reverse, dated
 * question about the DECISION LOG itself:
 *
 *   "Last quarter we recorded that this manager decided this. Did the
 *    structure we declared — the rights on this person's lines, on that
 *    day — actually give them the authority to decide it, and were the
 *    people the structure says must be heard, heard?"
 *
 * A declared right that no decision respects is decoration. A decision made
 * by a manager the structure gave no right to is a bypass that will be
 * re-fought every time. This module reads what the record actually did and
 * compares it, date by date, against the rights that were in force on every
 * active line of the person the decision concerned.
 *
 * WHY THIS IS NOT A RATING. Every finding below is a statement about a
 * PAIR — a decision and a declared line structure — or about a right the
 * structure attributes to nobody. It is never a score of a manager, a
 * leader or a person, and the module refuses to rank people by it. A
 * bypass is a design fact a director can fix in a minute; a "authority
 * score" would be a judgement about colleagues that no record can support.
 *
 * THE FOUR FINDINGS, AND WHAT EACH ONE IS ACTUALLY SAYING
 * -------------------------------------------------------
 *  - `bypass`                the recorded decider held NO declared right on
 *                            any of the subject's active lines on the decision
 *                            date. The decision was made outside the rights
 *                            structure the organisation declared.
 *  - `contested-decided`     the decider held at least one right that TWO OR
 *                            MORE managers hold. The structure duplicated the
 *                            authority and the decision silently picked one
 *                            holder — the duplicate-approval risk the audit
 *                            exists to surface.
 *  - `unresolved-authority`  a right on the subject's active lines was held
 *                            by NOBODY on the decision date. The decision
 *                            itself supplied an authority the structure did
 *                            not — the gap was filled by the act, not by a
 *                            line.
 *  - `consult-gap`           a manager holding an OPERATIONAL right (priority,
 *                            assignment, technical) on the subject's lines
 *                            was not recorded among the decision's
 *                            contributors. RAPID's Consulted role exists
 *                            precisely so the people with a standing right to
 *                            be heard are heard.
 *
 * THE SCOPE LIMITS, COUNTED AND NEVER GUESSED
 * -------------------------------------------
 *  - `unresolved-decider`    the recorded approver name does not resolve to a
 *                            roster person. DACI names are free text by
 *                            design — a decision may be made with someone
 *                            outside the roster — so this is a limit of the
 *                            comparison, not a finding against anyone. The
 *                            decision is counted and printed.
 *  - `unscoped-decision`     a completed decision with no subject person
 *                            determinable from the record (no typed link to a
 *                            person or to a case with an owner). The audit
 *                            refuses to guess whose lines govern.
 *  - `single-line-subject`   the subject is on exactly one line. The matrix
 *                            module's own scope for the rights question is
 *                            people on MORE than one line — a single line
 *                            "decides everything by default" — so the
 *                            concordance counts these decisions and audits
 *                            nothing about them.
 *  - `dangling-subject`      a linked subject who is not on the roster.
 *                            Counted, dropped, printed.
 *
 * WHAT IS DERIVED, AND WHAT IS NEVER STORED
 * -----------------------------------------
 * Nothing is stored. The concordance is a pure read: every figure is
 * re-derived on every render from the decision records, the typed provenance
 * graph, and the declared reporting lines — the same shared engine the rest
 * of the workspace uses (`buildMatrix` at the DECISION date, `linksForEntity`
 * for subjects, `matrixLineScopeFor`/`buildSeats` for the seat's scope). A
 * stored finding would be a verdict waiting to disagree with the lines it was
 * computed from.
 *
 * ALL COMPARISONS ARE EXACT: a right is either held or it is not, a line is
 * either active on the decision date or it is not, and every count the panel
 * prints is one of the identities asserted in the suite. No float ever
 * participates in a judgement a leader will act on.
 */

export const RIGHTS_CONCORDANCE_ENGINE_VERSION = 'rights-concordance-2026.11-v1';

/** The four structural process findings. */
export const RIGHTS_CONCORDANCE_FINDINGS = Object.freeze([
  Object.freeze({
    key: 'bypass',
    label: 'Decision outside the declared rights',
    tone: 'bad',
    why: 'The recorded decider held no declared right on any of the subject\'s active lines on the decision date. The decision was made outside the authority structure the organisation declared — and the structure, not the person, is what the next ruling must fix.',
  }),
  Object.freeze({
    key: 'contested-decided',
    label: 'Contested right exercised',
    tone: 'warn',
    why: 'The decider held at least one right that two or more managers hold. The structure duplicated the authority and this decision picked one holder without arbitration — the same contest will return as a disputed precedent.',
  }),
  Object.freeze({
    key: 'unresolved-authority',
    label: 'Decision filled an unowned right',
    tone: 'warn',
    why: 'A right on the subject\'s active lines was held by nobody on the decision date, so the decision itself supplied the authority the declared structure did not have. The gap was filled by the act, not by a line.',
  }),
  Object.freeze({
    key: 'consult-gap',
    label: 'Operational right-holder not consulted',
    tone: 'warn',
    why: 'A manager holding an operational right (priority, assignment or technical direction) on the subject\'s lines was not recorded among the decision\'s contributors. RAPID\'s Consulted role exists so the people with a standing right to be heard are heard.',
  }),
]);

export const RIGHTS_CONCORDANCE_FINDING_KEYS = Object.freeze(
  RIGHTS_CONCORDANCE_FINDINGS.map((f) => f.key),
);

/** The scope limits: counted, printed, never guessed into. */
export const RIGHTS_CONCORDANCE_SCOPE_KEYS = Object.freeze([
  'unresolved-decider',
  'unscoped-decision',
  'single-line-subject',
  'dangling-subject',
]);

export const RIGHTS_CONCORDANCE_SCOPE_LABELS = Object.freeze({
  'unresolved-decider': 'Decider not on the roster',
  'unscoped-decision': 'No subject in the record',
  'single-line-subject': 'Subject on a single line',
  'dangling-subject': 'Linked subject not on the roster',
});

/**
 * The declared limits. A queue that is capped counts its remainder — the
 * remainder is printed, never dropped (the same discipline the matrix review
 * queue follows).
 */
export const RIGHTS_CONCORDANCE_LIMITS = Object.freeze({
  /** Finding rows carried in the panel queue before the rest are counted. */
  findings: 24,
  /** Audited-decision rows carried in the decision table. */
  decisions: 20,
  /** Free-text detail length on a finding row. */
  detailChars: 320,
  /** Decision title length carried into a finding row. */
  titleChars: 90,
});

/**
 * The named methods. The module prints these; it does not paraphrase them.
 */
export const RIGHTS_CONCORDANCE_METHOD = Object.freeze([
  {
    name: 'RAPID decision rights, read backwards through the decision log (Rogers & Blenko, 2006)',
    why: 'ADR-0140 attributes six decision rights to named lines. This concordance reads the DECISION LOG — who actually decided, and who was actually consulted — and checks every dated decision against the rights that were in force on every active line of the person it concerned. The direction is the whole point: the ledger declares authority, the log records its exercise, and the gap between them is a structural fact, not a character flaw.',
  },
  {
    name: 'Dated line windows, re-derived through the shared matrix engine',
    why: 'A right is only in force on the lines that were ACTIVE on the decision date. The concordance does not re-implement line windows: it calls the real `buildMatrix` at each decision date, so a line declared after the decision, or ended before it, is excluded by the same engine the rest of the workspace uses. Nothing here is a second hierarchy.',
  },
  {
    name: 'Subject resolution through the typed provenance graph (ADR-0130)',
    why: 'A decision record names its DACI participants but not whose work it decided. The subject is resolved ONLY through typed graph edges the workspace already writes — a link to a person, or a link to a case whose owner is a person — and a decision with no such link is counted as unscoped rather than guessed. Provenance is the only honest join.',
  },
  {
    name: 'Structural findings, never person ratings',
    why: 'Every finding is a statement about a decision against a declared line structure, or about a right the structure attributes to nobody. The module refuses to rank managers by how often their decisions sit outside the rights structure: the fix is a line declaration, and a score would only move the argument from the design to the person.',
  },
]);

/**
 * The honest limits. Printed on the panel so a reader cannot mistake the
 * reading for a complete audit of the decision log.
 */
export const RIGHTS_CONCORDANCE_LIMITS_TEXT = Object.freeze([
  'The concordance reads only this workspace\'s records. A decision made outside LeadOS, or a line declared in another system, reads as absent — and the panel says how many decisions were unscoped before it prints any rate.',
  'The subject of a decision is resolved only through typed provenance edges (a link to a person, or to a case with a recorded owner). DACI records name participants but never the subject, so a decision with no such edge is counted as unscoped, never guessed.',
  'A seat sees the findings about the people in its own scope. Findings whose subject sits outside the seat\'s span are counted as withheld, never shown — the audit widens a seat to its own people, never sideways.',
  'Named approver rows are printed under the workspace\'s own detail ceiling: above the declared rank the decider\'s name is withheld and the count survives, exactly as a manager\'s allocation is withheld on the matrix desk.',
  'Consultation is checked against the OPERATIONAL rights only (priority, assignment, technical). Stewardship right-holders (pay, performance, absence) are employment-relationship holders and are not required to be consulted on a work decision; the convention is printed so it can be argued with.',
  'The roster is read as it stands: a line is active on the decision date if its declared window covers that date, and the people on it are the people on the roster today. Historical roster state is not reconstructed — the module says which windows it used rather than pretending to a retrospective org chart.',
  'Seats remain workflow declarations, not authentication. The concordance measures what the declared structure would permit, not what authority anyone actually exercises beyond the record.',
]);

/** The CSV scope descriptor, aggregate-only and identity-free. */
export const RIGHTS_CONCORDANCE_CSV_DESCRIPTOR = Object.freeze({
  key: 'rights-concordance',
  label: 'Matrix decision-right execution concordance (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'rights-concordance',
  description: 'One workspace row carrying every count the panel prints (completed, audited, with-findings, clean, unscoped, single-line, unresolved-decider, dangling-subject, withheld), and one row per finding kind (bypass, contested-decided, unresolved-authority, consult-gap) with its exact count. NO person, NO name, NO decider, NO decision id, NO decision title, NO line id and NO right holder. A count that is a limit of the comparison is a number beside its label, never a zero and never a finding against anyone.',
});

export const RIGHTS_CONCORDANCE_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'scope',
  'kind',
  'count',
  'decisions_read_n',
  'decisions_audited_n',
  'decisions_with_findings_n',
  'decisions_clean_n',
  'decisions_unscoped_n',
  'decisions_single_line_n',
  'decisions_unresolved_decider_n',
  'dangling_subject_n',
  'withheld_findings_n',
]);

/**
 * The safe-read declaration for the access gateway: the concordance is a
 * read-only view of the matrix report, reachable at every leadership rank
 * (it is the matrix report\'s own panel), and it never writes.
 */
export const RIGHTS_CONCORDANCE_READS = Object.freeze({
  rightsConcordance: 'matrix report concordance panel (read-only, seat-scoped)',
});
