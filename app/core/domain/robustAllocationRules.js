/**
 * app/core/domain/robustAllocationRules.js — RULE-RAL-01..04 on the shared
 * post-commit spine (ADR-0095, Schema v98).
 *
 *  RULE-RAL-01 ADOPT. An adopted plan becomes a first-class graph node: one
 *    governed DACI decision (the allocation choice, kept SEPARATE from the
 *    frozen numeric solution), one owned dated delivery task per funded line,
 *    an `allocates` edge to the decision, a `consumes-capacity` edge per task, a
 *    `rests-on` edge to any linked prospective contract, and one `rolls-up-to`
 *    edge to EVERY leadership ancestor — all in the SAME atomic transaction.
 *
 *  RULE-RAL-02 FALSIFIED. On scan, an adopted plan whose linked prospective
 *    contract graded outcome 0 (the pre-registered threshold was missed) opens
 *    exactly ONE governed re-allocation decision per plan per ISO week.
 *
 *  RULE-RAL-03 OVERDUE. An adopted plan past its horizon + review window with
 *    an unfinished funded line opens ONE governed delivery-integrity decision
 *    per plan per ISO week.
 *
 *  RULE-RAL-04 UNGRADED. An adopted plan whose linked contract is past its
 *    horizon + review window with no grade opens ONE governed evidence-integrity
 *    decision per plan per ISO week.
 *
 * All four are bounded, marker-idempotent and pausable via
 * `robustAllocationAutoPropagate`; an explicit `robustAllocation.scan` always runs.
 */
import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSeats } from './seat.js';
import { planState, robustHash, robustWeekKey } from './robustAllocation.js';
import { robustAllocationConventions } from './robustAllocationSchema.js';
import {
  ROBUST_ALLOCATION_EVENTS,
  ROBUST_ALLOCATION_LIMITS,
  ROBUST_ALLOCATION_RULE_IDS,
  ROBUST_ALLOCATION_TRIGGER_PREFIX,
} from './robustAllocationRegistry.js';

const markerId = (kind, key) => `ral-${kind}-${robustHash(String(key)).slice(0, 10)}`;

function markersOf(draft) {
  return Array.isArray(draft.robustMarkers) ? draft.robustMarkers : [];
}

function addMarker(draft, ctx, marker) {
  if (!Array.isArray(draft.robustMarkers)) draft.robustMarkers = [];
  if (draft.robustMarkers.some((row) => row?.id === marker.id)) return false;
  draft.robustMarkers.push({ ...marker, recordedOn: dayKey(ctx.now) });
  if (draft.robustMarkers.length > ROBUST_ALLOCATION_LIMITS.markers) {
    draft.robustMarkers.splice(0, draft.robustMarkers.length - ROBUST_ALLOCATION_LIMITS.markers);
  }
  return true;
}

function addLink(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  if (!sourceId || !targetId) return false;
  return ensureEntityLink(draft, {
    sourceType, sourceId, targetType, targetId, relation, ruleId,
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

function rollupTargets(draft, built, plan) {
  const targets = new Set();
  if (plan.scopeSeatId && built.byId.has(plan.scopeSeatId) && plan.scopeSeatId !== 'leader') {
    for (const ancestorId of ancestorsAbove(built, plan.scopeSeatId)) targets.add(ancestorId);
  } else {
    for (const seat of built.seats) {
      if (seat.id !== 'leader' && seat.rank >= 2) targets.add(seat.id);
    }
  }
  const peopleIds = new Set((Array.isArray(draft.people) ? draft.people : []).map((p) => p && p.id));
  return [...targets].filter((id) => peopleIds.has(id)).slice(0, ROBUST_ALLOCATION_LIMITS.plans);
}

function fanOut(draft, ctx, built, plan, ruleId, label) {
  let links = 0;
  for (const seatId of rollupTargets(draft, built, plan)) {
    if (addLink(draft, ctx, 'robustplan', plan.id, 'person', seatId, 'rolls-up-to', ruleId,
      `${label} rolls up to this leadership span in the same transaction.`)) links += 1;
  }
  return links;
}

function ownerFor(draft, built, plan) {
  if (plan.scopeSeatId && built.byId.has(plan.scopeSeatId) && plan.scopeSeatId !== 'leader') return plan.scopeSeatId;
  const candidate = (Array.isArray(draft.people) ? draft.people : []).find((p) => p && p.status === 'active' && built.byId.has(p.id));
  return candidate ? candidate.id : 'leader';
}

function pushDecision(draft, ctx, { title, question, driver, approver, rationale, reviewOn }) {
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
    options: [
      { id: ctx.idFactory('opt'), label: 'Keep the current allocation', pros: 'No re-planning cost.', cons: 'The falsified or overdue premise persists.' },
      { id: ctx.idFactory('opt'), label: 'Re-declare the ranges and re-solve', pros: 'Creates a new, honestly-priced plan to grade.', cons: 'Costs one cycle before the change can be judged.' },
      { id: ctx.idFactory('opt'), label: 'Record why the plan is not comparable', pros: 'Names a structural reason instead of a false score.', cons: 'An exemption is not evidence.' },
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

function pushTask(draft, ctx, { title, expectedOutcome, personId, dueOn, ruleId }) {
  if (!Array.isArray(draft.delegations)) draft.delegations = [];
  if (draft.delegations.length >= 8000) return null;
  const task = {
    id: ctx.idFactory('dlg'),
    personId,
    title: String(title).slice(0, 200),
    expectedOutcome: String(expectedOutcome).slice(0, 2000),
    authority: 'act-inform',
    support: `Opened by ${ruleId} on the shared post-commit spine. This is owned work, not a rating of the owner.`,
    delegatedOn: dayKey(ctx.now),
    dueOn,
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
  draft.delegations.push(task);
  return task;
}

/* --------------------------------------------------------- RULE-RAL-01: adopt */

function adoptRule(draft, ctx, built, out) {
  const plans = Array.isArray(draft.robustPlans) ? draft.robustPlans : [];
  const plan = plans.find((row) => row?.id === ctx.event.entityId) || null;
  if (!plan || plan.status !== 'adopted' || !plan.frozen) return 0;
  const id = markerId('adopted', plan.id);
  if (markersOf(draft).some((row) => row?.id === id)) return 0;
  const ownerId = ownerFor(draft, built, plan);
  const funded = plan.actions
    .map((action, i) => ({ action, units: plan.frozen.robustUnits[i] }))
    .filter((line) => line.units > 0);
  const decision = pushDecision(draft, ctx, {
    title: `Adopt the robust allocation: ${plan.title}`,
    question: [
      `An allocation was solved on ${plan.declaredOn} under Γ=${plan.gamma} budgeted uncertainty over ${plan.actions.length} intervention(s) and ${plan.segments.length} segment(s).`,
      `The robust (Wald maximin) plan funds ${funded.length} line(s) for a worst case of ${plan.frozen.robustWorstCase} ${plan.outcomeLabel}, committing ${plan.frozen.committedHours} leadership hour(s) and ${plan.frozen.committedBudget} ${plan.currency}.`,
      `The equity floor costs ${plan.frozen.priceOfFairness} ${plan.outcomeLabel} of worst-case value (the price of fairness). The minimax-regret plan's largest regret is ${plan.frozen.minimaxMaxRegret}.`,
      'The numeric solution is frozen in the plan ledger and is NOT editable here. Decide the operational commitment: who delivers each funded line, and what would make you stop.',
    ].join(' '),
    driver: 'Robust allocation terminal',
    approver: `${plan.altitudeKey || 'declaring'} span owner`,
    rationale: `[${ROBUST_ALLOCATION_RULE_IDS.adopt}] Governed operational commitment for a frozen robust allocation. Opened by the engine; resolved only by a human. The solution stays in the plan ledger, never in this decision.`,
    reviewOn: plan.horizonOn,
  });
  let links = 0;
  if (decision && addLink(draft, ctx, 'robustplan', plan.id, 'decision', decision.id,
    'allocates', ROBUST_ALLOCATION_RULE_IDS.adopt,
    'This frozen allocation opens the governed commitment decision; the solution is not copied into the decision.')) links += 1;
  let tasks = 0;
  for (const { action, units } of funded) {
    const segment = plan.segments.find((s) => s.key === action.segmentKey);
    const task = pushTask(draft, ctx, {
      title: `Deliver ${units} unit(s) of ${action.label} by ${plan.horizonOn}`,
      expectedOutcome: `${units} unit(s) of "${action.label}" delivered to segment "${segment ? segment.label : action.segmentKey}", contributing to ${plan.outcomeLabel}. This is owned delivery work opened by the allocation, not a rating of the owner.`,
      personId: ownerId,
      dueOn: plan.horizonOn,
      ruleId: ROBUST_ALLOCATION_RULE_IDS.adopt,
    });
    if (task && addLink(draft, ctx, 'robustplan', plan.id, 'delegation', task.id,
      'consumes-capacity', ROBUST_ALLOCATION_RULE_IDS.adopt,
      `A funded line of the adopted allocation: ${units} unit(s) of ${action.label}.`)) { links += 1; tasks += 1; }
  }
  if (plan.linkedContractId && addLink(draft, ctx, 'robustplan', plan.id, 'prospectivecontract', plan.linkedContractId,
    'rests-on', ROBUST_ALLOCATION_RULE_IDS.adopt,
    'The allocation rests on this pre-registered bet; a missed threshold will open a governed re-allocation decision.')) links += 1;
  const vertical = fanOut(draft, ctx, built, plan, ROBUST_ALLOCATION_RULE_IDS.adopt, 'An adopted robust allocation in this span');
  addMarker(draft, ctx, {
    id, kind: 'adopted', planId: plan.id, decisionId: decision ? decision.id : null, weekKey: null,
    note: `${funded.length} funded line(s); ${tasks} delivery task(s), ${links} typed work edge(s) and ${vertical} vertical roll-up edge(s) written.`,
  });
  note(ctx, out, ROBUST_ALLOCATION_RULE_IDS.adopt, 'created', 'robustplan', plan.id,
    `One governed decision, ${tasks} owned delivery task(s) and ${vertical} vertical roll-up edge(s) created in the same atomic transaction.`);
  return 1;
}

/* ------------------------------------------------------- scan helpers */

function inScanScope(draft, ctx, built, plan) {
  if (ctx.event.entity === 'workspace' || ctx.event.entityId === 'all') return true;
  const seatId = ctx.event.entityId;
  if (!seatId || !built.byId.has(seatId)) return true;
  if (plan.scopeSeatId === seatId) return true;
  const seat = built.byId.get(seatId);
  return Boolean(plan.scopeSeatId && seat.scope.has(plan.scopeSeatId));
}

function adoptedInScope(draft, ctx, built) {
  return (Array.isArray(draft.robustPlans) ? draft.robustPlans : [])
    .filter((p) => p && p.status === 'adopted' && inScanScope(draft, ctx, built, p));
}

/* ---------------------------------------------------- RULE-RAL-02: falsified */

function falsifiedRule(draft, ctx, built, out, conventions) {
  const today = dayKey(ctx.now);
  const week = robustWeekKey(ctx.now);
  const candidates = adoptedInScope(draft, ctx, built)
    .filter((p) => planState(draft, p, { today, reviewDays: conventions.robustAllocationReviewDays }) === 'falsified')
    .slice(0, ROBUST_ALLOCATION_LIMITS.decisionsPerScan);
  let opened = 0;
  for (const plan of candidates) {
    const id = markerId('falsified', `${plan.id}|${week}`);
    if (markersOf(draft).some((row) => row?.id === id)) continue;
    const decision = pushDecision(draft, ctx, {
      title: `Re-allocate: the premise of "${plan.title}" was falsified out of sample`,
      question: [
        `The prospective contract linked to this allocation graded outcome 0: its pre-registered threshold was NOT reached by the horizon.`,
        `The allocation rested on that premise. Decide whether to re-declare the effect ranges and re-solve, keep the current lines with a written reason, or record why the plan is not comparable.`,
        'A missed threshold is not a causal claim and not a rating of a person. The engine never re-solves or re-adopts a plan for anyone.',
      ].join(' '),
      driver: 'Robust allocation falsification watch',
      approver: 'Director-or-above span owner',
      rationale: `[${ROBUST_ALLOCATION_RULE_IDS.falsified}] Linked prospective contract graded below its threshold. One governed re-allocation decision per plan per ISO week. No person is named or scored.`,
      reviewOn: addDays(today, 14),
    });
    if (!decision) continue;
    addLink(draft, ctx, 'robustplan', plan.id, 'decision', decision.id, 'allocates', ROBUST_ALLOCATION_RULE_IDS.falsified,
      'A governed re-allocation decision opened because the linked pre-registered threshold was missed.');
    const vertical = fanOut(draft, ctx, built, plan, ROBUST_ALLOCATION_RULE_IDS.falsified, 'A falsified allocation premise');
    addMarker(draft, ctx, {
      id, kind: 'falsified', planId: plan.id, decisionId: decision.id, weekKey: week,
      note: `Linked contract graded outcome 0; one governed re-allocation decision and ${vertical} vertical edge(s).`,
    });
    opened += 1;
    note(ctx, out, ROBUST_ALLOCATION_RULE_IDS.falsified, 'created', 'decision', decision.id,
      `Opened one governed re-allocation decision for a falsified allocation premise.`);
  }
  return opened;
}

/* ------------------------------------------------------ RULE-RAL-03: overdue */

function overdueRule(draft, ctx, built, out, conventions) {
  const today = dayKey(ctx.now);
  const week = robustWeekKey(ctx.now);
  const candidates = adoptedInScope(draft, ctx, built)
    .filter((p) => planState(draft, p, { today, reviewDays: conventions.robustAllocationReviewDays }) === 'overdue')
    .slice(0, ROBUST_ALLOCATION_LIMITS.decisionsPerScan);
  let opened = 0;
  for (const plan of candidates) {
    const id = markerId('overdue', `${plan.id}|${week}`);
    if (markersOf(draft).some((row) => row?.id === id)) continue;
    const decision = pushDecision(draft, ctx, {
      title: `Delivery integrity: "${plan.title}" is past its horizon with unfinished funded lines`,
      question: [
        `This adopted allocation passed its horizon plus the ${conventions.robustAllocationReviewDays}-day review window with at least one funded delivery line still open.`,
        'Decide whether to repair the delivery, re-scope the line, or record why it cannot land. Waiting is never a silent dismissal.',
      ].join(' '),
      driver: 'Robust allocation delivery integrity',
      approver: 'Manager-or-above span owner',
      rationale: `[${ROBUST_ALLOCATION_RULE_IDS.overdue}] One governed delivery-integrity decision per plan per ISO week for overdue funded lines.`,
      reviewOn: addDays(today, 14),
    });
    if (!decision) continue;
    addLink(draft, ctx, 'robustplan', plan.id, 'decision', decision.id, 'allocates', ROBUST_ALLOCATION_RULE_IDS.overdue,
      'A governed delivery-integrity decision opened because a funded line outlived the horizon.');
    const vertical = fanOut(draft, ctx, built, plan, ROBUST_ALLOCATION_RULE_IDS.overdue, 'An overdue allocation delivery');
    addMarker(draft, ctx, {
      id, kind: 'overdue', planId: plan.id, decisionId: decision.id, weekKey: week,
      note: `Funded line(s) past the review window; one governed decision and ${vertical} vertical edge(s).`,
    });
    opened += 1;
    note(ctx, out, ROBUST_ALLOCATION_RULE_IDS.overdue, 'created', 'decision', decision.id,
      `Opened one governed delivery-integrity decision for an overdue allocation.`);
  }
  return opened;
}

/* ----------------------------------------------------- RULE-RAL-04: ungraded */

function ungradedRule(draft, ctx, built, out, conventions) {
  const today = dayKey(ctx.now);
  const week = robustWeekKey(ctx.now);
  const candidates = adoptedInScope(draft, ctx, built)
    .filter((p) => planState(draft, p, { today, reviewDays: conventions.robustAllocationReviewDays }) === 'ungraded')
    .slice(0, ROBUST_ALLOCATION_LIMITS.decisionsPerScan);
  let opened = 0;
  for (const plan of candidates) {
    const id = markerId('ungraded', `${plan.id}|${week}`);
    if (markersOf(draft).some((row) => row?.id === id)) continue;
    const decision = pushDecision(draft, ctx, {
      title: `Evidence integrity: the contract behind "${plan.title}" is past its window with no grade`,
      question: [
        `The prospective contract this allocation rests on passed its horizon plus the ${conventions.robustAllocationReviewDays}-day review window without a grade.`,
        'A premise that cannot be resolved owes a written reason; it is never scored as a miss and never silently dismissed. Decide whether to repair the dated evidence or record why the cohort cannot be judged.',
      ].join(' '),
      driver: 'Robust allocation evidence integrity',
      approver: 'Director-or-above span owner',
      rationale: `[${ROBUST_ALLOCATION_RULE_IDS.ungraded}] One governed evidence-integrity decision per plan per ISO week for an ungraded linked contract.`,
      reviewOn: addDays(today, 14),
    });
    if (!decision) continue;
    addLink(draft, ctx, 'robustplan', plan.id, 'decision', decision.id, 'allocates', ROBUST_ALLOCATION_RULE_IDS.ungraded,
      'A governed evidence-integrity decision opened because the linked contract was never graded.');
    const vertical = fanOut(draft, ctx, built, plan, ROBUST_ALLOCATION_RULE_IDS.ungraded, 'An ungraded allocation premise');
    addMarker(draft, ctx, {
      id, kind: 'ungraded', planId: plan.id, decisionId: decision.id, weekKey: week,
      note: `Linked contract past the review window with no grade; one governed decision and ${vertical} vertical edge(s).`,
    });
    opened += 1;
    note(ctx, out, ROBUST_ALLOCATION_RULE_IDS.ungraded, 'created', 'decision', decision.id,
      `Opened one governed evidence-integrity decision for an ungraded allocation premise.`);
  }
  return opened;
}

export function robustAllocationRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const explicit = event.type === ROBUST_ALLOCATION_EVENTS.SCAN;
  const own = event.type.startsWith(ROBUST_ALLOCATION_TRIGGER_PREFIX);
  if (!explicit && !own) return [];
  const conventions = robustAllocationConventions(ctx.settings || draft.settings || {});
  if (!explicit && conventions.robustAllocationAutoPropagate === false) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`),
  };
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  const out = [];
  if (event.type === ROBUST_ALLOCATION_EVENTS.ADOPTED) adoptRule(draft, runCtx, built, out);
  if (explicit) {
    falsifiedRule(draft, runCtx, built, out, conventions);
    overdueRule(draft, runCtx, built, out, conventions);
    ungradedRule(draft, runCtx, built, out, conventions);
  }
  return out;
}

export const ROBUST_ALLOCATION_SECONDARY_EVENTS = Object.freeze([
  ROBUST_ALLOCATION_EVENTS.SCAN, ROBUST_ALLOCATION_EVENTS.CONVENTIONS,
]);
