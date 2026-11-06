/**
 * app/core/domain/diligenceRegistry.js — the zero-import vocabulary for the
 * Diligence Ledger (ADR-0104, Schema v106, `#/diligence`).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Every other terminal in LeadOS audits a decision AFTER it was made: the
 * Hindsight Lock freezes the information set, the Epistemic Ledger harvests
 * unread signals, Outcome Attribution grades execution, Counterfactual Policy
 * grades the behaviour. None of them helps a leader WHILE deciding, and both
 * Session 142 and Session 143 name the same largest gap in their own roadmap:
 * "recording 'we looked at X' at decision time (an explicit consult action)".
 * Without it, coverage measures LINK HYGIENE, not due diligence.
 *
 * This registry declares the vocabulary that closes that gap:
 *   - five EVIDENCE CLASSES harvested from dated records other modules own;
 *   - three CONSULT DISPOSITIONS, where "ruled-out with a reason" is diligence
 *     (the leader looked and judged), NOT a miss — the behavioural distinction
 *     the Hindsight Lock's link-hygiene coverage cannot make;
 *   - a bounded, declared CONVENTION set (never fitted);
 *   - deterministic IDs, so a rescan can never duplicate a frozen knowable set.
 *
 * Pure data and pure functions only. No imports, no clock, no storage.
 */

export const DILIGENCE_ENGINE_VERSION = 'diligence-ledger-2026.11-v1';

/**
 * The five evidence classes of the knowable set. Each names the collection it
 * harvests, the graph node type of a harvested fact (so a typed edge can point
 * at it), the dated fields that establish it was knowable, and the discipline
 * it brings. A record with NONE of its declared date fields present is excluded:
 * an undated fact cannot be established as knowable at decision time, exactly
 * as the Hindsight Lock refuses to charge a decision for an undated fact.
 *
 * The date lists are FIELD FALLBACKS, first present wins. `createdAt` is the
 * last fallback on every class because `normalizeState` stores premises and
 * goals with an ISO `createdAt` and no `createdOn`: a vocabulary that named only
 * the ideal field would silently harvest four of five classes as zero facts.
 * The fallback was found by reading the normalized record, not the docs.
 */
export const EVIDENCE_CLASSES = Object.freeze({
  risk: Object.freeze({
    label: 'Risk & case history', discipline: 'engineering / root-cause',
    collection: 'cases', sourceType: 'case', dates: ['openedOn', 'createdOn', 'createdAt'],
    note: 'A dated operational case is the root-cause record the decision could have read.',
  }),
  assumption: Object.freeze({
    label: 'Registered premises', discipline: 'strategy / assumption ledger',
    collection: 'premises', sourceType: 'premise', dates: ['createdOn', 'registeredOn', 'createdAt'],
    note: 'A registered premise is a declared belief whose observation history predates the call.',
  }),
  commitment: Object.freeze({
    label: 'Outstanding commitments', discipline: 'operations / lean',
    collection: 'delegations', sourceType: 'delegation', dates: ['delegatedOn', 'createdOn', 'createdAt'],
    note: 'A dated delegation is capacity already promised; it constrains any new decision.',
  }),
  objective: Object.freeze({
    label: 'Goals & targets', discipline: 'strategy / OKR',
    collection: 'goals', sourceType: 'goal', dates: ['createdOn', 'createdAt', 'targetOn'],
    note: 'A dated goal is the objective the decision is supposed to serve.',
  }),
  precedent: Object.freeze({
    label: 'Settled decisions (precedent)', discipline: 'governance / decision log',
    collection: 'decisions', sourceType: 'decision', dates: ['date', 'createdAt'],
    note: 'A decision whose outcome already settled is the organisation\'s own precedent. Only strictly EARLIER decisions qualify — a same-day call is not a precedent for itself.',
  }),
});

export const EVIDENCE_CLASS_KEYS = Object.freeze(Object.keys(EVIDENCE_CLASSES));

/**
 * Three dispositions of a consultation. `used` and `ruled-out` both count as
 * CONSULTED (the leader looked); only an unconsulted knowable fact is a gap.
 * `deferred` is an honest third state: the leader saw it and parked it, which
 * counts as consulted for coverage but is printed separately so a habit of
 * deferring everything cannot hide inside the coverage number.
 */
export const CONSULT_DISPOSITIONS = Object.freeze({
  used: Object.freeze({ label: 'Used in the call', consulted: true, note: 'The fact was read and materially shaped the decision.' }),
  'ruled-out': Object.freeze({ label: 'Ruled out with a reason', consulted: true, note: 'The fact was read and judged irrelevant. Looking and dismissing is diligence, not a miss.' }),
  deferred: Object.freeze({ label: 'Deferred', consulted: true, note: 'The fact was seen and explicitly parked. It counts as consulted but is printed apart.' }),
});

export const CONSULT_DISPOSITION_KEYS = Object.freeze(Object.keys(CONSULT_DISPOSITIONS));

export const COVERAGE_BANDS = Object.freeze([
  Object.freeze({ key: 'thin', minPct: 0, label: 'Thin', tone: 'bad' }),
  Object.freeze({ key: 'partial', minPct: 40, label: 'Partial', tone: 'warn' }),
  Object.freeze({ key: 'sound', minPct: 75, label: 'Sound', tone: 'good' }),
]);

export const GRADE_VERDICTS = Object.freeze({
  'better-than-coin': Object.freeze({ label: 'Better than a coin', note: 'The pre-declared process forecast beat the maximum-entropy strictly-prior base rate.' }),
  indistinguishable: Object.freeze({ label: 'Indistinguishable from a coin', note: 'Skill is inside ±0.05; the forecast added no measurable foresight.' }),
  'worse-than-coin': Object.freeze({ label: 'Worse than a coin', note: 'The forecast was overconfident. A negative skill is printed, never hidden.' }),
  refused: Object.freeze({ label: 'Refused', note: 'Too few scored claims to grade. A refusal is never printed as zero.' }),
});
export const GRADE_VERDICT_KEYS = Object.freeze(Object.keys(GRADE_VERDICTS));

export const DILIGENCE_LIMITS = Object.freeze({
  checklists: 240,
  factsPerChecklist: 24,
  consultsPerChecklist: 24,
  consults: 900,
  grades: 240,
  markers: 900,
  ancestorsCap: 16,
  // An AUTOMATIC spine pass must stay cheap on every unrelated write. An
  // explicit `diligence.scan` is the operator asking for the whole ledger, so
  // it is bounded by the ledger's own size instead (otherwise two identical
  // scans would keep "finding" work — the exact non-idempotence failure the
  // Epistemic Ledger's merge exposed).
  freezePerPass: 6,
  findingsPerPass: 3,
  noteChars: 400,
  reasonChars: 600,
  titleChars: 200,
});

export const DILIGENCE_DEFAULTS = Object.freeze({
  // Coverage and a Wilson interval are REFUSED below this many knowable facts.
  diligenceKnowableFloor: 8,
  // A settled decision whose consulted share is below this opens one governed
  // deliberation-gap decision per span per ISO week.
  diligenceCoverageFloorPct: 70,
  // A class cell is REFUSED below this many knowable facts across all checklists.
  diligenceClassFloor: 6,
  // A class whose Jeffreys 90% upper bound on the consulted share sits below
  // this ceiling is declared DARK (systematically not consulted).
  diligenceDarkCeilingPct: 30,
  // A once-only Brier grade needs at least this many scoreable claims. This is
  // a SEPARATE floor from the knowable floor: a forecast declares at most five
  // evidence classes plus one coverage claim, so six claims is the ceiling of
  // what can ever be scored. Reusing the knowable floor here would make every
  // grade permanently refused — a dead end, not a conservative bound.
  diligenceGradeClaimFloor: 3,
  // A pre-decision forecast must be graded within this horizon of its decision.
  diligenceForecastHorizonDays: 45,
  // Review date on every governed finding this module opens.
  diligenceReviewDays: 14,
  // A still-pending decision older than this opens one bounded close-the-loop
  // prompt (its forecast can never be graded against an outcome that never came).
  diligenceStaleDays: 90,
  diligenceAutoPropagate: true,
});

export const DILIGENCE_BOUNDS = Object.freeze({
  diligenceKnowableFloor: [2, 12],
  diligenceCoverageFloorPct: [20, 90],
  diligenceClassFloor: [2, 20],
  diligenceDarkCeilingPct: [10, 80],
  diligenceGradeClaimFloor: [2, 6],
  diligenceForecastHorizonDays: [7, 180],
  diligenceReviewDays: [3, 90],
  diligenceStaleDays: [10, 365],
});

export const DILIGENCE_RULE_IDS = Object.freeze({
  FREEZE: 'RULE-DLG-01',
  GAP: 'RULE-DLG-02',
  DARK: 'RULE-DLG-03',
  GRADE: 'RULE-DLG-04',
});

export const DILIGENCE_EVENTS = Object.freeze({
  SCAN: 'diligence.scan',
  CONSULTED: 'diligence.consulted',
  FORECAST: 'diligence.forecast',
  CONVENTIONS: 'diligence.conventions',
});

export const DILIGENCE_TRIGGER_PREFIX = 'diligence.';

/**
 * The ONLY non-explicit events that may wake this module. The spine runs on
 * EVERY commit; a ledger that re-read the whole workspace on an unrelated
 * premise or case write would open governed work on a transaction that never
 * touched a decision (and would flood the bounded derived-event queue). A
 * frontier is frozen when a real decision is committed; an operator's explicit
 * scan back-fills older workspaces. Both are the same generalized event spine,
 * with no per-module glue.
 */
export const DILIGENCE_DECISION_EVENTS = Object.freeze([
  'decision.created', 'decision.updated', 'decision.made', 'decision.decided',
  'decision.reviewed', 'decision.withdrawn',
]);
/** Settlement is when a process score may legitimately become out of sample. */
export const DILIGENCE_SETTLEMENT_EVENTS = Object.freeze([
  'decision.made', 'decision.decided', 'decision.reviewed',
]);

export const DILIGENCE_PANELS = Object.freeze([
  Object.freeze({ key: 'desk', label: 'Diligence desk', note: 'The frontier, the cells and the identity-free upward brief.' }),
  Object.freeze({ key: 'frontier', label: 'Knowable set', note: 'The frozen set of facts available on the decision date; consult or rule each one out.' }),
  Object.freeze({ key: 'cells', label: 'Class cells', note: 'Consulted share per evidence class with a Jeffreys 90% bound; dark classes are named.' }),
  Object.freeze({ key: 'forecasts', label: 'Process forecasts', note: 'Pre-declared diligence forecasts, graded once out of sample by Brier skill.' }),
  Object.freeze({ key: 'findings', label: 'Governed findings', note: 'The bounded decisions the spine opened from a thin frontier or a dark class.' }),
  Object.freeze({ key: 'conventions', label: 'Conventions', note: 'Declared, clamped and printed. Director+ only, never fitted.' }),
]);

/** The five altitude-specific questions this terminal answers (Jaques 1956). */
export const DILIGENCE_PLAYBOOK = Object.freeze({
  frontline: 'Which facts in front of me right now have I actually looked at before I commit this shift-level call?',
  manager: 'Which evidence classes does my span systematically walk past, and is that a pattern or one busy week?',
  director: 'Is the diligence frontier measured at the same floor across every span I coordinate?',
  vp: 'Where is deliberation thin enough to make a portfolio bet fragile, and what is the direction of the gap?',
  chief: 'Across the enterprise, is the organisation looking before it leaps — and where does the record refuse to say?',
});

export const DILIGENCE_DISCLOSURE = Object.freeze({
  frontier: 'A frozen knowable set carries record TYPES, ids and dates only — never a title, a note, a person or an amount.',
  cells: 'A class cell is a count and a bound. Small cells and refused rates are BLANK, never zero, and no individual consultation climbs the tree.',
  brief: 'The upward brief is identity-free: counts by altitude and class, the direction of the gap, and every refusal named rather than a number guessed.',
  refusal: 'A frontier below the declared knowable floor prints no coverage rate at all; it prints the floor it refused to cross.',
});

/** Deterministic FNV-1a 32-bit hash → 8 hex chars. Stable across sessions. */
export function diligenceHash(value) {
  const text = String(value ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** ONE frozen knowable set per decision. Rescans cannot duplicate it. */
export function checklistId(decisionId) {
  return `dlg-${diligenceHash(`checklist|${decisionId}`)}`;
}

/** A consult is idempotent per (checklist, fact). */
export function consultId(checklist, sourceType, sourceId) {
  return `dlgc-${diligenceHash(`consult|${checklist}|${sourceType}|${sourceId}`)}`;
}

export function diligenceMarkerId(kind, key) {
  return `dlgm-${kind}-${diligenceHash(String(key))}`;
}
