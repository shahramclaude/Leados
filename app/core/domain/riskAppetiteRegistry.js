/**
 * app/core/domain/riskAppetiteRegistry.js — the closed vocabulary of the
 * Enterprise Risk Appetite & Tolerance Breach Register
 * (ADR-0219, Schema v173, `RULE-RAP-01`, CSV scope #161, `#/risk-appetite`).
 *
 * THE DUTY, IN A CEO'S WORDS. The board has said, in a strategy paper, that it
 * is "cautious on safety, open on strategic risk and averse to compliance
 * failure". Those words are in the workspace too: the executive decision form
 * literally asks *"what risk are we carrying on purpose?"* — and the duty that
 * carries that question (`chainRegistry.js`, `risk-appetite`) routes to the
 * culture and power surfaces, because nothing in the product could answer it.
 * So the enterprise carries risk it never quantified against an appetite it
 * never wrote down, and the only time anyone learns the number is after a loss.
 *
 * THE GAP THIS CLOSES, QUOTED FROM THE RECORD RATHER THAN ASSERTED.
 *   - `chainRegistry.js` declares the executive decision form
 *     `'investment & risk appetite'` and a duty key literally named
 *     `'risk-appetite'`, whose routes are `#/health`, `#/anomaly`, `#/power` —
 *     three culture-signal surfaces. Not one of them holds a declared tolerance.
 *   - `mitigationReview.js` / `mitigationRobustness.js` compare ONE case's
 *     current and proposed loss under a Savage minimax-regret model; they answer
 *     "is this mitigation worth it", never "how much risk have we decided to
 *     carry, and are we inside it".
 *   - The operational case record already holds the risks themselves: FMEA
 *     probability/impact (`fmeaRatingOrNull`), a most-likely loss and a settled
 *     `realisedExposure`. Nothing aggregates them against a ceiling.
 *   - Word-boundary searches of `app/` before this build return ZERO files for
 *     `risk appetite` as a register, ZERO for `risk tolerance` in an appetite
 *     sense, ZERO for `risk register` and ZERO for `retention limit`. The only
 *     `appetite` hits are the decision-form label above, two prose comments and
 *     the investment-case registry's *appetite* for asking. Wider absence
 *     **[UNVERIFIED]**.
 *
 * THE FRAMEWORKS THIS ENCODES, AND NOTHING BEYOND THEM.
 *   1. COSO Enterprise Risk Management (2017), Principle 3 — "defines risk
 *      appetite and risk tolerance". An appetite is a *stated stance*; a
 *      tolerance is the *measurable boundary* of it. They are two different
 *      declarations and this register keeps them apart: the stance is printed
 *      and never converted into a number, the tolerance is an exact integer.
 *      [Citation details from memory, UNVERIFIED.]
 *   2. ISO 31000:2018 risk criteria — risk is evaluated against declared
 *      criteria, and a criterion the organisation cannot measure is not a
 *      criterion. This register refuses to certify a tolerance it cannot
 *      measure rather than reporting it as met.
 *   3. Risk retention policy (Brealey, Myers & Allen; Basel-style retention
 *      limits) — the amount of loss deliberately carried rather than
 *      transferred, avoided or mitigated. A retention is a DECLARATION by a
 *      named line, with a written basis, never a figure inferred from a
 *      scenario.
 *   4. Exposition of the two-facts discipline (Bulletproof Reliability
 *      Mandate) — *the measured figure is inside the ceiling* and *the whole
 *      population was measured* are different claims and are never collapsed.
 *      A register that prints "within appetite" over half a population is the
 *      exact failure this product exists to prevent.
 *   5. Matrix accountability — a risk owned by a person with several lines is
 *      counted ONCE, and exposure is never split across those lines; a breach
 *      is escalated to the lowest seat above EVERY line that carries it
 *      (`matrixJointApex`), and a genuinely unresolvable apex is printed.
 *
 * WHAT THE REGISTER DOES. Holds three ledgers: appetite statements (domain,
 * measure, exact tolerance, stance, review date, declarer), risk declarations
 * (a live operational case, its domain, the exact cents deliberately retained
 * in one currency, its basis), and identity-free observation markers written by
 * the rule when nobody can be asked. Every measured figure is re-derived on
 * read. Nothing derived is stored.
 *
 * WHAT IT NEVER DOES. It never infers a retention from a case's FMEA, its
 * most-likely loss or its settled exposure; never converts or pools a currency;
 * never splits an enterprise exposure across lines; never turns a qualitative
 * stance into a number; never marks a tolerance "met" over an unmeasured
 * population; never rates a person; and never decides whether a risk is
 * acceptable — it prints what the enterprise declared and what the record shows.
 */

export const RA_ENGINE_VERSION = 'risk-appetite-2026.11-v1';
export const RA_ADR = 'ADR-0219';
export const RA_RULE_ID = 'RULE-RAP-01';
export const RA_ROUTE = 'risk-appetite';
export const RA_HREF = '#/risk-appetite';
export const RA_CSV_SCOPE = 'risk-appetite';
export const RA_MARKER_KIND = 'risk-appetite';

export const RA_EVENTS = Object.freeze({
  STATEMENT_DECLARED: 'riskAppetite.statement.declared',
  STATEMENT_RETIRED: 'riskAppetite.statement.retired',
  RISK_DECLARED: 'riskAppetite.risk.declared',
  RISK_WITHDRAWN: 'riskAppetite.risk.withdrawn',
  SCANNED: 'riskAppetite.scan',
});
export const RA_EVENT_PREFIX = 'riskAppetite.';

/**
 * Three rights. The appetite is an enterprise instrument: reading it is a
 * director-and-above act matched to the statement's record class, and declaring
 * a tolerance is an executive act. Declaring the exposure of one live risk is
 * the director's own act, narrowed inside the action to a seat that can reach
 * the case's owner.
 */
export const RA_RIGHTS = Object.freeze({
  READ: 'read-risk-appetite',
  DECLARE: 'declare-risk-appetite',
  CARRY: 'carry-risk-appetite',
});

export const RA_LIMITS = Object.freeze({
  statements: 120,
  declarations: 600,
  markers: 400,
  textMin: 24,
  textMax: 600,
  currencyMax: 3,
  idMax: 120,
  countMax: 100_000,
  /** Whole cents. 10 trillion major units: far above any real retention, far
   * below Number.MAX_SAFE_INTEGER, so a printed figure is an exact integer. */
  centsMax: 1_000_000_000_000_000,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
  statementsShown: 40,
  declarationsShown: 60,
  /** The horizon a statement's review date may sit inside. */
  reviewMaxDays: 1095,
});

export const RA_SETTING_KEYS = Object.freeze({
  autoPropagate: 'riskAppetiteAutoPropagate',
});

export const RA_DEFAULTS = Object.freeze({
  autoPropagate: true,
});

export const RA_BOUNDS = Object.freeze({
  autoPropagate: 'boolean',
});

/* ------------------------------------------------------------- vocabulary */

/**
 * The seven risk domains. A closed list on purpose: a free-text domain makes
 * every total a matter of spelling. Each domain carries the question it asks,
 * so a declarer reads what they are declaring.
 */
export const RA_DOMAINS = Object.freeze([
  Object.freeze({ key: 'safety', label: 'Safety — harm to people', question: 'How much harm to people will we tolerate before we stop the work?' }),
  Object.freeze({ key: 'financial', label: 'Financial — loss of money, capital or liquidity', question: 'How much money will we lose on purpose before the position is not ours to take?' }),
  Object.freeze({ key: 'operational', label: 'Operational — failure of a process, service or supply', question: 'How much interruption to delivery will we carry before continuity is the priority?' }),
  Object.freeze({ key: 'compliance', label: 'Compliance — breach of law, regulation or contract', question: 'What breach of an obligation is acceptable — and is the honest answer none?' }),
  Object.freeze({ key: 'strategic', label: 'Strategic — failure of a bet or a market position', question: 'How much of the plan may fail for the plan to still have been worth making?' }),
  Object.freeze({ key: 'people', label: 'People — loss of capability, key people or trust', question: 'How much attrition, overload or loss of confidence will we accept as the cost of this course?' }),
  Object.freeze({ key: 'reputational', label: 'Reputational — loss of stakeholder trust or standing', question: 'How much of our standing with stakeholders are we prepared to spend?' }),
]);
export const RA_DOMAIN_KEYS = Object.freeze(RA_DOMAINS.map((row) => row.key));

/**
 * The stance, on five steps. COSO's appetite is qualitative as well as
 * quantitative; the stance is printed beside the tolerance and is NEVER
 * converted into a number. `seeking` is the only statement that says the
 * enterprise wants MORE of a risk — and even it cannot print a floor, because
 * a floor would be a target the record does not measure.
 */
export const RA_APPETITE_LEVELS = Object.freeze([
  Object.freeze({ key: 'averse', label: 'Averse — avoid; accepted only where unavoidable and then minimised' }),
  Object.freeze({ key: 'minimal', label: 'Minimal — accept only the lowest practically achievable level' }),
  Object.freeze({ key: 'cautious', label: 'Cautious — accept within clearly bounded limits, reviewed often' }),
  Object.freeze({ key: 'open', label: 'Open — accept in pursuit of the strategy, with the ceiling declared' }),
  Object.freeze({ key: 'seeking', label: 'Seeking — the risk is the objective; we want more of it, within the ceiling' }),
]);
export const RA_APPETITE_KEYS = Object.freeze(RA_APPETITE_LEVELS.map((row) => row.key));

/**
 * Two measures, and only two.
 *  - `declared-risks` counts the live risks the enterprise has declared in the
 *    domain. It needs no currency and is exact by construction.
 *  - `retained-exposure` sums the integer cents deliberately retained by those
 *    risks IN THE STATEMENT'S DECLARED CURRENCY. Currency is part of the
 *    statement's key: no exchange rate is invented, and money in another
 *    currency is printed as excluded, never converted.
 */
export const RA_MEASURES = Object.freeze([
  Object.freeze({ key: 'declared-risks', label: 'Declared risks — how many we will carry', unit: 'count' }),
  Object.freeze({ key: 'retained-exposure', label: 'Retained exposure — how much we will carry', unit: 'money' }),
]);
export const RA_MEASURE_KEYS = Object.freeze(RA_MEASURES.map((row) => row.key));

/** The three verdicts a statement can carry over its declared population. */
export const RA_VERDICTS = Object.freeze([
  Object.freeze({ key: 'breached', label: 'Breached — the declared population is over the ceiling' }),
  Object.freeze({ key: 'within-tolerance', label: 'Within tolerance — the declared population is at or under the ceiling' }),
  Object.freeze({ key: 'unmeasurable', label: 'Unmeasurable — the register cannot compute this ceiling and prints why' }),
]);
export const RA_VERDICT_KEYS = Object.freeze(RA_VERDICTS.map((row) => row.key));

/** The operational case kinds that carry risk. An initiative or an escalation is not a risk. */
export const RA_RISK_CASE_KINDS = Object.freeze(['risk', 'incident']);
export const RA_OPEN_CASE_STATUSES = Object.freeze(['open', 'mitigating', 'monitoring']);

export const RA_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  retired: 'This statement was retired. A retired statement is history and is never revived; declare a new one.',
  withdrawn: 'This declaration was withdrawn. A withdrawal is final; declare a new one if the risk is carried again.',
});

export const raDomain = (key) => RA_DOMAINS.find((row) => row.key === key) || null;
export const raAppetiteLevel = (key) => RA_APPETITE_LEVELS.find((row) => row.key === key) || null;
export const raMeasure = (key) => RA_MEASURES.find((row) => row.key === key) || null;
export const raVerdict = (key) => RA_VERDICTS.find((row) => row.key === key) || null;

/**
 * The key a live statement occupies. Two statements with the same key on the
 * same day are an ambiguity the register refuses to resolve — the loader drops
 * the later one with a counted warning, because picking one would put a
 * tolerance on the board's table that nobody chose.
 */
export function raStatementKey({ domain, measure, currency = '' } = {}) {
  const unit = measure === 'retained-exposure' ? String(currency || '').toUpperCase() : '*';
  return `${domain}|${measure}|${unit}`;
}

/* ------------------------------------------------------------------ method */

export const RA_METHOD = Object.freeze({
  engine: RA_ENGINE_VERSION,
  adr: RA_ADR,
  frameworks: Object.freeze([
    'COSO ERM (2017), Principle 3 — appetite (a stance) and tolerance (a measurable boundary) are declared and kept apart [citation details UNVERIFIED]',
    'ISO 31000:2018 — risk is evaluated against declared criteria; a criterion the organisation cannot measure is not a criterion',
    'Risk retention limits (Brealey, Myers & Allen; Basel-style retention) — the loss deliberately carried rather than transferred, avoided or mitigated',
    'Bulletproof Reliability Mandate — “inside the ceiling” and “the whole population was measured” are two different claims',
    'Matrix accountability (ADR-0140/ADR-0141) — one risk is counted once, exposure is never split across lines, and a breach escalates to the seat above every line that carries it',
  ]),
  printed: Object.freeze([
    'The tolerance is an exact integer: whole cents for exposure, a whole count for risks. A measured figure is compared to it exactly, never rounded.',
    'The measured figure is computed over the DECLARED population only, and the register says so beside it.',
    'Coverage is a separate claim: open risk cases with no declaration are counted and named as uncertified, never assumed safe.',
    'Money in a currency the statement does not declare is counted as excluded, never converted and never pooled.',
    'A risk carried in a domain with no live appetite is counted as uncovered — the absence of a ceiling is printed, not treated as an unlimited one.',
    'A person with several lines is counted once; their risk is never divided between those lines, because no human agreed a division.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No inferred retention from FMEA ratings, a most-likely loss, a settled exposure or a mitigation model.',
    'No exchange rate, currency pooling or inflation adjustment.',
    'No conversion of a qualitative stance into a number, and no floor for a “seeking” appetite.',
    'No rating, scoring or judgement of a person, and no decision that a risk is acceptable — that is the declarer’s act.',
    'No aggregation of the enterprise into one number across domains: a count of risks is not comparable to cents of exposure.',
  ]),
});

/* ------------------------------------------------------------------ CSV #161 */

export const RA_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'domain', 'measure', 'currency',
  'tolerance', 'measured', 'verdict', 'breached', 'review_overdue',
  'declared_risks', 'excluded_other_currency', 'coverage_gap',
  'blank_reason',
]);

/**
 * CSV #161 (ADR-0219, Schema v173). IDENTITY-FREE BY CONSTRUCTION. One summary
 * row, one row per live statement and one row per domain. No declarer, no case
 * name, no case id, no basis text and no owner crosses this boundary. A figure
 * the reader cannot compute exports BLANK with its reason, never a zero.
 */
export const RA_CSV_DESCRIPTOR = Object.freeze({
  key: RA_CSV_SCOPE,
  label: 'Enterprise risk appetite & tolerance (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'risk-appetite',
  description: 'One summary row, one row per live appetite statement (domain, measure, currency, exact tolerance, measured figure, verdict) and one row per declared domain. Every figure is the reader’s own integer. No declarer, case, owner or basis note is exported; an uncomputable figure is blank with its reason, never zero.',
});

export const RA_SECTION_TITLES = Object.freeze({
  statements: 'Statements',
  risks: 'Risks carried',
  lines: 'Lines',
  method: 'Method',
});
