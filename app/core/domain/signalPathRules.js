/**
 * app/core/domain/signalPathRules.js — the post-commit side of the Signal Path
 * terminal (Schema v59) on the shared rule spine (ADR-0008).
 *
 * A reach figure that lives only on its own screen is a diagram. These rules
 * make the path structural: the people on a committed channel become typed
 * nodes, a contradicted declaration becomes a decision with an owner, a case
 * that lands on a blind path is linked to the class it belongs to, and an
 * adopted intervention becomes owned, dated work rather than an intention.
 *
 *  RULE-SIG-01  `signal.declared`
 *               One `reaches` edge from the class to every person on its
 *               declared chain, so "who is on this path" is answerable from
 *               either end. Typed, idempotent, and never a duplicate.
 *
 *  RULE-SIG-02  `signal.probed`
 *               When a settled probe contradicts the declaration — observed
 *               delivery more than `sigUnderReachPp` below the frozen reach —
 *               open exactly ONE DACI decision naming the channel redesign, ONE
 *               owned dated task on the class owner, and a `signals` edge from
 *               the class to the decision. Below the probe floor, nothing is
 *               created: a verdict on three observations is noise with a label.
 *
 *  RULE-SIG-03  `case.created` / `case.updated` / `case.reopened`
 *               A case owned by someone whose own path to the leader clears less
 *               than the blind floor is linked to every committed class that
 *               prices that exposure, and the class gains one note naming the
 *               hop. This is the cross-module half: the case module never has to
 *               know that a channel model exists.
 *
 *  RULE-SIG-04  `signal.lever`
 *               One owned, dated delegation per adopted lever, carrying the
 *               hours it costs and the reading it was adopted to buy, plus a
 *               `tracks-followup` edge back to the class. An intervention
 *               without an owner and a date is a wish.
 *
 * Every write is marker-idempotent and every write leaves an `automation.step`
 * trace in the append-only event log.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  SIGNAL_DECLARED_EVENT,
  SIGNAL_LEVER_EVENT,
  SIGNAL_PROBED_EVENT,
  SIGNAL_RULE_IDS,
  buildReportingIndex,
  conventionsFromSettings,
  evaluateChannel,
  hopsFor,
  readClass,
} from './signalPath.js';
import { freezeSignalPrediction } from './signalPathSchema.js';

const NOTE_MAX = 900;
const NOTE_CAP = 24;
const CASE_EVENTS = new Set(['case.created', 'case.updated', 'case.reopened', 'case.resolved']);

function hasMarker(rows, field, tag) {
  const token = `[${tag}]`;
  return (rows || []).some((row) => row && typeof row[field] === 'string' && row[field].includes(token));
}

function note(record, { source, text }) {
  if (!record) return;
  record.notes = Array.isArray(record.notes) ? record.notes : [];
  record.notes.push({
    at: new Date().toISOString(),
    source,
    text: String(text).slice(0, NOTE_MAX),
  });
  if (record.notes.length > NOTE_CAP) record.notes.splice(0, record.notes.length - NOTE_CAP);
}

function history(record, { type, summary }) {
  if (!record) return;
  record.history = Array.isArray(record.history) ? record.history : [];
  record.history.push({
    at: new Date().toISOString(),
    type: String(type || 'updated').slice(0, 40),
    summary: String(summary || '').slice(0, 400),
  });
  if (record.history.length > 40) record.history.splice(0, record.history.length - 40);
}

function mark(record, tag) {
  if (!record) return;
  record.markers = Array.isArray(record.markers) ? record.markers : [];
  if (!record.markers.includes(tag)) record.markers.push(tag);
}

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function linkEntity(ctx, draft, spec) {
  const { created } = ensureEntityLink(draft, spec, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  });
  return created;
}

function decisionRecord(ctx, { title, question, options, reviewOn, rationale }) {
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: String(title).slice(0, 200),
    question: String(question).slice(0, 2000),
    date: today,
    reversibility: 'reversible',
    driver: String(ctx.draft?.settings?.leaderName || '').slice(0, 120),
    approver: String(ctx.draft?.settings?.leaderName || '').slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '',
    rationale: String(rationale || '').slice(0, 4000),
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
  return {
    id: ctx.idFactory('delegation'),
    personId,
    title: String(title).slice(0, 200),
    expectedOutcome: String(expectedOutcome).slice(0, 2000),
    authority: 'act-inform',
    support: String(support).slice(0, 2000),
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

function findClass(draft, classId) {
  return (Array.isArray(draft.signalClasses) ? draft.signalClasses : []).find((row) => row && row.id === classId) || null;
}

/* ------------------------------------------------------------- RULE-SIG-01 */

function attachChain(draft, ctx, klass) {
  const conventions = conventionsFromSettings(draft.settings);
  const index = buildReportingIndex(draft.people || []);
  const built = hopsFor(klass, index, draft, conventions, ctx.now);
  if (!built.hops.length) {
    note(klass, {
      source: SIGNAL_RULE_IDS.DECLARE,
      text: `No path could be built, so no chain was attached: ${built.reason || 'the origin person is missing'}.`,
    });
    return [];
  }
  let created = 0;
  for (const hop of built.hops) {
    if (linkEntity(ctx, draft, {
      sourceType: 'signal',
      sourceId: klass.id,
      targetType: 'person',
      targetId: hop.personId,
      relation: 'reaches',
      ruleId: SIGNAL_RULE_IDS.DECLARE,
      summary: `Relay at declared depth ${built.chain.find((n) => n.personId === hop.personId)?.depthFromOrigin ?? '?'} on the “${String(klass.label || '').slice(0, 60)}” channel.`,
    })) created += 1;
  }
  if (klass.ownerId) {
    if (linkEntity(ctx, draft, {
      sourceType: 'signal',
      sourceId: klass.id,
      targetType: 'person',
      targetId: klass.ownerId,
      relation: 'involves',
      ruleId: SIGNAL_RULE_IDS.DECLARE,
      summary: 'Owns the channel this class relies on.',
    })) created += 1;
  }
  mark(klass, 'chainAttached');
  return created
    ? [effect(SIGNAL_RULE_IDS.DECLARE, 'linked', 'signalClass', klass.id,
      `Attached ${created} typed edge(s) across a ${built.hops.length}-hop declared path.`)]
    : [];
}

/* ------------------------------------------------------------- RULE-SIG-02 */

function repairContradicted(draft, ctx, klass) {
  const conventions = conventionsFromSettings(draft.settings);
  const index = buildReportingIndex(draft.people || []);
  const reading = readClass(klass, draft, index, conventions, ctx.now);
  if (!reading.observed.ready || !reading.observed.underReach) return [];
  const tag = `${SIGNAL_RULE_IDS.PROBE}:contradicted`;
  if (hasMarker(draft.decisions, 'rationale', tag)) return [];
  const observed = reading.observed;
  const declaredPct = Math.round((observed.declaredReach || 0) * 100);
  const observedPct = Math.round((observed.observedReach?.p || 0) * 100);
  const reviewOn = dayKey(addDays(ctx.now, conventions.reviewHorizonDays));
  const options = [
    [
      'Add a parallel branch',
      `Raises reach without asking any relay to change behaviour. A skip-level or an escalation line adds a second path, and the Levers tab prices each one against the measured gap.`,
      'Assumes the branches fail independently; a channel that bypasses the chain also bypasses the context the chain was adding.',
    ],
    [
      'Change the relays',
      'Attacks the suppression itself — a blameless review habit, a shorter cadence, an explicit "bad news travels fast" norm.',
      'Slow, and it is a claim about human behaviour rather than arithmetic.',
    ],
    [
      'Accept the reach and re-price the risk',
      `Keep the channel at ${observedPct}% and raise the declared exposure or prior so the loss it implies is visible in the budget instead of hidden in an assumption.`,
      'The loss is real either way; this option only stops the page from flattering it.',
    ],
  ];
  const decision = decisionRecord(ctx, {
    title: `The “${klass.label}” channel delivers ${observedPct}%, not ${declaredPct}%`,
    question: `The declared reach for “${klass.label}” was ${declaredPct}%; ${observed.eventCount} settled probe(s) delivered ${observed.hitCount}, so the observed rate is ${observedPct}% and the frozen predictions scored a Brier of ${observed.brier?.score ?? '—'}. Which redesign do you commit to before ${reviewOn}?`,
    options,
    reviewOn,
    rationale: `Generated on ${dayKey(ctx.now)} from the probe ledger. Every figure is a count of probes you recorded, not a measurement of any person on the path. [${tag}]`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.unshift(decision);
  linkEntity(ctx, draft, {
    sourceType: 'signal',
    sourceId: klass.id,
    targetType: 'decision',
    targetId: decision.id,
    relation: 'signals',
    ruleId: SIGNAL_RULE_IDS.PROBE,
    summary: 'The probe ledger contradicted this channel declaration.',
  });
  const effects = [effect(SIGNAL_RULE_IDS.PROBE, 'created', 'decision', decision.id,
    `Opened one channel-redesign decision (declared ${declaredPct}%, observed ${observedPct}%).`)];

  if (klass.ownerId) {
    const tag2 = `${SIGNAL_RULE_IDS.PROBE}:task`;
    if (!hasMarker(draft.delegations, 'support', tag2)) {
      const delegation = delegationRecord(ctx, {
        personId: klass.ownerId,
        title: `Run one probe a week on the “${String(klass.label || '').slice(0, 80)}” channel`,
        expectedOutcome: `Record one fact that already existed down the chain and whether it reached the leader unprompted, for four weeks. The channel is declared at ${declaredPct}% and observed at ${observedPct}%; the point is a bigger sample, not a defence of either number.`,
        support: `Opened when the probe ledger contradicted the declaration. The probes are questions, not surveillance: each one records something the leader already knows about and asks how they came to know it. [${tag2}]`,
        dueOn: reviewOn,
      });
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.push(delegation);
      linkEntity(ctx, draft, {
        sourceType: 'signal',
        sourceId: klass.id,
        targetType: 'delegation',
        targetId: delegation.id,
        relation: 'tracks-followup',
        ruleId: SIGNAL_RULE_IDS.PROBE,
        summary: 'Owned probe collection after a contradicted declaration.',
      });
      effects.push(effect(SIGNAL_RULE_IDS.PROBE, 'created', 'delegation', delegation.id,
        'Opened one owned probe-collection task on the class owner.'));
    }
  } else {
    note(klass, {
      source: SIGNAL_RULE_IDS.PROBE,
      text: 'The declaration is contradicted but no owner is named, so no task was opened. Name an owner — a channel nobody owns is the reason it has no owner.',
    });
  }
  history(klass, {
    type: 'contradicted',
    summary: `Observed ${observedPct}% against a declared ${declaredPct}% over ${observed.eventCount} probe(s).`,
  });
  return effects;
}

/* ------------------------------------------------------------- RULE-SIG-03 */

function reachFromPerson(draft, personId, conventions, now) {
  const index = buildReportingIndex(draft.people || []);
  if (!index.byId.has(personId)) return null;
  const built = hopsFor({ pathPersonId: personId, overrides: {} }, index, draft, conventions, now);
  if (!built.hops.length) return null;
  return evaluateChannel({ hops: built.hops, direct: { enabled: false }, theta: 0.5, exposure: null, horizonDays: null });
}

function linkBlindCase(draft, ctx, event) {
  const conventions = conventionsFromSettings(draft.settings);
  if (!conventions.autoPropagate) return [];
  const caseId = event.entityId;
  const record = (draft.cases || []).find((row) => row && row.id === caseId);
  if (!record) return [];
  if (event.type === 'case.resolved') return [];
  const ownerId = record.ownerId;
  if (!ownerId) return [];
  const classes = (draft.signalClasses || []).filter((row) => row && row.status === 'committed');
  if (!classes.length) return [];
  const reach = reachFromPerson(draft, ownerId, conventions, ctx.now);
  if (!reach) return [];
  if (reach.reach >= conventions.blindFloor) return [];
  const effects = [];
  for (const klass of classes) {
    // Only the classes that price this kind of money: same currency, declared
    // exposure, and an exposure at or above the class's own floor. Linking a
    // trivial case to a nine-figure class would be decoration.
    if ((klass.currency || 'USD') !== (record.financial?.currency || 'USD')) continue;
    if (klass.exposure === null || klass.exposure === undefined) continue;
    const created = linkEntity(ctx, draft, {
      sourceType: 'signal',
      sourceId: klass.id,
      targetType: 'case',
      targetId: record.id,
      relation: 'signals',
      ruleId: SIGNAL_RULE_IDS.CASE,
      summary: 'A case opened on this channel landed where the declared reach is below the blind floor.',
    });
    if (!created) continue;
    const tag = `${SIGNAL_RULE_IDS.CASE}:${record.id}`;
    if (!hasNoteMarker(klass, tag)) {
      note(klass, {
        source: SIGNAL_RULE_IDS.CASE,
        text: `Case “${String(record.title || '').slice(0, 80)}” was opened by ${nameOf(draft, ownerId)} at ${reach.hopCount} hop(s), where the declared channel delivers ${Math.round(reach.reach * 100)}%. If that case had needed to travel the chain to reach you, this is the route it would have taken. [${tag}]`,
      });
    }
    effects.push(effect(SIGNAL_RULE_IDS.CASE, 'linked', 'case', record.id,
      `Linked a case opened at ${Math.round(reach.reach * 100)}% reach to the “${String(klass.label || '').slice(0, 50)}” class.`));
  }
  return effects;
}

function hasNoteMarker(record, tag) {
  const token = `[${tag}]`;
  return (record?.notes || []).some((row) => typeof row?.text === 'string' && row.text.includes(token));
}

function nameOf(draft, personId) {
  const person = (draft.people || []).find((row) => row && row.id === personId);
  return person ? String(person.name || 'the owner') : 'someone no longer on the roster';
}

/* ------------------------------------------------------------- RULE-SIG-04 */

function openLeverWork(draft, ctx, lever) {
  const tag = `${SIGNAL_RULE_IDS.LEVER}:${lever.id}`;
  if (hasMarker(draft.delegations, 'support', tag)) return [];
  const klass = findClass(draft, lever.classId);
  if (!klass) return [];
  const conventions = conventionsFromSettings(draft.settings);
  const ownerId = lever.ownerId || klass.ownerId;
  const reviewOn = lever.reviewOn || dayKey(addDays(ctx.now, conventions.reviewHorizonDays));
  if (!ownerId) {
    note(klass, {
      source: SIGNAL_RULE_IDS.LEVER,
      text: `“${String(lever.label || 'A lever').slice(0, 80)}” was adopted with no owner, so no task was opened. The hours are the cost; whoever spends them should be named.`,
    });
    return [];
  }
  const delegation = delegationRecord(ctx, {
    personId: ownerId,
    title: `Run: ${String(lever.label || 'signal path intervention').slice(0, 120)}`,
    expectedOutcome: `Spend ${lever.hours ?? '—'} hour(s) putting “${String(lever.label || '').slice(0, 80)}” in place on the “${String(klass.label || '').slice(0, 60)}” channel, then record one probe against it. `
      + `Declared reach moves ${Math.round((lever.reachBefore || 0) * 100)}% → ${Math.round((lever.reachAfter || 0) * 100)}%, and the wait ${lever.latencyBefore ?? '—'} d → ${lever.latencyAfter ?? '—'} d. Both are model output, not promises.`,
    support: `Opened by an adopted Signal Path lever. The intervention is graded by the probe ledger and the class review, never by whether the task was completed. [${tag}]`,
    dueOn: reviewOn,
  });
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.push(delegation);
  linkEntity(ctx, draft, {
    sourceType: 'signal',
    sourceId: klass.id,
    targetType: 'delegation',
    targetId: delegation.id,
    relation: 'tracks-followup',
    ruleId: SIGNAL_RULE_IDS.LEVER,
    summary: 'Owned work created when this channel intervention was adopted.',
  });
  history(klass, {
    type: 'lever-adopted',
    summary: `Adopted “${String(lever.label || '').slice(0, 80)}” for ${lever.hours ?? '—'} h.`,
  });
  return [effect(SIGNAL_RULE_IDS.LEVER, 'created', 'delegation', delegation.id,
    `Opened owned work for an adopted lever (${lever.hours ?? '—'} h).`)];
}

/* ------------------------------------------------------------------ entry */

export function signalPathRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const type = ctx.event.type;
  const ruleCtx = {
    now: ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now()),
    event: ctx.event,
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
    draft,
  };
  let effects = [];
  if (type === SIGNAL_DECLARED_EVENT) {
    const klass = findClass(draft, ctx.event.entityId);
    if (!klass || klass.status !== 'committed') return [];
    const conventions = conventionsFromSettings(draft.settings);
    if (!conventions.autoPropagate) return [];
    if (klass.markers?.includes('chainAttached')) return [];
    const index = buildReportingIndex(draft.people || []);
    const reading = readClass(klass, draft, index, conventions, ruleCtx.now);
    if (reading.observed.ready && reading.observed.underReach) {
      effects = repairContradicted(draft, ruleCtx, klass);
    }
    effects = [...effects, ...attachChain(draft, ruleCtx, klass)];
  } else if (type === SIGNAL_PROBED_EVENT) {
    const klass = findClass(draft, ctx.event.entityId);
    if (!klass || klass.status !== 'committed') return [];
    const conventions = conventionsFromSettings(draft.settings);
    if (!conventions.autoPropagate) return [];
    effects = repairContradicted(draft, ruleCtx, klass);
  } else if (type === SIGNAL_LEVER_EVENT) {
    const conventions = conventionsFromSettings(draft.settings);
    if (!conventions.autoPropagate) return [];
    const lever = (draft.signalLevers || []).find((row) => row && row.id === ctx.event.entityId);
    if (!lever) return [];
    effects = openLeverWork(draft, ruleCtx, lever);
  } else if (CASE_EVENTS.has(type)) {
    effects = linkBlindCase(draft, ruleCtx, ctx.event);
  } else {
    return [];
  }
  for (const row of effects) {
    if (typeof ctx.logEvent === 'function') {
      ctx.logEvent({
        type: 'automation.step',
        entity: 'signalClass',
        entityId: ctx.event.entityId,
        summary: `[${row.ruleId}] ${row.summary}`.slice(0, 300),
      });
    }
  }
  return effects;
}

/** Exposed so the view can explain the rule thresholds it is showing. */
export function signalPathRuleThresholds(settings = {}) {
  const conventions = conventionsFromSettings(settings);
  return {
    blindFloor: conventions.blindFloor,
    underReachPp: conventions.underReachPp,
  };
}

export { freezeSignalPrediction };
