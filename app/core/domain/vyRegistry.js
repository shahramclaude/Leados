/**
 * app/core/domain/vyRegistry.js — the declared vocabulary of the
 * Vroom–Yetton–Jago Decision-Participation Selector (ADR-0230, Schema v183,
 * `RULE-VY-01`, CSV scope #171, `#/vroom-yetton`).
 *
 * THE DUTY, IN THE WORDS OF THE PERSON WHO OWNS IT
 * ------------------------------------------------
 * A leader faces a decision and must choose not only WHAT to decide but HOW:
 * decide alone, consult individuals, consult the group, or hand the call to
 * the group. That choice is itself a leadership act, and getting it wrong
 * costs in two directions: a call made alone that nobody commits to stalls at
 * implementation; a call opened to the group that needed a single fast answer
 * burns weeks the decision does not have. Vroom & Yetton (1973), revised with
 * Jago (1988), turns that choice into a transparent, auditable procedure —
 * seven situational diagnostics, two decision trees (time-driven and
 * development-driven), five participation styles (A1, A2, C1, C2, G2), and a
 * printed reason for whichever style remains.
 *
 * THE SEVEN DIAGNOSTICS
 * ---------------------
 *  1. Quality requirement — is the technical quality of this decision critical?
 *  2. Commitment requirement — is team commitment needed for implementation?
 *  3. Leader information — does the leader hold enough information to decide well alone?
 *  4. Problem structure — is the problem well-structured (clear goals, known options)?
 *  5. Commitment probability — would the team commit if the leader decided alone?
 *  6. Goal alignment — do team members share the organisation's goals?
 *  7. Team conflict — is conflict among team members likely?
 *
 * The answers are booleans. None is inferred from a role, a title or a
 * dashboard — each is a dated, named declaration by a person on a line.
 *
 * FIVE STYLES
 * -----------
 *  A1 — Autocratic I: the leader decides alone using information already available.
 *  A2 — Autocratic II: the leader obtains information from the team, then decides alone.
 *  C1 — Consultative I: the leader shares the problem with team members individually,
 *       gathers their ideas, then decides alone.
 *  C2 — Consultative II: the leader shares the problem with the team as a group,
 *       gathers their ideas, then decides alone.
 *  G2 — Group II: the leader shares the problem with the team as a group and
 *       implements whatever solution the group reaches by consensus.
 *
 * TWO TREES
 * ---------
 *  Time-driven: minimise the time to a decision. Favours autocratic styles
 *    when speed matters more than buy-in.
 *  Development-driven: develop team judgement and commitment. Favours
 *    consultative and group styles so people learn to decide.
 *
 * Each tree walks the seven diagnostics in a fixed order and prints the first
 * style whose conditions hold. No style is recommended when no diagnostic
 * supports it — the reader prints `no-style-feasible` instead.
 *
 * MATRIX
 * ------
 * A person sits on more than one line, so the people whose commitment is
 * needed are reached through more than one manager. The commitment, commitment
 * probability, goal-alignment and conflict diagnostics are therefore answered
 * PER LINE. A style that decides alone (A1/A2) is printed as unavailable for
 * any part of the decision whose decision right another line holds: one line
 * may not autocratically decide on another line's territory. The seat above
 * both lines (the joint apex) reads every line's answers and prints the style
 * that is feasible across all of them.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No inferred answers from reporting structure or headcount. No automatic
 * style selection that overrides a human. No rating of any person. No
 * write to any external system. The selector prints a recommendation and a
 * reason; the leader decides which style to use, and records the reason if
 * they override the recommendation.
 *
 * Leaf module: imports nothing.
 */

export const VY_ENGINE_VERSION = 'vroom-yetton-2026.11-v1';
export const VY_ADR = 'ADR-0230';
export const VY_RULE_ID = 'RULE-VY-01';
export const VY_ROUTE = 'vroom-yetton';
export const VY_HREF = '#/vroom-yetton';
export const VY_CSV_SCOPE = 'vroom-yetton';
export const VY_MARKER_KIND = 'vroom-yetton';

export const VY_EVENTS = Object.freeze({
  DECISION_DECLARED: 'vroom-yetton.decision.declared',
  DECISION_WITHDRAWN: 'vroom-yetton.decision.withdrawn',
  ANSWERS_RECORDED: 'vroom-yetton.answers.recorded',
  STYLE_SELECTED: 'vroom-yetton.style.selected',
  SCANNED: 'vroom-yetton.scan',
});
export const VY_EVENT_PREFIX = 'vroom-yetton.';

/**
 * Four rights, each at the altitude that can actually answer for it.
 *
 *  - READ (2–5): any leadership seat can read the participation register for
 *    decisions it holds or that sit above its lines; an employee with no seat
 *    reads aggregate only.
 *  - DECLARE (1–5): opening a decision-participation question is the leader's
 *    own act at any altitude — a frontline lead choosing how to run their own
 *    decision is exactly who needs it.
 *  - ANSWER (2–5): recording diagnostic answers narrows to seats that hold at
 *    least one line the decision touches, and never to a seat with no line.
 *  - SELECT (3–5): recording the chosen style (and overriding the
 *    recommendation with a written reason) is director-and-above, because a
 *    participation choice commits other people's time.
 */
export const VY_RIGHTS = Object.freeze({
  READ: 'read-vroom-yetton',
  DECLARE: 'declare-vroom-yetton',
  ANSWER: 'answer-vroom-yetton',
  SELECT: 'select-vroom-yetton',
});

export const VY_LIMITS = Object.freeze({
  decisions: 200,
  answers: 600,
  styleRecords: 400,
  markers: 200,
  textMin: 24,
  textMax: 600,
  titleMin: 12,
  titleMax: 160,
  reasonMin: 24,
  reasonMax: 600,
  idMax: 120,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
  /** Below this many graded selections, no calibration figure is printed. */
  gradeFloor: 5,
  /** One diagnostic answer per (decision, line, seat) — no double-counting. */
  oneAnswerPerLineSeat: true,
  decisionsShown: 40,
  answersShown: 60,
  styleRecordsShown: 60,
});

export const VY_SETTING_KEYS = Object.freeze({
  autoPropagate: 'vyAutoPropagate',
});

export const VY_DEFAULTS = Object.freeze({ autoPropagate: true });
export const VY_BOUNDS = Object.freeze({ autoPropagate: 'boolean' });

/**
 * Settings normalizer. Declared here (the leaf) so `schema.js` can normalize
 * the register's switch without importing the read model, and so the rule can
 * read the SAME normalization the writer wrote.
 */
export function normalizeVySettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    vyAutoPropagate: s.vyAutoPropagate !== false,
  };
}

/* ------------------------------------------------------------ the vocabulary */

/** The seven situational diagnostics, in tree order. */
export const VY_QUESTIONS = Object.freeze([
  Object.freeze({
    key: 'q1',
    label: 'Quality requirement',
    question: 'Is the technical quality of this decision critical — would a poor call cause real harm?',
    kind: 'boolean',
  }),
  Object.freeze({
    key: 'q2',
    label: 'Commitment requirement',
    question: 'Is team commitment needed for implementation — will this fail if people do not buy in?',
    kind: 'boolean',
    perLine: true,
  }),
  Object.freeze({
    key: 'q3',
    label: 'Leader information',
    question: 'Do I hold enough information to make a high-quality decision alone?',
    kind: 'boolean',
  }),
  Object.freeze({
    key: 'q4',
    label: 'Problem structure',
    question: 'Is the problem well-structured — clear goals, known options, agreed criteria?',
    kind: 'boolean',
  }),
  Object.freeze({
    key: 'q5',
    label: 'Commitment probability',
    question: 'If I decided alone, would the team commit to the outcome?',
    kind: 'boolean',
    perLine: true,
  }),
  Object.freeze({
    key: 'q6',
    label: 'Goal alignment',
    question: 'Do the people involved share the organisation\'s goals on this?',
    kind: 'boolean',
    perLine: true,
  }),
  Object.freeze({
    key: 'q7',
    label: 'Team conflict',
    question: 'Is conflict among the people involved likely?',
    kind: 'boolean',
    perLine: true,
  }),
]);
export const VY_QUESTION_KEYS = Object.freeze(VY_QUESTIONS.map((row) => row.key));
export const VY_PER_LINE_KEYS = Object.freeze(
  VY_QUESTIONS.filter((row) => row.perLine).map((row) => row.key),
);
export const vyQuestion = (key) => VY_QUESTIONS.find((row) => row.key === key) || null;
export const vyIsPerLine = (key) => VY_PER_LINE_KEYS.includes(key);

/** The two decision-tree variants. */
export const VY_TREE_VARIANTS = Object.freeze([
  Object.freeze({
    key: 'time-driven',
    label: 'Time-driven — minimise time to a decision',
    help: 'Favours autocratic styles when speed matters more than buy-in.',
  }),
  Object.freeze({
    key: 'development-driven',
    label: 'Development-driven — develop team judgement',
    help: 'Favours consultative and group styles so people learn to decide.',
  }),
]);
export const VY_TREE_KEYS = Object.freeze(VY_TREE_VARIANTS.map((row) => row.key));

/** The five participation styles. */
export const VY_STYLES = Object.freeze([
  Object.freeze({
    key: 'A1',
    label: 'Autocratic I',
    shortLabel: 'Decide alone',
    description: 'You decide alone using information you already have.',
    decidesAlone: true,
    needsTeam: false,
  }),
  Object.freeze({
    key: 'A2',
    label: 'Autocratic II',
    shortLabel: 'Gather info, decide alone',
    description: 'You obtain information from the team, then decide alone.',
    decidesAlone: true,
    needsTeam: true,
  }),
  Object.freeze({
    key: 'C1',
    label: 'Consultative I',
    shortLabel: 'Consult individually, decide alone',
    description: 'You share the problem with team members individually, gather ideas, then decide alone.',
    decidesAlone: true,
    needsTeam: true,
  }),
  Object.freeze({
    key: 'C2',
    label: 'Consultative II',
    shortLabel: 'Consult the group, decide alone',
    description: 'You share the problem with the team as a group, gather ideas, then decide alone.',
    decidesAlone: true,
    needsTeam: true,
  }),
  Object.freeze({
    key: 'G2',
    label: 'Group II',
    shortLabel: 'Group decides by consensus',
    description: 'You share the problem with the group and implement its consensus decision.',
    decidesAlone: false,
    needsTeam: true,
  }),
]);
export const VY_STYLE_KEYS = Object.freeze(VY_STYLES.map((row) => row.key));
export const vyStyle = (key) => VY_STYLES.find((row) => row.key === key) || null;

/** The verdicts a decision can carry. */
export const VY_VERDICTS = Object.freeze([
  Object.freeze({ key: 'unreadable', rank: 0, tone: 'bad', label: 'Unreadable — the answers cannot support a style' }),
  Object.freeze({ key: 'no-style-feasible', rank: 1, tone: 'bad', label: 'No style feasible — no participation style answers all the declared conditions' }),
  Object.freeze({ key: 'decision-owed', rank: 2, tone: 'warn', label: 'Decision owed — a style is recommended but none has been recorded' }),
  Object.freeze({ key: 'selected', rank: 3, tone: 'good', label: 'Selected — the chosen style is on the record' }),
  Object.freeze({ key: 'selected-override', rank: 4, tone: 'good', label: 'Selected at an override — the chosen style differs from the recommendation for a stated reason' }),
]);
export const VY_VERDICT_KEYS = Object.freeze(VY_VERDICTS.map((row) => row.key));
export const vyVerdict = (key) => VY_VERDICTS.find((row) => row.key === key) || null;

/** The state of a decision-participation question. */
export const VY_STATES = Object.freeze([
  Object.freeze({ key: 'declared', label: 'Declared — no diagnostic answers recorded yet' }),
  Object.freeze({ key: 'answered', label: 'Answered — diagnostics recorded, style not yet selected' }),
  Object.freeze({ key: 'selected', label: 'Selected — a participation style is on the record' }),
  Object.freeze({ key: 'withdrawn', label: 'Withdrawn — the question is closed and no style will be selected' }),
]);
export const VY_STATE_KEYS = Object.freeze(VY_STATES.map((row) => row.key));

/** Matrix answer scope: each per-line diagnostic is answered under a line. */
export const VY_ANSWER_SCOPES = Object.freeze(['single-line', 'per-line']);

export const VY_FLAGS = Object.freeze({
  recommendationOverridden: 'recommendation-overridden',
  lineConflict: 'line-conflict',
  noSingleSeat: 'no-single-seat',
  decideAloneUnavailable: 'decide-alone-unavailable',
});

export const VY_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That decision is not on this record. Nothing was saved.',
  withdrawn: 'This decision was withdrawn. A withdrawal is final; declare a new question rather than reviving one.',
  duplicateAnswers: 'A diagnostic answer for this decision, line and seat already exists. Amend it rather than recording a second.',
  noLine: 'This seat holds no line the decision touches, so it cannot answer the diagnostics.',
  selfSelect: 'The seat that selects the participation style must not be the same seat that answered the diagnostics for the same line — the choice and the evidence stay apart.',
  alreadySelected: 'A participation style is already recorded on this decision. A later reconsideration is a new decision.',
  styleNotFeasible: 'The chosen style is not feasible for the declared diagnostics. Select a feasible style or declare a new decision.',
  decisionNotOurs: 'Only a seat that holds at least one line the decision touches may select a style for it.',
});

/* ---------------------------------------------------------------- method */

export const VY_METHOD = Object.freeze({
  engine: VY_ENGINE_VERSION,
  adr: VY_ADR,
  frameworks: Object.freeze([
    'Vroom–Yetton–Jago normative decision model (Vroom & Yetton 1973; Vroom & Jago 1988) — the leader chooses how much to involve others by walking seven situational diagnostics to one of five participation styles: autocratic I/II, consultative I/II, group II.',
    'Time-driven vs development-driven trees (Vroom & Jago 1988) — the same diagnostics, two objectives: minimise time to decision, or develop team judgement and commitment.',
    'Matrix accountability (ADR-0140/ADR-0141) — commitment, alignment and conflict diagnostics are answered per line; a decide-alone style is unavailable where another line holds the decision right, and the joint apex reads across all lines.',
    'Bulletproof reliability (NORTH_STAR) — an answer that cannot be read is dropped with a counted reason, never coerced; a style the diagnostics do not support is printed as infeasible, never assigned.',
  ]),
  printed: Object.freeze([
    'Each diagnostic is a dated, named yes/no declaration on a line — never inferred from structure, headcount or title.',
    'The recommended style is the first style whose conditions hold on the chosen tree; when none holds, `no-style-feasible` is printed with the blocking diagnostic named.',
    'Per-line answers are combined by line: if any line needs commitment, the decision needs commitment; if any line reports likely conflict, conflict is printed.',
    'A1/A2 (decide alone) are shown as unavailable where another line holds a decision right over any part of this decision — one line may not autocratically decide on another line\'s territory.',
    'The leader may override the recommendation with a written reason; the override and the reason are both printed and graded later against whether the predicted commitment materialised.',
    'Below the declared floor of graded selections, no calibration figure is printed at all.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No inferred answer from a reporting line, a job title or an org chart.',
    'No automatic style selection that binds the leader.',
    'No per-person performance signal from a participation outcome.',
    'No write to any calendar, project or HR system.',
    'No style is ever "the right answer" — the register prints options and reasons; the leader chooses.',
  ]),
});

/* ------------------------------------------------------------------ CSV #171 */

export const VY_CSV_COLUMNS = Object.freeze([
  'as_of',
  'row_kind',
  'key',
  'tree_variant',
  'decisions_n',
  'answered_n',
  'selected_n',
  'override_n',
  'style_a1_n',
  'style_a2_n',
  'style_c1_n',
  'style_c2_n',
  'style_g2_n',
  'decide_alone_unavailable_n',
  'verdict',
  'blank_reason',
]);

export const VY_CSV_DESCRIPTOR = Object.freeze({
  key: VY_CSV_SCOPE,
  label: 'Vroom–Yetton decision participation (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'vroom-yetton',
  description: 'One summary row, one row per tree variant, one row per selected style and one row per verdict: decision counts, answered and selected counts, override counts, per-style counts, and the count of decisions where decide-alone is unavailable because another line holds a right. No decision title, id, person, manager, line name, rationale or reason crosses this boundary; an uncomputable figure exports BLANK with its reason, never zero.',
});

/* ----------------------------------------------------------------- key helpers */

export const vyAskSignature = (kind, decisionId) => `vy1:${kind}:${decisionId}`;

export function parseVyAskSignature(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = /^vy1:([a-z-]+):([A-Za-z0-9:_-]{1,120})$/.exec(raw);
  if (!match) return null;
  return { kind: match[1], decisionId: match[2], signature: raw };
}

export const vyAskSummary = (signature) => `vy-ask|${String(signature || '').slice(0, 120)}`;

/**
 * The diagnostics that matter for matrix combination. Per-line diagnostics
 * are combined by OR: if any line answers yes, the decision carries yes.
 */
export const VY_OR_DIAGNOSTICS = Object.freeze(['q2', 'q5', 'q6', 'q7']);
export const VY_SOLO_DIAGNOSTICS = Object.freeze(['q1', 'q3', 'q4']);

/**
 * Decide-alone styles (A1, A2) are unavailable when another line holds a
 * decision right over any part of the decision.
 */
export const VY_DECIDE_ALONE_STYLES = Object.freeze(['A1', 'A2']);

/**
 * Apply the Vroom–Yetton–Jago time-driven tree to the seven diagnostics.
 * Returns the first feasible style key, or null when none is feasible.
 */
export function vyTimeDrivenTree(answers) {
  const { q1, q2, q3, q4, q5, q6, q7 } = answers;
  if (!q1) return 'A1';
  if (!q2) return 'A1';
  if (q3) return 'A2';
  if (q4) return 'A2';
  if (q5) return 'A2';
  if (q6) return 'C2';
  if (!q7) return 'C2';
  return 'C1';
}

/**
 * Apply the Vroom–Yetton–Jago development-driven tree.
 * Returns the first feasible style key, or null when none is feasible.
 */
export function vyDevelopmentDrivenTree(answers) {
  const { q1, q2, q3, q4, q5, q6, q7 } = answers;
  if (!q1) return 'A1';
  if (!q2) return 'A1';
  if (q3) return 'A2';
  if (!q4) return 'C1';
  if (q5) return 'C1';
  if (q6) return 'C2';
  if (!q7) return 'C2';
  return 'G2';
}

/**
 * Select the recommended style for a tree variant and a set of answers.
 */
export function vyRecommendStyle(treeVariant, answers) {
  if (treeVariant === 'development-driven') return vyDevelopmentDrivenTree(answers);
  return vyTimeDrivenTree(answers);
}

/**
 * Is a style a decide-alone style?
 */
export function vyDecidesAlone(styleKey) {
  return VY_DECIDE_ALONE_STYLES.includes(styleKey);
}

/**
 * Given per-line answers, combine them into a single answer set. Per-line
 * diagnostics (q2, q5, q6, q7) are OR-combined across lines. Solo diagnostics
 * (q1, q3, q4) require agreement — if any line answers no, the combined answer
 * is no (the most conservative reading, since one line's constraint binds all).
 */
export function vyCombinePerLineAnswers(byLine) {
  const combined = {};
  for (const key of VY_SOLO_DIAGNOSTICS) {
    combined[key] = true;
    for (const lineId of Object.keys(byLine)) {
      const ans = byLine[lineId];
      if (ans && ans[key] === false) { combined[key] = false; break; }
    }
  }
  for (const key of VY_OR_DIAGNOSTICS) {
    combined[key] = false;
    for (const lineId of Object.keys(byLine)) {
      const ans = byLine[lineId];
      if (ans && ans[key] === true) { combined[key] = true; break; }
    }
  }
  return combined;
}
