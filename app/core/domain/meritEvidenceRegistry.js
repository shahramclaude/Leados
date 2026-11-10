/**
 * app/core/domain/meritEvidenceRegistry.js — the declared vocabulary of the
 * Cross-Line Review-Evidence Join (ADR-0166, Schema v132 unchanged,
 * `#/merit?panel=matrix`, CSV scope #116 extended).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. The November merit cycle closed. Sam was
 * paid 2.5% and the packet reads complete: the assessment behind it was signed
 * by Dana, her home-line manager, against a completed review. The question an
 * auditor asks in March is not "who held the pay right" — ADR-0155 answers that
 * — it is: *was the evidence this number rests on actually gathered from both
 * lines Sam worked on?* Sam spent the year at 40% on Priya's programme. The
 * workspace already stores, per review, every line that was ASKED for input and
 * every line that ANSWERED in its own words (ADR-0147). And nothing in the merit
 * reading ever read those records. So a pay decision can read `authority: clear,
 * parity: no difference past the band` while the assessment under it was written
 * from the home line alone, with the second line never asked — or asked, and
 * silent, and nobody noticing.
 *
 * THAT IS THE GAP THIS MODULE CLOSES. It joins two records the workspace already
 * holds and never reconciles:
 *
 *   the REVIEW whose rating the pay decision reads   (`comp.js` `ratingIndex`)
 *   the STEWARDSHIP states of every line on it      (ADR-0147)
 *
 * and prints, per PAY DECISION, how many of the person's period lines were
 * consulted, whether the rating that fed this money rested on home-line evidence
 * only, or on a contested/unowned assessor, or on a review nobody can find.
 *
 * THE ONE THING IT REFUSES TO DO THAT WOULD BE EASY
 * ------------------------------------------------
 * It does not invent the missing input, re-open the review, weight the lines, or
 * create a per-line "contribution" share. ADR-0147 records WHO was asked and
 * what each line said; it records no per-line provenance on feedback, 1:1 notes
 * or delegations, so any share derived from them would be fabricated. The
 * finding is therefore ON THE PAY DECISION — "this rating rests on home-line
 * evidence only" — never a score on a manager, never a rating on a person.
 *
 * THE FIVE STATES OF ONE PAY DECISION'S EVIDENCE
 * ----------------------------------------------
 *   no-review          the cycle reads a rating the workspace cannot find a
 *                      completed review for. Not a gap in the person; a gap in
 *                      the record, and the rating itself is unverifiable.
 *   contested-assessor two or more lines held the `performance` right for the
 *                      period. The packet has no sole author.
 *   unowned-assessor   no line held it. The assessment has no entitled author.
 *   line-unasked       the review had a second line in force in the period and
 *                      that line was never asked. THIS IS THE FINDING.
 *   line-silent        the line was asked and did not answer inside its window.
 *                      A dated human act of not answering, printed as such.
 *   home-line-only     nothing above applies but nobody but the home line
 *                      contributed evidence, so the reading is honest to say
 *                      the assessment rests on one line even though it was
 *                      properly run.
 *   corroborated       every line in force in the period was asked and answered
 *                      or declined with a reason. The strongest true word this
 *                      module may use, and it is about the PROCESS, never about
 *                      whether the number was correct.
 *
 * WHICH REVIEW A PAY DECISION READS. `comp.js` `ratingIndex` picks the LATEST
 * completed review at or before the rating date and nothing else. This module
 * reads that SAME review — by id — so the join can never compare a pay decision
 * to a review the pay decision was not made from. That is why the review id is
 * printed on the row.
 *
 * WHAT IS NEVER BUILT
 * -------------------
 * No stored field. No collection. No migration. No second hierarchy: the line
 * set is read through `buildMatrix` and `periodLinesFor` on the cycle's own
 * effective date, exactly as ADR-0154/0155 do. Every figure is re-derived on
 * read, so the screen and the export cannot drift from the record.
 *
 * FRAMEWORK BASIS. Bounded rationality in evidence gathering (Simon 1955;
 * Cyert & March 1963): the manager assesses what they saw, and the second line's
 * observation is simply absent rather than weighed as weaker. Procedural-justice
 * theory (Leventhal 1980; Tyler & Lind 1992): consistency and correctability of
 * the process carry as much weight as the outcome, and an unconsulted line is a
 * defect in the procedure that the person is entitled to see named. Multi-task
 * agency (Holmström & Milgrom 1991) as in ADR-0154: the unrewarded line is
 * starved by the measurement, not by the person. Evidence-sufficiency standards
 * for internal audit (IIA) and internal-control documentation (COSO 2013): a pay
 * decision whose evidence base cannot be reproduced does not support the
 * decision. Statistical disclosure control (house convention, ADR-0139/0126): a
 * withheld figure is BLANK with its reason, never zero.
 */

export const MERIT_EVIDENCE_ENGINE_VERSION = 'merit-evidence-join/1';

/* ------------------------------------------------------------- conventions */

/**
 * Declared conventions. There are no workspace settings for them on purpose: an
 * evidence floor that can be lowered until the reading agrees with the reader is
 * not a check.
 */
export const MERIT_EVIDENCE_CONVENTIONS = Object.freeze({
  /**
   * The right a line must hold to be the ASSESSOR of the review. This is the
   * matrix register's own right key; the join reads the same declaration the
   * review packet reads.
   */
  right: 'performance',
  /**
   * Minimum number of joined decisions in a cohort before the advice percentages
   * are printed. Below this a percentage is an anecdote, so the counts print and
   * the rate is withheld with its reason.
   */
  cellFloor: 3,
  /**
   * A line within this many days of its ask due date is `asked`, not `overdue`.
   * It is the review-stewardship convention applied at read time; the number is
   * restated here only so the join can print what it used.
   */
  overdueGraceDays: 0,
  /** Even counts use the LOWER median when a count median is printed. */
  median: 'lower',
});

export const MERIT_EVIDENCE_FLOOR = MERIT_EVIDENCE_CONVENTIONS.cellFloor;

/** Bounded read: at most this many pay rows are joined per cycle. */
export const MERIT_EVIDENCE_LIMITS = Object.freeze({
  rows: 500,
  findings: 60,
});

/* ---------------------------------------------------------------- states */

/**
 * The evidence states, WORST FIRST, with declared precedence. `unknown` outranks
 * everything because a decision whose review cannot be read is not evidence —
 * and it must never be mistaken for a decision whose evidence was complete.
 *
 * `open` marks the states that represent work somebody owes. `home-line-only`
 * is deliberately NOT `open`: it is a printed limit on the reading, not a
 * failure, because a properly-run review of a person with one line is exactly
 * that — one line's evidence, gathered correctly.
 */
export const MERIT_EVIDENCE_STATES = Object.freeze([
  Object.freeze({
    key: 'unknown',
    label: 'The review behind this decision cannot be read',
    rank: -1,
    tone: 'bad',
    open: true,
    detail: 'The rating this pay decision reads could not be traced to a readable completed review, or the cycle could not be read. This is never evidence that the process was complete.',
  }),
  Object.freeze({
    key: 'contested-assessor',
    label: 'Two or more lines hold the assessment right',
    rank: 0,
    tone: 'bad',
    open: true,
    detail: 'More than one line declared the `performance` right for the review period, so the packet that fed this money has no sole author. Named here, never resolved here.',
  }),
  Object.freeze({
    key: 'unowned-assessor',
    label: 'No line holds the assessment right',
    rank: 1,
    tone: 'bad',
    open: true,
    detail: 'No line in force in the period held the `performance` right. An assessment with no entitled author is a record nobody can defend.',
  }),
  Object.freeze({
    key: 'line-unasked',
    label: 'A line in force was never asked',
    rank: 2,
    tone: 'warn',
    open: true,
    detail: 'The review behind this decision had a second line in force for the period and that line was never asked for input. The rating therefore rests on the lines that spoke — the finding this join exists to make.',
  }),
  Object.freeze({
    key: 'line-silent',
    label: 'A line was asked and did not answer in its window',
    rank: 3,
    tone: 'warn',
    open: true,
    detail: 'Every line was asked, and at least one did not answer or decline inside its declared window. A dated human act of not answering, printed as such and not counted as evidence.',
  }),
  Object.freeze({
    key: 'home-line-only',
    label: 'Only the home line contributed evidence',
    rank: 4,
    tone: 'caution',
    open: false,
    detail: 'The review ran correctly and every line in force was asked, but no line other than the home line answered. The reading says the assessment rests on one line; it does not call that wrong.',
  }),
  Object.freeze({
    key: 'single-line',
    label: 'One line in force — the matrix does not apply',
    rank: 5,
    tone: 'neutral',
    open: false,
    detail: 'The person sat on exactly one reporting line in the review period, so there is no second line whose absence could be a finding. Inert by construction, exactly as in a single-chain workspace.',
  }),
  Object.freeze({
    key: 'corroborated',
    label: 'Every line in force answered the review',
    rank: 6,
    tone: 'good',
    open: false,
    detail: 'Every line in force in the period was asked and either answered in its own words or declined with a stated reason. A claim about the PROCESS — that the evidence base was complete — never that the number was right.',
  }),
]);

const STATE_BY_KEY = new Map(MERIT_EVIDENCE_STATES.map((s) => [s.key, s]));
export function meritEvidenceState(key) {
  return STATE_BY_KEY.get(String(key || '')) || null;
}

/** The states that owe work. Declared once; the rule and the badge read this. */
export const MERIT_EVIDENCE_OPEN_STATES = Object.freeze(
  MERIT_EVIDENCE_STATES.filter((s) => s.open).map((s) => s.key),
);

/* --------------------------------------------------------------- verdicts */

/**
 * The parity-level verdict for the whole cycle. Declared precedence top to
 * bottom. `incomplete` outranks every substantive reading, and `single-line`
 * is its own answer — a cycle with no second-line pay decision has nothing to
 * join and must not read as "evidence is fine".
 */
export const MERIT_EVIDENCE_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'no-cycle',
    label: 'No merit cycle to read',
    rank: 0,
    tone: 'neutral',
    open: false,
    detail: 'There is no merit cycle in this workspace, so there is no pay decision and no review to join it to.',
  }),
  Object.freeze({
    key: 'single-line',
    label: 'No second-line pay decision',
    rank: 1,
    tone: 'neutral',
    open: false,
    detail: 'Nobody in this cycle sat on a second reporting line for the review period. There is no cross-line evidence to join — a different claim than “the evidence was complete”.',
  }),
  Object.freeze({
    key: 'incomplete',
    label: 'The join cannot be completed',
    rank: 2,
    tone: 'warn',
    open: true,
    detail: 'At least one pay decision cannot be traced to a readable review, or the pay pool is incomplete. No rate and no evidence claim is printed.',
  }),
  Object.freeze({
    key: 'gap',
    label: 'Pay decisions rest on unconsulted lines',
    rank: 3,
    tone: 'warn',
    open: true,
    detail: 'A printed share of second-line pay decisions rest on a review whose second line was never asked, never answered, or whose assessor was contested or unowned. This is a PROCEDURE finding and it names the decisions, not the people.',
  }),
  Object.freeze({
    key: 'corroborated',
    label: 'Every second-line decision was corroborated',
    rank: 4,
    tone: 'good',
    open: false,
    detail: 'Every second-line pay decision in this cycle rests on a review whose every line in force was asked and answered or declined with a reason. A process claim, not a claim about the money.',
  }),
]);

const VERDICT_BY_KEY = new Map(MERIT_EVIDENCE_VERDICTS.map((v) => [v.key, v]));
export function meritEvidenceVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '')) || null;
}

/* --------------------------------------------------------------- refusals */

/**
 * Every refusal this join can print, with the reason it exists. A refused figure
 * is BLANK everywhere — panel, brief and CSV — and never a zero.
 */
export const MERIT_EVIDENCE_REFUSALS = Object.freeze([
  Object.freeze({ key: 'no-cycle', label: 'No merit cycle', detail: 'There is no cycle to read, so there is no pay decision to join to a review.' }),
  Object.freeze({ key: 'no-effective-date', label: 'The cycle has no readable effective date', detail: 'The review period and the line set are read against the day the money takes effect. Without that day the join would have to guess which review and which structure applied.' }),
  Object.freeze({ key: 'no-completed-review', label: 'A pay decision reads a rating with no readable completed review', detail: 'The rating that fed the money cannot be traced to a completed review. This is a gap in the record; the join prints it and does not fall back to any other review.' }),
  Object.freeze({ key: 'review-not-in-period', label: 'The review’s period does not cover the pay decision', detail: 'A completed review exists but its period ends before the money lands by more than a declared window, so it is not obviously the review this decision reads. Printed and refused rather than assumed.' }),
  Object.freeze({ key: 'unrecorded-home-line', label: 'The home line on that day is not in the record', detail: 'This person has recorded home-line history and none of it covers the effective date. Their line set cannot be read, so the evidence join is refused rather than projected backwards from today.' }),
  Object.freeze({ key: 'partial-pool', label: 'The pay pool is incomplete', detail: 'An excluded, malformed or capped pay row means the joined population is not the whole cycle. Counts still print; every rate is withheld.' }),
  Object.freeze({ key: 'cohort-below-floor', label: 'Too few second-line decisions to print a rate', detail: 'Below the declared floor a percentage is an anecdote. The counts print and the rate is BLANK with this reason.' }),
  Object.freeze({ key: 'orphaned-stewardship', label: 'A stored ask or answer names a line that no longer resolves', detail: 'The review records an ask or an answer for a line key the person’s current declarations do not resolve. It is kept and counted by the review-stewardship reader, and the join reports it rather than reassigning it.' }),
  Object.freeze({ key: 'rating-unauthored', label: 'The review carries no manager rating', detail: 'The review that was found carries no rating, so it cannot be the review that produced the pay decision. The join prints the discrepancy instead of substituting another review.' }),
]);

/* ------------------------------------------------------------- frameworks */

export const MERIT_EVIDENCE_FRAMEWORKS = Object.freeze([
  Object.freeze({ key: 'bounded-rationality', name: 'Simon (1955); Cyert & March (1963), bounded rationality in evidence gathering', applied: 'A manager assesses what reached them. The second line’s observation is not weighed lower — it is simply absent, which is why absence has to be printed rather than averaged in.' }),
  Object.freeze({ key: 'procedural-justice', name: 'Leventhal (1980); Tyler & Lind (1992), procedural justice', applied: 'Consistency and correctability of the process carry weight independent of the outcome. An unconsulted line is a defect in the procedure the person is entitled to see named.' }),
  Object.freeze({ key: 'multi-task-agency', name: 'Holmström & Milgrom (1991), multi-task principal–agent', applied: 'Two principals each see part of the job; the task whose principal can reward it survives and the other is starved by the measurement. The join measures the measurement.' }),
  Object.freeze({ key: 'audit-evidence', name: 'IIA evidence sufficiency; COSO (2013) control activities', applied: 'A decision record must reproduce the evidence in force when it was made. A pay decision whose review cannot be produced does not support the decision.' }),
  Object.freeze({ key: 'disclosure-control', name: 'Statistical disclosure control (house convention, ADR-0139/ADR-0126)', applied: 'A cell floor withholds a rate below a declared count; a withheld figure is BLANK, never zero, and its reason is printed.' }),
]);

/* ------------------------------------------------------------- CSV shape */

/**
 * Aggregate-only columns ADDED to CSV scope #116 by ADR-0166. The pre-existing
 * ADR-0154/0155 columns stay exactly as they were; these are appended, so a
 * consumer reading by header is unaffected and a consumer reading by index sees
 * a wider, documented row. NO person, NO name, NO manager id, NO cycle label,
 * NO salary, NO rating and NO review id: the join is a procedure audit and every
 * question it answers is answerable in counts.
 */
export const MERIT_EVIDENCE_CSV_COLUMNS = Object.freeze([
  // How many decisions the join could read at all, and the states it found.
  'evidence_joined_n',
  'evidence_unreadable_n',
  'evidence_corroborated_n',
  'evidence_home_line_only_n',
  'evidence_line_unasked_n',
  'evidence_line_silent_n',
  'evidence_contested_assessor_n',
  'evidence_unowned_assessor_n',
  'evidence_single_line_n',
  // The second-line population that the finding is about, with its rate.
  'second_line_joined_n',
  'second_line_clean_n',
  'second_line_gap_n',
  'second_line_clean_pct',
  // The whole cycle's evidence verdict, kept apart from the pay-authority and
  // parity verdicts because it answers a different question.
  'evidence_verdict',
  'evidence_reconciles',
  'evidence_complete',
]);

export const MERIT_EVIDENCE_CSV_DESCRIPTOR_COLUMNS = MERIT_EVIDENCE_CSV_COLUMNS;

/**
 * Fail-closed normalizer for ADR-0166's idempotency ledger. It holds nothing but
 * the record that a pay decision has ALREADY been issued one dated ask about an
 * unconsulted line, so a rescan cannot double the work. A malformed entry is
 * dropped — never repaired into a plausible-looking marker, because a repaired
 * marker would silently suppress the ask it was supposed to guard.
 */
export function normalizeMeritEvidenceMarkers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const m of arr) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    const key = typeof m.key === 'string' ? m.key.trim() : '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key: key.slice(0, 200),
      kind: (typeof m.kind === 'string' ? m.kind.trim().slice(0, 40) : '') || 'ask',
      cycleId: typeof m.cycleId === 'string' ? m.cycleId.trim().slice(0, 80) : '',
      evidenceState: typeof m.evidenceState === 'string' ? m.evidenceState.trim().slice(0, 40) : '',
      taskId: typeof m.taskId === 'string' ? m.taskId.trim().slice(0, 80) : '',
      recordedOn: isDayString(m.recordedOn) ? String(m.recordedOn).slice(0, 10) : null,
      summary: typeof m.summary === 'string' ? m.summary.trim().slice(0, 300) : '',
    });
  }
  return out.slice(-1200);
}

function isDayString(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim().slice(0, 10));
}
