/**
 * app/core/domain/assuranceFindingReport.js — the seat-scoped read surface of
 * the Assurance Finding & Remediation Register (ADR-0232, `RULE-AFR-01`,
 * CSV #175).
 *
 * ONE kernel (`buildAssuranceFindings`) stands behind every state, flag, count
 * and rate this module returns. This layer adds exactly three things and
 * invents none of them:
 *
 *   1. SEAT VISIBILITY. A finding names a declarant, accountable lines,
 *      remediation owners, verifiers and possibly an acceptor. A seat reads a
 *      finding when it is a PARTY to it or when it holds one of those people on
 *      its tree or a declared line. Anything else is withheld and COUNTED
 *      (`hidden`), never printed and never dropped silently. Where a finding is
 *      hidden from the seat, the accountable-line table and the register-wide
 *      rates are withheld whole with a printed reason — a rate built from part
 *      of the population would read as the enterprise's (the ADR-0226 posture).
 *
 *   2. THE TWO ON-TIME RATES. `remediation` — of the findings whose
 *      remediation target day has already passed, how many were asserted by it;
 *      and `verification` — of the findings whose verification target day has
 *      passed, how many were independently verified by it. Both are exact floor
 *      basis points over exact integer counts, and both PRINT THEIR DENOMINATOR:
 *      an on-time rate over an undisclosed number of owed findings is not a
 *      figure, it is a mood. A finding closed by acceptance is outside both
 *      denominators: acceptance is a different route, not a late remediation.
 *
 *   3. THE ATTENTION COUNT — the acts THIS SEAT owes: an assignment on a line it
 *      holds, an assertion on a line it owns, or an independent verification of
 *      a fix it stands above. Never a volume about a person.
 *
 * What this module never does: it never rates a person; never computes a
 * compliance score, a control-effectiveness percentage or a maturity rating;
 * never prices a finding; never infers a severity, a cause or a recurrence from
 * wording; and never lets a remediation owner verify their own fix.
 */

import { buildAssuranceFindings } from './assuranceFinding.js';
import {
  AFR_AGE_BUCKETS,
} from './assuranceFindingMath.js';
import {
  AFR_LIMITS as L,
  AFR_STATE_KEYS,
  AFR_SEVERITY_KEYS,
  AFR_SOURCE_KEYS,
} from './assuranceRegistry.js';
import { planAggregateSuppression, DETERMINACY_VERDICTS } from './aggregateDeterminacy.js';
import { isHolderOrAbove } from './dutyMeans.js';
import { buildMatrix } from './matrix.js';
import { LEADER_ID } from './chain.js';

const LINE_NOTE = 'Non-additive: a finding naming two accountable lines is counted under both, so these rows do not sum to the finding total.';

/**
 * The seat grant for one derived row. A party to the finding always reads it —
 * the record is addressed to them. A manager reads the findings of the people in
 * their span or declared lines. Nobody else does.
 */
export function assuranceFindingGrant(seat, row) {
  if (!seat) return 'denied';
  if (seat.fullAccess) return 'full';
  const self = seat.nodeId || seat.id || null;
  const parties = [
    row.declaredById,
    row.acceptedById,
    ...row.accountable.map((entry) => entry.personId),
    ...row.accountable.map((entry) => entry.ownerId),
    ...row.accountable.map((entry) => entry.verifierId),
  ].filter(Boolean);
  if (self && parties.includes(self)) return 'full';
  const reach = (id) => Boolean(id) && ((seat.scope && seat.scope.has(id)) || (seat.lineScope && seat.lineScope.has(id)));
  const holders = row.accountable.map((entry) => entry.personId).concat(row.accountable.map((entry) => entry.ownerId));
  if (holders.some(reach)) return 'full';
  return 'denied';
}

/**
 * Independence, in one predicate, used by BOTH the write action and the badge so
 * the register cannot promise a seat a verification the action then refuses.
 * The verifier must be strictly above the remediation owner on the reporting DAG
 * (tree or declared line) — never the owner, never a subordinate of the owner,
 * never on an unrelated branch. `isHolderOrAbove(matrix, a, b)` is true when `a`
 * is `b` or an ancestor of `b`, so the pair of tests below is exactly "strictly
 * above" and nothing looser.
 */
export function assuranceVerifierReach(matrix, seat, ownerId) {
  if (!matrix || !seat || !ownerId) return false;
  const self = seat.nodeId || seat.id || null;
  if (!self) return false;
  if (seat.fullAccess) return ownerId !== LEADER_ID;
  if (self === ownerId) return false;
  return isHolderOrAbove(matrix, self, ownerId) && !isHolderOrAbove(matrix, ownerId, self);
}

const seatSummary = (seat) => (seat
  ? { label: seat.label || seat.id || 'operator', rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) }
  : null);

/**
 * The accountable-line table with the register's exact suppression procedure.
 * Only the three audited measures are published per line (`count`, `open`,
 * `overdue`); a suppressed cell exports every figure BLANK with its reason,
 * never zero.
 */
function lineTable(rows) {
  const cells = rows.map((cell) => ({
    key: cell.key,
    count: cell.findings,
    open: cell.open,
    overdue: cell.overdue,
    personId: cell.personId,
    lineId: cell.lineId,
    unresolved: cell.unresolved,
  }));
  const totals = {
    count: rows.reduce((sum, cell) => sum + cell.findings, 0),
    open: rows.reduce((sum, cell) => sum + cell.open, 0),
    overdue: rows.reduce((sum, cell) => sum + cell.overdue, 0),
  };
  const plan = planAggregateSuppression({ cells, totals, floor: L.privacyFloor });
  const suppressed = new Set(plan.suppress);
  const mandatory = new Set(plan.mandatory);
  const withheldMeasures = new Set(plan.withholdTotals || []);

  const out = cells.map((cell, index) => {
    const code = `l${index + 1}`;
    if (!suppressed.has(cell.key)) {
      return {
        code, lineId: cell.lineId, suppressed: false, suppressedWhy: null, suppressedReason: null,
        findings: cell.count, open: cell.open, overdue: cell.overdue, unresolved: cell.unresolved,
      };
    }
    const why = mandatory.has(cell.key) ? 'floor' : 'complementary';
    return {
      code, lineId: cell.lineId, suppressed: true, suppressedWhy: why,
      suppressedReason: why === 'floor'
        ? `Withheld: fewer than ${L.privacyFloor} findings name this accountable line.`
        : 'Withheld by complementary suppression so a sub-floor line cannot be recovered from the published totals.',
      findings: null, open: null, overdue: null, unresolved: null,
    };
  });

  return {
    cells: out,
    totals: {
      findings: withheldMeasures.has('count') ? null : totals.count,
      open: withheldMeasures.has('open') ? null : totals.open,
      overdue: withheldMeasures.has('overdue') ? null : totals.overdue,
    },
    verdict: plan.verdict,
    suppressedN: out.filter((cell) => cell.suppressed).length,
    withheldMeasures: [...withheldMeasures],
    notes: plan.notes || [],
    nonAdditive: true,
    nonAdditiveNote: LINE_NOTE,
  };
}

/**
 * The register-wide recurrence counts are a measure over FINDINGS, not over
 * lines, so they follow the fate of the finding-count total: wherever that total
 * is withheld by the suppression plan, recurrence is withheld with it (a count
 * with no published denominator is not a figure). Where the total is published,
 * recurrence adds nothing an adversary could subtract — the line cells are
 * already protected by their own complementary suppression, and the finding
 * total is published anyway.
 */
function recurrenceCounts(kernel, table) {
  const withheldMeasures = new Set(table.withheldMeasures || []);
  if (withheldMeasures.has('count') || table.verdict === DETERMINACY_VERDICTS.REFUSED) {
    return {
      recurrent: null,
      reobserved: null,
      withheld: true,
      reason: 'Withheld with the finding-count total: a recurrence count whose denominator is not published would be the only finding figure on the record, and complementary suppression protects the line cells by withholding the total instead.',
    };
  }
  return { recurrent: kernel.counts.recurrent, reobserved: kernel.counts.reobserved, withheld: false, reason: null };
}

export function buildAssuranceReport(state, { now, seat = null } = {}) {
  const kernel = buildAssuranceFindings(state, { now });

  const visible = [];
  const hidden = [];
  for (const row of kernel.rows) {
    if (!seat || assuranceFindingGrant(seat, row) === 'full') visible.push(row);
    else hidden.push(row);
  }
  const hiddenN = seat ? hidden.length : 0;
  const wholePopulation = hiddenN === 0;

  const table = wholePopulation
    ? lineTable(kernel.lines)
    : {
      cells: [],
      totals: { findings: null, open: null, overdue: null },
      verdict: DETERMINACY_VERDICTS.REFUSED,
      suppressedN: 0,
      withheldMeasures: [],
      notes: [],
      nonAdditive: true,
      nonAdditiveNote: LINE_NOTE,
    };

  const rates = wholePopulation
    ? kernel.counts.rates
    : {
      remediation: { owed: null, onTime: null, onTimeBp: null },
      verification: { owed: null, onTime: null, onTimeBp: null },
    };

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
      lines: table,
      rates,
      recurrence: wholePopulation ? recurrenceCounts(kernel, table) : { recurrent: null, reobserved: null, withheld: true, reason: 'Withheld with the whole population: findings are hidden from this seat.' },
    },
    lines: table,
    rates,
    ratesWithheld: !wholePopulation,
    ratesWithheldReason: wholePopulation
      ? null
      : `${hiddenN} finding(s) are not visible from this seat. A rate built from part of the population would be read as the enterprise’s, so no line table, count or rate is printed. Ask a seat granted the whole register.`,
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
 * The nav badge: the acts the seat owes on the record — an assignment on an
 * accountable line it holds, an assertion on a remediation it owns, or an
 * independent verification of a fix it stands strictly above. Never a volume
 * about a person.
 */
export function assuranceFindingAttentionCount(state, { now, seat = null } = {}) {
  if (!seat) return 0;
  const self = seat.nodeId || seat.id || null;
  // The undeclared operator view is not a person and can perform none of the
  // register's first-person acts, so it owes nothing.
  if (!self && !seat.fullAccess) return 0;
  if (seat.fullAccess) return 0;
  const report = buildAssuranceReport(state, { now, seat });
  let matrix = null;
  let count = 0;
  for (const row of report.rows) {
    for (const entry of row.accountable) {
      // Unassigned: the accountable HOLDER owes the assignment. Naming an owner
      // is the holder's act, and no other seat can perform it for them.
      if (entry.lineState === 'unassigned') {
        if (entry.personId === self) count += 1;
        continue;
      }
      // Remediating or rejected: the named OWNER owes the assertion — in the
      // rejected case it is owed again, because an independent test refused the
      // last one. Only the owner asserts; the holder cannot do it for them.
      if (entry.lineState === 'remediating' || entry.lineState === 'rejected') {
        if (entry.ownerId === self) count += 1;
        continue;
      }
      // Asserted: the owner owes nothing more. Verification is owed by a seat
      // strictly above the owner — never by the owner, whose own word is an
      // assertion and not a test.
      if (entry.lineState === 'asserted') {
        if (entry.ownerId === self) continue;
        if (entry.ownerId) {
          matrix = matrix || buildMatrix(state, { now, settings: { ...(state?.settings || {}), activeSeatId: null } });
          if (assuranceVerifierReach(matrix, seat, entry.ownerId)) count += 1;
        }
      }
    }
  }
  return count;
}

/* ------------------------------------------------------------------- CSV */

const num = (value) => (value === null || value === undefined ? '' : String(value));

/**
 * CSV scope #175 — aggregate and identity-free, built from the SAME reader the
 * panel renders. The rows carry no finding id, control name, scope name,
 * criteria, statement, owner, verifier, acceptor or line name: an accountable
 * line appears only under its opaque code.
 */
export function assuranceFindingCsvRows(report) {
  const rows = [];
  const asOf = report.asOf;
  const counts = report.counts || {};
  const lines = report.lines || { cells: [], totals: {}, suppressedN: 0 };
  const rates = report.rates || { remediation: {}, verification: {} };
  const blank = (reason) => ({
    findings: '', open: '', closed: '', recurrent: '',
    overdue_remediation: '', overdue_verification: '',
    owed: '', on_time: '', on_time_rate_bp: '', blank_reason: reason,
  });

  rows.push({
    as_of: asOf, row_kind: 'summary', key: 'all', state: '', severity: '', source: '',
    findings: num(counts.findings), open: num(counts.open), closed: num(counts.closed),
    recurrent: num(counts.recurrence?.recurrent),
    overdue_remediation: num(counts.overdue?.remediation),
    overdue_verification: num(counts.overdue?.verification),
    owed: '', on_time: '', on_time_rate_bp: '',
    blank_reason: counts.recurrence?.withheld ? counts.recurrence.reason : (report.ratesWithheld ? report.ratesWithheldReason : ''),
  });

  rows.push({
    as_of: asOf, row_kind: 'coverage', key: 'claims', state: '', severity: '', source: '',
    ...blank(''),
    findings: num(counts.findings),
    blank_reason: `partitionReconciles=${report.partitionReconciles ? 'true' : 'false'}; figuresComplete=${report.figuresComplete ? 'true' : 'false'}; unresolved-accountable-lines=${counts.unresolvedLines || 0}; suppressed-line-cells=${lines.suppressedN}; suppression-verdict=${lines.verdict}`,
  });

  for (const key of AFR_STATE_KEYS) {
    rows.push({
      as_of: asOf, row_kind: 'state', key, state: key, severity: '', source: '',
      ...blank(''),
      findings: String((counts.byState && counts.byState[key]) || 0),
    });
  }
  for (const key of AFR_SEVERITY_KEYS) {
    rows.push({
      as_of: asOf, row_kind: 'severity', key, state: '', severity: key, source: '',
      ...blank(''),
      findings: String((counts.bySeverity && counts.bySeverity[key]) || 0),
    });
  }
  for (const key of AFR_SOURCE_KEYS) {
    rows.push({
      as_of: asOf, row_kind: 'source', key, state: '', severity: '', source: key,
      ...blank(''),
      findings: String((counts.bySource && counts.bySource[key]) || 0),
    });
  }
  for (const bucket of AFR_AGE_BUCKETS) {
    rows.push({
      as_of: asOf, row_kind: 'aging', key: bucket.key, state: '', severity: '', source: '',
      ...blank(''),
      findings: String((counts.aging && counts.aging[bucket.key]) || 0),
    });
  }

  rows.push({
    as_of: asOf, row_kind: 'rate', key: 'remediation-on-time', state: '', severity: '', source: '',
    ...blank(''),
    owed: num(rates.remediation?.owed),
    on_time: num(rates.remediation?.onTime),
    on_time_rate_bp: num(rates.remediation?.onTimeBp),
    blank_reason: report.ratesWithheld ? (report.ratesWithheldReason || 'withheld') : '',
  });
  rows.push({
    as_of: asOf, row_kind: 'rate', key: 'verification-on-time', state: '', severity: '', source: '',
    ...blank(''),
    owed: num(rates.verification?.owed),
    on_time: num(rates.verification?.onTime),
    on_time_rate_bp: num(rates.verification?.onTimeBp),
    blank_reason: report.ratesWithheld ? (report.ratesWithheldReason || 'withheld') : '',
  });

  for (const cell of lines.cells || []) {
    rows.push({
      as_of: asOf, row_kind: 'line', key: cell.code, state: '', severity: '', source: '',
      findings: cell.suppressed ? '' : num(cell.findings),
      open: cell.suppressed ? '' : num(cell.open),
      closed: '',
      recurrent: '',
      overdue_remediation: '',
      overdue_verification: cell.suppressed ? '' : num(cell.overdue),
      owed: '', on_time: '', on_time_rate_bp: '',
      blank_reason: cell.suppressed ? cell.suppressedReason : '',
    });
  }

  return rows;
}
