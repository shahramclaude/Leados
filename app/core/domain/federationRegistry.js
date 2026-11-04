/**
 * app/core/domain/federationRegistry.js — the Programme Federation Reading
 * (ADR-0090, Schema v95).
 *
 * THE QUESTION. Every module so far builds the hierarchy from DECLARATIONS:
 * `person.managerId`, a chain node, a seat's rank. Nothing measures whether the
 * declared edge above a span is actually USED. A declared edge with no carriage
 * is a hierarchy that exists on paper: the span reports to someone who never
 * receives anything from it, and the span has no direct line to the level above.
 *
 * THE MEASUREMENT. For every declared child→parent edge this module counts
 * DATED CARRIAGE: records produced inside the child's span that arrived at the
 * parent or above it, through named channels that already exist in this
 * workspace (attested packet carriage, frozen renewal readings, agreed Catchball
 * commitments, closed two-sided expectation rounds, frozen cadence readings).
 * Nothing here is authored by a rule: the reading measures what other modules
 * already wrote, so a span cannot improve its score by writing to this module.
 *
 * FRAMEWORKS ENCODED (named, not paraphrased):
 *  - Jaques' time span of discretion: the unit of analysis is a SPAN with a
 *    horizon, never a person, so a slower level is not scored as a worse level.
 *  - Beer, Viable System Model: System 3 needs a requisite information channel
 *    from System 1. A declared edge without a channel is a variety filter, not
 *    a reporting line, and the thesis (VSM) says the system is not viable there.
 *  - Burt, structural holes: when carriage reaches the level above the parent
 *    but never the parent itself, the parent is a structural hole in the
 *    information path. That is measured as `bypass`, never called misconduct.
 *  - Wilson score interval: the coverage rate is published with a bounded
 *    interval, and is REFUSED below the declared span floor rather than shown
 *    as a confident percentage of two.
 *  - Statistical disclosure control (small-cell suppression, complementary
 *    suppression, minimum-aggregate rules): executive rows publish counts, and
 *    a small cell blanks a second cell in the same total so a parent aggregate
 *    cannot be differenced against its children.
 *  - Measurement-system analysis (DMAIC, MSA): this screen measures the
 *    MEASUREMENT SYSTEM of the hierarchy, not the people inside it. Gage
 *    repeatability is why every state names the channel that produced it.
 *  - Fail-closed defaults: an unknown or undeclared connection is `silent`, an
 *    unmeasurable rate is WITHHELD, and a blank is never reported as zero.
 */

export const FEDERATION_ENGINE_VERSION = 'programme-federation-v1';

export const FEDERATION_LIMITS = Object.freeze({
  rows: 160,
  assessments: 120,
  markers: 900,
  channels: 8,
  decisionsPerScan: 40,
  windowDaysMin: 7,
  windowDaysMax: 365,
  minSpansFloor: 3,
  minSpansCeil: 20,
  cellFloorMin: 2,
  cellFloorMax: 10,
});

export const FEDERATION_DEFAULTS = Object.freeze({
  federationWindowDays: 30,
  federationMinSpans: 5,
  federationCellFloor: 3,
  federationAutoPropagate: true,
});

export const FEDERATION_RULE_IDS = Object.freeze({
  measured: 'RULE-FED-01',
  silent: 'RULE-FED-02',
  recover: 'RULE-FED-03',
});

export const FEDERATION_EVENTS = Object.freeze({
  ASSESSED: 'federation.assessed',
  SCAN: 'federation.scan',
  CONVENTIONS: 'federation.conventions',
});

export const FEDERATION_TRIGGER_PREFIX = 'federation.';

/** Connection states. Ordered from strongest evidence to none. */
export const FEDERATION_STATES = Object.freeze(['direct', 'bypass', 'stale', 'silent', 'root']);

export const FEDERATION_STATE_META = Object.freeze({
  direct: Object.freeze({
    label: 'Connected',
    tone: 'good',
    meaning: 'Carriage from this span reached the span above it inside the window.',
    next: 'Keep the channel that worked; the reading asks nothing of anyone.',
  }),
  bypass: Object.freeze({
    label: 'Bypassed',
    tone: 'warn',
    meaning: 'Carriage from this span reached a level ABOVE its parent but never the parent: the declared edge is a structural hole.',
    next: 'Decide whether the parent should be in the path or whether the declared line is wrong. The engine changes neither.',
  }),
  stale: Object.freeze({
    label: 'Stale',
    tone: 'warn',
    meaning: 'Carriage exists, but the most recent one is older than the declared window.',
    next: 'Re-establish a dated channel, or record why this level only needs periodic carriage.',
  }),
  silent: Object.freeze({
    label: 'Silent',
    tone: 'bad',
    meaning: 'No carriage from this span ever reached the span above it in the measured ledger.',
    next: 'This is a measurement finding about the EDGE, not a rating of anyone. Name the channel that should carry the work.',
  }),
  root: Object.freeze({
    label: 'Top of the tree',
    tone: 'neutral',
    meaning: 'There is no leadership span above this one in the declared tree, so there is no edge to measure.',
    next: 'Nothing to connect. The honest reading is that this span is the top of what this workspace declares.',
  }),
});

/**
 * The measured channels. Each one is an EXISTING module's dated artefact; this
 * module adds no writer to any of them. `source` names the collection the
 * events are read from, so a channel that disappears degrades to zero evidence
 * with a printed reason instead of a silently better score.
 */
export const FEDERATION_CHANNELS = Object.freeze([
  Object.freeze({
    key: 'packet',
    label: 'Attested packet carriage',
    source: 'exchangePackets',
    ruleId: 'RULE-ENV-01',
    detail: 'An ingested inbound packet carried to a leadership span by the envoy carriage rule. The strongest channel: the receiver re-derived every item hash before storing anything.',
  }),
  Object.freeze({
    key: 'renewal',
    label: 'Frozen renewal reading',
    source: 'strategyCycles',
    ruleId: 'RULE-SCR-01',
    detail: 'A frozen, identity-reduced strategy renewal reading taken inside the span. A frozen reading is itself an upward report, so it carries to the span’s nearest leadership ancestor.',
  }),
  Object.freeze({
    key: 'commitment',
    label: 'Agreed commitment',
    source: 'catchballPacts',
    ruleId: 'RULE-HK-01',
    detail: 'A Catchball pact the span accepted from a seat above it. The acceptance is the carriage: it travels to the seat that proposed the commitment.',
  }),
  Object.freeze({
    key: 'concordance',
    label: 'Closed expectation round',
    source: 'expectationRounds',
    ruleId: 'RULE-ECN-01',
    detail: 'A two-sided expectation round that closed with both sides in. The member’s side travelling to the leader is the carriage; an open round carries nothing yet.',
  }),
  Object.freeze({
    key: 'cadence',
    label: 'Frozen cadence reading',
    source: 'cadenceReadings',
    ruleId: 'RULE-CAD-01',
    detail: 'A frozen operating-cadence reading taken by the span. The governance reading travels to the span’s nearest leadership ancestor.',
  }),
]);

export const FEDERATION_CHANNEL_KEYS = Object.freeze(FEDERATION_CHANNELS.map((channel) => channel.key));

/**
 * Five altitude-specific decisions. The reading is the same measurement at every
 * altitude; what changes is the span of control, the horizon, and the question
 * the level above is competent to answer.
 */
export const FEDERATION_PLAYBOOK = Object.freeze({
  frontline: Object.freeze({
    title: 'Does my work reach my lead?',
    horizon: 'Next 7–30 days',
    question: 'Did anything I produced this window actually arrive at the span above me, and what did not?',
    see: 'Your own span’s measured channels: what was carried, when, and what is silent.',
    act: 'Name the missing carriage in your next 1:1 and agree one dated channel. The engine sends nothing on your behalf.',
    hand: 'A named gap and a date; never a self-rating and never a claim about your lead’s intent.',
  }),
  manager: Object.freeze({
    title: 'Which of my spans are connected?',
    horizon: '30–90 days',
    question: 'Which spans under me actually carry work upward, and which are silent or bypassed?',
    see: 'Per-child state with the channel that proves it; sibling detail is withheld.',
    act: 'Open a direct, dated channel to any silent span. A bypass is a decision about the declared line, not a fault to punish.',
    hand: 'The count connected, the count silent, and the one edge you can fix inside your own horizon.',
  }),
  director: Object.freeze({
    title: 'Is the chain above me real?',
    horizon: '90–180 days',
    question: 'Is work from the teams below reaching me through the declared line, or arriving from above it?',
    see: 'Span-level carriage for the whole of your span; peer directors are aggregates only.',
    act: 'Where carriage bypasses a manager, decide whether the line or the practice is wrong, and record the decision.',
    hand: 'A coverage rate with its interval and a named list of silent edges; no person is named or rated.',
  }),
  exec: Object.freeze({
    title: 'Programme coverage',
    horizon: '180–365 days',
    question: 'What share of leadership spans in this programme is measurably connected to the span above it?',
    see: 'Rate with a Wilson interval, refused below the span floor; per-directorate counts with complementary suppression.',
    act: 'Authorise an operating review of the silent edges, or accept the declared tree as documentation rather than as an information path.',
    hand: 'A bounded coverage figure and the explicit statement of what the aggregate cannot scope.',
  }),
  chief: Object.freeze({
    title: 'Enterprise federation',
    horizon: '365–730 days',
    question: 'Is the whole house one connected system, or a set of declared lines with no measured traffic?',
    see: 'Counts by altitude and channel workspace-wide; no span names, no person, no title.',
    act: 'Record the enterprise decision. Coverage is a measurement of the information system, never of the people in it.',
    hand: 'A dated, aggregate-only statement that a declaration is not a channel.',
  }),
});

export const FEDERATION_DISCLOSURE = Object.freeze({
  local: 'Operating seats are local workflow declarations, not authenticated multi-user security. Carriage is measured inside this workspace ledger only: a span legitimately carrying work through a channel this workspace cannot see reads as silent, and the screen says so.',
  carriage: 'Carriage counts DATED ARTEFACTS other modules already wrote. Nothing is inferred from titles, notes or intent, and this module never writes into a measured channel, so a span cannot improve its own reading.',
  coverage: 'Coverage is a share of DECLARED leadership edges with measured carriage inside the window. It is a property of the information system, not of any person, and small cells are suppressed with a complementary cell so a child span cannot be recovered by subtracting it from a published parent total.',
  rollup: 'A frozen assessment contains span ids, counts, dates and state names. It never copies a pact title, a decision question, a reading’s free text or a person’s name into the snapshot.',
  engine: 'The engine opens governed decisions and writes typed provenance. It never sends a message, never changes a reporting line, never closes a decision a human opened, and never rates a person.',
});

export const FEDERATION_PREMISE =
  'This screen measures the MEASUREMENT SYSTEM of the hierarchy — whether the declared edge above a span carries any dated artefact — and refuses to treat a declaration as evidence of a working channel.';
