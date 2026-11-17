/**
 * app/core/domain/loneWorkingReport.js — the identity-free CSV rows of the
 * Lone-Working Welfare Check Register (ADR-0242, Schema v196, CSV scope #183).
 *
 * NO SECOND COMPUTATION. This module only shapes what `buildLoneWorking`
 * returned into positional rows. A figure printed here is the figure the reader
 * computed, or it is a blank with the reason the reader gave — never a zero
 * standing in for "we did not measure".
 *
 * IDENTITY-FREE BY CONSTRUCTION, AND THAT MATTERS MORE HERE THAN ANYWHERE ELSE. A
 * deployment record says where a named human being was, alone, at a given minute.
 * The export therefore carries counts and exact minute totals only: no person id,
 * no name, no manager, no site reference, no task, no protocol reference and no
 * instant. A state key is a PUBLISHED vocabulary, so a reader can still see which
 * kind of failure the workspace is carrying without being able to attach one to a
 * human being.
 *
 * THE PRIVACY FLOOR APPLIES TO THE PER-STATE SPLIT. A workspace with one
 * unconfirmed deployment and one dispatcher who knows who is out tonight is one
 * exported row away from naming a person. A per-state count below the declared
 * floor is therefore exported BLANK with its reason rather than as a number. The
 * summary totals are aggregate counts over the whole register and are exported;
 * the floor and its consequence are printed beside them so nobody reads the split
 * as complete.
 *
 * Two operators exporting the same workspace at the same clock get byte-identical
 * files.
 */

import { LWK_CSV_COLUMNS, LWK_SETTING_KEYS } from './loneWorkingRegistry.js';

const orBlank = (value) => (value === null || value === undefined || value === '' ? '' : value);

export function loneWorkingCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(LWK_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions[LWK_SETTING_KEYS.privacyFloor] || 3;
  const complete = report.figuresComplete ? 1 : 0;

  const rows = [];

  /* 1. The summary row. The provenance claim and the floor are printed beside the
        figures they qualify; `complete` is never folded into a count. */
  rows.push({
    ...empty,
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'ALL',
    deployments_n: report.totals.deployments,
    open_n: report.totals.open,
    closed_n: report.totals.closed,
    people_n: report.totals.people,
    checkins_n: report.totals.checkins,
    escalations_n: report.totals.escalations,
    due_n: report.totals.checkDueN,
    unconfirmed_n: report.totals.unconfirmedN,
    unconfirmed_minutes_total: report.totals.unconfirmedMinutes,
    escalation_open_n: report.totals.escalationOpenN,
    overran_n: report.totals.overranN,
    overrun_minutes_total: report.totals.overrunMinutes,
    concern_n: report.totals.concernN,
    confirmed_late_n: report.totals.confirmedLateN,
    closed_without_contact_n: report.totals.closedWithoutContactN,
    lines_n: report.totals.linesN,
    privacy_floor: floor,
    complete,
    blank_reason: report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 300),
  });

  /* 2. One row per printed state. Below the floor and non-zero, the count is
        withheld with its reason rather than rounded, dropped or exported. */
  for (const row of report.stateRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'state',
      key: row.key,
      deployments_n: withheld ? '' : row.count,
      open_n: withheld ? '' : (row.key.startsWith('closed-') ? 0 : row.count),
      closed_n: withheld ? '' : (row.key.startsWith('closed-') ? row.count : 0),
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} deployment(s); the count is withheld rather than printed. `
        : '',
    });
  }

  return rows.map((row) => Object.fromEntries(LWK_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
