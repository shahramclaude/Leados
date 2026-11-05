/**
 * app/core/domain/clearingRules.js — generalized post-commit rule suite
 * (`RULE-CLR-01..05`) for the Hierarchical Clearinghouse (`#/clearing`,
 * Schema v100, ADR-0098).
 *
 * Registered on `DEFAULT_POST_COMMIT_RULES` in `app/core/domain/postCommit.js`
 * with a published contract in `app/core/domain/propagationContracts.js`.
 *
 *   RULE-CLR-01 (`clear`)       On `clearing.committed`: opens ONE governed DACI
 *                               clearing decision, ONE owned delivery delegation
 *                               per funded span carrying its Clarke hurdle τ_i,
 *                               optional same-currency `committed` budget
 *                               encumbrance lines, typed provenance links, and
 *                               vertical `rolls-up-to` edges to every ancestor.
 *   RULE-CLR-02 (`hurdle`)      When a settled round has ≥ 1 pivotal span whose
 *                               realized delivery missed its Clarke externality
 *                               hurdle τ_i, opens ONE blameless Mechanism &
 *                               Reallocation Review DACI decision per round/week.
 *   RULE-CLR-03 (`overdue`)     When a cleared round passes `horizonOn +
 *                               clearingReviewDays` unsettled, opens ONE owned
 *                               settlement-evidence task + ONE integrity decision.
 *   RULE-CLR-04 (`mix`)         When a cleared round exhibits a Theory-of-Constraints
 *                               `mix-imbalance` rationing positive-value bids,
 *                               escalates ONE Envelope Mix Rebalancing decision to
 *                               the parent leadership seat above the chair.
 *   RULE-CLR-05 (`calibration`) When an altitude cell clears `clearingCellFloor`
 *                               settled pivotal tranches and a strict majority
 *                               missed their Clarke hurdle, opens ONE identity-free
 *                               Bidding Calibration Practice DACI decision.
 */
import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { ALTITUDES } from './chainRegistry.js';
import { buildSeats } from './seat.js';
import {
  CLEARING_LIMITS,
  CLEARING_RULE_IDS,
  CLEARING_TRIGGER_EVENTS,
  CLEARING_TRIGGER_PREFIX,
} from './clearingRegistry.js';
import { clearingConventions } from './clearingSchema.js';

const TRIGGER_SET = new Set(CLEARING_TRIGGER_EVENTS);

function hasMarker(draft, subjectKey) {
  const markers = Array.isArray(draft.clearingMarkers) ? draft.clearingMarkers : [];
  return markers.some((m) => m && m.subjectKey === subjectKey);
}

function writeMarker(draft, ctx, { ruleId, kind, subjectKey, roundId = null, decisionId = null, delegationId = null }) {
  if (!Array.isArray(draft.clearingMarkers)) draft.clearingMarkers = [];
  if (hasMarker(draft, subjectKey)) return false;
  draft.clearingMarkers.push({
    id: ctx.idFactory('clrm'),
    ruleId,
    kind,
    subjectKey,
    roundId,
    decisionId,
    delegationId,
    recordedOn: dayKey(ctx.now),
  });
  if (draft.clearingMarkers.length > CLEARING_LIMITS.markers) {
    draft.clearingMarkers.splice(0, draft.clearingMarkers.length - CLEARING_LIMITS.markers);
  }
  return true;
}

function addLink(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  if (!sourceId || !targetId) return false;
  return ensureEntityLink(draft, {
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary: String(summary).slice(0, 240),
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function note(ctx, out, ruleId, action, targetType, targetId, summary) {
  out.push({ ruleId, action, targetType, targetId, summary: String(summary).slice(0, 240) });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId || '',
      summary: `[${ruleId}] ${summary}`.slice(0, 300),
    });
  }
}

function ancestorsAbove(built, seatId) {
  if (!seatId || !built.byId.has(seatId)) return [];
  const found = [];
  let cursor = built.chain.nodes.get(seatId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor !== 'leader' && built.byId.has(cursor)) found.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return [...new Set(found)];
}

function parentSeatAbove(draft, built, seatId) {
  const anc = ancestorsAbove(built, seatId);
  const peopleIds = new Set((Array.isArray(draft.people) ? draft.people : []).map((p) => p && p.id));
  for (const id of anc) {
    if (peopleIds.has(id)) return id;
  }
  return ownerFor(draft, built, seatId);
}

function ownerFor(draft, built, seatId) {
  const peopleIds = new Set((Array.isArray(draft.people) ? draft.people : []).map((p) => p && p.id));
  if (seatId && seatId !== 'leader' && peopleIds.has(seatId)) return seatId;
  const candidate = (Array.isArray(draft.people) ? draft.people : []).find(
    (p) => p && p.status === 'active' && built.byId.has(p.id),
  );
  return candidate ? candidate.id : 'leader';
}

function rollupTargetsForRound(draft, built, round) {
  const targets = new Set();
  const peopleIds = new Set((Array.isArray(draft.people) ? draft.people : []).map((p) => p && p.id));
  if (round.scopeSeatId && round.scopeSeatId !== 'leader') {
    if (peopleIds.has(round.scopeSeatId)) targets.add(round.scopeSeatId);
    for (const ancId of ancestorsAbove(built, round.scopeSeatId)) {
      if (peopleIds.has(ancId)) targets.add(ancId);
    }
  } else {
    for (const seat of built.seats) {
      if (seat.id !== 'leader' && seat.rank >= 3 && peopleIds.has(seat.id)) targets.add(seat.id);
    }
  }
  return [...targets].slice(0, CLEARING_LIMITS.rounds);
}

function fanOutRound(draft, ctx, built, round, ruleId, label) {
  let count = 0;
  for (const personId of rollupTargetsForRound(draft, built, round)) {
    if (addLink(
      draft, ctx, 'clearinground', round.id, 'person', personId, 'rolls-up-to', ruleId,
      `${label} rolls up to leadership span ${personId} in the same transaction.`,
    )) {
      count += 1;
    }
  }
  return count;
}

function pushDecision(draft, ctx, { title, question, driver, approver, rationale, reviewOn, options }) {
  if (!Array.isArray(draft.decisions)) draft.decisions = [];
  if (draft.decisions.length >= 5000) return null;
  const decision = {
    id: ctx.idFactory('dec'),
    title: String(title).slice(0, 200),
    question: String(question).slice(0, 2000),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: String(driver).slice(0, 120),
    approver: String(approver).slice(0, 120),
    contributors: '',
    informed: '',
    options: Array.isArray(options) && options.length >= 2 ? options : [
      { id: ctx.idFactory('opt'), label: 'Maintain current envelope & bidding rules', pros: 'Preserves operational continuity.', cons: 'Leaves the measured bottleneck or hurdle gap unaddressed.' },
      { id: ctx.idFactory('opt'), label: 'Rebalance envelope mix or tranche tiers next cycle', pros: 'Directly relieves the binding shadow-price or hurdle distortion.', cons: 'Requires re-contracting across spans.' },
      { id: ctx.idFactory('opt'), label: 'Record structural non-comparability', pros: 'Documents exogenous shock transparently.', cons: 'Does not release trapped budget or capacity.' },
    ],
    chosen: '',
    rationale: String(rationale).slice(0, 900),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
  draft.decisions.push(decision);
  return decision;
}

function pushDelegation(draft, ctx, { title, expectedOutcome, personId, dueOn, ruleId }) {
  if (!Array.isArray(draft.delegations)) draft.delegations = [];
  if (draft.delegations.length >= 8000) return null;
  const task = {
    id: ctx.idFactory('dlg'),
    personId,
    title: String(title).slice(0, 200),
    expectedOutcome: String(expectedOutcome).slice(0, 2000),
    authority: 'act-inform',
    support: `Opened by ${ruleId} on the shared post-commit spine. Owned span commitment, never an individual rating.`,
    delegatedOn: dayKey(ctx.now),
    dueOn,
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.now.toISOString(),
  };
  draft.delegations.push(task);
  return task;
}

function linkableExists(draft, type, id) {
  if (!type || !id) return false;
  if (type === 'goal') return (draft.goals || []).some((x) => x && x.id === id);
  if (type === 'case') return (draft.cases || []).some((x) => x && x.id === id);
  if (type === 'strategy') return (draft.strategyBets || []).some((x) => x && x.id === id);
  if (type === 'delegation') return (draft.delegations || []).some((x) => x && x.id === id);
  return false;
}

/**
 * RULE-CLR-01: Commit clearing → DACI decision + per-funded-span delivery
 * delegations with Clarke hurdle τ_i + same-currency budget encumbrance +
 * typed provenance + ancestor roll-up.
 */
function runRuleClear(draft, ctx, built, conventions, out) {
  const rounds = Array.isArray(draft.clearingRounds) ? draft.clearingRounds : [];
  const peopleIds = new Set((Array.isArray(draft.people) ? draft.people : []).map((p) => p && p.id));
  const today = dayKey(ctx.now);

  for (const round of rounds) {
    if (!round || (round.status !== 'cleared' && round.status !== 'settled') || !round.frozen) continue;
    const subjectKey = `clearinground:${round.id}:clear`;
    if (hasMarker(draft, subjectKey)) continue;

    const f = round.frozen;
    const funded = (f.allocations || []).filter((a) => a.chosenTierIndex > 0);
    const totalExternality = funded.reduce((acc, a) => acc + a.clarkeExternality, 0);
    const chairOwner = ownerFor(draft, built, round.scopeSeatId);

    const decision = pushDecision(draft, ctx, {
      title: `Clearinghouse commitment: ${round.title}`,
      question: `How should the ${round.altitudeKey} span govern delivery of ${funded.length} funded tranche(s) (${f.committedBudget} ${round.currency}, ${f.committedCapacityDays} shared days) and verify Clarke hurdle coverage at ${round.horizonOn}?`,
      driver: chairOwner,
      approver: chairOwner,
      rationale: `[${CLEARING_RULE_IDS.clear}] Cleared under ${f.regime} criterion (Γ=${round.gamma}): active welfare ${f.activeObjective} ${round.outcomeLabel}, Reallocation Alpha ${f.reallocationAlpha >= 0 ? '+' : ''}${f.reallocationAlpha} vs uniform peanut-butter haircut (${f.proportionalHaircutValue}), total Clarke opportunity-cost hurdle ∑τ_i=${totalExternality}, dual shadow prices λ_B=${f.dualBudgetPrice}, λ_C=${f.dualCapacityPrice}.`,
      reviewOn: round.horizonOn,
      options: [
        { id: ctx.idFactory('opt'), label: `Execute cleared ${f.regime} allocation and settle at ${round.horizonOn}`, pros: `Preserves ${f.reallocationAlpha >= 0 ? '+' : ''}${f.reallocationAlpha} Reallocation Alpha over uniform haircuts.`, cons: `Binds ${f.committedBudget} ${round.currency} and ${f.committedCapacityDays} shared person-days.` },
        { id: ctx.idFactory('opt'), label: 'Release contingency reserve mid-cycle', pros: 'Relieves binding shadow-price constraint if scope expands.', cons: 'Consumes shock buffer.' },
      ],
    });
    if (!decision) continue;

    addLink(
      draft, ctx, 'clearinground', round.id, 'decision', decision.id, 'allocates',
      CLEARING_RULE_IDS.clear,
      `Clearing commitment opened governed DACI decision (${funded.length} funded span(s), Alpha ${f.reallocationAlpha >= 0 ? '+' : ''}${f.reallocationAlpha}).`,
    );
    note(ctx, out, CLEARING_RULE_IDS.clear, 'opened-decision', 'decision', decision.id,
      `Opened governed clearing decision for "${round.title}" (${funded.length} funded span(s)).`);

    let firstDelegationId = null;
    for (const alloc of funded) {
      const assignee = peopleIds.has(alloc.bidderSeatId) ? alloc.bidderSeatId : chairOwner;
      const task = pushDelegation(draft, ctx, {
        title: `Deliver cleared tranche (${alloc.tierLabel || alloc.tierKey || `Tier ${alloc.chosenTierIndex}`}) — ${round.title}`,
        expectedOutcome: `Deliver [${alloc.valueLo}, ${alloc.valueHi}] ${round.outcomeLabel} within ${alloc.allocatedCost} ${round.currency} and ${alloc.allocatedCapacityDays} shared person-days by ${round.horizonOn}. Clarke opportunity-cost hurdle owed to sibling spans: τ_i = ${alloc.clarkeExternality} ${round.outcomeLabel} (${alloc.pivotal ? 'pivotal — displaced sibling bid' : 'non-pivotal slack'}).`,
        personId: assignee,
        dueOn: round.horizonOn,
        ruleId: CLEARING_RULE_IDS.clear,
      });
      if (task) {
        if (!firstDelegationId) firstDelegationId = task.id;
        addLink(
          draft, ctx, 'clearinground', round.id, 'delegation', task.id, 'consumes-capacity',
          CLEARING_RULE_IDS.clear,
          `Funded tranche (${alloc.allocatedCapacityDays}d, τ_i=${alloc.clarkeExternality}) delegated to span ${assignee}.`,
        );
        note(ctx, out, CLEARING_RULE_IDS.clear, 'opened-delegation', 'delegation', task.id,
          `Created span delivery delegation (${alloc.allocatedCost} ${round.currency}, ${alloc.allocatedCapacityDays}d, hurdle τ_i=${alloc.clarkeExternality}).`);
      }
    }

    // Optional same-currency Finance Budget encumbrance (`committed` lines linked to `decision.id`).
    if (round.linkedBudgetId && Array.isArray(draft.budgets)) {
      const budget = draft.budgets.find((b) => b && b.id === round.linkedBudgetId);
      if (budget && String(budget.currency || '').toUpperCase() === round.currency) {
        budget.lines = Array.isArray(budget.lines) ? budget.lines : [];
        let encumberedN = 0;
        for (const alloc of funded) {
          if (alloc.allocatedCost <= 0 || budget.lines.length >= 120) continue;
          const lineId = ctx.idFactory('bline');
          budget.lines.push({
            id: lineId,
            title: `Clearinghouse tranche: ${alloc.tierLabel || `Tier ${alloc.chosenTierIndex}`} (${round.title})`.slice(0, 200),
            category: 'other',
            status: 'committed',
            committedAmount: alloc.allocatedCost,
            actualAmount: null,
            committedOn: today,
            expectedOn: round.horizonOn,
            spentOn: null,
            releasedOn: null,
            releasedReason: '',
            actualsDueOn: round.horizonOn,
            sourceType: 'decision',
            sourceId: decision.id,
            ownerId: peopleIds.has(alloc.bidderSeatId) ? alloc.bidderSeatId : null,
            note: `[${CLEARING_RULE_IDS.clear}] Encumbered via clearing round ${round.id}; Clarke hurdle τ_i=${alloc.clarkeExternality} ${round.outcomeLabel}.`,
          });
          encumberedN += 1;
        }
        if (encumberedN > 0) {
          budget.updatedAt = ctx.now.toISOString();
          addLink(
            draft, ctx, 'clearinground', round.id, 'budget', budget.id, 'funds',
            CLEARING_RULE_IDS.clear,
            `Encumbered ${encumberedN} committed tranche line(s) (${f.committedBudget} ${round.currency}) on budget "${budget.name}".`,
          );
          note(ctx, out, CLEARING_RULE_IDS.clear, 'encumbered-budget', 'budget', budget.id,
            `Encumbered ${f.committedBudget} ${round.currency} across ${encumberedN} committed line(s) on budget "${budget.name}".`);
        }
      }
    }

    // Strategy bet & bid entity provenance links.
    if (round.strategyBetId && (draft.strategyBets || []).some((s) => s && s.id === round.strategyBetId)) {
      addLink(
        draft, ctx, 'clearinground', round.id, 'strategy', round.strategyBetId, 'funds',
        CLEARING_RULE_IDS.clear,
        'Clearing round allocates resources toward this strategic bet.',
      );
    }
    for (const bid of round.bids || []) {
      if (linkableExists(draft, bid.linkedEntityType, bid.linkedEntityId)) {
        addLink(
          draft, ctx, 'clearinground', round.id, bid.linkedEntityType, bid.linkedEntityId, 'clears-bid',
          CLEARING_RULE_IDS.clear,
          `Bid schedule from span ${bid.bidderSeatId} linked to ${bid.linkedEntityType} ${bid.linkedEntityId}.`,
        );
      }
    }

    fanOutRound(draft, ctx, built, round, CLEARING_RULE_IDS.clear, 'Cleared resource round');
    writeMarker(draft, ctx, {
      ruleId: CLEARING_RULE_IDS.clear,
      kind: 'clear',
      subjectKey,
      roundId: round.id,
      decisionId: decision.id,
      delegationId: firstDelegationId,
    });
  }
}

/**
 * RULE-CLR-02: Settled round with pivotal Clarke hurdle deficit (`realizedValue < τ_i`)
 * opens ONE blameless Mechanism & Reallocation Review DACI decision per round/week.
 */
function runRuleHurdleDeficit(draft, ctx, built, conventions, out) {
  const rounds = Array.isArray(draft.clearingRounds) ? draft.clearingRounds : [];
  const wk = weekKey(ctx.now);
  const reviewOn = addDays(dayKey(ctx.now), conventions.clearingReviewDays);

  for (const round of rounds) {
    if (!round || round.status !== 'settled' || !round.settlement) continue;
    const misses = (round.settlement.outcomes || []).filter((o) => o.pivotal && !o.hurdleCleared);
    if (misses.length === 0) continue;

    const subjectKey = `clearinground:${round.id}:hurdle:${wk}`;
    if (hasMarker(draft, subjectKey)) continue;

    const totalDeficit = misses.reduce((acc, m) => acc + m.hurdleDeficit, 0);
    const owner = ownerFor(draft, built, round.scopeSeatId);
    const decision = pushDecision(draft, ctx, {
      title: `Clarke hurdle deficit review (${misses.length} pivotal tranche(s) below τ_i)`,
      question: `${misses.length} pivotal tranche(s) in a ${round.altitudeKey} clearing round delivered ${totalDeficit} ${round.outcomeLabel} less than the sibling value τ_i they displaced. Should the span revise package sizing, raise Γ, or split cross-team capacity?`,
      driver: owner,
      approver: owner,
      rationale: `[${CLEARING_RULE_IDS.hurdle}] Out-of-sample settlement on ${round.settlement.settledOn}: ${misses.length} of ${round.settlement.pivotalCount} pivotal winner(s) fell below their Clarke opportunity-cost hurdle τ_i (aggregate deficit ${totalDeficit} ${round.outcomeLabel}). Blameless mechanism review — never an individual rating.`,
      reviewOn,
    });
    if (!decision) continue;

    addLink(
      draft, ctx, 'clearinground', round.id, 'decision', decision.id, 'prices-externality',
      CLEARING_RULE_IDS.hurdle,
      `Pivotal hurdle deficit (${totalDeficit} ${round.outcomeLabel}) opened blameless mechanism review.`,
    );
    fanOutRound(draft, ctx, built, round, CLEARING_RULE_IDS.hurdle, 'Clarke hurdle deficit review');
    writeMarker(draft, ctx, {
      ruleId: CLEARING_RULE_IDS.hurdle,
      kind: 'hurdle',
      subjectKey,
      roundId: round.id,
      decisionId: decision.id,
    });
    note(ctx, out, CLEARING_RULE_IDS.hurdle, 'opened-decision', 'decision', decision.id,
      `Opened Clarke hurdle deficit review (${misses.length} pivotal miss(es), deficit ${totalDeficit}).`);
  }
}

/**
 * RULE-CLR-03: Overdue unsettled cleared round (`today > horizonOn + clearingReviewDays`)
 * opens ONE settlement-evidence task + ONE governance decision per round/week.
 */
function runRuleOverdueSettlement(draft, ctx, built, conventions, out) {
  const rounds = Array.isArray(draft.clearingRounds) ? draft.clearingRounds : [];
  const today = dayKey(ctx.now);
  const wk = weekKey(ctx.now);
  const reviewOn = addDays(today, conventions.clearingReviewDays);

  for (const round of rounds) {
    if (!round || round.status !== 'cleared') continue;
    const deadline = addDays(round.horizonOn, conventions.clearingReviewDays);
    if (today <= deadline) continue;

    const subjectKey = `clearinground:${round.id}:overdue:${wk}`;
    if (hasMarker(draft, subjectKey)) continue;

    const owner = ownerFor(draft, built, round.scopeSeatId);
    const task = pushDelegation(draft, ctx, {
      title: `Settle overdue clearing round (${round.altitudeKey} · horizon ${round.horizonOn})`,
      expectedOutcome: `Record realized ${round.outcomeLabel} for each funded span and grade pivotal Clarke hurdles τ_i once out of sample.`,
      personId: owner,
      dueOn: addDays(today, 7),
      ruleId: CLEARING_RULE_IDS.overdue,
    });
    const decision = pushDecision(draft, ctx, {
      title: `Unsettled clearinghouse horizon (${round.altitudeKey} · due ${round.horizonOn})`,
      question: `This cleared resource round passed its ${round.horizonOn} horizon plus the ${conventions.clearingReviewDays}-day review window without settlement. Will the chair settle realized outcomes now or record non-comparability?`,
      driver: owner,
      approver: owner,
      rationale: `[${CLEARING_RULE_IDS.overdue}] Horizon ${round.horizonOn} + ${conventions.clearingReviewDays}d elapsed on ${today} with status still 'cleared'. Leaving funded externalities ungraded hides reallocation calibration.`,
      reviewOn,
    });
    if (!decision && !task) continue;

    if (task) {
      addLink(draft, ctx, 'clearinground', round.id, 'delegation', task.id, 'consumes-capacity',
        CLEARING_RULE_IDS.overdue, 'Overdue settlement capture task.');
      note(ctx, out, CLEARING_RULE_IDS.overdue, 'opened-delegation', 'delegation', task.id,
        `Opened overdue settlement capture task for round ${round.id}.`);
    }
    if (decision) {
      addLink(draft, ctx, 'clearinground', round.id, 'decision', decision.id, 'allocates',
        CLEARING_RULE_IDS.overdue, 'Overdue clearing settlement integrity decision.');
      note(ctx, out, CLEARING_RULE_IDS.overdue, 'opened-decision', 'decision', decision.id,
        `Opened overdue settlement governance decision for round ${round.id}.`);
    }
    fanOutRound(draft, ctx, built, round, CLEARING_RULE_IDS.overdue, 'Overdue clearing settlement');
    writeMarker(draft, ctx, {
      ruleId: CLEARING_RULE_IDS.overdue,
      kind: 'overdue',
      subjectKey,
      roundId: round.id,
      decisionId: decision?.id || null,
      delegationId: task?.id || null,
    });
  }
}

/**
 * RULE-CLR-04: Theory-of-Constraints resource-mix bottleneck (`mix-imbalance`
 * with ≥ 1 rationed positive-value span) escalates ONE Envelope Mix Rebalancing
 * decision to the parent leadership seat ABOVE the chair!
 */
function runRuleMixBottleneck(draft, ctx, built, conventions, out) {
  const rounds = Array.isArray(draft.clearingRounds) ? draft.clearingRounds : [];
  const reviewOn = addDays(dayKey(ctx.now), conventions.clearingReviewDays);
  const peopleIds = new Set((Array.isArray(draft.people) ? draft.people : []).map((p) => p && p.id));

  for (const round of rounds) {
    if (!round || (round.status !== 'cleared' && round.status !== 'settled') || !round.frozen) continue;
    const f = round.frozen;
    if (f.mixPosture !== 'mix-imbalance' || (f.rationedPositiveSpans || 0) < 1) continue;

    const subjectKey = `clearinground:${round.id}:mix`;
    if (hasMarker(draft, subjectKey)) continue;

    const parentApprover = parentSeatAbove(draft, built, round.scopeSeatId);
    const chairDriver = ownerFor(draft, built, round.scopeSeatId);
    const bPct = f.netBudgetCap > 0 ? Math.round((f.committedBudget / f.netBudgetCap) * 100) : 100;
    const cPct = f.netCapacityCap > 0 ? Math.round((f.committedCapacityDays / f.netCapacityCap) * 100) : 100;

    const decision = pushDecision(draft, ctx, {
      title: `Envelope mix bottleneck escalated from ${round.altitudeKey} clearing (${bPct}% budget vs ${cPct}% capacity)`,
      question: `Clearing exhausted one resource (${bPct}% budget, λ_B=${f.dualBudgetPrice}; ${cPct}% capacity, λ_C=${f.dualCapacityPrice}) while rationing ${f.rationedPositiveSpans} positive-value span bid(s) and leaving the paired constraint slack. Should the parent span convert slack budget/capacity or cross-loan specialist days?`,
      driver: chairDriver,
      approver: parentApprover,
      rationale: `[${CLEARING_RULE_IDS.mix}] Goldratt Theory-of-Constraints mix imbalance detected on clearing commitment: next budget step (+${f.budgetStep} ${round.currency}) yields +${f.nextBudgetStepGain} ${round.outcomeLabel}; +1 capacity day yields +${f.nextCapacityDayGain} ${round.outcomeLabel}. Escalated upward to parent envelope owner.`,
      reviewOn,
    });
    if (!decision) continue;

    addLink(
      draft, ctx, 'clearinground', round.id, 'decision', decision.id, 'allocates',
      CLEARING_RULE_IDS.mix,
      `Resource-mix bottleneck (${bPct}% budget / ${cPct}% capacity) escalated to parent envelope owner.`,
    );
    if (round.scopeSeatId && round.scopeSeatId !== 'leader' && peopleIds.has(round.scopeSeatId)) {
      addLink(
        draft, ctx, 'decision', decision.id, 'person', round.scopeSeatId, 'escalates-from',
        CLEARING_RULE_IDS.mix,
        'Envelope mix rebalancing decision escalated upward from chairing span.',
      );
    }
    fanOutRound(draft, ctx, built, round, CLEARING_RULE_IDS.mix, 'Envelope mix bottleneck');
    writeMarker(draft, ctx, {
      ruleId: CLEARING_RULE_IDS.mix,
      kind: 'mix',
      subjectKey,
      roundId: round.id,
      decisionId: decision.id,
    });
    note(ctx, out, CLEARING_RULE_IDS.mix, 'opened-decision', 'decision', decision.id,
      `Escalated resource-mix bottleneck decision (${bPct}% budget vs ${cPct}% capacity) to parent seat ${parentApprover}.`);
  }
}

/**
 * RULE-CLR-05: Altitude-cell chronic Clarke hurdle misses (pivotalN >= cellFloor
 * and >50% pivotal hurdle misses) opens ONE identity-free Bidding Calibration
 * Practice DACI decision per altitude cell per ISO week.
 */
function runRuleAltitudeCalibration(draft, ctx, built, conventions, out) {
  const rounds = Array.isArray(draft.clearingRounds) ? draft.clearingRounds : [];
  const settled = rounds.filter((r) => r && r.status === 'settled' && r.settlement);
  if (settled.length === 0) return;

  const wk = weekKey(ctx.now);
  const reviewOn = addDays(dayKey(ctx.now), conventions.clearingReviewDays);
  const floor = conventions.clearingCellFloor;

  for (const alt of ALTITUDES) {
    const cellRounds = settled.filter((r) => r.altitudeKey === alt.key);
    const pivotalN = cellRounds.reduce((acc, r) => acc + (r.settlement.pivotalCount || 0), 0);
    const clearedN = cellRounds.reduce((acc, r) => acc + (r.settlement.pivotalClearedCount || 0), 0);
    const missedN = pivotalN - clearedN;
    if (pivotalN < floor || missedN <= clearedN) continue;

    const subjectKey = `altitude:${alt.key}:calibration:${wk}`;
    if (hasMarker(draft, subjectKey)) continue;

    const sampleRound = cellRounds[0];
    const owner = parentSeatAbove(draft, built, sampleRound.scopeSeatId);
    const decision = pushDecision(draft, ctx, {
      title: `Altitude bidding calibration review (${alt.label} · ${missedN}/${pivotalN} pivotal hurdles missed)`,
      question: `Across settled ${alt.label.toLowerCase()} clearing rounds in this workspace, ${missedN} of ${pivotalN} pivotal tranches fell short of the Clarke opportunity-cost hurdle τ_i they displaced. Should ${alt.label.toLowerCase()} rounds raise Γ or require linked pre-registered evidence?`,
      driver: owner,
      approver: owner,
      rationale: `[${CLEARING_RULE_IDS.calibration}] Altitude cell "${alt.key}" cleared the floor (${pivotalN} ≥ ${floor}) with ${clearedN} hurdle holds vs ${missedN} misses. Identity-free structural calibration review.`,
      reviewOn,
    });
    if (!decision) continue;

    for (const r of cellRounds) {
      addLink(
        draft, ctx, 'clearinground', r.id, 'decision', decision.id, 'prices-externality',
        CLEARING_RULE_IDS.calibration,
        `Settled round contributed to ${alt.label} Clarke hurdle calibration finding.`,
      );
      fanOutRound(draft, ctx, built, r, CLEARING_RULE_IDS.calibration, 'Altitude hurdle calibration');
    }
    writeMarker(draft, ctx, {
      ruleId: CLEARING_RULE_IDS.calibration,
      kind: 'calibration',
      subjectKey,
      roundId: sampleRound.id,
      decisionId: decision.id,
    });
    note(ctx, out, CLEARING_RULE_IDS.calibration, 'opened-decision', 'decision', decision.id,
      `Opened ${alt.label} bidding calibration decision (${missedN}/${pivotalN} pivotal hurdles missed).`);
  }
}

/** Shared post-commit spine entry for `app/core/domain/postCommit.js`. */
export function clearingRule(draft, ctx) {
  const eventType = ctx?.event?.type || '';
  if (!eventType.startsWith(CLEARING_TRIGGER_PREFIX) || !TRIGGER_SET.has(eventType)) return [];
  const conventions = clearingConventions(draft.settings || {});
  if (!conventions.clearingAutoPropagate) return [];

  const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });
  const out = [];

  runRuleClear(draft, ctx, built, conventions, out);
  runRuleMixBottleneck(draft, ctx, built, conventions, out);
  runRuleHurdleDeficit(draft, ctx, built, conventions, out);
  runRuleOverdueSettlement(draft, ctx, built, conventions, out);
  runRuleAltitudeCalibration(draft, ctx, built, conventions, out);

  return out;
}
