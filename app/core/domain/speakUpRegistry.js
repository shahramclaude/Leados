/**
 * app/core/domain/speakUpRegistry.js — the closed vocabulary of the Speak-Up
 * Concern Routing & Impartiality Register (ADR-0215, Session 288, Schema v169,
 * `RULE-SUP-01`, CSV scope #157, `#/speak-up`).
 *
 * THE DUTY, IN A FRONTLINE TEAM LEAD'S WORDS. Sam has two managers: a functional
 * one on the home line and a project lead on a declared line. Sam needs to raise
 * a concern about the way the home-line manager is running the shift. The
 * workspace has always told Sam that the right exists — `app/views/conflicts.js`
 * prints, beside its own informal-conversation tools, "do not use informal
 * discussion to avoid an investigation or someone's right to raise a concern" —
 * and then offered nothing with which to do it. There is no route, no receiver,
 * no clock and no record. A right with no instrument is a sentence.
 *
 * THE GAP THIS CLOSES, QUOTED FROM THE CODE RATHER THAN ASSERTED. Before this
 * build, `grep -ril` over `app/` returned ZERO files for `speak up` as a register,
 * `whistleblow` outside an intake keyword list, `raise a concern`, `grievance`
 * outside a keyword list, `impartial`, `retaliation` and `adverse act`. The
 * conflict-of-interest register (ADR-0210) answers a different question — did the
 * hand that signed hold the stake — and the case, conflict and feedback modules
 * are about disputes between people, not about a person who must be able to
 * report conduct *upward* and be protected for it. Wider absence: [UNVERIFIED].
 *
 * WHAT THIS REGISTER ADDS — THREE DATED HUMAN STATEMENTS AND A GRAPH PROPERTY.
 *
 *   1. A CONCERN — who raised it (or that it was raised unnamed), what it is
 *      about (a person or a declared practice), a closed category, a written
 *      summary, and the ROUTE it was given. Nothing is inferred from text.
 *
 *   2. THE ROUTE IS CHECKED, NOT CHOSEN FOR THE LEADER. The register computes,
 *      from the whole reporting graph (home line AND every declared line), which
 *      seats in this record could hear this concern without holding either
 *      party. A receiver that holds the subject, is held by the subject, holds
 *      the reporter or is held by the reporter is refused with the reason that
 *      disqualified it. Where NO seat in the record can hear it, the concern is
 *      kept and printed `no-impartial-route` — the structural finding that this
 *      organisation has no internal channel for this concern — and no receiver
 *      is invented to make the screen look complete.
 *
 *   3. THE CLOCK — acknowledgement within a declared window (EU Directive
 *      2019/1937 requires seven days), an outcome within a declared feedback
 *      window (three months), and a dated anti-retaliation check inside a
 *      declared watch window after the outcome. "Nothing recorded" is never
 *      printed as "nothing happened": a watch window that ends with no check is
 *      `watch-overdue`, a refused cell with a reason, not a clearance.
 *
 * WHAT IT NEVER DOES. It never names a reporter to a seat that does not hold
 * them, never shows the report body to anyone but the receiver and the author,
 * never shows a concern to its own subject, never investigates, never decides
 * whether a concern is well founded, never disciplines, never scores a person
 * and never exports a name, an id, a date or a line of text. It is not a
 * substitute for an external statutory channel, and it says so on the screen.
 *
 * Seats remain workflow declarations, not authentication: confidentiality here
 * is a rendering contract enforced by the reader, and the panel prints that fact
 * rather than implying a security boundary this workspace cannot deliver.
 */

export const SPEAK_UP_ENGINE_VERSION = 'speak-up-2026.11-v1';
export const SPEAK_UP_ADR = 'ADR-0215';
export const SPEAK_UP_RULE_ID = 'RULE-SUP-01';
export const SPEAK_UP_ROUTE = 'speak-up';
export const SPEAK_UP_HREF = '#/speak-up';
export const SPEAK_UP_CSV_SCOPE = 'speak-up-concerns';
export const SPEAK_UP_MARKER_KIND = 'speak-up';

export const SPEAK_UP_EVENTS = Object.freeze({
  CONCERN_RAISED: 'speakUp.concern.raised',
  CONCERN_WITHDRAWN: 'speakUp.concern.withdrawn',
  ACKNOWLEDGED: 'speakUp.concern.acknowledged',
  OUTCOME: 'speakUp.concern.outcome',
  WATCH: 'speakUp.concern.watched',
  CLOSED: 'speakUp.concern.closed',
  CONVENTIONS: 'speakUp.conventions.set',
  SCAN: 'speakUp.scan',
});
export const SPEAK_UP_EVENT_PREFIX = 'speakUp.';

/**
 * Raising is open at EVERY altitude and every rank — the person who needs this
 * register most is the one with the least authority to open a screen. Answering
 * belongs to the named receiver and to nobody else, and the action re-proves it;
 * a manager cannot answer a concern that was routed past them. Declaring the
 * windows is governance (director and above), because the windows are the only
 * thing that makes a promise to a reporter measurable.
 */
export const SPEAK_UP_RIGHTS = Object.freeze({
  READ: 'read-concerns',
  RAISE: 'raise-concern',
  ANSWER: 'answer-concern',
  GOVERN: 'govern-concerns',
});

export const SPEAK_UP_LIMITS = Object.freeze({
  reports: 600,
  acts: 3000,
  actsPerReport: 24,
  markers: 400,
  /** A practice needs a name a reader can act on. */
  labelMin: 3,
  labelMax: 120,
  summaryMin: 12,
  summaryMax: 600,
  noteMin: 12,
  noteMax: 600,
  basisMin: 12,
  basisMax: 600,
  externalLabelMax: 120,
  personIdMax: 120,
  reportsShown: 40,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
  /** Below this many acknowledged concerns no latency figure is printed. */
  latencyFloorN: 5,
});

export const SPEAK_UP_SETTING_KEYS = Object.freeze({
  ackDays: 'speakUpAckDays',
  feedbackDays: 'speakUpFeedbackDays',
  watchDays: 'speakUpWatchDays',
  autoPropagate: 'speakUpAutoPropagate',
});

export const SPEAK_UP_SETTING_LABELS = Object.freeze({
  ackDays: 'Days within which a routed concern must be acknowledged',
  feedbackDays: 'Days within which an acknowledged concern must reach an outcome',
  watchDays: 'Days after an outcome within which retaliation is checked',
  autoPropagate: 'Raise acknowledgement and retaliation-watch asks automatically',
});

export const SPEAK_UP_BOUNDS = Object.freeze({
  ackDays: Object.freeze([1, 60]),
  feedbackDays: Object.freeze([7, 180]),
  watchDays: Object.freeze([7, 365]),
});

export const SPEAK_UP_DEFAULTS = Object.freeze({
  ackDays: 7,
  feedbackDays: 90,
  watchDays: 90,
  autoPropagate: true,
});

/** The categories a concern can be filed under. Closed: never inferred from text. */
export const SPEAK_UP_CATEGORIES = Object.freeze([
  Object.freeze({ key: 'safety', label: 'Safety', says: 'A risk to the physical safety of people or of the operation.' }),
  Object.freeze({ key: 'conduct', label: 'Conduct', says: 'How a person is behaving towards others — bullying, exclusion, dishonesty.' }),
  Object.freeze({ key: 'harassment', label: 'Harassment or discrimination', says: 'Treatment of a person because of who they are, or unwanted behaviour of a sexual or threatening kind.' }),
  Object.freeze({ key: 'integrity', label: 'Financial or legal integrity', says: 'A payment, a claim, a record or a commitment that is not what it says it is.' }),
  Object.freeze({ key: 'retaliation', label: 'Retaliation', says: 'An adverse act taken because somebody raised a concern or refused to do something wrong.' }),
  Object.freeze({ key: 'quality', label: 'Quality of the work', says: 'Work released, signed off or accepted that does not meet the declared standard.' }),
  Object.freeze({ key: 'other', label: 'Other', says: 'A concern that fits none of the above. It is still a concern and it is still recorded.' }),
]);
export const SPEAK_UP_CATEGORY_KEYS = Object.freeze(SPEAK_UP_CATEGORIES.map((row) => row.key));
export const speakUpCategoryByKey = (key) => SPEAK_UP_CATEGORIES.find((row) => row.key === key) || null;

/** What a concern can be about. A person, or a declared practice (no person named). */
export const SPEAK_UP_SUBJECT_KINDS = Object.freeze([
  Object.freeze({ key: 'person', label: 'A person on the roster', says: 'The concern names a person. Impartiality is tested against BOTH parties, and the subject never reads their own concern.' }),
  Object.freeze({ key: 'practice', label: 'A practice, not a person', says: 'The concern names a way of working, not a person. Impartiality is tested against the reporter only.' }),
]);
export const SPEAK_UP_SUBJECT_KEYS = Object.freeze(SPEAK_UP_SUBJECT_KINDS.map((row) => row.key));

/** The three routes a concern can take. */
export const SPEAK_UP_ROUTE_KINDS = Object.freeze([
  Object.freeze({ key: 'internal-person', label: 'A named internal receiver', says: 'The concern is routed to one named person in this record who the graph proves holds neither party.' }),
  Object.freeze({ key: 'external-declared', label: 'A declared external channel', says: 'The concern is taken to a channel this workspace does not host. The register records that it was referred and the channel it was referred to; it does not claim to hear it.' }),
  Object.freeze({ key: 'none-available', label: 'No impartial internal route exists', says: 'Every seat in this record holds one of the parties. The concern is kept, printed as a structural finding, and never handed to a partial receiver to make the screen look complete.' }),
]);
export const SPEAK_UP_ROUTE_KEYS = Object.freeze(SPEAK_UP_ROUTE_KINDS.map((row) => row.key));
export const speakUpRouteByKey = (key) => SPEAK_UP_ROUTE_KINDS.find((row) => row.key === key) || null;

/**
 * The ROLE a qualified receiver hears the concern in. A receiver is disqualified
 * when it is the subject, is the reporter, or sits below either of them on any
 * line. Everything else may hear it — and the role is PRINTED, because calling an
 * ordinary escalation route "independent" is the exact lie a speak-up register
 * exists to prevent.
 */
export const SPEAK_UP_ROLES = Object.freeze([
  Object.freeze({ key: 'manages-subject', label: 'Escalation route — this receiver manages the subject', says: 'The person accountable for the subject’s conduct, hearing it from the next rung. Permitted, and never described as independent: they answer for the behaviour being reported.' }),
  Object.freeze({ key: 'manages-reporter', label: 'This receiver manages the reporter on a line', says: 'The ordinary case in a matrix: the project or second line hears a concern about the home line. The route a matrix exists to provide.' }),
  Object.freeze({ key: 'neither', label: 'No reporting relationship with either party', says: 'A peer, an ancestor of both, or an unrelated seat. The cleanest reading the graph can give.' }),
]);
export const SPEAK_UP_ROLE_KEYS = Object.freeze(SPEAK_UP_ROLES.map((row) => row.key));

/** How a concern ended. Never a verdict on the person the concern was about. */
export const SPEAK_UP_OUTCOMES = Object.freeze([
  Object.freeze({ key: 'upheld', label: 'Upheld — something was found and acted on', says: 'The receiver found the concern substantiated and recorded what was done. The act is the receiver\'s; this register does not re-decide it.' }),
  Object.freeze({ key: 'not-upheld', label: 'Not upheld — nothing was found', says: 'The receiver found nothing to substantiate. The concern is not thereby false, and no finding is made about the reporter.' }),
  Object.freeze({ key: 'referred-elsewhere', label: 'Referred to another route', says: 'The receiver determined the concern belongs to a channel this record does not hold — an investigation, a legal process or an external body.' }),
  Object.freeze({ key: 'unable-to-determine', label: 'Unable to determine', says: 'The receiver could not reach a determination on the evidence. Printed in its own words so that it is never read as a clearance.' }),
]);
export const SPEAK_UP_OUTCOME_KEYS = Object.freeze(SPEAK_UP_OUTCOMES.map((row) => row.key));
export const speakUpOutcomeByKey = (key) => SPEAK_UP_OUTCOMES.find((row) => row.key === key) || null;

/** The anti-retaliation check. Two answers, and the absence of an answer is a third finding. */
export const SPEAK_UP_WATCH_VERDICTS = Object.freeze([
  Object.freeze({ key: 'no-adverse-act', label: 'No adverse act declared', says: 'Someone asked the question inside the window and declared that no adverse act has been recorded against the reporter. A declaration, not surveillance.' }),
  Object.freeze({ key: 'adverse-act-declared', label: 'An adverse act was declared', says: 'An adverse act against the reporter was declared inside the window. The register records it and asks for nothing: escalating retaliation is not an automation\'s act.' }),
]);
export const SPEAK_UP_WATCH_KEYS = Object.freeze(SPEAK_UP_WATCH_VERDICTS.map((row) => row.key));
export const speakUpWatchByKey = (key) => SPEAK_UP_WATCH_VERDICTS.find((row) => row.key === key) || null;

/**
 * One state at a time, decided in this order. The order is the doctrine: a
 * withdrawal outranks every clock, a structural absence outranks a clock that
 * nobody can be held to, a referral outranks an internal clock, and each clock
 * has exactly one overdue state that is distinct from its own in-time state.
 */
export const SPEAK_UP_STATES = Object.freeze([
  Object.freeze({ key: 'withdrawn', label: 'Withdrawn by the reporter', tone: 'neutral', says: 'The reporter ended the concern. Every act that happened before the withdrawal is kept; nothing is deleted.' }),
  Object.freeze({ key: 'no-impartial-route', label: 'No impartial internal route', tone: 'bad', says: 'This record holds no seat that can hear this concern without holding one of the parties. That is a finding about the organisation, not a failure of the reporter.' }),
  Object.freeze({ key: 'external-referred', label: 'Referred to an external channel', tone: 'info', says: 'The concern was taken to a declared channel this workspace does not host. Its clocks are not tested here because the register cannot observe them.' }),
  Object.freeze({ key: 'ack-overdue', label: 'Acknowledgement overdue', tone: 'bad', says: 'The declared acknowledgement window has passed with no acknowledgement on the record.' }),
  Object.freeze({ key: 'unacknowledged', label: 'Awaiting acknowledgement', tone: 'caution', says: 'The concern is routed and inside its acknowledgement window.' }),
  Object.freeze({ key: 'feedback-overdue', label: 'Outcome overdue', tone: 'bad', says: 'The concern was acknowledged and the declared feedback window has passed with no outcome on the record.' }),
  Object.freeze({ key: 'acknowledged', label: 'Acknowledged, outcome pending', tone: 'info', says: 'The receiver acknowledged the concern and is inside the declared feedback window.' }),
  Object.freeze({ key: 'watch-overdue', label: 'Retaliation check overdue', tone: 'bad', says: 'The watch window ended with no retaliation check on the record. Silence is not a clearance and is never printed as one.' }),
  Object.freeze({ key: 'outcome-recorded', label: 'Outcome recorded, watch running', tone: 'info', says: 'An outcome is recorded and the anti-retaliation watch window is still running.' }),
  Object.freeze({ key: 'watched', label: 'Watched', tone: 'good', says: 'An outcome is recorded and a dated retaliation check was made inside the window. The check\'s verdict is printed beside the state.' }),
  Object.freeze({ key: 'closed', label: 'Closed', tone: 'good', says: 'The receiver closed the concern after an outcome. Closing changes nothing that was recorded before it.' }),
]);
export const SPEAK_UP_STATE_BY_KEY = Object.freeze(Object.fromEntries(SPEAK_UP_STATES.map((row) => [row.key, row])));
export const SPEAK_UP_STATE_KEYS = Object.freeze(SPEAK_UP_STATES.map((row) => row.key));

/** The three levels of disclosure the reader may return for one concern. */
export const SPEAK_UP_DETAIL_LEVELS = Object.freeze([
  Object.freeze({ key: 'full', label: 'Full — the route, the dates and the written record', says: 'The receiver, the reporter themselves and the workspace operator.' }),
  Object.freeze({ key: 'summary', label: 'Summary — category, route and state, no body', says: 'A seat that holds one of the parties may know a concern exists and where it stands. It does not read what was written about somebody.' }),
  Object.freeze({ key: 'counted', label: 'Counted only — a row in the totals', says: 'A concern outside the seat, or one whose subject is the seat\'s own person, is counted and never described. The reason is printed on the reading.' }),
]);
export const SPEAK_UP_DETAIL_LEVEL_KEYS = Object.freeze(SPEAK_UP_DETAIL_LEVELS.map((row) => row.key));

export const SPEAK_UP_WITHHOLD_REASONS = Object.freeze({
  outsideSpan: 'outside the seat’s span and reachable through no declared line',
  isSubject: 'the seat’s own person is the subject of the concern',
  unnamed: 'the concern names no reporter, so no seat holds it by authorship',
});

/**
 * Thirty named refusals. Every one of them is a control a real speak-up process
 * has and a generic form does not, and the name is what the panel prints — never
 * a generic "invalid".
 */
export const SPEAK_UP_REFUSALS = Object.freeze([
  Object.freeze({ key: 'not-on-roster', says: 'A party to a concern must be a person the roster holds (or the workspace leader). A concern about somebody who is not in the record cannot be routed.' }),
  Object.freeze({ key: 'subject-is-reporter', says: 'A person cannot raise a concern about themselves. If they need to report on their own practice, they raise it as a practice.' }),
  Object.freeze({ key: 'summary-too-short', says: 'A concern needs a written summary a receiver can act on, not a placeholder.' }),
  Object.freeze({ key: 'unknown-category', says: 'The category must be one the register declares. It is never guessed from the text.' }),
  Object.freeze({ key: 'unknown-route', says: 'The route must be one the register declares.' }),
  Object.freeze({ key: 'receiver-required', says: 'An internal route names exactly one receiver. A concern routed to "the team" has no owner and no clock.' }),
  Object.freeze({ key: 'receiver-not-on-roster', says: 'The named receiver is not a person this record holds.' }),
  Object.freeze({ key: 'receiver-is-subject', says: 'A person named as the subject of a concern cannot be its receiver.' }),
  Object.freeze({ key: 'receiver-reports-to-subject', says: 'The named receiver reports to the subject on at least one line. They answer to the person the concern is about.' }),
  Object.freeze({ key: 'receiver-is-reporter', says: 'A reporter cannot receive their own concern.' }),
  Object.freeze({ key: 'receiver-reports-to-reporter', says: 'The named receiver reports to the reporter on at least one line.' }),
  Object.freeze({ key: 'external-label-required', says: 'An external route names the channel it was referred to. "Somebody else" is not a channel.' }),
  Object.freeze({ key: 'route-not-available', says: 'A concern may only be recorded as having no impartial route when the graph has been tested and none exists. The action re-tests it.' }),
  Object.freeze({ key: 'unauthored-raise', says: 'A named raise must come from the acting seat’s own person, or from a person the seat holds. Nobody files somebody else’s concern in their name.' }),
  Object.freeze({ key: 'future-dated', says: 'A concern cannot be raised in the future. A record of something that has not happened is not a record.' }),
  Object.freeze({ key: 'backdated-before-roster', says: 'A concern cannot be dated before the reporter joined the roster.' }),
  Object.freeze({ key: 'act-unknown-report', says: 'An act must name a concern this record holds.' }),
  Object.freeze({ key: 'not-the-receiver', says: 'Only the named receiver may acknowledge, record an outcome, watch or close a concern. The graph is re-read at the moment of the act.' }),
  Object.freeze({ key: 'already-acknowledged', says: 'A concern is acknowledged once. A second acknowledgement is a correction to the record, not a second clock.' }),
  Object.freeze({ key: 'acknowledge-before-raise', says: 'An acknowledgement cannot precede the day the concern was raised.' }),
  Object.freeze({ key: 'outcome-before-ack', says: 'An outcome cannot be recorded before the concern was acknowledged. An unresolved concern has an outcome of "unresolved".' }),
  Object.freeze({ key: 'outcome-once', says: 'A concern carries one outcome. A later determination supersedes it through a closing act, not by overwriting the first.' }),
  Object.freeze({ key: 'unknown-outcome', says: 'The outcome must be one the register declares.' }),
  Object.freeze({ key: 'watch-before-outcome', says: 'A retaliation check cannot happen before there is an outcome to check against.' }),
  Object.freeze({ key: 'watch-outside-window', says: 'A retaliation check is recorded inside the declared watch window. A check made after it records nothing about the window it names.' }),
  Object.freeze({ key: 'watch-once', says: 'One watch verdict per concern. A second check supersedes nothing and would let a bad one be overwritten.' }),
  Object.freeze({ key: 'watch-by-subject', says: 'The subject of a concern never conducts the retaliation check about it.' }),
  Object.freeze({ key: 'close-before-outcome', says: 'A concern is closed only after an outcome. Closing an open concern would end a duty without discharging it.' }),
  Object.freeze({ key: 'withdraw-not-reporter', says: 'Only the reporter — or the workspace operator on an unnamed record — may withdraw a concern.' }),
  Object.freeze({ key: 'convention-out-of-bounds', says: 'A declared window outside its bounds is refused, never clamped. A typo must not shorten or lengthen the promise made to a reporter.' }),
]);

/**
 * The frameworks this register applies, named rather than paraphrased. They are
 * printed on the Method view so that a reader can check the register against the
 * practice it claims to implement.
 */
export const SPEAK_UP_FRAMEWORKS = Object.freeze([
  Object.freeze({
    key: 'eu-directive',
    label: 'EU Whistleblower Directive 2019/1937 (transposed nationally)',
    says: 'An internal reporting channel must be able to receive a report, acknowledge receipt within seven days and give feedback within three months. Those are the defaults here and both are declared, because the register must be usable where a stricter national rule applies.',
  }),
  Object.freeze({
    key: 'iso-37002',
    label: 'ISO 37002:2021 Whistleblowing management systems',
    says: 'The principles this register implements: impartiality of the receiver, no conflict of interest in the handling, confidentiality of the reporter, protection against retaliation, and a documented, dated trail. Nothing here claims certification.',
  }),
  Object.freeze({
    key: 'fca-sysc18',
    label: 'FCA/PRA SYSC 18 (whistleblowing) and SOX §806',
    says: 'UK and US regimes that make retaliation itself the offence, not merely a bad outcome. That is why the register carries a dated retaliation check as a first-class act rather than a note in an outcome.',
  }),
  Object.freeze({
    key: 'independence',
    label: 'Auditor-independence logic (SEC / PCAOB independence rules)',
    says: 'The impartiality test is the independence test applied to a reporting graph: a receiver may hold no reporting relationship, in either direction, with either party. It is computed from the record, not declared by the receiver about themselves.',
  }),
  Object.freeze({
    key: 'edmondson',
    label: 'Edmondson (1999) psychological safety; Miceli & Near (1984, 1992) retaliation model',
    says: 'Speaking up is a function of the perceived cost, and the cost is set by what happened to the last person who did. The watch window exists because an outcome that is followed by an adverse act teaches the next reporter to stay quiet, whatever the outcome said.',
  }),
  Object.freeze({
    key: 'fayol-gulick',
    label: 'Unity of command (Fayol 1916; Gulick 1937) and matrix theory (Galbraith 1971; Bartlett & Ghoshal 1990)',
    says: 'A person with two managers has two potential subjects and two potentially compromised routes. The matrix is what makes an impartial route exist at all — and what makes its absence a structural finding when every seat holds somebody.',
  }),
  Object.freeze({
    key: 'coso',
    label: 'COSO 2013 principle 10 (control activities) and ISO 9001 §10.2',
    says: 'A protective function that cannot be shown to have operated is not a control. The acknowledgement clock, the feedback clock and the watch are the evidence that the channel ran.',
  }),
]);

/** The register's own account of what it is and is not. Printed, not implied. */
export const SPEAK_UP_METHOD = Object.freeze({
  identity:
    'One reader (`buildSpeakUpReport`) stands behind every count, every row, the brief and the CSV. No figure on the screen is computed in the panel and none is stored: every state, every due date, every impartiality verdict and every latency is re-derived from the dated rows on read.',
  impartiality:
    'A receiver is REFUSED when it is the subject, is the reporter, or sits below either party on any line — home line or declared line — because a person does not adjudge the conduct of somebody whose work they answer for. Everything else may hear the concern, and the role it hears it in is printed: the subject’s own manager is an ESCALATION route, not an independent one, and the reporter’s other manager is the ordinary matrix route. The test is recomputed for every live concern on every read, so a line declared after the concern was routed shows up as `receiver no longer impartial` rather than an authority quietly acquired.',
  clock:
    'The acknowledgement, feedback and watch windows are copied onto the concern on the day it is raised. Changing the convention later cannot rewrite the promise that was made to that reporter, and the panel prints both the stored window and the convention now in force when they differ.',
  silence:
    'A window that ends with no act is an overdue state with a reason. It is never a clearance, never a blank and never a zero. The absence of an outcome, of a watch verdict and of a route are three different findings and are never collapsed into one reassuring word.',
  confidentiality:
    'The body of a concern and the name of its reporter are returned only to the receiver and to the reporter. A seat that holds a party receives category, route and state. A seat outside the span, and the subject of the concern themselves, receive a count. This is a rendering contract enforced by the reader — this workspace has no authentication, and the panel says so rather than implying a boundary it cannot deliver.',
  limits:
    'It does not investigate, determine facts, discipline, or replace a statutory external channel. It records that a route existed, that a clock ran, and what was recorded inside it.',
});

export const SPEAK_UP_CSV_COLUMNS = Object.freeze([
  'as_of',
  'concerns_total',
  'concerns_live',
  'category',
  'route_kind',
  'state_key',
  'state_count',
  'ack_days_declared',
  'feedback_days_declared',
  'watch_days_declared',
  'overdue_count',
  'no_impartial_route_count',
  'receiver_drifted_count',
  'figures_complete',
  'counts_reconcile',
]);

export const SPEAK_UP_CSV_DESCRIPTOR = Object.freeze({
  key: SPEAK_UP_CSV_SCOPE,
  label: 'Speak-up concerns (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'speak-up-concerns',
  description: 'One workspace summary row plus one row per (category × route kind × state) bucket, over the register as read on read_on. Every figure is an exact integer count of dated rows. NO reporter, NO subject, NO receiver, NO manager, NO person, NO concern id, NO summary text, NO outcome note and NO date is exported: the counts are the whole of it, and a bucket that cannot be read exports BLANK with figures_complete = false rather than a zero. A concern with no impartial route and a receiver whose impartiality has drifted are counted in their own columns so that neither can be read as a clean register.',
});

export const SPEAK_UP_VIEWS = Object.freeze([
  Object.freeze({ key: 'register', label: 'Concerns' }),
  Object.freeze({ key: 'routes', label: 'Who could hear it' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);
