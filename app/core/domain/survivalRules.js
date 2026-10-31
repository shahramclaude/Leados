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
 *   RULE-SURV-06  `survival.scan`
 *                 A calendar-cohort drift in time-to-any-exit opens one DACI
 *                 forecast-transport review per class per week, one owned
 *                 evidence check, and typed `informs` edges to open work.
 *
 *   RULE-SURV-07  `survival.scan`
 *                 The drift decomposed by cause. When the day-30 exit mix
 *                 moved adversely — completions down, abandonments up, or
 *                 both — the weekly review is framed by the component that
 *                 moved: an *intake* review when abandonment leads (with the
 *                 recent abandonments linked as exhibits), a *completion*
 *                 review when finishing leads. Exactly one drift decision
 *                 exists per class per week: if RULE-SURV-06 already opened
 *                 the generic one, this rule adds its owned work to that
 *                 decision instead of opening a second; if this rule fires
 *                 first, RULE-SURV-06 stands down. A significant *improvement*
 *                 opens one owned task to record what changed while it is
 *                 still remembered — positive deviance is evidence too.
 *
 *   RULE-SURV-08  `survival.scan`
 *                 Transport, decomposed, applied to what is already frozen.
 *                 When a class loses transport on an axis, the frozen
 *                 artefacts that ride on that axis learn about it: a frozen
 *                 survival reading (completion probabilities) gains an
 *                 appended challenge note — the frozen numbers never change —
 *                 and the newest cost-of-waiting exposure certificate gains
 *                 one owned re-freeze task, but *only* when the timing axis
 *                 failed. A completion-only failure leaves the certificate's
 *                 timing standing, so nothing is opened for it. The axes
 *                 discriminate; the rule never edits a frozen value.
 *
 * Every write is marker-idempotent, deterministic and audited. The rule never
 * writes a score about a person, never reassigns work, and never extends a
 * deadline on the leader's behalf.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  DECOMP_VERDICT_LABELS,
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
  DRIFT: 'RULE-SURV-06',
  DECOMP: 'RULE-SURV-07',
  TRANSPORT: 'RULE-SURV-08',
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

/** Detected transport failure becomes a decision, an owned check and typed edges.
 * One per class/week; the diagnostic is frozen as text, never recalculated in place.
 */
function driftReview(draft, ctx, klass) {
  if (!klass.drift?.changed) return [];
  const tag = `${SURVIVAL_RULE_IDS.DRIFT}:${klass.key}:${weekKey(ctx.now)}`;
  draft.survivalMarkers ||= [];
  if (draft.survivalMarkers.includes(tag)) return [];
  // Exactly one drift decision per class per week: when the decomposition
  // already opened its component-framed review, the generic one stands down.
  if (draft.survivalMarkers.includes(`${SURVIVAL_RULE_IDS.DECOMP}:${klass.key}:${weekKey(ctx.now)}`)) return [];
  const d = klass.drift;
  const decision = decisionRecord(ctx, draft, {
    title: `Revalidate ${klass.label.toLowerCase()} forecasts after calendar drift`,
    question: `Equal 30-day follow-up: recent n=${d.recentN}, prior n=${d.priorN}; restricted mean time to any exit ${d.recentDays} vs ${d.priorDays} days. Holm p=${d.adjustedP}. Is the case mix or operating process different? Abandonment is an exit, not success.`,
    options: [
      ['Investigate case mix', 'Check scope, abandonment and operating changes before changing forecasts.', 'Requires record review.'],
      ['Use scenario ranges pending review', 'Avoid false precision while evidence is unstable.', 'Does not identify a cause.'],
    ],
    reviewOn: dayKey(addDays(ctx.now, 7)),
    rationale: `Frozen transport diagnostic [${tag}]. Descriptive association only; no employee score and no automatic probability or price adjustment.`,
  });
  draft.decisions ||= []; draft.decisions.unshift(decision);
  draft.survivalMarkers.push(tag);
  draft.survivalMarkers = draft.survivalMarkers.slice(-400);
  const effects = [effect(SURVIVAL_RULE_IDS.DRIFT, 'created', 'decision', decision.id, 'Opened a forecast transport review after calendar-cohort drift.')];
  for (const item of klass.open.slice(0, 20)) {
    if (link(ctx, draft, { sourceType: 'decision', sourceId: decision.id,
      targetType: item.sourceType, targetId: item.sourceId, relation: 'informs',
      ruleId: SURVIVAL_RULE_IDS.DRIFT, summary: 'Historical reference class shifted; review forecast applicability.' }))
      effects.push(effect(SURVIVAL_RULE_IDS.DRIFT, 'linked', item.sourceType, item.sourceId, 'Linked affected open work to the transport review.'));
  }
  const ownerId = resolveOwner(draft, { ownerId: null });
  if (ownerId) {
    const task = delegationRecord(ctx, { personId: ownerId, title: `Check the evidence behind ${klass.label.toLowerCase()} drift`,
      expectedOutcome: 'Compare scope and abandonment in the two start cohorts; document whether pooled delivery forecasts remain appropriate. Do not infer causation from the test.',
      support: `Review decision ${decision.id}; fixed cohorts and equal follow-up.`, dueOn: dayKey(addDays(ctx.now, 5)), tag });
    pushTask(draft, task);
    link(ctx, draft, { sourceType: 'decision', sourceId: decision.id, targetType: 'delegation', targetId: task.id,
      relation: 'informs', ruleId: SURVIVAL_RULE_IDS.DRIFT, summary: 'Owned forecast transport investigation.' });
    effects.push(effect(SURVIVAL_RULE_IDS.DRIFT, 'created', 'delegation', task.id, 'Opened an owned evidence check for the transport review.'));
  }
  return effects;
}

/** Case mix is not a drift test: commission review without rewriting curves. */
function caseMixReview(draft, ctx, klass) {
  if (!klass.mix?.challenged) return [];
  const tag = `${SURVIVAL_RULE_IDS.TRANSPORT}:case-mix:${klass.key}:${weekKey(ctx.now)}`;
  draft.survivalMarkers ||= [];
  if (draft.survivalMarkers.includes(tag)) return [];
  const decision = decisionRecord(ctx, draft, {
    title: 'Review operational case reference-class mix',
    question: `${klass.mix.reason} Labels are current, not verified at opening. Do these cohorts describe comparable work?`,
    options: [
      ['Review the records', 'Compare intake scope and the current labels before using pooled forecasts.', 'Requires human judgment.'],
      ['Use descriptive scenarios', 'Treat pooled estimates as descriptive until reviewed.', 'Does not establish a causal explanation.'],
    ],
    reviewOn: dayKey(addDays(ctx.now, 7)),
    rationale: `Case-type composition alert [${tag}]. Descriptive 25pp convention or observed non-overlap, not a statistical or causal test.`,
  });
  draft.decisions ||= [];
  draft.decisions.unshift(decision);
  draft.survivalMarkers.push(tag);
  const effects = [effect(SURVIVAL_RULE_IDS.TRANSPORT, 'created', 'decision', decision.id, 'Opened a case-mix reference-class review.')];
  for (const item of klass.open.slice(0, 20)) {
    if (link(ctx, draft, { sourceType: 'decision', sourceId: decision.id, targetType: item.sourceType, targetId: item.sourceId,
      relation: 'informs', ruleId: SURVIVAL_RULE_IDS.TRANSPORT, summary: 'Review whether the case reference class applies to this work.' })) {
      effects.push(effect(SURVIVAL_RULE_IDS.TRANSPORT, 'linked', item.sourceType, item.sourceId, 'Linked open work to the case-mix review.'));
    }
  }
  const ownerId = resolveOwner(draft, { ownerId: null });
  if (ownerId) {
    const task = delegationRecord(ctx, { personId: ownerId, title: 'Check case-type mix before using pooled forecasts',
      expectedOutcome: 'Review current labels and intake scope in both cohorts. Record whether the pooled reference class remains useful; do not assume mix caused a change.',
      support: `Review decision ${decision.id}. ${klass.mix.reason}`, dueOn: dayKey(addDays(ctx.now, 5)), tag });
    pushTask(draft, task);
    link(ctx, draft, { sourceType: 'decision', sourceId: decision.id, targetType: 'delegation', targetId: task.id,
      relation: 'informs', ruleId: SURVIVAL_RULE_IDS.TRANSPORT, summary: 'Owned case-mix review.' });
    effects.push(effect(SURVIVAL_RULE_IDS.TRANSPORT, 'created', 'delegation', task.id, 'Opened an owned case-mix check.'));
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-SURV-07 */

const pct1 = (value) => `${Math.round(value * 1000) / 10}%`;
const pp1 = (value) => `${value > 0 ? '+' : ''}${Math.round(value * 1000) / 10}pp`;

/** The frozen numbers, as text, exactly as the scan computed them. */
function decompDigest(klass) {
  const d = klass.decomp;
  const cause = (label, block) => (block.refused
    ? `${label} by day 30 untested (${block.events.pooled} pooled event(s))`
    : `${label} by day 30 ${pct1(block.prior)} → ${pct1(block.recent)} (${pp1(block.delta)}${block.adjustedP !== null ? `, Holm p=${block.adjustedP}` : ''})`);
  return `Equal 30-day follow-up, recent n=${d.recentN} vs prior n=${d.priorN}. `
    + `${cause('Completed', d.completion)}; ${cause('abandoned', d.abandonment)}; `
    + `still open ${pct1(d.stillOpen.prior)} → ${pct1(d.stillOpen.recent)}.`;
}

const ABANDONMENT_LED = Object.freeze(['substitution', 'abandonment-rise', 'churn']);

/**
 * An adverse exit-mix attribution becomes the week's drift review, framed by
 * the component that moved — or, when RULE-SURV-06's generic review already
 * exists this week, owned work and exhibits attached to that decision.
 */
function decompReview(draft, ctx, klass) {
  const d = klass.decomp;
  if (!d?.available || !d.adverse) return [];
  const week = weekKey(ctx.now);
  const tag = `${SURVIVAL_RULE_IDS.DECOMP}:${klass.key}:${week}`;
  draft.survivalMarkers ||= [];
  if (draft.survivalMarkers.includes(tag)) return [];
  const abandonmentLed = ABANDONMENT_LED.includes(d.verdict);
  const digest = decompDigest(klass);
  const effects = [];

  const genericTag = `${SURVIVAL_RULE_IDS.DRIFT}:${klass.key}:${week}`;
  const existing = draft.survivalMarkers.includes(genericTag)
    ? (draft.decisions || []).find((row) => row && String(row.rationale || '').includes(`[${genericTag}]`))
    : null;

  let decision = existing || null;
  if (!decision) {
    const titles = {
      substitution: `Intake review: ${klass.label.toLowerCase()} abandonments are replacing completions`,
      'abandonment-rise': `Intake review: ${klass.label.toLowerCase()} abandonment within 30 days is rising`,
      churn: `Intake review: ${klass.label.toLowerCase()} exits of both kinds are rising`,
      'completion-decline': `Completion review: ${klass.label.toLowerCase()} finishes less within 30 days`,
      stall: `Completion review: ${klass.label.toLowerCase()} work is sitting — both exits fell`,
    };
    decision = decisionRecord(ctx, draft, {
      title: titles[d.verdict] || `Exit-mix review: ${klass.label.toLowerCase()}`,
      question: abandonmentLed
        ? `${digest} What is starting work that no longer finishes — intake quality, scope at entry, or quiet triage nobody recorded? Abandonment is an exit, not success; exit speed alone must not be read as health.`
        : `${digest} What changed for the work that used to finish — blockers, capacity, or case mix? The mix moved on the completion side, so intake tightening alone cannot be the answer.`,
      options: abandonmentLed
        ? [
          ['Audit the recent abandonments first', 'Read the linked abandonments for a recorded-reason pattern before changing any gate.', 'Reasons may be missing; that absence is itself a finding (RULE-SURV-04).'],
          ['Tighten the start gate', 'Require an explicit finish criterion before new work of this class starts.', 'Slows intake and may only move the queue upstream.'],
        ]
        : [
          ['Walk the open queue for blockers', 'Inspect the linked open items for a shared dependency or capacity constraint.', 'Finds today’s blockers, not necessarily the cohort’s.'],
          ['Cut work in progress', 'Finish or explicitly park the oldest items before starting new ones.', 'Parked work is censored, not abandoned — the curve stays honest only if the record says so.'],
        ],
      reviewOn: dayKey(addDays(ctx.now, 7)),
      rationale: `Frozen exit-mix decomposition [${tag}]. Aalen–Johansen incidence at day 30 over fixed mature cohorts; Holm across 6 classes × 2 causes. Descriptive association only; no employee score and no automatic probability or price adjustment.`,
    });
    draft.decisions ||= [];
    draft.decisions.unshift(decision);
    effects.push(effect(SURVIVAL_RULE_IDS.DECOMP, 'created', 'decision', decision.id,
      `Opened a ${abandonmentLed ? 'intake' : 'completion'} review for an adverse exit-mix shift (${DECOMP_VERDICT_LABELS[d.verdict]}).`));
  }
  draft.survivalMarkers.push(tag);
  draft.survivalMarkers = draft.survivalMarkers.slice(-400);

  for (const item of klass.open.slice(0, 20)) {
    if (link(ctx, draft, {
      sourceType: 'decision', sourceId: decision.id,
      targetType: item.sourceType, targetId: item.sourceId, relation: 'informs',
      ruleId: SURVIVAL_RULE_IDS.DECOMP, summary: 'Open work in a class whose 30-day exit mix shifted adversely.',
    })) {
      effects.push(effect(SURVIVAL_RULE_IDS.DECOMP, 'linked', item.sourceType, item.sourceId, 'Linked affected open work to the exit-mix review.'));
    }
  }
  if (abandonmentLed) {
    const exhibits = klass.items
      .filter((item) => item.exitType === 'abandoned')
      .sort((a, b) => String(b.startedOn).localeCompare(String(a.startedOn)))
      .slice(0, 10);
    for (const item of exhibits) {
      if (link(ctx, draft, {
        sourceType: 'decision', sourceId: decision.id,
        targetType: item.sourceType, targetId: item.sourceId, relation: 'informs',
        ruleId: SURVIVAL_RULE_IDS.DECOMP, summary: 'Recent abandonment — exhibit for the intake review.',
      })) {
        effects.push(effect(SURVIVAL_RULE_IDS.DECOMP, 'linked', item.sourceType, item.sourceId, 'Linked a recent abandonment as an exhibit for the intake review.'));
      }
    }
  }

  const ownerId = resolveOwner(draft, { ownerId: null });
  if (ownerId) {
    const task = delegationRecord(ctx, {
      personId: ownerId,
      title: abandonmentLed
        ? `Sample recent ${klass.label.toLowerCase()} abandonments for the intake review`
        : `Walk open ${klass.label.toLowerCase()} for blockers behind the completion drop`,
      expectedOutcome: abandonmentLed
        ? 'Read the linked recent abandonments and record, in the decision, whether a shared reason, scope pattern or missing finish criterion explains the shift. If the reasons are not recorded, say so there — an unrecorded reason is the finding.'
        : 'Inspect the linked open items for a shared blocker, dependency or capacity constraint and record what you find in the decision. Do not infer causation from the test; the decomposition attributes the shift, it does not explain it.',
      support: `Review decision ${decision.id}; ${digest}`,
      dueOn: dayKey(addDays(ctx.now, 5)),
      tag,
    });
    pushTask(draft, task);
    link(ctx, draft, {
      sourceType: 'decision', sourceId: decision.id, targetType: 'delegation', targetId: task.id,
      relation: 'informs', ruleId: SURVIVAL_RULE_IDS.DECOMP, summary: 'Owned exit-mix investigation.',
    });
    effects.push(effect(SURVIVAL_RULE_IDS.DECOMP, 'created', 'delegation', task.id, 'Opened an owned investigation for the exit-mix review.'));
  }
  return effects;
}

/** A significant improvement is evidence too — capture it before it is folklore. */
function decompLearning(draft, ctx, klass) {
  const d = klass.decomp;
  if (!d?.available || !d.favorable) return [];
  const tag = `${SURVIVAL_RULE_IDS.DECOMP}:learn:${klass.key}:${weekKey(ctx.now)}`;
  draft.survivalMarkers ||= [];
  if (draft.survivalMarkers.includes(tag)) return [];
  const ownerId = resolveOwner(draft, { ownerId: null });
  if (!ownerId) return [];
  draft.survivalMarkers.push(tag);
  draft.survivalMarkers = draft.survivalMarkers.slice(-400);
  const task = delegationRecord(ctx, {
    personId: ownerId,
    title: `Capture what changed in ${klass.label.toLowerCase()}: ${DECOMP_VERDICT_LABELS[d.verdict].toLowerCase()}`,
    expectedOutcome: 'Write down what actually changed operationally between the two start cohorts — staffing, intake, tooling, scope discipline — while it is still remembered. An improvement nobody can explain is luck until the record says otherwise; this note is what turns it into a practice.',
    support: decompDigest(klass),
    dueOn: dayKey(addDays(ctx.now, 7)),
    tag,
  });
  pushTask(draft, task);
  return [effect(SURVIVAL_RULE_IDS.DECOMP, 'created', 'delegation', task.id, 'Opened an owned task to capture a significant delivery improvement.')];
}

/* ------------------------------------------------------------- RULE-SURV-08 */

const MAX_CHALLENGE_TASKS_PER_SCAN = 3;
const MAX_CHALLENGE_NOTES_PER_SCAN = 5;

/**
 * A frozen forecast should find out when the curve it rode on stops
 * describing recent work — without the frozen numbers ever being touched.
 * The challenge is axis-specific on purpose: a survival reading freezes
 * *completion* probabilities, so either axis failing challenges it; a wait
 * exposure certificate freezes *any-exit timing*, so only a timing failure
 * opens re-freeze work for it. Everything is marker-idempotent per artefact,
 * class, axis and ISO week.
 */
function frozenChallenges(draft, ctx, report) {
  const effects = [];
  draft.survivalMarkers ||= [];
  const week = weekKey(ctx.now);
  const ownerId = resolveOwner(draft, { ownerId: null });
  let tasks = 0;
  let notes = 0;
  for (const klass of report.classes) {
    const t = klass.transport;
    if (!t) continue;
    const mixDown = Boolean(t.mix?.challenged);
    const completionDown = t.completion.status === 'undermined' || mixDown;
    const timingDown = t.timing.status === 'undermined' || mixDown;
    if (!completionDown && !timingDown) continue;
    const axis = completionDown && timingDown ? 'both' : completionDown ? 'completion' : 'timing';

    for (const reading of Array.isArray(draft.survivalReadings) ? draft.survivalReadings : []) {
      if (notes >= MAX_CHALLENGE_NOTES_PER_SCAN) break;
      if (!reading || reading.status !== 'frozen') continue;
      const affected = (reading.predictions || []).filter((p) => p && p.classKey === klass.key).length;
      if (!affected) continue;
      const tag = `${SURVIVAL_RULE_IDS.TRANSPORT}:reading:${reading.id}:${klass.key}:${axis}:${week}`;
      if (draft.survivalMarkers.includes(tag)) continue;
      draft.survivalMarkers.push(tag);
      note(reading, ctx, 'transport',
        `Transport challenge (${klass.label}, ${axis} axis): ${mixDown ? t.mix.reason : completionDown ? t.completion.basis : t.timing.basis}. ${affected} frozen prediction(s) ride on this class. The frozen probabilities are unchanged; grade the reading against what happened rather than quietly re-freezing.`);
      notes += 1;
      effects.push(effect(SURVIVAL_RULE_IDS.TRANSPORT, 'updated', 'reading', reading.id,
        `Appended a ${axis}-axis transport challenge to a frozen reading (${klass.label}).`));
    }

    if (timingDown && ownerId && tasks < MAX_CHALLENGE_TASKS_PER_SCAN) {
      const certificates = Array.isArray(draft.waitExposures) ? draft.waitExposures : [];
      const newest = certificates.find((cert) => cert && cert.id
        && (cert.items || []).some((item) => item && item.classKey === klass.key));
      if (newest) {
        const tag = `${SURVIVAL_RULE_IDS.TRANSPORT}:exposure:${newest.id}:${klass.key}:${week}`;
        if (!draft.survivalMarkers.includes(tag)) {
          draft.survivalMarkers.push(tag);
          const task = delegationRecord(ctx, {
            personId: ownerId,
            title: `Re-freeze the cost-of-waiting exposure: ${klass.label.toLowerCase()} ${mixDown ? 'case mix requires review' : 'timing failed its transport check'}`,
            expectedOutcome: 'Review whether the pooled delivery curve still describes this class, then freeze a new weekly exposure certificate. The challenged certificate is never edited in place — a new week gets a new snapshot and the old one stays as the record of what was believed.',
            support: `${SURVIVAL_RULE_IDS.TRANSPORT} opened this during an explicit scan. Timing / case-mix check: ${mixDown ? t.mix.reason : t.timing.basis}.`,
            dueOn: dayKey(addDays(ctx.now, 3)),
            tag,
          });
          pushTask(draft, task);
          if (link(ctx, draft, {
            sourceType: 'delegation', sourceId: task.id,
            targetType: 'exposure', targetId: newest.id,
            relation: 'tracks-followup', ruleId: SURVIVAL_RULE_IDS.TRANSPORT,
            summary: 'Owned re-freeze work for a challenged exposure certificate.',
          })) {
            effects.push(effect(SURVIVAL_RULE_IDS.TRANSPORT, 'linked', 'exposure', newest.id,
              'Linked the re-freeze task to the challenged exposure certificate.'));
          }
          tasks += 1;
          effects.push(effect(SURVIVAL_RULE_IDS.TRANSPORT, 'created', 'delegation', task.id,
            `Opened one owned re-freeze task for a timing-challenged exposure certificate (${klass.label}).`));
        }
      }
    }
  }
  draft.survivalMarkers = draft.survivalMarkers.slice(-400);
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

  ctx = { ...ctx, now };
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
      // The decomposition runs before the generic drift review so the week's
      // single drift decision carries the component framing when one exists.
      effects.push(...decompReview(draft, ctx, klass));
      effects.push(...decompLearning(draft, ctx, klass));
      effects.push(...driftReview(draft, ctx, klass));
      effects.push(...caseMixReview(draft, ctx, klass));
      if (!klass.counts.exits) continue;
      if (klass.abandonSharePct === null || klass.abandonSharePct < conventions.abandonSharePct) continue;
      effects.push(...classDecision(draft, ctx, klass, conventions));
    }
    effects.push(...reasonlessAbandonment(draft, ctx));
    effects.push(...gradeOverdue(draft, ctx, conventions));
    // Transport challenges run last: they read the report the scan already
    // built and append to artefacts the other rules may have just touched.
    effects.push(...frozenChallenges(draft, ctx, report));
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
survivalRule.label = 'Delivery survival propagation (RULE-SURV-01..08)';
survivalRule.module = 'survivalRules.js';
survivalRule.triggers = Object.values(SURVIVAL_EVENTS);
survivalRule.effect = (draft, event, context = {}) => survivalRule(draft, { ...context, event });
Object.freeze(survivalRule);

export default survivalRule;

export { routeForSource };
