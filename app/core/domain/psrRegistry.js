/**
 * app/core/domain/psrRegistry.js — the closed vocabulary of the Pre-Startup
 * Safety Review & Commissioning Readiness Register (ADR-0258, Schema v210,
 * `#/pre-startup`, `RULE-PSR-01`, CSV scope #195).
 *
 * THE DUTY, IN AN OPERATIONS SUPERVISOR'S AND PLANT DIRECTOR'S WORDS. *"The
 * maintenance permits are closed and the project team says the modified unit is
 * mechanically complete and wants feed in by 06:00. Who proved the high-level
 * trip was tested against design, that safety and maintenance signed off
 * independently of the project engineer who built it, that every shift operator
 * on the unit was briefed on the revised procedure before energisation, which
 * punch items block startup versus which carry dated post-startup deadlines, and
 * — if this is a temporary bypass — the exact day it must be physically removed
 * and whether anyone ever removed it?"*
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD. Targeted word-boundary searches across
 * `app/`, `docs/adr/` and `ROADMAP.md` before this build returned ZERO hits for
 * `pre-startup`, `PSSR`, `Flixborough`, `punch list`, `punch-list`,
 * `commissioning gate`, `temporary modification`, `energisation`,
 * `energization`, `authority to start`, `ready for startup`,
 * `mechanical completion`, `startup authorisation` and `startup authorization`.
 * Adjacent registers do different duties: `workStop` (ADR-0224) halts running
 * work; `permitToWork` (ADR-0246) proves plant dead while crews work on it;
 * `standardWaiver` (ADR-0212) time-bounds a routine deviation; `authorisations`
 * (ADR-0247) holds external regulatory licences; `productNonconformance`
 * (ADR-0253) contains manufactured lots; `changes` models organisational change
 * plans. None governs the re-introduction of hazardous energy or live operation
 * to a new, modified, temporary or turnaround unit. Wider absence [UNVERIFIED].
 *
 * NAMED CROSS-DOMAIN FRAMEWORKS APPLIED:
 *   1. OSHA 29 CFR 1910.119(i) & EPA 40 CFR 68.77 (Pre-Startup Safety Review):
 *      construction/equipment matches design, safety/operating/maintenance/
 *      emergency procedures are in place, hazard-review items are resolved
 *      before startup, and every affected operating employee is trained before
 *      energisation.
 *   2. AIChE CCPS, Guidelines for Performing Effective Pre-Startup Safety
 *      Reviews (2007) & Risk-Based Process Safety (RBPS): hard separation of
 *      Category A pre-startup mandatory blockers from Category B post-startup
 *      dated conditions, plus multi-discipline walkdown sign-off.
 *   3. Flixborough Court of Inquiry (Parker Report, 1975) & U.S. CSB BP Texas
 *      City Report (2007-01-I-TX): temporary modifications require an explicit
 *      declared reversal date and a recorded physical restoration act (time
 *      never reverts a bypass); startup with unverified Category A controls is
 *      an unerasable safety breach.
 *   4. Reason (1990, 1997) Swiss-Cheese defence-in-depth & Holmström (1979)
 *      incentive-compatible gate separation: the modification proposer faces
 *      schedule pressure and is structurally barred from signing any required
 *      discipline gate, closing a Category A blocker, attesting operator
 *      readiness, or authorising startup; a Category A item owner cannot
 *      self-verify their own fix.
 *   5. Matrix Accountability & Joint-Apex Governance (Galbraith, 1973;
 *      ADR-0140/0141): startup authorisation sits at the computed live
 *      `matrixJointApex` above every active line holding the unit holder, the
 *      proposer and every discipline signer — no single line may authorise
 *      startup over another, and every person is counted once across lines.
 *
 * THIS REGISTER IS AN ACCOUNTABILITY AND EVIDENCE RECORD, NOT A PHYSICAL
 * INTERLOCK, DCS/PLC PERMISSIVE, ALARM SYSTEM OR EMERGENCY SERVICE.
 */

export const PSR_ENGINE_VERSION = 'pre-startup-safety-2026.11-v1';
export const PSR_ADR = 'ADR-0258';
export const PSR_RULE_ID = 'RULE-PSR-01';
export const PSR_ROUTE = 'pre-startup';
export const PSR_HREF = '#/pre-startup';
export const PSR_CSV_SCOPE = 'pre-startup-safety';
export const PSR_MARKER_KIND = 'pre-startup-safety';
export const PSR_EVENT_PREFIX = 'preStartup.';
export const PSR_PAUSE_SWITCH = 'psrAutoPropagate';

export const PSR_EVENTS = Object.freeze({
  REVIEW_OPENED: 'preStartup.review.opened',
  PUNCH_RECORDED: 'preStartup.punch.recorded',
  PUNCH_CLOSED: 'preStartup.punch.closed',
  SIGNOFF_RECORDED: 'preStartup.signoff.recorded',
  READINESS_ATTESTED: 'preStartup.readiness.attested',
  STARTUP_AUTHORISED: 'preStartup.startup.authorised',
  STARTUP_RECORDED: 'preStartup.startup.recorded',
  RESTORATION_RECORDED: 'preStartup.restoration.recorded',
  CONVENTIONS_SET: 'preStartup.conventions.set',
  SCANNED: 'preStartup.scan',
});

export const PSR_RIGHTS = Object.freeze({
  READ: 'read-pre-startup',
  OPEN: 'open-pre-startup',
  ACT: 'act-pre-startup',
  AUTHORISE: 'authorise-pre-startup',
});

export const PSR_SETTING_KEYS = Object.freeze({
  autoPropagate: 'psrAutoPropagate',
  privacyFloor: 'psrPrivacyFloor',
  revertHorizonDays: 'psrRevertHorizonDays',
});

export const PSR_BOUNDS = Object.freeze({
  privacyFloor: Object.freeze({ min: 2, max: 20 }),
  revertHorizonDays: Object.freeze({ min: 1, max: 90 }),
});

export const PSR_DEFAULTS = Object.freeze({
  privacyFloor: 3,
  revertHorizonDays: 14,
});

export const PSR_LIMITS = Object.freeze({
  reviews: 400,
  punchItems: 4000,
  signoffs: 3200,
  readiness: 4800,
  authorisations: 400,
  startups: 400,
  markers: 400,
  shortMin: 3,
  shortMax: 120,
  textMin: 24,
  textMax: 600,
  idMax: 120,
  operatorsMin: 1,
  operatorsMax: 12,
  disciplinesMin: 1,
  disciplinesMax: 6,
  asksPerCommit: 4,
});

/**
 * Trigger kinds (CCPS PSSR & OSHA 29 CFR 1910.119(i)). `temporary-change`
 * carries a mandatory declared `revertByDay` and requires a recorded physical
 * restoration act to close; permanent triggers forbid `revertByDay` so the two
 * lifecycles can never be confused.
 */
export const PSR_TRIGGERS = Object.freeze([
  Object.freeze({
    key: 'new-facility',
    label: 'New unit / facility commissioning',
    temporary: false,
    says: 'First introduction of energy, process medium or live service into a newly built unit, line or facility.',
  }),
  Object.freeze({
    key: 'modification',
    label: 'Permanent modification (MOC)',
    temporary: false,
    says: 'A permanent technical, equipment, control-logic or operating-envelope modification changing process safety or operational baseline information.',
  }),
  Object.freeze({
    key: 'temporary-change',
    label: 'Temporary modification / bypass',
    temporary: true,
    says: 'A time-limited modification, jumper, bypass or interim configuration. Requires a declared revert-by day and a separately evidenced physical restoration to baseline (Flixborough control).',
  }),
  Object.freeze({
    key: 'turnaround-restart',
    label: 'Turnaround / extended-outage restart',
    temporary: false,
    says: 'Restart of an existing unit following a turnaround, major overhaul or prolonged outage.',
  }),
  Object.freeze({
    key: 'post-incident-restart',
    label: 'Post-incident / emergency-shutdown restart',
    temporary: false,
    says: 'Restart after an unscheduled trip, containment loss or safety event requiring formal pre-startup verification.',
  }),
]);
export const PSR_TRIGGER_KEYS = Object.freeze(PSR_TRIGGERS.map((row) => row.key));
export const PSR_TRIGGER_BY_KEY = Object.freeze(Object.fromEntries(PSR_TRIGGERS.map((row) => [row.key, row])));

/**
 * Closed discipline vocabulary. Each review declares the exact subset required
 * for its scope — the register never invents or removes a gate.
 */
export const PSR_DISCIPLINES = Object.freeze([
  Object.freeze({ key: 'operations', label: 'Operations', says: 'Operating procedures, line-up, normal/emergency shutdown steps and control-room/line readiness verified.' }),
  Object.freeze({ key: 'engineering', label: 'Engineering & design', says: 'As-built installation, materials of construction, relief sizing and design specifications verified.' }),
  Object.freeze({ key: 'safety', label: 'Process safety / EHS', says: 'PHA/HAZOP/MOC safety recommendations, safeguarding barriers, fire/gas/exposure and emergency response verified.' }),
  Object.freeze({ key: 'maintenance', label: 'Maintenance & mechanical integrity', says: 'Mechanical completion, inspection records, leak/pressure tests, guarding and critical spares verified.' }),
  Object.freeze({ key: 'instrumentation', label: 'Instrumentation & controls', says: 'Alarm/trip setpoints, safety interlocks, loop checks, calibration currency and fail-safe states verified.' }),
  Object.freeze({ key: 'quality', label: 'Quality & compliance', says: 'Product/service qualification, regulatory conditions, calibration/cleanliness release and specification limits verified.' }),
]);
export const PSR_DISCIPLINE_KEYS = Object.freeze(PSR_DISCIPLINES.map((row) => row.key));
export const PSR_DISCIPLINE_BY_KEY = Object.freeze(Object.fromEntries(PSR_DISCIPLINES.map((row) => [row.key, row])));

/**
 * CCPS punch-list categories. Category A blocks startup authorisation; Category B
 * may follow startup ONLY with an explicit calendar due day, and turns overdue
 * on the live unit the day after.
 */
export const PSR_PUNCH_CATEGORIES = Object.freeze([
  Object.freeze({
    key: 'pre-startup',
    code: 'Cat A',
    label: 'Category A — before startup (blocker)',
    blocksStartup: true,
    says: 'Must be completed and independently verified closed (neither by the modification proposer nor by the item owner) before startup may be authorised.',
  }),
  Object.freeze({
    key: 'post-startup',
    code: 'Cat B',
    label: 'Category B — after startup (dated condition)',
    blocksStartup: false,
    says: 'Non-blocking condition permitted to complete after startup against a mandatory declared due day; tracked to verified closure while the unit is live.',
  }),
]);
export const PSR_PUNCH_CATEGORY_KEYS = Object.freeze(PSR_PUNCH_CATEGORIES.map((row) => row.key));
export const PSR_PUNCH_CATEGORY_BY_KEY = Object.freeze(Object.fromEntries(PSR_PUNCH_CATEGORIES.map((row) => [row.key, row])));

/**
 * Discipline gate sign-off verdicts. The LATEST valid (non-proposer) sign-off
 * per (review, discipline) governs, so a later rejection revokes an earlier
 * clearance while keeping both rows in history.
 */
export const PSR_SIGNOFF_VERDICTS = Object.freeze([
  Object.freeze({ key: 'cleared', label: 'Cleared for startup', tone: 'good', says: 'The discipline verified its pre-startup requirements against cited walkdown or test evidence.' }),
  Object.freeze({ key: 'rejected', label: 'Rejected — hold startup', tone: 'bad', says: 'The discipline identified an unmet pre-startup condition and holds startup until re-verified and cleared.' }),
]);
export const PSR_SIGNOFF_VERDICT_KEYS = Object.freeze(PSR_SIGNOFF_VERDICTS.map((row) => row.key));
export const PSR_SIGNOFF_VERDICT_BY_KEY = Object.freeze(Object.fromEntries(PSR_SIGNOFF_VERDICTS.map((row) => [row.key, row])));

/**
 * Ten mutually exclusive derived states, ordered by operational urgency. Every
 * review maps to EXACTLY one state on read; underlying flags and breaches are
 * printed beside the state so a headline never hides a secondary failure.
 */
export const PSR_STATES = Object.freeze([
  Object.freeze({
    key: 'breach-energised-unsafe',
    label: 'Energised — safety gate breach',
    tone: 'bad',
    attention: true,
    says: 'Physical startup/energisation is on the record without a valid joint-apex startup authorisation, before authorisation, or while a Category A blocker, required discipline gate or affected-operator briefing was unmet. Retained permanently as audit evidence; later paperwork never converts this state to closed-verified.',
  }),
  Object.freeze({
    key: 'temporary-expired-live',
    label: 'Temporary change expired — still live',
    tone: 'bad',
    attention: true,
    says: 'A temporary modification or bypass is energised past its declared revert-by day with no recorded physical restoration to baseline. Time never reverts a temporary change.',
  }),
  Object.freeze({
    key: 'live-post-startup-overdue',
    label: 'Live — Cat B condition overdue',
    tone: 'bad',
    attention: true,
    says: 'The unit was lawfully authorised and energised, and one or more Category B post-startup conditions are open past their declared due day.',
  }),
  Object.freeze({
    key: 'gate-rejected',
    label: 'Discipline gate rejected',
    tone: 'bad',
    attention: true,
    says: 'Not yet energised. At least one required discipline’s latest independent sign-off rejected startup; authorisation is refused until re-verified and cleared.',
  }),
  Object.freeze({
    key: 'blocked-pre-startup',
    label: 'Blocked — Cat A items open',
    tone: 'warn',
    attention: true,
    says: 'Not yet energised. One or more Category A pre-startup mandatory punch items remain open (or carry only a disqualified self/proposer closure); authorisation is refused.',
  }),
  Object.freeze({
    key: 'awaiting-verification',
    label: 'Awaiting sign-offs / readiness',
    tone: 'warn',
    attention: false,
    says: 'Not yet energised and zero Category A blockers open, waiting on remaining independent discipline sign-offs or affected-operator pre-startup readiness attestations.',
  }),
  Object.freeze({
    key: 'ready-for-authorisation',
    label: 'Ready for joint-apex authorisation',
    tone: 'warn',
    attention: true,
    says: 'All Category A blockers are independently closed, every required discipline cleared independently of the proposer, and every affected operator is attested. Waiting for Startup Authorisation from the computed matrix joint apex.',
  }),
  Object.freeze({
    key: 'live-conditions-open',
    label: 'Live — in-window conditions / temporary',
    tone: 'warn',
    attention: false,
    says: 'Lawfully authorised and energised, carrying in-window Category B post-startup conditions and/or an active temporary modification inside its declared revert-by day.',
  }),
  Object.freeze({
    key: 'authorised-awaiting-startup',
    label: 'Authorised — awaiting startup',
    tone: 'good',
    attention: false,
    says: 'A valid joint-apex Startup Authorisation stands with every pre-startup gate intact; physical energisation has not yet been recorded.',
  }),
  Object.freeze({
    key: 'closed-verified',
    label: 'Closed — verified complete',
    tone: 'good',
    attention: false,
    says: 'Lawfully authorised and energised with zero gate breaches, every Category A and Category B item verified closed, and — for temporary changes — physical restoration to baseline recorded.',
  }),
]);
export const PSR_STATE_KEYS = Object.freeze(PSR_STATES.map((row) => row.key));
export const PSR_STATE_BY_KEY = Object.freeze(Object.fromEntries(PSR_STATES.map((row) => [row.key, row])));

/** Named unsafe-startup breach codes (derived, never stored). */
export const PSR_BREACH_LABELS = Object.freeze({
  'energised-without-authorisation': 'Energised with no recorded startup authorisation',
  'energised-on-invalid-authorisation': 'Energised under a disqualified startup authorisation',
  'energised-before-authorisation': 'Energised before the startup authorisation instant',
  'energised-with-open-blockers': 'Energised while Category A pre-startup blocker(s) were open or unverified',
  'energised-with-rejected-gate': 'Energised while a required discipline gate stood rejected',
  'energised-with-missing-disciplines': 'Energised before every required discipline signed independently',
  'energised-with-unbriefed-operators': 'Energised before every affected operator was independently attested',
});

/** Refusals printed at the command door. */
export const PSR_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That pre-startup safety review is not on this record, or lies outside your seat’s reach. Nothing was saved.',
  noReach: 'That person is not on an active line this seat holds. One line may not commit another line’s people.',
});

export const PSR_SECTION_TITLES = Object.freeze({
  reviews: 'Reviews & lines',
  punch: 'Punch list (Cat A / B)',
  gates: 'Discipline gates & readiness',
  startups: 'Authorisations & temporary',
  method: 'Method',
});

export const PSR_CSV_COLUMNS = Object.freeze([
  'as_of',
  'row_kind',
  'key',
  'reviews_n',
  'unsafe_breach_n',
  'temporary_expired_n',
  'post_overdue_n',
  'gate_rejected_n',
  'blocked_cat_a_n',
  'awaiting_verification_n',
  'ready_for_auth_n',
  'live_conditions_open_n',
  'authorised_waiting_n',
  'closed_verified_n',
  'temporary_expiring_n',
  'cat_a_open_n',
  'cat_a_closed_n',
  'cat_b_open_n',
  'cat_b_overdue_n',
  'cat_b_closed_n',
  'gates_cleared_n',
  'gates_rejected_n',
  'operators_n',
  'operators_unbriefed_n',
  'people_n',
  'lines_n',
  'privacy_floor',
  'balances',
  'complete',
  'blank_reason',
]);

/**
 * CSV #195 (ADR-0258, Schema v210). Identity-free aggregate export. No review
 * reference, unit name, change specification, punch finding, document reference,
 * person name, manager id or event timestamp crosses the boundary. Non-zero
 * split counts below `psrPrivacyFloor` export blank with a printed reason, and
 * `balances` (partition arithmetic) is exported separately from `complete`
 * (record integrity / orphan-free / zero dropped rows).
 */
export const PSR_CSV_DESCRIPTOR = Object.freeze({
  key: PSR_CSV_SCOPE,
  label: 'Pre-startup safety review and commissioning readiness (aggregate)',
  group: 'operations',
  sensitive: true,
  filenameSlug: 'pre-startup-safety',
  description: 'One summary row, one row per printed review state, one row per trigger kind and one row per verification discipline. Counts of reviews, unsafe-startup breaches, expired live temporary modifications, overdue Category B post-startup conditions, rejected gates, open/closed Category A blockers, cleared/rejected discipline gates, single-identity operators and reporting lines. Separate `balances` and `complete` flags; non-zero split counts below `psrPrivacyFloor` export blank with reason; zero identities, unit names or free text.',
});

export const PSR_METHOD = Object.freeze({
  engine: PSR_ENGINE_VERSION,
  adr: PSR_ADR,
  frameworks: Object.freeze([
    'OSHA 29 CFR 1910.119(i) & EPA 40 CFR 68.77 (Pre-Startup Safety Review): verifies before energisation that construction matches design, procedures are in place, change-hazard actions are resolved, and affected operators have been briefed. This register records human attestations and cited references; it does not certify legal compliance for any jurisdiction.',
    'AIChE CCPS, Guidelines for Performing Effective Pre-Startup Safety Reviews (2007) & Risk-Based Process Safety: separates Category A pre-startup mandatory blockers from Category B post-startup conditions carrying explicit due dates, across explicitly declared engineering, operations, safety, maintenance, instrumentation and quality discipline gates.',
    'Flixborough Court of Inquiry (Parker Report, 1975) & U.S. CSB BP Texas City Investigation (2007-01-I-TX): temporary modifications must declare a revert-by day at opening and only exit live status on a recorded physical restoration act; energising while a Category A control or startup gate is unmet is recorded as a permanent `breach-energised-unsafe` finding.',
    'Reason (1990, 1997) defence-in-depth & Holmström (1979) incentive separation: the modification proposer is barred from signing any discipline gate, verifying closure of a Category A blocker, attesting operator readiness, or authorising startup; Category A item owners cannot self-close their own items.',
    'Matrix Accountability & Joint-Apex Governance (Galbraith, 1973; ADR-0140/0141): Startup Authorisation requires the unique computed `matrixJointApex` across all active lines holding the unit holder, the proposer and every discipline signer. Multi-line people are counted once; ambiguous apexes and off-graph hands are refused or flagged explicitly.',
    'Bulletproof Reliability Mandate: zero derived state is stored; `balances` (the 10 states partition the reviews) and `figuresComplete` (no dropped rows, no off-graph hands, no graph failure) are computed and printed separately.',
  ]),
  printed: Object.freeze([
    'One derived state per review from the ten-state partition, plus every underlying breach code and integrity flag (disqualified self/proposer closures, proposer sign-offs, invalid authorisations, approaching temporary-change deadlines, schedule overrun).',
    'Category A pre-startup blockers and Category B post-startup conditions held apart, with independent verifier attribution and exact UTC calendar days overdue on Category B items.',
    'Required discipline gates with latest governing independent verdict (`cleared` vs `rejected`), plus affected-operator readiness coverage against each cited procedure.',
    'Computed matrix joint-apex startup authority, Startup Authorisation status, physical energisation timestamp, and exact UTC days remaining or overdue to revert each temporary modification.',
    'Per-line matrix roll-up counting each person once, and an identity-free privacy-floored CSV export (#195).',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No physical interlock, DCS/PLC tag binding, alarm monitoring, automated isolation hardware check or emergency dispatch — recording an authorisation here never locks or unlocks plant.',
    'No stored review state, no silent Category A → Category B downgrade, no default discipline list, no default temporary-change duration, and no automatic restoration when a revert-by day passes.',
    'No refusal of a factual past energisation report — startup authorisation refuses unmet gates before the fact, while the startup log records a premature energisation honestly as `breach-energised-unsafe`.',
    'No document management repository, mobile GPS photo markup, AI-generated checklist guessing or digital-twin simulation (compared against VisiumKMS, Frontline Data Solutions, VelocityEHS, Sphera, Enablon and Sparrow Infinity; hands-on vendor parity [BENCHMARK-UNVERIFIED]).',
    'No personal compliance score, league table or blame ranking on any operator, supervisor, engineer or reporting line.',
  ]),
});
