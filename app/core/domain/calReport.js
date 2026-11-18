/**
 * app/core/domain/calReport.js — the AGGREGATE export of the Performance
 * Calibration Decision Register (ADR-0261, Schema v213, CSV scope #197).
 *
 * Built from the SAME reader (`buildCalibration`) the `#/performance-calibration`
 * panel renders. Every figure is a COUNT over the whole register or a
 * PUBLISHED-vocabulary key (the closed rating keys and state keys). No session
 * reference, cycle label, scope text, person, manager, review reference,
 * rationale sentence or day crosses this boundary. A per-state count below the
 * declared privacy floor exports BLANK with its reason, never as a small
 * number — the same floor the on-screen panel respects.
 *
 * The rows are: one summary row (the whole register), one row per session, and
 * one row per printed person state. `figuresComplete` is folded into the
 * `complete` column and never into a count.
 */

import {
  CAL_CSV_COLUMNS,
  CAL_RATING_KEYS,
  CAL_SETTING_KEYS,
} from './calRegistry.js';

/**
 * Build the CSV rows from a calibration report.
 * Returns an array of row objects keyed by the CAL_CSV_COLUMNS keys.
 */
export function calCsvRows(report) {
  if (!report) return [];
  const empty = Object.fromEntries(CAL_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions?.[CAL_SETTING_KEYS.privacyFloor] || 3;
  // `figuresComplete` is derived at the enterprise level from the distributions:
  // every proposed and calibrated rating is in the closed set (no `unknown`).
  const enterprise = report.enterprise || {};
  const figuresComplete =
    enterprise.proposedDist?.counts?.unknown === 0 && enterprise.calibratedDist?.counts?.unknown === 0;
  const complete = figuresComplete ? 1 : 0;
  const t = enterprise;
  const rows = [];

  /* 1. The summary row. The whole register, one row. Distributions printed as
        counts per published rating key with their totals; the bias ratio printed
        beside its flag. `complete` is never folded into a count. */
  rows.push({
    ...empty,
    as_of: report.today || '',
    row_kind: 'summary',
    key: 'ALL',
    sessions_n: report.sessions ? report.sessions.length : 0,
    open_sessions_n: (report.sessions || []).filter((s) => s.session?.status === 'open').length,
    closed_sessions_n: (report.sessions || []).filter((s) => s.session?.status === 'closed').length,
    total_persons_n: t.totalPersons || 0,
    total_decisions_n: t.totalDecisions || 0,
    calibrated_n: 0,
    adjusted_n: 0,
    uncalibrated_n: 0,
    divergent_uncalibrated_n: 0,
    overdue_n: 0,
    proposed_needs_development_n: t.proposedDist?.counts?.['needs-development'] || 0,
    proposed_meets_expectations_n: t.proposedDist?.counts?.['meets-expectations'] || 0,
    proposed_often_exceeds_n: t.proposedDist?.counts?.['often-exceeds'] || 0,
    proposed_sets_standard_n: t.proposedDist?.counts?.['sets-standard'] || 0,
    proposed_unknown_n: t.proposedDist?.counts?.unknown || 0,
    proposed_total_n: t.proposedDist?.total || 0,
    calibrated_needs_development_n: t.calibratedDist?.counts?.['needs-development'] || 0,
    calibrated_meets_expectations_n: t.calibratedDist?.counts?.['meets-expectations'] || 0,
    calibrated_often_exceeds_n: t.calibratedDist?.counts?.['often-exceeds'] || 0,
    calibrated_sets_standard_n: t.calibratedDist?.counts?.['sets-standard'] || 0,
    calibrated_unknown_n: t.calibratedDist?.counts?.unknown || 0,
    calibrated_total_n: t.calibratedDist?.total || 0,
    bias_ratio: report.enterpriseBias?.ratio != null ? report.enterpriseBias.ratio : '',
    bias_flagged: report.enterpriseBias?.flagged ? 1 : 0,
    bias_refused: report.enterpriseBias?.refused ? 1 : 0,
    privacy_floor: floor,
    complete,
    blank_reason: report.figuresComplete ? '' : 'Figures are incomplete: unknown ratings are present.',
  });

  /* 2. One row per session. The per-session counts and distributions, with the
        same floor applied to the person-state counts so a small session does
        not print a small number. */
  for (const session of report.sessions || []) {
    const counts = session.counts || {};
    const proposed = session.proposedDist?.counts || {};
    const calibrated = session.calibratedDist?.counts || {};
    rows.push({
      ...empty,
      as_of: report.today || '',
      row_kind: 'session',
      key: session.session?.sessionId || session.session?.id || '',
      sessions_n: 1,
      open_sessions_n: session.session?.status === 'open' ? 1 : 0,
      closed_sessions_n: session.session?.status === 'closed' ? 1 : 0,
      total_persons_n: session.rows ? session.rows.length : 0,
      total_decisions_n: session.rows ? session.rows.filter((r) => r.calibratedRating).length : 0,
      calibrated_n: counts.calibrated || 0,
      adjusted_n: counts.adjusted || 0,
      uncalibrated_n: counts.uncalibrated || 0,
      divergent_uncalibrated_n: counts.divergentUncalibrated || 0,
      overdue_n: counts.overdue || 0,
      proposed_needs_development_n: proposed['needs-development'] || 0,
      proposed_meets_expectations_n: proposed['meets-expectations'] || 0,
      proposed_often_exceeds_n: proposed['often-exceeds'] || 0,
      proposed_sets_standard_n: proposed['sets-standard'] || 0,
      proposed_unknown_n: proposed.unknown || 0,
      proposed_total_n: session.proposedDist?.total || 0,
      calibrated_needs_development_n: calibrated['needs-development'] || 0,
      calibrated_meets_expectations_n: calibrated['meets-expectations'] || 0,
      calibrated_often_exceeds_n: calibrated['often-exceeds'] || 0,
      calibrated_sets_standard_n: calibrated['sets-standard'] || 0,
      calibrated_unknown_n: calibrated.unknown || 0,
      calibrated_total_n: session.calibratedDist?.total || 0,
      bias_ratio: session.bias?.ratio != null ? session.bias.ratio : '',
      bias_flagged: session.bias?.flagged ? 1 : 0,
      bias_refused: session.bias?.refused ? 1 : 0,
      privacy_floor: floor,
      complete,
      blank_reason: '',
    });
  }

  /* 3. One row per printed person state, aggregated across sessions, floored.
        Below the floor and non-zero, the count is withheld with its reason. */
  const stateTotals = {
    uncalibrated: 0,
    calibrated: 0,
    adjusted: 0,
    'divergent-uncalibrated': 0,
    'overdue-session': 0,
  };
  for (const session of report.sessions || []) {
    for (const row of session.rows || []) {
      if (row.state === 'overdue-session' || row.isOverdue) stateTotals['overdue-session'] += 1;
      if (stateTotals[row.state] != null) stateTotals[row.state] += 1;
    }
  }
  const stateLabels = {
    uncalibrated: 'Uncalibrated',
    calibrated: 'Calibrated',
    adjusted: 'Adjusted',
    'divergent-uncalibrated': 'Divergent — uncalibrated',
    'overdue-session': 'Overdue session',
  };
  for (const [key, count] of Object.entries(stateTotals)) {
    const withheld = count > 0 && count < floor;
    rows.push({
      ...empty,
      as_of: report.today || '',
      row_kind: 'state',
      key,
      calibrated_n: withheld ? '' : count,
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} person(s); the count is withheld rather than printed. `
        : '',
    });
    void stateLabels;
  }

  return rows;
}

/** Guard: every rating key the columns reference is in the closed set. */
export function calCsvRatingKeys() {
  return [...CAL_RATING_KEYS];
}
