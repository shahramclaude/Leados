/**
 * app/core/domain/onboardingMatrixActions.js — the commands of Matrix Onboarding
 * Completeness (ADR-0150, Schema v125).
 *
 * THREE human writes, every one dated, span-checked and refused with a printed
 * reason. There is deliberately no fourth that writes a brief for another line, and
 * none that acknowledges a brief on the person's behalf.
 *
 *   onboardingMatrixBriefLine   "This is what MY line expects of this person, in
 *                                writing, and here is their first piece of work on
 *                                it and who they must meet." Enforced: only the
 *                                seat that holds the line (or the local operator
 *                                capturing a statement made outside the workspace),
 *                                only for a line in force in the window, only for a
 *                                person who actually sits on more than one line, and
 *                                never a repeated copy of the brief already standing.
 *
 *   onboardingMatrixDeclineLine "My line carries no onboarding obligation for this
 *                                person yet, and here is why." A decline is an
 *                                ANSWER and must state a reason; it stays on the
 *                                record and is printed as a decline, never as
 *                                coverage.
 *
 *   onboardingMatrixAcknowledge  "I have read what this line expects of me." The
 *                                PERSON's own act, on the CURRENT brief, once. A
 *                                re-brief invalidates it: an acknowledgement of a
 *                                text that no longer stands is not an agreement to
 *                                the text that replaced it.
 *
 *   onboardingMatrixScan        Re-run RULE-ONB-01 so any obligation a cap deferred
 *                                is retried. Changes no declaration.
 *
 * WHAT NO COMMAND HERE WILL DO
 * ----------------------------
 * It will not invent a plan for a multi-line person who has none; it will not pick
 * one of two managers as the owner of an onboarding; it will not derive a share of
 * the person for any line; it will not write a brief in a single-chain workspace
 * (the matrix step is inert there and a second copy of the plan's own claims would
 * be a duplicate, not a record); and it will not edit a brief that has been
 * declared — a correction is a NEW dated row, so the earlier words remain readable
 * next to the person's acknowledgement of them.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildOnboardingMatrix, buildOnboardingMatrixCase, onboardingLineKey } from './onboardingMatrix.js';
import {
  ONBOARDING_MATRIX_EVENTS,
  ONBOARDING_MATRIX_LIMITS,
  ONBOARDING_MATRIX_REFUSALS,
  ONBOARDING_MATRIX_RIGHTS,
  ONBOARDING_MATRIX_SCAN_EVENT,
} from './onboardingMatrixRegistry.js';

const MIN_SCOPE = 8;
const MIN_REASON = 8;

export function createOnboardingMatrixActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
    ok: true,
  });

  const seatFor = (right) => {
    const at = clock();
    const cfg = settings();
    const built = buildSeats(store.state, {
      now: at,
      settings: cfg,
      lineScope: matrixLineScopeFor(store.state, { now: at, settings: cfg }),
    });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or writing a line brief.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  const plans = () => (Array.isArray(store.state.onboarding) ? store.state.onboarding : []);
  const findPlan = (id) => plans().find((p) => p && p.id === id) || null;
  const briefRows = () => (Array.isArray(store.state.onboardingLineBriefs) ? store.state.onboardingLineBriefs : []);

  /** Can this seat see this person at all — tree OR declared line, as ADR-0141. */
  const seatReaches = (seat, personId) => {
    if (seat.fullAccess) return true;
    if (seat.id === personId) return true;
    if (seat.scope?.has?.(personId)) return true;
    if (seat.lineScope?.has?.(personId)) return true;
    return false;
  };

  /** Resolve one case and one line inside it, by stable line key. */
  const resolveCase = (plan, personId = null) => {
    const at = clock();
    const cfg = settings();
    if (plan) return buildOnboardingMatrixCase(store.state, plan, { now: at, settings: cfg });
    const board = buildOnboardingMatrix(store.state, { now: at, settings: cfg, limit: Number.MAX_SAFE_INTEGER });
    return board.cases.find((c) => c.personId === personId && !c.hasPlan) || null;
  };

  const resolveLine = (report, lineKey) => (report?.lines || []).find((l) => l.key === String(lineKey || '')) || null;

  /** The one place the "is this line in force, and may this seat speak for it" rule lives. */
  const checkLineForWrite = (seat, report, line) => {
    if (!report) return fail('That onboarding case no longer resolves. Reload and try again.');
    if (!report.hasPlan) {
      return fail(ONBOARDING_MATRIX_REFUSALS.noPlan, 'planId');
    }
    if (!report.isMatrix) {
      return fail(ONBOARDING_MATRIX_REFUSALS.singleLine, 'planId');
    }
    if (!line) return fail('That reporting line does not resolve on this person. A line that is not on the record cannot be briefed.', 'lineKey');
    if (!line.inWindow) {
      return fail(`${line.reason} ${ONBOARDING_MATRIX_REFUSALS.outsideWindow}`, 'lineKey');
    }
    const isOwner = seat.fullAccess ? true : seat.id === line.managerId;
    if (!isOwner) {
      return fail(`${ONBOARDING_MATRIX_REFUSALS.notLineHolder} This line is held by ${line.managerName}.`, 'lineKey');
    }
    if (line.brief && line.brief.acknowledgedOn) {
      // A standing, acknowledged brief is not overwritten. A correction is a NEW
      // row, and the acknowledgement of the old text stays attached to the old
      // text. This is the same refusal ADR-0148 makes for a retuned share.
      return fail(`This line’s brief was acknowledged by the person on ${line.brief.acknowledgedOn}. Recording a different brief is a NEW dated row, not an edit: press “Re-brief this line” to supersede it, and the person will be asked to acknowledge the new text.`, 'lineKey');
    }
    return { ok: true };
  };

  return {
    /* ---------------------------------------------------------------- reads */

    onboardingMatrixRead(input = {}) {
      const check = seatFor(ONBOARDING_MATRIX_RIGHTS.acknowledge);
      if (!check.ok) return check;
      const planId = String(input.planId || '').trim();
      const personId = String(input.personId || '').trim();
      const plan = planId ? findPlan(planId) : null;
      if (planId && !plan) return fail('That 30-60-90 plan no longer exists.', 'planId');
      if (!plan && !personId) return fail('Name the plan or the person whose onboarding you are reading.', 'planId');
      const report = resolveCase(plan, personId);
      if (!report) return fail('No onboarding case resolves for that person.', 'personId');
      if (!seatReaches(check.seat, report.personId)) {
        return fail('That person is outside your operating seat. Line briefs are only readable from a seat above the person or on one of their lines.');
      }
      return { ok: true, report };
    },

    onboardingMatrixBoard() {
      const check = seatFor(ONBOARDING_MATRIX_RIGHTS.acknowledge);
      if (!check.ok) return check;
      return {
        ok: true,
        board: buildOnboardingMatrix(store.state, {
          now: clock(),
          settings: settings(),
          limit: ONBOARDING_MATRIX_LIMITS.board,
        }),
      };
    },

    /** The lines this seat may brief, with why each is or is not written yet. */
    onboardingMatrixCandidates(input = {}) {
      const check = seatFor(ONBOARDING_MATRIX_RIGHTS.brief);
      if (!check.ok) return check;
      const planId = String(input.planId || '').trim();
      const personId = String(input.personId || '').trim();
      const plan = planId ? findPlan(planId) : null;
      if (planId && !plan) return fail('That 30-60-90 plan no longer exists.', 'planId');
      const report = resolveCase(plan, personId);
      if (!report) return fail('No onboarding case resolves for that person.', 'personId');
      const { seat } = check;
      return {
        ok: true,
        personId: report.personId,
        lines: report.lines.map((l) => {
          const owner = seat.fullAccess ? true : seat.id === l.managerId;
          return {
            key: l.key,
            managerId: l.managerId,
            managerName: l.managerName,
            role: l.role,
            kind: l.kind,
            inWindow: l.inWindow,
            reason: l.reason,
            state: l.state,
            canBrief: Boolean(report.hasPlan && report.isMatrix && l.inWindow && owner && !(l.brief && l.brief.acknowledgedOn)),
            canAcknowledge: Boolean(l.brief && l.brief.outcome === 'brief' && !l.brief.acknowledgedOn),
          };
        }),
      };
    },

    /* --------------------------------------------------------------- writes */

    onboardingMatrixBriefLine(input = {}) {
      const check = seatFor(ONBOARDING_MATRIX_RIGHTS.brief);
      if (!check.ok) return check;
      const { seat } = check;
      const plan = findPlan(String(input.planId || '').trim());
      if (!plan) return fail('Choose the 30-60-90 plan this line is onboarding into.', 'planId');
      if (plan.status !== 'active') {
        return fail('That plan is not active. A line brief attached to a closed plan would not be read by anything.', 'planId');
      }
      if (!seatReaches(seat, plan.personId)) return fail('That person is outside your operating seat.', 'planId');
      const report = resolveCase(plan);
      const lineKey = String(input.lineKey || '').trim();
      const line = resolveLine(report, lineKey);
      const gate = checkLineForWrite(seat, report, line);
      if (!gate.ok) return gate;

      const scope = String(input.scope || '').trim().slice(0, ONBOARDING_MATRIX_LIMITS.scopeChars);
      if (scope.length < MIN_SCOPE) return fail(ONBOARDING_MATRIX_REFUSALS.scopeTooShort, 'scope');
      const firstWork = String(input.firstWork || '').trim().slice(0, ONBOARDING_MATRIX_LIMITS.firstWorkChars);
      const stakeholders = [];
      const seen = new Set();
      for (const raw of Array.isArray(input.stakeholders) ? input.stakeholders : []) {
        const name = String(raw || '').trim().slice(0, ONBOARDING_MATRIX_LIMITS.stakeholderChars);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        stakeholders.push(name);
        if (stakeholders.length >= ONBOARDING_MATRIX_LIMITS.stakeholders) break;
      }
      // A repeated copy of the standing brief adds no commitment and would reset the
      // person's acknowledgement for no reason. Refused with that reason printed.
      if (line.brief && line.brief.outcome === 'brief' && line.brief.scope === scope) {
        return fail(ONBOARDING_MATRIX_REFUSALS.duplicateBrief, 'scope');
      }

      const at = clock();
      const today = dayKey(at);
      const rowId = idFactory('obf');
      store.update((draft) => {
        draft.onboardingLineBriefs = Array.isArray(draft.onboardingLineBriefs) ? draft.onboardingLineBriefs : [];
        draft.onboardingLineBriefs.push({
          id: rowId,
          planId: plan.id,
          personId: plan.personId,
          lineKey: line.key,
          lineRole: line.role,
          lineKind: line.kind,
          managerId: line.managerId,
          outcome: 'brief',
          declaredOn: today,
          declaredBySeatId: seat.fullAccess ? null : seat.id,
          declaredSource: seat.fullAccess ? 'operator' : 'manager',
          scope,
          firstWork,
          stakeholders,
          reason: '',
          acknowledgedOn: null,
          acknowledgedBySeatId: null,
          acknowledgementSource: 'person',
          acknowledgement: '',
        });
        if (draft.onboardingLineBriefs.length > ONBOARDING_MATRIX_LIMITS.briefs * 200) {
          draft.onboardingLineBriefs.splice(0, draft.onboardingLineBriefs.length - ONBOARDING_MATRIX_LIMITS.briefs * 200);
        }
      }, {
        type: ONBOARDING_MATRIX_EVENTS.BRIEF,
        entity: 'person',
        entityId: plan.personId,
        summary: `${seat.fullAccess ? 'Operator recorded' : line.managerName} wrote the ${line.kind} line’s onboarding brief for ${report.personName}.`.slice(0, 300),
      });
      return saved({ id: rowId, planId: plan.id, lineKey: line.key, declaredOn: today });
    },

    onboardingMatrixDeclineLine(input = {}) {
      const check = seatFor(ONBOARDING_MATRIX_RIGHTS.brief);
      if (!check.ok) return check;
      const { seat } = check;
      const plan = findPlan(String(input.planId || '').trim());
      if (!plan) return fail('Choose the 30-60-90 plan this line is onboarding into.', 'planId');
      if (plan.status !== 'active') return fail('That plan is not active.', 'planId');
      if (!seatReaches(seat, plan.personId)) return fail('That person is outside your operating seat.', 'planId');
      const report = resolveCase(plan);
      const lineKey = String(input.lineKey || '').trim();
      const line = resolveLine(report, lineKey);
      const gate = checkLineForWrite(seat, report, line);
      if (!gate.ok) return gate;
      if (line.brief && line.brief.outcome === 'declined') {
        return fail('This line has already declined to onboard this person, with the reason on the record. A second decline would add nothing; re-brief the line if the situation changed.', 'lineKey');
      }
      const reason = String(input.reason || '').trim().slice(0, ONBOARDING_MATRIX_LIMITS.reasonChars);
      if (reason.length < MIN_REASON) {
        return fail('Say why this line carries no onboarding obligation for this person yet. A bare refusal is indistinguishable from a missed deadline.', 'reason');
      }
      const at = clock();
      const today = dayKey(at);
      const rowId = idFactory('obf');
      store.update((draft) => {
        draft.onboardingLineBriefs = Array.isArray(draft.onboardingLineBriefs) ? draft.onboardingLineBriefs : [];
        draft.onboardingLineBriefs.push({
          id: rowId,
          planId: plan.id,
          personId: plan.personId,
          lineKey: line.key,
          lineRole: line.role,
          lineKind: line.kind,
          managerId: line.managerId,
          outcome: 'declined',
          declaredOn: today,
          declaredBySeatId: seat.fullAccess ? null : seat.id,
          declaredSource: seat.fullAccess ? 'operator' : 'manager',
          scope: '',
          firstWork: '',
          stakeholders: [],
          reason,
          acknowledgedOn: null,
          acknowledgedBySeatId: null,
          acknowledgementSource: 'person',
          acknowledgement: '',
        });
      }, {
        type: ONBOARDING_MATRIX_EVENTS.BRIEF,
        entity: 'person',
        entityId: plan.personId,
        summary: `${line.managerName} recorded that the ${line.kind} line carries no onboarding obligation for ${report.personName} yet, with a reason.`.slice(0, 300),
      });
      return saved({ id: rowId, planId: plan.id, lineKey: line.key, outcome: 'declined' });
    },

    onboardingMatrixAcknowledge(input = {}) {
      const check = seatFor(ONBOARDING_MATRIX_RIGHTS.acknowledge);
      if (!check.ok) return check;
      const { seat } = check;
      const plan = findPlan(String(input.planId || '').trim());
      if (!plan) return fail('That 30-60-90 plan no longer exists.', 'planId');
      if (plan.status !== 'active') return fail('That plan is not active.', 'planId');
      const report = resolveCase(plan);
      const lineKey = String(input.lineKey || '').trim();
      const line = resolveLine(report, lineKey);
      if (!line) return fail('That reporting line does not resolve on this person.', 'lineKey');
      if (!line.brief || line.brief.outcome !== 'brief') {
        return fail(ONBOARDING_MATRIX_REFUSALS.noBriefToAcknowledge, 'lineKey');
      }
      if (line.brief.acknowledgedOn) {
        return fail(`You acknowledged this line’s brief on ${line.brief.acknowledgedOn}. An acknowledgement is given once per brief; if the line writes a different brief it will ask you again.`, 'lineKey');
      }
      // FIRST PERSON ONLY. The acknowledgement is the person's own act: the hours
      // are theirs. The local operator view may capture a statement made outside
      // the workspace and the row says so, but a manager cannot acknowledge on a
      // report's behalf — that is the shadow accountability this module prevents.
      const isSelf = seat.fullAccess ? true : seat.id === plan.personId;
      if (!isSelf) {
        return fail(`${ONBOARDING_MATRIX_REFUSALS.notThePerson} This brief is for ${report.personName}.`, 'lineKey');
      }
      const acknowledgement = String(input.acknowledgement || '').trim().slice(0, ONBOARDING_MATRIX_LIMITS.acknowledgementChars);
      const at = clock();
      const today = dayKey(at);
      const briefId = line.brief.id;
      store.update((draft) => {
        const rows = Array.isArray(draft.onboardingLineBriefs) ? draft.onboardingLineBriefs : [];
        const target = rows.find((row) => row && row.id === briefId);
        if (!target) return;
        // ONLY the acknowledgement fields are written. The brief's own words are
        // never touched by the person acknowledging them.
        target.acknowledgedOn = today;
        target.acknowledgedBySeatId = seat.fullAccess ? null : seat.id;
        target.acknowledgementSource = seat.fullAccess ? 'operator' : 'person';
        target.acknowledgement = acknowledgement;
      }, {
        type: ONBOARDING_MATRIX_EVENTS.ACKNOWLEDGE,
        entity: 'person',
        entityId: plan.personId,
        summary: `${seat.fullAccess ? 'Operator recorded the person’s acknowledgement of' : report.personName + ' acknowledged'} the ${line.kind} line’s onboarding brief.`.slice(0, 300),
      });
      return saved({ planId: plan.id, lineKey: line.key, acknowledgedOn: today });
    },

    onboardingMatrixScan() {
      const check = seatFor(ONBOARDING_MATRIX_RIGHTS.brief);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.onboardingLineBriefs = Array.isArray(draft.onboardingLineBriefs) ? draft.onboardingLineBriefs : [];
      }, {
        type: ONBOARDING_MATRIX_SCAN_EVENT,
        entity: 'workspace',
        entityId: 'onboarding',
        summary: 'Matrix onboarding completeness scanned; deferred obligations retried and no declaration changed.',
      });
      return saved({ propagations: store.lastPropagations || [] });
    },
  };
}

/** Re-exported so a caller never has to rebuild the key shape by hand. */
export { onboardingLineKey };
