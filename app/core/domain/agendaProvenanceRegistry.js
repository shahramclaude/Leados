/**
 * app/core/domain/agendaProvenanceRegistry.js — the provenance vocabulary for the
 * 1:1 agenda ledger (ADR-0113, Session 153).
 *
 * THE GAP
 * -------
 * Fourteen-odd rules on the shared spine push prompts onto a person's
 * `talkingPoints` — the "topics they want to raise" list. Every one of them is
 * the *leader's* agenda, written into the *report's* waiting list. The record
 * shows them all as identical strings in one array, so three different duties
 * become one indistinguishable pile:
 *
 *   1. a question the leader owes the person (case support, a returned
 *      delegation, a stop-rule on an exploratory bet),
 *   2. a structural prompt that is not really about the person at all (a
 *      per-person cooldown marker after a load shed), and
 *   3. something the person genuinely raised.
 *
 * Frontline reality, which the product was getting wrong: a lead's next 1:1
 * starts from a queue where the person's own topic is buried under twelve
 * engine prompts. ADR-0134 replaced the accidental truncation this file used to
 * describe: `normalizeTalkingPoints` kept the first twelve while the rules that
 * write prompts bounded themselves with `.slice(-30)`, so the prompt a rule had
 * just written was the first thing a reload deleted. One declared policy now
 * governs the cap (their topics first, engine prompts newest-first) and reports
 * what it refuses. The lead still cannot tell which prompt they promised to raise,
 * which one they already asked about, and which one the engine is about to
 * delete.
 *
 * WHAT THIS REGISTRY DECLARES (not derives)
 * -----------------------------------------
 * A closed vocabulary of prompt FAMILIES, each mapped to the rule that owns it,
 * the marker grammar that writes it, and — the doctrine-relevant part — WHO the
 * prompt is owed to:
 *
 *   self     the prompt is about the person it sits on and the leader owes it
 *            to them (case support, delegation recovery, coaching)
 *   above    the prompt is a demand on the leader from their own span (a floor
 *            breach, a parity promise) — it is not a conversation with the
 *            person it was filed on
 *   both     a bilateral obligation (a returned commitment)
 *
 * The family table is a DECLARATION, versioned in the ledger, never fitted to
 * the record. An unrecognised string is family `unknown` with
 * `owedTo: 'unclassified'` — the ledger says it cannot classify it rather than
 * guessing, and counts it in the denominator so a workspace full of untagged
 * legacy prompts reads as an uncovered queue, not a clean one.
 *
 * The marker grammars below are copied from the writers that produce them; a
 * parity test in `tests/app/agenda-provenance.test.mjs` asserts that every rule
 * that writes `talkingPoints` has a declared family, so adding a writer without
 * a family is a test failure rather than a silent hole.
 */

export const AGENDA_ENGINE_VERSION = 'agenda-provenance-2026.11-v1';

/** Collections/limits mirrored from the writers, kept in one place. */
export const AGENDA_LIMITS = Object.freeze({
  /** `normalizeTalkingPoints` (schema.js) truncates the waiting list here. */
  queueCap: 12,
  /** `normalizeTalkingPoints` truncates one topic at this length. */
  topicChars: 200,
  /** Maximum ledger rows we will re-derive in one read. */
  scanCap: 4000,
  /** Maximum agenda lines the projected plan will print. */
  planCap: 40,
  /** Minimum closed loops before a receipt rate may be printed. */
  receiptFloor: 5,
  /** ISO weeks a carried prompt may survive unfiled before it reads as stale. */
  staleAfterDays: 21,
});

export const AGENDA_OWED = Object.freeze({
  SELF: 'self',
  ABOVE: 'above',
  BOTH: 'both',
  UNCLASSIFIED: 'unclassified',
});

export const AGENDA_OWED_LABELS = Object.freeze({
  self: 'Owed to them — you raise it',
  above: 'Owed upward — a demand on you, not a conversation with them',
  both: 'Bilateral — a returned commitment the two of you settle',
  unclassified: 'Unclassified — this ledger cannot say what this prompt is',
});

/**
 * The declared families. `pattern` is matched against the raw topic text.
 * `plain` marks prompts a leader wrote by hand (no engine marker): those are
 * the person's own topics, which is exactly the thing being buried.
 */
export const AGENDA_FAMILIES = Object.freeze([
  {
    key: 'case-support',
    label: 'Case support',
    owner: 'RULE-COACH-01',
    owedTo: AGENDA_OWED.SELF,
    pattern: /^Case support \(/,
    framework: 'Blameless post-incident review (Reason 1990): the system is the unit of analysis, so the prompt asks for barriers and air-cover, never for a person’s account.',
    why: 'The leader owes this person a conversation about a case they are carrying. It is the single most evicted prompt family in a busy span.',
  },
  {
    key: 'case-support-refresh',
    label: 'Case support (refreshed)',
    owner: 'RULE-COACH-02',
    owedTo: AGENDA_OWED.SELF,
    pattern: /^Case support \(/,
    framework: 'Blameless post-incident review (Reason 1990): the same barrier must not be re-litigated from scratch on every edit.',
    why: 'The lifecycle refresh of a case-support prompt. Deliberately classified with its sibling so a case edit never re-files the line as a new obligation.',
  },
  {
    key: 'case-learning',
    label: 'Case learning',
    owner: 'RULE-COACH-02',
    owedTo: AGENDA_OWED.SELF,
    pattern: /^Case learning \(/,
    framework: 'Single-loop → double-loop closure (Argyris & Schön 1978): a resolved case that is never reviewed teaches nothing.',
    why: 'The follow-up that closes a resolved case. It arrives after the urgency has gone, which is precisely when it is dropped.',
  },
  {
    key: 'delegation-recovery',
    label: 'Delegation recovery',
    owner: 'RULE-NEG-05',
    owedTo: AGENDA_OWED.BOTH,
    pattern: /^Delegation recovery \(/,
    framework: 'Principal–agent repair (Jensen & Meckling 1976): a returned delegation is a broken contract of authority, not a failed person.',
    why: 'A commitment handed back to the leader. Both sides owe the next conversation, so it counts as a mutual obligation.',
  },
  {
    key: 'negotiation-prep',
    label: 'Negotiation prep',
    owner: 'RULE-NEG-01',
    owedTo: AGENDA_OWED.SELF,
    pattern: /^Negotiation prep \(/,
    framework: 'BATNA discipline (Fisher & Ury 1981): preparation is what turns a positional confrontation into an interest-based one.',
    why: 'Owed to the person who will sit in the room, before they sit in it.',
  },
  {
    key: 'stakeholder-shift',
    label: 'Stakeholder shift',
    owner: 'RULE-STK-03',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /^Stakeholder shift \(/,
    framework: 'Coalition maintenance (Cyert & March 1963): a shifted stance is a change in the governing coalition, usually decided above the person it was filed on.',
    why: 'Filed on a person but answered by the leader: the conversation is about the leader’s stakeholder strategy, so it belongs upward.',
  },
  {
    key: 'exploration-bet',
    label: 'Exploratory bet checkpoint',
    owner: 'RULE-ALLOC-02',
    owedTo: AGENDA_OWED.SELF,
    pattern: /^Bet check for /,
    framework: 'Real-options discipline (Dixit & Pindyck 1994): a funded exploration without a pre-declared stop rule is a subsidy, not a bet.',
    why: 'The leader funded it; the check-in on what would stop it is owed back to the owner.',
  },
  {
    key: 'horizon-classification',
    label: 'Horizon classification',
    owner: 'RULE-ALLOC-04',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /^Classify /,
    framework: 'Ambition matrix (Nagji & Tuff 2012): mix is only measurable once funded work is classified.',
    why: 'An accounting duty imposed on the leader’s own portfolio, filed on a person because that is where the funding line points. Not their conversation.',
  },
  {
    key: 'load-shape',
    label: 'Load / span shape',
    owner: 'RULE-LOAD-01',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[RULE-LOAD-01:/,
    framework: 'Queueing at the utilisation ceiling (Kingman 1961): overload is a property of the design of the span, not of the person in it.',
    why: 'A span-design signal. Treated as a conversation with the person, it becomes a performance conversation it never was.',
  },
  {
    key: 'load-wip',
    label: 'Load: work in progress',
    owner: 'RULE-LOAD-02',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[RULE-LOAD-02:/,
    framework: 'Little’s law (1961): queue size is a design parameter of the span, not a personal shortfall.',
    why: 'A WIP reading at the span level, filed on a person only as the routing target.',
  },
  {
    key: 'load-size',
    label: 'Load: work-item size',
    owner: 'RULE-LOAD-03',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[RULE-LOAD-03:/,
    framework: 'Batch-size economics (Reinertsen 2009): smaller batches shorten queues without extra capacity.',
    why: 'A sizing signal about the leader’s work design.',
  },
  {
    key: 'load-germane',
    label: 'Load: germane vs extraneous',
    owner: 'RULE-LOAD-04',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[RULE-LOAD-04:/,
    framework: 'Cognitive load theory (Sweller 1988): extraneous load is removed from the system, not from the person.',
    why: 'A design correction owed by the leader.',
  },
  {
    key: 'org-network',
    label: 'Influence network',
    owner: 'RULE-ORG-02',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[RULE-ORG-02:/,
    framework: "Burt's structural holes (1992): network position is a structural fact about the leader's span.",
    why: 'A structural read of the leader’s own position; the demand is on the leader.',
  },
  {
    key: 'org-network-kp',
    label: 'Influence network: key position',
    owner: 'RULE-ORG-03',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[RULE-ORG-03:/,
    framework: 'Structural holes (Burt 1992): brokerage is read from the shape of the network the leader is building.',
    why: 'A structural finding about the span.',
  },
  {
    key: 'org-network-gap',
    label: 'Influence network: coverage gap',
    owner: 'RULE-ORG-04',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[RULE-ORG-04:/,
    framework: 'Social capital breadth (Lin 2001): reach is a property of the leader’s network, not of one report.',
    why: 'A network design duty.',
  },
  {
    key: 'org-network-bridge',
    label: 'Influence network: bridge',
    owner: 'RULE-ORG-05',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[RULE-ORG-05:/,
    framework: 'Weak-tie brokerage (Granovetter 1973): the bridging tie is the leader’s to build.',
    why: 'A bridging duty on the leader.',
  },
  {
    key: 'floor-breach',
    label: 'Exploration floor',
    owner: 'RULE-ALLOC-01',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[RULE-ALLOC-01\]/,
    framework: 'Investment-policy rebalancing bands: a floor breach is governed above the portfolio holder.',
    why: 'A policy breach owned by the leader who set the floor.',
  },
  {
    key: 'premise-breach',
    label: 'Premise breach',
    owner: 'RULE-PRM-*',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[RULE-PRM-[A-Z0-9-]+:/,
    framework: 'Assumption-based planning (Dewar 2002): a falsified premise invalidates the plan, not the person who wrote it down.',
    why: 'A plan-level fact. The leader owes the replan; the person owes nothing.',
  },
  {
    key: 'catchball',
    label: 'Hoshin catchball',
    owner: 'RULE-HK-02',
    owedTo: AGENDA_OWED.BOTH,
    pattern: /\[HK-CB:/,
    framework: 'Hoshin Kanri catchball (Akao 1991): the vertical negotiation of a target is inherently bilateral.',
    why: 'A negotiation, so both parties carry it.',
  },
  {
    key: 'catchball-rounds',
    label: 'Hoshin catchball rounds',
    owner: 'RULE-HK-02',
    owedTo: AGENDA_OWED.BOTH,
    pattern: /\[HK-(?:WML|DBL):/,
    framework: 'Hoshin Kanri catchball (Akao 1991): weekly check-ins and double-loop reviews are negotiated between rung and span.',
    why: 'The paced check-in half of the cascade, filed under the round rule.',
  },
  {
    key: 'carryover',
    label: 'Bet carryover',
    owner: 'RULE-CO-*',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[CO-SET:/,
    framework: 'Double-loop learning on a falsified thesis (Argyris & Schön 1978): the bet, not the team, was wrong.',
    why: 'A strategy-level settlement; the leader owes the decision to retire or reaffirm.',
  },
  {
    key: 'autopilot',
    label: 'Operating agreement',
    owner: 'RULE-AP-01',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[AP:[0-9a-z]+:[a-z-]+\]/,
    framework: 'Management by exception (Drucker 1954): a pre-agreed trigger replaces a standing instruction.',
    why: 'A standing agreement firing; it is the leader’s own rule acting on the leader.',
  },
  {
    key: 'parity',
    label: 'Parity / fairness',
    owner: 'RULE-PAR-01',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[RULE-PAR-/,
    framework: 'Distributive justice (Adams 1965): a fairness reading is a claim about the leader’s allocation, not about the person.',
    why: 'A leader-level allocation duty.',
  },
  {
    key: 'parity-promise',
    label: 'Parity promise',
    owner: 'RULE-PAR-02',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[RULE-PAR-/,
    framework: 'Distributive justice (Adams 1965): a promise-gap reading is a claim about the leader’s allocation across a team.',
    why: 'A leader-level fairness duty, never a conversation with one report.',
  },
  {
    key: 'performance',
    label: 'Performance concern',
    owner: 'RULE-PERF-*',
    owedTo: AGENDA_OWED.SELF,
    pattern: /\[RULE-PERF-/,
    framework: 'Expectation clarity (Locke & Latham 1990): a goal setting relationship only works when the expectation is stated explicitly.',
    why: 'Owed to the person: an expectation or plan must be said out loud to them.',
  },
  {
    key: 'settlement',
    label: 'Settlement prompt',
    owner: 'RULE-STL-02',
    owedTo: AGENDA_OWED.SELF,
    pattern: /\[STL-02:/,
    framework: 'Commitment accounting: a settlement prompts the human conversation that records what actually landed.',
    why: 'Owed to the person the settlement concerns.',
  },
  {
    key: 'settlement-review',
    label: 'Settlement review',
    owner: 'RULE-STL-03',
    owedTo: AGENDA_OWED.SELF,
    pattern: /\[STL-03:/,
    framework: 'Commitment accounting: a later review prompt keeps the settled outcome attached to the person it concerned.',
    why: 'The review half of a settlement, owed to the same person.',
  },
  {
    key: 'compensation',
    label: 'Compensation review',
    owner: 'RULE-COMP-01',
    owedTo: AGENDA_OWED.SELF,
    pattern: /\[COMP-FAIR:/,
    framework: 'Equity theory (Adams 1963): pay conversations are owed to the person, and are unsafe to batch.',
    why: 'Owed to the person, and the most sensitive family in the queue.',
  },
  {
    key: 'compensation-structure',
    label: 'Compensation structure',
    owner: 'RULE-COMP-02',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[COMP-(?:FAIR-TASK|STRUCT|REV):/,
    framework: 'Internal equity (Adams 1963) and structure design: a band or structure review is a leader-level compensation decision, not a conversation with one report.',
    why: 'The structure and task-level fairness reads belong to the leader who can change the band — filed on a person only because that is where the cycle points.',
  },
  {
    key: 'fidelity',
    label: 'Delivery fidelity',
    owner: 'RULE-FID-*',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[FID(?:-[A-Z]+)?:/,
    framework: 'Dose–response fidelity (Dane & Schneider 1998): the reading is about the leader’s delivery system.',
    why: 'A reading of the leader’s own delivery, not a topic for the person.',
  },
  {
    key: 'measurement',
    label: 'Measurement card',
    owner: 'RULE-MTX-*',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[MTX(?:-OBS)?:/,
    framework: 'Instrument reliability (Nunnally 1978): a broken measure is a leader-level defect.',
    why: 'Instrument maintenance, owned by the leader.',
  },
  {
    key: 'escalation',
    label: 'Escalation queue',
    owner: 'RULE-ESC-*',
    owedTo: AGENDA_OWED.SELF,
    pattern: /\[ESC-(?:QUEUE|YIELD|COMMIT|MONKEY)-/,
    framework: 'Escalation economy: a queued escalation is a promise to route it, owed to the person who raised it.',
    why: 'Owed to the person waiting on a route decision.',
  },
  {
    key: 'org-design',
    label: 'Org design',
    owner: 'RULE-ORD-*',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\[ORD-(?:RESIDUAL|MOVED|REVIEW):/,
    framework: "Jaques' time-span of discretion (1956): a structural consequence of the position, not a personal one.",
    why: 'The leader owes a structural answer; the person is affected, not obliged.',
  },
  {
    key: 'dynamics',
    label: 'Systems dynamics',
    owner: 'RULE-DYN-*',
    owedTo: AGENDA_OWED.BOTH,
    pattern: /\bDYN-[A-Z]+:/,
    framework: 'System dynamics (Forrester 1961): a loop is shared between the parties that act on it.',
    why: 'Shared loop ownership.',
  },
  {
    key: 'growth',
    label: 'Development plan',
    owner: 'RULE-GROW-*',
    owedTo: AGENDA_OWED.SELF,
    pattern: /^Delegated outcome:|^Growth plan/,
    framework: 'Deliberate practice (Ericsson 1993): development requires a specific, named, difficult task agreed with the person.',
    why: 'The development conversation is owed to them.',
  },
  {
    key: 'leader-continuity',
    label: 'Continuity cover',
    owner: 'RULE-LC-*',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\bLC-[A-Z]+:/,
    framework: "Leader continuity (Jacques' requisite organisation at the top): a cover gap is the leader's own exposure.",
    why: 'The leader’s continuity risk, filed on a deputy.',
  },
  {
    key: 'continuity-coupling',
    label: 'Continuity coupling',
    owner: 'RULE-CC-*',
    owedTo: AGENDA_OWED.ABOVE,
    pattern: /\bCC-[A-Z]+:/,
    framework: 'Common-mode failure (Reason 1997): coupling is a property of the system.',
    why: 'A resilience reading of the span.',
  },
  {
    key: 'mitigation',
    label: 'Mitigation review',
    owner: 'RULE-MIT-*',
    owedTo: AGENDA_OWED.SELF,
    pattern: /^Mitigation review/,
    framework: 'Control-loop closure (Deming): a mitigation nobody reviews is an open loop.',
    why: 'Owed to the person carrying the mitigation.',
  },
]);

export const AGENDA_FAMILY_KEYS = Object.freeze(AGENDA_FAMILIES.map((f) => f.key));
const BY_KEY = new Map(AGENDA_FAMILIES.map((f) => [f.key, f]));
export const agendaFamily = (key) => BY_KEY.get(key) || null;

/**
 * Classify one raw `talkingPoints` string.
 *
 * Order matters only in that a marker-bearing prompt is always engine-authored:
 * a leader who types "[RULE-ALLOC-01]" by hand is writing a marker, and the
 * ledger will refuse to treat it as the person's own topic — the safe direction.
 */
export function classifyTopic(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { text: '', family: 'empty', label: 'Empty', owedTo: AGENDA_OWED.UNCLASSIFIED, engine: false, owner: null };
  for (const family of AGENDA_FAMILIES) {
    if (family.pattern.test(text)) {
      return {
        text,
        family: family.key,
        label: family.label,
        owedTo: family.owedTo,
        engine: true,
        owner: family.owner,
        framework: family.framework,
        why: family.why,
      };
    }
  }
  // A marker-shaped prompt whose family is not declared: engine-authored and
  // unclassified, never silently counted as the person's own topic.
  const markerLike = /\[[A-Z][A-Z0-9-]{1,24}(?::[^\]]+)?\]/.test(text) || /;\s*ref [a-z0-9-]+\)/i.test(text);
  if (markerLike) {
    return { text, family: 'unknown-marker', label: 'Untagged engine prompt', owedTo: AGENDA_OWED.UNCLASSIFIED, engine: true, owner: null };
  }
  return { text, family: 'person-raised', label: 'Raised by them', owedTo: AGENDA_OWED.SELF, engine: false, owner: null };
}

/** Rules that write `talkingPoints`. The parity test asserts each has a family. */
export const AGENDA_PROMPT_WRITERS = Object.freeze([
  'RULE-COACH-01', 'RULE-COACH-02', 'RULE-NEG-01', 'RULE-NEG-05', 'RULE-STK-03',
  'RULE-ALLOC-01', 'RULE-ALLOC-02', 'RULE-ALLOC-04', 'RULE-LOAD-01', 'RULE-LOAD-02',
  'RULE-LOAD-03', 'RULE-LOAD-04', 'RULE-ORG-02', 'RULE-ORG-03', 'RULE-ORG-04',
  'RULE-ORG-05', 'RULE-PRM-*', 'RULE-HK-02', 'RULE-CO-*', 'RULE-AP-01',
  'RULE-PAR-02', 'RULE-PERF-*', 'RULE-STL-02', 'RULE-STL-03', 'RULE-COMP-01', 'RULE-COMP-02',
  'RULE-FID-*', 'RULE-MTX-*', 'RULE-ESC-*', 'RULE-ORD-*', 'RULE-LC-*', 'RULE-CC-*',
]);

export const AGENDA_EVENTS = Object.freeze({
  SCAN: 'agenda.scan',
  FILED: 'agenda.filed',
  WITHDRAWN: 'agenda.withdrawn',
});

export const AGENDA_RULE_IDS = Object.freeze({
  LEDGER: 'RULE-AGD-01',
  ATTENTION: 'RULE-AGD-02',
  RECEIPT: 'RULE-AGD-03',
});

export const AGENDA_PANELS = Object.freeze([
  { key: 'queue', label: 'Waiting list', question: 'What is on their list, and who does each line actually belong to?' },
  { key: 'build', label: 'Build the agenda', question: 'What should I raise next, in what order, and what am I at risk of dropping?' },
  { key: 'filed', label: 'Filed prompts', question: 'Which prompts have I committed to raise, and which are overdue or stale?' },
  { key: 'receipt', label: 'Receipts', question: 'When I filed a prompt, did it actually get raised?' },
  { key: 'rollup', label: 'Span roll-up', question: 'How is my span’s agenda discipline reading — and what reaches my own leader?' },
  { key: 'method', label: 'Method', question: 'What is claimed, what is refused, and what can I re-declare?' },
]);

export const AGENDA_CSV_COLUMNS = Object.freeze([
  'row_kind', 'scope', 'queue_n', 'person_raised_n', 'engine_n', 'owed_self_n', 'owed_above_n',
  'owed_both_n', 'unclassified_n', 'filed_open_n', 'filed_overdue_n', 'filed_stale_n',
  'filed_raised_n', 'filed_dropped_n', 'receipt_rate_pct', 'receipt_low_pct', 'receipt_high_pct',
  'queue_pressure_pct', 'queue_pressure_low_pct', 'queue_pressure_high_pct', 'withheld',
]);
