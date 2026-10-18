// Shared numeric helpers used by hypothesis.ts, emergent.ts and agent.ts.
// Original to this delivery.

import type { LeadosEvent } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(tsEarlier: string, tsLater: string): number {
  return (new Date(tsLater).getTime() - new Date(tsEarlier).getTime()) / DAY_MS;
}

/** Days ago relative to `today`, for an event timestamp. */
export function ageDays(ts: string, today: Date): number {
  return (today.getTime() - new Date(ts).getTime()) / DAY_MS;
}

export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs) ?? 0;
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeVelocityMean(events: LeadosEvent[], today: Date, windowDays = 30): number | null {
  const vals = events
    .filter((e) => e.type === 'velocity.logged' && ageDays(e.ts, today) <= windowDays)
    .map((e) => e.data.value as number);
  const m = mean(vals);
  return m === null ? null : round1(m);
}

export function computeTeamEngagement(events: LeadosEvent[], today: Date, windowDays = 30): number | null {
  const vals = events
    .filter((e) => e.type === 'engagement.pulse' && ageDays(e.ts, today) <= windowDays)
    .map((e) => e.data.value as number);
  const m = mean(vals);
  return m === null ? null : round1(m);
}

export function computeDecisionVelocity(events: LeadosEvent[], today: Date, windowDays = 30): number {
  return events.filter((e) => e.type === 'decision.logged' && ageDays(e.ts, today) <= windowDays).length;
}

export function computeDecisionOutcomeRate(events: LeadosEvent[]): number | null {
  const outcomes = events.filter((e) => e.type === 'decision.outcome');
  if (!outcomes.length) return null;
  const positive = outcomes.filter((e) => e.data.result === 'success').length;
  return Math.round((positive / outcomes.length) * 100) / 100;
}

export function computeTestMetric(metric: string, events: LeadosEvent[], today: Date): number | null {
  if (metric === 'velocity') return computeVelocityMean(events, today);
  if (metric === 'team_engagement') return computeTeamEngagement(events, today);
  if (metric === 'decision_outcome_positive_rate') return computeDecisionOutcomeRate(events);
  if (metric.startsWith('cluster_finding_count:')) return 0; // no re-detection modeled for this demo
  return null;
}
