/**
 * app/core/domain/asgMath.js — the exact arithmetic of the Secondment /
 * Assignment Return & Handover Register (ADR-0262).
 *
 * Four computations, all derived on read:
 *
 *   - **Whole-day arithmetic.** Day differences for overdue returns, decided-
 *     late verdicts and horizon windows, computed exactly on UTC day keys and
 *     printed beside every verdict. A day count is never rounded to hide a
 *     boundary and never recomputed from a local clock.
 *   - **The return day in force.** The declared return day, moved forward only
 *     by accepted `extend` acts — one per act, in act order. The ORIGINAL day
 *     is kept and printed beside it, so drift is visible rather than absorbed.
 *   - **Question tracking.** The question "what happens at the return day?"
 *     opens at the start day and RE-OPENS at every extend's decided day. A
 *     decision's timeliness is judged against the return day in force at the
 *     moment it was decided — never re-judged after the fact.
 *   - **Coverage currency.** The current cover row per (assignment, duty
 *     label) is the LATEST by declaration; earlier rows are history, not
 *     repair material.
 *
 * Pure module: no DOM, no storage, no wall-clock globals.
 */

export function utcDayMs(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

export function dayLabel(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '—';
}

/** Whole days from `fromDay` to `toDay` (positive when toDay is later). */
export function daysBetweenDays(fromDay, toDay) {
  const from = utcDayMs(fromDay);
  const to = utcDayMs(toDay);
  if (from === null || to === null) return null;
  return Math.round((to - from) / 86400000);
}

/**
 * Walk the accepted decision acts in order and return the return-day ledger:
 * the ORIGINAL declared day, the day currently IN FORCE, the extension count,
 * and the per-decision timeliness (each judged against the day in force at its
 * own decided day). Nothing here mutates anything; the assignment record is
 * read, not rewritten.
 */
export function returnDayLedger(assignment, decisions) {
  const ordered = [...(decisions || [])].sort((a, b) => {
    const ka = `${a.day || ''}|${a.at || ''}|${a.actId}`;
    const kb = `${b.day || ''}|${b.at || ''}|${b.actId}`;
    return ka.localeCompare(kb);
  });
  let returnDayInForce = assignment.declaredReturnDay;
  let extendCount = 0;
  const timed = [];
  for (const decision of ordered) {
    const answeredDay = returnDayInForce;
    const lateDays = daysBetweenDays(answeredDay, decision.day);
    timed.push({
      ...decision,
      answeredDay,
      decidedLate: lateDays !== null && lateDays > 0,
      lateDays: lateDays !== null && lateDays > 0 ? lateDays : 0,
    });
    if (decision.decisionKind === 'extend' && decision.newDeclaredReturnDay) {
      returnDayInForce = decision.newDeclaredReturnDay;
      extendCount += 1;
    }
  }
  return {
    originalReturnDay: assignment.declaredReturnDay,
    returnDayInForce,
    extends: extendCount,
    timed,
  };
}

/**
 * The current cover row per duty label: the LATEST declaration governs, and
 * earlier rows stay on the record as history. Never merges two rows, never
 * invents coverage for a duty nobody named.
 */
export function currentCovers(covers) {
  const byDuty = new Map();
  for (const cover of covers || []) {
    if (!cover || !cover.dutyLabel) continue;
    const prior = byDuty.get(cover.dutyLabel);
    const key = `${cover.declaredDay || ''}|${cover.declaredAt || ''}|${cover.coverId}`;
    const priorKey = prior ? `${prior.declaredDay || ''}|${prior.declaredAt || ''}|${prior.coverId}` : '';
    if (!prior || key > priorKey) byDuty.set(cover.dutyLabel, cover);
  }
  return byDuty;
}

/** Handback completeness: which sides have evidence on file. */
export function handbackSides(acts) {
  const sides = { home: null, host: null };
  for (const act of acts || []) {
    if (!act || act.kind !== 'handback') continue;
    if (act.side === 'home' || act.side === 'host') {
      const prior = sides[act.side];
      const key = `${act.day || ''}|${act.at || ''}|${act.actId}`;
      const priorKey = prior ? `${prior.day || ''}|${prior.at || ''}|${prior.actId}` : '';
      if (!prior || key > priorKey) sides[act.side] = act;
    }
  }
  return {
    home: sides.home,
    host: sides.host,
    complete: Boolean(sides.home && sides.host),
  };
}

/** The latest home-consent act on file, or null. */
export function consentAct(acts) {
  let latest = null;
  for (const act of acts || []) {
    if (!act || act.kind !== 'home-consent') continue;
    const key = `${act.day || ''}|${act.at || ''}|${act.actId}`;
    const priorKey = latest ? `${latest.day || ''}|${latest.at || ''}|${latest.actId}` : '';
    if (!latest || key > priorKey) latest = act;
  }
  return latest;
}
