/**
 * app/core/domain/benchRegressionRegistry.js — the declared vocabulary of the
 * Bench-Claim Evidence Regression Watch (ADR-0172, Schema v137,
 * `#/succession?panel=evidence` § regression, CSV scope #127).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. A director owns the succession slate for
 * her span. One claim on it — Marcus for VP Engineering, `ready now` — was
 * `corroborated` in June: every line Marcus worked on was asked, and every one
 * answered. In December the same claim reads `line-unasked`: the programme line
 * was never asked what it saw. The RATING never moved. The point-in-time
 * register (ADR-0168) reads the December state correctly and says nothing about
 * June, because it stores nothing. Nobody is told that the ground moved under a
 * seat the board may be about to fill. This watch exists to tell them — once,
 * dated, with both windows and both states printed.
 *
 * WHAT IS STORED, AND WHAT IS NOT
 * --------------------------------
 * One dated READING per bench claim per completed review (`benchRegressionReadings`):
 * the claim, the review, the review's window, the evidence state resolved
 * against it through the SAME precedence ADR-0168 declares (there is one
 * resolver, `resolveClaimEvidenceState`, so the two modules cannot disagree),
 * the line counts, the readiness rating at freeze time, and the freeze day. A
 * reading is a claim state, never a person score: no manager is named in it, no
 * assessment is graded by it.
 *
 * What is NEVER stored: the comparison. A pair verdict (`regressed`,
 * `improved`, `stable`, …) is re-derived on every read from the frozen previous
 * window and the LATER window read LIVE from today's record — because the later
 * window's evidence matures after it freezes (a line asked late answers late,
 * and BNE-01's own ask exists to make that happen). Comparing two frozen rows
 * would alert on remediations and miss late decay; a stored verdict would be
 * the exact drift the Bulletproof Reliability Mandate forbids. The frozen later
 * reading is kept as the audit column — \"as frozen on <day>: <state>\" — proving
 * what the rule saw when it decided.
 *
 * THE ONE EXCEPTION, DECLARED. A frozen side that reads `line-awaiting` was
 * frozen while its question was still open, so it is re-read LIVE (basis
 * printed on the row). A frozen SETTLED state is history as recorded; where the
 * record has since matured under it, the row's basis says which figure is
 * frozen and which is live, and the restatement-ledger question belongs to the
 * unbuilt Session-224 discovery, not to a silent rewrite here.
 *
 * THE RATING GATE. A regression asks for attention ONLY where the readiness
 * rating the board sees has not moved: the previous window's FROZEN rating
 * against the CURRENT rating. Where they differ the pair reads `rating-moved`
 * and no ask issues — the claim is under active re-assessment, and the issued
 * ask, if any, stands as history with its snapshot.
 *
 * WHAT ASKS, AND WHAT DOES NOT
 * ------------------------------
 * Only the claim's LATEST pair can issue, only once per pair, only to the
 * manager holding the person's HOME line as of the latest review's period end
 * (ADR-0149, never today's pointer read backwards). Older regressed pairs print
 * as history — their moment passed with the window. Contested and unowned
 * assessors, unreadable reviews, single-line pairs and open questions issue
 * NOTHING and are counted: an ask addressed to nobody can never close, a
 * structural change is not a decay, and an open question is not a silence.
 *
 * FRAMEWORK BASIS.
 *  - Longitudinal consistency in evaluation (Leventhal 1980): the consistency
 *    rule applies across TIME as well as across people — a procedure that was
 *    complete and is now one line wide has changed, and the person under it may
 *    see the change named.
 *  - Evidence sufficiency for talent decisions over the decision's life
 *    (Silzer & Church 2009): a \"ready now\" claim must be supported when it is
 *    ACTED on, not only when it was written.
 *  - Statistical process control as a dated signal, not a score (Shewhart 1931;
 *    Montgomery 2012): the watch is a control chart on the EVIDENCE PROCESS —
 *    a dated out-of-band point routes a human review; it never re-rates the unit.
 *  - Statistical disclosure control, house convention (ADR-0126/0139): counts
 *    only, no rate over a population that was not chosen, refusals printed.
 *
 * Zero imports: `schema.js` may read this file without a cycle.
 */

export const BENCH_REGRESSION_ENGINE_VERSION = 'bench-regression/1';

export const BENCH_REGRESSION_RULE_ID = 'RULE-BRG-01';

/** The event the rule fires on, and the explicit rescan the operator may run. */
export const BENCH_REGRESSION_SCAN_EVENT = 'succession.regression.scan';

/* ------------------------------------------------------------- conventions */

/**
 * Declared conventions. There are deliberately NO workspace settings for them:
 * a severity ladder or a rating gate the reader can move until the watch agrees
 * with them is not a check.
 */
export const BENCH_REGRESSION_CONVENTIONS = Object.freeze({
  /**
   * Which side of a pair is history and which is read live. `frozen-previous`
   * uses the previous window's FROZEN reading; the later window is resolved
   * live from today's record so late answers land where the operator looks.
   * The later window's frozen reading is printed beside it as the audit column.
   */
  comparison: 'frozen-previous-vs-live-later',
  /**
   * How a frozen `line-awaiting` side is treated: its question was still open
   * when frozen, so it is re-read live with the basis printed. A frozen settled
   * state is history as recorded and is never re-read.
   */
  frozenOpenRule: 're-read-live',
  /**
   * The rating gate compares the previous window's FROZEN rating with the
   * CURRENT readiness rating. A rating moved after the regression reads
   * `rating-moved`; the issued ask stands as history.
   */
  ratingGate: 'frozen-previous-vs-current',
  /**
   * Only the claim's latest consecutive pair can issue an ask, and only once
   * per pair. Older regressed pairs print as history.
   */
  askScope: 'latest-pair-only',
  /** Consecutive reviews order by period end, then completion, then id. */
  pairOrder: 'period-end,completed-at,id',
  /** The right a line must hold to be the ASSESSOR of a review (ADR-0147). */
  right: 'performance',
  /** Days the home-line manager gets to re-ground the claim. */
  taskDays: 14,
});

export const BENCH_REGRESSION_LIMITS = Object.freeze({
  /** Pair rows carried on the panel/brief before the rest are counted. */
  rows: 40,
  /** Findings carried before the remainder is counted (never silently dropped). */
  findings: 60,
  /** Frozen readings kept (oldest beyond the bound are refused, never deleted). */
  readings: 4000,
  /** Marker rows kept by the rule's idempotency ledger. */
  markers: 400,
});

/* ---------------------------------------------------------------- severity */

/**
 * The severity ladder for COMPARABLE evidence states, worst first. Declared
 * here — not derived from ADR-0168's display ranks — so a re-ordering of the
 * register's table can never silently change what counts as a regression.
 * `line-awaiting`, `contested-assessor`, `unowned-assessor`, `no-review` and
 * `single-line` are NOT on this ladder: an open question, a declaration
 * problem, an unreadable review and a structural shape are different facts from
 * a decay, and each has its own verdict below.
 */
export const BENCH_REGRESSION_SEVERITY = Object.freeze({
  'line-unasked': 0,
  'line-silent': 1,
  'home-line-only': 2,
  corroborated: 3,
});

export const BENCH_REGRESSION_COMPARABLE_STATES = Object.freeze([
  'line-unasked',
  'line-silent',
  'home-line-only',
  'corroborated',
]);

export function benchRegressionSeverity(stateKey) {
  const rank = BENCH_REGRESSION_SEVERITY[stateKey];
  return Number.isInteger(rank) ? rank : null;
}

/* ---------------------------------------------------------------- verdicts */

/**
 * The verdicts of ONE consecutive pair, in DECLARED PRECEDENCE (first match
 * wins, so the panel, the brief, the CSV and the rule cannot disagree).
 */
export const BENCH_REGRESSION_VERDICTS = Object.freeze([
  {
    key: 'uncomparable',
    rank: 0,
    label: 'Cannot be compared',
    tone: 'warn',
    asks: false,
    detail: 'Either window cannot be read (the previous window was never frozen, its review is gone, or a review’s lines do not resolve). No trend is printed over an unreadable pair — the reason is printed instead.',
  },
  {
    key: 'open',
    rank: 1,
    label: 'Latest question still open',
    tone: 'warn',
    asks: false,
    detail: 'The later window’s line question is still inside its declared window. An open question is not a silence and not a decay; the pair is re-derived on every render.',
  },
  {
    key: 'unresolved',
    rank: 2,
    label: 'Assessor unresolved',
    tone: 'warn',
    asks: false,
    detail: 'A contested or unowned assessor sits on either window. That is a declaration problem the matrix panels already name; an ask addressed to a contested set can never close.',
  },
  {
    key: 'structure-changed',
    rank: 3,
    label: 'Structure changed',
    tone: 'neutral',
    asks: false,
    detail: 'One window is single-line and the other is not. The person’s reporting shape changed between windows — a structural fact, not an evidence decay. A fresh gap on a new line is already covered by RULE-BNE-01’s own ask.',
  },
  {
    key: 'stable-single',
    rank: 4,
    label: 'Single line throughout',
    tone: 'neutral',
    asks: false,
    detail: 'Both windows rest on one reporting line. There is no second line that could have decayed, and nothing is claimed about one.',
  },
  {
    key: 'regressed',
    rank: 5,
    label: 'Evidence regressed',
    tone: 'bad',
    asks: true,
    detail: 'The later window’s evidence state is strictly worse than the previous window’s frozen state, and the readiness rating has not moved since. The ground moved under an unchanged claim: the ONE verdict that issues an ask.',
  },
  {
    key: 'rating-moved',
    rank: 6,
    label: 'Evidence weaker, rating moved',
    tone: 'warn',
    asks: false,
    detail: 'The later window reads worse, but the current readiness rating differs from the previous window’s frozen rating. The claim is under active re-assessment; no ask issues on top of a manager who already re-opened it.',
  },
  {
    key: 'improved',
    rank: 7,
    label: 'Evidence improved',
    tone: 'good',
    asks: false,
    detail: 'The later window’s evidence state is strictly better than the previous window’s frozen state. Printed and counted; an improvement issues no work.',
  },
  {
    key: 'stable',
    rank: 8,
    label: 'Evidence stable',
    tone: 'neutral',
    asks: false,
    detail: 'Both windows read the same comparable state. Stability is a finding about the procedure being unchanged — never a claim that the evidence is sufficient.',
  },
]);

export const BENCH_REGRESSION_VERDICT_KEYS = Object.freeze(BENCH_REGRESSION_VERDICTS.map((v) => v.key));

export function benchRegressionVerdict(key) {
  return BENCH_REGRESSION_VERDICTS.find((v) => v.key === key) || null;
}

/* ------------------------------------------------------ workspace verdicts */

export const BENCH_REGRESSION_BOARD_VERDICTS = Object.freeze([
  { key: 'no-claim', label: 'No bench claim', tone: 'neutral',
    detail: 'No readiness record names a person currently on the roster, so there is no claim to watch and none is invented.' },
  { key: 'single-window', label: 'Watching — no pair yet', tone: 'neutral',
    detail: 'Claims are watched but none has two completed reviews yet. A regression needs consecutive windows; a single window is a starting point, not a trend.' },
  { key: 'incomplete', label: 'Incomplete', tone: 'warn',
    detail: 'At least one pair cannot be compared. No clean bill is printed over a population that was not fully readable — the same precedence the point-in-time register applies.' },
  { key: 'regressed', label: 'Evidence regressed', tone: 'bad',
    detail: 'At least one claim’s latest pair reads regressed: weaker evidence under an unchanged rating. Each names its two windows, its two states and its rating.' },
  { key: 'watching', label: 'Watching — nothing regressed', tone: 'good',
    detail: 'Every comparable latest pair is stable or improved, and every pair was readable. This says the procedure held — never that the evidence is sufficient.' },
]);

export function benchRegressionBoardVerdict(key) {
  return BENCH_REGRESSION_BOARD_VERDICTS.find((v) => v.key === key)
    || BENCH_REGRESSION_BOARD_VERDICTS[0];
}

/* ---------------------------------------------------------------- refusals */

export const BENCH_REGRESSION_REFUSALS = Object.freeze([
  { key: 'previous-unfrozen', text: 'The previous window has no frozen reading (the watch did not exist or the freeze was deferred when its review completed), so the pair cannot be compared. History is never reconstructed live.' },
  { key: 'previous-unresolvable', text: 'The previous window’s review record is gone, so its frozen reading names a review that cannot be re-checked. The pair is refused rather than trusted on the frozen row alone.' },
  { key: 'unreadable-window', text: 'A window’s reporting lines do not resolve, so its evidence state is unknown rather than assumed complete — and a trend over an unknown is refused.' },
  { key: 'single-window-claim', text: 'A claim with one completed review is watched, not compared. The first window is the baseline the second will be read against.' },
  { key: 'no-rate', text: 'No regression rate is printed. A regression is a dated event on a named claim, not a proportion — and a percentage over a population that was not chosen would be the anecdote the house conventions forbid.' },
  { key: 'no-person-score', text: 'No person and no manager is scored, ranked or rated by this watch. The subject is a bench claim, two evidence windows and whether the ground moved.' },
]);

/* ----------------------------------------------------------------- exports */

/**
 * The columns of CSV scope #127 (`succession-bench-regression`). Counts only —
 * no person, no name, no manager id, no seat, no rating, no review id, no date
 * below the window grain, no free text.
 */
export const BENCH_REGRESSION_CSV_COLUMNS = Object.freeze([
  'regression_read_on',
  'regression_comparison',
  'regression_rating_gate',
  'regression_claims_n',
  'regression_watched_n',
  'regression_paired_n',
  'regression_pairs_n',
  'regression_pairs_latest_n',
  'regression_regressed_n',
  'regression_regressed_latest_n',
  'regression_rating_moved_n',
  'regression_improved_n',
  'regression_stable_n',
  'regression_stable_single_n',
  'regression_structure_changed_n',
  'regression_unresolved_n',
  'regression_open_n',
  'regression_uncomparable_n',
  'regression_asks_issued_n',
  'regression_verdict',
  'regression_reconciles',
  'regression_complete',
]);

/* ------------------------------------------------------------- frameworks */

export const BENCH_REGRESSION_FRAMEWORKS = Object.freeze([
  {
    key: 'longitudinal-consistency',
    label: 'Longitudinal consistency in evaluation',
    source: 'Leventhal 1980 (procedural justice, consistency rule)',
    applied: 'Consistency applies across time as well as across people: a procedure that gathered every line in June and one line in December has changed, and the change is named on the claim — without judging the person under it.',
  },
  {
    key: 'evidence-over-decision-life',
    label: 'Evidence sufficiency over the decision’s life',
    source: 'Silzer & Church 2009 (Strategy-Driven Talent Management)',
    applied: 'A “ready now” claim must be supported when it is ACTED on, not only when it was written. The watch compares the window the board is about to act on with the window that came before it.',
  },
  {
    key: 'control-chart-signal',
    label: 'A control-chart signal, not a score',
    source: 'Shewhart 1931; Montgomery 2012 (statistical process control)',
    applied: 'The watch is a control chart on the EVIDENCE PROCESS: a dated out-of-band point routes a human review of the procedure. It never re-rates the claim and never rates a person.',
  },
  {
    key: 'frozen-history-live-question',
    label: 'Frozen history against a live question',
    source: 'House convention (ADR-0155/0156 frozen-authority discipline)',
    applied: 'The previous window is frozen history — never reconstructed, never rewritten. The latest window is read live so late evidence lands. Each figure’s basis is printed beside it.',
  },
  {
    key: 'disclosure-control',
    label: 'Disclosure control with printed refusals',
    source: 'House convention, ADR-0126 / ADR-0139',
    applied: 'Counts only; no rate over an unchosen population; an unreadable pair is refused with its reason in its own field — never dropped and never zero.',
  },
]);

/* ------------------------------------------------------------- normalizers */

const isDayString = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim().slice(0, 10));

const KNOWN_EVIDENCE_STATES = new Set([
  'no-rating', 'no-review', 'contested-assessor', 'unowned-assessor', 'line-unasked',
  'line-silent', 'line-awaiting', 'home-line-only', 'corroborated', 'single-line',
]);

const KNOWN_RATINGS = new Set(['ready-now', 'ready-later', 'not-ready']);

/**
 * Fail-closed normalizer for `benchRegressionReadings`. A frozen reading is a
 * dated fact; a malformed row is DROPPED (never repaired), because a repaired
 * \"previous window\" would be a history nobody recorded. Deduplicated by
 * (claim, review): the first well-formed row wins and later duplicates are
 * dropped, so a hand-edited file cannot stack two histories under one window.
 */
export function normalizeBenchRegressionReadings(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of arr) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const claimId = typeof row.claimId === 'string' ? row.claimId.trim().slice(0, 160) : '';
    const personId = typeof row.personId === 'string' ? row.personId.trim().slice(0, 80) : '';
    const seat = typeof row.seat === 'string' ? row.seat.trim().slice(0, 160) : '';
    const reviewId = typeof row.reviewId === 'string' ? row.reviewId.trim().slice(0, 80) : '';
    const evidenceState = typeof row.evidenceState === 'string' ? row.evidenceState.trim().slice(0, 40) : '';
    const rating = typeof row.rating === 'string' ? row.rating.trim().slice(0, 40) : '';
    if (!claimId || !personId || !seat || !reviewId) continue;
    if (!KNOWN_EVIDENCE_STATES.has(evidenceState)) continue;
    if (!KNOWN_RATINGS.has(rating)) continue;
    const key = `${claimId}|${reviewId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 500 ? v : 0);
    out.push({
      claimId,
      personId,
      seat,
      reviewId,
      windowStart: isDayString(row.windowStart) ? String(row.windowStart).slice(0, 10) : null,
      windowEnd: isDayString(row.windowEnd) ? String(row.windowEnd).slice(0, 10) : null,
      evidenceState,
      lineN: count(row.lineN),
      secondaryLineN: count(row.secondaryLineN),
      unaskedLinesN: count(row.unaskedLinesN),
      silentLinesN: count(row.silentLinesN),
      awaitingLinesN: count(row.awaitingLinesN),
      answeredLinesN: count(row.answeredLinesN),
      declinedLinesN: count(row.declinedLinesN),
      rating,
      ratingUpdatedOn: isDayString(row.ratingUpdatedOn) ? String(row.ratingUpdatedOn).slice(0, 10) : null,
      frozenOn: isDayString(row.frozenOn) ? String(row.frozenOn).slice(0, 10) : null,
      frozenBy: typeof row.frozenBy === 'string' ? row.frozenBy.trim().slice(0, 40) : '',
    });
  }
  return out.slice(-BENCH_REGRESSION_LIMITS.readings);
}

/**
 * The rule's idempotency ledger. A malformed marker is DROPPED (with no
 * repair), so the ask it guarded can be issued again rather than being
 * silently suppressed by a plausible-looking row. The marker carries the pair
 * snapshot — both windows, both states, both ratings — so the issued ask
 * proves it was true when it was written.
 */
export function normalizeBenchRegressionMarkers(raw) {
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
      prevReviewId: typeof m.prevReviewId === 'string' ? m.prevReviewId.trim().slice(0, 80) : '',
      latestReviewId: typeof m.latestReviewId === 'string' ? m.latestReviewId.trim().slice(0, 80) : '',
      prevState: typeof m.prevState === 'string' ? m.prevState.trim().slice(0, 40) : '',
      latestState: typeof m.latestState === 'string' ? m.latestState.trim().slice(0, 40) : '',
      rating: typeof m.rating === 'string' ? m.rating.trim().slice(0, 40) : '',
      taskId: typeof m.taskId === 'string' ? m.taskId.trim().slice(0, 80) : '',
      recordedOn: isDayString(m.recordedOn) ? String(m.recordedOn).slice(0, 10) : null,
      summary: typeof m.summary === 'string' ? m.summary.trim().slice(0, 300) : '',
    });
  }
  return out.slice(-BENCH_REGRESSION_LIMITS.markers);
}
