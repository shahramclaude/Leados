/**
 * app/core/domain/standardWaiverRegistry.js — closed vocabulary for the
 * Temporary Standard Waiver Register (ADR-0212, Schema v166, `RULE-TSW-01`,
 * CSV #154, `#/standard-work?panel=waivers`).
 *
 * THE DUTY. Leader standard work declares what a leader's repeatable job is
 * supposed to look like (`standardWorkRoutines.standard`). Real work departs
 * from a written standard constantly, and almost always for a reason a good
 * manager would accept: the machine is down, the relief did not arrive, the
 * material is late, the only qualified person is on leave. The dangerous part
 * is not the departure. It is the departure that is never dated, never
 * authorised, never bounded, and — six months later — is simply how the work is
 * done. Vaughan (*The Challenger Launch Decision*, 1996) named that process
 * NORMALIZATION OF DEVIANCE: each exception is individually reasonable and the
 * accumulation is invisible. Reason (1997) separates a ROUTINE violation, which
 * a workgroup has quietly made the norm, from an EXCEPTIONAL one a person knows
 * is a departure. A written standard with no record of its own exceptions
 * cannot tell the two apart, and a supervisor cannot govern what leaves no
 * trace.
 *
 * So this register stores one thing only: a DATED, BOUNDED, AUTHORISED
 * suspension of one routine's written standard, with what stands in for the
 * standard while it is suspended, and a closing decision on the day it ends.
 * Every state, coverage figure, chain length and verdict is DERIVED on read
 * from those rows plus the routine they name. Nothing derived is stored, so a
 * printed figure cannot drift from the record beneath it.
 *
 * WHAT IT IS NOT. It is not a pause on automation (that is `pausePermits.js`,
 * ADR-0182 — a permit to silence a RULE). It is not a non-conformance record:
 * it does not judge whether the departure was right, does not rate a person,
 * and never rewrites a standard. It records AUTHORITY over a departure and the
 * day the authority ended.
 *
 * Leaf module: NO imports, so schema, reader, rule, actions, CSV and view can
 * all depend on it without a cycle.
 */

export const STANDARD_WAIVER_ENGINE_VERSION = 'standard-waiver-2026.11-v1';
export const STANDARD_WAIVER_ADR = 'ADR-0212';
export const STANDARD_WAIVER_RULE_ID = 'RULE-TSW-01';
export const STANDARD_WAIVER_ROUTE = 'standard-work';
export const STANDARD_WAIVER_PANEL = 'waivers';
export const STANDARD_WAIVER_CSV_SCOPE = 'standard-work-waivers';
export const STANDARD_WAIVER_MARKER_KIND = 'standard-waiver';

export const STANDARD_WAIVER_EVENTS = Object.freeze({
  REQUESTED: 'standardwaiver.requested',
  GRANTED: 'standardwaiver.granted',
  REFUSED: 'standardwaiver.refused',
  DECIDED: 'standardwaiver.decided',
  REVOKED: 'standardwaiver.revoked',
  CONVENTIONS: 'standardwaiver.conventions.set',
  SCAN: 'standardwaiver.scan',
});
export const STANDARD_WAIVER_EVENT_PREFIX = 'standardwaiver.';

/**
 * Five human acts, and the reason they are five rather than three: the person
 * who owes the standard is the only one who may ASK for it to be set aside; the
 * line holder above them is the only one who may AUTHORISE it; the person who
 * owes it is the only one who may record that the standard is back in force;
 * and governance is somebody else's convention to set.
 *
 * That split is the whole control. A person who could authorise their own
 * departure has no waiver — they have an excuse with a date on it.
 */
export const STANDARD_WAIVER_RIGHTS = Object.freeze({
  READ: 'read-standard-work-waivers',
  REQUEST: 'request-standard-work-waiver',
  AUTHORISE: 'authorise-standard-work-waiver',
  DECIDE: 'decide-standard-work-waiver',
  GOVERN: 'govern-standard-work-waivers',
});

export const STANDARD_WAIVER_LIMITS = Object.freeze({
  requests: 1200,
  grants: 1200,
  decisions: 600,
  markers: 600,
  idMax: 80,
  routineIdMax: 80,
  /** A reason shorter than this is a shrug with a date on it. */
  reasonMin: 20,
  reasonMax: 400,
  /** What stands in for the standard while it is suspended. Required. */
  safeguardMin: 12,
  safeguardMax: 300,
  /** The written basis of a grant, a refusal, a decision or a revocation. */
  basisMin: 12,
  basisMax: 300,
  asksPerCommit: 4,
  rowsCap: 400,
  askRows: 100,
  /** Hard ceiling on any waiver window, whatever the conventions say. */
  maxWindowDays: 90,
});

export const STANDARD_WAIVER_DEFAULTS = Object.freeze({
  /** Days a grant covers when the authoriser accepts the request as asked. */
  defaultDays: 14,
  /** The longest window any grant may cover. */
  maxDays: 30,
  /** A contiguous renewal chain this long stops being temporary. */
  renewalReviewAfter: 3,
  askDueDays: 7,
  /** How far back the coverage and chain readings look. */
  horizonDays: 180,
  /** Closed owed slots needed before a waived share is printed at all. */
  minOwedSlots: 8,
  autoPropagate: true,
});

export const STANDARD_WAIVER_BOUNDS = Object.freeze({
  defaultDays: Object.freeze([1, 90]),
  maxDays: Object.freeze([1, 90]),
  renewalReviewAfter: Object.freeze([2, 12]),
  askDueDays: Object.freeze([1, 30]),
  horizonDays: Object.freeze([90, 365]),
  minOwedSlots: Object.freeze([5, 30]),
});

/** Convention name → the settings key it is stored under. One table. */
export const STANDARD_WAIVER_SETTING_KEYS = Object.freeze({
  defaultDays: 'standardWaiverDefaultDays',
  maxDays: 'standardWaiverMaxDays',
  renewalReviewAfter: 'standardWaiverRenewalReviewAfter',
  askDueDays: 'standardWaiverAskDueDays',
  horizonDays: 'standardWaiverHorizonDays',
  minOwedSlots: 'standardWaiverMinOwedSlots',
  autoPropagate: 'standardWaiverAutoPropagate',
});

export const STANDARD_WAIVER_SETTING_LABELS = Object.freeze({
  defaultDays: 'Days a grant covers when the request does not say (1–90)',
  maxDays: 'Longest window any grant may cover (1–90)',
  renewalReviewAfter: 'Contiguous renewals that stop being temporary (2–12)',
  askDueDays: 'Days allowed for a waiver ask',
  horizonDays: 'Days the coverage and chain readings look back (90–365)',
  minOwedSlots: 'Closed owed slots needed before a waived share is printed (5–30)',
  autoPropagate: 'Raise waiver asks automatically',
});

/**
 * WHY a standard is being set aside. Closed, and deliberately about the WORK,
 * never about the person: a departure reasoned as "I didn't feel like it" is not
 * a kind the register will carry, and a departure reasoned as a capacity
 * shortfall can be counted across routines and months without naming anyone.
 */
export const STANDARD_WAIVER_KINDS = Object.freeze([
  Object.freeze({ key: 'capacity', label: 'Capacity shortfall', says: 'Not enough hours or hands to do it as written.' }),
  Object.freeze({ key: 'material', label: 'Material or supply', says: 'The input the standard assumes was not there.' }),
  Object.freeze({ key: 'equipment', label: 'Equipment unavailable', says: 'The tool, machine or system the standard relies on was down.' }),
  Object.freeze({ key: 'skill', label: 'Skill or qualification gap', says: 'Nobody available was qualified to do it as written.' }),
  Object.freeze({ key: 'demand', label: 'Demand surge or interruption', says: 'An unplanned demand or interruption displaced the routine.' }),
  Object.freeze({ key: 'information', label: 'Information missing', says: 'The data the standard depends on was not available in time.' }),
  Object.freeze({ key: 'other', label: 'Other declared reason', says: 'A reason the kinds above do not name. The written reason carries it.' }),
]);
export const STANDARD_WAIVER_KIND_KEYS = Object.freeze(STANDARD_WAIVER_KINDS.map((row) => row.key));
export const STANDARD_WAIVER_KIND_BY_KEY = Object.freeze(Object.fromEntries(STANDARD_WAIVER_KINDS.map((row) => [row.key, row])));

/**
 * The state of one REQUEST, derived on read, never stored. Closed and in
 * precedence order — the first that applies wins, so a request is never two
 * things at once on one screen.
 */
export const STANDARD_WAIVER_STATES = Object.freeze([
  'refused',
  'lapsed-request',
  'requested',
  'revoked',
  'restored',
  'ended-with-routine',
  'renewed',
  'in-force',
  'pending-start',
  'expired-unrestored',
]);
export const STANDARD_WAIVER_STATE_BY_KEY = Object.freeze({
  refused: Object.freeze({
    label: 'Refused',
    tone: 'neutral',
    says: 'The line holder refused this request with a written basis. No authority to depart exists, and the standard stands exactly as written.',
  }),
  'lapsed-request': Object.freeze({
    label: 'Request lapsed',
    tone: 'neutral',
    says: 'The request named a window that has passed and no line holder ever answered it. Nothing was ever authorised, so nothing was departed from under this record.',
  }),
  requested: Object.freeze({
    label: 'Awaiting the line holder',
    tone: 'warn',
    says: 'The request is dated and on the record; the line holder has not granted or refused it. No authority to depart exists yet, whatever the window says.',
  }),
  revoked: Object.freeze({
    label: 'Revoked',
    tone: 'neutral',
    says: 'Authority was withdrawn before its last day, with a written reason. The standard was back in force from the revocation day.',
  }),
  restored: Object.freeze({
    label: 'Standard restored',
    tone: 'good',
    says: 'A dated decision records that the written standard is back in force. The departure ended on the day that decision names.',
  }),
  'ended-with-routine': Object.freeze({
    label: 'Ended with the routine',
    tone: 'neutral',
    says: 'The routine itself was retired, so there is no standard left to restore. The register checked that the retirement exists on or before the decision day.',
  }),
  renewed: Object.freeze({
    label: 'Continued by a renewal',
    tone: 'warn',
    says: 'A later grant names this one as its predecessor and starts no later than the day after it ends, so the departure continued without a day back on standard. The chain length is what the review condition reads.',
  }),
  'in-force': Object.freeze({
    label: 'In force',
    tone: 'warn',
    says: 'A live grant covers today: the line holder authorised this departure, with a written reason, a safeguard and a last day.',
  }),
  'pending-start': Object.freeze({
    label: 'Granted, not started',
    tone: 'neutral',
    says: 'The line holder granted a window that begins in the future. The standard is still in force today.',
  }),
  'expired-unrestored': Object.freeze({
    label: 'Expired, never restored',
    tone: 'bad',
    says: 'The last day passed, no decision records the standard back in force, and no later grant continued it. The departure now outlives the authority for it — the exact state in which an exception becomes the standard by silence.',
  }),
});

/** One verdict per routine over the whole reading horizon. Closed. */
export const STANDARD_WAIVER_ROUTINE_STATES = Object.freeze(['never-waived', 'clear', 'waived', 'lapsed']);
export const STANDARD_WAIVER_ROUTINE_STATE_BY_KEY = Object.freeze({
  'never-waived': Object.freeze({ label: 'Never waived', tone: 'good', says: 'No request has ever been recorded against this routine. The written standard stands as declared.' }),
  clear: Object.freeze({ label: 'Standard in force', tone: 'good', says: 'Every departure on this routine is closed: granted, and ended by a decision or a revocation. Something else may be stopping it — this register only says the standard is not.' }),
  waived: Object.freeze({ label: 'Waived today', tone: 'warn', says: 'A live grant covers today. The standard as written is not what is being done, and the record says so.' }),
  lapsed: Object.freeze({ label: 'Suspended by silence', tone: 'bad', says: 'A grant ended without a decision and without a continuation. Until someone decides, the register cannot tell a standard from a habit.' }),
});

/**
 * Why an act was refused. Closed. A refusal is never stored as a waiver; it is
 * a verdict returned to the person who tried the act, with its sentence.
 */
export const STANDARD_WAIVER_REFUSALS = Object.freeze([
  'unknown-routine',
  'routine-retired',
  'not-the-owner',
  'not-on-roster',
  'reason-too-short',
  'no-safeguard',
  'bad-window',
  'window-too-long',
  'window-in-the-past',
  'already-covered',
  'duplicate-window',
  'self-authorisation',
  'not-the-line-holder',
  'line-ended',
  'no-authority',
  'authoriser-off-roster',
  'request-not-found',
  'not-owner-or-holder',
  'already-answered',
  'not-granted',
  'already-decided',
  'future-decision',
  'decision-before-start',
  'routine-not-retired',
  'renewal-not-granted',
  'renewal-not-adjacent',
  'renewal-wrong-routine',
  'basis-too-short',
  'revocation-window',
  'ledger-full',
]);
export const STANDARD_WAIVER_REFUSAL_REASONS = Object.freeze({
  'unknown-routine': 'No routine on the standard-work board has that id, so there is no written standard to depart from.',
  'routine-retired': 'The routine is retired. There is no live standard to set aside; a departure from a retired routine is not a departure.',
  'not-the-owner': 'A waiver is requested by the person who owes the standard. Nobody can ask for someone else’s standard to be set aside on their behalf.',
  'not-on-roster': 'The person named is not on the active roster, so the register cannot tell which line the routine is owed under.',
  'reason-too-short': 'The written reason is shorter than the declared floor. A departure is authorised by a reason a reader six months later can act on.',
  'no-safeguard': 'No safeguard was declared. A standard set aside without saying what stands in for it is an unmonitored gap.',
  'bad-window': 'The first and last day are missing, reversed or unreadable. A waiver is a bounded window, not an open-ended permission.',
  'window-too-long': 'The window is longer than the declared maximum. A departure that needs longer is a change of standard, and that is a different decision.',
  'window-in-the-past': 'The window starts before today. A waiver authorises a departure before it happens; one dated backwards is a pardon, not a permission.',
  'already-covered': 'A live grant already covers today for this routine. Two live authorities for one departure would leave nobody answerable for it.',
  'duplicate-window': 'An identical request for this routine is already on the record. Asking twice does not strengthen it.',
  'self-authorisation': 'The acting seat is the person who owes the standard. A waiver authorised by the person it excuses is not an authorisation.',
  'not-the-line-holder': 'Only the holder of the line the routine is owed under may authorise a departure from it. Nobody above or beside that line is substituted.',
  'line-ended': 'The line this routine is owed under has ended. Nobody holds it, so nobody can authorise the departure; the action says so instead of naming a manager who no longer does.',
  'no-authority': 'Nobody is above this routine’s owner on the line it is owed under — the owner is the workspace leader, or is the top of their chain. A departure at the top of the organisation has no line holder to authorise it, and this register will not authorise it for them.',
  'authoriser-off-roster': 'The line holder is no longer on the active roster, so the authority has no holder. The record keeps the history; a new request needs a new holder.',
  'request-not-found': 'No request with that id is on the register.',
  'not-owner-or-holder': 'This act belongs to the person who owes the standard or the holder of the line it is owed under. Nobody else performs it.',
  'already-answered': 'The line holder has already granted or refused this request. One request, one answer.',
  'not-granted': 'This request was never granted, so there is no authority to decide or revoke.',
  'already-decided': 'A closing decision is already recorded against this waiver. A second one would rewrite history rather than close it.',
  'future-decision': 'A decision dated after today would report the standard back in force in a future nobody has lived through.',
  'decision-before-start': 'The decision day is before the departure began. A standard cannot be restored before it was suspended.',
  'routine-not-retired': 'The decision says the routine was retired, and the routine is not retired on that day. The register refuses a claim about the record that the record contradicts.',
  'renewal-not-granted': 'A renewal must continue a request that was actually GRANTED. Continuing a refused or unanswered request would create authority out of nothing.',
  'renewal-not-adjacent': 'A renewal must start no later than the day after its predecessor ends. A gap of two days or more means the standard was back in force: that is a new departure, and it must be asked for as one.',
  'renewal-wrong-routine': 'A renewal must continue a waiver of the SAME routine owed by the SAME person. Anything else is a different departure wearing a continuation’s date.',
  'basis-too-short': 'A written basis is required, above the declared floor. An authorisation, a refusal and a restoration are all decisions somebody will have to answer for.',
  'revocation-window': 'Only a grant whose window has not yet passed can be revoked. A window that already ended is closed by a decision, not withdrawn.',
  'ledger-full': 'The register is at its declared cap. It is exported before more rows are written, because a register that silently drops a waiver is worse than one that refuses the next.',
});

/** What a decision can say. Both are checkable against the record. Closed. */
export const STANDARD_WAIVER_DECISION_KINDS = Object.freeze([
  Object.freeze({ key: 'restored', label: 'The standard is back in force', says: 'The written standard is being done again from the day recorded.' }),
  Object.freeze({ key: 'ended-with-routine', label: 'The routine was retired', says: 'There is no standard left to restore. The routine’s retirement is on the record on or before this day.' }),
]);
export const STANDARD_WAIVER_DECISION_KEYS = Object.freeze(STANDARD_WAIVER_DECISION_KINDS.map((row) => row.key));
export const STANDARD_WAIVER_DECISION_BY_KEY = Object.freeze(Object.fromEntries(STANDARD_WAIVER_DECISION_KINDS.map((row) => [row.key, row])));

/**
 * The frameworks this register applies, named rather than gestured at. Each one
 * supplies a specific design decision above; none is decoration.
 */
export const STANDARD_WAIVER_FRAMEWORKS = Object.freeze([
  Object.freeze({
    key: 'normalization-of-deviance',
    name: 'Normalization of deviance (Vaughan, 1996)',
    applies: 'Every departure is dated, bounded and closed, and a contiguous renewal chain is counted, because the failure mode is not one bad exception — it is an accumulation nobody totalled.',
  }),
  Object.freeze({
    key: 'violation-taxonomy',
    name: 'Routine vs exceptional violation (Reason, 1997)',
    applies: 'The kind, the chain length and the waived share separate a departure a workgroup knows it is making from one that has quietly become the norm. The register prints the evidence; it does not convict.',
  }),
  Object.freeze({
    key: 'permit-to-work',
    name: 'Permit-to-work / bypass management (ISA-84, IEC 61511)',
    applies: 'An authoriser, a written reason, a safeguard, a first and last day, and a closing decision — the control set industry uses when protective function is deliberately suspended.',
  }),
  Object.freeze({
    key: 'moc',
    name: 'Management of change (ISO 9001:2015 §8.5.6; OSHA 1910.119)',
    applies: 'A temporary change must be time-limited, authorised and reviewed; when it is renewed repeatedly the standard or the practice has to change. That is the review condition.',
  }),
  Object.freeze({
    key: 'concession',
    name: 'Concession / planned deviation (ISO 9001:2015 §8.7; ICH Q7)',
    applies: 'The authority to accept a departure is distinct from the authority to do the work, is written down before it is used, and expires on a stated day.',
  }),
  Object.freeze({
    key: 'safety-ii',
    name: 'Work-as-done vs work-as-imagined (Hollnagel, 2012)',
    applies: 'A waiver is a first-class record of the gap between the written standard and the work, not a defect record about the person who reported it.',
  }),
]);

export const STANDARD_WAIVER_METHOD = Object.freeze([
  'A waiver is ONE dated request by the person who owes the routine’s standard, and ONE dated answer by the holder of the line that routine is owed under — granted with a written basis and a window, or refused with a written basis. The requester and the authoriser are never the same person, and the register refuses the act rather than recording self-authorisation.',
  'A granted waiver names a first and a last day, never a longer window than the conventions allow and never starting in the past. It also carries what stands in for the standard while it is suspended, in the requester’s own words. A departure with no safeguard is refused at the door.',
  'The authoriser may narrow the requested window but never widen it: a grant outside the window that was asked for is refused, because authority is granted over what was asked and nothing more.',
  'Every state on this screen is derived on read from the request, its answer, its closing decision and the routine. Nothing derived — no state, no chain length, no coverage share, no verdict — is stored, so a hand-edited file cannot carry an authority its own rows do not imply.',
  'A renewal continues a granted waiver of the same routine and the same person, and must start no later than the day after its predecessor ends. A gap of two days or more means the standard was back in force: that is a new departure and must be asked for as one. A contiguous chain is counted, because a temporary departure renewed five times is not temporary.',
  'A departure does not end because its last day passed. It ends when a dated decision records the standard back in force, or when it is revoked, or when the routine itself was retired on or before the decision day. A grant whose last day has passed with none of those on the record reads “expired, never restored” — the state in which the exception has outlived the authority and is now the standard by silence.',
  'Coverage is exact and narrow. A closed owed slot counts as waived only when EVERY day of its window is covered by a granted, unrevoked waiver. One waived day in a weekly routine does not waive the week. Below the declared floor of closed slots the share is withheld with its counts printed, because a percentage on four observations is decoration.',
  'The register never scores a person, never records a judgement about whether a departure was wise, never rewrites a routine’s standard and never infers a reason from text. Where the line a routine is owed under has ended, or the owner sits at the top of the chain, it prints that nobody can authorise the departure rather than choosing a manager for them.',
]);

export const STANDARD_WAIVER_CSV_COLUMNS = Object.freeze([
  'row_type', 'generated_on', 'scope', 'detail_level', 'engine_version',
  'state_key', 'state_n', 'routine_code', 'routine_state',
  'routines_n', 'routines_never_waived_n', 'routines_clear_n', 'routines_waived_n', 'routines_lapsed_n',
  'requests_n', 'requests_requested_n', 'requests_refused_n', 'requests_lapsed_n',
  'waivers_granted_n', 'waivers_live_n', 'waivers_pending_start_n', 'waivers_renewed_n',
  'waivers_restored_n', 'waivers_ended_with_routine_n', 'waivers_revoked_n', 'waivers_expired_unrestored_n',
  'states_sum_n', 'requests_reconcile', 'balances', 'audit_clean',
  'closed_owed_slots_n', 'waived_slots_n', 'waived_share_pct', 'waived_share_withheld_reason',
  'chains_n', 'longest_chain_n', 'chains_review_due_n', 'renewals_broken_n',
  'self_authorised_n', 'authority_moved_n', 'decisions_before_start_n', 'duplicate_decisions_n',
  'coverage_withheld_n', 'figures_complete', 'claim_reason',
  'max_days', 'renewal_review_after', 'horizon_days', 'ask_due_days',
]);

export const STANDARD_WAIVER_CSV_DESCRIPTOR = Object.freeze({
  key: 'standard-work-waivers',
  label: 'Temporary standard work waivers (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'standard-work-waivers',
  description: 'One workspace summary row plus one row per derived state and one row per routine under an opaque positional code: how many declared routines have ever been waived and how they stand today (never waived, standard in force, waived today, suspended by silence); how many requests were made, answered and refused; how the granted waivers divide between live, pending, renewed, restored, ended with the routine, revoked and expired-never-restored, reconciled to the granted total; the closed owed slots and how many were wholly waived, with the share withheld and its reason below the declared floor; renewal chains, the longest chain and how many need a review; and the integrity counts (self-authorised, authority moved, renewals that do not resolve, decisions before the departure began). NO person, manager, routine id, routine title, reason, safeguard or basis text crosses this boundary.',
});

/** How much of the register a seat is shown. Mirrors the altitude ladder. */
export const STANDARD_WAIVER_DETAIL_LEVELS = Object.freeze(['visible', 'summary', 'none']);
export const STANDARD_WAIVER_DETAIL_REASONS = Object.freeze({
  visible: '',
  summary: 'This seat reads the routines in its span by name and their derived states. The written reason, the safeguard and the basis of each act are withheld as text: the panel prints only that one is recorded.',
  none: 'This seat reads counts only. No routine, owner, reason, safeguard or basis is returned.',
});
