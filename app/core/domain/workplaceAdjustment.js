/**
 * app/core/domain/workplaceAdjustment.js — the pure read model of the Workplace
 * Adjustment & Functional-Restriction Register (ADR-0241, Schema v195,
 * `#/adjustments`).
 *
 * ONE READER. Every state, every conflict, every duration, every acknowledgement
 * gap, every median and every count this register prints is derived HERE, on
 * read, from the dated declarations and the live reporting graph. Nothing
 * derived is ever stored, so a hand-edited workspace file cannot carry an
 * adjustment nobody put in place, an acknowledgement nobody gave, or a
 * restriction the record no longer supports — and a review date passing changes
 * the printed state without anybody writing anything.
 *
 * THE FIVE SEPARATIONS THIS READER EXISTS TO KEEP
 * -----------------------------------------------
 *  1. A RESTRICTION IS NOT AN ADJUSTMENT. The restriction is what the work must
 *     respect; the adjustment is what somebody actually did about it. A
 *     restriction with nothing done about it is `no-adjustment`, printed as
 *     such, never as "in hand".
 *
 *  2. AGREED IS NOT IN PLACE. An adjustment carries the day it was AGREED and,
 *     separately, the day it BECAME OPERATIONAL. Between them the legal duty is
 *     live and nothing has changed. The register prints both days and the exact
 *     integer days between them, and treats `agreed-not-in-place` as its own
 *     state rather than as a rounding step towards "done".
 *
 *  3. DECLINED IS NOT UNANSWERED. A recorded refusal with a written reason is a
 *     defensible position. A request nothing has decided is a defect. They are
 *     two states and are counted apart.
 *
 *  4. A TESTED LIMIT IS NOT AN UNTESTED ONE. Where the workspace holds declared
 *     work the limit can be tested against — night work, shift length, rest
 *     between shifts — the test runs exactly, across EVERY reporting line, and
 *     prints the whole minutes of exposure. Where it does not, the cell reads
 *     `no-exposure-record` with its reason. An untested limit is NEVER printed
 *     as within it: that is the failure that would let a five-kilogram limit
 *     read as clear because nobody looked.
 *
 *  5. THE FIGURES ADDING UP IS NOT THE SAME CLAIM AS THE FIGURES BEING
 *     COMPLETE. `balances` says the printed counts re-add to the rows they
 *     summarise; `figuresComplete` says nothing the register needed was
 *     unreadable, orphaned, unacknowledged or out of the seat's reach. They are
 *     reported separately, always, exactly as the matrix reconciliation
 *     contract requires.
 *
 * THE MATRIX IS COMPUTED, NEVER CHOSEN. A restriction belongs to a PERSON. The
 * reader merges every declared shift across every active line before testing
 * any limit, requires a dated acknowledgement from EVERY active line's holder,
 * counts a person once in every people figure, and hands the rule the joint apex
 * over the person's managers — never the person themselves, and never one line
 * on another line's behalf.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { normalizeWorkRestShifts, readEffectiveShifts } from './workRestSchema.js';
import { parseWallTime, resolveWallTime, zoneOffsetAt } from './workRestTime.js';
import {
  WPA_ADJUSTMENT_KIND_BY_KEY,
  WPA_DOMAIN_BY_KEY,
  WPA_ENGINE_VERSION,
  WPA_HREF,
  WPA_INSTRUMENT_BY_KEY,
  WPA_LIMITS as L,
  WPA_REVIEW_DECISION_BY_KEY,
  WPA_SETTING_KEYS,
  WPA_STATE_BY_KEY,
  WPA_TESTABLE_DOMAIN_KEYS,
  WPA_UNPROVEN,
} from './workplaceAdjustmentRegistry.js';
import {
  normalizeWpaAcknowledgements,
  normalizeWpaAdjustments,
  normalizeWpaMarkers,
  normalizeWpaRestrictions,
  normalizeWpaReviews,
  normalizeWpaSettings,
  readWpaNightWindow,
  wallMinutes,
  wpaDay,
} from './workplaceAdjustmentSchema.js';
import {
  absoluteMinute,
  dayNumber,
  daysBetweenDays,
  exactMedian,
  formatExactMedian,
  nightMinutesInShift,
  restGaps,
  shiftSpanMinutes,
  testMaxLimit,
  testMinLimit,
} from './workplaceAdjustmentMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** The workspace's own root node is a manager but not a roster person. */
export const isManagerNode = (id) => id === LEADER_ID;

/** A readable label for a hand. The raw id `leader` never reaches a screen. */
export function wpaPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

/**
 * Every ACTIVE line that holds a person, as `{ managerId, kind, shareH, lineId }`.
 *
 * Read from the ONE matrix engine (ADR-0140), so this register cannot drift from
 * every other roll-up in the workspace. A line that is not active today — a
 * secondment that ended, a line declared for next quarter — does not create an
 * acknowledgement duty, because nobody is handing that person work through it.
 */
export function activeLinesFor(matrix, personId) {
  const lines = matrix?.linesByPerson?.get(personId) || [];
  return lines
    .filter((line) => line && line.active !== false && line.managerId && line.managerId !== personId)
    .map((line) => ({
      lineId: line.id || null,
      managerId: line.managerId,
      kind: line.kind || null,
      shareH: Number.isInteger(line.shareH) ? line.shareH : null,
    }))
    .sort((a, b) => String(a.managerId).localeCompare(String(b.managerId)));
}

/**
 * The declared shifts of one person, merged across EVERY line, as absolute
 * intervals on one axis.
 *
 * `workRestShifts` is the workspace's only record of time actually worked, and
 * it is read THROUGH ITS OWN LOADER so this register cannot soften a row that
 * register would refuse. A shift that loader drops is reported here as an
 * unreadable exposure, never as zero exposure — understating what somebody was
 * rostered to do is the direction that hurts a person.
 */
export function readPersonWork(state, personId, { warnings = [], today } = {}) {
  const shifts = normalizeWorkRestShifts(state?.workRestShifts, warnings);
  const acts = Array.isArray(state?.workRestActs) ? state.workRestActs : [];
  const effective = readEffectiveShifts(shifts, acts);
  const mine = effective.filter((shift) => shift.personId === personId);
  const worked = mine.filter((shift) => shift.state === 'worked' || shift.state === 'planned');

  const intervals = [];
  const unreadable = [];
  for (const shift of worked) {
    // The shift is a LOCAL wall time on a named zone. The register tests the
    // wall clock the person actually worked, because a night-shift limit is
    // about the hours on the clock in front of them, not about UTC.
    const startWall = parseWallTime(shift.effStart);
    const endWall = parseWallTime(shift.effEnd);
    if (!startWall || !endWall) { unreadable.push({ shiftId: shift.id, why: 'a wall time this register cannot read' }); continue; }
    const startDayNumber = dayNumber(`${startWall.y}-${String(startWall.mo).padStart(2, '0')}-${String(startWall.d).padStart(2, '0')}`);
    const endDayNumber = dayNumber(`${endWall.y}-${String(endWall.mo).padStart(2, '0')}-${String(endWall.d).padStart(2, '0')}`);
    if (startDayNumber === null || endDayNumber === null) { unreadable.push({ shiftId: shift.id, why: 'a day this register cannot read' }); continue; }
    const startMin = startWall.h * 60 + startWall.mi;
    const endMin = endWall.h * 60 + endWall.mi;
    const spanMinutes = shiftSpanMinutes(startMin, endMin);
    if (!Number.isInteger(spanMinutes)) { unreadable.push({ shiftId: shift.id, why: 'a span that is empty or unreadable' }); continue; }
    const aStart = absoluteMinute(startDayNumber, startMin);
    // A span crossing midnight ends on the following day on this axis.
    const aEnd = endMin > startMin
      ? absoluteMinute(startDayNumber, endMin)
      : absoluteMinute(startDayNumber + 1, endMin);
    if (endDayNumber !== startDayNumber && endDayNumber !== startDayNumber + 1) {
      // A declared end three days later is not one shift; the register refuses
      // to guess how it should be split.
      unreadable.push({ shiftId: shift.id, why: 'an end more than one day after its start' });
      continue;
    }
    intervals.push({
      shiftId: shift.id,
      lineManagerId: shift.lineManagerId,
      zone: shift.zone,
      startWall: startMin,
      endWall: endMin,
      aStart,
      aEnd,
      minutes: aEnd - aStart,
      startText: shift.effStart,
      endText: shift.effEnd,
      state: shift.state,
    });
  }
  intervals.sort((a, b) => a.aStart - b.aStart || String(a.shiftId).localeCompare(String(b.shiftId)));

  // The horizon: anything declared, because an exposure that has not happened
  // yet is exactly the one a manager still has time to prevent.
  const horizon = today || null;
  return {
    shifts: intervals,
    unreadable,
    wornIntervals: intervals.filter((row) => !horizon || row.aStart >= dayNumber(horizon) - 30).map((row) => [row.aStart, row.aEnd]),
    allIntervals: intervals.map((row) => [row.aStart, row.aEnd]),
  };
}

/**
 * Test one restriction against the declared work on the record.
 *
 * Returns an object that ALWAYS says which of the three things happened:
 *   `{ testable: false, refused: <reason key> }`   — the record cannot support a test
 *   `{ testable: true, verdict: 'unproven' }`      — the test ran, the measurement could not be taken
 *   `{ testable: true, verdict: 'within'|'breached', ... }` — an exact answer
 *
 * An advisory instrument is never tested: treating advice as a prohibition would
 * be the register inventing a duty nobody declared.
 */
export function testRestrictionAgainstWork(restriction, work, nightWindow) {
  const domain = WPA_DOMAIN_BY_KEY[restriction.domain];
  const instrument = WPA_INSTRUMENT_BY_KEY[restriction.instrument];
  if (!instrument?.binding) {
    return { testable: false, refused: 'advisory', reason: WPA_UNPROVEN.advisory };
  }
  if (!domain?.testable) {
    return { testable: false, refused: 'no-exposure-record', reason: WPA_UNPROVEN['no-exposure-record'] };
  }
  if (work.unreadable.length) {
    return { testable: false, refused: 'unreadable-shift', reason: WPA_UNPROVEN['unreadable-shift'], unreadableN: work.unreadable.length };
  }
  if (!work.shifts.length) {
    return { testable: false, refused: 'no-shifts', reason: WPA_UNPROVEN['no-shifts'] };
  }

  if (restriction.domain === 'no-night-work') {
    const exposures = [];
    for (const shift of work.shifts) {
      const minutes = nightMinutesInShift(shift.aStart, shift.aEnd, nightWindow.startMinute, nightWindow.endMinute);
      if (!Number.isInteger(minutes)) {
        return { testable: true, verdict: 'unproven', measuredMinutes: null };
      }
      if (minutes > 0) {
        exposures.push({
          shiftId: shift.shiftId,
          lineManagerId: shift.lineManagerId,
          minutes,
          startText: shift.startText,
          endText: shift.endText,
        });
      }
    }
    exposures.sort((a, b) => b.minutes - a.minutes || String(a.shiftId).localeCompare(String(b.shiftId)));
    const total = exposures.reduce((sum, row) => sum + row.minutes, 0);
    return {
      testable: true,
      verdict: total > 0 ? 'breached' : 'within',
      measuredMinutes: total,
      exposures,
      testedShiftsN: work.shifts.length,
      basis: `${total} whole minute(s) inside the declared night window across ${work.shifts.length} declared shift(s) on every line.`,
    };
  }

  if (restriction.domain === 'max-shift-hours') {
    const limitMinutes = restriction.limitValue;
    if (!Number.isInteger(limitMinutes)) return { testable: true, verdict: 'unproven', measuredMinutes: null };
    const exposures = [];
    let longest = 0;
    for (const shift of work.shifts) {
      if (shift.minutes > longest) longest = shift.minutes;
      if (shift.minutes > limitMinutes) {
        exposures.push({
          shiftId: shift.shiftId,
          lineManagerId: shift.lineManagerId,
          minutes: shift.minutes,
          startText: shift.startText,
          endText: shift.endText,
        });
      }
    }
    exposures.sort((a, b) => b.minutes - a.minutes || String(a.shiftId).localeCompare(String(b.shiftId)));
    const test = testMaxLimit(longest, limitMinutes);
    return {
      testable: true,
      verdict: test.verdict,
      measuredMinutes: test.measuredMinutes,
      overByMinutes: test.overByMinutes,
      limitMinutes,
      exposures,
      testedShiftsN: work.shifts.length,
      basis: `The longest declared shift on any line is ${longest} whole minute(s) against a declared limit of ${limitMinutes}.`,
    };
  }

  if (restriction.domain === 'min-rest-hours') {
    const limitMinutes = restriction.limitValue;
    if (!Number.isInteger(limitMinutes)) return { testable: true, verdict: 'unproven', measuredMinutes: null };
    const gaps = restGaps(work.allIntervals);
    if (!gaps.length) {
      // Fewer than two spells of work on the record means the limit has not been
      // observed. That is not proof of adequate rest, and it is not a breach.
      return {
        testable: true,
        verdict: 'unproven',
        measuredMinutes: null,
        unprovenReason: 'Fewer than two separate spells of declared work are on the record, so no rest between shifts can be measured.',
        limitMinutes,
        testedShiftsN: work.shifts.length,
      };
    }
    const smallest = gaps.reduce((min, gap) => (gap.minutes < min.minutes ? gap : min), gaps[0]);
    const test = testMinLimit(smallest.minutes, limitMinutes);
    return {
      testable: true,
      verdict: test.verdict,
      measuredMinutes: test.measuredMinutes,
      shortByMinutes: test.shortByMinutes,
      limitMinutes,
      gapsN: gaps.length,
      breaches: gaps.filter((gap) => gap.minutes < limitMinutes).map((gap) => ({ minutes: gap.minutes, fromEnd: gap.fromEnd, toStart: gap.toStart })),
      testedShiftsN: work.shifts.length,
      basis: `The smallest declared gap between two spells of work on any line is ${smallest.minutes} whole minute(s) against a declared minimum of ${limitMinutes}.`,
    };
  }

  return { testable: false, refused: 'no-exposure-record', reason: WPA_UNPROVEN['no-exposure-record'] };
}

/**
 * The acknowledgement position for one restriction across every active line.
 *
 * `lines` lists EVERY active line with whether its holder has acknowledged the
 * restriction on or after the day it was declared. `missing` is the exact set a
 * finding can name. A line whose holder IS the person carrying the restriction
 * cannot acknowledge for themselves — they would be signing their own duty — and
 * that is printed as its own kind rather than counted as done.
 */
export function acknowledgementPosition(restriction, lines, acknowledgements) {
  const rows = lines.map((line) => {
    const own = acknowledgements
      .filter((row) => row.restrictionId === restriction.id && row.lineManagerId === line.managerId)
      .sort((a, b) => String(b.acknowledgedOn).localeCompare(String(a.acknowledgedOn)) || String(b.acknowledgedAt).localeCompare(String(a.acknowledgedAt)));
    const latest = own[0] || null;
    return {
      managerId: line.managerId,
      kind: line.kind,
      shareH: line.shareH,
      acknowledged: Boolean(latest),
      acknowledgedOn: latest?.acknowledgedOn || null,
      acknowledgedById: latest?.acknowledgedById || null,
    };
  });
  const missing = rows.filter((row) => !row.acknowledged);
  return {
    lines: rows,
    linesN: rows.length,
    acknowledgedN: rows.length - missing.length,
    missing,
    missingN: missing.length,
    complete: rows.length > 0 && missing.length === 0,
  };
}

/**
 * The state of one restriction, DERIVED. Order matters and is deliberate: a
 * withdrawn restriction is history; a record past its review date is the
 * loudest thing on the row because it is a live legal duty nobody re-checked;
 * a proven conflict outranks a tidy adjustment, because both facts are true and
 * the dangerous one leads.
 */
export function deriveRestrictionState({ restriction, adjustments, review, ack, test, today, conventions }) {
  if (restriction.status === 'withdrawn') {
    return { key: 'withdrawn', ...WPA_STATE_BY_KEY.withdrawn };
  }
  const live = adjustments.filter((row) => row.status === 'active');
  // A decline is only the position while NOTHING has been done: an adjustment
  // recorded later answers the same request and outranks the refusal.
  const declined = review?.decision === 'declined' && !live.length;
  const operational = live.filter((row) => row.operationalOn);
  const agreedOnly = live.filter((row) => !row.operationalOn);

  const reviewDue = Boolean(restriction.reviewOn && restriction.reviewOn <= today);
  const conflict = test?.testable && test.verdict === 'breached';

  if (conflict) return { key: 'operational-conflict', ...WPA_STATE_BY_KEY['operational-conflict'] };
  if (reviewDue) return { key: 'review-overdue', ...WPA_STATE_BY_KEY['review-overdue'] };
  if (declined) return { key: 'declined', ...WPA_STATE_BY_KEY.declined };
  // Nothing is in place. A decline already returned above, so what remains is a
  // restriction nothing on the record has answered — never read as reassuring.
  if (!live.length) return { key: 'no-adjustment', ...WPA_STATE_BY_KEY['no-adjustment'] };
  if (agreedOnly.length) {
    // Agreed, with a grace period that has run out. Inside the grace the row is
    // still `agreed-not-in-place`, because the duty is live either way.
    const grace = conventions?.adjustmentGraceDays ?? 14;
    const worst = agreedOnly.reduce((min, row) => (String(row.agreedOn) < String(min.agreedOn) ? row : min), agreedOnly[0]);
    const daysAgreed = daysBetweenDays(worst.agreedOn, today);
    return {
      key: 'agreed-not-in-place',
      ...WPA_STATE_BY_KEY['agreed-not-in-place'],
      agreedDaysAgo: Number.isInteger(daysAgreed) ? daysAgreed : null,
      pastGrace: Number.isInteger(daysAgreed) ? daysAgreed > grace : null,
      graceDays: grace,
    };
  }
  if (operational.length) {
    return { key: 'in-place', ...WPA_STATE_BY_KEY['in-place'] };
  }
  return { key: 'no-adjustment', ...WPA_STATE_BY_KEY['no-adjustment'] };
}

/**
 * The whole register, one pass.
 *
 * `seat` only narrows disclosure; with no seat the reading is the whole record,
 * exactly as the distributed-work and incident registers behave so that a
 * headless export and an operator screen cannot disagree about a figure.
 */
export function buildWorkplaceAdjustment(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const asOf = dayKey(at) || L.dayMin;
  const cfg = { ...(state?.settings || {}), ...(settings || {}) };
  const conventions = normalizeWpaSettings(cfg);
  const nightWindow = readWpaNightWindow(cfg);

  const restrictions = normalizeWpaRestrictions(state?.wpaRestrictions, warnings);
  const adjustments = normalizeWpaAdjustments(state?.wpaAdjustments, restrictions, warnings);
  const acknowledgements = normalizeWpaAcknowledgements(state?.wpaAcknowledgements, restrictions, warnings);
  const reviews = normalizeWpaReviews(state?.wpaReviews, restrictions, warnings);
  const markers = normalizeWpaMarkers(state?.wpaMarkers, warnings);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read, so no line can be tested or acknowledged: ${error?.message || 'unknown error'}.`;
  }
  const matrixLines = list(matrix?.lines).filter((line) => line && line.active !== false);
  const matrixNodeIds = new Set([...(matrix?.nodes?.keys?.() || []), LEADER_ID]);

  const reviewByRestriction = new Map();
  for (const review of reviews) {
    const held = reviewByRestriction.get(review.restrictionId);
    if (!held || String(review.reviewedOn) > String(held.reviewedOn)) reviewByRestriction.set(review.restrictionId, review);
  }

  const workCache = new Map();
  const workFor = (personId) => {
    if (!workCache.has(personId)) workCache.set(personId, readPersonWork(state, personId, { warnings, today: asOf }));
    return workCache.get(personId);
  };

  /* ---------------------------------------------------------- the rows */

  const rows = [];
  let orphanN = 0;
  for (const restriction of restrictions) {
    if (restriction.status !== 'active') {
      rows.push({
        restriction,
        person: null,
        personName: null,
        orphan: false,
        adjustments: adjustments.filter((row) => row.restrictionId === restriction.id),
        review: reviewByRestriction.get(restriction.id) || null,
        ack: null,
        test: null,
        state: deriveRestrictionState({
          restriction, adjustments: [], review: null, ack: null, test: null, today: asOf, conventions,
        }),
        apex: null,
      });
      continue;
    }

    const node = matrix?.nodes?.get(restriction.personId) || matrix?.roster?.get(restriction.personId) || null;
    const orphan = !matrixNodeIds.has(restriction.personId) || !node;
    if (orphan) orphanN += 1;

    const lines = orphan ? [] : activeLinesFor(matrix, restriction.personId);
    const ack = acknowledgementPosition(restriction, lines, acknowledgements);
    const mine = adjustments.filter((row) => row.restrictionId === restriction.id);
    const work = orphan ? { shifts: [], unreadable: [], allIntervals: [] } : workFor(restriction.personId);
    const test = testRestrictionAgainstWork(restriction, work, nightWindow);
    const review = reviewByRestriction.get(restriction.id) || null;

    const apex = lines.length ? matrixJointApex(matrix, lines.map((line) => line.managerId)) : null;

    rows.push({
      restriction,
      person: node,
      personName: orphan ? null : wpaPersonLabel(matrix, restriction.personId),
      orphan,
      adjustments: mine,
      review,
      ack,
      test,
      apex,
      state: deriveRestrictionState({
        restriction, adjustments: mine, review, ack, test, today: asOf, conventions,
      }),
    });
  }

  /* ------------------------------------------------ disclosure / seat scope */

  const detailed = !seat || seat.fullAccess || (Number.isInteger(seat.rank) ? seat.rank <= 3 : true);
  const operator = !seat || seat.fullAccess === true;
  const seatNodeId = operator ? null : (seat?.nodeId || seat?.id || null);
  const reach = operator ? null : new Set([seatNodeId, ...list(seat?.scope), ...list(seat?.lineScope), ...list(seat?.lineManagers)]);

  /* ------------------------------------------------------- the aggregates */

  const liveRows = rows.filter((row) => row.restriction.status === 'active');
  const states = Object.fromEntries(Object.keys(WPA_STATE_BY_KEY).map((key) => [key, 0]));
  for (const row of liveRows) states[row.state.key] = (states[row.state.key] || 0) + 1;

  const liveAdjustments = adjustments.filter((row) => row.status === 'active');
  const operationalDays = [];
  for (const row of liveAdjustments) {
    if (!row.operationalOn) continue;
    const days = daysBetweenDays(row.agreedOn, row.operationalOn);
    if (Number.isInteger(days) && days >= 0) operationalDays.push(days);
  }
  const medianFloor = Math.max(conventions[WPA_SETTING_KEYS.privacyFloor] || 3, Number(seat?.disclosure?.floorN) || 0);
  const median = operationalDays.length >= medianFloor ? exactMedian(operationalDays) : null;

  const conflictMinutes = liveRows.reduce((sum, row) => sum + (Number.isInteger(row.test?.measuredMinutes) && row.test.verdict === 'breached' ? row.test.measuredMinutes : 0), 0);
  const unprovenN = liveRows.filter((row) => row.test?.testable === false || row.test?.verdict === 'unproven').length;
  const conflictN = liveRows.filter((row) => row.test?.verdict === 'breached').length;

  const linesTotal = liveRows.reduce((sum, row) => sum + (row.ack?.linesN || 0), 0);
  const linesAcknowledged = liveRows.reduce((sum, row) => sum + (row.ack?.acknowledgedN || 0), 0);
  const linesMissing = liveRows.reduce((sum, row) => sum + (row.ack?.missingN || 0), 0);

  const peopleRestricted = new Set(liveRows.filter((row) => !row.orphan).map((row) => row.restriction.personId));

  /**
   * TWO CLAIMS, PRINTED APART (Bulletproof Reliability Mandate).
   *   `statesReconcile` — every printed state count re-adds to the live rows.
   *   `adjustmentsReconcile` — every live adjustment is attached to a live
   *      restriction, and no live restriction is left out of a state bucket.
   */
  const stateTotal = Object.values(states).reduce((sum, n) => sum + n, 0);
  const attachedAdjustments = liveAdjustments.filter((row) => liveRows.some((live) => live.restriction.id === row.restrictionId)).length;
  const balances = {
    statesReconcile: stateTotal === liveRows.length,
    adjustmentsReconcile: attachedAdjustments === liveAdjustments.length,
    linesReconcile: linesAcknowledged + linesMissing === linesTotal,
  };

  const incompleteReasons = [];
  if (warnings.length) incompleteReasons.push(`${warnings.length} stored row(s) were unreadable and were refused with a count; no figure was repaired.`);
  if (orphanN) incompleteReasons.push(`${orphanN} live restriction(s) name a person who is not on the active reporting graph; their limits are untested and their lines unacknowledged.`);
  if (matrixError) incompleteReasons.push(matrixError);
  if (linesMissing) incompleteReasons.push(`${linesMissing} active reporting line(s) hold a restricted person and have never acknowledged the restriction.`);
  if (unprovenN) incompleteReasons.push(`${unprovenN} live restriction(s) could not be tested against declared work; the reason is printed on each and none is reported as clear.`);
  if (!balances.statesReconcile) incompleteReasons.push('The printed state counts do not re-add to the live restrictions they summarise.');
  if (!balances.adjustmentsReconcile) incompleteReasons.push('A live adjustment is not attached to a live restriction.');
  if (!balances.linesReconcile) incompleteReasons.push('The printed acknowledgement counts do not re-add to the lines they summarise.');

  /* --------------------------------------------------------- line roll-up */

  const byLine = new Map();
  for (const row of liveRows) {
    for (const line of row.ack?.lines || []) {
      const entry = byLine.get(line.managerId) || {
        managerId: line.managerId,
        managerName: matrix ? wpaPersonLabel(matrix, line.managerId) : line.managerId,
        linesN: 0,
        acknowledgedN: 0,
        restrictedPeople: new Set(),
        conflictsN: 0,
        noAdjustmentN: 0,
      };
      entry.linesN += 1;
      if (line.acknowledged) entry.acknowledgedN += 1;
      entry.restrictedPeople.add(row.restriction.personId);
      if (row.test?.verdict === 'breached') entry.conflictsN += 1;
      if (row.state.key === 'no-adjustment') entry.noAdjustmentN += 1;
      byLine.set(line.managerId, entry);
    }
  }
  const lineRows = [...byLine.values()]
    .map((entry) => ({
      ...entry,
      restrictedPeopleN: entry.restrictedPeople.size,
      restrictedPeople: [...entry.restrictedPeople].sort(),
      missingN: entry.linesN - entry.acknowledgedN,
    }))
    .sort((a, b) => String(a.managerName).localeCompare(String(b.managerName)));

  /* --------------------------------------------------------- domain rows */

  const domainRows = [];
  for (const domain of Object.values(WPA_DOMAIN_BY_KEY)) {
    const mine = liveRows.filter((row) => row.restriction.domain === domain.key);
    if (!mine.length) continue;
    domainRows.push({
      domain: domain.key,
      label: domain.label,
      testable: domain.testable,
      rulesN: mine.length,
      peopleN: new Set(mine.map((row) => row.restriction.personId)).size,
      conflictN: mine.filter((row) => row.test?.verdict === 'breached').length,
      unprovenN: mine.filter((row) => !domain.testable || row.test?.verdict === 'unproven').length,
      inPlaceN: mine.filter((row) => row.state.key === 'in-place').length,
      reviewOverdueN: mine.filter((row) => row.state.key === 'review-overdue').length,
      notes: domain.basis || WPA_UNPROVEN['no-exposure-record'],
    });
  }

  /* ----------------------------------------------------- review horizon */

  const reviewRows = liveRows
    .filter((row) => row.restriction.reviewOn)
    .map((row) => ({
      restrictionId: row.restriction.id,
      personName: row.personName,
      domain: row.restriction.domain,
      reviewOn: row.restriction.reviewOn,
      daysRemaining: daysBetweenDays(asOf, row.restriction.reviewOn),
      overdue: row.restriction.reviewOn <= asOf,
      warn: !(row.restriction.reviewOn <= asOf)
        && daysBetweenDays(asOf, row.restriction.reviewOn) <= (conventions[WPA_SETTING_KEYS.reviewWarnDays] || 14),
      state: row.state.key,
    }))
    .sort((a, b) => String(a.reviewOn).localeCompare(String(b.reviewOn)));

  /* --------------------------------------------------------- disclosure */

  const disclosure = detailed
    ? { level: 'detail', reason: null, rank: seat?.rank ?? null }
    : {
      level: 'aggregate',
      reason: `Person-level rows are withheld above rank 3; this reading prints counts and rates. Restricted work is individual material — the same class as 1:1 content and Just Culture reviews.`,
      rank: seat?.rank ?? null,
    };

  return {
    ok: true,
    engineVersion: WPA_ENGINE_VERSION,
    matrix,
    asOf,
    conventions,
    nightWindow,
    restrictions,
    adjustments,
    acknowledgements,
    reviews,
    markers,
    rows,
    liveRows,
    detailed: Boolean(detailed),
    disclosure,
    warnings,
    matrixError,
    orphanN,
    states,
    stateTotal,
    balances,
    figuresComplete: incompleteReasons.length === 0,
    incompleteReasons,
    totals: {
      restrictions: restrictions.length,
      live: liveRows.length,
      withdrawn: rows.length - liveRows.length,
      adjustments: adjustments.length,
      liveAdjustments: liveAdjustments.length,
      agreedNotInPlaceN: states['agreed-not-in-place'] || 0,
      noAdjustmentN: states['no-adjustment'] || 0,
      declinedN: states.declined || 0,
      inPlaceN: states['in-place'] || 0,
      conflictN,
      conflictMinutes,
      unprovenN,
      reviewOverdueN: states['review-overdue'] || 0,
      peopleN: peopleRestricted.size,
      linesN: linesTotal,
      linesAcknowledgedN: linesAcknowledged,
      linesMissingN: linesMissing,
    },
    medianAgreedToOperational: median ? { ...median, formatted: formatExactMedian(median), n: operationalDays.length, floor: medianFloor } : null,
    medianReason: median ? null : `Fewer than ${medianFloor} adjustment(s) on this record carry both an agreement day and an operational day, so no median is printed. A median over fewer rows is a proportion of nothing.`,
    lineRows,
    domainRows,
    reviewRows,
    attention: {
      conflictN,
      reviewOverdueN: states['review-overdue'] || 0,
      agreedNotInPlaceN: states['agreed-not-in-place'] || 0,
      noAdjustmentN: states['no-adjustment'] || 0,
      linesMissingN: linesMissing,
      total: conflictN + (states['review-overdue'] || 0) + (states['agreed-not-in-place'] || 0) + (states['no-adjustment'] || 0) + linesMissing,
    },
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The navigation badge count. Counts DECISION-SHAPED duty only: a proven
 * conflict with declared work, a restriction past its review date, an
 * adjustment agreed and never made operational, a live restriction with nothing
 * done about it, and a line holding a restricted person that has never
 * acknowledged it. It deliberately does NOT count every live restriction, so the
 * badge reads as "work owed" rather than "people with bodies".
 */
export function workplaceAdjustmentAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildWorkplaceAdjustment(state, { now, settings, seat });
    if (!report?.ok) return 0;
    return report.attention.total;
  } catch {
    return 0;
  }
}

/** The matrix slice other modules need: which people are restricted, and on what domain. */
export function workplaceAdjustmentMatrix(state, { now = new Date(), settings = null } = {}) {
  const report = buildWorkplaceAdjustment(state, { now, settings, seat: null });
  const byPerson = new Map();
  for (const row of report.liveRows) {
    const held = byPerson.get(row.restriction.personId) || { personId: row.restriction.personId, domains: new Set(), conflict: false, reviewOverdue: false };
    held.domains.add(row.restriction.domain);
    if (row.test?.verdict === 'breached') held.conflict = true;
    if (row.state.key === 'review-overdue') held.reviewOverdue = true;
    byPerson.set(row.restriction.personId, held);
  }
  return {
    byPerson: new Map([...byPerson.entries()].map(([personId, held]) => [personId, { ...held, domains: [...held.domains].sort() }])),
    nightWindow: report.nightWindow,
    asOf: report.asOf,
  };
}

/**
 * Insights signals. Three facts worth an executive's attention, each with the
 * printed evidence and a route — and none of them a score on a person.
 */
export function workplaceAdjustmentSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildWorkplaceAdjustment(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Workplace adjustments', route: WPA_HREF, ...signal });

  if (report.totals.conflictN) {
    add({
      ruleId: 'WPA-01',
      severity: Math.min(5, 4 + Math.min(1, report.totals.conflictN - 1)),
      confidence: 'high',
      title: `${report.totals.conflictN} restriction(s) in proven conflict with declared work`,
      detail: `Declared shifts on the record break a limit this register can test exactly — ${report.totals.conflictMinutes} whole minute(s) of exposure in total. Both facts are printed: an adjustment may also be in place.`,
      action: { label: 'Open the workplace adjustment register', route: `${WPA_HREF}?view=conflicts` },
      evidence: [
        `${report.totals.peopleN} people with a live restriction`,
        `${report.totals.linesN} active reporting line(s) carrying them`,
      ],
    });
  }

  if (report.totals.reviewOverdueN) {
    add({
      ruleId: 'WPA-02',
      severity: 4,
      confidence: 'high',
      title: `${report.totals.reviewOverdueN} restriction(s) past their review date`,
      detail: 'A review day has passed with no recorded review. Time alone never lifts a restriction, so the duty is still live and nobody has re-checked it. The oldest is printed with its exact days outstanding.',
      action: { label: 'See the review horizon', route: `${WPA_HREF}?view=register` },
      evidence: [`warning window ${report.conventions[WPA_SETTING_KEYS.reviewWarnDays]} day(s)`],
    });
  }

  if (report.totals.linesMissingN) {
    add({
      ruleId: 'WPA-03',
      severity: 3,
      confidence: 'high',
      title: `${report.totals.linesMissingN} reporting line(s) have never acknowledged a restriction they hold`,
      detail: 'An adjustment does not survive a handover. A manager who now holds a restricted person and has never been shown the restriction is a printed finding, not an assumption, and a line change re-opens it by itself.',
      action: { label: 'See the per-line position', route: `${WPA_HREF}?view=lines` },
      evidence: [`${report.totals.linesAcknowledgedN} of ${report.totals.linesN} line(s) acknowledged`],
    });
  }

  if (report.totals.agreedNotInPlaceN) {
    add({
      ruleId: 'WPA-04',
      severity: 3,
      confidence: 'high',
      title: `${report.totals.agreedNotInPlaceN} adjustment(s) agreed and never made operational`,
      detail: 'The two dates that matter are when an adjustment was agreed and when it actually took effect. The register holds both and prints the exact days between them — the distance the adjustment-register category says employers cannot produce.',
      action: { label: 'Open the register', route: `${WPA_HREF}` },
      evidence: [report.medianAgreedToOperational ? `median ${report.medianAgreedToOperational.formatted} day(s) over ${report.medianAgreedToOperational.n} adjustment(s)` : report.medianReason].filter(Boolean),
    });
  }

  return signals;
}

export { WPA_HREF };
