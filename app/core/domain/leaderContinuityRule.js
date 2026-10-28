/**
 * app/core/domain/leaderContinuityRule.js — the post-commit side of the Leader
 * Continuity Drill (Schema v45, ADR-0032).
 *
 * Three effects hang off the shared spine (ADR-0008):
 *
 *  RULE-LCS-01  `continuity.cover.requested` — a human-commissioned cover plan
 *               becomes one DACI hand-over decision, up to four owned deputy
 *               delegations with explicit authority, typed links to every
 *               covered source record and at most one blameless prompt per
 *               deputy. The plan key is recomputed from the live draft, so a
 *               stale preview cannot commission different work than the leader
 *               saw.
 *  RULE-LCS-02  `continuity.drill.closed` — once three drills are closed, a
 *               non-positive Brier skill score or an unpredicted stall opens at
 *               most one calibration decision. The observed record is never
 *               changed and no probability is silently refined.
 *  RULE-LCS-03  Every continuity event also checks the structural single point:
 *               two or more critical items that convention says cannot be
 *               delegated open one decision about permanently moving rights,
 *               not about working harder during the absence.
 *
 * Nothing here rates a person, sends a message, approves spend or mutates a
 * covered source record.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  CONTINUITY_CRITICAL,
  CONTINUITY_KIND_LABELS,
  CONTINUITY_RULE_IDS,
  buildLeaderContinuityReport,
  coverPlanKey,
  drillCalibration,
  scoreDrillRecord,
} from './leaderContinuity.js';

export const CONTINUITY_COVER_EVENT = 'continuity.cover.requested';
export const CONTINUITY_DRILL_EVENT = 'continuity.drill.closed';
export const CONTINUITY_SCAN_EVENT = 'continuity.scan';

const MAX_DELEGATIONS = 4;
const MAX_TOPICS = 12;

const RELATION_BY_SOURCE = Object.freeze({
  decision: 'decides',
  case: 'mitigates',
  stakeholder: 'communicates',
  person: 'coaches',
  delegation: 'tracks-followup',
  goal: 'tracks-followup',
});

function hashOf(value) {
  let hash = 2166136261;
  const raw = String(value || '');
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function markerValue(marker) {
  return `[${marker}]`;
}

function hasMarker(decisions, marker) {
  const token = markerValue(marker);
  return (decisions || []).some((d) => d && typeof d.question === 'string' && d.question.includes(token));
}

function sourcesFor(state, itemKeys) {
  const out = [];
  for (const key of itemKeys) {
    const [stallKind, sourceType, sourceId] = String(key).split('|');
    if (!sourceType || !sourceId) continue;
    const exists = (state[sourceType === 'person' ? 'people' : `${sourceType}s`] || []).some((row) => row && row.id === sourceId);
    if (!exists) continue;
    out.push({ stallKind, sourceType, sourceId });
  }
  return out;
}

function decisionRecord(ctx, { title, question, options, reviewOn }) {
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 2000),
    date: today,
    reversibility: 'reversible',
    driver: String(ctx.draft.settings?.leaderName || '').slice(0, 120),
    approver: String(ctx.draft.settings?.leaderName || '').slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '',
    rationale: '',
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

function structuralDecision(draft, ctx, { report, today }) {
  if (report.inventory.counts.criticalHeld < 2) return null;
  const marker = `LCS-STRUCT:${report.inventory.windowStart}`;
  if (hasMarker(draft.decisions, marker)) return null;
  const held = report.inventory.items.filter((row) => row.delegability === 'held' && row.criticality >= CONTINUITY_CRITICAL);
  const decision = decisionRecord({ ...ctx, draft }, {
    title: `The role has ${held.length} critical items that cannot be delegated in one window`,
    question: [
      markerValue(marker),
      `A ${report.inventory.horizonDays}-day absence would leave ${held.length} critical obligations with no possible cover under convention.`,
      'These are not scheduling problems: a management conversation, or an irreversible call above the big-bet convention, can only be moved earlier, split, or accepted. Two or more in one short window is a structural single point of failure in the role.',
      `Items: ${held.slice(0, 5).map((row) => `${row.title} (${CONTINUITY_KIND_LABELS[row.stallKind]})`).join('; ')}.`,
      'This decision is about permanently moving decision rights, not about working harder during the absence. It changes no source record.',
    ].join('\n\n'),
    options: [
      ['Move one recurring right to a named deputy permanently', 'Reduces the structural single point at the next absence, not only this one.', 'Requires a real authority transfer and a named accountable owner.'],
      ['Split the work so no window contains two non-delegable critical items', 'Keeps the leader accountable and flattens the peak.', 'Constrains scheduling and may delay one decision.'],
      ['Shorten or move the absence window', 'The simplest honest control when the rights cannot move yet.', 'Defers the structural exposure to the next absence.'],
      ['Accept the exposure explicitly and record why', 'An accepted risk is visible and reviewable.', 'An unrecorded acceptance becomes an accident later.'],
    ],
    reviewOn: addDays(today, 14),
  });
  draft.decisions.push(decision);
  const effects = [];
  if (held[0]) {
    const source = sourcesFor(draft, [held[0].key])[0];
    if (source) {
      ensureEntityLink(draft, {
        sourceType: 'decision',
        sourceId: decision.id,
        targetType: source.sourceType,
        targetId: source.sourceId,
        relation: RELATION_BY_SOURCE[source.sourceType] || 'tracks-followup',
        ruleId: CONTINUITY_RULE_IDS.STRUCTURAL,
        summary: 'Structural single-point review of a non-delegable critical obligation.',
      }, { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() });
    }
  }
  effects.push({ ruleId: CONTINUITY_RULE_IDS.STRUCTURAL, action: 'created', targetType: 'decision', targetId: decision.id, summary: `Opened one structural single-point decision for ${held.length} non-delegable critical items.` });
  return effects;
}

function drillCalibrationDecision(draft, ctx, { drill, score, calibration, today }) {
  if (!drill || !score || calibration.drills < 3) return null;
  const missed = (score.skill !== null && score.skill < 0) || score.unexpected > 0;
  if (!missed) return null;
  const marker = `LCS-DRILL:${drill.id}`;
  if (hasMarker(draft.decisions, marker)) return null;
  const decision = decisionRecord({ ...ctx, draft }, {
    title: `Absence drill ${drill.startOn} → ${drill.endOn} did not match the stall model`,
    question: [
      markerValue(marker),
      `${score.n} frozen predictions were scored against your recorded observations. Brier ${score.brier}; base rate ${score.baseRate}; skill ${score.skill === null ? 'not reported' : score.skill}. ${score.unexpected} stall(s) were observed outside the frozen prediction.`,
      `Across ${calibration.drills} closed drills the mean skill is ${calibration.skill === null ? 'not reported' : calibration.skill}. A negative skill score means the model was worse than assuming the base rate.`,
      'The record is not altered and no probability is silently re-fitted. Choose whether to rebase the model, widen the cover, shorten future absence windows, or accept and record the mismatch.',
    ].join('\n\n'),
    options: [
      ['Rebase the stall model on the drill evidence', 'Uses your own outcomes rather than the current coverage conventions.', 'Small samples; a rebase can overfit three drills.'],
      ['Widen the cover plan before the next window', 'Acts on what the drill found without claiming the model is fixed.', 'Costs more setup minutes and more deputy authority.'],
      ['Use shorter absence windows until skill is positive', 'Bounds the exposure while evidence accumulates.', 'May be impractical for a real holiday or leave.'],
      ['Accept the mismatch and record why', 'Keeps the model honest and the decision visible.', 'An accepted model error still misleads the next plan if it is not labelled.'],
    ],
    reviewOn: addDays(today, 14),
  });
  draft.decisions.push(decision);
  return [{ ruleId: CONTINUITY_RULE_IDS.DRILL, action: 'created', targetType: 'decision', targetId: decision.id, summary: 'Opened one drill-calibration decision after a non-positive skill score or an unpredicted stall.' }];
}

function commissionCover(draft, ctx) {
  const request = ctx.event?.automationOptions || {};
  const reportNow = request.startOn ? new Date(`${request.startOn}T00:00:00.000Z`) : ctx.now;
  const report = buildLeaderContinuityReport(draft, {
    now: reportNow,
    horizonDays: request.horizonDays,
  });
  const liveKey = coverPlanKey(report.coverPlan, report.inventory);
  if (request.planKey !== liveKey) {
    throw new Error('The cover plan changed since it was previewed. Re-open leader continuity and commission the current plan.');
  }
  const marker = `LCS:${liveKey}`;
  // Idempotency is keyed to the WINDOW, not to the plan content: commissioning
  // changes the workspace, which changes the next plan key. Keying on content
  // would let a second click commission a second, slightly different hand-over.
  const windowMarker = `LCS-WINDOW:${report.inventory.windowStart}`;
  if (hasMarker(draft.decisions, windowMarker)) return [];
  const actions = report.coverPlan.actions.slice(0, MAX_DELEGATIONS);
  if (!actions.length) throw new Error('There is no cover action to commission at this evidence level.');
  const today = dayKey(ctx.now);
  const windowStart = report.inventory.windowStart;
  const windowEnd = report.inventory.windowEnd;
  const dueOn = windowStart;
  const decision = decisionRecord({ ...ctx, draft }, {
    title: `Hand-over cover for a ${report.inventory.horizonDays}-day absence`.slice(0, 200),
    question: [
      markerValue(windowMarker),
      markerValue(marker),
      `Window ${windowStart} → ${windowEnd}. ${report.inventory.counts.total} obligations fall due; ${report.inventory.counts.critical} are critical and ${report.inventory.counts.criticalHeld} of those cannot be delegated by convention.`,
      `Modelled stalls without cover: expected ${report.simulation.exact.expectedStalled}, P80 ${report.simulation.exact.p80}. After the recommended cover: expected ${report.residual.expectedStalled} (${report.residual.expectedCriticalStalled} critical). This is a coverage scenario, not a measured failure rate.`,
      `Recommended cover: ${report.coverPlan.actions.map((action) => `${action.deputyName} holds ${CONTINUITY_KIND_LABELS[action.stallKind]} for ${action.itemKeys.length} item(s)`).join('; ')}. Setup ${report.coverPlan.totalMinutes} minutes; ${report.coverPlan.method === 'exact-branch-and-bound' ? 'exact minimum set cover' : report.coverPlan.bound}.`,
      report.coverPlan.uncoveredKeys.length ? `${report.coverPlan.uncoveredKeys.length} critical item(s) remain uncovered and must move before the window or be accepted.` : 'Every critical item has a cover action.',
      'Approving creates owned deputy delegations with explicit authority. It does not move an irreversible call, hold a management conversation for you, spend money or send anything.',
    ].join('\n\n'),
    options: [
      ['Approve the recommended cover as shown', `Covers ${report.coverPlan.coveragePct}% of critical weight for ${report.coverPlan.totalMinutes} setup minutes.`, 'Deputies receive limited authority for the window only.'],
      ['Cover critical items only, accept the rest', 'Cheaper in setup time and attention.', 'Non-critical work stalls by design; say which.'],
      ['Shorten the absence window instead', 'Reduces the exposed surface without transferring authority.', 'The same items return at the next absence.'],
      ['Do not cover; accept the modelled stalls', 'An explicit accepted risk is auditable.', 'The exposure is not reduced, only recorded.'],
    ],
    reviewOn: addDays(windowEnd, 2),
  });

  const delegations = [];
  for (const action of actions) {
    const deputy = (draft.people || []).find((p) => p && p.id === action.deputyId && p.status !== 'archived');
    if (!deputy) continue;
    const covered = sourcesFor(draft, action.itemKeys);
    const titles = report.inventory.items.filter((row) => action.itemKeys.includes(row.key)).slice(0, 3).map((row) => row.title);
    const delegation = {
      id: ctx.idFactory('delegation'),
      personId: deputy.id,
      title: `Hold ${CONTINUITY_KIND_LABELS[action.stallKind].toLowerCase()} during ${windowStart} → ${windowEnd}`.slice(0, 200),
      expectedOutcome: [
        `Keep ${action.itemKeys.length} ${CONTINUITY_KIND_LABELS[action.stallKind].toLowerCase()} obligation(s) moving while the leader is unavailable.`,
        `Specific cover: ${titles.join('; ')}.`,
        'Escalate only what exceeds this authority. Nothing here transfers permanent decision rights.',
      ].join(' ').slice(0, 2000),
      authority: action.stallKind === 'decides' ? 'agree' : 'act-inform',
      support: `Setup time budgeted: ${action.setupMinutes} minutes. Recorded cover fit ${action.avgFit}/100 from completed authority, readiness evidence and current commitments — a planning input, not a performance rating. Marker ${markerValue(marker)}.`.slice(0, 2000),
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
    draft.delegations.push(delegation);
    delegations.push({ delegation, action, covered });
  }

  draft.decisions.push(decision);
  const linkCtx = { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() };
  const effects = [];
  for (const { delegation, covered } of delegations) {
    ensureEntityLink(draft, {
      sourceType: 'decision',
      sourceId: decision.id,
      targetType: 'delegation',
      targetId: delegation.id,
      relation: 'tracks-followup',
      ruleId: CONTINUITY_RULE_IDS.COVER,
      summary: 'Hand-over cover commissioned for a dated absence window.',
    }, linkCtx);
    const seen = new Set();
    for (const source of covered) {
      const key = `${source.sourceType}:${source.sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ensureEntityLink(draft, {
        sourceType: 'delegation',
        sourceId: delegation.id,
        targetType: source.sourceType,
        targetId: source.sourceId,
        relation: RELATION_BY_SOURCE[source.sourceType] || 'tracks-followup',
        ruleId: CONTINUITY_RULE_IDS.COVER,
        summary: 'Covered during the leader absence window; the source record is unchanged.',
      }, linkCtx);
      ensureEntityLink(draft, {
        sourceType: 'decision',
        sourceId: decision.id,
        targetType: source.sourceType,
        targetId: source.sourceId,
        relation: RELATION_BY_SOURCE[source.sourceType] || 'tracks-followup',
        ruleId: CONTINUITY_RULE_IDS.COVER,
        summary: 'Hand-over decision cites this obligation.',
      }, linkCtx);
    }
    effects.push({
      ruleId: CONTINUITY_RULE_IDS.COVER,
      action: 'created',
      targetType: 'delegation',
      targetId: delegation.id,
      summary: `Assigned ${delegation.authority} cover to a named deputy for ${delegation.title}.`,
    });
  }

  for (const { delegation, action } of delegations) {
    const person = (draft.people || []).find((p) => p.id === delegation.personId);
    if (!person) continue;
    // Never evict an employee's waiting topics to make room for an automatic prompt.
    person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
    if (person.talkingPoints.length >= MAX_TOPICS) {
      effects.push({ ruleId: CONTINUITY_RULE_IDS.COVER, action: 'skipped', targetType: 'person', targetId: person.id, summary: 'Talking-point queue is full; no existing topic was removed. The cover delegation still exists.' });
      continue;
    }
    const topic = `[LCS:${hashOf(marker).slice(0, 6)}] You are holding ${CONTINUITY_KIND_LABELS[action.stallKind].toLowerCase()} cover during ${windowStart} → ${windowEnd}. What would you escalate rather than decide? (Not a performance conversation.)`;
    person.talkingPoints.push(topic.slice(0, 200));
    effects.push({ ruleId: CONTINUITY_RULE_IDS.COVER, action: 'updated', targetType: 'person', targetId: person.id, summary: 'Queued one blameless cover-briefing prompt.' });
  }

  effects.unshift({
    ruleId: CONTINUITY_RULE_IDS.COVER,
    action: 'created',
    targetType: 'decision',
    targetId: decision.id,
    summary: `Opened one DACI hand-over decision (${report.coverPlan.coveragePct}% critical coverage, ${report.coverPlan.totalMinutes} setup minutes).`,
  });
  return effects;
}

export function leaderContinuityRule(draft, ctx = {}) {
  if (!draft) return [];
  const type = ctx.event?.type;
  if (![CONTINUITY_COVER_EVENT, CONTINUITY_DRILL_EVENT, CONTINUITY_SCAN_EVENT].includes(type)) return [];
  if (draft.settings?.continuityAutoPropagate === false) return [];
  const today = dayKey(ctx.now);
  const effects = [];

  if (type === CONTINUITY_COVER_EVENT) {
    effects.push(...commissionCover(draft, ctx));
  }

  if (type === CONTINUITY_DRILL_EVENT) {
    const drillId = ctx.event?.automationOptions?.drillId;
    const drill = (draft.continuityDrills || []).find((row) => row && row.id === drillId);
    if (!drill || drill.status !== 'closed') throw new Error('A closed drill record is required.');
    const score = scoreDrillRecord(drill);
    const calibration = drillCalibration((draft.continuityDrills || []).map((row) => ({ ...row, score: row.status === 'closed' ? scoreDrillRecord(row) : null })));
    const drillEffects = drillCalibrationDecision(draft, ctx, { drill, score, calibration, today });
    if (drillEffects) effects.push(...drillEffects);
  }

  const report = buildLeaderContinuityReport(draft, { now: ctx.now });
  const structural = structuralDecision(draft, ctx, { report, today });
  if (structural) effects.push(...structural);

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
