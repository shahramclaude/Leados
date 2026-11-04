/**
 * app/core/domain/catchballActions.js — reviewed command & read mixin for the
 * Hoshin Kanri & Catchball Cascade (`#/catchball`, Schema v90, ADR-0084).
 *
 * Mounted on `api` in `app/actions.js` prior to `guardApi(api, store)` so every
 * method is mediated by the central ADR-0080 gateway (`API_RIGHTS['negotiate-catchball']`
 * and `SAFE_READS`). Enforces:
 *   1. Tree-scoped proposal & sideways peer isolation under declared seats;
 *   2. Bilateral Catchball consent (upstream cannot self-accept on behalf of a
 *      subordinate span under a declared seat);
 *   3. Silent-Overload Refusal (`priceSpanFeasibility` against `buildLoadReport`);
 *   4. Same-currency commitment-accounting encumbrance on `budgets` when
 *      `budgetId` + `resourceAskAmount` are agreed; and
 *   5. Once-only out-of-sample settlement grading.
 */

import { addDays, dayKey } from '../time.js';
import { ALTITUDE_KEYS, altitudeByKey } from './chainRegistry.js';
import { activeSeat, buildSeats, canAct, canSee } from './seat.js';
import {
  buildCatchballReport,
  catchballBriefText,
  catchballCsvRows,
  priceSpanFeasibility,
  projectCatchballReport,
} from './catchball.js';
import {
  normalizeCatchballPact,
  normalizeCatchballRound,
  normalizeCatchballSettings,
} from './catchballSchema.js';
import {
  CATCHBALL_EVENTS,
  CATCHBALL_LIMITS,
  CORRELATION_STRENGTHS,
  COUNTER_MECHANISMS,
  GRADED_OUTCOMES,
  TRADEOFF_SOURCE_TYPES,
} from './catchballRegistry.js';

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function createCatchballActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const settings = () => store.state.settings || {};
  const pacts = () => (Array.isArray(store.state.catchballPacts) ? store.state.catchballPacts : []);
  const rounds = () => (Array.isArray(store.state.catchballRounds) ? store.state.catchballRounds : []);
  const findPact = (id) => pacts().find((p) => p && p.id === id) || null;

  function resolveOperatingSeat() {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    return { built, seat };
  }

  function verifySeatRight(targetSpanId = null, { requireReceiverSelf = false } = {}) {
    const { built, seat } = resolveOperatingSeat();
    if (seat.fullAccess) return { error: null, seat, built };
    const right = canAct('negotiate-catchball', seat);
    if (!right.allow) return { error: fail(right.reason, 'scope'), seat, built };
    if (targetSpanId) {
      const inSpan = seat.id === targetSpanId || Boolean(seat.scope?.has(targetSpanId));
      if (!inSpan) {
        return {
          error: fail(
            'This Catchball pact belongs to a peer or upstream span outside your operating seat. Route cross-span trade-offs through the lowest common leader.',
            'scope',
          ),
          seat,
          built,
        };
      }
      if (requireReceiverSelf && seat.id !== targetSpanId) {
        return {
          error: fail(
            'Silence or ancestor override is never consent in Catchball: only the receiving span seat (or undeclared operator) can accept this pact.',
            'scope',
          ),
          seat,
          built,
        };
      }
    }
    return { error: null, seat, built };
  }

  function requireRoomForRound() {
    return rounds().length >= CATCHBALL_LIMITS.rounds
      ? fail('The Catchball round log is full; export the history before continuing.', 'catchballRounds') : null;
  }

  // A reviewed adapter may not read or encumber another span's budget simply
  // by guessing its id. The operator retains the pre-seat workspace view.
  function budgetAccess(budgetId, seat, built) {
    if (!budgetId) return null;
    const budget = (store.state.budgets || []).find((b) => b && b.id === budgetId);
    if (!budget) return fail('Selected budget envelope does not exist.', 'budgetId');
    if (!seat.fullAccess && (canSee(budget, 'budgets', seat, built).allow !== 'full'
      || (!budget.ownerId && !seat.isLeader))) {
      return fail('This budget is outside the operating seat’s detail and authority boundary.', 'budgetId');
    }
    return null;
  }

  function validateTradeOffTarget(sourceType, sourceId, seat, built) {
    if (!sourceType && !sourceId) return null;
    if (!TRADEOFF_SOURCE_TYPES.includes(sourceType)) {
      return 'Choose a valid trade-off record type (portfolio, goal, or case).';
    }
    if (!sourceId || typeof sourceId !== 'string') {
      return 'Select the concrete commitment being de-scoped or deferred.';
    }
    const collection = sourceType === 'portfolio' ? 'portfolio' : sourceType === 'goal' ? 'goals' : 'cases';
    const record = (store.state[collection] || []).find((r) => r && r.id === sourceId);
    if (!record) return `Referenced ${sourceType} does not exist in this workspace.`;
    if (!seat.fullAccess && canSee(record, collection, seat, built).allow !== 'full') {
      return 'The trade-off is outside this seat’s detail boundary.';
    }
    if (['done', 'closed', 'resolved', 'archived', 'cancelled', 'canceled'].includes(record.status)) {
      return 'The trade-off must name an active commitment.';
    }
    return null;
  }

  return {
    /** Read-side altitude-scoped Hoshin & Catchball report. */
    catchballRead() {
      return projectCatchballReport(buildCatchballReport(store.state, { now: clock(), settings: settings() }));
    },

    /** Pure feasibility check for UI live preview (never mutates state). */
    catchballPreviewFeasibility(seatId, opts = {}) {
      if (!seatId || typeof seatId !== 'string') return fail('Select a receiving span.', 'toSeatId');
      const { error, seat, built } = verifySeatRight(seatId);
      if (error) return error;
      if (!seat.fullAccess && seat.rank >= 4) return fail('Individual feasibility is withheld at this altitude.', 'scope');
      if (!(store.state.people || []).some((p) => p.id === seatId && p.status !== 'archived')) return fail('Receiving span not found.', 'toSeatId');
      const budgetError = budgetAccess(opts.budgetId, seat, built);
      if (budgetError) return budgetError;
      return {
        ok: true,
        feasibility: priceSpanFeasibility(store.state, seatId, { ...opts, now: clock() }),
      };
    },

    /** Propose a downward or span-level Hoshin Catchball pact (Round #1). */
    catchballPropose(input = {}) {
      const toSeatId = typeof input.toSeatId === 'string' ? input.toSeatId.trim() : '';
      if (!toSeatId) return fail('Choose the receiving span owner for this pact.', 'toSeatId');
      const person = (store.state.people || []).find((p) => p && p.id === toSeatId && p.status !== 'archived');
      if (!person) return fail('The receiving span owner must be an active person in the roster.', 'toSeatId');

      const { error: seatErr, seat, built } = verifySeatRight(toSeatId);
      if (seatErr) return seatErr;

      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (title.length < 4) return fail('Give the Catchball pact a clear title (at least 4 characters).', 'title');
      if (pacts().length >= CATCHBALL_LIMITS.pacts) {
        return fail(`The Catchball ledger is at its ${CATCHBALL_LIMITS.pacts}-pact cap.`, 'catchballPacts');
      }
      if (rounds().length >= CATCHBALL_LIMITS.rounds) {
        return fail(`The Catchball round log is at its ${CATCHBALL_LIMITS.rounds}-round cap.`, 'catchballRounds');
      }

      if (input.strategyBetId) {
        const bet = (store.state.strategyBets || []).find((b) => b && b.id === input.strategyBetId);
        if (!bet) return fail('Selected Breakthrough Bet does not exist.', 'strategyBetId');
      }
      if (input.parentPactId) {
        const parent = findPact(input.parentPactId);
        if (!parent || parent.status === 'withdrawn') {
          return fail('Selected parent Catchball pact does not exist or was withdrawn.', 'parentPactId');
        }
        if (!seat.fullAccess && !seat.scope.has(parent.toSeatId)) return fail('The parent pact is outside this seat’s span.', 'parentPactId');
        const parentNode = built.chain.nodes.get(parent.toSeatId);
        if (!parentNode?.subtreeIds?.includes(toSeatId)) return fail('A child pact must cascade within its parent’s reporting subtree.', 'parentPactId');
      }
      if (input.linkedGoalId) {
        const goal = (store.state.goals || []).find((g) => g.id === input.linkedGoalId);
        if (!goal || (!seat.fullAccess && canSee(goal, 'goals', seat, built).allow !== 'full')) return fail('The linked goal is missing or outside this seat’s scope.', 'linkedGoalId');
      }
      if (input.premiseId) {
        const prem = (store.state.premises || []).find((p) => p && p.id === input.premiseId);
        if (!prem) return fail('Selected assumption does not exist.', 'premiseId');
      }

      const receiverNode = built.byId.get(toSeatId);
      const inferredAlt = receiverNode?.altitudeKey || 'frontline';
      const altitudeKey = ALTITUDE_KEYS.includes(input.altitudeKey) ? input.altitudeKey : inferredAlt;
      const altDef = altitudeByKey(altitudeKey);
      const horizonDays = Number.isInteger(Number(input.horizonDays)) && Number(input.horizonDays) > 0
        ? Math.round(Number(input.horizonDays))
        : (altDef?.horizonDays || 30);
      const correlation = CORRELATION_STRENGTHS.includes(input.correlation) ? input.correlation : 'strong';
      if (horizonDays > 730) return fail('Horizon cannot exceed 730 days.', 'horizonDays');
      if (input.effortDays != null && input.effortDays !== '' && (!Number.isFinite(Number(input.effortDays)) || Number(input.effortDays) < 0)) return fail('Effort must be a non-negative number.', 'effortDays');
      if (input.startsOn && !validDay(input.startsOn)) return fail('Start date must be a real calendar day.', 'startsOn');
      if (input.dueOn && !validDay(input.dueOn)) return fail('Due date must be a real calendar day.', 'dueOn');

      const at = clock();
      const today = dayKey(at);
      const nowIso = at.toISOString();
      const startsOn = typeof input.startsOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.startsOn)
        ? input.startsOn
        : today;
      const dueOn = typeof input.dueOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)
        ? input.dueOn
        : addDays(startsOn, horizonDays);
      if (dueOn < startsOn) return fail('Due date cannot precede start date.', 'dueOn');

      const fromSeatId = seat.fullAccess
        ? (typeof input.fromSeatId === 'string' && input.fromSeatId.trim() ? input.fromSeatId.trim() : (person.managerId || 'leader'))
        : seat.id;
      if (fromSeatId !== 'leader' && !built.chain.nodes.has(fromSeatId)) return fail('Sending seat does not exist.', 'fromSeatId');
      const budgetError = budgetAccess(input.budgetId, seat, built);
      if (budgetError) return budgetError;

      const pactId = idFactory('pact');
      const roundId = idFactory('cbr');

      let budgetCurrency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : null;
      if (input.budgetId) {
        const b = (store.state.budgets || []).find((x) => x && x.id === input.budgetId);
        if (!b) return fail('Selected budget envelope does not exist.', 'budgetId');
        if (!budgetCurrency) budgetCurrency = String(b.currency || 'USD').toUpperCase();
        if (budgetCurrency !== String(b.currency || 'USD').toUpperCase()) {
          return fail(`Currency mismatch: budget "${b.name}" is ${b.currency}, not ${budgetCurrency}.`, 'currency');
        }
      }

      const rawPact = normalizeCatchballPact({
        id: pactId,
        title,
        summary: input.summary || '',
        strategyBetId: input.strategyBetId || null,
        parentPactId: input.parentPactId || null,
        premiseId: input.premiseId || null,
        fromSeatId,
        toSeatId,
        ownerId: toSeatId,
        altitudeKey,
        horizonDays,
        correlation,
        status: 'proposed',
        leadingMetric: input.leadingMetric || 'Weekly process execution rate',
        leadingUnit: input.leadingUnit || '%',
        leadingTarget: input.leadingTarget ?? 100,
        leadingActual: null,
        leadingPct: null,
        laggingMetric: input.laggingMetric || 'Target outcome realization',
        laggingUnit: input.laggingUnit || '%',
        laggingTarget: input.laggingTarget ?? 100,
        laggingActual: null,
        laggingPct: null,
        reportedPct: null,
        effortDays: Number(input.effortDays) || 0,
        budgetId: input.budgetId || null,
        currency: budgetCurrency,
        resourceAskAmount: input.resourceAskAmount ?? null,
        encumberedLineId: null,
        linkedGoalId: input.linkedGoalId || null,
        tradeOffSourceType: null,
        tradeOffSourceId: null,
        tradeOffNote: '',
        overloadBandAtAccept: null,
        overloadJustification: '',
        frozenConfidencePct: input.confidencePct ?? null,
        roundCount: 1,
        startsOn,
        dueOn,
        agreedOn: null,
        gradedOn: null,
        gradedOutcome: null,
        gradeNote: '',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      if (!rawPact) return fail('Catchball pact failed validation.');

      const rawRound = normalizeCatchballRound({
        id: roundId,
        pactId,
        roundNumber: 1,
        kind: 'propose',
        actorSeatId: fromSeatId,
        ownerId: toSeatId,
        mechanism: 'none',
        proposedEffortDays: rawPact.effortDays,
        proposedLaggingTarget: rawPact.laggingTarget,
        proposedDueOn: rawPact.dueOn,
        resourceAskAmount: rawPact.resourceAskAmount,
        currency: rawPact.currency,
        confidencePct: rawPact.frozenConfidencePct,
        note: input.summary || `Proposed ${altitudeKey} pact (${horizonDays}d).`,
        recordedOn: today,
        createdAt: nowIso,
      });

      store.update(
        (draft) => {
          draft.catchballPacts = Array.isArray(draft.catchballPacts) ? draft.catchballPacts : [];
          draft.catchballRounds = Array.isArray(draft.catchballRounds) ? draft.catchballRounds : [];
          draft.catchballPacts.unshift(rawPact);
          if (rawRound) draft.catchballRounds.push(rawRound);
        },
        {
          type: CATCHBALL_EVENTS.PROPOSED,
          entity: 'catchballpact',
          entityId: pactId,
          summary: `Proposed Hoshin Catchball pact "${rawPact.title}" (${rawPact.altitudeKey}, ${rawPact.horizonDays}d, ${rawPact.effortDays}d effort).`,
        },
      );

      return saved({ pact: findPact(pactId), roundId });
    },

    /** Counter upward with a priced scope-trim, trade-off, or resource-ask. */
    catchballCounter(pactId, input = {}) {
      const pact = findPact(pactId);
      if (!pact) return fail('Catchball pact not found.', 'pactId');
      if (!['proposed', 'countered'].includes(pact.status)) {
        return fail(`Cannot counter a pact in status "${pact.status}".`, 'status');
      }
      const { error: seatErr, seat, built } = verifySeatRight(pact.toSeatId, { requireReceiverSelf: true });
      if (seatErr) return seatErr;
      const roundError = requireRoomForRound();
      if (roundError) return roundError;

      const mechanism = input.mechanism;
      if (!COUNTER_MECHANISMS.includes(mechanism) || mechanism === 'none') {
        return fail('A Catchball counter-offer must declare a concrete mechanism: scope-trim, trade-off, or resource-ask.', 'mechanism');
      }

      const tradeErr = mechanism === 'trade-off'
        ? validateTradeOffTarget(input.tradeOffSourceType, input.tradeOffSourceId, seat, built)
        : validateTradeOffTarget(input.tradeOffSourceType || null, input.tradeOffSourceId || null, seat, built);
      if (tradeErr) return fail(tradeErr, 'tradeOffSourceId');
      if (mechanism === 'trade-off' && !input.tradeOffSourceId) {
        return fail('A trade-off counter must name the portfolio item, goal, or case to de-scope.', 'tradeOffSourceId');
      }

      if (input.proposedDueOn && (!validDay(input.proposedDueOn) || (pact.startsOn && input.proposedDueOn < pact.startsOn))) return fail('Enter a valid due date on or after the start.', 'proposedDueOn');
      if (mechanism === 'scope-trim') {
        const effort = input.proposedEffortDays === '' || input.proposedEffortDays == null ? pact.effortDays : Number(input.proposedEffortDays);
        const target = input.proposedLaggingTarget === '' || input.proposedLaggingTarget == null ? pact.laggingTarget : Number(input.proposedLaggingTarget);
        const due = input.proposedDueOn || pact.dueOn;
        if (!Number.isFinite(effort) || effort < 0 || !Number.isFinite(target) || target < 0
          || !(effort < pact.effortDays || (pact.laggingTarget != null && target < pact.laggingTarget) || (due && pact.dueOn && due > pact.dueOn))) {
          return fail('A scope-trim must reduce effort or target, or extend the due date.', 'mechanism');
        }
      }
      let nextBudgetId = input.budgetId !== undefined ? (input.budgetId || null) : pact.budgetId;
      const budgetError = budgetAccess(nextBudgetId, seat, built);
      if (budgetError) return budgetError;
      let nextCurrency = input.currency ? String(input.currency).trim().toUpperCase() : pact.currency;
      const nextAsk = input.resourceAskAmount !== undefined && input.resourceAskAmount !== ''
        ? Number(input.resourceAskAmount)
        : pact.resourceAskAmount;

      if (mechanism === 'resource-ask' && (!Number.isFinite(nextAsk) || nextAsk <= 0) && input.proposedEffortDays === undefined) {
        return fail('A resource-ask counter must specify a positive budget amount or revised effort days.', 'resourceAskAmount');
      }
      if (nextBudgetId) {
        const budget = (store.state.budgets || []).find((b) => b && b.id === nextBudgetId);
        if (!budget) return fail('Selected budget envelope does not exist.', 'budgetId');
        const bCur = String(budget.currency || 'USD').toUpperCase();
        if (!nextCurrency) nextCurrency = bCur;
        if (nextCurrency !== bCur) {
          return fail(`Currency mismatch: budget "${budget.name}" is ${bCur}, not ${nextCurrency}.`, 'currency');
        }
      }

      const at = clock();
      const today = dayKey(at);
      const nowIso = at.toISOString();
      const nextRoundNum = (pact.roundCount || 1) + 1;
      const roundId = idFactory('cbr');
      const actorSeatId = seat.fullAccess ? pact.toSeatId : seat.id;

      const rawRound = normalizeCatchballRound({
        id: roundId,
        pactId: pact.id,
        roundNumber: nextRoundNum,
        kind: 'counter',
        actorSeatId,
        ownerId: pact.toSeatId,
        mechanism,
        proposedEffortDays: input.proposedEffortDays ?? pact.effortDays,
        proposedLaggingTarget: input.proposedLaggingTarget ?? pact.laggingTarget,
        proposedDueOn: input.proposedDueOn || pact.dueOn,
        resourceAskAmount: nextAsk,
        currency: nextCurrency,
        tradeOffSourceType: input.tradeOffSourceType || null,
        tradeOffSourceId: input.tradeOffSourceId || null,
        confidencePct: input.confidencePct ?? pact.frozenConfidencePct,
        note: input.note || `Counter-proposal (${mechanism}).`,
        recordedOn: today,
        createdAt: nowIso,
      });
      if (!rawRound) return fail('Counter-offer round failed validation.');

      store.update(
        (draft) => {
          const target = (draft.catchballPacts || []).find((p) => p && p.id === pact.id);
          if (!target) return;
          target.status = 'countered';
          target.roundCount = nextRoundNum;
          if (rawRound.proposedEffortDays !== null) target.effortDays = rawRound.proposedEffortDays;
          if (rawRound.proposedLaggingTarget !== null) target.laggingTarget = rawRound.proposedLaggingTarget;
          if (rawRound.proposedDueOn && (!target.startsOn || rawRound.proposedDueOn >= target.startsOn)) {
            target.dueOn = rawRound.proposedDueOn;
          }
          target.budgetId = nextBudgetId;
          target.currency = nextCurrency;
          target.resourceAskAmount = rawRound.resourceAskAmount;
          if (rawRound.tradeOffSourceId) {
            target.tradeOffSourceType = rawRound.tradeOffSourceType;
            target.tradeOffSourceId = rawRound.tradeOffSourceId;
          }
          if (input.note) target.tradeOffNote = String(input.note).trim().slice(0, 280);
          if (rawRound.confidencePct !== null) target.frozenConfidencePct = rawRound.confidencePct;
          target.updatedAt = nowIso;

          draft.catchballRounds = Array.isArray(draft.catchballRounds) ? draft.catchballRounds : [];
          draft.catchballRounds.push(rawRound);
        },
        {
          type: CATCHBALL_EVENTS.COUNTERED,
          entity: 'catchballpact',
          entityId: pact.id,
          summary: `Round #${nextRoundNum} Catchball counter-offer on "${pact.title}" via ${mechanism}.`,
        },
      );

      return saved({ pact: findPact(pact.id), roundId });
    },

    /**
     * Bilateral acceptance: enforces Silent-Overload Guard against `load.js`,
     * encumbers `committed` budget authority when requested, and optionally
     * creates an active execution `goal` owned by the receiving span.
     */
    catchballAccept(pactId, input = {}) {
      const pact = findPact(pactId);
      if (!pact) return fail('Catchball pact not found.', 'pactId');
      if (!['proposed', 'countered'].includes(pact.status)) {
        return fail(`Only proposed or countered pacts can be accepted (current: "${pact.status}").`, 'status');
      }

      const { error: seatErr, seat, built } = verifySeatRight(pact.toSeatId, { requireReceiverSelf: true });
      if (seatErr) return seatErr;
      const roundError = requireRoomForRound();
      if (roundError) return roundError;

      const at = clock();
      const today = dayKey(at);
      const nowIso = at.toISOString();

      const budgetId = input.budgetId !== undefined ? (input.budgetId || null) : pact.budgetId;
      const askAmount = input.resourceAskAmount !== undefined
        ? Number(input.resourceAskAmount)
        : pact.resourceAskAmount;
      const currency = input.currency ? String(input.currency).trim().toUpperCase() : pact.currency;
      if (askAmount != null && (!Number.isFinite(Number(askAmount)) || Number(askAmount) < 0)) return fail('Enter a valid non-negative budget amount.', 'resourceAskAmount');
      if (Number(askAmount) > 0 && !budgetId) return fail('A priced resource ask requires an authorized budget envelope before agreement.', 'budgetId');
      const budgetError = budgetAccess(budgetId, seat, built);
      if (budgetError) return budgetError;
      const budget = budgetId ? (store.state.budgets || []).find((b) => b.id === budgetId) : null;
      if (Number(askAmount) > 0 && (budget?.lines || []).length >= 120) return fail('The budget has reached its 120-line limit.', 'budgetId');

      const feasibility = priceSpanFeasibility(store.state, pact.toSeatId, {
        effortDays: pact.effortDays,
        budgetId,
        resourceAskAmount: askAmount,
        currency,
        now: at,
      });

      const hasPriorCounter = rounds().some(
        (r) => r && r.pactId === pact.id && r.kind === 'counter' && ['scope-trim', 'trade-off'].includes(r.mechanism),
      );
      const hasTradeOff = Boolean(pact.tradeOffSourceId);
      const justification = typeof input.overloadJustification === 'string'
        ? input.overloadJustification.trim()
        : '';

      if (feasibility.silentOverloadBlocked && !hasTradeOff && !hasPriorCounter && justification.length < 12) {
        return fail(
          `Silent-Overload Refusal: span load band is "${feasibility.band}" (${feasibility.postPactDays}d vs ${feasibility.allocatableDays ?? '—'}d allocatable). Counter with a scope-trim or trade-off first, or record an explicit >=12-char overload justification.`,
          'overloadJustification',
        );
      }

      if (budgetId && askAmount !== null && askAmount !== undefined && Number(askAmount) > 0) {
        if (!feasibility.budget || !feasibility.budget.ok) {
          return fail(
            feasibility.budget?.reason || 'Requested budget encumbrance cannot be satisfied.',
            'budgetId',
          );
        }
      }

      const confidencePct = input.confidencePct !== undefined && input.confidencePct !== null && input.confidencePct !== ''
        ? Number(input.confidencePct) : pact.frozenConfidencePct;
      if (confidencePct != null && (!Number.isFinite(confidencePct) || confidencePct < 0 || confidencePct > 100)) {
        return fail('Confidence must be between 0 and 100, or left blank.', 'confidencePct');
      }

      const nextRoundNum = (pact.roundCount || 1) + 1;
      const roundId = idFactory('cbr');
      const createGoal = Boolean(input.createGoal) && !pact.linkedGoalId;
      const newGoalId = createGoal ? idFactory('goal') : null;
      const shouldEncumber = Boolean(budgetId && Number(askAmount) > 0 && !pact.encumberedLineId);
      const newLineId = shouldEncumber ? idFactory('bline') : null;

      store.update(
        (draft) => {
          const target = (draft.catchballPacts || []).find((p) => p && p.id === pact.id);
          if (!target) return;

          if (createGoal && newGoalId) {
            draft.goals = Array.isArray(draft.goals) ? draft.goals : [];
            draft.goals.unshift({
              id: newGoalId,
              title: target.title,
              ownerId: target.toSeatId,
              scope: 'person',
              coAuthored: true,
              horizon: target.horizonDays <= 30 ? 'month' : target.horizonDays <= 90 ? 'quarter' : 'year',
              dueDate: target.dueOn || addDays(today, target.horizonDays),
              description: `Cascaded via Hoshin Catchball pact ${target.id}. Leading: ${target.leadingMetric}; Lagging: ${target.laggingMetric}.`,
              keyResults: [
                {
                  id: idFactory('kr'),
                  title: target.laggingMetric || 'Lagging target',
                  unit: target.laggingUnit || '',
                  start: 0,
                  target: target.laggingTarget ?? 100,
                  current: target.laggingActual ?? 0,
                },
              ],
              confidence: 'on-track',
              initialConfidence: 'on-track',
              status: 'active',
              completedOn: null,
              krUpdatedOn: today,
              checkins: [],
              createdAt: nowIso,
            });
            target.linkedGoalId = newGoalId;
          }

          if (shouldEncumber && newLineId) {
            const b = (draft.budgets || []).find((x) => x && x.id === budgetId);
            if (b) {
              b.lines = Array.isArray(b.lines) ? b.lines : [];
              const resolvedGoalId = target.linkedGoalId && (draft.goals || []).some((g) => g && g.id === target.linkedGoalId)
                ? target.linkedGoalId
                : null;
              b.lines.push({
                id: newLineId,
                title: `Catchball pact: ${target.title}`.slice(0, 180),
                category: 'other',
                status: 'committed',
                committedAmount: Math.round(Number(askAmount) * 100) / 100,
                actualAmount: null,
                ownerId: target.toSeatId,
                sourceType: resolvedGoalId ? 'goal' : null,
                sourceId: resolvedGoalId,
                committedOn: today,
                expectedOn: target.dueOn || null,
                spentOn: null,
                note: `Encumbered on Catchball agreement (${target.id}).`,
                createdAt: nowIso,
              });
              target.budgetId = budgetId;
              target.currency = String(b.currency || 'USD').toUpperCase();
              target.resourceAskAmount = Math.round(Number(askAmount) * 100) / 100;
              target.encumberedLineId = newLineId;
            }
          }

          target.status = 'agreed';
          target.agreedOn = today;
          target.roundCount = nextRoundNum;
          target.frozenConfidencePct = confidencePct == null ? null : Math.round(confidencePct * 10) / 10;
          target.overloadBandAtAccept = feasibility.band;
          if (justification) target.overloadJustification = justification.slice(0, 280);
          target.updatedAt = nowIso;

          const accRound = normalizeCatchballRound({
            id: roundId,
            pactId: target.id,
            roundNumber: nextRoundNum,
            kind: 'accept',
            actorSeatId: seat.fullAccess ? target.toSeatId : seat.id,
            ownerId: target.toSeatId,
            mechanism: hasTradeOff ? 'trade-off' : hasPriorCounter ? 'scope-trim' : 'none',
            proposedEffortDays: target.effortDays,
            proposedLaggingTarget: target.laggingTarget,
            proposedDueOn: target.dueOn,
            resourceAskAmount: target.resourceAskAmount,
            currency: target.currency,
            tradeOffSourceType: target.tradeOffSourceType,
            tradeOffSourceId: target.tradeOffSourceId,
            confidencePct: target.frozenConfidencePct,
            note: input.note || justification || 'Bilateral Catchball agreement locked.',
            recordedOn: today,
            createdAt: nowIso,
          });
          draft.catchballRounds = Array.isArray(draft.catchballRounds) ? draft.catchballRounds : [];
          if (accRound) draft.catchballRounds.push(accRound);
        },
        {
          type: CATCHBALL_EVENTS.AGREED,
          entity: 'catchballpact',
          entityId: pact.id,
          summary: `Agreed Hoshin Catchball pact "${pact.title}" after ${nextRoundNum} turn(s)${confidencePct == null ? ' (confidence not supplied)' : ` (confidence ${Math.round(confidencePct)}%)`}.`,
        },
      );

      return saved({ pact: findPact(pact.id), goalId: newGoalId, encumberedLineId: newLineId });
    },

    /** Record a Bowler leading/lagging check-in on an agreed pact. */
    catchballCheckin(pactId, input = {}) {
      const pact = findPact(pactId);
      if (!pact) return fail('Catchball pact not found.', 'pactId');
      if (pact.status !== 'agreed') {
        return fail('Only agreed Catchball pacts accept Bowler check-ins.', 'status');
      }
      const { error: seatErr, seat } = verifySeatRight(pact.toSeatId);
      if (seatErr) return seatErr;
      const roundError = requireRoomForRound();
      if (roundError) return roundError;

      const leadingPct = input.leadingPct !== undefined && input.leadingPct !== ''
        ? Number(input.leadingPct)
        : pact.leadingPct;
      const laggingPct = input.laggingPct !== undefined && input.laggingPct !== ''
        ? Number(input.laggingPct)
        : pact.laggingPct;
      if (!Number.isFinite(leadingPct) || leadingPct < 0 || leadingPct > 100) {
        return fail('Provide a leading process execution percentage between 0 and 100.', 'leadingPct');
      }
      if (!Number.isFinite(laggingPct) || laggingPct < 0 || laggingPct > 100) {
        return fail('Provide a lagging outcome percentage between 0 and 100.', 'laggingPct');
      }

      const reportedPct = input.reportedPct !== undefined && input.reportedPct !== '' && input.reportedPct !== null
        ? Math.min(100, Math.max(0, Number(input.reportedPct)))
        : pact.reportedPct;

      const at = clock();
      const today = dayKey(at);
      const nowIso = at.toISOString();
      const roundId = idFactory('cbr');

      store.update(
        (draft) => {
          const target = (draft.catchballPacts || []).find((p) => p && p.id === pact.id);
          if (!target) return;
          target.leadingPct = Math.round(leadingPct * 10) / 10;
          target.laggingPct = Math.round(laggingPct * 10) / 10;
          if (input.leadingActual !== undefined && input.leadingActual !== '') {
            const v = Number(input.leadingActual);
            if (Number.isFinite(v) && v >= 0) target.leadingActual = Math.round(v * 100) / 100;
          }
          if (input.laggingActual !== undefined && input.laggingActual !== '') {
            const v = Number(input.laggingActual);
            if (Number.isFinite(v) && v >= 0) target.laggingActual = Math.round(v * 100) / 100;
          }
          if (reportedPct !== null && Number.isFinite(reportedPct)) {
            target.reportedPct = Math.round(reportedPct * 10) / 10;
          }
          target.updatedAt = nowIso;

          const chkRound = normalizeCatchballRound({
            id: roundId,
            pactId: target.id,
            roundNumber: target.roundCount,
            kind: 'checkin',
            actorSeatId: seat.fullAccess ? target.toSeatId : seat.id,
            ownerId: target.toSeatId,
            mechanism: 'none',
            leadingPct: target.leadingPct,
            laggingPct: target.laggingPct,
            reportedPct: target.reportedPct,
            note: input.note || `Bowler check-in: leading ${target.leadingPct}%, lagging ${target.laggingPct}%.`,
            recordedOn: today,
            createdAt: nowIso,
          });
          draft.catchballRounds = Array.isArray(draft.catchballRounds) ? draft.catchballRounds : [];
          if (chkRound) draft.catchballRounds.push(chkRound);
        },
        {
          type: CATCHBALL_EVENTS.CHECKIN,
          entity: 'catchballpact',
          entityId: pact.id,
          summary: `Bowler check-in on "${pact.title}": leading ${Math.round(leadingPct)}%, lagging ${Math.round(laggingPct)}%.`,
        },
      );

      return saved({ pact: findPact(pact.id), roundId });
    },

    /** Settle and grade an agreed pact ONCE for out-of-sample calibration. */
    catchballSettle(pactId, input = {}) {
      const pact = findPact(pactId);
      if (!pact) return fail('Catchball pact not found.', 'pactId');
      if (pact.status === 'settled' || pact.gradedOutcome) {
        return fail('This Catchball pact has already been settled and graded; calibration trials are immutable.', 'status');
      }
      if (pact.status !== 'agreed') {
        return fail('Only agreed Catchball pacts can be settled and graded.', 'status');
      }
      const { error: seatErr } = verifySeatRight(pact.toSeatId);
      if (seatErr) return seatErr;

      const outcome = input.gradedOutcome;
      if (!GRADED_OUTCOMES.includes(outcome)) {
        return fail('Choose a valid settlement outcome: delivered, missed, or thesis-invalidated.', 'gradedOutcome');
      }

      const at = clock();
      const today = dayKey(at);
      const nowIso = at.toISOString();

      store.update(
        (draft) => {
          const target = (draft.catchballPacts || []).find((p) => p && p.id === pact.id);
          if (!target) return;
          target.status = 'settled';
          target.gradedOn = today;
          target.gradedOutcome = outcome;
          target.gradeNote = typeof input.gradeNote === 'string' ? input.gradeNote.trim().slice(0, 280) : '';
          target.updatedAt = nowIso;
        },
        {
          type: CATCHBALL_EVENTS.GRADED,
          entity: 'catchballpact',
          entityId: pact.id,
          summary: `Settled Catchball pact "${pact.title}" as ${outcome}.`,
        },
      );

      return saved({ pact: findPact(pact.id) });
    },

    /** Withdraw an ungraded pact and release any unspent `committed` encumbrance. */
    catchballWithdraw(pactId, input = {}) {
      const pact = findPact(pactId);
      if (!pact) return fail('Catchball pact not found.', 'pactId');
      if (pact.status === 'settled' || pact.status === 'withdrawn') {
        return fail(`Cannot withdraw a pact in status "${pact.status}".`, 'status');
      }
      const { error: seatErr, seat, built } = verifySeatRight(pact.toSeatId);
      if (seatErr) return seatErr;
      const roundError = requireRoomForRound();
      if (roundError) return roundError;
      if (pact.encumberedLineId) {
        const budgetError = budgetAccess(pact.budgetId, seat, built);
        if (budgetError) return budgetError;
      }

      const at = clock();
      const today = dayKey(at);
      const nowIso = at.toISOString();
      const roundId = idFactory('cbr');

      store.update(
        (draft) => {
          const target = (draft.catchballPacts || []).find((p) => p && p.id === pact.id);
          if (!target) return;
          target.status = 'withdrawn';
          target.updatedAt = nowIso;

          // Release open `committed` encumbrance if unspent; never erase a recorded `spent` actual.
          if (target.budgetId && target.encumberedLineId) {
            const b = (draft.budgets || []).find((x) => x && x.id === target.budgetId);
            const line = (b?.lines || []).find((l) => l && l.id === target.encumberedLineId);
            if (line && line.status === 'committed') {
              line.status = 'released';
              line.releasedOn = today;
              line.releasedReason = 'Catchball pact withdrawn';
            }
          }

          const wdRound = normalizeCatchballRound({
            id: roundId,
            pactId: target.id,
            roundNumber: target.roundCount,
            kind: 'withdraw',
            actorSeatId: seat.fullAccess ? target.fromSeatId : seat.id,
            ownerId: target.toSeatId,
            mechanism: 'none',
            note: input.note || 'Pact withdrawn.',
            recordedOn: today,
            createdAt: nowIso,
          });
          draft.catchballRounds = Array.isArray(draft.catchballRounds) ? draft.catchballRounds : [];
          if (wdRound) draft.catchballRounds.push(wdRound);
        },
        {
          type: CATCHBALL_EVENTS.WITHDRAWN,
          entity: 'catchballpact',
          entityId: pact.id,
          summary: `Withdrew Catchball pact "${pact.title}".`,
        },
      );

      return saved({ pact: findPact(pact.id) });
    },

    /** Update clamped Catchball conventions. */
    catchballUpdateSettings(patch = {}) {
      const { error: seatErr, seat } = verifySeatRight();
      if (seatErr) return seatErr;
      if (!seat.fullAccess && !seat.isLeader) return fail('Workspace-wide conventions require the enterprise root or operator view.', 'scope');
      const merged = normalizeCatchballSettings({ ...settings(), ...(patch || {}) });
      store.update(
        (draft) => {
          draft.settings = { ...(draft.settings || {}), ...merged };
        },
        {
          type: 'settings.updated',
          entity: 'settings',
          entityId: 'catchball',
          summary: `Updated Catchball conventions (Watermelon gap ${merged.catchballWatermelonGapPct} pp, floor n=${merged.catchballFloorN}).`,
        },
      );
      return saved({ conventions: merged });
    },

    /** Explicit Catchball spine scan — always executes even when auto-propagation is paused. */
    catchballScan() {
      const { error: seatErr, seat } = verifySeatRight();
      if (seatErr) return seatErr;
      if (!seat.fullAccess && !seat.isLeader) return fail('A workspace-wide scan requires the enterprise root or operator view.', 'scope');
      store.update(
        () => {},
        {
          type: CATCHBALL_EVENTS.SCAN,
          entity: 'catchballpact',
          entityId: 'workspace',
          summary: 'Ran explicit Hoshin Catchball propagation and roll-up scan.',
        },
      );
      return saved({ report: projectCatchballReport(buildCatchballReport(store.state, { now: clock(), settings: settings() })) });
    },

    /** Identity-free executive Markdown brief. */
    catchballBriefText() {
      return catchballBriefText(store.state, { now: clock(), settings: settings() });
    },

    /** Aggregate-only CSV rows (#78). */
    catchballCsvRows() {
      return catchballCsvRows(store.state, { now: clock(), settings: settings() });
    },
  };
}
