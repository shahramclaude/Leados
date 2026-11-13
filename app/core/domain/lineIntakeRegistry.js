/**
 * app/core/domain/lineIntakeRegistry.js — the closed vocabulary of the Matrix
 * Line Intake Gate and Share-Day WIP Ceiling (ADR-0171, Schema v136,
 * `#/matrix?panel=intake`, CSV scope #126).
 *
 * The accountability ledger (ADR-0140) can SEE a line charged past its share;
 * nothing acted when the work was taken on. This register is the control at
 * the point of admission: a dated intake act names the line funding the work
 * and the share-days it consumes, and the gate refuses an intake that would
 * breach that line's declared share-day ceiling for the running period unless
 * a human decides otherwise (accept the over-share, re-route to another line,
 * or retune the declaration through the existing spine).
 *
 * Everything the reader, the actions, the panel, the brief and the export may
 * say is declared here once. A status, a verdict, a refusal or a convention
 * that is not in this file cannot be printed, so the screen and the export
 * cannot disagree about a word.
 *
 * Pure data: no DOM, no storage, no clock.
 */

export const LINE_INTAKE_ENGINE_VERSION = 'line-intake-2026.11-v1';

/** The spine events the intake acts emit. */
export const LINE_INTAKE_RECORDED_EVENT = 'line.intake.recorded';
export const LINE_INTAKE_REROUTED_EVENT = 'line.intake.rerouted';

/**
 * The intake statuses. Closed.
 *
 *   recorded   — admitted within the line's ceiling.
 *   over-share — admitted past the ceiling by an explicit human override with
 *                a printed reason. The over-share is a fact, not a pass.
 *   re-routed  — voided because the work was re-routed to another line. The
 *                row stays (append-only) and names the intake it became.
 */
export const LINE_INTAKE_STATUSES = Object.freeze([
  Object.freeze({
    key: 'recorded',
    label: 'Recorded within ceiling',
    detail: 'Admitted by the gate: the running total for this line and period, plus this intake, stayed inside the declared share-day ceiling.',
  }),
  Object.freeze({
    key: 'over-share',
    label: 'Recorded over share (human override)',
    detail: 'Admitted past the ceiling by an explicit human decision with a printed reason. The breach is recorded, never hidden: the line is over its declared share-days and the roll-up says so.',
  }),
  Object.freeze({
    key: 're-routed',
    label: 'Re-routed to another line',
    detail: 'Voided: the work was re-routed to a different line, which carries its own intake. This row stays so the funding history is not rewritten.',
  }),
]);

export const LINE_INTAKE_STATUS_KEYS = Object.freeze(LINE_INTAKE_STATUSES.map((s) => s.key));

export function lineIntakeStatus(key) {
  return LINE_INTAKE_STATUSES.find((s) => s.key === key) || null;
}

/**
 * The gate verdicts, one per line and period. Closed, with declared precedence:
 * a ceiling that cannot be priced outranks every other reading, because a gate
 * that cannot see its own ceiling cannot admit anything.
 */
export const LINE_INTAKE_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'ceiling-unprovable',
    label: 'Ceiling cannot be priced',
    tone: 'bad',
    rank: 0,
    detail: 'The declared share-days for this line and period cannot be proved from the retained record (a refused line, a history gap, or days with no declared share). The gate admits nothing against an unprovable ceiling.',
  }),
  Object.freeze({
    key: 'over-share',
    label: 'Over the ceiling',
    tone: 'bad',
    rank: 1,
    detail: 'Recorded intakes already exceed the declared share-day ceiling, by human override. The line is over-committed on the record.',
  }),
  Object.freeze({
    key: 'exhausted',
    label: 'Ceiling exhausted',
    tone: 'warn',
    rank: 2,
    detail: 'Recorded intakes exactly consume the declared share-day ceiling. The next intake will be refused unless a human decides otherwise.',
  }),
  Object.freeze({
    key: 'within-ceiling',
    label: 'Within the ceiling',
    tone: 'ok',
    rank: 3,
    detail: 'Headroom remains: recorded intakes plus the next intake can still be admitted inside the declared share-day ceiling.',
  }),
]);

export const LINE_INTAKE_VERDICT_KEYS = Object.freeze(LINE_INTAKE_VERDICTS.map((v) => v.key));

export function lineIntakeVerdict(key) {
  return LINE_INTAKE_VERDICTS.find((v) => v.key === key) || null;
}

/**
 * The write-time refusal reasons. Closed: the gate refuses with one of these
 * and a printed reason, never with a silent no-op.
 */
export const LINE_INTAKE_REFUSALS = Object.freeze([
  Object.freeze({
    key: 'no-such-person',
    label: 'The person is not on the active roster',
  }),
  Object.freeze({
    key: 'no-such-line',
    label: 'No declared line for that person and manager',
  }),
  Object.freeze({
    key: 'line-not-active',
    label: 'The line is not in force on the intake date',
  }),
  Object.freeze({
    key: 'ceiling-unprovable',
    label: 'The ceiling cannot be priced',
  }),
  Object.freeze({
    key: 'ceiling-exhausted',
    label: 'The intake would breach the ceiling',
  }),
  Object.freeze({
    key: 'bad-share-days',
    label: 'The share-days are not a positive number',
  }),
  Object.freeze({
    key: 'bad-title',
    label: 'The work is not named',
  }),
  Object.freeze({
    key: 'bad-date',
    label: 'The intake date is not a real calendar day',
  }),
  Object.freeze({
    key: 'bad-override',
    label: 'An over-share override needs a reason',
  }),
  Object.freeze({
    key: 'no-such-intake',
    label: 'No such intake to re-route',
  }),
  Object.freeze({
    key: 'intake-not-routable',
    label: 'Only a live intake can be re-routed',
  }),
]);

export const LINE_INTAKE_REFUSAL_KEYS = Object.freeze(LINE_INTAKE_REFUSALS.map((r) => r.key));

/** Declared bounds. Outside them the gate refuses rather than clamps. */
export const LINE_INTAKE_BOUNDS = Object.freeze({
  /** One intake may not consume more than a full person-year of share-days. */
  maxShareDaysPerIntake: 365,
  /** A line and period may not carry more recorded intakes than this. */
  maxIntakesPerLinePeriod: 500,
  titleChars: 200,
  reasonChars: 500,
  /** The day sweep for one ceiling is bounded; a wider period is refused. */
  maxCeilingDays: 731,
});

/** Retention caps, applied by the normalizer (oldest dropped, never repaired). */
export const LINE_INTAKE_LIMITS = Object.freeze({
  intakes: 5000,
});

/**
 * The printed conventions. These are declarations, not derivations: the gate
 * does not pretend a convention is a measurement.
 */
export const LINE_INTAKE_CONVENTIONS = Object.freeze([
  Object.freeze({
    key: 'period-is-the-intake-quarter',
    label: 'The period is the calendar quarter of the intake date',
    detail: 'An intake dated 2026-11-11 belongs to 2026-Q4 (2026-10-01 to 2026-12-31). The ceiling is that quarter\u2019s declared share-days for the line. A backdated intake is gated against its own quarter, not today\u2019s.',
  }),
  Object.freeze({
    key: 'ceiling-is-declared-share-days',
    label: 'The ceiling is the line\u2019s declared share-days for the period',
    detail: 'Time-weighted from the declaration\u2019s own share timeline (the same sweep the period-allocation ledger runs), never from today\u2019s share projected backwards. Where the timeline cannot prove a day, the ceiling is refused.',
  }),
  Object.freeze({
    key: 'consumed-is-recorded-intakes',
    label: 'Consumed means recorded intakes, and only those',
    detail: 'The gate counts intakes recorded through it. Work taken on before the gate existed is not counted and is not assumed to be zero: the panel prints that the ledger starts empty, so a line with heavy pre-gate work reads as having headroom it may not have. The allocation-to-output reconciliation (blocked on work-record line attribution) is the instrument that would close this.',
  }),
  Object.freeze({
    key: 'estimate-is-declared',
    label: 'An intake\u2019s share-days are a declared estimate',
    detail: 'The person recording the intake states how many person-days the work will consume. The gate controls admission against declared estimates; it does not verify them. A gamed estimate is visible on the record, which is the point.',
  }),
  Object.freeze({
    key: 'day-of-retune-closing-share',
    label: 'The day of a retune is read at its closing share',
    detail: 'The declared convention of the share timeline: on the day a share changes, the day is charged at the share in force at the close of that day. Printed wherever it applies.',
  }),
]);

/** The named frameworks the gate applies. Printed, not paraphrased. */
export const LINE_INTAKE_FRAMEWORKS = Object.freeze([
  Object.freeze({
    key: 'kanban-wip',
    label: 'Kanban work-in-progress limits',
    detail: 'A limit at the point of admission, not a report after the quarter. Work is refused entry when the line\u2019s budget is spent, so over-commitment is prevented rather than measured.',
  }),
  Object.freeze({
    key: 'little',
    label: 'Little\u2019s Law (Throughput \u00d7 Cycle Time)',
    detail: 'The queueing identity the capacity model already uses: a line\u2019s share-days are its throughput budget, and admitting work past the budget lengthens every cycle time on the line.',
  }),
  Object.freeze({
    key: 'goldratt',
    label: 'Goldratt\u2019s constraint logic',
    detail: 'The line\u2019s declared share is the constraint. Work that would breach it is not absorbed silently; it needs a human decision (accept, re-route, retune) recorded on the same spine.',
  }),
]);

/** The export columns, in order. Aggregate-only: no identity, no free text. */
export const LINE_INTAKE_CSV_COLUMNS = Object.freeze([
  'scope',
  'period_key',
  'period_from',
  'period_to',
  'lines_n',
  'intakes_n',
  'transfer_reservations_n',
  'recorded_n',
  'over_share_n',
  're_routed_n',
  'within_ceiling_n',
  'exhausted_n',
  'over_share_lines_n',
  'ceiling_unprovable_n',
  'ceiling_h',
  'intake_h',
  'transfer_reservation_h',
  'consumed_h',
  'headroom_h',
  'figures_complete',
  'counts_reconcile',
  'refusal_reason',
]);

/** Fail-closed normalizer for the intake collection. Malformed rows are dropped. */
export function normalizeLineIntakes(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    && new Date(`${v}T00:00:00.000Z`).toISOString().slice(0, 10) === v;
  for (const row of arr) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const id = typeof row.id === 'string' ? row.id.trim().slice(0, 80) : '';
    if (!id || seen.has(id)) continue;
    const personId = typeof row.personId === 'string' ? row.personId.trim().slice(0, 80) : '';
    const managerId = typeof row.managerId === 'string' ? row.managerId.trim().slice(0, 80) : '';
    const periodKey = typeof row.periodKey === 'string' ? row.periodKey.trim().slice(0, 16) : '';
    const shareDaysH = Number.isInteger(row.shareDaysH) ? row.shareDaysH : null;
    const title = typeof row.title === 'string' ? row.title.trim().slice(0, LINE_INTAKE_BOUNDS.titleChars) : '';
    const date = isDay(row.date) ? String(row.date).slice(0, 10) : null;
    const status = LINE_INTAKE_STATUS_KEYS.includes(row.status) ? row.status : null;
    if (!personId || !managerId || !periodKey || shareDaysH === null || shareDaysH <= 0 || !title || !date || !status) continue;
    seen.add(id);
    out.push({
      id,
      personId,
      managerId,
      periodKey,
      shareDaysH,
      title,
      date,
      status,
      overrideReason: typeof row.overrideReason === 'string' ? row.overrideReason.trim().slice(0, LINE_INTAKE_BOUNDS.reasonChars) : '',
      reroutedFrom: typeof row.reroutedFrom === 'string' ? row.reroutedFrom.trim().slice(0, 80) : null,
      reroutedTo: typeof row.reroutedTo === 'string' ? row.reroutedTo.trim().slice(0, 80) : null,
      recordedAt: typeof row.recordedAt === 'string' ? row.recordedAt.slice(0, 40) : null,
      recordedBySeatId: typeof row.recordedBySeatId === 'string' ? row.recordedBySeatId.trim().slice(0, 80) : null,
    });
  }
  return out.slice(-LINE_INTAKE_LIMITS.intakes);
}
