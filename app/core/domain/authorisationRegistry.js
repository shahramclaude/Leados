/**
 * app/core/domain/authorisationRegistry.js — the closed vocabulary of the
 * Statutory Authorisation & Licence-to-Operate Register (ADR-0247, Schema v201,
 * `#/authorisations`, `RULE-LTO-01`, CSV scope #188).
 *
 * THE DUTY, IN A SITE DIRECTOR'S WORDS. *"The tank farm holds an environmental
 * permit and a hazardous-substances consent. Both were granted against written
 * conditions — bunding inspections, throughput limits, a leak-detection test every
 * quarter. In March the permit lapsed while the site kept loading tankers, and
 * nobody noticed until the regulator served a prohibition notice. Where is the
 * record that says, on any given morning, which authority is in force, which
 * condition we have actually evidenced, and which notice is standing against us?"*
 *
 * No surface in this workspace could answer any part of that. The workspace could
 * already record a permit TO WORK (`permitToWork`, ADR-0246 — a dated authority for
 * a defined task on defined plant), an incident command (ADR-0240), a regulatory
 * undertaking the enterprise made (ADR-0234), a regulator information request
 * (ADR-0235) and an assurance finding against a control (ADR-0232). Every one of
 * those begins after an authority already exists. `incidentCommandRegistry` even
 * offers "a period set by a supervisor in an order, undertaking or licence
 * condition" as a clock source — and the licence itself was nowhere on the record.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. Word-boundary
 * searches of `app/` before this build returned ZERO files for `licence register`,
 * `permit to operate`, `operating licence`, `trading licence`, `premises licence`,
 * `fire safety`, `food safety`, `environmental permit`, `conditions of licence`,
 * `regulatory action`, `enforcement action`, `improvement notice`, `prohibition
 * notice`, `LOLER`, `lifting equipment`, `pressure vessel` and `statutory
 * examination`. The surviving `licence` hits are prose ("not a licence", "a
 * duplicate analytics licence"), a deal-type label and ADR-0240's clock source.
 * Wider absence **[UNVERIFIED]**.
 *
 * WHAT THE BENCHMARKED CATEGORY GETS RIGHT. Compliance/GRC and licence-tracking
 * products (Effivity, ExpiryEdge, MetricStream, Archer, Diligent, LogicGate,
 * OneTrust, NAVEX One) set the bar with the same five mechanics [vendor
 * documentation, hands-on parity UNVERIFIED]:
 *
 *   1. **A register of every authority with its issuing body, number, expiry and a
 *      named owner** — one record per licence per site per jurisdiction.
 *   2. **A renewal window declared per authority**, with reminders raised early
 *      enough to finish whatever the issuing body requires first.
 *   3. **Conditions broken out and monitored individually**, with evidence reused
 *      across them.
 *   4. **A notice of violation logged and investigated**, not folded into the
 *      licence status.
 *   5. **A renewal filed but never verified stays open rather than disappearing**
 *      — and multi-site roll-ups filter by what expires next.
 *
 * WHAT THIS REGISTER ADDS THAT NO PRODUCT IN THE CATEGORY DOES — AND WHY IT IS THE
 * POINT RATHER THAN A FEATURE. A licence tracker stores a status somebody last
 * typed. It cannot answer the two questions a real organisation fails:
 *
 *   - **What does the record PROVE at this instant?** A submitted renewal is not a
 *     grant. A closure recorded against a revocation is not a revocation lifted. A
 *     condition nobody evidenced is not a condition met. An authority lapsed forty
 *     minutes ago is not the same fact as an authority that lapsed a year ago while
 *     the site kept working. This register derives every one of those on read and
 *     prints them apart.
 *   - **Whose duty is it?** An authority is usually held by more than one hand
 *     across reporting lines — a site manager, a functional compliance lead, a
 *     project director whose activity the consent covers. The ask therefore goes to
 *     the JOINT APEX above EVERY line holding EVERY accountable hand, never to one
 *     line on another's behalf, and never silently to a single "owner" the record
 *     picked.
 *
 * THE FIVE THINGS THAT MUST NEVER HAPPEN, AND ARE PREVENTED BY CONSTRUCTION:
 *   - **No stored status, no stored "compliant".** Every state is derived on read.
 *   - **No renewal treated as a grant.** Only a dated decision with a new expiry
 *     extends the authority, and a "grant" that would shorten validity is refused.
 *   - **No "comply away".** A revocation is terminal in the record; an improvement
 *     or prohibition notice closes only by a recorded compliance or withdrawal act.
 *   - **No unevidenced condition read as met.** A condition with no evidence prints
 *     `unevidenced`; a condition past its declared re-evidence window prints
 *     `stale`. Neither is ever `current`.
 *   - **No authority declared to have stopped operating.** The reader can prove an
 *     authority lapsed; it cannot prove the activity stopped. It says exactly that.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). An authority names one to four accountable
 * people. The reader resolves every ACTIVE reporting line that holds each of them,
 * prints each holder's line position, counts a person ONCE, and addresses every
 * rule ask to `matrixJointApex` over every manager of every holder. Where a holder
 * is off the graph the row is printed as an orphan rather than dropped, because
 * deleting it would erase a live legal authority from the record.
 */

export const LTO_ENGINE_VERSION = 'statutory-authorisation-2026.11-v1';
export const LTO_ADR = 'ADR-0247';
export const LTO_RULE_ID = 'RULE-LTO-01';
export const LTO_ROUTE = 'authorisations';
export const LTO_HREF = '#/authorisations';
export const LTO_CSV_SCOPE = 'statutory-authorisations';
export const LTO_MARKER_KIND = 'authorisation';
export const LTO_EVENT_PREFIX = 'authorisation.';

export const LTO_EVENTS = Object.freeze({
  AUTHORISATION_DECLARED: 'authorisation.declared',
  CONDITION_DECLARED: 'authorisation.condition.declared',
  EVIDENCE_RECORDED: 'authorisation.evidence.recorded',
  ACTION_RECORDED: 'authorisation.action.recorded',
  ACTION_CLOSED: 'authorisation.action.closed',
  RENEWAL_SUBMITTED: 'authorisation.renewal.submitted',
  RENEWAL_DECIDED: 'authorisation.renewal.decided',
  CONVENTIONS_SET: 'authorisation.conventions.set',
  SCANNED: 'authorisation.scan',
});

export const LTO_RIGHTS = Object.freeze({
  READ: 'read-authorisations',
  MANAGE: 'manage-authorisations',
});

export const LTO_SETTING_KEYS = Object.freeze({
  autoPropagate: 'ltoAutoPropagate',
  privacyFloor: 'ltoPrivacyFloor',
  horizonDays: 'ltoHorizonDays',
});

export const LTO_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
  horizonDays: { min: 1, max: 365 },
});

export const LTO_DEFAULTS = Object.freeze({
  privacyFloor: 3,
  horizonDays: 90,
});

export const LTO_LIMITS = Object.freeze({
  authorisations: 400,
  conditions: 2000,
  evidence: 8000,
  actions: 1500,
  renewals: 1500,
  markers: 400,
  /** A written condition or basis shorter than this names nothing. */
  textMin: 24,
  textMax: 600,
  /** A site, an activity or an issuing authority: bounded and non-empty. */
  shortMin: 3,
  shortMax: 120,
  /** The written instrument reference a licence is held under. */
  instrumentMin: 12,
  idMax: 120,
  /** The longest declared validity one authority may carry. */
  spanMaxDays: 3650,
  /** How far ahead a grant may be declared, and how far back it may be recorded. */
  aheadMaxDays: 1825,
  backfillMaxDays: 3650,
  /** Where the renewal lead time may sit. `0` is legitimate — renew on the day. */
  leadDaysMax: 365,
  /** The longest a condition may be declared to go without re-evidence. */
  conditionMaxAgeDays: 730,
  /** How many accountable hands one authority may name. */
  holdersMax: 4,
  /** Rule asking. */
  rowsShown: 80,
});

/** Rank that may read the register. */
export const LTO_READ_MIN_RANK = 1;
/**
 * Rank that may declare an authority, a condition, evidence, a regulator action, a
 * close-out or a renewal decision.
 *
 * RANK 1, DELIBERATELY. The site supervisor who opens the gates is the hand that
 * must be able to record the authority they are opening them under. What protects
 * the record is not the rank: it is the written instrument requirement, the
 * `holdsPerson` reach over every accountable hand, the refusal of a renewal
 * treated as a grant, and RULE-LTO-01 addressing the joint apex.
 */
export const LTO_MANAGE_MIN_RANK = 1;

/**
 * The six kinds of regulator action. `closable` and `closeKinds` are declared
 * here so the door and the loader cannot disagree about what ends what.
 *
 * A REVOCATION IS NOT CLOSABLE. The authority is gone; only a new declaration
 * brings a new one. An `improvement-notice` carries the compliance date its own
 * instrument set (`dueRequired`); a `condition-variation` is a recorded event, not
 * a stop, and it never creates a condition row by itself — inventing one would be
 * the register deciding what the regulator meant.
 */
export const LTO_ACTION_KINDS = Object.freeze([
  Object.freeze({
    key: 'improvement-notice',
    label: 'Improvement notice',
    says: 'A notice requiring named steps by a stated day. The authority stays in force; the duty is the notice.',
    closable: true,
    closeKinds: Object.freeze(['complied', 'withdrawn']),
    dueRequired: true,
    stopsActivity: false,
  }),
  Object.freeze({
    key: 'prohibition-notice',
    label: 'Prohibition notice',
    says: 'A notice prohibiting the activity it names. The activity is prohibited while the notice stands.',
    closable: true,
    closeKinds: Object.freeze(['complied', 'withdrawn']),
    dueRequired: false,
    stopsActivity: true,
  }),
  Object.freeze({
    key: 'suspension',
    label: 'Suspension',
    says: 'The authority is suspended. It is not in force until a recorded lifting act.',
    closable: true,
    closeKinds: Object.freeze(['lifted', 'withdrawn']),
    dueRequired: false,
    stopsActivity: true,
  }),
  Object.freeze({
    key: 'revocation',
    label: 'Revocation',
    says: 'The authority is revoked. This is terminal in the record: only a new declaration brings a new authority.',
    closable: false,
    closeKinds: Object.freeze([]),
    dueRequired: false,
    stopsActivity: true,
  }),
  Object.freeze({
    key: 'condition-variation',
    label: 'Condition variation',
    says: 'The regulator varied the conditions. This is the event; the varied conditions are declared and evidenced separately, never inferred from it.',
    closable: false,
    closeKinds: Object.freeze([]),
    dueRequired: false,
    stopsActivity: false,
  }),
  Object.freeze({
    key: 'warning',
    label: 'Warning',
    says: 'A recorded warning. It stops nothing and closes nothing; it is on the record because it happened.',
    closable: false,
    closeKinds: Object.freeze([]),
    dueRequired: false,
    stopsActivity: false,
  }),
]);
export const LTO_ACTION_KIND_KEYS = Object.freeze(LTO_ACTION_KINDS.map((row) => row.key));
export const LTO_ACTION_KIND_BY_KEY = Object.freeze(Object.fromEntries(LTO_ACTION_KINDS.map((row) => [row.key, row])));

/** Every close kind, with the action kinds it may close. */
export const LTO_CLOSE_KINDS = Object.freeze([
  Object.freeze({ key: 'complied', label: 'Complied', says: 'The steps the notice required were completed. The close names the evidence basis.' }),
  Object.freeze({ key: 'withdrawn', label: 'Withdrawn by the regulator', says: 'The regulator withdrew the notice. The close names the written basis.' }),
  Object.freeze({ key: 'lifted', label: 'Lifted', says: 'The suspension was lifted. The authority returns only if its own expiry still allows it.' }),
]);
export const LTO_CLOSE_KIND_KEYS = Object.freeze(LTO_CLOSE_KINDS.map((row) => row.key));
export const LTO_CLOSE_KIND_BY_KEY = Object.freeze(Object.fromEntries(LTO_CLOSE_KINDS.map((row) => [row.key, row])));

/** A renewal decision is one of two things, and `pending` is not stored. */
export const LTO_RENEWAL_DECISIONS = Object.freeze([
  Object.freeze({ key: 'granted', label: 'Granted', says: 'The authority was granted a new expiry, and only from this recorded decision.' }),
  Object.freeze({ key: 'refused', label: 'Refused', says: 'The renewal was refused. A refusal takes no expiry and never extends a thing.' }),
]);
export const LTO_RENEWAL_DECISION_KEYS = Object.freeze(LTO_RENEWAL_DECISIONS.map((row) => row.key));

/**
 * The nine states. Each is a DIFFERENT FACT. `tone` only colours the badge; `says`
 * is what the screen prints under it.
 */
export const LTO_STATES = Object.freeze([
  Object.freeze({
    key: 'revoked',
    label: 'Revoked',
    tone: 'bad',
    says: 'A revocation stands on the record. No later act in this register restores the authority; only a new declaration does.',
  }),
  Object.freeze({
    key: 'suspended',
    label: 'Suspended',
    tone: 'bad',
    says: 'The authority is suspended and no lifting act is recorded. It is not in force.',
  }),
  Object.freeze({
    key: 'prohibited',
    label: 'Activity prohibited',
    tone: 'bad',
    says: 'A prohibition notice stands against the activity this authority covers. The licence may still be in force; the activity is prohibited.',
  }),
  Object.freeze({
    key: 'lapsed-awaiting-decision',
    label: 'Lapsed, renewal undecided',
    tone: 'bad',
    says: 'The authority’s own expiry passed and a renewal is submitted but undecided. A submission is not a grant: the authority is not in force.',
  }),
  Object.freeze({
    key: 'lapsed',
    label: 'Lapsed',
    tone: 'bad',
    says: 'The authority’s own expiry passed with no suspension or revocation recorded either. The record proves the authority lapsed; it cannot prove the activity stopped, and says so.',
  }),
  Object.freeze({
    key: 'not-yet-granted',
    label: 'Not yet in force',
    tone: 'neutral',
    says: 'The declared grant instant is still ahead. The authority is not in force yet.',
  }),
  Object.freeze({
    key: 'renewal-in-flight',
    label: 'Renewal in flight',
    tone: 'warn',
    says: 'The authority is in force and a renewal is submitted and undecided. It stays in force only until its own expiry.',
  }),
  Object.freeze({
    key: 'expiring',
    label: 'Inside its renewal window',
    tone: 'warn',
    says: 'The authority is in force and inside the renewal lead time its own declaration set. The next responsible start date has arrived.',
  }),
  Object.freeze({
    key: 'in-force',
    label: 'In force',
    tone: 'good',
    says: 'The authority is in force at this instant and outside its declared renewal window.',
  }),
]);
export const LTO_STATE_KEYS = Object.freeze(LTO_STATES.map((row) => row.key));
export const LTO_STATE_BY_KEY = Object.freeze(Object.fromEntries(LTO_STATES.map((row) => [row.key, row])));
export const LTO_BAD_STATE_KEYS = Object.freeze(['revoked', 'suspended', 'prohibited', 'lapsed', 'lapsed-awaiting-decision']);

/** The three condition states. An unevidenced condition is never "met". */
export const LTO_CONDITION_STATES = Object.freeze([
  Object.freeze({ key: 'current', label: 'Evidenced', tone: 'good', says: 'Evidence is on the record inside the condition’s own re-evidence window.' }),
  Object.freeze({ key: 'stale', label: 'Evidence stale', tone: 'warn', says: 'Evidence exists but is older than the window this condition was declared against.' }),
  Object.freeze({ key: 'unevidenced', label: 'No evidence', tone: 'bad', says: 'No evidence has ever been recorded against this condition. The register cannot say it is met.' }),
]);
export const LTO_CONDITION_STATE_KEYS = Object.freeze(LTO_CONDITION_STATES.map((row) => row.key));
export const LTO_CONDITION_STATE_BY_KEY = Object.freeze(Object.fromEntries(LTO_CONDITION_STATES.map((row) => [row.key, row])));

/** Refusals printed at the door. Each one is a control, not a message. */
export const LTO_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  noReach: 'That person is not on a line this seat holds. One line does not answer for another line’s authority.',
});

export const LTO_SECTION_TITLES = Object.freeze({
  register: 'Authorities',
  conditions: 'Conditions',
  actions: 'Regulator actions',
  method: 'Method',
});

export const LTO_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'authorisations_n', 'in_force_n', 'expiring_n', 'lapsed_n',
  'suspended_n', 'revoked_n', 'prohibited_n', 'not_yet_granted_n', 'renewal_in_flight_n',
  'conditions_n', 'conditions_unevidenced_n', 'conditions_stale_n', 'actions_n',
  'improvement_open_n', 'improvement_overdue_n', 'renewal_refused_n', 'holders_n', 'lines_n',
  'lapsed_minutes_total', 'privacy_floor', 'complete', 'blank_reason',
]);

/**
 * CSV #188 (ADR-0247, Schema v201). IDENTITY-FREE BY CONSTRUCTION. One summary row,
 * one row per printed authority state and one row per printed condition state. No
 * site reference, activity, issuing body, instrument reference, instrument number,
 * person, manager, notice reference or instant crosses this boundary: which site
 * has lost which consent is exactly the disclosure that makes an export dangerous.
 * A figure the reader cannot compute exports BLANK with its reason, never a zero.
 */
export const LTO_CSV_DESCRIPTOR = Object.freeze({
  key: LTO_CSV_SCOPE,
  label: 'Statutory authorisations (aggregate)',
  group: 'operations',
  sensitive: true,
  filenameSlug: 'statutory-authorisations',
  description: 'One summary row, one row per printed authority state and one row per printed condition state. Counts of authorities held, in force, inside their renewal window, lapsed with the exact whole minutes lapsed in total, suspended, revoked, prohibited, not yet in force and with a renewal in flight; conditions declared, unevidenced and stale; regulator actions, improvement notices open and overdue; refused renewals; accountable hands and reporting lines involved. No site, activity, issuing body, instrument, notice, person, manager or instant is exported. A per-state count below the declared privacy floor is withheld BLANK with its reason, never printed as a small number.',
});

/** The published framework basis, printed on the method tab. Never a claim of parity. */
export const LTO_METHOD = Object.freeze({
  engine: LTO_ENGINE_VERSION,
  adr: LTO_ADR,
  frameworks: Object.freeze([
    'Statutory licensing and permit-to-operate duties: an authority is granted on a written instrument with conditions, an expiry and an issuing body — and operating outside it is an offence, not a data-quality issue.',
    'Regulatory enforcement practice: an improvement notice sets steps and a day; a prohibition notice stops an activity; a suspension or revocation takes the authority away; each is a dated act with a written basis and its own closure.',
    'Compliance evidence chains (COSO / ISO 37301): a condition is evidenced by a dated record, re-evidenced inside its declared window, and never inferred from the existence of a licence.',
    'Renewal lead-time planning: the responsible start date is derived from the expiry and the lead time the declaration itself set, never from a workspace default.',
    'Matrix addressing (ADR-0140/0141): one authority may be held by several hands across reporting lines, so the duty is addressed to the joint apex above every line holding any of them — never to one line on another’s behalf.',
    'Bulletproof reliability: a lapsed authority is a fact the record can prove; a stopped activity is not. The register prints the first and refuses the second.',
  ]),
  printed: Object.freeze([
    'Each authority’s grant, its declared expiry, every granted renewal expiry and the effective expiry derived from them.',
    'The exact whole minutes lapsed, and the exact whole days to expiry.',
    'Every condition declared against it, its latest evidence and its own re-evidence window — current, stale or unevidenced.',
    'Every regulator action, whether it stands, its written basis, its compliance day and how it closed.',
    'Every renewal submission and decision, and the fact that a submission never extends the authority.',
    'Every accountable hand, every active line that holds each of them, and the joint seat above them all.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No stored status, no stored “compliant” tick and no per-site compliance score.',
    'No document store: an evidence REFERENCE is recorded, never the certificate itself, so the register cannot be mistaken for a repository of the evidence.',
    'No jurisdiction table, no statutory default period and no automatic renewal window. Every one is a fact about a particular instrument, declared on the authority.',
    'No inference of a condition from a condition-variation notice, and no inference of a renewal from a submission.',
    'No claim that an activity stopped because its authority lapsed. The record proves the lapse and says what it cannot prove.',
    'No person, site or line rated, ranked or named as a cause.',
  ]),
});
