/**
 * app/core/domain/jurisdictionRegistry.js — zero-import vocabulary for the
 * Jurisdiction Compiler (ADR-0109, Schema v111, `#/jurisdiction`).
 *
 * THE QUESTION NO PRODUCT IN THE CATEGORY ANSWERS
 * -----------------------------------------------
 * The 2025/26 enterprise tooling (Glean Work AI Institute / Workday People
 * Analytics; Visier workforce intelligence; Microsoft Viva Insights; Fractal /
 * C3.ai "autonomous decision intelligence") is very good at *connection
 * mapping*: unstructured data flowing into one system, cross-silo patterns,
 * a leader asking for a compiled brief and drilling into the source. The
 * Glean/Stanford finding is the interesting one, and nobody operationalised
 * it: "coordination troubles flared because no one had the MANDATE to act on
 * insights that crossed silos. These problems waned after leaders REDREW
 * ROLES — expanding managers' responsibilities to cover broader product lines."
 *
 * LeadOS already holds the two things needed to make that a computation: a
 * TYPED LINK GRAPH (which work belongs to which objective) and a REPORTING
 * TREE (`buildChain`, `lowestCommonAncestor`, `responsibleNodeId`). No other
 * module asks the governance question those two together answer:
 *
 *   "This objective is being worked by three different spans at three different
 *    altitudes. Which single seat, if any, can lawfully resolve ALL of it? If
 *    none below the lowest common ancestor can, what is the SMALLEST coalition
 *    of seats whose joint authority covers it, and is that cheaper than
 *    escalating the whole thing to the ancestor — or redrawing the boundary?"
 *
 * This is an ALLOCATION question (economics / political science / org design),
 * not a latency metric and not a sentiment score. The unit of analysis is the
 * CLUSTER and the BRANCH, never a person. Nothing here rates, ranks or names
 * a leader.
 *
 * Pure data and pure functions: no imports, no clock, no DOM, no storage.
 */

export const JUR_ENGINE_VERSION = 'jurisdiction-2026.11-v2';

/**
 * THREE GOVERNANCE ROUTES for a cross-span cluster. Deliberately exactly three:
 * a fourth ("ignore it") is the status quo the module exists to make visible,
 * not an option a tool should recommend.
 *
 * Named frameworks, implemented in `jurisdiction.js` rather than name-dropped:
 *  - Riker (1962) size principle: actors form a coalition just large enough to
 *    cover the work, no larger. `coalitionSize` is the MINIMAL antichain of
 *    branches below the LCA whose subtrees cover every span. A grand coalition
 *    (escalating everything to the chief) is the thing the size principle says
 *    a rational organisation avoids, and it is priced as an alternative, never
 *    as the default.
 *  - Coase (1937) transaction costs of organising across a boundary: each
 *    cross-branch handoff is a declared coordination cost; each rung escalated
 *    is a declared delay/attention cost; a boundary redraw is a declared
 *    one-off structural cost (Williamson 1975 governance choice).
 *  - Wilson (1927) score interval: the confidence attached to a priced
 *    recommendation is a lower bound on ATTRIBUTION COMPLETENESS (how much of
 *    the cluster the reporting tree can actually place), not on a person.
 *  - Brier (1950) proper scoring against a strictly-prior 0.5 base, applied
 *    once, out of sample, to the governance route the ledger predicted.
 *  - Ashby (1956) requisite variety, stated honestly: a single decider must
 *    hold variety at least equal to the number of branches it must reconcile.
 */
export const JUR_GOVERNANCE_OPTIONS = Object.freeze([
  Object.freeze({
    key: 'coalition',
    label: 'Minimal covering coalition',
    question: 'Which smallest set of branch seats jointly holds every span of this work?',
    note: 'Riker size principle: cover the work, no extra member. Costs one handoff per pair of branches, and no escalation of the decision itself.',
  }),
  Object.freeze({
    key: 'escalate',
    label: 'Escalate to the lowest common ancestor',
    question: 'What does it cost to hand the whole cluster to the one seat above all of its spans?',
    note: 'One decider, but the call climbs one rung per altitude of separation. Priced in declared attention/delay units, never in invented days.',
  }),
  Object.freeze({
    key: 'redraw',
    label: 'Redraw the reporting boundary',
    question: 'Is a one-off org-design change cheaper than paying these handoffs forever?',
    note: 'The Glean/Stanford remedy made computable. A declared one-off structural cost; it never moves a reporting line on its own — it opens a governed decision a human must accept.',
  }),
]);

export const JUR_OPTION_KEYS = Object.freeze(JUR_GOVERNANCE_OPTIONS.map((o) => o.key));

/**
 * Declared conventions. Every one is printed on the Method panel with its
 * bound, and NONE is fitted to data. A convention that could not be explained
 * to the leader whose work it prices would be a hidden policy.
 */
export const JUR_CONVENTION_DEFAULTS = Object.freeze({
  // A cluster with fewer member records than this is REFUSED, not priced.
  jurEvidenceFloorN: 3,
  // Below this share of resolvable spans, the cluster is REFUSED: pricing a
  // boundary for work the reporting tree cannot place would be a guess.
  jurAttributionFloorPct: 60,
  // Small-cell suppression above rank 2 (NOT differential privacy; a refusal).
  // Two is the smallest defensible cohort: a cell of ONE is withheld with its
  // printed reason. Declared and clamped, never fitted from the record.
  jurCellFloor: 2,
  // Coase: coordination units per cross-branch handoff pair. A coalition of k
  // branches carries k(k-1)/2 pairs — the interfaces, not the members.
  jurHandoffUnitsPerPair: 12,
  // Attention/delay units per rung climbed to the LCA above the highest span.
  jurEscalationUnitsPerRung: 9,
  // Williamson: a one-off boundary redraw is expensive and structural.
  jurRedrawUnits: 40,
  // The cheapest route is only RECOMMENDED when it beats the runner-up by this
  // share of the runner-up's cost. Below it, no route is decisive.
  jurMaterialityPct: 10,
  // A frozen reading must be graded inside this window.
  jurReviewDays: 21,
  // A cluster must have been visible this long before a governed decision opens.
  // Zero: the FIRST explicit scan may open the governed "who holds this?"
  // decision, because a cross-branch objective already on record has waited
  // long enough. This is a governed ASK, never an automatic boundary change.
  jurProposalAfterDays: 0,
  jurAutoPropagate: true,
  // ADR-0115: the cross-week drift reader. DECLARED, CLAMPED and PRINTED on the
  // existing Method panel; re-declarable by the existing full-access conventions
  // command, never fitted from the weekly record. A conformal band is refused
  // below `jurDriftMinWeeks` frozen ISO weeks; `jurDriftCoveragePct` is the
  // nominal marginal coverage and the achieved finite-sample bound k/(n+1) is
  // printed beside it. `jurDriftMaxWeeks` caps the look-back so a long-lived
  // workspace cannot let a pre-reorganisation era dominate the band.
  jurDriftMinWeeks: 4,
  jurDriftCoveragePct: 66,
  jurDriftMaxWeeks: 16,
});

export const JUR_CONVENTION_BOUNDS = Object.freeze({
  jurEvidenceFloorN: [2, 20],
  jurAttributionFloorPct: [20, 100],
  jurCellFloor: [1, 20],
  jurHandoffUnitsPerPair: [0, 100],
  jurEscalationUnitsPerRung: [0, 100],
  jurRedrawUnits: [0, 500],
  jurMaterialityPct: [1, 100],
  jurReviewDays: [7, 90],
  jurProposalAfterDays: [0, 60],
  jurDriftMinWeeks: [3, 12],
  jurDriftCoveragePct: [50, 90],
  jurDriftMaxWeeks: [4, 52],
});

/** A cap is a refusal to grow without bound, not a silent drop. */
export const JUR_LIMITS = Object.freeze({
  findings: 240,
  readings: 200,
  markers: 900,
  membersPerCluster: 12,
  objectivesCap: 60,
  hygieneRecords: 120,
  clustersPerPass: 3,
  clustersPerScan: 40,
  governedPerScan: 4,
  ancestorsCap: 16,
  branchesCap: 8,
  reasonChars: 360,
  labelChars: 120,
});

export const JUR_EVENTS = Object.freeze({
  SCAN: 'jur.scan',
  CONVENTIONS: 'jur.conventions',
  GOVERNED: 'jur.governed',
  ANCHOR: 'jur.anchor',
  // ADR-0115: explicit drift pass. Runs a full scan (so this week's readings
  // freeze) and then grades the cross-week series; unlike `jur.scan` it is the
  // named command a VP/chief presses when reviewing quarterly exposure.
  DRIFT: 'jur.drift',
});

/**
 * Only a ROOT work write may wake the automatic pass. Engine-derived events
 * (the ~89 other rules' governed decisions and provenance edges) must NOT: the
 * Session-143 second-order-decision regression is exactly a scan pricing the
 * engine's own audit output. Grades are derived and cheap; work is gated.
 */
export const JUR_WORK_EVENTS = Object.freeze([
  'case.created', 'case.updated', 'case.resolved', 'case.reopened',
  'decision.created', 'decision.updated', 'decision.reclassified',
  'portfolio.created', 'portfolio.updated', 'portfolio.funded',
  'goal.updated',
  'link.created',
]);

export const JUR_SETTLEMENT_EVENTS = Object.freeze([
  'decision.made', 'decision.decided', 'decision.reviewed', 'decision.withdrawn',
]);

export const JUR_RULE_IDS = Object.freeze({
  DETECT: 'RULE-JUR-01',
  GOVERN: 'RULE-JUR-02',
  GRADE: 'RULE-JUR-03',
  ROLLUP: 'RULE-JUR-04',
  DRIFT: 'RULE-JUR-05',
});

export const JUR_TRIGGER_PREFIX = 'jur.';

/**
 * The harvest. A "cluster" is the set of OPEN work records that name the SAME
 * OBJECTIVE, discovered from the record the workspace already holds — not from
 * a leader-entered grouping and not from a title keyword. Two records that
 * share a goal id are two teams working one objective; if their responsible
 * spans differ, that is the cross-silo fact the Glean study describes.
 *
 * `openWhen` is a declared predicate on a field value. `objectivePaths` is an
 * ordered list of candidate field paths, first non-empty wins. `people` is
 * resolved generically by `recordPeople` in the engine, so a new work source
 * plugs in with ONE row here, no new glue (Section 3's generalized engine).
 */
export const JUR_SOURCES = Object.freeze([
  Object.freeze({
    collection: 'cases',
    label: 'Operational case',
    entityType: 'case',
    objectivePaths: Object.freeze(['linkedGoalIds', 'linkedGoalId', 'goalId']),
    openField: 'status',
    closedValues: Object.freeze(['closed', 'resolved', 'cancelled', 'archived']),
    datePaths: Object.freeze(['createdOn', 'openedOn']),
  }),
  Object.freeze({
    collection: 'decisions',
    label: 'Open call',
    entityType: 'decision',
    objectivePaths: Object.freeze(['linkedGoalIds', 'linkedGoalId', 'goalId']),
    openField: 'chosen',
    openWhenEmpty: true,
    datePaths: Object.freeze(['date', 'createdOn']),
  }),
  Object.freeze({
    collection: 'portfolio',
    label: 'Funded work',
    entityType: 'portfolio',
    // A funded item points at its objective through sourceId when it is a goal.
    objectivePaths: Object.freeze(['sourceId']),
    objectiveRequires: Object.freeze({ field: 'sourceType', equals: 'goal' }),
    openField: 'decision',
    closedValues: Object.freeze(['stopped', 'cancelled', 'rejected']),
    datePaths: Object.freeze(['decisionOn', 'createdOn']),
  }),
]);

/** Relations that are provenance-only are never used to build a cluster. */
export const JUR_PANELS = Object.freeze([
  Object.freeze({ key: 'map', label: 'The map', note: 'Every cross-span objective: which branches hold it, and whether any one seat below the ancestor can resolve it whole.' }),
  Object.freeze({ key: 'hygiene', label: 'Pointer hygiene', note: 'Counted refusals for open work with no objective pointer or a dangling/dropped goal id — with span-scoped anchoring below the detail ceiling.' }),
  Object.freeze({ key: 'options', label: 'Governance options', note: 'Three priced routes per cluster — coalition, escalation, boundary redraw — with the arithmetic and every refusal printed.' }),
  Object.freeze({ key: 'redraw', label: 'Boundary rehearsal', note: 'A dry run of a proposed reporting-line move: which cross-branch objectives collapse, which rolls-up-to edges move and which unsettled governed decisions go stale. Nothing is written.' }),
  Object.freeze({ key: 'grades', label: 'Forecast grades', note: 'Each governance route the ledger predicted, graded once against the dated decision a human actually made.' }),
  Object.freeze({ key: 'drift', label: 'Cross-week drift', note: 'Is cross-branch exposure structurally changing, or is this ordinary week-to-week variation? A distribution-free conformal band over dated, identity-free span readings; refused below the declared week floor.' }),
  Object.freeze({ key: 'method', label: 'Method & refusals', note: 'Every declared convention, bound, framework and refusal this screen can print.' }),
]);

/** Printed verbatim beside a refused figure so a blank never looks like a zero. */
export const JUR_REFUSALS = Object.freeze({
  'thin-cluster': 'Too few work records name this objective to price a boundary decision. The cluster is counted, never priced.',
  'thin-attribution': 'Too little of this cluster can be placed in the reporting tree. Pricing a boundary for work nobody can be shown to own would be a guess.',
  'single-span': 'Every record in this cluster is held inside one branch. A single seat already has the mandate; there is no jurisdiction gap to price.',
  'no-lca': 'The reporting tree resolves no common ancestor for these spans. No governance route can be named without inventing authority.',
  'no-decisive-route': 'The two cheapest governance routes are within the declared materiality band. No route is recommended; the tie is printed, not broken silently.',
  'dangling-objective': 'Work record names a goal id that no longer exists or has been dropped. Counted as a dangling refusal and never priced as a live jurisdiction boundary.',
  'unanchored-work': 'Open work record carries no objective pointer and no impacts-goal link. Counted as an unanchored refusal rather than silently excluded (Heckman 1979 selection bias).',
  'thin-anchoring': 'Too few open work records exist in this scope to bound objective-anchoring completeness. The count is printed; the Wilson rate is refused.',
  'ungraded': 'The governed decision this finding opened has not settled. The predicted route stays ungraded — an absent outcome is never scored as a miss.',
  'postdated': 'The review that would grade this finding is dated before the finding was frozen, or carries no date. The grade is refused, never back-filled.',
  'suppressed': 'This cell is below the declared small-cell floor. It is withheld, not zero — suppression is not differential privacy and is labelled as such.',
  'drift-thin-series': 'Fewer frozen ISO-week readings than the declared week floor. A trend over two or three snapshots is a guess, so every band and verdict is refused.',
  'drift-no-readings': 'No identity-free span reading has been frozen in this scope. Run a jurisdiction scan in each ISO week to build a dated series; an unsampled week is never back-filled.',
  'drift-no-denominator': 'This week’s readings predate the objective denominator (older readings carry no objective count). The cross-branch SHARE is refused, never printed as 100% or zero; the coalition series may still publish.',
  'drift-incomplete-series': 'One or more weeks in the look-back window has no publishable value for this measure. The conformal band is refused rather than interpolating or dropping the gap.',
  'drift-thin-calibration': 'Nominal coverage needs more strictly-prior week-over-week changes than this series holds (k = ceil((n+1)·coverage) > n). The band is refused, never extended to infinity as a number.',
  'drift-suppressed': 'Every span reading frozen this week was small-cell suppressed by RULE-JUR-04. The week is counted as a refusal, not printed as a zero.',
  'drift-no-coalition': 'No span reading this week carries a publishable median coalition size. The coalition series is refused for that week, never defaulted to one.',
});

/** The reading each altitude is allowed to claim. A chief never gets item detail. */
export const JUR_ALTITUDE_QUESTIONS = Object.freeze({
  frontline: 'Which of my objectives is another team also working, and who would have to agree before either of us could change the plan?',
  manager: 'Where is my span sharing an objective with a peer span, and handoffs am I paying that one boundary change would remove?',
  director: 'How many of my unit’s objectives cross a branch, and is the coalition or the escalation the cheaper way to hold them?',
  exec: 'How much of this function’s coordination load is self-inflicted structure, and which boundary would the board see change?',
  chief: 'How much of the enterprise runs on cross-branch work no single seat can resolve, and where is a boundary redraw earned?',
});

/** One frozen finding per objective per ISO week. Rescans in a week converge. */
export function findingKey(objectiveKey, week) {
  return `jur:${String(objectiveKey || '').slice(0, 90)}:${week}`;
}

/** One identity-free span reading per (span, ISO week). */
export function readingKey(nodeId, week) {
  return `jurread:${String(nodeId || '').slice(0, 90)}:${week}`;
}

/** Idempotency marker for a governed decision: one per finding per week. */
export function governanceMarker(findingId, week) {
  return `[JUR-GOV:${findingId}:${week}]`;
}

/** Stamped into the governed decision so other modules can exclude audit output. */
export function governedDecisionMarker(findingId, week) {
  return `[JUR-OPTION:${findingId}:${week}]`;
}

export function governanceDecisionMarker(findingId, week) {
  return `[RULE-JUR-02:${findingId}:${week}]`;
}

/** ADR-0115: one governed cross-week drift decision per ISO week, at most. */
export function driftMarker(week) {
  return `[JUR-DRIFT:${week}]`;
}

/** Stamped into the governed decision so no module prices it back as work. */
export function driftDecisionMarker(week) {
  return `[RULE-JUR-05:${week}]`;
}
