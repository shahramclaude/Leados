/**
 * app/core/domain/compRules.js — the post-commit side of the Merit & Pay-Equity
 * Terminal (Schema v51), on the shared rule spine (ADR-0008).
 *
 * A merit spreadsheet produces a number and a communication problem. These
 * rules make the reading become work, in the same atomic transaction as the
 * event that produced it, and they are quiet by design: nothing is created
 * unless there is something to do.
 *
 *  RULE-COMP-01  `comp.cycle.declared` / `comp.cycle.updated`
 *                Typed `compensates` provenance from the cycle to every person
 *                it sets pay for. Nothing is inferred from a title, and
 *                re-running cannot duplicate an edge.
 *
 *  RULE-COMP-02  `comp.cycle.scanned` / `comp.cycle.finalized`
 *                When the fairness audit is flagged — a four-fifths screen
 *                breach or an unexplained gap whose interval excludes zero —
 *                exactly one DACI decision is opened: *fix the mechanism, not
 *                the average*. It is addressed to the mechanism because no
 *                individual adjustment can repair a pattern.
 *
 *  RULE-COMP-03  compression / external-premium findings
 *                One owned task per cycle (never one per pair) to decide the
 *                relative pay deliberately, plus typed links to the people
 *                whose relationship is affected.
 *
 *  RULE-COMP-04  `comp.cycle.finalized`
 *                One dated outcome review: the frozen predictions are scored
 *                against who actually stayed. A merit cycle that is never
 *                revisited is a payment, not a decision.
 *
 *  RULE-COMP-05  `person.archived` (and the reconciliation scan)
 *                The frozen prediction becomes a resolved outcome, so the
 *                retention model grades itself out of sample. Nothing is
 *                recomputed: the prediction was frozen at finalization.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { fairnessReading } from './comp.js';

export const COMP_DECLARED_EVENT = 'comp.cycle.declared';
export const COMP_UPDATED_EVENT = 'comp.cycle.updated';
export const COMP_SCANNED_EVENT = 'comp.cycle.scanned';
export const COMP_FINALIZED_EVENT = 'comp.cycle.finalized';

export const COMP_RULE_IDS = Object.freeze({
  LINKED: 'RULE-COMP-01',
  FAIRNESS: 'RULE-COMP-02',
  STRUCTURE: 'RULE-COMP-03',
  OUTCOME_REVIEW: 'RULE-COMP-04',
  DEPARTURE: 'RULE-COMP-05',
});

/** The window a frozen prediction is scored over: one year from the effective date. */
export const COMP_OUTCOME_HORIZON_DAYS = 365;

const MAX_TOPICS = 12;

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

function ownerFor(draft, cycle) {
  const direct = (draft.people || []).find((person) => person && person.id === cycle.ownerId);
  if (direct && direct.status !== 'archived') return direct;
  return null;
}

function decisionRecord(ctx, { title, question, options, reviewOn, rationaleHint }) {
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 4000),
    date: today,
    reversibility: 'reversible',
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

/* -------------------------------------------------------- RULE-COMP-01 */

function linkCycle(draft, ctx, cycle) {
  const effects = [];
  const people = new Set(activePeople(draft).map((person) => person.id));
  for (const row of (cycle.rows || [])) {
    if (!row || !people.has(row.personId)) continue;
    const created = link(ctx, draft, {
      sourceType: 'merit',
      sourceId: cycle.id,
      targetType: 'person',
      targetId: row.personId,
      relation: 'compensates',
      ruleId: COMP_RULE_IDS.LINKED,
      summary: 'This merit cycle sets this person’s pay. The decision is the cycle’s, not a private note.',
    });
    if (created) {
      effects.push({
        ruleId: COMP_RULE_IDS.LINKED,
        action: 'linked',
        targetType: 'person',
        targetId: row.personId,
        summary: 'Linked the merit cycle to a person it sets pay for.',
      });
    }
  }
  if (cycle.ownerId && people.has(cycle.ownerId)) {
    const created = link(ctx, draft, {
      sourceType: 'merit',
      sourceId: cycle.id,
      targetType: 'person',
      targetId: cycle.ownerId,
      relation: 'stewards',
      ruleId: COMP_RULE_IDS.LINKED,
      summary: 'The cycle owner is accountable for running the process, not for the outcome of any individual.',
    });
    if (created) {
      effects.push({
        ruleId: COMP_RULE_IDS.LINKED,
        action: 'linked',
        targetType: 'person',
        targetId: cycle.ownerId,
        summary: 'Linked the merit cycle to its accountable owner.',
      });
    }
  }
  return effects;
}

/* -------------------------------------------------------- RULE-COMP-02 */

/**
 * The fairness flag becomes a decision about the *mechanism*.
 *
 * This is the single most important design choice in the module. A tool that
 * answers a fairness flag with "raise person X" has converted a structural
 * finding into one person's windfall; the pattern that produced it survives. The
 * options therefore operate on bands, grids and process, and each one names the
 * cost of taking it.
 */
function fairnessPropagation(draft, ctx, cycle, reading) {
  const effects = [];
  const tag = `COMP-FAIR:${cycle.id}`;
  if (hasMarker(draft.decisions, 'question', tag)) return effects;
  const flaggedImpact = reading.impact?.status === 'ok' && reading.impact.flagged;
  const flaggedGap = reading.decomposition?.status === 'ok'
    && reading.decomposition.interval?.unexplainedPct
    && (reading.decomposition.interval.unexplainedPct[0] > reading.decomposition.floorPct
      || reading.decomposition.interval.unexplainedPct[1] < -reading.decomposition.floorPct);
  if (!flaggedImpact && !flaggedGap) return effects;

  const facts = [
    flaggedImpact ? `the four-fifths screen is at ${reading.impact.ratio.toFixed(2)} against ${reading.impact.threshold.toFixed(2)}` : null,
    flaggedGap
      ? `the unexplained gap's interval is ${reading.decomposition.interval.unexplainedPct[0]}% to ${reading.decomposition.interval.unexplainedPct[1]}%`
      : null,
  ].filter(Boolean).join(', and ');

  const decision = decisionRecord(ctx, {
    title: `Fix the pay mechanism in “${cycle.label}”, not the average`.slice(0, 200),
    question: `The fairness audit on “${cycle.label}” flagged something: ${facts}. An average that looks acceptable can hide a distribution that is not. `
      + 'Which mechanism do you change, knowing that any single adjustment moves one person and leaves the pattern? '
      + 'The decomposition is descriptive: an unexplained gap is not proof of discrimination, and the four-fifths rule is a screen rather than a legal conclusion. '
      + `${marker(tag)}`,
    options: [
      [
        'Recalibrate the bands against the work, not the incumbent',
        'Bands set from the current population reproduce the current population. Setting them from scope and market removes the biggest carrier of history.',
        'Costs a real band review, and may reprice several people at once — which needs a budget nobody has approved yet.',
      ],
      [
        'Publish the merit grid and the evidence it uses before the next cycle',
        'A stated grid removes discretion from the place where it is least visible and most consequential.',
        'Reduces a manager’s ability to make an individual exception, and a badly designed grid can be gamed as easily as a manager can.',
      ],
      [
        'Commission a targeted review of the flagged segment',
        'Cheaper and faster than a band rebuild, and it produces evidence for the next cycle.',
        'It treats the symptom in the segment you looked at, and the omitted variables that drive the gap stay unmeasured.',
      ],
      [
        'Collect the missing variables before acting',
        'Scope, negotiation history and market timing are the obvious omitted variables. Recording them makes the next audit interpretable.',
        'Defers the decision by a cycle, during which the same pattern is paid again.',
      ],
    ],
    reviewOn: addDays(dayKey(ctx.now), 90),
    rationaleHint: `Generated from the fairness audit on ${dayKey(ctx.now)}. The audit decomposes log pay into explained and unexplained components; it does not attribute intent.`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  link(ctx, draft, {
    sourceType: 'merit',
    sourceId: cycle.id,
    targetType: 'decision',
    targetId: decision.id,
    relation: 'audits',
    ruleId: COMP_RULE_IDS.FAIRNESS,
    summary: 'The fairness audit opened this mechanism decision.',
  });
  effects.push({
    ruleId: COMP_RULE_IDS.FAIRNESS,
    action: 'created',
    targetType: 'decision',
    targetId: decision.id,
    summary: 'Opened one DACI mechanism decision from a flagged fairness audit.',
  });

  const owner = ownerFor(draft, cycle);
  if (owner) {
    const tagTask = `COMP-FAIR-TASK:${cycle.id}`;
    if (!hasMarker(draft.delegations, 'support', tagTask)) {
      const task = delegationRecord(ctx, {
        personId: owner.id,
        title: `Bring the evidence for the “${cycle.label}” mechanism decision`.slice(0, 200),
        expectedOutcome: `Produce the inputs the chosen option needs — band ranges against scope, the merit grid with its evidence rules, or the omitted variables (scope, negotiation history, market timing) for the flagged segment. Do not adjust an individual's pay to make a ratio look better.`,
        support: `Generated by ${COMP_RULE_IDS.FAIRNESS} from a flagged fairness audit. Marker ${marker(tagTask)}. This task is about the process; no individual is assessed by it.`,
        dueOn: addDays(dayKey(ctx.now), 30),
      });
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.push(task);
      link(ctx, draft, {
        sourceType: 'merit',
        sourceId: cycle.id,
        targetType: 'delegation',
        targetId: task.id,
        relation: 'remediates',
        ruleId: COMP_RULE_IDS.FAIRNESS,
        summary: 'This owned task produces the evidence the mechanism decision needs.',
      });
      effects.push({
        ruleId: COMP_RULE_IDS.FAIRNESS,
        action: 'created',
        targetType: 'delegation',
        targetId: task.id,
        summary: 'Opened one owned task for the mechanism evidence.',
      });
    }
    if (addTalkingPoint(owner, `Before we communicate “${cycle.label}”: what does our own benchmark say about the flagged segment, and are we ready to answer it?`, tag)) {
      effects.push({
        ruleId: COMP_RULE_IDS.FAIRNESS,
        action: 'updated',
        targetType: 'person',
        targetId: owner.id,
        summary: 'Queued one blameless preparation question for the owner.',
      });
    }
  }
  return effects;
}

/* -------------------------------------------------------- RULE-COMP-03 */

function structurePropagation(draft, ctx, cycle, reading) {
  const effects = [];
  if (!reading.compression.length) return effects;
  const tag = `COMP-STRUCT:${cycle.id}`;
  if (hasMarker(draft.delegations, 'support', tag)) return effects;
  const owner = ownerFor(draft, cycle);
  if (!owner) return effects;
  const inversions = reading.compression.filter((finding) => finding.kind === 'inversion');
  const premium = reading.compression.filter((finding) => finding.kind === 'loyalty-penalty');
  const task = delegationRecord(ctx, {
    personId: owner.id,
    title: `Decide the relative pay inside “${cycle.label}”`.slice(0, 200),
    expectedOutcome: `${inversions.length} inversion/compression finding(s) and ${premium.length} external-premium finding(s). For each, record the deliberate reason (scope, market, counter-offer, tenure) or change the proposal. An inversion that nobody decided is a message the team can read but the leader cannot see.`,
    support: `Generated by ${COMP_RULE_IDS.STRUCTURE}. Marker ${marker(tag)}. Findings are relationships, not individual performance judgements.`,
    dueOn: addDays(dayKey(ctx.now), 21),
  });
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.push(task);
  link(ctx, draft, {
    sourceType: 'merit',
    sourceId: cycle.id,
    targetType: 'delegation',
    targetId: task.id,
    relation: 'remediates',
    ruleId: COMP_RULE_IDS.STRUCTURE,
    summary: 'This owned task resolves the relative-pay findings before communication.',
  });
  effects.push({
    ruleId: COMP_RULE_IDS.STRUCTURE,
    action: 'created',
    targetType: 'delegation',
    targetId: task.id,
    summary: `Opened one owned relative-pay task covering ${reading.compression.length} finding(s).`,
  });

  for (const finding of reading.compression.slice(0, 6)) {
    if (!finding.otherId) continue;
    link(ctx, draft, {
      sourceType: 'person',
      sourceId: finding.subjectId,
      targetType: 'person',
      targetId: finding.otherId,
      relation: 'compares-pay-with',
      ruleId: COMP_RULE_IDS.STRUCTURE,
      summary: finding.kind === 'inversion'
        ? 'Relative pay inside the reporting line is flagged for a deliberate decision.'
        : 'External hire premium against the internal median at the same level.',
    });
  }
  return effects;
}

/* -------------------------------------------------------- RULE-COMP-04 */

function outcomeReview(draft, ctx, cycle, reading) {
  const effects = [];
  const tag = `COMP-REV:${cycle.id}`;
  if (hasMarker(draft.decisions, 'question', tag)) return effects;
  const days = Number(ctx.draft?.settings?.compOutcomeReviewDays);
  const horizon = Number.isFinite(days) && days >= 30 ? Math.round(days) : 180;
  const reviewOn = addDays(dayKey(ctx.now), horizon);
  const frozen = cycle.audit;
  const expected = frozen?.expectedDepartures;
  const decision = decisionRecord(ctx, {
    title: `Did the “${cycle.label}” allocation keep the people it was meant to keep?`.slice(0, 200),
    question: `The cycle was finalized on ${frozen?.on || 'an unrecorded date'} with ${reading.rows.length} pay decision(s), `
      + `${Math.round(frozen?.budget?.amount ?? 0)} committed, and a modelled ${expected ?? '—'} expected departure(s). `
      + `At that time ${(frozen?.predictions || []).filter((row) => (row.departurePct ?? 0) >= 25).length} person(s) sat at 25% or more modelled departure risk. `
      + 'Who actually left, and was the money where the risk was? The prediction is frozen and cannot be edited, so this is a real test rather than a memory. '
      + `${marker(tag)}`,
    options: [
      [
        'The allocation held the risk it targeted',
        'Record what the retention model got right. A model that is only ever corrected, never credited, cannot be trusted either.',
        'A good outcome on twelve people is weak evidence; it is a prior, not a proof.',
      ],
      [
        'The money went to the wrong people',
        'This is the most useful outcome: it changes the next cycle’s policy, not just its numbers.',
        'Needs the actual reason each person left, which the workspace only has if the leader recorded it.',
      ],
      [
        'The model missed a departure it should have seen',
        'Record the signal that was available at the time. That is the only way the coefficients stop being a convention.',
        'Hindsight is generous: almost every departure looks predictable afterwards.',
      ],
      [
        'Too early or too few outcomes to judge',
        'An honest non-answer. It re-dates the review instead of manufacturing a verdict.',
        'The next cycle starts before the answer exists, which is the normal state of people decisions.',
      ],
    ],
    reviewOn: addDays(reviewOn, 14),
    rationaleHint: `Opened by ${COMP_RULE_IDS.OUTCOME_REVIEW} at finalization. The prediction was frozen before the outcome and is scored out of sample.`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  link(ctx, draft, {
    sourceType: 'merit',
    sourceId: cycle.id,
    targetType: 'decision',
    targetId: decision.id,
    relation: 'audits',
    ruleId: COMP_RULE_IDS.OUTCOME_REVIEW,
    summary: 'The finalized cycle is reviewed against who actually stayed.',
  });
  effects.push({
    ruleId: COMP_RULE_IDS.OUTCOME_REVIEW,
    action: 'created',
    targetType: 'decision',
    targetId: decision.id,
    summary: `Opened one dated outcome review on ${reviewOn}.`,
  });

  const owner = ownerFor(draft, cycle);
  if (owner) {
    const tagTask = `COMP-CKPT:${cycle.id}`;
    if (!hasMarker(draft.delegations, 'support', tagTask)) {
      const task = delegationRecord(ctx, {
        personId: owner.id,
        title: `Track who leaves the “${cycle.label}” cohort`.slice(0, 200),
        expectedOutcome: `For each person in the cycle, record the departure date when it happens. The predictions are frozen; the model grades itself only against recorded outcomes. Review on ${reviewOn}.`,
        support: `Generated by ${COMP_RULE_IDS.OUTCOME_REVIEW}. Marker ${marker(tagTask)}. No individual is scored by the calibration; it grades the model.`,
        dueOn: reviewOn,
      });
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.push(task);
      link(ctx, draft, {
        sourceType: 'merit',
        sourceId: cycle.id,
        targetType: 'delegation',
        targetId: task.id,
        relation: 'tracks-followup',
        ruleId: COMP_RULE_IDS.OUTCOME_REVIEW,
        summary: 'This task records the outcomes the retention model is graded on.',
      });
      effects.push({
        ruleId: COMP_RULE_IDS.OUTCOME_REVIEW,
        action: 'created',
        targetType: 'delegation',
        targetId: task.id,
        summary: 'Opened one owned outcome-tracking task.',
      });
    }
  }
  return effects;
}

/* -------------------------------------------------------- RULE-COMP-05 */

function resolveOutcomes(draft, ctx, { personId = null, on = null } = {}) {
  const effects = [];
  const today = on || dayKey(ctx.now);
  const archived = new Set((draft.people || []).filter((person) => person && person.status === 'archived').map((person) => person.id));
  for (const cycle of (draft.meritCycles || [])) {
    if (!cycle || cycle.status !== 'finalized' || !cycle.audit) continue;
    const horizonOn = addDays(cycle.effectiveOn || today, COMP_OUTCOME_HORIZON_DAYS);
    const existing = new Set((cycle.outcomes || []).map((row) => row.personId));
    let changed = false;
    for (const prediction of (cycle.audit.predictions || [])) {
      const id = prediction.personId;
      if (personId && id !== personId) continue;
      if (existing.has(id)) continue;
      let departed = null;
      if (archived.has(id)) departed = true;
      else if (horizonOn <= today) departed = false;
      if (departed === null) continue;
      cycle.outcomes = Array.isArray(cycle.outcomes) ? cycle.outcomes : [];
      cycle.outcomes.push({ personId: id, on: today, departed, horizonOn });
      existing.add(id);
      changed = true;
      effects.push({
        ruleId: COMP_RULE_IDS.DEPARTURE,
        action: 'updated',
        targetType: 'merit',
        targetId: cycle.id,
        summary: departed
          ? 'Recorded a departure against the frozen retention prediction.'
          : 'Closed a prediction window with the person still in place.',
      });
    }
    if (changed) cycle.updatedAt = ctx.now.toISOString();
  }
  return effects;
}

/* ------------------------------------------------------------- the rule */

function shouldRun(event) {
  const type = typeof event?.type === 'string' ? event.type : '';
  if (type === COMP_DECLARED_EVENT || type === COMP_UPDATED_EVENT) return 'link';
  if (type === COMP_SCANNED_EVENT) return 'scan';
  if (type === COMP_FINALIZED_EVENT) return 'finalized';
  if (type === 'person.archived') return 'departure';
  return null;
}

export function compRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event) return [];
  const mode = shouldRun(event);
  if (!mode) return [];
  if (draft.settings?.compAutoPropagate === false && mode !== 'scan') return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const ruleCtx = {
    now,
    event,
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
    draft,
  };
  const effects = [];
  const cycle = event.entityId
    ? (draft.meritCycles || []).find((row) => row && row.id === event.entityId)
    : null;

  if (mode === 'link' && cycle) {
    effects.push(...linkCycle(draft, ruleCtx, cycle));
  } else if (mode === 'scan') {
    // Reconciliation is part of the scan: an imported workspace may already
    // contain archived people whose departure never produced an event.
    effects.push(...resolveOutcomes(draft, ruleCtx));
    for (const row of (draft.meritCycles || [])) {
      if (!row || row.status === 'abandoned') continue;
      effects.push(...linkCycle(draft, ruleCtx, row));
      const reading = fairnessReading(draft, row, now);
      effects.push(...fairnessPropagation(draft, ruleCtx, row, reading));
      effects.push(...structurePropagation(draft, ruleCtx, row, reading));
    }
  } else if (mode === 'finalized' && cycle) {
    const reading = fairnessReading(draft, cycle, now);
    effects.push(...linkCycle(draft, ruleCtx, cycle));
    effects.push(...fairnessPropagation(draft, ruleCtx, cycle, reading));
    effects.push(...structurePropagation(draft, ruleCtx, cycle, reading));
    effects.push(...outcomeReview(draft, ruleCtx, cycle, reading));
    effects.push(...resolveOutcomes(draft, ruleCtx));
  } else if (mode === 'departure') {
    effects.push(...resolveOutcomes(draft, ruleCtx, { personId: event.entityId || null }));
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
