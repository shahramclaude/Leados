/**
 * app/core/domain/probationGateReport.js — the seat-scoped read surface of the
 * Probation Confirmation Gate Register (ADR-0233, `RULE-PBG-01`, CSV #176).
 *
 * ONE kernel (`buildProbationGates`) stands behind every state, flag, count and
 * rate this module returns. This layer adds exactly three things and invents
 * none of them:
 *
 *   1. SEAT VISIBILITY. A gate names a confirming manager, a joiner, asked line
 *      holders and submitters. A seat reads a gate when it is a PARTY to it or
 *      when it holds one of those people on its tree or a declared line. The
 *      JOINER always reads their own gate: a fair process is one the person it
 *      is about can see, with every line's evidence and the decision on it.
 *      Anything else is withheld and COUNTED (`hidden`), never printed and
 *      never dropped silently. Where a gate is hidden from the seat, the
 *      register-wide rate is withheld whole with a printed reason — a rate
 *      built from part of the population would read as the enterprise's (the
 *      ADR-0226 posture).
 *
 *   2. THE ONE ON-TIME RATE. Of the gates whose effective window day has
 *      passed, how many carried their decision INSIDE the window. Exact floor
 *      basis points over exact integer counts, and it PRINTS ITS DENOMINATOR:
 *      a rate over an undisclosed number of ended windows is not a figure, it
 *      is a mood. A lapsed gate sits in the denominator and never in the
 *      numerator — that is the whole point of the figure.
 *
 *   3. THE ATTENTION COUNT — the acts THIS SEAT owes: the decision on a gate it
 *      confirms (evidence complete, window closing or lapsed), the written
 *      notification on a decision it made, or an overdue evidence ask addressed
 *      to a line it holds. Never a volume about a person.
 *
 * What this module never does: it never rates a joiner or a manager; never
 * computes a capability score, a pass percentage or a ranking; never infers a
 * window, a cap or a statutory limit; and never substitutes the instrument's
 * default outcome for a decision nobody made.
 */

import { buildProbationGates } from './probationGate.js';
import { PBG_STATE_KEYS } from './probationRegistry.js';
import { PBG_WINDOW_BUCKETS } from './probationGateMath.js';

/**
 * The seat grant for one derived row. A party to the gate always reads it —
 * the record is addressed to them, and the joiner is a party by definition. A
 * manager reads the gates of the people in their span or declared lines.
 * Nobody else does.
 */
export function probationGateGrant(seat, row) {
  if (!seat) return 'denied';
  if (seat.fullAccess) return 'full';
  const self = seat.nodeId || seat.id || null;
  const parties = [
    row.declaredById,
    row.joinerId,
    row.notifiedBy,
    ...row.lines.flatMap((line) => [line.lineHolderId, line.latestSubmittedById]),
  ].filter(Boolean);
  if (self && parties.includes(self)) return 'full';
  const reach = (id) => Boolean(id) && ((seat.scope && seat.scope.has(id)) || (seat.lineScope && seat.lineScope.has(id)));
  const held = [row.joinerId, row.declaredById, ...row.lines.map((line) => line.lineHolderId)];
  if (held.some(reach)) return 'full';
  return 'denied';
}

const seatSummary = (seat) => (seat
  ? { label: seat.label || seat.id || 'operator', rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) }
  : null);

export function buildProbationReport(state, { now, seat = null } = {}) {
  const kernel = buildProbationGates(state, { now });

  const visible = [];
  const hidden = [];
  for (const row of kernel.rows) {
    if (!seat || probationGateGrant(seat, row) === 'full') visible.push(row);
    else hidden.push(row);
  }
  const hiddenN = seat ? hidden.length : 0;
  const wholePopulation = hiddenN === 0;

  const rates = wholePopulation
    ? kernel.counts.rates
    : { decidedInsideWindow: { owed: null, onTime: null, onTimeBp: null } };

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
      : `${hiddenN} gate(s) are not visible from this seat. A rate built from part of the population would be read as the enterprise’s, so no register-wide rate is printed. Ask a seat granted the whole register.`,
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
 * The nav badge: the acts the seat owes on the record. For the confirming
 * manager: a decision owed (evidence complete, window closing or lapsed), a
 * written notification owed on a decision made, and an extension the instrument
 * allows while the window is closing. For an asked line holder: an overdue
 * evidence ask addressed to a line they hold. Never a volume about a person.
 */
export function probationGateAttentionCount(state, { now, seat = null } = {}) {
  if (!seat) return 0;
  const self = seat.nodeId || seat.id || null;
  // The undeclared operator view is not a person and can perform none of the
  // register's first-person acts, so it owes nothing.
  if (!self && !seat.fullAccess) return 0;
  if (seat.fullAccess) return 0;
  const report = buildProbationReport(state, { now, seat });
  let count = 0;
  for (const row of report.rows) {
    if (!row.closed) {
      const confirmManagerOwes = row.declaredById === self
        && (row.state === 'evidence-complete' || row.closing || row.lapsed);
      if (confirmManagerOwes) count += 1;
      for (const line of row.lines) {
        if (line.lineKind === 'matrix' && line.overdueAsk && line.lineHolderId === self) count += 1;
      }
      continue;
    }
    if (row.unnotified && row.declaredById === self) count += 1;
  }
  return count;
}

/* ------------------------------------------------------------------- CSV */

const num = (value) => (value === null || value === undefined ? '' : String(value));

/**
 * CSV scope #176 — aggregate and identity-free, built from the SAME reader the
 * panel renders. The rows carry no joiner id, manager id, line id, role label,
 * expectation text, instrument reference, evidence text or letter reference:
 * nothing here can be traced back to a person from the export alone.
 */
export function probationGateCsvRows(report) {
  const rows = [];
  const asOf = report.asOf;
  const counts = report.counts || {};
  const rates = report.rates || { decidedInsideWindow: {} };
  const rateWithheld = Boolean(report.ratesWithheld);

  const blank = (reason) => ({
    gates: '', open: '', closed: '', lapsed: '',
    closing: '', unnotified: '', overdue_asks: '',
    owed: '', on_time: '', on_time_rate_bp: '', blank_reason: reason,
  });

  rows.push({
    as_of: asOf, row_kind: 'summary', key: 'all', state: '', outcome: '',
    gates: num(counts.gates), open: num(counts.open), closed: num(counts.closed),
    lapsed: num(counts.lapsed),
    closing: num(counts.closing), unnotified: num(counts.unnotified),
    overdue_asks: num(counts.overdueAsks),
    owed: '', on_time: '', on_time_rate_bp: '',
    blank_reason: rateWithheld ? (report.ratesWithheldReason || 'withheld') : '',
  });

  rows.push({
    as_of: asOf, row_kind: 'coverage', key: 'claims', state: '', outcome: '',
    ...blank(''),
    gates: num(counts.gates),
    blank_reason: `partitionReconciles=${report.partitionReconciles ? 'true' : 'false'}; figuresComplete=${report.figuresComplete ? 'true' : 'false'}; dropped-rows=${counts.droppedRows || 0}; unresolved-declared-lines=${counts.unresolvedLines || 0}; extensions-recorded=${counts.extensions || 0}`,
  });

  for (const key of PBG_STATE_KEYS) {
    rows.push({
      as_of: asOf, row_kind: 'state', key, state: key, outcome: '',
      ...blank(''),
      gates: String((counts.byState && counts.byState[key]) || 0),
    });
  }
  for (const key of Object.keys(counts.byOutcome || {})) {
    rows.push({
      as_of: asOf, row_kind: 'outcome', key, state: '', outcome: key,
      ...blank(''),
      gates: String(counts.byOutcome[key] || 0),
    });
  }
  for (const bucket of PBG_WINDOW_BUCKETS) {
    rows.push({
      as_of: asOf, row_kind: 'window', key: bucket.key, state: '', outcome: '',
      ...blank(''),
      gates: String((counts.windows && counts.windows[bucket.key]) || 0),
    });
  }

  rows.push({
    as_of: asOf, row_kind: 'rate', key: 'decided-inside-window', state: '', outcome: '',
    ...blank(''),
    owed: num(rates.decidedInsideWindow?.owed),
    on_time: num(rates.decidedInsideWindow?.onTime),
    on_time_rate_bp: num(rates.decidedInsideWindow?.onTimeBp),
    blank_reason: rateWithheld ? (report.ratesWithheldReason || 'withheld') : '',
  });
  rows.push({
    as_of: asOf, row_kind: 'notification', key: 'unnotified-decisions', state: '', outcome: '',
    ...blank(''),
    closing: num(counts.unnotified),
    blank_reason: counts.unnotified
      ? 'A decision with no recorded written notification is printed with its count; the duty closes only on the confirming manager’s dated notification act.'
      : '',
  });

  return rows;
}
