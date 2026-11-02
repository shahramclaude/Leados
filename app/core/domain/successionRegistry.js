/**
 * app/core/domain/successionRegistry.js — leaf vocabulary for the Succession
 * Terminal (Schema v83, ADR-0077).
 *
 * Zero imports, so `schema.js`, `succession.js`, `successionRules.js`,
 * `propagationContracts.js`, `csv.js`, `insights.js` and `cases.js` share one
 * canonical vocabulary without a circular dependency.
 *
 * THE QUESTION THIS TERMINAL ANSWERS
 * ----------------------------------
 * Every succession tool in the category asks a manager to *nominate* a successor
 * and then *rate* their readiness. Both are opinions. Nine-box grids store the
 * opinion, bench-strength reports average it, and the board sees a colour.
 *
 * This terminal asks a question that has an answer in the record rather than in
 * someone's head: **if this person left on their next obligation date, could
 * their work actually be reabsorbed by the people who remain?** That is a flow
 * feasibility problem on data the workspace already holds — open items, dates,
 * who has ever worked with whom, and how much each survivor is already carrying.
 * It has a proof, a certificate, and a refusal.
 *
 * CROSS-DOMAIN FOUNDATIONS ENCODED HERE
 * -------------------------------------
 *  - **The blanket / collective model of key-person coverage** (Haehling von
 *    Lanzenauer & Wright, 1991, "Surviving your key-person's departure";
 *    Monmonier 1976 on contiguity). Coverage of a span is not the maximum of its
 *    members' individual horizons, it is the *union of dated commitments* the
 *    span collectively holds. A span can have a very long blanket and still lose
 *    every holder of one function tomorrow; that is the metric here.
 *  - **Herfindahl–Hirschman concentration** (Hirschman 1945; Herfindahl 1950),
 *    with Shannon entropy and the inverse-Herfindahl **effective number of
 *    holders**: concentration of *work holding*, never of a person's value. A
 *    span whose work sits behind one holder is a single point of failure even
 *    when its headcount is healthy.
 *  - **Maximum flow / minimum cut** (Ford & Fulkerson 1956; Dinic 1970; Hall's
 *    marriage theorem 1935; König 1931, Egerváry 1931): "can the work be
 *    reabsorbed?" is a bipartite matching with capacities. When it cannot, the
 *    **min-cut is a certificate** — it names the smallest set of open items that
 *    no survivor can hold, which is a proof rather than a plea. Hall's condition
 *    is what makes an "obvious" gap a certified one.
 *  - **Lindley–Smith / Laplace's rule of succession** (Lindley 1965; Smith 1961;
 *    Laplace 1814): a span that has never yet had to run a handover is exactly
 *    the one whose handover is untested. The probability that the *next*
 *    critical event is the first one this span cannot cover is
 *    `(k + 1) / (k + 2)` under a uniform prior on the untested instrument —
 *    which reads uncomfortably high for a span that has never been tested, and
 *    is the honest statement of what a never-tested bench is worth.
 *  - **Cost of vacancy and deprivation cost** (Carley & Lin, 1997, *Journal of
 *    Labor Economics* — vacancy-chain and deprivation-cost accounting;
 *    Becker 1964, human capital; Wright 1993). An empty seat costs money per
 *    day and deprives someone of the work. Only dates and a *declared* daily
 *    cost enter; no valuation of a human being is ever implied.
 *  - **Critical chain / theory of constraints** (Goldratt 1997; Little 1961):
 *    the span with the least *float* before its blanket expires is the binding
 *    constraint, not the span with the most people.
 *  - **Diffusion index** (NBER; Burns & Mitchell 1946): across the whole chain,
 *    the share of spans whose coverage is *shrinking* is a leading indicator
 *    that does not require predicting any single departure.
 *  - **Brier (1950) / log loss / skill score** on frozen readings: a forecast
 *    surface that never grades itself is a horoscope. A negative skill figure is
 *    printed, not smoothed.
 *
 * WHAT THIS MODULE MAY NEVER DO
 * -----------------------------
 * It never rates, ranks, scores or names a person as the subject of a judgement.
 * The subject is a **span** (a seat and the work it holds). `nominatedBy`,
 * `readiness` ratings and self-assessed potential are treated as *claims* — the
 * same discipline the Cross-Examination Terminal applies — and are never an
 * input to a coverage computation. It never infers a departure from a behaviour,
 * never reads `conflicts`, `pulses` or free message text, never values a person,
 * and never reports a rate, probability or money figure below its declared
 * floor. A span nobody has rated is not a healthy span; it is an unmeasured one,
 * and the terminal says so with the same weight it gives a warning.
 */

/* ------------------------------------------------------------- altitudes */

/**
 * The five Jaques altitudes are shared with the Command Chain (ADR-0075). They
 * are duplicated as *keys and ranks only* so this registry stays a leaf; the
 * engine cross-checks them against `ALTITUDES` at boot in the test suite.
 */
export const SUCCESSION_ALTITUDES = Object.freeze([
  Object.freeze({ key: 'frontline', rank: 1, label: 'Frontline lead', horizonDays: 7 }),
  Object.freeze({ key: 'manager', rank: 2, label: 'Manager', horizonDays: 30 }),
  Object.freeze({ key: 'director', rank: 3, label: 'Director', horizonDays: 90 }),
  Object.freeze({ key: 'exec', rank: 4, label: 'VP / executive', horizonDays: 180 }),
  Object.freeze({ key: 'chief', rank: 5, label: 'CEO / C-suite', horizonDays: 365 }),
]);

/**
 * WHAT EACH ALTITUDE OWES THE BENCH — the role-tiered face of one model.
 *
 * §0.3 requires genuinely different duties per altitude, not one screen with a
 * filter. A frontline lead is asked whether a specific person's *week* survives
 * their absence. A chief is asked whether the enterprise's leadership bench
 * survives an adverse seven quarters. Same engine, different question, different
 * unit, different disclosure.
 */
export const SUCCESSION_STANCES = Object.freeze({
  frontline: Object.freeze({
    key: 'frontline',
    question: 'If someone on this team is out on Monday, does the week still happen?',
    unit: 'the individual and the week',
    duties: Object.freeze([
      Object.freeze({ key: 'cross-cover', label: 'Cross-cover', detail: 'Every critical weekly task has a second named person who has actually done it.', routes: Object.freeze(['#/delegations', '#/oneonones']) }),
      Object.freeze({ key: 'handover-note', label: 'Handover note', detail: 'The two things only this person knows are written down somewhere a colleague can reach.', routes: Object.freeze(['#/readiness']) }),
      Object.freeze({ key: 'shadowing', label: 'Shadowing', detail: 'A second person sat in on the recurring commitments, not just heard about them.', routes: Object.freeze(['#/growth']) }),
    ]),
    /** Detail this altitude is handed. Names are appropriate here. */
    disclosure: 'names',
    forbidden: Object.freeze(['priced exposure', 'enterprise diffusion', 'portfolio ranking']),
  }),
  manager: Object.freeze({
    key: 'manager',
    question: 'Which seat in this team would stop working if its holder left, and who could hold it?',
    unit: 'the team and the cycle',
    duties: Object.freeze([
      Object.freeze({ key: 'certify', label: 'Certify the bench', detail: 'Run the flow test on every seat in this team and close what it certifies as blocked.', routes: Object.freeze(['#/readiness', '#/delegations']) }),
      Object.freeze({ key: 'second-holder', label: 'Build a second holder', detail: 'A span with one holder of its work gets a development commitment, not a rating.', routes: Object.freeze(['#/growth', '#/goals']) }),
      Object.freeze({ key: 'feed-up', label: 'Feed the bench upward', detail: 'Name the one seat whose blanket expires first and hand it up with its dates.', routes: Object.freeze(['#/chain']) }),
    ]),
    disclosure: 'names',
    forbidden: Object.freeze(['priced exposure', 'enterprise diffusion', 'board synthesis']),
  }),
  director: Object.freeze({
    key: 'director',
    question: 'Across these teams, where is coverage concentrated behind one person, and what does that cost?',
    unit: 'multiple teams and the quarter',
    duties: Object.freeze([
      Object.freeze({ key: 'concentration', label: 'Concentration', detail: 'Every span whose work sits behind one holder gets a reorganisation or development decision.', routes: Object.freeze(['#/orgdesign', '#/chain']) }),
      Object.freeze({ key: 'pipeline', label: 'Pipeline', detail: 'The bench is measured by flow feasibility, not by readiness labels.', routes: Object.freeze(['#/readiness']) }),
      Object.freeze({ key: 'float', label: 'Float', detail: 'Fund the span with the least float before any span with the most headcount.', routes: Object.freeze(['#/capital']) }),
    ]),
    disclosure: 'unit-leaders',
    forbidden: Object.freeze(['individual readiness notes', 'board synthesis']),
  }),
  exec: Object.freeze({
    key: 'exec',
    question: 'What is the enterprise exposed to if the bench is thinner than the plan assumes, and what is it worth to thicken it?',
    unit: 'the function and the half',
    duties: Object.freeze([
      Object.freeze({ key: 'exposure', label: 'Priced exposure', detail: 'Vacancy cost and expected shortfall per function, with every assumption printed.', routes: Object.freeze(['#/capital', '#/finance']) }),
      Object.freeze({ key: 'diffusion', label: 'Diffusion', detail: 'The share of spans whose coverage is shrinking is a leading indicator; it is not a forecast.', routes: Object.freeze(['#/chain']) }),
      Object.freeze({ key: 'bet', label: 'The bench bet', detail: 'Compare thickening the bench against the returns the capital already funds.', routes: Object.freeze(['#/portfolio']) }),
    ]),
    disclosure: 'counts',
    forbidden: Object.freeze(['individual readiness notes', 'shift coaching detail']),
  }),
  chief: Object.freeze({
    key: 'chief',
    question: 'Does the leadership bench survive an adverse year, and can I say so to a board without over-claiming?',
    unit: 'the enterprise and the year',
    duties: Object.freeze([
      Object.freeze({ key: 'bench-health', label: 'Bench health', detail: 'One number, its floor, its refusals, and the spans that carry it.', routes: Object.freeze(['#/chain', '#/sceptic']) }),
      Object.freeze({ key: 'succession-bet', label: 'Succession as a bet', detail: 'The bench decision priced like any other capital bet, with its own stop rule.', routes: Object.freeze(['#/strategy', '#/portfolio']) }),
      Object.freeze({ key: 'board-line', label: 'Board line', detail: 'A generated sentence that marks every unverified figure and names nobody.', routes: Object.freeze(['#/board']) }),
    ]),
    disclosure: 'counts',
    forbidden: Object.freeze(['individual readiness notes', 'shift coaching detail', 'person-level ranking']),
  }),
});

/* ------------------------------------------------------- coverage layers */

/**
 * The four ways a span can lose its work. They are ordered by how quickly they
 * bind, because a leader can only act on the nearest one.
 *
 * `claim` layers are *declared* and carry no weight in the coverage curve: a
 * readiness rating is an opinion, and the terminal prices opinions separately.
 */
export const COVERAGE_LAYERS = Object.freeze([
  Object.freeze({
    key: 'dated-obligation',
    label: 'Dated obligation',
    weight: 'full',
    detail: 'A commitment with a date the span holds: a delegated deliverable, a goal date, a review, a promise to a stakeholder.',
    evidence: 'the due date itself',
  }),
  Object.freeze({
    key: 'recurring',
    label: 'Recurring commitment',
    weight: 'half',
    detail: 'A cadence the span is on: a 1:1 rhythm, a standing review. It expires when the last one was held plus the cadence period.',
    evidence: 'a held occurrence plus its period',
  }),
  Object.freeze({
    key: 'knowledge',
    label: 'Undocumented knowledge',
    weight: 'none',
    detail: 'What a person knows and nobody wrote down. It cannot be harvested, so it is never counted — and that is printed, because the curve is a lower bound precisely to the extent this layer is real.',
    evidence: 'nothing — not measurable from this record',
  }),
  Object.freeze({
    key: 'claim',
    label: 'Declared readiness',
    weight: 'none',
    detail: 'A nomination or a readiness rating. An opinion about a person, stored as a claim; it never covers work and it is priced separately.',
    evidence: 'a stored rating — a claim, not coverage',
  }),
]);

/* --------------------------------------------------------- the metrics */

/**
 * Every metric this terminal reports, with the named method and the refusal that
 * binds it. The view iterates this array; a new metric is one entry plus one
 * computation, and the method panel updates itself.
 */
export const SUCCESSION_METRICS = Object.freeze([
  Object.freeze({
    key: 'blanket',
    label: 'Blanket',
    unit: 'days',
    method: 'Collective blanket model (Haehling von Lanzenauer & Wright 1991)',
    question: 'How long does the span collectively hold a dated commitment to something?',
    refusal: 'Refused when the span holds no dated obligation at all — an empty blanket is "no evidence of continuity", never "infinite continuity".',
  }),
  Object.freeze({
    key: 'concentration',
    label: 'Concentration',
    unit: 'HHI',
    method: 'Herfindahl–Hirschman index + inverse-HHI effective holders',
    question: 'Is the span’s work held by enough different people that losing one is survivable?',
    refusal: 'Refused below the member floor: an effective-holder count over two people is arithmetic, not a reading.',
  }),
  Object.freeze({
    key: 'reabsorb',
    label: 'Reabsorption',
    unit: 'items',
    method: 'Maximum flow / minimum cut on a bipartite eligibility graph (Ford–Fulkerson; Dinic; Hall 1935)',
    question: 'If this holder left on their next obligation date, could every one of their open items be held by someone who remains?',
    refusal: 'Refused when the span has fewer than two members, or when no survivor has a recorded working relationship with the holder — eligibility is evidence, never a list of names.',
  }),
  Object.freeze({
    key: 'understudy',
    label: 'Understudy risk',
    unit: 'probability',
    method: 'Lindley–Smith single-sample acceptance on the untested handover',
    question: 'This span has never had to run a handover. What is that worth?',
    refusal: 'Refused when the span has a tested handover record: the estimate stops being the right question and the measured rate takes over.',
  }),
  Object.freeze({
    key: 'exposure',
    label: 'Deprivation exposure',
    unit: 'currency',
    method: 'Cost-of-vacancy / deprivation cost (Carley & Lin 1997) with coherent expected shortfall (Artzner et al. 1999)',
    question: 'If the gap opens, what does the uncovered obligation cost per day?',
    refusal: 'Refused without a declared daily cost. Unpriced work is counted and never given a synthetic value; currencies are never summed.',
  }),
  Object.freeze({
    key: 'diffusion',
    label: 'Diffusion',
    unit: 'share',
    method: 'Diffusion index over spans (Burns & Mitchell 1946; NBER)',
    question: 'Is coverage shrinking across the chain, or is this one span?',
    refusal: 'Refused below the span floor: a diffusion index over four spans is a coin toss with a decimal point.',
  }),
  Object.freeze({
    key: 'float',
    label: 'Float',
    unit: 'days',
    method: 'Critical chain / theory of constraints (Goldratt 1997)',
    question: 'Which span binds first?',
    refusal: 'Never refused — but a span with no dates is reported as having no float *and* no evidence, which are different failures.',
  }),
]);

/* ------------------------------------------------------------- verdicts */

export const GAP_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'certified-gap',
    label: 'Certified gap',
    tone: 'bad',
    detail: 'The flow test cannot reabsorb this holder’s open items, and the min-cut names the items that block it. This is a proof, not a warning.',
  }),
  Object.freeze({
    key: 'concentrated',
    label: 'Concentrated',
    tone: 'warn',
    detail: 'Every item can be reabsorbed, but the work sits behind one holder for longer than the declared cap: survivable, and one resignation from becoming a gap.',
  }),
  Object.freeze({
    key: 'covered',
    label: 'Covered',
    tone: 'ok',
    detail: 'Every item has an eligible holder with headroom, and concentration is inside the cap.',
  }),
  Object.freeze({
    key: 'unmeasured',
    label: 'Unmeasured',
    tone: 'neutral',
    detail: 'The span does not hold enough dated, in-scope work or enough members for the test to mean anything. Reported as unmeasured, never as covered.',
  }),
]);

/* --------------------------------------------------------- eligibility */

/**
 * How two people earn the right to hold each other's work — every source is a
 * *record*, not a declaration. A survivor with no recorded relationship to the
 * holder is not eligible, because "I would ask Bo" is the exact belief a
 * succession plan is supposed to replace with evidence.
 */
export const ELIGIBILITY_SOURCES = Object.freeze([
  Object.freeze({ key: 'delegated-together', label: 'Delegated work in the same team', detail: 'Both have received or held a delegation in the same team.', strength: 1 }),
  Object.freeze({ key: 'shared-goal', label: 'Co-owner of a goal', detail: 'Both appear on the same goal — owner or contributor.', strength: 1 }),
  Object.freeze({ key: 'shared-review', label: 'Ran a review loop together', detail: 'Both were interviewers on the same requisition, or both contributed to the same recorded review.', strength: 1 }),
  Object.freeze({ key: 'same-team', label: 'Same team', detail: 'The weakest source: shared a team, so at least the context is shared.', strength: 0.5 }),
  Object.freeze({ key: 'covered-before', label: 'Has held this person’s work before', detail: 'A delegation from this holder to this survivor is already on record.', strength: 2 }),
]);

/* ------------------------------------------------------------- limits */

export const SUCCESSION_LIMITS = Object.freeze({
  // The horizon the terminal reads forward over.
  horizonDays: [28, 1095],
  horizonDaysDefault: 365,
  // Concentration cap: the share of a span's dated work that may sit behind one
  // holder before the span is called concentrated. 40% is the point at which one
  // departure removes more than a third of the work the span has promised.
  concentrationCapPct: [20, 95],
  concentrationCapPctDefault: 40,
  // A span needs this many members before a concentration reading means anything.
  memberFloor: [2, 12],
  memberFloorDefault: 3,
  // A span needs this many dated items before a flow test is quotable.
  itemFloor: [2, 40],
  itemFloorDefault: 3,
  // Headroom is measured against the span's own distribution: a survivor may
  // absorb work up to the declared multiple of the span's median load.
  headroomFactor: [1, 3],
  headroomFactorDefault: 1.5,
  // A span needs this many spans at the level before the diffusion index is read.
  diffusionFloor: [4, 40],
  diffusionFloorDefault: 5,
  // Tasks a scan may open, per span, per 30-day bucket.
  maxTasks: [1, 8],
  maxTasksDefault: 2,
  // Evidence needed before any handover success rate is quoted.
  testedFloor: [2, 40],
  testedFloorDefault: 4,
  // Review horizon for a frozen reading.
  reviewHorizonDays: [14, 365],
  reviewHorizonDaysDefault: 60,
  // How many frozen readings one workspace may hold.
  readingCap: [2, 40],
  readingCapDefault: 12,
  // Display caps.
  maxRows: 60,
  maxMembers: 60,
  maxItems: 400,
  maxBlockingSet: 8,
});

/* ------------------------------------------------------------ the ids */

export const SUCCESSION_RULE_IDS = Object.freeze({
  BLANKET: 'RULE-SUC-01',
  GAP: 'RULE-SUC-02',
  CONCENTRATION: 'RULE-SUC-03',
  GRADING: 'RULE-SUC-04',
  RECONCILE: 'RULE-SUC-05',
});

export const SUCCESSION_SIGNAL_IDS = Object.freeze({
  CERTIFIED_GAP: 'SUC-01',
  BLANKET_EXPIRY: 'SUC-02',
  CONCENTRATED: 'SUC-03',
  UNMEASURED: 'SUC-04',
  UNDERSTUDY: 'SUC-05',
  GRADING_DUE: 'SUC-06',
  DIFFUSION: 'SUC-07',
  NO_CHAIN: 'SUC-08',
});

export const SUCCESSION_EVENTS = Object.freeze({
  FROZEN: 'succession.frozen',
  GRADED: 'succession.graded',
  DELETED: 'succession.deleted',
  SCANNED: 'succession.scan',
  UNDO_GRADE: 'succession.grade_undone',
});

/** The one relation each rule owns. Written only by the rule, never by hand. */
export const SUCCESSION_RELATIONS = Object.freeze([
  Object.freeze({ key: 'benches-for', label: 'Names the seat this bench reading covers' }),
  Object.freeze({ key: 'certifies-gap', label: 'Certifies that the flow test cannot reabsorb these items' }),
  Object.freeze({ key: 'understudies-for', label: 'The development commitment that builds a second holder' }),
  Object.freeze({ key: 'hedges-departure', label: 'The governance decision this concentration reading forced' }),
]);

/**
 * The premise a leader should be able to disagree with, stated on the surface.
 * Every terminal in this workspace carries one so the model is arguable rather
 * than authoritative.
 */
export const SUCCESSION_PREMISE = Object.freeze({
  claim: 'A span’s succession position is a property of the work it holds and who can demonstrably hold it — not of a rating someone gave a person.',
  wouldRefute: 'A span this terminal calls covered loses a holder and drops more than one dated obligation in the following quarter. The frozen reading is graded against exactly that.',
  note: 'Eligibility comes only from recorded working relationships. If the record of who has worked with whom is incomplete, the terminal will over-report gaps — and it prints how many survivor pairs have no recorded relationship at all, so that limitation is visible rather than silent.',
});

/** Altitude-aware disclosure, shared with the seat engine’s vocabulary. */
export const SUCCESSION_DISCLOSURE = Object.freeze({
  names: Object.freeze({ personNames: true, money: false, ranking: false }),
  'unit-leaders': Object.freeze({ personNames: false, money: true, ranking: false }),
  counts: Object.freeze({ personNames: false, money: true, ranking: false }),
});

export function stanceByKey(key) {
  return SUCCESSION_STANCES[key] || SUCCESSION_STANCES.manager;
}

export function altitudeByRank(rank) {
  const row = SUCCESSION_ALTITUDES.find((a) => a.rank === Number(rank));
  return row || SUCCESSION_ALTITUDES[0];
}

export function disclosureFor(key) {
  return SUCCESSION_DISCLOSURE[key] || SUCCESSION_DISCLOSURE.names;
}
