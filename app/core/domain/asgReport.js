/**
 * app/core/domain/asgReport.js — the AGGREGATE export of the Secondment /
 * Assignment Return & Handover Register (ADR-0262, Schema v214, CSV scope
 * #198).
 *
 * Built from the SAME reader (`buildAssignmentReport`) the `#/secondment`
 * panel renders. Every figure is a COUNT over the whole register or a
 * PUBLISHED-vocabulary key (the closed state keys and cover-kind keys). No
 * assignment reference, person, manager, cover hand, duty label, terms
 * reference, rationale, basis, evidence reference or day crosses this
 * boundary. A per-state count below the declared privacy floor exports BLANK
 * with its reason, never as a small number — the same floor the on-screen
 * panel respects.
 *
 * The rows are: one summary row (the whole register), one row per printed
 * state, and one row per coverage kind. `complete` is folded into its own
 * column and never into a count.
 */

import { ASG_CSV_COLUMNS, ASG_COVER_KINDS, ASG_SETTING_KEYS, ASG_STATE_KEYS } from './asgRegistry.js';

/**
 * Build the CSV rows from an assignment report.
 * Returns an array of row objects keyed by the ASG_CSV_COLUMNS keys.
 */
export function asgCsvRows(report) {
  if (!report) return [];
  const empty = Object.fromEntries(ASG_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions?.[ASG_SETTING_KEYS.privacyFloor] || 3;
  const t = report.totals || {};
  const rows = [];

  /* 1. The summary row. The whole register, one row. State counts printed in
        full — the summary is the reader's own totals and the per-state rows
        below apply the floor. */
  rows.push({
    ...empty,
    as_of: report.today || '',
    row_kind: 'summary',
    key: 'ALL',
    assignments_n: t.total || 0,
    planned_n: t.planned || 0,
    active_n: t.active || 0,
    decision_due_n: t.decisionDue || 0,
    return_decision_overdue_n: t.returnDecisionOverdue || 0,
    handback_open_n: t.handbackOpen || 0,
    returned_n: t.returned || 0,
    transfer_consent_owed_n: t.transferConsentOwed || 0,
    transfer_handback_open_n: t.transferHandbackOpen || 0,
    transferred_n: t.transferred || 0,
    decisions_n: t.decisions || 0,
    extends_n: t.extends || 0,
    decided_late_n: t.decidedLate || 0,
    coverage_rows_n: t.coverageRows || 0,
    named_cover_n: t.namedCover || 0,
    retained_by_home_n: t.retainedByHome || 0,
    uncovered_n: t.uncovered || 0,
    handbacks_n: t.handbacks || 0,
    consents_n: t.consents || 0,
    unresolved_hands_n: t.unresolvedHands || 0,
    privacy_floor: floor,
    complete: 1,
    blank_reason: '',
  });

  /* 2. One row per printed state, floored. Below the floor and non-zero, the
        count is withheld with its reason — never printed as a small number. */
  for (const key of ASG_STATE_KEYS) {
    const raw = stateRawCount(report.counts, key);
    const withheld = raw > 0 && raw < floor;
    rows.push({
      ...empty,
      as_of: report.today || '',
      row_kind: 'state',
      key,
      assignments_n: withheld ? '' : raw,
      privacy_floor: floor,
      complete: 1,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} assignment(s); the count is withheld rather than printed. `
        : '',
    });
  }

  /* 3. One row per coverage kind, floored the same way. */
  const coverTotals = {
    'named-cover': t.namedCover || 0,
    'retained-by-home': t.retainedByHome || 0,
    uncovered: t.uncovered || 0,
  };
  for (const key of ASG_COVER_KINDS) {
    const raw = coverTotals[key] || 0;
    const withheld = raw > 0 && raw < floor;
    rows.push({
      ...empty,
      as_of: report.today || '',
      row_kind: 'coverage',
      key,
      coverage_rows_n: withheld ? '' : raw,
      privacy_floor: floor,
      complete: 1,
      blank_reason: withheld
        ? `This coverage kind carries fewer than the declared privacy floor of ${floor} row(s); the count is withheld rather than printed. `
        : '',
    });
  }

  return rows;
}

function stateRawCount(counts, stateKey) {
  const map = {
    planned: 'planned',
    active: 'active',
    'decision-due': 'decisionDue',
    'return-decision-overdue': 'returnDecisionOverdue',
    'handback-open': 'handbackOpen',
    returned: 'returned',
    'transfer-consent-owed': 'transferConsentOwed',
    'transfer-handback-open': 'transferHandbackOpen',
    transferred: 'transferred',
  };
  return (counts && counts[map[stateKey]]) || 0;
}

/** Guard: every state key the columns reference is in the closed set. */
export function asgCsvStateKeys() {
  return [...ASG_STATE_KEYS];
}
