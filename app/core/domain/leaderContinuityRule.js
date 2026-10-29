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

import { addDays, dayKey, daysBetween } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { normalizeRetro } from './learning.js';
import {
  CONTINUITY_BACKUP_FIT_DISCOUNT,
  CONTINUITY_CRITICAL,
  CONTINUITY_KIND_LABELS,
  CONTINUITY_MIN_FIT_PCT,
  CONTINUITY_RULE_IDS,
  buildDeputyPool,
  buildLeaderContinuityReport,
  coverPlanKey,
  deputyFitForItem,
  drillCalibration,
  handoverImplementation,
  leaderDemandInventory,
  scoreDrillRecord,
} from './leaderContinuity.js';

export const CONTINUITY_COVER_EVENT = 'continuity.cover.requested';
export const CONTINUITY_DRILL_EVENT = 'continuity.drill.closed';
export const CONTINUITY_SCAN_EVENT = 'continuity.scan';
export const CONTINUITY_DELEGATION_RETURNED_EVENT = 'delegation.returned';

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
  const dueOn = windowStart >= today ? windowStart : (windowEnd >= today ? windowEnd : today);
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

/**
 * RULE-LCS-04 (Part 1): When a commissioned cover delegation is returned by its
 * deputy (`delegation.returned`), automatically re-allocate the covered
 * obligations to the next eligible deputy at the 75% fallback fit convention,
 * or open one DACI cover-gap decision when no deputy clears the floor.
 */
function recoverReturnedCoverDelegation(draft, ctx, returned) {
  if (!returned || returned.status !== 'returned') return [];
  const supportText = String(returned.support || '');
  const isCover = supportText.includes('[LCS:') || supportText.includes('LCS-WINDOW:');
  if (!isCover) return [];
  if (returned.supersededByDelegationId) return [];
  const returnMarker = `LCS-RETURN:${returned.id}`;
  const backupMarker = `LCS-BACKUP:${returned.id}`;
  if (hasMarker(draft.decisions, returnMarker)) return [];
  if ((draft.delegations || []).some((d) => d && (d.priorDelegationId === returned.id || String(d.support || '').includes(markerValue(backupMarker))))) {
    return [];
  }

  const today = dayKey(ctx.now);
  const titleMatch = String(returned.title || '').match(/(\d{4}-\d{2}-\d{2})\s*→\s*(\d{4}-\d{2}-\d{2})/);
  const supportWindowMatch = supportText.match(/LCS-WINDOW:(\d{4}-\d{2}-\d{2})/);
  const windowStart = titleMatch ? titleMatch[1] : (supportWindowMatch ? supportWindowMatch[1] : (returned.dueOn || today));
  const windowEnd = titleMatch ? titleMatch[2] : addDays(windowStart, 14);
  const parentDecision = (draft.decisions || []).find((d) => (
    d && typeof d.question === 'string' && d.question.includes(`[LCS-WINDOW:${windowStart}]`)
  )) || null;

  const allLinks = Array.isArray(draft.links) ? draft.links.filter(Boolean) : [];
  const coveredLinks = allLinks.filter((l) => (
    l.sourceType === 'delegation'
    && l.sourceId === returned.id
    && !(l.targetType === 'decision' && l.targetId === parentDecision?.id)
  ));

  const deputies = buildDeputyPool(draft);
  const returnedPersonIds = new Set(
    (draft.delegations || [])
      .filter((d) => d && d.status === 'returned' && (
        String(d.support || '').includes(`LCS-WINDOW:${windowStart}`)
        || String(d.title || '').includes(`${windowStart} → ${windowEnd}`)
      ))
      .map((d) => d.personId),
  );
  returnedPersonIds.add(returned.personId);

  const reportNow = new Date(`${windowStart}T00:00:00.000Z`);
  const horizonDays = Math.max(1, (daysBetween(windowStart, windowEnd) ?? 13) + 1);
  const inventory = leaderDemandInventory(draft, { now: reportNow, horizonDays });
  const coveredSourceKeys = new Set(coveredLinks.map((l) => `${l.targetType}:${l.targetId}`));
  const coveredItems = inventory.items.filter((item) => coveredSourceKeys.has(`${item.sourceType}:${item.sourceId}`));
  const minFitPct = Number.isFinite(Number(draft.settings?.continuityMinFitPct))
    ? Number(draft.settings.continuityMinFitPct)
    : CONTINUITY_MIN_FIT_PCT;

  const candidates = deputies
    .filter((d) => !returnedPersonIds.has(d.personId))
    .map((deputy) => {
      const rawFits = coveredItems.length
        ? coveredItems.map((item) => deputyFitForItem(item, deputy, draft).fit)
        : [Math.round((deputy.reliability || 50) * 0.6 + (deputy.availability ?? 1) * 40)];
      const avgRawFit = Math.round(rawFits.reduce((s, v) => s + v, 0) / Math.max(1, rawFits.length));
      const discountedFit = Math.round(avgRawFit * CONTINUITY_BACKUP_FIT_DISCOUNT);
      return { deputy, avgRawFit, discountedFit };
    })
    .filter((c) => c.avgRawFit >= minFitPct)
    .sort((a, b) => (
      b.discountedFit - a.discountedFit
      || (b.deputy.availability ?? 1) - (a.deputy.availability ?? 1)
      || a.deputy.personId.localeCompare(b.deputy.personId)
    ));

  const linkCtx = { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() };
  const effects = [];

  if (candidates.length > 0) {
    const best = candidates[0];
    const candidateDue = returned.dueOn || windowStart || today;
    const dueOn = candidateDue >= today ? candidateDue : (windowEnd >= today ? windowEnd : today);
    const backupDel = {
      id: ctx.idFactory('delegation'),
      personId: best.deputy.personId,
      title: `${String(returned.title || 'Hold cover').replace(/\s*\(backup cover\)$/i, '')} (backup cover)`.slice(0, 200),
      expectedOutcome: returned.expectedOutcome || `Hold backup cover for ${coveredLinks.length || 1} obligation(s) during ${windowStart} → ${windowEnd}.`,
      authority: returned.authority || 'act-inform',
      support: `Backup cover after ${returned.id} was returned (${returned.returnReason || 'returned by primary deputy'}). Raw fit ${best.avgRawFit}/100; discounted fallback fit ${best.discountedFit}/100 (75% backup convention). Marker ${markerValue(backupMarker)} [LCS-WINDOW:${windowStart}].`.slice(0, 2000),
      delegatedOn: today,
      dueOn,
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      priorDelegationId: returned.id,
      recoveryNote: `Auto-reassigned to ${best.deputy.name} under ${CONTINUITY_RULE_IDS.EXECUTION}.`,
      createdAt: ctx.now.toISOString(),
      updatedAt: ctx.now.toISOString(),
    };
    returned.supersededByDelegationId = backupDel.id;
    returned.recoveredOn = today;
    if (!returned.recoveryNote) {
      returned.recoveryNote = `Superseded by backup cover delegation ${backupDel.id} (${best.deputy.name}).`;
    }
    draft.delegations.push(backupDel);

    if (parentDecision) {
      ensureEntityLink(draft, {
        sourceType: 'decision',
        sourceId: parentDecision.id,
        targetType: 'delegation',
        targetId: backupDel.id,
        relation: 'tracks-followup',
        ruleId: CONTINUITY_RULE_IDS.EXECUTION,
        summary: 'Backup deputy cover delegation after primary deputy returned cover.',
      }, linkCtx);
    }
    for (const link of coveredLinks) {
      ensureEntityLink(draft, {
        sourceType: 'delegation',
        sourceId: backupDel.id,
        targetType: link.targetType,
        targetId: link.targetId,
        relation: link.relation || RELATION_BY_SOURCE[link.targetType] || 'tracks-followup',
        ruleId: CONTINUITY_RULE_IDS.EXECUTION,
        summary: 'Covered by backup deputy after primary cover delegation was returned.',
      }, linkCtx);
    }
    effects.push({
      ruleId: CONTINUITY_RULE_IDS.EXECUTION,
      action: 'created',
      targetType: 'delegation',
      targetId: backupDel.id,
      summary: `Re-allocated returned cover ${returned.id} to backup deputy ${best.deputy.name} (discounted fit ${best.discountedFit}/100).`,
    });

    const person = (draft.people || []).find((p) => p && p.id === best.deputy.personId);
    if (person) {
      person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
      if (person.talkingPoints.length < MAX_TOPICS) {
        const topic = `[LCS-BACKUP:${hashOf(returned.id).slice(0, 6)}] Stepping in as backup cover for ${windowStart} → ${windowEnd} (${returned.title}). Confirm what you can hold and what must escalate.`;
        person.talkingPoints.push(topic.slice(0, 200));
        effects.push({
          ruleId: CONTINUITY_RULE_IDS.EXECUTION,
          action: 'updated',
          targetType: 'person',
          targetId: person.id,
          summary: 'Queued one blameless backup-cover briefing prompt.',
        });
      }
    }
    return effects;
  }

  // No backup deputy clears the evidence floor: open one DACI cover-gap decision.
  const gapDecision = decisionRecord({ ...ctx, draft }, {
    title: `Returned cover gap: ${returned.title}`.slice(0, 200),
    question: [
      markerValue(returnMarker),
      `Cover delegation ${returned.id} was returned (${returned.returnReason || 'reason recorded on delegation'}) and no remaining deputy clears the ${minFitPct}% evidence floor for ${windowStart} → ${windowEnd}.`,
      `${coveredLinks.length || 1} obligation(s) linked to this cover delegation now have no eligible backup deputy. Choose how to close the cover gap before the window opens.`,
    ].join('\n\n'),
    options: [
      ['Assign a backup deputy below the evidence floor with explicit pairing', 'Keeps a named human watching the obligations.', 'Lower recorded readiness requires tighter escalation boundaries.'],
      ['Pull the covered obligations forward and settle them before departure', 'Eliminates the absence-window exposure directly.', 'Requires leader time before the window opens.'],
      ['Narrow or move the absence window until cover is briefed', 'Bounds exposure when neither a backup deputy nor early resolution is available.', 'Constrains calendar flexibility.'],
      ['Accept the stall explicitly and notify affected stakeholders', 'Honest, auditable acceptance of the cover gap.', 'The covered obligations will wait until the leader returns.'],
    ],
    reviewOn: windowStart > today ? windowStart : addDays(today, 3),
  });
  draft.decisions.push(gapDecision);
  ensureEntityLink(draft, {
    sourceType: 'decision',
    sourceId: gapDecision.id,
    targetType: 'delegation',
    targetId: returned.id,
    relation: 'tracks-followup',
    ruleId: CONTINUITY_RULE_IDS.EXECUTION,
    summary: 'Cover-gap decision opened after primary cover delegation was returned with no eligible backup.',
  }, linkCtx);
  for (const link of coveredLinks) {
    ensureEntityLink(draft, {
      sourceType: 'decision',
      sourceId: gapDecision.id,
      targetType: link.targetType,
      targetId: link.targetId,
      relation: RELATION_BY_SOURCE[link.targetType] || 'tracks-followup',
      ruleId: CONTINUITY_RULE_IDS.EXECUTION,
      summary: 'Uncovered obligation after primary cover delegation was returned.',
    }, linkCtx);
  }
  effects.push({
    ruleId: CONTINUITY_RULE_IDS.EXECUTION,
    action: 'created',
    targetType: 'decision',
    targetId: gapDecision.id,
    summary: `Opened one DACI cover-gap decision after ${returned.id} was returned with no eligible backup deputy.`,
  });
  return effects;
}

/**
 * RULE-LCS-04 (Part 2): When a drill closes (or continuity scan runs) on a
 * window with a commissioned hand-over that suffered implementation drops,
 * paper-only completion or unrecovered returns, draft one pre-filled After-Action
 * Review (`retros`) and one owned ritual-fix delegation so execution drops are
 * never misdiagnosed as probability-model error.
 */
function recordImplementationDropLearning(draft, ctx, { drill = null, score = null, today }) {
  const targetWindow = drill?.startOn || null;
  const impl = handoverImplementation(draft, { now: ctx.now, windowStart: targetWindow });
  if (!impl.found) return [];
  if (drill && impl.windowStart !== drill.startOn) return [];

  const dropCount = score?.attribution?.implementationDropKeys?.length || 0;
  const modelMissCount = score?.attribution?.modelMissKeys?.length || 0;
  const unrecoveredReturns = Math.max(0, impl.returned - impl.returnedRecovered);
  const hasFailure = dropCount > 0
    || impl.paperOnly > 0
    || unrecoveredReturns > 0
    || (drill && impl.unexecuted > 0);
  if (!hasFailure) return [];

  const marker = `LCS-EXEC:${impl.decisionId}`;
  const effects = [];
  draft.retros = Array.isArray(draft.retros) ? draft.retros : [];
  const hasRetro = draft.retros.some((r) => r && (
    r.subjectId === impl.decisionId
    || String(r.subjectLabel || '').includes(marker)
    || String(r.actual || '').includes(marker)
  ));

  if (!hasRetro) {
    const rawOutcomeDay = drill ? dayKey(drill.closedAt || ctx.now) : (impl.windowEnd || today);
    const outcomeOn = rawOutcomeDay <= today ? rawOutcomeDay : today;
    const retro = normalizeRetro({
      id: ctx.idFactory('retro'),
      subjectType: 'other',
      subjectId: null,
      subjectLabel: `Hand-over execution ${impl.windowStart} → ${impl.windowEnd} [${marker}]`.slice(0, 200),
      outcomeOn,
      status: 'draft',
      autoDrafted: true,
      intended: `Commissioned ${impl.planned} cover delegation(s) covering ${impl.sourcesTotal} obligation(s) for absence window ${impl.windowStart} → ${impl.windowEnd}; every deputy was expected to log a pre-window briefing check-in and advance covered source records.`,
      actual: `Briefed: ${impl.briefed}/${impl.planned}; verified execution: ${impl.completedVerified}; paper-only completion: ${impl.paperOnly}; returned: ${impl.returned} (${impl.returnedRecovered} recovered); unexecuted: ${impl.unexecuted}. Covered source records moved: ${impl.sourcesMoved}/${impl.sourcesTotal}.${score ? ` Drill observed ${score.hits} stall(s): ${dropCount} from dropped hand-over implementation vs ${modelMissCount} from stall-model fit misses.` : ''} [${marker}]`,
      cause: '',
      sustain: '',
      improve: '',
      lessons: [],
      createdAt: ctx.now.toISOString(),
      updatedAt: ctx.now.toISOString(),
      history: [{
        at: ctx.now.toISOString(),
        type: 'auto-drafted',
        summary: `${CONTINUITY_RULE_IDS.EXECUTION} drafted an after-action review separating hand-over implementation drops from stall-model error`,
      }],
    }, draft, ctx.now);
    if (retro) {
      draft.retros.push(retro);
      effects.push({
        ruleId: CONTINUITY_RULE_IDS.EXECUTION,
        action: 'created',
        targetType: 'retro',
        targetId: retro.id,
        summary: `Drafted one pre-filled After-Action Review for hand-over execution drops (${impl.windowStart} → ${impl.windowEnd}).`,
      });
    }
  }

  const hasExecDel = (draft.delegations || []).some((d) => d && String(d.support || '').includes(markerValue(marker)));
  const droppedRow = impl.rows.find((r) => ['paper-only', 'unexecuted', 'returned', 'blocked'].includes(r.executionState));
  const ownerId = droppedRow?.personId || (draft.people || []).find((p) => p && p.status !== 'archived')?.id || null;
  if (!hasExecDel && ownerId) {
    const execDel = {
      id: ctx.idFactory('delegation'),
      personId: ownerId,
      title: `Verify covered source records & hand-over ritual for ${impl.windowStart} → ${impl.windowEnd}`.slice(0, 200),
      expectedOutcome: `Verify dated progress on the ${impl.sourcesStatic} static source obligation(s) from ${impl.windowStart} → ${impl.windowEnd} and complete the After-Action Review so paper completion is replaced by verified source movement.`,
      authority: 'act-inform',
      support: `Generated because commissioned hand-over ${impl.decisionId} recorded ${impl.paperOnly} paper-only completion(s), ${impl.unexecuted} unexecuted delegation(s) and ${dropCount} drill implementation drop(s). Marker ${markerValue(marker)}.`.slice(0, 2000),
      delegatedOn: today,
      dueOn: addDays(today, 7),
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      createdAt: ctx.now.toISOString(),
      updatedAt: ctx.now.toISOString(),
    };
    draft.delegations.push(execDel);
    ensureEntityLink(draft, {
      sourceType: 'decision',
      sourceId: impl.decisionId,
      targetType: 'delegation',
      targetId: execDel.id,
      relation: 'tracks-followup',
      ruleId: CONTINUITY_RULE_IDS.EXECUTION,
      summary: 'Follow-up delegation to verify covered source records after hand-over implementation drop.',
    }, { idFactory: ctx.idFactory, todayStr: today, nowIso: ctx.now.toISOString() });
    effects.push({
      ruleId: CONTINUITY_RULE_IDS.EXECUTION,
      action: 'created',
      targetType: 'delegation',
      targetId: execDel.id,
      summary: 'Opened one hand-over execution follow-up delegation to verify static source records.',
    });
  }

  return effects;
}

export function leaderContinuityRule(draft, ctx = {}) {
  if (!draft) return [];
  const type = ctx.event?.type;
  if (![
    CONTINUITY_COVER_EVENT,
    CONTINUITY_DRILL_EVENT,
    CONTINUITY_SCAN_EVENT,
    CONTINUITY_DELEGATION_RETURNED_EVENT,
  ].includes(type)) return [];
  if (draft.settings?.continuityAutoPropagate === false) return [];

  // Fast exit for non-continuity delegation returns so lazy savepoints never
  // clone unrelated collections on ordinary delegation returns.
  if (type === CONTINUITY_DELEGATION_RETURNED_EVENT) {
    const returnedId = ctx.event?.entityId;
    const returned = (draft.delegations || []).find((d) => d && d.id === returnedId);
    const supportText = String(returned?.support || '');
    if (!returned || returned.status !== 'returned' || (!supportText.includes('[LCS:') && !supportText.includes('LCS-WINDOW:'))) {
      return [];
    }
    const returnEffects = recoverReturnedCoverDelegation(draft, ctx, returned);
    for (const effect of returnEffects) {
      ctx.logEvent?.({
        type: 'automation.propagated',
        entity: effect.targetType,
        entityId: effect.targetId,
        summary: `${effect.ruleId}: ${effect.summary}`,
      });
    }
    return returnEffects;
  }

  const today = dayKey(ctx.now);
  const effects = [];

  if (type === CONTINUITY_COVER_EVENT) {
    effects.push(...commissionCover(draft, ctx));
  }

  if (type === CONTINUITY_DRILL_EVENT) {
    const drillId = ctx.event?.automationOptions?.drillId;
    const drill = (draft.continuityDrills || []).find((row) => row && row.id === drillId);
    if (!drill || drill.status !== 'closed') throw new Error('A closed drill record is required.');
    const score = scoreDrillRecord(drill, { state: draft, now: ctx.now });
    const calibration = drillCalibration((draft.continuityDrills || []).map((row) => ({
      ...row,
      score: row.status === 'closed' ? scoreDrillRecord(row, { state: draft, now: ctx.now }) : null,
    })));
    const drillEffects = drillCalibrationDecision(draft, ctx, { drill, score, calibration, today });
    if (drillEffects) effects.push(...drillEffects);
    effects.push(...recordImplementationDropLearning(draft, ctx, { drill, score, today }));
  }

  if (type === CONTINUITY_SCAN_EVENT) {
    effects.push(...recordImplementationDropLearning(draft, ctx, { drill: null, score: null, today }));
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
