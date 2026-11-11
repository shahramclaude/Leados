/**
 * app/core/domain/doaScheduleRegistry.js — closed vocabulary, bounds, named
 * cross-domain frameworks and aggregate-only CSV schema for the Standing
 * Delegation-of-Authority (DoA) Schedule & Cross-Line Limit Conformance engine
 * (ADR-0174, Schema v138, `RULE-DOA-01`, CSV scope #128, `#/matrix?panel=authority`).
 *
 * Pure leaf registry: zero runtime imports outside `matrixRegistry.js` so
 * schema normalizers, domain readers, automation rules, CSV exporters and UI
 * panels share one authoritative set of constants.
 */

import { MATRIX_LINE_KINDS } from './matrixRegistry.js';

export const DOA_ENGINE_VERSION = 'doa-schedule-2026.11-v1';
export const DOA_RULE_ID = 'RULE-DOA-01';

export const DOA_EVENTS = Object.freeze({
  DECLARE: 'doa.limit.declared',
  RETIRE: 'doa.limit.retired',
  PRICE_DECISION: 'doa.decision.priced',
  CONVENTIONS: 'doa.conventions.updated',
  SCAN: 'doa.scan',
});

export const DOA_BOUNDS = Object.freeze({
  maxActs: 600,
  markers: 400,
  asksPerCommit: 12,
  rateFloor: 3,
  detailRank: 4,
  rowsCap: 50,
  scheduleRowsCap: 60,
  spansCap: 20,
  /** 1 trillion currency units in exact integer cents, well inside MAX_SAFE_INTEGER. */
  maxCents: 100_000_000_000_000,
  reasonMinChars: 8,
  reasonMaxChars: 400,
  titleChars: 200,
});

export const DOA_DEFAULTS = Object.freeze({
  doaAskDueDays: Object.freeze({ min: 1, max: 60, fallback: 14 }),
  doaAutoPropagate: true,
});

export const DOA_ACT_KINDS = Object.freeze(['declare', 'retire', 'price-decision']);

export const DOA_OBJECT_KINDS = Object.freeze([
  Object.freeze({
    key: 'mandate',
    label: 'Spending mandate',
    hint: 'Decision Rights Exchange (ADR-0078) spending ceiling tested against the issuer’s own standing limit on the grant date (nemo dat quod non habet).',
  }),
  Object.freeze({
    key: 'budget-line',
    label: 'Budget commitment',
    hint: 'Committed or spent financial line (ADR-0024/0136) tested against the authorizing owner’s standing limit on the commitment date.',
  }),
  Object.freeze({
    key: 'decision',
    label: 'Priced decision',
    hint: 'Decided call whose Approver is tested against typed monetary commitments linked to that decision; untyped decisions are refused, never parsed from prose.',
  }),
]);

export const DOA_OBJECT_KIND_KEYS = Object.freeze(DOA_OBJECT_KINDS.map((k) => k.key));
const OBJECT_KIND_BY_KEY = new Map(DOA_OBJECT_KINDS.map((k) => [k.key, k]));
export function doaObjectKind(key) {
  return OBJECT_KIND_BY_KEY.get(String(key || '').trim()) || null;
}

export const DOA_SCOPE_CLASSES = Object.freeze([
  Object.freeze({ key: 'general', label: 'General (catch-all)', hint: 'Applies when no narrower class schedule is active for that seat, line kind and currency on that date.' }),
  Object.freeze({ key: 'opex', label: 'Operating expenditure', hint: 'Software, training, travel, general operating commitments and spending mandates.' }),
  Object.freeze({ key: 'capex', label: 'Capital / infrastructure', hint: 'Infrastructure and long-lived capital commitments.' }),
  Object.freeze({ key: 'headcount', label: 'Headcount & staffing', hint: 'Headcount budget commitments.' }),
  Object.freeze({ key: 'vendor', label: 'External vendor', hint: 'Third-party vendor contract commitments.' }),
]);

export const DOA_SCOPE_CLASS_KEYS = Object.freeze(DOA_SCOPE_CLASSES.map((c) => c.key));
const SCOPE_CLASS_BY_KEY = new Map(DOA_SCOPE_CLASSES.map((c) => [c.key, c]));
export function doaScopeClass(key) {
  return SCOPE_CLASS_BY_KEY.get(String(key || '').trim()) || null;
}

export function budgetCategoryToDoaScope(category) {
  switch (String(category || '').trim()) {
    case 'people':
    case 'headcount':
      return 'headcount';
    case 'vendors-services':
    case 'vendor':
      return 'vendor';
    case 'facilities-equipment':
    case 'infrastructure':
    case 'capex':
      return 'capex';
    case 'contingency':
    case 'other':
    case 'general':
      return 'general';
    default:
      return 'opex';
  }
}

export const DOA_LINE_SCOPES = Object.freeze([
  Object.freeze({
    key: 'any-line',
    label: 'Any reporting line',
    hint: 'Standing authority applies across both the home chain and declared matrix lines unless overridden by a line-specific schedule.',
  }),
  ...MATRIX_LINE_KINDS.map((k) => Object.freeze({
    key: k.key,
    label: `${k.label} line`,
    hint: k.hint,
  })),
]);

export const DOA_LINE_SCOPE_KEYS = Object.freeze(DOA_LINE_SCOPES.map((l) => l.key));
const LINE_SCOPE_BY_KEY = new Map(DOA_LINE_SCOPES.map((l) => [l.key, l]));
export function doaLineScope(key) {
  return LINE_SCOPE_BY_KEY.get(String(key || '').trim()) || null;
}

export const DOA_ROUTES = Object.freeze([
  Object.freeze({ key: 'home-chain', label: 'Home chain (functional)' }),
  Object.freeze({ key: 'second-line', label: 'Declared matrix line' }),
  Object.freeze({ key: 'self', label: 'Seat’s own envelope' }),
  Object.freeze({ key: 'lateral', label: 'Lateral / cross-branch handoff' }),
]);
const ROUTE_BY_KEY = new Map(DOA_ROUTES.map((r) => [r.key, r]));
export function doaRoute(key) {
  return ROUTE_BY_KEY.get(String(key || '').trim()) || null;
}

export const DOA_RECORD_REFUSALS = Object.freeze([
  Object.freeze({
    key: 'untyped-amount',
    label: 'Untyped or missing amount',
    detail: 'No typed monetary figure is recorded on the commitment (or a decided decision has no linked priced commitment). Free text is never parsed as money.',
  }),
  Object.freeze({
    key: 'mixed-currency',
    label: 'Mixed currencies on linked commitments',
    detail: 'Linked commitments span more than one ISO currency; no implicit FX conversion is ever invented.',
  }),
  Object.freeze({
    key: 'undated',
    label: 'Missing commitment date',
    detail: 'No valid calendar commitment/approval date is recorded, so the schedule in force that day cannot be determined.',
  }),
  Object.freeze({
    key: 'unattributed',
    label: 'Missing or ambiguous authorizing hand',
    detail: 'No single roster owner or Approver could be resolved on the commitment.',
  }),
  Object.freeze({
    key: 'inactive-subject',
    label: 'Authorizing or receiving seat not on roster',
    detail: 'The commitment references a seat or person outside the active roster.',
  }),
]);
export const DOA_RECORD_REFUSAL_KEYS = Object.freeze(DOA_RECORD_REFUSALS.map((r) => r.key));
const RECORD_REFUSAL_BY_KEY = new Map(DOA_RECORD_REFUSALS.map((r) => [r.key, r]));
export function doaRecordRefusal(key) {
  return RECORD_REFUSAL_BY_KEY.get(String(key || '').trim()) || null;
}

export const DOA_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'breach',
    rank: 0,
    tone: 'bad',
    label: 'Exceeds standing limit',
    detail: 'The commitment or delegated ceiling exceeds the authorizing seat’s active standing limit in that currency, scope class and line kind on the commitment date.',
  }),
  Object.freeze({
    key: 'currency-mismatch',
    rank: 1,
    tone: 'warn',
    label: 'Currency mismatch (refused)',
    detail: 'The authorizing seat holds an active standing limit on that date, but in a different ISO currency; FX rates are never assumed.',
  }),
  Object.freeze({
    key: 'unscheduled',
    rank: 2,
    tone: 'warn',
    label: 'No standing limit recorded (refused)',
    detail: 'No active standing Delegation-of-Authority schedule covers that seat, line kind and scope class on the commitment date; neither unlimited authority nor a zero limit is assumed.',
  }),
  Object.freeze({
    key: 'structure-unreadable',
    rank: 3,
    tone: 'warn',
    label: 'Structure or schedule unreadable (refused)',
    detail: 'The as-of reporting graph has an unrecorded home-line gap on that date, or raw storage holds contradictory overlapping schedules.',
  }),
  Object.freeze({
    key: 'conformant',
    rank: 4,
    tone: 'good',
    label: 'Within standing limit',
    detail: 'The commitment or delegated ceiling is less than or equal to the authorizing seat’s active standing limit in the exact currency, scope class and line kind on the commitment date.',
  }),
]);
export const DOA_VERDICT_KEYS = Object.freeze(DOA_VERDICTS.map((v) => v.key));
const VERDICT_BY_KEY = new Map(DOA_VERDICTS.map((v) => [v.key, v]));
export function doaVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '').trim()) || DOA_VERDICTS[3];
}

export const DOA_BREACH_CLASSES = Object.freeze([
  Object.freeze({
    key: 'nemo-dat',
    label: 'Nemo dat — mandate exceeds issuer limit',
    short: 'Nemo dat',
    detail: 'A spending mandate’s ceiling exceeds the granting seat’s own active standing limit on the grant date.',
  }),
  Object.freeze({
    key: 'second-line-limit',
    label: 'Matrix secondary-line limit exceeded',
    short: 'Second-line limit',
    detail: 'The commitment routes through a declared matrix reporting line whose line-kind limit is lower than the commitment (even if the seat holds a higher functional limit on its home chain).',
  }),
  Object.freeze({
    key: 'over-limit',
    label: 'Standing seat limit exceeded',
    short: 'Over limit',
    detail: 'The commitment exceeds the seat’s active standing limit in that currency and scope class on the commitment date.',
  }),
]);
export const DOA_BREACH_CLASS_KEYS = Object.freeze(DOA_BREACH_CLASSES.map((b) => b.key));
const BREACH_CLASS_BY_KEY = new Map(DOA_BREACH_CLASSES.map((b) => [b.key, b]));
export function doaBreachClass(key) {
  return BREACH_CLASS_BY_KEY.get(String(key || '').trim()) || null;
}

export const DOA_CROSS_LINE_STATES = Object.freeze([
  Object.freeze({
    key: 'single-line',
    tone: 'neutral',
    label: 'Single reporting line',
    detail: 'Only one reporting line governs the subject on the commitment date.',
  }),
  Object.freeze({
    key: 'aligned-both-cover',
    tone: 'good',
    label: 'All active lines cover individually',
    detail: 'Every manager holding an active reporting line on the shared subject holds a standing limit covering the full commitment.',
  }),
  Object.freeze({
    key: 'asymmetric-line-limits',
    tone: 'warn',
    label: 'Asymmetric cross-line limits',
    detail: 'One active reporting line’s manager holds sufficient standing authority while another active line’s manager on the same shared subject does not.',
  }),
  Object.freeze({
    key: 'neither-line-covers',
    tone: 'bad',
    label: 'No single line covers (anti-splitting)',
    detail: 'Multiple active lines touch the shared subject and no single line manager holds sufficient standing authority alone; separate limits are never summed across peers.',
  }),
  Object.freeze({
    key: 'unscheduled-line',
    tone: 'warn',
    label: 'Counterpart line unscheduled',
    detail: 'At least one active reporting line on the shared subject has no recorded schedule in the commitment’s currency on that date.',
  }),
]);
const CROSS_LINE_BY_KEY = new Map(DOA_CROSS_LINE_STATES.map((s) => [s.key, s]));
export function doaCrossLineState(key) {
  return CROSS_LINE_BY_KEY.get(String(key || '').trim()) || DOA_CROSS_LINE_STATES[0];
}

export const DOA_COVER_STATES = Object.freeze([
  Object.freeze({
    key: 'unique',
    tone: 'good',
    label: 'Unique covering ancestor',
    detail: 'Exactly one minimal senior seat in the reporting DAG on the commitment date holds an active limit covering this commitment in the same currency.',
  }),
  Object.freeze({
    key: 'matrix-tie',
    tone: 'warn',
    label: 'Matrix covering-seat tie',
    detail: 'Two or more incomparable senior seats across functional and matrix lines cover the commitment; neither is picked silently, and escalation routes only through a unique joint apex.',
  }),
  Object.freeze({
    key: 'above-apex',
    tone: 'bad',
    label: 'Exceeds enterprise schedule (Board required)',
    detail: 'No seat up to and including the workspace apex holds a standing limit covering this commitment in this currency on that date.',
  }),
  Object.freeze({
    key: 'unreadable',
    tone: 'warn',
    label: 'Covering chain unreadable',
    detail: 'An unrecorded home-line gap above the authorizing seat prevents proving who held covering authority on that date.',
  }),
]);
const COVER_BY_KEY = new Map(DOA_COVER_STATES.map((c) => [c.key, c]));
export function doaCoverState(key) {
  return COVER_BY_KEY.get(String(key || '').trim()) || DOA_COVER_STATES[3];
}

export const DOA_METHOD = Object.freeze([
  Object.freeze({
    name: 'COSO Internal Control — Integrated Framework (2013), Control Activities (Authorization)',
    application: 'Standing Delegation-of-Authority schedules establish ex-ante commitment ceilings per seat, currency, scope class and reporting-line kind, independent of ex-post segregation of duties (ADR-0170).',
  }),
  Object.freeze({
    name: 'Agency Theory & Formal Authority (Jensen & Meckling 1976; Aghion & Tirole 1997)',
    application: 'Nemo dat quod non habet: no seat may grant a subordinate or spending mandate a ceiling higher than the grantor’s own active standing limit on that date.',
  }),
  Object.freeze({
    name: 'Corporate DoA Anti-Splitting & Multi-Principal Matrix Control (Anthony & Govindarajan)',
    application: 'Two managers holding $50k limits on separate reporting lines of one shared person never combine to authorize an $80k commitment; each authorizing hand is tested individually against the route’s line-kind schedule.',
  }),
  Object.freeze({
    name: 'Valid-Time As-Of Structure & Schedule Evaluation (Snodgrass; ADR-0149)',
    application: 'Every commitment is evaluated against the standing schedule and reporting graph (`buildMatrix` + `structureHistory`) in force on its own effective date — never excused or condemned by later changes.',
  }),
  Object.freeze({
    name: 'Fail-Closed Refusal & Exact Integer-Cent Arithmetic (Bulletproof Reliability Mandate)',
    application: 'All monetary bounds are stored and compared in exact integer cents; untyped prose, mixed currencies, missing dates and unscheduled seats are refused with printed reasons rather than defaulted to zero or unlimited.',
  }),
]);

export const DOA_CSV_DESCRIPTOR = Object.freeze({
  key: 'matrix-doa',
  label: 'Matrix delegation-of-authority conformance (aggregate — schedule & breach counts, no identities)',
  group: 'Matrix',
  sensitive: false,
  filenameSlug: 'matrix-doa',
  description: 'Aggregate counts of active standing authority limits, tested commitments across mandates/budgets/decisions, conformant vs breach classes (nemo dat, second-line, over-limit), cross-line states, covering-seat resolutions, refusals, and reconciliation flags. Carries zero person IDs, seat IDs, names, titles, or raw currency amounts.',
});

export const DOA_CSV_COLUMNS = Object.freeze([
  { key: 'engine_version', header: 'engine_version' },
  { key: 'as_of_date', header: 'as_of_date' },
  { key: 'row_scope', header: 'row_scope' },
  { key: 'is_matrix', header: 'is_matrix' },
  { key: 'active_limits_n', header: 'active_limits_n' },
  { key: 'retired_limits_n', header: 'retired_limits_n' },
  { key: 'read_n', header: 'read_n' },
  { key: 'in_seat_n', header: 'in_seat_n' },
  { key: 'outside_seat_n', header: 'outside_seat_n' },
  { key: 'tested_n', header: 'tested_n' },
  { key: 'record_refused_n', header: 'record_refused_n' },
  { key: 'conformant_n', header: 'conformant_n' },
  { key: 'breach_n', header: 'breach_n' },
  { key: 'nemo_dat_n', header: 'nemo_dat_n' },
  { key: 'second_line_limit_n', header: 'second_line_limit_n' },
  { key: 'over_limit_n', header: 'over_limit_n' },
  { key: 'currency_mismatch_n', header: 'currency_mismatch_n' },
  { key: 'unscheduled_n', header: 'unscheduled_n' },
  { key: 'structure_unreadable_n', header: 'structure_unreadable_n' },
  { key: 'asymmetric_cross_line_n', header: 'asymmetric_cross_line_n' },
  { key: 'neither_line_covers_n', header: 'neither_line_covers_n' },
  { key: 'cover_unique_n', header: 'cover_unique_n' },
  { key: 'cover_matrix_tie_n', header: 'cover_matrix_tie_n' },
  { key: 'cover_above_apex_n', header: 'cover_above_apex_n' },
  { key: 'cover_unreadable_n', header: 'cover_unreadable_n' },
  { key: 'conformance_permille', header: 'conformance_permille' },
  { key: 'conformance_withheld_reason', header: 'conformance_withheld_reason' },
  { key: 'counts_reconcile', header: 'counts_reconcile' },
  { key: 'figures_complete', header: 'figures_complete' },
]);
