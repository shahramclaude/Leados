/**
 * app/core/domain/authorityContinuityRegistry.js — the declared vocabulary of
 * the Matrix Authority Continuity Register (ADR-0156, Schema v128 unchanged,
 * `#/matrix?panel=continuity`, CSV scope #117).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS.
 * "Last month the board asked me to confirm that the decisions in our
 * November pack were made by the people who held the authority to make them.
 * Pay was easy — the merit module proves its own structure now. But the pricing
 * decision in March, the board memo in June and the arbitration in September
 * are all frozen records too, and none of them can reproduce their own
 * authority. I am about to walk into a board meeting and I genuinely do not
 * know which of our frozen decisions still name the people who actually held
 * the line."
 *
 * THAT IS THE GAP. ADR-0155 gave ONE decision type (a finalised merit cycle)
 * the ability to prove its own structure: it freezes a `structure` block beside
 * the money and compares it against the record. Everything else in the
 * workspace freezes decisions WITHOUT such a block — a board memo freezes a
 * snapshot of claims; a logged decision freezes a `chosen` answer and an
 * approver; a priority arbitration freezes an agreed precedence. Each is a
 * frozen decision record. NONE of them can answer "was the authority that made
 * me in force on the day I was made?"
 *
 * WHY A PORTFOLIO REGISTER AND NOT MORE SINGLE-TYPE MODULES.
 * A chief does not hold one type of decision. They hold a PORTFOLIO: a pay
 * cycle, a pricing decision, a board memo, an arbitration. The question is
 * asked of the portfolio, so the register reads the portfolio. Adding a
 * `structure` block to every module that freezes a decision would be the
 * invasive route to the same answer, and it would take many sessions and would
 * still leave the pre-existing records — the ones already in the file —
 * unanswerable. The register instead asks the question a different way:
 *
 *   1. What authority did THIS record claim, in THIS record's own words?
 *      (the approver it names; the home line frozen beside it)
 *   2. What authority was in force on that record's own day, according to the
 *      shared as-of structure engine (ADR-0155) and the shared matrix engine
 *      (ADR-0140)?
 *   3. Do the two agree?
 *
 * Every answer is derived on read from records the workspace ALREADY stores.
 * Nothing is written by a read; nothing is corrected by a read.
 *
 * WHAT IS NEVER CLAIMED
 * ----------------------
 *  - It never says a decision was WRONG. A drifted record is a statement about
 *    a STRUCTURE MOVING UNDER A DECISION, not about a person or a call. The
 *    remedy is a human re-affirming the record, or a note that the authority
 *    has since changed — and the module never makes that note for them.
 *  - It never scores a person. Every finding is about a pair: a record and the
 *    authority it names.
 *  - It never rewrites the frozen record. `compareFrozenStructure` (ADR-0155)
 *    already draws the line: REPORT, NEVER CORRECT.
 *  - It never absorbs an absence into an aggregate. The headline question is
 *    "are our frozen decisions still attributable to the authority that made
 *    them?" and a module with no comparable record can only ever answer
 *    "UNKNOWN", never "yes". An absence is the one thing a continuity claim
 *    must never absorb.
 *
 * FRAMEWORK BASIS
 * ----------------
 *  - Audit evidence sufficiency (COSO 2013, control activities; IIA Global
 *    Internal Audit Standards): a frozen decision record must be able to
 *    reproduce the authority in force on its own effective date. A record that
 *    cannot is not evidence of the decision; it is evidence of a decision.
 *  - Bitemporal records (Snodgrass 1999): the day a fact was TRUE and the day
 *    it was RECORDED are different facts. The register reads the record's own
 *    date, never today's chart.
 *  - Referential integrity across an audit population (audit sampling and
 *    population completeness, AICPA AU-C 500): a population-level assertion is
 *    only as good as its coverage, so the covered population and the uncovered
 *    population are printed as TWO separate figures and a claim over an
 *    incomplete population is refused rather than scaled up.
 *  - Statistical disclosure control (house convention, ADR-0139 / ADR-0126): a
 *    withheld figure is BLANK with its reason, never a zero.
 */

/** The engine version of the register. Bumped when the read model changes. */
export const AUTHORITY_CONTINUITY_ENGINE_VERSION = 'authority-continuity-2026.11-v1';

/**
 * The rule this module adds to the shared spine. It issues ONE governed
 * decision per drifted record — a human must re-affirm or annotate the record.
 * It never edits the record it reports on.
 */
export const AUTHORITY_CONTINUITY_RULE_ID = 'RULE-ACR-01';

/**
 * The declared events. One is a human act, one is an explicit rescan of the
 * work a per-transaction cap deferred.
 */
export const AUTHORITY_CONTINUITY_EVENTS = Object.freeze({
  RESOLVE: 'authority.continuity.resolved',
  SCAN: 'authority.continuity.scan',
});

/**
 * The frozen decision TYPES this register can read, and — critically — what
 * authority each type records in its OWN words.
 *
 * A type qualifies only when the stored record carries the authority it claims.
 * A type with no comparable authority record can only ever read `unreadable`;
 * it is never silently dropped and never quietly excluded from the population.
 */
export const AUTHORITY_CONTINUITY_TYPES = Object.freeze([
  Object.freeze({
    key: 'merit-cycle',
    label: 'Finalised merit cycle',
    authorityKind: 'home-line',
    detail: 'A finalised pay cycle. The authority it names is the home line frozen beside the money by ADR-0155, one manager per pay recipient.',
  }),
  Object.freeze({
    key: 'decision',
    label: 'Decided decision record',
    authorityKind: 'approver',
    detail: 'A decision log record with a chosen answer. The authority it names is its DACI approver, resolved to the roster by name.',
  }),
  Object.freeze({
    key: 'board-memo',
    label: 'Board disclosure memorandum',
    authorityKind: 'approver',
    detail: 'A board memo that was frozen or committed with a snapshot. The authority it names is the memo\'s approver.',
  }),
]);

export const AUTHORITY_CONTINUITY_TYPE_KEYS = Object.freeze(
  AUTHORITY_CONTINUITY_TYPES.map((t) => t.key),
);

/**
 * HOW THE AUTHORITY IN THE RECORD COMPARES TO THE AUTHORITY IN FORCE.
 *
 * These are the four verdicts of the register, and they are the whole point:
 *
 *  - `attributable`   the record names a manager, and that manager held the
 *                      relevant right on the record's own day. The record
 *                      still reproduces its authority.
 *  - `drifted`         the record names a manager, and a DIFFERENT manager
 *                      held the relevant right on the record's own day. The
 *                      structure moved under the decision. This is NOT a claim
 *                      that the decision was wrong.
 *  - `unattributed`    the record names no manager at all, so there is nothing
 *                      to compare. The record cannot be attributed to any
 *                      authority, and it is not counted as attributable.
 *  - `unreadable`      the record exists but its authority could not be read
 *                      (a malformed block, a name that resolves to nobody on
 *                      the roster, a date that cannot be read). Counted and
 *                      printed; never dropped.
 *
 * `not-comparable` is a FIFTH state and it is the one that decides whether a
 * population claim may be made at all: a type the register cannot compare
 * contributes to the UNCOVERED population, and a population claim is refused
 * whenever the uncovered population is not empty.
 */
export const AUTHORITY_CONTINUITY_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'drifted',
    label: 'Authority has moved since the record was made',
    rank: 0,
    tone: 'bad',
    detail: 'The record names a manager, and a different manager held the relevant right on the record\'s own date. The structure moved under the decision. Nothing here says the decision was wrong — it says the record can no longer prove who decided it.',
  }),
  Object.freeze({
    key: 'unattributed',
    label: 'The record names no authority',
    rank: 1,
    tone: 'bad',
    detail: 'The record carries no approver and no frozen home line, so there is nothing to compare against the authority in force. It is not counted as attributable.',
  }),
  Object.freeze({
    key: 'unreadable',
    label: 'The record could not be read',
    rank: 2,
    tone: 'bad',
    detail: 'The record exists but its authority or its date could not be read. It is counted and printed with its reason and never dropped.',
  }),
  Object.freeze({
    key: 'attributable',
    label: 'Still attributable to the authority in force',
    rank: 3,
    tone: 'good',
    detail: 'The record names a manager, and that manager held the relevant right on the record\'s own date. The record reproduces its own authority.',
  }),
]);

const VERDICT_BY_KEY = new Map(AUTHORITY_CONTINUITY_VERDICTS.map((v) => [v.key, v]));
export function authorityContinuityVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '')) || null;
}

/**
 * The DECISION-RIGHT each type's authority is read against.
 *
 * A merit cycle is a PAY decision: the relevant right is `pay`. A logged
 * decision and a board memo are APPROVALS by one named person, and the right
 * that governs an approval of somebody's work is the `performance` right —
 * the stewardship right the line holds over the people it leads. Using the
 * real RAPID vocabulary matters: an invented right name would compare against
 * nothing and every record would read as drifted, which is a false alarm in
 * the alarming direction.
 *
 * These are DECLARED conventions, printed on the panel. A right that can be
 * relaxed until it agrees with the reader is not a check.
 */
export const AUTHORITY_CONTINUITY_RIGHTS = Object.freeze({
  'merit-cycle': Object.freeze({ key: 'pay', label: 'Pay right', detail: 'A finalised pay cycle is a `pay` decision, so the manager who must have held the `pay` right over each pay recipient on the cycle\'s effective date is the one the record must reproduce.' }),
  decision: Object.freeze({ key: 'performance', label: 'Performance right', detail: 'A decided decision record is an approval over somebody\'s work, so the manager who must have held the `performance` right over the subject on the decision\'s own date is the one the record must reproduce. Where the record has no resolvable subject, the comparison falls back to the approver\'s own span — a weaker reading, and printed as one.' }),
  'board-memo': Object.freeze({ key: 'performance', label: 'Performance right', detail: 'A frozen board memo is an approval over somebody\'s work, so the manager who must have held the `performance` right over the subject on the memo\'s own date is the one the record must reproduce. A board memo has no typed subject, so the comparison falls back to the owner\'s own span — a weaker reading, and printed as one.' }),
});

/**
 * The declared conventions. There is no workspace setting for any of them: a
 * reading that can be tuned until it agrees with the reader is not a check.
 */
export const AUTHORITY_CONTINUITY_CONVENTIONS = Object.freeze({
  /**
   * The minimum number of covered records before a POPULATION CLAIM ("all our
   * frozen decisions are still attributable") may be made at all. Below the
   * floor the register prints counts and refuses the claim.
   */
  populationFloor: 3,
  /**
   * How many records the register carries before the rest are counted.
   * A remainder is COUNTED, never dropped, and the panel says so.
   */
  recordCap: 200,
  /**
   * The maximum number of difference rows printed per record.
   */
  differencesPerRecord: 8,
});

/**
 * The declared limits. Bounded reads, bounded output.
 */
export const AUTHORITY_CONTINUITY_LIMITS = Object.freeze({
  records: 200,
  differencesPerRecord: 8,
  decisionsPerScan: 20,
  noteChars: 400,
  reasonChars: 300,
});

/**
 * The named methods the register prints. It does not paraphrase them.
 */
export const AUTHORITY_CONTINUITY_METHOD = Object.freeze([
  {
    name: 'Audit evidence sufficiency (COSO 2013; IIA Global Internal Audit Standards)',
    why: 'A frozen decision record must be able to reproduce the authority in force on its own effective date. A record that cannot is not evidence for the decision — it is evidence that a decision happened. The register therefore asks each record to name the authority that made it and compares it against the record\'s own day.',
  },
  {
    name: 'Bitemporal records (Snodgrass 1999)',
    why: 'The day a fact was true and the day it was recorded are different facts. Every authority comparison here is made on the record\'s OWN date, through the same as-of structure engine (ADR-0155) and the same matrix engine (ADR-0140) the rest of the workspace uses — never today\'s chart.',
  },
  {
    name: 'Population completeness (AICPA AU-C 500)',
    why: 'A population-level assertion is only as good as its coverage. The covered population and the uncovered population are TWO separate figures, and a claim over the whole population is REFUSED whenever anything is uncovered — an absence is the one thing a continuity claim must never absorb.',
  },
  {
    name: 'Report, never correct',
    why: 'A drifted record is named, never rewritten. The frozen record is not edited to match today and today\'s reading is not overwritten to agree. The remedy is a human re-affirming the record, which the workspace records as a separate dated act.',
  },
  {
    name: 'No person is ever scored',
    why: 'Every finding is about a PAIR — a record and the authority it names. There is no authority score, no manager rating and no league table. A structure moved; that is a fact about an organisation, not a verdict on a colleague.',
  },
  {
    name: 'Refusal instead of imputation',
    why: 'A record whose authority cannot be read is counted and printed with its reason. It is never assigned a manager, never assumed to have been held by the current one, and never quietly excluded from the population so the headline looks better.',
  },
]);

/**
 * The CSV export contract (scope #117). Aggregate only: counts, verdicts and
 * type names. NO record id, NO title, NO person id, NO manager id, NO name.
 *
 * ADR-0159 adds the four drifted-settlement counts (`drifted_settled_n`,
 * `drifted_referred_n`, `drifted_stale_n`, `drifted_unsettled_n`) and the
 * separate `reconciled_claim` / `reconciled_claim_reason` alongside
 * `population_claim` so a human settlement never overwrites the structural
 * continuity measurement.
 */
export const AUTHORITY_CONTINUITY_CSV_COLUMNS = Object.freeze([
  'row_kind', 'type', 'verdict', 'covered_n', 'uncovered_n', 'drifted_n',
  'unattributed_n', 'unreadable_n', 'attributable_n', 'difference_n',
  'drifted_settled_n', 'drifted_referred_n', 'drifted_stale_n', 'drifted_unsettled_n',
  'population_claim', 'population_claim_reason',
  'reconciled_claim', 'reconciled_claim_reason',
  'reconciles',
]);

/* ----------------------------------------------------- ADR-0159 settlement */

export const AUTHORITY_REAFFIRMATION_ENGINE_VERSION = 'authority-reaffirmation-2026.11-v1';

/**
 * The two dated human answers a current authority (or joint matrix principal)
 * may record on a DRIFTED frozen decision. Neither edits the frozen record.
 */
export const AUTHORITY_REAFFIRMATION_OUTCOMES = Object.freeze({
  STAND_BEHIND: 'stand-behind',
  REFER_REOPEN: 'refer-reopen',
});

export const AUTHORITY_REAFFIRMATION_OUTCOME_LIST = Object.freeze([
  AUTHORITY_REAFFIRMATION_OUTCOMES.STAND_BEHIND,
  AUTHORITY_REAFFIRMATION_OUTCOMES.REFER_REOPEN,
]);

/**
 * Derived settlement state per frozen record. Never stored — recomputed on
 * every read against today's live matrix so a further re-org immediately turns
 * an earlier settlement `stale` rather than silently carrying it over.
 */
export const AUTHORITY_REAFFIRMATION_SETTLEMENTS = Object.freeze({
  UNSETTLED: 'unsettled',
  SETTLED: 'settled',
  REFERRED: 'referred',
  STALE: 'stale',
  NOT_APPLICABLE: 'not-applicable',
});

export const AUTHORITY_REAFFIRMATION_SETTLEMENT_LIST = Object.freeze([
  Object.freeze({
    key: 'unsettled',
    label: 'Unsettled drift',
    tone: 'warning',
    detail: 'Authority drifted and no current right holder or joint principal has answered under today’s structure.',
  }),
  Object.freeze({
    key: 'settled',
    label: 'Stood behind',
    tone: 'positive',
    detail: 'The current authority (or joint matrix principal) has stood behind this frozen record in writing under today’s live structure.',
  }),
  Object.freeze({
    key: 'referred',
    label: 'Referred to re-open',
    tone: 'info',
    detail: 'The current authority declined to stand behind the drifted record as-is and opened a governed re-decision.',
  }),
  Object.freeze({
    key: 'stale',
    label: 'Settlement stale',
    tone: 'danger',
    detail: 'This record was answered earlier, and the live matrix authority moved AGAIN afterwards — a new holder cannot inherit an earlier holder’s sign-off by silence.',
  }),
  Object.freeze({
    key: 'not-applicable',
    label: 'Not drifted',
    tone: 'neutral',
    detail: 'Only drifted records can be settled; attributable records need no settlement, and unattributed or unreadable records are refused rather than papered over.',
  }),
]);

export function authoritySettlementMeta(key) {
  return AUTHORITY_REAFFIRMATION_SETTLEMENT_LIST.find((s) => s.key === key)
    || AUTHORITY_REAFFIRMATION_SETTLEMENT_LIST[4];
}

export const AUTHORITY_REAFFIRMATION_BOUNDS = Object.freeze({
  dueDays: Object.freeze([3, 60]),
  minReason: 8,
  maxReason: 500,
});

export const AUTHORITY_REAFFIRMATION_DEFAULTS = Object.freeze({
  dueDays: 14,
});

export const AUTHORITY_REAFFIRMATION_LIMITS = Object.freeze({
  acts: 600,
  markers: 800,
  obligationsPerCommit: 8,
});

export const AUTHORITY_REAFFIRMATION_RIGHTS = Object.freeze({
  REAFFIRM: 'reaffirm-frozen-authority',
});

/** Map continuity record types onto canonical `LINK_ENTITY_TYPES`. */
export const AUTHORITY_CONTINUITY_LINK_TYPES = Object.freeze({
  'merit-cycle': 'merit',
  decision: 'decision',
  'board-memo': 'boardmemo',
});

