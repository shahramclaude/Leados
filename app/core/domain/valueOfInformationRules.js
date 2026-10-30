/**
 * app/core/domain/valueOfInformationRules.js — the post-commit side of the
 * Information Value Terminal (Schema v54) on the shared rule spine (ADR-0008).
 *
 * The whole point of this module is that a priced decision is not a
 * spreadsheet. Every one of these rules turns a number into owned work in the
 * same atomic transaction as the write that produced it, and stays quiet when
 * there is nothing to do.
 *
 *  RULE-VOI-01  `voi.declared` / `.updated`
 *               Typed `rests-on` provenance to every premise the frame's states
 *               actually reference, and an `informs` edge to the decision record
 *               it belongs to. Re-running cannot duplicate an edge.
 *
 *  RULE-VOI-02  `voi.declared`, when EVPI clears the declared thresholds
 *               Exactly one DACI decision — *buy information or decide now* —
 *               with a printed price on each branch, plus one owned task to
 *               scope the cheapest informative test. Never one decision per
 *               option; never a decision that picks the option for the leader.
 *
 *  RULE-VOI-03  `inquiry.settled`
 *               Writes the arrived signal into the Premise Sentinel as one dated
 *               observation weighted by its own likelihood ratio
 *               (LR+ = se/(1−sp), LR− = (1−se)/sp), so the belief that the
 *               decision rested on moves in the same transaction as the money
 *               result. This is the vertical join the module exists for: the
 *               decision frame and the assumption ledger are the same
 *               uncertainty seen from two sides.
 *
 *  RULE-VOI-04  `voi.declared` / `inquiry.settled`
 *               When one premise anchors at or above the declared number of open
 *               frames, exactly one DACI decision about de-risking *the shared
 *               assumption* — because those frames are one bet, and answering
 *               them one at a time is how a correlated bet gets taken by
 *               accident.
 *
 *  RULE-VOI-05  `voi.decided`
 *               One dated outcome review that restates the frozen EVPI and the
 *               chosen option. A decision that was made under a stated
 *               uncertainty has to be read back against it, or the number was
 *               decoration.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  conventionsFromSettings,
  evaluateFrame,
  likelihoodRatioFor,
  buildVoiPortfolio,
} from './valueOfInformation.js';
import { makeManualPremiseObservation } from './premises.js';

export const VOI_DECLARED_EVENT = 'voi.declared';
export const VOI_UPDATED_EVENT = 'voi.updated';
export const VOI_DECIDED_EVENT = 'voi.decided';
export const VOI_SETTLED_EVENT = 'voi.settled';
export const INQUIRY_DECLARED_EVENT = 'inquiry.declared';
export const INQUIRY_SETTLED_EVENT = 'inquiry.settled';
export const VOI_SCANNED_EVENT = 'voi.scanned';

export const VOI_RULE_IDS = Object.freeze({
  LINKED: 'RULE-VOI-01',
  BUY: 'RULE-VOI-02',
  EVIDENCE: 'RULE-VOI-03',
  CONCENTRATION: 'RULE-VOI-04',
  OUTCOME: 'RULE-VOI-05',
});

const MAX_LINKS = 40;

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

/* --------------------------------------------------------- RULE-VOI-01 */

function linkFrame(draft, ctx, frame) {
  const effects = [];
  const premiseIds = [...new Set((frame.states || []).map((state) => state.premiseId).filter(Boolean))];
  const knownPremises = new Set((draft.premises || []).map((row) => row && row.id));
  let count = 0;
  for (const premiseId of premiseIds.slice(0, MAX_LINKS)) {
    if (!knownPremises.has(premiseId)) continue;
    const created = link(ctx, draft, {
      sourceType: 'voi',
      sourceId: frame.id,
      targetType: 'premise',
      targetId: premiseId,
      relation: 'rests-on',
      ruleId: VOI_RULE_IDS.LINKED,
      summary: 'This decision frame prices its options against the states that premise defines. If the premise moves, the frame’s arithmetic moves with it.',
    });
    if (created) count += 1;
  }
  if (frame.decisionId && (draft.decisions || []).some((row) => row && row.id === frame.decisionId)) {
    const created = link(ctx, draft, {
      sourceType: 'voi',
      sourceId: frame.id,
      targetType: 'decision',
      targetId: frame.decisionId,
      relation: 'informs',
      ruleId: VOI_RULE_IDS.LINKED,
      summary: 'This frame is the priced reading behind that decision record.',
    });
    if (created) count += 1;
  }
  if (count) {
    effects.push({
      ruleId: VOI_RULE_IDS.LINKED,
      action: 'linked',
      targetType: 'voi',
      targetId: frame.id,
      summary: `Recorded ${count} typed provenance edge(s) for this decision frame.`,
    });
  }
  return effects;
}

/* --------------------------------------------------------- RULE-VOI-02 */

function buyInformationPromotion(draft, ctx, frame) {
  const effects = [];
  if (frame.status !== 'open') return effects;
  const tag = `VOI-BUY:${frame.id}`;
  if (hasMarker(draft.decisions, 'question', tag)) return effects;
  const conventions = conventionsFromSettings(draft);
  const reading = evaluateFrame(frame, { conventions });
  if (!reading.priced || reading.evpi === null) return effects;
  const threshold = Math.max(conventions.buyInfoThreshold, ((reading.stake || 0) * conventions.buyInfoSharePct) / 100);
  if (reading.evpi < threshold) return effects;
  if (reading.evpi <= 0) return effects;
  const openStudy = (draft.voiStudies || []).some((study) => study && study.frameId === frame.id
    && ['planned', 'running'].includes(study.status));
  if (openStudy) return effects;

  const currency = frame.currency || 'USD';
  const bestLabel = frame.options.find((option) => option.id === reading.best?.optionId)?.label || 'the expected-value option';
  const reviewOn = addDays(dayKey(ctx.now), 21);
  const decision = decisionRecord(ctx, {
    title: `Buy information or decide “${frame.label}” now?`.slice(0, 200),
    question: `Perfect information about the states in this frame would be worth at most ${money(reading.evpi, currency)} against a declared stake of ${money(reading.stake, currency)} — above the declared threshold of ${money(threshold, currency)}. `
      + `The expected-value choice today is “${bestLabel}” at ${money(reading.best?.ev ?? null, currency)}. `
      + `Perfect information does not exist; the question is whether a real test is worth its real cost. `
      + `Choose one: (1) commission a test whose net value is positive against its declared cost, (2) decide now and record what would have changed your mind, or (3) hedge — take the option that is robust across states instead of the one with the highest expected value${reading.robustChoiceDiffersFromExpected ? ' (which is a genuinely different option here)' : ''}. `
      + `Option 2 is a legitimate answer and often the right one: information has a price and a delay has a price, and this decision is about which is cheaper. ${marker(tag)}`,
    options: [
      ['Commission the cheapest informative test', 'Buys a real reduction in uncertainty before committing money.', 'Costs the test, plus the delay between asking and knowing.'],
      ['Decide now and record the trigger', 'Keeps tempo; the uncertainty is documented rather than removed.', 'Commits under the declared probabilities with no new evidence.'],
      ['Hedge: take the robust option', 'Bounds the worst case instead of maximising the average.', 'Gives up expected value for protection the leader has to be able to justify.'],
    ],
    reviewOn,
    rationaleHint: `Opened by ${VOI_RULE_IDS.BUY}: EVPI ${money(reading.evpi, currency)} cleared a threshold of ${money(threshold, currency)} (declared money floor ${money(conventions.buyInfoThreshold, currency)} or ${conventions.buyInfoSharePct}% of stake, whichever is higher). EVPI is an upper bound on what any investigation could be worth, given the payoffs and probabilities the leader declared.`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  link(ctx, draft, {
    sourceType: 'voi',
    sourceId: frame.id,
    targetType: 'decision',
    targetId: decision.id,
    relation: 'informs',
    ruleId: VOI_RULE_IDS.BUY,
    summary: 'This decision weighs the price of information against the price of committing now.',
  });
  effects.push({
    ruleId: VOI_RULE_IDS.BUY,
    action: 'created',
    targetType: 'decision',
    targetId: decision.id,
    summary: `Opened one buy-information decision for a frame whose EVPI is ${money(reading.evpi, currency)}.`,
  });

  const owner = (draft.people || []).find((person) => person && person.id === frame.ownerId && person.status !== 'archived');
  if (owner) {
    const taskTag = `VOI-SCOPE:${frame.id}:${owner.id}`;
    if (!hasMarker(draft.delegations, 'support', taskTag)) {
      const task = delegationRecord(ctx, {
        personId: owner.id,
        title: `Scope the cheapest test that would change the “${frame.label}” decision`.slice(0, 200),
        expectedOutcome: `A one-page test plan: what would be measured, the sensitivity and specificity you would honestly claim for it, what it costs, and how long it takes to answer. If no test clears its own cost, say that instead — “we decided to decide” is a finding, not a failure. Due ${addDays(dayKey(ctx.now), 10)}.`,
        support: `Generated by ${VOI_RULE_IDS.BUY}. The frame's payoff table is the thing to interrogate first: if the decision does not actually change across states, no test can be worth anything. Marker ${marker(taskTag)}.`,
        dueOn: addDays(dayKey(ctx.now), 10),
      });
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.push(task);
      link(ctx, draft, {
        sourceType: 'voi',
        sourceId: frame.id,
        targetType: 'delegation',
        targetId: task.id,
        relation: 'tracks-followup',
        ruleId: VOI_RULE_IDS.BUY,
        summary: 'This owned task produces the test plan the buy-information decision needs.',
      });
      effects.push({
        ruleId: VOI_RULE_IDS.BUY,
        action: 'created',
        targetType: 'delegation',
        targetId: task.id,
        summary: 'Opened one owned task to scope the cheapest informative test.',
      });
    }
  }
  return effects;
}

/* --------------------------------------------------------- RULE-VOI-03 */

/**
 * A settled test becomes one dated observation in the Premise Sentinel.
 *
 * The weight is the test's own diagnostic likelihood ratio rather than the
 * three-way weak/moderate/strong vocabulary, because the study already declares
 * the two numbers that determine it. The observation is built by the premise
 * module's own factory and then carries its provenance, so the shape can never
 * drift away from what `evaluatePremiseCore` reads.
 */
function evidenceIntoPremise(draft, ctx, study) {
  const effects = [];
  if (!study || study.status !== 'settled' || !study.result || !study.result.signal) return effects;
  const frame = (draft.voiDecisions || []).find((row) => row && row.id === study.frameId);
  if (!frame) return effects;
  const states = Array.isArray(frame.states) ? frame.states : [];
  const targets = new Set(Array.isArray(study.targetStateIds) ? study.targetStateIds : []);
  const premiseIds = [...new Set(states.filter((state) => targets.has(state.id)).map((state) => state.premiseId).filter(Boolean))];
  if (!premiseIds.length) return effects;

  const signal = study.result.signal;
  const { lr } = likelihoodRatioFor({
    signal,
    sensitivityPct: study.sensitivityPct,
    specificityPct: study.specificityPct,
  });
  // A positive signal is evidence FOR the target states; the premise behind a
  // target state is therefore supported, and the premise behind a non-target
  // state is challenged. Only premises that the test actually addresses are
  // touched.
  const observedOn = study.result.on || dayKey(ctx.now);
  let written = 0;
  for (const premiseId of premiseIds.slice(0, 8)) {
    const premise = (draft.premises || []).find((row) => row && row.id === premiseId);
    if (!premise || premise.humanDisposition === 'retired') continue;
    const key = `inquiry:${study.id}:${premiseId}`;
    premise.observations = Array.isArray(premise.observations) ? premise.observations : [];
    if (premise.observations.some((entry) => entry && entry.key === key)) continue;
    const observed = makeManualPremiseObservation({
      title: `${study.label} — ${signal === 'positive' ? 'the test fired' : 'the test did not fire'}`.slice(0, 160),
      note: `Signal from a declared test with ${study.sensitivityPct}% sensitivity and ${study.specificityPct}% specificity. The weight is the test's own likelihood ratio, not a judgement about how strong the evidence felt.`,
      direction: signal === 'positive' ? 'for' : 'against',
      strength: lr >= 6 ? 'strong' : lr >= 3 ? 'moderate' : 'weak',
      observedOn,
    }, { now: ctx.now, idFactory: ctx.idFactory });
    premise.observations = [...premise.observations, {
      ...observed,
      key,
      sensorId: 'information-value',
      sensorLabel: 'Declared investigation result',
      sourceType: 'voistudy',
      sourceId: study.id,
      sourceRoute: `#/voi?frame=${encodeURIComponent(frame.id)}&panel=inquiries`,
      likelihoodRatio: lr,
    }].slice(-120);
    premise.updatedAt = ctx.now.toISOString();
    written += 1;
    effects.push({
      ruleId: VOI_RULE_IDS.EVIDENCE,
      action: 'updated',
      targetType: 'premise',
      targetId: premiseId,
      summary: `Recorded one dated observation at a likelihood ratio of ${lr} from a settled test.`,
    });
    link(ctx, draft, {
      sourceType: 'voistudy',
      sourceId: study.id,
      targetType: 'premise',
      targetId: premiseId,
      relation: 'tests',
      ruleId: VOI_RULE_IDS.EVIDENCE,
      summary: 'This investigation produced dated evidence about that premise; the posterior is the premise ledger’s, not this record’s.',
    });
  }
  if (!written) return effects;
  link(ctx, draft, {
    sourceType: 'voistudy',
    sourceId: study.id,
    targetType: 'voi',
    targetId: frame.id,
    relation: 'buys-information',
    ruleId: VOI_RULE_IDS.EVIDENCE,
    summary: 'This investigation bought information about that decision frame.',
  });
  return effects;
}

/* --------------------------------------------------------- RULE-VOI-04 */

function concentrationPromotion(draft, ctx) {
  const effects = [];
  const conventions = conventionsFromSettings(draft);
  const portfolio = buildVoiPortfolio(draft, ctx.now);
  if (!portfolio.topPremise || portfolio.topPremise.frames.length < conventions.concentrationThreshold) return effects;
  const top = portfolio.topPremise;
  const tag = `VOI-CONCENTRATION:${top.premiseId}`;
  if (hasMarker(draft.decisions, 'question', tag)) return effects;

  const reviewOn = addDays(dayKey(ctx.now), 28);
  const decision = decisionRecord(ctx, {
    title: `De-risk the assumption that ${top.frames.length} open decisions rest on`.slice(0, 200),
    question: `${top.frames.length} open decision frames price their options against the states of one premise${top.title ? ` — “${top.title}”` : ''}. Flipping that premise changes the preferred option in ${top.flips} of them, a swing of ${money(top.swing, 'USD')} across the portfolio. `
      + `These are not ${top.frames.length} independent decisions; they are one bet taken ${top.frames.length} times, and the usual way to discover that is to lose all of them together. `
      + `Choose the mechanism: (1) test the premise directly and hold the frames that depend on it until the answer arrives, (2) reduce exposure across the frames together — hedge or stage them — so one wrong assumption cannot take the whole set, or (3) accept the concentration explicitly and record why. ${marker(tag)}`,
    options: [
      ['Test the shared premise directly', 'One investigation resolves several frames at once.', 'Everything resting on it waits for the same answer.'],
      ['Reduce exposure across the frames', 'Bounds the loss if the premise is wrong.', 'Gives up upside on decisions that may all have been right.'],
      ['Accept the concentration, on the record', 'Sometimes the assumption really is the strategy.', 'The leader has now written down the bet; that is the point.'],
    ],
    reviewOn,
    rationaleHint: `Opened by ${VOI_RULE_IDS.CONCENTRATION}: one premise anchors ${top.frames.length} open frames, at or above the declared threshold of ${conventions.concentrationThreshold}. The flip is a declared stress on the two states that carry the premise, not a probability that it is wrong.`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  const premise = (draft.premises || []).find((row) => row && row.id === top.premiseId);
  link(ctx, draft, {
    sourceType: 'voi',
    sourceId: top.premiseId,
    targetType: 'decision',
    targetId: decision.id,
    relation: 'revisits',
    ruleId: VOI_RULE_IDS.CONCENTRATION,
    summary: 'This decision governs the shared assumption several open frames rest on.',
  });
  effects.push({
    ruleId: VOI_RULE_IDS.CONCENTRATION,
    action: 'created',
    targetType: 'decision',
    targetId: decision.id,
    summary: `Opened one de-risking decision for a premise anchoring ${top.frames.length} open frames.`,
  });

  const owner = premise?.ownerId
    ? (draft.people || []).find((person) => person && person.id === premise.ownerId && person.status !== 'archived')
    : null;
  if (owner) {
    const taskTag = `VOI-DERISK:${top.premiseId}:${owner.id}`;
    if (!hasMarker(draft.delegations, 'support', taskTag)) {
      const task = delegationRecord(ctx, {
        personId: owner.id,
        title: `Find what would settle the shared assumption behind ${top.frames.length} decisions`.slice(0, 200),
        expectedOutcome: `One dated answer: what evidence would move this premise decisively, where it already exists, and what it would cost to obtain if it does not. Several open decisions are waiting on the same belief; this is the cheapest place to look. Due ${addDays(dayKey(ctx.now), 14)}.`,
        support: `Generated by ${VOI_RULE_IDS.CONCENTRATION}. The premise is the one these frames price their states against; the frames themselves are listed on #/voi?panel=portfolio. Marker ${marker(taskTag)}.`,
        dueOn: addDays(dayKey(ctx.now), 14),
      });
      draft.delegations.push(task);
      link(ctx, draft, {
        sourceType: 'voi',
        sourceId: top.premiseId,
        targetType: 'delegation',
        targetId: task.id,
        relation: 'tracks-followup',
        ruleId: VOI_RULE_IDS.CONCENTRATION,
        summary: 'This owned task produces the evidence the shared assumption needs.',
      });
      effects.push({
        ruleId: VOI_RULE_IDS.CONCENTRATION,
        action: 'created',
        targetType: 'delegation',
        targetId: task.id,
        summary: 'Opened one owned de-risking task on the premise owner.',
      });
    }
  }
  return effects;
}

/* --------------------------------------------------------- RULE-VOI-05 */

function outcomeReview(draft, ctx, frame) {
  const effects = [];
  const tag = `VOI-REVIEW:${frame.id}`;
  if (hasMarker(draft.decisions, 'question', tag)) return effects;
  const frozen = frame.snapshot;
  if (!frozen) return effects;
  const conventions = conventionsFromSettings(draft);
  const reviewOn = frame.reviewOn || addDays(dayKey(ctx.now), conventions.reviewHorizonDays);
  const chosen = frame.options.find((option) => option.id === frame.chosenOptionId);
  const review = decisionRecord(ctx, {
    title: `Did “${frame.label}” turn out as the numbers said?`.slice(0, 200),
    question: `The decision was taken under declared uncertainty: EVPI was ${money(frozen.evpi, frame.currency)} at a stake of ${money(frozen.stake, frame.currency)}, and the choice was “${chosen ? chosen.label : 'not recorded'}”. `
      + `Two questions, and they are different. First, which state of the world actually happened — record it, because it is what the declared distribution is scored against, and a distribution nobody scores is a decoration. `
      + `Second, was the payoff you assumed in that state the payoff you got? The model is graded on the first; the second is how the payoff table gets better next time. ${marker(tag)}`,
    options: [
      ['The realised state was within the declared distribution', 'The probability was one you had actually considered.', 'The payoff assumption may still have been wrong.'],
      ['The realised state was one you called unlikely', 'The distribution was overconfident and should widen.', 'Overconfidence is a fixable habit only if it is recorded.'],
      ['The state was outside the declared set', 'The frame was mis-specified, not mis-weighted.', 'Add the missing state before running another frame.'],
    ],
    reviewOn,
    rationaleHint: `Opened by ${VOI_RULE_IDS.OUTCOME}. The frozen EVPI is restated here so the review is about a claim that was made, not a story told afterwards.`,
  });
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(review);
  link(ctx, draft, {
    sourceType: 'voi',
    sourceId: frame.id,
    targetType: 'decision',
    targetId: review.id,
    relation: 'revisits',
    ruleId: VOI_RULE_IDS.OUTCOME,
    summary: 'This dated review holds the decided frame to the numbers it was decided under.',
  });
  effects.push({
    ruleId: VOI_RULE_IDS.OUTCOME,
    action: 'created',
    targetType: 'decision',
    targetId: review.id,
    summary: `Scheduled one dated outcome review for ${reviewOn}.`,
  });
  return effects;
}

/* ------------------------------------------------------------- the rule */

function shouldRun(event) {
  const type = typeof event?.type === 'string' ? event.type : '';
  if (type === VOI_DECLARED_EVENT || type === VOI_UPDATED_EVENT) return 'declare';
  if (type === VOI_DECIDED_EVENT) return 'decide';
  if (type === INQUIRY_SETTLED_EVENT) return 'settle';
  if (type === INQUIRY_DECLARED_EVENT) return 'inquiry';
  if (type === VOI_SCANNED_EVENT) return 'scan';
  return null;
}

export function valueOfInformationRule(draft, ctx = {}) {
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
  const frame = event.entityId && (event.entity === 'voi' || event.entity === 'voistudy')
    ? frames.find((row) => row && row.id === event.entityId)
      || frames.find((row) => row && row.id === (draft.voiStudies || []).find((s) => s && s.id === event.entityId)?.frameId)
    : null;
  const study = (draft.voiStudies || []).find((row) => row && row.id === event.entityId) || null;

  const effects = [];
  if (mode === 'declare') {
    if (!frame) return [];
    effects.push(...linkFrame(draft, ruleCtx, frame));
    effects.push(...buyInformationPromotion(draft, ruleCtx, frame));
    effects.push(...concentrationPromotion(draft, ruleCtx));
  } else if (mode === 'inquiry') {
    if (frame) effects.push(...linkFrame(draft, ruleCtx, frame));
  } else if (mode === 'decide') {
    if (!frame) return [];
    effects.push(...linkFrame(draft, ruleCtx, frame));
    effects.push(...outcomeReview(draft, ruleCtx, frame));
  } else if (mode === 'settle') {
    if (!study) return [];
    effects.push(...evidenceIntoPremise(draft, ruleCtx, study));
    effects.push(...concentrationPromotion(draft, ruleCtx));
  } else if (mode === 'scan') {
    for (const row of frames) {
      effects.push(...linkFrame(draft, ruleCtx, row));
      effects.push(...buyInformationPromotion(draft, ruleCtx, row));
    }
    effects.push(...concentrationPromotion(draft, ruleCtx));
    for (const row of (draft.voiStudies || [])) {
      if (row && row.status === 'settled') effects.push(...evidenceIntoPremise(draft, ruleCtx, row));
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

/** Days a study has been overdue, for the view and the brief. */
export function studyOverdueDays(study, now = new Date()) {
  if (!study?.dueOn) return 0;
  if (!['planned', 'running'].includes(study.status)) return 0;
  return Math.max(0, daysBetween(study.dueOn, dayKey(now)) ?? 0);
}
