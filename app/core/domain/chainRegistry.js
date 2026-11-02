/**
 * app/core/domain/chainRegistry.js — leaf vocabulary for the Command Chain
 * (`#/chain`, Schema v82, ADR-0075).
 *
 * Zero imports, so `schema.js`, `chain.js`, `chainRules.js`,
 * `propagationContracts.js`, `csv.js`, `insights.js` and `cases.js` share one
 * canonical vocabulary without a circular dependency.
 *
 * THE QUESTION THIS TERMINAL ANSWERS
 * ----------------------------------
 * Every other screen in LeadOS answers a question at ONE altitude. A delegation
 * queue, a 1:1 cadence and a capital allocation are all useful, and none of them
 * tells a leader the thing that actually decides whether they are doing their job:
 *
 *   Is this work sitting at the altitude it belongs to — and does the level
 *   above it have any way to see it without asking me for a status update?
 *
 * LeadOS has, since Session 1, modelled exactly one leader reading one roster.
 * That model has a hidden assumption: every altitude does the same work and
 * reads the same evidence. It is false. A frontline lead's week is a different
 * object from a director's quarter, and the failure mode of a real organisation
 * is not that one of them is lazy — it is that work sits at the wrong altitude
 * (a director coaching a single shift; a team lead making an enterprise bet) and
 * then escalates by *surprise* instead of by design.
 *
 * So this module gives the workspace an altitude axis and makes three things
 * measurable from records it already holds:
 *
 *   1. **Routing.** Every open item is attributed to the leader who owns the
 *      people it concerns — and when it concerns people in two units, to their
 *      lowest common ancestor. That is the span-of-consequence rule, computed
 *      from `person.managerId`, not declared by anyone.
 *   2. **Escalation.** An item whose age has passed its owner's decision horizon
 *      belongs to the altitude above. The clock is the altitude's own time span,
 *      not a remembered follow-up. Nothing is re-typed to escalate.
 *   3. **Roll-up.** Each altitude's reading is an exact sum of the counts below
 *      it and a *pooled* rate above a printed evidence floor — with the naive
 *      mean-of-means printed beside it and a composition warning when the two
 *      disagree, because that disagreement is how roll-ups lie.
 *
 * CROSS-DOMAIN FOUNDATIONS ENCODED HERE
 * -------------------------------------
 *  - **Time-span of discretion** (Jaques 1956, *Measurement of Responsibility*;
 *    Jaques 1961, *Equitable Payment*; Stamp 1986): the defining property of a
 *    managerial stratum is the longest period over which its work is judged
 *    without review. That is why the escalation clock here is a per-altitude
 *    horizon and not one universal SLA — a seven-day question answered in ten
 *    days is not late, it is out of its altitude's reach.
 *  - **Requisite variety** (Ashby 1956, *An Introduction to Cybernetics*): a
 *    regulator must have at least as much variety as the system it regulates.
 *    An altitude whose view is a crude aggregate cannot regulate a span whose
 *    composition differs from everyone else's — hence the composition guard.
 *  - **Span of control & the coordination channel count** (Graicunas 1933;
 *    Urwick 1956; Brooks 1975): out-degree bands, and n(n−1)/2 channels per unit.
 *    Declared as conventions, printed as conventions, never dressed as science.
 *  - **Lowest common ancestor** (graph theory: Tarjan 1979, offline LCA): the
 *    smallest span that contains every person an item touches. Responsibility for
 *    cross-unit work is not a judgement call; it is a property of the tree.
 *  - **Pooling vs. averaging** (Simpson 1951; Blyth 1972; Greenland, Robins &
 *    Pearl 1999 on collapsibility): a pooled rate is a weighted average, so a
 *    roll-up that reports the mean of unit rates reports a number that no person
 *    experienced. Both are printed; a materiality test decides whether the
 *    difference matters, and a sign flip is called out by name.
 *  - **Direct standardisation** (epidemiology: age-standardised rates — Lilienfeld
 *    & Lilienfeld 1980; Rothman, Greenland & Lash 2008): re-weight each unit to a
 *    common mix before comparing it to anyone. This is the honest alternative to
 *    ranking units on a crude rate when their work is not the same work.
 *  - **Small-cell suppression / k-anonymity** (Sweeney 2002; NCHS/CDC cell
 *    suppression rules): below a floor of observations a cell is withheld rather
 *    than shown, because a proportion of 1 of 1 identifies a person.
 *  - **Kaplan–Meier style empirical survival** (Kaplan & Meier 1958): the chance
 *    an open item is still open at a future age is read off ages at which the
 *    workspace's own items actually closed — and refused when nothing has ever
 *    stayed open that long.
 *
 * WHAT THIS MODULE MAY NEVER DO
 * -----------------------------
 *  - It never rates, ranks or scores a person. A reading is about a *span* — the
 *    work that leader is carrying — and its members are counts.
 *  - It never reads `conflicts` or `pulses`. Both are excluded by the shared link
 *    registry as forbidden endpoints, and widening that contract to compute an
 *    org chart would be exactly the leak the contract exists to prevent.
 *  - It never invents a horizon, a span band, a floor or a mix. Every number is a
 *    dated record, a declared convention, or an explicit refusal.
 *  - It never claims to be an access-control boundary. In a local-first
 *    workspace with no authentication there is one person at the keyboard; the
 *    disclosure ladder below is a *rendering contract* — what this screen shows
 *    at each altitude — and it says so on the page rather than implying a
 *    permission system it cannot enforce.
 */

export const CHAIN_ENGINE_VERSION = 'command-chain-2026.11-v1';

/* ------------------------------------------------------------------ */
/* 1. The altitudes — the ladder every other decision is placed on      */
/* ------------------------------------------------------------------ */

/**
 * One altitude is a genuine job, not a rank badge. Each entry states:
 *
 *   rank           1 (frontline) … 5 (enterprise); monotone in time span
 *   horizonDays    time-span of discretion: the longest period this altitude's
 *                  work can run before it must be reviewed by the level above
 *   spanBand       declared healthy direct-span band for this altitude
 *   stance         the one question this altitude exists to answer
 *   decisionForm   the *kind* of decision, which is what changes with altitude
 *   duties         named duties with the routes that serve them — this is the
 *                  app's map, so a frontline lead is not buried in portfolio
 *                  analytics and a chief is not reading shift coaching notes
 *   forbidden      what this altitude must not be shown or asked to decide
 *   handUp         the contract: what this altitude owes the one above it
 *   disclosure     the rendering contract for this altitude's own reading
 *
 * `disclosure.names` is 'visible' (the work is the people), 'leaders' (only the
 * leaders of the units below, never individuals inside them) or 'none' (counts
 * by source only). `floorN` is the minimum cell size the altitude may see.
 */
export const ALTITUDES = Object.freeze([
  Object.freeze({
    key: 'frontline',
    rank: 1,
    label: 'Frontline lead',
    shortLabel: 'Frontline',
    unitLabel: 'the individual and the week',
    horizonDays: 7,
    spanBand: Object.freeze([3, 8]),
    stance: 'Is every person on this team clear on what matters this week, supported in doing it, and told the truth about how it went?',
    decisionForm: 'assignment & coaching',
    decisionQuestion: 'Who does what this week, and what does each person need from me to be able to do it?',
    duties: Object.freeze([
      Object.freeze({
        key: 'coach',
        label: 'Coaching cadence',
        question: 'Did every person get a real conversation inside the cadence, not a status update?',
        routes: Object.freeze(['#/oneonones', '#/feedback']),
        sources: Object.freeze(['oneonone', 'feedback-followup']),
      }),
      Object.freeze({
        key: 'clarity',
        label: 'Task clarity & load',
        question: 'Does everyone know which single thing matters most this week — and is the load survivable?',
        routes: Object.freeze(['#/goals', '#/load']),
        sources: Object.freeze(['goal', 'delegation']),
      }),
      Object.freeze({
        key: 'cover',
        label: 'Cover & follow-through',
        question: 'If someone is out tomorrow, is the work still covered, and does delegated work come back?',
        routes: Object.freeze(['#/delegations', '#/capacity']),
        sources: Object.freeze(['delegation']),
      }),
      Object.freeze({
        key: 'friction',
        label: 'Friction inside the week',
        question: 'Is a disagreement between two people still unresolved after seven days?',
        routes: Object.freeze(['#/conflicts']),
        sources: Object.freeze([]),
      }),
      Object.freeze({
        key: 'first-signal',
        label: 'First signal',
        question: 'Has anything crossed into a second week without becoming someone else’s decision?',
        routes: Object.freeze(['#/cases', '#/health', '#/today']),
        sources: Object.freeze(['case', 'perfconcern']),
      }),
    ]),
    forbidden: Object.freeze([
      'Portfolio-level capital allocation',
      'Enterprise risk aggregation',
      'Pay bands, merit cycles and workforce transition',
      'Board-ready synthesis',
    ]),
    handUp: Object.freeze([
      'Anything older than seven days, with the date it crossed',
      'Anything that touches a second unit',
      'Any decision that spends money, headcount or a promise to a customer',
    ]),
    disclosure: Object.freeze({ names: 'visible', itemDetail: true, floorN: 3 }),
  }),
  Object.freeze({
    key: 'manager',
    rank: 2,
    label: 'Manager',
    shortLabel: 'Manager',
    unitLabel: 'the team and the cycle',
    horizonDays: 30,
    spanBand: Object.freeze([3, 8]),
    stance: 'Is this team’s throughput real, is it the right throughput, and does anything need a different shape or a different person to be true?',
    decisionForm: 'resource & sequencing',
    decisionQuestion: 'Where does the next unit of capacity, attention or headcount go — and what does it displace?',
    duties: Object.freeze([
      Object.freeze({
        key: 'throughput',
        label: 'Throughput & flow',
        question: 'Is work leaving this team at the rate it arrives, and where is the queue?',
        routes: Object.freeze(['#/capacity', '#/allocation', '#/portfolio']),
        sources: Object.freeze(['delegation', 'case']),
      }),
      Object.freeze({
        key: 'review-cycle',
        label: 'Review & development cycle',
        question: 'Has every person had a defensible review inside the cycle, with evidence behind it?',
        routes: Object.freeze(['#/reviews', '#/reliability', '#/growth']),
        sources: Object.freeze(['oneonone']),
      }),
      Object.freeze({
        key: 'coordination',
        label: 'Cross-team coordination',
        question: 'Which dependency between units is being managed by hope?',
        routes: Object.freeze(['#/resilience', '#/coupling', '#/network']),
        sources: Object.freeze(['case']),
      }),
      Object.freeze({
        key: 'staffing',
        label: 'Staffing & succession feed',
        question: 'Is the pipeline feeding the next seat, or is every seat a single point of failure?',
        routes: Object.freeze(['#/hiring', '#/readiness']),
        sources: Object.freeze(['requisition', 'perfconcern']),
      }),
      Object.freeze({
        key: 'commitments',
        label: 'Commitments made outward',
        question: 'Which promise made to another team is already broken and not yet renegotiated?',
        routes: Object.freeze(['#/solvency', '#/stakeholders', '#/comms']),
        sources: Object.freeze(['decision', 'premise']),
      }),
    ]),
    forbidden: Object.freeze([
      'Enterprise risk aggregation across functions',
      'Company-wide leadership bench decisions',
    ]),
    handUp: Object.freeze([
      'The team’s measured rate and where it broke',
      'Every structural defect this altitude cannot fix',
      'The one decision it needs the level above to make',
    ]),
    disclosure: Object.freeze({ names: 'visible', itemDetail: true, floorN: 3 }),
  }),
  Object.freeze({
    key: 'director',
    rank: 3,
    label: 'Director',
    shortLabel: 'Director',
    unitLabel: 'multiple teams and the quarter',
    horizonDays: 90,
    spanBand: Object.freeze([3, 8]),
    stance: 'Do these teams add up to a strategy, or to five busy calendars — and is the org shape the reason they do not?',
    decisionForm: 'structure & strategy fit',
    decisionQuestion: 'Which structural move, sequencing choice or boundary change makes the next quarter add up?',
    duties: Object.freeze([
      Object.freeze({
        key: 'alignment',
        label: 'Multi-team alignment',
        question: 'Is every team’s funded work traceable to a declared bet — and which bet has no work under it?',
        routes: Object.freeze(['#/strategy', '#/portfolio', '#/wargame']),
        sources: Object.freeze(['goal', 'decision']),
      }),
      Object.freeze({
        key: 'shape',
        label: 'Org design',
        question: 'Is the reporting shape creating the queue, and what would the counterfactual cost?',
        routes: Object.freeze(['#/orgdesign', '#/changes']),
        sources: Object.freeze(['case']),
      }),
      Object.freeze({
        key: 'risk',
        label: 'Cross-functional risk',
        question: 'Which single failure would take out more than one team at once?',
        routes: Object.freeze(['#/resilience', '#/wargame', '#/premises']),
        sources: Object.freeze(['case', 'premise']),
      }),
      Object.freeze({
        key: 'pipeline',
        label: 'Talent pipeline',
        question: 'Is there a named successor for every seat whose loss would hurt, and is the claim evidenced?',
        routes: Object.freeze(['#/readiness', '#/transition', '#/onboarding']),
        sources: Object.freeze(['perfconcern', 'requisition']),
      }),
      Object.freeze({
        key: 'delivery',
        label: 'Delivery integrity',
        question: 'Do the commitments this directorate has made still settle, at the rate they were priced at?',
        routes: Object.freeze(['#/solvency', '#/survival', '#/execution']),
        sources: Object.freeze(['decision', 'delegation']),
      }),
    ]),
    forbidden: Object.freeze([
      'Individual coaching notes and 1:1 content',
      'Individual performance concerns below the unit',
      'Company-wide capital allocation',
    ]),
    handUp: Object.freeze([
      'Portfolio-level risk with its concentration named',
      'Every structural defect this altitude cannot fix',
      'The bench claim, with the evidence behind it or the refusal',
    ]),
    disclosure: Object.freeze({ names: 'leaders', itemDetail: false, floorN: 5 }),
  }),
  Object.freeze({
    key: 'exec',
    rank: 4,
    label: 'VP / executive',
    shortLabel: 'Executive',
    unitLabel: 'the function and the half',
    horizonDays: 180,
    spanBand: Object.freeze([3, 8]),
    stance: 'Are the bets this function funds worth more than the ones it refuses, and does the leadership bench survive being tested?',
    decisionForm: 'investment & risk appetite',
    decisionQuestion: 'What do we fund, what do we deliberately refuse, and what risk are we carrying on purpose?',
    duties: Object.freeze([
      Object.freeze({
        key: 'capital',
        label: 'Capital & portfolio bets',
        question: 'What is the funded mix, and what did the refused work cost us?',
        routes: Object.freeze(['#/capital', '#/allocation', '#/portfolio', '#/deferral']),
        sources: Object.freeze(['goal', 'decision']),
      }),
      Object.freeze({
        key: 'risk-appetite',
        label: 'Org-wide risk & culture signal',
        question: 'Is the culture signal the aggregate says we have the one we are betting on?',
        routes: Object.freeze(['#/health', '#/anomaly', '#/power']),
        sources: Object.freeze(['case', 'premise']),
      }),
      Object.freeze({
        key: 'bench',
        label: 'Leadership bench',
        question: 'If two of my directors left this quarter, who takes their spans, and would it hold?',
        routes: Object.freeze(['#/handover', '#/readiness', '#/chain']),
        sources: Object.freeze(['perfconcern']),
      }),
      Object.freeze({
        key: 'external',
        label: 'External commitments',
        question: 'Which promise to a customer, regulator or board is implicitly priced as free?',
        routes: Object.freeze(['#/stakeholders', '#/negotiations', '#/finance']),
        sources: Object.freeze(['decision', 'premise']),
      }),
      Object.freeze({
        key: 'evidence',
        label: 'Evidence sufficiency',
        question: 'Which judgement am I making on evidence this organisation cannot yet produce?',
        routes: Object.freeze(['#/supply', '#/sceptic', '#/credibility']),
        sources: Object.freeze([]),
      }),
    ]),
    forbidden: Object.freeze([
      'Individual coaching notes and 1:1 content',
      'Individual pay and performance detail',
      'Unit-level task lists',
    ]),
    handUp: Object.freeze([
      'The funded/refused split with its price',
      'Aggregated risk by concentration, not by person',
      'The bench verdict, with its evidence floor or its refusal',
    ]),
    disclosure: Object.freeze({ names: 'none', itemDetail: false, floorN: 6 }),
  }),
  Object.freeze({
    key: 'chief',
    rank: 5,
    label: 'CEO / C-suite',
    shortLabel: 'Enterprise',
    unitLabel: 'the enterprise and the year',
    horizonDays: 365,
    spanBand: Object.freeze([3, 8]),
    stance: 'Is the enterprise carrying risk it has not named, on a bench it has not tested, against a strategy it cannot trace to work?',
    decisionForm: 'enterprise bet & disclosure',
    decisionQuestion: 'What must be true for this year to hold — and what would we tell the board today if we had to?',
    duties: Object.freeze([
      Object.freeze({
        key: 'enterprise-risk',
        label: 'Enterprise risk aggregation',
        question: 'What single failure mode is currently carried by more than one function, uninsured?',
        routes: Object.freeze(['#/resilience', '#/wargame', '#/integrity']),
        sources: Object.freeze(['case', 'premise']),
      }),
      Object.freeze({
        key: 'bench-health',
        label: 'Leadership bench health',
        question: 'Does every critical seat have a tested successor, and where is the evidence?',
        routes: Object.freeze(['#/readiness', '#/handover', '#/chain']),
        sources: Object.freeze(['perfconcern']),
      }),
      Object.freeze({
        key: 'strategy-trace',
        label: 'Strategy traceability',
        question: 'Can every funded hour be traced to a bet, and is any bet silently unfunded?',
        routes: Object.freeze(['#/strategy', '#/capital', '#/allocation']),
        sources: Object.freeze(['goal', 'decision']),
      }),
      Object.freeze({
        key: 'board',
        label: 'Board-ready synthesis',
        question: 'What would we disclose today — and which number would we have to mark unverified?',
        routes: Object.freeze(['#/board', '#/finance', '#/parity', '#/sceptic']),
        sources: Object.freeze([]),
      }),
      Object.freeze({
        key: 'altitude',
        label: 'Altitude discipline',
        question: 'How much of the enterprise’s work is being done at the wrong altitude, and by whom?',
        routes: Object.freeze(['#/chain', '#/load', '#/attention']),
        sources: Object.freeze([]),
      }),
    ]),
    forbidden: Object.freeze([
      'Individual coaching notes, 1:1 content or performance detail',
      'Individual pay',
      'Unit-level task lists and workflow minutiae',
    ]),
    handUp: Object.freeze([
      'The board line, with every unverified figure marked',
      'Enterprise risk by concentration and by owner altitude',
      'The bench and strategy verdicts, with their refusals intact',
    ]),
    disclosure: Object.freeze({ names: 'none', itemDetail: false, floorN: 8 }),
  }),
]);

export const ALTITUDE_KEYS = Object.freeze(ALTITUDES.map((a) => a.key));

export function altitudeByKey(key) {
  return ALTITUDES.find((a) => a.key === key) || null;
}

export function altitudeByRank(rank) {
  return ALTITUDES.find((a) => a.rank === rank) || null;
}

/** Rank of an altitude key, or 0 for "no altitude" (an individual contributor). */
export function altitudeRank(key) {
  return altitudeByKey(key)?.rank || 0;
}

/**
 * A roster `level` is a title; an altitude is a job. The mapping is deliberately
 * lossy in one direction only: an IC or senior IC has no altitude until they
 * manage someone (`chain.js` escalates them to frontline with a printed reason,
 * because a person with reports is doing a lead's work whatever the title says).
 * `vp` maps to the executive altitude; the enterprise altitude is reachable only
 * by the workspace leader declaring it, because `LEVELS` has no rank above VP and
 * inventing one would be inventing a fact about the organisation.
 */
export const LEVEL_ALTITUDE = Object.freeze({
  ic: null,
  senior: null,
  lead: 'frontline',
  manager: 'manager',
  director: 'director',
  vp: 'exec',
});

/* ------------------------------------------------------------------ */
/* 2. The work — every open record type, declared once                 */
/* ------------------------------------------------------------------ */

/**
 * A signal source turns one collection into dated open work. The engine knows
 * nothing about cases, goals or requisitions specifically: it reads `openWhen`,
 * `datePath`, `peoplePaths` and `closePaths` and does the same arithmetic for
 * every row. Adding a module's work to the chain is one entry here — no engine
 * change, no per-module glue.
 *
 *   openWhen      how to read "still open" from a record
 *                 { kind:'in', path:'status', values:[…] }
 *                 { kind:'empty', path:'chosen' }
 *                 { kind:'falsy', path:'followUpDone', requires:'followUpOn' }
 *   datePath      the day the work started (or the day it fell due, for a
 *                 deadline-shaped source)
 *   duePath       optional promised date, used for overdue counts only
 *   peoplePaths   fields holding person ids; `many` marks an array field
 *   closePaths    dates at which this source's work actually closed — the only
 *                 input to the age-at-close survival estimate
 *   severity      { path, max } maps a recorded 1..10 rating onto 1..3 weight
 *   unit          what one item is, for the sentence the page prints
 */
export const SIGNAL_SOURCES = Object.freeze([
  Object.freeze({
    key: 'case',
    linkType: 'case',
    label: 'Operational cases',
    singular: 'case',
    unit: 'a case still open',
    collection: 'cases',
    openWhen: Object.freeze({ kind: 'in', path: 'status', values: Object.freeze(['open', 'mitigating']) }),
    datePath: 'openedOn',
    duePath: 'reviewOn',
    peoplePaths: Object.freeze([Object.freeze({ path: 'ownerId', many: false }), Object.freeze({ path: 'involvedPersonIds', many: true })]),
    closePaths: Object.freeze(['resolvedOn']),
    severity: Object.freeze({ path: 'fmea.severity', max: 10 }),
    route: '#/cases',
    altitudeSensitive: true,
  }),
  Object.freeze({
    key: 'decision',
    linkType: 'decision',
    label: 'Undecided calls',
    singular: 'decision',
    unit: 'a call not yet made',
    collection: 'decisions',
    openWhen: Object.freeze({ kind: 'empty', path: 'chosen' }),
    datePath: 'date',
    duePath: 'reviewOn',
    peoplePaths: Object.freeze([]),
    closePaths: Object.freeze(['decidedOn']),
    severity: Object.freeze({ path: 'reversibility', max: 'irreversible' }),
    route: '#/decisions',
    altitudeSensitive: true,
  }),
  Object.freeze({
    key: 'delegation',
    linkType: 'delegation',
    label: 'Open delegations',
    singular: 'delegation',
    unit: 'work handed over and not yet back',
    collection: 'delegations',
    openWhen: Object.freeze({ kind: 'in', path: 'status', values: Object.freeze(['active']) }),
    datePath: 'delegatedOn',
    duePath: 'dueOn',
    peoplePaths: Object.freeze([Object.freeze({ path: 'personId', many: false })]),
    closePaths: Object.freeze(['completedOn', 'returnedOn']),
    severity: Object.freeze({ path: null, max: 1 }),
    route: '#/delegations',
    altitudeSensitive: true,
  }),
  Object.freeze({
    key: 'goal',
    linkType: 'goal',
    label: 'Open goals',
    singular: 'goal',
    unit: 'a goal with a date on it',
    collection: 'goals',
    openWhen: Object.freeze({ kind: 'in', path: 'status', values: Object.freeze(['active']) }),
    datePath: 'createdAt',
    duePath: 'dueDate',
    peoplePaths: Object.freeze([Object.freeze({ path: 'ownerId', many: false })]),
    closePaths: Object.freeze(['completedOn']),
    severity: Object.freeze({ path: 'confidence', max: 'off-track' }),
    route: '#/goals',
    altitudeSensitive: true,
  }),
  Object.freeze({
    key: 'oneonone',
    linkType: null,
    label: '1:1 cadence',
    singular: 'team member',
    unit: 'a person whose conversation is overdue',
    collection: 'oneOnOnes',
    // Cadence is derived per person, not per record: the engine reads the last
    // held meeting inside the cadence window and counts the person, not the row.
    derived: 'cadence',
    datePath: 'date',
    duePath: null,
    peoplePaths: Object.freeze([Object.freeze({ path: 'personId', many: false })]),
    closePaths: Object.freeze([]),
    severity: Object.freeze({ path: null, max: 1 }),
    route: '#/oneonones',
    altitudeSensitive: true,
  }),
  Object.freeze({
    key: 'feedback-followup',
    linkType: 'feedback',
    label: 'Feedback follow-ups owed',
    singular: 'follow-up',
    unit: 'a follow-up promised and not done',
    collection: 'feedback',
    openWhen: Object.freeze({ kind: 'falsy', path: 'followUpDone', requires: 'followUpOn' }),
    datePath: 'followUpOn',
    duePath: 'followUpOn',
    peoplePaths: Object.freeze([Object.freeze({ path: 'personId', many: false })]),
    closePaths: Object.freeze(['followUpCompletedOn']),
    severity: Object.freeze({ path: null, max: 1 }),
    route: '#/feedback',
    altitudeSensitive: false,
  }),
  Object.freeze({
    key: 'perfconcern',
    linkType: 'perfconcern',
    label: 'Open performance concerns',
    singular: 'concern',
    unit: 'a performance gap with an open process',
    collection: 'performanceConcerns',
    openWhen: Object.freeze({ kind: 'in', path: 'status', values: Object.freeze(['assessing', 'plan', 'monitoring']) }),
    datePath: 'openedOn',
    duePath: null,
    peoplePaths: Object.freeze([Object.freeze({ path: 'personId', many: false })]),
    closePaths: Object.freeze(['closedOn']),
    severity: Object.freeze({ path: null, max: 1 }),
    route: '#/performance',
    altitudeSensitive: true,
    sensitive: true,
  }),
  Object.freeze({
    key: 'premise',
    linkType: 'premise',
    label: 'Unsettled assumptions',
    singular: 'assumption',
    unit: 'an assumption carrying a decision',
    collection: 'premises',
    openWhen: Object.freeze({ kind: 'in', path: 'status', values: Object.freeze(['unobserved', 'watch', 'breached']) }),
    datePath: 'createdAt',
    duePath: 'reviewOn',
    peoplePaths: Object.freeze([Object.freeze({ path: 'ownerId', many: false })]),
    closePaths: Object.freeze([]),
    severity: Object.freeze({ path: 'status', max: 'breached' }),
    route: '#/premises',
    altitudeSensitive: true,
  }),
  Object.freeze({
    key: 'requisition',
    linkType: 'requisition',
    label: 'Open requisitions',
    singular: 'requisition',
    unit: 'a seat funded and not filled',
    collection: 'requisitions',
    openWhen: Object.freeze({ kind: 'in', path: 'status', values: Object.freeze(['open', 'interviewing', 'offer']) }),
    datePath: 'openedOn',
    duePath: 'targetStartOn',
    peoplePaths: Object.freeze([]),
    closePaths: Object.freeze(['closedOn']),
    severity: Object.freeze({ path: 'dailyVacancyCost', max: 'cost' }),
    route: '#/hiring',
    altitudeSensitive: true,
  }),
]);

export const SIGNAL_SOURCE_KEYS = Object.freeze(SIGNAL_SOURCES.map((s) => s.key));

export function signalSource(key) {
  return SIGNAL_SOURCES.find((s) => s.key === key) || null;
}

/* ------------------------------------------------------------------ */
/* 3. The measurable rates — three questions with a denominator        */
/* ------------------------------------------------------------------ */

/**
 * A rate is only a rate if it has a denominator the workspace actually recorded.
 * These three exist because they have one; anything else on the chain page is a
 * count, and a count is never presented as a rate.
 *
 * `floor` is the evidence floor below which the reading is withheld — a rate of
 * 1 of 1 is an identification, not a measurement.
 */
export const RATE_METRICS = Object.freeze([
  Object.freeze({
    key: 'delegation-on-time',
    label: 'Delegations returned on time',
    question: 'of the delegations that closed, how many closed by the date they were promised?',
    higherIsBetter: true,
    floorDefault: 4,
  }),
  Object.freeze({
    key: 'oneonone-cadence',
    label: 'People inside the 1:1 cadence',
    question: 'of the people in scope, how many had a held conversation inside the cadence?',
    higherIsBetter: true,
    floorDefault: 4,
  }),
  Object.freeze({
    key: 'goal-on-track',
    label: 'Dated goals still on track',
    question: 'of the open goals with a date on them, how many are still on track?',
    higherIsBetter: true,
    floorDefault: 4,
  }),
]);

export const RATE_METRIC_KEYS = Object.freeze(RATE_METRICS.map((m) => m.key));

export function rateMetric(key) {
  return RATE_METRICS.find((m) => m.key === key) || null;
}

/* ------------------------------------------------------------------ */
/* 4. Ids, events and limits                                           */
/* ------------------------------------------------------------------ */

export const CHAIN_RULE_IDS = Object.freeze({
  ESCALATE: 'RULE-CHN-01',
  ROLLUP: 'RULE-CHN-02',
  STRUCTURE: 'RULE-CHN-03',
  DRIFT: 'RULE-CHN-04',
  GRADE: 'RULE-CHN-05',
});

export const CHAIN_SIGNAL_IDS = Object.freeze({
  DEBT: 'CHN-01',
  NO_ALTITUDE: 'CHN-02',
  STRUCTURE: 'CHN-03',
  DRIFT: 'CHN-04',
  UNGRADED: 'CHN-05',
  THIN: 'CHN-06',
  ORPHAN: 'CHN-07',
  NO_CHAIN: 'CHN-08',
});

export const CHAIN_EVENTS = Object.freeze({
  FROZEN: 'chain.readingFrozen',
  GRADED: 'chain.readingGraded',
  DELETED: 'chain.readingDeleted',
  SCAN: 'chain.scan',
  CONVENTIONS: 'chain.conventions',
  ALTITUDE: 'chain.altitudeDeclared',
});

/**
 * Every setting is clamped into a printed range on read, and no range contains
 * the value that would silently disable its own test: a floor of 1 would make
 * every cell "measurable", a horizon of 0 would escalate everything, and a drift
 * bar of 100% would make drift undetectable.
 */
export const CHAIN_LIMITS = Object.freeze({
  leaderAltitude: ALTITUDE_KEYS,
  floorN: [2, 50],
  floorNDefault: 4,
  driftPct: [5, 95],
  driftPctDefault: 40,
  spanMin: [1, 12],
  spanMinDefault: 3,
  spanMax: [2, 30],
  spanMaxDefault: 8,
  materialityPp: [0.5, 25],
  materialityPpDefault: 5,
  windowDays: [28, 1095],
  windowDaysDefault: 365,
  reviewHorizonDays: [7, 365],
  reviewHorizonDaysDefault: 60,
  maxTasks: [1, 10],
  maxTasksDefault: 3,
  readingCap: [2, 40],
  readingCapDefault: 16,
  maxDepth: [2, 12],
  maxDepthDefault: 7,
  maxRows: 60,
  maxMembers: 40,
});

export const CHAIN_CONVENTIONS_NOTE =
  'Every number on this page is one of three things, and the page never blurs them: a dated '
  + 'record the workspace already holds, a convention you declared (each altitude’s time span, '
  + 'the span band, the evidence floor, the materiality bar, the drift bar), or an explicit '
  + 'refusal. None of them is a fact about how leadership should be done, and none of them is a '
  + 'measurement of a person.';

/** The disclosure ladder, expressed once so the view and the tests read the same source. */
export const DISCLOSURE_TEXT = Object.freeze({
  visible: 'This altitude sees people by name: the work at this altitude is the person.',
  leaders: 'This altitude sees only the leaders of the units below it — never an individual inside them.',
  none: 'This altitude sees counts by source and by unit. No person is named, at any level.',
});

/** The one-paragraph answer to "what is this page". */
export const CHAIN_PREMISE =
  'Work belongs to an altitude, and an altitude is defined by the longest period its work can run '
  + 'without being reviewed. Below that period the owner is doing their job; above it the work '
  + 'belongs to the level above, whether or not anyone has noticed.';
