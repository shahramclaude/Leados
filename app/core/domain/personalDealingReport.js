/**
 * app/core/domain/personalDealingReport.js — the identity-free CSV rows of the
 * Personal-Account Dealing & Insider-List Register (ADR-0245, Schema v199,
 * CSV #186).
 *
 * NO SECOND COMPUTATION. This module only shapes what `buildPersonalDealing`
 * returned into positional rows. A figure printed here is the figure the reader
 * computed, or it is a blank with the reason the reader gave — never a zero
 * standing in for "we did not measure".
 *
 * IDENTITY-FREE BY CONSTRUCTION, AND MORE STRICTLY SO THAN ANY OTHER REGISTER
 * HERE. A personal-dealing record is a named human being's own trades: the
 * securities they hold, the quantities, the days and the broker's contract note.
 * The export therefore carries COUNTS AND PUBLISHED STATE KEYS ONLY: no person, no
 * designation basis attached to a person, no security reference, no broker
 * reference, no quantity and no day. A state key is a PUBLISHED vocabulary, so a
 * reader can still see which kind of failure the workspace is carrying without
 * being able to attach one to a person or to a trade.
 *
 * THE PRIVACY FLOOR APPLIES TO THE PER-STATE SPLIT. A workspace with one breach
 * and one dealing knows exactly whose trade the count refers to. A per-state count
 * below the declared floor is therefore exported BLANK with its reason rather than
 * as a number. The summary totals are aggregate counts over the whole register and
 * are exported; the floor and its consequence are printed beside them so nobody
 * reads the split as complete.
 *
 * Two operators exporting the same workspace at the same clock get
 * byte-identical files.
 */

import {
  DWL_CLEARANCE_STATE_BY_KEY,
  DWL_CLEARANCE_STATE_KEYS,
  DWL_CSV_COLUMNS,
  DWL_SETTING_KEYS,
  DWL_STATE_BY_KEY,
  DWL_STATE_KEYS,
} from './personalDealingRegistry.js';

// A CSV row carries TEXT: counts are printed as their digits, and a value that
// was not measured stays blank with the reason beside it — never a number
// standing in for an absence, and never a zero standing in for "not measured".
const orBlank = (value) => (value === null || value === undefined || value === ''
  ? ''
  : (typeof value === 'number' ? String(value) : value));

export function personalDealingCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(DWL_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions[DWL_SETTING_KEYS.privacyFloor] || 3;
  const complete = report.figuresComplete ? 1 : 0;
  const reason = report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 300);

  const rows = [];

  /* 1. The summary row. The provenance claim and the floor are printed beside
        the figures they qualify; `complete` is never folded into a count. */
  rows.push({
    ...empty,
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'ALL',
    designations_n: report.totals.designations,
    live_designations_n: report.totals.liveDesignations,
    ended_designations_n: report.totals.endedDesignations,
    events_n: report.totals.events,
    open_window_events_n: report.totals.openWindowsN,
    clearances_n: report.totals.clearances,
    pending_n: report.totals.pendingN,
    pending_overdue_n: report.totals.pendingOverdueN,
    cleared_n: report.totals.clearedN,
    refused_n: report.totals.refusedN,
    lapsed_n: report.totals.lapsedN,
    dealings_n: report.totals.dealings,
    dealt_with_clearance_n: report.totals.dealtWithClearanceN,
    dealt_without_clearance_n: report.totals.dealtWithoutClearanceN,
    dealt_in_closed_window_n: report.totals.dealtInClosedWindowN,
    dealt_after_refusal_n: report.totals.dealtAfterRefusalN,
    dealt_outside_clearance_n: report.totals.dealtOutsideClearanceN,
    dealt_undeterminable_n: report.totals.dealtUndeterminableN,
    breaches_n: report.totals.breachesN,
    privacy_floor: floor,
    complete,
    blank_reason: reason,
  });

  /* 2. One row per printed dealing state. Below the floor and non-zero, the count
        is withheld with its reason rather than rounded, dropped or exported. */
  for (const row of report.stateRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'dealing_state',
      key: row.key,
      dealings_n: withheld ? '' : row.count,
      dealt_with_clearance_n: withheld ? '' : (row.key === 'dealt-with-clearance' ? row.count : 0),
      dealt_without_clearance_n: withheld ? '' : (row.key === 'dealt-without-clearance' ? row.count : 0),
      dealt_in_closed_window_n: withheld ? '' : (row.key === 'breach-dealt-in-closed-window' ? row.count : 0),
      dealt_after_refusal_n: withheld ? '' : (row.key === 'breach-dealt-after-refusal' ? row.count : 0),
      dealt_outside_clearance_n: withheld ? '' : (row.key === 'breach-dealt-outside-clearance' ? row.count : 0),
      dealt_undeterminable_n: withheld ? '' : (row.key === 'dealt-window-undeterminable' ? row.count : 0),
      breaches_n: withheld ? '' : (row.key.startsWith('breach-') ? row.count : 0),
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} dealing(s); the count is withheld rather than printed. `
        : '',
    });
  }

  /* 3. One row per printed clearance state. Same floor, same discipline. */
  for (const row of report.clearanceStateRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'clearance_state',
      key: row.key,
      pending_n: withheld ? '' : (row.key === 'pending' ? row.count : 0),
      pending_overdue_n: withheld ? '' : (row.key === 'pending-overdue' ? row.count : 0),
      cleared_n: withheld ? '' : (['cleared-not-dealt', 'cleared-and-dealt', 'cleared-lapsed'].includes(row.key) ? row.count : 0),
      refused_n: withheld ? '' : (['refused-not-dealt', 'refused-and-dealt'].includes(row.key) ? row.count : 0),
      lapsed_n: withheld ? '' : (row.key === 'cleared-lapsed' ? row.count : 0),
      breaches_n: withheld ? '' : (row.key.startsWith('breach-') ? row.count : 0),
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} clearance(s); the count is withheld rather than printed. `
        : '',
    });
  }

  // A key the reader printed but the vocabulary does not list is a vocabulary
  // drift, not a zero: it is reported in its own row with its reason.
  for (const key of DWL_STATE_KEYS) {
    if (!DWL_STATE_BY_KEY[key]) {
      rows.push({ ...empty, as_of: report.asOf, row_kind: 'dealing_state', key, privacy_floor: floor, complete, blank_reason: 'An unrecognised dealing state was printed by the reader and is reported here rather than as a zero.' });
    }
  }
  for (const key of DWL_CLEARANCE_STATE_KEYS) {
    if (!DWL_CLEARANCE_STATE_BY_KEY[key]) {
      rows.push({ ...empty, as_of: report.asOf, row_kind: 'clearance_state', key, privacy_floor: floor, complete, blank_reason: 'An unrecognised clearance state was printed by the reader and is reported here rather than as a zero.' });
    }
  }

  return rows.map((row) => Object.fromEntries(DWL_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
