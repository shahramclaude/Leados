/**
 * app/core/domain/hindsightRegistry.js — the Hindsight Lock
 * (`#/hindsight`, Schema v104, ADR-0102).
 *
 * THE QUESTION, AND WHY IT IS THE ONE NOBODY ANSWERS
 * -------------------------------------------------
 * This workspace grades outcomes everywhere. A decision review asks "did it
 * work?"; the calibration terminal asks "was your 70% right 70% of the time?";
 * the retrospective asks "what did we learn?". Every one of those questions is
 * asked AFTER the fact, by people who already know the answer, about a decision
 * record that can still be edited. That is the structure of hindsight bias, and
 * the workspace had no defence against it.
 *
 * Two failures follow, and both are expensive:
 *
 *   1. RESULTING (Duke, 2018; the error Kahneman calls outcome bias). A thin
 *      process that got lucky is read as skill, and the lesson learned is the
 *      wrong lesson. A sound process that met variance is read as failure, and
 *      the leader abandons a method that worked. Neither is visible from an
 *      outcome column, because the outcome column is all anyone stores.
 *   2. A MOVING INFORMATION SET. The decision record is edited after the fact —
 *      a rationale sharpened, an evidence link added, an option invented in
 *      retrospect — so the record no longer shows what was actually known when
 *      the call was made. Every "were we right?" reading over that record is
 *      then unfalsifiable: the population can be re-selected after the outcome
 *      is known. ADR-0094 refused that move for prospective contracts. Nothing
 *      refused it for ordinary decisions.
 *
 * THE MECHANISM
 * -------------
 * A LOCK. The moment a decision is committed, this module freezes the decision's
 * INFORMATION SET — every workspace record the shared link spine has tied to it
 * at that instant, with each record's own date — plus the decision's process
 * quality, computed from the record as it stood then. The lock is written once
 * and never rewritten. A later edit to the decision cannot change what it rests
 * on, because the lock already holds it.
 *
 * Because relevance is not invented here — it is exactly what the workspace's own
 * typed links say — the lock makes one measurement possible that no
 * people-analytics product in the reviewed set prints: partition everything the
 * decision is NOW understood to rest on into three sets, by date alone:
 *
 *   KNOWN          linked at decision time and dated on or before it
 *   KNOWABLE       dated on or before it but NOT linked then — the facts that
 *                  were on the record and were not consulted
 *   ARRIVED LATER  dated after the decision — nobody could have used them, and
 *                  they must never be held against the decision
 *
 * The share of the knowable set that was actually consulted is a coverage rate
 * with a Wilson (1927) interval, refused below a declared fact floor. On top of
 * that partition, each settled decision lands in one of four quadrants, and the
 * quadrant — not the outcome — is the thing a leader should be measured on:
 *
 *   EARNED    good process, good outcome     — the method worked
 *   RESULTED  thin process, good outcome     — luck, and the dangerous lesson
 *   VARIANCE  good process, bad outcome      — do not abandon the method
 *   FIXABLE   thin process, bad outcome      — the cheap lesson
 *
 * At workspace scale the module prints the RESULTING SHARE (the share of good
 * outcomes that came out of a thin process) with its interval, and tests the
 * association between process and outcome with Fisher's exact test — refused
 * below a declared settled floor, because at n=5 every pattern is "significant".
 * It never calls that association causal, and it never scores a person.
 *
 * MARKET POSITION (2026, from public snippets — benchmarks, not audited claims).
 * Decision-intelligence suites (Cloverpop, Aera, DecisionTools) store decisions
 * and their outcomes; OKR and performance suites store commitments and results;
 * people-analytics suites (Visier, Workday, Orgvue) grade outcomes and expose
 * "as-of" reporting for the ROSTER. None of the surveyed products freezes a
 * decision's information set at the moment of the call, prints what was knowable
 * and unconsulted, or separates luck from skill on the organisation's own dated
 * record. Decision-quality training sells the 2×2 on a whiteboard; no product in
 * the category computes it from the ledger. This is a gap claim, not a
 * market-first claim.
 *
 * WHAT THIS MODULE REFUSES TO DO
 * ------------------------------
 *  - It never re-scores a lock. The frozen information set and the frozen
 *    process quality are the claim; a later edit to the decision is measured
 *    AGAINST the lock, never written into it.
 *  - It never treats a record that arrived after the decision as a fact the
 *    decision missed. That is the whole point of the third partition.
 *  - It never infers relevance. Only typed links the rest of the workspace
 *    already wrote count as a relationship; a record nobody linked is not a fact
 *    this decision "should have had", and the module says so on the page.
 *  - It never rates, ranks or scores a person. The unit is the LOCK, the
 *    QUADRANT and the SPAN. Above director rank it prints counts by altitude.
 *  - It never prints a rate, a quadrant or a p-value its own floor refuses.
 *
 * Purity: vocabulary only, zero imports, so `schema.js`, the engine, the rules,
 * `csv.js` and the view share one canonical vocabulary.
 */

export const HINDSIGHT_ENGINE_VERSION = 'hindsight-lock-2026.11-v1';

/* ------------------------------------------------------------------ */
/* 1. Quadrants                                                        */
/* ------------------------------------------------------------------ */

/**
 * The four quadrants plus the honest fifth state. A decision whose information
 * axis cannot be measured is `unmeasured` — never silently promoted to a
 * process failure, and never silently counted as informed.
 */
export const HINDSIGHT_QUADRANTS = Object.freeze({
  earned: Object.freeze({
    key: 'earned',
    label: 'Earned',
    tone: 'good',
    meaning: 'A well-formed decision taken on a closed information set, and it worked. The method can be repeated.',
  }),
  resulted: Object.freeze({
    key: 'resulted',
    label: 'Resulted (luck)',
    tone: 'warn',
    meaning: 'The process was thin or the information set was open, and it worked anyway. This is the dangerous one: it teaches a lesson that will not survive the next decision. RULE-HND-02 opens one governed process review — the engine never grades the person.',
  }),
  variance: Object.freeze({
    key: 'variance',
    label: 'Variance (unlucky)',
    tone: 'neutral',
    meaning: 'A sound process and a closed information set, and it still did not work. Do not abandon the method on this evidence; the workspace has no basis for calling the call bad.',
  }),
  fixable: Object.freeze({
    key: 'fixable',
    label: 'Fixable',
    tone: 'bad',
    meaning: 'A thin process and a bad outcome. The cheapest lesson in the workspace: the repeatable defect is named on this screen, by requirement, and it can be fixed before the next decision.',
  }),
  unmeasured: Object.freeze({
    key: 'unmeasured',
    label: 'Unmeasured',
    tone: 'neutral',
    meaning: 'The information axis cannot be measured from the record — too few dated, typed links to this decision. The reason is printed; the decision is excluded from every rate and every test rather than assumed either way.',
  }),
});

export const HINDSIGHT_QUADRANT_KEYS = Object.freeze(Object.keys(HINDSIGHT_QUADRANTS));

/* ------------------------------------------------------------------ */
/* 2. Lock states and fact partitions                                  */
/* ------------------------------------------------------------------ */

export const HINDSIGHT_LOCK_STATES = Object.freeze({
  open: Object.freeze({ key: 'open', label: 'Undecided', tone: 'neutral', meaning: 'The decision record has no chosen option yet; the information set is frozen and waiting.' }),
  pending: Object.freeze({ key: 'pending', label: 'Decided, ungraded', tone: 'warn', meaning: 'A call was made. The outcome is not recorded yet, so no quadrant can be assigned.' }),
  settled: Object.freeze({ key: 'settled', label: 'Graded', tone: 'good', meaning: 'A call was made and its outcome is recorded. A quadrant is assigned from the frozen process claim and the live information set.' }),
});

/**
 * The three sets every currently-linked fact falls into. `known` and `missed`
 * are the only two that can enter the coverage rate; `later` is printed so a
 * reader can see the decision was not charged for the future.
 */
export const FACT_CLASSES = Object.freeze({
  known: Object.freeze({ key: 'known', label: 'Known at the time', meaning: 'Linked to the decision when it was locked, and dated on or before it.' }),
  missed: Object.freeze({ key: 'missed', label: 'Knowable, not consulted', meaning: 'Dated on or before the decision but not linked to it when it was locked. The workspace found this fact relevant afterwards — so it was on the record and the decision did not rest on it.' }),
  later: Object.freeze({ key: 'later', label: 'Arrived later', meaning: 'Dated after the decision. Nobody could have used it. It is excluded from coverage and from every rate.' }),
  undated: Object.freeze({ key: 'undated', label: 'Undated', meaning: 'A linked record whose own date the workspace cannot resolve. Excluded from coverage, because an undated fact cannot be placed on either side of the decision.' }),
});

export const FACT_CLASS_KEYS = Object.freeze(['known', 'missed', 'later', 'undated']);

/* ------------------------------------------------------------------ */
/* 3. Conventions (declared, clamped, printed)                         */
/* ------------------------------------------------------------------ */

export const HINDSIGHT_DEFAULTS = Object.freeze({
  // The recorded process quality (0–5, from the decision module's own six-free
  // `decisionQuality` bar) at or above which the process axis counts as sound.
  // A convention, printed beside every rate it produces.
  hindsightQualityFloor: 4,
  // The share of the knowable set a decision must have consulted to count as
  // informed. 60% is a convention, not a finding.
  hindsightCoveragePct: 60,
  // Below this many knowable facts, coverage is REFUSED: two of three is not a
  // rate, it is a coin toss with a decimal point.
  hindsightFactFloor: 3,
  // Missed-and-knowable facts at or above which a gap finding is worth opening.
  hindsightGapFloor: 2,
  // Below this many measured settled decisions, no resulting share, no p-value.
  hindsightSettledFloor: 8,
  // Small-cell floor for the per-span roll-up.
  hindsightCellFloor: 3,
  // Days after a decision's own review date before it counts as ungraded.
  hindsightReviewGraceDays: 14,
  hindsightAutoPropagate: true,
});

export const HINDSIGHT_LIMITS = Object.freeze({
  locks: 400,
  consultedPerLock: 40,
  markers: 1400,
  findingsPerPass: 3,
  qualityFloorMin: 2,
  qualityFloorMax: 5,
  coveragePctMin: 30,
  coveragePctMax: 95,
  factFloorMin: 2,
  factFloorMax: 10,
  gapFloorMin: 1,
  gapFloorMax: 10,
  settledFloorMin: 4,
  settledFloorMax: 40,
  cellFloorMin: 2,
  cellFloorMax: 10,
  reviewGraceMin: 0,
  reviewGraceMax: 90,
});

/* ------------------------------------------------------------------ */
/* 4. Events, rules, CSV                                               */
/* ------------------------------------------------------------------ */

export const HINDSIGHT_EVENTS = Object.freeze({
  LOCKED: 'hindsight.locked',
  SCAN: 'hindsight.scan',
  CONVENTIONS: 'hindsight.conventions',
});

export const HINDSIGHT_TRIGGER_PREFIX = 'hindsight.';

export const HINDSIGHT_RULE_IDS = Object.freeze({
  lock: 'RULE-HND-01',
  resulted: 'RULE-HND-02',
  gap: 'RULE-HND-03',
  ungraded: 'RULE-HND-04',
});

/** Record kinds that are actors or provenance, never a fact a decision rests on. */
export const HINDSIGHT_ACTOR_TYPES = Object.freeze(['person', 'hindsightlock']);

/**
 * Which field carries a record's own date, per linkable entity type. First
 * present field wins, so a rename degrades to `undated` (excluded and printed)
 * rather than to an invented date. Types not listed here are `undated` by
 * construction — the same fail-closed choice the disclosure manifests make.
 */
export const HINDSIGHT_DATE_FIELDS = Object.freeze({
  decision: ['decidedOn', 'date'],
  case: ['openedOn', 'createdOn', 'createdAt'],
  delegation: ['delegatedOn', 'createdOn', 'createdAt'],
  goal: ['createdOn', 'createdAt'],
  mandate: ['openedOn', 'createdAt'],
  premise: ['createdOn', 'createdAt'],
  budget: ['createdOn', 'createdAt'],
  oneonone: ['date'],
  feedback: ['date', 'observedOn'],
  negotiation: ['openedOn', 'createdAt'],
  stakeholder: ['createdAt'],
  requisition: ['openedOn', 'createdAt'],
  candidate: ['createdAt'],
  change: ['openedOn', 'createdAt'],
  conflict: ['openedOn'],
  review: ['openedOn', 'createdAt'],
  onboarding: ['startOn', 'createdAt'],
  performanceconcern: ['openedOn', 'createdAt'],
  commitment: ['createdOn', 'dueOn'],
  evidence: ['observedOn', 'createdAt'],
});

export const HINDSIGHT_CSV_SCOPE = Object.freeze({
  key: 'hindsight',
  label: 'Decision process audit (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'hindsight',
  description: 'One row per altitude × quadrant cell (lock counts, measured and unmeasured counts, suppressed cells blank), one row per process requirement (how many frozen decisions met it, and how many were missing it), one resulting-share row with its Wilson interval, one association-test row with the exact two-sided p-value, and one lock-state row. NO decision title, decision id, lock id, person, span id, fact id or date of any individual fact. A refused rate and a suppressed cell are BLANK rather than zero.',
});

export const HINDSIGHT_ROUTE_ALIASES = Object.freeze([
  'hindsight', 'decision-audit', 'process-audit', 'decision-lock', 'lock',
  'resulting', 'information-set', 'luck', 'were-we-right', 'hindsight-lock',
]);

export const HINDSIGHT_PANELS = Object.freeze([
  Object.freeze({ key: 'desk', label: 'Desk' }),
  Object.freeze({ key: 'locks', label: 'The locks' }),
  Object.freeze({ key: 'information', label: 'Information set' }),
  Object.freeze({ key: 'luck', label: 'Luck' }),
  Object.freeze({ key: 'rollup', label: 'Roll-up' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);

export const HINDSIGHT_PANEL_KEYS = Object.freeze(HINDSIGHT_PANELS.map((panel) => panel.key));

/* ------------------------------------------------------------------ */
/* 5. Altitude playbook                                                */
/* ------------------------------------------------------------------ */

/**
 * The same measurement at every altitude, five different jobs. A frontline lead
 * learns a method; a chief learns what share of the organisation's wins are
 * unprotected. Nobody is asked to answer a level's question from below it.
 */
export const HINDSIGHT_PLAYBOOK = Object.freeze({
  frontline: Object.freeze({
    title: 'Was I right, or was I lucky?',
    horizon: 'This week',
    question: 'Of the calls I made recently, which rested on facts that were on the record, and which rested on a guess I have since dressed up as a rationale?',
    see: 'Only your own locks, one decision at a time: what you consulted, what was on the record and unconsulted, and what arrived after you decided.',
    act: 'For one RESULTED call, write down the assumption that happened to hold — before the next decision reuses it. The lock already holds what you knew.',
    hand: 'Never a self-rating. If the same requirement is missing twice, that is a habit worth naming to your own manager.',
  }),
  manager: Object.freeze({
    title: 'Which of my teams decides on the full record?',
    horizon: '30–90 days',
    question: 'Where inside my span is a decision made without the facts the workspace already held — and is that the person, or the process they were given?',
    see: 'Per-child coverage and quadrant counts inside your own span; sibling detail is withheld and individual locks are never named above your own rank.',
    act: 'Fix the process, not the person: if alternatives are routinely missing, the record template is the defect. Coach the requirement, once.',
    hand: 'Counts and the named requirement, never a verdict on a name.',
  }),
  director: Object.freeze({
    title: 'Is our success explainable?',
    horizon: '90–180 days',
    question: 'What share of the good outcomes across my span came out of a thin process, within which interval, and does process actually associate with outcome here at all?',
    see: 'The resulting share with its Wilson interval, the exact association test with its refusal floor, and the per-altitude cells; peer spans are aggregates only.',
    act: 'Where the resulting share is high, treat the win as unearned and reset the method before the next cycle — or re-declare the conventions that define soundness.',
    hand: 'A bounded share, a named requirement, and an explicit statement of what the test cannot say.',
  }),
  exec: Object.freeze({
    title: 'How much of our record is luck?',
    horizon: '180–365 days',
    question: 'Across the span, do decisions with a closed information set actually do better — and is the answer a fact, or is the sample too small to say?',
    see: 'Aggregate quadrant counts by altitude, refused below the settled floor; complementary suppression on small cells; no span, person or decision.',
    act: 'Decide whether the organisation is rewarding outcomes it can repeat or outcomes it got away with.',
    hand: 'One share, one interval, one p-value, and the honest limit of each.',
  }),
  chief: Object.freeze({
    title: 'Enterprise decision hygiene',
    horizon: '365–730 days',
    question: 'Across every altitude, how many decisions are locked, how many were ever graded, and what share of the enterprise’s wins rests on a process this workspace cannot defend?',
    see: 'Counts by altitude and quadrant workspace-wide, the ungraded-lock count, and the direction of the resulting share across dated lock cohorts.',
    act: 'Record the enterprise convention: a decision above a declared materiality cannot be closed without a frozen information set.',
    hand: 'A dated, aggregate-only statement the board can read — with the refusal floor printed beside it.',
  }),
});

export const HINDSIGHT_DISCLOSURE = Object.freeze({
  lock: 'A lock is frozen once and never rewritten. A later edit to the decision is measured AGAINST the lock; it never changes what the decision rested on.',
  relevance: 'Relevance is not inferred. Only typed links the workspace already wrote count as a relationship, so a record nobody linked is never charged to the decision. The three-way partition is by date alone: known, knowable-and-unconsulted, arrived later.',
  refusal: 'Below the declared fact floor a coverage rate is REFUSED, not printed; below the settled floor no resulting share and no p-value are shown; a suppressed cell is BLANK, never zero. An unmeasured information axis is its own state, never a failure invented to fill a quadrant.',
  person: 'Nothing here rates, ranks or scores a person. The unit is the lock, the quadrant and the span; above director rank only counts by altitude are printed.',
  causality: 'Fisher’s exact test measures ASSOCIATION between recorded process and recorded outcome in this workspace. It is not evidence that a better process would have caused a better outcome, and the screen says so beside the p-value.',
  local: 'Operating seats are local workflow declarations, not authenticated multi-user security. A lock records who held the seat at freeze time, which is a record of the workflow — not proof of authorship.',
});

export const HINDSIGHT_PREMISE =
  'This screen freezes what you knew when you decided, then shows you what was knowable and unconsulted, what arrived later, and whether your wins were earned or merely survived — and it refuses to print a rate, a quadrant or a p-value its own floor cannot support.';
