/**
 * app/core/domain/pausePermitRegistry.js — closed vocabulary for the Automation
 * Pause Permit Register (ADR-0182, Schema v145, `RULE-PMP-01`, CSV #136,
 * `#/settings?panel=pause-permits`).
 *
 * STATUS (Session 248, 2026-11-12): SHIPPED — Schema v145, RULE-PMP-01, CSV #136
 * and the register panel are wired end to end.
 *
 * THE DUTY. LeadOS runs on 85 automatic switches. One of them, set to `false`,
 * stops an engine's rules on every ordinary write. ADR-0180 made the
 * switched-off ones VISIBLE (Conventions in Force). Visible is not governed: a
 * pause is a bare boolean with no authoriser, no reason, no expiry and no
 * compensating measure. The only trace is a `settings.updated` event naming the
 * keys, inside a log capped at 600 entries — so the record of who silenced a
 * control is evicted long before the silence is.
 *
 * In a matrix this is not housekeeping. Pausing a line-reading rule
 * (`delegationLineAutoPropagate`, `workTurnAutoPropagate`, `transferPriceAutoPropagate`,
 * `oneOnOneLineAutoPropagate`, `hiringLineAutoPropagate`,
 * `matrixInterfaceAutoPropagate`, `doaAutoPropagate`) stops work that would have
 * reached a SECOND reporting line. The person's other manager is never told,
 * and their roll-up silently stops moving. A bypassed protective function
 * nobody can see is the classic failure — and the classic control for it is not
 * a better log, it is a PERMIT: an authoriser, a reason, a time limit and a
 * compensating measure (IEC 61511 / ISA-84 bypass management; permit-to-work in
 * process safety; temporary-change control in management of change, ISO 9001
 * §8.5.6; COSO 2013 principle 10, control activities over technology).
 *
 * WHAT THIS MODULE DECLARES
 *   - Three states a pause can be in on read: `permitted` (a current permit
 *     covers it), `unpermitted` (silenced with no permit anybody can point at),
 *     `expired` (a permit existed, its window has passed, the switch is still
 *     off). A state is DERIVED, never stored.
 *   - Six refusal reasons a permit request can be turned down with. The request
 *     is refused rather than recorded as a guess.
 *   - What "roll-up reach" means, stated once: a switch whose silence stops a
 *     rule module that reads the reporting graph. That is the only defensible
 *     test in this codebase without guessing, and it is pinned to the source by
 *     a test rather than trusted.
 *
 * There is deliberately NO third stored pause state and NO stored reach: a
 * stored verdict is the drift the Bulletproof Reliability Mandate forbids.
 *
 * Leaf module: NO imports, so schema, read model, rule, actions, CSV and view
 * can all depend on it without a cycle.
 */

export const PAUSE_PERMIT_ENGINE_VERSION = 'pause-permit-2026.11-v1';
export const PAUSE_PERMIT_RULE_ID = 'RULE-PMP-01';
export const PAUSE_PERMIT_ADR = 'ADR-0182';

export const PAUSE_PERMIT_EVENTS = Object.freeze({
  REQUESTED: 'automation.pause.permitted',
  REVOKED: 'automation.pause.permit.revoked',
  CONVENTIONS: 'automation.pause.conventions',
  SCAN: 'automation.pause.scan',
});

/**
 * The two acts a human performs. Granting IS the pause: one atomic command
 * writes the permit and flips the switch in the same commit, so the record can
 * never hold a pause with no permit beside it, or a permit for a pause that
 * never happened.
 */
export const PAUSE_PERMIT_RIGHTS = Object.freeze({
  GRANT: 'permit-automation-pause',
  GOVERN: 'govern-automation-pauses',
});

export const PAUSE_PERMIT_LIMITS = Object.freeze({
  permits: 800,
  markers: 600,
  idMax: 80,
  keyMax: 64,
  reasonMinChars: 12,
  reasonMaxChars: 400,
  /** The compensating measure has to say something a reader can act on. */
  mitigationMinChars: 8,
  mitigationMaxChars: 300,
  asksPerCommit: 6,
  rowsCap: 200,
  askRows: 100,
  /** Days a permit may run before it needs re-authorising. */
  maxDays: 365,
});

export const PAUSE_PERMIT_DEFAULTS = Object.freeze({
  defaultDays: 30,
  /** Rank that may authorise without a second signature. */
  authoriserRank: 4,
  /** A pause with no permit is escalated this many days after it appears. */
  escalateAfterDays: 3,
  askDueDays: 7,
  autoPropagate: true,
});

export const PAUSE_PERMIT_BOUNDS = Object.freeze({
  defaultDays: Object.freeze([1, 365]),
  escalateAfterDays: Object.freeze([0, 60]),
  askDueDays: Object.freeze([1, 30]),
});

/** Convention name → the settings key it is stored under. One table. */
export const PAUSE_PERMIT_SETTING_KEYS = Object.freeze({
  defaultDays: 'pausePermitDefaultDays',
  escalateAfterDays: 'pausePermitEscalateAfterDays',
  askDueDays: 'pausePermitAskDueDays',
  autoPropagate: 'pausePermitAutoPropagate',
});

export const PAUSE_PERMIT_SETTING_LABELS = Object.freeze({
  defaultDays: 'Days a permit runs when the authoriser does not say (1–365)',
  escalateAfterDays: 'Days an unpermitted pause may stand before an ask is raised (0–60)',
  askDueDays: 'Days allowed for that ask',
  autoPropagate: 'Raise unpermitted-pause asks automatically',
});

/** One state per switch read. Closed, in precedence order. */
export const PAUSE_PERMIT_STATES = Object.freeze(['unpermitted', 'expired', 'permitted', 'on']);
export const PAUSE_PERMIT_STATE_LABELS = Object.freeze({
  unpermitted: 'Off with no permit',
  expired: 'Off past its permit',
  permitted: 'Off under a live permit',
  on: 'Switched on',
});
export const PAUSE_PERMIT_STATE_REASONS = Object.freeze({
  unpermitted: 'The switch is off and no permit on the record names it. Nobody is named as the authoriser, nothing states why, and nothing says when it ends. This is the state ADR-0180 could only count, never govern.',
  expired: 'A permit named this switch, its last day has passed, and the switch is still off. The pause outlived the authority for it.',
  permitted: 'A permit naming this switch is in force on the reading day: an authoriser, a written reason, a first and a last day, and a compensating measure are all on the record.',
  on: 'The switch is on. Nothing is silenced, so no permit is required and none is claimed.',
});

/**
 * Why a permit request was refused. Closed. Each one is a verdict of its own —
 * a request that fails two of them is reported under the first it failed, and
 * every refusal it failed is counted.
 */
export const PAUSE_PERMIT_REFUSALS = Object.freeze([
  'unknown-switch',
  'not-a-switch',
  'already-on',
  'already-permitted',
  'reason-too-short',
  'no-mitigation',
  'bad-window',
  'authoriser-too-junior',
  'counterpart-not-on-record',
  'ledger-full',
]);
export const PAUSE_PERMIT_REFUSAL_REASONS = Object.freeze({
  'unknown-switch': 'No declared convention has this key, so there is no switch to pause.',
  'not-a-switch': 'The key names a convention that is not an automatic switch. Pausing it would not stop any rule, so no permit is issued for it.',
  'already-on': 'The switch is already on. There is nothing to permit; a permit is only ever written beside a genuine pause.',
  'already-permitted': 'A permit naming this switch is already in force. Pausing again would need that permit revoked first, so two people are never named as authoriser for one silence.',
  'reason-too-short': 'The reason is shorter than the declared floor. A pause authorises silence; the written reason for it is the minimum a reader six months later can act on.',
  'no-mitigation': 'No compensating measure was declared. A bypassed control carries what stands in for it while it is off, or the pause is an unmonitored gap.',
  'bad-window': 'The first and last day are missing, reversed, in the past, or longer than the declared maximum. A permit is a bounded window, not an open-ended switch.',
  'authoriser-too-junior': 'The acting seat is below the rank that may silence an automatic control for the whole workspace.',
  'counterpart-not-on-record': 'The named counterpart manager is not on this workspace’s roster, so no second signature exists to record.',
  'ledger-full': 'The permit ledger is at its declared cap. It is exported and revoked before more are written, because a register that silently drops a permit is worse than one that refuses the next.',
});

/** What a permit is bound to. Closed. */
export const PAUSE_PERMIT_SCOPES = Object.freeze(['workspace', 'span']);
export const PAUSE_PERMIT_SCOPE_LABELS = Object.freeze({
  workspace: 'Whole workspace',
  span: 'One span (recorded, not enforced)',
});
export const PAUSE_PERMIT_SCOPE_REASONS = Object.freeze({
  workspace: 'The switch is a workspace setting, so its silence applies to every rule that reads it. The permit records that fact rather than implying a narrower one.',
  span: 'The authoriser named a span the pause matters to. The SWITCH is still workspace-wide — this record does not narrow it, and the panel says so rather than implying a containment the settings cannot deliver.',
});

/**
 * Which switches can reach a second reporting line. Derived, not guessed: a
 * switch is on this list when a POST-COMMIT RULE MODULE that reads the matrix
 * model reads the switch. `tests/app/pause-permits.test.mjs` re-derives the set
 * from `app/` and fails the build when it drifts, so the list cannot quietly
 * go stale the way a hand-maintained one would.
 *
 * What the panel claims with it, stated exactly: silencing one of these stops a
 * rule that reads the reporting graph, so work that would have reached a second
 * line is not issued on an ordinary write. It does NOT claim that line's
 * roll-up loses the record — nothing is deleted — and it does not claim the
 * other manager is never told by any other route.
 */
export const PAUSE_PERMIT_MATRIX_REACH_SWITCHES = Object.freeze([
  // ADR-0233: the probation evidence-ask rule addresses the holder of a
  // joiner's declared matrix line directly, so silencing it leaves a line's
  // evidence duty unasked — and that line's manager is not told.
  'probationAutoPropagate',
  // ADR-0234: the delivery-test ask is computed through the reporting graph to
  // the joint apex above the line holder, so silencing it leaves the independent
  // test unasked and nobody told.
  'undertakingAutoPropagate',
  // ADR-0235: the review ask and the release ask are both computed through the
  // reporting graph to a seat chosen by non-participation, so silencing this rule
  // leaves a certified production unreviewed and a requester's day unasked — and
  // the authority is told nothing.
  'informationRequestAutoPropagate',
  'cadenceAutoPropagate',
  'ctrAutoPropagate',
  'matrixInterfaceAutoPropagate',
  'doaAutoPropagate',
  'oneOnOneLineAutoPropagate',
  'hiringLineAutoPropagate',
  'transferPriceAutoPropagate',
  'delegationLineAutoPropagate',
  'workTurnAutoPropagate',
  'dependencyCycleAutoPropagate',
  // ADR-0188: the corroboration register's automation switch. A pause on it is a
  // printed, authorisable act — the same as every other matrix-reach rule.
  'aarCorroborationAutoPropagate',
  // ADR-0189: the interface-alignment register's automation switch. A pause on
  // it is a printed, authorisable act — the same as every other matrix-reach rule.
  'interfaceAlignmentAutoPropagate',
  // ADR-0190: the standard-work automation switch — a printed, authorisable pause.
  'standardWorkAutoPropagate',
  // ADR-0201: the station-coverage switch. The rule reads the reporting graph for
  // the joint apex of every deficient station set, so silencing it reaches a
  // second line — and that line's manager is not told.
  'stationCoverageAutoPropagate',
  // ADR-0191: the priority-ballot automation switch. The rule reads the
  // reporting graph for every joint apex, so silencing it reaches a second line.
  'priorityBallotAutoPropagate',
  // ADR-0193: the goal-commitment conflict switch. The rule reads the reporting
  // graph for every joint apex and every declared line share, so silencing it
  // reaches a second line — and the second line's manager is not told.
  'goalCommitmentAutoPropagate',
  // ADR-0194: the chargeback-posting switch. The rule reads the reporting graph
  // for the joint apex of every line the period statement names, so silencing
  // it reaches every one of those lines — and none of their managers is told.
  'chargebackPostingAutoPropagate',
  // ADR-0206: the goal-attainment restatement switch. The rule reads the
  // reporting graph for the joint apex of every span whose reported figures
  // moved, so silencing it reaches a second line — and that line's manager is
  // not told that a figure reported upward has changed.
  'goalAttainmentAutoPropagate',
  // ADR-0208: the investment-case review switch. The rule reads the reporting
  // graph for the seat above EVERY one of a benefit owner's lines, so silencing
  // it reaches a second line — and that line's manager is not told that a
  // ratified promise went unreviewed.
  'investmentCaseAutoPropagate',
  // ADR-0209: the work/rest conflict switch. The rule reads the reporting graph
  // for the seat above BOTH lines that made a conflict, so silencing it reaches
  // a second line — and that line's manager is not told that the shift they
  // rostered leaves a person short of rest.
  'workRestAutoPropagate',
  // ADR-0210: the conflict-of-interest switch. The rule reads the reporting graph
  // for the seat above EVERY line held by a person carrying a declared interest,
  // so silencing it reaches a second line — and that line's manager is not told
  // that a decision-maker on a record they share holds an unhandled stake.
  'conflictRecusalAutoPropagate',
  // ADR-0211: the capital-rationing switch. The rule reads the reporting graph for
  // the enterprise altitude that may declare a ceiling, so silencing it leaves
  // every second line under that apex with a fund nobody has sized and no ask.
  'capitalRationingAutoPropagate',
  // ADR-0212: the standard-waiver switch. The rule reads the reporting graph for
  // the home line of the manager who kept renewing a departure, so silencing it
  // leaves that manager's own manager without the review — and silencing it also
  // leaves every lapsed departure unclosed, in silence.
  'standardWaiverAutoPropagate',

  // ADR-0219: the risk-appetite switch. The rule reads the reporting graph for
  // the joint seat above every line carrying a breached risk, so silencing it
  // reaches a second line — and that line's manager is not told.
  'riskAppetiteAutoPropagate',
  // ADR-0220: the incentive-integrity switch. The rule reads the reporting graph
  // for the joint seat above EVERY funding line with an over-ceiling envelope, a
  // contested outcome or an outstanding recovery, so silencing it reaches a
  // second line — and that line's manager is not told that money is being paid
  // twice for one result or that money is owed back.
  'incentiveAutoPropagate',
  // ADR-0221: the duty-without-means switch. The rule reads the live matrix for
  // the joint apex above demanding and controlling lines when required means
  // are declined, withdrawn, partial, or drifted, so silencing it reaches across
  // reporting lines.
  'dutyMeansAutoPropagate',
  'portfolioAutoPropagate',
  // ADR-0223: the shift-handover switch. The rule reads the live matrix for the
  // joint seat above EVERY line of both operators when a handover is overdue or
  // disputed, so silencing it reaches across reporting lines.
  'shiftHandoverAutoPropagate',
  // ADR-0224: a stop-work hold's overdue independent-review ask follows every
  // active reporting line of the reporter, work lead and affected operators.
  'workStopAutoPropagate',
  // ADR-0225: a managerial-handover ask follows every active reporting line of
  // the outgoing manager, the successor and the governor, and a dispute ask
  // reaches the joint seat above EVERY line of both managers.
  'mgrHandoverAutoPropagate',
  // ADR-0227: a suggestion's response ask goes to the joint-apex route
  // member(s) computed above EVERY line of the submitter, and the effect ask to
  // a named owner who may sit on any line — so silencing it reaches across
  // reporting lines, and those lines' managers are not told.
  'suggestionAutoPropagate',
  // ADR-0226: a night-work breach ask reaches the line holder, or the joint seat
  // above BOTH lines of a cross-line breach, and a missing-break ask reaches
  // the line holder — so silencing it reaches across reporting lines.
  'workNightAutoPropagate',
  // ADR-0229: a sourcing decision ask is computed from the joint CHIEF apex over
  // the owner and every line the capability touches, and a hold-up ask follows
  // the same apex or the decider — so silencing it reaches across reporting
  // lines, and those lines' managers are not told.
  'sourcingAutoPropagate',
  // ADR-0231: the plan switch. The executive-step ask is computed from the
  // lowest seat above BOTH the demand line and the supply line — two lines that
  // are almost never the same chain — and the contention it reports is summed
  // across every cycle drawing on one supply line, so silencing it reaches a
  // second line and that line's manager is not told that a plan is waiting on a
  // decision only they can take.
  'ibpAutoPropagate',
  'vyAutoPropagate',
  // ADR-0226: silencing this rule can leave a shared dependency whose combined
  // declared retention would exceed its ceiling without the ask that names the
  // seat above every carrying line; the reading remains open and visible, and
  // no verdict is hidden.
  'riskConcentrationAutoPropagate',
  // ADR-0238: an over-ceiling unsociable-hour ask follows the joint apex above
  // EVERY line that convenes or holds the burden — the person's own lines and
  // the chair lines of their over-ceiling sittings — so silencing it reaches
  // across reporting lines, and those lines' managers are not told that
  // somebody is carrying the unsociable hour over the declared ceiling.
  'dweAutoPropagate',
  // ADR-0240: the incident command register's rule. Silencing it stops the asks
  // for a blown external notification deadline and for a live major incident with
  // nobody in command — and the response lines that carry those duties are not
  // told. It reaches across reporting lines, so it carries a permit like every
  // other cross-line switch.
  'micAutoPropagate',
  'wpaAutoPropagate',
  // ADR-0242: the lone-working rule. Silencing it stops the asks for an
  // unconfirmed welfare check, a concern nobody answered and a deployment left
  // open past its declared end — and the reporting lines that hold those people
  // are not told. It reaches across reporting lines, so it carries a permit like
  // every other cross-line switch.
  'lwkAutoPropagate',
  // ADR-0243: the employee-voice rule. Silencing it stops the asks for a
  // consultation window that closed with no advice, advice the organisation never
  // answered, minutes past their day and a decision recorded out of order — and the
  // affected reporting lines are not told. It reaches across reporting lines through
  // `matrixJointApex`, so it carries a permit like every other cross-line switch.
  'voiceAutoPropagate',
  // ADR-0246: the permit-to-work rule. Silencing it stops the asks for a live permit
  // with no proof of zero energy, a live permit whose atmosphere is outside the
  // limits its own issuer declared, a permit that lapsed with nobody closing it, a
  // contradiction between two live permits on one plant, and a closure that left a
  // line isolated — and the reporting lines that hold those crews are not told. It
  // reaches across reporting lines through `matrixJointApex`, so it carries a permit
  // like every other cross-line switch.
  'ptwAutoPropagate',
]);

export function pausePermitReachesMatrix(key) {
  return PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes(key);
}

/**
 * Is this string a key a permit may name at all? The register governs AUTOMATIC
 * SWITCHES (`…Auto<Word>`), so a permit naming anything else is dropped rather
 * than carried as an authority over a convention it cannot stop.
 */
export function isPermittableSwitchKey(key) {
  return typeof key === 'string' && /^[a-z][A-Za-z0-9]*Auto[A-Z][a-z]+$/.test(key);
}

/**
 * The known rule module each switch silences (including owner-directed rules). Derived from the same source read
 * the test performs; named here so the panel can print WHICH rule goes quiet
 * instead of asserting an unnamed consequence.
 */
export const PAUSE_PERMIT_SWITCH_RULES = Object.freeze({
  cadenceAutoPropagate: 'cadenceRules.js',
  ctrAutoPropagate: 'contradictionRules.js',
  matrixInterfaceAutoPropagate: 'matrixInterfaceRules.js',
  doaAutoPropagate: 'doaScheduleRules.js',
  oneOnOneLineAutoPropagate: 'oneOnOneLineRules.js',
  hiringLineAutoPropagate: 'hiringLineRules.js',
  transferPriceAutoPropagate: 'transferPriceRules.js',
  delegationLineAutoPropagate: 'delegationLineRules.js',
  workTurnAutoPropagate: 'workTurnRules.js',
  dependencyCycleAutoPropagate: 'dependencyCycleRules.js',
  aarCorroborationAutoPropagate: 'aarCorroborationRules.js',
  interfaceAlignmentAutoPropagate: 'interfaceAlignmentRules.js',
  standardWorkAutoPropagate: 'standardWorkRules.js',
  stationCoverageAutoPropagate: 'stationCoverageRules.js',
  priorityBallotAutoPropagate: 'priorityRankingRules.js',
  goalCommitmentAutoPropagate: 'goalCommitmentRules.js',
  chargebackPostingAutoPropagate: 'chargebackPostingRules.js',
  goalAttainmentAutoPropagate: 'goalAttainmentRules.js',
  investmentCaseAutoPropagate: 'investmentCaseRules.js',
  workRestAutoPropagate: 'workRestRules.js',
  conflictRecusalAutoPropagate: 'conflictRecusalRules.js',
  capitalRationingAutoPropagate: 'capitalRationingRules.js',
  standardWaiverAutoPropagate: 'standardWaiverRules.js',
  // ADR-0216: silencing the ask that requests a verification. The pause is
  // permitted and printed as such — a switch that hides a missing verification
  // must not itself be hidden.
  synergyAutoPropagate: 'synergyRules.js',
  // ADR-0217: silencing the ask that requests a reading or flags an under-floor
  // cost position. The pause is permitted and printed as such — a switch that
  // hides a missing reading must not itself be hidden.
  earnedValueAutoPropagate: 'earnedValueRules.js',
  // ADR-0218's Just Culture register has no rule of its own, so no switch. ADR-0219:
  // silencing the ask that requests a decision on a breached tolerance, a missing
  // appetite or a passed review. The pause is permitted and printed as such — a
  // switch that hides a breached ceiling must not itself be hidden.
  riskAppetiteAutoPropagate: 'riskAppetiteRules.js',
  // ADR-0220: silencing the ask that requests a decision on an over-ceiling
  // envelope, a contested outcome, an outstanding recovery or a plan nobody is
  // measuring. The pause is permitted and printed as such — a switch that hides
  // money paid twice must not itself be hidden.
  incentiveAutoPropagate: 'incentiveRules.js',
  // ADR-0221: silencing the ask that requests declaring required means,
  // answering an overdue means request, or resolving a cross-line means gap at
  // the joint apex.
  dutyMeansAutoPropagate: 'dutyMeansRules.js',
  portfolioAutoPropagate: 'portfolioReviewRules.js',
  // ADR-0223: silencing the ask that requests confirmation of an overdue or
  // disputed handover. A switch that hides an uncontained boundary must not
  // itself be hidden.
  shiftHandoverAutoPropagate: 'shiftHandoverRules.js',
  // ADR-0224: silencing this rule can leave an overdue work-stop hold without
  // an independent Director+ review; the record remains held and visible.
  workStopAutoPropagate: 'workStopRules.js',
  // ADR-0225: silencing this rule can leave an open managerial transition
  // without its owed brief, acceptance, release or dispute review; the
  // transition remains open and visible, and nothing transfers.
  mgrHandoverAutoPropagate: 'mgrHandoverRules.js',
  // ADR-0227: silencing this rule can leave a suggestion past its declared
  // response window with no ask on the route that owes the answer, and an
  // accepted change past its target with none on its owner; the ledger stays
  // open and visible, and nothing is decided or claimed in its place.
  suggestionAutoPropagate: 'suggestionRules.js',
  // ADR-0226: silencing this rule can leave a provable night-work breach or a
  // missing required break record without its ask; the reading remains open and
  // visible, and no break is invented.
  workNightAutoPropagate: 'workNightRules.js',
  // ADR-0229: silencing this rule can leave a boundary decision owed and a
  // hold-up exposure unanswered across every line a capability touches; the
  // register stays open and visible, and nothing is decided in its place.
  sourcingAutoPropagate: 'sourcingRules.js',
  vyAutoPropagate: 'vyRules.js',
  // ADR-0231: silencing this rule can leave a supply review untested, a
  // quantified gap without a costed option, and an executive step owed across
  // two lines at once; the register stays open and visible, and no plan is
  // approved in its place.
  ibpAutoPropagate: 'ibpRules.js',
  // ADR-0233: silencing this rule can leave a window closing or lapsed without
  // its decision ask and a line without its evidence ask; the reading remains
  // open and visible.
  probationAutoPropagate: 'probationGateRules.js',
  // ADR-0234: silencing this rule can leave an asserted deliverable untested, a
  // fully confirmed promise unreported to its counterparty, and a lapsed due day
  // unrecorded. The counterparty outside the organisation is told nothing, which
  // is the failure the register exists for; the reading stays open and visible.
  undertakingAutoPropagate: 'undertakingRules.js',
  // ADR-0235: silencing this rule can leave a certified production with no
  // independent review, a fully reviewed production unreleased, and a requester's
  // reply day lapsed with nobody asked. The demand stays open and visible on
  // #/information-requests, which is the whole point — but nothing reaches the
  // authority, and an unreviewed privilege claim stays untested.
  informationRequestAutoPropagate: 'rqRules.js',
  // ADR-0226: silencing this rule can leave a would-exceed shared dependency
  // without its ceiling ask; the reading remains open and visible.
  riskConcentrationAutoPropagate: 'riskConcentrationRules.js',
  // ADR-0243: the employee-voice rule reads the live matrix for the joint apex
  // above an item's affected lines, so silencing it really can reach a second line.
  voiceAutoPropagate: 'voiceRules.js',
});

/** Only graph-reading rules belong to the matrix census. Owner-directed rules
 * still have names, but naming them must not invent a second reporting line. */
export const PAUSE_PERMIT_REACH_RULES = Object.freeze(Object.fromEntries(
  PAUSE_PERMIT_MATRIX_REACH_SWITCHES.map((key) => [key, PAUSE_PERMIT_SWITCH_RULES[key]]),
));

/** How much of the register a seat is shown. Mirrors the altitude disclosure ladder. */
export const PAUSE_PERMIT_DETAIL_LEVELS = Object.freeze(['visible', 'leaders', 'none']);
export const PAUSE_PERMIT_DETAIL_REASONS = Object.freeze({
  visible: '',
  leaders: 'This seat reads the switches and their states by name, and the authoriser of each permit only where that authoriser leads a line of their own. Reasons and compensating measures are summaries: below the full-access operator view this register prints whether one is recorded, never its text.',
  none: 'This seat reads counts only. No switch key, no authoriser and no reason text is returned; every figure above is computed over the whole of this seat’s span.',
});

export const PAUSE_PERMIT_CSV_COLUMNS = Object.freeze([
  'row_type', 'generated_on', 'scope', 'detail_level',
  'as_of', 'switches_declared', 'switches_on', 'switches_off',
  'state_permitted', 'state_expired', 'state_unpermitted', 'state_on', 'states_reconcile',
  'permits_total', 'permits_live', 'permits_expired', 'permits_revoked', 'permits_pending', 'permits_overlapped', 'permits_reconcile',
  'reach_off', 'reach_unpermitted', 'reach_expired', 'reach_switches_known',
  'authoriser_unique', 'authoriser_leader_held', 'authoriser_off_roster', 'authoriser_state_reconcile',
  'unpermitted_past_grace', 'unprovable_start', 'open_pause_asks', 'ask_due_days', 'default_days', 'escalate_after_days',
]);

export const PAUSE_PERMIT_CSV_DESCRIPTOR = Object.freeze({
  key: 'automation-pause-permits',
  label: 'Automation pause permits (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'automation-pause-permits',
  description: 'One summary row for every declared automatic switch in the workspace on the reading day: how many are on and off (reconciled to the declared total); how the off ones divide between permitted, expired and unpermitted (reconciled separately); how many permits are live, expired and revoked and how many pauses two permits overlapped; how many switches known to reach a second reporting line are silenced, and how many of those are unpermitted or expired; where the authoriser of each live permit lands (a named seat, the workspace leader, a seat no longer on the roster); how many unpermitted pauses have stood past the declared grace; and how many pause asks are open. NO switch is named, NO authoriser, NO person, NO line and NO free text of any kind crosses this boundary.',
});

export const PAUSE_PERMIT_METHOD = Object.freeze([
  'A pause is permitted by ONE dated act that writes the permit and sets the switch to false in the same atomic commit. There is no stored state, no stored verdict and no stored reach: every one of them is re-derived on read from the permits, the declared switches and the switch value in force.',
  'A permit names the switch, the authorising seat, a written reason, a first and a last day, a compensating measure, and an optional counterpart manager. The reason and the measure have declared minimum lengths; a request below either floor is refused rather than completed by the register.',
  'A switch that is off is `permitted` only when a permit naming it is in force on the reading day — last day inclusive, first day inclusive. A permit whose window has passed with the switch still off reads `expired`. A switch off with no permit naming it reads `unpermitted`. A switch that is on reads `on` and claims nothing.',
  'Two permits may not be in force for one switch at the same time. A second request is refused, so a pause always has exactly one authoriser to answer for it. Two permits whose windows overlap are counted separately as `overlapped`, because a workspace can reach that state by importing a file and the register must say so rather than hide it.',
  'The switch is a workspace setting. A permit that names a span records what the pause matters to; it does NOT narrow the pause, and the register prints the difference instead of implying a containment the settings cannot deliver.',
  'Reach is derived from the source: a switch is on the reach list when a post-commit rule module that reads the matrix model reads the switch. The register claims what that means — the rule that would have issued work to a second line does not run on an ordinary write — and does not claim the record was deleted or that no other route tells the second manager anything.',
  'RULE-PMP-01 raises at most one dated ask per unpermitted pause that has stood past the declared grace, to the single seat that can authorise it, and closes its own ask when the pause is permitted or the switch comes back on. It never flips a switch, never writes a permit on a human’s behalf, and never revokes one.',
  'This register records authority over silence. It stores no rating of a person, no judgement about whether a pause was wise, and no personal characteristic of anyone.',
]);
