/**
 * ADR-0107 — reviewed commands for the Outcome Learning Loop.
 *
 * Every write passes the same declared-seat gateway as a direct API call.
 * Reads are SAFE_READS in `accessGateway.js` but STILL enforce the disclosure
 * ceiling inside `buildOutcomeReport`: a senior seat can never ask for the
 * detail projection by calling a different method. The one-shot grader is never
 * callable from the UI — grading is a rule on the shared spine, driven by dated
 * evidence, so no human can grade their own forecast early or twice.
 */
import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { guardApiCall } from './accessGateway.js';
import { outcomeConventions } from './outcomePrior.js';
import {
  buildOutcomeReport, declareContractPrior, outcomeAttentionCount,
  outcomeBriefText, outcomeCsvRows, outcomeReceiptText,
} from './outcomeLearning.js';
import {
  OUTCOME_PRIOR_EVENT, OUTCOME_SCAN_EVENT, OUTCOME_VERDICT_LABELS,
} from './outcomeRegistry.js';
import { normalizeOutcomeSettings } from './outcomeSchema.js';

export function createOutcomeActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const saved = (extra = {}) => ({ ok: true, ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [] });
  const guarded = (name, ...args) => {
    const verdict = guardApiCall(store.state, name, args, new Date(now()).getTime());
    return verdict.ok ? verdict : verdict;
  };
  const reportFor = (seatId = null) => buildOutcomeReport(store.state, { now: now(), seatId });
  const seatFor = (action, { fullAccess = false } = {}) => {
    const built = buildSeats(store.state, { now: now(), settings: store.state.settings });
    const seat = activeSeat(built);
    const right = canAct(action, seat);
    if (!right.allow) return { ok: false, error: right.reason };
    if (fullAccess && !seat.fullAccess) return { ok: false, error: 'Re-declaring conventions is an enterprise act. Declare the full-access root seat; a scoped span may run a scan but not move every ledger at once.' };
    return { ok: true, seat, built };
  };

  return {
    /* ------------------------------------------------------------- pure reads */
    outcomeRead(seatId = null) { return reportFor(seatId); },
    outcomeBriefText(seatId = null) { const r = reportFor(seatId); return r.ok ? { ok: true, text: outcomeBriefText(r), report: r } : r; },
    outcomeCsvRows() { const r = reportFor(); return r.ok ? { ok: true, rows: outcomeCsvRows(r), columns: r.columns || null } : r; },
    outcomeAttentionCount() { return outcomeAttentionCount(store.state, now()); },
    outcomeConventions() { return { ok: true, ...outcomeConventions(store.state.settings || {}) }; },
    outcomeSignals() {
      const r = reportFor();
      if (!r.ok) return [];
      const signals = [];
      if (r.counts.stale) signals.push({ ruleId: 'OLN-03', detail: `${r.counts.stale} frozen expectation(s) are past the declared stale window.`, evidence: 'Open contracts with dated horizons', action: { label: 'Run learning scan', route: '#/mission?panel=learning' } });
      if (r.outside.status === 'published' && r.outside.material) signals.push({ ruleId: 'OLN-04', detail: `Declared confidence is ${r.outside.direction} by ${r.outside.gapPp} pp against ${r.outside.n} graded loop(s).`, evidence: 'Pooled Brier + Wilson interval', action: { label: 'Read calibration', route: '#/mission?panel=learning' } });
      if (r.band.status === 'published' && r.band.upperDays > 0) signals.push({ ruleId: 'OLN-BAND', detail: `One-sided conformal lateness bound ${r.band.upperDays} day(s) at coverage ${r.band.coverage}.`, evidence: `${r.band.n} graded loops; exchangeability declared`, action: { label: 'Read method', route: '#/mission?panel=learning&tab=method' } });
      return signals;
    },
    outcomeReceipt(bundleId) {
      const r = reportFor(); if (!r.ok) return r;
      if (!r.detail) return fail('Outcome receipts carry individual proof pointers. This altitude receives the identity-free aggregate, not a receipt.');
      const contract = (store.state.outcomeContracts || []).find((c) => c.bundleId === bundleId);
      if (!contract) return fail('No frozen expectation exists for that response.');
      if (!r.rows.some((row) => row.bundleId === bundleId)) return fail('That response is outside this operating span.');
      const grade = (store.state.outcomeGrades || []).find((g) => g.contractId === contract.id) || null;
      return { ok: true, text: outcomeReceiptText(contract, grade), contract, grade,
        verdictLabel: grade ? OUTCOME_VERDICT_LABELS[grade.verdict] : null };
    },

    /* ----------------------------------------------------------- reviewed writes */
    outcomeScan() {
      const gate = guarded('outcomeScan'); if (!gate.ok) return gate;
      store.update(() => {}, { type: OUTCOME_SCAN_EVENT, entity: 'workspace', entityId: '',
        summary: 'Explicit outcome-learning scan: freeze, one-shot grade, stale and calibration governance' });
      return saved({ report: reportFor() });
    },
    setOutcomeAutoLearn(enabled) {
      const gate = guarded('setOutcomeAutoLearn', enabled); if (!gate.ok) return gate;
      const value = enabled !== false;
      store.update((d) => { d.settings.outcomeAutoLearn = value; }, { type: 'outcome.auto_set', entity: 'workspace', entityId: '',
        summary: `Automatic outcome learning ${value ? 'resumed' : 'paused'}; explicit scans remain available` });
      return saved({ outcomeAutoLearn: value });
    },
    /** A probability may be PRE-REGISTERED, never added after a human outcome. */
    outcomeDeclarePrior(bundleId, forecastPct) {
      const gate = guarded('outcomeDeclarePrior', bundleId, forecastPct); if (!gate.ok) return gate;
      const r = reportFor(); if (!r.ok) return r;
      if (!r.detail) return fail('A pre-registration belongs to the individual-detail span that adopted the response.');
      const contract = (store.state.outcomeContracts || []).find((c) => c.bundleId === bundleId);
      if (!contract) return fail('No frozen expectation exists for that response. Adopt or scan first.');
      if (!r.rows.some((row) => row.bundleId === bundleId)) return fail('That response is outside this operating span.');
      if ((store.state.outcomeGrades || []).some((g) => g.contractId === contract.id)) return fail('This loop already has a one-shot grade. The frozen expectation cannot be rewritten.');
      if (contract.priorDeclaredOn) return fail('A human probability has already been pre-registered for this loop. One declaration only.');
      const bundle = (store.state.actionBundles || []).find((b) => b.id === bundleId);
      const decisionOutput = (bundle?.outputs || []).find((o) => o.kind === 'decision');
      const decision = decisionOutput ? (store.state.decisions || []).find((d) => d.id === decisionOutput.id) : null;
      if (decision?.reviewedOn) return fail('The outcome has already been reviewed. A probability declared now would be hindsight, not foresight.');
      const next = declareContractPrior(contract, { forecastPct, declaredOn: dayKey(now()), seatId: r.actingSeatId, now: now() });
      if (!next.ok) return next;
      store.update((d) => {
        const target = (d.outcomeContracts || []).find((c) => c.id === contract.id);
        if (target) Object.assign(target, next.contract);
      }, { type: OUTCOME_PRIOR_EVENT, entity: 'bundle', entityId: bundleId,
        summary: `Probability ${next.contract.forecastPct}% pre-registered before any human outcome review; one declaration only` });
      return saved({ contract: next.contract, report: reportFor() });
    },
    /** Declared, clamped conventions. Rank-gated AND full-access seated. */
    outcomeSetConventions(patch = {}) {
      const gate = guarded('outcomeSetConventions', patch); if (!gate.ok) return gate;
      const right = seatFor('govern-outcome-learning', { fullAccess: true }); if (!right.ok) return fail(right.error);
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Declare a bounded convention patch.', 'patch');
      const allowed = ['outcomeMinGrades', 'outcomeMinCell', 'outcomeShrinkK', 'outcomeStaleDays',
        'outcomeMaterialityPp', 'outcomeConformalCoverage', 'outcomeFidelityFloorPct'];
      const unknown = Object.keys(patch).filter((k) => !allowed.includes(k));
      if (unknown.length) return fail(`Unknown convention(s): ${unknown.join(', ')}.`, 'patch');
      const next = normalizeOutcomeSettings({ ...store.state.settings, ...patch });
      const changed = allowed.filter((k) => store.state.settings?.[k] !== next[k]);
      store.update((d) => { for (const key of allowed) d.settings[key] = next[key]; }, {
        type: 'outcome.conventions_set', entity: 'workspace', entityId: '',
        summary: `Outcome-learning conventions re-declared: ${changed.length ? changed.join(', ') : 'no change'}; all values clamped to declared bands`,
      });
      return saved({ conventions: next, changed, report: reportFor() });
    },
  };
}
