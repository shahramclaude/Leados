/**
 * app/core/domain/permitToWorkReport.js — the identity-free CSV rows of the
 * Permit-to-Work, Energy-Isolation & Simultaneous-Operations Register
 * (ADR-0246, Schema v200, CSV scope #187).
 *
 * NO SECOND COMPUTATION. This module only shapes what `buildPermitToWork`
 * returned into positional rows. A figure printed here is the figure the reader
 * computed, or it is a blank with the reason the reader gave — never a zero
 * standing in for "we did not measure".
 *
 * IDENTITY-FREE BY CONSTRUCTION. A permit record says which named crew is inside
 * which space, on which plant, under which isolation, at a given minute — and a
 * confined-space entry is the most personally dangerous record this workspace can
 * hold. The export therefore carries counts and exact minute totals only: no
 * person, no area, no work reference, no isolation point, no lock reference, no
 * instrument, no reading and no instant.
 *
 * BUT THE CONFLICTS ARE NAMED, NOT HIDDEN. A simultaneous-operations conflict is
 * the one thing an export in this category must not smooth over, so one row is
 * emitted per printed conflict KIND with its count and severity. A reader can see
 * that six weeks ago two hot-work permits were live in one area without being able
 * to attach that fact to a crew — which is exactly the disclosure a safety export
 * should carry.
 *
 * THE PRIVACY FLOOR APPLIES TO THE PER-STATE AND PER-CONFLICT SPLIT. A workspace
 * with one lapsed permit and one dispatcher who knows who is in the tank room is
 * one exported row away from naming a crew. A count below the declared floor is
 * therefore exported BLANK with its reason rather than as a number. The summary
 * totals are aggregate counts over the whole register and are exported; the floor
 * and its consequence are printed beside them so nobody reads the split as
 * complete.
 *
 * Two operators exporting the same workspace at the same clock get byte-identical
 * files.
 */

import { PTW_CSV_COLUMNS, PTW_SETTING_KEYS } from './permitToWorkRegistry.js';

const orBlank = (value) => (value === null || value === undefined || value === '' ? '' : value);

export function permitToWorkCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(PTW_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions[PTW_SETTING_KEYS.privacyFloor] || 3;
  const complete = report.figuresComplete ? 1 : 0;
  const totals = report.totals;

  const rows = [];

  /* 1. The summary row. The provenance claim and the floor are printed beside the
        figures they qualify; `complete` is never folded into a count. */
  rows.push({
    ...empty,
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'ALL',
    permits_n: totals.permits,
    open_n: totals.open,
    closed_n: totals.closed,
    people_n: totals.people,
    work_kinds_n: totals.workKindsN,
    isolations_n: totals.isolations,
    isolations_unverified_n: totals.isolationsUnverifiedN,
    isolations_overdue_n: totals.isolationsOverdueN,
    isolations_unconfirmed_removal_n: totals.isolationsUnconfirmedRemovalN,
    atmosphere_tests_n: totals.atmosphereTests,
    live_n: totals.liveN,
    live_unverified_n: totals.liveUnverifiedN,
    live_atmosphere_n: totals.liveAtmosphereN,
    live_atmosphere_stale_n: totals.liveAtmosphereStaleN,
    suspended_n: totals.suspendedN,
    not_yet_valid_n: totals.notYetValidN,
    expired_open_n: totals.expiredOpenN,
    expired_minutes_total: totals.expiredMinutes,
    closed_complete_n: totals.closedCompleteN,
    closed_isolation_owed_n: totals.closedIsolationOwedN,
    conflicts_n: totals.conflicts,
    conflicts_live_n: totals.conflictsLive,
    conflict_kinds_n: totals.conflictKindsN,
    handovers_n: totals.handovers,
    entries_n: totals.entries,
    privacy_floor: floor,
    complete,
    blank_reason: report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 300),
  });

  /* 2. One row per printed permit state. Below the floor and non-zero, the count is
        withheld with its reason rather than rounded, dropped or exported. */
  for (const row of report.stateRows) {
    const withheld = row.count > 0 && row.count < floor;
    const closed = row.key.startsWith('closed-');
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'state',
      key: row.key,
      permits_n: withheld ? '' : row.count,
      open_n: withheld ? '' : (closed ? 0 : row.count),
      closed_n: withheld ? '' : (closed ? row.count : 0),
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} permit(s); the count is withheld rather than printed. `
        : '',
    });
  }

  /* 3. One row per printed conflict kind. The KIND is published vocabulary and is
        exported; the permits, area, crew and arithmetic that prove it are not. */
  for (const row of report.conflictKindRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'conflict',
      key: row.key,
      conflicts_n: withheld ? '' : row.count,
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This conflict kind carries fewer than the declared privacy floor of ${floor} instance(s); the count is withheld rather than printed. `
        : '',
    });
  }

  return rows.map((row) => Object.fromEntries(PTW_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
