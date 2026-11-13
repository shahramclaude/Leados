/**
 * app/core/domain/chargebackPostingRegistry.js — vocabulary for the Chargeback
 * Period Posting & Budget-Envelope Binding ledger (ADR-0194, Schema v154,
 * `RULE-CBP-01`, CSV scope #146, `#/matrix?panel=postings`).
 *
 * THE DUTY. ADR-0177 made the cross-line labour statement: what each borrowing
 * line owes the line that lent it people, in exact integer cents that must net
 * to zero. It deliberately posted nothing — "charging a budget line with these
 * figures is a later, separate human act". This module IS that act. Until it
 * exists, a complete quarter statement is a reading the chief can admire and
 * nobody owns: the figures never become period facts bound to the envelopes
 * that carry them, nothing records WHICH envelope each line's charge stands
 * against, and a restated statement (a voided price, a retuned share) silently
 * replaces the figures everyone remembers approving.
 *
 * Frameworks applied (named, not paraphrased):
 *  - Period-end closing in management accounting (the SAP CO practice is the
 *    reference discipline): internal allocations are POSTED as dated, zero-sum,
 *    reversible documents per period, and a closed period is locked — corrected
 *    by a dated reversal that posts opposite signs, never by editing history.
 *  - Responsibility accounting (Anthony & Govindarajan): a posting binds each
 *    line's charge to the ONE envelope that line's authority is granted in, so
 *    the variance lands on the centre that holds the authority.
 *  - CO/FI separation: an internal charge and its identical credit live in
 *    their own zero-sum ledger. They are JOINED to the financial envelopes on
 *    read and printed beside them — never written into the envelope's own
 *    arithmetic, because an internal credit is not negative spend and a
 *    fabricated contra-line would falsify the envelope record (ADR-0142's
 *    "one envelope, never split" rule, applied to money a second time).
 *  - Auditability (the engagement standard of ISA 230 applied to an internal
 *    record): the posting freezes WHAT was posted, FROM which statement, under
 *    WHICH claims — so a later drift between the frozen document and the
 *    re-derived statement is detectable and printed, never absorbed.
 *
 * Leaf module: imports nothing, so schema, read model, rule, actions, CSV and
 * view can all depend on it without a cycle.
 */

export const CHARGEBACK_POSTING_RULE_ID = 'RULE-CBP-01';
export const CHARGEBACK_POSTING_ADR = 'ADR-0194';
export const CHARGEBACK_POSTING_ENGINE_VERSION = 'chargeback-posting-2026.11-v1';

export const CHARGEBACK_POSTING_EVENTS = Object.freeze({
  POSTED: 'chargeback.posting.posted',
  REVERSED: 'chargeback.posting.reversed',
  SCAN: 'chargeback.posting.scan',
  CONVENTIONS: 'chargeback.posting.conventions',
});

export const CHARGEBACK_POSTING_RIGHTS = Object.freeze({
  /** Post or reverse a period posting. VP+ deliberately: the act binds the WHOLE workspace statement, not one span. */
  POST: 'post-chargeback',
  /** Scan and conventions ride the existing chargeback governance right (ADR-0177). */
  GOVERN: 'govern-transfer-prices',
});

/** The two dated acts. Nothing else is ever stored about a posting. */
export const CHARGEBACK_POSTING_ACT_KINDS = Object.freeze(['post', 'reverse']);
/** How an act reached the record. `operator` is a scribed statement, not an authenticated one. */
export const CHARGEBACK_POSTING_VIAS = Object.freeze(['seat', 'operator']);

export const CHARGEBACK_POSTING_LIMITS = Object.freeze({
  acts: 500,
  markers: 1000,
  idMax: 80,
  noteMax: 280,
  reasonMin: 10,
  reasonMax: 280,
  /** Accounts in one posting. The whole-workspace statement is bounded by the roster. */
  rowsPerPosting: 300,
  /** A stored posting period, inclusive days. The door only stores a window the period ledger resolved. */
  periodDaysMax: 1000,
  asksPerCommit: 4,
  engineVersionMax: 80,
  /** Printed posting documents; the remainder is counted, never dropped from a total. */
  postings: 100,
  /** Printed per-account drift lines per posting; the remainder is counted. */
  drifts: 20,
});

export const CHARGEBACK_POSTING_DEFAULTS = Object.freeze({ askDueDays: 10, autoPropagate: true });
export const CHARGEBACK_POSTING_BOUNDS = Object.freeze({ askDueDays: Object.freeze([1, 30]) });

/** One state per posting document. Derived on read; never stored. */
export const CHARGEBACK_POSTING_STATES = Object.freeze(['posted', 'reversed']);
export const CHARGEBACK_POSTING_STATE_LABELS = Object.freeze({
  posted: 'Posted',
  reversed: 'Reversed',
});
export const CHARGEBACK_POSTING_STATE_TONES = Object.freeze({ posted: 'good', reversed: 'neutral' });

/**
 * What re-deriving the posting's own period says about the frozen figures
 * TODAY. Reported, never corrected: a drifted posting stays exactly as it was
 * signed, and the drift is the finding.
 */
export const CHARGEBACK_AUDIT_VERDICTS = Object.freeze([
  'faithful', 'drifted', 'statement-regressed', 'window-unreadable', 'not-audited',
]);
export const CHARGEBACK_AUDIT_LABELS = Object.freeze({
  faithful: 'Faithful — the record still reproduces every posted cent',
  drifted: 'Drifted — the re-derived statement no longer matches the posted figures',
  'statement-regressed': 'Statement regressed — the period is no longer complete',
  'window-unreadable': 'Period unreadable — the stored window is refused by the period ledger',
  'not-audited': 'Not audited — a reversed posting is history, not a claim',
});
export const CHARGEBACK_AUDIT_TONES = Object.freeze({
  faithful: 'good', drifted: 'bad', 'statement-regressed': 'warn', 'window-unreadable': 'bad', 'not-audited': 'neutral',
});
export const CHARGEBACK_AUDIT_REASONS = Object.freeze({
  faithful: 'The statement re-derived for this posting’s own period and currency reproduces every account’s charged and credited cents exactly, as integer equality.',
  drifted: 'A price was voided, a share was retuned, a home-line day was re-recorded or a person’s records changed AFTER this was posted. The posting keeps what was signed; the drift is printed account by account and is the finding, not an error to overwrite.',
  'statement-regressed': 'The period this posting froze no longer reads complete — share-days have fallen back to refused. The posted figures remain what was signed; the regression is reported beside them.',
  'window-unreadable': 'The period ledger refuses the stored window, so no comparison statement can be derived. Nothing is clamped and nothing is guessed.',
  'not-audited': 'A reversed posting makes no current claim, so no comparison is run against it.',
});

/**
 * One state per (account, envelope) binding, re-checked on every read. A
 * binding that decayed is reported with its reason — the posting is never
 * edited and no replacement envelope is guessed.
 */
export const CHARGEBACK_BINDING_STATES = Object.freeze([
  'bound', 'no-envelope', 'envelope-missing', 'envelope-inactive', 'owner-changed', 'currency-changed',
]);
export const CHARGEBACK_BINDING_LABELS = Object.freeze({
  bound: 'Bound',
  'no-envelope': 'No envelope — declared',
  'envelope-missing': 'Envelope no longer on the record',
  'envelope-inactive': 'Envelope no longer active',
  'owner-changed': 'Envelope owner changed',
  'currency-changed': 'Envelope currency changed',
});
export const CHARGEBACK_BINDING_TONES = Object.freeze({
  bound: 'good', 'no-envelope': 'warn', 'envelope-missing': 'bad', 'envelope-inactive': 'warn', 'owner-changed': 'bad', 'currency-changed': 'bad',
});
export const CHARGEBACK_BINDING_REASONS = Object.freeze({
  bound: 'The named budget envelope exists, is active, is held by this line’s manager and is recorded in this posting’s currency.',
  'no-envelope': 'The poster declared, with a written reason, that this line has no budget envelope to stand the amount against. The declaration is printed, never silently accepted as a binding.',
  'envelope-missing': 'The budget envelope this row was bound to is no longer on the record. The posting keeps the binding as signed; the absence is the finding.',
  'envelope-inactive': 'The bound envelope is no longer active (closed or archived). The posted amount stands against a period record, not a live authority.',
  'owner-changed': 'The bound envelope is no longer owned by the manager whose line was charged or credited. Responsibility accounting broke between posting and today; nothing is re-pointed.',
  'currency-changed': 'The bound envelope is no longer recorded in this posting’s currency. The figures are not comparable and are not converted.',
});

/** The default-quarter standing: can this workspace post, per currency? */
export const CHARGEBACK_STANDING_STATES = Object.freeze([
  'inert', 'not-postable', 'postable', 'posted', 'posted-drifted', 'conflicted',
]);
export const CHARGEBACK_STANDING_LABELS = Object.freeze({
  inert: 'Nothing to post',
  'not-postable': 'Not postable — the statement is incomplete',
  postable: 'Postable — the statement is complete and unposted',
  posted: 'Posted',
  'posted-drifted': 'Posted, and the record has since drifted',
  conflicted: 'Conflicted — more than one live posting covers this period and currency',
});
export const CHARGEBACK_STANDING_TONES = Object.freeze({
  inert: 'neutral', 'not-postable': 'warn', postable: 'warn', posted: 'good', 'posted-drifted': 'bad', conflicted: 'bad',
});

export const CHARGEBACK_POSTING_RULE_RELATIONS = Object.freeze(['rolls-up-to']);

export const CHARGEBACK_POSTING_QUESTIONS = Object.freeze([
  'The quarter’s chargeback statement finally reads complete. Who turns it from a reading into a period fact — and against which envelopes?',
  'Which lines’ internal labour charges stand against a named budget envelope, and which stand against a written “no envelope” declaration?',
  'A price was voided after the quarter was posted. Does the posted document still match what the record derives today — and exactly where not?',
  'Has anything been posted twice for one period and currency, and has every reversal got a dated reason on it?',
]);

export const CHARGEBACK_POSTING_METHOD = Object.freeze([
  'A posting is a dated human act that freezes ONE period and ONE currency of the whole-workspace chargeback statement (ADR-0177): per line, the charged and credited integer cents; in total, the zero-sum identity; and the four statement claims in force at the moment of posting. The figures are taken from the statement engine at the door — a poster cannot type an amount.',
  'A posting is REFUSED while the statement is incomplete: any unpriced share-day, any unknown lender, any broken period-ledger identity, any unsafe sum, or a refused window refuses the act with the exact failing claim printed. SAP CO will allocate at plan rates and correct later; this ledger deliberately will not — an incomplete statement is not postable, full stop.',
  'Every posted line is BOUND to a budget envelope (ADR-0142) owned by that line’s manager, active, and recorded in the posting’s currency — or carries an explicit written “no envelope” declaration. A binding is validated at the door and re-checked on every read; a binding that has since decayed (envelope gone, owner changed, currency changed, envelope closed) is printed with its reason and never silently re-pointed.',
  'The posting ledger is the chargeback analogue of a CO document: internal charges and credits net to exactly zero inside it, per posting, as integer equality. It never writes a budget line: an internal credit is not negative spend, and the envelope’s own ceiling, actuals and headroom arithmetic (`evaluateBudget`) is left untouched. The join is printed beside the envelope, labelled, exactly as ADR-0142 prints matrix overlap.',
  'One LIVE posting per (period, currency). Posting again requires a dated reversal first — an appended act with a written reason, never an edit. A reversed posting stays on the record as history; an imported workspace carrying two live postings for one period and currency is printed as CONFLICTED, and neither is picked.',
  'Every read re-derives the posting’s own period from the live record and compares it to the frozen figures, account by account, as integer equality: FAITHFUL, DRIFTED (with the exact cents then and now), STATEMENT-REGRESSED or PERIOD-UNREADABLE. Drift is reported, never corrected — the posting proves what was signed; the comparison proves whether the record still says it.',
  'RULE-CBP-01 notices a complete, unposted quarter currency and puts ONE dated ask in front of the lowest joint apex of every line the statement names — the one seat the whole internal trade rolls up to. An ambiguous apex, the workspace leader, or an off-roster apex is recorded as an identity-free observation; nobody is substituted. The rule never posts, never reverses and never binds an envelope.',
  'Seats are workflow declarations, not authentication. A posting records the seat or the operator view that signed it; accounts outside the reading seat are counted and withheld, exactly as the statement itself withholds them.',
]);

export const CHARGEBACK_POSTING_LIMITS_TEXT = Object.freeze([
  'A posting binds figures to envelopes and freezes them; it does NOT write budget lines, actuals or commitments, and no envelope ceiling, actual or headroom figure changes because of it. The envelope’s own record stays whole (ADR-0142); the posted position is printed beside it, labelled.',
  'One period, one currency per posting. Currencies are never pooled and no exchange rate is applied; a multi-currency quarter is posted once per currency.',
  'The figures are the statement’s figures: declared share-days × two-key prices (ADR-0177). Posting does not re-measure anything and cannot include a share-day the statement refused.',
  'Reversal restores postability; it does not restate the envelope record, because none was written. The reversed document remains on the ledger as dated history.',
  'The audit compares the posting against the record as it reads TODAY. It cannot say which intervening act moved the figures — it prints the delta, not a culprit.',
  'Asks are routed to the lowest joint apex of the statement’s lines in the matrix DAG. Where that apex is ambiguous, the workspace leader, or off the roster, an identity-free observation is recorded and nobody is asked on somebody else’s behalf.',
]);

export const CHARGEBACK_POSTING_CSV_COLUMNS = Object.freeze([
  'row_type', 'generated_on', 'scope',
  'postings', 'postings_live', 'postings_reversed', 'postings_conflicted',
  'audits_faithful', 'audits_drifted', 'audits_statement_regressed', 'audits_window_unreadable', 'audits_not_audited', 'audits_reconcile',
  'rows_total', 'rows_bound', 'rows_no_envelope', 'rows_decayed', 'rows_reconcile',
  'quarter_from', 'quarter_to', 'quarter_state', 'quarter_reason',
  'currencies_postable', 'currencies_posted', 'currencies_posted_drifted', 'currencies_conflicted',
  'open_asks',
  'period_from', 'period_to', 'period_days', 'currency', 'posting_state', 'audit_verdict',
  'posted_on', 'reversed_on', 'via',
  'rows_n', 'rows_bound_n', 'rows_no_envelope_n', 'rows_decayed_n',
  'entries', 'priced_share_days',
  'total_charged_cents', 'total_credited_cents', 'total_charged', 'total_credited', 'zero_sum',
  'engine_version',
]);

export const CHARGEBACK_POSTING_CSV_DESCRIPTOR = Object.freeze({
  key: 'chargeback-postings',
  label: 'Chargeback period postings (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'chargeback-postings',
  description: 'One summary row for the chargeback posting ledger — how many period postings exist, how many are live, reversed or conflicted, what today’s re-derivation says about each (faithful / drifted / regressed / unreadable), how many posted lines are bound to a budget envelope, declared unbound, or have decayed bindings, and the last completed quarter’s postability per currency — plus one row per posting with its period, currency, frozen integer-cent totals and zero-sum check. Aggregate and identity-free: no person, manager, envelope name or id, note or reason text is exported. A withheld figure is a BLANK cell, never a zero.',
});
