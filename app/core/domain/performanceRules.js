/**
 * app/core/domain/performanceRules.js — the post-commit side of the Performance
 * Recovery terminal (Schema v62) on the shared rule spine (ADR-0008).
 *
 * The engine can tell a leader that a plan is unsupported. That is a sentence on
 * a page until the spine turns it into owned, dated work. These rules do that,
 * and they deliberately open *support*, never sanction:
 *
 *   RULE-PERF-01  `performance.concern.created` / `.updated`
 *                 No recorded expectation → one blameless 1:1 prompt and one
 *                 owned, dated task to write and communicate it. A person
 *                 cannot be held to a standard nobody ever stated.
 *
 *   RULE-PERF-02  `performance.observation.logged`
 *                 The evidence floor is met but no two-way conversation is
 *                 recorded → one blameless prompt and one owned task to hold
 *                 the conversation. Voice comes before verdict.
 *
 *   RULE-PERF-03  `performance.plan.adopted`
 *                 One DACI decision about the support mechanism (never about the
 *                 person), one typed link from the concern to the person, one
 *                 from the decision to the concern, and one owned dated
 *                 check-in on the plan's review date.
 *
 *   RULE-PERF-04  `performance.review.recorded`
 *                 A plan reviewed as not met opens exactly one DACI decision
 *                 naming the next *process* step. The options are support
 *                 changes, objective revision and involving a people partner.
 *                 There is no "exit" option, and the app never takes an adverse
 *                 action.
 *
 *   RULE-PERF-05  `performance.scan`
 *                 A review date that has passed without an outcome becomes one
 *                 owned task, once.
 *
 * Every write is marker-idempotent, deterministic and audited. Nothing here
 * writes a score, a rating or a judgement about a person.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  PERFORMANCE_DEFAULTS,
  assessConcern,
  conventionsFromSettings,
} from './performance.js';

export const PERFORMANCE_RULE_VERSION = 1;

export const PERFORMANCE_RULE_IDS = Object.freeze({
  EXPECTATION: 'RULE-PERF-01',
  VOICE: 'RULE-PERF-02',
  PLAN: 'RULE-PERF-03',
  REVIEW: 'RULE-PERF-04',
  SCAN: 'RULE-PERF-05',
});

export const PERFORMANCE_EVENTS = Object.freeze({
  CREATED: 'performance.concern.created',
  UPDATED: 'performance.concern.updated',
  OBSERVED: 'performance.observation.logged',
  PLAN: 'performance.plan.adopted',
  REVIEWED: 'performance.review.recorded',
  SCAN: 'performance.scan',
});

const MAX_TOPICS = 40;

function str(value, fallback = '') {
  return typeof value === 'string' && value ? value : fallback;
}

function makeIdFactory(ctx) {
  if (typeof ctx.idFactory === 'function') return ctx.idFactory;
  let seq = 0;
  return (prefix) => `${prefix}-${(seq += 1)}`;
}

function hasMarker(concern, tag) {
  // Markers are stored bare (`RULE-PERF-01:<concernId>`) and the older prompt
  // rows store the bracketed form. Check for the tag itself rather than only the
  // bracketed token: an idempotency guard that misses its own marker re-fires on
  // every edit, which is exactly the bug this guard exists to prevent.
  return (concern.markers || []).some((marker) => typeof marker === 'string' && marker.includes(tag));
}

function addMarker(concern, tag) {
  if (!Array.isArray(concern.markers)) concern.markers = [];
  if (!concern.markers.includes(tag)) concern.markers.push(tag);
}

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function note(concern, ctx, source, text) {
  if (!Array.isArray(concern.notes)) concern.notes = [];
  concern.notes.push({
    at: ctx.now.toISOString(),
    source,
    text: String(text).slice(0, 900),
  });
  if (concern.notes.length > 20) concern.notes.splice(0, concern.notes.length - 20);
}

function talkingPoint(draft, personId, text, tag) {
  const person = (draft.people || []).find((row) => row && row.id === personId);
  if (!person) return false;
  const token = `[${tag}]`;
  person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
  if (person.talkingPoints.some((row) => String(row).includes(token))) return false;
  // Marker appended before the slice: the earlier version of a rule in this
  // codebase truncated after the marker and re-appended forever.
  const budget = Math.max(20, 200 - token.length - 1);
  const trimmed = String(text).length > budget ? `${String(text).slice(0, budget - 1).trimEnd()}…` : String(text);
  person.talkingPoints = [...person.talkingPoints, `${trimmed} ${token}`].slice(-MAX_TOPICS);
  return true;
}

/** The accountable owner is a real person, or nobody. Never invented. */
function ownerPersonId(draft, concern) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  if (concern.ownerId) {
    const direct = people.find((row) => row && row.id === concern.ownerId);
    if (direct) return direct.id;
  }
  const leaderName = str(draft.settings && draft.settings.leaderName).trim().toLowerCase();
  if (!leaderName) return null;
  const match = people.find((row) => row && row.status !== 'archived' && String(row.name || '').trim().toLowerCase() === leaderName);
  return match ? match.id : null;
}

function delegationRecord(ctx, draft, { personId, title, expectedOutcome, support, dueOn, tag }) {
  return {
    id: ctx.idFactory('delegation'),
    personId,
    title: String(title).slice(0, 200),
    expectedOutcome: String(expectedOutcome).slice(0, 2000),
    authority: 'act-inform',
    support: `${String(support).slice(0, 1800)} [${tag}]`,
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
}

function decisionRecord(ctx, draft, { title, question, options, reviewOn, rationale }) {
  const leader = str(draft.settings && draft.settings.leaderName);
  return {
    id: ctx.idFactory('dec'),
    title: String(title).slice(0, 200),
    question: String(question).slice(0, 2000),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: leader.slice(0, 120),
    approver: leader.slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '',
    rationale: String(rationale).slice(0, 4000),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

function link(ctx, draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }) {
  const { created } = ensureEntityLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  });
  return created;
}

function findConcern(draft, id) {
  return (Array.isArray(draft.performanceConcerns) ? draft.performanceConcerns : [])
    .find((row) => row && row.id === id) || null;
}

/* ------------------------------------------------------------- RULE-PERF-01 */

function ensureExpectation(draft, ctx, concern) {
  if (concern.standard && concern.standard.recordedOn) return [];
  if (concern.standard && concern.standard.source && concern.standard.source !== 'none') return [];
  const tag = `${PERFORMANCE_RULE_IDS.EXPECTATION}:${concern.id}`;
  if (hasMarker(concern, tag)) return [];
  addMarker(concern, tag);
  const effects = [];
  const ownerId = ownerPersonId(draft, concern);
  const dueOn = dayKey(addDays(ctx.now, 3));
  if (ownerId) {
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    const delegation = delegationRecord(ctx, draft, {
      personId: ownerId,
      title: `Write down the expectation behind “${String(concern.label || '').slice(0, 80)}”`,
      expectedOutcome: 'One specific, observable expectation with a date it was communicated, recorded on the concern. The point is not paperwork: without it, nothing that follows can be fair.',
      support: `Opened by ${PERFORMANCE_RULE_IDS.EXPECTATION} because the concern has no dated expectation. RULE-PERF-01 always opens support work, never a sanction.`,
      dueOn,
      tag,
    });
    draft.delegations.unshift(delegation);
    effects.push(effect(PERFORMANCE_RULE_IDS.EXPECTATION, 'created', 'delegation', delegation.id,
      'Opened one owned task to record and communicate the missing expectation.'));
  }
  if (concern.personId) {
    const added = talkingPoint(draft, concern.personId,
      'Before anything else: say what good looks like and by when, then ask them to play it back. Record the date.',
      tag);
    if (added) effects.push(effect(PERFORMANCE_RULE_IDS.EXPECTATION, 'updated', 'person', concern.personId,
      'Queued one blameless 1:1 prompt about stating the expectation.'));
  }
  if (!effects.length) {
    note(concern, ctx, PERFORMANCE_RULE_IDS.EXPECTATION,
      'No owner could be resolved for the expectation task, so the prompt was recorded here instead. Set the leader name or a concern owner to get owned work.');
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-PERF-02 */

function ensureVoice(draft, ctx, concern) {
  const assessment = assessConcern(draft, concern, ctx.now, ctx.settings || {});
  if (!assessment.evidence.meetsFloor) return [];
  const voiceRule = assessment.justice.rules.find((row) => row.id === 'voice');
  if (!voiceRule || voiceRule.status === 'met') return [];
  const tag = `${PERFORMANCE_RULE_IDS.VOICE}:${concern.id}`;
  if (hasMarker(concern, tag)) return [];
  addMarker(concern, tag);
  const effects = [];
  const ownerId = ownerPersonId(draft, concern);
  if (ownerId) {
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    const delegation = delegationRecord(ctx, draft, {
      personId: ownerId,
      title: `Hold the two-way conversation about “${String(concern.label || '').slice(0, 80)}”`,
      expectedOutcome: 'A recorded conversation after the first observation, in which the person’s own account is written down. Ask before telling: what do you see, what is in the way, what would help.',
      support: `Opened by ${PERFORMANCE_RULE_IDS.VOICE}: ${assessment.evidence.liveCount} observation(s) meet the evidence floor and no two-way conversation is recorded after the first one.`,
      dueOn: dayKey(addDays(ctx.now, 5)),
      tag,
    });
    draft.delegations.unshift(delegation);
    effects.push(effect(PERFORMANCE_RULE_IDS.VOICE, 'created', 'delegation', delegation.id,
      'Opened one owned task to hold the missing two-way conversation.'));
  }
  if (concern.personId) {
    const added = talkingPoint(draft, concern.personId,
      'Ask, do not tell: “What do you see from where you sit? What is getting in the way? What would help?” Write their answer in their words.',
      tag);
    if (added) effects.push(effect(PERFORMANCE_RULE_IDS.VOICE, 'updated', 'person', concern.personId,
      'Queued one blameless 1:1 prompt to hear the person’s account.'));
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-PERF-03 */

function attachPlan(draft, ctx, concern) {
  const plan = concern.plan;
  if (!plan) return [];
  const tag = `${PERFORMANCE_RULE_IDS.PLAN}:${plan.adoptedOn || concern.id}`;
  if (hasMarker(concern, tag)) return [];
  addMarker(concern, tag);
  const effects = [];
  if (concern.personId) {
    if (link(ctx, draft, {
      sourceType: 'perfconcern',
      sourceId: concern.id,
      targetType: 'person',
      targetId: concern.personId,
      relation: 'concerns',
      ruleId: PERFORMANCE_RULE_IDS.PLAN,
      summary: 'This concern is about a gap, not a rating. The record measures the leader’s process.',
    })) {
      effects.push(effect(PERFORMANCE_RULE_IDS.PLAN, 'linked', 'perfconcern', concern.id, 'Linked the concern to the person.'));
    }
  }
  const reviewOn = plan.reviewOn || dayKey(addDays(ctx.now, conventionsFromSettings(ctx.settings || {}).reviewHorizonDays));
  const decision = decisionRecord(ctx, draft, {
    title: `How will “${String(concern.label || '').slice(0, 80)}” be supported and reviewed?`,
    question: `The plan was adopted on ${plan.adoptedOn || dayKey(ctx.now)} with a written ${plan.prediction?.probabilityPct ?? '—'}% probability of meeting it by ${reviewOn}. What support mechanism makes that plausible, and what will you change if the first review shows no movement?`,
    options: [
      ['Keep the support and hold the date', 'The remedy matches the diagnosis and needs a fair window before anything is concluded.', 'A plan that is never reviewed is a hope; this option commits to the date.'],
      ['Change the support', 'If the first weeks show the remedy is not biting, change the remedy — not the person.', 'Changing mid-window makes the plan harder to grade honestly.'],
      ['Revise the objectives', 'A narrower, measurable objective is often the honest fix when the original was too broad.', 'Revising objectives after adoption can look like moving the goalposts; record why.'],
    ],
    reviewOn,
    rationale: `Opened by ${PERFORMANCE_RULE_IDS.PLAN} when the plan was adopted. This decision is about the support mechanism and the review, never about the person. Frozen prediction: ${plan.prediction?.probabilityPct ?? '—'}% by ${reviewOn}.`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.unshift(decision);
  effects.push(effect(PERFORMANCE_RULE_IDS.PLAN, 'created', 'decision', decision.id,
    'Opened one DACI decision about the support mechanism.'));
  link(ctx, draft, {
    sourceType: 'decision',
    sourceId: decision.id,
    targetType: 'perfconcern',
    targetId: concern.id,
    relation: 'screens',
    ruleId: PERFORMANCE_RULE_IDS.PLAN,
    summary: 'The support mechanism this plan depends on.',
  });
  const ownerId = ownerPersonId(draft, concern);
  if (ownerId) {
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    const delegation = delegationRecord(ctx, draft, {
      personId: ownerId,
      title: `Review “${String(concern.label || '').slice(0, 80)}” on ${reviewOn}`,
      expectedOutcome: 'Record met, partial or not met against the plan’s objectives, with the evidence. The frozen prediction is scored from that record and never edited.',
      support: `Opened by ${PERFORMANCE_RULE_IDS.PLAN} at adoption so the review date has an owner. A plan with no owner for its review is a plan that quietly expires.`,
      dueOn: reviewOn,
      tag: `${PERFORMANCE_RULE_IDS.PLAN}:review`,
    });
    draft.delegations.unshift(delegation);
    effects.push(effect(PERFORMANCE_RULE_IDS.PLAN, 'created', 'delegation', delegation.id,
      'Opened one owned review task dated to the plan’s review date.'));
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-PERF-04 */

function nextStep(draft, ctx, concern) {
  if (concern.outcome?.verdict !== 'not-met') return [];
  const tag = `${PERFORMANCE_RULE_IDS.REVIEW}:${concern.id}:${concern.outcome?.reviewedOn || concern.id}`;
  if (hasMarker(concern, tag)) return [];
  addMarker(concern, tag);
  const reviewOn = dayKey(addDays(ctx.now, 14));
  const decision = decisionRecord(ctx, draft, {
    title: `Next process step for “${String(concern.label || '').slice(0, 80)}”`,
    question: `The plan was reviewed as not met on ${concern.outcome?.reviewedOn || dayKey(ctx.now)}. What changes in the process — not in the person’s worth — and by when? The app does not recommend an outcome and takes no adverse action.`,
    options: [
      ['Change the support and extend', 'The remedy did not bite. Change what the leader provides and give it a defined window.', 'Only honest if the diagnosis was right; if it was wrong, revisit the cause first.'],
      ['Revise the objectives', 'The objectives were not achievable as written, or measured the wrong thing.', 'A revision must be recorded with the reason, or it looks like moving the goalposts.'],
      ['Involve a people partner', 'Bring in HR or a peer to review the record and the process before any next step.', 'Slower, and it hands part of the decision to someone who was not there.'],
    ],
    reviewOn,
    rationale: `Opened by ${PERFORMANCE_RULE_IDS.REVIEW} when a plan was reviewed as not met. There is deliberately no exit option: the app has no authority to end anyone’s employment and says so.`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.unshift(decision);
  link(ctx, draft, {
    sourceType: 'decision',
    sourceId: decision.id,
    targetType: 'perfconcern',
    targetId: concern.id,
    relation: 'screens',
    ruleId: PERFORMANCE_RULE_IDS.REVIEW,
    summary: 'The next process step after a plan was reviewed as not met.',
  });
  return [effect(PERFORMANCE_RULE_IDS.REVIEW, 'created', 'decision', decision.id,
    'Opened one decision about the next process step after a not-met review.')];
}

/* ------------------------------------------------------------- RULE-PERF-05 */

function scanOverdue(draft, ctx) {
  const effects = [];
  // Reconciliation first: a plan adopted while automatic propagation was paused
  // has no decision, no graph links and no check-in. The explicit scan is the
  // leader asking the workspace to catch up, so it adopts the missed work here
  // rather than leaving a permanent hole behind a pause.
  for (const concern of Array.isArray(draft.performanceConcerns) ? draft.performanceConcerns : []) {
    if (!concern || !concern.plan) continue;
    const planTag = `${PERFORMANCE_RULE_IDS.PLAN}:${concern.plan.adoptedOn || concern.id}`;
    if (hasMarker(concern, planTag)) continue;
    effects.push(...attachPlan(draft, ctx, concern));
  }
  for (const concern of Array.isArray(draft.performanceConcerns) ? draft.performanceConcerns : []) {
    if (!concern || !concern.plan || concern.outcome) continue;
    if (concern.status !== 'plan' && concern.status !== 'monitoring') continue;
    const reviewOn = concern.plan.reviewOn;
    if (!reviewOn || dayKey(ctx.now) <= reviewOn) continue;
    const tag = `${PERFORMANCE_RULE_IDS.SCAN}:${concern.id}:${reviewOn}`;
    if (hasMarker(concern, tag)) continue;
    addMarker(concern, tag);
    const ownerId = ownerPersonId(draft, concern);
    if (!ownerId) continue;
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    const delegation = delegationRecord(ctx, draft, {
      personId: ownerId,
      title: `Record the overdue review for “${String(concern.label || '').slice(0, 80)}”`,
      expectedOutcome: `The review was due ${reviewOn}. Record what actually happened against the plan’s objectives so the frozen prediction can be scored.`,
      support: `Opened by ${PERFORMANCE_RULE_IDS.SCAN} when an explicit scan found a passed review with no outcome.`,
      dueOn: dayKey(addDays(ctx.now, 2)),
      tag,
    });
    draft.delegations.unshift(delegation);
    effects.push(effect(PERFORMANCE_RULE_IDS.SCAN, 'created', 'delegation', delegation.id,
      'Opened one owned task for an overdue plan review.'));
  }
  return effects;
}

/* ---------------------------------------------------------------- the rule */

export function performanceRule(draft, ctx = {}) {
  const { event, now = new Date(), out = [], logEvent, warnings = [] } = ctx;
  if (!event || !draft) return [];
  const type = str(event.type);
  const known = Object.values(PERFORMANCE_EVENTS);
  if (!known.includes(type)) return [];

  const settings = { ...PERFORMANCE_DEFAULTS, ...(ctx.settings || {}), ...(draft.settings || {}) };
  // An explicit scan is never suppressed; automatic work respects the pause.
  if (settings.perfAutoPropagate === false && type !== PERFORMANCE_EVENTS.SCAN) return [];

  const concern = event.entityId ? findConcern(draft, event.entityId) : null;
  let effects = [];

  if ((type === PERFORMANCE_EVENTS.CREATED || type === PERFORMANCE_EVENTS.UPDATED) && concern) {
    effects = ensureExpectation(draft, { ...ctx, settings }, concern);
  } else if (type === PERFORMANCE_EVENTS.OBSERVED && concern) {
    effects = ensureVoice(draft, { ...ctx, settings }, concern);
  } else if (type === PERFORMANCE_EVENTS.PLAN && concern) {
    effects = attachPlan(draft, { ...ctx, settings }, concern);
  } else if (type === PERFORMANCE_EVENTS.REVIEWED && concern) {
    effects = nextStep(draft, { ...ctx, settings }, concern);
  } else if (type === PERFORMANCE_EVENTS.SCAN) {
    effects = scanOverdue(draft, { ...ctx, settings });
  }

  if (Array.isArray(warnings) && !effects.length && type !== PERFORMANCE_EVENTS.SCAN) {
    // Silence is correct when the rule had nothing to do; this branch exists
    // only so a future maintainer does not read the empty return as a bug.
  }
  for (const entry of effects) {
    if (typeof logEvent === 'function') {
      logEvent({
        type: 'automation.propagated',
        entity: 'performance',
        entityId: entry.targetId || '',
        summary: entry.summary,
      });
    }
    out.push(entry);
  }
  return effects;
}

performanceRule.id = 'performance';
performanceRule.label = 'Performance recovery propagation (RULE-PERF-01..05)';
performanceRule.module = 'performanceRules.js';
performanceRule.triggers = Object.values(PERFORMANCE_EVENTS);
performanceRule.effect = (draft, event, context = {}) => performanceRule(draft, { ...context, event });
Object.freeze(performanceRule);

export default performanceRule;
