/**
 * The Evidence Supply Chain's five post-commit rules (Schema v79).
 *
 * RULE-SUP-01  a frozen plan opens at most `supplyMaxTasks` leader-owned capture
 *              tasks — one per planned line — each stating the missing count,
 *              the measured arrival rate, the median wait and the hours it will
 *              take. It writes a `supplies-evidence` edge from the plan to every
 *              task and an `unblocks-judgement` edge to the open records the
 *              line's output is for. It never manufactures a unit itself and
 *              never marks a line full.
 * RULE-SUP-02  an explicit scan turns a binding constraint into ONE governed
 *              capacity decision per ISO week, with the trade printed: feed the
 *              constraint, elevate it, or subordinate the rest of the plan to it.
 * RULE-SUP-03  every line the record says can no longer pay for the wait gets one
 *              blameless leader-owned retirement task (capped), phrased as a
 *              close-or-re-scope question — the sunk-cost discipline, applied to
 *              questions rather than to money already spent.
 * RULE-SUP-04  a line that has just reached its floor while open work still waits
 *              on it opens exactly one "read the answer now" task, once per line,
 *              ever. This is the cross-module unlock: the refusal that was a dead
 *              end becomes a clickable destination.
 * RULE-SUP-05  a frozen plan whose review date has passed ungraded opens one
 *              grading task. A ledger of unverified promises is decoration.
 *
 * All five are marker-idempotent, write inside the caller's transaction, are
 * pausable by `supplyAutoPropagate` (an explicit scan always runs), and never
 * rate, rank or name a person.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { SUPPLY_EVENTS, SUPPLY_RULE_IDS } from './supplyRegistry.js';
import { supplyReport, supplyConventions } from './supply.js';

const MARKER_CAP = 400;

function ownerOf(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  return people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId))) || null;
}

function markerStore(draft) {
  if (!Array.isArray(draft.supplyMarkers)) draft.supplyMarkers = [];
  return draft.supplyMarkers;
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

function newTask(ctx, ownerId, title, outcome, support, tag, dueDays = 10) {
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

/** A 30-day bucket key, so a retirement prompt repeats monthly at most. */
function bucket30(now) {
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return String(Math.floor(ms / 86400000 / 30));
}

function weeks(n) {
  return n === null || n === undefined ? 'no finite wait at this rate' : `${n} week(s)`;
}

/* ---------------------------------------------------------------- SUP-01 */

function planFrozenRule(draft, ctx) {
  const plan = (Array.isArray(draft.supplyPlans) ? draft.supplyPlans : [])
    .find((row) => row && row.id === ctx.event?.entityId);
  if (!plan) return [];
  const owner = ownerOf(draft);
  // `ctx.settings` is the live settings of the transaction; `draft.settings` is
  // the fallback for direct rule invocation in tests and replays.
  const conventions = supplyConventions(ctx.settings || draft.settings || {});
  const effects = [];
  const cap = conventions.supplyMaxTasks;

  let createdTasks = 0;
  for (const member of plan.members || []) {
    if (!member || !(member.shortfall > 0)) continue;
    // A cap on TASKS, not on effects: counting `effects` would treat the
    // `supplies-evidence` edge as if it were a second task and silently
    // under-issue the plan the leader just froze.
    if (createdTasks >= cap) break;
    const tag = `${SUPPLY_RULE_IDS.PLAN}:task:${plan.id}:${member.line}`;
    if (seen(draft, tag) || !owner) continue;
    addMarker(draft, tag);
    const task = newTask(ctx, owner.id,
      `Manufacture evidence: ${member.label} (−${member.shortfall})`,
      `This line holds ${member.observedN} of the ${member.required} unit(s) ${member.label.toLowerCase()} needs before anything can be judged. `
        + `At the workspace's own measured arrival rate the median wait to close the gap is ${weeks(member.medianEtaWeeks)} and the chance it fills inside ${plan.horizonDays} days is ${member.pClearBeforeHorizonPct}%. `
        + `Deliberate capture takes about ${member.captureHours} hour(s) of your time (${conventions.supplyMinutesPerUnit[member.line] ?? 0} min per unit × ${member.shortfall}). `
        + `Manufacturing it means creating the records themselves — settling an assumption, putting a date on a call, closing a delegation — not writing a summary of them.`,
      `${SUPPLY_RULE_IDS.PLAN}: a task, not a score. The line is never marked full by this rule; only real records fill it.`,
      tag, 14);
    pushTask(draft, task);
    createdTasks += 1;
    effects.push(effect(SUPPLY_RULE_IDS.PLAN, 'created', 'delegation', task.id,
      `Opened one capture task for ${member.label}.`));
    if (link(draft, ctx, 'supplyplan', plan.id, 'delegation', task.id, 'supplies-evidence',
      SUPPLY_RULE_IDS.PLAN, 'Frozen plan commits effort to this evidence line')) {
      effects.push(effect(SUPPLY_RULE_IDS.PLAN, 'linked', 'delegation', task.id,
        'Linked the plan to the capture task it committed.'));
    }
  }

  // The open work this plan exists for. One edge per surviving record, capped.
  let linksWritten = 0;
  for (const member of plan.members || []) {
    for (const item of member.demandIds || []) {
      if (linksWritten >= 12) break;
      if (link(draft, ctx, 'supplyplan', plan.id, item.type, item.id, 'unblocks-judgement',
        SUPPLY_RULE_IDS.PLAN, 'Open work waiting on the evidence this plan commits to')) {
        linksWritten += 1;
        effects.push(effect(SUPPLY_RULE_IDS.PLAN, 'linked', item.type, item.id,
          'Linked the plan to an open record it would unblock.'));
      }
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- SUP-02 */

function triageDecision(ctx, ownerName, bottleneck, line, conventions) {
  return {
    id: ctx.idFactory('dec'),
    title: 'Which evidence line does this workspace feed first?',
    question: `The supply chain's binding constraint is "${bottleneck.label}": ${bottleneck.demandCount} open item(s) wait on a line that `
      + `${line && line.verdict === 'unobserved' ? 'has never produced a single unit' : `clears at ${line?.arrivalPerWeek ?? 0} unit(s) per week`}, `
      + `with a ${line?.pClearBeforeHorizonPct ?? 0}% chance of reaching its floor of ${line?.required ?? '—'} inside ${conventions.supplyHorizonDays} days. `
      + `${bottleneck.starvedSharePct}% of all open demand sits on starved lines, against your ${conventions.supplyBottleneckPct}% bar. `
      + `Theory of Constraints says the only throughput that moves is throughput at the constraint — so which is true: feed it deliberately, raise its capacity, or subordinate the other lines to it and stop gathering evidence nobody is waiting for?`,
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: ownerName.slice(0, 120),
    approver: ownerName.slice(0, 120),
    contributors: '',
    informed: '',
    options: [
      { id: ctx.idFactory('opt'), label: 'Feed the constraint: manufacture the missing units this week', pros: `The ${bottleneck.demandCount} open item(s) on this line stop waiting on a rate that cannot deliver; the estimate is hours, not months.`, cons: 'Costs leader time now and produces no visible artefact beyond the record itself.' },
      { id: ctx.idFactory('opt'), label: 'Elevate the line: change the process that produces these units', pros: 'Raises the arrival rate permanently, so every future question on this line closes faster.', cons: 'Slower to show up in the numbers and easier to declare done without changing anything.' },
      { id: ctx.idFactory('opt'), label: 'Subordinate: stop gathering evidence with no open demand', pros: 'Frees the hours the plan is spending on lines nobody is waiting for — the cheapest real gain in the chain.', cons: 'Some questions lose their chance of ever being answered; each retirement must be recorded.' },
    ],
    chosen: '',
    rationale: `Opened by ${SUPPLY_RULE_IDS.TRIAGE} on the measured constraint. No floor, count or rate was changed by this rule; it only names the constraint and offers the three moves.`,
    reviewOn: dayKey(addDays(ctx.now, 7)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

function scanRule(draft, ctx) {
  const conventions = supplyConventions(ctx.settings || draft.settings || {});
  const report = supplyReport(draft, ctx.now, ctx.settings || draft.settings || {});
  const owner = ownerOf(draft);
  const effects = [];
  const today = dayKey(ctx.now);
  const week = weekKey(ctx.now) || today;

  /* SUP-02 — one governed capacity decision per ISO week. */
  if (report.bottleneck && report.bottleneck.isBinding && owner) {
    const tag = `${SUPPLY_RULE_IDS.TRIAGE}:week:${week}`;
    if (!seen(draft, tag)) {
      addMarker(draft, tag);
      const line = report.lines.find((row) => row.key === report.bottleneck.key);
      const decision = triageDecision(ctx, owner.name || draft.settings?.leaderName || '', report.bottleneck, line, conventions);
      if (!Array.isArray(draft.decisions)) draft.decisions = [];
      draft.decisions.unshift(decision);
      effects.push(effect(SUPPLY_RULE_IDS.TRIAGE, 'created', 'decision', decision.id,
        'Opened one evidence-capacity decision from the measured constraint.'));
    }
  }

  /* SUP-03 — retirement, capped, one per line per 30 days. */
  let retired = 0;
  for (const line of report.lines.filter((row) => row.verdict === 'retire')) {
    if (retired >= 2 || !owner) break;
    const tag = `${SUPPLY_RULE_IDS.RETIRE}:line:${line.key}:b${bucket30(ctx.now)}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    retired += 1;
    const task = newTask(ctx, owner.id,
      `Close or re-scope: ${line.label.toLowerCase()} cannot pay for the wait`,
      `The line holds ${line.n} of ${line.required} unit(s) after ${line.nAllTime} lifetime unit(s). The open work it feeds is already ${line.oldestDemandDays} day(s) old against your ${conventions.supplyAbandonDays}-day bar, and the median wait to close the gap is ${weeks(line.medianEtaWeeks)}. `
        + `Time already spent waiting is unrecoverable — that is the sunk-cost mistake, and it is the reason this is a task rather than a reminder. Decide one of two things and record it: close the question and say what you will decide without the evidence, or restart the line deliberately with a capture task that manufactures the units. Keeping it open unchanged is the one option that costs without informing.`,
      `${SUPPLY_RULE_IDS.RETIRE}: prunes the queue, never the record.`,
      tag, 14);
    pushTask(draft, task);
    effects.push(effect(SUPPLY_RULE_IDS.RETIRE, 'created', 'delegation', task.id,
      `Opened one retirement task for ${line.label}.`));
    for (const item of line.demandItems.slice(0, 2)) {
      if (link(draft, ctx, 'delegation', task.id, item.type, item.id, 'retires-question',
        SUPPLY_RULE_IDS.RETIRE, 'Question this task may close rather than keep waiting on')) {
        effects.push(effect(SUPPLY_RULE_IDS.RETIRE, 'linked', item.type, item.id,
          'Linked the retirement task to an open record it would close.'));
      }
    }
  }

  /* SUP-04 — the unlock: once per line, ever. */
  const unlocked = report.lines.filter((line) => line.verdict === 'met' && line.demandCount > 0);
  for (const line of unlocked) {
    const tag = `${SUPPLY_RULE_IDS.UNLOCK}:line:${line.key}`;
    if (seen(draft, tag) || !owner) continue;
    addMarker(draft, tag);
    const task = newTask(ctx, owner.id,
      `Read the answer: ${line.consumerLabel.toLowerCase()} now has enough evidence`,
      `The ${line.label.toLowerCase()} line reached its floor (${line.n} of ${line.required}) while ${line.demandCount} open item(s) still wait on it. `
        + `Nothing further needs gathering — open ${line.consumerLabel} (${line.consumerRoute}) and act on the reading. This task is opened once per line, ever: if the line later drops below its floor again, the reason is a record deletion, not a new discovery.`,
      `${SUPPLY_RULE_IDS.UNLOCK}: the refusal became an answer; spend no more time on supply.`,
      tag, 7);
    pushTask(draft, task);
    effects.push(effect(SUPPLY_RULE_IDS.UNLOCK, 'created', 'delegation', task.id,
      `Opened one unlock task for ${line.label}.`));
  }

  /* SUP-05 — grading work for a plan whose window closed ungraded. */
  const due = (Array.isArray(draft.supplyPlans) ? draft.supplyPlans : [])
    .filter((plan) => plan && plan.reviewOn && plan.reviewOn <= today && !plan.graded);
  for (const plan of due.slice(0, 1)) {
    const tag = `${SUPPLY_RULE_IDS.GRADE}:plan:${plan.id}`;
    if (seen(draft, tag) || !owner) continue;
    addMarker(draft, tag);
    const task = newTask(ctx, owner.id,
      'Grade the frozen evidence plan',
      `The plan frozen on ${String(plan.frozenAt).slice(0, 10)} had a review date of ${plan.reviewOn} and quoted ${plan.predictedAnyClearPct}% that at least one planned line would clear. Grading writes the outcome and the Brier loss exactly once, from the record. A plan that is never graded cannot tell you whether your judgement about evidence is any good.`,
      `${SUPPLY_RULE_IDS.GRADE}: frozen probabilities are scored once, later.`,
      tag, 5);
    pushTask(draft, task);
    effects.push(effect(SUPPLY_RULE_IDS.GRADE, 'created', 'delegation', task.id,
      'Opened one task to grade an overdue supply plan.'));
  }

  /* Reconcile: stale edges from deleted plans or records. */
  const planIds = new Set((Array.isArray(draft.supplyPlans) ? draft.supplyPlans : []).map((p) => p && p.id));
  if (Array.isArray(draft.links)) {
    const before = draft.links.length;
    draft.links = draft.links.filter((entry) => {
      if (!entry) return false;
      if ((entry.sourceType === 'supplyplan') && !planIds.has(entry.sourceId)) return false;
      if ((entry.targetType === 'supplyplan') && !planIds.has(entry.targetId)) return false;
      return true;
    });
    if (before !== draft.links.length) {
      effects.push(effect(SUPPLY_RULE_IDS.GRADE, 'reconciled', 'workspace', '',
        `Dropped ${before - draft.links.length} stale supply edge(s).`));
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- engine */

export { SUPPLY_EVENTS, SUPPLY_RULE_IDS };

export function supplyRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const conventions = supplyConventions(ctx.settings || draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now };
  let effects = [];
  const type = ctx.event.type;
  if (type === SUPPLY_EVENTS.FROZEN) {
    if (!conventions.supplyAutoPropagate) return [];
    effects = planFrozenRule(draft, scoped);
  } else if (type === SUPPLY_EVENTS.SCAN) {
    effects = scanRule(draft, scoped);
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
      entity: 'supplyplan',
      entityId: ctx.event?.entityId || '',
      summary: `Evidence supply chain: ${parts.join(', ')}`.slice(0, 300),
    });
  }
  for (const entry of effects) {
    if (Array.isArray(ctx.out)) ctx.out.push(entry);
  }
  return effects;
}

supplyRule.id = 'supplyRule';
supplyRule.label = 'Evidence supply chain propagation (RULE-SUP-01..05)';
supplyRule.module = 'supplyRules.js';
supplyRule.triggers = [...Object.values(SUPPLY_EVENTS)];
supplyRule.effect = (draft, event, context = {}) => supplyRule(draft, { ...context, event });
Object.freeze(supplyRule);
