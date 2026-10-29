/**
 * app/core/domain/measurementRule.js — the post-commit side of the Scorecard
 * Integrity Lab (Schema v47, ADR-0035).
 *
 * The lab's value is not the number it prints; it is that the number becomes
 * work. Two effects hang off the shared rule spine (ADR-0008):
 *
 *  RULE-MTX-01  `scorecard.committed` — when the declared scorecard is modelled
 *               to pay mostly for gaming, or to deliver less than half of the
 *               first-best value for the same effort, open exactly ONE DACI
 *               decision naming the redesign choice, up to two owned
 *               delegations (instrument the counter-metric; record a baseline
 *               for the true objective), and at most one blameless 1:1 prompt
 *               for the scorecard's owner. When the scorecard is sound, nothing
 *               is created: ceremony is not the product.
 *
 *  RULE-MTX-02  `scorecard.observed` — a recorded observation that exceeds the
 *               frozen prediction opens one calibration decision and one
 *               pre-filled after-action review. The observation record itself is
 *               never edited and no probability is silently refined.
 *
 * Nothing here rates a person, sends a message, approves spend or changes the
 * scorecard. The leader commits every design; the rule only refuses to let a
 * distorted one stay invisible.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { normalizeRetro } from './learning.js';
import {
  MEASUREMENT_GOODHART_ALERT,
  MEASUREMENT_MIN_EFFICIENCY,
  MEASUREMENT_RULE_IDS,
  scoreMeasurementObservation,
  scorecardEquilibrium,
  scorecardIntegrity,
} from './measurement.js';

export const SCORECARD_COMMITTED_EVENT = 'scorecard.committed';
export const SCORECARD_OBSERVED_EVENT = 'scorecard.observed';

const MAX_DELEGATIONS = 2;
const MAX_TOPICS = 12;

function marker(tag) {
  return `[${tag}]`;
}

function hasMarker(rows, field, tag) {
  const token = marker(tag);
  return (rows || []).some((row) => row && typeof row[field] === 'string' && row[field].includes(token));
}

function activePeople(draft) {
  return (draft.people || []).filter((p) => p && p.status !== 'archived');
}

function ownerFor(draft, scorecard) {
  const direct = (draft.people || []).find((p) => p && p.id === scorecard.ownerId);
  if (direct && direct.status !== 'archived') return direct;
  return activePeople(draft)[0] || null;
}

function decisionRecord(ctx, draft, { title, question, options, reviewOn, rationaleHint }) {
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 2000),
    date: today,
    reversibility: 'reversible',
    driver: String(draft.settings?.leaderName || '').slice(0, 120),
    approver: String(draft.settings?.leaderName || '').slice(0, 120),
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
  person.talkingPoints = [...person.talkingPoints, `${text} ${token}`.slice(0, 200)].slice(-MAX_TOPICS);
  return true;
}

/**
 * RULE-MTX-01. The trigger carries the scorecard id and the design key the
 * leader saw; a stale key is refused by the action before the rule runs, so this
 * function can trust that the record it reads is the one that was previewed.
 */
function redesignPropagation(draft, ctx) {
  const effects = [];
  const scorecardId = ctx.event?.entityId;
  const card = (draft.scorecards || []).find((row) => row && row.id === scorecardId);
  if (!card || card.status !== 'committed') return effects;

  const integrity = scorecardIntegrity(card);
  const eq = integrity.equilibrium;
  const distorted = integrity.badge.id === 'distorted';
  const leaky = integrity.badge.id === 'leaky';
  if (!distorted && !leaky) return effects;

  const today = dayKey(ctx.now);
  const tag = `MTX:${card.id}`;
  const reviewOn = card.reviewOn || addDays(today, 42);
  const worst = integrity.goodhart.worst;
  const best = integrity.ranking.best;
  const recommend = integrity.ranking.recommend;

  if (!hasMarker(draft.decisions, 'question', tag)) {
    const options = [
      [
        recommend ? `Adopt: ${best.label}` : 'Re-weight what is valuable and hard to fake',
        recommend
          ? `Modelled value +${integrity.ranking.lift} net points; ${best.metricCount} measured metric(s); gaming falls from ${eq.gamingSharePct}% to ${best.gamingSharePct}%.`
          : `Transparent, no new measurement: weights move toward tasks with high true value and low gaming ease.`,
        recommend
          ? `Costs ${best.addedMetrics} new counter-metric(s) to maintain; the model's parameters are your declared conventions, not measurements.`
          : 'Does not fix a metric that is noise-dominated, and does not add any work to the scorecard.',
      ],
      [
        'Add a paired guardrail to the worst metric and keep the rest',
        `Cheapest targeted fix: halves the modelled ease of gaming “${worst?.name || 'the worst metric'}” without redesigning the whole card.`,
        'Leaves the other distorted metrics untouched; a guardrail is only real if someone actually reads it.',
      ],
      [
        'Keep the scorecard and accept the modelled distortion',
        'Sometimes the metric is the least-bad proxy available and changing it would cost more than the distortion. Naming that out loud is a decision, not a failure.',
        `You are choosing ≈${eq.gamingSharePct}% modelled cosmetic behaviour and ${eq.efficiencyPct}% first-best value; record why in the rationale so the next leader can see it.`,
      ],
      [
        'Retire this scorecard',
        'Removes the incentive problem entirely by not paying attention to this measure.',
        'You lose the signal, and whatever the metric was standing in for becomes invisible again.',
      ],
    ];
    const decision = decisionRecord(ctx, draft, {
      title: `Redesign the scorecard “${card.title}”`.slice(0, 200),
      question: `The scorecard “${card.title}” is modelled to deliver ${eq.efficiencyPct}% of first-best value with ${eq.gamingSharePct}% of measured effort going to cosmetic movement (Goodhart index ${integrity.goodhart.portfolioIndex}/100, ${integrity.badge.label.toLowerCase()}). Which design do you commit to before ${reviewOn}? ${marker(tag)}`,
      options,
      reviewOn,
      rationaleHint: `Generated from the declared parameters on ${today}. Every figure is a model equilibrium under those declarations, not a measurement of any person.`,
    });
    draft.decisions.push(decision);
    ensureEntityLink(draft, {
      sourceType: 'scorecard',
      sourceId: card.id,
      targetType: 'decision',
      targetId: decision.id,
      relation: 'informs',
      ruleId: MEASUREMENT_RULE_IDS.REDESIGN,
      summary: 'The scorecard model informed this redesign decision.',
    }, { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() });
    effects.push({
      ruleId: MEASUREMENT_RULE_IDS.REDESIGN,
      action: 'created',
      targetType: 'decision',
      targetId: decision.id,
      summary: `Opened one DACI decision on redesigning “${card.title}” (modelled genuine value ${eq.efficiencyPct}%).`,
    });

    const owner = ownerFor(draft, card);
    if (owner) {
      let created = 0;
      if (created < MAX_DELEGATIONS && worst) {
        const guardrail = delegationRecord(ctx, {
          personId: owner.id,
          title: `Instrument a counter-metric for “${worst.name}”`.slice(0, 200),
          expectedOutcome: `Define one cheap paired metric that moves when “${worst.name}” is gamed, and record its baseline. The scorecard's modelled gaming share on this metric is ${worst.gamingSharePct}%; a guardrail is only worth its cost if it is actually read.`,
          support: `Generated by ${MEASUREMENT_RULE_IDS.REDESIGN} from scorecard “${card.title}”. Marker ${marker(tag)}. No individual is assessed by this task.`,
          dueOn: addDays(today, 14),
        });
        draft.delegations.push(guardrail);
        created += 1;
        ensureEntityLink(draft, {
          sourceType: 'scorecard',
          sourceId: card.id,
          targetType: 'delegation',
          targetId: guardrail.id,
          relation: 'informs',
          ruleId: MEASUREMENT_RULE_IDS.REDESIGN,
          summary: 'The scorecard model informed this counter-metric task.',
        }, { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() });
        ensureEntityLink(draft, {
          sourceType: 'decision',
          sourceId: decision.id,
          targetType: 'delegation',
          targetId: guardrail.id,
          relation: 'tracks-followup',
          ruleId: MEASUREMENT_RULE_IDS.REDESIGN,
          summary: 'Counter-metric instrumentation required by the scorecard redesign decision.',
        }, { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() });
        effects.push({
          ruleId: MEASUREMENT_RULE_IDS.REDESIGN,
          action: 'created',
          targetType: 'delegation',
          targetId: guardrail.id,
          summary: `Opened one owned delegation to instrument a counter-metric for “${worst.name}”.`,
        });
      }
      if (created < MAX_DELEGATIONS && eq.unmeasuredNeglectPct >= 10) {
        const baselineDel = delegationRecord(ctx, {
          personId: owner.id,
          title: `Record a baseline for what “${card.title}” does not measure`.slice(0, 200),
          expectedOutcome: `The declared model leaves ≈${eq.unmeasuredNeglectPct}% of first-best value in unmeasured work. Record one dated baseline number for the most valuable uncounted task so a later change can be compared instead of remembered.`,
          support: `Generated by ${MEASUREMENT_RULE_IDS.REDESIGN}. Marker ${marker(tag)}. A baseline is a number you can re-measure, not a promise.`,
          dueOn: addDays(today, 14),
        });
        draft.delegations.push(baselineDel);
        created += 1;
        ensureEntityLink(draft, {
          sourceType: 'scorecard',
          sourceId: card.id,
          targetType: 'delegation',
          targetId: baselineDel.id,
          relation: 'informs',
          ruleId: MEASUREMENT_RULE_IDS.REDESIGN,
          summary: 'The scorecard model informed this baseline task.',
        }, { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() });
        ensureEntityLink(draft, {
          sourceType: 'decision',
          sourceId: decision.id,
          targetType: 'delegation',
          targetId: baselineDel.id,
          relation: 'tracks-followup',
          ruleId: MEASUREMENT_RULE_IDS.REDESIGN,
          summary: 'Baseline measurement for work outside the scorecard.',
        }, { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() });
        effects.push({
          ruleId: MEASUREMENT_RULE_IDS.REDESIGN,
          action: 'created',
          targetType: 'delegation',
          targetId: baselineDel.id,
          summary: 'Opened one owned delegation to baseline the uncounted work.',
        });
      }
      if (owner && addTalkingPoint(owner, `Which part of “${card.title}” would you least want us to optimise?`, tag)) {
        effects.push({
          ruleId: MEASUREMENT_RULE_IDS.REDESIGN,
          action: 'updated',
          targetType: 'person',
          targetId: owner.id,
          summary: 'Queued one blameless 1:1 question about what the scorecard could distort.',
        });
      }
    }
  }

  return effects;
}

/** RULE-MTX-02. Falsified prediction → one calibration decision and one review. */
function calibrationPropagation(draft, ctx) {
  const effects = [];
  const scorecardId = ctx.event?.entityId;
  const card = (draft.scorecards || []).find((row) => row && row.id === scorecardId);
  if (!card) return effects;
  const score = scoreMeasurementObservation(card);
  if (!score || !score.falsified) return effects;

  const today = dayKey(ctx.now);
  const tag = `MTX-OBS:${card.id}`;

  if (!hasMarker(draft.decisions, 'question', tag)) {
    const decision = decisionRecord(ctx, draft, {
      title: `Recalibrate the gaming model for “${card.title}”`.slice(0, 200),
      question: `Recorded gaming on ${score.recordedOn} was ${score.observedGamingPct}%, against a frozen prediction of ${score.predictedGamingPct}% (falsifier at ${card.frozen?.prediction?.falsifierGamingPct}%). The declared model was too kind. Do you re-declare the parameters, change the scorecard, or accept and document the miss? ${marker(tag)}`,
      options: [
        ['Re-declare the parameters and refreeze', 'The model was wrong about this team; updating the declaration is the honest response.', 'Without a held-out observation the new prediction is fitted to the same evidence.'],
        ['Change the scorecard now', 'Act on the observation rather than refine the model.', 'The observation is n = 1; a redesign on one anecdote can be worse than the distortion it fixes.'],
        ['Accept the miss and document it', 'Records that the model is approximate and keeps the ledger honest.', 'Leaves the distortion in place.'],
        ['Retire the scorecard', 'Ends the incentive problem.', 'Loses the signal entirely.'],
      ],
      reviewOn: addDays(today, 14),
      rationaleHint: `The prediction was frozen on ${card.frozen?.at || 'an earlier date'} and is not rewritten by this decision.`,
    });
    draft.decisions.push(decision);
    ensureEntityLink(draft, {
      sourceType: 'scorecard',
      sourceId: card.id,
      targetType: 'decision',
      targetId: decision.id,
      relation: 'informs',
      ruleId: MEASUREMENT_RULE_IDS.CALIBRATION,
      summary: 'The observed scorecard result informed this calibration decision.',
    }, { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() });
    effects.push({
      ruleId: MEASUREMENT_RULE_IDS.CALIBRATION,
      action: 'created',
      targetType: 'decision',
      targetId: decision.id,
      summary: `Opened one calibration decision after recorded gaming (${score.observedGamingPct}%) exceeded the frozen prediction (${score.predictedGamingPct}%).`,
    });
  }

  const hasRetro = (draft.retros || []).some((r) => r && (
    String(r.subjectLabel || '').includes(marker(tag))
    || String(r.actual || '').includes(marker(tag))
  ));
  if (!hasRetro) {
    const retro = normalizeRetro({
      id: ctx.idFactory('retro'),
      subjectType: 'other',
      subjectId: null,
      subjectLabel: `Scorecard “${card.title}” measurement ${score.recordedOn} ${marker(tag)}`.slice(0, 200),
      outcomeOn: score.recordedOn <= today ? score.recordedOn : today,
      status: 'draft',
      autoDrafted: true,
      intended: `The declared model predicted ${score.predictedGamingPct}% of measured effort would be cosmetic and ${card.frozen?.prediction?.efficiencyPct ?? '—'}% of first-best value would be delivered.`,
      actual: `Recorded: ${score.observedGamingPct}% gaming (error ${score.errorPp > 0 ? '+' : ''}${score.errorPp}pp), metric moved ${score.metricMovedPct}pp, true outcome ${score.trueOutcomePct}pp, cosmetic gap ${score.cosmeticGapPp}pp. ${marker(tag)}`,
      cause: '',
      sustain: '',
      improve: '',
      lessons: [],
      createdAt: ctx.now.toISOString(),
      updatedAt: ctx.now.toISOString(),
      history: [{
        at: ctx.now.toISOString(),
        type: 'auto-drafted',
        summary: `${MEASUREMENT_RULE_IDS.CALIBRATION} drafted an after-action review from a falsified scorecard prediction`,
      }],
    }, draft, ctx.now);
    if (retro) {
      draft.retros.push(retro);
      effects.push({
        ruleId: MEASUREMENT_RULE_IDS.CALIBRATION,
        action: 'created',
        targetType: 'retro',
        targetId: retro.id,
        summary: 'Drafted one pre-filled After-Action Review from the measurement miss.',
      });
    }
  }

  return effects;
}

export function measurementRule(draft, ctx = {}) {
  if (!draft) return [];
  const type = ctx.event?.type;
  if (type !== SCORECARD_COMMITTED_EVENT && type !== SCORECARD_OBSERVED_EVENT) return [];
  if (draft.settings?.measurementAutoPropagate === false) return [];

  const effects = type === SCORECARD_COMMITTED_EVENT
    ? redesignPropagation(draft, ctx)
    : calibrationPropagation(draft, ctx);

  for (const effect of effects) {
    ctx.logEvent?.({
      type: 'automation.propagated',
      entity: effect.targetType,
      entityId: effect.targetId,
      summary: `${effect.ruleId}: ${effect.summary}`,
    });
  }
  return effects;
}

/** Exposed for the view's "why is this empty?" disclosure. */
export function measurementRuleThresholds() {
  return {
    distortedBelow: MEASUREMENT_MIN_EFFICIENCY,
    goodhartAlert: MEASUREMENT_GOODHART_ALERT,
  };
}
