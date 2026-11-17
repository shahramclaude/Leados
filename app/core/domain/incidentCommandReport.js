/**
 * app/core/domain/incidentCommandReport.js — the seat-scoped report and the
 * identity-free CSV rows of the Major-Incident Command & Notification-Clock
 * Register (ADR-0240, Schema v194, CSV scope #181).
 *
 * TWO READERS, ONE SOURCE. `incidentReport` (in `incidentCommand.js`) does the
 * derivation; this module only shapes what it returned into (a) the rows the
 * panel prints and (b) the positional-code rows the CSV exports. There is no
 * second computation here — a figure this file prints is the figure the reader
 * computed, or it is a blank with the reason the reader gave.
 *
 * THE EXPORT IS IDENTITY-FREE BY CONSTRUCTION. No incident id, no title, no
 * person id, no person name, no instrument text, no notification reference and
 * no free text of any kind can reach it. Rows are keyed by stable positional
 * codes: severities by their declared key (a published vocabulary, not a
 * secret), notification parties by their declared key, and response lines by a
 * `L01…` code in a stable duty order. Two operators exporting the same
 * workspace at the same clock get byte-identical files.
 *
 * A FIGURE THE RECORD CANNOT SUPPORT EXPORTS BLANK WITH ITS REASON. The median
 * detection-to-declaration interval below the privacy floor is the live example:
 * it is blank in the cell and its reason is in `blank_reason`. It is never a
 * zero, because a zero would read as "we declare instantly".
 */

import { MIC_CSV_COLUMNS, MIC_LIMITS as L, MIC_RESPONSE_DUTY_KEYS } from './incidentCommandRegistry.js';
import { incidentReport } from './incidentCommand.js';

const orBlank = (value) => (value === null || value === undefined || value === '' ? '' : value);

/** The duty order the positional line codes follow, so `L01` is always the same duty. */
const DUTY_ORDER = MIC_RESPONSE_DUTY_KEYS;

/**
 * CSV #181. One summary row, one row per declared severity, one per notification
 * party present on the record, and one per response duty present on the record.
 * Every row carries the same column set, so a reader can concatenate the file
 * without a mode switch.
 */
export function incidentCsvRows(report) {
  if (!report) return [];
  const empty = Object.fromEntries(MIC_CSV_COLUMNS.map((key) => [key, '']));
  const base = {
    as_of: report.asOf,
    incidents_n: report.totals.incidents,
    live_n: report.totals.live,
    stood_down_n: report.totals.stoodDown,
    command_standing_n: report.totals.commandStanding,
    no_commander_n: report.totals.noCommander,
    major_n: report.totals.major,
    lines_n: report.totals.lines,
    lines_unled_n: report.totals.linesUnled,
    clocks_n: report.totals.clocks,
    notifications_required_n: report.totals.notificationsRequired,
    notifications_recorded_n: report.totals.notificationsRecorded,
    notifications_late_n: report.totals.notificationsLate,
    notifications_lapsed_n: report.totals.notificationsLapsed,
    notifications_no_clock_n: report.totals.notificationsNoClock,
    external_notifications_recorded_n: report.totals.externalRecorded,
  };

  const rows = [];

  // 1. The summary row. The two integrity claims are printed as flags beside the
  //    figures they qualify, and the completeness claim is never folded in.
  rows.push({
    ...empty,
    ...base,
    row_kind: 'summary',
    key: 'ALL',
    detect_to_declare_minutes_median: report.interval ? report.interval.value : '',
    complete: report.figuresComplete ? 1 : 0,
    blank_reason: report.interval
      ? ''
      : (report.intervalReason || 'The interval could not be computed from this record.'),
  });

  // 2. One row per declared severity, so the distribution is visible without a
  //    per-incident row leaking one.
  for (const severity of ['sev1', 'sev2', 'sev3', 'sev4']) {
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'severity',
      key: severity,
      incidents_n: report.buckets[severity] || 0,
      complete: report.figuresComplete ? 1 : 0,
      blank_reason: '',
    });
  }

  // 3. One row per notification party present on the record: how many were
  //    required, recorded, recorded late, lapsed and left without a clock.
  for (const party of report.byParty) {
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'notification-party',
      key: party.party,
      notifications_required_n: party.required,
      notifications_recorded_n: party.recorded,
      notifications_late_n: party.late,
      notifications_lapsed_n: party.lapsed,
      notifications_no_clock_n: party.noClock,
      complete: report.figuresComplete ? 1 : 0,
      blank_reason: '',
    });
  }

  // 4. One row per response duty present on the record, as `L01…`, in the stable
  //    duty order — never the order the incidents happened to be declared in.
  const byLine = new Map(report.byLine.map((row) => [row.duty, row]));
  DUTY_ORDER.forEach((duty, index) => {
    const row = byLine.get(duty);
    if (!row) return;
    const code = `L${String(index + 1).padStart(2, '0')}`;
    rows.push({
      ...empty,
      as_of: report.asOf,
      row_kind: 'response-line',
      key: code,
      lines_n: row.lines,
      lines_unled_n: (row.assigned || 0) + (row.unassigned || 0),
      complete: report.figuresComplete ? 1 : 0,
      blank_reason: '',
    });
  });

  return rows.map((row) => Object.fromEntries(MIC_CSV_COLUMNS.map((key) => [key, orBlank(row[key])])));
}

/**
 * The attention figure the badge prints and the panel's headline uses. Counts
 * only — never a rate over people, never a per-person figure.
 */
export function incidentCoverage(report) {
  if (!report) return { complete: false, reason: 'No report was read.' };
  const reasons = [];
  if (report.hidden) reasons.push(`${report.hidden} incident(s) are outside this seat’s reach; the whole-register claim is withheld.`);
  if (report.warnings.length) reasons.push(`${report.warnings.length} stored row(s) were unreadable and were refused with a count; no figure was repaired.`);
  if (report.matrixError) reasons.push('The reporting graph could not be read, so no accountable seat was computed.');
  if (!report.balances.statesReconcile) reasons.push('The printed incident states do not re-add to the rows they summarise.');
  if (!report.balances.severitiesReconcile) reasons.push('The printed severity counts do not re-add to the rows they summarise.');
  if (!report.balances.notificationsReconcile) reasons.push('The printed notification counts do not re-add to the rows they summarise.');
  return {
    complete: reasons.length === 0,
    reason: reasons.length ? reasons.join(' ') : null,
    hidden: report.hidden,
    refused: report.warnings.length,
    maxLines: L.linesMax,
  };
}

export { incidentReport };
