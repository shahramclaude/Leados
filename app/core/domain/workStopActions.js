/**
 * app/core/domain/workStopActions.js — seat-checked human acts for ADR-0224.
 *
 * A work stop is a one-way, dated hold. The work lead can only record a
 * mitigation; the complete frozen joint-apex set must independently assess
 * that exact mitigation; and a separate affected operator must still confirm
 * restart. No API is named `clear` or `resume` because a screen action cannot
 * make a physical worksite safe.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildWorkStop,
  isAbove,
  resolveWorkStopAuthority,
  workStopMatrix,
  workStopParticipants,
} from './workStop.js';
import {
  normalizeWorkStopActs,
  normalizeWorkStops,
  swpInstant,
  swpLabel,
  swpText,
} from './workStopSchema.js';
import { SWP_EVENTS, SWP_HAZARD_KEYS, SWP_LIMITS as L, SWP_REFUSALS, SWP_RIGHTS, SWP_ROUTE } from './workStopRegistry.js';

const REFUSAL = (key) => `workStop:${key}`;

export function createWorkStopActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const list = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });

  function resolveSeat(right) {
    const at = clock();
    const cfg = settings();
    try {
      const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
      const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
      const seat = activeSeat(built);
      if (seat.readOnly) return fail(SWP_REFUSALS.notSeated);
      const rightResult = canAct(right, seat);
      if (!rightResult.allow) return fail(rightResult.reason);
      const actorId = seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null);
      return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
    } catch {
      return fail('The operating seat and Matrix lines could not be resolved. No work-stop act was accepted.', null, REFUSAL('seat-unreadable'));
    }
  }

  function readCheck() {
    const at = clock();
    const cfg = settings();
    try {
      const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
      const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
      const seat = activeSeat(built);
      if (seat.readOnly) return fail(SWP_REFUSALS.notSeated);
      const permission = canAct(SWP_RIGHTS.READ, seat);
      return permission.allow ? { ok: true, at, cfg, seat, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null) }
        : fail(permission.reason);
    } catch {
      return fail('The operating seat and Matrix lines could not be resolved. The stop-work reader is withheld.', null, REFUSAL('seat-unreadable'));
    }
  }

  function activePerson(id) {
    return list('people').find((person) => person && person.id === id && person.status !== 'archived') || null;
  }

  function reachable(check, id) {
    return Boolean(check.seat.fullAccess || check.seat.scope?.has?.(id) || check.seat.lineScope?.has?.(id) || check.actorId === id);
  }

  function firstPerson(check, claimedActorId = null, field = 'actorId', identityAttested = false) {
    if (check.seat.fullAccess && identityAttested !== true) {
      return fail('Confirm that you are the selected person and are recording your own act. This local assertion is not authentication.', 'identityAttested', REFUSAL('identity-attestation-required'));
    }
    const actorId = check.seat.fullAccess ? swpText(claimedActorId, 120) : check.actorId;
    if (!actorId || actorId === 'leader' || !activePerson(actorId)) {
      return fail('A first-person act needs an active roster person. The synthetic workspace operator is not a physical worker and cannot turn a safety key.', field, REFUSAL('actor-not-a-person'));
    }
    if (!check.seat.fullAccess && claimedActorId && claimedActorId !== actorId) {
      return fail('A declared leadership seat cannot act as another person. Switch to that person’s valid seat or use the configured identity flow.', field, REFUSAL('actor-seat-mismatch'));
    }
    check.actorId = actorId;
    return null;
  }

  function context(stopId, check) {
    const key = swpText(stopId, 120);
    if (!key) return fail('Name the stop-work record.', 'stopId', REFUSAL('stop-id-missing'));
    const stops = normalizeWorkStops(list('workStops'), []);
    const stop = stops.find((row) => row.id === key) || null;
    if (!stop) return fail(SWP_REFUSALS.notFound, 'stopId', REFUSAL('stop-not-found'));
    const acts = normalizeWorkStopActs(list('workStopActs'), stops, []);
    const report = buildWorkStop(store.state, { now: check.at, settings: check.cfg, seat: null, includeAll: true });
    const row = report.stopsAll.find((candidate) => candidate.id === key) || null;
    if (!row) return fail(SWP_REFUSALS.notFound, 'stopId', REFUSAL('stop-unreadable'));
    return { stop, acts: acts.filter((act) => act.stopId === key), row, stops };
  }

  function currentMatrix(check) {
    try { return workStopMatrix(store.state, check.at, check.cfg); } catch { return null; }
  }

  function requireCurrentAuthority(check, stop, matrix) {
    if (!matrix) return { ok: false, reason: 'matrix-unreadable' };
    const current = resolveWorkStopAuthority(matrix, workStopParticipants(stop));
    const frozen = stop.authorityIds;
    const equal = current.ok && frozen.length === current.authorityIds.length
      && frozen.every((id, index) => id === current.authorityIds[index]);
    return equal && stop.authorityReason === 'resolved' ? { ok: true, authorityIds: frozen }
      : { ok: false, reason: current.reason || 'matrix-authority-changed' };
  }

  function checkCanMitigate(check, stop, matrix) {
    if (check.actorId === stop.workLeadId) return true;
    if (!matrix || !matrix.nodes?.has(check.actorId) || !matrix.nodes?.has(stop.workLeadId)) return false;
    return Boolean(matrix.nodes.get(stop.workLeadId)?.ancestors?.has(check.actorId));
  }

  function actIntegrityFailure(row) {
    if (row.invalidActN > 0 || row.invalidRestartN > 0) {
      return fail('The stored act stream contains a malformed, unreadable, role-invalid or premature act. Preserve the hold; no further work-control, assessment or restart act is accepted. This release has no in-ledger repair action; use the supported data-recovery process.', 'stopId', REFUSAL('act-integrity'));
    }
    return null;
  }

  function noRestarted(row) {
    if (row.state === 'restarted') return fail(SWP_REFUSALS.restarted, 'stopId', REFUSAL('already-restarted'));
    return null;
  }

  function addAct(stop, row) {
    if (list('workStopActs').some((act) => act?.id === row.id)) return fail('The generated act identifier already exists. Nothing was saved; retry after the identifier source is repaired.', null, REFUSAL('act-id-collision'));
    if (list('workStopActs').length >= L.acts) return fail('The act ledger is full. Nothing was saved; retain the hold and raise an operations-system support issue.', null, REFUSAL('act-ledger-full'));
    const stops = normalizeWorkStops(list('workStops'), []);
    const loaded = normalizeWorkStopActs([...list('workStopActs'), row], stops, []);
    const stored = loaded.find((candidate) => candidate.id === row.id) || null;
    if (!stored || stored.stopId !== stop.id) return fail('The act cannot be stored as a row this ledger will read back. Nothing was saved.', null, REFUSAL('act-unreadable'));
    store.update((draft) => {
      draft.workStopActs = Array.isArray(draft.workStopActs) ? draft.workStopActs : [];
      draft.workStopActs.push(stored);
    }, {
      type: row.kind === 'mitigation' ? SWP_EVENTS.MITIGATED : row.kind === 'assessment' ? SWP_EVENTS.ASSESSED : SWP_EVENTS.OPERATOR_DECISION,
      entity: 'workStop',
      entityId: stop.id,
      summary: row.kind === 'mitigation'
        ? `A work-control mitigation was recorded for stop ${stop.id}, round ${row.round}.`
        : row.kind === 'assessment'
          ? `An independent work-stop assessment was recorded for stop ${stop.id}, round ${row.round}.`
          : `An affected-operator decision was recorded for stop ${stop.id}, round ${row.round}.`,
    });
    return saved({ stopId: stop.id, actId: row.id, round: row.round });
  }

  return {
    /** A human-declared hold. It is saved even when no joint authority resolves. */
    workStopDeclare(input = {}) {
      const check = resolveSeat(SWP_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const actorError = firstPerson(check, input.reporterId, 'reporterId', input.identityAttested);
      if (actorError) return actorError;
      const areaRef = swpLabel(input.areaRef);
      if (!areaRef) return fail(`Name the work area, asset or boundary (at least ${L.areaMin} characters).`, 'areaRef', REFUSAL('area-invalid'));
      const workSummary = swpText(input.workSummary, L.textMax);
      if (workSummary.length < L.textMin) return fail(`Describe the work being held in at least ${L.textMin} characters.`, 'workSummary', REFUSAL('work-summary-missing'));
      const hazardKind = SWP_HAZARD_KEYS.includes(input.hazardKind) ? input.hazardKind : null;
      if (!hazardKind) return fail('Choose one declared hazard category; the system never infers a category from prose.', 'hazardKind', REFUSAL('hazard-kind-invalid'));
      const hazardText = swpText(input.hazardText, L.textMax);
      if (hazardText.length < L.textMin) return fail(`Describe the specific observed condition in at least ${L.textMin} characters.`, 'hazardText', REFUSAL('hazard-description-missing'));
      const immediateControls = swpText(input.immediateControls, L.textMax);
      if (immediateControls.length < L.textMin) return fail(`State the immediate hold / control already applied in at least ${L.textMin} characters. Do not claim a physical isolation the record cannot verify.`, 'immediateControls', REFUSAL('initial-control-missing'));

      const workLeadId = swpText(input.workLeadId, 120);
      if (!activePerson(workLeadId)) return fail('Choose an active roster person responsible for this work. An unnamed work lead cannot be asked or verified.', 'workLeadId', REFUSAL('work-lead-invalid'));
      if (!reachable(check, workLeadId)) return fail('The work lead is outside the declared tree and Matrix lines this seat can reach. No line is inferred.', 'workLeadId', REFUSAL('work-lead-out-of-reach'));
      if (!Array.isArray(input.affectedPersonIds) || input.affectedPersonIds.length < L.participantsMin || input.affectedPersonIds.length > L.participantsMax) {
        return fail(`Select between ${L.participantsMin} and ${L.participantsMax} affected operators; a stop is one work event, never one row per manager.`, 'affectedPersonIds', REFUSAL('affected-count-invalid'));
      }
      const affectedPersonIds = [];
      const seen = new Set();
      for (const raw of input.affectedPersonIds) {
        const id = swpText(raw, 120);
        if (!id || seen.has(id)) return fail('An affected operator is blank or duplicated. Every person is counted once; nothing is deduplicated silently.', 'affectedPersonIds', REFUSAL('affected-duplicate'));
        if (!activePerson(id)) return fail('An affected operator must be an active roster person. Nothing was saved.', 'affectedPersonIds', REFUSAL('affected-not-active'));
        if (!reachable(check, id)) return fail('An affected operator is outside the declared tree and Matrix lines this seat can reach. No line is inferred.', 'affectedPersonIds', REFUSAL('affected-out-of-reach'));
        seen.add(id);
        affectedPersonIds.push(id);
      }
      const declaredAt = check.at.toISOString();
      const reviewByAt = swpInstant(input.reviewByAt);
      if (!reviewByAt) return fail('Choose a real review deadline with an explicit time zone.', 'reviewByAt', REFUSAL('deadline-invalid'));
      const delta = Date.parse(reviewByAt) - check.at.getTime();
      if (delta <= 0) return fail('The review deadline must be in the future; the hold itself never expires.', 'reviewByAt', REFUSAL('deadline-not-future'));
      if (delta > L.reviewMaxHours * 3600 * 1000) return fail(`The first formal review is due within ${L.reviewMaxHours} hours. This is a management guardrail, not permission to restart later.`, 'reviewByAt', REFUSAL('deadline-too-far'));

      const participants = [...new Set([check.actorId, workLeadId, ...affectedPersonIds])].sort();
      let authority = { ok: false, reason: 'matrix-unreadable', authorityIds: [] };
      try { authority = resolveWorkStopAuthority(workStopMatrix(store.state, check.at, check.cfg), participants); } catch { /* the hold still records; authority is explicitly absent */ }
      const stops = normalizeWorkStops(list('workStops'), []);
      if (stops.length >= L.stops) return fail('The stop-work ledger is full. The record is not accepted; preserve the physical hold and use the established site safety process.', null, REFUSAL('ledger-full'));
      const id = idFactory('swp');
      if (stops.some((stop) => stop.id === id)) return fail('The generated stop identifier already exists. Nothing was saved; retry after the identifier source is repaired.', null, REFUSAL('stop-id-collision'));
      const draft = {
        id,
        areaRef,
        workSummary,
        hazardKind,
        hazardText,
        immediateControls,
        reporterId: check.actorId,
        workLeadId,
        affectedPersonIds,
        authorityIds: authority.ok ? authority.authorityIds : [],
        authorityReason: authority.ok ? 'resolved' : authority.reason,
        declaredAt,
        reviewByAt,
      };
      const loaded = normalizeWorkStops([...stops, draft], []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The stop cannot be stored as a row this ledger will read back. No restart authority has been created.', null, REFUSAL('stop-unreadable'));
      store.update((state) => {
        state.workStops = Array.isArray(state.workStops) ? state.workStops : [];
        state.workStops.push(stored);
      }, {
        type: SWP_EVENTS.DECLARED,
        entity: 'workStop',
        entityId: id,
        summary: `Work stop declared for a named work area; the hold is active pending independent clearance and affected-operator confirmation.`,
      });
      return saved({ stopId: id, authorityIds: stored.authorityIds, authorityReason: stored.authorityReason });
    },

    /** The work lead records what was done; this is not a clearance or restart. */
    workStopMitigate(input = {}) {
      const check = resolveSeat(SWP_RIGHTS.MITIGATE);
      if (!check.ok) return check;
      const actorError = firstPerson(check, input.actorId, 'actorId', input.identityAttested);
      if (actorError) return actorError;
      const ctx = context(input.stopId, check);
      if (!ctx.ok) return ctx;
      const closed = noRestarted(ctx.row);
      if (closed) return closed;
      const integrity = actIntegrityFailure(ctx.row);
      if (integrity) return integrity;
      const matrix = currentMatrix(check);
      if (!checkCanMitigate(check, ctx.stop, matrix)) return fail('Only the named work lead or a manager strictly above that lead may record controls. A peer or unrelated line cannot promise another line’s safety action.', 'stopId', REFUSAL('not-work-lead-or-manager'));
      const actionText = swpText(input.actionText, L.textMax);
      if (actionText.length < L.textMin) return fail(`Describe the corrective action in at least ${L.textMin} characters.`, 'actionText', REFUSAL('mitigation-missing'));
      const evidenceText = swpText(input.evidenceText, L.textMax);
      if (evidenceText.length < L.evidenceMin) return fail(`Record what evidence was physically checked in at least ${L.evidenceMin} characters. The application cannot verify a site control.`, 'evidenceText', REFUSAL('mitigation-evidence-missing'));
      const round = Math.max(0, ...ctx.acts.filter((act) => act.kind === 'mitigation').map((act) => act.round)) + 1;
      const id = idFactory('swpa');
      return addAct(ctx.stop, {
        id, stopId: ctx.stop.id, actorId: check.actorId, kind: 'mitigation', round, mitigationId: id,
        actionText, evidenceText, at: check.at.toISOString(),
      });
    },

    /** Every frozen joint apex records their independent view of the SAME mitigation. */
    workStopAssess(input = {}) {
      const check = resolveSeat(SWP_RIGHTS.ASSESS);
      if (!check.ok) return check;
      const actorError = firstPerson(check, input.actorId, 'actorId', input.identityAttested);
      if (actorError) return actorError;
      const ctx = context(input.stopId, check);
      if (!ctx.ok) return ctx;
      const closed = noRestarted(ctx.row);
      if (closed) return closed;
      const integrity = actIntegrityFailure(ctx.row);
      if (integrity) return integrity;
      if (!ctx.row.currentMitigation) return fail('The work lead has not recorded a mitigation. Independent reviewers assess the actual control, not a blank promise.', 'stopId', REFUSAL('mitigation-required'));
      if (!ctx.stop.authorityIds.includes(check.actorId)) return fail(SWP_REFUSALS.noAuthority, 'stopId', REFUSAL('not-joint-apex'));
      const matrix = currentMatrix(check);
      const current = requireCurrentAuthority(check, ctx.stop, matrix);
      if (!current.ok || !isAbove(matrix, check.actorId, workStopParticipants(ctx.stop))) return fail('The matrix authority has changed or does not place this seat strictly above every affected line. No replacement reviewer is inferred; the hold stays active.', 'stopId', REFUSAL('authority-drift'));
      const round = ctx.row.currentRound;
      const mitigationId = ctx.row.currentMitigation.id;
      if (ctx.acts.some((act) => act.kind === 'assessment' && act.actorId === check.actorId && act.round === round)) {
        return fail('This reviewer already recorded a decision for this mitigation round. A new assessment requires a new mitigation, never an edit.', 'stopId', REFUSAL('assessment-already-recorded'));
      }
      const assessment = input.assessment === 'safe' || input.assessment === 'hold' ? input.assessment : null;
      if (!assessment) return fail('Choose `safe` or `hold`; the system cannot infer a safe restart.', 'assessment', REFUSAL('assessment-invalid'));
      const assessmentText = swpText(input.assessmentText, L.textMax);
      if (assessmentText.length < L.textMin) return fail(`Describe what you personally checked in at least ${L.textMin} characters.`, 'assessmentText', REFUSAL('assessment-text-missing'));
      const evidenceText = swpText(input.evidenceText, L.textMax);
      if (evidenceText.length < L.evidenceMin) return fail(`Name the physical or documentary evidence you inspected in at least ${L.evidenceMin} characters.`, 'evidenceText', REFUSAL('assessment-evidence-missing'));
      const id = idFactory('swpa');
      return addAct(ctx.stop, {
        id, stopId: ctx.stop.id, actorId: check.actorId, kind: 'assessment', round, mitigationId,
        assessment, assessmentText, evidenceText, at: check.at.toISOString(),
      });
    },

    /** An affected operator may refuse restart; confirming it is the second key. */
    workStopOperatorDecision(input = {}) {
      const check = resolveSeat(SWP_RIGHTS.OPERATOR);
      if (!check.ok) return check;
      const actorError = firstPerson(check, input.actorId, 'actorId', input.identityAttested);
      if (actorError) return actorError;
      const ctx = context(input.stopId, check);
      if (!ctx.ok) return ctx;
      const closed = noRestarted(ctx.row);
      if (closed) return closed;
      const integrity = actIntegrityFailure(ctx.row);
      if (integrity) return integrity;
      if (!ctx.row.currentMitigation) return fail('No mitigation has been recorded. The existing hold already governs; a restart or continue-hold key is not yet owed.', 'stopId', REFUSAL('mitigation-required'));
      if (!ctx.stop.affectedPersonIds.includes(check.actorId)) return fail('Only a named affected operator turns the second key. A reviewer, observer or manager cannot accept work on someone else’s behalf.', 'stopId', REFUSAL('not-affected-operator'));
      if (ctx.stop.workLeadId === check.actorId) return fail('The named work lead cannot clear or restart the work they control, even when also listed as affected. Another affected operator must turn the separate key; the hold remains if none is named.', 'stopId', REFUSAL('work-lead-cannot-restart'));
      if (ctx.stop.authorityIds.includes(check.actorId)) return fail('The same person cannot provide the independent clearance and the affected-operator restart key.', 'stopId', REFUSAL('reviewer-cannot-restart'));
      const round = ctx.row.currentRound;
      const mitigationId = ctx.row.currentMitigation.id;
      if (ctx.acts.some((act) => act.kind === 'operator-decision' && act.actorId === check.actorId && act.round === round)) {
        return fail('This operator already recorded a decision for this mitigation round. A new round needs a new control record; prior words are never edited.', 'stopId', REFUSAL('operator-decision-already-recorded'));
      }
      const decision = input.decision === 'restart' || input.decision === 'hold' ? input.decision : null;
      if (!decision) return fail('Choose `restart` or `hold`; silence is never a restart key.', 'decision', REFUSAL('decision-invalid'));
      if (decision === 'restart' && ctx.row.state !== 'awaiting-operator-check') return fail('Restart is refused until every joint apex has independently cleared the latest mitigation and no reviewer has kept the hold in force.', 'decision', REFUSAL('clearances-incomplete'));
      if (decision === 'restart') {
        const approvals = ctx.acts.filter((act) => act.kind === 'assessment' && act.round === round
          && act.mitigationId === mitigationId && act.assessment === 'safe');
        const latestApprovalAt = Math.max(0, ...approvals.map((act) => Date.parse(act.at)));
        if (!Number.isFinite(latestApprovalAt) || check.at.getTime() < latestApprovalAt) {
          return fail('The operator key must be recorded after the latest independent assessment. The hold remains in force.', 'decision', REFUSAL('restart-before-clearance'));
        }
      }
      const operatorText = swpText(input.operatorText, L.textMax);
      if (operatorText.length < L.textMin) return fail(`Record your own work-area check in at least ${L.textMin} characters.`, 'operatorText', REFUSAL('operator-check-missing'));
      const evidenceText = swpText(input.evidenceText, L.textMax);
      if (evidenceText.length < L.evidenceMin) return fail(`Record the evidence you personally observed in at least ${L.evidenceMin} characters.`, 'evidenceText', REFUSAL('operator-evidence-missing'));
      const reason = decision === 'hold' ? swpText(input.reason, L.textMax) : '';
      if (decision === 'hold' && reason.length < L.textMin) return fail(`A continue-hold decision needs a written reason of at least ${L.textMin} characters.`, 'reason', REFUSAL('hold-reason-missing'));
      if (decision === 'restart') {
        const matrix = currentMatrix(check);
        const authority = requireCurrentAuthority(check, ctx.stop, matrix);
        if (!authority.ok) return fail('The matrix authority changed after the clearance. The hold remains in force; no new approver is silently substituted.', 'decision', REFUSAL('authority-drift'));
      }
      const id = idFactory('swpa');
      return addAct(ctx.stop, {
        id, stopId: ctx.stop.id, actorId: check.actorId, kind: 'operator-decision', round, mitigationId,
        decision, operatorText, evidenceText, reason, at: check.at.toISOString(),
      });
    },

    /** Explicitly run the same governed rule as a commit. */
    workStopScan() {
      const check = resolveSeat(SWP_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: SWP_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${SWP_ROUTE}#${SWP_EVENTS.SCANNED}`,
        summary: 'Stop-work review scan requested: overdue holds and joint authority were re-read from the record.',
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* -------------------------------------------------------------- reads */
    workStopReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildWorkStop(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },

    workStopAttentionCount() {
      const check = readCheck();
      if (!check.ok) return 0;
      return buildWorkStop(store.state, { now: check.at, settings: check.cfg, seat: check.seat }).attention;
    },

    workStopCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const report = buildWorkStop(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
      return { ok: true, people: report.peopleOptions };
    },
  };
}
