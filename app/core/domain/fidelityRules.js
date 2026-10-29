/**
 * app/core/domain/fidelityRules.js — the post-commit side of the Implementation
 * Fidelity Ledger (Schema v50), on the shared rule spine (ADR-0008).
 *
 * A fidelity reading that only produces a number is a dashboard. These rules
 * make the reading become work, in the same atomic transaction as the event that
 * produced it, and they are deliberately quiet: nothing here is created unless
 * there is something to do.
 *
 *  RULE-FID-01  `fidelity.declared` / `fidelity.updated`
 *               Typed provenance in both directions: plan ⇄ intervention, and
 *               plan ⇄ impact study when one was named. Nothing is inferred from
 *               a title, and re-running the rule cannot duplicate an edge.
 *
 *  RULE-FID-02  `fidelity.attested` where the verdict contradicts the records
 *               One blameless talking point, once, for the person who attested.
 *               A disagreement is most often unlogged work — that is a habit to
 *               fix, not a person to correct, and the prompt is phrased that way.
 *
 *  RULE-FID-03  `fidelity.settled` with material under-delivery
 *               Exactly one DACI "repair delivery before you judge the result"
 *               decision, one owned remediation task aimed at the weakest stage,
 *               and one blameless question for the owner. When delivery was
 *               adequate, nothing is created.
 *
 *  RULE-FID-04  `fidelity.scan` (explicit human scan)
 *               An overdue checkpoint becomes one owned delegation per plan, not
 *               one per stage, and never a decision: a missing reading is admin
 *               debt, not a strategic choice.
 *
 *  RULE-FID-05  `impact.scored`
 *               When the scored study has a linked plan, the delivery reading —
 *               including the Bloom-adjusted per-complier effect — is frozen onto
 *               the study in the same transaction. The study then carries its own
 *               dilution correction, and no later edit can backfill it.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  AGREEMENT_LABELS,
  FIDELITY_STAGE_BY_KEY,
  FIDELITY_UNDEREXPOSED,
  remediationStage,
  implementationEffect,
  observeFidelity,
} from './fidelity.js';
import { buildImplementationSnapshot } from './fidelitySchema.js';

export const FIDELITY_DECLARED_EVENT = 'fidelity.declared';
export const FIDELITY_UPDATED_EVENT = 'fidelity.updated';
export const FIDELITY_ATTESTED_EVENT = 'fidelity.attested';
export const FIDELITY_SETTLED_EVENT = 'fidelity.settled';
export const FIDELITY_SCAN_EVENT = 'fidelity.scan';

export const FIDELITY_RULE_IDS = Object.freeze({
  LINKED: 'RULE-FID-01',
  DISAGREEMENT: 'RULE-FID-02',
  UNDER_DELIVERED: 'RULE-FID-03',
  OVERDUE: 'RULE-FID-04',
  STUDY_SNAPSHOT: 'RULE-FID-05',
});

const MAX_TOPICS = 12;

function marker(tag) {
  return `[${tag}]`;
}

function hasMarker(rows, field, tag) {
  const token = marker(tag);
  return (rows || []).some((row) => row && typeof row[field] === 'string' && row[field].includes(token));
}

function activePeople(draft) {
  return (draft.people || []).filter((person) => person && person.status !== 'archived');
}

function ownerFor(draft, plan) {
  const direct = (draft.people || []).find((person) => person && person.id === plan.ownerId);
  if (direct && direct.status !== 'archived') return direct;
  return activePeople(draft)[0] || null;
}

function decisionRecord(ctx, { title, question, options, reviewOn, rationaleHint }) {
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 2000),
    date: today,
    reversibility: 'reversible',
    driver: String(ctx.draft?.settings?.leaderName || '').slice(0, 120),
    approver: String(ctx.draft?.settings?.leaderName || '').slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '',
    rationale: String(rationaleHint || '').slice(0, 4000),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

function delegationRecord(ctx, { personId, title, expectedOutcome, support, dueOn }) {
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('delegation'),
    personId,
    title: title.slice(0, 200),
    expectedOutcome: expectedOutcome.slice(0, 2000),
    authority: 'act-inform',
    support: support.slice(0, 2000),
    delegatedOn: today,
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
}

function addTalkingPoint(person, text, tag) {
  if (!person) return false;
  const token = marker(tag);
  person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
  if (person.talkingPoints.some((row) => String(row).includes(token))) return false;
  person.talkingPoints = [...person.talkingPoints, `${text} ${token}`.slice(0, 220)].slice(-MAX_TOPICS);
  return true;
}

function linkPlan(ctx, draft, plan, { targetType, targetId, relation, summary, ruleId = FIDELITY_RULE_IDS.LINKED }) {
  const { created } = ensureEntityLink(draft, {
    sourceType: 'fidelity',
    sourceId: plan.id,
    targetType,
    targetId,
    relation,
    ruleId,
    summary,
  }, { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() });
  return created;
}

function eventTypeOf(event) {
  return typeof event?.type === 'string' ? event.type : '';
}

/* -------------------------------------------------------- RULE-FID-01 */

function linkPropagation(draft, ctx, plan) {
  const effects = [];
  const type = ctx.event?.type;
  const interventionCollection = {
    oneonone: 'oneOnOnes',
    feedback: 'feedback',
    delegation: 'delegations',
    goal: 'goals',
    case: 'cases',
    change: 'changes',
    decision: 'decisions',
    negotiation: 'negotiations',
    stakeholder: 'stakeholders',
    hiring: 'requisitions',
    power: 'powerGames',
    network: null,
  }[plan.interventionType];
  const interventionType = {
    oneonone: 'oneonone',
    feedback: 'feedback',
    delegation: 'delegation',
    goal: 'goal',
    case: 'case',
    change: 'change',
    decision: 'decision',
    negotiation: 'negotiation',
    stakeholder: 'stakeholder',
    hiring: 'requisition',
    power: 'power',
  }[plan.interventionType];

  if (plan.interventionId && interventionCollection && interventionType) {
    const exists = (draft[interventionCollection] || []).some((row) => row && row.id === plan.interventionId);
    if (exists) {
      const created = linkPlan(ctx, draft, plan, {
        targetType: interventionType,
        targetId: plan.interventionId,
        relation: 'measures-delivery',
        summary: 'The implementation plan measures whether this intervention was delivered as designed.',
      });
      if (created) {
        effects.push({
          ruleId: FIDELITY_RULE_IDS.LINKED,
          action: 'linked',
          targetType: interventionType,
          targetId: plan.interventionId,
          summary: `Linked implementation plan to the ${plan.interventionType} record it measures.`,
        });
      }
    }
  }

  if (plan.studyId && (draft.impactStudies || []).some((row) => row && row.id === plan.studyId)) {
    const created = linkPlan(ctx, draft, plan, {
      targetType: 'impact',
      targetId: plan.studyId,
      relation: 'informs',
      summary: 'The delivery reading informs the impact study it belongs to.',
    });
    if (created) {
      effects.push({
        ruleId: FIDELITY_RULE_IDS.LINKED,
        action: 'linked',
        targetType: 'impact',
        targetId: plan.studyId,
        summary: 'Linked implementation plan to its pre-registered impact study.',
      });
    }
  }

  if (plan.ownerId && activePeople(draft).some((person) => person.id === plan.ownerId) && type === FIDELITY_DECLARED_EVENT) {
    const created = linkPlan(ctx, draft, plan, {
      targetType: 'person',
      targetId: plan.ownerId,
      relation: 'stewards',
      summary: 'The owner is accountable for delivery, not for the outcome.',
    });
    if (created) {
      effects.push({
        ruleId: FIDELITY_RULE_IDS.LINKED,
        action: 'linked',
        targetType: 'person',
        targetId: plan.ownerId,
        summary: 'Linked the plan to its accountable owner.',
      });
    }
  }
  return effects;
}

/* -------------------------------------------------------- RULE-FID-02 */

function disagreementPrompt(draft, ctx, plan, reading) {
  const effects = [];
  const worst = reading.disagreements.find((row) => row.key !== 'adaptation');
  if (!worst) return effects;
  const person = (draft.people || []).find((row) => row && row.id === worst.attested?.byId)
    || ownerFor(draft, plan);
  const tag = `FID:${plan.id}:${worst.key}`;
  const text = `On “${plan.title.slice(0, 60)}” your ${FIDELITY_STAGE_BY_KEY[worst.key]?.label.toLowerCase() || worst.key} reading and the records disagree (${(AGREEMENT_LABELS[worst.agreement] || '').toLowerCase()}). Which deliveries never got logged?`;
  if (addTalkingPoint(person, text, tag)) {
    effects.push({
      ruleId: FIDELITY_RULE_IDS.DISAGREEMENT,
      action: 'updated',
      targetType: 'person',
      targetId: person.id,
      summary: 'Queued one blameless question about work that may not have been logged.',
    });
  }
  return effects;
}

/* -------------------------------------------------------- RULE-FID-03 */

function underDeliveredPropagation(draft, ctx, plan, reading) {
  const effects = [];
  if (!reading.underExposed) return effects;
  const tag = `FID-UD:${plan.id}`;
  if (hasMarker(draft.decisions, 'question', tag)) return effects;

  const today = dayKey(ctx.now);
  const weakest = remediationStage(reading);
  const exposure = reading.exposurePct ?? 0;
  const decision = decisionRecord(ctx, {
    title: `Repair delivery of “${plan.title}” before judging the result`.slice(0, 200),
    question: `Measured exposure was ${exposure}% (reach ${reading.components.reachPct ?? '—'}% × dose ${reading.components.dosePct ?? '—'}% × quality ${reading.components.fidelityPct ?? '—'}%), below the ${Math.round(FIDELITY_UNDEREXPOSED * 100)}% floor. A programme this under-delivered has not been tested, so its outcome cannot settle anything. Do you repair the delivery, re-scope the intervention to what actually happened, or stop? ${marker(tag)}`,
    options: [
      [
        `Repair ${weakest?.label?.toLowerCase() || 'delivery'} and run one more window`,
        `Targets the binding constraint the records actually name: ${weakest?.label || 'delivery'}. Keeps the hypothesis intact, so the second window is a real test.`,
        'Costs a second window, and the first window is already spent. If the constraint is capacity, this competes with everything else that is under-resourced.',
      ],
      [
        'Re-scope the intervention to the delivery that actually happened',
        'Honest and cheaper: the smaller intervention becomes the intervention, and the hypothesis is re-declared to match it.',
        'A smaller intervention often cannot move the metric, so the next result may be underpowered rather than informative.',
      ],
      [
        'Stop and record the delivery failure',
        'Sometimes the useful finding is that the organisation could not run the programme at all — that is a fact about capacity, not about the idea.',
        'Leaves the original question unanswered, and the answer may be needed to justify the next attempt.',
      ],
      [
        'Accept the under-delivery and read the outcome anyway',
        'Permissible when the direction is unambiguous, but it must be recorded as a weak test.',
        'Risks the most expensive error in performance management: killing a good idea because the organisation never actually ran it.',
      ],
    ],
    reviewOn: addDays(today, 21),
    rationaleHint: `Generated from the implementation record on ${today}. Exposure is reach × dose × quality, all derived from dated records; it is a delivery measurement, not an outcome claim.`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  linkPlan(ctx, draft, plan, {
    targetType: 'decision',
    targetId: decision.id,
    relation: 'remediates',
    ruleId: FIDELITY_RULE_IDS.UNDER_DELIVERED,
    summary: 'The delivery reading opened this repair decision.',
  });
  effects.push({
    ruleId: FIDELITY_RULE_IDS.UNDER_DELIVERED,
    action: 'created',
    targetType: 'decision',
    targetId: decision.id,
    summary: `Opened one DACI delivery-repair decision at ${exposure}% measured exposure.`,
  });

  const owner = ownerFor(draft, plan);
  if (owner) {
    const task = delegationRecord(ctx, {
      personId: owner.id,
      title: `Fix ${weakest?.label?.toLowerCase() || 'delivery'} on “${plan.title}”`.slice(0, 200),
      expectedOutcome: `Move ${weakest?.label || 'the weakest stage'} above the declared floor and record the evidence in the plan. Current reading: ${weakest?.observed?.detail || 'no record yet'}. The task is to change delivery, not to change the number.`,
      support: `Generated by ${FIDELITY_RULE_IDS.UNDER_DELIVERED} from plan “${plan.title}”. Marker ${marker(tag)}. No individual is assessed by this task.`,
      dueOn: addDays(today, 21),
    });
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.push(task);
    ensureEntityLink(draft, {
      sourceType: 'fidelity',
      sourceId: plan.id,
      targetType: 'delegation',
      targetId: task.id,
      relation: 'remediates',
      ruleId: FIDELITY_RULE_IDS.UNDER_DELIVERED,
      summary: 'This owned task repairs the delivery shortfall the plan recorded.',
    }, { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() });
    ensureEntityLink(draft, {
      sourceType: 'decision',
      sourceId: decision.id,
      targetType: 'delegation',
      targetId: task.id,
      relation: 'tracks-followup',
      ruleId: FIDELITY_RULE_IDS.UNDER_DELIVERED,
      summary: 'Delivery repair required by the fidelity decision.',
    }, { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() });
    effects.push({
      ruleId: FIDELITY_RULE_IDS.UNDER_DELIVERED,
      action: 'created',
      targetType: 'delegation',
      targetId: task.id,
      summary: `Opened one owned remediation task on ${weakest?.label?.toLowerCase() || 'delivery'}.`,
    });
    if (addTalkingPoint(owner, `What made “${plan.title.slice(0, 50)}” hard to deliver at the planned dose?`, tag)) {
      effects.push({
        ruleId: FIDELITY_RULE_IDS.UNDER_DELIVERED,
        action: 'updated',
        targetType: 'person',
        targetId: owner.id,
        summary: 'Queued one blameless question about the delivery constraint, not the person.',
      });
    }
  }
  return effects;
}

/* -------------------------------------------------------- RULE-FID-04 */

function overduePropagation(draft, ctx) {
  const effects = [];
  const today = dayKey(ctx.now);
  for (const plan of (draft.fidelityPlans || [])) {
    if (!plan || plan.status !== 'active') continue;
    const overdue = (plan.stages || []).filter((stage) => stage && stage.targetOn && !stage.attested && stage.targetOn < today);
    if (!overdue.length) continue;
    const owner = ownerFor(draft, plan);
    if (!owner) continue;
    const tag = `FID-OD:${plan.id}`;
    if (hasMarker(draft.delegations, 'support', tag)) continue;
    const task = delegationRecord(ctx, {
      personId: owner.id,
      title: `Record the missing delivery checkpoints on “${plan.title}”`.slice(0, 200),
      expectedOutcome: `${overdue.length} checkpoint(s) passed without a reading: ${overdue.map((stage) => FIDELITY_STAGE_BY_KEY[stage.key]?.label || stage.key).join(', ')}. Record what actually happened, or attest that it did not. An unattested checkpoint is a missing reading, not a failure.`,
      support: `Generated by ${FIDELITY_RULE_IDS.OVERDUE} on an explicit scan. Marker ${marker(tag)}. Nothing is scored against any person.`,
      dueOn: addDays(today, 7),
    });
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.push(task);
    ensureEntityLink(draft, {
      sourceType: 'fidelity',
      sourceId: plan.id,
      targetType: 'delegation',
      targetId: task.id,
      relation: 'remediates',
      ruleId: FIDELITY_RULE_IDS.OVERDUE,
      summary: 'This owned task closes the missing readings on the plan.',
    }, { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() });
    effects.push({
      ruleId: FIDELITY_RULE_IDS.OVERDUE,
      action: 'created',
      targetType: 'delegation',
      targetId: task.id,
      summary: `Opened one owned task for ${overdue.length} overdue fidelity checkpoint(s).`,
    });
  }
  return effects;
}

/* -------------------------------------------------------- RULE-FID-05 */

function studySnapshot(draft, ctx) {
  const effects = [];
  const studyId = ctx.event?.entityId;
  if (!studyId) return effects;
  const study = (draft.impactStudies || []).find((row) => row && row.id === studyId);
  if (!study || study.status !== 'scored') return effects;
  if (study.implementationSnapshot) return effects;
  const plan = (draft.fidelityPlans || []).find((row) => row && row.studyId === studyId && row.status !== 'abandoned');
  if (!plan) {
    study.implementationSnapshot = {
      version: 1,
      capturedAt: ctx.now.toISOString(),
      status: 'no-linked-plan',
    };
    return effects;
  }
  const reading = observeFidelity(plan, draft, ctx.now);
  const effect = implementationEffect(reading, study.evaluation);
  const enriched = { ...reading, effect };
  const snapshot = buildImplementationSnapshot(enriched, study.evaluation, { capturedAt: ctx.now.toISOString() });
  study.implementationSnapshot = {
    ...snapshot,
    status: reading.instrument ? 'observed' : 'not-instrumented',
  };
  effects.push({
    ruleId: FIDELITY_RULE_IDS.STUDY_SNAPSHOT,
    action: 'updated',
    targetType: 'impact',
    targetId: study.id,
    summary: `Froze the delivery reading onto the scored study (${reading.exposurePct ?? '—'}% exposure, ${reading.grade.label.toLowerCase()}).`,
  });
  return effects;
}

/* ------------------------------------------------------------- the rule */

function shouldRun(event) {
  const type = eventTypeOf(event);
  if (type === FIDELITY_DECLARED_EVENT || type === FIDELITY_UPDATED_EVENT) return 'link';
  if (type === FIDELITY_ATTESTED_EVENT) return 'attested';
  if (type === FIDELITY_SETTLED_EVENT) return 'settled';
  if (type === FIDELITY_SCAN_EVENT) return 'scan';
  if (type === 'impact.scored') return 'study';
  return null;
}

export function fidelityRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event) return [];
  const mode = shouldRun(event);
  if (!mode) return [];
  // Pause semantics match every other module: `fidelityAutoPropagate: false`
  // suppresses automatic fan-out, but an explicit human scan always runs.
  if (draft.settings?.fidelityAutoPropagate === false && mode !== 'scan') return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const ruleCtx = {
    now,
    event,
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
    draft,
  };
  const effects = [];
  const plan = event.entityId
    ? (draft.fidelityPlans || []).find((row) => row && row.id === event.entityId)
    : null;

  try {
    if (mode === 'link' && plan) {
      effects.push(...linkPropagation(draft, ruleCtx, plan));
    } else if (mode === 'attested' && plan) {
      const reading = observeFidelity(plan, draft, now);
      effects.push(...disagreementPrompt(draft, ruleCtx, plan, reading));
    } else if (mode === 'settled' && plan) {
      const reading = observeFidelity(plan, draft, now);
      effects.push(...underDeliveredPropagation(draft, ruleCtx, plan, reading));
    } else if (mode === 'scan') {
      effects.push(...overduePropagation(draft, ruleCtx));
      for (const row of (draft.fidelityPlans || [])) {
        if (row && row.status !== 'abandoned') effects.push(...linkPropagation(draft, ruleCtx, row));
      }
    } else if (mode === 'study') {
      effects.push(...studySnapshot(draft, ruleCtx));
    }
  } finally {
    // no-op: the engine owns the savepoint; this rule never swallows errors
  }

  for (const effect of effects) {
    if (typeof ctx.logEvent === 'function') {
      ctx.logEvent({
        type: 'automation.step',
        entity: effect.targetType || 'workspace',
        entityId: effect.targetId || '',
        summary: `[${effect.ruleId}] ${effect.summary}`.slice(0, 300),
      });
    }
  }
  return effects;
}
