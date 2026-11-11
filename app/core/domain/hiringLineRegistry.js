/**
 * app/core/domain/hiringLineRegistry.js — vocabulary for Cross-Line Selection
 * Corroboration & Co-Hiring Stewardship (ADR-0176, Schema v141, `RULE-HLC-01`,
 * CSV scope #131, `#/matrix?panel=hiring`).
 *
 * THE DUTY. A hire who will work across a functional line and a project or
 * product line is assessed, in practice, by whoever opened the requisition. The
 * second manager meets the person on their first day. Nothing in a hiring loop
 * that knows only "interviewers" can say WHICH of the managers the hire will
 * answer to has actually put a judgement on the record before the offer closes.
 *
 * Frameworks applied (named, not paraphrased):
 *  - Structured selection validity (Sackett, Zhang, Berry & Lievens, 2022):
 *    validity comes from independent structured judgements, so a second line
 *    that never assessed is missing evidence, not a formality.
 *  - Adverse selection (Akerlof, 1970): the line that did not assess buys the
 *    hire on the other line's description of it.
 *  - Multi-task, multi-principal agency (Holmström & Milgrom, 1991): each
 *    principal observes part of the job; the loop staffed by one principal
 *    prices only the part that principal sees.
 *  - Role-episode consensus at entry (Kahn et al., 1964): divergent senders at
 *    the offer are tomorrow's role conflict, so divergence is printed, not
 *    averaged away.
 *
 * Leaf module: imports nothing, so schema, read model, rule, actions, CSV and
 * view can all depend on it without a cycle.
 */

export const HIRING_LINE_RULE_ID = 'RULE-HLC-01';
export const HIRING_LINE_ADR = 'ADR-0176';

export const HIRING_LINE_EVENTS = Object.freeze({
  DECLARED: 'hiring.line.declared',
  WITHDRAWN: 'hiring.line.withdrawn',
  SCAN: 'hiring.line.scan',
});

export const HIRING_LINE_RIGHTS = Object.freeze({
  GOVERN: 'govern-hiring-lines',
});

export const HIRING_LINE_ACT_KINDS = Object.freeze(['declared', 'withdrawn']);

export const HIRING_LINE_LIMITS = Object.freeze({
  acts: 2000,
  markers: 2000,
  additionalLines: 6,
  noteMax: 280,
  reasonMin: 10,
  reasonMax: 280,
  idMax: 80,
  asksPerCommit: 8,
});

export const HIRING_LINE_DEFAULTS = Object.freeze({ askDueDays: 5, autoPropagate: true });
export const HIRING_LINE_BOUNDS = Object.freeze({ askDueDays: Object.freeze([1, 30]) });

/** Candidate stages at which a selection judgement is about to be, or was, made. */
export const HIRING_LINE_DECISION_STAGES = Object.freeze(['final', 'offer', 'hired']);
/** Stages at which an offer exists. */
export const HIRING_LINE_OFFER_STAGES = Object.freeze(['offer', 'hired']);
/** Stages at which RULE-HLC-01 may still ask a line to speak. */
export const HIRING_LINE_ASKABLE_STAGES = Object.freeze(['final', 'offer']);
/** Requisition statuses the register reads. `cancelled` is counted, not read. */
export const HIRING_LINE_READ_STATUSES = Object.freeze(['open', 'on-hold', 'offer', 'filled']);
export const HIRING_LINE_IN_FLIGHT_STATUSES = Object.freeze(['open', 'on-hold', 'offer']);

/** Declared convention: two rating anchors apart (on the 1–5 scale) is divergence. */
export const HIRING_LINE_DIVERGENCE_ANCHORS = 2;
/** Declared convention: a rate over fewer tested candidates than this is withheld. */
export const HIRING_LINE_RATE_FLOOR = 3;

/** One state per (candidate, declared line). Closed vocabulary, in print order. */
export const HIRING_LINE_STATES = Object.freeze(['heard', 'represented', 'silent', 'unasked', 'unreadable']);
export const HIRING_LINE_STATE_LABELS = Object.freeze({
  heard: 'Heard',
  represented: 'Represented',
  silent: 'On the panel, silent',
  unasked: 'Never asked',
  unreadable: 'Cannot be read',
});
export const HIRING_LINE_STATE_REASONS = Object.freeze({
  heard: 'The line’s own manager recorded evidence on this candidate.',
  represented: 'Somebody in this line’s span recorded evidence, but the accountable manager did not. Printed apart from “heard”: a delegate’s interview is not the manager’s judgement.',
  silent: 'The manager is on the requisition’s interview panel and has recorded no evidence on this candidate.',
  unasked: 'The manager is not on the requisition’s interview panel and has recorded no evidence on this candidate.',
  unreadable: 'The declared manager is no longer on the active roster, so nobody can be asked on this line.',
});

/** One verdict per decision-stage candidate. Closed, in precedence order. */
export const HIRING_LINE_VERDICTS = Object.freeze([
  'undeclared', 'unreadable', 'line-unasked', 'line-silent', 'line-represented', 'divergent', 'corroborated', 'single-line-heard',
]);
export const HIRING_LINE_VERDICT_LABELS = Object.freeze({
  undeclared: 'No line plan declared',
  unreadable: 'A declared line cannot be read',
  'line-unasked': 'A line was never asked',
  'line-silent': 'A line is on the panel but silent',
  'line-represented': 'A line spoke only through a delegate',
  divergent: 'Every line heard — and they diverge',
  corroborated: 'Corroborated by every line',
  'single-line-heard': 'Single line, heard',
});
export const HIRING_LINE_VERDICT_REASONS = Object.freeze({
  undeclared: 'Nobody has declared which managers this hire will report to, so cross-line corroboration is REFUSED rather than read as fine.',
  unreadable: 'At least one declared manager is no longer on the active roster. The plan must be re-declared before this candidate can be read.',
  'line-unasked': 'At least one manager the hire will report to is not on the panel and has recorded nothing.',
  'line-silent': 'Every declared manager is on the panel, but at least one has recorded no evidence.',
  'line-represented': 'Every declared line has evidence from its span, but at least one accountable manager has not recorded their own.',
  divergent: `Every declared manager recorded evidence, and their median ratings differ by ${HIRING_LINE_DIVERGENCE_ANCHORS} or more anchors. Printed, never averaged.`,
  corroborated: 'Every declared manager recorded their own evidence and their median ratings are within one anchor.',
  'single-line-heard': 'The plan declares one reporting line and that manager recorded evidence. This is not cross-line corroboration and is never counted as such.',
});
/** Verdicts that are a cross-line TEST (two or more declared lines, all readable). */
export const HIRING_LINE_TESTED_VERDICTS = Object.freeze(['line-unasked', 'line-silent', 'line-represented', 'divergent', 'corroborated']);
/** Verdicts under which an offer rests on fewer judgements than the plan declared. */
export const HIRING_LINE_EXPOSED_VERDICTS = Object.freeze(['undeclared', 'unreadable', 'line-unasked', 'line-silent', 'line-represented']);

export const HIRING_LINE_REALISED_STATES = Object.freeze(['realised', 'drifted', 'unreadable']);

export const HIRING_LINE_RULE_RELATIONS = Object.freeze(['concerns', 'issues-obligation', 'rolls-up-to']);

export const HIRING_LINE_METHOD = Object.freeze([
  'A line plan is a dated human declaration: the home manager and up to six additional line managers a hire will report to. It is never inferred from a team name, a panel or a title.',
  'A line is HEARD only by evidence its own manager recorded on that candidate. Evidence from somebody in the manager’s span reads REPRESENTED and is printed apart.',
  'An interviewer who sits in more than one declared line’s span credits NO line by representation; those signals are counted as ambiguous.',
  `Each line’s rating is the LOWER median of its manager’s own 1–5 ratings. Divergence is a spread of ${HIRING_LINE_DIVERGENCE_ANCHORS} or more anchors between lines.`,
  `The every-line-heard rate is whole permille by truncated division with the remainder flagged, and is withheld below ${HIRING_LINE_RATE_FLOOR} tested candidates.`,
  'After a hire, the declared plan is compared with the reporting lines the person actually holds in the live matrix graph; a difference is printed as drift, never repaired.',
  'RULE-HLC-01 asks only the named manager of a silent or never-asked line, only while the candidate is at final or offer stage, at most once per (candidate, manager, plan), and closes its own ask when the line speaks or the stage passes. It never blocks an offer, never moves a candidate and never records evidence.',
]);

export const HIRING_LINE_CSV_COLUMNS = Object.freeze([
  'row_type', 'generated_on', 'scope',
  'requisitions_read', 'requisitions_declared', 'requisitions_undeclared', 'requisitions_cancelled_not_read',
  'candidates_read',
  'verdict_undeclared', 'verdict_unreadable', 'verdict_line_unasked', 'verdict_line_silent', 'verdict_line_represented',
  'verdict_divergent', 'verdict_corroborated', 'verdict_single_line_heard', 'verdicts_reconcile',
  'line_pairs', 'lines_heard', 'lines_represented', 'lines_silent', 'lines_unasked', 'lines_unreadable', 'lines_reconcile',
  'home_line_only_loops', 'ambiguous_signals', 'offers_exposed',
  'tested', 'every_line_heard', 'every_line_heard_permille', 'permille_remainder_flag', 'rate_withheld_reason',
  'hires_read', 'hires_realised', 'hires_drifted', 'hires_unreadable',
  'open_asks', 'divergence_anchors', 'rate_floor',
]);

export const HIRING_LINE_CSV_DESCRIPTOR = Object.freeze({
  key: 'hiring-lines',
  label: 'Co-hiring line corroboration (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'hiring-lines',
  description: 'One summary row for the requisitions the acting seat may read: how many declare the reporting lines the hire will hold and how many do not; how many decision-stage candidates read under each of the eight verdicts (the eight counts reconcile to the candidate total, and the row says whether they do); how the (candidate, declared line) pairs divide between heard, represented, on-panel-silent, never-asked and cannot-be-read (reconciled separately); how many are home-line-only loops; how many offers rest on fewer judgements than the plan declared; the every-line-heard rate in whole permille with its truncation flag, BLANK with a printed reason below the declared floor; and how many completed hires hold exactly the declared lines in the live reporting graph versus drifted. NO requisition title, NO candidate, NO manager, NO rating and NO free text.',
});
