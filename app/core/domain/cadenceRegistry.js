/**
 * app/core/domain/cadenceRegistry.js — canonical vocabulary for the Operating
 * Cadence Clock (`#/cadence`, Schema v93, ADR-0087).
 *
 * Leaf registry importing only `chainRegistry.js`, so `schema.js`,
 * `cadenceSchema.js`, `cadence.js`, `cadenceRules.js`, `csv.js` and
 * `views/cadence.js` share one source of truth without circular dependencies.
 *
 * THE GAP THIS NAMES
 * ------------------
 * Every other module asks what a leader should decide. None asked the question
 * that decides whether any of it can happen: *which standing forum is competent
 * to close this item, when does that forum next sit, and can it physically carry
 * the agenda that is converging on it?* In the searched 2026 category
 * (Lattice / 15Five / Leapsome 1:1 + review tooling, Culture Amp, Viva Glint,
 * Workday, Asana/Monday/Linear project views, Loom & Fellow meeting tools,
 * Perceptyx, Betterworks) the calendar is a scheduling convenience and the
 * decision log is a separate system. Nobody models the *governance calendar as a
 * finite decision machine* with a queue, a service time, a breach probability and
 * a routing cost. This registry is the vocabulary for that machine.
 *
 * NAMED TECHNIQUES (Section 0.2) — implemented in `cadence.js`, named here
 * --------------------------------------------------------------------------
 *  - Jaques (1956) time-span of discretion: reused from `chainRegistry.js`; a
 *    forum's horizon is the longest commitment it may close.
 *  - Goldratt & Cox, *The Goal* (1984) and Goldratt (1997) Theory of
 *    Constraints: the constraint is the forum, never the individual. Capacity is
 *    declarative per forum and per item class.
 *  - Little (1961) L = λW and Kingman (1961) congestion: a forum is a single
 *    server; expected flow time and queue length are computed, not guessed.
 *  - Sakasegawa (1977) / Erlang-C equivalents: P(wait) for a finite-population
 *    finite-capacity server, printed with its independence assumption.
 *  - Harrison & Hastie (2006) / Kahneman & Lovallo (1993): the **planning
 *    fallacy**, measured per input class as the ratio of actual service time to
 *    the leader's own submitted estimate at intake.
 *  - PDCA (Shewhart 1939; Deming 1950) and Deming's red-bead lesson: a forum
 *    that never closes anything is not a control loop, it is a meeting.
 *  - Conway (1968) and Skelton & Pais, *Team Topologies* (2019): a forum whose
 *    membership does not mirror the spans that own the decisions cannot close
 *    them; the topology mismatch is computed from the roster, not asserted.
 *  - Theory of Swift, Even Flow (Schmenner 2004): throughput is maximised by
 *    even flow, so variance in arrival is a first-class constraint.
 *  - Ashby (1956) requisite variety: the forum's decision variety must match the
 *    variety of items arriving at it.
 *
 * Purity: no DOM, no storage, no clock globals, no network. Every figure is
 * re-derived on read; only frozen readings are stored.
 */

import { ALTITUDES, ALTITUDE_KEYS } from './chainRegistry.js';

export const CADENCE_ENGINE_VERSION = 'operating-cadence-2026.11-v1';

/* ------------------------------------------------------------------ forums */

/**
 * A standing forum is a governance server. `serviceDays` is the declarative
 * per-item service time (see `FORUM_SERVICE_DAYS`); `decisionCapacity` is the
 * number of binding decisions one sitting can plausibly produce, which is the
 * only capacity a forum has that matters.
 */
export const FORUM_KINDS = Object.freeze([
  'operating-review',
  'business-review',
  'portfolio-review',
  'risk-review',
  'talent-review',
  'board-review',
  'leadership-sync',
]);

export const FORUM_KIND_LABELS = Object.freeze({
  'operating-review': 'Operating review (weekly delivery, blockers, commitments)',
  'business-review': 'Business / quarterly review (targets, trade-offs, resourcing)',
  'portfolio-review': 'Portfolio & investment review (capital, bets, stop rules)',
  'risk-review': 'Risk & assurance review (enterprise risk, controls, mitigation)',
  'talent-review': 'Talent & succession calibration (bench, coverage, pipeline)',
  'board-review': 'Board / investor review (enterprise synthesis, strategy bets)',
  'leadership-sync': 'Leadership team sync (cross-functional coordination)',
});

/**
 * Which input classes each forum kind is COMPETENT to close. This is the routing
 * table: an item arriving at a forum that cannot close it is a defect, not noise.
 * Derived from each altitude's declared `decisionForm` and `forbidden` list in
 * `chainRegistry.js` — a frontline operating review may not close a capital
 * decision, and a board review should not be spent on a shift roster.
 */
export const FORUM_COMPETENCE = Object.freeze({
  'operating-review': Object.freeze(['execution-blocker', 'commitment-slip', 'quality-defect', 'staffing-gap']),
  'business-review': Object.freeze(['outcome-miss', 'investment-tradeoff', 'staffing-gap', 'structural-misfit']),
  'portfolio-review': Object.freeze(['investment-tradeoff', 'outcome-miss', 'structural-misfit']),
  'risk-review': Object.freeze(['quality-defect', 'outcome-miss', 'structural-misfit', 'commitment-slip']),
  'talent-review': Object.freeze(['staffing-gap', 'structural-misfit', 'outcome-miss']),
  'board-review': Object.freeze(['investment-tradeoff', 'outcome-miss', 'structural-misfit']),
  'leadership-sync': Object.freeze(['execution-blocker', 'staffing-gap', 'structural-misfit', 'commitment-slip']),
});

export const FORUM_CADENCES = Object.freeze([
  'daily',
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
]);

export const FORUM_CADENCE_DAYS = Object.freeze({
  daily: 1,
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  quarterly: 91,
  semiannual: 182,
  annual: 365,
});

export const FORUM_CADENCE_LABELS = Object.freeze({
  daily: 'Daily',
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiannual: 'Semi-annual',
  annual: 'Annual',
});

export const FORUM_STATUSES = Object.freeze(['active', 'paused', 'retired']);

export const FORUM_STATUS_LABELS = Object.freeze({
  active: 'Active (sits on cadence)',
  paused: 'Paused (no sitting scheduled)',
  retired: 'Retired (history kept, no further sittings)',
});

export const SESSION_STATUSES = Object.freeze(['scheduled', 'held', 'cancelled']);

export const SESSION_STATUS_LABELS = Object.freeze({
  scheduled: 'Scheduled',
  held: 'Sat (agenda carried)',
  cancelled: 'Cancelled (cadence slip recorded)',
});

/* ------------------------------------------------------------ input classes */

/**
 * The taxonomy of governance inputs. Each class declares:
 *
 *   reviewable   — can a forum close it at all? (a fact-incomplete item cannot)
 *   horizonDays  — the minimum time-span of discretion needed to close it; a
 *                  forum whose horizon is shorter is not competent, even if its
 *                  kind is listed in `FORUM_COMPETENCE`
 *   serviceDays  — nominal forum service time once the item is on an agenda
 *   forums       — the forum kinds competent at this class (derived alongside
 *                  `FORUM_COMPETENCE`; kept here so an item with no forum can
 *                  say *why* rather than silently disappearing)
 */
export const INPUT_CLASSES = Object.freeze([
  Object.freeze({
    key: 'execution-blocker',
    label: 'Execution blocker',
    reviewable: true,
    horizonDays: 7,
    serviceDays: 3.5,
    question: 'What is stopping work that is already committed?',
    forums: Object.freeze(['operating-review', 'leadership-sync']),
  }),
  Object.freeze({
    key: 'commitment-slip',
    label: 'Commitment slip / renegotiation',
    reviewable: true,
    horizonDays: 7,
    serviceDays: 5,
    question: 'Which promise moves, by how much, and who is told?',
    forums: Object.freeze(['operating-review', 'risk-review', 'leadership-sync']),
  }),
  Object.freeze({
    key: 'quality-defect',
    label: 'Quality / control defect',
    reviewable: true,
    horizonDays: 7,
    serviceDays: 7,
    question: 'What failed, how was it detected, and what closes the failure mode?',
    forums: Object.freeze(['operating-review', 'risk-review']),
  }),
  Object.freeze({
    key: 'staffing-gap',
    label: 'Staffing & capability gap',
    reviewable: true,
    horizonDays: 30,
    serviceDays: 21,
    question: 'Which span is short of a person, a skill or a coverage plan?',
    forums: Object.freeze(['business-review', 'talent-review', 'leadership-sync']),
  }),
  Object.freeze({
    key: 'outcome-miss',
    label: 'Outcome miss against a declared target',
    reviewable: true,
    horizonDays: 90,
    serviceDays: 30,
    question: 'Is this execution, thesis or measurement — and which changes?',
    forums: Object.freeze(['business-review', 'portfolio-review', 'risk-review', 'talent-review', 'board-review']),
  }),
  Object.freeze({
    key: 'investment-tradeoff',
    label: 'Investment / capital trade-off',
    reviewable: true,
    horizonDays: 180,
    serviceDays: 45,
    question: 'Which funded thing stops so this funded thing can start?',
    forums: Object.freeze(['business-review', 'portfolio-review', 'board-review']),
  }),
  Object.freeze({
    key: 'structural-misfit',
    label: 'Structural misfit (Conway mismatch, span, ownership)',
    reviewable: true,
    horizonDays: 180,
    serviceDays: 60,
    question: 'Does the structure that produced this result need to change?',
    forums: Object.freeze(['business-review', 'portfolio-review', 'risk-review', 'talent-review', 'board-review']),
  }),
  // The refusal class. An item whose facts are not yet in hand cannot be closed
  // by ANY forum; it belongs to the evidence supply chain. Modelling it keeps
  // such items out of every capacity calculation instead of inflating them.
  Object.freeze({
    key: 'unreviewable',
    label: 'Not yet reviewable (facts incomplete)',
    reviewable: false,
    horizonDays: null,
    serviceDays: null,
    question: 'What fact is missing, and who is capturing it?',
    forums: Object.freeze([]),
  }),
]);

export const INPUT_CLASS_KEYS = Object.freeze(INPUT_CLASSES.map((c) => c.key));

export const INPUT_CLASS_BY_KEY = Object.freeze(
  Object.fromEntries(INPUT_CLASSES.map((c) => [c.key, c])),
);

/* -------------------------------------------------------- capacity conventions */

/**
 * Verdict bands for effective forum utilisation ρ (arrival demand ÷ service
 * capacity). These are Sakasegawa/Kingman operating bands, declared as
 * conventions rather than fitted — the classic queueing result is that waiting
 * time is convex in ρ and rises steeply above ~0.8.
 */
export const UTILISATION_BANDS = Object.freeze([
  Object.freeze({ key: 'slack', maxRho: 0.6, label: 'Slack', tone: 'good', verdict: 'The forum has room; it can absorb an unplanned item this cycle.' }),
  Object.freeze({ key: 'balanced', maxRho: 0.85, label: 'Balanced', tone: 'good', verdict: 'The forum is loaded but stable; queueing delay stays close to service time.' }),
  Object.freeze({ key: 'critical', maxRho: 1.0, label: 'Critical', tone: 'caution', verdict: 'Demand is at capacity: waiting time rises faster than work arrives, and one absence breaks the cadence.' }),
  Object.freeze({ key: 'congested', maxRho: Infinity, label: 'Congested', tone: 'bad', verdict: 'Demand exceeds capacity: the agenda grows every cycle and the queue has no steady state.' }),
]);

export const CONSTRAINT_TYPES = Object.freeze([
  'forum-capacity',
  'service-time',
  'competence-gap',
  'topology-mismatch',
  'unreviewable',
  'none',
]);

export const CONSTRAINT_TYPE_LABELS = Object.freeze({
  'forum-capacity': 'Forum decision capacity (Theory of Constraints)',
  'service-time': 'Service time vs. interval (the clock cannot keep up)',
  'competence-gap': 'No competent forum for the input class',
  'topology-mismatch': 'Forum membership does not mirror the spans that own the work (Conway)',
  unreviewable: 'Inputs that are not yet reviewable at all',
  none: 'No binding constraint detected',
});

export const TOPOLOGY_PATTERNS = Object.freeze([
  'mirrored',
  'narrower-than-work',
  'wider-than-work',
  'disjoint',
  'unmodelled',
]);

export const TOPOLOGY_PATTERN_LABELS = Object.freeze({
  mirrored: 'Mirrored — membership spans every owning seat',
  'narrower-than-work': 'Too small — the forum under-covers the spans that own its work',
  'wider-than-work': 'Oversized — decision variety exceeds the arriving queue',
  disjoint: 'Disjoint — no member owns any arriving item',
  unmodelled: 'Unmodelled — no roster evidence to test the pattern',
});

/* ---------------------------------------------------------------- rule ids */

export const CADENCE_RULE_IDS = Object.freeze({
  QUEUE: 'RULE-CAD-01',
  CONSTRAINT: 'RULE-CAD-02',
  FIT: 'RULE-CAD-03',
  GRADING: 'RULE-CAD-04',
});

export const CADENCE_EVENTS = Object.freeze({
  FORUM_DECLARED: 'cadence.forum.declared',
  FORUM_RETIRED: 'cadence.forum.retired',
  SESSION_LOGGED: 'cadence.session.logged',
  ITEM_FILED: 'cadence.item.filed',
  ITEM_ROUTED: 'cadence.item.routed',
  READING_FROZEN: 'cadence.reading.frozen',
  GRADED: 'cadence.reading.graded',
  SCAN: 'cadence.scan',
});

/* ------------------------------------------------------------------ panels */

export const CADENCE_PANELS = Object.freeze([
  'clock',
  'workbench',
  'constraint',
  'fit',
  'brief',
]);

/* --------------------------------------------------------------- conventions */

export const CADENCE_DEFAULTS = Object.freeze({
  cadenceFloorN: 5,
  cadenceCellFloor: 3,
  cadenceUtilisationTargetPct: 85,
  cadencePlanningFactorPct: 130,
  cadenceFlowTargetDays: 14,
  cadenceAutoPropagate: true,
});

export const CADENCE_BOUNDS = Object.freeze({
  cadenceFloorN: Object.freeze([3, 20]),
  cadenceCellFloor: Object.freeze([2, 10]),
  cadenceUtilisationTargetPct: Object.freeze([50, 95]),
  cadencePlanningFactorPct: Object.freeze([100, 250]),
  cadenceFlowTargetDays: Object.freeze([3, 90]),
});

export const CADENCE_LIMITS = Object.freeze({
  forums: 40,
  sessions: 600,
  readings: 120,
  markers: 400,
});

/* ------------------------------------------------------- altitude playbook */

/**
 * What each altitude actually *runs*, as opposed to what it decides. Aligned to
 * `ALTITUDES` in `chainRegistry.js` (7 / 30 / 90 / 180 / 365 days).
 */
export const CADENCE_ALTITUDE_PLAYBOOK = Object.freeze(
  ALTITUDES.map((alt) => {
    const byKey = {
      frontline: {
        ownsForums: Object.freeze(['daily', 'weekly']),
        defaultForumKinds: Object.freeze(['operating-review']),
        clockQuestion: 'Does every blocker raised this week get closed this week?',
        disclosure: 'names',
        capacityNote: 'One 30-minute huddle is roughly three closures; beyond that the huddle becomes a status report.',
      },
      manager: {
        ownsForums: Object.freeze(['weekly', 'fortnightly', 'monthly']),
        defaultForumKinds: Object.freeze(['operating-review', 'leadership-sync']),
        clockQuestion: 'Is cross-team coordination resolved before it becomes an escalation?',
        disclosure: 'names',
        capacityNote: 'A weekly managers\' review closes roughly five trade-offs; the sixth becomes a queue.',
      },
      director: {
        ownsForums: Object.freeze(['monthly', 'quarterly']),
        defaultForumKinds: Object.freeze(['business-review', 'operating-review']),
        clockQuestion: 'Which functional trade-off is decided in the cycle it was raised, and which is deferred twice?',
        disclosure: 'unit',
        capacityNote: 'A quarterly functional review closes roughly nine items; the constraint is preparation, not the sitting.',
      },
      exec: {
        ownsForums: Object.freeze(['monthly', 'quarterly', 'semiannual']),
        defaultForumKinds: Object.freeze(['portfolio-review', 'business-review', 'risk-review']),
        clockQuestion: 'Is the portfolio stopping things as fast as it starts them?',
        disclosure: 'aggregate',
        capacityNote: 'A steering committee holds roughly four binding decisions; anything more is a presentation.',
      },
      chief: {
        ownsForums: Object.freeze(['quarterly', 'semiannual', 'annual']),
        defaultForumKinds: Object.freeze(['board-review', 'portfolio-review', 'talent-review']),
        clockQuestion: 'Does the board see enterprise risk to the same clock the business is deciding on?',
        disclosure: 'aggregate',
        capacityNote: 'A board cycle has one agenda and one capital decision; a second capital decision costs a quarter.',
      },
    }[alt.key];
    return Object.freeze({
      key: alt.key,
      rank: alt.rank,
      label: alt.label,
      shortLabel: alt.shortLabel,
      horizonDays: alt.horizonDays,
      ...byKey,
    });
  }),
);

export { ALTITUDE_KEYS };

/**
 * A deterministic reason string for a refusal. Every refusal in this module is
 * printed with the number that produced it; an unexplained refusal is a bug.
 */
export function refusalLine(reason, detail) {
  return detail ? `${reason} — ${detail}` : reason;
}
