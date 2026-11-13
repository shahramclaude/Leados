/**
 * app/core/domain/changeImpactRegistry.js — closed vocabulary for Matrix
 * Change-Impact Line Reviews (ADR-0185, Schema v147, RULE-CIL-01).
 *
 * This register is about whether every active reporting-line principal for an
 * impacted multi-line person has reviewed the same dated change-impact snapshot.
 * `reviewed` means only that review was recorded; it is not an approval, a safe-
 * to-proceed judgement, or the employee's consent.
 */

export const CHANGE_IMPACT_ENGINE_VERSION = 'change-impact-2026.11-v1';
export const CHANGE_IMPACT_RULE_ID = 'RULE-CIL-01';

export const CHANGE_IMPACT_EVENTS = Object.freeze({
  REQUESTED: 'change.impact.requested',
  RESPONDED: 'change.impact.responded',
});

export const CHANGE_IMPACT_RIGHTS = Object.freeze({
  READ: 'read-change-impact-review',
  REQUEST: 'request-change-impact-review',
  RESPOND: 'respond-change-impact-review',
});

export const CHANGE_IMPACT_STATES = Object.freeze([
  Object.freeze({ key: 'unverifiable', label: 'Line state unreadable', tone: 'bad', severity: 0 }),
  Object.freeze({ key: 'declined', label: 'Declined', tone: 'bad', severity: 1 }),
  Object.freeze({ key: 'stale', label: 'Stale — refresh required', tone: 'bad', severity: 2 }),
  Object.freeze({ key: 'expired', label: 'Review expired', tone: 'warn', severity: 3 }),
  Object.freeze({ key: 'overdue', label: 'No answer by due date', tone: 'warn', severity: 4 }),
  Object.freeze({ key: 'unrequested', label: 'Not yet requested', tone: 'warn', severity: 5 }),
  Object.freeze({ key: 'pending', label: 'Awaiting line review', tone: 'warn', severity: 6 }),
  Object.freeze({ key: 'reviewed', label: 'Reviewed through stated date', tone: 'good', severity: 7 }),
  Object.freeze({ key: 'superseded', label: 'Superseded request — history', tone: 'neutral', severity: 8 }),
  Object.freeze({ key: 'historical', label: 'Change closed — history', tone: 'neutral', severity: 9 }),
]);

const STATE_BY_KEY = new Map(CHANGE_IMPACT_STATES.map((state) => [state.key, state]));
export function changeImpactState(key) {
  return STATE_BY_KEY.get(String(key || '').trim()) || null;
}

export const CHANGE_IMPACT_LIMITS = Object.freeze({
  requests: 1200,
  responses: 1200,
  reportRows: 200,
  reasonMin: 8,
  reasonMax: 400,
  promptMax: 400,
  requestDueDays: Object.freeze([0, 30]),
  responseTermDays: Object.freeze([1, 365]),
  snapshotLines: 12,
});

/** CSV scope #139 — aggregate only. No person/change/line identity or prose. */
export const CHANGE_IMPACT_CSV_SCOPE = 'matrix-change-impact';

export const CHANGE_IMPACT_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'as_of',
  'changes_n',
  'multi_line_people_n',
  'required_line_reviews_n',
  'reviewed_n',
  'unrequested_n',
  'pending_n',
  'overdue_n',
  'declined_n',
  'expired_n',
  'stale_n',
  'unverifiable_n',
  'single_line_excluded_n',
  'withheld_rows_n',
  'coverage_pct',
  'coverage_withheld',
  'coverage_withheld_reason',
  'clearance_state',
]);

export const CHANGE_IMPACT_CSV_DESCRIPTOR = Object.freeze({
  key: CHANGE_IMPACT_CSV_SCOPE,
  label: 'Matrix change-impact line-review coverage (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'matrix-change-impact',
  description: 'One workspace summary row: current line-review coverage and refusal counts for change-impacted multi-line people. NO change title, person, manager, line, record id, response text or decline reason. Coverage is blank below the declared three-row floor or when the read is incomplete; a completed review is not approval or employee consent.',
});
