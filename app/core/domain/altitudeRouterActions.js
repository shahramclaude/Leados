/**
 * app/core/domain/altitudeRouterActions.js — API mixin for the Altitude Router
 * (Schema v88, ADR-0081). Mounted via `Object.assign(api, ...)` exactly like
 * `createMissionActions`, so no second command bus is introduced.
 *
 * Every operational write reuses the production `addCase` adoption seam: the
 * case, the plan confirmation, the ledger row and every cross-module rule fire
 * in ONE atomic transaction. The router never writes a case by hand.
 */
import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { ALTITUDE_KEYS, altitudeRank } from './chainRegistry.js';
import {
  analyzeRouting, resolveSeatPath, routingCaseInput, routerPlanRecord, routingRead,
  routingBriefText, routingCsvRows, routingAttentionCount,
} from './altitudeRouter.js';
import { normalizeRouterPlans, normalizeRouterSettings } from './altitudeRouterSchema.js';
import { ROUTER_EVENTS, ROUTER_LIMITS } from './altitudeRouterRegistry.js';
import { guardApiCall } from './accessGateway.js';

export function createAltitudeRouterActions(store, { now, idFactory, createApi }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({ ok: true, ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [] });
  const settings = () => store.state.settings || {};

  /** Fail-closed seat check: a declared seat cannot route outside its subtree. */
  function seatCheck(plan = null) {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.fullAccess) return null;
    const right = canAct('route-intake', seat);
    if (!right.allow) return fail(right.reason, 'scope');
    if (plan && plan.ownerSeatId !== seat.id && !seat.scope?.has(plan.ownerSeatId)) {
      return fail('This routing plan belongs to a span outside your operating seat. Escalate through the common leader instead of crossing a peer boundary.', 'scope');
    }
    return null;
  }

  const plans = () => (Array.isArray(store.state.altitudeRoutingPlans) ? store.state.altitudeRoutingPlans : []);
  const findPlan = (id) => plans().find((p) => p && p.id === id) || null;

  /** Recompute the plan fingerprint against current state; refuse stale orgs. */
  function fingerprintMatches(plan) {
    try {
      const report = analyzeRouting(plan.sourceText || '', store.state, { now: clock(), settings: settings() });
      return report.fingerprint === plan.fingerprint;
    } catch {
      return false;
    }
  }

  return {
    /** Pure preview — never persists. Safe on every keystroke. */
    routingAnalyze(text) {
      if (typeof text !== 'string' || text.length > ROUTER_LIMITS.noteChars) return fail(`Keep the situation note under ${ROUTER_LIMITS.noteChars} characters.`, 'text');
      return analyzeRouting(text, store.state, { now: clock(), settings: settings() });
    },

    /** Freeze a reviewed routing plan into the bounded ledger. */
    routingSaveDraft(text) {
      const gate = seatCheck(); if (gate) return gate;
      if (typeof text !== 'string' || text.trim().length < 4) return fail('Describe the situation in at least four characters.', 'text');
      if (text.length > ROUTER_LIMITS.noteChars) return fail(`Keep the situation note under ${ROUTER_LIMITS.noteChars} characters.`, 'text');
      if (plans().length >= ROUTER_LIMITS.plans) return fail('The routing ledger is full. Export an archive before continuing; no plan was silently deleted.', 'routingPlans');
      const report = analyzeRouting(text, store.state, { now: clock(), settings: settings() });
      if (report.resolved.ladderTruncated) return fail('The reporting path exceeds the supported eight-seat limit. No incomplete roll-up was saved.', 'scope');
      const record = { ...routerPlanRecord(report), id: idFactory('route'), createdAt: clock().toISOString(), updatedAt: clock().toISOString() };
      const warnings = [];
      const normalized = normalizeRouterPlans([record], warnings);
      if (warnings.length || normalized.length !== 1) return fail(warnings[0] || 'The routing plan could not be validated.');
      store.update((draft) => {
        draft.altitudeRoutingPlans = Array.isArray(draft.altitudeRoutingPlans) ? draft.altitudeRoutingPlans : [];
        draft.altitudeRoutingPlans.unshift(normalized[0]);
      }, { type: ROUTER_EVENTS.ANALYZED, entity: 'routingplan', entityId: record.id,
        summary: `Routing plan analyzed: ${record.detectedAltitudeKey || 'altitude refused'} at rank ${record.effectiveRank}, ${record.moduleRoutes.length} module route(s), ${record.seatPath.length} leadership altitude(s)` });
      return saved({ plan: findPlan(record.id), report });
    },

    /** One reviewed confirmation → case + cross-module fan-out + vertical roll-up. */
    routingConfirm(planId, input = {}) {
      const plan = findPlan(planId);
      if (!plan || plan.status !== 'analyzed') return fail('Choose a pending routing plan.', 'planId');
      const gate = seatCheck(plan); if (gate) return gate;
      if (plan.privacyBlocked) return fail('Confidential conflict language cannot be auto-routed. Open the confidential conflict workspace yourself.', 'privacy');
      if (!fingerprintMatches(plan)) return fail('The situation note, classification or reporting tree changed since this plan was saved. Re-analyze before confirming.', 'fingerprint');
      const confirmedAltitudeKey = input.confirmedAltitudeKey === undefined
        ? (plan.detectedAltitudeKey || 'frontline')
        : input.confirmedAltitudeKey;
      if (!ALTITUDE_KEYS.includes(confirmedAltitudeKey)) return fail('Choose a valid organizational altitude.', 'confirmedAltitudeKey');
      const report = analyzeRouting(plan.sourceText || '', store.state, { now: clock(), settings: settings() });
      const resolved = resolveSeatPath(store.state, { analysis: report.analysis,
        altitude: { detectedRank: altitudeRank(confirmedAltitudeKey) }, now: clock(), settings: settings() });
      if (resolved.ladderTruncated) return fail('The reporting path exceeds the supported eight-seat limit. No incomplete roll-up was written.', 'scope');
      const resolvedGate = seatCheck({ ownerSeatId: resolved.ownerSeatId }); if (resolvedGate) return resolvedGate;
      const caseInput = routingCaseInput(report, {
        title: input.title, summary: input.summary, ownerId: input.ownerId,
        involvedPersonIds: input.involvedPersonIds, reviewOn: input.reviewOn,
        fmeaSeverity: input.fmeaSeverity, autoPropagate: true,
      });
      const verdict = guardApiCall(store.state, 'addCase', [caseInput], new Date(now()).getTime());
      if (!verdict.ok) return verdict;
      const result = createApi(store, { now, idFactory }).addCase({
        ...caseInput,
        _routingPlan: { id: plan.id, confirmedAltitudeKey, fingerprint: plan.fingerprint },
      });
      if (!result.ok) return result;
      return saved({ caseId: result.id || result.caseId, planId: plan.id, result });
    },

    routingDismiss(planId, note = '') {
      const plan = findPlan(planId);
      if (!plan || plan.status !== 'analyzed') return fail('Choose a pending routing plan.', 'planId');
      const gate = seatCheck(plan); if (gate) return gate;
      store.update((draft) => {
        const row = (draft.altitudeRoutingPlans || []).find((p) => p.id === plan.id);
        if (!row) return;
        row.status = 'dismissed'; row.updatedAt = clock().toISOString(); row.gradeNote = String(note || '').slice(0, 400);
      }, { type: ROUTER_EVENTS.DISMISSED, entity: 'routingplan', entityId: plan.id,
        summary: 'Routing plan dismissed by a human; no case was created' });
      return saved({ planId });
    },

    /** Retrospective human grade: is the engine's detected altitude correct? */
    routingGrade(planId, correctAltitudeKey, note = '') {
      const plan = findPlan(planId);
      if (!plan || plan.status !== 'confirmed') return fail('Choose a confirmed routing plan.', 'planId');
      if (plan.gradedOn) return fail('This plan is already graded. A grade is written once.', 'planId');
      const gate = seatCheck(plan); if (gate) return gate;
      if (!ALTITUDE_KEYS.includes(correctAltitudeKey)) return fail('Choose the altitude the work actually belonged to.', 'correctAltitudeKey');
      const stamp = clock().toISOString();
      const onDay = dayKey(new Date(stamp));
      const correct = plan.detectedAltitudeKey === correctAltitudeKey;
      const overrideCorrect = plan.confirmedAltitudeKey === correctAltitudeKey;
      store.update((draft) => {
        const row = (draft.altitudeRoutingPlans || []).find((p) => p.id === plan.id);
        if (!row) return;
        row.gradedAltitudeKey = correctAltitudeKey; row.gradedOn = onDay;
        row.gradeNote = String(note || '').slice(0, 400);
        row.correct = correct; row.overrideCorrect = overrideCorrect;
        row.updatedAt = stamp;
      }, { type: ROUTER_EVENTS.GRADED, entity: 'routingplan', entityId: plan.id,
        summary: `Routing plan graded: judged ${correctAltitudeKey}; engine ${correct ? 'held' : 'did not hold'}` });
      return saved({ planId, correct, overrideCorrect, calibration: routingRead(store.state, { now: clock(), settings: settings() }).calibration });
    },

    /** Explicit scan always runs, even when automatic propagation is paused. */
    routingScan() {
      store.update(() => {}, { type: ROUTER_EVENTS.SCAN, entity: 'workspace', entityId: '',
        summary: 'Altitude Router reconciled the disclosure ladder and graded the routing ledger' });
      return saved({ report: routingRead(store.state, { now: clock(), settings: settings() }) });
    },

    routingSetConventions(values = {}) {
      const gate = seatCheck(); if (gate) return gate;
      const merged = normalizeRouterSettings({ ...settings(), ...values });
      store.update((draft) => { Object.assign(draft.settings, merged); },
        { type: 'routing.conventions_set', entity: 'workspace', entityId: '',
          summary: `Routing conventions updated: evidence floor ${merged.routingEvidenceFloor}, reliability floor ${merged.routingReliabilityFloorPct}%, evidence ${merged.routingCalibrationFloorN}, auto ${merged.routingAutoPropagate}` });
      return saved({ report: routingRead(store.state, { now: clock(), settings: settings() }) });
    },

    routingRead() { return routingRead(store.state, { now: clock(), settings: settings() }); },
    routingCalibration() { return routingRead(store.state, { now: clock(), settings: settings() }).calibration; },
    routingBriefText() { return { ok: true, text: routingBriefText(store.state, { now: clock(), settings: settings() }) }; },
    routingCsvRows() { return { ok: true, rows: routingCsvRows(store.state, { now: clock(), settings: settings() }) }; },
    routingAttentionCount() { return routingAttentionCount(store.state, clock(), settings()); },
  };
}
