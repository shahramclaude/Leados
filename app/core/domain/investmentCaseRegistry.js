/**
 * app/core/domain/investmentCaseRegistry.js — the closed vocabulary of the
 * Investment Case Register: appraisal, ratification and post-completion review
 * (ADR-0208, Session 277, Schema v162, `RULE-ICA-01`, CSV scope #150,
 * `#/finance?panel=cases`).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. A plant director walks into the VP's office
 * with a request: 420,000 for a second line, "pays back in three years". The VP
 * has a budget envelope that can absorb it and a delegation schedule that says
 * she may sign it. Neither answers the question she is actually paid to answer —
 * the one the executive altitude's own decision form names: *what do we fund,
 * what do we deliberately refuse?* Is this money worth more spent here than left
 * where it is? And three years later nobody opens the file again, so the next
 * request is as optimistic as this one was, and nothing in the organisation has
 * learned what its own promises are worth.
 *
 * Until this register the workspace held ceilings (envelopes), authority
 * (delegation limits) and postings (chargebacks) — every instrument that says
 * whether money MAY be spent, and none that says whether it SHOULD be, or
 * whether it delivered.
 *
 * WHAT IS RECORDED. A case is a dated promise: money out, money back, on named
 * days, in one currency, at one declared hurdle rate, with one named benefit
 * owner and one declared review day. It is immutable once declared. Three human
 * acts follow it: RATIFY (approve or reject), WITHDRAW, and REVIEW (what actually
 * moved, up to a cut-off). Nothing derived is stored — no present value, no rate
 * of return, no payback, no ratio, no status. Every figure is re-derived on read
 * by an exact integer kernel, so a printed figure cannot drift from its flows.
 *
 * DECISION CONTROL IS NOT DECISION MANAGEMENT (Fama & Jensen 1983). The person
 * who initiates and implements an investment must not be the one who ratifies it
 * or grades it. So the benefit owner can never ratify or review their own case;
 * both acts belong to a seat ABOVE the owner — through the reporting tree or a
 * declared matrix line — and the act records which route carried the authority.
 *
 * WHAT IT NEVER DOES. It never pools currencies. It never adds net present
 * values that were valued on different days at different rates. It never prints
 * an internal rate of return that is not unique. It never reads an under-spend as
 * a saving while money is still going out. It never invents a forecast: what is
 * not yet evidence is carried at exactly the figure that was promised. It never
 * rates a person. It never moves money, edits an envelope or posts a commitment.
 */

export const INVESTMENT_CASE_ENGINE_VERSION = 'investment-case-2026.11-v1';
export const INVESTMENT_CASE_ADR = 'ADR-0208';
export const INVESTMENT_CASE_RULE_ID = 'RULE-ICA-01';
export const INVESTMENT_CASE_ROUTE = 'finance';
export const INVESTMENT_CASE_PANEL = 'cases';
export const INVESTMENT_CASE_HREF = '#/finance?panel=cases';
export const INVESTMENT_CASE_CSV_SCOPE = 'investment-case-appraisals';
export const INVESTMENT_CASE_MARKER_KIND = 'investment-case';

export const INVESTMENT_CASE_EVENTS = Object.freeze({
  DECLARED: 'investmentCase.declared',
  WITHDRAWN: 'investmentCase.withdrawn',
  DECIDED: 'investmentCase.decided',
  REVIEWED: 'investmentCase.reviewed',
  CONVENTIONS: 'investmentCase.conventions.set',
  SCAN: 'investmentCase.scan',
});
export const INVESTMENT_CASE_EVENT_PREFIX = 'investmentCase.';

/**
 * Reading is open at every altitude, scoped by the reader to the cases whose
 * benefit owner sits in the seat's own span. Declaring a case is a manager's act
 * and above — a frontline lead's horizon is the week, and a capital promise is
 * not a week's work. Ratifying and reviewing are decision CONTROL, which begins
 * at the director altitude and is the executive altitude's own decision form
 * ("investment & risk appetite"). Governing the ask window and the scan sits in
 * the same window every other governed register uses.
 */
export const INVESTMENT_CASE_RIGHTS = Object.freeze({
  READ: 'read-investment-cases',
  DECLARE: 'declare-investment-case',
  RATIFY: 'ratify-investment-case',
  GOVERN: 'govern-investment-cases',
});

/* ------------------------------------------------------------ vocabularies */

/**
 * The three kinds of money a case may name. The kind is declared, never inferred
 * from the sign, because the two questions a review asks — did it cost what was
 * promised, did it return what was promised — need the two streams kept apart.
 */
export const INVESTMENT_FLOW_KINDS = Object.freeze([
  Object.freeze({ key: 'outlay', label: 'Outlay', sign: 'out', says: 'Money committed to create the asset or the change. Always money out; entered as a positive amount.' }),
  Object.freeze({ key: 'benefit', label: 'Benefit', sign: 'either', says: 'The operating return of a period, net of its running cost. Usually money in; a period the investment loses money is entered as a negative amount.' }),
  Object.freeze({ key: 'residual', label: 'Residual', sign: 'either', says: 'What the asset is worth at the end (positive) or what it costs to remove (negative). Kept apart because a case that only clears its hurdle on its residual value is a different case.' }),
]);
export const INVESTMENT_FLOW_KIND_KEYS = Object.freeze(INVESTMENT_FLOW_KINDS.map((row) => row.key));
export const INVESTMENT_FLOW_KIND_BY_KEY = Object.freeze(Object.fromEntries(INVESTMENT_FLOW_KINDS.map((row) => [row.key, row])));

/** Rate and flows must be in the same terms. Declared, never guessed. */
export const INVESTMENT_BASES = Object.freeze([
  Object.freeze({ key: 'nominal', label: 'Nominal', says: 'Flows include expected inflation and the hurdle rate is a nominal rate.' }),
  Object.freeze({ key: 'real', label: 'Real', says: 'Flows are in constant prices and the hurdle rate is a real rate.' }),
]);
export const INVESTMENT_BASIS_KEYS = Object.freeze(INVESTMENT_BASES.map((row) => row.key));

/** The three acts a human may record against a case. */
export const INVESTMENT_ACT_KINDS = Object.freeze(['approve', 'reject', 'withdraw', 'review']);

/** How the acting seat held the benefit owner when it signed. A fact of the act. */
export const INVESTMENT_ACT_ROUTES = Object.freeze([
  Object.freeze({ key: 'operator', label: 'Workspace leader', says: 'Signed from the undeclared operator view — the workspace leader, who sits above every roster seat.' }),
  Object.freeze({ key: 'home-line', label: 'Home line', says: 'The signing seat held the benefit owner in its own reporting tree.' }),
  Object.freeze({ key: 'declared-line', label: 'Declared matrix line', says: 'The signing seat held the benefit owner only through a declared additional reporting line — a second accountability, not a second chain.' }),
]);
export const INVESTMENT_ACT_ROUTE_KEYS = Object.freeze(INVESTMENT_ACT_ROUTES.map((row) => row.key));
export const INVESTMENT_ACT_ROUTE_BY_KEY = Object.freeze(Object.fromEntries(INVESTMENT_ACT_ROUTES.map((row) => [row.key, row])));

/**
 * The lifecycle of one case, re-derived on every read from its acts and today's
 * date. Exhaustive and mutually exclusive.
 */
export const INVESTMENT_CASE_STATUSES = Object.freeze([
  Object.freeze({ key: 'proposed', label: 'Awaiting ratification', tone: 'warn', rank: 1, live: false, says: 'Declared and appraised. Nobody above the benefit owner has ratified or refused it.' }),
  Object.freeze({ key: 'review-due', label: 'Review due', tone: 'bad', rank: 0, live: true, says: 'Ratified, and a declared review day has arrived with no review recorded up to it. The promise is unexamined.' }),
  Object.freeze({ key: 'approved', label: 'Ratified', tone: 'good', rank: 2, live: true, says: 'Ratified by a seat above the benefit owner. Its first declared review day has not arrived.' }),
  Object.freeze({ key: 'tracking', label: 'Reviewed — next review declared', tone: 'good', rank: 3, live: true, says: 'Reviewed at least once against its promise, with a further review day declared and not yet arrived.' }),
  Object.freeze({ key: 'closed', label: 'Reviewed — closed', tone: 'neutral', rank: 4, live: false, says: 'A final review is on the record. The case stays as evidence about what this organisation’s promises are worth.' }),
  Object.freeze({ key: 'rejected', label: 'Refused', tone: 'neutral', rank: 5, live: false, says: 'Refused at ratification, with the written reason. Kept: what an organisation refuses to fund is part of its funded mix.' }),
  Object.freeze({ key: 'withdrawn', label: 'Withdrawn', tone: 'neutral', rank: 6, live: false, says: 'Withdrawn before any decision, with the written reason.' }),
]);
export const INVESTMENT_CASE_STATUS_KEYS = Object.freeze(INVESTMENT_CASE_STATUSES.map((row) => row.key));
export const INVESTMENT_CASE_STATUS_BY_KEY = Object.freeze(Object.fromEntries(INVESTMENT_CASE_STATUSES.map((row) => [row.key, row])));

/** Why an internal rate of return is or is not printed. */
export const INVESTMENT_IRR_STATES = Object.freeze([
  Object.freeze({ key: 'unique', label: 'Unique', says: 'The dated net flows change sign exactly once, money out first, so exactly one rate makes the stream worth zero. It is printed, floored to a hundredth of a basis point.' }),
  Object.freeze({ key: 'multiple-sign-changes', label: 'Not unique', says: 'The dated net flows change sign more than once, so more than one rate can make the stream worth zero. No rate is printed; read the net present value at the declared hurdle.' }),
  Object.freeze({ key: 'no-sign-change', label: 'Does not exist', says: 'The stream never changes sign. No rate makes money that only goes one way worth zero.' }),
  Object.freeze({ key: 'inflow-first', label: 'Borrowing-shaped', says: 'Money comes in before it goes out. The one rate that exists is a borrowing cost, for which higher is worse; it is not printed as a return.' }),
  Object.freeze({ key: 'below-bracket', label: 'Below −99.9999%', says: 'The stream is worth less than zero even at the lowest rate searched. It loses essentially everything put in.' }),
  Object.freeze({ key: 'above-bracket', label: 'Above 10,000%', says: 'The stream is still worth more than zero at the highest rate searched. The outlay is negligible against the return; a rate that large is not a useful number.' }),
  Object.freeze({ key: 'unreadable', label: 'Unreadable', says: 'The stream could not be read.' }),
]);
export const INVESTMENT_IRR_STATE_BY_KEY = Object.freeze(Object.fromEntries(INVESTMENT_IRR_STATES.map((row) => [row.key, row])));

/** Why a payback day is or is not printed. */
export const INVESTMENT_PAYBACK_STATES = Object.freeze([
  Object.freeze({ key: 'pays-back', label: 'Pays back', says: 'The first flow day on which the running total is no longer negative.' }),
  Object.freeze({ key: 'not-inside-schedule', label: 'Not inside the schedule', says: 'The running total is still negative after the last declared flow. The case does not pay back on its own promise.' }),
  Object.freeze({ key: 'never-negative', label: 'Never in deficit', says: 'The running total is never negative, so there is nothing to pay back.' }),
]);
export const INVESTMENT_PAYBACK_STATE_BY_KEY = Object.freeze(Object.fromEntries(INVESTMENT_PAYBACK_STATES.map((row) => [row.key, row])));

/**
 * Who a due review is owed to, as resolved on today's reporting graph. Only
 * `seat` produces an ask; every other state is one identity-free observation.
 */
export const INVESTMENT_MONITOR_STATES = Object.freeze([
  Object.freeze({ key: 'seat', says: 'A roster seat above the benefit owner holds decision control and is asked.' }),
  Object.freeze({ key: 'leader-held', says: 'Decision control sits with the workspace leader. It is printed on the leader’s own board; no delegation is filed.' }),
  Object.freeze({ key: 'ambiguous', says: 'The benefit owner’s reporting lines share no single seat above them that holds the altitude to ratify. Nobody is chosen by arithmetic.' }),
  Object.freeze({ key: 'off-roster', says: 'Neither the ratifier nor the benefit owner is on the active roster. Nobody is substituted.' }),
]);
export const INVESTMENT_MONITOR_STATE_KEYS = Object.freeze(INVESTMENT_MONITOR_STATES.map((row) => row.key));

/** Every reason a figure or a row is withheld. Each prints its own sentence. */
export const INVESTMENT_CASE_REFUSALS = Object.freeze([
  Object.freeze({ key: 'irr-not-printed', says: 'One or more cases carry no unique internal rate of return (the stream changes sign more than once, never, or money comes in first). No rate is printed for them; their net present value at the declared hurdle is.' }),
  Object.freeze({ key: 'payback-not-printed', says: 'One or more cases do not pay back inside their own declared schedule, or are never in deficit. No payback day is printed for them.' }),
  Object.freeze({ key: 'outlay-open', says: 'A review that does not declare the outlay complete prints no cost ratio and no evidence-based net present value: while money is still going out, spending less than planned so far cannot be told apart from running late.' }),
  Object.freeze({ key: 'no-benefit-promised', says: 'A review whose cut-off falls before any promised benefit prints no benefit ratio. Nothing was promised by that day, so nothing can be short.' }),
  Object.freeze({ key: 'track-record-below-floor', says: 'Fewer reviewed, prospectively declared cases exist than the evidence floor. The track record is printed as counts only and no promise is re-read against it — two anecdotes are never dressed up as a statistic.' }),
  Object.freeze({ key: 'retrospective-excluded', says: 'A case declared after its first outlay day was written with hindsight. Its ratios are printed on its own card and it is left out of the track record.' }),
  Object.freeze({ key: 'npv-not-pooled', says: 'Net present values valued on different days at different rates are never added, and currencies are never pooled. The book is read per currency, as counts and as promised outlay.' }),
  Object.freeze({ key: 'residual-carried', says: 'The track record holds no evidence about residual values. An adjusted reading carries the residual at exactly the promised figure, and prints the case’s value without it beside it.' }),
  Object.freeze({ key: 'owner-off-roster', says: 'A case’s benefit owner is no longer on the active roster. The case stays on the record; nobody is substituted as its owner.' }),
  Object.freeze({ key: 'multi-line-owner', says: 'A benefit owner holds more than one active reporting line. The case is counted ONCE, is visible to the holder of every one of those lines, and is never split between them.' }),
  Object.freeze({ key: 'outside-span', says: 'Cases whose benefit owner sits outside this seat’s reporting tree and declared lines are counted, never listed.' }),
  Object.freeze({ key: 'truncated', says: 'More cases exist than this screen lists. The totals count all of them; the remainder is counted, not shown.' }),
  Object.freeze({ key: 'invalid-ledger', says: 'Rows in the investment-case ledgers could not be read exactly and were dropped with a counted warning. Nothing was repaired into plausibility.' }),
]);
export const INVESTMENT_CASE_REFUSAL_KEYS = Object.freeze(INVESTMENT_CASE_REFUSALS.map((row) => row.key));
export const INVESTMENT_CASE_REFUSAL_BY_KEY = Object.freeze(Object.fromEntries(INVESTMENT_CASE_REFUSALS.map((row) => [row.key, row])));

/* ------------------------------------------------------- bounds and limits */

export const INVESTMENT_CASE_LIMITS = Object.freeze({
  /** Declared cases kept. Append-only. */
  cases: 400,
  /** Acts kept across every case. Append-only. */
  acts: 2400,
  /** The rule's bounded observation ledger. */
  markers: 400,
  /** Dated flows one case may promise, and one review may record. */
  flowsPerCase: 60,
  flowsPerReview: 60,
  /** Reviews one case may carry. */
  reviewsPerCase: 12,
  /** One flow, in cents: 10^14 — a trillion currency units, inside the safe-integer range sixty times over. */
  maxCents: 100_000_000_000_000,
  /** The longest promise, from valuation day to last flow: sixty years. */
  horizonMaxDays: 21915,
  /** Hurdle rate bounds in whole basis points: 0% to 100%. */
  hurdleBpMin: 0,
  hurdleBpMax: 10000,
  titleMin: 3,
  titleMax: 120,
  reasonMin: 8,
  reasonMax: 500,
  caseRowsShown: 40,
  asksPerCommit: 4,
  /** Same evidence floor as every other calibration ledger in this workspace. */
  trackRecordFloorN: 5,
});

export const INVESTMENT_CASE_SETTING_KEYS = Object.freeze({
  askDueDays: 'investmentCaseAskDueDays',
  autoPropagate: 'investmentCaseAutoPropagate',
});

export const INVESTMENT_CASE_DEFAULTS = Object.freeze({
  askDueDays: 14,
  autoPropagate: true,
});

export const INVESTMENT_CASE_BOUNDS = Object.freeze({
  askDueDays: Object.freeze([1, 60]),
});

export const INVESTMENT_CASE_SETTING_LABELS = Object.freeze({
  askDueDays: 'Days a post-completion review ask is due within',
  autoPropagate: 'Investment-case review automation (RULE-ICA-01)',
});

/* --------------------------------------------------------------------- CSV */

/**
 * CSV scope #150. One workspace row, one row per currency, one row per case
 * under an opaque positional code, one track-record row. No person, no manager,
 * no case id, no title, no note or reason text and no date finer than the
 * generation day. A figure that cannot be claimed exports BLANK with its reason,
 * never zero. Money is whole cents; rates are whole basis points or millionths;
 * ratios are whole permille.
 */
export const INVESTMENT_CASE_CSV_COLUMNS = Object.freeze([
  'row_type', 'key', 'currency', 'generated_on',
  'cases_n', 'proposed_n', 'approved_n', 'review_due_n', 'tracking_n', 'closed_n', 'rejected_n', 'withdrawn_n',
  'multi_line_owner_n', 'retrospective_n', 'npv_positive_n', 'npv_negative_n',
  'status', 'basis', 'hurdle_bp', 'flows_n', 'horizon_days',
  'outlay_cents', 'benefit_cents', 'residual_cents',
  'pv_outlay_cents', 'npv_cents', 'npv_ex_residual_cents', 'pi_permille',
  'irr_state', 'irr_micro', 'payback_days', 'discounted_payback_days', 'peak_exposure_cents', 'residual_share_permille',
  'reviews_n', 'outlay_complete', 'cost_permille', 'benefit_permille', 'evidence_npv_cents',
  'track_cost_n', 'track_cost_median_permille', 'track_benefit_n', 'track_benefit_median_permille', 'adjusted_npv_cents',
  'ask_due_days', 'figures_complete', 'claim_reason', 'engine_version',
]);

export const INVESTMENT_CASE_CSV_DESCRIPTOR = Object.freeze({
  key: INVESTMENT_CASE_CSV_SCOPE,
  label: 'Investment case appraisals and post-completion reviews (identity-free)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'investment-case-appraisals',
  description: 'One identity-free workspace row, one row per currency, one row per case under an opaque positional code and one track-record row: lifecycle counts, promised outlay, net present value at the declared hurdle, profitability index, internal rate of return where it is unique, payback, peak cash exposure, residual-value dependence, and — where a review exists — the cost and benefit ratios against the promise. Contains NO person, manager, case id, title, note or reason text. Currencies are never pooled and net present values are never added across cases. A figure that cannot be claimed exports BLANK with its reason, never zero. Money is whole cents.',
});

/* ------------------------------------------------------------------ method */

export const INVESTMENT_CASE_FRAMEWORKS = Object.freeze([
  Object.freeze({ key: 'fisher-dean', label: 'Fisher (1930) and Dean (1951) — the net present value rule', says: 'Money on different days is not the same money. A dated stream is worth the sum of its flows, each discounted to one valuation day at the rate the money could earn elsewhere; an investment is worth making when that sum is positive. This register computes exactly that sum, and nothing that pretends to be it.' }),
  Object.freeze({ key: 'lorie-savage', label: 'Lorie & Savage (1955) — the rate of return can be several rates, or none', says: 'A stream that changes sign more than once can be worth zero at more than one rate, and ranking by rate can then reverse the ranking by value. The register prints an internal rate only where it is provably unique, and ranks by the profitability index — present value returned per unit of present value put in — which is their answer to rationed capital.' }),
  Object.freeze({ key: 'descartes-laguerre', label: 'Descartes’ rule of signs, in Laguerre’s extension to real exponents', says: 'A dated stream is a generalised polynomial in the discount factor. It has at most as many positive roots as its coefficients have sign changes, and exactly one when they change sign once. That is the uniqueness test applied here: a count of sign changes in the dated net flows, not a numerical search that happens to converge.' }),
  Object.freeze({ key: 'fama-jensen', label: 'Fama & Jensen (1983) — decision control is separated from decision management', says: 'Whoever initiates and implements a decision must not be the one who ratifies and monitors it. The benefit owner can therefore never ratify or review their own case; both acts belong to a seat above them, and a due review is owed to the seat that ratified — or, when that seat has gone, to the lowest seat above every one of the owner’s reporting lines.' }),
  Object.freeze({ key: 'kahneman-lovallo', label: 'Kahneman & Lovallo (1993), Flyvbjerg (2006) — the outside view', says: 'A forecast built from the plan’s own details is systematically optimistic; the correction is the distribution of outcomes of comparable past plans. The track record here is that distribution for THIS organisation: the median of what its own reviewed cases cost and returned against what they promised, applied to each open promise — and refused below an evidence floor.' }),
  Object.freeze({ key: 'post-completion-audit', label: 'Neale & Holmes (1991) — the post-completion audit', says: 'An appraisal nobody revisits teaches nothing and disciplines nobody. A case therefore cannot be declared without a review day, a due review is escalated on the shared spine, and the review compares dated actuals with the dated promise at the same rate, to the same valuation day.' }),
  Object.freeze({ key: 'green-book', label: 'HM Treasury, The Green Book — consistent price basis and explicit optimism adjustment', says: 'Real flows are discounted at a real rate and nominal flows at a nominal rate; mixing them is an error, not a simplification. The basis is declared on every case and printed beside every figure, and the optimism adjustment is shown NEXT TO the promised figure, never instead of it.' }),
  Object.freeze({ key: 'graham-harvey', label: 'Graham & Harvey (2001) — what practitioners actually read', says: 'Leaders decide on net present value and rate of return, and still read payback. So payback is printed — as the first dated flow on which the running total stops being negative, without interpolation — and is never the basis of a verdict.' }),
]);

export const INVESTMENT_CASE_METHOD = Object.freeze({
  unit: 'One case = one named benefit owner × one currency × one declared hurdle rate and price basis × a dated schedule of outlays, benefits and residuals × one declared review day. Immutable once declared; nothing derived is stored.',
  discounting: 'Each flow is discounted to the case’s valuation day by (1 + hurdle) raised to minus (days / 365) — Actual/365 Fixed, the convention a spreadsheet’s XNPV uses. Money is whole cents, rates are whole millionths, and the arithmetic is exact integer fixed point, so every browser prints the same cent. A discounted sum is snapped to a billionth of a cent and then rounded half away from zero.',
  value: 'Net present value is the present value of benefits and residuals minus the present value of outlays. The profitability index is the first divided by the second. The peak cash exposure is how far the running undiscounted total falls, and on which day.',
  rate: 'The internal rate of return is printed only where the dated net flows change sign exactly once, money out first — the condition under which exactly one rate exists. It is the largest whole millionth at which the stream is still worth at least zero, so a printed rate never overstates. Otherwise the reason is printed instead.',
  payback: 'Payback is the first flow day on which the running total is no longer negative, counted from the first outlay day. A lump sum arrives on its day; no payback date is interpolated inside a period. The discounted payback is the same reading on discounted flows.',
  residual: 'The residual value is kept apart from operating benefits. Its share of the promised return is printed, and so is the net present value without it — a case that clears its hurdle only on what the asset might be sold for is a different case.',
  control: 'Declaring a case is the proposer’s act. Ratifying and reviewing are decision control: they belong to a seat above the benefit owner and can never be performed by the owner. Ratifying a case whose net present value is negative at its declared hurdle is permitted — and requires the reason in writing.',
  review: 'A review states every actual flow from the valuation day to its cut-off and declares whether the outlay is complete. The benefit ratio compares actual benefits with the benefits PROMISED by the cut-off. The cost ratio and the evidence-based net present value are printed only when the outlay is complete. Whatever is not yet evidence is carried at exactly the promised figure.',
  trackRecord: 'The track record is the median cost ratio and the median benefit ratio of the latest review of every case that was declared on or before its first outlay day — a promise made before the money moved. Ratios are dimensionless, so they pool across currencies. Below five such cases it is counts only. Each open promise is then re-read at those medians, beside its promised figure.',
  matrix: 'A case has ONE benefit owner and is counted once. An owner who holds several reporting lines makes the case visible to the holder of every line; it is never split between them and never counted twice. A due review is owed to the seat that ratified while that seat still sits above the owner; otherwise to the lowest seat above EVERY one of the owner’s active lines that holds the altitude to ratify. Where no single such seat exists, the review is printed and nobody is invented.',
  refusal: 'Currencies are never pooled. Net present values valued on different days are never added. A rate that is not unique is not printed. A cost ratio is not printed while the outlay is open. A track record below its floor is not printed. Each refusal prints its sentence; none prints a zero.',
  notSaid: 'Nothing here rates a person, forecasts a market, or says a case will succeed. A net present value is the arithmetic of a promise at a declared rate. The register says what the promise is worth if it is kept, and — afterwards — how much of it was.',
});

export const INVESTMENT_CASE_ASK_PREFIX = 'Investment-case review: ';
export const INVESTMENT_CASE_CLOSED_PREFIX = `Closed by ${INVESTMENT_CASE_RULE_ID}:`;

/** The one condition `RULE-ICA-01` acts on. Nothing else is escalated. */
export const INVESTMENT_CASE_RULE_CONDITIONS = Object.freeze([
  Object.freeze({
    key: 'review-due',
    label: 'A ratified promise has reached its review day unexamined',
    says: 'A ratified case has reached a declared review day and no review is recorded up to it.',
  }),
]);
