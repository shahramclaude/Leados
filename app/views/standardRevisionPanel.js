/**
 * app/views/standardRevisionPanel.js — `#/standard-work?panel=revisions`, the
 * Standard-Work Revision Register (ADR-0237, Schema v192).
 *
 * "The walk moved from 07:00 to 06:30 on the 3rd. Who approved it, which text
 * it replaced, and did everyone who owes the walk know before it applied?"
 *
 * The view computes NOTHING. Every state, verdict, count and sentence is a
 * field of the report the reader returned. A routine's declared text and its
 * text in force are printed side by side, because the routine record keeps its
 * declared wording and a revised standard must never be read as the old one.
 * Two claims are printed apart: `countsReconcile` (the figures add up) and
 * `figuresComplete` (the reading covers the whole record this seat may see).
 */
import { h, buildForm, openModal, closeAllModals, toast } from '../ui/dom.js';
import { badge, banner, card, stat, table, emptyState } from '../ui/components.js';
import {
  STANDARD_REVISION_LIMITS,
  STANDARD_REVISION_METHOD,
  STANDARD_REVISION_FRAMEWORKS,
  STANDARD_REVISION_STATES,
  STANDARD_REVISION_VERDICTS,
  STANDARD_REVISION_BRIEF_STATES,
} from '../core/domain/standardRevisionRegistry.js';

const L = STANDARD_REVISION_LIMITS;

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

/** A refusal stays on the form, against the field that caused it. */
function finish(ctx, result, message, form = null) {
  if (!result?.ok) {
    if (form && result?.field && form.field(result.field)) form.setErrors({ [result.field]: result.error || '' });
    toast(result?.error || 'The standard-revision act was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  closeAllModals();
  refresh(ctx);
  return true;
}

const cancelButton = () => h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel');
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 86400000).toISOString().slice(0, 10);
const stateTone = (key) => STANDARD_REVISION_STATES.find((row) => row.key === key)?.tone || 'neutral';

/* ------------------------------------------------------------------ dialogs */

/** Step 1 of approval: which routine. Step 2 is the revision itself, for that routine only. */
function approveDialog(ctx) {
  const found = ctx.api.standardRevisionCandidates();
  if (!found?.ok) { toast(found?.error || 'Reading the candidates was refused.', 'bad'); return; }
  if (!found.routines.length) {
    toast('No routine on this seat is owed to a line you hold. A revision is approved by the holder of the line the routine is owed under.', 'warn');
    return;
  }
  const form = buildForm([
    {
      name: 'routineId', label: 'Which routine’s standard changes', type: 'select', required: true,
      options: found.routines.map((row) => ({ value: row.routineId, label: `${row.title} — owned by ${row.ownerName}, revision ${row.nextRevisionNo}` })),
      value: found.routines[0].routineId,
      help: 'You approve a change only to a routine owed under a line you hold. The owner of the standard cannot approve their own change.',
    },
  ]);
  openModal({
    title: 'Approve a revision of a standard',
    description: 'Step 1 of 2. The next step writes the new text, names who owes it, and sets the day it takes effect.',
    body: form.node ?? form,
    footer: [
      cancelButton(),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'srv-approve-next',
        onClick: () => {
          const routine = found.routines.find((row) => row.routineId === form.getValues().routineId);
          if (routine) approveFormDialog(ctx, routine);
        },
      }, 'Continue'),
    ],
  });
}

function approveFormDialog(ctx, routine) {
  const fields = [
    {
      name: 'standard', label: 'The new standard, written out in full', type: 'textarea', required: true, rows: 4, value: routine.currentStandard,
      help: `${L.standardMin}–${L.standardMax} characters. Start from the text in force and edit it. The previous text is kept on the record and cannot be typed over.`,
    },
    {
      name: 'changedStep', label: 'Which step changed', type: 'text', required: true, value: '',
      help: `${L.changedStepMin}–${L.changedStepMax} characters. Name the step, so a reader can find the change without comparing two long texts.`,
    },
    {
      name: 'basis', label: 'Why the standard changes', type: 'textarea', required: true, rows: 3, value: '',
      help: `${L.basisMin}–${L.basisMax} characters. A change with no reason is not a decision.`,
    },
    {
      name: 'effectiveOn', label: 'Takes effect on', type: 'date', required: true, value: routine.earliestEffectiveOn,
      help: `Between ${routine.earliestEffectiveOn} and ${routine.latestEffectiveOn}. Not back-dated, and it cannot take effect before the previous revision or after the routine ends.`,
    },
    {
      name: 'briefeeIds', label: 'Owed the new text', type: 'boolean-block', value: [routine.ownerId],
      options: routine.owedOptions.map((row) => ({ value: row.personId, label: row.personId === routine.ownerId ? `${row.name} (owner — always owed)` : row.name })),
      help: 'The owner is always owed the new text. Anyone else must report to the owner on a line you can see. Each person is listed once, however many lines they hold.',
    },
  ];
  const form = buildForm(fields);
  openModal({
    title: `Revise “${routine.title}”`,
    description: `Revision ${routine.nextRevisionNo}. Your name is recorded as the approver; the previous text is read from the record, not typed in.`,
    size: 'lg',
    body: form.node ?? form,
    footer: [
      cancelButton(),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'srv-approve-save',
        onClick: () => {
          form.clearErrors();
          const v = form.getValues();
          finish(ctx, ctx.api.standardRevisionApprove({
            routineId: routine.routineId, standard: v.standard, changedStep: v.changedStep, basis: v.basis,
            effectiveOn: v.effectiveOn, briefeeIds: v.briefeeIds,
          }), 'Revision approved and on the record. It takes effect on the day you named, and the people named are owed the new text until briefed.', form);
        },
      }, 'Approve revision'),
    ],
  });
}

/** Step 1 of briefing: which revision you approved. Step 2 is the people, dated. */
function briefDialog(ctx) {
  const found = ctx.api.standardRevisionCandidates();
  if (!found?.ok) { toast(found?.error || 'Reading the candidates was refused.', 'bad'); return; }
  if (!found.awaiting.length) {
    toast('No revision you approved is waiting for a briefing.', 'warn');
    return;
  }
  const form = buildForm([
    {
      name: 'revisionId', label: 'Which revision you approved', type: 'select', required: true,
      options: found.awaiting.map((row) => ({ value: row.revisionId, label: `${row.title} — revision ${row.revisionNo}, in force from ${row.effectiveOn}, ${row.unbriefed.length} not yet briefed` })),
      value: found.awaiting[0].revisionId,
    },
  ]);
  openModal({
    title: 'Record a briefing',
    description: 'Step 1 of 2. Only the approver of a revision records who was briefed on it.',
    body: form.node ?? form,
    footer: [
      cancelButton(),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'srv-brief-next',
        onClick: () => {
          const row = found.awaiting.find((entry) => entry.revisionId === form.getValues().revisionId);
          if (row) briefFormDialog(ctx, row, found.today);
        },
      }, 'Continue'),
    ],
  });
}

function briefFormDialog(ctx, row, today) {
  const form = buildForm([
    {
      name: 'personIds', label: 'Who was briefed', type: 'boolean-block', value: [],
      options: row.unbriefed.map((person) => ({ value: person.personId, label: person.name })),
      help: 'Only people not yet briefed are listed. A first briefing on the record stands.',
    },
    {
      name: 'briefedOn', label: 'Briefed on', type: 'date', required: true, value: today,
      help: 'The day the briefing happened. It cannot be in the future or before the revision was approved.',
    },
  ]);
  openModal({
    title: `Briefed on “${row.title}” — revision ${row.revisionNo}`,
    body: form.node ?? form,
    footer: [
      cancelButton(),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'srv-brief-save',
        onClick: () => {
          form.clearErrors();
          const v = form.getValues();
          finish(ctx, ctx.api.standardRevisionBrief({ revisionId: row.revisionId, personIds: v.personIds, briefedOn: v.briefedOn }),
            'Briefing recorded on the revision.', form);
        },
      }, 'Record briefing'),
    ],
  });
}

/* ------------------------------------------------------------------- render */

function revisionTable(report) {
  return table({
    caption: 'Every revision in view with its state, briefing verdict, prior and new text',
    emptyMessage: 'No revision is on the record for the routines this seat can see.',
    columns: [
      { key: 'routine', label: 'Routine', render: (row) => h('div', null, h('strong', null, row.routineTitle), h('div', { class: 'small muted' }, `${row.ownerName} · revision ${row.revisionNo}`)) },
      { key: 'effective', label: 'Approved · takes effect', render: (row) => h('div', null, h('div', null, `Approved ${row.approvedOn}`), h('div', null, `In force from ${row.effectiveOn}`), h('div', { class: 'small muted' }, `by ${row.approverName || '—'}`)) },
      { key: 'state', label: 'State', render: (row) => badge(row.stateLabel, stateTone(row.state)) },
      { key: 'verdict', label: 'Briefing verdict', render: (row) => badge(row.verdictLabel, row.verdictTone || 'neutral') },
      { key: 'owed', label: 'Briefed / owed', render: (row) => (row.owedN ? h('span', null, `${row.briefedN} / ${row.owedN}${row.coveragePct === null ? '' : ` (${row.coveragePct}%)`}`) : h('span', { class: 'muted' }, 'not owed')) },
      {
        key: 'text', label: 'Change',
        render: (row) => h('details', null,
          h('summary', null, row.changedStep),
          h('p', { class: 'small' }, h('strong', null, 'Previous text: '), row.priorStandard),
          h('p', { class: 'small' }, h('strong', null, 'New text: '), row.standard),
          h('p', { class: 'small muted' }, `Why: ${row.basis}`),
          h('ul', { class: 'small' }, ...row.briefees.map((person) => h('li', null,
            person.visible ? `${person.name} — ` : 'A person outside your reach — ',
            person.label, person.briefedOn ? ` (${person.briefedOn})` : ''))),
        ),
      },
    ],
    rows: report.revisions.map((row) => ({ ...row, className: row.verdict === 'briefing-overdue' ? 'row-attention' : '' })),
  });
}

function routineTable(report) {
  return table({
    caption: 'Every routine with a revision: the declared text beside the text in force',
    emptyMessage: 'No routine in view has a revision.',
    columns: [
      { key: 'title', label: 'Routine', render: (row) => h('div', null, h('strong', null, row.title), h('div', { class: 'small muted' }, `${row.ownerName}${row.retired ? ' · retired' : ''}`)) },
      { key: 'declared', label: 'Declared text (on the routine record)', render: (row) => h('span', { class: 'small' }, row.declaredStandard) },
      {
        key: 'inForce', label: 'Text in force today',
        render: (row) => h('div', null,
          h('span', { class: 'small' }, row.inForceStandard),
          h('div', { class: 'small muted' }, row.inForceRevisionNo ? `revision ${row.inForceRevisionNo}` : 'the declared text'),
          row.inForceDiffers ? badge('differs from the declared text', 'warn') : null),
      },
      { key: 'pending', label: 'Pending', render: (row) => (row.pendingN ? badge(`${row.pendingN} not yet in force`, 'warn') : h('span', { class: 'muted' }, '—')) },
    ],
    rows: report.routines,
  });
}

export function renderStandardRevisionPanel(ctx) {
  const result = ctx.api.standardRevisionReport();
  if (!result?.ok) {
    return banner({ tone: 'warn', title: 'The revision register was refused', body: result?.error || 'The read was refused.' });
  }
  const { report } = result;
  const candidates = ctx.api.standardRevisionCandidates();
  const can = candidates?.ok ? candidates : { routines: [], awaiting: [] };
  const t = report.totals;
  const reconcileBadge = t.countsReconcile
    ? badge('figures add up', 'good', 'Every printed partition sums to the rows it was counted from')
    : badge('figures do not add up', 'bad', 'A printed partition does not sum to its rows — the figures are withheld until they do');
  const completeBadge = t.figuresComplete
    ? badge('whole record', 'neutral', 'This reading covers every revision on the record')
    : badge('seat reading — incomplete', 'warn', 'Some of the record is outside this seat or withheld; the reading says so');

  return h('div', { class: 'stack', 'data-testid': 'standard-revisions-panel' },
    h('div', { class: 'row-actions' },
      can.routines.length ? h('button', { class: 'btn btn-primary small', type: 'button', 'data-testid': 'srv-approve', onClick: () => approveDialog(ctx) }, 'Approve a revision') : null,
      can.awaiting.length ? h('button', { class: 'btn small', type: 'button', 'data-testid': 'srv-brief', onClick: () => briefDialog(ctx) }, `Record a briefing (${can.awaiting.length})`) : null,
      reconcileBadge,
      completeBadge,
    ),
    t.revisionsN === 0 && t.withheldRoutinesN === 0
      ? emptyState({ title: 'No standard has been revised on this record.', body: 'A revision appears here only when the holder of the line a routine is owed under approves a change to its written text.' })
      : null,
    t.revisionsN ? h('div', { class: 'stat-grid' },
      stat({ label: 'Revisions in view', value: t.revisionsN, hint: `${t.routinesN} routine(s) · ${t.listedN} listed` }),
      stat({ label: 'Awaiting effect', value: t.pendingN, tone: t.pendingN ? 'warn' : '', hint: 'Approved, not yet in force' }),
      stat({ label: 'In force', value: t.inForceN, hint: `${t.supersededN} superseded · ${t.lapsedN} lapsed` }),
      stat({ label: 'Briefed', value: t.coveragePct === null ? '—' : `${t.coveragePct}%`, hint: t.owedN ? `${t.briefedN} of ${t.owedN} owed people briefed` : 'No one owed yet' }),
      stat({ label: 'Not briefed while in force', value: t.overdueN, tone: t.overdueN ? 'bad' : '', hint: `${t.dueN} still due before their day` }),
    ) : null,
    report.incomplete.length ? banner({ tone: 'warn', title: 'What this reading does not cover', body: h('ul', null, ...report.incomplete.map((line) => h('li', null, line))) }) : null,
    t.revisionsN ? card({ title: 'Revisions', subtitle: 'Each revision, its state, who owed the new text and what was done about it', body: revisionTable(report) }) : null,
    t.routinesN ? card({ title: 'Routines — declared and in force', subtitle: 'The record keeps the declared text. The text in force is what the routine is held to today.', body: routineTable(report) }) : null,
    card({
      title: 'Method',
      subtitle: 'What is declared, what is derived, what is refused, and the standard the register is built to',
      body: h('div', { class: 'stack-sm' },
        h('ol', { class: 'stack-sm' }, ...STANDARD_REVISION_METHOD.map((line) => h('li', null, line))),
        h('div', { class: 'stack-sm' }, ...STANDARD_REVISION_FRAMEWORKS.map((framework) => h('div', null, h('strong', null, framework.name), h('p', { class: 'small muted' }, framework.says)))),
        h('p', { class: 'small muted' }, `Briefing states: ${STANDARD_REVISION_BRIEF_STATES.map((row) => row.label).join(' · ')}.`),
        h('p', { class: 'small muted' }, `Verdicts: ${STANDARD_REVISION_VERDICTS.map((row) => row.label).join(' · ')}.`),
      ),
    }),
  );
}

export default renderStandardRevisionPanel;
