/**
 * app/core/domain/sourcingCsv.js — CSV scope #170 (ADR-0229, Schema v182).
 *
 * IDENTITY-FREE BY CONSTRUCTION. The rows are built from the SAME reader the
 * `#/sourcing` panel renders, with the seat cleared, so an exported figure is
 * provably the figure that was printed.
 *
 * What crosses this boundary: counts, states, verdicts, the declared specificity
 * and chosen mode, and per-currency money in whole cents with the exact premium.
 * What never does: a capability title, a case id, an owner, a manager, a vendor,
 * a contract reference, a rationale, a lesson text or a cost line label.
 *
 * A figure the reader cannot compute exports BLANK with its reason, never a
 * zero — because a zero in a money column reads as "we spent nothing", which is
 * a claim this register would be inventing.
 */

import { SRC_STATES, SRC_VERDICTS, SRC_SPECIFICITY, SRC_MODE_KEYS, srcMode } from './sourcingRegistry.js';

const SPECIFICITY_KEYS = SRC_SPECIFICITY.map((row) => row.key);

/** One row per aggregate line, with the reason a blank cell is blank. */
export function sourcingCsvRows(report) {
  const rows = [];
  const blankReasonFor = (value, reason) => (value === null || value === undefined ? reason : '');

  rows.push({
    as_of: report.today,
    row_kind: 'summary',
    key: 'workspace',
    currency: '',
    cases_n: report.counts.cases,
    comparable_n: report.coverage.liveN - report.coverage.withNoOptionN - report.coverage.notComparableN,
    decided_n: report.counts.decided,
    hold_up_n: report.coverage.holdUpUnaddressedN,
    no_safeguard_n: report.coverage.holdUpUnaddressedN,
    review_overdue_n: report.coverage.reviewOverdueN,
    state: '',
    verdict: '',
    specificity: '',
    mode_chosen: '',
    cheapest_mode: '',
    chosen_total_cents: '',
    cheapest_total_cents: '',
    premium_cents: '',
    premium_bp: '',
    safeguard_answers: '',
    option_count: report.counts.options,
    cost_line_count: report.counts.options ? '' : '',
    blank_reason: report.matrixError ? 'the reporting graph could not be read' : '',
  });

  for (const state of SRC_STATES) {
    rows.push({
      as_of: report.today,
      row_kind: 'state',
      key: state.key,
      currency: '',
      cases_n: report.counts.states[state.key] || 0,
      comparable_n: '', decided_n: '', hold_up_n: '', no_safeguard_n: '', review_overdue_n: '',
      state: state.key,
      verdict: '', specificity: '', mode_chosen: '', cheapest_mode: '',
      chosen_total_cents: '', cheapest_total_cents: '', premium_cents: '', premium_bp: '',
      safeguard_answers: '', option_count: '', cost_line_count: '',
      blank_reason: '',
    });
  }

  for (const verdict of SRC_VERDICTS) {
    rows.push({
      as_of: report.today,
      row_kind: 'verdict',
      key: verdict.key,
      currency: '',
      cases_n: report.counts.verdicts[verdict.key] || 0,
      comparable_n: '', decided_n: '', hold_up_n: '', no_safeguard_n: '', review_overdue_n: '',
      state: '', verdict: verdict.key, specificity: '', mode_chosen: '', cheapest_mode: '',
      chosen_total_cents: '', cheapest_total_cents: '', premium_cents: '', premium_bp: '',
      safeguard_answers: '', option_count: '', cost_line_count: '',
      blank_reason: '',
    });
  }

  for (const row of report.byCurrency) {
    const decidedModes = (report.rows || [])
      .filter((r) => r.currency === row.currency && r.decision && !r.withdrawn)
      .map((r) => r.decision.mode);
    const uniqueModes = [...new Set(decidedModes)].sort();
    const cheapestModes = (report.rows || [])
      .filter((r) => r.currency === row.currency && r.cheapest?.modes?.length && !r.withdrawn)
      .flatMap((r) => r.cheapest.modes);
    const uniqueCheapest = [...new Set(cheapestModes)].sort();
    rows.push({
      as_of: report.today,
      row_kind: 'currency',
      key: row.currency,
      currency: row.currency,
      cases_n: row.cases,
      comparable_n: row.comparable,
      decided_n: row.decided,
      hold_up_n: row.holdUpUnaddressed,
      no_safeguard_n: row.holdUpUnaddressed,
      review_overdue_n: row.reviewOverdue,
      state: '',
      verdict: '',
      specificity: '',
      // A mode is only named when the whole currency agreed on one; otherwise
      // the cell is BLANK because naming one would pick a winner across cases.
      mode_chosen: uniqueModes.length === 1 ? uniqueModes[0] : '',
      cheapest_mode: uniqueCheapest.length === 1 ? uniqueCheapest[0] : '',
      chosen_total_cents: row.chosenTotalCents ?? '',
      cheapest_total_cents: row.cheapestTotalCents ?? '',
      premium_cents: row.premiumTotalCents ?? '',
      premium_bp: row.premiumBp ?? '',
      safeguard_answers:
        row.holdUpUnaddressed === 0 ? 'all-answered'
          : row.holdUpUnaddressed === row.cases ? 'none-answered' : 'partial',
      option_count: '',
      cost_line_count: '',
      blank_reason: [
        blankReasonFor(row.chosenTotalCents, 'no decided case priced in this currency'),
        uniqueModes.length > 1 ? 'decided cases in this currency chose more than one mode' : '',
        uniqueCheapest.length > 1 && uniqueCheapest.length ? 'several modes tie as cheapest' : '',
      ].filter(Boolean).join('; '),
    });
  }

  return rows;
}

/** Exported for the invariant test: every mode label resolves. */
export const sourcingModeLabels = SRC_MODE_KEYS.map((key) => srcMode(key)?.label || key);
export const sourcingSpecificityKeys = SPECIFICITY_KEYS;
