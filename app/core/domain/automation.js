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
import {
  COMMITTED_CHANGE_STATUSES,
  OPEN_CHANGE_STATUSES,
  evaluateForceField,
  evaluateGuidingCoalition,
  evaluateStarAlignment,
  evaluateTopologyAndLoad,
  isChangeCommitted,
  isChangeOpen,
  pertStats,
} from './changes.js';
import { simulatePortfolio } from './simulation.js';
import {
  OPTIMISM_RATIO_THRESHOLD,
  buildCaseForecastSnapshot,
  buildForecastSnapshot,
  caseCostCalibration,
  estimateCalibration,
} from './calibration.js';

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
    id: 'RULE-CAP-05',
    name: 'Probabilistic tail-risk goal & trade-off propagation',
    framework: 'Beta-PERT Monte Carlo (Malcolm et al., 1959) & Flaw of Averages (Savage, 2009)',
    trigger: 'portfolio.created / portfolio.updated / portfolio.decided / capacity.synced',
    targetModule: 'goals / decisions',
    description: 'Evaluates seeded Beta-PERT Monte Carlo trials: shifts linked active goals to at-risk when joint on-time target confidence drops below 35%, and opens one DACI tail-risk decision when right-skewed PERT variance pushes horizon overload odds ≥ 50% despite a feasible point-estimate mean.',
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
  {
    id: 'RULE-CHG-01',
    name: 'Change transition capacity reserve',
    framework: 'J-Curve Transition Economics (Satir, 1991) & Capacity Planning (Little, 1961)',
    trigger: 'change.created / change.updated / change.statusChanged',
    targetModule: 'portfolio',
    description: 'Registers the person-days an active or stabilising organizational change consumes as a committed capacity reserve, completes it when anchored, and releases it if paused or abandoned.',
  },
  {
    id: 'RULE-CHG-02',
    name: 'Structural change DACI governance',
    framework: 'Intuit DACI & Porter (1996) Strategic Trade-Offs',
    trigger: 'change.created / change.updated',
    targetModule: 'decisions',
    description: 'Creates and links an explicit DACI decision record with non-goals, PERT effort, and review horizon for structural/irreversible team changes.',
  },
  {
    id: 'RULE-CHG-03',
    name: 'Role-transition 30-60-90 & 1:1 support scaffolding',
    framework: 'Watkins (2003) Role Transitions & Edmondson (1999) Psychological Safety',
    trigger: 'change.created / change.updated / change.statusChanged',
    targetModule: 'onboarding / people',
    description: 'Queues blameless 1:1 role-clarity/load check-ins for impacted people and creates linked 30-60-90 role-transition plans when opted in — automatically feeding transition ramps into team capacity.',
  },
  {
    id: 'RULE-CHG-04',
    name: 'Guiding coalition & veto-player briefing cadence',
    framework: 'Kotter (1996) Guiding Coalition & Tsebelis (2002) Veto Players',
    trigger: 'change.created / change.updated',
    targetModule: 'changes.coalition',
    description: 'Schedules briefing checkpoints for Mendelow key players and veto gatekeepers lacking a next briefing date.',
  },
  {
    id: 'RULE-CHG-05',
    name: 'Change blocker → goal risk & anchoring telemetry',
    framework: 'Lewin (1951) Force-Field Equilibrium & OKR Telemetry (Doerr, 2018)',
    trigger: 'change.created / change.updated / change.anchored',
    targetModule: 'goals / decisions',
    description: 'Links strategic goals, flags goals at-risk when an active change hits a force-field stalemate or opposing veto player, and records verified anchoring updates.',
  },
  {
    id: 'RULE-SCN-01',
    name: 'Scenario trade-off commitment & governance propagation',
    framework: 'Scenario Planning (Schoemaker, 1995), Double-Loop Learning (Argyris & Schön, 1978) & DACI Governance',
    trigger: 'scenario.decided / scenario.committed',
    targetModule: 'decisions / portfolio / cases / changes / settings / goals',
    description: 'Links recorded What-If scenario DACI decisions to every governed portfolio commitment, operational case, org change, and requisition via typed graph edges, and — when levers are committed — atomically executes portfolio deferrals/reassignments, case reserve releases, change barrier/status updates, and downstream RULE-CAP-01/03/05 & RULE-CHG-01..05 cascades.',
  },
  {
    id: 'RULE-FCT-01',
    name: 'Funding-time forecast freeze',
    framework: 'Superforecasting & Forecast Scoring (Tetlock & Gardner, 2015) — score the forecast that was made',
    trigger: 'portfolio.created / portfolio.decided',
    targetModule: 'portfolio',
    description: 'When planned work is funded, freezes the PERT effort distribution, expected value and target date into an immutable forecastSnapshot so delivery actuals are scored against what was believed at commitment — later estimate edits cannot rewrite history. Cleared if the item is un-funded, so a later re-funding freezes the new commitment honestly.',
  },
  {
    id: 'RULE-FCT-02',
    name: 'Systematic-optimism governance decision',
    framework: 'Planning Fallacy (Kahneman & Tversky, 1979) & Reference-Class Forecasting (Flyvbjerg, 2006)',
    trigger: 'portfolio.completed / portfolio.actuals',
    targetModule: 'decisions',
    description: 'When at least 5 delivered items have recorded actuals and the median actual/estimate ratio reaches 1.25×, opens one DACI decision with reference-class uplift options (median and P80 ratio uplifts, estimation-practice investigation, or explicit acceptance), linked to the worst overrun. Idempotent while that decision awaits its outcome review.',
  },
  {
    id: 'RULE-FCT-03',
    name: 'Opening case-forecast freeze',
    framework: 'FAIR Quantitative Risk (Freund & Jones, 2015) & Score-the-Forecast-Made (Tetlock, 2005)',
    trigger: 'case.created / case.updated',
    targetModule: 'cases',
    description: 'When an open operational case first carries a measured PERT exposure, diverted-capacity estimate or planned mitigation spend, freezes those opening beliefs (exposure distribution, capacity days, mitigation cost, pre-mitigation FMEA probability) into an immutable forecastSnapshot so settled actuals at resolution are scored against the numbers that drove the escalate/mitigate decision. Later estimate refinement stays legitimate case work; it cannot rewrite the opening call.',
  },
  {
    id: 'RULE-FCT-04',
    name: 'Case-cost under-reserving governance decision',
    framework: 'Actuarial Loss Development & Case-Reserve Adequacy; Reference-Class Forecasting (Flyvbjerg, 2006)',
    trigger: 'case.resolved / case.actuals',
    targetModule: 'decisions',
    description: 'When at least 5 materialised cases have settled actuals and the median realised/assessed exposure ratio reaches 1.25×, opens one DACI decision with reference-class contingency uplifts (median development factor on new case exposures, P80 reserving for High-priority cases, exposure-assessment practice investigation, or explicit self-insured acceptance), linked to the worst under-estimated case. Idempotent while that decision awaits its outcome review.',
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
    if (!link || (link.ruleId !== 'RULE-CAP-02' && link.ruleId !== 'RULE-CAP-05')) continue;
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
 * RULE-CAP-05 — Probabilistic tail-risk goal & trade-off propagation.
 *
 * Deterministic point estimates hide right-skewed Beta-PERT schedule risk (Sam
 * Savage's Flaw of Averages). Using the workspace's deterministic seed:
 *  1. Linked active Goals whose funded portfolio commitment falls below 35%
 *     joint Monte Carlo on-time confidence receive an idempotent `[RULE-CAP-05]`
 *     check-in and shift from `on-track` to `at-risk`.
 *  2. When point-estimate utilisation <= 100% (`RULE-CAP-02` silent) yet Monte
 *     Carlo horizon overload probability >= 50% (`flawOfAveragesTrap` — worse
 *     than a coin flip of fitting inside the horizon), opens one DACI tail-risk
 *     trade-off decision ranked by value density and variance sensitivity.
 */
export function evaluateMonteCarloTailRisk(
  draft,
  { now, idFactory, todayStr, nowIso, logEvent, triggerLabel = 'portfolio' } = {},
) {
  if (!draft) return [];
  const model = buildCapacityModel(draft, { now });
  if (!model.hasTeam || model.utilisation === null) return [];
  const trials = Math.min(draft.settings?.simulationTrials ?? 1000, 1000);
  const sim = simulatePortfolio(draft, { now, trials });
  if (!sim.available) return [];

  const entries = [];
  draft.goals = Array.isArray(draft.goals) ? draft.goals : [];

  // 1. Goal-linked schedule tail risk (< 35% joint Monte Carlo on-time probability)
  for (const t of sim.targetRisks) {
    if (t.sourceType !== 'goal' || !t.sourceId) continue;
    if (t.mcProbability === null || t.mcProbability >= 0.35) continue;
    const goal = draft.goals.find((g) => g && g.id === t.sourceId && g.status !== 'done' && g.status !== 'archived');
    if (!goal) continue;

    ensureEntityLink(
      draft,
      {
        sourceType: 'portfolio',
        sourceId: t.id,
        targetType: 'goal',
        targetId: goal.id,
        relation: 'impacts-goal',
        ruleId: 'RULE-CAP-05',
        summary: `Monte Carlo on-time confidence ${Math.round(t.mcProbability * 100)}% for ${t.targetOn}`,
      },
      { idFactory, todayStr, nowIso },
    );

    goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
    const marker = `[RULE-CAP-05:${t.id}]`;
    const alreadyLogged = goal.checkins.some((chk) => typeof chk?.note === 'string' && chk.note.includes(marker));
    if (!alreadyLogged) {
      const nextConfidence = goal.confidence === 'off-track' ? 'off-track' : 'at-risk';
      goal.confidence = nextConfidence;
      const pctChance = Math.round(t.mcProbability * 100);
      goal.checkins.push({
        id: idFactory('chk'),
        date: todayStr,
        confidence: nextConfidence,
        progressPct: null,
        keyResults: null,
        note: `${marker} Seeded Monte Carlo (${sim.trials} trials, seed ${sim.seed}): funded work “${t.title.slice(0, 80)}” has only ${pctChance}% joint probability of meeting ${t.targetOn} (P80 completion ${t.mcP80Date || 'beyond horizon'}).`,
      });
      const entry = {
        ruleId: 'RULE-CAP-05',
        targetType: 'goal',
        targetId: goal.id,
        action: 'updated',
        summary: `Flagged goal “${goal.title.slice(0, 60)}” at-risk (${pctChance}% Monte Carlo chance of hitting ${t.targetOn})`,
      };
      entries.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'goal',
          entityId: goal.id,
          summary: `[RULE-CAP-05] ${entry.summary}`,
        });
      }
    }
  }

  // 2. Flaw-of-Averages horizon breach (>= 50% overload odds despite <= 100% mean utilisation)
  if (sim.flawOfAveragesTrap && !capacityDecisionStillOpen(draft)) {
    const topDriver = sim.drivers[0] || null;
    const anchor = model.demand.committed
      .slice()
      .sort((a, b) => b.effort.pessimistic - a.effort.pessimistic || b.effort.expected - a.effort.expected)[0];
    if (anchor) {
      const candidateDeferrals = model.demand.committed
        .filter((i) => i.kind !== 'capacity-reserve')
        .slice()
        .sort((a, b) => (a.valueDensity ?? Infinity) - (b.valueDensity ?? Infinity))
        .slice(0, 2);

      const options = candidateDeferrals.map((item) => ({
        id: idFactory('dopt'),
        label: `Defer “${item.title.slice(0, 80)}” (${item.effort.expected}d expected, P90 ${item.effort.p90}d) to restore schedule buffer`,
        pros: item.valueDensity !== null
          ? `Lowest value density (${item.valueDensity.toFixed(2)}/day); protects higher-leverage commitments against right-tail slip`
          : 'Restores horizon slack so right-skewed estimates do not cascade across every commitment',
        cons: item.targetOn ? `Pushes the ${item.targetOn} target out of this horizon` : 'Delays delivery to the next planning cycle',
      }));
      if (topDriver) {
        options.push({
          id: idFactory('dopt'),
          label: `Scope-cap tail driver “${topDriver.title.slice(0, 75)}” (PERT ${topDriver.optimistic}/${topDriver.mostLikely}/${topDriver.pessimistic}d)`,
          pros: `Top variance driver (r = ${topDriver.sensitivityIndex.toFixed(2)}); time-boxing pessimistic scope cuts P80 demand from ${sim.committedDemand.p80}d`,
          cons: 'Requires explicit non-goals or phased delivery before surprises hit',
        });
      }
      options.push({
        id: idFactory('dopt'),
        label: `Hold current scope and communicate P80 date (${sim.bottleneckCompletion.p80 || sim.teamCompletion.p80 || 'slipped'})`,
        pros: 'Avoids immediate scope negotiation',
        cons: `${Math.round(sim.overloadProbability * 100)}% Monte Carlo chance of breaching ${sim.allocatableDays}d allocatable supply`,
      });

      const decision = {
        id: idFactory('dec'),
        title: `Tail-risk capacity trade-off: ${Math.round(sim.overloadProbability * 100)}% horizon overload odds`.slice(0, 180),
        question: [
          `Point-estimate demand (${model.demand.committedDays}d vs ${model.supply.allocatableDays}d allocatable, ${Math.round(model.utilisation * 100)}% mean utilisation) appears feasible on paper,`,
          `but seeded Beta-PERT Monte Carlo (${sim.trials} trials, seed ${sim.seed}) shows P80 demand of ${sim.committedDemand.p80}d (P90 ${sim.committedDemand.p90}d) — a ${Math.round(sim.overloadProbability * 100)}% probability of breaching horizon supply (Savage, 2009 Flaw of Averages).`,
          topDriver ? `Largest variance driver: “${topDriver.title}” (${topDriver.optimistic}/${topDriver.mostLikely}/${topDriver.pessimistic}d).` : '',
          `Triggered on ${triggerLabel} (RULE-CAP-05).`,
        ].filter(Boolean).join(' ').slice(0, 2000),
        date: todayStr,
        reversibility: 'reversible',
        driver: (draft.settings?.leaderName || '').slice(0, 120),
        approver: (draft.settings?.leaderName || '').slice(0, 120),
        contributors: candidateDeferrals.map((i) => i.title).join(', ').slice(0, 300),
        informed: '',
        options,
        chosen: '',
        rationale: '',
        reviewOn: addDaysKey(todayStr, draft.settings?.decisionReviewDays ?? 14, now),
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
          ruleId: 'RULE-CAP-05',
          summary: `Addresses ${Math.round(sim.overloadProbability * 100)}% Monte Carlo horizon breach risk`,
        },
        { idFactory, todayStr, nowIso },
      );

      const entry = {
        ruleId: 'RULE-CAP-05',
        targetType: 'decision',
        targetId: decision.id,
        action: 'created',
        summary: `Flaw-of-Averages tail risk (${Math.round(sim.overloadProbability * 100)}% overload odds, P80 ${sim.committedDemand.p80}d > ${sim.allocatableDays}d) opened a DACI trade-off decision`,
      };
      entries.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'decision',
          entityId: decision.id,
          summary: `[RULE-CAP-05] ${entry.summary}`,
        });
      }
    }
  }

  return entries;
}

/**
 * RULE-FCT-01 — freeze the forecast at the moment of commitment.
 *
 * Forecast evaluation is only honest if the prediction being scored is the
 * one made *before* the outcome was known (Tetlock, 2005). When planned work
 * is funded, its PERT effort distribution, expected value and target date are
 * copied into an immutable `forecastSnapshot`; delivery actuals are later
 * scored against that snapshot even if the live estimate is edited during
 * execution. Un-funding (deferred/cut/undecided) clears the snapshot via
 * `clearPortfolioForecast` so a future re-funding freezes the new commitment
 * rather than resurrecting a stale belief. Capacity reserves are excluded:
 * their effort is a case's diverted capacity, scored in the case ledger.
 *
 * Mutates the draft item in place; returns a propagation entry or null.
 */
export function freezePortfolioForecast(draft, item, { now = new Date(), todayStr = null, logEvent = null } = {}) {
  if (!draft || !item) return null;
  if (item.status !== 'open' || item.decision !== 'funded') return null;
  if (item.kind === 'capacity-reserve') return null;
  if (item.forecastSnapshot) return null; // already frozen at this commitment
  const fundedOn = todayStr || dayKey(now);
  const snapshot = buildForecastSnapshot(item, fundedOn);
  if (!snapshot) return null; // unestimated work has no forecast to freeze
  item.forecastSnapshot = snapshot;
  const entry = {
    ruleId: 'RULE-FCT-01',
    targetType: 'portfolio',
    targetId: item.id,
    action: 'updated',
    summary: `Froze the funding-time forecast for “${String(item.title || '').slice(0, 60)}” (expected ${snapshot.effortExpected}d · P80 ${snapshot.effortP80}d) so delivery can be scored against it`,
  };
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'portfolio',
      entityId: item.id,
      summary: `[RULE-FCT-01] ${entry.summary}`,
    });
  }
  return entry;
}

/** Companion to RULE-FCT-01: an un-funded item's commitment no longer exists. */
export function clearPortfolioForecast(item) {
  if (item && item.forecastSnapshot && item.decision !== 'funded' && item.status === 'open') {
    item.forecastSnapshot = null;
    return true;
  }
  return false;
}

function calibrationDecisionStillOpen(draft) {
  for (const link of draft.links || []) {
    if (!link || link.ruleId !== 'RULE-FCT-02') continue;
    const decisionId = link.targetType === 'decision' ? link.targetId : link.sourceType === 'decision' ? link.sourceId : null;
    const decision = decisionId ? (draft.decisions || []).find((d) => d.id === decisionId) : null;
    if (!decision) continue;
    if (!decision.reviewedOn) return true; // acknowledged, awaiting its outcome review
  }
  return false;
}

/**
 * RULE-FCT-02 — when the team's own delivery history proves systematic
 * optimism, make the correction an explicit, owned decision.
 *
 * Triggered after actuals are recorded (portfolio.completed /
 * portfolio.actuals). Requires a real evidence base (≥5 scored items) and a
 * median actual/estimate ratio ≥1.25× — the planning-fallacy signature
 * (Kahneman & Tversky, 1979) — then opens exactly one DACI decision offering
 * Flyvbjerg (2006) reference-class uplifts computed from the observed ratio
 * distribution, an estimation-practice investigation, or explicit acceptance.
 * Idempotent while a previous calibration decision awaits outcome review, so
 * repeated deliveries never stack duplicate governance records.
 */
export function evaluateCalibrationGovernance(draft, { now = new Date(), idFactory, todayStr, nowIso, logEvent = null, triggerLabel = 'portfolio' } = {}) {
  if (!draft || !idFactory) return null;
  const cal = estimateCalibration(draft);
  if (!cal.sufficient || !cal.medianRatio || cal.medianRatio < OPTIMISM_RATIO_THRESHOLD) return null;
  if (calibrationDecisionStillOpen(draft)) return null;

  const worst = cal.pairs.slice().sort((a, b) => b.ratio - a.ratio)[0];
  if (!worst) return null;

  const dayStr = todayStr || dayKey(now);
  const iso = nowIso || now.toISOString();
  const intervalPct = cal.withinRangeRate !== null ? Math.round(cal.withinRangeRate * 100) : null;
  const options = [
    {
      id: idFactory('dopt'),
      label: `Apply the ${cal.medianRatio}× reference-class uplift to new commitments`,
      pros: 'Recentres point forecasts on the team’s own delivery history instead of hope; reversible when the ratio recentres',
      cons: 'Dates get visibly later on paper; expect pushback until the first on-time quarter lands',
    },
    {
      id: idFactory('dopt'),
      label: `Plan dated commitments to the P80 uplift (${cal.ratioP80}×)`,
      pros: 'Four of five historical overruns would have fit inside this budget; protects external promises',
      cons: 'Conservative for internal exploratory work; may invite Parkinson’s-law expansion if applied silently',
    },
    {
      id: idFactory('dopt'),
      label: 'Investigate estimation practice before adjusting numbers',
      pros: intervalPct !== null
        ? `Only ${intervalPct}% of actuals landed inside the optimistic–pessimistic range, suggesting the ranges themselves are the defect`
        : 'Fixes the cause (decomposition, reference classes, premortems) rather than the symptom',
      cons: 'Slower: the next quarter is still planned on optimistic numbers while the practice changes',
    },
    {
      id: idFactory('dopt'),
      label: 'Accept the optimism and re-baseline targets instead',
      pros: 'No process change; honesty about dates is preserved by moving targets openly',
      cons: 'Every future plan keeps absorbing the same invisible overrun; queue delay compounds (Kingman, 1961)',
    },
  ];

  const decision = {
    id: idFactory('dec'),
    title: `Forecast calibration: delivered work runs ${cal.medianRatio}× its estimates`.slice(0, 180),
    question: [
      `Across ${cal.n} delivered plan items with recorded actuals, the median item took ${cal.medianRatio}× its funding-time PERT expectation (mean ${cal.meanRatio}×; P80 ratio ${cal.ratioP80}×).`,
      intervalPct !== null ? `${intervalPct}% of actuals landed inside their optimistic–pessimistic range.` : null,
      cal.schedule.n ? `Only ${Math.round((cal.schedule.onTimeRate ?? 0) * 100)}% of targeted items landed on their target date (median slip ${cal.schedule.medianSlipDays}d).` : null,
      `Worst overrun: “${worst.title.slice(0, 80)}” at ${worst.ratio}× (${worst.actual}d actual vs ${worst.expected}d expected).`,
      `Triggered by a ${triggerLabel} event (RULE-FCT-02). This is the planning fallacy measured on your own record (Kahneman & Tversky, 1979); the evidence-based correction is a reference-class uplift from the observed ratio distribution (Flyvbjerg, 2006), not exhortations to estimate better.`,
    ].filter(Boolean).join(' ').slice(0, 2000),
    date: dayStr,
    reversibility: 'reversible',
    driver: (draft.settings?.leaderName || '').slice(0, 120),
    approver: (draft.settings?.leaderName || '').slice(0, 120),
    contributors: cal.pairs.slice(0, 3).map((p) => p.title).join(', ').slice(0, 300),
    informed: '',
    options,
    chosen: '',
    rationale: '',
    reviewOn: addDaysKey(dayStr, (draft.settings?.decisionReviewDays ?? 14), now),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    createdAt: iso,
  };
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);

  ensureEntityLink(
    draft,
    {
      sourceType: 'decision',
      sourceId: decision.id,
      targetType: 'portfolio',
      targetId: worst.itemId,
      relation: 'decides',
      ruleId: 'RULE-FCT-02',
      summary: `Governs estimate calibration evidenced by “${worst.title.slice(0, 80)}” (${worst.ratio}× overrun)`,
    },
    { idFactory, todayStr: dayStr, nowIso: iso },
  );

  const entry = {
    ruleId: 'RULE-FCT-02',
    targetType: 'decision',
    targetId: decision.id,
    action: 'created',
    summary: `Systematic estimation optimism (median ${cal.medianRatio}×, n=${cal.n}) opened a forecast-calibration decision with reference-class uplift options`,
  };
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'decision',
      entityId: decision.id,
      summary: `[RULE-FCT-02] ${entry.summary}`,
    });
  }
  return entry;
}

/**
 * RULE-FCT-03 — freeze the opening case forecast at first quantification.
 *
 * A case's PERT exposure, diverted-capacity expectation, planned mitigation
 * spend and pre-mitigation FMEA probability are the numbers that drive the
 * escalate / mitigate / accept call (RULE-DEC-01 even thresholds on them).
 * The first time an open case carries a measured leg, those beliefs are
 * copied into an immutable `forecastSnapshot`; settled actuals recorded at
 * resolution are scored against it (FAIR frequency/magnitude legs, spend and
 * diverted-days discipline), never against the estimate as edited once the
 * outcome was known. Deliberately independent of `autoPropagate`: like
 * RULE-FCT-01 this is record-keeping on the case itself, not a cross-module
 * side effect, so opting out of propagation must not disable the memory that
 * makes calibration honest. Resolution-time cases are never frozen —
 * freezing after the outcome is known would be hindsight with a timestamp.
 *
 * Mutates the draft case in place; returns a propagation entry or null.
 */
export function freezeCaseForecast(draft, caseRecord, { now = new Date(), todayStr = null, logEvent = null } = {}) {
  if (!draft || !caseRecord) return null;
  if (!isCaseOpen(caseRecord)) return null;
  if (caseRecord.forecastSnapshot) return null; // opening belief already frozen
  const frozenOn = todayStr || dayKey(now);
  const snapshot = buildCaseForecastSnapshot(caseRecord, frozenOn);
  if (!snapshot) return null; // unquantified case: no forecast to freeze
  caseRecord.forecastSnapshot = snapshot;
  const entry = {
    ruleId: 'RULE-FCT-03',
    targetType: 'case',
    targetId: caseRecord.id,
    action: 'updated',
    summary: `Froze the opening risk forecast for “${String(caseRecord.title || '').slice(0, 60)}” (expected exposure ${snapshot.currency} ${snapshot.costExpected.toLocaleString('en-US')} · assessed probability ${Math.round(Math.min(1, Math.max(0.1, (snapshot.fmeaProbability ?? 5) / 10)) * 100)}%) so settled actuals can score it`,
  };
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'case',
      entityId: caseRecord.id,
      summary: `[RULE-FCT-03] ${entry.summary}`,
    });
  }
  return entry;
}

function caseCalibrationDecisionStillOpen(draft) {
  for (const link of draft.links || []) {
    if (!link || link.ruleId !== 'RULE-FCT-04') continue;
    const decisionId = link.targetType === 'decision' ? link.targetId : link.sourceType === 'decision' ? link.sourceId : null;
    const decision = decisionId ? (draft.decisions || []).find((d) => d.id === decisionId) : null;
    if (!decision) continue;
    if (!decision.reviewedOn) return true; // acknowledged, awaiting its outcome review
  }
  return false;
}

/**
 * RULE-FCT-04 — when settled cases prove the exposure reserves deficient,
 * make the correction an explicit, owned decision.
 *
 * Triggered after actuals are recorded (case.resolved with actuals /
 * case.actuals). Requires a real evidence base (≥5 scored materialised
 * cases) and a median realised/assessed exposure ratio ≥1.25× — the
 * actuarial signature of deficient case reserves — then opens exactly one
 * DACI decision offering reference-class contingency uplifts computed from
 * the observed development distribution, an exposure-assessment practice
 * investigation, or explicit self-insured acceptance. Idempotent while a
 * previous case-calibration decision awaits outcome review.
 */
export function evaluateCaseCalibrationGovernance(draft, { now = new Date(), idFactory, todayStr, nowIso, logEvent = null, triggerLabel = 'case' } = {}) {
  if (!draft || !idFactory) return null;
  const cal = caseCostCalibration(draft);
  const exp = cal.exposure;
  if (!exp.sufficient || !exp.medianRatio || exp.medianRatio < OPTIMISM_RATIO_THRESHOLD) return null;
  if (caseCalibrationDecisionStillOpen(draft)) return null;

  const worst = exp.pairs.slice().sort((a, b) => b.exposureRatio - a.exposureRatio)[0];
  if (!worst) return null;

  const dayStr = todayStr || dayKey(now);
  const iso = nowIso || now.toISOString();
  const currency = worst.currency || cal.aggregate.currency || 'USD';
  const intervalPct = exp.withinRangeRate !== null ? Math.round(exp.withinRangeRate * 100) : null;
  const options = [
    {
      id: idFactory('dopt'),
      label: `Apply the ${exp.medianRatio}× reference-class uplift to new case exposure estimates`,
      pros: 'Recentres opening PERT exposures on the team’s own settlement history (the actuarial development factor), instead of re-asserting the inside view',
      cons: 'Assessed exposures grow on paper; RULE-DEC-01 escalation thresholds will fire more often until the ratio recentres',
    },
    {
      id: idFactory('dopt'),
      label: `Reserve High-priority cases at the P80 development factor (${exp.ratioP80}×)`,
      pros: 'Four of five historical settlements would have fit inside this reserve; protects the plan against the fat tail where case costs actually live',
      cons: 'Holds more contingency against every High case, including the contained ones',
    },
    {
      id: idFactory('dopt'),
      label: 'Investigate exposure-assessment practice before adjusting numbers',
      pros: intervalPct !== null
        ? `Only ${intervalPct}% of realised exposures landed inside the optimistic–pessimistic range, suggesting the ranges themselves are the defect (FAIR calibration failure)`
        : 'Fixes the cause (loss-magnitude decomposition, secondary-loss checklists, reference classes) rather than the symptom',
      cons: 'Slower: the next cases are still opened on under-assessed exposures while the practice changes',
    },
    {
      id: idFactory('dopt'),
      label: 'Accept the under-reserving and self-insure explicitly',
      pros: 'No process change; the retained risk is at least named and owned',
      cons: 'Every future materialisation keeps landing as an unplanned draw on capacity and budget',
    },
  ];

  const decision = {
    id: idFactory('dec'),
    title: `Case-cost calibration: materialised risks settle at ${exp.medianRatio}× assessed exposure`.slice(0, 180),
    question: [
      `Across ${exp.n} materialised cases with settled actuals, the median case cost ${exp.medianRatio}× the exposure expected when it was opened (mean ${exp.meanRatio}×; P80 development factor ${exp.ratioP80}×).`,
      intervalPct !== null ? `${intervalPct}% of realised exposures landed inside their optimistic–pessimistic range.` : null,
      cal.occurrence.n ? `Assessed occurrence averaged ${Math.round((cal.occurrence.meanAssessedProbability ?? 0) * 100)}% against ${Math.round((cal.occurrence.observedRate ?? 0) * 100)}% materialised (n=${cal.occurrence.n}; occurrence Brier ${cal.occurrence.brier}).` : null,
      cal.aggregate.developmentFactor !== null ? `Aggregate loss development: ${cal.aggregate.currency} ${Number(cal.aggregate.totalRealised).toLocaleString('en-US')} realised (exposure + mitigation spend) against ${cal.aggregate.currency} ${Number(cal.aggregate.totalExpectedUnmitigated).toLocaleString('en-US')} expected unmitigated loss over ${cal.aggregate.n} complete settlement(s).` : null,
      `Worst under-assessment: “${worst.title.slice(0, 80)}” at ${worst.exposureRatio}× (${currency} ${Number(worst.realisedExposure).toLocaleString('en-US')} realised vs ${currency} ${Number(worst.costExpected).toLocaleString('en-US')} expected, scored against the ${worst.source === 'opening-forecast' ? 'frozen opening forecast' : 'resolution-time estimate'}).`,
      `Triggered by a ${triggerLabel} event (RULE-FCT-04). Case reserves that systematically develop upward are deficient reserves; the evidence-based correction is a reference-class development factor from the settlement history (Flyvbjerg, 2006), not exhortations to assess harder.`,
    ].filter(Boolean).join(' ').slice(0, 2000),
    date: dayStr,
    reversibility: 'reversible',
    driver: (draft.settings?.leaderName || '').slice(0, 120),
    approver: (draft.settings?.leaderName || '').slice(0, 120),
    contributors: exp.pairs.slice(0, 3).map((p) => p.title).join(', ').slice(0, 300),
    informed: '',
    options,
    chosen: '',
    rationale: '',
    reviewOn: addDaysKey(dayStr, (draft.settings?.decisionReviewDays ?? 14), now),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    createdAt: iso,
  };
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);

  ensureEntityLink(
    draft,
    {
      sourceType: 'decision',
      sourceId: decision.id,
      targetType: 'case',
      targetId: worst.caseId,
      relation: 'decides',
      ruleId: 'RULE-FCT-04',
      summary: `Governs case-cost calibration evidenced by “${worst.title.slice(0, 80)}” (${worst.exposureRatio}× settlement)`,
    },
    { idFactory, todayStr: dayStr, nowIso: iso },
  );

  const entry = {
    ruleId: 'RULE-FCT-04',
    targetType: 'decision',
    targetId: decision.id,
    action: 'created',
    summary: `Systematic case-cost under-reserving (median ${exp.medianRatio}×, n=${exp.n}) opened a case-cost calibration decision with reference-class uplift options`,
  };
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'decision',
      entityId: decision.id,
      summary: `[RULE-FCT-04] ${entry.summary}`,
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
  const candidates = requisitionInput.id
    ? (state.candidates || []).filter((c) => c && c.reqId === requisitionInput.id)
    : [];
  if (candidates.length) out.push(`${candidates.length} candidate record(s) stay attached; evidence and decisions are kept.`);
  if (requisitionInput.status === 'filled') out.push('Completing the role marks the interview reserve delivered and frees the capacity.');
  if (requisitionInput.status === 'cancelled' || requisitionInput.status === 'on-hold') out.push('Releasing the role returns its reserved capacity to the plan.');
  return out;
}

/* ------------------------------------------------------------------ */
/* Organizational Design, Team Topologies & Change (Schema v19)       */
/* ------------------------------------------------------------------ */

function changeReserveTitle(change) {
  return `Change transition: ${change.title}`.slice(0, 200);
}

function changeCoachingPrompt(change) {
  const shortTitle = (change.title || 'Organizational change').trim().slice(0, 52);
  return `Change support (${shortTitle}): check role boundaries, cognitive load & transition blockers`;
}

function buildRoleTransitionCheckpointsForChange(startDate, idFactory) {
  const dueAt = (offset) => addDays(startDate, offset);
  const templates = [
    [30, 'clarity', 'Agree the handover inventory for the old role: what stops, what transfers to whom, and by when', 14],
    [30, 'clarity', 'Write down how the new role differs: scope, decision authority and what good looks like at 90 days', 30],
    [60, 'contribution', 'Deliver or jointly review the first scoped early win in the new boundary', 60],
    [60, 'culture', 'Exchange 60-day calibration: which old-boundary habits to drop, and what the new interface expects', 60],
    [90, 'ownership', 'Own the new recurring outcomes end to end without falling back on the old seam', 90],
    [90, 'ownership', 'Reset steady-state goals and GROW development commitments to the new charter', 90],
  ];
  return templates.map(([horizon, category, title, offset]) => ({
    id: idFactory('onbc'),
    horizon,
    category,
    title,
    due: dueAt(offset),
    done: false,
    completedOn: null,
    notes: '',
  }));
}

/**
 * RULE-CHG-01 — synchronize committed transition effort with `#/capacity`.
 * Active/stabilising changes reserve capacity; anchored marks delivered;
 * paused/abandoned/proposed releases an open reserve back to the plan.
 */
export function syncChangeCapacityReserve(draft, change, { idFactory, todayStr, nowIso, logEvent = null }) {
  if (!change || !change.id) return null;
  draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
  draft.links = Array.isArray(draft.links) ? draft.links : [];

  const effort = pertStats(
    change.effortDays?.optimistic,
    change.effortDays?.mostLikely,
    change.effortDays?.pessimistic,
  );
  const committed = isChangeCommitted(change);
  const existing = draft.portfolio.find(
    (p) => p && p.sourceType === 'change' && p.sourceId === change.id,
  ) || null;

  if (committed && effort.measured) {
    const triple = {
      optimistic: effort.optimistic,
      mostLikely: effort.mostLikely,
      pessimistic: effort.pessimistic,
    };
    if (!existing) {
      const item = {
        id: idFactory('pf'),
        title: changeReserveTitle(change),
        kind: 'capacity-reserve',
        status: 'open',
        sourceType: 'change',
        sourceId: change.id,
        ownerId: change.ownerId || null,
        effortDays: triple,
        value: { ...ZERO_TRIPLE },
        currency: change.economics?.currency || 'USD',
        decision: 'funded',
        decisionOn: change.openedOn || todayStr,
        rationale: `Transition capacity reserved for active organizational change “${change.title}” (RULE-CHG-01).`,
        targetOn: change.targetOn || null,
        createdOn: change.openedOn || todayStr,
        completedOn: null,
        releasedOn: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      draft.portfolio.push(item);
      ensureEntityLink(
        draft,
        {
          sourceType: 'change',
          sourceId: change.id,
          targetType: 'portfolio',
          targetId: item.id,
          relation: 'consumes-capacity',
          ruleId: 'RULE-CHG-01',
          summary: `${effort.expected}d transition effort reserved`,
        },
        { idFactory, todayStr, nowIso },
      );
      const entry = {
        ruleId: 'RULE-CHG-01',
        targetType: 'portfolio',
        targetId: item.id,
        action: 'created',
        summary: `Reserved ${effort.expected} person-day(s) of transition capacity for “${change.title}”`,
      };
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'portfolio',
          entityId: item.id,
          summary: `[RULE-CHG-01] ${entry.summary}`,
        });
      }
      return entry;
    }

    const needReopen = existing.status !== 'open';
    const changed =
      needReopen ||
      !effortEqual(existing.effortDays, triple) ||
      existing.title !== changeReserveTitle(change) ||
      existing.ownerId !== (change.ownerId || null) ||
      existing.targetOn !== (change.targetOn || null);

    ensureEntityLink(
      draft,
      {
        sourceType: 'change',
        sourceId: change.id,
        targetType: 'portfolio',
        targetId: existing.id,
        relation: 'consumes-capacity',
        ruleId: 'RULE-CHG-01',
        summary: `${effort.expected}d transition effort reserved`,
      },
      { idFactory, todayStr, nowIso },
    );

    if (!changed) return null;

    existing.title = changeReserveTitle(change);
    existing.status = 'open';
    existing.completedOn = null;
    existing.releasedOn = null;
    existing.ownerId = change.ownerId || null;
    existing.targetOn = change.targetOn || null;
    existing.effortDays = triple;
    existing.decision = 'funded';
    existing.updatedAt = nowIso;

    const entry = {
      ruleId: 'RULE-CHG-01',
      targetType: 'portfolio',
      targetId: existing.id,
      action: needReopen ? 'reopened' : 'updated',
      summary: `Updated transition capacity reserve to ${effort.expected} person-day(s) for “${change.title}”`,
    };
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'portfolio',
        entityId: existing.id,
        summary: `[RULE-CHG-01] ${entry.summary}`,
      });
    }
    return entry;
  }

  // Non-committed status or zero effort: settle any open reserve.
  if (existing && existing.status === 'open') {
    if (change.status === 'anchored') {
      existing.status = 'done';
      existing.completedOn = change.anchoredOn || todayStr;
      existing.releasedOn = null;
      existing.updatedAt = nowIso;
      const entry = {
        ruleId: 'RULE-CHG-01',
        targetType: 'portfolio',
        targetId: existing.id,
        action: 'completed',
        summary: `Completed transition capacity reserve for anchored change “${change.title}”`,
      };
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'portfolio',
          entityId: existing.id,
          summary: `[RULE-CHG-01] ${entry.summary}`,
        });
      }
      return entry;
    }

    existing.status = 'released';
    existing.releasedOn = todayStr;
    existing.completedOn = null;
    existing.updatedAt = nowIso;
    const entry = {
      ruleId: 'RULE-CHG-01',
      targetType: 'portfolio',
      targetId: existing.id,
      action: 'released',
      summary: `Released transition capacity reserve (${change.status}) for “${change.title}”`,
    };
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'portfolio',
        entityId: existing.id,
        summary: `[RULE-CHG-01] ${entry.summary}`,
      });
    }
    return entry;
  }

  return null;
}

function hasChangeLinkToType(links, changeId, targetType, allowedRelations = null) {
  return (links || []).find((l) => {
    if (!l) return false;
    const relOk = !allowedRelations || allowedRelations.includes(l.relation);
    if (!relOk) return false;
    return (
      (l.sourceType === 'change' && l.sourceId === changeId && l.targetType === targetType) ||
      (l.targetType === 'change' && l.targetId === changeId && l.sourceType === targetType)
    );
  }) || null;
}

function shouldCreateChangeDecision(change) {
  if (change.autoCreateDecision === false) return false;
  return (
    change.reversibility === 'irreversible' ||
    ['topology', 'reporting-line', 'charter'].includes(change.kind)
  );
}

/**
 * Parallel + vertical cross-module propagation for Organizational Changes.
 * Runs inside a single atomic `store.update` transaction.
 */
export function propagateChangeEvent(draft, change, { now = new Date(), idFactory, logEvent = null } = {}) {
  if (!change || !change.id) return [];
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const propagations = [];

  draft.links = Array.isArray(draft.links) ? draft.links : [];
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.onboarding = Array.isArray(draft.onboarding) ? draft.onboarding : [];
  draft.goals = Array.isArray(draft.goals) ? draft.goals : [];

  const open = isChangeOpen(change);
  const committed = isChangeCommitted(change);

  // 1. RULE-CHG-01: Capacity reserve sync (runs for all statuses so pauses/anchors release/complete).
  const capEntry = syncChangeCapacityReserve(draft, change, { idFactory, todayStr, nowIso, logEvent });
  if (capEntry) propagations.push(capEntry);

  if (!open) return propagations;

  const forceField = evaluateForceField(change);
  const coalition = evaluateGuidingCoalition(change, now);
  const topology = evaluateTopologyAndLoad(change);
  const star = evaluateStarAlignment(change);

  // 2. RULE-CHG-04: Guiding coalition & veto-player briefing cadence.
  let scheduledBriefs = 0;
  for (const stk of change.coalition || []) {
    if (!stk || !String(stk.name || '').trim() || stk.nextBriefOn) continue;
    const isHighPriority = stk.vetoPlayer || (Number(stk.power) >= 4 && Number(stk.interest) >= 3);
    const offset = stk.vetoPlayer && (stk.stance === 'blocker' || stk.stance === 'skeptical')
      ? 2
      : isHighPriority
        ? 7
        : 14;
    stk.nextBriefOn = addDays(todayStr, offset);
    scheduledBriefs += 1;
  }
  if (scheduledBriefs > 0) {
    const entry = {
      ruleId: 'RULE-CHG-04',
      targetType: 'change',
      targetId: change.id,
      action: 'scheduled',
      summary: `Scheduled briefing dates for ${scheduledBriefs} guiding-coalition / veto stakeholder(s)`,
    };
    propagations.push(entry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'change',
        entityId: change.id,
        summary: `[RULE-CHG-04] ${entry.summary}`,
      });
    }
  }

  // 3. RULE-CHG-02: Structural DACI governance decision.
  const existingDecLink = hasChangeLinkToType(draft.links, change.id, 'decision', ['decides']);
  if (!existingDecLink && shouldCreateChangeDecision(change)) {
    const effort = pertStats(
      change.effortDays?.optimistic,
      change.effortDays?.mostLikely,
      change.effortDays?.pessimistic,
    );
    const owner = change.ownerId ? (draft.people || []).find((p) => p.id === change.ownerId) : null;
    const approvers = coalition.vetoPlayers.map((v) => v.name).join(', ') || (draft.settings?.leaderName || '');
    const contributors = coalition.members.filter((m) => !m.vetoPlayer).map((m) => m.name).slice(0, 5).join(', ');
    const reviewDefault = change.reviewOn || addDays(todayStr, draft.settings?.changeReviewDays ?? 21);

    const decision = {
      id: idFactory('dec'),
      title: `Change charter: ${change.title}`.slice(0, 200),
      question: [
        change.summary || `Should we execute and anchor "${change.title}"?`,
        change.nonGoals ? `Explicit non-goals: ${change.nonGoals}` : '',
        topology.handoffsDelta !== null ? `Target blocking-handoff delta: ${topology.handoffsDelta}.` : '',
      ].filter(Boolean).join(' ').slice(0, 2000),
      date: change.openedOn || todayStr,
      reversibility: change.reversibility === 'reversible' ? 'reversible' : 'irreversible',
      driver: (owner?.name || draft.settings?.leaderName || '').slice(0, 120),
      approver: approvers.slice(0, 120),
      contributors: contributors.slice(0, 300),
      informed: (draft.settings?.teamName || '').slice(0, 300),
      options: [
        {
          id: idFactory('dopt'),
          label: `Execute target design (${topology.targetTypeLabel.split(' ')[0]})`,
          pros: change.vision
            ? change.vision.slice(0, 300)
            : 'Reduces cross-team coordination drag and clarifies ownership boundaries',
          cons: effort.measured
            ? `Consumes ${effort.expected} person-days of transition capacity${star.incentiveMismatchWarning ? '; rewards/goals alignment still needed' : ''}`
            : 'Temporary J-curve productivity dip during boundary handoff',
        },
        {
          id: idFactory('dopt'),
          label: 'Keep current boundary and patch local rituals only',
          pros: 'Zero structural handoff disruption this cycle',
          cons: (change.summary || 'Leaves underlying systemic cognitive load and handoff wait intact').slice(0, 300),
        },
      ],
      chosen: committed ? `Execute target design (${topology.targetTypeLabel.split(' ')[0]})` : '',
      rationale: committed ? (change.vision || change.summary || 'Committed into active transition.').slice(0, 1000) : '',
      reviewOn: reviewDefault,
      reviewedOn: null,
      outcome: 'pending',
      outcomeNotes: '',
      createdAt: nowIso,
    };
    draft.decisions.push(decision);
    ensureEntityLink(
      draft,
      {
        sourceType: 'change',
        sourceId: change.id,
        targetType: 'decision',
        targetId: decision.id,
        relation: 'decides',
        ruleId: 'RULE-CHG-02',
        summary: `DACI charter decision for “${change.title}”`,
      },
      { idFactory, todayStr, nowIso },
    );
    const entry = {
      ruleId: 'RULE-CHG-02',
      targetType: 'decision',
      targetId: decision.id,
      action: 'created',
      summary: `Opened linked DACI charter decision “${decision.title}”`,
    };
    propagations.push(entry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'decision',
        entityId: decision.id,
        summary: `[RULE-CHG-02] ${entry.summary}`,
      });
    }
  }

  // 4. RULE-CHG-03: Impacted team members -> 1:1 talking points + opted-in 30-60-90 role transitions.
  const prompt = changeCoachingPrompt(change);
  for (const imp of change.impacts || []) {
    if (!imp || !imp.personId) continue;
    const person = (draft.people || []).find((p) => p.id === imp.personId);
    if (!person || person.status === 'archived') continue;

    // 4a. Blameless 1:1 support prompt + coaches link
    ensureEntityLink(
      draft,
      {
        sourceType: 'change',
        sourceId: change.id,
        targetType: 'person',
        targetId: person.id,
        relation: 'coaches',
        ruleId: 'RULE-CHG-03',
        summary: `1:1 transition support for ${person.name}`,
      },
      { idFactory, todayStr, nowIso },
    );
    person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
    const hasPrompt = person.talkingPoints.some(
      (tp) => String(tp).toLowerCase() === prompt.toLowerCase(),
    );
    if (!hasPrompt && person.talkingPoints.length < 12) {
      person.talkingPoints.push(prompt);
      const entry = {
        ruleId: 'RULE-CHG-03',
        targetType: 'person',
        targetId: person.id,
        action: 'talking-point-queued',
        summary: `Queued 1:1 transition support topic for ${person.name}`,
      };
      propagations.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'person',
          entityId: person.id,
          summary: `[RULE-CHG-03] ${entry.summary}`,
        });
      }
    }

    // 4b. Explicit opt-in 30-60-90 role-transition plan (only when change is active/stabilising)
    if (committed && imp.createTransitionPlan) {
      const existingActivePlan = (draft.onboarding || []).find(
        (p) => p && p.personId === person.id && p.status === 'active',
      );
      if (existingActivePlan) {
        ensureEntityLink(
          draft,
          {
            sourceType: 'change',
            sourceId: change.id,
            targetType: 'onboarding',
            targetId: existingActivePlan.id,
            relation: 'transitions-role',
            ruleId: 'RULE-CHG-03',
            summary: `Role transition linked for ${person.name}`,
          },
          { idFactory, todayStr, nowIso },
        );
      } else {
        const startAnchor = person.startDate && todayStr < person.startDate ? person.startDate : todayStr;
        const transitionLabel = (imp.newRoleLabel || `${person.role || 'Role'} · ${change.title}`).slice(0, 160);
        const plan = {
          id: idFactory('onb'),
          personId: person.id,
          kind: 'role-transition',
          label: transitionLabel,
          startDate: startAnchor,
          buddyId: null,
          buddyName: '',
          roleClarity: (change.vision || change.summary || '').slice(0, 2000),
          earlyWin: '',
          stakeholders: [],
          checkpoints: buildRoleTransitionCheckpointsForChange(startAnchor, idFactory),
          reviews: { 30: null, 60: null, 90: null },
          status: 'active',
          completedOn: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        draft.onboarding.push(plan);
        ensureEntityLink(
          draft,
          {
            sourceType: 'change',
            sourceId: change.id,
            targetType: 'onboarding',
            targetId: plan.id,
            relation: 'transitions-role',
            ruleId: 'RULE-CHG-03',
            summary: `Started 30-60-90 role transition for ${person.name}`,
          },
          { idFactory, todayStr, nowIso },
        );
        const entry = {
          ruleId: 'RULE-CHG-03',
          targetType: 'onboarding',
          targetId: plan.id,
          action: 'created',
          summary: `Created 30-60-90 role-transition plan for ${person.name} (“${transitionLabel}”)`,
        };
        propagations.push(entry);
        if (logEvent) {
          logEvent({
            type: 'automation.propagated',
            entity: 'onboarding',
            entityId: plan.id,
            summary: `[RULE-CHG-03] ${entry.summary}`,
          });
        }
      }
    }
  }

  // 5. RULE-CHG-05: Linked Goal risk telemetry when structural change is blocked.
  if (change.linkedGoalId) {
    const goal = (draft.goals || []).find((g) => g.id === change.linkedGoalId && g.status === 'active');
    if (goal) {
      ensureEntityLink(
        draft,
        {
          sourceType: 'change',
          sourceId: change.id,
          targetType: 'goal',
          targetId: goal.id,
          relation: 'impacts-goal',
          ruleId: 'RULE-CHG-05',
          summary: `Change “${change.title}” backs goal “${goal.title}”`,
        },
        { idFactory, todayStr, nowIso },
      );

      const opposingVeto = coalition.unalignedVetoPlayers.filter(
        (v) => v.stance === 'blocker' || v.stance === 'skeptical',
      );
      const changeBlocked =
        committed &&
        (forceField.equilibrium === 'blocked' ||
          forceField.highTensionStalemate ||
          opposingVeto.length > 0);

      if (changeBlocked) {
        const marker = `[RULE-CHG-05:${change.id}]`;
        goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
        const alreadyLogged = goal.checkins.some((chk) => String(chk.note || '').includes(marker));
        if (!alreadyLogged) {
          const reason = opposingVeto.length
            ? `${opposingVeto.length} opposing/skeptical veto player(s) (${opposingVeto.map((v) => v.name).join(', ')})`
            : forceField.highTensionStalemate
              ? 'high-tension force-field stalemate'
              : `restraining forces (${forceField.effectiveRestrainingSum}) exceed driving forces (${forceField.drivingSum})`;
          if (goal.confidence === 'on-track') goal.confidence = 'at-risk';
          goal.checkins.push({
            id: idFactory('chk'),
            date: todayStr,
            confidence: goal.confidence,
            note: `${marker} Dependent organizational change “${change.title}” faces ${reason}. Mitigate blockers in #/changes/${change.id}.`,
            progressPct: null,
            keyResults: null,
          });
          const entry = {
            ruleId: 'RULE-CHG-05',
            targetType: 'goal',
            targetId: goal.id,
            action: 'flagged-at-risk',
            summary: `Flagged goal “${goal.title}” (${goal.confidence}) due to blocked change “${change.title}”`,
          };
          propagations.push(entry);
          if (logEvent) {
            logEvent({
              type: 'automation.propagated',
              entity: 'goal',
              entityId: goal.id,
              summary: `[RULE-CHG-05] ${entry.summary}`,
            });
          }
        }
      }
    }
  }

  // 6. Vertical cascade (RULE-CAP-02): both RULE-CHG-01 (transition effort reserve)
  // and RULE-CHG-03 (Watkins 30-60-90 transition ramp on active supply) alter the
  // team's net feasibility! Re-evaluate capacity trade-off in the same transaction.
  if (committed) {
    const tradeoff = evaluateCapacityTradeoff(draft, {
      now,
      idFactory,
      todayStr,
      nowIso,
      logEvent,
      triggerLabel: 'organizational change',
    });
    if (tradeoff) propagations.push(tradeoff);
  }

  return propagations;
}

/**
 * Lifecycle status propagation when anchoring, pausing, or abandoning a change.
 */
export function propagateChangeStatus(draft, change, { now = new Date(), idFactory, logEvent = null } = {}) {
  if (!change || !change.id) return [];
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const propagations = [];

  if (OPEN_CHANGE_STATUSES.includes(change.status)) {
    return propagateChangeEvent(draft, change, { now, idFactory, logEvent });
  }

  const capEntry = syncChangeCapacityReserve(draft, change, { idFactory, todayStr, nowIso, logEvent });
  if (capEntry) propagations.push(capEntry);

  if (change.status === 'anchored') {
    // Update linked Goal with anchored verification note
    if (change.linkedGoalId) {
      const goal = (draft.goals || []).find((g) => g.id === change.linkedGoalId && g.status === 'active');
      if (goal) {
        const marker = `[RULE-CHG-05:anchored:${change.id}]`;
        goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
        if (!goal.checkins.some((c) => String(c.note || '').includes(marker))) {
          goal.checkins.push({
            id: idFactory('chk'),
            date: change.anchoredOn || todayStr,
            confidence: goal.confidence,
            note: `${marker} Dependent organizational change “${change.title}” anchored in practice.${change.closedReason ? ` ${change.closedReason}` : ''}`,
            progressPct: null,
            keyResults: null,
          });
          propagations.push({
            ruleId: 'RULE-CHG-05',
            targetType: 'goal',
            targetId: goal.id,
            action: 'anchored-checkin',
            summary: `Logged anchoring verification on goal “${goal.title}”`,
          });
        }
      }
    }

    // Ensure linked DACI decision has a review date scheduled to evaluate the outcome
    const decLink = hasChangeLinkToType(draft.links || [], change.id, 'decision', ['decides']);
    if (decLink) {
      const decId = decLink.sourceType === 'decision' ? decLink.sourceId : decLink.targetId;
      const dec = (draft.decisions || []).find((d) => d.id === decId);
      if (dec) {
        if (!dec.chosen) {
          dec.chosen = dec.options?.[0]?.label || `Execute ${change.title}`;
          dec.rationale = dec.rationale || change.closedReason || 'Change anchored in operating rhythm.';
        }
        if (!dec.reviewOn) {
          dec.reviewOn = addDays(change.anchoredOn || todayStr, draft.settings?.decisionReviewDays ?? 14);
        }
      }
    }
  }

  return propagations;
}

/**
 * Dry-run preview of cross-module propagations for the Change dialog UI.
 * Pure read-only evaluation — never mutates `state`.
 */
export function previewChangePropagations(changeInput = {}, state = {}, { now = new Date(), existingChangeId = null } = {}) {
  const status = changeInput.status || 'proposed';
  const open = OPEN_CHANGE_STATUSES.includes(status);
  const committed = COMMITTED_CHANGE_STATUSES.includes(status);
  const effort = pertStats(
    changeInput.effortDays?.optimistic,
    changeInput.effortDays?.mostLikely,
    changeInput.effortDays?.pessimistic,
  );
  const links = state.links || [];
  const previews = [];

  if (committed && effort.measured) {
    previews.push({
      ruleId: 'RULE-CHG-01',
      targetModule: 'Capacity & flow',
      action: 'reserve',
      summary: `Reserve ${effort.expected} person-day(s) (P10 ${effort.p10}–P90 ${effort.p90}) in the operating plan`,
      detail: 'If this pushes committed work above allocatable supply, RULE-CAP-02 opens a trade-off decision automatically.',
    });
  } else if (open && !committed && effort.measured) {
    previews.push({
      ruleId: 'RULE-CHG-01',
      targetModule: 'Capacity & flow',
      action: 'hold',
      summary: `${effort.expected} person-day(s) estimated — capacity will be reserved once status moves from Proposed to Active`,
      detail: 'Proposed designs do not consume committed team capacity until activated.',
    });
  }

  const existingDec = existingChangeId
    ? hasChangeLinkToType(links, existingChangeId, 'decision', ['decides'])
    : null;
  if (open && !existingDec && shouldCreateChangeDecision(changeInput)) {
    previews.push({
      ruleId: 'RULE-CHG-02',
      targetModule: 'Decisions (DACI)',
      action: 'create',
      summary: 'Create & link DACI charter decision with explicit non-goals and review date',
      detail: 'Structural / irreversible boundary changes require explicit DACI governance.',
    });
  }

  const impacts = Array.isArray(changeInput.impacts) ? changeInput.impacts : [];
  const validImpacts = impacts.filter((i) => i && i.personId);
  const transitionOptIns = validImpacts.filter((i) => i.createTransitionPlan);
  if (open && validImpacts.length > 0) {
    previews.push({
      ruleId: 'RULE-CHG-03',
      targetModule: '1:1s & 30-60-90 Transitions',
      action: 'scaffold',
      summary: `Queue 1:1 support topics for ${validImpacts.length} person(s)${committed && transitionOptIns.length ? ` and start ${transitionOptIns.length} 30-60-90 role-transition plan(s)` : ''}`,
      detail: transitionOptIns.length && !committed
        ? `${transitionOptIns.length} opted-in 30-60-90 transition plan(s) will start as soon as the change becomes Active.`
        : 'Role-transition ramps automatically adjust team capacity supply (#/capacity).',
    });
  }

  const unscheduled = (changeInput.coalition || []).filter((s) => s && String(s.name || '').trim() && !s.nextBriefOn);
  if (open && unscheduled.length > 0) {
    previews.push({
      ruleId: 'RULE-CHG-04',
      targetModule: 'Guiding coalition',
      action: 'schedule',
      summary: `Schedule briefing dates for ${unscheduled.length} coalition / veto stakeholder(s)`,
      detail: 'Veto players and high-power actors receive tighter briefing cadences.',
    });
  }

  if (open && changeInput.linkedGoalId) {
    const goal = (state.goals || []).find((g) => g.id === changeInput.linkedGoalId);
    if (goal) {
      const ff = evaluateForceField(changeInput);
      const coal = evaluateGuidingCoalition(changeInput, now);
      const blocked = committed && (
        ff.equilibrium === 'blocked' ||
        ff.highTensionStalemate ||
        coal.unalignedVetoPlayers.some((v) => v.stance === 'blocker' || v.stance === 'skeptical')
      );
      previews.push({
        ruleId: 'RULE-CHG-05',
        targetModule: 'Goals (OKRs)',
        action: blocked ? 'flag-at-risk' : 'link',
        summary: blocked
          ? `Link goal “${goal.title}” and log at-risk check-in (blocked force-field / veto player)`
          : `Link goal “${goal.title}” to track structural dependency`,
        detail: 'Keeps strategic objectives honest about organizational dependencies.',
      });
    }
  }

  return previews;
}

/**
 * Escalate an unmitigated restraining force on an Organizational Change into a
 * full Operational Case (`#/cases`) with FMEA, 5-Whys, and stakeholder links.
 */
export function buildCaseFromRestrainingForce(state, { changeId, forceId, now = new Date() } = {}) {
  const change = (state?.changes || []).find((c) => c.id === changeId);
  if (!change) return { ok: false, error: 'That organizational change no longer exists.' };
  const force = (change.forces || []).find((f) => f.id === forceId && f.side === 'restraining');
  if (!force) return { ok: false, error: 'Choose a restraining force to escalate.' };

  const todayStr = dayKey(now);
  const severity = Math.min(10, Math.max(4, Number(force.weight || 3) * 2));
  return {
    ok: true,
    payload: {
      kind: 'risk',
      status: 'open',
      title: `Change blocker: ${force.label}`.slice(0, 180),
      summary: `Escalated from restraining force (${force.weight}/5, ${force.category}) blocking organizational change “${change.title}”.${force.mitigation ? ` Proposed mitigation: ${force.mitigation}` : ''}`,
      ownerId: change.ownerId || null,
      involvedPersonIds: (change.impacts || []).map((i) => i.personId).slice(0, 6),
      linkedGoalId: change.linkedGoalId || null,
      openedOn: todayStr,
      reviewOn: addDays(todayStr, state?.settings?.caseReviewDays ?? 14),
      fmea: {
        severity,
        probability: force.mitigated ? 4 : 7,
        detectability: 5,
        failureMode: force.label,
        effect: `Stalls or reverses organizational change “${change.title}”`,
        controls: force.mitigation || 'No mitigation control in place yet',
      },
      financial: {},
      rca: {
        problemStatement: `Restraining force “${force.label}” (${force.weight}/5) is blocking “${change.title}”.`,
        whys: [],
        rootCause: '',
        systemicBarrier: '',
        preventiveAction: force.mitigation || '',
      },
      stakeholders: (change.coalition || []).slice(0, 6).map((s) => ({
        name: s.name,
        role: s.role,
        power: s.power,
        interest: s.interest,
        stance: s.stance,
        keyMessage: s.keyMessage,
      })),
      autoPropagate: true,
    },
  };
}

/**
 * Hand off a systemic Operational Case (`#/cases/:id`) into a structured
 * Organizational Change (`#/changes`) when the 5-Whys / Swiss-Cheese guardrail
 * requires redesigning team boundaries, charter, or operating rituals.
 */
export function buildChangeFromCase(state, { caseId, now = new Date() } = {}) {
  const c = (state?.cases || []).find((x) => x.id === caseId);
  if (!c) return { ok: false, error: 'That operational case no longer exists.' };
  const todayStr = dayKey(now);
  return {
    ok: true,
    payload: {
      title: `Systemic redesign: ${c.title}`.slice(0, 180),
      kind: 'process',
      status: 'proposed',
      summary: c.rca?.problemStatement || c.summary || `Originated from operational case “${c.title}”.`,
      vision: c.rca?.systemicBarrier || c.rca?.preventiveAction || '',
      nonGoals: c.financial?.opportunityCost || '',
      reversibility: 'reversible',
      ownerId: c.ownerId || null,
      linkedGoalId: c.linkedGoalId || null,
      openedOn: todayStr,
      reviewOn: addDays(todayStr, state?.settings?.changeReviewDays ?? 21),
      kotterStage: 'urgency',
      completedSteps: ['urgency'],
      topology: {
        teamName: state?.settings?.teamName || '',
        currentType: 'stream-aligned',
        targetType: 'stream-aligned',
        interactionMode: 'x-as-a-service',
      },
      forces: [
        {
          side: 'driving',
          label: `Eliminate recurring failure mode: ${(c.fmea?.failureMode || c.title).slice(0, 160)}`,
          weight: Math.min(5, Math.max(3, Math.ceil((c.fmea?.severity || 6) / 2))),
          category: 'governance',
          mitigation: c.rca?.preventiveAction || '',
          mitigated: false,
        },
      ],
      coalition: (c.stakeholders || []).slice(0, 8).map((s) => ({
        name: s.name,
        role: s.role,
        power: s.power,
        interest: s.interest,
        stance: s.stance,
        vetoPlayer: Number(s.power) >= 5,
        keyMessage: s.keyMessage || '',
      })),
      impacts: (c.involvedPersonIds || []).slice(0, 6).map((pid) => ({
        personId: pid,
        impactKind: 'topology-interface',
        newRoleLabel: '',
        createTransitionPlan: false,
      })),
      effortDays: {
        optimistic: c.financial?.capacityDaysOptimistic || 0,
        mostLikely: c.financial?.capacityDaysMostLikely || 0,
        pessimistic: c.financial?.capacityDaysPessimistic || 0,
      },
      autoCreateDecision: true,
    },
  };
}

/**
 * RULE-SCN-01 — Scenario trade-off commitment & parallel cross-module propagation.
 *
 * Bridges non-persisted counterfactual scenario evaluation (`#/scenarios`) into
 * durable workspace governance:
 *  1. Wires typed `state.links` edges (`funds`, `mitigates`, `decides`) from the
 *     recorded DACI decision (`decisionId`) to every referenced portfolio item,
 *     operational case, organizational change, and requisition.
 *  2. When `commitLevers === true`, atomically applies the chosen counterfactual
 *     levers into the live workspace (`settings`, `portfolio`, `cases`, `changes`)
 *     and cascades downstream rules (`RULE-CAP-01`, `RULE-CAP-03`, `RULE-CAP-05`,
 *     `RULE-CHG-01..05`) in the same transaction.
 */
export function propagateScenarioCommitment(
  draft,
  {
    decisionId,
    scenarioSpec = {},
    commitLevers = false,
    now = new Date(),
    idFactory,
    logEvent = null,
  } = {},
) {
  const propagations = [];
  if (!draft || !decisionId) return propagations;
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const levers = scenarioSpec?.levers || {};

  const recordEdge = (targetType, targetId, relation, summary) => {
    const res = ensureEntityLink(
      draft,
      {
        sourceType: 'decision',
        sourceId: decisionId,
        targetType,
        targetId,
        relation,
        ruleId: 'RULE-SCN-01',
        summary,
      },
      { idFactory, todayStr, nowIso },
    );
    if (res.created) {
      const entry = {
        ruleId: 'RULE-SCN-01',
        targetType,
        targetId,
        action: 'linked',
        summary,
      };
      propagations.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: targetType,
          entityId: targetId,
          summary: `[RULE-SCN-01] ${summary}`,
        });
      }
    }
  };

  // 1. Settings adjustments (Double-Loop governing parameters)
  if (commitLevers && levers.settingsPatch && typeof levers.settingsPatch === 'object') {
    draft.settings = { ...(draft.settings || {}) };
    const sp = levers.settingsPatch;
    const applied = [];
    if (sp.operationalLoadPct !== undefined && sp.operationalLoadPct !== null) {
      const v = Math.min(80, Math.max(0, Math.round(Number(sp.operationalLoadPct))));
      if (Number.isFinite(v) && v !== draft.settings.operationalLoadPct) {
        draft.settings.operationalLoadPct = v;
        applied.push(`operationalLoadPct=${v}%`);
      }
    }
    if (sp.planningHorizonWeeks !== undefined && sp.planningHorizonWeeks !== null) {
      const v = Math.min(26, Math.max(1, Math.round(Number(sp.planningHorizonWeeks))));
      if (Number.isFinite(v) && v !== draft.settings.planningHorizonWeeks) {
        draft.settings.planningHorizonWeeks = v;
        applied.push(`planningHorizonWeeks=${v}w`);
      }
    }
    if (sp.capacityHoursPerWeek !== undefined && sp.capacityHoursPerWeek !== null) {
      const v = Math.min(60, Math.max(4, Math.round(Number(sp.capacityHoursPerWeek))));
      if (Number.isFinite(v) && v !== draft.settings.capacityHoursPerWeek) {
        draft.settings.capacityHoursPerWeek = v;
        applied.push(`capacityHoursPerWeek=${v}h`);
      }
    }
    if (sp.wipLimitPerPerson !== undefined && sp.wipLimitPerPerson !== null) {
      const v = Math.min(12, Math.max(1, Math.round(Number(sp.wipLimitPerPerson))));
      if (Number.isFinite(v) && v !== draft.settings.wipLimitPerPerson) {
        draft.settings.wipLimitPerPerson = v;
        applied.push(`wipLimitPerPerson=${v}`);
      }
    }
    if (applied.length) {
      const summary = `Updated operating parameters (${applied.join(', ')}) from scenario commitment`;
      propagations.push({
        ruleId: 'RULE-SCN-01',
        targetType: 'settings',
        targetId: 'settings',
        action: 'updated',
        summary,
      });
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'settings',
          entityId: 'settings',
          summary: `[RULE-SCN-01] ${summary}`,
        });
      }
    }
  }

  // 2. Portfolio funding, reassignment, and scope levers
  if (Array.isArray(levers.portfolioDecisions)) {
    draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
    for (const pd of levers.portfolioDecisions) {
      if (!pd || !pd.itemId) continue;
      const item = draft.portfolio.find((i) => i && i.id === pd.itemId);
      if (!item) continue;

      recordEdge(
        'portfolio',
        item.id,
        'funds',
        `Scenario trade-off governs “${item.title.slice(0, 70)}”`,
      );

      if (commitLevers) {
        const prevDecision = item.decision;
        let touched = false;
        // Canonicalise at the commitment boundary: the sandbox projection
        // only ever evaluates PORTFOLIO_DECISIONS values, so anything else
        // arriving here (e.g. the legacy lever label 'wanted') must map to
        // its canonical equivalent rather than being written verbatim into
        // live state and silently diverging from what was evaluated.
        const nextDecision = pd.decision === 'wanted' ? 'undecided' : pd.decision;
        if (nextDecision && ['funded', 'deferred', 'cut', 'undecided'].includes(nextDecision) && nextDecision !== item.decision) {
          item.decision = nextDecision;
          item.decisionOn = todayStr;
          item.rationale = `Committed via scenario “${(scenarioSpec.name || 'Scenario').slice(0, 80)}”`;
          touched = true;
        }
        if (pd.ownerId !== undefined && (pd.ownerId || null) !== (item.ownerId || null)) {
          item.ownerId = pd.ownerId || null;
          touched = true;
        }
        if (pd.effortMultiplier !== undefined && Number.isFinite(Number(pd.effortMultiplier)) && Math.abs(Number(pd.effortMultiplier) - 1) > 1e-6 && item.effortDays) {
          const m = Math.min(3, Math.max(0.1, Number(pd.effortMultiplier)));
          item.effortDays = {
            optimistic: Math.round((Number(item.effortDays.optimistic) || 0) * m * 100) / 100,
            mostLikely: Math.round((Number(item.effortDays.mostLikely) || 0) * m * 100) / 100,
            pessimistic: Math.round((Number(item.effortDays.pessimistic) || 0) * m * 100) / 100,
          };
          touched = true;
        }
        if (touched) {
          item.updatedAt = nowIso;
          const summary = `Applied scenario lever to portfolio item “${item.title.slice(0, 60)}” (${item.decision})`;
          propagations.push({
            ruleId: 'RULE-SCN-01',
            targetType: 'portfolio',
            targetId: item.id,
            action: 'updated',
            summary,
          });
          if (logEvent) {
            logEvent({
              type: 'automation.propagated',
              entity: 'portfolio',
              entityId: item.id,
              summary: `[RULE-SCN-01] ${summary}`,
            });
          }
          if (item.decision !== prevDecision) {
            const cap03 = propagatePortfolioDecision(draft, item, {
              now,
              idFactory,
              logEvent,
              previousDecision: prevDecision,
            });
            propagations.push(...cap03);
          }
        }
      }
    }
  }

  // 3. Hypothetical items committed as real portfolio commitments
  if (commitLevers && Array.isArray(levers.hypotheticalItems)) {
    draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
    for (const hyp of levers.hypotheticalItems) {
      if (!hyp || !String(hyp.title || '').trim()) continue;
      const opt = Math.max(0, Number(hyp.effortDays?.optimistic ?? hyp.optimistic ?? 3));
      const ml = Math.max(opt, Number(hyp.effortDays?.mostLikely ?? hyp.mostLikely ?? 5));
      const pess = Math.max(ml, Number(hyp.effortDays?.pessimistic ?? hyp.pessimistic ?? 9));
      const valExpected = Number(hyp.valueExpected ?? hyp.value?.mostLikely ?? 0);
      const createdItem = {
        id: idFactory('pf'),
        title: String(hyp.title).trim().slice(0, 140),
        kind: hyp.kind || 'project',
        status: 'open',
        decision: hyp.decision === 'wanted'
          ? 'undecided'
          : (hyp.decision && ['funded', 'deferred', 'cut', 'undecided'].includes(hyp.decision) ? hyp.decision : 'funded'),
        decisionOn: todayStr,
        rationale: `Committed from What-If scenario “${(scenarioSpec.name || 'Scenario').slice(0, 80)}”`,
        ownerId: hyp.ownerId || null,
        // 'decision' is not a portfolio source type; scenario provenance is
        // carried by the RULE-SCN-01 graph edge and the rationale, and a
        // non-canonical sourceType would be silently repaired on reload.
        sourceType: 'manual',
        sourceId: null,
        effortDays: { optimistic: opt, mostLikely: ml, pessimistic: pess },
        value: valExpected > 0
          ? { optimistic: Math.round(valExpected * 0.8), mostLikely: Math.round(valExpected), pessimistic: Math.round(valExpected * 1.2) }
          : { optimistic: 0, mostLikely: 0, pessimistic: 0 },
        currency: hyp.currency || 'USD',
        targetOn: hyp.targetOn || null,
        createdOn: todayStr,
        actualEffortDays: null,
        actualValue: null,
        forecastSnapshot: null,
        updatedAt: nowIso,
      };
      draft.portfolio.push(createdItem);
      // RULE-FCT-01: a hypothetical item committed as funded work gets the
      // same frozen forecast as any other funding commitment.
      const frozeHyp = freezePortfolioForecast(draft, createdItem, { now, todayStr, logEvent });
      if (frozeHyp) propagations.push(frozeHyp);
      recordEdge('portfolio', createdItem.id, 'funds', `Committed hypothetical scope “${createdItem.title.slice(0, 60)}”`);
      const summary = `Created portfolio commitment “${createdItem.title.slice(0, 60)}” (${ml}d most-likely)`;
      propagations.push({
        ruleId: 'RULE-SCN-01',
        targetType: 'portfolio',
        targetId: createdItem.id,
        action: 'created',
        summary,
      });
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'portfolio',
          entityId: createdItem.id,
          summary: `[RULE-SCN-01] ${summary}`,
        });
      }
    }
  }

  // 4. Operational Case mitigation levers
  if (Array.isArray(levers.caseMitigations)) {
    for (const rawEntry of levers.caseMitigations) {
      const caseId = typeof rawEntry === 'string' ? rawEntry : rawEntry?.caseId;
      if (!caseId) continue;
      const c = (draft.cases || []).find((x) => x && x.id === caseId);
      if (!c) continue;
      recordEdge('case', c.id, 'mitigates', `Scenario decision targets operational case “${c.title.slice(0, 60)}”`);

      if (commitLevers && !['resolved', 'closed'].includes(c.status)) {
        c.status = 'resolved';
        c.resolvedOn = todayStr;
        c.fmea = { ...(c.fmea || {}) };
        if (!c.fmea.residualProbability) {
          c.fmea.residualProbability = Math.max(1, (Number(c.fmea.probability) || 5) - 3);
        }
        c.updatedAt = nowIso;
        const summary = `Resolved operational case “${c.title.slice(0, 60)}” via scenario commitment`;
        propagations.push({
          ruleId: 'RULE-SCN-01',
          targetType: 'case',
          targetId: c.id,
          action: 'updated',
          summary,
        });
        if (logEvent) {
          logEvent({
            type: 'automation.propagated',
            entity: 'case',
            entityId: c.id,
            summary: `[RULE-SCN-01] ${summary}`,
          });
        }
        const resProps = propagateCaseResolution(draft, c, { now, idFactory, logEvent });
        propagations.push(...resProps);
      }
    }
  }

  // 5. Organizational Change & Coalition levers
  if (Array.isArray(levers.changeActions)) {
    for (const ca of levers.changeActions) {
      if (!ca || !ca.changeId) continue;
      const chg = (draft.changes || []).find((x) => x && x.id === ca.changeId);
      if (!chg) continue;
      recordEdge('change', chg.id, 'decides', `Scenario decision governs org change “${chg.title.slice(0, 60)}”`);

      if (commitLevers) {
        const action = ca.action || 'pause';
        let touched = false;
        if (action === 'pause' && chg.status !== 'paused') {
          chg.status = 'paused';
          touched = true;
        } else if (action === 'activate' && chg.status !== 'active') {
          chg.status = 'active';
          touched = true;
        } else if (action === 'align-coalition') {
          chg.coalition = (chg.coalition || []).map((m) => {
            if (m && (m.stance === 'blocker' || m.stance === 'skeptical' || (m.vetoPlayer && m.stance !== 'champion'))) {
              touched = true;
              return { ...m, stance: 'supportive' };
            }
            return m;
          });
        } else if (action === 'mitigate-barriers') {
          chg.forces = (chg.forces || []).map((f) => {
            if (f && f.side === 'restraining' && !f.mitigated) {
              touched = true;
              return { ...f, mitigated: true };
            }
            return f;
          });
        }
        if (touched) {
          chg.updatedAt = nowIso;
          const summary = `Applied scenario lever (${action}) on org change “${chg.title.slice(0, 60)}”`;
          propagations.push({
            ruleId: 'RULE-SCN-01',
            targetType: 'change',
            targetId: chg.id,
            action: 'updated',
            summary,
          });
          if (logEvent) {
            logEvent({
              type: 'automation.propagated',
              entity: 'change',
              entityId: chg.id,
              summary: `[RULE-SCN-01] ${summary}`,
            });
          }
          const chgProps = propagateChangeStatus(draft, chg, { now, idFactory, logEvent });
          propagations.push(...chgProps);
        }
      }
    }
  }

  // 6. Requisition hiring levers (linked via typed edge; actual candidate hires go through acceptOffer)
  if (Array.isArray(levers.hiringActions)) {
    for (const ha of levers.hiringActions) {
      if (!ha || !ha.reqId) continue;
      const req = (draft.requisitions || []).find((r) => r && r.id === ha.reqId);
      if (!req) continue;
      recordEdge(
        'requisition',
        req.id,
        'decides',
        `Scenario hiring plan references requisition “${req.title.slice(0, 60)}”`,
      );
    }
  }

  // 7. Vertical cascade: re-evaluate Monte Carlo tail risk (RULE-CAP-05) after committed plan shift
  if (commitLevers) {
    const mcEntries = evaluateMonteCarloTailRisk(draft, {
      now,
      idFactory,
      todayStr,
      nowIso,
      logEvent,
      triggerLabel: 'scenario commitment',
    });
    propagations.push(...mcEntries);
  }

  return propagations;
}
