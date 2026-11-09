/**
 * app/core/domain/reviewStewardshipRegistry.js — the declared vocabulary of
 * Matrix Multi-Line Review Stewardship (ADR-0147, Schema v122).
 *
 * THE DUTY. A performance review is the one leadership act that is a claim about
 * a person. In a single chain the question is trivial: the manager writes it. In
 * a matrix the SAME person is delivered by a project manager every day, steered
 * technically by a practice lead, and paid by the functional manager — and today
 * `reviews.js` assembles the packet from `personId` alone. It gathers that
 * person's goals, feedback and delegations whatever line they came from, then
 * invites ONE assessment, silently treated as the home line's. Three failures
 * follow, and every one of them is invisible:
 *
 *   1. A second line's contribution is IN THE PACKET but NOBODY is asked for it,
 *      so a project manager's strongest evidence and a functional manager's
 *      assessment never meet.
 *   2. A line's input can be MISSING ENTIRELY and the packet still completes,
 *      reading as a complete account of the period.
 *   3. The `performance` stewardship right can be CONTESTED (two managers
 *      declared it) or UNOWNED, and the review completes anyway — so the app
 *      records an assessment without ever naming who was entitled to make it.
 *
 * WHAT THIS MODULE IS. One bounded read model that puts the matrix around the
 * existing review pipeline: which lines the person sat on during the period,
 * which of those lines were asked, which answered or declined, which are late,
 * and who holds the `performance` right over that period and whether it is
 * contested. It adds no second review register and no new score.
 *
 * WHAT IT IS NEVER ALLOWED TO DO (Bulletproof Reliability Mandate)
 * ---------------------------------------------------------------
 *  - It never COUNTS a person twice. One row per line, one person, and every
 *    total is a count of LINES or of PEOPLE — never of line-people.
 *  - It never INFERS a contribution. `feedback`, `recognition`, `oneOnOnes` and
 *    `delegations` record who an item is ABOUT, never which line produced it, so
 *    a per-line contribution share would be a fabricated split. The engine
 *    prints that limit instead of inventing the number.
 *  - It never treats an unanswered line as a zero contribution. It reads
 *    `unasked` / `asked` / `overdue` and is named as such.
 *  - It never picks one of several holders of the `performance` right. A contest
 *    prints every holder and refuses a sole-assessor claim.
 *  - It is INERT in a single-chain workspace: no second line, no second row, no
 *    warning, and every existing review behaves exactly as it did before.
 */

export const REVIEW_STEWARDSHIP_ENGINE_VERSION = 'review-stewardship-2026.11-v1';

/** The one rule this module adds to the shared spine. */
export const REVIEW_STEWARDSHIP_RULE_ID = 'RULE-SRV-01';

/**
 * Three declared events, each one human act:
 *   REQUEST  a manager of a line asks that line for its input into one review;
 *   ANSWER   that line's holder states, in their own words, what the line saw of
 *            the person in the period — or declines with a reason;
 *   COMPLETE the existing review completion, which is the rule's only trigger.
 * Requests and answers live ON the review row, because they are about THIS
 * review and must freeze with it. No separate collection exists.
 */
export const REVIEW_STEWARDSHIP_EVENTS = Object.freeze({
  REQUEST: 'review.stewardship.requested',
  ANSWER: 'review.stewardship.answered',
  COMPLETE: 'review.completed',
});

/** An explicit operator retry for work a cap deferred. Changes no declaration. */
export const REVIEW_STEWARDSHIP_SCAN_EVENT = 'review.stewardship.scan';

/**
 * The seven states a line can be in for one review period. Printed, never
 * collapsed: "we asked and got an answer", "we asked and heard nothing", "we
 * asked and it is late", "they said nothing to add", "nobody asked", "this line
 * IS the assessor" and "this line did not exist yet" are seven different facts
 * about the organisation, and each one implies a different next action.
 */
export const REVIEW_STEWARDSHIP_STATES = Object.freeze({
  /**
   * The line IS the assessor: it holds the performance right and nobody else
   * does, so the packet is that manager's own act. It is not "never asked" —
   * asking the person who writes the assessment for input into it is not a
   * question. Printed as its own state so a reader cannot mistake the assessor
   * for a line that was skipped.
   */
  assessor: 'assessor',
  answered: 'answered',
  declined: 'declined',
  asked: 'asked',
  overdue: 'overdue',
  unasked: 'unasked',
  /**
   * The line did not exist inside the review period at all. Not a gap and not a
   * zero: a claim about a period it was not part of would be false either way.
   */
  excluded: 'excluded',
});

export const REVIEW_STEWARDSHIP_STATE_LABELS = Object.freeze({
  assessor: 'Is the assessor',
  answered: 'Answered',
  declined: 'Declined, with reason',
  asked: 'Asked, within window',
  overdue: 'Asked, overdue',
  unasked: 'Never asked',
  excluded: 'Outside the period',
});

export const REVIEW_STEWARDSHIP_STATE_TONES = Object.freeze({
  assessor: 'good',
  answered: 'good',
  declined: 'neutral',
  asked: 'warn',
  overdue: 'bad',
  unasked: 'caution',
  excluded: 'neutral',
});

/** A line is ACCOUNTED FOR when a human act has settled it. Overdue/unasked are not. */
export const REVIEW_STEWARDSHIP_SETTLED_STATES = Object.freeze([
  REVIEW_STEWARDSHIP_STATES.answered,
  REVIEW_STEWARDSHIP_STATES.declined,
]);

/**
 * Overall verdict for one review packet. These are SEVEN different claims and the
 * panel prints the selected one on its own line, with the counts beside it,
 * because a single reassuring word ("complete") would collapse them.
 *
 * `severity` is the sort order used by the board and the rule; lower is worse.
 * Precedence is declared HERE so the rule, the panel and the CSV cannot disagree.
 */
export const REVIEW_STEWARDSHIP_VERDICTS = Object.freeze([
  { key: 'contested-assessor', label: 'Contested assessor', severity: 0, tone: 'bad', open: true,
    detail: 'Two or more lines declared the performance-assessment right for this period. The packet cannot name a sole assessor until that is resolved on the Matrix accountability panel.' },
  { key: 'unowned-assessor', label: 'No declared assessor', severity: 1, tone: 'bad', open: true,
    detail: 'No line in force during the period held the performance-assessment right. An assessment with no entitled author is a record nobody can defend.' },
  { key: 'overdue-input', label: 'Line input asked and late', severity: 2, tone: 'bad', open: true,
    detail: 'A line was asked for input and the declared answer window has passed with no answer. The packet is not waiting on silence; it is late.' },
  { key: 'unasked-line', label: 'Second line never asked', severity: 3, tone: 'warn', open: true,
    detail: 'The person sat on a second reporting line during the period and nobody asked that line for input.' },
  { key: 'awaiting-input', label: 'Line input still within its window', severity: 4, tone: 'warn', open: true,
    detail: 'A line was asked for input and the declared answer window has not yet closed. Nothing is late; nothing is settled either. A packet cannot be read as unanimous while an ask is outstanding.' },
  { key: 'settled', label: 'All lines settled', severity: 5, tone: 'good', open: false,
    detail: 'Every line the person sat on during the period is settled — answered, or declined with a stated reason — and exactly one line holds the assessment right.' },
  { key: 'single-chain', label: 'Single line — nothing to reconcile', severity: 6, tone: 'neutral', open: false,
    detail: 'The person reported to one manager for the whole period. The ordinary single-chain review applies; no matrix step is required.' },
]);

export const REVIEW_STEWARDSHIP_VERDICT_KEYS = Object.freeze(REVIEW_STEWARDSHIP_VERDICTS.map((v) => v.key));
const VERDICT_BY_KEY = new Map(REVIEW_STEWARDSHIP_VERDICTS.map((v) => [v.key, v]));

export function reviewStewardshipVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '').trim()) || null;
}

/** Bound on stored requests/answers per review. The cap is counted, never silent. */
export const REVIEW_STEWARDSHIP_LIMITS = Object.freeze({
  /** Asks per review (one live per line, plus re-asks after a re-declaration). */
  requests: 24,
  /** Answers per review (one per line; a second answer for a line is refused). */
  answers: 24,
  /** Characters in an answer — a paragraph, not a report. */
  answerChars: 4000,
  /** Characters in a decline reason. */
  reasonChars: 400,
  /** Characters in the ask's own context line. */
  noteChars: 600,
  /** Rows the board renders before the remainder is counted only. */
  board: 40,
  /** Rule idempotency markers retained for this module. */
  markers: 400,
});

/**
 * The right that governs this module, named in the matrix vocabulary rather than
 * invented here: the review's assessor question IS the matrix's `performance`
 * right. Declaring it on a line is what makes that line's manager entitled.
 */
export const REVIEW_STEWARDSHIP_RIGHT = 'performance';

/** Bound on the declared answer window, in whole days. */
export const REVIEW_STEWARDSHIP_BOUNDS = Object.freeze({
  answerDays: Object.freeze([1, 60]),
});

export const REVIEW_STEWARDSHIP_DEFAULTS = Object.freeze({
  answerDays: 10,
  /** Open `#/reviews?panel=stewardship` to the board rather than the first packet. */
  boardFirst: true,
});
