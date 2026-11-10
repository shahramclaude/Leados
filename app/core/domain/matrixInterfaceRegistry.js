/**
 * app/core/domain/matrixInterfaceRegistry.js — closed vocabulary, limits,
 * CSV schema and named method of the Matrix Management-Interface Operating-
 * Agreement Register (ADR-0162, Schema v131).
 *
 * Leaf module: imports nothing with storage, clock, or DOM side effects so
 * `schema.js`, domain readers/rules/actions, `csv.js`, and UI panels read one
 * source of truth.
 */

import { MATRIX_FLOORS } from './matrixRegistry.js';

export const MATRIX_INTERFACE_ENGINE_VERSION = 'matrix-interface-2026.11-v1';
export const MATRIX_INTERFACE_RULE_ID = 'RULE-MIA-01';

export const MATRIX_INTERFACE_EVENTS = Object.freeze({
  AFFIRM: 'matrix.interface.affirmed',
  RETIRE: 'matrix.interface.retired',
  CONVENTIONS: 'matrix.interface.conventions.set',
  SCAN: 'matrix.interface.scan',
});

export const MATRIX_INTERFACE_RIGHTS = Object.freeze({
  AFFIRM: 'affirm-matrix-interface',
  GOVERN: 'govern-matrix-interface',
});

export const MATRIX_INTERFACE_DEFAULTS = Object.freeze({
  termDays: 180,
  dueWarnDays: 14,
  reviewAskDays: 14,
});

export const MATRIX_INTERFACE_BOUNDS = Object.freeze({
  termDays: Object.freeze([30, 365]),
  dueWarnDays: Object.freeze([1, 90]),
  reviewAskDays: Object.freeze([1, 60]),
});

export const MATRIX_INTERFACE_LIMITS = Object.freeze({
  acts: 600,
  markers: 400,
  rows: 80,
  basisMin: 8,
  basisMax: 300,
  reasonMin: 8,
  reasonMax: 300,
  asksPerCommit: 12,
});

export const MATRIX_INTERFACE_CONSULTATION_RULES = Object.freeze([
  Object.freeze({
    key: 'joint-priority-and-capacity',
    label: 'Joint priority & capacity',
    hint: 'Both counterpart managers consult before altering scope, priority, or allocated capacity.',
  }),
  Object.freeze({
    key: 'joint-tradeoffs-only',
    label: 'Joint trade-offs on collision',
    hint: 'Each line operates within its declared rights and escalates when competing demands collide.',
  }),
  Object.freeze({
    key: 'consult-before-retune',
    label: 'Consult before retune',
    hint: 'Each line directs its own scope day-to-day, with mandatory joint review before retuning shares or rights.',
  }),
  Object.freeze({
    key: 'async-update-only',
    label: 'Written change notice',
    hint: 'Independent operation inside declared rights with written notification of material changes.',
  }),
]);

export const MATRIX_INTERFACE_CONSULTATION_KEYS = Object.freeze(
  MATRIX_INTERFACE_CONSULTATION_RULES.map((r) => r.key),
);
const RULE_BY_KEY = new Map(MATRIX_INTERFACE_CONSULTATION_RULES.map((r) => [r.key, r]));
export function consultationRuleMeta(key) {
  return RULE_BY_KEY.get(String(key || '').trim()) || null;
}

/**
 * Closed pair states in strict precedence order (lower index wins).
 * Every active unordered manager pair resolves to exactly one state.
 */
export const MATRIX_INTERFACE_STATES = Object.freeze([
  Object.freeze({
    key: 'structurally-unresolvable',
    label: 'Structurally unresolvable',
    tone: 'bad',
    severity: 0,
    hint: 'No unique joint apex sits above both counterparts in the reporting DAG (diamond tie, disconnected manager, or named escalation owner is no longer an ancestor).',
  }),
  Object.freeze({
    key: 'contested-terms',
    label: 'Terms diverge',
    tone: 'bad',
    severity: 1,
    hint: 'Both counterparts signed live acts in the current round with different terms (consultation rule, forum, escalation owner, or dates).',
  }),
  Object.freeze({
    key: 'forum-unavailable',
    label: 'Forum unavailable',
    tone: 'bad',
    severity: 2,
    hint: 'The agreed operating interface names a cadence forum that no longer exists or has been retired.',
  }),
  Object.freeze({
    key: 'expired',
    label: 'Expired',
    tone: 'warn',
    severity: 3,
    hint: 'The agreed review deadline has passed; coverage never renews by silence.',
  }),
  Object.freeze({
    key: 'one-sided',
    label: 'One-sided',
    tone: 'warn',
    severity: 4,
    hint: 'Exactly one counterpart manager signed terms; awaiting confirmation from the other.',
  }),
  Object.freeze({
    key: 'unagreed',
    label: 'Unagreed',
    tone: 'warn',
    severity: 5,
    hint: 'No active operating agreement is in force today (never signed, retired, or dated in the future).',
  }),
  Object.freeze({
    key: 'current',
    label: 'Current',
    tone: 'good',
    severity: 6,
    hint: 'Both counterparts signed matching active terms with a valid forum (if named) and a unique joint escalation apex.',
  }),
]);

export const MATRIX_INTERFACE_STATE_KEYS = Object.freeze(
  MATRIX_INTERFACE_STATES.map((s) => s.key),
);
const STATE_BY_KEY = new Map(MATRIX_INTERFACE_STATES.map((s) => [s.key, s]));
export function interfaceStateMeta(key) {
  return STATE_BY_KEY.get(String(key || '').trim()) || STATE_BY_KEY.get('unagreed');
}

export const MATRIX_INTERFACE_METHOD = Object.freeze([
  Object.freeze({
    name: 'Information-processing lateral interfaces (Galbraith, 1973)',
    why: 'Shared people couple two spans into recurring lateral decisions. Where shared load creates uncertainty, counterpart managers need an explicit operating interface naming how joint priorities, trade-offs, and escalations are resolved.',
  }),
  Object.freeze({
    name: 'Relational coordination & bilateral standing (Gittell, 2002/2006)',
    why: 'An interface contract cannot be declared for a peer by one side or by a third party. Both counterparts must sign identical terms in separate first-person acts; an unconfirmed proposal stays one-sided and never counts as agreed.',
  }),
  Object.freeze({
    name: 'Minimal common ancestors & tie refusal in a DAG',
    why: 'Every escalation route is checked dynamically against the live reporting DAG (`matrixJointApex`). When two managers share incomparable minimal ancestors (a diamond tie) or sit disconnected, the interface reads structurally unresolvable rather than guessing an owner.',
  }),
  Object.freeze({
    name: 'Sunset terms & refusal of partial/small-cell coverage rates',
    why: 'Agreements expire on their stated `reviewByOn` date and never auto-renew. Workspace coverage percentages are withheld whenever active line defects cloud the pair graph or fewer than the small-cell floor (' + String(MATRIX_FLOORS.cellN) + ') pairs exist.',
  }),
]);

export const MATRIX_INTERFACE_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'scope',
  'as_of',
  'all_pairs_n',
  'current_n',
  'one_sided_n',
  'contested_terms_n',
  'forum_unavailable_n',
  'expired_n',
  'unagreed_n',
  'unresolvable_n',
  'due_soon_n',
  'covered_n',
  'uncovered_n',
  'coverage_pct',
  'coverage_withheld',
  'coverage_withheld_reason',
  'invalid_line_n',
  'incomplete_pairs_n',
  'cell_floor',
  'default_term_days',
  'due_warn_days',
  'states_reconcile',
  'shared_people_n',
  'apex_kind',
  'apex_ambiguous',
  'unresolved_pairs_n',
]);

export const MATRIX_INTERFACE_CSV_DESCRIPTOR = Object.freeze({
  key: 'matrix-interfaces',
  label: 'Matrix management-interface agreements (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'matrix-interfaces',
  description: 'One workspace summary row plus one aggregate row per active joint-apex escalation bucket for unresolved management-interface pairs. Counts deduplicated active unordered manager pairs by derived state (current, one-sided, contested-terms, forum-unavailable, expired, unagreed, structurally-unresolvable) and whether state totals reconcile. NO person id, NO person name, NO manager id, NO manager name, NO forum label, NO escalation seat id and NO free text. Coverage percentage is BLANK with coverage_withheld = true and the printed reason whenever active line defects compromise completeness or the pair count sits below the declared cell floor.',
});
