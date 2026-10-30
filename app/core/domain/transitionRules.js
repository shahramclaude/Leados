/**
 * app/core/domain/transitionRules.js — the post-commit side of the Workforce
 * Transition Terminal (Schema v52), on the shared rule spine (ADR-0008).
 *
 * A reduction plan is the highest-consequence document a leader signs. These
 * rules make the reading become work in the same atomic transaction as the event
 * that produced it, and they are deliberately quiet: no plan, no screen failure,
 * no knowledge risk, no survivor overload — no records.
 *
 *  RULE-TRN-01  `transition.declared` / `.updated` / `.decided` / `.scanned`
 *               Typed `separates` provenance from the programme to every person
 *               it proposes to exit, and `screens` provenance to the mechanism
 *               decision a failed screen opens. Re-running cannot duplicate an
 *               edge.
 *
 *  RULE-TRN-02  a failed selection screen
 *               Exactly one DACI decision about the *criteria and the target*,
 *               carrying the measured ratio, the interval on the worst group and
 *               the price of the cheapest compliant plan. Never a decision to
 *               swap one named person for another: that converts a structural
 *               finding into two private bargains.
 *
 *  RULE-TRN-03  knowledge that walks out
 *               One owned hand-over delegation per materially at-risk leaver
 *               (bounded, highest risk first) with a due date before the last
 *               working day, plus the typed edge. A sole steward of a critical
 *               dependency is not converted into a task — it is a blocker the
 *               leader has to resolve first.
 *
 *  RULE-TRN-04  survivor load
 *               At most three blameless 1:1 talking points on the retained
 *               people who absorb the most recorded ownership. Never a
 *               performance note, and never a per-person prediction.
 *
 *  RULE-TRN-05  `transition.finalized`
 *               One dated outcome review with the frozen prediction restated in
 *               its own question, plus one owned task to record who actually
 *               left. A finalized reduction that is never revisited is a
 *               payment, not a decision.
 *
 *  RULE-TRN-06  `person.archived`
 *               Each archived person resolves the frozen prediction about them,
 *               so the survivor convention grades itself out of sample. Nothing
 *               is recomputed: the prediction was frozen at finalization.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { TRANSITION_CONVENTIONS, transitionReading } from './transition.js';

export const TRANSITION_DECLARED_EVENT = 'transition.declared';
export const TRANSITION_UPDATED_EVENT = 'transition.updated';
export const TRANSITION_DECIDED_EVENT = 'transition.decided';
export const TRANSITION_SCANNED_EVENT = 'transition.scanned';
export const TRANSITION_FINALIZED_EVENT = 'transition.finalized';
export const TRANSITION_GATE_EVENT = 'transition.gate.recorded';

export const TRANSITION_RULE_IDS = Object.freeze({
  LINKED: 'RULE-TRN-01',
  SCREEN: 'RULE-TRN-02',
  HANDOVER: 'RULE-TRN-03',
  SURVIVORS: 'RULE-TRN-04',
  OUTCOME_REVIEW: 'RULE-TRN-05',
  DEPARTURE: 'RULE-TRN-06',
});

const MAX_TOPICS = 12;
const MAX_HANDOVERS = 6;
const MAX_SURVIVOR_PROMPTS = 3;

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

function ownerFor(draft, program) {
  const direct = (draft.people || []).find((person) => person && person.id === program?.ownerId);
  return direct && direct.status !== 'archived' ? direct : null;
}

function decisionRecord(ctx, { title, question, options, reviewOn, rationaleHint }) {
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 4000),
    date: today,
    reversibility: 'irreversible',
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

function addTalkingPoint(person, text, tag) {
  if (!person) return false;
  const token = marker(tag);
  person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
  if (person.talkingPoints.some((row) => String(row).includes(token))) return false;
  person.talkingPoints = [...person.talkingPoints, `${text} ${token}`.slice(0, 240)].slice(-MAX_TOPICS);
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

/* -------------------------------------------------------- RULE-TRN-01 */

function linkProgram(draft, ctx, program) {
  const effects = [];
  const people = new Set(activePeople(draft).map((person) => person.id));
  for (const row of program.rows || []) {
    if (!row || !row.selected || !people.has(row.personId)) continue;
    const created = link(ctx, draft, {
      sourceType: 'transition',
      sourceId: program.id,
      targetType: 'person',
      targetId: row.personId,
      relation: 'separates',
      ruleId: TRANSITION_RULE_IDS.LINKED,
      summary: 'This programme proposes this person’s exit. The record is the programme’s, not a private note.',
    });
    if (created) {
      effects.push({
        ruleId: TRANSITION_RULE_IDS.LINKED,
        action: 'linked',
        targetType: 'person',
        targetId: row.personId,
        summary: 'Linked the programme to a person it proposes to exit.',
      });
    }
  }
  const owner = ownerFor(draft, program);
  if (owner) {
    const created = link(ctx, draft, {
      sourceType: 'transition',
      sourceId: program.id,
      targetType: 'person',
      targetId: owner.id,
      relation: 'stewards',
      ruleId: TRANSITION_RULE_IDS.LINKED,
      summary: 'The programme owner is accountable for the process, including how it is communicated.',
    });
    if (created) {
      effects.push({
        ruleId: TRANSITION_RULE_IDS.LINKED,
        action: 'linked',
        targetType: 'person',
        targetId: owner.id,
        summary: 'Linked the programme to its accountable owner.',
      });
    }
  }
  return effects;
}

/* -------------------------------------------------------- RULE-TRN-02 */

/**
 * A failed screen becomes a decision about the mechanism.
 *
 * Same choice as the merit terminal, for the same reason: answering "the ratio
 * is 0.62" with "swap these two people" hides a structural finding inside two
 * private bargaining conversations, and leaves the criteria that produced it
 * exactly where they were.
 */
function screenPropagation(draft, ctx, program, reading) {
  const effects = [];
  const tag = `TRN-SCREEN:${program.id}`;
  if (hasMarker(draft.decisions, 'question', tag)) return effects;
  const screen = reading.screen;
  if (screen.status !== 'ok' || !screen.flagged) return effects;

  const worst = screen.groups.slice().sort((a, b) => a.rate - b.rate)[0];
  const best = screen.groups.slice().sort((a, b) => b.rate - a.rate)[0];
  const compliance = reading.compliance;
  const priced = compliance?.status === 'ok' && !compliance.alreadyCompliant
    ? (compliance.feasible
      ? `The cheapest set of swaps that clears the floor is ${compliance.swaps.length} swap(s): ${Math.round(compliance.costDelta)} ${program.currency || 'USD'} of additional exit cost and ${compliance.scoreLoss} of composite exposure lost, at the same headcount.`
      : 'No swap set inside this plan reaches the floor at this headcount, so the target or the criteria have to change.')
    : 'The price of compliance has not been computed yet; the scan will price it.';

  const decision = decisionRecord(ctx, {
    title: `Fix the selection criteria in “${program.label}”, not two names`.slice(0, 200),
    question: `The selection screen on “${program.label}” is at ${screen.ratio} against a ${screen.threshold} floor: `
      + `${worst.label} is selected at ${worst.ratePct}% (95% interval ${worst.lowPct}–${worst.highPct}%) against ${best.ratePct}% in ${best.label}. `
      + `${priced} `
      + 'Which mechanism do you change? The screen is a heuristic applied to a declared dimension, not a legal finding — a ratio above the floor does not prove fairness any more than one below it proves discrimination. '
      + `${marker(tag)}`,
    options: [
      [
        'Publish the scoring grid and re-run the selection against it',
        'A grid that reviewers can see removes discretion from the place where it is least visible and most consequential. It is also the only option that can be audited by someone who was not in the room.',
        'Takes time the deadline may not allow, and a badly designed grid can be gamed as easily as a manager’s judgement.',
      ],
      [
        'Widen the pool the criteria are applied to',
        'Many apparent disparities are a pool artefact: the under-selected group only exists in the lowest-exposure roles. Applying the criteria to a wider population can remove the pattern without touching a single name.',
        'A wider pool usually means more exits than planned, or a longer timeline, or both.',
      ],
      [
        'Adopt the cheapest compliant plan and document the trade',
        'It clears the floor with a known price in cash and capability, and the price is written down where a reviewer can disagree with it.',
        'Buying compliance by swapping people is still selecting by group. It is defensible only if the criteria genuinely score those swaps as near-equal.',
      ],
      [
        'Change the target instead of the criteria',
        'If the criteria cannot produce a defensible list at this headcount, the headcount is the thing that is wrong, not the arithmetic.',
        'Costs more money and may not be available: the budget is usually the reason the target exists.',
      ],
    ],
    reviewOn: addDays(dayKey(ctx.now), 7),
    rationaleHint: `Opened by ${TRANSITION_RULE_IDS.SCREEN} when the selection screen fell below the declared floor. The screen runs on a declared organisational dimension or on opaque group codes; no protected characteristic is stored.`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  link(ctx, draft, {
    sourceType: 'transition',
    sourceId: program.id,
    targetType: 'decision',
    targetId: decision.id,
    relation: 'screens',
    ruleId: TRANSITION_RULE_IDS.SCREEN,
    summary: 'This decision exists because the selection screen fell below the declared floor.',
  });
  effects.push({
    ruleId: TRANSITION_RULE_IDS.SCREEN,
    action: 'created',
    targetType: 'decision',
    targetId: decision.id,
    summary: `Opened one mechanism decision at ratio ${screen.ratio} against ${screen.threshold}.`,
  });

  const target = ownerFor(draft, program);
  if (target) {
    const tagTask = `TRN-EVID:${program.id}`;
    if (!hasMarker(draft.delegations, 'support', tagTask)) {
      const task = delegationRecord(ctx, {
        personId: target.id,
        title: `Produce the scoring grid behind “${program.label}”`.slice(0, 200),
        expectedOutcome: `For every named exit, record the criterion scores that put them there and the reviewer who agreed them, for the ${screen.dimension === 'declared-group' ? 'opaque group codes' : screen.dimension} dimension. The mechanism decision is not answerable without it.`,
        support: `Generated by ${TRANSITION_RULE_IDS.SCREEN}. Marker ${marker(tagTask)}. This is evidence work on the process, not on any person.`,
        dueOn: addDays(dayKey(ctx.now), 7),
      });
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.push(task);
      link(ctx, draft, {
        sourceType: 'transition',
        sourceId: program.id,
        targetType: 'delegation',
        targetId: task.id,
        relation: 'tracks-followup',
        ruleId: TRANSITION_RULE_IDS.SCREEN,
        summary: 'This owned task produces the evidence the mechanism decision needs.',
      });
      effects.push({
        ruleId: TRANSITION_RULE_IDS.SCREEN,
        action: 'created',
        targetType: 'delegation',
        targetId: task.id,
        summary: 'Opened one owned scoring-grid evidence task.',
      });
    }
  }
  return effects;
}

/* -------------------------------------------------------- RULE-TRN-03 */

function handoverPropagation(draft, ctx, program, reading) {
  const effects = [];
  const people = new Map((draft.people || []).map((person) => [person.id, person]));
  const lastDay = program.effectiveOn || dayKey(ctx.now);
  const dueOn = addDays(lastDay, -14);
  const today = dayKey(ctx.now);
  const due = dueOn < today ? today : dueOn;
  for (const row of reading.continuity.atRisk.slice(0, MAX_HANDOVERS)) {
    const person = people.get(row.personId);
    if (!person || person.status === 'archived') continue;
    const tag = `TRN-HANDOVER:${program.id}:${row.personId}`;
    if (hasMarker(draft.delegations, 'support', tag)) continue;
    const what = row.soleStewardOf.length
      ? `sole stewardship of ${row.soleStewardOf.map((entry) => entry.label).join(', ')}`
      : row.criticalDependencies.length
        ? `stewardship of ${row.criticalDependencies.map((entry) => entry.label).slice(0, 2).join(', ')}`
        : `${row.openCases} open case(s), ${row.openDelegations} delegation(s) and ${row.openGoals} goal(s)`;
    const task = delegationRecord(ctx, {
      personId: row.personId,
      title: `Hand over ${person.name}’s work before ${lastDay}`.slice(0, 200),
      expectedOutcome: `Record who takes over ${what}, where it is written down, and have the successor confirm it in writing by ${due}. A hand-over that exists only in the leaving person’s head is the part of a reduction that cannot be bought back.`,
      support: `Generated by ${TRANSITION_RULE_IDS.HANDOVER} (continuity risk ${row.riskScore}/100). Marker ${marker(tag)}. This is a task about the work, not about the person.`,
      dueOn: due,
    });
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.push(task);
    link(ctx, draft, {
      sourceType: 'transition',
      sourceId: program.id,
      targetType: 'delegation',
      targetId: task.id,
      relation: 'hands-over',
      ruleId: TRANSITION_RULE_IDS.HANDOVER,
      summary: 'This owned task records what this leaver’s work moves to, and who confirmed it.',
    });
    if (row.criticalDependencies.length) {
      for (const dependency of row.criticalDependencies.slice(0, 3)) {
        link(ctx, draft, {
          sourceType: 'transition',
          sourceId: program.id,
          targetType: 'dependency',
          targetId: dependency.id,
          relation: 'depends-on',
          ruleId: TRANSITION_RULE_IDS.HANDOVER,
          summary: 'A proposed exit is a recorded steward of this dependency, so cover must be named before the last working day.',
        });
      }
    }
    effects.push({
      ruleId: TRANSITION_RULE_IDS.HANDOVER,
      action: 'created',
      targetType: 'delegation',
      targetId: task.id,
      summary: `Opened one owned hand-over task at continuity risk ${row.riskScore}/100.`,
    });
  }
  return effects;
}

/* -------------------------------------------------------- RULE-TRN-04 */

function survivorPropagation(draft, ctx, program, reading) {
  const effects = [];
  const people = new Map((draft.people || []).map((person) => [person.id, person]));
  for (const row of reading.survivors.flagged.slice(0, MAX_SURVIVOR_PROMPTS)) {
    const person = people.get(row.personId);
    if (!person) continue;
    const tag = `TRN-SURVIVOR:${program.id}:${row.personId}`;
    const added = addTalkingPoint(
      person,
      `Survivor load after “${program.label}”: recorded ownership rose ${row.increasePct}% because the exiting work landed here. Ask what should stop before assuming it all absorbs — this is a capacity conversation, not a performance one.`,
      tag,
    );
    if (added) {
      effects.push({
        ruleId: TRANSITION_RULE_IDS.SURVIVORS,
        action: 'updated',
        targetType: 'person',
        targetId: row.personId,
        summary: `Queued one blameless 1:1 prompt at +${row.increasePct}% recorded ownership.`,
      });
    }
  }
  return effects;
}

/* -------------------------------------------------------- RULE-TRN-05 */

function outcomeReview(draft, ctx, program, reading) {
  const effects = [];
  const tag = `TRN-REVIEW:${program.id}`;
  if (hasMarker(draft.decisions, 'question', tag)) return effects;
  const frozen = program.snapshot;
  if (!frozen) return effects;
  const days = Number(ctx.draft?.settings?.transitionHorizonDays);
  const horizon = Number.isFinite(days) && days >= 30 ? Math.round(days) : 365;
  const reviewOn = addDays(program.effectiveOn || dayKey(ctx.now), horizon);
  const decision = decisionRecord(ctx, {
    title: `Did the “${program.label}” transition do what it said it would?`.slice(0, 200),
    question: `The programme was frozen on ${frozen.on || 'an unrecorded date'} with ${frozen.achieved.named} named exit(s), `
      + `${Math.round(frozen.achieved.cashCost)} ${frozen.currency} of predicted cash cost, `
      + `${frozen.continuity.blockers} sole-holder blocker(s), ${frozen.continuity.atRisk} hand-over(s) required and `
      + `${frozen.survivors.flagged} retained person(s) modelled above the load convention. `
      + `The survivor convention predicted ${frozen.survivors.expectedDepartures ?? '—'} regretted departure(s) among high-value retained people. `
      + 'Who actually left, what did it cost, and did the people who stayed behave as modelled? The snapshot cannot be edited, so this is a test rather than a memory. '
      + `${marker(tag)}`,
    options: [
      [
        'The plan held: cost, exits and retained behaviour were close to the prediction',
        'Record what the model got right. A convention that is only ever corrected, never credited, cannot be trusted either.',
        'A good outcome on a dozen people is weak evidence; it is a prior, not a proof.',
      ],
      [
        'Capability left that the plan said would stay',
        'This is the most expensive kind of miss and the one a hand-over obligation is supposed to prevent. Record which obligation was not real.',
        'Needs the successor’s own account, which the workspace only has if someone recorded it.',
      ],
      [
        'The retained people left anyway',
        'Second-wave attrition is the standard failure of a reduction, and the frozen survivor prediction exists precisely to be scored against it.',
        'Hindsight is generous: almost every departure looks predictable afterwards.',
      ],
      [
        'Too early or too few outcomes to judge',
        'An honest non-answer. It re-dates the review instead of manufacturing a verdict.',
        'The next planning cycle starts before the answer exists, which is the normal state of people decisions.',
      ],
    ],
    reviewOn: addDays(reviewOn, 14),
    rationaleHint: `Opened by ${TRANSITION_RULE_IDS.OUTCOME_REVIEW} at finalization. The predictions were frozen before the change and are scored out of sample.`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  link(ctx, draft, {
    sourceType: 'transition',
    sourceId: program.id,
    targetType: 'decision',
    targetId: decision.id,
    relation: 'audits',
    ruleId: TRANSITION_RULE_IDS.OUTCOME_REVIEW,
    summary: 'The frozen transition is reviewed against what actually happened.',
  });
  effects.push({
    ruleId: TRANSITION_RULE_IDS.OUTCOME_REVIEW,
    action: 'created',
    targetType: 'decision',
    targetId: decision.id,
    summary: `Opened one dated outcome review on ${reviewOn}.`,
  });

  const owner = ownerFor(draft, program);
  if (owner) {
    const tagTask = `TRN-TRACK:${program.id}`;
    if (!hasMarker(draft.delegations, 'support', tagTask)) {
      const task = delegationRecord(ctx, {
        personId: owner.id,
        title: `Record who actually left “${program.label}”`.slice(0, 200),
        expectedOutcome: `For each person the programme named, record the departure date when it happens, and note any retained person the plan expected to keep who left instead. The predictions are frozen; the convention grades itself only against recorded outcomes. Review on ${reviewOn}.`,
        support: `Generated by ${TRANSITION_RULE_IDS.OUTCOME_REVIEW}. Marker ${marker(tagTask)}. No individual is scored by this calibration; it grades the planning convention.`,
        dueOn: reviewOn,
      });
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.push(task);
      link(ctx, draft, {
        sourceType: 'transition',
        sourceId: program.id,
        targetType: 'delegation',
        targetId: task.id,
        relation: 'tracks-followup',
        ruleId: TRANSITION_RULE_IDS.OUTCOME_REVIEW,
        summary: 'This task records the outcomes the survivor convention is graded on.',
      });
      effects.push({
        ruleId: TRANSITION_RULE_IDS.OUTCOME_REVIEW,
        action: 'created',
        targetType: 'delegation',
        targetId: task.id,
        summary: 'Opened one owned outcome-tracking task.',
      });
    }
  }
  void reading;
  return effects;
}

/* -------------------------------------------------------- RULE-TRN-06 */

/**
 * Resolve the frozen prediction about one person.
 *
 * `departed` is a fact (the roster says archived), so it is recorded rather than
 * inferred. A prediction horizon that has passed with the person still in place
 * is recorded as a resolved negative — otherwise the calibration would only ever
 * see the departures and would look clairvoyant.
 */
export function resolveTransitionOutcomes(draft, ctx, { personId = null, on = null } = {}) {
  const effects = [];
  const today = on || dayKey(ctx.now);
  const archived = new Set((draft.people || []).filter((person) => person && person.status === 'archived').map((person) => person.id));
  // The horizon is the leader's declared window, not a second number invented
  // here: the outcome review and the prediction window must close together.
  const declared = Number(draft?.settings?.transitionHorizonDays);
  const horizonDays = Number.isFinite(declared) && declared >= 30 ? Math.round(declared) : TRANSITION_CONVENTIONS.horizonDays;
  for (const program of (draft.transitionPrograms || [])) {
    if (!program || !program.snapshot) continue;
    const horizonOn = addDays(program.effectiveOn || today, horizonDays);
    const existing = new Set((program.outcomes || []).map((row) => row.personId));
    let changed = false;
    for (const prediction of program.snapshot.predictions || []) {
      const id = prediction.personId;
      if (personId && id !== personId) continue;
      if (existing.has(id)) continue;
      let departed = null;
      if (archived.has(id)) departed = true;
      else if (horizonOn <= today) departed = false;
      if (departed === null) continue;
      program.outcomes = Array.isArray(program.outcomes) ? program.outcomes : [];
      program.outcomes.push({
        personId: id,
        on: today,
        departed,
        selected: prediction.selected === true,
        departurePct: Number.isFinite(Number(prediction.departurePct)) ? prediction.departurePct : null,
        horizonOn,
      });
      existing.add(id);
      changed = true;
      effects.push({
        ruleId: TRANSITION_RULE_IDS.DEPARTURE,
        action: 'updated',
        targetType: 'transition',
        targetId: program.id,
        summary: departed
          ? 'Recorded a departure against the frozen transition prediction.'
          : 'Closed a prediction window with the person still in place.',
      });
    }
    if (changed) program.updatedAt = ctx.now.toISOString();
  }
  return effects;
}

/* ------------------------------------------------------------- the rule */

function shouldRun(event) {
  const type = typeof event?.type === 'string' ? event.type : '';
  if (type === TRANSITION_DECLARED_EVENT || type === TRANSITION_UPDATED_EVENT) return 'link';
  if (type === TRANSITION_DECIDED_EVENT || type === TRANSITION_SCANNED_EVENT || type === TRANSITION_FINALIZED_EVENT) return 'scan';
  if (type === TRANSITION_GATE_EVENT) return 'link';
  if (type === 'person.archived') return 'departure';
  return null;
}

export function transitionRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event) return [];
  const mode = shouldRun(event);
  if (!mode) return [];
  if (draft.settings?.transitionAutoPropagate === false && mode !== 'scan') return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const ruleCtx = {
    now,
    event,
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
    draft,
  };
  const effects = [];
  const program = event.entityId
    ? (draft.transitionPrograms || []).find((row) => row && row.id === event.entityId)
    : null;

  if (mode === 'link' && program) {
    effects.push(...linkProgram(draft, ruleCtx, program));
  } else if (mode === 'scan' && program) {
    const reading = transitionReading(draft, program, now, { depth: 'full' });
    effects.push(...linkProgram(draft, ruleCtx, program));
    effects.push(...screenPropagation(draft, ruleCtx, program, reading));
    effects.push(...handoverPropagation(draft, ruleCtx, program, reading));
    effects.push(...survivorPropagation(draft, ruleCtx, program, reading));
    if (event.type === TRANSITION_FINALIZED_EVENT) {
      effects.push(...outcomeReview(draft, ruleCtx, program, reading));
      effects.push(...resolveTransitionOutcomes(draft, ruleCtx));
    }
  } else if (mode === 'departure') {
    effects.push(...resolveTransitionOutcomes(draft, ruleCtx, { personId: event.entityId || null }));
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
