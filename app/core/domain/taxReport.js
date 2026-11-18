/**
 * app/core/domain/taxReport.js — the identity-free CSV rows of the Tax
 * Controversy & Appeal-Control Register (ADR-0257, Schema v209, CSV scope
 * #194).
 *
 * NO SECOND COMPOMPUTATION. This module only shapes what `buildTaxControversy`
 * returned into positional rows. A figure printed here is the figure the reader
 * computed, or it is a blank with the reason the reader gave — never a zero
 * standing in for "we did not measure".
 *
 * IDENTITY-FREE BY CONSTRUCTION, AND THIS IS AS SENSITIVE AS THE PROVISION
 * EXPORT. A controversy schedule names the authority, the position and the sum
 * disputed. The export therefore carries counts, currencies and per-currency
 * minor-unit totals only: no notice reference, jurisdiction, position, person,
 * manager, reference or day. A state key is a PUBLISHED vocabulary, so a reader
 * can still see which kind of controversy the organisation carries without
 * attaching one to a notice.
 *
 * THE PRIVACY FLOOR APPLIES TO THE PER-STATE SPLIT. A workspace with one
 * overdue-unfiled notice is one exported row away from naming it. A per-state
 * count below the declared floor is therefore exported BLANK with its reason
 * rather than as a number.
 *
 * MONEY CROSSES ONLY AS PER-CURRENCY TOTALS. Adding across currencies needs a
 * rate this record does not hold, so each currency gets its own row and no
 * mixed total is printed.
 *
 * Two operators exporting the same workspace at the same clock get byte-identical
 * files.
 */

import { TAX_CSV_COLUMNS, TAX_SETTING_KEYS } from './taxRegistry.js';

const orBlank = (value) => (value === null || value === undefined || value === '' ? '' : value);

export function taxCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(TAX_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions[TAX_SETTING_KEYS.privacyFloor] || 3;
  const complete = report.figuresComplete ? 1 : 0;
  const t = report.totals;
  const rows = [];

  /* 1. The summary row. The provenance claim and the floor are printed beside
        the figures they qualify; `complete` is never folded into a count. Money
        is deliberately blank here: it crosses only on the per-currency rows. */
  rows.push({
    ...empty,
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'ALL',
    notices_n: t.notices,
    deadline_undeclared_n: t.deadlineUndeclared,
    overdue_unfiled_n: t.overdueUnfiled,
    filed_late_n: t.filedLate,
    awaiting_filing_n: t.awaitingFiling,
    filed_on_time_n: t.filedOnTime,
    resolved_n: t.resolved,
    filings_n: t.filings,
    evidence_n: t.evidence,
    evidence_empty_n: t.evidenceEmpty,
    aging_unresolved_n: t.agingUnresolved,
    currencies: t.currencies.join(' '),
    holders_n: t.holders,
    lines_n: t.linesN,
    privacy_floor: floor,
    complete,
    blank_reason: [
      report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 300),
    ].filter(Boolean).join(' ').slice(0, 400),
  });

  /* 2. One row per printed controversy state. Below the floor and non-zero,
        the count is withheld with its reason rather than rounded, dropped or
        exported. */
  for (const row of report.stateRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'state',
      key: row.key,
      notices_n: withheld ? '' : row.count,
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} notice(s); the count is withheld rather than printed. `
        : '',
    });
  }

  /* 3. One row per currency: the money bridge. A currency with no resolution
        prints the disputed total and leaves the resolved total and the swing
        blank with the reason. */
  for (const row of report.currencyRows) {
    const noResolution = row.resolvedN === 0;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'currency',
      key: row.currency,
      disputed_total_minor: row.disputedMinor,
      resolved_total_minor: noResolution ? '' : row.resolvedMinor,
      swing_total_minor: noResolution ? '' : row.swingMinor,
      currencies: row.currency,
      privacy_floor: floor,
      complete,
      blank_reason: noResolution
        ? `No notice in ${row.currency} carries a resolution, so the resolved total and the swing are withheld rather than printed as a zero. `
        : '',
    });
  }

  return rows.map((row) => Object.fromEntries(TAX_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
