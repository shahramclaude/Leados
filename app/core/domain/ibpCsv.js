/**
 * app/core/domain/ibpCsv.js — CSV scope #172 (ADR-0231, Schema v184).
 *
 * IDENTITY-FREE BY CONSTRUCTION. The rows are built from the SAME reader the
 * `#/ibp` panel renders, with the seat cleared, so an exported figure is
 * provably the figure that was printed.
 *
 * What crosses this boundary: counts, states, verdicts, step keys, whole plan
 * units, whole cents and basis points.
 * What never does: a cycle title, a cycle id, a product family, an owner, a
 * manager, a supply line name, a note, a basis or a reason.
 *
 * A figure the reader cannot compute exports BLANK with its reason, never a
 * zero — because a zero in a plan-unit column reads as "there is no gap", which
 * is a claim this register would be inventing.
 */

import { IBP_STATES, IBP_STEPS, IBP_VERDICTS } from './ibpRegistry.js';

const blankOr = (value, reason) => (value === null || value === undefined ? '' : value);
const reasonFor = (value, reason) => (value === null || value === undefined ? reason : '');

/** One row per aggregate line, with the reason a blank cell is blank. */
export function ibpCsvRows(report) {
  const rows = [];
  const matrixReason = report.matrixError ? 'the reporting graph could not be read, so no seat above a cycle could be proved' : '';

  rows.push({
    as_of: report.today,
    row_kind: 'summary',
    key: 'workspace',
    currency: '',
    cycles_n: report.counts.cycles,
    live_n: report.counts.live,
    approved_n: report.counts.approved,
    state: '',
    verdict: '',
    step: '',
    demand_units: report.coverage.liveN ? report.rows.filter((row) => !row.withdrawn).reduce((acc, row) => acc + row.totals.consensusUnits, 0) : '',
    baseline_units: report.coverage.liveN ? report.rows.filter((row) => !row.withdrawn).reduce((acc, row) => acc + row.totals.baselineUnits, 0) : '',
    target_units: report.coverage.liveN ? report.rows.filter((row) => !row.withdrawn).reduce((acc, row) => acc + row.totals.targetUnits, 0) : '',
    capacity_units: report.coverage.capacityEvidenceN
      ? report.rows.filter((row) => !row.withdrawn).reduce((acc, row) => acc + row.totals.capacityUnits, 0)
      : '',
    gap_units: '',
    option_capacity_units: report.coverage.liveN
      ? report.rows.filter((row) => !row.withdrawn).reduce((acc, row) => acc + row.totals.capacityAddedUnits, 0)
      : '',
    option_demand_units: report.coverage.liveN
      ? report.rows.filter((row) => !row.withdrawn).reduce((acc, row) => acc + row.totals.demandRemovedUnits, 0)
      : '',
    residual_units: '',
    residual_owned_n: report.counts.approved
      - report.rows.filter((row) => row.state === 'approved' && !row.residualMatches).length,
    contended_lines_n: report.contention.contendedN,
    contention_units: blankOr(report.contention.contentionUnits, ''),
    option_cost_cents: '',
    grade_n: report.grade.n,
    bias_units: blankOr(report.grade.biasUnits, ''),
    mape_bp: blankOr(report.grade.mapeBp, ''),
    identity_holds: report.totalReconcile ? 'true' : 'false',
    audit_clean: report.figuresComplete ? 'true' : 'false',
    blank_reason: matrixReason
      || reasonFor(report.coverage.liveN ? 0 : null, 'no live cycle exists on the record')
      || '',
  });

  // Per-state rows: counts only, never money or units, because a state is not a
  // quantity and printing a unit total against it would invent a meaning.
  for (const state of IBP_STATES) {
    rows.push({
      as_of: report.today,
      row_kind: 'state',
      key: state.key,
      currency: '',
      cycles_n: report.counts.states[state.key] || 0,
      live_n: '', approved_n: '', state, verdict: '', step: '',
      demand_units: '', baseline_units: '', target_units: '', capacity_units: '',
      gap_units: '', option_capacity_units: '', option_demand_units: '',
      residual_units: '', residual_owned_n: '', contended_lines_n: '', contention_units: '',
      option_cost_cents: '', grade_n: '', bias_units: '', mape_bp: '',
      identity_holds: '', audit_clean: '', blank_reason: '',
    });
  }

  // Per-verdict rows: one row per documented failure mode, so an exported file
  // says which way the cycle broke, not merely how many broke.
  for (const verdict of IBP_VERDICTS) {
    const matching = report.rows.filter((row) => row.verdict === verdict.key);
    const hasGap = matching.some((row) => row.totals.gapUnits !== null);
    const hasResidual = matching.some((row) => row.totals.residualUnits !== null);
    rows.push({
      as_of: report.today,
      row_kind: 'verdict',
      key: verdict.key,
      currency: '',
      cycles_n: report.counts.verdicts[verdict.key] || 0,
      live_n: '', approved_n: '', state: '', verdict, step: '',
      demand_units: '',
      baseline_units: '',
      target_units: '',
      capacity_units: '',
      gap_units: blankOr(hasGap ? matching.reduce((acc, row) => acc + (row.totals.gapUnits ?? 0), 0) : null, ''),
      option_capacity_units: '',
      option_demand_units: '',
      residual_units: blankOr(hasResidual ? matching.reduce((acc, row) => acc + (row.totals.residualUnits ?? 0), 0) : null, ''),
      residual_owned_n: '',
      contended_lines_n: '', contention_units: '', option_cost_cents: '',
      grade_n: '', bias_units: '', mape_bp: '',
      identity_holds: '', audit_clean: '',
      blank_reason: '',
    });
  }

  // Per-step rows: how far the open cycles actually got through the five steps.
  for (const step of IBP_STEPS) {
    const reached = step.key === 'portfolio'
      ? report.counts.live
      : step.key === 'demand'
        ? report.coverage.demandRecordedN
        : step.key === 'supply'
          ? report.coverage.capacityEvidenceN
          : step.key === 'reconcile'
            ? report.rows.filter((row) => !row.withdrawn && row.totals.optionsN > 0).length
            : report.counts.approved;
    rows.push({
      as_of: report.today,
      row_kind: 'step',
      key: step.key,
      currency: '',
      cycles_n: reached,
      live_n: report.counts.live,
      approved_n: '',
      state: '', verdict: '', step,
      demand_units: '', baseline_units: '', target_units: '', capacity_units: '',
      gap_units: '', option_capacity_units: '', option_demand_units: '',
      residual_units: '', residual_owned_n: '', contended_lines_n: '', contention_units: '',
      option_cost_cents: '', grade_n: '', bias_units: '', mape_bp: '',
      identity_holds: '', audit_clean: '', blank_reason: '',
    });
  }

  // Per-currency rows: money is never pooled across currencies, so each
  // currency's option cost is its own row and the totals are not added up.
  for (const entry of report.byCurrency) {
    rows.push({
      as_of: report.today,
      row_kind: 'currency',
      key: entry.currency,
      currency: entry.currency,
      cycles_n: entry.cyclesN,
      live_n: entry.cyclesN,
      approved_n: entry.approvedN,
      state: '', verdict: '', step: '',
      demand_units: '', baseline_units: '', target_units: '', capacity_units: '',
      gap_units: '', option_capacity_units: '', option_demand_units: '',
      residual_units: blankOr(entry.residualUnits, 'no cycle in this currency reaches a computable residual'),
      residual_owned_n: '', contended_lines_n: '', contention_units: '',
      option_cost_cents: entry.optionCents,
      grade_n: '', bias_units: '', mape_bp: '',
      identity_holds: '', audit_clean: '',
      blank_reason: reasonFor(entry.residualUnits, 'no cycle in this currency reaches a computable residual'),
    });
  }

  return rows;
}
