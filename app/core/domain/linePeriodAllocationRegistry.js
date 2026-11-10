/**
 * app/core/domain/linePeriodAllocationRegistry.js — the declared vocabulary of
 * the Matrix Line Period-Allocation Ledger (ADR-0158, Schema v129 unchanged,
 * `#/matrix?panel=allocation`, CSV scope #119).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. "The quarter closed. Priya's line ran four
 * months of it at 40% of Sam and the last two at 15% after the retune. Every
 * roll-up in this product charges Sam's project line at ONE number — the one on
 * the declaration TODAY — so the budget read, the capacity read and the merit
 * read all price the quarter at 15%, the 40% months are charged nowhere, and a
 * mid-quarter retune silently re-priced the whole period the day it happened.
 * I cannot reconcile what the quarter consumed to what the quarter was charged."
 *
 * THAT IS THE GAP NO OTHER LINE MODULE CLOSES.
 *
 *   ADR-0140 (the ledger)     keeps ONE share per line, read for TODAY. It is
 *                             right for the live roll-up and wrong for any
 *                             period that contains a change.
 *   ADR-0142 (budget span)    reads a point-in-time envelope position per
 *                             currency — money on a day, not capacity over a
 *                             window.
 *   ADR-0154/0155 (merit)     read a pay decision on its effective date — one
 *                             day, correctly, and deliberately not a period.
 *   ADR-0157 (re-affirmation) asks whether a line CONTINUES. It never asks
 *                             what the line CONSUMED while it ran.
 *
 * The store already holds what a period read needs: each declaration carries
 * its own window (`fromISO`/`toISO`) and the bounded in-row history of every
 * allocation change (ADR-0140: "the previous value stays on the row it
 * replaced, so the register can answer 'what did we agree last quarter'
 * without a second table"). Nothing ever answered that question. This module
 * does, and it refuses the answer wherever the retained record cannot support
 * it.
 *
 * THE UNIT IS THE SHARE-DAY. A share is whole hundredths of a person; a period
 * is whole days; their product is an exact integer — hundredths-of-a-person
 * days — and every average this ledger prints is that integer numerator over
 * that integer denominator, printed as arithmetic, never as a float that rounds
 * into looking correct. The time-weighted average allocation is the capacity
 * analogue of the time-weighted return of investment performance measurement:
 * sub-period values are linked at each change boundary instead of reading the
 * ending value as though it had stood for the whole period.
 *
 * WHAT IT REFUSES TO DO (Bulletproof Reliability Mandate)
 * -------------------------------------------------------
 *  - It never projects today's share backwards. Where the retained history
 *    cannot PROVE what a line charged on a day the period asks about — because
 *    the bounded in-row history displaced its oldest entries — the row's
 *    weighted figure is REFUSED with the coverage start printed. "Cannot prove"
 *    is refused even when nothing was actually displaced: a cap of five means
 *    five retained entries cannot distinguish exactly-five-changes from
 *    nine-changes-four-dropped, and guessing which is the one thing this ledger
 *    exists to stop.
 *  - It never prints a partial sum. One undeclared share-day in one row refuses
 *    that row's total; one refused row refuses that person's total; one refused
 *    person refuses the workspace total. Each refusal carries its count and its
 *    reason.
 *  - It never weights a line the matrix engine refused. A row the engine named
 *    as a defect (a cycle, a missing person, an unreadable share, a window that
 *    ends before it starts) is counted with the defect printed and charged
 *    nothing.
 *  - It never weights the home line. `person.managerId` is today's pointer;
 *    its history is ADR-0149's dated ledger and its as-of reading is
 *    ADR-0155's. A home-allocation row is counted as out of scope with that
 *    reason printed rather than attributed to whoever holds the pointer today.
 *  - It never treats a day of change as two half days. The retune day is read
 *    at its CLOSING share; the convention is declared here and printed on the
 *    panel, not buried in the arithmetic.
 *  - It never writes. Every figure is derived on read from the declarations and
 *    their stored history; nothing derived is stored, so a printed figure
 *    cannot drift from the record it describes.
 *  - It is INERT in a single-chain workspace: no second line, no row, no
 *    figure, no export row beyond the summary that says so.
 *
 * Cross-domain basis
 * ------------------
 *  - Time-weighted return linking (CFA Institute *Global Investment
 *    Performance Standards*; Bacon 2013, *Measuring Portfolio Performance):
 *    a period figure is built by linking sub-period values at each external
 *    change boundary, precisely so a late change cannot re-price the whole
 *    period. This ledger links declared shares at each retune boundary.
 *  - Activity-based costing (Kaplan & Cooper 1988, *Harvard Business Review*,
 *    "How Cost Accounting Distorts Product and Service Decisions"): declared
 *    allocation bases drift from actual consumption, and the cure is a measured
 *    driver per period. The share-day is the declared-capacity driver the
 *    budget and merit surfaces can be reconciled against.
 *  - Responsibility-centre attribution (Anthony & Govindarajan, *Management
 *    Control Systems*): attribution, not a grand total, is the unit of the
 *    reading — carried from the matrix ledger's own declared basis.
 *  - Audit evidence sufficiency (IIA *Standards* 2310; AICPA AU-C 500):
 *    where the retained record cannot support a figure, the figure is refused
 *    with the insufficiency named; an absence is never absorbed into an
 *    average.
 */

export const LINE_PERIOD_ALLOCATION_ENGINE_VERSION = 'line-period-allocation-2026.11-v1';

/** One unit of the share scale is one whole percent of a person. */
export const LINE_PERIOD_ALLOCATION_FULL_H = 100;

/**
 * The six states of one declaration row inside one named period. Printed,
 * never collapsed: "weighted", "the record cannot prove this window", "a day
 * carries no declared share", "the engine refused this line", "the line does
 * not touch this period" and "this is the home line's own allocation" are six
 * different facts with six different next acts, and only the first produces a
 * number.
 */
export const LINE_PERIOD_ALLOCATION_STATES = Object.freeze({
  computed: 'computed',
  historyGap: 'refused-history-gap',
  undeclared: 'refused-undeclared',
  defect: 'refused-defect',
  outOfWindow: 'out-of-window',
  homeScope: 'out-of-scope-home',
});

export const LINE_PERIOD_ALLOCATION_STATE_LABELS = Object.freeze({
  computed: 'Time-weighted',
  'refused-history-gap': 'Refused — history cannot prove the window',
  'refused-undeclared': 'Refused — a day carries no declared share',
  'refused-defect': 'Refused — the engine refused this line',
  'out-of-window': 'Outside the period',
  'out-of-scope-home': 'Home-line allocation — out of scope',
});

export const LINE_PERIOD_ALLOCATION_STATE_TONES = Object.freeze({
  computed: 'good',
  'refused-history-gap': 'bad',
  'refused-undeclared': 'warn',
  'refused-defect': 'bad',
  'out-of-window': 'neutral',
  'out-of-scope-home': 'neutral',
});

/** The states that REFUSE a weighted figure for a row that touches the period. */
export const LINE_PERIOD_ALLOCATION_REFUSED_STATES = Object.freeze([
  LINE_PERIOD_ALLOCATION_STATES.historyGap,
  LINE_PERIOD_ALLOCATION_STATES.undeclared,
  LINE_PERIOD_ALLOCATION_STATES.defect,
]);

/**
 * Per-person verdicts with declared precedence, so the panel, the brief and the
 * CSV cannot disagree about which word a person gets. The order of severity IS
 * the precedence; it is stated here once.
 */
export const LINE_PERIOD_ALLOCATION_VERDICTS = Object.freeze([
  { key: 'period-refused', label: 'The period cannot be priced for this person', severity: 0, tone: 'bad', open: true,
    detail: 'At least one line that touches the period is refused — the retained history cannot prove the window, a day carries no declared share, or the engine refused the line itself. The person total is refused rather than printed over the rows that happen to carry a number.' },
  { key: 'over-committed', label: 'Over one whole person on at least one day', severity: 1, tone: 'bad', open: true,
    detail: 'On at least one day of the period, the declared additional lines charged more than 100% of this person between them. The count is a day count, not a rating: the home line is out of scope, so this is a floor on the over-commitment, printed with that bound.' },
  { key: 'retuned-in-period', label: 'A share moved inside the period', severity: 2, tone: 'warn', open: true,
    detail: 'At least one line was retuned while the period ran, so today’s single number demonstrably misprices the period. The time-weighted figure is the one the period actually consumed; both the first and the last share are printed beside it.' },
  { key: 'steady', label: 'Priced for the period, no movement', severity: 3, tone: 'good', open: false,
    detail: 'Every line that touches the period carries a provable declared share on every day of its overlap, and no share moved inside the window. The time-weighted figure equals the standing declaration.' },
  { key: 'outside-window', label: 'No declared line touches this period', severity: 4, tone: 'neutral', open: false,
    detail: 'This person holds declared additional lines, but none of their windows intersects the named period. That is an absence of scope, not a zero charge and not a gap.' },
]);

export const LINE_PERIOD_ALLOCATION_VERDICT_KEYS = Object.freeze(LINE_PERIOD_ALLOCATION_VERDICTS.map((v) => v.key));
const VERDICT_BY_KEY = new Map(LINE_PERIOD_ALLOCATION_VERDICTS.map((v) => [v.key, v]));

export function linePeriodAllocationVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '').trim()) || null;
}

/** Bounds on printed rows and on the period itself. Every cap is counted, never silent. */
export const LINE_PERIOD_ALLOCATION_LIMITS = Object.freeze({
  /** Person rows the queue carries before the remainder is counted only. */
  rows: 40,
  /** Share segments printed on one row before the remainder is counted. */
  segments: 8,
  /** Characters in a printed refusal reason. */
  reasonChars: 400,
});

/**
 * The period is a named window of whole days, inclusive at both ends, and it
 * is bounded: a two-year outer bound keeps the day sweep exact and cheap, and
 * a one-day floor keeps "period" a period. Outside the bounds the reading is
 * refused with the bound printed — never silently clamped, because clamping
 * would answer a question nobody asked.
 */
export const LINE_PERIOD_ALLOCATION_BOUNDS = Object.freeze({
  windowDays: Object.freeze([1, 731]),
});

/**
 * Declared conventions. Each is printed wherever it affects a figure, because
 * a convention nobody can see is an assumption doing arithmetic in the dark.
 */
export const LINE_PERIOD_ALLOCATION_CONVENTIONS = Object.freeze([
  'A day of change is read at its CLOSING share: a retune recorded on a day means the new share applies to that day and after, and the share it replaced applied through the day before. Intra-day splits are not modelled and are not pretended to be.',
  'Two retunes recorded on the same day are read in their stored timestamp order; the day closes at the last of them, and the row prints that it contains a same-day change.',
  'History entries are read in timestamp order even if the stored order differs (a hand-edited file); the row prints that it reordered them.',
  'The ledger covers DECLARED ADDITIONAL lines only. The home line’s own allocation and the home pointer’s history belong to ADR-0149 and ADR-0155; a home-allocation row is counted as out of scope and never weighted, because attributing it across a past period would name whoever holds the pointer TODAY.',
  'Every share is whole hundredths of a person, every weight is whole days, and every product is an exact integer number of share-days. An average is printed as that numerator over that denominator, never as a rounded float standing alone.',
  'Where the retained in-row history sits at its declared cap, coverage is provable only from the oldest retained change forward. A period reaching behind that point is REFUSED — the cap cannot distinguish exactly-five changes from nine with four displaced, and the ledger refuses rather than guesses which.',
]);

/** CSV scope #119: aggregate only. No person, no name, no manager id, no declaration id, no note text. */
export const LINE_PERIOD_ALLOCATION_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'period_from',
  'period_to',
  'period_days',
  'window_valid',
  'window_refused_reason',
  'line_kind',
  'lines_n',
  'computed_n',
  'refused_history_gap_n',
  'refused_undeclared_n',
  'refused_defect_n',
  'out_of_window_n',
  'home_rows_n',
  'retuned_in_period_n',
  'share_days_h',
  'persons_n',
  'persons_refused_n',
  'persons_over_committed_n',
  'over_days_n',
  'withheld_n',
  'share_days_refused',
  'share_days_refused_reason',
  'counts_reconcile',
]);

/** What the panel prints about its own method. */
export const LINE_PERIOD_ALLOCATION_METHOD = Object.freeze([
  Object.freeze({
    name: 'Time-weighted linking at change boundaries (GIPS; Bacon, Measuring Portfolio Performance)',
    why: 'A period figure is built by linking sub-period values at each external change, so a late change cannot re-price the whole period. Each retune boundary splits the window; each sub-window contributes share × whole days; the row’s share-days is the exact integer sum, and the average is printed as that sum over the day count.',
  }),
  Object.freeze({
    name: 'Activity-based costing (Kaplan & Cooper 1988)',
    why: 'Declared allocation bases drift from actual consumption, and ABC exists to charge periods by measured drivers instead. The share-day is the declared-capacity driver: the period’s budget, capacity and merit readings can now be reconciled against what the declarations actually charged, day by day, instead of against today’s single number.',
  }),
  Object.freeze({
    name: 'Responsibility-centre attribution (Anthony & Govindarajan)',
    why: 'Attribution, not a grand total, is the unit of the reading — carried from the matrix ledger’s own declared basis. Every figure here is per line and per person before it is per workspace, and a workspace total is only printed when every row it sums was printed.',
  }),
  Object.freeze({
    name: 'Audit evidence sufficiency (IIA Standards 2310; AICPA AU-C 500)',
    why: 'Where the retained record cannot support a figure, the figure is refused with the insufficiency named. A bounded history at its cap cannot prove what it displaced; a period reaching behind the provable point is refused outright rather than averaged from today’s number projected backwards.',
  }),
  Object.freeze({
    name: 'Exact integer arithmetic',
    why: 'Shares are whole hundredths, days are whole numbers, share-days are their exact integer product, and every printed identity — row segments to row total, rows to person, persons to workspace — is checked as integer equality and printed as a CLAIM, never assumed.',
  }),
  Object.freeze({
    name: 'Report, never act',
    why: 'Stored: the declarations, their windows and their bounded change history — all of which existed before this module. Derived on every read: every segment, every share-day total, every verdict. Nothing here edits a declaration, retunes a share, ends a line or writes a figure back. A refused row is a question for the humans who hold the line, named on the panel and counted in the export.',
  }),
]);

/** Printed on the panel so the reading cannot be mistaken for a measured truth. */
export const LINE_PERIOD_ALLOCATION_LIMITS_TEXT = Object.freeze([
  'An allocation is a DECLARATION, not a measurement (ADR-0140’s own limit, carried forward): the share-day total prices what the lines were declared to charge, day by day. It is not evidence of the hours anyone worked, and it never becomes evidence by being multiplied by days.',
  'The ledger covers declared ADDITIONAL lines. The home line is out of scope — its pointer moves and its history is ADR-0149’s — so a person’s day total below 100% is NOT a claim that the remainder was free, and the over-commitment count is a floor, printed as one.',
  'A period that reaches behind the retained history’s provable coverage is refused, not approximated. Workspaces that retune often will see refusals on old periods; that is the record telling the truth about its own bounds, and the reason names the coverage start.',
  'The day of a retune is read at its closing share. A period boundary that falls mid-change therefore reads the new share for that whole day, and the convention is printed rather than hidden.',
  'Seats are workflow declarations, not authentication. The period reading is scoped to the acting seat like every other line register, and withheld people are counted, never shown.',
]);

/** The questions this panel answers, printed so a reader knows what it is for. */
export const LINE_PERIOD_ALLOCATION_QUESTIONS = Object.freeze([
  'What did each declared line actually charge over a named period — time-weighted across every retune — instead of what it charges today?',
  'Which periods CANNOT be priced, because the retained history cannot prove the window or a day carries no declared share, and exactly where does the provable record start?',
  'Which lines moved inside the period, so the roll-ups that consumed today’s single number demonstrably mispriced it?',
  'On how many days of the period did one person’s declared additional lines charge more than a whole person between them?',
  'Do the printed rows add to the printed totals — and when they do not, which refusal is the reason?',
]);
