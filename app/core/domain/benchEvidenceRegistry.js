/**
 * app/core/domain/benchEvidenceRegistry.js — the declared vocabulary of the
 * Cross-Line Bench-Evidence Sufficiency reading (ADR-0168, Schema v134 unchanged,
 * `#/succession?panel=evidence`, CSV scope #123).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. Marcus is on the CEO succession slate. His
 * packet says `ready now`, the evidence card says four of five signals present,
 * and the bench certificate says his seat is covered. Now ask the question an
 * auditor asks: *who said so?* Marcus spends 40% of his year on Priya's
 * programme, and the only assessor on record is Dana, his home-line manager. The
 * other two lines Marcus works on have never been asked what they saw. The
 * workspace already stores, per review, every line that was ASKED and every line
 * that ANSWERED (ADR-0147), and the readiness ledger already grades a rating
 * against behavioural evidence (`readiness.js`). Nothing has ever joined the two,
 * so a "ready now" claim for a three-line person can rest on one manager's
 * impression while the other two lines were silent, and the board reads a name.
 *
 * WHAT THIS MODULE JOINS (both halves already exist and are trusted)
 * -----------------------------------------------------------------
 *   the READINESS RATING and its evidence   `readiness.js` `assess()`
 *   the PER-LINE STEWARDSHIP STATES         `reviewStewardship.js` (ADR-0147)
 *   the LINES IN FORCE FOR THE PACKET       `periodLinesFor()` over `buildMatrix`
 *
 * The readiness rating is graded on a 90-day behavioural window. The line states
 * are stored on a REVIEW, and a review covers a stated PERIOD. So the join needs
 * one explicit, printed choice: WHICH review is the bench evidence for this
 * claim? That choice is declared below (`reviewWindow`) and printed on every row
 * — it is never inferred per person, because two claims graded against two
 * different reviews would not be comparable and the rate would be meaningless.
 *
 * THE SEVEN STATES OF ONE BENCH CLAIM'S EVIDENCE
 * ----------------------------------------------
 *   no-rating          the person holds no readiness record at all. There is no
 *                      claim to support — counted, never treated as a gap.
 *   no-review          a rating exists and no completed review covers the
 *                      declared window. The claim's line evidence is UNREADABLE,
 *                      and no neighbouring review is read in its place.
 *   contested-assessor two or more lines held the `performance` right for the
 *                      review period. The packet has no sole author.
 *   unowned-assessor   no line held it. The assessment has no entitled author.
 *   line-unasked       the review had a second line in force and that line was
 *                      never asked. THIS IS THE FINDING.
 *   line-silent        the line was asked and did not answer inside its window.
 *                      A dated human act of not answering, printed as such.
 *   home-line-only     nothing above applies but nobody but the home line
 *                      contributed, so the packet is honest to say the rating
 *                      rests on one line.
 *   corroborated       every line in force was asked, and every one answered or
 *                      declined with a reason. The strongest true word available,
 *                      and it is about the PROCEDURE, never about whether the
 *                      person is ready.
 *
 * PRECEDENCE IS DECLARED, NOT NEGOTIATED. The states are listed worst-first and
 * `benchEvidenceState()` resolves a claim to the FIRST matching state, so the
 * panel, the brief, the CSV and the rule cannot disagree about a word.
 *
 * WHAT IS NEVER BUILT
 * -------------------
 * No stored field, no collection, no migration. No per-line contribution share:
 * feedback, 1:1 notes, recognition and delegations carry a SUBJECT and no
 * authoring line (ADR-0147's own finding, restated on the panel rather than
 * papered over). No score, no rank, no rating of a person and no rating of a
 * manager: every finding is on a BENCH CLAIM and a LINE'S STATE.
 *
 * FRAMEWORK BASIS.
 *  - Evidence sufficiency for talent and succession decisions: a high-potential
 *    label must be supported by evidence drawn from the contexts the person
 *    actually works in (Silzer & Church 2009, *Strategy-Driven Talent
 *    Management*; Church & Rotolo 2013 on the criterion problem in high-
 *    potential identification).
 *  - Multiple-source / multi-rater assessment is only better than a single rater
 *    when the raters observe DIFFERENT work (Borman 1974; Conway 1996 on
 *    multitrait-multimethod); in a matrix the second line is a genuinely
 *    different observation context, and leaving it silent is a design defect in
 *    the assessment, not a person's shortcoming.
 *  - Structural holes and information asymmetry across a matrix (Burt 1992):
 *    the home line's view is the view that reaches the evaluator.
 *  - Procedural justice in evaluation (Leventhal 1980; Tyler & Lind 1992):
 *    consistency and correctability of the process are part of whether it is
 *    fair, and an unconsulted line is a procedural defect the person may see
 *    named.
 *  - Statistical disclosure control, house convention (ADR-0126/0139): a figure
 *    that cannot be supported is BLANK with a printed reason, never a zero.
 *
 * Zero imports: `schema.js` may read this file without a cycle.
 */

export const BENCH_EVIDENCE_ENGINE_VERSION = 'bench-evidence/1';

export const BENCH_EVIDENCE_RULE_ID = 'RULE-BNE-01';

/** The event the rule fires on, and the explicit rescan the operator may run. */
export const BENCH_EVIDENCE_SCAN_EVENT = 'succession.evidence.scan';

/* ------------------------------------------------------------- conventions */

/**
 * Declared conventions. There are deliberately NO workspace settings for them:
 * an evidence floor that can be lowered until the reading agrees with the reader
 * is not a check.
 */
export const BENCH_EVIDENCE_CONVENTIONS = Object.freeze({
  /**
   * Which review supplies the line evidence for a bench claim, relative to each
   * rating's own 90-day evidence window. `nearest-before` reads the LATEST
   * completed review whose period ENDS on or before the last day of the rating's
   * window, and nothing else. Stated as a value so every surface prints the rule
   * it applied.
   */
  reviewWindow: 'nearest-before',
  /**
   * The readiness engine's own evidence window, restated so this join prints the
   * number it used instead of a remembered one. `readiness.js` also declares 90;
   * the focused suite asserts the two are equal.
   */
  ratingWindowDays: 90,
  /** Minimum claims in a cohort before a percentage is printed. */
  cellFloor: 3,
  /** The right a line must hold to be the ASSESSOR of the review. */
  right: 'performance',
  /** Even counts use the LOWER median where a median is printed. */
  median: 'lower',
});

export const BENCH_EVIDENCE_FLOOR = BENCH_EVIDENCE_CONVENTIONS.cellFloor;

/** Bounded reads: the panel and the export never render an unbounded table. */
export const BENCH_EVIDENCE_LIMITS = Object.freeze({
  /** Claim rows carried on the panel/brief before the rest are counted. */
  rows: 40,
  /** Findings carried before the remainder is counted (never silently dropped). */
  findings: 60,
  /** Marker rows kept by the rule's idempotency ledger. */
  markers: 400,
});

/* ------------------------------------------------------------------ states */

export const BENCH_EVIDENCE_STATES = Object.freeze([
  {
    key: 'no-rating',
    rank: 0,
    label: 'No bench claim',
    tone: 'neutral',
    open: false,
    detail: 'The person holds no readiness record, so there is no bench claim to support and none is invented.',
  },
  {
    key: 'no-review',
    rank: 1,
    label: 'No readable review',
    tone: 'bad',
    open: true,
    detail: 'A bench claim exists and no completed review covers its evidence window. The claim\'s line evidence cannot be read, and no neighbouring review is substituted.',
  },
  {
    key: 'contested-assessor',
    rank: 2,
    label: 'Contested assessor',
    tone: 'bad',
    open: true,
    detail: 'Two or more lines held the performance right for the review period, so the packet has no sole author. The claim is not attributed to one line.',
  },
  {
    key: 'unowned-assessor',
    rank: 3,
    label: 'Unowned assessor',
    tone: 'bad',
    open: true,
    detail: 'No line held the performance right for the review period, so the assessment has no entitled author.',
  },
  {
    key: 'line-unasked',
    rank: 4,
    label: 'Line never asked',
    tone: 'bad',
    open: true,
    detail: 'A second line was in force during the review period and was never asked what it saw. This is a defect in the evidence, not a finding about the person.',
  },
  {
    key: 'line-silent',
    rank: 5,
    label: 'Line asked, silent',
    tone: 'warn',
    open: true,
    detail: 'The second line was asked and did not answer inside its window. A dated act of not answering, printed as such and never as "never asked".',
  },
  {
    key: 'line-awaiting',
    rank: 6,
    label: 'Line asked, window open',
    tone: 'warn',
    open: true,
    detail: 'The second line was asked and its declared window has not closed yet. The question is OPEN — which is a different fact from a silence and from "never asked", and is re-derived on every render rather than frozen as a gap.',
  },
  {
    key: 'home-line-only',
    rank: 7,
    label: 'Home line only',
    tone: 'warn',
    open: true,
    detail: 'The packet was properly run, but every answer on record came from the home line, so the bench claim rests on one line\'s observation.',
  },
  {
    key: 'corroborated',
    rank: 8,
    label: 'Corroborated',
    tone: 'good',
    open: false,
    detail: 'Every line in force was asked, and every one answered or declined with a stated reason. This says the PROCEDURE was complete — never that the person is ready.',
  },
  {
    key: 'single-line',
    rank: 9,
    label: 'Single line',
    tone: 'neutral',
    open: false,
    detail: 'The person held one reporting line for the whole review period, so there is no second line that could have been missed.',
  },
]);

export const BENCH_EVIDENCE_STATE_KEYS = Object.freeze(BENCH_EVIDENCE_STATES.map((s) => s.key));

/** States whose evidence gap is still open — the rule acts on exactly these. */
export const BENCH_EVIDENCE_OPEN_STATES = Object.freeze([
  'no-review', 'contested-assessor', 'unowned-assessor', 'line-unasked', 'line-silent', 'line-awaiting', 'home-line-only',
]);

export function benchEvidenceState(key) {
  return BENCH_EVIDENCE_STATES.find((s) => s.key === key) || null;
}

/* ---------------------------------------------------------------- verdicts */

export const BENCH_EVIDENCE_VERDICTS = Object.freeze([
  { key: 'no-claim', label: 'No bench claim', tone: 'neutral',
    detail: 'No readiness record exists, so no evidence claim is made and none is refused.' },
  { key: 'single-chain', label: 'Single line', tone: 'neutral',
    detail: 'Every claim in scope rests on a person who held one reporting line. Nothing about a second line is claimed.' },
  { key: 'gap', label: 'Evidence gap', tone: 'bad',
    detail: 'At least one bench claim rests on a packet whose line evidence was incomplete.' },
  { key: 'thin', label: 'Procedure incomplete but supported', tone: 'warn',
    detail: 'No unasked or silent line, but the home line is the only contributor on at least one claim.' },
  { key: 'corroborated', label: 'Corroborated', tone: 'good',
    detail: 'Every line in force was asked and answered or declined with a reason, on every claim in scope.' },
  { key: 'incomplete', label: 'Incomplete', tone: 'warn',
    detail: 'At least one claim could not be read at all (no review, contested or unowned assessor). No overall verdict is claimed over an unreadable population.' },
]);

export const BENCH_EVIDENCE_VERDICT_KEYS = Object.freeze(BENCH_EVIDENCE_VERDICTS.map((v) => v.key));

export function benchEvidenceVerdict(key) {
  return BENCH_EVIDENCE_VERDICTS.find((v) => v.key === key) || null;
}

/* ---------------------------------------------------------------- refusals */

/**
 * Every reason this reading may print INSTEAD of a figure. Declared as data so
 * the panel, the brief, the CSV and the rule print the same sentence.
 */
export const BENCH_EVIDENCE_REFUSALS = Object.freeze([
  { key: 'floor', text: 'Fewer than the declared floor of bench claims are in scope, so the rate is withheld rather than printed over an anecdote.' },
  { key: 'partial', text: 'At least one claim in scope could not be read, so no rate is printed over the readable part alone.' },
  { key: 'no-matrix', text: 'No person in scope held a second reporting line, so there is no cross-line reading to print.' },
  { key: 'unreadable-review', text: 'A claim\'s review could not be resolved, so its line evidence is unknown rather than assumed complete.' },
  { key: 'no-contribution-share', text: 'No per-line contribution share is computed: feedback, 1:1 notes, recognition and delegations record who the evidence is about and never which line produced it.' },
  { key: 'no-person-score', text: 'No person and no manager is scored, ranked or rated by this reading. The subject is a bench claim and a line\'s state.' },
]);

/* ----------------------------------------------------------------- exports */

/**
 * The columns this join APPENDS to CSV scope #123 (`succession-bench-evidence`).
 * Counts only — no person, no name, no manager id, no rating, no review id.
 */
export const BENCH_EVIDENCE_CSV_COLUMNS = Object.freeze([
  'evidence_window_start',
  'evidence_window_end',
  'evidence_review_rule',
  'evidence_reviews_read_n',
  'evidence_claims_n',
  'evidence_claims_read_n',
  'evidence_claims_matrix_n',
  'evidence_claims_single_n',
  'evidence_contested_n',
  'evidence_unowned_n',
  'evidence_unreadable_n',
  'evidence_line_unasked_n',
  'evidence_line_silent_n',
  'evidence_line_awaiting_n',
  'evidence_home_line_only_n',
  'evidence_corroborated_n',
  'evidence_second_line_n',
  'evidence_second_line_clean_n',
  'evidence_second_line_gap_n',
  'evidence_second_line_clean_pct',
  'evidence_second_line_pct_withheld',
  'evidence_verdict',
  'evidence_reconciles',
  'evidence_complete',
]);

/* ------------------------------------------------------------- frameworks */

export const BENCH_EVIDENCE_FRAMEWORKS = Object.freeze([
  {
    key: 'evidence-sufficiency',
    label: 'Evidence sufficiency for talent decisions',
    source: 'Silzer & Church 2009; Church & Rotolo 2013',
    applied: 'A "ready now" claim must be supported by evidence gathered in the contexts the person actually works in. Where the second line was never asked, the packet says so instead of quietly treating one rater as the whole picture.',
  },
  {
    key: 'multi-rater-different-context',
    label: 'Multi-source assessment is only additive when sources observe different work',
    source: 'Borman 1974; Conway 1996 (multitrait–multimethod)',
    applied: 'The matrix makes the second line a genuinely different observation context. Its silence is not a tie to be averaged away; it is a hole in the instrument, and it is printed as one.',
  },
  {
    key: 'structural-holes',
    label: 'Structural holes and evaluator information asymmetry',
    source: 'Burt 1992',
    applied: 'The home line\'s view is the view that reaches the evaluator. A bench claim read only from that side is a claim read across a hole, and the rate of such claims is reported.',
  },
  {
    key: 'procedural-justice',
    label: 'Procedural justice in evaluation',
    source: 'Leventhal 1980; Tyler & Lind 1992',
    applied: 'Consistency and correctability of the procedure are part of whether it is fair. An unconsulted line is a procedural defect the person may see named, without any judgement of them.',
  },
  {
    key: 'disclosure-control',
    label: 'Disclosure control with printed refusals',
    source: 'House convention, ADR-0126 / ADR-0139',
    applied: 'A rate below the declared floor, or over a partially readable population, is BLANK with its reason in its own column — never zero and never a narrowed percentage.',
  },
]);

/* ------------------------------------------------------------- normalizer */

const isDayString = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim().slice(0, 10));

/**
 * The rule's idempotency ledger. A malformed marker is DROPPED (with no repair),
 * so the ask it guarded can be issued again rather than being silently
 * suppressed by a plausible-looking row.
 */
export function normalizeBenchEvidenceMarkers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const m of arr) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    const key = typeof m.key === 'string' ? m.key.trim() : '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key: key.slice(0, 240),
      kind: (typeof m.kind === 'string' ? m.kind.trim().slice(0, 40) : '') || 'ask',
      personId: typeof m.personId === 'string' ? m.personId.trim().slice(0, 80) : '',
      seat: typeof m.seat === 'string' ? m.seat.trim().slice(0, 160) : '',
      evidenceState: typeof m.evidenceState === 'string' ? m.evidenceState.trim().slice(0, 40) : '',
      taskId: typeof m.taskId === 'string' ? m.taskId.trim().slice(0, 80) : '',
      recordedOn: isDayString(m.recordedOn) ? String(m.recordedOn).slice(0, 10) : null,
      summary: typeof m.summary === 'string' ? m.summary.trim().slice(0, 300) : '',
    });
  }
  return out.slice(-BENCH_EVIDENCE_LIMITS.markers);
}
