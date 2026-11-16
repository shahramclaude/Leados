/**
 * app/core/domain/domainSenseReport.js — CSV export and attention count for the
 * Decision-Domain Sensing Register (ADR-0228, Schema v186).
 *
 * Built from the SAME reader the `#/domain-sense` panel renders: `buildDomainSense`.
 * Every figure below is an exact integer count over the whole register; no
 * decision title, id, owner, panel member, line name, rationale or evidence
 * text crosses this boundary.
 */

import { buildDomainSense } from './domainSense.js';
import { DSN_CSV_COLUMNS, DSN_LIMITS as L } from './domainSenseRegistry.js';

/** The register read, seat-narrowed for attention badges only. */
export function domainSenseReport(state, { now } = {}) {
  return buildDomainSense(state, { now });
}

/** Decisions this seat owes an act on: an unmade assessment (panel member, on
 *  their line, not yet read, never the owner) or an uncommitted ownership. */
export function domainSenseAttentionCount(state, { now, settings, seat } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const personId = seat && !seat.fullAccess ? (seat.nodeId || seat.id || null) : null;
  if (!personId) return 0;
  const report = buildDomainSense(state, { now: at });
  let owed = 0;
  for (const row of report.rows) {
    let owes = false;
    if (row.ownerId === personId && !row.commit) owes = true;
    if (!owes) {
      for (const seatRow of row.panel) {
        if (seatRow.memberId === personId && seatRow.memberId !== row.ownerId && !row.readings.some((r) => r.assessorId === personId)) {
          owes = true;
          break;
        }
      }
    }
    if (owes) owed += 1;
  }
  return owed;
}

const FLOOR = Number.isFinite(L.privacyFloor) ? L.privacyFloor : 3;

function cell(count, keyHint) {
  if (count === 0) return { value: 0, blank: false };
  if (count < FLOOR) return { value: null, blank: true, reason: `below the privacy floor of ${FLOOR}: ${keyHint}` };
  return { value: count, blank: false };
}

/** Anonymous aggregate rows: summary, per state, per fit, per agreed domain. */
export function domainSenseCsvRows(report) {
  const asOf = report.asOf;
  const rows = [];

  rows.push({
    row_kind: 'summary', key: '', state: '', domain: '', fit: '',
    decisions: report.counts.decisions,
    readings: report.counts.readings,
    commitments: report.counts.commitments,
    overdue: Object.values(report.counts.states || {}).length ? report.rows.reduce((sum, row) => sum + (row.flags.includes('sense-overdue') ? 1 : 0) + (row.flags.includes('reading-stale') ? 1 : 0), 0) : 0,
    stale: '',
    blank_reason: '',
  });

  for (const state of Object.keys(report.counts.states || {}).sort()) {
    const c = cell(report.counts.states[state], state);
    rows.push({ row_kind: 'state', key: state, state, domain: '', fit: '', decisions: c.value, readings: '', commitments: '', overdue: '', stale: '', blank_reason: c.blank ? c.reason : '' });
  }

  for (const fit of Object.keys(report.counts.fit || {}).sort()) {
    const c = cell(report.counts.fit[fit], fit);
    rows.push({ row_kind: 'fit', key: fit, state: '', domain: '', fit, decisions: c.value, readings: '', commitments: '', overdue: '', stale: '', blank_reason: c.blank ? c.reason : '' });
  }

  for (const domain of Object.keys(report.counts.agreedDomains || {}).sort()) {
    const c = cell(report.counts.agreedDomains[domain], domain);
    rows.push({ row_kind: 'domain', key: domain, state: '', domain, fit: '', decisions: c.value, readings: '', commitments: '', overdue: '', stale: '', blank_reason: c.blank ? c.reason : '' });
  }

  const refusedTotal = Object.values(report.refusalCounts || {}).reduce((sum, n) => sum + n, 0);
  rows.push({ row_kind: 'refusals', key: '', state: '', domain: '', fit: '', decisions: refusedTotal, readings: '', commitments: '', overdue: '', stale: '', blank_reason: '' });

  const header = [...DSN_CSV_COLUMNS];

  return [header, ...rows.map((row) => header.map((key) => row[key] === undefined ? '' : row[key]))];
}