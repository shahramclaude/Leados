/**
 * app/core/domain/onboarding.js — structured 30-60-90 onboarding scaffolding.
 *
 * Grounded in Talya Bauer's organizational socialization model (Clarification,
 * Culture, Connection) and Michael Watkins' 30-60-90 transition horizons
 * (Learn & Connect -> Contribute & Calibrate -> Own & Transition).
 *
 * Deliberate invariants:
 *   - No numeric onboarding score or grade on the person: missing buddy, role
 *     clarity or stakeholder introductions are manager scaffolding gaps, not an
 *     assessment of the joiner's capability.
 *   - No HR/IT compliance paperwork (laptop, payroll, tax forms) and no
 *     personality or "culture-fit" labels.
 *   - Pure functions only: state + clock in, plain values out. Never reads
 *     confidential `state.conflicts` or raw `state.pulses`.
 */

import { ONBOARDING_HORIZONS, ONBOARDING_CATEGORIES, ONBOARDING_KINDS } from '../schema.js';
import { addDays, daysSince, isOverdue, dayKey } from '../time.js';
import { activePeople, isNewJoiner, personById } from './people.js';

export { ONBOARDING_HORIZONS, ONBOARDING_CATEGORIES, ONBOARDING_KINDS };

export const KIND_LABELS = Object.freeze({
  'new-hire': 'New joiner',
  'role-transition': 'Role transition',
});

/**
 * The kind of 30-60-90 plan this is. Pre-v10 records (and hand-built fixtures
 * that omit the field) are new-joiner onboarding: that is what the app could
 * create before role transitions existed, so the default states a fact rather
 * than inventing one.
 */
export function planKind(plan) {
  return ONBOARDING_KINDS.includes(plan?.kind) ? plan.kind : 'new-hire';
}

export const HORIZON_LABELS = Object.freeze({
  30: 'Day 30 · Clarity & connection',
  60: 'Day 60 · Guided contribution & calibration',
  90: 'Day 90 · Autonomous ownership & handoff',
});

export const HORIZON_SHORT_LABELS = Object.freeze({
  30: 'Day 30',
  60: 'Day 60',
  90: 'Day 90',
});

export const HORIZON_SUBTITLES = Object.freeze({
  30: 'Role expectations written down, peer buddy assigned, key relationships introduced, working rhythm set.',
  60: 'Scoped early win underway or delivered, and two-way calibration conversation held.',
  90: 'Recurring area owned independently, 90-day retrospective held, and steady-state goal/growth plan set.',
});

export const CATEGORY_LABELS = Object.freeze({
  clarity: 'Role clarity',
  connection: 'Connection',
  culture: 'Team norms',
  contribution: 'Early win',
  ownership: 'Ownership',
});

/**
 * Six observable manager-scaffolding checkpoints anchored to `startDate`.
 * Offered when creating a plan so a first-time manager does not stare at a
 * blank page; every item can be edited, completed or removed.
 */
export function defaultCheckpoints(startDate) {
  const anchor = startDate || null;
  const dueAt = (offset) => (anchor ? addDays(anchor, offset) : null);
  return [
    {
      horizon: 30,
      category: 'clarity',
      title: 'Walk through role scope, decision boundaries and what good looks like at 90 days',
      due: dueAt(14),
    },
    {
      horizon: 30,
      category: 'culture',
      title: 'Agree 1:1 rhythm, communication norms and how feedback flows both ways',
      due: dueAt(30),
    },
    {
      horizon: 60,
      category: 'contribution',
      title: 'Ship or review the scoped early win and remove hidden team blockers',
      due: dueAt(60),
    },
    {
      horizon: 60,
      category: 'clarity',
      title: 'Exchange explicit 60-day calibration feedback (what is working and one adjustment)',
      due: dueAt(60),
    },
    {
      horizon: 90,
      category: 'ownership',
      title: 'Hand over end-to-end ownership of a recurring domain or outcome',
      due: dueAt(90),
    },
    {
      horizon: 90,
      category: 'ownership',
      title: 'Transition from onboarding into a co-authored goal and GROW development plan',
      due: dueAt(90),
    },
  ];
}

/**
 * Six starter checkpoints for an internal role transition, anchored to the day
 * the new role starts. Grounded in Watkins' transition research: internal
 * moves fail differently from new hires — the old role is never formally
 * handed over, the strengths that earned the move get over-applied ("promote
 * yourself": let go of the old seat's playbook), and nobody re-agrees what
 * good looks like at the new level. The checkpoints make the handover, the
 * scope change and the habit reset explicit instead of assumed.
 */
export function defaultTransitionCheckpoints(startDate) {
  const anchor = startDate || null;
  const dueAt = (offset) => (anchor ? addDays(anchor, offset) : null);
  return [
    {
      horizon: 30,
      category: 'clarity',
      title: 'Agree the handover inventory for the old role: what stops, what transfers to whom, and by when',
      due: dueAt(14),
    },
    {
      horizon: 30,
      category: 'clarity',
      title: 'Write down how the new role differs: scope, decision authority and what good looks like at 90 days',
      due: dueAt(30),
    },
    {
      horizon: 60,
      category: 'contribution',
      title: 'Deliver or jointly review the first scoped early win in the new role',
      due: dueAt(60),
    },
    {
      horizon: 60,
      category: 'culture',
      title: 'Exchange 60-day calibration: which old-role habits to drop, and what the new role expects instead',
      due: dueAt(60),
    },
    {
      horizon: 90,
      category: 'ownership',
      title: 'Own the new recurring outcomes end to end without falling back on the old role',
      due: dueAt(90),
    },
    {
      horizon: 90,
      category: 'ownership',
      title: 'Reset steady-state goals and the GROW plan to the expectations of the new role',
      due: dueAt(90),
    },
  ];
}

/** All onboarding plans for a person, newest start date first. */
export function onboardingFor(state, personId) {
  return (state.onboarding || [])
    .filter((plan) => plan.personId === personId)
    .slice()
    .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

/** Active onboarding plan for a person, or null. */
export function activeOnboarding(state, personId) {
  return onboardingFor(state, personId).find((plan) => plan.status === 'active') || null;
}

/** Current horizon from tenure days relative to `startDate`. */
export function currentPhase(startDate, now) {
  const dayNumber = startDate ? daysSince(startDate, now) : null;
  if (dayNumber === null) return { phase: 'unknown', horizon: 30, dayNumber: null };
  if (dayNumber < 0) return { phase: 'pre-start', horizon: 30, dayNumber };
  if (dayNumber <= 30) return { phase: 'day-30', horizon: 30, dayNumber };
  if (dayNumber <= 60) return { phase: 'day-60', horizon: 60, dayNumber };
  if (dayNumber <= 90) return { phase: 'day-90', horizon: 90, dayNumber };
  return { phase: 'post-90', horizon: 90, dayNumber };
}

/**
 * Active new joiners within `onboardingDays` who have no active or completed
 * new-joiner plan. A role-transition plan does not silence this: the two
 * kinds answer different questions, and a joiner whose only plan is labelled
 * a transition still has no recorded onboarding scaffolding.
 */
export function newJoinersWithoutPlan(state, now, settings) {
  return activePeople(state).filter((person) => {
    if (!isNewJoiner(person, now, settings)) return false;
    const plans = onboardingFor(state, person.id);
    return !plans.some(
      (plan) => (plan.status === 'active' || plan.status === 'completed') && planKind(plan) === 'new-hire',
    );
  });
}

/**
 * Pure diagnostic evaluation of one onboarding plan.
 * Surfaces scaffolding gaps, checkpoint status per horizon, stakeholder
 * introduction coverage and 30/60/90 check-in readiness without inventing a
 * score on the person.
 */
export function onboardingHealth(plan, state, now, settings) {
  const kind = planKind(plan);
  const isTransition = kind === 'role-transition';
  const person = personById(state, plan.personId);
  const buddyPerson = plan.buddyId ? personById(state, plan.buddyId) : null;
  const activeBuddyPerson = buddyPerson && buddyPerson.status !== 'archived' ? buddyPerson : null;
  const externalBuddy = (plan.buddyName || '').trim();
  const hasBuddy = Boolean(activeBuddyPerson || externalBuddy);
  const buddyDisplay = activeBuddyPerson ? activeBuddyPerson.name : externalBuddy;

  const phaseInfo = currentPhase(plan.startDate, now);
  const dayNumber = phaseInfo.dayNumber;
  const today = dayKey(now);
  const windowDays = settings?.onboardingDays ?? 90;

  const horizonDeadlines = {
    30: plan.startDate ? addDays(plan.startDate, 30) : null,
    60: plan.startDate ? addDays(plan.startDate, 60) : null,
    90: plan.startDate ? addDays(plan.startDate, 90) : null,
  };

  const hasRoleClarity = Boolean((plan.roleClarity || '').trim());
  const hasEarlyWin = Boolean((plan.earlyWin || '').trim());

  const stakeholders = (plan.stakeholders || []).map((s) => ({
    ...s,
    met: Boolean(s.met),
  }));
  const stakeholdersMet = stakeholders.filter((s) => s.met).length;
  const stakeholdersUnmet = stakeholders.length - stakeholdersMet;

  const soonCutoff = addDays(today, 7);
  const checkpoints = (plan.checkpoints || []).map((cp) => {
    const overdue = Boolean(plan.status === 'active' && !cp.done && cp.due && isOverdue(cp.due, now));
    const dueSoon = Boolean(plan.status === 'active' && !cp.done && cp.due && !overdue && cp.due <= soonCutoff);
    return {
      ...cp,
      overdue,
      dueSoon,
    };
  });

  const byHorizon = {};
  for (const h of ONBOARDING_HORIZONS) {
    const list = checkpoints.filter((cp) => cp.horizon === h);
    byHorizon[h] = {
      horizon: h,
      label: HORIZON_LABELS[h],
      shortLabel: HORIZON_SHORT_LABELS[h],
      subtitle: HORIZON_SUBTITLES[h],
      dueOn: horizonDeadlines[h],
      items: list,
      total: list.length,
      done: list.filter((cp) => cp.done).length,
      open: list.filter((cp) => !cp.done).length,
      overdue: list.filter((cp) => cp.overdue).length,
    };
  }

  const checkpointStats = {
    total: checkpoints.length,
    done: checkpoints.filter((cp) => cp.done).length,
    open: checkpoints.filter((cp) => !cp.done).length,
    overdue: checkpoints.filter((cp) => cp.overdue).length,
    dueSoon: checkpoints.filter((cp) => cp.dueSoon).length,
    byHorizon,
    items: checkpoints,
  };

  const reviewStatus = {};
  const overdueReviews = [];
  const dueSoonReviews = [];
  for (const h of ONBOARDING_HORIZONS) {
    const dueOn = horizonDeadlines[h];
    const rec = plan.reviews?.[h] || null;
    const held = Boolean(rec?.heldOn);
    let stateLabel = 'upcoming';
    if (held) {
      stateLabel = 'done';
    } else if (plan.status === 'active' && dueOn && isOverdue(dueOn, now)) {
      stateLabel = 'overdue';
      overdueReviews.push({ horizon: h, dueOn });
    } else if (plan.status === 'active' && dueOn && dueOn <= soonCutoff && (dayNumber === null || dayNumber >= 0)) {
      stateLabel = 'due-soon';
      dueSoonReviews.push({ horizon: h, dueOn });
    }
    reviewStatus[h] = {
      horizon: h,
      dueOn,
      held,
      heldOn: rec?.heldOn || null,
      summary: rec?.summary || '',
      blockers: rec?.blockers || '',
      state: stateLabel,
    };
  }

  // Manager scaffolding gaps — evaluated only while the plan is active and once
  // the joiner has actually started.
  const scaffoldingGaps = [];
  if (plan.status === 'active' && dayNumber !== null && dayNumber >= 0) {
    if (!hasRoleClarity && dayNumber >= 7) {
      scaffoldingGaps.push({
        key: 'role-clarity',
        shortLabel: 'written role clarity',
        evidence: 'Role scope and 90-day expectations are still blank',
      });
    }
    if (!hasBuddy && dayNumber >= 7) {
      scaffoldingGaps.push({
        key: 'buddy',
        shortLabel: 'a peer buddy',
        evidence: buddyPerson?.status === 'archived'
          ? `Assigned buddy (${buddyPerson.name}) is archived and has not been replaced`
          : isTransition
            ? 'No peer buddy assigned for the new role'
            : 'No onboarding buddy assigned',
      });
    }
    if (stakeholders.length === 0 && dayNumber >= 10) {
      scaffoldingGaps.push({
        key: 'stakeholder-map',
        shortLabel: 'a stakeholder introduction list',
        evidence: 'Zero stakeholder introductions mapped',
      });
    } else if (stakeholdersUnmet > 0 && dayNumber > 30) {
      scaffoldingGaps.push({
        key: 'stakeholders-unmet',
        shortLabel: `${stakeholdersUnmet} pending stakeholder introduction${stakeholdersUnmet === 1 ? '' : 's'}`,
        evidence: `${stakeholdersUnmet} of ${stakeholders.length} planned stakeholder introduction(s) still unmet at day ${dayNumber}`,
      });
    }
    if (!hasEarlyWin && dayNumber >= 21) {
      scaffoldingGaps.push({
        key: 'early-win',
        shortLabel: 'a scoped early win',
        evidence: 'No scoped early win recorded by week 3',
      });
    }
  }

  const hasSteadyGoal = (state.goals || []).some((g) => g.ownerId === plan.personId && g.status === 'active');
  const hasGrowthPlan = (state.growthPlans || []).some((gp) => gp.personId === plan.personId && gp.status === 'active');
  const pastWindow = Boolean(plan.status === 'active' && dayNumber !== null && dayNumber > windowDays);
  const canComplete = Boolean(reviewStatus[90].held);
  const readyToGraduate = Boolean(
    plan.status === 'active' &&
      canComplete &&
      checkpointStats.open === 0 &&
      stakeholdersUnmet === 0,
  );

  let statusTone = 'good';
  let statusLabel = 'On track';
  if (plan.status === 'completed') {
    statusTone = 'good';
    statusLabel = 'Completed';
  } else if (plan.status === 'archived') {
    statusTone = 'neutral';
    statusLabel = 'Archived';
  } else if (checkpointStats.overdue > 0 || overdueReviews.length > 0 || pastWindow) {
    statusTone = 'bad';
    statusLabel = pastWindow
      ? `Past ${windowDays}d window`
      : overdueReviews.length > 0
        ? `Day ${overdueReviews[0].horizon} check-in overdue`
        : `${checkpointStats.overdue} checkpoint${checkpointStats.overdue === 1 ? '' : 's'} overdue`;
  } else if (scaffoldingGaps.length > 0 || checkpointStats.dueSoon > 0 || dueSoonReviews.length > 0) {
    statusTone = 'warn';
    statusLabel = scaffoldingGaps.length > 0 ? 'Setup incomplete' : 'Check-in due soon';
  } else if (dayNumber !== null && dayNumber < 0) {
    statusTone = 'neutral';
    statusLabel = `Starts in ${Math.abs(dayNumber)}d`;
  }

  return {
    plan,
    kind,
    isTransition,
    label: (plan.label || '').trim(),
    person,
    buddyPerson: activeBuddyPerson,
    hasBuddy,
    buddyDisplay,
    dayNumber,
    phase: phaseInfo.phase,
    currentHorizon: phaseInfo.horizon,
    horizonDeadlines,
    hasRoleClarity,
    hasEarlyWin,
    stakeholderStats: {
      total: stakeholders.length,
      met: stakeholdersMet,
      unmet: stakeholdersUnmet,
      items: stakeholders,
    },
    checkpointStats,
    reviewStatus,
    overdueReviews,
    dueSoonReviews,
    scaffoldingGaps,
    hasSteadyGoal,
    hasGrowthPlan,
    pastWindow,
    canComplete,
    readyToGraduate,
    statusTone,
    statusLabel,
  };
}

/** Workspace-wide onboarding overview for `#/onboarding` and Today. */
export function onboardingSummary(state, now, settings) {
  const activePersonIds = new Set(activePeople(state).map((p) => p.id));
  const rows = (state.onboarding || [])
    .filter((plan) => activePersonIds.has(plan.personId))
    .map((plan) => ({
      plan,
      health: onboardingHealth(plan, state, now, settings),
    }))
    .sort((a, b) => {
      const aActive = a.plan.status === 'active' ? 0 : 1;
      const bActive = b.plan.status === 'active' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const toneRank = { bad: 0, warn: 1, good: 2, neutral: 3 };
      const diff = (toneRank[a.health.statusTone] ?? 3) - (toneRank[b.health.statusTone] ?? 3);
      if (diff !== 0) return diff;
      return String(b.plan.startDate || '').localeCompare(String(a.plan.startDate || ''));
    });

  const activeRows = rows.filter((r) => r.plan.status === 'active');
  const completedRows = rows.filter((r) => r.plan.status === 'completed');
  const overdueRows = activeRows.filter((r) => r.health.statusTone === 'bad');
  const attentionRows = activeRows.filter((r) => r.health.statusTone === 'bad' || r.health.statusTone === 'warn');
  const activeNewHireCount = activeRows.filter((r) => !r.health.isTransition).length;
  const unstartedJoiners = newJoinersWithoutPlan(state, now, settings);

  return {
    rows,
    activeCount: activeRows.length,
    activeNewHireCount,
    activeTransitionCount: activeRows.length - activeNewHireCount,
    completedCount: completedRows.length,
    overdueCount: overdueRows.length,
    attentionCount: attentionRows.length,
    unstartedJoiners,
  };
}
