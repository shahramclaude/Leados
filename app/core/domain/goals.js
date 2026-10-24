/**
 * app/core/domain/goals.js — OKR-style progress, pace, and check-in hygiene.
 *
 * Progress is derived from key results, never typed in as a single percentage:
 * an objective whose KRs disagree with its stated progress is the most common
 * way OKR tooling becomes theatre. Pace compares progress against elapsed time
 * between creation and due date, which is what makes "at risk" detectable
 * before the deadline rather than after it.
 */

import { clamp, daysBetween, daysSince, isOverdue, latestByDate, mean, round, toDate } from '../time.js';

export const CONFIDENCE_ORDER = { 'on-track': 0, 'at-risk': 1, 'off-track': 2 };

/** 0–1 progress for a single key result. Lower targets are supported. */
export function keyResultProgress(kr) {
  const start = Number(kr.start ?? 0);
  const target = Number(kr.target ?? 100);
  const current = Number(kr.current ?? start);
  const span = target - start;
  if (span === 0) return current === target ? 1 : 0;
  return clamp((current - start) / span, 0, 1);
}

/** Weighted (equal) progress across KRs, 0–100. No KRs → null (not 0). */
export function goalProgress(goal) {
  const krs = goal.keyResults || [];
  if (!krs.length) return null;
  return round(mean(krs.map(keyResultProgress)) * 100, 1);
}

/** Human-readable KR value, e.g. "21 of 10 min" → "21 min". */
export function formatKeyResult(kr) {
  const unit = kr.unit ? ` ${kr.unit}` : '';
  return `${kr.current}${unit} → ${kr.target}${unit}`;
}

/**
 * Pace: where progress *should* be given elapsed time.
 * @returns {{
 *   progressPct:number|null, expectedPct:number|null, gap:number|null,
 *   status:'no-kr'|'done'|'overdue'|'ahead'|'on-track'|'behind'|'unknown',
 *   elapsedDays:number|null, totalDays:number|null, daysLeft:number|null
 * }}
 */
export function goalPace(goal, now) {
  const progressPct = goalProgress(goal);
  if (goal.status === 'done') {
    return { progressPct: 100, expectedPct: 100, gap: 0, status: 'done', elapsedDays: null, totalDays: null, daysLeft: 0 };
  }
  const created = toDate(goal.createdAt) ? goal.createdAt : null;
  const due = goal.dueDate;
  if (!due) {
    return { progressPct, expectedPct: null, gap: null, status: progressPct === null ? 'no-kr' : 'unknown', elapsedDays: null, totalDays: null, daysLeft: null };
  }
  const totalDays = created ? Math.max(1, daysBetween(created, due)) : null;
  const elapsedDays = created ? clamp(daysBetween(created, now), 0, totalDays ?? 9999) : null;
  const expectedPct = totalDays ? round((elapsedDays / totalDays) * 100, 1) : null;
  const daysLeft = daysBetween(now, due);
  const overdue = isOverdue(due, now);
  const progress = progressPct === null ? (goal.keyResults || []).length ? 0 : 0 : progressPct;

  if (overdue && progress < 100) {
    return { progressPct, expectedPct: 100, gap: round(progress - 100, 1), status: 'overdue', elapsedDays, totalDays, daysLeft };
  }
  if (progressPct === null) {
    return { progressPct: null, expectedPct, gap: null, status: 'no-kr', elapsedDays, totalDays, daysLeft };
  }
  const gap = round(progress - expectedPct, 1);
  const status = gap >= 5 ? 'ahead' : gap <= -15 ? 'behind' : 'on-track';
  return { progressPct, expectedPct, gap, status, elapsedDays, totalDays, daysLeft };
}

/** Combined health label: stated confidence plus computed pace, worst wins. */
export function goalHealth(goal, now) {
  const pace = goalPace(goal, now);
  const stated = goal.confidence || 'on-track';
  const computed =
    pace.status === 'overdue' || pace.status === 'behind' ? 'at-risk' : pace.status === 'no-kr' ? 'at-risk' : 'on-track';
  const worst = CONFIDENCE_ORDER[stated] >= CONFIDENCE_ORDER[computed] ? stated : computed;
  return { ...pace, stated, computed, health: worst, mismatch: stated === 'on-track' && computed !== 'on-track' };
}

export function activeGoals(state) {
  return state.goals.filter((g) => g.status === 'active');
}

export function goalsFor(state, personId) {
  return state.goals.filter((g) => g.ownerId === personId);
}

export function lastCheckin(goal) {
  return latestByDate(goal.checkins || []);
}

export function checkinStale(goal, now, settings) {
  const days = settings?.goalCheckinDays ?? 14;
  const last = lastCheckin(goal);
  if (!last) return { stale: true, days: null, never: true };
  const age = daysSince(last.date, now);
  return { stale: (age ?? 0) > days, days: age, never: false };
}

/** Portfolio summary for the Goals view header. */
export function goalsSummary(state, now, settings) {
  const active = activeGoals(state);
  const health = active.map((g) => ({ goal: g, ...goalHealth(g, now) }));
  const stale = health.filter((row) => checkinStale(row.goal, now, settings).stale);
  return {
    active: active.length,
    onTrack: health.filter((r) => r.health === 'on-track').length,
    atRisk: health.filter((r) => r.health === 'at-risk').length,
    offTrack: health.filter((r) => r.health === 'off-track').length,
    behind: health.filter((r) => r.status === 'behind' || r.status === 'overdue').length,
    noKr: health.filter((r) => r.progressPct === null).length,
    stale,
    rows: health.sort((a, b) => CONFIDENCE_ORDER[b.health] - CONFIDENCE_ORDER[a.health] || (a.progressPct ?? 0) - (b.progressPct ?? 0)),
  };
}
