/**
 * app/core/domain/incidentCommandRegistry.js — closed vocabulary for the
 * Major-Incident Command & Notification-Clock Register (ADR-0240, Schema v194,
 * `#/incidents`, CSV scope #181, `RULE-MIC-01`).
 *
 * THE DUTY, IN AN OPERATING LEADER'S WORDS. *"At 02:40 the payment rail went
 * down. Somebody said 'this is a P1' in a chat channel. By 03:15 four people
 * were debugging and nobody was commanding. The regulator's clock started at
 * 02:40 whether or not we had decided it had. At 09:00 we could not say who
 * declared it, who took command, when the first customer update went out, or
 * whether the clock that matters had already run out — and the postmortem
 * was written from memory, by the person whose change caused it."*
 *
 * This workspace holds a great deal about what happened AFTER an incident: an
 * operational case with FMEA, PERT exposure and a blameless review
 * (`cases.js`, `learning.js`, `aarCorroboration.js`), a stop-work ledger, a
 * continuity drill record, and a resilience terminal that computes recovery
 * time against survival time. It held NOTHING about the incident as a COMMAND
 * problem while it was running — and that is the interval in which every
 * externally-visible consequence is actually created.
 *
 * THE FIVE THINGS NO OTHER MODULE IN THIS WORKSPACE CAN SAY
 * ---------------------------------------------------------
 *   1. WHO DECLARED IT, ON WHAT CRITERIA, AND WHEN. Declaration time is not
 *      detection time, and the gap between them is the first number a review
 *      asks for. Neither instant is inferable from anything else on the record.
 *   2. WHO WAS IN COMMAND, AND WHEN — including the handover. "The commander
 *      went off shift at 06:00 and nobody noticed" is a real failure with a
 *      real audit shape (ICS / NIMS transfer-of-command; PagerDuty's explicit
 *      rule that the commander is not a resolver). A commander change is a
 *      dated ACT with two named seats, never a field somebody overwrites.
 *   3. WHETHER THE EXTERNAL CLOCK THAT STARTED IS ALREADY RUNNING OUT.
 *      Regulatory notification clocks do not begin at the end of the incident;
 *      they begin at awareness. GDPR Art. 33 gives 72 hours to notify a
 *      supervisory authority of a notifiable personal-data breach; NIS2 Art. 23
 *      gives a 24-hour early warning. The register does not know any of those
 *      numbers as law — it stores the clock the DECLARING SEAT wrote down, with
 *      the instrument they read it off, and computes the deadline in exact
 *      milliseconds from the awareness instant. A clock nobody declared is a
 *      printed gap, never an assumed 72.
 *   4. WHETHER THE PEOPLE WHO HAD TO BE TOLD WERE TOLD, EACH ON THEIR OWN
 *      CLOCK. A regulator, the board, an affected customer and an internal
 *      escalation path are four different obligations with four different
 *      deadlines and four different owners. Recorded as separate notification
 *      obligations on separate lines, never collapsed into one "comms done".
 *   5. WHETHER COMMAND WAS EVER FORMALLY RELEASED. An incident that is resolved
 *      but never stood down is still holding a commander and a bridge open, and
 *      nothing on the record says otherwise. Stand-down is an act with a
 *      named hand, or it prints `command-standing`.
 *
 * THE MATRIX IS THE POINT, AGAIN. An incident is the one event in an
 * organisation that is *inherently* cross-line: the operating impact lands on
 * one line, the technical remediation on another, the legal/regulatory clock on
 * a third, and customer communication on a fourth. So the register holds ONE TO
 * SIX RESPONSE LINES per incident, each with its own named lead, its own duty
 * and its own evidence — and the seat accountable for the whole incident is the
 * JOINT APEX above every response line, COMPUTED from the reporting graph and
 * never chosen by the declaring actor. Where the graph has no such seat, the
 * register prints `no-authority` and asks nobody rather than promoting an
 * unrelated manager into a commander role. A person holding two lines is ONE
 * person and is counted once.
 *
 * THE THREE DOCTRINES CARRIED FROM THE HOUSE RULES
 * ------------------------------------------------
 *   NO SCORE ON A PERSON. The register counts incidents, lines, acts, clocks
 *   and minutes. It never computes a response score, a severity-adjusted
 *   rating, a league table, or "time-to-declare" averaged over people. Two
 *   facts are printed and neither is a verdict on anybody: the interval from
 *   detection to declaration (a fact about the response), and whether each
 *   governing clock had run out when the act was recorded (a fact about time).
 *
 *   THE CLOCK NEVER DECIDES AND THE DAY NEVER CLOSES. A passed notification
 *   deadline reads `lapsed` with the elapsed duration printed to the minute. It
 *   is never converted to notified, never rounded down to "within tolerance",
 *   and no act of the passage of time closes an incident, releases a commander
 *   or discharges a notification.
 *
 *   NO NUMBER IS INVENTED. A declared clock must carry a positive whole number
 *   of minutes and a written source; a notification obligation must name who
 *   had to be told and on which of the declared clocks. A clock with no source
 *   is refused at the door. A stored row that cannot be read exactly is DROPPED
 *   and counted, never repaired — because a notification deadline the register
 *   guessed is worse than one it refuses to print.
 *
 * WHAT IT DELIBERATELY DOES NOT DO (named so no reader assumes it)
 * ----------------------------------------------------------------
 *   - It does not page anybody, notify anybody, or send anything. It records
 *     that a human says they did, with a reference, and prints what is owed.
 *   - It holds no legal clock library. GDPR Art. 33's 72 hours and NIS2 Art.
 *     23's 24 hours are the DUTY this register exists to make recordable; they
 *     are NOT baked in as defaults, because the jurisdiction, the instrument
 *     and the applicability test are the entity's own declaration. A missing
 *     clock is printed as missing.
 *   - It does not decide severity. The declaring seat declares it against a
 *     written criterion, and the register prints the criterion beside it.
 *   - It is not incident analytics: no MTTR, no MTTA, no SLO, no burn rate. The
 *     workspace's own survival, tempo and reliability modules own those
 *     questions over the whole record; this register owns the command record of
 *     one incident.
 *   - It never rates, ranks or shames a responder. Blamelessness is enforced by
 *     construction: there is no field on a line that names a person as a cause.
 */

export const MIC_ENGINE_VERSION = 'incident-command-2026.11-v1';
export const MIC_ADR = 'ADR-0240';
export const MIC_RULE_ID = 'RULE-MIC-01';
export const MIC_ROUTE = 'incidents';
export const MIC_HREF = '#/incidents';
export const MIC_CSV_SCOPE = 'incidents';
export const MIC_MARKER_KIND = 'incident-command';
export const MIC_ENGINE = 'incidentCommand';

export const MIC_EVENTS = Object.freeze({
  DECLARED: 'incident.declared',
  LINE_ASSIGNED: 'incident.line.assigned',
  LINE_LEAD_ACCEPTED: 'incident.line.accepted',
  COMMAND_ASSUMED: 'incident.command.assumed',
  COMMAND_TRANSFERRED: 'incident.command.transferred',
  NOTIFICATION_DUE: 'incident.notification.due',
  NOTIFICATION_RECORDED: 'incident.notification.recorded',
  SEVERITY_CHANGED: 'incident.severity.changed',
  RESOLVED: 'incident.resolved',
  STOOD_DOWN: 'incident.command.stooddown',
  CONVENTIONS_SET: 'incident.conventions.set',
  SCANNED: 'incident.scan',
});
export const MIC_EVENT_PREFIX = 'incident.';

/**
 * Two rights, and the split is deliberate.
 *   READ    — open at every rank: a responder must be able to see the incident
 *             they are on. The READER narrows what a seat may see of OTHER
 *             people's detail, exactly as the distributed-work register does.
 *   COMMAND — declare, assign lines, take and hand over command, record
 *             notifications, change severity, stand down, and set the
 *             conventions. Rank 2+ (a line manager can declare an incident in
 *             their own span); the COMMANDER and the joint-apex rules are
 *             re-proved inside each action against the reporting graph.
 */
export const MIC_RIGHTS = Object.freeze({
  READ: 'read-incidents',
  COMMAND: 'command-incidents',
});

export const MIC_LIMITS = Object.freeze({
  incidents: 400,
  acts: 8000,
  markers: 600,
  /** Response lines one incident may carry. Past six it is a programme. */
  linesMin: 1,
  linesMax: 6,
  /** Notification obligations one incident may carry. */
  notifMin: 0,
  notifMax: 24,
  titleMin: 8,
  titleMax: 160,
  textMin: 24,
  textMax: 600,
  refMin: 3,
  refMax: 120,
  idMax: 120,
  /** A declared notification clock: 1 minute to 365 days, in whole minutes. */
  clockMinMinutes: 1,
  clockMaxMinutes: 525_600,
  /** How far ahead a declared incident may start, in whole days. */
  horizonMaxDays: 30,
  /** How far back a declared incident may be recorded and still be corrected. */
  backfillMaxDays: 3650,
  /** Rank that may declare an incident against a written criterion. */
  declareMinRank: 2,
  /** Rank whose seat may close the whole incident (stand-down of the register record). */
  closeMinRank: 3,
  privacyFloor: 3,
  /** A closing-window flag fires this many minutes before a deadline. */
  closingWindowMinutes: 120,
  /** How long an overdue notification is chased before the ask is refreshed. */
  chaseDays: 1,
  askDueDays: 1,
  rowsShown: 40,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
});

/* ------------------------------------------------------------- severities */

/**
 * SEVERITY, DECLARED AGAINST A WRITTEN CRITERION. The list is closed so the
 * register can print the difference rather than average it, and `rank` is used
 * for exactly one thing: the rule that a severity may be RAISED by anyone
 * holding a line and LOWERED only by the commanding seat. It is never used to
 * compute a score.
 *
 * The four levels follow the shape the major-incident-management literature
 * converges on (PagerDuty's public response documentation uses numbered SEV
 * levels and treats anything above SEV-3 as a major incident; the practitioner
 * rule of thumb is "when unsure between two levels, take the higher one"). The
 * register encodes that as a WRITTEN CRITERION the declaring seat must choose
 * from — not as a default.
 */
export const MIC_SEVERITIES = Object.freeze([
  Object.freeze({
    key: 'sev1', label: 'SEV-1 — Critical', rank: 1, major: true,
    criterion: 'A total loss of a customer-facing service, safety impact, or a notifiable event with a running external clock.',
    note: 'The commander owns the bridge, the external clocks and every stakeholder obligation at once.',
  }),
  Object.freeze({
    key: 'sev2', label: 'SEV-2 — Major', rank: 2, major: true,
    criterion: 'A material degradation of a customer-facing service, or a significant internal service loss affecting more than one line.',
    note: 'Cross-line coordination is required; one line cannot resolve it alone.',
  }),
  Object.freeze({
    key: 'sev3', label: 'SEV-3 — Minor', rank: 3, major: false,
    criterion: 'A contained degradation with a known workaround, affecting one line and no external obligation.',
    note: 'Tracked on the incident record; may be raised to a major incident if the blast radius widens.',
  }),
  Object.freeze({
    key: 'sev4', label: 'SEV-4 — Low', rank: 4, major: false,
    criterion: 'An internal nuisance or a near-miss with no customer impact and no running clock.',
    note: 'Recorded so the pattern is visible; not commanded.',
  }),
]);
export const MIC_SEVERITY_KEYS = Object.freeze(MIC_SEVERITIES.map((row) => row.key));
const SEVERITY_BY_KEY = new Map(MIC_SEVERITIES.map((row) => [row.key, row]));
export const severityRow = (key) => SEVERITY_BY_KEY.get(key) || null;
export const severityRank = (key) => SEVERITY_BY_KEY.get(key)?.rank ?? null;
export const isMajorSeverity = (key) => SEVERITY_BY_KEY.get(key)?.major === true;

/* -------------------------------------------------------------- the clocks */

/**
 * THE CLOCK SOURCE. A notification clock is only ever as good as the thing it
 * was read off, so the register makes the source a required, closed-list fact.
 * The list is the set of instruments a leader actually holds a clock under; it
 * is NOT a legal library and naming one here asserts nothing about whether it
 * applies. That is the declaring seat's declaration, and the register prints it
 * as declared, never as verified.
 */
export const MIC_CLOCK_SOURCES = Object.freeze([
  Object.freeze({ key: 'statute', label: 'Statute or regulation', note: 'A duty written in law — for example a personal-data-breach notification period. The register records the period you read; it does not interpret the law.' }),
  Object.freeze({ key: 'contract', label: 'Contract or service level', note: 'A period owed under an agreement with a customer, supplier or partner.' }),
  Object.freeze({ key: 'regulator-direction', label: 'Regulator direction', note: 'A period set by a supervisor in an order, undertaking or licence condition.' }),
  Object.freeze({ key: 'policy', label: 'Internal policy or standard', note: 'A period the entity set itself in a policy or a standard it holds itself to.' }),
  Object.freeze({ key: 'board-direction', label: 'Board direction', note: 'A period the governing body required be met.' }),
]);
export const MIC_CLOCK_SOURCE_KEYS = Object.freeze(MIC_CLOCK_SOURCES.map((row) => row.key));
const CLOCK_SOURCE_BY_KEY = new Map(MIC_CLOCK_SOURCES.map((row) => [row.key, row]));
export const clockSourceRow = (key) => CLOCK_SOURCE_BY_KEY.get(key) || null;

/**
 * WHAT THE CLOCK IS MEASURED FROM — the only two honest answers.
 *   `awareness`      from the instant the entity knew (or must be taken to have
 *                    known). This is what the statutes that carry a clock use,
 *                    and it is usually EARLIER than the declaration, which is
 *                    exactly why the register stores it separately.
 *   `declaration`    from the instant the incident was declared. Some internal
 *                    policies run from declaration, and the register records
 *                    which one was meant instead of assuming.
 */
export const MIC_CLOCK_ORIGINS = Object.freeze([
  Object.freeze({ key: 'awareness', label: 'From awareness', note: 'Runs from the instant the entity knew, which is usually before the incident was declared. This is the one a supervisor will hold you to.' }),
  Object.freeze({ key: 'declaration', label: 'From declaration', note: 'Runs from the instant the incident was declared. Correct only where the instrument itself says so.' }),
]);
export const MIC_CLOCK_ORIGIN_KEYS = Object.freeze(MIC_CLOCK_ORIGINS.map((row) => row.key));

/* ----------------------------------------------------------- response duties */

/**
 * THE DUTY A RESPONSE LINE CARRIES. Closed, because an incident's lines are not
 * interchangeable: the hand that fixes the service is not the hand that holds
 * the regulator's clock, and the register must be able to print which duty is
 * unled rather than "a line is open".
 *
 * These six are the recurring seats of every real incident bridge. `people
 * welfare` and `recovery verification` are the two that get dropped first in
 * practice and are therefore first-class here: the humans on the bridge need a
 * named hand, and the proof that the consequence stopped must not be the word of
 * the person who caused it.
 */
export const MIC_RESPONSE_DUTIES = Object.freeze([
  Object.freeze({ key: 'operations-impact', label: 'Operating impact', says: 'The service, process or site consequence, and its containment.' }),
  Object.freeze({ key: 'technical-remediation', label: 'Technical remediation', says: 'The engineering hand that removes the cause and restores service.' }),
  Object.freeze({ key: 'compliance-clock', label: 'Compliance and clock', says: 'The external notification obligations and the deadlines the entity owes.' }),
  Object.freeze({ key: 'stakeholder-comms', label: 'Stakeholder communication', says: 'Who is told, what they are told, and when.' }),
  Object.freeze({ key: 'people-welfare', label: 'People and welfare', says: 'The humans affected, including the responders and their relief.' }),
  Object.freeze({ key: 'recovery-verification', label: 'Recovery verification', says: 'Proof that the consequence has actually stopped, independent of the hand that fixed it.' }),
]);
export const MIC_RESPONSE_DUTY_KEYS = Object.freeze(MIC_RESPONSE_DUTIES.map((row) => row.key));
const DUTY_BY_KEY = new Map(MIC_RESPONSE_DUTIES.map((row) => [row.key, row]));
export const responseDutyRow = (key) => DUTY_BY_KEY.get(key) || null;
export const responseDutyText = (key) => DUTY_BY_KEY.get(key)?.says || '';

/* ------------------------------------------------- the notification parties */

/**
 * WHO HAD TO BE TOLD. Closed, because a regulator and an internal channel are
 * not the same obligation and the register must be able to print the
 * difference: one has an external clock and an external consequence, the other
 * has neither.
 */
export const MIC_NOTIFY_PARTIES = Object.freeze([
  Object.freeze({ key: 'regulator', label: 'Regulator / supervisory authority', external: true, note: 'An external authority to whom a clock is owed. The most consequential row on the register.' }),
  Object.freeze({ key: 'affected-customer', label: 'Affected customer / client', external: true, note: 'A commercial counterparty whose service or data is affected.' }),
  Object.freeze({ key: 'data-subject', label: 'Affected individuals', external: true, note: 'The people whose data or safety is affected, where the instrument requires them to be told.' }),
  Object.freeze({ key: 'board', label: 'Board / board committee', external: false, note: 'The governing body or one of its committees.' }),
  Object.freeze({ key: 'executive', label: 'Executive leadership', external: false, note: 'The chief executive and the executive team.' }),
  Object.freeze({ key: 'internal-channel', label: 'Internal escalation channel', external: false, note: 'The internal function that must be woken — security, legal, people, finance.' }),
  Object.freeze({ key: 'partner', label: 'Partner / supplier', external: true, note: 'A third party whose systems or obligations are entangled with the incident.' }),
  Object.freeze({ key: 'insurer', label: 'Insurer / broker', external: true, note: 'A carrier to whom a notification period is owed under a policy.' }),
]);
export const MIC_NOTIFY_PARTY_KEYS = Object.freeze(MIC_NOTIFY_PARTIES.map((row) => row.key));
const PARTY_BY_KEY = new Map(MIC_NOTIFY_PARTIES.map((row) => [row.key, row]));
export const partyRow = (key) => PARTY_BY_KEY.get(key) || null;

/* ------------------------------------------------------------ derived states */

/**
 * THE INCIDENT STATE, in fixed precedence. The order is declared here and used
 * everywhere, so a hand-edited file cannot produce a different reading of the
 * same rows on two screens.
 *
 *   stood-down          an act released command on a named instant.
 *   command-standing    resolved (or not) but no stand-down act — command is
 *                       still held. NEVER converted by the passage of time.
 *   commanding          a commander holds command and the incident is live.
 *   no-commander        live, and nobody has taken command. A printed failure
 *                       of the response, not a fault of a person.
 *   declared            declared, no lines led yet.
 *
 * `lapsed` is NOT a state: it is a fact about a CLOCK, printed per row, because
 * an incident can be perfectly commanded and still have blown an external
 * notification deadline. Collapsing those two would be exactly the reassuring
 * word the mandate forbids.
 */
export const MIC_STATES = Object.freeze([
  Object.freeze({ key: 'stood-down', label: 'Stood down', severity: 0, tone: 'good', says: 'A dated stand-down act released command. Every clock fact and every notification row remains printed.' }),
  Object.freeze({ key: 'command-standing', label: 'Command still standing', severity: 1, tone: 'bad', says: 'The incident is resolved but no stand-down act released command. The bridge is still open and the commander is still held; time alone never closes it.' }),
  Object.freeze({ key: 'commanding', label: 'Commanding', severity: 2, tone: 'info', says: 'A commander holds command and the incident is live.' }),
  Object.freeze({ key: 'no-commander', label: 'No commander', severity: 3, tone: 'bad', says: 'The incident is live and nobody has taken command. This is printed as a finding about the response — not about any person.' }),
  Object.freeze({ key: 'declared', label: 'Declared', severity: 4, tone: 'warn', says: 'Declared, with no response line led yet.' }),
]);
export const MIC_STATE_KEYS = Object.freeze(MIC_STATES.map((row) => row.key));
const STATE_BY_KEY = new Map(MIC_STATES.map((row) => [row.key, row]));
export const stateRow = (key) => STATE_BY_KEY.get(key) || null;

/**
 * THE NOTIFICATION ROW STATE, in fixed precedence. `recorded-late` outranks
 * `recorded` and both outrank `due`, because the fact that a notification went
 * out does not erase the fact that it went out after the deadline — the two are
 * printed together and never collapsed.
 */
export const MIC_NOTIFY_STATES = Object.freeze([
  Object.freeze({ key: 'recorded-late', label: 'Recorded — after the deadline', severity: 0, tone: 'bad', says: 'The notification is recorded and the act was dated after the declared deadline. The overrun is printed to the minute and is never rounded away.' }),
  Object.freeze({ key: 'recorded', label: 'Recorded — within the deadline', severity: 1, tone: 'good', says: 'The notification is recorded inside the declared deadline, with its instant and reference.' }),
  Object.freeze({ key: 'lapsed', label: 'Lapsed — not recorded', severity: 2, tone: 'bad', says: 'The declared deadline has passed with no notification on the record. Nothing converts this to notified.' }),
  Object.freeze({ key: 'due', label: 'Due', severity: 3, tone: 'info', says: 'The declared deadline has not passed and no notification is recorded yet.' }),
  Object.freeze({ key: 'no-clock', label: 'No clock declared', severity: 4, tone: 'warn', says: 'This notification names no declared clock, so no deadline can be computed. A gap in the record, never an assumed 72 hours.' }),
]);
export const MIC_NOTIFY_STATE_KEYS = Object.freeze(MIC_NOTIFY_STATES.map((row) => row.key));

export const MIC_LINE_STATES = Object.freeze([
  Object.freeze({ key: 'led', label: 'Led', note: 'The named lead has accepted the line and the duty it carries.' }),
  Object.freeze({ key: 'assigned', label: 'Assigned — not accepted', note: 'A lead is named but has not accepted. Nobody owns the duty yet.' }),
  Object.freeze({ key: 'unassigned', label: 'No lead named', note: 'The line exists on the incident with no lead. Printed, never silently dropped.' }),
]);
export const MIC_LINE_STATE_KEYS = Object.freeze(MIC_LINE_STATES.map((row) => row.key));

/* ------------------------------------------------------------- act kinds */

/**
 * Eight acts and nothing else. Every one is dated, attributable and append-only;
 * nothing derived is ever stored, so a hand-edited file cannot carry a
 * notification nobody made, a handover nobody performed, or a command released
 * by somebody who never held it.
 *
 * `resolve` and `stand-down` are SEPARATE acts on purpose. Resolving an
 * incident says the operational consequence has stopped; standing down says the
 * command structure has been released. Organisations that collapse the two end
 * up with a bridge held open for three days after the service came back, and
 * nobody can say when command was released because nobody ever released it.
 */
export const MIC_ACT_KINDS = Object.freeze([
  'assign',       // name a lead and a duty on one response line
  'accept',       // the named lead accepts the line in their own name
  'assume',       // take command
  'transfer',     // hand command to a named successor, with a reason
  'notify',       // record that a party was told, with a reference
  'severity',     // raise or lower the declared severity, with a reason
  'resolve',      // the operational consequence has stopped, with evidence
  'stand-down',   // release command on a named instant, with a reason
]);
export const MIC_ACT_KIND_SET = new Set(MIC_ACT_KINDS);

/* --------------------------------------------------------------- refusals */

/**
 * Named refusals. Each is a CONTROL, not a message: it exists because the
 * record would otherwise be able to say something it cannot support.
 */
export const MIC_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That incident is not on this record. Nothing was saved.',
  notYourIncident: 'This seat neither commanded this incident, nor leads one of its response lines, nor holds the incident through the span. One line does not write another line’s incident.',
  alreadyStoodDown: 'Command has been released on this incident. A stood-down incident takes no further acts; a recurrence is declared as a new incident that names the one it follows.',
  notStoodDown: 'This act is only permitted while command is standing.',
  alreadyResolved: 'The operational incident is already closed. A second resolution is not a resolution; stand command down instead, or declare a recurrence that names this incident.',
  standDownBeforeResolve: 'Command cannot be stood down before the operational incident is closed. Release the incident first, then stand command down — the two are different acts and the register keeps them apart.',
  resolveByCommander: 'Only the commanding seat may close the operational incident. A line lead resolves their own line, not the incident.',
  noCommander: 'There is no commander on this incident to hand command from. Take command first — a handover from nobody is not a handover.',
  alreadyCommander: 'This seat already holds command. A handover to the same hand is not a handover.',
  sameHand: 'A line may not be led by the seat that already commands the incident on the same line, and a handover may not name the current holder. Name a different hand.',
  selfAccept: 'A lead accepts their own line. The command seat cannot accept a line on somebody else’s behalf — an accepted duty is the holder’s own word.',
  clockSourced: 'A declared clock must carry a written source. A deadline with no instrument behind it is a number somebody typed, and the register will not print a legal deadline it cannot source.',
  clockRange: 'A declared clock must be a positive whole number of minutes within the register’s declared range.',
  notifClock: 'A notification obligation must name one of the incident’s own declared clocks. A notification with no clock can never be due, and an invented deadline is worse than a printed gap.',
  severityLower: 'Only the commanding seat may lower a declared severity. Anyone holding a line may raise one — raising is the safe direction.',
  severitySame: 'That is the severity already declared on this incident. Nothing was saved.',
  commanderReach: 'The commander must be a seat that can reach the response lines it commands — through the reporting tree or a declared line — unless the whole graph is unreadable, in which case the ambiguity is printed rather than resolved.',
  transferReach: 'A successor commander must be able to reach the response lines of this incident.',
  notifyReference: 'A recorded notification must carry the reference it went out under — a case number, a message id, a submission receipt. “We told them” with nothing behind it is not a record.',
  lineDuplicate: 'That line is already on this incident.',
  textShort: 'Write at least the declared minimum of characters. A reason that cannot be read is not a reason.',
  personNotActive: 'That person is not on the active roster. Nothing was saved.',
  countsRefused: 'The figures cannot be reconciled with the rows they summarise.',
});

/* ------------------------------------------------------------- conventions */

export const MIC_SETTING_KEYS = Object.freeze({
  autoPropagate: 'micAutoPropagate',
  closingWindowMinutes: 'micClosingWindowMinutes',
  chaseDays: 'micChaseDays',
  lapsedAskDays: 'micLapsedAskDays',
  acknowledgeVarianceMinutes: 'micAcknowledgeVarianceMinutes',
});

export const MIC_DEFAULTS = Object.freeze({
  autoPropagate: true,
  /** How long before a deadline the register flags the row as closing. */
  closingWindowMinutes: 120,
  /** Days before an overdue notification is chased again. */
  chaseDays: 1,
  /** Days the notification is asked for when its deadline has already passed. */
  lapsedAskDays: 1,
  /**
   * How far a recorded notification instant may differ from the declared clock
   * deadline and still be read as the SAME clock rather than a different one.
   * Zero is the honest default: an instant later than the deadline is late.
   */
  acknowledgeVarianceMinutes: 0,
});

export const MIC_BOUNDS = Object.freeze({
  closingWindowMinutes: { min: 0, max: 1440 },
  chaseDays: { min: 1, max: 30 },
  lapsedAskDays: { min: 0, max: 30 },
  acknowledgeVarianceMinutes: { min: 0, max: 720 },
});

/* ---------------------------------------------------------------- the method */

export const MIC_METHOD = Object.freeze({
  engine: MIC_ENGINE_VERSION,
  adr: MIC_ADR,
  frameworks: Object.freeze([
    'Incident Command System / NIMS transfer of command — command is a named, dated, transferable role with an explicit handover, not an implicit ownership (FEMA NIMS doctrine; the ICS transfer-of-command briefing)',
    'Major-incident-management practice as published by the reliability platforms — declaration on written criteria, one commander who is not a resolver, numbered severity where “unsure means take the higher level”, and a review that measures time-to-declare and time-to-first-update [PagerDuty / incident.io / FireHydrant public documentation, fetched 2026-11-17; vendor environments not run]',
    'Regulatory notification clocks — GDPR Art. 33 (72 hours from awareness for a notifiable personal-data breach) and NIS2 Art. 23 (24-hour early warning) are the DUTY this register makes recordable; the clock itself is DECLARED with a written source and never assumed [statute text not re-read this session: UNVERIFIED]',
    'Matrix accountability (ADR-0140/ADR-0141) — an incident is inherently cross-line; one to six response lines each carry their own lead and duty, and the accountable seat is the joint apex computed over every line',
    'After-action practice (Reason 1990; the blameless post-incident review) — the register carries no field that names a person as a cause, so a review built from it cannot become a hunt',
    'Bulletproof Reliability Mandate — “the figures add up” and “the printed figures are the computed figures” are two separate printed claims; an unsupported deadline is refused with its reason, never a zero or a plausible default',
  ]),
  printed: Object.freeze([
    'Every duration is exact whole minutes between two recorded instants. Nothing is rounded, and no duration is estimated.',
    'The detection-to-declaration interval is printed as a duration and never as a rating. It is a fact about the response, not about a person.',
    'A notification deadline is computed only from a DECLARED clock with a written source, measured from the instant that declared clock names — never from a built-in default.',
    'A notification recorded after its deadline reads `recorded-late` and keeps both facts: the instant it went out and the minutes by which it overran.',
    'A notification with no clock reads `no-clock` with its reason. It is never given a deadline and never counted as met.',
    'Command release is an act. An incident resolved with no stand-down act reads `command-standing` forever, and time never closes it.',
    'A person holding several response lines is one person and is counted once.',
    'The seat accountable for the whole incident is the joint apex above every response line, computed from the graph; where there is no such seat the register prints `no-authority` and asks nobody.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No paging, notification, escalation or status-page delivery of any kind. The register records what a human says they did, with a reference; it sends nothing.',
    'No legal clock library and no jurisdiction logic. The 72-hour and 24-hour periods appear as the duty being recorded, never as defaults.',
    'No severity decision by the register. The declaring seat declares against a written criterion and the criterion is printed beside it.',
    'No MTTR, MTTA, SLO, error budget or burn-rate computation. The workspace’s survival, tempo and reliability modules own those questions.',
    'No rating, ranking or shaming of any person, team or line. There is no per-person response metric on this register.',
    'No content authoring: the register holds that a party was told, under a reference — not the text of what they were told.',
  ]),
});

/* ------------------------------------------------------------------ CSV #181 */

export const MIC_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key',
  'incidents_n', 'live_n', 'stood_down_n', 'command_standing_n', 'no_commander_n',
  'major_n', 'lines_n', 'lines_unled_n',
  'clocks_n', 'notifications_required_n', 'notifications_recorded_n',
  'notifications_late_n', 'notifications_lapsed_n', 'notifications_no_clock_n',
  'detect_to_declare_minutes_median', 'external_notifications_recorded_n',
  'complete', 'blank_reason',
]);

/**
 * CSV #181 (ADR-0240, Schema v194). IDENTITY-FREE BY CONSTRUCTION. One summary
 * row, one row per severity, one per notification party and one per response
 * line, all as stable positional codes. No incident id, no title, no person id,
 * no name, no clock source text, no notification reference and no free text of
 * any kind crosses this boundary. A figure the reader cannot compute exports
 * BLANK with its reason in `blank_reason`, never a zero.
 */
export const MIC_CSV_DESCRIPTOR = Object.freeze({
  key: MIC_CSV_SCOPE,
  label: 'Major-incident command & notification clocks (aggregate)',
  group: 'operations',
  sensitive: true,
  filenameSlug: 'incident-command',
  description: 'One summary row, one row per declared severity, one per notification party and one per response line (as stable positional codes): incidents declared, live, stood down, resolved-but-still-commanded and uncommanded; response lines and unled lines; declared clocks; notification obligations required, recorded, recorded late, lapsed and without a clock; the median detection-to-declaration interval in whole minutes; and the counts of external notifications actually recorded. No incident id, no title, no person, no name, no instrument text, no reference and no free text. An uncomputable figure is BLANK with its reason, never zero.',
});

export const MIC_SECTION_TITLES = Object.freeze({
  live: 'Live command',
  clocks: 'Notification clocks',
  lines: 'Response lines',
  history: 'Record',
  method: 'Method',
});
