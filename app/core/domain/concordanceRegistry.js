/**
 * app/core/domain/concordanceRegistry.js — Schema v89 / ADR-0083.
 *
 * "The Concordance Terminal": every performance system in the category asks a
 * leader to rate a person against a word — *meets expectations* — and never
 * checks whether the leader and the person mean the same thing by the word.
 * That is a measurement-system problem, not a motivation problem. Two people
 * using two different gauges will produce a review that is *correct on both
 * sides* and still arrive as a surprise.
 *
 * So the unit here is a PAIR (a leader and their report), the object is the
 * INSTRUMENT (six declared expectation dimensions on a five-point bar), and the
 * statistic is INTER-RATER AGREEMENT — not a rating of anyone. The union of
 * those two facts is what no vendor ships: Cohen's weighted κ, Gwet's AC1,
 * PABAK and Bland–Altman limits of agreement computed on the two sides of one
 * expectation, then rolled up the reporting tree with exact partitioning.
 *
 * This registry declares every id, event, dimension, limit and convention. It
 * adds NO second workflow engine: rounds live in one additive collection,
 * cross-module propagation is the existing post-commit spine (ADR-0008), the
 * hierarchy is `person.managerId` → `buildSeats` (ADR-0075/0076), and vertical
 * roll-up is one more rule on that same spine.
 */

export const CONCORDANCE_VERSION = 'expectation-concordance-2026.11-v1';

/** Post-commit rule ids surfaced in the UI, the audit log and the brief. */
export const CONCORDANCE_RULES = Object.freeze({
  ROLLUP: 'RULE-ECN-01',    // closed round → rolls-up-to every leadership ancestor
  RECONTRACT: 'RULE-ECN-02', // divergence → one governed re-contracting decision per pair per ISO week
  MATURITY: 'RULE-ECN-03',   // advisory marker when the workspace reaches the evidence floor
});

export const CONCORDANCE_EVENTS = Object.freeze({
  ROUND_OPENED: 'concordance.round_opened',
  SIDE_SUBMITTED: 'concordance.side_submitted',
  ROUND_CLOSED: 'concordance.round_closed',
  ROUND_WITHDRAWN: 'concordance.round_withdrawn',
  CONVENTIONS_SET: 'concordance.conventions_set',
  SCAN: 'concordance.scan',
  TRIGGER: 'concordance.trigger',
});

export const CONCORDANCE_LIMITS = Object.freeze({
  rounds: 160,       // bounded, capped round ledger
  markers: 600,      // bounded, capped idempotency markers
  noteChars: 280,    // max free text per side, per round
  cycleChars: 24,    // max cycle label length
  history: 6,        // rounds shown per pair in the detail view
  ancestors: 8,      // max leadership ancestors in one roll-up path
});

export const CONCORDANCE_PANELS = Object.freeze(['rounds', 'rollup', 'signals', 'conventions', 'brief']);

/**
 * The instrument. Six dimensions, each an ordinal 1–5 description of HOW MUCH
 * the expectation asks for — never how well a person performed. Every anchor is
 * written so that a leader and a report can both recognise their own view in it
 * without either being told they are wrong; the app measures the distance, it
 * does not adjudicate it.
 *
 * `biasHigh` is the sentence printed when the LEADER's bar sits above the
 * report's on that dimension; `biasLow` is the reverse. Both are deliberately
 * about the expectation, never about the person holding it.
 */
export const CONCORDANCE_DIMENSIONS = Object.freeze([
  Object.freeze({
    key: 'done',
    label: 'Definition of done',
    short: 'Done',
    question: 'When is a piece of work finished?',
    anchors: Object.freeze(['A working version is enough', 'The obvious parts work', 'The agreed checklist is complete', 'Complete and reviewed by someone else', 'Complete, documented, and another person could run it without asking']),
    biasHigh: 'The leader treats “done” as complete and handed over; the report treats a working version as done.',
    biasLow: 'The report holds a stricter finish line than the leader has ever stated.',
  }),
  Object.freeze({
    key: 'quality',
    label: 'Quality bar',
    short: 'Quality',
    question: 'How good does “good” have to be?',
    anchors: Object.freeze(['Good enough not to break', 'Clean enough to read', 'Meets the written standard', 'Would survive a picky customer', 'Would defend it in front of the board']),
    biasHigh: 'The leader is holding a quality bar the report has never had written down.',
    biasLow: 'The report is polishing to a standard nobody asked for — cost the leader cannot see.',
  }),
  Object.freeze({
    key: 'priority',
    label: 'Priority order',
    short: 'Priority',
    question: 'What outranks what when the week is full?',
    anchors: Object.freeze(['Whatever is loudest today', 'The nearest deadline', 'The agreed quarterly priority', 'Only the declared strategic bet', 'Only the declared strategic bet, and nothing else proceeds without a decision']),
    biasHigh: 'The leader expects work refused unless it serves the declared bet; the report is still serving whoever asked last.',
    biasLow: 'The report is refusing more than the leader expected — check whether that refusal is right or a workaround.',
  }),
  Object.freeze({
    key: 'autonomy',
    label: 'Latitude to decide alone',
    short: 'Latitude',
    question: 'What may be decided without asking?',
    anchors: Object.freeze(['Ask before acting', 'Ask on anything irreversible', 'Decide inside the agreed budget and scope', 'Decide and inform afterwards', 'Decide, inform, and own the trade-off in the open']),
    biasHigh: 'The leader believes they granted latitude the report does not believe they have.',
    biasLow: 'The report is deciding more unilaterally than the leader knows about — the boundary was never stated.',
  }),
  Object.freeze({
    key: 'escalate',
    label: 'Escalation threshold',
    short: 'Escalation',
    question: 'How early should a risk reach the leader?',
    anchors: Object.freeze(['Only when it has broken', 'When it has already cost a day', 'When a date is at risk', 'At the first sign the plan is wrong', 'At the first hint of drift, before it is a problem']),
    biasHigh: 'The leader asked to hear early; the report is waiting until it is certain.',
    biasLow: 'The report is escalating earlier than the leader wants — a cost in the leader’s hours, not a fault in the report.',
  }),
  Object.freeze({
    key: 'pace',
    label: 'Pace and trade-offs',
    short: 'Pace',
    question: 'What is expected when speed and completeness collide?',
    anchors: Object.freeze(['Steady — quality over speed', 'On the agreed date', 'On the date, with scope cut only by agreement', 'Sooner if a documented trade is worth it', 'Sooner, and propose the trade rather than asking for it']),
    biasHigh: 'The leader expects speed with a proposed trade-off; the report believes cutting scope is forbidden.',
    biasLow: 'The report is trading scope to hold dates in ways the leader has not seen.',
  }),
]);

export const CONCORDANCE_DIMENSION_KEYS = Object.freeze(CONCORDANCE_DIMENSIONS.map((d) => d.key));

/** The declared scale: five ordinal points, always. A pair using two points does not get a shorter ruler. */
export const CONCORDANCE_SCALE = 5;

/**
 * Every number is a declared, editable convention — never a measured fact. The
 * defaults mirror the codebase's other calibration ledgers (counts refused
 * below n=5) and the ITSM human-in-the-loop confidence gates.
 */
export const CONCORDANCE_CONVENTION_DEFAULTS = Object.freeze({
  concordanceAgreementFloorPct: 60, // weighted κ below this counts as "not the same word"
  concordanceCellFloor: 5,          // closed rounds required before a span rate is printed
  concordanceEvidenceFloor: 3,      // closed rounds required before the workspace advisory fires
  concordanceRetestDays: 21,        // a re-contracted expectation must be re-tested inside this window
  concordanceReviewDays: 14,        // review horizon on a governed re-contracting decision
  concordanceAutoPropagate: true,   // pausable; an explicit scan always runs
});

/**
 * Why the disclosure ladder is not "role-based dashboards". At frontline and
 * manager rank the leader reads the pair and the two gauges; at director rank
 * the unit is a span (rates and dimension profile, individual gauges withheld);
 * at executive and chief rank the roll-up is an aggregate with the composition
 * printed. This is the ADR-0076 RECORD_CLASSES ladder applied to CONCORDANCE.
 */
export const CONCORDANCE_DISCLOSURE = Object.freeze({
  names: 'Pair detail — the leader who owns the relationship reads both gauges.',
  unit: 'Span rates and the dimension profile — the director asks which span diverges, not what one person answered.',
  aggregate: 'Span aggregates only — the executive/chief asks what the org-level signal is; individual gauges never climb.',
  local: 'Local workflow boundary, not authenticated multi-user security. Anyone controlling this browser or a full backup can read a sealed side.',
  sealed: 'A side is sealed until both sides are in. Sealing is a read-model and UI guarantee on one device — it prevents anchoring, not a determined reader with the backup file.',
  instrument: 'This instrument measures AGREEMENT between two people about an expectation. It does not measure performance, potential, effort, attitude or worth, and no figure here may be used as evidence against a person.',
  statistics: 'κ, AC1 and PABAK are agreement statistics on six declared items. Six items is the instrument, not a sample: intervals are wide, and no figure below the item floor is printed at all.',
  truth: 'Agreement is not correctness. Two people can agree precisely on the wrong bar — that is why the module prints a shared-error warning instead of a green light.',
  causality: 'The re-test comparison is an association between pairs that ran a second round and pairs that did not. It is not an effect, and it is not printed below its evidence floor.',
});

/** FNV-1a 32-bit over the reporting path — content addressing, not crypto. */
export function concordanceFingerprint(text) {
  const input = String(text ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The key a pair is identified by. One open round per pair per cycle. */
export function concordancePairKey(leaderId, memberId) {
  return `${String(leaderId || '')}|${String(memberId || '')}`;
}
