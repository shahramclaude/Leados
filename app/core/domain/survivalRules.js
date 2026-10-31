/**
 * app/core/domain/survivalRules.js — the post-commit side of the Delivery
 * Survival Terminal (Schema v63) on the shared rule spine (ADR-0008).
 *
 * A survival curve is a number on a page until the spine turns it into owned,
 * dated work. These rules do that, and they are built around one principle:
 * *the escalation is about the work and the system, never about a person.*
 *
 *   RULE-SURV-01  `survival.reading.frozen`
 *                 Every predicted item whose frozen probability sits below the
 *                 declared floor gains a typed `endangers` edge from the reading
 *                 to the item, and the first few also gain one owned task for
 *                 the item's *real* recorded owner. No owner is invented: an
 *                 item whose owner cannot be resolved is linked and left alone,
 *                 and the reading records why.
 *
 *   RULE-SURV-02  `survival.reading.graded`
 *                 A reading that scored worse than its own base rate opens one
 *                 owned task to narrow the class or shorten the horizon. A
 *                 forecast nobody repairs is a forecast nobody learns from.
 *
 *   RULE-SURV-03  `survival.scan`
 *                 A class in which abandonment is at least the declared share
 *                 of exits opens exactly ONE DACI decision per class per week
 *                 about the *class of work* — what starts work that never
 *                 finishes, and what would make stopping deliberate.
 *
 *   RULE-SURV-04  `survival.scan`
 *                 A returned delegation with no recorded reason opens one owned
 *                 task to record why. An abandonment with no reason is the one
 *                 piece of evidence a competing-risk model cannot recover.
 *
 *   RULE-SURV-05  `survival.scan`
 *                 A frozen reading whose review date has passed by the stale
 *                 margin and is still ungraded opens one owned task to grade it.
 *
 * Every write is marker-idempotent, deterministic and audited. The rule never
 * writes a score about a person, never reassigns work, and never extends a
 * deadline on the leader's behalf.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  SURVIVAL_DEFAULTS,
  conventionsFromSettings,
  resolveOwner,
  routeForSource,
  survivalReport,
} from './survival.js';

export const SURVIVAL_RULE_VERSION = 1;

export const SURVIVAL_RULE_IDS = Object.freeze({
  ENDANGERED: 'RULE-SURV-01',
  REPAIR: 'RULE-SURV-02',
  CLASS: 'RULE-SURV-03',
  REASON: 'RULE-SURV-04',
  GRADE: 'RULE-SURV-05',
});

export const SURVIVAL_EVENTS = Object.freeze({
  FROZEN: 'survival.reading.frozen',
  GRADED: 'survival.reading.graded',
  SCAN: 'survival.scan',
});

const MAX_TOPICS = 40;
const MAX_TASKS_PER_READING = 5;

function str(value, fallback = '') {
  return typeof value === 'string' && value ? value : fallback;
}

function hasMarker(record, tag) {
  return (record?.markers || []).some((marker) => typeof marker === 'string' && marker.includes(tag));
}

function addMarker(record, tag) {
  if (!record) return;
  if (!Array.isArray(record.markers)) record.markers = [];
  if (!record.markers.includes(tag)) record.markers.push(tag);
}

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function note(reading, ctx, source, text) {
  if (!reading) return;
  if (!Array.isArray(reading.notes)) reading.notes = [];
  reading.notes.push({ at: ctx.now.toISOString(), source, text: String(text).slice(0, 900) });
  if (reading.notes.length > 20) reading.notes.splice(0, reading.notes.length - 20);
}

function talkingPoint(draft, personId, text, tag) {
  const person = (draft.people || []).find((row) => row && row.id === personId);
  if (!person) return false;
  const token = `[${tag}]`;
  person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
  if (person.talkingPoints.some((row) => String(row).includes(token))) return false;
  const trimmed = String(text).slice(0, 200);
  person.talkingPoints = [...person.talkingPoints, `${trimmed} ${token}`].slice(-MAX_TOPICS);
  return true;
}

function delegationRecord(ctx, { personId, title, expectedOutcome, support, dueOn, tag }) {
  return {
    id: ctx.idFactory('delegation'),
    personId,
    title: String(title).slice(0, 200),
    expectedOutcome: String(expectedOutcome).slice(0, 2000),
    authority: 'act-inform',
    support: `${String(support).slice(0, 1800)} [${tag}]`,
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

function decisionRecord(ctx, draft, { title, question, options, reviewOn, rationale }) {
  const leader = str(draft.settings && draft.settings.leaderName);
  return {
    id: ctx.idFactory('dec'),
    title: String(title).slice(0, 200),
    question: String(question).slice(0, 2000),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: leader.slice(0, 120),
    approver: leader.slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '',
    rationale: String(rationale).slice(0, 4000),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

function link(ctx, draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }) {
  const { created } = ensureEntityLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  });
  return created;
}

function findReading(draft, id) {
  return (Array.isArray(draft.survivalReadings) ? draft.survivalReadings : [])
    .find((row) => row && row.id === id) || null;
}

function pushTask(draft, record) {
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift(record);
}

/** One human sentence naming why this item is on the list. */
function riskSentence(prediction, conventions) {
  const atRisk = prediction.atRisk === null || prediction.atRisk === undefined
    ? 'an unknown number of comparable items'
    : `${prediction.atRisk} comparable item(s)`;
  return `At ${prediction.elapsedDays} day(s) old, the frozen reading gave this a ${prediction.probabilityPct}% chance of completing within ${conventions.horizonDays} day(s), against ${atRisk} still at risk. Both numbers came from your own closed records; neither is a judgement about anyone.`;
}

/* ------------------------------------------------------------- RULE-SURV-01 */

function markEndangered(draft, ctx, reading, conventions) {
  const tag = `${SURVIVAL_RULE_IDS.ENDANGERED}:${reading.id}`;
  if (hasMarker(reading, tag)) return [];
  addMarker(reading, tag);
  const effects = [];
  const pressed = (reading.predictions || [])
    .filter((prediction) => Number(prediction.probabilityPct) < conventions.riskFloorPct)
    .sort((a, b) => a.probabilityPct - b.probabilityPct);

  for (const prediction of pressed) {
    if (link(ctx, draft, {
      sourceType: 'reading',
      sourceId: reading.id,
      targetType: prediction.sourceType,
      targetId: prediction.sourceId,
      relation: 'endangers',
      ruleId: SURVIVAL_RULE_IDS.ENDANGERED,
      summary: `Frozen probability of completion: ${prediction.probabilityPct}% at ${prediction.elapsedDays} day(s) old.`,
    })) {
      effects.push(effect(SURVIVAL_RULE_IDS.ENDANGERED, 'linked', 'reading', reading.id,
        'Linked the reading to an item it does not expect to finish.'));
    }
  }

  let opened = 0;
  for (const prediction of pressed) {
    if (opened >= MAX_TASKS_PER_READING) break;
    const item = { sourceType: prediction.sourceType, sourceId: prediction.sourceId, ownerId: null };
    // The recorded owner of the source record, not the reader's guess.
    const source = findSource(draft, prediction.sourceType, prediction.sourceId);
    item.ownerId = source?.ownerId || source?.personId || null;
    const ownerId = resolveOwner(draft, item);
    if (!ownerId) continue;
    const itemTag = `${SURVIVAL_RULE_IDS.ENDANGERED}:${reading.id}:${prediction.sourceId}`;
    if (hasMarker(reading, itemTag)) continue;
    addMarker(reading, itemTag);
    const task = delegationRecord(ctx, {
      personId: ownerId,
      title: `Decide on “${String(prediction.title || 'this item').slice(0, 90)}”: re-plan, unblock or stop it`,
      expectedOutcome: `The reading frozen on ${reading.frozenOn || dayKey(ctx.now)} expected this item to have a ${prediction.probabilityPct}% chance of completing by ${reading.reviewOn || 'the review date'}. Record what happens next: a new dated commitment with the reason, or a deliberate stop with the reason. Rewriting the frozen reading is not an option.`,
      support: `${SURVIVAL_RULE_IDS.ENDANGERED} opened this because the item sits below the ${conventions.riskFloorPct}% completion floor. The curve is a property of the class of work, not of the person holding it.`,
      dueOn: dayKey(addDays(ctx.now, 3)),
      tag: itemTag,
    });
    pushTask(draft, task);
    opened += 1;
    effects.push(effect(SURVIVAL_RULE_IDS.ENDANGERED, 'created', 'delegation', task.id,
      'Opened one owned decision task for an item the curve does not expect to finish.'));
  }

  if (pressed.length && !opened) {
    note(reading, ctx, SURVIVAL_RULE_IDS.ENDANGERED,
      `${pressed.length} item(s) sit below the ${conventions.riskFloorPct}% completion floor, but none had a resolvable owner, so no task was opened. Set the leader name or an owner on the source record; the app will not invent one.`);
  }
  return effects;
}

function findSource(draft, sourceType, sourceId) {
  const collections = {
    portfolio: 'portfolio',
    case: 'cases',
    requisition: 'requisitions',
    change: 'changes',
    delegation: 'delegations',
    decision: 'decisions',
  };
  const collection = collections[sourceType];
  if (!collection) return null;
  return (Array.isArray(draft[collection]) ? draft[collection] : []).find((row) => row && row.id === sourceId) || null;
}

/* ------------------------------------------------------------- RULE-SURV-02 */

function repairReading(draft, ctx, reading) {
  const tag = `${SURVIVAL_RULE_IDS.REPAIR}:${reading.id}`;
  if (hasMarker(reading, tag)) return [];
  const grade = reading.grade;
  if (!grade || grade.belowFloor) return [];
  if (!(Number.isFinite(Number(grade.skillScore)) && Number(grade.skillScore) < 0)) return [];
  addMarker(reading, tag);
  const ownerId = resolveOwner(draft, { ownerId: null });
  if (!ownerId) {
    note(reading, ctx, SURVIVAL_RULE_IDS.REPAIR,
      'The reading scored worse than its base rate, but no owner could be resolved for the repair task. Set the leader name so the repair has an owner.');
    return [];
  }
  const task = delegationRecord(ctx, {
    personId: ownerId,
    title: `Repair the “${String(reading.label).slice(0, 90)}” reading: narrow the class or shorten the horizon`,
    expectedOutcome: `Brier ${grade.brier} against a ${grade.baselineBrier} base rate over ${grade.settledCount} settled item(s). Either the class pools work that does not behave alike, or the horizon asks the curve a question it cannot answer. Change one of them, freeze a new reading, and grade that one too.`,
    support: `${SURVIVAL_RULE_IDS.REPAIR} opened this because a graded reading lost to its own base rate. Below five settled items the app withholds the skill score instead of calling five items a model.`,
    dueOn: dayKey(addDays(ctx.now, 14)),
    tag,
  });
  pushTask(draft, task);
  return [effect(SURVIVAL_RULE_IDS.REPAIR, 'created', 'delegation', task.id,
    'Opened one owned task to repair a reading that scored worse than the base rate.')];
}

/* ------------------------------------------------------------- RULE-SURV-03 */

function classDecision(draft, ctx, klass, conventions) {
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  const tag = `${SURVIVAL_RULE_IDS.CLASS}:${klass.key}:${week}`;
  draft.survivalMarkers = Array.isArray(draft.survivalMarkers) ? draft.survivalMarkers : [];
  if (draft.survivalMarkers.some((marker) => typeof marker === 'string' && marker.includes(tag))) return [];
  draft.survivalMarkers.push(tag);
  if (draft.survivalMarkers.length > 400) draft.survivalMarkers.splice(0, draft.survivalMarkers.length - 400);
  const decision = decisionRecord(ctx, draft, {
    title: `Why does ${klass.label.toLowerCase()} stop instead of finish?`,
    question: `${klass.counts.abandoned} of ${klass.counts.exits} exits from ${klass.label.toLowerCase()} are abandonments (${klass.abandonSharePct}%, threshold ${conventions.abandonSharePct}%). Counting them as "still running" would make the class look healthier than the cumulative incidence says it is. What starts this work that never finishes, and what would make stopping it an explicit, recorded decision rather than a drift?`,
    options: [
      ['Narrow what gets started', 'Fewer, better-scoped items is the cheapest fix for a class that is abandoned rather than finished.', 'It costs something real: work that is currently started will not start.'],
      ['Change what finishing requires', 'If a completion criterion is unreachable for most items, the definition is the problem, not the work.', 'Loosening a definition after the fact can look like moving the goalposts; record why.'],
      ['Make stopping explicit and recorded', 'Keep starting the work but require a written reason to stop it, so abandonment becomes data instead of silence.', 'It does not reduce the abandonment; it only makes it visible.'],
    ],
    reviewOn: dayKey(addDays(ctx.now, 30)),
    rationale: `Opened by ${SURVIVAL_RULE_IDS.CLASS} because abandonment reached ${klass.abandonSharePct}% of exits in this class. The decision is about the class of work and the process that produces it. No person is named, ranked or scored anywhere in this record.`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.unshift(decision);
  return [effect(SURVIVAL_RULE_IDS.CLASS, 'created', 'decision', decision.id,
    `Opened one decision about why ${klass.label.toLowerCase()} is abandoned rather than completed.`)];
}

/* ------------------------------------------------------------- RULE-SURV-04 */

function reasonlessAbandonment(draft, ctx) {
  const effects = [];
  for (const row of Array.isArray(draft.delegations) ? draft.delegations : []) {
    if (!row || row.status !== 'returned') continue;
    if (str(row.returnReason).trim()) continue;
    const tag = `${SURVIVAL_RULE_IDS.REASON}:${row.id}`;
    draft.survivalMarkers = Array.isArray(draft.survivalMarkers) ? draft.survivalMarkers : [];
    if (draft.survivalMarkers.some((marker) => typeof marker === 'string' && marker.includes(tag))) continue;
    const ownerId = resolveOwner(draft, { ownerId: row.personId });
    if (!ownerId) continue;
    draft.survivalMarkers.push(tag);
    if (draft.survivalMarkers.length > 400) draft.survivalMarkers.splice(0, draft.survivalMarkers.length - 400);
    const task = delegationRecord(ctx, {
      personId: ownerId,
      title: `Record why the delegation “${String(row.title || '').slice(0, 80)}” came back`,
      expectedOutcome: 'A written reason on the returned delegation. Without it the abandonment enters the survival curve as an unexplained exit, and the class-level question ("why does this work stop?") cannot be answered from your own record.',
      support: `${SURVIVAL_RULE_IDS.REASON} opened this during an explicit scan. A returned delegation is evidence about the hand-off, not about the person who held it.`,
      dueOn: dayKey(addDays(ctx.now, 5)),
      tag,
    });
    pushTask(draft, task);
    effects.push(effect(SURVIVAL_RULE_IDS.REASON, 'created', 'delegation', task.id,
      'Opened one owned task to record why a delegation was returned.'));
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-SURV-05 */

function gradeOverdue(draft, ctx, conventions) {
  const effects = [];
  const today = dayKey(ctx.now);
  for (const reading of Array.isArray(draft.survivalReadings) ? draft.survivalReadings : []) {
    if (!reading || reading.status !== 'frozen' || !reading.reviewOn) continue;
    const staleOn = addDays(reading.reviewOn, conventions.staleDays);
    if (!staleOn || today < staleOn) continue;
    const tag = `${SURVIVAL_RULE_IDS.GRADE}:${reading.id}:${reading.reviewOn}`;
    if (hasMarker(reading, tag)) continue;
    const ownerId = resolveOwner(draft, { ownerId: null });
    if (!ownerId) continue;
    addMarker(reading, tag);
    const task = delegationRecord(ctx, {
      personId: ownerId,
      title: `Grade the reading frozen for ${reading.reviewOn}`,
      expectedOutcome: 'Grade it. The predictions were frozen with their probabilities and the source records now say what happened; the score is arithmetic, and skipping it is the only way the workspace can never learn whether the curve is any good.',
      support: `${SURVIVAL_RULE_IDS.GRADE} opened this because the reading is ${conventions.staleDays} day(s) past its review date and still ungraded.`,
      dueOn: dayKey(addDays(ctx.now, 2)),
      tag,
    });
    pushTask(draft, task);
    effects.push(effect(SURVIVAL_RULE_IDS.GRADE, 'created', 'delegation', task.id,
      'Opened one owned task to grade a stale reading.'));
  }
  return effects;
}

/* ---------------------------------------------------------------- the rule */

export function survivalRule(draft, ctx = {}) {
  const { event, now = new Date(), out = [], logEvent } = ctx;
  if (!event || !draft) return [];
  const type = str(event.type);
  if (!Object.values(SURVIVAL_EVENTS).includes(type)) return [];

  const settings = { ...SURVIVAL_DEFAULTS, ...(ctx.settings || {}), ...(draft.settings || {}) };
  const conventions = conventionsFromSettings(settings);
  // An explicit scan is a request to catch up and is never suppressed by the
  // pause; automatic work respects it.
  if (!conventions.autoPropagate && type !== SURVIVAL_EVENTS.SCAN) return [];

  const reading = event.entityId ? findReading(draft, event.entityId) : null;
  let effects = [];

  if (type === SURVIVAL_EVENTS.FROZEN && reading) {
    effects = markEndangered(draft, { ...ctx, settings }, reading, conventions);
  } else if (type === SURVIVAL_EVENTS.GRADED && reading) {
    effects = repairReading(draft, ctx, reading);
  } else if (type === SURVIVAL_EVENTS.SCAN) {
    // Reconciliation first: a reading frozen while propagation was paused has
    // no links and no owned work, and the explicit scan is the leader asking
    // the workspace to catch up rather than leave a permanent hole.
    for (const row of Array.isArray(draft.survivalReadings) ? draft.survivalReadings : []) {
      if (!row) continue;
      effects.push(...markEndangered(draft, { ...ctx, settings }, row, conventions));
      if (row.status === 'graded') effects.push(...repairReading(draft, ctx, row));
    }
    const report = survivalReport(draft, ctx.now, settings);
    for (const klass of report.classes) {
      if (!klass.counts.exits) continue;
      if (klass.abandonSharePct === null || klass.abandonSharePct < conventions.abandonSharePct) continue;
      effects.push(...classDecision(draft, ctx, klass, conventions));
    }
    effects.push(...reasonlessAbandonment(draft, ctx));
    effects.push(...gradeOverdue(draft, ctx, conventions));
  }

  for (const entry of effects) {
    if (typeof logEvent === 'function') {
      logEvent({
        type: 'automation.propagated',
        entity: 'survival',
        entityId: entry.targetId || '',
        summary: entry.summary,
      });
    }
    out.push(entry);
  }
  return effects;
}

survivalRule.id = 'survival';
survivalRule.label = 'Delivery survival propagation (RULE-SURV-01..05)';
survivalRule.module = 'survivalRules.js';
survivalRule.triggers = Object.values(SURVIVAL_EVENTS);
survivalRule.effect = (draft, event, context = {}) => survivalRule(draft, { ...context, event });
Object.freeze(survivalRule);

export default survivalRule;

export { routeForSource };
