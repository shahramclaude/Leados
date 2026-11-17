/**
 * app/core/domain/voiceReport.js — the identity-free CSV rows of the Employee
 * Voice & Collective Consultation Register (ADR-0243, Schema v197, CSV #184).
 *
 * NO SECOND COMPUTATION. This module only shapes what `buildVoice` returned into
 * positional rows. A figure printed here is the figure the reader computed, or it
 * is a blank with the reason the reader gave — never a zero standing in for "we
 * did not measure".
 *
 * IDENTITY-FREE BY CONSTRUCTION, AND THAT MATTERS HERE. A consultation record
 * names representatives, a body, a subject somebody might be disciplined for and
 * the body's own written advice. The export therefore carries counts and state
 * keys only: no person, no body name, no subject, no instrument reference, no
 * advice note, no reply note and no day. A state key is a PUBLISHED vocabulary, so
 * a reader can still see which kind of failure the workspace is carrying without
 * being able to attach one to a human being or to a body.
 *
 * THE PRIVACY FLOOR APPLIES TO THE PER-STATE SPLIT. A workspace with one lapsed
 * consultation and a small staff group knows exactly which change the count
 * refers to. A per-state count below the declared floor is therefore exported
 * BLANK with its reason rather than as a number. The summary totals are aggregate
 * counts over the whole register and are exported; the floor and its consequence
 * are printed beside them so nobody reads the split as complete.
 *
 * Two operators exporting the same workspace at the same clock get byte-identical
 * files.
 */

import { VOI_CSV_COLUMNS, VOI_SETTING_KEYS, VOI_SITTING_STATE_KEYS, VOI_SITTING_STATE_BY_KEY, VOI_STATE_BY_KEY } from './voiceRegistry.js';

const orBlank = (value) => (value === null || value === undefined || value === '' ? '' : value);

export function voiceCsvRows(report) {
  if (!report?.ok) return [];
  const empty = Object.fromEntries(VOI_CSV_COLUMNS.map((key) => [key, '']));
  const floor = report.conventions[VOI_SETTING_KEYS.privacyFloor] || 3;
  const complete = report.figuresComplete ? 1 : 0;
  const reason = report.figuresComplete ? '' : report.incompleteReasons.join('; ').slice(0, 300);

  const rows = [];

  /* 1. The summary row. The provenance claim and the floor are printed beside the
        figures they qualify; `complete` is never folded into a count. */
  rows.push({
    ...empty,
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'ALL',
    bodies_n: report.totals.bodies,
    members_n: report.totals.liveMembers,
    items_n: report.totals.items,
    consultation_n: report.totals.consultations,
    negotiation_n: report.totals.negotiations,
    information_n: report.totals.information,
    open_n: report.totals.adviceOwedN + report.totals.adviceLapsedN,
    advice_owed_n: report.totals.adviceOwedN,
    advice_lapsed_n: report.totals.adviceLapsedN,
    advised_n: report.totals.advisedN,
    advised_late_n: report.totals.advisedLateN,
    replied_n: report.totals.repliedN,
    reply_overdue_n: report.totals.replyOverdueN,
    decisions_n: report.totals.decisionsN,
    departed_n: report.totals.departedN,
    without_advice_n: report.totals.withoutAdviceN,
    implemented_n: report.totals.implementedN,
    sittings_n: report.totals.sittingsN,
    below_quorum_n: report.totals.belowQuorumN,
    minutes_lapsed_n: report.totals.minutesLapsedN,
    breaches_n: report.totals.breachesN,
    privacy_floor: floor,
    complete,
    blank_reason: reason,
  });

  /* 2. One row per printed ITEM state. Below the floor and non-zero, the count is
        withheld with its reason rather than rounded, dropped or exported. */
  for (const row of report.stateRows) {
    const withheld = row.count > 0 && row.count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'item_state',
      key: row.key,
      items_n: withheld ? '' : row.count,
      advice_owed_n: withheld ? '' : (row.key === 'advice-owed' ? row.count : 0),
      advice_lapsed_n: withheld ? '' : (row.key === 'advice-lapsed' ? row.count : 0),
      advised_n: withheld ? '' : (['advised', 'advised-late', 'advice-replied', 'reply-overdue'].includes(row.key) ? row.count : 0),
      advised_late_n: withheld ? '' : (row.key === 'advised-late' ? row.count : 0),
      reply_overdue_n: withheld ? '' : (row.key === 'reply-overdue' ? row.count : 0),
      decisions_n: withheld ? '' : (['decided', 'decided-departing', 'decided-without-advice', 'implemented'].includes(row.key) ? row.count : 0),
      departed_n: withheld ? '' : (row.key === 'decided-departing' ? row.count : 0),
      without_advice_n: withheld ? '' : (row.key === 'decided-without-advice' ? row.count : 0),
      implemented_n: withheld ? '' : (row.key === 'implemented' ? row.count : 0),
      breaches_n: withheld ? '' : (row.key.startsWith('breach') ? row.count : 0),
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This state carries fewer than the declared privacy floor of ${floor} item(s); the count is withheld rather than printed. `
        : '',
    });
  }

  /* 3. One row per printed SITTING state, on the same terms. */
  const sittingCounts = {};
  for (const row of report.sittingRows) sittingCounts[row.state.key] = (sittingCounts[row.state.key] || 0) + 1;
  for (const key of VOI_SITTING_STATE_KEYS) {
    const count = sittingCounts[key] || 0;
    const withheld = count > 0 && count < floor;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'sitting_state',
      key,
      sittings_n: withheld ? '' : count,
      below_quorum_n: withheld ? '' : (key === 'below-quorum' ? count : 0),
      minutes_lapsed_n: withheld ? '' : (key === 'minutes-lapsed' ? count : 0),
      privacy_floor: floor,
      complete,
      blank_reason: withheld
        ? `This sitting state carries fewer than the declared privacy floor of ${floor} sitting(s); the count is withheld rather than printed. `
        : '',
    });
  }
  // A key the reader printed but the vocabulary does not list is a vocabulary
  // drift, not a zero: it is reported in the summary's provenance line.
  for (const key of Object.keys(sittingCounts)) {
    if (!VOI_SITTING_STATE_BY_KEY[key] && !VOI_STATE_BY_KEY[key]) {
      rows.push({ ...empty, as_of: report.asOf, row_kind: 'sitting_state', key, privacy_floor: floor, complete, blank_reason: 'An unrecognised sitting state was printed by the reader and is reported here rather than as a zero.' });
    }
  }

  return rows.map((row) => Object.fromEntries(VOI_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}
