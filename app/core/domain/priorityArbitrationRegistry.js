/**
 * app/core/domain/priorityArbitrationRegistry.js — the declared vocabulary of
 * the Cross-Line Priority Arbitration (ADR-0143, Schema v120, `#/arbitration`).
 *
 * THE DUTY. Session 189 gave the matrix a register of WHO is accountable to
 * whom and for what share of a person. Session 193 made a manager who holds
 * people only through a declared line able to read the envelope those people
 * carry. Neither answered the question every matrix manager actually loses sleep
 * over, which no ledger in this product could phrase:
 *
 *   "My functional manager has assigned me a release blocker. My project manager
 *    has assigned me a dated deliverable. Both are due this week. I have one week.
 *    WHO DECIDES WHAT I DO FIRST — and is that decision written anywhere?"
 *
 * That question cannot be answered by a tree, because a tree has exactly one
 * answer to "who is your manager". It cannot be answered by the share ledger
 * either: a 40% allocation is a statement about capacity, not a precedence
 * between two named demands. And it cannot be answered by an engine that simply
 * picks one, because picking one is a decision the system is not entitled to
 * make on behalf of two managers who disagree.
 *
 * So the missing artefact is a NEGOTIATED, DATED, ENFORCEABLE AGREEMENT between
 * the lines: freeze the competing demands and the capacity evidence, compare the
 * options on cost of delay (WSJF), record the precedence that was AGREED, its
 * effective window, when it will be revisited, and any dissent — then fan the
 * resulting obligations through the same event and matrix roll-up spine every
 * other module uses.
 *
 * WHAT THIS REGISTRY DECLARES, AND WHY NOTHING HERE IS DERIVED
 * -----------------------------------------------------------
 * A panel, a CSV column and a rule must never disagree about what a word means.
 * Everything below is a constant imported by all three. Nothing is a total, a
 * score or a verdict: totals and verdicts are re-derived on read from the stored
 * rows, so the printed figure cannot drift from the stored fact.
 *
 * ALL COST-OF-DELAY VALUES ARE INTEGERS whose unit is DECLARED and PRINTED on
 * every panel and in every export. No currency symbol, no conversion, no
 * floating point. The same discipline as the matrix ledger's integer hundredths:
 * an arithmetic claim a leader will act on is not allowed to be off by a
 * rounding error it cannot show.
 */

export const PRIORITY_ENGINE_VERSION = 'priority-arbitration-2026.11-v1';

/** The declared events. Each is one human act, or one consequence of one. */
export const PRIORITY_EVENTS = Object.freeze({
  OPEN: 'arbitration.opened',
  PROPOSE: 'arbitration.proposed',
  AGREE: 'arbitration.agreed',
  DISSENT: 'arbitration.dissent',
  WITHDRAW: 'arbitration.withdrawn',
  CONVENTIONS: 'arbitration.conventions.set',
});

/**
 * The lifecycle states of ONE arbitration case.
 *
 *   open      demands are frozen; no precedence has been proposed yet.
 *   proposed  a recommendation was recorded from the measured scores. It binds
 *             NOBODY: the panel prints `proposed` and the obligations stay
 *             unissued, because a recommendation nobody accepted is not an
 *             agreement and pretending otherwise is the exact failure this
 *             module exists to prevent.
 *   agreed    the arbiter recorded the precedence. THIS is the only state in
 *             which obligations are fanned to the lines and the person.
 *   withdrawn the case was abandoned with a reason, append-only. Nothing was
 *             agreed, so nothing is owed, and the rows stay readable.
 *
 * The state is NOT stored as a field that a render can move; it is re-derived on
 * read from the recorded acts (see `priorityState`), so a hand-edited file
 * cannot promote a proposal into an agreement.
 */
export const PRIORITY_STATES = Object.freeze({
  open: 'open',
  proposed: 'proposed',
  agreed: 'agreed',
  withdrawn: 'withdrawn',
});

export const PRIORITY_STATE_LABELS = Object.freeze({
  open: 'Open — demands frozen, no precedence proposed',
  proposed: 'Proposed — recommended, binding on nobody',
  agreed: 'Agreed — precedence recorded and fanned out',
  withdrawn: 'Withdrawn — nothing agreed, nothing owed',
});

/**
 * How a manager disposes of a demand. A demand is never deleted: the five
 * dispositions are the whole vocabulary of "what happened to this demand", and
 * the case cannot be agreed while any demand is still `pending` — an arbiter
 * who has not heard one of the two sides has not arbitrated.
 */
export const PRIORITY_DISPOSITIONS = Object.freeze([
  Object.freeze({ key: 'pending', label: 'Pending', hint: 'Nobody has said what happens to this demand yet. A case cannot be agreed while any demand is pending.' }),
  Object.freeze({ key: 'sequenced', label: 'Sequenced first', hint: 'This demand takes the person’s next available capacity inside the agreement window.' }),
  Object.freeze({ key: 'deferred', label: 'Deferred', hint: 'This demand waits, with a date it comes back and the reason it waited.' }),
  Object.freeze({ key: 'reshaped', label: 'Reshaped to fit', hint: 'This demand was cut down so it fits; the change of scope is recorded.' }),
  Object.freeze({ key: 'released', label: 'Released back to the line', hint: 'This line gives the demand up. The line that owns it keeps it, and the reason is recorded.' }),
]);

export const PRIORITY_DISPOSITION_KEYS = Object.freeze(PRIORITY_DISPOSITIONS.map((d) => d.key));

/**
 * The three comparison rules this module encodes, named from the literature it
 * applies rather than paraphrased. Printed on the Method panel verbatim.
 */
export const PRIORITY_METHOD = Object.freeze([
  {
    name: 'Weighted Shortest Job First / Cost of Delay (Reinertsen, 2009; the SAFe WSJF form)',
    why: 'Two managers disagreeing about precedence is a scheduling problem, not a loyalty problem. WSJF ranks by cost of delay divided by job size, which makes the trade-off explicit, comparable and arguable — the arbiter can see WHY one demand outranks the other instead of asserting it. The engine computes it in integer arithmetic and PRINTS the division it refused when the job size is absent, because WSJF without a size is a cost, not a ratio.',
  },
  {
    name: 'CCPM priority as a function of chain remaining (Goldratt, 1997)',
    why: 'A demand on a critical chain is not equivalent to a demand off it, however large its cost of delay. The remaining chain length is declared in whole days and used as an explicit multiplier in the rank, so a small blocker on the longest chain can outrank a large piece of work beside it.',
  },
  {
    name: 'Common-agency escalation cost (Bernheim & Whinston, 1986; Galbraith, 1971)',
    why: 'Where two principals hold one agent’s capacity, neither can settle the trade-off alone, so the decision has a real cost and a real owner above both lines. The arbiter is resolved as an exact minimal common ancestor in the reporting DAG; a diamond tie is printed as a tie, and the case names the ambiguity instead of electing one branch.',
  },
  {
    name: 'Coasean bargaining & Ostrom’s polycentric governance (Coase, 1960; Ostrom, 1990)',
    why: 'The two line holders are the parties who hold the information, so they propose; the arbiter ratifies. Dissent is recorded with the same weight as agreement, because an agreement that cannot carry a printed objection is a fiction the next escalation will disprove.',
  },
]);

/**
 * Declared numeric conventions. THE NUMBER IS THE PRODUCT: it is printed on
 * every panel, exported in every CSV, and re-declarable only by a rank-4+ full
 * access seat. Nothing here is fitted from the record.
 */
export const PRIORITY_FLOORS = Object.freeze({
  /**
   * A demand chain must have at least this many remaining days to be treated as
   * a critical chain. One day is not a chain, it is a date.
   */
  chainDays: 1,
  /**
   * A ranking is only printed when EVERY demand on the person carries a
   * complete score set. Below this completeness the case prints
   * `insufficient-evidence` and offers no recommendation at all — the refusal is
   * the product outcome, not a degraded one.
   */
  completeN: 2,
  /**
   * Above this seat rank a demand title and any person name are withheld from
   * the row: a demand by name is item detail, and a case is an instrument.
   */
  detailRank: 4,
});

export const PRIORITY_DEFAULTS = Object.freeze({
  /** Window the appended obligations must be met by, counted from agreement. */
  precedenceDays: 14,
  /** Days after agreement at which the precedence is due for review. */
  reviewDays: 30,
  /**
   * Share of the person's declared matrix capacity the sequenced demands may
   * claim before the agreement reads `over-committed`. 100 = the person.
   */
  capacityShareH: 100,
});

export const PRIORITY_BOUNDS = Object.freeze({
  precedenceDays: Object.freeze({ min: 1, max: 180, step: 1 }),
  reviewDays: Object.freeze({ min: 1, max: 365, step: 1 }),
  capacityShareH: Object.freeze({ min: 25, max: 200, step: 5 }),
});

export const PRIORITY_LIMITS = Object.freeze({
  /** Demands one case may freeze. The remainder is REFUSED with a reason. */
  demandsPerCase: 12,
  /** A demand title is item detail; clamped hard. */
  titleChars: 160,
  treatReasonChars: 200,
  noteChars: 1200,
  /** Cost-of-delay and job-size are integers in the declared unit. */
  valueMax: 100000,
  chainDaysMax: 365,
  /** Cases carried on the board before the rest are counted, never dropped. */
  boardCases: 20,
  /** Concluded cases kept in the read model; older ones are counted. */
  historyCases: 40,
  /** Append-only marker rows the rule keeps for idempotency. */
  markers: 300,
});

/** Named verdicts the read model prints in place of a league table. */
export const PRIORITY_VERDICTS = Object.freeze({
  clearFirst: 'clear-first',
  contested: 'contested',
  incomplete: 'incomplete',
  singleDemand: 'single-demand',
});

export const PRIORITY_VERDICT_LABELS = Object.freeze({
  'clear-first': 'One demand outranks every other on the frozen scores',
  contested: 'The top two demands are indistinguishable on the frozen scores',
  incomplete: 'At least one demand carries no complete score set — NO ranking is offered',
  'single-demand': 'Only one demand is in contention — nothing to arbitrate',
});

/** The typed edges this module writes, all by rule or by the recording action. */
export const PRIORITY_RELATIONS = Object.freeze({
  /** case → person whose capacity the case is about */
  about: 'concerns',
  /** case → the leadership ancestor it rolls up to */
  rollup: 'rolls-up-to',
  /** the governed decision the agreement opens */
  decision: 'decides',
  /** agreed case → the owned tasks it issued */
  issued: 'issues-obligation',
});

/**
 * The graph's node type. A case is a first-class node so the demands it froze,
 * the decision it opened and the obligations it issued are reachable from either
 * end without copying any record.
 */
export const PRIORITY_NODE_TYPE = 'arbitration';

export const PRIORITY_CSV_COLUMNS = Object.freeze([
  'row_kind', 'scope', 'altitude', 'case_state', 'demand_n', 'line_n', 'person_n',
  'contested_right_n', 'complete_n', 'incomplete_n', 'pending_n', 'sequenced_n',
  'deferred_n', 'reshaped_n', 'released_n', 'verdict', 'apex_state', 'apex_n',
  'window_from', 'window_to', 'review_on', 'days_to_review', 'dissent_n',
  'obligation_n', 'sequenced_capacity_h', 'capacity_limit_h', 'over_capacity',
  'ars_rank', 'ars_cod', 'ars_chain_days', 'ars_job_size', 'ars_state',
  'band', 'withheld', 'withheld_reason',
]);

export const PRIORITY_PANELS = Object.freeze([
  Object.freeze({ key: 'board', label: 'Board', hint: 'Every live arbitration in this span: frozen demands, the measured rank, and whether anything was actually agreed.' }),
  Object.freeze({ key: 'case', label: 'Case', hint: 'One case at a time: the frozen demands side by side, the measured scores, the recommendation, and the two acts that end it.' }),
  Object.freeze({ key: 'log', label: 'Log', hint: 'Concluded and withdrawn cases, append-only, with the reason each ended.' }),
  Object.freeze({ key: 'method', label: 'Method', hint: 'What is declared, what is derived, and what is refused — including the three conventions and their re-declaration gate.' }),
]);

export const PRIORITY_PANEL_KEYS = Object.freeze(PRIORITY_PANELS.map((p) => p.key));

/** Finding codes for the bounded attention queue, dispatched worst first. */
export const PRIORITY_FINDINGS = Object.freeze([
  { key: 'awaiting-agreement', label: 'A proposed precedence nobody has agreed' },
  { key: 'over-capacity', label: 'The agreement’s sequenced demands exceed the declared capacity' },
  { key: 'review-due', label: 'The agreed precedence is due for review' },
  { key: 'pending-demand', label: 'A frozen demand has no disposition' },
  { key: 'apex-ambiguous', label: 'The arbiter is a diamond tie in the reporting graph' },
  { key: 'incomplete-score', label: 'A demand carries no complete cost-of-delay set' },
  { key: 'no-dissent-recorded', label: 'An agreement recorded no party answer at all' },
  { key: 'open-case', label: 'A case still open with no precedence proposed' },
]);

export const PRIORITY_FINDING_KEYS = Object.freeze(PRIORITY_FINDINGS.map((f) => f.key));
const FINDING_RANK = new Map(PRIORITY_FINDINGS.map((f, i) => [f.key, i]));
export function priorityFindingRank(key) {
  const rank = FINDING_RANK.get(key);
  return typeof rank === 'number' ? rank : FINDING_RANK.size;
}
