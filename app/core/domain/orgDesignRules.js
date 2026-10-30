/**
 * app/core/domain/orgDesignRules.js — the post-commit side of the Structural
 * Design Terminal (Schema v53), on the shared rule spine (ADR-0008).
 *
 * A reporting line is the cheapest thing in this app to change and the most
 * expensive thing to get wrong: it changes who a person's boss is, and it is
 * usually communicated as a diagram. These rules make the consequential parts
 * become owned work in the same transaction as the change, and they are
 * deliberately quiet when there is nothing to do.
 *
 *  RULE-ORD-01  `orgdesign.declared` / `.updated` / `.committed`
 *               Typed `structures` provenance from the design to every person it
 *               places, and `resizes` provenance to every manager whose unit
 *               size it changes. Re-running cannot duplicate an edge.
 *
 *  RULE-ORD-02  `orgdesign.committed`, when a unit is still over the band
 *               Exactly one DACI decision about the *residual structural
 *               problem* — split the unit, move the work, or shrink the scope —
 *               plus one owned task on the over-band manager to name what stops.
 *               Never a decision to move one named person to another named
 *               person: that converts a structural finding into a private
 *               bargain between two managers.
 *
 *  RULE-ORD-03  `orgdesign.committed`
 *               At most three blameless 1:1 talking points on the people whose
 *               reporting line or depth changed. A reorg is felt as a loss of
 *               standing long before it is felt as a cost saving, and "nobody
 *               told me why" is the part that lasts.
 *
 *  RULE-ORD-04  `orgdesign.committed`
 *               One dated outcome review with the frozen prediction restated in
 *               its own question. A committed design that is never revisited is
 *               a diagram, not a decision.
 *
 *  RULE-ORD-05  `orgdesign.settled`
 *               Resolves the frozen prediction: the median absolute percentage
 *               error between the modelled wait and what the same managers
 *               measure afterwards is appended to `outcomes`, withheld below the
 *               declared floor. The prediction is never rewritten — it is scored.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  buildStructure,
  designContract,
  orgDesignSignals,
  scoreDesignPrediction,
  simulateDesign,
} from './orgDesign.js';

export const ORG_DECLARED_EVENT = 'orgdesign.declared';
export const ORG_UPDATED_EVENT = 'orgdesign.updated';
export const ORG_COMMITTED_EVENT = 'orgdesign.committed';
export const ORG_REVERTED_EVENT = 'orgdesign.reverted';
export const ORG_SETTLED_EVENT = 'orgdesign.settled';
export const ORG_SCANNED_EVENT = 'orgdesign.scanned';

export const ORG_RULE_IDS = Object.freeze({
  LINKED: 'RULE-ORD-01',
  RESIDUAL: 'RULE-ORD-02',
  MOVED: 'RULE-ORD-03',
  OUTCOME_REVIEW: 'RULE-ORD-04',
  SCORE: 'RULE-ORD-05',
});

const MAX_TOPICS = 12;
const MAX_MOVED_PROMPTS = 3;
const MAX_LINKS = 40;

function marker(tag) {
  return `[${tag}]`;
}

function hasMarker(rows, field, tag) {
  const token = marker(tag);
  return (rows || []).some((row) => row && typeof row[field] === 'string' && row[field].includes(token));
}

function activePeople(draft) {
  return (draft.people || []).filter((person) => person && person.status !== 'archived');
}

function decisionRecord(ctx, { title, question, options, reviewOn, rationaleHint, reversibility = 'reversible' }) {
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 4000),
    date: today,
    reversibility,
    driver: String(ctx.draft?.settings?.leaderName || '').slice(0, 120),
    approver: String(ctx.draft?.settings?.leaderName || '').slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '',
    rationale: String(rationaleHint || '').slice(0, 4000),
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
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('delegation'),
    personId,
    title: title.slice(0, 200),
    expectedOutcome: expectedOutcome.slice(0, 2000),
    authority: 'act-inform',
    support: support.slice(0, 2000),
    delegatedOn: today,
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

const TALKING_POINT_MAX = 240;

/**
 * Append one idempotency-marked talking point.
 *
 * The marker is reserved out of the length budget rather than concatenated and
 * then truncated: a prompt whose marker fell off the end of a 240-character cap
 * would be re-added on every scan, which is the exact alert-fatigue failure the
 * marker exists to prevent.
 */
function addTalkingPoint(person, text, tag) {
  if (!person) return false;
  const token = marker(tag);
  person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
  if (person.talkingPoints.some((row) => String(row).includes(token))) return false;
  const budget = Math.max(0, TALKING_POINT_MAX - token.length - 1);
  const trimmed = text.length > budget ? `${text.slice(0, Math.max(0, budget - 1)).trimEnd()}…` : text;
  person.talkingPoints = [...person.talkingPoints, `${trimmed} ${token}`].slice(-MAX_TOPICS);
  return true;
}

function link(ctx, draft, { sourceType, sourceId, targetType, targetId, relation, summary, ruleId }) {
  const { created } = ensureEntityLink(draft, {
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary,
  }, { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() });
  return created;
}

/* -------------------------------------------------------- RULE-ORD-01 */

function linkDesign(draft, ctx, design) {
  const effects = [];
  if (!design) return effects;
  const people = new Set(activePeople(draft).map((person) => person.id));
  let count = 0;
  for (const move of (design.moves || []).slice(0, MAX_LINKS)) {
    if (!move || !people.has(move.personId)) continue;
    const created = link(ctx, draft, {
      sourceType: 'orgdesign',
      sourceId: design.id,
      targetType: 'person',
      targetId: move.personId,
      relation: 'structures',
      ruleId: ORG_RULE_IDS.LINKED,
      summary: 'This design places this person under a named manager. The record is the design’s, not a private note.',
    });
    if (created) {
      count += 1;
    }
    if (move.toManagerId && people.has(move.toManagerId)) {
      const managerLinked = link(ctx, draft, {
        sourceType: 'orgdesign',
        sourceId: design.id,
        targetType: 'person',
        targetId: move.toManagerId,
        relation: 'resizes',
        ruleId: ORG_RULE_IDS.LINKED,
        summary: 'This design changes the size of this manager’s unit, and therefore their coordination load.',
      });
      if (managerLinked) count += 1;
    }
  }
  if (count) {
    effects.push({
      ruleId: ORG_RULE_IDS.LINKED,
      action: 'linked',
      targetType: 'orgdesign',
      targetId: design.id,
      summary: `Recorded ${count} typed structural relationship(s) for this design.`,
    });
  }
  return effects;
}

/* -------------------------------------------------------- RULE-ORD-02 */

/**
 * The residual after a reorg.
 *
 * A commit that leaves a manager over the band has not solved the problem it
 * was meant to solve. The response is one decision about the *shape* — with a
 * named option for shrinking scope, which is the option leaders skip — and one
 * owned task, never an assignment of a person to a person.
 */
function residualPropagation(draft, ctx, design, simulation) {
  const effects = [];
  const over = simulation.proposed.span.overBand;
  if (!over.length) return effects;
  const tag = `ORD-RESIDUAL:${design.id}`;
  if (hasMarker(draft.decisions, 'question', tag)) return effects;
  const worst = over[0];
  const conv = designContract(design).conventions;
  const reviewOn = addDays(dayKey(ctx.now), 21);
  const decision = decisionRecord(ctx, {
    title: `How does ${worst.managerName}’s unit get back inside the ${conv.spanMin}–${conv.spanMax} band?`.slice(0, 200),
    question: `After the “${design.label}” design was applied, ${over.length} manager(s) are still above the declared span maximum of ${conv.spanMax}; the largest is ${worst.managerName} with ${worst.span} direct reports (${worst.channels} coordination channels). `
      + `Choose the mechanism, not the person: (1) split the unit and appoint an accountable manager, (2) move a whole workstream — with its outcomes and its owner — to a manager with headroom, or (3) shrink what this unit is for and stop the work that no longer fits. `
      + `Moving one named report to one named manager is deliberately not an option here: that is a private arrangement between two managers, not a structural decision, and it leaves the span problem where it was. ${marker(tag)}`,
    options: [
      ['Split the unit and appoint a manager', 'Reduces span and coordination load directly.', 'Adds a layer, a manager cost and a new coordination boundary.'],
      ['Move a whole workstream with its outcomes', 'Keeps the unit intact and transfers real ownership.', 'The receiving manager’s span rises; the work must be able to travel.'],
      ['Shrink the unit’s scope and stop some work', 'Reduces the number of parallel streams the manager actually holds.', 'Requires naming what stops — which is the part that is usually avoided.'],
    ],
    reviewOn,
    rationaleHint: `Opened by ${ORG_RULE_IDS.RESIDUAL} because the committed design left ${over.length} unit(s) over the declared span band. The band is a declared convention, not a law.`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  link(ctx, draft, {
    sourceType: 'orgdesign',
    sourceId: design.id,
    targetType: 'decision',
    targetId: decision.id,
    relation: 'screens',
    ruleId: ORG_RULE_IDS.RESIDUAL,
    summary: 'This decision resolves the span breach the committed design left behind.',
  });
  effects.push({
    ruleId: ORG_RULE_IDS.RESIDUAL,
    action: 'created',
    targetType: 'decision',
    targetId: decision.id,
    summary: `Opened one structural decision for ${over.length} unit(s) still over the declared span band.`,
  });

  // One owned task on the over-band manager: the honest first step is to name
  // what the unit is currently for. Bounded to the single largest unit.
  if (worst.managerId) {
    const taskTag = `ORD-SCOPE:${design.id}:${worst.managerId}`;
    if (!hasMarker(draft.delegations, 'support', taskTag)) {
      const task = delegationRecord(ctx, {
        personId: worst.managerId,
        title: `Name what ${worst.managerName}’s unit does and what could stop`.slice(0, 200),
        expectedOutcome: `A written list of the unit’s current streams, which of them could stop or move without losing an outcome, and the one you would stop first. Due ${addDays(dayKey(ctx.now), 14)}. This is the input the structural decision needs; without it the decision is a preference.`,
        support: `Generated by ${ORG_RULE_IDS.RESIDUAL} (${worst.span} direct reports vs a declared maximum of ${conv.spanMax}). Marker ${marker(taskTag)}.`,
        dueOn: addDays(dayKey(ctx.now), 14),
      });
      draft.delegations.push(task);
      link(ctx, draft, {
        sourceType: 'orgdesign',
        sourceId: design.id,
        targetType: 'delegation',
        targetId: task.id,
        relation: 'tracks-followup',
        ruleId: ORG_RULE_IDS.RESIDUAL,
        summary: 'This owned task produces the scope evidence the structural decision needs.',
      });
      effects.push({
        ruleId: ORG_RULE_IDS.RESIDUAL,
        action: 'created',
        targetType: 'delegation',
        targetId: task.id,
        summary: 'Opened one owned scope task on the most over-band manager.',
      });
    }
  }
  return effects;
}

/* -------------------------------------------------------- RULE-ORD-03 */

function movedPropagation(draft, ctx, design, simulation) {
  const effects = [];
  const people = new Map((draft.people || []).map((person) => [person.id, person]));
  // The moves come from the *design*, not from a re-simulation: this rule runs
  // after the reporting lines have already been applied in the same transaction,
  // so a fresh simulation would legitimately report that nothing moved. The
  // snapshot's applied moves are the record of who actually changed.
  const applied = Array.isArray(design.snapshot?.appliedMoves) && design.snapshot.appliedMoves.length
    ? design.snapshot.appliedMoves.map((row) => ({ personId: row.personId }))
    : (design.moves || []).map((row) => ({ personId: row.personId }));
  const rows = applied.filter((row) => row.personId && (design.snapshot?.appliedMoves?.length
    ? true
    : (simulation.delta.movedPeople || []).some((moved) => moved.personId === row.personId)));
  for (const row of rows.slice(0, MAX_MOVED_PROMPTS)) {
    const person = people.get(row.personId);
    if (!person || person.status === 'archived') continue;
    const tag = `ORD-MOVED:${design.id}:${row.personId}`;
    const added = addTalkingPoint(
      person,
      `Their reporting line or depth changed under “${design.label}”. Ask what they lost in the change — standing, a sponsor, a clear route to their next role — before assuming the new line is only an improvement. This is a conversation, not a performance note.`,
      tag,
    );
    if (added) {
      effects.push({
        ruleId: ORG_RULE_IDS.MOVED,
        action: 'updated',
        targetType: 'person',
        targetId: row.personId,
        summary: 'Queued one blameless 1:1 talking point for a person whose reporting line changed.',
      });
    }
  }
  return effects;
}

/* -------------------------------------------------------- RULE-ORD-04 */

function outcomeReview(draft, ctx, design, simulation) {
  const effects = [];
  const tag = `ORD-REVIEW:${design.id}`;
  if (hasMarker(draft.decisions, 'question', tag)) return effects;
  const frozen = design.snapshot;
  if (!frozen) return effects;
  const horizon = designContract(design).reviewHorizonDays;
  const reviewOn = design.reviewOn || addDays(dayKey(ctx.now), horizon);
  const predictedWait = frozen.predicted?.modelledWaitP80Weeks;
  const decision = decisionRecord(ctx, {
    title: `Did the “${design.label}” design change the way the team works?`.slice(0, 200),
    question: `The design was applied on ${design.committedOn || dayKey(ctx.now)} with ${frozen.moved ?? simulation.delta.moved} person(s) moved. It froze: max span ${frozen.after?.maxSpan ?? '—'}, `
      + `${frozen.after?.overBandCount ?? '—'} unit(s) over the band, ${frozen.after?.coordinationHoursPerWeek ?? '—'} coordination hours per week and a modelled median P80 decision wait of ${predictedWait === null || predictedWait === undefined ? 'not modelled' : `${predictedWait} weeks`}. `
      + `Read the same four numbers now and, separately, ask the people in the moved units whether the change made their work clearer. The model is graded on the numbers; the judgement is graded on the conversation. ${marker(tag)}`,
    options: [
      ['The structure holds — keep it', 'The reading moved in the intended direction and the people in it agree.', 'No further structural change this cycle.'],
      ['The structure holds but the cost is wrong', 'Span and wait improved; the coordination or manager cost did not.', 'Consider a flatter variant before adding another layer.'],
      ['The structure did not do what it was for', 'The reading did not move, or it moved the wrong way.', 'Revert or redesign, and record what the model missed.'],
    ],
    reviewOn,
    rationaleHint: `Opened by ${ORG_RULE_IDS.OUTCOME_REVIEW}. The frozen prediction is restated here so the review is about a claim that was made, not a story told afterwards.`,
  });
  draft.decisions.push(decision);
  link(ctx, draft, {
    sourceType: 'orgdesign',
    sourceId: design.id,
    targetType: 'decision',
    targetId: decision.id,
    relation: 'screens',
    ruleId: ORG_RULE_IDS.OUTCOME_REVIEW,
    summary: 'This date-bound review holds the committed design to its frozen prediction.',
  });
  effects.push({
    ruleId: ORG_RULE_IDS.OUTCOME_REVIEW,
    action: 'created',
    targetType: 'decision',
    targetId: decision.id,
    summary: `Scheduled one dated outcome review for ${reviewOn}.`,
  });
  return effects;
}

/* -------------------------------------------------------- RULE-ORD-05 */

function settleScore(draft, ctx, design) {
  const effects = [];
  const score = scoreDesignPrediction(draft, design, { now: ctx.now });
  design.outcomes = Array.isArray(design.outcomes) ? design.outcomes : [];
  const existing = design.outcomes.find((row) => row && row.on === dayKey(ctx.now));
  if (existing) return effects;
  design.outcomes.push({
    on: dayKey(ctx.now),
    medianApePct: score.medianApePct,
    scoredCount: score.scoredCount ?? 0,
    predicted: design.snapshot?.predicted?.modelledWaitP80Weeks ?? null,
    observed: score.rows.length
      ? (score.rows.map((row) => row.observed).filter((v) => typeof v === 'number')[0] ?? null)
      : null,
  });
  effects.push({
    ruleId: ORG_RULE_IDS.SCORE,
    action: 'updated',
    targetType: 'orgdesign',
    targetId: design.id,
    summary: score.medianApePct === null
      ? 'Closed a design prediction window without enough measured managers to score it.'
      : `Scored the frozen design prediction at a median absolute error of ${score.medianApePct}%.`,
  });
  return effects;
}

/* ------------------------------------------------------------- the rule */

function shouldRun(event) {
  const type = typeof event?.type === 'string' ? event.type : '';
  if (type === ORG_DECLARED_EVENT || type === ORG_UPDATED_EVENT) return 'link';
  if (type === ORG_COMMITTED_EVENT) return 'commit';
  if (type === ORG_SETTLED_EVENT) return 'settle';
  if (type === ORG_SCANNED_EVENT) return 'scan';
  return null;
}

export function orgDesignRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event) return [];
  const mode = shouldRun(event);
  if (!mode) return [];
  if (draft.settings?.orgAutoPropagate === false && mode !== 'scan') return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const ruleCtx = {
    now,
    event,
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
    draft,
  };
  const designs = Array.isArray(draft.orgDesigns) ? draft.orgDesigns : [];
  const design = event.entityId ? designs.find((row) => row && row.id === event.entityId) : null;
  if (!design) return [];

  const effects = [];
  if (mode === 'link') {
    effects.push(...linkDesign(draft, ruleCtx, design));
  } else if (mode === 'commit') {
    const contract = designContract(design);
    const simulation = simulateDesign(draft, design, { now, conventions: contract.conventions });
    effects.push(...linkDesign(draft, ruleCtx, design));
    effects.push(...residualPropagation(draft, ruleCtx, design, simulation));
    effects.push(...movedPropagation(draft, ruleCtx, design, simulation));
    effects.push(...outcomeReview(draft, ruleCtx, design, simulation));
  } else if (mode === 'settle') {
    effects.push(...settleScore(draft, ruleCtx, design));
  } else if (mode === 'scan') {
    // An explicit scan is the leader's "look again": links, signals and, if the
    // window has closed, the score. It never commits anything.
    effects.push(...linkDesign(draft, ruleCtx, design));
    if (design.status === 'committed' && design.reviewOn && design.reviewOn <= dayKey(now)) {
      effects.push(...settleScore(draft, ruleCtx, design));
    }
    for (const signal of orgDesignSignals(draft, now).slice(0, 6)) {
      if (typeof ctx.logEvent === 'function') {
        ctx.logEvent({
          type: 'automation.note',
          entity: 'orgdesign',
          entityId: design.id,
          summary: `[${signal.ruleId}] ${signal.title}`.slice(0, 300),
        });
      }
    }
  }

  for (const effect of effects) {
    if (typeof ctx.logEvent === 'function') {
      ctx.logEvent({
        type: 'automation.step',
        entity: effect.targetType || 'workspace',
        entityId: effect.targetId || '',
        summary: `[${effect.ruleId}] ${effect.summary}`.slice(0, 300),
      });
    }
  }
  return effects;
}

/** Exported for the view: the structure a committed design produced. */
export function committedStructure(state) {
  return buildStructure(state);
}
