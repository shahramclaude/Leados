/**
 * app/core/domain/workplaceAdjustmentReport.js — the identity-free CSV rows of
 * the Workplace Adjustment & Functional-Restriction Register (ADR-0241, Schema
 * v195, CSV scope #182).
 *
 * NO SECOND COMPUTATION. This module only shapes what `buildWorkplaceAdjustment`
 * returned into positional-code rows. A figure printed here is the figure the
 * reader computed, or it is a blank with the reason the reader gave — never a
 * zero standing in for "we did not measure".
 *
 * IDENTITY-FREE BY CONSTRUCTION, AND THAT MATTERS MORE HERE THAN ANYWHERE ELSE. A
 * restriction is a claim about a person's body. The export therefore carries
 * counts only: no person id, no person name, no manager id, no functional
 * statement, no instrument reference, no source text and no date. Functional
 * domains and instruments export under their DECLARED KEYS (published
 * vocabularies, not secrets), so a reader can still see which kind of limitation
 * the workforce is carrying without being able to attach one to a human being.
 *
 * Two operators exporting the same workspace at the same clock get byte-
 * identical files.
 */

import { WPA_CSV_COLUMNS } from './workplaceAdjustmentRegistry.js';

const orBlank = (value) => (value === null || value === undefined || value === '' ? '' : value);

export function workplaceAdjustmentCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(WPA_CSV_COLUMNS.map((key) => [key, '']));
  const complete = report.figuresComplete ? 1 : 0;

  const rows = [];

  /* 1. The summary row. The two integrity claims and the median's own floor are
        printed beside the figures they qualify; the completeness claim is never
        folded into the median. */
  rows.push({
    ...empty,
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'ALL',
    restrictions_n: report.totals.live,
    live_n: report.totals.live,
    people_n: report.totals.peopleN,
    adjustments_n: report.totals.liveAdjustments,
    agreed_not_in_place_n: report.totals.agreedNotInPlaceN,
    no_adjustment_n: report.totals.noAdjustmentN,
    declined_n: report.totals.declinedN,
    in_place_n: report.totals.inPlaceN,
    conflict_n: report.totals.conflictN,
    unproven_n: report.totals.unprovenN,
    review_overdue_n: report.totals.reviewOverdueN,
    review_due_n: report.reviewRows.filter((row) => row.warn).length,
    lines_n: report.totals.linesN,
    lines_unacknowledged_n: report.totals.linesMissingN,
    agreed_to_operational_days_median: report.medianAgreedToOperational ? report.medianAgreedToOperational.formatted : '',
    conflict_minutes_total: report.totals.conflictMinutes,
    privacy_floor: report.medianAgreedToOperational?.floor ?? report.conventions.wpaPrivacyFloor,
    complete,
    blank_reason: report.medianAgreedToOperational
      ? (report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 300))
      : `${report.medianReason}${report.figuresComplete ? '' : ` ${report.incompleteReasons.join('; ')}`.slice(0, 300)}`,
  });

  /* 2. One row per functional demand domain present on the record. Domains are a
        PUBLISHED vocabulary, so the key names the kind of limitation without
        naming a single person. */
  for (const row of report.domainRows) {
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'domain',
      key: row.domain,
      restrictions_n: row.rulesN,
      live_n: row.rulesN,
      people_n: row.peopleN,
      in_place_n: row.inPlaceN,
      conflict_n: row.conflictN,
      unproven_n: row.unprovenN,
      review_overdue_n: row.reviewOverdueN,
      complete,
      blank_reason: row.testable ? '' : row.notes,
    });
  }

  /* 3. One row per instrument present on the record. `recommendation` rows are
        exported with their unproven count, because an advisory note that was
        never tested must not read as a clearance. */
  const instrumentCounts = new Map();
  for (const row of report.liveRows) {
    const key = row.restriction.instrument;
    const entry = instrumentCounts.get(key) || { rulesN: 0, people: new Set(), unprovenN: 0 };
    entry.rulesN += 1;
    entry.people.add(row.restriction.personId);
    if (row.test?.testable === false || row.test?.verdict === 'unproven') entry.unprovenN += 1;
    instrumentCounts.set(key, entry);
  }
  for (const key of [...instrumentCounts.keys()].sort()) {
    const entry = instrumentCounts.get(key);
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'instrument',
      key,
      restrictions_n: entry.rulesN,
      live_n: entry.rulesN,
      people_n: entry.people.size,
      unproven_n: entry.unprovenN,
      complete,
      blank_reason: '',
    });
  }

  return rows.map((row) => Object.fromEntries(WPA_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
