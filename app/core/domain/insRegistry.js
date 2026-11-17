/**
 * app/core/domain/insRegistry.js — the closed vocabulary of the Insurance
 * Notification & Recovery Register (ADR-0249, Schema v203, `#/insurance`,
 * `RULE-INS-01`, CSV scope #190).
 *
 * THE DUTY, IN A CHIEF FINANCIAL OFFICER'S WORDS. *"The claim register tells us
 * what is asserted against us and what it costs gross. It does not tell us what
 * insurance pays. A claim can be perfectly governed on the limitation clock and
 * still be out of time on the notification — and an insurer that was told late
 * does not pay, however good the merits were. Which policy answers for this
 * matter, what is the last day the insurer may be told, was it told in time, what
 * did the insurer actually pay, and what is the net cost the organisation
 * carries? The gross cost is not the net cost, and the register that only knows
 * the gross is lying by omission."*
 *
 * No surface in this workspace could answer any part of that. The claim register
 * (ADR-0248) holds the matter, the accrual, the period, the proved suspensions,
 * the concessions and the computed settlement authority. It holds no policy, no
 * notification window and no recovery. A claim's gross cost is not its net cost,
 * and an organisation can be well-governed on the claim and out of time on the
 * notification. This register closes that gap: it holds the policy, derives the
 * notification deadline from the policy's OWN terms, records whether the insurer
 * was told in time, records what the insurer claimed, recovered and denied, and
 * derives the net cost — the contingent liability under IAS 37 / ASC 450 — that
 * finance must carry.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. Word-boundary
 * searches of `app/` before this build returned ZERO files for `contingent
 * liability`, `deductible`, `notification window`, `insurance recovery`,
 * `notice of circumstances`, `extended reporting period` and `claims-made`. The
 * surviving hits for `insurance` are prose inside `lfgRegistry.js` (the benchmark
 * note that Xakia tracks coverage) and ADR-0248's gap list, which names this
 * register as the unbuilt item. `provision` survives only as prose about a
 * reserve being a provision, not as a computed figure. Wider absence
 * **[UNVERIFIED]**.
 *
 * THE BENCHMARKED CATEGORY SETS THIS BAR [vendor documentation fetched
 * 2026-11-17; hands-on parity UNVERIFIED]. The bar is four mechanics, and this
 * register must match all four:
 *
 *   1. **A policy register with the insurer, the period, the limit and the
 *      deductible** — Xakia's Dispute Log tracks `insurance coverage` against a
 *      matter; enterprise legal management (TeamConnect, Legal Tracker) holds the
 *      policy as a first-class record with its limits.
 *   2. **A notification deadline derived from the policy's own terms** — insurance
 *      practice requires timely notice, "as soon as practicable" or within a
 *      stated window; claims-made forms require notice during the policy period
 *      or a short window after, and a notice of circumstances locks a future
 *      claim into the current policy year. The deadline is a function of the
 *      trigger day and the window the policy declares — never a date somebody
 *      typed.
 *   3. **A recovery ledger: claimed, recovered, denied, outstanding** — the
 *      insurer's answer is a dated act with an exact amount, and a denial is a
 *      fact with a reason, not a disappearance.
 *   4. **The net cost, carried into finance** — the gross exposure less the
 *      recovery is the contingent liability (IAS 37 / ASC 450) the organisation
 *      must provide for; the insurance asset and the provision are printed apart
 *      so neither is confused with money spent.
 *
 * WHAT THIS REGISTER ADDS THAT THE CATEGORY DOES NOT — AND WHY THAT IS THE POINT.
 * Every benchmarked product stores a notification date somebody typed and a
 * recovery number somebody entered. That is the same failure shape as a licence
 * tracker: a date is not a derived verdict and a recovery is not a tested
 * position. Five facts this register derives on read and prints apart, that a
 * stored-field product cannot express:
 *
 *   - **The notification deadline is COMPUTED from the policy's own window and
 *     the trigger day the record carries — occurrence day for an occurrence
 *     policy, claim-made day for a claims-made policy.** A policy whose window
 *     cannot be read prints `notification-unprovable` and refuses a day count;
 *     it never falls back on the opening date, because that fallback is a missed
 *     notification carrying a green tick.
 *   - **Late notification is a BREACH STATE, not a footnote.** A notification
 *     recorded after the derived deadline prints `notification-late` with the
 *     exact days it ran over, and the register says plainly that it holds no
 *     insurer feed and cannot state whether the insurer accepted the late notice.
 *   - **Cover is TESTED against the policy period, not assumed.** An occurrence
 *     day outside the policy period, or a claim-made day outside it, prints
 *     `no-cover` with the reason — the register does not pretend a policy
 *     responds because a human linked it.
 *   - **The net cost is DERIVED, not typed.** Gross exposure (from the claim
 *     register) less the recovery the insurer actually paid is the figure finance
 *     carries. A mixed-currency register prints no net total, because a rate it
 *     does not hold would have to be invented.
 *   - **A denial is kept with its reason.** The insurer's refusal is a dated act
 *     that moves the net cost back to gross; deleting it would leave the recovery
 *     ledger reading as though nothing was ever claimed.
 *
 * THE SIX THINGS THAT MUST NEVER HAPPEN, AND ARE PREVENTED BY CONSTRUCTION:
 *   - **No stored state and no stored "days left".** Every verdict is derived on
 *     read from the policy terms, the trigger day, the notification and the
 *     recovery ledger.
 *   - **No invented notification window.** A policy with no declared window is
 *     refused at the door and prints `notification-unprovable` if it arrives in
 *     an import.
 *   - **No cover assumed.** A coverage link is tested against the policy period;
 *     a link the period does not support prints `no-cover`.
 *   - **No recovery treated as received because somebody typed it.** The recovery
 *     is a dated act with an exact amount; the net cost is derived from it, and
 *     a denial moves the net cost back.
 *   - **No notification run past in silence.** A deadline that passed with no
 *     notification prints `notification-late` and the exact days it ran over —
 *     and, separately, says that the record cannot prove whether the insurer
 *     accepted the late notice, because it holds no insurer feed.
 *   - **No person scored.** No broker, no claims handler and no line is rated,
 *     ranked or named as the cause of a recovery outcome. The register reports
 *     cover and cost, not blame.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A policy names one to four responsible
 * hands across reporting lines (a risk manager, a finance lead, a group counsel).
 * The reader resolves every ACTIVE line that holds each of them through the ONE
 * matrix engine, counts a person ONCE, and derives the joint apex over every line
 * as the seat whose authority is required to answer for the notification. Where
 * the record names several hands the duty sits above all of them and the screen
 * says so; it never silently promotes one hand to "owner of the policy".
 */

export const INS_ENGINE_VERSION = 'insurance-notification-recovery-2026.11-v1';
export const INS_ADR = 'ADR-0249';
export const INS_RULE_ID = 'RULE-INS-01';
export const INS_ROUTE = 'insurance';
export const INS_HREF = '#/insurance';
export const INS_CSV_SCOPE = 'insurance-recovery';
export const INS_MARKER_KIND = 'insurance';
export const INS_EVENT_PREFIX = 'insurance.';

export const INS_EVENTS = Object.freeze({
  POLICY_DECLARED: 'insurance.policy.declared',
  COVERAGE_DECLARED: 'insurance.coverage.declared',
  NOTIFICATION_RECORDED: 'insurance.notification.recorded',
  RECOVERY_RECORDED: 'insurance.recovery.recorded',
  CONVENTIONS_SET: 'insurance.conventions.set',
  SCANNED: 'insurance.scan',
});

export const INS_RIGHTS = Object.freeze({
  READ: 'read-insurance',
  MANAGE: 'manage-insurance',
});

export const INS_SETTING_KEYS = Object.freeze({
  autoPropagate: 'insAutoPropagate',
  privacyFloor: 'insPrivacyFloor',
  warningHorizonDays: 'insWarningHorizonDays',
});

export const INS_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
  warningHorizonDays: { min: 1, max: 365 },
});

export const INS_DEFAULTS = Object.freeze({
  privacyFloor: 3,
  /**
   * The declared warning horizon. It is a WORKSPACE PLANNING convention — how far
   * ahead the bench wants to see a notification deadline — and is deliberately
   * NOT a notification window. No default notification window exists anywhere in
   * this register: a window belongs to the policy and the insurer, and it is
   * declared on the policy.
   */
  warningHorizonDays: 90,
});

export const INS_LIMITS = Object.freeze({
  policies: 400,
  coverages: 1200,
  notifications: 1200,
  recoveries: 4000,
  markers: 400,
  /** A written basis, a basis for a recovery, a note: long enough to be a source. */
  textMin: 24,
  textMax: 600,
  /** An insurer, a policy class, a notification method: bounded and non-empty. */
  shortMin: 3,
  shortMax: 120,
  /** A written policy reference on the declaration page. */
  instrumentMin: 12,
  idMax: 120,
  /**
   * The longest notification window the register will accept on one policy, in
   * days. This is a BOUND, not a default: it exists so a typo of `9000` days
   * cannot make a policy immortal, and a policy past it is refused rather than
   * clamped.
   */
  notificationWindowMaxDays: 3650,
  /** How far ahead a policy period may be declared, and how far back a policy may be backfilled. */
  aheadMaxDays: 1825,
  backfillMaxDays: 3650,
  /** How many responsible hands one policy may name. */
  holdersMax: 4,
  /** Rule asking. */
  rowsShown: 80,
});

export const INS_READ_MIN_RANK = 1;
/**
 * Rank that may declare a policy, link a coverage, record a notification or a
 * recovery, or re-declare the conventions.
 *
 * RANK 1, DELIBERATELY, AND FOR A REASON OPPOSITE TO THE LICENCE REGISTER. A
 * claim arrives at the front line, and the notification window runs from the
 * trigger day whether or not anybody senior has recognised the claim. The failure
 * this register exists to prevent is that window running out while the matter
 * waits for a senior hand to link it to a policy. What protects the record is
 * therefore not rank: it is the written policy reference, the requirement that a
 * notification window is DECLARED rather than inferred, the refusal to invent a
 * trigger day, and `RULE-INS-01` addressing the joint apex.
 */
export const INS_MANAGE_MIN_RANK = 1;

/**
 * The policy classes. Each carries the trigger the record must be able to name —
 * the fact that starts the notification window — because the commonest insurance
 * error in this domain is dating the window from the wrong day.
 *
 * `triggerIsClaimMade` marks the classes where the window runs from when the
 * claim was first made against the insured, not from when the act happened.
 */
export const INS_POLICY_CLASSES = Object.freeze([
  Object.freeze({
    key: 'general-liability',
    label: 'General / public liability',
    trigger: 'The occurrence day — the day the injury or damage happened. The window runs from the occurrence.',
    triggerIsClaimMade: false,
  }),
  Object.freeze({
    key: 'professional-indemnity',
    label: 'Professional indemnity / E&O',
    trigger: 'The claim-made day — the day the claim was first made against the insured. The window runs from the claim.',
    triggerIsClaimMade: true,
  }),
  Object.freeze({
    key: 'directors-officers',
    label: 'Directors & officers liability',
    trigger: 'The claim-made day — the day the claim was first made against the insured. The window runs from the claim.',
    triggerIsClaimMade: true,
  }),
  Object.freeze({
    key: 'employment-practices',
    label: 'Employment practices liability',
    trigger: 'The claim-made day — the day the claim was first made against the insured. The window runs from the claim.',
    triggerIsClaimMade: true,
  }),
  Object.freeze({
    key: 'property',
    label: 'Property / business interruption',
    trigger: 'The occurrence day — the day the loss happened. The window runs from the occurrence.',
    triggerIsClaimMade: false,
  }),
  Object.freeze({
    key: 'cyber',
    label: 'Cyber liability',
    trigger: 'The claim-made day — the day the claim was first made against the insured. The window runs from the claim.',
    triggerIsClaimMade: true,
  }),
  Object.freeze({
    key: 'other',
    label: 'Other — the policy states its own trigger',
    trigger: 'A class this register does not carry. The policy must state, in writing, the fact that starts the notification window, and the register prints that it is an unsupported class rather than pretending to know the trigger.',
    triggerIsClaimMade: false,
  }),
]);
export const INS_POLICY_CLASS_KEYS = Object.freeze(INS_POLICY_CLASSES.map((row) => row.key));
export const INS_POLICY_CLASS_BY_KEY = Object.freeze(Object.fromEntries(INS_POLICY_CLASSES.map((row) => [row.key, row])));

/**
 * The policy bases. An occurrence policy answers for an occurrence during its
 * period whenever the claim is finally made; a claims-made policy answers only
 * for a claim made during its period (or a permitted extension). The register
 * tests the trigger day against the period for both.
 */
export const INS_POLICY_BASES = Object.freeze([
  Object.freeze({
    key: 'occurrence',
    label: 'Occurrence',
    says: 'Coverage follows the event: the policy answers for an occurrence during its period, whenever the claim is finally made. The trigger day is the occurrence day.',
  }),
  Object.freeze({
    key: 'claims-made',
    label: 'Claims-made',
    says: 'Coverage follows the claim: the policy answers only if the claim was first made during its period. The trigger day is the claim-made day, and the notification must fall in the period or a permitted extension.',
  }),
]);
export const INS_POLICY_BASIS_KEYS = Object.freeze(INS_POLICY_BASES.map((row) => row.key));
export const INS_POLICY_BASIS_BY_KEY = Object.freeze(Object.fromEntries(INS_POLICY_BASES.map((row) => [row.key, row])));

/** The notification methods. A notification is a dated act by a named method. */
export const INS_NOTIFICATION_METHODS = Object.freeze([
  Object.freeze({ key: 'broker-notification', label: 'Broker notification', says: 'The broker was instructed in writing to notify the insurer. The broker reference is the proof.' }),
  Object.freeze({ key: 'direct-insurer', label: 'Direct to insurer', says: 'The organisation notified the insurer directly. The insurer reference is the proof.' }),
  Object.freeze({ key: 'notice-of-circumstances', label: 'Notice of circumstances', says: 'A notice of circumstances was given to lock a future claim into the current policy year. The circumstances reference is the proof.' }),
  Object.freeze({ key: 'other', label: 'Other — the record states its own method', says: 'A method this register does not carry. The record states it in writing and the register prints it as an unsupported method.' }),
]);
export const INS_NOTIFICATION_METHOD_KEYS = Object.freeze(INS_NOTIFICATION_METHODS.map((row) => row.key));
export const INS_NOTIFICATION_METHOD_BY_KEY = Object.freeze(Object.fromEntries(INS_NOTIFICATION_METHODS.map((row) => [row.key, row])));

/**
 * The recovery kinds. Every one is the insurer's answer moving, dated. `claimed`
 * opens the recovery; `recovered` and `denied` close it; `interim` is money
 * received while the claim is still open.
 */
export const INS_RECOVERY_KINDS = Object.freeze([
  Object.freeze({ key: 'claimed', label: 'Recovery claimed', says: 'The organisation claimed a stated sum from the insurer. It is the organisation’s number, not the insurer’s answer.', closesRecovery: false, movesMoney: false }),
  Object.freeze({ key: 'recovered', label: 'Recovery received', says: 'The insurer paid a stated sum. This is the only kind that reduces the net cost.', closesRecovery: true, movesMoney: true }),
  Object.freeze({ key: 'denied', label: 'Recovery denied', says: 'The insurer refused the claim, with a stated reason. The net cost moves back to gross; the denial is kept, never deleted.', closesRecovery: true, movesMoney: false }),
  Object.freeze({ key: 'interim', label: 'Interim payment', says: 'The insurer paid an interim sum while the claim is still open. It reduces the net cost but does not close the recovery.', closesRecovery: false, movesMoney: true }),
]);
export const INS_RECOVERY_KIND_KEYS = Object.freeze(INS_RECOVERY_KINDS.map((row) => row.key));
export const INS_RECOVERY_KIND_BY_KEY = Object.freeze(Object.fromEntries(INS_RECOVERY_KINDS.map((row) => [row.key, row])));

/**
 * The nine states. Each is a DIFFERENT FACT and the headline never hides the
 * flags underneath. `tone` colours the badge; `says` is what the screen prints.
 */
export const INS_STATES = Object.freeze([
  Object.freeze({
    key: 'no-cover',
    label: 'No cover',
    tone: 'bad',
    says: 'The policy does not respond to this matter: the trigger day falls outside the policy period. The register prints the reason rather than pretending a linked policy covers a claim it does not.',
  }),
  Object.freeze({
    key: 'notification-late',
    label: 'Notification late',
    tone: 'bad',
    says: 'The notification deadline passed with no notification on the record, or the notification was recorded after the derived deadline. The exact days it ran over are printed. The register holds no insurer feed and cannot say whether the insurer accepted the late notice — a record gap is not an allegation that cover was lost.',
  }),
  Object.freeze({
    key: 'notification-urgent',
    label: 'Notification urgent',
    tone: 'bad',
    says: 'The notification deadline is inside the narrowest warning band the workspace declared and the insurer has not been told. The next responsible action is already late.',
  }),
  Object.freeze({
    key: 'unnotified',
    label: 'Unnotified',
    tone: 'warn',
    says: 'The policy covers this matter and the notification deadline is in the future, but the insurer has not been told yet. The window is running.',
  }),
  Object.freeze({
    key: 'notification-unprovable',
    label: 'Notification unprovable',
    tone: 'bad',
    says: 'The record cannot derive a notification deadline: the trigger day or the policy’s declared window cannot be read. The register refuses to guess, prints no day count, and asks for the fact. A plausible default here would be a green tick over a date nobody can prove.',
  }),
  Object.freeze({
    key: 'notified-in-time',
    label: 'Notified in time',
    tone: 'good',
    says: 'The insurer was told inside the policy’s own window. No recovery has been claimed or decided yet.',
  }),
  Object.freeze({
    key: 'recovery-pending',
    label: 'Recovery pending',
    tone: 'warn',
    says: 'A recovery has been claimed and the insurer has not yet paid or denied it. The net cost is not yet known and is printed as such.',
  }),
  Object.freeze({
    key: 'recovery-denied',
    label: 'Recovery denied',
    tone: 'bad',
    says: 'The insurer refused the recovery, with the reason on the record. The net cost moves back to the gross exposure; the denial is kept because deleting it would leave the recovery ledger reading as though nothing was ever claimed.',
  }),
  Object.freeze({
    key: 'recovered',
    label: 'Recovered',
    tone: 'good',
    says: 'The insurer paid the recovery in full. The net cost is the gross exposure less what was recovered, derived on read and printed apart from the gross.',
  }),
  Object.freeze({
    key: 'partially-recovered',
    label: 'Partially recovered',
    tone: 'warn',
    says: 'The insurer paid less than was claimed. The shortfall is printed as the exact gap between the amount claimed and the amount recovered, and the net cost carries it.',
  }),
]);
export const INS_STATE_KEYS = Object.freeze(INS_STATES.map((row) => row.key));
export const INS_STATE_BY_KEY = Object.freeze(Object.fromEntries(INS_STATES.map((row) => [row.key, row])));
export const INS_BAD_STATE_KEYS = Object.freeze(['no-cover', 'notification-late', 'notification-urgent', 'notification-unprovable', 'recovery-denied']);

/** Refusals printed at the door. Each is a control, not a message. */
export const INS_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  noReach: 'That person is not on a line this seat holds. One line does not declare a policy for another line.',
});

export const INS_SECTION_TITLES = Object.freeze({
  coverages: 'Coverages',
  notifications: 'Notification clocks',
  recoveries: 'Recoveries & net cost',
  method: 'Method',
});

export const INS_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'coverages_n', 'open_n', 'unnotified_n', 'notification_urgent_n',
  'notification_late_n', 'notification_unprovable_n', 'no_cover_n', 'notified_in_time_n',
  'recovery_pending_n', 'recovery_denied_n', 'recovered_n', 'partially_recovered_n',
  'notifications_n', 'notifications_late_n', 'days_remaining_min', 'days_over_total',
  'gross_total_minor', 'recovered_total_minor', 'denied_total_minor', 'net_total_minor',
  'claimed_total_minor', 'holders_n', 'lines_n', 'privacy_floor', 'complete', 'blank_reason',
]);

/**
 * CSV #190 (ADR-0249, Schema v203). IDENTITY-FREE BY CONSTRUCTION — and this one
 * is as sensitive as the claim export, because an insurance register names the
 * insurer, the policy and the sum recovered. One summary row, one row per printed
 * coverage state. No insurer, policy reference, matter reference, person, manager,
 * day or individual amount crosses the boundary: amounts are exported only as
 * whole-register minor-unit totals. A per-state count below the declared privacy
 * floor exports BLANK with its reason, never as a small number.
 */
export const INS_CSV_DESCRIPTOR = Object.freeze({
  key: INS_CSV_SCOPE,
  label: 'Insurance notification and recovery (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'insurance-recovery',
  description: 'One summary row and one row per printed coverage state. Counts of coverages open, unnotified, inside the urgent warning band, past their notification deadline, with an unprovable deadline, with no cover, notified in time, with a recovery pending, denied, recovered and partially recovered; notifications recorded and late; the shortest days remaining, the total days over deadline, and whole-register minor-unit totals for gross exposure, claimed, recovered, denied and the derived net cost. No insurer, policy reference, matter reference, person, manager or day is exported. A per-state count below the declared privacy floor is withheld BLANK with its reason, never printed as a small number.',
});

/** The published framework basis, printed on the method panel. Never a claim of parity. */
export const INS_METHOD = Object.freeze({
  engine: INS_ENGINE_VERSION,
  adr: INS_ADR,
  frameworks: Object.freeze([
    'Timely notice of claim: insurance policies universally require timely notification, often "as soon as practicable" or within a stated window. The register derives the deadline from the trigger day and the window the policy itself declares — never from a date somebody typed.',
    'Occurrence vs claims-made: an occurrence policy answers for an occurrence during its period whenever the claim is finally made; a claims-made policy answers only for a claim made during its period. The register tests the trigger day against the period for both, and prints `no-cover` where the period does not support the link.',
    'Notice of circumstances: a claims-made policy allows a notice of circumstances to lock a future claim into the current policy year. The register records it as its own notification method with its own reference.',
    'Recovery and denial: the insurer’s answer is a dated act with an exact amount and a reason. A denial moves the net cost back to gross and is kept on the record; deleting it would leave the recovery ledger reading as though nothing was ever claimed.',
    'Contingent liability under IAS 37 / ASC 450: the gross exposure is the provision, the recovery is the insurance asset, and the net cost is the figure finance carries. The three are printed apart so a provision is never confused with money spent and a recovery is never confused with cover.',
    'Matrix addressing (ADR-0140/0141): a policy names responsible hands across reporting lines, and the authority required to answer for the notification is the joint apex above every line — never a policy “owner” the record selected.',
    'Bulletproof reliability: the register proves what the record supports and refuses the rest with a printed reason. A deadline it cannot derive is `notification-unprovable`; a deadline it can derive and that passed is `notification-late`, and it says plainly that it holds no insurer feed and cannot state whether the insurer accepted the late notice.',
  ]),
  printed: Object.freeze([
    'Each policy’s insurer, class, basis, period, limit, deductible and declared notification window.',
    'The trigger day the record carries for each coverage, the derived notification deadline, and the exact whole days remaining or over.',
    'Whether the insurer was told in time, and the exact days a late notification ran over.',
    'Every recovery — claimed, recovered, denied, interim — with its own day, basis and exact amount, and the sums derived from them.',
    'The gross exposure, the insurance asset and the derived net cost, printed apart.',
    'Every responsible hand, every active line that holds each of them, and the joint seat above them all.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No stored status, no stored “days remaining” and no per-matter risk score.',
    'No default notification window, no jurisdiction table and no automatic trigger day. Every one is a fact about a particular policy, declared on the policy.',
    'No document store: a policy REFERENCE is recorded, never the policy wording or the endorsement.',
    'No insurer feed, no broker feed and no claims integration: the register cannot prove the insurer accepted a late notice and never implies it can.',
    'No coverage advice and no merits assessment. It records the window and the money, not whether the insurer will pay.',
    'No person, line, broker or claims handler rated, ranked or named as the cause of a recovery outcome.',
  ]),
});
