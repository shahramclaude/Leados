/**
 * app/core/domain/suggestionReport.js — the seat-scoped read surface of the
 * Frontline Improvement-Suggestion Ledger (ADR-0227, `RULE-KZT-01`, CSV #173).
 *
 * ONE kernel (`buildSuggestionLedger`) stands behind every state, figure and
 * count this module returns. This layer adds exactly two things and invents
 * neither:
 *
 *   1. SEAT VISIBILITY. A suggestion names a submitter, a computed route and
 *      maybe an owner. A real seat reads a suggestion when it is a PARTY to it
 *      (submitter, route member or owner) or when the submitter or owner is
 *      inside its span or declared lines. Anything else is withheld and
 *      COUNTED (`hiddenN`), never printed and never dropped silently. Where a
 *      suggestion is hidden from the seat, the per-area RATES are withheld
 *      whole with a printed reason — a rate built from part of the population
 *      would read as the unit's (the ADR-0226 posture). The detail rows the
 *      seat may read still print, because the route member's triage duty is
 *      the register's job.
 *
 *   2. THE TWO RATES PER DECLARED AREA. `answered-within-window` (the route
 *      settled the suggestion at or before its declared response-by instant —
 *      a decline counts as an answer; a split does not) and `implemented`
 *      (`closed-confirmed` — an effect claimed and independently confirmed).
 *      Each area cell is withheld below the declared privacy floor of three,
 *      and complementary suppression runs the SAME exact recoverability
 *      procedure the rest of the app uses (`planAggregateSuppression`,
 *      ADR-0091). Rates are exact floor basis points over exact integer
 *      counts; a rate whose denominator is not printed is blank with its
 *      reason, never zero.
 *
 * Two claims are kept apart, as everywhere: `partitionReconciles` (the printed
 * state counts add to the ledger total) and `figuresComplete` (no refused act,
 * no dropped row). Neither implies the other.
 *
 * What this module never does: it never rates a person (no per-person volume,
 * ranking or recognition figure exists anywhere in the report); it never
 * computes a benefit or savings figure from a suggestion count; it never
 * attributes a suggestion to an org unit the record does not name — the unit of
 * aggregation is the DECLARED AREA the suggestion itself names, because
 * assigning a multi-line submitter to one unit would be an allocation nobody
 * agreed to.
 */

import { buildSuggestionLedger } from './suggestionLedger.js';
import { KZT_LIMITS as L, KZT_STATE_KEYS } from './suggestionRegistry.js';
import { kztBp } from './suggestionMath.js';
import { planAggregateSuppression, DETERMINACY_VERDICTS } from './aggregateDeterminacy.js';

const STATE_LABEL = Object.freeze({
  'awaiting-triage': 'Submitted — no triage decision yet',
  'awaiting-joint-triage': 'Shared route — some route members have decided; the rest still owe their decision',
  'triage-split': 'Shared route — route members disagree; nobody decides, the split is printed',
  'declined': 'Declined by the whole route, with a stated reason',
  'accepted-awaiting-claim': 'Accepted by the whole route — the named owner has not yet claimed an effect',
  'claimed-awaiting-confirmation': 'Owner claimed an effect — independent confirmation still owed',
  'closed-confirmed': 'Effect confirmed by someone other than the owner',
});

/**
 * The seat grant for one derived row. A party to the suggestion always reads
 * it — the record is addressed to them. A manager reads the suggestions of the
 * people in their span or declared lines. Nobody else does.
 */
export function suggestionGrant(seat, row) {
  if (!seat) return 'denied';
  if (seat.fullAccess) return 'full';
  const self = seat.nodeId || seat.id || null;
  const parties = [row.submitterId, row.ownerId, ...row.routeIds].filter(Boolean);
  if (self && parties.includes(self)) return 'full';
  const reach = (id) => Boolean(id) && ((seat.scope && seat.scope.has(id)) || (seat.lineScope && seat.lineScope.has(id)));
  if (reach(row.submitterId) || reach(row.ownerId)) return 'full';
  return 'denied';
}

const seatSummary = (seat) => (seat
  ? { label: seat.label || seat.id || 'operator', rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) }
  : null);

/** Answered within the declared window: settled (accept OR decline) at or before the response-by instant. */
function answeredWithinWindow(row) {
  if (!row.decidedAt) return false;
  return Date.parse(row.decidedAt) <= Date.parse(row.responseByAt);
}

function areaAggregates(rows) {
  const byArea = new Map();
  for (const row of rows) {
    const key = row.areaRef;
    if (!byArea.has(key)) byArea.set(key, { areaRef: key, total: 0, answered: 0, implemented: 0 });
    const cell = byArea.get(key);
    cell.total += 1;
    if (answeredWithinWindow(row)) cell.answered += 1;
    if (row.state === 'closed-confirmed') cell.implemented += 1;
  }
  return [...byArea.values()].sort((a, b) => (a.areaRef < b.areaRef ? -1 : a.areaRef > b.areaRef ? 1 : 0));
}

/**
 * The rates table: per-area exact counts and floor basis-point rates, each
 * cell withheld below the privacy floor with complementary suppression from the
 * exact recoverability procedure. The opaque area codes are assigned in the
 * same deterministic sort the rows use, so a code carries order and nothing
 * else.
 */
function ratesTable(rows) {
  const areas = areaAggregates(rows);
  const totals = {
    count: areas.reduce((sum, cell) => sum + cell.total, 0),
    open: areas.reduce((sum, cell) => sum + cell.answered, 0),
    overdue: areas.reduce((sum, cell) => sum + cell.implemented, 0),
  };
  const plan = planAggregateSuppression({
    cells: areas.map((cell) => ({ key: cell.areaRef, count: cell.total, open: cell.answered, overdue: cell.implemented })),
    totals,
    floor: L.privacyFloor,
  });
  const suppressed = new Set(plan.suppress);
  const mandatory = new Set(plan.mandatory);
  const withheldMeasures = new Set(plan.withholdTotals || []);

  const cells = areas.map((cell, index) => {
    const code = `a${index + 1}`;
    if (!suppressed.has(cell.areaRef)) {
      return {
        code,
        areaRef: cell.areaRef,
        suppressed: false,
        suppressedWhy: null,
        suppressedReason: null,
        total: cell.total,
        answered: cell.answered,
        implemented: cell.implemented,
        answeredBp: kztBp(cell.answered, cell.total),
        implementedBp: kztBp(cell.implemented, cell.total),
      };
    }
    const why = mandatory.has(cell.areaRef) ? 'floor' : 'complementary';
    return {
      code,
      areaRef: cell.areaRef,
      suppressed: true,
      suppressedWhy: why,
      suppressedReason: why === 'floor'
        ? `Withheld: fewer than ${L.privacyFloor} suggestions in this area.`
        : `Withheld by complementary suppression so a sub-floor area cannot be recovered from the published totals.`,
      total: null,
      answered: null,
      implemented: null,
      answeredBp: null,
      implementedBp: null,
    };
  });

  const totalsRow = {
    suggestions: withheldMeasures.has('count') ? null : totals.count,
    answered: withheldMeasures.has('open') ? null : totals.open,
    implemented: withheldMeasures.has('overdue') ? null : totals.overdue,
    answeredBp: withheldMeasures.has('open') ? null : kztBp(totals.open, totals.count),
    implementedBp: withheldMeasures.has('overdue') ? null : kztBp(totals.implemented, totals.count),
    withheld: [...withheldMeasures],
    withheldReason: withheldMeasures.size
      ? 'This total is withheld: every area cell is already withheld and the published total would pin a sub-floor cell exactly.'
      : null,
  };

  return {
    cells,
    totals: totalsRow,
    verdict: plan.verdict,
    suppressedN: cells.filter((cell) => cell.suppressed).length,
    withheldMeasures: [...withheldMeasures],
    notes: plan.notes || [],
  };
}

/**
 * @param {object} state  the workspace state
 * @param {{ now: Date|string, seat?: object|null }} options  injected clock; optional seat
 */
export function buildSuggestionReport(state, { now, seat = null } = {}) {
  const ledger = buildSuggestionLedger(state, { now });

  const visible = [];
  const hidden = [];
  for (const row of ledger.rows) {
    if (!seat || suggestionGrant(seat, row) === 'full') visible.push(row);
    else hidden.push(row);
  }
  const hiddenN = seat ? hidden.length : 0;

  // A rate built from part of the population would read as the unit's. Where
  // any suggestion is hidden from the seat, the rates are withheld whole with
  // their reason (ADR-0226 posture); the rows the seat may read still print.
  const wholePopulation = hiddenN === 0;
  const rates = wholePopulation
    ? ratesTable(ledger.rows)
    : {
      cells: [],
      totals: { suggestions: null, answered: null, implemented: null, answeredBp: null, implementedBp: null, withheld: [], withheldReason: null },
      verdict: DETERMINACY_VERDICTS.REFUSED,
      suppressedN: 0,
      withheldMeasures: [],
      notes: [],
    };

  const counts = {
    ...ledger.counts,
    visible: visible.length,
    hidden: hiddenN,
  };

  return {
    engine: ledger.engine,
    adr: ledger.adr,
    rule: ledger.rule,
    asOf: ledger.asOf,
    rows: visible,
    counts,
    rates,
    ratesWithheld: !wholePopulation,
    ratesWithheldReason: wholePopulation
      ? null
      : `${hiddenN} suggestion(s) are not visible from this seat. A rate built from part of the population would be read as the unit’s, so no area, count or rate is printed. Ask a seat granted the whole register.`,
    refusals: ledger.refusals,
    partitionReconciles: ledger.partitionReconciles,
    figuresComplete: ledger.figuresComplete,
    warnings: ledger.warnings,
    method: ledger.method,
    seat: seatSummary(seat),
  };
}

/**
 * The nav badge: the acts the seat owes on the record — a triage decision on a
 * suggestion whose route it sits on, an effect claim it owns, or the
 * independent confirmation it is allowed to give. Never a volume about a
 * person.
 */
export function suggestionAttentionCount(state, { now, seat = null } = {}) {
  if (!seat) return 0;
  const self = seat.nodeId || seat.id || null;
  if (!self && !seat.fullAccess) return 0;
  const report = buildSuggestionReport(state, { now, seat });
  const acts = Array.isArray(state?.suggestionActs) ? state.suggestionActs : [];
  const hasAct = (suggestionId, kind, actorId) => acts.some((act) => act && act.suggestionId === suggestionId && act.kind === kind && act.actorId === actorId);
  let count = 0;
  for (const row of report.rows) {
    const isRoute = row.routeIds.includes(self);
    const isOwner = row.ownerId === self;
    const isSubmitter = row.submitterId === self;
    if ((row.state === 'awaiting-triage' || row.state === 'awaiting-joint-triage') && isRoute && self && !hasAct(row.id, 'triage', self)) {
      count += 1;
      continue;
    }
    if (row.state === 'accepted-awaiting-claim' && isOwner && self && !hasAct(row.id, 'claim', self)) {
      count += 1;
      continue;
    }
    if (row.state === 'claimed-awaiting-confirmation' && (isSubmitter || isRoute) && !isOwner) {
      count += 1;
    }
  }
  return count;
}

/**
 * CSV scope #173 — aggregate and identity-free, built from the SAME reader the
 * panel renders. The rows carry no submitter, owner, route member, area name,
 * problem or proposal text: an area appears only under its opaque code.
 */
export function suggestionCsvRows(report) {
  const rows = [];
  const asOf = report.asOf;
  const num = (value) => (value === null || value === undefined ? '' : String(value));
  const blanks = (reason) => ({
    suggestions: '', answered_within_window: '', implemented: '',
    answered_rate_bp: '', implemented_rate_bp: '', response_overdue: '', target_overdue: '',
    refused_acts: '', dropped_rows: '', blank_reason: reason,
  });

  // Summary row. A figure withheld by the suppression plan prints BLANK here
  // too — the published surface is exactly what the plan sanctioned.
  const t = report.rates.totals || {};
  const withheld = new Set(report.rates.withheldMeasures || []);
  const stateRowsBlocked = withheld.has('count');
  rows.push({
    as_of: asOf, row_kind: 'summary', key: 'all', state: '',
    suggestions: num(t.suggestions),
    answered_within_window: num(t.answered),
    implemented: num(t.implemented),
    answered_rate_bp: num(t.answeredBp),
    implemented_rate_bp: num(t.implementedBp),
    response_overdue: String(report.counts.overdue.response),
    target_overdue: String(report.counts.overdue.target),
    refused_acts: String(report.counts.refusedActs),
    dropped_rows: String(report.counts.droppedSuggestions + report.counts.droppedActs),
    blank_reason: t.withheldReason || (report.ratesWithheld ? report.ratesWithheldReason : ''),
  });

  // Coverage row — the two claims, reported apart.
  rows.push({
    as_of: asOf, row_kind: 'coverage', key: 'claims', state: '',
    ...blanks(''),
    suggestions: num(t.suggestions),
    blank_reason: `partitionReconciles=${report.partitionReconciles ? 'true' : 'false'}; figuresComplete=${report.figuresComplete ? 'true' : 'false'}; suppressed-area-cells=${report.rates.suppressedN}; suppression-verdict=${report.rates.verdict}`,
  });

  // Per-state rows. When the count total is withheld by the plan, the state
  // partition is withheld with it — printing it would hand the withheld total
  // back by summation.
  for (const key of KZT_STATE_KEYS) {
    const reason = stateRowsBlocked
      ? 'Withheld with the count total: complementary suppression cannot protect the sub-floor areas against a total this partition would publish.'
      : '';
    rows.push({
      as_of: asOf, row_kind: 'state', key, state: key,
      ...blanks(reason),
      suggestions: stateRowsBlocked ? '' : String(report.counts.byState[key] || 0),
    });
  }

  // Per-area rows under opaque codes. A suppressed cell exports every figure
  // BLANK with its reason, never zero.
  for (const cell of report.rates.cells || []) {
    rows.push({
      as_of: asOf, row_kind: 'area', key: cell.code, state: '',
      suggestions: cell.suppressed ? '' : String(cell.total),
      answered_within_window: cell.suppressed ? '' : String(cell.answered),
      implemented: cell.suppressed ? '' : String(cell.implemented),
      answered_rate_bp: cell.suppressed ? '' : num(cell.answeredBp),
      implemented_rate_bp: cell.suppressed ? '' : num(cell.implementedBp),
      response_overdue: '', target_overdue: '', refused_acts: '', dropped_rows: '',
      blank_reason: cell.suppressed ? cell.suppressedReason : '',
    });
  }

  return rows;
}
