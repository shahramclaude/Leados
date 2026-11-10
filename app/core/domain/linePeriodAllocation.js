/**
 * app/core/domain/linePeriodAllocation.js — the Matrix Line Period-Allocation
 * Ledger's pure read model (ADR-0158, Schema v129 unchanged,
 * `#/matrix?panel=allocation`, CSV scope #119).
 *
 * THE QUESTION, ASKED OF A CLOSED PERIOD
 * --------------------------------------
 * Every other surface in this product reads a line's share for TODAY: the
 * live roll-up (ADR-0140), the envelope position (ADR-0142), the merit
 * effective date (ADR-0154/0155), the re-affirmation term (ADR-0157). A
 * director reconciling a quarter against what the declarations actually
 * charged has nothing to read: a line that ran four months at 40% and two at
 * 15% is priced at 15% by every roll-up, and the 40% months are charged
 * nowhere.
 *
 * This module reads each declaration's OWN window plus its bounded in-row
 * change history (stored since ADR-0140, read by nothing until now) and
 * produces the TIME-WEIGHTED charge per named period, in exact integer
 * share-days: whole hundredths of a person × whole days. Averages are printed
 * as numerator ÷ denominator, never as a float standing alone.
 *
 * THE REFUSALS ARE THE PRODUCT
 * ----------------------------
 *  - A period reaching behind the coverage the retained history can PROVE is
 *    refused with the coverage start printed. At the history cap, five
 *    retained entries cannot distinguish exactly-five changes from nine with
 *    four displaced; the ledger refuses rather than guesses which, and it
 *    never projects today's number backwards over the gap.
 *  - One undeclared share-day refuses the row's total; one refused row refuses
 *    the person's total; one refused person refuses the workspace total. No
 *    partial sum is ever printed as though it were the whole.
 *  - A line the matrix engine refused (a defect) is never weighted; it is
 *    counted with the engine's own reason printed.
 *  - The home line's allocation is out of scope: its pointer moves and its
 *    history is ADR-0149/0155's. Weighting it here would attribute a past
 *    period to whoever holds the pointer today.
 *  - Over-commitment (more than one whole person charged on one day) is
 *    counted only when every in-window line of that person was priced; a
 *    partial day sweep could hide an over-commitment, so the claim is refused
 *    instead — fail-closed in the direction that cannot flatter.
 *
 * Pure module: no DOM, no storage, no implicit clock beyond the injected
 * `now` and the named period. Nothing derived is stored; every figure is
 * recomputed from the persisted declarations on every read, so a printed
 * figure cannot drift from the record it describes.
 */

import { dayKey, daysBetween, startOfDay } from '../time.js';
import { LEADER_ID } from './chain.js';
import { activeSeat, buildSeats } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { MATRIX_LIMITS } from './matrixRegistry.js';
import {
  LINE_PERIOD_ALLOCATION_BOUNDS,
  LINE_PERIOD_ALLOCATION_CONVENTIONS,
  LINE_PERIOD_ALLOCATION_ENGINE_VERSION,
  LINE_PERIOD_ALLOCATION_FULL_H,
  LINE_PERIOD_ALLOCATION_LIMITS,
  LINE_PERIOD_ALLOCATION_METHOD,
  LINE_PERIOD_ALLOCATION_REFUSED_STATES,
  LINE_PERIOD_ALLOCATION_STATES,
  LINE_PERIOD_ALLOCATION_STATE_LABELS,
  LINE_PERIOD_ALLOCATION_STATE_TONES,
  LINE_PERIOD_ALLOCATION_VERDICTS,
  linePeriodAllocationVerdict,
} from './linePeriodAllocationRegistry.js';

/* ------------------------------------------------------------ small helpers */

function dayOf(value) {
  const s = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function nameOf(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** Whole days from `from` to `to`, INCLUSIVE of both ends. Null when unreadable. */
function inclusiveDays(from, to) {
  const span = daysBetween(from, to);
  return span === null ? null : span + 1;
}

/** The next day key after `day`, or null when unreadable. */
function nextDay(day) {
  const t = startOfDay(day);
  if (!t) return null;
  return new Date(t.getTime() + 86400000).toISOString().slice(0, 10);
}

/** Every day key from `from` to `to` inclusive. Callers bound the window first. */
function dayList(from, to) {
  const out = [];
  let cursor = from;
  while (cursor && cursor <= to) {
    out.push(cursor);
    cursor = nextDay(cursor);
  }
  return out;
}

/* ------------------------------------------------------------- the window */

/**
 * The default period: the LAST COMPLETED calendar quarter. A reconciliation
 * reads a closed period; the quarter that is still running has not happened
 * yet, and pricing it would mix a measured past with an open present.
 */
export function defaultAllocationPeriod(now = new Date()) {
  const d = startOfDay(now) || new Date();
  const year = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3); // 0-based index of the RUNNING quarter
  const starts = ['01-01', '04-01', '07-01', '10-01'];
  const ends = ['03-31', '06-30', '09-30', '12-31'];
  if (q === 0) {
    return { from: `${year - 1}-10-01`, to: `${year - 1}-12-31`, label: 'the last completed calendar quarter' };
  }
  return { from: `${year}-${starts[q - 1]}`, to: `${year}-${ends[q - 1]}`, label: 'the last completed calendar quarter' };
}

/**
 * Validate the named period. The bounds are declared, not fitted: outside
 * them the reading is REFUSED with the bound printed — never clamped, because
 * clamping answers a question nobody asked.
 */
export function resolveAllocationWindow({ from = null, to = null, now = new Date(), source = 'query' } = {}) {
  const fallback = defaultAllocationPeriod(now);
  const fromDay = dayOf(from) || (source === 'query' && from ? null : fallback.from);
  const toDay = dayOf(to) || (source === 'query' && to ? null : fallback.to);
  const base = {
    from: fromDay, to: toDay, days: null, valid: false, refuseReason: null,
    source: source === 'query' && (from || to) ? 'query' : 'default',
    label: source === 'query' && (from || to) ? 'the period named on this screen' : fallback.label,
  };
  if (!fromDay || !toDay) {
    return { ...base, refuseReason: 'The period is not two readable YYYY-MM-DD days, and a period nobody can read is not a period. Nothing was clamped and nothing was guessed.' };
  }
  if (fromDay > toDay) {
    return { ...base, refuseReason: `The period ends on ${toDay}, before it starts on ${fromDay}. The reading is refused rather than swapped: a reversed window is a mistake a human has to look at.` };
  }
  const days = inclusiveDays(fromDay, toDay);
  const [minDays, maxDays] = LINE_PERIOD_ALLOCATION_BOUNDS.windowDays;
  if (days === null || days < minDays || days > maxDays) {
    return { ...base, days, refuseReason: `The period is ${days === null ? 'unreadable' : `${days} day(s)`}; the declared bound is ${minDays}–${maxDays} days inclusive. The reading is refused rather than clamped.` };
  }
  return { ...base, days, valid: true };
}

/* ------------------------------------------------- one line's share timeline */

/**
 * The share timeline of one declaration row, rebuilt from what is STORED: the
 * bounded in-row history (each entry holds the share the retune REPLACED, at
 * the timestamp of the retune) plus the current share, which is in force from
 * the last retained retune forward.
 *
 * `coverageFrom` is the earliest day this timeline can PROVE. Below the history
 * cap, the retained entries are all of them, and the oldest replaced share
 * reaches back to the declaration's own first day. AT the cap, the oldest
 * entries were displaced and nothing distinguishes exactly-cap changes from
 * more — so coverage is provable only from the oldest RETAINED change forward,
 * and a period reaching behind that day is refused rather than projected.
 */
export function shareTimelineFor(row) {
  const stored = Array.isArray(row?.history) ? row.history.filter((e) => e && e.at) : [];
  const entries = [...stored].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const unsorted = entries.some((e, i) => e !== stored[i]);
  const boundaries = entries.map((e) => dayKey(e.at)).filter(Boolean);
  const atCap = stored.length >= MATRIX_LIMITS.history;
  const distinctDays = new Set(boundaries);
  return {
    entries,
    boundaries,
    atCap,
    historyUnsorted: unsorted,
    sameDayRetunesN: boundaries.length - distinctDays.size,
    coverageFrom: atCap && boundaries.length ? boundaries[0] : dayOf(row?.fromISO),
    currentShareH: Number.isInteger(row?.shareH) ? row.shareH : null,
  };
}

/**
 * The declared share in force on one day, or null when the day carries no
 * declared share. THE DAY OF A RETUNE IS READ AT ITS CLOSING SHARE — a declared
 * convention, printed wherever it applies. Callers must have proved coverage
 * first (`day >= timeline.coverageFrom`); behind that point the answer is not
 * knowable from the retained record and this function returns the oldest
 * replaced share ONLY when the history is below its cap.
 */
export function shareOnDay(timeline, day) {
  const { entries, boundaries, currentShareH } = timeline;
  if (!entries.length) return currentShareH;
  let last = -1;
  for (let i = 0; i < boundaries.length; i += 1) {
    if (boundaries[i] <= day) last = i; else break;
  }
  if (last === -1) return entries[0].shareH ?? null;
  if (last === entries.length - 1) return currentShareH;
  return entries[last + 1].shareH ?? null;
}

/* ------------------------------------------------------------- one line row */

/**
 * Weigh ONE declaration row against the named window. Never stored; recomputed
 * on every read from the persisted row.
 */
function weighLineRow(row, window, { defect = null, relationshipMerged = false, matrix }) {
  const kind = row.kind || 'undeclared';
  const managerId = row.managerId;
  const managerName = nameOf(matrix.nodes?.get?.(managerId)?.name, managerId);
  const base = {
    declarationId: row.id,
    personId: row.personId,
    kind,
    managerId,
    managerName,
    relationshipMerged,
    fromISO: dayOf(row.fromISO),
    toISO: dayOf(row.toISO),
    inWindow: false,
    overlap: null,
    shareDaysH: null,
    daysInWindow: 0,
    firstShareH: null,
    lastShareH: null,
    minShareH: null,
    maxShareH: null,
    retunesInWindowN: 0,
    undeclaredDaysN: 0,
    historyRetainedN: Array.isArray(row.history) ? row.history.length : 0,
    historyAtCap: false,
    historyUnsorted: false,
    sameDayRetunesN: 0,
    coverageFrom: null,
    segments: [],
    segmentsOmittedN: 0,
    averageArithmetic: null,
    averageShareDisplay: null,
    refusesTotal: false,
    state: null,
    stateLabel: null,
    stateTone: null,
    reason: '',
    defect: defect ? defect.defect : null,
    defectDetail: defect ? defect.detail : null,
  };
  const settle = (state, reason, extra = {}) => ({
    ...base,
    state,
    stateLabel: LINE_PERIOD_ALLOCATION_STATE_LABELS[state],
    stateTone: LINE_PERIOD_ALLOCATION_STATE_TONES[state],
    reason,
    refusesTotal: LINE_PERIOD_ALLOCATION_REFUSED_STATES.includes(state) && extra.inWindow !== false,
    ...extra,
  });

  // A row the matrix engine itself refused is never weighted. The engine's own
  // reason is printed; this module does not paraphrase a refusal it did not make.
  if (defect) {
    const cleanFrom = dayOf(row.fromISO);
    const cleanTo = dayOf(row.toISO);
    const provablyOutside = cleanFrom && cleanTo && (cleanTo < window.from || cleanFrom > window.to);
    return settle(
      LINE_PERIOD_ALLOCATION_STATES.defect,
      `The matrix engine refused this line (${defect.defect}): ${defect.detail} A refused line is never weighted; the refusal is counted and printed.`,
      { inWindow: !provablyOutside },
    );
  }

  const timeline = shareTimelineFor(row);
  base.historyAtCap = timeline.atCap;
  base.historyUnsorted = timeline.historyUnsorted;
  base.sameDayRetunesN = timeline.sameDayRetunesN;
  base.coverageFrom = timeline.coverageFrom;

  const overlapFrom = base.fromISO && base.fromISO > window.from ? base.fromISO : window.from;
  const lineEnd = base.toISO && base.toISO < window.to ? base.toISO : window.to;
  if (!base.fromISO || overlapFrom > lineEnd) {
    return settle(
      LINE_PERIOD_ALLOCATION_STATES.outOfWindow,
      base.toISO && base.toISO < window.from
        ? `The line ended on ${base.toISO}, before this period began on ${window.from}. It is excluded from the period — an absence of scope, not a zero.`
        : `The line starts on ${base.fromISO || 'an unreadable day'}, after this period ended on ${window.to}. It is excluded from the period — an absence of scope, not a zero.`,
      { inWindow: false },
    );
  }
  const overlapTo = lineEnd;
  const daysN = inclusiveDays(overlapFrom, overlapTo);

  // COVERAGE, PROVED OR REFUSED — the load-bearing refusal. At the history cap
  // the oldest changes were displaced, and five retained entries cannot tell
  // exactly-five from nine-with-four-dropped. A period reaching behind the
  // provable point is refused outright rather than priced from today's number.
  if (timeline.atCap && timeline.coverageFrom && overlapFrom < timeline.coverageFrom) {
    const unprovableDays = inclusiveDays(overlapFrom, prevDay(timeline.coverageFrom));
    return settle(
      LINE_PERIOD_ALLOCATION_STATES.historyGap,
      `The retained change history sits at its declared cap of ${MATRIX_LIMITS.history} entries and can prove coverage only from ${timeline.coverageFrom} forward; this period reaches back to ${overlapFrom}${unprovableDays ? ` — ${unprovableDays} day(s) cannot be proved` : ''}. The weighted figure is refused rather than projected backwards from today's share.`,
      { inWindow: true, overlap: { from: overlapFrom, to: overlapTo, days: daysN }, daysInWindow: daysN },
    );
  }

  // The day sweep: exact integer shares over whole days. Deliberately a walk
  // over days rather than boundary arithmetic — the window is bounded at
  // 731 days, and a day-by-day sum has no off-by-one to hide.
  const days = dayList(overlapFrom, overlapTo);
  let shareDaysH = 0;
  let undeclaredDaysN = 0;
  let firstShareH = null;
  let lastShareH = null;
  let minShareH = null;
  let maxShareH = null;
  const segments = [];
  for (const day of days) {
    const share = shareOnDay(timeline, day);
    if (day === overlapFrom) firstShareH = share;
    lastShareH = share;
    if (share === null) {
      undeclaredDaysN += 1;
      continue;
    }
    shareDaysH += share;
    minShareH = minShareH === null ? share : Math.min(minShareH, share);
    maxShareH = maxShareH === null ? share : Math.max(maxShareH, share);
    const lastSeg = segments[segments.length - 1];
    if (lastSeg && lastSeg.shareH === share && nextDay(lastSeg.toDay) === day) {
      lastSeg.toDay = day;
      lastSeg.days += 1;
    } else {
      segments.push({ fromDay: day, toDay: day, days: 1, shareH: share });
    }
  }

  const retunesInWindowN = timeline.boundaries.filter((b) => b >= overlapFrom && b <= overlapTo).length;
  const overlap = { from: overlapFrom, to: overlapTo, days: daysN };
  const shared = {
    inWindow: true,
    overlap,
    daysInWindow: daysN,
    firstShareH,
    lastShareH,
    retunesInWindowN,
    undeclaredDaysN,
  };

  if (undeclaredDaysN > 0) {
    return settle(
      LINE_PERIOD_ALLOCATION_STATES.undeclared,
      `${undeclaredDaysN} of ${daysN} day(s) inside the period carry no declared share on this line. The row's total is refused rather than summed over the days that happen to carry a number — a partial sum would understate the charge and read as a whole.`,
      { ...shared, minShareH, maxShareH },
    );
  }

  const printed = segments.slice(0, LINE_PERIOD_ALLOCATION_LIMITS.segments);
  return settle(
    LINE_PERIOD_ALLOCATION_STATES.computed,
    retunesInWindowN
      ? `Time-weighted across ${retunesInWindowN} change(s) inside the period: ${shareDaysH} share-days over ${daysN} day(s), from ${firstShareH}% on the first day to ${lastShareH}% on the last.`
      : `One declared share stood for the whole overlap: ${shareDaysH} share-days over ${daysN} day(s) at ${firstShareH}%.`,
    {
      ...shared,
      shareDaysH,
      minShareH,
      maxShareH,
      segments: printed,
      segmentsOmittedN: Math.max(0, segments.length - printed.length),
      // The average is PRINTED AS ARITHMETIC. The rounded display sits beside
      // its numerator and denominator, never instead of them.
      averageArithmetic: `${shareDaysH} share-days ÷ ${daysN} day(s)`,
      averageShareDisplay: `${Math.floor((shareDaysH * 100) / daysN) / 100}%`,
    },
  );
}

/** The day key before `day`, or null when unreadable. */
function prevDay(day) {
  const t = startOfDay(day);
  if (!t) return null;
  return new Date(t.getTime() - 86400000).toISOString().slice(0, 10);
}

/**
 * The home line's own allocation row: COUNTED, never weighed. The home pointer
 * moves and its history is ADR-0149's dated ledger, read as-of by ADR-0155 —
 * weighting this row here would attribute a past period's home share to
 * whoever holds the pointer TODAY, which is exactly the misattribution the
 * as-of engine was built to stop. The reason is printed on the row.
 */
function homeAllocationRow(row, window, matrix) {
  const managerName = nameOf(matrix.nodes?.get?.(row.managerId)?.name, row.managerId);
  const fromISO = dayOf(row.fromISO);
  const toISO = dayOf(row.toISO);
  const overlapFrom = fromISO && fromISO > window.from ? fromISO : window.from;
  const overlapTo = toISO && toISO < window.to ? toISO : window.to;
  const inWindow = Boolean(fromISO) && window.valid && overlapFrom <= overlapTo;
  return {
    declarationId: row.id,
    personId: row.personId,
    kind: row.kind || 'functional',
    managerId: row.managerId,
    managerName,
    relationshipMerged: false,
    fromISO,
    toISO,
    inWindow,
    overlap: inWindow ? { from: overlapFrom, to: overlapTo, days: inclusiveDays(overlapFrom, overlapTo) } : null,
    shareDaysH: null,
    daysInWindow: 0,
    firstShareH: null,
    lastShareH: null,
    minShareH: null,
    maxShareH: null,
    retunesInWindowN: 0,
    undeclaredDaysN: 0,
    historyRetainedN: Array.isArray(row.history) ? row.history.length : 0,
    historyAtCap: false,
    historyUnsorted: false,
    sameDayRetunesN: 0,
    coverageFrom: null,
    segments: [],
    segmentsOmittedN: 0,
    averageArithmetic: null,
    averageShareDisplay: null,
    refusesTotal: false,
    state: LINE_PERIOD_ALLOCATION_STATES.homeScope,
    stateLabel: LINE_PERIOD_ALLOCATION_STATE_LABELS[LINE_PERIOD_ALLOCATION_STATES.homeScope],
    stateTone: LINE_PERIOD_ALLOCATION_STATE_TONES[LINE_PERIOD_ALLOCATION_STATES.homeScope],
    reason: 'The home line’s own allocation is counted but never weighed here: the home pointer moves, its history is ADR-0149’s dated ledger, and its as-of reading is ADR-0155’s. Weighting it against a past period would charge that period to whoever holds the pointer TODAY.',
    defect: null,
    defectDetail: null,
  };
}

/* ------------------------------------------------------------ person & seat */

function scopeFilter(state, matrix, now, settings) {
  const built = buildSeats(state, {
    now,
    settings,
    lineScope: matrixLineScopeFor(state, { now, settings }),
  });
  const seat = activeSeat(built);
  if (seat.fullAccess) return { seat, visible: () => true, scopeLabel: 'the whole workspace' };
  const inTree = (personId) => Boolean(seat.scope?.has?.(personId));
  const inLines = (personId) => Boolean(seat.lineScope?.has?.(personId));
  return {
    seat,
    visible: (personId) => personId === seat.id || inTree(personId) || inLines(personId),
    scopeLabel: `${seat.label || seat.id}’s span and its declared lines`,
  };
}

/**
 * All rows for one person, weighed against the window, plus the person's
 * totals, identities and verdict. The verdict precedence is the registry's
 * declared severity order — stated once, used everywhere.
 */
function personRows(matrix, personId, rowsForPerson, window) {
  const node = matrix.nodes?.get?.(personId);
  const home = (matrix.lines || []).find((l) => l.personId === personId && l.role === 'primary') || null;

  const rows = rowsForPerson.map((entry) => (entry.isHomeAllocation
    ? homeAllocationRow(entry.row, window, matrix)
    : weighLineRow(entry.row, window, {
      defect: entry.defect,
      relationshipMerged: entry.relationshipMerged,
      matrix,
    })));
  rows.sort((a, b) => {
    if (a.inWindow !== b.inWindow) return a.inWindow ? -1 : 1;
    return String(a.managerName).localeCompare(String(b.managerName)) || String(a.kind).localeCompare(String(b.kind));
  });

  const counts = {
    lines: rows.length,
    computed: 0, refusedHistoryGap: 0, refusedUndeclared: 0, refusedDefect: 0,
    outOfWindow: 0, homeRows: 0,
    retunedInWindow: 0,
  };
  for (const row of rows) {
    if (row.state === LINE_PERIOD_ALLOCATION_STATES.computed) counts.computed += 1;
    else if (row.state === LINE_PERIOD_ALLOCATION_STATES.historyGap) counts.refusedHistoryGap += 1;
    else if (row.state === LINE_PERIOD_ALLOCATION_STATES.undeclared) counts.refusedUndeclared += 1;
    else if (row.state === LINE_PERIOD_ALLOCATION_STATES.defect) counts.refusedDefect += 1;
    else if (row.state === LINE_PERIOD_ALLOCATION_STATES.outOfWindow) counts.outOfWindow += 1;
    else if (row.state === LINE_PERIOD_ALLOCATION_STATES.homeScope) counts.homeRows += 1;
    if (row.state === LINE_PERIOD_ALLOCATION_STATES.computed && row.retunesInWindowN > 0) counts.retunedInWindow += 1;
  }

  const refusedRows = rows.filter((r) => r.refusesTotal);
  const totalsRefused = refusedRows.length > 0;
  const shareDaysH = totalsRefused
    ? null
    : rows.reduce((acc, r) => acc + (r.shareDaysH || 0), 0);
  const shareRefusedReason = totalsRefused
    ? `${refusedRows.length} of this person's ${counts.lines} row(s) touching the period are refused (${refusedRows.map((r) => r.state).join(', ')}). A total over the rows that happen to carry a number would understate the period, so the total is refused rather than printed.`
    : null;

  // Over-commitment is a PER-DAY claim, and it is made only when every
  // in-window row was priced: a partial day sweep could hide an over day, so
  // the claim is refused rather than narrowed — fail-closed in the direction
  // that cannot flatter. The home line is out of scope, which makes this a
  // FLOOR on the day's charge, and the row says so.
  let overDaysN = 0;
  let worstDayShareH = null;
  const inWindowRows = rows.filter((r) => r.inWindow && r.state !== LINE_PERIOD_ALLOCATION_STATES.homeScope);
  const overCommitmentRefused = totalsRefused && inWindowRows.length > 0;
  if (!overCommitmentRefused && inWindowRows.length > 0 && window.valid) {
    const dayTotals = new Map();
    for (const row of inWindowRows) {
      if (row.state !== LINE_PERIOD_ALLOCATION_STATES.computed) continue;
      for (const seg of row.segments) {
        for (const day of dayList(seg.fromDay, seg.toDay)) {
          dayTotals.set(day, (dayTotals.get(day) || 0) + seg.shareH);
        }
      }
    }
    for (const total of dayTotals.values()) {
      worstDayShareH = worstDayShareH === null ? total : Math.max(worstDayShareH, total);
      if (total > LINE_PERIOD_ALLOCATION_FULL_H) overDaysN += 1;
    }
  }

  const totals = {
    shareDaysH,
    daysN: window.days,
    refused: totalsRefused,
    refuseReason: shareRefusedReason,
    averageArithmetic: totalsRefused || !window.valid ? null : `${shareDaysH} share-days ÷ ${window.days} period day(s)`,
    averageShareDisplay: totalsRefused || !window.valid ? null : `${Math.floor((shareDaysH * 100) / window.days) / 100}%`,
    overDaysN,
    worstDayShareH,
    overCommitmentRefused,
    overCommitmentRefusedReason: overCommitmentRefused
      ? 'The day-by-day over-commitment claim is refused: not every line touching the period could be priced, and a partial sweep could hide an over-committed day.'
      : null,
    // THE IDENTITY: the person total must be the sum of the printed rows.
    // Checked as integer equality and printed as a claim, never assumed.
    reconciles: totalsRefused || !window.valid
      ? null
      : rows.reduce((acc, r) => acc + (r.shareDaysH || 0), 0) === shareDaysH,
  };

  // PRECEDENCE BY DECLARED SEVERITY: the registry is the only place the ladder
  // is stated, so the panel, the brief and the CSV cannot disagree about a word.
  const candidates = new Set();
  if (totalsRefused) candidates.add('period-refused');
  else if (overDaysN > 0) candidates.add('over-committed');
  else if (counts.retunedInWindow > 0) candidates.add('retuned-in-period');
  else if (counts.computed > 0) candidates.add('steady');
  else candidates.add('outside-window');
  const worst = [...candidates]
    .map((key) => linePeriodAllocationVerdict(key))
    .filter(Boolean)
    .sort((a, b) => a.severity - b.severity)[0] || linePeriodAllocationVerdict('steady');

  return {
    personId,
    personName: nameOf(node?.name, personId),
    homeManagerId: home?.managerId || null,
    homeManagerName: home ? nameOf(matrix.nodes?.get?.(home.managerId)?.name, home.managerId) : null,
    rank: node?.rank ?? null,
    altitude: node?.altitude || null,
    lines: rows,
    counts,
    totals,
    verdict: worst.key,
    verdictLabel: worst.label,
    verdictTone: worst.tone,
    verdictOpen: worst.open,
    verdictReason: worst.detail,
  };
}

/* ------------------------------------------------------------------ report */

/**
 * The whole ledger for one named period, built under the acting seat: a scoped
 * seat sees the people it already reaches on the tree or a declared line, and
 * the rest are COUNTED as withheld — never silently dropped, never widened.
 *
 * `from`/`to` name the period. When they are absent the LAST COMPLETED
 * CALENDAR QUARTER is read and the report says so; when they are present but
 * unreadable or out of bounds the reading is REFUSED with the reason printed —
 * never clamped, never defaulted behind the reader's back.
 */
export function buildLinePeriodAllocation(state = {}, { from = null, to = null, now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const window = resolveAllocationWindow({ from, to, now: at, source: from || to ? 'query' : 'default' });
  const matrix = buildMatrix(state, { now: at, settings: cfg });
  const rawRows = Array.isArray(state.reportingLines) ? state.reportingLines : [];
  const { seat, visible, scopeLabel } = scopeFilter(state, matrix, at, cfg);

  const defectById = new Map();
  for (const d of matrix.defects || []) {
    if (d && d.lineId && !defectById.has(d.lineId)) defectById.set(d.lineId, d);
  }
  const wiredIds = new Set((matrix.lines || []).filter((l) => l.role !== 'primary').map((l) => l.declarationId || l.id));
  const inactiveIds = new Set((matrix.inactiveLines || []).map((l) => l.declarationId || l.id));

  // Classify every stored declaration row exactly the way the engine sees it:
  // a home-allocation row is the home line's own business (ADR-0149/0155), a
  // defect row is refused with the engine's reason, and an additional row is
  // weighed. An unwired row with NO defect is the second declared kind to the
  // same manager: the graph holds one edge for the relationship, but each
  // declaration charges its own share, so both rows are weighed and the merge
  // is printed.
  const byPerson = new Map();
  const engineRefusals = [];
  let withheldN = 0;
  for (const row of rawRows) {
    if (!row || !row.id) continue;
    const person = matrix.roster?.get?.(row.personId);
    if (!person) {
      const defect = defectById.get(row.id) || null;
      engineRefusals.push({
        lineId: row.id,
        personId: row.personId,
        kind: row.kind || 'undeclared',
        defect: defect?.defect || 'missing-person',
        detail: defect?.detail || 'The line names a person who is not on the active roster, so nothing can be attributed to a period for them.',
      });
      continue;
    }
    const homeManagerId = person.rawManagerId || LEADER_ID;
    const isHomeAllocation = row.managerId === homeManagerId;
    if (isHomeAllocation) {
      // The home line's own allocation is counted, never weighted — and only
      // for people already in this ledger's population (a person with at least
      // one ADDITIONAL declared row) who are visible to the acting seat. A
      // withheld person's home row stays withheld; a single-chain person's home
      // allocation is another module's business and is not printed here.
      if (!visible(row.personId)) continue;
      const hasAdditional = rawRows.some((r) => r && r.personId === row.personId
        && r.id !== row.id && r.managerId !== homeManagerId);
      if (!hasAdditional) continue;
      const list = byPerson.get(row.personId) || [];
      list.push({ row, defect: null, relationshipMerged: false, isHomeAllocation: true });
      byPerson.set(row.personId, list);
      continue;
    }
    const defect = defectById.get(row.id) || null;
    if (!visible(row.personId)) {
      if (!byPerson.has(`withheld:${row.personId}`)) {
        withheldN += 1;
        byPerson.set(`withheld:${row.personId}`, null);
      }
      continue;
    }
    const list = byPerson.get(row.personId) || [];
    const relationshipMerged = !defect && !wiredIds.has(row.id) && !inactiveIds.has(row.id);
    list.push({ row, defect, relationshipMerged, isHomeAllocation: false });
    byPerson.set(row.personId, list);
  }

  // A refused window weighs nothing: there are no days to walk, and inventing
  // a fallback window would answer a question nobody asked. The classification
  // above still ran, so the withheld and engine-refusal counts are printed —
  // they are facts about the roster, not about the period.
  const persons = [];
  if (window.valid) {
    for (const [personId, entries] of byPerson) {
      if (!entries || personId.startsWith('withheld:')) continue;
      persons.push(personRows(matrix, personId, entries, window));
    }
  }
  persons.sort((a, b) => {
    const sa = linePeriodAllocationVerdict(a.verdict)?.severity ?? 9;
    const sb = linePeriodAllocationVerdict(b.verdict)?.severity ?? 9;
    if (sa !== sb) return sa - sb;
    return String(a.personName).localeCompare(String(b.personName));
  });

  const stateCount = (key) => persons.reduce((acc, p) => acc + (p.counts[key] || 0), 0);
  const refusedPersons = persons.filter((p) => p.totals.refused);
  const windowRefused = !window.valid;
  const shareDaysRefused = windowRefused || refusedPersons.length > 0;
  const shareDaysRefusedReason = windowRefused
    ? window.refuseReason
    : refusedPersons.length
      ? `${refusedPersons.length} person(s) in scope could not be priced for the period — a refused line, an undeclared day or an unprovable history. A workspace total over the rest would understate the claim, so it is refused.`
      : null;
  const shareDaysH = shareDaysRefused
    ? null
    : persons.reduce((acc, p) => acc + (p.totals.shareDaysH || 0), 0);

  const board = {
    peopleN: persons.length,
    withheldN,
    engineRefusalsN: engineRefusals.length,
    linesN: stateCount('lines'),
    computedN: stateCount('computed'),
    refusedHistoryGapN: stateCount('refusedHistoryGap'),
    refusedUndeclaredN: stateCount('refusedUndeclared'),
    refusedDefectN: stateCount('refusedDefect'),
    outOfWindowN: stateCount('outOfWindow'),
    homeRowsN: stateCount('homeRows'),
    retunedInPeriodN: stateCount('retunedInWindow'),
    personsRefusedN: refusedPersons.length,
    personsOverCommittedN: persons.filter((p) => p.verdict === 'over-committed').length,
    overDaysN: persons.reduce((acc, p) => acc + (p.totals.overDaysN || 0), 0),
    worstDayShareH: persons.reduce((acc, p) => (p.totals.worstDayShareH === null ? acc : acc === null ? p.totals.worstDayShareH : Math.max(acc, p.totals.worstDayShareH)), null),
    daysN: window.days,
    shareDaysH,
    shareDaysRefused,
    shareDaysRefusedReason,
    averageArithmetic: shareDaysRefused ? null : `${shareDaysH} share-days ÷ ${window.days} period day(s) ÷ ${persons.length} person(s) in scope`,
    // TWO IDENTITIES, PRINTED AS CLAIMS, checked as integer equality: the
    // state counts must add to the printed row count, and the person totals
    // must add to the printed workspace total. "The figures add up" and "the
    // total is the sum of the rows printed" are stated separately, per the
    // Bulletproof Reliability Mandate.
    countsReconcile: ['computed', 'refusedHistoryGap', 'refusedUndeclared', 'refusedDefect', 'outOfWindow', 'homeRows']
      .reduce((acc, key) => acc + stateCount(key), 0) === stateCount('lines'),
    totalsReconcile: shareDaysRefused
      ? null
      : persons.every((p) => p.totals.reconciles === true)
        && persons.reduce((acc, p) => acc + (p.totals.shareDaysH || 0), 0) === shareDaysH,
  };

  return {
    engineVersion: LINE_PERIOD_ALLOCATION_ENGINE_VERSION,
    generatedOn: today,
    window,
    isMatrix: persons.length > 0 || withheldN > 0 || engineRefusals.length > 0,
    seat: { id: seat.id, label: seat.label || seat.id, rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) },
    scopeLabel,
    conventions: LINE_PERIOD_ALLOCATION_CONVENTIONS,
    method: LINE_PERIOD_ALLOCATION_METHOD,
    verdicts: LINE_PERIOD_ALLOCATION_VERDICTS,
    persons,
    engineRefusals: engineRefusals.slice(0, LINE_PERIOD_ALLOCATION_LIMITS.rows),
    engineRefusalsOmittedN: Math.max(0, engineRefusals.length - LINE_PERIOD_ALLOCATION_LIMITS.rows),
    board,
    queue: persons.filter((p) => p.verdictOpen).slice(0, LINE_PERIOD_ALLOCATION_LIMITS.rows),
    queueOmittedN: Math.max(0, persons.filter((p) => p.verdictOpen).length - LINE_PERIOD_ALLOCATION_LIMITS.rows),
    singleChainNote: persons.length
      ? null
      : 'No person in scope holds a second reporting line, so no period has a second share to weigh. A single-chain workspace gains no row, no figure and no refusal.',
  };
}

/* ---------------------------------------------------------------- the brief */

/** The identity-free brief. Counts only: no person, no manager, no declaration. */
export function linePeriodAllocationBriefText(report) {
  if (!report) return '';
  const b = report.board;
  const w = report.window;
  const lines = [];
  lines.push(`Matrix line period allocation — read from ${report.scopeLabel} on ${report.generatedOn} for the period ${w.from || '?'} to ${w.to || '?'}.`);
  if (!w.valid) {
    lines.push(`The period itself is refused: ${w.refuseReason}`);
    return lines.join(' ');
  }
  if (!report.isMatrix) {
    lines.push('No person in scope holds a second reporting line; there is no period share to weigh and nothing is projected onto an empty structure.');
    return lines.join(' ');
  }
  lines.push(`${b.peopleN} person(s) hold ${b.linesN} declared row(s) against a ${w.days}-day period: ${b.computedN} priced as time-weighted share-days, ${b.retunedInPeriodN} of them retuned inside the period, ${b.refusedHistoryGapN} refused because the retained history cannot prove the window, ${b.refusedUndeclaredN} refused because a day carries no declared share, ${b.refusedDefectN} refused because the engine refused the line, ${b.outOfWindowN} outside the period, and ${b.homeRowsN} home-line allocation(s) counted out of scope.`);
  if (b.shareDaysRefused) {
    lines.push(`The workspace share-day total is refused: ${b.shareDaysRefusedReason}`);
  } else {
    lines.push(`The period charged ${b.shareDaysH} share-days in total (${b.averageArithmetic}); the printed person totals sum to that figure: ${b.totalsReconcile ? 'verified' : 'NOT verified — treat every figure on this screen as unverified and report it'}.`);
  }
  if (b.personsOverCommittedN) {
    lines.push(`${b.personsOverCommittedN} person(s) were charged more than one whole person by their declared additional lines on at least one day — ${b.overDaysN} over-committed day(s) in total, the worst at ${b.worstDayShareH}% of a person. The home line is out of scope, so this is a floor.`);
  }
  if (b.withheldN) lines.push(`${b.withheldN} person(s) on a second line sit outside this seat and are counted, not shown.`);
  if (b.engineRefusalsN) lines.push(`${b.engineRefusalsN} row(s) name no roster person and are counted as engine refusals, never weighted.`);
  if (!b.countsReconcile) lines.push('The state counts do NOT add to the printed row count. Treat every figure on this screen as unverified and report it.');
  return lines.join(' ');
}

/* -------------------------------------------------------------------- CSV */

/**
 * CSV scope #119 — aggregate only. One summary row plus one row per declared
 * line kind. No person, no name, no manager id, no declaration id, no note
 * text. A refused share-day total is a BLANK cell with the reason in its own
 * column, never a zero. The period itself is printed in every row, because a
 * share-day figure without its window is a number nobody can interpret.
 */
export function linePeriodAllocationCsvRows(report) {
  if (!report) return [];
  const b = report.board;
  const w = report.window;
  const blank = (v) => (v === null || v === undefined ? '' : String(v));
  const baseCols = {
    period_from: blank(w.from),
    period_to: blank(w.to),
    period_days: blank(w.days),
    window_valid: w.valid ? 'true' : 'false',
    window_refused_reason: w.valid ? '' : String(w.refuseReason || ''),
  };
  const rows = [{
    row_kind: 'workspace',
    ...baseCols,
    line_kind: '',
    lines_n: blank(b.linesN),
    computed_n: blank(b.computedN),
    refused_history_gap_n: blank(b.refusedHistoryGapN),
    refused_undeclared_n: blank(b.refusedUndeclaredN),
    refused_defect_n: blank(b.refusedDefectN + b.engineRefusalsN),
    out_of_window_n: blank(b.outOfWindowN),
    home_rows_n: blank(b.homeRowsN),
    retuned_in_period_n: blank(b.retunedInPeriodN),
    share_days_h: blank(b.shareDaysH),
    persons_n: blank(b.peopleN),
    persons_refused_n: blank(b.personsRefusedN),
    persons_over_committed_n: blank(b.personsOverCommittedN),
    over_days_n: blank(b.overDaysN),
    withheld_n: blank(b.withheldN),
    share_days_refused: b.shareDaysRefused ? 'true' : 'false',
    share_days_refused_reason: b.shareDaysRefused ? String(b.shareDaysRefusedReason || '') : '',
    counts_reconcile: b.countsReconcile ? 'true' : 'false',
  }];
  if (!w.valid) return rows;

  const kinds = new Map();
  for (const person of report.persons) {
    for (const line of person.lines) {
      const key = line.kind || 'undeclared';
      if (!kinds.has(key)) {
        kinds.set(key, {
          kind: key, lines: 0, computed: 0, refusedHistoryGap: 0, refusedUndeclared: 0,
          refusedDefect: 0, outOfWindow: 0, homeRows: 0, retuned: 0, shareDaysH: 0, refused: false,
        });
      }
      const acc = kinds.get(key);
      acc.lines += 1;
      if (line.state === LINE_PERIOD_ALLOCATION_STATES.computed) { acc.computed += 1; acc.shareDaysH += line.shareDaysH || 0; }
      else if (line.state === LINE_PERIOD_ALLOCATION_STATES.historyGap) acc.refusedHistoryGap += 1;
      else if (line.state === LINE_PERIOD_ALLOCATION_STATES.undeclared) acc.refusedUndeclared += 1;
      else if (line.state === LINE_PERIOD_ALLOCATION_STATES.defect) acc.refusedDefect += 1;
      else if (line.state === LINE_PERIOD_ALLOCATION_STATES.outOfWindow) acc.outOfWindow += 1;
      else if (line.state === LINE_PERIOD_ALLOCATION_STATES.homeScope) acc.homeRows += 1;
      if (line.state === LINE_PERIOD_ALLOCATION_STATES.computed && line.retunesInWindowN > 0) acc.retuned += 1;
      if (line.refusesTotal) acc.refused = true;
    }
  }
  for (const acc of [...kinds.values()].sort((a, b2) => String(a.kind).localeCompare(String(b2.kind)))) {
    rows.push({
      row_kind: 'line-kind',
      ...baseCols,
      line_kind: acc.kind,
      lines_n: blank(acc.lines),
      computed_n: blank(acc.computed),
      refused_history_gap_n: blank(acc.refusedHistoryGap),
      refused_undeclared_n: blank(acc.refusedUndeclared),
      refused_defect_n: blank(acc.refusedDefect),
      out_of_window_n: blank(acc.outOfWindow),
      home_rows_n: blank(acc.homeRows),
      retuned_in_period_n: blank(acc.retuned),
      share_days_h: acc.refused ? '' : blank(acc.shareDaysH),
      persons_n: '',
      persons_refused_n: '',
      persons_over_committed_n: '',
      over_days_n: '',
      withheld_n: '',
      share_days_refused: acc.refused ? 'true' : 'false',
      share_days_refused_reason: acc.refused
        ? 'At least one row of this kind touching the period is refused, so the kind total is refused rather than printed over a part.'
        : '',
      counts_reconcile: '',
    });
  }
  return rows;
}
