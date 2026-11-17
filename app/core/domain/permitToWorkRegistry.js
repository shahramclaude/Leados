/**
 * app/core/domain/permitToWorkRegistry.js — the closed vocabulary of the
 * Permit-to-Work, Energy-Isolation & Simultaneous-Operations Register
 * (ADR-0246, Schema v200, `#/permit-to-work`, `RULE-PTW-01`, CSV scope #187).
 *
 * THE DUTY, IN A PERMIT AUTHORITY'S WORDS. *"Two crews are on the same plant this
 * afternoon. One has a hot-work permit for the tank room; the other is breaking a
 * flange on the line into it. Somebody lifted an isolation on that line at eleven
 * because his own job was finished — and the hot-work permit is still live, and
 * nobody's screen ever put those two facts next to each other. What do we
 * actually hold, where is the energy still in the plant, and who is allowed to
 * say the work may start?"*
 *
 * No surface in this workspace could answer any part of that. The estate already
 * records a first-person stop-work hold (`workStop`, ADR-0224), whether a station
 * is manned (`stationCoverage`), the rest between two shifts (`workRest`), a
 * functional limit somebody must not exceed (`workplaceAdjustment`, ADR-0241),
 * and who is alone with a welfare clock (`loneWorking`, ADR-0242). Every one of
 * those is about a PERSON. None of them is about a PERMIT on a piece of PLANT,
 * the energy isolation that makes the plant safe to touch, whether that isolation
 * was ever PROVED at zero energy, and whether two live permits contradict each
 * other. `workStop` says so in its own copy: it "is not a permit".
 *
 * `workStop`'s screen prints the refusal this register removes, verbatim:
 * "Do not claim lockout, isolation or a physical control that this record cannot
 * verify." That sentence is correct, and it is also the gap: the workspace had no
 * record in which lockout and isolation *could* be verified.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. Word-boundary
 * searches of `app/` before this build returned ZERO files for `permit to work`,
 * `lockout`, `tagout`, `hot work`, `confined space`, `gas test`, `zero energy`,
 * `simultaneous operations` and `SIMOPS`, and ONE prose hit for `permit to work`
 * — the station-coverage help text naming a mechanical interlock as an example of
 * an unresolvable dependency. The single `lockout` hits are `workStop`'s
 * disclaimer and a vault passphrase aside. Wider absence **[UNVERIFIED]**.
 *
 * WHAT THE BENCHMARKED CATEGORY GETS RIGHT, AND WHERE IT STOPS. The electronic
 * permit-to-work category (Pro-Sapien, Intelex, EHS Insight, Enablon, Sphera,
 * Cority, PermitVision — vendor comparison pages fetched 2026-11-17; hands-on
 * parity UNVERIFIED) sets a bar this register must reach on five mechanics:
 *
 *   1. **A permit with a status, a validity and a lifecycle** — issued, live,
 *      suspended, closed — not a static record.
 *   2. **Energy isolation tied to the permit**, with lock/tag references, and
 *      LOTO-style group isolation.
 *   3. **Zero-energy verification** — the isolation is *proved* before work
 *      starts, by a named hand, at a named instant.
 *   4. **Hot work and confined-space controls** with atmospheric testing recorded
 *      against declared limits.
 *   5. **Simultaneous-operations conflict visibility** — PermitVision's headline
 *      claim is "simultaneous high-risk activities with real-time visibility and
 *      isolations"; Enablon markets "permit control" and "isolation verification".
 *
 * WHAT THIS REGISTER ADDS THAT THE CATEGORY DOES NOT PUT ON THE RECORD — and why
 * each one is the point rather than a feature:
 *
 *   - **A conflict is DERIVED from the record on every read, never stored, and
 *     never blocks the entry of a fact.** A vendor conflict check is a screen. A
 *     record that recomputes the conflict from the isolation and the permit's own
 *     window can still prove, six weeks later, that the line was lifted at 11:04
 *     while the hot-work permit ran to 17:00 — and it cannot be made to agree with
 *     itself by editing a status.
 *   - **Nothing is defaulted.** No default permit validity, no default O2 limit,
 *     no default gas-test freshness, no default verification window. Each is a
 *     human decision about this plant, this task and this crew, declared on the
 *     permit, or the permit is refused. A workspace default here would silently
 *     authorise work in an atmosphere nobody measured.
 *   - **The person doing the work cannot authorise it.** Separation of duties is
 *     a door refusal, not a policy line.
 *   - **Silence has no state that reads as safe.** An isolation that is applied
 *     and unverified is `live-unverified` — never `live`. A permit whose validity
 *     ran out with nobody closing it is `expired-open` — never `closed`. A gas
 *     test older than the permit's own freshness is `live-atmosphere-stale` —
 *     never "tested".
 *   - **A closure that leaves a line isolated is kept and printed**, not repaired.
 *     The dangerous direction of a permit-to-work failure is a plant left in a
 *     state nobody knows about, and deleting the evidence of it is the failure.
 *
 * THE THREE THINGS THAT MUST NEVER HAPPEN, PREVENTED BY CONSTRUCTION:
 *   - **No permit is ever inferred** from a shift, a station, an incident, a
 *     maintenance job or a stop-work hold. A permit is a dated human declaration.
 *   - **No person is scored.** The register counts permits, isolations, tests,
 *     lapsed minutes and conflicts. It never rates a permit holder, an issuer or
 *     a fire watch, and it prints no league table — the first thing a safety
 *     register that ranks people produces is a reason not to record the permit.
 *   - **No permit is declared "safe" by the software.** The strongest claim the
 *     register makes is that the record holds the acts the control requires, and
 *     it prints what it does not hold. It cannot inspect a plant, prove a lock is
 *     on a valve, or certify anything.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A permit is ISSUED by one line holder and
 * HELD by one person, and in a matrix those are routinely different hands: the
 * engineer who authorises the work may sit on the function line while the plant
 * the work is on is owned by another. The reader therefore:
 *   - resolves every active reporting line that holds the HOLDER today and prints
 *     them; it prints the issuing line separately, as the authorising hand;
 *   - addresses every rule ask to `matrixJointApex` over the lines holding the
 *     holder, and NEVER to the holder about their own protection, because the
 *     person inside the confined space is the one the control protects;
 *   - counts a person ONCE in every people figure, even where two permits and two
 *     lines touch them.
 */

export const PTW_ENGINE_VERSION = 'permit-to-work-2026.11-v1';
export const PTW_ADR = 'ADR-0246';
export const PTW_RULE_ID = 'RULE-PTW-01';
export const PTW_ROUTE = 'permit-to-work';
export const PTW_HREF = '#/permit-to-work';
export const PTW_CSV_SCOPE = 'permit-to-work-control';
export const PTW_MARKER_KIND = 'permit-to-work';
export const PTW_EVENT_PREFIX = 'permitToWork.';

export const PTW_EVENTS = Object.freeze({
  PERMIT_ISSUED: 'permitToWork.permit.issued',
  ISOLATION_APPLIED: 'permitToWork.isolation.applied',
  ISOLATION_VERIFIED: 'permitToWork.isolation.verified',
  ISOLATION_REMOVED: 'permitToWork.isolation.removed',
  ATMOSPHERE_RECORDED: 'permitToWork.atmosphere.recorded',
  HANDOVER_ACCEPTED: 'permitToWork.handover.accepted',
  PERMIT_SUSPENDED: 'permitToWork.permit.suspended',
  PERMIT_RESUMED: 'permitToWork.permit.resumed',
  PERMIT_CLOSED: 'permitToWork.permit.closed',
  CONVENTIONS_SET: 'permitToWork.conventions.set',
  SCANNED: 'permitToWork.scan',
});

export const PTW_RIGHTS = Object.freeze({
  READ: 'read-permit-to-work',
  ISSUE: 'issue-permit-to-work',
  ACT: 'act-permit-to-work',
});

export const PTW_SETTING_KEYS = Object.freeze({
  autoPropagate: 'ptwAutoPropagate',
  privacyFloor: 'ptwPrivacyFloor',
  horizonDays: 'ptwHorizonDays',
});

export const PTW_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
  horizonDays: { min: 1, max: 90 },
});

export const PTW_DEFAULTS = Object.freeze({
  privacyFloor: 3,
  horizonDays: 14,
});

export const PTW_LIMITS = Object.freeze({
  permits: 600,
  isolations: 3000,
  atmosphere: 3000,
  handovers: 1200,
  suspensions: 1200,
  closures: 600,
  markers: 400,
  /** A written reference shorter than this names nothing. */
  textMin: 24,
  textMax: 600,
  /** An area, a work reference, a point, an instrument: bounded, never free prose. */
  shortMin: 3,
  shortMax: 120,
  /** The written method statement / assessment a permit rests on. */
  basisMin: 12,
  idMax: 120,
  /** Permit validity, declared per permit in whole minutes: one shift at most. */
  validityMin: 15,
  validityMax: 1440,
  /** The declared window from applying an isolation to proving it at zero energy. */
  verifyWithinMin: 1,
  verifyWithinMax: 240,
  /** The declared gas-test freshness window, in whole minutes. */
  freshnessMin: 1,
  freshnessMax: 720,
  /** How far ahead a permit may be declared, and how far back it may be recorded. */
  backfillMaxDays: 30,
  /** Rule asking. */
  chaseDays: 1,
  rowsShown: 40,
  conflictsShown: 30,
});

/** Rank that may read the register. A holder may always read their own permit. */
export const PTW_READ_MIN_RANK = 1;
/**
 * Rank that may ISSUE a permit.
 *
 * RANK 2, DELIBERATELY, AND NOT RANK 1. The lone-working register opens its door
 * at rank 1 because the supervisor who can see the site is the one who owns the
 * welfare clock. A permit is a different instrument: it authorises a SECOND CREW
 * to work on live plant, and the hand that authorises it must sit above the hand
 * that holds it. Rank 2 is the lowest authoritative seat in this workspace's
 * ladder, and the separation-of-duties refusal below is what actually carries the
 * control — not the rank.
 */
export const PTW_ISSUE_MIN_RANK = 2;
/** Rank that may record isolations, tests, handovers, suspensions and closures. */
export const PTW_ACT_MIN_RANK = 1;

/**
 * WHAT KIND OF WORK THE PERMIT AUTHORISES. Closed, because the controls each kind
 * requires are different and an open text field cannot demand the right ones.
 * `atmosphere` marks the kinds that cannot go live without a declared test plan;
 * `ignition` marks the kinds that cannot go live without a named fire watch.
 */
export const PTW_WORK_KINDS = Object.freeze([
  Object.freeze({
    key: 'hot-work',
    label: 'Hot work',
    ignition: true,
    atmosphere: false,
    inherentlyEnergy: true,
    says: 'Welding, grinding, cutting or any work that can produce a spark, flame or surface above the ignition temperature of what is present. A named fire watch and an area clear of combustibles are part of the permit, not a good intention.',
  }),
  Object.freeze({
    key: 'cold-work',
    label: 'Cold work',
    ignition: false,
    atmosphere: false,
    inherentlyEnergy: true,
    says: 'Mechanical or electrical work that cannot itself ignite anything, on plant that has been isolated, drained and proved.',
  }),
  Object.freeze({
    key: 'confined-space-entry',
    label: 'Confined-space entry',
    ignition: false,
    atmosphere: true,
    inherentlyEnergy: true,
    says: 'Entry into a space not designed for continuous occupancy, where the atmosphere can change while a person is inside. Test limits and freshness are declared on the permit; nothing here defaults to a safe number.',
  }),
  Object.freeze({
    key: 'electrical-isolation',
    label: 'Electrical isolation work',
    ignition: false,
    atmosphere: false,
    inherentlyEnergy: true,
    says: 'Work on or near electrical equipment that requires a proved isolation. The permit is not the isolation, and an applied lock is not a proved zero-energy state.',
  }),
  Object.freeze({
    key: 'line-breaking',
    label: 'Process line breaking',
    ignition: false,
    atmosphere: false,
    inherentlyEnergy: true,
    says: 'Opening a line that has carried a hazardous fluid. Draining, venting, purging and a proved isolation precede the break, and a live hot-work permit in the same area is a conflict the register computes rather than hopes about.',
  }),
  Object.freeze({
    key: 'excavation',
    label: 'Excavation',
    ignition: false,
    atmosphere: false,
    inherentlyEnergy: true,
    says: 'Breaking ground. Buried services are the isolation problem in this kind, and the register records only what a human declared about them.',
  }),
  Object.freeze({
    key: 'work-at-height',
    label: 'Work at height',
    ignition: false,
    atmosphere: false,
    inherentlyEnergy: false,
    says: 'Work from which a fall can injure. The register records the permit and its validity; it does not inspect an anchor point.',
  }),
  Object.freeze({
    key: 'general',
    label: 'General maintenance',
    ignition: false,
    atmosphere: false,
    inherentlyEnergy: false,
    says: 'Routine maintenance in an area with no declared atmosphere or ignition hazard. The lightest permit this register issues, and still a dated human authorisation with a validity and a closure.',
  }),
]);
export const PTW_WORK_KIND_KEYS = Object.freeze(PTW_WORK_KINDS.map((row) => row.key));
export const PTW_WORK_KIND_BY_KEY = Object.freeze(Object.fromEntries(PTW_WORK_KINDS.map((row) => [row.key, row])));

/** How the work is being permitted. A closed list: "somehow" is not an authority. */
export const PTW_AUTHORITY_KINDS = Object.freeze([
  Object.freeze({ key: 'single', label: 'Single permit', says: 'One permit, one holder, one issuing hand.' }),
  Object.freeze({ key: 'group', label: 'Group isolation permit', says: 'One isolation isolating several crews; each crew is named on the permit and each holder signs for it. Withdrawing the isolation while any crew is still on the job is the failure this register computes.' }),
  Object.freeze({ key: 'contractor', label: 'Contractor permit', says: 'The work is done by a named external crew. The register records the internal issuing hand and the written basis; it does not verify a contractor’s own competence scheme.' }),
]);

/**
 * WHAT THE ISOLATION ISOLATES. Closed, because the verification a human has to
 * perform differs by energy kind: an electrical lock is proved by a test for dead
 * at the point of work; a mechanical or gravity isolation is proved by a
 * physical restraint check; a process isolation is proved by a zero-pressure
 * reading and a drain confirmation. The register never substitutes one proof for
 * another and never claims a proof it was not given.
 */
export const PTW_ENERGY_KINDS = Object.freeze([
  Object.freeze({ key: 'electrical', label: 'Electrical', says: 'Proved dead at the point of work, not merely locked off upstream.' }),
  Object.freeze({ key: 'mechanical', label: 'Mechanical / rotating', says: 'Proved by physical restraint and a zero-motion check.' }),
  Object.freeze({ key: 'process-fluid', label: 'Process fluid / pressure', says: 'Proved by a zero-pressure reading on the isolated side, with the drain or vent recorded.' }),
  Object.freeze({ key: 'pneumatic-hydraulic', label: 'Pneumatic / hydraulic', says: 'Proved by a zero-pressure reading after the stored energy is bled.' }),
  Object.freeze({ key: 'thermal', label: 'Thermal', says: 'Proved by a temperature reading at the point of work after the declared cooling period.' }),
  Object.freeze({ key: 'gravity-stored', label: 'Gravity / stored energy', says: 'Proved by a physical restraint the verifier states they checked, and never by a lock alone.' }),
  Object.freeze({ key: 'chemical', label: 'Chemical / asphyxiant', says: 'Proved by a line drain or purge with the confirmation recorded, not by a closed valve.' }),
]);
export const PTW_ENERGY_KIND_KEYS = Object.freeze(PTW_ENERGY_KINDS.map((row) => row.key));
export const PTW_ENERGY_KIND_BY_KEY = Object.freeze(Object.fromEntries(PTW_ENERGY_KINDS.map((row) => [row.key, row])));

/**
 * The atmospheric tests a confined space or a hot-work permit can declare. Each
 * carries PROFESSIONAL BOUNDS on the declared limit itself: a permit that declares
 * an oxygen limit of five per cent has not declared a control, it has declared a
 * waiver, and the door refuses it. The limits below are the bounds *within which a
 * human declaration is legible*; they are not defaults, and no permit is ever
 * created with a limit the issuer did not type.
 */
export const PTW_ATMOSPHERE_TESTS = Object.freeze([
  Object.freeze({
    key: 'oxygen',
    label: 'Oxygen (%vol)',
    unit: '%vol',
    limitDirection: 'between',
    limitMin: 15,
    limitMax: 23.5,
    readingMin: 0,
    readingMax: 30,
    says: 'Both a deficiency and an enrichment are hazards; the permit must declare the band it will work inside.',
  }),
  Object.freeze({
    key: 'lel',
    label: 'Flammable gas (%LEL)',
    unit: '%LEL',
    limitDirection: 'at-most',
    limitMin: 0,
    limitMax: 25,
    readingMin: 0,
    readingMax: 100,
    says: 'The limit is the highest reading the issuer will allow at the moment of entry. The register compares the reading to it exactly.',
  }),
  Object.freeze({
    key: 'h2s',
    label: 'Hydrogen sulphide (ppm)',
    unit: 'ppm',
    limitDirection: 'at-most',
    limitMin: 0,
    limitMax: 20,
    readingMin: 0,
    readingMax: 500,
    says: 'A lifeless reading is not the same as an unmeasured one: a test the permit did not declare is not a test that passed.',
  }),
  Object.freeze({
    key: 'co',
    label: 'Carbon monoxide (ppm)',
    unit: 'ppm',
    limitDirection: 'at-most',
    limitMin: 0,
    limitMax: 100,
    readingMin: 0,
    readingMax: 2000,
    says: 'Compared exactly against the permit’s own declared limit.',
  }),
]);
export const PTW_ATMOSPHERE_TEST_KEYS = Object.freeze(PTW_ATMOSPHERE_TESTS.map((row) => row.key));
export const PTW_ATMOSPHERE_TEST_BY_KEY = Object.freeze(Object.fromEntries(PTW_ATMOSPHERE_TESTS.map((row) => [row.key, row])));

/**
 * HOW AN ISOLATION ENDED. A withdrawal is an ACT with a hand and an instant, and
 * the register keeps it even when it was withdrawn far too early, because the
 * withdrawal is what makes the conflict provable.
 */
export const PTW_ISOLATION_STATES = Object.freeze([
  Object.freeze({
    key: 'applied-unverified',
    label: 'Applied, not proved',
    tone: 'bad',
    says: 'A lock or tag is recorded and nobody has proved the plant is at zero energy at the point of work. An applied isolation is not a safe plant, and this register will not call it one.',
  }),
  Object.freeze({
    key: 'verified',
    label: 'Applied and proved',
    tone: 'good',
    says: 'A named hand recorded the proof at a named instant. The register holds the claim, not the plant.',
  }),
  Object.freeze({
    key: 'verified-overdue',
    label: 'Applied, proof overdue',
    tone: 'bad',
    says: 'The permit’s own declared verification window passed with no proof on the record. The window was a human decision about this task; missing it is a printed fact.',
  }),
  Object.freeze({
    key: 'removed',
    label: 'Removed and confirmed',
    tone: 'neutral',
    says: 'The isolation was physically restored and a named hand confirmed it. If this happened while another live permit depended on it, the register prints that conflict rather than hiding the withdrawal.',
  }),
  Object.freeze({
    key: 'removed-unconfirmed',
    label: 'Removed, never confirmed',
    tone: 'warn',
    says: 'A removal is recorded with no confirmation by a named hand. The register cannot say whether the energy is back or the line is still dead.',
  }),
]);
export const PTW_ISOLATION_STATE_KEYS = Object.freeze(PTW_ISOLATION_STATES.map((row) => row.key));
export const PTW_ISOLATION_STATE_BY_KEY = Object.freeze(Object.fromEntries(PTW_ISOLATION_STATES.map((row) => [row.key, row])));

/**
 * THE NINE PERMIT STATES. Each is a DIFFERENT FACT and the register's whole value
 * is that it never folds one into another. `flags` carries every condition that
 * fired, so a state never hides a second problem behind the first.
 */
export const PTW_STATES = Object.freeze([
  Object.freeze({
    key: 'live',
    label: 'Live',
    tone: 'good',
    says: 'Inside its declared validity, with every required isolation proved, the atmosphere inside the permit’s own declared limits and fresh, and no suspension open. The lightest thing this register says and it still says only that the record holds the acts.',
  }),
  Object.freeze({
    key: 'live-unverified',
    label: 'Live, isolation unproved',
    tone: 'bad',
    says: 'The permit is inside its validity and work may be under way, but at least one recorded isolation has no proof of zero energy. This is the state in which people are injured by plant they believe is dead.',
  }),
  Object.freeze({
    key: 'live-atmosphere',
    label: 'Live, atmosphere outside limits',
    tone: 'bad',
    says: 'The permit is inside its validity but the latest recorded test does not satisfy the permit’s own declared limit, or the permit declares a test it has never recorded. Either way the atmosphere is not proved.',
  }),
  Object.freeze({
    key: 'live-atmosphere-stale',
    label: 'Live, atmosphere test stale',
    tone: 'warn',
    says: 'A test exists and it is older than the freshness window the permit itself declared. A reading from before the last shift change is not a reading of the air in the space now.',
  }),
  Object.freeze({
    key: 'suspended',
    label: 'Suspended',
    tone: 'warn',
    says: 'Work is stopped by a recorded suspension and has not been resumed. The isolation is retained, and no state here asserts that it was.',
  }),
  Object.freeze({
    key: 'not-yet-valid',
    label: 'Not yet valid',
    tone: 'neutral',
    says: 'Declared for a later validity window. Nobody may work under it yet, and the register refuses to read a future permit as authorisation.',
  }),
  Object.freeze({
    key: 'expired-open',
    label: 'Expired, never closed',
    tone: 'bad',
    says: 'The declared validity ended and nobody recorded a closure. The plant and the crew are in a state no named hand has declared, which is precisely the failure a permit system exists to prevent.',
  }),
  Object.freeze({
    key: 'closed-complete',
    label: 'Closed, isolations restored',
    tone: 'good',
    says: 'Closed out with an outcome, and every isolation on the permit was removed with a confirmation. The register holds the closure, not the walk-round.',
  }),
  Object.freeze({
    key: 'closed-isolation-owed',
    label: 'Closed, isolation not restored',
    tone: 'bad',
    says: 'Closed out while at least one isolation was never removed and confirmed. The plant may be isolated with nobody aware of it; the closure is kept and printed rather than repaired, because erasing it would erase the only record of the plant’s state.',
  }),
]);
export const PTW_STATE_KEYS = Object.freeze(PTW_STATES.map((row) => row.key));
export const PTW_STATE_BY_KEY = Object.freeze(Object.fromEntries(PTW_STATES.map((row) => [row.key, row])));
export const PTW_OPEN_STATE_KEYS = Object.freeze(PTW_STATE_KEYS.filter((key) => !key.startsWith('closed-')));

/**
 * THE SIMULTANEOUS-OPERATIONS CONFLICTS. Derived on every read from the permits,
 * the isolations and the atmosphere tests. NONE of them is stored, so none of them
 * can be edited away, and each carries its own exact arithmetic.
 *
 * The register never refuses to record a fact that creates a conflict. It refuses
 * to CREATE one at the door where it can, and it prints every conflict the record
 * carries — including one created by an imported file, because the six weeks after
 * the lift is exactly when the record is read.
 */
export const PTW_CONFLICT_KINDS = Object.freeze([
  Object.freeze({
    key: 'isolation-released-under-live-permit',
    label: 'Isolation released under a live permit',
    severity: 5,
    says: 'An isolation was removed while a second permit that depends on the same plant remained live. This is the classic fatal defect of permit systems: one crew finishes, restores the energy, and another crew is still inside.',
  }),
  Object.freeze({
    key: 'hot-work-over-isolation-release',
    label: 'Hot work live over an isolation release',
    severity: 5,
    says: 'A hot-work permit is live in the same area in which an isolation is being removed or was removed inside the permit’s own window. Ignition source and returning energy in one place.',
  }),
  Object.freeze({
    key: 'two-hot-work-same-area',
    label: 'Two hot-work permits in one area',
    severity: 4,
    says: 'Two live hot-work permits overlap in the same area. One fire watch cannot cover two ignition sources, and the permit that named a fire watch did not name that.',
  }),
  Object.freeze({
    key: 'entry-during-hot-work',
    label: 'Confined-space entry during hot work',
    severity: 5,
    says: 'A confined-space entry is live in an area with a live hot-work permit. A person inside a space has one exit and cannot see the ignition source.',
  }),
  Object.freeze({
    key: 'isolation-double-claimed',
    label: 'One isolation claimed by two live permits',
    severity: 4,
    says: 'Two live permits both depend on the same isolation point. Withdrawing it to finish one job silently unprotects the other, so the dependency itself has to be visible.',
  }),
  Object.freeze({
    key: 'holder-double-booked',
    label: 'One holder on two live permits',
    severity: 3,
    says: 'The same person holds two live permits whose validity windows overlap. Nobody can personally hold two sets of isolations at once, whatever the paperwork says.',
  }),
  Object.freeze({
    key: 'permit-lapsed-open',
    label: 'Permit lapsed and never closed',
    severity: 4,
    says: 'The validity ran out and no closure was recorded. Nobody has declared what state the plant and the crew are in.',
  }),
  Object.freeze({
    key: 'isolation-verification-overdue',
    label: 'Isolation proof overdue',
    severity: 4,
    says: 'The permit’s own declared verification window passed with no proof of zero energy on the record.',
  }),
  Object.freeze({
    key: 'atmosphere-out-of-limit',
    label: 'Atmosphere outside the permit’s limits',
    severity: 5,
    says: 'The latest recorded test does not satisfy the limit the permit’s issuer declared, or a declared test has never been recorded.',
  }),
  Object.freeze({
    key: 'atmosphere-stale',
    label: 'Atmosphere test older than declared',
    severity: 3,
    says: 'The latest test is older than the freshness window the permit declared. The air in the space has not been measured inside the window the permit itself set.',
  }),
  Object.freeze({
    key: 'hot-work-without-fire-watch',
    label: 'Hot work with no fire watch',
    severity: 5,
    says: 'A hot-work permit has no named fire watch on the record. The door refuses to issue one; an imported permit is kept and printed with this conflict, because hiding it would hide a permit nobody is watching.',
  }),
  Object.freeze({
    key: 'closure-isolation-owed',
    label: 'Closed with an isolation outstanding',
    severity: 5,
    says: 'The permit was closed out while an isolation it applied was never removed and confirmed. The plant may be isolated with nobody aware of it.',
  }),
  Object.freeze({
    key: 'orphan-holder',
    label: 'Holder not on the reporting graph',
    severity: 2,
    says: 'The permit names a holder who holds no active line, so no authorising hand above them can be resolved. The permit is counted, printed and never re-pointed at somebody else.',
  }),
]);
export const PTW_CONFLICT_KIND_KEYS = Object.freeze(PTW_CONFLICT_KINDS.map((row) => row.key));
export const PTW_CONFLICT_KIND_BY_KEY = Object.freeze(Object.fromEntries(PTW_CONFLICT_KINDS.map((row) => [row.key, row])));

/**
 * HOW A PERMIT ENDED. Closing out is an act and it names what happened, because
 * "closed" on its own is the word that hides whether the crew left, whether the
 * plant was handed back, and whether every isolation was actually restored. The
 * register derives the isolation question from the isolation ledger and keeps the
 * OUTCOME as a separate declared fact — two claims, never one word.
 */
export const PTW_CLOSURE_OUTCOMES = Object.freeze([
  Object.freeze({ key: 'work-completed', label: 'Work completed', says: 'The declared task was finished and the crew left the plant.' }),
  Object.freeze({ key: 'work-abandoned', label: 'Work abandoned', says: 'The task was stopped unfinished. The plant’s state is exactly what the isolation ledger shows.' }),
  Object.freeze({ key: 'deferred', label: 'Deferred to a new permit', says: 'The work will continue under a separately issued permit. Closing this one does not authorise the next.' }),
  Object.freeze({ key: 'handed-to-production', label: 'Handed back to production', says: 'The plant was returned to the operating team, who accepted it. The register records that the hand-back was declared, not that production accepted it.' }),
]);
export const PTW_CLOSURE_OUTCOME_KEYS = Object.freeze(PTW_CLOSURE_OUTCOMES.map((row) => row.key));
export const PTW_CLOSURE_OUTCOME_BY_KEY = Object.freeze(Object.fromEntries(PTW_CLOSURE_OUTCOMES.map((row) => [row.key, row])));

/** Refusals printed at the door. Each one is a control, not a message. */
export const PTW_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  noReach: 'That person is not on a line this seat holds. One line does not permit another line’s people.',
});

export const PTW_SECTION_TITLES = Object.freeze({
  permits: 'Permits',
  isolations: 'Isolations',
  conflicts: 'Simultaneous operations',
  method: 'Method',
});

/**
 * CSV #187 (ADR-0246, Schema v200). IDENTITY-FREE BY CONSTRUCTION. One summary
 * row, one row per printed permit state and one row per printed conflict kind. No
 * person, no area, no work reference, no isolation point, no lock reference, no
 * instrument, no reading and no instant crosses this boundary. A figure the reader
 * cannot compute exports BLANK with its reason, never a zero.
 */
export const PTW_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'permits_n', 'open_n', 'closed_n', 'people_n',
  'work_kinds_n', 'isolations_n', 'isolations_unverified_n', 'isolations_overdue_n',
  'isolations_unconfirmed_removal_n', 'atmosphere_tests_n', 'live_n', 'live_unverified_n',
  'live_atmosphere_n', 'live_atmosphere_stale_n', 'suspended_n', 'not_yet_valid_n',
  'expired_open_n', 'expired_minutes_total', 'closed_complete_n', 'closed_isolation_owed_n',
  'conflicts_n', 'conflicts_live_n', 'conflict_kinds_n', 'handovers_n', 'entries_n',
  'privacy_floor', 'complete', 'blank_reason',
]);

/**
 * CSV #187 (ADR-0246, Schema v200). One summary row, one row per printed permit
 * state and one row per printed simultaneous-operations CONFLICT KIND. The conflict
 * kinds are named rather than smoothed over — a safety export that hid them would be
 * the one thing this category must never do — while the permits, areas, locks,
 * instruments and readings that prove them never cross this boundary.
 */
export const PTW_CSV_DESCRIPTOR = Object.freeze({
  key: PTW_CSV_SCOPE,
  label: 'Permit to work, isolations & simultaneous operations (aggregate)',
  group: 'operations',
  sensitive: true,
  filenameSlug: 'permit-to-work-control',
  description: 'One summary row, one row per printed permit state and one row per printed conflict kind. Counts of permits, open and closed, holders, work kinds, isolations with the unproved, overdue-past-the-window and unconfirmed-removal counts, gas tests, every permit state including live-without-proof, live-atmosphere-failing, suspended, lapsed-open with the exact minutes past the declared ends, closed-complete and closed-isolation-owed, plus the conflict totals, the conflict kinds and the live entries. No person, area, work reference, isolation point, lock, instrument, reading or instant is exported. A per-state or per-conflict count below the declared floor exports blank with its reason, never as a number.',
});

/** The published framework basis, printed on the method tab. Never a claim of parity. */
export const PTW_METHOD = Object.freeze({
  engine: PTW_ENGINE_VERSION,
  adr: PTW_ADR,
  frameworks: Object.freeze([
    'UK HSE HSG250 / permit-to-work guidance: a permit is a formal written system of work, issued by an authorised person, for a defined task and a defined validity, and it does not by itself make a plant safe.',
    'OSHA 29 CFR 1910.147 (the Control of Hazardous Energy — lockout/tagout) and 1910.146 (permit-required confined spaces): the isolation must be applied, and the zero-energy state must be VERIFIED at the point of work before work starts.',
    'NFPA 51B and the hot-work permit: a named fire watch, an area cleared of combustibles, and a defined fire-watch period after the work stops.',
    'Simultaneous-operations (SIMOPS) management: two authorised activities that are safe alone can be unsafe together, so the dependency between them has to be computed from the record rather than assumed from the paperwork.',
    'Separation of duties: the hand that authorises work is not the hand that performs it, and the hand that verifies an isolation is not the hand that applied it where a second verifier is available.',
    'Matrix addressing (ADR-0140/0141): the authorising line and the line owning the plant are routinely different hands, so the duty is addressed to the joint seat above the holder’s lines and never to the holder about their own protection.',
  ]),
  printed: Object.freeze([
    'The permit’s declared validity, the exact whole minutes to its end and, once lapsed, the exact whole minutes it has been open.',
    'Every isolation with its energy kind, lock reference, applied instant, proof instant (or the verification window it has missed) and removal confirmation.',
    'The latest atmosphere reading per declared test, compared exactly against the permit’s own limit, with the exact minutes since the reading.',
    'Every simultaneous-operations conflict, with the exact overlap in whole minutes and the two permits it joins.',
    'Which reporting lines hold the holder today, and the joint seat above them.',
    'Two separate claims: that the printed state counts re-add to the permits, and that the printed figures are the computed figures.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No default validity, no default oxygen limit, no default gas-test freshness and no default verification window. Every one is a declared decision on the permit or the permit is refused.',
    'No “safe” verdict. The register reports the acts the control requires and what it does not hold; it cannot inspect a plant or certify anything.',
    'No per-person score, rate or league table — not for the holder, not for the issuer, not for the fire watch.',
    'No inference of a permit from a shift, a station roster, an incident, a maintenance job or a stop-work hold.',
    'No repair of an imported breach. A closure that left a line isolated stays on the record and is printed.',
  ]),
});
