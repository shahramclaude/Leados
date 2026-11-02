/**
 * The Promise Solvency Terminal's five post-commit rules (Schema v80).
 *
 * RULE-SLV-01  a frozen reading commits work, not just a number. It opens at most
 *              `solvencyMaxTasks` leader-owned repair tasks — one per exposure the
 *              reading itself ranked as worth the ask — each carrying the sentence
 *              to say, writes an `endangers-promise` edge from the reading to every
 *              promise it priced, and, when coverage is below 1, opens ONE governed
 *              DACI decision per ISO week about what leaves the book. It never
 *              moves a date itself: renegotiation is a human act with a reason.
 * RULE-SLV-02  an explicit scan turns already-overdue promises into one repair task
 *              per promise, ever (capped per scan), and a promise that has reached
 *              its move cap into ONE governed decision — because a fourth date is
 *              not a renegotiation, it is a decision to break the promise slowly.
 * RULE-SLV-03  when the share of the forward book expected to break crosses the
 *              leader's alarm, one blameless process task per 30-day bucket: the
 *              question is what the process is, not who is behind it.
 * RULE-SLV-04  a frozen reading whose window has closed ungraded opens one grading
 *              task. A ledger of unverified promises is decoration.
 * RULE-SLV-05  reconciliation: stale edges from deleted readings are dropped. It
 *              never rewrites a frozen reading and never moves a promise date.
 *
 * All five are marker-idempotent, write inside the caller's transaction, are
 * pausable by `solvencyAutoPropagate` (an explicit scan always runs), and never
 * rate, rank or name a person. The counterparty of a promise is a class, never an
 * individual judgement about them.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { SOLVENCY_EVENTS, SOLVENCY_RULE_IDS } from './solvencyRegistry.js';
import { solvencyReport, solvencyConventions } from './solvency.js';

const MARKER_CAP = 400;

function ownerOf(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  return people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId))) || null;
}

function markerStore(draft) {
  if (!Array.isArray(draft.solvencyMarkers)) draft.solvencyMarkers = [];
  return draft.solvencyMarkers;
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

/** Every promise source names a first-class graph node, so no edge is a no-op. */
export const SOLVENCY_GRAPH_TYPE = Object.freeze({
  delegation: 'delegation',
  decision: 'decision',
  goal: 'goal',
  followup: 'feedback',
  contact: 'stakeholder',
  requisition: 'requisition',
});

function sourceLabelOf(report, sourceKey) {
  return (report.sources.find((s) => s.key === sourceKey) || {}).label || sourceKey;
}

/* ---------------------------------------------------------------- SLV-01 */

function readingFrozenRule(draft, ctx, conventions) {
  const reading = (Array.isArray(draft.solvencyReadings) ? draft.solvencyReadings : [])
    .find((row) => row && row.id === ctx.event?.entityId);
  if (!reading) return [];
  const owner = ownerOf(draft);
  const report = solvencyReport(draft, ctx.now, ctx.settings || draft.settings || {});
  const effects = [];

  /* Repair work: only exposures the frozen reading actually priced. */
  const frozenIds = new Set((reading.exposures || []).map((e) => `${e.sourceKey}|${e.promiseId}`));
  const candidates = report.repair
    .filter((row) => frozenIds.has(`${row.sourceKey}|${row.promiseId}`))
    .filter((row) => row.verdict === 'renegotiate' || row.verdict === 'decide')
    .sort((a, b) => (a.verdict === b.verdict ? b.expectedSaving - a.expectedSaving : a.verdict === 'decide' ? -1 : 1));
  let created = 0;
  for (const row of candidates) {
    if (created >= conventions.solvencyMaxTasks || !owner) break;
    const tag = `${SOLVENCY_RULE_IDS.READ}:task:${reading.id}:${row.sourceKey}:${row.promiseId}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const task = newTask(ctx, owner.id,
      row.verdict === 'decide'
        ? `Decide, do not move: ${String(row.label).slice(0, 120)}`
        : `Renegotiate before it breaks: ${String(row.label).slice(0, 100)}`,
      row.repairScript,
      `${SOLVENCY_RULE_IDS.READ}: opened from a frozen reading, not from a score. The date is not moved by this rule — moving it is a decision with a reason on the record.`,
      tag, row.verdict === 'decide' ? 5 : 7);
    pushTask(draft, task);
    created += 1;
    effects.push(effect(SOLVENCY_RULE_IDS.READ, 'created', 'delegation', task.id,
      `Opened one ${row.verdict === 'decide' ? 'decision' : 'renegotiation'} task for a priced exposure.`));
    if (SOLVENCY_GRAPH_TYPE[row.sourceKey]
      && link(draft, ctx, 'delegation', task.id, SOLVENCY_GRAPH_TYPE[row.sourceKey], row.promiseId,
        'renegotiates', SOLVENCY_RULE_IDS.READ, 'Task opened to repair this promise before it breaks')) {
      effects.push(effect(SOLVENCY_RULE_IDS.READ, 'linked', row.sourceKey, row.promiseId,
        'Linked the repair task to the promise it prices.'));
    }
  }

  /* Provenance: the reading endangers every promise it priced. Capped, because a
     sixty-edge fan-out on one freeze is noise, not provenance. */
  let edges = 0;
  for (const exposure of reading.exposures || []) {
    if (edges >= 8) break;
    if (!SOLVENCY_GRAPH_TYPE[exposure.sourceKey]) continue;
    if (link(draft, ctx, 'solvencyreading', reading.id, SOLVENCY_GRAPH_TYPE[exposure.sourceKey], exposure.promiseId,
      'endangers-promise', SOLVENCY_RULE_IDS.READ,
      'Frozen reading prices this promise as at risk of breaking')) {
      edges += 1;
      effects.push(effect(SOLVENCY_RULE_IDS.READ, 'linked', exposure.sourceKey, exposure.promiseId,
        'Linked the reading to a promise it priced.'));
    }
  }

  /* Coverage below 1 is a capacity claim: it gets ONE governed decision a week. */
  if (
    reading.coverageRatio !== null
    && Number.isFinite(reading.coverageRatio)
    && reading.coverageRatio < 1
    && owner
  ) {
    const week = weekKey(ctx.now) || dayKey(ctx.now);
    const tag = `${SOLVENCY_RULE_IDS.READ}:coverage:${week}`;
    if (!seen(draft, tag)) {
      addMarker(draft, tag);
      const decision = governedDecision(ctx,
        owner.name || draft.settings?.leaderName || '',
        'What leaves the promise book this month?',
        `The frozen reading of ${String(reading.frozenAt).slice(0, 10)} found coverage of ${reading.coverageRatio}×: `
          + `${report.capacity.dueNext28} promise(s) fall due in the next four weeks and the workspace's own record settles `
          + `${report.capacity.servicePerWeek} promise(s) per week. The forward book carries ${reading.expectedBreaches ?? report.joint.expectedBreaches} `
          + `expected breach(es) against a ${report.alarm.pct}% alarm. A capacity deficit is not solved by working harder; `
          + `it is solved by removing work, moving a date with a stated reason, or handing authority over. Which is it?`,
        [
          { label: 'Cut scope: retire the lowest-stakes promises and say so', pros: 'Removes demand from the constraint immediately and is the only option that costs nothing to the other side.', cons: 'Something promised is not delivered; the cut has to be communicated, not quietly dropped.' },
          { label: 'Renegotiate the top exposures to later named dates', pros: 'Keeps every promise alive and converts a surprise breach into a stated change.', cons: 'Each move spends trust now and is capped — a second move on the same promise is a pattern.' },
          { label: 'Hand work over: delegate authority, not just tasks', pros: 'Raises settlement capacity rather than lowering the book, which is the only structural fix.', cons: 'Slower to land and depends on someone else accepting the authority.' },
        ],
        `Opened by ${SOLVENCY_RULE_IDS.READ} on a measured coverage deficit. No date, probability or record was changed by this rule.`);
      if (!Array.isArray(draft.decisions)) draft.decisions = [];
      draft.decisions.unshift(decision);
      effects.push(effect(SOLVENCY_RULE_IDS.READ, 'created', 'decision', decision.id,
        'Opened one governed decision on a coverage deficit.'));
      if (link(draft, ctx, 'solvencyreading', reading.id, 'decision', decision.id,
        'underwrites-commitment', SOLVENCY_RULE_IDS.READ,
        'Frozen reading underwrites this capacity decision')) {
        effects.push(effect(SOLVENCY_RULE_IDS.READ, 'linked', 'decision', decision.id,
          'Linked the reading to the decision it underwrites.'));
      }
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- SLV-02 */

function scanRule(draft, ctx, conventions) {
  const report = solvencyReport(draft, ctx.now, ctx.settings || draft.settings || {});
  const owner = ownerOf(draft);
  const effects = [];
  const today = dayKey(ctx.now);

  /* Overdue promises: one repair task per promise, ever. */
  let opened = 0;
  for (const promise of report.overduePromises) {
    if (opened >= 2 || !owner) break;
    const tag = `${SOLVENCY_RULE_IDS.OVERDUE}:promise:${promise.sourceKey}:${promise.promiseId}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    opened += 1;
    const late = Math.abs(promise.daysUntil);
    const task = newTask(ctx, owner.id,
      `Acknowledge a broken promise: ${String(promise.label).slice(0, 100)}`,
      `This promise (${promise.sourceLabel.toLowerCase()}) was due ${promise.obligationOn} and is ${late} day(s) late. `
        + 'The other side already knows. Say the sentence before they have to ask: what slipped, what is true now, and what the new date is — '
        + 'or that there is no new date and the commitment is withdrawn. '
        + (promise.moves > 0 ? `This date has already moved ${promise.moves} time(s) against a cap of ${conventions.solvencyMaxMoves}. ` : '')
        + 'Acknowledging a breach costs one conversation. Letting it be discovered costs the reason people believe the next date you give them.',
      `${SOLVENCY_RULE_IDS.OVERDUE}: the repair is a conversation, not a field edit.`,
      tag, 5);
    pushTask(draft, task);
    effects.push(effect(SOLVENCY_RULE_IDS.OVERDUE, 'created', 'delegation', task.id,
      'Opened one acknowledgement task for an overdue promise.'));
    if (SOLVENCY_GRAPH_TYPE[promise.sourceKey]
      && link(draft, ctx, 'delegation', task.id, SOLVENCY_GRAPH_TYPE[promise.sourceKey], promise.promiseId,
        'renegotiates', SOLVENCY_RULE_IDS.OVERDUE, 'Task opened to repair this overdue promise')) {
      effects.push(effect(SOLVENCY_RULE_IDS.OVERDUE, 'linked', promise.sourceKey, promise.promiseId,
        'Linked the acknowledgement task to the promise.'));
    }
  }

  /* A promise that has reached its move cap gets a decision, not a reminder. */
  const capped = report.book.filter((p) => p.moves >= conventions.solvencyMaxMoves);
  for (const promise of capped.slice(0, 1)) {
    const tag = `${SOLVENCY_RULE_IDS.OVERDUE}:decide:${promise.sourceKey}:${promise.promiseId}`;
    if (seen(draft, tag) || !owner) continue;
    addMarker(draft, tag);
    const decision = governedDecision(ctx,
      owner.name || draft.settings?.leaderName || '',
      `Resolve a promise that has moved ${promise.moves} times`,
      `“${String(promise.label).slice(0, 140)}” (${promise.sourceLabel.toLowerCase()}) has been renegotiated ${promise.moves} time(s) `
        + `and the declared cap is ${conventions.solvencyMaxMoves}. Its current obligation is ${promise.obligationOn}. `
        + 'Another date would be the same promise made a fourth time with less credibility. Choose one of three and record it: '
        + 'cut the scope so the date holds, hand the obligation to someone with the capacity and the authority, '
        + 'or withdraw it explicitly and say what will not happen.',
      [
        { label: 'Cut the scope until the current date is real', pros: 'Keeps the promise and the relationship; a smaller promise kept is worth more than a large one moved.', cons: 'Requires saying what is no longer included, out loud, to the other side.' },
        { label: 'Hand the obligation over with the authority it needs', pros: 'Converts a personal failure into a structural fix and builds someone else.', cons: 'Only works if the authority moves with it — a task handed over without authority comes back.' },
        { label: 'Withdraw the promise and say so', pros: 'Ends a false expectation, which is the honest floor of this decision.', cons: 'Costs the most in the short term and must be said directly rather than implied.' },
      ],
      `Opened by ${SOLVENCY_RULE_IDS.OVERDUE} because the date has hit the declared move cap. This rule does not move the date.`);
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.unshift(decision);
    effects.push(effect(SOLVENCY_RULE_IDS.OVERDUE, 'created', 'decision', decision.id,
      'Opened one governed decision for a promise at its move cap.'));
  }

  /* The alarm: one blameless process question per 30-day bucket. */
  if (report.alarm.breached && owner) {
    const tag = `${SOLVENCY_RULE_IDS.ALARM}:bucket:${bucket30(ctx.now)}`;
    if (!seen(draft, tag)) {
      addMarker(draft, tag);
      const task = newTask(ctx, owner.id,
        'Why is the book over-sold? (process, not people)',
        `${report.joint.breachSharePct}% of the forward book is expected to break (${report.jointed ?? ''}${report.joint.expectedBreaches} breach(es) across `
          + `${report.counts.withinHorizon} promise(s)), against your ${report.alarm.pct}% alarm, and coverage is `
          + `${report.capacity.coverageRatio === null ? 'unmeasurable' : `${report.capacity.coverageRatio}×`}. `
          + 'This is a process question: which promises are being made without anyone checking the book first, '
          + 'and what would have to change so a date cannot be given without one? Candidates: a written '
          + '"check the book" step before committing to any date; a standing ceiling on open promises; or moving '
          + 'date-setting authority closer to the work. This task is blameless — no person is named in it and none should be.',
        `${SOLVENCY_RULE_IDS.ALARM}: fires once per 30-day bucket, never per promise.`,
        tag, 14);
      pushTask(draft, task);
      effects.push(effect(SOLVENCY_RULE_IDS.ALARM, 'created', 'delegation', task.id,
        'Opened one blameless process task on an over-sold book.'));
    }
  }

  /* Grading work for a reading whose window closed ungraded. */
  for (const reading of report.readings.filter((r) => r.gradeable).slice(0, 1)) {
    const tag = `${SOLVENCY_RULE_IDS.GRADE}:reading:${reading.id}`;
    if (seen(draft, tag) || !owner) continue;
    addMarker(draft, tag);
    const task = newTask(ctx, owner.id,
      'Grade the frozen promise reading',
      `The reading frozen on ${String(reading.frozenAt).slice(0, 10)} quoted a ${reading.predictedAnyBreachPct}% chance of at least one breach `
        + `inside ${reading.horizonDays} days (assumption-free ceiling ${reading.predictedCeilingPct}%) and had a review date of ${reading.reviewOn}. `
        + 'Grading writes the outcome and the Brier loss exactly once, from the record. A reading nobody grades cannot tell you whether you price your own promises well.',
      `${SOLVENCY_RULE_IDS.GRADE}: frozen probabilities are scored once, later.`,
      tag, 5);
    pushTask(draft, task);
    effects.push(effect(SOLVENCY_RULE_IDS.GRADE, 'created', 'delegation', task.id,
      'Opened one task to grade an overdue solvency reading.'));
  }

  /* Reconciliation: edges belonging to readings that no longer exist. */
  const readingIds = new Set((Array.isArray(draft.solvencyReadings) ? draft.solvencyReadings : []).map((r) => r && r.id));
  if (Array.isArray(draft.links)) {
    const before = draft.links.length;
    draft.links = draft.links.filter((entry) => {
      if (!entry) return false;
      if (entry.sourceType === 'solvencyreading' && !readingIds.has(entry.sourceId)) return false;
      if (entry.targetType === 'solvencyreading' && !readingIds.has(entry.targetId)) return false;
      return true;
    });
    if (before !== draft.links.length) {
      effects.push(effect(SOLVENCY_RULE_IDS.RECONCILE, 'reconciled', 'workspace', '',
        `Dropped ${before - draft.links.length} stale solvency edge(s).`));
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- engine */

export { SOLVENCY_EVENTS, SOLVENCY_RULE_IDS };

export function solvencyRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const conventions = solvencyConventions(ctx.settings || draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now };
  let effects = [];
  const type = ctx.event.type;
  if (type === SOLVENCY_EVENTS.FROZEN) {
    if (!conventions.solvencyAutoPropagate) return [];
    effects = readingFrozenRule(draft, scoped, conventions);
  } else if (type === SOLVENCY_EVENTS.SCAN) {
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
      entity: 'solvencyreading',
      entityId: ctx.event?.entityId || '',
      summary: `Promise solvency: ${parts.join(', ')}`.slice(0, 300),
    });
  }
  for (const entry of effects) {
    if (Array.isArray(ctx.out)) ctx.out.push(entry);
  }
  return effects;
}

solvencyRule.id = 'solvencyRule';
solvencyRule.label = 'Promise solvency propagation (RULE-SLV-01..05)';
solvencyRule.module = 'solvencyRules.js';
solvencyRule.triggers = [...Object.values(SOLVENCY_EVENTS)];
solvencyRule.effect = (draft, event, context = {}) => solvencyRule(draft, { ...context, event });
Object.freeze(solvencyRule);
