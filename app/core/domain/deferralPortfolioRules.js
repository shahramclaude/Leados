/**
 * The Deferral Portfolio's four post-commit rules (Schema v69).
 *
 * RULE-DPO-01  a frozen reading maps to every member call with an
 *              `aggregates-deferral` edge and to every shared premise it
 *              stresses with a `stresses-premise` edge; when the tail
 *              concentrates on one call past the declared convention it opens
 *              exactly one owned concentration-watch task. Nothing is chosen
 *              and no date is moved.
 * RULE-DPO-02  an explicit scan reconciles this module's edges, opens due
 *              grading work, and turns a window that expired with member
 *              calls still open into ONE governed decision per ISO week.
 * RULE-DPO-03  a graded surprise (Brier ≥ 0.25) opens one blameless process
 *              task. It never rates a person.
 * RULE-DPO-04  a premise lifecycle event on a premise a frozen reading
 *              stresses appends one challenge note to that reading (the
 *              frozen figures are never rewritten), and — when the premise
 *              has breached or been given a dated human outcome — opens
 *              exactly one re-price decision per premise per ISO week.
 *
 * All four are marker-idempotent and write inside the caller's transaction.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { evaluatePremiseCore } from './premises.js';
import {
  DEFERRAL_PORTFOLIO_EVENTS,
  DEFERRAL_PORTFOLIO_RULE_IDS,
  deferralPortfolioConventions,
} from './deferralPortfolio.js';

const PREMISE_EVENT_TYPES = new Set([
  'premise.created',
  'premise.updated',
  'premise.evidence',
  'premise.reviewed',
  'premise.outcome',
  'premise.scan',
]);

function ownerOf(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  return people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId))) || null;
}

function addMarker(draft, tag) {
  draft.deferralPortfolioMarkers = Array.isArray(draft.deferralPortfolioMarkers)
    ? draft.deferralPortfolioMarkers : [];
  if (draft.deferralPortfolioMarkers.includes(tag)) return false;
  draft.deferralPortfolioMarkers.push(tag);
  if (draft.deferralPortfolioMarkers.length > 400) {
    draft.deferralPortfolioMarkers.splice(0, draft.deferralPortfolioMarkers.length - 400);
  }
  return true;
}

function seen(draft, tag) {
  return (draft.deferralPortfolioMarkers || []).includes(tag);
}

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function link(draft, ctx, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(draft, {
    sourceType: 'portfolioreading', sourceId, targetType, targetId, relation, ruleId, summary,
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

function newDecision(ctx, ownerName, title, question, currency, valueNow, ruleId) {
  const rationaleNote = ruleId === DEFERRAL_PORTFOLIO_RULE_IDS.SCAN
    ? 'a frozen book reading passed its window with member calls still unrecorded'
    : 'a premise that couples member calls of a frozen deferral-portfolio reading changed state';
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
      { id: ctx.idFactory('opt'), label: 'Re-freeze the book reading now', pros: 'The tail, the concentration and the joint-lapse figures are re-stated under what the premise now says.', cons: 'The frozen forecast stays as it was; only a new reading is honest.' },
      { id: ctx.idFactory('opt'), label: 'Commit the concentrated call', pros: 'Removes the member that carries the tail concentration from the book.', cons: 'Gives up that call’s remaining flexibility.' },
      { id: ctx.idFactory('opt'), label: 'Keep the frozen reading as history', pros: 'No new work is opened.', cons: 'The quoted tail describes a premise the record no longer supports.' },
    ],
    chosen: '',
    rationale: `Opened by ${ruleId || DEFERRAL_PORTFOLIO_RULE_IDS.PREMISE}: ${rationaleNote}. ${currency} ${Number(valueNow).toLocaleString('en-US', { maximumFractionDigits: 2 })} of stake rides on the book that premise couples. The rule never chooses; the leader does.`,
    reviewOn: dayKey(addDays(ctx.now, 7)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/* ---------------------------------------------------------------- DPO-01 */

function freezeRule(draft, ctx) {
  const record = (draft.deferralPortfolioReadings || []).find((r) => r && r.id === ctx.event?.entityId);
  if (!record) return [];
  const effects = [];
  const decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  const decisionIds = new Set(decisions.map((d) => d && d.id));

  // One edge per member call, so the reading is navigable from every decision
  // it aggregates. Links to decisions that no longer exist are left for the
  // scan to reconcile.
  for (const decisionId of record.memberIds) {
    if (!decisionIds.has(decisionId)) continue;
    const tag = `${DEFERRAL_PORTFOLIO_RULE_IDS.FROZEN}:link:${record.id}:${decisionId}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    if (link(draft, ctx, record.id, 'decision', decisionId, 'aggregates-deferral', DEFERRAL_PORTFOLIO_RULE_IDS.FROZEN,
      'Frozen portfolio reading aggregating this call’s deferral frame')) {
      effects.push(effect(DEFERRAL_PORTFOLIO_RULE_IDS.FROZEN, 'linked', 'decision', decisionId,
        'Mapped one frozen portfolio reading to a member call.'));
    }
  }

  // One edge per premise the book's own coupling graph stressed at freeze.
  const premiseIds = new Set();
  for (const l of draft.links || []) {
    if (l?.sourceType === 'portfolioreading' && l.sourceId === record.id && l.targetType === 'premise') {
      premiseIds.add(l.targetId);
    }
  }
  // Stress edges are written from the coupling the freeze captured; if the
  // freeze did not record premises (an older reading), there is nothing to
  // stress and the rule says nothing.
  const stressed = Array.isArray(record.stressedPremiseIds) ? record.stressedPremiseIds : null;
  if (stressed) {
    for (const premiseId of stressed) {
      const premise = (draft.premises || []).find((p) => p && p.id === premiseId);
      if (!premise) continue;
      const tag = `${DEFERRAL_PORTFOLIO_RULE_IDS.FROZEN}:premise:${record.id}:${premiseId}`;
      if (seen(draft, tag)) continue;
      addMarker(draft, tag);
      if (link(draft, ctx, record.id, 'premise', premiseId, 'stresses-premise', DEFERRAL_PORTFOLIO_RULE_IDS.FROZEN,
        'Frozen reading whose joint-lapse figure rests on this shared premise')) {
        effects.push(effect(DEFERRAL_PORTFOLIO_RULE_IDS.FROZEN, 'linked', 'premise', premiseId,
          'Linked a frozen reading to the shared premise it stresses.'));
      }
    }
  }

  // A concentration past the convention opens exactly one owned watch.
  const conventions = deferralPortfolioConventions(ctx.settings || draft.settings || {});
  const topShare = Number(record.topContributionShare);
  if (Number.isFinite(topShare) && topShare >= conventions.concentration) {
    const owner = ownerOf(draft);
    if (owner) {
      const taskTag = `${DEFERRAL_PORTFOLIO_RULE_IDS.FROZEN}:task:${record.id}`;
      if (!seen(draft, taskTag)) {
        addMarker(draft, taskTag);
        const task = newTask(ctx, owner.id,
          'Watch the concentration in the deferral portfolio',
          `One member call carries ${(topShare * 100).toFixed(0)}% of the frozen book's ${(Number(record.tailLevel) * 100).toFixed(0)}% tail in ${record.currency}, past the ${(conventions.concentration * 100).toFixed(0)}% convention. Decide whether to commit that call, re-scope it, or accept the concentration knowingly — and record which. The expected total is additive under any correlation; concentration is a tail property, not a premium property.`,
          `${DEFERRAL_PORTFOLIO_RULE_IDS.FROZEN}: the reading froze the concentration; acting on it stays with the leader.`,
          taskTag, 10);
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        draft.delegations.unshift(task);
        effects.push(effect(DEFERRAL_PORTFOLIO_RULE_IDS.FROZEN, 'created', 'delegation', task.id,
          `Opened one owned concentration-watch task at a ${(topShare * 100).toFixed(0)}% tail share.`));
        if (link(draft, ctx, record.id, 'delegation', task.id, 'tracks-followup', DEFERRAL_PORTFOLIO_RULE_IDS.FROZEN,
          'Leader-owned watch on the book’s concentration')) {
          effects.push(effect(DEFERRAL_PORTFOLIO_RULE_IDS.FROZEN, 'linked', 'delegation', task.id,
            'Linked the concentration watch to the frozen reading.'));
        }
      }
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- DPO-02 */

function scanRule(draft, ctx) {
  const effects = [];
  const readings = new Set((draft.deferralPortfolioReadings || []).map((r) => r && r.id).filter(Boolean));
  const collections = { decision: 'decisions', delegation: 'delegations', premise: 'premises' };
  const before = (draft.links || []).length;
  draft.links = (draft.links || []).filter((l) => {
    if (l?.sourceType !== 'portfolioreading' || !Object.values(DEFERRAL_PORTFOLIO_RULE_IDS).includes(l.ruleId)) return true;
    if (!readings.has(l.sourceId)) return false;
    const collection = collections[l.targetType];
    return collection ? (draft[collection] || []).some((row) => row?.id === l.targetId) : false;
  });
  if ((draft.links || []).length < before) {
    effects.push(effect(DEFERRAL_PORTFOLIO_RULE_IDS.SCAN, 'reconciled', 'links', '',
      `Removed ${before - (draft.links || []).length} stale portfolio edge(s).`));
  }
  const owner = ownerOf(draft);
  if (!owner) return effects;
  const today = dayKey(ctx.now);

  // 1. Due grading work, at most three per scan.
  let gradingTasks = 0;
  for (const record of draft.deferralPortfolioReadings || []) {
    if (gradingTasks >= 3) break;
    if (!record || record.graded || record.reviewOn > today) continue;
    if (!(record.memberIds || []).some((id) => (draft.decisions || []).some((d) => d && d.id === id))) continue;
    const tag = `${DEFERRAL_PORTFOLIO_RULE_IDS.SCAN}:grade:${record.id}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const task = newTask(ctx, owner.id,
      'Grade a frozen deferral-portfolio reading',
      `The window closed on ${record.reviewOn}. Compare the member decisions' recorded decidedOn dates with the frozen P(any commit by deadline) of ${record.predictedAnyCommitPct}% and record the outcome once. Do not backdate a decision or reinterpret the reading.`,
      `${DEFERRAL_PORTFOLIO_RULE_IDS.SCAN}: a frozen prediction is only useful when it is scored.`,
      tag, 5);
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift(task);
    gradingTasks += 1;
    effects.push(effect(DEFERRAL_PORTFOLIO_RULE_IDS.SCAN, 'created', 'delegation', task.id,
      'Opened one owned task to grade a due portfolio reading.'));
  }

  // 2. An expired window on still-open members becomes one governed decision
  //    per ISO week.
  const expired = (draft.deferralPortfolioReadings || []).filter((record) => record && !record.graded
    && record.reviewOn < today
    && (record.memberIds || []).some((id) => (draft.decisions || []).some((d) => d && d.id === id && !String(d.chosen || '').trim())));
  if (!expired.length) return effects;
  const week = weekKey(ctx.now) || today;
  const tag = `${DEFERRAL_PORTFOLIO_RULE_IDS.SCAN}:expired:${week}`;
  if (seen(draft, tag)) return effects;
  addMarker(draft, tag);
  const lead = expired[0];
  const openMembers = expired.reduce((count, record) => count
    + (record.memberIds || []).filter((id) => (draft.decisions || []).some((d) => d && d.id === id && !String(d.chosen || '').trim())).length, 0);
  const decision = newDecision(ctx, owner.name || draft.settings?.leaderName || '',
    'The deferral-portfolio window expired — decide, re-scope or close',
    `${expired.length} frozen book reading(s) passed their window with ${openMembers} member call(s) still unrecorded. The largest book carried ${lead.currency} ${Number(lead.sumStake).toLocaleString('en-US', { maximumFractionDigits: 2 })} of stake and ${lead.currency} ${Number(lead.sumPremium).toLocaleString('en-US', { maximumFractionDigits: 2 })} of flexibility. Which calls are now made, which are re-scoped with new deadlines, and which are closed — and what changed since the reading was frozen?`,
    lead.currency, lead.sumStake, DEFERRAL_PORTFOLIO_RULE_IDS.SCAN);
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.unshift(decision);
  effects.push(effect(DEFERRAL_PORTFOLIO_RULE_IDS.SCAN, 'created', 'decision', decision.id,
    `Opened one DACI decision for ${expired.length} expired portfolio window(s).`));
  for (const record of expired.slice(0, 5)) {
    if (link(draft, ctx, record.id, 'decision', decision.id, 'surfaces-impact', DEFERRAL_PORTFOLIO_RULE_IDS.SCAN,
      'Expired window surfaced as a governed choice')) {
      effects.push(effect(DEFERRAL_PORTFOLIO_RULE_IDS.SCAN, 'linked', 'decision', decision.id,
        'Linked an expired reading to the governing decision.'));
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- DPO-03 */

function gradeRule(draft, ctx) {
  const record = (draft.deferralPortfolioReadings || []).find((r) => r && r.id === ctx.event?.entityId);
  if (!record || !record.graded) return [];
  if (!(record.graded.brier >= 0.25)) return [];
  const owner = ownerOf(draft);
  if (!owner) return [];
  const tag = `${DEFERRAL_PORTFOLIO_RULE_IDS.GRADE}:${record.id}`;
  if (seen(draft, tag)) return [];
  addMarker(draft, tag);
  const task = newTask(ctx, owner.id,
    'Review a missed deferral-portfolio forecast',
    `The frozen reading expected at least one member call to commit by ${record.reviewOn} with probability ${record.predictedAnyCommitPct}%, and the recorded outcome was ${record.graded.anyCommitted ? 'a commit by that date' : 'no commit by that date'} (Brier ${record.graded.brier}). Was the correlation wrong, the boundaries wrong, or the follow-through? Record the mechanism before trusting the next book reading. This is a forecast/process review, never a rating of a person.`,
    `${DEFERRAL_PORTFOLIO_RULE_IDS.GRADE}: a graded surprise is information about the process, not about anyone's character.`,
    tag, 10);
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift(task);
  return [effect(DEFERRAL_PORTFOLIO_RULE_IDS.GRADE, 'created', 'delegation', task.id,
    'Opened one blameless process task after a graded portfolio surprise.')];
}

/* ---------------------------------------------------------------- DPO-04 */

/**
 * The premise challenge. A shared premise is the one input the per-call
 * terminal cannot see and this terminal exists to price; when that premise
 * moves, every frozen reading resting on it is challenged with an appended
 * note (its figures are never rewritten), and a breach or a dated human
 * outcome opens exactly one re-price decision per premise per ISO week.
 */
function premiseRule(draft, ctx) {
  const event = ctx.event;
  if (!event || !PREMISE_EVENT_TYPES.has(event.type)) return [];
  let premiseId = null;
  if (event.type === 'premise.outcome') {
    const outcome = (draft.premiseOutcomes || []).find((row) => row && row.id === event.entityId);
    premiseId = outcome ? outcome.premiseId : event.entityId;
  } else {
    premiseId = event.entityId;
  }
  if (!premiseId) return [];
  const premise = (draft.premises || []).find((p) => p && p.id === premiseId);
  if (!premise) return [];

  // Which frozen readings stress this premise?
  const stressedReadings = (draft.deferralPortfolioReadings || []).filter((record) => record
    && (draft.links || []).some((l) => l && l.sourceType === 'portfolioreading'
      && l.sourceId === record.id && l.targetType === 'premise' && l.targetId === premiseId));
  if (!stressedReadings.length) return [];
  const effects = [];
  const today = dayKey(ctx.now);

  for (const record of stressedReadings.slice(0, 5)) {
    const noteTag = `${DEFERRAL_PORTFOLIO_RULE_IDS.PREMISE}:note:${record.id}:${premiseId}`;
    if (!seen(draft, noteTag)) {
      addMarker(draft, noteTag);
      record.challengeNotes = Array.isArray(record.challengeNotes) ? record.challengeNotes : [];
      record.challengeNotes.push(`Challenged ${today}: a shared premise this reading rests on changed (event ${event.type}); the frozen figures stand as history and must be re-frozen before they are quoted. [${noteTag}]`);
      if (record.challengeNotes.length > 8) record.challengeNotes.splice(0, record.challengeNotes.length - 8);
      effects.push(effect(DEFERRAL_PORTFOLIO_RULE_IDS.PREMISE, 'challenged', 'portfolioreading', record.id,
        'Appended a premise challenge note to a frozen reading; no figure was rewritten.'));
    }
  }

  // A breach or a dated human outcome is the moment the book must be re-read.
  const evaluated = evaluatePremiseCore(premise, {
    now: ctx.now,
    settings: ctx.settings || draft.settings || {},
  });
  const conclusive = event.type === 'premise.outcome'
    || evaluated.status === 'breached'
    || premise.humanDisposition === 'retired';
  if (!conclusive) return effects;

  const owner = ownerOf(draft);
  if (!owner) return effects;
  const week = weekKey(ctx.now) || today;
  const tag = `${DEFERRAL_PORTFOLIO_RULE_IDS.PREMISE}:decision:${premiseId}:${week}`;
  if (seen(draft, tag)) return effects;
  addMarker(draft, tag);
  const lead = stressedReadings[0];
  const decision = newDecision(ctx, owner.name || draft.settings?.leaderName || '',
    'A shared premise behind the deferral portfolio moved — re-price the book',
    `The premise coupling ${lead.memberIds.length} member call(s) of a frozen deferral-portfolio reading is now ${evaluated.status}${event.type === 'premise.outcome' ? ' (a dated human outcome was recorded)' : ''}. ${lead.currency} ${Number(lead.sumStake).toLocaleString('en-US', { maximumFractionDigits: 2 })} of stake and ${lead.currency} ${Number(lead.sumPremium).toLocaleString('en-US', { maximumFractionDigits: 2 })} of flexibility were frozen under it. Re-freeze the reading under what the premise now says, commit the concentrated call, or record why the frozen figures still stand.`,
    lead.currency, lead.sumStake, DEFERRAL_PORTFOLIO_RULE_IDS.PREMISE);
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.unshift(decision);
  effects.push(effect(DEFERRAL_PORTFOLIO_RULE_IDS.PREMISE, 'created', 'decision', decision.id,
    'Opened one re-price decision for a premise-coupled book.'));
  if (link(draft, ctx, lead.id, 'decision', decision.id, 'surfaces-impact', DEFERRAL_PORTFOLIO_RULE_IDS.PREMISE,
    'Premise challenge surfaced as a governed re-price choice')) {
    effects.push(effect(DEFERRAL_PORTFOLIO_RULE_IDS.PREMISE, 'linked', 'decision', decision.id,
      'Linked the challenged reading to the re-price decision.'));
  }
  return effects;
}

/* ---------------------------------------------------------------- engine */

/**
 * The rule function itself. It returns its effects so the post-commit engine
 * can trace them; every write happens on the draft it was handed, inside the
 * caller's savepoint.
 */
export { DEFERRAL_PORTFOLIO_EVENTS, DEFERRAL_PORTFOLIO_RULE_IDS };

export function deferralPortfolioRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const conventions = deferralPortfolioConventions(ctx.settings || draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now };
  let effects = [];
  const type = ctx.event.type;
  if (type === DEFERRAL_PORTFOLIO_EVENTS.FROZEN) {
    if (!conventions.autoPropagate) return [];
    effects = freezeRule(draft, scoped);
  } else if (type === DEFERRAL_PORTFOLIO_EVENTS.SCAN) {
    effects = scanRule(draft, scoped);
  } else if (type === DEFERRAL_PORTFOLIO_EVENTS.GRADED) {
    if (!conventions.autoPropagate) return [];
    effects = gradeRule(draft, scoped);
  } else if (PREMISE_EVENT_TYPES.has(type)) {
    if (!conventions.autoPropagate) return [];
    effects = premiseRule(draft, scoped);
  }
  for (const entry of effects) {
    if (typeof ctx.logEvent === 'function') {
      ctx.logEvent({
        type: 'automation.propagated',
        entity: 'portfolioreading',
        entityId: entry.targetId || '',
        summary: entry.summary,
      });
    }
    if (Array.isArray(ctx.out)) ctx.out.push(entry);
  }
  return effects;
}

deferralPortfolioRule.id = 'deferralPortfolio';
deferralPortfolioRule.label = 'Deferral portfolio propagation (RULE-DPO-01..04)';
deferralPortfolioRule.module = 'deferralPortfolioRules.js';
deferralPortfolioRule.triggers = [
  ...Object.values(DEFERRAL_PORTFOLIO_EVENTS),
  ...PREMISE_EVENT_TYPES,
];
deferralPortfolioRule.effect = (draft, event, context = {}) => deferralPortfolioRule(draft, { ...context, event });
Object.freeze(deferralPortfolioRule);
