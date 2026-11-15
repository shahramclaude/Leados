/**
 * app/core/domain/conflictRecusalRegistry.js — the closed vocabulary of the
 * Decision-Maker Conflict-of-Interest & Recusal Ledger (ADR-0210, Session 279,
 * Schema v164, `RULE-CIR-01`, CSV scope #152, `#/recusal`).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. A director ratifies an investment case for
 * a supplier their brother-in-law owns. A VP approves a promotion packet for
 * the person who reports to them on a project line and to nobody else. A
 * manager signs off the chargeback that prices their own team's work. In every
 * one of those the record is complete, the arithmetic is right, the authority
 * resolves — and the decision is void as a matter of governance, because the
 * hand that approved it also holds the interest. The workspace already reads
 * WHETHER a seat holds the right to sign (ADR-0174), whether two hands are one
 * person (ADR-0170) and whether a decision still stands under today's
 * structure (ADR-0156). It could not record that a decision-maker had a stake
 * in the outcome, and it had no way to say that they stood back.
 *
 * Before this ledger, `sodRegisterRegistry.js` prints the absence itself: "the
 * workspace stores no interest declaration and no approval chain."
 *
 * WHAT IS RECORDED. Three dated human statements, and nothing derived:
 *   - an INTEREST: one person, the relationship that creates it, the record it
 *     touches (a decision, a case, a requisition, a budget, a person's pay), the
 *     direction of the interest, and when it became known;
 *   - a STANDING-BACK act: a declared recusal (the person withdraws from the
 *     decision), or a declared MITIGATION (the person stays and a named,
 *     written control stands in for their independence), or a declared NO
 *     CONFLICT (a written determination that the interest does not touch the
 *     record's independence) — each with its authoriser and its day;
 *   - a RULE, declared by a director-altitude seat with its written source:
 *     which relationship kinds are reportable at all, and the latency after
 *     which an undeclared interest that had to be raised late reads as late.
 *
 * WHAT IS REFUSED. Silence is not independence. A decision-maker reads
 * `independent` only where every relationship KIND a rule declares reportable
 * was actually ASKED of them and answered for that record — an interest nobody
 * searched for is not the same fact as no interest, and this ledger keeps those
 * two apart in every state. A recusal is only `effective` where the record's
 * approver no longer holds the right; where the structure still routes the
 * decision to the recused seat, the recusal reads `ineffective` and says so,
 * because a declared withdrawal that leaves the same hand on the signature is
 * the exact failure this ledger exists to expose.
 *
 * MATRIX. A person's interest is read against every reporting line they hold,
 * and a conflict on a record owned across two lines is never charged to one of
 * them — it is owed to the lowest seat above both (`matrixJointApex`), and
 * where those lines share no single seat the ambiguity is NAMED, never resolved
 * by picking a manager. A person is counted once per record however many lines
 * reach them.
 *
 * WHAT IT NEVER DOES. It never infers an interest from a shared surname, a
 * shared line, a purchase or a calendar. It never blocks a decision, revokes a
 * right, rewrites an approver or substitutes one person for another. It never
 * scores, ranks or rates anybody. A mitigation is printed as a claim its
 * authoriser made, never as proof that independence was achieved.
 */

export const CONFLICT_RECUSAL_ENGINE_VERSION = 'conflict-recusal-2026.11-v1';
export const CONFLICT_RECUSAL_ADR = 'ADR-0210';
export const CONFLICT_RECUSAL_RULE_ID = 'RULE-CIR-01';
export const CONFLICT_RECUSAL_ROUTE = 'recusal';
export const CONFLICT_RECUSAL_HREF = '#/recusal';
export const CONFLICT_RECUSAL_CSV_SCOPE = 'conflict-recusal';
export const CONFLICT_RECUSAL_MARKER_KIND = 'conflict-recusal';

export const CONFLICT_RECUSAL_EVENTS = Object.freeze({
  INTEREST_DECLARED: 'conflictRecusal.interest.declared',
  INTEREST_WITHDRAWN: 'conflictRecusal.interest.withdrawn',
  STANDING_RECORDED: 'conflictRecusal.standing.recorded',
  NONE_DECLARED: 'conflictRecusal.none.declared',
  NONE_WITHDRAWN: 'conflictRecusal.none.withdrawn',
  RULE_DECLARED: 'conflictRecusal.rule.declared',
  RULE_RETIRED: 'conflictRecusal.rule.retired',
  CONVENTIONS: 'conflictRecusal.conventions.set',
  SCAN: 'conflictRecusal.scan',
});
export const CONFLICT_RECUSAL_EVENT_PREFIX = 'conflictRecusal.';

/**
 * Reading is open at every altitude and scoped by the reader. DECLARING an
 * interest is a first-person act: a person declares their own stake, and a
 * seat may record one on behalf of a person it holds in its tree (the
 * disclosure that arrives in a conversation rather than in a form) — printed
 * as such, never as the person's own statement. DECIDING how the interest is
 * handled (recuse / mitigate / no conflict) is the act of a seat ABOVE the
 * person, never the person themselves. Declaring which relationship kinds are
 * reportable is governance and starts at the director altitude.
 */
export const CONFLICT_RECUSAL_RIGHTS = Object.freeze({
  READ: 'read-conflict-recusal',
  DECLARE: 'declare-conflict-interest',
  DECIDE: 'decide-conflict-standing',
  GOVERN: 'govern-conflict-recusal',
});

export const CONFLICT_RECUSAL_LIMITS = Object.freeze({
  /** Declared interests kept. Append-only; a withdrawal is its own dated row. */
  interests: 4000,
  /** Standing records (recuse / mitigate / no-conflict) kept across every interest. */
  standings: 4000,
  standingsPerInterest: 8,
  /** Declarations of NO reportable interest kept. Append-only; a withdrawal is its own row. */
  declarations: 4000,
  rules: 40,
  kindsPerRule: 24,
  markers: 400,
  titleMin: 8,
  titleMax: 160,
  reasonMin: 8,
  reasonMax: 600,
  sourceMin: 4,
  sourceMax: 200,
  /** A declared recusal or mitigation expires unless re-affirmed. */
  standingMaxDays: 730,
  /** How far back the register reads declared interests and standings. */
  backDaysMax: 3650,
  rowsShown: 80,
  asksPerCommit: 4,
});

export const CONFLICT_RECUSAL_SETTING_KEYS = Object.freeze({
  backDays: 'conflictRecusalBackDays',
  lateDays: 'conflictRecusalLateDays',
  autoPropagate: 'conflictRecusalAutoPropagate',
});
export const CONFLICT_RECUSAL_DEFAULTS = Object.freeze({ backDays: 365, lateDays: 30, autoPropagate: true });
export const CONFLICT_RECUSAL_BOUNDS = Object.freeze({
  backDays: Object.freeze([30, 3650]),
  lateDays: Object.freeze([1, 365]),
});
export const CONFLICT_RECUSAL_SETTING_LABELS = Object.freeze({
  backDays: 'Days of declared history read behind today',
  lateDays: 'Days after a record is made that an interest declared later reads as late',
  autoPropagate: 'Conflict-of-interest escalation automation (RULE-CIR-01)',
});

/* ------------------------------------------------------------ vocabularies */

/**
 * The relationship kinds, drawn from the reportable-conflict categories
 * governance codes actually enumerate rather than invented here: the OECD
 * Guidelines for Managing Conflict of Interest in the Public Service (2003)
 * §§8–12 and the COSO 2013 control-environment principle 3 distinguish a
 * FINANCIAL interest, a FAMILY or close-personal relationship, a REPORTING-LINE
 * (a second managerial line that shares the decision), an EXTERNAL-EMPLOYMENT
 * or board seat, a GIFT or hospitality, and a PREVIOUS-EMPLOYMENT / future-
 * employment pipeline. Each declares a DIRECTION: a stake the person already
 * holds (`held`), one they are seeking (`sought`), or one that exists because
 * of the structure rather than their own doing (`structural` — the reporting-
 * line case, where the second manager is not at fault but is still not
 * independent).
 */
export const CONFLICT_RELATIONSHIPS = Object.freeze([
  Object.freeze({
    key: 'financial',
    label: 'Financial interest in the outcome',
    says: 'The decision-maker, or a person they are related to, holds or will hold money whose value the decision moves: shareholding, an ownership stake, a commission, a supplier royalty.',
    defaultDirection: 'held',
  }),
  Object.freeze({
    key: 'family',
    label: 'Family or close-personal relationship',
    says: 'A relative or a close personal relationship with a person the decision directly affects — a candidate, a subject of a review, the owner of a case or the counterparty.',
    defaultDirection: 'held',
  }),
  Object.freeze({
    key: 'reporting-line',
    label: 'A second managerial line on the subject',
    says: 'The decision-maker already holds a declared reporting line over the person the decision is about, so the decision reads their own subordinate. This interest is structural: nobody did anything wrong, and the hand is still not independent.',
    defaultDirection: 'structural',
  }),
  Object.freeze({
    key: 'external-employment',
    label: 'External employment, office or board seat',
    says: 'The decision-maker holds an office, directorship or employment that the decision benefits or burdens: a paid role, a board seat, an advisory position.',
    defaultDirection: 'held',
  }),
  Object.freeze({
    key: 'gift',
    label: 'Gift, hospitality or benefit received',
    says: 'A gift, hospitality or benefit received or promised from a party the decision affects, whether or not it was accepted.',
    defaultDirection: 'held',
  }),
  Object.freeze({
    key: 'employment-pipeline',
    label: 'Previous or prospective employment',
    says: 'The decision-maker is leaving for, has recently left, or is negotiating an arrangement with the party the decision benefits — the pipeline interest that makes a signature worth having.',
    defaultDirection: 'sought',
  }),
]);
export const CONFLICT_RELATIONSHIP_KEYS = Object.freeze(CONFLICT_RELATIONSHIPS.map((row) => row.key));
export const CONFLICT_RELATIONSHIP_BY_KEY = Object.freeze(Object.fromEntries(CONFLICT_RELATIONSHIPS.map((row) => [row.key, row])));

/** The direction of the stake — a fact of the declaration, never inferred from the kind. */
export const CONFLICT_DIRECTIONS = Object.freeze([
  Object.freeze({ key: 'held', label: 'Already held', says: 'The stake exists today.' }),
  Object.freeze({ key: 'sought', label: 'Sought', says: 'The stake is being pursued — an offer, a deal, an application.' }),
  Object.freeze({ key: 'structural', label: 'Structural', says: 'The interest exists because of the reporting structure itself. Nobody did anything wrong; the hand is still not independent.' }),
]);
export const CONFLICT_DIRECTION_KEYS = Object.freeze(CONFLICT_DIRECTIONS.map((row) => row.key));
export const CONFLICT_DIRECTION_BY_KEY = Object.freeze(Object.fromEntries(CONFLICT_DIRECTIONS.map((row) => [row.key, row])));

/**
 * The kinds of record an interest can touch. Each key is a stored collection
 * this workspace already holds; the register reads the record's OWN owner and
 * approver, so an interest is never attached to a record id nobody can open.
 */
export const CONFLICT_SUBJECTS = Object.freeze([
  Object.freeze({
    key: 'decision',
    label: 'A logged decision',
    collection: 'decisions',
    says: 'An entry in the decision log. Its DACI approver is the hand that signs, and every interest in it is read against that record.',
    ownerField: 'driver',
  }),
  Object.freeze({
    key: 'investment-case',
    label: 'An investment case',
    collection: 'investmentCases',
    says: 'A declared investment (ADR-0208). Its benefit owner is the person who promised the return; a ratification by an interested hand is the classic case.',
    ownerField: 'ownerId',
  }),
  Object.freeze({
    key: 'requisition',
    label: 'A hiring requisition',
    collection: 'requisitions',
    says: 'An open role. The interest is read against the candidates that role will hire and whoever holds the requisition.',
    ownerField: 'managerId',
  }),
  Object.freeze({
    key: 'budget',
    label: 'A budget envelope',
    collection: 'budgets',
    says: 'A spending envelope (ADR-0142). Its owner is whoever must account for the money.',
    ownerField: 'ownerId',
  }),
]);
export const CONFLICT_SUBJECT_KEYS = Object.freeze(CONFLICT_SUBJECTS.map((row) => row.key));
export const CONFLICT_SUBJECT_BY_KEY = Object.freeze(Object.fromEntries(CONFLICT_SUBJECTS.map((row) => [row.key, row])));

/**
 * The reasons a record's decision-maker is RELEVANT to an interest: the seat
 * that signs the record (`approver`), the person who raised it (`owner`), or a
 * seat holding a declared reporting line over the record's subject (`line`).
 * An interest is only ever joined to one of these three positions — never to
 * anybody who merely appears in the text.
 */
export const CONFLICT_POSITIONS = Object.freeze([
  Object.freeze({ key: 'approver', label: 'The hand that signs', says: 'The record names this person as its approver. An interested approver is the failure the ledger exists to find.' }),
  Object.freeze({ key: 'owner', label: 'The person who owns the record', says: 'The record names this person as its owner or driver.' }),
  Object.freeze({ key: 'line', label: 'A declared line over the subject', says: 'The interest is in a person, and this decision-maker holds one of that person’s reporting lines.' }),
]);
export const CONFLICT_POSITION_KEYS = Object.freeze(CONFLICT_POSITIONS.map((row) => row.key));
export const CONFLICT_POSITION_BY_KEY = Object.freeze(Object.fromEntries(CONFLICT_POSITIONS.map((row) => [row.key, row])));

/**
 * How an interest was DECLARED. A first-person declaration is the person's own
 * statement; a seat-recording is somebody else's disclosure, printed as such
 * and never promoted to a first-person statement. The distinction matters
 * because a disclosure by a manager about their subordinate is not the same
 * evidence as the subordinate's own filing, and the register never collapses
 * the two.
 */
export const CONFLICT_SOURCES = Object.freeze([
  Object.freeze({ key: 'self', label: 'Declared by the person themselves', says: 'A first-person declaration: this person recorded their own stake.' }),
  Object.freeze({ key: 'seat-recorded', label: 'Recorded by a seat above them', says: 'A manager recorded a stake on behalf of somebody in their tree — the disclosure that arrives in a conversation. It is never read as that person’s own statement.' }),
  Object.freeze({ key: 'operator', label: 'Recorded by the workspace leader', says: 'Recorded from the undeclared operator view, which is the workspace leader and nobody else.' }),
]);
export const CONFLICT_SOURCE_KEYS = Object.freeze(CONFLICT_SOURCES.map((row) => row.key));
export const CONFLICT_SOURCE_BY_KEY = Object.freeze(Object.fromEntries(CONFLICT_SOURCES.map((row) => [row.key, row])));

/**
 * The four standing acts, and the ONE distinction the whole ledger turns on:
 *   - `recuse`     — the person withdraws from the record. Effective only where
 *                    the record's own approver is no longer that person.
 *   - `mitigate`   — the person stays and a written control stands in. The
 *                    mitigation is a CLAIM its authoriser made; it is printed
 *                    beside the decision and never read as independence proven.
 *   - `no-conflict`— a written determination that the interest does not touch
 *                    the record. It must name its authoriser and say why.
 *   - `supersede`  — a later standing record of any of those three kinds
 *                    replaces an earlier one without erasing it. The earlier
 *                    row remains on the record with its own day.
 */
export const CONFLICT_STANDING_KINDS = Object.freeze([
  Object.freeze({
    key: 'recuse',
    label: 'Stand back from the record',
    says: 'The decision-maker withdraws. The ledger checks, on read, whether the record’s own approver is still that person: if it is, the recusal is INEFFECTIVE, because a declared withdrawal that leaves the same hand on the signature protects nobody. A recusal needs no written control — its control is the absence of the hand — so the register does not demand one.',
    needsControl: false,
    needsAuthoriser: true,
  }),
  Object.freeze({
    key: 'mitigate',
    label: 'Stay, with a named control',
    says: 'The decision-maker stays and a written compensatory control stands in for their independence — a second signature, a monitoring review, a disclosed interest on the face of the record. The control is a claim its authoriser made; the ledger prints it as one and never as proof.',
    needsControl: true,
    needsAuthoriser: true,
  }),
  Object.freeze({
    key: 'no-conflict',
    label: 'Determined: no conflict',
    says: 'A written determination that the declared interest does not reach the record’s independence, with the reason on the record and a named authoriser. It is a human judgement, printed as one.',
    needsControl: false,
    needsAuthoriser: true,
  }),
  Object.freeze({
    key: 'supersede',
    label: 'Replaced by a later record',
    says: 'A later standing record replaces this one. Nothing is erased: the earlier row keeps its kind, its day and its authoriser, and the register prints the chain.',
    needsControl: false,
    needsAuthoriser: true,
  }),
]);
export const CONFLICT_STANDING_KIND_KEYS = Object.freeze(CONFLICT_STANDING_KINDS.map((row) => row.key));
export const CONFLICT_STANDING_KIND_BY_KEY = Object.freeze(Object.fromEntries(CONFLICT_STANDING_KINDS.map((row) => [row.key, row])));

/**
 * THE SEVEN VERDICTS, in closed rank order — worst first. Two claims that are
 * routinely collapsed are kept apart here: `undisclosed` (a reportable interest
 * exists and the workspace has no standing record of it) is a DIFFERENT fact
 * from `unsearched` (no rule asked, so nobody looked and no conclusion may be
 * drawn either way). A `mitigated` record is not `independent`: the control is
 * a claim, and the register says which one it is printing.
 */
export const CONFLICT_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'undisclosed',
    rank: 1,
    tone: 'bad',
    label: 'Undisclosed interest',
    says: 'A reportable interest is declared and no standing record — recusal, mitigation or determination — exists for it. The record is printed with the hand that holds it and no conclusion is drawn about the decision.',
  }),
  Object.freeze({
    key: 'ineffective',
    rank: 2,
    tone: 'bad',
    label: 'Recusal did not take the hand off',
    says: 'A recusal is declared, and the record’s own approver is still the recused person. Standing back on paper while the signature stays with the same hand is the failure this ledger exists to name.',
  }),
  Object.freeze({
    key: 'mitigated',
    rank: 3,
    tone: 'caution',
    label: 'Mitigated by a declared control',
    says: 'The person stayed and a written control is on the record. This is its authoriser’s claim, not proof of independence — the register never prints it as one.',
  }),
  Object.freeze({
    key: 'determined',
    rank: 4,
    tone: 'info',
    label: 'Determined no conflict',
    says: 'A named authoriser determined in writing that the interest does not reach the record. A human judgement on the record, printed as one.',
  }),
  Object.freeze({
    key: 'unsearched',
    rank: 5,
    tone: 'caution',
    label: 'Not searched',
    says: 'This person signs or owns the record, and nothing establishes what was asked of them: no live rule makes a kind reportable, or no declaration of no-interest covers every reportable kind. Nobody was asked, so no conclusion may be drawn — not independence, and not a conflict. Silence was never evidence either way.',
  }),
  Object.freeze({
    key: 'clean',
    rank: 6,
    tone: 'good',
    label: 'Declared clear, kind by kind',
    says: 'A dated first-person declaration states that this person holds NO reportable interest in this record, and it names every relationship kind a live rule makes reportable at their altitude. This is the only state that reads as independent, and it prints how many kinds it covered and the day it was signed.',
  }),
  Object.freeze({
    key: 'withdrawn',
    rank: 7,
    tone: 'neutral',
    label: 'Interest withdrawn by its declarer',
    says: 'The interest was withdrawn by a dated act. The row remains on the record; it is read as no longer in force and never deleted.',
  }),
]);
export const CONFLICT_VERDICT_KEYS = Object.freeze(CONFLICT_VERDICTS.map((row) => row.key));
export const CONFLICT_VERDICT_BY_KEY = Object.freeze(Object.fromEntries(CONFLICT_VERDICTS.map((row) => [row.key, row])));

/** How a declaration reached the register late. */
export const CONFLICT_LATENESS = Object.freeze([
  Object.freeze({ key: 'in-time', says: 'Declared before the record was made, or within the declared latency after it.' }),
  Object.freeze({ key: 'late', says: 'Declared after the record and beyond the declared latency. It counts — a late disclosure is still a disclosure — and it is printed with the days it took.' }),
]);
export const CONFLICT_LATENESS_KEYS = Object.freeze(CONFLICT_LATENESS.map((row) => row.key));

/** Who owes the handling of an interest, and why nobody was asked when nobody is. */
export const CONFLICT_OWNER_STATES = Object.freeze([
  Object.freeze({ key: 'seat', says: 'A roster seat above the person holds it and is asked.' }),
  Object.freeze({ key: 'leader-held', says: 'The only seat above the person is the workspace leader. It is printed on the leader’s own board; no delegation is filed.' }),
  Object.freeze({ key: 'ambiguous', says: 'The person’s lines share no single seat above them, or the person is the top of their own tree. The interest is printed and no owner is invented.' }),
  Object.freeze({ key: 'off-roster', says: 'The person who holds the interest, or the seat that would handle it, has left the active roster. Nobody is substituted.' }),
  Object.freeze({ key: 'self', says: 'The person holding the interest is the only seat above themselves. The ledger prints the interest and cannot ask the hand it names to judge itself.' }),
]);
export const CONFLICT_OWNER_STATE_BY_KEY = Object.freeze(Object.fromEntries(CONFLICT_OWNER_STATES.map((row) => [row.key, row])));

/** The one condition `RULE-CIR-01` acts on. Nothing else is escalated. */
export const CONFLICT_RULE_CONDITIONS = Object.freeze([
  Object.freeze({
    key: 'unhandled',
    label: 'A reportable interest with no standing record',
    says: 'A declared interest is in force and nobody has recorded a recusal, a mitigation or a determination for it. The seat above the person decides which — never the person themselves.',
  }),
]);

/* --------------------------------------------------------------------- CSV */

/**
 * CSV scope #152. One workspace row, one row per declared rule and one row per
 * person under an opaque positional code. No person, no manager, no record id,
 * no title, no reason and no source text. A figure that cannot be claimed
 * exports BLANK with its reason, never zero.
 */
export const CONFLICT_RECUSAL_CSV_COLUMNS = Object.freeze([
  'row_type', 'key', 'generated_on', 'as_of',
  'people_n', 'interests_n', 'standings_n', 'rules_n', 'records_n', 'positions_n', 'declarations_n',
  'undisclosed_n', 'ineffective_n', 'mitigated_n', 'determined_n',
  'unsearched_n', 'clean_n', 'withdrawn_n',
  'verdicts_reconcile', 'reportable_kinds_n', 'rule_covered',
  'late_n', 'on_time_n', 'structural_n', 'sought_n', 'held_n',
  'records_with_interest_n', 'approver_position_n', 'owner_position_n', 'line_position_n',
  'interest_kinds', 'standing_kinds', 'cross_line_n',
  'back_days', 'late_days',
  'balances', 'audit_clean', 'claim_reason', 'engine_version',
]);

export const CONFLICT_RECUSAL_CSV_DESCRIPTOR = Object.freeze({
  key: CONFLICT_RECUSAL_CSV_SCOPE,
  label: 'Decision-maker conflict-of-interest & recusal register (identity-free)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'conflict-recusal',
  description: 'One identity-free workspace row, one row per declared rule and one row per person under an opaque positional code: how many records an interest was read against, the seven verdicts kept apart — undisclosed, ineffective, mitigated, determined, unsearched, clean, withdrawn — how many declarations arrived late, the relationship kinds and positions involved, whether the counted verdicts reconcile with the interests read, and how many reportable kinds the declared rules cover. No person, manager, record id, title, reason or control text is exported; a figure that cannot be claimed is blank with its reason, never zero.',
});

/* ------------------------------------------------------------------ method */

export const CONFLICT_RECUSAL_FRAMEWORKS = Object.freeze([
  Object.freeze({
    key: 'oecd',
    label: 'OECD, Guidelines for Managing Conflict of Interest in the Public Service (2003), §4 and §10 — a conflict is a SITUATION, not a verdict on the person',
    says: 'The Guidelines draw the line the register is built on: a conflict of interest is a situation in which a public or organisational decision-maker has a private or personal interest that could improperly influence the decision. It is a fact about the situation, not a finding of misconduct. That is why every state here describes the RECORD and none describes the person.',
  }),
  Object.freeze({
    key: 'coso',
    label: 'COSO Internal Control — 2013 Framework, principle 3 (demonstrates commitment to integrity and ethical values) with the classic segregation-of-duties control',
    says: 'A control environment is demonstrated, not declared: the standard test is whether a person can approve what they also benefit from. Segregation of duties names the same failure from the other side — two incompatible duties on one hand. This register reads a decision-maker’s declared interest against the record they sign, which is the governance half of the control SoD reads structurally.',
  }),
  Object.freeze({
    key: 'oecd-integrity',
    label: 'Disclosure is the control; a late disclosure is still a disclosure',
    says: 'The Guidelines’ own instruction is that disclosure precedes the decision and is a condition of holding the post, not a favour. A disclosure made after the fact is admitted here — refusing it would only move it back into silence — and it is printed with the days it took. Nothing is softened and nothing is erased.',
  }),
  Object.freeze({
    key: 'recusal-effectiveness',
    label: 'A recusal is a COMPOSITION control: it only protects if the hand actually leaves',
    says: 'Standing back is only meaningful if the decision can be carried without you. The register therefore checks every recusal against the record’s own approver: a declared withdrawal that leaves the same hand on the signature is printed `ineffective`, because the alternative is a comfortable record of a control that never once acted.',
  }),
  Object.freeze({
    key: 'mitigation-claim',
    label: 'A compensating control is an ASSERTION, printed with its authoriser',
    says: 'A mitigation stands in for independence, so its strength is entirely the standing of the hand that declared it and the specificity of the control it names. The register stores both and prints both; it never converts either into proof of independence, and `mitigated` is never reported as `clean`.',
  }),
  Object.freeze({
    key: 'open-world',
    label: 'Open-world reading — “nobody searched” and “nothing found” are different facts',
    says: 'A record where every reportable kind was asked and nothing was declared is `clean`. A record where no rule asked anything is `unsearched`, and no conclusion is drawn: an unasked question is not a clean answer. Collapsing those two into one reassuring word is the failure mode this state exists to prevent.',
  }),
  Object.freeze({
    key: 'common-agency',
    label: 'Common agency (Bernheim & Whinston 1986) and matrix multi-principal governance',
    says: 'When one person answers to several managers, the line whose decision benefits a colleague’s subordinate is the line that is not independent. A conflict on a record owned across two lines is owed to the lowest seat above BOTH and never charged to whichever line happened to raise it.',
  }),
]);

/**
 * The one act that makes independence CLAIMABLE. A person who signs a record
 * declares, in their own words and on their own day, that they hold no
 * reportable interest in it — naming the kinds. Without it the register prints
 * `unsearched`, because "we found nothing" and "nobody looked" are different
 * facts and only one of them is reassuring.
 */
export const CONFLICT_NONE_DECLARATION = Object.freeze({
  key: 'none',
  label: 'Declare no reportable interest',
  says: 'A dated first-person statement that the signer or owner of a record holds no reportable interest in it, naming the relationship kinds it covers. Where it covers every kind a live rule makes reportable at that person’s altitude, the record reads `clean` and prints the day and the count. Where it covers fewer, the register prints exactly which kinds remain unasked.',
});

export const CONFLICT_RECUSAL_METHOD = Object.freeze({
  unit: 'One interest = one person × one relationship kind × one direction × the record it touches (a decision, an investment case, a requisition or a budget envelope) × the day it became known. It is declared whole or not at all.',
  join: 'An interest joins the record it names, and only through the record’s own stored fields: the decision log’s DACI approver and driver, an investment case’s benefit owner, a requisition’s manager, a budget’s owner. Names are resolved to roster people by exact match; an ambiguous name resolves to nobody and is counted, never guessed.',
  positions: 'The interested person is read against three positions only — the hand that signs the record, the person who owns it, and a declared line held over its subject. Anybody else who appears in the text of a record is never joined.',
  coverage: 'The register reads every record it can and asks who signs it and who owns it. Each of those people is one coverage row. A row reads `clean` only where a dated no-interest declaration covers EVERY relationship kind a live rule makes reportable at that person’s altitude — and it prints the kinds and the day. Where no rule is live, or where a declaration covers fewer kinds than the rules ask for, the row reads `unsearched` and names what remains unasked. "Nothing found" is never printed as "nothing there".',
  standing: 'A recusal, a mitigation or a no-conflict determination is one dated act by one named authoriser, and a later act supersedes an earlier one without erasing it. Superseded rows keep their day and their authoriser and stay on the record.',
  effectiveness: 'A recusal is checked against the record, not against the declaration: where the record’s approver is still the recused person the state is `ineffective`, whatever the declaration says. Where the approver moved away, the recusal reads effective and the ledger prints the day it took hold.',
  lateness: 'A declaration is late when it is dated more than the declared number of days after the record was made. It is still a declaration, it is still counted, and the days it took are printed beside it.',
  matrix: 'A person with several reporting lines is one person: their interests are read once against each record, and they are counted once in every span however many lines reach it. A conflict on a record owned across lines is owed to the lowest seat above both, never to one of them, and where no single seat exists the ambiguity is named rather than resolved.',
  refusal: 'No interest is inferred from a surname, a shared line, a purchase, a calendar or a pattern. No rule means no search and `unsearched`, never `clean`. No standing record means `undisclosed`, never an assumption that somebody must have dealt with it. A mitigation is never printed as independence. Each refusal prints its own sentence; none prints a zero.',
  notSaid: 'Nothing here finds misconduct, rates a person or predicts that a decision was wrongly taken. It records a declared stake, a dated response to it, and whether the response actually moved the hand — and it says when it cannot tell.',
});

export const CONFLICT_RECUSAL_ASK_PREFIX = 'Conflict of interest: ';
export const CONFLICT_RECUSAL_CLOSED_PREFIX = `Closed by ${CONFLICT_RECUSAL_RULE_ID}:`;
