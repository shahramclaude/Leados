/**
 * Consequence Lab's five post-commit rules on the shared, transactional spine.
 * Frozen scenario -> typed decision/adjacency edges, one verification task for
 * a breached premise, one coordination decision for materially priced coupled
 * calls; explicit scan -> one due grading task and stale-edge reconciliation;
 * graded surprise -> one blameless process-learning task. No option is chosen,
 * no message sent and no operational record silently changed.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { consequenceForDecision, consequenceConventions } from './consequence.js';

export const CONSEQUENCE_RULE_IDS = Object.freeze({
  MAP: 'RULE-CSQ-01', VERIFY: 'RULE-CSQ-02', COORDINATE: 'RULE-CSQ-03', GRADE: 'RULE-CSQ-04', LEARN: 'RULE-CSQ-05',
});
export const CONSEQUENCE_EVENTS = Object.freeze({
  FROZEN: 'consequence.frozen', SCAN: 'consequence.scan', GRADED: 'consequence.graded',
});

function ownerOf(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  return people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId))) || null;
}
function addMarker(draft, tag) {
  draft.consequenceMarkers = Array.isArray(draft.consequenceMarkers) ? draft.consequenceMarkers : [];
  if (draft.consequenceMarkers.includes(tag)) return false;
  draft.consequenceMarkers.push(tag);
  if (draft.consequenceMarkers.length > 400) draft.consequenceMarkers.splice(0, draft.consequenceMarkers.length - 400);
  return true;
}
function seen(draft, tag) {
  return (draft.consequenceMarkers || []).includes(tag);
}
function eff(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}
function link(draft, ctx, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(draft, {
    sourceType: 'consequence', sourceId, targetType, targetId, relation, ruleId, summary,
  }, { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() }).created;
}
function newTask(ctx, ownerId, title, outcome, support, tag, dueDays = 7) {
  return {
    id: ctx.idFactory('delegation'), personId: ownerId, title: title.slice(0, 200),
    expectedOutcome: outcome.slice(0, 2000), authority: 'act-inform',
    support: `${support.slice(0, 1800)} [${tag}]`,
    delegatedOn: dayKey(ctx.now), dueOn: dayKey(addDays(ctx.now, dueDays)),
    status: 'active', checkins: [], completedOn: null, completionNote: '',
    returnedOn: null, returnReason: '', createdAt: ctx.now.toISOString(), updatedAt: ctx.now.toISOString(),
  };
}
function newDecision(ctx, ownerName, title, question, weekly, currency) {
  return {
    id: ctx.idFactory('dec'), title: title.slice(0, 200), question: question.slice(0, 2000),
    date: dayKey(ctx.now), reversibility: 'reversible', driver: ownerName.slice(0, 120),
    approver: ownerName.slice(0, 120), contributors: '', informed: '',
    options: [
      { id: ctx.idFactory('opt'), label: 'Sequence the coupled calls together', pros: 'Resolve shared dependencies once and agree on an order.', cons: 'Requires coordination now.' },
      { id: ctx.idFactory('opt'), label: 'Buy a narrow verification first', pros: 'Test the recorded fragile premise before choosing a sequence.', cons: 'Waiting still carries a priced exposure.' },
      { id: ctx.idFactory('opt'), label: 'Proceed independently and record why', pros: 'Allows parallel movement if the links do not block one another.', cons: 'The recorded adjacency may conceal a shared bottleneck.' },
    ],
    chosen: '', rationale: `Opened by ${CONSEQUENCE_RULE_IDS.COORDINATE}. ${currency} ${weekly.toFixed(2)}/week is the ROOT call's recorded price. Other linked items' prices are conditional ceilings, not incremental losses — no prices are added together here. The leader chooses, not the rule.`,
    reviewOn: dayKey(addDays(ctx.now, 21)), reviewedOn: null, outcome: 'pending', outcomeNotes: '',
    forecastProbability: null, decidedOn: null, createdAt: ctx.now.toISOString(),
  };
}

function mapReading(draft, ctx, reading) {
  const effects = [];
  const tag = `${CONSEQUENCE_RULE_IDS.MAP}:${reading.id}`;
  if (seen(draft, tag)) return effects;
  const decision = (draft.decisions || []).find((d) => d.id === reading.decisionId);
  if (!decision) return effects;
  addMarker(draft, tag);
  if (link(draft, ctx, reading.id, 'decision', reading.decisionId, 'maps-consequence', CONSEQUENCE_RULE_IDS.MAP,
    `Frozen ${reading.horizonWeeks}-week decision-future scenario; adjacency is not causality`)) {
    effects.push(eff(CONSEQUENCE_RULE_IDS.MAP, 'linked', 'decision', reading.decisionId,
      `Mapped one frozen ${reading.horizonWeeks}-week reading to its source decision.`));
  }
  for (const target of reading.targets || []) {
    if (link(draft, ctx, reading.id, target.type, target.id, 'surfaces-impact', CONSEQUENCE_RULE_IDS.MAP,
      'First-order typed adjacency at freeze; not a predicted effect')) {
      effects.push(eff(CONSEQUENCE_RULE_IDS.MAP, 'linked', target.type, target.id,
        'Linked a recorded first-order operational neighbour to the frozen reading (not a causal assertion).'));
    }
  }
  return effects;
}

function verifyPremise(draft, ctx, reading, focused, owner) {
  const fragile = focused?.footprint.fragile || [];
  const tag = `${CONSEQUENCE_RULE_IDS.VERIFY}:${reading.id}`;
  if (!fragile.length || !owner || seen(draft, tag)) return [];
  addMarker(draft, tag);
  const task = newTask(ctx, owner.id,
    'Verify the weakest load-bearing premise before this decision waits',
    `${fragile.length} linked premise(s) are at watch/breach. Check the signpost and its dated evidence, then record whether the assumption still holds and which decision option that changes. A shared graph path is not proof this premise causes the delay.`,
    `${CONSEQUENCE_RULE_IDS.VERIFY} from the frozen consequence reading. Do not change an assumption on the basis of this task alone.`, tag);
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift(task);
  const effects = [eff(CONSEQUENCE_RULE_IDS.VERIFY, 'created', 'delegation', task.id,
    `Opened one owned verification task for ${fragile.length} watch/breached premise(s).`)];
  if (link(draft, ctx, reading.id, 'delegation', task.id, 'tracks-followup', CONSEQUENCE_RULE_IDS.VERIFY,
    'Leader-owned verification before a coupled timing call')) {
    effects.push(eff(CONSEQUENCE_RULE_IDS.VERIFY, 'linked', 'delegation', task.id, 'Linked the verification task to the reading.'));
  }
  return effects;
}

function coordinate(draft, ctx, reading, focused, owner, conventions) {
  const coupled = focused?.footprint.coupled || [];
  const weekly = focused?.row?.price?.weeklyAmount;
  const currency = focused?.row?.price?.currency;
  const tag = `${CONSEQUENCE_RULE_IDS.COORDINATE}:${reading.decisionId}:${weekKey(ctx.now)}`;
  if (!owner || !coupled.length || !Number.isFinite(weekly) || weekly < conventions.triageWeekly
      || !currency || seen(draft, tag)) return [];
  addMarker(draft, tag);
  const decision = newDecision(ctx, owner.name || draft.settings?.leaderName || '',
    `Sequence ${coupled.length + 1} linked decisions before the priced wait compounds`,
    `A root decision carries ${currency} ${weekly.toFixed(2)}/week in derived or declared delay price and sits within two recorded hops of ${coupled.length} other open decision(s). Which call must be settled first, what shared premise should be tested, and which links are merely context?`,
    weekly, currency);
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.unshift(decision);
  const effects = [eff(CONSEQUENCE_RULE_IDS.COORDINATE, 'created', 'decision', decision.id,
    `Opened one DACI coordination decision for a ${currency} ${weekly.toFixed(2)}/week root wait with ${coupled.length} coupled call(s).`)];
  if (link(draft, ctx, reading.id, 'decision', decision.id, 'surfaces-impact', CONSEQUENCE_RULE_IDS.COORDINATE,
    'Governed sequencing choice, not an automatic option selection')) {
    effects.push(eff(CONSEQUENCE_RULE_IDS.COORDINATE, 'linked', 'decision', decision.id,
      'Linked the sequencing decision back to the frozen reading.'));
  }
  return effects;
}

function scan(draft, ctx, owner) {
  const effects = [];
  // Remove only this module's links when a reading or its target was deleted.
  // Never reconcile another rule's link or any manually authored provenance.
  const before = (draft.links || []).length;
  const readings = new Set((draft.consequenceReadings || []).map((r) => r.id));
  const collections = { decision: 'decisions', delegation: 'delegations', case: 'cases', goal: 'goals',
    portfolio: 'portfolio', budget: 'budgets', premise: 'premises', dependency: 'dependencies',
    stakeholder: 'stakeholders', change: 'changes', negotiation: 'negotiations', strategy: 'strategyBets', voi: 'voiDecisions' };
  draft.links = (draft.links || []).filter((l) => {
    if (l?.sourceType !== 'consequence' || !Object.values(CONSEQUENCE_RULE_IDS).includes(l.ruleId)) return true;
    if (!readings.has(l.sourceId)) return false;
    const col = collections[l.targetType];
    return col ? (draft[col] || []).some((r) => r?.id === l.targetId) : false;
  });
  if (draft.links.length < before) effects.push(eff(CONSEQUENCE_RULE_IDS.GRADE, 'reconciled', 'links', '',
    `Removed ${before - draft.links.length} stale Consequence Lab edge(s).`));
  if (!owner) return effects;
  for (const reading of draft.consequenceReadings || []) {
    if (reading.graded || reading.reviewOn > dayKey(ctx.now)
      || !(draft.decisions || []).some((d) => d.id === reading.decisionId)) continue;
    const tag = `${CONSEQUENCE_RULE_IDS.GRADE}:${reading.id}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const task = newTask(ctx, owner.id, 'Grade a frozen decision-future prediction',
      `Review the decision's recorded decidedOn date against the horizon frozen before it happened (${reading.horizonWeeks} week(s)). Score once with Brier; do not infer the date from a title, chosen option without a date, or anyone's intention.`,
      `${CONSEQUENCE_RULE_IDS.GRADE} flagged an overdue reading. If its source was removed, the grade will refuse rather than invent an outcome.`, tag, 3);
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift(task);
    effects.push(eff(CONSEQUENCE_RULE_IDS.GRADE, 'created', 'delegation', task.id,
      'Opened one owned grading task for a due frozen decision-future forecast.'));
    if (link(draft, ctx, reading.id, 'delegation', task.id, 'tracks-followup', CONSEQUENCE_RULE_IDS.GRADE,
      'Due grading obligation for a frozen forecast')) effects.push(eff(CONSEQUENCE_RULE_IDS.GRADE, 'linked', 'delegation', task.id, 'Linked grading work to its source reading.'));
  }
  return effects;
}

function learn(draft, ctx, reading, owner) {
  const tag = `${CONSEQUENCE_RULE_IDS.LEARN}:${reading.id}`;
  if (!owner || !Number.isFinite(reading.graded?.brier) || reading.graded.brier <= 0.49 || seen(draft, tag)) return [];
  addMarker(draft, tag);
  const task = newTask(ctx, owner.id, 'Review a decision-future forecast that missed',
    `The frozen still-open probability and the observed decision date produced a Brier error > 0.49. Was the class reference wrong, was the recorded decision date wrong, or did the decision process change? Record the mechanism before trusting the next wait scenario. This is a forecast/process check, never a rating of a person.`,
    `${CONSEQUENCE_RULE_IDS.LEARN} is triggered by the graded forecast's surprise, not by an employee outcome.`, tag, 7);
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift(task);
  const effects = [eff(CONSEQUENCE_RULE_IDS.LEARN, 'created', 'delegation', task.id,
    'Opened one blameless learning task for a materially missed decision-future forecast.')];
  if (link(draft, ctx, reading.id, 'delegation', task.id, 'tracks-followup', CONSEQUENCE_RULE_IDS.LEARN,
    'Frozen forecast miss review')) effects.push(eff(CONSEQUENCE_RULE_IDS.LEARN, 'linked', 'delegation', task.id, 'Linked learning work to the graded reading.'));
  return effects;
}

export function consequenceRule(draft, ctx = {}) {
  const event = ctx.event;
  if (!draft || !event || !Object.values(CONSEQUENCE_EVENTS).includes(event.type)) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const context = { ...ctx, now };
  const settings = draft.settings || {};
  const conventions = consequenceConventions(settings);
  if (!conventions.autoPropagate && event.type === CONSEQUENCE_EVENTS.GRADED) return [];
  const owner = ownerOf(draft);
  let effects = [];
  if (event.type === CONSEQUENCE_EVENTS.FROZEN) {
    const reading = (draft.consequenceReadings || []).find((r) => r.id === event.entityId);
    if (!reading) return [];
    const focused = consequenceForDecision(draft, reading.decisionId, now, settings);
    effects = [
      ...mapReading(draft, context, reading),
      ...verifyPremise(draft, context, reading, focused, owner),
      ...coordinate(draft, context, reading, focused, owner, conventions),
    ];
  } else if (event.type === CONSEQUENCE_EVENTS.SCAN) {
    effects = scan(draft, context, owner);
  } else {
    const reading = (draft.consequenceReadings || []).find((r) => r.id === event.entityId);
    if (reading) effects = learn(draft, context, reading, owner);
  }
  for (const entry of effects) {
    if (typeof ctx.logEvent === 'function') ctx.logEvent({
      type: 'automation.propagated', entity: 'consequence', entityId: entry.targetId || '', summary: entry.summary,
    });
    if (Array.isArray(ctx.out)) ctx.out.push(entry);
  }
  return effects;
}

consequenceRule.id = 'consequence';
consequenceRule.label = 'Consequence Lab propagation (RULE-CSQ-01..05)';
consequenceRule.module = 'consequenceRules.js';
consequenceRule.triggers = Object.values(CONSEQUENCE_EVENTS);
consequenceRule.effect = (draft, event, context = {}) => consequenceRule(draft, { ...context, event });
Object.freeze(consequenceRule);
