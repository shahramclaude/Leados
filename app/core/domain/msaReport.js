/**
 * app/core/domain/msaReport.js — the identity-free CSV rows of the Modern
 * Slavery & Supply-Chain Due-Diligence Statement Register (ADR-0260, Schema
 * v212, CSV scope #196).
 *
 * NO SECOND COMPUTATION. This module only shapes what `buildModernSlavery`
 * returned into positional rows. A figure printed here is the figure the reader
 * computed, or it is a blank with the reason the reader gave — never a zero
 * standing in for "we did not measure".
 *
 * IDENTITY-FREE BY CONSTRUCTION. A due-diligence schedule names suppliers,
 * countries, findings about workers and remediation acts. The export therefore
 * carries counts and published-vocabulary keys only: no statement reference,
 * entity, supplier, country, finding, remediation, reference, person or day.
 * The derived claim key is a PUBLISHED vocabulary, so a reader can see what the
 * evidence supported without attaching it to a statement.
 *
 * THE PRIVACY FLOOR APPLIES TO THE PER-STATE SPLIT. A workspace with one
 * overdue-unpublished statement is one exported row away from naming it. A
 * per-state count below the declared floor is therefore exported BLANK with its
 * reason rather than as a number.
 *
 * Two operators exporting the same workspace at the same clock get byte-identical
 * files.
 */

import { MSA_CSV_COLUMNS, MSA_SETTING_KEYS } from './msaRegistry.js';

const orBlank = (value) => (value === null || value === undefined || value === '' ? '' : value);

export function msaCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(MSA_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions[MSA_SETTING_KEYS.privacyFloor] || 3;
  const complete = report.figuresComplete ? 1 : 0;
  const t = report.totals;
  const rows = [];

  /* 1. The summary row. The provenance claim and the floor are printed beside
        the figures they qualify; `complete` is never folded into a count. */
  rows.push({
    ...empty,
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'ALL',
    statements_n: t.statements,
    deadline_undeclared_n: t.deadlineUndeclared,
    overdue_unpublished_n: t.overdueUnpublished,
    awaiting_publication_n: t.awaitingPublication,
    approved_unpublished_n: t.approvedUnpublished,
    published_with_gaps_n: t.publishedWithGaps,
    published_n: t.published,
    suppliers_n: t.suppliers,
    assessed_n: t.assessed,
    unassessed_n: t.unassessed,
    assessments_n: t.assessments,
    findings_n: t.findings,
    instances_n: t.instances,
    remediations_n: t.remediations,
    remediation_open_n: t.remediationOpen,
    training_n: t.training,
    elements_evidenced_n: report.rows.reduce((sum, row) => sum + row.elementsEvidencedN, 0),
    elements_missing_n: report.rows.reduce((sum, row) => sum + row.elementsMissingN, 0),
    holders_n: t.holders,
    lines_n: t.linesN,
    privacy_floor: floor,
    complete,
    blank_reason: [
      report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 300),
    ].filter(Boolean).join(' ').slice(0, 400),
  });

  /* 2. One row per printed statement state. Below the floor and non-zero,
        the count is withheld with its reason rather than rounded, dropped or
        exported. */
  for (const row of report.stateRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'state',
      key: row.key,
      statements_n: withheld ? '' : row.count,
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} statement(s); the count is withheld rather than printed. `
        : '',
    });
  }

  /* 3. One row per content element: the evidenced/missing split of the six
        statutory areas, and the derived claim vocabulary printed as a key. */
  for (const row of report.elementRows) {
    const missingWithheld = row.missing > 0 && row.missing < floor;
    const evidencedWithheld = row.evidenced > 0 && row.evidenced < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'element',
      key: row.key,
      statements_n: '',
      elements_evidenced_n: evidencedWithheld ? '' : row.evidenced,
      elements_missing_n: missingWithheld ? '' : row.missing,
      privacy_floor: floor,
      complete,
      blank_reason: (missingWithheld || evidencedWithheld)
        ? `A count below the declared privacy floor of ${floor} statement(s) is withheld rather than printed. `
        : '',
    });
  }

  /* 4. One claim row: the derived claim vocabulary over the whole register,
        with the number of statements in each claim bucket. Below the floor,
        withheld like every other per-state count. */
  const claimCounts = new Map();
  for (const row of report.rows) claimCounts.set(row.claim.key, (claimCounts.get(row.claim.key) || 0) + 1);
  for (const [key, count] of [...claimCounts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    const withheld = count > 0 && count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'claim',
      key,
      statements_n: withheld ? '' : count,
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This claim bucket carries fewer than the declared privacy floor of ${floor} statement(s); the count is withheld rather than printed. `
        : '',
    });
  }

  return rows.map((row) => Object.fromEntries(MSA_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
