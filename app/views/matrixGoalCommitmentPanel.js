/**
 * app/views/matrixGoalCommitmentPanel.js — `#/matrix?panel=commitments`, the
 * Cross-Line Goal Commitment Conflict register (Galbraith 1973; Cyert & March
 * 1963; March & Simon 1958; Kaplan & Norton 1996; Drucker 1954; Senge 1990)
 * (ADR-0193 + ADR-0195, Schema v155, CSV scope #145, `RULE-GCC-01`).
 *
 * One reader (`buildGoalCommitments`) is behind the board, every person row, the
 * roll-ups, the brief and the CSV. Nothing is recomputed here, so what the
 * screen prints is what the reader computed. A withheld figure prints a dash and
 * its reason, never a zero.
 *
 * THE TWO CLAIMS THIS SCREEN KEEPS APART, because collapsing them is the failure
 * the register exists to prevent:
 *   1. a COLLISION between two lines' promises — a relation, printed per pair
 *      with its exact overlapping days;
 *   2. a WEEK that is fuller than one person — a stock, printed per person at
 *      its exact peak day against an exact integer basis.
 * A same-direction target-magnitude divergence is another explicit collision:
 * it compares only two declared values in the same declared unit and never
 * invents a conversion or calls an omitted magnitude agreement.
 * A pair table that carried a capacity verdict would name a culprit the
 * arithmetic does not support, so neither is printed inside the other.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { shareHToDisplay } from '../core/domain/matrixSchema.js';
import { buildGoalCommitments, goalCommitmentBriefText } from '../core/domain/goalCommitment.js';
import {
  GOAL_COMMITMENT_ADR,
  GOAL_COMMITMENT_BOUNDS,
  GOAL_COMMITMENT_CSV_COLUMNS,
  GOAL_COMMITMENT_CSV_SCOPE,
  GOAL_COMMITMENT_DIRECTION_KEYS,
  GOAL_COMMITMENT_DIRECTIONS,
  GOAL_COMMITMENT_ENGINE_VERSION,
  GOAL_COMMITMENT_LIMITS,
  GOAL_COMMITMENT_NO_LINE,
  GOAL_COMMITMENT_RULE_ID,
  GOAL_COMMITMENT_SETTING_KEYS,
  GOAL_COMMITMENT_SETTING_LABELS,
} from '../core/domain/goalCommitmentRegistry.js';

const DIAGRAM_URL = './app/assets/goal-commitment-conflict.jpg';

const PANELS = Object.freeze([
  Object.freeze({ key: 'board', label: 'Board' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);

const dash = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const num = (value) => (Number.isFinite(Number(value)) ? String(Number(value)) : '—');
const claim = (value) => (value ? 'yes' : 'NO');
const share = (hundredths) => (Number.isInteger(hundredths) ? shareHToDisplay(hundredths) : '—');
const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((row) => row.key === key) ? key : 'board';
};

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The goal-commitment action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function submit(ctx, form, result, message) {
  if (!result?.ok) {
    if (result?.field && form?.field?.(result.field)) form.setErrors({ [result.field]: result.error });
    toast(result?.error || 'The goal-commitment action was refused.', 'bad');
    return;
  }
  notify(result, message);
  closeAllModals();
  refresh(ctx);
}

/* ----------------------------------------------------------------- dialogs */

/**
 * The declaration form. Effort is REQUIRED and in the same integer hundredths of
 * one person a declared line share uses; the measure is optional but never half
 * declared. A target magnitude is optional too, but it is exact value + unit or
 * neither; the form says plainly that nothing is read off the goal's text.
 */
function commitmentFields(candidate, lineOptions, previous = null) {
  return [
    { type: 'static', label: 'The goal', value: h('div', null, h('strong', null, candidate.goalTitle), h('p', { class: 'muted small' }, `Owned by ${candidate.ownerName}${candidate.goalDueDate ? ` · due ${candidate.goalDueDate}` : ' · no due date on the record'}${candidate.goalCreatedOn ? ` · created ${candidate.goalCreatedOn}` : ''}`)) },
    {
      name: 'lineKey',
      label: 'Which reporting line owes this goal?',
      type: 'select',
      value: previous?.lineKey || lineOptions[0]?.value || '',
      options: lineOptions,
      help: 'A line, or explicitly “no reporting line”. It is never guessed from the home line — an undeclared goal prints as unattributed instead.',
    },
    { name: 'windowFrom', label: 'First day of the window (inclusive)', type: 'date', value: previous?.windowFrom || '', required: true, help: `It cannot start before the goal was created${candidate.goalCreatedOn ? ` (${candidate.goalCreatedOn})` : ''}.` },
    { name: 'windowTo', label: 'Last day of the window (inclusive)', type: 'date', value: previous?.windowTo || candidate.goalDueDate || '', required: true, help: `At most ${GOAL_COMMITMENT_LIMITS.windowMaxDays} days. Running past the goal’s own due date is printed as a contradiction, not refused — a stale due date is usually the thing that is wrong.` },
    {
      name: 'effortShareH',
      label: 'What does it consume, in hundredths of one person?',
      type: 'number',
      min: 0,
      max: 100,
      step: 1,
      value: previous?.effortShareH ?? '',
      required: true,
      help: '100 = the whole person, 40 = 0.40 of them, in the same unit a declared line share uses. Required: a commitment that does not say what it draws cannot be added to any other, and the register will not print a capacity figure it cannot support.',
    },
    { type: 'divider', label: 'The measure it moves — optional, and never inferred' },
    { name: 'measureKey', label: 'Measure key (optional)', type: 'text', value: previous?.measureKey || '', placeholder: 'cycle time', help: `A short identifier of ${GOAL_COMMITMENT_LIMITS.measureKeyMin}–${GOAL_COMMITMENT_LIMITS.measureKeyMax} characters. Two lines naming the SAME key in different directions is a target conflict. Nothing is read out of the goal’s title, description or key results.` },
    {
      name: 'direction',
      label: 'Direction (required if a measure is named)',
      type: 'select',
      value: previous?.direction || '',
      options: [{ value: '', label: '— no measure declared —' }, ...GOAL_COMMITMENT_DIRECTIONS.map((row) => ({ value: row.key, label: row.label }))],
      help: '“Hold steady” is opposed to either of the other two: one line holding a measure still while another pushes it is a contradiction, not a difference of degree.',
    },
    { type: 'divider', label: 'Target magnitude — optional, declared exactly or not at all' },
    { name: 'targetValue', label: 'Target value (optional)', type: 'text', value: previous?.targetValue || '', placeholder: '25', help: `If declared, it must be an exact non-negative decimal with no exponent, sign, whitespace or rounding (at most ${GOAL_COMMITMENT_LIMITS.targetValueIntegerDigits} digits before and ${GOAL_COMMITMENT_LIMITS.targetValueFractionDigits} after the decimal). It is never inferred from the goal.` },
    { name: 'targetUnit', label: 'Target unit (required with a target value)', type: 'text', value: previous?.targetUnit || '', placeholder: 'percent', help: `Declare both value and unit or neither. The unit is a ${GOAL_COMMITMENT_LIMITS.targetUnitMin}–${GOAL_COMMITMENT_LIMITS.targetUnitMax}-character key; the register never converts units or assumes they match.` },
    { name: 'note', label: 'Note (optional)', type: 'textarea', rows: 2, value: previous?.note || '', help: `At most ${GOAL_COMMITMENT_LIMITS.noteMax} characters. Printed on the commitment row; never exported.` },
  ];
}

function declareDialogFor(ctx, candidate) {
  const lines = ctx.api.matrixGoalCommitmentCandidates?.();
  const fresh = lines?.ok ? (lines.candidates.find((row) => row.goalId === candidate.goalId) || candidate) : candidate;
  const lineOptions = [
    ...fresh.lines
      .filter((line) => line.canDeclare && !line.occupiedBy)
      .map((line) => ({
        value: line.lineKey,
        label: `${line.role === 'primary' ? 'Home' : line.kind} line — held by ${line.managerName}${Number.isInteger(line.shareH) ? `, declared share ${share(line.shareH)}` : ', no declared share'}`,
      })),
    ...(fresh.noLineAllowed && !fresh.noLineOccupiedBy
      ? [{ value: GOAL_COMMITMENT_NO_LINE, label: 'Owed under no reporting line (only the person who owns the goal, or the operator view, may say this)' }]
      : []),
  ];
  if (!lineOptions.length) {
    toast('Every line you could declare under already holds a live commitment on that goal. Re-baseline one instead.', 'bad');
    return;
  }
  const form = buildForm(commitmentFields(fresh, lineOptions));
  openModal({
    title: 'Declare what a line promises of one person',
    description: `${fresh.ownerName} holds ${fresh.lines.length} active reporting line(s). This is a first-person act: only the holder of a line can declare what it promises.`,
    size: 'lg',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'goal-commitment-declare',
        onClick: () => {
          const values = form.getValues();
          submit(ctx, form, ctx.api.matrixGoalCommitmentDeclare({
            goalId: fresh.goalId,
            lineKey: values.lineKey,
            windowFrom: values.windowFrom,
            windowTo: values.windowTo,
            effortShareH: values.effortShareH === '' ? null : Number(values.effortShareH),
            measureKey: values.measureKey || null,
            direction: values.direction || null,
            targetValue: values.targetValue || null,
            targetUnit: values.targetUnit || null,
            note: values.note || '',
          }), 'Commitment declared. Every comparison re-derived from the record.');
        },
      }, 'Declare commitment'),
    ],
  });
}

function declareDialog(ctx) {
  const result = ctx.api.matrixGoalCommitmentCandidates();
  if (!result?.ok) { toast(result?.error || 'No candidate could be read.', 'bad'); return; }
  if (!result.candidates.length) {
    toast('No live goal you may declare for is on the record. A commitment needs a live goal with an owner on the active roster, and a line you hold over them.', 'bad');
    return;
  }
  const form = buildForm([
    {
      name: 'goalId',
      label: 'Which goal is being committed?',
      type: 'select',
      value: result.candidates[0].goalId,
      options: result.candidates.map((candidate) => ({
        value: candidate.goalId,
        label: `${candidate.goalTitle} — ${candidate.ownerName}${candidate.multiLine ? `, ${candidate.lines.length} lines` : ', one line'}${candidate.goalDueDate ? `, due ${candidate.goalDueDate}` : ''}`,
      })),
      help: 'Only live goals with an owner on the active roster are listed.',
    },
  ]);
  openModal({
    title: 'Declare a cross-line goal commitment',
    description: 'A commitment says what ONE reporting line’s goal consumes of one shared person: the window, the effort, and optionally the measure it moves.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'goal-commitment-pick',
        onClick: () => {
          const chosen = result.candidates.find((candidate) => candidate.goalId === form.getValues().goalId);
          closeAllModals();
          if (chosen) declareDialogFor(ctx, chosen);
        },
      }, 'Declare it'),
    ],
  });
}

function rebaselineDialog(ctx, row) {
  const candidate = {
    goalId: row.goalId,
    goalTitle: row.goalTitle,
    ownerName: row.ownerName,
    goalDueDate: row.goalDueDate,
    goalCreatedOn: null,
  };
  const lineOptions = [{
    value: row.lineKey,
    label: row.lineKey === GOAL_COMMITMENT_NO_LINE
      ? 'No reporting line — explicit owner declaration (no holder is inferred)'
      : `${row.lineLabel} — held by ${row.holderName} (the line this commitment occupies)`,
  }];
  const form = buildForm([
    ...commitmentFields(candidate, lineOptions, row),
    { type: 'divider', label: 'Why the promise is moving' },
    { name: 'reason', label: 'Reason', type: 'textarea', rows: 3, value: '', required: true, help: `Required, at least ${GOAL_COMMITMENT_LIMITS.reasonMin} characters. The predecessor is closed and kept as history in the same commit; the reason is what makes the sequence readable.` },
  ]);
  openModal({
    title: 'Re-baseline a commitment',
    description: `“${row.goalTitle}” · ${row.windowFrom} to ${row.windowTo} at ${share(row.effortShareH)} of one person. The successor is written and the predecessor closed in ONE atomic commit.`,
    size: 'lg',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'goal-commitment-rebaseline',
        onClick: () => {
          const values = form.getValues();
          submit(ctx, form, ctx.api.matrixGoalCommitmentRebaseline({
            commitmentId: row.commitmentId,
            windowFrom: values.windowFrom,
            windowTo: values.windowTo,
            effortShareH: values.effortShareH === '' ? null : Number(values.effortShareH),
            measureKey: values.measureKey || null,
            direction: values.direction || null,
            targetValue: values.targetValue || null,
            targetUnit: values.targetUnit || null,
            note: values.note || '',
            reason: values.reason,
          }), 'Commitment re-baselined; the predecessor is closed and kept as history.');
        },
      }, 'Re-baseline'),
    ],
  });
}

function releaseDialog(ctx, row) {
  const form = buildForm([{ name: 'reason', label: 'Why is this commitment released?', type: 'textarea', rows: 3, value: '', required: true, help: `Required, at least ${GOAL_COMMITMENT_LIMITS.reasonMin} characters. The commitment is kept as history and stops taking part in every comparison.` }]);
  openModal({
    title: `Release — “${row.goalTitle}”`,
    description: `${row.lineLabel} · ${row.windowFrom} to ${row.windowTo} at ${share(row.effortShareH)} of one person.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', { class: 'btn btn-danger', type: 'button', 'data-testid': 'goal-commitment-release', onClick: () => submit(ctx, form, ctx.api.matrixGoalCommitmentRelease({ commitmentId: row.commitmentId, reason: form.getValues().reason }), 'Commitment released; it is kept as history.') }, 'Release commitment'),
    ],
  });
}

function conventionsDialog(ctx, report) {
  const numeric = ['horizonDays', 'minOverlapDays', 'minGoals', 'magnitudeDivergencePct', 'askDueDays'];
  const form = buildForm([
    ...numeric.map((name) => ({
      name: GOAL_COMMITMENT_SETTING_KEYS[name],
      type: 'number',
      value: String(report.settings[GOAL_COMMITMENT_SETTING_KEYS[name]]),
      label: `${GOAL_COMMITMENT_SETTING_LABELS[name]} (${GOAL_COMMITMENT_BOUNDS[name][0]}–${GOAL_COMMITMENT_BOUNDS[name][1]})`,
    })),
    { name: GOAL_COMMITMENT_SETTING_KEYS.autoPropagate, type: 'checkbox', value: report.settings[GOAL_COMMITMENT_SETTING_KEYS.autoPropagate], label: GOAL_COMMITMENT_SETTING_LABELS.autoPropagate },
  ]);
  openModal({
    title: 'Re-declare goal-commitment conventions',
    description: 'A value outside its bounds is refused, never clamped.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'goal-commitment-conventions',
        onClick: () => {
          const values = form.getValues();
          const patch = Object.fromEntries(numeric.map((name) => [GOAL_COMMITMENT_SETTING_KEYS[name], Number(values[GOAL_COMMITMENT_SETTING_KEYS[name]])]));
          patch[GOAL_COMMITMENT_SETTING_KEYS.autoPropagate] = Boolean(values[GOAL_COMMITMENT_SETTING_KEYS.autoPropagate]);
          submit(ctx, form, ctx.api.matrixGoalCommitmentSetConventions(patch), 'Conventions re-declared.');
        },
      }, 'Save conventions'),
    ],
  });
}

function exportCsv(ctx, report) {
  const result = ctx.api.matrixGoalCommitmentCsvRows?.();
  if (!result?.ok) { toast(result?.error || 'The goal-commitment export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-matrix-goal-commitments-${report.today}.csv`,
    text: serializeCsv(GOAL_COMMITMENT_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
    mime: 'text/csv;charset=utf-8',
  });
  toast('Aggregate CSV downloaded — the same figures this screen printed.', 'good');
}

/* ------------------------------------------------------------------ pieces */

function statGrid(report) {
  const b = report.board;
  const attribution = b.attributionWithheld ? '—' : `${b.attributionPct}%`;
  return h('div', { class: 'grid grid-3', 'data-testid': 'goal-commitment-stats' },
    stat({ label: 'Declarations', value: num(b.commitmentsN), hint: `${b.liveN} live · ${b.noLineN} owed under no line · ${b.closedN} closed · ${b.unreachableN} unreachable` }),
    stat({ label: 'People compared', value: num(b.ownersComparedN), hint: `${b.ownersN} on the board · ${b.ownersInertN} on one line only · ${b.ownersUndeclaredN} with nothing declared under a line` }),
    stat({ label: 'Opposed targets', value: num(b.targetConflictN), hint: 'same declared measure, opposite directions, colliding windows', tone: b.targetConflictN ? 'bad' : '' }),
    stat({ label: 'Magnitude conflicts', value: num(b.magnitudeConflictN), hint: `${b.magnitudeUndeclaredN} aligned pair(s) lack a magnitude · ${b.magnitudeUnitMismatchN} unit mismatch(es)`, tone: b.magnitudeConflictN ? 'bad' : b.magnitudeUndeclaredN || b.magnitudeUnitMismatchN ? 'warn' : '' }),
    stat({ label: 'Colliding windows', value: num(b.dateOverlapN), hint: `${b.pairsN} pair(s) compared · ${b.sameLineN} one line’s own sequencing · ${b.singlePrincipalN} no second principal`, tone: b.dateOverlapN ? 'warn' : '' }),
    stat({ label: 'Over one person', value: num(b.capacityOvercommitN), hint: b.peakSumH === null ? 'no live commitment inside the horizon' : `peak ${share(b.peakSumH)} of one person on ${b.peakDay}`, tone: b.capacityOvercommitN ? 'bad' : '' }),
    stat({ label: 'Goals naming a line', value: attribution, hint: b.attributionWithheld ? b.attributionWithheldReason : `95% Wilson ${dash(b.attributionLowPct)}–${dash(b.attributionHighPct)}% · ${b.goalsUnattributedN} unattributed`, tone: b.attributionWithheld ? 'warn' : 'good' }),
  );
}

function commitmentTable(row) {
  return table({
    caption: `Commitments declared for ${row.personName}`,
    columns: [
      { key: 'goal', label: 'Goal' },
      { key: 'line', label: 'Owed under' },
      { key: 'holder', label: 'Declared by' },
      { key: 'window', label: 'Window (inclusive)' },
      { key: 'days', label: 'Days' },
      { key: 'effort', label: 'Effort' },
      { key: 'measure', label: 'Measure' },
      { key: 'target', label: 'Target magnitude' },
      { key: 'state', label: 'Standing' },
    ],
    rows: row.commitments.map((commitment) => ({
      goal: commitment.goalTitle,
      line: commitment.lineLabel,
      holder: commitment.holderName,
      window: `${commitment.windowFrom} → ${commitment.windowTo}`,
      days: num(commitment.windowDays),
      effort: share(commitment.effortShareH),
      measure: commitment.measureKey ? `${commitment.direction} “${commitment.measureKey}”` : 'not declared',
      target: commitment.targetValue ? `${commitment.targetValue} ${commitment.targetUnit}` : 'not declared',
      state: commitment.stateLabel,
    })),
    emptyMessage: 'No commitment has been declared for this person. Silence here is not compatibility — it is an absence, and it is printed as one.',
  });
}

function pairTable(row) {
  if (!row.pairsN) return h('p', { class: 'muted small' }, 'Fewer than two live commitments, so there is no pair to compare.');
  const shown = row.pairs.slice(0, GOAL_COMMITMENT_LIMITS.pairRowsShown);
  return h('div', { class: 'stack-sm' },
    table({
      caption: `Commitment pairs for ${row.personName}`,
      columns: [
        { key: 'verdict', label: 'Verdict' },
        { key: 'a', label: 'One line promised' },
        { key: 'b', label: 'The other line promised' },
        { key: 'overlap', label: 'Exact overlap' },
        { key: 'measure', label: 'Measure claim' },
        { key: 'magnitude', label: 'Target magnitude claim' },
      ],
      rows: shown.map((pair) => ({
        verdict: pair.verdictLabel,
        a: `${pair.aHolderName}: “${pair.aGoalTitle}”${pair.aDirection ? `, ${pair.aDirection}` : ''}`,
        b: `${pair.bHolderName}: “${pair.bGoalTitle}”${pair.bDirection ? `, ${pair.bDirection}` : ''}`,
        overlap: pair.overlapDays > 0 ? `${pair.overlapDays} day(s), ${pair.overlapFrom} → ${pair.overlapTo}` : 'no day in common',
        measure: pair.measureClaimLabel,
        magnitude: pair.magnitudeClaimLabel + (pair.verdict === 'magnitude-conflict'
          ? ` — ${pair.aTargetValue} ${pair.aTargetUnit} vs ${pair.bTargetValue} ${pair.bTargetUnit}; ${pair.magnitudeDivergencePct}% apart${pair.targetUnit ? ` · ${pair.targetUnit}` : ''}`
          : (pair.magnitudeDivergencePct === null ? '' : ` (${pair.magnitudeDivergencePct}% apart${pair.targetUnit ? ` · ${pair.targetUnit}` : ''})`)),
      })),
    }),
    row.pairsOmittedN ? h('p', { class: 'muted small' }, `${row.pairsOmittedN} further pair(s) are counted in the totals and not shown on this row.`) : null,
  );
}

function capacityBlock(row) {
  const c = row.capacity;
  return h('div', { class: 'stack-sm', 'data-testid': `goal-commitment-capacity-${row.personId}` },
    h('p', {},
      badge(c.verdictLabel, c.verdictTone),
      c.peakDay
        ? h('span', { class: 'muted small' }, ` Peak ${share(c.peakSumH)} of one person on ${c.peakDay}, against a basis of ${share(c.basisH)}${c.overByH !== null ? ` — over by ${share(c.overByH)}` : ''}. ${c.effectiveN} commitment(s) inside the horizon, ${c.elapsedN} already elapsed, ${c.beyondHorizonN} beyond it.`)
        : h('span', { class: 'muted small' }, ' No live commitment falls inside the declared horizon, so there is no peak to measure.')),
    c.lines.length
      ? table({
        caption: `Per-line capacity for ${row.personName}`,
        columns: [
          { key: 'line', label: 'Line' },
          { key: 'holder', label: 'Holder' },
          { key: 'given', label: 'Declared share of the person' },
          { key: 'promised', label: 'Peak it promised' },
          { key: 'over', label: 'Over by' },
          { key: 'verdict', label: 'Per-line verdict' },
        ],
        rows: c.lines.map((line) => ({
          line: line.lineLabel,
          holder: line.holderName,
          given: line.declaredShareH === null ? 'not declared' : share(line.declaredShareH),
          promised: `${share(line.peakSumH)} on ${dash(line.peakDay)}`,
          over: line.overByH === null ? '—' : share(line.overByH),
          verdict: line.verdictLabel,
        })),
      })
      : null,
    h('p', { class: 'muted small' }, c.verdictSays),
  );
}

function goalsBlock(row) {
  if (!row.goals.goalN) return null;
  return h('div', { class: 'stack-sm' },
    h('p', { class: 'muted small', 'data-testid': `goal-commitment-attribution-${row.personId}` },
      `${row.goals.declaredN} of ${row.goals.goalN} live goal(s) name a line; ${row.goals.unattributedN} name none and are NOT charged to the home line.`),
    row.goals.unattributedN
      ? table({
        caption: `Goals of ${row.personName} with no line declared`,
        columns: [{ key: 'goal', label: 'Goal' }, { key: 'state', label: 'Attribution' }],
        rows: row.goals.rows.filter((goal) => goal.state === 'unattributed').map((goal) => ({ goal: goal.goalTitle, state: 'no line declared' })),
      })
      : null,
  );
}

function ownerCard(ctx, row, report) {
  const canAct = typeof ctx?.api?.matrixGoalCommitmentRebaseline === 'function';
  const canRelease = typeof ctx?.api?.matrixGoalCommitmentRelease === 'function';
  // `no-line` is not comparable as a second principal, but it remains a live,
  // owner-controlled capacity declaration. Its re-baseline/release controls
  // must remain available so append-only history does not become a dead end.
  const actedOn = row.commitments.filter((commitment) => commitment.comparable || commitment.state === 'no-line');
  const flagged = row.commitments.filter((commitment) => commitment.flags.length);
  // Hoisted out of the card body: a spread inside a ternary inside a nested
  // argument list is where this file stopped parsing, and the actions read better
  // as a named list anyway.
  const commitmentActions = canAct && actedOn.length
    ? h('div', { class: 'row-actions' }, ...actedOn.map((commitment) => h('div', { class: 'row-actions-group' },
      h('button', { class: 'btn btn-small', type: 'button', 'data-testid': `goal-commitment-rebaseline-${commitment.commitmentId}`, onClick: () => rebaselineDialog(ctx, commitment) }, `Re-baseline “${commitment.goalTitle}”`),
      canRelease
        ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', 'data-testid': `goal-commitment-release-${commitment.commitmentId}`, onClick: () => releaseDialog(ctx, commitment) }, 'Release')
        : null,
    )))
    : null;
  const flagBanner = flagged.length
    ? banner({
      tone: 'warn',
      title: 'A declared window contradicts the goal’s own dates',
      body: `${flagged.map((commitment) => `“${commitment.goalTitle}”: ${commitment.flags.join(', ')}`).join(' · ')}. Printed, never repaired — the declaration is the record of what the line said.`,
    })
    : null;
  const crossLineConflict = row.verdict === 'target-conflict' || row.verdict === 'magnitude-conflict';
  const minOverlapDays = report?.settings?.[GOAL_COMMITMENT_SETTING_KEYS.minOverlapDays] ?? null;
  const routedPair = crossLineConflict
    ? row.pairs.find((pair) => pair.verdict === row.verdict && pair.overlapDays >= minOverlapDays)
    : null;
  const capacityHasNoLine = row.capacity.peakCommitments.some((entry) => entry.lineKey === GOAL_COMMITMENT_NO_LINE);
  const conflictBanner = crossLineConflict || row.verdict === 'capacity-overcommit'
    ? banner({
      tone: 'bad',
      title: row.verdict === 'target-conflict' ? 'A contradiction between two lines’ promises' : row.verdict === 'magnitude-conflict' ? 'Two lines promised incompatible target magnitudes' : 'A week fuller than one person',
      body: row.verdict === 'capacity-overcommit' && capacityHasNoLine
        ? `This exact capacity reading includes an explicit no-line declaration. It remains counted in the person’s peak, but ${GOAL_COMMITMENT_RULE_ID} records one identity-free observation rather than assigning that declaration to a named holder or filing a partial joint-apex ask.`
        : crossLineConflict && !routedPair
          ? `This pair is printed because its windows overlap, but its ${row.pairs.find((pair) => pair.verdict === row.verdict)?.overlapDays || 0} overlapping day(s) are below the declared ${minOverlapDays}-day automation threshold. ${GOAL_COMMITMENT_RULE_ID} files no ask for this pair yet; no owner is invented.`
          : row.apex.unique
            ? `${GOAL_COMMITMENT_RULE_ID} files ONE dated ask to ${row.apex.apexLabel}, the lowest joint apex of the lines involved. It is not filed against ${row.personName}, and it is never settled by scoring them.`
            : `${GOAL_COMMITMENT_RULE_ID} can find no single seat to ask, because ${row.apex.apexLabel}, so it records one identity-free observation and invents no owner.`,
    })
    : null;

  return card({
    title: `${row.personName} — ${row.verdictLabel}`,
    subtitle: `${GOAL_COMMITMENT_ADR} · ${row.linesN} active reporting line(s) · ${row.liveN} live commitment(s) · ${row.closedN} closed · ${row.unreachableN} unreachable`,
    attrs: { 'data-testid': `goal-commitment-owner-${row.personId}`, 'data-verdict': row.verdict },
    body: h('div', { class: 'stack' },
      badge(row.verdictLabel, row.verdictTone),
      h('p', { class: 'muted small' }, row.verdictSays),
      conflictBanner,
      !row.countsReconcile ? banner({ tone: 'warn', title: 'This row does not add up', body: row.countsReason }) : null,
      commitmentTable(row),
      flagBanner,
      pairTable(row),
      capacityBlock(row),
      goalsBlock(row),
      commitmentActions,
    ),
  });
}

function rollupsCard(report) {
  const holders = report.rollups.holders.map((row) => ({
    who: row.holderName,
    declared: String(row.declaredN),
    opposed: String(row.targetConflictN),
    magnitude: String(row.magnitudeConflictN),
    conflicts: String(row.conflictsN),
    overcommits: String(row.overcommitsN),
    people: String(row.peopleN),
  }));
  const apexes = report.rollups.apexes.map((row) => ({
    apex: row.apexName,
    opposed: String(row.targetConflictN),
    magnitude: String(row.magnitudeConflictN),
    conflicts: String(row.conflictsN),
    overcommits: String(row.overcommitsN),
    people: String(row.peopleN),
  }));
  return card({
    title: 'Who declared what, and where a conflict belongs',
    subtitle: 'Each printed cross-line pair conflict is counted once at its resolved joint apex; opposed directions and incompatible magnitudes stay separate. A single line’s own arithmetic is never escalated above that line.',
    body: h('div', { class: 'stack' },
      holders.length ? table({ caption: 'Line holders', columns: [{ key: 'who', label: 'Line holder' }, { key: 'declared', label: 'Commitments declared' }, { key: 'opposed', label: 'Opposed directions' }, { key: 'magnitude', label: 'Incompatible magnitudes' }, { key: 'conflicts', label: 'Total cross-line conflicts' }, { key: 'overcommits', label: 'Lines over their own share' }, { key: 'people', label: 'People touched' }], rows: holders }) : h('p', { class: 'muted small' }, 'No line holder has declared a commitment yet.'),
      apexes.length ? table({ caption: 'Joint apexes', columns: [{ key: 'apex', label: 'Lowest joint apex of the lines involved' }, { key: 'opposed', label: 'Opposed directions' }, { key: 'magnitude', label: 'Incompatible magnitudes' }, { key: 'conflicts', label: 'Total cross-line conflicts' }, { key: 'overcommits', label: 'Whole-person overcommits' }, { key: 'people', label: 'People' }], rows: apexes }) : null,
    ),
  });
}

function refusalsCard(report) {
  if (!report.refusals.length) return card({ title: 'What was refused, and why', body: h('p', { class: 'muted small' }, 'This read raised no refusal.') });
  return card({
    title: 'What was refused, and why',
    subtitle: `${report.board.refusalsN} refusal(s). Nothing here was dropped silently.`,
    body: table({
      caption: 'Refusals',
      columns: [{ key: 'key', label: 'Class' }, { key: 'count', label: 'Count' }, { key: 'reason', label: 'Reason' }],
      rows: report.refusals.map((row) => ({ key: row.key, count: String(row.count), reason: row.reason })),
    }),
  });
}

function boardPanel(ctx, report) {
  const b = report.board;
  return h('div', { class: 'stack' },
    card({
      title: 'The board and its separate claims',
      body: h('div', { class: 'stack' },
        statGrid(report),
        h('p', { class: 'muted small', 'data-testid': 'goal-commitment-claims' }, `Claims, printed separately: counts reconcile — ${claim(b.countsReconcile)}; printed figures are the computed figures — ${claim(b.figuresComplete)}. A collision between two promises and a week fuller than one person are different facts and are never collapsed into one word.`),
        b.figuresComplete ? null : banner({ tone: 'warn', title: 'The figures are not complete', body: b.claimReason || 'A read was refused.' }),
        b.targetConflictN ? banner({ tone: 'bad', title: `${b.targetConflictN} opposed-target conflict(s)`, body: 'Two lines have each committed the same person to opposite movement on the same declared measure. Neither promise can be kept by working harder, so one of them has to be withdrawn or re-dated — by the lines’ lowest joint apex, never by the person caught between them.' }) : null,
        b.magnitudeConflictN ? banner({ tone: 'bad', title: `${b.magnitudeConflictN} incompatible target-magnitude conflict(s)`, body: `Two lines named the same measure and direction in the same unit, but their declared values diverge at or above the ${report.settings[GOAL_COMMITMENT_SETTING_KEYS.magnitudeDivergencePct]}% floor. The reader uses exact scaled decimals; it never converts units or calls a missing target agreement.` }) : null,
        b.magnitudeUndeclaredN || b.magnitudeUnitMismatchN ? banner({ tone: 'warn', title: 'Some aligned targets cannot be compared', body: `${b.magnitudeUndeclaredN} aligned pair(s) omit an exact target value or unit, and ${b.magnitudeUnitMismatchN} use different units. Those are printed refusals — never compatible targets.` }) : null,
        b.capacityOvercommitN ? banner({ tone: 'bad', title: `${b.capacityOvercommitN} person(s) committed beyond one whole person`, body: `On the exact peak day the concurrent declared effort exceeds ${share(100)} of one person. The day, the sum, the basis and the excess are printed in exact integer hundredths.` }) : null,
        b.lineOvercommitN ? banner({ tone: 'warn', title: `${b.lineOvercommitN} line reading(s) exceed that line’s own declared share`, body: 'One line promised more of a person than it was given. Where the whole week still fits, that is one line’s own arithmetic and is asked of that holder — not escalated above them.' }) : null,
        b.goalsUnattributedN ? banner({ tone: 'warn', title: `${b.goalsUnattributedN} goal(s) name no line`, body: 'Their owner holds two or more active lines and no commitment names one, so they cannot be compared. They are NOT charged to the home line — that guess is the failure this register exists to refuse.' }) : null,
        b.ownersUndeclaredN ? banner({ tone: 'info', title: `${b.ownersUndeclaredN} person(s) on two or more lines with nothing declared`, body: 'The register prints the counts and claims nothing. An absence of declarations is not compatibility.' }) : null,
      ),
    }),
    typeof ctx?.api?.matrixGoalCommitmentDeclare === 'function'
      ? card({
        title: 'Declare a commitment',
        subtitle: 'One line’s promise about one shared person: the window, the effort in hundredths of one person, an optional measure and direction, and an optional exact target value plus unit.',
        body: h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'goal-commitment-open-declare', onClick: () => declareDialog(ctx) }, 'Declare a goal commitment'),
      })
      : null,
    report.owners.length
      ? h('div', { class: 'stack' }, ...report.owners.map((row) => ownerCard(ctx, row, report)))
      : emptyState({ title: 'No commitment has been declared', body: 'A commitment says what one reporting line’s goal consumes of one shared person. Until one is declared this register prints an honest empty board — it never infers a window from a goal’s due date, an effort from its key results, a measure from its title, or a line from the home reporting edge.' }),
    report.owners.length < b.ownersN
      ? h('p', { class: 'muted small' }, `${b.ownersN - report.owners.length} further person row(s) are counted in the totals and not shown here.`)
      : null,
    rollupsCard(report),
    refusalsCard(report),
  );
}

function methodPanel(ctx, report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Method and what it refuses',
      subtitle: `${GOAL_COMMITMENT_ADR} · ${GOAL_COMMITMENT_ENGINE_VERSION} · ${GOAL_COMMITMENT_RULE_ID}`,
      body: h('div', { class: 'stack' },
        h('figure', {},
          h('img', { src: DIAGRAM_URL, alt: 'Conceptual method diagram: one shared person stands at the centre with two reporting lines above them, each holding a dated commitment card with a window bar and an effort block; the two window bars overlap on a shared timeline, a measure axis shows the two lines pointing in opposite directions, and a capacity gauge shows the concurrent effort passing one whole person. An arrow routes the conflict upward to the lines’ lowest joint apex, never down to the person.', style: 'max-width:100%;height:auto;border-radius:8px;' }),
          h('figcaption', { class: 'muted small' }, 'Conceptual method diagram (generated asset) — not workspace data.')),
        h('ol', { class: 'muted small' }, ...report.method.map((step) => h('li', null, step))),
      ),
    }),
    card({
      title: 'Conventions in force',
      subtitle: 'Declared, printed and re-declarable — a value outside its bounds is refused, never clamped.',
      actions: typeof ctx?.api?.matrixGoalCommitmentSetConventions === 'function'
        ? [h('button', { class: 'btn btn-small', type: 'button', onClick: () => conventionsDialog(ctx, report) }, 'Re-declare conventions')]
        : [],
      body: h('div', { class: 'stack-sm' },
        table({ caption: 'Conventions', columns: [{ key: 'label', label: 'Convention' }, { key: 'value', label: 'Value' }, { key: 'detail', label: 'What it does' }], rows: report.conventions.map((row) => ({ label: row.label, value: String(row.value), detail: row.detail })) }),
        h('p', { class: 'muted small' }, `Automation switch ${report.settings[GOAL_COMMITMENT_SETTING_KEYS.autoPropagate] ? 'ON' : 'PAUSED'} — a pause governs every path, including an explicit scan.`),
        h('p', { class: 'muted small' }, `Capacity basis: ${share(100)} of one person, in the same integer hundredths a declared line share uses. A separately declared per-person commitment capacity does not exist in this workspace yet; until it does, every whole-person figure is printed against this basis and every per-line figure against that line’s own declared share.`),
      ),
    }),
    card({
      title: 'Declared directions',
      body: h('ul', { class: 'muted small' }, ...GOAL_COMMITMENT_DIRECTIONS.map((row) => h('li', null, h('strong', {}, `${row.label}. `), row.says))),
    }),
    card({
      title: 'Bodies of work',
      body: h('ul', { class: 'muted small' }, ...report.frameworks.map((row) => h('li', null, h('strong', {}, `${row.label}. `), row.detail))),
    }),
    card({
      title: 'What this register never does',
      body: h('ul', { class: 'muted small' },
        h('li', null, 'It never infers a window, effort, measure, direction, target value, target unit or unit conversion from a goal’s title, description or key results.'),
        h('li', null, 'It never charges an undeclared goal to the home line.'),
        h('li', null, 'It never scores a person, ranks a manager, or says one line’s need matters more than another’s.'),
        h('li', null, 'It never routes a conflict to the person being committed.'),
        h('li', null, 'It never repairs a window that contradicts the goal’s own dates — it prints the contradiction.'),
        h('li', null, `It never escalates a bare window collision. Only a contradiction or an arithmetic impossibility becomes an ask, and only at ${report.settings[GOAL_COMMITMENT_SETTING_KEYS.minOverlapDays]} or more overlapping days.`),
        h('li', null, `The direction vocabulary is closed (${GOAL_COMMITMENT_DIRECTION_KEYS.join(', ')}), so “not equal” IS opposed — including one line holding a measure steady while another moves it.`),
        h('li', null, `A same-direction magnitude comparison exists only for two declared values in the same declared unit. Their exact relative difference is compared with the declared ${report.settings[GOAL_COMMITMENT_SETTING_KEYS.magnitudeDivergencePct]}% floor; missing values and unit mismatches are printed as refusals.`),
      ),
    }),
  );
}

/* -------------------------------------------------------------------- page */

export function renderMatrixGoalCommitmentPanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  let report;
  if (typeof ctx?.api?.matrixGoalCommitmentReport === 'function') {
    const result = ctx.api.matrixGoalCommitmentReport();
    if (!result?.ok) {
      return card({ title: 'Cross-line goal commitments', body: banner({ tone: 'bad', title: 'Reading refused', body: result?.error || 'The goal-commitment reader could not run.' }) });
    }
    report = result.report;
  } else {
    report = buildGoalCommitments(state, { now, settings: state.settings || null });
  }
  const query = ctx?.query instanceof URLSearchParams ? ctx.query : (opts.query || null);
  const panel = panelFor(query);
  return h('div', { class: 'stack', 'data-testid': 'goal-commitment-panel' },
    pageHeader({
      eyebrow: 'Matrix management · ADR-0193 / ADR-0195',
      title: 'Cross-line goal commitments',
      subtitle: `Two lines can each commit the same person, reasonably, and neither can see the other’s promise. This register reads what each line declared — the window, effort, measure, direction and optional exact target magnitude — and reports exact collisions, opposed directions, incompatible same-unit targets and concurrent capacity. It never infers a target or converts units. ${GOAL_COMMITMENT_ADR} · CSV #145.`,
      actions: [
        typeof ctx?.api?.matrixGoalCommitmentBriefText === 'function'
          ? h('button', {
            class: 'btn btn-small btn-ghost', type: 'button', 'data-testid': 'goal-commitment-brief',
            onClick: () => {
              const result = ctx.api.matrixGoalCommitmentBriefText();
              if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
              openModal({ title: 'Goal-commitment brief', description: 'Generated from the same report as this screen — identity-free.', size: 'lg', body: h('pre', { class: 'brief-text', 'data-testid': 'goal-commitment-brief-text' }, result.text), footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')] });
            },
          }, 'Brief')
          : null,
        typeof ctx?.api?.matrixGoalCommitmentCsvRows === 'function'
          ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => exportCsv(ctx, report) }, 'Download CSV (aggregate-only)')
          : null,
        typeof ctx?.api?.matrixGoalCommitmentScan === 'function'
          ? h('button', { class: 'btn btn-small', type: 'button', 'data-testid': 'goal-commitment-scan', onClick: () => notify(ctx.api.matrixGoalCommitmentScan(), 'Goal-commitment scan complete — the register re-derived from the record.') }, 'Run scan now')
          : null,
      ].filter(Boolean),
    }),
    tabs({ items: PANELS.map((row) => ({ key: row.key, label: row.label })), active: panel, ariaLabel: 'Goal commitment panels', onSelect: (key) => ctx.navigate(`#/matrix?panel=${encodeURIComponent(key)}`) }),
    panel === 'method' ? methodPanel(ctx, report) : boardPanel(ctx, report),
    h('p', { class: 'muted small' }, `CSV scope ${GOAL_COMMITMENT_CSV_SCOPE}: aggregate rows only. The brief and the export are built from the same reader this screen renders. ${goalCommitmentBriefText(report).split('.')[0]}.`),
  );
}

export default renderMatrixGoalCommitmentPanel;
