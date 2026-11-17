/**
 * app/core/domain/lfgReport.js — the identity-free CSV rows of the Claim, Limitation &
 * Settlement-Authority Register (ADR-0248, Schema v202, CSV scope #189).
 *
 * NO SECOND COMPUTATION. This module only shapes what `buildClaims` returned into
 * positional rows. A figure printed here is the figure the reader computed, or it is a
 * blank with the reason the reader gave — never a zero standing in for "we did not
 * measure".
 *
 * IDENTITY-FREE BY CONSTRUCTION, AND THIS IS THE MOST SENSITIVE EXPORT IN THE ESTATE.
 * A claim register names the party suing the organisation, the forum hearing it, the
 * sum at stake and what has been reserved against it. That is privileged material with
 * a commercial consequence, and an export that carried any of it would be the single
 * worst disclosure the workspace could produce. The export therefore carries counts,
 * day extremes and whole-register minor-unit totals only: no party, claim type, forum,
 * matter reference, person, manager, instrument or individual day. A state key is a
 * PUBLISHED vocabulary, so a reader can still see which kind of exposure the
 * organisation is carrying without being able to attach one to a party.
 *
 * THE PRIVACY FLOOR APPLIES TO THE PER-STATE SPLIT. A workspace with one time-barred
 * matter is one exported row away from naming the party. A per-state count below the
 * declared floor is therefore exported BLANK with its reason rather than as a number.
 *
 * A MIXED-CURRENCY REGISTER EXPORTS NO MONEY TOTAL. The reader returns null for those
 * totals and this module exports the blank beside the reason, because adding across
 * currencies needs a rate the record does not hold.
 *
 * Two operators exporting the same workspace at the same clock get byte-identical files.
 */

import { LFG_CSV_COLUMNS, LFG_SETTING_KEYS } from './lfgRegistry.js';

const orBlank = (value) => (value === null || value === undefined || value === '' ? '' : value);

export function claimCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(LFG_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions[LFG_SETTING_KEYS.privacyFloor] || 3;
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
    matters_n: t.matters,
    open_n: t.open,
    in_time_n: t.inTime,
    approaching_n: t.approaching,
    urgent_n: t.urgent + t.critical,
    critical_n: t.critical,
    time_barred_n: t.timeBarred,
    clock_unprovable_n: t.clockUnprovable,
    resolved_n: t.resolved,
    settled_n: t.settled,
    settled_beyond_authority_n: t.settledBeyondAuthority,
    merged_n: t.merged,
    stays_n: t.stays,
    stays_proved_n: t.staysProved,
    stays_alleged_n: t.staysAlleged,
    days_remaining_min: t.daysRemainingMin,
    days_over_total: t.daysOverTotal,
    claimed_total_minor: t.claimedTotalMinor,
    reserve_total_minor: t.reserveTotalMinor,
    paid_total_minor: t.paidTotalMinor,
    costs_total_minor: t.costsTotalMinor,
    authority_ceiling_minor: t.ceilingTotalMinor,
    beyond_authority_minor: t.beyondAuthorityTotalMinor,
    holders_n: t.holders,
    lines_n: t.linesN,
    privacy_floor: floor,
    complete,
    blank_reason: [
      report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 300),
      t.mixedCurrencyN ? `${t.mixedCurrencyN} matter(s) are declared in another currency, so no cross-currency money total is printed.` : '',
    ].filter(Boolean).join(' ').slice(0, 400),
  });

  /* 2. One row per printed matter state. Below the floor and non-zero, the count is
        withheld with its reason rather than rounded, dropped or exported. */
  for (const row of report.stateRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'state',
      key: row.key,
      matters_n: withheld ? '' : row.count,
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} matter(s); the count is withheld rather than printed. `
        : '',
    });
  }

  /* 3. One row per printed stay state. Same floor, same refusal. */
  for (const row of report.stayStateRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'stay-state',
      key: row.key,
      stays_n: withheld ? '' : row.count,
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This stay state carries fewer than the declared privacy floor of ${floor} suspension(s); the count is withheld rather than printed. `
        : '',
    });
  }

  return rows.map((row) => Object.fromEntries(LFG_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
