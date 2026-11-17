/**
 * app/core/domain/mutualAidReport.js — the identity-free CSV rows of the
 * Mutual-Aid Activation & Resource-Commitment Register (ADR-0244, Schema v198,
 * CSV #185).
 *
 * NO SECOND COMPUTATION. This module only shapes what `buildMutualAid` returned
 * into positional rows. A figure printed here is the figure the reader
 * computed, or it is a blank with the reason the reader gave — never a zero
 * standing in for "we did not measure".
 *
 * IDENTITY-FREE BY CONSTRUCTION, AND THAT MATTERS HERE. A mutual-aid record
 * names partner organisations, external hands, bilateral agreement references,
 * request subjects and written confirmations. The export therefore carries
 * counts and state keys only: no partner, no agreement reference, no subject,
 * no confirmation, no external hand, no resource line and no day. A state key
 * is a PUBLISHED vocabulary, so a reader can still see which kind of failure
 * the workspace is carrying without being able to attach one to an outside
 * organisation or to a person.
 *
 * THE PRIVACY FLOOR APPLIES TO THE PER-STATE SPLIT. A workspace with one
 * lapsed request and one partner knows exactly which request the count refers
 * to. A per-state count below the declared floor is therefore exported BLANK
 * with its reason rather than as a number. The summary totals are aggregate
 * counts over the whole register and are exported; the floor and its
 * consequence are printed beside them so nobody reads the split as complete.
 *
 * Two operators exporting the same workspace at the same clock get
 * byte-identical files.
 */

import { MAA_CSV_COLUMNS, MAA_SETTING_KEYS, MAA_STATE_BY_KEY, MAA_STATE_KEYS } from './mutualAidRegistry.js';

// A CSV row carries TEXT: counts are printed as their digits, and a value that
// was not measured stays blank with the reason beside it — never a number
// standing in for an absence, and never a zero standing in for "not measured".
const orBlank = (value) => (value === null || value === undefined || value === ''
  ? ''
  : (typeof value === 'number' ? String(value) : value));

export function mutualAidCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(MAA_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions[MAA_SETTING_KEYS.privacyFloor] || 3;
  const complete = report.figuresComplete ? 1 : 0;
  const reason = report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 300);

  const rows = [];

  /* 1. The summary row. The provenance claim and the floor are printed beside
        the figures they qualify; `complete` is never folded into a count. */
  rows.push({
    ...empty,
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'ALL',
    agreements_n: report.totals.agreements,
    live_agreements_n: report.totals.liveAgreements,
    expired_agreements_n: report.totals.expiredAgreements,
    requests_n: report.totals.requests,
    requested_n: report.totals.requestedN,
    awaiting_acceptance_n: report.totals.awaitingAcceptanceN,
    request_lapsed_n: report.totals.requestLapsedN,
    cancelled_n: report.totals.cancelledN,
    acceptances_n: report.totals.acceptances,
    accepted_as_asked_n: report.totals.acceptedAsAskedN,
    accepted_differently_n: report.totals.acceptedDifferentlyN,
    awaiting_arrival_n: report.totals.awaitingArrivalN,
    not_arrived_overdue_n: report.totals.notArrivedOverdueN,
    arrivals_n: report.totals.arrivals,
    arrived_complete_n: report.totals.arrivedCompleteN,
    arrived_partial_n: report.totals.arrivedPartialN,
    arrived_late_n: report.totals.arrivedLateN,
    withdrawals_n: report.totals.withdrawals,
    withdrawn_n: report.totals.withdrawnN,
    releases_n: report.totals.releases,
    breaches_n: report.totals.breachesN,
    privacy_floor: floor,
    complete,
    blank_reason: reason,
  });

  /* 2. One row per printed request state. Below the floor and non-zero, the
        count is withheld with its reason rather than rounded, dropped or
        exported. */
  for (const row of report.stateRows) {
    const withheld = row.count > 0 && row.count < floor;
    const field = (key) => (row.key === key ? row.count : 0);
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'request_state',
      key: row.key,
      requests_n: withheld ? '' : row.count,
      requested_n: withheld ? '' : field('requested'),
      awaiting_acceptance_n: withheld ? '' : field('awaiting-acceptance'),
      request_lapsed_n: withheld ? '' : field('request-lapsed'),
      cancelled_n: withheld ? '' : field('cancelled'),
      acceptances_n: withheld ? '' : (['awaiting-arrival', 'accepted-differently', 'not-arrived-overdue', 'arrived-complete', 'arrived-partial', 'arrived-late', 'withdrawn', 'breach-release-before-withdrawal'].includes(row.key) ? row.count : 0),
      accepted_as_asked_n: withheld ? '' : 0,
      accepted_differently_n: withheld ? '' : field('accepted-differently'),
      awaiting_arrival_n: withheld ? '' : field('awaiting-arrival'),
      not_arrived_overdue_n: withheld ? '' : field('not-arrived-overdue'),
      arrivals_n: withheld ? '' : (['arrived-complete', 'arrived-partial', 'arrived-late'].includes(row.key) ? row.count : 0),
      arrived_complete_n: withheld ? '' : field('arrived-complete'),
      arrived_partial_n: withheld ? '' : field('arrived-partial'),
      arrived_late_n: withheld ? '' : field('arrived-late'),
      withdrawals_n: withheld ? '' : (row.key === 'withdrawn' ? row.count : 0),
      withdrawn_n: withheld ? '' : field('withdrawn'),
      breaches_n: withheld ? '' : (row.key.startsWith('breach') ? row.count : 0),
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} request(s); the count is withheld rather than printed. `
        : '',
    });
  }

  // A key the reader printed but the vocabulary does not list is a vocabulary
  // drift, not a zero: it is reported in the summary's provenance line.
  for (const key of MAA_STATE_KEYS) {
    if (!MAA_STATE_BY_KEY[key]) {
      rows.push({ ...empty, as_of: report.asOf, row_kind: 'request_state', key, privacy_floor: floor, complete, blank_reason: 'An unrecognised request state was printed by the reader and is reported here rather than as a zero.' });
    }
  }

  return rows.map((row) => Object.fromEntries(MAA_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
