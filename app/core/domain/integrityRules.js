/**
 * app/core/domain/integrityRules.js — the Signal Integrity Board's four
 * post-commit rules (Schema v70, ADR-0061).
 *
 * RULE-INT-01  A look at the workspace is recorded, once per day, with the plan
 *              that was in force and the p values that look produced. It runs
 *              after the early-warning scan so the look it records is the look
 *              that scan just took.
 * RULE-INT-02  A human verdict re-scores its family. When the upper end of the
 *              Wilson interval for actionable precision falls below the
 *              declared floor, the family is named over-claiming: the newest
 *              ungraded review gets one appended challenge note (never a
 *              rewrite) and exactly one owned calibration task per family per
 *              ISO week is opened.
 * RULE-INT-03  When the error budget is being spent far ahead of the look plan,
 *              exactly ONE governed decision per ISO week is opened — the three
 *              honest options are to cut the number of looks, cut the number of
 *              series, or declare a larger alpha in writing.
 * RULE-INT-04  An explicit scan grades every review whose window has closed
 *              from the verdicts recorded inside it, opens exactly one
 *              blameless process task after a wide miss, and reconciles links
 *              left behind by deleted reviews.
 *
 * All four are marker-idempotent and write inside the caller's transaction.
 * None of them rates a person: a verdict is about a rule, and the ledger has no
 * place to put a name.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  INTEGRITY_EVENTS,
  INTEGRITY_RULE_IDS,
  LOOK_TRIGGERS,
  VERDICT_TRIGGERS,
} from './integrityRegistry.js';
import {
  buildLookLedger,
  collectVerdictObservations,
  effectiveTests,
  gradeIntegrityReview,
  integrityConventions,
  lookBoundary,
  scoreFamily,
} from './integrity.js';

function ownerOf(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  return people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId))) || null;
}

function addMarker(draft, tag) {
  draft.integrityMarkers = Array.isArray(draft.integrityMarkers) ? draft.integrityMarkers : [];
  if (draft.integrityMarkers.includes(tag)) return false;
  draft.integrityMarkers.push(tag);
  if (draft.integrityMarkers.length > 400) {
    draft.integrityMarkers.splice(0, draft.integrityMarkers.length - 400);
  }
  return true;
}

const seen = (draft, tag) => (draft.integrityMarkers || []).includes(tag);

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function link(draft, ctx, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(draft, {
    sourceType: 'integrityreview', sourceId, targetType, targetId, relation, ruleId, summary,
  }, {
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
    dueOn: dayKey(addDays(ctx.now, dueDays)),
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
    driver: ownerName.slice(0, 120),
    approver: ownerName.slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({
      id: ctx.idFactory('opt'), label: label.slice(0, 200), pros: pros.slice(0, 400), cons: cons.slice(0, 400),
    })),
    chosen: '',
    rationale: `Opened by ${ruleId}: ${rationale}`.slice(0, 2000),
    reviewOn: dayKey(addDays(ctx.now, 7)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/* ---------------------------------------------------------------- INT-01 */

/**
 * Record one look per day. The figures come from the alert ledger the scan in
 * this same transaction has just written, so the Board can never hold a look
 * that disagrees with the alerts the leader can see.
 */
function lookRule(draft, ctx) {
  const conventions = integrityConventions(ctx.settings || draft.settings || {});
  const isExplicitScan = ctx.event.type === INTEGRITY_EVENTS.SCAN;
  if (!conventions.autoPropagate && !isExplicitScan) return [];
  const today = dayKey(ctx.now) || ctx.event?.occurredOn || '';
  if (!today) return [];

  draft.integrityLooks = Array.isArray(draft.integrityLooks) ? draft.integrityLooks : [];
  if (draft.integrityLooks.some((row) => row && row.lookOn === today)) {
    return [effect(INTEGRITY_RULE_IDS.LOOK, 'skipped', 'look', today,
      'A look for this day is already recorded; the error budget is charged once per day.')];
  }

  const alerts = (draft.watchAlerts || []).filter((a) => a && a.detectedOn === today
    && typeof a.pValue === 'number' && Number.isFinite(a.pValue));
  const seriesTested = alerts.reduce((n, a) => Math.max(n, Number(a.m) || 0), 0);
  const row = {
    id: ctx.idFactory('ilook'),
    lookOn: today,
    recordedAt: ctx.now.toISOString(),
    source: 'scan',
    seriesTested,
    candidates: alerts.length,
    promoted: alerts.filter((a) => a.status !== 'suppressed').length,
    pValues: alerts.map((a) => Math.round(a.pValue * 1e6) / 1e6).slice(0, 24),
    alphaPctAtLook: conventions.alphaPct,
    plannedLooksAtLook: conventions.plannedLooks,
    spendingAtLook: conventions.spending,
    note: isExplicitScan
      ? 'Recorded by the leader’s explicit integrity scan.'
      : 'Recorded after the early-warning scan in the same transaction.',
  };
  draft.integrityLooks.push(row);
  if (draft.integrityLooks.length > conventions.lookCap) {
    draft.integrityLooks.splice(0, draft.integrityLooks.length - conventions.lookCap);
  }

  const out = [effect(INTEGRITY_RULE_IDS.LOOK, 'created', 'look', row.id,
    `Recorded look ${draft.integrityLooks.length} on ${today}: ${seriesTested || 'no'} series tested, `
    + `${row.candidates} candidate(s), ${row.promoted} promoted, plan α ${conventions.alphaPct}% over `
    + `${conventions.plannedLooks} ${conventions.spending} looks`)];
  return out;
}

/* ---------------------------------------------------------------- INT-02 */

/**
 * A verdict changes what the workspace knows about a detector. When the family
 * it belongs to is measurably over-claiming, the newest ungraded review gets a
 * challenge note and one owned calibration task is opened per family per week.
 */
function verdictRule(draft, ctx) {
  const conventions = integrityConventions(ctx.settings || draft.settings || {});
  if (!conventions.autoPropagate) return [];
  const type = ctx.event.type;
  if (!VERDICT_TRIGGERS.includes(type)) return [];

  let domain = 'Early warning';
  if (type === 'integrity.verdict') {
    const row = (draft.signalVerdicts || []).find((v) => v && v.id === ctx.event.entityId);
    domain = row ? row.domain : '';
  }
  if (!domain) return [];
  if (domain === 'Signal integrity') return [];

  const observations = collectVerdictObservations(draft);
  const score = scoreFamily(domain, observations, conventions);
  const effects = [];

  if (score.status !== 'over-claiming') {
    return [effect(INTEGRITY_RULE_IDS.VERDICT, 'scored', 'family', domain,
      `${domain}: ${score.n} verdict(s), status ${score.status}.`)];
  }

  const openReview = (draft.integrityReviews || [])
    .filter((r) => r && !r.graded)
    .sort((a, b) => (a.frozenAt < b.frozenAt ? 1 : -1))[0];
  const noteTag = `${INTEGRITY_RULE_IDS.VERDICT}:note:${domain}`;
  if (openReview && !seen(draft, noteTag)) {
    addMarker(draft, noteTag);
    openReview.challengeNotes = Array.isArray(openReview.challengeNotes) ? openReview.challengeNotes : [];
    openReview.challengeNotes.push(`Challenged ${dayKey(ctx.now)}: ${domain} is measured over-claiming `
      + `(actionable precision ${Math.round((score.actionable.p || 0) * 100)}%, Wilson 95% `
      + `${Math.round((score.actionable.lo || 0) * 100)}–${Math.round((score.actionable.hi || 0) * 100)}%, `
      + `n=${score.n}) against the ${conventions.precisionFloorPct}% floor. The frozen figures stand as history. [${noteTag}]`);
    if (openReview.challengeNotes.length > 8) {
      openReview.challengeNotes.splice(0, openReview.challengeNotes.length - 8);
    }
    effects.push(effect(INTEGRITY_RULE_IDS.VERDICT, 'challenged', 'integrityreview', openReview.id,
      `Appended a precision challenge to the frozen review for ${domain}; no figure was rewritten.`));
  }

  const owner = ownerOf(draft);
  if (!owner) return effects;
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  const taskTag = `${INTEGRITY_RULE_IDS.VERDICT}:task:${domain}:${week}`;
  if (seen(draft, taskTag)) return effects;
  addMarker(draft, taskTag);
  const task = newTask(
    ctx,
    owner.id,
    `Re-tune or retire the “${domain}” signal family`,
    `Measured actionable precision for ${domain} is ${Math.round((score.actionable.p || 0) * 100)}% `
    + `(Wilson 95% ${Math.round((score.actionable.lo || 0) * 100)}–${Math.round((score.actionable.hi || 0) * 100)}%, `
    + `n=${score.n}) against a declared floor of ${conventions.precisionFloorPct}%. Decide one of three things and write it down: `
    + 'raise the rule’s threshold so it fires less, narrow the population it applies to, or retire the rule and say so. '
    + 'Deleting the finding is not one of the three.',
    `Over-claiming evidence: ${score.counts.confirmed} confirmed, ${score.counts.explained} explained, `
    + `${score.counts.dismissed} not worth acting on, ${score.counts['false-alarm']} false alarm(s). `
    + `The upper end of the interval is below the floor, so this is a conclusion the sample supports rather than a `
    + 'reaction to one bad verdict. The rule never rates a person and never changes a finding by itself.',
    INTEGRITY_RULE_IDS.VERDICT,
  );
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift(task);
  effects.push(effect(INTEGRITY_RULE_IDS.VERDICT, 'created', 'delegation', task.id,
    `Opened one owned calibration task for the over-claiming family “${domain}”.`));
  if (openReview && link(draft, ctx, openReview.id, 'delegation', task.id, 'tracks-followup',
    INTEGRITY_RULE_IDS.VERDICT, 'Frozen review tracks the calibration work it forced')) {
    effects.push(effect(INTEGRITY_RULE_IDS.VERDICT, 'linked', 'delegation', task.id,
      'Linked the challenged review to the calibration task.'));
  }
  return effects;
}

/* ---------------------------------------------------------------- INT-03 */

/**
 * Spend discipline. Print the arithmetic; open one decision, not a nag.
 */
function budgetRule(draft, ctx) {
  const conventions = integrityConventions(ctx.settings || draft.settings || {});
  if (!conventions.autoPropagate) return [];
  const type = ctx.event.type;
  if (!LOOK_TRIGGERS.includes(type) && type !== INTEGRITY_EVENTS.VERDICT) return [];

  const ledger = buildLookLedger(draft, ctx.now, ctx.settings || draft.settings || {});
  const used = ledger.length;
  if (!used) return [];
  const seriesTested = Math.max(...ledger.map((l) => l.seriesTested || 0));
  const mEff = effectiveTests(seriesTested || 0, conventions.rho);
  const spend = lookBoundary({
    spending: conventions.spending,
    alpha: conventions.alpha,
    plannedLooks: conventions.plannedLooks,
    lookIndex: Math.min(used, conventions.plannedLooks),
    mEff,
  }).cumulativeAlpha;
  const spendPct = conventions.alpha > 0 ? (spend / conventions.alpha) * 100 : 0;
  const lookPct = (used / conventions.plannedLooks) * 100;
  // The pace is a decision only when the budget is nearly gone AND the plan is
  // not: "80% spent with a fifth of the looks still to run" is a choice about
  // monitoring, whereas "80% spent on the last look" is just the plan working.
  const remainingLookPct = 100 - lookPct;
  if (!(spendPct >= conventions.spendWarnPct && remainingLookPct >= conventions.looksWarnPct)) return [];

  const owner = ownerOf(draft);
  if (!owner) return [];
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  const tag = `${INTEGRITY_RULE_IDS.BUDGET}:${week}`;
  if (seen(draft, tag)) return [];
  addMarker(draft, tag);

  const decision = newDecision(
    ctx,
    owner.name || draft.settings?.leaderName || '',
    'The alerting programme is spending its error budget far ahead of plan',
    `${Math.round(spendPct)}% of a declared ${conventions.alphaPct}% family-wise error budget has been spent after `
    + `${used} of the ${conventions.plannedLooks} planned looks, leaving ${Math.round(remainingLookPct)}% of the plan `
    + `still to run (${seriesTested || 'no'} series tested per look at a declared ρ of ${conventions.rhoPct}%). `
    + 'At this rate every further look has to clear a stricter bar than the one before it, and by the end of the '
    + 'quarter no findable signal will clear it at all. Choose one: fewer looks per week, fewer series under '
    + `surveillance, or a larger declared α written down where the next reader can see it.`,
    `Spending-function arithmetic: α*(t) with the ${conventions.spending === 'pocock' ? 'Pocock-like' : 'O’Brien–Fleming-like'} `
    + `function at t = ${(used / conventions.plannedLooks).toFixed(4)} gives ${(spend * 100).toFixed(2)}% cumulative. `
    + 'The warning fires when at least '
    + `${conventions.spendWarnPct}% of the budget is gone while at least ${conventions.looksWarnPct}% of the planned `
    + 'looks are still to run — a pace that makes the remaining looks stricter than the ones already taken. '
    + 'The board does not choose; a monitoring plan is a leadership decision with a cost either way.',
    [
      ['Halve the look frequency (weekly → fortnightly) and keep α where it is', 'Restores the per-look bar to something reachable.', 'A real change can now sit unseen for an extra week.'],
      ['Keep the looks and cut the monitored series', 'Fewer tests per look means a lower multiplicity charge.', 'A series you stop watching is a blind spot you have chosen.'],
      [`Raise the declared α above ${conventions.alphaPct}%`, 'Every look becomes easier to clear, immediately.', 'The suite will produce more false alarms in expectation, and the precision ledger will show it.'],
      ['Stop monitoring and go back to manual review', 'Spends no error budget at all.', 'The reason the watch exists does not go away.'],
    ],
    INTEGRITY_RULE_IDS.BUDGET,
  );
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.unshift(decision);
  const effects = [effect(INTEGRITY_RULE_IDS.BUDGET, 'created', 'decision', decision.id,
    `Opened one governed decision: ${Math.round(spendPct)}% of the error budget spent in ${Math.round(lookPct)}% of the plan.`)];
  // A link must point at a record that exists. When no review is open there is
  // nothing to attach the decision to, and inventing a node id would create a
  // dangling edge that every later scan would have to clean up.
  const attachTo = (draft.integrityReviews || [])
    .filter((r) => r && !r.graded)
    .sort((a, b) => (a.frozenAt < b.frozenAt ? 1 : -1))[0];
  if (attachTo && link(draft, ctx, attachTo.id, 'decision', decision.id, 'audits-programme',
    INTEGRITY_RULE_IDS.BUDGET, 'Monitoring-plan decision opened by the error-budget governor')) {
    effects.push(effect(INTEGRITY_RULE_IDS.BUDGET, 'linked', 'decision', decision.id,
      'Linked the budget decision to the review whose plan it concerns.'));
  }
  return effects;
}

/* ---------------------------------------------------------------- INT-04 */

/**
 * Grade the frozen reviews whose windows have closed, from the verdicts inside
 * them, and open one blameless process task after a wide miss. Also reconciles
 * links to reviews that no longer exist.
 */
function gradeRule(draft, ctx) {
  const conventions = integrityConventions(ctx.settings || draft.settings || {});
  if (!conventions.autoPropagate && ctx.event.type !== INTEGRITY_EVENTS.SCAN) return [];
  const today = dayKey(ctx.now);
  const effects = [];

  draft.integrityReviews = Array.isArray(draft.integrityReviews) ? draft.integrityReviews : [];
  for (const review of draft.integrityReviews) {
    if (!review || review.graded || review.reviewOn > today) continue;
    const grade = gradeIntegrityReview(review, draft, ctx.now);
    if (!grade) {
      effects.push(effect(INTEGRITY_RULE_IDS.GRADE, 'withheld', 'integrityreview', review.id,
        'The review window closed with no verdicts recorded inside it; the forecast stays ungraded rather than guessed.'));
      continue;
    }
    review.graded = grade;
    effects.push(effect(INTEGRITY_RULE_IDS.GRADE, 'graded', 'integrityreview', review.id,
      `Graded ${review.label || review.id}: predicted ${review.predictedAnyFalseAlarmPct}% chance of a false alarm, `
      + `observed ${grade.anyFalse ? 'at least one' : 'none'} in ${grade.scored} verdict(s); Brier ${grade.brier}.`));

    if (grade.brier >= conventions.surpriseBrier) {
      const owner = ownerOf(draft);
      const tag = `${INTEGRITY_RULE_IDS.GRADE}:task:${review.id}`;
      if (owner && !seen(draft, tag)) {
        addMarker(draft, tag);
        const task = newTask(
          ctx,
          owner.id,
          'The signal suite missed its own forecast by a wide margin — review the process, not the people',
          `The frozen signal-integrity review of ${String(review.frozenAt).slice(0, 10)} said there was a `
          + `${review.predictedAnyFalseAlarmPct}% chance of at least one false alarm among the next `
          + `${review.horizonAlerts} signals. ${grade.anyFalse ? 'At least one false alarm was recorded' : 'No false alarm was recorded'} `
          + `across ${grade.scored} verdict(s), a Brier score of ${grade.brier} against the ${conventions.surpriseBrier} threshold. `
          + 'Write down what the board was blind to — the threshold it applied, the family it trusted, or the verdicts it never collected.',
          'This is a process finding about the detector suite. It is never evidence about a colleague, and the task is '
          + 'closed by a written process change, not by a conversation with someone about their performance.',
          INTEGRITY_RULE_IDS.GRADE,
        );
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        draft.delegations.unshift(task);
        effects.push(effect(INTEGRITY_RULE_IDS.GRADE, 'created', 'delegation', task.id,
          'Opened one blameless process task after a graded integrity surprise.'));
        if (link(draft, ctx, review.id, 'delegation', task.id, 'tracks-followup', INTEGRITY_RULE_IDS.GRADE,
          'Graded review opened the blameless process task')) {
          effects.push(effect(INTEGRITY_RULE_IDS.GRADE, 'linked', 'delegation', task.id,
            'Linked the graded review to the process task it opened.'));
        }
      }
    }
  }

  // Reconcile edges whose review no longer exists.
  const ids = new Set(draft.integrityReviews.map((r) => r && r.id).filter(Boolean));
  if (Array.isArray(draft.links)) {
    const before = draft.links.length;
    draft.links = draft.links.filter((l) => l && !((l.sourceType === 'integrityreview'
      && !ids.has(l.sourceId)) || (l.targetType === 'integrityreview' && !ids.has(l.targetId))));
    const removed = before - draft.links.length;
    if (removed > 0) {
      effects.push(effect(INTEGRITY_RULE_IDS.GRADE, 'reconciled', 'links', '',
        `Removed ${removed} edge(s) to reviews that no longer exist.`));
    }
  }

  return effects;
}

/* ---------------------------------------------------------------- engine */

export { INTEGRITY_EVENTS, INTEGRITY_RULE_IDS };

export function integrityRule(draft, ctx = {}) {
  if (!draft || !ctx.event || typeof ctx.event.type !== 'string') return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const scoped = { ...ctx, now };
  let effects = [];
  const type = ctx.event.type;
  if (LOOK_TRIGGERS.includes(type)) {
    effects = effects.concat(lookRule(draft, scoped));
  }
  if (LOOK_TRIGGERS.includes(type) || type === INTEGRITY_EVENTS.VERDICT) {
    effects = effects.concat(budgetRule(draft, scoped));
  }
  if (VERDICT_TRIGGERS.includes(type)) {
    effects = effects.concat(verdictRule(draft, scoped));
  }
  if (type === INTEGRITY_EVENTS.SCAN) {
    effects = effects.concat(gradeRule(draft, scoped));
  }
  for (const entry of effects) {
    if (typeof ctx.logEvent === 'function') {
      ctx.logEvent({
        type: 'automation.propagated',
        entity: 'integrityreview',
        entityId: entry.targetId || '',
        summary: entry.summary,
      });
    }
    if (Array.isArray(ctx.out)) ctx.out.push(entry);
  }
  return effects;
}

integrityRule.id = 'integrity';
integrityRule.label = 'Signal integrity & error budget (RULE-INT-01..04)';
integrityRule.module = 'integrityRules.js';
integrityRule.triggers = [
  ...LOOK_TRIGGERS,
  ...VERDICT_TRIGGERS,
  INTEGRITY_EVENTS.SCAN,
];
integrityRule.effect = (draft, event, context = {}) => integrityRule(draft, { ...context, event });
Object.freeze(integrityRule);
