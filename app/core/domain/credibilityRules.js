/**
 * app/core/domain/credibilityRules.js — the Borrowed Evidence Engine's three
 * post-commit rules (Schema v71, ADR-0062).
 *
 * RULE-CRE-01  Act on a borrowed verdict, and freeze the claim it acted on.
 *              - Signal families: when a family is decisively below the Signal
 *                Integrity Board's precision floor on BORROWED evidence while
 *                its own record is still too thin (or too wide) to say so, one
 *                owned re-tune task per family per ISO week.
 *              - Assumption classes: when an open premise is declared more
 *                confidently than its class has delivered — the class's
 *                borrowed hold rate is below the declared prior with the
 *                decisive posterior probability — one governed outside-view
 *                decision per class per ISO week, with a typed `outside-view`
 *                edge to every flagged premise. Fires the moment a premise is
 *                registered, which is when the outside view is still cheap.
 *              - Delegation classes: when an authority class is decisively
 *                below the on-time floor and active delegations in that class
 *                fall due inside the checkpoint window, one leader-owned
 *                checkpoint task per class per ISO week, linked to each.
 *              Every unit the rule acts on gets a frozen frame (if it has no
 *              open one), so every borrowed claim the engine acts on is graded.
 * RULE-CRE-02  Govern exchangeability. When a borrowing group turns
 *              heterogeneous (I² past the convention with p under the declared
 *              alpha) or one unit carries the pool, exactly ONE governed
 *              decision per group per ISO week — unless the leader has ruled
 *              on that group in the last 90 days.
 * RULE-CRE-03  Grade. Frames whose review day has passed are graded once from
 *              the outcomes inside their window (both forecasters, Brier),
 *              marked lapsed when nothing happened for a full review period,
 *              one blameless process task after a borrowed miss that own data
 *              would have avoided, one decision per group per week when the
 *              graded record says borrowing loses to own data, and edges to
 *              deleted frames are reconciled.
 *
 * All three are marker-idempotent and write inside the caller's transaction.
 * None of them rates a person: units are families and classes, and every task
 * is opened for the leader.
 */

import { addDays, dayKey, daysBetween, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { CREDIBILITY_EVENTS, CREDIBILITY_RULE_IDS, CREDIBILITY_DOMAIN, credibilityGroup } from './credibilityRegistry.js';
import {
  buildCredibilityFrame,
  credibilityConventions,
  credibilityReport,
  frameLedger,
  gradeCredibilityFrame,
} from './credibility.js';

/** Which evidence groups an event can change. */
const EVIDENCE_TRIGGERS = Object.freeze({
  'integrity.verdict': ['detectors'],
  'watch.triaged': ['detectors'],
  'premise.outcome': ['premises'],
  'premise.created': ['premises'],
  'premise.updated': ['premises'],
  'delegation.created': ['delegation'],
  'delegation.completed': ['delegation'],
  'delegation.returned': ['delegation'],
});

export const CREDIBILITY_TRIGGERS = Object.freeze([
  ...Object.keys(EVIDENCE_TRIGGERS),
  CREDIBILITY_EVENTS.SCAN,
]);

const SELF_FAMILIES = new Set(['Signal integrity', CREDIBILITY_DOMAIN]);
const MARKER_CAP = 400;
const FRAME_CAP = 40;

function ownerOf(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  return people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId))) || null;
}

function addMarker(draft, tag) {
  draft.credibilityMarkers = Array.isArray(draft.credibilityMarkers) ? draft.credibilityMarkers : [];
  if (draft.credibilityMarkers.includes(tag)) return false;
  draft.credibilityMarkers.push(tag);
  if (draft.credibilityMarkers.length > MARKER_CAP) {
    draft.credibilityMarkers.splice(0, draft.credibilityMarkers.length - MARKER_CAP);
  }
  return true;
}

const seen = (draft, tag) => (draft.credibilityMarkers || []).includes(tag);

/** The value stored beside a marker as `${tag}#${value}`, or null. */
function markerValue(draft, tag) {
  const hit = (draft.credibilityMarkers || []).find((m) => typeof m === 'string' && m.startsWith(`${tag}#`));
  return hit ? hit.slice(tag.length + 1) : null;
}

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function link(draft, ctx, spec) {
  return ensureEntityLink(draft, spec, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function newTask(ctx, ownerId, title, outcome, support, tag, dueDays = 7) {
  return {
    id: ctx.idFactory('delegation'),
    personId: ownerId,
    title: title.slice(0, 200),
    expectedOutcome: outcome.slice(0, 2000),
    authority: 'act-inform',
    support: `${support.slice(0, 1800)} [${tag}]`,
    delegatedOn: dayKey(ctx.now),
    dueOn: addDays(ctx.now, dueDays),
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

function newDecision(ctx, ownerName, title, question, rationale, options, ruleId) {
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 2000),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: String(ownerName || '').slice(0, 120),
    approver: String(ownerName || '').slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({
      id: ctx.idFactory('opt'), label: label.slice(0, 200), pros: pros.slice(0, 400), cons: cons.slice(0, 400),
    })),
    chosen: '',
    rationale: `Opened by ${ruleId}: ${rationale}`.slice(0, 2000),
    reviewOn: addDays(ctx.now, 7),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/**
 * Freeze a frame for the unit the rule is about to act on — unless one is
 * already open — and attach it to the evidence it borrowed from. Returns the
 * open frame (new or existing) or null when the unit cannot be frozen (no own
 * outcome yet, so the two forecasters would be identical).
 */
function ensureFrame(draft, ctx, report, group, unit, effects, ruleId) {
  draft.credibilityFrames = Array.isArray(draft.credibilityFrames) ? draft.credibilityFrames : [];
  const open = draft.credibilityFrames.find((f) => f && f.groupId === group.id && f.unitId === unit.id
    && !f.graded && !f.lapsedOn);
  if (open) return open;
  const built = buildCredibilityFrame(report, {
    groupId: group.id,
    unitId: unit.id,
    nowIso: ctx.now.toISOString(),
    id: ctx.idFactory('cframe'),
    label: `${group.label}: ${unit.label} (frozen by ${ruleId})`,
  });
  if (!built.ok) return null;
  draft.credibilityFrames.unshift(built.record);
  if (draft.credibilityFrames.length > FRAME_CAP) {
    draft.credibilityFrames.splice(FRAME_CAP);
  }
  effects.push(effect(ruleId, 'frozen', 'credibilityframe', built.record.id,
    `Froze the borrowed claim it acted on: ${unit.label} at ${built.record.borrowedPct}% borrowed vs ${built.record.rawPct}% own data, graded on ${built.record.reviewOn}.`));
  for (const ref of built.record.evidenceRefs) {
    if (link(draft, ctx, {
      sourceType: 'credibilityframe', sourceId: built.record.id, targetType: ref.type, targetId: ref.id,
      relation: 'borrows-evidence', ruleId, summary: 'Frozen borrowed estimate built on this record',
    })) {
      effects.push(effect(ruleId, 'linked', ref.type, ref.id, 'Linked the frame to an evidence record it borrowed from.'));
    }
  }
  return built.record;
}

/* ---------------------------------------------------------------- CRE-01 */

function detectorsAct(draft, ctx, report, group, week, owner) {
  const effects = [];
  const targets = group.rescued.filter((u) => u.borrowedVerdict === 'below' && !SELF_FAMILIES.has(u.id));
  for (const unit of targets) {
    const tag = `${CREDIBILITY_RULE_IDS.GRADUATE}:detectors:${unit.id}:${week}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const frame = ensureFrame(draft, ctx, report, group, unit, effects, CREDIBILITY_RULE_IDS.GRADUATE);
    if (!owner) continue;
    const graduation = unit.graduation.find((g) => g.zPct === 50);
    const task = newTask(
      ctx,
      owner.id,
      `Re-tune or retire the “${unit.label}” signal family — borrowed evidence says it over-claims`,
      `On borrowed evidence the “${unit.label}” family's actionable precision is ${unit.borrowedPct}% (90% ${unit.loPct}–${unit.hiPct}%), `
      + `below the declared ${group.floorPct}% floor with ${unit.pBelowPct}% posterior probability. Its own record (${unit.x} of ${unit.n} decisive verdicts confirmed) `
      + `is ${unit.ownVerdict === 'insufficient' ? 'too thin for the Signal Integrity Board to judge' : 'still unresolved on its own'}; `
      + `only ${unit.zPct}% of the borrowed figure is its own. `
      + (graduation && graduation.remaining
        ? `Its own record would carry half the estimate after ${graduation.remaining} more decisive verdict(s)${graduation.date ? ` (about ${graduation.date} at the current pace)` : ''}. `
        : '')
      + 'Decide whether to raise its threshold, merge it, or retire it — or record why this family is not like the others.',
      'Borrowed evidence is a bet that this family behaves like the rest of the suite. The bet is frozen and graded against the '
      + 'family\'s next verdicts, so this task can be closed by a written change to the rule, never by a conversation about a person.',
      tag,
    );
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift(task);
    effects.push(effect(CREDIBILITY_RULE_IDS.GRADUATE, 'created', 'delegation', task.id,
      `Opened one owned re-tune task for ${unit.label}: borrowed precision ${unit.borrowedPct}% vs a ${group.floorPct}% floor.`));
    if (frame && link(draft, ctx, {
      sourceType: 'credibilityframe', sourceId: frame.id, targetType: 'delegation', targetId: task.id,
      relation: 'governs-pooling', ruleId: CREDIBILITY_RULE_IDS.GRADUATE, summary: 'Task opened on this frozen borrowed claim',
    })) {
      effects.push(effect(CREDIBILITY_RULE_IDS.GRADUATE, 'linked', 'delegation', task.id, 'Linked the task to the frame it acted on.'));
    }
  }
  return effects;
}

function premisesAct(draft, ctx, report, group, week, owner) {
  const effects = [];
  const flagged = group.outsideView.filter((row) => row.flagged);
  const byClass = new Map();
  for (const row of flagged) {
    const list = byClass.get(row.classId) || [];
    list.push(row);
    byClass.set(row.classId, list);
  }
  for (const [classId, rows] of byClass) {
    const unit = group.units.find((u) => u.id === classId);
    if (!unit) continue;
    const tag = `${CREDIBILITY_RULE_IDS.GRADUATE}:premises:${classId}:${week}`;
    if (seen(draft, tag)) {
      // The week's outside-view decision already exists. A premise flagged
      // since then is attached to it rather than dropped, as long as the
      // decision is still open — one decision per class per week, every
      // flagged premise on it.
      const decisionId = markerValue(draft, tag);
      const open = decisionId && (draft.decisions || []).find((d) => d && d.id === decisionId && !d.chosen);
      if (!open) continue;
      for (const row of rows) {
        if (link(draft, ctx, {
          sourceType: 'decision', sourceId: open.id, targetType: 'premise', targetId: row.premiseId,
          relation: 'outside-view', ruleId: CREDIBILITY_RULE_IDS.GRADUATE,
          summary: `Declared ${row.priorPct}% vs a borrowed class rate of ${row.classBorrowedPct}%`,
        })) {
          effects.push(effect(CREDIBILITY_RULE_IDS.GRADUATE, 'linked', 'premise', row.premiseId,
            'Attached a newly flagged premise to this week\'s open outside-view decision.'));
        }
      }
      continue;
    }
    addMarker(draft, tag);
    const premiseById = new Map((draft.premises || []).map((p) => [p.id, p]));
    const names = rows.map((r) => premiseById.get(r.premiseId)?.title || premiseById.get(r.premiseId)?.statement || 'an open premise')
      .map((t) => `“${String(t).slice(0, 60)}”`);
    const decision = newDecision(
      ctx,
      owner?.name || draft.settings?.leaderName || '',
      `Re-price ${rows.length} open ${unit.label.toLowerCase()} assumption(s) against what the class has delivered`,
      `${names.join(', ')} ${rows.length === 1 ? 'is' : 'are'} declared at ${rows.map((r) => `${r.priorPct}%`).join(', ')}. `
      + `${unit.label} assumptions in this workspace have held ${unit.n ? `${unit.x} of ${unit.n} times` : 'too rarely to count on their own'}; `
      + `borrowing from the other classes, the class's hold rate is ${unit.borrowedPct}% (90% ${unit.loPct}–${unit.hiPct}%). `
      + `The chance the class truly holds as often as declared is under ${100 - report.conventions.decisivePct}% for each. `
      + 'Choose: re-price, defend the inside view in writing, or buy information before relying on them.',
      `Reference-class check (Kahneman & Lovallo): P(class hold rate < declared prior) ≥ ${report.conventions.decisivePct}% from a `
      + `Beta-binomial hierarchy over ${group.counts.units} criticality classes and ${group.counts.observations} settled outcomes `
      + `(prior worth ~${group.prior.strengthMedian} outcomes). The engine does not change any prior; the leader does, or writes down why not.`,
      [
        ['Lower the declared priors toward the class rate', 'Plans stop resting on a confidence the record has never earned.', 'If this premise really is different, the plan is now too cautious.'],
        ['Keep the priors and write down why these are different (the inside view)', 'Specific knowledge is not thrown away.', 'The written reason is what the grade will test.'],
        ['Add a sensor or a cheap test before relying on them', 'Converts a confidence argument into evidence.', 'Costs time before the decision.'],
        ['Refuse borrowing across assumption classes', 'Each class is judged only on its own outcomes.', 'Most classes go back to “too few outcomes to judge”.'],
      ],
      CREDIBILITY_RULE_IDS.GRADUATE,
    );
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    draft.decisions.unshift(decision);
    addMarker(draft, `${tag}#${decision.id}`);
    effects.push(effect(CREDIBILITY_RULE_IDS.GRADUATE, 'created', 'decision', decision.id,
      `Opened one outside-view decision for ${rows.length} ${unit.label.toLowerCase()} premise(s): class ${unit.borrowedPct}% vs declared ${rows.map((r) => r.priorPct).join('/')}%.`));
    for (const row of rows) {
      if (link(draft, ctx, {
        sourceType: 'decision', sourceId: decision.id, targetType: 'premise', targetId: row.premiseId,
        relation: 'outside-view', ruleId: CREDIBILITY_RULE_IDS.GRADUATE,
        summary: `Declared ${row.priorPct}% vs a borrowed class rate of ${row.classBorrowedPct}%`,
      })) {
        effects.push(effect(CREDIBILITY_RULE_IDS.GRADUATE, 'linked', 'premise', row.premiseId,
          'Linked the outside-view decision to a premise declared above its class.'));
      }
    }
    const frame = unit.n ? ensureFrame(draft, ctx, report, group, unit, effects, CREDIBILITY_RULE_IDS.GRADUATE) : null;
    if (frame && link(draft, ctx, {
      sourceType: 'credibilityframe', sourceId: frame.id, targetType: 'decision', targetId: decision.id,
      relation: 'governs-pooling', ruleId: CREDIBILITY_RULE_IDS.GRADUATE, summary: 'Decision opened on this frozen class rate',
    })) {
      effects.push(effect(CREDIBILITY_RULE_IDS.GRADUATE, 'linked', 'decision', decision.id, 'Linked the decision to the frame it acted on.'));
    }
  }
  return effects;
}

function delegationAct(draft, ctx, report, group, week, owner) {
  const effects = [];
  if (!owner) return effects;
  const delegationById = new Map((draft.delegations || []).map((d) => [d.id, d]));
  for (const unit of group.units.filter((u) => u.borrowedVerdict === 'below')) {
    // A checkpoint task this rule opened is not itself a reason to open another.
    const due = group.forecasts.filter((f) => f.classId === unit.id && f.withinCheckpoint
      && !String(delegationById.get(f.delegationId)?.support || '').includes(`[${CREDIBILITY_RULE_IDS.GRADUATE}`));
    if (!due.length) continue;
    const tag = `${CREDIBILITY_RULE_IDS.GRADUATE}:delegation:${unit.id}:${week}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const task = newTask(
      ctx,
      owner.id,
      `Put a mid-point checkpoint on ${due.length} “${unit.label}” delegation(s) due in the next ${report.conventions.checkpointDays} days`,
      `Work delegated at “${unit.label}” authority has landed on time ${unit.x} of ${unit.n} times here; borrowing from the other `
      + `authority classes, its on-time rate is ${unit.borrowedPct}% (90% ${unit.loPct}–${unit.hiPct}%), below the declared `
      + `${group.floorPct}% floor with ${unit.pBelowPct}% posterior probability. Due soon: `
      + due.map((f) => `${String(delegationById.get(f.delegationId)?.title || 'a delegation').slice(0, 50)} (due ${f.dueOn}, ~${f.pOnTimePct}% on time)`).join('; ')
      + '. Agree one checkpoint for each before it is late rather than after.',
      'This is a finding about how work at this authority level lands, not about the people doing it: the unit is the authority class, '
      + 'and the remedy is a checkpoint or a clearer boundary, never a judgement of a person.',
      tag,
      Math.min(7, Math.max(1, Math.min(...due.map((f) => f.daysToDue ?? 7)))),
    );
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift(task);
    effects.push(effect(CREDIBILITY_RULE_IDS.GRADUATE, 'created', 'delegation', task.id,
      `Opened one checkpoint task for ${due.length} ${unit.label} delegation(s): class on-time ${unit.borrowedPct}% vs a ${group.floorPct}% floor.`));
    for (const f of due) {
      if (link(draft, ctx, {
        sourceType: 'delegation', sourceId: task.id, targetType: 'delegation', targetId: f.delegationId,
        relation: 'tracks-followup', ruleId: CREDIBILITY_RULE_IDS.GRADUATE,
        summary: `Checkpoint: borrowed P(on time) ${f.pOnTimePct}%`,
      })) {
        effects.push(effect(CREDIBILITY_RULE_IDS.GRADUATE, 'linked', 'delegation', f.delegationId,
          'Linked the checkpoint task to a delegation it covers.'));
      }
    }
    const frame = ensureFrame(draft, ctx, report, group, unit, effects, CREDIBILITY_RULE_IDS.GRADUATE);
    if (frame && link(draft, ctx, {
      sourceType: 'credibilityframe', sourceId: frame.id, targetType: 'delegation', targetId: task.id,
      relation: 'governs-pooling', ruleId: CREDIBILITY_RULE_IDS.GRADUATE, summary: 'Checkpoint task opened on this frozen class rate',
    })) {
      effects.push(effect(CREDIBILITY_RULE_IDS.GRADUATE, 'linked', 'delegation', task.id, 'Linked the checkpoint task to the frame it acted on.'));
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- CRE-02 */

function governRule(draft, ctx, report, groupIds, week, owner) {
  const effects = [];
  for (const group of report.groups.filter((g) => groupIds.includes(g.id))) {
    if (!group.borrowing) continue;
    const heterogeneous = Boolean(group.heterogeneity.flagged);
    const carried = group.carriers.length > 0;
    if (!heterogeneous && !carried) continue;
    const ruled = group.declaration && daysBetween(group.declaration.declaredAt, ctx.now) !== null
      && daysBetween(group.declaration.declaredAt, ctx.now) <= 90;
    if (ruled) continue;
    const tag = `${CREDIBILITY_RULE_IDS.GOVERN}:${group.id}:${week}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const why = heterogeneous
      ? `the units differ by more than sampling noise explains (I² ${group.heterogeneity.i2Pct}%, χ² ${group.heterogeneity.x2} on ${group.heterogeneity.df} df, p ${group.heterogeneity.pValue}${group.heterogeneity.approximate ? ', approximate' : ''})`
      : `removing “${group.carriers[0].label}” moves another unit's borrowed estimate by ${group.carriers[0].influencePp} points`;
    const decision = newDecision(
      ctx,
      owner?.name || draft.settings?.leaderName || '',
      `Are the ${group.label.toLowerCase()} one kind of thing? (borrowing governance)`,
      `Borrowed estimates in ${group.groupLabel.toLowerCase()} assume its ${group.unitLabel}s are draws from one distribution. Right now ${why}. `
      + 'The model already borrows less when units differ, but whether they belong in one pool at all is a judgement about the world, not a statistic. '
      + 'Rule on it once; the engine obeys the ruling and stops asking for 90 days.',
      `Exchangeability screen: Pearson χ² homogeneity with I² (Higgins & Thompson 2002) and leave-one-out influence on the hyperprior, `
      + `against the declared ${report.conventions.heterogeneityAlphaPct}% alpha, ${report.conventions.i2WarnPct}% I² and `
      + `${report.conventions.influenceTolerancePct}-point tolerance.`,
      [
        ['Keep borrowing — declare them one kind of thing', 'Small units keep getting early, honest estimates.', 'If they really differ, extreme units are pulled toward a mean that describes none of them.'],
        ['Stop borrowing for this group', 'Every unit is judged on its own record only.', 'Most units go back to “too few to judge” until their own data arrives.'],
        ['Keep borrowing, but read the outlying unit on its own record', 'The pool keeps working for the rest.', 'Requires a written reason for the exception.'],
      ],
      CREDIBILITY_RULE_IDS.GOVERN,
    );
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    draft.decisions.unshift(decision);
    effects.push(effect(CREDIBILITY_RULE_IDS.GOVERN, 'created', 'decision', decision.id,
      `Opened one exchangeability decision for ${group.groupLabel}: ${heterogeneous ? `I² ${group.heterogeneity.i2Pct}%` : 'one unit carries the pool'}.`));
    const attachTo = (draft.credibilityFrames || [])
      .filter((f) => f && f.groupId === group.id && !f.graded && !f.lapsedOn)
      .sort((p, q) => (p.frozenAt < q.frozenAt ? 1 : -1))[0];
    if (attachTo && link(draft, ctx, {
      sourceType: 'credibilityframe', sourceId: attachTo.id, targetType: 'decision', targetId: decision.id,
      relation: 'governs-pooling', ruleId: CREDIBILITY_RULE_IDS.GOVERN, summary: 'Exchangeability decision for the pool this frame borrows from',
    })) {
      effects.push(effect(CREDIBILITY_RULE_IDS.GOVERN, 'linked', 'decision', decision.id, 'Linked the decision to the newest open frame in the group.'));
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- CRE-03 */

function gradeRule(draft, ctx, conventions, week, owner) {
  const effects = [];
  const today = dayKey(ctx.now);
  draft.credibilityFrames = Array.isArray(draft.credibilityFrames) ? draft.credibilityFrames : [];
  for (const frame of draft.credibilityFrames) {
    if (!frame || frame.graded || frame.lapsedOn || frame.reviewOn > today) continue;
    const grade = gradeCredibilityFrame(frame, draft, ctx.now);
    if (!grade) {
      if ((daysBetween(frame.reviewOn, today) ?? 0) >= conventions.reviewDays) {
        frame.lapsedOn = today;
        effects.push(effect(CREDIBILITY_RULE_IDS.GRADE, 'lapsed', 'credibilityframe', frame.id,
          `No outcome arrived in ${frame.label}'s window or the review period after it; the forecast lapsed untested rather than being guessed.`));
      } else {
        effects.push(effect(CREDIBILITY_RULE_IDS.GRADE, 'withheld', 'credibilityframe', frame.id,
          'The window closed with no outcome inside it; the grade is withheld rather than guessed.'));
      }
      continue;
    }
    frame.graded = grade;
    effects.push(effect(CREDIBILITY_RULE_IDS.GRADE, 'graded', 'credibilityframe', frame.id,
      `Graded ${frame.label}: ${grade.successes}/${grade.observed} outcomes; Brier ${grade.brierBorrowed} borrowed vs ${grade.brierRaw} own data.`));
    if (grade.brierBorrowed >= conventions.surpriseBrier && grade.brierBorrowed > grade.brierRaw && owner) {
      const tag = `${CREDIBILITY_RULE_IDS.GRADE}:task:${frame.id}`;
      if (!seen(draft, tag)) {
        addMarker(draft, tag);
        const group = credibilityGroup(frame.groupId);
        const task = newTask(
          ctx,
          owner.id,
          'A borrowed forecast missed where the unit\'s own record would not have — review the pooling, not the people',
          `The frame frozen on ${String(frame.frozenAt).slice(0, 10)} for ${frame.label} borrowed ${frame.borrowedPct}% where the unit's own record said `
          + `${frame.rawPct}%. Over the ${grade.observed} outcome(s) that followed (${grade.successes} successes) the borrowed forecast scored a Brier of `
          + `${grade.brierBorrowed} against ${grade.brierRaw} for own data. Write down whether this ${group ? group.unitLabel : 'unit'} belongs in the pool.`,
          'A process finding about the borrowing model. It is closed by an exchangeability ruling or a written note, never by a judgement of a person.',
          tag,
        );
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        draft.delegations.unshift(task);
        effects.push(effect(CREDIBILITY_RULE_IDS.GRADE, 'created', 'delegation', task.id,
          'Opened one blameless process task after a borrowed miss own data would have avoided.'));
        if (link(draft, ctx, {
          sourceType: 'credibilityframe', sourceId: frame.id, targetType: 'delegation', targetId: task.id,
          relation: 'tracks-followup', ruleId: CREDIBILITY_RULE_IDS.GRADE, summary: 'Graded frame opened the process review',
        })) {
          effects.push(effect(CREDIBILITY_RULE_IDS.GRADE, 'linked', 'delegation', task.id, 'Linked the graded frame to its process task.'));
        }
      }
    }
  }

  const ledger = frameLedger(draft, today, conventions);
  for (const row of ledger.byGroup) {
    if (row.skill === null || row.skill >= 0) continue;
    const tag = `${CREDIBILITY_RULE_IDS.GRADE}:skill:${row.groupId}:${week}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const group = credibilityGroup(row.groupId);
    const decision = newDecision(
      ctx,
      owner?.name || draft.settings?.leaderName || '',
      `Borrowing has lost to own data in ${group.groupLabel.toLowerCase()} — keep it or stop it?`,
      `Over ${row.graded} graded frames, borrowed forecasts scored a mean Brier of ${row.meanBrierBorrowed} against ${row.meanBrierRaw} for each unit's own record `
      + `(skill ${row.skill}; borrowed won ${row.wins} of ${row.graded}). In this workspace the ${group.unitLabel}s are not behaving like draws from one distribution.`,
      `Proper-score comparison of two frozen forecasters on the same outcomes (Brier 1950), withheld below ${conventions.skillFloor} graded frames.`,
      [
        ['Stop borrowing for this group', 'Estimates follow each unit\'s own record.', 'Small units return to “too few to judge”.'],
        ['Keep borrowing for another review period', 'A short losing run can be noise.', 'If the units truly differ, the loss compounds.'],
        ['Split the group into more alike sub-groups', 'Keeps borrowing where it is earned.', 'Needs a registry change and a written rationale.'],
      ],
      CREDIBILITY_RULE_IDS.GRADE,
    );
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    draft.decisions.unshift(decision);
    effects.push(effect(CREDIBILITY_RULE_IDS.GRADE, 'created', 'decision', decision.id,
      `Opened one borrowing-skill decision for ${group.groupLabel}: skill ${row.skill} over ${row.graded} graded frames.`));
    const newest = ledger.graded.filter((f) => f.groupId === row.groupId)
      .sort((p, q) => (p.graded.gradedAt < q.graded.gradedAt ? 1 : -1))[0];
    if (newest && link(draft, ctx, {
      sourceType: 'credibilityframe', sourceId: newest.id, targetType: 'decision', targetId: decision.id,
      relation: 'governs-pooling', ruleId: CREDIBILITY_RULE_IDS.GRADE, summary: 'Skill decision opened from the graded record',
    })) {
      effects.push(effect(CREDIBILITY_RULE_IDS.GRADE, 'linked', 'decision', decision.id, 'Linked the decision to the newest graded frame.'));
    }
  }

  const ids = new Set(draft.credibilityFrames.map((f) => f && f.id).filter(Boolean));
  if (Array.isArray(draft.links)) {
    const before = draft.links.length;
    const kept = draft.links.filter((l) => l && !((l.sourceType === 'credibilityframe' && !ids.has(l.sourceId))
      || (l.targetType === 'credibilityframe' && !ids.has(l.targetId))));
    if (kept.length !== before) {
      draft.links = kept;
      effects.push(effect(CREDIBILITY_RULE_IDS.GRADE, 'reconciled', 'links', '',
        `Removed ${before - kept.length} edge(s) to frames that no longer exist.`));
    }
  }
  return effects;
}

/* ---------------------------------------------------------------- engine */

export { CREDIBILITY_EVENTS, CREDIBILITY_RULE_IDS };

export function credibilityRule(draft, ctx = {}) {
  if (!draft || !ctx.event || typeof ctx.event.type !== 'string') return [];
  const type = ctx.event.type;
  const isScan = type === CREDIBILITY_EVENTS.SCAN;
  if (!isScan && !EVIDENCE_TRIGGERS[type]) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const scoped = { ...ctx, now };
  const conventions = credibilityConventions(ctx.settings || draft.settings || {});
  if (!conventions.autoPropagate && !isScan) return [];

  const groupIds = isScan ? ['detectors', 'premises', 'delegation'] : EVIDENCE_TRIGGERS[type];
  const week = weekKey(now) || dayKey(now);
  const owner = ownerOf(draft);
  let effects = [];

  // Grade first, so a frame whose window has closed is scored before any new
  // frame for the same unit could be frozen beside it.
  effects = effects.concat(gradeRule(draft, scoped, conventions, week, owner));

  const report = credibilityReport(draft, now, ctx.settings || draft.settings || {});
  for (const group of report.groups.filter((g) => groupIds.includes(g.id) && g.borrowing)) {
    if (group.id === 'detectors') effects = effects.concat(detectorsAct(draft, scoped, report, group, week, owner));
    if (group.id === 'premises') effects = effects.concat(premisesAct(draft, scoped, report, group, week, owner));
    if (group.id === 'delegation') effects = effects.concat(delegationAct(draft, scoped, report, group, week, owner));
  }
  effects = effects.concat(governRule(draft, scoped, report, groupIds, week, owner));

  for (const entry of effects) {
    if (typeof ctx.logEvent === 'function') {
      ctx.logEvent({
        type: 'automation.propagated',
        entity: 'credibilityframe',
        entityId: entry.targetId || '',
        summary: entry.summary,
      });
    }
    if (Array.isArray(ctx.out)) ctx.out.push(entry);
  }
  return effects;
}

credibilityRule.id = 'credibility';
credibilityRule.label = 'Borrowed evidence & graded pooling (RULE-CRE-01..03)';
credibilityRule.module = 'credibilityRules.js';
credibilityRule.triggers = CREDIBILITY_TRIGGERS;
credibilityRule.effect = (draft, event, context = {}) => credibilityRule(draft, { ...context, event });
Object.freeze(credibilityRule);
