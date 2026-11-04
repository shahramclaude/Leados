/**
 * app/core/domain/disclosureRules.js — the Disclosure Compiler's two post-commit
 * rules (Schema v90, ADR-0085).
 *
 * RULE-DSC-01  OPEN. A release request is not a settings toggle, so recording one
 *              immediately does three things in the SAME transaction, with no
 *              re-entry: it opens ONE governed DACI decision (release for this
 *              window / refuse and share the aggregate instead / narrow the
 *              request), it places ONE consent task with the span's own leader —
 *              the person whose record is being widened — and it writes the
 *              typed edges (`discloses-to` the requester, `authorizes` from the
 *              decision). The requester cannot consent to their own request: the
 *              action refuses it, and the consent task is addressed to the span.
 *
 * RULE-DSC-02  SWEEP. Authority with an end date has to actually end. An expired
 *              release stops authorising reads (the compiler already refuses it),
 *              and it opens ONE review task asking whether the released detail
 *              produced the decision it was requested for. A release nobody
 *              graded is a precedent, not an exception.
 *
 * Both are marker-idempotent, pausable by `disclosureAutoPropagate` (an explicit
 * scan always runs), write inside the caller's transaction, and never widen a
 * read by themselves: the rules create paperwork and edges, never authority.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { DISCLOSURE_EVENTS, DISCLOSURE_RULE_IDS } from './disclosureRegistry.js';

const MARKER_CAP = 400;

function markers(draft) {
  if (!Array.isArray(draft.disclosureMarkers)) draft.disclosureMarkers = [];
  return draft.disclosureMarkers;
}
function seen(draft, tag) { return markers(draft).includes(tag); }
function mark(draft, tag) {
  const list = markers(draft);
  if (list.includes(tag)) return false;
  list.push(tag);
  if (list.length > MARKER_CAP) list.splice(0, list.length - MARKER_CAP);
  return true;
}
function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}
function link(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}
function grantById(draft, id) {
  return (Array.isArray(draft.disclosureGrants) ? draft.disclosureGrants : []).find((g) => g && g.id === id) || null;
}
function personById(draft, id) {
  return (Array.isArray(draft.people) ? draft.people : []).find((p) => p && p.id === id) || null;
}
function pushHistory(grant, at, type, by, summary) {
  if (!Array.isArray(grant.history)) grant.history = [];
  grant.history.push({ at, type, by: by || '', summary: summary.slice(0, 300) });
  if (grant.history.length > 40) grant.history.splice(0, grant.history.length - 40);
}
function task(ctx, ownerId, title, outcome, support, tag, dueDays) {
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

/* ------------------------------------------------------------------ DSC-01 */

function openRule(draft, ctx) {
  const grant = grantById(draft, ctx.event?.entityId);
  if (!grant || grant.status !== 'requested') return [];
  const tag = `${DISCLOSURE_RULE_IDS.OPEN}:request:${grant.id}`;
  if (seen(draft, tag)) return [];
  const owner = personById(draft, grant.spanId);
  const requester = personById(draft, grant.requesterId);
  const effects = [];
  const reviewOn = dayKey(addDays(ctx.now, Math.min(14, Math.max(3, grant.days))));
  const decision = {
    id: ctx.idFactory('dec'),
    title: `Release ${grant.moduleLabel} detail for ${grant.spanLabel || grant.spanId}?`,
    question: `${requester?.name || 'A leader'} at a higher altitude has asked for item-level detail from ${grant.spanLabel || grant.spanId} on ${grant.moduleLabel}, for ${grant.days} day(s), because: “${grant.purpose}”. `
      + `Their altitude sees this screen as counts only. Consent belongs to the span that owns the records, not to the requester and not to a setting. `
      + `Which answer is true?`,
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: requester?.name?.slice(0, 120) || '',
    approver: owner?.name?.slice(0, 120) || '',
    contributors: '',
    informed: '',
    options: [
      { id: ctx.idFactory('opt'), label: 'Release it for this window, bounded to this span and this screen', pros: 'The requester gets exactly what the decision needs; the expiry and the span bound keep it from becoming standing access.', cons: 'Once released, the detail cannot be un-read — the review task is what makes that accountable.' },
      { id: ctx.idFactory('opt'), label: 'Refuse the detail and hand up the aggregate instead', pros: 'Often sufficient: counts, overdue load and severity load answer most portfolio questions without naming anyone.', cons: 'If the real question was about one person’s situation, the aggregate will not settle it and the request will return.' },
      { id: ctx.idFactory('opt'), label: 'Narrow the request: one record or one sub-span, for fewer days', pros: 'The honest middle, and the most common right answer in practice.', cons: 'It costs one more round trip between the two altitudes.' },
    ],
    chosen: '',
    rationale: `Opened by ${DISCLOSURE_RULE_IDS.OPEN} from a recorded release request. This rule grants nothing: only ${owner?.name || 'the span leader'} can consent, and the compiler honours nothing else.`,
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
  if (!Array.isArray(draft.decisions)) draft.decisions = [];
  draft.decisions.unshift(decision);
  grant.decisionId = decision.id;
  grant.reviewOn = reviewOn;
  pushHistory(grant, ctx.now.toISOString(), 'opened', '', `Governed decision ${decision.id} opened and consent addressed to the span leader.`);
  mark(draft, tag);
  effects.push(effect(DISCLOSURE_RULE_IDS.OPEN, 'created', 'decision', decision.id,
    'Opened one governed decision about releasing item detail across an altitude boundary.'));

  if (link(draft, ctx, 'decision', decision.id, 'disclosuregrant', grant.id, 'authorizes',
    DISCLOSURE_RULE_IDS.OPEN, 'The decision that governs this release')) {
    effects.push(effect(DISCLOSURE_RULE_IDS.OPEN, 'linked', 'disclosuregrant', grant.id,
      'Linked the release request to the decision that governs it.'));
  }
  if (requester && link(draft, ctx, 'disclosuregrant', grant.id, 'person', requester.id, 'discloses-to',
    DISCLOSURE_RULE_IDS.OPEN, 'The altitude that asked for the detail')) {
    effects.push(effect(DISCLOSURE_RULE_IDS.OPEN, 'linked', 'person', requester.id,
      'Recorded which altitude the disclosure is for.'));
  }
  if (owner && !seen(draft, `${DISCLOSURE_RULE_IDS.OPEN}:task:${grant.id}`)) {
    mark(draft, `${DISCLOSURE_RULE_IDS.OPEN}:task:${grant.id}`);
    const consentTask = task(ctx, grant.spanId,
      `Consent or refuse: ${grant.moduleLabel} detail requested by a higher altitude`,
      `${requester?.name || 'A leader'} above you asked for item-level detail from your span on ${grant.moduleLabel} for ${grant.days} day(s), for this stated purpose: “${grant.purpose}”. `
        + `You are the person who owns those records, so you are the only one who can agree. Open the Disclosure Console to consent, refuse, or narrow the window. `
        + `Declining is a normal outcome: the requester keeps the aggregate, and the reason is recorded.`,
      `${DISCLOSURE_RULE_IDS.OPEN}: consent is the span's to give, never the requester's to take.`,
      `${DISCLOSURE_RULE_IDS.OPEN}:consent:${grant.id}`, 7);
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift(consentTask);
    effects.push(effect(DISCLOSURE_RULE_IDS.OPEN, 'created', 'delegation', consentTask.id,
      'Placed one consent task with the span leader whose records would be widened.'));
    if (link(draft, ctx, 'disclosuregrant', grant.id, 'delegation', consentTask.id, 'tracks-followup',
      DISCLOSURE_RULE_IDS.OPEN, 'The consent task this request is waiting on')) {
      effects.push(effect(DISCLOSURE_RULE_IDS.OPEN, 'linked', 'delegation', consentTask.id,
        'Linked the request to its consent task.'));
    }
  }
  return effects;
}

/* ------------------------------------------------------------------ DSC-02 */

function expireGrant(draft, ctx, grant) {
  grant.status = 'expired';
  grant.expiredOn = dayKey(ctx.now);
  pushHistory(grant, ctx.now.toISOString(), 'expired', '', `The release window closed on ${grant.expiresOn}. Detail access ended with it.`);
  return [effect(DISCLOSURE_RULE_IDS.SWEEP, 'expired', 'disclosuregrant', grant.id,
    `Release ${grant.id} lapsed on its own expiry date; the compiler honours nothing past it.`)];
}

/**
 * A lapsed release owes a review whoever ended it: a window the rule closed, or
 * one an imported workspace already carried as expired. The marker makes it one
 * review per release, forever.
 */
function reviewLapsedGrant(draft, ctx, grant) {
  const effects = [];
  const requester = personById(draft, grant.requesterId);
  const tag = `${DISCLOSURE_RULE_IDS.SWEEP}:review:${grant.id}`;
  if (!requester || seen(draft, tag)) return effects;
  mark(draft, tag);
  const review = task(ctx, requester.id,
    `Grade the lapsed release: did ${grant.moduleLabel} detail change the decision?`,
    `The release you requested for ${grant.spanLabel || grant.spanId} on ${grant.moduleLabel} ran from ${grant.grantedOn || 'its grant date'} to ${grant.expiresOn} and has now lapsed, so the screen is back to counts. `
      + `The stated purpose was: “${grant.purpose}”. Record what the detail actually changed, or record that it changed nothing. `
      + `An exception nobody grades turns into a precedent, and the next request will cite it.`,
    `${DISCLOSURE_RULE_IDS.SWEEP}: releases end, and ending is recorded.`,
    tag, 5);
  if (!Array.isArray(draft.delegations)) draft.delegations = [];
  draft.delegations.unshift(review);
  effects.push(effect(DISCLOSURE_RULE_IDS.SWEEP, 'created', 'delegation', review.id,
    'Opened one review task for a lapsed release.'));
  if (link(draft, ctx, 'disclosuregrant', grant.id, 'delegation', review.id, 'tracks-followup',
    DISCLOSURE_RULE_IDS.SWEEP, 'The review this lapsed release owes')) {
    effects.push(effect(DISCLOSURE_RULE_IDS.SWEEP, 'linked', 'delegation', review.id,
      'Linked the lapsed release to its review task.'));
  }
  return effects;
}

function sweepRule(draft, ctx) {
  const effects = [];
  const today = dayKey(ctx.now);
  const grants = Array.isArray(draft.disclosureGrants) ? draft.disclosureGrants : [];
  for (const grant of grants) {
    if (!grant) continue;
    if (grant.status === 'granted' && grant.expiresOn && grant.expiresOn < today) {
      effects.push(...expireGrant(draft, ctx, grant), ...reviewLapsedGrant(draft, ctx, grant));
    } else if (grant.status === 'expired') {
      // Loading an older workspace can already have closed the window; the
      // review it owes is still owed.
      effects.push(...reviewLapsedGrant(draft, ctx, grant));
    }
  }
  // Reconcile typed edges to grants that no longer exist: a graph that keeps a
  // ghost edge will one day explain a disclosure nobody can find.
  const ids = new Set(grants.map((g) => g && g.id).filter(Boolean));
  if (Array.isArray(draft.links)) {
    const before = draft.links.length;
    draft.links = draft.links.filter((entry) => {
      if (!entry) return false;
      if (entry.sourceType !== 'disclosuregrant' && entry.targetType !== 'disclosuregrant') return true;
      const id = entry.sourceType === 'disclosuregrant' ? entry.sourceId : entry.targetId;
      return ids.has(id);
    });
    if (before !== draft.links.length) {
      effects.push(effect(DISCLOSURE_RULE_IDS.SWEEP, 'reconciled', 'workspace', '',
        `Dropped ${before - draft.links.length} stale disclosure edge(s).`));
    }
  }
  return effects;
}

/* ------------------------------------------------------------------ engine */

export function disclosureRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now };
  const auto = (ctx.settings || draft.settings || {}).disclosureAutoPropagate !== false;
  let effects = [];
  if (ctx.event.type === DISCLOSURE_EVENTS.REQUESTED) {
    if (auto) effects = openRule(draft, scoped);
  } else if (ctx.event.type === DISCLOSURE_EVENTS.SCAN
    || ctx.event.type === DISCLOSURE_EVENTS.CONSENTED
    || ctx.event.type === DISCLOSURE_EVENTS.REFUSED
    || ctx.event.type === DISCLOSURE_EVENTS.REVOKED) {
    // An explicit scan always runs; the other events sweep so an expired window
    // cannot survive a consent or a revocation that happened after it lapsed.
    effects = sweepRule(draft, scoped);
  }
  if (effects.length && typeof ctx.logEvent === 'function') {
    const decisions = effects.filter((e) => e.targetType === 'decision').length;
    const tasks = effects.filter((e) => e.targetType === 'delegation' && e.action === 'created').length;
    const parts = [];
    if (decisions) parts.push(`${decisions} decision(s)`);
    if (tasks) parts.push(`${tasks} task(s)`);
    if (!parts.length) parts.push(`${effects.length} effect(s)`);
    ctx.logEvent({
      type: 'automation.propagated',
      entity: 'disclosuregrant',
      entityId: ctx.event?.entityId || '',
      summary: `Disclosure compiler: ${parts.join(', ')}`.slice(0, 300),
    });
  }
  for (const entry of effects) if (Array.isArray(ctx.out)) ctx.out.push(entry);
  return effects;
}

disclosureRule.id = 'disclosureRule';
disclosureRule.label = 'Disclosure releases (RULE-DSC-01..02)';
disclosureRule.module = 'disclosureRules.js';
disclosureRule.triggers = [...Object.values(DISCLOSURE_EVENTS)];
disclosureRule.effect = (draft, event, context = {}) => disclosureRule(draft, { ...context, event });
Object.freeze(disclosureRule);
