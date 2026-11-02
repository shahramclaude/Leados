/**
 * The Cross-Examination Terminal's five post-commit rules (Schema v81, ADR-0074).
 *
 * RULE-SCP-01  a frozen round commits work, not just a number. It opens at most
 *              `scepticMaxTasks` leader-owned cross-examination tasks — one per
 *              priced claim the round itself ranked highest — each carrying the
 *              refuter (the single observation that would settle it), and writes
 *              a `cross-examines` edge from the round to every claim it priced
 *              (capped) and a `finds-against` edge to the counter-record where
 *              one exists. It never records a verdict: a verdict is a human act
 *              with a reason.
 * RULE-SCP-02  when a family's whole credible interval sits above the leader's
 *              tolerance, one governed DACI decision per family per 30-day
 *              bucket: the question is about the process that produces claims of
 *              that kind, never about a person who produced one.
 * RULE-SCP-03  a recorded verdict becomes graph evidence: a `records-verdict`
 *              edge from the disposition to the record whose claim it settles, so
 *              the claim can be navigated from its verdict and back. Reconciliation
 *              drops edges whose round has been deleted. No rule ever rewrites a
 *              verdict, re-scores a round or edits a claim.
 * RULE-SCP-04  a frozen round whose review date has passed ungraded opens one
 *              grading task. An audit nobody grades cannot tell you whether it
 *              prices contradictions correctly.
 * RULE-SCP-05  when the dismissal rate crosses the leader's own cap, one blameless
 *              process question per 30-day bucket: either the detector is wrong or
 *              the dismissal is doing the work of a verdict, and the record's
 *              reasons say which. This rule audits the auditor, in public.
 *
 * All five are marker-idempotent, write inside the caller's transaction, are
 * pausable by `scepticAutoPropagate` (an explicit scan always runs), and never
 * name, rate or rank a person. A review is an instrument whose claim is audited;
 * the person whose period it covers is never an endpoint.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { SCEPTIC_EVENTS, SCEPTIC_RULE_IDS } from './scepticRegistry.js';
import { scepticReport, scepticConventions } from './sceptic.js';

const MARKER_CAP = 400;

/** The graph type of every record a claim can be made about. */
export const SCEPTIC_GRAPH_TYPE = Object.freeze({
  goal: 'goal',
  case: 'case',
  change: 'change',
  review: 'review',
  decision: 'decision',
  premise: 'premise',
  stakeholder: 'stakeholder',
  delegation: 'delegation',
});

function ownerOf(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  return people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId))) || null;
}

function markerStore(draft) {
  if (!Array.isArray(draft.scepticMarkers)) draft.scepticMarkers = [];
  return draft.scepticMarkers;
}

function addMarker(draft, tag) {
  const markers = markerStore(draft);
  if (markers.includes(tag)) return false;
  markers.push(tag);
  if (markers.length > MARKER_CAP) markers.splice(0, markers.length - MARKER_CAP);
  return true;
}

const seen = (draft, tag) => markerStore(draft).includes(tag);

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function link(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(draft, {
    sourceType, sourceId, targetType, targetId, relation, ruleId, summary,
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

function pushTask(draft, task) {
  if (!Array.isArray(draft.delegations)) draft.delegations = [];
  draft.delegations.unshift(task);
}

function bucket30(now) {
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return String(Math.floor(ms / 86400000 / 30));
}

function governedDecision(ctx, ownerName, title, question, options, rationale) {
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 4000),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: ownerName.slice(0, 120),
    approver: ownerName.slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map((option) => ({
      id: ctx.idFactory('opt'),
      label: option.label,
      pros: option.pros,
      cons: option.cons,
    })),
    chosen: '',
    rationale: rationale.slice(0, 2000),
    reviewOn: dayKey(addDays(ctx.now, 7)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/* ---------------------------------------------------------------- SCP-01 */

function roundFrozenRule(draft, ctx, conventions) {
  const round = (Array.isArray(draft.scepticRounds) ? draft.scepticRounds : [])
    .find((row) => row && row.id === ctx.event?.entityId);
  if (!round) return [];
  const owner = ownerOf(draft);
  const report = scepticReport(draft, ctx.now, ctx.settings || draft.settings || {});
  const effects = [];

  const byKey = new Map(report.ranked.map((row) => [row.key, row]));
  const candidates = (round.claims || [])
    .map((claim) => ({ claim, live: byKey.get(claim.claimKey) }))
    .filter((row) => row.live)
    .sort((a, b) => b.claim.probabilityPct - a.claim.probabilityPct);

  let created = 0;
  for (const { claim, live } of candidates) {
    if (created >= conventions.scepticMaxTasks || !owner) break;
    const tag = `${SCEPTIC_RULE_IDS.FROZEN}:task:${round.id}:${claim.claimKey}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    created += 1;
    const task = newTask(ctx, owner.id,
      `Cross-examine one claim: ${String(live.label).slice(0, 110)}`,
      `${live.detectorLabel}. ${live.detail} `
        + `The round froze a ${claim.probabilityPct}% chance that this claim is wrong. `
        + `Settling it needs one observation: ${live.refuter}. `
        + 'Then record the verdict and the reason on the cross-examination screen — a verdict with no reason is a click, and this workspace will not count it.',
      `${SCEPTIC_RULE_IDS.FROZEN}: opened from a frozen round, not from a score. The rule cannot settle the claim for you and does not try.`,
      tag, 7);
    pushTask(draft, task);
    effects.push(effect(SCEPTIC_RULE_IDS.FROZEN, 'created', 'delegation', task.id,
      'Opened one cross-examination task for a priced claim.'));

    if (SCEPTIC_GRAPH_TYPE[live.nodeType]
      && link(draft, ctx, 'scepticround', round.id, SCEPTIC_GRAPH_TYPE[live.nodeType], live.nodeId,
        'cross-examines', SCEPTIC_RULE_IDS.FROZEN,
        'Frozen round prices this claim as contradicted by the record')) {
      effects.push(effect(SCEPTIC_RULE_IDS.FROZEN, 'linked', live.nodeType, live.nodeId,
        'Linked the round to a claim it examined.'));
    }
    if (live.evidenceNodeType && live.evidenceNodeId && SCEPTIC_GRAPH_TYPE[live.evidenceNodeType]
      && link(draft, ctx, 'scepticround', round.id, SCEPTIC_GRAPH_TYPE[live.evidenceNodeType], live.evidenceNodeId,
        'finds-against', SCEPTIC_RULE_IDS.FROZEN,
        'The record that contradicts the claim this round priced')) {
      effects.push(effect(SCEPTIC_RULE_IDS.FROZEN, 'linked', live.evidenceNodeType, live.evidenceNodeId,
        'Linked the round to the counter-record it found.'));
    }
  }

  /* Provenance for claims the task cap could not reach: the round still examined
     them, so the graph should reach them. Capped so one freeze cannot fan out into
     sixty edges. */
  let edges = 0;
  const linkedTypes = new Set(candidates.slice(0, conventions.scepticMaxTasks).map((row) => row.claim.claimKey));
  for (const claim of round.claims || []) {
    if (edges >= 8) break;
    if (linkedTypes.has(claim.claimKey)) continue;
    if (!SCEPTIC_GRAPH_TYPE[claim.nodeType]) continue;
    if (link(draft, ctx, 'scepticround', round.id, SCEPTIC_GRAPH_TYPE[claim.nodeType], claim.nodeId,
      'cross-examines', SCEPTIC_RULE_IDS.FROZEN, 'Frozen round examined this claim')) {
      edges += 1;
      effects.push(effect(SCEPTIC_RULE_IDS.FROZEN, 'linked', claim.nodeType, claim.nodeId,
        'Linked the round to a claim beyond the task cap.'));
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- SCP-03 */

function verdictRecordedRule(draft, ctx) {
  const disposition = (Array.isArray(draft.scepticDispositions) ? draft.scepticDispositions : [])
    .find((row) => row && row.id === ctx.event?.entityId);
  if (!disposition) return [];
  // claimKey is `${detectorId}|${nodeType}|${nodeId}`
  const parts = String(disposition.claimKey || '').split('|');
  if (parts.length < 3) return [];
  const [, nodeType, ...rest] = parts;
  const nodeId = rest.join('|');
  if (!SCEPTIC_GRAPH_TYPE[nodeType] || !nodeId) return [];
  const effects = [];
  if (link(draft, ctx, 'scepticdisposition', disposition.id, SCEPTIC_GRAPH_TYPE[nodeType], nodeId,
    'records-verdict', SCEPTIC_RULE_IDS.RECONCILE,
    `Verdict recorded: ${disposition.verdict}`)) {
    effects.push(effect(SCEPTIC_RULE_IDS.RECONCILE, 'linked', nodeType, nodeId,
      `Linked a ${disposition.verdict} verdict to the record whose claim it settles.`));
  }
  return effects;
}

/* ---------------------------------------------------------------- SCP-02..05 */

function scanRule(draft, ctx, conventions) {
  const report = scepticReport(draft, ctx.now, ctx.settings || draft.settings || {});
  const owner = ownerOf(draft);
  const effects = [];

  /* A family failing its own record gets ONE governed decision a month. */
  for (const family of report.families.filter((row) => row.verdict === 'doubted')) {
    const tag = `${SCEPTIC_RULE_IDS.FAMILY}:${family.key}:${bucket30(ctx.now)}`;
    if (seen(draft, tag) || !owner) continue;
    addMarker(draft, tag);
    const decision = governedDecision(ctx,
      owner.name || draft.settings?.leaderName || '',
      `Why do my ${family.unit}s fail their own record?`,
      `${family.refuted} of ${family.scored} scored ${family.unit}s in the family “${family.label}” were refuted by the record, `
        + `and the whole 90% interval (${family.errorLoPct}–${family.errorHiPct}%) sits above your ${family.tolerancePct}% tolerance. `
        + `The question is a process question, not a person question: what makes a claim of this kind get recorded before anything supports it? `
        + 'Choose one and write it down: require the supporting record before the claim can be saved, '
        + 'shorten the time between the event and the record, or name a second person who must sign it. '
        + 'Nothing about this decision is a judgement of whoever wrote the claims.',
      [
        { label: 'Gate the claim on its evidence', pros: 'Impossible to record an unsupported claim, which fixes the rate at the source.', cons: 'Adds friction to every honest claim as well as every careless one.' },
        { label: 'Record it sooner, in smaller pieces', pros: 'A claim written while the event is fresh needs less reconstruction, and reconstruction is where invention enters.', cons: 'Costs a little time every week rather than a lot once a quarter.' },
        { label: 'Add a second signature for this family', pros: 'Cheap, immediate, and makes the claim a shared act rather than a private one.', cons: 'Two people can share the same blind spot, and it does not fix the underlying habit.' },
      ],
      `Opened by ${SCEPTIC_RULE_IDS.FAMILY} because the family's contradiction interval is entirely above the declared tolerance. This rule never rates a person.`);
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.unshift(decision);
    effects.push(effect(SCEPTIC_RULE_IDS.FAMILY, 'created', 'decision', decision.id,
      `Opened one governed decision because “${family.label}” is failing its own record.`));
  }

  /* Grading work for a round whose window closed ungraded. */
  for (const round of report.rounds.filter((row) => row.gradeable).slice(0, 1)) {
    const tag = `${SCEPTIC_RULE_IDS.GRADE}:round:${round.id}`;
    if (seen(draft, tag) || !owner) continue;
    addMarker(draft, tag);
    const task = newTask(ctx, owner.id,
      'Grade the frozen cross-examination',
      `The round frozen on ${String(round.frozenAt).slice(0, 10)} priced ${round.claimCount} claim(s) and had a review date of ${round.reviewOn}. `
        + 'Grading writes the outcome once, from the verdict ledger, and scores this terminal’s probabilities with Brier and log loss '
        + 'against its own base rate. A round nobody grades cannot tell you whether the audit is any good.',
      `${SCEPTIC_RULE_IDS.GRADE}: frozen probabilities are scored once, later.`,
      tag, 5);
    pushTask(draft, task);
    effects.push(effect(SCEPTIC_RULE_IDS.GRADE, 'created', 'delegation', task.id,
      'Opened one task to grade an overdue round.'));
  }

  /* The auditor audits itself: a dismissal rate above the cap gets ONE question. */
  if (report.auditor.dismissalBreached && owner) {
    const tag = `${SCEPTIC_RULE_IDS.DISMISSAL}:${bucket30(ctx.now)}`;
    if (!seen(draft, tag)) {
      addMarker(draft, tag);
      const task = newTask(ctx, owner.id,
        'Why is the cross-examination mostly dismissed? (process, not people)',
        `${report.auditor.dismissed} of ${report.auditor.raised} verdict(s) recorded on this screen were dismissals — “not a real contradiction” — `
          + `against your own cap of ${report.auditor.dismissalCapPct}%. Two explanations exist and the reasons on file distinguish them: `
          + 'the detectors may be firing on records that are fine (in which case the detector is the defect, and this is a software question), '
          + 'or the dismissal is being used as a verdict (in which case the rate is honest and the cap is the problem). '
          + 'Read the reasons in order and decide which it is. This task is blameless and names nobody.',
        `${SCEPTIC_RULE_IDS.DISMISSAL}: fires once per 30-day bucket.`,
        tag, 14);
      pushTask(draft, task);
      effects.push(effect(SCEPTIC_RULE_IDS.DISMISSAL, 'created', 'delegation', task.id,
        'Opened one blameless task because the auditor is mostly being dismissed.'));
    }
  }

  /* Reconciliation: edges belonging to rounds that no longer exist. */
  const roundIds = new Set((Array.isArray(draft.scepticRounds) ? draft.scepticRounds : []).map((row) => row && row.id));
  if (Array.isArray(draft.links)) {
    const before = draft.links.length;
    draft.links = draft.links.filter((entry) => {
      if (!entry) return false;
      if (entry.sourceType === 'scepticround' && !roundIds.has(entry.sourceId)) return false;
      if (entry.targetType === 'scepticround' && !roundIds.has(entry.targetId)) return false;
      return true;
    });
    if (before !== draft.links.length) {
      effects.push(effect(SCEPTIC_RULE_IDS.RECONCILE, 'reconciled', 'workspace', '',
        `Dropped ${before - draft.links.length} stale cross-examination edge(s).`));
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- engine */

export { SCEPTIC_EVENTS, SCEPTIC_RULE_IDS };

export function scepticRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const conventions = scepticConventions(ctx.settings || draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now };
  let effects = [];
  const type = ctx.event.type;
  if (type === SCEPTIC_EVENTS.FROZEN) {
    if (!conventions.scepticAutoPropagate) return [];
    effects = roundFrozenRule(draft, scoped, conventions);
  } else if (type === SCEPTIC_EVENTS.DISPOSED) {
    effects = verdictRecordedRule(draft, scoped);
  } else if (type === SCEPTIC_EVENTS.SCAN) {
    effects = scanRule(draft, scoped, conventions);
  }
  if (effects.length && typeof ctx.logEvent === 'function') {
    const links = effects.filter((entry) => entry.action === 'linked').length;
    const decisions = effects.filter((entry) => entry.targetType === 'decision').length;
    const tasks = effects.filter((entry) => entry.targetType === 'delegation').length;
    const parts = [];
    if (links) parts.push(`${links} typed edge(s)`);
    if (decisions) parts.push(`${decisions} decision(s)`);
    if (tasks) parts.push(`${tasks} task(s)`);
    if (!parts.length) parts.push(`${effects.length} effect(s)`);
    ctx.logEvent({
      type: 'automation.propagated',
      entity: 'scepticround',
      entityId: ctx.event?.entityId || '',
      summary: `Cross-examination: ${parts.join(', ')}`.slice(0, 300),
    });
  }
  for (const entry of effects) {
    if (Array.isArray(ctx.out)) ctx.out.push(entry);
  }
  return effects;
}

scepticRule.id = 'scepticRule';
scepticRule.label = 'Cross-examination propagation (RULE-SCP-01..05)';
scepticRule.module = 'scepticRules.js';
scepticRule.triggers = [...Object.values(SCEPTIC_EVENTS)];
scepticRule.effect = (draft, event, context = {}) => scepticRule(draft, { ...context, event });
Object.freeze(scepticRule);
