/**
 * app/core/domain/matrixInterfaceActions.js — governed commands for the Matrix
 * Management-Interface Operating-Agreement Register (ADR-0162, Schema v131).
 *
 * Four human commands, mounted into `app/actions.js` before `guardApi`:
 *
 *   matrixInterfaceAffirm          one counterpart manager signs (or confirms)
 *                                  dated bilateral operating terms.
 *   matrixInterfaceRetire          one counterpart manager (or unique joint apex)
 *                                  retires the active bilateral agreement with a
 *                                  stated reason.
 *   matrixInterfaceScan            explicit post-commit scan triggering RULE-MIA-01.
 *   matrixInterfaceSetConventions  director+ command updating clamped windows and
 *                                  auto-propagation setting.
 *
 * Strict standing rules enforced here (never delegated to client input):
 *  - A scoped manager may sign ONLY their own side (`actingManagerId === seat.id`),
 *    never their counterpart's side.
 *  - Both sides cannot be fabricated at upgrade or confirmed from a disconnected/
 *    diamond-tied pair (`!pair.apex.unique` refuses!).
 *  - `escalationSeatId` must equal the live `matrixJointApex` or one of its
 *    ancestors in the live DAG.
 *  - If `forumId` is provided, it must name an active `cadenceForums` record.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildMatrixInterfaceReport, matrixInterfaceCandidates } from './matrixInterface.js';
import {
  MATRIX_INTERFACE_BOUNDS,
  MATRIX_INTERFACE_CONSULTATION_KEYS,
  MATRIX_INTERFACE_EVENTS,
  MATRIX_INTERFACE_LIMITS,
  MATRIX_INTERFACE_RIGHTS,
} from './matrixInterfaceRegistry.js';
import {
  calendarDayOrNull,
  canonicalPairKey,
  normalizeMatrixInterfaceAgreements,
  normalizeMatrixInterfaceSettings,
} from './matrixInterfaceSchema.js';

const fail = (error, field = 'matrixInterface') => ({ ok: false, error, field });

function resolveSeat(store, at, cfg) {
  const matrix = buildMatrix(store.state, { now: at, settings: cfg });
  const scope = matrixLineScope(matrix);
  const built = buildSeats(store.state, { now: at, settings: cfg, lineScope: scope.byManager });
  return { seat: activeSeat(built), matrix, scope, built };
}

function appendActBounded(list, row) {
  const out = Array.isArray(list) ? list : [];
  if (out.length >= MATRIX_INTERFACE_LIMITS.acts) {
    out.splice(0, out.length - MATRIX_INTERFACE_LIMITS.acts + 1);
  }
  out.push(row);
  return out;
}

export function createMatrixInterfaceActions(store, { now = () => new Date(), idFactory = (p) => `${p}-${Date.now()}` } = {}) {
  const clock = () => {
    const v = now();
    return v instanceof Date ? v : new Date(v);
  };

  function resolvePairFromInput(report, input = {}) {
    let pairKey = typeof input.pairKey === 'string' ? input.pairKey.trim() : '';
    if (!pairKey && input.managerAId && input.managerBId) {
      pairKey = canonicalPairKey(input.managerAId, input.managerBId)?.pairKey || '';
    }
    if (!pairKey) return { ok: false, error: 'Name the counterpart manager pair to govern.', field: 'pairKey' };
    const pair = report.allPairs.find((p) => p.pairKey === pairKey) || null;
    if (!pair) {
      return {
        ok: false,
        error: 'No active shared reporting interface connects those managers in the current matrix.',
        field: 'pairKey',
      };
    }
    return { ok: true, pair };
  }

  return {
    matrixInterfaceCandidates(options = {}) {
      const at = options.now instanceof Date ? options.now : clock();
      const candidates = matrixInterfaceCandidates(store.state, { now: at, settings: store.state.settings || {} });
      return { ok: true, ...candidates };
    },

    matrixInterfaceAffirm(input = {}) {
      const at = clock();
      const today = dayKey(at);
      const cfg = store.state.settings || {};
      const { seat, matrix, scope, built } = resolveSeat(store, at, cfg);
      const verdict = canAct(MATRIX_INTERFACE_RIGHTS.AFFIRM, seat);
      if (!verdict.allow) return fail(verdict.reason, 'scope');
      if (seat.readOnly) return fail('The operating seat is unresolved.', 'scope');

      const report = buildMatrixInterfaceReport(store.state, {
        now: at, settings: cfg, matrix, lineScope: scope, seats: built, seat,
      });
      if (!report.isMatrix) {
        return fail('No active shared matrix pairs exist in this workspace.', 'pairKey');
      }

      const found = resolvePairFromInput(report, input);
      if (!found.ok) return fail(found.error, found.field);
      const pair = found.pair;

      if (!pair.apex.unique) {
        return fail(
          pair.apex.ambiguous
            ? 'Cannot bind an interface agreement while the counterpart pair ties across multiple minimal joint ancestors in the DAG.'
            : 'Cannot bind an interface agreement between managers who share no common ancestor in the live reporting DAG.',
          'escalationSeatId',
        );
      }

      // First-person counterpart standing check
      let actingSide = '';
      let actingManagerId = '';
      if (!seat.fullAccess) {
        if (seat.id !== pair.managerAId && seat.id !== pair.managerBId) {
          return fail(
            'Only one of the two counterpart managers sharing this interface (or the full-access operator) may sign a side of this operating agreement.',
            'scope',
          );
        }
        actingSide = seat.id === pair.managerAId ? 'a' : 'b';
        actingManagerId = seat.id;
        if (input.actingSide && input.actingSide !== actingSide) {
          return fail(
            'A scoped manager may sign only their own side of the interface agreement; counterpart sign-off cannot be submitted on someone else’s behalf.',
            'actingSide',
          );
        }
        if (input.actingManagerId && String(input.actingManagerId).trim() !== actingManagerId) {
          return fail(
            'A scoped manager may sign only under their own operating seat ID.',
            'actingManagerId',
          );
        }
      } else {
        const reqSide = input.actingSide === 'a' || input.actingSide === 'b' ? input.actingSide : '';
        const reqMgr = typeof input.actingManagerId === 'string' ? input.actingManagerId.trim() : '';
        if (reqSide) {
          actingSide = reqSide;
          actingManagerId = reqSide === 'a' ? pair.managerAId : pair.managerBId;
        } else if (reqMgr === pair.managerAId || reqMgr === pair.managerBId) {
          actingSide = reqMgr === pair.managerAId ? 'a' : 'b';
          actingManagerId = reqMgr;
        } else {
          return fail(
            'In operator view, explicitly specify `actingSide` ("a" or "b") or `actingManagerId` matching one counterpart manager.',
            'actingSide',
          );
        }
      }

      // Support explicit confirmCounterpart shortcut when the counterpart holds an active proposal
      const otherProposal = actingSide === 'a' ? pair.liveB : pair.liveA;
      let consultationRule = typeof input.consultationRule === 'string' ? input.consultationRule.trim() : '';
      let effectiveFrom = calendarDayOrNull(input.effectiveFrom || today);
      let reviewByOn = calendarDayOrNull(
        input.reviewByOn
        || (input.confirmCounterpart && otherProposal ? otherProposal.reviewByOn : addDays(effectiveFrom || today, report.conventions.matrixInterfaceDefaultTermDays)),
      );
      let forumId = typeof input.forumId === 'string' && input.forumId.trim() ? input.forumId.trim() : null;
      let escalationSeatId = typeof input.escalationSeatId === 'string' ? input.escalationSeatId.trim() : '';

      if (input.confirmCounterpart === true) {
        if (!otherProposal) {
          return fail('No counterpart proposal is active to confirm.', 'confirmCounterpart');
        }
        consultationRule = otherProposal.consultationRule;
        effectiveFrom = otherProposal.effectiveFrom;
        reviewByOn = otherProposal.reviewByOn;
        forumId = otherProposal.forumId || null;
        escalationSeatId = otherProposal.escalationSeatId;
      }

      if (!MATRIX_INTERFACE_CONSULTATION_KEYS.includes(consultationRule)) {
        return fail('Choose a declared consultation rule from the interface vocabulary.', 'consultationRule');
      }
      if (!effectiveFrom) return fail('Provide a valid `effectiveFrom` calendar date (YYYY-MM-DD).', 'effectiveFrom');
      if (!reviewByOn || reviewByOn < effectiveFrom) {
        return fail('Provide a valid `reviewByOn` date on or after `effectiveFrom`.', 'reviewByOn');
      }
      const termDays = daysBetween(effectiveFrom, reviewByOn);
      if (termDays < 1 || termDays > MATRIX_INTERFACE_BOUNDS.termDays[1]) {
        return fail(
          `Agreement term (${termDays} days) must sit between 1 and ${MATRIX_INTERFACE_BOUNDS.termDays[1]} days.`,
          'reviewByOn',
        );
      }

      if (!escalationSeatId) escalationSeatId = pair.apex.apexId;
      if (!pair.apex.escalationSeatIds.includes(escalationSeatId)) {
        return fail(
          'The named escalation seat must sit at or above the live joint apex of both counterpart managers.',
          'escalationSeatId',
        );
      }

      if (forumId) {
        const forum = (store.state.cadenceForums || []).find((f) => f && f.id === forumId);
        if (!forum || forum.status !== 'active') {
          return fail('The named cadence forum does not exist or is retired.', 'forumId');
        }
      }

      const basis = typeof input.basis === 'string' ? input.basis.trim().slice(0, MATRIX_INTERFACE_LIMITS.basisMax) : '';
      if (basis.length < MATRIX_INTERFACE_LIMITS.basisMin) {
        return fail(
          `State the operational basis in at least ${MATRIX_INTERFACE_LIMITS.basisMin} characters.`,
          'basis',
        );
      }

      const row = {
        id: idFactory('mia'),
        pairKey: pair.pairKey,
        managerAId: pair.managerAId,
        managerBId: pair.managerBId,
        actingSide,
        actingManagerId,
        outcome: 'affirm',
        consultationRule,
        effectiveFrom,
        reviewByOn,
        forumId,
        escalationSeatId,
        basis,
        reason: '',
        decidedOn: today,
        decidedBySeatId: seat.fullAccess ? '__operator__' : seat.id,
        via: input.confirmCounterpart ? 'confirm' : 'action',
        at: at.toISOString(),
      };

      const warnings = [];
      const [validated] = normalizeMatrixInterfaceAgreements([row], warnings);
      if (!validated) return fail(warnings[0] || 'Interface agreement record could not be validated.', 'basis');

      store.update(
        (draft) => {
          draft.matrixInterfaceAgreements = appendActBounded(draft.matrixInterfaceAgreements, validated);
        },
        {
          type: MATRIX_INTERFACE_EVENTS.AFFIRM,
          entity: 'workspace',
          entityId: pair.pairKey,
          summary: `Recorded management-interface sign-off (side ${actingSide.toUpperCase()}) for ${pair.pairKey}.`,
        },
      );

      const nextReport = buildMatrixInterfaceReport(store.state, { now: at, settings: store.state.settings || {} });
      const nextPair = nextReport.allPairs.find((p) => p.pairKey === pair.pairKey) || null;
      return {
        ok: true,
        act: validated,
        pair: nextPair,
        report: nextReport,
      };
    },

    matrixInterfaceRetire(input = {}) {
      const at = clock();
      const today = dayKey(at);
      const cfg = store.state.settings || {};
      const { seat, matrix, scope, built } = resolveSeat(store, at, cfg);
      const verdict = canAct(MATRIX_INTERFACE_RIGHTS.AFFIRM, seat);
      if (!verdict.allow) return fail(verdict.reason, 'scope');
      if (seat.readOnly) return fail('The operating seat is unresolved.', 'scope');

      const report = buildMatrixInterfaceReport(store.state, {
        now: at, settings: cfg, matrix, lineScope: scope, seats: built, seat,
      });
      const found = resolvePairFromInput(report, input);
      if (!found.ok) return fail(found.error, found.field);
      const pair = found.pair;

      if (!pair.liveA && !pair.liveB) {
        return fail('No live agreement or proposal is active on this interface to retire.', 'pairKey');
      }

      let actingSide = '';
      let actingManagerId = '';
      const isUniqueApex = pair.apex.unique && seat.id === pair.apex.apexId;
      if (!seat.fullAccess && seat.id !== pair.managerAId && seat.id !== pair.managerBId && !isUniqueApex) {
        return fail(
          'Only one of the two counterpart managers, their unique joint apex, or the operator view may retire this agreement.',
          'scope',
        );
      }

      if (seat.id === pair.managerAId) {
        actingSide = 'a';
        actingManagerId = pair.managerAId;
      } else if (seat.id === pair.managerBId) {
        actingSide = 'b';
        actingManagerId = pair.managerBId;
      } else {
        const reqSide = input.actingSide === 'a' || input.actingSide === 'b'
          ? input.actingSide
          : (pair.liveA ? 'a' : 'b');
        actingSide = reqSide;
        actingManagerId = reqSide === 'a' ? pair.managerAId : pair.managerBId;
      }

      const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, MATRIX_INTERFACE_LIMITS.reasonMax) : '';
      if (reason.length < MATRIX_INTERFACE_LIMITS.reasonMin) {
        return fail(
          `State why this interface agreement is being retired in at least ${MATRIX_INTERFACE_LIMITS.reasonMin} characters.`,
          'reason',
        );
      }

      const row = {
        id: idFactory('mia'),
        pairKey: pair.pairKey,
        managerAId: pair.managerAId,
        managerBId: pair.managerBId,
        actingSide,
        actingManagerId,
        outcome: 'retire',
        consultationRule: null,
        effectiveFrom: null,
        reviewByOn: null,
        forumId: null,
        escalationSeatId: null,
        basis: '',
        reason,
        decidedOn: today,
        decidedBySeatId: seat.fullAccess ? '__operator__' : seat.id,
        via: isUniqueApex && seat.id !== pair.managerAId && seat.id !== pair.managerBId ? 'apex' : 'action',
        at: at.toISOString(),
      };

      const warnings = [];
      const [validated] = normalizeMatrixInterfaceAgreements([row], warnings);
      if (!validated) return fail(warnings[0] || 'Retirement record could not be validated.', 'reason');

      store.update(
        (draft) => {
          draft.matrixInterfaceAgreements = appendActBounded(draft.matrixInterfaceAgreements, validated);
        },
        {
          type: MATRIX_INTERFACE_EVENTS.RETIRE,
          entity: 'workspace',
          entityId: pair.pairKey,
          summary: `Retired management-interface agreement for ${pair.pairKey}.`,
        },
      );

      const nextReport = buildMatrixInterfaceReport(store.state, { now: at, settings: store.state.settings || {} });
      const nextPair = nextReport.allPairs.find((p) => p.pairKey === pair.pairKey) || null;
      return {
        ok: true,
        act: validated,
        pair: nextPair,
        report: nextReport,
      };
    },

    matrixInterfaceScan() {
      const at = clock();
      const cfg = store.state.settings || {};
      const { seat } = resolveSeat(store, at, cfg);
      const verdict = canAct(MATRIX_INTERFACE_RIGHTS.AFFIRM, seat);
      if (!verdict.allow) return fail(verdict.reason, 'scope');
      if (seat.readOnly) return fail('The operating seat is unresolved.', 'scope');

      const res = store.update(
        () => {},
        {
          type: MATRIX_INTERFACE_EVENTS.SCAN,
          entity: 'workspace',
          entityId: 'matrix-interfaces',
          summary: 'Scanned matrix management interfaces for uncovered or expired agreements.',
        },
      );
      const report = buildMatrixInterfaceReport(store.state, { now: at, settings: store.state.settings || {} });
      return { ok: true, report, effects: res.effects || [], warnings: res.warnings || [] };
    },

    matrixInterfaceSetConventions(input = {}) {
      const at = clock();
      const cfg = store.state.settings || {};
      const { seat } = resolveSeat(store, at, cfg);
      const verdict = canAct(MATRIX_INTERFACE_RIGHTS.GOVERN, seat);
      if (!verdict.allow) return fail(verdict.reason, 'scope');
      if (seat.readOnly) return fail('The operating seat is unresolved.', 'scope');
      if (!seat.fullAccess && seat.rank < 3) {
        return fail('Setting matrix-interface conventions requires director altitude or above.', 'scope');
      }

      const next = normalizeMatrixInterfaceSettings({
        matrixInterfaceDefaultTermDays: input.matrixInterfaceDefaultTermDays ?? cfg.matrixInterfaceDefaultTermDays,
        matrixInterfaceDueWarnDays: input.matrixInterfaceDueWarnDays ?? cfg.matrixInterfaceDueWarnDays,
        matrixInterfaceReviewAskDays: input.matrixInterfaceReviewAskDays ?? cfg.matrixInterfaceReviewAskDays,
        matrixInterfaceAutoPropagate: input.matrixInterfaceAutoPropagate ?? cfg.matrixInterfaceAutoPropagate,
      });

      store.update(
        (draft) => {
          draft.settings = { ...(draft.settings || {}), ...next };
        },
        {
          type: MATRIX_INTERFACE_EVENTS.CONVENTIONS,
          entity: 'workspace',
          entityId: 'matrix-interfaces',
          summary: `Updated matrix management-interface conventions (term ${next.matrixInterfaceDefaultTermDays}d, warn ${next.matrixInterfaceDueWarnDays}d, ask ${next.matrixInterfaceReviewAskDays}d).`,
        },
      );

      const report = buildMatrixInterfaceReport(store.state, { now: at, settings: store.state.settings || {} });
      return { ok: true, conventions: next, report };
    },
  };
}
