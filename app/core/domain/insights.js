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

import { addDays, dayKey, daysBetween, daysSince, isOverdue, round } from '../time.js';
import { cadence, isLeaderOwned, openActions } from './oneonone.js';
import { feedbackLatencySummary, followUpsDue, personFeedbackStats } from './feedback.js';
import { activeGoals, checkinStale, goalHealth, goalsFor, lastCheckin } from './goals.js';
import { authorityFor, delegationHealth } from './delegations.js';
import { activePlan, growCompleteness, openWillActions, planProgress, reviewState, stagnationDays } from './growth.js';
import { aggregate } from './pulse.js';
import { assess, readinessFor, successionGaps } from './readiness.js';
import { openDecisions, reviewsDue } from './decisions.js';
import {
  CALIBRATION_MIN_SAMPLES,
  DECISION_BIAS_SIGNAL_PP,
  INTERVAL_COVERAGE_FLOOR,
  OCCURRENCE_GAP_VERDICT_PP,
  OPTIMISM_RATIO_THRESHOLD,
  PESSIMISM_RATIO_THRESHOLD,
  calibrationSummary,
  commitmentCalibration,
} from './calibration.js';
import {
  budgetsRollup,
  calibratedForecast,
  formatMoney,
  sourceCompletion,
} from './finance.js';
import { conflictSummary } from './conflicts.js';
import { summarizeNegotiation } from './negotiation.js';
import {
  ADVERSE_STANCES,
  HIGH_SALIENCE_CLASSES,
  classifySalience,
  classifyStanceShift,
  reconciliationReport,
  vetoRiskOverview,
} from './stakeholders.js';
import { isNewJoiner, tenureDays } from './people.js';
import {
  activeOnboarding,
  onboardingFor,
  onboardingHealth,
  planKind,
  planKindNoun,
  planKindRecordNoun,
} from './onboarding.js';
import { CASE_KIND_LABELS, STAKEHOLDER_STANCE_LABELS, casesRollup } from './cases.js';
import {
  capacitySummary,
  PORTFOLIO_DECISION_LABELS,
} from './capacity.js';
import { hiringSummary } from './hiring.js';
import { changesRollup } from './changes.js';
import { computeXmR } from './spc.js';
import { simulateJointWorkspace } from './simulation.js';
import { buildSuggestedScenarios, compareScenarios } from './scenarios.js';
import { forecastIntegritySignals } from './forecastIntegrity.js';
import { pendingIntakeDrafts } from './intake.js';
import { decisionTempoSignals } from './decisionTempo.js';
import { buildResilienceReport, resilienceSignals } from './resilience.js';
import { powerSignals } from './power.js';
import { networkSignals } from './orgNetwork.js';
import { impactSignals } from './impact.js';
import { fidelitySignals } from './fidelity.js';
import { commsSignals } from './comms.js';
import { allocationSignals } from './allocation.js';
import { loadSignals } from './load.js';
import { strategySignals } from './strategy.js';
import { learningSignals } from './learning.js';
import { measurementSignals } from './measurement.js';
import { premiseSignals } from './premises.js';
import { dynamicsSignals } from './dynamics.js';
import { capitalSignals } from './policyPortfolio.js';
import { premiseTailSignals } from './premiseTails.js';
import { watchSignals } from './earlyWarning.js';
import { continuityCouplingSignals } from './continuityCouplingRule.js';
import { buildLeaderContinuityReport, continuitySignals } from './leaderContinuity.js';

const CONF_WEIGHT = { high: 3, medium: 2, low: 1 };
const SEVERITY_LABEL = { 1: 'Info', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Urgent' };

export const DOMAIN_ORDER = [
  'People',
  'Conversations',
  'Feedback',
  'Goals',
  'Delegation',
  'Operational cases',
  'Operational resilience',
  'Leader continuity',
  'Continuity coupling',
  'Coalition & power',
  'Org network',
  'Impact',
  // Schema v32: stakeholder comms outbox signals (COMMS-01..03).
  'Comms',
  'Stakeholders',
  'Negotiation',
  'Org design & change',
  'Capacity & flow',
  // Schema v33: Allocation Governor signals (ALLOC-01..05).
  'Allocation',
  // Schema v34: Cognitive Load & Attention Governor signals (LOAD-01..05).
  'Load & attention',
  // Schema v35: Premise Sentinel / Assumption Ledger signals (PREM-01..05).
  'Premise sentinel',
  // Schema v37: Operating System Dynamics signals (DYN-01..05).
  'System dynamics',
  // Schema v38: Structural Capital Allocation signals (SCA-01..05).
  'Capital allocation',
  // Schema v39: Early-Warning Watch signals (EW-01..05).
  'Early warning',
  // Schema v42: Strategy Coherence signals (SCO-01..06). A domain that is not
  // listed here is silently dropped from `byDomain`, so the bucket is part of
  // the contract, not a cosmetic label.
  'Strategy',
  // Schema v43: After-Action Review signals (LEARN-01..06). Listed here for the
  // same reason the strategy bucket is: `byDomain` filters on this array, so an
  // unlisted domain is counted in `findings` and silently dropped from the
  // roll-up.
  'Learning',
  // Schema v47: Scorecard Integrity signals (MTX-01..06). Listed here for the
  // same reason as every other bucket: `byDomain` filters on this array, so an
  // unlisted domain is counted and silently dropped from the roll-up.
  'Scorecard integrity',
  // Schema v50: Implementation Fidelity signals (FID-01..05). Listed here for
  // the same reason as every other bucket: an unlisted domain is counted in
  // `findings` and silently dropped from the roll-up.
  'Implementation fidelity',
  'Finance',
  'Hiring',
  'Growth',
  'Wellbeing',
  'Decisions',
  'Decision tempo',
  'Forecast integrity',
  'Intake triage',
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
      if (!personOnboardingPlans.some((p) => (p.status === 'active' || p.status === 'completed') && planKind(p) === 'new-hire')) {
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
      const recordNoun = planKindRecordNoun(onbHealth.kind);
      const processNoun = planKindNoun(onbHealth.kind);
      if (onbHealth.scaffoldingGaps.length > 0) {
        const gapTitle = onbHealth.scaffoldingGaps.length === 1
          ? onbHealth.scaffoldingGaps[0].shortLabel
          : `${onbHealth.scaffoldingGaps.length} scaffolding basics`;
        add({
          ruleId: 'ONB-03',
          domain: 'People',
          title: `${name}'s ${recordNoun} is missing ${gapTitle}`,
          detail: onbHealth.isTransition
            ? 'A new role needs the same deliberate scaffolding as a new job: written role clarity for the changed scope, a peer buddy already doing similar work, deliberate stakeholder introductions and a scoped early win — internal moves fail quietly when the organisation assumes none of that is needed.'
            : onbHealth.isReboarding
              ? 'Returning from extended leave needs a written catch-up on what changed, sustainable load pacing, a peer buddy, re-introductions to shifted counterparts and a bounded re-entry win — without recording personal or medical leave details.'
              : 'Proactive socialization depends on written role clarity, an assigned peer buddy, deliberate stakeholder introductions and a scoped early win — none of which form reliably by osmosis.',
          severity: (onbHealth.dayNumber ?? 0) > 30 ? 4 : 3,
          confidence: 'high',
          personId: person.id,
          personName: name,
          evidence: onbHealth.scaffoldingGaps.map((g) => g.evidence),
          action: {
            label: onbHealth.isTransition
              ? 'Complete transition setup'
              : onbHealth.isReboarding
                ? 'Complete re-boarding setup'
                : 'Complete onboarding setup',
            route: onbRoute,
          },
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
          title: `${name}: ${overdueParts.join(' and ')} overdue in 30-60-90 ${processNoun}`,
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
        if (onbHealth.checkpointStats.open > 0) missingHandoff.push(`${onbHealth.checkpointStats.open} 30-60-90 checkpoint(s) still open`);
        add({
          ruleId: 'ONB-05',
          domain: 'People',
          title: `${name}'s ${recordNoun} is at day ${onbHealth.dayNumber} (past ${settings.onboardingDays}d window) without closing handoff`,
          detail: onbHealth.isTransition
            ? 'Once the transition window has passed, hold the Day 90 retrospective, reset steady-state goals and a GROW plan to the expectations of the new role, and close the transition record.'
            : onbHealth.isReboarding
              ? 'Once the 90-day re-boarding window has passed, hold the Day 90 check-in, confirm steady-state goals and a GROW plan, and close the re-boarding plan.'
              : 'Once the onboarding window has passed, hold the Day 90 retrospective, agree steady-state goals and a GROW plan, and close the onboarding record.',
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
      action: {
        label: 'Name the approver',
        route: noApprover.length === 1 ? `#/decisions?decision=${encodeURIComponent(noApprover[0].id)}` : '#/decisions',
      },
    });
  }

  // --- Forecast calibration (Brier / planning fallacy / reference class) ---
  // The learning loop over the app's own predictions. Every signal requires a
  // real evidence base (calibration.js refuses verdicts below n=5); FCT-04 is
  // the exception that keeps the loop fed by prompting for missing actuals.
  const cal = calibrationSummary(state);
  for (const cohort of cal.negotiations.cohorts) {
    if (!cohort.materialShortfall) continue;
    add({
      ruleId: 'NEG-09',
      domain: 'Negotiation',
      title: `${cohort.currency} ${cohort.direction === 'minimize' ? 'cost-minimising' : 'value-maximising'} agreements show ${cohort.medianShortfallPct}% median implementation shortfall (n=${cohort.n})`,
      detail: 'Williamson (1985) ex-post governance, Perold (1988) implementation shortfall and Flyvbjerg (2006) outside-view learning: a comparable group of settled agreements warrants an execution-system review. Check whether the baseline, scope, usage and delivery evidence still match before attributing cause; this is not a negotiation-skill or employee-performance score.',
      severity: cohort.medianShortfallPct >= 40 ? 4 : 3,
      confidence: 'medium',
      evidence: [
        `Cohort: ${cohort.currency} · ${cohort.direction} · ${cohort.n} explicit signed/realised value pairs`,
        `Median direction-adjusted shortfall ${cohort.medianShortfallPct}% · empirical P80 ${cohort.p80ShortfallPct}%`,
        cohort.deliveryRate === null
          ? `Counterparty delivery status recorded on ${cohort.deliveryKnownCount} of ${cohort.n} pairs (rate withheld without ${CALIBRATION_MIN_SAMPLES} observations)`
          : `Counterparty delivery rate ${Math.round(cohort.deliveryRate * 100)}% across ${cohort.deliveryKnownCount} known outcomes`,
      ],
      action: { label: 'Review settlement calibration', route: '#/decisions' },
    });
  }
  if (cal.estimates.sufficient && cal.estimates.medianRatio >= OPTIMISM_RATIO_THRESHOLD) {
    const worst = cal.estimates.pairs.slice().sort((a, b) => b.ratio - a.ratio)[0];
    add({
      ruleId: 'FCT-01',
      domain: 'Capacity & flow',
      title: `Delivered work runs ${cal.estimates.medianRatio}× its estimates (n=${cal.estimates.n})`,
      detail: 'Planning fallacy (Kahneman & Tversky, 1979), measured on your own delivery record: the median funded item took materially longer than the forecast frozen when it was funded. Flyvbjerg’s (2006) correction is a reference-class uplift from this ratio distribution — not trying harder at the inside view.',
      severity: cal.estimates.medianRatio >= 1.5 ? 4 : 3,
      confidence: 'high',
      evidence: [
        `Median actual/estimate ${cal.estimates.medianRatio}× · mean ${cal.estimates.meanRatio}× · P80 ratio ${cal.estimates.ratioP80}× across ${cal.estimates.n} delivered items`,
        worst ? `Worst overrun: “${worst.title}” at ${worst.ratio}× (${worst.actual}d actual vs ${worst.expected}d expected)` : null,
        cal.estimates.schedule.n ? `On-target rate ${Math.round((cal.estimates.schedule.onTimeRate ?? 0) * 100)}% · median slip ${cal.estimates.schedule.medianSlipDays}d` : null,
      ].filter(Boolean),
      action: { label: 'Review forecast calibration', route: '#/decisions' },
    });
  } else if (cal.estimates.sufficient && cal.estimates.medianRatio <= PESSIMISM_RATIO_THRESHOLD) {
    add({
      ruleId: 'FCT-01',
      domain: 'Capacity & flow',
      title: `Estimates are systematically padded (${cal.estimates.medianRatio}×, n=${cal.estimates.n})`,
      detail: 'Delivered work consistently costs less than its funding-time forecast. Padding feels prudent but rations ambition: the operating plan funds less than the team can actually deliver, and slack gets absorbed invisibly instead of allocated deliberately.',
      severity: 2,
      confidence: 'high',
      evidence: [
        `Median actual/estimate ${cal.estimates.medianRatio}× across ${cal.estimates.n} delivered items`,
        `P80 ratio ${cal.estimates.ratioP80}× — even four of five items came in under forecast`,
      ],
      action: { label: 'Review forecast calibration', route: '#/decisions' },
    });
  }
  if (
    cal.estimates.sufficient &&
    cal.estimates.withinRangeRate !== null &&
    cal.estimates.withinRangeRate < INTERVAL_COVERAGE_FLOOR
  ) {
    add({
      ruleId: 'FCT-02',
      domain: 'Capacity & flow',
      title: `Estimate ranges are too narrow — only ${Math.round(cal.estimates.withinRangeRate * 100)}% of actuals landed inside them`,
      detail: 'A three-point estimate whose optimistic–pessimistic span misses most actuals is precision theatre: the P50/P80 dates built on it inherit the overconfidence. Widen the pessimistic leg first — that is where integration, review queues and interrupts actually live.',
      severity: 3,
      confidence: 'high',
      evidence: [
        `${Math.round(cal.estimates.withinRangeRate * 100)}% inside [optimistic, pessimistic] · ${Math.round((cal.estimates.withinP10P90Rate ?? 0) * 100)}% inside P10–P90 (target ≈80%) across ${cal.estimates.n} items`,
      ],
      action: { label: 'Inspect interval honesty', route: '#/decisions' },
    });
  }
  if (cal.decisions.sufficient && Math.abs(cal.decisions.biasPp ?? 0) >= DECISION_BIAS_SIGNAL_PP) {
    const over = (cal.decisions.biasPp ?? 0) > 0;
    add({
      ruleId: 'FCT-03',
      domain: 'Decisions',
      title: over
        ? `Decision forecasts are overconfident (+${cal.decisions.biasPp}pp, Brier ${cal.decisions.brier})`
        : `Decision forecasts are underconfident (${cal.decisions.biasPp}pp, Brier ${cal.decisions.brier})`,
      detail: over
        ? 'Tetlock & Gardner (2015): calibration improves when forecasters see their own scoring. Your calls succeed less often than your stated probabilities claim — shave new forecasts toward the base rate, especially above 70%.'
        : 'Your calls succeed more often than your stated probabilities claim. Persistent underconfidence is not free: reversible decisions get deferred and hedged long after the evidence justifies committing.',
      severity: 3,
      confidence: 'high',
      evidence: [
        `Mean forecast ${Math.round((cal.decisions.meanForecast ?? 0) * 100)}% vs observed success ${Math.round((cal.decisions.observedRate ?? 0) * 100)}% across ${cal.decisions.n} scored decisions`,
        `Brier ${cal.decisions.brier}${cal.decisions.brierSkill !== null ? ` · skill vs base-rate climatology ${cal.decisions.brierSkill}` : ''}`,
      ],
      action: { label: 'See the calibration curve', route: '#/decisions' },
    });
  }
  if (cal.estimates.missingActuals >= 3) {
    add({
      ruleId: 'FCT-04',
      domain: 'Capacity & flow',
      title: `${cal.estimates.missingActuals} delivered item(s) have no recorded actual effort`,
      detail: 'An estimate that is never compared with its actual cannot improve. Recording actual person-days at delivery is what turns the operating plan into a learning system instead of a sequence of fresh guesses.',
      severity: 2,
      confidence: 'high',
      evidence: cal.estimates.missingItems.slice(0, 3).map((m) => `“${m.title}” — delivered ${m.completedOn || 'recently'}, forecast ${m.expected}d, actual unknown`),
      action: { label: 'Record actuals', route: '#/decisions' },
    });
  }

  // --- Case-cost calibration (Schema v22; FAIR frequency × magnitude) -----
  // The third ledger: operational cases scored against the forecast frozen
  // when they were opened. Same evidence discipline — verdicts refuse below
  // n=5 scored settlements; FCT-07 keeps the loop fed.
  if (cal.cases.exposure.sufficient && cal.cases.exposure.medianRatio >= OPTIMISM_RATIO_THRESHOLD) {
    const worst = cal.cases.exposure.pairs.slice().sort((a, b) => b.exposureRatio - a.exposureRatio)[0];
    add({
      ruleId: 'FCT-05',
      domain: 'Operational cases',
      title: `Materialised risks settle at ${cal.cases.exposure.medianRatio}× assessed exposure (n=${cal.cases.exposure.n})`,
      detail: 'In actuarial terms the case reserves are deficient: losses develop upward from the opening assessment by a systematic factor. The correction is a reference-class development factor from the settlement history (median and P80 uplifts on new case exposures), governed as an explicit decision via RULE-FCT-04 — not louder adjectives in the next FMEA.',
      severity: cal.cases.exposure.medianRatio >= 1.5 ? 4 : 3,
      confidence: 'high',
      evidence: [
        `Median realised/assessed exposure ${cal.cases.exposure.medianRatio}× · mean ${cal.cases.exposure.meanRatio}× · P80 ${cal.cases.exposure.ratioP80}× across ${cal.cases.exposure.n} materialised cases`,
        worst ? `Worst under-assessment: “${worst.title}” at ${worst.exposureRatio}× (${worst.currency} ${worst.realisedExposure} realised vs ${worst.currency} ${worst.costExpected} expected)` : null,
        cal.cases.exposure.withinRangeRate !== null && cal.cases.exposure.withinRangeRate < INTERVAL_COVERAGE_FLOOR
          ? `Only ${Math.round(cal.cases.exposure.withinRangeRate * 100)}% of realised exposures landed inside the optimistic–pessimistic range — the ranges are too narrow, not just the centres wrong`
          : null,
        cal.cases.days.n >= 3 ? `Diverted capacity runs a median ${cal.cases.days.medianRatio}× the reserved days (n=${cal.cases.days.n}) — RULE-CAP-01 reserves inherit the same bias` : null,
      ].filter(Boolean),
      action: { label: 'Review case-cost calibration', route: '#/cases' },
    });
  } else if (cal.cases.exposure.sufficient && cal.cases.exposure.medianRatio <= PESSIMISM_RATIO_THRESHOLD) {
    add({
      ruleId: 'FCT-05',
      domain: 'Operational cases',
      title: `Case exposures are systematically over-assessed (${cal.cases.exposure.medianRatio}×, n=${cal.cases.exposure.n})`,
      detail: 'Redundant reserves are not free: mitigation capital, escalation attention and diverted capacity are being held against losses that systematically settle far below the assessed exposure. Size contingency from the settlement history instead of the worst imaginable day.',
      severity: 2,
      confidence: 'high',
      evidence: [
        `Median realised/assessed exposure ${cal.cases.exposure.medianRatio}× across ${cal.cases.exposure.n} materialised cases`,
        `P80 ratio ${cal.cases.exposure.ratioP80}× — even four of five settlements landed under the assessed expectation`,
      ],
      action: { label: 'Review case-cost calibration', route: '#/cases' },
    });
  }
  if (cal.cases.occurrence.sufficient && Math.abs(cal.cases.occurrence.gapPp ?? 0) >= OCCURRENCE_GAP_VERDICT_PP) {
    const blindSpot = (cal.cases.occurrence.gapPp ?? 0) > 0;
    add({
      ruleId: 'FCT-06',
      domain: 'Operational cases',
      title: blindSpot
        ? `Risks materialise far more often than assessed (${Math.round((cal.cases.occurrence.observedRate ?? 0) * 100)}% vs ${Math.round((cal.cases.occurrence.meanAssessedProbability ?? 0) * 100)}% assessed)`
        : `Risks materialise far less often than assessed (${Math.round((cal.cases.occurrence.observedRate ?? 0) * 100)}% vs ${Math.round((cal.cases.occurrence.meanAssessedProbability ?? 0) * 100)}% assessed)`,
      detail: blindSpot
        ? 'The FMEA probability leg (FAIR Loss Event Frequency) is understating how often failure modes actually land — mitigation is not buying the occurrence reduction the assessments assume, or the ratings start too low. Either way the expected-loss figures driving escalation are too small.'
        : 'Assessed occurrence runs well above what settles. Successful mitigation explains part of this gap — read it jointly with the mitigation-spend leg before concluding the team cries wolf — but persistent over-assessment still taxes every case with escalation overhead it may not need.',
      severity: blindSpot ? 4 : 2,
      confidence: 'high',
      evidence: [
        `${cal.cases.occurrence.materialisedCount} of ${cal.cases.occurrence.n} settled cases materialised · occurrence Brier ${cal.cases.occurrence.brier}`,
        cal.cases.spend.n >= 3 ? `Mitigation spend runs a median ${cal.cases.spend.medianRatio}× plan (n=${cal.cases.spend.n})` : null,
      ].filter(Boolean),
      action: { label: 'Inspect occurrence calibration', route: '#/cases' },
    });
  }
  if (cal.cases.missingActuals >= 3) {
    add({
      ruleId: 'FCT-07',
      domain: 'Operational cases',
      title: `${cal.cases.missingActuals} resolved case(s) have no recorded settled actuals`,
      detail: 'A risk estimate that is never compared with its settlement cannot improve. Recording what a case actually cost — exposure, mitigation spend, diverted days — at resolution is what turns FMEA scoring into a learning system instead of a sequence of fresh guesses.',
      severity: 2,
      confidence: 'high',
      evidence: cal.cases.missingItems.slice(0, 3).map((m) => `“${m.title}” — resolved ${m.resolvedOn || 'recently'}${m.costExpected !== null ? `, expected exposure ${m.currency} ${m.costExpected}` : ''}, actuals unknown`),
      action: { label: 'Record settled actuals', route: '#/cases' },
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

  // --- Operational cases (FMEA, PERT, 5-Whys & Mendelow coalition) --------
  const caseRollup = casesRollup(state, now);
  for (const item of caseRollup.open) {
    const rec = item.caseRecord;
    const ownerName = item.owner ? item.owner.name : null;

    if (item.fmea.rated && item.fmea.actionPriority === 'high' && (!item.hasMitigationDelegation || !item.rca.systemicBarrier)) {
      add({
        ruleId: 'CASE-01',
        domain: 'Operational cases',
        personId: item.owner ? item.owner.id : null,
        personName: ownerName,
        title: `High-priority case "${rec.title}" lacks ${!item.hasMitigationDelegation ? 'accountable mitigation' : 'a systemic barrier'}`,
        detail: `${CASE_KIND_LABELS[rec.kind] || 'Operational case'} carries FMEA Action Priority HIGH (RPN ${item.fmea.rpn}: S${item.fmea.severity} × P${item.fmea.probability} × D${item.fmea.detectability}). Assign an explicit mitigation owner and identify the Swiss-Cheese process guardrail.`,
        severity: item.fmea.severity >= 9 ? 5 : 4,
        confidence: 'high',
        evidence: [
          ...item.fmea.drivers,
          item.hasMitigationDelegation ? 'Mitigation delegated, but systemic barrier is blank' : 'No linked mitigation delegation on record',
        ],
        action: { label: 'Open operational case', route: `#/cases/${rec.id}` },
      });
    }

    const urgentStakeholders = [
      ...item.coalition.unalignedKeyPlayers.filter((s) => s.needsImmediateAlignment),
      ...item.coalition.overdueComms,
    ];
    if (urgentStakeholders.length > 0) {
      const uniqueNames = [...new Set(urgentStakeholders.map((s) => `${s.name} (${s.quadrantLabel}, ${s.stanceLabel})`))];
      add({
        ruleId: 'CASE-02',
        domain: 'Operational cases',
        personId: item.owner ? item.owner.id : null,
        personName: ownerName,
        title: `Stakeholder coalition brief due on "${rec.title}"`,
        detail: `Mendelow key players or scheduled stakeholder checkpoints need alignment so execution is not blocked politically or surprised at escalation time.`,
        severity: item.coalition.unalignedKeyPlayers.some((s) => s.stance === 'blocker') ? 4 : 3,
        confidence: 'high',
        evidence: [
          `Stakeholders needing alignment: ${uniqueNames.slice(0, 3).join('; ')}`,
          `Coalition power balance: ${item.coalition.supportivePower} supportive vs ${item.coalition.opposingPower} opposing`,
        ],
        action: { label: 'Review stakeholder coalition', route: `#/cases/${rec.id}` },
      });
    }

    if (item.reviewOverdue) {
      add({
        ruleId: 'CASE-03',
        domain: 'Operational cases',
        personId: item.owner ? item.owner.id : null,
        personName: ownerName,
        title: `Operational case review overdue: "${rec.title}"`,
        detail: `Scheduled review date (${rec.reviewOn}) passed while the case remains ${rec.status}. Verify residual FMEA risk or update the mitigation plan.`,
        severity: item.fmea.rated && item.fmea.actionPriority === 'high' ? 4 : 3,
        confidence: 'high',
        evidence: [
          `Review due on ${rec.reviewOn}`,
          `Current status: ${rec.status} · ${item.fmea.rated ? `RPN ${item.fmea.rpn}` : 'FMEA not rated'}`,
        ],
        action: { label: 'Review case', route: `#/cases/${rec.id}` },
      });
    }
  }

  if (caseRollup.expectedDivertedDays >= 10 && people.length > 0) {
    add({
      ruleId: 'CASE-04',
      domain: 'Operational cases',
      title: `${caseRollup.expectedDivertedDays} PERT person-days diverted to open operational cases`,
      detail: `Three-point PERT modelling estimates ${caseRollup.expectedDivertedDays} expected person-days (P90 ${caseRollup.p90DivertedDays}d) absorbed by active incidents and risks. Protect roadmap scope explicitly so unplanned load does not silently burn the team out.`,
      severity: caseRollup.expectedDivertedDays >= 18 ? 4 : 3,
      confidence: 'medium',
      evidence: [
        `${caseRollup.open.length} open operational case(s)`,
        `Expected diverted capacity: ${caseRollup.expectedDivertedDays}d · P90 tail: ${caseRollup.p90DivertedDays}d`,
      ],
      action: { label: 'Inspect capacity & ROI', route: '#/cases' },
    });
  }


  // --- Capacity, flow & portfolio allocation (Schema v16) ------------------
  // Utilisation is only reported when there is a team to allocate: otherwise
  // every new workspace would open on an "over-allocated" alarm about nobody.
  if ((state.portfolio || []).length > 0 && people.length > 0) {
    const cap = capacitySummary(state, now);
    const { model, flow, ranking, forecast } = cap;
    const pct = model.utilisation === null ? null : Math.round(model.utilisation * 100);

    if (model.band.id === 'infeasible' || model.band.id === 'overloaded' || model.band.id === 'elevated') {
      add({
        ruleId: 'CAP-01',
        domain: 'Capacity & flow',
        title: pct === null
          ? 'The operating plan has no measured capacity'
          : `Operating plan is ${pct}% committed (${model.band.label.toLowerCase()})`,
        detail: `${model.band.guidance} The plan commits ${model.demand.committedDays} person-days against ${model.supply.allocatableDays} allocatable over ${model.horizonWeeks} weeks, ${model.slackDays >= 0 ? `leaving ${model.slackDays}` : `a deficit of ${Math.abs(model.slackDays)}`} day(s).`,
        severity: model.band.id === 'infeasible' ? 5 : model.band.id === 'overloaded' ? 4 : 3,
        confidence: 'medium',
        evidence: [
          `Supply: ${model.supply.availableDays} person-days after transition ramp, less a ${model.operationalLoadPct}% operational reserve = ${model.supply.allocatableDays} allocatable`,
          `Demand: ${model.demand.reserveDays}d reserved for incidents/mitigations + ${model.demand.fundedDays}d funded work`,
          flow.delayMultiplier
            ? `Queue delay multiplier at this utilisation: ≈${flow.delayMultiplier}× the service time (Kingman, 1961)`
            : 'Queue delay is undefined at 100% utilisation or above',
        ],
        action: { label: 'Open capacity & flow', route: '#/capacity' },
      });
    }

    if (flow.wipBreach || (flow.delayMultiplier !== null && flow.delayMultiplier >= 4)) {
      add({
        ruleId: 'CAP-02',
        domain: 'Capacity & flow',
        title: flow.wipBreach
          ? `${flow.wip} funded items in flight against a WIP limit of ${flow.wipLimit}`
          : `Queue delay is inflating delivery ≈${flow.delayMultiplier}×`,
        detail: flow.wipBreach
          ? 'Little’s Law (1961): cycle time equals work in progress divided by throughput. Starting less work is the only lever that shortens it without more people.'
          : 'At this utilisation the team spends most of its lead time queued rather than working. Either reduce committed work or accept a later date honestly.',
        severity: 3,
        confidence: 'medium',
        evidence: [
          `Throughput: ${flow.throughputPerWeek} plan item(s)/week over the last ${flow.windowWeeks} weeks (${flow.completedInWindow} delivered)`,
          flow.observedCycleDays !== null
            ? `Observed cycle time for delivered items: ${flow.observedCycleDays} days`
            : 'No delivered items yet, so observed cycle time is unknown',
          `Committed work: ${model.demand.fundedProjects.length} funded item(s), ${flow.otherOpenCommitments} other open commitment(s) outside the plan`,
        ],
        action: { label: 'Review flow & WIP', route: '#/capacity' },
      });
    }

    if (model.demand.wanted.length > 0) {
      const top = ranking.candidates[0];
      add({
        ruleId: 'CAP-03',
        domain: 'Capacity & flow',
        title: `${model.demand.wanted.length} item(s) worth ${model.demand.wantedDays} person-days are still undecided`,
        detail: `Unfunded demand is not free: it stays in the team's heads and gets started informally. With ${model.slackDays >= 0 ? `${model.slackDays} day(s) of slack` : `a ${Math.abs(model.slackDays)}-day deficit`}, decide explicitly which of these is funded before someone starts the cheapest-looking one.`,
        severity: model.slackDays < 0 ? 4 : 2,
        confidence: 'high',
        evidence: [
          `Undecided: ${model.demand.wanted.slice(0, 3).map((i) => `“${i.title}” (${i.effort.expected}d)`).join(', ')}`,
          top && top.valueDensity !== null
            ? `Highest value density first: “${top.title}” at ${top.valueDensity.toFixed(2)} ${top.currency} per person-day`
            : 'No value estimates recorded, so ranking is by target date only',
          `Parked: ${model.demand.parked.length} item(s), ${model.demand.parkedDays} day(s) deliberately not funded`,
        ],
        action: { label: 'Decide what is funded', route: '#/capacity' },
      });
    }

    if (model.demand.unestimatedCount > 0) {
      add({
        ruleId: 'CAP-04',
        domain: 'Capacity & flow',
        title: `${model.demand.unestimatedCount} committed item(s) have no effort estimate`,
        detail: 'A commitment without an estimate cannot be counted against capacity, so the utilisation figure is a lower bound and the delivery forecast silently excludes it.',
        severity: 2,
        confidence: 'high',
        evidence: [
          `Committed items: ${model.demand.committed.length}`,
          `Unmeasured: ${model.demand.committed.filter((i) => !i.effort.measured).slice(0, 3).map((i) => `“${i.title}”`).join(', ')}`,
        ],
        action: { label: 'Add effort estimates', route: '#/capacity' },
      });
    }

    if (forecast.lateTargetCount > 0) {
      const worst = forecast.targetRisks.find((t) => t.atRisk);
      add({
        ruleId: 'CAP-05',
        domain: 'Capacity & flow',
        title: `${forecast.lateTargetCount} funded commitment(s) cannot meet their target date`,
        detail: `Cumulative work due by ${worst.targetOn} (${worst.cumulativeWorkByTarget}d) exceeds the capacity available by then (${worst.capacityByTarget}d). Re-sequence, add capacity, or re-baseline the date in writing.`,
        severity: 4,
        confidence: 'medium',
        evidence: [
          `Earliest affected: “${worst.title}” due ${worst.targetOn}`,
          forecast.p80 ? `Portfolio P80 delivery: ${forecast.p80} (P50 ${forecast.p50})` : 'No portfolio forecast available',
        ],
        action: { label: 'Re-plan the dates', route: '#/capacity' },
      });
    }
  }


    /* ------------------------------------------------- hiring (Schema v17) */
    const hiring = hiringSummary(state, { now, settings });
    for (const row of hiring.active) {
      const { requisition, funnel, assessments: candidateRows } = row;
      if (funnel.stalled) {
        add({
          ruleId: 'HIRE-02',
          domain: 'Hiring',
          title: `“${requisition.title}” has not moved in ${funnel.daysSinceActivity} days`,
          detail: `Open ${funnel.daysOpen} day(s) with ${funnel.active} active candidate(s) and no recorded progress for ${funnel.stallDays}+ days. A stalled requisition is usually a decision nobody owns, not a market problem. LeadOS raised an operational case the first time this happened; this is the reminder to work it.`,
          severity: 4,
          confidence: 'high',
          evidence: [
            `Last activity: ${funnel.lastActivityOn || 'none recorded'}`,
            funnel.vacancy.measured
              ? `Recorded vacancy exposure so far: ${funnel.vacancy.currency} ${funnel.vacancy.cost.toLocaleString('en-US')} (${funnel.vacancy.daily}/day)`
              : 'No cost of vacancy recorded, so the delay is unpriced',
            requisition.escalatedCaseId ? 'A linked operational case already exists' : 'No linked operational case yet',
          ],
          action: { label: 'Review the requisition', route: `#/hiring/${requisition.id}` },
        });
      }

      if (funnel.targetSlipDays !== null && funnel.targetSlipDays > 0) {
        add({
          ruleId: 'HIRE-03',
          domain: 'Hiring',
          title: `“${requisition.title}” is ${funnel.targetSlipDays} days past its target start`,
          detail: 'Either the start date or the plan it protects has to change. Leaving both in place means the team absorbs the gap silently, which is how a hiring delay becomes an overload problem.',
          severity: funnel.targetSlipDays > 45 ? 4 : 3,
          confidence: 'high',
          evidence: [
            `Target start: ${requisition.targetStartOn}`,
            `Candidates still active: ${funnel.active}`,
            funnel.cycleMedianDays !== null
              ? `Observed cycle time: ${funnel.cycleMedianDays} days over ${funnel.cycleObservations} hire(s)`
              : funnel.cycleReason,
          ],
          action: { label: 'Re-plan the date or widen the search', route: `#/hiring/${requisition.id}` },
        });
      }

      if (!(requisition.competencies || []).length) {
        add({
          ruleId: 'HIRE-04',
          domain: 'Hiring',
          title: `“${requisition.title}” has no competencies to assess against`,
          detail: 'Without written competencies, interviews measure how much the candidate reminds you of yourself. Two to five observable capabilities are enough to make the process structured and defensible.',
          severity: 3,
          confidence: 'high',
          evidence: ['Zero competencies recorded on the requisition', `${funnel.applied} candidate(s) in the process`],
          action: { label: 'Add the competencies', route: `#/hiring/${requisition.id}` },
        });
      }

      if (!row.effort) {
        add({
          ruleId: 'HIRE-05',
          domain: 'Hiring',
          title: `Interview effort for “${requisition.title}” is not in the capacity plan`,
          detail: `The plan cannot see the interviews this role needs, so the team looks more available than it is. ${row.effortSuggested.measured ? `A rough estimate from the current pipeline is about ${row.effortSuggested.mostLikely} person-day(s) (${row.effortSuggested.basis}).` : 'Add candidates first, then estimate.'} Nothing is reserved until you record it.`,
          severity: 2,
          confidence: 'medium',
          evidence: [row.effortSuggested.measured ? row.effortSuggested.basis : 'No active candidates yet'],
          action: { label: 'Record the interview effort', route: `#/hiring/${requisition.id}` },
        });
      }

      for (const { candidate, assessment } of candidateRows) {
        if (!['final', 'offer'].includes(candidate.stage)) continue;
        if (!assessment.blockers.length) continue;
        add({
          ruleId: 'HIRE-06',
          domain: 'Hiring',
          title: `${candidate.name}: final-round decision is short on evidence`,
          detail: `This is the most consequential decision in the process, and the record shows ${assessment.blockers.map((b) => b.message).join(' ')} The app will not stop you; it will write down that you proceeded without it.`,
          severity: 3,
          confidence: 'high',
          evidence: [
            `Evidence weight ${assessment.audit.totalWeight.toFixed(2)} across ${assessment.audit.signalCount} observation(s) and ${assessment.audit.distinctKinds} method(s)`,
            assessment.coverage.measured
              ? `Competency coverage ${assessment.coverage.pct}%${assessment.coverage.requiredUncovered.length ? `, missing ${assessment.coverage.requiredUncovered.map((c) => c.name).join(', ')}` : ''}`
              : 'No competencies defined for the role',
            assessment.flip
              ? assessment.flip.direction === 'none'
                ? 'The estimate is already past the decision line'
                : `${assessment.flip.count} strong contrary ${assessment.flip.kindLabel.toLowerCase()} observation(s) would move the estimate across the 50% line`
              : 'No sensitivity test available',
          ],
          action: { label: 'Record the missing evidence', route: `#/hiring/${requisition.id}?candidate=${candidate.id}` },
        });
      }

      if (row.parity.measured && row.parity.uneven.length) {
        add({
          ruleId: 'HIRE-07',
          domain: 'Hiring',
          title: `“${requisition.title}”: the same competencies were not assessed for everyone`,
          detail: 'An uneven process is the most common way a fair decision still looks unfair later. Either assess the missing competency for everyone in the running, or record why the process changed.',
          severity: 2,
          confidence: 'medium',
          evidence: row.parity.uneven
            .slice(0, 3)
            .map((r) => `${r.name}: assessed for ${r.covered} of ${r.total} candidates`),
          action: { label: 'Review the process', route: `#/hiring/${requisition.id}` },
        });
      }
    }

    // Data minimisation is a finding, not a housekeeping task: a record you
    // cannot justify keeping is a liability with no decision value left in it.
    const retention = hiring.retention;
    if (retention.enabled && retention.count) {
      add({
        ruleId: 'HIRE-08',
        domain: 'Hiring',
        title: `${retention.count} candidate record(s) are past your ${retention.windowDays}-day retention window`,
        detail:
          'Candidate records hold the most sensitive notes in this workspace and are the least useful once the decision is made and the role is closed. Nothing is deleted automatically — deleting on a timer could destroy the reasoning behind a decision someone is still asking about. Review the list and remove the records you no longer need; records you deliberately keep in touch with are already exempt.',
        severity: retention.oldestDays > retention.windowDays * 2 ? 3 : 2,
        confidence: 'high',
        evidence: [
          `Oldest record: ${retention.oldestDays} days since the last recorded fact`,
          `Window: ${retention.windowDays} days (Settings → candidate retention)`,
          retention.exempt.length
            ? `${retention.exempt.length} record(s) exempt because they are marked “keep in touch”`
            : 'No records exempted by “keep in touch”',
          'Deletion is manual, audited, and also removes the evidence and graph edges for that candidate',
        ],
        action: { label: 'Review the retention list', route: '#/hiring' },
      });
    }

  // ── Organizational Design, Team Topologies & Change Execution ──
  const chgRollup = changesRollup(state, now);
  for (const s of chgRollup.open) {
    const chg = s.change;
    const owner = chg.ownerId ? people.find((p) => p.id === chg.ownerId) : null;

    // CHG-01: Force-field equilibrium blocked or high-tension stalemate on committed change
    if (s.committed && (s.forceField.equilibrium === 'blocked' || s.forceField.highTensionStalemate)) {
      const topBarrier = s.forceField.unmitigatedRestraining
        .slice()
        .sort((a, b) => b.weight - a.weight)[0] || null;
      add({
        ruleId: 'CHG-01',
        domain: 'Org design & change',
        personId: owner?.id || null,
        personName: owner?.name || null,
        title: s.forceField.highTensionStalemate
          ? `“${chg.title}”: high-tension force-field stalemate (${s.forceField.drivingSum} vs ${s.forceField.effectiveRestrainingSum})`
          : `“${chg.title}”: restraining forces outweigh driving forces (${s.forceField.effectiveRestrainingSum} vs ${s.forceField.drivingSum})`,
        detail:
          'Lewin (1951): pushing harder on driving forces when restraining barriers remain intact raises organizational tension and resistance without shifting equilibrium. Mitigate or weaken the top restraining force directly.',
        severity: 4,
        confidence: 'high',
        evidence: [
          `Driving sum: ${s.forceField.drivingSum} · Effective restraining sum: ${s.forceField.effectiveRestrainingSum}`,
          `${s.forceField.unmitigatedRestraining.length} unmitigated restraining force(s)`,
          topBarrier
            ? `Strongest barrier: “${topBarrier.label}” (${topBarrier.weight}/5)`
            : 'Restraining barriers active',
        ],
        action: { label: 'Mitigate restraining forces', route: `#/changes/${chg.id}` },
      });
    }

    // CHG-02: Kotter foundational skip or unaligned Tsebelis veto player on active change
    const skippedFoundations = s.kotter.hasSkippedFoundations;
    const unalignedVeto = s.coalition.unalignedVetoPlayers.length > 0;
    if (s.committed && (skippedFoundations || unalignedVeto)) {
      const opposingVeto = s.coalition.unalignedVetoPlayers.some(
        (v) => v.stance === 'blocker' || v.stance === 'skeptical',
      );
      add({
        ruleId: 'CHG-02',
        domain: 'Org design & change',
        personId: owner?.id || null,
        personName: owner?.name || null,
        title: unalignedVeto
          ? `“${chg.title}”: ${s.coalition.unalignedVetoPlayers.length} veto player(s) not yet aligned`
          : `“${chg.title}”: advanced to ${s.kotter.currentMeta.label} with ${s.kotter.skippedSteps.length} skipped Kotter step(s)`,
        detail: unalignedVeto
          ? 'Tsebelis (2002) & Kotter (1996): an unaligned veto gatekeeper can stall or reverse structural execution regardless of team effort. Brief and align them before pushing deeper into execution.'
          : 'Kotter (1995): skipping foundational steps creates only the illusion of speed and regularly produces downstream regression.',
        severity: opposingVeto || s.kotter.skippedSteps.length >= 2 ? 4 : 3,
        confidence: 'high',
        evidence: [
          ...(unalignedVeto
            ? [`Unaligned veto player(s): ${s.coalition.unalignedVetoPlayers.map((v) => `${v.name} (${v.stance})`).join(', ')}`]
            : []),
          ...(skippedFoundations
            ? [`Skipped step(s): ${s.kotter.skippedSteps.map((st) => st.label).join(', ')}`]
            : []),
          `Current Kotter stage: ${s.kotter.currentMeta.label}`,
        ],
        action: { label: 'Align coalition & steps', route: `#/changes/${chg.id}` },
      });
    }

    // CHG-03: Team Topologies anti-pattern or high target cognitive load
    if (s.topology.antiPatterns.length > 0) {
      const leadPattern = s.topology.antiPatterns[0];
      add({
        ruleId: 'CHG-03',
        domain: 'Org design & change',
        personId: owner?.id || null,
        personName: owner?.name || null,
        title: `“${chg.title}”: ${leadPattern.title}`,
        detail: leadPattern.detail,
        severity: s.committed && (s.topology.cognitiveLoadTarget ?? 0) >= 4 ? 4 : 3,
        confidence: 'high',
        evidence: [
          s.topology.loadMeasured
            ? `Cognitive load: ${s.topology.cognitiveLoadBefore}/5 → ${s.topology.cognitiveLoadTarget}/5`
            : 'Cognitive load not yet rated',
          `Interaction mode: ${s.topology.interactionModeLabel} · Bilateral coordination channels: ${s.topology.coordinationChannels}`,
          s.topology.handoffsMeasured
            ? `Blocking handoffs: ${s.topology.blockingHandoffsBefore} → ${s.topology.blockingHandoffsTarget}`
            : 'Blocking handoffs not yet measured',
        ],
        action: { label: 'Reshape team boundaries', route: `#/changes/${chg.id}` },
      });
    }

    // CHG-04: Galbraith Star reward-structure mismatch or missing non-goals on structural change
    if (s.committed && (s.star.incentiveMismatchWarning || (!s.star.hasNonGoals && ['topology', 'reporting-line', 'charter'].includes(chg.kind)))) {
      add({
        ruleId: 'CHG-04',
        domain: 'Org design & change',
        personId: owner?.id || null,
        personName: owner?.name || null,
        title: s.star.incentiveMismatchWarning
          ? `“${chg.title}”: structure/process redesigned without aligning incentives & goals`
          : `“${chg.title}”: structural change has no explicit non-goals recorded`,
        detail: s.star.incentiveMismatchWarning || s.star.missingNonGoalsWarning,
        severity: 3,
        confidence: 'medium',
        evidence: [
          `Galbraith Star alignment: ${s.star.alignedCount}/5 pillars specified`,
          s.star.incentiveMismatchWarning
            ? 'Rewards & goals pillar is incomplete while Structure is changing'
            : 'Explicit non-goals field is blank',
        ],
        action: { label: 'Align Star & trade-offs', route: `#/changes/${chg.id}` },
      });
    }

    // CHG-05: Stale review, overdue coalition brief, or stabilising without verified metric shift
    const unverifiedStabilising =
      chg.status === 'stabilising' &&
      (s.metrics.total === 0 || (s.metrics.verifiedShiftCount === 0 && (daysSince(chg.openedOn, now) ?? 0) >= 21));
    const daysPastReview = s.daysUntilReview !== null && s.daysUntilReview < 0 ? Math.abs(s.daysUntilReview) : 0;
    if (s.reviewOverdue || s.coalition.overdueBriefs.length > 0 || unverifiedStabilising) {
      add({
        ruleId: 'CHG-05',
        domain: 'Org design & change',
        personId: owner?.id || null,
        personName: owner?.name || null,
        title: unverifiedStabilising
          ? `“${chg.title}”: stabilising without a verified XmR metric shift`
          : s.reviewOverdue
            ? `“${chg.title}”: change review overdue (${daysPastReview}d past ${chg.reviewOn})`
            : `“${chg.title}”: ${s.coalition.overdueBriefs.length} coalition briefing(s) overdue`,
        detail: unverifiedStabilising
          ? 'Kotter Step 8 & Wheeler XmR: do not declare victory or anchor a change before operational metrics distinguish a real signal shift from routine noise.'
          : 'Organizational transitions drift back to old habits when coalition check-ins and review cadences slip.',
        severity: s.reviewOverdue && daysPastReview > 14 ? 3 : 2,
        confidence: 'high',
        evidence: [
          ...(s.reviewOverdue ? [`Review date ${chg.reviewOn} (${daysPastReview}d overdue)`] : []),
          ...(s.coalition.overdueBriefs.length
            ? [`Overdue brief(s): ${s.coalition.overdueBriefs.map((b) => b.name).join(', ')}`]
            : []),
          ...(unverifiedStabilising
            ? [`Metrics tracked: ${s.metrics.total} · Verified XmR shifts: ${s.metrics.verifiedShiftCount}`]
            : []),
        ],
        action: { label: 'Review & record telemetry', route: `#/changes/${chg.id}` },
      });
    }
  }

  // ── Statistical Process Control (SPC-01): Special-cause adverse variation ──
  {
    const todayStr = dayKey(now);
    const spcTriggers = [];

    for (const s of chgRollup.open) {
      for (const m of s.metrics.rows) {
        if (m.spc.available && m.spc.regime === 'special-cause-adverse') {
          const sig = m.spc.recentSignals.find((x) => x.polarity === 'adverse')
            || m.spc.signals.find((x) => x.polarity === 'adverse')
            || m.spc.signals[0];
          spcTriggers.push({
            domain: 'Org design & change',
            title: `SPC special-cause degradation on “${m.name}” (${s.change.title})`,
            evidence: [
              `Center line X̄ = ${m.spc.mean}${m.unit ? ` ${m.unit}` : ''} · Natural limits [${m.spc.lnpl ?? '—'}, ${m.spc.unpl ?? '—'}]`,
              sig ? `${sig.ruleCode}: ${sig.summary}` : 'Special-cause adverse signal detected',
            ],
            route: `#/changes/${s.change.id}`,
          });
        }
      }
    }

    // Fortnightly feedback latency XmR (6 x 14-day windows, lower is better)
    const latencySeries = [];
    for (let i = 0; i < 6; i += 1) {
      const pEnd = addDays(todayStr, -(5 - i) * 14);
      const pStart = addDays(pEnd, -13);
      const winFb = (state.feedback || []).filter(
        (f) => f.direction === 'given' && f.date && f.date >= pStart && f.date <= pEnd && f.date <= todayStr,
      );
      const lat = feedbackLatencySummary(winFb, state.settings?.feedbackLatencyTargetDays ?? 7);
      latencySeries.push({
        date: pEnd,
        label: pEnd,
        value: lat.samples > 0 ? lat.average : null,
      });
    }
    const latSpc = computeXmR(latencySeries, { desirableDirection: 'lower', minBound: 0, unit: 'd' });
    if (latSpc.available && latSpc.regime === 'special-cause-adverse' && latSpc.recentSignals.length > 0) {
      const latestAdverse = latSpc.recentSignals.find((sig) => sig.polarity === 'adverse');
      if (latestAdverse) {
        spcTriggers.push({
          domain: 'Feedback',
          title: 'Feedback latency breached its XmR natural process limit (special-cause delay)',
          evidence: [
            `Fortnightly latency center line X̄ = ${latSpc.mean}d · Upper natural limit UNPL = ${latSpc.unpl}d`,
            `${latestAdverse.ruleCode}: ${latestAdverse.summary}`,
          ],
          route: '#/health',
        });
      }
    }

    for (const trig of spcTriggers.slice(0, 2)) {
      add({
        ruleId: 'SPC-01',
        domain: trig.domain,
        title: trig.title,
        detail:
          'Shewhart / Wheeler XmR process control: this movement sits outside routine period-to-period noise (3-sigma natural process limits or run rules). Investigate the specific assignable cause rather than treating it as random fluctuation.',
        severity: 3,
        confidence: 'high',
        evidence: trig.evidence,
        action: { label: 'Inspect XmR control chart', route: trig.route },
      });
    }
  }

  // ── Seeded Monte Carlo Portfolio & J-Curve Tail Risk (SIM-01, SIM-02) ──
  if ((state.portfolio || []).length > 0 || chgRollup.open.length > 0) {
    const fastTrials = (state.portfolio || []).length > 60
      ? 350
      : Math.min(state.settings?.simulationTrials ?? 1000, 1000);
    const jointSim = simulateJointWorkspace(state, { now, trials: fastTrials });
    const pfSim = jointSim.portfolio;

    if (pfSim.available) {
      const slipDays = pfSim.bottleneckCompletion.slipDaysVsTeamP80;
      const topBn = pfSim.bottleneckCompletion.topBottlenecks[0] || null;
      const tailTrap = pfSim.flawOfAveragesTrap;

      if (tailTrap || slipDays >= 7) {
        add({
          ruleId: 'SIM-01',
          domain: 'Capacity & flow',
          personId: !tailTrap && topBn ? topBn.personId : null,
          personName: !tailTrap && topBn ? topBn.name : null,
          title: tailTrap
            ? `Monte Carlo horizon breach risk is ${Math.round(pfSim.overloadProbability * 100)}% despite a feasible mean plan`
            : `Critical-chain owner contention slips funded P80 delivery by ${slipDays} days (${pfSim.teamCompletion.p80} → ${pfSim.bottleneckCompletion.p80})`,
          detail: tailTrap
            ? 'Savage (2009) Flaw of Averages: right-skewed Beta-PERT estimates push P80 demand past allocatable supply even when expected person-days appear to fit.'
            : 'Goldratt (1997) Critical Chain: summing team-wide supply assumes people are interchangeable, whereas parallel commitments concentrated on one bottleneck owner delay joint completion.',
          severity: tailTrap && pfSim.overloadProbability >= 0.7 ? 4 : 3,
          confidence: 'high',
          evidence: [
            `Seeded Monte Carlo (${pfSim.trials} trials, seed ${pfSim.seed}): P50 ${pfSim.committedDemand.p50}d · P80 ${pfSim.committedDemand.p80}d vs ${pfSim.allocatableDays}d allocatable (${Math.round(pfSim.horizonFitProbability * 100)}% fit confidence)`,
            pfSim.bottleneckCompletion.available
              ? `Fungible team P80: ${pfSim.teamCompletion.p80} · Owner-constrained P80: ${pfSim.bottleneckCompletion.p80}`
              : 'No funded projects with effort estimates',
            ...(topBn
              ? [`Binding owner in ${Math.round(topBn.criticalShare * 100)}% of trials: ${topBn.name} (${Math.round(topBn.overloadProbability * 100)}% personal overload odds)`]
              : []),
          ],
          action: { label: 'Inspect Monte Carlo distribution', route: '#/capacity' },
        });
      }
    }

    for (const row of jointSim.openChangeSimulations) {
      const chg = row.change;
      const cSim = row.simulation;
      const owner = chg.ownerId ? people.find((p) => p.id === chg.ownerId) : null;
      const highLossOdds = cSim.horizonNet.probabilityLoss >= 0.35;
      const p80Unrecovered = cSim.transitionCost > 0 && cSim.paybackMonths.p80 === null;
      if (highLossOdds || p80Unrecovered) {
        add({
          ruleId: 'SIM-02',
          domain: 'Org design & change',
          personId: owner?.id || null,
          personName: owner?.name || null,
          title: highLossOdds
            ? `“${chg.title}”: ${Math.round(cSim.horizonNet.probabilityLoss * 100)}% J-curve probability of net loss over ${cSim.horizonMonths}m`
            : `“${chg.title}”: J-curve P80 payback exceeds the ${cSim.horizonMonths}-month horizon`,
          detail:
            'Satir J-Curve & stochastic capital budgeting: transition effort overruns, portfolio congestion, and structural feasibility discounts delay break-even beyond naive point-estimate payback.',
          severity: cSim.horizonNet.probabilityLoss >= 0.5 ? 4 : 3,
          confidence: 'high',
          evidence: [
            `Horizon net (${cSim.currency}): P10 ${cSim.horizonNet.p10} · P50 ${cSim.horizonNet.p50} · P90 ${cSim.horizonNet.p90} (${Math.round(cSim.horizonNet.probabilityPositive * 100)}% positive)`,
            `Payback: naive ${cSim.paybackMonths.deterministic ?? '—'}m vs Monte Carlo P50 ${cSim.paybackMonths.p50 ?? `>${cSim.horizonMonths}`}m · P80 ${cSim.paybackMonths.p80 ?? `>${cSim.horizonMonths}`}m`,
          ],
          action: { label: 'Inspect J-curve fan chart', route: `#/changes/${chg.id}` },
        });
      }
    }

    // ── Counterfactual Pareto Relief Opportunity (SCN-01) ───────────────
    if (
      pfSim.available &&
      (pfSim.overloadProbability >= 0.35 || pfSim.bottleneckCompletion.slipDaysVsTeamP80 >= 7)
    ) {
      const candidatePresets = buildSuggestedScenarios(state, { now }).slice(0, 2);
      if (candidatePresets.length > 0) {
        const scnTrials = 200;
        const scnCmp = compareScenarios(state, candidatePresets, { now, trials: scnTrials });
        const relief = scnCmp.bestRelief;
        if (
          relief &&
          (relief.deltas.overloadProbability <= -0.15 || relief.deltas.effectiveP80Days <= -5)
        ) {
          const dropPp = Math.round(-relief.deltas.overloadProbability * 100);
          const fasterDays = -relief.deltas.effectiveP80Days;
          const baselineDominated = !scnCmp.baseline.paretoOptimal;
          add({
            ruleId: 'SCN-01',
            domain: 'Capacity & flow',
            title: baselineDominated
              ? `Live plan is Pareto-dominated — “${relief.name}” cuts overload risk by ${Math.max(0, dropPp)}pp`
              : `Counterfactual relief available: “${relief.name}” saves ${fasterDays > 0 ? `${fasterDays}d at P80` : `${dropPp}pp overload risk`}`,
            detail:
              'Pareto (1906) Dominance & Common Random Numbers (Law & Kelton, 2000): evaluating concrete scope, bottleneck-owner, risk-mitigation, and org-change levers on identical Monte Carlo trials exposes a strictly safer trade-off before making promises.',
            severity: baselineDominated && pfSim.overloadProbability >= 0.5 ? 4 : 3,
            confidence: 'high',
            evidence: [
              `Baseline: ${Math.round(scnCmp.baseline.monteCarlo.overloadProbability * 100)}% overload odds · P80 ${scnCmp.baseline.monteCarlo.effectiveP80Date || `${scnCmp.baseline.monteCarlo.effectiveP80Days}d`}`,
              `${relief.name}: ${Math.round(relief.monteCarlo.overloadProbability * 100)}% overload odds (${relief.deltas.overloadProbability <= 0 ? '' : '+'}${Math.round(relief.deltas.overloadProbability * 100)}pp) · P80 ${relief.monteCarlo.effectiveP80Date || `${relief.monteCarlo.effectiveP80Days}d`} (${relief.deltas.effectiveP80Days <= 0 ? '' : '+'}${relief.deltas.effectiveP80Days}d)`,
              ...(relief.brooksLawTrap
                ? ['Warning: near-term hiring alone triggers Brooks’s Law mentoring drag inside this horizon']
                : []),
            ],
            action: { label: 'Compare scenarios in sandbox', route: '#/scenarios' },
          });
        }
      }
    }
  }

  // ── Negotiation Workbench (Fisher & Ury; Raiffa ZOPA) ────────────────
  const negotiations = Array.isArray(state.negotiations) ? state.negotiations : [];
  for (const record of negotiations) {
    const summary = summarizeNegotiation(record, state, now);
    const route = `#/negotiations/${record.id}`;
    if (record.status === 'impasse' && !summary.escalationCase) {
      add({
        ruleId: 'NEG-05',
        domain: 'Negotiation',
        title: `“${record.title}” is at impasse without an escalation case`,
        detail: 'A deadlock with no operational case is invisible to FMEA, DACI and capacity rules. RULE-NEG-03 raises one automatically when auto-propagation runs.',
        severity: 4,
        confidence: 'high',
        evidence: [`Status: impasse since ${record.closedOn || record.openedOn}`, 'No open escalation case linked'],
        action: { label: 'Open negotiation', route },
      });
    }
    const returned = (state.delegations || []).filter(
      (d) =>
        d.sourceNegotiationId === record.id &&
        d.status === 'returned' &&
        !d.supersededByDelegationId &&
        (record.agreedTerms || []).some((t) => t.id === d.sourceTermId),
    );
    if (record.status === 'agreed' && returned.length) add({
      ruleId: 'NEG-07', domain: 'Negotiation', severity: 4, confidence: 'high',
      title: `Agreement “${record.title}” has ${returned.length} returned commitment(s)`,
      detail: 'An agreement is not delivery. Review why the work returned and explicitly arrange recovery; no replacement owner is assigned automatically.',
      evidence: returned.slice(0, 3).map((d) => d.title),
      action: { label: 'Review agreement delivery', route },
    });
    if (record.status === 'agreed' && summary.settlementEvaluation?.adverseGovernanceTrigger) {
      const se = summary.settlementEvaluation;
      const reasonTitle = se.batnaBreached
        ? `Settled outcome on “${record.title}” breached the walk-away BATNA`
        : se.counterpartyBreach
          ? `Counterparty delivery breach on settled agreement “${record.title}”`
          : `Agreement “${record.title}” settled with a ${se.shortfallPct}% implementation shortfall`;
      add({
        ruleId: 'NEG-08',
        domain: 'Negotiation',
        severity: 4,
        confidence: 'high',
        title: reasonTitle,
        detail: 'Williamson (1985) Ex-Post Governance & Perold (1988) Implementation Shortfall: a signed agreement whose realised outcome violates the walk-away BATNA or suffers material execution slippage requires a deliberate remediation or BATNA-execution decision (RULE-NEG-06).',
        evidence: [
          ...(se.realisedValue !== null
            ? [`Realised ${se.stakesCurrency} ${se.realisedValue.toLocaleString('en-US')}${se.stakesValue !== null ? ` vs ${se.stakesValue.toLocaleString('en-US')} agreed` : ''}`]
            : []),
          ...(se.batnaBreached && se.batnaValue !== null ? [`Walk-away BATNA: ${se.batnaValue.toLocaleString('en-US')} ${se.batnaUnit}`] : []),
          ...(se.counterpartyBreach ? [`Counterparty ${record.counterparty || 'counterparty'} did not deliver agreed terms`] : []),
        ],
        action: { label: 'Review settlement governance', route },
      });
    } else if (
      record.status === 'agreed' &&
      summary.highStakes &&
      summary.delivery?.total > 0 &&
      summary.delivery?.complete &&
      !summary.settlementEvaluation?.settled
    ) {
      add({
        ruleId: 'NEG-08',
        domain: 'Negotiation',
        severity: 2,
        confidence: 'high',
        title: `All commitments delivered on high-stakes agreement “${record.title}” — record settled actuals`,
        detail: 'Every delegated commitment on this agreement is complete, but the realised deal value and counterparty delivery outcome have not been settled yet. Record what actually materialised rather than assuming paper terms held.',
        evidence: [
          `${summary.delivery.delivered}/${summary.delivery.total} agreed term(s) delivered`,
          record.strategic ? 'Marked strategic' : `Recorded deal value ${record.stakesCurrency} ${record.stakesValue?.toLocaleString('en-US') || ''}`,
        ],
        action: { label: 'Record agreement settlement', route },
      });
    }
    if (!summary.open) continue;
    if (summary.highStakes && !record.ourBatnaDescription) {
      add({
        ruleId: 'NEG-01',
        domain: 'Negotiation',
        title: `High-stakes negotiation “${record.title}” has no BATNA recorded`,
        detail: 'Fisher & Ury (1981): negotiating without a concrete best alternative weakens every reservation price and makes concessions unprincipled. Define the walk-away course before the next session.',
        severity: 4,
        confidence: 'high',
        evidence: [
          record.strategic ? 'Marked strategic' : `Recorded deal value ${record.stakesCurrency} ${record.stakesValue?.toLocaleString('en-US') || ''}`,
          'BATNA description blank',
        ],
        action: { label: 'Complete negotiation prep', route },
      });
    }
    if (summary.sessionOverdue) {
      add({
        ruleId: 'NEG-02',
        domain: 'Negotiation',
        title: `Negotiation session for “${record.title}” is overdue`,
        detail: 'Momentum and information decay between sessions; reschedule or deliberately park the negotiation rather than leaving an open date in the past.',
        severity: 4,
        confidence: 'high',
        evidence: [`Next session was due ${record.nextSessionOn}`],
        action: { label: 'Open negotiation', route },
      });
    } else if (summary.sessionDueSoon && summary.weakPrepBeforeSession) {
      add({
        ruleId: 'NEG-03',
        domain: 'Negotiation',
        title: `“${record.title}” meets within ${3} days but prep is under 50% complete`,
        detail: 'BATNA, reservation prices, interests and objective criteria are the preparation that principled negotiation depends on; walking in under-prepared concedes the agenda.',
        severity: 3,
        confidence: 'high',
        evidence: [`Session on ${record.nextSessionOn}`, `Prep completeness ${summary.prep.completenessPct}%`],
        action: { label: 'Finish prep', route },
      });
    }
    const heavyGap = summary.blockingGaps.find((a) => a.weight >= 4);
    if (heavyGap) {
      add({
        ruleId: 'NEG-04',
        domain: 'Negotiation',
        title: `No ZOPA on “${heavyGap.name}” — reservation gap ${heavyGap.gap} ${heavyGap.unit || ''}`,
        detail: 'Raiffa (1982): with no overlap in reservation prices, closing the gap needs new options, objective criteria or a stronger BATNA — not bargaining pressure. Recheck the counterparty estimate confidence before treating the gap as fixed.',
        severity: 3,
        confidence: 'medium',
        evidence: [`Issue weight ${heavyGap.weight}/5`, `Gap ${heavyGap.gap} ${heavyGap.unit || ''}`],
        action: { label: 'Re-work the issue', route },
      });
    }
    if (summary.reviewOverdue) {
      add({
        ruleId: 'NEG-02',
        domain: 'Negotiation',
        title: `Negotiation review for “${record.title}” is overdue`,
        detail: 'The recorded review date has passed; refresh reservation prices, estimates and the BATNA before the next contact.',
        severity: 2,
        confidence: 'high',
        evidence: [`Review was due ${record.reviewOn}`],
        action: { label: 'Open negotiation', route },
      });
    }
  }
  // Ownerless agreed terms: an ownership gap, never an auto-assignment.
  for (const record of negotiations.filter((n) => n.status === 'agreed')) {
    const unowned = (n) => (n.agreedTerms || []).filter((t) => !t.ownerId);
    const terms = unowned(record);
    if (terms.length) {
      add({
        ruleId: 'NEG-06',
        domain: 'Negotiation',
        title: `${terms.length} agreed term${terms.length === 1 ? '' : 's'} in “${record.title}” have no owner`,
        detail: 'An unowned commitment is a promise the system cannot track. Assign an owner so RULE-NEG-02 can create the follow-up delegation, or consciously leave it as a recorded gap.',
        severity: 3,
        confidence: 'high',
        evidence: terms.slice(0, 3).map((t) => t.text),
        action: { label: 'Edit agreed terms', route: `#/negotiations/${record.id}` },
      });
    }
  }


  // ── Budget & financial commitments (budgetary control; encumbrance accounting) ──
  const finance = budgetsRollup(state, now);
  for (const summary of finance.active) {
    const budget = summary.record;
    const ev = summary.evaluation;
    const route = `#/finance/${budget.id}`;
    if (ev.breach) {
      add({
        ruleId: 'FIN-01', domain: 'Finance', severity: 4, confidence: 'high',
        title: `Budget “${budget.name}” forecasts a breach of its envelope`,
        detail: 'Budgetary control works on the forecast, while release is still possible: recorded actuals plus open encumbrances already exceed the recorded ceiling. RULE-FIN-01 opens one DACI trade-off; underspend elsewhere does not fix this silently.',
        evidence: [
          `Forecast at completion ${formatMoney(budget.currency, ev.forecastAtCompletion)} vs ceiling ${formatMoney(budget.currency, ev.limit)}`,
          `${formatMoney(budget.currency, ev.spentKnown)} spent + ${formatMoney(budget.currency, ev.committedOpen)} committed`,
          ...(ev.forecastUnderstated ? ['Forecast is understated: some lines are unpriced or missing actuals'] : []),
        ],
        action: { label: 'Open budget', route },
      });
    } else {
      const calibrated = calibratedForecast(budget, state, now);
      if (ev.watch || ev.pipelineBreach || calibrated?.calibratedBreach) {
        add({
          ruleId: 'FIN-02', domain: 'Finance', severity: 3, confidence: 'high',
          title: ev.watch
            ? `Budget “${budget.name}” is in the watch zone (${Math.round(ev.forecastUtilisation * 100)}% forecast)`
            : ev.pipelineBreach
              ? `Planned pipeline would breach budget “${budget.name}”`
              : `Calibrated forecast breaches budget “${budget.name}”`,
          detail: 'An envelope is a ceiling, not a target. Decide now which planned lines are real commitments and which are options, before encumbrance makes the choice for you. The watch share is a team convention (Settings), not a financial standard.',
          evidence: [
            `Forecast ${formatMoney(budget.currency, ev.forecastAtCompletion)} of ${formatMoney(budget.currency, ev.limit)}`,
            ...(ev.pipelineBreach ? [`Including planned pipeline: ${formatMoney(budget.currency, ev.pipelineExposure)}`] : []),
            ...(calibrated?.calibratedBreach ? [`Commitment history lands at a median ${calibrated.medianRatio}x (n=${calibrated.n}): calibrated forecast ${formatMoney(budget.currency, calibrated.calibratedForecast)}`] : []),
          ],
          action: { label: 'Review budget', route },
        });
      }
    }
    const sourceCompletedLines = (budget.lines || []).filter(
      (l) => l.status === 'committed' && !l.actualsDueOn && sourceCompletion(state, l.sourceType, l.sourceId).completed,
    );
    const dueCount = ev.actualsDueLines.length + ev.missingActualLines.length + sourceCompletedLines.length;
    if (dueCount) {
      add({
        ruleId: 'FIN-03', domain: 'Finance', severity: 3, confidence: 'high',
        title: `${dueCount} budget line${dueCount === 1 ? '' : 's'} in “${budget.name}” need recorded actuals`,
        detail: 'The funded work has completed or the line was marked spent, but no evidenced actual is recorded. Record what the invoice/finance report says — never copy the committed figure, which would fake a perfect calibration score.',
        evidence: [
          ...ev.actualsDueLines.slice(0, 2).map((l) => `“${l.title}” — funded work completed ${l.actualsDueOn}`),
          ...sourceCompletedLines.slice(0, 2).map((l) => `“${l.title}” — funded ${l.sourceType} completed`),
          ...ev.missingActualLines.slice(0, 2).map((l) => `“${l.title}” — marked spent without an actual amount`),
        ],
        action: { label: 'Record actuals', route },
      });
    }
    const periodEnded = budget.endsOn && ev.daysToPeriodEnd !== null && ev.daysToPeriodEnd < 0;
    if (ev.overdueLines.length || periodEnded) {
      add({
        ruleId: 'FIN-05', domain: 'Finance', severity: periodEnded ? 3 : 2, confidence: 'high',
        title: periodEnded
          ? `Budget “${budget.name}” period ended with open commitments`
          : `${ev.overdueLines.length} commitment${ev.overdueLines.length === 1 ? '' : 's'} in “${budget.name}” passed their expected spend date`,
        detail: 'Close the loop honestly: record the actual, move the expected date with a reason, or release the authority. Returning unspent budget is not failure — expiring-budget research (Liebman & Mahoney, 2017) shows use-it-or-lose-it surges buy lower-quality outcomes.',
        evidence: [
          ...(periodEnded ? [`Period ended ${budget.endsOn}; forecast still open at ${formatMoney(budget.currency, ev.forecastAtCompletion)}`] : []),
          ...ev.overdueLines.slice(0, 3).map((l) => `“${l.title}” expected ${l.expectedOn}`),
        ],
        action: { label: 'Review stale commitments', route },
      });
    }
  }
  const commitCal = commitmentCalibration(state);
  if (commitCal.materialOverrun) {
    add({
      ruleId: 'FIN-04', domain: 'Finance', severity: 3, confidence: 'medium',
      title: `Budget commitments land at a median ${commitCal.medianRatio}x their committed amount`,
      detail: 'Reference-class read across every scored commitment (Flyvbjerg, 2006): encumbrances are systematically optimistic. Review estimating practice and contingency before approving the next envelope at face value; this is an aggregate pattern, not a score for any person.',
      evidence: [
        `n=${commitCal.n} scored commitments; median ${commitCal.medianRatio}x, P80 ${commitCal.p80Ratio}x`,
        'Ratios pool across currencies without FX conversion; amounts never do',
      ],
      action: { label: 'Open calibration', route: '#/decisions' },
    });
  }

  // ── Stakeholder Influence Register (Mendelow; Mitchell/Agle/Wood; Tsebelis) ──
  const register = (state.stakeholders || []).filter((s) => s && s.status !== 'archived');
  if (register.length) {
    const sourceRoute = (sourceType, sourceId) => {
      if (sourceType === 'case') return `#/cases/${sourceId}`;
      if (sourceType === 'change') return `#/changes/${sourceId}`;
      return `#/negotiations/${sourceId}`;
    };

    // STK-01 / STK-05: veto gates across every open initiative.
    const vetoOverview = vetoRiskOverview(state, now);
    for (const row of vetoOverview.rows) {
      if (row.risk.opposingVetoCount > 0) {
        const adverse = row.risk.contributors.filter((c) => ADVERSE_STANCES.includes(c.stance));
        add({
          ruleId: 'STK-01',
          domain: 'Stakeholders',
          title: `Adverse veto player on “${row.title}”`,
          detail: 'Tsebelis (1995): a veto player at skeptical/blocker stance can empty the win-set. RULE-STK-02 opens a DACI alignment decision; do not treat the gate as routine stakeholder management.',
          severity: 5,
          confidence: 'high',
          evidence: adverse.map((c) => `${c.name} — ${c.stanceLabel}, power ${c.power}/5`),
          action: { label: 'Open the initiative', route: sourceRoute(row.sourceType, row.sourceId) },
        });
      }
      if (row.risk.band.id === 'blocked') {
        add({
          ruleId: 'STK-05',
          domain: 'Stakeholders',
          title: `Win-set likely empty on “${row.title}” (difficulty ${row.risk.difficulty}/100)`,
          detail: 'The stance-distance × power heuristic, including Tsebelis cohesion penalties, lands in the blocked band. The package itself likely needs redesign rather than more persuasion; the score is an operational heuristic, not a spatial model.',
          severity: 5,
          confidence: 'medium',
          evidence: [
            row.risk.rationale,
            ...row.risk.contributors.map((c) => `${c.name}: ${c.stanceLabel} (${c.points} pts)`),
          ],
          action: { label: 'Open the initiative', route: sourceRoute(row.sourceType, row.sourceId) },
        });
      }
    }

    // STK-02: embedded stubs with no register record (hygiene, strict match).
    const reconciliation = reconciliationReport(state);
    if (reconciliation.unmappedCount > 0) {
      add({
        ruleId: 'STK-02',
        domain: 'Stakeholders',
        title: `${reconciliation.unmappedCount} stakeholder${reconciliation.unmappedCount === 1 ? '' : 's'} appear on initiatives but are not in the register`,
        detail: 'Mendelow/Tsebelis analysis only runs for registered actors. Matching is deliberately strict (exact name or roster link) — a near-miss is reported here rather than guessed into an edge.',
        severity: 2,
        confidence: 'high',
        evidence: reconciliation.unmapped.slice(0, 3).map((u) => `“${u.name}” on ${u.sourceType} “${u.sourceTitle}”`),
        action: { label: 'Open the register', route: '#/stakeholders' },
      });
    }

    for (const record of register) {
      const stkRoute = `#/stakeholders/${record.id}`;
      const salience = classifySalience(record);

      // STK-03: high-salience contact cadence decay.
      if (HIGH_SALIENCE_CLASSES.includes(salience.salienceClass) && record.nextContactOn && isOverdue(record.nextContactOn, now)) {
        add({
          ruleId: 'STK-03',
          domain: 'Stakeholders',
          title: `Contact overdue with ${salience.classLabel.toLowerCase()} stakeholder “${record.name}”`,
          detail: 'Mitchell, Agle & Wood (1997): high-salience actors can move fastest when untouched. Mendelow cadence exists to prevent exactly this decay; log a contact to reschedule the next one.',
          severity: salience.salienceClass === 'definitive' ? 4 : 3,
          confidence: 'high',
          evidence: [`Next contact was due ${record.nextContactOn}`, `Salience: ${salience.classLabel} (${salience.subtitle})`],
          action: { label: 'Open stakeholder', route: stkRoute },
        });
      }

      // STK-04: recent adverse stance shift on a key player.
      const history = (record.stanceHistory || []).slice().sort((a, b) => String(b.on).localeCompare(String(a.on)));
      if (history.length > 1 && HIGH_SALIENCE_CLASSES.includes(salience.salienceClass)) {
        const latest = history[0];
        const previous = history[1];
        const shift = classifyStanceShift(previous.stance, latest.stance);
        const ageDays = daysSince(latest.on, now);
        if (shift.adverse && ageDays !== null && ageDays <= 14) {
          add({
            ruleId: 'STK-04',
            domain: 'Stakeholders',
            title: `${shift.label} on key player “${record.name}” (${previous.stance} → ${latest.stance})`,
            detail: 'Lax & Sebenius (2006): coalitions are won or lost in the two weeks after a stance moves. RULE-STK-03 queues a blameless 1:1 topic when the stakeholder links to a roster entry.',
            severity: 4,
            confidence: 'high',
            evidence: [
              `Recorded ${latest.on} (${ageDays} day${ageDays === 1 ? '' : 's'} ago)`,
              latest.context ? `Context: ${latest.context}` : 'No context recorded',
            ],
            action: { label: 'Open stakeholder', route: stkRoute },
          });
        }
      }

      // STK-06: urgency without a contact plan.
      if (['demanding', 'dangerous', 'dependent'].includes(salience.salienceClass) && !record.nextContactOn) {
        add({
          ruleId: 'STK-06',
          domain: 'Stakeholders',
          title: `Urgent ${salience.classLabel.toLowerCase()} stakeholder “${record.name}” has no next contact planned`,
          detail: 'The salience model flags urgency as the dynamic attribute: an uncontacted urgent claim can escalate a dormant or dependent actor into a dangerous one. Set a cadence and next contact.',
          severity: 3,
          confidence: 'medium',
          evidence: [`Salience: ${salience.classLabel} (${salience.subtitle})`, 'No next contact date recorded'],
          action: { label: 'Open stakeholder', route: stkRoute },
        });
      }

      // STK-07: veto assessment resting on weak evidence.
      if (record.vetoPlayer === true && record.estimateConfidence === 'low') {
        add({
          ruleId: 'STK-07',
          domain: 'Stakeholders',
          title: `Veto assessment of “${record.name}” is based on low-confidence evidence`,
          detail: `The veto flag and ${STAKEHOLDER_STANCE_LABELS[record.stance].toLowerCase()} stance currently rest on assumption, not direct evidence. Tsebelis gates drive DACI decisions — verify the gate before the whole campaign is steered around it.`,
          severity: 2,
          confidence: 'high',
          evidence: ['Estimate confidence: low — assumption, verify', record.vetoBasis ? `Recorded basis: ${record.vetoBasis}` : 'No veto basis recorded'],
          action: { label: 'Open stakeholder', route: stkRoute },
        });
      }
    }
  }

  // RULE-FCI-04 is write-free: it reads the same typed prediction atoms as
  // the Forecast Integrity Terminal and contributes FI-01..05 signals.
  for (const signal of forecastIntegritySignals(state, now)) add(signal);

  // RULE-DLY-06 is write-free: it reads the same cost-of-delay / EVSI model as
  // the Decision Tempo Terminal and contributes DLY-01..06 signals.
  for (const signal of decisionTempoSignals(state, now)) add(signal);

  // RULE-RES-06 (read-side): contributes RES-01..07 signals from the
  // Operational Resilience, Dependency & Continuity Terminal.
  for (const signal of resilienceSignals(state, now)) add(signal);

  // RULE-PWR-06 (read-side): contributes PWR-01..06 signals from the
  // Coalition & Incentive War Room.
  for (const signal of powerSignals(state, now)) add(signal);

  // Session 48 (read-side): the Influence Network Intelligence engine
  // contributes ORG-01..05 signals from the derived collaboration graph.
  for (const signal of networkSignals(state, now)) add(signal);

  // RULE-IMP-05 (read-side): the Impact Ledger contributes IMP-01..06 signals
  // from scored and outstanding pre-registered studies.
  for (const signal of impactSignals(state, now)) add(signal);
  // Schema v50: delivery readings become signals on the same surface, so a
  // programme that was never really delivered is visible before its outcome is
  // argued about.
  for (const signal of fidelitySignals(state, now)) add(signal);

  // Schema v32 (read-side): the Stakeholder Comms Outbox contributes COMMS-01..03
  // for drafts awaiting approval, approvals gone stale and closure notes owed.
  for (const signal of commsSignals(state, now)) add(signal);

  // Schema v33 (read-side): the Allocation Governor contributes ALLOC-01..05
  // for exploration starvation, an undecided rebalancing call, settled bets
  // without recorded outcomes, unmeasurable funded mix and evidence/plan drift.
  for (const signal of allocationSignals(state, now)) add(signal);
  for (const signal of loadSignals(state, now)) add(signal);
  // Schema v42 (read-side): the Strategy Coherence Terminal contributes
  // SCO-01..06 for a measured say–do gap, strategy-blind work, unfalsifiable
  // bets, overdue stop-rule verdicts, recent-flow drift and an organisation
  // funding work with no stated strategy at all.
  for (const signal of strategySignals(state, now)) add(signal);
  // Schema v43 (read-side): the After-Action Review & Learning Ledger
  // contributes LEARN-01..06 for closures waiting on a review, a repeated class
  // whose committed change was never made, committed changes still open,
  // reviews that taught nothing, a workspace that has never reviewed anything,
  // and a review latency past the convention.
  for (const signal of learningSignals(state, now)) add(signal);
  // Schema v47 (read-side): Scorecard Integrity contributes MTX-01..06 for a
  // scorecard modelled to pay mostly for gaming, an overdue measurement, a
  // falsified frozen prediction, a draft that was never committed, recoverable
  // team effort, and the model's measured error once there is enough of it.
  for (const signal of measurementSignals(state, now)) add(signal);
  // Schema v35 (read-side): the Assumption Ledger contributes PREM-01..05
  // for breached signposts, watch-band premises, overdue signpost reviews,
  // uncollected sensor evidence and pre-registered but unmeasured premises.
  for (const signal of premiseSignals(state, now)) add(signal);
  // Session 55 (read-side): assumption-aware tails TAIL-01..03 — paired
  // premise-coupled Monte Carlo widening, dominant-assumption attribution,
  // and correlated-evidence pseudo-replication warnings.
  for (const signal of premiseTailSignals(state, now)) add(signal);
  // Schema v37 (read-side): the Operating System Dynamics Lab contributes
  // DYN-01..05 for structural risk, loop-dominance regime change, unreviewed
  // experiment checkpoints, assumed-parameter debt and a hindcast that failed
  // to beat naive persistence.
  for (const signal of dynamicsSignals(state, now)) add(signal);
  // Schema v38 (read-side): the Structural Capital Allocation terminal
  // contributes SCA-01..05 for unreviewed portfolio checkpoints, an
  // out-of-sample failure, a funded plan running on an unvalidated model,
  // one-mechanism concentration and an unspent effort budget.
  for (const signal of capitalSignals(state, now)) add(signal);

  // Continuity-coupled ("all-weather") portfolio simulation signals (CPL-01..04).
  for (const signal of continuityCouplingSignals(state, now)) add(signal);

  // Schema v45 (read-side): the Leader Continuity Drill contributes LCS-01..04
  // for critical obligations with no cover, an 80% absence scenario that stalls
  // critical work, items convention says cannot be delegated at all, and a
  // drill skill score below a constant base rate.
  for (const signal of continuitySignals(buildLeaderContinuityReport(state, { now }))) add(signal);

  // Schema v39 (read-side): the Early-Warning Watch contributes EW-01..05 for
  // alerts awaiting a human verdict, candidates throttled by a governor, a
  // measured precision below tolerance, frozen forecasts that can never be
  // scored, and a centre-line model that loses to naive persistence.
  for (const signal of watchSignals(state, now)) add(signal);

  // RULE-INTAKE-06: a triaged situation waiting more than three days for a
  // human routing decision is a decision the leader is drifting on. Stakes
  // reviews (safety/legal/confidential) escalate the severity.
  const pendingDrafts = pendingIntakeDrafts(state, now);
  const staleDrafts = pendingDrafts.filter((d) => d.stale);
  if (staleDrafts.length) {
    const stakesCount = staleDrafts.filter((d) => d.analysis?.stakesReviewRequired).length;
    add({
      ruleId: 'RULE-INTAKE-06',
      domain: 'Intake triage',
      title: staleDrafts.length === 1
        ? `A triaged situation has waited ${staleDrafts[0].ageDays} days for a routing decision`
        : `${staleDrafts.length} triaged situations are waiting for routing decisions`,
      detail: stakesCount
        ? `${stakesCount} of these carry safety, legal or confidentiality stakes and were flagged for mandatory human review. Every extra day leaves the underlying risk unowned.`
        : 'The on-device triage engine produced a confidence-scored routing plan; confirming or dismissing it keeps the operational case ledger and its follow-through honest.',
      severity: stakesCount ? 4 : 2,
      confidence: 'high',
      evidence: staleDrafts.slice(0, 5).map((d) =>
        `“${(d.analysis?.suggestedTitle || d.sourceText || '').slice(0, 80)}” — ${d.analysis?.confidenceBand || 'unknown'} confidence, ${d.ageDays} days pending`),
      action: { label: 'Open intake triage', route: '#/intake' },
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
  'ONB-03': (n) => `${n} 30-60-90 plans are missing core scaffolding`,
  'ONB-04': (n) => `${n} people have overdue 30-60-90 checkpoints`,
  'ONB-05': (n) => `${n} 30-60-90 plans are past the 90-day handoff window`,
  'REC-01': (n) => `${n} people have not been recognised recently`,
  'READY-01': (n) => `${n} readiness claims are unsupported by evidence`,
  'CASE-01': (n) => `${n} high-priority operational cases lack mitigation or systemic barriers`,
  'CASE-02': (n) => `${n} operational cases have overdue or unaligned stakeholder briefs`,
  'CASE-03': (n) => `${n} operational cases are past their review date`,
  'CAP-03': (n) => `${n} candidate commitments are still undecided`,
  'HIRE-02': (n) => `${n} requisitions have stopped moving`,
  'HIRE-03': (n) => `${n} roles are past their target start`,
  'HIRE-04': (n) => `${n} roles have nothing to assess candidates against`,
  'HIRE-05': (n) => `${n} roles have interview effort missing from the plan`,
  'HIRE-06': (n) => `${n} final-round decisions are short on evidence`,
  'HIRE-07': (n) => `${n} roles assessed candidates unevenly`,
  'HIRE-08': (n) => `${n} candidate record(s) are past your retention window`,
  'NEG-01': (n) => `${n} high-stakes negotiations have no BATNA recorded`,
  'NEG-02': (n) => `${n} negotiations have overdue sessions or reviews`,
  'NEG-03': (n) => `${n} negotiations meet soon with weak preparation`,
  'NEG-04': (n) => `${n} negotiations have high-weight issues with no ZOPA`,
  'NEG-05': (n) => `${n} negotiations are at impasse without an escalation case`,
  'NEG-07': (n) => `${n} agreements need delivery recovery`,
  'NEG-08': (n) => `${n} agreements need settlement review or governance remediation`,
  'NEG-09': (n) => `${n} settlement cohorts show material median value shortfall`,
  'NEG-06': (n) => `${n} agreements contain ownerless terms`,
  'FIN-01': (n) => `${n} budgets forecast a breach of their envelope`,
  'FIN-02': (n) => `${n} budgets are in the watch zone`,
  'FIN-03': (n) => `${n} budgets need recorded spend actuals`,
  'FIN-04': (n) => `${n} findings on systematic commitment overruns`,
  'FIN-05': (n) => `${n} budgets have stale or period-ended commitments`,
  'CHG-01': (n) => `${n} organizational changes have blocked force-field equilibria`,
  'CHG-02': (n) => `${n} organizational changes have skipped steps or unaligned veto players`,
  'CHG-03': (n) => `${n} organizational changes exceed cognitive-load or collaboration limits`,
  'CHG-04': (n) => `${n} organizational changes have Star-model or trade-off gaps`,
  'CHG-05': (n) => `${n} organizational changes need review or telemetry verification`,
  'SPC-01': (n) => `${n} metrics show Shewhart XmR special-cause degradation`,
  'SIM-01': (n) => `${n} bottleneck owners face critical-chain schedule contention`,
  'SIM-02': (n) => `${n} organizational changes carry high stochastic J-curve payback risk`,
  'SCN-01': (n) => `${n} counterfactual Pareto-relief opportunities identified`,
  'FCT-01': (n) => `${n} forecast-calibration findings on estimate bias`,
  'FCT-02': (n) => `${n} findings on overconfident estimate ranges`,
  'FCT-03': (n) => `${n} findings on decision-forecast calibration`,
  'FCT-04': (n) => `${n} prompts to record delivery actuals`,
  'FCT-05': (n) => `${n} findings on case-exposure reserve adequacy`,
  'FCT-06': (n) => `${n} findings on risk-occurrence calibration`,
  'FCT-07': (n) => `${n} prompts to record settled case actuals`,
  'STK-01': (n) => `${n} open initiatives face an adverse veto player`,
  'STK-02': (n) => `${n} stakeholders on initiatives are missing from the register`,
  'STK-03': (n) => `${n} high-salience stakeholders have an overdue contact`,
  'STK-04': (n) => `${n} key players show a recent adverse stance shift`,
  'STK-05': (n) => `${n} initiatives sit in the blocked win-set band`,
  'STK-06': (n) => `${n} urgent stakeholders have no contact plan`,
  'STK-07': (n) => `${n} veto assessments rest on low-confidence evidence`,
  'RES-01': (n) => `${n} capabilities rest on a single verified steward (Bus Factor ≤ 1)`,
  'RES-02': (n) => `${n} capabilities carry an unbuffered survival shortfall (TTR > TTS)`,
  'RES-03': (n) => `${n} shared upstream dependencies act as common-mode choke points`,
  'RES-05': (n) => `${n} vendor dependencies show high Williamson hold-up exposure`,
  'CPL-02': (n) => `${n} people carry dual-hat sprint delivery and incident recovery contention`,
};

const GROUP_ROUTES = {
  Conversations: '#/oneonones',
  Goals: '#/goals',
  Delegation: '#/delegations',
  'Operational cases': '#/cases',
  'Operational resilience': '#/resilience',
  'Continuity coupling': '#/capacity',
  Stakeholders: '#/stakeholders',
  Negotiation: '#/negotiations',
  'Org design & change': '#/changes',
  'Capacity & flow': '#/capacity',
  Finance: '#/finance',
  Hiring: '#/hiring',
  Wellbeing: '#/health',
  Decisions: '#/decisions',
  'Forecast integrity': '#/forecasts',
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
      title: `${completedOnboarding.length} completed 30-60-90 plan${completedOnboarding.length === 1 ? '' : 's'}`,
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

  if ((state.portfolio || []).length > 0 && people.length > 0) {
    const cap = capacitySummary(state, now);
    if (cap.model.band.id === 'healthy' && cap.forecast.available && cap.forecast.p80) {
      wins.push({
        title: `Operating plan fits inside ${cap.model.supply.allocatableDays} allocatable person-days`,
        detail: `Committed work is forecast to finish by ${cap.forecast.p80} at P80, with a real buffer for interrupts.`,
      });
    }
  }

  const resolvedCasesWithBarriers = (state.cases || []).filter(
    (c) =>
      (c.status === 'resolved' || c.status === 'closed') &&
      Boolean(c.rca?.systemicBarrier) &&
      (daysSince(c.resolvedOn, now) ?? Infinity) <= 30,
  );
  if (resolvedCasesWithBarriers.length) {
    wins.push({
      title: `${resolvedCasesWithBarriers.length} operational case${resolvedCasesWithBarriers.length === 1 ? '' : 's'} closed with systemic guardrails`,
      detail: resolvedCasesWithBarriers
        .slice(0, 2)
        .map((c) => `"${c.title}"`)
        .join(' · '),
    });
  }

  const anchoredChanges = (state.changes || []).filter(
    (c) => c.status === 'anchored' && (daysSince(c.anchoredOn, now) ?? Infinity) <= 45,
  );
  if (anchoredChanges.length) {
    wins.push({
      title: `${anchoredChanges.length} organizational change${anchoredChanges.length === 1 ? '' : 's'} anchored in practice`,
      detail: anchoredChanges
        .slice(0, 2)
        .map((c) => `"${c.title}"`)
        .join(' · '),
    });
  }

  if ((state.dependencies || []).length > 0) {
    const res = buildResilienceReport(state, now);
    if (res.totals.critical > 0 && res.criticalHumanSpofs.length === 0 && res.criticalShortfalls.length === 0) {
      wins.push({
        title: `All ${res.totals.critical} critical capabilit${res.totals.critical === 1 ? 'y' : 'ies'} hold Bus Factor ≥ 2 and TTR ≤ TTS`,
        detail: 'Zero single-steward SPOFs or unbuffered survival shortfalls on critical nodes.',
      });
    }
  }

  return wins.slice(0, 4);
}

/** Findings for one person, for the person detail page. */
export function insightsForPerson(state, personId, now) {
  return buildInsights(state, now).findings.filter((f) => f.personId === personId);
}

export { round, isOverdue, lastCheckin, activePlan, openActions };
