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
  // ADR-0191: the priority-ballot automation switch. The rule reads the
  // reporting graph for every joint apex, so silencing it reaches a second line.
  'priorityBallotAutoPropagate',
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
 * The rule module each reach switch silences. Derived from the same source read
 * the test performs; named here so the panel can print WHICH rule goes quiet
 * instead of asserting an unnamed consequence.
 */
export const PAUSE_PERMIT_REACH_RULES = Object.freeze({
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
  priorityBallotAutoPropagate: 'priorityRankingRules.js',
});

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
