/**
 * app/core/domain/pulse.js — team pulse aggregation with a hard privacy floor.
 *
 * Two rules that the rest of the app must not be able to bypass:
 *  1. An anonymous response never carries a personId (enforced again in the
 *     schema normaliser, so a hand-edited backup cannot leak identity).
 *  2. No aggregate is returned for a window with fewer than
 *     `settings.pulseMinResponses` responses. This is k-anonymity: with two
 *     responses, each person can subtract their own answer and infer the other.
 *     "Suppressed" is a first-class result, not an empty state.
 */

import { addDays, dayKey, mean, round, weekStart } from '../time.js';
import { PULSE_DIMENSIONS, PULSE_LABELS } from '../schema.js';

export const PULSE_WINDOW_DAYS = 14;

/**
 * Responses whose *calendar day* falls in a window of `windowDays` days
 * ending today, optionally shifted back by `offsetDays`.
 *
 * Windows are compared on day keys, not timestamps: with timestamp maths a
 * response recorded at 00:30 today lands 13.9 days before a "two weeks ago"
 * boundary calculated at 14:00, so it silently counts in both windows and the
 * "change" figure becomes nonsense.
 */
export function responsesInWindow(state, now, windowDays = PULSE_WINDOW_DAYS, offsetDays = 0) {
  const newest = dayKey(addDays(now, -offsetDays));
  const oldest = dayKey(addDays(now, -(offsetDays + windowDays - 1)));
  return state.pulses.filter((p) => {
    const day = String(p.date || '').slice(0, 10);
    return day >= oldest && day <= newest;
  });
}

/**
 * Every response in the window gave exactly the same answers. An average over
 * identical answers *is* each individual's answer, whatever the group size —
 * the homogeneity attack named in the ICO's anonymisation guidance.
 */
export function isUnanimous(responses) {
  if (responses.length < 2) return false;
  const signatures = new Set(
    responses.map((r) => PULSE_DIMENSIONS.map((dim) => (typeof r.scores?.[dim] === 'number' ? r.scores[dim] : '-')).join(',')),
  );
  return signatures.size === 1;
}

/**
 * Aggregate pulse for a window.
 * @returns {{
 *   n:number, blocked:boolean, minRequired:number, windowDays:number,
 *   overall:number|null, dimensions:Record<string,{avg:number|null,responses:number,label:string}>,
 *   lowest:{key:string,avg:number}|null
 * }}
 */
/** One release policy for every window, including weekly chart slices.
 * Use complete responses only, apply the floor to that cohort, and suppress the
 * whole vector if any dimension (or per-response mean) is unanimous. Releasing
 * the other dimensions plus the overall would otherwise reveal the hidden slice
 * by subtraction. This is exposure reduction, not a formal anonymity guarantee.
 */
function summarizeResponses(responses, min) {
  const complete = responses.filter((r) => PULSE_DIMENSIONS.every((dim) =>
    typeof r.scores?.[dim] === 'number' && Number.isFinite(r.scores[dim]) && r.scores[dim] >= 1 && r.scores[dim] <= 5));
  const subjectAvg = complete.map((r) => mean(PULSE_DIMENSIONS.map((dim) => r.scores[dim])));
  const belowFloor = complete.length < min;
  const unanimous = !belowFloor && (PULSE_DIMENSIONS.some((dim) => new Set(complete.map((r) => r.scores[dim])).size === 1)
    || new Set(subjectAvg).size === 1);
  const blocked = belowFloor || unanimous;
  const dimensions = Object.fromEntries(PULSE_DIMENSIONS.map((dim) => [dim, {
    key: dim, label: PULSE_LABELS[dim], responses: complete.length,
    avg: blocked ? null : round(mean(complete.map((r) => r.scores[dim])), 2),
  }]));
  const scored = Object.values(dimensions).filter((d) => d.avg !== null);
  const lowest = scored.length ? scored.reduce((a, b) => a.avg <= b.avg ? a : b) : null;
  return {
    n: responses.length, usableResponses: complete.length, incompleteResponses: responses.length - complete.length,
    blocked, blockedReason: belowFloor ? 'threshold' : unanimous ? 'unanimous' : null,
    unanimous, minRequired: min, overall: blocked ? null : round(mean(subjectAvg), 2), dimensions,
    lowest: lowest ? { key: lowest.key, label: lowest.label, avg: lowest.avg } : null,
  };
}

export function aggregate(state, now, { windowDays = PULSE_WINDOW_DAYS, minRequired = null } = {}) {
  const min = Math.max(3, minRequired ?? state.settings.pulseMinResponses ?? 5);
  return { ...summarizeResponses(responsesInWindow(state, now, windowDays), min), windowDays };
}

/**
 * Same privacy rules as `aggregate`, but for a window shifted back in time.
 * Used for "change vs the previous fortnight"; it must obey the identical
 * floor, or the comparison itself leaks the smaller window.
 */
export function aggregateWindow(state, now, windowDays, offsetDays) {
  const shifted = addDays(now, -offsetDays);
  const result = aggregate(state, shifted, { windowDays });
  return { ...result, responsesInWindow: undefined };
}

/** Weekly series for the trend chart. Suppressed weeks report avg = null. */
export function trend(state, now, { weeks = 8, minRequired = null } = {}) {
  const min = Math.max(3, minRequired ?? state.settings.pulseMinResponses ?? 5);
  const thisWeek = weekStart(now);
  const series = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDays(thisWeek, -7 * i);
    const end = addDays(start, 7);
    const responses = state.pulses.filter((p) => p.date >= start && p.date < end && p.date <= dayKey(now));
    const result = summarizeResponses(responses, min);
    series.push({ weekStart: start, n: result.n, usableResponses: result.usableResponses,
      blocked: result.blocked, blockedReason: result.blockedReason, overall: result.overall, safety: result.dimensions.safety.avg });
  }
  return series;
}

/** Compare the last window with the one before it. */
export function delta(state, now) {
  const recent = aggregate(state, now);
  const previous = aggregateWindow(state, now, PULSE_WINDOW_DAYS, PULSE_WINDOW_DAYS);
  if (recent.blocked || previous.blocked) return { available: false, recent, previous };
  return {
    available: true,
    recent,
    previous,
    overall: round(recent.overall - previous.overall, 2),
    safety: round(recent.dimensions.safety.avg - previous.dimensions.safety.avg, 2),
    workload: round(recent.dimensions.workload.avg - previous.dimensions.workload.avg, 2),
  };
}

/**
 * Qualitative comments in the window, with no attribution attached.
 * Comments are held to the same anonymity floor as scores: a single comment in
 * a five-person team is effectively a signed memo once everyone knows who was
 * in the room.
 */
export function comments(state, now, windowDays = PULSE_WINDOW_DAYS) {
  const window = responsesInWindow(state, now, windowDays);
  const min = state.settings.pulseMinResponses ?? 5;
  const withComments = window.filter((r) => (r.comment || '').trim().length > 0);
  if (withComments.length < min || new Set(withComments.map((r) => r.comment.trim())).size === 1) return [];
  return withComments
    .map((r) => ({ id: r.id, date: r.date, comment: r.comment.trim(), anonymity: r.anonymity }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** How many active people answered, and how many answers cannot be attributed. */
export function participation(state, now) {
  const active = state.people.filter((p) => p.status !== 'archived');
  const responses = responsesInWindow(state, now);
  const namedIds = new Set(responses.filter((r) => r.anonymity === 'named').map((r) => r.personId));
  const anonymousCount = responses.filter((r) => r.anonymity !== 'named').length;
  // Anonymous responses cannot be attributed, so participation is a floor.
  return {
    activePeople: active.length,
    responses: responses.length,
    knownResponders: namedIds.size,
    anonymousResponses: anonymousCount,
    coverageFloorPct: active.length ? round((Math.min(active.length, responses.length) / active.length) * 100) : 0,
  };
}

/** A 1–5 average flattened to a 0–100 scale, or null. */
export function toPercent(avg) {
  if (typeof avg !== 'number') return null;
  return round(((avg - 1) / 4) * 100);
}
