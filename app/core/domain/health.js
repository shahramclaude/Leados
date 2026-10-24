/**
 * app/core/domain/health.js — the composite team-health score.
 *
 * Five dimensions, each 0–100, each with a formula that can be explained to the
 * person being measured. Dimensions with no data return null and their weight
 * is redistributed rather than scored as zero — an unmeasured thing is not a
 * failing thing. The result carries its own audit trail (`drivers`) so the UI
 * never has to assert a number it cannot justify.
 *
 * Weights (sum 1.0): cadence .24 · feedback .20 · clarity .20 · growth .16 ·
 * wellbeing .20.
 */

import { addDays, clamp, daysBetween, daysSince, isOverdue, mean, round } from '../time.js';
import { cadence } from './oneonone.js';
import { tenureDays } from './people.js';
import { personFeedbackStats } from './feedback.js';
import { goalHealth, activeGoals } from './goals.js';
import { activePlan, planProgress } from './growth.js';
import { aggregate } from './pulse.js';

export const DIMENSIONS = [
  { key: 'cadence', label: 'Conversation rhythm', weight: 0.24, question: 'Are 1:1s actually happening?' },
  { key: 'feedback', label: 'Feedback flow', weight: 0.2, question: 'Do people know where they stand?' },
  { key: 'clarity', label: 'Clarity of priorities', weight: 0.2, question: 'Does everyone know what matters now?' },
  { key: 'growth', label: 'Growth in motion', weight: 0.16, question: 'Is anyone getting better on purpose?' },
  { key: 'wellbeing', label: 'Safety & load', weight: 0.2, question: 'Is it safe and sustainable to speak up?' },
];

function scorer(key) {
  return DIMENSIONS.find((d) => d.key === key);
}

/**
 * A copy of the state with records dated after `asOf` removed, so the same
 * formulas can be re-run for a past date.
 *
 * Honest limitation: fields that are overwritten in place (a person's role, a
 * goal's stated confidence) have no history. Goal confidence is reconstructed
 * from the last check-in before the cutoff, and anything else uses current
 * values. The trend is therefore approximate and is labelled as such.
 */
export function truncateState(state, asOf) {
  const keep = (day) => !day || (daysBetween(day, asOf) ?? 0) >= 0;
  const cloned = JSON.parse(JSON.stringify(state));
  const asOfDay = typeof asOf === 'string' ? asOf : new Date(asOf).toISOString().slice(0, 10);
  cloned.oneOnOnes = cloned.oneOnOnes.filter((m) => keep(m.date));
  cloned.feedback = cloned.feedback.filter((f) => keep(f.date));
  cloned.pulses = cloned.pulses.filter((p) => keep(p.date));
  cloned.recognition = cloned.recognition.filter((r) => keep(r.date));
  cloned.decisions = cloned.decisions.filter((d) => keep(d.date));
  cloned.growthPlans = cloned.growthPlans.filter((p) => keep(p.createdAt.slice(0, 10)));
  // People who had not been added to the roster yet cannot be scored for a
  // period before they existed.
  cloned.people = cloned.people.filter((p) => keep(p.createdAt.slice(0, 10)));
  cloned.goals = cloned.goals
    .filter((g) => keep(g.createdAt.slice(0, 10)))
    .map((g) => {
      const past = (g.checkins || []).filter((c) => keep(c.date));
      const createdAfter = (daysBetween(g.createdAt.slice(0, 10), asOfDay) ?? 0) < 0;
      return {
        ...g,
        checkins: past,
        confidence: past.length ? past[past.length - 1].confidence : createdAfter ? null : 'on-track',
        keyResults: (g.keyResults || []).map((kr) => ({ ...kr })), // current values; no KR history is stored
      };
    })
    .filter((g) => g.confidence !== null);
  return cloned;
}

function cadenceDimension(state, now, settings) {
  const people = state.people.filter((p) => p.status !== 'archived');
  if (!people.length) return { score: null, detail: 'No team members yet.', drivers: [] };
  // Someone added this week has not had a chance to have a 1:1 yet. Scoring
  // them zero would punish the leader for a calendar that has not happened.
  const eligible = people.filter((p) => {
    const t = tenureDays(p, now);
    if (t !== null && t < 7 && !state.oneOnOnes.some((m) => m.personId === p.id)) return false;
    return true;
  });
  if (!eligible.length) {
    return { score: null, detail: 'New joiners only — conversation rhythm becomes measurable after the first week.', drivers: [] };
  }
  const perPerson = eligible.map((person) => {
    const c = cadence(state, person.id, now, settings);
    if (c.status === 'never') return { person, score: 0, c };
    const heldRatio = c.scheduledLast4 ? c.heldLast4 / c.scheduledLast4 : 0;
    // Recency: 100 while inside the cadence window, 0 at 2× the window.
    const recency = clamp(100 - ((c.daysSinceHeld - c.expectedDays * 0.5) / (c.expectedDays * 1.5)) * 100);
    return { person, score: round(0.6 * heldRatio * 100 + 0.4 * recency), c };
  });
  const score = round(mean(perPerson.map((p) => p.score)));
  const worst = perPerson.slice().sort((a, b) => a.score - b.score).slice(0, 3);
  return {
    score,
    detail: `60% of this score is how often scheduled 1:1s actually happen; 40% is how long since the last one.`,
    drivers: worst.map((w) => ({
      label: w.person.name,
      value: w.c.status === 'never' ? 'no 1:1 ever logged' : `${w.c.heldLast4}/${w.c.scheduledLast4} recent kept · last ${w.c.daysSinceHeld}d ago`,
      negative: w.score < 60,
    })),
  };
}

function feedbackDimension(state, now, settings) {
  const people = state.people.filter((p) => p.status !== 'archived');
  if (!people.length) return { score: null, detail: 'No team members yet.', drivers: [] };
  const target = settings.feedbackTargetDays;
  const eligible = people.filter((p) => {
    const t = tenureDays(p, now);
    if (t !== null && t < 14 && !state.feedback.some((f) => f.personId === p.id)) return false;
    return true;
  });
  if (!eligible.length) return { score: null, detail: 'No one has been on the team long enough to expect feedback yet.', drivers: [] };
  const perPerson = eligible.map((person) => {
    const s = personFeedbackStats(state, person.id, now, settings);
    let recency = 0;
    if (s.daysSinceGiven !== null) recency = clamp(100 - ((s.daysSinceGiven - target) / target) * 100);
    let penalty = 0;
    if (s.balance === 'praise-only') penalty = 15;
    if (s.balance === 'constructive-only') penalty = 10;
    return { person, score: clamp(recency - penalty), s };
  });
  const score = round(mean(perPerson.map((p) => p.score)));
  const worst = perPerson.slice().sort((a, b) => a.score - b.score).slice(0, 3);
  return {
    score,
    detail: `Based on days since the last feedback (target: every ${target} days), with a penalty for one-sided feedback.`,
    drivers: worst.map((w) => ({
      label: w.person.name,
      value: w.s.daysSinceGiven === null ? 'never' : `${w.s.daysSinceGiven}d ago`,
      negative: w.score < 60,
    })),
  };
}

function clarityDimension(state, now, settings) {
  const people = state.people.filter((p) => p.status !== 'archived');
  const active = activeGoals(state);
  const pulse = aggregate(state, now);
  const pulseClarity = pulse.blocked ? null : pulse.dimensions.clarity.avg;

  let goalScore = null;
  if (people.length) {
    const covered = people.filter((p) => active.some((g) => g.ownerId === p.id));
    const coverage = covered.length / people.length;
    const onTrack = active.length
      ? active.filter((g) => goalHealth(g, now).health === 'on-track').length / active.length
      : 0;
    goalScore = round((0.5 * coverage + 0.5 * onTrack) * 100);
  }
  if (goalScore === null && pulseClarity === null) {
    return { score: null, detail: 'No goals and no pulse data yet.', drivers: [] };
  }
  const score = round(
    pulseClarity === null
      ? goalScore
      : goalScore === null
        ? ((pulseClarity - 1) / 4) * 100
        : 0.6 * goalScore + 0.4 * ((pulseClarity - 1) / 4) * 100,
  );
  const drivers = [
    { label: 'Active goals', value: `${active.length}`, negative: active.length === 0 },
    {
      label: 'People with a goal',
      value: people.length ? `${people.filter((p) => active.some((g) => g.ownerId === p.id)).length}/${people.length}` : '0',
      negative: people.length > 0 && people.filter((p) => active.some((g) => g.ownerId === p.id)).length < people.length,
    },
    { label: 'Team-rated clarity', value: pulseClarity === null ? 'not enough pulse data' : `${pulseClarity}/5`, negative: pulseClarity !== null && pulseClarity < 3 },
  ];
  return { score, detail: '60% goal coverage and goal health, 40% how clearly the team rates its own priorities.', drivers };
}

function growthDimension(state, now, settings) {
  const people = state.people.filter((p) => p.status !== 'archived');
  if (!people.length) return { score: null, detail: 'No team members yet.', drivers: [] };
  const withPlan = people.filter((p) => activePlan(state, p.id));
  const coverage = withPlan.length / people.length;
  const completion = withPlan.length
    ? mean(withPlan.map((p) => planProgress(activePlan(state, p.id)).percent)) / 100
    : 0;
  const pulse = aggregate(state, now);
  const pulseGrowth = pulse.blocked ? null : pulse.dimensions.growth.avg;
  const base = 0.55 * coverage + 0.45 * completion;
  const score = round(
    pulseGrowth === null ? base * 100 : (0.75 * base + 0.25 * ((pulseGrowth - 1) / 4)) * 100,
  );
  return {
    score,
    detail: 'How many people have a live development plan, how much of it they have completed, and how much they report learning.',
    drivers: [
      { label: 'People with a plan', value: `${withPlan.length}/${people.length}`, negative: withPlan.length < people.length },
      { label: 'Plan actions completed', value: `${round(completion * 100)}%`, negative: completion < 0.3 },
      { label: 'Team-rated growth', value: pulseGrowth === null ? 'not enough pulse data' : `${pulseGrowth}/5`, negative: pulseGrowth !== null && pulseGrowth < 3 },
    ],
  };
}

function wellbeingDimension(state, now) {
  const pulse = aggregate(state, now);
  if (pulse.blocked) {
    return {
      score: null,
      detail: pulse.n === 0 ? 'No pulse responses in the last two weeks.' : `Suppressed: ${pulse.n} response(s), ${pulse.minRequired} needed to protect anonymity.`,
      drivers: [],
    };
  }
  const safety = pulse.dimensions.safety.avg;
  const workload = pulse.dimensions.workload.avg;
  const score = round((0.55 * ((safety - 1) / 4) + 0.45 * ((workload - 1) / 4)) * 100);
  return {
    score,
    detail: `55% psychological safety, 45% sustainable load, from ${pulse.n} anonymous responses this fortnight.`,
    drivers: [
      { label: 'Safety', value: `${safety}/5`, negative: safety < 3 },
      { label: 'Workload', value: `${workload}/5`, negative: workload < 3 },
      { label: 'Responses', value: `${pulse.n}`, negative: false },
    ],
  };
}

function dateSpanDays(state, now) {
  const all = [
    ...state.oneOnOnes.map((m) => m.date),
    ...state.feedback.map((f) => f.date),
    ...state.pulses.map((p) => p.date),
    ...state.recognition.map((r) => r.date),
    ...state.people.map((p) => (p.createdAt || '').slice(0, 10)),
  ].filter(Boolean);
  if (!all.length) return 0;
  const oldest = all.slice().sort()[0];
  return daysBetween(oldest, now) ?? 0;
}

export function dimensions(state, now) {
  const settings = state.settings;
  const raw = {
    cadence: cadenceDimension(state, now, settings),
    feedback: feedbackDimension(state, now, settings),
    clarity: clarityDimension(state, now, settings),
    growth: growthDimension(state, now, settings),
    wellbeing: wellbeingDimension(state, now),
  };
  return DIMENSIONS.map((meta) => {
    const value = raw[meta.key];
    return { ...meta, score: value.score, detail: value.detail, drivers: value.drivers };
  });
}

/**
 * @returns {{ overall:number|null, grade:string, dimensions:Array, coverage:number,
 *             trend:{available:boolean,delta:number|null,previous:number|null},
 *             label:string }}
 */
export function teamHealth(state, now, { withTrend = true, trendDays = 30 } = {}) {
  const dims = dimensions(state, now);
  const scored = dims.filter((d) => typeof d.score === 'number');
  if (!scored.length) {
    return {
      overall: null,
      grade: '—',
      dimensions: dims,
      coverage: 0,
      trend: { available: false, delta: null, previous: null },
      label: 'No scored dimensions yet: log a 1:1, some feedback or a pulse response to start measuring.',
    };
  }
  const weightSum = scored.reduce((sum, d) => sum + d.weight, 0);
  const overall = round(scored.reduce((sum, d) => sum + d.score * d.weight, 0) / weightSum, 1);
  const grade = overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : overall >= 40 ? 'D' : 'F';

  let trend = { available: false, delta: null, previous: null, reason: null };
  if (withTrend) {
    const cutoff = addDays(now, -trendDays);
    // A "trend" needs records that are actually older than the cutoff. Without
    // this guard, an empty past scores near zero and the app reports a fake
    // improvement — exactly the kind of number this project must not produce.
    const dated = [
      ...state.oneOnOnes.map((m) => m.date),
      ...state.feedback.map((f) => f.date),
      ...state.pulses.map((p) => p.date),
      ...state.recognition.map((r) => r.date),
    ].filter(Boolean);
    const olderThanCutoff = dated.filter((d) => (daysBetween(d, cutoff) ?? 0) >= 0).length;
    const heldBeforeCutoff = state.oneOnOnes.some((m) => m.status === 'held' && (daysBetween(m.date, cutoff) ?? 0) >= 0);
    if (dateSpanDays(state, now) >= trendDays + 14 && olderThanCutoff >= 2 && heldBeforeCutoff) {
      const past = teamHealth(truncateState(state, cutoff), new Date(cutoff + 'T00:00:00.000Z'), { withTrend: false });
      if (typeof past.overall === 'number') {
        trend = { available: true, delta: round(overall - past.overall, 1), previous: past.overall, reason: null };
      }
    } else {
      trend.reason = `Not enough history yet: a ${trendDays}-day trend appears once records are at least ${trendDays + 14} days old.`;
    }
  }

  const weakest = scored.slice().sort((a, b) => a.score - b.score)[0];
  return {
    overall,
    grade,
    dimensions: dims,
    coverage: round(weightSum, 2),
    trend,
    weakest,
    label: `Weighted mean of ${scored.length} measured dimension(s); ${DIMENSIONS.length - scored.length} not yet measurable. Weakest: ${weakest.label} (${weakest.score}).`,
  };
}

export { isOverdue, daysSince };
