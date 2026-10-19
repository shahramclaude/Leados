// Performance, engagement, burnout and growth-velocity scoring. Pure
// functions over the event log + snapshot history so they can be unit
// tested and re-run on demand (no hidden state).
//
// SOURCE: computeBurnoutIndex's component weights (0.45 workload /
// 0.25 after-hours / 0.15 cadence / 0.15 conflict, expressed below as
// 45/25/15/15 point allocations) are the named weights that
// src/lib/peopleIntelligence.ts's explainBurnout() cites when ranking
// drivers — keep the two in sync if these change.

import type { PersonEvent } from "./flightRisk";

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export function linearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  const num = values.reduce((a, y, i) => a + (i - xMean) * (y - yMean), 0);
  const den = values.reduce((a, _, i) => a + (i - xMean) ** 2, 0);
  return den ? num / den : 0;
}

/** Composite 0-100 performance score blending OKR attainment + feedback + delivery signals. */
export function computePerformanceScore(events: PersonEvent[], today: Date, okrScore: number | null): number {
  const recentFeedback = events.filter(
    (e) => e.type === "feedback.logged" && daysBetween(today, toDate(e.occurredAt)) <= 120
  );
  const positiveShare = recentFeedback.length
    ? recentFeedback.filter((f) => f.data.polarity === "positive").length / recentFeedback.length
    : 0.6;

  const milestones = events.filter(
    (e) => e.type === "milestone.delivered" && daysBetween(today, toDate(e.occurredAt)) <= 180
  ).length;

  const okrComponent = okrScore ?? 60;
  const feedbackComponent = positiveShare * 100;
  const deliveryComponent = Math.min(100, 50 + milestones * 10);

  const score = okrComponent * 0.5 + feedbackComponent * 0.3 + deliveryComponent * 0.2;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function computePerformanceTrend(history: number[]): "up" | "flat" | "down" {
  if (history.length < 2) return "flat";
  const slope = linearSlope(history);
  if (slope > 0.8) return "up";
  if (slope < -0.8) return "down";
  return "flat";
}

/** 0-100 burnout index: workload, after-hours activity, missed recovery (1:1s), conflict load. */
export function computeBurnoutIndex(events: PersonEvent[], today: Date): number {
  const pulses = events.filter(
    (e) => e.type === "pulse.mood.logged" && daysBetween(today, toDate(e.occurredAt)) <= 45
  );
  const loads = pulses.filter((p) => p.data.load !== undefined).map((p) => Number(p.data.load));
  const meanLoad = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 5;

  const afterHours = events.filter(
    (e) => e.type === "activity.after_hours" && daysBetween(today, toDate(e.occurredAt)) <= 30
  ).length;

  const oneOnOnes = events
    .filter((e) => e.type === "oneonone.logged")
    .sort((a, b) => toDate(b.occurredAt).getTime() - toDate(a.occurredAt).getTime());
  const daysSinceOneOnOne = oneOnOnes.length ? daysBetween(today, toDate(oneOnOnes[0].occurredAt)) : 30;

  const conflicts = events.filter(
    (e) => e.type === "conflict.logged" && daysBetween(today, toDate(e.occurredAt)) <= 45
  ).length;

  const loadComponent = Math.max(0, (meanLoad - 5) / 5) * 45;
  const afterHoursComponent = Math.min(1, afterHours / 10) * 25;
  const cadenceComponent = Math.min(1, Math.max(0, daysSinceOneOnOne - 14) / 30) * 15;
  const conflictComponent = Math.min(1, conflicts / 3) * 15;

  return Math.round(Math.max(0, Math.min(100, loadComponent + afterHoursComponent + cadenceComponent + conflictComponent)));
}

/** Component breakdown behind computeBurnoutIndex, used by peopleIntelligence.ts
 *  to rank the top burnout drivers for a person (same weights/components as
 *  computeBurnoutIndex above, kept separate so the aggregate function stays
 *  a pure number but callers that need "why" can still get it). */
export function explainBurnoutComponents(
  events: PersonEvent[],
  today: Date
): { factor: string; points: number; detail: string }[] {
  const pulses = events.filter(
    (e) => e.type === "pulse.mood.logged" && daysBetween(today, toDate(e.occurredAt)) <= 45
  );
  const loads = pulses.filter((p) => p.data.load !== undefined).map((p) => Number(p.data.load));
  const meanLoad = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 5;

  const afterHours = events.filter(
    (e) => e.type === "activity.after_hours" && daysBetween(today, toDate(e.occurredAt)) <= 30
  ).length;

  const oneOnOnes = events
    .filter((e) => e.type === "oneonone.logged")
    .sort((a, b) => toDate(b.occurredAt).getTime() - toDate(a.occurredAt).getTime());
  const daysSinceOneOnOne = oneOnOnes.length ? daysBetween(today, toDate(oneOnOnes[0].occurredAt)) : 30;

  const conflicts = events.filter(
    (e) => e.type === "conflict.logged" && daysBetween(today, toDate(e.occurredAt)) <= 45
  ).length;

  return [
    {
      factor: "Sustained high workload",
      points: Math.max(0, (meanLoad - 5) / 5) * 45,
      detail: `mean self-reported load ${meanLoad.toFixed(1)}/10`,
    },
    {
      factor: "After-hours activity",
      points: Math.min(1, afterHours / 10) * 25,
      detail: `${afterHours} after-hours events in 30d`,
    },
    {
      factor: "1:1 recovery gap",
      points: Math.min(1, Math.max(0, daysSinceOneOnOne - 14) / 30) * 15,
      detail: `${daysSinceOneOnOne}d since last 1:1`,
    },
    {
      factor: "Conflict load",
      points: Math.min(1, conflicts / 3) * 15,
      detail: `${conflicts} conflicts in 45d`,
    },
  ].sort((a, b) => b.points - a.points);
}

/** 0-100 engagement: pulse levels + participation (1:1s, feedback given/received, meetings). */
export function computeEngagementScore(events: PersonEvent[], today: Date): number {
  const pulses = events.filter(
    (e) => e.type === "pulse.mood.logged" && daysBetween(today, toDate(e.occurredAt)) <= 60
  );
  const moods = pulses.map((p) => Number(p.data.mood ?? 6));
  const meanMood = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : 6;

  const participation = events.filter(
    (e) =>
      ["oneonone.logged", "feedback.logged", "meeting.attended"].includes(e.type) &&
      daysBetween(today, toDate(e.occurredAt)) <= 60
  ).length;

  const moodComponent = (meanMood / 10) * 70;
  const participationComponent = Math.min(1, participation / 12) * 30;

  return Math.round(Math.max(0, Math.min(100, moodComponent + participationComponent)));
}

/** Growth velocity: rate of skill expansion, OKR trend and time-since-promotion adjusted. */
export function computeGrowthVelocity(
  events: PersonEvent[],
  today: Date,
  okrHistory: number[],
  tenureDays: number | null
): number {
  const skillsGained = events.filter((e) => e.type === "skill.acquired").length;
  const okrSlope = linearSlope(okrHistory);
  const promotions = events.filter((e) => e.type === "promotion.logged").length;
  const tenureYears = tenureDays ? Math.max(0.5, tenureDays / 365) : 1;

  const skillComponent = Math.min(1, skillsGained / 4) * 35;
  const okrComponent = Math.min(1, Math.max(0, okrSlope / 5)) * 35;
  const promotionComponent = Math.min(1, promotions / tenureYears) * 30;

  return Math.round(Math.max(0, Math.min(100, skillComponent + okrComponent + promotionComponent)));
}
