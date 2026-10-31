/**
 * The Deferral Option Terminal's three post-commit rules (Schema v68).
 *
 * RULE-DRO-01  a frozen frame maps to its decision and — when the tree says
 *              holding the option pays — opens exactly one owned task to watch
 *              the exercise boundary. Nothing is chosen and no date is moved.
 * RULE-DRO-02  an explicit scan reconciles only this module's edges, opens due
 *              grading work, and turns a window that expired with the call
 *              still open into ONE governed decision per ISO week.
 * RULE-DRO-03  a graded surprise (Brier ≥ 0.25) opens one blameless process
 *              task. It never rates a person.
 *
 * All three are marker-idempotent and write inside the caller's transaction.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  DEFERRAL_EVENTS,
  DEFERRAL_RULE_IDS,
  deferralConventions,
} from './deferralOption.js';

function ownerOf(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  return people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId))) || null;
}

function addMarker(draft, tag) {
  draft.deferralMarkers = Array.isArray(draft.deferralMarkers) ? draft.deferralMarkers : [];
  if (draft.deferralMarkers.includes(tag)) return false;
  draft.deferralMarkers.push(tag);
  if (draft.deferralMarkers.length > 400) {
    draft.deferralMarkers.splice(0, draft.deferralMarkers.length - 400);
  }
  return true;
}

function seen(draft, tag) {
  return (draft.deferralMarkers || []).includes(tag);
}

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function link(draft, ctx, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(draft, {
    sourceType: 'optionframe', sourceId, targetType, targetId, relation, ruleId, summary,
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function newTask(ctx, ownerId, title, outcome, support, tag, dueDays = 7) {
  return {
    id: ctx.idFactory('delegation'),
    personId: ownerId,
    title: title.slice(0, 200),
    expectedOutcome: outcome.slice(0, 2000),
    authority: 'act-inform',
    support: `${support.slice(0, 1800)} [${tag}]`,
    delegatedOn: dayKey(ctx.now),
    dueOn: dayKey(addDays(ctx.now, dueDays)),
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

function newDecision(ctx, ownerName, title, question, currency, valueNow) {
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 2000),
    date: dayKey(ctx.now),
    reversibility: 'irreversible',
    driver: ownerName.slice(0, 120),
    approver: ownerName.slice(0, 120),
    contributors: '',
    informed: '',
    options: [
      { id: ctx.idFactory('opt'), label: 'Make the call now', pros: 'Stops the carry cost and keeps the deadline credible.', cons: 'Gives up the remaining flexibility.' },
      { id: ctx.idFactory('opt'), label: 'Re-scope the decision', pros: 'A smaller commitment may fit the uncertainty.', cons: 'Needs a new frame and a new deadline.' },
      { id: ctx.idFactory('opt'), label: 'Close it deliberately', pros: 'Records that the option lapsed by choice.', cons: 'The work behind the decision is abandoned.' },
    ],
    chosen: '',
    rationale: `Opened by ${DEFERRAL_RULE_IDS.SCAN}: the deferral window expired with the call still open. ${currency} ${Number(valueNow).toLocaleString('en-US', { maximumFractionDigits: 2 })} of stake was carried through that window. The leader chooses; the rule never does.`,
    reviewOn: dayKey(addDays(ctx.now, 7)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/* ---------------------------------------------------------------- DRO-01 */

function freezeRule(draft, ctx) {
  const record = (draft.deferralFrames || []).find((r) => r && r.id === ctx.event?.entityId);
  if (!record) return [];
  const effects = [];
  const decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  const decision = decisions.find((d) => d && d.id === record.decisionId);
  if (!decision) return effects;
  const tag = `${DEFERRAL_RULE_IDS.FROZEN}:${record.id}`;
  if (!seen(draft, tag)) {
    addMarker(draft, tag);
    if (link(draft, ctx, record.id, 'decision', record.decisionId, 'defers-decision', DEFERRAL_RULE_IDS.FROZEN,
      'Frozen deferral frame pricing the option to wait; not a choice of option')) {
      effects.push(effect(DEFERRAL_RULE_IDS.FROZEN, 'linked', 'decision', record.decisionId,
        'Mapped one frozen deferral frame to the call it prices.'));
    }
  }
  if (!['wait', 'indifferent'].includes(record.verdict) || !Number.isFinite(record.threshold)) return effects;
  const owner = ownerOf(draft);
  if (!owner) return effects;
  const taskTag = `${DEFERRAL_RULE_IDS.FROZEN}:task:${record.id}`;
  if (seen(draft, taskTag)) return effects;
  addMarker(draft, taskTag);
  const task = newTask(ctx, owner.id,
    'Watch the exercise boundary on a deferred decision',
    `Commit when the stake reaches ${record.currency} ${Number(record.threshold).toLocaleString('en-US', { maximumFractionDigits: 2 })} or abandon the call by ${record.reviewOn}. The frozen frame priced the flexibility at ${record.currency} ${Number(record.premium).toLocaleString('en-US', { maximumFractionDigits: 2 })} against a carry of ${record.currency} ${Number(record.carryPerWeek).toLocaleString('en-US', { maximumFractionDigits: 2 })}/week. Record what actually changed — the trigger, the new information or the new stake.`,
    `${DEFERRAL_RULE_IDS.FROZEN} from the frozen deferral frame. The boundary is a decision rule, not a target to defend; if the stake moves you re-run the frame.`,
    taskTag, Math.max(1, Math.min(30, Math.round(Number(record.horizonDays) || 7))));
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift(task);
  effects.push(effect(DEFERRAL_RULE_IDS.FROZEN, 'created', 'delegation', task.id,
    `Opened one owned boundary-watch task at ${record.currency} ${Number(record.threshold).toLocaleString('en-US', { maximumFractionDigits: 2 })}.`));
  if (link(draft, ctx, record.id, 'delegation', task.id, 'tracks-followup', DEFERRAL_RULE_IDS.FROZEN,
    'Leader-owned watch on the exercise boundary')) {
    effects.push(effect(DEFERRAL_RULE_IDS.FROZEN, 'linked', 'delegation', task.id,
      'Linked the boundary watch to the frozen frame.'));
  }
  return effects;
}

/* ---------------------------------------------------------------- DRO-02 */

function scanRule(draft, ctx) {
  const effects = [];
  const readings = new Set((draft.deferralFrames || []).map((r) => r && r.id).filter(Boolean));
  const collections = { decision: 'decisions', delegation: 'delegations' };
  const before = (draft.links || []).length;
  draft.links = (draft.links || []).filter((l) => {
    if (l?.sourceType !== 'optionframe' || !Object.values(DEFERRAL_RULE_IDS).includes(l.ruleId)) return true;
    if (!readings.has(l.sourceId)) return false;
    const collection = collections[l.targetType];
    return collection ? (draft[collection] || []).some((row) => row?.id === l.targetId) : false;
  });
  if ((draft.links || []).length < before) {
    effects.push(effect(DEFERRAL_RULE_IDS.SCAN, 'reconciled', 'links', '',
      `Removed ${before - (draft.links || []).length} stale deferral edge(s).`));
  }
  const owner = ownerOf(draft);
  if (!owner) return effects;
  const today = dayKey(ctx.now);

  // 1. Due grading work, at most three per scan.
  let gradingTasks = 0;
  for (const record of draft.deferralFrames || []) {
    if (gradingTasks >= 3) break;
    if (!record || record.graded || record.reviewOn > today) continue;
    if (!(draft.decisions || []).some((d) => d && d.id === record.decisionId)) continue;
    const tag = `${DEFERRAL_RULE_IDS.SCAN}:grade:${record.id}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const task = newTask(ctx, owner.id,
      'Grade a frozen deferral frame',
      `The window closed on ${record.reviewOn}. Compare the decision's recorded decidedOn date with the frozen P(commit by deadline) of ${record.predictedCommitByDeadlinePct}% and record the outcome once. Do not backdate the decision or reinterpret the frame.`,
      `${DEFERRAL_RULE_IDS.SCAN}: a frozen prediction is only useful when it is scored.`,
      tag, 5);
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift(task);
    gradingTasks += 1;
    effects.push(effect(DEFERRAL_RULE_IDS.SCAN, 'created', 'delegation', task.id,
      'Opened one owned task to grade a due deferral frame.'));
  }

  // 2. An expired window on an open call becomes one governed decision per week.
  const expired = (draft.deferralFrames || []).filter((record) => record && !record.graded
    && record.reviewOn < today
    && (draft.decisions || []).some((d) => d && d.id === record.decisionId && !String(d.chosen || '').trim()));
  if (!expired.length) return effects;
  const week = weekKey(ctx.now) || today;
  const tag = `${DEFERRAL_RULE_IDS.SCAN}:expired:${week}`;
  if (seen(draft, tag)) return effects;
  addMarker(draft, tag);
  const lead = expired[0];
  const decision = newDecision(ctx, owner.name || draft.settings?.leaderName || '',
    'The deferral window expired — decide, re-scope or close',
    `${expired.length} deferred call(s) passed their window without a recorded decision. The largest carried ${lead.currency} ${Number(lead.valueNow).toLocaleString('en-US', { maximumFractionDigits: 2 })} of stake. Which call is now made, which is re-scoped with a new deadline, and which is closed — and what changed since the frame was frozen?`,
    lead.currency, lead.valueNow);
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.unshift(decision);
  effects.push(effect(DEFERRAL_RULE_IDS.SCAN, 'created', 'decision', decision.id,
    `Opened one DACI decision for ${expired.length} expired deferral window(s).`));
  for (const record of expired.slice(0, 5)) {
    if (link(draft, ctx, record.id, 'decision', decision.id, 'surfaces-impact', DEFERRAL_RULE_IDS.SCAN,
      'Expired window surfaced as a governed choice')) {
      effects.push(effect(DEFERRAL_RULE_IDS.SCAN, 'linked', 'decision', decision.id,
        'Linked an expired frame to the governing decision.'));
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- DRO-03 */

function gradeRule(draft, ctx) {
  const record = (draft.deferralFrames || []).find((r) => r && r.id === ctx.event?.entityId);
  if (!record || !record.graded) return [];
  if (!(record.graded.brier >= 0.25)) return [];
  const owner = ownerOf(draft);
  if (!owner) return [];
  const tag = `${DEFERRAL_RULE_IDS.GRADE}:${record.id}`;
  if (seen(draft, tag)) return [];
  addMarker(draft, tag);
  const task = newTask(ctx, owner.id,
    'Review a missed deferral-timing forecast',
    `The frozen frame expected the call to be committed by ${record.reviewOn} with probability ${record.predictedCommitByDeadlinePct}%, and the recorded outcome was ${record.graded.committedByDeadline ? 'a commit by that date' : 'no commit by that date'} (Brier ${record.graded.brier}). Was the volatility wrong, the boundary wrong, or the follow-through? Record the mechanism before trusting the next wait. This is a forecast/process review, never a rating of a person.`,
    `${DEFERRAL_RULE_IDS.GRADE}: a graded surprise is information about the process, not about anyone's character.`,
    tag, 10);
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift(task);
  return [effect(DEFERRAL_RULE_IDS.GRADE, 'created', 'delegation', task.id,
    'Opened one blameless process task after a graded deferral surprise.')];
}

/* ---------------------------------------------------------------- engine */

/**
 * The rule function itself. It returns its effects so the post-commit engine
 * can trace them; every write happens on the draft it was handed, inside the
 * caller's savepoint.
 */
export { DEFERRAL_EVENTS, DEFERRAL_RULE_IDS };

export function deferralRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const conventions = deferralConventions(ctx.settings || draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = {
    ...ctx,
    now,
    idFactory: ctx.idFactory,
  };
  let effects = [];
  const type = ctx.event.type;
  if (type === DEFERRAL_EVENTS.FROZEN) {
    if (!conventions.autoPropagate) return [];
    effects = freezeRule(draft, scoped);
  } else if (type === DEFERRAL_EVENTS.SCAN) {
    effects = scanRule(draft, scoped);
  } else if (type === DEFERRAL_EVENTS.GRADED) {
    if (!conventions.autoPropagate) return [];
    effects = gradeRule(draft, scoped);
  }
  for (const entry of effects) {
    if (typeof ctx.logEvent === 'function') {
      ctx.logEvent({
        type: 'automation.propagated',
        entity: 'optionframe',
        entityId: entry.targetId || '',
        summary: entry.summary,
      });
    }
    if (Array.isArray(ctx.out)) ctx.out.push(entry);
  }
  return effects;
}

deferralRule.id = 'deferral';
deferralRule.label = 'Deferral option propagation (RULE-DRO-01..03)';
deferralRule.module = 'deferralOptionRules.js';
deferralRule.triggers = Object.values(DEFERRAL_EVENTS);
deferralRule.effect = (draft, event, context = {}) => deferralRule(draft, { ...context, event });
Object.freeze(deferralRule);
