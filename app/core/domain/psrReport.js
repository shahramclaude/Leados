/**
 * app/core/domain/psrReport.js — identity-free aggregate CSV rows for the
 * Pre-Startup Safety Review & Commissioning Readiness Register (ADR-0258,
 * Schema v210, CSV scope #195).
 *
 * ZERO SECOND COMPUTATION: formats only the exact figures returned by
 * `buildPreStartupSafety`. No review reference, unit identifier, written basis,
 * punch finding, document reference, person id, person name, manager id or act
 * timestamp crosses the export boundary. Non-zero split counts below
 * `psrPrivacyFloor` export blank (`''`) with a printed reason — never `0` and
 * never dropped. `balances` and `complete` export as separate columns so
 * arithmetic partition proof and record integrity are never collapsed.
 */

import { PSR_CSV_COLUMNS, PSR_SETTING_KEYS } from './psrRegistry.js';

const orBlank = (value) => (value === null || value === undefined || value === '' ? '' : value);

export function psrCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(PSR_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions[PSR_SETTING_KEYS.privacyFloor] || 3;
  const balances = report.balances ? 1 : 0;
  const complete = report.figuresComplete ? 1 : 0;
  const t = report.totals;
  const rows = [];

  const floorCell = (n) => (n > 0 && n < floor ? { value: '', withheld: true } : { value: n, withheld: false });

  // 1. Summary row (exact register-level totals across the active scope).
  rows.push({
    ...empty,
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'ALL',
    reviews_n: t.reviews,
    unsafe_breach_n: t.unsafeBreach,
    temporary_expired_n: t.temporaryExpired,
    post_overdue_n: t.postOverdue,
    gate_rejected_n: t.gateRejected,
    blocked_cat_a_n: t.blockedCatA,
    awaiting_verification_n: t.awaitingVerification,
    ready_for_auth_n: t.readyForAuth,
    live_conditions_open_n: t.liveConditionsOpen,
    authorised_waiting_n: t.authorisedWaiting,
    closed_verified_n: t.closedVerified,
    temporary_expiring_n: t.temporaryExpiring,
    cat_a_open_n: t.catAOpen,
    cat_a_closed_n: t.catAClosed,
    cat_b_open_n: t.catBOpen,
    cat_b_overdue_n: t.catBOverdue,
    cat_b_closed_n: t.catBClosed,
    gates_cleared_n: t.gatesCleared,
    gates_rejected_n: t.gatesRejected,
    operators_n: t.operatorsN,
    operators_unbriefed_n: t.operatorsUnbriefedN,
    people_n: t.peopleN,
    lines_n: t.linesN,
    privacy_floor: floor,
    balances,
    complete,
    blank_reason: report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 400),
  });

  // 2. Per-state rows (10 closed-vocabulary states; non-zero counts below floor withheld).
  for (const stateRow of report.stateRows) {
    const cell = floorCell(stateRow.count);
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'state',
      key: stateRow.key,
      reviews_n: cell.value,
      privacy_floor: floor,
      balances,
      complete,
      blank_reason: cell.withheld
        ? `State count is between 1 and ${floor - 1} (below privacy floor ${floor}); withheld blank rather than printed.`
        : '',
    });
  }

  // 3. Per-trigger rows (5 closed-vocabulary trigger kinds; privacy-floored).
  for (const triggerRow of report.triggerRows) {
    const cell = floorCell(triggerRow.count);
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'trigger',
      key: triggerRow.key,
      reviews_n: cell.value,
      privacy_floor: floor,
      balances,
      complete,
      blank_reason: cell.withheld
        ? `Trigger count is between 1 and ${floor - 1} (below privacy floor ${floor}); withheld blank rather than printed.`
        : '',
    });
  }

  // 4. Per-discipline rows (6 closed-vocabulary verification disciplines; privacy-floored per cell).
  for (const d of report.disciplineRows) {
    const req = floorCell(d.reviewsRequiredN);
    const caO = floorCell(d.catAOpenN);
    const caC = floorCell(d.catAClosedN);
    const cbO = floorCell(d.catBOpenN);
    const cbD = floorCell(d.catBOverdueN);
    const cbC = floorCell(d.catBClosedN);
    const gCl = floorCell(d.gatesClearedN);
    const gRj = floorCell(d.gatesRejectedN);
    const anyWithheld = [req, caO, caC, cbO, cbD, cbC, gCl, gRj].some((c) => c.withheld);
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'discipline',
      key: d.key,
      reviews_n: req.value,
      cat_a_open_n: caO.value,
      cat_a_closed_n: caC.value,
      cat_b_open_n: cbO.value,
      cat_b_overdue_n: cbD.value,
      cat_b_closed_n: cbC.value,
      gates_cleared_n: gCl.value,
      gates_rejected_n: gRj.value,
      privacy_floor: floor,
      balances,
      complete,
      blank_reason: anyWithheld
        ? `One or more non-zero discipline counts fall below privacy floor ${floor} and are withheld blank.`
        : '',
    });
  }

  return rows.map((row) => Object.fromEntries(PSR_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
