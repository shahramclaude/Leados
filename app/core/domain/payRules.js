/**
 * app/core/domain/payRules.js — the post-commit side of the Pay Architecture &
 * Equity Terminal (Schema v51), on the shared rule spine (ADR-0008).
 *
 * A pay-equity report that only produces a number is a screenshot. These rules
 * make the number become work inside the same atomic transaction as the event
 * that produced it — and they are deliberately *quiet*: a workspace with no
 * defensible finding produces nothing at all.
 *
 *  RULE-PAY-01  `pay.audit.filed` with a category at or above the threshold.
 *               Exactly one DACI decision ("run a joint pay assessment"), one
 *               owned delegation to assemble the objective, gender-neutral
 *               criteria and the evidence pack, and typed links in both
 *               directions. The decision is opened BEFORE the conclusion is
 *               written, which is the point: criteria chosen after the answer is
 *               known are a rationalisation, not an assessment.
 *
 *  RULE-PAY-02  `pay.audit.filed` with a significant adjusted gap but no flagged
 *               category — one remediation decision naming the structural lever
 *               (band placement, starting-pay rule, promotion mark-up), plus one
 *               owned task to price it. Nothing is created when the interval
 *               contains zero.
 *
 *  RULE-PAY-03  `pay.assignment.recorded` with a placement defect.
 *               Below the band minimum becomes one owned task per person to
 *               document the exception or correct the pay. Above the band maximum
 *               becomes one red-circle decision per person, never a silent
 *               tolerance. Both are capped and idempotent, and neither rates the
 *               person: the record is defective, not the employee.
 *
 *  RULE-PAY-04  `pay.merit.committed` — when the declared round is projected to
 *               widen the adjusted gap, one decision is opened to choose between
 *               the matrix as designed and a below-midpoint correction, with the
 *               projected delta frozen onto the round. Nothing is created when
 *               the round narrows the gap or cannot be modelled.
 *
 *  RULE-PAY-05  `pay.assignment.recorded` that moves total target pay by more
 *               than the declared significance threshold in one step — one
 *               after-action review is opened to record why, so the next cycle
 *               has a reference class instead of a memory.
 *
 * Nothing here changes anyone's pay, approves an increase, sends a message or
 * rates a person. The leader commits every number; the rules only refuse to let a
 * structural defect stay invisible.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildPayBrief, payArchitecture, payGapAudit, refitGapPct, simulateMeritRound } from './pay.js';

export const PAY_AUDIT_FILED_EVENT = 'pay.audit.filed';
export const PAY_ASSIGNMENT_EVENT = 'pay.assignment.recorded';
export const PAY_MERIT_COMMITTED_EVENT = 'pay.merit.committed';
/** Explicit human scan: an auditable, idempotent sweep for placement defects. */
export const PAY_SCAN_EVENT = 'pay.scan';

export const PAY_RULE_IDS = Object.freeze({
  JOINT_ASSESSMENT: 'RULE-PAY-01',
  GAP_REMEDIATION: 'RULE-PAY-02',
  PLACEMENT_DEFECT: 'RULE-PAY-03',
  MERIT_WIDENS: 'RULE-PAY-04',
  STEP_CHANGE: 'RULE-PAY-05',
});

const MAX_DEFECT_TASKS = 5;
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

function leaderName(draft) {
  return String(draft.settings?.leaderName || '').slice(0, 120);
}

function decisionRecord(ctx, draft, { title, question, options, reviewOn, rationaleHint }) {
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 2000),
    date: today,
    reversibility: 'reversible',
    driver: leaderName(draft),
    approver: leaderName(draft),
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

function pushLink(ctx, draft, spec) {
  const today = dayKey(ctx.now);
  return ensureEntityLink(draft, spec, { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() });
}

/* ------------------------------------------------------------ RULE-PAY-01/02 */

function auditPropagation(draft, ctx, audit) {
  const effects = [];
  const snapshot = audit.snapshot;
  if (!snapshot) return effects;
  const today = dayKey(ctx.now);
  const owner = activePeople(draft)[0] || null;

  if (snapshot.status === 'ok' && snapshot.requiresJointAssessment) {
    const tag = `PAY-JPA:${audit.id}`;
    if (hasMarker(draft.decisions, 'rationale', tag)) return effects;
    const flagged = snapshot.flaggedCategories || [];
    const lead = flagged[0];
    const decision = decisionRecord(ctx, draft, {
      title: `Joint pay assessment: ${flagged.length} pay categor${flagged.length === 1 ? 'y is' : 'ies are'} at or above ${snapshot.triggerPct}%`,
      question:
        `The filed audit shows ${flagged.map((row) => `${row.label} at ${row.gapPct}%`).join(', ')} in ${snapshot.currency}, ` +
        `after controlling for ${snapshot.controlLabels?.join(', ') || 'nothing'}. ` +
        'Is each difference justified by objective, gender-neutral criteria — and if so, which criteria, agreed when, and evidenced how? ' +
        'The criteria must be written down and applied to all workers before this question is answered.',
      options: [
        [
          'Adopt written criteria now, then assess (recommended)',
          'Criteria documented and applied uniformly before any conclusion; defensible to a works council and to the people affected.',
          'Takes longer, and it may be harder to correct the pay quickly while the criteria are being agreed.',
        ],
        [
          'Correct the pay first, document the rationale afterwards',
          'Faster relief for the people below where they should be.',
          'Looks like a conclusion reached before the evidence, which is exactly what an assessment is supposed to prevent.',
        ],
        [
          'Assess and find the gaps justified by recorded criteria',
          'Legitimate when the criteria genuinely exist and are documented as objective and gender-neutral: performance, tenure, scarce skills.',
          'Requires the criteria to already exist and to be recorded. If they do not exist yet, this option cannot be chosen honestly.',
        ],
      ],
      reviewOn: addDays(today, 30),
      rationaleHint:
        `Opened by ${PAY_RULE_IDS.JOINT_ASSESSMENT} from filed audit “${audit.label}”. ` +
        `Adjusted gap ${snapshot.adjustedGapPct}% (95% interval ${snapshot.adjustedCiPct?.low}% to ${snapshot.adjustedCiPct?.high}%), ` +
        `leading flagged category ${lead?.label || 'unknown'} at ${lead?.gapPct ?? '—'}%. ` +
        `Marker ${marker(tag)}.`,
    });
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    draft.decisions.push(decision);
    effects.push({
      ruleId: PAY_RULE_IDS.JOINT_ASSESSMENT,
      action: 'created',
      targetType: 'decision',
      targetId: decision.id,
      summary: `Opened a joint pay assessment decision for ${flagged.length} flagged category/categories.`,
    });

    if (owner) {
      const taskTag = `PAY-PACK:${audit.id}`;
      if (!hasMarker(draft.delegations, 'support', taskTag)) {
        const task = delegationRecord(ctx, {
          personId: owner.id,
          title: 'Assemble the objective, gender-neutral criteria for a joint pay assessment',
          expectedOutcome:
            'A written list of the criteria that will be used to decide whether each flagged difference is justified — with who agreed them, how they apply equally to all workers, and the evidence for each. ' +
            'Do not include a conclusion. The criteria come first; that is the whole point of the assessment.',
          support: `Generated by ${PAY_RULE_IDS.JOINT_ASSESSMENT}. Marker ${marker(taskTag)}. The pay data stays in this workspace; share the criteria, not this file.`,
          dueOn: addDays(today, 21),
        });
        draft.delegations.push(task);
        pushLink(ctx, draft, {
          sourceType: 'payAudit',
          sourceId: audit.id,
          targetType: 'delegation',
          targetId: task.id,
          relation: 'tracks-followup',
          ruleId: PAY_RULE_IDS.JOINT_ASSESSMENT,
          summary: 'This task prepares the criteria the assessment decision depends on.',
        });
        effects.push({
          ruleId: PAY_RULE_IDS.JOINT_ASSESSMENT,
          action: 'created',
          targetType: 'delegation',
          targetId: task.id,
          summary: 'Assigned one owned task to write the assessment criteria before any conclusion.',
        });
      }
    }

    pushLink(ctx, draft, {
      sourceType: 'payAudit',
      sourceId: audit.id,
      targetType: 'decision',
      targetId: decision.id,
      relation: 'decides',
      ruleId: PAY_RULE_IDS.JOINT_ASSESSMENT,
      summary: 'This decision is the required action on the audit, not a restatement of it.',
    });
    return effects;
  }

  if (snapshot.status === 'ok' && snapshot.significant && !snapshot.requiresJointAssessment) {
    const tag = `PAY-GAP:${audit.id}`;
    if (hasMarker(draft.decisions, 'rationale', tag)) return effects;
    const gap = snapshot.adjustedGapPct;
    const decision = decisionRecord(ctx, draft, {
      title: `Close the ${gap}% pay difference the recorded controls do not explain (${snapshot.currency})`,
      question:
        `The whole-cohort adjusted difference is ${gap}% (95% interval ${snapshot.adjustedCiPct?.low}% to ${snapshot.adjustedCiPct?.high}%), ` +
        'which is significant but not concentrated in a single category. Which structural lever will you change, and how will you know it worked? ' +
        'Per-person merit cannot close a structural difference: the people furthest below midpoint get the largest percentage on the smallest base.',
      options: [
        [
          'Band placement review',
          'Attacks the mechanism that put people low in the range; durable because it changes the ceiling, not one cheque.',
          'Consumes a share of the merit envelope that was planned for performance differentiation.',
        ],
        [
          'Starting-pay rule with a review date',
          'Stops a new gap being created every quarter, which compounds faster than any catch-up.',
          'Does nothing about the people already below where they should be.',
        ],
        [
          'Promotion mark-up standard',
          'Corrects the gap that widens when someone is promoted from a below-midpoint base.',
          'Effect is slow and only lands when promotions happen.',
        ],
      ],
      reviewOn: addDays(today, 60),
      rationaleHint:
        `Opened by ${PAY_RULE_IDS.GAP_REMEDIATION} from filed audit “${audit.label}”. ` +
        `The difference is unexplained by ${snapshot.controlLabels?.join(', ') || 'nothing'}, not proven to be discrimination. Marker ${marker(tag)}.`,
    });
    draft.decisions.push(decision);
    pushLink(ctx, draft, {
      sourceType: 'payAudit',
      sourceId: audit.id,
      targetType: 'decision',
      targetId: decision.id,
      relation: 'decides',
      ruleId: PAY_RULE_IDS.GAP_REMEDIATION,
      summary: 'This decision names the structural lever the difference requires.',
    });
    effects.push({
      ruleId: PAY_RULE_IDS.GAP_REMEDIATION,
      action: 'created',
      targetType: 'decision',
      targetId: decision.id,
      summary: `Opened a remediation decision for a ${gap}% unexplained difference.`,
    });
  }
  return effects;
}

/* -------------------------------------------------------------- RULE-PAY-03 */

function placementPropagation(draft, ctx, personId) {
  const effects = [];
  const today = dayKey(ctx.now);
  const architecture = payArchitecture(draft, ctx.now);
  const row = architecture.rows.find((entry) => entry.person.id === personId);
  if (!row || !row.placement) return effects;

  if (row.placement.status === 'below-min') {
    const tag = `PAY-MIN:${personId}`;
    if (hasMarker(draft.delegations, 'support', tag)) return effects;
    if ((draft.delegations || []).filter((task) => task && String(task.support || '').includes('[PAY-MIN:')).length >= MAX_DEFECT_TASKS) return effects;
    const owner = draft.people.find((person) => person && person.id === personId && person.status !== 'archived') || activePeople(draft)[0];
    if (!owner) return effects;
    const task = delegationRecord(ctx, {
      personId: owner.id,
      title: 'Document or correct pay below the declared band minimum',
      expectedOutcome:
        `Total target pay is ${row.placement.pay} ${row.currency} against a band minimum of ${row.band?.min} — a compa-ratio of ${row.placement.compaRatio}. ` +
        'Either correct the placement with a dated pay record, or write the exception: why, approved by whom, reviewed when. ' +
        'An undocumented exception is indistinguishable from a missed correction, and it compounds every year.',
      support: `Generated by ${PAY_RULE_IDS.PLACEMENT_DEFECT}. Marker ${marker(tag)}. This is a record defect, not a performance judgement about the person.`,
      dueOn: addDays(today, 14),
    });
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.push(task);
    if (row.band) {
      pushLink(ctx, draft, {
        sourceType: 'payBand',
        sourceId: row.band.id,
        targetType: 'delegation',
        targetId: task.id,
        relation: 'tracks-followup',
        ruleId: PAY_RULE_IDS.PLACEMENT_DEFECT,
        summary: 'This task resolves a placement that the band does not permit.',
      });
    }
    effects.push({
      ruleId: PAY_RULE_IDS.PLACEMENT_DEFECT,
      action: 'created',
      targetType: 'delegation',
      targetId: task.id,
      summary: 'Opened one owned task for pay below the band minimum.',
    });
    return effects;
  }

  if (row.placement.status === 'above-max') {
    const tag = `PAY-MAX:${personId}`;
    if (hasMarker(draft.decisions, 'rationale', tag)) return effects;
    const decision = decisionRecord(ctx, draft, {
      title: 'Red-circle decision: pay above the declared band maximum',
      question:
        `${row.person.name} is at ${row.placement.pay} ${row.currency} against a band maximum of ${row.band?.max} (compa-ratio ${row.placement.compaRatio}). ` +
        'Red-circling is legitimate after a market move or a level correction. It becomes corrosive when it is undocumented, because every future increase then compounds a number nobody has defended. ' +
        'Which is this, and what is the review date?',
      options: [
        [
          'Keep as a documented red circle with a review date',
          'Honest and common: the person keeps their pay and the exception is written down.',
          'Requires someone to revisit it, and a red circle can harden into an entitlement if the review never happens.',
        ],
        [
          'Move the band (market move) rather than the person',
          'Right answer when the market actually moved; fixes the structure instead of one exception.',
          'Raises the ceiling for everyone in the band and needs a market source you can cite.',
        ],
        [
          'Freeze increases until the band catches up',
          'Bounds the cost.',
          'Reads to the person as a penalty for a structure someone else set. Say so out loud or do not do it.',
        ],
      ],
      reviewOn: addDays(today, 90),
      rationaleHint: `Opened by ${PAY_RULE_IDS.PLACEMENT_DEFECT}. Marker ${marker(tag)}.`,
    });
    draft.decisions.push(decision);
    pushLink(ctx, draft, {
      sourceType: 'payBand',
      sourceId: row.band.id,
      targetType: 'decision',
      targetId: decision.id,
      relation: 'decides',
      ruleId: PAY_RULE_IDS.PLACEMENT_DEFECT,
      summary: 'This decision governs an out-of-range placement in the band.',
    });
    effects.push({
      ruleId: PAY_RULE_IDS.PLACEMENT_DEFECT,
      action: 'created',
      targetType: 'decision',
      targetId: decision.id,
      summary: 'Opened one red-circle decision for pay above the band maximum.',
    });
  }
  return effects;
}

/* -------------------------------------------------------------- RULE-PAY-04 */

function meritPropagation(draft, ctx, round) {
  const effects = [];
  if (!round || round.status !== 'committed') return effects;
  const audit = (draft.payAudits || [])
    .filter((row) => row && row.status === 'filed' && row.snapshot?.status === 'ok')
    .sort((a, b) => (String(a.filedOn) < String(b.filedOn) ? 1 : -1))[0];
  if (!audit) return effects;
  const today = dayKey(ctx.now);
  const cohortOptions = {
    currency: audit.snapshot.currency,
    groupA: audit.snapshot.groupA,
    groupB: audit.snapshot.groupB,
    triggerPct: audit.snapshot.triggerPct,
  };
  const live = payGapAudit(draft, cohortOptions, ctx.now);
  if (live.status !== 'ok') return effects;

  const projection = simulateMeritRound(draft, round, ctx.now);
  const before = live.adjustedGapPct;
  const afterRows = live.cohort.rows.map((row) => {
    const proposed = projection.scaled.find((entry) => entry.personId === row.personId);
    const pay = proposed ? proposed.newPay : row.pay;
    return { ...row, pay, logPay: Math.log(pay) };
  });
  // Re-fit on projected pay using the same control set the audit used.
  // The same design matrix the audit used, re-fitted on projected pay. Computing
  // this with a second model would look comparable and would not be.
  const refit = refitGapPct(afterRows, live.groupA, live.controlsUsed || []);
  if (!refit.ok) return effects;
  const after = refit.gapPct;
  const delta = Math.round((after - before) * 100) / 100;
  round.snapshot = {
    ...(round.snapshot || {}),
    gapBeforePct: before,
    gapAfterPct: after,
    projectedDeltaPct: delta,
  };
  if (delta <= 0) return effects;

  const tag = `PAY-MERIT:${round.id}`;
  if (hasMarker(draft.decisions, 'rationale', tag)) return effects;
  const decision = decisionRecord(ctx, draft, {
    title: `“${round.label}” is projected to widen the adjusted gap by ${delta} points`,
    question:
      `The matrix pays by rating and position in range. On this cohort it moves the adjusted difference from ${before}% to ${after}% in ${projection.currency}. ` +
      'The people furthest below midpoint receive the largest percentage on the smallest base, so a fair-looking matrix can preserve a gap indefinitely. ' +
      'Commit the matrix as designed, or move part of the envelope to below-midpoint corrections?',
    options: [
      [
        `Commit as designed (${projection.cost} ${projection.currency} at scale ${projection.scale})`,
        'Rewards performance consistently and is explainable to the whole team in one sentence.',
        `Projected to widen the adjusted difference by ${delta} points, and structural differences do not close themselves.`,
      ],
      [
        'Shift part of the envelope to below-midpoint corrections',
        'Attacks the mechanism rather than the symptom; durable across cycles.',
        'Weakens the performance signal for exactly the people who are delivering now.',
      ],
      [
        'Cap the top of the range and redeploy the difference',
        'Keeps the rating logic intact while refusing to pay above-midpoint people twice.',
        'Feels arbitrary to high performers at the top of range unless the rule is stated in advance.',
      ],
    ],
    reviewOn: addDays(today, 14),
    rationaleHint: `Opened by ${PAY_RULE_IDS.MERIT_WIDENS} on commit. Marker ${marker(tag)}. Projection only: it assumes every proposed increase is enacted exactly as simulated.`,
  });
  draft.decisions.push(decision);
  pushLink(ctx, draft, {
    sourceType: 'meritRound',
    sourceId: round.id,
    targetType: 'decision',
    targetId: decision.id,
    relation: 'decides',
    ruleId: PAY_RULE_IDS.MERIT_WIDENS,
    summary: 'This decision is the fairness trade-off the round implies.',
  });
  pushLink(ctx, draft, {
    sourceType: 'payAudit',
    sourceId: audit.id,
    targetType: 'meritRound',
    targetId: round.id,
    relation: 'informs',
    ruleId: PAY_RULE_IDS.MERIT_WIDENS,
    summary: 'The filed audit is the baseline the round was projected against.',
  });
  effects.push({
    ruleId: PAY_RULE_IDS.MERIT_WIDENS,
    action: 'created',
    targetType: 'decision',
    targetId: decision.id,
    summary: `Opened the fairness decision for a round projected to widen the gap by ${delta} points.`,
  });
  return effects;
}

/* -------------------------------------------------------------- RULE-PAY-05 */

function stepChangePrompts(draft, ctx, assignment) {
  const effects = [];
  const threshold = Number(draft.settings?.payStepChangePct) || 10;
  const previous = (draft.payAssignments || [])
    .filter((row) => row && row.personId === assignment.personId && row.id !== assignment.id && row.effectiveFrom < assignment.effectiveFrom)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  if (!previous || previous.currency !== assignment.currency) return effects;
  const from = previous.base * (1 + (Number(previous.variableTargetPct) || 0) / 100);
  const to = assignment.base * (1 + (Number(assignment.variableTargetPct) || 0) / 100);
  if (!(from > 0)) return effects;
  const changePct = Math.round(((to - from) / from) * 10000) / 100;
  if (Math.abs(changePct) < threshold) return effects;
  const person = draft.people.find((row) => row && row.id === assignment.personId) || null;
  const tag = `PAY-STEP:${assignment.id}`;
  const added = addTalkingPoint(
    person,
    `A ${changePct > 0 ? '+' : ''}${changePct}% pay move was recorded (${assignment.reason}). Be ready to explain the criteria as you would to everyone on the team, not just to this person.`,
    tag,
  );
  if (added && person) {
    effects.push({
      ruleId: PAY_RULE_IDS.STEP_CHANGE,
      action: 'updated',
      targetType: 'person',
      targetId: person.id,
      summary: `Added one 1:1 talking point for a ${changePct}% single-step pay change.`,
    });
  }
  return effects;
}

/* ------------------------------------------------------------- the rule */

function eventTypeOf(event) {
  if (!event) return '';
  return String(event.type || '');
}

function shouldRun(event) {
  const type = eventTypeOf(event);
  if (type === PAY_AUDIT_FILED_EVENT) return 'audit';
  if (type === PAY_ASSIGNMENT_EVENT) return 'assignment';
  if (type === PAY_MERIT_COMMITTED_EVENT) return 'merit';
  if (type === PAY_SCAN_EVENT) return 'scan';
  return null;
}

export function payRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event) return [];
  const mode = shouldRun(event);
  if (!mode) return [];
  // Pause semantics match every other module: automatic fan-out can be paused,
  // but an explicit human action (filing an audit) still propagates.
  if (draft.settings?.payAutoPropagate === false && mode !== 'audit' && mode !== 'scan') return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const ruleCtx = {
    now,
    event,
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
    draft,
  };
  const effects = [];

  if (mode === 'audit') {
    const audit = (draft.payAudits || []).find((row) => row && row.id === event.entityId);
    if (audit && audit.status === 'filed' && audit.snapshot) effects.push(...auditPropagation(draft, ruleCtx, audit));
  } else if (mode === 'assignment') {
    const assignment = (draft.payAssignments || []).find((row) => row && row.id === event.entityId);
    if (assignment) {
      effects.push(...placementPropagation(draft, ruleCtx, assignment.personId));
      effects.push(...stepChangePrompts(draft, ruleCtx, assignment));
    }
  } else if (mode === 'scan') {
    // An explicit scan is idempotent: every propagation below carries a marker,
    // so running it twice creates nothing new. It is capped so a workspace with
    // fifty defects does not produce fifty tasks in one click.
    const architecture = payArchitecture(draft, now);
    const defective = architecture.rows
      .filter((row) => row.placement && (row.placement.status === 'below-min' || row.placement.status === 'above-max'))
      .slice(0, MAX_DEFECT_TASKS);
    for (const row of defective) effects.push(...placementPropagation(draft, ruleCtx, row.person.id));
    const latest = (draft.payAudits || [])
      .filter((row) => row && row.status === 'filed' && row.snapshot)
      .sort((a, b) => (String(a.filedOn) < String(b.filedOn) ? 1 : -1))[0];
    if (latest) effects.push(...auditPropagation(draft, ruleCtx, latest));
  } else if (mode === 'merit') {
    const round = (draft.meritRounds || []).find((row) => row && row.id === event.entityId);
    if (round) effects.push(...meritPropagation(draft, ruleCtx, round));
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

/** Exposed for the page: the brief the leader can take into a compensation review. */
export { buildPayBrief };
