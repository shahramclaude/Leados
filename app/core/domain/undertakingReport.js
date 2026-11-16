/**
 * app/core/domain/undertakingReport.js — the seat-scoped read surface of the
 * Regulatory Undertaking & Outward-Commitment Closure Register (ADR-0234,
 * `RULE-UDT-01`, CSV #177).
 *
 * ONE kernel (`buildUndertakings`) stands behind every state, flag, count and
 * rate this module returns. This layer adds exactly three things and invents
 * none of them:
 *
 *   1. SEAT VISIBILITY. An undertaking names a counterparty, a declared
 *      executive, the holders of every obligation line, the seats that tested
 *      them and the seat that reported. A seat reads an undertaking when it is
 *      a PARTY to it or when it holds one of those people on its tree or a
 *      declared line. Anything else is withheld and COUNTED (`hidden`), never
 *      printed and never dropped silently. Where an undertaking is hidden from
 *      the seat, the register-wide rate is withheld whole with a printed
 *      reason — a rate built from part of the population would read as the
 *      enterprise's (the ADR-0226 posture).
 *
 *   2. THE ONE RATE, printed with its denominator: of the undertakings whose
 *      effective due day has passed, how many carried their counterparty report
 *      ON OR BEFORE it. A lapsed promise sits in the denominator and never in
 *      the numerator — that is the whole point of the figure. Exact floor basis
 *      points over exact integer counts; blank with its reason when unsupported.
 *
 *   3. THE ATTENTION COUNT — the acts THIS SEAT owes: an independent test on a
 *      deliverable asserted on a line it sits above; a report to the
 *      counterparty once every line is confirmed; an acknowledgement on a
 *      report it filed; and the unresolved assignment on a line it declared.
 *      Never a volume about a person.
 *
 * What this module never does: it never rates a person, a team, a function or
 * a counterparty; never computes a compliance score, a maturity rating or a
 * league table; never infers a holder, a deliverable or a statutory deadline;
 * and never converts a passed due day into a met promise.
 */

import { buildUndertakings } from './undertakingClosure.js';
import { UDT_STATE_KEYS, UDT_COUNTERPARTY_KINDS, UDT_INSTRUMENTS } from './undertakingRegistry.js';
import { UDT_WINDOW_BUCKETS } from './undertakingMath.js';
import { buildMatrix } from './matrix.js';
import { isHolderOrAbove } from './dutyMeans.js';
import { LEADER_ID } from './chain.js';

/**
 * INDEPENDENCE, DEFINED ONCE. A seat may test a line's deliverable only from
 * strictly ABOVE its holder on the reporting graph — never the holder, never
 * below them, never an unrelated branch. `isHolderOrAbove(matrix, a, b)` is
 * true when `a` is `b` or an ancestor of `b`, so the pair of tests below is
 * exactly "strictly above" and nothing looser.
 *
 * The badge and the ACTION both call THIS function. A second copy of the test
 * is how a register ends up offering a seat a key the action then refuses.
 */
export function undertakingVerifierReach(matrix, seat, holderId) {
  if (!matrix || !seat || !holderId) return false;
  const self = seat.nodeId || seat.id || null;
  if (!self) return false;
  if (seat.fullAccess) return holderId !== LEADER_ID;
  if (self === holderId) return false;
  return isHolderOrAbove(matrix, self, holderId) && !isHolderOrAbove(matrix, holderId, self);
}

/** Convenience for callers that hold only the workspace state. */
export function undertakingSeatCanVerify(state, seat, holderId, now) {
  let matrix;
  try {
    matrix = buildMatrix(state, { now, settings: { ...(state?.settings || {}), activeSeatId: null } });
  } catch {
    return false;
  }
  return undertakingVerifierReach(matrix, seat, holderId);
}

/**
 * The seat grant for one derived row. A party to the undertaking always reads
 * it — the declarer, a holder, a tester and the reporter are parties by
 * definition. A manager reads the undertakings of the people in their span or
 * declared lines. Nobody else does.
 */
export function undertakingGrant(seat, row, matrix = null) {
  if (!seat) return 'denied';
  if (seat.fullAccess) return 'full';
  const self = seat.nodeId || seat.id || null;
  if (!self) return 'denied';
  const parties = [
    row.declaredById,
    row.reportedById,
    row.acknowledgedById,
    row.apexId,
    ...row.lines.flatMap((line) => [line.holderId, line.deliveredById, line.verifiedById]),
  ].filter(Boolean);
  if (parties.includes(self)) return 'full';
  const reach = (id) => Boolean(id) && ((seat.scope && seat.scope.has(id)) || (seat.lineScope && seat.lineScope.has(id)));
  const held = [
    row.declaredById,
    row.apexId,
    ...row.lines.map((line) => line.holderId),
  ].filter(Boolean);
  if (held.some(reach)) return 'full';
  return 'denied';
}

const seatSummary = (seat) => (seat
  ? { label: seat.label || seat.id || 'operator', rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) }
  : null);

export function buildUndertakingReport(state, { now, seat = null } = {}) {
  const kernel = buildUndertakings(state, { now });

  const visible = [];
  const hidden = [];
  for (const row of kernel.rows) {
    if (!seat || undertakingGrant(seat, row) === 'full') visible.push(row);
    else hidden.push(row);
  }
  const hiddenN = seat ? hidden.length : 0;
  const wholePopulation = hiddenN === 0;

  const rates = wholePopulation
    ? kernel.counts.rates
    : { reportedInsideWindow: { owed: null, onTime: null, onTimeBp: null } };

  return {
    engine: kernel.engine,
    adr: kernel.adr,
    rule: kernel.rule,
    asOf: kernel.asOf,
    rows: visible,
    counts: {
      ...kernel.counts,
      visible: visible.length,
      hidden: hiddenN,
      rates,
    },
    rates,
    ratesWithheld: !wholePopulation,
    ratesWithheldReason: wholePopulation
      ? null
      : `${hiddenN} undertaking(s) are not visible from this seat. A rate built from part of the population would be read as the enterprise’s, so no register-wide rate is printed. Ask a seat granted the whole register.`,
    refusals: kernel.warnings,
    markers: kernel.markers,
    partitionReconciles: kernel.partitionReconciles,
    figuresComplete: kernel.figuresComplete,
    warnings: kernel.warnings,
    method: kernel.method,
    seat: seatSummary(seat),
  };
}

/**
 * The nav badge: the acts this seat owes on the record.
 *
 *   For a seat above a line holder: an independent test owed on an asserted
 *   deliverable that is not yet confirmed or rejected.
 *   For the accountable executive: a counterparty report owed once every line
 *   is confirmed, and an acknowledgement owed on a report already filed.
 *   For a declarer: an obligation line carrying no named holder.
 *
 * Never a volume about a person, and never a count of somebody else's backlog.
 */
export function undertakingAttentionCount(state, { now, seat = null } = {}) {
  if (!seat) return 0;
  const self = seat.nodeId || seat.id || null;
  // The undeclared operator view is not a person and can perform none of the
  // register's first-person acts, so it owes nothing.
  if (!self && !seat.fullAccess) return 0;
  if (seat.fullAccess) return 0;
  const report = buildUndertakingReport(state, { now, seat });
  const kernel = buildUndertakings(state, { now });
  let count = 0;
  for (const row of report.rows) {
    const kernelRow = kernel.rows.find((candidate) => candidate.id === row.id);
    if (!kernelRow) continue;
    /**
     * A line asserted and untested: the test is owed by a seat STRICTLY ABOVE
     * the holder. The badge uses the SAME reach predicate the action uses
     * (`undertakingVerifierReach`), so the register never promises a seat a
     * test it would then refuse — and never badges a seat for a duty that
     * belongs to the holder's manager's manager.
     */
    for (const line of kernelRow.lines) {
      if (line.lineState !== 'delivered' || !line.holderId) continue;
      if (undertakingSeatCanVerify(state, seat, line.holderId, now)) count += 1;
    }
    // The accountable executive owes the counterparty report once every line is
    // confirmed, and the acknowledgement once a report is on the record.
    if (kernelRow.allConfirmed && !kernelRow.reported && kernelRow.declaredById === self) count += 1;
    if (kernelRow.reported && !kernelRow.acknowledgedOn && kernelRow.declaredById === self) count += 1;
    if ((kernelRow.unassignedLineCount > 0) && kernelRow.declaredById === self) count += 1;
  }
  return count;
}

/* ------------------------------------------------------------------- CSV */

const num = (value) => (value === null || value === undefined ? '' : String(value));

/**
 * CSV scope #177 — aggregate and identity-free, built from the SAME reader the
 * panel renders. The rows carry no undertaking id, counterparty name, scope,
 * deliverable, instrument reference, holder, verifier or reporter name: nothing
 * here can be traced back to a person or a relationship from the export alone.
 */
export function undertakingCsvRows(report) {
  const rows = [];
  const asOf = report.asOf;
  const counts = report.counts || {};
  const rates = report.rates || { reportedInsideWindow: {} };
  const rateWithheld = Boolean(report.ratesWithheld);

  const blank = (reason) => ({
    undertakings: '', open: '', reported: '', lapsed: '',
    closing: '', unreported: '', rejected: '', disputed: '',
    owed: '', on_time: '', on_time_rate_bp: '', blank_reason: reason,
  });

  rows.push({
    as_of: asOf, row_kind: 'summary', key: 'all', state: '', counterparty_kind: '',
    undertakings: num(counts.undertakings), open: num(counts.open), reported: num(counts.reported),
    lapsed: num(counts.lapsed),
    closing: num(counts.closing), unreported: num(counts.unreported),
    rejected: num(counts.rejected), disputed: num(counts.disputed),
    owed: '', on_time: '', on_time_rate_bp: '',
    blank_reason: rateWithheld ? (report.ratesWithheldReason || 'withheld') : '',
  });

  rows.push({
    as_of: asOf, row_kind: 'coverage', key: 'claims', state: '', counterparty_kind: '',
    ...blank(''),
    undertakings: num(counts.undertakings),
    blank_reason: `partitionReconciles=${report.partitionReconciles ? 'true' : 'false'}; figuresComplete=${report.figuresComplete ? 'true' : 'false'}; dropped-rows=${counts.droppedRows || 0}; unassigned-lines=${counts.unassignedLines || 0}; no-authority=${counts.noAuthority || 0}; extensions-recorded=${counts.extensions || 0}`,
  });

  for (const key of UDT_STATE_KEYS) {
    rows.push({
      as_of: asOf, row_kind: 'state', key, state: key, counterparty_kind: '',
      ...blank(''),
      undertakings: String((counts.byState && counts.byState[key]) || 0),
    });
  }
  for (const kind of UDT_COUNTERPARTY_KINDS) {
    const n = (counts.byCounterparty && counts.byCounterparty[kind.key]) || 0;
    const belowFloor = n > 0 && n < 3;
    rows.push({
      as_of: asOf, row_kind: 'counterparty', key: kind.key, state: '', counterparty_kind: kind.key,
      ...blank(belowFloor ? 'Below the privacy floor of three: a count this small would name a relationship, so it is exported blank rather than as a small number.' : ''),
      undertakings: belowFloor ? '' : String(n),
    });
  }
  for (const instrument of UDT_INSTRUMENTS) {
    rows.push({
      as_of: asOf, row_kind: 'instrument', key: instrument.key, state: '', counterparty_kind: '',
      ...blank(''),
      undertakings: String((counts.byInstrument && counts.byInstrument[instrument.key]) || 0),
    });
  }
  for (const bucket of UDT_WINDOW_BUCKETS) {
    rows.push({
      as_of: asOf, row_kind: 'window', key: bucket.key, state: '', counterparty_kind: '',
      ...blank(''),
      undertakings: String((counts.windows && counts.windows[bucket.key]) || 0),
    });
  }

  rows.push({
    as_of: asOf, row_kind: 'rate', key: 'reported-inside-window', state: '', counterparty_kind: '',
    ...blank(''),
    owed: num(rates.reportedInsideWindow?.owed),
    on_time: num(rates.reportedInsideWindow?.onTime),
    on_time_rate_bp: num(rates.reportedInsideWindow?.onTimeBp),
    blank_reason: rateWithheld ? (report.ratesWithheldReason || 'withheld') : '',
  });
  rows.push({
    as_of: asOf, row_kind: 'notification', key: 'confirmed-not-reported', state: '', counterparty_kind: '',
    ...blank(''),
    closing: num(counts.unreported),
    blank_reason: counts.unreported
      ? 'Every line of these undertakings is independently confirmed and the counterparty has not been told. The duty closes only on the accountable executive’s dated report act.'
      : '',
  });

  return rows;
}
