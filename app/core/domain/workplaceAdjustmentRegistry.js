/**
 * app/core/domain/workplaceAdjustmentRegistry.js — the closed vocabulary of the
 * Workplace Adjustment & Functional-Restriction Register (ADR-0241, Schema v195,
 * `#/adjustments`, `RULE-WPA-01`, CSV scope #182).
 *
 * THE DUTY, IN A FRONTLINE SUPERVISOR'S WORDS. *"Occupational health has sent me
 * a note: Sam must not lift over 5 kg, must not work alone, and must not be on
 * nights until the review date. I have written it in the shift log. Who is
 * making sure the Monday rota does not put him on nights anyway, and does the
 * project manager he also reports to know he cannot do the commissioning
 * call-outs?"*
 *
 * No surface in this workspace could answer any part of that, and the gap is
 * structural rather than cosmetic. The workspace could already record:
 *   - `dutyCoverage` — who covers a duty while somebody is ABSENT;
 *   - `workRest` — the rest between two lines' shifts;
 *   - `stationCoverage` — whether qualified people can man stations at once;
 *   - `onboarding` (`plan_kind: 'reboarding'`) — a return-to-work 30-60-90 plan.
 *
 * Every one of those assumes the person returns at FULL capacity, or is simply
 * absent. None of them can hold "present, but restricted" — which is the most
 * common and the most legally exposed state there is. A restriction that has
 * passed its review date is a live legal duty the record has forgotten.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. Word-boundary
 * searches of `app/`, `tests/`, `docs/adr/` and `ROADMAP.md` before this build
 * returned ZERO files for each of: `reasonable adjustment`, `accommodation`,
 * `work restriction`, `restricted duties`, `fit note`, `modified duty`, `light
 * duty`, `medical restriction`, `capability review`, `occupational health`. The
 * single surviving hit for `disabilit` in `ROADMAP.md` is a REJECTED row
 * explaining why protected characteristics are deliberately not stored. Wider
 * absence **[UNVERIFIED]**.
 *
 * WHAT THE BENCHMARKED CATEGORY GETS RIGHT, AND WHERE IT STOPS. Enterprise
 * occupational-health suites (Cority Health Cloud, Intelex, Enterprise Health,
 * UL Occupational Health Manager) model the restriction as a CASE STATUS tied
 * to a clinical encounter: a clinician records it, it moves through controlled
 * status transitions, and the case is closed when the person returns to full
 * duty [vendor documentation, hands-on parity UNVERIFIED]. Specialist
 * adjustment-register vendors state the three failures their own product
 * exists to fix, and they are the right three:
 *
 *   1. **Agreed is not the same as in place.** Very few employers can produce
 *      both dates — the day the adjustment was AGREED and the day it actually
 *      BECAME OPERATIONAL — so the distance between them, which is where the
 *      cost sits, is never measured. This register stores both and prints the
 *      exact integer days between them.
 *   2. **An adjustment does not survive a handover.** It is agreed, paid for,
 *      still legally owed — and lost when the manager changes. Nothing in the
 *      category tests whether the manager who now holds the person has ever
 *      been shown it. This register does, PER REPORTING LINE, against the live
 *      reporting graph, so a line change re-opens the gap by itself.
 *   3. **A recorded refusal with a reason is defensible; an unanswered request
 *      is not.** A request that sits with no decision on it is a distinct
 *      printed state here, never folded into "handled".
 *
 * WHAT THIS REGISTER ADDS THAT NO PRODUCT IN THE CATEGORY DOES — AND WHY IT IS
 * THE POINT RATHER THAN A FEATURE. Storing a restriction is filing. Deciding
 * whether a person has been rostered ONTO work the restriction forbids is
 * arithmetic over records the workspace already holds, and it is the only thing
 * that prevents the injury. So for every restriction the reader attempts an
 * EXACT test against declared work where the record can support one, and prints
 * an explicit refusal where it cannot:
 *
 *   - `no-night-work` is tested EXACTLY against every declared shift on EVERY
 *     line, using the same integer wall-clock arithmetic the work/rest register
 *     uses — the minutes of that shift that fall inside the declared night
 *     window are counted, not guessed.
 *   - `max-shift-hours` and `min-rest-hours` are tested EXACTLY against the
 *     declared shift span and the exact rest between consecutive shifts that
 *     two different managers declared.
 *   - Every other domain (`manual-handling`, `sustained-posture`,
 *     `display-screen`, `noise`, `hazardous-substances`, `work-at-height`,
 *     `driving`, `lone-work`, `travel`, `supervision-required`) is printed
 *     `no-exposure-record` WITH ITS REASON. The register cannot see a lifting
 *     task in the record, and a register that printed "clear" for a 5 kg limit
 *     because it never looked would be worse than one that never existed.
 *
 * THE THREE THINGS THAT MUST NEVER HAPPEN, AND ARE PREVENTED BY CONSTRUCTION:
 *   - **No diagnosis is stored.** A restriction carries a FUNCTIONAL statement
 *     ("no lifting above 5 kg") and never a condition, a symptom, a prognosis
 *     or a clinical note. The manager needs the limitation; the register must
 *     not become a medical record. There is no field for a diagnosis and no
 *     free-text field that a diagnosis could hide in unbounded.
 *   - **No person is scored.** No fitness rating, no capacity percentage, no
 *     league table, no "days restricted" ranked across people. The register
 *     counts restrictions, adjustments, days and conflicts.
 *   - **No reasonableness is decided.** Whether an adjustment is reasonable is
 *     a human legal judgement about resources and effectiveness. The register
 *     records the decision, the reason and the day — including a refusal — and
 *     prints that a refusal recorded with a reason is a defensible position
 *     while an unanswered request is not.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A restriction belongs to a PERSON, not to
 * a line. The reader therefore:
 *   - merges every declared shift across EVERY reporting line before testing
 *     any limit, so a night shift declared by the second line is caught;
 *   - requires an ACKNOWLEDGEMENT PER ACTIVE LINE, so a manager who holds the
 *     person and has never been shown the restriction is a printed finding
 *     rather than an assumption;
 *   - addresses every rule ask to `matrixJointApex` over the person's line
 *     managers — never to the person carrying the restriction, and never to one
 *     line on another line's behalf;
 *   - counts a person ONCE in every people figure and never divides their
 *     restriction across lines.
 */

export const WPA_ENGINE_VERSION = 'workplace-adjustment-2026.11-v1';
export const WPA_ADR = 'ADR-0241';
export const WPA_RULE_ID = 'RULE-WPA-01';
export const WPA_ROUTE = 'adjustments';
export const WPA_HREF = '#/adjustments';
export const WPA_CSV_SCOPE = 'workplace-adjustments';
export const WPA_MARKER_KIND = 'workplace-adjustment';

export const WPA_EVENTS = Object.freeze({
  RESTRICTION_DECLARED: 'workplaceAdjustment.restriction.declared',
  RESTRICTION_WITHDRAWN: 'workplaceAdjustment.restriction.withdrawn',
  ADJUSTMENT_RECORDED: 'workplaceAdjustment.adjustment.recorded',
  ADJUSTMENT_OPERATIONAL: 'workplaceAdjustment.adjustment.operational',
  ADJUSTMENT_RETIRED: 'workplaceAdjustment.adjustment.retired',
  RESTRICTION_DECLINED: 'workplaceAdjustment.restriction.declined',
  RESTRICTION_REVIEWED: 'workplaceAdjustment.restriction.reviewed',
  LINE_ACKNOWLEDGED: 'workplaceAdjustment.line.acknowledged',
  CONVENTIONS_SET: 'workplaceAdjustment.conventions.set',
  SCANNED: 'workplaceAdjustment.scan',
});
export const WPA_EVENT_PREFIX = 'workplaceAdjustment.';

/**
 * Two rights, and the split is the moral centre of this register.
 *
 *   READ    — open at rank 1, because a person must be able to read their OWN
 *             restriction and whether the workplace actually put it in place.
 *             The READER narrows what any seat sees: per-person rows below the
 *             executive altitude, counts above it.
 *   DECLARE — rank 2+. Declaring a restriction, recording an adjustment, marking
 *             it operational, acknowledging a line, recording a refusal and
 *             recording a review are all leader acts, and each is narrowed
 *             inside the action to a seat that HOLDS the person on a live line
 *             (or is the person themselves).
 *
 * NOTE WHAT IS ABSENT: there is deliberately NO right that lets a seat declare
 * that a restriction does not apply. Withdrawal records that the instrument was
 * lifted, with a written basis, and is refused for the seat that carries the
 * limitation unless a review decided it. Nobody can administratively delete a
 * duty from the record.
 */
export const WPA_RIGHTS = Object.freeze({
  READ: 'read-workplace-adjustments',
  DECLARE: 'declare-workplace-adjustments',
});

export const WPA_LIMITS = Object.freeze({
  restrictions: 400,
  adjustments: 1200,
  acknowledgements: 2000,
  reviews: 1200,
  markers: 400,
  textMin: 24,
  textMax: 600,
  statementMin: 12,
  statementMax: 240,
  idMax: 120,
  /** The longest stretch one restriction may stay live before it must be reviewed. */
  horizonMaxDays: 1460,
  /** How far back a restriction may be declared (evidence arrives late, and often does). */
  backfillMaxDays: 3650,
  /** A declared limit: whole minutes for hour/rest domains, whole grams for handling. */
  limitMaxMinutes: 1440,
  limitMaxGrams: 500_000,
  /** Rule asking. */
  askDueDays: 2,
  chaseDays: 1,
  rowsShown: 60,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
});

/** Rank that may read the register (open to everybody: this is a person's own duty). */
export const WPA_READ_MIN_RANK = 1;
/** Rank that may declare, acknowledge or review. */
export const WPA_DECLARE_MIN_RANK = 2;

export const WPA_SETTING_KEYS = Object.freeze({
  autoPropagate: 'wpaAutoPropagate',
  adjustmentGraceDays: 'wpaAdjustmentGraceDays',
  reviewWarnDays: 'wpaReviewWarnDays',
  privacyFloor: 'wpaPrivacyFloor',
  nightStartMinute: 'wpaNightStartMinute',
  nightEndMinute: 'wpaNightEndMinute',
});

export const WPA_DEFAULTS = Object.freeze({
  autoPropagate: true,
  /**
   * How long an AGREED adjustment may stand before it is owed IN PLACE. The
   * default is a declaration, not a legal period: an employer may set any
   * value, and the register prints the value it used on every finding.
   */
  adjustmentGraceDays: 14,
  /** How far before its review date a restriction starts reading `review-due`. */
  reviewWarnDays: 14,
  /** Below this many people a per-person figure is withheld with its reason. */
  privacyFloor: 3,
});

export const WPA_BOUNDS = Object.freeze({
  adjustmentGraceDays: { min: 0, max: 365 },
  reviewWarnDays: { min: 0, max: 180 },
  privacyFloor: { min: 2, max: 20 },
});

/* ------------------------------------------------------------- vocabularies */

/**
 * THE INSTRUMENT A RESTRICTION COMES FROM. A restriction that names no
 * instrument is a rumour, so the source is from a closed vocabulary AND carries
 * a written reference (the note's own wording, bounded). `self-declared` is a
 * first-class source: a person may tell their manager, and that is a real
 * instrument even though no clinician wrote it.
 *
 * `strength` is used for exactly one purpose: whether the register treats the
 * restriction as binding for work-conflict testing. A `recommendation` is
 * printed and never tested against the rota, because treating advice as a
 * prohibition would be the register inventing a duty nobody declared.
 */
export const WPA_INSTRUMENTS = Object.freeze([
  Object.freeze({
    key: 'occupational-health',
    label: 'Occupational-health assessment',
    says: 'A clinician assessed the person against the demands of the role and wrote a functional limitation.',
    binding: true,
  }),
  Object.freeze({
    key: 'fit-note',
    label: 'Statement of fitness for work',
    says: 'A treating clinician ticked “may be fit for work” and wrote the adjustments advised.',
    binding: true,
  }),
  Object.freeze({
    key: 'clinical-letter',
    label: 'Specialist or treating-clinician letter',
    says: 'A treating clinician wrote to the employer about what the person cannot do.',
    binding: true,
  }),
  Object.freeze({
    key: 'self-declared',
    label: 'Declared by the person themselves',
    says: 'The person told their line manager, and that statement is the instrument on this record.',
    binding: true,
  }),
  Object.freeze({
    key: 'ergonomic-assessment',
    label: 'Workplace ergonomic assessment',
    says: 'A workplace assessment named a task the person should not perform as configured.',
    binding: true,
  }),
  Object.freeze({
    key: 'recommendation',
    label: 'Recommendation (advisory only)',
    says: 'Advice rather than a limitation. It is recorded and printed, and it is never tested against the rota.',
    binding: false,
  }),
]);

export const WPA_INSTRUMENT_BY_KEY = Object.freeze(
  Object.fromEntries(WPA_INSTRUMENTS.map((row) => [row.key, row])),
);
export const WPA_INSTRUMENT_KEYS = Object.freeze(WPA_INSTRUMENTS.map((row) => row.key));

/**
 * THE FUNCTIONAL DEMAND DOMAINS. This is a closed list on purpose: an open text
 * field is where a diagnosis ends up, and it is also what makes an exact test
 * impossible. `testable` is the honest claim about THIS record — whether the
 * workspace holds data from which a conflict with the restriction can be
 * PROVED. A `false` here is not a defect; it is the register saying what it
 * cannot see, and it is printed rather than assumed away.
 *
 * `limit` names the unit the domain's declared limit is measured in, or null
 * when the domain is a pure prohibition that needs no number.
 */
export const WPA_DOMAINS = Object.freeze([
  Object.freeze({
    key: 'no-night-work', label: 'No night work', testable: true, limit: null,
    basis: 'Tested exactly against every declared shift on every line: the whole minutes of that shift falling inside the declared night window.',
  }),
  Object.freeze({
    key: 'max-shift-hours', label: 'Maximum hours in one shift', testable: true, limit: 'minutes',
    basis: 'Tested exactly against the declared span of every shift on every line.',
  }),
  Object.freeze({
    key: 'min-rest-hours', label: 'Minimum rest between shifts', testable: true, limit: 'minutes',
    basis: 'Tested exactly against the gap between consecutive declared shifts, merged across every line.',
  }),
  Object.freeze({ key: 'manual-handling', label: 'Manual handling / lifting limit', testable: false, limit: 'grams', basis: '' }),
  Object.freeze({ key: 'sustained-posture', label: 'Sustained posture (standing, sitting, kneeling)', testable: false, limit: 'minutes', basis: '' }),
  Object.freeze({ key: 'display-screen', label: 'Display-screen work limit', testable: false, limit: 'minutes', basis: '' }),
  Object.freeze({ key: 'noise', label: 'Noise exposure limit', testable: false, limit: null, basis: '' }),
  Object.freeze({ key: 'hazardous-substances', label: 'No work with hazardous substances', testable: false, limit: null, basis: '' }),
  Object.freeze({ key: 'work-at-height', label: 'No work at height', testable: false, limit: null, basis: '' }),
  Object.freeze({ key: 'driving', label: 'No driving / operating plant', testable: false, limit: null, basis: '' }),
  Object.freeze({ key: 'lone-work', label: 'No lone work', testable: false, limit: null, basis: '' }),
  Object.freeze({ key: 'travel', label: 'Travel limit', testable: false, limit: null, basis: '' }),
  Object.freeze({ key: 'supervision-required', label: 'May work only under named supervision', testable: false, limit: null, basis: '' }),
]);

export const WPA_DOMAIN_BY_KEY = Object.freeze(
  Object.fromEntries(WPA_DOMAINS.map((row) => [row.key, row])),
);
export const WPA_DOMAIN_KEYS = Object.freeze(WPA_DOMAINS.map((row) => row.key));
export const WPA_TESTABLE_DOMAIN_KEYS = Object.freeze(
  WPA_DOMAINS.filter((row) => row.testable).map((row) => row.key),
);

/**
 * WHAT WAS ACTUALLY DONE. The kinds follow the statutory shape of an adjustment
 * (remove the provision, alter a physical feature, provide an auxiliary aid —
 * Equality Act 2010 s.20) without importing any jurisdiction's wording as a
 * default. Each kind names what the record is claiming was done, so the screen
 * can print the claim rather than a category.
 */
export const WPA_ADJUSTMENT_KINDS = Object.freeze([
  Object.freeze({ key: 'task-substitution', label: 'Tasks removed or substituted', says: 'The restricted tasks were taken out of this person’s work and given to somebody else.' }),
  Object.freeze({ key: 'equipment', label: 'Equipment or aid provided', says: 'A physical aid, tool or piece of equipment was provided so the task can be done within the limit.' }),
  Object.freeze({ key: 'hours-change', label: 'Hours or pattern changed', says: 'The person’s working hours, shift pattern or break pattern was changed.' }),
  Object.freeze({ key: 'environment', label: 'Environment or workplace altered', says: 'The physical workplace was altered — layout, access, workstation, noise.' }),
  Object.freeze({ key: 'redeployment', label: 'Moved to different work', says: 'The person was moved, temporarily or permanently, to work the restriction allows.' }),
  Object.freeze({ key: 'supervision', label: 'Supervision or buddying arranged', says: 'A named person was arranged to be present or to check the work.' }),
  Object.freeze({ key: 'policy-exemption', label: 'Rule or process exempted', says: 'A provision, criterion or practice was disapplied for this person.' }),
]);

export const WPA_ADJUSTMENT_KIND_BY_KEY = Object.freeze(
  Object.fromEntries(WPA_ADJUSTMENT_KINDS.map((row) => [row.key, row])),
);
export const WPA_ADJUSTMENT_KIND_KEYS = Object.freeze(WPA_ADJUSTMENT_KINDS.map((row) => row.key));

/** The decision a recorded review reaches. Nothing here closes a restriction by time alone. */
export const WPA_REVIEW_DECISIONS = Object.freeze([
  Object.freeze({ key: 'continue', label: 'Continue unchanged', says: 'The limitation still applies on the same terms.' }),
  Object.freeze({ key: 'amend', label: 'Amend the restriction', says: 'The instrument changed; a new restriction is declared and this one is withdrawn.' }),
  Object.freeze({ key: 'close', label: 'Lift the restriction', says: 'The limitation no longer applies and the restriction is withdrawn on this review.' }),
  Object.freeze({ key: 'declined', label: 'Decline the requested adjustment', says: 'The restriction stands unchanged, and the ADJUSTMENT asked for was refused with a written reason. A recorded refusal with a reason is a defensible position; it is not a clearance, and it never lifts the restriction.' }),
]);

export const WPA_REVIEW_DECISION_BY_KEY = Object.freeze(
  Object.fromEntries(WPA_REVIEW_DECISIONS.map((row) => [row.key, row])),
);
export const WPA_REVIEW_DECISION_KEYS = Object.freeze(WPA_REVIEW_DECISIONS.map((row) => row.key));

export const WPA_RESTRICTION_STATUSES = Object.freeze(['active', 'withdrawn']);

/**
 * THE PRINTED STATES OF ONE RESTRICTION. These are DERIVED ON READ and never
 * stored, so a hand-edited workspace cannot carry an adjustment nobody put in
 * place or a review nobody held.
 *
 * `agreed-not-in-place` is the state the benchmarked category says nobody can
 * measure, and it is the first-class state of this register.
 */
export const WPA_STATES = Object.freeze([
  Object.freeze({ key: 'no-adjustment', tone: 'bad', label: 'No adjustment on record', says: 'The restriction is live and nothing on the record says what was done about it. An unanswered request is not a refusal, and this state is never a clearance.' }),
  Object.freeze({ key: 'declined', tone: 'warn', label: 'Declined, with a recorded reason', says: 'A human decided no adjustment would be made and wrote why. A recorded refusal with a reason is a defensible position; it is not a clearance.' }),
  Object.freeze({ key: 'agreed-not-in-place', tone: 'bad', label: 'Agreed, never became operational', says: 'An adjustment was agreed on a date and no day on the record says it took effect. The distance between the two is where the cost sits.' }),
  Object.freeze({ key: 'in-place', tone: 'good', label: 'Agreed and operational', says: 'An adjustment is recorded as agreed and as operational, and the exact days between the two are printed.' }),
  Object.freeze({ key: 'operational-conflict', tone: 'bad', label: 'Operational, but declared work conflicts', says: 'An adjustment is in place AND declared work on some line breaks a limit this record can prove. Both facts are printed; neither is softened.' }),
  Object.freeze({ key: 'review-overdue', tone: 'bad', label: 'Past its review date', says: 'The restriction’s own review day has passed with no recorded review. A live legal duty on a date nobody re-checked.' }),
  Object.freeze({ key: 'withdrawn', tone: 'muted', label: 'Withdrawn', says: 'The restriction was lifted on a recorded basis. A withdrawn restriction is history, not clearance for work done under it.' }),
]);

export const WPA_STATE_BY_KEY = Object.freeze(
  Object.fromEntries(WPA_STATES.map((row) => [row.key, row])),
);
export const WPA_STATE_KEYS = Object.freeze(WPA_STATES.map((row) => row.key));

/** Why a work test could not be attempted, printed beside the blank it causes. */
export const WPA_UNPROVEN = Object.freeze({
  'no-exposure-record': 'The workspace holds no declared record of the physical demands of this person’s work (lifting weights, posture, noise, driving), so no conflict can be proved either way. This is not a clearance.',
  'no-shifts': 'No shift has been declared for this person on any line, so the shift-based limits cannot be tested. Silence is not rest and it is not clearance.',
  'advisory': 'The instrument is advisory, so the register prints it and does not test it against declared work.',
  'unreadable-shift': 'At least one declared shift for this person could not be read exactly, so a shift-based test would understate the exposure.',
});

/** The night window a `no-night-work` restriction is tested against is DECLARED. */
export const WPA_NIGHT_WINDOW_DEFAULTS = Object.freeze({
  /** Local wall clock minute the night period opens, inclusive. */
  startMinute: 22 * 60,
  /** Local wall clock minute the night period closes, exclusive (next day). */
  endMinute: 6 * 60,
});

/* ------------------------------------------------------------------ method */

export const WPA_METHOD = Object.freeze({
  engine: WPA_ENGINE_VERSION,
  adr: WPA_ADR,
  frameworks: Object.freeze([
    'Duty to make reasonable adjustments (Equality Act 2010 ss.20–21; ADA Title I 42 U.S.C. §12112) — the employer’s positive duty to remove a substantial disadvantage, recorded as a dated decision with a reason',
    'Functional-capacity reporting rather than diagnosis — the record carries the LIMITATION the work must respect, never the condition behind it (occupational-health practice; Cority / Intelex case models reviewed at vendor documentation level)',
    'Agreed-versus-operational measurement — the two dates the adjustment-register category names as the ones employers cannot produce, and the exact integer days between them',
    'Matrix accountability (ADR-0140/ADR-0141) — a restriction belongs to a PERSON, is carried by every line, is acknowledged per line, and is never divided across lines or addressed to the person carrying it',
    'Bulletproof Reliability Mandate — a limit the record can prove is computed exactly; a limit it cannot prove is REFUSED with its printed reason, never rendered as “no conflict”',
  ]),
  printed: Object.freeze([
    'Every conflict figure is an exact whole number of minutes computed from declared shifts by integer arithmetic, across every reporting line, with no averaging and no rounding.',
    'A restriction whose domain the workspace cannot see is printed `no-exposure-record` with its reason. It is never printed as clear.',
    'A finding is refused below the declared privacy floor with its reason; it is never a proportion of one.',
    'Person-level rows name the person below the executive altitude and are withheld above it; counts are printed at every altitude.',
    'A refusal with a written reason is a distinct state from an unanswered request, and neither is printed as an adjustment.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No diagnosis, condition, symptom, prognosis or clinical note is stored, and there is no unbounded free-text field one could hide in.',
    'No fitness rating, capacity percentage, rank, score or league table on a person.',
    'No decision that an adjustment is reasonable: the record holds the human decision, its reason and its day.',
    'No inference of a restriction from a period of absence, a plan, a shift pattern or a sick note count.',
    'No exposure model invented for the physical domains: the register refuses rather than guesses what a lifting task weighs.',
    'No automatic lifting of a restriction by the calendar: a review date passing changes the printed state, never the duty.',
  ]),
});

/* --------------------------------------------------------------- CSV #182 */

export const WPA_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'restrictions_n', 'live_n', 'people_n',
  'adjustments_n', 'agreed_not_in_place_n', 'no_adjustment_n', 'declined_n',
  'in_place_n', 'conflict_n', 'unproven_n', 'review_overdue_n', 'review_due_n',
  'lines_n', 'lines_unacknowledged_n', 'agreed_to_operational_days_median',
  'conflict_minutes_total', 'privacy_floor', 'complete', 'blank_reason',
]);

/**
 * CSV #182 (ADR-0241, Schema v195). IDENTITY-FREE BY CONSTRUCTION. One summary
 * row, one row per functional domain present on the record, and one row per
 * instrument present on the record. No person id, no person name, no manager
 * id, no statement text, no instrument reference and no day crosses this
 * boundary: a restriction is a claim about a person’s body and the export is a
 * count. A figure the reader cannot compute exports BLANK with its reason.
 */
export const WPA_CSV_DESCRIPTOR = Object.freeze({
  key: WPA_CSV_SCOPE,
  label: 'Workplace adjustments & functional restrictions (aggregate)',
  group: 'people',
  sensitive: true,
  filenameSlug: 'workplace-adjustments',
  description: 'One summary row, one row per functional demand domain and one per instrument. Counts of live restrictions, adjustments agreed versus operational, the exact median days between those two dates above its floor, restrictions with no adjustment, refused with a recorded reason, in place, in proven conflict with declared work, unprovable, and past their review date, plus the per-line acknowledgement gap. No person, manager, statement, reference or date is exported.',
});

export const WPA_SECTION_TITLES = Object.freeze({
  register: 'Register',
  conflicts: 'Declared work',
  lines: 'Lines',
  method: 'Method',
});

/** Refusals printed at the door. Each one is a control, not a message. */
export const WPA_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  noReach: 'That person is not on a line this seat holds. One line does not write another line’s people.',
});
