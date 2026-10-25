/**
 * app/core/domain/automation.js — Event-driven Cross-Module Rules & Parallel
 * Propagation Engine.
 *
 * When an Operational Case is registered, updated, escalated from an upstream
 * module, or resolved — or when a linked downstream mitigation completes —
 * this pure rules engine evaluates which LeadOS modules are affected and
 * creates, updates, or links records in parallel inside a single atomic store
 * transaction.
 *
 * Architectural guarantees:
 *  - Pure & deterministic: no DOM, network, wall-clock globals, or storage IO.
 *  - Idempotent & loop-safe: graph-aware checks prevent duplicate Decisions,
 *    Delegations, Goal check-ins, Stakeholder schedules, or Coaching topics
 *    across repeated edits and upstream escalations.
 *  - Privacy-preserving: confidential `conflicts` and anonymous `pulses` are
 *    never read, written, or linked by any rule.
 *  - Transparent & auditable: every propagation returns structured metadata
 *    and appends an explicit `automation.propagated` audit event.
 */

import { addDays, dayKey } from '../time.js';
import {
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  classifyMendelowStakeholder,
  computeFmea,
  computePertImpact,
  isCaseOpen,
} from './cases.js';
import {
  buildCapacityModel,
  deliveryForecast,
  rankPortfolio,
  utilisationBand,
} from './capacity.js';
import { ACTIVE_REQUISITION_STATUSES, funnelStats, measurableEffort } from './hiring.js';

export const AUTOMATION_RULES = [
  {
    id: 'RULE-STAKE-01',
    name: 'Mendelow coalition cadence scheduler',
    framework: 'Mendelow (1981) Power × Interest Matrix',
    trigger: 'case.created / case.updated',
    targetModule: 'cases.stakeholders',
    description: 'Assigns communication cadence and next check-in dates for high-power or high-interest stakeholders lacking a schedule.',
  },
  {
    id: 'RULE-DEC-01',
    name: 'Strategic DACI tradeoff decision log',
    framework: 'Bain RAPID / Intuit DACI & Expected-Value Risk Governance',
    trigger: 'case.created / case.updated',
    targetModule: 'decisions',
    description: 'Creates and links a structured DACI Decision record when Action Priority is High, expected exposure >= 10,000, or the case is an escalation/strategic initiative.',
  },
  {
    id: 'RULE-DEL-01',
    name: 'Accountable mitigation delegation',
    framework: 'Situational Leadership & Explicit Authority Levels',
    trigger: 'case.created / case.updated',
    targetModule: 'delegations',
    description: 'Creates and links an accountable mitigation delegation for the active case owner when preventive action or elevated FMEA priority is present.',
  },
  {
    id: 'RULE-GOAL-01',
    name: 'Goal risk & confidence propagation',
    framework: 'OKR Risk Telemetry & Leading Indicators (Doerr, 2018)',
    trigger: 'case.created / case.updated / case.resolved',
    targetModule: 'goals',
    description: 'Links impacted active goals, shifts on-track goals to at-risk under High-priority cases with an explainable check-in, and logs resolution updates.',
  },
  {
    id: 'RULE-COACH-01',
    name: 'Blameless 1:1 support & coaching prep',
    framework: 'Edmondson (1999) Psychological Safety & Reason (1990) Blameless Learning',
    trigger: 'case.created / case.updated',
    targetModule: 'people',
    description: 'Links involved active team members and queues a blameless support/barrier talking point for their next 1:1 without affecting performance ratings.',
  },
  {
    id: 'RULE-SYNC-DEL-01',
    name: 'Mitigation completion feedback loop',
    framework: 'Closed-Loop Operational Control (Meadows, 2008)',
    trigger: 'delegation.completed',
    targetModule: 'cases',
    description: 'Advances open/mitigating cases to monitoring when all linked mitigation delegations are completed so residual risk can be verified.',
  },
  {
    id: 'RULE-CAP-04',
    name: 'Delegation completion → portfolio delivery',
    framework: 'Closed-Loop Operational Control (Deming PDCA) & WIP Integrity (Little, 1961)',
    trigger: 'delegation.completed',
    targetModule: 'portfolio',
    description: 'Marks explicitly linked, open portfolio work delivered on the recorded delegation completion date, preserving its typed link and freeing capacity without requiring a second update.',
  },
  {
    id: 'RULE-CAP-01',
    name: 'Capacity reserve registration & release',
    framework: 'Capacity Planning & Queueing Theory (Little, 1961; Kingman, 1961)',
    trigger: 'case.created / case.updated / case.resolved',
    targetModule: 'portfolio',
    description: 'Registers (or refreshes) the person-days an open case diverts as a committed capacity reserve, and releases them when the case is resolved — so the operating plan counts reality without a second data entry.',
  },
  {
    id: 'RULE-CAP-02',
    name: 'Over-allocation trade-off decision',
    framework: 'Marginal Analysis & Explicit Deferral (Economics of scarcity)',
    trigger: 'case.created / case.updated',
    targetModule: 'decisions',
    description: 'When committed work exceeds allocatable capacity, opens one DACI decision with the concrete deferral options that would restore feasibility, ranked by value density.',
  },
  {
    id: 'RULE-CAP-03',
    name: 'Portfolio decision → goal impact',
    framework: 'OKR Risk Telemetry (Doerr, 2018) & Opportunity Cost',
    trigger: 'portfolio.decided',
    targetModule: 'goals',
    description: 'Records an explainable check-in on the linked goal when its funded work is deferred or cut, so a capacity decision is never silently detached from the objective it starves.',
  },
  {
    id: 'RULE-HIRE-01',
    name: 'Requisition interview-effort reserve',
    framework: 'Capacity Planning (Little, 1961) & Explicit-Estimate Discipline',
    trigger: 'requisition.opened / requisition.updated / requisition.closed',
    targetModule: 'portfolio',
    description: 'Registers the interviewer effort an active requisition diverts as committed capacity, refreshes it when estimates change, and completes or releases it when the role is filled, cancelled or put on hold. No estimate is ever invented: a requisition without a recorded effort reserves nothing.',
  },
  {
    id: 'RULE-HIRE-02',
    name: 'Offer accepted → roster, onboarding & delivery loop',
    framework: 'Closed-Loop Hiring Handoff (Deming PDCA) & Organizational Socialization (Bauer & Erdogan, 2011)',
    trigger: 'candidate.offer-accepted',
    targetModule: 'people / onboarding / portfolio',
    description: 'Links the accepted candidate to the roster record and its 30-60-90 plan, closes the requisition and its capacity reserve as delivered, and records the typed graph edges so the hire is traceable from requisition to first 90 days.',
  },
  {
    id: 'RULE-HIRE-03',
    name: 'Stalled requisition risk escalation',
    framework: 'Cost of Vacancy & Operational Risk Escalation (Hubbard, 2020)',
    trigger: 'requisition.reviewed',
    targetModule: 'cases',
    description: 'Raises exactly one operational case for a requisition that has stopped moving for the configured window, so vacancy exposure inherits FMEA, PERT financial analysis, stakeholder coalitions, a DACI decision and an accountable delegation instead of sitting in a hiring tab nobody opens.',
  },
  {
    id: 'RULE-ESC-01',
    name: 'Upstream operational escalation',
    framework: 'Cross-Module Incident & Risk Escalation',
    trigger: 'case.escalated',
    targetModule: 'cases',
    description: 'Promotes a blocked delegation, at-risk/off-track goal, or adverse decision into a full Operational Case and fans out parallel downstream links.',
  },
];

const DECISION_EXPOSURE_THRESHOLD = 10_000;

function cadenceDaysOffset(quadrant, stance) {
  if (quadrant === 'manage-closely' && (stance === 'blocker' || stance === 'skeptical')) return 1;
  if (quadrant === 'manage-closely') return 3;
  if (quadrant === 'keep-satisfied') return 5;
  if (quadrant === 'keep-informed') return 7;
  return 14;
}

function defaultCadenceFor(quadrant, stance) {
  if (quadrant === 'manage-closely' && (stance === 'blocker' || stance === 'skeptical')) return 'immediate';
  if (quadrant === 'manage-closely') return 'weekly';
  if (quadrant === 'keep-satisfied') return 'milestone';
  if (quadrant === 'keep-informed') return 'weekly';
  return 'digest';
}

function addDaysKey(baseDayStr, days, fallbackNow) {
  const anchor = baseDayStr ? new Date(`${baseDayStr}T12:00:00Z`) : fallbackNow;
  return dayKey(addDays(anchor, days));
}

function hasCaseLinkToType(links, caseId, targetType, allowedRelations = null) {
  return (links || []).find((l) => {
    if (!l) return false;
    const relOk = !allowedRelations || allowedRelations.includes(l.relation);
    if (!relOk) return false;
    return (
      (l.sourceType === 'case' && l.sourceId === caseId && l.targetType === targetType) ||
      (l.targetType === 'case' && l.targetId === caseId && l.sourceType === targetType)
    );
  }) || null;
}

function hasExactLink(links, sourceType, sourceId, targetType, targetId, relation) {
  return (links || []).find(
    (l) =>
      l &&
      l.sourceType === sourceType &&
      l.sourceId === sourceId &&
      l.targetType === targetType &&
      l.targetId === targetId &&
      l.relation === relation,
  ) || null;
}

/**
 * Idempotently register a typed edge in `draft.links`, enforcing privacy walls.
 */
export function ensureEntityLink(draft, spec, { idFactory, todayStr, nowIso }) {
  const { sourceType, sourceId, targetType, targetId, relation, ruleId = '', summary = '' } = spec;
  if (
    !LINK_ENTITY_TYPES.includes(sourceType) ||
    !LINK_ENTITY_TYPES.includes(targetType) ||
    FORBIDDEN_LINK_TYPES.includes(sourceType) ||
    FORBIDDEN_LINK_TYPES.includes(targetType) ||
    !LINK_RELATIONS.includes(relation) ||
    !sourceId ||
    !targetId
  ) {
    return { created: false, link: null };
  }
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const existing = hasExactLink(draft.links, sourceType, sourceId, targetType, targetId, relation);
  if (existing) return { created: false, link: existing };

  const link = {
    id: idFactory('lnk'),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId: ruleId || '',
    summary: summary || '',
    createdOn: todayStr,
    createdAt: nowIso,
  };
  draft.links.push(link);
  return { created: true, link };
}

function shouldCreateDecision(caseRecord, fmea, pert, options = {}) {
  if (options.propagateDecision === false) return false;
  if (options.propagateDecision === true) return true;
  return (
    fmea.actionPriority === 'high' ||
    caseRecord.kind === 'escalation' ||
    caseRecord.kind === 'initiative' ||
    pert.cost.expected >= DECISION_EXPOSURE_THRESHOLD
  );
}

function shouldCreateDelegation(caseRecord, fmea, owner, options = {}) {
  if (!owner || owner.status === 'archived') return false;
  if (options.propagateDelegation === false) return false;
  if (options.propagateDelegation === true) return true;
  const preventive = (caseRecord?.rca?.preventiveAction || '').trim();
  return Boolean(preventive.length >= 4 || fmea.actionPriority === 'high' || fmea.actionPriority === 'medium');
}

function coachingPromptForCase(caseRecord) {
  const shortTitle = (caseRecord.title || 'Operational case').trim().slice(0, 56);
  return `Case support (${shortTitle}): review systemic barriers, capacity trade-offs & air-cover needed`;
}


/* ------------------------------------------------------------------ */
/* Capacity & flow (Schema v16)                                        */
/* ------------------------------------------------------------------ */

/** The reserve entry that represents one case's diverted person-days. */
function findCapacityReserve(draft, caseId) {
  return (draft.portfolio || []).find(
    (p) => p && p.kind === 'capacity-reserve' && p.sourceType === 'case' && p.sourceId === caseId,
  ) || null;
}

function capacityTripleForCase(caseRecord) {
  const fin = caseRecord?.financial || {};
  const o = Math.max(0, Number(fin.capacityDaysOptimistic) || 0);
  const m = Math.max(0, Number(fin.capacityDaysMostLikely) || 0);
  const p = Math.max(0, Number(fin.capacityDaysPessimistic) || 0);
  return { optimistic: o, mostLikely: m, pessimistic: p };
}

/**
 * RULE-CAP-01 — keep the operating plan's committed capacity equal to reality.
 *
 * Creating a case with a capacity estimate registers a committed reserve;
 * editing the estimate refreshes it in place (the reserve keeps its id, so
 * history and links survive); resolving the case releases it. Every branch is
 * idempotent: re-running the rules changes nothing when the numbers already
 * agree.
 */
export function syncCaseCapacityReserve(draft, caseRecord, { now, idFactory, todayStr, nowIso, logEvent = null } = {}) {
  return applyCapacityReserve(draft, caseRecord, { now, idFactory, todayStr, nowIso, logEvent });
}

function applyCapacityReserve(draft, caseRecord, { now, idFactory, todayStr, nowIso, logEvent }) {
  if (caseRecord.autoPropagate === false) return null;
  const triple = capacityTripleForCase(caseRecord);
  const expected = (triple.optimistic + 4 * triple.mostLikely + triple.pessimistic) / 6;
  const existing = findCapacityReserve(draft, caseRecord.id);

  if (!existing) {
    if (expected <= 0) return null;
    draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
    const reserve = {
      id: idFactory('pf'),
      title: `Capacity reserve: ${caseRecord.title}`.slice(0, 200),
      kind: 'capacity-reserve',
      status: 'open',
      sourceType: 'case',
      sourceId: caseRecord.id,
      ownerId: caseRecord.ownerId || null,
      effortDays: triple,
      value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
      currency: caseRecord.financial?.currency || 'USD',
      decision: 'funded',
      decisionOn: caseRecord.openedOn || todayStr,
      rationale: 'Reserved automatically because the operational case diverts team capacity (RULE-CAP-01).',
      targetOn: caseRecord.reviewOn || null,
      createdOn: caseRecord.openedOn || todayStr,
      completedOn: null,
      releasedOn: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    draft.portfolio.push(reserve);
    ensureEntityLink(
      draft,
      {
        sourceType: 'case',
        sourceId: caseRecord.id,
        targetType: 'portfolio',
        targetId: reserve.id,
        relation: 'consumes-capacity',
        ruleId: 'RULE-CAP-01',
        summary: `Reserves ${Math.round(expected * 10) / 10} person-days for this case`,
      },
      { idFactory, todayStr, nowIso },
    );
    return {
      ruleId: 'RULE-CAP-01',
      targetType: 'portfolio',
      targetId: reserve.id,
      action: 'created',
      summary: `Reserved ${Math.round(expected * 10) / 10} person-day(s) of capacity (P90 ${Math.round(triple.pessimistic * 10) / 10})`,
    };
  }

  // Existing reserve: refresh numbers, but never overwrite a released reserve's
  // lifecycle. A reopened case gets it back.
  const sameTriple =
    existing.effortDays?.optimistic === triple.optimistic &&
    existing.effortDays?.mostLikely === triple.mostLikely &&
    existing.effortDays?.pessimistic === triple.pessimistic;
  if (existing.status === 'released') {
    existing.status = 'open';
    existing.releasedOn = null;
    existing.effortDays = triple;
    existing.targetOn = caseRecord.reviewOn || existing.targetOn;
    existing.updatedAt = nowIso;
    return {
      ruleId: 'RULE-CAP-01',
      targetType: 'portfolio',
      targetId: existing.id,
      action: 'reopened',
      summary: `Reinstated the ${Math.round(expected * 10) / 10} person-day capacity reserve for the reopened case`,
    };
  }
  if (sameTriple) return null;
  existing.effortDays = triple;
  existing.targetOn = caseRecord.reviewOn || existing.targetOn;
  existing.ownerId = caseRecord.ownerId || existing.ownerId;
  existing.updatedAt = nowIso;
  return {
    ruleId: 'RULE-CAP-01',
    targetType: 'portfolio',
    targetId: existing.id,
    action: 'updated',
    summary: `Updated the capacity reserve to ${Math.round(expected * 10) / 10} person-day(s)`,
  };
}

function capacityDecisionStillOpen(draft) {
  for (const link of draft.links || []) {
    if (!link || link.ruleId !== 'RULE-CAP-02') continue;
    const decisionId = link.targetType === 'decision' ? link.targetId : link.sourceType === 'decision' ? link.sourceId : null;
    const decision = decisionId ? (draft.decisions || []).find((d) => d.id === decisionId) : null;
    if (!decision) continue;
    if (!decision.reviewedOn) return true; // already acknowledged and awaiting outcome review
  }
  return false;
}

/**
 * RULE-CAP-02 — when the plan is infeasible, make the trade-off explicit.
 *
 * The engine does not delete work or reshuffle priorities on its own. It opens
 * exactly one DACI decision containing the real numbers and the concrete
 * options that would restore feasibility, ranked by value density, and it does
 * not open another until that decision's outcome has been reviewed.
 */
export function evaluateCapacityTradeoff(draft, { now, idFactory, todayStr, nowIso, logEvent, triggerLabel = 'case' }) {
  const model = buildCapacityModel(draft, { now });
  if (!model.hasTeam || model.utilisation === null) return null;
  if (model.utilisation <= 1) return null;
  if (capacityDecisionStillOpen(draft)) return null;

  const ranking = rankPortfolio(model);
  const forecast = deliveryForecast(model, { now });
  const anchor = model.demand.committed
    .slice()
    .sort((a, b) => b.effort.expected - a.effort.expected)[0];
  if (!anchor) return null;

  const freeing = ranking.releaseCandidates.slice(0, 3);
  const options = freeing.map((item) => ({
    id: idFactory('dopt'),
    label: `Defer “${item.title.slice(0, 90)}” to free ${item.effort.expected} day(s)`,
    pros: item.valueDensity !== null
      ? `Lowest value density in the funded plan (${item.valueDensity.toFixed(2)} value per person-day)`
      : 'Frees capacity without touching the highest-value work',
    cons: item.targetOn ? `Delays a ${item.targetOn} target and forgoes its benefit` : 'Delays this commitment with no new date yet',
  }));
  options.push({
    id: idFactory('dopt'),
    label: 'Hold the plan and accept the queue delay',
    pros: 'No visible de-scoping conversation in this cycle',
    cons: forecast.p80
      ? `Forecast delivery slips to ${forecast.p80} at P80, and wait time grows faster than the added work`
      : 'Committed work exceeds capacity, so the date is unknowable until scope changes',
  });
  if (model.demand.wanted.length) {
    options.push({
      id: idFactory('dopt'),
      label: `Provide capacity: do not start ${model.demand.wanted.length} unfunded item(s) yet`,
      pros: `${model.demand.wantedDays} day(s) of demand stays uncommitted`,
      cons: 'Requires saying no out loud to the requester rather than absorbing it',
    });
  }

  const deficit = Math.round(-model.slackDays);
  const decision = {
    id: idFactory('dec'),
    title: `Capacity trade-off: plan is ${Math.round(model.utilisation * 100)}% committed`.slice(0, 180),
    question: [
      `The operating plan commits ${model.demand.committedDays} person-days against ${model.supply.allocatableDays} allocatable (${Math.round(model.utilisation * 100)}% utilisation, ${model.band.label.toLowerCase()}).`,
      `Deficit: ${deficit} person-day(s) over the ${model.horizonWeeks}-week horizon.`,
      `Committed breakdown: ${model.demand.reserveDays} reserved for incidents/mitigations, ${model.demand.fundedDays} funded planned work, plus operational reserve of ${model.supply.operationalReserveDays} day(s) already excluded from supply.`,
      `Triggered by a ${triggerLabel} event (RULE-CAP-02). Queueing theory says every point of utilisation above 80% costs more lead time than the work it adds (Kingman, 1961): the honest answer is a smaller plan or a later date, not more optimism.`,
    ].join(' ').slice(0, 2000),
    date: todayStr,
    reversibility: 'reversible',
    driver: (draft.settings?.leaderName || '').slice(0, 120),
    approver: (draft.settings?.leaderName || '').slice(0, 120),
    contributors: freeing.map((item) => item.title).join(', ').slice(0, 300),
    informed: '',
    options,
    chosen: '',
    rationale: '',
    reviewOn: addDaysKey(todayStr, (draft.settings?.decisionReviewDays ?? 14), now),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    createdAt: nowIso,
  };
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);

  ensureEntityLink(
    draft,
    {
      sourceType: 'decision',
      sourceId: decision.id,
      targetType: 'portfolio',
      targetId: anchor.id,
      relation: 'funds',
      ruleId: 'RULE-CAP-02',
      summary: `Allocates capacity against “${anchor.title.slice(0, 80)}” (current biggest commitment)`,
    },
    { idFactory, todayStr, nowIso },
  );

  const entry = {
    ruleId: 'RULE-CAP-02',
    targetType: 'decision',
    targetId: decision.id,
    action: 'created',
    summary: `Over-allocation (${Math.round(model.utilisation * 100)}%) opened a capacity trade-off decision with ${options.length} options`,
  };
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'decision',
      entityId: decision.id,
      summary: `[RULE-CAP-02] ${entry.summary}`,
    });
  }
  return entry;
}

/**
 * Dry-run preview of parallel cross-module rules for the Case dialog UI.
 * Pure read-only evaluation — never mutates `state`.
 */
export function previewCasePropagations(caseInput = {}, state = {}, { now = new Date(), existingCaseId = null } = {}) {
  const todayStr = dayKey(now);
  const autoPropagate = caseInput.autoPropagate !== false;
  if (!autoPropagate) return [];

  const open = isCaseOpen({ status: caseInput.status || 'open' });
  if (!open) return [];

  const fmea = computeFmea(caseInput.fmea);
  const pert = computePertImpact(caseInput.financial, fmea);
  const links = state.links || [];
  const previews = [];

  // 1. Stakeholder coalition schedules
  const unscheduledStakeholders = (caseInput.stakeholders || []).filter(
    (s) => s && String(s.name || '').trim() && !s.nextCommsOn,
  );
  if (unscheduledStakeholders.length > 0) {
    previews.push({
      ruleId: 'RULE-STAKE-01',
      targetModule: 'Stakeholder coalition',
      action: 'schedule',
      summary: `Schedule communication checkpoints for ${unscheduledStakeholders.length} stakeholder${unscheduledStakeholders.length === 1 ? '' : 's'}`,
      detail: 'Mendelow Power × Interest quadrant sets immediate, weekly, milestone, or digest cadence.',
    });
  }

  // 2. Strategic Decision Log
  const existingDecisionLink = existingCaseId
    ? hasCaseLinkToType(links, existingCaseId, 'decision', ['decides', 'escalates-from'])
    : null;
  if (!existingDecisionLink && shouldCreateDecision(caseInput, fmea, pert, caseInput)) {
    previews.push({
      ruleId: 'RULE-DEC-01',
      targetModule: 'Decisions (DACI)',
      action: 'create',
      summary: `Create linked DACI decision (${fmea.severity >= 8 ? 'irreversible / high-impact' : 'reversible'} framing)`,
      detail: `Triggered by ${fmea.actionPriority.toUpperCase()} Action Priority (RPN ${fmea.rpn})${pert.hasFinancialEstimate ? ` and ${pert.currency} ${pert.cost.expected.toLocaleString('en-US')} PERT expected exposure` : ''}.`,
    });
  }

  // 3. Accountable Mitigation Delegation
  const owner = caseInput.ownerId ? (state.people || []).find((p) => p.id === caseInput.ownerId) : null;
  const existingDelegationLink = existingCaseId
    ? hasCaseLinkToType(links, existingCaseId, 'delegation', ['mitigates', 'escalates-from'])
    : null;
  if (!existingDelegationLink && shouldCreateDelegation(caseInput, fmea, owner, caseInput)) {
    previews.push({
      ruleId: 'RULE-DEL-01',
      targetModule: 'Delegations',
      action: 'create',
      summary: `Delegate accountable mitigation to ${owner.name}`,
      detail: `Authority calibrated to ${fmea.actionPriority === 'high' ? 'Recommend' : 'Act & inform'} with review date ${caseInput.reviewOn || addDaysKey(todayStr, 14, now)}.`,
    });
  }

  // 4. Goal Risk & Confidence Propagation
  const goal = caseInput.linkedGoalId
    ? (state.goals || []).find((g) => g.id === caseInput.linkedGoalId && g.status === 'active')
    : null;
  if (goal) {
    const willShiftRisk =
      (fmea.actionPriority === 'high' || caseInput.kind === 'incident' || caseInput.kind === 'escalation') &&
      goal.confidence === 'on-track';
    previews.push({
      ruleId: 'RULE-GOAL-01',
      targetModule: 'Goals & OKRs',
      action: willShiftRisk ? 'update' : 'link',
      summary: willShiftRisk
        ? `Link goal “${goal.title}” and shift confidence from On track → At risk`
        : `Link active goal “${goal.title}” for risk telemetry`,
      detail: 'Appends an explainable check-in note referencing the operational case and RPN.',
    });
  }

  // 5. Team Coaching & 1:1 Prep
  const involvedIds = new Set(
    [caseInput.ownerId, ...(caseInput.involvedPersonIds || [])].filter(Boolean),
  );
  const activeInvolved = [...involvedIds]
    .map((pid) => (state.people || []).find((p) => p.id === pid && p.status === 'active'))
    .filter(Boolean);
  if (activeInvolved.length > 0) {
    previews.push({
      ruleId: 'RULE-COACH-01',
      targetModule: '1:1 Prep & People Coaching',
      action: 'update',
      summary: `Queue blameless 1:1 support & barrier check-in for ${activeInvolved.map((p) => p.name).join(', ')}`,
      detail: 'Adds coaching talking point and surfaces the case on printable 1:1 prep sheets (excluded from performance ratings).',
    });
  }

  // 6. Capacity reserve registration
  const capacityTriple = {
    optimistic: Math.max(0, Number(caseInput?.financial?.capacityDaysOptimistic) || 0),
    mostLikely: Math.max(0, Number(caseInput?.financial?.capacityDaysMostLikely) || 0),
    pessimistic: Math.max(0, Number(caseInput?.financial?.capacityDaysPessimistic) || 0),
  };
  const capacityExpected =
    (capacityTriple.optimistic + 4 * capacityTriple.mostLikely + capacityTriple.pessimistic) / 6;
  const existingReserve = (state.portfolio || []).find(
    (p) => p.kind === 'capacity-reserve' && p.sourceType === 'case' && p.sourceId === existingCaseId,
  );
  const reserveChanged = existingReserve
    ? existingReserve.effortDays?.mostLikely !== capacityTriple.mostLikely ||
      existingReserve.effortDays?.optimistic !== capacityTriple.optimistic ||
      existingReserve.effortDays?.pessimistic !== capacityTriple.pessimistic
    : capacityExpected > 0;
  if (reserveChanged) {
    previews.push({
      ruleId: 'RULE-CAP-01',
      targetModule: 'Capacity & flow plan',
      action: existingReserve ? 'update' : 'create',
      summary: existingReserve
        ? `Refresh the capacity reserve to ${Math.round(capacityExpected * 10) / 10} person-day(s)`
        : `Reserve ${Math.round(capacityExpected * 10) / 10} person-day(s) of team capacity`,
      detail: 'Little’s Law/Kingman utilisation updates immediately; the reserve is released when the case is resolved.',
    });
  }

  // 7. Over-allocation trade-off decision
  const model = buildCapacityModel(state, { now });
  if (model.hasTeam && model.utilisation !== null) {
    const alreadyReserved = Boolean(existingReserve);
    const projected =
      model.demand.committedDays + (capacityExpected > 0 && !alreadyReserved ? capacityExpected : 0);
    const projectedUtilisation = model.supply.allocatableDays > 0 ? projected / model.supply.allocatableDays : null;
    if (projectedUtilisation !== null && projectedUtilisation > 1) {
      const band = utilisationBand(projectedUtilisation);
      previews.push({
        ruleId: 'RULE-CAP-02',
        targetModule: 'Decisions (DACI)',
        action: 'create',
        summary: `Plan becomes ${Math.round(projectedUtilisation * 100)}% committed — open a trade-off decision`,
        detail: `${band.label}. Options are generated from the lowest value-density committed work (${(projected - model.supply.allocatableDays).toFixed(1)} day deficit) unless an unanswered capacity decision is already open.`,
      });
    }
  }

  return previews;
}

/**
 * Execute parallel cross-module rules inside a `store.update` draft mutation
 * when an Operational Case is created or updated.
 */
export function propagateCaseEvent(draft, caseRecord, { now = new Date(), idFactory, logEvent = null, options = {} } = {}) {
  const propagations = [];
  if (!draft || !caseRecord || caseRecord.autoPropagate === false) return propagations;
  if (!isCaseOpen(caseRecord)) return propagations;

  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const fmea = computeFmea(caseRecord.fmea);
  const pert = computePertImpact(caseRecord.financial, fmea);
  const defaultReviewOn = caseRecord.reviewOn || addDaysKey(caseRecord.openedOn || todayStr, 14, now);

  // 1. RULE-STAKE-01: Mendelow Stakeholder Cadence & Next Comms Dates
  if (Array.isArray(caseRecord.stakeholders) && caseRecord.stakeholders.length > 0) {
    let scheduledCount = 0;
    for (const s of caseRecord.stakeholders) {
      const classified = classifyMendelowStakeholder(s, todayStr);
      if (!s.commsCadence) s.commsCadence = defaultCadenceFor(classified.quadrant, classified.stance);
      if (!s.nextCommsOn) {
        const offset = cadenceDaysOffset(classified.quadrant, classified.stance);
        s.nextCommsOn = addDaysKey(todayStr, offset, now);
        scheduledCount += 1;
      }
    }
    if (scheduledCount > 0) {
      propagations.push({
        ruleId: 'RULE-STAKE-01',
        targetType: 'case',
        targetId: caseRecord.id,
        action: 'scheduled-comms',
        summary: `Scheduled Mendelow stakeholder briefs (${scheduledCount})`,
      });
    }
  }

  // 2. RULE-DEC-01: Strategic DACI Decision Log
  const existingDecisionLink = hasCaseLinkToType(draft.links, caseRecord.id, 'decision', ['decides', 'escalates-from']);
  if (!existingDecisionLink && shouldCreateDecision(caseRecord, fmea, pert, options)) {
    const contextParts = [
      `Operational case (${caseRecord.kind}): ${caseRecord.summary || caseRecord.title}`,
      `FMEA: Severity ${fmea.severity}/10 × Probability ${fmea.probability}/10 × Detection ${fmea.detectability}/10 = RPN ${fmea.rpn} (${fmea.actionPriority.toUpperCase()} Action Priority).`,
    ];
    if (pert.hasFinancialEstimate) {
      contextParts.push(
        `PERT financial exposure: expected ${pert.currency} ${pert.cost.expected.toLocaleString('en-US')} (P10 ${pert.cost.p10.toLocaleString('en-US')} – P90 ${pert.cost.p90.toLocaleString('en-US')}); expected unmitigated loss ${pert.currency} ${pert.expectedUnmitigatedLoss.toLocaleString('en-US')}.`,
      );
    }
    if (pert.hasCapacityEstimate) {
      contextParts.push(
        `PERT diverted capacity: ${pert.capacity.expected} person-days (P90 ${pert.capacity.p90}d).`,
      );
    }
    if (pert.opportunityCost) {
      contextParts.push(`Opportunity cost / trade-off: ${pert.opportunityCost}`);
    }

    const stakeholdersByPower = (caseRecord.stakeholders || []).slice().sort((a, b) => (b.power || 0) - (a.power || 0));
    const approverName = stakeholdersByPower.find((s) => (s.power || 0) >= 4)?.name || '';
    const contributors = stakeholdersByPower
      .filter((s) => (s.interest || 0) >= 3 && s.name !== approverName)
      .map((s) => s.name);
    const informed = stakeholdersByPower
      .filter((s) => (s.interest || 0) < 3 && s.name !== approverName)
      .map((s) => s.name);

    const ownerPerson = caseRecord.ownerId
      ? (draft.people || []).find((p) => p.id === caseRecord.ownerId)
      : null;

    const decisionOptions = [];
    if ((caseRecord?.rca?.preventiveAction || '').trim()) {
      decisionOptions.push({
        id: idFactory('dopt'),
        label: `Fund systemic mitigation: ${caseRecord.rca.preventiveAction.trim().slice(0, 120)}`,
        pros: pert.hasFinancialEstimate
          ? `Avoids ~${pert.currency} ${pert.expectedLossAvoided.toLocaleString('en-US')} expected loss`
          : 'Addresses systemic barrier rather than symptoms',
        cons: pert.mitigationCost > 0
          ? `Requires ${pert.currency} ${pert.mitigationCost.toLocaleString('en-US')} investment${pert.opportunityCost ? ` (${pert.opportunityCost})` : ''}`
          : pert.opportunityCost || 'Diverts near-term engineering capacity',
      });
      decisionOptions.push({
        id: idFactory('dopt'),
        label: 'Accept / contain current exposure with manual monitoring only',
        pros: 'Preserves immediate roadmap capacity',
        cons: `Retains RPN ${fmea.rpn} (${fmea.actionPriority.toUpperCase()} priority) failure risk`,
      });
    }

    const decision = {
      id: idFactory('dec'),
      title: `Response & trade-off: ${caseRecord.title}`.slice(0, 180),
      question: contextParts.join(' ').slice(0, 2000),
      date: caseRecord.openedOn || todayStr,
      reversibility: fmea.severity >= 8 ? 'irreversible' : 'reversible',
      driver: (ownerPerson?.name || '').slice(0, 120),
      approver: approverName.slice(0, 120),
      contributors: contributors.join(', ').slice(0, 300),
      informed: informed.join(', ').slice(0, 300),
      options: decisionOptions,
      chosen: '',
      rationale: '',
      reviewOn: defaultReviewOn,
      reviewedOn: null,
      outcome: 'pending',
      outcomeNotes: '',
      createdAt: nowIso,
    };
    draft.decisions.push(decision);
    ensureEntityLink(
      draft,
      {
        sourceType: 'case',
        sourceId: caseRecord.id,
        targetType: 'decision',
        targetId: decision.id,
        relation: 'decides',
        ruleId: 'RULE-DEC-01',
        summary: `DACI decision created for ${caseRecord.title}`,
      },
      { idFactory, todayStr, nowIso },
    );
    const entry = {
      ruleId: 'RULE-DEC-01',
      targetType: 'decision',
      targetId: decision.id,
      action: 'created',
      summary: `Auto-created DACI decision “${decision.title.slice(0, 70)}”`,
    };
    propagations.push(entry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'decision',
        entityId: decision.id,
        summary: `[RULE-DEC-01] ${entry.summary}`,
      });
    }
  }

  // 3. RULE-DEL-01: Accountable Mitigation Delegation
  const owner = caseRecord.ownerId
    ? (draft.people || []).find((p) => p.id === caseRecord.ownerId)
    : null;
  const existingDelegationLink = hasCaseLinkToType(draft.links, caseRecord.id, 'delegation', ['mitigates', 'escalates-from']);
  if (!existingDelegationLink && shouldCreateDelegation(caseRecord, fmea, owner, options)) {
    const preventiveText = (caseRecord?.rca?.preventiveAction || '').trim();
    const expectedOutcome = (
      preventiveText ||
      `Deliver verified systemic mitigation for “${caseRecord.title}” and lower FMEA Action Priority from ${fmea.actionPriority.toUpperCase()}.`
    ).slice(0, 600);
    const supportText = pert.opportunityCost
      ? `Leader air-cover on trade-off (${pert.opportunityCost.slice(0, 140)}) and stakeholder coalition alignment.`
      : 'Leader air-cover on stakeholder alignment, scope protection, and systemic barrier removal.';

    const delegation = {
      id: idFactory('delegation'),
      personId: owner.id,
      title: `Mitigate: ${caseRecord.title}`.slice(0, 160),
      expectedOutcome,
      authority: fmea.actionPriority === 'high' ? 'recommend' : 'act-inform',
      support: supportText,
      delegatedOn: caseRecord.openedOn <= todayStr ? caseRecord.openedOn : todayStr,
      dueOn: defaultReviewOn,
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    draft.delegations.push(delegation);
    if (caseRecord.status === 'open') {
      caseRecord.status = 'mitigating';
    }
    ensureEntityLink(
      draft,
      {
        sourceType: 'case',
        sourceId: caseRecord.id,
        targetType: 'delegation',
        targetId: delegation.id,
        relation: 'mitigates',
        ruleId: 'RULE-DEL-01',
        summary: `Mitigation delegated to ${owner.name}`,
      },
      { idFactory, todayStr, nowIso },
    );
    const entry = {
      ruleId: 'RULE-DEL-01',
      targetType: 'delegation',
      targetId: delegation.id,
      action: 'created',
      summary: `Auto-delegated mitigation to ${owner.name}`,
    };
    propagations.push(entry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'delegation',
        entityId: delegation.id,
        summary: `[RULE-DEL-01] ${entry.summary}: “${delegation.title.slice(0, 60)}”`,
      });
    }
  }

  // 4. RULE-GOAL-01: Goal Risk & Confidence Propagation
  if (caseRecord.linkedGoalId) {
    const goal = (draft.goals || []).find((g) => g.id === caseRecord.linkedGoalId && g.status === 'active');
    if (goal) {
      const linkRes = ensureEntityLink(
        draft,
        {
          sourceType: 'case',
          sourceId: caseRecord.id,
          targetType: 'goal',
          targetId: goal.id,
          relation: 'impacts-goal',
          ruleId: 'RULE-GOAL-01',
          summary: `Case impacts goal ${goal.title}`,
        },
        { idFactory, todayStr, nowIso },
      );

      const caseTag = `[Case ${caseRecord.id}]`;
      const highImpact =
        fmea.actionPriority === 'high' ||
        caseRecord.kind === 'incident' ||
        caseRecord.kind === 'escalation';
      const alreadyLoggedRisk = (goal.checkins || []).some((chk) => String(chk.note || '').includes(caseTag));

      if (highImpact && !alreadyLoggedRisk) {
        const nextConfidence = goal.confidence === 'on-track' ? 'at-risk' : goal.confidence;
        goal.confidence = nextConfidence;
        goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
        goal.checkins.push({
          id: idFactory('chk'),
          date: todayStr,
          confidence: nextConfidence,
          progressPct: null,
          keyResults: null,
          note: `${caseTag} Linked ${caseRecord.kind} “${caseRecord.title.slice(0, 60)}” (FMEA ${fmea.actionPriority.toUpperCase()}, RPN ${fmea.rpn}).`,
        });
        const entry = {
          ruleId: 'RULE-GOAL-01',
          targetType: 'goal',
          targetId: goal.id,
          action: 'updated',
          summary: `Updated goal “${goal.title.slice(0, 50)}” (${nextConfidence}) with risk check-in`,
        };
        propagations.push(entry);
        if (logEvent) {
          logEvent({
            type: 'automation.propagated',
            entity: 'goal',
            entityId: goal.id,
            summary: `[RULE-GOAL-01] ${entry.summary}`,
          });
        }
      } else if (linkRes.created) {
        propagations.push({
          ruleId: 'RULE-GOAL-01',
          targetType: 'goal',
          targetId: goal.id,
          action: 'linked',
          summary: `Linked goal “${goal.title.slice(0, 50)}”`,
        });
      }
    }
  }

  // 5. RULE-COACH-01: Blameless Team Coaching & 1:1 Prep
  const involvedIds = [...new Set([caseRecord.ownerId, ...(caseRecord.involvedPersonIds || [])].filter(Boolean))];
  const promptText = coachingPromptForCase(caseRecord);
  const casePrefix = `Case support (${(caseRecord.title || '').trim().slice(0, 32)}`;

  for (const personId of involvedIds) {
    const person = (draft.people || []).find((p) => p.id === personId && p.status === 'active');
    if (!person) continue;

    const linkRes = ensureEntityLink(
      draft,
      {
        sourceType: 'case',
        sourceId: caseRecord.id,
        targetType: 'person',
        targetId: person.id,
        relation: 'coaches',
        ruleId: 'RULE-COACH-01',
        summary: `Blameless 1:1 coaching & air-cover for ${person.name}`,
      },
      { idFactory, todayStr, nowIso },
    );

    person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
    const hasTopic = person.talkingPoints.some(
      (tp) => tp === promptText || (casePrefix.length > 16 && String(tp).startsWith(casePrefix)),
    );
    if (!hasTopic && person.talkingPoints.length < 12) {
      person.talkingPoints.push(promptText);
      const entry = {
        ruleId: 'RULE-COACH-01',
        targetType: 'person',
        targetId: person.id,
        action: 'updated',
        summary: `Queued blameless 1:1 support topic for ${person.name}`,
      };
      propagations.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'person',
          entityId: person.id,
          summary: `[RULE-COACH-01] ${entry.summary}`,
        });
      }
    } else if (linkRes.created) {
      propagations.push({
        ruleId: 'RULE-COACH-01',
        targetType: 'person',
        targetId: person.id,
        action: 'linked',
        summary: `Linked ${person.name} for 1:1 prep context`,
      });
    }
  }

  // 6. RULE-CAP-01: reserve the person-days this case diverts from the plan
  const reserveEntry = applyCapacityReserve(draft, caseRecord, {
    now,
    idFactory,
    todayStr,
    nowIso,
    logEvent,
  });
  if (reserveEntry) {
    propagations.push(reserveEntry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'portfolio',
        entityId: reserveEntry.targetId,
        summary: `[RULE-CAP-01] ${reserveEntry.summary}`,
      });
    }
  }

  // 7. RULE-CAP-02: if the plan is now infeasible, open the trade-off decision
  const tradeoff = evaluateCapacityTradeoff(draft, { now, idFactory, todayStr, nowIso, logEvent });
  if (tradeoff) propagations.push(tradeoff);

  return propagations;
}

/**
 * Propagate resolution telemetry when an Operational Case is resolved/closed.
 */
export function propagateCaseResolution(draft, caseRecord, { now = new Date(), idFactory, logEvent = null } = {}) {
  const propagations = [];
  if (!draft || !caseRecord || caseRecord.autoPropagate === false) return propagations;
  const todayStr = dayKey(now);

  // RULE-CAP-01: returning diverted capacity to the plan is the whole point of
  // closing a case; leaving the reserve in place would silently shrink the
  // team's apparent capacity forever.
  const reserve = findCapacityReserve(draft, caseRecord.id);
  if (reserve && reserve.status === 'open') {
    const releasedOn = caseRecord.resolvedOn || todayStr;
    reserve.status = 'released';
    reserve.releasedOn = releasedOn;
    reserve.updatedAt = now.toISOString();
    const entry = {
      ruleId: 'RULE-CAP-01',
      targetType: 'portfolio',
      targetId: reserve.id,
      action: 'released',
      summary: `Released the ${reserve.effortDays?.mostLikely ?? 0} person-day capacity reserve back to the plan`,
    };
    propagations.push(entry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'portfolio',
        entityId: reserve.id,
        summary: `[RULE-CAP-01] ${entry.summary}`,
      });
    }
  }

  if (caseRecord.linkedGoalId) {
    const goal = (draft.goals || []).find((g) => g.id === caseRecord.linkedGoalId && g.status === 'active');
    if (goal) {
      const resolvedTag = `[Case ${caseRecord.id} resolved]`;
      const alreadyNoted = (goal.checkins || []).some((chk) => String(chk.note || '').includes(resolvedTag));
      if (!alreadyNoted) {
        goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
        goal.checkins.push({
          id: idFactory('chk'),
          date: caseRecord.resolvedOn || todayStr,
          confidence: goal.confidence,
          progressPct: null,
          keyResults: null,
          note: `${resolvedTag} Operational case “${caseRecord.title.slice(0, 60)}” resolved — review whether goal confidence can return to On track.`,
        });
        const entry = {
          ruleId: 'RULE-GOAL-01',
          targetType: 'goal',
          targetId: goal.id,
          action: 'updated',
          summary: `Logged case resolution check-in on goal “${goal.title.slice(0, 50)}”`,
        };
        propagations.push(entry);
        if (logEvent) {
          logEvent({
            type: 'automation.propagated',
            entity: 'goal',
            entityId: goal.id,
            summary: `[RULE-GOAL-01] ${entry.summary}`,
          });
        }
      }
    }
  }

  return propagations;
}

/**
 * Closed-loop feedback when a mitigation delegation is completed: if all
 * mitigation delegations linked to an open/mitigating Case are now done,
 * advance the Case to `monitoring` for residual FMEA verification.
 */
export function onDelegationCompleted(draft, delegationId, { now = new Date(), idFactory, logEvent = null } = {}) {
  const propagations = [];
  if (!draft || !Array.isArray(draft.links)) return propagations;

  // RULE-CAP-04: a delegation-linked plan item is an explicit statement that
  // this delegated outcome is the planned work. Its verified completion closes
  // that same item; it does not infer effort or affect unrelated work. Keep the
  // graph edge and date so WIP/throughput history remains traceable.
  const delegation = (draft.delegations || []).find((d) => d.id === delegationId);
  if (delegation?.status === 'done') {
    const completedOn = delegation.completedOn || dayKey(now);
    for (const item of draft.portfolio || []) {
      if (
        item?.status !== 'open' ||
        item.sourceType !== 'delegation' ||
        item.sourceId !== delegationId
      ) continue;

      item.status = 'done';
      item.completedOn = completedOn;
      item.updatedAt = now.toISOString();
      ensureEntityLink(
        draft,
        {
          sourceType: 'portfolio',
          sourceId: item.id,
          targetType: 'delegation',
          targetId: delegationId,
          relation: 'funds',
          ruleId: 'RULE-CAP-04',
          summary: `Delegation completion delivered “${item.title.slice(0, 60)}”`,
        },
        { idFactory: idFactory || ((prefix) => `${prefix}-${item.id}-${delegationId}`), todayStr: dayKey(now), nowIso: now.toISOString() },
      );
      const entry = {
        ruleId: 'RULE-CAP-04',
        targetType: 'portfolio',
        targetId: item.id,
        action: 'completed',
        summary: `Marked linked plan item “${item.title.slice(0, 60)}” delivered from delegation completion`,
      };
      propagations.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'portfolio',
          entityId: item.id,
          summary: `[RULE-CAP-04] ${entry.summary}`,
        });
      }
    }
  }

  if (!Array.isArray(draft.cases)) return propagations;
  const caseIds = [
    ...new Set(
      draft.links
        .filter((l) => l && l.sourceType === 'case' && l.targetType === 'delegation' && l.targetId === delegationId && l.relation === 'mitigates')
        .map((l) => l.sourceId),
    ),
  ];

  for (const caseId of caseIds) {
    const caseRecord = draft.cases.find((c) => c.id === caseId);
    if (!caseRecord || !['open', 'mitigating'].includes(caseRecord.status)) continue;

    const allMitigationIds = draft.links
      .filter((l) => l && l.sourceType === 'case' && l.sourceId === caseId && l.targetType === 'delegation' && l.relation === 'mitigates')
      .map((l) => l.targetId);

    const allDone =
      allMitigationIds.length > 0 &&
      allMitigationIds.every((delId) => {
        const del = (draft.delegations || []).find((d) => d.id === delId);
        return del && del.status === 'done';
      });

    if (allDone) {
      caseRecord.status = 'monitoring';
      caseRecord.updatedAt = now.toISOString();
      const entry = {
        ruleId: 'RULE-SYNC-DEL-01',
        targetType: 'case',
        targetId: caseRecord.id,
        action: 'status-monitoring',
        summary: `Mitigation completed — case “${caseRecord.title.slice(0, 60)}” moved to Monitoring`,
      };
      propagations.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'case',
          entityId: caseRecord.id,
          summary: `[RULE-SYNC-DEL-01] ${entry.summary}`,
        });
      }
    }
  }

  return propagations;
}

/**
 * RULE-CAP-03 — a funding decision is never detached from the objective it
 * starves. Deferring or cutting capacity for goal-backed work writes an
 * explainable check-in on that goal; restoring the funding writes the
 * follow-up. Idempotent per decision state.
 */
export function propagatePortfolioDecision(
  draft,
  item,
  { now = new Date(), idFactory, logEvent = null, previousDecision = null } = {},
) {
  const propagations = [];
  if (!draft || !item) return propagations;
  if (item.status !== 'open') return propagations;
  if (!['funded', 'deferred', 'cut'].includes(item.decision)) return propagations;
  // Funding work that was never funded before is not a change of plan, so it
  // writes no goal note. Re-funding work that was deferred or cut is.
  if (item.decision === 'funded' && !['deferred', 'cut'].includes(previousDecision)) return propagations;

  let goal = item.sourceType === 'goal' && item.sourceId
    ? (draft.goals || []).find((g) => g.id === item.sourceId)
    : null;
  if (!goal) {
    const link = (draft.links || []).find(
      (l) => l && l.ruleId !== 'RULE-CAP-02' &&
        ((l.sourceType === 'portfolio' && l.sourceId === item.id && l.targetType === 'goal') ||
          (l.targetType === 'portfolio' && l.targetId === item.id && l.sourceType === 'goal')),
    );
    if (link) {
      const goalId = link.sourceType === 'goal' ? link.sourceId : link.targetId;
      goal = (draft.goals || []).find((g) => g.id === goalId) || null;
    }
  }
  if (!goal) return propagations;

  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const tag = `[Portfolio ${item.id} ${item.decision}]`;
  goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
  const already = goal.checkins.some((chk) => String(chk?.note || '').includes(tag));
  if (already) return propagations;

  ensureEntityLink(
    draft,
    {
      sourceType: 'portfolio',
      sourceId: item.id,
      targetType: 'goal',
      targetId: goal.id,
      relation: 'impacts-goal',
      ruleId: 'RULE-CAP-03',
      summary: `${item.decision === 'funded' ? 'Funds' : 'Removes'} capacity for “${goal.title.slice(0, 60)}”`,
    },
    { idFactory, todayStr, nowIso },
  );

  const days = item.effortDays?.mostLikely ?? 0;
  const isLoss = item.decision !== 'funded';
  const wasOnTrack = goal.confidence === 'on-track';
  if (isLoss && wasOnTrack) goal.confidence = 'at-risk';
  const note = isLoss
    ? `${tag} Capacity decision: “${item.title.slice(0, 70)}” was ${item.decision} (${days} person-day(s) freed). Review whether the key result is still achievable inside the current plan.`
    : `${tag} Capacity decision: “${item.title.slice(0, 70)}” is funded again (${days} person-day(s) committed). Re-check the delivery date before promising it.`;
  goal.checkins.push({
    id: idFactory('chk'),
    date: todayStr,
    confidence: goal.confidence,
    progressPct: null,
    keyResults: null,
    note,
  });

  const entry = {
    ruleId: 'RULE-CAP-03',
    targetType: 'goal',
    targetId: goal.id,
    action: 'updated',
    summary: `Logged “${item.title.slice(0, 50)}” ${item.decision} on goal “${goal.title.slice(0, 50)}”`,
  };
  propagations.push(entry);
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'goal',
      entityId: goal.id,
      summary: `[RULE-CAP-03] ${entry.summary}`,
    });
  }
  return propagations;
}

/**
 * Construct an Operational Case payload from an upstream Delegation, Goal, or
 * Decision so `escalateToCase` can link it (`escalates-from`) and fan out
 * across the rest of LeadOS.
 */
export function buildCaseFromUpstreamEntity(state, { sourceType, sourceId, overrides = {}, now = new Date() } = {}) {
  const todayStr = dayKey(now);
  const reviewDefault = addDaysKey(todayStr, 14, now);

  if (sourceType === 'delegation') {
    const del = (state.delegations || []).find((d) => d.id === sourceId);
    if (!del) return { ok: false, error: 'That delegation no longer exists.' };
    const latestCheckin = (del.checkins || []).at(-1);
    return {
      ok: true,
      payload: {
        kind: 'escalation',
        status: 'open',
        title: overrides.title || `Unblock delegated outcome: ${del.title}`.slice(0, 160),
        summary:
          overrides.summary ||
          `Escalated from delegation “${del.title}”. Expected outcome: ${del.expectedOutcome}${latestCheckin?.note ? ` Latest check-in (${latestCheckin.progress}): ${latestCheckin.note}` : ''}`,
        ownerId: overrides.ownerId !== undefined ? overrides.ownerId : del.personId,
        involvedPersonIds: overrides.involvedPersonIds || [del.personId].filter(Boolean),
        linkedGoalId: overrides.linkedGoalId || null,
        openedOn: overrides.openedOn || todayStr,
        reviewOn: overrides.reviewOn || del.dueOn || reviewDefault,
        fmea: {
          severity: 7,
          probability: 6,
          detectability: 5,
          failureMode: `Delegated outcome “${del.title}” stalls or misses commitment`,
          effect: del.expectedOutcome || 'Downstream delivery delay',
          controls: del.support || '',
          ...(overrides.fmea || {}),
        },
        financial: overrides.financial || {},
        rca: {
          problemStatement: latestCheckin?.note || `Blocked / overdue execution on “${del.title}”`,
          whys: overrides.rca?.whys || [],
          rootCause: overrides.rca?.rootCause || '',
          systemicBarrier: overrides.rca?.systemicBarrier || '',
          preventiveAction: overrides.rca?.preventiveAction || '',
        },
        stakeholders: overrides.stakeholders || [],
        autoPropagate: overrides.autoPropagate !== false,
      },
    };
  }

  if (sourceType === 'goal') {
    const goal = (state.goals || []).find((g) => g.id === sourceId);
    if (!goal) return { ok: false, error: 'That goal no longer exists.' };
    const latestCheckin = (goal.checkins || []).at(-1);
    return {
      ok: true,
      payload: {
        kind: 'risk',
        status: 'open',
        title: overrides.title || `Goal delivery risk: ${goal.title}`.slice(0, 160),
        summary:
          overrides.summary ||
          `Escalated from ${goal.confidence || 'active'} goal “${goal.title}”.${goal.description ? ` ${goal.description}` : ''}${latestCheckin?.note ? ` Latest check-in: ${latestCheckin.note}` : ''}`,
        ownerId: overrides.ownerId !== undefined ? overrides.ownerId : goal.ownerId || null,
        involvedPersonIds: overrides.involvedPersonIds || (goal.ownerId ? [goal.ownerId] : []),
        linkedGoalId: goal.id,
        openedOn: overrides.openedOn || todayStr,
        reviewOn: overrides.reviewOn || reviewDefault,
        fmea: {
          severity: goal.confidence === 'off-track' ? 8 : 7,
          probability: goal.confidence === 'off-track' ? 7 : 5,
          detectability: 5,
          failureMode: `Key results on “${goal.title}” miss target window`,
          effect: 'Strategic objective slips without explicit scope or capacity trade-off',
          controls: 'OKR check-in cadence',
          ...(overrides.fmea || {}),
        },
        financial: overrides.financial || {},
        rca: {
          problemStatement: latestCheckin?.note || `Goal “${goal.title}” is ${goal.confidence}`,
          whys: overrides.rca?.whys || [],
          rootCause: overrides.rca?.rootCause || '',
          systemicBarrier: overrides.rca?.systemicBarrier || '',
          preventiveAction: overrides.rca?.preventiveAction || '',
        },
        stakeholders: overrides.stakeholders || [],
        autoPropagate: overrides.autoPropagate !== false,
      },
    };
  }

  if (sourceType === 'decision') {
    const dec = (state.decisions || []).find((d) => d.id === sourceId);
    if (!dec) return { ok: false, error: 'That decision no longer exists.' };
    const isAdverse = dec.outcome === 'bad' || dec.outcome === 'mixed';
    const matchedDriver = dec.driver
      ? (state.people || []).find((p) => p.name.trim().toLowerCase() === dec.driver.trim().toLowerCase())
      : null;
    const contributorNames = typeof dec.contributors === 'string'
      ? dec.contributors.split(',').map((s) => s.trim()).filter(Boolean)
      : Array.isArray(dec.contributors) ? dec.contributors : [];
    return {
      ok: true,
      payload: {
        kind: isAdverse ? 'incident' : 'initiative',
        status: 'open',
        title: overrides.title || `${isAdverse ? 'Corrective case' : 'Execution case'}: ${dec.title}`.slice(0, 160),
        summary:
          overrides.summary ||
          `Escalated from decision “${dec.title}”${dec.chosen ? ` (chosen: ${dec.chosen})` : ''}.${dec.outcomeNotes ? ` Review notes: ${dec.outcomeNotes}` : dec.question ? ` ${dec.question}` : ''}`,
        ownerId: overrides.ownerId !== undefined ? overrides.ownerId : matchedDriver?.id || null,
        involvedPersonIds: overrides.involvedPersonIds || (matchedDriver ? [matchedDriver.id] : []),
        linkedGoalId: overrides.linkedGoalId || null,
        openedOn: overrides.openedOn || todayStr,
        reviewOn: overrides.reviewOn || reviewDefault,
        fmea: {
          severity: dec.reversibility === 'irreversible' || dec.outcome === 'bad' ? 8 : 6,
          probability: isAdverse ? 7 : 5,
          detectability: 5,
          failureMode: isAdverse
            ? `Adverse decision outcome on “${dec.title}” continues unmitigated`
            : `Execution risk on decision “${dec.title}”`,
          effect: dec.outcomeNotes || dec.question || '',
          controls: dec.rationale || '',
          ...(overrides.fmea || {}),
        },
        financial: overrides.financial || {},
        rca: {
          problemStatement: dec.outcomeNotes || dec.question || dec.title,
          whys: overrides.rca?.whys || [],
          rootCause: overrides.rca?.rootCause || '',
          systemicBarrier: overrides.rca?.systemicBarrier || '',
          preventiveAction: overrides.rca?.preventiveAction || '',
        },
        stakeholders:
          overrides.stakeholders ||
          [
            ...(dec.approver ? [{ name: dec.approver, role: 'Approver (DACI)', power: 5, interest: 4, stance: 'neutral' }] : []),
            ...contributorNames.slice(0, 3).map((name) => ({ name, role: 'Contributor (DACI)', power: 3, interest: 4, stance: 'supportive' })),
          ],
        autoPropagate: overrides.autoPropagate !== false,
      },
    };
  }

  if (sourceType === 'requisition') {
    const req = (state.requisitions || []).find((r) => r.id === sourceId);
    if (!req) return { ok: false, error: 'That requisition no longer exists.' };
    const reqCandidates = (state.candidates || []).filter((c) => c.reqId === req.id);
    const funnel = funnelStats(req, reqCandidates, { now });
    const vacancyLine = funnel.vacancy.measured
      ? ` Recorded vacancy exposure: ${funnel.vacancy.currency} ${funnel.vacancy.cost.toLocaleString('en-US')} over ${funnel.vacancy.days} day(s).`
      : ' No cost of vacancy has been recorded, so exposure is unmeasured.';
    return {
      ok: true,
      payload: {
        kind: 'risk',
        status: 'open',
        title: overrides.title || `Stalled hire: ${req.title}`.slice(0, 160),
        summary:
          overrides.summary ||
          `Requisition “${req.title}” is ${req.status} and has not moved in ${funnel.daysSinceActivity} day(s) against a ${funnel.stallDays}-day window, ${funnel.daysOpen} day(s) after it opened.${vacancyLine} ${funnel.active} candidate(s) still active.`,
        ownerId: overrides.ownerId !== undefined ? overrides.ownerId : null,
        involvedPersonIds: overrides.involvedPersonIds || (req.interviewers || []).slice(0, 6),
        linkedGoalId: overrides.linkedGoalId || null,
        openedOn: overrides.openedOn || todayStr,
        reviewOn: overrides.reviewOn || reviewDefault,
        fmea: {
          severity: 6,
          probability: 8,
          detectability: 4,
          failureMode: `Seat “${req.title}” stays empty past plan`,
          effect: 'Delivered scope is carried by the existing team, which converts a hiring delay into overload and attrition risk',
          controls: `${req.competencies?.length || 0} defined competencies; ${funnel.active} active candidate(s)`,
          ...(overrides.fmea || {}),
        },
        financial: overrides.financial || {},
        rca: {
          problemStatement: `No candidate progression for ${funnel.daysSinceActivity} day(s) on ${req.title}.${funnel.cycleMedianDays !== null ? ` Observed cycle time: ${funnel.cycleMedianDays} day(s).` : ''}`,
          whys: overrides.rca?.whys || [],
          rootCause: overrides.rca?.rootCause || '',
          systemicBarrier: overrides.rca?.systemicBarrier || '',
          preventiveAction: overrides.rca?.preventiveAction || '',
        },
        stakeholders: overrides.stakeholders || [],
        autoPropagate: overrides.autoPropagate !== false,
      },
    };
  }

  return { ok: false, error: 'Unsupported escalation source type.' };
}

/* ------------------------------------------------------------------ */
/* Selection & hiring (Schema v17)                                     */
/* ------------------------------------------------------------------ */

const ZERO_TRIPLE = { optimistic: 0, mostLikely: 0, pessimistic: 0 };

function effortEqual(a, b) {
  return (
    Math.abs((a?.optimistic || 0) - (b?.optimistic || 0)) < 0.005 &&
    Math.abs((a?.mostLikely || 0) - (b?.mostLikely || 0)) < 0.005 &&
    Math.abs((a?.pessimistic || 0) - (b?.pessimistic || 0)) < 0.005
  );
}

function hiringItemTitle(requisition) {
  return `Hiring: ${requisition.title}`.slice(0, 200);
}

/**
 * RULE-HIRE-01 — keep the interviewer-effort reserve in step with the opening.
 *
 * Idempotent: repeated calls refresh the existing item instead of adding a
 * second one. A role with no recorded estimate reserves nothing, and the item
 * is completed (not deleted) when the seat is filled, so the effort appears in
 * the delivered-throughput data the flow metrics use.
 */
export function syncRequisitionCapacity(draft, requisition, { idFactory, todayStr, nowIso, logEvent = null } = {}) {
  if (!draft || !requisition) return null;
  draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const existing = draft.portfolio.find(
    (p) => p && p.sourceType === 'requisition' && p.sourceId === requisition.id,
  ) || null;
  const effort = measurableEffort(requisition.effortDays);
  const active = ACTIVE_REQUISITION_STATUSES.includes(requisition.status);
  let change = null;

  const linkToItem = (item, summary) => ensureEntityLink(
    draft,
    {
      sourceType: 'requisition',
      sourceId: requisition.id,
      targetType: 'portfolio',
      targetId: item.id,
      relation: 'consumes-capacity',
      ruleId: 'RULE-HIRE-01',
      summary,
    },
    { idFactory, todayStr, nowIso },
  );

  if (active && effort) {
    if (!existing) {
      const item = {
        id: idFactory('pf'),
        title: hiringItemTitle(requisition),
        kind: 'hiring',
        status: 'open',
        sourceType: 'requisition',
        sourceId: requisition.id,
        ownerId: null,
        effortDays: { ...effort },
        // Hiring consumes capacity; it does not produce measured value. Leaving
        // value unmeasured keeps it out of the funding boundary rather than
        // pretending a requisition has a revenue estimate.
        value: { ...ZERO_TRIPLE },
        currency: requisition.currency || 'USD',
        decision: 'funded',
        decisionOn: requisition.openedOn && requisition.openedOn <= todayStr ? requisition.openedOn : todayStr,
        rationale: 'Interview effort committed by an open requisition (RULE-HIRE-01). Value is unmeasured: hiring consumes capacity rather than producing measurable revenue.',
        targetOn: requisition.targetStartOn || null,
        createdOn: todayStr,
        completedOn: null,
        releasedOn: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      draft.portfolio.push(item);
      linkToItem(item, `Interview effort for ${requisition.title}`);
      change = { ruleId: 'RULE-HIRE-01', action: 'created', itemId: item.id, title: item.title };
    } else {
      const reopening = existing.status === 'released';
      const needsEffort = !effortEqual(existing.effortDays, effort);
      const needsTarget = (existing.targetOn || null) !== (requisition.targetStartOn || null);
      const needsTitle = existing.title !== hiringItemTitle(requisition);
      if (reopening) {
        existing.status = 'open';
        existing.releasedOn = null;
        existing.completedOn = null;
        existing.decision = 'funded';
        existing.rationale = `${existing.rationale ? `${existing.rationale} · ` : ''}Reinstated when the role reopened (RULE-HIRE-01).`.slice(0, 1000);
        change = { ruleId: 'RULE-HIRE-01', action: 'reinstated', itemId: existing.id, title: existing.title };
      }
      if (needsEffort) existing.effortDays = { ...effort };
      if (needsTarget) existing.targetOn = requisition.targetStartOn || null;
      if (needsTitle) existing.title = hiringItemTitle(requisition);
      if (reopening || needsEffort || needsTarget || needsTitle) existing.updatedAt = nowIso;
      if (!change && (needsEffort || needsTarget)) {
        change = { ruleId: 'RULE-HIRE-01', action: 'refreshed', itemId: existing.id, title: existing.title };
      }
      linkToItem(existing, `Interview effort for ${requisition.title}`);
    }
  } else if (existing && existing.status === 'open') {
    if (requisition.status === 'filled') {
      existing.status = 'done';
      existing.completedOn = requisition.closedOn && requisition.closedOn <= todayStr ? requisition.closedOn : todayStr;
      existing.releasedOn = null;
      existing.rationale = `${existing.rationale ? `${existing.rationale} · ` : ''}Delivered when the seat was filled (RULE-HIRE-01).`.slice(0, 1000);
      change = { ruleId: 'RULE-HIRE-01', action: 'completed', itemId: existing.id, title: existing.title };
    } else {
      existing.status = 'released';
      existing.releasedOn = requisition.closedOn && requisition.closedOn <= todayStr ? requisition.closedOn : todayStr;
      const why = !active
        ? `role ${requisition.status}`
        : 'effort estimate removed';
      existing.rationale = `${existing.rationale ? `${existing.rationale} · ` : ''}Released ${existing.releasedOn}: ${why} (RULE-HIRE-01).`.slice(0, 1000);
      change = { ruleId: 'RULE-HIRE-01', action: 'released', itemId: existing.id, title: existing.title };
    }
    existing.updatedAt = nowIso;
  }

  if (change && logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'requisition',
      entityId: requisition.id,
      summary: `RULE-HIRE-01 ${change.action} interview-effort reserve for “${requisition.title}”: ${change.action === 'released' ? 'capacity released' : change.action === 'completed' ? 'delivered, capacity freed' : 'capacity committed'}`,
    });
  }
  return change;
}

/**
 * RULE-HIRE-02 — an accepted offer closes the loop into people and onboarding.
 *
 * The roster record and its 30-60-90 plan are created by the action that
 * records the acceptance (where name and start-date validation belongs). This
 * rule then guarantees the typed links exist, completes the requisition's
 * capacity reserve as delivered, and writes the audit trail.
 */
export function onCandidateHired(draft, candidateId, { idFactory, todayStr, nowIso, logEvent = null } = {}) {
  if (!draft) return [];
  const candidate = (draft.candidates || []).find((c) => c.id === candidateId);
  if (!candidate || candidate.stage !== 'hired') return [];
  const requisition = (draft.requisitions || []).find((r) => r.id === candidate.reqId);
  if (!requisition) return [];
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
  const entries = [];

  const add = (spec) => {
    const res = ensureEntityLink(draft, { ...spec, ruleId: 'RULE-HIRE-02' }, { idFactory, todayStr, nowIso });
    if (res.created) entries.push({ ruleId: 'RULE-HIRE-02', ...spec });
  };

  add({
    sourceType: 'candidate',
    sourceId: candidate.id,
    targetType: 'requisition',
    targetId: requisition.id,
    relation: 'assessed-for',
    summary: `${candidate.name} assessed for ${requisition.title}`,
  });

  if (candidate.personId) {
    add({
      sourceType: 'requisition',
      sourceId: requisition.id,
      targetType: 'person',
      targetId: candidate.personId,
      relation: 'hires',
      summary: `${requisition.title} → ${candidate.name}`,
    });
    const plans = (draft.onboarding || []).filter(
      (p) => p && p.personId === candidate.personId && p.kind === 'new-hire',
    );
    const plan = candidate.startOn
      ? plans.find((p) => p.startDate === candidate.startOn)
      : plans.sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0];
    if (plan) {
      add({
        sourceType: 'person',
        sourceId: candidate.personId,
        targetType: 'onboarding',
        targetId: plan.id,
        relation: 'onboards',
        summary: `First 90 days for ${candidate.name}`,
      });
    }
  }

  let capacityChange = null;
  const item = draft.portfolio.find(
    (p) => p && p.sourceType === 'requisition' && p.sourceId === requisition.id && p.status === 'open',
  );
  if (item) {
    item.status = 'done';
    item.completedOn = candidate.hiredOn || requisition.closedOn || todayStr;
    item.releasedOn = null;
    item.updatedAt = nowIso;
    item.rationale = `${item.rationale ? `${item.rationale} · ` : ''}Delivered ${item.completedOn}: offer accepted (RULE-HIRE-02).`.slice(0, 1000);
    capacityChange = { action: 'completed', itemId: item.id };
  }

  if (logEvent && (entries.length || capacityChange)) {
    logEvent({
      type: 'automation.propagated',
      entity: 'candidate',
      entityId: candidate.id,
      summary: `RULE-HIRE-02 linked ${candidate.name} to ${requisition.title}${candidate.personId ? ', the roster and the 30-60-90 plan' : ''}${capacityChange ? ', and freed the interview reserve' : ''}`,
    });
  }
  return [...entries, ...(capacityChange ? [{ ruleId: 'RULE-HIRE-02', ...capacityChange }] : [])];
}

/**
 * Text preview of what opening or editing a requisition will do, used by the
 * dialog before anything is saved.
 */
export function previewHiringPropagations(requisitionInput = {}, state = {}) {
  const out = [];
  const effort = measurableEffort(requisitionInput.effortDays);
  const active = ACTIVE_REQUISITION_STATUSES.includes(requisitionInput.status || 'open');
  if (active && effort) {
    out.push(`Reserve ${effort.mostLikely} person-day(s) (PERT ${effort.optimistic}/${effort.mostLikely}/${effort.pessimistic}) of interviewer effort in the capacity plan.`);
  } else if (active) {
    out.push('No effort estimate recorded yet, so no capacity will be reserved. The plan will not guess one.');
  }
  const candidates = (state.candidates || []).filter((c) => c.requisitionId === requisitionInput.id);
  if (candidates.length) out.push(`${candidates.length} candidate record(s) stay attached; evidence and decisions are kept.`);
  if (requisitionInput.status === 'filled') out.push('Completing the role marks the interview reserve delivered and frees the capacity.');
  if (requisitionInput.status === 'cancelled' || requisitionInput.status === 'on-hold') out.push('Releasing the role returns its reserved capacity to the plan.');
  return out;
}
