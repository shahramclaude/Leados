/**
 * app/core/domain/prvReport.js — the identity-free CSV rows of the Provision &
 * Reimbursement Register (ADR-0250, Schema v204, CSV scope #191).
 *
 * NO SECOND COMPOMPUTATION. This module only shapes what `buildProvisions`
 * returned into positional rows. A figure printed here is the figure the reader
 * computed, or it is a blank with the reason the reader gave — never a zero
 * standing in for "we did not measure".
 *
 * IDENTITY-FREE BY CONSTRUCTION, AND THIS IS AS SENSITIVE AS THE CLAIM AND
 * INSURANCE EXPORTS. A provision schedule names the matter, the party and the sum
 * provided. The export therefore carries counts, currencies and per-currency
 * minor-unit totals only: no matter reference, party, person, manager, instrument
 * or day. A state key is a PUBLISHED vocabulary, so a reader can still see which
 * kind of obligation the organisation carries without attaching one to a matter.
 *
 * THE PRIVACY FLOOR APPLIES TO THE PER-STATE SPLIT. A workspace with one
 * unassessed matter is one exported row away from naming it. A per-state count
 * below the declared floor is therefore exported BLANK with its reason rather than
 * as a number.
 *
 * MONEY CROSSES ONLY AS PER-CURRENCY TOTALS. Adding across currencies needs a rate
 * this record does not hold, so each currency gets its own row and no mixed total
 * is printed.
 *
 * Two operators exporting the same workspace at the same clock get byte-identical
 * files.
 */

import { PROV_CSV_COLUMNS, PROV_SETTING_KEYS } from './prvRegistry.js';

const orBlank = (value) => (value === null || value === undefined || value === '' ? '' : value);

export function provisionCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(PROV_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions[PROV_SETTING_KEYS.privacyFloor] || 3;
  const complete = report.figuresComplete ? 1 : 0;
  const t = report.totals;
  const rows = [];

  /* 1. The summary row. The provenance claim and the floor are printed beside the
        figures they qualify; `complete` is never folded into a count. Money is
        deliberately blank here: it crosses only on the per-currency rows. */
  rows.push({
    ...empty,
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'ALL',
    assessments_n: t.assessments,
    provided_n: t.provided,
    provided_with_asset_n: t.providedWithAsset,
    provided_asset_capped_n: t.providedAssetCapped,
    disclosed_only_n: t.disclosedOnly,
    remote_n: t.remote,
    unassessed_n: t.unassessed,
    scenarios_n: t.scenarios,
    reimbursements_n: t.reimbursements,
    asset_recognized_n: t.assetRecognized,
    asset_capped_n: t.assetCapped,
    asset_without_cash_n: t.assetWithoutCash,
    currencies: t.currencies.join(' '),
    holders_n: t.holders,
    lines_n: t.linesN,
    privacy_floor: floor,
    complete,
    blank_reason: [
      report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 300),
    ].filter(Boolean).join(' ').slice(0, 400),
  });

  /* 2. One row per printed provision state. Below the floor and non-zero, the
        count is withheld with its reason rather than rounded, dropped or
        exported. */
  for (const row of report.stateRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'state',
      key: row.key,
      assessments_n: withheld ? '' : row.count,
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} matter(s); the count is withheld rather than printed. `
        : '',
    });
  }

  /* 3. One row per currency: the money bridge and the reconciliation. A currency
        with no declared carrying prints the computed figures and leaves the
        carrying and gap blank with the reason. */
  for (const row of report.currencyRows) {
    const noCarrying = row.carriedMinor === null;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'currency',
      key: row.currency,
      provision_total_minor: row.provisionMinor,
      asset_total_minor: row.assetMinor,
      net_exposure_minor: row.netExposureMinor,
      carried_total_minor: noCarrying ? '' : row.carriedMinor,
      gap_minor: row.gapMinor === null ? '' : row.gapMinor,
      currencies: row.currency,
      privacy_floor: floor,
      complete,
      blank_reason: noCarrying
        ? `No finance carrying is declared for ${row.currency}, so the carrying and the reconciliation gap are withheld rather than printed as a zero. `
        : (row.reconciled ? '' : `The declared carrying differs from the computed provision by ${row.gapMinor} minor unit(s). `),
    });
  }

  return rows.map((row) => Object.fromEntries(PROV_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
