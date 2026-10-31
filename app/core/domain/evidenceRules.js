/**
 * app/core/domain/evidenceRules.js — the post-commit side of the Evidence
 * Terminal (Schema v66, ADR-0055) on the shared rule spine (ADR-0008).
 *
 * A pooled effect that lives only on its own screen is a statistic with better
 * typography. These rules make it become work, and they make the work land in
 * the same atomic transaction as the study that produced it: scoring a study is
 * the moment the evidence base changes, so it is the moment the consequence
 * should be written.
 *
 *   RULE-EBM-01  every evidence event
 *                A cell whose pooled interval stays on the harmful side of
 *                zero opens exactly ONE DACI decision for that cell, ever.
 *                Once, not once a week: the finding is about a durable body of
 *                evidence, and a weekly decision would be a reminder system
 *                wearing a decision's clothes. Typed `grounds-practice` edge
 *                from the review that froze it, when there is one.
 *
 *   RULE-EBM-02  `impact.scored`
 *                A single supported, pre-registered result with no replication
 *                opens one owned, dated task to replicate it. One per study,
 *                marker-idempotent. A first result is a hypothesis.
 *
 *   RULE-EBM-03  every evidence event
 *                An intervention whose information value exceeds its expected
 *                effect opens one owned task to run it once, pre-registered.
 *                Marker-idempotent per (outcome × intervention × ISO week),
 *                capped by `evidenceMaxTasksPerScan`.
 *
 *   RULE-EBM-04  `evidence.scan`
 *                The newest frozen review is attached to the open operational
 *                cases it speaks to with typed `recommends-for` edges (capped),
 *                and one owned delegation invites the leader to run the
 *                top-ranked intervention as a study. No review, no edge: an
 *                edge needs a durable source, and inventing one would make the
 *                provenance graph point at a page view.
 *
 *   RULE-EBM-05  every evidence event
 *                Reconciles `grounds-practice` and `recommends-for` edges whose
 *                target has since closed or been deleted, and opens one grading
 *                task per review whose review date has passed.
 *
 * `evidenceAutoPropagate=false` pauses automatic work; an explicit scan always
 * runs and catches up, because a pause is a choice not to be nudged, not a
 * choice to be wrong. The rules never score a person, never close a case and
 * never alter a study.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildEvidenceReview, evidenceReport } from './evidence.js';

export const EVIDENCE_RULE_VERSION = 1;

export const EVIDENCE_RULE_IDS = Object.freeze({
  HARM: 'RULE-EBM-01',
  REPLICATE: 'RULE-EBM-02',
  EXPLORE: 'RULE-EBM-03',
  APPLY: 'RULE-EBM-04',
  GRADE: 'RULE-EBM-05',
});

export const EVIDENCE_EVENTS = Object.freeze({
  SCAN: 'evidence.scan',
  FROZEN: 'evidence.review.frozen',
  GRADED: 'evidence.review.graded',
  SCORED: 'impact.scored',
});

function str(value, fallback = '') {
  return typeof value === 'string' && value ? value : fallback;
}

function hasMarker(markers, tag) {
  return markers.some((marker) => typeof marker === 'string' && marker.includes(tag));
}

function addMarker(markers, tag) {
  if (!markers.includes(tag)) markers.push(tag);
  if (markers.length > 400) markers.splice(0, markers.length - 400);
}

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function pctText(value) {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  const abs = Math.abs(value);
  // A value of information is frequently a small number of percentage points,
  // and rounding it to two decimals prints it as a flat +0% — which reads as
  // "worthless" when it is merely small. Keep two significant digits instead.
  if (abs === 0) return '+0%';
  if (abs < 0.01) return `${sign}${Number(value.toPrecision(2))}%`;
  return `${sign}${Math.round(value * 100) / 100}%`;
}

function delegationRecord(ctx, { personId, title, expectedOutcome, support, dueOn, tag }) {
  return {
    id: ctx.idFactory('delegation'),
    personId,
    title: String(title).slice(0, 200),
    expectedOutcome: String(expectedOutcome).slice(0, 2000),
    authority: 'act-inform',
    support: `${String(support).slice(0, 1800)} [${tag}]`,
    delegatedOn: dayKey(ctx.now),
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

function decisionRecord(ctx, draft, { title, question, options, reviewOn, rationale }) {
  const leader = str(draft.settings && draft.settings.leaderName);
  return {
    id: ctx.idFactory('dec'),
    title: String(title).slice(0, 200),
    question: String(question).slice(0, 2000),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: leader.slice(0, 120),
    approver: leader.slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '',
    rationale: String(rationale).slice(0, 4000),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/** The review a rule should hang its provenance off, or null. */
function newestReview(draft) {
  const rows = Array.isArray(draft.evidenceReviews) ? draft.evidenceReviews : [];
  if (!rows.length) return null;
  return rows[0];
}

/* ------------------------------------------------------------- RULE-EBM-01 */

function harmDecisions(draft, ctx, report) {
  const effects = [];
  draft.evidenceMarkers = Array.isArray(draft.evidenceMarkers) ? draft.evidenceMarkers : [];
  const review = newestReview(draft);
  for (const cell of report.effects.eligibleCells) {
    if (cell.verdict !== 'harms-here') continue;
    const tag = `${EVIDENCE_RULE_IDS.HARM}:${cell.key}`;
    if (hasMarker(draft.evidenceMarkers, tag)) continue;
    addMarker(draft.evidenceMarkers, tag);
    const decision = decisionRecord(ctx, draft, {
      title: `Stop or redesign ${cell.interventionLabel} — it is pooled-negative on ${cell.outcomeLabel.toLowerCase()}`,
      question: `${cell.nConfirmatory} pre-registered study(ies) pool to ${pctText(cell.pool.pooled)} on ${cell.outcomeLabel.toLowerCase()}, with an interval of ${pctText(cell.pool.reportedLo)} to ${pctText(cell.pool.reportedHi)} that stays on the harmful side of zero (τ² = ${cell.pool.heterogeneity.tau2}, I² = ${cell.pool.heterogeneity.i2}%). The evidence is not that the intention was wrong; it is that this lever, in this system, moves this number the wrong way. Do we stop it, restrict it to where it worked, or replace it with the best-evidenced alternative?`,
      options: [
        ['Stop it and record why', 'A pooled negative result is the most actionable thing this workspace can produce. Stopping is cheap, reversible, and frees the attention for a lever with better evidence.', 'It discards whatever local benefit the studies did not measure.'],
        ['Restrict it to the contexts where it held', `Heterogeneity is ${cell.pool.heterogeneity.label} (I² ${cell.pool.heterogeneity.i2}%), so the average may hide a split. Restricting is the honest response to a split — but only if you can name the difference.`, 'It requires knowing what separated the cases, which the pooled result does not tell you.'],
        ['Replace it with the best-evidenced alternative', 'The recommendation panel ranks every other lever on the same outcome, including the information value of the ones nobody has tried.', 'Swapping a known-bad lever for an untested one trades a measured loss for an unmeasured one.'],
      ],
      reviewOn: dayKey(addDays(ctx.now, 21)),
      rationale: `Opened by ${EVIDENCE_RULE_IDS.HARM} because the pooled interval for ${cell.interventionLabel} on ${cell.outcomeLabel} excludes zero on the harmful side. Once per cell, ever: the finding is about a durable body of evidence, not about this week. The decision is about a practice, never about a person.`,
    });
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    draft.decisions.unshift(decision);
    effects.push(effect(EVIDENCE_RULE_IDS.HARM, 'created', 'decision', decision.id,
      `Opened one decision: ${cell.interventionLabel} pools to ${pctText(cell.pool.pooled)} on ${cell.outcomeLabel.toLowerCase()} across ${cell.nConfirmatory} pre-registered study(ies).`));
    if (review) {
      const { created } = ensureEntityLink(draft, {
        sourceType: 'evidence',
        sourceId: review.id,
        targetType: 'decision',
        targetId: decision.id,
        relation: 'grounds-practice',
        ruleId: EVIDENCE_RULE_IDS.HARM,
        summary: `Pooled ${pctText(cell.pool.pooled)} on ${cell.outcomeLabel.toLowerCase()} across ${cell.nConfirmatory} pre-registered study(ies)`,
      }, {
        idFactory: ctx.idFactory,
        todayStr: dayKey(ctx.now),
        nowIso: ctx.now.toISOString(),
      });
      if (created) {
        effects.push(effect(EVIDENCE_RULE_IDS.HARM, 'linked', 'decision', decision.id,
          'Linked the frozen evidence review to the decision it grounds, so the practice change is navigable from the evidence and back.'));
      }
    }
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-EBM-02 */

function replicationTasks(draft, ctx, report, conventions) {
  const effects = [];
  if (!ctx.event || ctx.event.type !== EVIDENCE_EVENTS.SCORED) return effects;
  const studyId = str(ctx.event.entityId);
  if (!studyId) return effects;
  draft.evidenceMarkers = Array.isArray(draft.evidenceMarkers) ? draft.evidenceMarkers : [];
  const tag = `${EVIDENCE_RULE_IDS.REPLICATE}:${studyId}`;
  if (hasMarker(draft.evidenceMarkers, tag)) return effects;

  const study = (Array.isArray(draft.impactStudies) ? draft.impactStudies : []).find((row) => row.id === studyId);
  if (!study || study.status !== 'scored') return effects;
  const evaluation = study.evaluation;
  if (!evaluation || evaluation.ok !== true || evaluation.verdict !== 'supported') return effects;
  if (study.replicationOfId) return effects;

  const cell = report.effects.cells.find((c) => c.interventionType === study.interventionType && c.outcomeId === study.vitalId);
  if (!cell) return effects;
  // Only a lone result asks for a replication. A cell that already has one is
  // either replicated or heterogeneous, and neither needs this task.
  if (cell.roots !== 1 || cell.replications !== 0) return effects;

  const ownerId = resolveLeader(draft);
  if (!ownerId) return effects;
  addMarker(draft.evidenceMarkers, tag);
  const task = delegationRecord(ctx, {
    personId: ownerId,
    title: `Replicate the ${cell.interventionLabel.toLowerCase()} result before treating it as a standard`,
    expectedOutcome: `Declare one more pre-registered study of ${cell.interventionLabel.toLowerCase()} on ${cell.outcomeLabel.toLowerCase()} — or record, in writing, why this result will not be tested again. Right now the cell holds one independent result and zero replications, which is a hypothesis rather than a finding.`,
    support: `${EVIDENCE_RULE_IDS.REPLICATE} opened this because a single supported, pre-registered study is the beginning of a finding, not the end of one. A replication is the cheapest way to find out whether the first result was luck, and it is the only thing that turns one study into a standard.`,
    dueOn: dayKey(addDays(ctx.now, 14)),
    tag,
  });
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift(task);
  effects.push(effect(EVIDENCE_RULE_IDS.REPLICATE, 'created', 'delegation', task.id,
    `Opened one replication task: ${cell.interventionLabel} on ${cell.outcomeLabel.toLowerCase()} rests on a single unreplicated result.`));
  return effects;
}

function resolveLeader(draft) {
  // The leader is the roster member with no manager of their own. Never an
  // invented owner: a task with a guessed owner is a task nobody will do.
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  const leader = people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId)));
  return leader ? leader.id : null;
}

/* ------------------------------------------------------------- RULE-EBM-03 */

function explorationTasks(draft, ctx, report, conventions) {
  const effects = [];
  const week = report.week;
  const recommendation = report.recommendation;
  if (!recommendation) return effects;
  draft.evidenceMarkers = Array.isArray(draft.evidenceMarkers) ? draft.evidenceMarkers : [];
  const rows = (recommendation.rows || [])
    .filter((row) => row.explorationDominant || (row.tested === false && Number.isFinite(row.evsi)))
    .slice(0, conventions.maxTasksPerScan);
  let opened = 0;
  for (const row of rows) {
    const tag = `${EVIDENCE_RULE_IDS.EXPLORE}:${recommendation.outcomeId}:${row.interventionType}:${week}`;
    if (hasMarker(draft.evidenceMarkers, tag)) continue;
    const ownerId = resolveLeader(draft);
    if (!ownerId) break;
    addMarker(draft.evidenceMarkers, tag);
    const task = delegationRecord(ctx, {
      personId: ownerId,
      title: `Run one pre-registered study of ${row.label.toLowerCase()}`,
      expectedOutcome: `Declare the hypothesis, the metric and the window before starting, then let the window close and score it. ${row.tested
        ? `This lever's expected effect is ${pctText(row.mean)}, but one more trial is worth ${pctText(row.evsi)} in information alone over the next ${recommendation.horizonDecisions} decisions — more than the effect itself is worth in expectation.`
        : `Nothing here has tested ${row.label.toLowerCase()} on ${recommendation.outcomeLabel.toLowerCase()}. Over the next ${recommendation.horizonDecisions} decisions, finding out is worth ${pctText(row.evsi)} against an information ceiling of ${pctText(row.evpi)}.`}`,
      support: `${EVIDENCE_RULE_IDS.EXPLORE} opened this because the value of the information exceeded the value of the expected effect. The price of learning is the price of a study you were going to run anyway; the price of not learning is the same decision made blind ${recommendation.horizonDecisions} more times.`,
      dueOn: dayKey(addDays(ctx.now, 14)),
      tag,
    });
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift(task);
    opened += 1;
    effects.push(effect(EVIDENCE_RULE_IDS.EXPLORE, 'created', 'delegation', task.id,
      `Opened one study task: ${row.tested
        ? `${row.label.toLowerCase()} is worth more as information (${pctText(row.evsi)}) than as expected effect (${pctText(row.mean)}).`
        : `${row.label.toLowerCase()} is untested here, and finding out is worth ${pctText(row.evsi)} against an information ceiling of ${pctText(row.evpi)}.`}`));
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-EBM-04 */

function applyRecommendation(draft, ctx, report, conventions) {
  const effects = [];
  if (!ctx.event || ctx.event.type !== EVIDENCE_EVENTS.SCAN) return effects;
  const review = newestReview(draft);
  if (!review) return effects;
  const recommendation = report.recommendation;
  if (!recommendation) return effects;
  const top = (recommendation.rows || [])[0];
  if (!top) return effects;

  // Typed edges from the review to the open cases this ranking speaks to.
  const openCases = (Array.isArray(draft.cases) ? draft.cases : [])
    .filter((row) => row && ['open', 'monitoring', 'mitigating'].includes(row.status))
    .slice(0, conventions.maxCaseLinks);
  let linked = 0;
  for (const record of openCases) {
    const { created } = ensureEntityLink(draft, {
      sourceType: 'evidence',
      sourceId: review.id,
      targetType: 'case',
      targetId: record.id,
      relation: 'recommends-for',
      ruleId: EVIDENCE_RULE_IDS.APPLY,
      summary: `Best-evidenced lever for ${recommendation.outcomeLabel.toLowerCase()}: ${top.label}${Number.isFinite(top.mean) ? ` (${pctText(top.mean)})` : ' (untested — priced for information)'}`,
    }, {
      idFactory: ctx.idFactory,
      todayStr: dayKey(ctx.now),
      nowIso: ctx.now.toISOString(),
    });
    if (created) {
      linked += 1;
      effects.push(effect(EVIDENCE_RULE_IDS.APPLY, 'linked', 'case', record.id,
        `Attached the evidence review's recommendation (${top.label}) to an open case.`));
    }
  }

  const week = report.week;
  draft.evidenceMarkers = Array.isArray(draft.evidenceMarkers) ? draft.evidenceMarkers : [];
  const tag = `${EVIDENCE_RULE_IDS.APPLY}:${recommendation.outcomeId}:${top.interventionType}:${week}`;
  const ownerId = resolveLeader(draft);
  if (ownerId && !hasMarker(draft.evidenceMarkers, tag)) {
    addMarker(draft.evidenceMarkers, tag);
    const task = delegationRecord(ctx, {
      personId: ownerId,
      title: `Act on the best-evidenced lever for ${recommendation.outcomeLabel.toLowerCase()}`,
      expectedOutcome: `The pooled evidence ranks ${top.label.toLowerCase()} first for ${recommendation.outcomeLabel.toLowerCase()}${Number.isFinite(top.mean) ? ` at ${pctText(top.mean)} (interval ${pctText(top.lcb)} upward)` : ', on the value of finding out rather than a measured effect'}. Record what you will do differently because of that, or record why the ranking does not apply to this situation. Both are answers; silence is not.`,
      support: `${EVIDENCE_RULE_IDS.APPLY} opened this during a scan against review ${review.id}. ${linked} open case(s) were linked to the review so the recommendation is visible where the work is.`,
      dueOn: dayKey(addDays(ctx.now, 7)),
      tag,
    });
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift(task);
    effects.push(effect(EVIDENCE_RULE_IDS.APPLY, 'created', 'delegation', task.id,
      `Opened one task to act on the best-evidenced lever for ${recommendation.outcomeLabel.toLowerCase()}.`));
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-EBM-05 */

function reconcileAndGrade(draft, ctx, report, conventions) {
  const effects = [];
  const today = dayKey(ctx.now);

  // Desired-state reconciliation for both relations this module writes.
  const caseIds = new Set((Array.isArray(draft.cases) ? draft.cases : []).map((row) => row && row.id).filter(Boolean));
  const decisionIds = new Set((Array.isArray(draft.decisions) ? draft.decisions : []).map((row) => row && row.id).filter(Boolean));
  const reviewIds = new Set((Array.isArray(draft.evidenceReviews) ? draft.evidenceReviews : []).map((row) => row && row.id).filter(Boolean));
  const before = Array.isArray(draft.links) ? draft.links.length : 0;
  draft.links = (Array.isArray(draft.links) ? draft.links : []).filter((link) => {
    if (!link || !['grounds-practice', 'recommends-for'].includes(link.relation)) return true;
    if (!reviewIds.has(link.sourceId)) return false;
    if (link.targetType === 'case') return caseIds.has(link.targetId);
    if (link.targetType === 'decision') return decisionIds.has(link.targetId);
    return true;
  });
  const removed = before - draft.links.length;
  if (removed > 0) {
    effects.push(effect(EVIDENCE_RULE_IDS.GRADE, 'reconciled', 'links', '',
      `Removed ${removed} stale evidence edge(s) whose review, case or decision no longer exists.`));
  }

  // Grading work for reviews whose review date has passed.
  draft.evidenceMarkers = Array.isArray(draft.evidenceMarkers) ? draft.evidenceMarkers : [];
  const due = (Array.isArray(draft.evidenceReviews) ? draft.evidenceReviews : [])
    .filter((review) => review && !review.graded && review.reviewOn && review.reviewOn <= today);
  let opened = 0;
  for (const review of due) {
    const tag = `${EVIDENCE_RULE_IDS.GRADE}:${review.id}`;
    if (hasMarker(draft.evidenceMarkers, tag)) continue;
    const ownerId = resolveLeader(draft);
    if (!ownerId) break;
    addMarker(draft.evidenceMarkers, tag);
    const task = delegationRecord(ctx, {
      personId: ownerId,
      title: `Grade the evidence review frozen on ${String(review.frozenAt).slice(0, 10)}`,
      expectedOutcome: `Open the review and grade it. Grading checks how many of the intervals the review froze still contain today's pooled estimates — a falsifiable test, not an opinion. ${review.cells.length} cell(s) were frozen; the review was due ${review.reviewOn}.`,
      support: `${EVIDENCE_RULE_IDS.GRADE} opened this because a review that is never graded is a prediction nobody kept. Coverage is not accuracy, so the mean absolute error is reported beside it.`,
      dueOn: dayKey(addDays(ctx.now, conventions.reviewDays)),
      tag,
    });
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift(task);
    opened += 1;
    effects.push(effect(EVIDENCE_RULE_IDS.GRADE, 'created', 'delegation', task.id,
      `Opened one grading task for a review due ${review.reviewOn} with ${review.cells.length} frozen cell(s).`));
  }
  return effects;
}

/* ---------------------------------------------------------------- the rule */

export function evidenceRule(draft, ctx = {}) {
  const { event, now = new Date(), out = [], logEvent } = ctx;
  if (!event || !draft) return [];
  const type = str(event.type);
  if (!Object.values(EVIDENCE_EVENTS).includes(type)) return [];

  const settings = { ...(ctx.settings || {}), ...(draft.settings || {}) };
  const report = evidenceReport(draft, now, settings);
  const conventions = report.conventions;
  // An explicit scan or a freeze is a request to catch up and is never
  // suppressed by the pause. Automatic work respects it.
  if (!conventions.autoPropagate && type !== EVIDENCE_EVENTS.SCAN && type !== EVIDENCE_EVENTS.FROZEN) return [];

  let effects = [];
  if (type === EVIDENCE_EVENTS.SCORED) {
    // A study was just scored: the evidence base changed, so replication
    // (EBM-02) and any newly-reliable harm finding (EBM-01) are written in
    // the same transaction as the score.
    effects.push(...replicationTasks(draft, ctx, report, conventions));
    effects.push(...harmDecisions(draft, ctx, report));
    effects.push(...explorationTasks(draft, ctx, report, conventions));
  } else {
    effects.push(...harmDecisions(draft, ctx, report));
    effects.push(...explorationTasks(draft, ctx, report, conventions));
    effects.push(...applyRecommendation(draft, ctx, report, conventions));
    effects.push(...reconcileAndGrade(draft, ctx, report, conventions));
  }

  for (const entry of effects) {
    if (typeof logEvent === 'function') {
      logEvent({
        type: 'automation.propagated',
        entity: 'evidence',
        entityId: entry.targetId || '',
        summary: entry.summary,
      });
    }
    out.push(entry);
  }
  return effects;
}

evidenceRule.id = 'evidence';
evidenceRule.label = 'Evidence terminal propagation (RULE-EBM-01..05)';
evidenceRule.module = 'evidenceRules.js';
evidenceRule.triggers = Object.values(EVIDENCE_EVENTS);
evidenceRule.effect = (draft, event, context = {}) => evidenceRule(draft, { ...context, event });
Object.freeze(evidenceRule);

export default evidenceRule;
