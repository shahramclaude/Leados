/**
 * app/core/domain/caseToAnswer.js — the closed vocabulary of the Fair-Process
 * Discipline & Grievance Register (ADR-0254, Schema v207, `#/fair-process`,
 * CSV scope #193, `RULE-DGI-01`).
 *
 * THE DUTY, IN A FRONTLINE LEAD'S WORDS. Two people in one team are in conflict.
 * One of them has now made a written allegation against the other. The lead has to
 * answer five separate questions in order, and the workspace so far answered none
 * of them:
 *
 *   1. Is there a CASE TO ANSWER? Not "is this person guilty" — has anybody stated,
 *      in writing, what is said to have happened, against which written standard,
 *      and on what evidence. An allegation with no standard and no evidence is an
 *      opinion with a date on it.
 *   2. WHO may look into it? The investigator must hold NEITHER party on any active
 *      line — home line or declared matrix line — and must be senior enough to be
 *      able to conclude against the subject. The person who manages one of the two
 *      people is not independent, and a peer cannot conclude above a peer.
 *   3. What did they FIND? A finding is a dated written conclusion against each
 *      allegation, on ONE declared standard of proof that the case names at the
 *      outset and never changes afterwards.
 *   4. What is the DECISION? A sanction is chosen by a hand senior to the
 *      investigator, on a declared ladder, with the ladder rung and the previous
 *      sanctions actually printed beside it — because identical cases getting
 *      different answers is the failure this register exists to make visible.
 *   5. What happens on APPEAL? A different, strictly senior hand rehears it, may
 *      reach a different conclusion, and that conclusion stands. An appeal decided
 *      by the person who decided the case is not an appeal.
 *
 * THE GAP THIS CLOSES, QUOTED FROM THE CODE RATHER THAN ASSERTED. Before this
 * build, a word-boundary census over `app/` returned ZERO files for `case to
 * answer`, `grievance procedure`, `hearing`, `terms of reference`,
 * `investigating officer`, `sanction ladder`, `balance of probabilities`,
 * `gross misconduct`, `summary dismissal`, `appeal hearing`, `procedural
 * fairness`, `garden leave`, `final written warning` and `double jeopardy` as a
 * register. The existing adjacent instruments each say so themselves:
 *   - `speakUpRegistry.js` (ADR-0215) routes a CONCERN and refuses to
 *     investigate it: "never investigates, never decides whether a concern is
 *     well founded, never disciplines".
 *   - `justCultureRegistry.js` (ADR-0218) CLASSIFIES a departure as human error,
 *     at-risk behaviour or reckless behaviour and REFERS a formal review: "never
 *     decides or imposes a sanction (`formal-review` is a referral that this
 *     register records and does not run)".
 *   - `lfgRegistry.js` (ADR-0248) is the claim and limitation register: an
 *     employment claim's accrual is "the effective date of termination", which
 *     this workspace could not record because it had no dismissal register.
 *   - `performanceRules.js` deliberately "open *support*, never sanction".
 *   - `workplaceAdjustment*` (ADR-0241) records a restriction and never decides
 *     conduct.
 * The referral above the just-culture classifier had nowhere to land, and the
 * limitation clock below the claim register had no start. This register is that
 * landing place. It is NOT a HRIS, not a case-management system, not a
 * disciplinary procedure of any jurisdiction, and it claims no statutory
 * compliance: it records what named hands decided, on what written basis, in
 * what order, and it prints where the order or the independence fails.
 *
 * WHAT IT NEVER DOES. It never investigates, never collects evidence, never
 * interviews anybody, never decides that a person is guilty of anything except
 * the written conclusion a named human recorded; it never infers misconduct
 * from text, never infers a sanction from a finding (the ladder rung is
 * recommended, the decision is a separate dated act by a separate hand), never
 * scores or ranks a person, and never lets the same hand be investigator,
 * decision-maker and appeal decider. Seats remain workflow declarations, not
 * authentication: independence here is a graph property computed on read and
 * printed, not a security boundary this workspace can deliver, and the screen
 * says so.
 */

export const DGI_ENGINE_VERSION = 'fair-process-2026.11-v1';
export const DGI_ADR = 'ADR-0254';
export const DGI_RULE_ID = 'RULE-DGI-01';
export const DGI_ROUTE = 'fair-process';
export const DGI_HREF = '#/fair-process';
export const DGI_CSV_SCOPE = 'fair-process-discipline';
export const DGI_EVENT_PREFIX = 'fair-process.';
export const DGI_MARKER_KIND = 'fair-process';
export const DGI_PAUSE_SWITCH = 'dgiAutoPropagate';

export const DGI_EVENTS = Object.freeze({
  OPENED: 'fair-process.case.opened',
  INVESTIGATOR_SET: 'fair-process.case.investigator-set',
  DIRECTIONS_SET: 'fair-process.case.directions-set',
  FINDING_RECORDED: 'fair-process.finding.recorded',
  SANCTION_DECIDED: 'fair-process.sanction.decided',
  APPEAL_LODGED: 'fair-process.appeal.lodged',
  APPEAL_DECIDED: 'fair-process.appeal.decided',
  WITHDRAWN: 'fair-process.case.withdrawn',
  CONVENTIONS_SET: 'fair-process.conventions-set',
  SCANNED: 'fair-process.scan',
});

export const DGI_RIGHTS = Object.freeze({
  READ: 'read-fair-process',
  OPEN: 'open-fair-process',
  ASSIGN: 'assign-fair-process-investigator',
  FIND: 'record-fair-process-finding',
  DECIDE: 'decide-fair-process-sanction',
  APPEAL: 'decide-fair-process-appeal',
  LODGE: 'lodge-fair-process-appeal',
  WITHDRAW: 'withdraw-fair-process-case',
  GOVERN: 'govern-fair-process',
});

export const DGI_SETTING_KEYS = Object.freeze({ autoPropagate: 'dgiAutoPropagate' });

/**
 * The only conventions this register carries, and what it deliberately does NOT:
 * there is no default sanction, no default standard of proof, no presumed
 * outcome, no investigation window that could stand in for a procedure's own,
 * and no ladder rung that applies itself. Every one of those is a declaration on
 * a particular case by a named hand, because a workspace default would impose a
 * sanction nobody chose.
 */
export const DGI_BOUNDS = Object.freeze({
  dgiPrivacyFloor: Object.freeze({ min: 2, max: 20, fallback: 3 }),
  dgiAppealWindowDays: Object.freeze({ min: 0, max: 90, fallback: 14 }),
  dgiDecisionWindowDays: Object.freeze({ min: 0, max: 60, fallback: 10 }),
  dgiFindingWindowDays: Object.freeze({ min: 1, max: 180, fallback: 28 }),
});

export const DGI_LIMITS = Object.freeze({
  cases: 500,
  allegations: 4000,
  investigators: 500,
  directions: 2000,
  findings: 4000,
  decisions: 1000,
  appeals: 1000,
  appealOutcomes: 1000,
  withdrawals: 1000,
  markers: 1000,
  partiesMax: 2,
  allegationsPerCaseMax: 12,
  textMin: 24,
  textMax: 900,
  refMin: 6,
  refMax: 120,
  shortMin: 3,
  shortMax: 120,
});

/**
 * WHO THE CASE IS ABOUT, AND WHY THE DISTINCTION IS A DECLARED FIELD.
 *
 * A grievance a person raises ABOUT their own treatment is a different duty from
 * a conduct case brought AGAINST a person: the first is owed to the complainant,
 * the second is owed to the subject AND to whoever made the allegation, and the
 * independence test is not the same (in a grievance, the complainant is a party
 * whose manager cannot hear it either). Storing one kind and assuming the other
 * is how a system ends up calling a person who reported bullying "the subject".
 */
export const DGI_CASE_KINDS = Object.freeze([
  Object.freeze({ key: 'conduct', label: 'Conduct / disciplinary case', says: 'A written allegation that a named person departed from a written standard.' }),
  Object.freeze({ key: 'grievance', label: 'Grievance about treatment', says: 'A written complaint by a named person about how they have been treated.' }),
  Object.freeze({ key: 'grievance-about-process', label: 'Grievance about a previous decision', says: 'A written complaint that an earlier decision, including an earlier case outcome, was reached unfairly. The earlier decision is a declared reference, never re-opened by this register.' }),
]);
export const DGI_CASE_KIND_KEYS = Object.freeze(DGI_CASE_KINDS.map((row) => row.key));
export const DGI_CASE_KIND_BY_KEY = Object.freeze(Object.fromEntries(DGI_CASE_KINDS.map((row) => [row.key, row])));

/**
 * THE STANDARD OF PROOF IS DECLARED ONCE, AT OPENING, AND NEVER CHANGES.
 *
 * "Balance of probabilities" and "satisfied on the evidence" are not synonyms for
 * a vibe; they are different, named burdens, and a case that quietly moves from
 * one to the other between the allegation and the finding has changed the test
 * after seeing the evidence. The register stores the standard on the case and
 * prints it on every finding; a finding is refused if it does not carry the
 * case's own standard.
 */
export const DGI_STANDARDS = Object.freeze([
  Object.freeze({ key: 'balance-of-probabilities', label: 'Balance of probabilities', says: 'More likely than not — the ordinary civil standard.' }),
  Object.freeze({ key: 'reasonable-satisfaction', label: 'Satisfied on the evidence', says: 'The decision-maker states that they are satisfied the fact is established by the evidence before them.' }),
  Object.freeze({ key: 'serious-and-substantiated', label: 'Serious and substantiated', says: 'A higher declared burden the case names for itself, applied to every allegation in it.' }),
]);
export const DGI_STANDARD_KEYS = Object.freeze(DGI_STANDARDS.map((row) => row.key));
export const DGI_STANDARD_BY_KEY = Object.freeze(Object.fromEntries(DGI_STANDARDS.map((row) => [row.key, row])));
export const DGI_DEFAULT_STANDARD = 'balance-of-probabilities';

/** How an allegation is classified. Nothing is inferred from the words used. */
export const DGI_ALLEGATION_CLASSES = Object.freeze([
  Object.freeze({ key: 'conduct', label: 'Conduct', says: 'Behaviour said to fall short of a written standard of conduct.' }),
  Object.freeze({ key: 'capability', label: 'Capability / performance', says: 'A written claim that the person could not meet a declared requirement. Support-first, never a sanction assumed.' }),
  Object.freeze({ key: 'attendance', label: 'Attendance', says: 'A written claim about attendance. This register does not test whether an absence was justified — that is the adjustment and absence instruments’ job.' }),
  Object.freeze({ key: 'relationship', label: 'Working relationship', says: 'A written complaint about how people are working together.' }),
  Object.freeze({ key: 'safety', label: 'Safety or a control breach', says: 'A written claim that a declared safety standard or control was not followed.' }),
  Object.freeze({ key: 'other', label: 'Other declared class', says: 'A class the case names in its own written terms.' }),
]);
export const DGI_ALLEGATION_CLASS_KEYS = Object.freeze(DGI_ALLEGATION_CLASSES.map((row) => row.key));
export const DGI_ALLEGATION_CLASS_BY_KEY = Object.freeze(Object.fromEntries(DGI_ALLEGATION_CLASSES.map((row) => [row.key, row])));

/**
 * THE DISPOSITION OF ONE ALLEGATION. `not-upheld` is a real, printed outcome and
 * is never the same thing as "unproven": the register has no `unproven` key,
 * because a burden that was not met IS a finding, and a case that trails off is
 * its own overdue state rather than a verdict nobody recorded.
 */
export const DGI_FINDINGS = Object.freeze([
  Object.freeze({ key: 'upheld', label: 'Upheld', says: 'The allegation was established on the case’s declared standard of proof.' }),
  Object.freeze({ key: 'partly-upheld', label: 'Partly upheld', says: 'Part of the allegation was established on the declared standard and part was not. The written finding says which part.' }),
  Object.freeze({ key: 'not-upheld', label: 'Not upheld', says: 'The allegation was not established on the declared standard. This is a finding about the evidence, never about the person who raised it.' }),
  Object.freeze({ key: 'no-case-to-answer', label: 'No case to answer', says: 'On the written allegation and the evidence cited against the declared standard, there is nothing for the person to answer. A second-hand process answer is not recorded here — it is a finding with a written reason.' }),
]);
export const DGI_FINDING_KEYS = Object.freeze(DGI_FINDINGS.map((row) => row.key));
export const DGI_FINDING_BY_KEY = Object.freeze(Object.fromEntries(DGI_FINDINGS.map((row) => [row.key, row])));
export const DGI_UPHELD_KEYS = Object.freeze(['upheld', 'partly-upheld']);

/**
 * THE LADDER. A declared set of rungs, ordered, each with a written description,
 * and NONE of them applying itself. The register computes the rung the record
 * suggests — the LOWEST rung above the last live sanction of the same class — and
 * prints it beside the rung the decision-maker actually chose, with any departure
 * recorded and counted. A sanction is never inferred from a finding.
 *
 * Rung `none` is a real outcome (no sanction) and is the ladder's floor, because
 * an upheld allegation with no sanction is a decision, not an omission.
 */
export const DGI_SANCTIONS = Object.freeze([
  Object.freeze({ key: 'none', rank: 0, label: 'No sanction', says: 'A recorded decision to impose nothing. It is a decision and it is printed.' }),
  Object.freeze({ key: 'recorded-conversation', rank: 1, label: 'Recorded conversation', says: 'Expectations restated by a named hand, recorded with a date and the standard it refers to.' }),
  Object.freeze({ key: 'written-warning', rank: 2, label: 'Written warning', says: 'A warning on the record for a declared period, with the standard it names.' }),
  Object.freeze({ key: 'final-written-warning', rank: 3, label: 'Final written warning', says: 'A final warning on the record for a declared period. The next upheld allegation of the same class is expected to escalate.' }),
  Object.freeze({ key: 'demotion', rank: 4, label: 'Change of role or grade', says: 'A change of role or grade, which owes an operational date and a separate consultation under the workspace’s own instruments.' }),
  Object.freeze({ key: 'dismissal', rank: 5, label: 'Dismissal', says: 'The end of the person’s engagement. The effective day is recorded here and is the accrual the limitation register reads.' }),
]);
export const DGI_SANCTION_KEYS = Object.freeze(DGI_SANCTIONS.map((row) => row.key));
export const DGI_SANCTION_BY_KEY = Object.freeze(Object.fromEntries(DGI_SANCTIONS.map((row) => [row.key, row])));
export const DGI_SANCTION_RANK = Object.freeze(Object.fromEntries(DGI_SANCTIONS.map((row) => [row.key, row.rank])));

/** How a case ends without a decision. Both are kept, neither is a clearance. */
export const DGI_WITHDRAWAL_REASONS = Object.freeze([
  Object.freeze({ key: 'withdrawn-by-complainant', label: 'Withdrawn by the person who raised it', says: 'The case ends on the complainant’s written withdrawal. A withdrawal is not a finding and it never clears the subject.' }),
  Object.freeze({ key: 'superseded', label: 'Superseded by a new case', says: 'The case ended because a new case replaced it. The new case is a declared reference.' }),
]);
export const DGI_WITHDRAWAL_REASON_KEYS = Object.freeze(DGI_WITHDRAWAL_REASONS.map((row) => row.key));
export const DGI_WITHDRAWAL_REASON_BY_KEY = Object.freeze(Object.fromEntries(DGI_WITHDRAWAL_REASONS.map((row) => [row.key, row])));

/**
 * THE STATE SET. Ten keys, mutually exclusive by construction: every case derives
 * exactly one, and the reader proves the states reconcile to the case count. Two
 * of them (`investigator-invalid`, `record-conflict`) are findings about the
 * RECORD, not about the person, and neither is ever cleared by the passage of time.
 */
export const DGI_REVIEW_STATES = Object.freeze([
  Object.freeze({ key: 'open', label: 'Open — no investigator', tone: 'bad',
    says: 'The case and its written allegation are on the record; nobody has been assigned to look into it, so no clock has started.' }),
  Object.freeze({ key: 'investigator-assigned', label: 'Investigator assigned', tone: 'warn',
    says: 'A named hand with no declared line to either party is investigating. Nothing has been found yet.' }),
  Object.freeze({ key: 'findings-owed', label: 'Findings owed', tone: 'warn',
    says: 'The investigation is under way but at least one allegation carries no written finding. The count owed is printed; no finding is inferred.' }),
  Object.freeze({ key: 'decision-owed', label: 'Decision owed', tone: 'warn',
    says: 'Every allegation carries a written finding on the case’s own standard of proof, and the sanction decision is owed by a hand strictly senior to the investigator.' }),
  Object.freeze({ key: 'decided', label: 'Decided', tone: 'neutral',
    says: 'A sanction decision is on the record. The appeal window runs from the decision day and is printed with the exact days remaining. A decision is not the end of the matter.' }),
  Object.freeze({ key: 'appeal-window-closed', label: 'Decided — appeal window closed', tone: 'neutral',
    says: 'A sanction decision is on the record and the declared appeal window has passed with no appeal lodged. This is the case CLOSING, not the appeal being refused: an appeal that arrives after the window is a late appeal, kept and printed as late.' }),
  Object.freeze({ key: 'appeal-lodged', label: 'Appeal lodged', tone: 'warn',
    says: 'An appeal is on the record with its declared grounds and has not been decided. The decision below stands unless and until a different senior hand decides otherwise.' }),
  Object.freeze({ key: 'appeal-decided', label: 'Appeal decided', tone: 'neutral',
    says: 'A different, strictly senior hand reheard it and decided the appeal. The appeal outcome stands, and where it differs from the decision below both are printed.' }),
  Object.freeze({ key: 'withdrawn', label: 'Withdrawn', tone: 'neutral',
    says: 'The case ended on a written withdrawal or as superseded. No finding was made, and a withdrawal is never a clearance of the subject.' }),
  Object.freeze({ key: 'investigator-invalid', label: 'Investigator no longer independent', tone: 'bad',
    says: 'The hand recorded as investigator holds a party on an active line today, or is no longer senior to the subject, or has left the graph. The finding that follows cannot be relied on and the register says so rather than quietly accepting it.' }),
  Object.freeze({ key: 'record-conflict', label: 'Record conflict', tone: 'bad',
    says: 'The dated acts on this case cannot all be true in the order a fair procedure requires — a finding before the case, a decision before every finding, two decisions, an appeal before a decision, or a finding on a standard of proof the case never declared. Nothing is resolved by preferring one row.' }),
]);
export const DGI_REVIEW_STATE_KEYS = Object.freeze(DGI_REVIEW_STATES.map((row) => row.key));
export const DGI_REVIEW_STATE_BY_KEY = Object.freeze(Object.fromEntries(DGI_REVIEW_STATES.map((row) => [row.key, row])));

/** States in which a case is still moving and a person may be waiting for an answer. */
export const DGI_OPEN_STATE_KEYS = Object.freeze([
  'open', 'investigator-assigned', 'findings-owed', 'decision-owed', 'decided', 'appeal-lodged',
]);

/**
 * States after which the case accepts no further act. An appeal may still be
 * LODGED inside the window on `decided`; once the window has closed, a late
 * appeal is a recorded act the reader prints as late rather than a door.
 */
export const DGI_TERMINAL_STATE_KEYS = Object.freeze(['appeal-decided', 'appeal-window-closed', 'withdrawn']);

/**
 * DIRECTIONS: the written safeguard the procedure owes and this register does not
 * run. Recorded as declarations so a case shows whether the affected person was
 * told, whether a companion was offered, whether an interim measure was declared
 * and whether anybody recused themselves — without this module pretending to BE
 * the procedure. An interim measure is never a sanction and never a finding.
 */
export const DGI_DIRECTION_KINDS = Object.freeze([
  Object.freeze({ key: 'subject-informed', label: 'The subject was informed in writing', says: 'The registered subject was told about the allegation and where to find it.' }),
  Object.freeze({ key: 'companion-offered', label: 'A companion or representative was offered', says: 'The offer was made and recorded. Whether it was taken up is a decision, never inferred.' }),
  Object.freeze({ key: 'interim-measure', label: 'Interim measure declared', says: 'A temporary measure during an unresolved case — never a sanction and never a finding.' }),
  Object.freeze({ key: 'recusal-recorded', label: 'A recusal was recorded', says: 'A named hand stood back from the case for a stated reason.' }),
]);
export const DGI_DIRECTION_KIND_KEYS = Object.freeze(DGI_DIRECTION_KINDS.map((row) => row.key));
export const DGI_DIRECTION_KIND_BY_KEY = Object.freeze(Object.fromEntries(DGI_DIRECTION_KINDS.map((row) => [row.key, row])));

export const DGI_SECTION_TITLES = Object.freeze({
  cases: 'Cases',
  worklist: 'My duties',
  ladder: 'Consistency',
  method: 'Method & limits',
});

/**
 * WHAT A READER AT EACH ALTITUDE RECEIVES. Above the ceiling the register prints
 * counts and reasons and withholds the allegation text, the parties and the written
 * findings: an allegation is individual material about named people, and the reader
 * whose unit of analysis is a span receives the count, not the case.
 */
export const DGI_REFUSALS = Object.freeze({
  notSeated: 'The operating seat is unresolved, so no case may be opened, investigated, decided, appealed or withdrawn. Declare a valid seat first.',
  noReach: 'This seat does not hold that person on an active reporting line or declared matrix line. Nothing was saved.',
  notFound: 'That case is not on the record. Nothing was saved.',
  unreadable: 'The row could not be read back by this register’s own loader, so nothing was saved.',
  ledgerFull: 'The register is at its declared limit. Archive or export the workspace before adding another row.',
  partyInvalid: 'A case names one subject and, where there is one, one person who raised it. The two must be different people and both must be on this workspace.',
  notYourCase: 'This seat holds neither party on an active line and is not an assigned hand on this case, so it cannot record an act against it.',
  investigatorNotIndependent: 'The proposed investigator holds one of the parties on an active reporting line, or is held by one of them, or is a party. Independence is computed from the live reporting graph and cannot be declared away — nothing was saved.',
  investigatorNotSenior: 'The proposed investigator is not senior to the subject on the live reporting graph. An investigator who cannot conclude above the person they are investigating is not investigating independently.',
  standardLocked: 'The standard of proof was declared when the case was opened and does not change afterwards. A case that moves its own burden after seeing the evidence has changed the test.',
  findingAfterClose: 'The case is closed. A closed case accepts no new finding.',
  findingDuplicate: 'That allegation already carries a written finding. A finding is recorded once; a revision is a new case, never a silent overwrite.',
  decisionBeforeFindings: 'A decision cannot be recorded before every allegation carries a written finding. Nothing was saved.',
  decisionNotSenior: 'The decision-maker must be strictly senior to the investigator on the live reporting graph. The person who decided what happened does not also decide what it costs.',
  decisionUnaffected: 'A second sanction decision on the same case is refused. A decision is recorded once; an appeal is a different act by a different hand.',
  appealNeedsDecision: 'An appeal can only be lodged against a decision on the record.',
  appealNotIndependent: 'The appeal decider must be a different hand from the decision-maker AND strictly senior to them. An appeal decided by the person who decided the case is not an appeal.',
  appealDecided: 'An appeal has already been decided on this case. Its outcome stands.',
  withdrawalNeedsReason: 'A withdrawal needs one of the declared reasons and a written basis. Ending a case is a decision, not an omission.',
  dayFuture: 'That day is in the future. This register records what was decided and when, never what will be.',
  nonEmptyStart: 'A case needs at least one written allegation. A case with no allegation has nothing to answer.',
});

/**
 * The ladder reading is the completeness core of this register: a leader must be
 * able to see, from the record alone, whether like cases got like answers.
 */
export const DGI_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'case_kind', 'state', 'cases_n', 'open_n', 'decided_n',
  'appeal_lodged_n', 'appeal_decided_n', 'withdrawn_n', 'record_conflict_n',
  'upheld_n', 'not_upheld_n', 'no_case_to_answer_n', 'sanction_dismissal_n',
  'appeal_overturned_n', 'ladder_departure_n', 'privacy_floor', 'complete', 'blank_reason',
]);

export const DGI_CSV_DESCRIPTOR = Object.freeze({
  key: DGI_CSV_SCOPE,
  label: 'Fair process & discipline (aggregate)',
  group: 'people',
  sensitive: true,
  filenameSlug: 'fair-process-discipline',
  description: 'One summary row, one row per case kind and one row per derived review state. Identity-free counts only: no case reference, person, manager, allegation, standard, finding, sanction reason, investigator or day is exported. Non-zero counts below the declared privacy floor are blank with a reason, never a small number. A dismissal count is a count of decisions, never a list of people.',
});

export const DGI_METHOD = Object.freeze({
  engine: DGI_ENGINE_VERSION,
  adr: DGI_ADR,
  frameworks: Object.freeze([
    'Case to answer: the threshold before a conduct case proceeds is whether a written allegation, against a written standard, with evidence cited, would if made out fall short of that standard. It is a process question, not a verdict, and this register keeps the allegation and the finding as separate dated facts.',
    'Natural justice / procedural fairness (audi alteram partem; nemo iudex in causa sua): nobody decides their own case, and the person affected must be able to answer. Here that is computed rather than promised — the investigator, decision-maker and appeal decider must each be independent of both parties on the live reporting graph, and the decision-maker and appeal decider must be strictly senior to the hand whose conclusion they judge.',
    'Consistency (ACAS Code of Practice on disciplinary and grievance procedures, and the proportionality principle behind it): like cases should get like answers. The register computes the LOWEST declared ladder rung above the person’s most recent live sanction of the same class, prints it beside the rung actually chosen, and counts every departure with its written reason. It never imposes the computed rung.',
    'Just culture (Marx 2001; Reason 1997; Dekker 2007) as the upstream classifier: ADR-0218 classifies a departure as human error, at-risk behaviour or reckless behaviour and refers a formal review without imposing anything. This register is where a referral lands, and it does not re-classify: the just-culture review is a declared reference on the case.',
    'Limitation accrual: under ADR-0248 the claim register derives a limitation period from an accrual day. For an employment claim that accrual is the effective date of termination, which this register records — so a dismissal decision here is the date the clock starts, and no claim module has to guess it.',
    'Bulletproof record integrity: no state, finding, sanction or appeal outcome is stored. Every one is re-derived on read from dated acts, and the two claims are printed apart — the acts the procedure requires are on the record, and nobody can be made whole by a ledger.',
  ]),
  printed: Object.freeze([
    'The case kind, the written allegation(s) with their class, the written standard each one is tested against, and the evidence reference cited for each.',
    'The standard of proof declared at opening, printed on every finding, with a refusal when a finding carries any other standard.',
    'The investigator actually assigned, the independence verdict computed from the live graph (which party it holds, if any), and the seniority verdict against the subject.',
    'Every written finding with its day, its written conclusion and its own standard; findings owed per allegation, counted rather than assumed.',
    'The sanction decision with the chosen rung, the computed rung from the ladder, the exact rank departure and its written reason, and the previous live sanctions of the same class.',
    'Any appeal: who lodged it and when, the declared grounds, and a decision by a different strictly senior hand that may differ from the decision below — both are printed, neither replaces the other.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No investigation: no interview scheduling, no evidence collection, no witness statements, no document store and no note-taking.',
    'No statutory procedure of any jurisdiction: no ACAS timetable, no statutory minimum, no presumed warning expiry period, and no claim of legal compliance.',
    'No finding inferred from text, no sentiment analysis, no automatic sanction, no score on any person, and no ranking of managers by how often they decide.',
    'No pay, pension or benefit calculation, no notice-pay computation, no settlement negotiation (that is the claim register’s instrument), and no redundancy selection.',
    'No authentication: seats are workflow declarations. Independence and seniority are computed graph properties printed on the screen, not a security boundary.',
    'No double jeopardy implied and none newly created: a revised finding needs a new case with a declared reference to the old one, and this register does not “re-open” a decided case.',
  ]),
});

/** A flat list of every collection this register owns. */
export const DGI_COLLECTIONS = Object.freeze([
  'dgiCases',
  'dgiAllegations',
  'dgiInvestigators',
  'dgiDirections',
  'dgiFindings',
  'dgiDecisions',
  'dgiAppeals',
  'dgiAppealOutcomes',
  'dgiWithdrawals',
  'dgiMarkers',
]);
