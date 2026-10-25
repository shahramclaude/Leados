/**
 * app/core/domain/insights.js — the recommendation engine.
 *
 * Every finding is derived from records the leader entered. Nothing is
 * templated from a demo, nothing is invented to fill space. Each one carries:
 *   - a stable rule id, so the same finding is recognisable across sessions
 *   - the evidence lines that produced it (the "why")
 *   - an explicit severity and confidence
 *   - a single next action with a destination in the app
 *
 * Severity (5 = act today):
 *   5  A person may be harmed or a commitment is already broken
 *   4  A relationship or delivery is degrading right now
 *   3  A known problem is drifting without an owner
 *   2  Hygiene: the record is incomplete, so the app cannot see the truth
 *   1  Informational
 */

import { daysBetween, daysSince, isOverdue, round } from '../time.js';
import { cadence, isLeaderOwned, openActions } from './oneonone.js';
import { followUpsDue, personFeedbackStats } from './feedback.js';
import { activeGoals, checkinStale, goalHealth, goalsFor, lastCheckin } from './goals.js';
import { authorityFor, delegationHealth } from './delegations.js';
import { activePlan, growCompleteness, openWillActions, planProgress, reviewState, stagnationDays } from './growth.js';
import { aggregate } from './pulse.js';
import { assess, readinessFor, successionGaps } from './readiness.js';
import { openDecisions, reviewsDue } from './decisions.js';
import { conflictSummary } from './conflicts.js';
import { isNewJoiner, tenureDays } from './people.js';
import { activeOnboarding, onboardingFor, onboardingHealth } from './onboarding.js';

const CONF_WEIGHT = { high: 3, medium: 2, low: 1 };
const SEVERITY_LABEL = { 1: 'Info', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Urgent' };

export const DOMAIN_ORDER = [
  'People',
  'Conversations',
  'Feedback',
  'Goals',
  'Delegation',
  'Growth',
  'Wellbeing',
  'Decisions',
  'Conflict resolution',
  'Recognition',
  'Succession',
];

export function severityLabel(n) {
  return SEVERITY_LABEL[n] || 'Info';
}

function personRoute(personId) {
  return `#/people/${personId}`;
}

export function priorityOf(finding) {
  return finding.severity * 10 + (CONF_WEIGHT[finding.confidence] || 0);
}

/**
 * @returns {{
 *   findings: Array<object>,
 *   wins: Array<{title:string,detail:string}>,
 *   counts: Record<string, number>,
 *   byDomain: Array<{domain:string,count:number,maxSeverity:number}>,
 *   urgent: Array<object>
 * }}
 */
export function buildInsights(state, now) {
  const settings = state.settings;
  const findings = [];
  const reviewedGoalIds = new Set();
  const people = state.people.filter((p) => p.status !== 'archived');

  const add = (finding) => {
    findings.push({
      confidence: 'high',
      personId: null,
      personName: null,
      evidence: [],
      ...finding,
      priority: 0,
    });
  };

  if (!people.length) {
    add({
      ruleId: 'SETUP-01',
      domain: 'People',
      title: 'Add the people you lead',
      detail: 'Every score in this app is computed from your records. With no roster there is nothing to measure — and nothing to be honest about.',
      severity: 1,
      confidence: 'high',
      evidence: ['No active team members in the roster'],
      action: { label: 'Add your first person', route: '#/people' },
    });
  }

  for (const person of people) {
    const cad = cadence(state, person.id, now, settings);
    const tenure = tenureDays(person, now);
    const name = person.name;

    // --- Conversations -----------------------------------------------------
    if (cad.status === 'never' && cad.skippedStreak < 2 && (tenure === null || tenure > 14)) {
      add({
        ruleId: 'CONV-01',
        domain: 'Conversations',
        title: `No 1:1 has ever been logged with ${name}`,
        detail: 'A recurring 1:1 is the single highest-leverage habit in management: it is where problems surface before they become resignations.',
        severity: 4,
        confidence: 'high',
        personId: person.id,
        personName: name,
        evidence: [tenure === null ? 'No start date recorded' : `Joined ${tenure} days ago`, 'Zero 1:1 records'],
        action: { label: 'Log the first 1:1', route: personRoute(person.id) },
      });
    } else if (cad.status === 'overdue') {
      add({
        ruleId: 'CONV-02',
        domain: 'Conversations',
        title: `${name}: 1:1 is ${cad.overdueDays} days overdue`,
        detail: `Last held ${cad.daysSinceHeld} days ago against a ${cad.expectedDays}-day cadence. Overdue conversations are where small irritations become decisions made without you.`,
        severity: cad.overdueDays > cad.expectedDays * 2 ? 5 : 4,
        confidence: 'high',
        personId: person.id,
        personName: name,
        evidence: [
          `Last held: ${cad.lastHeldDate} (${cad.daysSinceHeld} days ago)`,
          `Cadence: every ${cad.expectedDays} days`,
          cad.skippedStreak ? `${cad.skippedStreak} most recent meeting(s) skipped or moved` : 'No recent skips',
        ],
        action: { label: 'Schedule or log it', route: personRoute(person.id) },
      });
    } else if (cad.status === 'due') {
      add({
        ruleId: 'CONV-03',
        domain: 'Conversations',
        title: `${name}: 1:1 due now`,
        detail: `It has been ${cad.daysSinceHeld} days since the last one; your cadence is ${cad.expectedDays}.`,
        severity: 2,
        confidence: 'high',
        personId: person.id,
        personName: name,
        evidence: [`Last held: ${cad.lastHeldDate}`],
        action: { label: 'Open the agenda', route: personRoute(person.id) },
      });
    }

    if (cad.skippedStreak >= 2) {
      add({
        ruleId: 'CONV-04',
        domain: 'Conversations',
        title: `${name}: last ${cad.skippedStreak} 1:1s were moved or skipped`,
        detail: 'Two reschedules in a row usually means the meeting has no agenda worth protecting. Fix the agenda, not the calendar.',
        severity: 4,
        confidence: 'high',
        personId: person.id,
        personName: name,
        evidence: [`Adherence: ${cad.heldLast4} of the last ${cad.scheduledLast4} kept`],
        action: { label: 'Rebuild the agenda', route: personRoute(person.id) },
      });
    }

    // --- Feedback ----------------------------------------------------------
    const fb = personFeedbackStats(state, person.id, now, settings);
    if (fb.givenCount === 0 && (tenure === null || tenure > 21)) {
      add({
        ruleId: 'FB-01',
        domain: 'Feedback',
        title: `${name}: no feedback has ever been recorded`,
        detail: 'People calibrate on whatever signal they receive. If none is recorded, the most likely signal is silence — which reads as either approval or indifference.',
        severity: 4,
        confidence: 'high',
        personId: person.id,
        personName: name,
        evidence: ['Zero feedback items', tenure === null ? 'Tenure unknown' : `Tenure ${tenure} days`],
        action: { label: 'Write one specific note', route: `#/feedback?person=${person.id}` },
      });
    } else if (fb.isStale) {
      add({
        ruleId: 'FB-02',
        domain: 'Feedback',
        title: `${name}: no feedback in ${fb.daysSinceGiven} days`,
        detail: `Your target is every ${settings.feedbackTargetDays} days. Feedback that arrives only at review time is performance management, not development.`,
        severity: 3,
        confidence: 'high',
        personId: person.id,
        personName: name,
        evidence: [`Last feedback: ${fb.lastGivenDate}`, `${fb.givenCount} item(s) on record`],
        action: { label: 'Record feedback', route: `#/feedback?person=${person.id}` },
      });
    }

    if (fb.balance === 'praise-only') {
      add({
        ruleId: 'FB-03',
        domain: 'Feedback',
        title: `${name}: ${fb.praise} praise items, zero constructive ones`,
        detail: 'Kim Scott calls this ruinous empathy: it feels kind, but it withholds the information the person needs to improve. One specific constructive note is worth more than four compliments.',
        severity: 2,
        confidence: 'medium',
        personId: person.id,
        personName: name,
        evidence: [`Praise: ${fb.praise}`, 'Constructive: 0', 'Window: 90 days'],
        action: { label: 'Add a constructive note', route: `#/feedback?person=${person.id}` },
      });
    }

    if (fb.balance === 'constructive-only') {
      add({
        ruleId: 'FB-04',
        domain: 'Feedback',
        title: `${name}: only criticism on record`,
        detail: 'Feedback that never names what went well erodes trust and makes the next corrective note harder to hear.',
        severity: 3,
        confidence: 'medium',
        personId: person.id,
        personName: name,
        evidence: [`Constructive: ${fb.constructive}`, 'Praise: 0', 'Window: 90 days'],
        action: { label: 'Name something specific that worked', route: `#/feedback?person=${person.id}` },
      });
    }

    if (fb.delayedLatency > 0) {
      add({
        ruleId: 'FB-06',
        domain: 'Feedback',
        title: `${name}: ${fb.delayedLatency} feedback conversation${fb.delayedLatency === 1 ? '' : 's'} exceeded the ${fb.latencyTargetDays}d latency convention`,
        detail: 'The behavior was observed well before it was discussed. Use the original date to reconstruct a specific example, then agree how soon useful feedback should happen on this team. The threshold is a configurable convention, not a universal score.',
        severity: fb.maxLatency > fb.latencyTargetDays * 2 ? 3 : 2,
        confidence: 'high',
        personId: person.id,
        personName: name,
        evidence: [
          `${fb.delayedLatency} measured item(s) beyond ${fb.latencyTargetDays} days in the 90-day window`,
          `Longest measured observation-to-conversation gap: ${fb.maxLatency} days`,
          `${fb.latencySamples} measured; ${fb.unmeasuredLatency} unknown excluded from the average`,
        ],
        action: { label: 'Review delayed feedback', route: `#/feedback?person=${person.id}&filter=latency` },
      });
    }

    // --- Goals -------------------------------------------------------------
    const personGoals = goalsFor(state, person.id).filter((g) => g.status === 'active');
    for (const goal of personGoals) {
      reviewedGoalIds.add(goal.id);
      const health = goalHealth(goal, now);
      if (health.status === 'behind' || health.status === 'overdue') {
        add({
          ruleId: 'GOAL-01',
          domain: 'Goals',
          title: `"${goal.title}" is ${health.status === 'overdue' ? 'past its due date' : 'behind pace'}`,
          detail: `Progress is ${health.progressPct ?? 0}% against ${health.expectedPct ?? 100}% expected at this point${health.daysLeft !== null ? `, with ${health.daysLeft} days remaining` : ''}. For ${name}, this is the conversation that matters before the deadline, not after it.`,
          severity: health.status === 'overdue' ? 5 : 4,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: [
            `Progress ${health.progressPct ?? 0}% vs expected ${health.expectedPct ?? 100}%`,
            health.gap === null ? 'No due date set' : `Gap ${health.gap} points`,
            goal.dueDate ? `Due ${goal.dueDate}` : 'No due date',
          ],
          action: { label: 'Review and re-plan', route: `#/goals?goal=${goal.id}` },
        });
      } else if (goal.confidence !== 'on-track' && health.status !== 'no-kr') {
        add({
          ruleId: 'GOAL-02',
          domain: 'Goals',
          title: `"${goal.title}" is flagged ${goal.confidence.replace('-', ' ')}`,
          detail: `The numbers still look survivable, but whoever owns this goal says it is ${goal.confidence.replace('-', ' ')}. Trust the human signal and ask what changed.`,
          severity: 3,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: [`Stated confidence: ${goal.confidence}`, `Computed pace: ${health.status}`],
          action: { label: 'Ask about it in the 1:1', route: `#/goals?goal=${goal.id}` },
        });
      }

      const stale = checkinStale(goal, now, settings);
      if (stale.stale) {
        add({
          ruleId: 'GOAL-03',
          domain: 'Goals',
          title: `"${goal.title}" has no check-in ${stale.never ? 'ever' : `in ${stale.days} days`}`,
          detail: `A goal without a check-in is a wish with a deadline. Your check-in cadence is every ${settings.goalCheckinDays} days.`,
          severity: 2,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: [stale.never ? 'No check-ins recorded' : `Last check-in ${stale.days} days ago`],
          action: { label: 'Check in on it', route: `#/goals?goal=${goal.id}` },
        });
      }

      if (!goal.keyResults.length) {
        add({
          ruleId: 'GOAL-04',
          domain: 'Goals',
          title: `"${goal.title}" has no key results`,
          detail: 'Without a measurable result, progress can only be asserted, not observed. Even one number makes the goal reviewable.',
          severity: 2,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: ['0 key results'],
          action: { label: 'Add a measurable result', route: `#/goals?goal=${goal.id}` },
        });
      }
      if (goal.coAuthored === false) {
        add({
          ruleId: 'GOAL-06',
          domain: 'Goals',
          title: `"${goal.title}" is marked leader-set for ${name}`,
          detail: 'The record explicitly says the owner did not help shape this objective. Test understanding and ownership in the next conversation; do not assume every leader-set goal is wrong, and do not infer authorship when the field is unknown.',
          severity: 2,
          confidence: 'medium',
          personId: person.id,
          personName: name,
          evidence: ['Authorship: explicitly leader-set', `Owner: ${name}`],
          action: { label: 'Review or correct authorship', route: `#/goals?goal=${goal.id}` },
        });
      }
    }

    if (!personGoals.length && (tenure === null || tenure > (settings.onboardingDays ?? 90))) {
      add({
        ruleId: 'GOAL-05',
        domain: 'Goals',
        title: `${name} has no active goal`,
        detail: 'Clarity about the single most important outcome is the strongest predictor of engagement a manager can control. This person does not have one recorded.',
        severity: 2,
        confidence: 'medium',
        personId: person.id,
        personName: name,
        evidence: ['No active goals'],
        action: { label: 'Set one goal together', route: `#/goals?person=${person.id}` },
      });
    }

    // --- Growth ------------------------------------------------------------
    const plan = activePlan(state, person.id);
    if (!plan && (tenure === null || tenure > (settings.onboardingDays ?? 90))) {
      add({
        ruleId: 'GROW-01',
        domain: 'Growth',
        title: `${name} has no development plan`,
        detail: 'A GROW plan turns "you should get better at X" into a dated commitment. Without one, career conversations become annual and abstract.',
        severity: 2,
        confidence: 'medium',
        personId: person.id,
        personName: name,
        evidence: ['No active growth plan'],
        action: { label: 'Start a GROW plan', route: `#/growth?person=${person.id}` },
      });
    }
    if (plan) {
      const completeness = growCompleteness(plan);
      const review = reviewState(plan, now);
      const progress = planProgress(plan, now);
      if (!plan.will?.length) {
        add({
          ruleId: 'GROW-02',
          domain: 'Growth',
          title: `${name}'s growth plan has no committed action`,
          detail: 'Goal and options without a dated "will" is a conversation that felt good and changed nothing.',
          severity: 3,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: [`GROW completeness ${completeness.percent}%`, '0 actions with a due date'],
          action: { label: 'Add one dated action', route: `#/growth?person=${person.id}` },
        });
      }
      if (review.state === 'overdue') {
        add({
          ruleId: 'GROW-03',
          domain: 'Growth',
          title: `${name}'s growth plan review is ${Math.abs(review.daysUntil ?? 0)} days overdue`,
          detail: 'An unreviewed development plan quietly teaches the person that development is not a priority here.',
          severity: 3,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: [`Review date: ${plan.reviewOn}`, `Completed actions: ${progress.done}/${progress.total}`],
          action: { label: 'Hold the review', route: `#/growth?person=${person.id}` },
        });
      } else if (review.state === 'none') {
        add({
          ruleId: 'GROW-04',
          domain: 'Growth',
          title: `${name}'s growth plan has no review date`,
          detail: 'Plans without a review date expire silently.',
          severity: 2,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: ['No review date'],
          action: { label: 'Set a review date', route: `#/growth?person=${person.id}` },
        });
      }
      // A development commitment that has already been moved twice is stuck,
      // not busy — the same rule the 1:1 ledger uses (CONV-06).
      const stuckWill = openWillActions(plan, now).filter((action) => action.carryCount >= 2);
      if (stuckWill.length) {
        add({
          ruleId: 'GROW-06',
          domain: 'Growth',
          title: `${name} has ${stuckWill.length === 1 ? 'a development commitment' : `${stuckWill.length} development commitments`} carried forward two or more times`,
          detail: 'Development work that keeps moving between reviews is usually too big, unsupported, or no longer what the person needs. Re-scope it, get them help, or drop it explicitly — repeating it is not progress.',
          severity: 3,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: stuckWill.slice(0, 3).map((a) => `"${a.text}" — carried ${a.carryCount}× since ${a.firstAgreedOn}`),
          action: { label: 'Resolve it in the review', route: `#/growth?person=${person.id}` },
        });
      }
      // A review date that keeps sliding without a review being held is the
      // cheapest way to look like a plan is being managed.
      if (review.deferrals >= 2) {
        add({
          ruleId: 'GROW-07',
          domain: 'Growth',
          title: `${name}'s development review date has been moved ${review.deferrals} times without being held`,
          detail: 'Moving the review is not reviewing. Either hold the conversation — twenty minutes is enough — or say plainly that development is not happening this quarter.',
          severity: 3,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: [
            `Review moved ${review.deferrals}×${plan.reviewMovedOn ? `, last on ${plan.reviewMovedOn}` : ''}`,
            review.lastReviewedOn ? `Last held review: ${review.lastReviewedOn}` : 'No review has ever been recorded',
          ],
          action: { label: 'Hold the review', route: `#/growth?person=${person.id}` },
        });
      }
      const stagnant = stagnationDays(plan, now);
      if (stagnant !== null && stagnant > 30 && progress.total > 0) {
        add({
          ruleId: 'GROW-05',
          domain: 'Growth',
          title: `${name}'s development has been still for ${stagnant} days`,
          detail: 'No development action has been completed in over a month while the plan is still open.',
          severity: 2,
          confidence: 'medium',
          personId: person.id,
          personName: name,
          evidence: [`${progress.done} of ${progress.total} actions done`, `Plan created ${daysBetween(plan.createdAt, now)} days ago`],
          action: { label: 'Unblock the next action', route: `#/growth?person=${person.id}` },
        });
      }
    }

    // --- Onboarding --------------------------------------------------------
    const personOnboardingPlans = onboardingFor(state, person.id);
    const activeOnbPlan = activeOnboarding(state, person.id);
    if (isNewJoiner(person, now, settings)) {
      const held = state.oneOnOnes.filter((m) => m.personId === person.id && m.status === 'held').length;
      if (held < 2) {
        add({
          ruleId: 'ONB-01',
          domain: 'People',
          title: `${name} is ${tenure} days into the role with ${held} logged 1:1(s)`,
          detail: 'The first 90 days decide whether someone learns the unwritten rules of the team or quietly guesses at them. Weekly is the standard, not a stretch goal.',
          severity: 4,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: [`Start date: ${person.startDate}`, `${held} held 1:1(s)`, `Onboarding window: ${settings.onboardingDays} days`],
          action: { label: 'Set up the onboarding 1:1', route: personRoute(person.id) },
        });
      }
      if (!personOnboardingPlans.some((p) => p.status === 'active' || p.status === 'completed')) {
        add({
          ruleId: 'ONB-02',
          domain: 'People',
          title: `${name} is ${tenure} days in with no 30-60-90 onboarding plan`,
          detail: 'Goal and growth-plan reminders wait until onboarding ends, so without explicit 30/60/90 checkpoints the first three months run on memory. Set role clarity, a peer buddy, stakeholder introductions and a scoped early win.',
          severity: tenure > 14 ? 4 : 3,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: [`Start date: ${person.startDate} (day ${tenure})`, 'No 30-60-90 onboarding plan on record', `Onboarding window: ${settings.onboardingDays} days`],
          action: { label: 'Start 30-60-90 plan', route: `#/onboarding?person=${encodeURIComponent(person.id)}` },
        });
      }
    }

    if (activeOnbPlan) {
      const onbHealth = onboardingHealth(activeOnbPlan, state, now, settings);
      const onbRoute = `#/onboarding?person=${encodeURIComponent(person.id)}`;
      if (onbHealth.scaffoldingGaps.length > 0) {
        const gapTitle = onbHealth.scaffoldingGaps.length === 1
          ? onbHealth.scaffoldingGaps[0].shortLabel
          : `${onbHealth.scaffoldingGaps.length} scaffolding basics`;
        add({
          ruleId: 'ONB-03',
          domain: 'People',
          title: `${name}'s onboarding plan is missing ${gapTitle}`,
          detail: 'Proactive socialization depends on written role clarity, an assigned peer buddy, deliberate stakeholder introductions and a scoped early win — none of which form reliably by osmosis.',
          severity: (onbHealth.dayNumber ?? 0) > 30 ? 4 : 3,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: onbHealth.scaffoldingGaps.map((g) => g.evidence),
          action: { label: 'Complete onboarding setup', route: onbRoute },
        });
      }

      if (onbHealth.overdueReviews.length > 0 || onbHealth.checkpointStats.overdue > 0) {
        const overdueParts = [];
        if (onbHealth.overdueReviews.length) {
          overdueParts.push(`Day ${onbHealth.overdueReviews.map((r) => r.horizon).join('/')} check-in`);
        }
        if (onbHealth.checkpointStats.overdue > 0) {
          overdueParts.push(`${onbHealth.checkpointStats.overdue} checkpoint${onbHealth.checkpointStats.overdue === 1 ? '' : 's'}`);
        }
        const evidenceLines = [
          ...onbHealth.overdueReviews.map((r) => `Day ${r.horizon} check-in due ${r.dueOn}`),
          ...onbHealth.checkpointStats.items
            .filter((cp) => cp.overdue)
            .slice(0, 3)
            .map((cp) => `Overdue (Day ${cp.horizon}, due ${cp.due}): "${cp.title}"`),
        ];
        add({
          ruleId: 'ONB-04',
          domain: 'People',
          title: `${name}: ${overdueParts.join(' and ')} overdue in 30-60-90 onboarding`,
          detail: '30-60-90 checkpoints exist so unstated assumptions and hidden blockers surface in month one or two instead of at a six-month review.',
          severity: onbHealth.overdueReviews.some((r) => r.horizon === 90) ? 5 : 4,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: evidenceLines,
          action: { label: 'Review 30-60-90 plan', route: onbRoute },
        });
      }

      if (onbHealth.pastWindow) {
        const missingHandoff = [];
        if (!onbHealth.reviewStatus[90].held) missingHandoff.push('Day 90 check-in not yet logged');
        if (!onbHealth.hasSteadyGoal) missingHandoff.push('No active steady-state goal');
        if (!onbHealth.hasGrowthPlan) missingHandoff.push('No active GROW development plan');
        if (onbHealth.checkpointStats.open > 0) missingHandoff.push(`${onbHealth.checkpointStats.open} onboarding checkpoint(s) still open`);
        add({
          ruleId: 'ONB-05',
          domain: 'People',
          title: `${name}'s onboarding plan is at day ${onbHealth.dayNumber} (past ${settings.onboardingDays}d window) without closing handoff`,
          detail: 'Once the onboarding window has passed, hold the Day 90 retrospective, agree steady-state goals and a GROW plan, and close the onboarding record.',
          severity: 3,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: missingHandoff.length ? missingHandoff : [`Started ${activeOnbPlan.startDate} (${onbHealth.dayNumber} days ago)`],
          action: { label: 'Complete 90-day handoff', route: onbRoute },
        });
      }
    }

    // --- Recognition -------------------------------------------------------
    const lastRec = state.recognition
      .filter((r) => r.personId === person.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const sinceRec = lastRec ? daysSince(lastRec.date, now) : null;
    if ((sinceRec === null && (tenure ?? 0) > 30) || (sinceRec !== null && sinceRec > settings.recognitionTargetDays * 2)) {
      add({
        ruleId: 'REC-01',
        domain: 'Recognition',
        title: `${name}: no recognition recorded ${sinceRec === null ? 'ever' : `in ${sinceRec} days`}`,
        detail: 'Specific, timely recognition is one of the cheapest retention tools available and the first thing to disappear when a manager is busy.',
        severity: 2,
        confidence: 'medium',
        personId: person.id,
        personName: name,
        evidence: [sinceRec === null ? 'No recognition on record' : `Last recognition ${sinceRec} days ago`],
        action: { label: 'Name something specific', route: `#/recognition?person=${person.id}` },
      });
    }

    // --- Readiness ---------------------------------------------------------
    if (readinessFor(state, person.id)) {
      const assessment = assess(state, person.id, now, settings);
      if (!assessment.supported) {
        add({
          ruleId: 'READY-01',
          domain: 'Succession',
          title: `${name}: readiness claim is not supported by evidence`,
          detail: assessment.warning,
          severity: 3,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: assessment.evidence.items.map((i) => `${i.met ? '✓' : '✗'} ${i.label} — ${i.note}`),
          action: { label: 'Review the evidence', route: `#/readiness?person=${person.id}` },
        });
      }
    }
  }

  // Team-level goals (no single owner) get exactly the same checks.
  for (const goal of activeGoals(state)) {
    if (reviewedGoalIds.has(goal.id)) continue;
    const health = goalHealth(goal, now);
    if (health.status === 'behind' || health.status === 'overdue') {
      add({
        ruleId: 'GOAL-01',
        domain: 'Goals',
        title: `"${goal.title}" is ${health.status === 'overdue' ? 'past its due date' : 'behind pace'}`,
        detail: `Progress is ${health.progressPct ?? 0}% against ${health.expectedPct ?? 100}% expected${health.daysLeft !== null ? `, with ${health.daysLeft} days remaining` : ''}. This goal has no single owner, which makes drift more likely, not less.`,
        severity: health.status === 'overdue' ? 5 : 4,
        confidence: 'high',
        evidence: [`Progress ${health.progressPct ?? 0}% vs expected ${health.expectedPct ?? 100}%`, 'No named owner'],
        action: { label: 'Review and re-plan', route: `#/goals?goal=${goal.id}` },
      });
    }
    if (!goal.keyResults.length) {
      add({
        ruleId: 'GOAL-04',
        domain: 'Goals',
        title: `"${goal.title}" has no key results`,
        detail: 'Without a measurable result, progress can only be asserted, not observed. Even one number makes the goal reviewable.',
        severity: 2,
        confidence: 'high',
        evidence: ['0 key results', 'No named owner'],
        action: { label: 'Add a measurable result', route: `#/goals?goal=${goal.id}` },
      });
    }
    const stale = checkinStale(goal, now, settings);
    if (stale.stale) {
      add({
        ruleId: 'GOAL-03',
        domain: 'Goals',
        title: `"${goal.title}" has no check-in ${stale.never ? 'ever' : `in ${stale.days} days`}`,
        detail: `A goal without a check-in is a wish with a deadline. Your check-in cadence is every ${settings.goalCheckinDays} days.`,
        severity: 2,
        confidence: 'high',
        evidence: [stale.never ? 'No check-ins recorded' : `Last check-in ${stale.days} days ago`],
        action: { label: 'Check in on it', route: `#/goals?goal=${goal.id}` },
      });
    }
  }

  // --- Delegation ----------------------------------------------------------
  for (const delegation of state.delegations || []) {
    if (delegation.status !== 'active') continue;
    const person = people.find((p) => p.id === delegation.personId);
    if (!person) continue;
    const health = delegationHealth(delegation, now, settings);
    const authority = authorityFor(delegation);
    const evidence = [
      `Owner: ${person.name}`,
      `Decision authority: ${authority.label}`,
      delegation.dueOn ? `Due: ${delegation.dueOn}` : 'No due date recorded',
      health.latest ? `Latest check-in: ${health.latest.date} (${health.latest.progress})` : 'No check-ins recorded',
    ];
    if (health.unscheduled) {
      add({
        ruleId: 'DEL-01', domain: 'Delegation', severity: 3, confidence: 'high',
        personId: person.id, personName: person.name,
        title: `Delegated outcome "${delegation.title}" has no due date`,
        detail: 'An open-ended handoff cannot show whether follow-through is late. Agree a date or explicitly accept the work back.',
        evidence,
        action: { label: 'Set the due date', route: `#/delegations?delegation=${delegation.id}` },
      });
    } else if (health.blocked) {
      add({
        ruleId: 'DEL-02', domain: 'Delegation', severity: 4, confidence: 'high',
        personId: person.id, personName: person.name,
        title: `${person.name} is blocked on "${delegation.title}"`,
        detail: `The latest check-in explicitly says support is needed${health.overdue ? `, and the outcome is ${health.daysOverdue} days overdue` : ''}. Remove the blocker without silently taking the outcome back.`,
        evidence: [...evidence, health.latest.note],
        action: { label: 'Unblock the outcome', route: `#/delegations?delegation=${delegation.id}` },
      });
    } else if (health.overdue) {
      add({
        ruleId: 'DEL-01', domain: 'Delegation', severity: 4, confidence: 'high',
        personId: person.id, personName: person.name,
        title: `Delegated outcome "${delegation.title}" is ${health.daysOverdue} days overdue`,
        detail: 'The agreed due date has passed with no completion or return recorded. Re-plan the outcome, provide support, or explicitly accept the work back.',
        evidence,
        action: { label: 'Close or re-plan it', route: `#/delegations?delegation=${delegation.id}` },
      });
    } else if (health.checkinDue) {
      add({
        ruleId: 'DEL-03', domain: 'Delegation', severity: 2, confidence: 'high',
        personId: person.id, personName: person.name,
        title: `Check in on delegated outcome "${delegation.title}"`,
        detail: `The latest checkpoint is ${health.checkinAge === null ? 'undated' : `${health.checkinAge} days old`}; your team convention is ${health.target} days. Ask about progress and support without turning the check-in into micromanagement.`,
        evidence,
        action: { label: 'Record a check-in', route: `#/delegations?delegation=${delegation.id}` },
      });
    }
  }

  // --- 1:1 actions ---------------------------------------------------------
  const allOpenActions = openActions(state, { now });
  // Splitting by owner keeps one fact in one place: overdue promises the leader
  // owes are CONV-07 (sharper, per person), everything else is CONV-05.
  const overdueActions = allOpenActions.filter((a) => a.overdue && !isLeaderOwned(a));
  if (overdueActions.length) {
    const byPerson = new Map();
    for (const a of overdueActions) byPerson.set(a.personId, (byPerson.get(a.personId) || 0) + 1);
    const top = [...byPerson.entries()].sort((a, b) => b[1] - a[1])[0];
    const person = people.find((p) => p.id === top[0]);
    add({
      ruleId: 'CONV-05',
      domain: 'Conversations',
      title: `${overdueActions.length} team commitment${overdueActions.length === 1 ? ' is' : 's are'} past the agreed date`,
      detail: 'A promise made in a 1:1 and then missed teaches that 1:1 commitments are optional. Check whether the owner is stuck, and settle or re-date it in the next conversation.',
      severity: 3,
      confidence: 'high',
      personId: person ? person.id : null,
      personName: person ? person.name : null,
      evidence: overdueActions.slice(0, 4).map((a) => `"${a.text}" — due ${a.due}, ${Math.abs(a.daysUntilDue)}d late`),
      action: { label: 'Clear the oldest', route: '#/oneonones' },
    });
  }

  // --- The leader's own half of the ledger ----------------------------------
  // A team watches what the manager does with their own promises more closely
  // than what they ask of anyone else. This finding is per person so a roll-up
  // never hides who is waiting on you.
  const myDebts = allOpenActions.filter((a) => isLeaderOwned(a) && a.overdue);
  if (myDebts.length) {
    const byPerson = new Map();
    for (const debt of myDebts) byPerson.set(debt.personId, [...(byPerson.get(debt.personId) || []), debt]);
    for (const [personId, debts] of byPerson) {
      const person = people.find((p) => p.id === personId);
      const name = person ? person.name : 'Someone on your team';
      add({
        ruleId: 'CONV-07',
        domain: 'Conversations',
        title: debts.length === 1
          ? `${name} is waiting on a promise you own`
          : `${name} is waiting on ${debts.length} promises you own`,
        detail: 'A promise the leader breaks is remembered longer than one they never made, and teams copy what the manager does with their own commitments. Do it, re-date it in the next 1:1, or say plainly that you are not going to.',
        severity: debts.length > 1 ? 4 : 3,
        confidence: 'high',
        personId: person ? person.id : null,
        personName: person ? person.name : null,
        evidence: debts.slice(0, 3).map((d) => `"${d.text}" — due ${d.due}${d.overdue ? `, ${Math.abs(d.daysUntilDue)}d late` : ''}${d.owner === 'shared' ? ' (shared)' : ''}${d.carryCount ? `, carried ${d.carryCount}×` : ''}`),
        action: { label: 'Settle it in the next 1:1', route: '#/oneonones' },
      });
    }
  }

  // --- Commitments that keep moving ----------------------------------------
  const stuck = allOpenActions
    .filter((a) => a.carryCount >= 2)
    .sort((a, b) => b.carryCount - a.carryCount || (a.firstAgreedOn < b.firstAgreedOn ? -1 : 1));
  if (stuck.length) {
    const worst = stuck[0];
    const person = people.find((p) => p.id === worst.personId);
    add({
      ruleId: 'CONV-06',
      domain: 'Conversations',
      title: `${stuck.length} commitment${stuck.length === 1 ? '' : 's'} carried forward two or more times`,
      detail: 'A promise that keeps moving between conversations is usually blocked, not forgotten. Name the obstacle, re-scope the work, or drop it explicitly — otherwise the 1:1 becomes the place commitments go to be repeated.',
      severity: 4,
      confidence: 'high',
      personId: person ? person.id : null,
      personName: person ? person.name : null,
      evidence: stuck.slice(0, 3).map((a) => `"${a.text}" — carried ${a.carryCount}× since ${a.firstAgreedOn}`),
      action: { label: 'Resolve it in the next 1:1', route: '#/oneonones' },
    });
  }

  // --- Feedback follow-ups -------------------------------------------------
  const followUps = followUpsDue(state, now);
  if (followUps.length) {
    const first = followUps[0];
    const person = people.find((p) => p.id === first.personId);
    add({
      ruleId: 'FB-05',
      domain: 'Feedback',
      title: `${followUps.length} feedback follow-up${followUps.length === 1 ? '' : 's'} due`,
      detail: 'Constructive feedback needs a second conversation about whether anything changed. Without it, the first one reads as a verdict.',
      severity: 3,
      confidence: 'high',
      personId: person ? person.id : null,
      personName: person ? person.name : null,
      evidence: followUps.slice(0, 3).map((f) => `"${f.situation}" — due ${f.followUpOn} (${f.overdueDays}d late)`),
      action: { label: 'Close the loop', route: '#/feedback?filter=followup' },
    });
  }

  // --- Wellbeing -----------------------------------------------------------
  const pulse = aggregate(state, now);
  if (pulse.n === 0 && people.length > 0) {
    add({
      ruleId: 'PULSE-01',
      domain: 'Wellbeing',
      title: 'No pulse responses in the last two weeks',
      detail: 'You cannot manage what you cannot see. A four-question pulse takes the team two minutes a fortnight and is the earliest warning of burnout and silence.',
      severity: 2,
      confidence: 'high',
      evidence: ['0 responses in the current window'],
      action: { label: 'Send the pulse', route: '#/health' },
    });
  } else if (pulse.blocked && people.length > 0) {
    add({
      ruleId: 'PULSE-02',
      domain: 'Wellbeing',
      title: pulse.blockedReason === 'unanimous' ? 'Pulse suppressed: an answer slice is identical' : `Pulse suppressed: ${pulse.usableResponses} of ${pulse.minRequired} complete responses needed`,
      detail: pulse.blockedReason === 'unanimous'
        ? 'A dimension or overall answer is identical. Releasing other aggregates could reveal it by subtraction. Do not treat a hidden number as zero or infer an individual response.'
        : `Aggregates stay hidden below ${pulse.minRequired} complete responses. ${Math.max(0, pulse.minRequired - pulse.usableResponses)} more complete replies are needed; partial imported answers do not satisfy the floor.`,
      severity: 2,
      confidence: 'high',
      evidence: [`Responses: ${pulse.n}`, `Anonymity floor: ${pulse.minRequired}`],
      action: { label: 'Ask for responses', route: '#/health' },
    });
  } else {
    const safety = pulse.dimensions.safety.avg;
    const workload = pulse.dimensions.workload.avg;
    if (safety !== null && safety < 3) {
      add({
        ruleId: 'PULSE-03',
        domain: 'Wellbeing',
        title: `Psychological safety is ${safety}/5`,
        detail: 'Below 3 means a meaningful share of the team does not believe it is safe to raise a problem. That suppresses every other signal you rely on here.',
        severity: safety < 2.5 ? 5 : 4,
        confidence: 'high',
        evidence: [
          `${pulse.n} anonymous responses`,
          `Safety ${safety}/5 · clarity ${pulse.dimensions.clarity.avg}/5 · workload ${pulse.dimensions.workload.avg}/5`,
          'Aggregated, individual responses are never shown',
        ],
        action: { label: 'Open the pulse detail', route: '#/health' },
      });
    }
    if (workload !== null && workload < 2.5) {
      add({
        ruleId: 'PULSE-04',
        domain: 'Wellbeing',
        title: `Workload is rated ${workload}/5`,
        detail: 'Sustained load below 3/5 is the leading indicator of the resignation you will otherwise see as a surprise. Protect something this week rather than planning to protect it next quarter.',
        severity: 4,
        confidence: 'high',
        evidence: [`${pulse.n} anonymous responses`, `Workload ${workload}/5`],
        action: { label: 'Look at what to drop', route: '#/health' },
      });
    }
  }

  // --- Decisions -----------------------------------------------------------
  const open = openDecisions(state, now).filter((d) => d.ageDays > (settings.decisionReviewDays ?? 14));
  if (open.length) {
    const worst = open[0];
    add({
      ruleId: 'DEC-01',
      domain: 'Decisions',
      title: `"${worst.title}" has been open ${worst.ageDays} days`,
      detail: 'An undecided choice blocks whoever is waiting on it, and the cost is paid by them, not by you. Decide, or explicitly decide to wait until a named date.',
      severity: worst.ageDays > 30 ? 4 : 3,
      confidence: 'high',
      evidence: open.slice(0, 3).map((d) => `"${d.title}" — open ${d.ageDays} days`),
      action: { label: 'Make the call', route: `#/decisions?decision=${worst.id}` },
    });
  }

  const due = reviewsDue(state, now);
  if (due.length) {
    add({
      ruleId: 'DEC-02',
      domain: 'Decisions',
      title: `${due.length} decision review${due.length === 1 ? '' : 's'} due`,
      detail: 'A decision you never revisit is a decision you never learn from. Reviewing outcomes is what turns a decision log into judgement.',
      severity: 3,
      confidence: 'high',
      evidence: due.slice(0, 3).map((d) => `"${d.title}" — review was due ${d.reviewOn} (${d.overdueDays}d ago)`),
      action: { label: 'Review outcomes', route: '#/decisions?filter=review' },
    });
  }

  const noApprover = state.decisions.filter((d) => !d.approver);
  if (noApprover.length) {
    add({
      ruleId: 'DEC-03',
      domain: 'Decisions',
      title: `${noApprover.length} decision${noApprover.length === 1 ? '' : 's'} with no named approver`,
      detail: 'Shared accountability is no accountability. One named approver per decision is the whole point of DACI.',
      severity: 2,
      confidence: 'medium',
      evidence: noApprover.slice(0, 3).map((d) => `"${d.title}"`),
      action: { label: 'Name the approver', route: '#/decisions' },
    });
  }

  // --- Succession ----------------------------------------------------------
  const seats = successionGaps(state, now, settings);
  for (const seat of seats) {
    if (seat.gap) {
      add({
        ruleId: 'SUCC-01',
        domain: 'Succession',
        title: `No ready successor for "${seat.seat}"`,
        detail: 'If this seat emptied next month, the plan would be improvisation. That is a risk you are carrying without a premium being paid for it.',
        severity: 3,
        confidence: 'medium',
        evidence: [
          `${seat.candidates.length} candidate(s) tracked`,
          `${seat.future.length} could be ready in 1–2 years`,
        ],
        action: { label: 'Review the bench', route: '#/readiness' },
      });
    }
  }

  // --- Conflict follow-through: counts only, never private case content. -----
  const conflicts = conflictSummary(state, now);
  for (const [ruleId, rows, title, detail, severity] of [
    ['CFL-01', conflicts.needsSupport, 'conflict record(s) need a support-route check', 'An assessment is unsure/serious or participation was declined. Seek appropriate qualified support; do not force informal agreement.', 4],
    ['CFL-02', conflicts.followUpDue, 'conflict follow-up(s) due or unscheduled', 'Check the next step privately. A support handoff is not a resolution, and an agreement still needs verification.', 3],
    ['CFL-03', conflicts.overdueActions, 'conflict agreement(s) have overdue commitments', 'Review the current commitments and support needed. Their private content stays in the conflict workspace.', 3],
    ['CFL-04', conflicts.notHolding, 'conflict agreement(s) need revisiting', 'The latest follow-up says an agreement is not holding, or the discussion context changed. Listen again before relying on the old agreement.', 4],
  ]) {
    if (!rows.length) continue;
    add({ ruleId, domain: 'Conflict resolution', severity, confidence: 'high',
      title: `${rows.length} ${title}`, detail, evidence: [`${rows.length} matching record(s); case details deliberately excluded from general signals`],
      action: { label: 'Open conflict workspace', route: '#/conflicts?filter=attention' } });
  }

  // --- Span of control -----------------------------------------------------
  const directReports = people.filter((p) => !p.managerId);
  if (directReports.length > settings.maxReportsPerManager) {
    add({
      ruleId: 'TEAM-01',
      domain: 'People',
      title: `You have ${directReports.length} direct reports`,
      detail: `Above ${settings.maxReportsPerManager}, the arithmetic of a weekly 1:1 plus real coaching stops working. Consider a lead layer or a longer cadence for some people.`,
      severity: 3,
      confidence: 'medium',
      evidence: [`${directReports.length} people report to you`, `Threshold set at ${settings.maxReportsPerManager}`],
      action: { label: 'Open the roster', route: '#/people' },
    });
  }

  findings.forEach((f) => {
    f.priority = priorityOf(f);
    f.severityLabel = severityLabel(f.severity);
    f.createdAt = now.toISOString();
  });
  findings.sort((a, b) => b.priority - a.priority || DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain));

  const counts = findings.reduce((acc, f) => {
    acc[f.domain] = (acc[f.domain] || 0) + 1;
    return acc;
  }, {});
  const byDomain = DOMAIN_ORDER.filter((domain) => counts[domain]).map((domain) => ({
    domain,
    count: counts[domain],
    maxSeverity: Math.max(...findings.filter((f) => f.domain === domain).map((f) => f.severity)),
  }));

  return {
    findings,
    wins: buildWins(state, now, pulse),
    counts,
    byDomain,
    urgent: findings.filter((f) => f.severity >= 4),
  };
}

/** Positive observations, so the app is not only a list of failures. */
/**
 * Collapse repetitive per-person findings into one line.
 *
 * With a five-person team, one finding per person reads fine. With forty, the
 * same rule firing forty times buries the two things that are actually urgent
 * and turns the page into a wall nobody reads. Past `threshold` people a rule
 * becomes a single finding: the count, the names and the worst severity travel
 * with it, so nothing is hidden.
 *
 * Group titles are written per rule rather than string-patched from the
 * individual title, because "3 people: has no development plan" is the exact
 * kind of machine-generated sentence that makes a product feel careless.
 */
const GROUP_TITLES = {
  'CONV-01': (n) => `${n} people have never had a logged 1:1`,
  'CONV-02': (n) => `${n} people have an overdue 1:1`,
  'CONV-03': (n) => `${n} people have a 1:1 due now`,
  'CONV-04': (n) => `${n} people have skipped or moved recent 1:1s`,
  'CONV-06': (n) => `${n} people have commitments carried forward two or more times`,
  'CONV-07': (n) => `${n} people are waiting on promises the leader owns`,
  'FB-01': (n) => `${n} people have never had feedback recorded`,
  'FB-02': (n) => `${n} people have had no feedback recently`,
  'FB-03': (n) => `${n} people have only praise on record`,
  'FB-04': (n) => `${n} people have only criticism on record`,
  'FB-06': (n) => `${n} people have feedback beyond the latency convention`,
  'GOAL-01': (n) => `${n} goals are behind pace or past due`,
  'GOAL-02': (n) => `${n} goals are flagged at risk`,
  'GOAL-03': (n) => `${n} goals have no recent check-in`,
  'GOAL-04': (n) => `${n} goals have no key results`,
  'GOAL-05': (n) => `${n} people have no active goal`,
  'GOAL-06': (n) => `${n} goals are explicitly marked leader-set`,
  'DEL-01': (n) => `${n} delegations are overdue or lack a due date`,
  'DEL-02': (n) => `${n} delegations are blocked`,
  'DEL-03': (n) => `${n} delegations need a check-in`,
  'GROW-01': (n) => `${n} people have no development plan`,
  'GROW-02': (n) => `${n} growth plans have no committed action`,
  'GROW-03': (n) => `${n} growth plan reviews are overdue`,
  'GROW-04': (n) => `${n} growth plans have no review date`,
  'GROW-05': (n) => `${n} people's development has stalled`,
  'GROW-06': (n) => `${n} people have development commitments carried forward two or more times`,
  'GROW-07': (n) => `${n} people keep moving a development review without holding it`,
  'ONB-01': (n) => `${n} recent joiners have too few logged 1:1s`,
  'ONB-02': (n) => `${n} recent joiners have no 30-60-90 onboarding plan`,
  'ONB-03': (n) => `${n} onboarding plans are missing core scaffolding`,
  'ONB-04': (n) => `${n} people have overdue 30-60-90 onboarding checkpoints`,
  'ONB-05': (n) => `${n} onboarding plans are past the 90-day handoff window`,
  'REC-01': (n) => `${n} people have not been recognised recently`,
  'READY-01': (n) => `${n} readiness claims are unsupported by evidence`,
};

const GROUP_ROUTES = {
  Conversations: '#/oneonones',
  Goals: '#/goals',
  Delegation: '#/delegations',
  Wellbeing: '#/health',
  Decisions: '#/decisions',
  Succession: '#/readiness',
};

export function rollUpFindings(findings, { threshold = 3 } = {}) {
  const bundles = new Map();
  const output = [];

  for (const finding of findings) {
    if (!finding.personId) {
      output.push(finding);
      continue;
    }
    const list = bundles.get(finding.ruleId) || [];
    list.push(finding);
    bundles.set(finding.ruleId, list);
  }

  for (const [ruleId, list] of bundles) {
    if (list.length <= threshold) {
      output.push(...list);
      continue;
    }
    const sorted = list.slice().sort((a, b) => b.severity - a.severity);
    const lead = sorted[0];
    const names = list.map((f) => f.personName).filter(Boolean);
    const count = list.length;
    output.push({
      ...lead,
      id: `rollup-${ruleId}`,
      personId: null,
      personName: null,
      people: names,
      count,
      rolledUp: true,
      title: GROUP_TITLES[ruleId] ? GROUP_TITLES[ruleId](count) : `${count} people: ${lead.title}`,
      detail: `One representative case: ${lead.detail}`,
      evidence: [
        `${count} people affected: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` and ${names.length - 6} more` : ''}`,
        ...lead.evidence.slice(0, 2),
      ],
      action: { ...lead.action, label: 'Review the roster', route: GROUP_ROUTES[lead.domain] || '#/people' },
    });
  }

  return output.sort((a, b) => b.severity - a.severity || (b.count || 1) - (a.count || 1));
}

export function buildWins(state, now, pulse = aggregate(state, now)) {
  const wins = [];
  const people = state.people.filter((p) => p.status !== 'archived');

  const ahead = activeGoals(state).filter((g) => goalHealth(g, now).status === 'ahead');
  if (ahead.length) {
    wins.push({
      title: `${ahead.length} goal${ahead.length === 1 ? '' : 's'} ahead of pace`,
      detail: ahead
        .slice(0, 2)
        .map((g) => `"${g.title}"`)
        .join(' · '),
    });
  }

  const recognised = state.recognition.filter((r) => (daysSince(r.date, now) ?? Infinity) <= 7);
  if (recognised.length) {
    const names = recognised
      .map((r) => people.find((p) => p.id === r.personId)?.name)
      .filter(Boolean);
    wins.push({
      title: `${recognised.length} recognition${recognised.length === 1 ? '' : 's'} logged this week`,
      detail: [...new Set(names)].join(', '),
    });
  }

  if (!pulse.blocked && pulse.overall !== null && pulse.overall >= 4) {
    wins.push({
      title: `Team pulse at ${pulse.overall}/5`,
      detail: 'Safety, clarity, load and growth are all rated highly this fortnight.',
    });
  }

  const healthyPlans = state.growthPlans.filter((p) => p.status === 'active' && growCompleteness(p).complete && planProgress(p, now).done > 0);
  if (healthyPlans.length) {
    wins.push({
      title: `${healthyPlans.length} development plan${healthyPlans.length === 1 ? '' : 's'} with real completed actions`,
      detail: 'GROW plans that reached Will and delivered something.',
    });
  }

  const completedOnboarding = (state.onboarding || []).filter(
    (plan) => plan.status === 'completed' && people.some((p) => p.id === plan.personId),
  );
  if (completedOnboarding.length) {
    const names = completedOnboarding
      .map((plan) => people.find((p) => p.id === plan.personId)?.name)
      .filter(Boolean);
    wins.push({
      title: `${completedOnboarding.length} completed 30-60-90 onboarding plan${completedOnboarding.length === 1 ? '' : 's'}`,
      detail: [...new Set(names)].join(', '),
    });
  }

  const closedInConversation = (state.oneOnOnes || [])
    .flatMap((meeting) => meeting.actions || [])
    .filter((action) => action.done && action.completedInMeetingId && (daysSince(action.completedOn, now) ?? Infinity) <= 14);
  if (closedInConversation.length >= 2) {
    wins.push({
      title: `${closedInConversation.length} promises closed in a 1:1`,
      detail: 'Commitments confirmed face to face in the last fortnight, not ticked off in passing.',
    });
  }

  const balanced = people.filter((p) => personFeedbackStats(state, p.id, now, state.settings).balance === 'balanced');
  if (balanced.length && people.length) {
    wins.push({
      title: `${balanced.length} of ${people.length} people have both praise and constructive feedback on record`,
      detail: 'That is the combination that makes feedback credible.',
    });
  }

  return wins.slice(0, 4);
}

/** Findings for one person, for the person detail page. */
export function insightsForPerson(state, personId, now) {
  return buildInsights(state, now).findings.filter((f) => f.personId === personId);
}

export { round, isOverdue, lastCheckin, activePlan, openActions };
