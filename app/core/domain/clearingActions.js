/**
 * app/core/domain/clearingActions.js — commands and scoped adapters for the
 * Hierarchical Clearinghouse (`#/clearing`, Schema v100, ADR-0098).
 *
 * Governed DACI decisions, span delivery delegations, Finance budget encumbrance
 * lines, typed provenance links, and vertical `rolls-up-to` edges are NOT written
 * manually here — they are produced atomically by `RULE-CLR-01..05` on the shared
 * post-commit spine in `clearingRules.js`.
 */
import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildClearingReport,
  clearingAttentionCount,
  clearingBriefText,
  clearingCsvRows,
  eligibleBidderSeats,
  evaluateBidEvidenceStatus,
  roundAccessRole,
  solveClearingRound,
} from './clearing.js';
import {
  CLEARING_ENGINE_VERSION,
  CLEARING_EVENTS,
  CLEARING_LIMITS,
} from './clearingRegistry.js';
import {
  clearingConventions,
  normalizeClearingSettings,
  validateClearingBidInput,
  validateClearingRoundDeclaration,
  validateClearingSettlementInput,
} from './clearingSchema.js';

export function createClearingActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const report = (roundId = null) => buildClearingReport(store.state, { now: clock(), roundId });

  const resolveActive = (actionName) => {
    const built = buildSeats(store.state, { now: clock(), settings: store.state.settings || {} });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return { ok: false, error: 'The declared seat is unresolved and read-only. Declare a valid seat on the Altitude Lens first.' };
    }
    const right = canAct(actionName, seat);
    return right.allow ? { ok: true, seat, built } : { ok: false, error: right.reason };
  };

  const findRound = (roundId) => (
    (Array.isArray(store.state.clearingRounds) ? store.state.clearingRounds : [])
      .find((r) => r && r.id === roundId) || null
  );

  return {
    clearingRead(roundId = null) {
      return report(roundId);
    },

    clearingBriefText() {
      const current = report();
      return current.ok ? { ok: true, text: clearingBriefText(current) } : current;
    },

    clearingCsvRows() {
      const current = report();
      return current.ok ? { ok: true, rows: clearingCsvRows(current) } : current;
    },

    clearingAttentionCount() {
      return clearingAttentionCount(store.state, { now: clock(), settings: store.state.settings || {} });
    },

    /**
     * Pure solver preview for the chair, an ancestor above the chair, or operator.
     * Strictly refused to an invited subordinate bidder so sealed peer bids cannot
     * be probed via marginal shadow prices or Clarke externalities!
     */
    clearingSolvePreview(roundId, regime = null) {
      const built = buildSeats(store.state, { now: clock(), settings: store.state.settings || {} });
      const seat = activeSeat(built);
      if (seat.readOnly) return fail('The declared seat is read-only.');
      const round = findRound(roundId);
      if (!round) return fail('No such clearing round.');
      const role = roundAccessRole(round, seat, built);
      if (role !== 'chair-or-above') {
        return fail('Solver previews are sealed to the chairing altitude while sibling bids are confidential.');
      }
      return solveClearingRound(round, { regime, settings: store.state.settings || {} });
    },

    /** Open a sealed multi-tranche clearing round for subordinate spans (rank 2+). */
    clearingOpenRound(input = {}) {
      const auth = resolveActive('chair-clearing-round');
      if (!auth.ok) return fail(auth.error);
      const { seat, built } = auth;

      const chairSeatId = seat.fullAccess ? 'leader' : seat.id;
      const eligible = eligibleBidderSeats(built, chairSeatId);
      if (!seat.fullAccess && eligible.length === 0) {
        return fail('This seat has no subordinate leadership spans to clear across. Bid into your parent leader’s round instead.');
      }

      const valid = validateClearingRoundDeclaration(input);
      if (!valid.ok) return fail(valid.error, valid.field);
      const decl = valid.declaration;

      if (decl.linkedBudgetId) {
        const budget = (store.state.budgets || []).find((b) => b && b.id === decl.linkedBudgetId);
        if (!budget) return fail('The linked Finance budget does not exist.', 'linkedBudgetId');
        if (String(budget.currency || '').toUpperCase() !== decl.currency) {
          return fail(`Currency mismatch: round is in ${decl.currency} but budget "${budget.name}" is in ${budget.currency}. Money is never crossed across currencies.`, 'linkedBudgetId');
        }
      }
      if (decl.strategyBetId) {
        const bet = (store.state.strategyBets || []).find((s) => s && s.id === decl.strategyBetId);
        if (!bet) return fail('The linked strategic bet does not exist.', 'strategyBetId');
      }

      if ((store.state.clearingRounds || []).length >= CLEARING_LIMITS.rounds) {
        return fail(`The clearinghouse ledger is full at ${CLEARING_LIMITS.rounds} rounds. Export the certificate before opening another.`);
      }

      const nowValue = clock();
      const today = dayKey(nowValue);
      const round = {
        id: idFactory('clr'),
        title: decl.title,
        outcomeLabel: decl.outcomeLabel,
        currency: decl.currency,
        openedOn: today,
        horizonOn: addDays(today, decl.horizonDays),
        scopeSeatId: chairSeatId,
        ownerId: chairSeatId === 'leader' ? null : chairSeatId,
        altitudeKey: chairSeatId === 'leader' ? 'chief' : (seat.altitudeKey || 'chief'),
        rank: seat.rank,
        budgetCap: decl.budgetCap,
        capacityCap: decl.capacityCap,
        reserveBudget: decl.reserveBudget,
        reserveCapacity: decl.reserveCapacity,
        gamma: decl.gamma,
        respectFloors: decl.respectFloors,
        expectedHurdleHoldPct: decl.expectedHurdleHoldPct,
        linkedBudgetId: decl.linkedBudgetId,
        strategyBetId: decl.strategyBetId,
        bids: [],
        status: 'open',
        clearedOn: null,
        adoptedRegime: null,
        overrideNote: '',
        frozen: null,
        settlement: null,
        withdrawnOn: null,
        engineVersion: CLEARING_ENGINE_VERSION,
        createdAt: nowValue.toISOString(),
      };

      store.update((draft) => {
        draft.clearingRounds = Array.isArray(draft.clearingRounds) ? draft.clearingRounds : [];
        draft.clearingRounds.unshift(round);
      }, {
        type: CLEARING_EVENTS.OPENED,
        entity: 'clearinground',
        entityId: round.id,
        summary: `Opened sealed clearing round "${round.title}" (${round.budgetCap} ${round.currency}, ${round.capacityCap} shared days, Γ=${round.gamma})`,
      });

      return saved({ id: round.id, report: report(round.id) });
    },

    /** Submit or update one subordinate span's sealed package schedule while the round is open. */
    clearingSubmitBid(roundId, input = {}) {
      const auth = resolveActive('submit-clearing-bid');
      if (!auth.ok) return fail(auth.error);
      const { seat, built } = auth;

      const round = findRound(roundId);
      if (!round) return fail('No such clearing round.');
      if (round.status !== 'open') {
        return fail(`Round is "${round.status}"; sealed bids may only be submitted or revised while a round is open.`);
      }

      const payload = {
        ...input,
        bidderSeatId: input.bidderSeatId || (!seat.fullAccess && seat.id !== round.scopeSeatId ? seat.id : ''),
      };
      const valid = validateClearingBidInput(payload);
      if (!valid.ok) return fail(valid.error, valid.field);
      const bidInput = valid.bid;

      const eligibleIds = new Set(eligibleBidderSeats(built, round.scopeSeatId).map((s) => s.id));
      if (eligibleIds.size > 0 && !eligibleIds.has(bidInput.bidderSeatId)) {
        return fail(`Span "${bidInput.bidderSeatId}" is not an eligible subordinate span of this round's chair.`, 'bidderSeatId');
      }

      // Horizontal isolation: a subordinate seat can ONLY submit its own span's bid!
      if (!seat.fullAccess && seat.id !== round.scopeSeatId && seat.id !== bidInput.bidderSeatId) {
        return fail('Horizontal seal: a span may submit or revise only its own bid, never a sibling span’s bid.', 'bidderSeatId');
      }

      if (bidInput.linkedEntityType && bidInput.linkedEntityId) {
        const colMap = { goal: 'goals', case: 'cases', strategy: 'strategyBets', delegation: 'delegations' };
        const col = colMap[bidInput.linkedEntityType];
        const exists = (store.state[col] || []).some((x) => x && x.id === bidInput.linkedEntityId);
        if (!exists) {
          return fail(`Linked ${bidInput.linkedEntityType} "${bidInput.linkedEntityId}" does not exist.`, 'linkedEntityId');
        }
      }

      const netB = Math.max(0, round.budgetCap - round.reserveBudget);
      const netC = Math.max(0, round.capacityCap - round.reserveCapacity);
      const minFloor = bidInput.tiers.find((t) => t.isMinimumViable);
      if (round.respectFloors && minFloor && (minFloor.cost > netB || minFloor.capacityDays > netC)) {
        return fail('Declared minimum-viable floor tier exceeds the round’s entire net clearable envelope.', 'tiers');
      }

      const existingIdx = round.bids.findIndex((b) => b.bidderSeatId === bidInput.bidderSeatId);
      if (existingIdx === -1 && round.bids.length >= CLEARING_LIMITS.bidsPerRoundMax) {
        return fail(`A clearing round accepts at most ${CLEARING_LIMITS.bidsPerRoundMax} bidding spans.`);
      }

      // Check joint floor feasibility with existing bids before persisting.
      const nowValue = clock();
      const today = dayKey(nowValue);
      const candidateBid = {
        bidderSeatId: bidInput.bidderSeatId,
        submittedOn: today,
        submittedAt: nowValue.toISOString(),
        linkedEntityType: bidInput.linkedEntityType,
        linkedEntityId: bidInput.linkedEntityId,
        note: bidInput.note,
        tiers: bidInput.tiers,
      };
      const nextBids = round.bids.slice();
      if (existingIdx >= 0) nextBids[existingIdx] = candidateBid;
      else nextBids.push(candidateBid);

      const feasibility = solveClearingRound({ ...round, bids: nextBids }, { settings: store.state.settings || {} });
      if (!feasibility.ok) return fail(feasibility.reason, 'tiers');

      store.update((draft) => {
        const row = (draft.clearingRounds || []).find((r) => r && r.id === roundId);
        if (!row) return;
        const idx = row.bids.findIndex((b) => b.bidderSeatId === candidateBid.bidderSeatId);
        if (idx >= 0) row.bids[idx] = candidateBid;
        else row.bids.push(candidateBid);
      }, {
        type: CLEARING_EVENTS.BID_SUBMITTED,
        entity: 'clearinground',
        entityId: round.id,
        summary: `Sealed tranche schedule (${candidateBid.tiers.length} tier(s)) recorded for span ${candidateBid.bidderSeatId}`,
      });

      return saved({ id: round.id, bidderSeatId: candidateBid.bidderSeatId, report: report(round.id) });
    },

    /** Withdraw an open round without committing any resources or opening governed work. */
    clearingWithdrawRound(roundId) {
      const auth = resolveActive('chair-clearing-round');
      if (!auth.ok) return fail(auth.error);
      const { seat } = auth;
      const round = findRound(roundId);
      if (!round) return fail('No such clearing round.');
      if (!seat.fullAccess && round.scopeSeatId !== seat.id) {
        return fail('Only the chairing seat (or undeclared operator) may withdraw this clearing round.');
      }
      if (round.status !== 'open') {
        return fail(`Cannot withdraw a "${round.status}" round.`);
      }
      const today = dayKey(clock());
      store.update((draft) => {
        const row = (draft.clearingRounds || []).find((r) => r && r.id === roundId);
        if (row) {
          row.status = 'withdrawn';
          row.withdrawnOn = today;
        }
      }, {
        type: CLEARING_EVENTS.WITHDRAWN,
        entity: 'clearinground',
        entityId: round.id,
        summary: `Withdrew open clearing round "${round.title}" without encumbrance`,
      });
      return saved({ id: round.id, report: report(round.id) });
    },

    /**
     * Commit an open clearing round: freeze the exact combinatorial + VCG + dual
     * solution, then RULE-CLR-01 & RULE-CLR-04 propagate atomically on post-commit.
     */
    clearingCommit(roundId, options = {}) {
      const auth = resolveActive('chair-clearing-round');
      if (!auth.ok) return fail(auth.error);
      const { seat } = auth;

      const round = findRound(roundId);
      if (!round) return fail('No such clearing round.');
      if (!seat.fullAccess && round.scopeSeatId !== seat.id) {
        return fail('Only the chairing seat (or undeclared operator) may commit this clearing round.');
      }
      if (round.status === 'cleared' || round.status === 'settled') {
        return saved({ id: round.id, existing: true, report: report(round.id) });
      }
      if (round.status !== 'open') {
        return fail(`Cannot commit a "${round.status}" round.`);
      }
      if (!Array.isArray(round.bids) || round.bids.length === 0) {
        return fail('At least one subordinate span must submit a sealed bid before clearing.');
      }

      const regime = options && typeof options === 'object' && ['robust', 'nominal', 'minimax'].includes(options.regime)
        ? options.regime : undefined;
      const overrideNote = options && typeof options.overrideNote === 'string'
        ? options.overrideNote.trim().slice(0, CLEARING_LIMITS.noteMax) : '';

      const solved = solveClearingRound(round, { regime, settings: store.state.settings || {} });
      if (!solved.ok) return fail(solved.reason);

      const frozen = {
        regime: solved.regime,
        netBudgetCap: solved.netBudgetCap,
        netCapacityCap: solved.netCapacityCap,
        committedBudget: solved.committedBudget,
        committedCapacityDays: solved.committedCapacityDays,
        activeObjective: solved.activeObjective,
        nominalObjective: solved.nominalObjective,
        robustWorstCase: solved.robustWorstCase,
        minimaxRegret: solved.minimaxRegret,
        proportionalHaircutValue: solved.proportionalHaircutValue,
        equalSplitValue: solved.equalSplitValue,
        reallocationAlpha: solved.reallocationAlpha,
        priceOfFloors: solved.priceOfFloors,
        dualBudgetPrice: solved.dualBudgetPrice,
        dualCapacityPrice: solved.dualCapacityPrice,
        lagrangianBound: solved.lagrangianBound,
        decentralizationGap: solved.decentralizationGap,
        nextBudgetStepGain: solved.nextBudgetStepGain,
        nextCapacityDayGain: solved.nextCapacityDayGain,
        budgetStep: solved.budgetStep,
        mixPosture: solved.mixPosture,
        rationedPositiveSpans: solved.rationedPositiveSpans,
        hhi: solved.hhi,
        allocations: solved.allocations,
        certificate: solved.certificate,
      };

      const today = dayKey(clock());
      store.update((draft) => {
        const row = (draft.clearingRounds || []).find((r) => r && r.id === roundId);
        if (row) {
          row.status = 'cleared';
          row.clearedOn = today;
          row.adoptedRegime = solved.regime;
          row.overrideNote = overrideNote;
          row.frozen = frozen;
        }
      }, {
        type: CLEARING_EVENTS.COMMITTED,
        entity: 'clearinground',
        entityId: round.id,
        summary: `Committed ${solved.regime} clearing for "${round.title}" (${solved.committedBudget} ${round.currency}, ${solved.committedCapacityDays}d, Alpha ${solved.reallocationAlpha >= 0 ? '+' : ''}${solved.reallocationAlpha})`,
      });

      return saved({ id: round.id, frozen, report: report(round.id) });
    },

    /**
     * Settle a cleared round ONCE out of sample against each pivotal winner's
     * Clarke opportunity-cost hurdle τ_i. Re-settlement is refused so history
     * cannot be edited retroactively.
     */
    clearingSettle(roundId, input = {}) {
      const auth = resolveActive('chair-clearing-round');
      if (!auth.ok) return fail(auth.error);
      const { seat } = auth;

      const round = findRound(roundId);
      if (!round) return fail('No such clearing round.');
      if (!seat.fullAccess && round.scopeSeatId !== seat.id) {
        return fail('Only the chairing seat (or undeclared operator) may settle this clearing round.');
      }
      if (round.status === 'settled') {
        return fail('This clearing round has already been settled once. Out-of-sample hurdle grades are immutable.');
      }
      if (round.status !== 'cleared' || !round.frozen) {
        return fail('Only a committed ("cleared") round can be settled.');
      }

      const valid = validateClearingSettlementInput(input, round);
      if (!valid.ok) return fail(valid.error, valid.field);
      const { outcomesBySpan, note } = valid.settlementInput;

      const funded = round.frozen.allocations.filter((a) => a.chosenTierIndex > 0);
      const outcomes = funded.map((alloc) => {
        const realizedValue = outcomesBySpan.get(alloc.bidderSeatId) ?? 0;
        const bid = round.bids.find((b) => b.bidderSeatId === alloc.bidderSeatId) || null;
        const evidenceStatus = evaluateBidEvidenceStatus(store.state, round, bid, realizedValue);
        const hurdleCleared = !alloc.pivotal || realizedValue >= alloc.clarkeExternality;
        const hurdleDeficit = alloc.pivotal ? Math.max(0, alloc.clarkeExternality - realizedValue) : 0;
        return {
          bidderSeatId: alloc.bidderSeatId,
          realizedValue,
          clarkeExternality: alloc.clarkeExternality,
          pivotal: alloc.pivotal,
          hurdleCleared,
          hurdleDeficit,
          evidenceStatus,
        };
      });

      const totalDeclaredValue = funded.reduce((acc, a) => acc + a.effectiveValue, 0);
      const totalRealizedValue = outcomes.reduce((acc, o) => acc + o.realizedValue, 0);
      const realizationPct = totalDeclaredValue > 0
        ? Math.round((totalRealizedValue / totalDeclaredValue) * 100) : null;
      const pivotalRows = outcomes.filter((o) => o.pivotal);
      const pivotalCount = pivotalRows.length;
      const pivotalClearedCount = pivotalRows.filter((o) => o.hurdleCleared).length;
      const allPivotalCleared = pivotalCount > 0 ? pivotalClearedCount === pivotalCount : null;

      let brier = null;
      if (round.expectedHurdleHoldPct !== null && pivotalCount > 0) {
        const p = round.expectedHurdleHoldPct / 100;
        const y = allPivotalCleared ? 1 : 0;
        brier = Math.round((p - y) * (p - y) * 10000) / 10000;
      }

      const nowValue = clock();
      const settlement = {
        settledOn: dayKey(nowValue),
        settledAt: nowValue.toISOString(),
        outcomes,
        totalDeclaredValue,
        totalRealizedValue,
        realizationPct,
        pivotalCount,
        pivotalClearedCount,
        allPivotalCleared,
        brier,
        note,
      };

      store.update((draft) => {
        const row = (draft.clearingRounds || []).find((r) => r && r.id === roundId);
        if (row) {
          row.status = 'settled';
          row.settlement = settlement;
        }
      }, {
        type: CLEARING_EVENTS.SETTLED,
        entity: 'clearinground',
        entityId: round.id,
        summary: `Settled clearing round "${round.title}" once: ${pivotalClearedCount}/${pivotalCount} pivotal Clarke hurdles cleared`,
      });

      return saved({ id: round.id, settlement, report: report(round.id) });
    },

    /** Explicit governance scan across overdue rounds, hurdle deficits and calibration cells. */
    clearingScan() {
      const auth = resolveActive('submit-clearing-bid');
      if (!auth.ok) return fail(auth.error);
      store.update(() => {}, {
        type: CLEARING_EVENTS.SCAN,
        entity: 'clearinground',
        entityId: '',
        summary: 'Ran explicit Clearinghouse governance scan across overdue settlements, mix bottlenecks and hurdle calibration',
      });
      return saved({ report: report() });
    },

    /** Update workspace clearinghouse conventions (director+ rank 3–5 only). */
    clearingSetConventions(patch = {}) {
      const auth = resolveActive('govern-clearing');
      if (!auth.ok) return fail(auth.error);
      const next = normalizeClearingSettings({
        ...clearingConventions(store.state.settings || {}),
        ...(patch && typeof patch === 'object' ? patch : {}),
      });
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: CLEARING_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: 'clearing',
        summary: `Updated Clearinghouse conventions (cell floor ${next.clearingCellFloor}, review ${next.clearingReviewDays}d)`,
      });
      return saved({ conventions: next, report: report() });
    },
  };
}
