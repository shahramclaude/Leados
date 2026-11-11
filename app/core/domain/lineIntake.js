/**
 * app/core/domain/lineIntake.js — the Matrix Line Intake Gate and Share-Day
 * WIP Ceiling reader (ADR-0171, Schema v136, `#/matrix?panel=intake`, CSV
 * scope #126).
 *
 * A pure read model over the declared reporting lines and the recorded intake
 * acts. It answers, for one period and every line in scope: what is this
 * line's declared share-day ceiling, how much have recorded intakes consumed,
 * how much headroom remains, and what is the gate verdict.
 *
 * The ceiling is the line's declared share-days for the period, swept day by
 * day from the declaration's own share timeline — the same `shareTimelineFor`
 * / `shareOnDay` the period-allocation ledger (ADR-0158) runs, so the two
 * instruments cannot disagree about what a line was charged. Where the
 * timeline cannot prove a day (a refused line, a history gap at the cap, or
 * days with no declared share), the ceiling is REFUSED, never projected from
 * today's share. Consumed is the sum of intakes recorded through the gate;
 * work taken on before the gate existed is not counted and not assumed zero —
 * the report prints that the ledger starts empty.
 *
 * No stored verdict: every figure is re-derived on read from the persisted
 * declarations and intake acts. A stored verdict here would be the drift the
 * Bulletproof Reliability Mandate forbids.
 */

import { buildMatrix } from './matrix.js';
import { shareTimelineFor, shareOnDay } from './linePeriodAllocation.js';
import {
  LINE_INTAKE_BOUNDS,
  LINE_INTAKE_CSV_COLUMNS,
  LINE_INTAKE_ENGINE_VERSION,
  LINE_INTAKE_VERDICT_KEYS,
  lineIntakeVerdict,
} from './lineIntakeRegistry.js';

/* ------------------------------------------------------------- day helpers */

function dayOf(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T00:00:00.000Z`).toISOString().slice(0, 10) === v ? v : null;
}

function addDays(day, n) {
  const t = new Date(`${day}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

function inclusiveDays(from, to) {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86400000) + 1;
}

function dayList(from, to) {
  const days = [];
  let cursor = from;
  let guard = 0;
  while (cursor && cursor <= to && guard <= LINE_INTAKE_BOUNDS.maxCeilingDays + 1) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return days;
}

/* ------------------------------------------------------------ the quarter */

/** The calendar quarter containing `dateStr`: its key and its day window. */
export function quarterWindow(dateStr) {
  const day = dayOf(dateStr);
  if (!day) return null;
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const q = Math.floor((month - 1) / 3); // 0-based
  const starts = ['01-01', '04-01', '07-01', '10-01'];
  const ends = ['03-31', '06-30', '09-30', '12-31'];
  return {
    periodKey: `${year}-Q${q + 1}`,
    from: `${year}-${starts[q]}`,
    to: `${year}-${ends[q]}`,
  };
}

/** The quarter window for a period key like `2026-Q4`, or null if unreadable. */
export function periodWindow(periodKey) {
  const m = /^(\d{4})-Q([1-4])$/.exec(typeof periodKey === 'string' ? periodKey.trim() : '');
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]) - 1;
  const starts = ['01-01', '04-01', '07-01', '10-01'];
  const ends = ['03-31', '06-30', '09-30', '12-31'];
  return { periodKey: `${year}-Q${q + 1}`, from: `${year}-${starts[q]}`, to: `${year}-${ends[q]}` };
}

/* ------------------------------------------------------- one line's ceiling */

/**
 * The declared share-day ceiling for one line and one period, in hundredths
 * of a person-day (the ledger's `shareDaysH` unit: shareH summed over days).
 *
 * Returns `{ state: 'computed', ceilingH, daysN, ... }` or a refusal
 * `{ state: 'ceiling-unprovable' | 'no-line', reason }`. Never a guessed
 * number: a ceiling that cannot be priced is refused with the reason printed.
 */
export function lineCeiling(state = {}, personId, managerId, periodKey, { now = new Date(), matrix = null } = {}) {
  const window = periodWindow(periodKey);
  if (!window) {
    return { state: 'ceiling-unprovable', reason: `The period "${periodKey}" is not a readable calendar quarter (YYYY-QN). A ceiling for an unreadable period is refused rather than guessed.` };
  }
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const graph = matrix || buildMatrix(state, { now: at, settings: state.settings || {} });

  const rawRows = Array.isArray(state.reportingLines) ? state.reportingLines : [];
  const rows = rawRows.filter((r) => r && r.personId === personId && r.managerId === managerId);
  if (!rows.length) {
    return { state: 'no-line', reason: `No declared line for this person and manager. The gate admits nothing against a line that was never declared.` };
  }

  // The row whose own window overlaps the period. At most one active line per
  // (person, manager) exists (the engine stores one edge per relationship);
  // if several historical rows overlap, the ceiling is ambiguous and refused.
  const overlapping = rows.filter((r) => {
    const from = dayOf(r.fromISO);
    const to = dayOf(r.toISO);
    if (!from) return false;
    const end = to || window.to;
    return from <= window.to && end >= window.from;
  });
  if (!overlapping.length) {
    return { state: 'no-line', reason: `The declared line for this person and manager does not overlap ${window.from} to ${window.to}. It is out of scope for this period — an absence of scope, not a zero ceiling.` };
  }
  if (overlapping.length > 1) {
    return { state: 'ceiling-unprovable', reason: `${overlapping.length} declared rows for this person and manager overlap the period. The gate will not pick one: the ambiguity is printed, not resolved.` };
  }
  const row = overlapping[0];

  // A row the matrix engine itself refused is never priced.
  const defect = (graph.defects || []).find((d) => d && d.lineId === row.id) || null;
  if (defect) {
    return { state: 'ceiling-unprovable', reason: `The matrix engine refused this line (${defect.defect}): ${defect.detail} A refused line has no ceiling.` };
  }

  const fromISO = dayOf(row.fromISO);
  const toISO = dayOf(row.toISO);
  const overlapFrom = fromISO && fromISO > window.from ? fromISO : window.from;
  const overlapTo = toISO && toISO < window.to ? toISO : window.to;
  if (!fromISO || overlapFrom > overlapTo) {
    return { state: 'no-line', reason: `The line does not overlap the period. It is out of scope — an absence of scope, not a zero ceiling.` };
  }
  const daysN = inclusiveDays(overlapFrom, overlapTo);
  if (daysN === null || daysN > LINE_INTAKE_BOUNDS.maxCeilingDays) {
    return { state: 'ceiling-unprovable', reason: `The overlap is ${daysN === null ? 'unreadable' : `${daysN} day(s)`}; the declared bound is ${LINE_INTAKE_BOUNDS.maxCeilingDays} days. The ceiling is refused rather than swept.` };
  }

  const timeline = shareTimelineFor(row);
  // Coverage, proved or refused — the same load-bearing refusal the ledger
  // runs. At the history cap, a period reaching behind the provable point
  // cannot be priced from today's share.
  if (timeline.atCap && timeline.coverageFrom && overlapFrom < timeline.coverageFrom) {
    return { state: 'ceiling-unprovable', reason: `The retained change history sits at its declared cap and can prove coverage only from ${timeline.coverageFrom} forward; this period reaches back to ${overlapFrom}. The ceiling is refused rather than projected backwards from today's share.` };
  }

  let ceilingH = 0;
  let undeclaredDaysN = 0;
  for (const day of dayList(overlapFrom, overlapTo)) {
    const share = shareOnDay(timeline, day);
    if (share === null) { undeclaredDaysN += 1; continue; }
    ceilingH += share;
  }
  if (undeclaredDaysN > 0) {
    return { state: 'ceiling-unprovable', reason: `${undeclaredDaysN} of ${daysN} day(s) inside the period carry no declared share on this line. The ceiling is refused rather than summed over the days that happen to carry a number — a partial sum would understate the budget and read as a whole.` };
  }

  return {
    state: 'computed',
    ceilingH,
    daysN,
    overlap: { from: overlapFrom, to: overlapTo },
    declarationId: row.id,
    kind: row.kind || 'undeclared',
    fromISO,
    toISO,
    historyAtCap: timeline.atCap,
    coverageFrom: timeline.coverageFrom,
  };
}

/* ------------------------------------------------------------ the reader */

/**
 * The gate report for one period: every in-scope line's ceiling, consumed,
 * headroom and verdict; every intake in the period; and the board counts.
 * Seat scoping is applied by the caller through `visiblePersonIds` when the
 * report is for a scoped seat; the operator view passes null (all visible).
 */
export function buildLineIntakeGate(state = {}, { periodKey = null, now = new Date(), settings = null, visiblePersonIds = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = at.toISOString().slice(0, 10);
  const window = periodKey ? periodWindow(periodKey) : quarterWindow(today);
  const cfg = settings || state.settings || {};
  const matrix = buildMatrix(state, { now: at, settings: cfg });

  const intakes = (Array.isArray(state.lineIntakes) ? state.lineIntakes : [])
    .filter((r) => r && r.periodKey === (window ? window.periodKey : null));
  const liveIntakes = intakes.filter((r) => r.status !== 're-routed');

  // Every declared line in scope for the period: one row per (person, manager)
  // pair that has a declaration row overlapping the window.
  const rawRows = Array.isArray(state.reportingLines) ? state.reportingLines : [];
  const pairs = new Map();
  for (const row of rawRows) {
    if (!row || !row.personId || !row.managerId) continue;
    if (visiblePersonIds && !visiblePersonIds.has(row.personId)) continue;
    const key = `${row.personId}::${row.managerId}`;
    if (!pairs.has(key)) pairs.set(key, { personId: row.personId, managerId: row.managerId });
  }

  const lines = [];
  for (const { personId, managerId } of pairs.values()) {
    const person = matrix.roster?.get?.(personId);
    const personName = person?.name || personId;
    const managerName = matrix.nodes?.get?.(managerId)?.name || managerId;
    const ceiling = window
      ? lineCeiling(state, personId, managerId, window.periodKey, { now: at, matrix })
      : { state: 'ceiling-unprovable', reason: 'The period is unreadable, so no ceiling can be priced.' };
    const lineIntakes = liveIntakes.filter((r) => r.personId === personId && r.managerId === managerId);
    const consumedH = lineIntakes.reduce((acc, r) => acc + (Number.isInteger(r.shareDaysH) ? r.shareDaysH : 0), 0);
    const ceilingH = ceiling.state === 'computed' ? ceiling.ceilingH : null;
    const headroomH = ceilingH === null ? null : ceilingH - consumedH;
    let verdict;
    if (ceiling.state !== 'computed') verdict = 'ceiling-unprovable';
    else if (consumedH > ceilingH) verdict = 'over-share';
    else if (consumedH === ceilingH) verdict = 'exhausted';
    else verdict = 'within-ceiling';
    lines.push({
      personId,
      personName,
      managerId,
      managerName,
      kind: ceiling.kind || null,
      ceiling,
      ceilingH,
      consumedH,
      headroomH,
      verdict,
      verdictLabel: lineIntakeVerdict(verdict)?.label || verdict,
      intakesN: lineIntakes.length,
      intakes: lineIntakes.map((r) => ({
        id: r.id,
        title: r.title,
        date: r.date,
        shareDaysH: r.shareDaysH,
        status: r.status,
        overrideReason: r.overrideReason || '',
      })),
    });
  }
  lines.sort((a, b) => {
    const ra = lineIntakeVerdict(a.verdict)?.rank ?? 9;
    const rb = lineIntakeVerdict(b.verdict)?.rank ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.personName).localeCompare(String(b.personName));
  });

  const countVerdict = (v) => lines.filter((l) => l.verdict === v).length;
  const board = {
    periodKey: window ? window.periodKey : null,
    periodFrom: window ? window.from : null,
    periodTo: window ? window.to : null,
    linesN: lines.length,
    intakesN: liveIntakes.length,
    recordedN: liveIntakes.filter((r) => r.status === 'recorded').length,
    overShareN: liveIntakes.filter((r) => r.status === 'over-share').length,
    reRoutedN: intakes.filter((r) => r.status === 're-routed').length,
    withinCeilingN: countVerdict('within-ceiling'),
    exhaustedN: countVerdict('exhausted'),
    overShareLinesN: countVerdict('over-share'),
    ceilingUnprovableN: countVerdict('ceiling-unprovable'),
    ceilingH: lines.reduce((acc, l) => acc + (l.ceilingH || 0), 0),
    consumedH: lines.reduce((acc, l) => acc + (l.consumedH || 0), 0),
    figuresComplete: lines.every((l) => l.ceilingH !== null),
    countsReconcile: false,
  };
  // The reconciliation identity: every live intake lands on exactly one line
  // row, and the board's consumed total is the sum of the rows' consumed.
  const rowConsumed = lines.reduce((acc, l) => acc + l.consumedH, 0);
  const rowIntakes = lines.reduce((acc, l) => acc + l.intakesN, 0);
  board.countsReconcile = rowConsumed === board.consumedH && rowIntakes === board.intakesN;

  return {
    engine: LINE_INTAKE_ENGINE_VERSION,
    today,
    window,
    lines,
    intakes: liveIntakes.map((r) => ({
      id: r.id,
      personId: r.personId,
      managerId: r.managerId,
      title: r.title,
      date: r.date,
      shareDaysH: r.shareDaysH,
      status: r.status,
      overrideReason: r.overrideReason || '',
    })),
    board,
    verdictKeys: LINE_INTAKE_VERDICT_KEYS,
  };
}

/* --------------------------------------------------------------- the brief */

/** One identity-free brief line per verdict, for the board pack. */
export function lineIntakeBriefText(report) {
  const b = report?.board;
  if (!b) return 'The intake gate could not be read.';
  const parts = [
    `Intake gate for ${b.periodKey || 'an unreadable period'}: ${b.linesN} line(s) in scope, ${b.intakesN} live intake(s) (${b.recordedN} recorded, ${b.overShareN} over share, ${b.reRoutedN} re-routed).`,
    `${b.withinCeilingN} within ceiling, ${b.exhaustedN} exhausted, ${b.overShareLinesN} over share, ${b.ceilingUnprovableN} with an unprovable ceiling.`,
    b.figuresComplete ? 'Every ceiling was priced.' : 'Not every ceiling was priced; the unprovable lines are printed with their reasons.',
    b.countsReconcile ? 'The counts reconcile.' : 'The counts do NOT reconcile; the discrepancy is printed, not smoothed.',
  ];
  return parts.join(' ');
}

/* ---------------------------------------------------------------- the CSV */

/**
 * Aggregate-only export rows: one workspace row plus one row per verdict.
 * No person, no name, no intake title, no date, no free text. A refused
 * figure is BLANK with its flag set, never a zero.
 */
export function lineIntakeCsvRows(report) {
  const b = report?.board;
  const base = Object.fromEntries(LINE_INTAKE_CSV_COLUMNS.map((k) => [k, '']));
  if (!b) {
    return [{ ...base, scope: 'workspace', figures_complete: 'false', counts_reconcile: 'false', refusal_reason: 'The intake gate could not be read.' }];
  }
  const workspace = {
    ...base,
    scope: 'workspace',
    period_key: b.periodKey || '',
    period_from: b.periodFrom || '',
    period_to: b.periodTo || '',
    lines_n: String(b.linesN),
    intakes_n: String(b.intakesN),
    recorded_n: String(b.recordedN),
    over_share_n: String(b.overShareN),
    re_routed_n: String(b.reRoutedN),
    within_ceiling_n: String(b.withinCeilingN),
    exhausted_n: String(b.exhaustedN),
    over_share_lines_n: String(b.overShareLinesN),
    ceiling_unprovable_n: String(b.ceilingUnprovableN),
    ceiling_h: b.figuresComplete ? String(b.ceilingH) : '',
    consumed_h: String(b.consumedH),
    headroom_h: b.figuresComplete ? String(b.ceilingH - b.consumedH) : '',
    figures_complete: b.figuresComplete ? 'true' : 'false',
    counts_reconcile: b.countsReconcile ? 'true' : 'false',
    refusal_reason: b.figuresComplete ? '' : 'At least one line ceiling could not be priced; the workspace ceiling and headroom are withheld rather than summed over the priced lines.',
  };
  const verdictRows = LINE_INTAKE_VERDICT_KEYS.map((verdict) => {
    const n = verdict === 'within-ceiling' ? b.withinCeilingN
      : verdict === 'exhausted' ? b.exhaustedN
        : verdict === 'over-share' ? b.overShareLinesN
          : b.ceilingUnprovableN;
    return {
      ...base,
      scope: `verdict:${verdict}`,
      period_key: b.periodKey || '',
      lines_n: String(n),
      figures_complete: 'true',
      counts_reconcile: 'true',
    };
  });
  return [workspace, ...verdictRows];
}
