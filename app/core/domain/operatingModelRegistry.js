/**
 * app/core/domain/operatingModelRegistry.js — Schema v94 / ADR-0088.
 *
 * "The Operating Model" — the first screen in this category to measure the
 * MODEL a leadership position actually is, rather than the person in it.
 *
 * THE QUESTION NOBODY ANSWERS
 * ---------------------------
 * Every attendance terminal in the world measures what a company spends on
 * people. Almost nothing measures what a position spends on time — and time is
 * the only input a leader cannot buy more of. We know the cost of the seat. We
 * do not know the *shape* of the seat: how many hours of the week it must spend
 * below its own altitude, what a promised hand-up costs per week, whether a
 * manager has enough scarce capacity to run more than one quality conversation
 * per report per cycle, and how that entire picture changes when one person
 * leaves.
 *
 * That is not a diary problem. It is a *work-system design* problem, and the
 * industrial toolkit for it is old, named and quantitative:
 *
 *  - **Jaques' time-span of discretion (1956, 1964)** — an altitude is not a
 *    rank, it is a *time horizon*. Reused from ADR-0075: every record already
 *    carries the horizon its age demands (`requiredRank`), so displacement can
 *    be computed instead of asserted.
 *  - **Rummler–Brache (1990/1995)** — a job is the output of a process, not a
 *    list of duties. `determinantsOfPerformance` is their three levels
 *    (performer, work process, organisation) given a threshold rule instead of
 *    an opinion.
 *  - **Drucker — management by self-control (1954)** — the only honest measure
 *    of a manager is what the position was *for*, matched against what it is
 *    *spending time on*. The congruence test prints the mismatch, not a grade.
 *  - **Senge / Forrester — causal loop diagrams (1961, 1990)** — the mechanism
 *    here is a *reinforcing loop*: a new report consumes scarce capacity, which
 *    lengthens the coaching interval, which raises the share of work that
 *    outlives its horizon, which hands the displaced hour straight back. A
 *    structural fix breaks it; a purge does not.
 *  - **Mann (1965)** — span of control is contingent on the *variety* the unit
 *    processes, not a universal number. Implemented as the Graicunas/Urwick
 *    band [3, 8] *as a declared convention*, refused when the record cannot
 *    support it rather than asserted.
 *  - **Graicunas (1933)** — the combinatorial explosion of cross-relationships;
 *    printed as the reason a small span is not automatically a light one.
 *  - **SMED / Shingo (1985)** — you cannot eliminate every changeover, so you
 *    separate *internal* from *external*: the 14-minute triage is a fact, the
 *    four-hour document is a failure of work design. Displacement is split
 *    accordingly instead of being summed into a fear number.
 *  - **Taylor (1911)** and **Little (1961)** — work measure and finite capacity:
 *    a role's commitment is a *queue* served by a fixed number of hours.
 *  - **Littler, Levering & Walton (1982)** and **Kim & Mauborgne (2003)** —
 *    workload *tolerance* is not workload *capacity*, and a crisis the middle
 *    absorbs indefinitely is a hidden cost the top never sees.
 *  - **Hackman (2002)** — enabling conditions. A broken span is *authorable*,
 *    which is why the workspace insists the answer is a design change.
 *
 * THE FOUR STANDARD INDUSTRIAL VALIDATIONS, PERFORMED ON DESK WORK
 * ----------------------------------------------------------------
 * 1. **R&R** — the measurement system grades *its own inputs* first: the
 *    declared norms (hours per effort-day and per effort-week), the attendance
 *    arithmetic (a person cannot be in three units in one week), and the
 *    coverage of *demand*. Only the outputs that pass are allowed to state a
 *    number; the rest print a refusal and the single cheapest fix.
 * 2. **Line-balance / bottleneck** — each position's weekly committed hours are
 *    compared with its finite capacity. The *station utilisation* is printed,
 *    and the largest single relief available to the span is priced beside it.
 * 3. **DFM (design for manufacture) / concurrent engineering** — every unit is
 *    priced by the *repeat cost its own design imposes*: cross-team abstention
 *    (a decision route through the span above), forecast re-reporting (measured
 *    as re-forecasting velocity against the real forecasting cadence),
 *    attendance re-typing, and duplicate commitment.
 * 4. **Lean waste** — the *vertical* form of WIP and rework: decisions routed up
 *    when the assignment could have held them. Displacement is WIP; abstention
 *    is rework. Neither is a person's fault, which is the point of an operating
 *    model that starts above the individual.
 *
 * WHAT THIS MODULE MAY NEVER DO
 * -----------------------------
 *  - It never measures, scores, ranks or profiles a PERSON. The subject of every
 *    figure is a SPAN, a POSITION DESIGN, a RECORD, or a COLLABORATION EDGE.
 *    Utilization is a property of a design; a reader who wants to use it as a
 *    performance score finds no rank, no percentile, and no comparative roster.
 *  - It never infers attendance, presence, keystrokes, calendars or a clock.
 *    Capacity is the product of two *declared* numbers the reader can change.
 *  - It never states a rate below the declared cell floor. A count is printed;
 *    a rate is refused with the reason and the exact evidence that would lift it.
 *  - It never invents a norm. An undeclared hours figure is `null`, and every
 *    module that depends on it refuses in the same shape the rest of the app uses.
 *  - It is a LOCAL WORKSPACE, not an HRIS. There is no sync, no connector and no
 *    employment-law opinion in it.
 *
 * Pure module: no storage, no DOM, no clock (the caller supplies `now`).
 */

export const OPERATING_MODEL_VERSION = 'operating-model-2026.11-v1';

/** Post-commit rule ids — surfaced in the UI, the audit log and the brief. */
export const OPERATING_MODEL_RULES = Object.freeze({
  CONGESTION: 'RULE-OMD-01', // a span over the utilisation ceiling → one governed consent decision (altitude above, once per ISO week)
  STRUCTURE: 'RULE-OMD-02',  // one relief per congestion decision: abstention, division, or the first redundant role
  FLOOR: 'RULE-OMD-03',      // a span below the continuity floor → one certified fragility marker + one governed exploration decision
});

export const OPERATING_MODEL_EVENTS = Object.freeze({
  NORMS_SET: 'operatingModel.norms_set',
  PORTFOLIO_SET: 'operatingModel.portfolio_set',
  DECISION_SET: 'operatingModel.decision_set',
  SCAN: 'operatingModel.scan',
  TRIGGER: 'operatingModel.trigger',
});

export const OPERATING_MODEL_LIMITS = Object.freeze({
  markers: 800,          // bounded, capped idempotency ledger
  decisions: 400,        // max portfolio items priced in one reading
  ancestors: 8,          // max leadership ancestors in one roll-up path
  edges: 240,            // max collaboration edges modelled
  history: 24,           // decision-routing history rows kept per reading
});

export const OPERATING_MODEL_PANELS = Object.freeze(['spans', 'load', 'coupling', 'levers', 'norms', 'brief']);

/**
 * The library of standard operating-model interventions. Each one is a named,
 * citable pattern with a measured unit, so a recommendation is a *category of
 * design change*, never a person to move.
 *
 * `key`        stable id used by the relief engine and the exported brief.
 * `effort`     how hard the change is to make (a design cost, not a score).
 * `unit`       the measured quantity the lever moves.
 * `measure`    the method, named, so the reader can check the claim.
 * `relation`   the typed graph relation written when a lever is adopted.
 */
export const OPERATING_MODEL_LEVERS = Object.freeze([
  Object.freeze({
    key: 'raise-wip',
    label: 'Do fewer things at once',
    family: 'work design',
    effort: 'policy',
    unit: 'open obligations per span',
    measure: 'Little’s law (1961): at a fixed service rate, halving WIP halves cycle time. Targets the hours already committed, not the people.',
    relation: 'relieves',
  }),
  Object.freeze({
    key: 'raise-abstention',
    label: 'Give the span the decision nobody assigned',
    family: 'decision rights',
    effort: 'charter',
    unit: 'routed decisions per span per cycle',
    measure: '“What outranks what” declared once and published (Drucker 1954; Graicunas 1933). Removes a route, not a task.',
    relation: 'relieves',
  }),
  Object.freeze({
    key: 'raise-decomposition',
    label: 'Decompose the route, not the team',
    family: 'org design',
    effort: 'reorg',
    unit: 'routed decisions that end at the span above',
    measure: 'Rummler–Brache (1990): if the hand-off asserts that every acceptable outcome must come back above, the routing table is wrong — not the person.',
    relation: 'relieves',
  }),
  Object.freeze({
    key: 'add-lead',
    label: 'Add a lead inside the span',
    family: 'capacity',
    effort: 'hire',
    unit: 'direct span and attached demand',
    measure: 'Graicunas (1933) + Mann (1965): span is contingent on variety. One added lead divides the attached demand, but of those the span already sends above — not of the group standing behind it — and only up to the continuity floor, because a span below it is fragile, not relieved.',
    relation: 'relieves',
  }),
  Object.freeze({
    key: 'redo-units',
    label: 'Redo the unit boundaries',
    family: 'org design',
    effort: 'reorg',
    unit: 'cross-unit abstention',
    measure: 'Conway / Rummler–Brache: if most routed decisions are the same judgement under two names, the boundary is drawn through one decision, not between two.',
    relation: 'relieves',
  }),
  Object.freeze({
    key: 're-baseline',
    label: 'Re-baseline the commitment',
    family: 'forecast integrity',
    effort: 'contract',
    unit: 're-reported commitments per cycle',
    measure: 'Normal-cost principle: the span is measured against a commitment that never moved. Re-baselining is the anti-gaming response to "if I can’t, I re-forecast".',
    relation: 'relieves',
  }),
  Object.freeze({
    key: 'de-hub',
    label: 'De-hub the single point of failure',
    family: 'continuity',
    effort: 'development',
    unit: 'critical-path concentration',
    measure: 'Morris (1966) / critical path + succession min-cut (already in this workspace under the Leadership bench): a span whose work stops when one person is out has a design defect, not a hero.',
    relation: 'relieves',
  }),
  Object.freeze({
    key: 'raise-book-policy',
    label: 'Raise the book ceiling',
    family: 'governance',
    effort: 'policy',
    unit: 'the capacity ceiling itself',
    measure: 'Permanent supervision vs intermittent supervision (Rowntree 1921, Urwick 1956): a deliberate, documented enlargement — never a quiet overload.',
    relation: 'relieves',
  }),
  Object.freeze({
    key: 'remove-seat',
    label: 'Remove the seat',
    family: 'org design',
    effort: 'reorg',
    unit: 'role overlap',
    measure: 'Visible cost of supervision (Urwick): an overlapping layer that only relays work. Priced with the separation machinery the workspace already holds — never executed here.',
    relation: 'relieves',
  }),
]);

export const OPERATING_MODEL_LEVER_BY_KEY = Object.freeze(
  Object.fromEntries(OPERATING_MODEL_LEVERS.map((lever) => [lever.key, lever])),
);

/**
 * The four work types the model charges a position for. Deliberately small and
 * mutually exclusive, because a fifty-category taxonomy is a way of never
 * adding anything up.
 */
export const OPERATING_MODEL_WORK_TYPES = Object.freeze({
  altitude: 'Work at this position’s own altitude — the decisions it exists to make',
  displaced: 'Work below the position’s altitude that arrived with the paperwork',
  abstention: 'Work routed up because the assignment is not trusted to hold it',
  coordination: 'Work created by the seams — meetings, re-reports, reconciliation',
});

/**
 * Declared norms. Every number is a management convention the reader can edit;
 * none is a measured fact about a person, and every module that consumes one
 * prints the norm it used.
 */
export const OPERATING_MODEL_NORM_DEFAULTS = Object.freeze({
  omDeepWorkHoursPerDay: 4.5,       // 0.5–12: effective hours per working day
  omWorkDaysPerWeek: 5,             // 1–7: declared contracted days
  // The three prices that turn records into hours. All declared, all editable,
  // all printed next to the figure they produce.
  omCoordinationHoursPerWeek: 1.5,    // 0–12: h/week per direct report for cadence (1:1s, team meeting)
  omDelegationHoursPerWeek: 2.5,      // 0–24: h/week of supervision per OPEN delegation under the span
  omAbstentionHoursPerWeek: 1.5,      // 0–24: h/week the level above absorbs per routed decision
  omEdgeMinutes: 30,                  // 5–240: minutes one recurring collaboration edge costs per cycle
  omReliefWeeks: 1.5,               // 0.5–12: a new hire divides the hours it does not consume in its first weeks
  omAbstentionWeightPct: 30,        // 0–100: share of an abstention that reaches the level above
  omCrossWavePct: 25,               // 0–100: share of an edge still moving after the first wave
  omConcurrentEdges: 2,             // 1–20: how many conversations a node can hold at once
  omMaxWave: 16,                    // 1–200: how far a declared change is propagated
  omCellFloor: 3,                   // 1–12: the small-cell floor for every printed rate
  omUtilizationCeilPct: 95,         // 50–100: utilization above this is a queue, not a plan (Kingman 1961)
  omContinuityFloor: 3,             // 1–8: fewer reports than this and continuity depends on one person
  omReviewDays: 21,                 // 3–120: horizon on a governed operating-model decision
  omAutoPropagate: true,            // pausable; an explicit scan always runs
});

/** Every rate below its floor is refused with the exact evidence that lifts it. */
export const OPERATING_MODEL_LIMITS_DOCS = Object.freeze({
  hoursPerEffortDay: 'An effort-day is a declared number of hours. It is editable, printed, and identical for every seat in the reading — one ruler for everyone is the only way the model is auditable.',
  hoursPerEffortWeek: 'A report deliverable is priced at a declared number of hours per week of commitment. Change it and every span changes together.',
  cellFloor: 'A rate is a claim about a population. Below the floor, the count is printed and the rate is refused, with the exact number of observations that would lift it.',
  utilization: 'Utilization is a property of a DESIGN, not a person. Above the ceiling (Kingman 1961) an extra hour of commitment buys more queue than work — the number says the design is wrong, never that the reader is. It is never a performance score, and there is no rank of people in this module.',
  span: 'The healthy direct-span band is a declared convention (Graicunas’/Urwick’s 3–8), not a universal fact — Mann (1965) showed it is contingent on process variety.',
});

/**
 * The disclosure ladder, printed on the panel rather than buried in a policy
 * file. The unit changes with the reader's altitude and the change is stated.
 */
export const OPERATING_MODEL_DISCLOSURE = Object.freeze({
  names: 'Span detail — a frontline or manager seat reads its own span’s design: positions, attached demand and levers.',
  unit: 'Span rates and the bottleneck ranking — a director asks which span is the constraint, not what one person did this week.',
  skip: 'Every level above the reader’s span is represented by ONE aggregate row. A span three levels down is not a hyperlink; it is an amortised aggregate, so the reading cannot be used as a way of learning a distant team’s diary.',
  aggregate: 'An executive or chief seat reads attributable labour cost, the abstention flow out of large units, and the first-design-decision risk. Individual position detail never climbs.',
  local: 'Local workflow boundary, not authenticated multi-user security. Anyone controlling this browser or a full backup can read what is declared here.',
  placeholder: 'There is no attendance clock in this module. Every derived capacity claim rests on hours per effort-day and hours per effort-week, both of which the reader can see and change.',
  truth: 'This is a model of a design, not a judgement of a person. Utilization, congruence and connectivity are properties of a POSITION DESIGN and a COLLABORATION pattern. Nothing in this module ranks people, and nothing here may be used as evidence of effort.',
});

/**
 * Work-type pricing is derived from the record, never invented. `null` means
 * "the record does not carry the quantity" and every consumer must refuse
 * rather than zero it.
 *
 * The three prices below are the honest seam of this module. The workspace can
 * prove *which* records exist; it cannot prove how long one takes. So the prices
 * are declared conventions that the reader can see and change, the renderer
 * prints the norm beside every figure they produce, and the honesty panel says
 * so in one sentence. That is a weaker claim than an attendance system makes
 * and a stronger one than a dashboard makes: the number is reproducible.
 */
export const OPERATING_MODEL_PRICES = Object.freeze({
  coordination: 'omCoordinationHoursPerWeek',
  delegation: 'omDelegationHoursPerWeek',
  abstention: 'omAbstentionHoursPerWeek',
  edge: 'omEdgeMinutes',
});

/** Deterministic FNV-1a 32-bit over a design signature — content addressing, not crypto. */
export function omFingerprint(text) {
  const input = String(text ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
