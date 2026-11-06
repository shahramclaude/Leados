/**
 * ADR-0107 — the Outcome Learning Loop: derived read model and one-shot grader.
 *
 * THE GAP. Session 146 reconciles an adopted Action Bundle from dated terminal
 * evidence (decision review, delivery note, premise verdict, actual spend,
 * recorded send, held 1:1) and a human-resolved source case. That closes a PDCA
 * loop. It does not answer the question a learning organisation actually asks:
 *   "What did we expect when we adopted this response, were we right, how late
 *    were we, and what should the next call be priced against?"
 * Five separate forecast ledgers already score decisions, effort, exposure,
 * negotiated value and budget commitments. None of them has ONE ADOPTED
 * CROSS-MODULE RESPONSE as its unit of analysis, and none feeds the pooled
 * result back into the price of a NEW decision.
 *
 * THREE COMPUTATIONS, all re-derived from dated records (never trusted from a
 * stored score):
 *   1. FREEZE   an immutable expectation at adoption: reviewed probability,
 *               horizon, planned action count, planned money, owner span and
 *               typed POINTERS to every module the adopted commands touched.
 *   2. GRADE    exactly once, only when the execution loop is CLOSED on evidence
 *               AND a human recorded a tri-state decision outcome. Brier (1950)
 *               against the strictly-prior 0.5 base, delivery fidelity, days
 *               past horizon and a direction-first quadrant. A forecast added
 *               after the outcome is refused, not scored.
 *   3. ROLL UP  Wilson-bounded pooled rates, a one-sided conformal lateness
 *               band and a shrunk outside view, partitioned by leadership span
 *               with primary + complementary suppression. Above the detail
 *               ceiling: identity-free counts and intervals only.
 *
 * WHAT THIS NEVER DOES. It never rates a person, invents an outcome, treats a
 * cancelled/released/deleted action as delivery, calls an association causal,
 * overwrites a leader's declared forecast, or silently prints a refused cell as
 * zero. Local seats are declarations, not authentication.
 */
import { addDays, dayKey, daysBetween } from '../time.js';
import { activeSeat, buildSeats } from './seat.js';
import { LEADER_ID } from './chain.js';
import { bundleExecution, executionOwnerNodeId } from './execution.js';
import {
  OUTCOME_ALTITUDE_QUESTIONS, OUTCOME_CHANGED_EVENT, OUTCOME_GRADE_STATES,
  OUTCOME_LABELS, OUTCOME_LIMITS, OUTCOME_METHOD, OUTCOME_VALUES,
  OUTCOME_VERDICTS, OUTCOME_VERSION,
} from './outcomeRegistry.js';
import {
  brierPair, conformalUpper, outcomeConventions, outcomeVerdict,
  outsideViewFromGrades, pooledBrier, suppressedCells,
} from './outcomePrior.js';

const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
/** Local FNV-1a pair; avoids importing the action-bundle graph into the tempo engine. */
export function outcomeFingerprint(value) {
  const s = JSON.stringify(canonical(value));
  let a = 0x811c9dc5; let b = 0x9e3779b9;
  for (let i = 0; i < s.length; i += 1) {
    a = Math.imul(a ^ s.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ s.charCodeAt(i), 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
const round = (v, places = 1) => Number.isFinite(v) ? Math.round(v * 10 ** places) / 10 ** places : null;
const validDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
export const outcomeContractId = (bundleId) => `olc-${String(bundleId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`;
export const outcomeGradeId = (contractId) => `olg-${String(contractId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`;

const POINTER_TYPES = Object.freeze({
  decision: 'decision', delegation: 'delegation', premise: 'premise',
  budget: 'budget', comms: 'comms', coaching: 'person',
});

/** Derive the immutable expectation from REVIEWED COMMANDS, never from outcomes. */
export function contractForBundle(state, bundle, now = new Date()) {
  if (!bundle || bundle.status !== 'committed') return null;
  const source = (state.cases || []).find((c) => c.id === bundle.sourceId) || null;
  const built = buildSeats(state, { now, settings: state.settings });
  const ownerNodeId = executionOwnerNodeId(source, built);
  const commands = Array.isArray(bundle.commands) ? bundle.commands : [];
  const outputs = Array.isArray(bundle.outputs) ? bundle.outputs : [];
  const declaredOn = validDay((bundle.committedAt || '').slice(0, 10)) || dayKey(now);
  const dueDates = commands.map((c) => validDay(c.dueOn)).filter(Boolean).sort();
  const horizonOn = validDay(bundle.reviewOn) || dueDates.at(-1) || addDays(declaredOn, 30);
  const decisionCommand = commands.find((c) => c.kind === 'decision');
  const premiseCommand = commands.find((c) => c.kind === 'premise');
  const declaredPct = (c) => { const n = Number(c?.priorPct); return Number.isFinite(n) && n >= 5 && n <= 95 ? round(n, 1) : null; };
  const forecastPct = declaredPct(decisionCommand) ?? declaredPct(premiseCommand);
  const forecastSource = forecastPct === null ? 'none'
    : declaredPct(decisionCommand) !== null ? 'decision-command' : 'premise-command';
  const budgetCommand = commands.find((c) => c.kind === 'budget');
  const envelope = budgetCommand ? (state.budgets || []).find((b) => b.id === budgetCommand.budgetId) : null;
  const amount = Number(budgetCommand?.amount);
  const expectedSpend = envelope && Number.isFinite(amount) && amount > 0
    ? [{ currency: String(envelope.currency || 'USD').toUpperCase().slice(0, 6), amount: round(amount, 2) }] : [];
  const sourcePointers = [{ type: 'case', id: bundle.sourceId }, ...outputs.slice(0, OUTCOME_LIMITS.pointers - 1).map((o) => ({
    type: POINTER_TYPES[o.kind] || null,
    id: o.kind === 'budget' ? (o.budgetId || o.id) : o.id,
  })).filter((p) => p.type && p.id)].slice(0, OUTCOME_LIMITS.pointers);
  const value = {
    id: outcomeContractId(bundle.id), bundleId: bundle.id, sourceCaseId: bundle.sourceId,
    ownerNodeId, declaredOn, horizonOn, forecastPct, forecastSource,
    expectedActions: outputs.length, expectedSpend, sourcePointers,
    version: OUTCOME_VERSION, status: 'open', closedOn: null, gradedOn: null,
    priorDeclaredOn: null, priorDeclaredBy: null,
  };
  return { ...value, fingerprint: outcomeFingerprint({ ...value, committedAt: bundle.committedAt || null }),
    createdAt: bundle.committedAt || new Date(now).toISOString() };
}

/** A human may pre-register a probability for a loop adopted without one. */
export function declareContractPrior(contract, { forecastPct, declaredOn, seatId, now = new Date() } = {}) {
  if (!contract || contract.status !== 'open') return { ok: false, error: 'Only an open frozen expectation can be pre-registered.' };
  const pct = Number(forecastPct);
  if (!Number.isFinite(pct) || pct < 5 || pct > 95) return { ok: false, error: 'Declare a probability from 5 to 95%. Zero and one are not defensible forecasts.', field: 'forecastPct' };
  const day = validDay(declaredOn) || dayKey(now);
  if (validDay(contract.horizonOn) && day > contract.horizonOn) return { ok: false, error: 'The declaration is later than the frozen horizon. A forecast written after its window is hindsight, not foresight.' };
  const next = { ...contract, forecastPct: round(pct, 1), forecastSource: 'human', priorDeclaredOn: day, priorDeclaredBy: seatId || null };
  return { ok: true, contract: { ...next, fingerprint: outcomeFingerprint(next) } };
}

/** Grade EXACTLY ONCE from terminal evidence + a human tri-state outcome. */
export function gradeForContract(state, contract, now = new Date(), settings = {}) {
  if (!contract || contract.status !== 'open') return { ok: false, error: 'This expectation has already been graded or refused.' };
  const bundle = (state.actionBundles || []).find((b) => b.id === contract.bundleId);
  if (!bundle || bundle.status !== 'committed') return { ok: false, error: 'The adopted response no longer exists. Its history was not erased.' };
  const execution = bundleExecution(state, bundle, now);
  if (!execution || execution.state !== 'closed') {
    return { ok: false, error: 'The execution loop is not closed on dated evidence. A missing, returned, cancelled or deleted action is never counted as delivery.' };
  }
  const closedOn = validDay(execution.closedOn);
  if (!closedOn || closedOn < contract.declaredOn) return { ok: false, error: 'The closure date is missing or precedes adoption.' };
  const decisionOutput = (bundle.outputs || []).find((o) => o.kind === 'decision');
  const decision = decisionOutput ? (state.decisions || []).find((d) => d.id === decisionOutput.id) : null;
  const humanOutcome = decision && ['good', 'mixed', 'bad'].includes(decision.outcome) && decision.reviewedOn && decision.chosen ? decision.outcome : null;
  const reviewedOn = decision ? validDay(decision.reviewedOn) : null;
  // `closedOn` is itself the maximum of all terminal evidence dates, including
  // this decision review, so comparing the review to it is vacuous. The two
  // REAL integrity tests are: no future-dated human review, and no review that
  // postdates the human case resolution that closed the underlying situation.
  // A back-dated or later-edited outcome can never become foresight.
  if (reviewedOn && reviewedOn > dayKey(now)) {
    return { ok: false, error: 'The human outcome review postdates the grading clock; the record is inconsistent.' };
  }
  const caseClosedOn = validDay(execution.caseResolvedOn);
  if (reviewedOn && caseClosedOn && reviewedOn > caseClosedOn) {
    return { ok: false, error: 'The human outcome review postdates the case closure; the record is inconsistent.' };
  }
  const common = {
    id: outcomeGradeId(contract.id), contractId: contract.id, bundleId: contract.bundleId,
    ownerNodeId: contract.ownerNodeId, gradedOn: dayKey(now), closedOn,
    cycleDays: daysBetween(contract.declaredOn, closedOn),
    horizonDays: validDay(contract.horizonOn) ? daysBetween(contract.declaredOn, contract.horizonOn) : null,
    version: OUTCOME_VERSION,
  };
  common.delayDays = common.horizonDays === null ? null : common.cycleDays - common.horizonDays;
  // A refusal is a real one-shot answer. Nothing may be re-scored later with a
  // probability somebody wrote after learning the outcome.
  if (contract.forecastPct === null || !humanOutcome || !reviewedOn || reviewedOn < contract.declaredOn) {
    const reason = contract.forecastPct === null
      ? 'No probability was frozen at adoption. A forecast declared after the outcome is hindsight, not foresight.'
      : !humanOutcome ? 'No governed decision in this response has a dated human outcome review.'
        : 'The outcome review is undated or predates adoption.';
    const grade = { ...common, status: 'ungradable', outcome: null, outcomeValue: null, forecastPct: null,
      brier: null, baseBrier: null, skill: null, fidelityPct: null, verdict: 'ungradable', reason,
      fingerprint: outcomeFingerprint({ ...common, status: 'ungradable', reason }) };
    return { ok: true, grade, refused: true };
  }
  const outcomeValue = OUTCOME_VALUES[humanOutcome];
  const pair = brierPair(contract.forecastPct, outcomeValue);
  const fidelityPct = execution.total > 0 ? round((execution.counts.fulfilled / execution.total) * 100, 1) : null;
  if (!pair || fidelityPct === null) return { ok: false, error: 'The frozen expectation or the delivery denominator is unreadable.' };
  const conv = outcomeConventions(settings);
  const verdict = outcomeVerdict({ outcomeValue, fidelityPct, fidelityFloorPct: conv.fidelityFloorPct });
  const grade = { ...common, status: 'graded', outcome: humanOutcome, outcomeValue,
    forecastPct: round(contract.forecastPct, 1), brier: pair.brier, baseBrier: pair.baseBrier,
    skill: pair.skill, fidelityPct, verdict,
    reason: `${OUTCOME_LABELS[humanOutcome]} outcome on ${fidelityPct}% delivered actions; ${common.delayDays === null ? 'no dated horizon' : `${common.delayDays} day(s) past the frozen horizon`}. Association, not causation.`,
    fingerprint: '' };
  grade.fingerprint = outcomeFingerprint({ ...grade, executionFingerprint: execution.fingerprint, reviewedOn });
  return { ok: true, grade, refused: false, execution };
}

const inScope = (rows, seat) => rows.filter((r) => r.ownerNodeId === seat.id || seat.scope.has(r.ownerNodeId));

/** Resolve a seat using the same drill-down/drill-up boundary as Mission Control. */
export function outcomeSeat(state, { now = new Date(), seatId = null } = {}) {
  const built = buildSeats(state, { now, settings: state.settings });
  const acting = activeSeat(built);
  let seat = acting;
  if (seatId && seatId !== acting.id) {
    const target = built.byId.get(seatId);
    if (!target) return { ok: false, error: 'That span is not a leadership seat in this roster.', built, acting };
    let ancestor = false; let cursor = acting.parentId; let guard = 0;
    while (cursor && guard < 64) {
      if (cursor === seatId) { ancestor = true; break; }
      cursor = built.chain.nodes.get(cursor)?.parentId || null; guard += 1;
    }
    if (!acting.fullAccess && !acting.descendantSeatIds.includes(seatId) && !ancestor) {
      return { ok: false, error: 'That span is outside the operating seat. Drill-up/down is allowed; sideways access is not.', built, acting };
    }
    seat = target;
  }
  if (seat.readOnly) return { ok: false, error: 'Declare a valid operating seat before reading the learning ledger.', built, acting };
  return { ok: true, built, acting, seat, detail: acting.fullAccess || (acting.rank <= 2 && (seat.id === acting.id || acting.descendantSeatIds.includes(seat.id))) };
}

/** The complete, altitude-appropriate read model. Pure: no writes, no DOM. */
export function buildOutcomeReport(state, { now = new Date(), seatId = null, settings = null } = {}) {
  const conv = outcomeConventions(settings || state.settings || {});
  const resolved = outcomeSeat(state, { now, seatId });
  if (!resolved.ok) return resolved;
  const { built, acting, seat, detail } = resolved;
  const rank = seat.rank || 5;
  const contracts = inScope(normalizeContractsForRead(state.outcomeContracts), seat);
  const grades = inScope(normalizeGradesForRead(state.outcomeGrades), seat);
  const gradeByContract = new Map(grades.map((g) => [g.contractId, g]));
  const items = contracts.map((c) => {
    const g = gradeByContract.get(c.id);
    const stale = c.status === 'open' && validDay(c.horizonOn)
      && daysBetween(addDays(c.horizonOn, conv.staleDays), dayKey(now)) !== null
      && daysBetween(addDays(c.horizonOn, conv.staleDays), dayKey(now)) >= 0;
    return { ownerNodeId: c.ownerNodeId, graded: Boolean(g), good: Boolean(g && g.status === 'graded' && g.outcomeValue >= 0.5),
      late: Boolean(g && Number.isFinite(g.delayDays) && g.delayDays > 0), stale, contract: c, grade: g || null };
  });
  const groups = seat.childSeatIds.map((id) => {
    const child = built.byId.get(id);
    return { key: id, label: child?.label ? `${child.label} span` : 'Child span', seatId: id, rank: child?.rank ?? null,
      rows: items.filter((i) => i.ownerNodeId === id || child?.scope.has(i.ownerNodeId)) };
  });
  groups.push({ key: '__direct__', label: 'Loops owned at this altitude', seatId: null, rank,
    rows: items.filter((i) => i.ownerNodeId === seat.id) });
  const hierarchy = suppressedCells(groups, { floor: conv.minCell, detail });
  const graded = grades.filter((g) => g.status === 'graded');
  const delays = graded.map((g) => g.delayDays).filter((n) => Number.isFinite(n));
  const outside = outsideViewFromGrades(grades, settings || state.settings || {});
  const pooled = pooledBrier(grades, { minGrades: conv.minGrades });
  const band = conformalUpper(delays, { coverage: conv.conformalCoverage, minN: conv.minGrades });
  // Above the individual-detail ceiling even the exact COUNTS are withheld:
  // only the suppressed hierarchy intervals may travel upward.
  const counts = detail ? { contracts: contracts.length, open: contracts.filter((c) => c.status === 'open').length,
    graded: graded.length, ungradable: grades.filter((g) => g.status === 'ungradable').length,
    stale: items.filter((i) => i.stale).length }
    : { contracts: null, open: null, graded: null, ungradable: null, stale: null };
  return {
    ok: true, engineVersion: OUTCOME_VERSION, generatedOn: dayKey(now), seatId: seat.id, actingSeatId: acting.id,
    rank, detail, enforced: !acting.fullAccess, question: OUTCOME_ALTITUDE_QUESTIONS[rank] || OUTCOME_ALTITUDE_QUESTIONS[5],
    conventions: conv, counts, outside, pooled, band, hierarchy, method: OUTCOME_METHOD,
    rows: detail ? items.map((i) => ({ id: i.contract.id, bundleId: i.contract.bundleId, sourceCaseId: i.contract.sourceCaseId,
      declaredOn: i.contract.declaredOn, horizonOn: i.contract.horizonOn, forecastPct: i.contract.forecastPct,
      forecastSource: i.contract.forecastSource, expectedActions: i.contract.expectedActions,
      status: i.contract.status, stale: i.stale, verdict: i.grade?.verdict || null,
      outcome: i.grade?.outcome || null, brier: i.grade?.brier ?? null, skill: i.grade?.skill ?? null,
      fidelityPct: i.grade?.fidelityPct ?? null, delayDays: i.grade?.delayDays ?? null,
      reason: i.grade?.reason || null, route: `#/bundles?bundle=${encodeURIComponent(i.contract.bundleId)}` })) : [],
  };
}

/** Defensive: readers never trust a stored row that a corrupt blob could carry. */
function normalizeContractsForRead(rows) {
  return (Array.isArray(rows) ? rows : []).filter((c) => c && typeof c.id === 'string' && typeof c.bundleId === 'string'
    && typeof c.ownerNodeId === 'string' && validDay(c.declaredOn)
    && (c.forecastPct === null || (Number.isFinite(c.forecastPct) && c.forecastPct >= 5 && c.forecastPct <= 95)));
}
function normalizeGradesForRead(rows) {
  return (Array.isArray(rows) ? rows : []).filter((g) => g && typeof g.contractId === 'string'
    && typeof g.ownerNodeId === 'string' && OUTCOME_GRADE_STATES.includes(g.status)
    && OUTCOME_VERDICTS.includes(g.verdict));
}

export const displayBound = (b) => !b || b.lower === null || b.upper === null ? 'Withheld'
  : b.lower === b.upper ? String(b.lower) : `${b.lower}–${b.upper}`;

/** Identity-free upward brief. No ids, titles, notes, persons or proof pointers. */
export function outcomeBriefText(report) {
  if (!report?.ok) return `# LeadOS · outcome learning brief\n\nRefused: ${report?.error || 'the reading is unavailable.'}`;
  const h = report.hierarchy.totals; const o = report.outside; const p = report.pooled; const b = report.band;
  return [
    `# LeadOS · outcome learning brief — ${report.generatedOn}`,
    `Altitude ${report.rank} · ${report.question}`,
    '',
    '## Recorded position',
    `- Frozen expectations in scope: ${displayBound(h.loops)}`,
    `- Graded once: ${displayBound(h.graded)}`,
    `- Good or mixed outcome: ${displayBound(h.good)}`,
    `- Past the declared horizon: ${displayBound(h.late)}`,
    `- Open expectations: ${report.detail ? report.counts.open : 'withheld'}; past the stale window: ${report.detail ? report.counts.stale : 'withheld'}`,
    `- Refused one-shot grades: ${report.detail ? report.counts.ungradable : 'withheld'}`,
    '',
    '## Calibration',
    o.status === 'published'
      ? `- Outside view: ${o.pct}% (95% Wilson ${o.loPct}–${o.hiPct}%), ${o.n} graded loop(s), shrunk toward 50% by ${o.shrinkK}. Direction: ${o.direction} (${o.gapPp} pp).`
      : `- Outside view REFUSED: ${o.reason}`,
    p.status === 'published' ? `- Pooled Brier ${p.brier} vs strictly-prior base ${p.baseBrier}; skill ${p.skill === null ? 'undefined (every outcome was 0.5)' : p.skill}.`
      : `- Pooled skill REFUSED: ${p.reason}`,
    b.status === 'published' ? `- One-sided conformal lateness bound: ${b.upperDays} day(s) at finite-sample coverage ${b.coverage}, ${b.n} graded loops.`
      : `- Conformal band REFUSED: ${b.reason}`,
    '',
    '## Disclosure', report.hierarchy.method, report.method.disclosure,
    '', '## Method', report.method.scoring, report.method.conformal, report.method.outsideView, report.method.causal,
  ].join('\n');
}

/** Detail-only receipt. Never offered above the individual-detail ceiling. */
export function outcomeReceiptText(contract, grade) {
  if (!contract) return 'No frozen expectation exists for this response.';
  return [
    `# LeadOS · outcome learning receipt`, `Frozen on: ${contract.declaredOn}`,
    `Horizon: ${contract.horizonOn || 'not declared'}`, `Declared probability: ${contract.forecastPct === null ? 'none (ungradable)' : `${contract.forecastPct}%`}`,
    `Forecast source: ${contract.forecastSource}`, `Planned actions: ${contract.expectedActions}`,
    `Planned money: ${contract.expectedSpend.length ? contract.expectedSpend.map((s) => `${s.currency} ${s.amount}`).join(' · ') : 'none'}`,
    `Status: ${contract.status}`,
    ...(grade ? [`Graded on: ${grade.gradedOn}`, `Outcome: ${grade.outcome || 'refused'}`,
      `Brier: ${grade.brier ?? 'refused'} · base: ${grade.baseBrier ?? 'refused'} · skill: ${grade.skill ?? 'refused'}`,
      `Delivery fidelity: ${grade.fidelityPct ?? 'refused'}%`, `Days past horizon: ${grade.delayDays ?? 'not declared'}`,
      `Quadrant: ${grade.verdict}`, `Reason: ${grade.reason}`] : ['No one-shot grade has been recorded yet.']),
    '', 'A refused cell is BLANK, never zero. This is software reconciliation and association, not a causal claim about business benefit.',
  ].join('\n');
}

export function outcomeAttentionCount(state, now = new Date()) {
  const report = buildOutcomeReport(state, { now });
  if (!report.ok) return 0;
  // Attention is a scalar derived from the raw dated declarations, not from an
  // exact published count. A senior seat can be told "something needs a scan"
  // without being handed the small-cell number behind it.
  const conv = outcomeConventions(state.settings || {});
  const stale = (Array.isArray(state.outcomeContracts) ? state.outcomeContracts : []).filter((c) => c && c.status === 'open'
    && validDay(c.horizonOn) && (daysBetween(addDays(c.horizonOn, conv.staleDays), dayKey(now)) ?? -1) >= 0).length;
  return (stale ? 1 : 0) + (report.outside.status === 'published' && report.outside.material ? 1 : 0)
    + (report.band.status === 'published' && report.band.upperDays > 0 ? 1 : 0);
}

export const OUTCOME_CSV_COLUMNS = Object.freeze(['row_kind', 'scope', 'altitude', 'loops_n', 'loops_lo', 'loops_hi',
  'graded_n', 'graded_lo', 'graded_hi', 'good_n', 'good_lo', 'good_hi', 'late_n', 'late_lo', 'late_hi',
  'open_n', 'refused_n', 'suppressed', 'outside_pct', 'outside_lo_pct', 'outside_hi_pct', 'declared_pct',
  'observed_pct', 'gap_pp', 'direction', 'brier', 'base_brier', 'skill', 'band_days', 'band_coverage',
  'conformal_n', 'verdict', 'refused', 'reason_code']);

/**
 * CSV scope #101 — aggregate-only, identity-free, refusal-honest. No bundle id,
 * case id, person, span id, title, note, forecast source text or proof pointer
 * is ever emitted. A refused statistic and a suppressed cell are BLANK (null),
 * never zero. Small cells are withheld from the exported row too: exporting what
 * the screen withheld would defeat the disclosure boundary.
 */
export function outcomeCsvRows(report) {
  if (!report?.ok) return [];
  const blank = (n) => Number.isFinite(n) ? n : null;
  const o = report.outside; const p = report.pooled; const b = report.band;
  const calibration = {
    outside_pct: o.status === 'published' ? blank(o.pct) : null,
    outside_lo_pct: o.status === 'published' ? blank(o.loPct) : null,
    outside_hi_pct: o.status === 'published' ? blank(o.hiPct) : null,
    declared_pct: o.status === 'published' ? blank(o.declaredPct) : null,
    observed_pct: o.status === 'published' ? blank(o.observedPct) : null,
    gap_pp: o.status === 'published' ? blank(o.gapPp) : null,
    direction: o.status === 'published' ? o.direction : null,
    brier: p.status === 'published' ? blank(p.brier) : null,
    base_brier: p.status === 'published' ? blank(p.baseBrier) : null,
    skill: p.status === 'published' ? blank(p.skill) : null,
    band_days: b.status === 'published' ? blank(b.upperDays) : null,
    band_coverage: b.status === 'published' ? blank(b.coverage) : null,
    conformal_n: b.status === 'published' ? blank(b.n) : null,
    refused: o.status !== 'published' || p.status !== 'published' || b.status !== 'published' ? 'yes' : '',
    reason_code: [o.status !== 'published' ? `outside:${o.n}/${o.minGrades}` : null,
      p.status !== 'published' ? `skill:${p.n}/${p.minGrades}` : null,
      b.status !== 'published' ? `band:${b.n}` : null].filter(Boolean).join('|') || '',
  };
  const t = report.hierarchy.totals;
  const rows = [{ row_kind: 'workspace', scope: 'workspace', altitude: report.rank,
    loops_lo: blank(t.loops.lower), loops_hi: blank(t.loops.upper),
    graded_lo: blank(t.graded.lower), graded_hi: blank(t.graded.upper),
    good_lo: blank(t.good.lower), good_hi: blank(t.good.upper),
    late_lo: blank(t.late.lower), late_hi: blank(t.late.upper),
    open_n: blank(report.counts.open), refused_n: blank(report.counts.ungradable),
    suppressed: report.hierarchy.suppressedN || '', ...calibration }];
  report.hierarchy.cells.forEach((c, index) => {
    const hidden = c.suppressed;
    rows.push({ row_kind: 'span', scope: `span-${index + 1}`, altitude: blank(c.rank),
      loops_lo: blank(c.loops.lower), loops_hi: blank(c.loops.upper),
      graded_lo: blank(c.graded.lower), graded_hi: blank(c.graded.upper),
      good_lo: blank(c.good.lower), good_hi: blank(c.good.upper),
      late_lo: blank(c.late.lower), late_hi: blank(c.late.upper),
      suppressed: hidden ? 'yes' : '', verdict: null,
      ...(hidden ? { refused: 'yes', reason_code: c.secondary ? 'complementary-suppression' : 'small-cell-suppression' } : {}) });
  });
  rows.push({ row_kind: 'calibration', scope: 'workspace', altitude: report.rank, ...calibration });
  rows.push({ row_kind: 'method', scope: 'workspace', altitude: report.rank,
    refused: '', reason_code: 'exchangeability-declared-not-proven', verdict: 'association-not-causation' });
  return rows;
}

export { OUTCOME_CHANGED_EVENT };
