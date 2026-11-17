/**
 * app/core/domain/insReport.js — the identity-free CSV rows of the Insurance
 * Notification & Recovery Register (ADR-0249, Schema v203, CSV scope #190).
 *
 * NO SECOND COMPUTATION. This module only shapes what `buildInsurance` returned
 * into positional rows. A figure printed here is the figure the reader computed,
 * or it is a blank with the reason the reader gave — never a zero standing in for
 * "we did not measure".
 *
 * IDENTITY-FREE BY CONSTRUCTION, AND THIS IS AS SENSITIVE AS THE CLAIM EXPORT.
 * An insurance register names the insurer, the policy reference, the matter it
 * covers and the sum recovered. That is commercially sensitive material, and an
 * export that carried any of it would be a disclosure the workspace cannot take
 * back. The export therefore carries counts, day extremes and whole-register
 * minor-unit totals only: no insurer, policy reference, matter reference,
 * person, manager, day or individual amount. A state key is a PUBLISHED
 * vocabulary, so a reader can still see which kind of exposure the organisation
 * is carrying without being able to attach one to a policy.
 *
 * THE PRIVACY FLOOR APPLIES TO THE PER-STATE SPLIT. A workspace with one
 * notification-late coverage is one exported row away from naming the policy. A
 * per-state count below the declared floor is therefore exported BLANK with its
 * reason rather than as a number.
 *
 * A MIXED-CURRENCY REGISTER EXPORTS NO MONEY TOTAL. The reader returns null for
 * those totals and this module exports the blank beside the reason, because
 * adding across currencies needs a rate the record does not hold.
 *
 * Two operators exporting the same workspace at the same clock get byte-identical
 * files.
 */

import { INS_CSV_COLUMNS, INS_SETTING_KEYS } from './insRegistry.js';

const orBlank = (value) => (value === null || value === undefined || value === '' ? '' : value);

export function insuranceCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(INS_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions[INS_SETTING_KEYS.privacyFloor] || 3;
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
    coverages_n: t.coverages,
    open_n: t.open,
    unnotified_n: t.unnotified,
    notification_urgent_n: t.notificationUrgent,
    notification_late_n: t.notificationLate,
    notification_unprovable_n: t.notificationUnprovable,
    no_cover_n: t.noCover,
    notified_in_time_n: t.notifiedInTime,
    recovery_pending_n: t.recoveryPending,
    recovery_denied_n: t.recoveryDenied,
    recovered_n: t.recovered,
    partially_recovered_n: t.partiallyRecovered,
    notifications_n: t.notifications,
    notifications_late_n: t.notificationsLate,
    days_remaining_min: t.daysRemainingMin,
    days_over_total: t.daysOverTotal,
    gross_total_minor: t.grossTotalMinor,
    recovered_total_minor: t.recoveredTotalMinor,
    denied_total_minor: t.deniedTotalMinor,
    net_total_minor: t.netTotalMinor,
    claimed_total_minor: t.claimedTotalMinor,
    holders_n: t.holders,
    lines_n: t.linesN,
    privacy_floor: floor,
    complete,
    blank_reason: [
      report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 300),
      t.mixedCurrencyN ? `${t.mixedCurrencyN} coverage(s) are declared in another currency, so no cross-currency money total is printed.` : '',
    ].filter(Boolean).join(' ').slice(0, 400),
  });

  /* 2. One row per printed coverage state. Below the floor and non-zero, the
        count is withheld with its reason rather than rounded, dropped or
        exported. */
  for (const row of report.stateRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'state',
      key: row.key,
      coverages_n: withheld ? '' : row.count,
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} coverage(s); the count is withheld rather than printed. `
        : '',
    });
  }

  return rows.map((row) => Object.fromEntries(INS_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
