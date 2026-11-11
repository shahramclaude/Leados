/**
 * app/core/domain/transferPriceRegistry.js — vocabulary for the Cross-Line
 * Labour Chargeback & Internal Transfer-Price Ledger (ADR-0177, Schema v142,
 * `RULE-TPL-01`, CSV scope #132, `#/matrix?panel=chargeback`).
 *
 * THE DUTY. The matrix ledger knows what SHARE of a person each line declared
 * (ADR-0140) and what share-days a period actually consumed (ADR-0158). Nothing
 * priced them. A project line that draws 40% of a functional line's engineer
 * paid nothing, so the lending line's budget carried the cost, the borrowing
 * line's return was overstated by exactly that amount, and nobody at the top
 * could say how much labour moved between lines or on whose terms.
 *
 * Frameworks applied (named, not paraphrased):
 *  - Transfer pricing under decentralisation (Hirshleifer, 1956): an internal
 *    price is what lets a division's own result steer it toward the enterprise
 *    optimum. A price of zero is still a price — the one that over-demands the
 *    shared resource.
 *  - The transfer-pricing problem as a management choice (Eccles, 1985): cost,
 *    market and negotiated prices are different POLICIES, so the basis is a
 *    declared label on every agreement and never derived.
 *  - Responsibility accounting and consolidation: a charge to one line is a
 *    credit to another, and charges between two lines inside one span are
 *    ELIMINATED when that span is consolidated — which is why the workspace
 *    statement must net to exactly zero.
 *  - The tragedy of the commons (Hardin, 1968) and Coasean internal
 *    contracting (Coase, 1937): a shared person with no agreed price is a
 *    commons; a two-key price is the smallest contract that ends it.
 *
 * Leaf module: imports nothing, so schema, read model, rule, actions, CSV and
 * view can all depend on it without a cycle.
 */

export const TRANSFER_PRICE_RULE_ID = 'RULE-TPL-01';
export const TRANSFER_PRICE_ADR = 'ADR-0177';
export const TRANSFER_PRICE_ENGINE_VERSION = 'transfer-price-ledger-2026.11-v1';

export const TRANSFER_PRICE_EVENTS = Object.freeze({
  PROPOSED: 'transfer.price.proposed',
  CONFIRMED: 'transfer.price.confirmed',
  RETIRED: 'transfer.price.retired',
  SCAN: 'transfer.price.scan',
  CONVENTIONS: 'transfer.price.conventions',
});

export const TRANSFER_PRICE_RIGHTS = Object.freeze({
  AGREE: 'agree-transfer-price',
  GOVERN: 'govern-transfer-prices',
});

/** The three dated acts. Nothing else is ever stored about a price. */
export const TRANSFER_PRICE_ACT_KINDS = Object.freeze(['propose', 'confirm', 'retire']);
/** The two keys. `lender` is the home line; `borrower` holds the declared additional line. */
export const TRANSFER_PRICE_SIDES = Object.freeze(['lender', 'borrower']);
/** How an act reached the record. `operator` is a scribed statement, not an authenticated one. */
export const TRANSFER_PRICE_VIAS = Object.freeze(['seat', 'operator']);

/**
 * HOW the two parties reached the number. A declared label, printed and
 * partitioned on the statement. LeadOS never computes a rate from pay, from a
 * cost record or from a market.
 */
export const TRANSFER_PRICE_BASES = Object.freeze([
  Object.freeze({ key: 'standard-cost', label: 'Standard cost', detail: 'The lending line’s declared standard cost of the capacity. Covers cost, steers nothing beyond it.' }),
  Object.freeze({ key: 'market-rate', label: 'Market rate', detail: 'What the same capacity would cost bought outside. The benchmark when an outside market exists.' }),
  Object.freeze({ key: 'negotiated', label: 'Negotiated', detail: 'A number the two lines settled between themselves.' }),
]);
export const TRANSFER_PRICE_BASIS_KEYS = Object.freeze(TRANSFER_PRICE_BASES.map((b) => b.key));
const BASIS_BY_KEY = new Map(TRANSFER_PRICE_BASES.map((b) => [b.key, b]));
export function transferPriceBasis(key) {
  return BASIS_BY_KEY.get(key) || null;
}

export const TRANSFER_PRICE_LIMITS = Object.freeze({
  acts: 2000,
  markers: 2000,
  idMax: 80,
  noteMax: 280,
  reasonMin: 10,
  reasonMax: 280,
  asksPerCommit: 8,
  /** Whole currency units per full person-day; equally, cents per share-day. */
  maxRateCents: 10000000,
  /** Printed ledger rows; the remainder is counted, never dropped from a total. */
  rows: 200,
  pieces: 12,
});

export const TRANSFER_PRICE_DEFAULTS = Object.freeze({ askDueDays: 7, autoPropagate: true });
export const TRANSFER_PRICE_BOUNDS = Object.freeze({
  askDueDays: Object.freeze([1, 30]),
  /** An agreed price names both ends of its term. Open-ended prices are refused. */
  termDays: Object.freeze([1, 731]),
});

/** One state per agreement. Derived on read from its acts; never stored. */
export const TRANSFER_PRICE_AGREEMENT_STATES = Object.freeze(['proposed', 'agreed', 'declined', 'withdrawn', 'voided']);
export const TRANSFER_PRICE_AGREEMENT_LABELS = Object.freeze({
  proposed: 'Proposed — one key',
  agreed: 'Agreed — two keys',
  declined: 'Declined by the counterpart',
  withdrawn: 'Withdrawn by its proposer',
  voided: 'Voided after agreement',
});
export const TRANSFER_PRICE_AGREEMENT_TONES = Object.freeze({
  proposed: 'warn', agreed: 'good', declined: 'neutral', withdrawn: 'neutral', voided: 'warn',
});

/**
 * One state per consumed share-day. `priced` is the only state that carries
 * money; every other state is a REFUSAL with its own printed reason and its own
 * count. Closed vocabulary, in print order.
 */
export const TRANSFER_PRICE_PIECE_STATES = Object.freeze([
  'priced', 'no-agreed-price', 'awaiting-second-key', 'price-conflict', 'lender-unrecorded', 'lender-conflict', 'same-line',
]);
/**
 * The OPEN refusals: share-days that are chargeable and carry no price. They
 * are what makes a statement incomplete and what withholds a net position.
 * `same-line` is deliberately not one of them — it is not chargeable at all.
 */
export const TRANSFER_PRICE_REFUSAL_STATES = Object.freeze(TRANSFER_PRICE_PIECE_STATES.filter((s) => s !== 'priced' && s !== 'same-line'));
export const TRANSFER_PRICE_PIECE_LABELS = Object.freeze({
  priced: 'Priced',
  'no-agreed-price': 'No agreed price',
  'awaiting-second-key': 'Awaiting the second key',
  'price-conflict': 'Two agreed prices collide',
  'lender-unrecorded': 'Home line not recorded',
  'lender-conflict': 'Two home lines recorded',
  'same-line': 'Lender and borrower are one line',
});
export const TRANSFER_PRICE_PIECE_REASONS = Object.freeze({
  priced: 'One two-key agreement between the lending home line and the borrowing line covers these days.',
  'no-agreed-price': 'No two-key agreement between these two lines covers these days. The share-days are REFUSED — never charged at zero and never at an average of other pairs.',
  'awaiting-second-key': 'A price is proposed for these days and one key is missing. A proposal is not a price.',
  'price-conflict': 'More than one agreed price between these two lines covers these days. Neither is picked.',
  'lender-unrecorded': 'This person has a recorded home-line history and no record covers these days, so the line that should be credited is unknown. Today’s manager is not projected backwards.',
  'lender-conflict': 'Two recorded home-line periods cover these days for this person. Neither manager is picked as the lender.',
  'same-line': 'The recorded home line on these days is the same manager who holds the declared line. A line does not charge itself.',
});
export const TRANSFER_PRICE_PIECE_TONES = Object.freeze({
  priced: 'good', 'no-agreed-price': 'bad', 'awaiting-second-key': 'warn', 'price-conflict': 'bad',
  'lender-unrecorded': 'bad', 'lender-conflict': 'bad', 'same-line': 'neutral',
});

/** How the lending line of a day is known. Printed on every priced piece. */
export const TRANSFER_PRICE_LENDER_BASES = Object.freeze(['observed', 'presumed-current']);
export const TRANSFER_PRICE_LENDER_BASIS_LABELS = Object.freeze({
  observed: 'recorded home line',
  'presumed-current': 'today’s home line, presumed',
});

/** One state per (person, declared line) row and per directed pair. */
export const TRANSFER_PRICE_ROW_STATES = Object.freeze(['priced', 'partly-priced', 'unpriced', 'unmeasured']);
export const TRANSFER_PRICE_ROW_LABELS = Object.freeze({
  priced: 'Priced in full',
  'partly-priced': 'Partly priced',
  unpriced: 'Unpriced',
  unmeasured: 'Share-days refused by the period ledger',
});
export const TRANSFER_PRICE_ROW_TONES = Object.freeze({
  priced: 'good', 'partly-priced': 'warn', unpriced: 'bad', unmeasured: 'bad',
});

/** The statement verdict, closed and in precedence order. */
export const TRANSFER_PRICE_VERDICTS = Object.freeze([
  Object.freeze({ key: 'window-refused', label: 'The period is refused', tone: 'bad', detail: 'The named period is unreadable or out of bounds. Nothing was clamped and nothing was priced.' }),
  Object.freeze({ key: 'inert', label: 'Nothing to charge', tone: 'neutral', detail: 'No declared additional line touches this period in this seat. A single-chain workspace gains no row, no figure and no refusal.' }),
  Object.freeze({ key: 'unmeasured', label: 'Consumption could not be measured', tone: 'bad', detail: 'The period ledger refused the share-days of at least one line in scope and none could be priced.' }),
  Object.freeze({ key: 'unpriced', label: 'Nothing is priced', tone: 'bad', detail: 'Consumed share-days exist in this period and none of them carries a two-key price.' }),
  Object.freeze({ key: 'partly-priced', label: 'Partly priced', tone: 'warn', detail: 'Some consumed share-days carry a two-key price and some are refused. Every net position touched by a refusal is withheld.' }),
  Object.freeze({ key: 'priced', label: 'Priced in full', tone: 'good', detail: 'Every consumed share-day in scope carries exactly one two-key price.' }),
]);
export const TRANSFER_PRICE_VERDICT_KEYS = Object.freeze(TRANSFER_PRICE_VERDICTS.map((v) => v.key));
const VERDICT_BY_KEY = new Map(TRANSFER_PRICE_VERDICTS.map((v) => [v.key, v]));
export function transferPriceVerdict(key) {
  return VERDICT_BY_KEY.get(key) || VERDICT_BY_KEY.get('inert');
}

export const TRANSFER_PRICE_RULE_RELATIONS = Object.freeze(['issues-obligation', 'rolls-up-to']);

export const TRANSFER_PRICE_QUESTIONS = Object.freeze([
  'A line borrowed part of a person for a quarter. What does it owe the line that lent them — and on whose terms?',
  'Which pairs of lines traded labour with no agreed price at all?',
  'Across the enterprise, does every cent charged to one line land as a credit on another?',
  'Inside my span, how much of the internal trade cancels out, and what do we net owe or earn outside it?',
]);

export const TRANSFER_PRICE_METHOD = Object.freeze([
  'A price is a dated TWO-KEY agreement between one lending line (the person’s home manager) and one borrowing line (the manager of a declared additional line). One manager proposes, the other confirms the same terms. A proposal is not a price.',
  'The rate is a whole number of currency units per full person-day, which makes one share-day (one hundredth of a person for one day) exactly that many cents. Every charge is share-days × rate in exact integer cents. Nothing is rounded.',
  'The basis (standard cost, market rate or negotiated) is the parties’ declaration of how they reached the number. No rate is ever inferred from pay, from a cost record or from another pair.',
  'Share-days are the CONSUMED share-days of the Matrix Line Period-Allocation Ledger (ADR-0158), walked day by day through the same share timeline. The identity between the two ledgers is checked as integer equality and printed.',
  'The lending line of each day is the home line RECORDED for that day (ADR-0149). A person with no recorded home-line history is read against today’s home manager and every such figure is labelled presumed. A person whose history exists but does not cover the day has NO lender, and those share-days are refused.',
  'Share-days with no two-key price are REFUSED with the reason — never charged at zero, never at an average. An explicitly agreed rate of zero is a real two-key price and is counted apart.',
  'Each priced piece posts one charge to the borrowing line and the identical credit to the lending line in one currency. Currencies are never pooled and no exchange rate is applied.',
  'A line’s NET position is printed only when every share-day that names it is priced and no share-day in the period has an unknown lender. Charged and credited amounts under the agreed prices are printed regardless, as what they are.',
  'A span is consolidated along the home-line tree: charges between two lines inside the span are eliminated, and only what crosses the span’s boundary remains. At the workspace root everything eliminates, so the statement nets to zero.',
  'RULE-TPL-01 puts the missing key in front of the named counterpart, and an unpriced pair of the last completed quarter in front of the borrowing manager, once each, and closes its own asks. It never posts a charge, never edits a budget and never blocks a declaration.',
]);

export const TRANSFER_PRICE_LIMITS_TEXT = Object.freeze([
  'A statement, not a posting: no budget envelope, actual or forecast is written. Charging a budget line with these figures is deliberately a later, separate act.',
  'One price per directed pair of lines per day. Rate cards by grade, role or individual declaration are not modelled; two people lent between the same lines share one rate.',
  'Share-days are DECLARED allocation over calendar days, not hours worked. A person declared at 40% who worked 10% is charged at 40%.',
  'Only declared additional lines are charged. The home line’s own share is never charged to anyone.',
  'People who have left the active roster are outside the period ledger’s population, so their share-days in a past period are counted as engine refusals and not priced.',
  'Seats are workflow declarations, not authentication. An act recorded in the operator view is a scribed statement and is labelled as such; an agreement whose two keys were both scribed is counted apart.',
  'Voiding an agreement from a past day changes the statement of every period it covered. The void is a dated act with a reason, and the share-days it uncovers are refused until a new price is agreed.',
]);

export const TRANSFER_PRICE_CSV_COLUMNS = Object.freeze([
  'row_type', 'generated_on', 'scope', 'period_from', 'period_to', 'period_days', 'verdict',
  'pairs', 'pairs_priced', 'pairs_partly_priced', 'pairs_unpriced', 'pairs_unmeasured',
  'rows', 'rows_priced', 'rows_partly_priced', 'rows_unpriced', 'rows_unmeasured', 'rows_withheld', 'rows_reconcile',
  'consumed_share_days', 'priced_share_days', 'zero_priced_share_days', 'unpriced_share_days',
  'refused_no_agreed_price', 'refused_awaiting_second_key', 'refused_price_conflict',
  'refused_lender_unrecorded', 'refused_lender_conflict', 'same_line_share_days',
  'share_days_reconcile', 'period_ledger_identity',
  'presumed_lender_share_days', 'retroactive_share_days', 'engine_refusals',
  'agreements', 'agreements_proposed', 'agreements_agreed', 'agreements_declined', 'agreements_withdrawn', 'agreements_voided',
  'agreements_both_keys_scribed', 'agreements_reconcile',
  'currency', 'entries', 'charged_cents', 'credited_cents', 'net_cents', 'charged', 'credited', 'net',
  'zero_sum', 'statement_complete', 'accounts', 'accounts_net_withheld', 'accounts_withheld', 'open_asks', 'engine_version',
]);

export const TRANSFER_PRICE_CSV_DESCRIPTOR = Object.freeze({
  key: 'line-chargeback',
  label: 'Cross-line chargeback (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'line-chargeback',
  description: 'One summary row for the lines the acting seat may read over the last completed calendar quarter, plus one row per currency: how many consumed share-days carry a two-key transfer price and how many are refused under each printed reason (the partition reconciles to the consumed total and the row says so); the charged and credited integer cents per currency; whether the workspace statement nets to exactly zero; and whether the statement is complete. Aggregate and identity-free: no person, manager, pair, agreement or rate is exported. A withheld net is a BLANK cell, never a zero. Currencies are never pooled.',
});
