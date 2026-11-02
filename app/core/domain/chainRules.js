/**
 * The Command Chain's five post-commit rules (Schema v82, ADR-0075).
 *
 * RULE-CHN-01  ESCALATE. Every item that has outlived the horizon of the altitude
 *              that owns it opens ONE task for the leader whose altitude can
 *              actually decide it — the nearest ancestor at or above the required
 *              altitude — carrying the age, the two altitudes and the date it
 *              crossed. Capped per scan, marker-idempotent per item, with an
 *              `escalates-to` edge from the record and a `rolls-up-to` edge to the
 *              leader it now belongs to. The rule never closes, edits or re-types
 *              the item; the clock is the only thing that moved.
 * RULE-CHN-02  ROLL UP. A span holding work past its own horizon gets one
 *              briefing task against its parent per ISO week, so the level above
 *              hears about it as a scheduled hand-up rather than as a surprise in
 *              a corridor. This is the vertical propagation the whole module
 *              exists for, and it fires without the leader doing anything.
 * RULE-CHN-03  STRUCTURE. A hard reporting defect (a cycle, a self-manager, a
 *              level inversion) opens exactly one governed DACI decision per ISO
 *              week, with the three structural moves printed as options. It never
 *              moves a reporting line, never names a person to be moved, and never
 *              re-titles anyone.
 * RULE-CHN-04  DRIFT. When the workspace leader's own span is more than the
 *              declared share below their altitude, one governed decision per ISO
 *              week asks what to hand down, formalise or re-baseline. It does not
 *              delegate anything on the leader's behalf.
 * RULE-CHN-05  GRADE. A frozen reading past its review date ungraded opens one
 *              grading task, and stale chain edges are reconciled. A ledger of
 *              unverified forecasts is decoration.
 *
 * All five are marker-idempotent, write inside the caller's transaction, are
 * pausable by `chainAutoPropagate` (an explicit scan always runs), and never
 * rate, rank or name a person as a subject of judgement.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  CHAIN_EVENTS,
  CHAIN_RULE_IDS,
  altitudeByKey,
  altitudeByRank,
  altitudeRank,
  signalSource,
} from './chainRegistry.js';
import {
  chainBrief,
  chainConventions,
  chainReport,
  escalationTarget,
} from './chain.js';

const MARKER_CAP = 400;

function ownerOf(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  return people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId))) || null;
}

function markerStore(draft) {
  if (!Array.isArray(draft.chainMarkers)) draft.chainMarkers = [];
  return draft.chainMarkers;
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

/** The person who holds a node's work: the node itself, or the fallback owner. */
function holderFor(draft, nodeId) {
  if (nodeId && nodeId !== 'leader') {
    const person = (draft.people || []).find((p) => p && p.id === nodeId && p.status !== 'archived');
    if (person) return person;
  }
  return ownerOf(draft);
}

function days(n) {
  return Number.isFinite(n) ? `${n} day(s)` : '—';
}

/* ---------------------------------------------------------------- CHN-01 */

function escalateRule(draft, ctx) {
  const conventions = chainConventions(ctx.settings || draft.settings || {});
  const report = chainReport(draft, ctx.now, ctx.settings || draft.settings || {});
  const effects = [];
  let created = 0;
  const cap = conventions.chainMaxTasks;

  for (const item of report.escalationQueue) {
    if (created >= cap) break;
    const source = signalSource(item.type);
    const linkType = source?.linkType || null;
    // A derived cadence item has no record of its own to point at; the task is
    // still right, but an edge to a synthetic id would be a lie the graph carries.
    if (!linkType) continue;
    const tag = `${CHAIN_RULE_IDS.ESCALATE}:item:${item.type}:${item.entityId}`;
    if (seen(draft, tag)) continue;
    const holder = holderFor(draft, item.targetNodeId);
    if (!holder) continue;
    addMarker(draft, tag);
    const targetAltitude = altitudeByKey(item.requiredAltitude);
    const ownerAltitude = item.ownerAltitude ? altitudeByKey(item.ownerAltitude) : null;
    const task = newTask(ctx, holder.id,
      `Decide at ${targetAltitude?.label || 'the level above'}: ${item.unit} is ${days(item.ageDays)} old`,
      `This ${source?.singular || 'item'} has been open ${days(item.ageDays)} and is owned at the ${ownerAltitude?.label || 'unassigned'} altitude, whose ${ownerAltitude?.horizonDays ?? '—'}-day span it has outlived. `
        + `Its age places the decision at the ${targetAltitude?.label || 'next'} altitude (${targetAltitude?.horizonDays ?? '—'} days). `
        + `Nothing has been re-typed, closed or moved: this task exists because the clock says the decision is no longer yours to leave open. `
        + `Settle it at this altitude, or record why the horizon you declared is wrong — those are the only two honest outcomes.`,
      `${CHAIN_RULE_IDS.ESCALATE}: a clock, not a judgement. Age ${item.ageDays}d; owner ${item.ownerAltitude || 'none'}; required ${item.requiredAltitude}.`,
      tag, 7);
    pushTask(draft, task);
    created += 1;
    effects.push(effect(CHAIN_RULE_IDS.ESCALATE, 'created', 'delegation', task.id,
      `Escalated one ${source?.singular || 'item'} to the ${targetAltitude?.label || 'next'} altitude.`));
    if (link(draft, ctx, linkType, item.entityId, 'delegation', task.id, 'escalates-to',
      CHAIN_RULE_IDS.ESCALATE, 'The record whose age outlived its owner’s altitude')) {
      effects.push(effect(CHAIN_RULE_IDS.ESCALATE, 'linked', linkType, item.entityId,
        'Linked the record to the escalation task it opened.'));
    }
    if (item.targetNodeId !== 'leader'
      && link(draft, ctx, 'delegation', task.id, 'person', item.targetNodeId, 'rolls-up-to',
        CHAIN_RULE_IDS.ESCALATE, 'The leader whose altitude now holds this decision')) {
      effects.push(effect(CHAIN_RULE_IDS.ESCALATE, 'linked', 'person', item.targetNodeId,
        'Linked the task to the altitude that now owns it.'));
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- CHN-02 */

function rollUpRule(draft, ctx) {
  const conventions = chainConventions(ctx.settings || draft.settings || {});
  const report = chainReport(draft, ctx.now, ctx.settings || draft.settings || {});
  const effects = [];
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  let created = 0;

  for (const span of report.spans) {
    if (created >= 2) break;
    if (span.nodeId === 'leader') continue;
    const node = report.chain.nodes.get(span.nodeId);
    if (!node || node.parentId === null) continue;
    const dossier = span.dossier;
    if (!dossier || (!dossier.debtN && !dossier.overdueN)) continue;
    const parent = report.chain.nodes.get(node.parentId);
    const holder = holderFor(draft, node.parentId);
    if (!holder) continue;
    const tag = `${CHAIN_RULE_IDS.ROLLUP}:week:${week}:${node.id}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const task = newTask(ctx, holder.id,
      `Brief up: ${node.name}’s span has ${dossier.debtN} item(s) past its horizon`,
      `The ${span.altitude ? altitudeByKey(span.altitude)?.label : 'unassigned'} span led by ${node.name} carries ${dossier.openN} open item(s), `
        + `${dossier.overdueN} past a promised date, and ${dossier.debtN} past its own ${altitudeByKey(span.altitude)?.horizonDays ?? '—'}-day horizon. `
        + `The oldest is ${days(dossier.oldestAgeDays)} old. Defended rates: ${dossier.metrics.filter((m) => m.rate !== null).map((m) => `${m.label} ${m.rate}%`).join(', ') || 'none yet — every rate is below its evidence floor'}. `
        + `This is the hand-up the level above is owed this week, in one place. It is not a performance review of ${node.name}: it is what their span is carrying.`,
      `${CHAIN_RULE_IDS.ROLLUP}: one brief per span per ISO week.`,
      tag, 7);
    pushTask(draft, task);
    created += 1;
    effects.push(effect(CHAIN_RULE_IDS.ROLLUP, 'created', 'delegation', task.id,
      `Opened this week’s up-brief for ${node.name}’s span.`));
    if (link(draft, ctx, 'delegation', task.id, 'person', node.id, 'rolls-up-to',
      CHAIN_RULE_IDS.ROLLUP, 'The span this brief rolls up')) {
      effects.push(effect(CHAIN_RULE_IDS.ROLLUP, 'linked', 'person', node.id,
        'Linked the brief to the span it reports on.'));
    }
    if (parent && parent.id !== 'leader'
      && link(draft, ctx, 'delegation', task.id, 'person', parent.id, 'escalates-to',
        CHAIN_RULE_IDS.ROLLUP, 'The level above that receives this hand-up')) {
      effects.push(effect(CHAIN_RULE_IDS.ROLLUP, 'linked', 'person', parent.id,
        'Linked the brief to the altitude that receives it.'));
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- CHN-03 */

function structureDecision(ctx, ownerName, findings, chain, conventions) {
  const worst = findings[0];
  const alt = worst.nodeId ? altitudeByKey(chain.nodes.get(worst.nodeId)?.altitude) : null;
  return {
    id: ctx.idFactory('dec'),
    title: 'Which structural defect do we fix first?',
    question: `${findings.length} hard reporting defect(s) are on the record. ${worst.title}: ${worst.detail} `
      + `The others are: ${findings.slice(1, 4).map((finding) => finding.title.toLowerCase()).join('; ') || 'none'}. `
      + `Structure is the one thing every other queue inherits — a span outside its band, a title above the line that leads it, or a loop in the lines makes the escalation clocks on this page unreliable for everyone below them. `
      + `Which of these is real, and which of the three moves does it need?`,
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: ownerName.slice(0, 120),
    approver: ownerName.slice(0, 120),
    contributors: '',
    informed: '',
    options: [
      { id: ctx.idFactory('opt'), label: 'Fix the line: correct the reporting pointer so the clock is readable', pros: 'Cheapest, immediate, and makes every roll-up above it honest again.', cons: 'Changes who is accountable for existing work; that needs saying out loud.' },
      { id: ctx.idFactory('opt'), label: 'Fix the title: reconcile the level with the span the person actually holds', pros: 'Aligns the altitude the chain reads with the altitude the organisation pays for.', cons: 'A title change has consequences outside this tool — pay, career path, expectation.' },
      { id: ctx.idFactory('opt'), label: 'Declare it intentional: record why this shape is right and re-baseline the band', pros: 'Stops the chain reporting a defect that is a deliberate design choice, which is the only way a declared convention stays trustworthy.', cons: 'Nothing is fixed; the reading needs a note saying why, or the next reader repeats this decision.' },
    ],
    chosen: '',
    rationale: `Opened by ${CHAIN_RULE_IDS.STRUCTURE} on hard structural findings at the ${alt?.label || 'workspace'} altitude. The rule moved no reporting line, changed no title, and named no person as the problem.`,
    reviewOn: dayKey(addDays(ctx.now, 14)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

function structureRule(draft, ctx) {
  const report = chainReport(draft, ctx.now, ctx.settings || draft.settings || {});
  const owner = holderFor(draft, 'leader');
  if (!owner) return [];
  const hard = report.findings.filter((finding) => finding.severity >= 3);
  if (!hard.length) return [];
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  const tag = `${CHAIN_RULE_IDS.STRUCTURE}:week:${week}`;
  if (seen(draft, tag)) return [];
  addMarker(draft, tag);
  const decision = structureDecision(ctx, owner.name || draft.settings?.leaderName || '', hard, report.chain, report.conventions);
  if (!Array.isArray(draft.decisions)) draft.decisions = [];
  draft.decisions.unshift(decision);
  return [effect(CHAIN_RULE_IDS.STRUCTURE, 'created', 'decision', decision.id,
    'Opened one structural decision from the hard reporting findings.')];
}

/* ---------------------------------------------------------------- CHN-04 */

function driftDecision(ctx, ownerName, drift, report) {
  const leaderAltitude = altitudeByKey(report.conventions.chainLeaderAltitude);
  return {
    id: ctx.idFactory('dec'),
    title: 'What do you hand down?',
    question: `${drift.driftN} of your ${drift.ownN} open item(s) are, by their consequence and age, ${drift.driftN === drift.ownN ? 'all ' : ''}work below your own altitude — ${drift.driftSharePct}% against your declared ${drift.bar}% bar. `
      + `You are declared at ${leaderAltitude?.label || 'an altitude'} with a ${leaderAltitude?.horizonDays ?? '—'}-day span. `
      + `Doing the level below's work is the most common way a leader runs out of week: it is not laziness, it is the path of least resistance, because that work is concrete and it is immediately satisfying. `
      + `Which of the three moves is true this week?`,
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: ownerName.slice(0, 120),
    approver: ownerName.slice(0, 120),
    contributors: '',
    informed: '',
    options: [
      { id: ctx.idFactory('opt'), label: 'Hand it down: name the owner one level below and give them the decision rights', pros: 'Clears your span and grows the level below; the cheapest real capacity in the chain.', cons: 'It will be done differently from how you would do it, and that is the point.' },
      { id: ctx.idFactory('opt'), label: 'Keep it, and re-baseline: declare a lower altitude for this period', pros: 'Honest when the span genuinely cannot absorb the work yet — a new team, a crisis, a rebuild.', cons: 'The roll-up stops flagging it, which is only safe if it is written down as deliberate.' },
      { id: ctx.idFactory('opt'), label: 'Stop it: close or drop the below-altitude work that no longer earns its week', pros: 'The third option nobody offers, and often the right one: some of it is habit, not obligation.', cons: 'Something visible stops happening; the reason has to be recorded or it looks like neglect.' },
    ],
    chosen: '',
    rationale: `Opened by ${CHAIN_RULE_IDS.DRIFT} on the leader's own measured mix. No task was delegated and no altitude was changed by this rule.`,
    reviewOn: dayKey(addDays(ctx.now, 7)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

function driftRule(draft, ctx) {
  const conventions = chainConventions(ctx.settings || draft.settings || {});
  const report = chainReport(draft, ctx.now, ctx.settings || draft.settings || {});
  const drift = report.leader.drift;
  if (!drift || !drift.overBar) return [];
  const owner = holderFor(draft, 'leader');
  if (!owner) return [];
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  const tag = `${CHAIN_RULE_IDS.DRIFT}:week:${week}`;
  if (seen(draft, tag)) return [];
  addMarker(draft, tag);
  const decision = driftDecision(ctx, owner.name || draft.settings?.leaderName || '', drift, { ...report, conventions });
  if (!Array.isArray(draft.decisions)) draft.decisions = [];
  draft.decisions.unshift(decision);
  return [effect(CHAIN_RULE_IDS.DRIFT, 'created', 'decision', decision.id,
    'Opened one decision about work sitting below the leader’s declared altitude.')];
}

/* ---------------------------------------------------------------- CHN-05 */

function gradeRule(draft, ctx) {
  const effects = [];
  const today = dayKey(ctx.now);
  const owner = holderFor(draft, 'leader');
  const readings = Array.isArray(draft.chainReadings) ? draft.chainReadings : [];
  const due = readings.filter((reading) => reading && reading.reviewOn && reading.reviewOn <= today && !reading.graded);
  for (const reading of due.slice(0, 1)) {
    if (!owner) break;
    const tag = `${CHAIN_RULE_IDS.GRADE}:reading:${reading.id}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const nodeName = reading.nodeId === 'leader' ? 'your own span' : (draft.people || []).find((p) => p && p.id === reading.nodeId)?.name || 'a span';
    const task = newTask(ctx, owner.id,
      'Grade the frozen chain reading',
      `The reading frozen on ${String(reading.frozenAt).slice(0, 10)} for ${nodeName} predicted `
        + `${reading.predictedAnyBreachPct === null ? `a refused probability (${reading.quoteRefused || 'no reason recorded'})` : `${reading.predictedAnyBreachPct}% that at least one of its own items would cross the ${reading.nextThresholdDays ?? '—'}-day threshold, and ${reading.predictedBreachN ?? '—'} item(s) to cross`}. `
        + `Its review date was ${reading.reviewOn}. Grading writes the observed count and the Brier loss exactly once, from the record. A forecast that is never scored cannot tell you whether your escalation judgement is calibrated.`,
      `${CHAIN_RULE_IDS.GRADE}: frozen readings are scored once, later.`,
      tag, 5);
    pushTask(draft, task);
    effects.push(effect(CHAIN_RULE_IDS.GRADE, 'created', 'delegation', task.id,
      'Opened one task to grade an overdue chain reading.'));
  }

  /* Reconcile: edges to readings that no longer exist, and escalation edges to
     records that have been deleted. A graph that keeps a ghost edge is a graph
     that will one day explain a decision nobody can find. */
  const readingIds = new Set(readings.map((reading) => reading && reading.id).filter(Boolean));
  if (Array.isArray(draft.links)) {
    const before = draft.links.length;
    draft.links = draft.links.filter((entry) => {
      if (!entry) return false;
      if (entry.sourceType === 'chainreading' && !readingIds.has(entry.sourceId)) return false;
      if (entry.targetType === 'chainreading' && !readingIds.has(entry.targetId)) return false;
      if (entry.ruleId === CHAIN_RULE_IDS.ESCALATE && entry.relation === 'escalates-to') {
        const source = signalSource(entry.sourceType);
        if (source) {
          const rows = Array.isArray(draft[source.collection]) ? draft[source.collection] : [];
          if (!rows.some((row) => row && row.id === entry.sourceId)) return false;
        }
      }
      return true;
    });
    if (before !== draft.links.length) {
      effects.push(effect(CHAIN_RULE_IDS.GRADE, 'reconciled', 'workspace', '',
        `Dropped ${before - draft.links.length} stale chain edge(s).`));
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- freeze */

function frozenRule(draft, ctx) {
  const reading = (Array.isArray(draft.chainReadings) ? draft.chainReadings : [])
    .find((row) => row && row.id === ctx.event?.entityId);
  if (!reading) return [];
  const effects = [];
  const node = reading.nodeId === 'leader' ? { id: 'leader', parentId: null, name: 'your own span' } : (draft.people || []).find((p) => p && p.id === reading.nodeId);
  const parentId = node && node.parentId ? node.parentId : null;
  const parentPerson = parentId && parentId !== 'leader' ? (draft.people || []).find((p) => p && p.id === parentId) : null;
  const holder = holderFor(draft, reading.nodeId === 'leader' ? 'leader' : reading.nodeId) || ownerOf(draft);
  if (!holder) return [];
  const tag = `${CHAIN_RULE_IDS.GRADE}:publish:${reading.id}`;
  if (seen(draft, tag)) return [];
  addMarker(draft, tag);
  const task = newTask(ctx, holder.id,
    'Publish this reading upward before it can be graded',
    `This reading quotes ${reading.predictedAnyBreachPct === null ? 'no probability and says why' : `${reading.predictedAnyBreachPct}% that at least one item in this span crosses the next altitude’s horizon`} `
      + `and freezes ${reading.counts?.openN ?? 0} open item(s) across ${reading.counts?.peopleN ?? 0} person(s). `
      + `The level above is owed it in their language: ${parentPerson ? `that is ${parentPerson.name}’s altitude. ` : 'you are the top of this chain, so publish it as the board line. '}`
      + `Publishing is one paste, not a re-typing: the brief on the chain page is already identity-free.`,
    `${CHAIN_RULE_IDS.GRADE}: the roll-up is a hand-up, not a status update.`,
    tag, 7);
  pushTask(draft, task);
  effects.push(effect(CHAIN_RULE_IDS.GRADE, 'created', 'delegation', task.id,
    'Opened one task to publish a frozen reading upward.'));
  if (link(draft, ctx, 'chainreading', reading.id, 'delegation', task.id, 'escalates-to',
    CHAIN_RULE_IDS.GRADE, 'The reading whose publication this task carries')) {
    effects.push(effect(CHAIN_RULE_IDS.GRADE, 'linked', 'chainreading', reading.id,
      'Linked the frozen reading to its publication task.'));
  }
  if (parentPerson && link(draft, ctx, 'chainreading', reading.id, 'person', parentPerson.id, 'rolls-up-to',
    CHAIN_RULE_IDS.GRADE, 'The altitude this reading rolls up to')) {
    effects.push(effect(CHAIN_RULE_IDS.GRADE, 'linked', 'person', parentPerson.id,
      'Linked the reading to the altitude above it.'));
  }
  return effects;
}

/* ---------------------------------------------------------------- engine */

export { CHAIN_EVENTS, CHAIN_RULE_IDS };

export function chainRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const conventions = chainConventions(ctx.settings || draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now };
  let effects = [];
  const type = ctx.event.type;

  if (type === CHAIN_EVENTS.FROZEN) {
    if (!conventions.chainAutoPropagate) return [];
    effects = frozenRule(draft, scoped);
  } else if (type === CHAIN_EVENTS.SCAN) {
    // An explicit scan always runs: pausing automation silences the automatic
    // pass, never the human's request to look now.
    effects = [
      ...escalateRule(draft, scoped),
      ...rollUpRule(draft, scoped),
      ...structureRule(draft, scoped),
      ...driftRule(draft, scoped),
      ...gradeRule(draft, scoped),
    ];
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
      entity: 'chainreading',
      entityId: ctx.event?.entityId || '',
      summary: `Command chain: ${parts.join(', ')}`.slice(0, 300),
    });
  }
  for (const entry of effects) {
    if (Array.isArray(ctx.out)) ctx.out.push(entry);
  }
  return effects;
}

/** Exposed so the view can print the brief from the same source the rule uses. */
export { chainBrief, escalationTarget, altitudeRank, altitudeByRank };

chainRule.id = 'chainRule';
chainRule.label = 'Command chain propagation (RULE-CHN-01..05)';
chainRule.module = 'chainRules.js';
chainRule.triggers = [...Object.values(CHAIN_EVENTS)];
chainRule.effect = (draft, event, context = {}) => chainRule(draft, { ...context, event });
Object.freeze(chainRule);
