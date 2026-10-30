/**
 * app/core/domain/sequentialInvestigationRules.js — the post-commit side of the
 * Sequential Investigation Planner (Session 81, ADR-0046) on the shared rule
 * spine (ADR-0008).
 *
 * A single test answers one question. A sequence answers "what do I do next,
 * given what this test said?" These rules turn each settled result into the
 * next owned action in the same atomic transaction as the write that produced
 * it, and stay quiet when the plan has nothing to add.
 *
 *  RULE-SEQ-01  `inquiry.declared` / `voi.scanned`
 *               When the re-solved plan says the first move is a test, and a
 *               second stage adds at least the material share of stake, write
 *               ONE advisory note on the frame: the conditional plan in words
 *               (if A fires, do X; if not, do Y). Idempotent by plan reference.
 *               A scan writes notes only — it never opens decisions or tasks for
 *               results that settled before this rule existed.
 *
 *  RULE-SEQ-02  `inquiry.settled`, when the re-solved plan says stop
 *               Exactly ONE live DACI decision per frame — commit to the expected-
 *               value option now, or choose the robust one — priced option by
 *               option under the updated belief. If an undecided commit already
 *               exists for the frame it is REVISED in place, never duplicated, so
 *               the register cannot hold two contradictory calls on one question.
 *               Keyed to each settled test, so re-running cannot repeat it.
 *
 *  RULE-SEQ-03  `inquiry.settled`, when the re-solved plan says test next
 *               Exactly ONE owned task on the frame's owner to run the next
 *               declared test in the plan, dated to that test's due date (or
 *               fourteen days), with a typed `tracks-followup` edge to the frame.
 *               Keyed to the settled test. With no owner the rule records a note
 *               instead of inventing one.
 *
 * Every write is marker-idempotent, typed-link-idempotent, and leaves a trace in
 * the append-only event log through `automation.step`.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSequencePlan, describePlanNode } from './sequentialInvestigation.js';
import { payoffTable } from './valueOfInformation.js';

export const SEQ_RULE_IDS = Object.freeze({
  PLAN: 'RULE-SEQ-01',
  COMMIT: 'RULE-SEQ-02',
  NEXT: 'RULE-SEQ-03',
});

export const SEQ_INQUIRY_DECLARED_EVENT = 'inquiry.declared';
export const SEQ_INQUIRY_SETTLED_EVENT = 'inquiry.settled';
export const SEQ_SCANNED_EVENT = 'voi.scanned';

const NOTE_CAP = 20;
const NOTE_MAX = 600;

function marker(tag) {
  return `[${tag}]`;
}

function hasMarker(rows, field, tag) {
  const token = marker(tag);
  return (rows || []).some((row) => row && typeof row[field] === 'string' && row[field].includes(token));
}

function money(value, currency = 'USD') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'not priced';
  return `${String(currency || 'USD').toUpperCase()} ${Math.round(Number(value)).toLocaleString('en-US')}`;
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

/** Append one advisory note to a frame unless an identical reference already exists. */
function addFrameNote(frame, ctx, { source, ref, text }) {
  frame.notes = Array.isArray(frame.notes) ? frame.notes : [];
  if (frame.notes.some((entry) => entry && entry.source === source && String(entry.note || '').includes(ref))) return false;
  const suffix = ` Reference ${ref}.`;
  frame.notes = [...frame.notes, {
    at: ctx.now.toISOString(),
    source,
    note: `${String(text).slice(0, NOTE_MAX - suffix.length)}${suffix}`,
  }].slice(-NOTE_CAP);
  frame.updatedAt = ctx.now.toISOString();
  return true;
}

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

/* ------------------------------------------------------------ RULE-SEQ-01 */

function planAdvisory(draft, ctx, frame) {
  const effects = [];
  if (frame.status !== 'open') return effects;
  const plan = buildSequencePlan(draft, frame.id, { now: ctx.now });
  if (!plan.ok || plan.verdict !== 'test-first' || plan.secondStageGain < plan.materialGain) return effects;
  const positive = plan.tree?.positive;
  const negative = plan.tree?.negative;
  const text = `Sequential plan. First: ${describePlanNode(plan.tree, plan.currency)}. `
    + `If it fires, ${describePlanNode(positive, plan.currency)}. `
    + `If it does not, ${describePlanNode(negative, plan.currency)}. `
    + `A second stage adds ${money(plan.secondStageGain, plan.currency)} over the best single test.`;
  const wrote = addFrameNote(frame, ctx, { source: SEQ_RULE_IDS.PLAN, ref: plan.planRef, text });
  if (wrote) {
    effects.push(effect(SEQ_RULE_IDS.PLAN, 'noted', 'voi', frame.id,
      `Recorded one conditional plan (${plan.planRef}) for “${frame.label}”: a second stage adds ${money(plan.secondStageGain, plan.currency)}.`));
  }
  return effects;
}

/* ------------------------------------------------------------ RULE-SEQ-02 */

function commitDecision(draft, ctx, frame, study, plan) {
  const effects = [];
  const tag = `SEQ-COMMIT:${study.id}`;
  if (hasMarker(draft.decisions, 'question', tag)) return effects;
  const frameTag = `SEQ-COMMIT-OPEN:${frame.id}`;
  const currency = plan.currency;
  const best = frame.options.find((option) => option.id === plan.stopOptionId);
  const beliefText = plan.states.map((state) => `${state.label} ${state.beliefPct}%`).join(' / ');
  // Expected value of every option under the UPDATED belief, read from the same
  // declared payoff table the planner used, so the decision prints real numbers.
  const table = payoffTable(frame);
  const evOf = (optionId) => frame.states.reduce((acc, state, i) => {
    const cell = table.get(optionId, state.id);
    return acc + (plan.states[i].beliefPct / 100) * (cell ?? 0);
  }, 0);
  const menuSentence = plan.menu.length
    ? 'No declared test left in the menu is worth its fee plus the cost of waiting at that belief'
    : 'No further test has been declared for this frame';

  // One live commit recommendation per frame. If an undecided one already exists
  // (an earlier settlement opened it), it is revised in place and keeps its id and
  // its history of settled-test markers, so the register never holds two
  // contradictory "commit" calls on the same question.
  const live = (draft.decisions || []).find((row) => row && !row.decidedOn
    && typeof row.question === 'string' && row.question.includes(marker(frameTag)));
  const priorTags = live ? (live.question.match(/\[SEQ-COMMIT:[^\]]+\]/g) || []) : [];
  const question = `After “${study.label}” settled, the belief over the frame is ${beliefText}. `
    + `${menuSentence}, so the plan stops here (reference ${plan.planRef}). `
    + `The expected-value choice is “${best?.label || '—'}” at ${money(plan.stopValue, currency)} under the updated belief. `
    + `Choose one: (1) ratify that choice, (2) choose the option that bounds the worst case if the belief is wrong, or (3) reopen the frame if the states themselves were mis-specified. `
    + `${marker(frameTag)} ${[...priorTags, marker(tag)].filter((value, i, all) => all.indexOf(value) === i).join(' ')}`;
  const options = frame.options.map((option) => [
    option.label,
    option.id === plan.stopOptionId
      ? `Highest expected value under the updated belief: ${money(evOf(option.id), currency)}`
      : `Expected value ${money(evOf(option.id), currency)} under the updated belief`,
    'Still a bet under the declared probabilities: the settled test narrowed the uncertainty, it did not remove it.',
  ]);
  const rationaleHint = `Opened by ${SEQ_RULE_IDS.COMMIT} after “${study.label}” settled: the sequential planner found no further declared test worth its cost at the updated belief. Expected value by option: ${frame.options.map((option) => `${option.label} ${money(evOf(option.id), currency)}`).join('; ')}.`;

  let decisionId;
  if (live) {
    live.title = `Commit to “${best?.label || 'the expected-value option'}” — “${study.label}” has settled the question enough to stop testing`.slice(0, 200);
    live.question = question.slice(0, 4000);
    live.options = options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons }));
    live.rationale = rationaleHint.slice(0, 4000);
    live.updatedAt = ctx.now.toISOString();
    decisionId = live.id;
    effects.push(effect(SEQ_RULE_IDS.COMMIT, 'updated', 'decision', live.id,
      `Revised the open commit decision for “${frame.label}” after “${study.label}” settled; it still asks one question.`));
  } else {
    const decision = decisionRecord(ctx, {
      title: `Commit to “${best?.label || 'the expected-value option'}” — “${study.label}” has settled the question enough to stop testing`.slice(0, 200),
      question,
      options,
      reviewOn: addDays(dayKey(ctx.now), 30),
      rationaleHint,
    });
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    draft.decisions.push(decision);
    decisionId = decision.id;
    effects.push(effect(SEQ_RULE_IDS.COMMIT, 'created', 'decision', decision.id,
      `Opened one commit decision: after “${study.label}” the plan stops testing and points at “${best?.label || 'the expected-value option'}”.`));
  }
  link(ctx, draft, {
    sourceType: 'voi',
    sourceId: frame.id,
    targetType: 'decision',
    targetId: decisionId,
    relation: 'informs',
    ruleId: SEQ_RULE_IDS.COMMIT,
    summary: 'This decision was reached by the sequential plan after its last test settled.',
  });
  addFrameNote(frame, ctx, {
    source: SEQ_RULE_IDS.COMMIT,
    ref: plan.planRef,
    text: `After “${study.label}”, the sequential plan stops testing. The commit decision is in the decision register.`,
  });
  return effects;
}

/* ------------------------------------------------------------ RULE-SEQ-03 */

function nextTestTask(draft, ctx, frame, study, plan) {
  const effects = [];
  const tag = `SEQ-NEXT:${study.id}`;
  if (hasMarker(draft.delegations, 'support', tag)) return effects;
  const nextId = plan.firstMove.testId;
  const next = plan.menu.find((row) => row.id === nextId);
  const nextStudy = (draft.voiStudies || []).find((row) => row && row.id === nextId);
  if (!next || !nextStudy) return effects;
  const owner = (draft.people || []).find((person) => person && person.id === frame.ownerId && person.status !== 'archived');
  if (!owner) {
    addFrameNote(frame, ctx, {
      source: SEQ_RULE_IDS.NEXT,
      ref: plan.planRef,
      text: `After “${study.label}” settled, the plan’s next test is “${next.label}”. No owner is set on this frame, so no task was created; set an owner to receive it.`,
    });
    return effects;
  }
  const dueOn = nextStudy.dueOn || addDays(dayKey(ctx.now), 14);
  const positive = describePlanNode(plan.tree?.positive, plan.currency);
  const negative = describePlanNode(plan.tree?.negative, plan.currency);
  const delegation = delegationRecord(ctx, {
    personId: owner.id,
    title: `Run “${next.label}” — the next stage of the plan for “${frame.label}”`.slice(0, 200),
    expectedOutcome: `Run the test, record its signal in the investigation register, and check the belief moved as the plan expected. `
      + `The plan says: if it fires, ${positive}; if it does not, ${negative}. Due ${dueOn}.`,
    support: `Generated by ${SEQ_RULE_IDS.NEXT} after “${study.label}” settled. Plan ${plan.planRef}. ${marker(tag)}`,
    dueOn,
  });
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.push(delegation);
  link(ctx, draft, {
    sourceType: 'voi',
    sourceId: frame.id,
    targetType: 'delegation',
    targetId: delegation.id,
    relation: 'tracks-followup',
    ruleId: SEQ_RULE_IDS.NEXT,
    summary: 'This owned task runs the next test the sequential plan calls for.',
  });
  effects.push(effect(SEQ_RULE_IDS.NEXT, 'created', 'delegation', delegation.id,
    `Opened one owned task to run “${next.label}” as the next stage after “${study.label}”.`));
  addFrameNote(frame, ctx, {
    source: SEQ_RULE_IDS.NEXT,
    ref: plan.planRef,
    text: `After “${study.label}” settled, the plan runs “${next.label}” next. Owner task created.`,
  });
  return effects;
}

/* ------------------------------------------------------------ dispatcher */

function shouldRun(event) {
  if (!event) return null;
  if (event.type === SEQ_INQUIRY_SETTLED_EVENT) return 'settle';
  if (event.type === SEQ_INQUIRY_DECLARED_EVENT) return 'declare';
  if (event.type === SEQ_SCANNED_EVENT) return 'scan';
  return null;
}

export function sequentialInvestigationRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event) return [];
  const mode = shouldRun(event);
  if (!mode) return [];
  if (draft.settings?.voiAutoPropagate === false && mode !== 'scan') return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const ruleCtx = {
    now,
    event,
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
    draft,
  };
  const frames = Array.isArray(draft.voiDecisions) ? draft.voiDecisions : [];
  const studies = Array.isArray(draft.voiStudies) ? draft.voiStudies : [];
  const effects = [];

  if (mode === 'declare') {
    const study = studies.find((row) => row && row.id === event.entityId);
    const frame = study ? frames.find((row) => row && row.id === study.frameId) : null;
    if (frame) effects.push(...planAdvisory(draft, ruleCtx, frame));
  } else if (mode === 'settle') {
    const study = studies.find((row) => row && row.id === event.entityId);
    const frame = study ? frames.find((row) => row && row.id === study.frameId) : null;
    if (study && frame && study.status === 'settled' && frame.status === 'open') {
      const plan = buildSequencePlan(draft, frame.id, { now });
      if (plan.ok && (plan.verdict === 'decide-now' || plan.verdict === 'no-test')) {
        effects.push(...commitDecision(draft, ruleCtx, frame, study, plan));
      }
      else if (plan.ok && plan.verdict === 'test-first') effects.push(...nextTestTask(draft, ruleCtx, frame, study, plan));
    }
  } else if (mode === 'scan') {
    for (const frame of frames) effects.push(...planAdvisory(draft, ruleCtx, frame));
  }

  for (const row of effects) {
    if (typeof ctx.logEvent === 'function') {
      ctx.logEvent({
        type: 'automation.step',
        entity: row.targetType || 'workspace',
        entityId: row.targetId || '',
        summary: `[${row.ruleId}] ${row.summary}`.slice(0, 300),
      });
    }
  }
  return effects;
}
