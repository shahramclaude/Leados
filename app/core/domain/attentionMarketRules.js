/**
 * app/core/domain/attentionMarketRules.js — the post-commit side of the
 * Attention Market (Session 82, ADR-0047) on the shared rule spine (ADR-0008).
 *
 * A plan that lives only on its own screen is a spreadsheet with better
 * typography. These rules make the plan structural: the moment it is committed,
 * the obligations it bought become typed nodes attached to the plan, the items
 * it handed off become owned, dated delegations on the named people, and the
 * items it decided to let carry are written into the decision register WITH
 * their price. That last one is the whole point — the cost of doing nothing is
 * the number leaders are never made to write down.
 *
 *  RULE-ATT-01  `attention.committed`
 *               One `allocates` edge from the plan to every record it bought and
 *               one `forgoes` edge to every record it consciously left. Typed,
 *               idempotent, and never a duplicate of an existing edge.
 *
 *  RULE-ATT-02  `attention.committed`
 *               Exactly one owned delegation per item the plan hands off, due on
 *               the plan's review date, with a typed `tracks-followup` edge back
 *               to the plan. An item with no named delegate produces a note, not
 *               an invented owner.
 *
 *  RULE-ATT-03  `attention.committed`
 *               Exactly ONE DACI decision covering the whole forgone list and
 *               its total price — never one decision per dropped item, because
 *               the choice being recorded is "these are what I am letting
 *               carry", which is a single judgement with a single owner.
 *
 *  RULE-ATT-04  `attention.reviewed`
 *               When the review is contradicted — realised value well below the
 *               frozen prediction, or an obligation that was dropped got worse
 *               rather than better — open one owned repair task and one
 *               re-planning note. A plan that missed is information only if
 *               something is done with it.
 *
 * Every write is marker-idempotent, and every write leaves an `automation.step`
 * trace in the append-only event log.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';

export const ATT_RULE_IDS = Object.freeze({
  LINKS: 'RULE-ATT-01',
  DELEGATE: 'RULE-ATT-02',
  FORGO: 'RULE-ATT-03',
  REVIEW: 'RULE-ATT-04',
  SHARED_BARRIER: 'RULE-ATT-05',
});

export const ATT_COMMITTED_EVENT = 'attention.committed';
export const ATT_REVIEWED_EVENT = 'attention.reviewed';

const NOTE_MAX = 900;
const NOTE_CAP = 24;

function hasMarker(rows, field, tag) {
  const token = `[${tag}]`;
  return (rows || []).some((row) => row && typeof row[field] === 'string' && row[field].includes(token));
}

function money(value, currency) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'not priced';
  const code = String(currency || '').trim().toUpperCase();
  return `${code ? `${code} ` : ''}${Math.round(Number(value)).toLocaleString('en-US')}`;
}

function note(plan, { source, text }) {
  plan.notes = Array.isArray(plan.notes) ? plan.notes : [];
  plan.notes.push({
    at: new Date().toISOString(),
    source,
    text: String(text).slice(0, NOTE_MAX),
  });
  if (plan.notes.length > NOTE_CAP) plan.notes.splice(0, plan.notes.length - NOTE_CAP);
}

function mark(plan, tag) {
  plan.markers = Array.isArray(plan.markers) ? plan.markers : [];
  if (!plan.markers.includes(tag)) plan.markers.push(tag);
}

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function linkEntity(ctx, draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }) {
  const { created } = ensureEntityLink(draft, {
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary,
  }, { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() });
  return created;
}

function findPlan(draft, planId) {
  return (Array.isArray(draft.attentionPlans) ? draft.attentionPlans : [])
    .find((row) => row && row.id === planId) || null;
}

/* ------------------------------------------------------------- RULE-ATT-01 */

function attachLinks(draft, ctx, plan) {
  const items = Array.isArray(plan.result?.items) ? plan.result.items : [];
  const forgone = Array.isArray(plan.result?.forgone) ? plan.result.forgone : [];
  const effects = [];
  let created = 0;
  for (const item of items) {
    if (!item || !item.sourceType || !item.sourceId) continue;
    if (linkEntity(ctx, draft, {
      sourceType: 'attention',
      sourceId: plan.id,
      targetType: item.sourceType,
      targetId: item.sourceId,
      relation: 'allocates',
      ruleId: ATT_RULE_IDS.LINKS,
      summary: `Bought ${item.hours} h at ${item.mode === 'delegate' ? `a hand-off to ${item.delegateName}` : 'own time'} in the plan committed ${plan.committedOn}.`,
    })) created += 1;
  }
  for (const item of forgone) {
    if (!item || !item.sourceType || !item.sourceId) continue;
    if (linkEntity(ctx, draft, {
      sourceType: 'attention',
      sourceId: plan.id,
      targetType: item.sourceType,
      targetId: item.sourceId,
      relation: 'forgoes',
      ruleId: ATT_RULE_IDS.LINKS,
      summary: `Consciously left to carry in the plan committed ${plan.committedOn}.`,
    })) created += 1;
  }
  if (created > 0) {
    effects.push(effect(ATT_RULE_IDS.LINKS, 'linked', 'attentionPlan', plan.id,
      `Attached ${created} typed edge(s): ${items.length} bought, ${forgone.length} forgone.`));
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-ATT-02 */

function openDelegations(draft, ctx, plan) {
  const items = (Array.isArray(plan.result?.items) ? plan.result.items : [])
    .filter((item) => item && item.mode === 'delegate');
  if (!items.length) return [];
  const effects = [];
  const dueOn = plan.result?.reviewOn || dayKey(addDays(ctx.now, 7));
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  for (const item of items) {
    if (!item.delegateId) {
      note(plan, {
        source: ATT_RULE_IDS.DELEGATE,
        text: `“${item.title}” was planned as a hand-off but no person was named, so no delegation was opened. Name a person, or plan it as your own work — a hand-off to nobody is a wish.`,
      });
      continue;
    }
    const tag = `${ATT_RULE_IDS.DELEGATE}:${item.id}`;
    if (hasMarker(draft.delegations, 'support', tag)) continue;
    const delegation = {
      id: ctx.idFactory('delegation'),
      personId: item.delegateId,
      title: String(item.title || 'Obligation from the attention plan').slice(0, 200),
      expectedOutcome: String(
        `Own “${item.title}” through to ${item.mode === 'delegate' ? 'resolution' : 'completion'}. `
        + 'The plan measured you at '
        + `${Math.round((item.probability || 0) * 100)}% on-time for this kind of obligation, which is why it was offered to you.`
        + ` If that reading is wrong, say so at the first check-in — correcting it makes next week's plan better.`,
      ).slice(0, 2000),
      authority: 'act-inform',
      support: String(
        `Opened by the attention plan committed ${plan.committedOn}. ${tag} `
        + 'The leader retains decision authority for anything outside this scope.',
      ).slice(0, 2000),
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
    draft.delegations.push(delegation);
    linkEntity(ctx, draft, {
      sourceType: 'attention',
      sourceId: plan.id,
      targetType: 'delegation',
      targetId: delegation.id,
      relation: 'tracks-followup',
      ruleId: ATT_RULE_IDS.DELEGATE,
      summary: 'The owned hand-off created when this attention plan was committed.',
    });
    effects.push(effect(ATT_RULE_IDS.DELEGATE, 'created', 'delegation', delegation.id,
      `Handed “${String(item.title || '').slice(0, 80)}” to ${item.delegateName || item.delegateId}, due ${dueOn}.`));
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-ATT-03 */

function recordForgoing(draft, ctx, plan) {
  const forgone = Array.isArray(plan.result?.forgone) ? plan.result.forgone : [];
  if (!forgone.length) return [];
  const tag = `${ATT_RULE_IDS.FORGO}:${plan.id}`;
  if (hasMarker(Array.isArray(draft.decisions) ? draft.decisions : [], 'rationale', tag)) return [];
  const currency = plan.result?.currency || '';
  const total = forgone.reduce((acc, item) => acc + (Number(item.forgone) || 0), 0);
  const decision = {
    id: ctx.idFactory('dec'),
    title: String(`Let ${forgone.length} obligation(s) carry — ${money(total, currency)} of expected value forgone`).slice(0, 200),
    question: String(
      `The attention plan committed ${plan.committedOn} could buy ${forgone.length} of ${forgone.length + (plan.result?.items?.length || 0)} priced obligations. `
      + `Recorded here so the cost of doing nothing has an owner and a date.\n\nNot funded:\n`
      + forgone.slice(0, 12).map((item) => `• ${item.title} — ${item.hours} h, ${money(item.forgone, item.currency || currency)} of expected protected value.`).join('\n'),
    ).slice(0, 4000),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: String(draft.settings?.leaderName || '').slice(0, 120),
    approver: String(draft.settings?.leaderName || '').slice(0, 120),
    contributors: '',
    informed: '',
    options: [
      {
        id: ctx.idFactory('opt'),
        label: `Accept the forgoing list as written`,
        pros: 'One hour budget, one plan, one written record of what it excluded.',
        cons: `${money(total, currency)} of expected value is consciously left unprotected until the next plan.`,
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Buy back hours or re-price the queue',
        pros: 'Raises the budget or makes more of the queue comparable, which changes what the solver can buy.',
        cons: 'Either costs something outside this plan, or admits that the constraint was never hours.',
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Re-declare the plan with different hours',
        pros: 'The hour estimates are the one input the leader can change without new evidence.',
        cons: 'Planning to a number you invented is not planning.',
      },
    ],
    chosen: '',
    rationale: String(
      `${tag} Generated by the attention plan. Expected value forgone: ${money(total, currency)} across ${forgone.length} obligation(s) inside the committed hour budget. `
      + 'This is the price of the constraint, not a judgement that the work does not matter.',
    ).slice(0, 4000),
    reviewOn: plan.result?.reviewOn || dayKey(addDays(ctx.now, 7)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  for (const item of forgone.slice(0, 24)) {
    if (!item?.sourceType || !item?.sourceId) continue;
    linkEntity(ctx, draft, {
      sourceType: 'decision',
      sourceId: decision.id,
      targetType: item.sourceType,
      targetId: item.sourceId,
      relation: 'forgoes',
      ruleId: ATT_RULE_IDS.FORGO,
      summary: 'This obligation was consciously excluded by the recorded plan.',
    });
  }
  linkEntity(ctx, draft, {
    sourceType: 'attention',
    sourceId: plan.id,
    targetType: 'decision',
    targetId: decision.id,
    relation: 'informs',
    ruleId: ATT_RULE_IDS.FORGO,
    summary: 'The decision that records what this plan left unprotected.',
  });
  mark(plan, 'forgoDecisionOpened');
  return [effect(ATT_RULE_IDS.FORGO, 'created', 'decision', decision.id,
    `Opened one decision covering ${forgone.length} forgone obligation(s) worth ${money(total, currency)}.`)];
}

/* ------------------------------------------------------------- RULE-ATT-04 */

function repairContradicted(draft, ctx, plan) {
  const review = plan.review;
  if (!review || !review.counts) return [];
  const tag = `${ATT_RULE_IDS.REVIEW}:${plan.id}`;
  if (hasMarker(draft.delegations, 'support', tag)) return [];
  const contradicted = Number(review.counts.contradicted) || 0;
  const attainment = review.attainmentPct;
  const shortfall = attainment !== null && attainment < 60;
  if (!contradicted && !shortfall) {
    note(plan, {
      source: ATT_RULE_IDS.REVIEW,
      text: `Reviewed ${review.reviewedOn}: ${review.counts.realised} realised, ${contradicted} contradicted, ${review.counts.open} still open. No repair task opened.`,
    });
    mark(plan, 'reviewAcknowledged');
    return [];
  }
  const owner = String(draft.settings?.leaderName || '').slice(0, 120);
  if (!owner) {
    note(plan, {
      source: ATT_RULE_IDS.REVIEW,
      text: 'The plan was contradicted but the workspace has no leader name, so no owned repair task was opened. An unowned repair is a wish.',
    });
    return [];
  }
  const decision = {
    id: ctx.idFactory('dec'),
    title: String(`Why did the ${plan.label || 'attention'} plan miss?`).slice(0, 200),
    question: String(
      `Committed ${plan.committedOn} for ${money(review.predictedValue, review.currency)} of expected value; measured ${money(review.measuredAvoided, review.currency)}`
      + `${attainment === null ? '' : ` (${attainment}% attainment)`}. `
      + `${contradicted} obligation(s) moved the wrong way.\n\n`
      + 'A plan that misses is only information if the miss is attributed. The two likely mechanisms are the hour estimates (the plan bought less than it thought) '
      + 'and the success probabilities (the plan was over-optimistic about closure). These are separable: a miss concentrated in hours is an estimation problem, '
      + 'a miss spread across probabilities is a calibration problem.',
    ).slice(0, 4000),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: String(draft.settings?.leaderName || '').slice(0, 120),
    approver: String(draft.settings?.leaderName || '').slice(0, 120),
    contributors: '',
    informed: '',
    options: [
      { id: ctx.idFactory('opt'), label: 'Recalibrate the hours', pros: 'If the miss is concentrated where hours were underestimated, this is the whole fix.', cons: 'Does nothing if the hours were fine and the work simply did not land.' },
      { id: ctx.idFactory('opt'), label: 'Recalibrate the success probabilities', pros: 'The floor is four closed records per class; below it the plan uses a prior.', cons: 'Takes time to accumulate, and this week still has to be planned.' },
      { id: ctx.idFactory('opt'), label: 'Shrink the plan', pros: 'A smaller plan that lands teaches more than a large one that does not.', cons: 'Consciously leaves exposure carrying.' },
    ],
    chosen: '',
    rationale: String(`${tag} Opened by the review of the attention plan committed ${plan.committedOn}.`).slice(0, 4000),
    reviewOn: dayKey(addDays(ctx.now, 14)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  const task = {
    id: ctx.idFactory('delegation'),
    personId: null,
    title: `Re-plan the week from the ${plan.label || 'attention'} miss`,
    expectedOutcome: 'A fresh plan whose hour estimates and success probabilities carry the correction this review implies.',
    authority: 'act-inform',
    support: `${tag} Opened by RULE-ATT-04 because the committed plan missed its own prediction.`,
    delegatedOn: dayKey(ctx.now),
    dueOn: dayKey(addDays(ctx.now, 7)),
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.push(task);
  linkEntity(ctx, draft, {
    sourceType: 'attention',
    sourceId: plan.id,
    targetType: 'decision',
    targetId: decision.id,
    relation: 'informs',
    ruleId: ATT_RULE_IDS.REVIEW,
    summary: 'The decision that attributes this plan\'s miss.',
  });
  mark(plan, 'reviewRepairOpened');
  return [
    effect(ATT_RULE_IDS.REVIEW, 'created', 'decision', decision.id,
      `Opened one attribution decision after a ${attainment === null ? 'missed' : `${attainment}%`} plan.`),
    effect(ATT_RULE_IDS.REVIEW, 'created', 'delegation', task.id,
      'Opened one owned re-planning task.'),
  ];
}

/* ---------------------------------------------------- RULE-ATT-05 */

function normalizedBarrier(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
    : '';
}

/**
 * Exact-text common-mode discovery. It never stores or copies the RCA prose: a
 * typed edge records only that two cases currently carry the same normalized
 * barrier text. Edges are reconciled on every case create/edit, including edits
 * that remove a barrier or pause propagation.
 */
function reconcileSharedBarriers(draft, ctx, sourceEvent) {
  const groups = new Map();
  for (const row of Array.isArray(draft.cases) ? draft.cases : []) {
    if (!row?.id || row.autoPropagate === false || !['open', 'mitigating', 'monitoring'].includes(row.status)) continue;
    const barrier = normalizedBarrier(row.rca?.systemicBarrier);
    if (barrier.length < 8) continue;
    const group = groups.get(barrier) || [];
    group.push(row.id);
    groups.set(barrier, group);
  }
  const desired = new Set();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    ids.sort();
    const root = ids[0];
    for (const peer of ids.slice(1)) desired.add(`${root}\u0000${peer}`);
  }
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const before = draft.links.length;
  draft.links = draft.links.filter((link) => {
    if (link?.ruleId !== ATT_RULE_IDS.SHARED_BARRIER || link.relation !== 'shares-barrier') return true;
    return desired.has(`${link.sourceId}\u0000${link.targetId}`);
  });
  const removed = before - draft.links.length;
  let created = 0;
  for (const edge of desired) {
    const [sourceId, targetId] = edge.split('\u0000');
    if (linkEntity(ctx, draft, {
      sourceType: 'case', sourceId, targetType: 'case', targetId,
      relation: 'shares-barrier', ruleId: ATT_RULE_IDS.SHARED_BARRIER,
      summary: 'The active records use the same normalized systemic-barrier text; source text is not copied into this edge.',
    })) created += 1;
  }
  if (!created && !removed) return [];
  const effects = [effect(ATT_RULE_IDS.SHARED_BARRIER, 'reconciled', 'case', sourceEvent.entityId,
    `Reconciled shared-barrier graph: ${created} edge(s) added, ${removed} stale edge(s) removed; text was not copied.`)];
  return effects;
}

/* ------------------------------------------------------------ dispatcher */

function shouldRun(event) {
  if (!event) return null;
  if (event.type === ATT_COMMITTED_EVENT) return 'commit';
  if (event.type === ATT_REVIEWED_EVENT) return 'review';
  if (event.entity === 'case' && ['case.created', 'case.updated', 'case.resolved', 'case.reopened', 'case.deleted'].includes(event.type)) return 'case';
  return null;
}

export function attentionMarketRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event) return [];
  const mode = shouldRun(event);
  if (!mode) return [];
  const plan = mode === 'case' ? null : findPlan(draft, event.entityId);
  if (mode !== 'case' && !plan) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const ruleCtx = {
    now,
    event,
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
    draft,
  };
  let effects = [];
  if (mode === 'case') {
    effects = reconcileSharedBarriers(draft, ruleCtx, event);
  } else if (mode === 'commit') {
    if (plan.markers?.includes('linksAttached')) return [];
    effects = [
      ...attachLinks(draft, ruleCtx, plan),
      ...openDelegations(draft, ruleCtx, plan),
      ...recordForgoing(draft, ruleCtx, plan),
    ];
    mark(plan, 'linksAttached');
  } else if (mode === 'review') {
    effects = repairContradicted(draft, ruleCtx, plan);
  }
  for (const row of effects) {
    if (typeof ctx.logEvent === 'function') {
      ctx.logEvent({
        type: 'automation.step',
        entity: mode === 'case' ? 'case' : 'attentionPlan',
        entityId: mode === 'case' ? event.entityId : plan.id,
        summary: `[${row.ruleId}] ${row.summary}`.slice(0, 300),
      });
    }
  }
  return effects;
}
