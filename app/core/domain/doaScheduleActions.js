/**
 * app/core/domain/doaScheduleActions.js — governed commands for the Standing
 * Delegation-of-Authority (DoA) Schedule & Cross-Line Limit Conformance engine
 * (ADR-0174, Schema v138, `RULE-DOA-01`).
 *
 * Commands:
 *   doaDeclareLimit     senior principal (or operator) grants a dated standing
 *                       signing limit; enforces anti-self-grant and nemo-dat
 *                       (grantor cannot grant more than they hold).
 *   doaRetireLimit      senior principal (or operator) retires an active limit
 *                       append-only with a printed reason.
 *   doaPriceDecision    records an explicit typed monetary stake for a decided
 *                       decision without mutating `state.decisions`.
 *   doaScan             explicit post-commit scan triggering `RULE-DOA-01`.
 *   doaSetConventions   director+ updates clamped ask window & auto-propagate.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats } from './seat.js';
import { buildNameIndex } from './rightsConcordance.js';
import { readHand } from './sodRegister.js';
import {
  compileDoaSchedule,
  doaCandidates,
  resolveSeatLimitOn,
} from './doaSchedule.js';
import {
  DOA_BOUNDS,
  DOA_EVENTS,
  DOA_LINE_SCOPE_KEYS,
  DOA_SCOPE_CLASS_KEYS,
} from './doaScheduleRegistry.js';
import {
  amountToCents,
  appendDoaActBounded,
  centsToFixed,
  normalizeDoaSettings,
  validCalendarDay,
  validateDoaAct,
} from './doaScheduleSchema.js';

const fail = (error, field = 'doaSchedule') => ({ ok: false, error, field });

function windowsOverlap(fromA, toA, fromB, toB) {
  const endA = toA || '9999-12-31';
  const endB = toB || '9999-12-31';
  return fromA <= endB && fromB <= endA;
}

export function createDoaScheduleActions({ store, uid, now = () => new Date() }) {
  const resolveContext = (at) => {
    const state = store.state;
    const settings = state.settings || {};
    const matrix = buildMatrix(state, { now: at, settings });
    const lineScope = matrixLineScope(matrix);
    const seats = buildSeats(state, { now: at, settings, lineScope: lineScope.byManager });
    const acting = activeSeat(seats, settings);
    return { state, settings, matrix, lineScope, seats, acting };
  };

  const makeId = (prefix) => (typeof uid === 'function' ? uid(prefix) : `${prefix}-${Math.random().toString(36).slice(2, 10)}`);

  return {
    doaCandidates(options = {}) {
      const at = options.now instanceof Date ? options.now : now();
      return { ok: true, candidates: doaCandidates(store.state, { now: at, settings: store.state.settings || {} }) };
    },

    doaDeclareLimit(input = {}) {
      const at = now();
      const today = dayKey(at);
      const { state, matrix, acting } = resolveContext(at);

      const seatId = typeof input.seatId === 'string' ? input.seatId.trim() : '';
      if (!seatId) return fail('Choose the seat receiving the standing authority limit.', 'seatId');

      const peopleById = new Map(
        (state.people || []).filter((p) => p && p.id && p.status !== 'archived').map((p) => [p.id, p]),
      );
      if (seatId !== LEADER_ID && !peopleById.has(seatId)) {
        return fail('Target seat is not an active roster person or workspace leader.', 'seatId');
      }

      if (!acting.fullAccess) {
        if (acting.id === seatId) {
          return fail('Self-grant refused: a seat cannot grant or raise its own standing authority limit.', 'seatId');
        }
        const targetNode = matrix.nodes.get(seatId) || null;
        if (!targetNode?.ancestors?.has(acting.id)) {
          return fail('Standing authority may only be granted to a seat inside your downward reporting or matrix span.', 'seatId');
        }
      }

      const lineKind = typeof input.lineKind === 'string' ? input.lineKind.trim() : 'any-line';
      if (!DOA_LINE_SCOPE_KEYS.includes(lineKind)) {
        return fail('Choose a valid reporting-line scope for this limit.', 'lineKind');
      }

      const scopeClass = typeof input.scopeClass === 'string' ? input.scopeClass.trim() : 'general';
      if (!DOA_SCOPE_CLASS_KEYS.includes(scopeClass)) {
        return fail('Choose a valid expenditure scope class.', 'scopeClass');
      }

      const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
      if (!/^[A-Z]{3}$/.test(currency)) {
        return fail('Currency must be a 3-letter ISO code (for example USD, EUR, DKK).', 'currency');
      }

      const limitCents = Number.isSafeInteger(input.limitCents) && input.limitCents >= 0 && input.limitCents <= DOA_BOUNDS.maxCents
        ? input.limitCents
        : amountToCents(input.limit);
      if (limitCents === null) {
        return fail('Enter a valid non-negative authority limit.', 'limit');
      }

      const effectiveFrom = validCalendarDay(input.effectiveFrom) || today;
      const hasTo = input.effectiveTo !== null && input.effectiveTo !== undefined && String(input.effectiveTo).trim() !== '';
      const effectiveTo = hasTo ? validCalendarDay(String(input.effectiveTo).trim()) : null;
      if (hasTo && (!effectiveTo || effectiveTo < effectiveFrom)) {
        return fail('Effective end date must be a valid calendar date on or after the start date.', 'effectiveTo');
      }

      const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
      if (reason.length < DOA_BOUNDS.reasonMinChars) {
        return fail(`Record a written authorization basis of at least ${DOA_BOUNDS.reasonMinChars} characters.`, 'reason');
      }

      const { declarations } = compileDoaSchedule(state.doaSchedule);

      // Nemo dat quod non habet at schedule-grant time for non-operator principals
      if (!acting.fullAccess) {
        const grantorLine = lineKind === 'any-line' ? 'functional' : lineKind;
        const grantorCheck = resolveSeatLimitOn(declarations, acting.id, grantorLine, scopeClass, currency, effectiveFrom);
        if (grantorCheck.state !== 'scheduled') {
          return fail(
            `Nemo dat quod non habet: your seat holds no active ${currency} standing limit covering (${grantorLine}, ${scopeClass}) on ${effectiveFrom}, so you cannot grant one.`,
            'limit',
          );
        }
        if (limitCents > grantorCheck.limitCents) {
          return fail(
            `Nemo dat quod non habet: granted limit ${currency} ${centsToFixed(limitCents)} exceeds your own active limit of ${currency} ${centsToFixed(grantorCheck.limitCents)} on ${effectiveFrom}.`,
            'limit',
          );
        }
      }

      // Prevent silent contradictory overlapping declarations
      for (const existing of declarations) {
        if (existing.retiredOn && existing.retiredOn <= effectiveFrom) continue;
        if (
          existing.seatId === seatId
          && existing.lineKind === lineKind
          && existing.scopeClass === scopeClass
          && existing.currency === currency
          && windowsOverlap(existing.effectiveFrom, existing.retiredOn || existing.effectiveTo, effectiveFrom, effectiveTo)
        ) {
          return fail(
            'An active standing limit already overlaps this window for the same seat, line kind, scope class and currency; retire the existing entry first.',
            'effectiveFrom',
          );
        }
      }

      const rawAct = {
        id: makeId('doa'),
        kind: 'declare',
        seatId,
        lineKind,
        scopeClass,
        currency,
        limitCents,
        effectiveFrom,
        effectiveTo,
        decidedBySeatId: acting.fullAccess ? LEADER_ID : acting.id,
        decidedOn: today,
        decidedAt: at.toISOString(),
        reason,
      };
      const validated = validateDoaAct(rawAct);
      if (!validated.ok) return fail(validated.error);

      store.update(
        (draft) => {
          draft.doaSchedule = appendDoaActBounded(draft.doaSchedule, validated.act);
        },
        {
          type: DOA_EVENTS.DECLARE,
          entity: 'doa',
          entityId: validated.act.id,
          summary: `Declared standing DoA limit ${currency} ${centsToFixed(limitCents)} (${lineKind} · ${scopeClass}) from ${effectiveFrom}.`,
        },
      );

      return { ok: true, act: validated.act };
    },

    doaRetireLimit(input = {}) {
      const at = now();
      const today = dayKey(at);
      const { state, matrix, acting } = resolveContext(at);

      const targetLimitId = typeof input.targetLimitId === 'string' ? input.targetLimitId.trim() : '';
      if (!targetLimitId) return fail('Choose an active standing limit to retire.', 'targetLimitId');

      const { declarations } = compileDoaSchedule(state.doaSchedule);
      const target = declarations.find((d) => d.id === targetLimitId);
      if (!target) return fail('Standing limit was not found.', 'targetLimitId');
      if (target.retiredOn) return fail('Standing limit is already retired.', 'targetLimitId');

      if (!acting.fullAccess) {
        if (acting.id === target.seatId) {
          return fail('A seat cannot unilaterally retire its own standing schedule entry; a senior principal must record the retirement.', 'targetLimitId');
        }
        const targetNode = matrix.nodes.get(target.seatId) || null;
        if (!targetNode?.ancestors?.has(acting.id)) {
          return fail('You may only retire standing limits for seats inside your downward reporting or matrix span.', 'targetLimitId');
        }
      }

      const retiredOn = validCalendarDay(input.retiredOn) || today;
      if (retiredOn < target.effectiveFrom) {
        return fail('Retirement date cannot precede the limit’s effective start date.', 'retiredOn');
      }

      const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
      if (reason.length < DOA_BOUNDS.reasonMinChars) {
        return fail(`Record a retirement reason of at least ${DOA_BOUNDS.reasonMinChars} characters.`, 'reason');
      }

      const rawAct = {
        id: makeId('doa-ret'),
        kind: 'retire',
        targetLimitId: target.id,
        seatId: target.seatId,
        retiredOn,
        decidedBySeatId: acting.fullAccess ? LEADER_ID : acting.id,
        decidedOn: today,
        decidedAt: at.toISOString(),
        reason,
      };
      const validated = validateDoaAct(rawAct);
      if (!validated.ok) return fail(validated.error);

      store.update(
        (draft) => {
          draft.doaSchedule = appendDoaActBounded(draft.doaSchedule, validated.act);
        },
        {
          type: DOA_EVENTS.RETIRE,
          entity: 'doa',
          entityId: validated.act.id,
          summary: `Retired standing DoA limit ${target.id} effective ${retiredOn}.`,
        },
      );

      return { ok: true, act: validated.act };
    },

    doaPriceDecision(input = {}) {
      const at = now();
      const today = dayKey(at);
      const { state, acting } = resolveContext(at);

      const decisionId = typeof input.decisionId === 'string' ? input.decisionId.trim() : '';
      const decision = (state.decisions || []).find((d) => d && d.id === decisionId);
      if (!decision || !String(decision.chosen || '').trim()) {
        return fail('Select a decided decision record to record a typed monetary stake.', 'decisionId');
      }

      if (!acting.fullAccess) {
        const visible = new Set([acting.id, ...(acting.scopeIds || []), ...(acting.lineScopeIds || [])]);
        const nameIndex = buildNameIndex(state);
        const appHand = readHand(nameIndex, decision.approver);
        const drvHand = readHand(nameIndex, decision.driver);
        const touchesSpan = (appHand.state === 'resolved' && visible.has(appHand.personId))
          || (drvHand.state === 'resolved' && visible.has(drvHand.personId));
        if (!touchesSpan) {
          return fail('That decision lies outside your seat’s reporting and matrix span.', 'decisionId');
        }
      }

      const scopeClass = typeof input.scopeClass === 'string' ? input.scopeClass.trim() : 'general';
      if (!DOA_SCOPE_CLASS_KEYS.includes(scopeClass)) {
        return fail('Choose a valid expenditure scope class.', 'scopeClass');
      }
      const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
      if (!/^[A-Z]{3}$/.test(currency)) {
        return fail('Currency must be a 3-letter ISO code.', 'currency');
      }
      const amountCents = Number.isSafeInteger(input.amountCents) && input.amountCents >= 0 && input.amountCents <= DOA_BOUNDS.maxCents
        ? input.amountCents
        : amountToCents(input.amount);
      if (amountCents === null) {
        return fail('Enter a valid non-negative monetary amount.', 'amount');
      }
      const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
      if (reason.length < DOA_BOUNDS.reasonMinChars) {
        return fail(`Record a pricing note of at least ${DOA_BOUNDS.reasonMinChars} characters.`, 'reason');
      }

      const rawAct = {
        id: makeId('doa-prc'),
        kind: 'price-decision',
        decisionId,
        seatId: acting.fullAccess ? LEADER_ID : acting.id,
        scopeClass,
        currency,
        amountCents,
        decidedBySeatId: acting.fullAccess ? LEADER_ID : acting.id,
        decidedOn: today,
        decidedAt: at.toISOString(),
        reason,
      };
      const validated = validateDoaAct(rawAct);
      if (!validated.ok) return fail(validated.error);

      store.update(
        (draft) => {
          draft.doaSchedule = appendDoaActBounded(draft.doaSchedule, validated.act);
        },
        {
          type: DOA_EVENTS.PRICE_DECISION,
          entity: 'decision',
          entityId: decisionId,
          summary: `Recorded typed monetary stake ${currency} ${centsToFixed(amountCents)} (${scopeClass}) for decision ${decisionId}.`,
        },
      );

      return { ok: true, act: validated.act };
    },

    doaScan() {
      store.update(
        () => {},
        {
          type: DOA_EVENTS.SCAN,
          entity: 'workspace',
          entityId: 'matrix-doa',
          summary: 'Explicit delegation-of-authority conformance scan across mandates, budgets and decisions.',
        },
      );
      return { ok: true };
    },

    doaSetConventions(input = {}) {
      const cfg = normalizeDoaSettings(store.state.settings || {});
      const next = normalizeDoaSettings({
        doaAskDueDays: input.doaAskDueDays ?? cfg.doaAskDueDays,
        doaAutoPropagate: input.doaAutoPropagate ?? cfg.doaAutoPropagate,
      });
      store.update(
        (draft) => {
          draft.settings = { ...(draft.settings || {}), ...next };
        },
        {
          type: DOA_EVENTS.CONVENTIONS,
          entity: 'settings',
          entityId: 'doa-conventions',
          summary: `Updated delegation-of-authority conventions (ratification ask due ${next.doaAskDueDays}d, autoPropagate=${next.doaAutoPropagate}).`,
        },
      );
      return { ok: true, conventions: next };
    },
  };
}
