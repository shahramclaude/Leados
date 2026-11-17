/**
 * app/core/domain/authorisationReport.js — the identity-free CSV rows of the
 * Statutory Authorisation & Licence-to-Operate Register (ADR-0247, Schema v201,
 * CSV scope #188).
 *
 * NO SECOND COMPUTATION. This module only shapes what `buildAuthorisations`
 * returned into positional rows. A figure printed here is the figure the reader
 * computed, or it is a blank with the reason the reader gave — never a zero
 * standing in for “we did not measure”.
 *
 * IDENTITY-FREE BY CONSTRUCTION, AND THAT MATTERS MORE HERE THAN IT LOOKS. Which
 * site has lost which consent, and which activity a regulator has prohibited, is
 * among the most commercially and legally sensitive facts a leadership workspace
 * holds. The export therefore carries counts and exact minute totals only: no site
 * reference, no activity, no issuing body, no instrument reference or number, no
 * notice reference, no person, no manager and no instant. A state key is a
 * PUBLISHED vocabulary, so a reader can still see which kind of failure the
 * organisation is carrying without being able to attach one to a site.
 *
 * THE PRIVACY FLOOR APPLIES TO THE PER-STATE SPLIT. A workspace with one lapsed
 * consent is one exported row away from naming the site. A per-state count below
 * the declared floor is therefore exported BLANK with its reason rather than as a
 * number. The summary totals are aggregate counts over the whole register and are
 * exported; the floor and its consequence are printed beside them so nobody reads
 * the split as complete.
 *
 * Two operators exporting the same workspace at the same clock get byte-identical
 * files.
 */

import { LTO_CSV_COLUMNS, LTO_SETTING_KEYS } from './authorisationRegistry.js';

const orBlank = (value) => (value === null || value === undefined || value === '' ? '' : value);

export function authorisationCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(LTO_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions[LTO_SETTING_KEYS.privacyFloor] || 3;
  const complete = report.figuresComplete ? 1 : 0;
  const t = report.totals;

  const rows = [];

  /* 1. The summary row. The provenance claim and the floor are printed beside the
        figures they qualify; `complete` is never folded into a count. */
  rows.push({
    ...empty,
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'ALL',
    authorisations_n: t.authorisations,
    in_force_n: t.inForce,
    expiring_n: t.expiring,
    lapsed_n: t.lapsed + t.lapsedAwaiting,
    suspended_n: t.suspended,
    revoked_n: t.revoked,
    prohibited_n: t.prohibited,
    not_yet_granted_n: t.notYetGranted,
    renewal_in_flight_n: t.renewalInFlight,
    conditions_n: t.conditions,
    conditions_unevidenced_n: t.conditionsUnevidenced,
    conditions_stale_n: t.conditionsStale,
    actions_n: t.actions,
    improvement_open_n: t.improvementOpen,
    improvement_overdue_n: t.improvementOverdue,
    renewal_refused_n: t.renewalRefused,
    holders_n: t.holders,
    lines_n: t.linesN,
    lapsed_minutes_total: t.lapsedMinutesTotal,
    privacy_floor: floor,
    complete,
    blank_reason: report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 300),
  });

  /* 2. One row per printed authority state. Below the floor and non-zero, the
        count is withheld with its reason rather than rounded, dropped or exported. */
  for (const row of report.stateRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'state',
      key: row.key,
      authorisations_n: withheld ? '' : row.count,
      in_force_n: row.key === 'in-force' && !withheld ? row.count : (row.key === 'in-force' ? '' : 0),
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} authorit(ies); the count is withheld rather than printed. `
        : '',
    });
  }

  /* 3. One row per printed condition state. Same floor, same refusal. */
  for (const row of report.conditionStateRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'condition-state',
      key: row.key,
      conditions_n: withheld ? '' : row.count,
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This condition state carries fewer than the declared privacy floor of ${floor} condition(s); the count is withheld rather than printed. `
        : '',
    });
  }

  return rows.map((row) => Object.fromEntries(LTO_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
