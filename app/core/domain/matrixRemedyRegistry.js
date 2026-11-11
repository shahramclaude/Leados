/**
 * app/core/domain/matrixRemedyRegistry.js — vocabulary, limits and method text
 * for the Matrix Pattern Repair Register (ADR-0175, Schema v139,
 * `#/matrix?panel=remedies`, CSV scope #129).
 *
 * Pure constants. No DOM, storage or clock.
 */

import { RIGHTS_CONCORDANCE_FINDINGS } from './rightsConcordanceRegistry.js';

/** The one governed act this slice ships. Supersession is In Progress. */
export const MATRIX_REMEDY_RIGHT = 'declare-matrix-remedy';

export const MATRIX_REMEDY_ENGINE_VERSION = 'matrix-remedy-v1';

/**
 * Bounds. A review window shorter than two weeks cannot separate a remedy's
 * effect from ordinary week-to-week variation; a window longer than a year is
 * not a review of a remedy any more. Both bounds are declared, not tuned.
 */
export const MATRIX_REMEDY_LIMITS = Object.freeze({
  remedies: 400,
  remedyMinChars: 20,
  remedyChars: 600,
  basisChars: 400,
  reviewMinDays: 14,
  reviewMaxDays: 365,
  /** Matching decisions needed in the baseline window before a before/after reading exists. */
  baselineMinDecisions: 2,
  /** Audited decisions in scope needed in the review window before an absence can be read as absence. */
  reviewMinAuditedDecisions: 2,
  shownPatterns: 60,
});

/** Closed remedy-state vocabulary. A pattern either has an active remedy or it does not. */
export const MATRIX_REMEDY_STATES = Object.freeze({
  remedied: 'remedied',
  unaddressed: 'unaddressed',
});

export const MATRIX_REMEDY_STATE_LABELS = Object.freeze({
  remedied: 'Remedy on record',
  unaddressed: 'No remedy on record',
});

/**
 * Closed verdict vocabulary for a remedy whose review date has been reached.
 * `pending` is the only verdict a remedy can carry before its review date;
 * `refused` is a printed reason, never a zero and never a success.
 */
export const MATRIX_REMEDY_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'pending',
    label: 'Review not yet due',
    tone: 'neutral',
    why: 'The review date has not arrived. The matching decisions recorded so far are shown as counts only and carry no verdict.',
  }),
  Object.freeze({
    key: 'refused',
    label: 'Refused — no reading',
    tone: 'warn',
    why: 'The record cannot support a before/after reading. The reason is printed on the row; no effect is inferred.',
  }),
  Object.freeze({
    key: 'unchanged',
    label: 'Recurring — no fewer matching decisions',
    tone: 'bad',
    why: 'Matching decisions in the review window were as many as, or more than, the baseline window. The remedy has not visibly reduced the pattern.',
  }),
  Object.freeze({
    key: 'reduced',
    label: 'Reduced — fewer matching decisions',
    tone: 'warn',
    why: 'Matching decisions fell in the review window but did not disappear. Partial reduction is reported as partial, not as closure.',
  }),
  Object.freeze({
    key: 'cleared',
    label: 'Cleared in the review window',
    tone: 'good',
    why: 'No matching decision was recorded in the review window, which itself held enough audited decisions to have shown one. This is a window reading, not proof that the cause is gone.',
  }),
]);

export const MATRIX_REMEDY_VERDICT_KEYS = Object.freeze(MATRIX_REMEDY_VERDICTS.map((v) => v.key));
export const MATRIX_REMEDY_VERDICT_LABELS = Object.freeze(
  Object.fromEntries(MATRIX_REMEDY_VERDICTS.map((v) => [v.key, v.label])),
);

/** Refusal reasons, printed verbatim so a leader can see exactly why no reading exists. */
export const MATRIX_REMEDY_REFUSALS = Object.freeze({
  noBaseline: 'Fewer than two matching decisions fall in the baseline window before the remedy, so there is nothing to compare against.',
  thinReview: 'The review window holds fewer audited decisions in this seat than the declared minimum, so a quiet window cannot be told apart from a window nobody decided anything in.',
  duplicateActive: 'Two active remedies name this pattern. The register refuses a verdict until one is superseded; supersession is In Progress.',
  ownerMissing: 'The named owner is no longer on the active roster. The remedy is kept as recorded; reassigning it is a supersession, which is In Progress.',
  unmatched: 'This remedy names a pattern that is not visible as a recurring pattern in the acting seat, so it is counted and not read.',
  invalid: 'A stored remedy row failed the fail-closed normaliser and was dropped with a printed warning, never repaired.',
});

/** Named frameworks the reading is built on — printed on the panel, never paraphrased. */
export const MATRIX_REMEDY_FRAMEWORKS = Object.freeze([
  Object.freeze({
    name: 'Plan–Do–Check–Act (Deming)',
    use: 'The remedy is the Plan and Do; the review date is the Check. The reading is taken at the Check, not during the Do.',
  }),
  Object.freeze({
    name: 'Interrupted time series with a comparison window (Campbell & Ross, 1968)',
    use: 'Matching decisions are counted in an equal-length window before and after the remedy date. The windows are fixed before counting and do not slide.',
  }),
  Object.freeze({
    name: 'Quasi-experimental threats to validity (Shadish, Cook & Campbell, 2002)',
    use: 'Maturation, history and selection are named as limits on every verdict; a before/after change is never called a causal effect.',
  }),
  Object.freeze({
    name: 'Regression to the mean (Galton, 1886; Barnett, van der Pols & Dobson, 2005)',
    use: 'A pattern is usually recorded at a peak. Recurrence that merely falls back is the expected outcome, which is why a baseline floor and a review window are required before any reading.',
  }),
]);

export const MATRIX_REMEDY_METHOD = Object.freeze([
  'A remedy is declared against a recurring structural signature only: the same finding kind, the same set of line kinds in force and the same affected rights, on at least two distinct decisions visible in the acting seat.',
  'The owner is a named person on the active roster or the workspace leader. Ownership is never inferred from a manager, a line or a title.',
  'Before the review date the register prints counts and no verdict. On or after it, a verdict requires a baseline of matching decisions and enough audited decisions in the review window; otherwise the row is refused with its reason.',
  'The baseline and review windows are equal in length and disjoint; the remedy day itself belongs to the baseline. A decision recorded on a later day than the review date is outside the reading.',
  'Nothing is stored except the remedy act. Every count, window and verdict is re-derived on read from the decision log and the declared lines, so a printed figure cannot drift from the record beneath it.',
  'The register never rates, ranks or scores a person, and never closes a pattern on its own: “cleared” is a statement about one window, and the record of it stays open for the next review.',
]);

/** Columns of the aggregate export. No person, owner, remedy text, decision or line identifier is exported. */
export const MATRIX_REMEDY_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'label',
  'finding_kind',
  'line_kinds',
  'right_keys',
  'decisions_n',
  'remedy_state',
  'verdict',
  'baseline_decisions_n',
  'review_window_decisions_n',
  'review_on',
  'bucket_n',
]);

export const MATRIX_REMEDY_CSV_DESCRIPTOR = Object.freeze({
  scope: 'matrix-remedies',
  label: 'Matrix pattern remedies (aggregate)',
  columns: MATRIX_REMEDY_CSV_COLUMNS,
  rule: 'One summary row per remedy state and verdict bucket, and one row per recurring structural pattern. Identity-free: no person, owner, decision, line or remedy-text field is exported.',
});

export const MATRIX_REMEDY_FINDING_LABELS = Object.freeze(
  Object.fromEntries(RIGHTS_CONCORDANCE_FINDINGS.map((f) => [f.key, f.label])),
);

export const MATRIX_REMEDY_FINDING_KEYS = Object.freeze(RIGHTS_CONCORDANCE_FINDINGS.map((f) => f.key));
